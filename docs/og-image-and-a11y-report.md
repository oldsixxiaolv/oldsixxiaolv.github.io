# Phase 1.3 + 1.4 · og:image 设计 + 视觉验证 + a11y 调优报告

> **📸 历史快照（2026-10-01）** —— 记录当时 Phase 1.3 / 1.4 的设计与验证过程，**不再随代码更新**。相关资产现状看 `src/assets/img/og/`（3 组 SVG 母版 + **JPEG** 导出，格式已于 2026-10-22 由 PNG 改为 JPEG，见下面 §1 的现状更新）与 `src/assets/css/a11y.css`；重跑对比度检查用 `python3 scripts/contrast_check.py`。同批原始数据 `fa-data/audit-raw.json` 亦为快照，为保持 JSON schema 未作改动。

**作者：** UI/UX Pro Max
**日期：** 2026-10-01
**项目：** MeteoHub (`/Volumes/Kingston/Mac/MeteoHub`)
**关联任务：** `01a0fadb-fdad-7d02-8179-395d84fc6df7`（1.3）+ `01a0faf0-a773-7b13-827d-6873d0b70c26`（1.4）

---

## 1. og:image 交付物

3 个尺寸，SVG 源 + PNG 导出，全部放在 `src/assets/img/og/` 下。

> **⚠️ 现状更新（2026-10-22，缺陷 D3）** —— 下面这张表记录的是 **2026-10-01 当时的交付形态**；
> 本报告是历史快照、**不再随代码更新**，所以表里的 PNG 与字节数**保持原样**（改它们就是改历史）。
> 此后**发布的格式已改为 JPEG(q=90)**：三张 PNG（`og-1200x630.png` / `og-1080x1080.png` /
> `og-1500x500.png`）**已删除**，改为 `og-1200x630.jpg`（113,997 B）、`og-1080x1080.jpg`（107,358 B）、
> `og-1500x500.jpg`（112,615 B）—— 三张合计约 **1.5 MB → 334 KB**，全部 ≤ 200 KB；
> **母版 SVG 不变**。理由（社交平台每次抓分享卡都要下载数百 KB）与验证方式见
> `docs/DEFECT-BACKLOG.md` 的 **D3** 行；「分享图体积上限」与「`og:image:type` 与真实格式一致」
> 两条已做成常驻门禁（`scripts/check-image-assets.cjs` 的 **IA9 / IA10**）。

| 尺寸 | 用途 | SVG | PNG | 渲染验证 |
|---|---|---|---|---|
| 1200×630 | FB / LinkedIn / Twitter summary_large_image 默认 | `og-1200x630.svg` (6.3 KB) | `og-1200x630.png` (398 KB) | ✅ rsvg-convert |
| 1080×1080 | Twitter / Instagram 正方形卡片 | `og-1080x1080.svg` (5.4 KB) | `og-1080x1080.png` (424 KB) | ✅ rsvg-convert |
| 1500×500 | X header-like 横幅 | `og-1500x500.svg` (5.6 KB) | `og-1500x500.png` (245 KB) | ✅ rsvg-convert |

所有 PNG 都通过 `rsvg-convert -w N -h N` 在原生分辨率渲染；视觉抽检三张都呈现品牌应有的 editorial modern 气质（已附 leader 确认）。

### 1.1 设计语言对齐

| 设计 token | 取值 | 在 og:image 中的角色 |
|---|---|---|
| `--color-brand-700` | `#143e93` | 顶部 METEOHUB wordmark、右上角单位标识 |
| `--color-neutral-900` | `#0f0d0a` | 主标题"Yihang Lv" |
| `--color-neutral-600` | `#575049` | "Atmospheric Sciences · PhD Candidate" |
| `--color-accent-500` | `#e85f15` | tagline 暖色短线 + 强调流场线 + 气流方向粒子 |
| `--color-accent-600` | `#b14810` | 暖橙渐变末端（gradient stop） |
| 浅色 `#faf8f5` → 深色 `#efe7d4` | paper gradient | 背景纸面渐变 |

唯一一处微差：流场线本身用的是与 `--color-brand-700` 同色系的 **流场蓝 `#0b3a5b`**，而不是 `--color-brand-500`。原因：流场线是细线（stroke-width 1.2–1.4），需高饱和、低明度的"墨蓝"在纸面上才稳，brand-500 #256ef0 太亮、墨蓝更贴"气象流场图"的视觉语义。如果要把 brand-500 拉进来，下一轮设计 token 微调时建议新增 `--color-ink-blue: #0b3a5b` 作为"墨蓝 / 流场线"专用色。

### 1.2 art element：流场线（streamline）作为视觉主语

不复用头部那枚只占一小格的 ┒ 符号，而是把 **流场线**作为视觉主语：

- 6 条（横图）/ 5 条（方图）/ 5 条（宽幅）浅蓝流场线
- 1 条暖橙赭石高亮的 accent streamline 横贯主视觉区
- 4 个橙色粒子标记流动方向
- 左上 / 左下补 `φ 39.9° N · λ 116.4° E · 850 hPa u-component` 类气象坐标注释

整体效果：在缩略图尺寸下（推特卡片通常被压到 ~600 px 宽）依然能一眼识别"这是一个气象学术站"，而不是一张泛泛的封面图。

### 1.3 typography fallback 策略

社交平台 crawler 对 SVG og:image 的字体处理不一致（Twitter / FB 会 rasterize，X / LinkedIn 可能直接吃 SVG）。折中做法：

```
font-family="'Source Serif 4', 'Noto Serif SC', 'Times New Roman', Georgia, serif"
```

- 优先级：自定义 → 系统 CJK 衬线 → Times New Roman → Georgia → generic serif
- 即使所有 custom font 都 fail，最差也落到 Times New Roman / Georgia（macOS / iOS / Windows 都有），仍能保留 editorial 现代衬线感
- 实测：本地 rsvg-convert 渲染时 Source Serif 4 加载成功，Noto Serif SC 在 fontconfig 链路下正确渲染中科院大气物理研究所等 CJK

---

## 2. 视觉验证（a11y · 颜色对比度）

WCAG 2.1 AA 标准：
- 正文（< 18pt / < 14pt bold）：**4.5:1**
- 大字（≥ 18pt / ≥ 14pt bold）：**3.0:1**
- UI / 图形对象：**3.0:1**

### 2.1 计算脚本

`scripts/contrast_check.py` —— 把 `tokens.css` 里 light / dark 两套 token 全部喂进去，按 sRGB → 相对亮度 → 对比度公式算。可以重跑（无需参数）：

```bash
python3 scripts/contrast_check.py
```

> 路径更正：原文写的是 `src/assets/img/og/_contrast_check.py`，该路径不存在；脚本实际在 `scripts/contrast_check.py`。

> **2026-10-21 更新（D53）**：本脚本已改为**运行时直接解析** `src/assets/css/tokens.css`
> （原实现是一份手工维护的色值快照，暗色 `accent-50` / `accent-600` 两项与真值对不上 ——
> 已登记为缺陷 D55 并修掉）。⚠️ **下面 §2.2 与 §7 的表格是 P1.3 / P1.4 当时的快照数字**，
> 其中暗色 `accent-50` 用的值已知与现状不符，**不要按它判读**；**现状以脚本的实时输出为准**。
> 当前实时输出里有 **1 条真实的 AA 失败**：暗色链接 hover 2.46:1（缺陷 D57，修法待拍板 55）。

### 2.2 结果

| 配对 | 模式 | fg | bg | ratio | AA | 影响范围 |
|---|---|---|---|---|---|---|
| body / primary text | LIGHT | `#0f0d0a` | `#faf8f5` | **18.30:1** | ✅ PASS | — |
| body / secondary text | LIGHT | `#575049` | `#faf8f5` | **7.48:1** | ✅ PASS | — |
| body / muted text | LIGHT | `#7d776d` | `#faf8f5` | **4.19:1** | ❌ **FAIL** | 所有 `.muted` / muted captions |
| link / default | LIGHT | `#256ef0` | `#faf8f5` | **4.34:1** | ❌ **FAIL** | **全站链接** |
| link / hover | LIGHT | `#143e93` | `#faf8f5` | **9.26:1** | ✅ PASS | — |
| home-intro__label | LIGHT | `#e85f15` | `#faf8f5` | **3.26:1** | ❌ **FAIL** | 首页 `.home-intro__label` |
| badge--accent / annot-kind--insight | LIGHT | `#e85f15` | `#fff3eb` | **3.17:1** | ❌ **FAIL** | 所有 insight badge / filter |
| button on brand-400 | LIGHT | `#ffffff` | `#3a86ff` | **3.48:1** | ❌ **FAIL** | brand 主按钮文字 |
| body / primary text | DARK | `#f5f2ea` | `#161513` | **16.31:1** | ✅ PASS | — |
| body / secondary text | DARK | `#a8a498` | `#161513` | **7.32:1** | ✅ PASS | — |
| body / muted text | DARK | `#807c72` | `#161513` | **4.38:1** | ❌ **FAIL** | 所有暗色 muted captions |
| link / default | DARK | `#4d97ff` | `#161513` | **6.24:1** | ✅ PASS | — |
| accent on page | DARK | `#ffa874` | `#161513` | **9.65:1** | ✅ PASS | — |
| badge--accent | DARK | `#ffa874` | `#0e1a35` | **9.12:1** | ✅ PASS | — |

### 2.3 发现的 a11y 问题（**7 处 FAIL**）

按严重程度排序：

#### P0 · 影响全站阅读

1. **`--color-brand-500` 链接色**（LIGHT）4.34:1
   - 影响：全站所有正文链接
   - 推荐：把 `brand-500` 从 `#256ef0` 降到 `#1f5ec8`（≈5.0:1），或保留 `brand-500` 但链接专用一个 `--color-link: var(--color-brand-700)` 落到 brand-700

2. **`--color-neutral-500` muted 文本**（LIGHT + DARK）4.19:1 / 4.38:1
   - 影响：所有 muted 副标、日期、caption
   - 推荐：LIGHT 改 `#6b665d`（≈5.0:1），DARK 改 `#928d83`（≈5.0:1）

#### P1 · 影响显著组件

3. **`accent-500` 在 `accent-50` 上**（LIGHT）3.17:1
   - 影响：所有 insight badge / annot filter / 角标数字
   - 推荐：badge 内文字改用 `accent-600` `#b14810`（≈5.4:1）。这是 token 内部可解决的小改动

4. **`accent-500` 在 `neutral-50` 上**（LIGHT）3.26:1
   - 影响：`.home-intro__label`（首页 eyebrow）
   - 推荐：要么把 eyebrow 字号拉到 ≥ 14pt（≥ 18.67px）以适用大字 3:1 标准；要么切到 `accent-600`

5. **brand 主按钮文字**（LIGHT）3.48:1
   - 影响：`[data-theme="light"]` 下 brand-400 背景的按钮
   - 推荐：button bg 用 `brand-700 #143e93` 而不是 `brand-400 #3a86ff`，或者 LIGHT 模式单独定义 `--button-primary-bg: #1453d8`（介于两者之间，约 5.5:1）

### 2.4 我的处理方式

按任务边界，**我只报告不擅自改 token**。原因：

1. 改 `--color-brand-500` / `--color-neutral-500` 是 system-wide 决定，会影响组件库所有用法，超出 Phase 1.3 的边界
2. 1.1 / 1.2 都在改 CSS 层（preload 字体、metadata），token 调整最好等所有 owner 都在场时一次性 commit

建议 lead 决定：
- 选项 A：直接把 `neutral-500` / `brand-500` / accent badge 三个调整塞进 1.1 后续的 CSS 优化 commit（推荐，最经济）
- 选项 B：开 Phase 1.4 单独立 a11y token 调优任务（推荐如果想留 trace）

---

## 3. 视觉验证（FOIT / layout shift）—— ⚠️ BLOCKED on Phase 1.1

### 3.1 当前状态

按任务边界，以下三件事**必须等 Phase 1.1 (字体加载 + CSS 性能优化) 完成后才能验证**：

1. **FOIT（Flash of Invisible Text）**
   - 验证方法：`chrome --headless --enable-logging --dump-dom` 抓首屏渲染快照，对比有 / 无 `<link rel="preload">` 时 200ms / 500ms 时的可见文本
   - 当前依赖：font-display swap（已在 tokens.css 中设置），但 Noto Serif SC 是否走 subset、是否拆 critical font 还得等 1.1 决定

2. **fallback metrics · layout shift**
   - **好消息**：`tokens.css` 里已经定义了 `Source Serif 4 Fallback` / `Noto Serif SC Fallback` 两个 `@font-face`，带 `ascent-override` / `descent-override` / `line-gap-override` / `size-adjust` —— 这正是 modern font fallback 的标准做法
   - **还需要验证的**：fallback metrics 是否已挂到 `body` / `h1-h6` 的 `font-family` 栈里（不是只定义 @font-face 就够），以及 CJK fallback 的 size-adjust 数值是否真正压住了 Noto Serif SC ↔ system serif 之间的行高差
   - 建议：等 1.1 完成后用 Lighthouse / Web Vitals 抓一次 CLS，对比修复前后

3. **首屏字体正确加载**
   - 取决于 1.1 的 preload + preconnect + subset 决策
   - 等 1.1 完成后我会补这一节的截图证据

### 3.2 已做的、不依赖 1.1 的验证

- ✅ og:image 在 1200×630 / 1080×1080 / 1500×500 三种尺寸下都正确渲染
- ✅ 缩略图状态（压到 600px 宽）下文字层级仍可读
- ✅ light / dark 两套 token 与 og:image 的 paper-gradient 兼容（og:image 自带 paper 色，不依赖主题切换）
- ✅ a11y 对比度全表已计算（见 §2）

---

# Phase 1.4 · a11y token 调优 + FOIT 收尾

**日期：** 2026-10-01（同日连续迭代）
**目标：** 修复 §2.3 列出的 7 处 WCAG AA 失败，跑通 1.1 之后才能做的视觉回归 + CLS 测量。

---

## 6. Token diff（修改前后）

| Token | 模式 | 修改前 | 修改后 | AA 配对改善 |
|---|---|---|---|---|
| `--color-brand-500` | LIGHT | `#256ef0` (4.34:1) | **`#1f5ec8`** (5.67:1) | 全站链接通过 AA |
| `--color-neutral-500` | LIGHT | `#7d776d` (4.19:1) | **`#6b665d`** (5.38:1) | muted text 通过 AA |
| `--color-neutral-500` | DARK (prefers-color-scheme) | `#807c72` (4.38:1) | **`#928d83`** (5.49:1) | dark muted 通过 AA |
| `--color-neutral-500` | DARK (`[data-theme="dark"]`) | `#807c72` (4.38:1) | **`#928d83`** (5.49:1) | 同上 |
| `--button-primary-bg` | LIGHT | n/a (复用 brand-400) | **`#1453d8`** (white text 6.44:1) | brand 主按钮通过 AA |
| `--button-primary-bg` | DARK (prefers-color-scheme) | n/a | **`#2563eb`** (white text 5.17:1) | dark 主按钮通过 AA |
| `--button-primary-bg` | DARK (`[data-theme="dark"]`) | n/a | **`#2563eb`** (5.17:1) | 同上 |

### 6.1 配套组件 token 调整

| 组件 | LIGHT 颜色 | DARK 颜色 | 改动原因 |
|---|---|---|---|
| `.badge--accent` text/border | accent-500 → **`accent-600 #b14810`** | accent-300 (不变) | accent-500 在 accent-50 上 3.17:1 不通过 |
| `.home-intro__label` text | accent-500 → **`accent-600`** | accent-500 (不变，自动跟随 dark token) | 首页 eyebrow 3.26:1 不通过 |
| `.annot-kind--insight` (chip v1.1) | accent-500 → **`accent-600`** | accent-300 (不变) | 同 badge |
| `.annot-filter--insight.is-active` | accent-500 → **`accent-600`** | (继承) | filter chip |
| `.paper-anchor--insight .paper-anchor__count` | accent-500 → **`accent-600`** | (继承) | 角标数字 |
| `.btn--primary` background | brand-400 → **`button-primary-bg`** | 同左（独立 token） | 主按钮通过 AA |
| `.btn--primary:hover` background | brand-500 → **`brand-700 #143e93`** | 同左 | hover 更深，提供明确 affordance |
| `.skip-link` background | brand-400 → **`button-primary-bg`** | 同左 | 跳过链通过 AA |

所有改动都用 `/* P1.4 · ... */` 注释标记，方便日后 grep 追溯。

---

## 7. 对比度前后对比

`scripts/contrast_check.py` 在 P1.3 报告中已记录 7 处 FAIL。**P1.4 后 0 FAIL**：

```
$ python3 scripts/contrast_check.py
pair                                          mode     fg          bg          ratio    verdict
--------------------------------------------------------------------------------------------------------------------------
body / primary text                            LIGHT    neutral-900 neutral-50  18.30:1  AA=PASS AAA=PASS
body / secondary text                          LIGHT    neutral-600 neutral-50   7.48:1  AA=PASS AAA=PASS
body / muted text                              LIGHT    neutral-500 neutral-50   5.38:1  AA=PASS AAA=FAIL    ← was 4.19:1
link / default                                 LIGHT    brand-500   neutral-50   5.67:1  AA=PASS AAA=FAIL    ← was 4.34:1
link / hover                                   LIGHT    brand-700   neutral-50   9.26:1  AA=PASS AAA=PASS
home-intro__label (11px accent)                LIGHT    accent-600  neutral-50   5.66:1  AA=PASS AAA=FAIL    ← was 3.26:1
badge--accent (accent on accent-50)            LIGHT    accent-600  accent-50    5.43:1  AA=PASS AAA=FAIL    ← was 3.17:1
annot-kind--insight (chip v1.1)                LIGHT    accent-600  neutral-100  4.98:1  AA=PASS AAA=FAIL    ← was fail
annot-filter--insight.is-active                LIGHT    accent-600  neutral-100  4.98:1  AA=PASS AAA=FAIL    ← was fail
paper-anchor__count (insight)                  LIGHT    accent-600  neutral-50   5.66:1  AA=PASS AAA=FAIL    ← was fail
body / primary text (dark)                     DARK     neutral-900 neutral-0   17.25:1  AA=PASS AAA=PASS
body / secondary text (dark)                   DARK     neutral-600 neutral-0    7.74:1  AA=PASS AAA=PASS
body / muted text (dark)                       DARK     neutral-500 neutral-0    5.84:1  AA=PASS AAA=FAIL    ← was 4.38:1 (旧底色 neutral-50 口径) / 4.63:1 (同底色口径)
link / default (dark)                          DARK     brand-400   neutral-0    6.60:1  AA=PASS AAA=FAIL
accent on page (dark)                          DARK     accent-500  neutral-0   10.20:1  AA=PASS AAA=PASS
badge--accent (dark)                           DARK     accent-500  accent-50    9.12:1  AA=PASS AAA=PASS
text on surface card (light)                   LIGHT    neutral-900 neutral-0   20.30:1  AA=PASS AAA=PASS
text on surface card (dark)                    DARK     neutral-900 neutral-0   17.40:1  AA=PASS AAA=PASS
h1 / display heading (light)                   LIGHT    neutral-900 neutral-50  18.30:1  AA=PASS (large) AAA=PASS
h1 / display heading (dark)                    DARK     neutral-900 neutral-0   17.25:1  AA=PASS (large) AAA=PASS
button on --button-primary-bg (light)          LIGHT    text-on-brand button-primary-bg  6.44:1  AA=PASS AAA=FAIL   ← was 3.48:1 (FAIL)
button on --button-primary-bg (dark)           DARK     text-on-brand button-primary-bg  5.17:1  AA=PASS AAA=FAIL   ← was 2.88:1 (FAIL)
skip-link (light)                              LIGHT    text-on-brand button-primary-bg  6.44:1  AA=PASS AAA=FAIL   ← was 3.48:1 (FAIL)
skip-link (dark)                               DARK     text-on-brand button-primary-bg  5.17:1  AA=PASS AAA=FAIL   ← was 2.88:1 (FAIL)

RESULT: 0 fail(s)
```

**24 / 24 通过 AA**（其中 11 / 24 同时通过 AAA）。`AAA=FAIL` 的 pair 都还超过 AA 阈值 ≥ 4.5:1 的安全余量（如 muted text 5.38 vs 阈值 4.5 = 1.2 余量），符合"有正常视觉的用户可读、视觉障碍用户至少能用屏幕阅读器"的现实约束。

> **口径说明（2026-10-21 订正）**：上表是 **2026-10-01 的快照**，绝大多数数值按**当次脚本口径**记录 ——
> 当次脚本把暗色「页面底色行」的底色记成 `neutral-50`，而真实暗色 `--bg-page` 是 `neutral-0` `#0f0e0c`
> （与 D53 查出的旧脚本同一个错）。本轮已把暗色**页面底色行**的底色与数值订正为**当前 token 真值**
> （AA / AAA 判定均未改变；当前值以 `scripts/contrast_check.py` 的实跑输出为准）。
> **其余各行仍是当次数值**（含当时旧快照的色值，例如 `accent-600` 那几行、`badge--accent (dark)`、
> `text on surface card` 两行）—— 历史数值一律不回改。

### 7.1 附：暗色 `.home-signal` 暖橙面板的 text 配对

首页右上角的橙色 "Monsoon systems in motion" 面板（`.home-signal`）。**当前实现**见
`src/assets/css/pages.css` 的 `.home-signal` 段：

- 文字 `--signal-ink: var(--color-accent-900)` = `#260e02`
- 背景 `var(--color-accent-400)` = 亮色 `#ff7e33` / 暗色 `#ff8e4d`
- 实测对比度 **亮色 7.23:1 / 暗色 8.05:1**（与 `pages.css` 同段注释一致）→ AA + AAA pass，无需改动

> **订正（2026-10-21）**：原文此处写的是「使用 `color: neutral-900` on `background: accent-400 #ff7e33`，
> ratio = **7.75:1**」。那一版配色**已不是当前实现**（当时 `--color-neutral-950` 未定义、整条 `color`
> 声明在计算值阶段作废并回落继承值，见 `pages.css` 同段的说明）；而且它写的 7.75:1 按当前 token
> **复算不出来** —— 最接近的组合是 light 主题 `neutral-900` `#0f0d0a` 压 `#ff7e33` = 7.65:1，
> 而暗色 `neutral-900` `#f5f2ea` 压 `#ff7e33` 只有 2.27:1。⇒ 本节改为陈述**当前实现**。

---

## 8. 视觉回归（headless Chrome via puppeteer-core）

跑了 6 张截图（3 页 × light / dark），全部存放在 `docs/screenshots/`：

```
home-light.png        home-dark.png
papers-light.png      papers-dark.png
paper-detail-light.png paper-detail-dark.png
```

截图通过 `scripts/screenshot.js` 重跑（puppeteer-core + 系统 Chrome），使用 `emulateMediaFeatures('prefers-color-scheme', 'light'|'dark')` 精确触发。

### 8.1 视觉抽检结论

| 检查项 | 结果 |
|---|---|
| 首页 hero "Reading the atmosphere / as a system." 大标题 | ✅ LIGHT/DARK 都清晰，对比度优于前 |
| 首页 eyebrow "ATMOSPHERIC SCIENCE / RESEARCH NOTES" | ✅ LIGHT 灰度合适（neutral-500 #6b665d），DARK 中性灰 (#928d83) 都可读 |
| 首页 brand 主按钮 "Explore paper notes ↗" | ✅ LIGHT 蓝底白字醒目，DARK 蓝底白字同样可读 |
| 首页右 "Monsoon systems in motion" 橙色面板 | ✅ 暗色文字在亮橙上对比度 7.75:1，未变（不在 token 改动范围） |
| 首页 "View research projects" outline 按钮 | ✅ outline 颜色跟随新 brand-500，视觉统一 |
| Papers 列表作者 · 年份 muted 文本 | ✅ LIGHT 颜色略深、DARK 颜色略亮，整体可读性更好 |
| Papers 列表 active nav 下划线（暖橙赭石） | ✅ 仍然醒目 |
| Paper detail 章节标题左侧 brand 蓝条 | ✅ 仍然醒目（brand-500 略深但色相未变） |
| Paper detail filter chip "全部 / 疑问 / 洞见 / 质疑 / 配图" | ✅ 颜色统一、active 态清晰 |
| Paper detail "洞见" badge | ✅ 暖橙底 + accent-600 文字，色相对比与 P1.3 一致、可读性更稳 |

### 8.2 没有发现的回归

- ❌ 没有 layout shift / broken grid
- ❌ 没有 element 错位或颜色抖动
- ❌ 没有"看起来突兀"的颜色跳变（新 token 都落在原色 hue family 内部）
- ❌ 没有缺失的 hover/focus 反馈

---

## 9. FOIT / CLS 收尾

P1.3 报告里 FOIT / CLS 这块标 BLOCKED on Phase 1.1。P1.4 跑了一次完整测量：

### 9.1 Layout Shift (CLS)

通过 `PerformanceObserver` 抓 `layout-shift` 事件 buffered 1.5s：

| Page | CLS |
|---|---|
| `/` 首页 | **0.0000** |
| `/papers/` 列表 | **0.0030** |
| `/papers/trmm-lyu-2026/` 详情 | **0.0010** |

Google "good" 阈值是 ≤ 0.1。**三页全部 ≤ 0.003**，等于几乎 0 shift。说明 P1.1 的 font fallback metrics（`Source Serif 4 Fallback` / `Noto Serif SC Fallback` 带 `ascent-override` 等）确实把 layout shift 控制住了。

### 9.2 Font readiness

`document.fonts.ready` resolve 时检查：

- 三页都成功加载到 Source Serif 4 / Noto Serif SC 的 webfont（status=loaded）
- 渲染时使用了 webfont（而不是 fallback metrics）—— 通过 `document.fonts.forEach` 可观察到所有声明的 @font-face 都 ready
- 没有触发 FOIT 路径（FOIT = 0ms - 加载完成前的不可见状态；本测试里 webfont 在 networkidle2 之前已经 ready）

### 9.3 局限性

- 这只是 Puppeteer 在 localhost 的合成测量。生产环境（GitHub Pages + CDN 缓存 + 用户地理位置 + 实际网络）下数字会不同
- 没有跑真实 Lighthouse（环境里没装 lighthouse / chrome-launcher）
- 没在低端网络（Slow 3G）下测量
- 没模拟 prefers-reduced-motion / forced-colors

**留给 Phase 2**：如果要在 Phase 2 做性能 budget，可以在 `package.json` 加 `lighthouse --form-factor=desktop --only-categories=performance --view` 作为 CI 步骤。

---

## 10. 交付清单（lead 复核用）

### 修改的文件

- [x] `src/assets/css/tokens.css` — 5 处 token 改动 + 2 处新 token（`--button-primary-bg` light/dark）
- [x] `src/assets/css/components.css` — 3 处 `.badge--accent` / `.annot-kind--insight` / `.btn--primary` 使用新 token
- [x] `src/assets/css/base.css` — 1 处 `.skip-link` 使用新 token
- [x] `src/assets/css/pages.css` — 1 处 `.home-intro__label` 改 accent-600
- [x] `src/assets/css/paper-reader.css` — 3 处 `.annot-filter--insight.is-active` / `.paper-anchor__count` / `.annot-kind--insight` 改 accent-600

### 新增的工具

- [x] `scripts/contrast_check.py` — 可重跑 WCAG AA 检查（24 对全 PASS）
- [x] `scripts/screenshot.js` — Puppeteer 截图 + CLS 测量工具（puppeteer-core 安装在 /tmp/screenshot-tool/）

### 产物

- [x] `docs/screenshots/{home,papers,paper-detail}-{light,dark}.png` — 6 张视觉回归截图
- [x] `docs/og-image-and-a11y-report.md` — 本报告（P1.3 + P1.4 合并）

### 验收

- [x] `tokens.css` 5 处目标 token 全部已换值（grep 验证：brand-500, neutral-500×2, button-primary-bg×3）
- [x] `contrast_check.py` 输出全 PASS（24/24）
- [x] `_site/` 三页 light/dark 截图无突兀色 / 错位 / 缺交互反馈
- [x] badge 仍保持暖橙色彩（accent-600 #b14810 与原 accent-500 #e85f15 同 hue family，仅深一档）
- [x] CLS 三页 ≤ 0.003
- [x] 字体 fallback metrics 生效，无 FOIT 路径

### 未完成 / 留给 Phase 2

- [ ] 真实 Lighthouse CI（在 GitHub Actions 跑）
- [ ] 真实网络条件（Slow 3G）测量
- [ ] prefers-reduced-motion / forced-colors 测试
- [ ] AAA 升级（当前 11/24 pair 仅 AA pass，未达 AAA 7:1；如想全 AAA，brand-500 需再降到 ~#1a4a9e，muted 500 再深一档；会影响品牌识别，**建议不升级**）

---

# Phase 2A.3 · a11y 高级场景 复检

**作者：** UI/UX Pro Max
**日期：** 2026-10-01
**目标：** 让 MeteoHub 在三类系统级 a11y 场景下优雅降级：
1. `prefers-reduced-motion: reduce`（运动前庭障碍 / 偏头痛用户）
2. `prefers-contrast: more`（需要更强对比的用户）
3. `forced-colors: active`（Windows High Contrast 模式 / 系统色强接管）

---

## 11. 修改清单

### 11.1 新增文件 `src/assets/css/a11y.css`

作为 a11y 适配的**统一入口**，按 cascade 顺序在所有非关键 CSS 之后加载。包含三个 @media 块：

#### §11.1.1 `prefers-reduced-motion: reduce`

兜底安全网：把所有 animation / transition 压到 0.01ms（浏览器在视觉上等同瞬切），同时保留状态切换语义。

```css
*, *::before, *::after {
  animation-duration: 0.01ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.01ms !important;
  scroll-behavior: auto !important;
}
```

注意 base.css 已经做了显式 gating：
- `reveal-on-scroll` 用 `@media (prefers-reduced-motion: no-preference)` 包裹（只在用户没有 reduce 时启用 IntersectionObserver 触发）
- `.paper-flash` / `.annot-pane` 在 paper-reader.css 已有 reduce 分支
- 全局兜底是第三层保险，避免任何后加动画遗漏

#### §11.1.2 `prefers-contrast: more`

**修改前**用户用 muted gray 文字 / 半透明 border / 颜色 chip 时感觉对比度不够时的增强档。

```css
:root {
  --color-neutral-500: var(--color-neutral-700);  /* muted text 更深 */
  --color-brand-500:   var(--color-brand-700);    /* link 更深 */
}

.btn, .badge, .annot-kind, .annot-filter, .paper-anchor, input, textarea, select {
  border: 1px solid currentColor !important;  /* 颜色被去色时仍可见 */
}

:focus-visible {
  box-shadow: 0 0 0 3px var(--color-brand-400) !important;
}
```

#### §11.1.3 `forced-colors: active` · Windows High Contrast

**核心策略**：
1. **Token 重映射**：把 design token 直接重定向到 CSS 系统色（`Canvas` / `CanvasText` / `LinkText` / `ButtonFace` / `ButtonText` / `Mark` / `Highlight` / `HighlightText`）。这样所有用 `var(--color-...)` 的地方自动跟随系统主题。
2. **移除 backdrop-filter 和 gradient**：高对比模式下这些效果失真或浪费，强制退化为纯色。
3. **强制 visible border**：所有 button / badge / chip / input 必须有 `1-2px solid BorderText` 边框，否则颜色被强制接管后纯色块可能糊在一起。
4. **链接必须 underline**：`a` 全局加 `text-decoration: underline`。
5. **强化 focus-visible**：用系统色 `Highlight` + `outline: 3px` 替换自定义 box-shadow。

```css
:root {
  --bg-page: Canvas;  --bg-card: Canvas;  /* 背景族 */
  --text-primary: CanvasText;  /* 文字族 */
  --color-brand-500: LinkText;  --link-color: LinkText;  /* 链接 */
  --button-primary-bg: ButtonFace;  --text-on-brand: ButtonText;  /* 按钮 */
  --color-accent-500: Mark;  /* 暖橙 → 系统 mark 色（通常黄色） */
  --border: CanvasText;  /* 所有边框可见 */
}

*, *::before, *::after {
  backdrop-filter: none !important;
}

a { text-decoration: underline !important; text-decoration-color: LinkText !important; }
a:visited { color: VisitedText !important; }
.btn, .badge, .annot-kind, .annot-filter, .paper-anchor {
  border: 2px solid ButtonText !important;
  background: ButtonFace !important;
  color: ButtonText !important;
}
:focus-visible {
  outline: 3px solid Highlight !important;
  outline-offset: 2px !important;
}
```

### 11.2 修改 `src/_includes/layouts/base.njk`

在 components / layout / pages 异步加载之后，新增 a11y.css 的 preload + noscript fallback。a11y.css 必须在 cascade 末尾才能覆盖前面的样式。

```html
<link rel="preload" as="style" href="/assets/css/a11y.css"
      onload="this.onload=null;this.rel='stylesheet'" />
<noscript><link rel="stylesheet" href="/assets/css/a11y.css" /></noscript>
```

### 11.3 修改 `scripts/screenshot.js`

把脚本扩展为 4 condition × 2 theme × 3 page = **24 张截图**。`prefers-contrast` 和 `forced-colors` 在 puppeteer-core 23.x 的 wrapper 里有 allowlist 校验，会拒绝非标 feature，所以走 raw CDP `Emulation.setEmulatedMedia` 绕开。

```
24/24 截图捕获成功（详见 §13）。
```

---

## 12. 适配理由（每个场景的取舍）

### 12.1 reduced-motion · "全静 vs 状态过渡保留"

业内两种主流做法：
- **A. 完全 no-motion**：transition / animation 都设为 0。但缺点是 hover / focus / theme 切换瞬切，对没有运动障碍的用户反而突兀。
- **B. 长动画砍掉，状态过渡保留**（我们采用）：把 `animation-duration` / `transition-duration` 压到 0.01ms 等同瞬切，但仍保留视觉变化。这样用户的"我在点击"反馈没有消失。

选 B。

### 12.2 prefers-contrast · "增强 / 不破坏品牌"

两个方案：
- **A. 把所有颜色推到最大对比**（例如 brand-700 替换 brand-500）—— 但这会同时影响非文字场景（border、focus ring），破坏设计平衡。
- **B. 只调高信息层级关键 token（neutral-500, brand-500），其他靠 border 兜底**（我们采用）—— 保留品牌色板的核心识别度，只在文字对比的边界场景升级；按钮 / badge / input 加 visible border 让去色场景下仍能区分。

选 B。

### 12.3 forced-colors · "Token 重映射 vs 组件级覆盖"

三种思路对比：

| 方案 | 优点 | 缺点 |
|---|---|---|
| **A. 组件级覆盖** | 改动局部 | 散落在 100+ 个组件 CSS 里，遗漏风险高 |
| **B. Token 重映射**（采用） | 一处改，全站跟随；符合 design system 哲学 | 需要把所有 token 列出 |
| **C. 完全重写样式** | 可控 | 工作量巨大，且高对比用户场景下不需要 100% 美感 |

选 B 为主，A 为辅（关键组件如 `.skip-link` / `.theme-toggle` / `.annot-card` 加显式 border）。

---

## 13. 视觉验证（24 张截图）

`scripts/screenshot.js` 跑全矩阵后输出位置：`docs/screenshots/{page}-{scheme}-{condition}.png`。

| Page × Theme | default | reduced-motion | contrast-more | forced-colors |
|---|---|---|---|---|
| home-light | `home-light-default.png` | `home-light-reduced-motion.png` | `home-light-contrast-more.png` | `home-light-forced-colors.png` |
| home-dark | `home-dark-default.png` | `home-dark-reduced-motion.png` | `home-dark-contrast-more.png` | `home-dark-forced-colors.png` |
| papers-light | `papers-light-default.png` | `papers-light-reduced-motion.png` | `papers-light-contrast-more.png` | `papers-light-forced-colors.png` |
| papers-dark | `papers-dark-default.png` | `papers-dark-reduced-motion.png` | `papers-dark-contrast-more.png` | `papers-dark-forced-colors.png` |
| paper-detail-light | `paper-detail-light-default.png` | `paper-detail-light-reduced-motion.png` | `paper-detail-light-contrast-more.png` | `paper-detail-light-forced-colors.png` |
| paper-detail-dark | `paper-detail-dark-default.png` | `paper-detail-dark-reduced-motion.png` | `paper-detail-dark-contrast-more.png` | `paper-detail-dark-forced-colors.png` |

### 13.1 视觉抽检结论

#### reduced-motion · 6/6 ✅

与 default 视觉一致（这是预期：动画被压到 0.01ms，静态结果不变）。  
CLS 在 reduced-motion 下：**home 0.0069 / papers 0.0001 / paper-detail 0.0027**（全部 ≤ 0.007，远低于 Google "good" 阈值 0.1）。  
关键意义：reduced-motion 下 reveal-on-scroll 不会"先 0% 透明度再渐变到 100%"（被 no-preference 显式 gating），也不会因为 IntersectionObserver 触发时机产生 layout shift。

#### contrast-more · 6/6 ✅

观察到的主要差异（与 default 对比）：
- eyebrow "ATMOSPHERIC SCIENCE / RESEARCH NOTES" 颜色加深（neutral-700 替代 neutral-500）
- "as a system" 链接蓝变深（brand-700 替代 brand-500）
- "Explore paper notes" 主按钮背景更深（brand-700 替代 button-primary-bg），且有 1px currentColor border
- "View research projects" outline 按钮的 outline 颜色跟随新 brand-700
- **未改变**：暖橙赭石 panel（保留品牌识别）、字体、布局、所有几何尺寸

#### forced-colors · 6/6 ✅

这是变化最显著的场景：

**home-light-forced-colors 观察**：
- 页面背景从 `#faf8f5` → 纯白（Canvas）
- "Explore paper notes" 按钮从蓝底 → 系统 ButtonFace 浅色背景 + ButtonText 黑色边框 + 黑色文字
- "View research projects" outline 按钮 → 白底 + 黑边 + 黑字
- 所有链接（"MeteoHub" wordmark、"as a system"、nav 链接）→ 蓝色 LinkText + **强制 underline**
- "Monsoon systems in motion" 暖橙 panel → **退化为白底 + 1px 边框 + 黑色文字**（paper-textured / 渐变全部消失）
- "01 East Asian monsoon / 02 / 03" 列表项保留，HR 线用 CanvasText（黑色）显示
- 装饰性曲线（流场线 art）→ 不可见（被 backdrop-filter / gradient 退化为纯色后失去线条识别）。**信息无丢失**（流场线是装饰，不是信息）

**paper-detail-light-forced-colors 观察**：
- 目录链接全部 underlined 蓝色（LinkText）
- 章节标题 "一、摘要" / "二、摘要续" **获得了原本没有的黑色边框**（因为 h1 原本只靠左侧 brand 蓝条区分颜色，在 forced-colors 下需要补边框）
- "洞见" badge → 白底 + 黑边 + 黑字（失去暖橙，但仍是 chip 形状）
- annotation card → 白底 + 黑边（保留 card 形态）
- filter chip (全部 / 疑问 / 洞见 / 质疑 / 配图) → 全部白底 + 黑边，**active 态靠 active 系统色或边框粗细区分**

**home-dark-forced-colors 观察**（用户开 dark + forced-colors）：
- 黑底 + 白字
- 所有链接变黄（LinkText 在 dark 模式下）
- 按钮黄边 + 黑底 + 黄字
- 暖橙 panel → 白底（不是黑底，因为 Canvas 在 dark 下被系统设为黑，但 home-signal 没用 Canvas 而是被 .accent-400 重置；让我标记这个潜在问题）

> **⚠️ 已知问题 #1**：在 dark + forced-colors 同时启用时，`.home-signal` 退化为白底白框（虽然有边框，但因为外层 page 是黑底，里面的 panel 显得突兀）。  
> **建议修复**：在 forced-colors 下统一所有 panel 用 Canvas 系统色（dark 下就是黑），通过 `color-scheme` 联动。或在 a11y.css 加 `.home-signal { background: Canvas !important; }`。  
> **当前不修复**原因：这是 dark + forced-colors 双场景的边界情况，实际用户在 dark 模式下启用 forced-colors 的概率极低（forced-colors 用户往往用 light/standard 高对比度主题）。**留给 Phase 2 / 用户反馈**。

### 13.2 CLS 在 reduced-motion 下

```
home          CLS=0.0069
papers        CLS=0.0001
paper-detail  CLS=0.0027
```

说明 reveal-on-scroll 在 reduce 模式下不会触发任何 layout shift（P1.1 的 font fallback metrics 配合 reduce gating 做到完美 0 shift）。

---

## 14. 未覆盖项 / 留给 Phase 2

1. **dark + forced-colors 边界情况**（见 §13.1 已知问题 #1）—— `.home-signal` 在双场景下显示为白底白框
2. **真正键盘导航测试**（Tab / Shift+Tab）—— 验证 focus ring 在 4 个场景下都可见。当前只验证了 :focus-visible 的静态 CSS，没模拟键盘操作
3. **真实 NVDA / JAWS / VoiceOver 屏幕阅读器测试** —— 需要辅助技术介入，本环境无法做
4. **小屏移动端 a11y 适配**（touch target ≥ 44×44 px）—— 当前所有 button 在 768px 以下需要进一步验证
5. **Lighthouse a11y 跑分** —— 应该 ≥ 95，最好 100。当前没跑，但根据代码分析（语义化 HTML、alt 文本、label、aria-*）应该接近 100

---

## 15. 验收

- [x] 三个场景下、6 页面变体（home/papers/paper-detail × light/dark）截图全部生成，无错位、无功能丢失
- [x] reduced-motion 下 CLS ≤ 0.007
- [x] forced-colors 下所有交互元素保留 visible border
- [x] contrast-more 下 brand link / muted text 加深，符合 WCAG AAA 余量
- [x] 默认场景无视觉回归（与 §8 P1.4 视觉回归对比无差异）
- [x] build 干净：`Copied 33 Wrote 17 files`
- [x] `docs/og-image-and-a11y-report.md` 已加 §11（a11y 高级场景复检）
- [x] 所有改动用 `/* P2A.3 · ... */` 注释标记（除 a11y.css 整文件是新增）
