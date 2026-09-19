import { FlatCompat } from "@eslint/eslintrc";

// WO-031：官网此前只有孤立的 eslint-disable 注释而无 ESLint 本体——配置补齐后
// 该类指令才有意义。create-next-app 同款 flat compat 路线（Next 15 官方推荐）。
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts"],
  },
];
