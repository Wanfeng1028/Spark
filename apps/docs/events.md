# 事件词表参考

> **本文件由 `apps/docs/scripts/gen-events.ts` 自动生成——勿手改。**
> 事实源是 `@spark/protocol` 的 zod schema；改过 schema 后跑 `pnpm --filter @spark/docs gen:events`，
> CI 会重跑并 `git diff --exit-code apps/docs/events.md` 校同步（与契约用例生成物同一套门禁思路）。

词表共 **27 种**事件：durable 24 种（落 JSONL、可回放、可审计）、
live-only 3 种（不落盘，重连后不重现）；其中 surface 2 种
（模型可见面，引擎铁律"模型可见必被记录"的对象）。

三条纪律（详见仓库 `ARCHITECTURE.md` 与 `doc/02-development-plan.md` §4.3）：

- **durable / live 二分**：只有 delta 类是 live；其余一律落盘，回放即可重建界面。
- **surface 纪律**：模型看得到的内容必有对应 durable 事件，禁止只存在于提示词里。
- **失败闭合**：事件流永不悬空——回合必有 `turn.completed`（含 error/aborted 收尾）。

## 信封（所有事件共用）

| 字段 | 类型 | 必填 |
| ---- | ---- | ---- |
| `id` | string | 是 |
| `type` | string | 是 |
| `sessionId` | string | 是 |
| `seq` | integer | 否 |
| `parentId` | string \| null | 否 |
| `version` | number | 否 |
| `ignorable` | boolean | 否 |
| `surface` | boolean | 否 |
| `time` | integer | 是 |
| `data` | object | 是 |

## 事件

### `assistant.delta`

- 分类：live-only（不落盘）

| 字段 | 类型 | 必填 |
| ---- | ---- | ---- |
| `turnId` | string | 是 |
| `text` | string | 是 |

### `assistant.message`

- 分类：durable（落盘可回放） · **surface**（模型可见面）

| 字段 | 类型 | 必填 |
| ---- | ---- | ---- |
| `turnId` | string | 是 |
| `content` | object \| object \| object \| object \| object[] | 是 |
| `usage` | object | 否 |

### `checkpoint.created`

- 分类：durable（落盘可回放）

| 字段 | 类型 | 必填 |
| ---- | ---- | ---- |
| `checkpointId` | string | 是 |
| `files` | string[] | 是 |
| `turnId` | string | 是 |

### `compaction.completed`

- 分类：durable（落盘可回放）

| 字段 | 类型 | 必填 |
| ---- | ---- | ---- |
| `summary` | string | 是 |
| `keptFromEventId` | string | 是 |
| `tokensBefore` | integer | 是 |
| `keptFiles` | string[] | 否 |
| `distilled` | object | 否 |

### `compaction.started`

- 分类：durable（落盘可回放）

| 字段 | 类型 | 必填 |
| ---- | ---- | ---- |
| `turnId` | string | 否 |

### `error`

- 分类：durable（落盘可回放）

| 字段 | 类型 | 必填 |
| ---- | ---- | ---- |
| `scope` | `"engine"` \| `"llm"` \| `"tool"` \| `"io"` | 是 |
| `message` | string | 是 |
| `fatal` | boolean | 否 |

### `goal.completed`

- 分类：durable（落盘可回放）

| 字段 | 类型 | 必填 |
| ---- | ---- | ---- |
| `iterations` | integer | 是 |
| `usedTokens` | integer | 是 |

### `goal.paused`

- 分类：durable（落盘可回放）

| 字段 | 类型 | 必填 |
| ---- | ---- | ---- |
| `reason` | `"maxIterations"` \| `"budgetExhausted"` \| `"judgeTimeout"` \| `"interrupt"` \| `"turnError"` \| `"cleared"` | 是 |
| `iterations` | integer | 是 |
| `usedTokens` | integer | 是 |

### `goal.set`

- 分类：durable（落盘可回放）

| 字段 | 类型 | 必填 |
| ---- | ---- | ---- |
| `goal` | string | 是 |

### `goal.updated`

- 分类：durable（落盘可回放）

| 字段 | 类型 | 必填 |
| ---- | ---- | ---- |
| `goal` | string | 是 |
| `iterations` | integer | 是 |
| `usedTokens` | integer | 是 |
| `status` | `"active"` \| `"paused"` \| `"completed"` | 是 |

### `io.warning`

- 分类：durable（落盘可回放）

| 字段 | 类型 | 必填 |
| ---- | ---- | ---- |
| `turnId` | string | 是 |
| `callId` | string | 是 |
| `tool` | string | 是 |
| `kind` | `"injection"` \| `"secret"` | 是 |
| `rules` | string[] | 是 |
| `redacted` | integer | 否 |

### `lsp.diagnostics`

- 分类：durable（落盘可回放）

| 字段 | 类型 | 必填 |
| ---- | ---- | ---- |
| `language` | string | 是 |
| `uri` | string | 是 |
| `diagnostics` | object[] | 是 |

### `memory.injected`

- 分类：durable（落盘可回放）

| 字段 | 类型 | 必填 |
| ---- | ---- | ---- |
| `turnId` | string | 是 |
| `query` | string | 是 |
| `memories` | object[] | 是 |

### `permission.asked`

- 分类：durable（落盘可回放）

| 字段 | 类型 | 必填 |
| ---- | ---- | ---- |
| `requestId` | string | 是 |
| `callId` | string | 是 |
| `action` | string | 是 |
| `resource` | string | 是 |
| `reason` | string | 是 |
| `detail` | object | 否 |
| `patterns` | string[] | 否 |
| `alwaysPatterns` | string[] | 否 |

### `permission.resolved`

- 分类：durable（落盘可回放）

| 字段 | 类型 | 必填 |
| ---- | ---- | ---- |
| `requestId` | string | 是 |
| `reply` | `"once"` \| `"always"` \| `"reject"` | 是 |
| `feedback` | string | 否 |

### `reasoning.delta`

- 分类：live-only（不落盘）

| 字段 | 类型 | 必填 |
| ---- | ---- | ---- |
| `turnId` | string | 是 |
| `text` | string | 是 |

### `reasoning.ended`

- 分类：durable（落盘可回放）

| 字段 | 类型 | 必填 |
| ---- | ---- | ---- |
| `turnId` | string | 是 |
| `text` | string | 是 |

### `session.created`

- 分类：durable（落盘可回放）

| 字段 | 类型 | 必填 |
| ---- | ---- | ---- |
| `title` | string | 否 |
| `cwd` | string | 是 |
| `model` | string | 是 |
| `branch` | string | 否 |
| `effort` | `"low"` \| `"medium"` \| `"high"` | 否 |

### `session.mode.changed`

- 分类：durable（落盘可回放）

| 字段 | 类型 | 必填 |
| ---- | ---- | ---- |
| `mode` | `"default"` \| `"plan"` | 是 |
| `previous` | `"default"` \| `"plan"` | 是 |

### `session.resumed`

- 分类：durable（落盘可回放）

| 字段 | 类型 | 必填 |
| ---- | ---- | ---- |
| `fromSeq` | integer | 是 |

### `session.title`

- 分类：durable（落盘可回放）

| 字段 | 类型 | 必填 |
| ---- | ---- | ---- |
| `title` | string | 是 |

### `tool.completed`

- 分类：durable（落盘可回放）

| 字段 | 类型 | 必填 |
| ---- | ---- | ---- |
| `turnId` | string | 是 |
| `callId` | string | 是 |
| `output` | object | 是 |
| `isError` | boolean | 是 |
| `durationMs` | integer | 是 |

### `tool.progress`

- 分类：live-only（不落盘）

| 字段 | 类型 | 必填 |
| ---- | ---- | ---- |
| `turnId` | string | 是 |
| `callId` | string | 是 |
| `chunk` | string | 是 |

### `tool.started`

- 分类：durable（落盘可回放）

| 字段 | 类型 | 必填 |
| ---- | ---- | ---- |
| `turnId` | string | 是 |
| `callId` | string | 是 |
| `name` | string | 是 |
| `input` | object | 是 |

### `turn.completed`

- 分类：durable（落盘可回放）

| 字段 | 类型 | 必填 |
| ---- | ---- | ---- |
| `turnId` | string | 是 |
| `finish` | `"stop"` \| `"length"` \| `"aborted"` \| `"permission-rejected"` \| `"error"` | 是 |
| `usage` | object | 否 |

### `turn.started`

- 分类：durable（落盘可回放）

| 字段 | 类型 | 必填 |
| ---- | ---- | ---- |
| `turnId` | string | 是 |
| `delivery` | `"now"` \| `"steer"` \| `"queue"` | 是 |
| `userEventId` | string | 是 |

### `user.message`

- 分类：durable（落盘可回放） · **surface**（模型可见面）

| 字段 | 类型 | 必填 |
| ---- | ---- | ---- |
| `text` | string | 是 |
| `attachments` | string[] | 否 |

