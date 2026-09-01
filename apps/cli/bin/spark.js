#!/usr/bin/env node
// CLI 启动器（工单 11.6）：npm bin 入口需要 shebang 载体——bundle 产物 dist/main.js
// 由 build 脚本以 banner 注入 shebang，本文件保持最小（真实入口见 src/main.tsx）。
import '../dist/main.js'
