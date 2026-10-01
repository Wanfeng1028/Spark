/**
 * @-mention 文件/目录上下文注入（CK-15，出处 Gemini CLI atCommandProcessor）：
 * 用户消息里的 `@path` 记号在引擎侧展开为内容注入——文件全文 / 目录浅树摘要，
 * 以显式标注块追加在原文之后（通道取舍 = user.message 扩展：surface 纪律天然
 * 成立——模型可见的注入就在 durable 的 user.message 里，不新增事件面）。
 *
 * 边界与限额：
 * - 路径硬边界：resolveInRoot（cwd 外的 @token 原样保留不展开——模型可自行用
 *   read 工具尝试，越界拒绝语义不变）；
 * - 单文件 32KB / 总量 96KB 上限，超限截断 + 标注（不静默剪）；二进制（NUL）跳过；
 * - 记号形态：`(?:^|\s)@<非空白串>`——句中邮箱（a@b.com）不命中（@ 前须空白/行首）；
 * - 文件不存在 → 原样保留（禁假状态：不注入空内容假装成功）。
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { resolveInRoot } from './tools/definition.js'

/** 单文件注入上限（字节；超出截断 + 标注） */
export const MENTION_FILE_LIMIT = 32 * 1024
/** 单条消息注入总量上限（字节；超出后剩余 @token 不再展开） */
export const MENTION_TOTAL_LIMIT = 96 * 1024
/** 目录摘要的深度与条目上限 */
const TREE_DEPTH = 2
const TREE_ENTRIES = 50

/** @token 记号（@ 前须行首或空白——不误吞邮箱） */
const MENTION_RE = /(?:^|(?<=\s))@([^\s@][^\s@]*)/g

export interface MentionExpansion {
  text: string
  /** 成功注入的路径（相对 cwd）——测试与走查断言用 */
  injected: string[]
}

export async function expandMentions(
  text: string,
  cwd: string,
  io: {
    readFile: (abs: string) => Promise<Buffer>
    listDir: (abs: string) => Promise<string[]>
  },
): Promise<MentionExpansion> {
  const tokens = [...text.matchAll(MENTION_RE)].map((m) => m[1] ?? '')
  if (tokens.length === 0) return { text, injected: [] }
  const blocks: string[] = []
  const injected: string[] = []
  let budget = MENTION_TOTAL_LIMIT
  for (const token of tokens) {
    if (budget <= 0) break
    let abs: string
    try {
      abs = resolveInRoot(cwd, token)
    } catch {
      continue // cwd 外：原样保留（硬边界语义不因 mention 改变）
    }
    let st
    try {
      st = await stat(abs)
    } catch {
      continue // 不存在：原样保留（禁假状态）
    }
    if (st.isFile()) {
      const rendered = await renderFile(abs, token, budget, io)
      if (rendered !== null) {
        blocks.push(rendered.block)
        budget -= rendered.bytes
        injected.push(token)
      }
    } else if (st.isDirectory()) {
      const rendered = await renderTree(abs, token, budget, io)
      if (rendered !== null) {
        blocks.push(rendered.block)
        budget -= rendered.bytes
        injected.push(token)
      }
    }
  }
  if (blocks.length === 0) return { text, injected: [] }
  return { text: `${text}\n\n${blocks.join('\n\n')}`, injected }
}

async function renderFile(
  abs: string,
  token: string,
  budget: number,
  io: { readFile: (abs: string) => Promise<Buffer> },
): Promise<{ block: string; bytes: number } | null> {
  let bytes: Buffer
  try {
    bytes = await io.readFile(abs)
  } catch {
    return null // 读失败（权限/竞态删除）：原样保留
  }
  if (bytes.subarray(0, 8000).includes(0)) return null // 二进制：不注入
  const cap = Math.min(MENTION_FILE_LIMIT, budget)
  const text = bytes.subarray(0, cap).toString('utf8')
  const truncated = bytes.length > cap
  const body = truncated
    ? `${text}\n…[@mention 截断：文件 ${bytes.length} 字节，仅注入前 ${cap} 字节]…`
    : text
  return { block: `[@${token}]\n${body}`, bytes: Math.min(bytes.length, cap) }
}

async function renderTree(
  abs: string,
  token: string,
  budget: number,
  io: { listDir: (abs: string) => Promise<string[]> },
): Promise<{ block: string; bytes: number } | null> {
  const lines: string[] = []
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > TREE_DEPTH || lines.length >= TREE_ENTRIES) return
    let names: string[]
    try {
      names = await io.listDir(dir)
    } catch {
      return
    }
    for (const name of names.slice(0, TREE_ENTRIES - lines.length)) {
      const rel = relative(abs, join(dir, name))
      let isDir = false
      try {
        isDir = (await stat(join(dir, name))).isDirectory()
      } catch {
        continue
      }
      lines.push(isDir ? `${rel}/` : rel)
      if (isDir) await walk(join(dir, name), depth + 1)
    }
  }
  await walk(abs, 1)
  if (lines.length === 0) return null
  const header = `[@${token} 目录树（深度 ${TREE_DEPTH}，上限 ${TREE_ENTRIES} 条）]`
  const body = lines.join('\n')
  if (body.length > budget) return null
  return { block: `${header}\n${body}`, bytes: body.length }
}

/** 引擎接线用默认 io（cwd 边界外由 resolveInRoot 前置拒） */
export function defaultMentionIo(): {
  readFile: (abs: string) => Promise<Buffer>
  listDir: (abs: string) => Promise<string[]>
} {
  return {
    readFile: (abs) => readFile(abs),
    listDir: (abs) => readdir(abs).then((names) => names.sort()),
  }
}
