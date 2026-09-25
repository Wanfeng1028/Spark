/**
 * `~/.spark` 与 `<cwd>/.spark` 的路径单源（阶段十九工单 19.37 第一批；AGENTS §1.1「数据落点」的执行层）。
 *
 * 收敛前这些名字是**各调用点现拼**的（`join(this.root, 'memory.db')` 之类），散在 engine.ts、
 * settings-store.ts、trust.ts、audit/log.ts、logger.ts、logs.ts、config.ts、search/indexer.ts、
 * session/index-maintainer.ts、mcp/config.ts、lsp/config.ts、lsp/manager.ts、agents/presets.ts、
 * arena/{store,manager}.ts、extensions/loader.ts、tools/output-store.ts 与 apps/server 里。
 * 收敛是否干净可以自查，不靠本文件的自述（`[^.\w]` 是为了把 `Array.prototype.join(', ')` 排除掉）：
 * `grep -rnE "readJsonFile\([^)]*, *'|[^.\w]join\([^)]*, *'" packages/engine/src apps/server/src`
 * 除本模块外只应剩下这几类，且都是**有意留下**的：
 * - `checkpoint.ts` 的 `.git`/`index.lock`/`info/exclude`/`spark-checkpoints.json` —— 活在快照
 *   自建的那个 git 仓里，不是数据根的子项；
 * - `extensions/loader.ts` 的 `spark-extension.json`、`skills/loader.ts` 的 `skill.json`、
 *   `prompts.ts` 的 `AGENTS.md` —— 各自那层目录内的清单文件；
 * - `apps/server/src/static.ts` 的 `assets` —— web 构建产物，不在数据根。
 * 另有两类命中**不是路径、故不收敛**：`ConfigError`/`parseOrThrow` 里的文件名（给人看的错误标签）、
 * `settings-store.ts` 的 `raw['agents']` 之类（spark.json 内的 JSON 键名）。
 * 再出现别的路径拼法命中，就是有人又开始现拼了。
 *
 * 后果不是"不好看"，是三件具体的事：
 * ① **读与写分叉**（本批真找到两处，都已修）：
 *    · `<cwd>/.spark/permissions.json` 在读侧 `config.ts:loadProjectRules` 与写侧
 *      `engine.ts` 构造的 `UserRuleStore` 各拼一遍——任一侧改名后表现是「设置里保存成功、
 *      重载后规则消失」，不报错不崩溃，最难查的那类；
 *    · `logs/engine.log` 在写侧 `logger.ts` 与读侧 `logs.ts`（19.38 诊断页）各拼一遍，
 *      同理改一侧即诊断页读到空文件而不是报错。
 * ② **缺省根绕开 `sparkHome()`**：`logger.ts` 与 `tools/output-store.ts` 的默认参数是
 *    `join(homedir(), '.spark')`，即 `SPARK_HOME` 对它们无效（19.16 立 SPARK_HOME 时漏的两处）。
 *    引擎主路径都显式传 root 所以没暴露；一旦被独立构造（CLI/测试/嵌入方）就写到另一个根去。
 * ③ 19.37 的占用统计与 19.34 的清理要按类别报数——若统计模块自带一份手抄清单，引擎新增或
 *    改名一个子路径时报表演**安静地漏项**（数字看着齐、实则少一项）。故统计侧走目录发现，
 *    本模块只承担"已知类别的标签与嵌套规则"。
 *
 * 顺带纠正一处**命名说谎**：`Engine.dataRoot` 看像"另一个根"，实际 `get dataRoot() { return this.root }`
 * 就是 sparkHome 的只读别名；`LspManager` 的 `dataRoot` 依赖同样收 sparkHome。两个名字会让人以为
 * 存在"数据根 ≠ 引擎根"的形态——不存在。故本模块统一只认参数名 `root`，`LspManager` 的该依赖同步
 * 改名 `root`（与同处构造的 `LspInstaller({ root })` 对齐）。
 * **但 `Engine.dataRoot` 这个对外 getter 不改名**：server 与 sdk 有若干处拿它当 mcp.json 的锚点，
 * 改名是破坏 semver 面的动作，收益只是少一处误读，不值。要改得单独一轮并在 doc/02 §4.6 裁决表记。
 *
 * 不收录的东西（有意为之）：项目级 `AGENTS.md`（`prompts.ts` 从会话 cwd 向上找，与 sparkHome 无关）、
 * 扩展包内 `spark-extension.json`、技能目录内 `skill.json`——它们在**各自那层**目录里，不是数据根的子项，
 * 混进来会让这张表变成杂物清单。
 */
import { dirname, join } from 'node:path'

/** sparkHome 根级文件（值即文件名；`mcp`/`lsp` 两键也被各自的 config 模块当文件名用） */
export const SPARK_FILE = {
  /** 引擎设置（persistSparkPatch 的落点） */
  settings: 'spark.json',
  /** 模型与路由目录 */
  models: 'models.json',
  mcp: 'mcp.json',
  lsp: 'lsp.json',
  permissions: 'permissions.json',
  secrets: 'secrets.json',
  /** 目录信任表（ADR D37：引擎进程是唯一写者） */
  trusted: 'trusted.json',
  /** 用量累计（CostTracker） */
  usage: 'usage.json',
  /** 审计流 */
  audit: 'audit.jsonl',
  /** 长期记忆（FTS5） */
  memoryDb: 'memory.db',
  /** 向量检索（19.8） */
  vectorsDb: 'vectors.db',
  /** 全文搜索索引（12.x） */
  searchDb: 'search.db',
  /** 会话索引（19.41 起带 pinned 列）——与 search.db 是两个库，别混 */
  sessionIndexDb: 'index.db',
  /** 反馈库（19.19） */
  feedbackDb: 'feedback.db',
  /** 配对设备仓（9.1 / ADR D24；**写者是 apps/server 不是引擎**，列在这里因为它同样落在数据根） */
  devices: 'devices.json',
} as const

export type SparkFileKey = keyof typeof SPARK_FILE

/** sparkHome 根级目录 */
export const SPARK_DIR = {
  /** 会话 JSONL 树：`sessions/<cwd 派生目录>/<sid>.jsonl` */
  sessions: 'sessions',
  /** 检查点快照仓，实际嵌在 `sessions/<cwd 派生目录>/<sid>/checkpoints/`（用 `checkpointsRootOf`） */
  checkpoints: 'checkpoints',
  logs: 'logs',
  /** 两段式删除的落点（删除保护纪律：不真删） */
  trash: 'trash',
  attachments: 'attachments',
  /** arena 竞答记录（19.10 起落盘） */
  arena: 'arena',
  skills: 'skills',
  commands: 'commands',
  extensions: 'extensions',
  /** 子代理预设（13.5 / D36） */
  agents: 'agents',
  /** browser 工具截图 */
  browserShots: 'browser-shots',
  /** 超长工具输出溢出文件 */
  toolOutputs: 'tool-outputs',
} as const

export type SparkDirKey = keyof typeof SPARK_DIR

/** 日志目录内的引擎日志文件名（`logs.ts` 读、`logger.ts` 写，两边同一个名字） */
const ENGINE_LOG_FILE = 'engine.log'

/** sparkHome 根级文件的全路径 */
export function sparkFile(root: string, key: SparkFileKey): string {
  return join(root, SPARK_FILE[key])
}

/** sparkHome 根级目录的全路径 */
export function sparkDir(root: string, key: SparkDirKey): string {
  return join(root, SPARK_DIR[key])
}

/** 引擎日志全路径（`<root>/logs/engine.log`）——读写两侧共用，防目录名与文件名各拼一半 */
export function engineLogFile(root: string): string {
  return join(sparkDir(root, 'logs'), ENGINE_LOG_FILE)
}

/** 附件存储目录（server 上传与引擎取回共用同一个出口；此前两边各拼一次字面量） */
export function attachmentsDir(root: string): string {
  return sparkDir(root, 'attachments')
}

/**
 * 会话检查点根：与 JSONL **同级**的 `checkpoints/` 目录（doc/02 §5.8.7 的两域一棵树）。
 * 收的是会话文件路径而不是 sparkHome——这个目录不在根级，按根级清单去拼必然拼错。
 */
export function checkpointsRootOf(sessionFilePath: string): string {
  return join(dirname(sessionFilePath), SPARK_DIR.checkpoints)
}

/**
 * 项目级数据目录名：`<会话 cwd>/.spark/`。与用户级 sparkHome 是**两个概念**（一个是仓库内的
 * 项目规则与子代理预设，一个是引擎全局数据），字面量同为 '.spark' 纯属巧合——共用常量会让
 * 「改用户目录名」顺手改掉项目目录名，故各留一个。
 */
export const PROJECT_SPARK_DIR = '.spark'

/** 项目级数据目录（`<cwd>/.spark`） */
export function projectSparkDir(cwd: string): string {
  return join(cwd, PROJECT_SPARK_DIR)
}

/**
 * 项目级权限规则文件（`<cwd>/.spark/permissions.json`）。
 * 收口的理由是**读与写必须同源**：读侧 `config.ts:loadProjectRules`、写侧 engine.ts 构造的
 * `UserRuleStore` 此前各拼一遍，任一侧改名后的表现是「设置里保存成功、重载后规则消失」——
 * 不报错不崩溃，是最难查的那类分叉。
 */
export function projectPermissionsFile(cwd: string): string {
  return join(projectSparkDir(cwd), SPARK_FILE.permissions)
}
