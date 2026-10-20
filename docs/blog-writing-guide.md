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

⇒ front matter 里**再写** `layout` / `permalink` 不是"更保险"，是**覆盖**它们，会把版式与 URL 弄坏。

⚠️ **2026-10-20 实测订正**：`tags` **不是覆盖，是"合并"** ——
front matter 写的 `tags` 与自动追加的 `"blog"` 会**并成一份**，
渲染顺序是 `"blog"` 在前、主题标签在后（实测渲染出 `· blog · TRMM · lightning`）。
⇒ 主题标签照常写即可，但**不要指望它替换掉** `"blog"`；也**不要**在 front matter 里再写一遍 `"blog"`。

⇒ 这三个字段现在**有门禁拦**：`layout` / `permalink` 写进 front matter ⇒ 判红（判据 F8，见 §2.4）。

---

## 2. front matter 契约

```yaml
---
title: "Stage-dependent lightning–radar relationships in TRMM thunderstorms"
date: 2026-10-20
excerpt: "A K-means classifier on radar echo structure splits 16 years of TRMM storms into three stages; the lightning-intensity relation turns out to be stage-specific rather than one pooled trend."
readingTime: 12
tags: ["TRMM", "lightning", "radar"]
---
```

| 字段 | 必需 | 类型 | 模板怎么用 | 写错会怎样 |
|---|---|---|---|---|
| `title` | **是** | 字符串 | 列表卡标题、详情页 `<h1>`、feed `<title>` | 缺失 → 详情页 h1 空白、列表卡无名 |
| `date` | **是** | `YYYY-MM-DD` | 列表卡眉标、详情页日期、feed `pubDate`、`prev/next` 排序 | 见 §2.1 |
| `excerpt` | 强烈建议 | 字符串 | 列表卡摘要（**一句话**） | 缺失 → 卡片没有摘要，只剩标题，看不出值不值得点 |
| `readingTime` | 建议 | **纯数字** | 模板直接拼 `{{ readingTime }} min read` | 写成 `"12 min"` → 页面显示 `12 min min read` |
| `tags` | 可选 | 字符串数组 | 列表卡主题标签（**最多显示 3 个**） | 见 §2.2 |
| `cover` | 可选 | **文件名**（如 `cover.svg`） | 列表卡封面 | 见 §2.3 |

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

- `blog.11tydata.cjs` 会自动追加集合名 `"blog"`。列表页**会把它过滤掉**（只显示主题标签，最多 3 个）；
  详情页 `layouts/detail.njk` **目前不过滤** ⇒ 会出现一个 `· blog` 的尾巴
  （2026-10-20 实测：它在**详情页 h1 下方的 meta 行顶部**，不是页面底部）。
  （这是已知缺陷，见 `docs/IMPROVEMENT-LOG.md`；写文章时**主题标签照常写**，不用为它将就。）
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
- **必须是真 SVG 文本**。历史上踩过的坑：文件叫 `cover.png`、里面装的却是 `<svg …>` 文本。
  服务器按扩展名发 `Content-Type: image/png`，浏览器拒绝解码，`naturalWidth = 0` ⇒ **裂图**。
  ⇒ 封面一律用 `.svg` 扩展名 + SVG 文本；实在要用位图，才用 `.png`/`.jpg` 并保证是真位图。
- **当前封面是关着的**：`src/blog.njk` 里 `{% set useCovers = false %}`。
  原因是上面那批历史文件的扩展名骗了服务器。开关何时打开由本人拍板（台账里登记着），
  在那之前写了 `cover` 也不会显示 —— 但写了不亏，等开关打开就有图。

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

- **判红 = "写错了"**（形态 / 类型 / 覆盖了自动注入）；**note = "忘了写"**（契约里标的是"建议"）。
  `excerpt` 缺失归 note 是本轮定的口径，是否升级为判红已登记为待拍板 46。
- 手动跑：`npm run check:blog-frontmatter`；证明判据本身有牙齿：`npm run check:blog-frontmatter-selftest`
  （在 /tmp 搭夹具站逐档注入缺陷，15 档）。
- ⚠️ 站内**还没有文章** ⇒ 逐篇判据（F1–F9 / F11）在真站上**当前未执行**（门禁会明说这一点，不写成"通过"）；
  判据有没有牙齿由上面那个自测的夹具站负责。

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
  链接到别的页面用站内绝对路径 `/about/`；跨站链接带 `rel="noopener noreferrer"`。
- 表格必须有表头（`<th>`，多级用 `scope` / `headers`）—— a11y 常规项，缺了会被 a11y 门禁拦。

---

## 4. 发一篇之前的自查清单

```
□ 目录名是小写连字符，且是永久链接想清楚的那个名字
□ front matter 没有 layout / permalink / tags（自动注入的，别覆盖）
□ date 只到日（YYYY-MM-DD），readingTime 是纯数字
□ excerpt 是一句话，且**不复读标题**
□ 正文全英文，注释也没有中文
□ 恰好一个 h1，标题不跳级
□ 每张图都有 alt
□ 每个数字都能在页内找到出处
□ 站内链接与图片在产物里存在
□ npm run build  exit 0
□ npm run check:blog-frontmatter  exit 0（front matter 契约门禁；note 不拦，判红才拦）
□ /blog/ 列表卡出现：excerpt / readingTime / 主题标签
□ /blog/<slug>/ 打得开，标题、日期、阅读时长正常
□ feed.xml 里能看到新文章（feed.njk 已用 collections.blog，无需额外配置）
□ sitemap.xml 里有新路由
```

---

## 5. 已知缺陷（写文章时不必将就，但要知道）

| 现象 | 原因 | 状态 |
|---|---|---|
| 详情页多一个 `· blog` 标签（实测在 h1 下方的 meta 行顶部） | `layouts/detail.njk` 渲染 `tags` 时没过滤集合名（列表页过滤了） | 待修，见日志台账 |
| 封面不显示 | `src/blog.njk` 的 `useCovers = false`（历史文件扩展名骗服务器导致裂图） | 待本人拍板何时开 |
| `/blog/` 是空状态页 | 站内还没有文章 | 随 M1-3 解决 |

---

## 6. 相关文档

| 文档 | 管什么 |
|---|---|
| `docs/ROADMAP.md` | 目标与里程碑顺序（当前是 M1 内容引擎） |
| `docs/IMPROVEMENT-LOG.md` | 每一轮改了什么、中央「待拍板」台账 |
| `docs/design-system.md` | 颜色 token / 字号阶梯 / 间距 / 圆角阴影（写正文不用管，配图与排版要看） |
| `docs/papers-interaction.md` | 论文精读页的交互规范 |
| `docs/information-architecture.md` | 信息架构规划稿（含尚未实现的 `/tags/` `/search/` `/cv/`） |
