/**
 * 独立页页头（工单 R-E⑧）：h1 + 一句说明的统一骨架——SearchPage/AutomationPage/
 * SettingsPage 三处同构收敛。SettingsPage 用 titleSize="lg"（原 text-xl 版式）。
 */
export function PageHeader({
  title,
  description,
  titleSize = 'base',
}: {
  title: string
  description: string
  titleSize?: 'base' | 'lg'
}) {
  return (
    <header className="flex flex-col gap-1">
      <h1
        className={
          titleSize === 'lg' ? 'text-xl font-semibold leading-tight' : 'text-base font-semibold'
        }
      >
        {title}
      </h1>
      <p className="text-xs text-muted-foreground">{description}</p>
    </header>
  )
}
