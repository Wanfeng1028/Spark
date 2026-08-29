/**
 * 配对鉴权（阶段九工单 9.1 / ADR D24）：设备仓 + 配对码服务 + 环回判定纯函数。
 * - 设备仓 ~/.spark/devices.json（secrets 纪律同 7.1：原子写 + 0600，坏文件拒载不带病运行）；
 * - token 只存哈希（sha256）——任何 API 都不回传已签发 token；
 * - 配对码 6 位数字 60s 有效，进程内存单码（新码替换旧码；生命周期短不落盘）；
 * - 鉴权启用态 = devices.json 存在（非环回启动护栏与兑换前置都以它为准，fail-closed）。
 */
import { randomBytes, randomInt, createHash } from 'node:crypto'
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { z } from 'zod'
import { ConfigError } from '@spark/engine'

/** 短码有效期（D24：60s） */
export const PAIR_CODE_TTL_MS = 60_000

/** token 哈希（存盘与比对唯一形态；明文仅兑换响应一次性回传） */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** 监听地址是否环回（0.0.0.0/:: 绑全接口按非环回算——可接受远端连接） */
export function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '::1' || /^127\./.test(host)
}

/** 对端地址是否环回（含 IPv4 映射形态 ::ffff:127.0.0.1） */
export function isLoopbackRemote(addr: string | undefined): boolean {
  if (addr === undefined) return false
  return addr === '::1' || addr === '127.0.0.1' || addr === '::ffff:127.0.0.1' || /^127\./.test(addr)
}

/**
 * 启动绑定护栏（ADR D24 绑定纪律，可测纯函数；违规抛 ConfigError，调用方拒启动）：
 * - SPARK_HOST 仅允许环回覆盖（桌面壳 sidecar 固定 127.0.0.1）；
 * - 非环回监听必须经 spark.json `server.host` 显式配置；
 * - 非环回且配对鉴权未启用（~/.spark/devices.json 不存在）→ 拒绝（fail-closed）。
 * 缺省环回 + 无鉴权红线形态永远放行。
 */
export function resolveBindTarget(
  envHost: string | undefined,
  configHost: string,
  authEnabled: boolean,
): string {
  if (envHost !== undefined && !isLoopbackHost(envHost)) {
    throw new ConfigError(
      `SPARK_HOST 仅允许环回地址（收到 "${envHost}"）——非环回监听请在 ~/.spark/spark.json 显式配置 server.host（ADR D24）`,
    )
  }
  const host = envHost ?? configHost
  if (!isLoopbackHost(host) && !authEnabled) {
    throw new ConfigError(
      `非环回监听（${host}）须先启用配对鉴权——请先以缺省环回模式启动并在 web 设置页“设备与配对”添加设备（生成 ~/.spark/devices.json），再配置非环回 server.host（ADR D24 fail-closed）`,
    )
  }
  return host
}

const deviceSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  tokenHash: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  lastSeenAt: z.number().int().nonnegative(),
})

export interface DeviceRecord {
  id: string
  name: string
  tokenHash: string
  createdAt: number
  lastSeenAt: number
}

const devicesFileSchema = z.strictObject({
  version: z.literal(1),
  devices: z.array(deviceSchema),
})

/** 最近活跃写盘节流粒度（鉴权命中每次触发，1min 内不落盘） */
const TOUCH_THROTTLE_MS = 60_000

export class DeviceStore {
  private readonly path: string
  private readonly devices = new Map<string, DeviceRecord>()
  private readonly byTokenHash = new Map<string, DeviceRecord>()

  constructor(path: string) {
    this.path = path
    if (!existsSync(path)) return
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(path, 'utf8')) as unknown
    } catch (err) {
      throw new ConfigError(
        `devices.json 不是合法 JSON：${err instanceof Error ? err.message : String(err)}`,
      )
    }
    const parsed = devicesFileSchema.safeParse(raw)
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('; ')
      throw new ConfigError(`devices.json 校验失败：${issues}`)
    }
    for (const d of parsed.data.devices) {
      this.devices.set(d.id, d)
      this.byTokenHash.set(d.tokenHash, d)
    }
  }

  /** 鉴权是否已启用（= 文件存在；非环回启动护栏与兑换前置的判定依据） */
  get enabled(): boolean {
    return existsSync(this.path)
  }

  list(): DeviceRecord[] {
    return [...this.devices.values()]
  }

  findByTokenHash(hash: string): DeviceRecord | undefined {
    return this.byTokenHash.get(hash)
  }

  add(name: string, tokenHash: string, now: number): DeviceRecord {
    const record: DeviceRecord = {
      id: `dev_${randomBytes(6).toString('hex')}`,
      name,
      tokenHash,
      createdAt: now,
      lastSeenAt: now,
    }
    this.devices.set(record.id, record)
    this.byTokenHash.set(tokenHash, record)
    this.persist()
    return record
  }

  /** 撤销（不存在返回 undefined——路由层 404）；返回记录供 SSE 按 tokenHash 断连 */
  remove(id: string): DeviceRecord | undefined {
    const record = this.devices.get(id)
    if (record === undefined) return undefined
    this.devices.delete(id)
    this.byTokenHash.delete(record.tokenHash)
    this.persist()
    return record
  }

  /** 最近活跃刷新（节流写盘：命中即更新内存，超 1min 才落盘） */
  touch(hash: string, now: number): void {
    const record = this.byTokenHash.get(hash)
    if (record === undefined) return
    if (now - record.lastSeenAt < TOUCH_THROTTLE_MS) return
    record.lastSeenAt = now
    this.persist()
  }

  /** 落盘即启用（首次添加设备时写空表，devices.json 从此存在） */
  persist(): void {
    const doc = {
      version: 1 as const,
      devices: [...this.devices.values()],
    }
    const tmp = `${this.path}.tmp`
    writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`, { mode: 0o600 })
    try {
      chmodSync(tmp, 0o600)
    } catch {
      // Windows 无 POSIX chmod（secrets/store.ts 同判：平台差异尽力而为，不 fail）
    }
    renameSync(tmp, this.path)
  }
}

export interface RedeemResult {
  token: string
  device: DeviceRecord
}

/** 配对码服务：签发/兑换 6 位短码（进程内存，不落盘；兑换即建设备换长效 token） */
export class PairService {
  private active: { code: string; expiresAt: number } | null = null

  constructor(
    private readonly store: DeviceStore,
    private readonly now: () => number = Date.now,
  ) {}

  /** 签发新码（替换在途旧码）；副作用：落盘启用鉴权（环回下"添加设备"即显式开启） */
  createCode(): { code: string; expiresAt: number } {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    const issued = { code, expiresAt: this.now() + PAIR_CODE_TTL_MS }
    this.active = issued
    this.store.persist()
    return issued
  }

  /** 兑换：鉴权未启用/码不符/过期一律拒绝（fail-closed；码类拒绝同错误码不泄露原因） */
  redeem(code: string, name: string): RedeemResult {
    if (!this.store.enabled) throw new Error('E_PAIR_DISABLED: 配对鉴权未启用')
    if (this.active === null || this.active.code !== code || this.now() > this.active.expiresAt) {
      throw new Error('E_PAIR: 配对码无效或已过期')
    }
    this.active = null // 一次性：兑换后即失效（扫码/手输同码重放拒绝）
    const token = `spk_${randomBytes(24).toString('base64url')}`
    const device = this.store.add(name, hashToken(token), this.now())
    return { token, device }
  }
}
