/**
 * 官网 WebGL 背景的统一绘制循环（性能闸）。
 *
 * hero 的三套背景都是满幅片元着色器，每帧成本正比于绘图缓冲像素数：ogl Renderer 缺省按
 * devicePixelRatio 建缓冲，高分屏上一个 82vh 的 hero 就是近千万像素 × 每像素上百次三角函数，
 * GPU 被打满后整台机器连滚轮都会卡。本循环把三件事收在一处——帧率上限、离屏与后台标签页暂停、
 * 持续掉帧时自行停摆（由调用方降级为无背景），组件里不再各写一份 RAF。
 */

/** 相邻两帧间隔超过此毫秒数判为掉帧 */
const SLOW_FRAME_MS = 120;
/** 连续掉帧达到此帧数即停摆（约 1.2 秒的持续卡顿，非首帧毛刺） */
const SLOW_FRAME_LIMIT = 10;
/** 停摆判定前跳过的帧数：着色器编译与缓冲首分配天然慢，不计入掉帧 */
const WARMUP_FRAMES = 4;

export interface AmbientLoopOptions {
  /** 背景容器：离开视口即暂停绘制 */
  container: HTMLElement;
  /** 单帧绘制（uniform 刷新 + renderer.render） */
  draw: (timeMs: number) => void;
  /** 帧率上限，缺省 30——缓慢漂移的环境动效看不出差别 */
  fps?: number;
  /** 持续掉帧时调用一次；循环已自行停止，调用方应撤掉画布 */
  onDegrade?: () => void;
}

/** 启动循环，返回停止函数（组件卸载时在 effect cleanup 里调用）。 */
export function startAmbientLoop({
  container,
  draw,
  fps = 30,
  onDegrade,
}: AmbientLoopOptions): () => void {
  const minInterval = 1000 / fps;
  let rafId = 0;
  let running = true;
  let onScreen = true;
  let lastDrawAt = 0;
  let slowStreak = 0;
  let warmup = WARMUP_FRAMES;

  const observer = new IntersectionObserver((entries) => {
    onScreen = entries.some((entry) => entry.isIntersecting);
  });
  observer.observe(container);

  const step = (now: number) => {
    rafId = requestAnimationFrame(step);
    if (!running) return;
    if (!onScreen || document.hidden) {
      // 重置基准：回到视口的首帧不与暂停前的旧时间戳比间隔
      lastDrawAt = 0;
      return;
    }
    if (lastDrawAt !== 0 && now - lastDrawAt < minInterval) return;

    const interval = lastDrawAt === 0 ? 0 : now - lastDrawAt;
    lastDrawAt = now;
    draw(now);

    if (warmup > 0) {
      warmup -= 1;
      return;
    }
    if (interval <= SLOW_FRAME_MS) {
      slowStreak = 0;
      return;
    }
    slowStreak += 1;
    if (slowStreak < SLOW_FRAME_LIMIT) return;
    running = false;
    cancelAnimationFrame(rafId);
    onDegrade?.();
  };

  rafId = requestAnimationFrame(step);

  return () => {
    running = false;
    cancelAnimationFrame(rafId);
    observer.disconnect();
  };
}
