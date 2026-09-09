// Metro 配置（CJS——Expo 约定）：pnpm monorepo——watch 仓库根、双 node_modules 解析，
// 使 @spark/protocol 等 workspace 包的 TS 源码可被 Metro 直接转译。
const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const monorepoRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)
config.watchFolders = [monorepoRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
]

// @spark/protocol 以 TS 源码分发（main: src/index.ts），内部按 ESM TS 惯例以
// `./ids.js` 后缀引用 `./ids.ts`。Metro 无 webpack 的 extensionAlias 语义，故在
// resolveRequest 链头部把相对导入的 `.js` 后缀剥掉，交回默认解析器按 sourceExts
// （.ts 在 .js 前）自行命中——两种情况都正确：protocol 的 `./ids.js` 命中 ids.ts；
// node_modules 里真实 .js 文件（如 react-native-reanimated 的 lib/module ESM）
// 剥后缀后命中同名 .js。与 jest 侧同口径：package.json moduleNameMapper 的
// `^(\\.{1,2}/.*)\\.js$` → `$1`。不改为 `.ts` 改写的原因：会把 reanimated web
// 入口里真实存在的 .js 引用指向不存在的 .ts。
// 回退用 context.resolveRequest（Metro 注入的默认解析链，Expo CLI 的 resolver
// 组合文档化契约，见 withMetroResolvers 的链接注释），不走裸 require('metro-resolver')：
// pnpm 严格布局下本包解析不到它，且裸 resolve 会绕开 Expo 自动链接与平台别名链。
const superResolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const stripped =
    (moduleName.startsWith('./') || moduleName.startsWith('../')) && moduleName.endsWith('.js')
      ? moduleName.slice(0, -3)
      : moduleName
  return (superResolveRequest ?? context.resolveRequest)(context, stripped, platform)
}

module.exports = config
