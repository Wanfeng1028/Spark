/**
 * 会话索引维护器（工单 R-D 第②刀：自 engine.ts 拆出）——SessionIndex 句柄的
 * 生命周期与降级纪律单点：打开失败 / 写失败置降级（JSONL 恒为权威，主流程
 * 不受影响）；关闭后增量写全部短路（shutdown 时序纪律）。
 * 维护器不持有会话仓储——boot 重建的磁盘扫描经 rebuild(scan) 注入。
 */
import { join } from 'node:path'
import type { SessionId } from '@spark/protocol'
import { SessionIndex, type SessionIndexRow } from './index.js'
import type { SparkLogger } from '../logger.js'
import type { SessionMeta } from '../engine-types.js'

function metaToRow(m: SessionMeta): SessionIndexRow {
  return {
    id: m.id,
    title: m.title,
    model: m.model,
    cwd: m.cwd,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    lastSeq: m.lastSeq,
  }
}

export class SessionIndexMaintainer {
  private index: SessionIndex | null
  private broken = false
  private closed = false

  constructor(root: string, private readonly logger: SparkLogger) {
    try {
      this.index = new SessionIndex(join(root, 'index.db'))
    } catch (err) {
      this.logger.error('session.index.open.error', { err })
      this.broken = true
      this.index = null
    }
  }

  /** boot 重建：磁盘扫描 → 全量写入（对齐 JSONL 权威）；已关闭（shutdown 先至）则跳过 */
  async rebuild(scan: () => Promise<SessionMeta[]>): Promise<void> {
    if (this.index === null || this.closed) return
    const rows = await scan()
    this.index.rebuild(rows.map(metaToRow))
  }

  /** durable 增量：会话水位推进（bus 钩子） */
  touch(id: SessionId, seq: number, time: number): void {
    if (this.index === null || this.broken || this.closed) return
    try {
      this.index.touch(id, seq, time)
    } catch (err) {
      this.disable(err, 'session.index.touch.error')
    }
  }

  /** durable 增量：标题落定（session.title 事件） */
  setTitle(id: SessionId, title: string): void {
    if (this.index === null || this.broken || this.closed) return
    try {
      this.index.setTitle(id, title)
    } catch (err) {
      this.disable(err, 'session.index.title.error')
    }
  }

  /** 装载点 upsert：以内存 meta 全量覆盖索引行 */
  upsert(meta: SessionMeta): void {
    if (this.index === null || this.broken || this.closed) return
    try {
      this.index.upsert(metaToRow(meta))
    } catch (err) {
      this.disable(err, 'session.index.upsert.error')
    }
  }

  /** 索引驱动列表（listSessions 数据源）：不可用 → null（调用方降级磁盘扫描） */
  list(q?: string): SessionIndexRow[] | null {
    if (this.index === null || this.broken || this.closed) return null
    return this.index.list(q)
  }

  /** 索引标题查询（搜索命中行标题填充）：不可用 / 查失败 → 空串 */
  titleOf(id: SessionId): string {
    if (this.index === null || this.closed) return ''
    try {
      return this.index.titleOf(id) ?? ''
    } catch (err) {
      this.logger.warn('search.title.error', { sid: id, err })
      return ''
    }
  }

  /** 索引写失败：置降级标记并落结构化日志——主流程不受影响（JSONL 权威） */
  disable(err: unknown, msg: string): void {
    if (this.broken) return
    this.broken = true
    this.logger.error(msg, { err })
  }

  /** shutdown 收尾：防迟到重建写库撞已关闭句柄；closed 置位后增量写全部短路 */
  close(): void {
    if (this.index === null || this.closed) return
    try {
      this.index.close()
    } catch (err) {
      this.logger.warn('session.index.close.error', { err })
    }
    this.closed = true
  }
}
