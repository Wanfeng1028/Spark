/**
 * 会话侧栏（doc/02 §6.2.2）：240px 常驻。列表/分组/状态点/新建是阶段二（对 Mock 开发）；
 * 阶段一空壳只放区块标题与空态说明——不放假数据（DESIGN.md §5 禁止假状态）。
 */
export function Sidebar() {
  return (
    <nav className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="px-2 pt-1 text-xs text-muted-foreground">会话</div>
      <div className="px-2 py-1 font-mono text-xs text-muted-foreground/70">
        会话列表将在阶段二接入事件流
      </div>
    </nav>
  )
}
