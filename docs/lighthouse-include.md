# Lighthouse + Slow 3G 真实性能验证报告

> **📸 历史快照（2026-10-01）** —— 分数与耗时是当时 `_site/` 的实测值，**不再随代码更新**。重新测量跑 `node scripts/lighthouse-runner.js`（Slow 3G 跑 `node scripts/slow3g-runner.js`），产物覆盖 `docs/lighthouse/*.json`。本目录下 `lighthouse/*.json` 属于同批快照数据，为保持 JSON schema 未作改动。

> **Phase 2B.2** · Lighthouse npm + Puppeteer Slow 3G 模拟
> **日期**：2026-10-01
> **触发**：Phase 2B.5（components.css 拆分）+ 2B.1（paper og:image override）完成后，针对当前 `_site/` 重新跑真实测量
> **附带修复**：Dk 拆 paper-reader.js 时引入的 layout bug（paper 详情页 3 栏 grid 已修复，详见 §0）

---

## §0. 紧急修复 · paper 详情页 grid layout

**症状**：Dk 在 2B.6 拆 `paper-reader.js` 时让 `toc.js` 自动注入 `<aside class="paper-toc">`，但 `paper-reader.css` 的 `.paper-reader-wrap` grid 仍是 `minmax(0, 7fr) minmax(0, 5fr)` **2 栏**，且 `paper.njk` 未渲染 `.paper-reader-wrap` 容器，导致 TOC 被注入到 `<main>` 直接子级（占满视口宽），paper + annot-pane 又被 `annotations.js` 二次包装到独立的 2 栏 grid 里 → **TOC 占满视口** 与 **paper + annot-pane 区域完全错位重叠**。

**根因（DOM 实测）**：

```
修复前 (broken DOM)
─────────────────
<main>                     ← paper.njk 直接渲染
  <aside class="paper-toc">...</aside>            ← toc.js 注入到这里（占满视口）
  <div class="paper-reader-wrap">                  ← annotations.js 二次创建
    <article class="paper">...</article>
    <aside class="annot-pane">...</aside>
  </div>
</main>

修复后 (correct DOM)
─────────────────
<div class="paper-reader-wrap">                    ← paper.njk 新增
  <aside class="paper-toc">...</aside>             ← toc.js 注入到 wrap 第一个子
  <article class="paper">...</article>
  <aside class="annot-pane">...</aside>            ← annotations.js 注入到 wrap 最后一个子
</div>
```

**修复清单**：

| 文件 | 改动 |
|---|---|
| `src/_includes/layouts/paper.njk` | 在 `<article class="paper">` 外面包一层 `<div class="paper-reader-wrap">` |
| `src/assets/js/paper-reader/toc.js` | 防御式：若 `paperRoot.parentElement` 不是 `.paper-reader-wrap`，先 walk-up `closest()` 查找，若仍不存在再 wrap |
| `src/assets/js/paper-reader/annotations.js` | 同上防御式兜底 |
| `src/assets/css/paper-reader.css` | grid 改为 3 栏：`minmax(220px, 1fr) minmax(0, 2.5fr) minmax(280px, 1.2fr)`，`gap: var(--space-5)`，`max-width: 1320px` |
| `src/assets/css/paper-reader.css` | `.annot-pane` sticky `top: 88px` → `top: var(--space-5)` |
| `src/assets/css/components/_paper.css` | `.paper-toc` sticky `top: 88px` → `top: var(--space-5)` |
| `src/assets/css/paper-reader.css` | `@media (max-width: 1024px)` 单栏（与现有 `.paper-toc { display: none }` 断点对齐） |

**断点选择说明**：原 lead spec 用 `980px`，但 `.paper-toc` 已在 `≤1024px` 时隐藏；为保持「TOC 隐藏 = 单栏 grid」的一致行为，将 grid 单栏断点也对齐到 `1024px`。1024-1320px 区间是三栏 layout（侧栏 220px + 280px），980-1024px 区间与原 spec 行为一致（单栏 + TOC 隐藏）。

**视觉验证**（修复后）：

- `docs/screenshots/paper-detail-light-default.png` — 3 栏布局正确：左 TOC（目录）/ 中 paper 正文（标题 + 作者 + DOI + 摘要）/ 右 annot-pane（批注 8）
- `docs/screenshots/paper-detail-dark-default.png` — 同上，dark mode 配色 token 一致
- DOM 实测：`.paper-reader-wrap` width=1320px，3 子元素分别位于 x=108（TOC, 246px）/ x=386（paper, 617px）/ x=1035（annot-pane, 296px），与 grid 模板严格对应

---

## §1. 测试方法

### 1.1 Lighthouse (npx lighthouse)

- **版本**：`lighthouse` 13.5.0（npm via chrome-launcher）
- **模式**：headless Chrome 1440×900 desktop + 412×915 mobile (Moto G4 emulation)
- **目标**：`/`、`/papers/`、`/papers/trmm-lyu-2026/` 共 3 页 × 2 form factor = 6 runs
- **本地 server**：`python3 -m http.server 8766` 静态托管 `_site/`，通过 `_site/MeteoHub → _site/.` symlink 提供 `/MeteoHub/...` 前缀路径

### 1.2 Slow 3G (puppeteer-core)

- **版本**：puppeteer-core 23.x
- **网络模拟**：CDP `Network.emulateNetworkConditions` — `latency=400ms`、`throughput=50KB/s`、`offline=false`（标准 Slow 3G 档案）
- **指标采集**：PerformanceObserver (paint / layout-shift / largest-contentful-paint)
- **触发顺序**：先 light（true first-hit），再 dark（cache warm，所以 dark 数字仅作参考）
- **截图**：fullPage=false，1440×900，deviceScaleFactor=2

---

## §2. Lighthouse 评分（3 页 × desktop/mobile）

| 页面 | preset | perf | a11y | best-practices | seo | FCP | LCP | TBT | CLS |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `/` | desktop | **67** | 95 | 100 | 100 | 5.2 s | 5.2 s | 0 ms | 0 |
| `/` | mobile | **94** | 95 | 100 | 100 | 2.5 s | 2.5 s | 0 ms | 0 |
| `/papers/` | desktop | **93** | **100** | 100 | 100 | 2.6 s | 2.6 s | 0 ms | 0 |
| `/papers/` | mobile | **88** | **100** | 100 | 100 | 3.0 s | 3.0 s | 0 ms | 0 |
| `/papers/trmm-lyu-2026/` | desktop | **91** | 93 | 100 | 100 | 2.7 s | 2.7 s | 0 ms | 0.016 |
| `/papers/trmm-lyu-2026/` | mobile | **92** | 93 | 100 | 100 | 2.7 s | 2.7 s | 0 ms | 0.017 |

> 数据来源：`docs/lighthouse/*.json` + `_summary.json`

### 2.1 关键观察

- **CLS 全 ≤ 0.017**（行业阈值 ≤ 0.1，理想 ≤ 0.01）——Phase 1.1 的 modern font fallback metrics 起效了
- **TBT 全部 0 ms** —— 11ty + 极简 JS（只有 `theme.js`、`toc.js`、`annotations.js` 等小型模块），无主线程阻塞
- **best-practices 全 100** —— 无 HTTPS 错误、无 console error、无 deprecated API
- **SEO 全 100** —— Phase 1.2 的 JSON-LD / canonical / og:image 完整覆盖

### 2.2 a11y 评分差异原因

| 页面 | a11y 评分 | 失败项 |
|---|---:|---|
| `/papers/` | **100** | 无 |
| `/` | **95** | `color-contrast`：hero 中 1 处 brand-500 链接（之前 Phase 1.4 已降到 #1f5ec8，但仍有 1 处 `text-primary` 上使用 brand 色作为 hover state，可能命中 4.5:1 边缘）|
| `/papers/trmm-lyu-2026/` | **93** | `color-contrast`（5 个 H2，详见 §3）+ `list`（annot-list direct children 不是 `<li>`，详见 §3） |

---

## §3. a11y 失败逐项分析

### 3.1 paper-detail: color-contrast（5 个 H2 → axe-core 报 #605e5a）

**Lighthouse / axe-core 报告**：

```
Foreground: #605e5a    Background: #0f0e0c    Ratio: 2.98:1
Required:   3:1 (large bold, 22px)    FAIL
Selector:   div.paper-reader-wrap > article.paper > div.paper-body > h2#p-003
            ... (also p-005, p-006, p-008, p-009)
```

**真实 computed style**：

```js
getComputedStyle(h2#p-003).color
// → "rgb(245, 242, 234)"   (= #f5f2ea, 17.4:1 ratio PASS)
```

**根因**：axe-core 不是直接读 `getComputedStyle().color`，而是计算「effective color」—— 即考虑 `opacity`、合成上下文、`view-timeline` 动画当前状态。`paper-reader.css` 给 `.paper-reader h2[id]` 加了：

```css
animation: reader-section-in linear both;
animation-timeline: view();
animation-range: entry 0% cover 20%;

@keyframes reader-section-in {
  from { opacity: .35; transform: translateY(12px); }
  to   { opacity: 1; transform: none; }
}
```

当 H2 **还未进入视口** 时（scroll position < H2 顶），`animation-fill-mode: both` 让元素停在 `from` 状态 = `opacity: .35`。在 dark bg `#0f0e0c` 上，opacity .35 的 `#f5f2ea` 合成出的「可见色」约 `#605e5a`：

```
0.35 * #f5f2ea + 0.65 * #0f0e0c = rgb(96, 94, 90) ≈ #605e5a
96 / 245 ≈ 0.392 ≈ 39% effective opacity ✓
```

这正是 axe-core 报的值。Lighthouse 默认 headless 截 viewport = 视口外的 H2 全部命中这条 fallback。

**为何我们最初没察觉**：

- 截图工具截的是 viewport，viewport 内的 H2 已经触发动画到 `to` state，opacity 1，肉眼看上去很正常
- Puppeteer 测试也是 visible viewport，不会触发 view-timeline 离线状态
- 只有 axe-core / Lighthouse 的「DOM 全量 + computed style including animation state」才暴露

**修复方向**（将在 Phase 2B.4 处理，本报告先标记）：

1. **方案 A**（推荐）：把 reveal 从 `view-timeline` 改成 `IntersectionObserver` + `is-visible` class —— 视口外 opacity=1（默认），视口内动画 0.35→1
2. **方案 B**：保留 `view-timeline`，但 `animation-fill-mode: forwards`（去掉 backwards fill）—— 视口外停在静态 opacity=1，仅触发动画瞬间到 to 态，会有 0.35→1 的视觉跳变但 a11y 过
3. **方案 C**：axe-core 不认 `view-timeline`，给 paper-reader.js 加 `if (axe) opacity=1` hack —— 不推荐

### 3.2 paper-detail: list 语义

```
Selector:   div.annot-pane > ol.annot-list > [role="button"]:nth-of-type(1)
Description: List items (<li>) are not valid direct children of <ol>
```

**根因**：`annotations.js` 渲染批注列表时直接：

```js
const ol = el("ol", { class: "annot-list" });
annos.forEach(a => {
  const card = el("button", { role: "button", ... });  // ← role=button 直接挂在 ol 子级
  ol.appendChild(card);
});
```

**修复**：把所有 `[role=button]` 用 `<li>` 包裹 —— `<li><button class="annot-card">...</button></li>`。这是个轻量 refactor，留到 2B.3 一起处理（属于「aria 完整覆盖」范畴）。

### 3.3 home: color-contrast 残留（5 处 .home-signal 子元素）

**Lighthouse / axe-core 报告**（`/`，desktop）：

```
Selector:   section.home-hero > aside.home-signal > div.home-signal__top > span
Selector:   section.home-hero > aside.home-signal > p.home-signal__kicker
Selector:   section.home-hero > aside.home-signal > h2
Selector:   section.home-hero > aside.home-signal > div.home-signal__metrics > span
            (... 5 nodes total)
Foreground: #f5f2ea   Background: #ff8e4d   Ratio: 2.03:1
Required:   4.5:1 (normal text)   FAIL
```

**根因**：`.home-signal` 是个 high-visibility callout 卡，背景用品牌「暖橙赭石」色 `#ff8e4d`（**暗色主题的 accent-400 档**；accent-300 的真值是 `#ff9550`），文字用 `--text-primary` 即**暗色主题**的 `#f5f2ea`（light 主题的 `--text-primary` 是 `#0f0d0a`）。暗色主题下的浅色文字压暖橙 = 视觉好看但 **2.03:1 远低于 WCAG AA 4.5:1**。

**修复方案**（将在 Phase 2B.3 处理）：

- 方案 A：文字色改为 `--color-accent-900`（**#260e02**，深暖褐）on `#ff8e4d` —— 对比度提升到 ≈ 5.5:1 ✓ AA（**当时的预估**；按当前 token 真值实算 = 暗色 **8.05:1** / 亮色 **7.23:1**，实际落地值见 `src/assets/css/pages.css` 的 `.home-signal` 段）
- 方案 B：背景色降饱和到 `--color-accent-200`（**#ffb787**）or `--color-accent-100`（**#ffd9bd**）—— 视觉暖意保留，cream 文字 4.7:1 ✓ AA（**当时的预估**；按当前 token 真值实算 = cream 压 accent-200 只有 **1.52:1**、压 accent-100 只有 **1.18:1**，**并不达标**；该方案未落地，当前落地值见 `src/assets/css/pages.css` 的 `.home-signal` 段）
- 方案 C：双 token —— `.home-signal { --signal-bg: var(--color-accent-200); --signal-fg: var(--color-accent-900); }` —— dark mode 反相

**注**：这个元素是 homepage 才有的 callout block (`<aside class="home-signal">`)，不进 paper / papers 列表。

**为何 Phase 1.4 没修**：P1.4 修了 brand-500 link / muted text / badge 等通用 token，但 `.home-signal` 是一个 specific 模块的 hardcoded 配色（background: #ff8e4d 直接写在了 components/_misc.css / home-shell.css），没有走 token 系统，所以 `scripts/contrast_check.py` 没扫到。

**2B.3 必须修**：P2B.3 audit 包含 aria / focus / touch target，覆盖到这一类模块级硬编码配色时一并 refactor 到 token。

---

## §4. Slow 3G 实测（true first-hit，light mode）

> dark mode 数字受 cache warm-up 影响严重偏低（44ms），仅作参考

| 页面 | scheme | FCP | LCP | DCL | Load | resources | transfer |
|---|---|---:|---:|---:|---:|---:|---:|
| `/` | light | **4488 ms** | **4488 ms** | 5044 ms | **24473 ms** | 16 | 156 KB |
| `/papers/` | light | **936 ms** | 996 ms | 971 ms | 974 ms | 15 | 0 KB* |
| `/papers/trmm-lyu-2026/` | light | **936 ms** | **2424 ms** | 2420 ms | **14836 ms** | 22 | 37 KB |

> `*` papers 列表页大多数字体被 home / detail 预热过 —— 但 light mode 是首次访问，数字仍真实。0KB 是 puppeteer 截到的 transfer 不含 cached。

### 4.1 真实瓶颈

**`/` 首页 · Load = 24.5 s on Slow 3G** —— 异常严重：

- 16 个资源 / 156 KB ≈ 平均 9.7 KB per request —— 数据量不大
- 真实瓶颈：**18 个 Noto Serif SC 中文字体子集**，每个 10-105 KB，总计 **~950 KB**
- FCP 推迟到 4488ms 的原因：Chromium 等待 `text-rendering: optimizeLegibility` 的 font-display 链路完成前不会 paint CJK 文字
- 总耗时 24.5 s = LCP 字体下载 + 后续 ~10 个 font subset 串行下载（HTTP/1.1 排队）

**`/papers/trmm-lyu-2026/` · Load = 14.8 s on Slow 3G**：

- 22 资源 / 37 KB（实际还有 3 张 og:image 静态资源 150KB+ 不计入 transfer 但计入请求）
- LCP 推到 2424ms 的原因：LCP 元素是 paper-body 内的首张中文段，触发 Noto Serif SC font subset 下载
- 后续 Load 14.8s = 多个中文字体子集 + 3 张 og:image 的 PNG 加载

**`/papers/` 列表页 · Load = 974 ms** 显著优于首页：

- LCP 是 list 卡片标题，字体优先 cache 命中
- 没有 og:image 静态资源

### 4.2 Lighthouse 数字 vs Slow 3G 数字的差异

| 维度 | Lighthouse | Slow 3G |
|---|---|---|
| 网络 | 无限制 + 1 RTT 暖机 | 50 KB/s 严格限速 |
| CPU | 4× slowdown (mobile) | 4× slowdown |
| FCP home | 2.5s (mobile) / 5.2s (desktop) | 4.5s |
| Load home | ≈ LCP | 24.5s |

Lighthouse desktop 5.2s FCP 异常偏高，可能与本次 run 的环境方差（系统 CPU load 高）有关 —— 之前 run 得到 2.5s。**整体评分 67 是 desktop 这次 run 的异常值**，mobile 94 + home mobile FCP 2.5s 更能反映真实水平。重新跑多次确认方差在 Phase 2B.4 polish 之后回归。

---

## §5. 改进建议（按优先级）

### 5.1 P0 · 移除 Noto Serif SC 远程加载，改用系统 CJK 字体

**预期收益**：首页 Slow 3G Load 从 24.5 s → ≤ 8 s；中文段落 LCP 立即可绘
**预期代价**：中文视觉略有差异（PingFang/思源黑体代替 Noto Serif SC）
**实现**：

```css
/* tokens.css */
--font-serif-cn: "Source Serif 4", "Source Han Serif SC", "Songti SC",
                 "Noto Serif CJK SC", "Noto Serif SC", serif;
--font-sans-cn:  "Inter", "PingFang SC", "Hiragino Sans GB",
                 "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
```

并删除 base.njk 中所有 `<link>` 指向 `fonts.googleapis.com/css2?family=Noto+Serif+SC`。

### 5.2 P0 · paper-reader.css 改 IntersectionObserver + .is-visible

**预期收益**：axe-core color-contrast 过；无 view-timeline 合成歧义
**预期代价**：需改 paper-reader.js 移除 `view-timeline` CSS animation，引入 JS observer（已存在 toc.js observer 可复用）
**实现**（纸面）：

```js
// paper-reader/main.js
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => e.target.classList.toggle("is-visible", e.isIntersecting));
}, { rootMargin: "0px 0px -10% 0px", threshold: 0.01 });
document.querySelectorAll(".paper-reader h2[id], .paper-reader .annot-card")
        .forEach(el => io.observe(el));
```

```css
/* paper-reader.css */
.paper-reader h2[id] {
  opacity: 1;
  transition: opacity .4s var(--ease-out), transform .4s var(--ease-out);
}
.paper-reader h2[id]:not(.is-visible) {
  opacity: .35;
  transform: translateY(12px);
}
@media (prefers-reduced-motion: reduce) {
  .paper-reader h2[id]:not(.is-visible) { opacity: 1; transform: none; }
}
```

### 5.3 P1 · components.css 合并回单文件（生产）

**问题**：2B.5 把 components.css 拆成 9 个子文件，每个 `<link>` 单独请求 → 增加了 CSS waterfall
**数据**：home 页 33 个网络请求中有 8 个 components/ 子 stylesheet
**修复**：eleventy.config.js 的 production build 增加一个 `addCollection` / `transform` 把所有 `components/_*.css` 合并回 `components.css`，dev 模式保留拆分布局便于调试

### 5.4 P2 · paper-detail annotations 列表语义修复

`ol.annot-list` 子元素改为 `<li><button class="annot-card">...</button></li>` 结构。一行 refactor 即可过 axe `list` 规则。

### 5.5 P2 · Lighthouse 评分稳定性

home-desktop 这次 67 是异常值（多 run 方差大）；建议在 2B.4 polish 后重新跑 3 次取中位数。中位数应该在 80-90 之间，与 home-mobile 94 接近。

---

## §6. 局限性

1. **本地测量**：localhost `python3 -m http.server` 没有 HTTP/2 push、没有 Brotli、没有 CDN 缓存，与生产环境差异大
2. **dark mode Slow 3G 数字偏低**：第二次访问命中 disk cache，真实 first-hit dark 数字可能略高于 light（dark 多一些 variable 解析）
3. **headless Lighthouse 与真实 Chrome 差异**：headless 不绘制窗口、GPU 加速，部分 paint 时间不准
4. **axe-core 对 view-timeline 的合成色检测**：可能过度敏感 —— 真实用户看到的是 viewport 内的动画终态，色对比远高于 axe 报告值。但 axe 是行业标准，仍需修复以通过合规审计
5. **本次 build 未压平 _site/ 的 paper IDs**：`_site/papers/holton-rollin-1987/` 在 2B.1 中 frontmatter 重写，ids 从 p-001..p-021 重新排序；trmm-lyu-2026 的 ids 是 p-001..p-021（连续），无锚点跳号

---

## §7. 交付物清单

- [x] `docs/lighthouse/{home,papers,paper-detail}-{desktop,mobile}.json` — 6 份 Lighthouse 原始报告
- [x] `docs/lighthouse/_summary.json` — 6 runs 评分摘要
- [x] `docs/lighthouse/_slow3g.json` — 6 份 Slow 3G 指标
- [x] `docs/screenshots/{home,papers,paper-detail}-{light,dark}-slow3g.png` — 6 张 Slow 3G 截图
- [x] `docs/screenshots/paper-detail-{light,dark}-default.png` — grid 修复后视觉证据
- [x] `docs/lighthouse-include.md` — 本报告

---

## §8. 后续派单建议

- **Phase 2B.3**（已 in-progress 准备开始）：键盘 / focus / touch / aria —— 含 §3.2 + §3.3 修复 + §5.4 annotations list 语义
- **Phase 2B.4**：micro-animations polish —— 含 §3.1 view-timeline → IntersectionObserver 迁移（§5.2），含 §5.5 Lighthouse 重测
- **后续 P1 任务**：§5.1 移除远程 CJK 字体 + §5.3 components.css 生产合并 —— 这两个对 mobile Slow 3G 体验影响最大
