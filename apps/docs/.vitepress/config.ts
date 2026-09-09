import { defineConfig } from 'vitepress'

/**
 * 开发者文档站配置（工单 14.6）。
 *
 * DESIGN §12 的红线同样适用于文档站：**不用 hero 渐变、不用 emoji 装饰、不用 bento 三卡模板**——
 * 首页（index.md）是纯文本索引而不是营销页（故不启用 VitePress 的 `layout: home`）。
 *
 * `base` 必须带仓库名：GitHub Pages 发布在 https://wanfeng1028.github.io/Spark/。
 */
export default defineConfig({
  lang: 'zh-CN',
  title: 'Spark',
  description: 'Agent 工作台：可嵌入引擎、双通道客户端 SDK、四端一致的事件流协议',
  base: '/Spark/',
  cleanUrls: true,
  themeConfig: {
    nav: [
      { text: '开始', link: '/getting-started' },
      { text: '概念', link: '/layers' },
      { text: '参考', link: '/events' },
    ],
    sidebar: [
      {
        text: '开始',
        items: [
          { text: '总览', link: '/' },
          { text: '五分钟跑通', link: '/getting-started' },
        ],
      },
      {
        text: '概念',
        items: [
          { text: '五层开发者面（L0–L4）', link: '/layers' },
          { text: 'Transport 双通道', link: '/transports' },
        ],
      },
      {
        text: '参考',
        items: [
          { text: '事件词表', link: '/events' },
          { text: '常见问题', link: '/faq' },
        ],
      },
    ],
    outline: { level: [2, 3], label: '本页' },
    docFooter: { prev: '上一页', next: '下一页' },
    lastUpdated: { text: '最后更新' },
    darkModeSwitchLabel: '外观',
    sidebarMenuLabel: '目录',
    returnToTopLabel: '回到顶部',
    search: { provider: 'local' },
  },
})
