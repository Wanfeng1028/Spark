/**
 * sidecar env 注入链路单测（工单 19.31 / V2-06 桌面半边）：桌面设置里的自定义 CA 路径
 * → sidecar 子进程 NODE_EXTRA_CA_CERTS 的真实形状——配置值覆盖继承值、空值不注入、
 * 其余 sidecar 必需键（ELECTRON_RUN_AS_NODE/SPARK_PORT/SPARK_HOST/SPARK_WEB_DIST）不受影响。
 */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { loadDesktopConfig } from '../src/notify.js'
import { buildSidecarEnv } from '../src/sidecar-env.js'

const CLEAN_BASE: NodeJS.ProcessEnv = { PATH: '/usr/bin', HOME: '/home/u' }
/** 从终端带 NODE_EXTRA_CA_CERTS 启动桌面应用的形态：env 里已有继承值 */
const INHERITED_BASE: NodeJS.ProcessEnv = { ...CLEAN_BASE, NODE_EXTRA_CA_CERTS: '/inherited/ca.pem' }

function envOf(nodeExtraCaCerts: string | null, baseEnv: NodeJS.ProcessEnv = CLEAN_BASE) {
  return buildSidecarEnv({ baseEnv, nodeExtraCaCerts, port: 4399, webDist: '/repo/apps/web/dist' })
}

describe('buildSidecarEnv（desktop.json certificates → NODE_EXTRA_CA_CERTS）', () => {
  test('配置了路径 → 注入该值', () => {
    expect(envOf('/etc/certs/company-ca.pem').NODE_EXTRA_CA_CERTS).toBe('/etc/certs/company-ca.pem')
  })

  test('配置值优先于继承的同名 env（桌面设置是显式意图）', () => {
    expect(envOf('/configured/ca.pem', INHERITED_BASE).NODE_EXTRA_CA_CERTS).toBe('/configured/ca.pem')
  })

  test('未配置（null）→ 不设该键；继承值原样保留', () => {
    expect('NODE_EXTRA_CA_CERTS' in envOf(null)).toBe(false)
    expect(envOf(null, INHERITED_BASE).NODE_EXTRA_CA_CERTS).toBe('/inherited/ca.pem')
  })

  test('空串与纯空白 = 未配置 → 不设该键（继承值仍保留）', () => {
    expect('NODE_EXTRA_CA_CERTS' in envOf('')).toBe(false)
    expect('NODE_EXTRA_CA_CERTS' in envOf('   ')).toBe(false)
    expect(envOf('', INHERITED_BASE).NODE_EXTRA_CA_CERTS).toBe('/inherited/ca.pem')
  })

  test('路径首尾空白裁掉后注入', () => {
    expect(envOf('  /etc/certs/company-ca.pem  ').NODE_EXTRA_CA_CERTS).toBe('/etc/certs/company-ca.pem')
  })

  test('sidecar 启动契约的其余键不变，且不改动传入的 baseEnv', () => {
    const env = envOf('/etc/certs/company-ca.pem')
    expect(env.ELECTRON_RUN_AS_NODE).toBe('1')
    expect(env.SPARK_PORT).toBe('4399')
    expect(env.SPARK_HOST).toBe('127.0.0.1')
    expect(env.SPARK_WEB_DIST).toBe('/repo/apps/web/dist')
    expect(env.PATH).toBe('/usr/bin')
    expect(env.HOME).toBe('/home/u')
    expect(CLEAN_BASE.NODE_EXTRA_CA_CERTS).toBeUndefined()
  })

  test('真链路：desktop.json 里的路径 → loadDesktopConfig → sidecar env', () => {
    const dir = mkdtempSync(join(tmpdir(), 'spark-sidecar-'))
    const p = join(dir, 'desktop.json')
    writeFileSync(p, '{"certificates":{"nodeExtraCaCerts":"/etc/certs/company-ca.pem"}}', 'utf8')
    const cfg = loadDesktopConfig(p)
    const env = buildSidecarEnv({
      baseEnv: CLEAN_BASE,
      nodeExtraCaCerts: cfg.certificates.nodeExtraCaCerts,
      port: 4318,
      webDist: '/repo/apps/web/dist',
    })
    expect(env.NODE_EXTRA_CA_CERTS).toBe('/etc/certs/company-ca.pem')
  })
})
