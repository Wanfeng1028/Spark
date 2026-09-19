import * as React from "react";
import Link from "next/link";
import { BlurFade } from "@/components/magicui/blur-fade";

/**
 * FourTiles — 四端产品瓦片区（对标 x.ai 的产品 tile 行，DESIGN v2.29）。
 * 每张瓦片：截图 + 端名 + 一句事实描述，整卡可点进 /features。
 * "查看 →" 是 mono 链接不是按钮——箭头豁免仅限链接面（v2.29 登记），按钮仍禁箭头（§12.7）。
 * 描述全部可回源码核对（禁假状态，§5）：Desktop=Electron sidecar（ADR D14），
 * CLI=Ink 7（工单 10.56），Mobile=Expo+RN / 小程序 Taro（ADR D20–D24）。
 */

interface Tile {
  name: string;
  desc: string;
  img: string;
  alt: string;
}

const TILES: readonly Tile[] = [
  {
    name: "Web",
    desc: "React 会话工作台，事件流的投影",
    img: "/screenshots/web-session.svg",
    alt: "Web 端界面：会话列表与流式对话面板",
  },
  {
    name: "Desktop",
    desc: "Electron 壳，sidecar 复用同一引擎",
    img: "/screenshots/desktop-shell.svg",
    alt: "桌面端界面：工具调用详情与深色输出块",
  },
  {
    name: "CLI",
    desc: "Ink 7 终端 TUI，纯单栏转录流",
    img: "/screenshots/cli-tui.svg",
    alt: "CLI 界面：终端会话流与审批快捷键",
  },
  {
    name: "Mobile",
    desc: "Expo + RN，配对即连；小程序 Taro 同源",
    img: "/screenshots/mobile-chat.svg",
    alt: "移动端界面：会话流与移动审批卡",
  },
];

export function FourTiles(): React.JSX.Element {
  return (
    <section id="surfaces" className="scroll-mt-16 px-6 py-28" aria-labelledby="surfaces-heading">
      <div className="mx-auto max-w-7xl">
        <BlurFade delay={0}>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <header className="max-w-2xl">
              <p className="font-mono text-xs text-muted-foreground">产品形态</p>
              <h2
                id="surfaces-heading"
                className="mt-2 text-[30px] font-semibold tracking-tight text-foreground sm:text-[38px]"
              >
                四端，同一份事件流
              </h2>
              <p className="mt-3 text-lg text-muted-foreground">
                一份 applyEvent reducer 投影出四种界面——不是四个客户端各写一遍。
              </p>
            </header>
            <Link
              href="/features"
              className="shrink-0 font-mono text-sm text-muted-foreground transition-colors hover:text-spark-accent"
            >
              功能对比 →
            </Link>
          </div>
        </BlurFade>

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TILES.map((tile, index) => (
            <BlurFade key={tile.name} delay={0.05 + index * 0.05} yOffset={16}>
              <Link
                href="/features"
                className="group block overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-zinc-400"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={tile.img}
                  alt={tile.alt}
                  loading="lazy"
                  className="h-44 w-full border-b border-border object-cover object-top"
                />
                <div className="flex items-start justify-between gap-3 p-4">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{tile.name}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {tile.desc}
                    </p>
                  </div>
                  <span
                    aria-hidden="true"
                    className="shrink-0 font-mono text-xs text-muted-foreground transition-colors group-hover:text-spark-accent"
                  >
                    查看 →
                  </span>
                </div>
              </Link>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  );
}

FourTiles.displayName = "FourTiles";
