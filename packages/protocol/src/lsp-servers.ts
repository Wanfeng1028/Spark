/**
 * 内置 LSP server 已知清单（阶段十九工单 19.5，翻案 16.9"无下载器"判决）：
 * 语言 → npm 全局安装包（caret 版本 pin）→ 启动命令。单一来源在 protocol——
 * 引擎安装器、web 设置页安装区、CLI 面板指引三端同源消费（D22 共享资产纪律）。
 * 安装执行 = 用户机 `npm install -g`（运行时行为，非开发机下载；npm registry
 * 自带完整性校验，替代手工 checksum——直链/校验和类下载源 v1 不做，见 D47）。
 * 清单是封闭静态数据：零依赖、无 IO，测试可全量断言形状。
 */
export interface KnownLspServer {
  /** 安装 id（/lsp install <id> 与 POST /api/lsp/install 的定位符） */
  id: string
  /** lsp.json 的语言键（engine lsp/config.ts languages 表同键） */
  language: string
  description: string
  /** `npm install -g` 包清单（@version caret pin；含 server 本体的 peer 依赖） */
  npmPackages: readonly string[]
  /** 装完后的可执行命令（写入 lsp.json 的 command） */
  command: string
  /** 启动参数（写入 lsp.json 的 args） */
  args: readonly string[]
}

export const KNOWN_LSP_SERVERS: readonly KnownLspServer[] = [
  {
    id: 'typescript',
    language: 'typescript',
    description: 'TypeScript / JavaScript 语言服务器（含 TS 编译器依赖）',
    npmPackages: ['typescript-language-server@^4.3.0', 'typescript@^5'],
    command: 'typescript-language-server',
    args: ['--stdio'],
  },
  {
    id: 'python',
    language: 'python',
    description: 'Python 语言服务器（基于静态类型检查，自带运行时依赖）',
    npmPackages: ['pyright@^1.1.0'],
    command: 'pyright-langserver',
    args: ['--stdio'],
  },
  {
    id: 'html',
    language: 'html',
    description: 'HTML 语言服务器（vscode 内置四件套提取版）',
    npmPackages: ['vscode-langservers-extracted@^4.10.0'],
    command: 'vscode-html-language-server',
    args: ['--stdio'],
  },
  {
    id: 'css',
    language: 'css',
    description: 'CSS/SCSS/LESS 语言服务器（vscode 内置四件套提取版）',
    npmPackages: ['vscode-langservers-extracted@^4.10.0'],
    command: 'vscode-css-language-server',
    args: ['--stdio'],
  },
  {
    id: 'json',
    language: 'json',
    description: 'JSON 语言服务器（vscode 内置四件套提取版）',
    npmPackages: ['vscode-langservers-extracted@^4.10.0'],
    command: 'vscode-json-language-server',
    args: ['--stdio'],
  },
  {
    id: 'bash',
    language: 'bash',
    description: 'Bash 脚本语言服务器',
    npmPackages: ['bash-language-server@^5.0.0'],
    command: 'bash-language-server',
    args: ['start'],
  },
  {
    id: 'yaml',
    language: 'yaml',
    description: 'YAML 语言服务器（含 schema 校验）',
    npmPackages: ['yaml-language-server@^1.15.0'],
    command: 'yaml-language-server',
    args: ['--stdio'],
  },
]

/** 按 id 查清单条目（未知 id → undefined，调用方 fail-closed） */
export function findKnownLspServer(id: string): KnownLspServer | undefined {
  return KNOWN_LSP_SERVERS.find((s) => s.id === id)
}
