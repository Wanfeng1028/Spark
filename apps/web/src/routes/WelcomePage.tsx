/**
 * 欢迎页 /welcome（doc/02 §6.2.1 / DESIGN.md §7.1）：紧凑引导块——页面级标题 + 一段话说明 +
 * 唯一主按钮 + 提示词 chips；禁止 hero/落地页式。无历史会话时隐藏"最近会话"区块（阶段二接入）。
 * 新建会话/点击 chip 依赖 Transport（工单 1.4 接入前禁用，禁用态即真实状态）。
 */
const PROMPTS = [
  '总结这个项目的架构',
  '跑一遍测试并修复失败项',
  '把 src 里的 any 清理掉',
]

export function WelcomePage() {
  return (
    <div className="h-full overflow-y-auto px-6 pt-16">
      <section className="flex max-w-md flex-col gap-4" aria-label="引导">
        <h1 className="text-[15px] font-medium tracking-tight">Spark</h1>
        <p className="text-xs leading-relaxed text-muted-foreground">
          本地 Agent 工作台：引擎负责运行循环、工具执行与人工审批，这里是事件流的投影。
        </p>
        <div>
          <button
            type="button"
            disabled
            title="工单 1.4 接入 Transport 后可用"
            className="h-7 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            新建会话
          </button>
        </div>
        <ul className="flex flex-wrap gap-2" aria-label="快捷提示词">
          {PROMPTS.map((p) => (
            <li key={p}>
              <button
                type="button"
                disabled
                title="工单 1.4 接入 Transport 后可用"
                className="h-6 rounded-md border border-border px-2.5 text-xs text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {p}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
