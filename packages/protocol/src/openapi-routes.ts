/**
 * REST 路由元数据（阶段十五工单 15.2 / doc/08 §15.2）——OpenAPI 导出的手工维护路由表。
 *
 * 事实源是 apps/server/src/routes/*.ts（doc/02 §4.5 表为底稿，逐条反推）；本表只被
 * `scripts/gen-openapi.ts`（openapi.json 合成器）消费，协议运行时零消费。新增/改动
 * 路由必须同步本表，否则 CI 的 gen+diff 门禁红（同 14.2 契约同步口径）。
 *
 * schema 写法：
 * - **$ref 引用组件名**（如 `ref('SessionMetaDto')`）——组件由生成器从 protocol 的 zod
 *   schema（api.ts）合成，单一来源；$ref 指向不存在的组件名会在生成期自检报错；
 * - **server 侧本地 body**（apps/server/src/routes/shared.ts 定义、protocol 不持有）——
 *   按形状手写并注明来源（如 CreateSessionBody），这是本表唯一的"手工"部分；
 * - 查询/路径参数写在 meta 上，生成器负责 OpenAPI parameters 形状与路径参数完备性自检。
 */

export type OpenApiMethod = 'get' | 'post' | 'put' | 'delete'

/** JSON Schema 片段（$ref 仅允许指向 #/components/schemas 下的既有组件名） */
export interface OpenApiSchemaNode {
  [key: string]: unknown
}

export interface OpenApiRouteMeta {
  method: OpenApiMethod
  /** OpenAPI 花括号参数形式（/api/sessions/{id}） */
  path: string
  summary: string
  /** 分组标签（文档站按 tag 归类） */
  tag: string
  /** 路径参数（除 memories 的数字 id 外均为字符串；缺省 description） */
  paramSchemas?: Record<string, OpenApiSchemaNode>
  /** 查询参数（名 → schema 片段） */
  query?: Record<string, OpenApiSchemaNode>
  /** JSON 请求体（可省 = 无 body） */
  body?: OpenApiSchemaNode
  /** 原始字节请求体（附件上传；与 body 互斥） */
  rawBody?: { description: string }
  /** 成功状态码（缺省 200；创建 201；两段式删除 204） */
  status?: number
  /** JSON 响应体（可省 = 无 body，如 204） */
  response?: OpenApiSchemaNode
  /** 非 JSON 响应（SSE / Prometheus / 图片字节；与 response 互斥） */
  rawResponse?: { description: string; contentType: string }
}

// ---- schema 片段小助手（本文件内构表用，不导出） ----

function ref(name: string): OpenApiSchemaNode {
  return { $ref: `#/components/schemas/${name}` }
}

function arr(items: OpenApiSchemaNode): OpenApiSchemaNode {
  return { type: 'array', items }
}

function obj(properties: Record<string, OpenApiSchemaNode>, required: string[] = []): OpenApiSchemaNode {
  return { type: 'object', properties, ...(required.length > 0 ? { required } : {}) }
}

const OK = obj({ ok: { type: 'boolean', const: true } })

export const OPENAPI_ROUTES: readonly OpenApiRouteMeta[] = [
  // ---- 系统（routes/index.ts） ----
  {
    method: 'get',
    path: '/api/healthz',
    summary: '存活探针（spark up / desktop sidecar 的就绪轮询端点）',
    tag: 'system',
    response: obj({ ok: { type: 'boolean', const: true } }),
  },
  {
    method: 'get',
    path: '/api/metrics',
    summary: 'Prometheus 指标文本（工单 4.8；sessions_active 为快照时点 gauge）',
    tag: 'system',
    rawResponse: { description: 'Prometheus exposition 文本', contentType: 'text/plain; version=0.0.4; charset=utf-8' },
  },

  // ---- 会话域（routes/sessions.ts） ----
  {
    method: 'post',
    path: '/api/sessions',
    summary: '创建会话',
    tag: 'sessions',
    // CreateSessionBody（apps/server routes/shared.ts 本地定义，protocol 不持有）
    body: obj({
      title: { type: 'string' },
      model: { type: 'string', description: 'provider/model 形式' },
      cwd: { type: 'string' },
    }),
    status: 201,
    response: ref('SessionMetaDto'),
  },
  {
    method: 'get',
    path: '/api/sessions',
    summary: '会话列表（updatedAt 倒序；archived=true 只列已归档，缺省排除）',
    tag: 'sessions',
    query: {
      limit: { type: 'integer', minimum: 1, default: 50 },
      cursor: { type: 'string', description: '分页游标 = 上一页末条会话 id' },
      archived: { type: 'boolean' },
    },
    response: arr(ref('SessionMetaDto')),
  },
  {
    method: 'get',
    path: '/api/sessions/{id}',
    summary: '会话详情 + durable 事件回放（缺省全量；limit 升序尾部切片上限 200 / before=seq 游标）',
    tag: 'sessions',
    query: {
      limit: { type: 'integer', minimum: 1, maximum: 200 },
      before: { type: 'integer', minimum: 1, description: '只返回 seq < before 的事件（工单 9.3）' },
    },
    response: ref('SessionDto'),
  },
  {
    method: 'get',
    path: '/api/sessions/{id}/fs',
    summary: '@ 文件路径补全的目录列举（工单 10.53；越界/不存在一律如实空清单）',
    tag: 'sessions',
    query: { path: { type: 'string', description: '相对会话 cwd 的部分路径，末段作前缀' } },
    response: ref('FsListDto'),
  },
  {
    method: 'get',
    path: '/api/sessions/{id}/fs/tree',
    summary: '递归文件树（工单 12.5：深度 ≤4、条目 ≤500 截断置位、目录优先；越界 → 400 E_PATH_OUTSIDE）',
    tag: 'sessions',
    query: { path: { type: 'string' } },
    response: ref('FsTreeDto'),
  },
  {
    method: 'post',
    path: '/api/sessions/{id}/messages',
    summary: '发消息（三态直通：started/steered/queued——HTTP 只表达受理，不等 turn 结果）',
    tag: 'sessions',
    // SendMessageBody（routes/shared.ts）
    body: obj(
      {
        text: { type: 'string', minLength: 1 },
        delivery: { enum: ['now', 'steer', 'queue'], default: 'now' },
        expectedTurnId: { type: 'string', description: 'steer 目标 turn 校验（不符 → E_TURN_MISMATCH）' },
      },
      ['text'],
    ),
    response: obj({ result: { enum: ['started', 'steered', 'queued'] }, turnId: { type: 'string' } }),
  },
  {
    method: 'post',
    path: '/api/sessions/{id}/interrupt',
    summary: '中断当前 turn（idle 时同样 200，幂等）',
    tag: 'sessions',
    response: OK,
  },
  {
    method: 'post',
    path: '/api/sessions/{id}/compact',
    summary: '手动压缩（turn 进行中 → 409 E_TURN_ACTIVE；started/completed 经 SSE 直播）',
    tag: 'sessions',
    response: OK,
  },
  {
    method: 'get',
    path: '/api/sessions/{id}/tree',
    summary: '事件树（分叉视图数据源，doc/02 §5.8.6）',
    tag: 'sessions',
    response: arr(ref('TreeNodeDto')),
  },
  {
    method: 'get',
    path: '/api/sessions/{id}/trace',
    summary: '回合级链路聚合（工单 13.7；纯从 durable 事件推导，不加埋点不写状态）',
    tag: 'sessions',
    response: ref('TraceDto'),
  },
  {
    method: 'post',
    path: '/api/sessions/{id}/fork',
    summary: '从指定事件分叉新会话（201）',
    tag: 'sessions',
    body: obj({ fromEventId: { type: 'string' } }, ['fromEventId']),
    status: 201,
    response: ref('SessionMetaDto'),
  },
  {
    method: 'get',
    path: '/api/sessions/{id}/checkpoints',
    summary: 'checkpoint 清单（commit sha 不上线）',
    tag: 'sessions',
    response: arr(ref('CheckpointDto')),
  },
  {
    method: 'post',
    path: '/api/sessions/{id}/checkpoints/{cid}/rollback',
    summary: '回滚到快照（仅 idle；回滚后 seq 回退——前端走 GET /:id 全量重放）',
    tag: 'sessions',
    response: ref('SessionMetaDto'),
  },
  {
    method: 'post',
    path: '/api/sessions/{id}/attachments',
    summary: '上传图片附件（≤10MB，png/jpeg/gif/webp 白名单；落 ~/.spark/attachments）',
    tag: 'sessions',
    rawBody: { description: 'raw 图片字节（content-type: image/* + x-file-name 头；bodyLimit 11MB）' },
    status: 201,
    response: ref('AttachmentDto'),
  },
  {
    method: 'get',
    path: '/api/attachments/{file}',
    summary: '取附件图片（32hex 文件名 + 扩展名白名单；非法名/缺文件 → 404）',
    tag: 'sessions',
    rawResponse: { description: '图片字节', contentType: 'image/png, image/jpeg, image/gif, image/webp' },
  },
  {
    method: 'put',
    path: '/api/sessions/{id}/archive',
    summary: '归档/恢复（工单 12.4：.archived 标记文件为事实源，幂等）',
    tag: 'sessions',
    body: obj({ archived: { type: 'boolean' } }, ['archived']),
    response: ref('SessionMetaDto'),
  },
  {
    method: 'delete',
    path: '/api/sessions/{id}',
    summary: '两段式删除（confirm:true 必带；JSONL 移入 ~/.spark/trash 可找回；运行中 → 409）',
    tag: 'sessions',
    body: obj({ confirm: { type: 'boolean', const: true } }, ['confirm']),
    status: 204,
  },

  // ---- 权限域（routes/permissions.ts） ----
  {
    method: 'post',
    path: '/api/permissions/{requestId}',
    summary: '审批回复（once/always/reject；feedback 为拒绝理由）',
    tag: 'permissions',
    // ReplyBody（routes/shared.ts）
    body: obj(
      { reply: { enum: ['once', 'always', 'reject'] }, feedback: { type: 'string' } },
      ['reply'],
    ),
    response: OK,
  },
  {
    method: 'get',
    path: '/api/permissions/rules',
    summary: '用户级权限规则清单（~/.spark/permissions.json）',
    tag: 'permissions',
    response: obj({ rules: arr(ref('PermissionRuleDto')) }),
  },
  {
    method: 'post',
    path: '/api/permissions/rules',
    summary: '新增/覆盖规则（action+resource 同键覆盖；201）',
    tag: 'permissions',
    body: ref('PermissionRuleDto'),
    status: 201,
    response: OK,
  },
  {
    method: 'delete',
    path: '/api/permissions/rules',
    summary: '删除规则（无此规则 → 404 E_NOT_FOUND）',
    tag: 'permissions',
    // RemoveRuleBody（routes/shared.ts）
    body: obj({ action: { type: 'string', minLength: 1 }, resource: { type: 'string', minLength: 1 } }, [
      'action',
      'resource',
    ]),
    response: OK,
  },
  {
    method: 'get',
    path: '/api/sessions/{id}/permission-preset',
    summary: '会话权限档位（四档预设层，会话级内存态）',
    tag: 'permissions',
    response: obj({ preset: ref('PermissionPreset') }),
  },
  {
    method: 'put',
    path: '/api/sessions/{id}/permission-preset',
    summary: '设置会话权限档位（非法档位 → 400 E_VALIDATION）',
    tag: 'permissions',
    // PresetBody（routes/shared.ts）
    body: obj({ preset: ref('PermissionPreset') }, ['preset']),
    response: OK,
  },
  {
    method: 'get',
    path: '/api/trust',
    summary: '文件夹信任状态（工单 16.4 / ADR D37：trusted.json 两档）',
    tag: 'permissions',
    response: ref('TrustStatusDto'),
  },
  {
    method: 'put',
    path: '/api/trust',
    summary: '设置文件夹信任（trusted/untrusted）',
    tag: 'permissions',
    // SetTrustBody（routes/shared.ts）
    body: obj({ path: { type: 'string', minLength: 1 }, trust: { enum: ['trusted', 'untrusted'] } }, [
      'path',
      'trust',
    ]),
    response: OK,
  },

  // ---- 扩展（工单 16.5 / ADR D38） ----
  {
    method: 'get',
    path: '/api/extensions',
    summary: '扩展内容包清单（声明式 manifest 与启停态）',
    tag: 'config',
    response: arr(ref('ExtensionDto')),
  },
  {
    method: 'put',
    path: '/api/extensions/{id}/enabled',
    summary: '扩展启停（重启档——重启后生效）',
    tag: 'config',
    // SetExtensionEnabledBody（routes/shared.ts）
    body: obj({ enabled: { type: 'boolean' } }, ['enabled']),
    response: OK,
  },

  // ---- 密钥（routes/secrets.ts） ----
  {
    method: 'get',
    path: '/api/secrets',
    summary: '密钥来源清单（值永不回传）',
    tag: 'secrets',
    response: obj({ secrets: arr(ref('SecretStatusDto')) }),
  },
  {
    method: 'put',
    path: '/api/secrets/{provider}',
    summary: '写入密钥（provider 未配置 → 400 E_CONFIG）',
    tag: 'secrets',
    // SetSecretBody（routes/shared.ts）
    body: obj({ value: { type: 'string', minLength: 1 } }, ['value']),
    response: OK,
  },
  {
    method: 'delete',
    path: '/api/secrets/{provider}',
    summary: '删除密钥（store 无此条 → 404 E_NOT_FOUND）',
    tag: 'secrets',
    response: OK,
  },

  // ---- 模型与路由（routes/models.ts） ----
  {
    method: 'get',
    path: '/api/models',
    summary: '模型配置合成视图（apiKey 掩码，值永不上线）',
    tag: 'models',
    response: ref('ModelsDto'),
  },
  {
    method: 'post',
    path: '/api/models/{providerId}/test',
    summary: '供应商连通测试（结果走 200 + 人话文案，不当传输失败）',
    tag: 'models',
    response: ref('ModelTestResultDto'),
  },
  {
    method: 'post',
    path: '/api/transcribe',
    summary: '语音听写（工单 16.6 / ADR D34：引擎侧 OpenAI 兼容转写 + SSRF 硬门）',
    tag: 'models',
    body: ref('TranscribeRequest'),
    response: ref('TranscribeResultDto'),
  },
  {
    method: 'put',
    path: '/api/sessions/{id}/model',
    summary: '会话级换模型（provider 未配置 → 400 E_CONFIG）',
    tag: 'models',
    body: obj({ model: { type: 'string', minLength: 1 } }, ['model']),
    response: obj({ model: { type: 'string' } }),
  },
  {
    method: 'put',
    path: '/api/sessions/{id}/effort',
    summary: '会话级推理档位（下一 turn 生效，重启回 models.json 缺省）',
    tag: 'models',
    body: obj({ effort: ref('ReasoningEffort') }, ['effort']),
    response: obj({ effort: ref('ReasoningEffort') }),
  },
  {
    method: 'get',
    path: '/api/routing',
    summary: '模型路由状态 + 成本累计（fallback 链/任务路由/成本上限）',
    tag: 'models',
    response: ref('RoutingDto'),
  },
  {
    method: 'put',
    path: '/api/routing',
    summary: '热更新路由（下一请求生效；写回 models.json）',
    tag: 'models',
    body: ref('RoutingUpdate'),
    response: ref('RoutingDto'),
  },
  {
    method: 'delete',
    path: '/api/routing/usage',
    summary: 'usage 清零（解除成本熔断的唯一入口）',
    tag: 'models',
    response: ref('RoutingDto'),
  },
  {
    method: 'get',
    path: '/api/usage/summary',
    summary: '成本看板（工单 13.6：总账五分量 + 明细桶 + 熔断状态）',
    tag: 'models',
    query: { since: { type: 'string', description: 'YYYY-MM-DD（可省 = 全量；含当日）' } },
    response: ref('UsageSummaryDto'),
  },

  // ---- 配置与只读清单（routes/readonly.ts） ----
  {
    method: 'get',
    path: '/api/settings',
    summary: 'spark.json 脱敏读（hooks 并入同一端点 = 工单 10.21）',
    tag: 'config',
    response: ref('SettingsDto'),
  },
  {
    method: 'put',
    path: '/api/settings',
    summary: '更新设置（zod 校验 → 原子写盘 → 才改内存；重启档字段带 restartRequired）',
    tag: 'config',
    body: ref('SettingsUpdate'),
    response: ref('SettingsDto'),
  },
  {
    method: 'get',
    path: '/api/commands',
    summary: '命令注册表（内置基线 + ~/.spark/commands/*.md 自定义 prompt）',
    tag: 'config',
    response: arr(ref('CommandDto')),
  },
  {
    method: 'post',
    path: '/api/sessions/{id}/commands/{name}',
    summary: '执行会话命令（client 命令 → 400 E_COMMAND_CLIENT；未知 → 404）',
    tag: 'config',
    body: ref('ExecuteCommandBody'),
    response: OK,
  },
  {
    method: 'get',
    path: '/api/mcp',
    summary: 'MCP server 连接状态快照（失败也列出 connected:false）',
    tag: 'config',
    response: arr(ref('McpServerDto')),
  },
  {
    method: 'put',
    path: '/api/mcp',
    summary: '整文件写 mcp.json（工单 12.6：坏配置不落盘 → 400；重启后重连）',
    tag: 'config',
    body: obj({
      version: { type: 'integer', const: 1 },
      servers: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          properties: {
            command: { type: 'string' },
            args: { type: 'array', items: { type: 'string' } },
            env: { type: 'object', additionalProperties: { type: 'string' } },
          },
          required: ['command'],
        },
      },
    }),
    response: obj({
      ok: { type: 'boolean', const: true },
      restartRequired: { type: 'boolean', const: true },
    }),
  },
  {
    method: 'get',
    path: '/api/skills',
    summary: '已加载技能只读清单（D18 声明式）',
    tag: 'config',
    response: arr(ref('SkillDto')),
  },
  {
    method: 'get',
    path: '/api/agents',
    summary: '子代理预设档只读清单（工单 13.5/16.2；写入靠改文件后重启）',
    tag: 'config',
    response: arr(ref('AgentPresetDto')),
  },
  {
    method: 'get',
    path: '/api/lsp',
    summary: '语言服务器只读状态（工单 16.9；未配置空数组）',
    tag: 'config',
    response: arr(ref('LspServerStatusDto')),
  },

  // ---- 记忆（阶段七工单 7.5 / ADR D25） ----
  {
    method: 'get',
    path: '/api/memories',
    summary: '长期记忆全量列表（新→旧）',
    tag: 'memories',
    response: arr(ref('MemoryDto')),
  },
  {
    method: 'delete',
    path: '/api/memories/{id}',
    summary: '删除一条记忆（无此条 → 404）',
    tag: 'memories',
    paramSchemas: { id: { type: 'integer', minimum: 1 } },
    response: OK,
  },

  // ---- 自动化（routes/automation.ts / ADR D26） ----
  {
    method: 'get',
    path: '/api/automation',
    summary: '触发器清单（cron/watch/webhook）',
    tag: 'automation',
    response: arr(ref('AutomationTriggerDto')),
  },
  {
    method: 'post',
    path: '/api/automation',
    summary: '创建触发器（未启用触发条件 → 400 E_TRIGGER；cron 非法 → 400 E_CRON）',
    tag: 'automation',
    body: ref('AutomationCreate'),
    response: ref('AutomationTriggerDto'),
  },
  {
    method: 'delete',
    path: '/api/automation/{id}',
    summary: '删除触发器（无此条 → 404）',
    tag: 'automation',
    response: OK,
  },
  {
    method: 'put',
    path: '/api/automation/{id}/enabled',
    summary: '启停触发器（热生效——下一 tick 起算）',
    tag: 'automation',
    // AutomationEnabledBody（routes/shared.ts）
    body: obj({ enabled: { type: 'boolean' } }, ['enabled']),
    response: OK,
  },
  {
    method: 'get',
    path: '/api/automation/runs',
    summary: '运行历史（新→旧，每次触发必有一行终态记录）',
    tag: 'automation',
    query: { limit: { type: 'integer', minimum: 1 } },
    response: arr(ref('AutomationRunDto')),
  },
  {
    method: 'post',
    path: '/api/automation/webhook/{id}',
    summary: 'Webhook 触发（停用中 → 409 E_TRIGGER_DISABLED；非 webhook → 400 E_TRIGGER_KIND）',
    tag: 'automation',
    response: OK,
  },
  {
    method: 'post',
    path: '/api/automation/{id}/run',
    summary: '手动触发（失败不吞——运行历史行留 error）',
    tag: 'automation',
    response: OK,
  },

  // ---- 审计 / 搜索 / 供图（routes/readonly.ts） ----
  {
    method: 'get',
    path: '/api/audit',
    summary: '审计明细流（新→旧；permission.decision / permission.rule / session.rollback）',
    tag: 'audit',
    query: {
      limit: { type: 'integer', minimum: 1, maximum: 500, default: 200 },
      kind: { type: 'string', enum: ['permission.decision', 'permission.rule', 'session.rollback'] },
      result: { type: 'string', enum: ['allow', 'deny', 'applied', 'ok'] },
      tool: { type: 'string' },
      since: { type: 'integer' },
    },
    response: arr(ref('AuditEntryDto')),
  },
  {
    method: 'get',
    path: '/api/search',
    summary: '会话全文搜索（FTS5：user/assistant 消息 + 标题；q 必填）',
    tag: 'search',
    query: {
      q: { type: 'string', minLength: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    },
    response: arr(ref('SearchHitDto')),
  },
  {
    method: 'get',
    path: '/api/artifacts/{file}',
    summary: 'browser 截图供图（文件名白名单校验在引擎侧）',
    tag: 'artifacts',
    rawResponse: { description: 'PNG 截图字节', contentType: 'image/png' },
  },

  // ---- 配对鉴权（pairing-routes.ts / ADR D24） ----
  {
    method: 'get',
    path: '/api/pair',
    summary: '配对状态（监听地址/端口/环回标志/鉴权启用态/设备列表）',
    tag: 'pair',
    response: ref('PairStatusDto'),
  },
  {
    method: 'post',
    path: '/api/pair',
    summary: '短码兑换长效 token（鉴权钩子豁免——自举；无效/过期/重放 → 401 E_PAIR）',
    tag: 'pair',
    body: ref('PairRedeemBody'),
    response: ref('PairTokenDto'),
  },
  {
    method: 'post',
    path: '/api/pair/code',
    summary: '桌面签发 60s 一次性短码 + QR 出示内容（签发即启用鉴权）',
    tag: 'pair',
    response: ref('PairCodeDto'),
  },
  {
    method: 'delete',
    path: '/api/pair/devices/{id}',
    summary: '撤销设备（撤销即断：已连 SSE 立即断开；无此条 → 404）',
    tag: 'pair',
    response: OK,
  },

  // ---- 事件流（sse.ts） ----
  {
    method: 'get',
    path: '/api/event',
    summary: 'SSE 全局直播（?sessionId&since 可省略；语义见 doc/02 §4.6 订阅语义）',
    tag: 'system',
    query: {
      sessionId: { type: 'string' },
      since: { type: 'integer', description: '回放游标 seq（去重靠 seq）' },
    },
    rawResponse: { description: 'text/event-stream（SparkEventEnvelope 帧）', contentType: 'text/event-stream' },
  },
]
