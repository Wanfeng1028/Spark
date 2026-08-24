/**
 * SSE 端点（doc/02 §7.3 / §4.6）：GET /api/event?sessionId&since。
 * 回放：带 sessionId+since 时先按序补发该会话 seq>since 的 durable 事件（opencode 语义）；
 * sessionId 省略 → 全局直播不回放（Sidebar 状态点）。帧统一 event: message，type 在 payload。
 * 背压：raw.write 返回 false → handler 返回 false 暂停订阅（bus 环形缓冲），
 * 'drain' 事件恢复续传。心跳 15s；连接关闭清理；优雅退出发 bye 帧后断（§7.1）。
 */
import type { ServerResponse } from 'node:http'
import type { FastifyPluginCallback } from 'fastify'
import fp from 'fastify-plugin'
import { z } from 'zod'
import { SessionIdSchema } from '@spark/protocol'
import type { SparkEventEnvelope } from '@spark/protocol'
import type { Engine } from '@spark/engine'
import { sendError, validationError } from './errors.js'

export interface SseOptions {
  engine: Engine
  /** 心跳间隔（缺省 15s；测试注入缩短） */
  heartbeatMs?: number
}

declare module 'fastify' {
  interface FastifyInstance {
    /** 优雅退出用：全部活跃 SSE 连接发 bye 帧并断开（§7.1 序列第 1 步） */
    sseCloseAll(): void
  }
}

const Query = z.object({
  sessionId: SessionIdSchema.optional(),
  since: z.coerce.number().int().nonnegative().optional(),
})

function frame(e: SparkEventEnvelope): string {
  return `event: message\ndata: ${JSON.stringify(e)}\n\n`
}

const ssePlugin: FastifyPluginCallback<SseOptions> = (app, opts) => {
  const { engine } = opts
  const heartbeatMs = opts.heartbeatMs ?? 15_000
  const clients = new Set<ServerResponse>()

  app.decorate('sseCloseAll', () => {
    for (const res of clients) {
      res.write('event: bye\ndata: {}\n\n')
      res.end()
    }
  })

  app.get('/api/event', async (req, reply) => {
    const parsed = Query.safeParse(req.query)
    if (!parsed.success) {
      return sendError(req, reply, validationError('参数校验失败', parsed.error.issues))
    }
    const { sessionId, since } = parsed.data

    // 回放目标会话必须存在（未加载先 resume——与 GET /api/sessions/:id 同路径）
    let events: (() => SparkEventEnvelope[]) | undefined
    if (sessionId !== undefined) {
      try {
        const handle = engine.getSession(sessionId) ?? (await engine.resumeSession(sessionId))
        events = () => handle.events()
      } catch (err) {
        return sendError(req, reply, err)
      }
    }

    reply.hijack() // 响应由本端点 raw 接管（长连接流）
    const res = reply.raw
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      'X-Content-Type-Options': 'nosniff',
    })
    clients.add(res)
    // writeHead 不会立即发包（首个 write 才刷头）——先写注释帧让客户端立刻拿到响应头
    res.write(': connected\n\n')

    // 回放去重水位：快照写入与订阅派发间的在途 durable 事件按 seq 跳过。
    // 仅回放模式（sessionId+since 同时给出）启用；全局/纯直播无快照，无重复可去
    let watermark: number | null =
      sessionId !== undefined && since !== undefined ? since : null
    const write = (chunk: string): boolean => res.write(chunk)
    const writeEvent = (e: SparkEventEnvelope): boolean => {
      if (watermark !== null && e.seq !== undefined) {
        if (e.seq <= watermark) return true
        watermark = e.seq
      }
      return write(frame(e))
    }

    const sub = engine.subscribe((e) => {
      const ok = writeEvent(e)
      return ok ? undefined : false // 背压：缓冲满暂停订阅，drain 恢复
    }, sessionId !== undefined ? { sessionId } : undefined)
    res.on('drain', () => sub.resume())

    // 回放：先写快照（seq>since 的 durable，按 seq 升序）再直播——订阅先于快照建立，
    // 在途事件由 writeEvent 的 seq 水位去重，不丢不重
    if (events !== undefined && since !== undefined) {
      for (const e of events()) writeEvent(e)
    }

    const heartbeat = setInterval(() => {
      write(': heartbeat\n\n')
    }, heartbeatMs)

    req.raw.on('close', () => {
      clearInterval(heartbeat)
      sub.unsubscribe()
      clients.delete(res)
    })
  })
}

// fastify-plugin 破封装：sseCloseAll 装饰到根实例（index.ts 优雅退出调用）
export const registerSse = fp(ssePlugin, { name: 'spark-sse' })
