/**
 * 会话核心域（创建/列表/详情/文件树/消息/中断/压缩/树/trace/fork/checkpoints/回滚）（工单 R-F③ 域拆分：自 routes.ts 机械搬移，路由与行为零变化）。
 */
import type { FastifyPluginCallback } from 'fastify'
import { mkdirSync, writeFileSync } from 'node:fs'
import type { Dirent } from 'node:fs'
import { buildTrace, resolveInRoot } from '@spark/engine'
import { join } from 'node:path'
import { readdir, readFile, stat } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import type { CheckpointDto } from '@spark/protocol'
import type { RoutesOptions } from './shared.js'
import { notFound, parseOr400, validationError } from '../errors.js'
import { toDto, requireHandle, IdParams, CreateSessionBody, ListSessionsQuery, SessionDetailQuery, SendMessageBody, ForkBody, RollbackParams, FsQuerySchema, FsTreeQuerySchema, FS_LIST_LIMIT, treeToDto, ArchiveBody, DeleteSessionBody, AttachmentFileParams } from './shared.js'

export const registerSessionRoutes: FastifyPluginCallback<RoutesOptions> = (app, opts) => {
  const { engine } = opts

  app.post('/api/sessions', async (req, reply) => {
    const body = parseOr400(CreateSessionBody, req.body)
    const handle = await engine.createSession({
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.model !== undefined ? { model: body.model } : {}),
      ...(body.cwd !== undefined ? { cwd: body.cwd } : {}),
    })
    return reply.code(201).send(toDto(engine, handle.meta))
  })

  app.get('/api/sessions', async (req, reply) => {
    const query = parseOr400(ListSessionsQuery, req.query)
    const all = await engine.listSessions({
      ...(query.archived !== undefined ? { archived: query.archived } : {}),
    }) // 已按 updatedAt 倒序
    let start = 0
    if (query.cursor !== undefined) {
      const idx = all.findIndex((m) => m.id === query.cursor)
      if (idx === -1) {
        return notFound(reply)
      }
      start = idx + 1
    }
    return reply.send(all.slice(start, start + query.limit).map((m) => toDto(engine, m)))
  })

  app.get('/api/sessions/:id', async (req, reply) => {
    const { id } = parseOr400(IdParams, req.params)
    const query = parseOr400(SessionDetailQuery, req.query)
    const handle = await requireHandle(engine, id)
    // 事件分页（工单 9.3）：before 游标过滤 + limit 升序尾部切片；
    // 两参缺省 = 现状全量（缺省行为不变红线）
    let events = handle.events()
    if (query.before !== undefined) {
      const before = query.before
      events = events.filter((e) => e.seq !== undefined && e.seq < before)
    }
    if (query.limit !== undefined) {
      events = events.slice(-query.limit)
    }
    return reply.send({ ...toDto(engine, handle.meta), events })
  })

  /**
   * GET /api/sessions/:id/fs?path=（工单 10.53）：@ 文件路径补全的目录列举。
   * path = 相对会话 cwd 的部分路径，末段作前缀过滤，列举其父目录。硬边界经 resolveInRoot：
   * 越出 cwd（如 ../）或目录不存在一律如实空清单（补全 UI 不报错打断输入，且不泄露 cwd 外任何项）。
   */
  /** GET /api/sessions/:id/fs/tree?path=：递归文件树（工单 12.5；深度 ≤4、条目 ≤500、目录优先） */
  app.get('/api/sessions/:id/fs/tree', async (req, reply) => {
    const { id } = parseOr400(IdParams, req.params)
    const query = parseOr400(FsTreeQuerySchema, req.query)
    const handle = await requireHandle(engine, id)
    const absRoot = resolveInRoot(handle.meta.cwd, query.path === '' ? '.' : query.path)
    const entries: { name: string; path: string; isDir: boolean }[] = []
    let truncated = false
    const SKIP = new Set(['node_modules', '.git', 'dist', 'build'])
    const walk = async (abs: string, rel: string, depth: number): Promise<void> => {
      if (depth > 4 || truncated) return
      const dirents = await readdir(abs, { withFileTypes: true })
      dirents.sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      for (const d of dirents) {
        if (truncated) return
        if (d.name.startsWith('.')) continue
        const relPath = rel === '' ? d.name : rel + '/' + d.name
        if (d.isDirectory()) {
          if (SKIP.has(d.name)) continue
          if (entries.length >= 500) {
            truncated = true
            return
          }
          entries.push({ name: d.name, path: relPath, isDir: true })
          await walk(join(abs, d.name), relPath, depth + 1)
        } else if (d.isFile()) {
          if (entries.length >= 500) {
            truncated = true
            return
          }
          entries.push({ name: d.name, path: relPath, isDir: false })
        }
      }
    }
    try {
      const info = await stat(absRoot)
      if (info.isDirectory()) await walk(absRoot, query.path, 1)
    } catch (err) {
      // 越界（resolveInRoot 在 requireHandle 后才可能抛——此处 stat ENOENT 即空树）
      if (err instanceof Error && err.message.startsWith('E_PATH_OUTSIDE')) throw err
      return reply.send({ path: query.path, entries: [], truncated: false })
    }
    return reply.send({ path: query.path, entries, truncated })
  })

  app.get('/api/sessions/:id/fs', async (req, reply) => {
    const { id } = parseOr400(IdParams, req.params)
    const query = parseOr400(FsQuerySchema, req.query)
    const handle = await requireHandle(engine, id)
    const rel = query.path.replace(/\\/g, '/') // Windows 反斜杠归一为 posix（@ token 用 /）
    const slash = rel.lastIndexOf('/')
    const dirRel = slash === -1 ? '' : rel.slice(0, slash)
    const prefix = slash === -1 ? rel : rel.slice(slash + 1)
    const base = dirRel === '' ? '' : `${dirRel}/`
    let dirents: Dirent[]
    try {
      // 硬边界（§6.4）：resolveInRoot 越出 cwd 抛 E_PATH_OUTSIDE → 落 catch 回空清单
      const absDir = resolveInRoot(handle.meta.cwd, dirRel === '' ? '.' : dirRel)
      dirents = await readdir(absDir, { withFileTypes: true })
    } catch {
      return reply.send({ path: dirRel, entries: [] })
    }
    const entries = dirents
      .filter((d) => d.name.startsWith(prefix))
      .map((d) => ({ name: d.name, path: `${base}${d.name}`, isDir: d.isDirectory() }))
      .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
      .slice(0, FS_LIST_LIMIT)
    return reply.send({ path: dirRel, entries })
  })

  app.post('/api/sessions/:id/messages', async (req, reply) => {
    const { id } = parseOr400(IdParams, req.params)
    const body = parseOr400(SendMessageBody, req.body)
    const handle = await requireHandle(engine, id)
    // 三态直通：HTTP 只表达"已受理"，不等 turn 结果（§7.2）
    return reply.send(
      await handle.send(body.text, body.delivery, body.expectedTurnId),
    )
  })

  app.post('/api/sessions/:id/interrupt', async (req, reply) => {
    const { id } = parseOr400(IdParams, req.params)
    const handle = await requireHandle(engine, id)
    await handle.interrupt() // idle 时同样 200（幂等，§7.2）
    return reply.send({ ok: true })
  })

  app.post('/api/sessions/:id/compact', async (req, reply) => {
    const { id } = parseOr400(IdParams, req.params)
    const handle = await requireHandle(engine, id)
    // 等压缩完成再返回：started/completed 经 SSE 直播（§5.8.5 手动 /compact）
    await handle.compact()
    return reply.send({ ok: true })
  })

  app.get('/api/sessions/:id/tree', async (req, reply) => {
    const { id } = parseOr400(IdParams, req.params)
    return reply.send(treeToDto(await engine.treeOf(id)))
  })

  /**
   * GET /api/sessions/:id/trace（工单 13.7 / V2-11 / doc/07 H27）：回合级链路聚合。
   * 纯从 durable 事件推导（buildTrace 单遍 O(n)），不加埋点、不写任何状态。
   */
  app.get('/api/sessions/:id/trace', async (req, reply) => {
    const { id } = parseOr400(IdParams, req.params)
    const handle = await requireHandle(engine, id)
    return reply.send(buildTrace(id, handle.events()))
  })

  app.post('/api/sessions/:id/fork', async (req, reply) => {
    const { id } = parseOr400(IdParams, req.params)
    const body = parseOr400(ForkBody, req.body)
    const handle = await engine.forkSession(id, body.fromEventId)
    return reply.code(201).send(toDto(engine, handle.meta))
  })

  app.get('/api/sessions/:id/checkpoints', async (req, reply) => {
    const { id } = parseOr400(IdParams, req.params)
    // commit sha 不上线（CheckpointDto §4.5.1：checkpointId/turnId/createdAt/files）
    const rows: CheckpointDto[] = (await engine.checkpointsOf(id)).map((r) => ({
      checkpointId: r.checkpointId,
      turnId: r.turnId,
      createdAt: r.createdAt,
      files: r.files,
    }))
    return reply.send(rows)
  })

  app.post('/api/sessions/:id/checkpoints/:cid/rollback', async (req, reply) => {
    const { id, cid } = parseOr400(RollbackParams, req.params)
    // 回滚后 seq 回退：响应只回 meta，前端走 GET /:id 全量重放（§4.5 表注）
    const handle = await engine.rollbackToCheckpoint(id, cid)
    return reply.send(toDto(engine, handle.meta))
  })

  // ---- 图片附件（工单 12.2a：上传 → attachments/ 平铺存储 → GET 取图） ----

  const MIME_EXT: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
  }
  const EXT_MIME: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
  }

  /** POST /api/sessions/:id/attachments：raw 图片字节（≤10MB，image/* 白名单）→ {id,mime,size,name} */
  app.post('/api/sessions/:id/attachments', { bodyLimit: 11 * 1024 * 1024 }, async (req, reply) => {
    const { id } = parseOr400(IdParams, req.params)
    await requireHandle(engine, id) // 会话存在性（未加载先 resume——与其他 :id 端点同纪律）
    const mime = req.headers['content-type'] ?? ''
    const ext = MIME_EXT[mime]
    if (ext === undefined) {
      throw new Error('E_ATTACHMENT_TYPE: 仅支持 png/jpeg/gif/webp 图片')
    }
    const body = req.body as Buffer | undefined
    if (body === undefined || body.length === 0) {
      throw validationError('请求体为空——请携带图片字节', undefined)
    }
    if (body.length > 10 * 1024 * 1024) {
      throw new Error('E_ATTACHMENT_TOO_LARGE: 图片超过 10MB 上限')
    }
    const nameHeader = req.headers['x-file-name']
    const name = typeof nameHeader === 'string' ? decodeURIComponent(nameHeader) : 'image.' + ext
    const attachmentId = randomUUID().replaceAll('-', '')
    const dir = join(engine.dataRoot, 'attachments')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, attachmentId + '.' + ext), body)
    const file = attachmentId + '.' + ext
    return reply.code(201).send({ id: attachmentId, file, mime, size: body.length, name })
  })

  /** GET /api/attachments/:file：白名单文件名取图（缩略渲染数据源） */
  app.get('/api/attachments/:file', async (req, reply) => {
    const { file } = parseOr400(AttachmentFileParams, req.params)
    const ext = file.split('.').pop() ?? ''
    const mime = EXT_MIME[ext]
    if (mime === undefined) return notFound(reply)
    const abs = join(engine.dataRoot, 'attachments', file)
    try {
      const bytes = await readFile(abs)
      return reply.type(mime).send(bytes)
    } catch {
      return notFound(reply)
    }
  })

  // ---- 会话归档与两段式删除（工单 12.4 / V2-23） ----

  /** PUT /api/sessions/:id/archive {archived: boolean}：归档/恢复（返回更新后的 DTO） */
  app.put('/api/sessions/:id/archive', async (req, reply) => {
    const { id } = parseOr400(IdParams, req.params)
    const body = parseOr400(ArchiveBody, req.body)
    const meta = await engine.archiveSession(id, body.archived)
    return reply.send(toDto(engine, meta))
  })

  /** DELETE /api/sessions/:id {confirm: true}：两段式删除（JSONL 移入 trash 可找回；缺 confirm 400） */
  app.delete('/api/sessions/:id', async (req, reply) => {
    const { id } = parseOr400(IdParams, req.params)
    const body = parseOr400(DeleteSessionBody, req.body)
    if (body.confirm !== true) {
      throw validationError('删除需显式确认（confirm: true）', undefined)
    }
    await engine.deleteSession(id)
    return reply.code(204).send()
  })

}
