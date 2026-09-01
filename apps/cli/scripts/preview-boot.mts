// Boot 头部预览器（工单 10.32 伴随工具）：不连 server、不进 TUI，直接渲染 BootHeader
// 一帧供视觉走查——`pnpm -C apps/cli exec tsx scripts/preview-boot.mts [columns]`。
// slice/models 为预览桩（cwd 取当前目录、模型取参数或缺省桩），仅此脚本是假数据，
// 生产 BootHeader 数据面不变（禁假状态纪律不受影响）。
import React from 'react'
import { render } from 'ink-testing-library'
import { BootHeader } from '../src/components/BootHeader.js'
import type { ModelsDto, SessionSlice } from '@spark/protocol'

const columns = Number(process.argv[2] ?? 120)
const model = process.argv[3] ?? 'deepseek/deepseek-chat'

const slice: SessionSlice = {
  meta: {
    id: 'ses_preview000000000000000' as SessionSlice['meta']['id'],
    cwd: process.cwd().replace(/\\/g, '/'),
    model,
    title: '预览',
    createdAt: 0,
    updatedAt: 0,
  },
  items: [],
  activeTurn: null,
  lastSeq: 0,
  usageTotal: {
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cacheRead: 0,
    cacheWrite: 0,
    costUsd: 0,
  },
  contextUsage: null,
  topBanner: null,
  compacting: false,
  lastCheckpoint: null,
  lastError: null,
  memoryInjected: null,
}

const models: ModelsDto = {
  providers: [
    {
      id: 'preview',
      label: 'preview',
      builtin: false,
      configured: true,
      apiKeyEnv: null,
      hasKey: true,
      api: 'openai-completions',
    },
  ],
  models: [{ provider: 'preview', model: 'preview-chat', contextWindow: 128_000 }],
  defaultModel: { provider: 'preview', model: 'preview-chat', contextWindow: 128_000 },
}

const { lastFrame } = render(
  React.createElement(BootHeader, { slice, models, columns }),
)
console.log(lastFrame())
