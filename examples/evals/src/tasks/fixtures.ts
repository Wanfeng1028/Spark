/**
 * 任务级 eval 场景集——fixture 仓库生成器（阶段十三工单 13.1）：
 * 每场景一个临时 fixture 仓库（预置源码+测试），判分函数对文件/内容做确定性断言。
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'

export interface FixtureRepo {
  root: string
  /** 相对路径写文件（自动建父目录；内容一律 utf8） */
  write(rel: string, content: string): void
  /** 相对路径读文件（判分用；不存在返回 undefined） */
  read(rel: string): string | undefined
}

/** 生成临时 fixture 仓库（调用方负责 rmSync 清理） */
export function makeFixtureRepo(prefix: string): FixtureRepo {
  const root = mkdtempSync(join(tmpdir(), prefix))
  const repo: FixtureRepo = {
    root,
    write(rel: string, content: string): void {
      const abs = join(root, rel)
      const dir = abs.slice(0, abs.lastIndexOf(sep)) || root
      mkdirSync(dir, { recursive: true })
      writeFileSync(abs, content, 'utf8')
    },
    read(rel: string): string | undefined {
      try {
        return readFileSync(join(root, rel), 'utf8')
      } catch {
        return undefined
      }
    },
  }
  return repo
}

/** 预置一个最小可检索的示例仓：两个模块 + 一个测试 + README */
export function seedSampleRepo(repo: FixtureRepo): void {
  repo.write(
    'src/calc.ts',
    [
      'export function add(a: number, b: number): number {',
      '  return a + b',
      '}',
      '',
      'export function div(a: number, b: number): number {',
      '  if (b === 0) throw new Error("E_DIV_ZERO: 除数不能为零")',
      '  return a / b',
      '}',
      '',
    ].join('\n'),
  )
  repo.write(
    'src/format.ts',
    ['export function slugify(s: string): string {', "  return s.trim().toLowerCase().replaceAll(' ', '-')", '}', ''].join('\n'),
  )
  repo.write(
    'test/calc.test.ts',
    [
      "import { test } from 'node:test'",
      "import { strict as assert } from 'node:assert'",
      "import { add } from '../src/calc.ts'",
      '',
      "test('add', () => {",
      '  assert.equal(add(2, 2), 4)',
      '})',
      '',
    ].join('\n'),
  )
  repo.write('README.md', '# sample-repo\n\n示例 fixture 仓库（eval 任务场景用）。\n')
}
