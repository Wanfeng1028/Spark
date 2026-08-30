/**
 * Taro 构建配置（工单 9.4）。
 * - framework=react / compiler=webpack5：与 @spark/mobile 同语法栈（React 18——
 *   Taro 4 的 peer 上限，仅本包锁 18，不扩散其它包）。
 * - mini.compile.include 纳入 @spark/protocol 源码（其 main 直指 src/index.ts，
 *   需 babel 编译）；extensionAlias 让 `./ids.js` 式 TS ESM 路径解析到 .ts。
 * - 不设 build 脚本：根 `pnpm build`（pnpm -r build）语义不含小程序产物
 *   （开发者工具上传才发布），避免 CI/根构建误触发（package.json 自述）。
 */
import path from 'node:path'
import { defineConfig } from '@tarojs/cli'

export default defineConfig({
  projectName: 'spark-miniapp',
  date: '2026-08-30',
  designWidth: 750,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    375: 2,
    828: 1.81 / 2,
  },
  sourceRoot: 'src',
  outputRoot: 'dist',
  plugins: [],
  defineConstants: {},
  copy: {
    patterns: [],
    options: {},
  },
  framework: 'react',
  compiler: 'webpack5',
  cache: {
    enable: false,
  },
  mini: {
    postcss: {
      pxtransform: {
        enable: true,
        config: {},
      },
    },
    compile: {
      // @spark/protocol 以 TS 源码分发（main: src/index.ts）——纳入 babel 编译
      include: [path.resolve(__dirname, '..', '..', '..', 'packages', 'protocol', 'src')],
    },
    webpackChain(chain) {
      // protocol 内部以 `.js` 后缀引用 `.ts` 模块（ESM TS 惯例）——映射解析。
      // webpack-chain 类型未暴露 extensionAlias，走 merge 直写 webpack 配置面。
      chain.merge({
        resolve: {
          extensionAlias: { '.js': ['.ts', '.js'] },
        },
      })
    },
  },
})
