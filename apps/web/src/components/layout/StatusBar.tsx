/**
 * 状态条 28px（DESIGN.md §2）：连接状态点 + 模型名 + seq 水位 + token 累计（后三项阶段二接 store）。
 * 阶段一空壳：结构就位，连接状态显示"未连接"（transport 未接入是真实状态，不造假数据）。
 */
export function StatusBar() {
  return (
    <footer className="flex h-7 items-center justify-between border-t border-border px-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        <span aria-hidden className="size-2 rounded-full bg-muted-foreground/50" />
        <span>未连接</span>
      </div>
      <div className="flex items-center gap-3 font-mono">
        <span>v0.1.0</span>
      </div>
    </footer>
  )
}
