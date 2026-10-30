# 站内长文写作规范（MeteoHub）

> 本文件是**站内博客文章的写作契约**：front matter 怎么写、正文怎么组织、哪些门禁会在你写完后拦你。
> 条款全部来自仓库实测（模板消费字段、门禁判据、构建产物），不是设想；
> 与代码冲突时**以代码为准**，并回来修本文件。
> 里程碑与顺序见 `docs/ROADMAP.md`；每一轮的实际改动见 `docs/IMPROVEMENT-LOG.md`。

---

## 0. 一句话

一篇文章 = `src/content/blog/<slug>/index.md` 一个文件（可带一张封面图），
**目录名就是 URL**，front matter 里的 `title` / `date` / `excerpt` / `readingTime` / `tags` 决定它在列表页长什么样，
**正文必须英文**且只许写可核实的东西。

---

## 1. 位置与命名

```
src/content/blog/<slug>/index.md      ← 文章正文
src/content/blog/<slug>/cover.svg     ← 可选封面（同一目录）
```

- **`<slug>` = 目录名 = URL 的一部分**（`/blog/<slug>/`）。
  这是 `src/eleventy-helpers.cjs` 的 `getSlugFromData()` 决定的：它取文件路径的**倒数第二段**（目录名），
  **不读 front matter 的 `slug` 字段** ⇒ front matter 里写 `slug:` 是**无效的**，别写。
- 目录名规范：**小写 ASCII + 连字符**（`trmm-stage-lightning`、`wrf-pbl-nudging`）。
  避开空格、中文、大写字母、连续连字符（`--`）—— 它们会进 URL，搜索引擎与分享链接都会变丑。
- 目录名一旦发布就是**永久链接**，改它等于换链接。定名前想清楚。

### 自动注入的字段（**不要重复写**）

`src/content/blog/blog.11tydata.cjs` 已经给这个目录下的所有文件注入了：

| 字段 | 值 |
|---|---|
| `layout` | `layouts/detail.njk` |
| `permalink` | `/blog/<slug>/` |
| `tags` | 追加集合名 `"blog"` |
| `prev` / `next` | 按发布日期排的上一篇 / 下一篇（用于详情页底部的翻页条） |
| `structuredType` | `BlogPosting` —— 这一族页面在结构化数据里自称的作品实体类型（2026-10-23 起） |
| `eleventyExcludeFromCollections` | `draft` 为真值时为 `true`（草稿不进任何集合 ⇒ sitemap / feed / 列表页都看不到它），否则为 `false`（详见 §2.7） |

⇒ front matter 里**再写** `layout` / `permalink` 不是"更保险"，是**覆盖**它们，会把版式与 URL 弄坏。
⇒ `structuredType` 同理是**站点的事**（这一族页面的实体类型一样），不是每篇文章各写一遍的事；
front matter 里再写它没有意义，写错则会让结构化数据里的实体类型与页面实际声明的对不上（门禁 J13 判红）。

⚠️ `structuredType` 与论文页的 `pubKey` 是**同一层意思的两种写法**：
`pubKey` 指向 `src/_data/site.js` 里那一条已登记的论文（外部有权威登记可查），
`structuredType` 只声明实体类型（博客文章没有外部登记条目可指向）。
两者都只作用在**页面这一层**的裸键上，模板与门禁都按数据层的三条路径回源
（front matter 顶层 / `eleventyComputed` / 目录数据文件）——
不按 URL 硬编码路由，路由一改就不会静默失配。

⚠️ **2026-10-20 实测订正**：`tags` **不是覆盖，是"合并"** ——
front matter 写的 `tags` 与自动追加的 `"blog"` 会**并成一份**，
渲染顺序是 `"blog"` 在前、主题标签在后（实测渲染出 `· blog · TRMM · lightning`）。
⇒ 主题标签照常写即可，但**不要指望它替换掉** `"blog"`；也**不要**在 front matter 里再写一遍 `"blog"`。

⇒ 这条「合并」由本仓**显式**写死在 `eleventy.config.js`（`setDataDeepMerge(true)`），不靠 Eleventy 的默认值。
实测（2026-10-23）把它关掉：front matter 写主题标签会把目录级的 `"blog"` **整个覆盖掉**，
文章随即**掉出 `/blog/` 列表**（`collections.blog` 从 2 条掉到 1 条）⇒ 这条契约靠的是本仓配置，不是上游运气。

⇒ 这三个字段现在**有门禁拦**：`layout` / `permalink` 写进 front matter ⇒ 判红（判据 F8，见 §2.4）。

---

## 2. front matter 契约

```yaml
---
title: "Stage-dependent lightning–radar relationships in TRMM thunderstorms"
date: 2026-10-20
description: "How a K-means classification of 16 years of TRMM storms into three life-cycle stages changes what a lightning-intensity relationship looks like."
excerpt: "A K-means classifier on radar echo structure splits 16 years of TRMM storms into three stages; the lightning-intensity relation turns out to be stage-specific rather than one pooled trend."
readingTime: 12
tags: ["TRMM", "lightning", "radar"]
---
```

| 字段 | 必需 | 类型 | 模板怎么用 | 写错会怎样 |
|---|---|---|---|---|
| `title` | **是** | 字符串 | 列表卡标题、详情页 `<h1>`、feed `<title>` | 缺失 → 详情页 h1 空白、列表卡无名 |
| `date` | **是** | `YYYY-MM-DD` | 列表卡眉标、详情页日期、feed `pubDate`、`prev/next` 排序 | 见 §2.1 |
| `description` | **是** | 字符串 | SEO 用的 meta description（`<meta name="description">`、`og:description`、`twitter:description`、JSON-LD 的 `description`） | 缺失 → 回落成**站点通用描述**，站内每篇文章的搜索 snippet 一模一样（见下面的说明） |
| `excerpt` | 强烈建议 | 字符串 | 列表卡摘要（**一句话**） | 缺失 → 卡片没有摘要，只剩标题，看不出值不值得点 |
| `readingTime` | 建议 | **纯数字** | 模板直接拼 `{{ readingTime }} min read` | 写成 `"12 min"` → 页面显示 `12 min min read` |
| `tags` | 可选 | 字符串数组 | 列表卡主题标签（**最多显示 3 个**） | 见 §2.2 |
| `cover` | 可选 | **文件名**（必须是 `cover.<ext>`） | 列表卡封面 | 见 §2.3 |

> **`description` 与 `excerpt` 是两个岗位，不能互相顶替**：
> `description` 是**给搜索引擎看的一句话描述** —— 写进 `<meta name="description">`、
> `og:description`、`twitter:description` 与 JSON-LD 的 `description` 这些出口；
> 它的内容是**标题的改写**：换个说法说清这篇文章讲什么，读的人不点进来也大致知道。
> `excerpt` 是**给 `/blog/` 列表页卡片看的一句话摘要**，只出现在卡片上。
> 混起来会同时坏两处：只写 `excerpt` ⇒ 详情页的 meta description 回落到**站点通用描述**
> （站内每篇文章的搜索 snippet 于是完全一样）；只写 `description` ⇒ 列表卡没有摘要。
> 论文页是同一套分工（`description` / `summary`），见
> `src/content/papers/trmm-thunderstorm-stages/paper.md` 的 front matter。

### 2.1 `date` 只写日期，不写时分

两处渲染用的路径不同，但都假设"纯日期"：

- 列表页：`post.date | dateToIso | truncate(10, true, '')` —— 走 **UTC**，取 ISO 前 10 位；
- 详情页：`page.date | date('yyyy-LL-dd')` —— 走**本地时区**。

写 `2026-10-20` 时两边都得到 `2026-10-20`（列表页取 UTC 零点的前 10 位，详情页取本地零点的年月日）。

⚠️ **2026-10-20 实测订正**：一旦写成 `2026-10-20 09:30`，后果**不是"某一边显示前一天"** ——
**Eleventy 自己 fatal、整个 build 挂掉**，报的还是它的内部堆栈（`Data cascade value for date`），
不是一条能让人一眼看出"你日期写错了"的提示。
⇒ **只写 `YYYY-MM-DD`，永远不带时分秒**；写错了现在会被门禁 F5 拦下（见 §2.4）。

### 2.2 `tags` 是"主题标签"，不是"分类器"

- `blog.11tydata.cjs` 会自动追加集合名 `"blog"`。它只是**集合归属**（Eleventy 的集合就是按 tag 建的），
  **不是给读者看的分类词** —— 列表页与详情页都把它滤掉，只显示主题标签。
  详情页原先**不过滤** ⇒ 每篇文章的 meta 行顶部都多一个 `· blog`
  （2026-10-20 实测：它在**详情页 h1 下方的 meta 行顶部**，不是页面底部）。
  **2026-10-20 12:30–13:00 场次已修**：`layouts/detail.njk` 现在用一份「滤掉集合名」的
  展示用标签（集合名仍留在原始 `tags` 里判定版式），并配了门禁 `scripts/check-tag-leak.cjs`（见 §2.5）。
  ⇒ 写文章时**主题标签照常写**，不用为它将就。
- 标签用**英文**（站内全英文），用可复用的主题词（`xarray` / `WRF` / `lightning`），
  不要用一次性短语，也不要为了凑数硬加。
- 最多显示 3 个 ⇒ 超过 3 个的部分读者看不到，**多写等于没写**。

### 2.3 `cover` 只写文件名，且必须是真 SVG

```yaml
cover: cover.svg          # ✅ 只写文件名，与 index.md 同目录
```

- 模板拼的是 `(post.url + post.data.cover) | relUrl` ⇒ **`post.url` 已经以 `/` 结尾**，
  所以 `cover` 只能是**同目录下的文件名**。写成 `cover.svg` ✔，写成 `assets/cover.svg` 或
  `/assets/img/x.svg` 都会被拼成 `/blog/<slug>//assets/...` 这种坏路径。
- **文件名必须是 `cover.<ext>`**（`cover.svg` / `cover.png` / `cover.jpg` / `cover.jpeg` /
  `cover.webp`）—— 构建脚本 `eleventy.config.js` 的 `copyCovers()` **只复制**这五种名字的文件。
  写成 `banner.svg` 这种，源码里有文件、F9 也会绿，但产物里根本没有它 ⇒ 封面 404。
  ⇒ 现在由**门禁 F15** 判红（见 §2.4）。
- **必须是真 SVG 文本**。历史上踩过的坑：文件叫 `cover.png`、里面装的却是 `<svg …>` 文本。
  服务器按扩展名发 `Content-Type: image/png`，浏览器拒绝解码，`naturalWidth = 0` ⇒ **裂图**。
  ⇒ 封面一律用 `.svg` 扩展名 + SVG 文本；实在要用位图，才用 `.png`/`.jpg` 并保证是真位图。
  ⇒ 现在由**门禁 F13** 判红：它把封面的**真实字节格式**与**扩展名**对账 ——
  扩展名骗人（`.png` 里装 SVG 文本、`.svg` 里装 PNG 字节）一律判红。
- **比例**：卡片槽是 16:9（`.card__media` 的 `aspect-ratio` + `object-fit: cover` ⇒ 会裁切），
  而模板写死 `width="800" height="450"` ⇒ 那是**槽位**比例，不是素材比例。
  ⇒ 素材本身也做 16:9 最省事：素材比例与槽位不一致时，门禁 IA4 会判红
  （IA4 认的是「声明比例 == 素材真实尺寸」，它分不出「槽位」与「素材」）。
  这条口径本身还在拍板中（台账 **待拍板 50**）。
- **当前封面是关着的**：`src/blog.njk` 里 `{% set useCovers = false %}`。
  开关何时打开由本人拍板（台账里登记着），在那之前写了 `cover` 也不会显示 ——
  但写了不亏，等开关打开就有图。
  ⚠️ **2026-10-21 订正**：旧注释里写的「blog / portfolio 的 front-matter 都写
  `cover: cover.png`、那个文件里装的是 SVG 文本」**已是过时事实** ——
  那批扩展名骗人的历史文件**早就不在仓库里了**（内容已归档删除）。
  关着开关的真正原因是**还没到开的时候**，不是那些文件还在。

### 2.4 本契约现在**有门禁守着**（判据对照）

自 2026-10-20 起，`scripts/check-blog-frontmatter.cjs` 把上面各条变成 build 时会自己跑的判据，
接在 `npm run build` 链上（`eleventy` **之前** ⇒ 日期写错时先看到可读提示，而不是 Eleventy 的内部堆栈）。

| 判据 | 管什么 | 对应条款 | 后果 |
|---|---|---|---|
| F1 | 文章形状必须是 `<slug>/index.md` | §1 | 判红（扁平文件会全挤到 `/blog/blog/`） |
| F2 | 目录名（= slug）小写 ASCII + 连字符 | §1 | 判红 |
| F3 | front matter 可解析 | §2 | 判红 |
| F4 | `title` 必需且是字符串 | §2 表 | 判红 |
| F5 | `date` 必需且是纯日期 `YYYY-MM-DD` | §2 / §2.1 | 判红 |
| F6 | `readingTime` 只能是纯数字 | §2 表 | 判红 |
| F7 | `tags` 只能是字符串数组 | §2 表 | 判红 |
| F8 | front matter 不得出现 `layout` / `permalink` | §1 | 判红 |
| F9 | `cover` 指向的文件必须同目录真实存在 | §2.3 | 判红 |
| F10 | `excerpt` 缺失 / 为空 | §2 表（"强烈建议"） | **note**（不拦 build） |
| F11 | `excerpt` 与 `title` 逐字相同 | §4 自查清单 | **note**（不拦 build） |
| F12 | 目录数据文件的自动注入字段齐不齐 | §1 | 判红（这一条**永远会跑**） |
| F13 | 封面的**真实字节格式**必须与扩展名一致 | §2.3 | 判红（扩展名骗人 ⇒ 裂图） |
| F14 | 封面判据的**覆盖度自证**（应验 == 实测） | §2.3 | 判红（空跑的门禁等于没有门禁） |
| F15 | 封面的**文件名**必须是 `cover.<ext>` | §2.3 | 判红（`copyCovers()` 不复制别的名字 ⇒ 404） |
| F16 | **博客集合不得为空**（至少 1 篇 `<slug>/index.md`） | §1 | 判红（空集合 ⇒ 逐篇判据一条都跑不到 ⇒ 内容路径没接上） |
| F17 | `description` 必需且是非空字符串 | §2 表 | 判红（缺了 ⇒ meta description 回落成站点通用描述） |
| F18 | `description` 不得逐字等于 `title` | §2 表 | 判红（复读标题 ⇒ 等于没改写） |
| F19 | `description` 不得逐字等于站点通用描述（`site.description`） | §2 表 | 判红（照抄通用描述 ⇒ 搜索结果里还是分不出这篇文章） |
| F20 | 集合内不同文章的 `description` 不得逐字相同 | §2 表 | 判红（共用一句 ⇒ 每篇文章的 snippet 一模一样） |
| F21 | **博客列表页**（`src/blog.njk`）必须自带一句 `description` | §2.6 | 判红（缺了 ⇒ `/blog/` 的四个 description 出口全回落成站点通用描述） |
| F22 | 列表页的 `description` 不得逐字等于它自己的 `title` | §2.6 | 判红（复读标题 ⇒ 等于没改写） |
| F23 | 列表页的 `description` 不得逐字等于站点通用描述（`site.description`） | §2.6 | 判红（照抄通用描述 ⇒ 搜索结果里它和自我介绍长得一模一样） |

- **判红 = "写错了"**（形态 / 类型 / 覆盖了自动注入）；**note = "忘了写"**（契约里标的是"建议"）。
  `excerpt` 缺失归 note 是本轮定的口径，是否升级为判红已登记为待拍板 46。
  `description` 缺失归**判红**（与 `title` / `date` 同级：缺了它，整篇文章的 meta description
  会回落到站点通用描述，站内每篇文章的搜索 snippet 就会一模一样）。
- **F21–F23 守的不是文章，是列表页**：`src/blog.njk`（`/blog/` 的模板）自己也要有一句
  `description`，且不得复读自己的标题、不得照抄站点通用描述 —— 详见 §2.6。
  这一族此前**一条门禁都没有**：本门禁的扫描面是文章目录 `src/content/blog`，
  从来不看列表页模板 ⇒ 列表页这一族是**零看守**的。
- 手动跑：`npm run check:blog-frontmatter`；证明判据本身有牙齿：`npm run check:blog-frontmatter-selftest`
  （在 /tmp 搭夹具站逐档注入缺陷；档位清单见该自测脚本的文件头）。
- 站内**已有文章** ⇒ 逐篇判据（F1–F15、F17–F20）现在**真的在跑**；
  而 F21–F23（列表页那一族）与文章数无关 —— 只要列表页模板在，它们就一直跑；
  而"站内 0 篇文章"这个状态改由 **F16 判红**挡住：空集合不是"暂时没写"，
  是**内容路径没接上**（`/blog/` 退化成空状态页、`feed.xml` 里没有任何条目、
  `sitemap.xml` 里没有任何文章路由），而且集合为空时逐篇判据一条都跑不到 ——
  门禁会 exit 0，但其实什么都没验。
- ⚠️ 封面那一半仍要**明说**：本站暂不写封面（`src/blog.njk` 的 `useCovers = false`）
  ⇒ F13 / F14 / F15 这些**逐封面**判据在真站上**当前未执行**（门禁会明说，不写成"通过"）。
- 判据有没有牙齿由上面那个自测的夹具站负责（其中有一档专门搭「0 篇文章」的夹具 ⇒ F16 判红）。
- ⚠️ 封面还有**另一道门禁在产物层**：`scripts/check-image-assets.cjs` 的 IA4 / IA5
  会在开关打开后核对封面 `<img>` 的**声明比例**与**素材真实尺寸**（位图或 SVG 都认）——
  它只看产物、且**分享图（og / twitter）必须仍是位图**（社交平台不解析 SVG）。

### 2.5 集合名与主题标签（另一条契约，门禁守着）

自 2026-10-20 起，`scripts/check-tag-leak.cjs` 守着另一条契约：
**集合名只用来判定版式与集合归属，不许出现在读者眼前**。

| 判据 | 管什么 | 后果 |
|---|---|---|
| T1 | 详情页的主题标签位上不得出现集合名 | 判红 |
| T2 | 主题标签必须**一个不少**地还在（防"过滤过头"：把标签全滤掉也算"修好了"） | 判红 |
| T3 | 详情页的**版式判定**必须完好 —— `isBlog` 仍由原始 `tags` 判定，底部仍回到 `/blog/` | 判红 |
| T4 | 列表页的徽章上不得出现集合名，主题标签徽章必须在 | 判红 |
| T5 | detail 版式的过滤链必须盖住**每一个**用这个版式的集合名 | 判红 |

- 手动跑：`npm run check:tag-leak`；证明判据本身有牙齿：`npm run check:tag-leak-selftest`（在 /tmp 搭夹具站逐档注入缺陷；档位清单见该自测脚本的文件头）。
- ⚠️ 它**不扫产物**：详情页版式上的集合名泄漏是**产物层**的问题，
  而产物层要等真的有文章才渲染得出来。
  它改成**用 Nunjucks 直接渲染仓库里真实的那个版式**（只把与标签无关的 `relUrl` / `date` 打了桩），
  所以站内有没有文章都不影响它跑。
- 集合名不是写死在门禁里的常量，而是从 `src/content/<集合>/<集合>.11tydata.cjs` 的
  「layout 指向哪个版式」推导出来的 ⇒ **新增集合忘了在版式里滤掉，这道门禁会自动判红**。
- T3 专门盯一种"看起来修好了"的错法：**把 `tags` 本身滤掉** —— 集合名确实不见了，
  文章却也被偷偷换成了首页版式（页脚变成 "Back to Home"，回不到列表页）。

### 2.6 列表页自己那一句（`src/blog.njk`）

`/blog/` 是**集合列表页**，它同样有四个 description 出口
（`<meta name="description">`、`og:description`、`twitter:description`、JSON-LD 的 `description`），
而这四个出口都来自模板的同一条回落链 `description or site.description`。

⇒ **列表页缺 `description` 时，四个出口全部印站点通用描述**（"PhD student at the Institute of…"）——
搜索结果里这个列表页和站内其它页面长得一模一样。
2026-10-23 实测：`/papers/`、`/about/`、`/404/` 各自都写了自己的一句，**唯独 `/blog/` 没写**。

⇒ 这一条现在由 **F21–F23** 判红（见 §2.4）：

- **F21** —— 列表页必须自带一句 `description`（非空字符串）；
- **F22** —— 不得逐字等于它自己的 `title`（`"Technical notes"` 是标题，不是描述）；
- **F23** —— 不得逐字等于站点通用描述（照抄它等于把"缺字段"换成"抄了句通用的话"，症状一样）。

⚠️ **这一族的门禁此前是空的**：front matter 门禁的扫描面是文章目录 `src/content/blog`，
**从不看 `src/blog.njk`** ⇒ 列表页这一族一度零看守。
⇒ 现在补上的只是**博客列表页这一族**；**其它单页模板**（`src/index.njk`、`src/about.njk` 等，
它们的 `description` 走 `eleventyComputed`）**还没有被任何判据覆盖** —— 那是另一条待办。

### 2.7 `draft`：标了它，这篇就不会被发布（但别当成保密手段）

| 字段 | 必需 | 类型 | 模板怎么用 | 写错会怎样 |
|---|---|---|---|---|
| `draft` | 可选 | 布尔 `true` / `false` | 标了 `true` ⇒ **这篇不发布**：页面不写进 `_site/`、不进任何集合 ⇒ `sitemap.xml`、`feed.xml`、`/blog/` 列表页里都看不到它 | 写成别的类型（字符串 / 数字）⇒ **一律按草稿处理**（宁可少发）；写成 `false` 或不写 ⇒ 照常发布 |

⚠️ **为什么单开一节**（2026-10-29 实测，不是假想）：
**Eleventy 3 完全不认识 `draft` 这个字段**（上游源码里 `draft` 零命中，上游只认 `permalink: false`）
⇒ 写 `draft: true` 原本**照常发布**：页面写进产物、正文进产物、`sitemap.xml` 2 处、
`feed.xml` 2 处（**连标题都进了订阅源**）、`/blog/` 列表页 2 处 —— 全链**零提示**。
⇒ 现在 `src/eleventy-draft.cjs` 把它接上了（三个内容目录各接两处：
`permalink` 侧不写盘 ＋ `eleventyExcludeFromCollections` 侧不进集合）。
⇒ 门禁 **DL1–DL3** 守着这个接线（见 `scripts/check-draft-leak.cjs`）。

⚠️ **它挡得住什么、挡不住什么**（这一条比字段本身更重要）：
- **挡得住**：被搜索引擎收录、进 RSS 订阅源、在 `/blog/` 列表页上出现、猜到 URL 直接访问。
- **挡不住**：⚠️ **源码面** —— 本站**发布仓就是源码仓**，而它是 **PUBLIC**
  ⇒ 草稿的**正文在 GitHub 上人人可读**（`src/content/blog/<slug>/index.md`），
  **git 历史里更是删不掉**。
  ⇒ **产物面抑制 ≠ 保密**。**真要保密，草稿就不能放进这个仓**（写在仓外）。

⇒ **写文章时**：还没写完的稿子，**先写在仓外**（本地未跟踪目录，或另一个私有仓），
等写好了再挪进来。要在仓内留一份草稿也可以 —— 它不会上线，但 GitHub 上看得到。

⚠️ **`draft` 只管博客文章，管不到论文**：
论文条目来自 `src/_data/site.js` 的 `publications`（**手写的数据常量**，不是集合），
`feed.xml`、`publications.bib`、`publications.ris`、`/papers/` 列表页都从它取数据
⇒ **一篇在 `site.js` 里登记的论文必然进这些出口**，与它有没有 `draft` 标记无关。
⇒ 论文要撤下，改的是 `site.js` 里的登记（删条目 / 撤资源），**不是** front matter。

---

## 3. 正文

### 3.1 语言

**站内文字一律英文**。`scripts/check-lang.cjs` 扫 `src/` 下的 `.njk / .md / .css / .js / .svg`，
产物层再兜一次；中文只豁免三处（`src/_data/`、`src/assets/img/og/`、`src/robots.njk`），
且豁免理由都写在该脚本文件头里。

- `docs/` 下的仓库文档（像本文件）**不在扫描范围**，可以用中文；
  但**文章正文**是站内页面 ⇒ 必须是英文。
- 注释里也别写中文：注释在 `.md` / `.njk` 里，一样会被扫到。

### 3.2 结构

推荐骨架（英文标题，结论先行）：

```markdown
## What this shows
<!-- 一段话把结论说完：做了什么、得到什么。读者只看这一段也该知道值不值得读。 -->

## How it was done
<!-- 方法：数据来源、参数、软件版本。写出别人能不能复现。 -->

## Results
<!-- 结果：数字、图、表。每个数字都要能追到出处。 -->

## Caveats
<!-- 局限：哪里不稳、哪里别外推。 -->

## Further reading
<!-- 相关论文、数据集、代码链接。真实 URL，查不到就不写。 -->
```

- **结论先行**：第一段就给结论，不要从背景铺陈开始。
- **出处随数据走**：任何数字都要在同页能找到它的来源（论文 DOI、数据集 DOI、脚本路径）。
  数据集引用请给 DOI + 版本 + 许可（例：DOI `10.5281/zenodo.18041880`，v2.0，CC BY 4.0）。
- **不编造**：不虚构数据、结论、引用、实验结果；写不出来就写"本轮无内容可写"，
  不要用似是而非的句子填空。链接找不到真实 URL 宁可不加。
- **长串**：长的 DOI / URL 尽量放进行内 `code`（`overflow-wrap: anywhere` 的全局兜底在 flex 容器里
  仍可能被长串顶宽）；`scripts/check-wrapping.cjs` 守的是**样式**层的兜底规则，不替你管正文。

### 3.3 无障碍与链接（门禁会在 build 时拦）

- 每页**恰好一个 `<h1>`**，且**不得跳级**（`h2` 之后不能直接 `h4`）—— `scripts/check-a11y.cjs` A7。
  详情页的 h1 由 `title` 自动生成 ⇒ 正文里**不要**再写 `# 一级标题`。
- 每张真实 `<img>` **必须带 `alt`**；纯装饰的图显式写 `alt=""` —— `scripts/verify-site.cjs` 判据 25。
  `alt` 写**图在说什么**，不是文件名。
- 任何 ARIA 引用（`aria-labelledby` / `aria-describedby` / `aria-controls` / `aria-owns` /
  `<label for>` / `<th headers>`）指向的 id **必须在同一页真实存在** —— a11y A5。
- 本地链接与图片**必须在产物里真实存在** —— `verify-site.cjs` 判据 1。
  **站内引用一律用相对路径**，不要用根绝对路径（如 `/about/`）：根绝对路径会判红
  （`verify-site.cjs` 判据 1 与 `check-404-depth.cjs` 的 E3），因为它会打破
  "整个文件夹换个挂载点也能跑"这条前提（404 页除外 —— GitHub Pages 的 404 语义决定它只能走根绝对）。
  文章正文（页面在 `/blog/<slug>/`）里的写法：`../` 回博客列表、`../<slug>/` 去同侪文章、
  `../../about/`、`../../papers/<slug>/`、`../../#<首页锚点>`。
  跨站链接带 `rel="noopener noreferrer"`。
- 表格必须有表头（`<th>`，多级用 `scope` / `headers`）—— a11y 常规项，缺了会被 a11y 门禁拦。

---

## 4. 发一篇之前的自查清单

```
□ 目录名是小写连字符，且是永久链接想清楚的那个名字
□ front matter 没有 layout / permalink（自动注入，别覆盖）；tags 是**合并**、照常写主题标签，但别重复写 "blog"
□ date 只到日（YYYY-MM-DD），readingTime 是纯数字
□ excerpt 是一句话，且**不复读标题**
□ description 写了自己那一句（改写标题，不复读它），且与站内其它文章不重样
□ 正文全英文，注释也没有中文
□ 恰好一个 h1，标题不跳级
□ 每张图都有 alt
□ 每个数字都能在页内找到出处
□ 站内链接与图片在产物里存在
□ npm run build  exit 0
□ npm run check:blog-frontmatter  exit 0（front matter 契约门禁；note 不拦，判红才拦）
□ npm run check:tag-leak  exit 0（集合名没漏到详情页 / 列表页的标签位上）
□ /blog/ 列表卡出现：excerpt / readingTime / 主题标签
□ /blog/<slug>/ 打得开，标题、日期、阅读时长正常
□ feed.xml 里能看到新文章（feed.njk 已用 collections.blog，无需额外配置）
□ sitemap.xml 里有新路由
```

---

## 5. 已知缺陷（写文章时不必将就，但要知道）

| 现象 | 原因 | 状态 |
|---|---|---|
| ~~详情页多一个 `· blog` 标签（实测在 h1 下方的 meta 行顶部）~~ | `layouts/detail.njk` 渲染 `tags` 时没过滤集合名（列表页过滤了） | **已修**（2026-10-20 12:30–13:00 场次）· 版式改用「滤掉集合名的展示用标签」，门禁 `scripts/check-tag-leak.cjs` 守着（见 §2.5） |
| 封面不显示 | `src/blog.njk` 的 `useCovers = false`（开关还没到开的时候；那批扩展名骗人的历史文件早就不在仓库里了，见 §2.3） | 待本人拍板何时开 |
| ~~`/blog/` 是空状态页~~ | 站内当时还没有文章 | **已修**（2026-10-23 D94 场次）· 首批 3 篇文章已落地，门禁 **F16** 守着「集合不得为空」 |

---

## 6. 相关文档

| 文档 | 管什么 |
|---|---|
| `docs/ROADMAP.md` | 目标与里程碑顺序（当前是 M1 内容引擎） |
| `docs/IMPROVEMENT-LOG.md` | 每一轮改了什么、中央「待拍板」台账 |
| `docs/design-system.md` | 颜色 token / 字号阶梯 / 间距 / 圆角阴影（写正文不用管，配图与排版要看） |
| `docs/papers-interaction.md` | 论文精读页的交互规范 |
| `docs/information-architecture.md` | 信息架构规划稿（含尚未实现的 `/tags/` `/search/` `/cv/`） |
