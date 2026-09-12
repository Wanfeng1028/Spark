# @spark/skill-kit — Spark 技能创作套件（工单 15.3）

给外部作者的两个命令：**init**（骨架生成）与 **lint**（清单校验）。校验单一来源是
`@spark/protocol` 的 `SkillManifestSchema`——引擎 loader（`packages/engine/src/skills/loader.ts`）
与 lint 走同一份 schema，套件不可能放行引擎拒绝的清单。

```bash
# 生成骨架（skill.json + README 模板；拒绝覆盖既有文件）
pnpm --filter @spark/skill-kit init my-skill

# 校验（传 skill 目录或 skill.json 路径；人话错误 + 非零退出码）
pnpm --filter @spark/skill-kit lint my-skill
```

## 声明式边界（D18，先读这段再动手）

**skill 是数据声明，不是程序。** 引擎不执行 skill 里的任何代码。

### 能做什么

| 能力         | 写法                                                                       | 引擎行为                                       |
| ------------ | -------------------------------------------------------------------------- | ---------------------------------------------- |
| 声明事件     | `events` 表：键必须 `plugin.` 前缀；`data` 是 JSON Schema                  | 注册进运行时词表，与内置事件同一校验路径        |
| 声明钩子     | `hooks`：`on` = 内置词表事件（lint 查词表合法性）；`emit` = 本清单已声明事件 | 触发时引擎自动发射，data 固定形状 `skill/sourceEventId/sourceType` |
| live 事件    | 事件条目标 `liveOnly: true`                                                | 不落盘（live 直播三类同口径）                  |

### 不能做什么

- **不能执行代码**：没有脚本钩子、没有可编程入口——受限可编程的边界判决见
  `doc/08-v2-roadmap.md` §15.4（Q-1 收口）；
- 不能占用内置词表名（`plugin.` 前缀强制；与内置或其他 skill 撞名 → 引擎拒载）；
- 不能自定义 data 之外的构造器、通道或存储。

### 要工具能力 → MCP 分工

skills 管事件语义（声明"什么时候发生什么"），**工具面归 MCP**（`~/.spark/mcp.json`，
ADR D16）：执行命令、查文件、调外部服务的诉求写 MCP server，不要试图从 skill 里"长出"工具。

## 校验规则明细（lint 会查什么）

1. **清单字段**：`version: 1`；`name` 小写字母-数字-连字符串；`events` 键 `plugin.*` 前缀；
   无多余字段（strictObject）；
2. **钩子 on 词表合法性**：必须是内置事件类型（防插件事件自触发循环）；
3. **钩子 emit 声明存在**：必须在本 skill 事件表里；
4. **data 可转换**：JSON Schema 必须能被 `z.fromJSONSchema` 转换（loader 装载同一条规则）。

错误码与引擎 loader 一致：`E_SKILL_HOOK_TARGET` / `E_SKILL_HOOK_EMIT` / 清单形状
`E_SKILL_MANIFEST`（套件前缀）/ data `E_SKILL_DATA_SCHEMA`（套件前缀）。

## 全链路

```
init 生成骨架 → lint 过 → 放到 <数据根>/skills/<name>/（缺省 ~/.spark/skills/）
→ 重启引擎 → GET /api/skills 出现该 skill → 钩子随内置事件触发
```

权威样例：`examples/skills/demo-ping/`（引擎 5.5 落地时的实例，套件单测与其对齐）。
