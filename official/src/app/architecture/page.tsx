import type { Metadata } from "next";
import { ArchitectureDiagram } from "@/components/sections/ArchitectureDiagram";
import { BlurFade } from "@/components/magicui/blur-fade";
import { CodeBlock } from "@/components/ui/code-block";
import type { Lang } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "架构",
  description: "四端 UI、协议、服务端、引擎、会话文件五层；27 种事件词表统一四端。",
};

export const dynamic = "force-static";

interface Endpoint {
  name: string;
  stack: string;
  role: string;
}

const ENDPOINTS: Record<Lang, readonly Endpoint[]> = {
  zh: [
    { name: "Web", stack: "React 19 · Vite 7 · Tailwind CSS v4", role: "主力交互界面，全功能覆盖" },
    { name: "Desktop", stack: "Electron sidecar · 内嵌 server", role: "本地壳，系统集成与快捷键" },
    { name: "CLI", stack: "Ink 7 · Node.js 24", role: "终端原生体验，纯键盘操作" },
    { name: "Mobile", stack: "Expo + RN · Taro 4 小程序", role: "移动端会话查看与轻量交互" },
  ],
  en: [
    { name: "Web", stack: "React 19 · Vite 7 · Tailwind CSS v4", role: "The primary interactive surface, full feature coverage" },
    { name: "Desktop", stack: "Electron sidecar · embedded server", role: "Local shell, system integration and shortcuts" },
    { name: "CLI", stack: "Ink 7 · Node.js 24", role: "Terminal-native experience, keyboard only" },
    { name: "Mobile", stack: "Expo + RN · Taro 4 mini app", role: "Session viewing and light interaction on mobile" },
  ],
};

const SESSION_PATH_CODE: Record<Lang, string> = {
  zh: `# 会话数据落点（packages/engine/src/session/store.ts）
~/.spark/sessions/<cwd-munged>-<sha1前8位>/<ISO时间戳>_<sessionId>.jsonl

# 格式：append-only JSONL
# 第 0 行是 header（sparkVersion / cwd / createdAt / model）
# 其后每行一个事件信封，seq == 文件行号
# 只追加不改写，完整保留决策链
# 回放 = 从头逐行 reduce → 重建完整 UI 状态`,
  en: `# Session data location (packages/engine/src/session/store.ts)
~/.spark/sessions/<cwd-munged>-<sha1-8>/<ISO-timestamp>_<sessionId>.jsonl

# Format: append-only JSONL
# Line 0 is the header (sparkVersion / cwd / createdAt / model)
# Each following line is one event envelope, seq == file line number
# Append-only, never rewritten — the full decision chain is preserved
# Replay = reduce line by line from the top → rebuild the full UI state`,
};

const ARCH_COPY = {
  zh: {
    heading: "架构",
    sub: "四端 UI、协议、服务端、引擎、会话文件，自上而下五层。",
    eventModel: "事件模型",
    eventModelSub: "27 种事件构成完整词表（durable 24 / live-only 3），每种事件带三个属性：",
    ddDurable: "24 种。落盘到 JSONL，可回放重建",
    ddLive: "3 种 delta 类。不落盘，重连后不重现",
    ddSurface: "2 种。模型可见面，必进模型历史",
    projectionNote:
      "两个「投影」不同义：各端用同一份 applyEvent reducer 把事件流折叠成 UI 状态；引擎侧 Projector 投影的是模型上下文（surface 事件 → LlmMessage）。协议层是运行时代码，不是类型定义。新增事件走 new-event-type 全流程：类型定义 → zod schema → 归类 → reducer 单测 → 引擎 emit → 文档同步。",
    surfaces: "四端形态",
    surfacesSub: "共享 @spark/protocol，各自适配平台特性。",
    data: "数据落点",
    dataSub: "会话数据以 append-only JSONL 存储在本地文件系统，不依赖外部数据库。",
  },
  en: {
    heading: "Architecture",
    sub: "Surface UIs, protocol, server, engine, session files — five layers top to bottom.",
    eventModel: "Event model",
    eventModelSub: "27 events form the full vocabulary (24 durable / 3 live-only), each carrying three attributes:",
    ddDurable: "24 types. Persisted to JSONL, replayable to rebuild the UI",
    ddLive: "3 delta types. Never persisted, gone after a reconnect",
    ddSurface: "2 types. The model-visible surface — always in model history",
    projectionNote:
      "The two \"projections\" differ: each surface folds the event stream into UI state with the same applyEvent reducer, while the engine-side Projector projects model context (surface events → LlmMessage). The protocol layer is runtime code, not type definitions. New events follow the new-event-type flow: type definition → zod schema → classification → reducer unit test → engine emit → doc sync.",
    surfaces: "Four surfaces",
    surfacesSub: "Shared @spark/protocol, platform specifics adapted per surface.",
    data: "Data location",
    dataSub: "Session data persists as append-only JSONL on the local filesystem — no external database.",
  },
} as const;

/** 页面内容本体：en 壳（app/en/architecture/page.tsx）复用本组件（19.47 批 2） */
export function ArchitecturePageContent({ lang = "zh" }: { lang?: Lang }) {
  const copy = ARCH_COPY[lang];
  return (
    <div className={lang === "en" ? "lang-en" : undefined}>
      <div className="px-6 pb-16 pt-32">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-[36px] font-medium tracking-[-0.015em] text-foreground en:font-normal en:tracking-[-0.025em] sm:text-[44px]">
            {copy.heading}
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">{copy.sub}</p>
        </div>
      </div>

      {/* 复用架构图组件 */}
      <ArchitectureDiagram lang={lang} />

      {/* 事件模型 */}
      <div className="px-6 py-20">
        <BlurFade delay={0.05}>
          <div className="mx-auto max-w-4xl">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              {copy.eventModel}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              {copy.eventModelSub}
            </p>
            {/* 三分类是术语对照表，不是三张特性卡：线性 divide-y 行呈现，
                避开 §12.5 P1「恰好三张卡一行」与 §12.4 P1「每张卡同一条灰色 1px 平边」。
                边框只做分隔（§3）。 */}
            <dl className="mt-6 divide-y divide-border border-y border-border">
              <div className="grid grid-cols-[6.5rem_1fr] items-baseline gap-x-4 py-3">
                <dt className="font-mono text-sm text-foreground">durable</dt>
                <dd className="text-sm text-muted-foreground">{copy.ddDurable}</dd>
              </div>
              <div className="grid grid-cols-[6.5rem_1fr] items-baseline gap-x-4 py-3">
                <dt className="font-mono text-sm text-foreground">live</dt>
                <dd className="text-sm text-muted-foreground">{copy.ddLive}</dd>
              </div>
              <div className="grid grid-cols-[6.5rem_1fr] items-baseline gap-x-4 py-3">
                <dt className="font-mono text-sm text-foreground">surface</dt>
                <dd className="text-sm text-muted-foreground">{copy.ddSurface}</dd>
              </div>
            </dl>
            <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
              {copy.projectionNote}
            </p>
          </div>
        </BlurFade>
      </div>

      {/* 四端展示 */}
      <div className="border-t border-border px-6 py-20">
        <BlurFade delay={0.1}>
          <div className="mx-auto max-w-4xl">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              {copy.surfaces}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              {copy.surfacesSub}
            </p>
            {/* 四端对照表：同样走线性 divide-y 行，不用 2×2 卡片阵列（§12.4 卡片灾难） */}
            <ul className="mt-8 divide-y divide-border border-y border-border">
              {ENDPOINTS[lang].map((ep) => (
                <li
                  key={ep.name}
                  className="grid grid-cols-1 gap-1 py-4 sm:grid-cols-[7rem_1fr] sm:gap-x-6"
                >
                  <span className="font-medium text-foreground">{ep.name}</span>
                  <div>
                    <p className="text-sm text-muted-foreground">{ep.role}</p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {ep.stack}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </BlurFade>
      </div>

      {/* 数据落点 */}
      <div className="border-t border-border px-6 py-20">
        <BlurFade delay={0.15}>
          <div className="mx-auto max-w-4xl">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              {copy.data}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              {copy.dataSub}
            </p>
            <div className="mt-6">
              <CodeBlock code={SESSION_PATH_CODE[lang]} language="bash" />
            </div>
          </div>
        </BlurFade>
      </div>

      <div className="pb-32" />
    </div>
  );
}

export default ArchitecturePageContent;
