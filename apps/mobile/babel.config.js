// babel 配置（CJS——Expo 约定；reanimated 插件由 babel-preset-expo 自动接入）
module.exports = function (api) {
  api.cache(true)
  return { presets: ['babel-preset-expo'] }
}
