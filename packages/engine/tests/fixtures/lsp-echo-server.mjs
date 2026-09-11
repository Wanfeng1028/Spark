/**
 * 假 LSP server（工单 16.9 e2e 夹具，同 mcp-echo-server.mjs 定位）：
 * Content-Length JSON-RPC over stdio 的最小实现——
 * initialize → 回 capabilities；textDocument/didOpen → 20ms 后推一条 publishDiagnostics
 * （诊断故意携带白名单外字段 tags——验证引擎侧 wire 收敛剥除）；
 * textDocument/definition → 回一个同文件 Location；shutdown → result:null。
 */
let acc = Buffer.alloc(0)

function write(msg) {
  const body = JSON.stringify(msg)
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
}

function handle(msg) {
  if (msg.method === 'initialize') {
    write({ id: msg.id, jsonrpc: '2.0', result: { capabilities: { textDocumentSync: 1 } } })
    return
  }
  if (msg.method === 'textDocument/didOpen') {
    const uri = msg.params.textDocument.uri
    setTimeout(() => {
      write({
        jsonrpc: '2.0',
        method: 'textDocument/publishDiagnostics',
        params: {
          uri,
          diagnostics: [
            {
              severity: 1,
              range: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } },
              message: 'fixture: x is not defined',
              source: 'fixture',
              code: '2304',
              tags: [1],
            },
          ],
        },
      })
    }, 20)
    return
  }
  if (msg.method === 'textDocument/definition') {
    write({
      id: msg.id,
      jsonrpc: '2.0',
      result: {
        uri: msg.params.textDocument.uri,
        range: { start: { line: 9, character: 6 }, end: { line: 9, character: 10 } },
      },
    })
    return
  }
  if (msg.method === 'shutdown') {
    write({ id: msg.id, jsonrpc: '2.0', result: null })
    return
  }
  if (msg.id !== undefined) {
    write({ id: msg.id, jsonrpc: '2.0', result: null })
  }
}

process.stdin.on('data', (chunk) => {
  acc = Buffer.concat([acc, chunk])
  for (;;) {
    const sep = acc.indexOf('\r\n\r\n')
    if (sep < 0) return
    const header = acc.slice(0, sep).toString('utf8')
    const m = /Content-Length: (\d+)/i.exec(header)
    if (m === null) {
      acc = Buffer.alloc(0)
      return
    }
    const total = sep + 4 + Number(m[1])
    if (acc.length < total) return
    const body = JSON.parse(acc.slice(sep + 4, total).toString('utf8'))
    acc = acc.slice(total)
    handle(body)
  }
})
