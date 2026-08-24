/**
 * 静态托管（doc/02 §7.5）：托管 apps/web/dist；SPA fallback 回 index.html（/api 前缀除外）。
 * 缓存策略：Vite 内容哈希资源（assets/）immutable；index.html 一律 no-cache（发版即生效）。
 */
import { join } from 'node:path'
import fastifyStatic from '@fastify/static'
import type { FastifyPluginAsync } from 'fastify'

export interface StaticOptions {
  root: string
}

export const registerStatic: FastifyPluginAsync<StaticOptions> = async (app, opts) => {
  const assetsPrefix = `${join(opts.root, 'assets')}/`
  await app.register(fastifyStatic, {
    root: opts.root,
    cacheControl: false, // 关闭 send 默认 Cache-Control，由 setHeaders 统一控制
    setHeaders: (res, path) => {
      if (path.startsWith(assetsPrefix)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      } else {
        res.setHeader('Cache-Control', 'no-cache')
      }
    },
  })

  // SPA fallback：未知路由回 index.html；/api 前缀保持 JSON 404（§7.5：API 404 不回 HTML）
  app.setNotFoundHandler((req, reply) => {
    if (req.raw.url?.startsWith('/api') ?? false) {
      reply.code(404).send({ code: 'E_NOT_FOUND', message: 'not found' })
      return
    }
    return reply.sendFile('index.html')
  })
}
