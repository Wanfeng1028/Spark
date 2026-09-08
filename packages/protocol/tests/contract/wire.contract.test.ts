// 自动生成，勿手改 —— packages/protocol/scripts/gen-contract.ts（工单 14.2 / doc/06 §1 L1.5 契约层）。
// 重新生成：pnpm --filter @spark/protocol gen:contract
// CI 同步门禁：ci.yml 在 test 步之前重跑生成器并 git diff --exit-code 本目录——改 schema 不重生成即红。
// 事实源：src/schema.ts + src/events.ts（本文件不含任何手写样例或手写断言；每条断言在生成期已用真 schema 自校验）。

import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { EnvelopeSchema } from '../../src/schema.js'
import { EventSchemas } from '../../src/events.js'

describe('契约：EnvelopeSchema', () => {
  const sample = {
    "id": "evt_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "type": "contract-sample",
    "sessionId": "ses_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "seq": 1,
    "parentId": "evt_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "version": 1,
    "ignorable": false,
    "surface": true,
    "time": 1,
    "data": "contract-sample"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(EnvelopeSchema.parse(sample)).toEqual(sample)
    expect(EnvelopeSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(EnvelopeSchema)).toBeTypeOf('object')
  })

  it('缺必填字段 id → 解析失败', () => {
    expect(() => EnvelopeSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["id"]; return m })())).toThrow()
  })

  it('缺必填字段 type → 解析失败', () => {
    expect(() => EnvelopeSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["type"]; return m })())).toThrow()
  })

  it('缺必填字段 sessionId → 解析失败', () => {
    expect(() => EnvelopeSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["sessionId"]; return m })())).toThrow()
  })

  it('缺必填字段 time → 解析失败', () => {
    expect(() => EnvelopeSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["time"]; return m })())).toThrow()
  })

  it('缺必填字段 data → 解析失败', () => {
    expect(() => EnvelopeSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["data"]; return m })())).toThrow()
  })

  it('字段 id 类型错 → 解析失败', () => {
    expect(() => EnvelopeSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["id"] = 12345; return m })())).toThrow()
  })

  it('字段 type 类型错 → 解析失败', () => {
    expect(() => EnvelopeSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["type"] = 12345; return m })())).toThrow()
  })

  it('字段 sessionId 类型错 → 解析失败', () => {
    expect(() => EnvelopeSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["sessionId"] = 12345; return m })())).toThrow()
  })

  it('字段 seq 类型错 → 解析失败', () => {
    expect(() => EnvelopeSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["seq"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 version 类型错 → 解析失败', () => {
    expect(() => EnvelopeSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["version"] = "__contract_bogus_enum__"; return m })())).toThrow()
  })

  it('字段 ignorable 类型错 → 解析失败', () => {
    expect(() => EnvelopeSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["ignorable"] = "not-a-boolean"; return m })())).toThrow()
  })

  it('字段 surface 类型错 → 解析失败', () => {
    expect(() => EnvelopeSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["surface"] = "__contract_bogus_enum__"; return m })())).toThrow()
  })

  it('字段 time 类型错 → 解析失败', () => {
    expect(() => EnvelopeSchema.parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["time"] = "not-a-number"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => EnvelopeSchema.parse({ ...(sample as Record<string, unknown>), __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：event \'assistant.delta\'', () => {
  const sample = {
    "turnId": "trn_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "text": "contract-sample"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(EventSchemas['assistant.delta'].parse(sample)).toEqual(sample)
    expect(EventSchemas['assistant.delta'].parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(EventSchemas['assistant.delta'])).toBeTypeOf('object')
  })

  it('缺必填字段 turnId → 解析失败', () => {
    expect(() => EventSchemas['assistant.delta'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["turnId"]; return m })())).toThrow()
  })

  it('缺必填字段 text → 解析失败', () => {
    expect(() => EventSchemas['assistant.delta'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["text"]; return m })())).toThrow()
  })

  it('字段 turnId 类型错 → 解析失败', () => {
    expect(() => EventSchemas['assistant.delta'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["turnId"] = 12345; return m })())).toThrow()
  })

  it('字段 text 类型错 → 解析失败', () => {
    expect(() => EventSchemas['assistant.delta'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["text"] = 12345; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => EventSchemas['assistant.delta'].parse({ ...(sample as Record<string, unknown>), __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：event \'assistant.message\'', () => {
  const sample = {
    "turnId": "trn_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "content": [
      {
        "type": "text",
        "text": "contract-sample"
      }
    ],
    "usage": {
      "inputTokens": 1,
      "outputTokens": 1,
      "reasoningTokens": 1,
      "cacheRead": 1,
      "cacheWrite": 1,
      "costUsd": 1
    }
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(EventSchemas['assistant.message'].parse(sample)).toEqual(sample)
    expect(EventSchemas['assistant.message'].parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(EventSchemas['assistant.message'])).toBeTypeOf('object')
  })

  it('缺必填字段 turnId → 解析失败', () => {
    expect(() => EventSchemas['assistant.message'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["turnId"]; return m })())).toThrow()
  })

  it('缺必填字段 content → 解析失败', () => {
    expect(() => EventSchemas['assistant.message'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["content"]; return m })())).toThrow()
  })

  it('字段 turnId 类型错 → 解析失败', () => {
    expect(() => EventSchemas['assistant.message'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["turnId"] = 12345; return m })())).toThrow()
  })

  it('字段 content 类型错 → 解析失败', () => {
    expect(() => EventSchemas['assistant.message'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["content"] = "not-an-array"; return m })())).toThrow()
  })

  it('字段 usage 类型错 → 解析失败', () => {
    expect(() => EventSchemas['assistant.message'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["usage"] = []; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => EventSchemas['assistant.message'].parse({ ...(sample as Record<string, unknown>), __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：event \'checkpoint.created\'', () => {
  const sample = {
    "checkpointId": "ckp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "files": [
      "contract-sample"
    ],
    "turnId": "trn_01ARZ3NDEKTSV4RRFFQ69G5FAV"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(EventSchemas['checkpoint.created'].parse(sample)).toEqual(sample)
    expect(EventSchemas['checkpoint.created'].parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(EventSchemas['checkpoint.created'])).toBeTypeOf('object')
  })

  it('缺必填字段 checkpointId → 解析失败', () => {
    expect(() => EventSchemas['checkpoint.created'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["checkpointId"]; return m })())).toThrow()
  })

  it('缺必填字段 files → 解析失败', () => {
    expect(() => EventSchemas['checkpoint.created'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["files"]; return m })())).toThrow()
  })

  it('缺必填字段 turnId → 解析失败', () => {
    expect(() => EventSchemas['checkpoint.created'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["turnId"]; return m })())).toThrow()
  })

  it('字段 checkpointId 类型错 → 解析失败', () => {
    expect(() => EventSchemas['checkpoint.created'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["checkpointId"] = 12345; return m })())).toThrow()
  })

  it('字段 files 类型错 → 解析失败', () => {
    expect(() => EventSchemas['checkpoint.created'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["files"] = "not-an-array"; return m })())).toThrow()
  })

  it('字段 turnId 类型错 → 解析失败', () => {
    expect(() => EventSchemas['checkpoint.created'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["turnId"] = 12345; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => EventSchemas['checkpoint.created'].parse({ ...(sample as Record<string, unknown>), __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：event \'compaction.completed\'', () => {
  const sample = {
    "summary": "contract-sample",
    "keptFromEventId": "evt_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "tokensBefore": 1,
    "keptFiles": [
      "contract-sample"
    ],
    "distilled": {
      "contract-sample": "contract-sample"
    }
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(EventSchemas['compaction.completed'].parse(sample)).toEqual(sample)
    expect(EventSchemas['compaction.completed'].parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(EventSchemas['compaction.completed'])).toBeTypeOf('object')
  })

  it('缺必填字段 summary → 解析失败', () => {
    expect(() => EventSchemas['compaction.completed'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["summary"]; return m })())).toThrow()
  })

  it('缺必填字段 keptFromEventId → 解析失败', () => {
    expect(() => EventSchemas['compaction.completed'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["keptFromEventId"]; return m })())).toThrow()
  })

  it('缺必填字段 tokensBefore → 解析失败', () => {
    expect(() => EventSchemas['compaction.completed'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["tokensBefore"]; return m })())).toThrow()
  })

  it('字段 summary 类型错 → 解析失败', () => {
    expect(() => EventSchemas['compaction.completed'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["summary"] = 12345; return m })())).toThrow()
  })

  it('字段 keptFromEventId 类型错 → 解析失败', () => {
    expect(() => EventSchemas['compaction.completed'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["keptFromEventId"] = 12345; return m })())).toThrow()
  })

  it('字段 tokensBefore 类型错 → 解析失败', () => {
    expect(() => EventSchemas['compaction.completed'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["tokensBefore"] = "not-a-number"; return m })())).toThrow()
  })

  it('字段 keptFiles 类型错 → 解析失败', () => {
    expect(() => EventSchemas['compaction.completed'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["keptFiles"] = "not-an-array"; return m })())).toThrow()
  })

  it('字段 distilled 类型错 → 解析失败', () => {
    expect(() => EventSchemas['compaction.completed'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["distilled"] = []; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => EventSchemas['compaction.completed'].parse({ ...(sample as Record<string, unknown>), __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：event \'compaction.started\'', () => {
  const sample = {
    "turnId": "trn_01ARZ3NDEKTSV4RRFFQ69G5FAV"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(EventSchemas['compaction.started'].parse(sample)).toEqual(sample)
    expect(EventSchemas['compaction.started'].parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(EventSchemas['compaction.started'])).toBeTypeOf('object')
  })

  it('字段 turnId 类型错 → 解析失败', () => {
    expect(() => EventSchemas['compaction.started'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["turnId"] = 12345; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => EventSchemas['compaction.started'].parse({ ...(sample as Record<string, unknown>), __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：event \'error\'', () => {
  const sample = {
    "scope": "engine",
    "message": "contract-sample",
    "fatal": false
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(EventSchemas['error'].parse(sample)).toEqual(sample)
    expect(EventSchemas['error'].parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(EventSchemas['error'])).toBeTypeOf('object')
  })

  it('缺必填字段 scope → 解析失败', () => {
    expect(() => EventSchemas['error'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["scope"]; return m })())).toThrow()
  })

  it('缺必填字段 message → 解析失败', () => {
    expect(() => EventSchemas['error'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["message"]; return m })())).toThrow()
  })

  it('字段 scope 类型错 → 解析失败', () => {
    expect(() => EventSchemas['error'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["scope"] = "__contract_bogus_enum__"; return m })())).toThrow()
  })

  it('字段 message 类型错 → 解析失败', () => {
    expect(() => EventSchemas['error'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["message"] = 12345; return m })())).toThrow()
  })

  it('字段 fatal 类型错 → 解析失败', () => {
    expect(() => EventSchemas['error'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["fatal"] = "not-a-boolean"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => EventSchemas['error'].parse({ ...(sample as Record<string, unknown>), __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：event \'io.warning\'', () => {
  const sample = {
    "turnId": "trn_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "callId": "call_contract_sample_1",
    "tool": "contract-sample",
    "kind": "injection",
    "rules": [
      "contract-sample"
    ],
    "redacted": 1
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(EventSchemas['io.warning'].parse(sample)).toEqual(sample)
    expect(EventSchemas['io.warning'].parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(EventSchemas['io.warning'])).toBeTypeOf('object')
  })

  it('缺必填字段 turnId → 解析失败', () => {
    expect(() => EventSchemas['io.warning'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["turnId"]; return m })())).toThrow()
  })

  it('缺必填字段 callId → 解析失败', () => {
    expect(() => EventSchemas['io.warning'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["callId"]; return m })())).toThrow()
  })

  it('缺必填字段 tool → 解析失败', () => {
    expect(() => EventSchemas['io.warning'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["tool"]; return m })())).toThrow()
  })

  it('缺必填字段 kind → 解析失败', () => {
    expect(() => EventSchemas['io.warning'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["kind"]; return m })())).toThrow()
  })

  it('缺必填字段 rules → 解析失败', () => {
    expect(() => EventSchemas['io.warning'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["rules"]; return m })())).toThrow()
  })

  it('字段 turnId 类型错 → 解析失败', () => {
    expect(() => EventSchemas['io.warning'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["turnId"] = 12345; return m })())).toThrow()
  })

  it('字段 callId 类型错 → 解析失败', () => {
    expect(() => EventSchemas['io.warning'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["callId"] = 12345; return m })())).toThrow()
  })

  it('字段 tool 类型错 → 解析失败', () => {
    expect(() => EventSchemas['io.warning'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["tool"] = 12345; return m })())).toThrow()
  })

  it('字段 kind 类型错 → 解析失败', () => {
    expect(() => EventSchemas['io.warning'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["kind"] = "__contract_bogus_enum__"; return m })())).toThrow()
  })

  it('字段 rules 类型错 → 解析失败', () => {
    expect(() => EventSchemas['io.warning'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["rules"] = "not-an-array"; return m })())).toThrow()
  })

  it('字段 redacted 类型错 → 解析失败', () => {
    expect(() => EventSchemas['io.warning'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["redacted"] = "not-a-number"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => EventSchemas['io.warning'].parse({ ...(sample as Record<string, unknown>), __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：event \'memory.injected\'', () => {
  const sample = {
    "turnId": "trn_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "query": "contract-sample",
    "memories": [
      {
        "id": 1,
        "content": "contract-sample",
        "createdAt": 1
      }
    ]
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(EventSchemas['memory.injected'].parse(sample)).toEqual(sample)
    expect(EventSchemas['memory.injected'].parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(EventSchemas['memory.injected'])).toBeTypeOf('object')
  })

  it('缺必填字段 turnId → 解析失败', () => {
    expect(() => EventSchemas['memory.injected'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["turnId"]; return m })())).toThrow()
  })

  it('缺必填字段 query → 解析失败', () => {
    expect(() => EventSchemas['memory.injected'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["query"]; return m })())).toThrow()
  })

  it('缺必填字段 memories → 解析失败', () => {
    expect(() => EventSchemas['memory.injected'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["memories"]; return m })())).toThrow()
  })

  it('字段 turnId 类型错 → 解析失败', () => {
    expect(() => EventSchemas['memory.injected'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["turnId"] = 12345; return m })())).toThrow()
  })

  it('字段 query 类型错 → 解析失败', () => {
    expect(() => EventSchemas['memory.injected'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["query"] = 12345; return m })())).toThrow()
  })

  it('字段 memories 类型错 → 解析失败', () => {
    expect(() => EventSchemas['memory.injected'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["memories"] = "not-an-array"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => EventSchemas['memory.injected'].parse({ ...(sample as Record<string, unknown>), __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：event \'permission.asked\'', () => {
  const sample = {
    "requestId": "req_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "callId": "call_contract_sample_1",
    "action": "contract-sample",
    "resource": "contract-sample",
    "reason": "contract-sample",
    "detail": "contract-sample",
    "patterns": [
      "contract-sample"
    ],
    "alwaysPatterns": [
      "contract-sample"
    ]
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(EventSchemas['permission.asked'].parse(sample)).toEqual(sample)
    expect(EventSchemas['permission.asked'].parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(EventSchemas['permission.asked'])).toBeTypeOf('object')
  })

  it('缺必填字段 requestId → 解析失败', () => {
    expect(() => EventSchemas['permission.asked'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["requestId"]; return m })())).toThrow()
  })

  it('缺必填字段 callId → 解析失败', () => {
    expect(() => EventSchemas['permission.asked'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["callId"]; return m })())).toThrow()
  })

  it('缺必填字段 action → 解析失败', () => {
    expect(() => EventSchemas['permission.asked'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["action"]; return m })())).toThrow()
  })

  it('缺必填字段 resource → 解析失败', () => {
    expect(() => EventSchemas['permission.asked'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["resource"]; return m })())).toThrow()
  })

  it('缺必填字段 reason → 解析失败', () => {
    expect(() => EventSchemas['permission.asked'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["reason"]; return m })())).toThrow()
  })

  it('字段 requestId 类型错 → 解析失败', () => {
    expect(() => EventSchemas['permission.asked'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["requestId"] = 12345; return m })())).toThrow()
  })

  it('字段 callId 类型错 → 解析失败', () => {
    expect(() => EventSchemas['permission.asked'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["callId"] = 12345; return m })())).toThrow()
  })

  it('字段 action 类型错 → 解析失败', () => {
    expect(() => EventSchemas['permission.asked'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["action"] = 12345; return m })())).toThrow()
  })

  it('字段 resource 类型错 → 解析失败', () => {
    expect(() => EventSchemas['permission.asked'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["resource"] = 12345; return m })())).toThrow()
  })

  it('字段 reason 类型错 → 解析失败', () => {
    expect(() => EventSchemas['permission.asked'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["reason"] = 12345; return m })())).toThrow()
  })

  it('字段 patterns 类型错 → 解析失败', () => {
    expect(() => EventSchemas['permission.asked'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["patterns"] = "not-an-array"; return m })())).toThrow()
  })

  it('字段 alwaysPatterns 类型错 → 解析失败', () => {
    expect(() => EventSchemas['permission.asked'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["alwaysPatterns"] = "not-an-array"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => EventSchemas['permission.asked'].parse({ ...(sample as Record<string, unknown>), __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：event \'permission.resolved\'', () => {
  const sample = {
    "requestId": "req_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "reply": "once",
    "feedback": "contract-sample"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(EventSchemas['permission.resolved'].parse(sample)).toEqual(sample)
    expect(EventSchemas['permission.resolved'].parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(EventSchemas['permission.resolved'])).toBeTypeOf('object')
  })

  it('缺必填字段 requestId → 解析失败', () => {
    expect(() => EventSchemas['permission.resolved'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["requestId"]; return m })())).toThrow()
  })

  it('缺必填字段 reply → 解析失败', () => {
    expect(() => EventSchemas['permission.resolved'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["reply"]; return m })())).toThrow()
  })

  it('字段 requestId 类型错 → 解析失败', () => {
    expect(() => EventSchemas['permission.resolved'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["requestId"] = 12345; return m })())).toThrow()
  })

  it('字段 reply 类型错 → 解析失败', () => {
    expect(() => EventSchemas['permission.resolved'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["reply"] = "__contract_bogus_enum__"; return m })())).toThrow()
  })

  it('字段 feedback 类型错 → 解析失败', () => {
    expect(() => EventSchemas['permission.resolved'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["feedback"] = 12345; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => EventSchemas['permission.resolved'].parse({ ...(sample as Record<string, unknown>), __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：event \'reasoning.delta\'', () => {
  const sample = {
    "turnId": "trn_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "text": "contract-sample"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(EventSchemas['reasoning.delta'].parse(sample)).toEqual(sample)
    expect(EventSchemas['reasoning.delta'].parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(EventSchemas['reasoning.delta'])).toBeTypeOf('object')
  })

  it('缺必填字段 turnId → 解析失败', () => {
    expect(() => EventSchemas['reasoning.delta'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["turnId"]; return m })())).toThrow()
  })

  it('缺必填字段 text → 解析失败', () => {
    expect(() => EventSchemas['reasoning.delta'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["text"]; return m })())).toThrow()
  })

  it('字段 turnId 类型错 → 解析失败', () => {
    expect(() => EventSchemas['reasoning.delta'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["turnId"] = 12345; return m })())).toThrow()
  })

  it('字段 text 类型错 → 解析失败', () => {
    expect(() => EventSchemas['reasoning.delta'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["text"] = 12345; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => EventSchemas['reasoning.delta'].parse({ ...(sample as Record<string, unknown>), __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：event \'reasoning.ended\'', () => {
  const sample = {
    "turnId": "trn_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "text": "contract-sample"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(EventSchemas['reasoning.ended'].parse(sample)).toEqual(sample)
    expect(EventSchemas['reasoning.ended'].parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(EventSchemas['reasoning.ended'])).toBeTypeOf('object')
  })

  it('缺必填字段 turnId → 解析失败', () => {
    expect(() => EventSchemas['reasoning.ended'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["turnId"]; return m })())).toThrow()
  })

  it('缺必填字段 text → 解析失败', () => {
    expect(() => EventSchemas['reasoning.ended'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["text"]; return m })())).toThrow()
  })

  it('字段 turnId 类型错 → 解析失败', () => {
    expect(() => EventSchemas['reasoning.ended'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["turnId"] = 12345; return m })())).toThrow()
  })

  it('字段 text 类型错 → 解析失败', () => {
    expect(() => EventSchemas['reasoning.ended'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["text"] = 12345; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => EventSchemas['reasoning.ended'].parse({ ...(sample as Record<string, unknown>), __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：event \'session.created\'', () => {
  const sample = {
    "title": "contract-sample",
    "cwd": "contract-sample",
    "model": "contract-sample",
    "branch": "contract-sample",
    "effort": "low"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(EventSchemas['session.created'].parse(sample)).toEqual(sample)
    expect(EventSchemas['session.created'].parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(EventSchemas['session.created'])).toBeTypeOf('object')
  })

  it('缺必填字段 cwd → 解析失败', () => {
    expect(() => EventSchemas['session.created'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["cwd"]; return m })())).toThrow()
  })

  it('缺必填字段 model → 解析失败', () => {
    expect(() => EventSchemas['session.created'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["model"]; return m })())).toThrow()
  })

  it('字段 title 类型错 → 解析失败', () => {
    expect(() => EventSchemas['session.created'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["title"] = 12345; return m })())).toThrow()
  })

  it('字段 cwd 类型错 → 解析失败', () => {
    expect(() => EventSchemas['session.created'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["cwd"] = 12345; return m })())).toThrow()
  })

  it('字段 model 类型错 → 解析失败', () => {
    expect(() => EventSchemas['session.created'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["model"] = 12345; return m })())).toThrow()
  })

  it('字段 branch 类型错 → 解析失败', () => {
    expect(() => EventSchemas['session.created'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["branch"] = 12345; return m })())).toThrow()
  })

  it('字段 effort 类型错 → 解析失败', () => {
    expect(() => EventSchemas['session.created'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["effort"] = "__contract_bogus_enum__"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => EventSchemas['session.created'].parse({ ...(sample as Record<string, unknown>), __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：event \'session.resumed\'', () => {
  const sample = {
    "fromSeq": 1
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(EventSchemas['session.resumed'].parse(sample)).toEqual(sample)
    expect(EventSchemas['session.resumed'].parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(EventSchemas['session.resumed'])).toBeTypeOf('object')
  })

  it('缺必填字段 fromSeq → 解析失败', () => {
    expect(() => EventSchemas['session.resumed'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["fromSeq"]; return m })())).toThrow()
  })

  it('字段 fromSeq 类型错 → 解析失败', () => {
    expect(() => EventSchemas['session.resumed'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["fromSeq"] = "not-a-number"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => EventSchemas['session.resumed'].parse({ ...(sample as Record<string, unknown>), __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：event \'session.title\'', () => {
  const sample = {
    "title": "contract-sample"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(EventSchemas['session.title'].parse(sample)).toEqual(sample)
    expect(EventSchemas['session.title'].parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(EventSchemas['session.title'])).toBeTypeOf('object')
  })

  it('缺必填字段 title → 解析失败', () => {
    expect(() => EventSchemas['session.title'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["title"]; return m })())).toThrow()
  })

  it('字段 title 类型错 → 解析失败', () => {
    expect(() => EventSchemas['session.title'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["title"] = 12345; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => EventSchemas['session.title'].parse({ ...(sample as Record<string, unknown>), __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：event \'tool.completed\'', () => {
  const sample = {
    "turnId": "trn_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "callId": "call_contract_sample_1",
    "output": "contract-sample",
    "isError": false,
    "durationMs": 1
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(EventSchemas['tool.completed'].parse(sample)).toEqual(sample)
    expect(EventSchemas['tool.completed'].parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(EventSchemas['tool.completed'])).toBeTypeOf('object')
  })

  it('缺必填字段 turnId → 解析失败', () => {
    expect(() => EventSchemas['tool.completed'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["turnId"]; return m })())).toThrow()
  })

  it('缺必填字段 callId → 解析失败', () => {
    expect(() => EventSchemas['tool.completed'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["callId"]; return m })())).toThrow()
  })

  it('缺必填字段 output → 解析失败', () => {
    expect(() => EventSchemas['tool.completed'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["output"]; return m })())).toThrow()
  })

  it('缺必填字段 isError → 解析失败', () => {
    expect(() => EventSchemas['tool.completed'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["isError"]; return m })())).toThrow()
  })

  it('缺必填字段 durationMs → 解析失败', () => {
    expect(() => EventSchemas['tool.completed'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["durationMs"]; return m })())).toThrow()
  })

  it('字段 turnId 类型错 → 解析失败', () => {
    expect(() => EventSchemas['tool.completed'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["turnId"] = 12345; return m })())).toThrow()
  })

  it('字段 callId 类型错 → 解析失败', () => {
    expect(() => EventSchemas['tool.completed'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["callId"] = 12345; return m })())).toThrow()
  })

  it('字段 isError 类型错 → 解析失败', () => {
    expect(() => EventSchemas['tool.completed'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["isError"] = "not-a-boolean"; return m })())).toThrow()
  })

  it('字段 durationMs 类型错 → 解析失败', () => {
    expect(() => EventSchemas['tool.completed'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["durationMs"] = "not-a-number"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => EventSchemas['tool.completed'].parse({ ...(sample as Record<string, unknown>), __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：event \'tool.progress\'', () => {
  const sample = {
    "turnId": "trn_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "callId": "call_contract_sample_1",
    "chunk": "contract-sample"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(EventSchemas['tool.progress'].parse(sample)).toEqual(sample)
    expect(EventSchemas['tool.progress'].parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(EventSchemas['tool.progress'])).toBeTypeOf('object')
  })

  it('缺必填字段 turnId → 解析失败', () => {
    expect(() => EventSchemas['tool.progress'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["turnId"]; return m })())).toThrow()
  })

  it('缺必填字段 callId → 解析失败', () => {
    expect(() => EventSchemas['tool.progress'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["callId"]; return m })())).toThrow()
  })

  it('缺必填字段 chunk → 解析失败', () => {
    expect(() => EventSchemas['tool.progress'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["chunk"]; return m })())).toThrow()
  })

  it('字段 turnId 类型错 → 解析失败', () => {
    expect(() => EventSchemas['tool.progress'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["turnId"] = 12345; return m })())).toThrow()
  })

  it('字段 callId 类型错 → 解析失败', () => {
    expect(() => EventSchemas['tool.progress'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["callId"] = 12345; return m })())).toThrow()
  })

  it('字段 chunk 类型错 → 解析失败', () => {
    expect(() => EventSchemas['tool.progress'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["chunk"] = 12345; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => EventSchemas['tool.progress'].parse({ ...(sample as Record<string, unknown>), __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：event \'tool.started\'', () => {
  const sample = {
    "turnId": "trn_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "callId": "call_contract_sample_1",
    "name": "contract-sample",
    "input": "contract-sample"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(EventSchemas['tool.started'].parse(sample)).toEqual(sample)
    expect(EventSchemas['tool.started'].parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(EventSchemas['tool.started'])).toBeTypeOf('object')
  })

  it('缺必填字段 turnId → 解析失败', () => {
    expect(() => EventSchemas['tool.started'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["turnId"]; return m })())).toThrow()
  })

  it('缺必填字段 callId → 解析失败', () => {
    expect(() => EventSchemas['tool.started'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["callId"]; return m })())).toThrow()
  })

  it('缺必填字段 name → 解析失败', () => {
    expect(() => EventSchemas['tool.started'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["name"]; return m })())).toThrow()
  })

  it('缺必填字段 input → 解析失败', () => {
    expect(() => EventSchemas['tool.started'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["input"]; return m })())).toThrow()
  })

  it('字段 turnId 类型错 → 解析失败', () => {
    expect(() => EventSchemas['tool.started'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["turnId"] = 12345; return m })())).toThrow()
  })

  it('字段 callId 类型错 → 解析失败', () => {
    expect(() => EventSchemas['tool.started'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["callId"] = 12345; return m })())).toThrow()
  })

  it('字段 name 类型错 → 解析失败', () => {
    expect(() => EventSchemas['tool.started'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["name"] = 12345; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => EventSchemas['tool.started'].parse({ ...(sample as Record<string, unknown>), __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：event \'turn.completed\'', () => {
  const sample = {
    "turnId": "trn_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "finish": "stop",
    "usage": {
      "inputTokens": 1,
      "outputTokens": 1,
      "reasoningTokens": 1,
      "cacheRead": 1,
      "cacheWrite": 1,
      "costUsd": 1
    }
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(EventSchemas['turn.completed'].parse(sample)).toEqual(sample)
    expect(EventSchemas['turn.completed'].parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(EventSchemas['turn.completed'])).toBeTypeOf('object')
  })

  it('缺必填字段 turnId → 解析失败', () => {
    expect(() => EventSchemas['turn.completed'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["turnId"]; return m })())).toThrow()
  })

  it('缺必填字段 finish → 解析失败', () => {
    expect(() => EventSchemas['turn.completed'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["finish"]; return m })())).toThrow()
  })

  it('字段 turnId 类型错 → 解析失败', () => {
    expect(() => EventSchemas['turn.completed'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["turnId"] = 12345; return m })())).toThrow()
  })

  it('字段 finish 类型错 → 解析失败', () => {
    expect(() => EventSchemas['turn.completed'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["finish"] = "__contract_bogus_enum__"; return m })())).toThrow()
  })

  it('字段 usage 类型错 → 解析失败', () => {
    expect(() => EventSchemas['turn.completed'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["usage"] = []; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => EventSchemas['turn.completed'].parse({ ...(sample as Record<string, unknown>), __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：event \'turn.started\'', () => {
  const sample = {
    "turnId": "trn_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "delivery": "now",
    "userEventId": "evt_01ARZ3NDEKTSV4RRFFQ69G5FAV"
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(EventSchemas['turn.started'].parse(sample)).toEqual(sample)
    expect(EventSchemas['turn.started'].parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(EventSchemas['turn.started'])).toBeTypeOf('object')
  })

  it('缺必填字段 turnId → 解析失败', () => {
    expect(() => EventSchemas['turn.started'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["turnId"]; return m })())).toThrow()
  })

  it('缺必填字段 delivery → 解析失败', () => {
    expect(() => EventSchemas['turn.started'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["delivery"]; return m })())).toThrow()
  })

  it('缺必填字段 userEventId → 解析失败', () => {
    expect(() => EventSchemas['turn.started'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["userEventId"]; return m })())).toThrow()
  })

  it('字段 turnId 类型错 → 解析失败', () => {
    expect(() => EventSchemas['turn.started'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["turnId"] = 12345; return m })())).toThrow()
  })

  it('字段 delivery 类型错 → 解析失败', () => {
    expect(() => EventSchemas['turn.started'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["delivery"] = "__contract_bogus_enum__"; return m })())).toThrow()
  })

  it('字段 userEventId 类型错 → 解析失败', () => {
    expect(() => EventSchemas['turn.started'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["userEventId"] = 12345; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => EventSchemas['turn.started'].parse({ ...(sample as Record<string, unknown>), __contract_probe__: 1 })).toThrow()
  })
})

describe('契约：event \'user.message\'', () => {
  const sample = {
    "text": "contract-sample",
    "attachments": [
      "contract-sample"
    ]
  }

  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {
    expect(EventSchemas['user.message'].parse(sample)).toEqual(sample)
    expect(EventSchemas['user.message'].parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
  })

  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {
    expect(z.toJSONSchema(EventSchemas['user.message'])).toBeTypeOf('object')
  })

  it('缺必填字段 text → 解析失败', () => {
    expect(() => EventSchemas['user.message'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; delete m["text"]; return m })())).toThrow()
  })

  it('字段 text 类型错 → 解析失败', () => {
    expect(() => EventSchemas['user.message'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["text"] = 12345; return m })())).toThrow()
  })

  it('字段 attachments 类型错 → 解析失败', () => {
    expect(() => EventSchemas['user.message'].parse((() => { const m = structuredClone(sample) as Record<string, unknown>; m["attachments"] = "not-an-array"; return m })())).toThrow()
  })

  it('未知键 → strictObject 拒收', () => {
    expect(() => EventSchemas['user.message'].parse({ ...(sample as Record<string, unknown>), __contract_probe__: 1 })).toThrow()
  })
})
