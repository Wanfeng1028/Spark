/**
 * 程序化流体渲染器（19.43 批 1；DESIGN §12.9 豁免层）。
 * 算法与实现常量逐条对账 doc/spike-beyond-glass-themes.md §4（B 级：上游展示页渲染器
 * 移植——同一着色器的正确驱动方式）。Spark 侧口径（迷你 ADR D58）：
 * ① 调色板切换保留 0.06/帧插值——上游 app 直接换（壁纸在玻璃面板底下被模糊吃掉），
 *   本仓是全保真背景，硬切会闪；这是有意偏离产品口径（上游展示页同款插值）。
 * ② prefers-reduced-motion = 不起 RAF、单帧渲染、调色板**瞬时切换**（拍板①"切换为
 *   瞬时"，替代上游展示页的 40 帧收敛）；visibilitychange 隐藏**暂停 RAF**、恢复续跑
 *   （工单护栏；上游为跳帧不取消）。
 * snapshot 模式（设置页缩略图）：无监听无 RAF，setPalette 直接换色渲一帧。
 * 纯判据（hexToRgb/paletteOf/uniformValuesOf/stepPalette/frameGate）导出供单测；
 * GL 装配面不测（同 apps/desktop 判据模块分工先例）。
 */
import { FLOW_FRAGMENT, FLUID_PARAMS, POST_FRAGMENT, VERTEX } from './fluid-shader'
import type { FluidWallpaper } from './wallpapers'

export type Rgb = [number, number, number]

/** 只接受 #rrggbb（上游同口径，不支持缩写）；不合法返回 null（禁假状态，不猜） */
export function hexToRgb(hex: string): Rgb | null {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null
  return [
    Number.parseInt(hex.slice(1, 3), 16) / 255,
    Number.parseInt(hex.slice(3, 5), 16) / 255,
    Number.parseInt(hex.slice(5, 7), 16) / 255,
  ]
}

/** 主题 → 可插值调色板；任一色不合法或形状不符（上游口径固定 5+3）返回 null（调用方保持原调色板不动） */
export function paletteOf(wp: FluidWallpaper): { colors: Rgb[]; glow: Rgb[] } | null {
  if (wp.colors.length !== 5 || wp.glowColors.length !== 3) return null
  const colors = wp.colors.map((h) => hexToRgb(h))
  const glow = wp.glowColors.map((h) => hexToRgb(h))
  if (colors.some((c) => c === null) || glow.some((c) => c === null)) return null
  return { colors: colors as Rgb[], glow: glow as Rgb[] }
}

/**
 * PARAMS → POST 段静态 uniform 映射表（防漏传的单测锚点）。
 * 消费 25 项中的 19 项标量/数组（colors/glowColors/offset 拆 vec2/u_c1..5/u_glowColor1..3）；
 * u_time/u_resolution/u_flowmap/u_lightPos 是运行时值不在此表。
 * 色表形状 5+3 由注册表单测锚定（appearance-wallpaper.test.ts），索引取值不越界。
 * coarse pointer 时 u_brushStrength 强制 0（上游：触屏没有指针轨迹，显式归零不留残值）。
 */
export function uniformValuesOf(
  wp: FluidWallpaper,
  coarse: boolean,
): Record<string, number | Rgb | [number, number]> {
  const p = FLUID_PARAMS
  const colors = wp.colors.map((h) => hexToRgb(h)) as Rgb[]
  const glow = wp.glowColors.map((h) => hexToRgb(h)) as Rgb[]
  return {
    u_brushRadius: p.mouseRadius,
    u_brushStrength: coarse ? 0 : p.mouseStrength,
    u_decay: p.decay,
    u_distortBoost: p.distortBoost,
    u_swirlBoost: p.swirlBoost,
    u_glowIntensity: p.glowIntensity,
    u_glowColor1: glow[0]!,
    u_glowColor2: glow[1]!,
    u_glowColor3: glow[2]!,
    u_scale: p.scale,
    u_offset: [p.offsetX / 100, p.offsetY / 100],
    u_grain: p.grain,
    u_c1: colors[0]!,
    u_c2: colors[1]!,
    u_c3: colors[2]!,
    u_c4: colors[3]!,
    u_c5: colors[4]!,
    u_lightCore: p.lightCore,
    u_lightHalo: p.lightHalo,
    u_vignette: p.vignette,
    u_bloomThreshold: p.bloomThreshold,
    u_bloomRange: p.bloomRange,
    u_bloomStrength: p.bloomStrength,
  }
}

/** 调色板插值步进（0.06/帧 ≈ 30fps 下约 1.7s 收敛到 95%）——返回新数组，不改入参 */
export function stepPalette(cur: readonly Rgb[], target: readonly Rgb[], k: number): Rgb[] {
  return cur.map((c, i) => {
    const t = target[i]
    if (t === undefined) return c // 目标缺色保持当前色（同形调色板下不可达）
    return [c[0] + (t[0] - c[0]) * k, c[1] + (t[1] - c[1]) * k, c[2] + (t[2] - c[2]) * k] as Rgb
  })
}

/** 30fps 帧闸 + 漂移补偿（把余数扣掉，否则长期偏慢）；不到间隔返回 null（跳帧） */
export function frameGate(now: number, last: number, minInterval: number): number | null {
  if (now - last < minInterval) return null
  return now - ((now - last) % minInterval)
}

const MIN_FRAME_INTERVAL = 1000 / 30

/** 流场种子：r=0 无影响、gb=128 即 0.5 中性方向——与 FLOW 段编码一致 */
function flowSeed(width: number, height: number): Uint8Array {
  const data = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 0
    data[i * 4 + 1] = 128
    data[i * 4 + 2] = 128
    data[i * 4 + 3] = 255
  }
  return data
}

export interface FluidHandle {
  setPalette(wp: FluidWallpaper): void
  stop(): void
}

/**
 * 建 WebGL2 渲染器；context/编译/链接任一失败返回 null（调用方回落——批 1 无静帧兜底
 * 时不渲染任何壁纸，批 2 接打包静帧）。canvas 由调用方持有，渲染器只负责 GL 资源与监听。
 */
export function createFluid(
  canvas: HTMLCanvasElement,
  opts?: { snapshot?: boolean },
): FluidHandle | null {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    powerPreference: 'low-power',
  })
  if (gl === null) return null

  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX)
  const flowFs = compile(gl, gl.FRAGMENT_SHADER, FLOW_FRAGMENT)
  const postFs = compile(gl, gl.FRAGMENT_SHADER, POST_FRAGMENT)
  if (vs === null || flowFs === null || postFs === null) return null
  const flowProgram = link(gl, vs, flowFs)
  const postProgram = link(gl, vs, postFs)
  gl.deleteShader(vs)
  gl.deleteShader(flowFs)
  gl.deleteShader(postFs)
  if (flowProgram === null || postProgram === null) return null

  const quad = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, quad)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)

  // ping-pong 流场（四分之一分辨率；两 pass 共用同一 quad buffer）；
  // 纹理存储在 rebuildFlowTargets 里按 size 重指定（复用同一 tex/fbo 对象，不重建不泄漏）
  let flowWidth = 0
  let flowHeight = 0
  type FlowTarget = { fbo: WebGLFramebuffer; tex: WebGLTexture }
  const makeTarget = (): FlowTarget => {
    // TS 5.9 lib.dom：createTexture/createFramebuffer 已是非空返回，无需断言
    const tex = gl.createTexture()
    const fbo = gl.createFramebuffer()
    return { fbo, tex }
  }
  const pong: [FlowTarget, FlowTarget] = [makeTarget(), makeTarget()]
  let write: 0 | 1 = 0
  const flip = (w: 0 | 1): 0 | 1 => (w === 0 ? 1 : 0)

  const rebuildFlowTargets = (width: number, height: number): void => {
    flowWidth = Math.max(1, Math.round(width / 4))
    flowHeight = Math.max(1, Math.round(height / 4))
    for (const t of pong) {
      gl.bindTexture(gl.TEXTURE_2D, t.tex)
      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA, flowWidth, flowHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE,
        flowSeed(flowWidth, flowHeight),
      )
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0)
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  const loc = (program: WebGLProgram, name: string): WebGLUniformLocation | null =>
    gl.getUniformLocation(program, name)

  const flowU = {
    prev: loc(flowProgram, 'u_prev'),
    mouse: loc(flowProgram, 'u_mouse'),
    velocity: loc(flowProgram, 'u_velocity'),
    brushRadius: loc(flowProgram, 'u_brushRadius'),
    brushStrength: loc(flowProgram, 'u_brushStrength'),
    decay: loc(flowProgram, 'u_decay'),
  }
  const postU = {
    time: loc(postProgram, 'u_time'),
    resolution: loc(postProgram, 'u_resolution'),
    scale: loc(postProgram, 'u_scale'),
    offset: loc(postProgram, 'u_offset'),
    grain: loc(postProgram, 'u_grain'),
    flowmap: loc(postProgram, 'u_flowmap'),
    distortBoost: loc(postProgram, 'u_distortBoost'),
    swirlBoost: loc(postProgram, 'u_swirlBoost'),
    glowIntensity: loc(postProgram, 'u_glowIntensity'),
    glowColor1: loc(postProgram, 'u_glowColor1'),
    glowColor2: loc(postProgram, 'u_glowColor2'),
    glowColor3: loc(postProgram, 'u_glowColor3'),
    c1: loc(postProgram, 'u_c1'),
    c2: loc(postProgram, 'u_c2'),
    c3: loc(postProgram, 'u_c3'),
    c4: loc(postProgram, 'u_c4'),
    c5: loc(postProgram, 'u_c5'),
    lightPos: loc(postProgram, 'u_lightPos'),
    lightCore: loc(postProgram, 'u_lightCore'),
    lightHalo: loc(postProgram, 'u_lightHalo'),
    vignette: loc(postProgram, 'u_vignette'),
    bloomThreshold: loc(postProgram, 'u_bloomThreshold'),
    bloomRange: loc(postProgram, 'u_bloomRange'),
    bloomStrength: loc(postProgram, 'u_bloomStrength'),
  }

  const p = FLUID_PARAMS
  const coarse = window.matchMedia('(hover: none), (pointer: coarse)').matches
  const reduced =
    opts?.snapshot === true || window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // 指针态：初值全 0.5（画面中心），速度初值 0；y 翻转（GL 坐标）
  const mouse = { x: 0.5, y: 0.5, sx: 0.5, sy: 0.5, svx: 0, svy: 0 }
  let palette: { colors: Rgb[]; glow: Rgb[] } | null = null
  let target: { colors: Rgb[]; glow: Rgb[] } | null = null
  const start = performance.now()
  let last = 0
  let raf = 0
  let stopped = false

  const onMove = (e: MouseEvent): void => {
    const r = canvas.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return
    mouse.x = (e.clientX - r.left) / r.width
    mouse.y = 1 - (e.clientY - r.top) / r.height
  }

  function smoothPointer(): void {
    mouse.sx += (mouse.x - mouse.sx) * p.mouseSmoothing
    mouse.sy += (mouse.y - mouse.sy) * p.mouseSmoothing
    mouse.svx += ((mouse.x - mouse.sx) * 0.5 - mouse.svx) * p.mouseVelocity
    mouse.svy += ((mouse.y - mouse.sy) * 0.5 - mouse.svy) * p.mouseVelocity
  }

  const render = (now: number): void => {
    if (palette === null || target === null) return
    if (!reduced) {
      palette = { colors: stepPalette(palette.colors, target.colors, 0.06), glow: stepPalette(palette.glow, target.glow, 0.06) }
    }
    smoothPointer()
    const elapsed = (now - start) * 0.001 * (p.speed / 100)
    const strength = coarse ? 0 : p.mouseStrength

    // pass 1：指针流场累积（四分之一分辨率）
    gl.bindFramebuffer(gl.FRAMEBUFFER, pong[write].fbo)
    gl.viewport(0, 0, flowWidth, flowHeight)
    gl.useProgram(flowProgram)
    gl.bindBuffer(gl.ARRAY_BUFFER, quad)
    const flowAttrib = gl.getAttribLocation(flowProgram, 'a_position')
    gl.enableVertexAttribArray(flowAttrib)
    gl.vertexAttribPointer(flowAttrib, 2, gl.FLOAT, false, 0, 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, pong[flip(write)].tex)
    if (flowU.prev !== null) gl.uniform1i(flowU.prev, 0)
    if (flowU.mouse !== null) gl.uniform2f(flowU.mouse, mouse.sx, mouse.sy)
    if (flowU.velocity !== null) gl.uniform2f(flowU.velocity, mouse.svx, mouse.svy)
    if (flowU.brushRadius !== null) gl.uniform1f(flowU.brushRadius, p.mouseRadius)
    if (flowU.brushStrength !== null) gl.uniform1f(flowU.brushStrength, strength)
    if (flowU.decay !== null) gl.uniform1f(flowU.decay, p.decay)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    // pass 2：成像主段（全分辨率）
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.useProgram(postProgram)
    const postAttrib = gl.getAttribLocation(postProgram, 'a_position')
    gl.enableVertexAttribArray(postAttrib)
    gl.vertexAttribPointer(postAttrib, 2, gl.FLOAT, false, 0, 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, pong[write].tex)
    if (postU.flowmap !== null) gl.uniform1i(postU.flowmap, 0)
    if (postU.time !== null) gl.uniform1f(postU.time, elapsed)
    if (postU.resolution !== null) gl.uniform2f(postU.resolution, canvas.width, canvas.height)
    if (postU.scale !== null) gl.uniform1f(postU.scale, p.scale)
    if (postU.offset !== null) gl.uniform2f(postU.offset, p.offsetX / 100, p.offsetY / 100)
    if (postU.grain !== null) gl.uniform1f(postU.grain, p.grain)
    if (postU.distortBoost !== null) gl.uniform1f(postU.distortBoost, p.distortBoost)
    if (postU.swirlBoost !== null) gl.uniform1f(postU.swirlBoost, p.swirlBoost)
    if (postU.glowIntensity !== null) gl.uniform1f(postU.glowIntensity, p.glowIntensity)
    // 调色板形状 5+3 已由 paletteOf 校验（坏形不入），索引取值不越界
    if (postU.glowColor1 !== null) gl.uniform3fv(postU.glowColor1, palette.glow[0]!)
    if (postU.glowColor2 !== null) gl.uniform3fv(postU.glowColor2, palette.glow[1]!)
    if (postU.glowColor3 !== null) gl.uniform3fv(postU.glowColor3, palette.glow[2]!)
    if (postU.c1 !== null) gl.uniform3fv(postU.c1, palette.colors[0]!)
    if (postU.c2 !== null) gl.uniform3fv(postU.c2, palette.colors[1]!)
    if (postU.c3 !== null) gl.uniform3fv(postU.c3, palette.colors[2]!)
    if (postU.c4 !== null) gl.uniform3fv(postU.c4, palette.colors[3]!)
    if (postU.c5 !== null) gl.uniform3fv(postU.c5, palette.colors[4]!)
    // 光源 x 跟随指针（lightFollow 比例）、y 恒定——上游同款
    const lightX = p.lightX + (mouse.sx - p.lightX) * p.lightFollow
    if (postU.lightPos !== null) gl.uniform2f(postU.lightPos, lightX, p.lightY)
    if (postU.lightCore !== null) gl.uniform1f(postU.lightCore, p.lightCore)
    if (postU.lightHalo !== null) gl.uniform1f(postU.lightHalo, p.lightHalo)
    if (postU.vignette !== null) gl.uniform1f(postU.vignette, p.vignette)
    if (postU.bloomThreshold !== null) gl.uniform1f(postU.bloomThreshold, p.bloomThreshold)
    if (postU.bloomRange !== null) gl.uniform1f(postU.bloomRange, p.bloomRange)
    if (postU.bloomStrength !== null) gl.uniform1f(postU.bloomStrength, p.bloomStrength)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    write = flip(write)
  }

  const loop = (now: number): void => {
    if (stopped) return
    raf = requestAnimationFrame(loop)
    const gate = frameGate(now, last, MIN_FRAME_INTERVAL)
    if (gate === null) return
    last = gate
    render(now)
  }

  // 工单护栏：不可见暂停 RAF（与上游"跳帧不取消"的刻意差异），恢复续跑
  const onVisibility = (): void => {
    if (stopped || reduced) return
    if (document.hidden) {
      cancelAnimationFrame(raf)
      raf = 0
    } else if (raf === 0) {
      raf = requestAnimationFrame(loop)
    }
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
  const resize = (): void => {
    const cw = canvas.clientWidth
    const ch = canvas.clientHeight
    if (cw === 0 || ch === 0) return
    const w = Math.round(cw * dpr)
    const h = Math.round(ch * dpr)
    if (canvas.width === w && canvas.height === h) return
    canvas.width = w
    canvas.height = h
    rebuildFlowTargets(w, h)
  }
  const ro = new ResizeObserver(resize)
  ro.observe(canvas)
  resize()

  if (!coarse) window.addEventListener('mousemove', onMove, { passive: true })
  document.addEventListener('visibilitychange', onVisibility)

  if (!reduced) raf = requestAnimationFrame(loop)

  return {
    setPalette(wp: FluidWallpaper): void {
      const next = paletteOf(wp)
      if (next === null) return // 色表损坏：保持当前调色板，禁假状态
      target = next
      if (palette === null) palette = { colors: next.colors.map((c) => [...c] as Rgb), glow: next.glow.map((c) => [...c] as Rgb) }
      if (reduced) {
        // reduced-motion：瞬时切换 + 单帧（拍板①）；snapshot 缩略图同路径
        palette = { colors: next.colors.map((c) => [...c] as Rgb), glow: next.glow.map((c) => [...c] as Rgb) }
        render(performance.now())
      }
    },
    stop(): void {
      stopped = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      if (!coarse) window.removeEventListener('mousemove', onMove)
      document.removeEventListener('visibilitychange', onVisibility)
      gl.deleteBuffer(quad)
      for (const t of pong) {
        gl.deleteTexture(t.tex)
        gl.deleteFramebuffer(t.fbo)
      }
      gl.deleteProgram(flowProgram)
      gl.deleteProgram(postProgram)
    },
  }
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (shader === null) return null
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
    console.error('fluid shader compile failed:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function link(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram | null {
  const program = gl.createProgram()
  if (program === null) return null
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
    console.error('fluid shader link failed:', gl.getProgramInfoLog(program))
    gl.deleteProgram(program)
    return null
  }
  return program
}
