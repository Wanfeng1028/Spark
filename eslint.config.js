// ESLint flat config——typescript-eslint 严格档（doc/02 §3.1：CI 四关之一）
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/*.min.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    // 配置文件（JS、不在任何 tsconfig 项目内）关闭类型感知规则——官方推荐做法
    files: ['**/*.config.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js'] },
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
)
