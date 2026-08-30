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

module.exports = config
