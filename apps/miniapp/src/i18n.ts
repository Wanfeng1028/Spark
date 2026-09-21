/**
 * 小程序 i18n 消费入口（工单 19.29 接 19.17 框架；形态对齐 apps/cli/src/i18n.ts）。
 * 语言单源 = 服务端 spark.json `ui.language`（GET /api/settings 读，热档），
 * 端上不猜系统语言优先——未配对/设置读取失败时才落系统语言探测（resolveLanguage），
 * 保证离线首屏与在线档不出现两种按钮文案的分叉来源。
 * 缺键回落中文是 protocol translate 的既定语义（19.17 分批迁移纪律）：本端只接
 * 字典里已存在的键（shell 与 action 两个命名空间），筛选档位、空态等长尾文案仍直写中文——
 * translate 对缺键会回落 **key 本身**（不是中文），乱接键会把"settings.pageGeneral"
 * 这种字符串渲染到界面上。
 */
import { detectLanguage, translate, type Language } from '@spark/protocol'
import { useAppStore } from './store/app-store'

/**
 * 语言解析（纯函数，单测把关）：服务端档存在即赢；否则按候选标签探测
 * （微信 getAppBaseInfo().language 给 `zh_CN` / `en` 式值，detectLanguage 归一）。
 */
export function resolveLanguage(
  serverLang: Language | undefined,
  systemTags: readonly string[],
): Language {
  return serverLang ?? detectLanguage(systemTags)
}

/** 当前语言的取词入口（store 读，不经 React context——与 CLI cliT 同形态） */
export function miniT(key: string, vars?: Record<string, string | number>): string {
  return translate(useAppStore.getState().language, key, vars)
}
