/**
 * 致命启动失败引导窗的纯渲染（AUD-12）：桌面壳首启无配置（models.json 缺失）时
 * sidecar 起不来即静默秒退，用户得不到任何引导。本模块只拼字符串——**Electron
 * 主进程禁 import 引擎（D14 铁律）**，也不做任何 IO；HTML 自包含（内联样式、
 * 中文文案、无外部资源、无脚本），插值一律经 escapeHtml 防配置内容注入。
 * 风格：黑白中性（zinc 色阶）内联样式，与 DESIGN token 基调一致。
 */

/** HTML 文本转义（& < > " '）——reason 来自配置/进程输出，不可信 */
function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function renderFatalHtml(input: {
  title: string
  reason: string
  sparkDir: string
  logHint: string
}): string {
  const { title, reason, sparkDir, logHint } = input
  const esc = escapeHtml
  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${esc(title)}</title>`,
    '<style>',
    'body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;',
    'background:#fafafa;color:#18181b;display:flex;align-items:center;justify-content:center;min-height:100vh}',
    'main{max-width:400px;padding:24px;border:1px solid #e4e4e7;border-radius:12px;background:#fff}',
    'h1{font-size:16px;margin:0 0 12px;font-weight:600}',
    'p{font-size:13px;line-height:1.7;margin:0 0 10px;color:#3f3f46}',
    'p.reason{white-space:pre-wrap}',
    'code{font-family:ui-monospace,SFMono-Regular,monospace;font-size:12px;',
    'background:#f4f4f5;padding:1px 4px;border-radius:4px;word-break:break-all}',
    '</style>',
    '</head>',
    '<body>',
    '<main>',
    `<h1>${esc(title)}</h1>`,
    `<p class="reason"><strong>原因：</strong>${esc(reason)}</p>`,
    `<p>首次使用需要配置模型：配置文件位于 <code>${esc(sparkDir)}/models.json</code>，可由应用内引导完成。</p>`,
    `<p>日志位于 <code>${esc(logHint)}</code>。</p>`,
    '<p>请重启应用重试。</p>',
    '</main>',
    '</body>',
    '</html>',
  ].join('')
}
