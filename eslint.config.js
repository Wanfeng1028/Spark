// ESLint flat config——typescript-eslint 严格档（doc/02 §3.1：CI 四关之一）
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    // examples/spike-pi-ai 独立安装依赖、不进主构建（其 package.json 自述），
    // CI 只装根 workspace 依赖，类型解析不到会误报 unsafe-* —— 整目录排除
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/release/**',
      '**/node_modules/**',
      '**/*.min.js',
      'examples/spike-pi-ai/**',
      // official/ 产品官网：独立 Next.js 15 站（AGENTS v1.54 决策不入 pnpm workspace、无锁文件入库）。
      // 根 CI 只装 workspace 依赖 → official/node_modules 不存在 → projectService 找到
      // official/tsconfig.json 也解析不了 react/next 类型，no-unsafe-* 全量误报（CI 34865046856，
      // 同 spike-pi-ai 判例）。质量门由 .github/workflows/official.yml 独立把守
      // （install/typecheck/build 三步，--ignore-workspace 独立装依赖），两路 CI 互不牵连。
      'official/**',
      // 本地工具产物（Qoder better-harness 报告等，同 .trae-html-share-packages 判例）
      '.qoder/better-harness/**',
      // 临时产物落地区（多会话调试输出，.gitignore 同口径）——非项目成员，不入类型感知
      '_scratch/**',
      // 测试夹具：由测试用例 spawn 的独立 Node 脚本（非 TS 项目成员）
      'packages/engine/tests/fixtures/*.mjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    // 配置文件（JS、不在任何 tsconfig 项目内）关闭类型感知规则——官方推荐做法
    files: ['**/*.config.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // apps/mobile 的 Metro/Babel 配置：CJS（require/module.exports），声明 Node CJS 全局
    files: ['apps/mobile/babel.config.js', 'apps/mobile/metro.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        module: 'writable',
        require: 'readonly',
        __dirname: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // apps/miniapp 的 Babel 配置：CJS（同 mobile 判例——工单 9.4）
    files: ['apps/miniapp/babel.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        module: 'writable',
        require: 'readonly',
        __dirname: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            'eslint.config.js',
            // apps/mobile 的 Metro/Babel 配置（CJS，不在任何 tsconfig 项目内）
            'apps/mobile/metro.config.js',
            'apps/mobile/babel.config.js',
            // apps/miniapp 的 Babel 配置（同判例）
            'apps/miniapp/babel.config.js',
            // apps/desktop 的 sidecar 构建脚本（工单 14.1 第三批）：与 apps/cli/scripts/build.mjs 同类，
            // 但 cli 那份是靠其 tsconfig `include: ["scripts"]` + allowJs 进项目的；desktop 的 tsconfig 是
            // commonjs + 只含 src/tests，把顶层 await 的 .mjs 拉进去要改 module/allowJs（风险大于收益），
            // 故走本白名单——它正是为"不在任何 tsconfig 项目内的松散 JS"设的。
            'apps/desktop/scripts/build-server.mjs',
            // apps/server 的 dist 外置导入自校验脚本（发布链路修复批）：同 desktop 判例——
            // server tsconfig 只含 src/tests，顶层 await 的 .mjs 不入项目
            'apps/server/scripts/check-dist.mjs',
          ],
        },
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      // 接口实现中刻意忽略的参数（如 MockTransport.sendMessage 的 sessionId）用 _ 前缀显式标记
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
)
