import type { Metadata } from "next";
import { ArchitectureDiagram } from "@/components/sections/ArchitectureDiagram";
import { BlurFade } from "@/components/magicui/blur-fade";
import { CodeBlock } from "@/components/ui/code-block";

export const metadata: Metadata = {
  title: "架构 — Spark",
  description: "五层分离，协议驱动，事件溯源。27 种事件词表统一四端。",
};

export const dynamic = "force-static";

interface Endpoint {
  name: string;
  stack: string;
  role: string;
}

const ENDPOINTS: readonly Endpoint[] = [
  {
    name: "Web",
    stack: "React 19 · Vite 7 · Tailwind CSS v4",
    role: "主力交互界面，全功能覆盖",
  },
  {
    name: "Desktop",
    stack: "Electron sidecar · 内嵌 server",
    role: "本地壳，系统集成与快捷键",
  },
  {
    name: "CLI",
    stack: "Ink 7 · Node.js 24",
    role: "终端原生体验，纯键盘操作",
  },
  {
    name: "Mobile",
    stack: "Expo + RN · Taro 4 小程序",
    role: "移动端会话查看与轻量交互",
  },
];

const SESSION_PATH_CODE = `# 会话数据落点
~/.spark/sessions/<cwd-hash>/<session-id>.jsonl

# 格式：append-only JSONL
# 每行一个事件对象，带 type + ts 字段
# 文件只追加不修改，完整保留决策链
# 回放 = 从头逐行 reduce → 重建完整 UI 状态`;

export default function ArchitecturePage() {
  return (
    <>
      <div className="px-6 pb-16 pt-32">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-[32px] font-semibold tracking-tight text-foreground">
            架构
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            五层分离，协议驱动，事件溯源。
          </p>
        </div>
      </div>

      {/* 复用架构图组件 */}
      <ArchitectureDiagram />

      {/* 事件模型 */}
      <div className="px-6 py-20">
        <BlurFade delay={0.05}>
          <div className="mx-auto max-w-4xl">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              事件模型
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              27 种事件构成完整词表，每种事件标记三个属性：
            </p>
            <dl className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-border px-4 py-3">
                <dt className="font-mono text-sm font-medium text-foreground">
                  durable
                </dt>
                <dd className="mt-1 text-sm text-muted-foreground">
                  落盘到 JSONL，可回放重建
                </dd>
              </div>
              <div className="rounded-lg border border-border px-4 py-3">
                <dt className="font-mono text-sm font-medium text-foreground">
                  live
                </dt>
                <dd className="mt-1 text-sm text-muted-foreground">
                  仅存在于 SSE 连接周期内
                </dd>
              </div>
              <div className="rounded-lg border border-border px-4 py-3">
                <dt className="font-mono text-sm font-medium text-foreground">
                  surface
                </dt>
                <dd className="mt-1 text-sm text-muted-foreground">
                  直接映射为可见 UI 变更
                </dd>
              </div>
            </dl>
            <p className="mt-6 text-sm leading-relaxed text-muted-foreground/80">
              事件经 Projector 投影为 UI 状态。四端共享同一套 reducer
              逻辑——协议层是运行时代码，不是类型定义。新增事件走
              new-event-type 全流程：类型定义 → zod schema → 归类 → reducer
              单测 → 引擎 emit → 文档同步。
            </p>
          </div>
        </BlurFade>
      </div>

      {/* 四端展示 */}
      <div className="border-t border-border px-6 py-20">
        <BlurFade delay={0.1}>
          <div className="mx-auto max-w-4xl">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              四端形态
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              共享 @spark/protocol，各自适配平台特性。
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {ENDPOINTS.map((ep) => (
                <div
                  key={ep.name}
                  className="rounded-lg border border-border px-5 py-4"
                >
                  <h3 className="font-medium text-foreground">{ep.name}</h3>
                  <p className="mt-1 font-mono text-xs text-muted-foreground/70">
                    {ep.stack}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {ep.role}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </BlurFade>
      </div>

      {/* 数据落点 */}
      <div className="border-t border-border px-6 py-20">
        <BlurFade delay={0.15}>
          <div className="mx-auto max-w-4xl">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              数据落点
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              会话数据以 append-only JSONL 存储在本地文件系统，不依赖外部数据库。
            </p>
            <div className="mt-6">
              <CodeBlock code={SESSION_PATH_CODE} language="bash" />
            </div>
          </div>
        </BlurFade>
      </div>

      <div className="pb-32" />
    </>
  );
}
