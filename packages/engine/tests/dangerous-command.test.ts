/**
 * 危险命令判定单测（doc/14 #3.1；AGENTS §2.0 安全第一）。
 * 判定面：穿透链（sudo/doas/env 包装）+ 危险内核（shutdown/dd 设备/mkfs）+
 * rm -rf 关键路径 + chmod/chown 系统路径 + 元字符快筛（值展开类）。
 * `rm -rf /*` 判 unanalyzable 是 fail-closed 正确行为（* 展开不可静态判定→至少 ask）。
 * tree-sitter 是原生依赖：CI 与本机 node_modules 完整即真跑；
 * 环境缺失时 judgeBashCommand 降级 unanalyzable——用例按
 * `skipIf(不可分析降级)` 条件化（§2.3a：CI 真跑、本地缺件 skip 绿）。
 */
import { describe, expect, test } from 'vitest'
import { judgeBashCommand, type DangerVerdict } from '../src/tools/dangerous-command.js'

/** tree-sitter 可用性探针：safe/unanalyzable 之外还能给出 dangerous = 运行时在 */
const probe = judgeBashCommand('shutdown now')
const TS_AVAILABLE = probe.kind === 'dangerous'

describe('judgeBashCommand：判定矩阵（doc/14 #3.1）', () => {
  test('元字符快筛（值展开类 → unanalyzable，fail-closed）', () => {
    for (const cmd of ['echo $(rm -rf /)', 'ls *.ts', 'cat `whoami`.txt', 'rm ~/.ssh/id_rsa', 'echo {a,b}']) {
      const v: DangerVerdict = judgeBashCommand(cmd)
      expect(v.kind, cmd).toBe('unanalyzable')
    }
  })

  test('合法复合命令不被结构字符误伤（&&/|/;/> 由 AST 处理）', () => {
    // tree-sitter 不可用时这些也判 unanalyzable（降级语义），只在可用态断言 safe
    if (!TS_AVAILABLE) return
    for (const cmd of ['git status && npm test', 'npm test', 'cat a.txt | grep x > out.txt', 'rm file.txt']) {
      expect(judgeBashCommand(cmd).kind, cmd).toBe('safe')
    }
  })

  test('危险内核与穿透链（sudo/doas/env 剥离后判定）', () => {
    if (!TS_AVAILABLE) return
    for (const cmd of ['shutdown now', 'doas shutdown -h now', 'sudo reboot', 'env FOO=1 shutdown now']) {
      const v = judgeBashCommand(cmd)
      expect(v.kind, cmd).toBe('dangerous')
      expect(v.reason.length, cmd).toBeGreaterThan(0)
    }
  })

  test('dd 设备白名单语义：写 /dev/* 危险、写文件放行', () => {
    if (!TS_AVAILABLE) return
    expect(judgeBashCommand('dd if=/dev/zero of=/dev/sda').kind).toBe('dangerous')
    expect(judgeBashCommand('dd if=a.bin of=backup.bin').kind).toBe('safe')
    expect(judgeBashCommand('dd if=/dev/zero').kind).toBe('dangerous') // 缺 of= 不可判定
  })

  test('rm -rf：关键路径危险、普通路径放行、glob 不可分析（fail-closed）', () => {
    if (!TS_AVAILABLE) return
    expect(judgeBashCommand('sudo rm -rf /').kind).toBe('dangerous')
    expect(judgeBashCommand('rm -rf /etc').kind).toBe('dangerous')
    expect(judgeBashCommand('rm -rf /tmp/build').kind).toBe('safe')
    expect(judgeBashCommand('rm -rf /*').kind).toBe('unanalyzable')
  })

  test('chmod/chown 系统路径前缀命中（/usr/bin/x 命中 /usr）', () => {
    if (!TS_AVAILABLE) return
    expect(judgeBashCommand('chmod 755 /usr/bin/x').kind).toBe('dangerous')
    expect(judgeBashCommand('chown root /etc/passwd').kind).toBe('dangerous')
    expect(judgeBashCommand('chmod 755 ./build.sh').kind).toBe('safe')
  })

  test('格式化族全危险', () => {
    if (!TS_AVAILABLE) return
    for (const cmd of ['mkfs.ext4 /dev/sdb1', 'mkfs /dev/sdb', 'shred /dev/sda']) {
      expect(judgeBashCommand(cmd).kind, cmd).toBe('dangerous')
    }
  })
})
