/**
 * 敏感文件硬防线单测（doc/14 #3.6；AGENTS §2.0 安全第一）：
 * 判定矩阵 = .env 族 / SSH 私钥 / 云凭证段 / 证书扩展 / 备份变体 / 豁免名单 / 误报护栏。
 * 判定面宁窄勿宽：漏报 = 泄密（不可恢复），误报 = 用户手动操作（可恢复）——
 * 断言表同时护住两侧：该拒的必拒、不该拒的必须放行（防"越防越宽"漂移）。
 */
import { describe, expect, it } from 'vitest'
import { assertNotSensitive, isSensitiveFile } from '../src/tools/sensitive-path.js'
import { resolve } from 'node:path'

describe('isSensitiveFile：命中面（该拒的必拒）', () => {
  it('.env 族精确名', () => {
    for (const p of ['.env', '.env.local', '.env.production', 'project/.env.development']) {
      expect(isSensitiveFile(p), p).toBe(true)
    }
  })

  it('SSH 私钥名与目录段', () => {
    for (const p of ['id_rsa', 'deploy/id_ed25519', '.ssh/id_rsa', '.ssh/config', 'home/.aws/credentials', '.gcp/x.json', '.kube/config']) {
      expect(isSensitiveFile(p), p).toBe(true)
    }
  })

  it('证书/密钥扩展与凭据杂项', () => {
    for (const p of ['server.pem', 'client.key', 'cert.p12', 'store.jks', 'vault.kdbx', '.npmrc', '.netrc', '.git-credentials']) {
      expect(isSensitiveFile(p), p).toBe(true)
    }
  })

  it('备份变体即真值副本（.env.bak / id_rsa.old / server.pem.orig）', () => {
    for (const p of ['.env.bak', 'id_rsa.old', 'server.pem.orig', 'creds.pem.save', 'db.p12.tmp']) {
      expect(isSensitiveFile(p), p).toBe(true)
    }
  })

  it('绝对路径与 Windows 形态同样命中（resolve 归一后判定）', () => {
    expect(isSensitiveFile(resolve('.env'))).toBe(true)
    expect(isSensitiveFile(resolve('creds/keys/id_ed25519'))).toBe(true)
  })
})

describe('isSensitiveFile：放行面（不该拒的必须放——误报护栏）', () => {
  it('豁免名单：模板与公钥', () => {
    for (const p of ['.env.example', '.env.sample', '.env.template', 'host.pub', 'id_ed25519.pub', 'cert.pem.example']) {
      expect(isSensitiveFile(p), p).toBe(false)
    }
  })

  it('普通文件不误伤', () => {
    for (const p of ['src/index.ts', 'README.md', 'package.json', '.gitignore', 'docs/env-guide.md', 'keys.md', 'notes.key.md']) {
      expect(isSensitiveFile(p), p).toBe(false)
    }
  })
})

describe('assertNotSensitive：工具消费入口', () => {
  it('敏感路径抛 E_SENSITIVE（消息含文件名与人话）', () => {
    expect(() => assertNotSensitive('.env')).toThrow(/^E_SENSITIVE:/)
    expect(() => assertNotSensitive('.ssh/id_rsa')).toThrow(/敏感凭据/)
  })

  it('普通路径不抛（透传）', () => {
    expect(() => assertNotSensitive('src/index.ts')).not.toThrow()
  })
})
