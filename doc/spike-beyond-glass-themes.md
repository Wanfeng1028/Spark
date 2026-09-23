# Spike 报告：dsh-beyond-glass 九套主题 1:1 复现规格（阶段十九工单 19.43 / DESIGN §12.9）

> 版本记录

| 版本 | 日期 | 作者 | 变更内容 |
| ---- | ---------- | -------- | ------------------------------------------------ |
| v1.0 | 2026-09-23 | AI 编写：Qoder；发起：晚风（Wanfeng1028，"你仔细点吧人家的设计细节都写过来……我要 1:1 复现"指令） | 初稿：对 LeoEthanZ/dsh-beyond-glass 展示页与着色器提取件做逐行取证，按**可信度三级**（产品真值 / 展示页 port / 营销面专属）分层记录九套主题定义、GLSL 三段算法、33 项 PARAMS 及其消费情况、渲染器全部常量、stage 三层处理、切换机制与键盘/深链行为；给出**不得照抄清单**与 §12.9 四条边界逐条对账、第一批文件级落地清单、四项待拍板 |
| v1.1 | 2026-09-24 | AI 编写：Qoder；发起与拍板：晚风（Wanfeng1028，逐项确认 + "下载之前问我用的什么"指令） | **§9 四项待拍板→已拍板**：① 五套视频改静帧 + crossfade（不引入 mp4、不做常驻 Ken Burns；素材 = 打包 gallery 九张 jpg 约 2.6MB，与 ④ 共用）② accent 全局改写 + 对比度闸 ③ 局部底板逐项实测 ④ WebGL2 兜底 = 同批静帧；新增**下载前置**（先问「现在用的是宽带还是流量热点？」，已入 AGENTS §2.3a）；并留闸：实现期若 gallery 分辨率不足铺满目标屏，回晚风重拍 ①/，不得自行改判。同批 DESIGN v2.37、doc/08 v1.78、doc/02 v4.104、AGENTS v1.60。本批纯文档零代码，本机零验证 |
| v1.2 | 2026-09-24 | AI 编写：Qoder；发起与拍板：晚风（Wanfeng1028，"A（上图，拍板③的字面口径）：主区域大面积露主题，侧栏不透色"指令） | §9 拍板表补 **⑤ 可见范围 = A 档**：会话主区域底色整面换主题、大面积可见，assistant 文字块垫局部底板；侧栏 / 标题栏 / 输入框 / 用户气泡不透明且不透色（与原版"透进侧栏"的唯一差别）；明确不做 B 档含蓄档。同批 DESIGN v2.38（§12.9 边界④ 补可见范围）、doc/08 v1.79。本批纯文档零代码，本机零验证 |

## 0. 取证口径

**来源**：`LeoEthanZ/dsh-beyond-glass` @ `main` `9e9bf02`（2026-09-23）。该仓**只有一个分支 `main`**、根目录有 `.nojekyll`、`homepage` 字段为 `https://leoethanz.github.io/dsh-beyond-glass/`——GitHub Pages 直接服务 `main`，故仓库里的 `index.html` 与该 URL 线上所服务的是**同一个文件**，读源码等价于读线上页面。

**方式**：`gh api ... -H "Accept: application/vnd.github.raw"` 在线读取（AGENTS §2.12），**未克隆、未下载任何 tarball、未用浏览器拉取**（§2.3a）。本地缓存两件（`_scratch/` 已 gitignore）：

| 缓存文件 | 大小 | 行数 | 对应上游 |
| --- | --- | --- | --- |
| `_scratch/bgs-index.html` | 72243 B | 1597 | `index.html` |
| `_scratch/bgs-fluid.js` | 7165 B | 244 | `assets/fluid-shader.js` |

`index.html` 结构：CSS 10–651、markup 653–834、JS 836–1595（`<script src="assets/fluid-shader.js">` 在 835 行先加载）。

**上游源码可得性**（已核实，见 doc/08 §5D.10）：公开仓 35 个文件**无任何包源码**；产品的 `WorkbenchFluid.tsx` 与 `wallpapers.ts` 在私有仓，只以「着色器逐字提取件 + 展示页里的调色板镜像」两种形式外泄到公开面。

### 0.1 可信度三级（**这是本报告最重要的一条**）

1:1 的对象是**主题本身**，不是**展示页**。三级必须分开，否则会把营销页的装置当成产品规格抄进来。

| 级 | 含义 | 条目 | 判据 |
| --- | --- | --- | --- |
| **A 产品真值** | 直接来自产品源文件，可原样落库 | 九套主题定义（id / 中英文名 / `colors[5]` / `glowColors[3]` / `accent` / 视频直链）、GLSL 三段、33 项 PARAMS | `index.html:842–845` 注释明示"Names are the product's own strings (the `wallpaper` locale namespace)……Palettes are the values from `wallpapers.ts`; the fluid entries therefore render exactly what the picker's first group renders, **rather than a lookalike**"；`fluid-shader.js:1–9` 文件头明示"extracted **verbatim** from the harness package / Source: `WorkbenchFluid.tsx` / Source sha256: `sha256:1b070ec37c73b3a5` / Extracted: 2026-09-22 by `.agents/skills/dsh-beyond-glass-release/extract-fluid-shader.py`" |
| **B 展示页 port** | 作者自述是 app 渲染器的移植，含**两处刻意差异** | WebGL 渲染器全部实现常量、30fps 节流、四分之一分辨率流场、dpr 封顶、指针平滑、coarse pointer 归零、reduced-motion 单帧 | `index.html:1016–1024` 注释："A **port** of the app's renderer……Differences from the app, **both deliberate**: the palette is **interpolated** on selection, so switching wallpapers fades the field instead of cutting it; it paints **one frame and stops** under `prefers-reduced-motion`" |
| **C 营销面专属** | 展示页自己的叙事装置，**不得照抄** | hero 112px 标题、stage 的 34px 重模糊、`--accent` 随主题改写全局、`.frame` 假窗口壳与假标题栏、hero 录屏 + cues + IntersectionObserver + requestIdleCallback 全套 | 见 §5 逐条理由 |

**B 级的用法**：算法与常量可以照用（它是同一个着色器的正确驱动方式），但**两处刻意差异要按产品口径回退**——调色板切换在 app 里是**直接换**（`index.html:1154` 注释："the app swaps it outright"），插值是展示页为了淡入淡出加的；reduced-motion 单帧也是展示页的选择，Spark 可自行决定（建议保留，见 §3.7）。

---

## 1. A 级：九套主题定义（可直接落库）

来源 `index.html:847–915`，`const WALLPAPERS`，**数组顺序即选择器顺序**（`paintCaption` 用 `index + 1 / 9` 显示位置）。

### 1.1 四套程序化流体（`kind: "fluid"`）

| # | id | 中文名 | 英文名 | `colors[5]`（c1→c5） | `glowColors[3]` | `accent` |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `fluid-deep-ocean` | 深海流光 | Deep Ocean | `#000000` `#1A3870` `#204a7e` `#eed8aa` `#000000` | `#fff7d1` `#538dca` `#2d448b` | `#538dca` |
| 2 | `fluid-aurora` | 极光翡翠 | Emerald Aurora | `#020807` `#063c42` `#0f7168` `#b8ffd9` `#010806` | `#d9fff0` `#4be0c1` `#0b6470` | `#4be0c1` |
| 3 | `fluid-amethyst` | 紫晶云海 | Amethyst Cloud | `#05020b` `#25115a` `#57318c` `#f0b8ff` `#08020e` | `#ffe3ff` `#b46fff` `#552b8d` | `#b46fff` |
| 4 | `fluid-ember` | 熔金暮色 | Ember Dusk | `#080201` `#4e130b` `#92361e` `#ffd08a` `#0b0201` | `#fff1c4` `#ff8a45` `#7d2618` | `#ff8a45` |

**调色板结构规律**（四套一致，是设计意图不是巧合）：`c1` 与 `c5` 都是**近黑**（同一色的两个端点，构成画面的暗部收口），`c2`/`c3` 是**中低饱和的同色系两级**，`c4` 是**唯一的高亮暖/浅点**（`#eed8aa` 沙金 / `#b8ffd9` 薄荷 / `#f0b8ff` 粉紫 / `#ffd08a` 琥珀）。`glowColors` 恒为「近白 → accent → 深暗」三级。`accent` 恒等于 `glowColors[1]`。

**这条规律对 Spark 有意义**：若后续要让用户自定义主题（工单未含，属候选），只需暴露 c2/c3/c4 三个色 + accent，c1/c5 由 accent 派生近黑即可保持画面结构不塌。

### 1.2 五套动态自然风光（`kind: "video"`）

| # | id | 中文名 | 英文名 | 视频直链（720p） | `accent` |
| --- | --- | --- | --- | --- | --- |
| 5 | `nature-misty-forest` | 雾隐森林 | Misty Forest | `https://cdn.coverr.co/videos/coverr-above-a-misty-forest-518/720p.mp4` | `#9fbfd4` |
| 6 | `nature-ocean-drift` | 潮汐漫游 | Ocean Drift | `https://cdn.coverr.co/videos/coverr-ocean-waves-3983/720p.mp4` | `#6fb3d6` |
| 7 | `nature-snow-peaks` | 雪峰天际 | Snow Peaks | `https://cdn.coverr.co/videos/coverr-snowy-mountains-1843/720p.mp4` | `#aecbe8` |
| 8 | `nature-cinematic-snow` | 雪岭电影感 | Cinematic Snow | `https://cdn.coverr.co/videos/coverr-cinematic-snowy-mountains-7615/720p.mp4` | `#93aecb` |
| 9 | `nature-ski-view` | 雪野滑踪 | Ski View | `https://cdn.coverr.co/videos/coverr-ski-view-3385/720p.mp4` | `#c2d8ea` |

素材来自 [Coverr](https://coverr.co/)，**可商用、免署名**（`index.html:956` / README 双处声明）。五个 accent 全是**低饱和冷灰蓝**（`#9fbfd4`~`#c2d8ea`），与四套流体的高饱和 accent 形成对照——作者对视频壁纸的点睛色是刻意压过的。

**类型标注文案**（A 级，取自产品 locale）：`kind.fluid` = 「程序化流体 · 本地 WebGL 渲染」/「procedural fluid · WebGL, drawn locally」；`kind.video` = 「动态自然风光 · 720p 在线视频，需要联网」/「nature loop · 720p video, needs internet」。

---

## 2. A 级：着色器三段（`assets/fluid-shader.js`，`window.BG_FLUID`）

GLSL ES 3.00（`#version 300 es`）。**逐字转录即可，不要改写**——改写就失去 sha256 可核验性，也无法与上游对账。

### 2.1 `VERTEX`（3 行，平凡）

```glsl
in vec4 a_position; out vec2 vUv;
void main() { vUv = a_position.xy * 0.5 + 0.5; gl_Position = a_position; }
```

### 2.2 `FLOW_FRAGMENT`（指针流场累积，写到四分之一分辨率纹理）

输出 `fragColor` 三通道语义**必须记住**，POST 段全靠它：

- **`r` = influence**（指针影响强度，0–1）
- **`g`/`b` = 方向**，编码在 0.5 附近（POST 段用 `(flow.gb - 0.5) * 2.0` 解回 −1..1）

算法逐步：

1. `prev = texture(u_prev, vUv)`
2. **衰减**：`prev.r *= u_decay`；`prev.gb = mix(vec2(0.5), prev.gb, u_decay)`——注意 gb 是**向 0.5 中性值衰减**而非向 0，因为 0.5 是「无方向」的编码
3. `dist = distance(vUv, u_mouse)`
4. **笔刷形状**：`influence = exp(-dist² / (u_brushRadius² * 0.5))`，再 `max(0.0, influence - 0.01)` 切掉长尾
5. `speed = length(u_velocity)`
6. **强度合成**：`presenceStrength = u_brushStrength * 0.3`（静止悬停也有痕）+ `velBonus = min(speed * 3.0, 0.7) * u_brushStrength`（快速移动加成，封顶 0.7）→ `totalStrength = 两者之和`
7. `prev.r = max(prev.r, influence * totalStrength)`——**取 max 不取 mix**，所以轨迹是累积的最强值，不会被后续弱帧冲淡
8. `blendAmt = influence * min(totalStrength, 0.4) * 0.3`
9. `prev.g = mix(prev.g, clamp(u_velocity.x * 2.0 + 0.5, 0, 1), blendAmt)`；`prev.b` 同理用 `u_velocity.y`

uniform 六个：`u_prev` `u_mouse` `u_velocity` `u_brushRadius` `u_brushStrength` `u_decay`。

### 2.3 `POST_FRAGMENT`（成像主段）

**三个辅助函数的实际形状**（这里有个容易看错的点）：

- `snoise(vec3)`：标准 Ashima simplex noise（`mod289`/`permute`/`taylorInvSqrt` 三件套 + `n_ = .142857142857` 即 1/7）
- `hash(vec2)`：`fract(p.xyx * .1031)` → `+= dot(p3, p3.yzx + 33.33)` → `fract((p3.x+p3.y)*p3.z)`
- **`fbm(vec3)` 的循环只跑一次**：`for(int i=0;i<1;i++){ v += amp*snoise(p); p = p*2.+shift; amp *= .4; }`——`amp` 初值 `.6`，循环体只执行一次，所以 **`fbm(p) ≡ 0.6 * snoise(p)`**。`shift=vec3(100.)` 与 `amp*=.4` 是**死代码**（循环外的赋值不生效）。**转录时原样保留**——它是产品真值的一部分，"优化"掉就与上游 sha256 不一致了；但可以在我们自己的注释里写明这一点，免得后人以为是多倍频。
- `fluidNoise(uv, t)`：**三层域扭曲**——
  - `n1 = fbm(vec3(uv*.6, t*.06))`，`n2 = fbm(vec3(uv*.6+5.2, t*.06+1.3))` → `w1 = vec2(n1,n2)*.6`
  - `n3 = fbm(vec3((uv+w1)*.7+1.7, t*.05+3.1))`，`n4 = fbm(vec3((uv+w1)*.7+9.2, t*.05+5.7))` → `w2 = vec2(n3,n4)*.5`
  - `return fbm(vec3((uv+w1+w2)*.5, t*.04))`
  - 三个时间系数 `.06 / .05 / .04` 递减，是"越深层越慢"的视差感来源
- `curlish(uv, t)`：`snoise` 的**有限差分旋度**，`eps = .02`，采样 `uv*.8`，返回 `vec2(-(ny-n)/eps, (nx-n)/eps) * .003`

**main 逐步**（`u_resolution` 为 canvas 像素尺寸）：

| 步 | 代码 | 作用 |
| --- | --- | --- |
| 1 | `aspect = u_resolution.x/u_resolution.y`；`uv = gl_FragCoord.xy/u_resolution`；`suv = vec2(uv.x*aspect, uv.y) * u_scale + u_offset` | 等比坐标 + 缩放 + 偏移 |
| 2 | `flow = texture(u_flowmap, uv)`；`influence = flow.r`；`flowDir = (flow.gb - 0.5) * 2.0` | 解流场 |
| 3 | `suv += flowDir * influence * u_distortBoost * 0.8` | **指针扭曲**（注意固定系数 0.8） |
| 4 | `swirlAngle = influence * u_swirlBoost * 2.5`；`delta = suv - vec2(uv.x*aspect, uv.y)*u_scale`；`suv += (mat2(cs,sn,-sn,cs)*delta - delta) * influence` | **指针涡旋**：绕"未扭曲位置"旋转，旋转量与 influence 相乘两次（角度里一次、位移里一次） |
| 5 | `curl = curlish(suv, t*.04)`；`uvD = suv + curl*12.` | 自主流动（无指针也在动） |
| 6 | `f = fluidNoise(uvD, t)`；`swirl = snoise(vec3(uvD*.8 + f*1.5, t*.035))*.5+.5`；`n = f*.5+.5` | 两个 0–1 标量场 |
| 7 | **五段颜色混合**（顺序与区间都是设计意图）：<br>`col = mix(u_c1, u_c2, smoothstep(.2,.5,n))`<br>`col = mix(col, u_c3, smoothstep(.35,.65, n + swirl*.25))`<br>`col = mix(col, u_c4, smoothstep(.6,.85, swirl) * .55)`<br>`col = mix(col, u_c5, smoothstep(.5,.8, n*swirl) * .35)` | c4 最高只混 55%、c5 只混 35%——**亮部与暗部收口都是半透明叠加**，这是四套调色板能共用一套参数的原因 |
| 8 | **指针辉光**：`glow = smoothstep(0,.8,influence)`；`glowNoise = snoise(vec3(uvD*1.5, t*.08))*.5+.5`；`glowDist = smoothstep(0,1,influence)`；`glowMix = mix(u_glowColor3, u_glowColor2, glowDist)` 再 `mix(→u_glowColor1, glowDist*glowNoise)`；`col = mix(col, glowMix, glow * u_glowIntensity)` | 三色辉光按距离插值，再被噪声打散——避免"手电筒圆斑"感 |
| 9 | **颗粒**（`u_grain > 0` 时）：`flowOffset = (uvD - suv) * u_resolution.y`；`gp = floor((gl_FragCoord.xy + flowOffset) / 5.0)`；`gr = hash(gp)*2.-1.`；`col += gr * u_grain` | 两个细节：**5px 量化**（不是逐像素，否则会闪）+ **流动补偿**（颗粒跟着流体走，不像贴了层噪点） |
| 10 | **bloom**：`luma = dot(col, vec3(.299,.587,.114))`；`bloom = smoothstep(u_bloomThreshold-u_bloomRange, u_bloomThreshold+u_bloomRange, luma)`；`col += (col*.85 + vec3(.15,.145,.13)) * bloom * u_bloomStrength` | 加的是**暖偏**（`.15/.145/.13` 三通道递减）而非纯白，所以高光偏暖 |
| 11 | **光源**：`ld = length((uv-u_lightPos)*vec2(aspect,1.))`；`core = exp(-ld*ld*4.5)`；`halo = exp(-ld*1.8)`；`col += vec3(1.,.97,.9)*core*u_lightCore + vec3(.72,.8,1.)*halo*u_lightHalo` | **暖核 + 冷晕**（核 `1/.97/.9`，晕 `.72/.8/1`），核是高斯平方衰减、晕是线性指数衰减 |
| 12 | **暗角**：`vig = 1.-smoothstep(.35,.75,length(uv-.5))`；`col = mix(col*(1.-u_vignette), col, vig)` | 边缘压暗 `u_vignette` 比例 |

uniform 二十三个：`u_time` `u_resolution` `u_scale` `u_offset` `u_grain` `u_flowmap` `u_distortBoost` `u_swirlBoost` `u_glowIntensity` `u_glowColor1..3` `u_c1..u_c5` `u_lightPos` `u_lightCore` `u_lightHalo` `u_vignette` `u_bloomThreshold` `u_bloomRange` `u_bloomStrength`。

---

## 3. A 级 PARAMS 33 项 —— 以及**其中 8 项渲染器根本不消费**

`fluid-shader.js:209–243`，`PARAMS` 共 **33 个键**（含 `type`）。

### 3.1 被消费的 25 项（含 `type`）

| PARAMS | 值 | 消费点 |
| --- | --- | --- |
| `type` | `'fluid'` | 类型判别（区分 video 壁纸） |
| `mouseRadius` | `0.09` | → `u_brushRadius` |
| `mouseStrength` | `1.8` | → `u_brushStrength`（**coarse pointer 时强制传 0**） |
| `mouseSmoothing` | `0.1` | JS 侧指针位置平滑系数 |
| `mouseVelocity` | `0.2` | JS 侧指针速度平滑系数 |
| `decay` | `0.925` | → `u_decay`（流场每帧衰减） |
| `distortBoost` | `2.2` | → `u_distortBoost` |
| `swirlBoost` | `0.8` | → `u_swirlBoost` |
| `glowIntensity` | `0.13` | → `u_glowIntensity` |
| `glowColors` | `['#fff7d1','#538dca','#2d448b']` | → `u_glowColor1..3`（**随主题变**） |
| `speed` | `28` | JS 侧：`elapsed = (now-start)*0.001*(speed/100)` → **0.28× 实时** |
| `scale` | `1.77` | → `u_scale` |
| `offsetX` / `offsetY` | `-124` / `-48` | JS 侧**除 100** 后 → `u_offset`，即 `(-1.24, -0.48)` |
| `grain` | `0.005` | → `u_grain` |
| `colors` | `['#000000','#1A3870','#204a7e','#eed8aa','#000000']` | → `u_c1..u_c5`（**随主题变**） |
| `lightX` / `lightY` | `0.89` / `0.46` | → `u_lightPos`，x 分量**跟随指针**：`lightX + (mouse.sx - lightX) * lightFollow`，**y 恒定** |
| `lightCore` | `0.14` | → `u_lightCore` |
| `lightHalo` | `0.2` | → `u_lightHalo` |
| `vignette` | `0.38` | → `u_vignette` |
| `lightFollow` | `0.63` | 光源跟随指针的比例（0=固定，1=完全跟随） |
| `bloomThreshold` | `0.61` | → `u_bloomThreshold` |
| `bloomRange` | `0.18` | → `u_bloomRange` |
| `bloomStrength` | `0.4` | → `u_bloomStrength` |

**PARAMS 里存的是 `fluid-deep-ocean` 那一套**（`colors`/`glowColors` 与 §1.1 第 1 行完全一致）。其余三套只换 `colors`/`glowColors`/`accent` 三项，**其余 30 项四套共用**——这与 §1.1 的调色板结构规律互为印证。

### 3.2 **未被消费的 8 项（重要，防止实现幻觉参数）**

`noiseBoost`(`0.3`)、`distortion`(`18`)、`swirl`(`20`)、`swirlIterations`(`12`)、`rotation`(`15`)、`proportion`(`60`)、`softness`(`80`)、`shapeScale`(`0`)

这 8 项**在提取出的着色器里没有对应 uniform，展示页渲染器也从未读取**。它们应是产品侧 `WorkbenchFluid.tsx` 的 UI 设置项（或另一个未提取的着色器变体）。

**判决**：Spark 第一批**不实现这 8 项**——照抄成"参数表里有但没人读"就是 ARCHITECTURE §9 黑名单的**幻觉防御 / 无据设计**；实现成"我们自己猜的语义"更糟（会与上游同名不同义）。若要保留，只能作为**原样透传的常量表**并在注释里写明"上游存在、本实现未消费、语义未取证"。

---

## 4. B 级：渲染器实现常量（`createFluid`，`index.html:1025–1225`）

| 项 | 值 / 代码 | 备注 |
| --- | --- | --- |
| context | `canvas.getContext("webgl2", { alpha: false, antialias: false, powerPreference: "low-power" })` | **`alpha:false` = 不透明画布**；`low-power` 是作者主动要求的省电档 |
| 失败处理 | `gl === null` / 编译失败 / 链接失败 → **返回 `null`**，调用方回落到静帧 `.wash` | 编译错误走 `console.error` 带 `getShaderInfoLog` |
| 全屏 quad | `Float32Array([-1,-1, 1,-1, -1,1, 1,1])`，`TRIANGLE_STRIP`，4 顶点 | 两个 pass 共用同一个 buffer |
| 流场分辨率 | `fw = round(canvas.width/4)`，`fh = round(canvas.height/4)` | **四分之一分辨率**，两个 pass 里只有 flow 在低分辨率 |
| ping-pong | 两个 `{fbo, tex}`，`write` 标志每帧翻转 | 纹理参数：`LINEAR`/`LINEAR`/`CLAMP_TO_EDGE`×2，`RGBA`/`UNSIGNED_BYTE` |
| **流场种子** | `Uint8Array`，每像素 `(0, 128, 128, 255)` | r=0 无影响，gb=128 即 0.5 中性方向——与 §2.2 的编码一致 |
| dpr | `Math.min(window.devicePixelRatio \|\| 1, 1.5)` | **封顶 1.5**，4K 屏上不会爆显存 |
| resize | `ResizeObserver(resize).observe(canvas)`；`resize()` 内先比对 `w===cw && h===ch` 才重建 | 重建时**删除旧 texture 与 framebuffer**（`gl.deleteTexture`/`deleteFramebuffer`）——无泄漏 |
| 帧率上限 | **30fps**：`if (document.hidden \|\| now - last < 1000/30) return;` 然后 `last = now - ((now-last) % (1000/30))` | 第二行是**漂移补偿**（把余数扣掉），否则长期会偏慢。注意 `document.hidden` 是**跳帧而非取消 RAF**——RAF 一直在跑，只是不渲染 |
| 指针 | `window.addEventListener("mousemove", onMove, { passive: true })`；`coarse = matchMedia("(hover: none), (pointer: coarse)")` 时**不挂监听**且 `u_brushStrength` 传 `0` | 触屏设备没有指针轨迹，作者显式归零而非留残值 |
| 指针归一 | `mouse.x = (clientX - r.left)/r.width`；`mouse.y = 1 - (clientY - r.top)/r.height` | **y 翻转**（GL 坐标） |
| 指针平滑 | `sx += (x - sx) * mouseSmoothing`；`svx += ((x - sx)*0.5 - svx) * mouseVelocity` | 初值全 `0.5`（画面中心），速度初值 `0` |
| 时间 | `elapsed = (now - start) * 0.001 * (P.speed/100)`，`start = performance.now()` | 见 §3.1 |
| **调色板插值** | 每帧 `from.colors[i] = mix(from.colors[i], to.colors[i], 0.06)`（5 项）+ `from.glow[i]` 同（3 项） | **展示页独有**；app 是直接换（`index.html:1154`）。0.06/帧 ≈ 约 50 帧（30fps 下 1.7 秒）收敛到 95% |
| hex→rgb | `parseInt(h.slice(1,3),16)/255` 三通道 | 只接受 `#rrggbb`，不支持缩写 |
| reduced-motion | `still = matchMedia("(prefers-reduced-motion: reduce)").matches` → `if (still) render(performance.now()); else raf = requestAnimationFrame(loop)` | **只渲一帧不起 RAF**；`setPalette` 时 `for (i<40) render(...)` **连渲 40 帧**让插值收敛（否则静态帧永远停在旧色） |
| 清理 | `stop()` = `cancelAnimationFrame(raf)` + `removeEventListener("mousemove", onMove)` | React 里对应 `useEffect` 的 cleanup |
| 对外接口 | `{ setPalette(wallpaper), stop() }` | 就两个方法 |

**Spark 侧的两处口径回退**（B 级差异按产品口径处理）：

1. 调色板切换：**建议保留插值**（0.06/帧）——上游 app 直接换是因为它的壁纸在玻璃面板底下、换色本来就被模糊吃掉；Spark 是全保真背景，硬切会闪。这条要在迷你 ADR 里写明是**有意偏离产品口径**。
2. reduced-motion：保留单帧 + 40 帧收敛。

---

## 5. C 级：**不得照抄清单**（含理由与替代）

| 上游做法 | 出处 | 为什么不抄 | Spark 口径 |
| --- | --- | --- | --- |
| `.hero h1 { font-size: clamp(42px, 8.6vw, 112px); font-weight: 400; letter-spacing: -.038em }` | `index.html:183–191` | 撞 DESIGN §12.3 超大标题【P0】 | 主题选择器走 §3 字号封顶（UI 13px / 页面级标题 15px） |
| **`--accent` 随主题改写 `document.documentElement`** | `index.html:1259`：`style.setProperty("--accent", w.accent)` | 撞 §12.9 边界①②（画布外一寸不动）。Spark 的 accent 是 §13.C indigo + §13.L `--send-accent`/`--user-bubble`，属**产品身份**，被壁纸改写等于让主题动到发送钮与用户气泡 | **禁止**。主题的 `accent` 字段只可用于**画布内部**（如缩略图选中环，若确需则另立拍板） |
| stage 的 **34px 重模糊**（`canvas: blur(34px) saturate(1.05) brightness(.86)`；`wash: blur(34px) saturate(1.06)`；`video: blur(16px) saturate(.82) brightness(.72) contrast(1.04)`） | `index.html:57–96` | 这是「窗口套窗口」的产物。作者注释（`index.html:78–82`）说得很清楚：**轻模糊时眼睛会把背景与窗内静帧对比，同一着色器不同时刻会被读成两张不同的图**，所以要糊到结构不可比。Spark 里没有窗内静帧，壁纸就是背景本身 | **不加模糊，全保真渲染**。这是 §0.1 C 级里最容易误抄的一条 |
| `.frame` 假窗口壳 + `.bar` 假标题栏（三个圆点 + `127.0.0.1:3080`） | `index.html:297–343`、`684–689` | 营销页叙事装置，用来"展示产品长什么样" | 无对应物 |
| hero 录屏全套：`hero-loop.mp4`(1.2MB) + `hero-cues.json` 时间点 + `IntersectionObserver` 阈值 `[0, 0.5]` + `requestIdleCallback(…, {timeout:1400})` + `visibilitychange` + 首次手势兜底 `watchForContact` | `index.html:1324–1529` | 与主题无关，是"让访客看到窗口会动"的展示机制。**但其中的判据设计值得学**（见 §7） | 无对应物 |
| `.thumbs button` 圆角 `7px`（窄屏 `5px`/`4px`） | `index.html:409`、`622`、`642` | 不在 §13.B 圆角封闭档位内（胶囊 / 8 / 12 / 16 / 18 / 22 / 14） | 归到 **8px** |
| `.wallbar` 的 `backdrop-filter: blur(18px) saturate(1.12)` | `index.html:381` | 撞 §12.2【P0】，§12.9 边界③**明确不豁免玻璃** | 选择器容器用不透明底板 + 既有 token |
| 键盘 `1`–`9` 直接选主题、`←`/`→` 循环 | `index.html:1545–1554` | 数字键在 Spark 里可能已被占用（审批档位、面板导航等） | 若要键位，**必须走 protocol `keymap.ts` 单源**并做冲突检测（19.39 的 `mergeKeymap`/`keymapRejected` 已有机制），不得在组件里自定 |

---

## 6. 值得抄的判据设计（不是抄代码，是抄判断方式）

上游有几处**决策质量高于其视觉风格**，与本仓"boring code + 失败闭合"的取向一致，登记备查：

1. **设备能力 ≠ 窗口尺寸**（`index.html:1363–1380`）。作者试过 1000px 与 640px 两个宽度门槛**都错了**——1000px 拒掉所有笔记本窗口与预览面板，640px 也拒（预览面板比手机还窄）。结论：窗口尺寸不是设备能力，**拖窗口边缘不应该改变页面行为**。最终只用三件事判断：`(pointer: coarse), (hover: none)`、`prefers-reduced-motion`、`navigator.connection.saveData`。且指针判定写成**拒绝式**而非要求式——要求 `pointer: fine` 等于"只服务明确自称桌面的设备"，而一个不报指针的文档不是手机。
2. **可见性规则的"不能是永远拿不到"补丁**（`index.html:1388–1403`、`1410–1418`）。`document.hidden` 时不播放是对的，但"一个自报 hidden 且永不改口的文档"会把机会永久拒掉，所以补了首次 `pointerdown`/`keydown` 兜底（`heroContactArmed` 只用一次）。**这与我们的失败闭合铁律同源**：降级可以，但降级路径必须是可达的。
3. **失败路径也要 commit**（`index.html:1281–1283`）：`next.decode().then(commit, commit)`——静帧解码失败时**仍然切换标题**，因为"图坏了"不该连带"名字也不换"。
4. **对比度靠局部手段买，不靠压暗整块面**（`index.html:222–244`）。作者实测过：把胶囊的 tint 从 `.50/.68` 降到 `.06/.10`，表面偏移从 42.3 降到 19.7 再趋平（18.7/15.4），继续加 backdrop 的 saturate 也没用（1.0→2.2 只从 14.9 到 18.0，在帧间噪声内）；标签的对比度改用**字形自己的 text-shadow**买（`0 1px 1px rgba(4,7,13,1), 0 1px 2px rgba(4,7,13,1)`），"局部于字形，对表面零成本"。实测数据：无阴影 2.31:1，2px 衰减 3.74:1，5px 3.80:1——**增益在"多黑"不在"多远"**，而 5px 光晕在 44px 胶囊里读起来像玻璃上的脏。
5. **边缘高光用两个 inset shadow 而不是渐变背景层或 mask**（`index.html:238–244`、`265–267`）：`inset 1px 1px 0 0 rgba(255,255,255,.55)` + `inset -1px -1px 0 0 rgba(255,255,255,.34)`（**1.15 : 0.75 的权重比**，即上左主光、下右副光）。理由：画成半透明 tint 底下的填充层会**渗满整个胶囊**（实测内部比背后壁纸还亮），用 mask 则在 mask 失效时会把胶囊刷白——**两个偏移阴影两种失效模式都没有**。
6. **`.veil` 的双层 scrim 数值**（`index.html:101–108`），这是 §12.9 边界④ 的现成起点：
   ```css
   background:
     radial-gradient(122% 84% at 50% 44%, rgba(4,7,13,0) 30%, rgba(4,7,13,.48) 72%, rgba(4,7,13,.82) 100%),
     linear-gradient(180deg, rgba(4,7,13,.42) 0%, rgba(4,7,13,0) 16%);
   ```
   径向层负责四周压暗（中心 30% 内完全透明），线性层只负责顶部承住 header（16% 处归零）。**注意这是暗色页的数值**；Spark 亮色为默认（§13.C），必须重新定标，不能直接搬 `rgba(4,7,13,…)`。

---

## 7. 与 DESIGN §12.9 四条边界的逐条对账

| §12.9 边界 | 上游做法 | Spark 19.43 口径 |
| --- | --- | --- |
| ① 只豁免画布内部，默认外观一寸不动，缺省关闭 | 上游是**整套外壳换皮**——`index.html:937` 明说"Selecting one **repaints every surface in the app**"，`--accent` 也随主题改写 | **收窄**：只做背景层 + scrim，不改 accent、不改任何既有 token；`wallpaper` 缺省 `'none'`，关闭态与未装该功能逐像素一致 |
| ② 承载 UI 黑白中性，§12.8 grep 零命中 | 上游选择器 `.wallbar` 用 `backdrop-filter: blur(18px) saturate(1.12)` + `rgba(8,13,22,.6)` 玻璃胶囊 | 选择器容器用不透明底板 + 既有 token；缩略图圆角归 8px；**§12.8 全部模式在 `apps/web` 仍须零命中** |
| ③ §12.2 玻璃不豁免 | 上游**整套 UI 就是玻璃**（`blur(28px) saturate(1.8)` + 0.5px 描边） | **禁止 `backdrop-filter`**。除黑名单理由外有实证判例：上游 v0.1.3 修的正是玻璃折射层使左栏成 stacking context、其内 fixed 设置浮层被压到栏层级、命中测试返回应用卡、不加 force 的真实点击 3s 超时（修法是把持浮层的栏抬到 `handle` 11 / `overlayLayer` 20 之上）。底板改用 §6.6 的 scrim 数值 |
| ④ 对比度/焦点/密度/字号不豁免 | 上游自己也在守这条：3.98:1 与 2.31:1 的实测、靠加深底板与字形阴影解决（§6.4） | 主题开启时正文与 `:focus-visible` 焦点环仍须达既有档位，由 scrim 保证；13px 密度与 §3 字号封顶不变 |

---

## 8. 第一批（四套流体）文件级落地清单

| 文件 | 内容 | 来源级别 |
| --- | --- | --- |
| `apps/web/src/features/appearance/fluid-shader.ts` | GLSL 三段**逐字转录** + 文件头版权声明（MIT / Copyright (c) 2026 DeepSeek / 上游 `WorkbenchFluid.tsx` + `sha256:1b070ec37c73b3a5` + 提取日期），并注明 `fbm` 循环只跑一次是上游原样 | A |
| `apps/web/src/features/appearance/wallpapers.ts` | 九套定义（§1 两张表）+ 33 项 PARAMS（含 §3.2 的 8 项未消费参数如何处置的注释） | A |
| `apps/web/src/features/appearance/fluid-renderer.ts` | `createFluid(canvas) → { setPalette, stop } \| null`（§4 全部常量），纯 TS 不含 React | B |
| `apps/web/src/features/appearance/FluidCanvas.tsx` | React 包装：`useEffect` 建/销毁、`ResizeObserver` 交渲染器、`visibilitychange` 由渲染器内部跳帧 | B |
| `apps/web/src/features/appearance/WallpaperLayer.tsx` | 背景层挂载（`position: fixed`，**不设 `backdrop-filter`**，`z-index` 不干预既有层叠阶梯）+ scrim | §6.6 数值重定标 |
| `apps/web/src/stores/settings.ts` | 加 `wallpaper: WallpaperId \| 'none'`（缺省 `'none'`）+ 读取时白名单校验回落（照 `codeThemeLight`/`codeThemeDark` 的 `LIGHT_THEMES.has(...)` 手法） | — |
| `apps/web/src/features/settings/AppearancePage.tsx` | 新增「主题壁纸」区：九宫格 + 关闭项，用 `SettingRow`/`SettingGroupCard` 既有件 | — |
| `packages/protocol/src/i18n.ts` | 九个主题名 ×2 语言 + `kind.fluid`/`kind.video` 两条类型标注（§1.2 已给现成双语文案） | A（文案） |

**测试面**：`wallpaper` 读写与缺省、非法值回落、切换即时生效、`'none'` 回落零残留（canvas 卸载 + RAF 取消 + 监听器移除）、reduced-motion 单帧、调色板插值收敛、PARAMS→uniform 映射表（防漏传）。

---

## 9. 拍板记录（2026-09-24 晚风逐项确认；原四项待拍板全部落定）

| # | 拍板 | 内容 | 连带修订 |
| --- | --- | --- | --- |
| ① | **五套"视频"主题改静帧 + 幻灯片式切换** | 不引入任何 mp4：五套主题以打包的 gallery 静帧为底，主题间切换用 crossfade；**不做常驻 Ken Burns / 平移缩放**（拍板理由即"视频太占体积和设备资源"，常驻动效同属常驻开销）；`prefers-reduced-motion` 下切换为瞬时。素材 = 上游 `assets/gallery/*.jpg` 九张（265–352KB，共约 2.6MB），**与 ④ 共用同一批**。体积从 mp4 的 25–100MB 量级降到 2.6MB，零外链、零视频解码 | DESIGN §12.6 指针 bullet、§12.9 豁免对象；doc/08 19.43 第二批口径 |
| ② | **accent 全局改写 + 对比度闸** | 主题 accent 可改写 §13.C / §13.L 点睛色（发送钮 / `:focus-visible` 焦点环 / 链接），但落 UI 前过对比度闸：亮色下不达 AA 4.5:1 即回落该主题 `glowColors` 深色端，再不足回落产品默认 indigo。五套静帧主题的浅 accent（`#9fbfd4`~`#c2d8ea`）在亮色下必然触发回落。焦点环随主题变色**不是中性化**（2026-08-31 拍板意图不变） | DESIGN §12.9 边界① 修订 |
| ③ | **局部底板逐项实测** | 只给直接压在壁纸上的文字块（会话流 assistant 文本、状态条等）各垫不透明底板，逐处实测到既有对比度档位；不做整页 veil（冲淡壁纸），也不把壁纸限制到无文字区。上游 `.veil` 的暗色数值（§6.6）**不搬**——Spark 亮色为默认，深色字压暗底更糟 | DESIGN §12.9 边界④ 补方法 |
| ④ | **WebGL2 不可用 = 打包九张静帧兜底** | 与 ① 共用同一批 gallery jpg；WebGL2 不可用时显示该主题静帧（不模糊、全保真），并在设置页注明当前为静态降级。上游 `.wash` 用小图 + blur(34px) 的路子**不抄**（我们不糊，小图拉伸会发虚；gallery 九张分辨率落地前需先量） | — |
| ⑤ | **可见范围 = A 档** | 会话主区域底色整面换主题、大面积可见；assistant 文字块各自垫不透明底板（③ 的落实位置）；侧栏 / 标题栏 / 输入框 / 用户气泡不透明且**不透色**（§12.2 禁玻璃——与原版"颜色透进侧栏"的唯一差别）；**不做** B 档（主区域盖不透明面板、主题只剩缝隙的含蓄档） | DESIGN §12.9 边界④、doc/08 19.43（1） |

**下载前置（2026-09-24 晚风）**：上述 2.6MB 素材的下载**执行前必须先问**「现在用的是宽带还是流量热点？」——宽带可下载，流量 / 手机热点一律不下载，未答不下载。已写入 AGENTS §2.3a（常驻规则）。

**仍开放**：无。四项全部落定。实现期若发现 gallery 静帧分辨率不足以铺满目标屏（4K 拉伸发虚），回到晚风重拍 ①/④ 的素材来源，**不得自行改判**。

---

## 10. 许可证与归属

- 仓库与六个包均 **MIT**，`LICENSE` 为 `Copyright (c) 2026 DeepSeek`（保留 deepseek-harness 原声明）。按 AGENTS §6.2：**可复用，但保留版权声明**——转录着色器时在文件头写明版权、上游文件来源与 sha256。
- Coverr 素材：**可商用、免署名**（上游 README 与 `index.html:956` 双处声明）。
- 本报告全部取值经在线读取核对，**未克隆仓库、未下载 tarball、未用浏览器拉取资源**（§2.12 / §2.3a）。缓存两件在 `_scratch/`（gitignore），实现时以本报告与上游原文为准重新转录。
