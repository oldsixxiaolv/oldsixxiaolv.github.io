# ui-ux-pro-max 技能评估与 MeteoHub 改进方案

> 评估日期：2026-10-19
> 评估对象：技能 `ui-ux-pro-max` v1.0 · 项目 MeteoHub（Eleventy 静态站，纯 HTML/CSS/原生 JS）
> 评估方法：实际运行技能检索脚本 + 对照 `src/` 真实代码验证，不做未经验证的推断

---

## 一、结论先行

**这个技能不适合用来"重新设计" MeteoHub，但适合用来做"定点体检"。**

MeteoHub 已经完成一轮深度优化，具备完整的自有设计系统：

| 已有资产 | 规模 |
|---|---|
| `docs/design-system.md` 视觉规范 | 679 行 |
| `tokens.css` 可执行 token（已按 WCAG AA 调色） | 302 行 |
| `a11y.css` 无障碍样式 | 266 行 |
| Lighthouse 审计报告 | 已归档 `docs/lighthouse/` |
| 暗色模式 / `prefers-reduced-motion` / `forced-colors` / `prefers-contrast` | 均已覆盖 |
| 正文行宽 `--measure: 72ch` | 符合 65–75 字规范 |

因此技能的 **79 种风格、192 套配色、74 组字体搭配** 对本项目**基本无用**。真正有增量的是：

- **119 条 UX 规则** —— 当作审计清单，逐条对照代码
- **25 种图表类型** —— 补上站点完全缺失的能力
- **交付前检查清单** —— 暴露了断点体系的真实缺口

---

## 二、明确**不要**采纳的部分（避免倒退）

### 2.1 不要用 `--design-system` 生成器覆盖现有规范

实测生成结果对 MeteoHub 是**负收益**：

| 生成项 | 生成结果 | 与现状对比 | 结论 |
|---|---|---|---|
| 配色 | `#1E3A5F` 深蓝 + `#B45309` 金 | Tailwind slate 通用色 | **拒绝**。项目现有「流场蓝 + 暖橙赭石 + 沙岩暖灰」差异化更强，且已把链接色调到 5.67:1 通过 AA。生成的色板恰好是项目 `design-system.md` 1.3 节明令禁止的"冰冷 SaaS 模板感" |
| 字体 | Crimson Pro + Atkinson Hyperlegible | 替换 Inter + Source Serif 4 + Noto Serif SC | **拒绝**。`tokens.css:22-38` 已为现有字体手调 `size-adjust: 105%` / `ascent-override` 等四个 metric 来压制 swap 抖动。换字体等于让这套 CLS 优化失效 |
| 布局模式 | "Newsletter / Content First"（订阅表单 Hero） | 与学术主页无关 | **拒绝** |
| 风格 | Swiss Modernism 2.0 | 项目定位是"编辑感学术排版" | 不采纳 |

> **教训**：这类设计系统生成器是为"从零起步"设计的。对已有成熟规范的增量项目，它的输出天然是降级。

### 2.2 不要采纳 `--stack` 指南

实测 `--stack html-tailwind` 返回的全部是 Tailwind v4 的 `@theme` 指令（`--color-primary` 注册、避免 `bg-[var(...)]`）。MeteoHub 是纯 CSS、无 Tailwind，**完全不适用**。

### 2.3 不要引入 GSAP

17 个 GSAP 预设针对滚动编排（pin / SplitText / Flip）。MeteoHub 是静态学术站，`prefers-reduced-motion` 已正确降级，引入动画库只会增加体积和可访问性风险。

### 2.4 不要引入图表库

见 §3.4 —— 与项目"整个文件夹扔到哪都能跑"的自包含原则冲突（见 commit `dcbd1db`；404 页按 GitHub Pages 语义走根绝对，是该原则的唯一例外，普通页面不受影响）。

---

## 三、建议采纳的改进项（按优先级）

### P1 · 补齐打印样式（`@media print` 完全缺失）

**证据**：`grep -rn "@media print" src/assets/css/` → **零命中**。

**为什么这是真问题**：论文精读模块已有完整的高亮/批注能力
（`src/assets/js/paper-reader/` 下 `highlight.js`、`annotations.js`、`reading-progress.js`、`toc.js`），
但用户**无法把带批注的论文导出成 PDF**。对一个大气科学研究生，这是高频真实场景：组会分享、导师汇报、文献存档。

**改动**：新增 `src/assets/css/print.css`，在 `base.njk` 中引入
- 隐藏导航栏、主题切换、阅读进度条、浮动按钮
- 展开正文外链的 URL（`a[href^="http"]::after { content: " (" attr(href) ")" }`）
- 保留高亮底色与批注块，用 `print-color-adjust: exact` 强制打印背景色
- 移除 `box-shadow` / 圆角，改为黑色边框，避免浪费墨水
- 设置 `@page { margin: 18mm }` 与页眉页码

**工作量**：约 60 行 CSS + 1 行引入。**性价比最高**。

---

### P2 · 收敛断点体系

**证据**：当前 6 个散落断点 —— `640 / 720 / 760 / 768 / 820 / 1024`。
其中 `720/760/768/820` 四个值只差 100px，实质是同一断点的不同写法。

技能交付清单建议：`375 / 768 / 1024 / 1440`。

**改动**：
- 统一为 `375px`（iPhone SE 基线，**当前缺失**）/ `768px` / `1024px` / `1440px`（大屏封顶，**当前缺失**）
- 将 `720/760/820` 合并到 `768`
- 抽成 token 或至少在 `tokens.css` 注释中声明，避免后续再散

**工作量**：机械替换 + 回归验证 4 个页面布局。**注意**：需逐页核对，不能盲改。

---

### P3 · 长标识符换行从 `break-word` 升级为 `anywhere`

**证据**：`base.css:108` 使用 `overflow-wrap: break-word`（旧语义）。
技能规则标注 **Severity: High**，明确要求 `overflow-wrap: anywhere` + flex/grid 子项 `min-inline-size: 0`。

**为什么对本项目特别重要**：学术论文页面充斥 DOI、`arxiv.org/abs/2509.12345`、长公式标识符 —— 任何一个都可能撑破布局造成横向滚动。

**改动**：
1. `base.css` 正文 `break-word` → `anywhere`（注意：不要给所有 prose 加 `word-break: break-all`，技能明确禁止）
2. `min-inline-size: 0` 从现在的 3 处零散（`_list.css:259`、`paper-reader.css:71/331`）补到所有 flex/grid 文本子项 —— 这是 flex 容器横向溢出的经典成因

**工作量**：小，但需要逐个 flex 容器检查。

---

### P4 · 建立数据可视化能力（当前为零）

**证据**：`grep -ril "canvas|chart|d3|echarts|plotly"` → 仅命中 SVG 图标，**无任何数据图表**。

**为什么值得做**：对气象/大气科学研究者，一幅雷电密度或降水气候态图的说服力远超任何文字描述。这是技能 25 种图表类型真正能派上用场的地方。

**约束（硬性）**：必须**手写 inline SVG**，不引入任何图表库。
理由：`dcbd1db` 已确立"产物全部改为相对路径，整个文件夹扔到哪都能跑"的自包含原则（404 页按 GitHub Pages 语义走根绝对，是唯一例外，普通页面不受影响）；Chart.js/D3 需 CDN 或打包，会破坏该原则并增加 ~100KB。

**技能可直接使用的指导**（实测检索所得）：
- **时空密度数据** → Heat Map / Choropleth；渐变冷蓝→热红，**必须附数值图例**
- **时间序列趋势** → Line Chart；**必须用实线/虚线/点线区分多序列，不能只靠色相**（色觉障碍可访问性）
- **可访问性兜底**：附可见数据表 + 文字趋势摘要；`risk:low` / `risk:conditional` 风险等级已标明
- 数据量 < 1000 点用 SVG，≥ 1000 点才考虑 Canvas + 降采样（本项目静态数据几乎必然走 SVG）

**建议落点**：Portfolio 页或首页 Hero 下方，做一张"研究方向时空分布"或"区域降水气候态"图。
**工作量**：中等（需先准备数据）。**建议作为独立任务，不与 UI 优化混在一起。**

---

### P5 · 媒体资源尺寸占位（CLS）

技能优先级 3 要求 CLS < 0.1。项目目前无 `<img width/height>` 占位约定。
若采纳 P4 加图，必须同时定下尺寸占位规范，否则会引入新的布局抖动 —— 抵消 `tokens.css` 里已做的字体 swap 优化。

---

## 四、执行顺序建议

```
阶段 1（独立、低风险、立即可做）
  └─ P1 打印样式        ← 建议先做，独立收益

阶段 2（需回归验证）
  ├─ P2 断点收敛
  └─ P3 换行规则升级

阶段 3（独立设计任务）
  └─ P4 数据可视化 + P5 尺寸占位规范
```

**阶段 2 需要在本地 `npm run serve` 逐页核对**（首页 / Blog / Papers / About 四类模板），
不能批量替换后就提交。

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
