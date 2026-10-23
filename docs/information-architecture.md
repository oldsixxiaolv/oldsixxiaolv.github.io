# MeteoHub · 信息架构（Information Architecture）

> **📐 信息架构规划稿（v1.2 · 2026-10-23）** —— §一–§三、§五–§八 写的是**设计意图与目标结构**；
> §四「各页面骨架」写的是**已落地页面的真实骨架**（逐条对着页面模板核过）。
> 本文提到的路径分两类：**已落地**（代码里真实存在）与**规划中**（下面「落地状态」表点名）。
> 两类由 `scripts/check-information-architecture.cjs`（判据 IAC1–IAC10）对代码现实自动对账 ——
> 改了实现就回来改这份文档，门禁会替你核对。

## 落地状态

下表点名**当前尚未落地**的路径族。表里没点名的路径，要么已落地，要么本文根本没写过。

| 未落地路径 | 规划意图 | 当前现状 |
|---|---|---|
| `/tags/` | 标签索引页 + 单标签筛选 | 没有标签索引路由；按 tag 过滤也未实现 |
| `/search/` | 站内检索（先轻量客户端方案） | 没有检索页；§1.2 已把它改口为「规划中」 |
| `/about/cv/` | 关于页的 PDF CV 链接 | 没有 CV 产物，§七 的 PDF 编译步骤尚未执行 |
| `/cv.pdf` | 编译产物 PDF CV | 同上，未生成 |
| `/portfolio/` | 作品集整族（列表页 + 条目页） | 没有列表页模板、集合 0 条内容、导航里也没有它 ⇒ 整族未落地 |
| `/admin/` | Decap CMS 的后台入口 | 后台形态已拍板，但 OAuth App 尚未自建 ⇒ 尚未接入 |

其它已知偏差（**不是路径**，所以不进上表）：

- 列表页的分页仍是**未实现的规划意图**：blog 侧只设了 `size: 100`（一次铺 100 条，页面上没有翻页控件），papers 侧直接铺全部条目；§4.3 的框图已按「一次性渲染」写实，不再承诺分页；
- §2.1 / §2.2 里的条目级 slug 都是**示意**：blog 与 portfolio 集合当前 0 条内容，papers 只有 1 条（`trmm-thunderstorm-stages`）；
- 作品集里的 `cma-meso` 条目至今没有对应内容。

> 文档版本：v1.2 · 2026-10-23  
> 输出对象：工程师、实现协作者  
> 设计原则：**短路径、可发现、无冗余**

---

## 一、设计目标与边界

### 1.1 设计目标

1. **4 个一级页面**承担全部主交互：Home / Papers / Blog / About（真源：`src/_data/site.js` 的 `nav` 数组）
2. 每个一级页面**最多两级深**（除论文精读页内的「章节跳转」与「批注」伪深度）
3. 全站静态生成，URL 不带后端参数，构建期产出 HTML
4. **全站英文**（中文版不做；待国际化时再议）

### 1.2 边界

- 不做：用户登录、评论、订阅流、动态推荐、社交关系
- 内容后台形态已拍板为 **Decap CMS**（GitHub OAuth，入口 `/admin/`），**尚未接入**；接入前内容以「改文件 + 提交」的方式更新
- 站内检索：**规划中**，当前不实现（见 §4.6）

---

## 二、站点地图（Sitemap）

### 2.1 Mermaid 图

```mermaid
graph TD
    A[Index · 首页 /] --> A1[Hero 区：作者位 + 三模块入口]
    A --> A2[精选项目 3 张]
    A --> A3[最近博文 3 张]
    A --> A4[最近精读 2 张]
    A --> A5[页脚：关于 / 友链 / RSS]

    B[Portfolio · 作品集 /portfolio/] --> B1[Projects 列表]
    B1 --> B11[/portfolio/era5-pipeline/]
    B1 --> B12[/portfolio/typhoon-track/]
    B1 --> B13[/portfolio/cma-meso/]

    C[Blog · 博客 /blog/] --> C1[Articles 列表 · 支持 tag 过滤]
    C1 --> C11[/blog/2026-09-12-era5-reanalysis-intro/]
    C1 --> C12[/blog/2026-08-04-wrf-lessons/]
    C1 --> C13[/tags/· 标签索引页]
    C --> C2[关于博客]

    D[Papers · 论文精读 /papers/] --> D1[Papers 列表]
    D1 --> D11[/papers/holton-rollin-1987/]
    D1 --> D12[/papers/microphysics-zhang/]
    D2[Papers 详情 · 双栏] --> D2a[左侧原文 / Markdown]
    D2 --> D2b[右侧批注侧栏]

    E[About · 关于 /about/] --> E1[作者简介]
    E --> E2[研究兴趣 / 技能树]
    E --> E3[时间线 / CV 链接]
    E --> E4[联系方式 / RSS / 友链]

    F[*Common · 全站组件] --> F1[Topbar]
    F --> F2[Footer]
    F --> F3[主题切换]
    F --> F4[站内检索 /search/]
    F --> F5[404 页 /404.html]
    F --> F6[站点地图 /sitemap.xml]
    F --> F7[RSS /feed.xml]
```

### 2.2 树形列表

```
MeteoHub
├── /                           ← 首页 Index
├── /portfolio/                 ← 作品集 Portfolio（规划中）
│   ├── /portfolio/             ← 列表（卡片网格）
│   └── /portfolio/{slug}/      ← 单项目详情（slugify 项目名）
├── /blog/                      ← 博客 Blog
│   ├── /blog/                  ← 列表（时间倒序）
│   ├── /blog/{slug}/           ← 单篇博客（目录名即 slug）
│   ├── /tags/                  ← 全部标签索引（规划中）
│   └── /tags/{tag}/            ← 单标签筛选（规划中）
├── /papers/                    ← 论文精读 Papers with annotations
│   ├── /papers/                ← 列表（按阅读完成度排序）
│   └── /papers/{slug}/         ← 单篇精读（左原文 / 右批注）
├── /about/                     ← 关于 About
│   ├── /about/                 ← 单页（可锚点分段）
│   └── /about/cv/              ← PDF CV 链接（外链或静态，规划中）
├── /search/                    ← 站内检索（规划中）
├── /404.html                   ← 错误页
├── /feed.xml                   ← RSS 订阅
└── /sitemap.xml                ← 站点地图
```

---

## 三、导航层级（Navigation Hierarchy）

### 3.1 Topbar 一级导航

| 序号 | 标签 | 路径 | 性质 |
|---|---|---|---|
| 1 | Home | `/` | 站点门面 |
| 2 | Papers | `/papers/` | 学术核心 |
| 3 | Blog | `/blog/` | 长文思考 |
| 4 | About | `/about/` | 个人介绍 |

> 权威顺序以 `src/_data/site.js` 的 `nav` 数组为准（本表与它逐项对齐，由门禁 IAC3 守着）。
> 早期版本有 5 个入口（多一个「作品集」），作品集整族未落地 ⇒ 已从导航里去掉。

### 3.2 站内交叉入口

| 入口位置 | 跳转到 |
|---|---|
| Hero 三个 CTA | `/portfolio/`（规划中） `/blog/` `/papers/` |
| 项目详情页底部「相关文章」 | `/blog/?tag={tag}` `/papers/?tag={tag}` |
| 博客详情页底部「研究相关」 | `/portfolio/`（规划中）含同 tag 项目 |
| 论文精读详情页右上「下载原文 PDF」 | 外链 PDF |
| 全站页脚 | `/about/` `/feed.xml` `/sitemap.xml` |

### 3.3 面包屑规则

**规划中** —— 面包屑是否引入本身还没拍板（见中央「待拍板」台账），当前模板里没有面包屑组件。
真要引入的话，设想如下：

仅在三处使用：

- 项目详情：`首页 / 作品集 / {项目名}`
- 博客详情：`首页 / 博客 / {文章标题}`
- 论文详情：`首页 / 论文精读 / {论文短名}`

> 一级页面（Blog / Papers 列表本身）**不**显示面包屑（与导航重复）。

---

## 四、各页面骨架（Page Skeletons）

> 本节分两种写法：**已落地**的页面给一张框图（读者看到的页面）加一行机器可核对的
> 「区块锚点」；**未落地**的页面明写「规划中」。
>
> 「区块锚点」行是本节唯一可核对的部分 —— `scripts/check-information-architecture.cjs`
> 拿它跟该路由的页面模板真源逐条对账：文档写了模板里没有的区块判红（IAC8），
> 模板里有而文档漏写的区块同样判红（IAC9），还没有页面模板的路由则必须在小节里
> 明写「规划中」（IAC10）。
>
> **「区块锚点」行的口径**：只列**该路由自己的页面模板**里的区块 —— 模板最外层容器的
> 直接子级元素，加上它 include 进来的 partial 名。框图里的 Topbar / Footer 来自共用布局，
> 区块内部的标题、按钮、字段等零件不在这一行里。
>
> 详情页布局 `src/_includes/layouts/detail.njk` 与 `src/_includes/layouts/paper.njk`
> 不是 src 根下的页面模板，本轮不进这道门禁 —— 它们的结构在下面照实描述。

### 4.1 `/`（Index）

```
┌────────────────────────────────────────────────────────┐
│ Topbar                                                 │
├────────────────────────────────────────────────────────┤
│ Hero（partials/hero.njk）                              │
│   - 眉标：ATMOSPHERIC SCIENCE / RESEARCH NOTES         │
│   - h1：Thunderstorms / Lightning /                     │
│          Extreme precipitation                          │
│   - 副标题：作者简介（site.author.bio）                  │
│   - 2 个 CTA：About me ↗ 与 Technical notes             │
│                                                        │
│   ┌────────────────┐   ┌──────────────────────────┐   │
│   │ .home-signal   │   │ .home-portrait           │   │
│   │ FIELD NOTE / 01│   │ 人像 + 姓名/职位铭牌       │   │
│   │ 当前焦点 + 指标 │   │                          │   │
│   └────────────────┘   └──────────────────────────┘   │
├────────────────────────────────────────────────────────┤
│ 论文区（partials/publications.njk）                    │
│   - h2：Selected publications                          │
│   - 论文卡：标题 / 期刊 / 状态角标 / 作者身份标签          │
├────────────────────────────────────────────────────────┤
│ 自我介绍 .home-intro                                    │
│   - A working archive + 当前研究重点                    │
├────────────────────────────────────────────────────────┤
│ 数据图（partials/extreme-precip.njk）                  │
│   - h2：North China precipitation, 1960-2025            │
│   - 构建期生成的 inline SVG + 图注                       │
├────────────────────────────────────────────────────────┤
│ Footer                                                 │
└────────────────────────────────────────────────────────┘
```

区块锚点：`partials/hero.njk` · `partials/publications.njk` · `.home-intro` · `partials/extreme-precip.njk`

### 4.2 `/portfolio/`

**规划中** —— 作品集整族尚未落地（见「落地状态」表：没有列表页模板、集合 0 条内容、导航里也没有它）。

设想骨架（尚未实现，仅作设计意图留存）：

```
H1 作品集
Filter chips：年份 / 类型（科研项目 / 工具 / 比赛）
卡片网格（4 → 3 → 2 → 1 列响应式）
卡片：左封面图 + 右标题 + 简介 + 标签
```

详情页 `/portfolio/{slug}/` 的设想（若落地，将与 §4.3 共用 `src/_includes/layouts/detail.njk`）：

```
Hero：项目封面 + 标题 + 起止时间 + 角色
摘要：2-3 段
技术栈：徽章组
正文（Markdown，支持图片/视频/公式）
底部：「相关博客 / 相关论文」
```

### 4.3 `/blog/`

```
┌────────────────────────────────────────────────────────┐
│ .list-page__head                                      │
│   - h1：Technical notes                                │
│   - 副：Working notes on methods, data, and the ...     │
├────────────────────────────────────────────────────────┤
│ .list-empty（集合为空时才渲染这一块）                   │
│   - Nothing published here yet. + 指向 CSDN 的说明        │
├────────────────────────────────────────────────────────┤
│ .list.list--cards                                      │
│   - 一次性渲染全部条目，没有分页                          │
│   - 卡片：日期 / 标题 / 摘要 / 阅读时长 / 标签             │
├────────────────────────────────────────────────────────┤
│ Footer                                                 │
└────────────────────────────────────────────────────────┘
```

区块锚点：`.list-page__head` · `.list-empty` · `.list.list--cards`

详情页 `/blog/{slug}/`（布局 `src/_includes/layouts/detail.njk`）：单列正文（最大宽度 640px），
结构是 `.detail__head`（h1 + 日期 / 阅读时长 / 主题标签）→ `.detail__body`（正文）→
`.detail__pager`（有上一篇 / 下一篇时才渲染）→ `.detail__back`（返回列表）。
**它没有目录、没有批注面板，也没有公式与代码高亮** —— 这三样只属于论文页。

### 4.4 `/papers/`

```
┌────────────────────────────────────────────────────────┐
│ .list-page__head                                      │
│   - h1：Publications                                   │
│   - 副：Peer-reviewed work. Each entry links to ...      │
│   - 导出入口 .list__meta：Download BibTeX / Download RIS │
├────────────────────────────────────────────────────────┤
│ 论文列表（partials/publications.njk）                  │
│   - h2：Peer-reviewed publications（此处覆盖 partial 默认值）│
│   - 论文卡：标题 / 期刊 / 状态角标 / 作者身份标签          │
│   - 状态角标四种取值：Published / In press /             │
│     Under review / In revision                         │
├────────────────────────────────────────────────────────┤
│ Footer                                                 │
└────────────────────────────────────────────────────────┘
```

区块锚点：`.list-page__head` · `partials/publications.njk`

详情页 `/papers/{slug}/`（布局 `src/_includes/layouts/paper.njk`）：三栏 —— 左目录 / 中正文 / 右批注，
规则与门禁见 `docs/papers-interaction.md`（判据 PI1–PI7）。与博客详情页不同，这一页**有**目录和批注面板，
但同样没有公式与代码高亮。

### 4.5 `/about/`

```
┌────────────────────────────────────────────────────────┐
│ .about-hero                                           │
│   - 人像 + 身份三件套（姓名 / 职位 / 单位）              │
├────────────────────────────────────────────────────────┤
│ .about-blocks（两栏）                                  │
│   - RESEARCH TOPICS：研究关键词标签                     │
│   - AFFILIATIONS：隶属单位清单                          │
├────────────────────────────────────────────────────────┤
│ #about-edu-title     Education（时间轴）                │
│ #about-skills-title  What I work with（技能分组）        │
│ #about-output-title  Selected output（产出清单）         │
├────────────────────────────────────────────────────────┤
│ .about-contact-section  Contact（邮箱等真实地址）         │
├────────────────────────────────────────────────────────┤
│ .about-prose.prose  正文散文（来自 src/content/about.md） │
├────────────────────────────────────────────────────────┤
│ Footer                                                 │
└────────────────────────────────────────────────────────┘
```

区块锚点：`.about-hero` · `.about-blocks` · `#about-edu-title` · `#about-skills-title` · `#about-output-title` · `.about-contact-section` · `.about-prose.prose`

### 4.6 `/search/`

**规划中** —— 当前没有检索页（见「落地状态」表）。

设想（v1.0 可暂用客户端 JSON + fuse.js 简易版）：

- 单输入框 + 实时结果
- 命中片段高亮
- 支持 `/`、`blog`、`papers`、`portfolio` 过滤
---

## 五、URL / 命名规范

| 类型 | 规则 | 示例 |
|---|---|---|
| 论文 | `/papers/{slug}/` | `trmm-thunderstorm-stages` |
| 博客 | `/blog/{slug}/` | `trmm-stage-lightning` |
| 标签索引 | `/tags/{tag}/`（规划中） | `data-assimilation` |
| 静态资源 | `/assets/{path}` | `assets/fonts/Inter-Bold.woff2` |
| 项目（规划中） | `/portfolio/{slug}/` | `era5-pipeline` |
| 多语言 | 不做（`/`） | — |

文件名规范（**都以仓库根为起点** —— Eleventy 只采集 `src/` 下面的内容）：

- 博客 Markdown：`src/content/blog/{slug}/index.md`，可选封面 `src/content/blog/{slug}/cover.svg`
  （封面只认 `cover.svg` / `cover.png` / `cover.jpg` / `cover.jpeg` / `cover.webp`）；
  **目录名就是 slug**，front matter 里写 `slug:` 不生效。
- 论文 Markdown：`src/content/papers/{slug}/paper.md`，可选旁挂 `src/content/papers/{slug}/annotations.json`。
- 单页：`src/content/about.md`。
- 项目（规划中）：`src/content/portfolio/{slug}/index.md`。

---

## 六、内容元数据 Schema

### 6.1 Blog Front Matter

```yaml
---
title: ERA5 Reanalysis Basics: Region Selection and Download
date: 2026-09-12
excerpt: A hands-on note on picking a region and downloading ERA5 for atmospheric science.
readingTime: 8
tags: [reanalysis, era5, data-assimilation]
cover: cover.svg
---
```

> 可写字段以站内博客写作契约为准（`docs/blog-writing-guide.md` §2）；`layout` / `permalink`
> 由集合自动注入，**不要在 front matter 里写**。

### 6.2 Portfolio Front Matter

**规划中** —— 作品集整族尚未落地，下面这份 schema 只是设计意图。

```yaml
---
title: Rapid visualization of western North Pacific typhoon tracks
type: tool
year: 2025
role: Solo
stack: [Python, Cartopy, xarray]
cover: cover.svg
repo: https://github.com/...
demo: https://...
---
```

### 6.3 Paper Front Matter

```yaml
---
pubKey: trmm-stages
date: 2026-06-01
description: Stage-dependent relationships between lightning and radar echo structure in TRMM thunderstorms over tropical Africa.
summary: A K-means classifier on radar echo structure splits 16 years of TRMM storms into Pre-Mature, Mature and Post-Mature stages.
tags: [lightning, radar, trmm]
---
```

> 论文的标题 / 作者 / 期刊 / 年份 / DOI / PDF 链接**不在 front matter 里** ——
> 唯一真源是 `src/_data/site.js` 的 `publications` 数组，页面按 `pubKey` 关联。
> 照着别处抄 front matter 字段，只会写了不生效。

---

## 七、与静态生成的衔接

| 来源 | 工具 | 输出 |
|---|---|---|
| `src/content/blog/**` | Eleventy | `/blog/...` |
| `src/content/papers/**` | Eleventy | `/papers/...` |
| `src/content/portfolio/**` | Eleventy（**规划中**） | `/portfolio/...` |
| `src/content/about.md` | Eleventy | `/about/` |
| 标签、归档 | Eleventy collection（**规划中**） | `/tags/` |
| RSS、sitemap | Eleventy | `/feed.xml`、`/sitemap.xml` |
| robots、引文导出 | Eleventy | `/robots.txt`、`/publications.bib`、`/publications.ris` |
| PDF 编译 | Pandoc / Pandomatic（可选，**未落地**） | `/cv.pdf` |

> 站点已经用 **Eleventy** 构建（零 JS 框架）。改动本文的路径之前，先看「落地状态」表。

---

## 八、设计评审清单

- [x] 一级入口 ≤ 5 个，且语义互斥（当前 4 个：Home / Papers / Blog / About）
- [ ] 二级页面 slug 与论文 / 项目 / 博客一一对应（blog 与 portfolio 集合当前 0 条内容）
- [x] 404 页含 Topbar + 返回首页 CTA
- [x] 所有页面都有 `<title>` 与 `<meta description>`（SEO）
- [ ] 所有页面都有 OG/Twitter Card（OG 家族已实现；Twitter Card 标签未加）
- [x] RSS 与 sitemap 可被爬取（`/feed.xml`、`/sitemap.xml`，robots.txt 已声明）
- [ ] 移动端导航用 Drawer，无横滚
- [ ] 「关于」可被一页纸 PDF 下载
