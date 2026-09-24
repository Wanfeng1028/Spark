/**
 * 移动端 i18n 消费入口（工单 19.17 第四批；形态对齐 apps/cli/src/i18n.ts 与
 * apps/miniapp/src/i18n.ts）：语言单源 = 服务端 spark.json `ui.language`
 * （GET /api/settings，热档），未配对或读取失败时保持现值（缺省 zh-CN）。
 *
 * **本端不做系统语言探测**（与 miniapp 的差异，如实登记）：RN 侧要拿系统语言得引
 * `expo-localization`——那是新依赖（AGENTS §2.3a 下载需逐次授权）；而服务端档本就是
 * 四端约定的单一来源，探测只是它缺失时的兜底。不拿 NativeModules 的私有字段凑：
 * iOS 的 `SettingsManager.settings.AppleLanguages` 与 Android 的 `DevSettings`／
 * `I18nManager.localeIdentifier` 口径不一致且随版本变，是不可靠来源。
 *
 * 缺键回落中文是 protocol translate 的既定语义（19.17 分批迁移纪律）：本端只接字典里
 * 已存在的键，长尾文案仍直写中文——translate 对缺键回落 **key 本身**（不是中文），
 * 乱接键会把 "settings.pageGeneral" 这种字符串渲染到界面上。
 */
import { errorMessageOf, translate } from '@spark/protocol'
import { useAppStore } from './store/app-store'

/** 当前语言的取词入口（store 读，不经 React context——与 CLI cliT / miniapp miniT 同形态） */
export function mobileT(key: string, vars?: Record<string, string | number>): string {
  return translate(useAppStore.getState().language, key, vars)
}

/**
 * 错误文案的唯一收口（与 web `lib/error-copy.ts`、cli `cliErrorMessageOf`、miniapp
 * `miniErrorMessageOf` 同形态）：读本端 store 当前语言。端内十来处调用点都在失败那刻
 * 就把人话串写进 notice，渲染时已拿不到原始错误——逐个传 lang 就是 19.17 明令禁止的「拆散」。
 *
 * 本模块**刻意不引 transport**（拉服务端语言的 `syncUiLanguage` 放在 transport/runtime.ts）：
 * session/*.ts 那批控制器是依赖注入形态、单测里不碰网络，若从这里牵进 runtime 就会把
 * react-native-sse 一并拖进它们的模块图。
 */
export function mobileErrorMessageOf(err: unknown): string {
  return errorMessageOf(err, useAppStore.getState().language)
}
