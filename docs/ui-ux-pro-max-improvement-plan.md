# ui-ux-pro-max 技能评估与 MeteoHub 改进方案

> 评估日期：2026-10-19
> 评估对象：技能 `ui-ux-pro-max` v1.0 · 项目 MeteoHub（Eleventy 静态站，纯 HTML/CSS/原生 JS）
> 评估方法：实际运行技能检索脚本 + 对照 `src/` 真实代码验证，不做未经验证的推断
> **本文的现状口径**：每条改进项下的「**当时的证据**」是 2026-10-19 的原始记录（不得改写），
> 「**当前状态**」是最近一次实测（2026-10-23）。两者不一致时**以「当前状态」为准**。
> 「当前状态」末尾的**现状断言**是机器可核对的断言（`token=取值`）——
> `npm run check:doc-reality` 的判据 DR9–DR12 会把每条断言的取值与代码现实逐条对比：
> 代码变了而本文没跟上，那道门禁会直接判红。详见 §六。

---

## 一、结论先行

**这个技能不适合用来"重新设计" MeteoHub，但适合用来做"定点体检"。**

MeteoHub 已经完成一轮深度优化，具备完整的自有设计系统：

| 已有资产 | 规模 |
|---|---|
| `docs/design-system.md` 视觉规范 | 全文见该文件（篇幅随维护变动，本文不写死） |
| `src/assets/css/tokens.css` 可执行 token（已按 WCAG AA 调色） | 全文见该文件 |
| `src/assets/css/a11y.css` 无障碍样式 | 全文见该文件 |
| Lighthouse 审计报告 | 已归档 `docs/lighthouse/` |
| 暗色模式 / `prefers-reduced-motion` / `forced-colors` / `prefers-contrast` | 均已覆盖 |
| 正文行宽 `--measure: 72ch` | 符合 65–75 字规范 |

因此技能的 **79 种风格、192 套配色、74 组字体搭配** 对本项目**基本无用**。真正有增量的是
（以下是 2026-10-19 评估当时的技能清单）：

- **119 条 UX 规则** —— 当作审计清单，逐条对照代码
- **25 种图表类型** —— 补上站点完全缺失的能力
- **交付前检查清单** —— 暴露了断点体系的真实缺口

---

## 二、明确**不要**采纳的部分（避免倒退）

### 2.1 不要用 `--design-system` 生成器覆盖现有规范

实测生成结果对 MeteoHub 是**负收益**：

| 生成项 | 生成结果 | 与现状对比 | 结论 |
|---|---|---|---|
| 配色 | `#1E3A5F` 深蓝 + `#B45309` 金 | Tailwind slate 通用色 | **拒绝**。项目现有「流场蓝 + 暖橙赭石 + 沙岩暖灰」差异化更强，且现有链接色已按 WCAG AA 下调过（下调理由与实测比值记在 `src/assets/css/tokens.css` 的 `--color-brand-500` 注释里，全站对比度由 `npm run check:a11y` 持续把关）。生成的色板恰好是项目 `docs/design-system.md` 1.3 节明令禁止的"冰冷 SaaS 模板感" |
| 字体 | Crimson Pro + Atkinson Hyperlegible | 替换 Inter + Source Serif 4 + Noto Serif SC | **拒绝**。`src/assets/css/tokens.css` 里两个 `@font-face` fallback 块已为现有字体手调 `size-adjust: 105%` / `ascent-override` 等四个 metric 来压制 swap 抖动。换字体等于让这套 CLS 优化失效 |
| 布局模式 | "Newsletter / Content First"（订阅表单 Hero） | 与学术主页无关 | **拒绝** |
| 风格 | Swiss Modernism 2.0 | 项目定位是"编辑感学术排版" | 不采纳 |

> **教训**：这类设计系统生成器是为"从零起步"设计的。对已有成熟规范的增量项目，它的输出天然是降级。

### 2.2 不要采纳 `--stack` 指南

实测 `--stack html-tailwind` 返回的全部是 Tailwind v4 的 `@theme` 指令（`--color-primary` 注册、避免 `bg-[var(...)]`）。MeteoHub 是纯 CSS、无 Tailwind，**完全不适用**。

### 2.3 不要引入 GSAP

17 个 GSAP 预设针对滚动编排（pin / SplitText / Flip）。MeteoHub 是静态学术站，`prefers-reduced-motion` 已正确降级，引入动画库只会增加体积和可访问性风险。

### 2.4 不要引入图表库

见 §三 的 P4 —— 与项目"整个文件夹扔到哪都能跑"的自包含原则冲突（见 commit `dcbd1db`；404 页按 GitHub Pages 语义走根绝对，是该原则的唯一例外，普通页面不受影响）。

---

## 三、建议采纳的改进项（按优先级）

### P1 · 补齐打印样式

**当时的证据（2026-10-19）**：`grep -rn "@media print" src/assets/css/` → **零命中**。

当时的判断：论文精读模块已有完整的高亮/批注能力
（当时 `src/assets/js/paper-reader/` 目录下是 `highlight.js`、`annotations.js`、`reading-progress.js`、`toc.js`），
但用户**无法把带批注的论文导出成 PDF**。对一个大气科学研究生，这是高频真实场景：组会分享、导师汇报、文献存档。

当时的改动建议：新增 `src/assets/css/print.css`，在 `src/_includes/layouts/base.njk` 中引入
- 隐藏导航栏、主题切换、阅读进度条、浮动按钮
- 展开正文外链的 URL
- 保留高亮底色与批注块，用 `print-color-adjust: exact` 强制打印背景色
- 移除 `box-shadow` / 圆角，改为黑色边框，避免浪费墨水
- 设置 `@page { margin: 18mm }` 与页眉页码

当时的成本估计：约 60 行 CSS + 1 行引入。**性价比最高**。

**当前状态（2026-10-23 实测）**：**已落地**。
`src/assets/css/print.css` 已存在，并在 `src/_includes/layouts/base.njk` 的 head 里引入；
文件里有 `@media print` 段与 `@page { margin: 18mm }`，用 `print-color-adjust: exact` 保住高亮底色，
并把正文外链的原始 URL 追加在链接后面。批注栏不是被 `display:none` 掉，而是改成静态流、跟着正文顺序流下来 ——
所以「带批注的论文导出成 PDF」这个场景真的通了。
另外：当时列在 `src/assets/js/paper-reader/` 下的 `reading-progress.js` 这个阅读进度模块**后来已删除**，
目录里现在只剩 `highlight.js`、`annotations.js`、`main.js`、`theme.js`、`toc.js`。

- 现状断言：`print-style=present` · `print-media=yes` · `print-imported=yes` · `print-page-rule=yes` · `paper-reader-progress-module=absent`

---

### P2 · 收敛断点体系

**当时的证据（2026-10-19）**：当前 6 个散落断点 —— `640 / 720 / 760 / 768 / 820 / 1024`。
其中 `720/760/768/820` 四个值只差 100px，实质是同一断点的不同写法。

技能交付清单建议：`375 / 768 / 1024 / 1440`。

当时的改动建议：
- 统一为 `375px`（iPhone SE 基线，**当时缺失**）/ `768px` / `1024px` / `1440px`（大屏封顶，**当时缺失**）
- 将 `720/760/820` 合并到 `768`
- 抽成 token 或至少在 `src/assets/css/tokens.css` 注释中声明，避免后续再散

当时的成本估计：机械替换 + 回归验证 4 个页面布局。**注意**：需逐页核对，不能盲改。

**当前状态（2026-10-23 实测）**：**仍未收敛，而且断点集合已经变了**。
现在 `src/` 下（`.css` 与 `.njk` 一起算）的 @media 宽度是 **360 / 640 / 760 / 768 / 820 / 860 / 1024**：
`720` 已经不存在了；新增了 `360`（超窄屏档，只在 `src/assets/css/components/_nav.css` 里）与 `860`
（`src/about.njk` 内联样式里的窄屏档）。技能建议的 `375 / 768 / 1024 / 1440` 仍未采纳。
这条**是本文里唯一还没落地的改进项**。

- 现状断言：`breakpoints=360,640,760,768,820,860,1024`

---

### P3 · 长标识符换行从 `break-word` 升级为 `anywhere`

**当时的证据（2026-10-19）**：`src/assets/css/base.css` 使用 `overflow-wrap: break-word`（旧语义）。
技能规则标注 **Severity: High**，明确要求 `overflow-wrap: anywhere` + flex/grid 子项 `min-inline-size: 0`。

当时的判断：学术论文页面充斥 DOI、`arxiv.org/abs/2509.12345`、长公式标识符 —— 任何一个都可能撑破布局造成横向滚动。

当时的改动建议：
1. `src/assets/css/base.css` 正文 `break-word` → `anywhere`（注意：不要给所有 prose 加 `word-break: break-all`，技能明确禁止）
2. `min-inline-size: 0` 从当时的三处零散补到所有 flex/grid 文本子项 —— 这是 flex 容器横向溢出的经典成因

**当前状态（2026-10-23 实测）**：**已落地**。
`src/assets/css/base.css` 的正文断行兜底已经是 `overflow-wrap: anywhere`，
选择器覆盖 `p, li, dd, dt, td, th, figcaption, blockquote, pre, code, a, span`；
`min-inline-size: 0` 现在共 3 处，分布在 `src/assets/css/components/_paper.css` 与 `src/assets/css/pages.css`
（不再是当时记的那两个文件）。`src/assets/css/base.css` 里还留着当时的实测记录：
换成 `anywhere` 之后，窄视口下能撑破整页的元素从 132 个降到 30 个，剩下的都是本来就该 `nowrap` 的短标签。

- 现状断言：`overflow-wrap-anywhere=yes` · `min-inline-size-zero=3`

---

### P4 · 建立数据可视化能力

**当时的证据（2026-10-19）**：`grep -ril "canvas|chart|d3|echarts|plotly"` → 仅命中 SVG 图标，**无任何数据图表**。

当时的判断：对气象/大气科学研究者，一幅雷电密度或降水气候态图的说服力远超任何文字描述。这是技能 25 种图表类型真正能派上用场的地方。

当时的约束（硬性）：必须**手写 inline SVG**，不引入任何图表库。
理由：`dcbd1db` 已确立"产物全部改为相对路径，整个文件夹扔到哪都能跑"的自包含原则（404 页按 GitHub Pages 语义走根绝对，是唯一例外，普通页面不受影响）；Chart.js/D3 需 CDN 或打包，会破坏该原则并增加 ~100KB。

技能可直接使用的指导（2026-10-19 实测检索所得）：
- **时空密度数据** → Heat Map / Choropleth；渐变冷蓝→热红，**必须附数值图例**
- **时间序列趋势** → Line Chart；**必须用实线/虚线/点线区分多序列，不能只靠色相**（色觉障碍可访问性）
- **可访问性兜底**：附可见数据表 + 文字趋势摘要；`risk:low` / `risk:conditional` 风险等级已标明
- 数据量 < 1000 点用 SVG，≥ 1000 点才考虑 Canvas + 降采样（本项目静态数据几乎必然走 SVG）

当时的建议落点：Portfolio 页或首页 Hero 下方，做一张"研究方向时空分布"或"区域降水气候态"图。

**当前状态（2026-10-23 实测）**：**已落地**（落点选了首页）。
数据在 `src/_data/extremePrecip.json`，图形由 `scripts/lib/chart-svg.cjs` 在构建期写成**内联 SVG**
（不是 `<canvas>`、不是图表库），交互脚本是 `src/assets/js/home-chart.js`，指针与键盘都能读数。
硬性约束仍然成立：**没有引入任何图表库**（全站第三方前端运行时依赖为零，由 `npm run check:third-party` 把关）。
当时「附可见数据表」这条可访问性兜底**没有**照做 —— 现在的做法是给图表配文字读数与趋势摘要。

- 现状断言：`data-chart-module=present` · `data-chart-data=present`

---

### P5 · 媒体资源尺寸占位（CLS）

**当时的证据（2026-10-19）**：技能优先级 3 要求 CLS < 0.1。项目当时无 `<img width/height>` 占位约定。
若采纳 P4 加图，必须同时定下尺寸占位规范，否则会引入新的布局抖动 —— 抵消 `src/assets/css/tokens.css` 里已做的字体 swap 优化。

**当前状态（2026-10-23 实测）**：**已落地**。
`src/` 下模板里的每一个真实 `<img>` 都带上了 `width` 与 `height`：
论文配图与首页论文卡走 `pub.figure.width` / `pub.figure.height`，人像走 `site.author.photo.portraitSize`，
博客封面图写死 800×450。

- 现状断言：`img-size-placeholder=yes`

---

## 四、执行顺序建议（按 2026-10-23 实测更新）

```
阶段 1（独立、低风险、立即可做）
  └─ P1 打印样式        ← 已落地（src/assets/css/print.css 已引入）

阶段 2（需回归验证）
  ├─ P2 断点收敛        ← 仍未做，且断点集合已变（见 P2 的当前状态）
  └─ P3 换行规则升级    ← 已落地（overflow-wrap: anywhere）

阶段 3（独立设计任务）
  ├─ P4 数据可视化      ← 已落地（首页极端降水图）
  └─ P5 尺寸占位规范    ← 已落地（模板里每个 <img> 都带 width/height）
```

**阶段 2 需要在本地 `npm run serve` 逐页核对**（首页 / Blog / Papers / About 四类模板），
不能批量替换后就提交。

**下一步**：现在只剩 P2（断点收敛）没做。它是纯机械替换但影响面最广，
必须逐页核对；做之前先看 §六的现状断言机制 —— 断点集合一变，那条断言就会自动判红。

---

## 五、附：技能实际检索记录

| 查询 | 域 | 命中 | 用途 |
|---|---|---|---|
| `long-form reading academic paper` | ux | 5 | 发现长标识符换行、表格溢出规则 |
| `horizontal overflow wide table data` | ux | 4 | 确认 High 级横向滚动风险 |
| `reading measure line length prose` | ux | 4 | 核对 `--measure: 72ch` 合规 |
| `print stylesheet paper` | ux | **0** | 无匹配 → 打印样式缺口由代码扫描发现，非技能检索 |
| `spatiotemporal meteorological map time series` | chart | 4 | P4 图表选型与可访问性规则 |
| `semantic html css custom properties` | stack html-tailwind | 3 | **判定不适用**（Tailwind 专用） |
| `academic research personal site editorial` | design-system | — | **判定为降级**，见 §2.1 |

---

## 六、附：现状断言与门禁

本文每条改进项下的「现状断言」是**机器可核对**的断言，形式是 `token=取值`：

- 门禁：`npm run check:doc-reality`（判据 DR9–DR12）
- 自测：`npm run check:doc-reality-selftest`（注入矩阵 + 判据级负对照）

门禁会做四件事：

1. 每个 `### P<n>` 小节都必须同时有「当时的证据」与「当前状态」两个标记 —— 防止新加改进项却不写现状；
2. 「现状断言」里的 token 必须在门禁的已知清单内 —— 防止拼错 token 蒙混过关；
3. 每个 token 的取值必须与代码现实一致 —— 代码变了而本文没跟上，门禁直接判红；
4. 本文不许写死「数词 + 行」那类会变的篇幅数 —— 那类数字每改一次样式就变一次。

**为什么要有这个机制**：本文在 2026-10-19 写完后，P1 / P3 / P4 / P5 陆续在代码里落地了，
但「当时的证据」那一行还停在写完当时的状态 —— 照着它去改代码，会去改一个已经做完的东西
（或者以为站点还缺能力）。这一族文档此前**零门禁看守**，现在由 DR9–DR12 兜住。

**诚实的边界**：DR9–DR12 只认「语法明确的断言」（标记行 + `token=取值`），
散文里拐弯的说法它看不见；token 的取值范围是门禁里写死的那几个，
本文若出现门禁没登记的维度，就不在看守范围内。
