/**
 * MockTransport 静态夹具（工单 R-E④ 自 mock.ts 外置：纯数据，零行为）。
 * 测试（tests/mock-transport.test.ts）只依赖回放层，不触及本文件。
 */
import type { AuditEntryDto, CommandDto, ModelsDto, SessionId } from '@spark/protocol'
import { BUILTIN_COMMANDS } from '@spark/protocol'

/** 供 createSession/fork 等生成 id 的共享随机串（Date36+random36） */
export function mockRandom(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
}

  /** mock 目录（引擎 PROVIDER_CATALOG 子集 + 一家自定义；DTO 永不含 key 值） */
export const MOCK_MODELS: ModelsDto = {
  providers: [
    {
      id: 'deepseek',
      label: 'DeepSeek',
      builtin: true,
      configured: true,
      baseUrl: 'https://api.deepseek.com/v1',
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      hasKey: true,
      api: 'openai-completions',
    },
    {
      id: 'openai',
      label: 'OpenAI',
      builtin: true,
      configured: false,
      baseUrl: 'https://api.openai.com/v1',
      apiKeyEnv: null,
      hasKey: false,
      api: 'openai-completions',
    },
    {
      id: 'anthropic',
      label: 'Anthropic',
      builtin: true,
      configured: false,
      baseUrl: 'https://api.anthropic.com',
      apiKeyEnv: null,
      hasKey: false,
      api: 'anthropic-messages',
    },
    {
      id: 'ollama-local',
      label: 'ollama-local',
      builtin: false,
      configured: true,
      baseUrl: 'http://127.0.0.1:11434/v1',
      apiKeyEnv: null,
      hasKey: false,
      api: 'openai-completions',
    },
  ],
  models: [
    { provider: 'deepseek', model: 'deepseek-chat', contextWindow: 65536 },
    { provider: 'deepseek', model: 'deepseek-reasoner', contextWindow: 65536 },
    { provider: 'ollama-local', model: 'qwen3:8b', contextWindow: 32768 },
  ],
  defaultModel: { provider: 'deepseek', model: 'deepseek-chat', contextWindow: 65536 },
}

  // ---- 命令注册表（工单 7.4 / 10.18 对等演示：内置词表 = 协议描述符单一来源 + mock 自定义命令） ----

export const MOCK_COMMANDS: readonly CommandDto[] = [
  // 内置词表（工单 10.18：描述符随行下发，四端同源；不再本地平行维护）
  ...BUILTIN_COMMANDS.map((c) => ({ ...c })),
  { name: 'review', description: '审查当前工作区改动（mock 自定义命令）', kind: 'prompt' },
]

/** 审计演示条目（listAudit 数据源；时间相对 now，会话字段随当前场景） */
export function auditSeed(now: number, sid: SessionId): AuditEntryDto[] {
  const h = 3_600_000
  return     [
      {
        time: now - 48 * h,
        kind: 'permission.rule',
        actor: 'user',
        result: 'applied',
        op: 'add',
        effect: 'allow',
        action: 'Bash',
        resource: 'npm test:*',
        source: 'settings-ui',
      },
      {
        time: now - 30 * h,
        kind: 'permission.decision',
        actor: 'system',
        result: 'deny',
        sessionId: sid,
        tool: 'Bash',
        action: 'bash',
        resource: 'rm -rf node_modules',
        source: 'rule:user',
      },
      {
        time: now - 6 * h,
        kind: 'permission.decision',
        actor: 'user',
        result: 'allow',
        sessionId: sid,
        tool: 'Write',
        action: 'write',
        resource: 'src/index.ts',
        source: 'reply:once',
      },
      {
        time: now - 3 * h,
        kind: 'session.rollback',
        actor: 'user',
        result: 'ok',
        sessionId: sid,
        checkpointId: 'ckpt-mock-1',
        source: 'checkpoint',
      },
      {
        time: now - h,
        kind: 'permission.decision',
        actor: 'system',
        result: 'allow',
        sessionId: sid,
        tool: 'Read',
        action: 'read',
        resource: 'package.json',
        source: 'rule:preset',
      },
    ]
}
