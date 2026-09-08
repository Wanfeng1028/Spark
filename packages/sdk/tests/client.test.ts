/**
 * @spark/sdk 单测（工单 14.3）：只测两件事——**装配**与**薄转发**。
 *
 * ① createClient 造出的 transport 就是 protocol 的 HttpTransport（同一条装配路径，
 *    不是第二套实现——SDK 的价值在于装配收敛，不在于新逻辑）；
 * ② 三组便利方法都是 Transport 的转发：替换底层方法后调用即命中，参数原样透传；
 * ③ close() 转发 dispose()，收口后出网被拒（失败闭合，不静默）。
 *
 * 全程不出网：eventStream: false（不起 SSE）+ baseUrl 指向不可达端口 + 断言前替换底层方法。
 */
import { describe, expect, test } from 'vitest'
import { HttpTransport, ids } from '@spark/protocol'
import type { SessionDto, SubmitOutcome } from '@spark/protocol'
import { createClient } from '../src/index.js'
import type { SparkClient, SparkClientOptions } from '../src/index.js'

const OPTIONS: SparkClientOptions = { eventStream: false }
const SID = ids.session('ses_sdkcontract1')

function makeClient(): SparkClient {
  return createClient('http://127.0.0.1:1', OPTIONS)
}

const noSessions = [] as unknown as SessionDto[]
const oneSession = {} as unknown as SessionDto
const started: SubmitOutcome = { result: 'started' }

describe('createClient（工单 14.3）', () => {
  test('装配出 protocol 的 HttpTransport（不是第二套实现）', () => {
    const client = makeClient()
    expect(client.transport).toBeInstanceOf(HttpTransport)
    client.close()
  })

  test('sessions 组：薄转发且参数原样透传', async () => {
    const client = makeClient()
    const hits: string[] = []
    client.transport.listSessions = (archived) => {
      hits.push(`list:${String(archived)}`)
      return Promise.resolve(noSessions)
    }
    client.transport.createSession = (opts) => {
      hits.push(`create:${opts?.model ?? '-'}`)
      return Promise.resolve(oneSession)
    }
    client.transport.sendMessage = (sessionId, text) => {
      hits.push(`send:${sessionId}:${text}`)
      return Promise.resolve(started)
    }
    client.transport.interrupt = (sessionId) => {
      hits.push(`interrupt:${sessionId}`)
      return Promise.resolve()
    }
    client.transport.deleteSession = (sessionId) => {
      hits.push(`remove:${sessionId}`)
      return Promise.resolve()
    }

    await client.sessions.list(true)
    await client.sessions.create({ model: 'fake/fake-chat' })
    await client.sessions.send(SID, '你好')
    await client.sessions.interrupt(SID)
    await client.sessions.remove(SID)

    expect(hits).toEqual([
      'list:true',
      'create:fake/fake-chat',
      `send:${SID}:你好`,
      `interrupt:${SID}`,
      `remove:${SID}`,
    ])
    client.close()
  })

  test('events.replay 透传 getSession 的分页语义（不另造 since 过滤）', async () => {
    const client = makeClient()
    const hits: string[] = []
    client.transport.getSession = (sessionId, query) => {
      hits.push(`get:${sessionId}:${JSON.stringify(query)}`)
      return Promise.resolve(oneSession)
    }
    await client.events.replay(SID, { limit: 10 })
    await client.events.replay(SID)
    expect(hits).toEqual([`get:${SID}:{"limit":10}`, `get:${SID}:undefined`])
    client.close()
  })

  test('events.subscribe 返回退订函数；approvals.resolve 转发 replyPermission', async () => {
    const client = makeClient()
    const hits: string[] = []
    const unsubscribe = client.events.subscribe((e) => {
      hits.push(`event:${e.type}`)
    })
    expect(typeof unsubscribe).toBe('function')
    unsubscribe()

    client.transport.replyPermission = (requestId, reply, feedback) => {
      hits.push(`reply:${requestId}:${reply}:${feedback ?? '-'}`)
      return Promise.resolve()
    }
    await client.approvals.resolve(ids.request('req_sdkcontract1'), 'reject', '不写这个文件')
    await client.approvals.resolve(ids.request('req_sdkcontract2'), 'once')

    expect(hits).toEqual([
      'reply:req_sdkcontract1:reject:不写这个文件',
      'reply:req_sdkcontract2:once:-',
    ])
    client.close()
  })

  test('close() = dispose()：收口后出网被拒（失败闭合，不静默）', async () => {
    const client = makeClient()
    client.close()
    await expect(client.transport.listSessions()).rejects.toThrow()
  })
})
