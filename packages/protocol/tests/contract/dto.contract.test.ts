// 自动生成，勿手改 —— packages/protocol/scripts/gen-contract.ts（工单 14.2 / doc/06 §1 L1.5 契约层）。
// 重新生成：pnpm --filter @spark/protocol gen:contract
// CI 同步门禁：ci.yml 在 test 步之前重跑生成器并 git diff --exit-code 本目录——改 schema 不重生成即红。
// 事实源：src/ids.ts + src/primitives.ts + src/api.ts（本文件不含任何手写样例或手写断言）。

import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import * as api from '../../src/api.js'
import * as ids from '../../src/ids.js'
import * as primitives from '../../src/primitives.js'

describe('契约：ids.CallIdSchema', () => {
  const sample = "call_contract_sample_1"

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(ids.CallIdSchema.parse(sample)).toEqual(sample)
    expect(ids.CallIdSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(ids.CallIdSchema)).toBeTypeOf('object')
  })

  it('类型错（数字）→ 解析失败', () => {
    expect(() => ids.CallIdSchema.parse(12345)).toThrow()
  })

  it('不合正则 → 解析失败', () => {
    expect(() => ids.CallIdSchema.parse('__contract_bogus__')).toThrow()
  })
})

describe('契约：ids.CheckpointIdSchema', () => {
  const sample = "ckp_01ARZ3NDEKTSV4RRFFQ69G5FAV"

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(ids.CheckpointIdSchema.parse(sample)).toEqual(sample)
    expect(ids.CheckpointIdSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(ids.CheckpointIdSchema)).toBeTypeOf('object')
  })

  it('类型错（数字）→ 解析失败', () => {
    expect(() => ids.CheckpointIdSchema.parse(12345)).toThrow()
  })

  it('不合正则 → 解析失败', () => {
    expect(() => ids.CheckpointIdSchema.parse('__contract_bogus__')).toThrow()
  })
})

describe('契约：ids.EventIdSchema', () => {
  const sample = "evt_01ARZ3NDEKTSV4RRFFQ69G5FAV"

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(ids.EventIdSchema.parse(sample)).toEqual(sample)
    expect(ids.EventIdSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(ids.EventIdSchema)).toBeTypeOf('object')
  })

  it('类型错（数字）→ 解析失败', () => {
    expect(() => ids.EventIdSchema.parse(12345)).toThrow()
  })

  it('不合正则 → 解析失败', () => {
    expect(() => ids.EventIdSchema.parse('__contract_bogus__')).toThrow()
  })
})

describe('契约：ids.RequestIdSchema', () => {
  const sample = "req_01ARZ3NDEKTSV4RRFFQ69G5FAV"

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(ids.RequestIdSchema.parse(sample)).toEqual(sample)
    expect(ids.RequestIdSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(ids.RequestIdSchema)).toBeTypeOf('object')
  })

  it('类型错（数字）→ 解析失败', () => {
    expect(() => ids.RequestIdSchema.parse(12345)).toThrow()
  })

  it('不合正则 → 解析失败', () => {
    expect(() => ids.RequestIdSchema.parse('__contract_bogus__')).toThrow()
  })
})

describe('契约：ids.SessionIdSchema', () => {
  const sample = "ses_01ARZ3NDEKTSV4RRFFQ69G5FAV"

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(ids.SessionIdSchema.parse(sample)).toEqual(sample)
    expect(ids.SessionIdSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(ids.SessionIdSchema)).toBeTypeOf('object')
  })

  it('类型错（数字）→ 解析失败', () => {
    expect(() => ids.SessionIdSchema.parse(12345)).toThrow()
  })

  it('不合正则 → 解析失败', () => {
    expect(() => ids.SessionIdSchema.parse('__contract_bogus__')).toThrow()
  })
})

describe('契约：ids.TurnIdSchema', () => {
  const sample = "trn_01ARZ3NDEKTSV4RRFFQ69G5FAV"

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(ids.TurnIdSchema.parse(sample)).toEqual(sample)
    expect(ids.TurnIdSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(ids.TurnIdSchema)).toBeTypeOf('object')
  })

  it('类型错（数字）→ 解析失败', () => {
    expect(() => ids.TurnIdSchema.parse(12345)).toThrow()
  })

  it('不合正则 → 解析失败', () => {
    expect(() => ids.TurnIdSchema.parse('__contract_bogus__')).toThrow()
  })
})

describe('契约：primitives.ContentItemSchema', () => {
  const sample = {
    "type": "text",
    "text": "contract-sample"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(primitives.ContentItemSchema.parse(sample)).toEqual(sample)
    expect(primitives.ContentItemSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(primitives.ContentItemSchema)).toBeTypeOf('object')
  })
})

describe('契约：primitives.DeliverySchema', () => {
  const sample = "now"

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(primitives.DeliverySchema.parse(sample)).toEqual(sample)
    expect(primitives.DeliverySchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(primitives.DeliverySchema)).toBeTypeOf('object')
  })

  it('类型错（数字）→ 解析失败', () => {
    expect(() => primitives.DeliverySchema.parse(12345)).toThrow()
  })
})

describe('契约：primitives.PermissionReplySchema', () => {
  const sample = "once"

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(primitives.PermissionReplySchema.parse(sample)).toEqual(sample)
    expect(primitives.PermissionReplySchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(primitives.PermissionReplySchema)).toBeTypeOf('object')
  })

  it('类型错（数字）→ 解析失败', () => {
    expect(() => primitives.PermissionReplySchema.parse(12345)).toThrow()
  })
})

describe('契约：primitives.ReasoningEffortSchema', () => {
  const sample = "low"

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(primitives.ReasoningEffortSchema.parse(sample)).toEqual(sample)
    expect(primitives.ReasoningEffortSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(primitives.ReasoningEffortSchema)).toBeTypeOf('object')
  })

  it('类型错（数字）→ 解析失败', () => {
    expect(() => primitives.ReasoningEffortSchema.parse(12345)).toThrow()
  })
})

describe('契约：primitives.TurnFinishSchema', () => {
  const sample = "stop"

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(primitives.TurnFinishSchema.parse(sample)).toEqual(sample)
    expect(primitives.TurnFinishSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(primitives.TurnFinishSchema)).toBeTypeOf('object')
  })

  it('类型错（数字）→ 解析失败', () => {
    expect(() => primitives.TurnFinishSchema.parse(12345)).toThrow()
  })
})

describe('契约：primitives.UsageSchema', () => {
  const sample = {
    "inputTokens": 1,
    "outputTokens": 1,
    "reasoningTokens": 1,
    "cacheRead": 1,
    "cacheWrite": 1,
    "costUsd": 1
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(primitives.UsageSchema.parse(sample)).toEqual(sample)
    expect(primitives.UsageSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(primitives.UsageSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 inputTokens → 解析失败', () => {
    expect(() => primitives.UsageSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["inputTokens"]; return m })())).toThrow()
  })

  it('缺必填字段 outputTokens → 解析失败', () => {
    expect(() => primitives.UsageSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["outputTokens"]; return m })())).toThrow()
  })

  it('字段 inputTokens 类型错 → 解析失败', () => {
    expect(() => primitives.UsageSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["inputTokens"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 outputTokens 类型错 → 解析失败', () => {
    expect(() => primitives.UsageSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["outputTokens"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 reasoningTokens 类型错 → 解析失败', () => {
    expect(() => primitives.UsageSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["reasoningTokens"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 cacheRead 类型错 → 解析失败', () => {
    expect(() => primitives.UsageSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["cacheRead"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 cacheWrite 类型错 → 解析失败', () => {
    expect(() => primitives.UsageSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["cacheWrite"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 costUsd 类型错 → 解析失败', () => {
    expect(() => primitives.UsageSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["costUsd"] = "not-a-number"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => primitives.UsageSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.AgentPresetDtoSchema', () => {
  const sample = {
    "model": "contract-sample",
    "tools": {
      "allow": [
        "contract-sample"
      ],
      "deny": [
        "contract-sample"
      ]
    },
    "systemAppend": "contract-sample",
    "title": "contract-sample",
    "name": "contract-sample"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.AgentPresetDtoSchema.parse(sample)).toEqual(sample)
    expect(api.AgentPresetDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.AgentPresetDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 name → 解析失败', () => {
    expect(() => api.AgentPresetDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["name"]; return m })())).toThrow()
  })

  it('字段 model 类型错 → 解析失败', () => {
    expect(() => api.AgentPresetDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["model"] = 12345; return m })())).toThrow()
  })

  it('字段 tools 类型错 → 解析失败', () => {
    expect(() => api.AgentPresetDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["tools"] = []; return m })())).toThrow()
  })

  it('字段 systemAppend 类型错 → 解析失败', () => {
    expect(() => api.AgentPresetDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["systemAppend"] = 12345; return m })())).toThrow()
  })

  it('字段 title 类型错 → 解析失败', () => {
    expect(() => api.AgentPresetDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["title"] = 12345; return m })())).toThrow()
  })

  it('字段 name 类型错 → 解析失败', () => {
    expect(() => api.AgentPresetDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["name"] = 12345; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.AgentPresetDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.AgentPresetSchema', () => {
  const sample = {
    "model": "contract-sample",
    "tools": {
      "allow": [
        "contract-sample"
      ],
      "deny": [
        "contract-sample"
      ]
    },
    "systemAppend": "contract-sample",
    "title": "contract-sample"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.AgentPresetSchema.parse(sample)).toEqual(sample)
    expect(api.AgentPresetSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.AgentPresetSchema)).toBeTypeOf('object')
  })

  it('字段 model 类型错 → 解析失败', () => {
    expect(() => api.AgentPresetSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["model"] = 12345; return m })())).toThrow()
  })

  it('字段 tools 类型错 → 解析失败', () => {
    expect(() => api.AgentPresetSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["tools"] = []; return m })())).toThrow()
  })

  it('字段 systemAppend 类型错 → 解析失败', () => {
    expect(() => api.AgentPresetSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["systemAppend"] = 12345; return m })())).toThrow()
  })

  it('字段 title 类型错 → 解析失败', () => {
    expect(() => api.AgentPresetSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["title"] = 12345; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.AgentPresetSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.AttachmentDtoSchema', () => {
  const sample = {
    "id": "contract-sample",
    "file": "contract-sample",
    "mime": "contract-sample",
    "size": 1,
    "name": "contract-sample"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.AttachmentDtoSchema.parse(sample)).toEqual(sample)
    expect(api.AttachmentDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.AttachmentDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 id → 解析失败', () => {
    expect(() => api.AttachmentDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["id"]; return m })())).toThrow()
  })

  it('缺必填字段 file → 解析失败', () => {
    expect(() => api.AttachmentDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["file"]; return m })())).toThrow()
  })

  it('缺必填字段 mime → 解析失败', () => {
    expect(() => api.AttachmentDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["mime"]; return m })())).toThrow()
  })

  it('缺必填字段 size → 解析失败', () => {
    expect(() => api.AttachmentDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["size"]; return m })())).toThrow()
  })

  it('缺必填字段 name → 解析失败', () => {
    expect(() => api.AttachmentDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["name"]; return m })())).toThrow()
  })

  it('字段 id 类型错 → 解析失败', () => {
    expect(() => api.AttachmentDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["id"] = 12345; return m })())).toThrow()
  })

  it('字段 file 类型错 → 解析失败', () => {
    expect(() => api.AttachmentDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["file"] = 12345; return m })())).toThrow()
  })

  it('字段 mime 类型错 → 解析失败', () => {
    expect(() => api.AttachmentDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["mime"] = 12345; return m })())).toThrow()
  })

  it('字段 size 类型错 → 解析失败', () => {
    expect(() => api.AttachmentDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["size"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 name 类型错 → 解析失败', () => {
    expect(() => api.AttachmentDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["name"] = 12345; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.AttachmentDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.AuditEntryDtoSchema', () => {
  const sample = {
    "time": 1,
    "kind": "permission.decision",
    "actor": "user",
    "result": "allow",
    "sessionId": "ses_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "tool": "contract-sample",
    "action": "contract-sample",
    "resource": "contract-sample",
    "effect": "allow",
    "op": "add",
    "source": "contract-sample",
    "checkpointId": "contract-sample"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.AuditEntryDtoSchema.parse(sample)).toEqual(sample)
    expect(api.AuditEntryDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.AuditEntryDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 time → 解析失败', () => {
    expect(() => api.AuditEntryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["time"]; return m })())).toThrow()
  })

  it('缺必填字段 kind → 解析失败', () => {
    expect(() => api.AuditEntryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["kind"]; return m })())).toThrow()
  })

  it('缺必填字段 actor → 解析失败', () => {
    expect(() => api.AuditEntryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["actor"]; return m })())).toThrow()
  })

  it('缺必填字段 result → 解析失败', () => {
    expect(() => api.AuditEntryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["result"]; return m })())).toThrow()
  })

  it('字段 time 类型错 → 解析失败', () => {
    expect(() => api.AuditEntryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["time"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 kind 类型错 → 解析失败', () => {
    expect(() => api.AuditEntryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["kind"] = "__contract_bogus_enum__"; return m })())).toThrow()
  })

  it('字段 actor 类型错 → 解析失败', () => {
    expect(() => api.AuditEntryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["actor"] = "__contract_bogus_enum__"; return m })())).toThrow()
  })

  it('字段 result 类型错 → 解析失败', () => {
    expect(() => api.AuditEntryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["result"] = "__contract_bogus_enum__"; return m })())).toThrow()
  })

  it('字段 sessionId 类型错 → 解析失败', () => {
    expect(() => api.AuditEntryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["sessionId"] = 12345; return m })())).toThrow()
  })

  it('字段 tool 类型错 → 解析失败', () => {
    expect(() => api.AuditEntryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["tool"] = 12345; return m })())).toThrow()
  })

  it('字段 action 类型错 → 解析失败', () => {
    expect(() => api.AuditEntryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["action"] = 12345; return m })())).toThrow()
  })

  it('字段 resource 类型错 → 解析失败', () => {
    expect(() => api.AuditEntryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["resource"] = 12345; return m })())).toThrow()
  })

  it('字段 effect 类型错 → 解析失败', () => {
    expect(() => api.AuditEntryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["effect"] = "__contract_bogus_enum__"; return m })())).toThrow()
  })

  it('字段 op 类型错 → 解析失败', () => {
    expect(() => api.AuditEntryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["op"] = "__contract_bogus_enum__"; return m })())).toThrow()
  })

  it('字段 source 类型错 → 解析失败', () => {
    expect(() => api.AuditEntryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["source"] = 12345; return m })())).toThrow()
  })

  it('字段 checkpointId 类型错 → 解析失败', () => {
    expect(() => api.AuditEntryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["checkpointId"] = 12345; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.AuditEntryDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.AuditQuerySchema', () => {
  const sample = {
    "limit": 1,
    "kind": "permission.decision",
    "result": "allow",
    "tool": "contract-sample",
    "since": 1
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.AuditQuerySchema.parse(sample)).toEqual(sample)
    expect(api.AuditQuerySchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.AuditQuerySchema)).toBeTypeOf('object')
  })

  it('字段 limit 类型错 → 解析失败', () => {
    expect(() => api.AuditQuerySchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["limit"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 kind 类型错 → 解析失败', () => {
    expect(() => api.AuditQuerySchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["kind"] = "__contract_bogus_enum__"; return m })())).toThrow()
  })

  it('字段 result 类型错 → 解析失败', () => {
    expect(() => api.AuditQuerySchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["result"] = "__contract_bogus_enum__"; return m })())).toThrow()
  })

  it('字段 tool 类型错 → 解析失败', () => {
    expect(() => api.AuditQuerySchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["tool"] = 12345; return m })())).toThrow()
  })

  it('字段 since 类型错 → 解析失败', () => {
    expect(() => api.AuditQuerySchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["since"] = "not-a-number"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.AuditQuerySchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.AutomationCreateSchema', () => {
  const sample = {
    "name": "contract-sample",
    "cwd": "contract-sample",
    "prompt": "contract-sample",
    "cron": "contract-sample",
    "watch": "contract-sample",
    "webhook": false
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.AutomationCreateSchema.parse(sample)).toEqual(sample)
    expect(api.AutomationCreateSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.AutomationCreateSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 name → 解析失败', () => {
    expect(() => api.AutomationCreateSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["name"]; return m })())).toThrow()
  })

  it('缺必填字段 cwd → 解析失败', () => {
    expect(() => api.AutomationCreateSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["cwd"]; return m })())).toThrow()
  })

  it('缺必填字段 prompt → 解析失败', () => {
    expect(() => api.AutomationCreateSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["prompt"]; return m })())).toThrow()
  })

  it('字段 name 类型错 → 解析失败', () => {
    expect(() => api.AutomationCreateSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["name"] = 12345; return m })())).toThrow()
  })

  it('字段 cwd 类型错 → 解析失败', () => {
    expect(() => api.AutomationCreateSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["cwd"] = 12345; return m })())).toThrow()
  })

  it('字段 prompt 类型错 → 解析失败', () => {
    expect(() => api.AutomationCreateSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["prompt"] = 12345; return m })())).toThrow()
  })

  it('字段 cron 类型错 → 解析失败', () => {
    expect(() => api.AutomationCreateSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["cron"] = 12345; return m })())).toThrow()
  })

  it('字段 watch 类型错 → 解析失败', () => {
    expect(() => api.AutomationCreateSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["watch"] = 12345; return m })())).toThrow()
  })

  it('字段 webhook 类型错 → 解析失败', () => {
    expect(() => api.AutomationCreateSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["webhook"] = "not-a-boolean"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.AutomationCreateSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.AutomationRunDtoSchema', () => {
  const sample = {
    "id": "contract-sample",
    "triggerId": "contract-sample",
    "triggerName": "contract-sample",
    "at": 1,
    "kind": "cron",
    "sessionId": "contract-sample",
    "finish": "ok",
    "error": "contract-sample"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.AutomationRunDtoSchema.parse(sample)).toEqual(sample)
    expect(api.AutomationRunDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.AutomationRunDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 id → 解析失败', () => {
    expect(() => api.AutomationRunDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["id"]; return m })())).toThrow()
  })

  it('缺必填字段 triggerId → 解析失败', () => {
    expect(() => api.AutomationRunDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["triggerId"]; return m })())).toThrow()
  })

  it('缺必填字段 triggerName → 解析失败', () => {
    expect(() => api.AutomationRunDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["triggerName"]; return m })())).toThrow()
  })

  it('缺必填字段 at → 解析失败', () => {
    expect(() => api.AutomationRunDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["at"]; return m })())).toThrow()
  })

  it('缺必填字段 kind → 解析失败', () => {
    expect(() => api.AutomationRunDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["kind"]; return m })())).toThrow()
  })

  it('缺必填字段 finish → 解析失败', () => {
    expect(() => api.AutomationRunDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["finish"]; return m })())).toThrow()
  })

  it('字段 id 类型错 → 解析失败', () => {
    expect(() => api.AutomationRunDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["id"] = 12345; return m })())).toThrow()
  })

  it('字段 triggerId 类型错 → 解析失败', () => {
    expect(() => api.AutomationRunDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["triggerId"] = 12345; return m })())).toThrow()
  })

  it('字段 triggerName 类型错 → 解析失败', () => {
    expect(() => api.AutomationRunDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["triggerName"] = 12345; return m })())).toThrow()
  })

  it('字段 at 类型错 → 解析失败', () => {
    expect(() => api.AutomationRunDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["at"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 kind 类型错 → 解析失败', () => {
    expect(() => api.AutomationRunDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["kind"] = "__contract_bogus_enum__"; return m })())).toThrow()
  })

  it('字段 sessionId 类型错 → 解析失败', () => {
    expect(() => api.AutomationRunDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["sessionId"] = 12345; return m })())).toThrow()
  })

  it('字段 finish 类型错 → 解析失败', () => {
    expect(() => api.AutomationRunDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["finish"] = "__contract_bogus_enum__"; return m })())).toThrow()
  })

  it('字段 error 类型错 → 解析失败', () => {
    expect(() => api.AutomationRunDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["error"] = 12345; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.AutomationRunDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.AutomationTriggerDtoSchema', () => {
  const sample = {
    "id": "contract-sample",
    "name": "contract-sample",
    "enabled": false,
    "cwd": "contract-sample",
    "prompt": "contract-sample",
    "cron": "contract-sample",
    "watch": "contract-sample",
    "webhook": false,
    "createdAt": 1
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.AutomationTriggerDtoSchema.parse(sample)).toEqual(sample)
    expect(api.AutomationTriggerDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.AutomationTriggerDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 id → 解析失败', () => {
    expect(() => api.AutomationTriggerDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["id"]; return m })())).toThrow()
  })

  it('缺必填字段 name → 解析失败', () => {
    expect(() => api.AutomationTriggerDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["name"]; return m })())).toThrow()
  })

  it('缺必填字段 enabled → 解析失败', () => {
    expect(() => api.AutomationTriggerDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["enabled"]; return m })())).toThrow()
  })

  it('缺必填字段 cwd → 解析失败', () => {
    expect(() => api.AutomationTriggerDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["cwd"]; return m })())).toThrow()
  })

  it('缺必填字段 prompt → 解析失败', () => {
    expect(() => api.AutomationTriggerDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["prompt"]; return m })())).toThrow()
  })

  it('缺必填字段 createdAt → 解析失败', () => {
    expect(() => api.AutomationTriggerDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["createdAt"]; return m })())).toThrow()
  })

  it('字段 id 类型错 → 解析失败', () => {
    expect(() => api.AutomationTriggerDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["id"] = 12345; return m })())).toThrow()
  })

  it('字段 name 类型错 → 解析失败', () => {
    expect(() => api.AutomationTriggerDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["name"] = 12345; return m })())).toThrow()
  })

  it('字段 enabled 类型错 → 解析失败', () => {
    expect(() => api.AutomationTriggerDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["enabled"] = "not-a-boolean"; return m })())).toThrow()
  })

  it('字段 cwd 类型错 → 解析失败', () => {
    expect(() => api.AutomationTriggerDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["cwd"] = 12345; return m })())).toThrow()
  })

  it('字段 prompt 类型错 → 解析失败', () => {
    expect(() => api.AutomationTriggerDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["prompt"] = 12345; return m })())).toThrow()
  })

  it('字段 cron 类型错 → 解析失败', () => {
    expect(() => api.AutomationTriggerDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["cron"] = 12345; return m })())).toThrow()
  })

  it('字段 watch 类型错 → 解析失败', () => {
    expect(() => api.AutomationTriggerDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["watch"] = 12345; return m })())).toThrow()
  })

  it('字段 webhook 类型错 → 解析失败', () => {
    expect(() => api.AutomationTriggerDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["webhook"] = "not-a-boolean"; return m })())).toThrow()
  })

  it('字段 createdAt 类型错 → 解析失败', () => {
    expect(() => api.AutomationTriggerDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["createdAt"] = "not-a-number"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.AutomationTriggerDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.CheckpointDtoSchema', () => {
  const sample = {
    "checkpointId": "ckp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "turnId": "trn_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "createdAt": 1,
    "files": [
      "contract-sample"
    ]
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.CheckpointDtoSchema.parse(sample)).toEqual(sample)
    expect(api.CheckpointDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.CheckpointDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 checkpointId → 解析失败', () => {
    expect(() => api.CheckpointDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["checkpointId"]; return m })())).toThrow()
  })

  it('缺必填字段 turnId → 解析失败', () => {
    expect(() => api.CheckpointDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["turnId"]; return m })())).toThrow()
  })

  it('缺必填字段 createdAt → 解析失败', () => {
    expect(() => api.CheckpointDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["createdAt"]; return m })())).toThrow()
  })

  it('缺必填字段 files → 解析失败', () => {
    expect(() => api.CheckpointDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["files"]; return m })())).toThrow()
  })

  it('字段 checkpointId 类型错 → 解析失败', () => {
    expect(() => api.CheckpointDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["checkpointId"] = 12345; return m })())).toThrow()
  })

  it('字段 turnId 类型错 → 解析失败', () => {
    expect(() => api.CheckpointDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["turnId"] = 12345; return m })())).toThrow()
  })

  it('字段 createdAt 类型错 → 解析失败', () => {
    expect(() => api.CheckpointDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["createdAt"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 files 类型错 → 解析失败', () => {
    expect(() => api.CheckpointDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["files"] = "not-an-array"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.CheckpointDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.CommandDtoSchema', () => {
  const sample = {
    "name": "contract-sample",
    "description": "contract-sample",
    "kind": "action",
    "group": "session",
    "surface": [
      "web"
    ],
    "sessionRequired": false,
    "args": {
      "placeholder": "contract-sample",
      "hint": "contract-sample"
    },
    "clientAction": "new"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.CommandDtoSchema.parse(sample)).toEqual(sample)
    expect(api.CommandDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.CommandDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 name → 解析失败', () => {
    expect(() => api.CommandDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["name"]; return m })())).toThrow()
  })

  it('缺必填字段 description → 解析失败', () => {
    expect(() => api.CommandDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["description"]; return m })())).toThrow()
  })

  it('缺必填字段 kind → 解析失败', () => {
    expect(() => api.CommandDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["kind"]; return m })())).toThrow()
  })

  it('字段 name 类型错 → 解析失败', () => {
    expect(() => api.CommandDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["name"] = 12345; return m })())).toThrow()
  })

  it('字段 description 类型错 → 解析失败', () => {
    expect(() => api.CommandDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["description"] = 12345; return m })())).toThrow()
  })

  it('字段 kind 类型错 → 解析失败', () => {
    expect(() => api.CommandDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["kind"] = "__contract_bogus_enum__"; return m })())).toThrow()
  })

  it('字段 group 类型错 → 解析失败', () => {
    expect(() => api.CommandDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["group"] = "__contract_bogus_enum__"; return m })())).toThrow()
  })

  it('字段 surface 类型错 → 解析失败', () => {
    expect(() => api.CommandDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["surface"] = "not-an-array"; return m })())).toThrow()
  })

  it('字段 sessionRequired 类型错 → 解析失败', () => {
    expect(() => api.CommandDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["sessionRequired"] = "not-a-boolean"; return m })())).toThrow()
  })

  it('字段 args 类型错 → 解析失败', () => {
    expect(() => api.CommandDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["args"] = []; return m })())).toThrow()
  })

  it('字段 clientAction 类型错 → 解析失败', () => {
    expect(() => api.CommandDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["clientAction"] = "__contract_bogus_enum__"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.CommandDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.EngineSettingsSchema', () => {
  const sample = {
    "maxStepsPerTurn": 1,
    "maxToolParallel": 1,
    "toolTimeoutMs": 1,
    "permissionTimeoutMs": 1,
    "progressThrottleMs": 1,
    "toolOutputLimitKB": 1,
    "compactionThreshold": 1,
    "checkpoints": false,
    "bashSandbox": "off"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.EngineSettingsSchema.parse(sample)).toEqual(sample)
    expect(api.EngineSettingsSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.EngineSettingsSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 maxStepsPerTurn → 解析失败', () => {
    expect(() => api.EngineSettingsSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["maxStepsPerTurn"]; return m })())).toThrow()
  })

  it('缺必填字段 maxToolParallel → 解析失败', () => {
    expect(() => api.EngineSettingsSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["maxToolParallel"]; return m })())).toThrow()
  })

  it('缺必填字段 toolTimeoutMs → 解析失败', () => {
    expect(() => api.EngineSettingsSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["toolTimeoutMs"]; return m })())).toThrow()
  })

  it('缺必填字段 permissionTimeoutMs → 解析失败', () => {
    expect(() => api.EngineSettingsSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["permissionTimeoutMs"]; return m })())).toThrow()
  })

  it('缺必填字段 progressThrottleMs → 解析失败', () => {
    expect(() => api.EngineSettingsSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["progressThrottleMs"]; return m })())).toThrow()
  })

  it('缺必填字段 toolOutputLimitKB → 解析失败', () => {
    expect(() => api.EngineSettingsSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["toolOutputLimitKB"]; return m })())).toThrow()
  })

  it('缺必填字段 compactionThreshold → 解析失败', () => {
    expect(() => api.EngineSettingsSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["compactionThreshold"]; return m })())).toThrow()
  })

  it('缺必填字段 checkpoints → 解析失败', () => {
    expect(() => api.EngineSettingsSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["checkpoints"]; return m })())).toThrow()
  })

  it('缺必填字段 bashSandbox → 解析失败', () => {
    expect(() => api.EngineSettingsSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["bashSandbox"]; return m })())).toThrow()
  })

  it('字段 maxStepsPerTurn 类型错 → 解析失败', () => {
    expect(() => api.EngineSettingsSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["maxStepsPerTurn"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 maxToolParallel 类型错 → 解析失败', () => {
    expect(() => api.EngineSettingsSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["maxToolParallel"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 toolTimeoutMs 类型错 → 解析失败', () => {
    expect(() => api.EngineSettingsSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["toolTimeoutMs"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 permissionTimeoutMs 类型错 → 解析失败', () => {
    expect(() => api.EngineSettingsSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["permissionTimeoutMs"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 progressThrottleMs 类型错 → 解析失败', () => {
    expect(() => api.EngineSettingsSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["progressThrottleMs"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 toolOutputLimitKB 类型错 → 解析失败', () => {
    expect(() => api.EngineSettingsSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["toolOutputLimitKB"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 compactionThreshold 类型错 → 解析失败', () => {
    expect(() => api.EngineSettingsSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["compactionThreshold"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 checkpoints 类型错 → 解析失败', () => {
    expect(() => api.EngineSettingsSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["checkpoints"] = "not-a-boolean"; return m })())).toThrow()
  })

  it('字段 bashSandbox 类型错 → 解析失败', () => {
    expect(() => api.EngineSettingsSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["bashSandbox"] = "__contract_bogus_enum__"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.EngineSettingsSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.ExecuteCommandBodySchema', () => {
  const sample = {
    "args": "contract-sample"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.ExecuteCommandBodySchema.parse(sample)).toEqual(sample)
    expect(api.ExecuteCommandBodySchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.ExecuteCommandBodySchema)).toBeTypeOf('object')
  })

  it('字段 args 类型错 → 解析失败', () => {
    expect(() => api.ExecuteCommandBodySchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["args"] = 12345; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.ExecuteCommandBodySchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.ForkChildDtoSchema', () => {
  const sample = {
    "sessionId": "ses_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "title": "contract-sample",
    "createdAt": 1,
    "status": "idle"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.ForkChildDtoSchema.parse(sample)).toEqual(sample)
    expect(api.ForkChildDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.ForkChildDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 sessionId → 解析失败', () => {
    expect(() => api.ForkChildDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["sessionId"]; return m })())).toThrow()
  })

  it('缺必填字段 title → 解析失败', () => {
    expect(() => api.ForkChildDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["title"]; return m })())).toThrow()
  })

  it('缺必填字段 createdAt → 解析失败', () => {
    expect(() => api.ForkChildDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["createdAt"]; return m })())).toThrow()
  })

  it('缺必填字段 status → 解析失败', () => {
    expect(() => api.ForkChildDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["status"]; return m })())).toThrow()
  })

  it('字段 sessionId 类型错 → 解析失败', () => {
    expect(() => api.ForkChildDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["sessionId"] = 12345; return m })())).toThrow()
  })

  it('字段 title 类型错 → 解析失败', () => {
    expect(() => api.ForkChildDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["title"] = 12345; return m })())).toThrow()
  })

  it('字段 createdAt 类型错 → 解析失败', () => {
    expect(() => api.ForkChildDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["createdAt"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 status 类型错 → 解析失败', () => {
    expect(() => api.ForkChildDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["status"] = "__contract_bogus_enum__"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.ForkChildDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.FsEntryDtoSchema', () => {
  const sample = {
    "name": "contract-sample",
    "path": "contract-sample",
    "isDir": false
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.FsEntryDtoSchema.parse(sample)).toEqual(sample)
    expect(api.FsEntryDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.FsEntryDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 name → 解析失败', () => {
    expect(() => api.FsEntryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["name"]; return m })())).toThrow()
  })

  it('缺必填字段 path → 解析失败', () => {
    expect(() => api.FsEntryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["path"]; return m })())).toThrow()
  })

  it('缺必填字段 isDir → 解析失败', () => {
    expect(() => api.FsEntryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["isDir"]; return m })())).toThrow()
  })

  it('字段 name 类型错 → 解析失败', () => {
    expect(() => api.FsEntryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["name"] = 12345; return m })())).toThrow()
  })

  it('字段 path 类型错 → 解析失败', () => {
    expect(() => api.FsEntryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["path"] = 12345; return m })())).toThrow()
  })

  it('字段 isDir 类型错 → 解析失败', () => {
    expect(() => api.FsEntryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["isDir"] = "not-a-boolean"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.FsEntryDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.FsListDtoSchema', () => {
  const sample = {
    "path": "contract-sample",
    "entries": [
      {
        "name": "contract-sample",
        "path": "contract-sample",
        "isDir": false
      }
    ]
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.FsListDtoSchema.parse(sample)).toEqual(sample)
    expect(api.FsListDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.FsListDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 path → 解析失败', () => {
    expect(() => api.FsListDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["path"]; return m })())).toThrow()
  })

  it('缺必填字段 entries → 解析失败', () => {
    expect(() => api.FsListDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["entries"]; return m })())).toThrow()
  })

  it('字段 path 类型错 → 解析失败', () => {
    expect(() => api.FsListDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["path"] = 12345; return m })())).toThrow()
  })

  it('字段 entries 类型错 → 解析失败', () => {
    expect(() => api.FsListDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["entries"] = "not-an-array"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.FsListDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.FsQuerySchema', () => {
  const sample = {
    "path": "contract-sample"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.FsQuerySchema.parse(sample)).toEqual(sample)
    expect(api.FsQuerySchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.FsQuerySchema)).toBeTypeOf('object')
  })

  it('缺必填字段 path → 解析失败', () => {
    expect(() => api.FsQuerySchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["path"]; return m })())).toThrow()
  })

  it('字段 path 类型错 → 解析失败', () => {
    expect(() => api.FsQuerySchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["path"] = 12345; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.FsQuerySchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.FsTreeDtoSchema', () => {
  const sample = {
    "path": "contract-sample",
    "entries": [
      {
        "name": "contract-sample",
        "path": "contract-sample",
        "isDir": false
      }
    ],
    "truncated": false
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.FsTreeDtoSchema.parse(sample)).toEqual(sample)
    expect(api.FsTreeDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.FsTreeDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 path → 解析失败', () => {
    expect(() => api.FsTreeDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["path"]; return m })())).toThrow()
  })

  it('缺必填字段 entries → 解析失败', () => {
    expect(() => api.FsTreeDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["entries"]; return m })())).toThrow()
  })

  it('缺必填字段 truncated → 解析失败', () => {
    expect(() => api.FsTreeDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["truncated"]; return m })())).toThrow()
  })

  it('字段 path 类型错 → 解析失败', () => {
    expect(() => api.FsTreeDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["path"] = 12345; return m })())).toThrow()
  })

  it('字段 entries 类型错 → 解析失败', () => {
    expect(() => api.FsTreeDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["entries"] = "not-an-array"; return m })())).toThrow()
  })

  it('字段 truncated 类型错 → 解析失败', () => {
    expect(() => api.FsTreeDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["truncated"] = "not-a-boolean"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.FsTreeDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.FsTreeQuerySchema', () => {
  const sample = {
    "path": "contract-sample"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.FsTreeQuerySchema.parse(sample)).toEqual(sample)
    expect(api.FsTreeQuerySchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.FsTreeQuerySchema)).toBeTypeOf('object')
  })

  it('缺必填字段 path → 解析失败', () => {
    expect(() => api.FsTreeQuerySchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["path"]; return m })())).toThrow()
  })

  it('字段 path 类型错 → 解析失败', () => {
    expect(() => api.FsTreeQuerySchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["path"] = 12345; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.FsTreeQuerySchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.McpServerDtoSchema', () => {
  const sample = {
    "name": "contract-sample",
    "connected": false,
    "tools": 1,
    "command": "contract-sample"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.McpServerDtoSchema.parse(sample)).toEqual(sample)
    expect(api.McpServerDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.McpServerDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 name → 解析失败', () => {
    expect(() => api.McpServerDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["name"]; return m })())).toThrow()
  })

  it('缺必填字段 connected → 解析失败', () => {
    expect(() => api.McpServerDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["connected"]; return m })())).toThrow()
  })

  it('缺必填字段 tools → 解析失败', () => {
    expect(() => api.McpServerDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["tools"]; return m })())).toThrow()
  })

  it('缺必填字段 command → 解析失败', () => {
    expect(() => api.McpServerDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["command"]; return m })())).toThrow()
  })

  it('字段 name 类型错 → 解析失败', () => {
    expect(() => api.McpServerDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["name"] = 12345; return m })())).toThrow()
  })

  it('字段 connected 类型错 → 解析失败', () => {
    expect(() => api.McpServerDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["connected"] = "not-a-boolean"; return m })())).toThrow()
  })

  it('字段 tools 类型错 → 解析失败', () => {
    expect(() => api.McpServerDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["tools"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 command 类型错 → 解析失败', () => {
    expect(() => api.McpServerDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["command"] = 12345; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.McpServerDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.MemoryDtoSchema', () => {
  const sample = {
    "id": 1,
    "content": "contract-sample",
    "createdAt": 1
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.MemoryDtoSchema.parse(sample)).toEqual(sample)
    expect(api.MemoryDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.MemoryDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 id → 解析失败', () => {
    expect(() => api.MemoryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["id"]; return m })())).toThrow()
  })

  it('缺必填字段 content → 解析失败', () => {
    expect(() => api.MemoryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["content"]; return m })())).toThrow()
  })

  it('缺必填字段 createdAt → 解析失败', () => {
    expect(() => api.MemoryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["createdAt"]; return m })())).toThrow()
  })

  it('字段 id 类型错 → 解析失败', () => {
    expect(() => api.MemoryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["id"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 content 类型错 → 解析失败', () => {
    expect(() => api.MemoryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["content"] = 12345; return m })())).toThrow()
  })

  it('字段 createdAt 类型错 → 解析失败', () => {
    expect(() => api.MemoryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["createdAt"] = "not-a-number"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.MemoryDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.ModelEntryDtoSchema', () => {
  const sample = {
    "provider": "contract-sample",
    "model": "contract-sample",
    "contextWindow": 1
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.ModelEntryDtoSchema.parse(sample)).toEqual(sample)
    expect(api.ModelEntryDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.ModelEntryDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 provider → 解析失败', () => {
    expect(() => api.ModelEntryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["provider"]; return m })())).toThrow()
  })

  it('缺必填字段 model → 解析失败', () => {
    expect(() => api.ModelEntryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["model"]; return m })())).toThrow()
  })

  it('缺必填字段 contextWindow → 解析失败', () => {
    expect(() => api.ModelEntryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["contextWindow"]; return m })())).toThrow()
  })

  it('字段 provider 类型错 → 解析失败', () => {
    expect(() => api.ModelEntryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["provider"] = 12345; return m })())).toThrow()
  })

  it('字段 model 类型错 → 解析失败', () => {
    expect(() => api.ModelEntryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["model"] = 12345; return m })())).toThrow()
  })

  it('字段 contextWindow 类型错 → 解析失败', () => {
    expect(() => api.ModelEntryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["contextWindow"] = "not-a-number"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.ModelEntryDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.ModelProviderDtoSchema', () => {
  const sample = {
    "id": "contract-sample",
    "label": "contract-sample",
    "builtin": false,
    "configured": false,
    "baseUrl": "contract-sample",
    "apiKeyEnv": "contract-sample",
    "hasKey": false,
    "api": "openai-completions"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.ModelProviderDtoSchema.parse(sample)).toEqual(sample)
    expect(api.ModelProviderDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.ModelProviderDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 id → 解析失败', () => {
    expect(() => api.ModelProviderDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["id"]; return m })())).toThrow()
  })

  it('缺必填字段 label → 解析失败', () => {
    expect(() => api.ModelProviderDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["label"]; return m })())).toThrow()
  })

  it('缺必填字段 builtin → 解析失败', () => {
    expect(() => api.ModelProviderDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["builtin"]; return m })())).toThrow()
  })

  it('缺必填字段 configured → 解析失败', () => {
    expect(() => api.ModelProviderDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["configured"]; return m })())).toThrow()
  })

  it('缺必填字段 apiKeyEnv → 解析失败', () => {
    expect(() => api.ModelProviderDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["apiKeyEnv"]; return m })())).toThrow()
  })

  it('缺必填字段 hasKey → 解析失败', () => {
    expect(() => api.ModelProviderDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["hasKey"]; return m })())).toThrow()
  })

  it('缺必填字段 api → 解析失败', () => {
    expect(() => api.ModelProviderDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["api"]; return m })())).toThrow()
  })

  it('字段 id 类型错 → 解析失败', () => {
    expect(() => api.ModelProviderDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["id"] = 12345; return m })())).toThrow()
  })

  it('字段 label 类型错 → 解析失败', () => {
    expect(() => api.ModelProviderDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["label"] = 12345; return m })())).toThrow()
  })

  it('字段 builtin 类型错 → 解析失败', () => {
    expect(() => api.ModelProviderDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["builtin"] = "not-a-boolean"; return m })())).toThrow()
  })

  it('字段 configured 类型错 → 解析失败', () => {
    expect(() => api.ModelProviderDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["configured"] = "not-a-boolean"; return m })())).toThrow()
  })

  it('字段 baseUrl 类型错 → 解析失败', () => {
    expect(() => api.ModelProviderDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["baseUrl"] = 12345; return m })())).toThrow()
  })

  it('字段 hasKey 类型错 → 解析失败', () => {
    expect(() => api.ModelProviderDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["hasKey"] = "not-a-boolean"; return m })())).toThrow()
  })

  it('字段 api 类型错 → 解析失败', () => {
    expect(() => api.ModelProviderDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["api"] = "__contract_bogus_enum__"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.ModelProviderDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.ModelsDtoSchema', () => {
  const sample = {
    "providers": [
      {
        "id": "contract-sample",
        "label": "contract-sample",
        "builtin": false,
        "configured": false,
        "baseUrl": "contract-sample",
        "apiKeyEnv": "contract-sample",
        "hasKey": false,
        "api": "openai-completions"
      }
    ],
    "models": [
      {
        "provider": "contract-sample",
        "model": "contract-sample",
        "contextWindow": 1
      }
    ],
    "defaultModel": {
      "provider": "contract-sample",
      "model": "contract-sample",
      "contextWindow": 1
    }
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.ModelsDtoSchema.parse(sample)).toEqual(sample)
    expect(api.ModelsDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.ModelsDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 providers → 解析失败', () => {
    expect(() => api.ModelsDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["providers"]; return m })())).toThrow()
  })

  it('缺必填字段 models → 解析失败', () => {
    expect(() => api.ModelsDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["models"]; return m })())).toThrow()
  })

  it('缺必填字段 defaultModel → 解析失败', () => {
    expect(() => api.ModelsDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["defaultModel"]; return m })())).toThrow()
  })

  it('字段 providers 类型错 → 解析失败', () => {
    expect(() => api.ModelsDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["providers"] = "not-an-array"; return m })())).toThrow()
  })

  it('字段 models 类型错 → 解析失败', () => {
    expect(() => api.ModelsDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["models"] = "not-an-array"; return m })())).toThrow()
  })

  it('字段 defaultModel 类型错 → 解析失败', () => {
    expect(() => api.ModelsDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["defaultModel"] = []; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.ModelsDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.ModelTestResultDtoSchema', () => {
  const sample = {
    "provider": "contract-sample",
    "ok": false,
    "latencyMs": 1,
    "message": "contract-sample",
    "detail": "contract-sample"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.ModelTestResultDtoSchema.parse(sample)).toEqual(sample)
    expect(api.ModelTestResultDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.ModelTestResultDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 provider → 解析失败', () => {
    expect(() => api.ModelTestResultDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["provider"]; return m })())).toThrow()
  })

  it('缺必填字段 ok → 解析失败', () => {
    expect(() => api.ModelTestResultDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["ok"]; return m })())).toThrow()
  })

  it('缺必填字段 message → 解析失败', () => {
    expect(() => api.ModelTestResultDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["message"]; return m })())).toThrow()
  })

  it('字段 provider 类型错 → 解析失败', () => {
    expect(() => api.ModelTestResultDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["provider"] = 12345; return m })())).toThrow()
  })

  it('字段 ok 类型错 → 解析失败', () => {
    expect(() => api.ModelTestResultDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["ok"] = "not-a-boolean"; return m })())).toThrow()
  })

  it('字段 latencyMs 类型错 → 解析失败', () => {
    expect(() => api.ModelTestResultDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["latencyMs"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 message 类型错 → 解析失败', () => {
    expect(() => api.ModelTestResultDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["message"] = 12345; return m })())).toThrow()
  })

  it('字段 detail 类型错 → 解析失败', () => {
    expect(() => api.ModelTestResultDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["detail"] = 12345; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.ModelTestResultDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.PairCodeDtoSchema', () => {
  const sample = {
    "code": "123456",
    "expiresAt": 1,
    "qr": "contract-sample"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.PairCodeDtoSchema.parse(sample)).toEqual(sample)
    expect(api.PairCodeDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.PairCodeDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 code → 解析失败', () => {
    expect(() => api.PairCodeDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["code"]; return m })())).toThrow()
  })

  it('缺必填字段 expiresAt → 解析失败', () => {
    expect(() => api.PairCodeDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["expiresAt"]; return m })())).toThrow()
  })

  it('缺必填字段 qr → 解析失败', () => {
    expect(() => api.PairCodeDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["qr"]; return m })())).toThrow()
  })

  it('字段 code 类型错 → 解析失败', () => {
    expect(() => api.PairCodeDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["code"] = 12345; return m })())).toThrow()
  })

  it('字段 expiresAt 类型错 → 解析失败', () => {
    expect(() => api.PairCodeDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["expiresAt"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 qr 类型错 → 解析失败', () => {
    expect(() => api.PairCodeDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["qr"] = 12345; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.PairCodeDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.PairedDeviceDtoSchema', () => {
  const sample = {
    "id": "contract-sample",
    "name": "contract-sample",
    "createdAt": 1,
    "lastSeenAt": 1
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.PairedDeviceDtoSchema.parse(sample)).toEqual(sample)
    expect(api.PairedDeviceDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.PairedDeviceDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 id → 解析失败', () => {
    expect(() => api.PairedDeviceDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["id"]; return m })())).toThrow()
  })

  it('缺必填字段 name → 解析失败', () => {
    expect(() => api.PairedDeviceDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["name"]; return m })())).toThrow()
  })

  it('缺必填字段 createdAt → 解析失败', () => {
    expect(() => api.PairedDeviceDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["createdAt"]; return m })())).toThrow()
  })

  it('缺必填字段 lastSeenAt → 解析失败', () => {
    expect(() => api.PairedDeviceDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["lastSeenAt"]; return m })())).toThrow()
  })

  it('字段 id 类型错 → 解析失败', () => {
    expect(() => api.PairedDeviceDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["id"] = 12345; return m })())).toThrow()
  })

  it('字段 name 类型错 → 解析失败', () => {
    expect(() => api.PairedDeviceDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["name"] = 12345; return m })())).toThrow()
  })

  it('字段 createdAt 类型错 → 解析失败', () => {
    expect(() => api.PairedDeviceDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["createdAt"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 lastSeenAt 类型错 → 解析失败', () => {
    expect(() => api.PairedDeviceDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["lastSeenAt"] = "not-a-number"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.PairedDeviceDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.PairRedeemBodySchema', () => {
  const sample = {
    "code": "123456",
    "name": "contract-sample"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.PairRedeemBodySchema.parse(sample)).toEqual(sample)
    expect(api.PairRedeemBodySchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.PairRedeemBodySchema)).toBeTypeOf('object')
  })

  it('缺必填字段 code → 解析失败', () => {
    expect(() => api.PairRedeemBodySchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["code"]; return m })())).toThrow()
  })

  it('字段 code 类型错 → 解析失败', () => {
    expect(() => api.PairRedeemBodySchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["code"] = 12345; return m })())).toThrow()
  })

  it('字段 name 类型错 → 解析失败', () => {
    expect(() => api.PairRedeemBodySchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["name"] = 12345; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.PairRedeemBodySchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.PairStatusDtoSchema', () => {
  const sample = {
    "host": "contract-sample",
    "port": 1,
    "loopback": false,
    "authEnabled": false,
    "devices": [
      {
        "id": "contract-sample",
        "name": "contract-sample",
        "createdAt": 1,
        "lastSeenAt": 1
      }
    ]
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.PairStatusDtoSchema.parse(sample)).toEqual(sample)
    expect(api.PairStatusDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.PairStatusDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 host → 解析失败', () => {
    expect(() => api.PairStatusDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["host"]; return m })())).toThrow()
  })

  it('缺必填字段 port → 解析失败', () => {
    expect(() => api.PairStatusDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["port"]; return m })())).toThrow()
  })

  it('缺必填字段 loopback → 解析失败', () => {
    expect(() => api.PairStatusDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["loopback"]; return m })())).toThrow()
  })

  it('缺必填字段 authEnabled → 解析失败', () => {
    expect(() => api.PairStatusDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["authEnabled"]; return m })())).toThrow()
  })

  it('缺必填字段 devices → 解析失败', () => {
    expect(() => api.PairStatusDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["devices"]; return m })())).toThrow()
  })

  it('字段 host 类型错 → 解析失败', () => {
    expect(() => api.PairStatusDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["host"] = 12345; return m })())).toThrow()
  })

  it('字段 port 类型错 → 解析失败', () => {
    expect(() => api.PairStatusDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["port"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 loopback 类型错 → 解析失败', () => {
    expect(() => api.PairStatusDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["loopback"] = "not-a-boolean"; return m })())).toThrow()
  })

  it('字段 authEnabled 类型错 → 解析失败', () => {
    expect(() => api.PairStatusDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["authEnabled"] = "not-a-boolean"; return m })())).toThrow()
  })

  it('字段 devices 类型错 → 解析失败', () => {
    expect(() => api.PairStatusDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["devices"] = "not-an-array"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.PairStatusDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.PairTokenDtoSchema', () => {
  const sample = {
    "token": "contract-sample"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.PairTokenDtoSchema.parse(sample)).toEqual(sample)
    expect(api.PairTokenDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.PairTokenDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 token → 解析失败', () => {
    expect(() => api.PairTokenDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["token"]; return m })())).toThrow()
  })

  it('字段 token 类型错 → 解析失败', () => {
    expect(() => api.PairTokenDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["token"] = 12345; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.PairTokenDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.PermissionPresetSchema', () => {
  const sample = "confirm-each"

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.PermissionPresetSchema.parse(sample)).toEqual(sample)
    expect(api.PermissionPresetSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.PermissionPresetSchema)).toBeTypeOf('object')
  })

  it('类型错（数字）→ 解析失败', () => {
    expect(() => api.PermissionPresetSchema.parse(12345)).toThrow()
  })
})

describe('契约：api.PermissionRuleDtoSchema', () => {
  const sample = {
    "action": "contract-sample",
    "resource": "contract-sample",
    "effect": "allow"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.PermissionRuleDtoSchema.parse(sample)).toEqual(sample)
    expect(api.PermissionRuleDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.PermissionRuleDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 action → 解析失败', () => {
    expect(() => api.PermissionRuleDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["action"]; return m })())).toThrow()
  })

  it('缺必填字段 resource → 解析失败', () => {
    expect(() => api.PermissionRuleDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["resource"]; return m })())).toThrow()
  })

  it('缺必填字段 effect → 解析失败', () => {
    expect(() => api.PermissionRuleDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["effect"]; return m })())).toThrow()
  })

  it('字段 action 类型错 → 解析失败', () => {
    expect(() => api.PermissionRuleDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["action"] = 12345; return m })())).toThrow()
  })

  it('字段 resource 类型错 → 解析失败', () => {
    expect(() => api.PermissionRuleDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["resource"] = 12345; return m })())).toThrow()
  })

  it('字段 effect 类型错 → 解析失败', () => {
    expect(() => api.PermissionRuleDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["effect"] = "__contract_bogus_enum__"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.PermissionRuleDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.RoutingDtoSchema', () => {
  const sample = {
    "fallbacks": [
      "contract-sample"
    ],
    "compactionModel": "contract-sample",
    "titleModel": "contract-sample",
    "subagentModel": "contract-sample",
    "costLimitUsd": 1,
    "usage": {
      "costUsd": 1,
      "inputTokens": 1,
      "outputTokens": 1,
      "exceeded": false
    }
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.RoutingDtoSchema.parse(sample)).toEqual(sample)
    expect(api.RoutingDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.RoutingDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 fallbacks → 解析失败', () => {
    expect(() => api.RoutingDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["fallbacks"]; return m })())).toThrow()
  })

  it('缺必填字段 compactionModel → 解析失败', () => {
    expect(() => api.RoutingDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["compactionModel"]; return m })())).toThrow()
  })

  it('缺必填字段 titleModel → 解析失败', () => {
    expect(() => api.RoutingDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["titleModel"]; return m })())).toThrow()
  })

  it('缺必填字段 subagentModel → 解析失败', () => {
    expect(() => api.RoutingDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["subagentModel"]; return m })())).toThrow()
  })

  it('缺必填字段 costLimitUsd → 解析失败', () => {
    expect(() => api.RoutingDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["costLimitUsd"]; return m })())).toThrow()
  })

  it('缺必填字段 usage → 解析失败', () => {
    expect(() => api.RoutingDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["usage"]; return m })())).toThrow()
  })

  it('字段 fallbacks 类型错 → 解析失败', () => {
    expect(() => api.RoutingDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["fallbacks"] = "not-an-array"; return m })())).toThrow()
  })

  it('字段 compactionModel 类型错 → 解析失败', () => {
    expect(() => api.RoutingDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["compactionModel"] = 12345; return m })())).toThrow()
  })

  it('字段 titleModel 类型错 → 解析失败', () => {
    expect(() => api.RoutingDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["titleModel"] = 12345; return m })())).toThrow()
  })

  it('字段 subagentModel 类型错 → 解析失败', () => {
    expect(() => api.RoutingDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["subagentModel"] = 12345; return m })())).toThrow()
  })

  it('字段 usage 类型错 → 解析失败', () => {
    expect(() => api.RoutingDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["usage"] = []; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.RoutingDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.RoutingUpdateSchema', () => {
  const sample = {
    "fallbacks": [
      "contract-sample"
    ],
    "compactionModel": "contract-sample",
    "titleModel": "contract-sample",
    "subagentModel": "contract-sample",
    "costLimitUsd": 1
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.RoutingUpdateSchema.parse(sample)).toEqual(sample)
    expect(api.RoutingUpdateSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.RoutingUpdateSchema)).toBeTypeOf('object')
  })

  it('字段 fallbacks 类型错 → 解析失败', () => {
    expect(() => api.RoutingUpdateSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["fallbacks"] = "not-an-array"; return m })())).toThrow()
  })

  it('字段 compactionModel 类型错 → 解析失败', () => {
    expect(() => api.RoutingUpdateSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["compactionModel"] = 12345; return m })())).toThrow()
  })

  it('字段 titleModel 类型错 → 解析失败', () => {
    expect(() => api.RoutingUpdateSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["titleModel"] = 12345; return m })())).toThrow()
  })

  it('字段 subagentModel 类型错 → 解析失败', () => {
    expect(() => api.RoutingUpdateSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["subagentModel"] = 12345; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.RoutingUpdateSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.RoutingUsageDtoSchema', () => {
  const sample = {
    "costUsd": 1,
    "inputTokens": 1,
    "outputTokens": 1,
    "exceeded": false
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.RoutingUsageDtoSchema.parse(sample)).toEqual(sample)
    expect(api.RoutingUsageDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.RoutingUsageDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 costUsd → 解析失败', () => {
    expect(() => api.RoutingUsageDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["costUsd"]; return m })())).toThrow()
  })

  it('缺必填字段 inputTokens → 解析失败', () => {
    expect(() => api.RoutingUsageDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["inputTokens"]; return m })())).toThrow()
  })

  it('缺必填字段 outputTokens → 解析失败', () => {
    expect(() => api.RoutingUsageDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["outputTokens"]; return m })())).toThrow()
  })

  it('缺必填字段 exceeded → 解析失败', () => {
    expect(() => api.RoutingUsageDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["exceeded"]; return m })())).toThrow()
  })

  it('字段 costUsd 类型错 → 解析失败', () => {
    expect(() => api.RoutingUsageDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["costUsd"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 inputTokens 类型错 → 解析失败', () => {
    expect(() => api.RoutingUsageDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["inputTokens"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 outputTokens 类型错 → 解析失败', () => {
    expect(() => api.RoutingUsageDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["outputTokens"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 exceeded 类型错 → 解析失败', () => {
    expect(() => api.RoutingUsageDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["exceeded"] = "not-a-boolean"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.RoutingUsageDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.SearchHitDtoSchema', () => {
  const sample = {
    "sessionId": "ses_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "sessionTitle": "contract-sample",
    "eventId": "evt_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "seq": 1,
    "type": "user.message",
    "time": 1,
    "snippet": "contract-sample"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.SearchHitDtoSchema.parse(sample)).toEqual(sample)
    expect(api.SearchHitDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.SearchHitDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 sessionId → 解析失败', () => {
    expect(() => api.SearchHitDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["sessionId"]; return m })())).toThrow()
  })

  it('缺必填字段 sessionTitle → 解析失败', () => {
    expect(() => api.SearchHitDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["sessionTitle"]; return m })())).toThrow()
  })

  it('缺必填字段 eventId → 解析失败', () => {
    expect(() => api.SearchHitDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["eventId"]; return m })())).toThrow()
  })

  it('缺必填字段 seq → 解析失败', () => {
    expect(() => api.SearchHitDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["seq"]; return m })())).toThrow()
  })

  it('缺必填字段 type → 解析失败', () => {
    expect(() => api.SearchHitDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["type"]; return m })())).toThrow()
  })

  it('缺必填字段 time → 解析失败', () => {
    expect(() => api.SearchHitDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["time"]; return m })())).toThrow()
  })

  it('缺必填字段 snippet → 解析失败', () => {
    expect(() => api.SearchHitDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["snippet"]; return m })())).toThrow()
  })

  it('字段 sessionId 类型错 → 解析失败', () => {
    expect(() => api.SearchHitDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["sessionId"] = 12345; return m })())).toThrow()
  })

  it('字段 sessionTitle 类型错 → 解析失败', () => {
    expect(() => api.SearchHitDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["sessionTitle"] = 12345; return m })())).toThrow()
  })

  it('字段 eventId 类型错 → 解析失败', () => {
    expect(() => api.SearchHitDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["eventId"] = 12345; return m })())).toThrow()
  })

  it('字段 seq 类型错 → 解析失败', () => {
    expect(() => api.SearchHitDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["seq"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 type 类型错 → 解析失败', () => {
    expect(() => api.SearchHitDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["type"] = "__contract_bogus_enum__"; return m })())).toThrow()
  })

  it('字段 time 类型错 → 解析失败', () => {
    expect(() => api.SearchHitDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["time"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 snippet 类型错 → 解析失败', () => {
    expect(() => api.SearchHitDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["snippet"] = 12345; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.SearchHitDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.SecretStatusDtoSchema', () => {
  const sample = {
    "provider": "contract-sample",
    "source": "store"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.SecretStatusDtoSchema.parse(sample)).toEqual(sample)
    expect(api.SecretStatusDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.SecretStatusDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 provider → 解析失败', () => {
    expect(() => api.SecretStatusDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["provider"]; return m })())).toThrow()
  })

  it('缺必填字段 source → 解析失败', () => {
    expect(() => api.SecretStatusDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["source"]; return m })())).toThrow()
  })

  it('字段 provider 类型错 → 解析失败', () => {
    expect(() => api.SecretStatusDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["provider"] = 12345; return m })())).toThrow()
  })

  it('字段 source 类型错 → 解析失败', () => {
    expect(() => api.SecretStatusDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["source"] = "__contract_bogus_enum__"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.SecretStatusDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.SessionMetaDtoSchema', () => {
  const sample = {
    "id": "ses_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "title": "contract-sample",
    "model": "contract-sample",
    "cwd": "contract-sample",
    "createdAt": 1,
    "updatedAt": 1,
    "lastSeq": 1,
    "status": "idle",
    "branch": "contract-sample",
    "effort": "low",
    "archivedAt": "contract-sample"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.SessionMetaDtoSchema.parse(sample)).toEqual(sample)
    expect(api.SessionMetaDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.SessionMetaDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 id → 解析失败', () => {
    expect(() => api.SessionMetaDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["id"]; return m })())).toThrow()
  })

  it('缺必填字段 title → 解析失败', () => {
    expect(() => api.SessionMetaDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["title"]; return m })())).toThrow()
  })

  it('缺必填字段 model → 解析失败', () => {
    expect(() => api.SessionMetaDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["model"]; return m })())).toThrow()
  })

  it('缺必填字段 cwd → 解析失败', () => {
    expect(() => api.SessionMetaDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["cwd"]; return m })())).toThrow()
  })

  it('缺必填字段 createdAt → 解析失败', () => {
    expect(() => api.SessionMetaDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["createdAt"]; return m })())).toThrow()
  })

  it('缺必填字段 updatedAt → 解析失败', () => {
    expect(() => api.SessionMetaDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["updatedAt"]; return m })())).toThrow()
  })

  it('缺必填字段 lastSeq → 解析失败', () => {
    expect(() => api.SessionMetaDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["lastSeq"]; return m })())).toThrow()
  })

  it('缺必填字段 status → 解析失败', () => {
    expect(() => api.SessionMetaDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["status"]; return m })())).toThrow()
  })

  it('字段 id 类型错 → 解析失败', () => {
    expect(() => api.SessionMetaDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["id"] = 12345; return m })())).toThrow()
  })

  it('字段 title 类型错 → 解析失败', () => {
    expect(() => api.SessionMetaDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["title"] = 12345; return m })())).toThrow()
  })

  it('字段 model 类型错 → 解析失败', () => {
    expect(() => api.SessionMetaDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["model"] = 12345; return m })())).toThrow()
  })

  it('字段 cwd 类型错 → 解析失败', () => {
    expect(() => api.SessionMetaDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["cwd"] = 12345; return m })())).toThrow()
  })

  it('字段 createdAt 类型错 → 解析失败', () => {
    expect(() => api.SessionMetaDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["createdAt"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 updatedAt 类型错 → 解析失败', () => {
    expect(() => api.SessionMetaDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["updatedAt"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 lastSeq 类型错 → 解析失败', () => {
    expect(() => api.SessionMetaDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["lastSeq"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 status 类型错 → 解析失败', () => {
    expect(() => api.SessionMetaDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["status"] = "__contract_bogus_enum__"; return m })())).toThrow()
  })

  it('字段 branch 类型错 → 解析失败', () => {
    expect(() => api.SessionMetaDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["branch"] = 12345; return m })())).toThrow()
  })

  it('字段 effort 类型错 → 解析失败', () => {
    expect(() => api.SessionMetaDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["effort"] = "__contract_bogus_enum__"; return m })())).toThrow()
  })

  it('字段 archivedAt 类型错 → 解析失败', () => {
    expect(() => api.SessionMetaDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["archivedAt"] = 12345; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.SessionMetaDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.SessionStatusSchema', () => {
  const sample = "idle"

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.SessionStatusSchema.parse(sample)).toEqual(sample)
    expect(api.SessionStatusSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.SessionStatusSchema)).toBeTypeOf('object')
  })

  it('类型错（数字）→ 解析失败', () => {
    expect(() => api.SessionStatusSchema.parse(12345)).toThrow()
  })
})

describe('契约：api.SettingsDtoSchema', () => {
  const sample = {
    "server": {
      "port": 1,
      "host": "contract-sample"
    },
    "engine": {
      "maxStepsPerTurn": 1,
      "maxToolParallel": 1,
      "toolTimeoutMs": 1,
      "permissionTimeoutMs": 1,
      "progressThrottleMs": 1,
      "toolOutputLimitKB": 1,
      "compactionThreshold": 1,
      "checkpoints": false,
      "bashSandbox": "off"
    },
    "hooks": {
      "turn.before": [
        {
          "command": "contract-sample",
          "timeoutMs": 1
        }
      ],
      "turn.after": [
        {
          "command": "contract-sample",
          "timeoutMs": 1
        }
      ],
      "permission.resolved": [
        {
          "command": "contract-sample",
          "timeoutMs": 1
        }
      ],
      "tool.completed": [
        {
          "command": "contract-sample",
          "timeoutMs": 1
        }
      ]
    },
    "restartRequired": [
      "contract-sample"
    ],
    "models": {
      "defaultModel": "contract-sample",
      "defaultEffort": "low"
    }
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.SettingsDtoSchema.parse(sample)).toEqual(sample)
    expect(api.SettingsDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.SettingsDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 server → 解析失败', () => {
    expect(() => api.SettingsDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["server"]; return m })())).toThrow()
  })

  it('缺必填字段 engine → 解析失败', () => {
    expect(() => api.SettingsDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["engine"]; return m })())).toThrow()
  })

  it('缺必填字段 restartRequired → 解析失败', () => {
    expect(() => api.SettingsDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["restartRequired"]; return m })())).toThrow()
  })

  it('缺必填字段 models → 解析失败', () => {
    expect(() => api.SettingsDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["models"]; return m })())).toThrow()
  })

  it('字段 server 类型错 → 解析失败', () => {
    expect(() => api.SettingsDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["server"] = []; return m })())).toThrow()
  })

  it('字段 engine 类型错 → 解析失败', () => {
    expect(() => api.SettingsDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["engine"] = []; return m })())).toThrow()
  })

  it('字段 hooks 类型错 → 解析失败', () => {
    expect(() => api.SettingsDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["hooks"] = []; return m })())).toThrow()
  })

  it('字段 restartRequired 类型错 → 解析失败', () => {
    expect(() => api.SettingsDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["restartRequired"] = "not-an-array"; return m })())).toThrow()
  })

  it('字段 models 类型错 → 解析失败', () => {
    expect(() => api.SettingsDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["models"] = []; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.SettingsDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.SettingsHookDefSchema', () => {
  const sample = {
    "command": "contract-sample",
    "timeoutMs": 1
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.SettingsHookDefSchema.parse(sample)).toEqual(sample)
    expect(api.SettingsHookDefSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.SettingsHookDefSchema)).toBeTypeOf('object')
  })
})

describe('契约：api.SettingsHooksSchema', () => {
  const sample = {
    "turn.before": [
      {
        "command": "contract-sample",
        "timeoutMs": 1
      }
    ],
    "turn.after": [
      {
        "command": "contract-sample",
        "timeoutMs": 1
      }
    ],
    "permission.resolved": [
      {
        "command": "contract-sample",
        "timeoutMs": 1
      }
    ],
    "tool.completed": [
      {
        "command": "contract-sample",
        "timeoutMs": 1
      }
    ]
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.SettingsHooksSchema.parse(sample)).toEqual(sample)
    expect(api.SettingsHooksSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.SettingsHooksSchema)).toBeTypeOf('object')
  })

  it('字段 turn.before 类型错 → 解析失败', () => {
    expect(() => api.SettingsHooksSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["turn.before"] = "not-an-array"; return m })())).toThrow()
  })

  it('字段 turn.after 类型错 → 解析失败', () => {
    expect(() => api.SettingsHooksSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["turn.after"] = "not-an-array"; return m })())).toThrow()
  })

  it('字段 permission.resolved 类型错 → 解析失败', () => {
    expect(() => api.SettingsHooksSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["permission.resolved"] = "not-an-array"; return m })())).toThrow()
  })

  it('字段 tool.completed 类型错 → 解析失败', () => {
    expect(() => api.SettingsHooksSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["tool.completed"] = "not-an-array"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.SettingsHooksSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.SettingsPromptsSchema', () => {
  const sample = {
    "base": "contract-sample",
    "compaction": "contract-sample",
    "title": "contract-sample"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.SettingsPromptsSchema.parse(sample)).toEqual(sample)
    expect(api.SettingsPromptsSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.SettingsPromptsSchema)).toBeTypeOf('object')
  })

  it('字段 base 类型错 → 解析失败', () => {
    expect(() => api.SettingsPromptsSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["base"] = 12345; return m })())).toThrow()
  })

  it('字段 compaction 类型错 → 解析失败', () => {
    expect(() => api.SettingsPromptsSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["compaction"] = 12345; return m })())).toThrow()
  })

  it('字段 title 类型错 → 解析失败', () => {
    expect(() => api.SettingsPromptsSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["title"] = 12345; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.SettingsPromptsSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.SettingsUpdateSchema', () => {
  const sample = {
    "server": {
      "port": 1,
      "host": "contract-sample"
    },
    "engine": {
      "maxStepsPerTurn": 1,
      "maxToolParallel": 1,
      "toolTimeoutMs": 1,
      "permissionTimeoutMs": 1,
      "progressThrottleMs": 1,
      "toolOutputLimitKB": 1,
      "compactionThreshold": 1,
      "checkpoints": false,
      "bashSandbox": "off"
    },
    "hooks": {
      "turn.before": [
        {
          "command": "contract-sample",
          "timeoutMs": 1
        }
      ],
      "turn.after": [
        {
          "command": "contract-sample",
          "timeoutMs": 1
        }
      ],
      "permission.resolved": [
        {
          "command": "contract-sample",
          "timeoutMs": 1
        }
      ],
      "tool.completed": [
        {
          "command": "contract-sample",
          "timeoutMs": 1
        }
      ]
    }
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.SettingsUpdateSchema.parse(sample)).toEqual(sample)
    expect(api.SettingsUpdateSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.SettingsUpdateSchema)).toBeTypeOf('object')
  })

  it('字段 server 类型错 → 解析失败', () => {
    expect(() => api.SettingsUpdateSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["server"] = []; return m })())).toThrow()
  })

  it('字段 engine 类型错 → 解析失败', () => {
    expect(() => api.SettingsUpdateSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["engine"] = []; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.SettingsUpdateSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.SkillDtoSchema', () => {
  const sample = {
    "name": "contract-sample",
    "events": [
      "contract-sample"
    ],
    "hooks": [
      {
        "on": "contract-sample",
        "emit": "contract-sample"
      }
    ]
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.SkillDtoSchema.parse(sample)).toEqual(sample)
    expect(api.SkillDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.SkillDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 name → 解析失败', () => {
    expect(() => api.SkillDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["name"]; return m })())).toThrow()
  })

  it('缺必填字段 events → 解析失败', () => {
    expect(() => api.SkillDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["events"]; return m })())).toThrow()
  })

  it('缺必填字段 hooks → 解析失败', () => {
    expect(() => api.SkillDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["hooks"]; return m })())).toThrow()
  })

  it('字段 name 类型错 → 解析失败', () => {
    expect(() => api.SkillDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["name"] = 12345; return m })())).toThrow()
  })

  it('字段 events 类型错 → 解析失败', () => {
    expect(() => api.SkillDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["events"] = "not-an-array"; return m })())).toThrow()
  })

  it('字段 hooks 类型错 → 解析失败', () => {
    expect(() => api.SkillDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["hooks"] = "not-an-array"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.SkillDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.TraceDtoSchema', () => {
  const sample = {
    "sessionId": "ses_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "totals": {
      "turns": 1,
      "steps": 1,
      "toolCalls": 1,
      "toolErrors": 1,
      "errors": 1,
      "durationMs": 1,
      "usage": {
        "costUsd": 1,
        "inputTokens": 1,
        "outputTokens": 1,
        "cacheRead": 1,
        "cacheWrite": 1
      }
    },
    "turns": [
      {
        "turnId": "trn_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        "delivery": "now",
        "startedAt": 1,
        "durationMs": 1,
        "finish": "stop",
        "steps": [
          {
            "index": 1,
            "at": 1,
            "durationMs": 1,
            "toolCalls": 1,
            "usage": {
              "costUsd": 1,
              "inputTokens": 1,
              "outputTokens": 1,
              "cacheRead": 1,
              "cacheWrite": 1
            }
          }
        ],
        "tools": [
          {
            "callId": "call_contract_sample_1",
            "name": "contract-sample",
            "startedAt": 1,
            "durationMs": 1,
            "isError": false,
            "retry": false,
            "approvalAsked": false,
            "warnings": [
              "injection"
            ]
          }
        ],
        "marks": [
          {
            "at": 1,
            "kind": "compaction",
            "label": "contract-sample"
          }
        ],
        "errors": [
          {
            "at": 1,
            "scope": "engine",
            "message": "contract-sample",
            "fatal": false
          }
        ],
        "usage": {
          "costUsd": 1,
          "inputTokens": 1,
          "outputTokens": 1,
          "cacheRead": 1,
          "cacheWrite": 1
        }
      }
    ],
    "looseErrors": [
      {
        "at": 1,
        "scope": "engine",
        "message": "contract-sample",
        "fatal": false
      }
    ]
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.TraceDtoSchema.parse(sample)).toEqual(sample)
    expect(api.TraceDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.TraceDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 sessionId → 解析失败', () => {
    expect(() => api.TraceDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["sessionId"]; return m })())).toThrow()
  })

  it('缺必填字段 totals → 解析失败', () => {
    expect(() => api.TraceDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["totals"]; return m })())).toThrow()
  })

  it('缺必填字段 turns → 解析失败', () => {
    expect(() => api.TraceDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["turns"]; return m })())).toThrow()
  })

  it('缺必填字段 looseErrors → 解析失败', () => {
    expect(() => api.TraceDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["looseErrors"]; return m })())).toThrow()
  })

  it('字段 sessionId 类型错 → 解析失败', () => {
    expect(() => api.TraceDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["sessionId"] = 12345; return m })())).toThrow()
  })

  it('字段 totals 类型错 → 解析失败', () => {
    expect(() => api.TraceDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["totals"] = []; return m })())).toThrow()
  })

  it('字段 turns 类型错 → 解析失败', () => {
    expect(() => api.TraceDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["turns"] = "not-an-array"; return m })())).toThrow()
  })

  it('字段 looseErrors 类型错 → 解析失败', () => {
    expect(() => api.TraceDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["looseErrors"] = "not-an-array"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.TraceDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.TraceErrorDtoSchema', () => {
  const sample = {
    "at": 1,
    "scope": "engine",
    "message": "contract-sample",
    "fatal": false
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.TraceErrorDtoSchema.parse(sample)).toEqual(sample)
    expect(api.TraceErrorDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.TraceErrorDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 at → 解析失败', () => {
    expect(() => api.TraceErrorDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["at"]; return m })())).toThrow()
  })

  it('缺必填字段 scope → 解析失败', () => {
    expect(() => api.TraceErrorDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["scope"]; return m })())).toThrow()
  })

  it('缺必填字段 message → 解析失败', () => {
    expect(() => api.TraceErrorDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["message"]; return m })())).toThrow()
  })

  it('缺必填字段 fatal → 解析失败', () => {
    expect(() => api.TraceErrorDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["fatal"]; return m })())).toThrow()
  })

  it('字段 at 类型错 → 解析失败', () => {
    expect(() => api.TraceErrorDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["at"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 scope 类型错 → 解析失败', () => {
    expect(() => api.TraceErrorDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["scope"] = "__contract_bogus_enum__"; return m })())).toThrow()
  })

  it('字段 message 类型错 → 解析失败', () => {
    expect(() => api.TraceErrorDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["message"] = 12345; return m })())).toThrow()
  })

  it('字段 fatal 类型错 → 解析失败', () => {
    expect(() => api.TraceErrorDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["fatal"] = "not-a-boolean"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.TraceErrorDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.TraceMarkDtoSchema', () => {
  const sample = {
    "at": 1,
    "kind": "compaction",
    "label": "contract-sample"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.TraceMarkDtoSchema.parse(sample)).toEqual(sample)
    expect(api.TraceMarkDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.TraceMarkDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 at → 解析失败', () => {
    expect(() => api.TraceMarkDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["at"]; return m })())).toThrow()
  })

  it('缺必填字段 kind → 解析失败', () => {
    expect(() => api.TraceMarkDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["kind"]; return m })())).toThrow()
  })

  it('缺必填字段 label → 解析失败', () => {
    expect(() => api.TraceMarkDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["label"]; return m })())).toThrow()
  })

  it('字段 at 类型错 → 解析失败', () => {
    expect(() => api.TraceMarkDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["at"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 kind 类型错 → 解析失败', () => {
    expect(() => api.TraceMarkDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["kind"] = "__contract_bogus_enum__"; return m })())).toThrow()
  })

  it('字段 label 类型错 → 解析失败', () => {
    expect(() => api.TraceMarkDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["label"] = 12345; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.TraceMarkDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.TraceStepDtoSchema', () => {
  const sample = {
    "index": 1,
    "at": 1,
    "durationMs": 1,
    "toolCalls": 1,
    "usage": {
      "costUsd": 1,
      "inputTokens": 1,
      "outputTokens": 1,
      "cacheRead": 1,
      "cacheWrite": 1
    }
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.TraceStepDtoSchema.parse(sample)).toEqual(sample)
    expect(api.TraceStepDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.TraceStepDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 index → 解析失败', () => {
    expect(() => api.TraceStepDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["index"]; return m })())).toThrow()
  })

  it('缺必填字段 at → 解析失败', () => {
    expect(() => api.TraceStepDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["at"]; return m })())).toThrow()
  })

  it('缺必填字段 durationMs → 解析失败', () => {
    expect(() => api.TraceStepDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["durationMs"]; return m })())).toThrow()
  })

  it('缺必填字段 toolCalls → 解析失败', () => {
    expect(() => api.TraceStepDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["toolCalls"]; return m })())).toThrow()
  })

  it('缺必填字段 usage → 解析失败', () => {
    expect(() => api.TraceStepDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["usage"]; return m })())).toThrow()
  })

  it('字段 index 类型错 → 解析失败', () => {
    expect(() => api.TraceStepDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["index"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 at 类型错 → 解析失败', () => {
    expect(() => api.TraceStepDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["at"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 durationMs 类型错 → 解析失败', () => {
    expect(() => api.TraceStepDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["durationMs"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 toolCalls 类型错 → 解析失败', () => {
    expect(() => api.TraceStepDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["toolCalls"] = "not-a-number"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.TraceStepDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.TraceToolDtoSchema', () => {
  const sample = {
    "callId": "call_contract_sample_1",
    "name": "contract-sample",
    "startedAt": 1,
    "durationMs": 1,
    "isError": false,
    "retry": false,
    "approvalAsked": false,
    "warnings": [
      "injection"
    ]
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.TraceToolDtoSchema.parse(sample)).toEqual(sample)
    expect(api.TraceToolDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.TraceToolDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 callId → 解析失败', () => {
    expect(() => api.TraceToolDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["callId"]; return m })())).toThrow()
  })

  it('缺必填字段 name → 解析失败', () => {
    expect(() => api.TraceToolDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["name"]; return m })())).toThrow()
  })

  it('缺必填字段 startedAt → 解析失败', () => {
    expect(() => api.TraceToolDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["startedAt"]; return m })())).toThrow()
  })

  it('缺必填字段 durationMs → 解析失败', () => {
    expect(() => api.TraceToolDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["durationMs"]; return m })())).toThrow()
  })

  it('缺必填字段 isError → 解析失败', () => {
    expect(() => api.TraceToolDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["isError"]; return m })())).toThrow()
  })

  it('缺必填字段 retry → 解析失败', () => {
    expect(() => api.TraceToolDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["retry"]; return m })())).toThrow()
  })

  it('缺必填字段 approvalAsked → 解析失败', () => {
    expect(() => api.TraceToolDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["approvalAsked"]; return m })())).toThrow()
  })

  it('缺必填字段 warnings → 解析失败', () => {
    expect(() => api.TraceToolDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["warnings"]; return m })())).toThrow()
  })

  it('字段 callId 类型错 → 解析失败', () => {
    expect(() => api.TraceToolDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["callId"] = 12345; return m })())).toThrow()
  })

  it('字段 name 类型错 → 解析失败', () => {
    expect(() => api.TraceToolDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["name"] = 12345; return m })())).toThrow()
  })

  it('字段 startedAt 类型错 → 解析失败', () => {
    expect(() => api.TraceToolDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["startedAt"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 isError 类型错 → 解析失败', () => {
    expect(() => api.TraceToolDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["isError"] = "not-a-boolean"; return m })())).toThrow()
  })

  it('字段 retry 类型错 → 解析失败', () => {
    expect(() => api.TraceToolDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["retry"] = "not-a-boolean"; return m })())).toThrow()
  })

  it('字段 approvalAsked 类型错 → 解析失败', () => {
    expect(() => api.TraceToolDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["approvalAsked"] = "not-a-boolean"; return m })())).toThrow()
  })

  it('字段 warnings 类型错 → 解析失败', () => {
    expect(() => api.TraceToolDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["warnings"] = "not-an-array"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.TraceToolDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.TraceTotalsDtoSchema', () => {
  const sample = {
    "turns": 1,
    "steps": 1,
    "toolCalls": 1,
    "toolErrors": 1,
    "errors": 1,
    "durationMs": 1,
    "usage": {
      "costUsd": 1,
      "inputTokens": 1,
      "outputTokens": 1,
      "cacheRead": 1,
      "cacheWrite": 1
    }
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.TraceTotalsDtoSchema.parse(sample)).toEqual(sample)
    expect(api.TraceTotalsDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.TraceTotalsDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 turns → 解析失败', () => {
    expect(() => api.TraceTotalsDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["turns"]; return m })())).toThrow()
  })

  it('缺必填字段 steps → 解析失败', () => {
    expect(() => api.TraceTotalsDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["steps"]; return m })())).toThrow()
  })

  it('缺必填字段 toolCalls → 解析失败', () => {
    expect(() => api.TraceTotalsDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["toolCalls"]; return m })())).toThrow()
  })

  it('缺必填字段 toolErrors → 解析失败', () => {
    expect(() => api.TraceTotalsDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["toolErrors"]; return m })())).toThrow()
  })

  it('缺必填字段 errors → 解析失败', () => {
    expect(() => api.TraceTotalsDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["errors"]; return m })())).toThrow()
  })

  it('缺必填字段 durationMs → 解析失败', () => {
    expect(() => api.TraceTotalsDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["durationMs"]; return m })())).toThrow()
  })

  it('缺必填字段 usage → 解析失败', () => {
    expect(() => api.TraceTotalsDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["usage"]; return m })())).toThrow()
  })

  it('字段 turns 类型错 → 解析失败', () => {
    expect(() => api.TraceTotalsDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["turns"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 steps 类型错 → 解析失败', () => {
    expect(() => api.TraceTotalsDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["steps"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 toolCalls 类型错 → 解析失败', () => {
    expect(() => api.TraceTotalsDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["toolCalls"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 toolErrors 类型错 → 解析失败', () => {
    expect(() => api.TraceTotalsDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["toolErrors"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 errors 类型错 → 解析失败', () => {
    expect(() => api.TraceTotalsDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["errors"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 durationMs 类型错 → 解析失败', () => {
    expect(() => api.TraceTotalsDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["durationMs"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 usage 类型错 → 解析失败', () => {
    expect(() => api.TraceTotalsDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["usage"] = []; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.TraceTotalsDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.TraceTurnDtoSchema', () => {
  const sample = {
    "turnId": "trn_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "delivery": "now",
    "startedAt": 1,
    "durationMs": 1,
    "finish": "stop",
    "steps": [
      {
        "index": 1,
        "at": 1,
        "durationMs": 1,
        "toolCalls": 1,
        "usage": {
          "costUsd": 1,
          "inputTokens": 1,
          "outputTokens": 1,
          "cacheRead": 1,
          "cacheWrite": 1
        }
      }
    ],
    "tools": [
      {
        "callId": "call_contract_sample_1",
        "name": "contract-sample",
        "startedAt": 1,
        "durationMs": 1,
        "isError": false,
        "retry": false,
        "approvalAsked": false,
        "warnings": [
          "injection"
        ]
      }
    ],
    "marks": [
      {
        "at": 1,
        "kind": "compaction",
        "label": "contract-sample"
      }
    ],
    "errors": [
      {
        "at": 1,
        "scope": "engine",
        "message": "contract-sample",
        "fatal": false
      }
    ],
    "usage": {
      "costUsd": 1,
      "inputTokens": 1,
      "outputTokens": 1,
      "cacheRead": 1,
      "cacheWrite": 1
    }
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.TraceTurnDtoSchema.parse(sample)).toEqual(sample)
    expect(api.TraceTurnDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.TraceTurnDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 turnId → 解析失败', () => {
    expect(() => api.TraceTurnDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["turnId"]; return m })())).toThrow()
  })

  it('缺必填字段 delivery → 解析失败', () => {
    expect(() => api.TraceTurnDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["delivery"]; return m })())).toThrow()
  })

  it('缺必填字段 startedAt → 解析失败', () => {
    expect(() => api.TraceTurnDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["startedAt"]; return m })())).toThrow()
  })

  it('缺必填字段 durationMs → 解析失败', () => {
    expect(() => api.TraceTurnDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["durationMs"]; return m })())).toThrow()
  })

  it('缺必填字段 finish → 解析失败', () => {
    expect(() => api.TraceTurnDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["finish"]; return m })())).toThrow()
  })

  it('缺必填字段 steps → 解析失败', () => {
    expect(() => api.TraceTurnDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["steps"]; return m })())).toThrow()
  })

  it('缺必填字段 tools → 解析失败', () => {
    expect(() => api.TraceTurnDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["tools"]; return m })())).toThrow()
  })

  it('缺必填字段 marks → 解析失败', () => {
    expect(() => api.TraceTurnDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["marks"]; return m })())).toThrow()
  })

  it('缺必填字段 errors → 解析失败', () => {
    expect(() => api.TraceTurnDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["errors"]; return m })())).toThrow()
  })

  it('缺必填字段 usage → 解析失败', () => {
    expect(() => api.TraceTurnDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["usage"]; return m })())).toThrow()
  })

  it('字段 turnId 类型错 → 解析失败', () => {
    expect(() => api.TraceTurnDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["turnId"] = 12345; return m })())).toThrow()
  })

  it('字段 delivery 类型错 → 解析失败', () => {
    expect(() => api.TraceTurnDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["delivery"] = "__contract_bogus_enum__"; return m })())).toThrow()
  })

  it('字段 startedAt 类型错 → 解析失败', () => {
    expect(() => api.TraceTurnDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["startedAt"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 durationMs 类型错 → 解析失败', () => {
    expect(() => api.TraceTurnDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["durationMs"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 steps 类型错 → 解析失败', () => {
    expect(() => api.TraceTurnDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["steps"] = "not-an-array"; return m })())).toThrow()
  })

  it('字段 tools 类型错 → 解析失败', () => {
    expect(() => api.TraceTurnDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["tools"] = "not-an-array"; return m })())).toThrow()
  })

  it('字段 marks 类型错 → 解析失败', () => {
    expect(() => api.TraceTurnDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["marks"] = "not-an-array"; return m })())).toThrow()
  })

  it('字段 errors 类型错 → 解析失败', () => {
    expect(() => api.TraceTurnDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["errors"] = "not-an-array"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.TraceTurnDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.TreeNodeDtoSchema', () => {
  const sample = {
    "id": "evt_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "parentId": "evt_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "seq": 1,
    "type": "contract-sample",
    "time": 1,
    "label": "contract-sample",
    "childIds": [
      "evt_01ARZ3NDEKTSV4RRFFQ69G5FAV"
    ],
    "forks": [
      {
        "sessionId": "ses_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        "title": "contract-sample",
        "createdAt": 1,
        "status": "idle"
      }
    ]
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.TreeNodeDtoSchema.parse(sample)).toEqual(sample)
    expect(api.TreeNodeDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.TreeNodeDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 id → 解析失败', () => {
    expect(() => api.TreeNodeDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["id"]; return m })())).toThrow()
  })

  it('缺必填字段 parentId → 解析失败', () => {
    expect(() => api.TreeNodeDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["parentId"]; return m })())).toThrow()
  })

  it('缺必填字段 seq → 解析失败', () => {
    expect(() => api.TreeNodeDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["seq"]; return m })())).toThrow()
  })

  it('缺必填字段 type → 解析失败', () => {
    expect(() => api.TreeNodeDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["type"]; return m })())).toThrow()
  })

  it('缺必填字段 time → 解析失败', () => {
    expect(() => api.TreeNodeDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["time"]; return m })())).toThrow()
  })

  it('缺必填字段 label → 解析失败', () => {
    expect(() => api.TreeNodeDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["label"]; return m })())).toThrow()
  })

  it('缺必填字段 childIds → 解析失败', () => {
    expect(() => api.TreeNodeDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["childIds"]; return m })())).toThrow()
  })

  it('缺必填字段 forks → 解析失败', () => {
    expect(() => api.TreeNodeDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["forks"]; return m })())).toThrow()
  })

  it('字段 id 类型错 → 解析失败', () => {
    expect(() => api.TreeNodeDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["id"] = 12345; return m })())).toThrow()
  })

  it('字段 seq 类型错 → 解析失败', () => {
    expect(() => api.TreeNodeDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["seq"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 type 类型错 → 解析失败', () => {
    expect(() => api.TreeNodeDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["type"] = 12345; return m })())).toThrow()
  })

  it('字段 time 类型错 → 解析失败', () => {
    expect(() => api.TreeNodeDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["time"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 label 类型错 → 解析失败', () => {
    expect(() => api.TreeNodeDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["label"] = 12345; return m })())).toThrow()
  })

  it('字段 childIds 类型错 → 解析失败', () => {
    expect(() => api.TreeNodeDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["childIds"] = "not-an-array"; return m })())).toThrow()
  })

  it('字段 forks 类型错 → 解析失败', () => {
    expect(() => api.TreeNodeDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["forks"] = "not-an-array"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.TreeNodeDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.UsageAmountsSchema', () => {
  const sample = {
    "costUsd": 1,
    "inputTokens": 1,
    "outputTokens": 1,
    "cacheRead": 1,
    "cacheWrite": 1
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.UsageAmountsSchema.parse(sample)).toEqual(sample)
    expect(api.UsageAmountsSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.UsageAmountsSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 costUsd → 解析失败', () => {
    expect(() => api.UsageAmountsSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["costUsd"]; return m })())).toThrow()
  })

  it('缺必填字段 inputTokens → 解析失败', () => {
    expect(() => api.UsageAmountsSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["inputTokens"]; return m })())).toThrow()
  })

  it('缺必填字段 outputTokens → 解析失败', () => {
    expect(() => api.UsageAmountsSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["outputTokens"]; return m })())).toThrow()
  })

  it('缺必填字段 cacheRead → 解析失败', () => {
    expect(() => api.UsageAmountsSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["cacheRead"]; return m })())).toThrow()
  })

  it('缺必填字段 cacheWrite → 解析失败', () => {
    expect(() => api.UsageAmountsSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["cacheWrite"]; return m })())).toThrow()
  })

  it('字段 costUsd 类型错 → 解析失败', () => {
    expect(() => api.UsageAmountsSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["costUsd"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 inputTokens 类型错 → 解析失败', () => {
    expect(() => api.UsageAmountsSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["inputTokens"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 outputTokens 类型错 → 解析失败', () => {
    expect(() => api.UsageAmountsSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["outputTokens"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 cacheRead 类型错 → 解析失败', () => {
    expect(() => api.UsageAmountsSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["cacheRead"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 cacheWrite 类型错 → 解析失败', () => {
    expect(() => api.UsageAmountsSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["cacheWrite"] = "not-a-number"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.UsageAmountsSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.UsageBucketDtoSchema', () => {
  const sample = {
    "costUsd": 1,
    "inputTokens": 1,
    "outputTokens": 1,
    "cacheRead": 1,
    "cacheWrite": 1,
    "day": "2026-09-09",
    "provider": "contract-sample",
    "model": "contract-sample"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.UsageBucketDtoSchema.parse(sample)).toEqual(sample)
    expect(api.UsageBucketDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.UsageBucketDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 costUsd → 解析失败', () => {
    expect(() => api.UsageBucketDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["costUsd"]; return m })())).toThrow()
  })

  it('缺必填字段 inputTokens → 解析失败', () => {
    expect(() => api.UsageBucketDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["inputTokens"]; return m })())).toThrow()
  })

  it('缺必填字段 outputTokens → 解析失败', () => {
    expect(() => api.UsageBucketDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["outputTokens"]; return m })())).toThrow()
  })

  it('缺必填字段 cacheRead → 解析失败', () => {
    expect(() => api.UsageBucketDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["cacheRead"]; return m })())).toThrow()
  })

  it('缺必填字段 cacheWrite → 解析失败', () => {
    expect(() => api.UsageBucketDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["cacheWrite"]; return m })())).toThrow()
  })

  it('缺必填字段 day → 解析失败', () => {
    expect(() => api.UsageBucketDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["day"]; return m })())).toThrow()
  })

  it('缺必填字段 provider → 解析失败', () => {
    expect(() => api.UsageBucketDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["provider"]; return m })())).toThrow()
  })

  it('缺必填字段 model → 解析失败', () => {
    expect(() => api.UsageBucketDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["model"]; return m })())).toThrow()
  })

  it('字段 costUsd 类型错 → 解析失败', () => {
    expect(() => api.UsageBucketDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["costUsd"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 inputTokens 类型错 → 解析失败', () => {
    expect(() => api.UsageBucketDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["inputTokens"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 outputTokens 类型错 → 解析失败', () => {
    expect(() => api.UsageBucketDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["outputTokens"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 cacheRead 类型错 → 解析失败', () => {
    expect(() => api.UsageBucketDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["cacheRead"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 cacheWrite 类型错 → 解析失败', () => {
    expect(() => api.UsageBucketDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["cacheWrite"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 day 类型错 → 解析失败', () => {
    expect(() => api.UsageBucketDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["day"] = 12345; return m })())).toThrow()
  })

  it('字段 provider 类型错 → 解析失败', () => {
    expect(() => api.UsageBucketDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["provider"] = 12345; return m })())).toThrow()
  })

  it('字段 model 类型错 → 解析失败', () => {
    expect(() => api.UsageBucketDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["model"] = 12345; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.UsageBucketDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.UsageSummaryDtoSchema', () => {
  const sample = {
    "total": {
      "costUsd": 1,
      "inputTokens": 1,
      "outputTokens": 1,
      "cacheRead": 1,
      "cacheWrite": 1
    },
    "buckets": [
      {
        "costUsd": 1,
        "inputTokens": 1,
        "outputTokens": 1,
        "cacheRead": 1,
        "cacheWrite": 1,
        "day": "2026-09-09",
        "provider": "contract-sample",
        "model": "contract-sample"
      }
    ],
    "unbucketed": {
      "costUsd": 1,
      "inputTokens": 1,
      "outputTokens": 1,
      "cacheRead": 1,
      "cacheWrite": 1
    },
    "costLimitUsd": 1,
    "exceeded": false
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.UsageSummaryDtoSchema.parse(sample)).toEqual(sample)
    expect(api.UsageSummaryDtoSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.UsageSummaryDtoSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 total → 解析失败', () => {
    expect(() => api.UsageSummaryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["total"]; return m })())).toThrow()
  })

  it('缺必填字段 buckets → 解析失败', () => {
    expect(() => api.UsageSummaryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["buckets"]; return m })())).toThrow()
  })

  it('缺必填字段 unbucketed → 解析失败', () => {
    expect(() => api.UsageSummaryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["unbucketed"]; return m })())).toThrow()
  })

  it('缺必填字段 costLimitUsd → 解析失败', () => {
    expect(() => api.UsageSummaryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["costLimitUsd"]; return m })())).toThrow()
  })

  it('缺必填字段 exceeded → 解析失败', () => {
    expect(() => api.UsageSummaryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["exceeded"]; return m })())).toThrow()
  })

  it('字段 total 类型错 → 解析失败', () => {
    expect(() => api.UsageSummaryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["total"] = []; return m })())).toThrow()
  })

  it('字段 buckets 类型错 → 解析失败', () => {
    expect(() => api.UsageSummaryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["buckets"] = "not-an-array"; return m })())).toThrow()
  })

  it('字段 unbucketed 类型错 → 解析失败', () => {
    expect(() => api.UsageSummaryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["unbucketed"] = []; return m })())).toThrow()
  })

  it('字段 exceeded 类型错 → 解析失败', () => {
    expect(() => api.UsageSummaryDtoSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["exceeded"] = "not-a-boolean"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.UsageSummaryDtoSchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：api.UsageSummaryQuerySchema', () => {
  const sample = {
    "since": "2026-09-09"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(api.UsageSummaryQuerySchema.parse(sample)).toEqual(sample)
    expect(api.UsageSummaryQuerySchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(api.UsageSummaryQuerySchema)).toBeTypeOf('object')
  })

  it('字段 since 类型错 → 解析失败', () => {
    expect(() => api.UsageSummaryQuerySchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["since"] = 12345; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => api.UsageSummaryQuerySchema.parse({ ...sample, __contract_probe__: 1 })).toThrow()
  })
})
