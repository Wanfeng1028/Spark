import { Languages } from "lucide-react";

/**
 * TranslationNotice — en 子页顶部的翻译中提示（19.47 批 2a）：
 * 首页与导航已全双语；子页正文翻译登记为批 2b（doc/08 §5D.13），未翻译的页面
 * 如实标注并回落中文原文——不做假翻译（禁假状态），也不留 404。
 */
export function TranslationNotice(): React.JSX.Element {
  return (
    <div className="border-b border-border bg-zinc-50">
      <p className="mx-auto flex max-w-4xl items-center gap-2 px-6 py-2.5 text-sm text-muted-foreground">
        <Languages className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          English translation of this page is in progress — the Chinese original is shown below.
          <span className="mx-1.5 text-zinc-300" aria-hidden="true">
            ·
          </span>
          本页英文翻译进行中，暂呈现中文原文。
        </span>
      </p>
    </div>
  );
}
