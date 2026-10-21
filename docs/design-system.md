# MeteoHub · 视觉设计系统规范 v1.0

> 适用对象：中科院大气物理研究所 · 个人学术站点  
> 模块：作品集（Portfolio）/ 博客（Blog）/ 论文精读（Papers with annotations）/ 关于（About）/ 首页（Index）  
> 技术栈：纯静态 HTML + CSS + 原生 JS（GitHub Pages / Vercel / 自家服务器均可托管）  
> 文档版本：v1.0 · 2026-09-24

> **与 `src/assets/css/tokens.css` 的关系**：本文档是**规范源**，`tokens.css` 是**可执行事实源**。两者不一致时以 `tokens.css` 为准 —— 因为可访问性调优（P1.4 WCAG AA 对比度）改过几档色值，改的是代码、同步回本文档的。核对 token 是否落到了页面上，请直接读 `tokens.css`。

---

## 一、设计语言概述

### 1.1 一句话定位

> **"像一份认真写出的论文排版，被专业地拿上台面。"**

### 1.2 关键词

- **学术严肃性（Scholarly rigor）**：行距舒适、层级清晰、配色克制
- **大气科学的视觉暗示（Atmospheric cues）**：流场蓝 + 暖色赭石的冷暖对照，模拟「温度场」；可选用细线等值线作为底纹
- **现代编辑感（Editorial modern）**：大字号标题、可控的中文/西文混排、强调可读性
- **手作温度（Hand-crafted warmth）**：避免冰冷 SaaS 模板感，引用块、批注等元素带一点纸质感

### 1.3 不做什么（Anti-patterns）

| ❌ 避免 | 原因 |
|---|---|
| 单一蓝紫渐变 | 太泛滥，与「大气科学」缺乏区分度 |
| Emoji 当作图标（🎨🚀） | 不专业，对屏幕阅读器不友好 |
| 全屏大背景视频 | 加重首屏负担，对学术读者干扰 |
| 过度玻璃拟态（backdrop-blur 处处用） | 影响长文阅读的对比与清晰度 |
| 给每段都加阴影/边框 | 视觉噪音 |
| 圆角 16px+ 的"圆滑设计" | 与学术调性不符 |

---

## 二、配色系统（Color Tokens）

### 2.1 设计意图

主色 **「流场蓝」** 取自大气环流图的等值线蓝，温度感偏冷，象征理性与运动；  
辅色 **「暖橙赭石」** 取自气象雷达与温度色阶，象征热力、对照、张力；  
中性色走 **沙岩灰** 路线，偏暖灰，避免数字产品的"铅灰"冷感；  
状态色（success / warning / danger / info）从辅色派生。

### 2.2 Light 模式 CSS 变量

```css
:root {
  /* —— Brand · 流场蓝 —— */
  --color-brand-50:  #eaf3ff;
  --color-brand-100: #cce0ff;
  --color-brand-200: #99c2ff;
  --color-brand-300: #66a4ff;
  --color-brand-400: #3a86ff;   /* PRIMARY（流场蓝主色） */
  --color-brand-500: #1f5ec8;   /* 为 AA 链接对比度下调（原 #256ef0 4.34:1 → 现 5.67:1） */
  --color-brand-600: #1a55c2;
  --color-brand-700: #143e93;
  --color-brand-800: #0e2c6b;
  --color-brand-900: #091b44;

  /* —— Accent · 暖橙赭石 —— */
  --color-accent-50:  #fff3eb;
  --color-accent-100: #ffd9bd;
  --color-accent-200: #ffb787;
  --color-accent-300: #ff9550;
  --color-accent-400: #ff7e33;  /* ACCENT（赭石主色） */
  --color-accent-500: #e85f15;
  --color-accent-600: #b14810;
  --color-accent-700: #7a320a;
  --color-accent-800: #4a1d05;
  --color-accent-900: #260e02;

  /* —— Sage · 数据/观测强调（克制使用） —— */
  --color-sage-300: #a4c8a4;
  --color-sage-500: #6f9e6f;
  --color-sage-700: #446844;

  /* —— Neutral · 沙岩暖灰 —— */
  --color-neutral-0:   #ffffff;
  --color-neutral-50:  #faf8f5;   /* 纸张白 */
  --color-neutral-100: #f2efea;   /* 背景层 */
  --color-neutral-200: #e6e2db;   /* 边框 */
  --color-neutral-300: #d1ccc3;   /* 弱边 */
  --color-neutral-400: #a8a298;   /* 占位符 */
  --color-neutral-500: #6b665d;  /* 次要文字 · 为 AA muted text 下调（原 #7d776d 4.19:1 → 现 5.38:1） */
  --color-neutral-600: #575049;   /* 副标题 */
  --color-neutral-700: #38332d;   /* 正文 */
  --color-neutral-800: #221f1b;   /* 强正文 */
  --color-neutral-900: #0f0d0a;   /* 标题 */

  /* —— Semantic State —— */
  --color-success: #4f9e6e;
  --color-warning: #d99a2b;
  --color-danger:  #c84a3a;
  --color-info:    var(--color-brand-400);
  --button-primary-bg: #1453d8;   /* brand 主按钮底色（白字 6.44:1 · AA pass） */

  /* —— 文本 / 链接 —— */
  --text-primary:   var(--color-neutral-900);
  --text-secondary: var(--color-neutral-600);
  --text-muted:     var(--color-neutral-500);
  --text-accent:    var(--color-accent-600);   /* 强调色作文字用（暗色主题覆写为 accent-500） */
  --text-on-brand:  #ffffff;
  --link-color:     var(--color-brand-500);
  --link-hover:     var(--color-brand-700);

  /* —— 背景 —— */
  --bg-page:       var(--color-neutral-50);   /* 主背景（纸张白） */
  --bg-surface:    var(--color-neutral-0);    /* 卡片 */
  --bg-elevated:   var(--color-neutral-0);
  --bg-muted:      var(--color-neutral-100);  /* 代码块、引用块 */
  --bg-subtle:     var(--color-brand-50);     /* 高亮行 */

  /* —— 边框 —— */
  --border-subtle: var(--color-neutral-200);
  --border-default: var(--color-neutral-300);
  --border-strong: var(--color-neutral-500);

  /* —— 阴影（浅/中/强 三档 + 焦点环） —— */
  --shadow-1: 0 1px 2px rgba(15, 13, 10, .04),
              0 1px 1px rgba(15, 13, 10, .03);
  --shadow-2: 0 4px 12px rgba(15, 13, 10, .06),
              0 2px 4px rgba(15, 13, 10, .04);
  --shadow-3: 0 16px 40px rgba(15, 13, 10, .10),
              0 4px 12px rgba(15, 13, 10, .06);
  /* 焦点环是**双色**：内圈与页面底强对比，外圈取调色板另一极兜底 ——
     单一颜色在本站的多种底色上不可能同时达到 3:1（旧的 35% 半透明蓝实测
     浅色底 1.48:1 / 暗色底 1.78:1 / 主按钮底 1.25:1）。
     两个 token 都指向**会被暗色块重映射**的色阶 token，
     所以暗色主题自动取到「内浅外深」的对称一组值，无需逐主题覆写。 */
  --focus-ring-inner: var(--color-brand-800);
  --focus-ring-outer: var(--color-neutral-0);
  --shadow-focus: 0 0 0 2px var(--focus-ring-inner), 0 0 0 4px var(--focus-ring-outer);
}
```

### 2.3 Dark 模式 CSS 变量

> 默认通过 `prefers-color-scheme: dark` 触发，同时保留 `[data-theme="dark"]` 手动覆盖钩子（让 Topbar 上的切换按钮能改写）。

```css
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    /* 暗色：背景接近 #0F0E0C，黑而不死 */
    --color-brand-50:  #0e1a35;
    --color-brand-100: #142649;
    --color-brand-200: #1b386a;
    --color-brand-300: #24528f;
    --color-brand-400: #4d97ff;     /* 略提亮，保证对比 */
    --color-brand-500: #6baaff;
    --color-brand-600: #95c4ff;
    --color-brand-700: #c0dbff;
    --color-brand-800: #dbeaff;
    --color-brand-900: #ecf3ff;

    --color-accent-50: #2a1408;    /* 底色档：浅色值是亮奶白，暗色必须压暗（否则暗色正文压上去只有 1.03:1） */
    --color-accent-400: #ff8e4d;    /* 提亮的赭石 */
    --color-accent-500: #ffa874;

    --color-neutral-0:   #0f0e0c;    /* 主背景 */
    --color-neutral-50:  #161513;    /* 页面 */
    --color-neutral-100: #1d1c19;    /* 卡片 */
    --color-neutral-200: #2a2825;    /* 边框 */
    --color-neutral-300: #3a3833;    /* 弱边 */
    --color-neutral-400: #5a5750;    /* 占位符 */
    --color-neutral-500: #928d83;   /* 次要文字 · 为 AA muted text（dark）上调（原 #807c72 4.38:1 → 现 5.49:1） */
    --color-neutral-600: #a8a498;    /* 副标题 */
    --color-neutral-700: #d2cfc6;    /* 正文 */
    --color-neutral-800: #e6e3da;    /* 强正文 */
    --color-neutral-900: #f5f2ea;    /* 标题 */

    --text-primary:   var(--color-neutral-900);
    --text-secondary: var(--color-neutral-600);
    --text-muted:     var(--color-neutral-500);
    --text-accent:    var(--color-accent-500);
    --link-color:     var(--color-brand-400);
    --link-hover:     var(--color-brand-300);

    --bg-page:       var(--color-neutral-0);
    --bg-surface:    var(--color-neutral-100);
    --bg-muted:      #14131180;
    --bg-subtle:     #1a2336;

    --border-subtle: var(--color-neutral-200);
    --border-default: var(--color-neutral-300);

    --shadow-1: 0 1px 2px rgba(0,0,0,.4);
    --shadow-2: 0 4px 12px rgba(0,0,0,.5), 0 2px 4px rgba(0,0,0,.4);
    --shadow-3: 0 16px 40px rgba(0,0,0,.6), 0 4px 12px rgba(0,0,0,.4);
    --shadow-focus: 0 0 0 2px var(--focus-ring-inner), 0 0 0 4px var(--focus-ring-outer);

    /* —— Semantic State（暗色下的覆写值） —— */
    --color-success: #6fb988;
    --color-warning: #e5b257;
    --color-danger:  #e06757;
    --button-primary-bg: #2563eb;   /* 浅色用的 #1453d8 在暗背景上仅 2.72:1，违反 AA */
  }
}

[data-theme="dark"] {
  /* 显式开关：覆盖 prefers-color-scheme */
  --text-primary:   var(--color-neutral-900);
  /* ……上面那套暗色变量在 tokens.css 里逐条列全了，此处只示意其中一条 —— */
}
```

### 2.4 配色对比一览表

| Token | Light（HEX） | Light 用途 | Dark（HEX） | 用途一致性 |
|---|---|---|---|---|
| `--text-primary` | `#0F0D0A` | 标题 | `#F5F2EA` | 标题 |
| `--text-secondary` | `#575049` | 副标题 | `#A8A498` | 副标题 |
| `--text-muted` | `#6B665D` | 元信息 | `#928D83` | 元信息 |
| `--color-brand-400` | `#3A86FF` | 主色 CTA / 链接 | `#4D97FF` | 主色 |
| `--color-accent-400` | `#FF7E33` | 强调 / 数值高亮 | `#FF8E4D` | 强调 |
| `--bg-page` | `#FAF8F5` | 页面 | `#0F0E0C` | 页面 |
| `--bg-surface` | `#FFFFFF` | 卡片 | `#1D1C19` | 卡片 |
| `--border-subtle` | `#E6E2DB` | 弱边界 | `#2A2825` | 弱边界 |
| success | `#4F9E6E` | 成功 | `#6FB988` | 成功 |
| warning | `#D99A2B` | 警告 | `#E5B257` | 警告 |
| danger | `#C84A3A` | 错误 | `#E06757` | 错误 |

**对比度核对（WCAG AA）**：

- 正文 `#38332D` on 背景 `#FAF8F5` → 对比度 ≈ 11.8 : 1 ✅ AAA
- 链接 `#1F5EC8` on 背景 `#FAF8F5` → 对比度 ≈ 5.7 : 1 ✅ AA（原 `#256EF0` 仅 4.34 : 1，不达 AA，已下调）
- 暗色正文 `#F5F2EA` on `#0F0E0C` → 对比度 ≈ 17.3 : 1 ✅ AAA

---

## 三、字体系统（Typography）

### 3.1 字体家族

| 角色 | 中文 | 英文 | 备选 |
|---|---|---|---|
| Serif · 正文/标题 | **思源宋体** Source Han Serif / Noto Serif SC | **Source Serif 4** | 苹方-繁 fallback |
| Sans · UI / 导航 | **苹方（PingFang SC）** / 思源黑体 | **Inter** | system-ui |
| Mono · 代码 | — | **JetBrains Mono** | ui-monospace |

> **JavaScript 加载策略**：  
> - 优先外链 Google Fonts（思源宋体 SC 与 Inter 都有覆盖全字符的 woff2）。  
> - 若需要在国内网络更快加载，可换 `https://fonts.loli.net` 或自托管到 `src/assets/fonts/`（该目录已存在但当前为空，字体放进去会被 passthrough 拷到 `_site/assets/fonts/`）。

```css
/* Google Fonts 完整外链 */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Serif+SC:wght@400;500;700&family=Source+Serif+4:wght@400;600&family=JetBrains+Mono:wght@400;500&display=swap');

:root {
  --font-serif-cn: 'Noto Serif SC', 'Noto Serif SC Fallback', 'Songti SC', 'STSong', serif;
  --font-serif-en: 'Source Serif 4', 'Source Serif 4 Fallback', 'Source Han Serif SC', 'Noto Serif SC', serif;
  --font-sans-cn:  'PingFang SC', 'Microsoft YaHei', 'Hiragino Sans GB', sans-serif;
  --font-sans-en:  'Inter', system-ui, -apple-system, 'Helvetica Neue', sans-serif;
  --font-mono:     'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;

  --font-body:   var(--font-sans-cn), var(--font-sans-en);   /* UI/正文默认无衬线 */
  --font-editorial: var(--font-serif-cn), var(--font-serif-en); /* 文章长文用衬线 */
  --font-code:   var(--font-mono);
}
```

**长文（博客、论文精读）切换规则**：默认页面用 sans，进入 `article` 容器后切到 `editorial serif`，可读性显著提升。

### 3.2 字号阶梯（Type Scale）

> 基准 1rem = 16px，行高 1.7。比例 1.25（Major Third）。

| Token | rem | px | 行高 | 字重 | 用途 |
|---|---|---|---|---|---|
| `--fs-display`  | 3.815rem | 61px | 1.15 | 700 | Hero 主标题 |
| `--fs-h1`       | 2.488rem | 40px | 1.20 | 700 | 页面标题 |
| `--fs-h2`       | 2.074rem | 33px | 1.25 | 700 | 章节标题 |
| `--fs-h3`       | 1.728rem | 28px | 1.30 | 600 | 子章节 |
| `--fs-h4`       | 1.440rem | 23px | 1.35 | 600 | 卡片标题 |
| `--fs-h5`       | 1.200rem | 19px | 1.40 | 600 | 小标题 |
| `--fs-body-lg`  | 1.125rem | 18px | 1.70 | 400 | 长文正文 |
| `--fs-body`     | 1.000rem | 16px | 1.70 | 400 | 卡片正文 / UI |
| `--fs-small`    | 0.875rem | 14px | 1.60 | 400 | 元信息、标签 |
| `--fs-caption`  | 0.750rem | 12px | 1.50 | 400 | 版权、注脚 |

```css
h1 { font-size: var(--fs-h1); font-weight: 700; line-height: 1.2; }
h2 { font-size: var(--fs-h2); font-weight: 700; line-height: 1.25; }
/* …依此类推 */
```

### 3.3 行高 / 字距 / 段落

```css
:root {
  --lh-tight: 1.25;   /* 标题 */
  --lh-base:  1.70;   /* 正文 */
  --lh-loose: 1.85;   /* 大段说明、引文 */
  --tracking-tight:  -0.015em;  /* 标题压缩 */
  --tracking-base:    0;
  --tracking-loose:   0.02em;   /* 中文小字号微舒展 */

  --measure: 72ch;    /* 单段最长字符（含中文） */
}

p, li { line-height: var(--lh-base); }
.prose { max-width: var(--measure); margin-inline: auto; }
.lede { font-size: var(--fs-body-lg); color: var(--text-secondary); }
```

### 3.4 现代排版规则（text-wrap / orphans / 数字对齐 / 中西间距）

> 浏览器支持基线：Chrome 114+ / Safari 17.5+ / Firefox 121+。旧版浏览器自动 fallback 到正常换行，不影响可读性。

```css
/* 标题：避免末行单词/单字孤悬 */
h1, h2, h3, h4, h5, h6 { text-wrap: balance; }

/* 正文 / 列表 / 引文：克制地避免末行单词孤儿 + 段首/段尾 2 行保底 */
p, li, blockquote {
  text-wrap: pretty;
  orphans: 2;
  widows: 2;
}

/* body 默认 proportional-nums（优雅数字），日期/年份/表格场景
   由具体选择器 opt-in 等宽数字对齐（font-variant-numeric: tabular-nums） */
body { font-variant-numeric: proportional-nums; }

/* 现代浏览器默认会在 CJK ↔ Latin 之间留小间距；显式声明以便行为变化时一致 */
body { text-autospace: normal; }
```

**应用矩阵**：

| 选择器 | text-wrap | orphans/widows | tabular | 备注 |
|---|---|---|---|---|
| `h1`-`h6` | balance | — | — | 标题多行均匀分布 |
| `p` / `li` / `blockquote` | pretty | 2 / 2 | — | 印刷级排版守则 |
| `.list__title` / `.list__meta` | pretty | — | ✓ | 卡片标题 + 日期 |
| `.paper-head__meta` | — | — | ✓ | 论文页头多段数字同行 |
| `.paper-reader p` | pretty | 2 / 2 | ✓ | 论文正文段 |
| `.home-hero__lede` / `.home-intro__body p` | pretty | 2 / 2 | — | 首页长叙事 |
| `.prose` | — | — | — | 长文容器（about / 404），`max-width: var(--measure)` |

### 3.5 中英文混排规则

- 标题：中文优先，必要时 `font-feature-settings: "kern" 1;`
- 中英间自动加 1/4 空格（` `）—— 非强制，但编辑器可加 lint
- 数字与单位之间不空格，如 `500hPa`、`2026年`
- 引号统一：中文用「」和『』，英文用 ""

---

## 四、间距系统（Spacing）

### 4.1 间距网格（基于 4px）

```css
:root {
  --space-0:  0;
  --space-1:  4px;
  --space-2:  8px;
  --space-3:  16px;
  --space-4:  24px;
  --space-5:  32px;
  --space-6:  48px;
  --space-7:  64px;
  --space-8:  96px;
  --space-9:  128px;

  /* 复合间距 / 容器 */
  --container-narrow: 720px;   /* ~ 72ch */
  --container-base:   960px;   /* 文章正文 */
  --container-wide:  1200px;   /* 卡片网格 / Portfolio */
  --gutter:          clamp(16px, 4vw, 48px);
  --section-gap:     var(--space-7);   /* 章节间距 */
}
```

### 4.2 节奏（Vertical Rhythm）

- 段落间距：`--space-3`（16px）
- 章节间距：`--space-6`（48px）
- 卡片内 padding：`--space-4`（24px）
- 卡片间距：`--space-5`（32px）

---

## 五、圆角、阴影、边框

### 5.1 圆角

```css
:root {
  --radius-sm: 4px;      /* 标签、小徽章 */
  --radius-md: 6px;      /* 按钮、输入框 */
  --radius-lg: 8px;      /* 卡片 */
  --radius-xl: 12px;     /* 大弹窗、引用块 */
  --radius-pill: 999px;  /* 胶囊 */
}
```

### 5.2 阴影

```css
:root {
  --shadow-1: 0 1px 2px rgba(15, 13, 10, .04),
              0 1px 1px rgba(15, 13, 10, .03);          /* 卡片静止 */
  --shadow-2: 0 4px 12px rgba(15, 13, 10, .06),
              0 2px 4px rgba(15, 13, 10, .04);           /* 卡片 hover */
  --shadow-3: 0 16px 40px rgba(15, 13, 10, .10),
              0 4px 12px rgba(15, 13, 10, .06);          /* 下拉 / 模态 */
  --focus-ring-inner: var(--color-brand-800);           /* 焦点环内圈 */
  --focus-ring-outer: var(--color-neutral-0);           /* 焦点环外圈 */
  --shadow-focus: 0 0 0 2px var(--focus-ring-inner), 0 0 0 4px var(--focus-ring-outer);  /* 键盘焦点环（双色） */
}
```

| 场景 | 阴影档 |
|---|---|
| 卡片静止 | `--shadow-1` |
| 卡片 hover（轻微上浮） | `--shadow-2`，配合 `translateY(-2px)` |
| Dropdown / Drawer / Modal | `--shadow-3` |
| 焦点环 | `--shadow-focus`，**双色**（内 2px + 外 2px）：内圈与页面底强对比、外圈取调色板另一极兜底 ⇒ 任何底色上至少一圈 ≥ 3:1 |

---

## 六、组件清单（Component Inventory）

> 每条组件在 `docs/mock/styles.css` 中都有真实类名，工程师实现时直接复用。

### 6.0 文件拆分（Phase 2B.5）

`components.css`（29KB 单文件）已拆为 7 个 partial + 1 个 index 入口：

| 拆分文件 | 内容 | 类名族 |
|---|---|---|
| `_nav.css` | brand + nav + theme-toggle + topbar + footer | `.brand`、`.nav`、`.topbar*`、`.foot`、`.theme-toggle` |
| `_button.css` | 按钮 + 表单 | `.btn`、`form` 相关 |
| `_badge.css` | 徽标 / 标签 / pill | `.badge`、`.badge--brand`、`.badge--sage`、`.badge--warning`、`.badge--quiet` |
| `_card.css` | **占位**（未来扩展） | — |
| `_list.css` | 列表 + 详情页 + tag-cloud | `.list` / `.list__*`、`.detail`、`.index`、`.list-page`、`.tag-cloud` |
| `_paper.css` | 论文精读：annotation + paper 容器 | `.annot-*`、`.paper`、`.paper-head`、`.paper-toc`、`.paper-body` |
| `_misc.css` | 容器 + 全局响应式覆盖 | `.wrap` |

**dev / prod 双模生成**（`eleventy.config.js` 的 `eleventy.after` 钩子）：

| 模式 | 判定 | `_site/assets/css/components.css` 内容 |
|---|---|---|
| dev | `eleventy --serve` 且 `NODE_ENV` 不为 `production` | `@import` hub，浏览器按需拉 7 个 partial |
| prod | 其余全部构建（含**裸跑 `npm run build`**、含 `NODE_ENV=production`） | 单文件 concat 7 个 partial（含分块标记） |

判定只看 `eleventy.config.js` 里那两行：`isDevServer` 要求进程带 `--serve`，
所以 `NODE_ENV` 不等于 `production` **并不**等于 dev —— 裸跑构建走的是 prod 分支。

7 个 partial 的**产物副本只在 dev 直拷**（`eleventy.config.js` 里 `if (isDevServer)` 那段）；
**prod 产物里没有它们** —— prod 的 `components.css` 已经是拼好的单文件，分片副本无人引用
（见 `docs/DEFECT-BACKLOG.md` D51）。判据见 `scripts/check-css-publish.cjs`（CS2 / CS3 /
CS8：门禁**从产物自身判模式** —— `components.css` 含 `@import url(` 即为 dev）。

切换 partial 顺序时同步修改 `src/assets/css/components/index.css` 的 `@import` 顺序 + `eleventy.config.js` 钩子中的 `order` 数组。

### 6.1 按钮（Button）

```html
<button class="btn btn-primary">查看论文</button>
<button class="btn btn-accent">下载附件</button>
<a class="btn btn-ghost" href="/blog">博客</a>
```

| 变体 | 用途 |
|---|---|
| `.btn-primary` | 流场蓝实色 + 白字，主操作 |
| `.btn-accent` | 赭石实色，多用于「下载」「引用」 |
| `.btn-ghost` | 透明背景 + 品牌色边框/字 |
| `.btn-link` | 无边框，文字加粗 + 下划线动画 |
| 尺寸：`.btn-sm` / `.btn-md`（默认）/ `.btn-lg` |  |

规则：

- 圆角 `--radius-md`（6px）
- 水平 padding `--space-3` / `--space-4`
- min-height 40px（sm）/ 44px（md）/ 52px（lg）
- hover 仅改 `background` 和 `box-shadow`，**禁止 transform: scale 引起布局抖动**
- `:focus-visible { outline: none; box-shadow: var(--shadow-focus); }`

### 6.2 卡片（Card）

`.card`：白底、`--radius-lg`、`--space-4` 内边距、`--shadow-1` → hover `--shadow-2`  
变体：

- `.card-image` — 顶部 16:9 封面图
- `.card-horizontal` — 左图右文（项目大卡片用）
- `.card-flag` — 左色条强调（论文精读摘要卡用，`border-inline-start: 4px solid var(--color-accent-400)`）

### 6.3 表单（Form）

- 输入：高度 40px，padding 0 `--space-3`，`--radius-md`
- focus：`--border-default` → `--color-brand-400`，外加 `--shadow-focus`
- label：放在输入框上方，fs-small，字色 `--text-secondary`，必填项加 `*` 红色非品牌色

### 6.4 徽章 / 标签（Badge / Tag）

```html
<span class="badge badge--brand">大气物理</span>
<span class="badge badge--accent">v1.0</span>
<span class="badge badge--sage">笔记</span>
```

- 圆角 `--radius-pill`
- 字号 `--fs-caption`
- 默认透明底 + 中性边框与文字（`--border-default` / `--text-secondary`），主题色由变体给出

变体（类名一律**双横线**分隔，与 `_badge.css` 里的定义一一对应）：

| 类名 | 用途 |
|---|---|
| `.badge--brand` | 主色强调 |
| `.badge--sage` | 中性 / 次级信息 |
| `.badge--warning` | 警示 |
| `.badge--quiet` | 次级标签（阅读时长、角色标签等） |

### 6.5 引用块（Blockquote）

```html
<blockquote class="quote">
  <p>……引用内容……</p>
  <cite>—— 来源 / 出处</cite>
</blockquote>
```

- 左边 3px `--color-accent-400` 边
- 背景 `--bg-muted`
- 内部 padding `--space-4` `--space-5`
- 字体走 `--font-editorial`（衬线），强化「引文感」

### 6.6 代码块（Code / Pre）

- 行内：`background: var(--bg-muted); padding: 2px 6px; border-radius: var(--radius-sm); font: var(--font-code)`
- 块级：`<pre><code>`，配 Monaco / Shiki 渲染
- 顶部带文件名（`.filename`）装饰
- 深色模式下底色用 `#15141A` 单独抽离，避免与卡片底色重合

### 6.7 批注侧栏（Annotation Panel · 仅论文精读页用）

- 桌面端右侧 320–360px 固定列
- 单条批注：左侧 3px 色条 + 标题 + 锚点 + 详情，共 6 种 kind 配色（question / insight / critique / figure / link / typo，映射见 `papers-interaction.md` 附录 C 与 `components/_paper.css`）
- 选中态：背景 `--bg-subtle`，左色条变 4px
- 全文折叠时（移动端）切换为 `<details>` 单元素

### 6.8 顶部导航（Topbar）

- 高度 64px，`backdrop-filter: blur(8px)` + `bg-page/85` 实现「学术站常见的纸张感」
- 左侧：站点 Logo（用 SVG，**不要 emoji**）
- 右侧：水平导航 5 项 + 主题切换 + 搜索图标（占位即可，后续可接 Pagefind）
- 桌面端不 sticky，首次滚动后 sticky top-0；移动端始终 sticky

### 6.9 面包屑 / 分页 / 标签云

- 圆点分隔符「·」而非斜杠，更学术
- 分页：键盘可达，`aria-label`，左右按钮带 SVG

---

## 七、动效与微交互（Motion）

```css
:root {
  --ease-out: cubic-bezier(.16,.84,.44,1);
  --ease-in-out: cubic-bezier(.65,.05,.36,1);
  --dur-fast:   120ms;
  --dur-base:   200ms;
  --dur-slow:   320ms;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    transition-duration: .01ms !important;
  }
}
```

- 默认 hover/active 用 `transition: background-color, border-color, box-shadow, transform var(--dur-base) var(--ease-out)`
- 卡片 hover：`translateY(-2px)`（**仅 2px，不引起布局抖动**），加 `--shadow-2`
- 滚动进度条：`scroll()` 函数 + `transform-origin: left` 配合 `--ease-out`

---

## 八、图标（Iconography）

- 全部使用 **Lucide** (`https://unpkg.com/lucide-static`) 或 **Heroicons** outline 风格 SVG
- 默认 stroke-width 1.75，尺寸 20×20（导航）/ 16×16（行内）
- **禁止 Emoji 当图标**：🎨🚀🎉 → 改为 SVG
- 站点 Logo：自绘「大气环流 + 节点」构图（可由设计师出 SVG，月度作者落款用「Cabot-like isobar」）

---

## 九、可访问性（A11y Checklist）

- 所有交互元素必须可见焦点环 `--shadow-focus`
- 焦点环**必须是双色**（`--focus-ring-inner` + `--focus-ring-outer`）：单色在主按钮底上达不到 WCAG 1.4.11 的 3:1
- 高对比偏好（`prefers-contrast: more`）下的焦点环加粗时**仍要双色**；系统高对比（`forced-colors: active`）改用 `outline: 3px solid Highlight` + `box-shadow: none`
- 任何 `:focus-visible` 规则都不得自己另写焦点环颜色 —— 只能走 `--shadow-focus` / `--focus-ring-inner` / `--focus-ring-outer`（门禁 `check:focus-ring` 的 FC7 守着这条）
- 图片 / 图表必须有 `alt`
- 颜色不是唯一信息载体：项目卡片上有 `data-status` 文本徽章辅助
- 跳转链接加 `.skip-link`，键盘 Tab 第一个进入
- 表单字段全部带 `<label for=...>` 而非 placeholder 替代
- 暗色模式对比度均按 WCAG AA 校验过

---

## 十、CSS 完整自定义属性（可直接复制到 global.css）

```css
:root {
  /* —— Colors · Brand —— */
  --color-brand-50:  #eaf3ff;  --color-brand-100: #cce0ff;
  --color-brand-200: #99c2ff;  --color-brand-300: #66a4ff;
  --color-brand-400: #3a86ff;  --color-brand-500: #1f5ec8;   /* 为 AA 链接对比度下调（原 #256ef0 4.34:1 → 现 5.67:1） */
  --color-brand-600: #1a55c2;  --color-brand-700: #143e93;
  --color-brand-800: #0e2c6b;  --color-brand-900: #091b44;

  /* —— Colors · Accent —— */
  --color-accent-50:  #fff3eb; --color-accent-100: #ffd9bd;
  --color-accent-200: #ffb787; --color-accent-300: #ff9550;
  --color-accent-400: #ff7e33; --color-accent-500: #e85f15;
  --color-accent-600: #b14810; --color-accent-700: #7a320a;
  --color-accent-800: #4a1d05; --color-accent-900: #260e02;

  /* —— Colors · Sage —— */
  --color-sage-300: #a4c8a4; --color-sage-500: #6f9e6f;
  --color-sage-700: #446844;

  /* —— Colors · Neutral —— */
  --color-neutral-0:   #ffffff; --color-neutral-50:  #faf8f5;
  --color-neutral-100: #f2efea; --color-neutral-200: #e6e2db;
  --color-neutral-300: #d1ccc3; --color-neutral-400: #a8a298;
  --color-neutral-500: #6b665d; --color-neutral-600: #575049;
  --color-neutral-700: #38332d; --color-neutral-800: #221f1b;
  --color-neutral-900: #0f0d0a;

  /* —— Semantic —— */
  --color-success: #4f9e6e; --color-warning: #d99a2b;
  --color-danger:  #c84a3a; --color-info:    #3a86ff;
  --button-primary-bg: #1453d8;   /* 主按钮底色（白字 6.44:1 · AA pass） */

  /* —— Text & Background —— */
  --text-primary:   #0f0d0a; --text-secondary: #575049;
  --text-muted:     #6b665d;
  --text-accent:    var(--color-accent-600);  /* 强调色作文字用（浅色 accent-600 5.21:1；暗色主题覆写为 accent-500） */
  --text-on-brand:  #ffffff;
  --link-color:     #1f5ec8; --link-hover:     #143e93;
  --bg-page:        #faf8f5; --bg-surface:     #ffffff;
  --bg-elevated:    #ffffff;   /* = bg-surface，保留给将来弹层用 */
  --bg-muted:       #f2efea; --bg-subtle:      #eaf3ff;
  --border-subtle:  #e6e2db; --border-default: #d1ccc3;
  --border-strong:  #6b665d;

  /* —— Shadows —— */
  --shadow-1: 0 1px 2px rgba(15,13,10,.04), 0 1px 1px rgba(15,13,10,.03);
  --shadow-2: 0 4px 12px rgba(15,13,10,.06), 0 2px 4px rgba(15,13,10,.04);
  --shadow-3: 0 16px 40px rgba(15,13,10,.10), 0 4px 12px rgba(15,13,10,.06);
  --focus-ring-inner: #0e2c6b;   /* 焦点环内圈（暗色下 = #dbeaff） */
  --focus-ring-outer: #ffffff;   /* 焦点环外圈（暗色下 = #0f0e0c） */
  --shadow-focus: 0 0 0 2px #0e2c6b, 0 0 0 4px #ffffff;

  /* —— Radius —— */
  --radius-sm: 4px; --radius-md: 6px; --radius-lg: 8px;
  --radius-xl: 12px; --radius-pill: 999px;

  /* —— Spacing —— */
  --space-0: 0;     --space-1: 4px;   --space-2: 8px;
  --space-3: 16px;  --space-4: 24px;  --space-5: 32px;
  --space-6: 48px;  --space-7: 64px;  --space-8: 96px;
  --space-9: 128px;

  /* —— Containers —— */
  --container-narrow: 720px; --container-base: 960px;
  --container-wide: 1200px;  --gutter: clamp(16px, 4vw, 48px);
  --section-gap: 64px;

  /* —— Typography —— */
  --font-serif-cn: 'Noto Serif SC', 'Noto Serif SC Fallback', 'Songti SC', 'STSong', serif;
  --font-serif-en: 'Source Serif 4', 'Source Serif 4 Fallback', 'Source Han Serif SC', 'Noto Serif SC', serif;
  --font-sans-cn:  'PingFang SC', 'Microsoft YaHei', 'Hiragino Sans GB', sans-serif;
  --font-sans-en:  'Inter', system-ui, -apple-system, 'Helvetica Neue', sans-serif;
  --font-mono:     'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
  --font-body:     var(--font-sans-cn), var(--font-sans-en);
  --font-editorial:var(--font-serif-cn), var(--font-serif-en);
  --font-code:     var(--font-mono);
  --font-serif:    var(--font-editorial);  /* 历史写法：列表页 / 论文卡 / 精读页的标题用它 */

  --fs-display: 3.815rem; --fs-h1: 2.488rem; --fs-h2: 2.074rem;
  --fs-h3: 1.728rem;      --fs-h4: 1.440rem; --fs-h5: 1.200rem;
  --fs-body-lg: 1.125rem; --fs-body: 1rem;   --fs-small: .875rem;
  --fs-caption: .75rem;

  --lh-tight: 1.25; --lh-base: 1.70; --lh-loose: 1.85;
  --tracking-tight: -0.015em; --tracking-base: 0; --tracking-loose: .02em;
  --measure: 72ch;

  /* —— Motion —— */
  --ease-out: cubic-bezier(.16,.84,.44,1);
  --ease-in-out: cubic-bezier(.65,.05,.36,1);
  --dur-fast: 120ms; --dur-base: 200ms; --dur-slow: 320ms;
}
```

---

## 十一、验收清单（交接给工程师的实现映射）

- [ ] 全站所有色值通过 CSS 变量引用，**禁止出现裸 HEX**（除 SVG fill 内联）
- [ ] `prefers-color-scheme` + 手动 `data-theme` 双轨支持
- [ ] 所有交互元素 `:focus-visible` 焦点环可见
- [ ] 标题 / 正文最大宽度遵循 `--measure`；长文容器用 `.prose`
- [ ] 标题 `text-wrap: balance`，正文 `text-wrap: pretty` + `orphans/widows: 2`
- [ ] 日期 / 年份 / 论文元信息用 `font-variant-numeric: tabular-nums`
- [ ] 不使用 emoji 作图标
- [ ] 暗色模式对比度 ≥ 4.5:1
- [ ] `prefers-reduced-motion` 关闭动效
- [ ] 字体预加载使用 `<link rel="preconnect">` + `<link rel="stylesheet" media="print" onload="this.media='all'">` 模式
- [ ] `components.css` 拆分至 `src/assets/css/components/`（7 partial + index）；dev/prod 双模由 `eleventy.after` 钩子生成

---

*文档维护人：设计师 · 本文档是视觉规范的**唯一来源**（single source of truth），后续视觉实现以本文档的意图为准；token 的**实际取值**以 `src/assets/css/tokens.css` 为准，两者冲突时改代码并回填本文档。*
