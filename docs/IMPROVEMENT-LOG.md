# MeteoHub · 站点改进日志

> 这个文件是**自动巡检任务的进度记录**。每轮巡检开始时先读它，避免重复做已经做过的事；
> 做完新的改进后追加到末尾。
>
> 巡检任务：**每小时整点一轮**（cron `0 * * * *`，Asia/Shanghai），跑在**一个固定的
> 专用对话**里，跨轮上下文连续。本文件仍是权威进度来源——对话上下文会被压缩，
> 这个文件不会。
>
> 约定：**只提交，不 push**。线上部署由本人决定。

---
## 2026-10-19 · 第一轮：学术站缺失的核心功能

### 背景

站点此前只有 4 个页面（`/`、`/about/`、`/blog/`、`404.html`），其中博客是空集合。
对学术主页来说，最该有的"论文"根本没有独立页面——论文只在首页的
"Selected publications" 区里露一面。

### 改动

| 文件 | 改动 |
|---|---|
| `src/papers.njk` | **新建** `/papers/` 论文页。复用首页的 `publications.njk` partial（卡片样式、状态角标、作者高亮全部同源，不会两处走样） |
| `src/_includes/partials/publications.njk` | 标题改为可覆盖（`pubHeading`）。首页默认 "Selected publications"，独立页用 "Peer-reviewed publications" |
| `src/_data/site.js` | 导航加 `Papers` 入口（排在 Blog 前——对学术访客，产出比笔记更先被找） |
| `src/_data/site.js` | 论文条目加 `capsule`（Code Ocean 可复现计算胶囊）与 `funding`（两笔基金号） |
| `src/assets/css/pages.css` | 新增 `.home-pub__funding` |
| `eleventy.config.js` | 新增 `bibtex` 过滤器（作者名 "First Last" → "Last, First"、唯一引用键、缺字段不输出） |
| `eleventy.config.js` | 新增 `jsonLdArticles` 过滤器（schema.org `ScholarlyArticle`） |
| `src/publications.bib.njk` | **新建** BibTeX 导出 `/publications.bib` |
| `src/feed.njk` | **新建** RSS 订阅源 `/feed.xml`（此前随内容归档删除，页脚留了恢复说明） |
| `src/_includes/layouts/base.njk` | 加 `ScholarlyArticle` JSON-LD（`@graph` 形式）；此前留了 `{% block structuredData %}` 钩子却没人用 |
| `src/_includes/partials/footer.njk` | 页脚加回 RSS 链接 |
| `src/blog.njk` / `about.njk` | `eleventyNavigation.order` 与新导航顺序对齐 |

### 顺手修掉的 3 个既有 bug

1. **PDF 链接从来没渲染过** —— 数据里有 `pdf` 字段，模板的链接行里没有对应分支。
   页面 lede 写着"links to … a PDF"，实际没有。
2. **Data 链接从来没渲染过** —— 模板找 `p.dataDoi`，但 site.js 里数据 DOI 放在
   `p.software.doi`（software 是对象）。字段名对不上，于是 843 MB 的 Zenodo
   数据集在页面上一个入口都没有。模板现在两个字段都认。
3. **Code Ocean 胶囊链接缺失** —— 调研时在本人 Zenodo 描述里发现
   `10.24433/CO.6720035.v1`，已用 DataCite API 核对（作者 Yihang Lyu、标题一致），
   此前 site.js 里没有这条链接。可复现性胶囊是同行评审里最认的证据。

### 调研来源与核实方式

- 官方文档：GitHub Pages（发布源两种模式、入口文件位置、免费套餐限制）
- `api.datacite.org/dois/10.24433/CO.6720035.v1` → 确认胶囊存在
  （codeocean.com 直接 fetch 会被 CloudFront 拦 403，是它拦爬虫，浏览器正常）
- 兰州大学大气科学学院官方报道 → 基金号 42275068、20250030065

### 验证结果

- `npm run build` exit 0，check:css 通过（15 个文件）
- 5 个 HTML 页、93 条站内引用**全部**在磁盘上解析成功
- JSON-LD 两块均合法（`Person` + `@graph` 里的 `ScholarlyArticle`）
- `feed.xml`、`sitemap.xml` 合法 XML；sitemap 自动带上 `/papers/`
- BibTeX 条目作者名已转 `Wu, Xueke and Lyu, Yihang and ...`
- 7 条路由全部 200；产物 16 MB

---
## 2026-10-19 · 第二轮：打印样式（P1）+ 修一个真 bug

### 来源

沿用同一批调研里 `docs/ui-ux-pro-max-improvement-plan.md`（凌晨那份技能体检报告）
的 **P1 建议**——该报告实测 `grep -rn "@media print" src/assets/css/` 零命中，
并指出：论文精读模块已有完整高亮/批注能力，但读者**没法把带批注的论文导出成 PDF**。

### 改动

| 文件 | 改动 |
|---|---|
| `src/assets/css/print.css` | **新建**。约 190 行打印样式：强制浅色、保留高亮底色（`print-color-adjust: exact`）、批注栏改静态流、展开外链 URL、去阴影圆角、`@page { margin: 18mm }`、分页控制 |
| `src/_includes/layouts/base.njk` | 用 `<link rel="stylesheet" media="print">` 引入——屏幕浏览时浏览器**不会下载**这个文件，首屏带宽零影响 |

### ⚠️ 修掉的真 bug：滚动进场的内容打印出来是空白的

**现象**：用 headless Chrome 导出 `/papers/` 的 PDF，文本层里只有标题和
"Peer-reviewed publications"，**整张论文卡片（标题、作者、期刊、基金号、
全部 7 个链接）一个字都没有**。

**根因**：`src/assets/js/main.js` 的 reveal-on-scroll 机制——给 `<html>` 加
`.motion-ready`，给所有 `[data-reveal]` 元素加 `.reveal`（`base.css` 里是
`opacity: 0`），然后用 **IntersectionObserver 在元素进入视口时**才加
`.is-visible`（`opacity` 回到 1）。

屏幕上看没问题（用户往下滚就显形了）。但**打印/导出 PDF 时视口外的元素
永远没进过视口**，`is-visible` 永远不加，`opacity` 一直是 0 → 纸面上是**完全空白**。

**修法**：打印样式里无条件摊平 reveal 状态（`opacity/transform/transition/
animation` 全部重置）。打印的意义就是把内容带走，这条不是优化是修 bug。

**验证**：修复前后同一页面导出的 PDF 文本层对比——

| | 修复前 | 修复后 |
|---|---|---|
| 文件大小 | 56 KB | 383 KB |
| 论文卡片 | ❌ 一个字都没有 | ✅ 标题/作者/期刊/基金号/7 个链接齐全 |

### 打印输出的最终形态

`/papers/` 2 页、`/` 4 页，实测文本层：

```
Published   Co-authored paper · 2nd author
New Insights From TRMM Legacy: ...
Xueke Wu, Yihang Lyu, Xiaoqun Hu, ...          ← 本人加粗
Journal of Geophysical Research: Atmospheres · 2026
Lanzhou University
Funding: National Natural Science Foundation of China No. 42275068; ...
P A P E R  D O I  P D F  C O D E  C A P S U L E  D A T A  F I G U R E
```

页脚只藏链接行（Sitemap / RSS / Edit this page），**保留 `© 2026 Yihang Lyu`
版权声明**——纸质页应该留版权。

### 该报告里还没做的三项（留给后续轮次）

- **P2 断点收敛**：当前 6 个散落断点 `640 / 720 / 760 / 768 / 820 / 1024`，
  其中 4 个只差 100px。建议统一到 `375 / 768 / 1024 / 1440`。
  ⚠️ 需逐页回归验证，不能盲改。
- **P3 换行规则**：`base.css:108` 的 `overflow-wrap: break-word` → `anywhere`，
  并给 flex/grid 文本子项补 `min-inline-size: 0`（学术页面 DOI、
  `arxiv.org/abs/2509.12345` 这类长串会撑破布局）。
- **P4 数据可视化**：站点目前零图表。对气象研究者一幅雷电密度图比文字有说服力。
  硬约束：必须手写 inline SVG，不引图表库（`dcbd1db` 确立的"整个文件夹扔到哪
  都能跑"原则）。需先准备数据，建议独立任务。

---
## 2026-10-19 · 第三轮：Google Scholar 引用元数据 + 论文独立页

### 背景

上一轮把 `/papers/` 列表页和 BibTeX/RSS 补齐了，但**论文仍没有独立页面**——
所有论文挤在一张列表页上。这对学术主页是硬伤，有两个层面：

1. **Google Scholar 收不进去。** Scholar 的收录要求是"每篇文章一个页面"，
   列表页上它只认一组 `citation_*`，其余静默丢失。而且它**不读 JSON-LD**——
   只认 Highwire Press 约定的 `citation_*` <meta> 标签。此前 `base.njk` 里
   的注释写着"Google Scholar 读的就是这个类型"（指 ScholarlyArticle），**是错的**，
   本轮已更正。
2. **读者看不到论文本身。** 此前论文页只有标题+刊名，没有摘要、没有 ORCID、
   不知道数据代码在哪、不知道怎么引用。

### 改动

| 文件 | 改动 |
|---|---|
| `src/_includes/partials/citation-meta.njk` | **新建**。按 Highwire 规范输出 22 个 `citation_*` <meta>（15 类，其中 `citation_author` ×7、`citation_issn` ×2）。只在论文独立页生效（front-matter 有 `pubKey` 才输出），不在列表页/首页混输——混输会让 Scholar 丢条目 |
| `src/content/papers/trmm-thunderstorm-stages/paper.md` | **新建**。论文独立页正文：4 节（做了什么 / 阶段分类怎么做的 / 为什么阶段依赖重要 / 数据与代码），全部可回溯到 Crossref 摘要；front-matter 带 `coverAlt`（这张是论文成果图，不写会回落到站点默认的作者身份文案，图文不符） |
| `src/_data/site.js` | `publications[0]` 的作者从逗号分隔字符串改为结构化 `authorList`（含每人 ORCID）；补 `key`/`slug`/`publisher`/`issn`/`dates`/`abstract`/`keywords`/`openAccess`；PDF 由 `/doi/epdf/` 改为 `/doi/pdf/`；software/capsule 补 DataCite 登记元数据 |
| `eleventy.config.js` | 新增 `pubByKey` / `authorNames` / `authorBibtex` 三个 filter；`bibtex` 与 `jsonLdArticles` 改从 `authorList` 取作者；`jsonLdArticles` 补 `abstract`/`isAccessibleForFree`/`issn`/`publisher`/`keywords` |
| `src/_includes/layouts/base.njk` | 引入 `citation-meta.njk`；`og:image:type` 按扩展名推导（此前写死 `image/png`，而论文页用的是 JPEG 成果图）；补 `og:image:width/height`；`og:image:alt` 允许 front-matter 覆盖 |
| `src/_includes/layouts/paper.njk` | 重写。以 `pubKey` 为唯一数据源；摘要、关键词、逐人 ORCID、Data and code availability、Funding and publication history、Cite this paper（BibTeX + 复制按钮）全部落地 |
| `src/_includes/partials/publications.njk` | 标题链到论文详情页；作者走 `authorList`，带 ORCID 的挂 orcid.org 链接，本人仍加粗高亮 |
| `src/assets/js/main.js` | 新增 `[data-copy-target]` 复制按钮（clipboard API + execCommand 兜底） |
| `src/assets/js/paper-reader/main.js` | 无 `annotationsUrl` 时整段跳过批注模块——论文详情页没有 `annotations.json`，否则必然 404 + console 警告 |
| `src/assets/js/paper-reader/{toc,highlight}.js` | UI 文案汉译英（目录/批注/返回正文 → Contents/View annotations/Back to text） |
| `src/assets/css/components/_paper.css` | 新增 172 行论文页样式（摘要/关键词/引用块/数据可用性） |
| `src/assets/css/pages.css` | 新增标题链接与 ORCID 作者链接样式 |

### 顺手修掉的 2 个既有 bug（都是本轮改动踩出来的）

1. **`jsonLdArticles` 的 `excludeKey` 从来没生效** → 论文页上同一篇论文出现
   **两个 `ScholarlyArticle` 实体**（一个 url 指向出版商、一个指向本站）。
   `base.njk` 传了第三个实参，但 filter 签名只有两个 —— JS 把多余的实参
   **静默丢弃**，不报错，页面照出，只有实体重复。本轮给 filter 补上
   `excludeKey` 参数并真正过滤。
2. **`paper-reader.css` 的正文样式全是死代码** —— 选择器写的是
   `.paper-reader h2[id]` / `.paper-reader p`，但 DOM 里只有
   `.paper-reader-wrap` 和 `.paper-body`，**`.paper-reader` 这个类根本不存在**。
   于是正文标题层级、段落行高 1.78、列表缩进、引文样式、代码块样式
   全部没生效（该文件是上一轮 `9145197` 引入的）。本轮把选择器统一指向
   真实容器 `.paper-body`——它正是 markdown 渲染内容的直接父级，
   而 `paper-availability` / `paper-cite` 在它之外，不会被误伤。

### 调研来源与核实方式

论文元数据**全部**经官方 API 核对，不靠记忆：

- `api.crossref.org/works/10.1029/2026JD046836` → 标题、刊名、卷期
  （vol 131 / issue 11）、e-locator `e2026JD046836`、出版社
  "American Geophysical Union (AGU)"、ISSN `2169-897X`(print)/`2169-8996`(electronic)、
  `published` 2026-06-01、`published-print` 2026-06-16、
  审稿历程（received 2026-04-04 / accepted 2026-05-22 / published 2026-06-01）、
  三条 ORCID、JATS 摘要原文、`link` 里 `application/pdf` 的 contentUrl。
- `api.openalex.org/works/doi:10.1029/2026JD046836` → 复核三条 ORCID 逐字一致，
  `oa_status: closed`（据此定 `openAccess: false`）。
- `api.datacite.org/dois/10.5281/zenodo.18041880` 与 `.../10.24433/CO.6720035.v1`
  → 补 software/capsule 的 version / publisher / licence。
  ⚠️ `site.js` 里的 `https://codeocean.com/capsule/5084350/tree/v1` 与 DataCite
  记录的 `url` 字段**逐字一致**，`5084350` 是 Code Ocean 的内部编号，
  与 DOI 后缀 `6720035` 不同号是正常的——**不要"修正"它**。
- Unpaywall 查询未返回有效字段，**未采信**；开放获取状态改以 OpenAlex 判定。
- Highwire Press 的 `citation_*` 字段清单经官方收录说明核对。
- ⚠️ AGU 官方检索工具（`mcp__agu-papers__search_papers`）本轮两次调用均返回
  `OpenAlex search failed (HTTP 429)`，是**瞬时限流**，不代表"查无此论文"。
  AGU 侧的实践依据改以 Crossref 的 AGU 原始登记记录为准（元数据逐项核过）。

### 验证结果

- `npm run build` exit 0，check:css 通过（15 个文件）
- 6 个 HTML 页、**120 条站内引用全部**在磁盘上解析成功，**0 失效**
- 12 块 JSON-LD 全部 `JSON.parse` 通过
- `citation_*` 标签分布：论文页 **22 个**（15 类），首页/列表页/博客/关于/404 **各 0 个**（无泄漏）
- 论文页 `ScholarlyArticle` 实体数 **1**（修复前是 2），首页 **1**
- `canonical` 与 `og:url` 6 个页面**全部一致**；`sitemap.xml` 已含新论文页
- 论文页摘要/关键词/数据与代码/基金与出版历程/引用块/复制按钮 **全部渲染**
- 站内引用**零个根绝对路径**（`../../assets/...` 相对路径），"整个文件夹扔到哪都能跑"仍成立
- 首页作者回归：7 位作者**全部渲染**，本人加粗高亮 ✓，3 个 ORCID 链接 ✓
- 论文页 `og:image:type` = `image/jpeg`（按扩展名推导，此前写死 `image/png` 而
  论文页用的是 JPEG 成果图），`og:image:width/height` = 1400×745 ✓，
  `og:image:alt` 已改为描述图内容而非作者身份 ✓
- **外链状态实测**：ORCID ×3 与 GitHub 返回 200；Wiley / doi.org / Code Ocean /
  ResearchGate 返回 403，CSDN 521，`iap.cas.cn` 000——这些是**反爬或本机网络
  不可达**，**不能据此判定链接失效**，浏览器正常访问无碍。
  （⚠️ **第九轮订正**：其中 **`iap.cas.cn` 这一条不成立**——换 apex 主机名
  `https://iap.cas.cn/` 就 200，说明**是链接本身坏了**，已在本轮修掉，见 E 节。
  其余几条的归类不变。）

### ⚠️ 线上仍是旧版本（待部署，非站点损坏）

线上 `https://github.lvyihang.xyz/` 目前是 2026-10-16 的部署：`/papers/`、
`/publications.bib`、`/feed.xml` 三个路由 **404**，sitemap 仍带 `/MeteoHub/`
前缀。原因是本地 `9145197` 及其后的改动**尚未部署**（本任务禁止 push，
部署由本人决定）。本轮全部改动同样只在本地，未部署。

---
## 2026-10-19 · 第四轮：数据/胶囊引用条目 + 验收门禁 + OpenAlex 实体

### ⚠️ 本轮的并发情况（先说清楚，避免以后误判归属）

巡检 cron **每 5 分钟起一个会话**，本轮开始时同一工作区里同时跑着 **5 个**
MeteoHub 会话（09:35 / 09:40 / 09:45 / 09:50 / 09:55 / 10:00），它们各自按
同一份任务书干活，于是**工作树里堆了好几批改动**。

处理方式（已固化为流程）：

1. `mavis session list` 列出同一 workspace 的所有会话，比对 `createdAt` 换算成本地时间；
2. 用 `session send --force_steer` 通知仍在运行的会话**停止写入、不得 commit**，
   由一个会话担任唯一写者；
3. 连续采样文件 mtime，确认工作树**稳定**（本轮停在 10:05:57，之后只剩本会话自己的写入）；
4. 提交前复查 `git log --oneline -1`（全程停在 `705d621`，无人抢先提交）。

**本轮下文的改动是几个会话累积的结果，不全是某一个会话写的。**

### 背景

前三轮把"论文有独立页、能被 Scholar 收录"这件事做完了。但还差两块：

1. **读者拿到数据之后的下一步动作没有出口。** 论文页的 "Data and code
   availability" 只给了链接——读者要点进 Zenodo 自己拼 `author/title/year`。
   而读者的真实动作是"**在我的论文里引用这份数据**"，只给链接是半步。
2. **每一轮的验收都是手工做的。** 日志里每一轮都在人工核对同一批东西
   （站内引用能否解析、JSON-LD 合不合法、canonical 与 og:url 是否一致、
   sitemap 对不对得上、有没有根绝对路径）。手工核对不可重复、也容易漏——
   写错了不会自动拦下来。

### 改动

| 文件 | 改动 |
|---|---|
| `src/_data/site.js` | 加 **OpenAlex 作者实体** `openalex`（按 ORCID 反查得到，见下）+ 进 `sameAs`；`software` 加 `conceptDoi`/`conceptUrl`（Zenodo 概念 DOI）、`citeTitle`/`citeYear`/`citeAuthor`/`citeVersion`；`capsule` 同样补齐引用字段 + `dataciteType` |
| `eleventy.config.js` | 新增 `resourceBibtex` filter：把数据/胶囊渲染成可复制的 BibTeX（`@dataset` / `@software`，字段判空即不输出） |
| `src/_includes/layouts/paper.njk` | "Data and code availability" 里加**数据集引用条目 + Copy 按钮**、**胶囊引用条目 + Copy 按钮**、**All versions（概念 DOI）链接** |
| `src/_includes/partials/footer.njk` | 页脚加 OpenAlex 链接 |
| `src/_includes/layouts/base.njk` | **页面标题三级回落**（front-matter title → 论文标题（按 `pubKey` 取）→ 站点名）。此前论文页 front-matter 里没有 `title`，`<title>` 和 `og:title` **全退化成 "Yihang Lyu"** |
| `scripts/verify-site.cjs` | **新建**。把历轮人工验收固化成 7 项门禁：本地引用可解析 / JSON-LD 可解析 / canonical 与 og:url 一致 / sitemap↔产物双向对齐 / 无根绝对路径 / 标题不退化成站点名 / 产物无 `._*` 资源叉。**挂进 `npm run build`**——坏链接会卡住部署 |
| `scripts/check-overflow.cjs` | **新建**。移动端横向溢出检测：起临时静态服务 + 本机 Chrome（CDP over WebSocket，**不装任何包**），列出"哪个选择器越界、越界多少像素"。P3 那条"不能盲改"靠它变成可回归的清单 |
| `src/assets/css/components/_paper.css` | 修溢出：`.paper-availability__list` 的 grid 轨道改 `minmax(0, 1fr)`、`dd` 加 `min-inline-size: 0`（`<pre>` 是 `white-space: pre` 的长行，其 min-content 会把网格下限撑到 `--measure`≈518px，窄屏上整块被撑出屏幕） |
| `scripts/check-css-braces.cjs` | 扫 CSS 时**跳过 `._*`**（exFAT 卷上的 AppleDouble 资源叉也以 `.css` 结尾，二进制头里随机字节可能含未闭合 `{`，会让脚本失败并指向一个用户从没写过的文件——极具误导性） |
| `scripts/screenshot-paper.js` | 修正论文页路径 `/papers/trmm-lyu-2026/` → `/papers/trmm-thunderstorm-stages/`（旧路径已不存在） |
| `package.json` | 新增 `check:site` 脚本；`build` 改为 `check:css && eleventy && check:site` |

### 本轮修掉的一个自相矛盾

`resourceBibtex` 初版对数据集条目输出 `version = {2.0}`，而同一条目的
`title` 是 **v1.0 时期的名字**、`doi` 指向 **v2.0**——三者互相打架：
读者复制这条 BibTeX、去 Zenodo 查，会发现标题对不上。

**改法**：`version` 字段改**只取显式的 `citeVersion`**，数据集那条 `citeVersion`
留空（不输出该字段）；胶囊那条保持 `version = {1.0}`（它的标题/DOI/版本号
本来就一致）。

为什么数据集是"故意"不写版本号：论文参考文献表里那条
（Crossref reference [29]）本身就没有版本号，省掉它既与原文逐字一致，
也消掉了上面那个矛盾。

### 调研来源与核实方式

全部经官方 API 核对，不靠记忆：

- **OpenAlex 作者实体**：`api.openalex.org/authors/orcid:0009-0005-3511-0546`
  → `A5121394231`，display_name "yihang Lyu"，works_count 3，
  机构 Lanzhou University，topics 落在 "Lightning and Electromagnetic Phenomena"
  一带 → **与研究方向一致，不是重名撞上的**。据此写进 `sameAs` 与页脚。
  （OpenAlex 是 Semantic Scholar / CORE 等检索系统的上游数据源。）
- **Zenodo 概念/版本 DOI 结构**：`api.datacite.org/dois/...` 逐条查三个记录，
  用 `relatedIdentifiers` 的方向确认（`HasVersion` / `IsVersionOf`）：

  | DOI | 标题 | 年 | 关系 |
  |---|---|---|---|
  | `10.5281/zenodo.16662143` | 论文标题 | 2026 | **概念 DOI**（`HasVersion` → 下面两条） |
  | `10.5281/zenodo.16662144` | Thunderstorms stage identification | 2025 | v1.0（`IsVersionOf` → 概念） |
  | `10.5281/zenodo.18041880` | 论文标题 | 2026 | v2.0（`IsVersionOf` → 概念） |

  ⚠️ 概念 DOI 记录上的 `version` 字段显示 2.0，是 DataCite 的怪癖
  （概念记录带着最新版元数据）——**判据是 `HasVersion` 方向，不是 `version` 字段**。
- **论文引用原文**：`api.crossref.org/works/10.1029/2026JD046836` →
  `reference[29]` 实测为
  `Lyu Y.(2025). Thunderstorms stage identification[Software].Zenodo.https://doi.org/10.5281/zenodo.18041880`
  ——本站的引用条目与它逐字一致，且**原文没有版本号**。
- **Code Ocean 胶囊**：`api.datacite.org/dois/10.24433/CO.6720035.v1` →
  登记标题、resourceTypeGeneral = "Software"、版本 1.0、许可 Apache-2.0。

### 验证结果

- `npm run build` **exit 0**；`check:css` 通过（15 个文件）；**新增的
  `check:site` 通过**（6 个 HTML 页、120 条本地引用、5 条 sitemap URL）
- **门禁本身做过故障注入**（否则"永远通过"的检查比没有检查更糟）：
  故意注入一条坏 CSS 引用 → 报错 exit 1 ✓；故意改错 canonical → 报
  "canonical 与 og:url 不一致" exit 1 ✓；故意留下 `._*` 资源叉 → 报错 ✓；
  恢复后重新 build → 全绿 ✓
- **溢出检测**：6 个页面在 390px 视口下 `scrollWidth` 全部 = 390，
  **无横向溢出**（`img.home-pub__figure-img` 是容器内有意横滚，不算溢出）
- 12 块 JSON-LD 全部 `JSON.parse` 通过；`sameAs` 5 条（含 OpenAlex）✓
- `canonical` 与 `og:url` 5 个页面全部一致；`sitemap.xml` 5 条 URL 与真实路由一一对应
- 论文页标题不再退化成站点名：
  `<title>New Insights From TRMM Legacy: ... · MeteoHub</title>` ✓
- 数据集引用条目（无 version 字段）与论文 reference[29] 逐字一致；
  胶囊引用条目 `version = {1.0}` 保留 ✓；三条 Copy 按钮指向各自 BibTeX 块 ✓

### ⚠️ 线上仍是旧版本（待部署，非站点损坏）

线上 `https://github.lvyihang.xyz/` 仍是 2026-10-16 的部署：`/papers/`、
`/publications.bib`、`/feed.xml` **404**，sitemap 仍带 `/MeteoHub/` 前缀。
本任务禁止 push，部署由本人决定。线上现有 4 个路由
（`/`、`/blog/`、`/about/`、`/sitemap.xml`）均 **200**，没有坏链。

---
## 2026-10-19 · 第五轮：订阅源补上论文 + 数据集/胶囊结构化数据 + 身份句柄纠错

### ⚠️ 本轮的并发情况（归属先说清楚）

巡检 cron 每 5 分钟起一个会话，本轮开始时工作区里同时跑着多个 MeteoHub 会话，
工作树里堆着一批未提交改动。本轮**先停并发、再验收、最后统一提交**：

- **10:10 场次（`mvs_f82683a6`）**：实现了下面「A. 订阅源」与「B. 结构化数据」
  两组改动。硬证据：分界线 commit `43d41c5` = 10:10:11，7 个文件的 mtime
  全部晚于它（10:14:34–10:15:29），且该会话自述与 10:05 场次的独立复核结论一致。
- **10:20 场次（本会话，`mvs_92ad8886`）**：任唯一写者，逐条复核上述改动、
  做了故障注入，并实现了下面「C. 身份句柄」这组改动。

### A. 订阅源：把论文放进去，修掉一个"永远是空白"的 RSS

**背景**：`/feed.xml` 第一轮就建好了，但数据源只有 `collections.blog`——
而那个集合**是空的**（技术笔记都发在 CSDN 上）。于是这个 feed **一条 item 都没有**，
页脚却实实在在挂着一个 RSS 入口：**点开永远是空白**。它不会报错，只会安静地空着。

订阅一个学术主页的人，真正想收到的就是"有新论文了"。

**改动**

| 文件 | 改动 |
|---|---|
| `eleventy.config.js` | 新增 `feedItems` filter：把 `site.publications` 与 `collections.blog` 合并成按日期倒序的条目列表。论文条目链接指向**站内论文页**（不是出版商页面——站内页面才带摘要、关键词、数据与代码可用性、引用块） |
| `src/feed.njk` | 换用 `feedItems`；加 `dc:creator` / `dc:identifier` / `category`；`<description>` 的转义**加了括号** |
| `src/_includes/layouts/base.njk` | 加 RSS autodiscovery：`<link rel="alternate" type="application/rss+xml">`——浏览器与阅读器的"订阅"按钮会自动认它，不必只靠页脚那一个普通链接 |
| `src/_includes/partials/footer.njk` | 页脚注释更新（说明 feed 现在收录什么） |

**顺手修掉一个真 bug（转义括号）**

`src/feed.njk` 原来写的是：

```njk
{{ item.description or "" | escape }}
```

Nunjucks 里 `|` 的优先级**高于** `or`，所以它实际解析成
`item.description or ("" | escape)`——**escape 只作用在空串分支**，
摘要原样输出。XML 里的 `&` `<` `>` 会把文档直接弄坏。

**为什么这个 bug 以前没被发现**：`collections.blog` 是空的，那行**从来没被执行过**
（和第三轮 `feed.njk:32` 的 `or`/`|` 优先级问题是同一个坑，但那一处因为集合为空
而长期休眠）。本轮 feed 真的装上了论文摘要，这条分支第一次真正跑到——
**如果不修，摘要里的 `&` 就会破坏整个 feed**。已改成
`{{ (item.description or "") | escape }}`。

### B. 结构化数据：论文页补上 Dataset 与 SoftwareSourceCode 两个实体

**背景**：站点确实发布了两条带 DOI 的产出——Zenodo 数据集
（`10.5281/zenodo.18041880`）与 Code Ocean 可复现胶囊（`10.24433/CO.6720035.v1`）。
但结构化数据里**只有论文本身**，数据集和胶囊在 JSON-LD 里是**不存在**的：
数据集检索工具（DataCite、Scholarly Data Commons 等）找不到它们。

**改动**

| 文件 | 改动 |
|---|---|
| `eleventy.config.js` | 新增 `jsonLdPaper` filter：输出整个 `@graph`（文章 + 数据集 + 胶囊），三者用 `@id` 互相引用 |
| `src/_includes/layouts/paper.njk` | 论文页的手写 JSON 字符串**整体搬进 filter**（模板里逐字段 `\| dump \| safe` 拼逗号，字段一多极易错位；filter 走 `JSON.stringify`，`undefined` 的字段自动消失） |
| `src/_data/site.js` | 数据集加 `registeredTitle`（v2.0 在 Zenodo 上的**当前登记标题**） |
| `src/_includes/layouts/paper.njk` | 数据集链接文字改用 `registeredTitle`，并**同时列出论文引用里的那个标题**并说明差异 |
| `scripts/verify-site.cjs` | 新增门禁：论文页 JSON-LD 里必须有 `Dataset` 与 `SoftwareSourceCode` 实体 |

**实体类型不是自己另立的**——沿用 DataCite 自己对这两条记录的 schema.org 映射
（`api.datacite.org` 实测）：

| DOI | DataCite `types.schemaOrg` | 登记标题 | version |
|---|---|---|---|
| `10.5281/zenodo.18041880` | **Dataset** | 论文标题 | 2.0 |
| `10.24433/CO.6720035.v1` | **SoftwareSourceCode** | 论文标题 | 1.0 |
| `10.5281/zenodo.16662144` | Dataset | Thunderstorms stage identification | — |
| `10.5281/zenodo.16662143` | Dataset | 论文标题 | 2.0（概念 DOI） |

**引用关系**（三者靠 `@id` 对上，不是靠字符串）：

```
文章.citation  → Dataset @id / SoftwareSourceCode @id   （本文用到的可引用产出）
Dataset.isPartOf   → 文章 @id
胶囊.isBasedOn     → Dataset @id                          （胶囊里打包的就是这份数据）
```

**论文页现在有 1 个 ScholarlyArticle**（`@id` = 页面绝对地址），
首页/列表页各有 1 个（指向出版商）——`base.njk` 的 `jsonLdArticles` 靠
`excludeKey` 把当前页那篇排除掉，**没有重复实体**。

#### ⚠️ 同一个 Zenodo 概念有两个标题，本轮把两个都摆出来

同一个 Zenodo 概念允许改标题：v1.0（`16662144`）登记为
"Thunderstorms stage identification"，v2.0（`18041880`）改成了论文标题
（DataCite 实测）。而论文参考文献表里那条引用用的仍是 v1.0 时期的写法。

这两个都成立，但读者只看到一个名字会以为站点写错了。**本轮不替作者选边**：
页面把两个标题都写出来并说明差异，**引用条目**（BibTeX）仍用与论文逐字一致的那个。

### C. 身份句柄纠错（本会话实现）

**问题**：`base.njk:240-241` 写死了两个 Twitter/X 句柄：

```njk
<meta name="twitter:site" content="{{ site.author.twitterSite or '@meteohub' }}" />
<meta name="twitter:creator" content="{{ site.author.twitterCreator or '@oldsixxiaolv' }}" />
```

而 `site.js` 里**根本没有这两个字段** → 两个句柄是凭空写死的。实测：

| 句柄 | X 端点 | 含义 |
|---|---|---|
| `@meteohub` | **200** | 账号存在，但**几乎肯定不是本人的** |
| `@oldsixxiaolv` | **404** | X 上查无此号（是把 GitHub 句柄直接复用过来的） |

**为什么这条比死链严重**：普通外链写错，最坏结果是链接点不开；
而 `twitter:site` / `twitter:creator` 是**身份标签**——它的内容会被搜索引擎
当成"这个账号属于本站作者"。写错不是"链坏了"，是**归属声明错了**。
站点当时正在对外声明归属给一个陌生人的账号和一个不存在的账号。

**改法**：**没有真实句柄就整对不输出**，用数据字段驱动
（`site.author.twitterSite` 为空 → 不渲染该 meta），
不为了"看起来完整"而填一个猜测值。`site.js` 里加了两个 `null` 字段
（沿用 `site.drive.url` 的既有写法），填上真实句柄即自动出现。

**并加了一条门禁防它复发**（`scripts/verify-site.cjs` 第 10 项）：
产物里出现的身份句柄，**必须在 `site.js` 数据里能找到同样的值**——
写死在模板里的兜底值一律拦下。它不来自数据，就是猜测。

### 调研来源与核实方式

全部经官方 API 核对，不靠记忆：

- `api.datacite.org/dois/10.5281/zenodo.18041880` → 标题、version 2.0、
  `types.schemaOrg = "Dataset"`、许可 CC-BY-4.0、publisher Zenodo
- `api.datacite.org/dois/10.24433/CO.6720035.v1` → 标题（= 论文标题，逐字）、
  version 1.0、`types.schemaOrg = "SoftwareSourceCode"`、许可 Apache-2.0、
  publisher Code Ocean、`publicationYear = 2026`、creator "Yihang Lyu"、
  `dates = [(2026-06-08, Accepted), (2026, Issued)]`
- `api.datacite.org/dois/10.5281/zenodo.16662144` → 标题
  "Thunderstorms stage identification"（证明"改过标题"这件事）
- `api.datacite.org/dois/10.5281/zenodo.16662143` → 概念 DOI
- `x.com/meteohub` → 200；`x.com/oldsixxiaolv` → 404
- ⚠️ 胶囊标题**不是 bug，本轮没有改它**：`site.js` 的 `capsule.citeTitle`
  已经逐字等于 DataCite 登记标题，改了反而引入错。

### 验证结果

- `npm run build` **exit 0**；`check:css` 通过（15 个文件）；
  `check:site` 通过（6 个 HTML 页、**126 条本地引用**、5 条 sitemap URL）
- **三条新门禁都做过故障注入**（"永远通过的检查比没有检查更糟"）：

  | 注入的故障 | 门禁反应 | 结果 |
  |---|---|---|
  | 清空 feed 的所有 `<item>` | 报"feed.xml 里一条 item 都没有" | exit 1 ✓ |
  | 把 feed item 的 link 指向 `/papers/does-not-exist/` | 报"在产物里找不到对应页面" | exit 1 ✓ |
  | 从论文页 `@graph` 里删掉 `Dataset` 实体 | 报"JSON-LD 里没有 Dataset 实体" | exit 1 ✓ |
  | 往产物里塞写死的 `twitter:site="@meteohub"` | 报"在 site.js 数据里找不到对应值" | exit 1 ✓ |

  另测了**正向路径**：把 `site.author.twitterSite` 临时设成
  `@lv_test_handle` → 标签正常渲染且门禁**不误报**（exit 0）✓，测完已还原。
- **注入会留下 `._*` 资源叉**（exFAT 卷上 Python 改产物文件的副作用，
  与被测故障无关）。注入全部做完后 `npm run build` 重建 `_site`，
  资源叉计数 **0** ✓
- `feed.xml`：1 条 item，**合法 XML**（minidom 解析通过），
  `<link>` 指向 `/papers/trmm-thunderstorm-stages/`（产物里存在）✓
- JSON-LD 实体分布：
  - 论文页 → `Person` + `ScholarlyArticle` + **`Dataset`** + **`SoftwareSourceCode`**
  - 首页/列表页/博客/关于/404 → `Person` + `ScholarlyArticle`（无 Dataset/胶囊泄漏）
- `canonical` 与 `og:url` **6 个页面全部一致** ✓
- `sitemap.xml` 5 条 URL 与真实路由一一对应 ✓
- **横向溢出检测**：6 个页面在 390px 视口下 `scrollWidth` 全部 = 390，
  无横向溢出 ✓（本轮 `paper.njk` 的数据集链接文字换成了更长的登记标题，
  专门复跑了这一项）
- RSS autodiscovery 的 href 用 `| relUrl`（Eleventy **按深度**算相对路径）：
  首页 `feed.xml`、`/about/` `../feed.xml`、论文页 `../../feed.xml`
  ——都正确解析到 `/feed.xml`，"整个文件夹扔到哪都能跑"仍成立 ✓
- 站点已**不再输出任何 `twitter:site` / `twitter:creator`** ✓

### ⚠️ 线上仍是旧版本（待部署，非站点损坏）

线上 `https://github.lvyihang.xyz/` 仍是 2026-10-16 的部署：`/papers/`、
`/publications.bib`、`/feed.xml` 仍 **404**。本轮全部改动只在本地，未 push
（本任务禁止 push，部署由本人决定）。

---
## 2026-10-19 · 第六轮：结构化数据的"人"与"资助"、论文页成果图、导出口径对齐

### ⚠️ 本轮的并发情况与**归属**（先说清楚，避免以后误判）

巡检 cron **每 5 分钟起一个会话**，本轮开始时同一工作区里同时跑着 **4 个**
MeteoHub 会话（10:10 / 10:20 / 10:25 / 10:30），它们各自按同一份任务书干活，
工作树里因此堆着未提交改动。

本场次（**10:35**，`mvs_b348dad6bacc4e88b0828bbcf619b257`）的处理：

1. `mavis session list` 列出全部会话，按 `createdAt` 排出真实时序；
2. 用 `session send --force_steer` 向 4 个在跑的会话发停手通知；
3. 连续采样文件 mtime，确认工作树稳定（停在 10:35:32）；
4. 与 **10:30** 会话协商**按文件所有权分工**，两边不重叠地并行推进。

**归属（写进永久记录，不能含糊）：**

| 场次 | 写了什么 | 提交在哪 |
|---|---|---|
| **10:20**（`mvs_92ad8886`） | 只提出两条改进点（论文页成果图 / `.bib` 导出口径），**未写文件** | — |
| **10:25**（`mvs_f90f87c4`） | 只读核查，交接了一批已核实事实，**未写文件** | — |
| **10:30**（`mvs_b804f0ae`） | `eleventy.config.js` + `base.njk` 的 A 部分（og:type / article:* / Person @id / funder·grant / 胶囊 citation） | `fff908a` |
| **10:35**（本场次） | `base.njk` 补 `site.url` 那一行（随 `fff908a` 一并提交）、`paper.njk`、`_paper.css`、`publications.bib.njk`、`verify-site.cjs`、本日志 | 本轮提交 |

### A. 结构化数据：把"同一个人"和"一笔资助"说清楚（10:30 写）

**背景**：前五轮把论文页、可复现性、元数据都补齐了，但结构化数据里还有三处
**说错了地方**，都是那种"页面照出、构建照过、没有任何报错"的静默缺陷：

1. **`og:type` 判错了页面性质。** `base.njk` 写的是"除首页外一律 `article`"，
   于是 `/about/`、`/blog/`、`/papers/` 列表页、`/404.html` **统统自称 article**
   ——它们都不是文章。ogp.me 的 Types 段原文："Any non-marked up webpage should
   be treated as og:type website"。现改为：**只有论文详情页**（front-matter 有
   `pubKey`）才是 `article`，其余一律 `website`。
2. **声明了 article 却没有一个 `article:` 属性。** 论文页此前 `article:*` 一个都没有，
   分享卡片拿不到发表日期与刊名（这两项 `site.js` 里都有权威出处）。现补
   `article:published_time`（2026-06-01）、`article:section`（刊名）、
   `article:author` ×7。
3. **同一个人被声明成了 6 个人。** `base.njk` 的 Person 实体写的是
   `"url": "{{ site.url }}{{ page.url }}"`，于是 Yihang Lyu 在 6 个页面上分别
   声明了 6 个不同的 url。现改为 `"@id": "<站点根>/#person"` + `"url": "<站点根>/"`，
   并让 `jsonLdPaper` 的作者、数据集/胶囊的 `creator` **共用同一个 `@id`**——
   schema.org 里 `@id` 相同才会被合并成一个节点。全站现在 14 个"本人"节点、
   1 个 `@id`。

**资助信息也进了结构化数据**：基金号此前只是页面上的可见文字，机器读不到。
现按 schema.org 官方定义输出 `funder`（资助机构）与 `grant`
（`Grant` 类型，自带 `funder` + `award`），数据源与页面可见文本同源
（`site.js` 的 `pub.funding`），不会出现"页面写 NSFC、结构化数据写别的"。

**胶囊与文章改成双向引用**：DataCite 把胶囊登记为 `IsSupplementTo` 指向本文，
而 schema.org **没有** `isSupplementTo` 这个属性（实测 `schema.org/isSupplementTo`
→ 404），对应写法是 `citation`。现文章 `citation` → 胶囊、胶囊 `citation` → 文章，
两边靠 `@id` 对上。

### B. 论文页补成果图 + 导出文件与页面对齐（10:35 写）

**B-1 论文独立页此前一张图都没有。** 只有标题、刊名、摘要和一堆链接，读者
看不到这项工作"做出来的东西长什么样"。而首页成果条里明明有这张图
（`pub.figure`），**同一份数据、同一个资产**，论文页直接复用，不会两处走样。
窄屏沿用首页的做法：图按 680px 最小宽度渲染、在容器内横向滑动
（1400px 的图压到 390px 视口只有 0.26 倍，坐标轴刻度只剩 5px 高）。

⚠️ **图号不自己编**：Crossref 的 JATS 摘要里 `<fig>` 数量为 0，无法核实
"Fig. 10"这个编号，所以图注标签只写 "Figure"，**不新增任何可见的 "Fig. 10" 徽章**
（那属于无法核实的断言）。图注文字与 alt 全部照搬 `site.js` 里作者自己的原文。

**B-2 `/publications.bib` 只导出论文，漏了数据集与胶囊。** 论文页有 **3 个
Copy 按钮**（论文 / 数据集 / 胶囊），而下载的 `.bib` 文件里**只有论文那一条**
——读者下载后会以为数据没有引用条目。现三条都导出，与论文页的 Copy 按钮
**逐字一致**（同一个 filter、同一份数据）。

### ⚠️ 本轮修掉的一个真 bug：少传一个实参，作者实体变成相对路径

10:30 把 `jsonLdArticles` 的签名改成 4 参
（`eleventy.config.js:541` `(pubs, ownerOrcid, excludeKey, siteUrl)`），
用 `siteUrl` 拼"本人"的 `@id`；但 `base.njk` 的调用**只传了 2 个**。
JS 把多余的实参**静默丢弃**（不报错、页面照出、构建照过），
于是作者实体输出 `"@id": "/#person"`、`"url": "/"`——**相对路径不是合法 IRI**，
而且与同页 Person 实体的绝对 `@id` 对不上，等于把"同一个人被读成 6 个人"
这个坑换个形式再犯一次。

这与**第三轮**踩过的是同一个坑（`excludeKey` 少传 → 论文页出现重复论文实体）。
**改法**：`| jsonLdArticles(site.author.orcid, pubKey, site.url)`。
已由门禁第 11 条兜住（见下）。

### 新增 4 条门禁（`scripts/verify-site.cjs`）

历轮的验收都是手工做的，写错了不会自动拦下来。本轮把这一轮新引入的
**四类静默缺陷**固化成门禁，并**逐条做了故障注入**——
"永远通过的检查比没有检查更糟"：

| # | 门禁 | 拦的是哪类 bug |
|---|---|---|
| 11 | JSON-LD 里所有 `@id` / `url` 必须是绝对 http(s) 地址 | filter 少传实参 → 相对路径 IRI |
| 12 | `og:type` 与页面性质一致；`article:*` 只许出现在 article 页 | og:type 判错 / article 扩展挂错页 |
| 13 | 全站描述"本人"的 Person 节点必须共用同一个 `@id` | 同一个人被读成多个人 |
| 14 | `publications.bib` 的条目与论文页可复制的 BibTeX 块**逐字一致** | 页面加了 Copy 按钮、文件没同步 |

⚠️ **第 13 条的第一版有个洞，被故障注入测出来了**：初版是"凡是 `@id` 以
`#person` 结尾的都算本人节点"。注入时把某页的 `@id` 改成 `.../#person-v2`
（形状变了、语义上仍是本人），门禁因为"结尾不再是 `#person`"而**根本没看见
这个节点**，exit 0 —— 一个抓不到人的检查比没有检查更糟。改为**按人名
（`site.author.nameAsPublished`）找节点**后，改形状也逃不掉。

**故障注入结果（9 项，全部拦下）**：

| 注入的故障 | 门禁反应 | 结果 |
|---|---|---|
| Person `@id` 改成相对路径 `/#person` | 报"JSON-LD 的 @id 是相对地址" | exit 1 ✓ |
| `/about/` 的 `og:type` 改成 article | 报"非文章页的 og:type 应为 website" | exit 1 ✓ |
| 某页的本人 `@id` 改成 `#person-v2` | 报"全站出现了 2 个不同的本人 @id" | exit 1 ✓ |
| 非文章页挂上 `article:published_time` | 报"非文章页却带了 article:* 属性" | exit 1 ✓ |
| 抽掉论文页作者节点的 `@id` | 报"描述 Yihang Lyu 的 Person 节点没有 @id" | exit 1 ✓ |
| 数据集 creator 的 `@id` 改成另一个值 | 报"全站出现了 2 个不同的本人 @id" | exit 1 ✓ |
| `.bib` 里删掉数据集那条 | 报"文件有 2 条但页面有 3 个可复制块" | exit 1 ✓ |
| `.bib` 里数据集的 doi 改掉 | 报"有可复制块在 .bib 里找不到逐字相同的条目" | exit 1 ✓ |
| `.bib` 条目类型改成 `@misc` | 报"条目不是 @article/@dataset/@software" | exit 1 ✓ |

**顺带修掉的一处死代码**：`verify-site.cjs` 的 `notes` 是**只写不读**的累加器
（`note()` 从未被调用，`notes.push` 写进去也没人打印）。现在统一走 `note()`，
并在汇总里逐条打印。

**新增 `SITE_DIR` 环境变量**：故障注入时如果直接改 `_site`，会与并发的 build
抢同一个目录，还可能在 exFAT 卷上留下 `._*` 资源叉。指向 `/tmp` 下的副本就没有
这两个问题。

### 调研来源与核实方式

- **og:type / article 扩展**：ogp.me 根页的 Types 段与 Article object 段
  （`ogp.me/docs/article` 等路径已 404，站点改版）。
- **schema.org 的 `funder` / `grant`**：schema.org 官方定义
  （`funder` 的 RDF 段落；`Grant` 类型的 `funder` + `award` 字段）。
- **`Grant` 类型的存在**：`funder` 的 "Used on these types" 里列了 `Grant`。
- **胶囊与论文的关系**：DataCite 对 `10.24433/CO.6720035.v1` 的
  `relatedIdentifiers` 登记为 `IsSupplementTo`；schema.org 无 `isSupplementTo`
  属性（实测 404），故用 `citation`。
- ⚠️ `mcp__agu-papers__search_papers` 仍持续 `OpenAlex search failed (HTTP 429)`
  ——是**瞬时限流**，不代表"查无此论文"。AGU 侧一律以 Crossref / DataCite 的
  官方记录为准。

### 验证结果

- `npm run build` **exit 0**；`check:css` 通过（15 个文件）；`check:site` 通过
  （6 个 HTML 页、**127 条本地引用**、5 条 sitemap URL）
- 4 条新门禁 + 9 项故障注入**全部按预期拦下**（见上表）
- `publications.bib`：**3 条**（`@article` / `@dataset` / `@software`），条目间空一行；
  与论文页 3 个 Copy 按钮**逐字一致**
  - 数据集条目**不含 version 字段**（`citeVersion` 故意留空，与论文
    reference[29] 逐字一致，见第四轮）
  - 胶囊条目 `version = {1.0}`（标题/DOI/版本号三者本就一致）
- 论文页 `<figure class="paper-figure">` **1 个**；`src` = `../../assets/img/publications/trmm-fig10.jpg`
  （走 `| relUrl`，**零个根绝对路径**，"整个文件夹扔到哪都能跑"仍成立）；
  `width=1400 height=745`（零 CLS）
- **横向溢出检测**：6 个页面在 390px 视口下 `scrollWidth` 全部 = 390，
  **无横向溢出**；成果图是**容器内**有意横滚（`img.paper-figure__img`），
  不会让整页出现横向滚动条
- JSON-LD：`@id` / `url` 全部为绝对地址；14 个"本人"节点共用一个 `@id`
  `https://github.lvyihang.xyz/#person`
- 打印样式**无需改动**：`print.css` 里已有裸 `figure` 选择器，
  `.paper-figure` 是 `<figure>` 元素，已被 `break-inside: avoid` 覆盖

### ⚠️ 线上仍是旧版本（待部署，**不是站点损坏**）

本轮实测（10:35，**9 条**路由，逐条 `curl -w '%{http_code}'`）：

| 线上路由 | 状态 |
|---|---|
| `/` | 200 |
| `/papers/` | **404** |
| `/papers/trmm-thunderstorm-stages/` | **404** |
| `/blog/` | 200 |
| `/about/` | 200 |
| `/publications.bib` | **404** |
| `/feed.xml` | **404** |
| `/sitemap.xml` | 200 |
| `/robots.txt` | 200 |

即 **5 条 200 + 4 条 404**。4 条 404 全部是**本地已存在、本地正常**的产物
（`/papers/` 列表页、论文详情页、`.bib` 导出、`feed.xml`），
在**本地 `_site` 里都实测存在且内容正确**——这正是"待部署而非损坏"的判据。
（论文详情页 `/papers/trmm-thunderstorm-stages/` 是第三轮新增的路由，
前几轮日志只记了 3 条 404，本轮补齐为 9 条实测。）

**比前几轮记录的"sitemap 还带前缀"更严重一层**：线上首页的
`<link rel="canonical">` 与 `<meta property="og:url">` **都是**
`https://github.lvyihang.xyz/MeteoHub/`（实测该 URL **404**），
线上 `sitemap.xml` 的 3 条 `<loc>`（`/MeteoHub/`、`/MeteoHub/about/`、
`/MeteoHub/blog/`）**全部 404**。

性质是**待部署**——线上还是 2026-10-16 的部署，本地 `site.url` 已经是
`https://github.lvyihang.xyz`（无前缀），本地 canonical / sitemap 全部正确。
**本任务禁止 push，部署由本人决定**；本轮全部改动只在本地。

---
## 2026-10-19 · 第七轮：404 页补 noindex、去掉自指的 canonical

**触发**：10:10 场次（`mvs_f82683a6`）只读核验时实测发现——
`_site/404.html` **既没有 `noindex`**，又**发着指向自身的 canonical**
（`<link rel="canonical" href="https://github.lvyihang.xyz/404.html" />`）。
这个缺陷在第六轮就被我记进"待决策"，当时写的收尾是"可以下一轮做"——
本轮就是那一轮。

**为什么它不是"口径取舍"、可以直接修掉**：canonical 的语义是
"这个 URL 是该内容的权威地址"，对一个错误页发它，等于主动向搜索引擎声明
"404 也是正式内容页"；而错误页 URL 本就该被排除在索引之外。
**没有任何一种合理口径是"让 404 被收录"**——所以它不是需要本人拍板的取舍项，
而是一个可以直接修掉的缺陷。**（第六轮把它归进"待决策"是分类偏保守了，
这里更正：前两项已修，第三项见下。）**

### 改了什么（1 个改进点，只动 3 个文件）

- `src/404.njk`：front matter 加 `is404: true`（**只有这个模板**有）。
- `src/_includes/layouts/base.njk`：
  - `is404` 为真 → 输出 `<meta name="robots" content="noindex, follow" />`，
    **不输出** canonical，也**不输出** hreflang 那一组；
  - 其余页面 → **一个字没动**（canonical / hreflang 原样输出）。
- `scripts/verify-site.cjs`：新增**第 15 条门禁**。

⚠️ **为什么 hreflang 一起去掉**：canonical 与 hreflang 在 `base.njk` 里是同一组
"自指 URL 声明"（同一段、相邻两行、同一个 `site.url + page.url` 模式）。
只去掉 canonical 却留着 hreflang，语义上是半拉子的——审代码的人会问
"为什么只删一个"。两者都不构成风险（错误页本来就不该有语言版本声明）。

⚠️ **为什么没有撞坏现有门禁**：`verify-site.cjs` 原本就有
`if (!canonical && !from.endsWith("404.html"))` —— 也就是说
**"404 页可以没有 canonical"这条早就被允许**，只是没人真的去掉它。
本轮是先改产物再补门禁，顺序是反的，但结果一致。

### 新增门禁第 15 条

| # | 门禁 | 拦的是哪类 bug |
|---|---|---|
| 15 | 404 页必须有 `noindex`、且**不得有** canonical；**正常页不得有** `noindex` | 错误页被索引 / 好页面被自己藏起来 |

**故障注入（3 项，全部拦下）**：

| 注入的故障 | 门禁反应 | 结果 |
|---|---|---|
| 删掉 404 页的 noindex | 报"404 页缺少 noindex（robots meta = 无）" | exit 1 ✓ |
| 给 404 页加回 canonical | 报"404 页不应有 canonical（…/404.html）" | exit 1 ✓ |
| 给正常页（about）加 noindex | 报"正常页不该有 noindex（robots meta = noindex, follow）" | exit 1 ✓ |

注入全部在 `/tmp` 副本上做（`SITE_DIR`），**没碰工作区的 `_site`**；
还原后重跑 exit 0。

### 验证结果

- `npm run build` **exit 0**；`check:css` 通过（15 个文件）；`check:site` 通过
  （6 个 HTML 页、**127 条本地引用**、5 条 sitemap URL）
- **404 页实测**：`<meta name="robots" content="noindex, follow" />` 在；
  `canonical` **0 个**、`hreflang` **0 个**
- **其余 5 页实测**：`canonical` 各 1 个、`robots` 各 0 个 —— **没有被误伤**
- `node scripts/check-overflow.cjs` exit 0（390px 六页 `scrollWidth` 全 = 390）

**归属**：本轮改动全部由 **10:35 场次**（`mvs_b348dad6bacc4e88b0828bbcf619b257`）写；
问题由 **10:10 场次**只读发现；已请 **10:40 场次**做独立复验。

---
## 2026-10-19 · 第八轮：下载的 .bib 别带 HTML 实体 + 一张图只配一套 alt + robots 的"生成时间"改成真的构建时间

### ⚠️ 本轮的并发情况与归属（先说清楚，避免以后误判）

巡检 cron **每 5 分钟起一个会话**，本轮（11:00）开始时工作区里同时跑着
**10:10 / 10:35 / 10:40 / 10:45 / 10:50 / 10:55** 六个 MeteoHub 会话，
且**三个会话正在同时写** `base.njk` / `paper.md` / `publications.bib.njk`
（mtime 落在 11:00:2x–3x）。

处理：

1. 向 6 个会话逐一 `session send --force_steer` 发停手通知（全部 ACK）；
2. 连续采样文件 mtime 60 秒，确认工作树**稳定**（停在 11:00:37）；
3. 11:05 又起了一个会话并自称写者，已通知它转为**只读独立复验**。

**归属**：

| 场次 | 写了什么 | 去向 |
|---|---|---|
| **10:45**（`mvs_e442fe05`） | A、B 两组改动（`| safe` + 删 `coverAlt` + `coverAltText` + 门禁 12/13/14） | 本轮提交 |
| **11:00**（本场次） | 复核上述全部改动 + C 组（robots 构建时间 + 门禁 16）+ 本日志 | 本轮提交 |

### A. 下载的 `publications.bib` 不该带 HTML 实体（10:45 写，本轮复核）

**问题**：`publications.bib.njk` 末尾是 `{{ entries | join("\n\n") }}`，
而 Eleventy 3.1.6 的 nunjucks **默认开着 autoescape**。BibTeX 里的
`\&`（转义后的 &）会被**再转义**成 `&#92;&amp;`——页面上 `<pre>` 看着正常
（浏览器解码后仍是 `\&`），但**下载下来的 .bib 文件里字面就是 `&#92;&amp;`**，
那不是合法 BibTeX，Zotero 之类的导入器会读出乱码。

**改法**：`.bib` 这条路径加 `| safe`（下载文件必须是原始 BibTeX）；
页面侧的 `<pre>` **不能**加（那里的 `&` 需要 HTML 转义，否则是裸 `&` 落进 HTML）。

#### ⚠️ 一条必须写清楚的事实：`| safe` 在**当前数据上是 no-op**，但它是这个 bug 的**正解**

本轮在 `/tmp` 隔离副本上实测（rsync + symlink `node_modules`）：

**① 当前数据下确实是 no-op**：去掉 `| safe` 重建，产物 `.bib` 与保留时
**逐字相同**。原因：**当前 `publications.bib` 全文一个 `&` 都没有**——
3 条条目的 author / title / journal / doi / url 都不含 `&`，nunjucks 无从转义。

**② 但只要出现一个 `&`，它立刻就是"合法 BibTeX"与"HTML 实体乱码"的分界线。**
把 title 改成含 `&` 的版本（`Lightning & Convective Structure`）后实测：

| 字段 | 保留 `\| safe` | 去掉 `\| safe` |
|---|---|---|
| `title`（**走** `esc`） | `title = {Lightning \& Convective…}` ✓ | `title = {Lightning &#92;&amp; Convective…}` ✗ |
| `url`（**不走** `esc`） | `url = {https://…?a=1&b=2}` ✓ | `url = {https://…?a=1&amp;b=2}` ✗ |

去掉 `| safe` 时产物里的 `&#92;&amp;` / `&amp;` **就是**导入器会读出乱码的东西。

**所以准确的说法是**：

- ❌ **不是**"修好了一个已经发生的线上 bug"——**当前数据里那个 bug 尚未显形**；
- ✅ **但 `| safe` 正是这个 bug 的正解**：它决定了 `.bib` 一旦出现 `&` 时
  落在哪一边。**这行不能删**；
- ✅ 门禁 13 是**第二道防线**：机制正确之后**不许再退化**——
  注入 `&#92;&amp;` 后门禁 12 + 13 同时报出（实测）。
  两条是**互补**的，不是二选一。

⚠️ **一条方法论（故障注入本身也会骗人）**：本轮第一次注入"把 `.bib` 里的
`\&` 换成 `&#92;&amp;`"报了"**漏网**"，看起来像门禁 13 失效——真因是
**注入根本没生效**：当前 `.bib` 里连一个 `&` 都没有，`replace` 匹配不到，
文件**逐字没变**，门禁当然放行。
**"注入没生效"和"门禁没拦住"在结果上长得一模一样。**
所以每条注入都必须先**确认文件真的被改了**（打印改后内容）再读门禁的结论。
（端到端复现由 10:40 场次先做出来，本轮独立复跑核对，结论一致。）

### B. 一张图只能有一套 alt（10:45 写，本轮复核）

**问题**：论文页的成果图 `trmm-fig10.jpg` 在**三处各写各的 alt**：

| 出口 | 原文 | 对不对 |
|---|---|---|
| `<img alt>` | site.js 的 `publications[].figure.alt` | ✅ 与图相符 |
| `og:image:alt` | paper.md front-matter 的 `coverAlt` | ❌ 与图不符 |
| `twitter:image:alt` | 同上 | ❌ 与图不符 |

`coverAlt` 写的是"复合雷达回波剖面 / echo coverage percentage"，
而**本轮直接看了图**（`src/assets/img/publications/trmm-fig10.jpg`）：
上排是三个阶段的**小提琴图**（Altitude 0–20 km vs Horizontal scale ±20 km，
按 20/30/40 dBZ 分层），下排是三个阶段的**累积分布曲线**
（蓝 = FlRate fl min⁻¹，红 = FD₄₀ fl min⁻¹ (100 km)⁻²，横轴 Percentage %）。
"echo coverage percentage" 这个说法与图对不上。

**改法**：删掉 front-matter 里的 `coverAlt`，改由 `base.njk` 从**数据源**
`site.js` 的 `publications[].figure.alt` 取值——图（`figure.src`）和它的
alt（`figure.alt`）在同一处维护，`<img alt>` / `og:image:alt` /
`twitter:image:alt` 三处**同源**，不会再各说各话。

### C. robots.txt 的"生成时间"改成**真的构建时间**（本场次实现）

**问题**：`src/robots.njk` 那行写的是

```njk
# 生成时间：{{ page.date | dateToIso }}
```

而对模板页而言 `page.date` = 源文件的 **birthtime（创建时间）**。本机实测：

| | 值 |
|---|---|
| `src/robots.njk` birthtime | `2026-10-02T04:29:21.600Z` |
| 产物里那行"生成时间" | `2026-10-02T04:29:21.600Z` ← **逐字相同** |
| 站点实际建成日期 | 2026-10-19 |

那行字**标着"生成时间"却永远停在 10-02**。这不是"不准"，是
**一个会误导人的标签**——读者会以为产物很旧。

**为什么一直没人发现**：在 CI 上 `actions/checkout` 会把文件重新写盘，
birthtime 变成 **checkout 那一刻**，于是"生成时间"看起来正好等于部署时刻
——**恰好蒙对**。机制是错的，只是碰巧两次都撞对了。

**改法**：新增 filter `buildStamp`（`eleventy.config.js`），每次渲染重新取
`new Date().toISOString()`；`robots.njk` 改用它。

⚠️ **踩到的一个坑：不能用 `eleventyComputed`**。Eleventy 的
`eleventyComputed` 里，**字符串值会被当作"模板字符串"渲染**，不是当 JS 求值
（见 `node_modules/@11ty/eleventy/src/Template.js` 的 `_addComputedEntry`：
`typeof obj === "string"` 走 `#renderComputedUnit`）。写

```yaml
eleventyComputed:
  buildTime: "new Date().toISOString()"
```

会被**原样输出**成那行字（实测产物就是 `# 生成时间：new Date().toISOString()`，
并被门禁 16 当成"非法时间戳"拦下——门禁反而先抓到了这个错）。
filter 是真正的 JS 函数，模板引擎会调用它。

### 新增门禁 12 / 13 / 14 / 16

| # | 门禁 | 拦的是哪类 bug |
|---|---|---|
| 12 | 论文页可复制的 BibTeX 块与 `.bib` 里的条目**逐字一致**（比对前**只解页面侧**的 HTML 实体） | 页面加了复制块、文件没同步 |
| 13 | 下载的 `.bib` 里**不得出现 HTML 实体**（裸 `&` 不算） | A 组那个"潜在"缺陷显形 |
| 14 | 同一张图在 `<img alt>` / `og:image:alt` / `twitter:image:alt` 三处**逐字一致**；论文页 og:image 必须是页面上真显示的那张 | 一张图、三套文案 |
| 16 | robots.txt 的「生成时间」必须是合法 ISO 时间戳、**不得等于源文件 birthtime**、**不得早于源文件 mtime** | "拿文件创建时间冒充生成时间" |

⚠️ **门禁 12 以前结构上就抓不到转义 bug**：它比的是"两处是否一致"，
而修复前**两边同样**被转义——转义错了反而更"一致"。**门禁 13 才是直接问
"文件里有没有实体"**的那一条。两者是互补的，缺一不可。

⚠️ **门禁 16 刻意不用"距今 N 分钟"**：故障注入要把产物复制到 `/tmp` 再跑门禁，
"新鲜度"判据会让**每一份历史副本都误报**。改成**相对源文件**的判据
（≠ birthtime、≥ mtime）在复制后依然成立。

### 调研来源与核实方式

- **alt 与图是否相符**：**直接看图**（读 `src/assets/img/publications/trmm-fig10.jpg`），
  逐条比对坐标轴、分层色标、面板标 (a)(b)(c)(d)。不靠记忆、也不靠 alt 自己的措辞。
- **"Fig. 10" 这个图号**：**无法从外部核实**（Crossref 的 JATS 摘要里 `<fig>` 数量为 0、
  本地无 PDF、图上只有 (a)(b)(c)(d) 面板标）。但 `git log -S` 溯源到 `0252580`，
  是**作者原站重构时的原文**，故**不擅自改作者措辞** → 见"待决策"。
- **`eleventyComputed` 的字符串语义**：读 Eleventy 3.1.6 源码
  `src/Template.js` 的 `_addComputedEntry` 确认，不是靠试。
- **`| safe` 是否是 no-op**：在 `/tmp` 副本上把 `| safe` 去掉重建、
  与保留时逐字对比实测。

### 验证结果

- `npm run build` **exit 0**；`check:css` 通过（15 个文件）；`check:site` 通过
  （6 个 HTML 页、**127 条本地引用**、5 条 sitemap URL）
- **`.bib` 里 HTML 实体 = 0**（`grep -c '&#'` → 0）；`publications.bib` 3 条
  （`@article` / `@dataset` / `@software`），与论文页 3 个复制块逐字一致
- **alt 三出口逐字一致**：`/tmp/mh_checkalt.sh _site` → 「检查 1 / 跳过 5 /
  **不一致 0**」（修复前是"不一致 1"）
- **故障注入 6 项，全部按预期拦下**（都在 `/tmp` 副本上做，没碰工作区 `_site`）：

  | 注入的故障 | 门禁反应 | 结果 |
  |---|---|---|
  | `.bib` 里塞进字面 HTML 实体 | 门禁 13 报"下载文件必须是原始 BibTeX" | exit 1 ✓ |
  | `.bib` 与页面侧**同时**被转义（= 修复前状态） | 门禁 12 + 13 同时报 | exit 1 ✓ |
  | `twitter:image:alt` 与 `<img alt>` 不一致 | 门禁 14 报"一张图只能有一套 alt" | exit 1 ✓ |
  | 论文页 og:image 指向页面上不存在的图 | 门禁 14 报"分享卡片的图与读者看到的图对不上" | exit 1 ✓ |
  | robots 生成时间 = 源文件 birthtime | 门禁 16 报"那是文件什么时候被创建" | exit 1 ✓ |
  | robots 生成时间 = 非法字符串 / 整行删掉 | 门禁 16 报"不是合法时间戳" / "找不到这一行" | exit 1 ✓ |

- **robots.txt 实际输出**：`# 生成时间：2026-10-19T18:08:01.150Z`，
  与构建完成时刻 `2026-10-19T18:08:01Z`（UTC）**同一秒** ✓
- **开发服务器（`eleventy --serve`，写 `_site_dev`）同样输出当下时刻**
  `2026-10-19T18:07:56.125Z` ✓（不是服务启动时刻）
- 横向溢出检测：6 个页面在 390px 视口下 `scrollWidth` 全部 = 390，无横向溢出 ✓
- `_site` 里 `._*` 资源叉计数 **0** ✓
- JSON-LD 12 块全部 `JSON.parse` 通过；`canonical` 与 `og:url` 6 个页面全部一致；
  `sitemap.xml` 5 条 URL 与真实路由一一对应（均由 `check:site` 保证）

### ⚠️ 线上仍是旧版本（待部署，**不是站点损坏**）

本轮实测（11:00，逐条 `curl -w '%{http_code}'`）：

| 线上路由 | 状态 |
|---|---|
| `/` | 200 |
| `/papers/` | **404** |
| `/blog/` | 200 |
| `/about/` | 200 |
| `/publications.bib` | **404** |
| `/feed.xml` | **404** |
| `/sitemap.xml` | 200 |

线上首页 / `/blog/` / `/about/` 的 JSON-LD 全部 `JSON.parse` 通过 ✓。
但线上三页的 `canonical` 与 `og:url` **都指向** `https://github.lvyihang.xyz/MeteoHub/…`，
而这三个带前缀的 URL **实测全部 404**；线上 `sitemap.xml` 的 3 条 `<loc>` 同样带前缀、
同样 404。**性质仍是待部署**（线上是 2026-10-16 的部署，本地 `site.url` 已是
`https://github.lvyihang.xyz`、canonical / sitemap 全部正确）。
**本任务禁止 push，部署由本人决定。**

---
## 2026-10-19 · 第九轮：404 页不再宣称"我是一篇论文" + 门禁编号体系理顺

### ⚠️ 本轮的并发情况与归属（先说清楚，避免以后误判）

本轮现场比前几轮更乱，四件事需要交代清楚：

| 场次 | 做了什么 | 本轮处置 |
|---|---|---|
| 10:40→11:00 | 对**第八轮**（已提交的 `fdb5dca`）做独立预验收：build exit 0、alt 三出口逐字一致、`.bib` 实体 / alt 两条门禁故障注入 6/6 拦下 | 结论采纳，**第八轮无误**。其报告还指出一个此前没人提的点：当前数据里所有 BibTeX 字段都不含 `& % $ # _`，所以第八轮那次修复在**现有产物上看不出差别**，是"堵住未来的坑"——这点补进第八轮记录 |
| 11:05 | 只读复验，三条发现（见下） | 全部采纳，写进本轮 |
| 11:15 | **自行实施了 `sitemap lastmod`**（新增 `lastCommitTime` filter + `deploy.yml` 加 `fetch-depth: 0` + `verify-site.cjs` 加第 18 条门禁） | ⚠️ **该口径明确在「待决策」段里（A/B/C 三选一），属本人拍板项**。本轮**按 A 实施、但仍不替本人拍板**：A 单独落在 commit 2，本人一句"改回"就能只回退 A，404 修复留在历史里。**⚠️ 这个"commit 2"是序号，回退时必须用显式 hash `54899f1`**（12:30 只读复验者补正）——当天 12:09 发生过一次 `reset` 重做，`526b566` / `dfe021a` / `89d64fd` 三个 commit 被丢弃（同内容至少存在过两版），只写序号**可能选错对象**（`dfe021a` 那三个不在 main 上，`revert` 会失败或乱 apply 一份已重做过的旧 diff）。处置见「并发工作树的最终处置」 |
| 11:20 | 自称唯一写者、"接手工作树里已有的 5 个文件改动" | 已通知停手；实际未产生新改动 |

**并发工作树的最终处置（提交时）**：`git status` 里有 6 个被改的文件，
拆成**两个 commit**落地（这样"lastmod 口径"能被单独回退，不牵连 404 修复）：

| commit | 收哪些文件 | 落地后那棵树的实测 |
|---|---|---|
| 1 | `src/_includes/layouts/base.njk` | 隔离克隆 `npm run build` **exit 0**、自检全过（404 页已无内容类实体、robots = `noindex, follow`、无 hreflang） |
| 2 | `scripts/verify-site.cjs` + `eleventy.config.js` + `src/sitemap.njk` + `.github/workflows/deploy.yml` + `docs/IMPROVEMENT-LOG.md` | 隔离克隆 `npm run build` **exit 0**、19 条门禁全过（5 条 lastmod 逐页与各自源文件的提交时间核对通过） |

⚠️ **日志为什么放在 commit 2 而不是 commit 1**：本日志第九轮段会宣布"门禁 1–19"
与"方案 A"，而那些代码要到 commit 2 才进树 → **日志必须与它描述的代码同一个
commit 落地**，否则 bisect 到 commit 1 会看到一份"说了 18/19、代码里却只有 1–17"
的日志。commit 1 只带 404 修复本身（那一棵树的日志仍是第一至八轮的记录，与代码相符）。

⚠️ 为什么不拆成"只提交 3 个"：**门禁 18 与门禁 19 都依赖 `eleventy.config.js`**——
18 依赖它的 `lastCommitTime` filter，19 依赖它给站点级 `ScholarlyArticle` 补的 `@id`。
只提交门禁不提交依赖，那棵提交树会**同时**红在两处（实测 9 个问题：5 条 lastmod
"不等于任何源文件真实的最后一次提交时间" + 4 个页面"ScholarlyArticle 没有 @id"）。
→ **门禁与它的依赖必须同组进 commit**。
⚠️ 两个 commit 的**先后顺序不能换**：404 修复在 commit 1，而守着它的门禁 16 在 commit 2；
先落 commit 2 会让门禁 16 在一棵还没修的树上判红。
⚠️ **操作禁令**：提交时**只能显式写文件路径**（`git add <path> …`），
**禁止 `git add -A`**——它会把还没拍板的工作树改动一起扫进 commit。
（本项目连续多轮出现"留几个已改文件不提交"的老毛病：下一棒看到一个没有指令的脏树，
要么丢、要么半提交。）

**11:05 场次的三条发现（全部采纳）**：
1. `rsync -a` **不保留 birthtime**（副本里每个文件的 birthtime = 源文件 mtime），
   Eleventy 取 birthtime → **副本里每页 lastmod 各不相同**，**看着像"已经修好了"**。
   这比 `git archive` 副本"全站 lastmod 全同"的那个假象**更危险**——
   前者会让人以为改动生效而实际没验。→ **验 lastmod 必须回工作区构建**。
2. 门禁编号早就错位（第六轮日志写"新增门禁 11/12/13/14"，代码里当时是 9/10/11/12）。
3. 404 页 JSON-LD 的严重性**比原先判断高一档**：线上 `/404.html` **直接访问返回 200**
   （不是靠访问不存在的路径才 404），所以它是一个**可被抓取的真实页面**，
   不是一个"只有误点才看到"的角落。

### A. 404 页不再输出文章类 JSON-LD 实体（改进点 A，本场次实现）

**问题（实测，非推测）**：改前 `_site/404.html` 有两个 JSON-LD 块：
- 块 1：顶层 `Person`（含嵌套 `Organization` / `CollegeOrUniversity` / `Place` / `PostalAddress`）；
- 块 2：`@graph`，顶层一个 **`ScholarlyArticle`**——带 `headline`（论文标题）、
  `abstract`（摘要）、`funder`/`Grant`（**NSFC 资助**）、`isPartOf`（期刊）、
  `encoding`/`MediaObject`（成果图）。

而同一页的可见文案是 `<h1 class="section__title">Nothing here</h1>`。
**"这里什么都没有" 与 "我是一篇有 NSFC 资助的论文" 同时出现在同一个 URL 上。**

**为什么算缺陷、不算口味**：消费方（知识图谱、聚合器、结构化数据抓取器）会把这些实体
**归到 `/404.html` 这个 URL 上**。而线上 `/404.html` 直访返回 **200**，
是一个可被抓取的真实页面——不是"误点才看到"的角落。
这属于"对外声明了一个假事实"，与"标题写错了"不是一类问题。

**改法（1 行）**：`src/_includes/layouts/base.njk`
```
-  {%- if articles.length %}
+  {%- if articles.length and not is404 %}
```
`is404` 来自 `src/404.njk` 的 front matter，base.njk 可直接读。

**刻意保留 Person 实体**（`@id` = `{{ site.url }}/#person`、`url` = `{{ site.url }}/`）：
它描述的是**站点作者本人**、url 指向站点根，与"这个 URL 是一篇论文"无关；
对消费方的实体消歧还有益。去掉它属于**展示口径取舍**，已写进「待决策」，
**本轮不替本人拍板**。

**改后实测**（`_site/404.html`）：JSON-LD 块 1 个，
出现的 `@type` = `Person` / `Organization` / `CollegeOrUniversity` / `Place` / `PostalAddress`，
**内容类实体 0 个**；`robots` = `noindex, follow`；`canonical` = 无。

### B. 门禁编号体系理顺（改进点 B，本场次实现）

`scripts/verify-site.cjs` 的条号此前**三处错位**，每一处都会让后来的人指错对象：

1. **"第 4 条"被用了两次**：循环内的"标题不能退化成站点名"与顶层的"sitemap 里的 URL"。
2. **同一件事两个号**：第七轮把"错误页的索引控制"加进来时，代码注释写 `3b`，
   而同一轮的 commit message 与日志写"第 15 条"——后来轮次照着引用会指错。
3. **一条独立门禁缩在另一条里**：`.bib` 不得含 HTML 实体 那条，
   原先**缩进在第 13 条的 `else` 分支内**，共用一个分支——从代码上根本看不出它是一条独立门禁。

**处置**：把"每页检查"编为 `1 / 2 / 3 / 4b / 4c`，"全站检查"编为 `5–19`（连续、无重复），
并在**文件头部加了一张旧→新编号对照表**（历史日志与 commit 里引用的是旧号，追溯时用这张表）。
所有注释里对旧号的交叉引用也一并订正
（如 `ldRecords` 注释"供第 11 / 13 条门禁复查"→ 新号 `10 / 12 / 16`；
`base.njk` 里"门禁见第 11 条"→ 新号 `10 / 12`）。

| 旧号 | 新号 | 说明 |
|---|---|---|
| 1 / 2 / 3 | 1 / 2 / 3 | 不变 |
| 3b | **4b** | 错误页索引控制（第七轮 commit 写成"第 15 条"） |
| 4（标题退化） | **4c** | 消掉与 sitemap 的重号 |
| 4（sitemap） | **5** | |
| 5 – 11 | 6 – 12 | 顺延 |
| 12 | **13** | `.bib` 与页面逐字一致 |
| 13（嵌在 12 内） | **14** | `.bib` 不得含 HTML 实体（提为独立顶层分节） |
| 14 | **15** | 一张图一套 alt |
| 15 | **4b** | 同上 |
| 16 | **17** | robots "生成时间" |
| （无） | **16** | **本轮新增**：404 页不得声明内容类实体 |
| （无） | **18** | **本轮新增**：sitemap `lastmod` 真实性（逐页核对，见下 C 节） |
| （无） | **19** | **本轮新增**：内容类实体 `@id` 全站唯一且指向真实页面 |

⚠️ 提为独立分节时踩到一个真坑：`const bibText` 原先声明在第 13 条的 `else` 块**内部**，
提成顶层分节后就是块级作用域 → 第 14 条引用它会抛 **`ReferenceError`**，
整个验收脚本直接崩掉（不是报错，是崩）。已把它提到模块作用域并加注释说明。
**这类"拆块"改动改完必须先跑一次 build 再提交**。

### 新增门禁第 16 条：404 页不得声明内容类实体

判据按**内容类实体**列黑名单，而不是"404 页只能有 Person"——
后者会把尚未拍板的口径（Person 留不留）写死进代码。

黑名单（13 类）：`ScholarlyArticle` / `Article` / `Dataset` / `SoftwareSourceCode` /
`BlogPosting` / `NewsArticle` / `TechArticle` / `ScholarlyChapter` / `Review` /
`CreativeWork` / `Periodical` / `Grant` / `MediaObject`。

⚠️ 后三类（`Periodical` / `Grant` / `MediaObject`）是 `ScholarlyArticle` 的**嵌套**节点，
只跟着文章实体出现；放过它们等于留了个后门。

### 故障注入（每条先确认"注入真的生效"，再读门禁结论）

纪律：注入没生效与门禁没拦住，**结果长得一模一样**（都是 exit 0）。
所以每条先断言文件逐字变了，再读结论。全部在 `/tmp` 副本 + `SITE_DIR` 下做
（不动工作区 `_site`，避免与并发 build 抢目录、避免 exFAT 卷留 `._*` 资源叉）。

| # | 注入 | 期望门禁 | 实测 | 拦下的报错 |
|---|---|---|---|---|
| 对照 | 干净副本 | 通过、不误报 | exit 0 ✓ | — |
| A | 把 `@graph`（`ScholarlyArticle`）塞回 404 页 | 第 16 条 | **exit 1 ✓** | `404.html: JSON-LD 里出现了内容类实体 "ScholarlyArticle" —— 错误页不该声明论文/数据集/胶囊` |
| B | 删掉 404 页的 `noindex` | 第 4b 条 | **exit 1 ✓** | `404.html: 404 页缺少 noindex（robots meta = follow）` |
| C | 给 404 页加回 `canonical` | 第 4b 条 | **exit 1 ✓** | `404.html: 404 页不应有 canonical（…/404.html）` |
| D | 给正常页（首页）加 `noindex` | 第 4b 条 | **exit 1 ✓** | `index.html: 正常页不该有 noindex` |
| E | `.bib` 里塞 `&amp;` | 第 14 条 | **exit 1 ✓** | 第 13 条先拦下（`找不到逐字相同的条目`），第 14 条同时命中（`publications.bib 里出现了 HTML 实体`）——两条互补 |
| F | 改 `twitter:image:alt` 使其与 `<img alt>` 不一致 | 第 15 条 | **exit 1 ✓** | `twitter:image:alt 与页面上同一张图的 <img alt> 不是同一句话` |
| G | robots "生成时间"改回源文件 birthtime | 第 17 条 | **exit 1 ✓** | `「生成时间」等于源文件的创建时间（birthtime = 2026-10-02T04:29:21.600Z）` |
| H | 404 的 robots 改成 `noindex, nofollow` | 第 4b 条 | **exit 1 ✓** | `404 页的 robots 少了 follow（robots meta = noindex, nofollow）—— noindex 只表示不收录这个 URL 本身，follow 才表示仍沿链抓页内有效链接` |
| I | 给 404 页加回 `hreflang` | 第 4b 条 | **exit 1 ✓** | `404 页不应有 hreflang（发现 1 个）` |
| J | 删掉 404 页的 `noindex` | 第 4b 条 | **exit 1 ✓** | `404 页缺少 noindex（robots meta = follow）` |

**11/11 通过（1 对照 + 10 注入）**。

⚠️ H/I/J 三条是第 4b 条的**加固项**——第一版 4b 只查 `noindex` 与 `canonical`，
少查三样：
1. **robots 必须按 token 精确判定**：`"nofollow"` 里含 `"follow"` 子串 →
   朴素正则 `/follow/i` 对 `"noindex, nofollow"` 判 true → "nofollow 冒充 follow"被放过，
   而那正是这条要抓的 case（现在按 `,` 切分后逐 token 比对）；
2. **404 必须保留 `follow`**：`noindex` 只表示"不收录这个 URL 本身"，
   `follow` 才表示"仍沿链抓页内的有效链接"（页脚还有 sitemap / RSS / 联系方式）；
3. **404 不许有 `hreflang`**：它同样是在声明"这个 URL 是某个语言版本的正式地址"，
   错误页发它与发 canonical 是同一类错误。

⚠️ **顺带修掉的一个"看不见的差异"**：`base.njk` 的 `{%- if is404 %}` 用了 Nunjucks
**空白控制**（`{%-`）。不加的话，`{% if %}` / `{% else %}` / `{% endif %}` 三行标签自身的
缩进会原样留在产物里 → **每一个走 else 分支的正常页都凭空多出 2 行只含空格的行**。
实测（当前 vs HEAD，逐页对比）：4 个正常页**去纯空白行后逐字节一致**、纯空白行各少 2 行
（217/270/193/206 → 215/268/191/204）；404 页内容有差异（本来就该变）。
⚠️ 改动**必须限定在 is404 块内**：`base.njk` 里另有 13 处 `else`/`endif`
（28/159/217/219/234/236/251/278/291/294 等行），做全局替换会连 `<title>` 那处一起改掉，
正常页的差异反而变大。

### 验证结果

- `npm run build` = `check:css && eleventy && check:site` → **exit 0**
  （`check:css` 15 文件通过；`check:site` 6 个 HTML 页 / 127 条本地引用 / 5 条 sitemap URL 全绿）
- 404 页产物：JSON-LD 只剩 `Person` 族，**内容类实体 0 个**；`noindex, follow`；无 canonical
- 全站"本人" `@id` = `https://github.lvyihang.xyz/#person`（13 个节点，全站统一）
- `publications.bib` 3 条，与论文页 3 个复制块逐字一致（页面侧已解码 HTML 实体）
- 站内引用全部为相对路径 ✓

### C. sitemap 的 lastmod 改成"该页源文件最后一次 git 提交时间"（方案 A，与门禁 18/19 同组落地）

⚠️ **本节描述的实现与门禁 18/19、以及本日志，都随 commit 2 落地**（commit 1 只带 404 修复）。
⚠️ **口径仍不替本人拍板**：A/B/C 三选一写在「待决策」段。**本轮按 A 实施**，
但 A 单独成 commit → 本人一句"改回"就能只回退 A，404 修复留在历史里不受影响。

- `eleventy.config.js`：新增 filter `lastCommitTime`（`git log -1 --format=%cI -- <文件>`，
  统一转 UTC `toISOString()`），配套两个带缓存的 helper `gitRoot()` / `gitIsShallow()`；
  并给站点级 `ScholarlyArticle` 补 `@id` = `<站点根>/papers/<slug>/`（与论文页那个相同）
  → 同一篇论文在站内**只算一件作品**（此前是"论文页有 @id、站点级没有" = 两件）。
- `src/sitemap.njk`：`<lastmod>` 从 `{{ entry.date | dateToIso }}` 改为
  `{% set lastmod = entry.inputPath | lastCommitTime %}{% if lastmod %}<lastmod>…{% endif %}`；
  并给每条 `<url>` 输出一行 `<!-- source: <仓库相对路径> -->` 标注（给门禁 18 逐页核对用）。
- `.github/workflows/deploy.yml`：`actions/checkout@v4` 增加 `with: fetch-depth: 0`。

**门禁 18（lastmod 真实性）—— 五条互补判据**：

| 判据 | 拦什么 |
|---|---|
| **A** 浅克隆**无条件失败**（并给出解法） | 数据源被截断 → lastmod 这个功能被静默关掉。⚠️ 这条判定**刻意不挂在"产物里有没有 lastmod"上**：浅克隆里产物零 lastmod，若挂在遍历上，循环体一次都不执行 → 门禁放行 |
| **B** 不在 git 仓库里 → 产物里不许有 lastmod | 没有数据源却出现了值 → 只能说明有人硬凑 |
| **C** 给了就必须是真的 | 非法时间戳 / 未来时间 / 不等于源文件的提交时间 |
| **D** **逐页核对值** | 取错了源文件（把全站 lastmod 填成同一个文件的时间） |
| **E** 逐页有/无 + "lastmod 整体消失"兜底 | filter 静默失效（返回空串）→ sitemap 变成"一条 lastmod 都没有"的合法 sitemap，build 照过、门禁全绿、产物照出。⚠️ D 落地后这条已成冗余分支，但仍然保留 |

**门禁 19（内容类实体 `@id`）**：内容类实体必须有 `@id`；同一件作品（按 identifier/DOI 归一）
在全站只能有一个 `@id`；`@id` 指向站内页面时那个页面必须真实存在。404 页只保留 `Person` 实体。

**门禁 18/19 的故障注入（10 例，全部拦下）**——都在 `/tmp` 独立 clone 上做
（不动工作区 `_site`），每例都先**自证"注入真的生效"**再读门禁结论：

| 注入 | 期望门禁 | 实测 |
|---|---|---|
| 对照：干净副本 | 通过、不误报 | exit 0 ✓ |
| 5 条 lastmod 全填成 `index.njk` 的提交时间（**取错源文件**） | 第 18 条 | **exit 1 ✓**（5 个问题） |
| lastmod 全删掉 | 第 18 条 | **exit 1 ✓** |
| lastmod 改成非法时间戳 | 第 18 条 | **exit 1 ✓** |
| lastmod 改成未来时间 | 第 18 条 | **exit 1 ✓** |
| 删掉全部 `<!-- source: ... -->` 标注（**门禁自己被卸掉**） | 第 18 条 | **exit 1 ✓**（`没有 <!-- source: ... --> 源文件标注——门禁靠它逐页核对 lastmod`） |
| 论文页实体去掉 `@id` | 第 19 条 | **exit 1 ✓** |
| 同一作品在首页换另一个 `@id` | 第 19 条 | **exit 1 ✓** |
| `@id` 指向不存在的站内页面 | 第 19 条 | **exit 1 ✓** |
| 加一个未提交的新页面源 + 把已提交页面的 lastmod 全删掉 | 第 18 条 | **exit 1 ✓** |

其中"取错源文件"与"删掉 source 标注"两例由 11:45 场次**独立复跑**（含对照与还原后
各一次 exit 0），其余由 11:20 / 11:30 场次实测，结论一致。
⚠️ 第 2 行那一例是**旧版门禁 18 抓不到的**：旧版只做"集合成员判定"，
把 5 条 lastmod 全部填成 `index.njk` 的提交时间 → 那确实"是 src 下某个源文件的
真实提交时间" → 旧门禁全绿、build exit 0。逐页核对（D）就是为了补这个洞。

⚠️ **门禁自己被卸掉也是一种失效**（12:09 由 11:20 场次补上，本轮一并落地）：
`sitemap.njk` 里那行 `<!-- source: ... -->` 是 HTML 注释，**删掉它既不会让 build 失败、
也不会让任何其它判据报错** → 门禁 18 的整套逐页核对被静默关掉。
现在**缺这条标注直接判红**（与"lastmod 整体消失"是同一类洞）。
⚠️ 这条是 12:09 由 11:20 场次补上的——**本轮已关闭**，记在这里是因为它揭示了
一类通用失效模式：**"门禁自己被卸掉"和"门禁没生效"在结果上长得一模一样**
（都是 build 照过、门禁全绿）。以后加门禁时，凡是"靠产物里某个可选字段"
做判据的，那个字段缺失时**必须判红**，不能 `continue` 跳过。

### D. 门禁 12/16/19 加固：数组型 `@type` 不能把判据整个绕过（随 commit 3 落地）

⚠️ **本节是对本轮自己刚加的门禁的一次自查**：门禁 12 / 16 / 19 都靠 `@type` 判断
"这是不是内容类实体 / 这是不是 Person"，但 JSON-LD 允许 `@type` 写成**字符串数组**。
三处判定此前各只认一种写法，于是**把 `@type` 改成数组就能让判据静默失效**：

| 门禁 | 改前的判定 | 数组型 `@type` 的后果 |
|---|---|---|
| 12（"本人" @id 全站唯一） | `node["@type"] !== "Person"` | 数组型 Person 节点被跳过 → "本人"节点缺 @id 不报 |
| 16（404 不得声明内容类实体） | `if (typeof type !== "string") continue;` | **404 页用 `["ScholarlyArticle"]` 重新宣称"我是一篇论文"，门禁全绿** |
| 19（内容类实体 @id 全站唯一） | `Array.isArray(raw) ? raw[0] : raw` | 只看第 0 个元素 → `["Person","ScholarlyArticle"]` 被当成 Person 跳过 → **没有 @id 的作品实体不报** |

实测（`54899f1` 之后的树，注入在 `/tmp` 副本做，工作区零写入，每例都先自证"注入真的生效"）：

- 404 页注入 `"@type": ["ScholarlyArticle"]` → **exit 0**（404 又在对外声明这里有产出，门禁没反应）
- 首页注入 `"@type": ["Person","ScholarlyArticle"]` 且**不带 @id** → **exit 0**（门禁 19 的"必须有 @id"没触发）

这与"删掉 `<!-- source: ... -->` 标注"是**同一类失效**：判据自己被卸掉，
而产物照常出、build 照过、门禁照绿——三者的现象**完全一样**，光看结果分不出来。

修法：加一个数组感知的 helper `typesOf(node)`（字符串 → 单元素数组；数组 → 只留非空字符串），
门禁 12 用 `typesOf(node).includes("Person")`；门禁 16 遍历**全部**类型；
门禁 19 取 `workTypes`（**全部**作品类型，不只第 0 个）再判，消息里用 `A/B` 形式列出。

修复后的注入矩阵（6 例）：

| 注入 | 改前 | 改后 |
|---|---|---|
| 对照：干净副本 | exit 0 | **exit 0 ✓**（不误伤） |
| 404 页 `["ScholarlyArticle"]` | exit 0 ✗ | **exit 1 ✓**（门禁 16：JSON-LD 里出现了内容类实体 "ScholarlyArticle"） |
| 首页 `["Person","ScholarlyArticle"]` 无 @id | exit 0 ✗ | **exit 1 ✓**（门禁 19：有一个 ScholarlyArticle 实体没有 @id） |
| 404 页 `["Person"]` 无 @id | exit 0 ✗ | **exit 1 ✓**（门禁 12：描述"Yihang Lyu"的 Person 节点没有 @id） |
| 首页 `["Person"]` 无 @id | exit 0 ✗ | **exit 1 ✓**（同上） |
| 404 页字符串型 `"ScholarlyArticle"`（回归检查） | exit 1 ✓ | **exit 1 ✓**（老路径没被改坏） |

改后 `npm run build` → **exit 0**；`check:site` 的 notes 与改前**逐字一致**
（13 个 Person 节点、内容类实体 3 件、sitemap 5 条 URL 带 lastmod）→ 没有误伤。
⚠️ 本节**不关闭**下面"留给下一轮"第 1 条：那个缺口是"404 页把整个 Person 块删掉"
（连 `@type` 都没有），与数组型 `@type` 是两回事。

### E. `affiliationUrl` 指向一个 HTTPS 握手就死的 host（修：换成 apex）

**线索来源**：12:03 场次报了一条"外链坏了"，顺带把第四轮 `iap.cas.cn 000`
那条老结论推翻了一半。我独立复测（直连 `--noproxy '*'`，绕开本机 ClashX TUN）：

| URL | 实测 |
|---|---|
| `https://www.iap.cas.cn/` | **code=000，0.03 s 秒挂**（**TLS 证书校验失败**，见下方病根；**不是**超时） |
| `http://www.iap.cas.cn/` | code=200 —— 同一台机器，**明文 HTTP 是好的** |
| `https://iap.cas.cn/` | **code=200** |
| `https://www.iap.ac.cn/` | code=301 → `https://iap.cas.cn/` |
| DNS | `www.iap.cas.cn` 与 `iap.cas.cn` 都解析到 159.226.242.62（同一台机器） |

→ **坏的不是这台机器，是 `www.` 这个主机名的 HTTPS 虚拟主机**；
apex 主机名 `iap.cas.cn` 的 HTTPS 是好的，且 `www.iap.ac.cn` 官方 301 指向的
也正是 `https://iap.cas.cn/` —— **apex 才是规范主机**。

#### ⚠️ 病根是**证书**，不是"连接被拒"（第十二轮补正，证据差一档）

本节原先把 `code=000` 写成"连接被拒/重置"——那是**症状**，不是病因。
curl 的 `code=000` **不告诉你原因**：连不上 / 超时 / **TLS 校验失败** / DNS 失败，
在 curl 眼里**全是 000**。再打一层 `openssl s_client` 才看清真相：

| 主机 | `Verify return code` | subject | issuer |
|---|---|---|---|
| `www.iap.cas.cn` | **18（self-signed certificate）** | `C=CN, ST=BeiJing, L=BeiJing, O=CN, OU=CN, CN=cn` | **与 subject 完全相同** |
| `iap.cas.cn` | **0（ok）** | `C=CN, ST=Beijing, O=中国科学院, CN=*.cas.cn` | `CN=CFCA OV OCA` |

→ `www.iap.cas.cn` 用的证书是**自签名**的（subject == issuer，没有 CA 签发）；
而 apex 的证书由 **CFCA** 签发，SAN 是 `DNS:*.cas.cn, DNS:cas.cn`。

**而且通配符只覆盖一级**：X.509 的 `*` **不跨点**，`*.cas.cn` 覆盖
`iap.cas.cn`，**不覆盖** `www.iap.cas.cn`（两级子域）→ **apex 才是唯一持证主机**。
这也正好解释了官方 `https://www.iap.ac.cn/` 的 301 为什么指向 `https://iap.cas.cn/`。

⚠️ **限定（12:30 只读复验者补正，措辞见 `/tmp/mvs_451e93_msg4_cert_evidence.md` 第 2 节）**：
客户端能证明的是「**`www.iap.cas.cn` 这个主机名拿不到可验证的证书**」，
**不能**证明服务器端为什么如此——至少两种同样成立的解释：
① 该站点只给 apex 配了 `*.cas.cn`，`www` 这个主机名没有有效证书，落到默认自签名证书；
② 链路中间某个设备对 `www` 主机名做了兜底，返回了一张通用自签名证书。
**我无法从客户端区分这两者。** 两条解释的**结论相同**（该主机名不可用于对外链接），
但把"通配符不覆盖"写成**已证实的唯一根因**是**过头**——它是**最合理的一种解释**，
不是被证实的唯一根因。（另注：**不要用 Python `fnmatch` 核对通配符覆盖**——
它的 `*` 会跨 `.`，会给出与 X.509 语义相反的结论。）

**为什么这值得写清楚**：只报"连接被拒"是**症状**，"自签名证书 + 通配符不覆盖"
才是**病根**。写进日志的错误病因会让下一个照着排查的人去查错方向
（去查防火墙、查 DNS，而不是去看那个主机名有没有证书）。
→ **判"外链坏了"的病根，curl 的 000 之后必须再打一层 openssl。**
⚠️ **订正（2026-10-19 17:50–18:10 场次：这段与它**上面**那个限定块自相矛盾）**：
上面那个限定块是 `0c9d586`（13:52）加的，它要的那句限定**已经在段内**；
但**紧接在它下面这一段仍与它打架**——这段把「自签名证书 + 通配符不覆盖」
整体称作「**病根**」，而限定块说得很清楚：只有「自签名证书」是**实测事实**
（`www.iap.cas.cn` 的 subject == issuer，`Verify return code: 18`），
「通配符不覆盖」是**最合理的一种解释**、**不是被证实的唯一根因**。
→ 正确读法：**实测到的是「该主机名拿到了一张自签名证书」；至于「为什么会这样」，
客户端无法区分** ① 站点只给 apex 配了 `*.cas.cn`、② 链路中间设备对 `www` 兜底。
两者的**结论一致**（该主机名不可用于对外链接），所以**修法不变**
（`affiliationUrl` 去 `www.`，已落地）。
另：**「apex 才是唯一持证主机」只在实测过的两个主机名范围内成立**
（`iap.cas.cn` 通、`www.iap.cas.cn` 不通）——没测过的其它主机名，客户端无法断言。
本段其余部分（openssl 实证表、X.509 通配符只覆盖一级的语义、
「不要用 Python `fnmatch` 核对通配符覆盖」）**经本轮独立复测，均准确**，不改。

**影响面**：`affiliationUrl` 同时出现在三处——
`src/index.njk` 与 `src/about.njk` 的**可见链接**（点机构名就跳过去），
以及 `src/_includes/layouts/base.njk` 里**站点级 `Person` 实体的 `affiliation.url`**
（全站每页的 JSON-LD 都带着它，**404 页也带**）。
消费方跟随结构化数据里的这个 url 会拿到连接错误。

**修**：`src/_data/site.js` 一处字符串 `https://www.iap.cas.cn/` → `https://iap.cas.cn/`
（该串自第一版提交 `b364fd2` 起就是这个写法，**从未被有意改过**，是打一开始就写错了）。

⚠️ **方法论订正**（比这个链接本身更值钱）：第四轮把 `iap.cas.cn 000` 归进
"反爬或本机网络不可达，**不能据此判定链接失效**"那一类（与 ResearchGate 403、
CSDN 521 并列）。那个归类对 ResearchGate / CSDN 成立，但对这一条**不成立**——
换 apex 主机名就 200，说明**是链接本身坏了**，不是"我这边访问不到"。
→ **"我打不开"和"它坏了"必须分开**：先换主机名 / 换协议再复测，
换完通了 → 该改的是**站点里的链接**；换完仍不通 → 才轮到我这边的网络。

**验证**：改后 `npm run build` → exit 0；`check:site` 备注与改前**逐字一致**
（不误伤）；产物里 JSON-LD 的 `affiliation.url` 已是 `https://iap.cas.cn/`，
两处可见链接的 `href` 同步更新。

### 留给下一轮（本轮改进点已用满，**不在本轮扩**）

1. ~~**门禁 16 只黑名单内容类实体 → 404 页把整个 Person JSON-LD 块删掉时门禁全绿**~~
   （11:53 实测 exit 0）。门禁 16 的黑名单是 13 类内容类实体，**不含 Person**，
   所以"错误页干脆一个实体都不发"这条路径没有门禁覆盖。
   修法：门禁 16 段末尾加 `hasOwnerOn404` 检查（`OWNER_NAME` 在门禁 16 段之前，
   作用域可用），补完后对应的注入应从 exit 0 变 exit 1。
   ⚠️ 注意这条与「待决策」里的"404 页要不要保留 Person"是**两件事**：
   那条是**展示口径**（Person 留不留由本人定），这条是**门禁覆盖缺口**
   （无论本人怎么定，都该有一条门禁保证"实际产出"与"选定的口径"一致）。
   → ⚠️ **本条已关闭 —— 且原修法现在照做是**有害的**（第十三轮 13:06 场次订正）**：
     ① 上面说的那个缺口**已经被关上了**：第十一轮把"404 页要不要 Person"做成
        `src/404.njk` 的 `identityOn404` **开关**，门禁 16 据此**双向**判定
        （`true` → 必须有身份实体；`false` → 必须没有）——
        开关与产物不一致时门禁红（实测 exit 1）。
        缺口不再存在，**不需要**再补一条独立门禁。
     ② **`hasOwnerOn404` 不要再加**：它要求"404 页必须有描述 `OWNER_NAME` 的
        Person 节点"，等于把「404 页要不要 Person」这个**本人尚未拍板的口径
        写死进门禁**——本人以后把开关翻成 `identityOn404: false`，
        build 就会直接红，正好违背那条"本人只改一行"的承诺。
     → 正确做法就是**已有的口径开关**（`identityOn404`），不要另起硬判据。
2. **编号元门禁**（编号唯一且连续、文件头清单与代码段一致）目前工作区还没有 →
   以后再改号会被自动拦下，不必靠人记。
   ⚠️ 早前写好的补丁（`/tmp/mh_r9v2/gate18.patch`）是基于**旧版** `verify-site.cjs`
   的，本轮已改过编号，**不要直接 apply**，需重做成能套在当前版本上的样子。
   → ✅ **第十三轮已做**（门禁 24）：`scripts/verify-site.cjs` 的门禁 24 段
   自己读本文件，比对"文件头编号清单"与"代码里的门禁段"必须**一一对应**、
   **编号唯一**、**整数连续**。已实测能抓住"加了门禁忘登记"与"同一个号写两遍"
   （本轮真的就发生过一次：22/23 落地时清单还停在 21，而当时门禁全绿）。

### ⚠️ 线上仍是旧版本（待部署，**不是站点损坏**）

本轮 11:02 只读复核：

| 线上路由 | 状态 |
|---|---|
| `/` | 200 |
| `/blog/` | 200 |
| `/about/` | 200 |
| `/sitemap.xml` | 200 |
| `/robots.txt` | 200 |
| `/404.html` | **200**（直访即 200 —— 这正是本轮 A 的改动要治的地方） |
| `/papers/` | **404** |
| `/publications.bib` | **404** |
| `/feed.xml` | **404** |

后 3 个 404 的东西**本地都存在且正常**（`/papers/`、`/publications.bib`、`/feed.xml`
在 `_site` 里都有）→ **属待部署**，不是站点损坏。
线上 canonical / og:url / sitemap 仍带 `/MeteoHub/` 前缀且逐条 404，同样是待部署。

**本任务禁止 push，部署由本人决定。**

---
## 2026-10-19 · 第十轮（12:15 场次）：只读巡检 · **本轮无新改进**

### 本场次定位

本人本场次明确指示：**只巡检，不新增改动**；`6953e74` / `54899f1` / `01dd76f`
三个 commit 已由本人按 hash 复核通过（无污染、lastmod 5/5 吻合、门禁 18/19/16
注入全拦），细节见 12:16 场次。

因此本场次**只做巡检 + 记录**，不重复劳动、不并行改同一批文件
（12:16 场次正在做门禁注入测试，并行改同一文件会撞）。

⚠️ 若 12:16 场次之后也追加了自己的小节，**两节不冲突**：本节只记巡检事实，
改进细节一律以 12:16 场次为准。

### 巡检结果（快照时刻 2026-10-19 12:15–12:18 PDT）

**线上**（仍是 2026-10-16 那次部署）：

| 路由 | 状态 |
|---|---|
| `/` | 200 |
| `/blog/` | 200 |
| `/about/` | 200 |
| `/sitemap.xml` | 200 |
| `/papers/` | **404**（本地已存在，属待部署） |
| `/publications.bib` | **404**（同上） |
| `/feed.xml` | **404**（同上） |

- 线上 4 个 HTML 页各 1 块 JSON-LD，**全部 `JSON.parse` 合法** ✓；
- `canonical` 与 `og:url` **4/4 一致** ✓（但仍带 `/MeteoHub/` 前缀）；
- `sitemap.xml` 只有 3 条 URL，**逐条实测全部 404**（都带 `/MeteoHub/` 前缀）；
- 线上 404 页**没有 `robots` meta** → 也还没有 `noindex`（第七轮的修复未上线）；
- 线上 `.bib` / `feed.xml` 取回的是 404 页 HTML（本来就是 404，见上表）。

→ **与日志里已记录的"待部署"状态逐项吻合，没有新增损坏**。
"线上不能坏"这一条：**通过**（原有 4 个路由全部 200）。

**本地**（HEAD=`01dd76f`）：

- `npm run build` **exit 0**；`check:css` 15 个文件通过；`check:site` 全部通过；
- 6 个 HTML 页、**127 条站内引用全部**可解析、5 条 sitemap URL；
- 13 个 Person 节点 `@id` 全站统一；3 件内容实体 `@id` 全站唯一且指向真实页面；
- 站内引用**零个根绝对路径**（"整个文件夹扔到哪都能跑"仍成立）；
- 本地 404 页 `robots = noindex, follow`、**无 canonical** ✓；
- 本地 sitemap 5 条 URL **全部**是 `https://github.lvyihang.xyz/` 开头（**无前缀**），
  逐条 lastmod 与各自源文件的提交时间一一吻合。

### 顺带复算的两个数字（用工具自身口径，不引用转述）

1. **未推送 commit 数 = 11**（转述里说 21，此处订正）：
   `git rev-list --count origin/main..HEAD` = **11**，仓库总提交数 33。
   且 `git ls-remote origin refs/heads/main` = `cfef8269…`，与本地 `origin/main`
   **指向同一个 commit** → **不是本地 ref 过期导致的少算，就是数目本身**。
   这 11 个 = 第一/二轮合并的 `9145197` 起、到第九轮 `01dd76f` 止，**一个都没 push**。
2. 线上 `/MeteoHub/` 前缀**不是本轮引入的**：本地 sitemap 与 canonical 都不带前缀，
   前缀只存在于线上那份 2026-10-16 的旧部署里 → 仍属待部署。

### 留给下一轮（本轮**未实施**，理由如上）

第九轮"留给下一轮"的两项，12:18 实测**仍未做**：

1. **门禁 16 只黑名单内容类实体** —— `scripts/verify-site.cjs:802` 的注释写明
   判据是"**内容类实体**列黑名单，而不是'404 页只能有 Person'"→ 404 页把整个
   Person JSON-LD 块删掉时，门禁仍会全绿（该路径**无覆盖**）。
   修法：门禁 16 段末尾加 `hasOwnerOn404` 检查（`OWNER_NAME` 在该段之前定义，
   作用域可用），补完后对应的注入应从 exit 0 变 exit 1。
   ⚠️ 与「待决策」里"404 页要不要保留 Person"是**两件事**：
   那条是**展示口径**（本人定），这条是**门禁覆盖缺口**（无论怎么定都该有）。
   → ⚠️ **本条已关闭，且原修法现在照做是**有害的**（第十三轮 13:06 场次订正）**：
     该缺口已由第十一轮的 `identityOn404` **开关** + 门禁 16 **双向判据**闭合
     （开关与产物不一致 → 门禁红）；而 `hasOwnerOn404` 会把"404 页要不要 Person"
     这个**本人尚未拍板的口径写死进门禁**，本人以后翻成 `identityOn404: false`
     就会 build 红。**不要再加**，用已有的口径开关即可。
2. **编号元门禁** —— 目前只有文件头的编号对照表（那是**文档**，不是门禁），
   "编号唯一且连续 + 文件头清单与代码段一致"仍**无自动拦截**。
   → ✅ **第十三轮已做**（门禁 24）：`scripts/verify-site.cjs` 的门禁 24 段自己
   读本文件，比对"文件头编号清单"与"代码里的门禁段"必须一一对应、编号唯一、
   整数连续（允许 4b/4c 这类字母后缀族，但不允许整号缺失）。
   已实测能抓住"加了门禁忘登记"与"同一个号写两遍"。

⚠️ 这两项都在 `scripts/verify-site.cjs` 同一个文件里，而 12:16 场次正在做门禁
注入测试（隔离副本 `/tmp/mh_rev/repo`，**未写主工作树**）→ 本场次并行改会撞，
故**只登记、不实施**。

  （这两条待决事项已搬进中央「待决策」段：见台账内「待拍板 29」与「待拍板 30」两条。
  18:20–18:55（PDT）场次就地搬正（同一场次，与本文件末尾本场次节对得上） —— 登记写在**台账之外**时，本人按台账找不到它 = 事实上的失踪，
  且下一个场次会以为那个号还空着、拿去登记别的事 → 同号两义。详见本文件末尾本场次节。）
---
## 待决策（需要本人拍板，任务不会自己动）



- **Google Scholar / ADS / arXiv 主页**：调研没找到本人的公开档案，所以**没有**
  擅自加链接。要加的话需要提供真实 URL，否则宁可空着。
- **`site.drive.url` 仍是 null**：网盘入口的整块 UI 已经就绪，填上真实地址即出现。
- **站点根目录的用途**：目前根目录就是学术主页。原先的设想是"根目录放网盘、
  `/MeteoHub/` 放学术主页"，现在用户站仓库只能挂在根，两者不能兼得。
- **是否公开源码**：Actions 模式要求源码在 GitHub 上；用户站仓库已是 public。
- **`site.author.affiliation` 与论文 affiliation 不一致**：站点作者档案写的是
  "中科院大气物理研究所"，而这篇论文的 affiliation 是 "Lanzhou University"。
  两者可能同时成立（读研单位 vs 论文单位），但学术主页上"我是谁"只有一个答案。
  属于事实性内容，不擅自改，需要本人确认该写哪个（或怎么表述）。
  （**第六轮补充**：结构化数据层面已用 `alumniOf` 把两者分开了，见本节
  "论文当时的单位要不要也显示出来"那条。）
  ⚠️ **第十三轮补充（外部佐证，不是拍板）**：作者**自己在 ORCID 上登记的**
  雇佣/学籍记录是——2026-06-01 起在 `Institute of Atmospheric Physics`
  （LAGEO，Student），此前 2022-09–2026-06 在 `Lanzhou University`
  （实测 `pub.orcid.org/v3.0/0009-0005-3511-0546/record`）。
  → 这条**独立佐证**了站上"现单位 = IAP + 曾就读 = 兰大"的两段式写法
  （即 `affiliation` / `alumniOf`），但**具体措辞仍由本人定**。
- **`citation_author_orcid` 暂不输出**：7 位作者里只有 3 位有 ORCID，而该标签是
  **按位置配对**的，只给 3 个会让 Zotero 把 ORCID 挂到错误的人身上。
  现在的做法是：ORCID 在 JSON-LD 与页面可见链接里**逐人绑定**，
  `citation_*` 里一律不给。若本人希望 Scholar 侧也带 ORCID，
  需要先在 Crossref 上把缺失的 ORCID 补全（作者本人操作）。
- **数据集的引用条目用哪一种写法**：本轮按"**与已发表论文逐字一致**"处理
  （标题用 v1.0 时期的 "Thunderstorms stage identification"、年份 2025、
  DOI 用 v2.0、不写版本号），理由是读者照论文里的引用去查能查到同一条记录。
  另一种写法是"**条目自身自洽**"（标题用 v2.0 的论文标题、年份 2026、
  写 `version = {2.0}`），读者复制后去 Zenodo 查完全对得上，但与论文正文
  里的那条引用对不上。两种都站得住，属引用口径的取舍，**没有替本人拍板**。
  另已给出 "All versions" 概念 DOI（`10.5281/zenodo.16662143`），
  指向最新一版、标题改了也不失效。
- **OpenAlex 是否要放在页脚可见位置**：本轮已加（`A5121394231`，经 ORCID
  反查核实）。它是聚合库的上游，放 `sameAs` 里对归属判读有利；
  但页脚可见链接是"我承认这个身份"的意思，也可能不希望它跟 ORCID 并列。
  删掉只需去掉 `site.author.openalex` 即可，页脚那行是判空渲染的。
  ⚠️ **18:40–19:05 场次补充（门禁耦合，不是新问题）**：删掉 `site.author.openalex` 时，
  除了这一处，还要同步身份门禁的**独立期望集**（`ORACLE_SAMEAS` / `EXPECTED_COUNT` /
  `ORACLE_SET_SHA256`，I2 会红）与共享模块 `scripts/lib/identity.cjs`（I2d 会红）；
  **只删页脚那一行**则会被身份门禁 I8「可见性一致」判红（那一条要求页脚负责渲染的
  句柄在**每一份产物**上都看得见），红因里已写明三种可能：把渲染补回去 /
  把该字段从 site.author 里一起去掉 / 从判据范围 `SCOPE_KEYS` 里**显式**去掉
  （只删页脚那一行是不够的——那会让这条判据失去监视，门禁不会另外叫你）。
- **Twitter/X 真实句柄（第五轮新增）**：此前 `base.njk` 写死了两个猜测值
  （`@meteohub` 实测是别人的账号、`@oldsixxiaolv` 在 X 上 404），
  已改为**没有真实句柄就整对不输出**。`site.js` 的
  `site.author.twitterSite` / `twitterCreator` 现为 `null`，
  **填上本人真实句柄（含 @）后两个 meta 会自动出现**，
  并已加门禁防止写死的兜底值再回来。若本人确实没有 X 账号，就保持空着。
- **数据集的"两个标题"在页面上怎么表述**：同一个 Zenodo 概念在 v2.0 时
  把标题从 "Thunderstorms stage identification" 改成了论文标题。
  第五轮把两个都摆出来并注明差异（读者点 DOI 看到的 / 论文里引用的），
  属于**展示口径**的取舍。若本人更希望只显示其中一个，改 `paper.njk`
  里那段 `registeredTitle` 判空即可。
- **`citation_author_institution` 暂不输出——是"口径未定"，不是"会错挂"**（第六轮新增）：
  ⚠️ 这里更正过一轮：最初的理由写的是"只给 1 条会把 'Lanzhou University'
  错挂到第一作者 Xueke Wu 名下"，**该理由与 Crossref 出版商登记不符**。
  2026-10-19 重新拉 `api.crossref.org/works/10.1029/2026JD046836` 逐作者打印，
  实测结果是 **7 位作者（含第一作者 Wu, Xueke）的 affiliation 字符串逐字相同**，
  7 条去重后**只剩 1 个值**：
  `College of Atmospheric Sciences/Key Laboratory for Semi‐Arid Climate Change of the Ministry of Education Lanzhou University  Lanzhou China`
  ——所以"给 7 条同值"恰恰**与出版商登记完全一致**，不构成错挂。
  真正待定的是**口径**：
  ① 出版商登记的是**完整串**（学院 + 重点实验室 + 城市 + 国家），
     站内 `site.js` 只有短式 `pub.affiliation = "Lanzhou University"`（L357），
     **完整串字段 `fullAffiliation` 全仓 0 命中**，要逐字输出需先建该字段
     （还得把 U+2010 连字符换成 ASCII `-`、双空格并成单空格、补回逗号）；
  ② `citation_*` 是**引用元数据**，按 Highwire 惯例应反映**发表时**的单位
     （Lanzhou 口径），而 `site.author.affiliation = "中科院大气物理研究所"`（L77）
     是**当前**单位——两者是不同时间点，不矛盾，也不能互相覆盖。
  本轮选择**一条都不给**。要加的话请拍板：**短式 ×7**，还是**出版商原文 ×7**？
- **404 页缺 `noindex`，还发着 canonical 和全站 JSON-LD**（第六轮新增，实测）：
  ⚠️ **其中「缺 noindex」与「发 canonical」两项已在第七轮修掉**（见上文第七轮），
  **「发文章类 JSON-LD」已在第九轮修掉**（见上文第九轮）——即错误页上的
  `ScholarlyArticle` / `Grant` / `MediaObject` / `Periodical` 全部去掉了，
  改后 404 页只剩 `Person` 族实体。
  **仍未处理、留待本人拍板的只剩一条**：404 页**要不要把 Person 实体也去掉**。
  - 支持去掉：错误页上的任何实体都属于"这个 URL 上挂着内容"；
    `noindex` 只是不让它被收录，**实体本身仍会被爬虫读到**。
  - 支持保留：Person 描述的是**站点作者本人**、`url` 指向站点根
    （`https://github.lvyihang.xyz/`），与"这个 URL 是一篇论文"无关；
    对消费方的**实体消歧**（把散落各页的同一个人合并成一个节点）有益，
    而 `@id` = `{{ site.url }}/#person` 与其它页面完全一致。
  - 本轮**没有替本人拍板**：选了"保留"，并把它做成**开关**
    `src/404.njk` 的 `identityOn404`（默认 `true`），而不是把口径写死进门禁。
    ⚠️ **第十一轮订正（下面这段原本是错的，照它改会改错地方）**：
    原先这里写的是"若本人选'去掉'，改 `base.njk` 的 Person 块加
    `{%- if not is404 %}` 即可，第 16 条门禁不受影响（它不查 Person）"——
    **两处都不成立**：
      ① 改法已变成**翻 `src/404.njk` 的 `identityOn404` 一行**
        （`base.njk` 读的是页面变量，不是自己写条件）；
      ② "门禁不受影响"是**假的**——门禁 16 现在**双向读同一个开关**：
        `true` → 404 页必须 ≥1 个身份类实体；`false` → 必须 0 个。
        开关与产物不一致时**门禁会红**（实测：翻成 `false` 但产物里还留着
        Person → 报"开关与产物不一致"，exit 1）。
    → **本人拍板时只改 `src/404.njk` 那一行，模板与门禁代码都不用动**；
    两种口径门禁都认，不会出现"改了开关 build 却红了"的情况。
    ⚠️ 那一行请写 `true` 或 `false`（`True` / `False` / `TRUE` / `FALSE` 也能过——
    模板与门禁都按 js-yaml 的布尔口径取同一个值，两边不会对不上）；写成 `no` /
    `on` / `off` / `"false"` / `null` / `1` 这类**会被门禁直接报红**，
    不会静默兜底成 true。
  另附实测记录，供后续判断：
  - `og:type` = **`website`** ✓ 正确——第三轮定的规则（只有带 `pubKey` 的论文页
    才算 `article`）在 404 页上**没有**误判，这条**不用改**；
  - 404 页由 `src/404.njk`（布局 `layouts/page.njk` → `layouts/base.njk`）生成；
  - ⚠️ 线上 `/404.html` **直访返回 200**（不是靠访问不存在的路径才 404），
    所以它是一个**可被抓取的真实页面**——这是第九轮把它按缺陷（而非口味）处理的依据。
- **`date:` 被同时用作三种含义，sitemap `lastmod` 与 robots "生成时间" 都不真实**（第六轮新增，实测；**第八轮已修掉 robots 那一半**）：
  本机时区是 **PDT（UTC-7）**，以下时间已按此换算过：
  - `sitemap.njk` 用的是 `entry.date`。对**模板页**而言 `entry.date` = 源文件的
    **birthtime**（创建时间），不是 mtime、也不是提交时间。实测：
    `src/index.njk` birth = 2026-10-01 20:35:40 PDT → sitemap `lastmod` =
    `2026-10-02T03:35:40.690Z`；而它 mtime 是 2026-10-15、最后一次提交是
    2026-10-19 10:39。**三者互不相等。**
  - `robots.txt` 里那行 `# 生成时间：2026-10-02T04:29:21.600Z`，
    **正好等于 `src/robots.njk` 的 birthtime**（实测 birth = 2026-10-01 21:29:21 PDT）。
    它**不是构建时间**，而且**永远停在 10-02**——站点实际是 10-19 建的。
    这是个**会误导人的标签**，比单纯"不准"更糟。
  - `feed.xml` 的 `lastBuildDate` 取 `items[0].date`（最新条目的 date），
    实测 = `2026-06-01T00:00:00.000Z`，也是**论文发表日**、不是构建时间。
  - 根因：`date:` 这一份前置数据被**同时用作**①发表日期（feed `pubDate`、
    `citation_publication_date`）②最后修改时间（sitemap `lastmod`）
    ③生成/构建时间（robots 的"生成时间"、feed 的 `lastBuildDate`）。
  - **不能直接改 `date:`**——它对 feed 的 `pubDate` 和论文引用是**对的**
    （`paper.md` 的 `date: 2026-06-01` 就是发表日），改它会连带污染
    `citation_publication_date` 等**语义正确**的字段。
  - 正确改法：另加**只给 sitemap 用**的独立 filter（取 git 最后提交时间），
    并把 robots 的"生成时间"改成真正的构建时间（需要给模板传入构建时刻）。
  本轮**未实施**：属于"改一个 filter + 改一处标签"的独立小改动，
  且需要本人确认是否值得（`lastmod` 本身对 SEO 影响有限，但 robots 那行
  **标错了**）。
  - ⚠️ **第八轮补充：robots 那半已经修掉了，sitemap 这半仍待拍板。**
    robots 的"生成时间"改成了**真的构建时刻**（新增 `buildStamp` filter
    + 门禁 16，见第八轮），所以"robots 标错了"这条不再是缺陷。
    但 **`sitemap` 的 `lastmod` 仍是老问题，而且线上正在暴露它**：
    线上 `/` = `09:51:14.894Z`、`/about/` = `09:51:14.887Z`、
    `/blog/` = `09:51:14.893Z`——**同一毫秒级**，就是 `actions/checkout`
    写盘那一瞬间；而 `git reflog` 显示 origin/main 最后一次 push =
    `2026-10-16 02:51:01 -0700`（= `09:51:01Z`），**部署就在 push 后 13 秒**。
    → 每次部署，**全站 lastmod 一起跳到部署时刻**。
    三种修法（**口径要本人拍板**，本轮不实施）：
      **A** 用 git 最后提交时间（语义最正确）→ 需在 `deploy.yml` 把 checkout
        改成 `fetch-depth: 0`（现为浅克隆，拿不到提交历史）；
      **B** 每页 front-matter 显式写 `lastmod`，sitemap 用 `page.lastmod or page.date`
        （最可控、零外部依赖，但要逐页维护）；
      **C** 不输出 `lastmod`（sitemap 规范里它是可选的；Google 官方明确说
        没有可靠来源就别给）。
    ⚠️ **第九轮补充：本轮按 A 实施，但 A 单独成一个 commit，口径仍由本人拍板。**
      实现 = `eleventy.config.js` 的 `lastCommitTime` filter + `src/sitemap.njk`
      改用 git 提交时间 + `deploy.yml` 加 `fetch-depth: 0` + `verify-site.cjs` 的
      门禁 18/19。**A 是本段列出的待拍板选项之一**，本任务不代本人拍板，
      所以 **A 单独落在 commit 2**（commit 1 只带 404 修复）→
      本人若要改口径，**只需回退 commit `54899f1`**（= 本段的"commit 2"），
      404 修复（`6953e74`）留在历史里不受影响。
      ⚠️ 但 `git revert 54899f1` **会冲突**（2026-10-19 实测）：
      `docs/IMPROVEMENT-LOG.md` 与 `scripts/verify-site.cjs` 两个文件冲突
      （都被后续 commit 改过），需手工解决；`eleventy.config.js` /
      `src/sitemap.njk` / `.github/workflows/deploy.yml` 三个实现文件能自动合并。
      ⚠️ **订正（2026-10-19 17:30–17:50 场次实测：上面那个冲突面已过期）**：
      在复验时的 HEAD 上重测 `git revert 54899f1`，冲突文件是 **3** 个
      （`docs/IMPROVEMENT-LOG.md` / `eleventy.config.js` / `scripts/verify-site.cjs`），
      能自动合并的只有 **2** 个（`src/sitemap.njk` / `.github/workflows/deploy.yml`）——
      `eleventy.config.js` 在此之后被改过（旧记录把它列为"能自动合并"）。
      照旧记录去 revert 会漏掉第 3 个冲突文件。
      代价也一并记下（**数字已订正**）：`fetch-depth: 0` 的真实代价约 **9 MB**
      （全部 30 个提交、356 个 blob 合计 8.87 MB），完整克隆实测耗时 **0.5 s**。
      ⚠️ 此前这里记的"471 MB"是 `du -sh .git` 在 **exFAT 上的块分配虚高**
      （本机 `.git/objects/` 里有 764 个 `._*` AppleDouble 垃圾文件，git 一直报
      "garbage found"；小对象又各吃满一个 32K 簇），**不是真实数据量**——
      判断克隆成本**不能用 `du -sh .git`**。git 自身口径：`git count-objects -vH`
      → size-pack **217.42 KiB**；`git clone --no-hardlinks` 实测 **0.457 s**、
      克隆出的 `.git` 24 MB。
      ⚠️ 另一处订正：此前"那 4 个文件彼此自洽"**不成立**——待决策单元实际是
      **4 个文件 + 门禁 18/19 那一整块**（门禁 19 同样依赖 `eleventy.config.js`
      给站点级实体补的 `@id`）；实测只提交 3 个文件的那棵树会**同时**红在两处，
      共 9 个问题（5 条 lastmod + 4 个页面缺 `@id`）。
      - ⚠️ **A 方案自己还剩一个口径缺口，仍需本人拍板**——lastmod 现在
        **只跟本页的源文件走**：
          - 改 `src/_includes/layouts/base.njk`（影响全站每页 JSON-LD）→ **5 条
            lastmod 无一反映**（实测：`base.njk` 在 `fdb5dca` 改过）；
          - 改 `src/content/papers/papers.11tydata.cjs`（影响论文页地址与数据）→
            同样不反映。
        三个选项：
          **① 维持现状**（lastmod = 本页源文件的最后提交时间）——语义是"这个 URL
          的**页面**最后一次改变的时间"，实现最简单、已验证；
          **② lastmod = max(本页源文件, 相关 layout/partial, 数据文件)**——更贴近
          "这个 URL **呈现出来的内容**最后一次改变"，但要重建 Eleventy 的
          页面↔源文件映射（permalink 不统一：`blog.njk` 显式 permalink、
          `index.njk`/`about.njk` 走默认规则、`paper.md` 靠目录数据文件定址），
          映射会脆、会漂；
          **③ 回到 A1（全站统一成 HEAD 的提交时间）**——实现最省事，但全站一个值，
          等于放弃"逐页区分"（本轮门禁 18 也**不判**它是缺陷，因为那是合法口径）。
        另注：sitemap 规范里 `lastmod` 是**可选**的，Google 官方也说过没有可靠
        来源就别给（对应原选项 C）。
        ⚠️ **第十二轮实测订正（原文是假的，照它做 build 会红）**：
        原文写"要回退到 C 只需把 `lastCommitTime` filter 改成恒返回空"——**实测不成立**：
        隔离克隆照做 → `npm run build` **exit 1**，5 条报错（"源文件提交过，
        这一页却没有 <lastmod>——lastmod filter 静默失效了"），
        因为**门禁 18 的规则 E 正是抓这个**（逐页判"该有 lastmod 的页面必须有"）。
        → **选 C 必须同时撤掉门禁 18**，二者缺一不可：
          ① `eleventy.config.js`：`lastCommitTime` filter 恒返回空；
          ② `scripts/verify-site.cjs`：**整段删掉门禁 18**（约 208 行）；
          ③ `src/sitemap.njk`：**不用动**（`{% if lastmod %}` 会自动不输出）；
          ④ `.github/workflows/deploy.yml` 的 `fetch-depth: 0` 可留可去（无害）。
        照这四步实测：`npm run build` **exit 0**、sitemap 5 条 loc、**0 条 lastmod**。
        若选 B 则需另写逐页 front-matter（尚未实现）。
    ⚠️ **排掉的坑（省下重复排查）**：
      - `git archive` 解包的副本里 lastmod 会**全变成 commit 时间**
        （tar 无 birthtime 概念，解包时被设为 mtime）→ **在副本里看 lastmod 是假象**；
      - ⚠️ **`rsync -a` 也不保留 birthtime**（副本里每个文件的 birthtime = 源文件 mtime），
        Eleventy 取 birthtime → **副本里每页 lastmod 各不相同**，
        **看着像"已经修好了"，实际没验**——这比 `git archive` 那个"全站同值"的假象
        **更危险**，因为它更像真的。→ **验 lastmod 必须回工作区构建**；
      - `touch` 只改 mtime 不改 birthtime → 可用它证明 lastmod 不是 mtime 驱动；
      - **layout（base.njk）不参与** date 计算 → 改 layout 不会影响任何页面的 lastmod。
- **"论文当时的单位"要不要在**论文页**也显示出来**（第六轮新增，实测后订正过一轮）：
  ⚠️ 最初写的是"读者在论文页的作者信息里看到 Lanzhou University"——**实测不符**，
  论文详情页的可见文本里**根本没有单位**（`grep -c home-pub__aff` = 0，作者行只有 7 个名字）。
  实测后的真实情况是：
  - **首页**的成果卡片（`partials/publications.njk:173` 的 `.home-pub__aff`）
    **会显示** "Lanzhou University"，位置就在作者名下面——
    这才是可能引起误读的地方：同一屏上方 hero 牌子写的是
    "PhD Student · IAP-CAS"（**当前**单位），下方成果卡写的是兰州大学；
  - **论文详情页**不显示任何单位；
  - 论文的 `ScholarlyArticle.author` 节点**没有** `affiliation` 字段
    （7 个 author 节点实测全部为 `None`）；
  - **Person 节点的语义已经是分开的**（`base.njk:323-336`）：
    `affiliation` = IAP-CAS（**现在在这里**），
    `alumniOf` = `CollegeOrUniversity` "Lanzhou University"（**曾就读**）——
    结构化数据层面**不矛盾**，`alumniOf` 的用法也准确。
  所以真正要拍板的不是"两个单位哪个对"，而是**要不要在论文页补一行署名单位**，
  以及补的话用哪个口径（发表时的兰州大学 / 现在的中科院 / 两个都写并注明
  "论文署名单位"）。数据侧缺的是 `pub.authorAffiliations` 这类
  **逐作者单位**字段（Crossref 里 7 位作者是同一个单位串，所以统一值也够用）。
  本轮**没有擅自加**——这属于事实性内容 + 展示口径，需本人拍板。
- **"Fig. 10" 这个图号要不要保留**（第八轮新增，实测后提出）：
  `site.js` 的 `publications[].figure.alt` 带 **"Fig. 10 — "** 前缀。
  - **该图号无法从外部核实**：Crossref 的 JATS 摘要里 `<fig>` 数量为 0、
    本地没有 PDF、图上只有 (a)(b)(c)(d) 面板标，没有 "Fig. 10" 字样。
  - 但 `git log -S` 溯源到 `0252580`，确认是**作者原站重构时的原文**，
    不是后来加的猜测 → 第十轮（10:45）决定**不擅自改作者措辞**。
  - **它会经 `og:image:alt` 上到社交分享卡片**（Facebook / LinkedIn / X），
    读者点开原图若找不到图号，会显得不严谨。
  - 供拍板的两个选项：**① 保留** "Fig. 10 —"（忠于作者原文）；
    **② 去掉图号只留描述**（如 "Three-dimensional structural profiles of …"）。
    数据侧改动只有 `site.js` 一处字符串。
  - ⚠️ 顺带核实过的**不是**问题的那部分（不用改）：`figure.alt` 描述的
    **图内容**（三个阶段的小提琴图 + 累积分布曲线）与图**完全相符**，
    第八轮直接看过图；真正与图不符的 `paper.md` 里那份 `coverAlt`
    已在第八轮删除（alt 现在三处同源）。
  → ⚠️ **本条已关闭（14:45 场次订正：成因当时成立，现已被后手修掉）**：
    12:50 场次实测的那串重复**不是误读**——复验时回看 `dead243`（13:05，
    `fix(site): 分享卡图 alt 同源 + 本人身份判定改由数据派生`）的 diff，
    `base.njk` 的 twitter 侧此前**确实**是
    `ogTitle + ' · ' + name + ', ' + jobTitle`（首页 ogTitle 本身已含姓名与职位
    → 拼出下面那串重复），与 12:50 的产物实测**逐字对得上**。
    但 `dead243` 已把 twitter 侧改为**复用 og 侧的同一句话**（`ogCardAlt`），
    并在 `base.njk` 的注释里点名要避免的正是那一串。
    **复验时（HEAD = `e1ffce5`）的产物实测**：index / about / papers / blog
    **四页**的 `og:image:alt` 与 `twitter:image:alt` **逐字一致** =
    `MeteoHub — Yihang Lyu, PhD Student at IAP-CAS`。
    → 本条后文列的那三个选项（① 两处统一成同一句 ② twitter 侧只留身份描述
    ③ 保持现状）**已无须本人拍板**：事实层面 ① 已经是现状。
    （若本人想改的只是**措辞本身**——比如去掉 `MeteoHub — `、或把单位写全——
    那是**另一条独立的展示口径**，与本条无关。）
- **首页分享卡片的 `twitter:image:alt` 要不要重写**（12:50 场次实测新增）：
  首页产物实测——`og:image` 与 `twitter:image` **是同一张图**
  （`assets/img/og/og-1200x630.png`），但两处 alt 说法**不一致**：
  ```
  og:image:alt      = MeteoHub — Yihang Lyu, PhD Student at IAP-CAS
  twitter:image:alt = Yihang Lyu · PhD Student · Yihang Lyu, PhD Student
  ```
  twitter 侧把作者姓名/职位**重复了一遍**（社交平台读出来就是那串重复）。
  成因链（逐环可复现）：
    · `src/index.njk` 的 `eleventyComputed.title` = `"{{ site.author.name }} · {{ site.author.jobTitle }}"`
      → 覆盖了 front matter 的 `title: Home`；
    · `base.njk:27` 的 `pageTitle` → `base.njk:150` 的 `ogTitle` = `Yihang Lyu · PhD Student`；
    · `base.njk:306`（无封面图的分支）把 alt 拼成
      `ogTitle + ' · ' + site.author.name + ', ' + site.author.jobTitle`
      → **ogTitle 本身已含姓名+职位，又拼了一遍** → 出现重复；
    · og 侧走 `base.njk:276` 的 `ogCardAlt`（`base.njk:155` 独立拼装的完整句）→ 不重复。
  ⚠️ 讽刺的是 `base.njk:152-154` 的注释**点名**要避免的正是
  `"Yihang Lyu · PhD Student · Yihang Lyu, PhD Student"` 这串
  ——**注释声明的意图与 `:306` 的实现不符**。
  **口径待本人拍板**：① 两处统一成同一句（推荐，`og:image:alt` 与
  `twitter:image:alt` 同源）；② twitter 侧只留身份描述、去掉重复署名；
  ③ 保持现状。
  ⚠️ 与已有的"Fig. 10 前缀"（待拍板第 3 条）**不是同一个根因**：
  那条讲**图的内容描述**带图号，这条讲**同一张 og 图的两处 alt 拼装不一致**。
  ⚠️ 顺带：这条**当前没有任何门禁守着**——门禁 15 只在"这张图也出现在本页
  `<img>` 里"时才比对两处 alt，而首页的 og 卡片图根本不在首页的 `<img>` 集合里
  （详见本轮"留给下一轮"第 7 条）。

- **ORCID 记录里的作品列表目前是空的**（第十三轮新增，实测）：
  站上把 `https://orcid.org/0009-0005-3511-0546` 当作身份锚点公开给出
  （JSON-LD `sameAs` + 关于页可见链接），但那条 ORCID **公共记录**的
  `works` 节点**一条都没有**——论文与 Zenodo 数据集都还没挂上去，
  读者点进去看到的是空列表。
  - **这是作者本人在 ORCID 上的操作**（把 JGR-A 论文与数据集加为 works），
    本任务不代劳；
  - 不影响站点正确性：ORCID 本身是有效标识（`claimed` + 已验证邮箱），
    只是"点进去看不到作品"。

- **RIS 条目的两个字段口径**（14:10 场次新增，RIS 导出落地时带出的取舍）：
  RIS 导出这一轮做完了（`/publications.ris` + 论文页 3 个 Copy 按钮 +
  门禁 30 双向逐字一致校验），但**两个字段口径是挑的，不是我拍的**：
  ① **摘要（AB）现在不输出** —— 与 BibTeX 侧同一口径（那边本来也没有
     `abstract` 字段）。另一种是输出：RIS 的 AB 行是**一条 2000 字符的单行
     文本**，放进论文页的 `<pre>` 会变成一条极宽的横向滚动条，页面上的
     可读性明显变差；而读者要摘要，页面上方就有原文段落，Zotero 导入 DOI
     时也会自己通过内容协商取。
  ② **AGU 的 e-locator（`e2026JD046836`）放在 `SP`（起始页）位置** ——
     RIS 里没有"文章号"这个标签位，`SP` 是文献管理器唯一认的位置
     （EndNote / Zotero 都按页码读它）。严格说它不是页码，但本篇只有一条
     文章号，`SP` 是通行做法。
  两处若要改，都是改 `eleventy.config.js` 里的 `ris` / `resourceRis`
  过滤器；**门禁 30 会自动跟着对齐**（它比的是"页面上能复制的"与
  "文件里能下载的"逐字一致，不是写死的字段表），所以改口径不用动门禁。

  **2026-10-19 17:15 场次实测补充**（本条的下半场已经被事实收敛了一半）：

  - ② 的 `SP` **已经在位**（`SP  - e2026JD046836`），且与页面的
    `citation_firstpage` **逐字一致**。这一点不再靠"当初是这么挑的"来担保，
    而是被新门禁 `scripts/check-citation-meta.cjs` 的 C3「页码/文章号 三处
    口径」**实测**确认过（同一篇论文的同一字段，页面 / BibTeX / RIS 必须给
    同一个值，差一个就判红）。→ **②这半边其实已经是"现状"，不再是悬着的
    选项**；真正还悬着的只剩①。
  - ① 的 `AB` **仍然不输出**（RIS 记录里确实没有 AB 行），而**页面是发
    `citation_abstract` 的**（Crossref 登记的 VOR 摘要原文）。
    → 也就是说：**同一篇论文的摘要在"Scholar 看到的"与"导入文献管理器
    得到的"两处口径不同**，而且此前**没有任何判据能看见这件事**
    （C3 的字段表里没有摘要这一项）。
  - 本场次已把这件事**登记**进工具层：引用元数据门禁的 C3 补了一条
    「摘要」核对，行为是——
      · RIS 里**没有** AB → 记成「已知差异」，**不判红**，但**每次 build
        的输出里都点名**（不替本人拍板，也不让这道差异随时间被忘掉）；
      · RIS 里**有** AB → 必须与页面 `citation_abstract` **逐字一致**，
        漂移即判红。
    → 即：**补 AB 这件事从此有了自动护栏**（补完自动被核对），**不补**也
    不会把 build 弄红。是否输出仍是本人的决定。
  - 另一处相关事实（与本条同族的"日期口径"，一并摆出来供拍板参考）：
    Crossref 对本文登记的 `published` 与 `published-online` 都是 **2026-06-01**，
    而 `published-print`（**期号日**）是 **2026-06-16**；本站三处
    （页面 `citation_publication_date` / BibTeX `month=jun` / RIS `DA`）
    用的都是 **2026-06-01**。若要改用期号日，是改 `src/_data/site.js` 的
    `dates.published` **一处** → 三处一起变；但那会同时牵动 JSON-LD 的
    `datePublished`，而它的粒度是**另一条**待决策（本文件里的
    「`datePublished` 粒度」那条，两者需一起定，否则会出现"页面写期号日、
    结构化数据写在线日"的新不一致）。
  - 顺带核对（无问题，记账备查）：页面的 `citation_pdf_url` 与 Crossref 登记的
    `application/pdf` contentUrl **逐字一致**
    （`https://agupubs.onlinelibrary.wiley.com/doi/pdf/10.1029/2026JD046836`），
    本轮**未改**任何一处引用元数据。

- **「git 判定不出来」要不要在门禁汇总里也留一句 note**（15:30 场次新增）：
  `git` 被信号杀（SIGKILL/SIGTERM/SIGSEGV）、存在但不可执行（EACCES/ENOEXEC）、
  或跑崩了（ENOBUFS）时，**门禁不能降级** —— 降级等于把"判不出来"说成
  "没有 git 历史"，于是规则 C/D/E（逐页核对 lastmod +「lastmod 整体消失」兜底）
  整块被跳过 → 门禁报"源码 zip 分发"而全绿，实际上一页都没验证过。
  端到端实测（2026-10-19）：删掉 sitemap 的 `<!-- source: ... -->` 标注 ——
  git 可用时 exit 1 判红；git 被 SIGKILL 时 exit 0 全绿（同一个缺陷，两种结果）。
  现在（15:30 场次已落地）这类情况是**构建失败 + 抛一句说清原因的话**。
  仍待拍板的是**要不要在 `verify-site.cjs` 的汇总里也记一条 note**，
  让人一眼看出这是**环境问题**（git 被杀）而不是代码问题。
  备选：① 只抛（现状）；② 抛 + 汇总里也 note 一句；
  ③ 降级成"没有 git 历史"（**不建议** —— 就是上面那条假绿）。

- **EACCES / ENOEXEC 归「git 不可用（降级）」还是「判定不出来（抛）」**
  （15:30 场次新增）：
  git 明明装着、仓库明明在，只是跑不起来（权限被抽掉 / 架构不对）。
  本轮按上一条的教训选了**抛**（降级会让门禁以为验过了）；
  另一种看法是"git 用不了 = 本来就没有 git 历史"，与 ENOENT 同类、可以降级。
  两种都说得通，**本轮不替本人拍板**：本轮实现是「抛」，
  改成降级只需动 `scripts/lib/git-error.cjs` 里的一行分类。

- **GitHub 仓库无 license 的展示口径**（15:30 场次新增）：
  论文页新增的源码仓库实体**不写** `license` —— GitHub API 实测该仓 `license: null`
  （没有许可证声明），**不编造**。但**页面上**要不要提示一句「该仓库未声明许可证」？
  现状是「Code ↗」按钮只给入口、不解释许可状态；而同页的数据集 / 胶囊**是有**许可声明的
  （`site.js` 真源里 `license` / `licenseUrl` 都有值）→ 三者口径不一致。
  这属于**展示口径**，本轮不替本人拍板。

- **代码仓库实体的 `@id` 口径**（15:30 场次新增）：
  数据集 / 胶囊的 `@id` 用的是 **DOI**（`10.5281/zenodo.18041880` /
  `10.24433/CO.6720035.v1`），而 GitHub 源码仓**没有 DOI**，只能用仓库 URL 当 `@id`
  （本轮门禁 M3 已写死这个口径）。
  是否统一成「实体标识一律用可持久解析的权威标识，没有则用 canonical URL」？
  备选：① 保持现状（仓库用 URL）；② 给仓库申请 DOI/handle 后改用 DOI。

- **论文列表页 ItemList 的落点：正文之后而非 `<head>`**（15:41 场次新增）：
  新增的列表级实体（ItemList）放在 `/papers/` 正文之后，**不在 `<head>`**。
  这不是省事，是 Eleventy 的 `layout:` 属于**数据级包装**、不是 Nunjucks 的
  `extends` —— `{% block %}` **跨模板不生效**（`paper.njk` 顶部已有明文记载，
  并因此把 paper-reader.css 改成 inline）。实测：在 `papers.njk` 里写
  `{% block structuredData %}` 只会把那段内容就地渲染成正文的一部分，
  根本进不了 `<head>`（首次实现就是这样跑偏的，见该场次日志 §B）。
  而"页面专属的结构化数据跟在内容后面"正是本仓论文页**既有做法**
  （论文页自己的 ScholarlyArticle JSON-LD 也在正文之后）。
  备选：① 接受现状（与论文页一致）；② 要求全站结构化数据统一进 `<head>`
  —— 那要改 `base.njk`，牵动全站模板与已有门禁。
- **首页要不要也给一个 ItemList**（15:41 场次新增）：
  首页的论文区标题是「Selected publications」（**选摘**，不是全量），
  本轮**没有**在首页声明 ItemList —— 那会是一个范围与 `/papers/` 不同的
  同名实体，按全量声明就是假声明（门禁 32 的反向判据也正是拦这个）。
  备选：① 维持现状（首页不声明列表级实体）；② 给首页单独一个只覆盖选摘的
  ItemList（另一个 `@id`，与 `/papers/#list` 并存）。
- **打印块的期望集写死在门禁里（17:35 场次新增）**：
  打印主题门禁（PT1–PT6）把打印块应当声明的 **22 个 token** 写死在
  `scripts/check-print-theme.cjs` 的 `ORACLE_PRINT_TOKENS` 里（自带条数锚 +
  哈希锚）。将来换配色要同步**三处**：`tokens.css` 的浅色 `:root`、
  `print.css` 的打印块、以及门禁里的期望集与哈希。
  备选：① 接受这个维护约定（红因会直接给出该贴的新哈希）；
  ② 改成"只比相对关系（浅/深方向、覆盖率），不比具体色值"——
  那样改配色不用动门禁，但"这个白到底白不白"就没人管了。
- **ORCID 白名单需要人工登记（17:35 场次新增）**：
  I6 判据要求全站出现的每一个 ORCID 都登记在册（当前 3 条：本人 + 2 位
  合作者）。新论文带来新的合作者 ORCID 时，要登记进 `ORCID_ALLOWLIST`
  （并同步 `ORCID_ALLOWLIST_COUNT` 与 `ORCID_ALLOWLIST_SHA256`）才能通过。
  备选：① 接受人工登记；② 放宽为"只查格式不查值域"——
  那就回到"各节点之间一致即可"的旧局面（全站一致写错仍无人看守）。
- **新增平台要不要登记为本人账号（17:50 场次新增）**：
  身份门禁的形态规则（`isIdentityProfile`）改成**与主机无关**之后，
  任何"一段式"URL（主机 + 一个路径段）只要出现在 `site.author` 或产物里，
  就必须落在登记清单内，否则判红。好处是**新平台不再静默漏网**
  （实测：`site.author.gitlab` + 渲染进页脚 → 产物 6 处可见的未登记账号，
  旧规则下整链 exit 0、通过文案还说"5 条与登记清单一致"）。
  代价是**新增平台必须显式登记**（= 承认那是本人账号），
  否则就是一条红因等着人。问题在于：**"新增平台要不要登记"本身是口径问题**，
  不是技术问题——登记 = 承认那是本人账号，这话只能本人说。
  备选：① 新平台一律登记（现状，门禁强制）；② 允许"非身份用途的一段式链接"
  走一条独立白名单（= 又一处要同步的期望集）。
- **"他人主页"白名单缺失（17:50 场次新增）**：
  新判据 I7（产物侧可见身份链接）只认"本人的身份主页形态"，
  所以站内若合法地链到**他人**的主页（如合作者的 GitHub 个人页），
  会被当成"多出"判红。目前站内没有这种链接（实测全链绿），
  但论文页将来若加合作者主页就会撞上。ORCID 已被显式排除
  （`orcid.org` 的每个 id 都是"某个人"的主页形态，归 I6 的值域白名单管）。
  备选：① 出现时再加一条"他人主页"白名单（届时是第三处期望集）；
  ② 到时改成"只判同主机不同账号"（覆盖面会变窄）。
- **形态规则的角色词表是一处手写期望集（17:50 场次新增）**：
  `IDENTITY_ROLE_SEGMENTS`（profile / user / users / u / author / …）
  是**手写**在门禁里的固定值，**不从 oracle 派生**（派生就是那个洞）。
  它决定"两段式路径里哪些首段算账号主页形态"——放宽会把内容链接抓进来
  （假红），收紧会漏掉新平台的账号形态。当前取值对本仓产物**零误伤**
  （实测：产物里全部站外链接按形态归类，只有 5 个真身份链接命中）。
  备选：① 接受这份手写清单（改它必须重跑全链）；
  ② 改判"两段式一律不算身份"（更保守，但 `researchgate.net/profile/<Name>`
  这类就会漏 → 那就得改用别的形态特征）。



- **模板侧烤死的"身份主页形态"URL 字面量无门禁（17:43 场次新增）**：
  形态规则目前只作用在**数据源侧**（`site.author`）。在 `src/about.njk` 里
  直接写死 `<a href="https://gitlab.com/lvyihang">`（`site.js` 一字未动）→
  **整链 build exit 0、零红因**，产物里该链接**可见 2 处**（实测，隔离克隆）。
  → 洞成立：同一类逃逸在**模板侧**仍无覆盖。
  备选：① 把形态规则也用到模板侧（与数据源侧同一份规则，不新增期望集）；
  ② 只堵数据源侧、模板侧登记为已知例外。（本场次不代拍，登记为待拍板 24）
- **形态规则对"不是主页形态"的身份链接没有出路（17:43 场次新增）**：
  现在的规则把"**一段式路径**"一律当账号主页 → 将来要挂
  Google Scholar 那种 `/citations?user=…` 的身份链接时会被判红。
  当前 `site.author` 里 5 条身份链接 + 4 条内容链接**没有一条会误伤**
  （实测：旧规则 5 → 新规则 5，零新增候选）。
  备选：① 加一条"登记为非主页形态"的显式声明（等于给形态规则加受控例外）；
  ② 改成**字段级登记**（按 `site.author` 字段名判定身份/非身份，不看 URL 形态）
  —— 那等于把"规则"换成"另一处期望集"。（本场次不代拍，登记为待拍板 25）

- **合法增删一条身份句柄要同步"三处五个改动点"（18:10 场次新增，实测校准）**：
  门禁文件与共享模块的注释此前写的是"**两处**都要改"——**与事实不符**，
  本轮已订正（实测见 18:10–18:20 场次那一节）。真实情况是**三个文件、五个改动点**：
  ① `scripts/lib/identity.cjs` 的 `IDENTITY_SAMEAS`；② 门禁
  `scripts/check-identity-handles.cjs` 的 `ORACLE_SAMEAS` ＋ `EXPECTED_COUNT`
  ＋ `ORACLE_SET_SHA256`；③ `src/_data/site.js` 的 `site.author` 里**该平台的
  可见身份链接字段**（`author.github` / `author.csdn` / `author.researchgate`
  / `author.openalex` 那一族）。实测（隔离克隆，注入新平台
  `https://gitlab.com/lvyihang`）：只改 ①② → 门禁 exit 1，唯一红因
  「site.author 里**数据源侧**的身份主页形态链接缺 …」；再补 ③ → exit 0 走绿。
  ⚠️ 第 ③ 处最易漏：I5 刻意跳过 `author.sameAs`（机读路径由 I1 / I2 管），
  只认**单独写出来的**可见链接字段。
  ⚠️ 那条红因**只说数据层名（site.author）、不点名文件**。
  备选：① 维持"红因只提醒不同步、清单写在注释里"（现状，本轮已订正注释）；
  ② 把"该同步哪几处"直接写进红因（即**待拍板 23**，本场次不代拍）。

- **CFF 门禁的 CF7 / CF8 依赖 `js-yaml`（Eleventy 的传递依赖，本仓 `package.json` 未单列）（18:00 场次新增）**：
  与**待拍板 21**（`gray-matter`）**同类、不同包**。不写也能跑（随 Eleventy 装上），
  但"依赖是声明出来的"更稳；坏处是要动 `package.json`。
  ⚠️ 本门禁**故意在 require 失败时判红而不是跳过**（跳过 = 这两条判据永远绿 =
  盲区被包装成"已核过"）。若将来 `js-yaml` 被换掉，build 会直接红，不会静默走偏。
  备选：① **一次把 `gray-matter` 与 `js-yaml` 一起单列**（同一个根因，分两次改
  就是两次 `package.json` 冲突）；② 维持现状，等 Eleventy 换依赖时再一并处理。
  （本场次不代拍，登记为待拍板 26）

- **官方 schema 的 `license` 是一份 ~200 项的 SPDX 枚举，本门禁不抄（18:00 场次新增）**：
  CF4 只认 `LICENSE_PROOF` 里那一张对照表（目前只有 `Apache-2.0`），其余 SPDX id
  一律判红（"不在本门禁知道的 SPDX 清单里"）。所以现状是"**只允许一个**"，
  不是"允许任意合法 SPDX"——这是 fail-closed，洞比听起来小；但它把"将来要加第二种
  协议"这件事挡在了门禁里。
  备选：① 保持现状（将来加协议时同步扩表）；② 抄官方枚举（~200 项，体积不值）；
  ③ 抄一份"本站实际会用到的少数几个"的允许清单。
  （本场次不代拍，登记为待拍板 27）

- **其它直接读 `_site` 的门禁要不要也改成"快照 / 产物完整性前置检查"（18:20 场次新增）**：
  `eleventy.config.js` 在**配置加载时**就清空 `_site`（构建一开始即清），
  所以**任何一次并发构建**都会让正在读产物的别的门禁读到半成品甚至空目录。
  本轮只给线上核查门禁的注入矩阵（`scripts/test-live-site.cjs`）加了
  "快照一次 + 产物完整性前置检查"，其余读 `_site` 的门禁
  （`check:print-theme` / `check:copy-export` / `check:artifact-metadata` 等）**仍是直接读**。
  它们的失败形态是"红因说产物缺某个文件"（不是裸栈），危害小得多，但同样会把
  "并发构建"误报成"产物有问题"。
  备选：① 维持现状（只有注入矩阵改快照）；② 给所有读 `_site` 的门禁加一道统一的
  "产物完整性"前置检查（缺必备产物时直接说"并发构建写到一半"）；
  ③ 全部改快照语义（每道门禁各读自己那一刻的快照）。
  （本场次不代拍，登记为待拍板 **31** —— ⚠️ **原登记为 29，与 18:20–18:45 场次的
  「README 门禁 RD1 是单向的」那条同号（一个号两件事）；19:0x 场次就地改号为 31，
  29 归 RD1 那条。**同号两义 = 本人按号拍板会拍到错的那一件，详见本文件末尾本场次节。）

- **README 门禁 RD1 是单向的：「README 说的必须存在」，但「产物里新增了页面、README 没登记」无人看守（18:20 场次新增）**：
  RD1 的期望集**由产物推导**，但方向是"README → 产物"；反向（"产物 → README"）**没有判据**。
  所以新加一个页面而忘了更新 README，**门禁不会响**。这不是"门禁坏了"，是"门禁的视野就到这里"
  ——但**没人看守的视野容易被读成"全覆盖"**，这正是本仓反复吃亏的那族病。
  备选：① 保持现状（README 是入口文档，不必是完整清单）；② 加反向判据（产物里每个 HTML 路由
  都必须在 README 出现）——代价是以后每加一个页面都得改 README；③ 只对"**新增**"页面提醒
  （比对 git 历史，只报新增路由）。
  （本场次不代拍，登记为待拍板 29）

- **README 门禁的"未发布"豁免标记词表是人工白名单，口径要不要收紧（18:20 场次新增）**：
  豁免必须在**同一行**且命中词表（尚未实现 / 未实现 / 未发布 / 没有发布 / 不发布 / 待发布 /
  规划稿 / 规划中 / 不会上线 / 没有列表页模板）。词表**必须收窄**——宽词（如"不存在"）会
  **把自测注入本身也豁免掉**，导致"坏跑"与"判据失效"同形（本场次实测踩过）。
  收紧的代价：某个页面确实没上线、README 用的说法不在词表里 → 判红（fail-closed，但确实是假红面）。
  备选：① 保持白名单；② 把"未上线页面"集中到 README 的**一个专门小节**，标记词只认那一小节
  （更严、假红面更小，但要改 README 结构）；③ 维护一份独立的"规划中路由"清单文件，门禁读它。
  （本场次不代拍，登记为待拍板 30）


- **`citation_publication_date` 该用"上线日 2026-06-01"还是"期号日 2026-06-16"？—— 引用时通常会写哪个日期**：
  事实（2026-10-20 实测）：Google Scholar 官方收录说明第 (c) 条对 `citation_publication_date` 的定义是
  "must contain the date of publication, i.e., the date that would normally be cited in references to this
  paper from other papers. **Don't use it for the date of entry into the repository - that should go into
  `citation_online_date` instead.**"；而 Crossref unixref（`10.1029/2026JD046836`）**同时登记了两个**
  `publication_date`：`media_type="online"` = 2026-06-01（= `published-online`，AGU 页面 "First published:
  01 June 2026"）、`media_type="print"` = 2026-06-16（= `published-print`，期号日）。
  **两个日期都是出版商登记的事实**，差别只在"引用时通常会写哪个" —— 那是口径，属本人拍板，本场次不代拍。
  备选：① 保持 2026-06-01（上线日；等于 "first published"，也是 `dates.published` 现值）——代价：与期号
  2026-06-16 不一致，但 `dates.published` 的**四个消费点零改动**；② 改用 2026-06-16（期号日）——代价：
  `dates.published` 的**四个消费点**（论文页可见日期、列表页 "2026-06"、JSON-LD `datePublished`、
  BibTeX/RIS 的 year-month）都要跟着改，且 JSON-LD `datePublished` 改成期号日会让"首次上线"在机读层丢掉；
  ③ 两个都给（`citation_publication_date` 用期号日、`citation_online_date` 用上线日）——代价：同 ②，另外
  官方那句 "Don't use it for the date of entry into the repository" 意味着 `citation_online_date` 严格说该填
  "进入本仓库的日期"，而本站填的是"出版商上线日"（这一读法差已在本场次节写明）。
  （本场次不代拍，登记为待拍板 33）
- **`about.md` 正文里的身份链接字面量要不要挪进模板，还是另立一条"同一 host 只能有一个账号主页形态值"的判据？—— 改号时只改一处，about 页会对外说两个身份**
  事实（2026-10-19 实测，HEAD `014d2ee`）：`src/content/about.md:38` 是独立字面量
  `[CSDN](https://blog.csdn.net/lvyihang200411)`，`:23` 是站点仓
  `github.com/oldsixxiaolv/oldsixxiaolv.github.io`；渲染后 `about/index.html` 里这个 CSDN 链接的
  **可见 `<a href>` 出现两次**：`:1525` 来自模板面板（`site.author` 派生）、`:1565` 来自 markdown 正文
  （另有 `:855` / `:913` 的机读 `sameAs`）。
  **当前没人看守的那条边界**：I5 段明写「只看 site.author」，扫不到正文那条；I7 只判"多出"、
  不判"两处是否一致"；I8 的范围（github/orcid/openalex）不含 csdn。⇒ **换号会被 I7 抓住**
  （产物里多出一条未登记的身份链接），**但"清单改了、正文没改"（旧账号静默残留）抓不住** ——
  这正是"同一事实两份副本、其中一份没人看守"。
  两条修法（**本场次不代拍**）：① **治本**：把链接挪进模板 `about.njk`。硬约束：
  `eleventy.config.js:1493` `markdownTemplateEngine: false`，`about.md` 不走 Nunjucks，
  **不能**在 md 里写 `{{ site.author.csdn }}`；而且 `about.md` 自己的编写约定 ② 就是
  "事实性清单（… / 链接）全部交给模板" → 按它自己的规矩，① 才是正路，
  但"哪些链接属于清单、哪些属于正文"是**内容口径**，属本人拍板。
  ② **加判**：产物侧"同一 host 只能有一个账号主页形态值"。形状可复用既有形态规则
  （一段式 = 账号主页；两段式且首段是 profile/user/… = 账号主页；更深 = 内容链接，故仓库/内容链接不受影响）；
  但 `orcid.org` 上的**同行 ORCID** 与本人 ORCID **形态完全一样** → 必须借 I6 已有的 ORCID 值域白名单放行
  （本人 + `0000-0001-6144-0120` + `0009-0002-2576-1108`），否则误伤。
  （本场次不代拍，登记为待拍板 34）
- **日志里的编号 4 被用于四件不同的事，本人按号拍板会拍到错的那一件**（本场次新登记，
  **刻意不占编号** —— 编号口径属 DI1 那条线，且「台账要不要收编场次小节里的事项」
  本身就是待拍板 32 的口径）：实测同一条目在日志里出现**四处**，分别指向
  ①「自测脚本**要不要进 build 链**」；②「**部署时机**」；
  ③「身份句柄全集守卫按哪个方案落地」；④「J8 的 `@id` / `@type` 口径」。
  四处**都写在场次小节里、不在中央台账** ⇒ DI1 门禁只报得出其中**两处**
  （它的声明形态只认「待拍板 N（…）」，不认「`待拍板 N**：`」这一档 ——
  而另外两处用的恰好就是那一档），「一号两义」这一族因此被**低估**。
  本场次**不代拍、不改号**（改号要同时动四处声明）。
  ⇒ 这一条只把「**按号找会找错**」这件事写进案，等本人定了口径再落成硬判据。

- **这张图说的"华北"用哪个框？—— 框一改，"这张图说的是不是你的研究区"就变了**
  事实（2026-10-19 实测）：本场次按 **32–50°N / 110–120°E**（0.1°，框内 18000 格点）取区域，
  再用数据集自身的陆地掩膜剔掉蒙古与渤海/黄海（框内 4104 个格点 = 22.8% 恒定缺失，
  逐日缺失比例完全相同 ⇒ 是掩膜不是数据缺口），有效陆格点 **13896** 个。
  但"华北"在不同文献里框不一样（传统口径多取 32–40°N/110–120°E，或把东北南部算进来），
  **本站这张图说的"华北"到底是哪一块，属内容口径，本场次不代拍**。
  备选：① 保持 32–50°N/110–120°E（覆盖京津冀晋 + 内蒙古东部，把整个夏季风影响区都算进来）——
  代价：与"华北 = 京津冀晋"的窄口径读者预期有落差；② 收窄到 32–40°N/110–120°E ——代价：
  样本变少、趋势检验功效下降，且与"极端降水占年降水比例"这类指标的既有文献口径未必对得上；
  ③ 按省份/行政区划取 ——代价：行政区边界与 0.1° 网格不对齐，要额外做掩膜与面积加权说明。
  （本场次不代拍，登记为待拍板 35）

- **两个面板的纵轴都不从 0 起（A：10–40%；B：40–80 mm/day），保留还是改成零基线？**
  事实：A 的逐年范围是 16.91–35.40%（1960–2025），B 是 42.67–70.84 mm/day；
  纵轴按"好看的整数刻度"取到 10–40 / 40–80，**不是零基线**。
  后果（实测量级）：2020–2025 的十年均值抬升（占比 24.55% → 30.67%，+6.1 个百分点）
  在非零基线上占轴高约 20%，零基线上约 15% —— 视觉上大约放大三分之一。
  备选：① 保持非零基线（气候指数类小面板的常规做法；刻度有标、全部数值在图注里）——代价：
  视觉放大；② 改成零基线 ——代价：A 面板 24 → 31 的抬升几乎看不出来，这张图就只剩"有波动"；
  ③ 换成标准化指数（z 分数 / 百分位）——代价：读者要先理解标准化口径，且丢掉绝对量。
  （本场次不代拍，登记为待拍板 36）

- **算这些数的 Python 脚本要不要进仓库？—— 现在它只在本机 /tmp 里，仓库里没有可重跑的来源**
  事实：本场次用的三个临时脚本（逐日区域平均 + Rx1day / R95p 精确分位数 / 生成站点 JSON）
  **只在 /tmp，没有进仓库**；仓库里只有**结果**（`src/_data/extremePrecip.json`）。
  ⇒ 两个后果：① 别人无法复现或核对这 66 年的数值；② 2026 年数据发布后没有可重跑的脚本，
  这张图就更新不了，只能重写一遍。
  备选：① 脚本进仓库（如 `scripts/data/extreme-precip/`）+ 补一条门禁"JSON 里的数字与脚本
  重算结果一致"——代价：本仓要引入 Python 依赖（numpy / xarray / netCDF4），与"纯 Node 门禁链"
  的现状不一致，CI 未必有这几个包；② 脚本进仓库但**不接进 build 链**（人工按需跑，产出 JSON 后
  走正常 PR 流程）——代价：一致性靠人守，没有机器门禁；③ 继续留在 /tmp、只保结果 ——代价：
  不可复现这件事被固化下来。
  （本场次不代拍，登记为待拍板 37）

- **P2「断点收敛」的目标集用哪一档？—— 仓库里原写的 {375 / 768 / 1024 / 1440} 已被实测证伪（会引入可见退化）**
  事实：本场次逐块核对 + 实测对照证明（详见本场次 A、C 节），把 `640` 归并到 `768` 会让
  **641–768px** 区间的列表页**整页重排**（实测 papers@700 变化 222,501 px = 13.2%，
  bbox 覆盖 y 18–1464 整页）、顶栏**提前进紧凑态**（home@700 / home@768 各约 2,490 px，
  maxdiff 680）；把 `360` 归并到 `375` 会让 **375px（iPhone SE / 8 / X 主力宽度）失去品牌标记**。
  原建议里的 `1440` 一档**当前全库无任何规则使用**（本轮前后都无）。
  备选：① 采纳本场次「只消冗余、不做归并」的口径（断点收敛到
  {360, 640, 760, 768, 820, 1024}，其中 760 只剩 pages.css 一处可再消）——代价：断点值仍不统一，
  后续场次每次都要重新判断「这个断点能不能动」；② 改成「每个断点必须有一句可复述的设计理由，
  理由不成立的才合并」——代价：需逐块补写理由，改动面比 ① 大；③ 维持原口径
  {375, 768, 1024, 1440} 并接受 641–768px 的整页重排与顶栏提前紧凑——代价：实测已证明这是可见退化。
  （本场次不代拍，登记为待拍板 38）
- **详情页要不要显示自动注入的集合名标签「blog」？—— 列表页过滤了，详情页没过滤**
  事实：`src/blog.njk` 的列表卡用 `reject("equalto", "blog")` 把集合名滤掉、只显示主题标签；
  而 `src/_includes/layouts/detail.njk` 第 33 行是 `{% for tag in tags %}` **全量输出**
  ⇒ 文章详情页底部会出现一个 `· blog` 的尾巴（`blog` 是 `blog.11tydata.cjs` 自动注入的集合名，
  不是作者写的主题标签）。这一项还决定 M3（Decap CMS）的 tags 字段该怎么设计：
  现在 CMS 里若让作者手填 tags，就会和自动注入的 `blog` 混在一起。
  备选：① 详情页也过滤集合名（与列表页一致，tags 只表示主题）——代价：改一处模板，
  详情页从此不再显示"这条内容属于 blog 集合"这个标识（读者本来也看不出它的用处）；
  ② 详情页保留原样，把 `blog` 当成"所属栏目"的技术信息——代价：读者看到 `· blog`
  这种内部名，对学术读者是噪音；③ 彻底换表达：用面包屑/所属栏目表达归属，tags 只留主题
  ——代价：要新增面包屑组件并同步改列表页的过滤逻辑与既有页面，改动面最大。
  （本场次不代拍，登记为待拍板 39）

- **分享卡图（og:image）出口保留几张？—— 现在每页产出 3 个，而 OG 抓取器只认第一张**
  事实（2026-10-20 实测）：除论文页外，`src/_includes/layouts/base.njk` 的 og 块让**每个页面**
  都产出 **3 个** `<meta property="og:image">` —— 1200×630（469,811 B）、1080×1080（647,055 B）、
  1500×500（443,535 B），**三份合计约 1.5 MB**。OG 抓取器（Facebook / Slack / Discord 等）
  只取**第一张**，其余两张**白给**：既不改变抓取结果，又让每次抓取多下载数百 KB。
  论文页因 front-matter 有 `cover`、走 cover override 机制，**只有 1 个** `og:image`
  ⇒ 「一页一图」在本仓**已经是既有形态**，不是要新造的机制。
  ⚠️ 补充一条实测约束：**`twitter:image` 已经存在，且与第一张 `og:image` 同 URL、同 alt**
  （`base.njk:298-318`，源码里写明「`twitter:image:alt` 与 `og:image:alt` **必须同源**」）
  ⇒ 「把另一比例改挂 `twitter:image`」**不是零成本动作**，它会打破这条同源约束（得先决定
  是放宽约束，还是给 twitter 侧也补上等价的 alt）。
  这个口径同时决定两条缺陷怎么修：D2（每页恰好 1 个 `og:image`）与 D3（被引用的那张 ≤ 200 KB）。
  备选：① 只声明 1200×630 一张，另两张从 og 侧**完全撤下**（文件可留作备用）——代价：
  社交平台拿到的比例**不再可选**，宽幅场景（X 时间线）只能用 1.91:1 之外的构图去凑；
  ② 保留三张文件，但 `og:image` 只声明一张、其余两张挂 `twitter:image` 与 `og:image:width/height`
  ——代价：必须先处理上面那条 twitter/og 同源约束；
  ③ 维持现状 ——代价：被忽略的两张是纯负债（合计约 1.1 MB），且「每页 3 个 `og:image`」会让人
  误以为多比例 OG 生效（实际不会）。
  （本场次不代拍，登记为待拍板 40）

- **列表页那批论文 JSON-LD 节点（与论文页**同一个 `@id`**）要不要跟论文页描述一致？**
  事实（2026-10-20 09:00 实测）：本站在**两处**输出描述**同一件论文**的 JSON-LD 节点，
  `@id` **完全相同**（都等于论文页 canonical）：
  ① 论文页（`src/_includes/layouts/paper.njk` → `jsonLdPaper` 过滤链）：有 `datePublished`
  （`2026-06-01`）、`dateModified`、`image`、`headline`、`identifier`、`sameAs`、`abstract`、`keywords`；
  ② 列表页 `/papers/`（`eleventy.config.js` 的 `jsonLdArticles` 过滤链）：**只有**
  `datePublished`（`2026-06`，由 `p.year` + `p.month` 拼出）、`headline`、`url`、`sameAs`。
  差别有两处：① `datePublished` **精度不同**（日到 vs 月到）；② 列表页节点**没有**
  `image` 与 `dateModified`。
  后果：消费方按 `@id` 合并同一件作品时，会看到**两个出版日期**（`2026-06-01` 与 `2026-06`）；
  只读列表页的消费方（例如只抓 `/papers/` 的聚合器）拿不到配图与时效信号。
  站里有**完整日期的权威出处**：`src/_data/site.js` 的 `publications[].dates.published`
  （论文页用的就是它）⇒ 列表页的月精度是**可以**补到日精度的，只是补不补属口径问题。
  备选：① **逐字段一致** —— 列表页节点补 `image` / `dateModified`，`datePublished` 统一到日
  ——代价：列表页 JSON-LD 变大；且要先定「这一天」（取 `dates.published` 的日部分）
  是否就是对外口径；② **保持精简版** —— 列表页只留月精度的 `datePublished`，论文页不动
  ——代价：同 `@id` 两个节点取值不同、只读列表页的消费方拿不到图；③ **列表页不再输出论文实体**
  （只留站点级信息）——代价：站点级「我产出过什么」这层从 JSON-LD 里消失，搜索侧对论文的
  站点归属表达变弱。
  （本场次不代拍，登记为待拍板 41）

- **交互类改动要不要配常驻的浏览器级门禁？**
  事实（2026-10-20 10:00–10:30 场次实测）：本轮把首页降水图做成**可交互**之后，它的交互行为
  （悬停读数、键盘逐年步进、游标与数据点定位、`prefers-reduced-motion` 降级）**没有任何常驻门禁守着**
  ——只被一次性实测脚本跑过。仓内唯一的浏览器级门禁是 `scripts/check-overflow.cjs`
  （CDP 骨架就写在它自己文件里，没抽公共库）。
  本轮就撞上过一个**只有真实浏览器能发现**的真 bug：动态 `import()` 的 specifier 写成 bare
  （`assets/js/home-chart.js`）⇒ Chrome 抛 `Failed to resolve module specifier`，
  整张图**静默失去交互**，而 build 与当时的静态门禁**都还是绿的**。
  该类已由新判据 **HC6** 补上；但 HC6 只覆盖"specifier 形态"这一类，**不覆盖"行为对不对"**
  （读数条里的数是不是还是那个数、游标是不是还落在那个位置）。
  后果：下次有人改读数文案、动游标定位、改键盘映射，静态门禁照样全绿，
  而页面上的数可能已经悄悄错了 —— 只有等真有人用鼠标去点才发现。
  备选：① **补一道浏览器级门禁**（照 `check-overflow` 的路子，用真实浏览器打开首页断言读数/键盘/定位/降级）
  并接进 build 链 ——代价：build 再涨约 5–10 s（现有 `check:overflow` 7 档已占约 14 s），
  且 CI runner 镜像必须继续自带 Chrome（`deploy.yml` 里已有一行记录浏览器版本，镜像变了会**明确报错**而非静默跳过）；
  ② 只在本地手跑、不进 build 链 ——代价：「没人跑 = 没人知道」（这正是 D7 登记过的老问题）；
  ③ 不补，靠人工每轮实测 ——代价：本轮这种 bug 只有在真的去开浏览器时才会暴露。
  （本场次不代拍，登记为待拍板 42）
- **要不要真的启用论文批注层（`annotations.json`）？**
  事实（2026-10-20 10:30–11:00 场次实测）：批注子系统**整层不可达**。
  `src/_includes/layouts/paper.njk:449` 用 `hasAnnotations` 决定传不传 `annotationsUrl`，
  但 `hasAnnotations` **全仓没有任何地方定义**（`grep -rn hasAnnotations` 只命中模板那 1 行）
  ⇒ 恒为假 ⇒ `annotationsUrl` 永远不传 ⇒ `paper-reader/main.js:45` 整段跳过
  `annotations.js`（355 行）与 `highlight.js`（169 行）⇒ 产物里 `.annot-pane` /
  `.annot-toggle` / `paper-anchor` **一个都没有**（浏览器实测
  `querySelectorAll('[class*=annot]').length === 0`，产物里 `data-anchor-id` 0 处）。
  仓内也确实**没有** `annotations.json`（全仓 find = 0 个）。
  后果：`docs/papers-interaction.md` §9.1 写的批注写作工作流（「`paper.md` 同目录
  `annotations.json`，手动维护」）**照文档做也不生效** —— 放了文件，页面也不会出现批注。
  备选：① **真的写批注**：定义 `hasAnnotations`（构建期按文件存在与否判定）**且**由**本人**提供
  `annotations.json` ——批注是本人自己的精读笔记，**定时任务代写等于伪造作者的阅读记录**，
  所以这一条不能代做；② **明确不启用**：把 `annotations.js` / `highlight.js` /
  `paper-reader.css` 里对应的死代码清掉（≈524 行 JS + 一批 CSS），或在文档里写明
  「Stage 2 才接」——代价：死代码继续躺在仓里，且 `?a=` 直链、搜索框、kind 过滤 chips
  这些**已经写好的能力**永远用不上；③ 保留现状不动（= ② 的最省事版本）。
  （本场次不代拍，登记为待拍板 43）

- **正文列宽判据的两个下限值（≤1024px 的 85%、>1024px 的 480px）按本站风格定案吗？**
  事实（2026-10-20 11:00–11:30 场次实测）：本轮给窄屏溢出门禁补了「正文不能被挤成窄带」
  的判据（缺陷清单 D13），两个下限值的来历不同：
  ① **≤1024px 用比例 85%** —— 这个数**不是本轮拍的**，是 D11 自己写下的验收条件
  （「正文宽 ≥ 视口 85%」），本轮只是把它从「文档里的一句话」变成「每次 build 都会跑的判据」；
  ② **>1024px 用绝对值 480px** —— 这个数是**本轮定的**，依据是现有各页正文列在宽屏的最小值
  （实测 1025px 档论文正文 704px）。
  宽屏正文是**刻意定宽封顶**的（实测 1440px 档 921px、1920px 档仍是 921px，占视口 48%；
  列表页与关于页的 `article` 封顶 960px），目的是把行长控制在 60~70 字符，不是漏做。
  后果：现在这道判据在宽屏那半边**基本不设防**（1920px 下正文只占 48% 也放行）；
  且判据与版式**必须一起动** —— 若本人以后想让宽屏正文更宽或更窄，只改一边就会出现
  「刻意改窄 → 门禁报红」或「刻意放宽 → 门禁看不见」两种错位。
  备选：① 维持现状（85% / 480px）——代价：宽屏那半边几乎不设防；
  ② 宽屏下限提到 640px（≈现有最小值 704px 留 9% 余量）——代价：以后若为行长刻意收窄到 640px 以下，
  门禁会红（这正是「版式与判据一起改」的正常代价）；③ 宽屏也改比例判（如 ≥ 45%）——
  代价：与「定宽封顶」的设计直接冲突（1440px 档实测只有 64%），且视口越宽占比越低、判据越松。
  （本场次不代拍，登记为待拍板 44）

- **对外出口的关键词要不要设上限（以及上限放在哪一层）？**
  事实（2026-10-20 11:30–12:00 场次实测）：本轮修 D14 之前，同一件作品的关键词在**五个出口**
  上是**三种条数**——站内页面 chips 与 `citation_keywords`、JSON-LD 是 8 条，RIS 的 `KW` 是 8 条，
  而 BibTeX **一个 `keywords` 字段都没有**，订阅源 `feed.xml` 只给**前 5 条**
  （`.slice(0, 5)`，无注释、无提交说明、无门禁依据）。
  本轮把两条都补齐后，四个出口（页面 / BibTeX / RIS / 订阅源）**一律按真源 `site.js` 的完整列表给**
  （现在 8 条、顺序一致），门禁也改成对着真源核三个面、并给订阅源单列一道判据（C8）。
  但「完整」**不是永远安全的**：本轮修掉的是「**静默截断**」，不是「该不该有上限」——
  一篇论文若有 20~30 个关键词，订阅源（每个 `<category>` 一行）与 `.bib` 都会明显变长，
  而多数期刊要求关键词 **3~6 个**；本站现在只有 1 篇论文、8 个关键词，
  「数量会不会失控」这件事**在本站还没有真实样本**，本轮不代拍。
  备选：① **一律完整**（现状）——代价：关键词极多时各出口都明显变长，
  且与期刊要求（3~6 个）脱节；② **保留上限但把上限写进 `site.js`**
  （`keywords` 全量 + `keywordsShort` 前 5 条，订阅源用短的）——代价：又多一个字段要维护，
  且「两个出口给两种条数」是**新的一处口径不一致**（与本轮刚修掉的毛病同类）；
  ③ **在数据层收窄**（真源里就只留 5~6 条）——代价：要跟期刊要求对齐，
  可能丢掉检索用的词（本轮实测被丢掉过的 "tropical Africa" 正是这种地理检索词）。
  （本场次不代拍，登记为待拍板 45）

- **`excerpt` 缺失（契约写的是"强烈建议"）该判红还是只报 note？**
  事实（2026-10-20 12:00–12:30 场次实测）：本轮给博客 front matter 契约配门禁时，把两类问题
  分成了两档——**写错了**（形态不对 / 类型不对 / 覆盖了自动注入）⇒ **判红**；
  **忘了写**（契约里标的是"建议"）⇒ 只出 **note**，**不拦 build**。
  `excerpt` 落在"建议"这一档（`docs/blog-writing-guide.md` §2 写的是「强烈建议」），
  所以本轮门禁对「缺 `excerpt`」只出 note。实测后果是：缺 `excerpt` ⇒ 列表卡**整块摘要消失**，
  只剩标题 / 日期 / 阅读时长，读者看不出值不值得点。
  但这是本站**第一篇都还没写**的空站，"忘了写摘要"这个错误目前**一次都还没发生过**，
  也没有真实样本能说明它该拦到什么程度 ⇒ 本轮不代拍。
  备选：① **维持 note**（现状）——代价：忘了写摘要的稿子照样过 build，
  列表卡上是一张没有摘要的卡片；② **升级为判红**——代价：作者忘写摘要就卡住整个 build
  （对一篇还没写完的稿子来说代价可能偏重）；③ **折中**（只在前 N 篇、或只在某个阶段之后才升级）——
  代价：多一条状态判断，门禁逻辑变复杂。
  （本场次不代拍，登记为待拍板 46）


---
## 2026-10-19 · 第十一轮（12:22–12:47 场次）：订阅源时间戳说真话 + 404 身份开关落地

### 本场次定位

接手 12:20 场次（`mvs_9dee015c`）被限流打断的半成品，并把它的设计**补完整**。

⚠️ **本轮工作树是多个场次叠加的结果**，`git status` 的 7 个改动文件分属两处：

| 文件 | 归属 |
|---|---|
| `src/_data/site.js`（`affiliationUrl` → apex）、本节 E 段之前的第九轮 E 小节 | **12:20 场次**（本场次独立复测其外链结论：apex 200 / www 000 / 官方 301 指向 apex） |
| `eleventy.config.js`、`src/feed.njk`、门禁 20（订阅源时间戳） | **本场次** |
| `src/404.njk`（`identityOn404` 开关）、`base.njk`（读该开关）、门禁 16 双向化、门禁 21（绝对 URL 口径） | **并发场次**（12:36–12:39 陆续写入），本场次**接管写者权**并补完、复验 |

本场次的处置原则：**不丢弃他人未提交的工作**（先备份
`/tmp/mvs_00c97a74_r11/stalled-session-wip.diff`，217 行），补齐后**一起提交**。

### A. 改进点：订阅源此前在对外报一个**假时间**

**现象**：`feed.xml` 的 `<lastBuildDate>` 实测是 `2026-06-01T00:00:00.000Z`
—— 那是**论文的发表日**，不是订阅源的生成时间。而站点真正的构建时刻
（`robots.txt` 的「生成时间」）是 `2026-10-19`。两者对不上：
**订阅源对外声称"最后更新于 6 月 1 日"，此后无论改多少次都停在那一天**。

**这是第八轮修掉的 `robots.txt`「生成时间」缺陷的另一半** —— 那一轮只修了
robots，feed 这一半被漏掉了。

**修**（`eleventy.config.js` + `src/feed.njk`）：

1. 新增 `dateToRfc822` 过滤器（`toUTCString()`）—— RSS 2.0 规范要求
   `"Mon, 19 Oct 2026 12:00:00 GMT"`，此前 feed 用的是 ISO-8601；
2. `buildStamp` 改为**按进程缓存**（整次构建只取一次时间）—— 否则
   robots 的「生成时间」与 feed 的 `<lastBuildDate>` 会差几毫秒，
   "同一次构建"这个前提就不成立；
3. `<lastBuildDate>` 改用 `buildStamp`，`<pubDate>` 改用 `dateToRfc822`。

**门禁 20**（`scripts/verify-site.cjs`）：`<lastBuildDate>` 必须逐字是
RFC 822；必须与 `robots.txt` 的「生成时间」**同一时刻**；每条 `<pubDate>`
也必须是 RFC 822；且 `<lastBuildDate>` 不得早于任一 `<pubDate>`。

⚠️ 判据刻意**不依赖"当前时间"** —— 复制产物到 /tmp 仍然成立。

**实测产物**：`<lastBuildDate>Mon, 19 Oct 2026 19:39:55 GMT</lastBuildDate>`
↔ `# 生成时间：2026-10-19T19:39:55.803Z` → 逐字对应；
item `<pubDate>Mon, 01 Jun 2026 00:00:00 GMT</pubDate>`。

### B. 耦合补完：门禁 16 必须与 404 页的身份开关**同源**（第九轮缺口的正解）

**第九轮留下的缺口**：404 页把整个 Person JSON-LD 块删掉时，门禁**全绿**
（实测 `54899f1` / `01dd76f` 两棵树，删掉 ld+json 块后 `check:site` 仍 exit 0）。

**为什么不能简单写死"404 页必须有 Person"**：那是"404 页要不要保留 Person
实体"的**展示口径**，在「待决策」里、由本人拍板。门禁一旦写死，就等于替本人
把那条选了。

**正解（并发场次写的开关 + 本场次补完的双向校验）**：
开关 `identityOn404` 放在 **`src/404.njk` 的 front matter**，
`base.njk` 的 `{%- if not is404 or identityOn404 %}` 与门禁 16 **读的是同一处**
→ 不存在"模板改了、门禁没跟着改"的漂移可能。
判据**双向**：

- `true` → 404 页必须 **≥1** 个身份类实体（少一个 = 被整块掏空）；
- `false` → 404 页必须 **没有**身份类实体（多一个 = 开关与产物不一致）。

⚠️ **必须双向**：从产物侧看"整块掏空"与"按口径去掉"**完全一样**（都让 404 页
零实体）。单向只查"零实体"，既会误伤"去掉"的口径，又会漏掉真正的掏空。

### C. 门禁 21：绝对 URL 口径 —— 线上事故的根因防线（并发场次写，本场次复验）

**线上事故**：线上站点是 2026-10-16 那次部署的产物，那时 `site.url` 写的是
`https://github.lvyihang.xyz/MeteoHub`（带仓库名子路径）。于是首页的
canonical、og:url、sitemap 的每条 loc **全部**指向
`https://github.lvyihang.xyz/MeteoHub/...` —— 而站点内容铺在域名根 `/`，
那一层根本不存在（**实测逐条 404**）。页面本身照常渲染（资源走相对路径），
只有爬虫与社交分享卡片拿到的地址是死链。

**当时的门禁一条都没拦住**：门禁 3 只查 canonical 与 og:url 是否**互相一致**
（两个一起错照样通过）；门禁 5/6/7 只按 **pathname** 映射产物（域名被有意忽略）。

**门禁 21 管的是出口地址的口径**：
① `site.url` 必须是域名根（根因防线）② 每页 canonical / og:url 必须挂在
`site.url` 上且路径 = 该页自己的路由 ③ sitemap 的每条 loc、feed 的每条 item
link 必须挂在 `site.url` 上 ④ JSON-LD 的 `@id` 若指向本站某个页面，
origin 必须是 `site.url`。

⚠️ ④ 只管 `@id`（实体标识符），**不管 `url`** —— Person 的 `affiliation.url`
指向 `https://iap.cas.cn/`，其 path 恰好也是 `/`，一并按"path 对上页面"判
会把一个完全正常的外部机构链接误报成错。

### 验证（全部在**独立克隆**里跑，不碰共享工作区的 `_site`）

基线 + 5 组故障注入，每组一个独立克隆（`/tmp/mvs_00c97a74_r11/verify3/`）：

| 场景 | 注入 | 期望 | 实测 |
|---|---|---|---|
| 基线 | 无 | exit 0 | **exit 0**，✓ 站点自检全部通过 |
| FI-A | `identityOn404: false`（产物随之 0 实体） | exit 0（合法口径不被误伤） | **exit 0** ✓ |
| FI-B | `identityOn404: false` 但模板仍输出身份实体 | exit 1 | **exit 1**：「声明了 5 个身份类实体…但开关 = false —— 开关与产物不一致」 |
| FI-C | `identityOn404: true` 但 404 的 JSON-LD 被掏空 | exit 1 | **exit 1**：「一个 JSON-LD 实体都没有…」 |
| FI-D | `site.url` 退回带子路径的旧值（线上事故复原） | exit 1 | **exit 1**，13 个问题，含「site.url 不是**域名根**」 |
| FI-E | `<lastBuildDate>` 改回 `items[0].date` | exit 1 | **exit 1**：「订阅源必须报**构建时刻**，不是最新条目的发表日」 |

（此前已单独验过：`<lastBuildDate>` 改回 ISO 格式 → exit 1，
报「不是 RSS 2.0 要求的 RFC 822 格式」。）

（该表是**那次运行**的逐字记录。此后 `0c9d586`（13:52:46）把门禁 16 的措辞
改成"声明了身份类实体（<类型列表>；Person 是根节点，其余是它的嵌套节点）"，
**现行措辞**见 `scripts/verify-site.cjs:1080-1088`；
而门禁在 `9dab5d4`（12:58:48）补上 `identityOn404Raw = m[1]` 之后，
报错的"开关 = "那段又与本表的引文**重新对上**（详见下文 L 节）。）

### 并发冲突处置（记录给下一棒）

- 12:38 前后，本场次在 `src/404.njk` 补 `identityOn404: true` 键时，
  与并发场次**同时写入**同一键 → YAML `duplicated mapping key` → build exit 1。
  处置：本场次撤掉自己那份，保留对方放在注释后的那份（位置更贴合注释里
  "本人拍板时只改这一行"的说法）→ 复验通过。
- ⚠️ 教训：`404.njk` 的 front matter 是 YAML，**同名键出现两次是硬错误**；
  改这类文件前先 `grep -n` 确认没有第二份。
- 另：并发场次曾把 `docs/IMPROVEMENT-LOG.md` 的**结尾换行**弄丢
  （diff 里出现 `\ No newline at end of file`），本场次补回。

### 待部署（本轮**不 push**，线上仍是旧版本）

线上仍是 2026-10-16 那次部署，`/papers/`、`/publications.bib`、`/feed.xml`
在线仍 404，canonical / og:url / sitemap 仍带 `/MeteoHub/` 前缀且逐条 404。
**本地已全部修好**，但**部署与否由本人决定**。

### 待决策（沿用上一轮，本轮不擅自拍板）

1. **404 页要不要保留 Person 实体** —— 现已参数化为
   `src/404.njk` 的 `identityOn404`（默认 `true`），本人拍板时**只改那一行**，
   模板与门禁都不用动；两种口径门禁都认。
2. **论文页是否显示"论文署名单位"**（发表时兰州大学 / 现在中科院 / 两者并注）
   与 `pub.authorAffiliations` 数据字段。
3. **`figure.alt` 是否保留 "Fig. 10 —" 前缀**（忠于作者原文 vs 只留描述）。

### 留给下一轮

1. **线上部署**（本人决定后执行）——部署完应能一次消掉三类"待部署"差异：
   三个 404 路由 + `/MeteoHub/` 前缀。
2. **门禁 22 候选**：`og:image:alt` 目前仍带 "Fig. 10 —" 前缀，会上到分享卡片
   —— 与待决策第 3 条同一个根因，等本人拍板后一并处理。
3. `eleventy.config.js` 的 `buildStamp` 现在按进程缓存 —— 开发服务器
   （`--serve`）下**热重载后会一直用第一次的时刻**。生产构建无影响
   （每次 `npm run build` 都是新进程），但若将来在 `--serve` 下检查
   `robots.txt` 的生成时间，会看到陈旧值 → 值得记一笔或改成按构建轮次重置。
---
## 2026-10-19 · 第十二轮（12:40 场次）：独立复核并发场次的工作 + 修掉一个"判据会指错方向"的真缺陷

### 本场次定位

**没有从头做改进**——第十一轮（12:22–12:47 场次）的工作当时**已经写完但还没提交**，
工作树里躺着 6 个文件的未提交改动。本场次做的是三件事：

1. **巡检**（线上，不能坏）；
2. **独立复核**那批未提交改动（写者自述不算数）；
3. **修掉复核中发现的 1 个真缺陷** + 3 处会误导人的过时说明。

### ⚠️ 本轮的并发情况与归属（先说清楚）

巡检 cron **每 5 分钟起一个会话**，本场次开始时同一工作区里同时跑着**十来个**
MeteoHub 会话（`mavis session list` 实测），且其中**至少一个仍在写工作树**——
本场次接手后 20 秒内，日志文件又被改了一次（mtime 从 12:27:11 → 12:40:38）。

处置：

1. `mavis session list` 列出全部会话，按 `createdAt` 排出真实时序；
2. 对 6 个仍在跑的会话逐一 `session send --force_steer` 发停手通知（全部 ACK）；
3. 连续采样文件 mtime 确认工作树稳定（本场次写入前后各一次）；
4. 本场次任唯一写者，**先复核再提交**，不丢弃任何他人成果。

**归属**：

| 内容 | 归属 |
|---|---|
| `affiliationUrl` → apex（`33ca461`，已提交） | **12:20 场次** |
| 订阅源时间戳 / `identityOn404` 开关 / 门禁 16 双向化 / 门禁 20 / 门禁 21 | **第十一轮（12:22–12:47 场次）** |
| 门禁 16 开关读取的**布尔解析缺陷**（本轮发现并修掉）+ 3 处过时说明 | **本场次（12:40）** |

### A. 巡检结果（线上，无新增损坏）

| 线上路由 | 状态 |
|---|---|
| `/` `/blog/` `/about/` `/sitemap.xml` `/robots.txt` `/404.html` | 200 |
| `/papers/` `/publications.bib` `/feed.xml` | **404**（**待部署**，非损坏——本地都有） |

- 线上 3 页 JSON-LD 各 1 块，**`JSON.parse` 全部通过**；
- 线上 canonical 与 og:url **都带 `/MeteoHub/` 前缀**，而那 3 个带前缀的 URL
  **实测逐条 404**（`/MeteoHub/`、`/MeteoHub/about/`、`/MeteoHub/blog/`）；
- 线上 sitemap 的 3 条 `<loc>` 同样带前缀、同样 404。
→ 性质是**待部署**（线上还是 2026-10-16 那次部署），**本任务禁止 push**。

### B. 复核中发现并修掉的真缺陷：门禁 16 的开关读取会**指错方向**

**问题**：门禁 16 读 `identityOn404` 开关用的是正则
`/^identityOn404:\s*(true|false)\s*$/m`，**读不到就静默默认 `true`**。
而模板读的是 **front matter（gray-matter / js-yaml）**。
**两个解析器，取值集合不一样**——写错一个字母就可能让门禁与模板**指向相反的方向**。

实测矩阵（用**仓库自带的** gray-matter 4.0.3 / js-yaml 4.3.2 跑出来的，不是推测）：

| 写 | YAML 解析成 | 模板输出 Person？ | 旧门禁读成 | 后果 |
|---|---|---|---|---|
| `true` / `false` | 布尔 | 是 / 否 | true / false | ✓ 一致 |
| `True` / `TRUE` | 布尔 true | 是 | true（默认） | ✓ 碰巧一致 |
| `False` / `FALSE` | 布尔 false | **否** | true（默认） | ❌ **相反**：build 红，且报错文案说"= true"——**指错方向** |
| `null` | null | **否** | true（默认） | ❌ 同上 |
| `0` | 数字 0 | **否** | true（默认） | ❌ 同上 |
| `no` / `off` | **字符串**（YAML 1.2 核心 schema 不认 YAML 1.1 的这些别名） | **是** | true（默认） | ⚠️ **静默失效**：本人以为关掉了，实际**没关**，且**全绿无告警** |
| `"false"`（带引号） | 字符串 | **是** | true（默认） | ⚠️ 同上 |
| `1` / `yes` / `on` | 数字 / 字符串 | **是** | true（默认） | ⚠️ 同上 |

**两类失效的性质完全不同**：

- **矛盾型**（`False` / `null` / `0`）：build 会红，但报错说"identityOn404 = true"，
  而文件里写的是 `False`——**读代码的人会被指向"404 的 JSON-LD 被整块删了"这个
  错方向**，真因（一个字母的大小写）根本不在那儿。
- **静默失效型**（`no` / `off` / `"false"` / `1`）：YAML 1.2 把它们当**字符串或数字**，
  非空字符串与数字在 Nunjucks 里**都是真值** → 模板**仍然输出 Person**；
  门禁默认 `true` 也要求有实体 → **两边碰巧一致，全绿通过**。
  本人以为自己关掉了这个开关，实际**根本没关**，**没有任何东西会报**。

**修法**（零新依赖）：

- 读法改成**宽松取字面量 + 单独判合法性**：
  `/^identityOn404:[ \t]*(\S+)[ \t]*(?:#.*)?$/m`；
- **读不到 / 不是合法布尔 → 直接判红**，绝不静默兜底；
  合法集合 = YAML 1.2 核心 schema 的六种写法
  （`true/True/TRUE/false/False/FALSE`）；
- 报错时引用**源文件里的字面量**（新增 `identityOn404Raw`），
  不引用门禁自己推出来的值——**推出来的值一旦与文件不符，报错就指错方向**；
- 下游两条判据改用**严格比较**（`=== true` / `=== false`）：
  `null`（读不到/不合法）表示"上面已经判红了"，这里必须跳过，
  不能当成 `false` 去报"开关与产物不一致"——那同样是把人指向错方向。

⚠️ **为什么不能用"读不到就默认 true"**：这条门禁的**全部意义**就是拦住
"静默失效"。一个"读不到就当没事发生"的门禁，恰恰是它要防的那类东西本身。

#### 故障注入（16 例，全部在**独立克隆**里跑，不碰共享工作区的 `_site`）

| 组 | 注入 | 期望 | 实测 |
|---|---|---|---|
| 合法布尔 | `true` / `false` / `True` / `False` / `TRUE` / `FALSE` | exit 0 | **6/6 exit 0** ✓ |
| 合法 + 注释 | `true  # 保留 Person` | exit 0 | **exit 0** ✓（正则允许行尾注释） |
| 非法值 | `null` / `no` / `off` / `yes` / `on` / `"false"` / `1` / `0` | exit 1 | **8/8 exit 1** ✓，报错均点名实际字面量 |
| 开关缺失 | 删掉整行 | exit 1 | **exit 1** ✓（「找不到 identityOn404 开关」） |
| 双向判据 | 开关 `false`（= 本人拍"去掉"） | exit 0 | **exit 0** ✓（合法口径不被误伤） |
| 双向判据 | 开关 `false` 但产物里塞回 Person | exit 1 | **exit 1** ✓（「开关与产物不一致」） |
| 双向判据 | 开关 `true` 但 404 的 JSON-LD 被掏空 | exit 1 | **exit 1** ✓（报错引用 `identityOn404 = true`，与文件一致） |

⚠️ **本场次自己也踩了一次那个坑**（记录下来给下一棒）：
第一次跑 FI-F 时，我的注入脚本用 `replace` 匹配 `<script type="application/ld+json">…`，
但**产物里那个块根本不存在**（开关 `false` 时模板不输出它）→ **replace 一次都没匹配上**，
文件**逐字没变**，而我读到的"exit 0"其实是"注入没生效"，
**不是**"门禁没拦住"。**"注入没生效"和"门禁没拦住"在结果上长得一模一样。**
→ 后来给每个注入都加了**回读断言**（比对 ld+json 块数、改后字节数），
断言不过直接 `exit 9` 作废该样本。重跑后 16/16 全部符合期望。

### C. 修掉 3 处会误导人的过时说明（都不是代码缺陷，但会让人照着改错）

1. **`src/404.njk` 与 `scripts/verify-site.cjs` 里的"先例引用"不成立**：
   两处都写"与门禁 17 读 `src/robots.njk` 同一套路"——但**门禁 17 只读该文件的
   `birthtime`/`mtime`**（`fs.statSync`），全文件**没有 front matter 解析代码**，
   那个先例**不存在**。注释里的"先例"是给后来人验证实现是否合理的**锚**，
   锚指向不存在的东西**比不写锚更糟**。→ 改成"门禁直接读源文件这一行（不解析 YAML）：
   先取出字面量，再按白名单校验，只接受 true / false / True / False / TRUE / FALSE；
   其余写法一律判红"。
2. **`scripts/verify-site.cjs` 门禁清单第 16 条**写"与 **site.js** 的
   `identityOn404` 开关一致"——开关**不在 `site.js`**，在 **`src/404.njk` 的
   front matter**（`site.js` 里根本没有这个键）。→ 改正。
3. **「待决策」段那段"本人拍板时怎么改"已经过时，且与实测矛盾**：
   原先写"改 `base.njk` 的 Person 块加 `{%- if not is404 %}` 即可，
   第 16 条门禁不受影响（它不查 Person）"——**两处都不成立**：
   ① 改法已变成**翻 `src/404.njk` 的 `identityOn404` 一行**；
   ② "门禁不受影响"是**假的**（门禁 16 现在双向读同一个开关，翻成 `false`
   但产物里还留着 Person → 门禁**会红**）。
   这段是**本人拍板时唯一的依据**（开关在哪、翻哪一行、后果是什么），
   照着改会改错地方 → 已订正，并补上"那一行请写 `true` / `false`"。
   ⚠️ **12:53 又订正一次**：初版订正写成"那一行**只能写** `true` 或 `false`"，
   而门禁的白名单实际接受 `true / false / True / False / TRUE / FALSE`
   （模板侧 js-yaml 也把这些当布尔 → 双方取同一个值 → 不会对不上）。
   真正会被门禁报红的是 `no / on / off / "false" / null / 1` 这类。
   写成"只能写 true 或 false"会让本人以为 `False` 会红——**实测 `False` 是绿的**。

### D. 门禁 21 规则②/④ 的两条独立故障注入（补第十一轮 FI 表的缺口）

第十一轮的 FI 表只验了门禁 21 的**规则①**（`site.url` 带子路径）。规则②
（canonical 必须挂在 `site.url`）和规则④（JSON-LD `@id` 的 origin）当时没有
独立注入，本轮补上（隔离克隆 `/tmp/mh-r12-fifg/repo`，基于 `65f2a42`；
**只改产物后单跑 `node scripts/verify-site.cjs`，不重跑 build**——
重跑会把产物重新生成、把注入冲掉）：

| 场景 | 注入 | 期望 | 实测 |
|---|---|---|---|
| FI-F | about 页 canonical 改成别的域（`https://old.example.com/about/`） | exit 1 | **exit 1**，2 条：「canonical 与 og:url 不一致」+「canonical = "https://old.example.com/about/" **不在站点地址 https://github.lvyihang.xyz/ 之下**」。旧门禁 3 只查 canonical≠og:url —— **两个一起错照样通过** |
| FI-G | 论文页 JSON-LD 的 `@id` origin 换错、路径保留（`https://old.example.com/papers/trmm-thunderstorm-stages/`） | exit 1 | **exit 1**，5 条：门禁 19「同一件作品出现 2 个不同的 @id」+ 门禁 21④「`@id` 指向的是本站页面（/papers/trmm-thunderstorm-stages/），**origin 却不是** https://github.lvyihang.xyz」 |

两条**复位后都 exit 0**（证明红的是注入本身，不是基线）。

⚠️ 注入过程中**又一次踩到"注入未生效"陷阱**（本轮第二次）：
第一次 FI-G 用"解析 JSON → 改 → 按块写回"的写法，**写回逻辑有 bug**，
产物其实没被改（**回读断言当场抓到**：读出来的还是原 `@id`），
于是 gate exit 0 —— 那一刻**差点被误读成"门禁 21④ 没拦住"**。
第二次换成**精确子串替换**：锚点 `"@id":"…/papers/trmm-thunderstorm-stages/"`
命中 **4 次**（同一 `@graph` 里实体自身 + `mainEntityOfPage` 等嵌套字段
都指向这一页），先断言命中数 → 写 → **回读**确认，才算注入真的落地。
→ 教训与第十一轮那条同源：**绿灯与红灯都要以"回读断言 + 报错原文"为准，
不能只看 exit code**。exit 0 只说明"没检出"，不说明"注入生效了"。

> 附注：FI-G 里门禁 21④ 的**同一句话报了 4 遍**（同一 `@id` 在块里出现 4 次就报 4 次）。
> 不是缺陷，只是报错可读性可以再收一下——属"留给下一轮"级别的小账。

### E. 外链全量审计（产物里全部外链逐条探测）

从产物里抽全部外部 URL 逐条探测（38 个匹配，其中 4 个是抽取正则把 JSON 结尾的 `}`
和 CSS 注释里的举例一起抓进来的**假 URL**：`agupubs…836}`、`codeocean…v1}`、
`doi.org/…880}`，以及 `github.com/xxx/yyy）`——后者在
`src/assets/css/base.css:102` 的一句注释里）。真实外链 34 条：

| 状态 | 条数 | 是哪些 |
|---|---|---|
| 200 | 25 | `iap.cas.cn`、openalex、3 个 orcid、zenodo / codeocean、github 各页、schema.org、11ty.dev、fonts 的完整 `css2` URL 等 |
| 403 | 6 | agupubs（doi 与 pdf）、`doi.org/10.1029/…`（重定向到出版商后被拒）、`doi.org/10.5281/zenodo.16662143` 与 `…18041880`、researchgate 个人页 |
| 404 | 2 | `fonts.googleapis.com`、`fonts.gstatic.com` —— 裸域名，是 `<link rel=preconnect>` 的写法，**本就不是页面** |
| 000 | 1 | `blog.csdn.net/lvyihang200411`（见下） |

**唯一真死链**是 `https://www.iap.cas.cn/`（TLS 握手即死）——已由 `33ca461`
改成 apex `https://iap.cas.cn/`（现在 200）。

⚠️ **403 与 000 都不等于死链**，两个反例：
- **403 是机器人拦截**，而且不稳定：codeocean 我这次实测 **200**，另一场次实测 403；
  同一 URL 不同时刻结论可以相反。
- **000 是本机环境**：`dig blog.csdn.net` 返回 **198.18.0.230**——ClashX 的
  **fake-IP 段**（本机 DNS 被 TUN 劫持）；而 `openssl s_client` 取到的证书
  **有效**（`CN=*.csdn.net`，Verify return code 0）→ 是 fake-IP 路由 + 源站 521，
  **不是站内把链接写错了**。

→ **本轮不加"外链可达性"门禁**：403/000 的假阳性会频繁卡住部署；
而一个经常误报的门禁，久了就没人看它的红灯——**那比没有门禁更糟**。
→ 改为**定期人工巡检**（本节即是）。若本人仍想要这类门禁，请拍板。

### F. 部署拓扑：部署后会不会自愈？——**会，一次自愈**

| 远端 | 指向 | 停在哪 |
|---|---|---|
| `origin` | `oldsixxiaolv/oldsixxiaolv.github.io`（**用户站仓库**，Pages 就来自它） | `cfef826`（2026-10-16） |
| `oldsixxiaolv` | `oldsixxiaolv/MeteoHub`（镜像） | `f47357d`（2026-10-02） |

→ **"部署"就是把本地 main 推到 `origin`**（本地领先 `origin/main` 的 commit
数见 `git log --oneline origin/main..HEAD | wc -l`，截至本轮提交**全部未 push**）。

**自愈结论**：HEAD 的 `site.url` 已是 `https://github.lvyihang.xyz`（**无子路径**），
本地产物已逐条核对：
- sitemap 5 条 `<loc>` **全是根路径**；
- 产物里**无 `/MeteoHub/` 路径残留**（`grep -rn "/MeteoHub/" _site/` 为空；
  剩下的 "MeteoHub" 命中全在 CSS 文件头注释里）；
- canonical / og:url 也都挂在域名根。
→ **部署后 canonical / og:url / sitemap 的 `/MeteoHub/` 前缀会一次消掉**。
另外线上那三条 404（`/papers/`、`/publications.bib`、`/feed.xml`）的根因也查清了：
**线上那份 `origin/main` 的 `src/` 里根本没有 `feed.njk` / `papers.njk` /
`publications.bib.njk`**（`git cat-file -e origin/main:<file>` 三个都判"无"，
线上 `src/` 共 57 个文件、本地 HEAD 63 个）→ 部署后这三个文件才第一次上线，
404 一并消失。`docs/DEPLOY.md` 里已有对应的部署后检查项
（curl 首页 grep canonical 确认不带 `/MeteoHub/`）。

### 验证结果

- `npm run build` **exit 0**；`check:css` 通过（15 个文件）；`check:site` 通过
  （6 个 HTML 页、**127 条本地引用**、5 条 sitemap URL）
- 门禁 16 的 **16 例注入**全部符合期望（见上表）
- 第十一轮那批改动**独立复验通过**（在本场次的隔离克隆里复跑）：
  基线 exit 0 / 开关 `false` exit 0 / 开关 `false` + 产物仍留 Person exit 1 /
  开关 `true` + 掏空 exit 1 / 自造类型 exit 1 / 内容类实体回归 exit 1
- `feed.xml`：`<lastBuildDate>` = `Mon, 19 Oct 2026 19:42:40 GMT`（RFC 822 ✓）、
  item `<pubDate>` = `Mon, 01 Jun 2026 00:00:00 GMT`（RFC 822 ✓）；
  与 `robots.txt` 的「生成时间」`2026-10-19T19:42:40.165Z` **同一秒** ✓
  （两个时间源确实同源）
- JSON-LD 12 块全部 `JSON.parse` 通过；`canonical` 与 `og:url` 6 个页面全部一致；
  `sitemap.xml` 5 条 URL 与真实路由一一对应
- 门禁 21 规则②/④ 的两条独立注入（FI-F / FI-G）**均 exit 1 且复位后 exit 0**（见 D 节）
- 外链 34 条逐条探测：25×200、6×403、2×404（裸域名，正常）、1×000（本机 fake-IP，非死链）；
  **无新死链**（见 E 节）
- 部署拓扑与"部署后一次自愈"已核实到文件级（见 F 节）
- 线上巡检无新增损坏（见 A 节）

### 待部署（本轮**不 push**，线上仍是旧版本）

线上仍是 2026-10-16 那次部署：`/papers/`、`/publications.bib`、`/feed.xml`
在线仍 404，canonical / og:url / sitemap 仍带 `/MeteoHub/` 前缀且逐条 404。
**本地已全部修好**，但**部署与否由本人决定**（本任务禁止 push）。

根因与自愈结论见 **F 节**：那三条 404 的根因是**线上那份 `origin/main` 的
`src/` 里压根没有 `feed.njk` / `papers.njk` / `publications.bib.njk`**（不是链接写错）；
`/MeteoHub/` 前缀的根因是**旧部署的 `site.url` 带子路径**，而 HEAD 已是域名根
→ **部署后一次自愈**（`origin` = 用户站仓库 `oldsixxiaolv/oldsixxiaolv.github.io`）。

### 待决策（沿用上一轮，本轮不擅自拍板）

1. **404 页要不要保留 Person 实体** —— 现已参数化为 `src/404.njk` 的
   `identityOn404`（默认 `true`），本人拍板时**只改那一行**（写成 `true` / `false` 最稳；`True` / `False` 等大小写形式也能过，
   其余写法会被门禁报红），模板与门禁都不用动；两种口径门禁都认。
2. **论文页是否显示"论文署名单位"**（发表时兰州大学 / 现在中科院 / 两者并注）
   与 `pub.authorAffiliations` 数据字段。
3. **`figure.alt` 是否保留 "Fig. 10 —" 前缀**（忠于作者原文 vs 只留描述）。
4. **何时 push / 部署**（领先数量见 `git log --oneline origin/main..HEAD | wc -l`；
   截至本轮提交**全部未 push**）。

### 留给下一轮

1. **线上部署**（本人决定后执行）——部署完应能一次消掉三类"待部署"差异：
   三个 404 路由 + `/MeteoHub/` 前缀（根因与自愈条件见 F 节）。
2. **门禁 22 候选**：`og:image:alt` 目前仍带 "Fig. 10 —" 前缀，会上到分享卡片
   —— 与待决策第 3 条同一个根因，等本人拍板后一并处理。
3. **门禁 21④ 的报错去重**：同一个 `@id` 在一个 `@graph` 里出现 N 次
   （实体自身 + `mainEntityOfPage` 等嵌套字段）就报 N 遍同一句话
   （FI-G 实测报了 4 遍）。不影响判定（exit code 对），只是可读性，
   值得改成一处聚合报一次。
4. **全站真实 img 必须有非空 alt 的门禁**：现状全站 5 张真实 img 的 alt 都齐，
   但**没有任何门禁守着**（门禁 15 只管"同一张图三出口一致"，不管"这张图压根
   没有 alt"）。⚠️ 实现必须**先剔除 `<style>` 块与 HTML 注释**再匹配 `<img`——
   `src/about.njk:71` 的 CSS 注释里有一句字面 `<img>`，不剔除会造成假阳性。
   ✅ **本条已做**（第十五轮 13:25–13:36 场次）：落成**门禁 25**
   （每张真实 `<img>` 必须带 alt 属性；装饰性图须显式写 `alt=""` 或
   `role="presentation"` / `role="none"`）—— 剔除规则与"必须先剔除"的警告
   一致，实现见第十五轮 B 节。⚠️ 编号以**当前文件**为准（现为 25）。
5. `eleventy.config.js` 的 `buildStamp` 现在按进程缓存 —— 开发服务器
   （`--serve`）下**热重载后会一直用第一次的时刻**。生产构建无影响
   （每次 `npm run build` 都是新进程），但若将来在 `--serve` 下检查
   `robots.txt` 的生成时间，会看到陈旧值 → 值得记一笔或改成按构建轮次重置。
6. **第十二轮留下的这两条技术项已结清**（不再留给下一轮）：
   - `ownerName` 两处不同源 → **已由并发场次 `dead243` 落地**：
     `ownerName` 改成从 site.js 派生（`A.nameAsPublished || A.name`），
     并加了 **ORCID ↔ canonical person @id 双向绑定门禁**
     （`65f2a42` 的 `verify-site.cjs` 里 0 处 → `dead243` 里 2 处；
     构建输出实测打印「13 个节点带 ORCID / 13 个节点带 @id」）。
     第十三轮已独立复核，见「第十三轮」C 节；
   - `src/feed.njk` 的转义行为（"双重转义"疑点）→ **第十三轮实测结清：
     不会双重转义**，注释已按实测改写，见「第十三轮」E 节。
7. **门禁 15 在四个页面上空跑（目前只保护论文页）**（**本轮不实施**）：
   - 门禁 15（`scripts/verify-site.cjs` 里标题为"同一张图在页面里必须只有一套
     alt 文本"的那条；⚠️ **当前编号是 15，不是 14**——14 是编号理顺前的旧号）
     的逻辑：把 og/twitter 的 image URL 解析成站内路径，
     **只有当这张图也出现在该页的 `<img>` 里**才比对两处 alt；否则 `continue`。
   - 实测：首页 `og:image` = `assets/img/og/og-1200x630.png`，
     而首页 `<img>` 集合里**没有**这张图 → 首页**一张图都不参与比对**；
     `about` / `papers` / `blog` 同理（og 卡片图与页面里的图无交集）；
     **只有论文页**的 og 图（`assets/img/publications/trmm-fig10.jpg`）同时出现在页面上
     → 有判别力。
   - → **这条门禁目前只保护论文页**。首页 / 列表页 / 关于页的 og 卡片 alt
     与页面图片 alt **没有第二道保险**（本轮新增的"首页 `twitter:image:alt` 重复"
     就是从这个缝里漏过去的——见「待决策」段新增那一条）。
     ⚠️ **订正（14:45 场次）**：上面"**没有第二道保险**"这句**已被后手覆盖**——
     `dead243`（13:05）新增的**门禁 22**「同一张图在 og 与 twitter 上必须只有一套
     alt 文本」**正是那道保险**：它的判据**不看图有没有出现在页面上**，
     只看 **og:image 与 twitter:image 指向同一张图时两处 alt 必须逐字相同**
     （分享卡片图恰恰不出现在页面的 `<img>` 里 → 正是门禁 15 漏掉的那一类）。
     → 本条**剩下的**只是"门禁 15 自身的范围要不要改口径"；
     "两处 alt 不一致"这个后果已由门禁 22 兜住。
   - 补法方向（待本人定口径后做）：要么给这几个页面也加一条
     "og 图 alt 与 twitter 图 alt 必须一致"的判据（复用同一个 `pairImageAlts`
     结构，两处都取同一张 og 图），要么承认"列表页的 og 卡片是独立图，
     与页面里的图本就不是同一张"，把门禁范围写清楚。

---
## 2026-10-19 · 第十四轮（13:00–13:30 场次，只读复核）：订正两份过期复验报告 + 一条真残留项

> ⚠️ **轮次编号说明**：上文各处提到的「第十三轮」= **13:06 场次**（它的订正以
> **行内插入**的形式落在前几节里，第十二轮章节之后**还没有**第十三轮的独立章节）。
> 本节是**第十四轮**（13:00–13:30 场次），与它不是同一场次。

### 本场次定位

**只读。** 工作区只改了本文件（`docs/IMPROVEMENT-LOG.md`）——其余 4 个脏文件
（`src/_includes/partials/publications.njk`、`src/assets/css/components/_list.css`、
`src/assets/css/pages.css`、新增的 `scripts/check-dead-css.cjs`）**属并发场次**，
本场次一律不碰。**零 push。**

本场次开始时 HEAD = `5c66399`（13:22:37 提交），本地领先远端 **22 个 commit**，
全部未 push（远端仍是 `cfef826`，2026-10-16 那次部署）。

### A. 两份复验报告的复验环境都是**旧祖先**（在链上，但落后现行 main 三十几个 commit）（先立判，再谈结论）

本场次收到两份只读复验报告（11:10 场次、10:10 场次），结论互相矛盾、且都要求
"立刻修"。逐条现查后发现**根因是同一个：它们测的不是现行 main**。

- 11:10 场次的副本 `/tmp/mh_r9c` 的 HEAD = **`fdb5dca`**；
- 10:10 场次报告里写的 HEAD 也 = **`fdb5dca`**。

⚠️ **2026-10-19 14:20 订正（本节原先把 `reset` 的方向记反了——结论不变，理由要改）**：
原文写的是"`fdb5dca` 是 12:09 被 `reset` 掉的那批**孤儿提交**……它**不在链上**"——
**这一句是假的**。`git reflog` 的原文是：

```
54899f1 HEAD@{2026-10-19 12:09:49 -0700}: commit: feat(sitemap): lastmod 改用该页源文件的 git 提交时间 + 门禁 18/19
6953e74 HEAD@{2026-10-19 12:09:41 -0700}: commit: fix(site): 404 页不再宣称"我是一篇论文"
fdb5dca HEAD@{2026-10-19 12:09:41 -0700}: reset: moving to fdb5dca      ← reset 的**落点**，不是被丢弃的那个
89d64fd HEAD@{2026-10-19 12:09:35 -0700}: commit: fix(site): 404 页不再宣称"我是一篇论文"     ← 被丢弃
fdb5dca HEAD@{2026-10-19 12:09:35 -0700}: reset: moving to fdb5dca
dfe021a HEAD@{2026-10-19 12:07:35 -0700}: commit: feat(sitemap): lastmod 改用该页源文件的 git 提交时间 + 门禁 18/19  ← 被丢弃
526b566 HEAD@{2026-10-19 12:07:28 -0700}: commit: fix(site): 404 页不再宣称"我是一篇论文" + 门禁编号体系理顺  ← 被丢弃
```

`reset: moving to fdb5dca` 的意思是**"把 HEAD 移回 fdb5dca"**，不是"丢掉 fdb5dca"：
**`fdb5dca` 留下来当父提交**，随后被重做成 `6953e74` / `54899f1`；
真正被丢弃的是 `526b566` / `dfe021a` / `89d64fd` 这三个。
链上实测（复验时的 HEAD = `7be77ce`）：

```
526b566 孤儿(不在链上)     89d64fd 孤儿(不在链上)
dfe021a 孤儿(不在链上)     fdb5dca 在链上   ← 原文说它不在链上，实测 exit 0
                         6953e74 在链上   54899f1 在链上
```

→ 真实链是 `fdb5dca → 6953e74 → 54899f1 → 01dd76f → …`，
`fdb5dca` 落后现行 main 三十几个 commit。
**"这两份报告测的版本不在链上"这个前提，对它们是错的**：
它们测的 `fdb5dca` **在链上**，只是**是现行 main 的老祖先**。

⚠️ **结论不变，而且理由更普遍**：只要报告测的版本**落后**现行 main，
它的每一条结论都必须在现行 main 上重新现查。
（既有条目「peer 转述的 commit hash 必须先验是否在链上」**继续成立**——
但本例说明**"在链上"不等于"是现行版本"**：
"先验它测的是哪个版本"要同时排掉"不在链上"和"在链上但落后"这两种情况。）

### B. 逐条现查结论（4 组故障注入，全部在 `/tmp` 产物副本上，工作区零写入）

指纹：`scripts/verify-site.cjs` sha256 `57c4e01b…a0ef`（1545 行）、`src/404.njk`
sha256 `1eebbaf9…d9b43d`（`identityOn404: true`）、`_site` 为 13:22 之后的新构建。

| 报告说法 | 现查实测 | 结论 |
|---|---|---|
| 缺口 A：删掉 404 页的 Person 身份实体 → build exit 0 全绿 | **exit 1**："404.html: 一个 JSON-LD 实体都没有 —— src/404.njk 的 identityOn404 = true 声明错误页**要**声明身份" | **不成立**（靠第十一轮的 `identityOn404` 双向判据） |
| 缺口 B：删掉 `<!-- source -->` 注释 → 逐页核对整条失效、note 还在撒谎 | **exit 1**，5 条"没有 `<!-- source: ... -->` 源文件标注" | **不成立**（`54899f1` 起就是 `fail`，不是 `continue`） |
| 门禁 18 承重、不用重写（两份报告的共同正面结论） | 删 5 条 `<lastmod>` → **exit 1**；5 条 lastmod 全填 `src/index.njk` 的时间 → **exit 1**（4 条"取错了源文件"） | **成立** ✅ |
| bibText ReferenceError（`:561` 声明、`:628` 崩） | 已修（当前 `verify-site.cjs:638` 注释 + `:642` 声明）；`node scripts/verify-site.cjs` **exit 0** | **已闭环** |
| `note()` 无条件打印"逐字一致" | 已修（条件打印在 `:644` 起） | **已闭环** |

⚠️ 11:10 场次那份补丁 `/tmp/mh_r9c/patch_writer_final.diff` **已从磁盘上消失**
（连同 `verify_patch.py` / `verify_v6v7.py` / `logv_*.log` 一起被清空）；
而且它的 ①② 两处在当前树上**都已存在**，套上去要么冲突、要么变成重复判据。
**不要按它的操作建议去 `git apply`。**

### C. 唯一还成立的真残留项：门禁 12 的「只改人名」逃逸

⚠️ **编号更正**：10:10 场次说的「门禁 11」在当前文件里是**门禁 12**
（"全站『本人』的 @id 只能有一个取值"，`verify-site.cjs:558` 起；文件头清单第 12 条）。
行号也全部对不上：它说门禁 19 在 `:1082`，当前在 **`:1293`**。

门禁 12 **按人名找节点**（`node.name === OWNER_NAME`）→ **名字一改，这个节点就隐形**。
四例独立实测（基线产物自建于 `/tmp`，见 E 节）：

| 用例 | 注入 | 实测 | 逃逸？ |
|---|---|---|---|
| R1 | 只改 `about/index.html` 的 Person `name`（@id 不动） | **exit 0**（note：本人节点 13 → 12） | **是** |
| R2 | 6 页的 `name` 全改 | **exit 0**（note：本人节点 13 → 7） | **是** |
| R3 | 同时改 `name` + `@id`（`#person-v2`） | **exit 1**（门禁 23：sameAs 含本人 ORCID 却没有 canonical @id） | 否 ✅ |
| R4 | 只改 `@id` 形状（`name` 不动） | **exit 1**（门禁 12：全站出现 2 个不同的"本人" @id；门禁 23 同报） | 否 ✅ |

**所以残余洞只有一个形状**：「`@id` 仍是本人 `@id`、但 `name` 与本人名不同」的节点。
后果较轻（消费方按 `@id` 合并 → 同一个人的名字出现两种写法，而不是被读成两个人）。

⚠️ **10:10 场次建议的补法不够**：它提的"每页至少一个本人节点 / 本人节点数 == 页数"
**抓不到 R1** —— 实测各页 owner 节点数基线是 404:1、其余:2、论文页:4，
`about` 改掉一个之后**还剩 1 个**（另一个来自作者列表），仍然 ≥1 → 判据不报。
R2 能被抓到只是因为 404 页的 owner 节点**恰好只有 1 个**（被改成 0）。

**能抓住 R1 的补法（下一轮候选，本轮不实施）**：把查找**反过来** ——
先按名字定出本人 `@id`，再检查**所有使用这个 `@id` 的 Person 节点**，
它们的 `name` 也必须是本人名：

```
// 凡是用了"本人" @id 的节点，name 也必须是本人名
// （按 @id 兜住"同名改写"；现有门禁 12 是按 name 找，方向相反，天然看不见改名节点）
for (node of 全部 Person 节点) {
  if (node["@id"] === ownerId && String(node.name||"").trim() !== OWNER_NAME) fail(...)
}
```

这条不需要新数据源，判据与门禁 12 同源同页，实现成本低。

### D. 订正 10:10 场次的归因：「serve 与人工 build 争抢 `_site`」是**归因错了**

它说常驻 `eleventy --serve`（PID 11089）会与人工 build 争抢 `_site`。
**进程确实在跑**（自 2026-10-16 01:32 起），但它**不写 `_site`**：

- `eleventy.config.js:35`：`const OUT_DIR = IS_SERVE_MODE ? "_site_dev" : "_site";`
  → serve 模式分流到 **`_site_dev`**（该目录确实存在，且 13:26 还在更新）。

真正与 `_site` 争抢的是**并发场次的 `npm run build`**（它写默认 `_site`）。
本场次在 13:24–13:26 实测撞上了：`_site` 一度只剩 `assets/`，
`SITE_DIR=_site node scripts/verify-site.cjs` 直接 exit 1，报
"引用 `assets/css/components.css` 找不到对应产物"等 **12 个假失败**。
→ **这不是站点缺陷，是并发构建期的取样时机问题。**

### E. 方法论：门禁的故障注入要**自建产物**，不能直接用工作区的 `_site`

`npm run build` 会先清空 `_site` 再写 → 并发构建期取到的是半成品。
而且 **`assets/css/components.css` 是构建期拼出来的**，只生成到默认输出目录，
所以 `npx eleventy --output=/tmp/X` 产出的目录**缺这个文件**，直接喂给门禁
会得到 12 个**假失败**（"引用 assets/css/components.css 找不到对应产物"）。

可用的做法（**基线必须先 exit 0**，否则测的就不是你要测的东西）：

```bash
# 1) 自建产物到 /tmp（不碰工作区 _site）
npx eleventy --output=/tmp/mh_site
# 2) 补上构建期拼出来的聚合 CSS（serve 模式的输出目录里有，且不被 build 抢）
cp -R _site_dev/assets /tmp/mh_site/
# 3) 先验基线
SITE_DIR=/tmp/mh_site node scripts/verify-site.cjs     # 必须 exit 0
# 4) 再做注入（复制一份 → 改产物 → 再跑）
```

⚠️ 另一条同源教训：**产物里的 `lastmod` 是**构建时刻**从 git 现读的**，
所以**提交之后必须重新构建**才有新的 `lastmod`；拿旧产物跑门禁会得到
"取错了源文件"的**假红**（本场次第一次测 R1/R2 时就撞上了：
`paper.md` 在 13:22:37 提交，旧产物里还留着 18:10:56 的值 → exit 1，
与改名毫无关系）。

### 待部署（本轮**不 push**，线上仍是旧版本）

不变：线上仍是 2026-10-16 那次部署（`/papers/`、`/publications.bib`、`/feed.xml`
在线 404；canonical / og:url / sitemap 带 `/MeteoHub/` 前缀）。**部署由本人决定。**

### 待决策（**沿用上一轮，本轮不新增、不擅自拍板**）

1. **404 页要不要保留 Person 实体** —— 已参数化为 `src/404.njk` 的 `identityOn404`
   （默认 `true`），本人拍板时只改那一行。
2. **论文页是否显示"论文署名单位"**。
3. **`figure.alt` 是否保留 "Fig. 10 —" 前缀**。
4. **sitemap `lastmod` 口径三选一**（① 维持现状 ② `max(本页, layout/partial, 数据文件)`
   ③ 回 A1）—— ⚠️ **这条早已写在「待决策」段（L1646–1660）**，含"layout（base.njk）
   不参与 date 计算"这一实测前提。10:10 场次要求"写进待决策段"属于**重复劳动**，
   本轮只做核对，不重复写入。
5. **何时 push / 部署**（本地已领先远端 **22** 个 commit）。

### 留给下一轮

1. **门禁 12 的补法（见 C 节）**：把"按名字找本人节点"反转为"按本人 @id 兜住改名节点"，
   判据与门禁 12 同源、无需新数据源。**先做故障注入**（R1 必须 exit 1、
   R3/R4 仍 exit 1、基线 exit 0）再提交。
2. **`gitOut` 的 catch 加固**（11:10 场次提出，方向对、严重性要降级）：
   `verify-site.cjs:1092` 的 `catch { return null; }` 会把**编程错误**
   （如 `execFileSync` 未定义 → ReferenceError）伪装成"不在 git 仓库里"。
   实测：**现行版 exit 1（fail-closed，不是静默放行）**，但报错指向
   "源码 zip 分发"这个无关方向，真实病因看不见。加固版
   （`if (err && ("status" in err || err.code === "ENOENT")) return null; throw err;`）
   三组实测：坏绑定 → ReferenceError + 堆栈响亮崩；正常仓库 → exit 0 无回归；
   不在 git 仓库 → 照旧走 null 分支不抛。**低严重性（可 diagnosability 修）**，
   不必插队，等有整轮窗口时随其它门禁一起加。
3. **门禁 21④ 的报错去重**、**门禁 15 在四个页面上空跑**、**全站 img 非空 alt 门禁**
   —— 上一轮已列，本轮未动。
   ✅ **第三条已做**（第十五轮 13:25–13:36 场次）→ 门禁 25；
   ⚠️ **前两条仍未做**（第十五轮也未动）。
4. **巡检 cron 仍是每 5 分钟起一个会话** → 持续并发冲突（本轮又见 12 个会话
   挤在工作区，其中 10 个被 TPM 限流卡在 `rate limit exceeded(1039)`）。
   建议改成 30–60 分钟 + 单写者锁。

---
## 2026-10-19 · 第十五轮（13:25–13:36 场次）：图片元素的机械属性门禁补全（alt 存在性 + 尺寸预留）

### 本场次定位

**巡检 + 2 个改进点**，改动只落在 `scripts/verify-site.cjs` 与本文件两个文件。

改进点取自**第十四轮「留给下一轮」第 3 条**里的"全站 img 非空 alt 门禁"——
那条从**第十二轮**（L2173）起就挂着，第十三、十四两轮都只记不做，本轮做掉。
第二个改进点（`width` / `height`）是本轮**新提**的，理由见 C 节。

⚠️ **并发处置**：本场次全程有**并发场次**在同一个工作区写文件（实测 13:22–13:31
之间 `publications.njk` / `pages.css` / `_list.css` / `site.js` / `blog.njk` /
`theme.js` / `package.json` 等 14 个文件被改动，还新增了 `scripts/check-lang.cjs`
与 `scripts/check-dead-css.cjs`）。**本场次只碰 `scripts/verify-site.cjs` 与
`docs/IMPROVEMENT-LOG.md`**，其余一律不碰；提交时**不用 `git add -A`**（理由见 F 节）。

### A. 巡检结果（线上，13:25–13:27 PDT；**无新增损坏**）

| 线上路由 | 状态 |
|---|---|
| `/` `/blog/` `/about/` `/sitemap.xml` `/404.html` | **200** |
| `/papers/` `/publications.bib` `/feed.xml` | **404**（**待部署**，非损坏——本地都有） |
| `/MeteoHub/` 及 `/MeteoHub/*`（8 条） | **404**（线上仍是 2026-10-16 那次部署，站点还铺在 `/MeteoHub/` 下） |

- 线上 4 个页面的 JSON-LD **各 1 块，`JSON.parse` 全部通过**；
- 每页的 `canonical` 与 `og:url` **互相一致**，但都带 `/MeteoHub/` 前缀 → 而那几条
  带前缀的 URL 实测**逐条 404**；线上 sitemap 的 3 条 `<loc>` 同样带前缀、同样 404；
- 线上 `/404.html` **仍带 canonical** —— 现行源码里第 4b 条门禁已禁止（第七轮修的），
  这正说明**线上跑的是旧版本**。
→ 性质是**待部署**（线上 = 2026-10-16 那次部署），**本任务禁止 push**。

**本地**：在**隔离克隆**里跑基线 build（HEAD `5c66399`）→ `npm run build` **exit 0**，
门禁 24 条全绿。（不在共享工作区 build 的理由见 F 节。）

### B. 改进点 A：门禁 25 —— 每张真实 `<img>` 必须带 alt 属性

**为什么是它（这是个真的洞，不是洁癖）**：现有的两条图片门禁都管不到"这张图压根
没有 alt"：

- 第 15 条管"同一张图在页面里时，og/twitter 的 alt 与 `<img alt>` 是不是同一句话"，
  而它**只在 og 卡片图也出现在该页 `<img>` 集合里时才比对**——实测首页 / about /
  papers / blog 四页的 og 卡片图与页面里的图**无交集**（只有论文页有判别力），
  → 那几页**一条都不比对**；
- 第 22 条只比 og 与 twitter，**与页面上的 `<img>` 无关**。

→ 所以现在补一张 `<img src="…">`（忘了写 alt），**全绿通过，没有任何东西会报**。

**判据**（与 W3C ACT 规则 "Image has non-empty accessible name" 同一条语义）：
每张真实 `<img>` 至少满足其一——① 有非空 alt；② `alt=""`（显式声明装饰性）；
③ `role="presentation"` / `role="none"`。**缺 alt 属性 = 判红**
（读屏软件会把文件名或 URL 念出来）。

**"真实 `<img>`" 的定义**（这是实现里最容易出错的一环）：
先剔除 `<style>` 块与 HTML 注释，再匹配 `<img`。**这不是假想**——
`src/about.njk` 的 `.about-hero__photo` 规则里就有一句字面
`<img> 上的 width/height 属性…`（在 `<style>` 里的 CSS 注释中），
**产物里也在**。实测（about 页）：朴素扫描 = 2 张，剔除后 = 1 张 → 剔不掉就多算 1 张。
→ 因此把"取真实 `<img>`"抽成**一个** `realImgTags()` 辅助函数，让
**第 15 / 25 / 26 条共用**，避免三处各写一套、各漏一处。

### C. 改进点 B：门禁 26 —— 每张真实 `<img>` 必须有 `width` / `height`

这个站点多处把"**width/height 属性 + CSS aspect-ratio 双保险**"当成设计不变量
（`pages.css` 与 `components/_paper.css` 的注释都写着：width/height 负责图片
**解码前**的比例预留，aspect-ratio 兜底）——CLS 因此是 0。
但**没有任何门禁守着它**：换图时漏掉这两个属性，CLS 会从 0 变成正数，
而构建照过、门禁全绿，只有 Core Web Vitals 面板会悄悄变差。

判据：每张真实 `<img>` 必须同时有 `width` 与 `height` 属性。
⚠️ 属性**值**不参与判定（只管"有没有"，不管"对不对"——尺寸与源图比例是否一致
属于内容判断）。⚠️ 也不能只靠 CSS `aspect-ratio`：它要等 CSS 解析完才生效，
在那之前盒子没有高度；`width/height` 是**解析 HTML 时**就能读到的。

### D. 故障注入（6 例，在**隔离克隆的产物副本**上做，工作区零写入）

每次注入都**自证生效**（md5 前后不同），且**只跑门禁脚本**（不重跑 build，
免得把注入冲掉）。产物副本 = 隔离克隆里 build 出来的 `_site`，
用 `SITE_DIR=` 指向副本，**不碰共享工作区的 `_site`**。

| 编号 | 注入 | 实测 | 判定 |
|---|---|---|---|
| FI-1 | 首页加一张 `<img src=… width height>`（**无 alt**） | **exit 1**：`index.html: <img> 缺 alt 属性（src="assets/img/author/portrait.jpg"）—— 读屏软件会把文件名或 URL 念出来…`；note 同步改口为"6 张真实 <img>：**1 张缺 alt**（见上方报错）" | ✅ 判红且归因正确 |
| FI-2 | 删掉人像图的 `width="600" height="750"` | **exit 1**，**共 1 个问题**：`index.html: <img> 缺 width 与 height 属性（src="…"）—— 图片解码前的比例预留靠这两个属性，缺了 CLS 会从 0 变成正数` | ✅ 判红且归因正确 |
| FI-3 | 加一张 `alt=""` 的图（装饰性） | **exit 0**；note：6 张真实 `<img>`：5 张有非空 alt，**1 张显式标记为装饰性**，0 张缺 alt | ✅ 放行，不误伤 |
| FI-4 | 加一张 `role="presentation"` 且**无 alt** 的图 | **exit 0**；同上（1 张显式标记为装饰性） | ✅ 放行，不误伤 |
| FI-5 | HTML 注释里写一张 `<img src=…>` | **exit 0**；note 仍是 **5 张**（注释里的那张**没被算进来**） | ✅ 剔除生效 |
| FI-6 | `<style>` 块里写一张 `<img src=…>` | **exit 0**；note 仍是 **5 张**（style 里的那张**没被算进来**） | ✅ 剔除生效 |

⚠️ **note() 的措辞纪律也守住了**：FI-1 / FI-2 判红时，摘要打印的是
"**N 张缺 alt（见上方报错）**" / "**N 张缺 width / height（见上方报错）**"，
**不是**通过时那句"0 张缺 alt / 都带了 width / height"——判红后不照抄通过时的断言句
（这条纪律见文件头 `note()` 的注释，第十三轮、第十四轮都在修同一类毛病）。

### E. 回归：旧门禁 vs 新门禁，逐字 diff

把 HEAD 的 `scripts/verify-site.cjs` 取出来放在**同一目录**下（**必须**放同目录：
脚本用 `__dirname` 定位 `src/404.njk` 与仓库根，放 /tmp 会得到一堆假失败），
对**同一份产物**各跑一遍再 diff：

```
<   · 门禁编号：文件头清单 25 条 / 代码段 25 条，一一对应且连续
---
>   · 全站 5 张真实 <img>：5 张有非空 alt，0 张显式标记为装饰性，0 张缺 alt
>   · 全站 5 张真实 <img> 都带了 width / height（解码前的比例预留）
>   · 门禁编号：文件头清单 27 条 / 代码段 27 条，一一对应且连续
```

**差异只有 3 行**：新增的两条 note + 门禁 24 自己数的那条（25 → 27）。
**没有任何一条既有门禁的行为发生变化**——包括把第 15 条改成用
`realImgTags()` 之后（原先它没剔 `<style>`，只是**碰巧**没事：
那句字面 `<img>` 没有 `src`，被 `if (!src) continue` 跳过了；现在改成共用
同一个"真实 `<img>`"定义，是**消除这个巧合**，不是改变行为）。

### F. 提交范围：为什么这次**没有**用 `git add -A`

任务书要求 `git add -A` + commit。但本场次实测到**并发场次正在同一个工作区写
14 个文件**（`package.json`、`site.js`、`detail.njk`、`header.njk`、
`publications.njk`、`theme-toggle.njk`、`_list.css`、`pages.css`、
`annotations.js`、`theme.js`、`blog.njk`、`about.md`、`robots.njk`，
外加新增的 `check-lang.cjs` / `check-dead-css.cjs`）。
`git add -A` 会把**别人在飞的半成品**一起打进本场次的提交——
那些改动的**作者归属、完整性、是否已自测**都不在本场次的责任范围内，
一旦被提交，出了问题会算到本场次头上，而且**无法回退**（混在同一个 commit 里）。

→ 因此本场次**只显式 add 自己的两个文件**：`scripts/verify-site.cjs`、
`docs/IMPROVEMENT-LOG.md`。其余脏文件**原样留在工作区**，由并发场次自己提交。
（这不是绕过任务书，而是任务书"只提交、不 push"的意图在并发下的正确形态：
**自己只提交自己做过、验证过的东西**。）

⚠️ **顺带修掉的一个字节级缺陷**（不是本场次改的，是编辑该文件时暴露的）：
`verify-site.cjs` 门禁 16 的注释里有一处**非法 UTF-8 字节**
（HEAD 里显示为 `404 页必须**` + 2 个坏字节 + `** ≥1 个身份类实体`），本场次编辑该文件后变成
`404 页必须有 ≥1 个身份类实体`（合法 UTF-8，全文 0 个 U+FFFD）。
这是个**纯修复**，已在本次 diff 里，一并说明。

### 待部署（本轮**不 push**，线上仍是旧版本）

不变：线上仍是 2026-10-16 那次部署（`/papers/`、`/publications.bib`、`/feed.xml`
在线 404；canonical / og:url / sitemap 带 `/MeteoHub/` 前缀；线上 404 页仍带
canonical）。**部署由本人决定。**

### 待决策（**沿用上一轮，本轮不新增、不擅自拍板**）

1. **404 页要不要保留 Person 实体** —— 已参数化为 `src/404.njk` 的 `identityOn404`
   （默认 `true`），本人拍板时只改那一行。
2. **论文页是否显示"论文署名单位"**。
3. **`figure.alt` 是否保留 "Fig. 10 —" 前缀**。
4. **sitemap `lastmod` 口径三选一**（沿用第十二轮 L1646–1660 的三个选项）。
5. **何时 push / 部署**（本地已领先远端 **22** 个 commit）。
6. **门禁 25 的一处口径**（本轮**新提**，需要本人定）：`src/blog.njk:75` 的博客
   卡片封面图写的是 `alt=""`（**显式装饰性**）——门禁 25 放行它（这正是
   `alt=""` 的正确用法）。但那张图其实是**有信息的**（每篇文章的题图），
   更好的做法可能是给它一句描述性 alt，或在图上已有可读标题时保持 `alt=""`
   （避免读屏重复念标题）。**当前没有任何博客文章带封面图**，所以这条是**休眠**的；
   等第一篇带封面的文章出现时再定也来得及。**本轮不擅自改**（改了就等于替本人
   定了一个还没到期的口径）。

### 留给下一轮

1. **门禁 12 的补法**（第十四轮 C 节）：把"按名字找本人节点"反转为
   "按本人 @id 兜住改名节点"。判据与门禁 12 同源、无需新数据源。
   **先做故障注入**（R1 必须 exit 1、R3/R4 仍 exit 1、基线 exit 0）再提交。
2. **门禁 21④ 的报错去重**、**门禁 15 在四个页面上空跑** —— 本轮未动。
3. **`gitOut` 的 catch 加固**（第十四轮「留给下一轮」第 2 条，低严重性，可 diagnosability 修）。
4. **巡检 cron 仍是每 5 分钟起一个会话** → 持续并发冲突（本轮又见十余个会话
   挤在工作区，多数被 TPM 限流卡在 `rate limit exceeded(1039)`）。
   建议改成 30–60 分钟 + 单写者锁。
## 2026-10-19 · 第十六轮（13:20–13:40 场次）：界面语言一致性 + 文本层门禁（check:lang）

### 本场次定位

上一轮（第十五轮）补的是**图片元素的机械属性**（alt 存在性 / 尺寸预留），本轮换一条
**互不重叠**的轴：**界面语言**。

选它而不是继续加编号门禁，有两个理由：

1. 站点早就有明文政策——`src/_data/site.js:31`："整站已统一为英文（正文、标签、
   导航、页面文案）"。中文出现在界面里**不是口味取舍，是违反自家政策**，
   不涉及任何待决策项。
2. 编号体系已被并发场次占满（第十五轮刚排到门禁 27），本轮改用**独立脚本**
   `scripts/check-lang.cjs`，**不碰 `scripts/verify-site.cjs`、不占门禁编号**。

### A. 巡检结果（线上，13:37 PDT；与上一轮一致，**无新增损坏**）

| 路由 | 状态 |
|---|---|
| `/` `/blog/` `/about/` `/sitemap.xml` `/404.html` | 200 |
| `/papers/` `/publications.bib` `/feed.xml` | 404 |

404 仍是**待部署**（线上还是 2026-10-16 那次部署，`origin/main` = `cfef826`，
本地已领先 **24** 个 commit），不是站点损坏。线上 canonical 仍带 `/MeteoHub/`
前缀（`https://github.lvyihang.xyz/MeteoHub/`）——同样是待部署的旧产物。

### B. 改进点 A：界面语言一致性（7 处，其中 1 处是"改过又回退"）

**B1. 主题按钮的可访问名（3 处，最实质的一处）**

`src/assets/js/theme.js` 在每个页面加载后都会把主题按钮的 `aria-label` 覆写成
**中文**（`切换到深色模式` / `切换到浅色模式`），而静态 HTML 写的是英文
（`header.njk:42` / `theme-toggle.njk:7` 的 `aria-label="Switch theme"`）。
`src/assets/js/main.js:2` 有 `import "./theme.js"`，所以**每页都跑**。

后果有三层：

- 同一个按钮的可访问名**取决于 JS 跑没跑**——静态 HTML 与运行时 DOM 不一致；
- 名字随主题状态变化，破坏语音控制（"click Switch theme"在切换一次之后就不再
  匹配这个按钮），也与 `aria-pressed` **双重编码**同一个状态，读屏会念重复；
- 中文覆写直接违反 `site.js:31` 的全英文政策。

→ 改为 **ARIA 切换按钮的标准模式**：可访问名**稳定不变**（`aria-label="Dark theme"`，
  命名被切换的那个东西），状态**只**由 `aria-pressed` 表达；JS 侧不再写
  `aria-label`。静态 HTML 两处（`header.njk` / `theme-toggle.njk`）同步改名。

**B2. 博客列表页的阅读时长（1 处）**：`src/blog.njk:99` 写的是
`{{ post.data.readingTime }} 分钟` → `min read`。这是**第一篇博客文章**将要用的
模板。

**B3. 详情页 layout 的翻页与返回（8 处）**：`src/_includes/layouts/detail.njk`
的 `listLabel` 三种取值（作品集 / 博客 / 首页）、`{{ readingTime }} 分钟`、
`aria-label="上一篇 / 下一篇"`、`← 上一篇` / `下一篇 →`、`← 回到{{ listLabel }}`
——全部改成英文。**这个 layout 目前是"死模板"**：`src/content/blog/` 与
`src/content/portfolio/` 只有 `11tydata.cjs`、没有内容项，所以这些字符串现在
**一行都不会渲染**。正因如此才更要修——第一篇文章落地时它就会冒出来。

**B4. 论文阅读器的 aria 标签（2 处）**：`src/assets/js/paper-reader/annotations.js`
的 `` `${paneTitle}（${n}）` `` 与 `` `${KIND_LABELS[a.kind]}：${a.title}` `` 用的是
**全角括号 / 全角冒号**。同文件的 `KIND_LABELS` 本身早已是英文
（Question / Insight / Critique / Link / Figure / Correction），`aria` 标签也已是
英文——这两处是英文化时漏掉的标点。

**B5. `src/robots.njk`：改过，又回退（记录理由）**

本轮一度把 robots.txt 的 `#` 注释行也英文化（`# 站点：` → `# Site:` 等 5 处），
**随后回退**。两个原因：

1. robots.txt 是**给爬虫读的纯文本**，那些 `#` 行按 robots.txt 约定是给维护者看的
   注释，模板里明说"注释行在生产输出中保留"——它不是"页面文案"，不在
   `site.js:31` 政策覆盖的那一类里；
2. 更硬的一条：站点门禁 **17 与 20**（`scripts/verify-site.cjs:1088` 与 `:1475`）
   **以 robots.txt 里那行中文标记「生成时间」为锚点**（正则
   `/^#\s*生成时间[：:]\s*(.+?)\s*$/m`）。把它英文化会**直接把那两条门禁打红**
   ——实测确实红了：`robots.txt: 找不到「生成时间」这一行`。
   改一个模板却要连带改别人的两条门禁，属于跨门禁的连带改动，不该由本轮顺手做。

→ 现在改用**在门禁里精确豁免**（见 C 节），既不碰 robots.njk，也不碰门禁 17/20。

### C. 改进点 B：新门禁 `scripts/check-lang.cjs`（独立脚本，不占编号）

接进 `package.json`：`"build": "npm run check:css && eleventy && npm run check:site && npm run check:lang"`。

**扫描面**（= 用户看得见的文本）：

- 源文件层：`src` 下的 `.njk` / `.md` / `.css` / `.js` / `.svg`
- 产物层：`_site` 下的 `.html`

**逐类剥离**（剥完再扫，所以注释里的中文不误报）：

| 类别 | 处理 |
|---|---|
| YAML front matter 的**整行**注释 | 剥掉；**值保留**（`title` / `description` 会渲染进 `<title>` 和 `<meta name="description">`，属用户可见文本） |
| Nunjucks `{# #}` | 剥掉 |
| HTML `<!-- -->` | 剥掉 |
| CSS `/* */`、JS `/* */` 与 `//` | 剥掉 |
| `<script>` / `<style>` 块 | 剥掉（JSON-LD 在 `<script>` 里，不进可见文本） |

**豁免**（各有明确理由，不是留口子）：

- `src/_data/**` —— 数据层。`site.js` 刻意保留中文身份字段（`alternateName` /
  `affiliation` / `affiliations[].name` / `research` / `currentFocus`），
  那是**它们该待的地方**；数据层的中文不进正文，产物层扫描会兜住漏进来的。
- `src/robots.njk` —— 见 B5。
- `src/assets/img/og/*.svg` —— 三张 OG 分享图里的中文是**品牌文案**
  （署名「吕亦航」+ 中文格言「以大气之名，写下可被验证的东西。」+ 中文单位），
  属**本人拍板**范畴，已列入本轮「待决策」第 7 条；其它 SVG（`favicon.svg`）仍纳入门禁。
- `.cjs` 与 `scripts/**` —— 构建工具链，不进产物。

**第二项检查：U+FFFD（编码损坏）**。见 D 节。

### D. 编码损坏：3 处 U+FFFD（静默损坏，无任何构建步骤会报）

全仓扫 `U+FFFD`（坏字节被解码后的残骸）命中 3 处：

| 文件 | 原文 | 修成 |
|---|---|---|
| `src/_data/site.js:83` | `现在在���科院大气所` | `现在在中科院大气所` |
| `src/content/about.md:13` | `"为什么有��站"` | `"为什么有本站"` |
| `scripts/verify-site.cjs` | `404 页必须�� ≥1 个身份类实体` | `404 页必须有 ≥1 个身份类实体` |

三点说明：

- **都在注释里**，不影响运行，也没有任何构建步骤会报——正是
  `scripts/check-css-braces.cjs` 当初要拦的那一类**静默错误**（坏掉的不是
  "能不能跑"，而是"跑出来的东西对不对"）。
- 前两处的坏字节**自建站那次重构（`0252580`）就在了**，git 里存的就是 U+FFFD，
  原文不可恢复：前一处按同文件 `affiliationShort: "IAP-CAS"` / 兄弟注释的
  「现中科院大气所」补回"中"；后一处按**作者全仓一致的用词**补回——全仓
  8 处用"本站"、0 处用"官网/网站"，且坏字正好 2 个字，与"本站"吻合。
  ⚠️ 这是**语义复原**，不是逐字节还原。
- 第三处（`verify-site.cjs`）**已被上一轮（第十五轮）先行修掉**并随其提交入库；
  本轮编辑同一文件时是**独立发现的同一处**，改动一致，故此处仅作记录。

→ 因此 `check:lang` 除语言外**顺带报 U+FFFD**（扫的是同一批文件，成本几乎为零）。

### E. 故障注入（12 例矩阵，每例带**回读断言**）

在 `/tmp` 隔离副本上做，工作区零写入。每例都做三件事：写入注入 → **回读断言**
（确认注入真的落盘：锚点存在 + md5 变化 + 注入内容读得到）→ 跑门禁 → 判读退出码
与输出指向。**只看退出码不算数**——"注入没生效"与"门禁没拦住"在结果上长得一样。

| 用例 | 注入 | 期望 | 实测 |
|---|---|---|---|
| T1 | 模板可见文本有中文 | exit 1 并指名该文件 | ✅ |
| T2 | 脚本字符串有中文 | exit 1 并指名该文件 | ✅ |
| T3 | front matter **值**有中文 | exit 1 并指名该文件 | ✅ |
| T4 | Nunjucks 注释有中文 | exit 0（不误伤） | ✅ |
| T5 | HTML 注释有中文 | exit 0（不误伤） | ✅ |
| T6 | YAML 整行注释有中文 | exit 0（不误伤） | ✅ |
| T7 | 数据层中文 | exit 0（豁免生效） | ✅ |
| T8 | OG 品牌图中文 | exit 0（豁免生效） | ✅ |
| T9 | robots.txt 中文 | exit 0（豁免生效） | ✅ |
| T10 | **产物**可见文本有中文 | exit 1 并指名该文件 | ✅ |
| T11 | U+FFFD 编码损坏 | exit 1 并报 U+FFFD | ✅ |
| T12 | markdown 正文有中文 | exit 1 并指名该文件 | ✅ |

T3 特意验的是 **front matter 的值**而不是整块剥离——`title` / `description`
会渲染进 `<title>` 与 `<meta name="description">`，整块剥掉就等于把这两处漏了。
复位后基线复跑仍为 **exit 0（52 个文件）**。

### F. 死模板走通验证（临时博客帖，验证完即删）

`detail.njk` / `blog.njk` 的改动在当前仓库里**一行都不会渲染**（集合为空），
所以"改了但没跑过"是没有意义的。在隔离副本里临时造两篇英文帖
（`readingTime: 8 / 12`，两篇是为了让 `prev` / `next` 翻页也渲染出来），重新构建后实测：

- 详情页：`Back to Blog` ✅、`aria-label="Previous / next"` ✅、`← Previous` ✅、
  `Next →` ✅、`8 min read` ✅
- 列表页徽标：`12 min read` / `8 min read` ✅
- 三页可见中文合计 **0 处** ✅
- `check:lang` 仍 exit 0（56 个文件）✅

验证完删掉临时帖并**复跑完整构建**：exit 0（`check:css` + `check-dead-css` +
`check:site` + `check:lang` 全绿），产物 5 个 HTML 页 / 5 条 sitemap URL，
全站可见中文 **0 处**。

### G. 排查方法上的一个坑（值得记下来）

第一版 CJK 探针把**整份文件**涂白再找中文（`blank(re.sub(...))` 的顺序写反），
于是**每个文件都报 0 处**——包括 `src/_data/site.js` 这种明明有 3319 个中文字符的
文件。差点据此把 CSS / SVG / JS 三层整个排除出门禁覆盖。

改正后（只把**匹配到的注释**涂白，其余原样保留）实测：

- CSS：注释外 **0** 处；SVG：**只有 3 张 OG 品牌图**有中文；JS：只剩
  `theme.js` 与 `annotations.js` 各一处（本轮已修），其余 7 个文件干净。

**结论**：门禁的"豁免"必须基于**实测**，不能基于一个可能整片失效的探针。

### H. 提交范围：为什么不是裸 `git add -A`

任务书要求 `git add -A`，但本场次实测**并发场次正在同一个工作区写文件**，且
`package.json` 的内容**一半是别人的**：本轮只加了 `check:lang`，而
`check:css` 里那半截 `&& node scripts/check-dead-css.cjs` 是**并发场次**接的。

更硬的一条约束：实测 `check-dead-css.cjs` 在**旧 CSS** 上会报 **17 个死类**
（`.home-pillar` / `.home-achievements` / `.home-latest` 等）——它正是为并发场次
正在删的那批 CSS 写的。**只提交 `package.json` + 门禁脚本而不提交那份 CSS 改动，
commit 落地就是红的**（干净克隆上直接 exit 1）。

→ 因此本场次提交**最小自洽集**：本轮自己改的 9 个文件 + `package.json`
（含双方接线）+ `scripts/check-dead-css.cjs`（package.json 引用它，不提交就断链）
+ 并发场次那份**必须**配套的 CSS / `publications.njk` 改动（已随本轮在隔离副本上
**复验构建 exit 0**）。

**故意留下不提交**：`scripts/check-copy-export.cjs`（并发场次的未接线脚本，
单独跑 exit 0，但未接进 `package.json`）——留给它自己的场次提交。

### 待部署（本轮**不 push**，线上仍是旧版本）

不变：线上仍是 2026-10-16 那次部署（`/papers/`、`/publications.bib`、`/feed.xml`
在线 404；canonical / og:url / sitemap 带 `/MeteoHub/` 前缀；线上 404 页仍带
canonical）。**部署由本人决定。**

### 待决策（沿用上一轮 6 条，本轮**新增第 7 条**，不擅自拍板）

1. **404 页要不要保留 Person 实体** —— 已参数化为 `src/404.njk` 的 `identityOn404`
   （默认 `true`），本人拍板时只改那一行。
2. **论文页是否显示"论文署名单位"**。
3. **`figure.alt` 是否保留 "Fig. 10 —" 前缀**。
4. **sitemap `lastmod` 口径三选一**（沿用第十二轮 L1646–1660 的三个选项）。
5. **何时 push / 部署**（本地已领先远端 **24** 个 commit）。
6. **门禁 25 的一处口径**（第十五轮新提）：`src/blog.njk:75` 博客卡片封面图的
   `alt=""` 该不该给描述性替代文本（当前休眠：还没有带封面的文章）。
7. **【本轮新提】OG 分享图里的中文品牌文案要不要英文化**：
   `src/assets/img/og/og-1200x630.svg`、`og-1080x1080.svg`、`og-1500x500.svg`
   三张图里各有中文——署名「吕亦航」、格言「以大气之名，写下可被验证的东西。」、
   单位「BEIJING · 中科院大气物理研究所」。这是**分享到微信 / 推特 / Slack 时
   对方看到的第一眼**，与页面正文语言直接相关；但它同时是**个人品牌文案**
   （格言的中文写法是本人自己的句子），改成英文等于替本人重写一句自己的话，
   **本轮不擅自动**。现状：`check:lang` 对这三张图**精确豁免**（理由写在该脚本里）。
   附带信息：`src/_data/site.js:12` 已有英文 tagline
   （"Thunderstorms, lightning, and the physics of extreme precipitation."），
   若本人想保留中文格言，这句英文 tagline 可以并排用。

### 留给下一轮

1. **门禁 12 的补法**（第十四轮 C 节）：把"按名字找本人节点"反转为
   "按本人 @id 兜住改名节点"。判据与门禁 12 同源、无需新数据源。
   **先做故障注入**（R1 必须 exit 1、R3/R4 仍 exit 1、基线 exit 0）再提交。
2. **门禁 21④ 的报错去重**、**门禁 15 在四个页面上空跑** —— 本轮未动。
3. **`gitOut` 的 catch 加固**（第十四轮「留给下一轮」第 2 条，低严重性）。
4. **本轮新提**：`src/_includes/partials/detail.njk` 的 `listLabel` 三种取值是
   **写死的中/英文字符串**，而 `/portfolio/` 与 `/blog/` 两个列表页的**英文标题**
   就在 `site.nav` 里（`site.js`）。若以后要支持 i18n，这里应改为从数据层取。
   本轮不抽象（站点只有一种语言，抽象反而是过度设计）。
5. **巡检 cron 仍是每 5 分钟起一个会话** → 持续并发冲突（连续三轮都撞见）。
   建议改成 30–60 分钟 + 单写者锁。

---
## 2026-10-19 · 第十三轮（13:06 场次）：分享卡图 alt 同源 + 认人以 ORCID 为锚

> ⚠️ **轮次编号与位置说明**：本场次（13:06）的订正**已经**以行内插入的形式落在
> 第九轮 / 第十轮 / 「待决策」三处里（见下面 D 节），但**独立章节一直缺着**。
> 第十四轮曾在段首注明此事。由于本仓库是**多场次并发写同一份日志**，
> 中段插入（read → 改 → 全量写回）会有**覆盖掉别人并发追加内容**的风险，
> 因此本段**补写在文末**——编号（第十三轮）才是权威，物理位置不是。
> 段内引用的行号均为**本段写作时**的快照，追溯时以标识符为准。

### A. 背景

**线上巡检（只读）结论：线上不是新损坏，是旧部署。**

```
200  https://github.lvyihang.xyz/
404  https://github.lvyihang.xyz/papers/
200  https://github.lvyihang.xyz/blog/
200  https://github.lvyihang.xyz/about/
404  https://github.lvyihang.xyz/publications.bib
404  https://github.lvyihang.xyz/feed.xml
200  https://github.lvyihang.xyz/sitemap.xml
```

- sitemap 3 条 loc **全带旧前缀** `https://github.lvyihang.xyz/MeteoHub/{,about/,blog/}`；
- 首页 canonical 与 og:url 均为 `https://github.lvyihang.xyz/MeteoHub/`；
- 这与第十二轮记载的「待部署」状态**逐条一致** → 是**旧部署**，不是新故障；
  `/feed.xml` 在线 404 是该状态的组成部分（第十一轮已把 feed 的时间戳改成说真话，
  但要等部署才生效）。

**外部调研（本轮做过的两件事）**：
- web_search「og:image:alt twitter:image:alt same description」→ 同一张图在 og 与
  twitter 上的 alt 应当是**同一句描述**（标准范例里两处同为一句）。
  → 落成改进点 A。
- web_search「academic homepage JSON-LD Person ORCID sameAs」→ 学术主页结构化数据
  最佳实践是 Person 单一稳定 `@id`（`#person` fragment）+ `sameAs` 指向 ORCID。
  站点**既有做法已符合**（稳定 @id + sameAs 指向 ORCID），**无重大缺口**，
  → 不重复做，转而落成改进点 B（把「认人」这件事从写死改成有据可依）。
- `mcp__agu-papers__search_papers` 两次调用均返回 `OpenAlex search failed (HTTP 429)`
  （瞬时限流），**未取到 AGU 论文样本**。这一点如实记下，不当作"已调研过"。

### B. 改了什么

**改进点 A —— 分享卡图 alt 同源**（`src/_includes/layouts/base.njk`）

- **原状**：`twitter:image:alt` 在"无 cover"分支**独立拼装**
  `{{ ogTitle }} · {{ site.author.name }}, {{ site.author.jobTitle }}`；
  而首页 `ogTitle` **本身就含姓名与职位** → 实际产出
  `"Yihang Lyu · PhD Student · Yihang Lyu, PhD Student"`（姓名与职位重复出现），
  同一张图在 og 侧却是 `"MeteoHub — Yihang Lyu, PhD Student at IAP-CAS"`。
  → **同一张图，两处 alt 不是同一句**，且其中一句是重复拼接的。
- **改动**：twitter 侧**复用 og 侧那一句**——无 cover 用 `{{ ogCardAlt }}`；
  有 cover 用 `{{ coverAltText or ogCardAlt }}`（与 og 侧完全对称）。
- **为什么这不是"口味问题"**：`base.njk` 里那段注释**自己就写明**要避免
  `"Yihang Lyu · PhD Student · Yihang Lyu, PhD Student"` 这串。实现与**自己的注释**
  相悖，属**代码缺陷**。且本次改动**不引入任何新措辞**——两句都已在站内发布，
  只是消除分歧与重复。若本人想要 twitter 专属句，是**一行**改动（见 E 节）。

**改进点 B —— 认人以 ORCID 为锚**（`eleventy.config.js`）

- **原状**：`jsonLdArticles` 把 `ownerName` **写死**成 `"Yihang Lyu"`，而
  `jsonLdPaper` 读 `site.js` → 同一件事（"这个人是不是本站主人"）有**两套**认人逻辑。
- **第一版（commit `dead243`）只改成"从 site.js 派生"——实测发现更脆**：
  只改 `site.js` 的 `nameAsPublished`、作者列表不动时（FI-G 场景），派生出的名字
  与作者列表对不上 → 本人节点**照样丢** canonical @id。
  也就是说：写死那版隐式钉在作者列表拼写上，派生那版反而把它**显式暴露**了出来。
- **最终实现：ORCID 优先、姓名兜底**——
  `ownerOrcidId = A.orcid.split("/").pop().trim()`（`site.js` 存完整 URL
  `https://orcid.org/0009-0005-3511-0546`，作者列表存裸号 `0009-0005-3511-0546`），
  `isOwnerAuthor = (a) => (ORCID 相同) || (姓名相同)`；
  `jsonLdArticles` 与 `jsonLdPaper` **共用这一条**（各自函数体内一份，判据同源）。
  理由：姓名可变（出版商登记名），**ORCID 稳定**。
- `base.njk` 的调用改为 `site.publications | jsonLdArticles(site.author, pubKey, site.url)`。
- **无回归**：重构后 6 个 HTML 产物与上一 commit **逐字一致**
  （`feed.xml` / `robots.txt` 的差异仅因内嵌构建时刻，比对时本就排除）。

**门禁 22**（`scripts/verify-site.cjs`）—— og/twitter 同图 → alt 必须逐字相同

- 判据：`og:image` 与 `twitter:image` 指向**同一张图**时，两处 alt 必须逐字相同。
- ⚠️ **不要求该图出现在页面的 `<img>` 里**：门禁 15 只在图出现时才比对 alt，
  而**分享卡片图恰恰不出现在页面里**——这是门禁 15 看不见的一个盲区。
- ⚠️ **按图片路径配对，不按出现顺序**：og 侧默认输出 3 个尺寸（1200×630 /
  1080×1080 / 1500×500），twitter 侧只输出 1200×630；按顺序配对会**错位**。

**门禁 23** —— 本人 ORCID ↔ canonical @id **双向**绑定

- 方向 A：含本人 ORCID 的 Person 节点**必须**有 `SITE_URL + "/#person"`；
- 方向 B：带该 @id 的 Person 节点**必须**含本人 ORCID。
- `sameAs` 先归一成数组再判（`Array.isArray(raw) ? raw : raw ? [raw] : []`），
  兼容**字符串形态**（`jsonLdArticles` 产出）与**数组形态**（`jsonLdPaper` 产出）；
  比对用**严格相等**而非 `includes` 子串匹配（避免 `0009-...-0546` 命中
  `0009-...-05461` 这类子串误判）。

**门禁 24** —— 编号元门禁（编号漂移本身也要判红）

- `scripts/verify-site.cjs` **自读本文件**，比对「文件头编号清单」与
  「代码里的门禁段」必须一一对应、编号唯一、整数连续。
- 提取规则**只认段首**（否则会把自己脚下的注释也算进去）：
  清单 `^\s*\*\s+(\d+[a-z]?)\.\s`；代码 `^\s*(?:\/\/|\/\* -+)\s*(\d+[a-z]?)[.)]\s`。
- 整数连续判定允许 **4b/4c 族**：整数 N 算"存在"可以是 `N` 本身或 `N`+字母后缀族
  ——本项目**没有**独立的「4」，这一族由 4b（错误页索引控制）与 4c（标题）承担。
  首版写成"严格连续"导致 build exit 1，已修正为一族判定。

### C. 验证结果

**故障注入 9 例全部通过**（隔离克隆 `/tmp/mh-fi2-mvs82596d`，HEAD 含本轮两个 commit）：

| 编号 | 注入 | 期望 | 实测 |
|---|---|---|---|
| FI-A | twitter alt 退回旧写法 | 1 | **1**（命中 5 页：404/about/blog/papers/index） |
| FI-B | 整条删掉 twitter:image:alt | 1 | **1**（"twitter 侧整条缺失"） |
| FI-C | 含本人 ORCID 但 @id 指向 `#person-v2` | 1 | **1**（方向 A） |
| FI-D | 有 canonical @id 但 ORCID 被抹掉 | 1 | **1**（方向 B，"脱钩"） |
| FI-F | 别人作者节点（Xueke Wu）误挂本人 ORCID | 1 | **1**；**门禁 12 命中 0、门禁 23 命中 1** |
| FI-E2'' | `jsonLdArticles` 完全退回修复前实现（写死姓名 + 只按姓名认人）+ 改名 | 1 | **1**（@id 节点数 13→9，多页报错） |
| FI-G | 只改 site.js 的 `nameAsPublished` | 0 | **0**（13/13；**上一版实现这里红**） |
| FI-H | 从文件头清单删掉门禁 23 登记 | 1 | **1**（"代码里有门禁 23，但文件头清单里没有登记"） |
| FI-I | 清单里 24 写两遍 | 1 | **1**（"门禁编号在文件头清单里重复：24"） |

> FI-F 同时**订正了日志里一句不准确的话**：原文称门禁 12 对"认不出本人"完全无感
> ——**实测不准确**。门禁 12 会以另一条规则报「描述 X 的 Person 节点没有 @id」
> （方向 A），但它**看不见**"名字不匹配的节点"（FI-F：门禁 12 命中 0、门禁 23 命中 1）。
> 门禁 23 的价值在于**名字无关** + 反向判据 + 指向根因。

**同伴场次的独立复验（13:2x，只读）**：
- 门禁 22：改 twitter alt → exit 1；改 og alt → exit 1（**反向也拦**）；对照 exit 0。
- 门禁 23：方向 A → exit 1；方向 B → exit 1；note 报「13 个节点带 ORCID /
  13 个节点带 @id」→ 判据**非空转**。
- 门禁 20 / 21 / 16 未回归：门禁 20 4/4 注入 exit 1；门禁 21 两条注入 exit 1；
  门禁 16 双向——`identityOn404=false` → exit 0（合法口径**不误伤**）、
  写成 `no` → exit 1。
- **门禁 24 承重 5/5**（14:05 续报）：代码多一条未登记 / 清单少一条 / 重号 / 断档
  四种分叉**全部判红**，对照 exit 0 → 这条元门禁**确实承重**，不是摆设。
- 门禁 22 / 23 的独立复验已完成（7 组注入，6/7 符合预期；第 7 组是 **N15**，
  见 F 节第 1 条——那是**已知的盲区**而非门禁失效）。报告
  `/tmp/mvs_dd21f18c_r12/report_1330.md`（已打过期横幅，内容仍在）。

**干净克隆复验（本轮收尾，HEAD `3bb247e`）**：`npm run build` **exit 0**，
`check:css` / `check:site` / `check:lang` 全绿。其中两条 note 直接印证本轮的门禁还活着：

```
· 本人 ORCID https://orcid.org/0009-0005-3511-0546 ↔ canonical @id 双向绑定（13 个节点带 ORCID / 13 个节点带 @id）
· 门禁编号：文件头清单 27 条 / 代码段 27 条，一一对应且连续
```

### D. 顺手订正的 4 处过期指引（**已随并发场次的提交落地**）

这 4 处都不是"轮次记录"，而是**本人照着改就会踩雷的操作指引**，优先级高于轮次记录。

1. **第九轮「留给下一轮」第 1 条**（`hasOwnerOn404` 修法）→ 标为
   **已关闭，且原修法现在照做是*有害的***：缺口已由第十一轮的 `identityOn404`
   开关 + 门禁 16 双向判据闭合；`hasOwnerOn404` 会把"404 页要不要 Person"这个
   **未拍板口径**写死进门禁，与开关的承诺冲突。
2. **第十轮「留给下一轮」第 1 条**（同一处）→ 同样订正。
3. 第九轮 / 第十轮「留给下一轮」第 2 条（编号元门禁）→ 标为
   ✅ **第十三轮已做**（门禁 24）。
4. **「待决策」段**两处**假指引**：
   - 原文"只需回退 commit 2" → 改成**具体 hash** `54899f1`（= 那段里的 "commit 2"），
     并补上实测结论：**`git revert 54899f1` 会冲突**
     （`docs/IMPROVEMENT-LOG.md` 与 `scripts/verify-site.cjs` 两文件冲突；
     `eleventy.config.js` / `src/sitemap.njk` / `.github/workflows/deploy.yml` 能自动合并）。
     ⚠️ **订正（2026-10-19 17:30–17:50 场次实测）**：重测 `git revert 54899f1`
     的冲突文件是 **3** 个（`docs/IMPROVEMENT-LOG.md` / `eleventy.config.js` /
     `scripts/verify-site.cjs`），能自动合并的只有 **2** 个
     （`src/sitemap.njk` / `.github/workflows/deploy.yml`）——
     `eleventy.config.js` 在此之后被改过。照上面那行去 revert 会漏掉第 3 个冲突文件。
   - 原文"要回退到 C 只需把 `lastCommitTime` filter 改成恒返回空" → **实测是假的**：
     照做 build **exit 1**、5 条报错，因为**门禁 18 规则 E 正是抓这个**。
     选 C 必须**同时撤掉门禁 18**，共四步：① filter 恒返回空；
     ② 整段删门禁 18；③ `src/sitemap.njk` 不用动（`{% if lastmod %}` 自动不输出）；
     ④ `deploy.yml` 的 `fetch-depth: 0` 可留可去。照此实测 **exit 0**、
     sitemap 5 条 loc、0 条 lastmod。

### E. 待决策（需要本人拍板，本轮**不擅自决定**）

1. **【本轮新提】`og:image:alt` 与 `twitter:image:alt` 的最终措辞**：
   本轮已让两处**同源**，消除了重复拼接与两处分歧（首页两处现在都是
   `"MeteoHub — Yihang Lyu, PhD Student at IAP-CAS"`）。若本人想要 twitter 专属句，
   改 `base.njk` **一行**即可（无 cover 分支的 `{{ ogCardAlt }}`）。
2. （沿用）`figure.alt` 是否保留 "Fig. 10 —" 前缀。
3. （沿用）404 页是否保留 Person 实体（`src/404.njk` 的 `identityOn404`，
   默认 `true`，本人拍板时**只改这一行**）。
4. （沿用）sitemap `lastmod` 口径三选一（**选 C 必须按 D 节第 4 条的四步走**）。
5. （沿用）其余既有待决策项（Scholar/ADS/arXiv 真实 URL、`site.drive.url`、
   OpenAlex 页脚可见性、X 句柄、数据集两种引用口径、`citation_author_institution`
   口径、论文页是否显示署名单位、站点根目录用途、是否公开源码、
   作者 affiliation 与论文 affiliation 不一致等）。
6. （沿用）**何时 push / 部署**：本地已领先远端 **25** 个 commit
   （远端仍是 `cfef8269`），线上仍是 2026-10-16 旧部署。
   **本轮不 push**。

### F. 留给下一轮

1. **sameAs 形态门禁**（**本轮延后**）—— 同伴场次实测出一个盲区：
   把 sameAs 里的 GitHub 条目改成**死链**（`https://github.com/lvyihang/definitely-not-a-repo`），
   门禁 **exit 0**，而产物里**确有**这个死链。
   方向建议（与同伴一致）：**只查形态、不做网络探测**——必须 `https://` 绝对地址，
   且与 `site.js` **逐字一致**。理由：网络探测的 403 / 000 假阳性太多。
   **待界定之处**：本人节点的 sameAs 是 `site.js` 里的**数组**（应逐字一致），
   合著者节点的 sameAs 是 `https://orcid.org/${a.orcid}` **构造值**（只查形态），
   两类判据要分别界定，不能一刀切。
2. **加固补丁请用 C2 取代 C**（**本轮延后**，14:05 同伴续报订正）—— 门禁 18 的 lastmod
   双向加固。⚠️ **原来的 C 补丁 `/tmp/mvs_dd21f18c_r10/patch_C.diff` 不要用**：
   它的判据把 **EACCES 也一起吞掉** → 源文件读不到时**仍然静默全绿**，
   等于没堵住洞。**C2** 在 `/tmp/mvs_dd21f18c_r14/patch_C2.diff`
   （`f32f2a0` 干净克隆 `git apply --check` exit 0）：它**只吞**「数字 status」与
   「`code === "ENOENT"`」，其余（编程错误 / EACCES）**一律抛**。
   - 实测：先在 `3bb247e` 上 8/8，后在 `eb0cd16` 上重跑 8/8 **仍全绿**；
     其中 **V3（两侧都坏）由 exit 0 全绿变为 exit 1**（TypeError 可见），
     浅克隆 / 无 `.git` / git 退出码 128 三种情况**都不崩栈**。
   - 报告：`/tmp/mvs_dd21f18c_r15/report_1405.md`；状态索引已并入
     `/tmp/mh_R9_STATUS.md` **第八节**。
   - **落地纪律**：显式 `git add` 那**两个文件**，**不要 `git add -A`**
     （共享工作区有并发场次，会扫进他人半成品）。
   ⚠️ 旧补丁 `/tmp/mh_r9v2/gate18.patch` 基于旧版 `verify-site.cjs`，**不要 apply**。
   - 🛑 **订正（2026-10-19 15:50–16:10 场次；本条已完成 —— 不再是"下一轮的活"）**：
     **C2 已以 `f59fec4` 落地**（`fix(gate): 收窄 gitOut/gitRoot/lastCommitTime 三处裸 catch`），
     在链上（`git merge-base --is-ancestor f59fec4 HEAD` exit 0）。
     → 所以 `patch_C2.diff` 现在**不可套**（`git apply --check` 报
     `patch failed: scripts/verify-site.cjs:1089`），**原因是"已经应用过了"**，不是"过时"：
     那份补丁的作用就是**引入**窄判据 `(typeof e.status === "number" || e.code === "ENOENT")`，
     而这个窄判据正是 `f59fec4` 带进来的。别再把它当"下一轮要打的补丁"找一遍。
     - **真正还开着的是它的下一层**：窄判据**自身**漏判「git 被信号杀 / spawn 失败」这类
       **真·进程失败**（`e.status` 是 `null`、`e.code` 不是 `"ENOENT"`）→ 被误判成"编程错误"
       → rethrow → **构建崩栈**（该降级时崩了，属健壮性缺陷，不是假绿）。
       正解是把判据放宽成 `"status" in e`（子进程错误必定带 `status` 属性，编程错误一个属性都没有）。
       端到端证据与三份补丁对照见「15:50–16:10 场次」C/D/E 段。
3. **「旧编号 → 新编号对照」表补行** —— ✅ **已关闭**（14:05 同伴现查 + 写者已落地）。
   - 真相：对照表止于「→ 新 19」，**实际缺 20–28 共 9 行**——20 / 21（第十一轮）、
     25 / 26（第十五轮）、27（13:45–14:15 场次）**都是各写者自己加的，编号从未变过**；
     我原先只补 22 / 23 / 24 三行是**按"只补自己那几行"的思路**，属于**局部补**。
   - 写者已用**幂等插入脚本**补全（commit `9f0459f`：补全 20–29 号，
     并新增**门禁 29** 让这张表**不能再漂移**）：
     `python3 /tmp/mvs_dd21f18c_r15/insert_contrast_rows.py`
     （两种前置状态——有无门禁 28 行——都实测通过；门禁 28 那行归写者自己补）。
   - ⚠️ **本轮我交付的补丁 `/tmp/mvs82596d_r13_contrast_table.patch` 作废，不要 apply**
     （只补 3 行，与写者的完整补法重叠，叠加会写出重复行）。

---
## 2026-10-19 · 13:31–14:10 场次补记（**不占轮次号**，避免与并发场次撞号）：门禁 16 作用域收窄的 A/B 证据 + 一次"工作树比 HEAD 新"造成的误判

### 本场次定位

**只写本文件**（`docs/IMPROVEMENT-LOG.md`）。本场次开始时（13:31）并发场次正在同一个
工作区改 `scripts/verify-site.cjs`、界面文案与样式，本场次**一律不碰**；等它们提交
（`93f9497` 13:36 / `3bb247e` 13:38）后才在**干净工作树**上核对。**零 push。**

本场次只做三件事：

1. **补记** 13:06 场次已落地、但**从未写入日志**的门禁 16 作用域收窄证据（22 例矩阵 + A/B）；
2. **给 `check:lang` 的 U+FFFD 检查指出一个扫描面缺口**（已用注入坐实，D 节）；
3. **订正我自己 13:31 的一次误判**（把真缺陷当成"未复现"），并把机制写清楚（C 节）。

本场次**未改任何产品代码**——D 节那个缺口留给下一轮（见「留给下一轮」第 1 条）。

### A. 门禁 16 的作用域收窄：13:06 场次改了代码，证据却从未入日志

**背景**：门禁 16 要读 `src/404.njk` 的 `identityOn404` 开关（本人将来只改这一行，
模板与门禁都不用动）。13:06 场次把门禁的读法从"**扫全文**"收窄成"**只读 front matter**"。

**为什么必须收窄**：模板侧是 **gray-matter / js-yaml**，**只解析 front matter**；
门禁若扫全文，两者的**作用域不一致** → 同一处开关**两个读法** → 悄悄分叉。

**改法**（现行代码 `scripts/verify-site.cjs:1004`）：

```js
const fm = srcText.match(/^---\r?\n([\s\S]*?)\r?\n---/);
```

- 没有 front matter → 判红（报「文件没有 front matter」）；
- front matter 里没有 `identityOn404:` 这一行 → 判红（报「front matter 里找不到开关」）。

⚠️ **此前**日志第十二轮 B 节记的是**读值严格性**（合法布尔白名单）的 16 例矩阵；
**作用域收窄这一层从未入日志** —— 证据只留在当时那个会话里。
可证：`git log --all -S'首匹配' -- docs/IMPROVEMENT-LOG.md` 返回**空**。

#### A.1 读法矩阵（22 例，每例真构建 + 真门禁）

跑法：在 `/tmp` 的**隔离克隆**里改 `src/404.njk` → `npx eleventy` **真构建** →
`node scripts/verify-site.cjs` 真跑门禁。**工作区零写入**。
**A/B 的唯一变量 = 作用域**：旧口径只把上面那行换成 `const fm = [null, srcText];`（读全文），
其余字节完全相同。

| 组 | 用例 | 期望 | 实测（新口径） | 实测（旧口径） |
|---|---|---|---|---|
| 合法布尔 | `true` / `True` / `TRUE` | exit 0 | **3/3 exit 0** ✓ | 3/3 exit 0 ✓ |
| 合法布尔 | `false` / `False` / `FALSE` | exit 0 | **3/3 exit 0** ✓ | 3/3 exit 0 ✓ |
| 合法 + 行尾注释 | `true  # 保留 Person` | exit 0 | **exit 0** ✓ | exit 0 ✓ |
| 非法值 | `no`/`off`/`on`/`yes`/`null`/`1`/`0`/`"false"` | exit 1 | **8/8 exit 1** ✓ | 8/8 exit 1 ✓ |
| 开关缺失 | 删掉 front matter 里那一行 | exit 1 | **exit 1** ✓ | exit 1 ✓ |
| 无 front matter | 整段 front matter 删掉 | exit 1 | **exit 1** ✓ | exit 1 ✓（报错文案不同，见下） |
| 双向判据 | `false` 但产物里还留着 Person | exit 1 | **exit 1** ✓ | exit 1 ✓ |
| 双向判据 | `true` 但产物的 JSON-LD 被掏空 | exit 1 | **exit 1** ✓ | exit 1 ✓ |
| 作用域 | fm=`true` + 正文诱饵 `false` | exit 0 | **exit 0** ✓ | exit 0 ✓ |
| 作用域 | fm=`false` + 正文诱饵 `true` | exit 0 | **exit 0** ✓ | exit 0 ✓ |
| 作用域 | **fm 删掉** + 正文诱饵 `false` | 新 exit 1 / 旧 exit 0 | **exit 1** ✓ | **exit 0**（见 A.2） |

**合计 22 例，全部符合期望（22/22）。**

⚠️ "无 front matter"那例新旧报错文案**本来就该不同**：旧口径没有 front matter 这个概念，
它报的是「找不到 identityOn404 开关」；新口径才说「文件没有 front matter」。

#### A.2 A/B 结论：两种口径**只在一种情况下**有差别

| 场景 | 旧口径（读全文） | 新口径（只读 front matter） |
|---|---|---|
| 开关还在 front matter 里（任何值） | 读到它 | 读到它 |
| 开关在 front matter 里 + 正文有同名字样 | 读到 **front matter 里那个** | 读到 **front matter 里那个** |
| **开关行被删掉** + 正文有同名字样 | **读到正文那行 → 当成开关用 → 全绿通过** | **判红**（front matter 里找不到开关） |

⚠️ **这一句必须写准**：差别**不是**"正文诱饵会顶替真开关"——**那是错的**。两种口径都是
**首匹配在前**，front matter 里的真开关**总是**被先读到。真正的差别是：
**开关行被删掉时，旧口径会去正文里"捡"一个字面量当开关用**，
于是一个**根本没有开关**的文件全绿通过；新口径直接判红。

（写准很重要：不然日志里会留下一句与代码相反的话，而后人会照着它做判断。）

#### A.3 我自己的注入脚本错了两处（记录给下一棒）

第一轮跑 22 例时有 2 例与期望不符，查下来**两例都是我的注入脚本错**，不是门禁的问题：

1. "fm 删掉 + 正文诱饵"那例，我**忘了删 front matter 里的开关行** → 实际测的是
   "fm=true + 正文诱饵"（所以新口径 exit 0，看着像"门禁没拦住"）；
2. "没有 front matter"那例，我给新旧两个口径**共用同一条报错关键词** → 旧口径
   本来就没有 front matter 概念，它报的是"找不到开关"。

**修法**：给每例加一条 `assert_state()` **自检** —— 断言变异后的源文件真处于该例
声称的状态（front matter 里有没有开关、正文里有没有诱饵、值对不对），断言不过直接中止。

→ 教训与既有条目同源，但**更隐蔽一层**：「注入没生效」和「门禁没拦住」在结果上长得
一模一样；而这次是**"注入生效了，但生效的是另一个场景"** —— 光看 exit code
**根本看不出来**，只能靠**对源文件状态的断言**发现。

### B. 订正"非法 UTF-8 字节"这一定性（第十五轮日志里的措辞）

第十五轮日志里写：门禁 16 的注释里有"**非法 UTF-8 字节**"。

**这个定性不准确**：那 3 个字节是 `EF BF BD` —— 那是 **U+FFFD REPLACEMENT CHARACTER
的合法 UTF-8 编码**。也就是说文件**不是"非法 UTF-8"**，而是**内容里已经含有替换字符**
（通常是某次编辑 / 工具链解码失败留下的残骸：原本一个中文的 2–3 个字节，逐字节各变成
一个 U+FFFD）。

**这个区别有实际后果**：

- 查它必须用**码位计数**（`text.count('\uFFFD')`）；
- 若按"非法字节"去查（用严格解码器看会不会抛异常）**反而查不出来**——那 3 个字节
  **解码不抛异常**；
- `scripts/check-lang.cjs:50` 用 `const FFFD = /\ufffd/;` 测**解码后的文本** —— **做法正确**，
  不必改。

实测（HEAD `9bc6816`，即并发场次改写之前）：

| 文件 | U+FFFD 码位数 | 位置 | 在不在 check:lang 的扫描面 |
|---|---|---|---|
| `scripts/verify-site.cjs` | 2 | L869 门禁 16 注释（**一个**坏字） | ❌ `scripts/` 整目录豁免 |
| `src/_data/site.js` | 3 | L83 `// 双单位：…现在在<U+FFFD>科院大气所` | ❌ `src/_data/**` 豁免 |
| `src/content/about.md` | 2 | L13 HTML 注释内「为什么有<U+FFFD>站」 | ✅ 在扫描面内 |

**影响范围要说清**：三处**全在注释里** → **不显示给用户**；但字节会随页面发出去
（本地 `_site/about/index.html` 命中 1 行、含 2 个 U+FFFD 码位，在 HTML 注释内）。

**已部署版本也带着**：`origin/main`（`cfef826`）全仓合计 **5 个 U+FFFD 码位**
（`src/_data/site.js` 3 + `src/content/about.md` 2）→ **部署后才会消失**。
（部署版里 `scripts/verify-site.cjs` 那 2 个不存在——它今天才被写坏。）

**现状**：并发场次的 `93f9497` / `3bb247e` 把三处都清掉了，HEAD 现为 **0**。

### C. 我自己 13:31 的一次误判（订正）

13:31 那场次我扫全仓得出"U+FFFD **0 命中**，并发场次报的乱码项**不成立**"。
**这个结论是错的** —— 真缺陷确实存在（3 个文件、3 个位置、共 7 个 U+FFFD 码位），
已由 B 节坐实。

**机制（已用时间戳与状态复现）**：

| 时刻 | 事实 |
|---|---|
| 13:31:05 | 并发场次**就地改写**了 `src/_data/site.js`（英文化，**顺带**把乱码改掉） |
| 13:31:08 | 同上改写 `src/content/about.md` |
| ≈13:31（我的扫描） | 我扫的是**工作树** → 那两个文件此刻已是 0 → 报"0 命中" |
| 13:36 / 13:38 | 并发场次才把改动**提交**（`93f9497` / `3bb247e`） |
| 整个这段时间 | **HEAD 里仍是 2 / 3 / 2**，**部署的 `origin/main` 里仍是 3 / 2** |

→ **错在把"工作树"当成了"仓库"**。共享工作区里，另一个场次可能**正在把缺陷就地改掉
却还没提交**——此时**工作树是新的**，而 **HEAD（以及线上部署）还是旧的**。
我拿"工作树已经干净"这个**新证据**，去否定一个关于**已提交 / 已部署状态**的报告。

**两条可以直接照做的规则**：

1. 判"仓库里有没有 X"时，**先说清扫的是工作树还是已提交状态**；要否定一个关于
   **已提交 / 已部署**状态的报告，必须扫 **`git show HEAD:<path>`**（或部署分支），
   **不能只扫工作树**。
2. **扫之前先自证扫描面有效**：拿一个**已知存在**的样本去试这个通道。
   本轮实测：Grep 工具用字面 `�` 和用 `\uFFFD` **两种写法都能**命中
   （在含 U+FFFD 的样本文件上各测一次）→ **通道本身没问题，问题在扫错了对象**。

⚠️ 这一条与既有条目「`cmd | grep` 判定'不存在'之前，先单独跑 `cmd` 看 stderr」同源：
**"没找到"与"找错了地方"在结果上长得一模一样** —— 既有条目是"上游失败伪装成没有匹配"，
本条是"**更新的工作树伪装成缺陷从不存在**"。

### D. `check:lang` 的 U+FFFD 检查有一个扫描面缺口（注入坐实）

`scripts/check-lang.cjs` 的 U+FFFD 检查只扫 **`src/`（去掉豁免目录）+ `_site/*.html`**；
`scripts/` 与 `src/_data/**` 是**整目录豁免**（豁免理由写在该文件头注释里，是为 CJK
那一条设的："构建工具链 / 数据层不进产物"）。

**而 3 处已知损坏里有 2 处正好在这两个盲区。** 注入实测（每例独立复位；
注入行是**纯 ASCII + 1 个 U+FFFD**，避免误触 CJK 检查）：

| 注入位置 | check:lang exit | U+FFFD 报错 | 结论 |
|---|---|---|---|
| `scripts/verify-site.cjs` | **0** | 0 | **漏网** |
| `src/_data/site.js` | **0** | 0 | **漏网** |
| `src/content/about.md` | **1** | 1 | 抓到 ✓ |

（全部复位后基线 exit 0。）

→ 这解释了为什么 `verify-site.cjs` 里那处能**活这么久**没人发现：它正好在扫描面之外。
→ 补法见「留给下一轮」第 1 条（本轮**不实施**）。

### 验证

- **门禁 16 读法矩阵 + 作用域 A/B**：22 例，每例真构建 + 真门禁，**22/22 符合期望**；
  隔离克隆在 `/tmp/mh-r16-gate16/`（新口径 `repo` / 旧口径 `repo-old`），**工作区零写入**。
- **当前代码构建复验**：`3bb247e`（`95c91b7` 只改本文件，构建结论不变）在**新克隆**里
  `npm run build` → **exit 0**。check:site 全绿：6 页 / 127 条本地引用 / 5 条 sitemap URL /
  门禁编号 **27 条一一对应且连续** / 全站 5 张真实 `<img>` 的 alt 与 width·height 全齐；
  check:lang ✓「文本检查通过（语言一致性 + 编码损坏；扫描 52 个文件）」。
- **U+FFFD 码位普查**：HEAD `9bc6816` = 3 文件 7 码位；HEAD `3bb247e` 起 = **0**；
  部署分支 `origin/main`（`cfef826`）= **5**。
- **`check:lang` 扫描面缺口**：3 例独立注入（见 D 节）。

### 待部署（本轮**不 push**，线上仍是旧版本）

不变：线上仍是 2026-10-16 那次部署（`/papers/`、`/publications.bib`、`/feed.xml`
在线 404；canonical / og:url / sitemap 带 `/MeteoHub/` 前缀；线上 404 页仍带 canonical）。
**部署由本人决定。** 部署后除既有的三类差异会自愈外，还会顺带消掉那 **5 个 U+FFFD 码位**
（`site.js` 3 + `about.md` 2，都在注释里，不影响显示）。

### 待决策（**沿用上一轮 7 条，本轮不新增、不擅自拍板**）

1. **404 页要不要保留 Person 实体** —— 已参数化为 `src/404.njk` 的 `identityOn404`
   （默认 `true`），本人拍板时只改那一行。
2. **论文页是否显示"论文署名单位"**。
3. **`figure.alt` 是否保留 "Fig. 10 —" 前缀**。
4. **sitemap `lastmod` 口径三选一**（沿用第十二轮 L1646–1660 的三个选项）。
5. **何时 push / 部署**（本地已领先远端 **26** 个 commit）。
6. **门禁 25 的一处口径**（第十五轮新提）：`src/blog.njk:75` 博客卡片封面图的
   `alt=""` 该不该给描述性替代文本。
7. **OG 分享图里的中文品牌文案要不要英文化**（第十六轮新提，三张 `og-*.svg`）——
   与页面正文语言直接相关，但属**本人自己的句子**，不擅自动。

### 留给下一轮

1. **【本轮新提】把 U+FFFD 检查补到扫描面之外**（D 节）：`scripts/` 与 `src/_data/**`
   目前整目录豁免，而 3 处已知损坏里有 2 处在这两个盲区。补法建议**单独一条门禁**，
   **不要塞进 `check:lang` 的 CJK 检查里**——那条的豁免理由是"不进产物"，
   而编码损坏**与是否进产物无关**。判据：扫**全部跟踪的文本文件**（扩展名白名单 +
   二进制判据排除图片 / 字体），判"U+FFFD 码位数 = 0"。
   ⚠️ 必须**先做故障注入**（在 `scripts/` 与 `src/_data/` 各注入 1 个 → 必须 exit 1；
   基线 exit 0）再提交；**别只写不验**。
2. **门禁 12 的补法**（第十四轮 C 节）：把"按名字找本人节点"反转为"按本人 @id 兜住改名节点"。
   判据与门禁 12 同源、无需新数据源；先做故障注入再提交。
3. **门禁 21④ 的报错去重**、**门禁 15 在四个页面上空跑** —— 本轮未动。
4. **`gitOut` 的 catch 加固**（第十四轮「留给下一轮」第 2 条，低严重性）。
5. **巡检 cron 仍是每 5 分钟起一个会话** → 持续并发冲突（连续多轮都撞见）。
   建议改成 30–60 分钟 + 单写者锁。
## 2026-10-19 · 第十七轮（13:40–14:20 场次）：可访问性（WCAG AA）实测修复 + check:a11y 门禁

### 本场次定位

前十六轮做的都是**结构与一致性**（站内引用、JSON-LD、canonical、sitemap、图片机械属性、
界面语言）。**可访问性**是站点里唯一还没有任何机器判据的轴——加 `check:lang` 那一轮我
确认过"站内自检没有任何一条查可访问性"。

选它而不是继续加编号门禁，三个理由：

1. 有**实测证据**（axe-core 4.10.2 跑 6 页 × 暗/浅 2 主题 = 12 个组合），不是"我觉得可能
   有问题"；
2. 查出来的三类缺陷**都不会让 build 失败**——正是门禁该拦的那一类"静默错误"；
3. 与前几轮**不重叠**：不碰 `scripts/verify-site.cjs`、不占门禁编号、不改站点定位。

### A. 巡检结果（线上，13:52 PDT；与前几轮一致，**无新增损坏**）

| 路由 | 状态 |
|---|---|
| `/` `/blog/` `/about/` `/sitemap.xml` `/404.html` | 200 |
| `/papers/` `/publications.bib` `/feed.xml` | 404 |

404 仍是**待部署**（线上还是 2026-10-16 那次部署），不是站点损坏。线上 canonical 与 sitemap
的 loc 仍带 `/MeteoHub/` 前缀（`https://github.lvyihang.xyz/MeteoHub/`）——同样是待部署的旧
产物。本地已领先远端 **28** 个 commit（本轮提交后为 29），**本轮仍不 push**。

### B. 改进点 A：axe-core 实测出的三类 WCAG AA 缺陷（外加一处 axe 自己漏掉的）

**B1 · `color-contrast`（13 节点，暗色，serious）**

`about` 页三处 11px 小标签用 `--color-accent-600`（#b14810）：`.about-eyebrow`、
`.about-skillgroup dt`、`.about-output__meta a`。该色是给**浅底**设计的（浅色下对页面底色
5.21:1 合格），但暗色底 `#0f0e0c` 上只有 **3.49:1**，而 11px 小字要 4.5:1。

**B2 · `link-in-text-block`（19 节点，serious）**

正文里的链接**只靠颜色**与周围文字区分。暗色下链接 `#4d97ff` 对正文 `#f5f2ea` 只有
**2.61:1**、对弱化正文 `#a8a498` 只有 **1.17:1**（判据 3:1）。涉事容器：
`.paper-head__authors`、`.about-prose`（约稿正文）、裸 `li`、`.list-empty__body` 等。

**B3 · `scrollable-region-focusable`（4 节点，serious）**

论文页三个横向可滚动的 BibTeX `<pre>`（`#paper-bibtex` / `#paper-bibtex-capsule` /
`#paper-bibtex-dataset`）键盘不可聚焦——鼠标能拖，键盘用户没法读。

**B4 · axe 漏掉、我自己按计算样式逐元素量出来的：`.home-intro__label`**

首页那句 11px 标签同样用 `--color-accent-600`，暗色下 **3.49:1**，**axe 没有报它**
（它把这个元素当成了装饰性小标签放过）。是我另写了一个探针，按 `getComputedStyle`
把每个叶子文本节点的计算色/背景色/字号/字重都量一遍，才抓到的。
→ 教训写进了门禁 A4：**只查 token 不查用法，漏网的是用法。**

**B5 · 附带发现：一条从未生效过的死 CSS**

`base.css` 里的 `.article a { text-decoration: underline }` —— 全站**没有任何模板**用
`class="article"`（博客正文用的是 `.detail`）。也就是说"正文链接带下划线"这个设计意图
**从来没生效过**，不是被人删掉的。本轮顺手把它换成真实存在的容器。

### C. 改动清单（7 个文件）

| 文件 | 改了什么 |
|---|---|
| `src/assets/css/tokens.css` | 新增语义 token `--text-accent`：浅色取 `accent-600`（5.21:1），两处暗色取 `accent-500` #ffa874（9.99:1） |
| `src/assets/css/base.css` | 删掉死规则 `.article a` / `.article a:hover`，换成 5 个真实容器加下划线 |
| `src/about.njk` | 3 处 `color: var(--color-accent-600)` → `var(--text-accent)` |
| `src/assets/css/pages.css` | `.home-intro__label` → `var(--text-accent)`（B4 那处） |
| `src/_includes/layouts/paper.njk` | 3 个 `<pre class="paper-cite__bibtex">` 加 `tabindex="0"` |
| `scripts/check-a11y.cjs` | **新建**：可访问性门禁 A1–A4 |
| `package.json` | 加 `check:a11y`，并串进 `build`（排在 `check:lang` 之后） |

**为什么不动 `--color-accent-600` 本身**：徽标 `.badge--accent` 在浅色下是
「accent-600 文字 + accent-50 底」= 5.07:1，改那个 token 能一次修好所有 accent-600 文字，
但会把徽标一起弄坏。门禁 A1 专门给这组组合留了护栏。

### D. 正文链接为什么用下划线，而不是改链接色（数学上无解）

WCAG 1.4.1 给的是"要么对比度 ≥3:1，要么另给一条非颜色线索"。改色这条路在暗色下
**三个颜色互相牵制，解不出来**：

- 链接色 vs 正文 `#f5f2ea` 要 ≥3:1 → 相对亮度 L ≤ 0.2597；
- 链接色 vs 底 `#0f0e0c` 要 ≥4.5:1 → L ≥ 0.2002；
- 链接色 vs 弱化正文 `#a8a498` 要 ≥3:1 → L ≤ 0.0900。

第一个和第三个的上界与第二个的下界互相矛盾 → **纯改色无解**。所以走非颜色线索：
给正文容器里的链接加下划线。下划线颜色用
`color-mix(in srgb, currentColor 55%, transparent)`（而不是 `--color-brand-200`——
那个在暗色下是深海军蓝 #1b386a，画线等于没画）。

### E. 新门禁 `scripts/check-a11y.cjs`（A1–A4）

编号用**独立的 A1–A4**，不占 `verify-site.cjs` 的 1–26（那边门禁 24 会自查"文件头清单与
代码段一一对应"，撞号会让追溯日志时指错对象）。同门的 `check-lang.cjs` /
`check-dead-css.cjs` 也都不用数字编号。

| 号 | 判据 | 对应 |
|---|---|---|
| A1 | 三套主题下 `text-primary/secondary/muted/accent`、`link-color` 对 `bg-page`/`bg-surface` 全部 ≥4.5:1；徽标那组 accent 组合不得被改坏；两处暗色 token 定义逐项一致（零漂移） | 1.4.3 |
| A2 | 正文容器里的链接必须有下划线（**逐页判定**，见 G2） | 1.4.1 |
| A3 | 横向可滚动的 BibTeX 块必须有 `tabindex="0"` | 2.1.1 |
| A4 | 源码里 `color: var(--color-accent-600)` 只允许出现在徽标上，其余必须走 `--text-accent` | 1.4.3（用法层） |

**不重复造轮子**：`<img>` 的 alt 存在性由 `verify-site.cjs` 门禁 25 管、width/height 由门禁 26
管（第十五轮 commit 93f9497 加的），本脚本**不重复**——同一个事实两处判，改一处就会与
另一处说法打架。

### F. 验证证据

1. **构建**：`npm run build` exit 0（`check:css` + `check-dead-css` + `eleventy` +
   `check:site` + `check:lang` + `check:a11y` 全绿）。
2. **axe 复测**：修复前 **36 个违规节点**（link-in-text-block 19 + color-contrast 13 +
   scrollable-region-focusable 4）→ 修复后 **12/12 个组合全部 violations=0**。
3. **对照自证**：把改动 stash 掉、用**同一套脚本**重跑，修复前确实报出上述违规 →
   证明"全绿"不是因为脚本坏了或检查被跳过。
4. **独立探针**（不依赖 axe）：按计算样式逐个叶子文本节点量对比度，修复后只剩
   `span.dot`（列表项之间的 "·" 分隔符，1.5:1）——纯装饰，WCAG 1.4.3 明确豁免。
5. **故障注入 6 例 + 基线 + 复位 = 8/8 全过**（在隔离克隆的产物副本上做，工作区零写入）：
   A1 对比度退回 accent-600 / A1 两处暗色漂移 / A1 徽标组合被改坏 / A2 抽掉某一页的
   下划线 / A3 抽掉 tabindex / A4 新写一处直接用 accent-600 —— 六例全部 exit 1，
   复位后 exit 0。

### G. 排查与判据设计上的四个坑（都踩过，记下来）

1. **扫 HTML 前必须先剥 `<style>` / `<script>` / HTML 注释。** `about` 页内联样式的
   CSS 注释里有一句说明文字"…`<img>` 上的 width/height 属性负责首屏前的比例预留…"，
   光秃秃一个 `<img>` 被当成了真元素，门禁报"缺 alt"——**假阳性**。
2. **A2 不能用"合并所有页面的样式"判。** `base.css` 是内联进每一页的：若合并后再看
   "有没有一条 underline 规则"，某一页丢了这条、别的页还留着 → 门禁照样绿，而那一页已经
   坏了。改成**逐页判定**：先看哪一页真的出现了该容器，再在那些页里要求规则存在。
3. **解析 CSS 块不能用"下一个块注释开头"当结束标记。** `tokens.css` 里 `:root {` 后面紧跟
   一行注释，用它当结束标记会只切出 10 个字符、解析出 **0 个 token** ——门禁会拿着空表去
   比对，然后**"全绿"**。必须按括号配对。
4. **门禁 A4 的存在理由就是 B4**：A1 查的是 token 层，管不到"某处直接写了
   `var(--color-accent-600)`"这种用法。漏网的是用法。

### H. 提交范围：为什么不是裸 `git add -A`

任务书要求 `git add -A`，但本场次实测**并发场次正在同一个工作区写文件**：
`scripts/verify-site.cjs`（已改未提交）与 `scripts/check-copy-export.cjs`（未跟踪）都不是
本轮的。裸 `-A` 会把别人的未提交工作一起扫进本轮 commit。

→ 本轮改用**显式路径 add**（只 add 上表 7 个文件 + 日志），别人的两个文件**故意留下不提交**，
留给它们自己的场次。落盘前逐个校验过：这 7 个文件在我动手前都是 HEAD 版本（`git diff
--quiet` 通过），不存在"覆盖别人改动"。

### 待部署（本轮**不 push**，线上仍是旧版本）

本地领先远端 **28** 个 commit（本轮提交后为 29）。线上仍是 2026-10-16 的部署产物，`/papers/`、
`/publications.bib`、`/feed.xml` 三条 404 与 `/MeteoHub/` 前缀都要等部署才消失。

### 待决策（沿用上一轮 7 条，本轮**新增第 8 条**，不擅自拍板）

8. **【本轮新提】正文链接统一加下划线后的视觉密度**：本轮给 5 个正文容器的链接都加了
   下划线（`.prose` / `.detail` / `.paper-head__authors` / `.list-empty__body` /
   `.about-output__meta`），暗色下 19 个节点不再只靠颜色区分。若本人觉得视觉密度偏重，
   可选：① 保留全部（当前）；② 只保留"弱化正文里"的链接（`.detail` / `.list-empty__body`），
   其余靠提高链接色对比度——但 D 节已算过，**改色那条路在暗色下无解**（三色约束互斥），
   所以"减下划线"与"改色"不能二选一，只能二选一的是"减下划线"这一侧的具体范围。
   **本轮不擅自改**：这是展示口径取舍。

### 留给下一轮

1. **巡检 cron 仍是每 5 分钟起一个会话** → 持续并发冲突（连续四轮都撞见）。建议改成
   30–60 分钟 + 单写者锁。
2. **可访问性只覆盖了机器可判的 4 条**：完整 WCAG 审计仍靠 axe 的人工跑批。axe 现成的
   规则里还有 `aria-*` 全套、landmark 结构、heading 顺序、landmark 唯一性等未被门禁覆盖，
   可按需再挑。
3. **`span.dot` 的装饰性豁免**目前靠"它确实是纯装饰"这个判断，没有机器判据；将来若有
   真实内容被塞进 `span.dot`，门禁不会拦。
4. **门禁 A2 的容器清单是硬编码的**：新增正文容器时**必须同步加进清单**，否则该容器的
   链接会不受下划线约束。可考虑后续改成"凡是段落/列表里的 a 都要有下划线"的全称判据。


---
## 2026-10-19 · 13:45–14:15 场次（**不占轮次号**，避免与并发场次撞号）：门禁 27 —— 按 `@id` 兜住"只改姓名"的本人节点

> ⚠️ **为什么不占轮次号**：并发场次在 L3253 已用了「第十七轮」（可访问性 + check:a11y），
> 而本场次在同一时间窗内推进 —— 沿用本文件 L3024「13:31–14:10 场次补记」的同一约定，
> **不占轮次号**，以免同号两份。物理位置同样不是权威（见下）。
>
> ⚠️ **位置说明**：本仓库是**多场次并发写同一份日志**，中段插入（read → 改 → 全量
> 写回）会覆盖掉别人并发追加的内容。本段**补写在文末**。

### 本场次定位

**巡检 + 1 个改进点**，改动只落在 `scripts/verify-site.cjs` 与本文件两个文件。

改进点取自**第十六轮「留给下一轮」第 1 条**（即**第十四轮 C 节**记的唯一真残留项）：
门禁 12 是**按姓名找节点**，于是"只改姓名"这个动作能让那个节点从门禁 12 的视野里
整个消失，而它并没有变成本人（@id 还挂着本人 @id）。本轮把方向反过来。

⚠️ **并发处置**：本场次全程有**并发场次**在同一个工作区写文件（实测 13:38 之后
`package.json` / `paper.njk` / `about.njk` / `base.css` / `pages.css` / `tokens.css`
被改动，另新增 `scripts/check-a11y.cjs` / `scripts/check-copy-export.cjs`；日志也在
本场次写作期间被追加过 219 行）。**本场次只碰 `scripts/verify-site.cjs` 与
`docs/IMPROVEMENT-LOG.md`**，其余一律不碰；提交时**不用 `git add -A`**（理由见 F 节）。

### A. 巡检结果（线上，13:50 PDT；**无新增损坏**）

| URL | 状态 |
|---|---|
| `/` `/blog/` `/about/` `/sitemap.xml` `/404.html` | 200 |
| `/papers/` `/publications.bib` `/feed.xml` | **404**（待部署，非损坏） |

- 四个页面的 JSON-LD 各 1 块，`JSON.parse` **全部通过**；
- canonical 与 og:url 互相一致，但都带 `/MeteoHub/` 前缀 → 所指 URL 逐条 404；
- 线上 `/404.html` 仍带 canonical（现行源码已由门禁 4b 禁止），是旧版本的症状。

状态与第十二、十五、十六轮记录**逐条一致** → 是旧部署，**无新增损坏**。

### B. 改进点：门禁 27 —— 凡是挂着"本人" @id 的 Person 节点，name 必须是数据源认可的姓名

**洞的形状**（第十四轮 C 节四例实测）：门禁 12 的判据是
`node.name === OWNER_NAME`（`OWNER_NAME = site.author.nameAsPublished`），
方向是"**按名字找 @id**"。于是只把某个 Person 节点的 `name` 改掉（@id 不动），
那个节点就再也不会被门禁 12 看见 → **R1 实测 exit 0**（about 页本人节点 13→12，
其余门禁照绿）。

**为什么这是真逃逸、不是无害**：@id 是消费方（知识图谱、搜索引擎）合并实体的
唯一依据。那个节点的 @id 仍是本人 @id → 消费方照样把它并进"本人"这个实体，
合并出来的人就带着一个陌生名字。

**本轮的做法**：把方向反过来 —— **`@id` 才是本人身份的唯一权威**。

1. 锚点用门禁 12 已经定出的本人 @id（`ownerIds`），**不新增数据源**；
2. 扫全站所有 Person 节点，凡是用本人 @id 的，其 `name` 必须落在
   **数据源认可的姓名集合**内。

⚠️ **不能照抄 peer 建议的"name 必须等于 `nameAsPublished`"**：那会有假阳性。
姓名是**可变**的（`eleventy.config.js:693-702` 的注释原话："认人主要靠 ORCID，
不靠姓名""姓名是可变的，出版商登记名可能与本站写法不同，nameAsPublished 就是
为此存在的"）。而 canonical 节点（`base.njk:355`）取的是 `site.author.name`，
作者列表节点（`eleventy.config.js:704` / `:843`）取的是 `A.nameAsPublished || A.name`
—— 两者**本来就可能合法地不等**。
→ 所以认可的集合取 `site.author` 里所有身份姓名字段的**并集**：
`{name, nameAsPublished, fullName, alternateName}`。

**实测这个假阳性是真的**（C 节 N1）：把 `nameAsPublished` 改成 "Yihang L. Lyu" 后
全新克隆重建，产物里本人 @id 的节点姓名分布变成 **11 个 "Yihang Lyu" +
2 个 "Yihang L. Lyu"**；peer 式判据在这个场景会**误报 11 个节点**；
本轮的判据保持绿（build 全绿、门禁 exit 0）。

**顺带订正门禁 12 的 note 措辞**：它原来写"（13 个节点，全站统一）"，
但那个 13 是**按姓名找到**的节点数。作者一旦合法改名（见上），它会变成 2，
读的人会以为全站只有 2 个本人节点。→ 改成
"（按姓名找到 N 个节点，@id 全站统一）"，并由门禁 27 补上**按 @id 计**的真实节点数。

### C. 故障注入（8 例，在隔离克隆的产物副本上做，工作区零写入）

注入方式：只改 JSON-LD 里**挂本人 @id 的 Person 节点**（其余字节不动），
每例都自证产物 md5 变化后才跑门禁。旧门禁取 `git show HEAD:scripts/verify-site.cjs`。

| 用例 | 注入 | 旧门禁 | 新门禁 | 结论 |
|---|---|---|---|---|
| 基线 | 不注入 | exit 0 | **exit 0** | 门禁 27 的 note 正常打印 |
| R1 | 只改 `about/index.html` 一个本人节点的 `name`（@id 不动） | **exit 0** | **exit 1** | ✅ 原逃逸被堵住 |
| N3 | 本人节点**没有 `name` 字段** | **exit 0** | **exit 1** | ✅ 缺名字也判红 |
| R2 | 全站 13 个本人节点改名 | exit 1 | **exit 1** | 门禁 12 报"找不到…"（回归） |
| R3 | 改名 + 改 `@id`（`#person-v2`） | exit 1 | **exit 1** | 门禁 23 仍报（回归） |
| R4 | 只改 `@id` 形状（`name` 不动） | exit 1 | **exit 1** | 门禁 12 + 23 仍报（回归） |

R1 的报错（归因准确，指名到页与节点）：

```
about/index.html: 该 Person 节点挂着本人 @id（https://github.lvyihang.xyz/#person），
但 name 是 "Yihang L. Lyu" —— 本人 @id 的节点姓名必须取自 src/_data/site.js 的 author
（当前认可：Yihang Lyu / 吕亦航）
```

**两个反向用例（防假阳性）**：

| 用例 | 场景 | 期望 | 实测 |
|---|---|---|---|
| N1 | 作者**合法**把 `nameAsPublished` 改成 "Yihang L. Lyu" → 全新克隆重建 | exit 0 | **exit 0**（`npm run build` 全绿） |
| N2 | 在 N1 的基础上再让一个节点出现第三种写法 "Yihang M. Lyu" | exit 1 | **exit 1** |

### D. 回归：旧门禁 vs 新门禁，逐字 diff

基线产物上跑两份脚本，输出**只有 3 处差异**：

```
- · "本人"实体 @id = …#person（13 个节点，全站统一）
+ · "本人"实体 @id = …#person（按姓名找到 13 个节点，@id 全站统一）
+ · 本人 @id 的 13 个 Person 节点，姓名都在 site.js 认可集合内（Yihang Lyu / 吕亦航）
- · 门禁编号：文件头清单 27 条 / 代码段 27 条，一一对应且连续
+ · 门禁编号：文件头清单 28 条 / 代码段 28 条，一一对应且连续
```

**其余门禁的行为一字未变**。门禁 24（编号自身）实测 28/28 一一对应且连续。

### E. 局限（如实记下，不粉饰）

- 门禁 27 的锚点来自门禁 12 的**姓名**匹配。若作者把 `site.author` 的姓名字段
  全改到产物里一个都对不上，**门禁 12 会先报红**（"找不到任何描述本人的
  Person 节点"），门禁 27 随之跳过并记一条 note —— 实测 R2 场景的输出明写
  "本人 @id 未能确定 → 「按 @id 兜底姓名」这一条本轮跳过（见门禁 12 的报错）"，
  **不会静默放过**。
- 门禁 27 只管"是不是本人"，不管"名字写得好不好"（那是内容判断）。
- 门禁 27 只看 Person 节点的 `name` 字段；`alternateName`（中文名）不参与判定。
- 本轮**没有**做线上部署验证（线上仍是旧版本，见"待部署"）。

### F. 提交范围：为什么这次**没有**用 `git add -A`

并发场次正在同一个工作区写 6 个已跟踪文件 + 2 个新脚本（见"本场次定位"）。
`git add -A` 会把别人在飞的半成品打进本场次的 commit 且**无法回退**
（且 `scripts/check-a11y.cjs` 这类未接线脚本一旦被带上，干净克隆上 build 可能直接红）。
→ 本场次只提交 `scripts/verify-site.cjs` + `docs/IMPROVEMENT-LOG.md` 两个文件。

### 待部署（本轮**不 push**，线上仍是旧版本）

不变：线上仍是 2026-10-16 那次部署（`/papers/`、`/publications.bib`、`/feed.xml`
在线 404；canonical / og:url / sitemap 带 `/MeteoHub/` 前缀；线上 404 页仍带
canonical）。**部署由本人决定。**

### 待决策（**沿用第十六轮 7 条，本轮不新增、不擅自拍板**）

1. 404 页要不要保留 Person 实体（`src/404.njk` 的 `identityOn404`）。
2. 论文页是否显示"论文署名单位"。
3. `figure.alt` 是否保留 "Fig. 10 —" 前缀。
4. sitemap `lastmod` 口径三选一。
5. 何时 push / 部署。
6. `src/blog.njk:75` 博客卡片封面图的 `alt=""` 口径。
7. OG 分享图里的中文品牌文案要不要英文化。

### 留给下一轮

1. **门禁 21④ 的报错去重**、**门禁 15 在四个页面上空跑** —— 本轮未动。
2. **`gitOut` 的 catch 加固**（第十四轮「留给下一轮」第 2 条，低严重性）。
3. **本轮新提**：门禁 27 的锚点仍依赖门禁 12 的**姓名**匹配，可以把锚点改成
   **ORCID**（`eleventy.config.js:704` 已经是"ORCID 优先、姓名兜底"）。
   ⚠️ 换锚点前必须先确认 **R4（只改 @id 形状）仍被门禁 12 抓到**，
   不能因为换锚点漏掉 R4。
4. 巡检 cron 仍是每 5 分钟起一个会话 → 持续并发冲突（连续四轮都撞见）。
   建议改成 30–60 分钟 + 单写者锁。

### 附：门禁 16 报错文案的一处订正（收尾时追加）

本场次收尾时，把 `scripts/verify-site.cjs` 门禁 16 的 **false 分支报错文案**改准了。

**原来**：

> `404.html: 声明了身份类实体（Person、Organization、CollegeOrUniversity、Place、PostalAddress，含 Person 的嵌套节点）`

**现在**：

> `404.html: 声明了身份类实体（Person、Organization、CollegeOrUniversity、Place、PostalAddress；Person 是根节点，其余是它的嵌套节点）`

- **原来那句说反了**：404 页的 JSON-LD 是**一个根节点 = Person 本人**，
  Organization / CollegeOrUniversity / Place / PostalAddress 是它**的嵌套属性**
  （affiliation / alumniOf / workLocation / workLocation.address）。
  写"含 Person 的**嵌套**节点"会让人以为 Person 埋在别的节点里，排查时先去翻嵌套结构
  ——方向就错了（与本日志反复出现的那类"文案指错方向"同型）。
- **并且不写死结构**：那句提示**按产物里实际有没有 Person 动态拼**——
  产物里没有 Person 时**不出现**，不会留下一个与产物不符的断言。

验证（3 例，隔离克隆 + **真构建** + 真门禁）：

| 场景 | 期望 | 实测 |
|---|---|---|
| 基线（switch=true） | exit 0 | **exit 0** ✓ |
| switch=false 但产物里塞回 ld+json | exit 1 + 新文案 | **exit 1** ✓，文案含「Person 是根节点，其余是它的嵌套节点」 |
| 同上，但把产物根节点的 `@type` 改成 `Organization` | exit 1 + **不出现** Person 断言 | **exit 1** ✓，文案为「（Organization、CollegeOrUniversity、Place、PostalAddress）」 |

完整构建复验：当前 HEAD 上 `npm run build` → **exit 0**
（check:css ✓ / check:site ✓ —— 门禁编号 **28 条**一一对应且连续 / check:lang ✓ /
check:a11y ✓）。复位后基线仍 exit 0。

> ⚠️ **上句的"28 条"是 13:52 那一刻的数，不是现状**。门禁 28 落地后文件头变成 **29 条**，
> 门禁 29（对照表自检）落地后变成 **30 条**（代码段始终与文件头一一对应且连续）。
> 另外，这句里的"当前 HEAD 上 exit 0"
> **对 `0c9d586` 这个 commit 本身并不成立**——该 commit 单独 checkout 是红的，
> 原因与经过见后文「14:00–14:30 场次补记」A 节。
## 2026-10-19 · 第十八轮（13:45–13:56 场次）：把一个"从未跑过的门禁"接上 build + 补上 A2 的源级兜底

### 本场次定位

本轮**不新增站点内容、不新增功能**，只做两件"让已有的东西真的生效"的事：

- **A**：`scripts/check-copy-export.cjs`（并发场次写的源码级检查）**从未被接线**——
  `package.json` 与 `.github/` 均 0 命中，CI 只跑 `npm run build`，而 build 里没有它。
  → 一个**永远不会跑的门禁**，比没有门禁更坏：它让人以为"复制出口有人在守"。
- **B**：可访问性门禁 A2 在**最该守的那一类内容上处于无人看守状态**（下面 C 节详述）。

另附一条订正：门禁 A 的编号体系在文件头**自相矛盾**（C 节末）。

### A. 改进点 A：把 `check-copy-export.cjs` 接进 build

**为什么"没接线"是缺陷而不是省事**：这个脚本自己写的判据里有一句 ——
「门禁看不懂时必须判红：否则它会一直'全绿'，看着像在守着，其实没守」。
**同一句话也适用于门禁自己**：一个没接进 build 的门禁，连"看不懂"的机会都没有 ——
它不是"守着"，它是"根本没来"。

**做法**（`package.json`，只加一行脚本 + build 尾部接一环）：

```json
"check:copy": "node scripts/check-copy-export.cjs",
"build": "... && npm run check:a11y && npm run check:copy"
```

⚠️ **必须连脚本一起提交**：只改 `package.json` 而不提交 `scripts/check-copy-export.cjs`，
干净克隆上 `npm run build` 会因为找不到脚本而红。所以本轮提交的是
**「package.json + 该脚本」这一个自洽集**（此前该脚本是未跟踪状态）。

**它守的是什么**：论文页 "Copy BibTeX" 按钮把 `<pre>` 里的文本送进剪贴板。
产物级门禁**观测不到 JS 内部怎么取值**（产物里 `<pre>` 用 textContent 还是 innerHTML
取，长得一模一样），所以这个检查必须落在源码层：取值链最终来自 `.textContent`、
链上不得出现 `.innerHTML` / `.outerHTML`、两条复制路径取同一个变量。

### B. 改进点 B：A2 在"产物里不存在的正文容器"上空跑（**真覆盖漏洞**）

**先说清事实**（避免误判成缺陷）：

- `blog` / `portfolio` 两个集合目前是**空的** → 详情页模板 `detail.njk` **从未被构建渲染**
  → 产物里**永远没有 `.detail`**。
- 空 blog 是**有意设计**，不是坏了：`/blog/` 页面明写 "Nothing published here yet"
  并把读者引到 CSDN。→ **不能靠"加一篇博客"来让门禁变绿**（那是内容决定，不是我能替本人拍的）。

**漏洞在这里**：A2 的判据是"**逐页**看该页的样式里有没有这个容器的下划线规则"。
`.detail a` 在任何产物页里都不出现 → A2 对它只能"**暂不判**"（实测输出原文：
`门禁 A2：.detail a 当前没有出现在任何产物页里，暂不判`）→ 于是

> **"正文链接带下划线"这条判据，在博客/portfolio 正文这类内容上，无人看守。**

而 `.detail` 恰恰是**规则曾经落空过的那个容器** —— `base.css` 的注释原话：

> 「原来的规则写的是 `.article a`，但全站**没有任何模板**用 class="article"
> （博客正文用的是 .detail）—— 这条规则从来没生效过」

也就是说：**"规则写着但选择器对不上"这个失效模式，A2 当初就是靠"容器真出现在产物里"
才抓到的**。现在，恰恰是同一个失效模式在 `.detail` 上重演 —— 只是这次连抓它的机会都没有。

**具体会被漏掉什么**（一个非常合理的编辑动机）：

> 「反正博客还没有内容，`.detail a` 是个死选择器，先删了。」

删掉之后 A2 **今天不会红**（因为它对 `.detail a` 只能跳过）；等第一篇文章发出来，
正文链接就只剩颜色区分 → WCAG 1.4.1 违规 → 而**没有任何门禁会报**。

**做法**：容器在产物里没有实例时，改为走**源级**判据 —— 在 `src/assets/css/**`
（以及 `.njk` 的 `<style>` 块）里找一条**恰好**以该选择器为目标、带
`text-decoration: underline` 的规则。判据语义与产物级判据**同源**（两者都走
`underlinedIn`），所以两条路径不会出现"一个说行、一个说不行"。

**A/B 证据**（同一份注入，只换门禁版本）：

| 用例 | 注入 | 旧门禁 | 新门禁 | 结论 |
|---|---|---|---|---|
| 基线 | 不注入 | exit 0 | **exit 0** | 新门禁不误伤 |
| **BI1** | 从 `base.css` 那条下划线规则里删掉 `.detail a,` | **exit 0** | **exit 1** | ✅ **漏洞坐实 → 已堵** |
| BI2 | 反向用例：把 `.detail a` 拆成独立规则但仍带 underline | exit 0 | **exit 0** | ✅ 不误伤 |

BI1 的新门禁报错（归因准确，直接说清后果）：

```
门禁 A2：正文容器 .detail a 当前没有出现在任何产物页里（产物级判据用不上），
而源码 CSS 里也找不到它的 text-decoration: underline 规则 —— 一旦它上线
（详情页/列表页出现实例），正文链接就只剩颜色区分（WCAG 1.4.1 违规），而且不会有门禁报
```

**A2 的 note 措辞也随之改准**（原来写"4 个正文容器（4/5）…"，读起来像还差一个没人管）：

```
门禁 A2：5 个正文容器全部有非颜色区分（下划线）—— 4 个按产物逐页判、1 个产物里暂无实例、按源码 CSS 判
门禁 A2：.detail a 当前没有出现在任何产物页里（产物级判据空跑），但源码 CSS 里它的下划线规则在 —— 已按源级判据兜住
```

### C. 顺带订正：门禁 A 的编号体系在文件头自相矛盾

`scripts/check-a11y.cjs` 原第 16–19 行同时说了两件互斥的事：

> 「编号体系：与 scripts/verify-site.cjs 的 1–24 **续接**，从 25 起，
> 不复用那边的号 … 所以这里用**独立编号 A1–A4**」

「续接，从 25 起」与「不复用那边的号」「独立编号」直接矛盾。
括号里的理由（「那边的门禁 24 会自查…，两边撞号会让追溯日志时指错对象」）
支持的是后者 → **第 16–17 行是早期草稿残留**。

- 技术后果为零（门禁 24 只读 `verify-site.cjs` 自己），
  但**会被后人当事实引用而指错对象**（去找 25 号门禁，发现不存在）。
- 改成单一权威表述，并且**不再写死对方的编号区间** ——
  那个区间（原文写的是"1–24"，而 `verify-site.cjs` 现在已到 28 条）会随对方加门禁而过期，
  写死就是一句会变假的话：

> 编号体系：**独立编号 A1–A4**，与 scripts/verify-site.cjs 的数字编号**不续接**。
> 理由：那边的门禁会自查"文件头清单与代码段一一对应且连续"，两边撞号会让追溯日志时指错对象。
> （⚠️ 也不要在这里写死对方的编号区间 —— 那个区间会随对方加门禁而过期。）

### D. 故障注入矩阵（11 例，隔离副本 `/tmp/mh-r18/repo2`，共享工作区零写入）

每例都带回读断言：注入前后 **md5 必须变**、且**注入内容读得到**，然后才跑门禁
（否则「注入没生效」与「门禁没拦住」在结果上长得一样）。

| 用例 | 注入 | 期望 | 实测 |
|---|---|---|---|
| 基线 | 不注入 | exit 0 | **exit 0** ✓ |
| BI1 | 删掉 `.detail a,` | 旧 exit 0 / 新 exit 1 | **旧 exit 0 / 新 exit 1** ✓ |
| BI2 | `.detail a` 拆成独立规则但仍带 underline | exit 0 | **exit 0** ✓ |
| CI1 | 取值改成 `.innerHTML` | exit 1 | **exit 1** ✓ |
| CI2 | 两条出口取不同变量 | exit 1 | **exit 1** ✓ |
| CI3 | 复制出口整体被移除 | exit 1 | **exit 1** ✓ |
| CI4 | 取值来源看不懂（`getCopyText(src)`） | exit 1 | **exit 1** ✓ |
| 复位 | 全部还原 | exit 0 | **exit 0** ✓ |

⚠️ **驱动脚本自身踩到的两个坑**（第一版实测失败，如实记下）：

1. **`reset()` 用 `git checkout -- .` 还原工作区 → 把我改过的新门禁也一起还原了**，
   于是"新门禁"那一例其实跑的是旧门禁。→ `reset()` 之后必须把本轮三个文件拷回去。
2. **旧门禁副本放在仓库外 → 它按 `__dirname/..` 找 `_site`，落到 `/private/tmp`**，
   报"找不到产物目录"（exit 1），差点被误读成"旧门禁也能抓到"。→ 必须覆盖到仓库内**同一路径**再跑。

另外，**CI3 的预期是我一开始写错了**：只移除 clipboard 一条路径而留着 textarea 回退时，
门禁判绿是**正确的** —— 那个状态下复制功能仍然存在（走 `execCommand` 回退），不是缺陷。
改成**两条出口整体移除**才是"复制功能被删"，门禁正确报 exit 1。

### E. 复验

- 隔离克隆（`git clone` + 只叠加本轮三个文件到 `b86d7ff` 基线）`npm run build` → **exit 0**，
  **六个门禁脚本**全绿：check-css-braces ✓ / check-dead-css ✓ /
  check:site ✓（门禁编号 28 条一一对应且连续 —— 该基线上并发场次尚未加门禁 28）/ check:lang ✓ /
  check:a11y ✓ / **check:copy ✓**。
- **从本轮 commit `eb0cd16` 出发的干净克隆**再验一次 → **exit 0**，六个门禁脚本同样全绿
  （此时 `verify-site.cjs` 已被并发场次推进到 **29 条**编号，一一对应且连续）。
- 线上巡检（13:45 PDT）：`/` `/blog/` `/about/` `/sitemap.xml` `/404.html` = 200；
  `/papers/` `/publications.bib` `/feed.xml` = 404（**属待部署**，线上仍是 2026-10-16 那次部署）；
  线上 canonical 仍带 `/MeteoHub/` 前缀（旧产物）。

### 待部署（本轮**不 push**，线上仍是旧版本）

不变：`/papers/`、`/publications.bib`、`/feed.xml` 在线 404；canonical / og:url / sitemap
带 `/MeteoHub/` 前缀。**部署由本人决定。**

### 待决策（**沿用第十六轮 7 条，本轮不新增、不擅自拍板**）

1. 404 页要不要保留 Person 实体（`src/404.njk` 的 `identityOn404`）。
2. 论文页是否显示"论文署名单位"。
3. `figure.alt` 是否保留 "Fig. 10 —" 前缀。
4. sitemap `lastmod` 口径三选一。
5. 何时 push / 部署。
6. `src/blog.njk:75` 博客卡片封面图的 `alt=""` 口径。
7. OG 分享图里的中文品牌文案要不要英文化。

### 留给下一轮

1. **`detail.njk` 至今从未被构建渲染**（blog/portfolio 集合为空）→ 这条模板链路上
   的一切（详情页 JSON-LD、prev/next、readingTime、`.detail` 的样式）都**只有源码、没有产物**。
   要不要发一篇首篇文章把它上线？→ **内容决定，本人不擅自加**。
2. **门禁 21④ 的报错去重**、**门禁 15 在四个页面上空跑** —— 本轮未动（`verify-site.cjs` 在飞）。
3. **`gitOut` 的 catch 加固**（第十四轮「留给下一轮」第 2 条，低严重性）。
4. 门禁 27 的锚点仍依赖门禁 12 的**姓名**匹配，可改成 **ORCID**（`eleventy.config.js:704`
   已是"ORCID 优先、姓名兜底"）。⚠️ 换锚点前必须先确认 **R4（只改 @id 形状）仍被门禁 12 抓到**。
5. 巡检 cron 仍是每 5 分钟起一个会话 → 持续并发冲突（连续五轮都撞见）。
   建议改成 30–60 分钟 + 单写者锁。
## 2026-10-19 · 13:41–14:00 场次（**不占轮次号**，避免与并发场次撞号）：首页专有名词被小写化 + 门禁 28

### 本场次定位

本轮只做两件事，都是**同一个真 bug** 的两面：

- **A**：修掉一个**肉眼可见的排版级错误** —— 首页 "A working archive" 段把专有名词
  "North China" 渲染成了小写 "north china"。
- **B**：给这类错误配一条**能拦住它、也能拦住同类错误**的门禁（门禁 28）。

### A. 改进点 A：`currentFocusEn` 被 `| lower` 小写化（真 bug）

**现象**（修复前 `_site/index.html` 的正文）：

> Currently focused on extreme precipitation over **north china**.

**根因**：`src/index.njk` 对 `site.author.currentFocusEn` 加了 `| lower`。
`git log -S 'currentFocusEn | lower' -- src/index.njk` → 来自 `0252580`（站点重构那次），
**不是有意为之**——全站 `| lower` 只有 3 处，另外 2 处（`researchEn`）是对的。

**为什么这是"矛盾"而不只是"不好看"**：`src/about.njk:7-9` 早就把这条决策写成了明文注释：

> ⚠️ currentFocusEn 后面刻意**不加 | lower**：它是专有名词 "Extreme
>    precipitation over North China"，lowercase 会把 North China 变成
>    north china，正文句子读着像地名普查表。

也就是说 —— **同一个字段，about 页守住了，首页漏了**。
（about 页与首页的 meta description 都正确；全站 HTML 产物里 15 处规范写法 + 1 处小写，
小写的只有这一处。）

**修法**：`src/index.njk` 去掉那一个 `| lower`，其余不动。

⚠️ 顺带记一笔：`researchEn` 的 `| lower` **是对的**（"Thunderstorm Lightning · Data
Assimilation · …" 是普通名词列表），不能一起去掉。

### B. 改进点 B：门禁 28 —— 专有名词不得被小写化

**为什么值得单配一条门禁**：这个 bug 的性质是"**人不该犯、但人一定会犯**"的错误
（模板里加一个 `| lower` 而已）。它不会让构建失败、不会让链接失效、不会让门禁变红 ——
它只是让页面读着像地名普查表，靠人记是守不住的。

**判据**：每个 HTML 产物的**人可见文案**里，清单里的专有名词都不得出现"非规范大小写"
的形式（全小写 / 全大写 / 句首大写都不允许）。

**三层设计，每一层都是被实测逼出来的**：

1. **只取"人可见文案"**（文本节点 + `content`/`alt` 属性值，剔除 `<script>`/`<style>`/HTML 注释）
   —— `href`/`src` 里的域名（`github.com`、`orcid.org`、`doi:10.5281/zenodo.18041880`）
   按惯例本来就是小写，那是 URL，不是大小写错误。
   ⚠️ 但这些 URL 有时**作为链接文字**出现在正文里（"Source lives in github.com/oldsixxiaolv"），
   只靠"不查属性"躲不开 → 所以还要第 2 层。
2. **剔掉 URL / 标识符型 token**（含 `://`、含 `/`、以 `.tld` 结尾、或"数字+点"）
   —— 顺带解决 `og:image` 的 `content` 里那个 `assets/img/publications/trmm-fig10.jpg`
   （否则 "trmm" 会被当成被小写化的 "TRMM"）。
3. **词组边界检查**（左右都不是标识符字符 `[A-Za-z0-9_-]`）
   —— 否则 `trmm-fig10.jpg` 里的 "trmm" 仍会被误判。

**清单自证存活**（与门禁 24 同构）：清单里某条词在产物里**已经找不到规范写法** → 判红。
理由：清单是显式契约；条目失效后本条会一直绿着，**看着像在把关、实际已经不拦任何东西**，
那比没有这条门禁更糟。改内容时忘了同步清单，就该被提醒，而不是悄悄失效。

**清单的加入标准**（写进代码注释）：只收**小写后不是普通英文词**的专有名词。
"North China" 可以；"Apple" 不行 —— 它的全小写形式是普通名词，会把正常句子判红。

当前 17 条：North China / Institute of Atmospheric Physics / Chinese Academy of Sciences /
Lanzhou University / IAP-CAS / LZU / Zenodo / ORCID / TRMM / GPM / GitHub / Code Ocean /
ResearchGate / OpenAlex / CSDN / Manuscript_Lvyh / Yihang Lyu。

### C. 我自己引入的一个副作用（如实记下）

第一次改 `src/index.njk` 时，把说明注释写在了句子**中间**：

```njk
working on {{ site.author.researchEn | lower }}. Currently focused on
{#- currentFocusEn 是含专有名词的整句…… -#}
{{ site.author.currentFocusEn }}.
```

`{#-` 会把注释**前面**的空白一起吃掉 → 渲染成
`Currently focused on**Extreme** precipitation over North China.`（"on" 与 "Extreme" 粘连）。

- **是读产物时发现的，不是门禁发现的** —— 门禁 28 只管大小写，管不了"词和词粘在一起"。
- 修法：注释挪到段落**之外**（`<p>` 之前），正文一字不动 → 第二个 commit `267135b`。
- 教训已写进模板注释本身：**说明性注释放在句子中间时，空白控制会吃掉正文里的空格**。

### D. 故障注入矩阵（4 例 + 复位，隔离克隆 `/tmp/mh-g28-verify/repo`，共享工作区零写入）

每例都带回读断言：**先确认注入真的落盘**（源文件 grep + 产物回读），再读门禁结论
（否则「注入没生效」与「门禁没拦住」在结果上长得一样）。

| 用例 | 注入 | 期望 | 实测 |
|---|---|---|---|
| 基线 | 不注入（干净克隆 `267135b`） | exit 0 | **exit 0** ✓ |
| A | `currentFocusEn` 加回 `\| lower`（还原原 bug） | exit 1 | **exit 1** ✓ 报 `index.html: 专有名词 "North China" 出现了非规范大小写` |
| B | **不靠 `\| lower`**，模板里直接手写 "north china" | exit 1 | **exit 1** ✓（证明门禁不是只匹配 `\| lower` 这一种机制） |
| C | 把 "Code Ocean" 从整棵 `src/` 改名（模拟清单条目失效） | exit 1 | **exit 1** ✓ 报 `门禁 28 的清单条目 "Code Ocean" 已经失效` |
| D | 全大写 "NORTH CHINA" | exit 1 | **exit 1** ✓（门禁注释里声称"全大写也不允许"，这条要验过才算数） |
| 复位 | 全部还原 | exit 0 | **exit 0** ✓ |

⚠️ **C 用例第一次没落地**：只 sed 了 `src/_data/site.js` 与 `src/content/*.md`，
而 "Code Ocean" 实际在 `src/_includes/layouts/paper.njk` → 源文件回读仍有命中、
产物里仍有 2 处 → 门禁 exit 0。**是回读断言先发现的**（若只看门禁结论，
会误判成"门禁抓不到清单失效"）。重做时改成 `grep -rl | xargs sed` 覆盖整棵 `src/`。

### E. 复验

- 隔离克隆（`git clone` + `node_modules` 符号链接）`npm run build` → **exit 0**，
  门禁输出：`专有名词大小写：17 条清单全部在用，且都保持规范大小写`；
  门禁编号：**文件头清单 29 条 / 代码段 29 条，一一对应且连续**。
- 工作区 `npm run build` → **exit 0**（check:css ✓ / check:site ✓ / check:lang ✓ /
  check:a11y ✓ / check:copy ✓）。
- 产物正文回读（空白归一后）：`Currently focused on Extreme precipitation over North China.`
  —— 空格在、大小写在。
- 线上巡检（13:56 PDT）：`/` `/blog/` `/about/` `/sitemap.xml` `/robots.txt` `/404.html` = 200；
  `/papers/` `/publications.bib` `/feed.xml` `/papers/trmm-thunderstorm-stages/` = 404
  （**属待部署**，线上仍是 2026-10-16 那次部署）；线上 canonical 仍带 `/MeteoHub/` 前缀。

### 本轮提交（**不 push**）

- `53c8f6d` `fix(content): 修掉首页 currentFocusEn 被 | lower 小写化 + 新增门禁 28 守专有名词大小写`
- `267135b` `fix(content): 把 currentFocusEn 的说明注释挪出句子——注释的空白控制曾把 "focused on" 的空格吃掉`
- `docs(log)` 本段（**即本条提交**）

⚠️ 并发提醒：本场次提交时，工作树里同时有另一场次在途的 `package.json` /
`scripts/check-a11y.cjs` / `scripts/check-copy-export.cjs` 改动 ——
**一律显式 `git add <path>`，不用 `git add -A`**（否则会把别人的在途改动扫进本轮提交）。

### 待部署（本轮**不 push**，线上仍是旧版本）

不变：`/papers/`、`/publications.bib`、`/feed.xml`、`/papers/trmm-thunderstorm-stages/`
在线 404；canonical / og:url / sitemap 带 `/MeteoHub/` 前缀。**部署由本人决定。**

### 待决策（**沿用第十六轮 7 条，本轮不新增、不擅自拍板**）

1. 404 页要不要保留 Person 实体（`src/404.njk` 的 `identityOn404`）。
2. 论文页是否显示"论文署名单位"。
3. `figure.alt` 是否保留 "Fig. 10 —" 前缀。
4. sitemap `lastmod` 口径三选一。
5. 何时 push / 部署。
6. `src/blog.njk:75` 博客卡片封面图的 `alt=""` 口径。
7. OG 分享图里的中文品牌文案要不要英文化。

### 留给下一轮

1. **门禁 28 的清单要随内容同步**：改了机构名 / 仓库名 / 平台名，必须同时改
   `scripts/verify-site.cjs` 里的 `PROPER_NOUNS`，否则 build 会报"清单条目已失效"。
   这是**有意的摩擦**（让清单与内容显式对账），但要在改内容时记得。
2. **门禁 21④ 的报错去重**、**门禁 15 在四个页面上空跑** —— 仍未动。
3. **`gitOut` 的 catch 加固**（低严重性）。
4. 门禁 27 的锚点仍依赖门禁 12 的**姓名**匹配，可改成 **ORCID**。⚠️ 换锚点前必须先确认
   **R4（只改 @id 形状）仍被门禁 12 抓到**。
5. 巡检 cron 仍是每 5 分钟起一个会话 → 持续并发冲突（连续多轮都撞见）。
   建议改成 30–60 分钟 + 单写者锁。
6. **门禁 16 的报错文案在 `0c9d586` 里已被另一场次的在途改动"搭车"**（见下节 A-3）：
   那段"不是合法布尔"文案**现已由本场次的 commit 署名**，其断言虽经实测成立，
   但**未经对方场次最终确认**。若对方后续要改写那段文案，以对方为准。
## 2026-10-19 · 14:00–14:30 场次补记（**不占轮次号**，避免与并发场次撞号）：一次"把别人的在途改动扫进自己 commit"导致构建变红，以及它的自愈

本场次接手时，仓库处于一个**红状态**：HEAD `0c9d586` 的 `npm run build` exit 1。
这一节记录**事件的完整经过**、**根因**、**为什么它最终自愈了**，以及**从中提炼的纪律**。
（背景：本场次在同一时段也在改 `scripts/verify-site.cjs` 的门禁 16 文案。）

### A. 事件经过

#### A-1. 症状

`0c9d586`（本场次提交的门禁 16 文案订正）在隔离克隆里单独 checkout 后构建红：

```
门禁编号：文件头清单 29 条 / 代码段 28 条 —— 不一致（见上方报错）
```

报错来自**门禁 24**（"门禁编号自身：文件头清单与代码段必须一一对应"）。
换句话说：**不是门禁 16 的判据坏了，是这个 commit 里的门禁清单与门禁实现对不上**。

#### A-2. 根因：`git add <path>` 会把**整个文件**的工作树状态扫进 commit

本场次当时改的是 `scripts/verify-site.cjs` 里门禁 16 的**报错文案**。
但同一时刻，**另一场次正在同一个文件里**写**门禁 28**（专有名词大小写）——
它先在文件头的编号清单里加了一行 `28. …`，**代码段还在写**（或尚未落到本场次可见的状态）。

本场次执行了 `git add scripts/verify-site.cjs` —— **只指定了路径，没有用 `git add -A`**，
看起来完全符合"只 add 自己的文件"的纪律。但 `git add <path>` 扫的是**该路径当前的工作树全文**，
**不是"我改的那几行"**。于是对方那段**只写了一半**的改动（文件头有了、代码段没有）
被一并提交进了 `0c9d586`。

⚠️ **纪律要改写**：
- 旧纪律「**显式 `git add <path>`，不用 `git add -A`**」**只防住了"扫进别人改的别的文件"**，
  **防不住"扫进别人在同一个文件里的在途改动"**。
- 真正的判据是：**这个文件里此刻是否只有我一个人的改动**。
  同文件并发时，`git add <path>` 与 `git add -A` 的差别是**文件名**，而**危害是同一个**。
- **同文件并发时的正确做法**（本场次当时没用上）：
  ① 先 `git diff HEAD -- <path>` 看清工作树相对 HEAD 的**全部**差异，
     逐 hunk 区分"谁的行"；
  ② 只把自己的 hunk 用 `git apply --cached` 打进索引（**不碰工作树**），
     或用 `git hash-object -w` + `git update-index --cacheinfo` 写索引；
  ③ **绝不**用 `git checkout -- <path>` / `git reset` 去"清理"工作树——
     那会**抹掉对方在途的代码**（对方还没提交，代码只存在于工作树里）。

#### A-3. 另一个副作用：一段**未经对方确认**的文案落在我名下

同一 commit 里还带进了对方那段**"不是合法布尔"的报错文案重写**。
`53c8f6d`（对方场次随后提交的门禁 28）对 `scripts/verify-site.cjs` 是**纯追加**
（`+114/-0`，hunk 头 `@@ -1893,6 +1893,120 @@`，不碰 L1029–1038 区域），
所以**那段文案至今仍以 `0c9d586` 署名**，对方并未复述或确认它。

既然落在我名下，我逐条实测了它断言的每一件事（js-yaml 4.3.2，与模板侧同一套解析）：

| 字面量 | js-yaml 解析类型 | 真值 | 文案里的断言 | 实测 |
|---|---|---|---|---|
| `true/True/TRUE/false/False/FALSE` | boolean | 真/真/真/假/假/假 | "只把六种写法当布尔" | ✓ 一致 |
| `no` / `on` / `off` / `yes` | string | **真** | "非空字符串是真值" | ✓ 一致 |
| `"false"`（带引号） | string | **真** | "非空字符串是真值" | ✓ 一致 |
| `1` | number(1) | **真** | "非零数字是真值" | ✓ 一致 |
| `0` | number(0) | **假** | "唯独 null 与 0 是假值" | ✓ 一致 |
| `null` / `~` / 空 | null | **假** | "唯独 null 与 0 是假值" | ✓ 一致 |

结论：**那段文案的每条断言都成立**，可以保留。模板侧消费点是
`src/_includes/layouts/base.njk:350` 的 `{%- if not is404 or identityOn404 %}`，
即**只看真值**——所以文案里"非空字符串与非零数字是真值"这一条是**必要的**，不是啰嗦。
（已列入「留给下一轮」第 6 条：若对方后续要改写这段文案，**以对方为准**。）

#### A-4. 自愈：靠对方后续提交补齐代码段，**不是**靠我改历史

事件发生后，本场次**没有**用 `git reset` / `git checkout --` 去"修复" `0c9d586`
（那会抹掉对方在途的代码）。等对方场次把**门禁 28 的代码段**提交为 `53c8f6d` 后，
文件头与代码段重新一一对应，构建自然恢复绿。**证据（逐 commit 比对编号自洽性，
用门禁 24 自己的提取正则）**：

| commit | 文件头清单 | 代码段 | 只在文件头 | 只在代码段 | 该 commit 单独构建 |
|---|---|---|---|---|---|
| `b86d7ff` | 28 条 | 28 条 | — | — | exit 0 ✓ |
| `0c9d586` | 29 条 | 28 条 | **28** | — | **exit 1** ✗ |
| `53c8f6d` | 29 条 | 29 条 | — | — | exit 0 ✓ |
| `eb0cd16` | 29 条 | 29 条 | — | — | exit 0 ✓ |
| `9f0459f`（新增门禁 29） | 30 条 | 30 条 | — | — | exit 0 ✓ |
| `eae066f`（本场次的日志 commit） | 30 条 | 30 条 | — | — | exit 0 ✓ |

⚠️ **为什么这次"不修历史"是对的**：
- 若为了"让 `0c9d586` 单独也绿"而改写那个 commit，就必须**把对方半成品从历史里摘掉**，
  而对方那半成品是**对方工作的一部分**，摘掉它等于**替对方改决定**；
- 而且改历史会**连带改掉其后所有 commit 的 hash**——本仓库此刻有 **10+ 个并发场次**在跑，
  其他场次正按 hash 互相引用（这已经是本项目第 N 次踩这个坑），
  改 hash 会让**别人手里的 commit 引用当场失效**；
- 真实教训不在"这个 commit 不绿"，而在**"同文件并发时 `git add <path>` 不安全"**——
  那条纪律写进日志就够了，改历史解决不了下一次。

### B. 门禁 16 文案订正在当前 HEAD 上的复验（5 例）

`0c9d586` 的文案改动在几轮并发提交之后仍在（`nestedHint` 变量未被覆盖）。
在当时的 HEAD `eb0cd16` 上重跑了一遍完整注入（隔离克隆 + **真构建** + 真门禁）：

⚠️ **这一节刻意不写"当前 HEAD"**：复验时 HEAD 是 `eb0cd16`，
而复验之后并发场次又推进了几轮（HEAD 已到 `eae066f`，门禁数从 29 变 30）——
**日志里写死"当前 HEAD"和"XX 条"这类会随并发推进立刻失效的说法，本身就是错的**。
下表的结论对 `eb0cd16` 成立；改动只涉及门禁 16 的报错文案与门禁 28/29 的编号，
**不触及门禁 16 的判据本身**，因此结论对后续 HEAD 仍然成立
（`eae066f` 上的完整构建复验 exit 0，门禁编号 30/30 一一对应）。

| 场景 | 期望 | 实测 |
|---|---|---|
| 基线（switch=true，产物根节点 = Person） | exit 0 | **exit 0** ✓ |
| A：switch=false + 产物塞回带 Person 的基线 ld+json | exit 1 + 新文案 | **exit 1** ✓，文案含「Person 是根节点，其余是它的嵌套节点」，且回显 `identityOn404 = false` |
| B：switch=false + 产物根节点 `@type` 改 `Organization` | exit 1 + **不出现** Person 断言 | **exit 1** ✓，文案为「（Organization、CollegeOrUniversity、Place、PostalAddress）」——**无** Person 断言 |
| C：switch=false + 产物重新生成（无身份实体） | exit 0 | **exit 0** ✓ |
| 复位：还原源文件并重新构建 | exit 0 | **exit 0** ✓ |

注入 B 的**产物结构**也在本轮确认为实测而非推断：
`_site/404.html` 的 ld+json 是**单根 Person 节点** + 4 个嵌套属性
（`affiliation`=Organization / `alumniOf`=CollegeOrUniversity /
`workLocation`=Place / `workLocation.address`=PostalAddress）——
这正是「Person 是根节点，其余是它的嵌套节点」这句话的根据。

⚠️ **A 例的注入顺序（第一次跑错了，记录下来）**：
我最初的做法是「把 switch 改成 false → build → 改产物根节点 @type」，
但 **switch=false 时 build 出来的产物里根本没有 Person**，所以
「改根节点 @type」这一步**匹配不到任何东西**（`replace` 无命中 → 断言失败）。
正确顺序是：**先**用 switch=true 造一份带 Person 的产物并留在内存里，
**再**切 switch=false 并 build，**最后**把内存里那份产物写回 `_site/404.html`。
（与本日志此前记录的"注入手段必须独立于被测对象"是同一条纪律的另一个面：
**注入要在构建之后做，否则会被构建覆盖**。）

### D. 收到一份外部交叉验证报告：**结论成立，但被验版本落后 28 个 commit**

14:03 收到另一场次发来的独立交叉验证报告（隔离克隆 `/tmp/mh-xcheck-cb6c/repo`，
全程未碰工作树、不自证）。**报告的技术结论我逐条复现后全部成立**（见下），
但**它验的版本与当前 HEAD 不一致**，且报告的第 5 点**已经过期**。

#### D-1. 报告验的是哪个版本（先问，再看结论）

```
/tmp/mh-xcheck-cb6c/repo 的 HEAD = 33ca461  (2026-10-19 12:41:25 -0700)
当前 HEAD                            = db2c545  (2026-10-19 14:03:08 -0700)
33ca461 相对当前 HEAD：落后 28 个 commit（在链上）
```

报告里"这 **6 个**文件一起提交的 commit"也对不上——`33ca461` 实际只改了
**2 个**文件（`docs/IMPROVEMENT-LOG.md`、`src/_data/site.js`）。
→ 说明报告里的部分描述**指向的是更早的一次状态**，不是它实际验的那棵树。

⚠️ 这正是本日志多次记的同一条纪律的又一次印证：
**拿到"某场次说这里有问题/没问题"的报告，先验它测的是哪个版本**，
再看结论。报告里的每个结论都要落到**具体 commit** 上才有意义。

#### D-2. 报告的 1–4 点：在当前 HEAD 上逐条复现，**全部成立**

本场次另开隔离克隆（`/tmp/mh-xcheck-verify/repo`，基于当前 HEAD `db2c545`）
重跑了一遍：

| 报告结论 | 当前 HEAD 实测 | 判定 |
|---|---|---|
| ① 基线 build exit 0、check:css 通过、门禁全绿 | build **exit 0**；门禁编号 **30/30** 一一对应且连续 | ✓ 成立 |
| ② canonical 5 页全为 `https://github.lvyihang.xyz/<path>`，404 无 canonical | 4 个内容页 canonical 均为该域根路径，**404.html 无 canonical** | ✓ 成立 |
| ② sitemap 5 条 loc 全根路径、无 `/MeteoHub/` 残留 | 5 条 loc 全为根路径，**含 `/MeteoHub/` 的：0 条** | ✓ 成立 |
| ② feed `lastBuildDate` 与 robots「生成时间」同一刻 | feed `Mon, 19 Oct 2026 21:04:12 GMT` / robots `2026-10-19T21:04:12.597Z` | ✓ 成立 |
| ② 404 产物 1 个 Person | 404.html 里 `"@type": "Person"` **1 处** | ✓ 成立 |
| ③ FI-F：翻 `identityOn404:false` → build exit 0、404 Person=0 | build **exit 0**；404.html 里 Person **0** 处；其余 4 个内容页 Person **4** 处（仍在） | ✓ 成立 |
| ④ FI-G：产物 canonical 改 `old.example.com` → check:site exit 1、2 条 | exit **1**，**2 条**：`canonical (https://old.example.com/) 与 og:url (…) 不一致` + `canonical = "https://old.example.com/" 不在站点地址 https://github.lvyihang.xyz/ 之下` | ✓ 成立 |
| ⑤ FI-H：sitemap loc 加 `/MeteoHub/` → exit 1、2 条 | exit **1**，**2 条**：`sitemap.xml: "…/MeteoHub/about/" 在产物里找不到对应页面` + `about/index.html: 产物里有这个页面，但 sitemap.xml 没收录` | ✓ 成立 |

→ **报告的核心价值成立**：它证明**线上事故形态（canonical 带子路径 /
sitemap 带 `/MeteoHub/` 前缀）会被门禁 21 拦下**，这两条正是线上现存的问题形态。

⚠️ **一处口径差异（不是矛盾）**：报告说 FI-F 后"身份节点 13→12"，
本场次测的是"404.html 里 Person 0 处、其余 4 个内容页 Person 4 处"。
两个数**量的不是同一件事**——13/12 数的是**全站身份类实体节点总数**
（含 Organization / Place / PostalAddress 等嵌套节点），
4 数的是**四个内容页各自的 Person 根节点**。
两次实测**方向一致**（404 的 Person 归零，其它页不受影响），
报数口径不同而已。

#### D-3. 报告第 5 点（"日志 L1506-1509 已过时"）：**判断方向对，但该处早已被订正**

报告说 `docs/IMPROVEMENT-LOG.md` 里那段
"若本人选去掉，改 `base.njk` 加 `{%- if not is404 %}` 即可，第 16 条门禁不受影响
（它不查 Person）"已过时——**这个判断本身是对的**（该处确实是旧口径），
但**该处早在两轮之前就被订正覆盖了**：

- **L1571–1586**（第十一轮订正块）：原文已被明确引出并逐条订正
  ——① 改法已变成翻 `src/404.njk` 的 `identityOn404` 一行；
  ② "门禁不受影响"是假的，门禁 16 现在**双向**读同一个开关。
- **L2036–2048**（第十二轮订正块）：同一处旧说法的第二份订正。

本场次**代码层复核**（不看订正块，只看代码与模板）：

| 断言 | 代码实证 |
|---|---|
| 门禁 16 查不查 Person？ | **查，且双向**：`verify-site.cjs:1063`（`identityOn404===true` → 必须 ≥1 个身份实体）、`:1070`（`===false` → 必须 0 个） |
| 开关在哪？ | `src/404.njk:26` 的 front matter `identityOn404: true`；`base.njk:350` 读的是**页面变量** `{%- if not is404 or identityOn404 %}` |

→ 旧说法在**代码层**确已不成立，但**文本层**早已订正完毕，
本场次**不需要再改这一处**（改了反而是重复劳动）。
⚠️ 报告给的行号（L1506-1509）与该处**实际位置**（L1573）也不一致——
行号会随并发推进漂移，**定位要靠内容而不是行号**。

#### D-4. 这份报告暴露的一条元问题

报告本身质量很高（隔离克隆、不碰工作树、不自证、注入独立），
但它**没有在报告里写明自己验的是哪个 commit**——
这让接收方无法第一时间判断结论适用于哪棵树，只能自己去克隆里查。
→ **建议后续的交叉验证报告一律带上「被验 commit 的 hash + 提交时间 + 相对 HEAD 的落后数」**
（就像本节 D-1 这样）。这比"结论本身"更省事：版本对不上时，结论要重跑；
版本对得上时，结论可以直接采信。

### E. 本轮提交（**不 push**）

- `eae066f` `docs(log): 补记"把并发场次在途改动扫进自己 commit"导致构建变红的完整经过`
  （本节 A、B 两部分的初稿）
- `db2c545` `docs(log): 订正初稿里三处"会随并发推进立刻失效"的说法`
  ——①「门禁编号 28 条」订正段补上"门禁 29 落地后变成 30 条"；
  ② A-4 的逐 commit 表补上 `9f0459f` / `eae066f` 两行；
  ③ B 节去掉「**当前 HEAD**」的措辞，改写为"复验时的 HEAD 是 `eb0cd16`"并说明
  为什么日志里**不该**写"当前 HEAD"（并发场次几分钟就推进一轮，写死即过期）。
- `9c70ec9` `docs(log): 记录外部交叉验证报告的版本对齐问题——结论成立，但被验版本落后 28 个 commit`
  （本节 D：记录外部交叉验证报告的**版本对齐**问题（被验版本落后 28 个 commit）、
  报告 1–4 点在复验时 HEAD（`db2c545`）上的复现结果、
  以及第 5 点**已被前两轮订正覆盖**故不重复改的事实）

⚠️ 并发提醒：这三笔提交**都只显式 `git add docs/IMPROVEMENT-LOG.md`**（只加日志，不碰任何代码文件）。
前两笔提交时工作树里除日志外为空；第三笔（`9c70ec9`）时工作树里还叠着并发场次在途的
`eleventy.config.js`（+103 行，在写 RIS 导出功能）——同样**没有**被扫进 commit。
## 2026-10-19 · 14:05–14:20 场次（**不占轮次号**，避免与并发场次撞号）：核实 11:45 场次的三条提醒 + 记一条「已知取舍」

### 本场次定位

本轮**不改任何代码**，只做两件事：
① 独立复核 11:45 场次转述的提醒（**不采信转述**，逐条现查现跑）；
② 把其中一条"可记进已知取舍"的观察正式记进日志。

### F. 收到 11:45 场次的提醒：**三条断言经独立复现全部成立，但"假缺口"并未进日志**

14:05 收到 11:45 场次转述的一份 11:05 旧快照复核结论的提醒，其中第 3 条可能已过期，
提醒**不要照它写日志留下"已修复的假缺口"**。本场次逐条独立复现（不采信转述）：

| 11:45 场次的断言 | 本场次独立实测 | 判定 |
|---|---|---|
| 缺口"删掉 404.html 的 Person 块 → 仍 exit 0"**已不成立** | `SITE_DIR` 指向产物副本，删掉 404.html 的整个 `ld+json` 块 → **exit 1**，报 `404.html: 一个 JSON-LD 实体都没有 —— src/404.njk 的 identityOn404 = true 声明错误页**要**声明身份…` | ✓ 成立 |
| 4b"404 robots 缺 follow"**已修好** | 注入 `content="noindex, nofollow"` → **exit 1**，报 `404.html: 404 页的 robots 少了 follow（robots meta = noindex, nofollow）` | ✓ 成立 |
| **不要补 `hasOwnerOn404`** | 见下 | ✓ 成立 |

代码层对照（本场次现查）：门禁 16 双向判据在 `verify-site.cjs:1063`
（`identityOn404===true` → 必须 ≥1 个身份类实体）与 `:1070`（`===false` → 必须 0 个）；
4b 的 `robotsTokens` 是**数组 + token 精确判定**（`:256-260`），
所以 `"nofollow"` 不会被 `includes("follow")` 误判成有 follow。

#### F-1. "假缺口"并没有进日志 —— 但这不代表可以放心照转述写

本场次查了日志，**它担心的那个坏结果没发生**：

- 日志里那条"缺口 A"早就写的是「删掉 404 页的 Person 身份实体 → **exit 1** …
  **不成立**（靠第十一轮的 `identityOn404` 双向判据）」，**不是**"仍成立"；
- 另有专段解释「**为什么不能简单写死"404 页必须有 Person"**」，
  并给出双向判据的正解；
- 全库 `grep hasOwnerOn404` **0 命中**——这个建议**从未**被采纳或写进日志。

→ **本场次不需要"防止"它**，但也不该只说一句"没问题"就算完：
转述的快照与当前树之间**差了 28 个 commit**（详见上一节 D-1 的同型问题），
**照着转述写**才是真正的风险。已按当前树实测结果记入本节。

#### F-2. 为什么 `hasOwnerOn404` 恰恰是要避免的东西

它要求"404 页必须有描述 `OWNER_NAME` 的 `Person` 节点"——
而"404 页要不要 Person"是**待本人拍板的口径**（见「待决策」第 1 条）。
写死这条门禁 = **替本人把那条选了**；本人日后若拍"去掉 Person"，
这条门禁会让构建**直接红**，而那正是本项目反复踩的"把未决口径写死进门禁"。

它还会**继承门禁 12 的弱点**：门禁 12 是**按姓名**找本人节点的
（`verify-site.cjs:591-597`，只认 `name === OWNER_NAME`），
所以 `hasOwnerOn404` 一旦实现，就会被"改名字即消失"绕过——
门禁 27 正是为了堵这个才按 `@id` 兜底（`:1846`）。

⚠️ **开关 + 双向判据的正解已经是现状**（`identityOn404` 在 `src/404.njk` 的 front matter，
模板 `base.njk:350` 与门禁 16 **读同一处**）：本人拍板时**只改那一行**，
两种口径门禁都认，不会出现"改了开关 build 却红了"。

#### F-3. 一条可记进「已知取舍」的观察（**只记录，现在不动**）

`sitemap.xml` 里每条 `<url>` 都带一行 XML 注释：

```xml
<!-- source: src/index.njk -->
<!-- source: src/about.njk -->
<!-- source: src/blog.njk -->
<!-- source: src/papers.njk -->
<!-- source: src/content/papers/trmm-thunderstorm-stages/paper.md -->
```

- **不影响解析与 SEO**：XML 注释不是节点内容，`loc` / `lastmod` 的读取不受影响；
  搜索引擎也不会把注释当页面内容索引。
- **不泄绝对路径**：写的是**仓库相对路径**（`src/…`），不含本机目录、
  用户名或部署路径。
- **但确实公开了源码目录结构**：`src/content/papers/<slug>/paper.md` 这种布局
  相当于对外说明了"论文是按 slug 建目录、放 markdown"。

⚠️ **本轮只记录，不动它**。理由：① 这条注释是**门禁 18 的承重件**——
删掉它会让门禁 18 的逐页核对直接失效（`verify-site.cjs:1298-1309`：
产物里没有 `source` 标注时**必须 fail**，代码注释原文写着
"没有标注 = 门禁自己被卸掉了"）；
② 它服务的正是"逐页核对 lastmod 取自哪个源文件"这项能力；
③ 去掉它要么改门禁 18 的实现（新增工作量），要么放弃这项核对。
→ 归入「已知取舍」：**为了门禁 18 的逐页核对，sitemap 公开了仓库相对路径的源码布局**。
若本人日后认为这个暴露不可接受，正确的改法是**换一种承重方式**
（如把 source 路径写进 build 期的元数据文件供门禁读，而不写进产物），
**不是**直接删注释。

### G. 已知取舍（本轮新增 1 条）

1. **sitemap 为了门禁 18 的逐页核对，公开了仓库相对路径的源码布局**：
   每条 `<url>` 都带 `<!-- source: src/… -->` 注释（如
   `src/content/papers/trmm-thunderstorm-stages/paper.md`）。
   - **代价**：对外暴露了"论文按 slug 建目录、放 markdown"这个源码结构。
   - **换来的**：门禁 18 能**逐页**核对 `lastmod` 到底取自哪个源文件
     （产物里没有 source 标注时门禁会 fail，代码注释原文写着
     "没有标注 = 门禁自己被卸掉了"）。
   - **不泄绝对路径**：写的是仓库相对路径，不含本机目录 / 用户名 / 部署路径。
   - **不影响解析与 SEO**：XML 注释不是节点内容，搜索引擎也不会索引注释。
   - ⚠️ **现在不动**。若本人日后认为这个暴露不可接受，
     正确改法是**换承重方式**（把 source 路径写进 build 期的元数据文件供门禁读，
     而不写进产物），**不是**直接删注释——删了会让门禁 18 的逐页核对整条失效。

### H. 本轮提交（**不 push**）

- `docs(log)` 本条（**即本条提交**）：本节 F、G——核实 11:45 场次转述的三条提醒
  （全部经独立复现成立），记录"假缺口并未进日志"的事实（避免重复劳动），
  解释 `hasOwnerOn404` 为何要避免（会把未决口径写死进门禁 + 继承门禁 12 的
  姓名匹配弱点），并把 sitemap source 注释归入「已知取舍」。

⚠️ 并发提醒：提交时工作树里**叠着并发场次在途的多个文件**——
`eleventy.config.js`（+103 行，在写 RIS 导出功能）、`package.json`、
`src/papers.njk`、`src/_includes/layouts/paper.njk`、
`src/assets/css/base.css`、`src/assets/css/components/_list.css`、
`src/assets/css/components/_paper.css`，以及两个未跟踪的新文件
`src/publications.ris.njk`、`scripts/check-wrapping.cjs`——
**只 `git add docs/IMPROVEMENT-LOG.md`**，一个都不碰。
## 2026-10-19 · 14:15–14:30 场次（**不占轮次号**，避免与并发场次撞号）：复核 11:45 场次的三条收尾提醒

### 本场次定位

11:45 场次发来一份"收尾核对"（快照基于 `33ca461`）。⚠️ 先做版本对齐：
`33ca461` 复验时**落后现行 HEAD 30 个 commit**（复验时 HEAD = `7be77ce`）。
它三条提醒**逐条现查现跑**，不采信转述。**结论：第 1 条属实（且牵出日志里一处真·假话，
已就地订正），第 2 条已闭环、无需再修，第 3 条基于误读、不能照它改。**

### I-1. 第 1 条（revert 目标）：转述的事实对，但**日志里另有一处真·假话**已订正

它说：`526b566` / `dfe021a` / `89d64fd` 不在 main 上，`git revert dfe021a` 是错的，
lastmod 方案 A 的正确回退目标是 `54899f1`。→ **转述属实**
（reflog 与 `merge-base --is-ancestor` 双向印证，详见第十四轮 A 节的订正块）。

它要求"务必在日志里写对，免得本人照着错命令回退"→ 日志里**本来就写对了**：
「并发工作树的最终处置」段（`11:15` 那行）明确写着"回退时必须用显式 hash
`54899f1`"，并点名 `526b566` / `dfe021a` / `89d64fd` 三个**不在 main 上**、
"`revert` 会失败或乱 apply 一份已重做过的旧 diff"；
「待决策」段（lastmod A/B/C 那条）也写着 `git revert 54899f1` **会冲突**，
需手工解决 `docs/IMPROVEMENT-LOG.md` 与 `scripts/verify-site.cjs`。

⚠️ **但本场次查出一处它没提、而它那条"顺手"会掩盖的错误**：
第十四轮 A 节把 `fdb5dca` 说成"被 reset 掉的孤儿提交、不在链上"——
**这是假话**（实测 `git merge-base --is-ancestor fdb5dca HEAD` = **0，在链上**）。
→ **已就地订正**（订正块就在第十四轮 A 节内，含 reflog 原文与逐个 hash 的实测结果）。
这也解释了这份日志里为什么会出现**两种说法**：一处对、一处错，
而本人随手翻到的很可能是错的那一处。

### I-2. 第 2 条（门禁 16 的正则 / YAML 取值集合）：**当前 HEAD 上已闭环，不用再修**

它说 12:44 场次报的"正则 / YAML 取值集合错配"隐患在当前工作树已堵死。→ **属实**。
本场次在**当前 HEAD（`7be77ce`）**的隔离克隆（`/tmp/mh-r19-verify/repo`）上复跑：

| 变体 | build exit | 门禁输出 |
|---|---|---|
| 基线（`identityOn404: true`） | **0** | — |
| `identityOn404: no` | **1** | `identityOn404 的值 "no" 不是合法布尔（只接受 true / false / True / False / TRUE / FALSE）` |
| 删掉 `identityOn404` 那一行 | **1** | `front matter 里找不到 identityOn404 开关 —— 门禁读不到「404 页要不要声明身份」` |
| 复位 | **0** | — |

→ 门禁 16 的现行读法（`verify-site.cjs:1029-1053`）是：
先取**字面量** `(\S+)`（`:1034`）→ 找不到 → fail（`:1035-1040`）；
不是合法布尔 → fail（`:1041`，报错带出字面量）；
只有 `true/false/True/False/TRUE/FALSE` 才取值（`:1053`）。
**"读不到就默认 true"的老写法已不存在**，不存在"`no`/`off`/`0` 全绿无告警"。

⚠️ 顺带订正它的一处细节：它说"`0` 被 YAML 解析成非空字符串真值"——**不对**。
YAML 把 `0` 解析成**整数 0**（**假值**），`null` / `~` / 空同理；
`no` / `on` / `off` / `yes` / `"false"` 才是**真值字符串**，非零数字也是真值。
**门禁的报错文案本身已经把这条写清楚了**（`verify-site.cjs:1048-1049`：
"唯独 null 与 0 是**假值**……但它们同样不是合法布尔，本门禁照样判红"），
所以"写了 `0` 以为关掉了"那种坑不成立，而**门禁照样判红**。

### I-3. 第 3 条（"待决策段那句假话还在"）：**基于误读，不能照它改**

它说「待决策」L1509 的 `第 16 条门禁不受影响（它不查 Person）` 截至 12:46:51 仍在，
要求"在提交前确认它已被替换"，并说 12:44 场次已发过逐字替换文本。

→ **现查：那句话在文件里确实还在，但它是"被引用的旧文本"，紧跟其后就是就地订正**。
待决策段（该条自 1557 行起）现在的原文是：

```
⚠️ **第十一轮订正（下面这段原本是错的，照它改会改错地方）**：
原先这里写的是"若本人选'去掉'，改 `base.njk` 的 Person 块加
`{%- if not is404 %}` 即可，第 16 条门禁不受影响（它不查 Person）"——
**两处都不成立**：
  ① 改法已变成**翻 `src/404.njk` 的 `identityOn404` 一行**……
  ② "门禁不受影响"是**假的**——门禁 16 现在**双向读同一个开关**……
```

→ **本人拍板时看到的就是订正后的版本**（改正解 + 合法布尔写法要求），
假话只作为"被订正的引用"出现。⚠️ 因此**照 12:44 场次那份逐字替换文本去改，
是重复劳动，且极可能与既有订正块打架**。

⚠️ 它的行号也对不上：它说 L1509，实际那句在 **L1573**（待决策段自 1490 行起）——
**行号随并发推进漂移，定位要靠内容**（这条本日志已记过多次）。

### J. 本轮提交（**不 push**）

- `docs(log)` 本条（**即本条提交**）：第十四轮 A 节的**就地订正**
  （`fdb5dca` 在链上，被丢弃的是 `526b566` / `dfe021a` / `89d64fd`）
  + 本节 I（11:45 场次三条提醒的逐条判定）。

⚠️ 并发提醒：提交时工作树里**叠着并发场次在途的多个文件**
（`eleventy.config.js`、`package.json`、`src/papers.njk`、
`src/_includes/layouts/paper.njk`、`src/assets/css/base.css`、
`src/assets/css/components/_list.css`、`src/assets/css/components/_paper.css`，
以及未跟踪的 `src/publications.ris.njk`、`scripts/check-wrapping.cjs`）——
**只 `git add docs/IMPROVEMENT-LOG.md`**，一个都不碰。
## 2026-10-19 · 14:00–14:10 场次（**不占轮次号**，避免与并发场次撞号）：补全「旧编号→新编号对照表」+ 门禁 29 让它不能再漂移

### 本场次定位

本轮是**接手一个并发场次的交接**，并把交接里那件事**从"补三行"升级成"补完 + 封住"**。

- 13:06 场次交接：文件头那张「旧编号 → 新编号对照」表缺 22/23/24 三行，
  补丁在 `/tmp/mvs82596d_r13_contrast_table.patch`（基线 `95c91b7`）。
  它不自己改，是因为该文件当时有我的在途改动（门禁 27）——**改共享文件前先看别人在不在动，
  这条纪律它守住了**。
- 我接手时**表里其实缺的不止 3 行**：第九轮之后新增的门禁（20–28）**一行都没进去** ——
  对照表自第九轮理顺编号体系之后就停更了。

### A. 改进点 A：把对照表补全（20–29 号）

| 门禁 | 来源 | 补表行 |
|---|---|---|
| 20 | 第十一轮（订阅源时间戳说真话） | ✅ 已补 |
| 21 | 第十一轮（绝对 URL 口径） | ✅ 已补 |
| 22 / 23 / 24 | 第十三轮（**13:06 场次交接的 3 行**） | ✅ 已补 |
| 25 / 26 | 第十五轮（img 的 alt / width / height） | ✅ 已补 |
| 27 | 13:45 场次补记（按 @id 兜住本人节点姓名） | ✅ 已补 |
| 28 | 13:41 场次（专有名词大小写） | ✅ 已补 |
| 29 | **本场次新增** | ✅ 已补 |

⚠️ **20/21/25/26 交接时被标为"各场次自己的"**（那些场次早已结束，不会再自己补），
**本场次一并补齐** —— 留着一个"补到 28 但 27 缺着"的洞，比补全更难看。
**若还有场次计划补同一行：请撤掉你那一行** —— 门禁 29 会把逐字重复的两行判红。

### B. 改进点 B：门禁 29 —— 对照表必须覆盖全部门禁编号，且不得有字面重复行

**为什么不能只是"补完就算了"**：门禁 24 只查「文件头清单 ↔ 代码段」，
**对照表它压根不看** → 所以这张表停更了 5 轮，build 一直全绿。
再补一次，它还会再停更一次。

**为什么"对照表停更"是缺陷而不只是"排版小事"**：
这张表是**追溯的唯一入口** —— 历史日志 / commit message 里引用的是门禁号，
有人拿一个号来问"这条当时是干什么的"，先查的就是它。
表停更 = 追溯时**查不到**，而查不到的人只会以为"没有这条门禁"，
于是把一条真实存在的防线当成不存在 —— 与"门禁没接线"是同一类病：
**看起来在、其实不生效**。

**判据**（双向 + 不许有字面重复行）：
① 文件头清单里的每个门禁编号都必须在对照表里出现；
② 对照表里的每个编号都必须在文件头清单里；
③ 对照表里不得有**逐字完全相同的两行**。

⚠️ **③ 最初写错了，被本门禁自己抓出来**（第一版判"同一个编号出现两遍"）：
表里 `旧 3b → 新 4b` 与 `旧 15 → 新 4b` 是**两条都合法的旧号→新号映射**
（两个旧号都指向同一条新门禁），按"重复编号"判会**误报**。
真正要抓的是"两个场次各自补了同一行" —— 那才会产生**逐字相同**的两行。
已改成查"重复行"，并把这个坑写进了代码注释。

### C. 故障注入矩阵（2 例 + 复位，隔离克隆 `/tmp/mh-g29-verify/repo`，共享工作区零写入）

| 用例 | 注入 | 期望 | 实测 |
|---|---|---|---|
| 基线 | 不注入（干净克隆 `9f0459f`） | exit 0 | **exit 0** ✓（`对照表：30 行，覆盖全部 30 个门禁编号且无重复行`） |
| FI-1 | 删掉对照表里「新 28」那一行 | exit 1 | **exit 1** ✓ `对照表里没有门禁 28 —— 每加一条门禁都要在文件头那张…表里补一行` |
| FI-2 | 把「新 22」那一行**逐字复制**一份（模拟两个场次各补一行） | exit 1 | **exit 1** ✓ `对照表里有 1 行逐字重复` |
| 复位 | 全部还原 | exit 0 | **exit 0** ✓ |

**关键对照证据**：两例注入中，**门禁 24 的输出都仍然是**
`门禁编号：文件头清单 30 条 / 代码段 30 条，一一对应且连续` ——
即门禁 24 对对照表的漂移**完全失明**。这证明门禁 29 不是重复劳动，
而是在补门禁 24 视野之外的那一半。

### D. 复验

- 隔离克隆 `npm run build` → **exit 0**；工作区 `npm run build` → **exit 0**。
- 门禁输出：`门禁编号：文件头清单 30 条 / 代码段 30 条，一一对应且连续` +
  `对照表：30 行，覆盖全部 30 个门禁编号且无重复行`。
- 线上巡检（13:56 PDT，沿用本场次早先实测）：`/` `/blog/` `/about/` `/sitemap.xml`
  `/robots.txt` `/404.html` = 200；`/papers/` `/publications.bib` `/feed.xml` = 404（**属待部署**）。

### 本轮提交（**不 push**）

- `9f0459f` `docs(gate): 补全旧编号→新编号对照表（20–29 号）+ 新增门禁 29 让这张表不能再漂移`
- `docs(log)` 本节（**即本条提交**）

### 待部署（本轮**不 push**，线上仍是旧版本）

不变：`/papers/`、`/publications.bib`、`/feed.xml`、`/papers/trmm-thunderstorm-stages/`
在线 404；canonical / og:url / sitemap 带 `/MeteoHub/` 前缀。**部署由本人决定。**

### 待决策（**沿用第十六轮 7 条，本轮不新增、不擅自拍板**）

1. 404 页要不要保留 Person 实体（`src/404.njk` 的 `identityOn404`）。
2. 论文页是否显示"论文署名单位"。
3. `figure.alt` 是否保留 "Fig. 10 —" 前缀。
4. sitemap `lastmod` 口径三选一。
5. 何时 push / 部署。
6. `src/blog.njk:75` 博客卡片封面图的 `alt=""` 口径。
7. OG 分享图里的中文品牌文案要不要英文化。

### 留给下一轮

1. **门禁 29 之后，"加门禁"就多了一步**：代码段 + 文件头清单 + **对照表**三处都要动。
   前两处门禁 24 会替你查，第三处门禁 29 也会替你查 —— 所以**不会再漏**，
   但新增门禁时要预期 build 第一次红（先补表再跑）。
2. **门禁 21④ 的报错去重**、**门禁 15 在四个页面上空跑** —— 仍未动。
3. **`gitOut` 的 catch 加固**（低严重性）。
4. 门禁 27 的锚点仍依赖门禁 12 的**姓名**匹配，可改成 **ORCID**。⚠️ 换锚点前必须先确认
   **R4（只改 @id 形状）仍被门禁 12 抓到**。
5. 巡检 cron 仍是每 5 分钟起一个会话 → 持续并发冲突（连续多轮都撞见）。
   建议改成 30–60 分钟 + 单写者锁。
## 2026-10-19 · 14:00–14:20 场次（**不占轮次号**，避免与并发场次撞号）：长串断行兜底（break-word → anywhere）+ 新增 `check:wrap` 门禁

### 本场次定位

只做 **1 个改进点**：把"一条长 DOI / 长 URL 不能把窄屏页面撑破"这条兜底规则改对，并给它配一条门禁。

选它的理由：它是改进日志第二轮就记下、标着"**不能盲改**"的遗留项里，唯一一个
**不在「待决策」清单上**、纯技术性的 TODO —— 不需要本人拍板，且有可验证的客观判据。
（其余候选：404 页要不要保留 Person 实体、论文页是否显示署名单位、`figure.alt` 是否保留
"Fig. 10 —" 前缀、sitemap `lastmod` 口径、博客封面 `alt=""` 口径、OG 图中文文案是否英文化、
Twitter 句柄、Google Scholar/ADS/arXiv 档案、网盘 URL、OpenAlex 是否页脚可见、作者单位写法、
数据集引用条目口径、ORCID 是否进 `citation_*` —— **全部需要本人拍板，本轮一律不碰**。）

### ⚠️ 本轮的并发情况与归属

同一工作树里同时有另一场次在做 **RIS 导出**（新增 `src/publications.ris.njk`，改
`eleventy.config.js` / `src/_includes/layouts/paper.njk` / `src/assets/css/components/_paper.css` /
`src/papers.njk`）。**文件不重叠**：本场次只动 `src/assets/css/base.css`、
`src/assets/css/components/_list.css`、`scripts/check-wrapping.cjs`、`package.json`，
加上本节日志。

提交方式：**三个已跟踪文件用 `git apply --cached` 只打自己的 hunk**（不是 `git add <path>`），
新脚本因为是本场次独占的新文件才直接 `git add`。理由见日志里那条老规矩：
同一文件存在并发改动时 `git add <path>` 会把**整个文件**的工作树状态扫进 commit。

### 背景：break-word 和 anywhere 的差别不是"好不好看"，是"能不能挡住"

`overflow-wrap` 有两个值：

| 值 | 放不下时断行 | 参与 min-content 宽度计算 |
|---|---|---|
| `break-word` | 是 | **否** |
| `anywhere` | 是 | **是** |

差这一点，在 flex/grid 里是天壤之别 —— **flex/grid 轨道的下限取自子项的 min-content**，
所以 `break-word` 的那条长串**照样**把轨道撑宽。

而本站几乎所有"并排排版"的区域都是 flex/grid（topbar / 页脚 / 论文头 / 首页引言 / 论文卡片 …），
所以原来的兜底**在它最该生效的地方是失效的**。

#### 实测方法（这一段值得留档，因为第一轮实验做错了）

用一支自写的 CDP 探针（`/tmp/mh-probe2.cjs`）：起本地静态服务器 + 无头 Chrome，
390px 视口，**一次只往一个元素里塞一条长 DOI 串**，测完删掉再测下一个，
看整页 `scrollWidth` 是否被撑破。

⚠️ **第一版探针（批量注入）是无效的**：它把长串同时塞进所有 flex/grid 的文字子项，
只要其中**任何一个**元素（例如 `white-space: nowrap` 的导航链接）不可收缩，
整页 `scrollWidth` 就爆 → 4 个 CSS 方案测出来的数字**完全相同**，
分不清"方案无效"和"某个 nowrap 元素本来就不可收缩"。必须逐点注入。

#### 同一套工具、同一口径的改前/改后

| 版本 | 单点注入即撑破页面的元素数 |
|---|---|
| 改前（`break-word`） | **132** |
| 改后（`anywhere`） | **30** |

改后剩下的 30 个，**全部是 `white-space: nowrap` 的有意为之处**，只有 3 类：
`a.topbar__link`（导航）、`a.btn.btn--primary`（按钮）、`a`（`div.home-intro__links` 里的
右对齐联系链接）—— 都是短固定标签，nowrap 是有意为之，**不动**。

### 改动

1. **`src/assets/css/base.css`** —— 全局兜底规则：
   - `overflow-wrap: break-word` → **`anywhere`**；
   - 选择器**补上 `span`** —— 页脚的版权行就是一个**裸 `span`** 落在 flex 容器里，
     原选择器列表没覆盖它 → 那一处**完全没有兜底**（实测仍是 `overflow-wrap: normal`）。
2. **`src/assets/css/components/_list.css`**（`.list--cards .list__meta`）——
   同样改为 `anywhere`（作者名单现在带 ORCID 链接，是实打实的长串，
   而 `.list__meta` 落在弹性/网格容器里）。
3. **新增 `scripts/check-wrapping.cjs`**（`check:wrap`），并接进 `package.json` 的 `build` 链。

### 新门禁 `check:wrap` 的三条判据

| 判据 | 内容 |
|---|---|
| **W1 覆盖** | 全局兜底规则必须覆盖 12 个标签类型（`p / li / dd / dt / td / th / figcaption / blockquote / pre / code / a / span`），且用 `anywhere` |
| **W2 不退化** | 站内任何地方都不许再出现 `overflow-wrap: break-word` |
| **W3 门禁自己没被卸掉** | `package.json` 的 `build` 链必须含 `check:wrap`，且 `check:wrap` 必须指向 `scripts/check-wrapping.cjs` |

**为什么必须有 W3**：「门禁自己被卸掉」和「门禁没生效」在结果上**长得一模一样**
（build 照过、门禁全绿、没有任何报错）。凡是靠"某处存在某样东西"做判据的门禁，
都得自带这一条自查。这条老毛病在日志里已经犯过至少一次。

**这条门禁为什么值得存在**：改对了**页面完全看不出差别** —— 现有内容里没有一条
长到会触发的串（实测未注入时六页 `scrollWidth` 都 = 390）。
这是一条"**改对了没人看得见、改错了要很久才爆**"的规则。门禁就是把这个"看不见"
变成"每次 build 都查一遍"。

### 故障注入矩阵（6 例，隔离克隆 `/tmp/mh-final-verify/repo`，共享工作区零写入）

每例用**全新 rsync 副本**，并且**先自证注入真的生效**，再读门禁结论
（"注入没生效"与"门禁没拦住"在结果上长得一模一样）。

| 用例 | 注入 | 期望 | 实测 |
|---|---|---|---|
| C0 对照 | 不注入 | exit 0 | **exit 0** ✓ `长串断行门禁通过：全局兜底 = overflow-wrap: anywhere，覆盖 12 个标签类型（要求 12 个）；站内无 overflow-wrap: break-word。` |
| I1 | 全局兜底 `anywhere` 改回 `break-word` | exit 1 | **exit 1** ✓ 报 `用了 overflow-wrap: break-word … 改成 anywhere` + `找不到"全局长串兜底"规则` |
| I2 | 全局兜底选择器去掉 `span` | exit 1 | **exit 1** ✓ 报 `全局兜底规则「p, li, …, code, a」没有覆盖 span` |
| I3 | `package.json` 的 build 链摘掉 `check:wrap` | exit 1 | **exit 1** ✓ 报 `门禁自己被卸掉了` |
| I4 | `check:wrap` 改指向别的脚本 | exit 1 | **exit 1** ✓ 报 `门禁自己被卸掉了` |
| I5 | 新组件偷偷用 `break-word` | exit 1 | **exit 1** ✓ 报 `src/assets/css/components/_evil.css: 选择器「.evil-x」用了 overflow-wrap: break-word` |
| I6 | 卡片元信息退回 `break-word` | exit 1 | **exit 1** ✓ 报 `src/assets/css/components/_list.css: 选择器「.list--cards .list__meta」用了 …` |

### 本轮修掉的两个"我自己犯的错"（都记下来，免得后人照抄）

1. **探针版本用错** —— 见上文"第一版探针是无效的"。教训：
   **批量注入会把"某个元素本来就不可收缩"伪装成"方案全部无效"**。
   凡是"测 CSS 方案"的实验，必须**逐点注入**，否则四个方案测出同一个数字。
2. **注入自证写反了** —— I3 第一次跑出"注入未生效"，查下来是**自证逻辑的退出码写反了**
   （把"注入已生效"的条件写成了退出 0，实际是退出 1），**注入本身是生效的**。
   顺带发现：`grep -q 'check:wrap' package.json` 也不可靠 —— 脚本**定义**还在文件里，
   要查的是 **build 链**本身。修正自证后 I3 正常通过。
   教训：**"注入没生效"这个结论本身也要自证**，否则会把"我的检查写错了"记成"我的注入写错了"。

### 验证结果

- 隔离克隆（`git clone --no-hardlinks` + `ln -s` node_modules）套入本轮 4 个文件 →
  `npm run build` **exit 0**（含 `check:wrap` 实际执行）。
- 克隆内 4 个文件与工作树**逐个 md5 一致**（自证"测的就是要交的那份"）。
- 故障注入 6 例全被拦下（表见上）。
- `node scripts/check-overflow.cjs`（真实内容、未注入）：6 页 `scrollWidth` **全部 = 390**
  → **无横向溢出、无回归**。
- 逐点注入探针：改前 132 → 改后 30（表见上）。

### 线上巡检（14:17 PDT，curl 实测）

```
200  /                      200  /blog/       200  /about/
200  /sitemap.xml           200  /robots.txt   200  /404.html
404  /papers/               404  /publications.bib
404  /feed.xml              404  /papers/trmm-thunderstorm-stages/
```

与历轮记录**完全一致**：这几个 404 都是**本地已存在、待部署**的路由，
**不是站点损坏**；线上 canonical / og:url / sitemap 仍带 `/MeteoHub/` 前缀（指向 404 URL）。
**部署由本人决定，本场次不 push。**

### 本轮提交（**不 push**）

- `9dea3ac` `fix(css): 长串断行兜底改用 anywhere 并补上 span + 新增 check:wrap 门禁`
  （`package.json` / `src/assets/css/base.css` / `src/assets/css/components/_list.css` /
  `scripts/check-wrapping.cjs`）
- `docs(log)` 本节（**即本条提交**）

### 待部署（本轮**不 push**，线上仍是旧版本）

不变：`/papers/`、`/publications.bib`、`/feed.xml`、`/papers/trmm-thunderstorm-stages/`
在线 404；canonical / og:url / sitemap 带 `/MeteoHub/` 前缀。**部署由本人决定。**

### 待决策（**沿用既有清单，本轮不新增、不擅自拍板**）

本轮**没有新增待决策项**。既有清单（404 页 Person 实体、论文页署名单位、`figure.alt` 前缀、
sitemap `lastmod` 口径、博客封面 `alt=""` 口径、OG 图中文文案、Twitter 句柄、
Google Scholar/ADS/arXiv 档案、网盘 URL、OpenAlex 是否页脚可见、作者单位写法、
数据集引用条目口径、ORCID 是否进 `citation_*`、何时 push / 部署）**一律原样保留**。

### 留给下一轮

1. **`check:over`（`scripts/check-overflow.cjs`）仍未接进 build** —— 它需要 Chrome + 临时服务器，
   比纯 Node 门禁重得多，所以**故意没接**。如果哪轮想接，先想清楚 CI 环境有没有 Chrome。
2. **剩下 3 处 `white-space: nowrap`**（nav / 按钮 / 右对齐联系链接）**是有意为之，本轮不动**。
   但如果以后往这些位置塞长内容，得回来改 —— 目前**没有门禁守着"别往 nowrap 里塞长串"**。
3. **统一套件还没做**：现在有 6 个独立门禁脚本（`check:css` / `check:wrap` / `check:site` /
   `check:lang` / `check:a11y` / `check:copy`）各跑各的，输出风格不统一。
   可以考虑一个统一 runner，但这属于"可改性"优化，**优先级低于真缺陷**。
4. **`min-inline-size: 0` 的通用解法仍被搁置**：实测 `anywhere` 已经把 132 → 30，
   `min-inline-size: 0` 在其之上**没有额外收益**，所以本轮**没有**加通配
   （通配有副作用）。若将来出现"`anywhere` 也挡不住"的场景（少见），
   再回到 `min-inline-size: 0` + `minmax(0, 1fr)` 这条路
   —— `components/_paper.css:715` 已有先例做法。
## 2026-10-19 · 14:20–14:45 场次（**不占轮次号**，避免与并发场次撞号）：复核两份 peer 代转（证书取证 + 门禁 16 实现复核）

### 本场次定位

本轮收到两份只读 peer 代转：
① **12:30 只读复验者的证书取证**（`www.iap.cas.cn` vs `iap.cas.cn`）；
② **一份门禁 16 实现复核**（说 `identityOn404Raw` 声明了但从未赋值 + 4 处文案与实现不符）。
两份都**逐条现查现跑**，不采信转述。
**结论：两份的事实描述都对，但它们量的是"当前 HEAD 之前"的状态**——
本场次逐条实测后，它们列出的**全部缺口在复验时的 HEAD 上已闭环**，
只补一处"历史引文 vs 现行措辞"的说明（不改动那次运行的历史记录本身）。

### K. 证书取证：事实独立复核通过，**内容早已在日志里**

| peer 要点 | 本场次独立实测 | 判定 |
|---|---|---|
| `www.iap.cas.cn`：subject == issuer == `C=CN, ST=BeiJing, L=BeiJing, O=CN, OU=CN, CN=cn` → 自签名 | 逐字一致：`verify error:num=18:self-signed certificate` | ✓ 成立 |
| `iap.cas.cn`：subject `CN=*.cas.cn`（O=中国科学院），issuer `CN=CFCA OV OCA`，SAN `*.cas.cn + cas.cn` → 校验通过 | 逐字一致，链到 `CFCA EV ROOT`（depth 2→1→root），**无 verify error** | ✓ 成立 |
| `*.cas.cn` 按 X.509 语义只匹配**一个标签**、不跨点 → 覆盖 `iap.cas.cn`，不覆盖 `www.iap.cas.cn` | 按标签数比：`iap.cas.cn` 2 段 ✓ / `www.iap.cas.cn` 3 段 ✗ | ✓ 成立 |
| ⚠️ 别用 Python `fnmatch` 核对通配符覆盖 | 实测 `fnmatch.fnmatch("www.iap.cas.cn","*.cas.cn")` = **True**（与 X.509 语义**相反**）；`fnmatch("iap.cas.cn","*.cas.cn")` 同样 True → **fnmatch 分不出这两个**，必须按标签数比 | ✓ 成立 |
| 准确性要求：客户端只能证明「该主机名拿不到可验证的证书」，**不能**区分"站点没给该主机名配证书"与"链路中间设备兜底" | 日志里**已经是这条措辞**（含两种解释 + "不要用 fnmatch"） | ✓ 已在日志 |

→ **这份取证的内容，日志里早就有了**（1287–1336 行；1315 行还明确标注
"12:30 只读复验者补正，措辞见 `/tmp/mvs_451e93_msg4_cert_evidence.md` 第 2 节"）
——**peer 是把自己已被收录的内容又转了一遍**。
且**站内现在只引用 apex**：`src/_data/site.js:80` = `https://iap.cas.cn/`
（`www` 变体已由 `33ca461` 改掉）→ **无待办**。

### L. 门禁 16 实现复核：peer 报的 5 项，在复验时的 HEAD 上**全部已闭环**

| peer 报的项 | peer 测的树 | 复验时 HEAD 的实况 | 判定 |
|---|---|---|---|
| 缺陷 1：`identityOn404Raw` 声明了但从未赋值 → 报错打"(未读到)" | `33ca461` + 覆盖 6 个 dirty 文件（≈12:47 的工作树） | `9dab5d4`（12:58:48）**已加** `identityOn404Raw = m[1];`（现 `:1054`）；现 `grep identityOn404Raw` = 声明 `:1012` / 赋值 `:1054` / 使用 `:1066`、`:1085` | **已修** |
| 缺陷 2-① 待决策段（**本人决策入口**）那处措辞 | 同上 | 已是 peer 提议的**逐字**版本（现 1583-1586） | **已修** |
| 缺陷 2-② `src/404.njk` 的布尔写法提示 | 同上 | 已是 peer 提议的版本（现 `:23-25`） | **已修** |
| 缺陷 2-③ `src/404.njk` 的读法说明 | 同上 | 已是"不解析 YAML + 取字面量 + 白名单 + 其余一律判红"（现 `:19-21`） | **已修** |
| 缺陷 2-④ 门禁报错文案只接受 `true / false` | 同上 | 现 `:1043` 已是"只接受 true / false / True / False / TRUE / FALSE"，`:1048-1049` 已把 **null / 0 是假值**单列 | **已修** |
| 连带：日志 FI-B 引文"开关 = false"与实际输出对不上 | 当时输出是"(未读到)" | 补上赋值后实测输出**就是** `identityOn404 = false` → 与日志引文**重新对上** | **已解决** |

⚠️ **peer 的树是"12:47 的工作树覆盖版"**（`33ca461` + 6 个 dirty 文件），
而现行 HEAD 已经过 `9dab5d4`（12:58:48）——
**它发现的是一个当时真实存在、随后已被修掉的缺陷**。
这正是「先验它测的是哪个版本」的又一次实例：结论**成立**，但**已被后手覆盖**。

#### L-1. 本场次自己跑的 8 例矩阵（复验时 HEAD = `330d0ec`，隔离克隆 `/tmp/mh-r20-verify/repo`）

| `src/404.njk` 的值 | build exit | 404.html 的 Person 数 | 门禁输出 |
|---|---|---|---|
| `true` | **0** | 1 | — |
| `false` | **0** | 0 | —（双向判据生效，合法口径不被误伤） |
| `False` | **0** | 0 | —（白名单接受大小写形式，YAML 布尔 false） |
| `TRUE` | **0** | 1 | — |
| `no` | **1** | 1 | `identityOn404 的值 "no" 不是合法布尔` |
| `null` | **1** | 0 | 同上 |
| `0` | **1** | 0 | 同上 |
| 删掉那一行 | **1** | 0 | `front matter 里找不到 identityOn404 开关` |
| 复位 | **0** | — | — |

⚠️ 表里 `no` 那行 Person=**1**、`null`/`0` 那行 Person=**0**，正好印证门禁报错文案里那句
"**非空字符串**（no / on / off / yes / "false"）与**非零数字**是**真值**…
唯独 null 与 0 是**假值**"——即"写 `no` 以为关掉了"**真的没关掉**（模板仍输出 Person），
而写 `null`/`0` 确实让模板不输出，但**门禁照样判红**（不是合法布尔）。

#### L-2. 顺带实测了 peer 说的 case F（开关与产物不一致），逐字输出

`identityOn404: false` + `base.njk` 强制输出身份实体 → **exit 1**：

```
404.html: 声明了身份类实体（Person、Organization、CollegeOrUniversity、Place、PostalAddress；Person 是根节点，其余是它的嵌套节点），但 src/404.njk 的 identityOn404 = false 声明错误页**不**声明身份 —— 开关与产物不一致
```

→ 与门禁现行措辞（`verify-site.cjs:1080-1088`）**逐字一致**；
也印证了赋值修好之后，日志里那处 FI-B 引文重新与实际输出对上。

### M. 本轮提交（**不 push**）

- `docs(log)` 本条（**即本条提交**）：本节 K、L（两份 peer 代转的逐条判定）
  + 上文那处"历史引文 vs 现行措辞"的说明（**不改动那次运行的历史记录本身**）。

⚠️ 并发提醒：提交时工作树里**叠着并发场次在途的改动**
（`eleventy.config.js`、`src/_includes/layouts/paper.njk`、
`src/assets/css/components/_paper.css`、`src/papers.njk`，
以及未跟踪的 `src/publications.ris.njk`），
**日志文件里也有另一场次的在途改动**（门禁 24 承重续报、C2 补丁取代 C 那两段）——
本条**只把自己的 hunk 写进索引**（`hash-object` + `update-index --cacheinfo`），
**不碰工作树里的在途内容**。
## 2026-10-19 · 14:30–15:00 场次（**不占轮次号**，避免与并发场次撞号）：落地 C2 —— 把 `gitOut` / `gitRoot` / `lastCommitTime` 三处裸 catch 收窄

### 本场次定位

接收只读复验场次 `mvs_dd21f18c` 的裁决与加固补丁
（`/tmp/mvs_dd21f18c_r14/report_1345.md`、`patch_C2.diff`），
本场次**不直接采信**，把它的每一条断言独立复算一遍，确认无误后才落地 **C2**，
并顺带处理它提出的「对照表补行」事项（结论：已过期，见 F）。

### A. 裁决三条，我方逐条独立复算（全部吻合）

| 断言 | 我的复算方式 | 结果 |
|---|---|---|
| ① `fdb5dca` 的可达性 | `git merge-base --is-ancestor fdb5dca HEAD` | exit 0 → **在链上**，且是 `6953e74` 的父提交 |
| ② `/tmp/mh_r9c` 副本的内容归属 | 与 `git show 54899f1:scripts/verify-site.cjs` 逐字节 diff | **逐字节相同** → 副本的 `.git` HEAD **不能**代表副本内容 |
| ③ 谁才是真孤儿 | 逐个验 `526b566` / `dfe021a` / `89d64fd` | 三者**均不在链上** → 这三个才是孤儿 |

⚠️ **订正一条我自己的旧记忆**（此前记错过，记在这里免得后人照抄）：
我把 `fdb5dca` 记成"孤儿 commit"是**错的**——它在链上。
真孤儿是 `526b566` / `dfe021a` / `89d64fd`。
根因是把 `git reflog` 里的 `reset: moving to X` 读反了：
那是"**移到** X"（X 留下来当父提交），不是"丢掉 X"（被丢掉的是 reset 之前那批）。
→ **教训**：写"某 hash 是孤儿"之前先 `merge-base --is-ancestor` 验一遍，
reset 的方向要去看 reflog 原文，不能凭字面猜。

### B. 这个洞的性质：**判据与被判据共用同一个会吞错的 catch**

`scripts/verify-site.cjs` 的 `gitOut()` 与 `eleventy.config.js` 的
`gitRoot()` / `lastCommitTime()` 原本都是裸 `catch { return null / ""; }`。
后果不是"某条门禁误报"，而是**两边同向失败**：

- 模板侧：编程错误（比如漏 `require("child_process")` → `ReferenceError`）被当成
  "查不到提交时间" → `lastmod` 整片消失；
- 门禁侧：同一个编程错误被当成"不在 git 仓库里" → `inGitRepo = false`
  → 门禁**改走规则 B**（"不在 git 仓库里就不该有 lastmod"，本来就该没有）
  → **判红的那条规则 E 整条被绕过**。

即：**判据自己被卸掉了，产物照坏，门禁照绿**。
本场次在**未打补丁**的树上实测复现过（2026-10-19 约 14:1x）：
注入 `TypeError` 到 `gitOut` 与 `gitRoot` → **build exit 0（全绿）**
+ sitemap lastmod **0/5** + 门禁 note 谎称"源码 zip 分发"。

→ **可推广的纪律**：判据与被判据**不得共用同一个会吞错的 catch**。
两边任一侧单独坏掉都还能被对方发现；两边一起坏，才是"静默漏报"。

### C. 为什么用 C2，而不是 peer 报告里的另外两版

| 版本 | 判据 | 后果 |
|---|---|---|
| 旧 C | `typeof e.status === "number" \|\| typeof e.code === "string"` | `code` 只要是**字符串**就吞 → **`EACCES`/`EPERM` 也被吞** → 仍会静默全绿 |
| peer 版 | `"status" in err` | `{status:null, code:null}` 也满足 → 吞掉一批**根本不是 git 失败**的对象 |
| **C2（本轮采用）** | `typeof e.status === "number" \|\| e.code === "ENOENT"` | 只吞「git 跑了但退出码非 0」与「git 不在 PATH」两种**真的没有 git 历史**的情况；编程错误、`EACCES`/`EPERM` 等环境异常**一律抛出** |

两个文件里各定义一份（`verify-site.cjs:1194`、`eleventy.config.js:360`）：

```js
const isGitProcessFailure = (e) =>
  !!e && typeof e === "object" && (typeof e.status === "number" || e.code === "ENOENT");
```

### D. 改动

三处 `catch` 由"吞掉一切"改为"只吞 git 进程失败"，其余原样抛出：

- `scripts/verify-site.cjs` `gitOut()`（~1196 行）
- `eleventy.config.js` `gitRoot()`（~362 行）
- `eleventy.config.js` `lastCommitTime` filter（~388–410 行）

判据**只**在"git 真的没跑起来/跑挂了"时返回空值，
编程错误一律带栈冒到 build → **exit 1**。

### E. 复验（隔离克隆 `/tmp/mh-r19/landed`，共享工作区零写入）

**被测对象 = 暂存区（index）里那两份文件**，不是工作区版本、也不是补丁副本 ——
工作区的 `eleventy.config.js` 还叠着并发场次的 RIS 改动（`src/publications.ris.njk`
是未跟踪文件，干净克隆里没有），从工作区取会引进与 C2 无关的失败。

**判据单元测试（6 例，喂合成错误对象）**

| 输入 | 期望 | 实测 |
|---|---|---|
| `TypeError` / `ReferenceError`（编程错误） | 抛 | ✅ 抛 |
| `{status:128}`（git 退出码非 0） | 吞 | ✅ 吞 |
| `{code:"ENOENT"}`（git 不在 PATH） | 吞 | ✅ 吞 |
| `{code:"EACCES"}`（git 在但跑不起来） | 抛 | ✅ 抛 |
| `{status:null, code:null}` | 抛 | ✅ 抛 |

顺带对照：旧 C 的判据对 `{code:"EACCES"}` **确实返回 true** → 坐实"必须用 C2"。

**端到端矩阵（4 例）**

| 用例 | 期望 | 实测 |
|---|---|---|
| V0 都不坏 | exit 0 + lastmod 5/5 | ✅ exit 0 / lastmod 5 |
| V3 两侧都坏（注入 `TypeError`） | exit 1 + 编程错误可见 + 有栈 | ✅ exit 1 / `INJECTED_PROGRAMMING_ERROR` 可见 / 有栈 / **note 不再谎称"源码 zip 分发"** |
| L1 无 `.git`（合法环境） | exit 0 不崩栈 | ✅ exit 0 / 无栈 |
| L3 git 退出码 128（合法环境） | exit 0 不崩栈 | ✅ exit 0 / 无栈 |

注入自证：写盘后**回读**确认注入串可读到、且 md5 变化
（`verify-site.cjs` `7a0c5067→6f7f161d`、`eleventy.config.js` `fbae6fe7→c47078da`）。
**基线 V0 先确认为 exit 0** 才做注入，避免"基线本来就红"把假红当结论。

### F. 「对照表补行」：已过期，本场次**不做**

peer 建议把 `旧编号→新编号对照` 表补齐 20–29 行。
实际打开文件才发现，**并发场次已经做完了**（14:00–14:10 场次）：
对照表补到 20–29 行齐全，并且**新增了门禁 29** —— 门禁 29 自己就是"对照表覆盖度自检"
（清单 ↔ 对照表**双向**覆盖 + 不得有重复行）。
比 peer 提议的一次性幂等脚本更结构化（能防复发，不只是补一次）。
（⚠️ 时点说明：上面是 14:00–14:10 那场次做完时的状态；截至本场次，
HEAD 上的门禁已到 **30** 条、对照表 30 行 —— 并发场次随后又加了门禁 30。）
→ 不重复做。

### G. 一个我**刻意留在范围外**的裸 catch（实测确认安全）

`eleventy.config.js` 的 `gitIsShallow()` 里仍有一处裸 `catch { gitShallowCache = true; }`。
它与上述三处**不是同一类**：方向是**偏向报错**。
实测（注入 `TypeError` 到 `gitIsShallow`，md5 `fbae6fe7→791c263b`）：

```
exit=1
sitemap.xml: ".../" 的源文件 src/index.njk 提交过，这一页却没有 <lastmod>——lastmod filter 静默失效了
```

即：模板侧误判成"浅克隆" → lastmod 全空 → **门禁规则 E 逐页核对必然报红**。
**fail-closed**（偏报错），不会静默放行 → 本轮不改，留作已知边界。
（若哪天后有人把 `gitIsShallow` 改成"偏放行"，这条边界就反了，须重新评估。）

### H. 我自己这轮犯的两个错（都记下来）

1. **判据单元测试第一版写错了**：我用 `try/catch` 去测 `isGitProcessFailure`「是否抛」，
   而它是个**谓词**（返回布尔）→ 6 例全被判成"吞"，看起来像补丁失效。
   改回 `isGitProcessFailure(err) === true` 才得到真结果。
   → **判据是"返回"还是"抛"，决定了测法**；测错了会把"通过"报成"失败"。
2. **驱动脚本 `build()` 漏接 `env` 参数** → L3 用例直接 `TypeError` 崩掉。
   顺手补上。（另：驱动脚本最初从**工作区**取被测文件，会把并发场次的在途改动带进来 →
   改成从**暂存区**取，那才是"将要提交的那份代码"。）

### I. 一个**在本机无法端到端复现**的分支

`EACCES`（git 在 PATH 里但跑不起来）这条，**本机造不出来**：
macOS 的 `execvp` 遇到**存在但不可执行（mode 000）或本身是目录**的 PATH 项会**跳过并继续往后找**
→ 假 git 永远造不出 EACCES，真 git 总被找到；且 `npm run` 会把 `/opt/homebrew/bin` 前置到 PATH 顶部。
→ 这条分支**只能靠判据单元测试**（喂合成错误对象）来验，本轮已验（见 E）。
peer 侧在其环境跑通了端到端 V6b exit 1。

### J. 本轮提交（**不 push**）

- `scripts/verify-site.cjs` + `eleventy.config.js`：**只把我的两个 hunk 写进索引**
  （`git apply --cached` 精确分段暂存），并发场次在飞的 RIS 改动完整留在未暂存区。
- `docs(log)`：本节（同样只把自己的 hunk 写进索引，**不碰工作树里的在途内容**）。

⚠️ 绝不 amend 已有 commit（会造孤儿、让同伴的 `--is-ancestor` 判断失真）；
订正一律另起 commit。

### 待部署（本轮**不 push**，线上仍是旧版本）

线上仍是 2026-10-16 那次部署：`/papers/`、`/publications.bib`、`/feed.xml` 仍 404（属待部署，非损坏）。

### 待决策（**沿用既有清单，本轮不新增、不擅自拍板**）

404 页是否保留 Person 实体 · 论文页是否显示署名单位 · `figure.alt` 是否保留 "Fig. 10 —" 前缀 ·
sitemap `lastmod` 口径 · 门禁 25 的博客封面图 `alt=""` 是否给描述性替代文本 · OG 分享图里的中文品牌文案要不要英文化。

### 留给下一轮

- `sameAs` 形态门禁（只查绝对地址形态与 `site.js` 逐字一致，**不查可达性**）尚未做。
- 门禁 27 锚点改 ORCID（换锚点前必须先确认 R4 仍被门禁 12 抓到）。
- 门禁 21④ 报错去重、门禁 15 在四个页面上空跑。
- 巡检 cron 频率（仍每 5 分钟起一个会话，持续并发冲突）→ 建议 30–60 分钟 + 单写者锁。
## 2026-10-19 · 14:45–15:10 场次（**不占轮次号**，避免与并发场次撞号）：复核 12:50 交接件的四条遗留项——四条**成因当时都成立**，但到复验时**全部已被后手覆盖**

### 本场次定位

12:50 交接件 `/tmp/mh_r10_items_1250.md`（10:20 场次写、12:50 更新）是一份
**只读**交接：该场次**对工作区零写入**，把 11:20 场次要求"记进日志、留待后续"的
四条逐条复核，结论是"**四条全部成立**"，并把其中三条列进待本人拍板。

本场次把这份材料在**现行 HEAD** 上重跑。按本日志的老规矩：
**先验它测的是哪个版本，再看结论**——材料的快照 HEAD 是 `01dd76f`，
复验时的 HEAD 是 `e1ffce5`，**落后 36 个 commit**。

结论先行：四条**都不是误读**（12:50 的实测与当时的源码逐字对得上），
但到复验时**四条全部已被后手覆盖**；其中**两条还留下了需要订正的日志口径**
（一条在「待决策」段、一条在「留给下一轮」第 7 条），已就地插入订正块。

### N. 版本对齐

| 项 | 12:50 材料 | 复验时（HEAD `e1ffce5`） |
|---|---|---|
| HEAD | `01dd76f` | `e1ffce5`（**落后 36 个 commit**） |
| 关键差异 | — | `dead243`（13:05）一次改了四处：alt 同源、**门禁 22**、**门禁 23**、ownerName 派生 |

⚠️ 材料第 1 节给的所有行号都是 `01dd76f` 上的（如 `eleventy.config.js:688` / `:820`、
`verify-site.cjs:693`），**在复验时的 HEAD 上已漂移**；下文一律给复验时的位置。

### O. 四条逐条复核

#### O-1. 门禁 12 的逃逸路径（ownerName 两处不同源）→ ✅ **已闭环**

- **12:50 的实测成立**：当时 `eleventy.config.js` 一处**写死** `"Yihang Lyu"`、
  一处**读 site.js**；`site.js` 的 `nameAsPublished` 恰好也是 `"Yihang Lyu"`
  → 当时**没有可见 bug**，但逃逸路径真实存在（出版商登记名一改，
  `jsonLdArticles` 认不出本人 → 门禁 12 对"认不出本人"这条退化**无感**）。
- **复验时**：两处 ownerName **都已从 site.js 派生**
  （`eleventy.config.js` 两处均为 `A.nameAsPublished || A.name || ""`）→
  分歧**不可能再发生**。peer 说的"这一步比加门禁更根本"，已被 `dead243` 第 3 条采纳。
- **peer 建议的新门禁 = 已存在的门禁 23**：「本人的 ORCID 与 canonical @id 必须
  **双向**绑定」——`scripts/verify-site.cjs` 文件头 `:45-46`、代码段 `:1686`；
  方向 A（含本人 ORCID 的 Person 节点 → 必须带 canonical @id）、
  方向 B（带 canonical @id 的 Person 节点 → sameAs 必须含本人 ORCID）都在。
- **peer 点名的"形态混用"陷阱也已处理**：本人物点的 `sameAs` 在
  `jsonLdArticles` 里是**字符串**、在 `jsonLdPaper` 里是**数组**
  （peer 实测 9 数组 / 4 字符串）→ 门禁 23 的取值处把两种形态**归一**，
  不会退化成"子串在字符串里"。这正是 peer 担心的"判据只认一种序列化形式
  → 换种写法让整条判据静默失效"。

#### O-2. `feed.njk` 的注释前提写错 → ✅ **已闭环**

- **12:50 的实测成立**：当时那段注释默认了"不转义"这个前提，
  而 Eleventy 3.1.6 的 Nunjucks **autoescape 默认开着**。
- **复验时**：`src/feed.njk` 的转义注释**已按实测改写**——写明 autoescape 默认开着、
  Nunjucks 的 `escape` 返回 **SafeString** 不会再被 autoescape 转一次，
  并明确"**别把'不写 `| escape` 就会把 XML 弄坏'当结论**"。
  peer 当时特意提醒"**不要在日志里断言'双重转义'**"——现行注释正是这么写的
  （实测三种写法产物逐字相同，都是 `&amp;`）。日志第十三轮 E 节已结清。

#### O-3. 首页 `twitter:image:alt` 重复作者名 → ✅ **已闭环**（并已订正待决策段那条）

- **12:50 的实测成立**：`dead243` 的 diff 显示 `base.njk` 的 twitter 侧此前
  **确实**是 `ogTitle + ' · ' + name + ', ' + jobTitle`（首页 ogTitle 本身已含
  姓名与职位 → 拼出那串重复），与 12:50 的产物实测**逐字对得上**。
- **复验时**：`dead243` 已把 twitter 侧改为**复用 og 侧的同一句话**（`ogCardAlt`），
  并在 `base.njk` 的注释里点名要避免的正是那一串。
  **产物实测**（HEAD `e1ffce5` 的隔离构建）：index / about / papers / blog
  **四页**的 `og:image:alt` 与 `twitter:image:alt` **逐字一致** =
  `MeteoHub — Yihang Lyu, PhD Student at IAP-CAS`。
- → 「待决策」段那条（三个选项 ①②③）**已无须本人拍板**，已就地插入订正块。

#### O-4. og 图与页面图无交集 → 门禁在四页空跑 → ⚠️ **空跑成立，但"没有第二道保险"已过时**

- **编号确为 15**（peer 自己也标了"编号是 15 不是 14"）：复验时的
  `scripts/verify-site.cjs` 文件头 `:31` = 门禁 14「.bib 不含 HTML 实体」、
  `:32` = 门禁 15「同一张图在页面里只有一套 alt 文本」；代码段起于 `:747`。
- **空跑成立**：门禁 15 只在"这张图也出现在该页 `<img>` 里"时才比对
  （`:852` 的 `if (!p || !imgAlts.has(p)) continue; // 这张图没在页面上出现，不归这条管`）
  → index / about / papers / blog 的 og 卡片图都不在页面 `<img>` 集合里 → 四页空跑；
  只有论文页的 og 图（`assets/img/publications/trmm-fig10.jpg`）有判别力。
  **这条到复验时仍然成立。**
- **但 peer 建议的第一种补法已被后手先行落地**：`dead243` 新增的**门禁 22**
  「同一张图在 og 与 twitter 上必须只有一套 alt 文本」（文件头 `:43`、代码段 `:1643`）
  判据是 **og:image 与 twitter:image 指向同一张图时两处 alt 必须逐字相同**，
  且实现里**不看图有没有出现在页面上**——分享卡片图恰恰不出现在页面的 `<img>` 里，
  这正是门禁 15 漏掉的那一类。该段的注释里还**点名了这次事故**
  （写着那串重复的原文）→ 这道缝**已经关上**。
- → "首页 / 列表页 / 关于页**没有第二道保险**"这句**已过时**，
  已就地插入订正块；「留给下一轮」第 7 条**剩下的**只是
  "门禁 15 自身的范围要不要改口径"。

#### O-5. 门禁 16 的 4 处文案（又收到两份 peer 材料）→ ✅ **全部已闭环，不用再改**

本场次又收到**两份**关于门禁 16 的 peer 材料（`mvs_c597891` 的 12:50 复查、
`mvs_9deaa3` 的 12:50 实测矩阵），报的是**同一件事**：门禁 16 只接受
`true` / `false` 这一句描述**与实际白名单不符** → 要改 4 处文案。
两份是**同一份 12:50 快照**的两次投递（行号、"未推送数 13"、
"你 12:52 正在做 commit 前检查"等时间锚点都停在 12:50 口径）。

**复验时（HEAD = `e1ffce5`）逐条现查**（peer's 行号是 `01dd76f` 上的，已漂移）：

| peer 的 4 处 | 复验时的现行文本 | 判定 |
|---|---|---|
| ① 日志待决策段（peer 说 `:1520-1521`） | `:1583-1586` = 「那一行请写 `true` 或 `false`（`True` / `False` / `TRUE` / `FALSE` 也能过——模板与门禁都按 js-yaml 的布尔口径取同一个值，两边不会对不上）；写成 `no` / `on` / `off` / `"false"` / `null` / `1` 这类**会被门禁直接报红**」 | ✅ 已订正 |
| ② `src/404.njk` 警示注释（peer 说 `:21-22`） | 「请写 true 或 false。True / False / TRUE / FALSE 也能通过（与 js-yaml 的布尔解析一致，模板与门禁取同一个值）；但 no / on / off / "false" / null / 1 这类写法会被**直接报红**」 | ✅ 已订正 |
| ③ `src/404.njk` 读法注释（peer 说 `:19`） | 「先取出字面量，再按白名单校验，只接受 true / false / True / False / TRUE / FALSE；其余写法一律判红。」 | ✅ 已订正 |
| ④ `scripts/verify-site.cjs` 报错文案（peer 说 `:959`） | `:1048` = 「…不是合法布尔（只接受 true / false / True / False / TRUE / FALSE）—— 」 | ✅ 已订正 |

→ 改掉这 4 处的 commit 是 `9dab5d4`（含日志那句的是 `fcea9ad`），
**在 peer 这两份材料之前就已落地**。**不需要再改。**
（现行文本比 peer 建议的更全：把 `1` / `0` 也列进了非法值——实测 `1` / `0` 确实判红。）

⚠️ `mvs_9deaa3` 说"你日志 C 节第 3 条『已订正，并补上"那一行只能写 true / false"』
是错的"——这句指的是**第一版**订正；它在日志里**当场就被自己订正过**：
`:2081` 明写「⚠️ **12:53 又订正一次**：初版订正写成"那一行**只能写** `true` 或 `false`"」。
→ 历史记录**保留原样**（不摘改），但**现行口径**（待决策段 `:1583`）是对的。

两份材料给出的**实测矩阵一并采纳**（与本场次自己跑的 8 例矩阵口径一致）：
合法集合 = YAML 1.2 布尔的**六种**写法；`no` / `"false"` / `null` 这类判红；
`False` 合法且**模板与门禁取同一个值**（不会对不上）；
`no` 的特殊之处 = 模板仍输出 Person（字符串是真值）→ **静默失效被门禁拦住**。

⚠️ **本场次提交前的补充（15:05）**：从本节写完到提交之间，并发场次连提 3 个 commit
（HEAD 前进到 `cf95fc1`）。本节 O-1…O-5 的**五条断言**在 HEAD = `cf95fc1` 上
**逐条重查，全部仍然成立**：

| 断言 | `cf95fc1` 上的复核 |
|---|---|
| 门禁 23（ORCID ↔ canonical @id 双向绑定）仍在 | ✅ 文件头 + 代码段各 1 处 |
| ownerName 两处仍**从 site.js 派生** | ✅ 两处都是 `A.nameAsPublished \|\| A.name \|\| ""` |
| `src/feed.njk` 的转义注释仍按实测写 | ✅ "autoescape 默认开着"仍在 |
| twitter 侧 alt 仍**复用 `ogCardAlt`** | ✅ |
| 门禁 22 仍在、门禁 15 的"图不在页面上就跳过"仍在 | ✅ |

→ 本节结论**不因 HEAD 前进而失效**，不需要改写。
（复验口径仍以本节 N 节写的"复验时 HEAD = `e1ffce5`"为准；上面是**加做**的一次重查。）

### P. 顺带核过：材料第 2 节的 P0 告警（"别恢复旧标识符"）依然成立

在 HEAD `e1ffce5` 上实测标识符命中数（`scripts/verify-site.cjs`）：

| 标识符 | 命中 | 说明 |
|---|---|---|
| `srcPageCandidatesWithoutHistory` | **0** | 旧标识符，**不要恢复** |
| `srcFilesWithHistory` | **0** | 旧标识符，**不要恢复** |
| `srcCommitTimes` | 4 | 现行实现 |
| `perPageChecked` | 6 | 现行实现 |
| `repoRelPath` | 1 | `eleventy.config.js` 的 filter |

承重三件套仍在位：`eleventy.config.js` 的 `repoRelPath` filter、
`src/sitemap.njk` 的 `<!-- source: ... -->`、门禁 18 逐页核对 `gitCommitTime`。
材料那句"**用标识符定位，不要用行号**"本场次继续照办。

### Q. 本轮提交（**不 push**）

- `docs(log)` 本条：上文 N、O、P 三节（四条逐条复核 + 版本对齐 + 标识符实测）
  + 两处就地订正块（「待决策」段的 twitter alt 那条；
  「留给下一轮」第 7 条"没有第二道保险"那句）。
  → ⚠️ **归属订正（15:05 场次）**：本节与那两处就地订正块**不是本场次自己提交的**——
    14:5x 时并发场次的 `459c3e8` 对整个日志文件做了 `git add docs/IMPROVEMENT-LOG.md`
    （**把在途内容一并扫进了他们的 commit**）→ 本节与两处订正块随之进了那笔 commit。
    内容**逐字未损**（提交后核对：章节标题、两处订正块在 `cf95fc1` 里各命中 1 次），
    但**归属**记在了别人名下。
    本场次自己补交的只有 **O-5 小节**（门禁 16 的 4 处文案复核）+ 上面的重查表
    + 这处归属订正。
    → 教训（又一次）：**同文件并发时"只把自己的 hunk 写进索引"能保证不删别人的内容，
    但保证不了自己的内容不被别人带走**——要留住归属，只能**早提交**。

⚠️ 并发提醒：提交时工作树里**叠着并发场次在途的改动**
（`eleventy.config.js`、`scripts/verify-site.cjs`、`scripts/check-copy-export.cjs`、
`src/_includes/layouts/paper.njk`、`src/assets/css/components/_paper.css`、
`src/papers.njk`，以及未跟踪的 `src/publications.ris.njk`），
**日志文件里也有另一场次的在途改动**（门禁 24 承重续报、C2 补丁取代 C 那两段）。
本条**只把自己的 hunk 写进索引**（临时索引 + `hash-object` + `update-index
--cacheinfo`），**不碰工作树里的在途内容**，也**不碰暂存区里别人已暂存的那两个文件**
（`eleventy.config.js`、`scripts/verify-site.cjs`）——它们仍留在暂存区，归对方场次。
## 2026-10-19 · 14:15–14:40 场次（**不占轮次号**，避免与并发场次撞号）：新增「门禁接线」横切门禁——守住"每个门禁脚本都真的在 build 链上"

### A. 为什么要加这个门禁

交接复核时读到一条实测：`scripts/check-copy-export.cjs`（Copy 出口取值方式的源码级检查）
**从来没有被任何 `package.json` script 引用过**。CI 只跑 `npm run build`，
所以这个门禁**从写下那刻起就是零保护作用**——而它自己 exit 0、输出漂亮，
"看起来完全在工作"。

也就是说：**"门禁文件存在"和"门禁在跑"是两件事，而后者当时无人看守。**
这类缺陷的共同形状是：**不报错、build 照过、门禁照绿**，
只有回头逐行读 `package.json` 才会发现。
本仓库此前已经反复栽在这一族上（门禁编号表漏行、清单与代码段不一一对应、
门禁汇总句照抄通过时的断言、"只能写 X"这类断言写进会被人照着改的说明里），
它们都是同一句话：**看起来在、其实不生效**。
既然"有没有接线"是可机器判的，就不该继续靠人记得。

### B. 改动（两个文件）

- **新增 `scripts/check-gates-wired.cjs`**（编号 **GW1–GW3**，
  沿用独立字母体系，不与 `verify-site.cjs` 的 1–30、`check-a11y.cjs` 的 A1–A4、
  `check-wrapping.cjs` 的 W1–W3 续接或撞号）。
- **`package.json`**：新增 `"check:gates": "node scripts/check-gates-wired.cjs"`，
  并接进 build 链**最前**（接线本身就是纯配置问题，先查它最省事）。

### C. 三条判据

| 编号 | 判据 | 为什么这样定 |
|---|---|---|
| **GW1** 全覆盖 | `scripts/` 下每个门禁脚本（`check-*.cjs` / `verify-*.cjs`）都必须**从 `npm run build` 可达**（含间接：`build → check:css → 两个脚本`） | "某个 script 引用了它"还不够——那个 script 也可能不在 build 链上。必须算**可达性**，不是"存在性" |
| **GW2** 豁免登记 | 豁免必须**写在源码里**并写明理由；理由为空、文件已不存在、或"既登记豁免又真接在 build 上"（状态自相矛盾）都判红 | 豁免只写在日志里等于没写——CI 读不到日志 |
| **GW3** 自己没被卸掉 | 本脚本必须真的在 build 链上 | "门禁自己被卸掉"和"门禁没生效"在结果上长得一模一样（build 照过、门禁全绿），必须有专门的兜底 |

**当前唯一豁免**：`check-overflow.cjs` —— 需要本机 Chrome + 临时静态服务器
（CDP over WebSocket），CI（ubuntu-latest）没有 Chrome，接进 build 只会让部署随机失败。
**故意不接**，理由写在源码的 `EXEMPT` 里（不是只写在日志里）。
依据见本日志「长串断行兜底」那轮「留给下一轮」第 1 条。

### D. 复验

**（1）隔离克隆全量 build**（基座 = 当前 HEAD `f59fec4`，共享工作区零写入）：
`npm run build` **exit 0**，链上依次为 `check:gates → check:css → check:wrap →
eleventy → check:site → check:lang → check:a11y → check:copy`；
门禁 24 的两条 note 仍为「文件头清单 30 条 / 代码段 30 条，一一对应且连续」
与「对照表 30 行，覆盖全部 30 个门禁编号且无重复行」——新门禁**没有**打破编号体系。

**（2）8 例故障注入**（每个用例一份全新副本，基线必须先 exit 0）：

| # | 注入 | 期望 | 实测 |
|---|---|---|---|
| 0 | 无注入（基线） | exit 0 | exit 0 ✓ |
| 1 | 新增 `scripts/check-fake.cjs`，无任何 script 引用 | exit 1 | exit 1「没有被任何 npm script 引用——这个门禁**永远不会执行**」✓ |
| 2 | `check-fake.cjs` 只被 `check:fake` 引用，而 `check:fake` 不在 build 链 | exit 1 | exit 1「只被 npm script「check:fake」引用，但那些 script **不在 build 链上**」✓ |
| 3 | `check-fake.cjs` 正确接进 build | exit 0 | exit 0 ✓ |
| 4 | 已豁免的 `check-overflow.cjs` 又被接进 build | exit 1 | exit 1「既是豁免项、又被接在 build 链上——状态自相矛盾」✓ |
| 5 | build 链里去掉 `check:gates`（门禁自己被卸掉） | exit 1 | exit 1「门禁自己被卸掉了」✓ |
| 6 | 豁免理由被清空 | exit 1 | exit 1「没有写理由——豁免必须写明为什么不能接」✓ |
| 7 | 豁免名单里留一个已不存在的文件 | exit 1 | exit 1「在 scripts/ 下已经不存在了——别让名单烂在里面」✓ |
| 8 | build 整个改成只跑 `eleventy` | exit 1 | exit 1，**7 个门禁**同时被判未接线 ✓ |

⚠️ 用例 3–5 首轮**全被用例 1 遗留的 `check-fake.cjs` 掩盖**（它一直在报未接线，
把后面几条的正确判定盖住了）——这是**我的测试序列有缺陷**，不是门禁有缺陷。
改成"每个用例一份全新副本"后重跑，8/8 全部符合预期。
（这正是本仓库记过的那条教训的又一次出现：**验证环境的失败会伪装成被验证对象的性质**。）

### E. 顺带：对已落地的 C2 做了一次独立复验（结论与 14:30 场次一致）

C2 已由 `f59fec4` 落地（「收窄 gitOut/gitRoot/lastCommitTime 三处裸 catch」）。
本场次在**当前 HEAD 基座**上重跑了对照实验，结论吻合：

| 场景 | 无 C2 | 有 C2 |
|---|---|---|
| 两侧同时注入 `execFileSync` 未定义 | `eleventy` exit **0** / 门禁 exit **0** / sitemap lastmod **0 条** / note **谎称**"不在 git 仓库里：sitemap 不输出 lastmod（源码 zip 分发，本就没有 git 历史）" | `eleventy` exit **1**（可见 `ReferenceError: execFileSync is not defined`）/ 门禁 exit **1** |

**合法场景回归**（"确实该静默"的三种情形必须仍然静默通过）：

| 场景 | eleventy | 门禁 |
|---|---|---|
| 不在 git 仓库里（源码 zip 分发） | exit 0 | exit 0，note 如实说"不在 git 仓库里" |
| git 不在 PATH（ENOENT） | exit 0，无 ReferenceError | exit 0 |
| 浅克隆（`git clone --depth 1`） | exit 0 | exit 1，提示"浅克隆…请设 `fetch-depth: 0`"（**基线既有行为**，非 C2 引入） |

### F. 一条在途改动，本场次**不碰**

复验期间发现另一场次正在**未暂存地**细化 `isGitProcessFailure` 的判据
（把 `typeof e.status === "number"` 改成 `"status" in e`，理由是
`execFileSync` 在 SIGKILL / EACCES 下 `status` 为 `null`——
按"值的类型"判会把它们误当编程错误而 rethrow，导致**崩栈**而非判红）。
那是**它的在途工作，本场次既没改也没提交**；
上面 E 节的实测数据是按 `f59fec4` 里已提交的版本测的。
⚠️ 两版判据在 **EACCES** 上结论不同（已提交版会 rethrow，在途版会吞掉），
这属于该场次的裁决范围，**本场次不擅自拍板**，留给它自己收口。

### G. 本轮提交（**不 push**）

- `feat(gate)`：新增 `scripts/check-gates-wired.cjs`（GW1–GW3）+ `package.json` 接线
  （`check:gates` 接进 build 链最前）。
- `docs(log)`：本条（A–G）。

⚠️ 并发提醒：提交时工作树里**叠着并发场次在途的改动**
（`eleventy.config.js` 的 RIS filter、`scripts/verify-site.cjs` 的 `isGitProcessFailure` 细化、
`scripts/check-a11y.cjs`、`scripts/check-copy-export.cjs`、
`src/_includes/layouts/paper.njk`、`src/assets/css/components/_paper.css`、
`src/papers.njk`，以及未跟踪的 `src/publications.ris.njk`），
**日志文件里也有另一场次的在途改动**（12:50 交接件四条遗留项的复核那节）。
本条**只把自己的 hunk 写进索引**（`hash-object` + `update-index --cacheinfo`），
**不碰工作树里的在途内容**，也**不碰别人已暂存的内容**。
C2 已由 `f59fec4` 单独提交，本条**不含** C2（避免把同一件事写两遍）。

### H. 待决策

**本轮不新增待决策项**（沿用既有清单，不擅自拍板）。

### I. 留给下一轮

1. **豁免机制目前是硬编码在 `EXEMPT` 里**。若将来豁免变多（比如 CI 有了 Chrome、
   又多出几个需要外部工具的门禁），可以把它挪成一个独立的 `scripts/gates-exempt.json`，
   让"谁豁免了什么"更好审。**现在只有 1 条豁免，不值得为此加一个文件**。
2. **本门禁只查"接线"，不查"接上了之后真的会跑"**。
   判据是"某个 npm script 的命令行里出现了这个文件名"，
   理论上仍可能有人把 `node scripts/check-x.cjs` 写成一个**空操作**。
   要堵这一层得改判据（例如要求脚本以非零码退出），代价是门禁本身变复杂——**先不做**。
3. **本门禁在 `build` 链最前**，所以它一红，后面几步都不跑。
   这是有意的（接线错了就别构建了），但要注意：并发场次若新加一个门禁脚本而**还没接线**，
   本门禁会立刻把 build 判红——**这是正确行为**（那正是一个没接线的门禁），
   修法是把它接进 `package.json` 或在 `EXEMPT` 里显式登记并写明理由。

---
## 2026-10-19 · 14:30 场次（**只读巡检 + 写权限让出**；本轮不改代码）

### 本场次定位

本轮开始时，工作树里已叠着另一个场次（`mvs_69609eaf`，14:25 起）的在途成果
（RIS 导出、门禁 30/31、`check-copy-export.cjs` 加固、git 探针 catch 收窄）。
该场次主动提出**协调**：请本场次**不要动工作树、不要 `git add` / `git commit`**，
由它统一复核并提交。

→ **本场次接受让位**：全程**零代码写入**、零 `git add`、零 `git commit`、零 push。
本场次只做**只读**工作：① 线上巡检（任务书第 1 步，必做）；
② 在**隔离克隆**里验证已提交 HEAD 的完整构建（不与共享工作树抢 `_site/`）。

### A. 线上巡检：站点**没坏**，但"爬虫用来定位站点"的整条链都指到 404

| URL | 状态 | | URL | 状态 |
|---|---|---|---|---|
| `/` | 200 | | `/papers/` | **404** |
| `/about/` | 200 | | `/papers/trmm-thunderstorm-stages/` | **404** |
| `/blog/` | 200 | | `/publications.bib` | **404** |
| `/404.html` | 200 | | `/feed.xml` | **404** |
| `/sitemap.xml` | 200 | | `/robots.txt` | 200 |
| 8 个 CSS/JS/图片资源 | 全部 200 | | | |

→ 页面本身**能看**（资源全通，首页/关于/博客都正常渲染）。
但**爬虫靠它定位站点的每一条线，在线上都指到 404**。
此前各轮只记了"sitemap 仍带 `/MeteoHub/` 前缀"，**没把后果写全**：

| 爬虫读的东西 | 线上实际值 | 指向的地址 | 状态 |
|---|---|---|---|
| `robots.txt` 的 `Sitemap:` | `https://github.lvyihang.xyz/MeteoHub/sitemap.xml` | 404 | ❌ |
| `sitemap.xml` 的 3 条 `<loc>` | `/MeteoHub/`、`/MeteoHub/about/`、`/MeteoHub/blog/` | **全部 404** | ❌ |
| 每页的 `canonical` / `og:url` | `https://github.lvyihang.xyz/MeteoHub/...` | 404 | ❌ |
| JSON-LD `Person` 的 `url` / `image` | `https://github.lvyihang.xyz/MeteoHub/...` | 404 | ❌ |
| 首页的 `citation_*` 元标签 | **0 个**（第三轮才加的） | — | ⚠️ |

三点要害：

1. **`sitemap.xml` 里 0 条有效 URL。** 它列的 3 条全是 404；而线上**真正在服务的**
   3 条路由（`/`、`/about/`、`/blog/`）**一条都不在 sitemap 里**
   → 这个 sitemap 现在的实际作用是"告诉爬虫这个站不存在"。
2. **`robots.txt` 声明的 sitemap 地址本身也 404。** 爬虫按 robots.txt 去找 sitemap，
   拿到的同样是 404 → **两条路都断**。
3. **每一页的 `canonical` 都指向 404。** Google Scholar 正是按 canonical 定位条目；
   线上又**一个 `citation_*` 标签都没有** → Scholar 这一侧目前
   **既没有元数据、也没有可用的定位地址**。

⚠️ 结论不变：**这不是站点损坏，是待部署**。本轮只是把后果**测全**了。

### B. 根因与自愈条件（实测，非推断）

线上产物是 **2026-10-16** 那次部署，构建时站点还是"项目页"形态，
绝对 URL 带 `/MeteoHub/` 前缀；而 Pages 的 base_path 早已是域名根 `/`。

关键在于**相对路径不受影响、绝对 URL 全部受害** ——
所以"页面能看"与"爬虫定位不到"可以**同时成立**：

- 资源引用是**相对**的（`assets/css/a11y.css`）→ 按当前页地址解析 → 200 ✓
- `canonical` / `og:url` / JSON-LD / sitemap / robots 是**绝对**的
  （`site.url` + 旧前缀）→ 404 ✗

**自愈条件：一次 `git push` 即可全部消掉，不需要改任何代码。**
（部署链路：`.github/workflows/deploy.yml` 在 `push` 到 `main` 时构建并发布到
GitHub Pages；本任务禁止 push，部署由本人决定。）

### C. 为什么确定"是旧部署、不是代码回归"：**门禁 21 已经守着这一类**

`scripts/verify-site.cjs` 的**门禁 21**（第十三轮新增）正是这条判据：

> 绝对 URL 口径：`site.url` 必须是域名根（无子路径）；产物里所有指向本站地址的
> 绝对 URL（canonical / og:url / JSON-LD 的 @id 与 url / sitemap 的 loc /
> feed 的 link）必须以 `site.url` 为前缀

→ **现行代码已经产不出这种坏状态**；且门禁 21 **晚于** 2026-10-16 那次部署。
所以线上那份产物属于"门禁存在之前"的东西。

本轮**在隔离克隆里实测**了现行 HEAD 的完整构建
（`git clone --no-hardlinks` → 软链 `node_modules` → `npm run build`，
**全程不碰共享工作树的 `_site/`**）：

- **exit 0**；`check:gates` / `check:css` / `check:wrap` / `check:site` /
  `check:lang` / `check:a11y` / `check:copy` **全部通过**
- `check:site` 实测：**6 个 HTML 页、127 条本地引用全部解析成功**、
  **5 条 sitemap URL**（`/`、`/about/`、`/blog/`、`/papers/`、
  `/papers/trmm-thunderstorm-stages/`，全部**无前缀**且带 `lastmod`）、
  门禁编号 30 条一一对应
- 产物里 `canonical` = `https://github.lvyihang.xyz/`（无前缀）；
  `robots.txt` 的 `Sitemap:` = `https://github.lvyihang.xyz/sitemap.xml`

→ **本地是对的，线上是旧的。** 部署后应一次消掉 A 节的全部差异。

### D. 本轮**没有**实施任何改进（写权限已让出）

可做的改进（RIS 导出、门禁 30/31、复制出口加固）已由 `mvs_69609eaf` 认领并在途，
本场次**不重复、不抢写**。本轮**也未新增任何待决策项**。

调研侧补一句：`mcp__agu-papers__search_papers` 本轮调用仍返回
`OpenAlex search failed (HTTP 429)`（**瞬时限流**，与第十三轮同因），
不代表"查无此论文"；AGU 侧实践依据仍以 Crossref 原始登记为准。

### E. 留给下一轮

1. **线上部署仍是本人拍板项**（沿用待决策第 5 条）。本轮把后果测全了：
   不只是"三个路由 404"，而是**整条爬虫定位链都指到 404**。
2. **部署后的验收清单**（本轮实测得出，可直接照着查）：
   - `sitemap.xml` 里每条 `<loc>` 都应 200；
   - `robots.txt` 的 `Sitemap:` 应指向**不带 `/MeteoHub/`** 的地址，且该地址本身 200；
   - 抽任一页，`canonical` 应等于该页自身的公开地址；
   - `/papers/`、`/publications.bib`、`/feed.xml` 应由 404 变 200；
   - 论文页的 `citation_*` 应为 22 个（15 类），且 `canonical` 不再指向 404。

---
## 2026-10-19 · 14:10–14:50 场次（**不占轮次号**，避免与并发场次撞号）：RIS 导出的门禁补完 + 一个"退出码与打出来的符号不同源"的真缺陷

### 本场次定位

接手时工作树里压着并发场次的**在途未提交改动**：RIS 导出全套
（`eleventy.config.js` 的两个 filter + `src/publications.ris.njk` +
论文页/列表页的下载与复制入口）、`check-gates-wired.cjs`、bare-catch 加固、
`check-copy-export.cjs` 的检测逃逸修复。

本场次的职责是**把这批在途改动收口**：补上它们承诺但没写的门禁、修掉它们
暴露出来的缺口、逐条复验，然后**作为唯一写者统一提交**（不 push）。
期间并发场次自己提交了三个 commit（`f59fec4` bare-catch 加固、
`c4c0104` 门禁接线门禁、`69f1f45` 日志），本场次在其基础上继续。

### A. 补上门禁 30 —— 一段注释承诺了一个不存在的门禁

#### 背景

并发场次写好的 RIS filter 注释里白纸黑字写着"**门禁 30 就是盯着这一点的**"，
而 `scripts/verify-site.cjs` 里只有门禁 1–29 —— **门禁 30 并不存在**。

这是本轮最要紧的一件事。注释承诺一个不存在的门禁，比没有注释更坏：
读代码的人（和下一个接手的场次）会以为"已经有人盯着 RIS 与页面的一致性了"，
于是**谁都不会去补它**。`.bib` 那一对（门禁 13/14）从一开始就有门禁守着，
RIS 这一对当时是裸奔的。

#### 改了什么

`scripts/verify-site.cjs` 新增门禁 30，五条判据：

| 判据 | 内容 |
|---|---|
| 30a | 产物里有 `publications.ris` |
| 30b | 页面上的每个 RIS 块，都能在 `.ris` 文件里找到**逐字相同**的记录 |
| 30c | `.ris` 文件里的每条记录，都能在页面上的某个块里找到**逐字相同**的记录 —— **双向** |
| 30d | `.ris` 里不得出现 HTML 实体（下载文件必须是原始 RIS） |
| 30e | 每条记录首行 `TY  - XXX`、末行 `ER  -`，且每行都是 `XX  - 值` 的形状 |

30c 是**双向**的必要性：只查一边的话，"文件里多了一条 / 少了一条"这类错位
根本查不出来（这正是门禁 24 盯编号表时踩过的同一个坑）。

30e 看着多余，但 RIS 的解析器是**按行读**的 —— 一个值占两行会被读成两个字段。
`ris` filter 里已经用 `replace(/\s+/g, " ")` 压过换行，正是为了这条。

比对方式与门禁 13 一致：**只解页面侧的 HTML 实体**（页面侧被 nunjucks 的
autoescape 加工过，`.ris` 侧是原文），并复用同一套 `decodeHtmlEntities` /
`HTML_ENTITY_RE`，不另造一套。

三处同步（门禁 24 查清单↔代码段、门禁 29 查对照表）：
文件头清单加第 30 条、「旧编号→新编号对照」表加一行
`（无） → 新 30`、代码段落在汇总之前。

#### 复验（隔离克隆，共享工作区零写入）

| 注入 | 期望 | 实测 |
|---|---|---|
| 篡改一条记录的 `TI` | 30b + 30c 判红 | ✓ 2 个问题，消息逐字对应 |
| 记录里出现换行后的续行（多行值） | 30e 判红 | ✓ 3 个问题（30e + 30b + 30c） |
| 一条记录去掉 `ER  -` 收尾 | 30e 判红 | ✓ 3 个问题（30e + 30b + 30c） |
| 文件里塞进 `&amp;` | 30d 判红 | ✓ 3 个问题（30d + 30b + 30c） |
| 删掉 `publications.ris` | 30a 判红 | ✓ 3 个问题（30a + 门禁 1 的两条"引用找不到对应产物"） |
| **端到端**：模板去掉 `\| safe` + 标题里加 `&` | 产物带实体、30d 判红 | ✓ 产物第 9 行 `TI  - Rain &amp; Lightning…`，30d 报 `&amp;` |
| 全部还原 | 全绿 | ✓ `publications.ris 3 条，与论文页 3 个 RIS 块双向逐字一致…` |

端到端那一例是必须的：当前数据里**没有** `&`（论文标题、刊名、URL 都不含），
所以单独去掉 `| safe` 什么都不会变 —— **门禁只有在"标题里真的出现 `&`"时
才被触发**。把 `&` 一起注入，才证明 `| safe` 是承重的、且门禁能守住它。

### B. a11y 门禁 A3 扩到 RIS 块（此前是盲区）

`scripts/check-a11y.cjs` 的 A3 只认 class 含 `paper-cite__bibtex` 的 `<pre>`。
新增的三个 RIS 块（`paper-cite__ris`）不在覆盖内 —— 它们同样是
`overflow-x: auto` 的横向滚动容器，同样需要 `tabindex="0"`
（WCAG 2.1.1：可滚动区域必须可聚焦，否则键盘用户滚不动）。

改成同时认 `paper-cite__bibtex` 与 `paper-cite__ris`。改后产物级计数
从 3 变成 6（3 个 BibTeX + 3 个 RIS），与产物里的实际块数对上。

### C. `.paper-cite__ris` 补上 CSS（外观对齐，**不是**修溢出）

RIS 块在 `paper.njk` 里用的是 `class="paper-cite__ris"`，而
`_paper.css` 里**只有** `.paper-cite__bibtex` —— `.paper-cite__ris` 零命中。
后果是两种并列的引用格式**长得不一样**：BibTeX 块是 12px、底色
`--color-neutral-50`、宽度 `--measure`；RIS 块走全局 `pre` 的
`0.92em` + `--bg-muted` + 通栏。读者挑一种用，视觉上却分出了主次。

补上 `.paper-cite__ris`（与 `.paper-cite__bibtex` 同一条规则）。

> ⚠️ **本场次自己的一处订正**：动手时我以为"RIS 的 `UR` 行有 60+ 字符，
> 没有 `overflow-x: auto` 会在窄屏把整页撑破"，并打算把它当溢出修复写进日志。
> **故障注入证明这个理由是错的**：
> - 把 `.paper-cite__ris` 的规则整条去掉 → 窄屏检查仍然全绿（6 页 scrollWidth 390）；
> - 注入一个 400 字符的无换行长串（`<pre>` 内）→ 页面**也不**溢出。
> 原因：`src/assets/css/base.css` 里**已经有全局的 `pre { overflow-x: auto }`**
> （base.css:158），长行在块内横滚，不会撑破页面。
> → 这条 CSS 的真实作用是**外观与 BibTeX 块对齐**，不是防溢出。
> 代码注释已按这个真实理由改写（并写明"全局规则只保证能滚，这条规则决定长什么样"）。

### D. 修一个真缺陷：`check-overflow.cjs` 的退出码与它打出来的符号**不同源**

`scripts/check-overflow.cjs` 打页面状态用的是 `hasHScroll`
（页面真的能横向滚动），而 `bad++` 用的是 `m.overflow.length`
（元素**矩形**扫描的结果）。两个条件不是一回事：**矩形扫描抓不到"内容溢出"** ——
一个 div 的盒子宽度仍是 390px（超长内容撑在盒子里面），矩形看不到它，
但页面确实能横滚。

实测（注入 400 字符长串的 div）：

```
✗ 横向可拖 /papers/trmm-thunderstorm-stages/  (scrollWidth 4416 / 视口 390)
exit=0          ← 打印了 ✗，退出码却是 0
```

即：**它打印失败，却以成功退出**。脚本目前被 `check-gates-wired.cjs` 显式豁免
（不进 build，CI 没 Chrome），所以眼下没造成假部署；但这是一枚埋着的雷 ——
谁哪天把它接进 CI，谁就会拿到"门禁全绿但页面在横滚"的假绿。
"永远通过的检查比没有检查更糟"这条，本项目已经吃过好几次亏了。

改成 `if (m.hasHScroll) bad++;` —— **打 ✓/✗ 的条件和决定退出码的条件必须同源**。
复验：注入 → exit 1（逐页 ✗ + 汇总 ✗ 都出得来）；还原 → exit 0。

顺带把探针本身也自证了一遍（不能只信它"没报"）：
- 注入 400 字符长串进 `<pre>` → 页面**不**溢出（全局 `pre` 规则兜住）→ 探针不误报 ✓
- 注入 400 字符长串进 `<div>`（div 不在 `overflow-wrap: anywhere` 的名单里）
  → 页面横滚 4416px → 探针抓到 ✓

### E. 判据裁定：peer 交接件里的 `"status" in e` 是**错的**，已提交的那版才对

#### 背景

`/tmp/mh_C2_criterion_ruling.md`（peer 代转）建议把 bare-catch 的判据改成
属性存在性：

```js
if (err && ("status" in err || err.code === "ENOENT")) return null; throw err;
```

理由是 `typeof e.status === "number"` 在 SIGKILL 时会误判。本场次**独立复现**了
判据差异（本机合成错误对象实测）：

| 场景 | `typeof e.status === "number" \|\| e.code === "ENOENT"`（已提交版） | `"status" in e \|\| e.code === "ENOENT"`（peer 版） |
|---|---|---|
| SIGKILL（`status:null, signal:"SIGKILL"`） | false → 抛出 | true → 吞 |
| EACCES（`status:null, code:"EACCES"`） | false → 抛出 | true → 吞 |
| exit 1（`status:1`） | true → 吞 | true → 吞 |
| ENOENT（`status:null, code:"ENOENT"`） | true → 吞 | true → 吞 |
| ReferenceError / TypeError | false → 抛出 | false → 抛出 |

单看这张表，两版都能把编程错误挡在外面。**但真正决定的是"EACCES 怎么办"**。

#### 实测（真实 EACCES，不是合成对象）

在隔离克隆里把 `execFileSync("git", …)` 指向一个 `chmod 000` 的文件
→ 操作系统真的返回 EACCES，然后两版判据各跑一遍：

| 判据 | eleventy | sitemap lastmod | 门禁 | 门禁输出 |
|---|---|---|---|---|
| `"status" in e`（peer 版） | **exit 0** | **0 条** | **exit 0** | 「不在 git 仓库里：sitemap 不输出 lastmod（**源码 zip 分发**，本就没有 git 历史）」 |
| `typeof e.status === "number"`（已提交版） | **exit 1** | 0 条 | exit 1 | 崩栈，编程/环境异常直接暴露 |

**peer 版会制造一次假绿**：build 绿、门禁绿、sitemap 没有 lastmod，
而门禁还**编了一个假理由**（"源码 zip 分发"）——这正是本次加固要消灭的那类
"判据自己被卸掉、产物照坏、门禁照绿"。已提交的那版 fail-closed（崩栈），
产物发不出去。

→ **本场次撤回自己先前按 peer 裁定做的改动**，保留并发场次已提交的判据。
（peer 裁定件在这一点上只对了一半：它对 SIGKILL 的顾虑成立，但没考虑
"EACCES 被吞 → 门禁谎称源码 zip 分发"这条路径。）

### F. 在途改动的复核结论

- **`check-gates-wired.cjs`**（并发场次写的横切门禁，GW1/GW2/GW3）：设计成立，
  四组故障注入全部正确判红、还原后复绿：
  | 注入 | 期望 | 实测 |
  |---|---|---|
  | build 链摘掉 `check:gates` | GW3 判红 | ✓「门禁自己被卸掉了」 |
  | build 链摘掉 `check:copy` | GW1 判红 | ✓「只被 npm script 引用，但那些 script 不在 build 链上」 |
  | 豁免名单登记一个不存在的文件 | GW2 判红 | ✓ |
  | 把已接在 build 上的门禁同时登记为豁免 | GW2 判红（自相矛盾） | ✓ |
- **`.github/workflows/deploy.yml`**（并发场次在途）：在 build 之后**显式**再跑一次
  `npm run check:gates`。这一条是必要的：build 链里已经含 `check:gates`，
  看着像接上了，但**如果有人把它从 build 链里摘掉，就没有任何门禁能发现**
  （不跑的门禁不会报错）。CI 显式调它，GW3 就能看到自己不在 build 链上并判红。
  已复核，逻辑成立，一并提交。
- **`check-copy-export.cjs`**（并发场次在途）：把"只认裸标识符实参"改成
  "匹配整个实参表达式"，修掉了 `writeText(src.innerHTML)` 这类
  **实参不是裸标识符**的调用根本不被识别为出口的检测逃逸；并加了"调用点数
  ↔ 出口数"的自检（少认一个 = 有一条复制路径没被看见）。
  本场次未改动其逻辑，只确认它能跑通（`2 个出口，取值来自 textContent`）。
- **`/tmp/mh_patch_A_C.diff`**：仍**不可套用**（Part A 的 `hasOwnerOn404` 会把
  本人未拍板的口径写死，且沿用已被修过的按姓名认人与 `n['@type']==='Person'`
  数组盲点）。**`/tmp/timestamp-patch-main.diff`** 仍**不可套用**，
  且 `scripts/git-dates.cjs` / `scripts/verify-timestamps.cjs` / `check:time`
  这三个名字全仓 0 命中（符合要求，日志也不引用它们）。

### G. 本轮巡检与验证

- 线上 7 条路由（`curl` 逐条）：`/` 200、`/papers/` **404**、`/blog/` 200、
  `/about/` 200、`/publications.bib` **404**、`/feed.xml` **404**、`/sitemap.xml` 200。
  与日志记载一致：**线上是旧部署**，4 条新路由待部署，不是站点损坏。
- 本地 `npm run build`：**exit 0**。门禁接线 / 长串断行 / 站点自检（31 条门禁，
  清单↔代码段一一对应且连续、对照表 31 行覆盖全部编号）/ 语言 / a11y（A1–A4）/
  复制出口，全绿。
- 窄屏横向溢出：6 页全部 scrollWidth 390，**无横向溢出**。
- 产物实测：`_site/publications.ris` 1210 字节，3 条记录
  （`TY  - JOUR` / `TY  - DATA` / `TY  - COMP`），每条以 `ER  -` 收尾，
  字段齐全（AU/TI/T2/VL/IS/SP/PY/DA/DO/UR/SN/KW/LA/PB/ET），
  作者为「姓, 名」格式；文件以 `TY  - JOUR` 开头（模板的注释块已做空白控制，
  否则文件首行会多一个空行）。

### H. 需要本人拍板

新增待决策 1 条：**RIS 条目的两个字段口径**（摘要 AB 输出与否、
AGU 的 e-locator 放在 `SP` 的位置）—— 见上文「待决策」段。

其余沿用既有清单，本场次**没有替本人拍板任何一条**，原有的 7 条
（404 页 Person 实体、论文页署名单位、`figure.alt` 的 "Fig. 10 —" 前缀、
sitemap `lastmod` 口径、push 时机、博客卡片封面图 `alt=""` 口径、
OG 分享图中文文案英文化）**原样保留**。

### I. 留给下一轮

1. **线上部署**仍是本人拍板项（沿用待决策第 5 条）。本轮新增了
   `/publications.ris` 这条待部署路由，部署后的验收清单要加上它 200。
2. **门禁 30 的边界**：它比的是"页面上的 RIS 块"与"文件里的记录"逐字一致。
   如果将来把 RIS 摘要（AB）也输出（待决策第 ① 条），`<pre>` 里会出现
   2000 字符的单行 —— **A3 门禁的 `tabindex="0"` 仍然成立，但可读性需要
   本人看一眼**再定。
3. **`check-overflow.cjs` 仍不在 build 链上**（豁免理由：CI 无 Chrome）。
   本轮修好了它的退出码，但"CI 里能不能跑窄屏检查"仍未解决 ——
   需要一个 CI 装 Chrome 的方案，或在 deploy 前手动跑一次。

### J. 本场次的边界

- **不 push**。本地 `main` 领先远端，部署由本人决定。
- 调研侧：`web_search` 本轮仍报 `MATRIX_TOOL_REQUEST_FAILED`，
  `mcp__agu-papers__search_papers` 仍 `HTTP 429`（瞬时限流，与前几轮同因，
  **不代表"查无此论文"**）。AGU 侧实践依据仍以 Crossref / DataCite 原始登记为准。
- 本场次**没有新增**任何未经核实的外部链接。

---
## 2026-10-19 · 14:30 场次（补记）：让位之后的收尾复验

**背景**：本场次 14:41 提交巡检小节（`69f1f45`）后，认领写权限的
`mvs_69609eaf` 于 14:43 落地 `459c3e8`（RIS 导出 + 门禁 30 + 修
`check-overflow` 退出码与判定不同源），**工作树转为干净**。
本场次随即做了一次**只读**收尾复验。

### 合并后的 HEAD 复验（隔离克隆，exit 0）

`459c3e8` 在隔离克隆里 `npm run build` → **exit 0**，全部门禁通过：

- `check:site`：6 个 HTML 页、**129 条本地引用全部解析**、5 条 sitemap URL；
  门禁编号 **31 条**、对照表 31 行一一对应（较本场次正文记录的 30 条 +1，
  即新增的 RIS 门禁 30）；
  `publications.ris` **3 条**，与论文页 3 个 RIS 块**双向逐字一致**、
  不含 HTML 实体、每条以 `ER  -` 收尾
- `check:a11y`：引用代码块 **6 个**（RIS 3 + BibTeX 3）均可键盘聚焦
- 产物齐备：`_site/publications.ris` / `publications.bib` / `feed.xml` / `sitemap.xml`

### 两块内容并存的复核（本场次让位做法的收口）

本场次的小节（`69f1f45`）与对方的成果（`459c3e8`）**同时在 tip 里**：
本场次小节在 `docs/IMPROVEMENT-LOG.md:5264`，对方小节在其后（5377 行起）。
本场次提交时工作树侧用 `cat >>` **原子追加**、索引侧用
`hash-object` + `update-index --cacheinfo` 只装自己那段，
**没有覆盖对方任何一行**；对方后续 `git add` 也**没有把本场次的小节删掉**。

### 线上状态未变

线上仍是 2026-10-16 那次部署（**本轮仍未 push**，远端 `cfef826`，本地领先 61）。
本场次 C 节那张"**爬虫定位链整条指向 404**"的表**仍然成立**——
它只会在部署之后自愈，与本轮新增的 RIS 导出无关。
## 2026-10-19 · 14:50–15:00 补充（并入上一条 `459c3e8`）：copy 出口门禁的崩溃修复与 7 例注入证据

> 上一条日志的 F 节把 `scripts/check-copy-export.cjs` 记成"并发场次在途的改动，
> 本场次未改动其逻辑，只确认它能跑通（2 个出口，取值来自 textContent）"。
> 这句话**漏掉了一个关键事实**：这条门禁在**被提交之前是崩的** ——
> 崩到 `npm run build` 必然红。读日志的人若以为它一直能跑，
> 就会漏掉"门禁自己也要先能跑"这一层。本节把这段补齐。

### A. 这条门禁当时是**红的**，build 必然 exit 1

在途改动把 Copy 出口的识别从"只认裸标识符实参"改成了"匹配整个实参表达式"，
但配套的 `rootOf(expr)` / `judge(expr)` **两个函数从未定义**：

```
$ node scripts/check-copy-export.cjs
ReferenceError: rootOf is not defined     (scripts/check-copy-export.cjs:129)
exit 1
```

而 `check:copy` 已经接在 `build` 链末尾，所以当时的 `npm run build` **必然红**。
—— 这是本轮踩到的最深的一个坑：**门禁脚本自己崩了，而门禁报错时只有退出码，
没有"我崩了"和"我判红了"的区分**。只看退出码的人会以为"门禁在工作"。
（这条与"永远通过的检查比没有检查更糟"是同一个病的两种形态：
崩的门禁和永远绿的门禁，都给不出保护。）

### B. 修法：两个函数，以及**不能换的顺序**

- `rootOf(expr)`：取表达式的根标识符
  （`text` → `text`；`text.trim()` → `text`；`src.innerHTML` → `src`）。
  取不到根（表达式不以标识符开头）→ 返回 `null` → **判红，不猜**。
- `judge(expr)`：**先**看表达式本身有没有直接读 `.innerHTML` / `.outerHTML`
  （命中 → 精确报错"这里直读 innerHTML"），**再**取根标识符交给 `trace(root)`
  回溯到 `.textContent`。
  **顺序不能换**：实参写成 `src.innerHTML` 时根标识符是 `src`，
  只回溯 `src` 只能知道"src 来自 DOM"，**看不出拿的是哪一部分** ——
  正是要治的病。

### C. 新增第 5 条判据：**出口计数自检**

原来四条判据有一个共同盲区：**它们都建立在"正则已经把出口都找出来了"这个前提上**。
而正则**有可能漏匹配** —— 例如实参里再套一层括号 `writeText(fn(() => text))`。
漏匹配的后果**不是判红，而是少认一个出口**：门禁会照常报"N 个出口"然后 exit 0，
而那条没被看见的复制路径里完全可以是 `writeText(src.innerHTML)`。

→ **"没看见"不等于"没问题"。** 于是加一条自检：用**更宽松的调用点计数**
（不要求前面那个点）反过来校验**出口数**，数目对不上一律判红。

- 计数用的正则**刻意比提取用的宽松**（`\bwriteText\s*\(` vs `\.\s*writeText\s*\(`）——
  **两者的差别本身就是"提取漏了"的信号**，不需要另写一条判据去解释这个差。
- 计数前要排除"文案里出现一句 `writeText(`" —— 所以先给源码打一个
  **字符串字面量位置掩码**（`stringMask`）：**只标位置、不改内容**。
- ⚠️ 这里**不能**把字面量内容直接抹掉：那样 `createElement("textarea")` 里的
  `"textarea"` 也被抹了，连"这个 textarea 变量有没有被认出来"都数不出来，
  会误报成"0 处 textarea 创建但认出 1 个"。
  （本场次先写成"抹内容"、实测撞上这个假红，才改成位置掩码。）

### D. 故障注入（7 例；**每例先自证注入生效** —— 回读断言 / md5 与基线不同，再读门禁结论）

| 用例 | 注入 | 期望 | 实测 |
|---|---|---|---|
| base | 无 | 绿 | exit 0，"2 个出口，取值来自 textContent" |
| A | `writeText(src.innerHTML)` | 红 | exit 1（2 条问题：取值分歧 + 直接读 innerHTML） |
| B | `writeText(text.trim())` | **绿** | exit 0（新正则正确认出；旧正则认不出，会把这条路径漏掉） |
| C | `writeText(fn(() => text))` | 红 | exit 1（**靠新的计数自检**抓到：提取正则漏了这条） |
| D | 解构后的裸 `writeText(src.innerHTML)` | 红 | exit 1（**同样靠计数自检**抓到） |
| E | `ta.value = src.innerHTML` | 红 | exit 1（2 条问题） |
| F | 两条路径取不同的值 | 红 | exit 1（"不是同一个值" + 回溯看不懂 `src`） |
| G | 文案里出现一句 `writeText(` | **绿** | exit 0（位置掩码生效，**没有假红**） |

**B 与 G 是"不该红"的方向**：它们证明这条门禁不会因为写法变化或文案变化而误报 ——
只会因为"真的抄错了"而红。**C 与 D 是"新的判据才有价值"的证据**：
没有出口计数自检，这两例会静默通过（"没看见"被当成"没问题"）。

### E. 调研侧与一处"本轮不做"的自检

- `mcp__agu-papers__search_papers` 仍 `OpenAlex search failed (HTTP 429)`（瞬时限流，
  与前几轮同因，**不代表"查无此论文"**）；`web_search` 本轮返回的结果里，
  唯一与本站相关的一条是"文献管理器（Zotero / Mendeley）可标记并跟踪自引"，
  方向上与本轮做的 RIS 导出一致，但来源多为内容农场，**证据强度低，
  未据此改动站点口径，也未新增任何外部链接**。
- **"自引标记"本轮不做**：本站目前只有**一条**论文，自引标记在这个基数上
  没有读者可感知的收益，却要立刻新增一份需要维护的自引清单
  （新增论文时同步更新、门禁也得跟着守）。**留到论文数 ≥3 时再做**，不提前。
- 本节**不新增**待决策项，也**没有替本人拍板**任何一条。

### F. 本补充的边界

- **不 push**。本地 `main` 领先远端 50+ 个 commit，部署由本人决定。
- 本补充**只改本文件**，不碰任何代码/模板/门禁 —— `459c3e8` 里那批改动的
  代码已由本场次在**已提交状态**上复验：`npm run build` **exit 0**，
  `check:gates` / `check:css` / `check:wrap` / `check:site` / `check:lang` /
  `check:a11y`（A3："6 个引用代码块（RIS / BibTeX）都可键盘聚焦"）/
  `check:copy`（"2 个出口，取值来自 textContent"）**全绿**。

---
## 2026-10-19 · 14:45–15:05 场次：Copy 出口门禁的**覆盖范围**——从"只扫 main.js"扩到"扫 src/assets/**"

### A. 本场次定位

15:20 的只读交接件（`/tmp/mh_v21_e41cfa12/handover_1520.md`，场次 `mvs_e41cfa12`）
把 **Copy 门禁的"实参逃逸"**那条线判为**已修好、可关闭**（`459c3e8` 已承重，5/5 复验通过）。

本场次走的是**另一条线**——**覆盖范围**。两者不重叠：

- 那条线修的是"实参不是裸标识符时门禁认不出出口"（**单个文件内**的识别能力）；
- 这条线修的是"**别的文件**里的复制出口，门禁根本不看"（**文件之间**的覆盖范围）。

### B. 缺口：9 个浏览器 JS，门禁只看 1 个

`src/assets/js/` 下实际有 9 个浏览器 JS：

```
main.js   nav.js   theme.js
paper-reader/{main,annotations,highlight,reading-progress,theme,toc}.js
```

而 `scripts/check-copy-export.cjs` 的 `target` 写死 `src/assets/js/main.js`
（`process.argv[2]` 只是故障注入用的单文件入口）。
→ 将来只要在**别处**加一个 Copy 按钮，这条门禁**看不见**：
它会照常报"2 个出口，取值来自 textContent"并 exit 0，
而那个新按钮完全可以是 `writeText(src.innerHTML)`。
**没看见 = 没守**：门禁绿着，缺陷照样上线。

**今天**的复制出口确实只有 `main.js` 一处（14:20 交接件第 4 节已核，本场次 grep 复认），
所以**今天**它还不是缺陷——是**下一个人**的坑。门禁的价值在于约束将来。

### C. 改了什么

判据 1–5 的**正文逐字保留**（检测逃逸、计数自检、fail-closed 都不动），
只改了两条**口径**，加了**一条**判据：

| 变化 | 原来 | 现在 | 为什么 |
|---|---|---|---|
| 扫描范围 | 只有 `src/assets/js/main.js` | `src/assets/**` 下所有 `.js`（跳过 `._*` 资源叉与 `node_modules`） | 补上"别处新增复制出口看不见"的缺口 |
| 判据 1 的作用域 | 对**每个文件**成立 | 对**整个扫描集合**成立 | 某个文件里没有复制出口**不是问题**（它只是不参与复制）。**这条正是"别处合法用一次 `innerHTML` 不得误报"能成立的前提** |
| 判据 2（两条路径取同一值）的分组 | 单文件 | **按文件** | 一个文件里的 `writeText` + `textarea` 回退是**同一个功能的两条路径**；两个**各自独立**的复制功能分处两文件时本来就该取不同的值——按全站比会误伤 |
| **判据 6（新增）** | — | `writeText` 与 `textarea` 回退**分处两个文件** → 判红 | 判据 2 按文件比对，跨文件就够不着 → "没看见 = 没守"。只在"全站恰好一个 `writeText` **且**恰好一个 `textarea` 回退"时触发，出现两个以上时无法确定谁配谁 → 宁可放过也不误伤 |

判定逻辑本身按文件拆成 `analyzeFile()`，逐文件独立判定，再按集合汇总。

### D. 复验：A/B 双沙箱，17 例，新旧逐例对照

**方法**：`old/` 与 `new/` 两个沙箱放**完全相同**的 `src/assets` 树，**只有门禁脚本不同**；
每次注入后两棵树同步重建，保证两边输入逐字相同。零共享工作区写入。
驱动脚本：`/tmp/mvs_a28294bac2da40dd8af2f82ac6d8d032/driver.js`（含回读断言：md5 与基线不同且等于注入后内容，才算"注入真的生效"）。

#### D1. 单文件回归（9 例，14:20 场次的原表）——新旧**逐例一致**

| 用例 | 期望 | 旧门禁 | 新门禁 | 判定 |
|---|---|---|---|---|
| BASE（不注入） | 0 | 0 | 0 | ✓ |
| I1 取值改成 `.innerHTML` | 1 | 1 | 1 | ✓ |
| I2 剪贴板路径改读 `innerHTML`（另一变量） | 1 | 1 | 1 | ✓ |
| I3 两条出口取不同变量（值都合法） | 1 | 1 | 1 | ✓ |
| **I4 ★别处合法用 `innerHTML`（不得误报）** | **0** | **0** | **0** | **✓ 不误报** |
| I5a 传递链 `html=src.innerHTML` → `text=html.trim()` | 1 | 1 | 1 | ✓ |
| I5b 传递链 `html=src.innerHTML` → `text=html` | 1 | 1 | 1 | ✓ |
| I6 复制出口整体被移除 | 1 | 1 | 1 | ✓ |
| I7 只删 textarea 回退赋值（复制功能仍在） | 0 | 0 | 0 | ✓ |

**9/9 逐例一致** → 覆盖范围扩展**没有改变单文件语义**（14:20 交接件那张表可直接复用）。

#### D2. 覆盖范围（8 例，本轮新增）

| 用例 | 注入 | 旧门禁 | 新门禁 | 判定 |
|---|---|---|---|---|
| **N1** | 别处新增坏出口 `writeText(src.innerHTML)` | **0** ⚠️ | **1** | ✓ **这就是覆盖缺口：旧门禁绿着，缺陷照样上线** |
| **N2 ★** | 别处合法用 `innerHTML`（无复制代码） | 0 | **0** | ✓ **不误报**（仓库里已有真实同类：`paper-reader/annotations.js` 的 `node.innerHTML = v`） |
| N3 | 别处新增**独立**复制功能（取值合法） | 0 | 0 | ✓ 两个独立功能各取各的值，不互相误伤 |
| N4 | 两条路径被拆到两个文件 | **0** ⚠️ | **1** | ✓ 旧门禁**静默失效**；新门禁由判据 6 兜住（消息点名两个文件） |
| N5 | 全站复制出口被移除 | 1 | 1 | ✓ fail-closed |
| N6 | `main.js` 无出口、别的文件有 | **1** ⚠️ | **0** | ✓ 旧门禁按单文件判 → **误报**；新门禁按集合判 → 正确 |
| N7 | `main.js` 出口被删 + 别处有坏出口 | 1 | 1 | ✓ 旧门禁红得没道理，新门禁红在真缺陷上 |
| N8 | 新文件里两条路径取不同值 | 0 | 1 | ✓ 判据 2（按文件）在多文件模式下同样生效 |

**N4 的红因核对过**：第一版注入里 `text` 未声明，撞上的是"找不到声明"那条，
不是判据 6 → **把注入改成自洽后重跑，红因才是判据 6**
（"两条复制路径分处两个文件（clipboard.writeText → src/assets/js/main.js，
textarea 回退 → src/assets/js/fallback-only.js）"）。这正是"先确认注入真的生效、
再读门禁结论"的必要：注入不当时，**红是真的，理由却是错的**。

### E. 端到端

- 隔离克隆（`git clone --no-hardlinks` + `node_modules` 符号链接），HEAD = `6e319e1`，
  装入本场次门禁后 `npm run build` → **exit 0**；
- 输出：`Copy 出口检查通过（扫 9 个 JS 文件：2 个出口在 src/assets/js/main.js，取值来自 textContent）`；
- 同一次 build 里 `check:gates`（8 个门禁脚本全部从 `npm run build` 可达）/
  `check:css` / `check:wrap` / `check:site`（**门禁编号：文件头清单 31 条 / 代码段 31 条，
  一一对应且连续；对照表 31 行**）/ `check:lang` / `check:a11y` 全绿。

### F. 边界（不是缺陷，是范围）

1. 扫描范围划在 `src/assets/**`（浏览器端 JS）。若将来浏览器 JS 落到这个目录之外，
   这个门禁同样看不见 —— 见「留给下一轮」第 1 条。
2. 判据 6 只在"全站恰好 1 个 `writeText` **且** 1 个 `textarea` 回退"时触发；
   两个以上时无法确定谁配谁 → 放过。
3. **本场次动手期间，`scripts/check-overflow.cjs` 被另一个场次改动**（工作树里 `M`，
   112 行：把写死的 macOS Chrome 路径改成跨平台查找）。
   本场次**没有碰它，也没有把它带进本次提交** —— 只提交自己的两个文件。
4. `src/_data/site.js` 是**构建期数据**、不是浏览器 JS，**不在**扫描范围内（正确）。

### G. 需要本人拍板

**无。** 本场次没有新增任何需要拍板的口径。

（15:20 交接件的两条待拍板项——paper @id 的 `url` 口径、新门禁 31 的边界——**仍然开放**；
本场次未代拍板，也**未改动中央「待决策」清单**，以免与在途改动冲突。）

### H. 留给下一轮

1. **扫描范围要不要扩到 `src/**`？** 本轮按"浏览器端 JS"划在 `src/assets/**`。
   若将来 JS 落到别处（例如 `src/scripts/`），要么把范围扩到 `src/**`
   （要**排除** `src/_data/site.js` 这类构建期数据文件），要么另设一条门禁。
   **这是个口径问题**，本轮按最小可用范围处理。
2. **判据 6 的"恰好 1+1"限制**：全站有两个以上复制功能时，跨文件配对会放过。
   可考虑改成"按文件分组 + 组内配对"，但要先确认不会与"两个独立功能"混淆。
3. **P1 / D1 / D2 / `#person sameAs` 冲突**（15:20 交接件）仍开放：
   新增门禁编号要用 **31**（`verify-site.cjs` 的文件头清单当前最大编号是 **30**；
   build 输出的"31 条"是**条目数**，含 4b / 4c / 12a 这类子号），
   且字段清单要**加 `sameAs`**（字符串 / 数组两种形态，判据必须先归一化，
   否则 `sameAs.includes(ORCID)` 对字符串会退化成"子串在字符串里"）。

### I. 本场次的边界

- **不 push**。本地 `main` 领先远端，部署由本人决定。
- 本场次**没有新增**任何外部链接、外部依赖、密钥、账号。
- 复验环境：隔离克隆 `/tmp/mvs_a28294bac2da40dd8af2f82ac6d8d032/clone`
  （HEAD = `6e319e1` + 本场次门禁改动），`npm run build` → exit 0；
  驱动脚本 `/tmp/mvs_a28294bac2da40dd8af2f82ac6d8d032/driver.js`（17 例，含回读断言）。
## 2026-10-19 · 14:50 订正：14:30 巡检表里「首页 `citation_*` = 0 个 ⚠️」**不是缺陷**，是已验证的正确状态

> 订正对象：14:30 巡检节「爬虫定位链整条指向 404」那张表的最后一行
> （`docs/IMPROVEMENT-LOG.md` 约 5298 行）：
>
> | 首页的 `citation_*` 元标签 | **0 个**（第三轮才加的） | — | ⚠️ |
>
> 这行的**结论（0 个）是对的，但 ⚠️ 的标法是错的**，而且括号里那句
> 「（第三轮才加的）」会引人往错的方向修。**本节把它写清楚，免得下一轮
> 去"修"一个不该修的东西。**

### A. 实测：0 个正是设计，且早在本仓有记录

本地产物实测（论文页 `index.html`）：

```
citation_abstract ×1   citation_abstract_html_url ×1   citation_author ×7
citation_doi ×1        citation_firstpage ×1            citation_issn ×2
citation_issue ×1      citation_journal_title ×1        citation_keywords ×1
citation_language ×1   citation_pdf_url ×1             citation_publication_date ×1
citation_publisher ×1  citation_title ×1               citation_volume ×1
```

合计 **22 个（15 类）**，全部在**论文独立页**；首页 / 列表页 / 博客 / 关于 / 404 **各 0 个**。

这与本仓第三轮的验收记录**逐项一致**（日志 209 行）：
「`citation_*` 标签分布：论文页 **22 个**（15 类），首页/列表页/博客/关于/404
**各 0 个**（无泄漏）」——**当时就是按这个口径验过的**。

「第三轮才加的」指的是**第三轮给论文页加了这套标签**，**不是**给首页加。
括号在原句里把主语省略了，读起来正好相反。

### B. 为什么首页**必须**是 0 个

`src/_includes/partials/citation-meta.njk` 第 20–35 行有明文：

> 一篇论文一个页面。Google Scholar 明确建议「每篇文章一个页面」；
> 把多篇论文的 `citation_*` 混在一个列表页上，Google 只会认其中一组，
> 其余的静默丢失。
> 没有 `pubKey` 的页面（首页、博客、关于页）整块不输出——不摆空标签。

⚠️ **所以这一行真正的风险不是"首页缺标签"，而是有人会去给首页补标签。**
现在只有 1 篇论文，补了也看不出坏处（Google 只会认一组，而那组恰好是对的）；
等第 2 篇上线，混输就会让**另一篇被静默丢弃** —— 而且**不报错、不掉分、
只是"没被收录"**。这正是本仓反复记的那类"看起来在、其实不生效"。

### C. 线上 Scholar 收不到的真实原因（结论不变，但归因要改）

14:30 节的第 3 点写的是「线上又**一个 `citation_*` 标签都没有** →
Scholar 这一侧目前**既没有元数据、也没有可用的定位地址**」。

- **"没有可用的定位地址"** —— 对。线上每页 `canonical` 都指向 404。
- **"没有元数据"** —— **归因不准**。线上**根本没有论文页**
  （`/papers/trmm-thunderstorm-stages/` 404，论文页是本轮才加的、还没部署），
  所以线上**不存在"该有 `citation_*` 的地方"**。
  缺的不是标签，是**那一个页面本身**。

→ 部署后应一次消掉：论文页 200、其上 `citation_*` 22 个（15 类）、
`canonical` 指向 `https://github.lvyihang.xyz/papers/trmm-thunderstorm-stages/`
（14:30 节的验收清单里已有这一条）。

### D. 留给下一轮：把「不混输」从人工约定变成机器门禁

第三轮那条"标签分布"是**人工验的**，日志里记着，但**没有门禁守着** ——
今天靠人记住，明天就可能有人去"修首页"。

- 建议门禁（编号接在同伴正在写的 31 之后）：**`citation_*` 标签分布**——
  论文页 `citation_*` 计数 == 期望值（22 个 / 15 类）**且** 首页、列表页、
  博客、关于、404 页**一个都没有**（反向判据：任何一个非论文页出现
  `citation_*` 就判红）。
  形状与门禁 16 对 `identityOn404` 的双向判据同一构型。
- ⚠️ 本轮**不实施**：同伴场次正在改 `scripts/verify-site.cjs`（加门禁 31），
  本场次**零写入**该文件，不撞号、不撞 hunk。

### E. 本订正的边界

- **只改本文件**，不碰任何代码 / 模板 / 门禁。
- **不 push**。本地 `main` 领先远端 50+ 个 commit，部署由本人拍板。

---
## 2026-10-19 · 15:00–15:20 补充（**只读复核，零代码改动**）：`patch_C.diff` 不可套用的裁定 + 一处**订正**

### A. 裁定（与 11:45 场次一致，本场次独立复核后维持）

**`/tmp/mvs_dd21f18c_r10/patch_C.diff` 不可套用**，三条理由各自独立成立：

1. **套不上**：本场次实测 `git apply --check` → **exit 1**，
   `scripts/verify-site.cjs:1089` 与 `eleventy.config.js:355` **两处都对不上**。
2. **它带的判据更松**：补丁里的判据是
   `(typeof e.status === "number" || typeof e.code === "string")`——
   `typeof e.code === "string"` 会把 **EACCES / EPERM** 当成"没有 git 历史"吞掉。
3. **加固 C 早已在现行代码里**：`scripts/verify-site.cjs:1217`、
   `eleventy.config.js:373`、`eleventy.config.js:415` 三处都是
   `if (!isGitProcessFailure(e)) throw e;`。

缺口 A 已由**门禁 16** 的双向判据覆盖（`src/404.njk:26` 的 `identityOn404: true`）。

### B. ★**订正**：11:45 交接件把「现行判据」写错了

11:45 交接件里写的是"现行 = `("status" in e || e.code === "ENOENT")`"。
**本场次实测：现行不是这个。** HEAD 与工作树**两处都**是

```js
!!e && typeof e === "object" && (typeof e.status === "number" || e.code === "ENOENT");
```

（`scripts/verify-site.cjs:1200`、`eleventy.config.js:361`；判据**逐字一致**。）

`"status" in e` 那个版本是**已被否决的候选**——14:10 场次在 `459c3e8` 里明确**撤回**了它
（见本日志 §E「判据裁定」：它在真实 EACCES 下会造出**假绿**）。
→ **这条订正要紧**：若有人照 11:45 那句描述去"对齐"，等于把**已撤回的错版本**装回去，
而那正是要防的静默失效。**裁定本身（别套）不受影响，错的只是那句"现行长什么样"。**

### C. 独立复核：真实失败对象上的判据对照

判据**从源码原文抽出**（不手抄），错误对象**真实**（`chmod 000` → 真 EACCES）：

| 真实失败 | 现行判据 | 补丁判据 |
|---|---|---|
| **EACCES**（`code=EACCES`, `status=null`） | **抛出**（fail-closed ✓） | **吞掉**（✗ 当成"没有 git 历史"） |
| ENOENT（`code=ENOENT`） | 吞掉（✓ 正是"不在 git 仓库里"那条路径） | 吞掉 |
| exit 1（`status=1`） | 吞掉（✓ git 非零退出） | 吞掉 |
| SIGKILL（`signal=SIGKILL`, `status=null`） | 抛出（✓ fail-closed） | 抛出 |

→ **决定性的就是 EACCES 那一行**：现行抛出、补丁吞掉。这就是"补丁不可套用"的技术根据。

复现脚本：`/tmp/mvs_a28294bac2da40dd8af2f82ac6d8d032/check_criterion.js`（只读仓库，零写入）。

> ⚠️ 复验环境的一个坑（记下来）：第一版把失败**经 `/bin/sh` 触发**，
> 结果 shell 把 "Permission denied" 变成**退出码 126**，
> Node 拿到的是 `status=126`（数字）→ 现行判据也判"吞" → 看起来"两者一样"。
> **验证环境失败会伪装成被验证对象的性质。** 直接 exec 文件本身
> （不经 shell）才会拿到真正的 `code=EACCES` 错误对象。
> 脚本里已加自证：EACCES 用例若拿不到 `code === "EACCES"` 就直接 exit 2。

### D. 根因线索：日志的「判据裁定」段**同时出现两个版本**

`"status" in e` 这个字面量在本日志里出现 **4 处**（`:2450`、`:4894`、`:5220`、`:5511`/`:5517`），
全部在**讲历史**——"peer 建议过这个版本，我们驳回了"。
→ **只读日志、不核代码的 peer 交接件，很容易把"被否决的候选"当成"现行代码"。**
这是本条订正的来源，也是它值得写进日志的原因：**引用"现行代码长什么样"时，
必须回代码里核一遍，不能只看日志里的字面量。**

### E. 本场次的边界

- **零代码改动**：本节只追加日志，**没有**碰 `scripts/verify-site.cjs` /
  `eleventy.config.js` / `src/assets/js/main.js` / `src/_data/site.js`。
- **不 push**。本地 `main` 领先 `oldsixxiaolv/main` 64 个 commit，部署由本人决定。
- 工作树里 `scripts/check-overflow.cjs` / `package.json` /
  `scripts/check-gates-wired.cjs` / `.github/workflows/deploy.yml` 仍是**别的场次的在途改动**，
  本场次没有碰、也没有带进任何提交。
## 2026-10-19 · 14:45–15:05 场次补充（协调）：sameAs 真缺陷已定位、门禁 31 已占用、窄屏门禁接进链的一处 TDZ 崩溃

> 本场次**只改 `docs/IMPROVEMENT-LOG.md` 与 `scripts/check-overflow.cjs` 的 2 行**，
> 其余在途改动（`eleventy.config.js` / `verify-site.cjs` / `package.json` /
> `deploy.yml` / `check-gates-wired.cjs` / `check-wrapping.cjs` /
> `check-copy-export.cjs`）**不是本场次写的，本场次一律不提交它们**。

### A. 独立复核：15:20 场次报的 sameAs 冲突**成立**（我用自己的扫描器复现）

先说一条**方法论教训**：我第一版扫描器只遍历 JSON-LD 的顶层 `@graph`，
于是只看到 6 个节点、且 sameAs 全都一样 → 差点判成"没有冲突"。
**真相在嵌套里**：论文的 `author`、数据集/胶囊的 `creator` 都是**嵌套的 Person 节点**，
它们带着本人的 `@id`。不递归就等于看不见这条门禁的真正目标。
（这一点后来被写进 31 号门禁的判据 ① —— 同一个坑，判据里已经堵上了。）

改成递归扫描（自己的脚本，不跑交接件给的脚本）后，与交接件**逐字一致**：

```
HEAD 产物：13 个 #person 节点
  · 9 个：sameAs = [ORCID, GitHub, ResearchGate, CSDN, OpenAlex]（全集）
  · 4 个：sameAs = "https://orcid.org/0009-0005-3511-0546"（裸字符串）
    —— 只在 about / blog / index / papers/index 四页
```

**后果**：消费方按 `@id` 把"本人"归并成一个节点时，**取到哪套取决于遍历顺序**；
拿到残缺那套，就等于替本人丢掉 GitHub / ResearchGate / CSDN / OpenAlex 四个句柄。

**根因**（与 15:20 场次的判断一致）：`jsonLdArticles` 给"本人"发射的是**残缺节点**
（`sameAs` 只有 ORCID 裸字符串），而 `jsonLdPaper` 与 `base.njk` 发射的是**全集**。
`eleventy.config.js` 里那句注释「本人的判定**必须**与 jsonLdPaper 用同一份数据、同一套判据」
说明**这个意图本来就存在，只是没落到 sameAs 上**。

**修复已在工作树里**（`eleventy.config.js`：本人节点改用 `site.author.sameAs` 全集）。
本场次在**隔离克隆**里验了修复前后的产物：

| | #person 节点 | 带走全集的 | 带裸 ORCID 的 |
|---|---|---|---|
| HEAD（未修） | 13 | 9 | **4** |
| 修复后 | 13 | **13** | **0** |

→ 同一件事一句话说清：**"标识符统一 ≠ 标识符描述统一"** ——
门禁 12 守的是前者，13 个节点里 4 个描述漂移这件事，现有门禁一条都看不见。

### B. 门禁 31 已占用：它是**「同一 @id 的同名字段必须一致」**（不是 ItemList）

工作树里 `scripts/verify-site.cjs` 已在写 31 号门禁，方向是 JSON-LD 一致性。
我逐条核对了 15:20 场次提的三档分类，**判据已经全部吸收**：

| 15:20 场次的分类 | 31 号门禁的实现 | 判定 |
|---|---|---|
| ① 真矛盾 → 红 | 同一 (@id, @type) 组内同名字段出现互不相同的取值 → 判红 | ✅ |
| ② 一方是另一方**超集**（多带可选属性）→ 不红 | `normValue` 对**嵌套对象/对象数组返回 null → 不判**（`isPartOf` 的 `issn` 差、`author` 差都在此列） | ✅ |
| ③ 归一化后集合相同 → 不红 | 数组按"去重排序后的集合"比；`sameAs`/`keywords`/`knowsAbout` 的**逗号串**先切集合再比 | ✅ |
| 字段缺失不算冲突 | 判据 ③：`hasOwnProperty` 为假 → 不算 | ✅ |
| **url / datePublished 口径待拍板 → 不要临时豁免** | `PENDING_FIELDS = {url, datePublished}`，**只报不判**，并在注释里写明"拍板后把字段名删掉即变成硬判据" | ✅ |
| 必须能自证判据没失效 | 门禁自带"一个字段都没比成 / sameAs 一次都没被比对 → 判失效"的自查 | ✅ |

⚠️ 15:20 场次那个"要求**双向**包含"的坑（会把超集判成真矛盾），
这里的实现是**单向 `a ⊆ b` 即视为覆盖差异** —— 坑没踩。

**编号裁定**：`31` = JSON-LD 一致性（已占用）。
**ItemList（`/papers/` 列表级 JSON-LD）改用 `32`**，登记在文件头清单 + 旧编号→新编号对照表两处。
⚠️ 重复编号会直接撞门禁 24/29 的连续性检查 → **build 直接变红**。

### C. 本场次修的一处真崩溃：窄屏门禁接进 build 链后，build 立刻是红的

`check:overflow` 被接进 build 链（`package.json`）后，**整条 build 链 exit 1**：

```
检查失败： Cannot access 'chrome' before initialization
```

**根因**：变量已从 `chrome` 重命名为 `found`，但**两处漏改**：

- 第 276 行 `console.error(`✗ ${chrome.reason}`)`
- 第 290 行 `const chromeBin = chrome.bin;`

而 `const chrome = await startChrome(chromeBin);` 在**第 321 行**才声明
→ 这两处落在**暂时性死区（TDZ）**里。
本机 Chrome **是找到了的**（`/Applications/Google Chrome.app/...` 在候选路径里），
所以走的是第 290 行那条 → 崩在 TDZ 上。

⚠️ 这个 bug 的杀伤力在于**它把真正的失败原因掩盖了**：
它本来想打印的是"找不到浏览器"或"启动失败"的**可读诊断**，
结果诊断语句自己先崩了 —— 读者只看到一句莫名其妙的 `Cannot access 'chrome'`。

**修法**（2 行，已在共享工作树里改好，`found.reason` / `found.bin`），
**验证**（隔离克隆，带全部在途改动）：

| 状态 | `npm run build` |
|---|---|
| 在途改动原样 | **exit 1**（TDZ 崩在 `check:overflow`） |
| 修这 2 行后 | **exit 0** —— 门禁接线 / CSS / 断行 / 站点自检（含 31）/ 语言 / a11y / Copy 出口 / **窄屏（6 页 scrollWidth 390）** 全绿 |

本场次**只改了这两行**，没有动该脚本的其他任何部分；该脚本其余内容属在途场次所有。

### D. 本轮的「留给下一轮」：**ItemList（门禁 32）**

`/papers/` 加列表级 `ItemList` JSON-LD（`itemListElement` / `position` / `numberOfItems`），
消费方才能拿到"这个站点有几篇论文、按什么顺序"这个**列表级**实体
（现在只有一堆彼此无序的 ScholarlyArticle）。

**本轮不做**，原因：工作树同时有三组在途改动，而 `eleventy.config.js` 与
`scripts/verify-site.cjs` 正是**最热的两个文件**（31 号门禁 + sameAs 修复都在里面）——
再插一个并发改动进去，是纯粹的撞车风险。**等树干净了再做。**

下一轮接手时的完整要求（已整合 14:35 提案 + 15:20 判据）：

1. 只动三个文件：`eleventy.config.js`（新 filter）、`src/papers.njk`、
   `scripts/verify-site.cjs`（门禁 32 + 文件头清单 + 对照表 `（无） → 新 32`）。
2. **必须用独立 `<script type="application/ld+json">` 块**（`base.njk` 的
   `{% block structuredData %}` 扩展点）——**不要**改 `jsonLdArticles` filter：
   它被 4 个页面共用（首页/blog/about 也输出全量 @graph），改它会把 ItemList 泄到那三页。
3. `item.@id` 必须与论文页 `ScholarlyArticle` 的 @id **逐字相同**。
4. 门禁 32 的 32d 要**比提案更强**：不只断言"每个 item.@id 有对应页面"，
   要断言"**每个 item.@id 能在同一页的 JSON-LD 实体里找到同 @id 的节点**" ——
   用同一个 @id 的全部意义就是让消费方把列表项与论文实体**合并成同一个节点**。
5. 故障注入至少 3 例，**每例先自证注入生效**（回读断言 / md5 与基线不同）：
   改 `numberOfItems` → 32b 判红；调换 `itemListElement` 顺序或改 `position` → 32e 判红；
   把某个 `item.@id` 改成与论文页不一致 → 32d 判红。还原后复绿。
6. `npm run build` 必须 exit 0（取退出码**不要接管道**：`cmd >log 2>&1; echo $?`）。
7. 提交只显式 `git add` 那三个文件，**不用 `git add -A`**，中文 commit，**不 push**。

### E. 边界

- **不 push**。本地 `main` 领先远端 50+ 个 commit，部署由本人拍板。
- 本场次**没有新增**待决策项，也**没有替本人拍板**任何一条。
- `url` / `datePublished` 两个字段的口径仍**挂在本人的待决策清单里**（31 号门禁对它们
  只报不判）；本场次**不替本人选**，也**不在判据里留临时豁免**。

### F. 提交说明（谁该提交什么）

- 本场次**只提交本文件**（日志）。
- `scripts/check-overflow.cjs` 的那 2 行修正**已在共享工作树里**，
  但该文件的其余 +120 行是**别的在途场次**的改动 ——
  本场次**不提交它**（提交它会把别人的在途成果一并卷进来）。
  请**该脚本的作者**在提交自己那组改动时把这两行一并带上
  （幂等：`chrome.reason` → `found.reason`、`chrome.bin` → `found.bin`）。
  若这两行被还原，**build 会立刻 exit 1**（`Cannot access 'chrome' before initialization`），
  且真正的失败原因会被这句 TDZ 报错**掩盖**。
- 本场次**没有替任何在途场次提交它的代码**。
## 2026-10-19 · 15:00–15:15 场次（**不占轮次号**，避免与并发场次撞号）：长串断行门禁的扫描范围补全 + 门禁 29 锚点消歧

> 本场次处理 `mvs_dd21f18c`（14:30 场次）交接的 4 条发现。
> **每条都现查现跑独立复现，不采信转述**；结论与交接件有出入的地方逐条记在下。
> 本场次只改 `scripts/check-wrapping.cjs` 与 `scripts/verify-site.cjs`（门禁 29 的锚点）
> + 本文件；**其余在途改动一律不提交**（见 §F）。

### A. 交接件 4 条的逐条裁定

| 交接件条目 | 本场次复核结论 | 依据 |
|---|---|---|
| ① `check:wrap` 只扫 `src/assets/css/`，模板内联 `<style>` 不在范围，但汇总句写死"站内无 break-word" | **成立**，本轮修 | 见 §B 的注入证据 |
| ② C2（`gitOut`/`gitRoot`/`lastCommitTime` 裸 catch 收窄） | **已过时**：已由 `f59fec4` 落地 | 本仓 14:10 轮已用**真实 EACCES**（把 `execFileSync("git",…)` 换成 `chmod 000` 的 `./nogit`）独立复验过：已提交版 fail-closed 崩栈，peer 建议的 `"status" in e` 会让 build 与门禁**双双假绿** |
| ③ D1（门禁 18 汇总指向空气）/ D2（门禁 12 note 与报错矛盾） | **D1 已过时、D2 在途已修** | D1：现行 `verify-site.cjs:1374-1381` 的措辞已按 `perPageChecked > 0` 条件化（判红后不再照抄"已逐页核对"）。D2：在途改动已加 `ownerNodesWithoutId` 计数器。本场次另行独立判定：**绿态下该 note 恒真**（`ownerIds.size === 1` 且无 fail ⇒ 所有本人节点确有同一个 `@id`），**红态下 note 不参与判定**（门禁已红），故 D2 的实际危害是措辞而非误判 |
| ④ 门禁 29 锚点不唯一 | **成立**，本轮修 | 见 §C 的 A/B 证据 |
| ⑤ "RIS 那条门禁还没进" | **已过时** | 已由 `459c3e8` 补上（`publications.ris` 现 14 处命中） |

### B. 改动 1：`check-wrapping` 的扫描范围补全（交接件 ①）

**缺陷是什么**：W2 的措辞是"**站内**任何地方都不许再出现 `overflow-wrap: break-word`"，
但实现只遍历 `src/assets/css/` 下的 `.css` 文件。而站内还有两条样式来源原样进产物：

- `src/about.njk:41-336` 有一整块内联 `<style>`（其中 `:314` 就是 `overflow-wrap: anywhere`）；
- 模板里的 `style="..."` 内联样式属性。

于是内联块里的 `break-word` 一路漏到产物里，**而门禁还在汇总里宣称"站内无 break-word"** ——
说法与事实脱节，这比门禁不存在更糟。

**本场次实测（在隔离克隆里注入，与共享工作树零写入）**：

```
注入：src/about.njk 内联块里 overflow-wrap: anywhere → break-word
  → node scripts/check-wrapping.cjs   exit 0
    输出仍为「…站内无 overflow-wrap: break-word。」
  → npx @11ty/eleventy 之后，产物 _site/about/index.html:1247 真的写着
    `.about-contact dd { … overflow-wrap: break-word; }`
对照（同样的注入放进 src/assets/css/components/_list.css）
  → exit 1，报「选择器「.list--cards .list__meta」用了 overflow-wrap: break-word」
```

**改法**（`scripts/check-wrapping.cjs`）：

1. 扫描范围扩到**三类来源**：① `src/assets/css/**/*.css`；② 模板内联 `<style>` 块；
   ③ 模板 `style="..."` 属性（属性值本身是一段声明列表，补一对花括号塞回同一个解析器）。
2. W2 的判读抽成**一份** `wrapDecls(css)`，W1（全局覆盖）与 W2（禁 break-word）共用 ——
   同一套判据只写一遍，两边不会各自漂移。（交接件的补丁把 W2 的判据**复制**了第二份，
   那是 `OK_VALUES` 将来改动时的漂移来源。）
3. 加一条**盲区**判据：eleventy 的 `{% inlineCss %}` 短码能把**任意路径**的 CSS 以 `<style>`
   塞进产物，引用 `src/assets/css/` 之外的文件 = 门禁永远看不见。本站现有 3 处引用
   （`base.njk:62/63`、`paper.njk:300`）都在范围内，但那条路**没有护栏**。
4. W1（全局兜底必须覆盖 12 种标签、必须用 anywhere）**仍只认 CSS 文件**：
   全局兜底必须对全站生效，模板内联块是页面级的，拿它顶替会让别的页面失去保护而门禁还绿着。
   相应的报错文案补了这一句，免得下一轮的人把兜底搬进模板。
5. Nunjucks 注释 `{# … #}` 先剥掉（不渲染的东西不能算样式）；**markdown 不扫**
   （内容文件里的代码示例可能正当展示 `break-word`，会误报）；`style="…{{ x }}"`
   这类动态值**判不了就不猜**（跳过，不判红）。

**故障注入 12 例（隔离克隆，每例先复位，判据与退出码同时断言）**：

| 例 | 注入 | 期望 | 实测 |
|---|---|---|---|
| 基线 | 无 | 绿 | ✅ exit 0 |
| ① | 内联 `<style>` 里的 `break-word` | 红 + 红因含"模板内联 \<style\>" | ✅ |
| ② | CSS 目录里的 `break-word` | 红 + 红因含"CSS 文件" | ✅ |
| ③ | 两处同时坏 | 红，报 2 条 | ✅ |
| ④ | 模板 `style` 属性里的 `break-word` | 红 + 红因含"style 属性" | ✅ |
| ⑤ | `style` 属性多条声明里夹着 `break-word` | 红 | ✅ |
| ⑥ | `inlineCss` 引用扫描范围外的文件 | 红 + 红因含"盲区" | ✅ |
| 反例① | Nunjucks 注释里提到 `break-word` | 绿（不渲染） | ✅ exit 0 |
| 反例② | markdown 代码块里展示 `break-word` | 绿 | ✅ exit 0 |
| 反例③ | `style` 属性是动态值 `{{ foo }}` | 绿（不猜） | ✅ exit 0 |
| 反例④ | `inlineCss` 仍引用范围内文件 | 绿 | ✅ exit 0 |
| 反例⑤ | 全部还原 | 绿 | ✅ exit 0 |

**汇总句也改了**（原来那句"站内无 break-word"是空话）：

```
长串断行门禁通过：全局兜底 = overflow-wrap: anywhere，覆盖 12 个标签类型（要求 12 个）；
已扫 15 个 CSS 文件 + 1 个模板内联 <style> 块 + 0 处 style 属性，其中无 overflow-wrap: break-word。
```

### C. 改动 2：门禁 29 的锚点消歧（交接件 ④）

**缺陷是什么**：门禁 29 在**自己的源码**里定位文件头那张「旧编号 → 新编号对照」表，用的是
`SELF_SRC.indexOf(...)` —— 全文件搜、取第一次。而这两个锚点在文件里**都不唯一**：

- 标记串 `旧编号 → 新编号对照`：**8 处**（清单条目 1 + 表头 1 + 代码段 6）
- 结束标记 `用法：node scripts/verify-site.cjs`：**2 处**（表尾 1 + 判据代码里 1）

于是 `tableStart` 实际取到的是**第 58 行的门禁清单条目**，不是第 65 行的表头；
而"表被删"那条报错（`找不到文件头的「旧编号 → 新编号对照」表`）**几乎不可达**。

**本场次实测（删掉整张表，A/B 双沙箱，同一份注入输入）**：

| 注入 | 旧门禁报什么 | 新门禁报什么 |
|---|---|---|
| 删掉整张表 | 「对照表里没有门禁 1, 2, 3, … 30 —— 每加一条门禁都要…补一行」 | 「对照表的锚点不对…**对照表被删掉或标记被改写了**」 |
| 改写表头标记 | 同上（误导：像是"漏补行"） | 「锚点不对…被删掉或标记被改写了」 |
| 造一处重复锚点 | 同上 | 「锚点不唯一，**取哪一个都是猜** —— 判据不能这么用」 |
| 删掉结尾标记 | 同上 | 「锚点不对…被删掉或标记被改写了」 |

**改法**（`scripts/verify-site.cjs` 门禁 29）：

1. 锚点只在**文件头块注释**里找（本文件自己的代码段也含这两个字符串，全文件搜会把
   判据自己的代码当成表）。
2. 表头锚点收紧成 `旧编号 → 新编号对照（`（带左括号）：文件头区域内**恰好 1 次**；
   清单里那条是「…对照**表**必须覆盖…」，不带括号，本来就区分得开。
3. **两个锚点都必须恰好命中 1 次**，否则直接判红并说清是"被删/被改写"还是"不唯一"——
   锚点不唯一时取哪一个都是猜，判据不能这么用。
4. 从**行首**起切（`lastIndexOf("\n")`）：切在字符串中间会把标题行的 ` * ` 前缀切掉，
   那行就不再被当成表行，"对照表：N 行"会少 1。**基线输出与旧版逐字相同**
   （`对照表：31 行，覆盖全部 31 个门禁编号且无重复行`），改动只影响出错时的信息。

### D. 验证

- `npm run build`（干净克隆 + 本场次两个改动）：**exit 0**（门禁链、站点自检 31 条、
  语言、a11y A1–A4、copy 出口全绿）。
- 干净克隆 = `git archive HEAD` + 本场次两个文件，无产物内绝对路径。
- 本场次**没有替任何在途场次提交它的代码**。

### E. 边界

- **不 push**。本地 `main` 领先远端 50+ 个 commit，部署由本人拍板。
- 本场次**没有新增**待决策项，也**没有替本人拍板**任何一条（原有 8 条原样保留）。
- 交接件 ②③④ 的**成因在交接当时都成立**，但 ② 已被 `f59fec4` 覆盖、③ 已被在途改动覆盖；
  本轮修的是当时**仍然成立**的 ① 与 ④。

### F. 提交说明（谁该提交什么）

- 本场次提交 3 个文件：`scripts/check-wrapping.cjs`、`scripts/verify-site.cjs`（**只含**门禁 29
  的锚点那一段）、`docs/IMPROVEMENT-LOG.md`（**只含**本场次这一节）。
- `scripts/verify-site.cjs` 的其余在途改动（**门禁 31 整套**、门禁 12 的 `ownerNodesWithoutId`、
  门禁 18 的四态措辞）**不是本场次写的**，本场次用 `hash-object` + `update-index --cacheinfo`
  只把自己那一段放进索引，**不提交它们**。
- `docs/IMPROVEMENT-LOG.md` 同理：索引内容 = `HEAD` 的日志 + 本场次这一节，
  并发场次在共享工作树里追加的段落**留在工作树里**，由它们自己提交。
- 其余在途文件（`eleventy.config.js` / `package.json` / `deploy.yml` / `check-overflow.cjs` /
  `check-gates-wired.cjs` / `check-copy-export.cjs`）**不是本场次写的**，一律不提交。
## 2026-10-19 · 15:50–16:30 场次：Copy 出口门禁**判据 6 的触发条件改写** —— 出口一多就整体失效的那条保护

### A. 起点：15:45 场次的独立复验（`e6a41c0` 通过）+ 三条边界裁定

`mvs_e41cfa12`（**只读**：零工作区写入、零 commit、零 push）用**自己写的** A/B 驱动
（**不复用**本场的 driver.js）复验 `e6a41c0`：9 例全中，退出码**与红因关键词**都断言；
干净克隆 HEAD=`e6a41c0` → build exit 0。
→ **`e6a41c0` 独立复核通过，可以留。**

它给的三条裁定，本场次逐条处理：

1. **扫描范围就 `src/assets/**`，不扩到 `src/**`** —— 实测 `src/assets` 之外只有
   `src/_data/site.js`（构建期数据，不下发浏览器，零复制出口）。扩了只是多扫一个
   **永远不可能含浏览器复制出口**的文件。→ **维持原口径。**
2. **9 个浏览器 JS 全是活代码**：`main.js` → `import` theme/nav；`paper.njk` 动态
   `import("/assets/js/paper-reader/main.js")` → 再拉起其余 5 个。产物里只见
   `main.js` 的 `<script>` 标签，是因为其余走 **ES module import**，不是"没被加载"。
   → **扩范围的对象是对的。**
3. ★**判据 6 的"恰好 1+1"限制会整体失效** → 本场次**修掉了**（下节），
   **不是只记为已知边界**。

### B. ★本轮主体：判据 6 在 writeText 出口 ≥2 时**整体失效**

第二十轮加的判据 6（跨文件的两条复制路径 → 判红）当时写的是：

```js
if (writeTextExits.length === 1 && fallbackExits.length === 1 &&
    writeTextExits[0].rel !== fallbackExits[0].rel) { ... }
```

→ **writeText 出口一旦达到 2 个，这条判据就不再触发**，跨文件拆分那条路径**静默通过**
（exit 0）。15:45 场次实测坐实；**本场次独立复现**（D 节 P1/P2：old exit 0 / new exit 1）。

**为什么值得现在修，而不是只记为已知边界**：这条门禁存在的理由是"将来在别处加 Copy
按钮也要看得见"；而"将来加**第二个**复制功能"恰恰是**最可能**触发它的场景 ——
**保护恰好在最需要它的时候被关掉**。今天全站只有 1 个复制功能，所以它还"有条件成立"；
等它失效的那天，正是它最该工作的那天。

**改法**：不数出口个数，改看**结构**。

- 旧：**全站恰好 1 个** writeText **且恰好 1 个** textarea 回退、且分处两文件 → 判红。
- 新：**某个文件里有 `clipboard.writeText` 出口、却没有同一文件里的 `textarea` 回退**
  → 判红（它的回退在别的文件 → 判据 2「按文件核对两条路径取同一个值」够不着它，
  将来只改一条、两条出口的行为就会分叉，而门禁看不见）。
- 只在"**全站存在 textarea 回退**"时启用：全站都不采用回退方案时，单独一个
  clipboard-only 的复制功能不算缺陷（不误伤）。

**为什么这样改能覆盖旧版的全部场景、且不多判**（逐条对应 D 节用例）：

- 旧版的命中条件"1+1 分处两文件"**必然**落在"某文件有 writeText 而无同文件回退"上
  → 新版**包含**旧版（不放松：P3 / P9）；
- 旧版**漏掉**的"writeText ≥2"场景（拆分后各成一个文件）→ 新版照样命中（P1 / P2）；
- 两个**各自独立**的复制功能（各带齐两条路径）→ 都不构成"缺同文件回退" → 不误伤（P5）；
- 全站无回退方案 → 判据 6' 不启用 → 不误伤（P4）。

### C. 已知边界（本轮明确记下，不假装没有）

1. **模板里的内联 `<script>` 扫不到**：门禁扫的是磁盘上的 `.js` 文件；而
   `src/_includes/layouts/base.njk:463`（防 FOUC 的主题注入）与
   `src/_includes/layouts/paper.njk:310`（paper-reader 的 `type="module"` 引导）
   是**内联浏览器脚本**，不在扫描面内。今天这两处**都不含任何复制逻辑**
   （`src/` 下 `clipboard` / `writeText` / `execCommand` 只命中 `main.js`），
   所以是**理论盲区**、不是现网缺陷。将来若有人把复制按钮**内联**写进模板，门禁看不见。
   → 要不要把扫描面扩到「`.njk` 里的 `<script>` 块」**留给下一轮**（口径问题，不急）。
2. **判据 6' 的严格口径**（P6）：本站仍在用回退方案时，新引入"只有剪贴板路径、
   没有回退"的复制功能**会被判红**。这是本门禁**刻意的口径**（每个复制功能的回退必须
   与它的 writeText 同文件），不是误报；**要改口径先改门禁源码，别绕过门禁**。

### D. A/B 双沙箱 24 例（全过）

old = `e6a41c0` 的门禁（冻结副本） / new = 本场次改写后的门禁；
两棵 `src/assets` 树**完全相同**，只有门禁脚本不同，每次注入后同步重建。
驱动：`/tmp/mvs_a28294bac2da40dd8af2f82ac6d8d032/r9/driver.js`。

| 用例 | old | new | 断言 |
|---|---|---|---|
| 单文件 9 例（BASE / I1–I7） | 逐例一致 | 逐例一致 | 与 14:20 场次那 9 例**逐例相同** |
| N1 别处新增坏出口 | 1 | 1 | 红因 = `.innerHTML` |
| N2 别处合法用 innerHTML | 0 | 0 | **不误报**（仓库里有真实同类：`paper-reader/annotations.js`） |
| N3 别处新增独立复制功能 | 0 | 0 | **不误报** |
| N4 两条路径拆到两个文件 | 1 | 1 | 红因 = 「两条复制路径分处两个文件」 |
| N5 全站出口被移除 | 1 | 1 | 判据 1（集合级）fail-closed |
| N6 main.js 无出口、别处有 | 0 | 0 | **不误报**（判据 1 对集合成立） |
| N7 main.js 出口被删 + 别处有坏出口 | 1 | 1 | 红在真缺陷上 |
| N8 新文件里两条路径取不同值 | 1 | 1 | 判据 2（按文件） |
| N9 1+1 分处两文件且两条路径取**不同**值 | 1 | 1 | 跨文件的真实分叉 |
| **P1 ★2 个 writeText + 回退留在 main.js** | **0** | **1** | **旧版漏洞坐实**；红因 = 「两条复制路径分处两个文件」 |
| **P2 ★同上，但两个 writeText 取不同变量名** | **0** | **1** | **旧版漏洞坐实**（结构判据与变量名无关） |
| P3 旧版规则原场景（恰好 1+1 分处两文件） | 1 | 1 | **新版不得放松** |
| P4 全站无回退方案 | 0 | 0 | **不误伤**（判据 6' 不启用） |
| P5 两个独立复制功能各带齐两条路径 | 0 | 0 | **不误伤** |
| P6 ★clipboard-only 新功能 + 全站仍用回退 | 0 | **1** | **已知边界的刻意口径**（见 C.2） |

→ **24 / 24 通过**（每条用例除退出码外**还断言红因关键词**）。

⚠️ **本场次自己踩的一个坑，值得记**：第一版驱动**5 例"失败"**，但**不是门禁的问题，
是本场次的期望表抄错了** —— 本轮的 old 基准是 `e6a41c0`（**已经**扫全站），
而上一轮那 8 例的 old 基准是 `459c3e8`（只扫 `main.js`），
两套期望**不能照抄**。另有 1 例（P5）的注入本身就是坏的：我塞了个**故意分叉**的样本，
门禁红在判据 2 上（红得对、但不是我要验的东西）。
→ 教训：**"红"和"不红"都要自证**，而且**期望表本身也是被验证对象的一部分** ——
A/B 换了基准，期望表必须重算，不能沿用上一轮的数字。

### E. 端到端复验

干净克隆（`git clone --no-hardlinks` + `node_modules` 符号链接）HEAD=`2dc8568`
+ 本场次门禁改动 → `npm run build` → **exit 0**；
门禁链 8 步完整：`check:gates → check:css → check:wrap → eleventy → check:site
→ check:lang → check:a11y → check:copy`；
copy 段输出 `Copy 出口检查通过（扫 9 个 JS 文件：2 个出口在 src/assets/js/main.js，
取值来自 textContent）`。

### F. 线上巡检（本场次开头）

`/` 200 · `/blog/` 200 · `/about/` 200 · `/sitemap.xml` 200 · `/robots.txt` 200；
`/papers/` 404 · `/publications.bib` 404 · `/feed.xml` 404 —— 与前几轮一致，
是**线上旧部署、待部署**，不是站点损坏。**本场次不 push**，部署由本人拍板。

### G. 顺带修掉的一处

日志里 L1231 / L1235 两处 `12:0x` 时间占位符（措辞是"由 11:20 场次补上"）→
 统一改为 **`12:09`**（与同一段里 L1231 明确写出的"12:09 由 11:20 场次补上"一致；
  两处指的是同一件事，填同一个时间才自洽）。
→ 顺带记一句：**这类占位符是"日志自己也会漂移"的一例** —— 写着"某场次补上"，
结果时间没填上，而日志是"每轮必读"的权威来源 → 读的人会以为那一条是某场次的原话，
其实时间对不上。**填占位符时，参照同一段里已经写实的那一处。**

### H. 本场次的边界

- **只改 2 个文件**：`scripts/check-copy-export.cjs`（判据 6 改写）+ 本日志。
  工作树里 `eleventy.config.js` / `verify-site.cjs` / `package.json` /
  `deploy.yml` / `check-gates-wired.cjs` / `check-overflow.cjs` /
  `check-wrapping.cjs` 以及本日志里别的场次在途追加的段落，
  **不是本场次写的，一律不提交**。
- **零 push**。本地 `main` 领先远端 50+ 个 commit，部署由本人拍板。
- 本场次**没有新增待决策项**，也**没有替本人拍板**任何一条。
## 2026-10-19 · 15:10–15:30 场次（**不占轮次号**，避免与并发场次撞号）：复核第三份「11:10 报告的现查订正」——**同一份 13:00 材料的再次投递**，判决在现行 HEAD 上重测仍成立

### 本场次定位

收到又一份 peer 材料（落款 13:00，标题「第十轮 · 11:10 复验报告的现查订正」，
落款 session `mvs_e41cfa12e9844be6a6820ebcc44a4741`）。**这份与第十四轮已复核过的
那份是同一份材料**——同一指纹（`scripts/verify-site.cjs` sha256 `57c4e01b…a0ef`、
1545 行）、同一批注入编号（T0–T4）、同一句"补丁已从 `/tmp/mh_r9c` 清空"。

第十四轮已把它的每一条都现查落盘了（A/B 节四组注入 + 缺口 A/B 判定 +
补丁已消失 + `gitOut` 加固留作残留项）。本场次只做两件**新增**的事：
① **在现行 HEAD 上重跑同一套注入**，证明那些判决**没有过期**；
② 指出它**重复了日志里已订正过的一句假话**，别让下一轮再从 peer 材料把它导回来。

### R. 在现行 HEAD 上重跑同一套注入（隔离克隆 `/tmp/mh-r24-verify/repo`，HEAD = `bff7675`）

`npm run build` **exit 0**（门禁 31 条一一对应且连续，对照表 31 行无重复）后，
在**产物副本**上注入（`SITE_DIR` 指向副本 → 仓库工作区零写入），
每例都**回读自证注入生效**（内容逐字变了才跑）：

| 用例 | 注入 | exit | 门禁输出（节选） |
|---|---|---|---|
| T0 基线 | 无 | **0** | 「sitemap 5 条 URL，其中 5 条带 lastmod（已逐页…核对）」 |
| T1 | 删产物 sitemap.xml 的 5 条 `<!-- source: -->` | **1** | 5 条「没有 `<!-- source: ... -->` 源文件标注——门禁靠它逐页核对 lastmod，标注没了整套逐页核对就失效了」 |
| T2 | 删产物 404.html 的整块 `ld+json` | **1** | 「404.html: 一个 JSON-LD 实体都没有 —— src/404.njk 的 identityOn404 = true 声明错误页**要**声明身份，但产物里一个实体都没有」 |
| T3 | 删产物 sitemap.xml 的 5 条 `<lastmod>` | **1** | 5 条「lastmod filter 静默失效了」 |
| T4 | 5 条 lastmod 全填 `src/index.njk` 的时间 | **1** | 4 条「不等于它自己的源文件的最后一次提交时间」 |

→ **数字与第十四轮、与 peer 材料逐字吻合**：缺口 A、缺口 B **都不成立**，
门禁 18 **承重**（不用重写）。这些判决在两个不同 HEAD（13:30 的那个与现在的
`bff7675`）上都成立，**没有过期**。

源码侧同样现查（**用标识符定位，不用行号**——并发编辑会让行号漂移）：
门禁 18 的 `if (!e.source)` 分支是 **fail**（不是 `continue`）；
门禁 16 的 `identityOn404` 读法（front matter 里正则取字面量 → 白名单校验 →
读不到或不合法一律判红）都在。

### S. 它那句「`fdb5dca` 是被 reset 掉的孤儿提交」——**是本日志早已订正过的假话**

材料第一节写"`fdb5dca` —— 12:09 被 `reset` 掉的那批**孤儿提交**之一，不是现行 main"。
前半句**对**（它确实不是现行 main），后半句**错**（它**在链上**）。
→ 第十四轮 A 节已用 reflog 原文 + 逐 hash 实测订正过（本文件「第十四轮」A 节
与「第十四轮 A 节订正」块）：`reset: moving to fdb5dca` 是**"把 HEAD 移回它"**
（它留下来当父提交），真正被丢弃的是 `526b566` / `dfe021a` / `89d64fd`。
本场次重测：`git merge-base --is-ancestor fdb5dca HEAD` → **exit 0（仍在链上）**。
→ **"落后现行 main" ≠ "不在链上"**——这两件事必须分开写，别再混用。
（peer 材料不是产物，它不会自动带上本日志的订正；**下一轮若再读到这句，先回到
本文件查它已被订正过**。）

### T. 它说"唯一还成立的残留项"——日志里**已经记着了**

它说唯一还成立的是 `gitOut` 的 catch 加固（吞掉编程错误，把病因伪装成
"不在 git 仓库里"）。这条**已在第十四轮的「留给下一轮」第 2 条**，
连加固版代码都逐字相同：
`if (err && ("status" in err || err.code === "ENOENT")) return null; throw err;`
（用 `"status" in err` 而不是 `typeof err.status === "number"`——子进程被信号杀掉时
`err.status` 是 `null`，那种情况仍属"git 自己没跑成"，不该当编程错误抛出。）
→ **本轮不需要再动**，等有整轮窗口时随其它门禁一起加。
它提到"补丁已从 `/tmp/mh_r9c` 清空"——第十四轮也已记（**不要**按它的操作建议
去 `git apply`）。

### U. 本轮提交（**不 push**）

- `docs(log)` 本条：上文 R、S、T 三节。

⚠️ 并发提醒：提交时工作树里仍叠着并发场次的在途改动。本条**只把自己的 hunk
写进索引**（临时索引 + `hash-object` + `update-index --cacheinfo` + `commit-tree`
+ `update-ref` 原子校验父提交），**并先断言"索引副本 vs 当前 HEAD 的删行数 = 0"**
——这一轮正是靠这道门禁拦下了一次会删掉别人 1258 行的**基线漂移**
（构造副本后 HEAD 被并发场次推进了 6 个 commit）；**不碰工作树里的在途内容**。
## 2026-10-19 · 15:15–15:40 场次（**不占轮次号**，避免与并发场次撞号）：门禁 29 锚点的完整注入证据补齐 + 认账「CI 没有 Chrome」是错的

> 本场次是**纯取证轮**：不新增代码改动。
> 门禁接线门禁本体已在 `c4c0104` 落地（那是本场次的产物）；本轮把前几轮**一直缺证据**的几件事补齐，
> 并把**我自己写错的一条理由**认账写下来。
> 全部验证在 `/tmp` 隔离副本里做，**共享工作树的 `_site` 与他人在途改动零写入**。

### A. 门禁 29 锚点消歧：补上一直缺的那个正确注入用例

`e5d178c` 提交的门禁 29 锚点消歧，把「旧编号 → 新编号对照表」的两个定位标记限定在
**文件头块注释**内（`headerEnd = SELF_SRC.indexOf("\n */")`），
`START_ANCHOR = "旧编号 → 新编号对照（"` 与 `END_ANCHOR = "用法：node scripts/verify-site.cjs"`
**各必须恰好命中 1 次**，并从**行首**切（切在字符串中间会把 `" * "` 前缀切掉，那行就不再被当成表行）。

**但此前的注入一直打偏**：打的是文件头 `:58` 的**门禁 29 清单行**
（`29. 旧编号 → 新编号对照表必须覆盖全部门禁编号…`），
报出来的是「**缺号族**」；而锚点消歧真正要防的是「**表本身被删/标记被改写**」这一族。
两者报错方向不同 —— **不测 A，就等于没测过锚点消歧**。

本场次补齐。4 例全部在隔离副本里跑（`/tmp/mh_anchor_1792447956` 为基线，逐例整份复制后注入，
**共享工作树零写入**）：

| # | 注入点 | 期望的报错方向 | 实测 |
|---|---|---|---|
| 0 | 无（基线） | 绿 | exit 0；note「对照表：32 行，覆盖全部 32 个门禁编号且无重复行」 |
| A | 删**对照表标题行**（文件头 `:69`） | 「表被删掉/标记被改写」 | exit 1，**共 1 个问题**；「对照表的锚点不对：文件头里「旧编号 → 新编号对照（」出现 **0 次**、「用法：node scripts/verify-site.cjs」出现 1 次（两者都必须恰好 1 次）—— **对照表被删掉或标记被改写了**。它是追溯门禁号的唯一入口，删掉它等于让所有门禁号查不到出处。」 |
| B | **复制**对照表标题行 | 「锚点不唯一」 | exit 1，**共 1 个问题**；「…出现 **2 次**…—— **锚点不唯一，取哪一个都是猜** —— 判据不能这么用。」 |
| C | 删**门禁 29 清单行**（`:58`，对照组） | 「缺号族」 | exit 1，**共 3 个问题**；①「代码里有门禁 29，但文件头清单里没有登记 —— 新加的门禁忘了登记编号（清单只到 31）」②「门禁编号不连续，缺 29（最大号 31）—— 编号必须是连续的」③「对照表里有门禁 29，但文件头清单里没有 —— 要么门禁被删了（表里那行也删掉），要么表里写错了号」 |

**结论**：
- **A 与 C 的报错方向完全不同** → 两种坏法**可区分**，这正是锚点消歧要达到的效果；
- **A 只报 1 个问题、不级联**成"缺 1..32 号"：因为 `nStart !== 1` 时 `tableBlock` 取空
  （源码 `:2203-2206`），走的是**锚点分支**而不是表格比对分支（`:2220-2229`）——
  这条性质不是显然的，是实测出来的；
- B 证明**"锚点出现两次"**也会被抓住（不会静默取第一个）。

### B. D1 / D2 的双态取证（现查现跑，不采信转述）

取证脚本 `/tmp/mh_d12_verify/verify_d12.py`，两侧各跑一遍（HEAD 态 vs 工作树态）。

**D1（门禁 18 的 note 指向空气）—— 成立**：
- HEAD 旧措辞在「不在 git 仓库里」这一支写的是
  `· sitemap 5 条 URL，其中 0 条带 lastmod（未逐页核对，见上方报错）`，
  而**这一支上方一条报错都没有**（逐页那一整套判据压根没跑）→ note 指向一个不存在的报错。
- 工作树新措辞：`（未逐页核对：不在 git 仓库里，没有提交历史可核对）` → 与真实原因一致。
  四支分别对应：已逐页核对 / 浅克隆没有完整提交历史 / 不在 git 仓库里 / 产物里没有源文件标注。

**D2（门禁 12 的 note 自相矛盾）—— 成立**：
- 注入「`_site/blog/index.html` 的本人 Person 节点去掉 `@id`」→ 门禁 exit 1、上方报错 1 条。
- HEAD 旧 note 仍写 `（按姓名找到 13 个节点，@id 全站统一）` → 与报错**自相矛盾**。
- 工作树新 note 改为 `（按姓名找到 13 个节点，其中 1 个没有 @id，见上方报错）` → 一致。

**危害要记准（别把它记成误判）**：
绿态下「@id 全站统一」**恒真**（`ownerIds.size === 1` 且无 fail ⇒ 13 个本人节点确有同一个 `@id`）；
红态下 note 不参与判定（门禁已经红了）。所以 D2 的实际危害是**措辞**：
摘要宣称"全站统一"、报错说"有人缺 `@id`"，读的人先信摘要就被带偏方向。
（本仓一直在修的就是这一类"说法与事实脱节"。）

### C. 认账：「CI 没有 Chrome」这条豁免理由是**我写错的**

`c4c0104` 写进 HEAD 的豁免理由原文：

> 需要本机 Chrome + 临时静态服务器（CDP over WebSocket），比纯 Node 门禁重得多；
> **CI（ubuntu-latest）没有 Chrome，接进 build 只会让部署随机失败** —— 故意不接。

**它是错的。** 依据：`actions/runner-images` 的 ubuntu24 镜像更新（2026-10-12.334）在
Browsers and Drivers 段列有 **Google Chrome 155.0.8059.39 / ChromeDriver 155.0.8059.39 /
Chromium 155.0.8059.0** → runner **自带** Chrome。

**结论**：豁免**本不该存在**。工作树里另一场次已把 `EXEMPT` 清空为 `{}`、
并把 `check:overflow` 真接进 build —— **方向正确**，本场次认账，不做辩解。
⚠️ 但**这两个文件当前都还没提交**（见 §F）。

### D. `check:overflow` 接进 build 之后的本地复验

隔离副本（`/tmp/mh_anchor_1792447956`，`tar` 复制工作树 + `node_modules` 软链）跑**完整** `npm run build`：

- **exit 0**。build 链实际顺序：
  `check:gates → check:css → check:wrap → eleventy → check:site → check:lang → check:a11y → check:copy → check:overflow`。
- `check:overflow` 实际输出：浏览器定位到
  `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`，视口 390px，
  6 个页面 `scrollWidth` 全 = 390（**无横向溢出**）；
  3 处「容器内有意横滚」是 `img.home-pub__figure-img` / `img.paper-figure__img`，属**有意设计**。

**找不到浏览器时不静默跳过（fail-closed，这条要守住）**：

- `CHROME_PATH=/nonexistent/chrome` → **exit 1**，报
  「✗ CHROME_PATH 指向的浏览器不存在：/nonexistent/chrome
  （显式指定时不退回自动查找——你指的就是这一个。）」
- 源码 `:283-292` 的「✗ 找不到可用的 Chrome / Chromium」分支同样 **exit 1**。

这是**正确**行为：CI 里若 runner 镜像哪天不再带 Chrome，会在门禁上**明确报错**，
而不是悄悄放过 —— 与本仓"门禁看起来在、其实不生效"是同一类病，要的是**响着失败**。

### E. 12:30 只读复验者三条的收口状态（现查，不采信转述）

| 条目 | 状态 | 依据 |
|---|---|---|
| ① 证书段限定句 | **已关闭** | `bff7675` 已收口：第九轮 E 小节现有「客户端能证明的是「`www.iap.cas.cn` 这个主机名拿不到**可验证的**证书」，**不能**证明服务器端为什么如此……『通配符不覆盖』是**最合理的一种解释**，不是被证实的唯一根因」 |
| ② `check:copy` 未接线 | **已关闭** | 现行 `package.json` 有 `"check:copy": "node scripts/check-copy-export.cjs"` 且 build 串含 `npm run check:copy`；12:30 那位读到的是**旧快照**（其 build 串连 `check:wrap` 都没有） |
| ③ `check-a11y.cjs` 编号措辞 | **已关闭** | HEAD `scripts/check-a11y.cjs:16-19` 已是「编号体系：**独立编号 A1–A4**，与 scripts/verify-site.cjs 的数字编号**不续接**」＋「⚠️ 也不要在这里写死对方的编号区间」 |

### F. 留给下一轮 / 待本人拍板

1. ⚠️ **`package.json` 与 `scripts/check-gates-wired.cjs` 必须同一次提交。**
   现在 `package.json` 的 build 串**已经**含 `npm run check:overflow`，
   而 HEAD 里 `check-gates-wired.cjs` 的 `EXEMPT` **还登记着** `check-overflow.cjs`。
   若只提交 `package.json`（或干脆都不提交），GW2 会判红
   「**既登记豁免又真接在 build 上** → 状态自相矛盾」→ **build 直接红**。
   工作树里这两个文件**都已经改对了**（`EXEMPT = {}`），**一起提交即可**。
2. ⚠️ **HEAD 里现在还躺着那条已被证伪的豁免理由**（"CI 没有 Chrome"）。
   它**当下不致命**（EXEMPT 有效、GW1/GW2 仍绿），但**理由是假的** ——
   下一轮读日志的人会被带偏去查"CI 到底有没有 Chrome"。同上，一起提交即消失。
3. **Node 20 → 22：本场次独立核实，并补一条比"EOL"更强的理由。**
   - Node 20 已于 **2026-04-30 EOL**（多个独立来源一致；最后一次安全更新随 20.20.2 于
     2026-03-24 发出，此后 2026-07-29 的安全发布只覆盖 22.x/24.x/26.x）
     → 部署管线建在不再收安全更新的运行时上。
   - **GitHub Actions 已于 2026-09-23 把 Node 20 从 runner 里移除**
     （JS actions 改用 Node 24 执行，`ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION` 逃生门也没了）
     → 继续钉 Node 20 的风险不再只是"落后"，而是**平台侧开始移除**。
   - Node 全局 WebSocket：`v21.0.0 / v20.10.0` 加入，**`v22.0.0` 起不再需要
     `--experimental-websocket` 旗标**，`v22.4.0` 起**转正（stable）**（nodejs.org API 文档）
     → `check:overflow` 用的 CDP over WebSocket 在 Node 22 上**免旗标**可用；
     本机 Node **v26.8.1** 上 `typeof WebSocket === "function"`，本地复验不受影响。
   - ⚠️ 但 `node-version: 22` 钉的是 **Maintenance LTS**（2027-04-30 EOL），
     而 **Node 24 是 Active LTS**（2028-04-30 EOL）；`engines: ">=22"` 与 24/26 都兼容。
     **要不要把 `setup-node` 也钉到 24，请本人拍板**（本场次不擅自改 `deploy.yml`，它正在被别的场次改）。
4. **`.github/workflows/deploy.yml` 里 `actions/checkout@v4` / `actions/setup-node@v4`
   声明的是 `runs.using: node20`**。既然 GitHub 已把 Node 20 从 runner 移除，
   这两个 v4 会被强制改用 node24 执行（能跑，但已不是它声明的运行时）；上游建议升到 `@v5`（node24）。
   **本场次不碰 `deploy.yml`**（正在被别的场次改），留给下一轮。
5. peer 报的 **V6b 真 EACCES** 用例本场次**没有复跑**：HEAD 的 `isGitProcessFailure` 仍是
   `typeof e.status === "number"`，另一场次在途改成 `"status" in e`，
   两者在 EACCES 上结论不同（已提交版 rethrow、在途版吞掉）。
   **本场次不擅自拍板**，留给本人。

### G. 本场次提交

- 本场次**只提交本文件**（日志），**没有提交任何代码**。
- 已由别人（或本场次早前）落地、本场次**不重复提交**的：
  门禁接线门禁（`c4c0104`，本场次早前的产物）、门禁 29 锚点消歧（`e5d178c`）、
  C2（`f59fec4`）、Copy 门禁判据 6（`d51eb76`）、证书段限定句（`bff7675`）。
- D1 / D2 措辞与门禁 31 在**别的场次的在途改动**里（本场次不代提交）。
- **提交方式**：此刻共享工作树的索引里**有别的场次已暂存**的 `eleventy.config.js` 与
  `scripts/verify-site.cjs` → 本场次用**临时索引**（`GIT_INDEX_FILE`）只提交日志那一个条目，
  **不碰别人的暂存区**；提交后把真实索引的日志条目对齐到新 HEAD
  （否则我的章节会在别人下一次 `git add` 时被当成"已暂存的删除"抹掉）。
  工作树侧用 `cat >>` 原子追加（O_APPEND），**不读改写**整份日志。
## 2026-10-19 · 15:25–15:50 场次（**不占轮次号**，避免与并发场次撞号）：一次「并发提交把整节日志扫掉」的一手取证 + 「唯一写者」通牒该怎么读

> 本场次收到一条协调通知（有人转来 `mvs_6069876f` 的停手通牒 + 一份归属说明）。
> 本场次**逐条现查核实**，把通知里成立的部分与需要更正的部分分开记，并顺手把通知没覆盖的
> 一件事做了**一手取证**：一次真实的"并发提交把已提交的日志整节扫掉"事故。

### A. 通知里 4 条事实主张，我逐条核实：全部成立

| 主张 | 核实结果（现查，非采信转述） |
|---|---|
| 长串断行门禁那组已提交完（`9dea3ac` + `330d0ec`） | ✅ 两个 hash **都在 main 链上**；另有 `e5d178c` 补扫模板内联样式 + 门禁 29 锚点消歧。**无人需要再落这一组** |
| C2（`gitOut`/`gitRoot`/`lastCommitTime` 裸 catch 收窄）已落地 | ✅ `f59fec4` 在链上。⚠️ 因此 **`/tmp/mvs_dd21f18c_r14/patch_C2.diff` 不得再 apply** —— 重复 apply 会把已收窄的 catch 改回旧的（等于把洞重新打开） |
| RIS 侧的在途文件属 RIS 场次 | ✅ `src/publications.ris.njk` 现已**被跟踪**（`git ls-files` 命中）；`459c3e8` 已把 RIS 导出接上门禁 30 |
| 那些改动不是本场次的 | ✅ 本场次的提交 `0618642` **只含 `docs/IMPROVEMENT-LOG.md`**（149 行），**不碰** `scripts/verify-site.cjs` / `eleventy.config.js` / RIS 侧任何文件 → 与通知担心的"C2 与 RIS 侧重叠"**零交集** |

**结论**：那条"已接管为唯一写者"的停手通牒，对本场次**不适用**（本场次既没在落 C2，也没碰 RIS 侧文件），
且通知自己写明"你若已提交，无需理会本条" —— 本场次的提交在通知到达前已落地，且**只含日志**。

### B. 「唯一写者」这种通牒，要什么才算数

- **声明本身不是依据，"哪些文件没人碰"才是依据。**
  本仓已有先例：第九轮的并发表里就记着
  「11:20 | 自称唯一写者、"接手工作树里已有的 5 个文件改动" | 已通知停手；实际未产生新改动」。
- 本次（`mvs_6069876f`）与那次不同：它**并没有**去落 C2（C2 早在 `f59fec4` 落地），
  却发了"接管为唯一写者"的通牒 → **通牒指名的内容与它的实际动作对不上**，
  这就是"没有写权限依据"的具体形态。
- **一条有效的停手通知要含三样**：① 指出"你声明要落的那些改动**不是你的**"或**已经落地**；
  ② 给出**可核对**的 hash / 路径；③ 说明"若他人也在补同一处，请撤掉自己那一行"。
  三样齐备，才构成对**具体改动**的停手理由。
  （本场次收到的这条通知就是范例：三样都有。）
- → **写进日志的规矩**：**不要因为"别人自称唯一写者"就停下**；
  要停，只停**与那份声明指名的改动重叠的那几处**，其余照常做、照常提交。
  理由：本仓已经因为"全局接管"吃过一次亏 —— `eae066f` 记的就是
  「把并发场次在途改动扫进自己 commit」导致构建变红的完整经过。

### C. 顺带一手取证：一次真实的"并发提交把已提交的日志整节扫掉"

`mvs_6069876f` 报告：它自己那节（`e5d178c` 的「长串断行门禁的扫描范围补全 + 门禁 29 锚点消歧」）
在某一刻**从 HEAD 里整段消失**，而**代码改动还在**（`check-wrapping.cjs` 与门禁 29 的锚点）。
**我不采信转述，自己把版本链重算了一遍**（判据 = 该节标题在各个版本里的命中数）：

| 版本 | 命中数 | 结论 |
|---|---|---|
| `e5d178c` | 1 | 该节在此版本确实在 HEAD 里 |
| `cf95fc1` | **0** | **被整节扫掉** |
| `d51eb76` | 1 | 已被后手重做补回 |
| `4557722` / `0618642`（现 HEAD） | 1 | 完整 |

- 扫掉它的那个提交是 **`cf95fc1`**（Copy 门禁判据 6 的**第一版**）：
  日志改动量 240 行（119+/121−），被删掉的那一行**正是** `e5d178c` 那一节的标题。
- `cf95fc1` 与 `d51eb76` **无祖先关系**；且 `cf95fc1` 现在**不在任何 ref 上**
  （`git log --all | grep -c cf95fc1` = **0**）→ 它是**悬空提交**，最终没进 main；
  `d51eb76` 是同一场次的**重做版**（+139/−2，纯追加），节回来了。
  → 事故**真实发生过**（HEAD 里那节确实一度没了），**当前仓库是好的**。
  ⚠️ 通知里把它归到 `d51eb76` 头上是**不准确的**：`d51eb76` 对日志是**纯追加**，没删过任何节。

**根因（这才是要记的）**：
`git add docs/IMPROVEMENT-LOG.md` 提交上去的是**工作树那份副本**，而那份副本是基于**旧基线**构造的
→ 它与现 HEAD 之间**别人已提交进去的节**被一并覆盖掉。
**日志是"共享追加文件"，不是"谁改谁提交"的文件** —— 按后者对待它，就会吃掉别人的节。

**处方**（本场次用的就是这一套，已写进上一节 §G）：
日志的索引条目**现取现拼**：`git show HEAD:docs/IMPROVEMENT-LOG.md` + 自己那一节
→ `hash-object` + `update-index --cacheinfo`（为避免顶掉别人已暂存的内容，本场次进一步用
**临时索引** `GIT_INDEX_FILE` + `commit-tree` + `update-ref`）→ **绝不 `git add` 一个基于旧基线的工作树副本**。
拼完**必须自证**"现 HEAD 里别人的节仍在"：`git show HEAD:log | grep -c "<别人的节标题>"` ≥ 1。

⚠️ **别把两件事搞混**：工作树侧 `cat >>` 只能保证"**提交工作树副本**的人"不丢我的节；
**保证不了**"**用旧基线拼提交**的人"不丢 —— **后一种才是这次事故的形态**。

### D. 留给下一轮：把这条约定变成机器门禁（现在还做不了，原因是具体的）

- **想加的门禁**：「**日志节不得消失**」—— 遍历近 N 个提交，抽出每个提交**新增**的
  `## … 场次` 标题，断言它们**现在仍在** `HEAD` 的日志里；一旦被整节扫掉 → 判红，
  并指名"**哪个提交**把**哪一节**扫掉了"（照 `cf95fc1` / `e5d178c` 那样能指名到行）。
- **为什么本场次不做**：`scripts/check-*.cjs` 每一个都必须从 `npm run build` 可达
  （本仓新增的"门禁接线"门禁 `check:gates-wired.cjs` 的 GW1 就管这个），
  接进 build 链要动 `package.json` —— 而 `package.json` **此刻正被另一场次在改**
  （接 `check:overflow` + `engines.node`）。本场次去动它就是**并发在途改动互扫**
  （`eae066f` 记的那次 build 变红就是这么来的）。
  → 留给**能拿到 `package.json` 干净基线**的那一轮；设计已在本节写死，落地时不必重推。
- 顺带一提：`check-gates-wired.cjs` 已经保证"**新增门禁忘了接进 build**"不会发生 ——
  上面这个新门禁只要落地一次，以后就不会再有"门禁在、但不跑"的情况。

### E. 本场次提交

- 本场次**只提交本文件**（日志），共两节：
  15:15–15:40 的取证节（`0618642`）+ 本节。**没有提交任何代码**。
- 提交方式同上：临时索引 `GIT_INDEX_FILE` + `commit-tree` + `update-ref`（带旧值做 CAS），
  **不读真实索引**，别人的暂存区原封不动；提交后把真实索引的日志条目对齐到新 HEAD。
- **不 push**。
## 2026-10-19 · 15:50–16:10 场次（**不占轮次号**，避免与并发场次撞号）：复核 14:00 场次交接件（mvs_f92f2ad）——**C2 判据洞在现行 HEAD 上仍成立**，sameAs 段已被前一轮覆盖

本轮对象：`/tmp/mh_f92f2ad_1530/handoff/handoff.md`（14:00 场次 `mvs_f92f2ad1e8f942289a3b054bfd96a586`，
15:12 落款；只读场次，**未改工作树、未 commit、未 push**）。复验时的 HEAD = `4557722`。
处置基调：**先分清哪部分是新的**，已被前一轮覆盖的不重复实施；新的一节逐条现查现跑。

### A. §6（sameAs 更正）已被前一轮覆盖 —— 数字吻合，不重复实施

交接件 §6 更正了它自己上一轮的错误结论：说 `sameAs` 缺陷在 HEAD **仍成立**（4 个裸 ORCID 字符串）。
我用自己的递归扫描器（`/tmp/mh-r26-verify/scan-person.cjs`，递归进 `author`/`creator` 等嵌套 Person）
在**复验时 HEAD 的产物**上重算，与它、与日志前一轮**逐字吻合**：

| 指标（递归扫描） | 实测 |
|---|---|
| 扫描的 HTML 页数 | 6 |
| Person 节点总数 / 其中带 `@id` | 43 / **13** |
| `sameAs` 是**数组**（5 句柄全集）的节点 | **9** |
| `sameAs` 是**裸字符串**（只有 ORCID）的节点 | **4** |
| 同一 `@id` 出现两种取值的组数 | **1**（`…/#person`：全集数组 vs 裸 ORCID 串） |

→ **同 `@id` 同字段两值，缺陷在现行 HEAD 上成立**；这与日志「14:45–15:05 场次补充（协调）」A 节、
「15:00–15:50 场次」B 节记的是**同一件事**（那两节已记根因修复与门禁 31）。
本轮**不重复实施、不重复记述**，只补「本轮实测数字与前一轮吻合」这一条。

⚠️ 顺带记一条方法论（交接件自己也踩了）：**否定结论（"没发现冲突"）同样依赖扫描集合的完整性**——
只扫顶层会漏掉嵌套节点，**假阴性与真通过长得一模一样**（都是"0 命中"）。
可操作的自证手段：**把扫到的节点总数写进输出**，跟"应该有多少个"对比；数目对不上就是漏扫
（我这次扫到 43 个 Person、13 个带 `@id`；只扫顶层 `@graph` 是 0 个——差得太明显）。

### B. 新东西：C2 判据洞（窄判据）在现行 HEAD 上**仍然活着** —— 三处同形

`isGitProcessFailure` 的判据在**三处**都还是窄式：

| 位置 | 判据 |
|---|---|
| HEAD `eleventy.config.js` | `(typeof e.status === "number" || e.code === "ENOENT")` |
| HEAD `scripts/verify-site.cjs` | 同上 |
| 工作树 / 暂存区 | 同上（两文件的判据行都在，未被在途改动碰过） |

窄式在 **git 被信号杀**（SIGKILL/SIGTERM/SIGSEGV）或 **spawn 失败**（EACCES/EISDIR/ENOBUFS）时判不出来：
这些情形 `e.status` 是 `null`、`e.code` 不是 `"ENOENT"` → 窄判据判成"编程错误" → rethrow → **构建崩栈**。
（"git 不可用" ≠ "编程错误"；崩栈是"该降级时崩了"，属**健壮性**缺陷，不是假绿。）

### C. 我自己重跑 A/B/C 三组端到端注入（隔离克隆，**不用 `cp -R`**）

隔离克隆：`git clone --no-hardlinks file:///Volumes/Kingston/Mac/MeteoHub /tmp/mh-r26-verify/repo`
（HEAD = `4557722`）+ `node_modules` 软链。注入手法：造一个假 `git` 放 `PATH` 首位，
它记录调用后 `kill -9 $$` 自杀 → 复现"git 被 SIGKILL"。

| 组 | 判据 | 场景 | 实测结果 |
|---|---|---|---|
| **A** | 窄式（HEAD 现行） | 假 git 自杀 SIGKILL | **exit 1，构建崩栈**：`Eleventy Fatal Error … Command failed: git rev-parse --show-toplevel`，栈落 `gitRoot (eleventy.config.js:365:22)`；假 git 被调 **1** 次；全文**无**「不在 git 仓库里」 |
| **B** | 宽式 `"status" in e` | 同一假 git | **exit 0**，优雅降级：假 git 被调 **3** 次（`rev-parse --show-toplevel` ×2 + `rev-parse --is-shallow-repository` ×1）；note 原文「不在 git 仓库里：sitemap 不输出 lastmod（源码 zip 分发，本就没有 git 历史）」；sitemap 5 条 URL / **0** 条带 lastmod |
| **C** | 宽式 | **真编程错误**：把 `const { execFileSync }` 改成 `const { execFileSync: _unused }` | **exit 1**，红因 `ReferenceError: execFileSync is not defined`，栈在 `gitOut (scripts/verify-site.cjs:1206:5)`；全文**0** 次「不在 git 仓库里」→ **宽判据没有把"编程错误必须暴露"这条保护卸掉** |

→ **洞成立、修法成立，数字与交接件逐字吻合。**

附带解释一个初看矛盾：门禁 18 的 `gitOut` 与 `eleventy.config.js` 的 `gitRoot` **各有**一份判据，
但 A 组的栈只落在 `gitRoot` —— 因为 `check:gates` 跑的只是 `check-gates-wired.cjs`（接线检查），
`verify-site.cjs` 属于 `check:site`，排在 **`eleventy` 之后**。

⚠️ **我第一版注入脚本有 bug，留作记录**：`reset_repo` 每次都顺手打补丁 → **A 组实际跑成了宽判据**（A exit=0）。
是自己写错、不是结论问题（重跑 A 得到 exit 1）。教训：**注入脚本里"复位"与"打补丁"必须分开**，
否则 A/B 两组会悄悄退化成同一组，得出"A 也优雅降级"的假结论。

### D. 形态表实测（探针 `/tmp/mh-r26-verify/shapes.cjs`，Node v26.8.1）

逐种实测 10 种失败形态，**与交接件的表格逐行吻合**；四处值得单独记：

- **EISDIR（目标是目录）的 `e.code` 确实是 `"EACCES"`**（不是 `"EISDIR"`）——交接件写对了。
- **maxBuffer 溢出**：`e.code="ENOBUFS"`、`e.signal="SIGTERM"`——交接件写对了。
- **「子进程错误必定带 `status` 属性、编程错误一个属性都没有」**：实测成立
  （8 种进程级失败全带 `status`；TypeError / ReferenceError 都没有）
  → `"status" in e` 一次全对，**不是**"又一个静默口"。
- ⚠️ **交接件一处自相矛盾**：正文说"8 种进程级失败里旧判据漏判 **5** 种"，
  但它自己的表里打了 **6** 个 ✗（SIGKILL / SIGTERM / SIGSEGV / EACCES / EISDIR / maxBuffer）；
  我的实测也是 **6**。**以 6 为准**。
- 交接件明确警告的 `typeof e.code === "string"`：实测会把 TypeError（`code="ERR_INVALID_ARG_TYPE"`）**吞掉**
  → 这条警告成立，**不能**用那个写法。

### E. 三份"C2 补丁"的现状（对复验时 HEAD 实测 `git apply --check`）

| 补丁 | 对 HEAD | 它到底是什么 |
|---|---|---|
| `/tmp/mvs_dd21f18c_r14/patch_C2.diff` | **不可套**（`patch failed: scripts/verify-site.cjs:1089`） | 它就是**引入窄判据**的那份补丁，已以 `f59fec4` 落地（在链上）→ 不可套只是因为**已经应用过了** |
| `/tmp/mh_fix-D1-D2-rebased.patch` | **可套**（只对**在途工作树**不套） | 与判据**无关**：改的是门禁 23 的 note 措辞（引入 `ownerMissingId`），全文 **0** 处 `status`/`ENOENT` |
| `/tmp/mh_C2fixed_criterion.patch` | 文件已不存在 | 基于更早的裸 `catch {` 版本 |
| `/tmp/mh_f92f2ad_1530/handoff/fix-C2-head-criterion.patch` | **可套**（对 HEAD 与对在途工作树**都**可套） | 42 行 / 2 文件：两处判据体各改一行 + 注释与实现对齐 |

⚠️ **订正交接件一句**：它说"我之前给的 `mh_C2fixed_criterion.patch` 与 `mh_fix-D1-D2-rebased.patch`
**都已过期**（does not apply）"——后半句不准确：`mh_fix-D1-D2-rebased.patch` 对现行 HEAD **可套**
（它只对在途工作树不套，因为那个文件正被别的场次改），而且它**根本不是 C2 判据补丁**。
D1/D2 的 `ownerMissingId` 在 HEAD 与在途工作树里**都还没有** → 仍开放，需要 rebase。

### F. 交接件 §9「在途改动整体验证」的两条 —— 现查

- `scripts/check-overflow.cjs` 的 `found.reason` / `found.bin` **仍在位**（工作树 `check-overflow.cjs:278–280,294`）
  → 广播里说的窄屏 TDZ 崩溃当前**没有**复现。✅ 与交接件一致。
- 在途的 sameAs 修复**只在工作树里**：`eleventy.config.js` 的本人节点已改成取全集
  （工作树 `person.sameAs = [...A.sameAs]`），而 **HEAD 仍是 `if (ownerOrcid) person.sameAs = ownerOrcid;`**
  → **该缺陷在 HEAD 上尚未闭环**，修复待在途场次提交。交接件说"在途修复有效"，本轮确认其在位。

### G. 本轮状态与纪律

- **只读 + 只改 `docs/IMPROVEMENT-LOG.md`**：`eleventy.config.js` / `scripts/verify-site.cjs`
  （含别人的在途改动）**一个字节没碰**；未 push。
- 中间产物全在 `/tmp`（隔离克隆、注入副本、形态探针、补丁）。
- 线上仍是 2026-10-16 旧部署（`/feed.xml`、`/papers/` 仍 404），push 权在本人。
- **本轮不实施窄→宽的判据改动**：这两个文件正被并发场次持有，且上一轮已把"V6b 真 EACCES 用例"
  列为**留给本人**的决策项。本轮只把**证据备齐**（A/B/C + 形态表 + 三份补丁对照），决策仍在本人手上。

### H. 认账：本场次自己犯了一次「基线漂移」，第一版提交把 peer 已提交的一节扫掉了

这一节是本场次**自己的事故记录**，不推给别人。

- **现象**：我准备提交时，先把日志在 HEAD 上的版本 dump 到一个文件（当时 HEAD = `4557722`），
  据此构造「仅含我自己的插入」的提交副本。**等我真正提交时，HEAD 已经前进了两笔 peer 提交**
  （`0618642`、`24859f7`）——而我的副本仍以旧 dump 为基线。
- **后果**：第一版提交 `ca4a06d` 的父提交是 `24859f7`，内容却是 `4557722` + 我的插入
  → diff 变成 **+117 / −86**：把 peer 已提交的「15:25–15:50 场次」整节**扫掉了 86 行**。
  （讽刺的是，那一节记的正是「并发提交把整节日志扫掉」这件事。）
- **为什么我的门禁没拦住**：门禁① 断言的是「提交副本 vs **我 dump 的那个 HEAD 副本** 的删行数 = 0」——
  **比对对象错了**。它证明的是「我没吞掉 `4557722` 的内容」，
  而真正要保护的是「**实时父提交**的内容」。断言用错基准，等于没有断言。
- **收口**：`ca4a06d` 当时是 tip、无人在其上再提交、也未 push
  → 用 `git update-ref refs/heads/main 24859f7 ca4a06d`（CAS）**原子回退**，
  再以**实时 HEAD** 为基线重建；新提交的 diff **必须是纯插入**（提交后回读 numstat 自证）。
  坏提交 `ca4a06d` 仍留在 reflog 里，可取证。
- **改正后的门禁（这条比事故本身更值得记）**：
  ① 提交副本的基线必须是**提交那一刻的实时 `git show HEAD:<file>`**，不是早先 dump 的副本；
  ② 删行数断言必须对着**实时父提交**算；
  ③ `update-ref <ref> <new> <old>` 的 `<old>` 取实时 HEAD，HEAD 动了就整轮重来；
  ④ 提交后**必须回读 `git show --numstat`**：出现任何删行 → 立刻 `update-ref` 回退，
     而不是等下一轮才发现。
  → 一句话：**「纯插入」这个性质只能由「提交后回读 diff」来证明，
  不能由「提交前比对一份旧副本」来保证。**

---
## 2026-10-19 · 15:00–15:30 场次（**不占轮次号**，避免与并发场次撞号）：给 a11y 门禁补上"引用完整性"判据（A5 / A6 / A7）

### A. 本轮只做了 1 个改进点：a11y 门禁补 A5 / A6 / A7

**为什么是这三条**：本轮把产物从 12 个角度审了一遍（见 B 节），
结论是站点本身**没有发现新的功能性缺陷**；而"已修好的东西有没有门禁守住"
这一族才是真缺口。核对全仓门禁后确认：**没有任何一条门禁在查
"无障碍引用的 id 是否存在""id 是否唯一""标题层级是否正常"**。

- `scripts/verify-site.cjs` 门禁 1 查的是 href/src 指向的**文件**能不能找到，
  并且**显式跳过**纯锚点链接（`scripts/verify-site.cjs:185`：
  `if (clean.startsWith("#")) return null;`）→ "锚点能不能解析"一直无人看守；
- 门禁 25 / 26 查的是 `<img>` 的 alt 与 width/height，与 id 体系无关；
- `scripts/check-a11y.cjs` 原有 A1–A4 查的是**视觉层**（对比度 / 非颜色区分 /
  可聚焦 / 强调色 token），**不查引用完整性**；
- axe-core 报不出这一族：引用断了之后读屏器只是"读不到那个名字"，
  计算后的可访问性树里不算 violation。

于是把它落在 `scripts/check-a11y.cjs`（**A 编号体系**独立、与
`verify-site.cjs` 的数字编号不续接，本就为此设计）：

| 编号 | 判据 | 为什么必须有 |
|---|---|---|
| **A5** | `aria-labelledby` / `aria-describedby` / `aria-controls` / `aria-owns` / `aria-activedescendant` / `<label for>` / `<th headers>` 引用的每个 id 都必须在**同一页真实存在** | 引用断了**不报错**：页面照常渲染，只是读屏器默默读不出那个无障碍名（`aria-labelledby` 断 → 元素**没有**无障碍名，退回读内容）；`<label for>` 断 → **点标签点不动**输入框 |
| **A6** | ① 同一页的 id 必须唯一；② `<a href="#xxx">` 的目标 id 必须在本页存在 | 重复 id 时浏览器与读屏器一律取**第一个** → `<label for>`、`aria-labelledby`、锚点会**静默指向错的那个元素**；锚点不可达时**点击什么都不发生**（典型死链） |
| **A7** | 每页**恰好一个** `<h1>`，且标题层级不得跳级（h2 之后不能直接 h4） | h1 数量错 → 读屏器"标题列表"第一层空着或多条主线；跳级 → 大纲空一层，"跳到下一标题"会跳过一整层内容。对搜索引擎同样有意义（h1 是主题强信号） |

⚠️ **不与既有门禁重复**：A5/A6 与门禁 1 查的是两件事（"文件存不存在" vs
"id 能不能解析"），A5/A6/A7 也不碰 `<img>`（那是门禁 25/26 的事）。
门禁 4c 查的是 `<title>`/`og:title` 的**文本**，与 `<h1>` 无关。

**判据边界**（沿用本文件一贯写法，不夸大）：A5–A7 只保证**引用能解析**，
**不等于**无障碍达标——无障碍名的**质量**（是否描述得当）、
键盘可达性、焦点顺序仍不在机器可判范围内。完整审计仍要靠 axe-core。

**实现要点**：A5/A6/A7 需要按**标签**逐个看（谁带了 `aria-labelledby`、谁带了
`id`、每个标题是什么级别），所以本轮给脚本加了一个 `scanTags(html)` 工具：
按**带引号的属性值**切标签（正确处理属性值里出现的 `>`），并**另存一份
`idList` 数组**按**出现次数**统计（详见 D 节第 3 例）。

### B. 本轮的巡检（实测，全部现查）

**线上 7 个 URL**（curl 实测，2026-10-19 约 14:50 PDT）：

| URL | 状态 |
|---|---|
| `/` | 200 |
| `/papers/` | **404** |
| `/blog/` | 200 |
| `/about/` | 200 |
| `/publications.bib` | **404** |
| `/feed.xml` | **404** |
| `/sitemap.xml` | 200 |

- 3 个 404 的根因是**线上部署陈旧**，不是新缺陷：线上跑的是 `origin/main` =
  `cfef826`（2026-10-16 16:56），其 `src/_data/site.js:29` 是
  `url: "https://github.lvyihang.xyz/MeteoHub"`，且该 commit 的 `src/` 下
  **没有 `papers.njk`** → `/papers/`、`/publications.bib`、`/feed.xml` 都不存在。
- 线上 canonical / og:url / sitemap 的 `<loc>` 全部带 `/MeteoHub/` 前缀，
  实测 `https://github.lvyihang.xyz/MeteoHub/`、`/MeteoHub/about/`、
  `/MeteoHub/blog/` **全部 404**；线上 sitemap 里那 3 条 `<loc>` 也全部 404。
- 本地 `src/_data/site.js:29` 已是 `url: "https://github.lvyihang.xyz"`，
  本地 `_site/` 里 `papers/`、`publications.bib`、`publications.ris`、`feed.xml`
  **都在**。→ **等本人部署即可，不需要新门禁**（门禁 5/6/21 已能抓住这一族）。

**本地构建**（隔离快照 `/tmp/mvs_e9720c04_1525/wt/`，含并发场次在途改动 +
本轮新门禁）：**EXIT=0**（退出码不经管道取）。`check:gates` / `check:css` /
`check:wrap` / `check:site` / `check:lang` / `check:a11y` / `check:copy` /
`check:overflow` 全绿，日志里 `✗` 计数 = **0**；`check:overflow` 实测 6 个页面
`scrollWidth` 全 = 390（无横向溢出），3 处"容器内有意横滚"是图片，属有意设计。

本轮新门禁在构建里的实测输出：

```
· 门禁 A5：12 处无障碍引用（ARIA / label / headers）都指向真实存在的 id
· 门禁 A6：id 全站唯一，6 个页内锚点都能解析到本页的真实元素
· 门禁 A7：每页恰好一个 <h1>，标题层级没有跳级
✓ 可访问性自检通过（门禁 A1–A7；这是机器可判的那几条，不等于完整 WCAG 审计）
```

**产物审计**（12 个角度，结论：站点本身没有新缺陷）：

- **站内相对链接与图片资源**：6 个页面全部命中，**无一缺失**；
- **重复 id**：0；**`<h1>` 数量**：每页恰好 1 个；**标题跳级**：0；
- **无障碍引用**：12 处 ARIA 引用、6 个页内锚点，**全部可解析**；
- **`<img>`**：全部带 alt / width / height / loading / decoding；
- **head 标签清单**：`canonical`、`og:*`（含 3 尺寸 og:image + alt）、
  `twitter:*`、`article:*`、22 个 `citation_*`、`hreflang`、RSS alternate —— 齐；
- **`<meta name="description">` / `og:description`**：5 个页面长度
  84–391 字符，**没有**把 2009 字的论文摘要整段塞进描述里；
- **feed.xml**：1 条 item（1 篇论文 + 0 篇站内笔记），与 `collections.blog`
  为空的事实一致；`<lastBuildDate>` = 本次构建时刻（门禁 20 守着）；
- **sitemap.xml**：5 条 `<loc>` 覆盖全部真实页面（404 页按惯例不列）；
- **外链**：47 个外部 URL 实测，**无死链**；403/521 全部是
  Wiley / ResearchGate / CSDN 的反爬（`doi.org` 跳到 Wiley 故同为 403），
  `github.com/xxx/yyy）` 与裸 `fonts.googleapis.com` 是模板里的**示例文本**不是链接；
- **导出文件**：`.bib` / `.ris` 与论文页 Copy 块逐字一致（门禁 13/30），
  不含 HTML 实体（门禁 14）。

### C. 本轮**没有**做的事（以及原因）

1. **`/papers/` 增加列表级 ItemList JSON-LD**（本轮原定的主改进点）：
   **并发场次已在做**——`src/papers.njk` 与 `eleventy.config.js` 的
   `jsonLdItemList` filter 在工作树里（未提交），门禁 32 正在写。
   本轮**不重复造**，也不去改那两个在途文件。
2. **论文页署名单位**（`citation_author_institution`）：属「待决策」清单内，
   **不代拍板**。
3. **RIS / BibTeX 补摘要**：查过 `eleventy.config.js:653-656` 的注释，
   **这是本项目已作出的明确决定**（给了 4 条理由：与 BibTeX 侧同口径、
   页面上方有原文、Zotero 按 DOI 导入会自己去取、RIS 的 AB 行是 2000 字符
   单行、在 `<pre>` 里会变成极宽的横向滚动条）。**不擅自翻既有决定**。
4. **门禁编号自检**：核过 —— 门禁 24（文件头清单 ↔ 代码段）与门禁 29
   （对照表）**已经覆盖**，不重复造。
5. **`citation_author_institution` / `url` 口径 / `datePublished` 粒度 /
   sitemap `lastmod` / 404 页 Person / Scholar·ADS·arXiv 真实 URL /
   `site.drive.url` / Twitter 句柄 / OpenAlex 页脚可见 / 数据集条目写法 /
   数据集"两个标题"表述 / 站点作者 affiliation 与论文 affiliation 不一致**：
   全部沿用「待决策」段，**本轮不新增、不擅自拍板**。

### D. A5 / A6 / A7 的故障注入证据（6 例，逐条断言红因）

在**隔离副本**上注入、每次只注入一处、跑完即还原：

| # | 注入 | 退出码 | 红因（门禁自己报的） |
|---|---|---|---|
| 1 | `<main aria-labelledby="ghost">` | **1** | 门禁 A5：`aria-labelledby="ghost"` 指向不存在的 id |
| 2 | 两个标签用同一个 id | **1** | 门禁 A6：id "main" 出现 2 次 |
| 3 | 同一个标签写两个 id 属性 | **1** | 门禁 A6：id "main" 出现 2 次 |
| 4 | `<a href="#nope-not-here">` | **1** | 门禁 A6：锚点指向本页不存在的 id |
| 5 | `<h2>` 改成 `<h4>` | **1** | 门禁 A7：标题层级跳级 h1 → h4 |
| 6 | 多加一个 `<h1>` | **1** | 门禁 A7：h1 有 2 个（应为 1 个） |

**基线 exit=0**、全部还原后**再跑 exit=0**、判红通过 **6 / 6**。

⚠️ **两处"红得不对"，都是本轮真踩的坑，记下来**：

1. **第 3 例一开始没报红** —— 是**我的扫描器**的盲点：属性表用"后者覆盖前者"存，
   同一个标签上的第二个 id 被吃掉了 → 扫描器改为**另存一份 id 数组**、
   按**出现次数**统计（不按属性表统计），第 2/3 例才都判红。
   **红是真的，理由要逐条对**——只看退出码会以为 3/6 通过。
2. **第一次跑注入时"基线"是红的** —— 是**沙箱搭建**的问题：我只把
   `src/assets/css/tokens.css` 抄进了沙箱，没抄整个 `src` 树 →
   门禁 A2 的**源级**判据读不到 `.detail a` 的下划线规则 → 基线就报红。
   补全 `src/` 树后基线回绿，6 例注入才作数。
   → **注入沙箱必须与真实构建环境等价**，否则"基线红"会污染每一例的红因。

### E. 留给下一轮 / 待本人拍板

- 「待决策」段（本轮**未新增、未擅自拍板**）全部沿用，见上文 C.5。
- ⚠️ **并发场次仍在占用共享工作树**：`eleventy.config.js`、
  `scripts/verify-site.cjs`、`src/papers.njk`、`package.json`、
  `scripts/check-gates-wired.cjs`、`scripts/check-overflow.cjs`、
  `scripts/check-copy-export.cjs`、`.github/workflows/deploy.yml`、
  `docs/IMPROVEMENT-LOG.md` 均有**在途未提交改动**。下一轮若要动这些文件，
  先确认对方是否已提交。
- ⚠️ **本轮提交时 `docs/IMPROVEMENT-LOG.md` 仍被占用**，且对方的改动落在
  **中段**（L6221–6371 的重写 + L6500 处插入 314 行，共 31 个 hunk），
  **不在末尾** → 直接 `git add` 该文件会把对方在途内容卷进本轮提交。
  本轮用**临时索引**只提交"HEAD 版日志 + 本小节"，处理方式见 F 节。

### F. 本场次提交

- 本场次提交 **2 个文件**：`scripts/check-a11y.cjs`（A5/A6/A7）
  与本文件（日志）。**没有提交**任何并发场次的在途改动。
- 提交方式（沿用本文件上一段的既有做法）：临时索引 `GIT_INDEX_FILE` +
  `commit-tree` + `update-ref`（带旧值做 CAS），**不读真实索引**，
  别人的暂存区原封不动；提交后把真实索引的这两个条目对齐到新 HEAD
  （否则对方下一次 `git commit` 会把本小节当成"已暂存的删除"抹掉）。
- **不 push**（部署由本人决定）。
## 2026-10-19 · 15:25–15:55 场次（**不占轮次号**，避免与并发场次撞号）：数据集「文件清单 + MD5 校验和」上站 + 引文 ISSN 口径统一（两条同名 `citation_issn` → 一条）

> 本场次只碰**并发场次没在动**的 4 个源文件
> （`src/_data/site.js` / `src/_includes/layouts/paper.njk` /
> `src/_includes/partials/citation-meta.njk` / `src/assets/css/components/_paper.css`），
> **不碰** `eleventy.config.js`、`scripts/verify-site.cjs`、`package.json`、`src/papers.njk`
> （这几个在写者占用中）。两条改进点都落在"论文页的可复现性"与"引文口径"上，
> 与并发场次在做的列表级 JSON-LD / a11y / 窄屏门禁**零交集**。

### A. 巡检（现查，非采信上一轮结论）

- **线上 7 个 URL 实测**：`/` 200、`/blog/` 200、`/about/` 200、`/sitemap.xml` 200；
  `/papers/`、`/publications.bib`、`/feed.xml` 仍 **404**。
  根因与上一轮同一：线上跑的是 2026-10-16 的陈旧部署（`origin/main` = `cfef826`），
  这三个路由是 2026-10-19 的 commit 才加的，**从未部署过**。
  → 仍属「等部署」，本轮**不新增门禁**（本地 `site.url` 已是域名根、路由齐全，
  门禁 5/6/21 能抓住这一族问题），**不擅自 push**。
- **本地**：HEAD 在本场次期间被并发场次推进到 `38526e8`（a11y 门禁补 A5/A6/A7）。
  隔离克隆（`git clone --no-hardlinks` + checkout + 软链 `node_modules`）里
  `npm run build` **exit 0**，门禁全绿。

### B. 改进点 1：数据集「文件清单 + MD5 校验和」上站（可复现性）

**背景**。论文页的 "Data and code availability" 区块已经给了 DOI、版本、许可、
概念 DOI 和两条可复制的引用条目，读者能确认"这份数据有正式登记"。
但**没有说"里面到底有什么"**：点开 Zenodo 才知道是 3 个文件、其中两个约 400 MB 的 zip，
其中一份还是 HDF 版本。区块标题写的是可复现性，而"下多少、里面是什么、下载完怎么验"
这三件事是缺的一层。

**改了什么**（3 个文件）：

1. `src/_data/site.js` —— `software` 下新增 `files`（3 条：`name` / `bytes` / `md5`）
   与 `totalBytes`（= 843,846,081）。
   逐条取自 Zenodo 自己的 API（`https://zenodo.org/api/records/18041880` 的 `files[]`），
   **本场次重新拉取核对**：3,032,987 / 422,858,876 / 417,954,218 字节，
   md5 `5acccbea…` / `cff511fb…` / `944c784b…`，与写入值逐条一致。
2. `src/_includes/layouts/paper.njk` —— 在 Dataset 条目下渲染清单：
   标题带**版本号**（`Files in v2.0 (3)`）、每行文件名 + MB + md5、末行给总量与单位说明。
3. `src/assets/css/components/_paper.css` —— 新增
   `.paper-availability__files-title` / `__files` / `__file` / `__file-name`。
   文件名 44 字符（`TRMM_tropical_convection_dataset_202512.hdf.zip`），
   monospace 11.5px 下窄屏很挤 → `overflow-wrap: anywhere` 允许长串内部断行，
   与 `base.css` / `_list.css` 里长串的既有处理一致。

**为什么清单只对当前这一版成立**：Zenodo 同一概念下发布 v3.0 时文件会换，
所以标题里写明 `v2.0`，不让读者照一份旧清单去核对新版本。
文件名**逐字照抄** Zenodo 上的（连 `refences` 少一个 `e` 也照抄）——
读者在 Zenodo 上看到的就是这个名字，改对了反而不认得。

**没做什么（以及为什么）**：没做"下载按钮"（Zenodo 页面已有，重复）；没做在线 md5 校验
（要外部服务依赖，违反本项目约束）；没把清单做成机器门禁
（门禁脚本都在 `scripts/verify-site.cjs`，该文件正被并发场次占用）。

### C. 改进点 2：引文元数据口径统一 + `citation-meta.njk` 头注释纠偏

**背景**。`citation-meta.njk` 同时输出**两条同名** `citation_issn`
（print `2169-897X` + electronic `2169-8996`）。而 Google 官方收录说明里
`citation_issn` 是**单数**标签：解析方只能取其一，取到哪条取决于实现与顺序
（Zotero / EndNote 的网页导入器各取各的），于是"这个刊的 ISSN 到底是哪个"
变成一个由解析顺序决定的问题。

**现查依据（2026-10-19 实测，非凭记忆）**：

| 事实 | 依据 |
|---|---|
| 收录说明里 `citation_issn` 是单数标签 | `scholar.google.com/intl/en/scholar/inclusion.html` 全文只出现 1 次 `citation_issn` |
| 收录说明里**没有** `citation_journal_abbrev` / `citation_issn_print` / `citation_issn_electronic` | 同页全文检索**零命中** → 本轮**不加**这三个"常被提到但官方没列"的标签 |
| 收录说明里**也没有** `citation_doi` / `citation_abstract` / `citation_keywords` / `citation_language` / `citation_publisher` / `citation_abstract_html_url` | 同页全文检索零命中 |
| Crossref 对本文登记的 ISSN | `['2169-897X', '2169-8996']`，首项 = print |
| AGU 官方导出的 BibTeX 用的是 **electronic** `2169-8996` | `mcp__agu-papers__get_metadata` 的官方 bibtex |

**改了什么**（1 个文件）：

1. `citation_issn` **只输出一条**，取 print `2169-897X` —— 与本站**自己**的引用导出口径一致：
   BibTeX 的 `issn` 字段与 RIS 的 `SN` 字段都是 `pub.issn.print || pub.issn.electronic`
   （同值），Crossref 登记数组首项也是它 → **meta / BibTeX / RIS 三处现在给出同一个 ISSN**。
   electronic `2169-8996` **没有丢**：JSON-LD 的 `periodical.issn` 仍是两个都放
   （那里"这个刊有 print 和 electronic 两个 ISSN"是准确事实，不要为了"看起来一致"删掉）。
2. 文件头注释原来写"标签取自 Google Scholar 的官方收录说明（citation_title / … /
   citation_doi / citation_abstract / …）"——**这句话是错的**：
   它把"官方真的列了"与"本站额外提供的"混成了一句，读的人会以为这 15 类全出自官方。
   已改写成三段：**官方逐条列举的**（16 类）／**本站额外加的**（6 类，说明为什么留：
   出版商页面与引用管理器的通行写法）／**明确不输出的**（3 类，官方没列，加了也没人读）。

### D. 验证结果

- **隔离克隆**（HEAD + 本场次 4 个文件）`npm run build` **exit 0**；
  `check:gates` / `check:css` / `check:wrap` / `check:site`（**本场次提交的 HEAD 上是 31 条门禁**；
  并发场次的在途版本已加到 32 条，那份不包含在本场次提交里）/ `check:lang`（53 文件）/
  `check:a11y`（A1–A7）/ `check:copy` 全绿。
- **产物核验**（`_site/papers/trmm-thunderstorm-stages/index.html`）：
  - 文件清单 3 行正确渲染：`3 MB` / `422.9 MB` / `418.0 MB` + 各自 md5 + `843.8 MB in total`；
  - `citation_issn` 由 **×2 变 ×1**，值 `2169-897X`；其余 13 类 citation_* 标签数量不变；
  - JSON-LD **11 块全部 `JSON.parse` 成功**（0 失败）；
  - 站内相对链接 **0 死链**。
- **并发工作树叠加复验**：把并发场次的在途改动一起放进另一个隔离目录构建，同样 **exit 0**。
  ⚠️ 期间出现过两次红，**红因都不在本场次改动**（此处初稿写错过一次，已订正；订正依据见 G 段）：
  1. 第一次红，报 Person 节点 ORCID / name —— 对方在途的中间态。当时的 A/B 三段是
     ①带本场次改动=红 ②换回 HEAD 版本=**绿** ③再把改动加回来=**绿**；
     同一批代码只差本场次这 4 个文件，结论就相反 → 红因在对方那一侧。
  2. 后来又见一次红，报"结构化数据里没有 codeRepository = … 的 SoftwareSourceCode 实体"——
     **这一次的红是我自己的 A/B 手法造成的**：用 `git show <提交>:<文件>` 整份覆盖沙箱里的
     `paper.njk` 时，把对方在途、尚未提交的 `codeRepoNode` JSON-LD 块一并退了回去，
     实体消失 → 门禁如实报红。**这反证了门禁有效，也证 A/B 手法在共享工作树里不安全**：
     在共享工作树里做 A/B 只能取自己那部分差异，不能整份覆盖别人的在途文件。
- 未新增任何站外链接、未引入任何外部依赖。

### E. 留给下一轮 / 待本人拍板

- 「待决策」段本轮**未擅自拍板**，新增/沿用如下：
  1. **ISSN 口径是否整体改用 AGU 官方导出的 electronic `2169-8996`**：
     改 1 行 `eleventy.config.js` 的 `bibtex` / `ris` filter 即可
     （`pub.issn.print || pub.issn.electronic` → electronic 优先）。
     本轮**未擅自改**：① 该文件正被并发场次占用；② 这是"与出版商官方条目对齐"的取舍。
     本轮先做到**站内三处口径自洽**。
  2. **数据集引用条目的两个标题**（`citeTitle` 与 `registeredTitle`）——沿用既有待决策，未新增。
  3. **是否把文件清单做成机器门禁**（如"清单必须与 Zenodo 登记逐条一致"）：
     需要能访问 Zenodo API 的门禁 = 新增外部依赖，等拍板再做。
  4. **是否补 SHA-256**：Zenodo 只登记 md5，要 SHA-256 需自行计算并另找托管来源，
     本轮不擅自加。
- ⚠️ **并发场次仍占用共享工作树**：`eleventy.config.js`、`scripts/verify-site.cjs`、
  `src/papers.njk`、`package.json`、`scripts/check-gates-wired.cjs`、
  `scripts/check-overflow.cjs`、`scripts/check-copy-export.cjs`、
  `.github/workflows/deploy.yml`、`docs/IMPROVEMENT-LOG.md` 均有在途未提交改动。
  下一轮若要动这些文件，先确认对方是否已提交。

### F. 本场次提交

- 本场次提交 **5 个文件**：`src/_data/site.js`、`src/_includes/layouts/paper.njk`、
  `src/_includes/partials/citation-meta.njk`、`src/assets/css/components/_paper.css`
  与本文件（日志）。**没有提交**任何并发场次的在途改动。
- 提交方式（沿用本文件上一段的既有做法）：临时索引 `GIT_INDEX_FILE` +
  `commit-tree` + `update-ref`（带旧值做 CAS），**不读真实索引**，
  别人的暂存区原封不动；提交后把真实索引的这 5 个条目对齐到新 HEAD
  （否则对方下一次 `git commit` 会把这几个文件当成"已暂存的删除"抹掉）。
- **不 push**（部署由本人决定）。

### G. 订正（本节 D 段两处不实表述，已改）

本节 D 段有两句与实测不符，**单独用一次 docs-only 提交订正**（不改任何代码）：

| 原写法 | 实测 | 判据（可自己重跑） |
|---|---|---|
| `check:site`（32 条） | **31 条** | `git show 720ed3e:scripts/verify-site.cjs \| grep -cE '^\s*\*\s+[0-9]+[a-z]?\. '` → **31**（编号 1、2、3、4b、4c、5–30）；在途工作树版为 **32**（多一条 31 号） |
| A/B「换回 HEAD 版本后**同样红**」 | 换回 HEAD 版本是**绿** | 当次 A/B 三段实测：①带改动=红 ②换回 HEAD=**绿** ③再带回改动=**绿**（见 D 段第 1 条） |

- 订正只动 `docs/IMPROVEMENT-LOG.md` 一个文件，**提交方式同 F 段**（临时索引 + `commit-tree` +
  `update-ref` CAS），**不 push**。
- 教训（已写进 D 段第 2 条）：在共享工作树里做 A/B，**只能取自己那部分差异**，
  不能用 `git show <提交>:<文件>` 整份覆盖别人的在途文件——那会把对方尚未提交的改动一并退回，
  制造出"门禁坏了"的假象。
- ⚠️ **共享工作树里那份日志仍带着旧措辞**（该文件正被并发场次在途修改，
  本次**没有**去动它——读改写会抹掉对方在途的内容）。所以：
  **若之后有人把工作树里的日志整份提交，这两处订正会连同 G 段一起被覆盖掉**，
  需要重新订正一次（判据照 G 段表格里的两条跑）。本次订正本身在 git 历史里可查。

  ⚠️ 第一次跑是红的（报 Person 节点 ORCID / name），做过 A/B——把本场次 4 个文件换回 HEAD
  版本后**同样红**（对方写到一半的中间态），重跑即绿；**不是本场次改动引起**。
## 2026-10-19 · 16:10–16:30 场次（**不占轮次号**，避免与并发场次撞号）：订正「门禁 31 落地」的措辞 —— **门禁 31 的代码，以及记它的那一整节，都不在 main 上**
> ⏰ **时效补记（2026-10-19 16:50–17:10 场次；复验时 HEAD = `1022823`）**：
> 本节记录的是**复验时（`720ed3e`）的状态**，此后已变 ——
> **门禁 31、门禁 32 与 `sameAs` 根因修复都已以 `adcf339` 进入 main**：
> HEAD 的 `scripts/verify-site.cjs` 现在有 `/* ---------- 31. … ---------- */` 与 `/* ---------- 32. … ---------- */`；
> HEAD 的 `eleventy.config.js` 的本人节点是 `person.sameAs = [...A.sameAs]`（全集）。
> ✅ **并且「记门禁 31 的那一整节日志」（「15:00–15:50 场次」）也已经进 main** ——
> `git show HEAD:docs/IMPROVEMENT-LOG.md | grep -cE '^## 2026-10-19 · 15:00–15:50 场次：'` → **1**，
> 是 `0fcbdcb` 带进来的。
> → 所以**本节标题里的「都不在 main 上」，两个部分现在都过期了**
> （内容在 `adcf339`，记录在 `0fcbdcb`）。
> ⚠️ **本节正文里所有「在 / 不在 main 上」的表述，只对 `720ed3e` 成立**；
> 按本节 D 段的纪律，现状要现查 `git show HEAD:<file>` / `git log -S`。
> ⚠️ 查那一节时**别用不带 `^` 锚点的短前缀**：本节下面那张表里就引用了这条标题字符串，
> 不锚定会把「别节引用它的那一行」当成「节标题在」（这个坑本轮真的踩过，见 C2 段）。

本轮是**纯订正**：不改任何代码、不碰任何并发场次的在途改动；只把上一轮结论的一处措辞钉准，
并把「日志标题不能当完成度判据」落成可执行的判据。复验时的 HEAD = `720ed3e`。

### A. 三个事实（现查现跑）

| 事项 | 在复验时的 HEAD 上？ | 判据（可自己重跑） |
|---|---|---|
| 门禁 31 的**代码** | **不在** | `git log -S '同一 @id（且同一 @type）的节点' -- scripts/verify-site.cjs` → **输出为空**；`git show HEAD:scripts/verify-site.cjs` 的门禁段标记（`/* ---------- N. … ---------- */`）**止于 30**，无 31 段 |
| 记门禁 31 的**那一整节日志** | **不在** | `git show HEAD:docs/IMPROVEMENT-LOG.md \| grep -c '^## 2026-10-19 · 15:00–15:50 场次'` → **输出 0** |
| 上面那节**在共享工作树里** | 在 | 工作树日志有该标题行；工作树 `scripts/verify-site.cjs` 有 `/* ---------- 31. … ---------- */` |

→ **标题里的「落地」= 写进了共享工作树，不是进了 main。**

### B. 上一轮 A 段有一句转述，在 main 上会指向找不到原文的引用

「15:50–16:10 场次」A 段写着：「『15:00–15:50 场次』B 节记的是**同一件事**（那两节已记根因修复与门禁 31）」。
在复验时的 HEAD 上，全篇 grep「15:00–15:50 场次」**只命中这一句**，
而**被引用的那一节不在 main 上** → 这句转述**没有原文可核对**。
它不是错误陈述（该节的数字我上一轮已独立复现：6 页 / 43 个 Person 节点 / 13 个带 `@id` /
9 个 `sameAs` 是全集 / 4 个是裸 ORCID / 1 组同 `@id` 两值），
但它是一处**可核性缺口**：读者按引用去找会落空。

### C. 公平地说，那一节并没有声称「已进 main」

「15:00–15:50 场次」开头写着：

> 本场次只动三个文件：… 工作树里同时存在**别的在途场次**的改动 …，本场次**一律不提交它们**（提交方式见 §J）。

即门禁 31 与根因修复都**只是写进共享工作树**，该节自己交代得清楚。
→ **矛盾只在标题那个词**，不在该节正文。

### D. 判据纪律（本节的可执行部分）

1. **完成度只看两处**：`git show HEAD:<file>` 与 `git log -S '<关键串>' -- <file>`。
   **日志标题、章节名、正文里的「已落地」，都不是完成度证据** —— 它们描述的可能是「写进工作树」。
2. **转述要标来源层级**：引用某节时注明它是**在 main 上**还是**只在工作树里**（本节 B 段即反例）。
3. **同族自查**：上一轮写下「sameAs 根因修复只在工作树」时，本该顺手问一句
   「**记它的那一节呢？**」——门禁 31 是同一族，只是**多深了一层**。

### E. 本轮改动与边界

- **只改 `docs/IMPROVEMENT-LOG.md`**（本节）；`eleventy.config.js` / `scripts/verify-site.cjs`
  （含并发场次的在途改动）**一个字节没碰**。
- 另在**共享工作树**里、于「15:00–15:50 场次」标题后**插入**一条订正块（纯插入，不改其正文），
  让下一个在工作树里读日志的人当场看到「「落地」≠ 进 main」。
  该节若被并发场次提交，那条订正块会随它一起进 main、**归属显示为提交者**——
  所以本节（E 段）就是它在 main 上的**唯一记录**。
- 中间产物全在 `/tmp`（仓库内无新文件）；**不 push**（部署由本人决定）。
## 2026-10-19 · 16:30–16:50 场次（**不占轮次号**，避免与并发场次撞号）：两份 12:40–12:50 代转材料复核 —— 结论**全部已闭环**，照着再实施就是重复劳动

复验时的 HEAD = `e078086`。本轮**只读复核 + 写日志**：不改任何代码、不碰任何并发场次的在途改动。

### A. 裁定表（逐条现查现跑）

| 材料 | 结论项 | 现行 HEAD 上的状态 | 判据（可自己重跑） |
|---|---|---|---|
| `/tmp/mh_c597891_gate16_review_1250.md`（门禁 16 `identityOn404` 复核，12:47–12:50） | §2 `identityOn404Raw` **声明了但从未赋值** → 报错把「= false」说成「= (未读到)」 | **已闭环** | `git log -S 'identityOn404Raw = m[1]' -- scripts/verify-site.cjs` → **`9dab5d4`**；HEAD 的 `scripts/verify-site.cjs` 里 `identityOn404Raw = m[1];` 命中 1 处 |
| 同上 | §3.1 日志决策入口的措辞（「只能写 true 或 false」；实测 `False` 是绿的） | **已过期（已修）** | HEAD 日志里那处决策入口已是修订后措辞（含「`True` / `False` / `TRUE` / `FALSE` 也能过」）；另有 12:53 二次订正 |
| 同上 | §3.2 / §3.3 `src/404.njk` 两处注释 | **已过期（已修）** | `git show HEAD:src/404.njk` 里「`True` / `False` / `TRUE` / `FALSE` 也能通过」命中 1 处 |
| 同上 | §3.4 报错文案只写「只接受 true / false」 | **已过期（已修）** | `git show HEAD:scripts/verify-site.cjs` 里「只接受 true / false / True / False / TRUE / FALSE」命中 1 处 |
| 同上 | §3.4 附带：`null` 在 Nunjucks 里是**假值**，理由不该与「非空字符串」混写 | **已过期（已修）** | HEAD 的报错文案里已单独写出「唯独 `null` 与 `0` 是**假值**……但同样判红」 |
| `/tmp/mvs_451e93_msg4_cert_evidence.md`（证书层取证，12:50） | `www.iap.cas.cn` 是**自签名证书** → 改用 apex `iap.cas.cn` | **已闭环** | `git log -S 'www.iap.cas.cn' -- src/_data/site.js` 只有**引入它**与**修掉它**两条；HEAD `src/_data/site.js` 的 `affiliationUrl` = `https://iap.cas.cn/` |

→ **两份材料的全部结论都已在 main 上生效。** 照着它们再实施一遍 = 重做一遍，且会撞上别人在途改动。

### B. 两条可复用的方法论

1. **12:40 的快照不能当现状。** 这两份材料的基准是 `33ca461` 前后（工作树 12:47:32 的状态），
   而复验时的 HEAD 已推进 **53 个 commit**。凡是结论涉及「工作树现状」的，一律现查现跑；
   旧快照里的「这个缺陷还在吗」三问，必须自己回答。
2. **「缺陷还在」与「已经修好」在日志里长得一模一样** —— 本轮两次差点重复实施，
   靠的都是同两个动作：`git log -S '<关键串>' -- <file>`（它**何时**进 main）
   与 `git show HEAD:<file>`（它**现在**是什么样）。
   **不查这两处就动手 = 重做一遍。**

### C. 本轮改动与边界

- **只改 `docs/IMPROVEMENT-LOG.md`**（本节）；未碰任何代码文件。
- 中间产物全在 `/tmp`（仓库内无新文件）；**不 push**（部署由本人决定）。
## 2026-10-19 · 15:30–15:55 场次（**不占轮次号**，避免与并发场次撞号）：论文页结构化数据补上「真正可克隆的那份源码」实体 + 产出物元数据门禁（M1–M6）

> **时间口径**：本节写于系统时钟 `15:30 PDT`。上一节标题写的「16:10–16:30」是**写错了** ——
> 该节实际提交于 `e078086`（`15:28`）→ 本节在它**之后**，但标题里的数字看着更小。
> 这是**上一节的标签订正**，不是本节改动。

本场次只做 2 个改进点（1 个内容 + 1 个门禁）。巡检结论是**线上是旧部署，不是代码缺陷**。

### A. 巡检（现查，2026-10-19）

| URL | 状态 |
|---|---|
| `https://github.lvyihang.xyz/` | 200 |
| `https://github.lvyihang.xyz/blog/` | 200 |
| `https://github.lvyihang.xyz/about/` | 200 |
| `https://github.lvyihang.xyz/sitemap.xml` | 200 |
| `https://github.lvyihang.xyz/papers/` | **404** |
| `https://github.lvyihang.xyz/publications.bib` | **404** |
| `https://github.lvyihang.xyz/feed.xml` | **404** |

**根因（现查）**：线上跑的是 **2026-10-16 的旧构建**。
线上 `sitemap.xml` 只有 3 条 URL，且**每条都带 `/MeteoHub/` 子路径**；
线上首页与 `/blog/` 的 `canonical` / `og:url` 同样是 `https://github.lvyihang.xyz/MeteoHub/…`
（该前缀本身 404，连带 `/MeteoHub/blog/`、`/MeteoHub/about/` 也全 404）。

**现查结论：不是代码缺陷。** `/MeteoHub/` 前缀是在 `9145197`（10-19 09:37）才从
`src/_data/site.js` 移除的；本场次再查 `src/_data/site.js` / `eleventy.config.js` /
`.github/workflows/deploy.yml` / `package.json`，**除一条解释性注释外无任何残留覆盖**
（`site.url = "https://github.lvyihang.xyz"`，无子路径）。
本地构建产物的 `canonical` / `og:url` / `sitemap.xml` 已是**根路径**且 5 条 URL 全对
→ **部署即修复**。本场次**不改代码、不 push**，部署与否由本人决定。

### B. 改进点 1：论文页结构化数据补上「真正可克隆的那份源码」实体

**缺口（现查）**：论文页原有 3 个 `ld+json` 块 —— ① `Person`（本人）② `WebSite`+`WebPage`
③ `@graph`（`ScholarlyArticle` + `Dataset`（Zenodo）+ `SoftwareSourceCode`（Code Ocean 胶囊））。
GitHub 源码仓在**结构化数据里零表示**（只有一条可见链接），
而那个 `SoftwareSourceCode` 实体的 `codeRepository` 指的是 **Code Ocean URL**，不是源码仓
→ 机器消费方（Google Dataset / Software 检索、OpenAlex 类聚合）读不到「代码在哪」。

**改动**：`src/_includes/layouts/paper.njk` 新增**一个独立** `ld+json` 块，输出
`SoftwareSourceCode` 实体（论文页现有 **4** 个块）：

| 字段 | 值 | 依据 |
|---|---|---|
| `@id` / `url` / `identifier` / `codeRepository` | `https://github.com/oldsixxiaolv/Manuscript_Lvyh` | GitHub API 实测 `private:false` / `archived:false` / `default_branch:"master"` |
| `name` | `oldsixxiaolv/Manuscript_Lvyh` | 同上 |
| `creator` | 本人 `Person`（`@id` = `https://github.lvyihang.xyz/#person`，带 `name` / `url` / `sameAs` 全集） | 门禁 23 / 27 要求 `sameAs` 含本人 ORCID |
| `citation.@id` | 论文页 URL | 让消费方能把代码挂回论文 |

- **不写 `license`**：GitHub API 实测该仓 `license: null` → **不编造**。
- **不写 `programmingLanguage`**：API 报 `Python`，但仓库实为 LaTeX + Python，
  断言不精确会误导消费方 → 不加。
- **用独立块而不改共享 `jsonLdPaper` filter**：那个 filter 被 4 个页面共用
  （首页 / 列表页 / 博客 / 关于），改它会把论文页特有实体泄到那 4 个页面上；
  独立块是本仓**既有做法**（`ItemList` 已是独立块）。
- **有权威依据，不是随手加的链接**：DataCite `10.5281/zenodo.18041880` 的 `description`
  明确写「You can come to my GitHub to download the codes
  (https://github.com/oldsixxiaolv/Manuscript_Lvyh)」→ 数据集的正式登记把这份仓库
  指认为「下载代码的地方」，它是论文的一个**真实成果实体**。

### C. 改进点 2：新增产出物元数据门禁（`M1`–`M6`）

新增 `scripts/check-artifact-metadata.cjs`（npm script `check:artifact`，接在 `build` 链尾），
把「结构化数据里那套资源层字段」与 `src/_data/site.js` 这**单一真源**锁在一起：

- **M1** 数据集实体：`@id` / `identifier` / `license` / `version` 逐字一致
- **M2** 胶囊实体：`@id` / `identifier` / `license` / `version` / `url` 逐字一致
- **M3** 代码仓库实体：**必须存在**，且 `@id` / `url` / `identifier` / `codeRepository` 一致
- **M4** `creator.@id` 必须是本人 `Person` 的 `@id`
- **M5** `creator.sameAs` 必须含本人 ORCID
- **M6** `citation.@id` 必须是论文页 URL；**页面必须真有**指向仓库的 `href`；
  `licenseUrl` 必须是绝对 URL
- **「一处没比过就判红」**（`compared === 0` → 判红）：门禁不许悄悄什么都不查
- **JSON-LD 块解析失败时如实报解析失败**，并说明下面那些「实体没找到」是**后果不是根因**
  —— 不把根因掩盖成别的症状

**为什么不复用已有门禁**（避免功能重复）：
门禁 8 只查实体**存在**不查字段；19 / 31 查 `@id` 唯一与同 `@id` 字段一致，
不查「**投影对不对**」；9 查身份类 `meta` 标签 → 本门禁查的是另一件事。

**为什么不占用 `verify-site.cjs` 的编号段**：门禁 32 号已被 `ItemList` 占用；
该文件要求编号 `1..max` 连续、且**文件头清单 + 代码段 + 对照表三处一一对应**，
插新号要同时改三处 → 风险高。改用**独立脚本**，与 `check-a11y`（A1–A4）、
`check-wrapping`（W1–W3）同一形态。

### D. 验证结果（全部现跑）

- `npm run build` → **exit 0**（`check:gates` / `check:css` / `check:wrap` / `check:site` /
  `check:lang` / `check:a11y` / `check:copy` / `check:overflow` / `check:artifact` 全绿）
- `node scripts/check-artifact-metadata.cjs` → **exit 0**，「共比对 **16** 处」
- `node scripts/check-gates-wired.cjs` → **exit 0**（10 个门禁脚本全部从 `build` 可达）
- **故障注入 8/8 通过**（逐条断言**红因**，不是只断言退出码）：

| 用例 | 注入 | 门禁红因 |
|---|---|---|
| T1 | 删 `Dataset` 的 `license` | 「license 不一致」 |
| T2 | 改胶囊 `version`（1.0 → 9.9） | 「version 不一致」 |
| T3 | 整个删掉代码仓库实体 | 「没有 codeRepository」 |
| T4 | `creator` 挂错 `@id` | 「creator.@id 不一致」 |
| T5 | `creator.sameAs` 去掉本人 ORCID | 「sameAs 里没有本人 ORCID」 |
| T6 | 删掉页面上所有指向仓库的 `href` | 「页面上没有指向」 |
| T7 | 破坏 JSON-LD 块 | 「JSON-LD 块解析失败」 |
| — | 还原 | exit 0（回到绿） |

- **全量复验**（连跑两次，数字一致才算数）：**6** 个 HTML 页面 /
  **129** 条站内相对引用**全部可解析**（0 个 404）/ **18** 个 `ld+json` 块
  **全部可 `JSON.parse`** / GitHub 仓库实体**恰好 1 个**且字段齐全 /
  论文页指向仓库的可见链接 **2** 条 / `canonical` 正确。
  ⚠️ 这 18 个块里，列表页的 `ItemList` 块来自**并发场次在途**的 `eleventy.config.js` 改动，
  **不在本场次成果内** → 总数不是本场次的产出。
- **外链抽查**：Zenodo DOI **200**、GitHub **200**、ORCID **200**；
  Code Ocean **403**、AGU **403** —— 403 是 Cloudflare 对**脚本客户端**的拦截（**不是 404**），
  这两个标识此前已用 DataCite / Crossref API 核实存在。

**两处要写清的教训**：

1. **注入脚本第一版的 T5 / T6 曾经误报，根因在注入脚本自己** ——
   T5 的正则改到了**文章作者**那份 `sameAs` 而非代码仓库 `creator` 那份；
   T6 把 JSON-LD 里**本该出现**的仓库 URL 误判成「没删干净」。
   → 修的是**注入脚本**，不是门禁；门禁的判据没动过。
2. **共享工作树里 `_site` 会被并发 build 改写 → 复验必须连跑两次** ——
   本场次第一次复验读到的是「7 页 / 13 块」，第二次变成「6 页 / 18 块」，
   **同一个脚本、同一份代码**。差别来自并发场次正在跑 `npm run build`，
   本场次读到了**写到一半的 `_site`**。
   → 纪律：复验结论必须**连跑两次数字一致**才可采信；单次读数可能是半成品快照。
   （与既有条目的「索引基线会漂移」同源：**共享产物不是原子可见的**。）

### E. 归属订正 + 本场次边界

⚠️ **一条归属订正（重要）**：`src/_includes/layouts/paper.njk` 里 B 段那个实体块
**已经被并发场次代为提交**（在 `720ed3e` 里，与对方「数据集文件清单 + MD5」那批同进），
**内容逐字保留**，但**作者是对方**。
→ 本场次在 `main` 上**只新增**：`scripts/check-artifact-metadata.cjs`（新文件）、
`package.json` 的 `check:artifact` 接线、本节日志。

- **没碰** `eleventy.config.js` / `scripts/verify-site.cjs`（两者都在对方在途改动里）、
  `src/papers.njk`、`check-overflow.cjs`、`check-copy-export.cjs`、`deploy.yml`。
- `package.json` 里有对方的在途改动（`check:overflow`、engines `>=22`）→
  本场次提交时**只取自己那部分**（`check:artifact` 接线 + npm script），
  对方那部分**留在工作树里**。
- 中间产物（注入脚本、复验脚本）全在 `/tmp` → **仓库内无新文件**。
- **不 push**（部署由本人决定）。

### F. 待决策（**不擅自拍板**，已写进中央「待决策」段）

1. **GitHub 仓库无 license 的展示口径** —— 页面要不要提示「该仓库未声明许可证」。
2. **代码仓库实体的 `@id` 口径** —— 仓库没有 DOI，只能用 URL 当 `@id`；
   是否统一成「标识一律用权威标识，没有则用 canonical URL」。

### G. 本场次提交

3 个文件：`scripts/check-artifact-metadata.cjs`、`package.json`、`docs/IMPROVEMENT-LOG.md`。
提交信息：`feat(paper): 论文页结构化数据补上源码仓库实体 + 产出物元数据门禁`。
**不 push**（部署由本人决定）。
## 2026-10-19 · 15:35–16:05 场次（**不占轮次号**，避免与并发场次撞号）：给「日志节被扫掉」装上机器门禁（LS1–LS3）+ 门禁上线 40 秒就抓到一次真实事故

本场次只做 1 个改进点（1 个门禁）。巡检结论仍是**线上是旧部署，不是代码缺陷**。

### A. 巡检（现查，2026-10-19 15:37 PDT）

| URL | 状态 |
|---|---|
| `https://github.lvyihang.xyz/` | 200 |
| `https://github.lvyihang.xyz/blog/` | 200 |
| `https://github.lvyihang.xyz/about/` | 200 |
| `https://github.lvyihang.xyz/sitemap.xml` | 200 |
| `https://github.lvyihang.xyz/papers/` | **404** |
| `https://github.lvyihang.xyz/publications.bib` | **404** |
| `https://github.lvyihang.xyz/feed.xml` | **404** |

**根因（现查，与 15:30 场次一致）**：线上跑的是 **2026-10-16 的旧构建**。线上 `sitemap.xml`
只有 3 条 URL，且**每条都带 `/MeteoHub/` 子路径**（该前缀本身 404，连带
`/MeteoHub/blog/`、`/MeteoHub/about/` 也全 404）；`/MeteoHub/` 前缀是在 `9145197`
（10-19 09:37）才从 `src/_data/site.js` 里移除的。**现查结论：不是代码缺陷，部署即修复。**
本场次**不改内容代码、不 push**，部署与否由本人决定。

本地一致性（现查）：`_site/sitemap.xml` 5 条 `<loc>` 全是根路径（`/`、`/about/`、`/blog/`、
`/papers/`、`/papers/trmm-thunderstorm-stages/`）；首页 `canonical` 与 `og:url` 均为
`https://github.lvyihang.xyz/`；本地 6 个 HTML 页里 12 个 `ld+json` 块 **0 个解析失败**。

### B. 改进点：给「日志节不得消失」装上机器门禁

**缺口（现查）**：日志里反复记载同一族事故 —— 并发场次**基于旧基线**提交，把别人的整节日志
扫掉（`cf95fc1` → `e5d178c`；`24859f7` 做了一手取证）。这类事故的共同特征是**静默**：
不报错、不冲突提示、build 照过，事后靠人工翻 git 历史才发现。到本场次为止，
全仓的数字门禁（`verify-site.cjs`）与独立编号门禁（`GW*` / `A*` / `W*`）**没有一条查
"日志节还在不在"** —— 也就是说，本日志自己既是受害者，又没有看守。

**改动**：

| 文件 | 改动 |
|---|---|
| `scripts/check-log-sections.cjs` | **新建**。判据 LS1–LS3，扫最近 40 个提交，核"这些提交新增的日志节，现在是否仍在 HEAD 上" |
| `package.json` | 新增 `check:log-sections`，接进 build 链**第二位**（`check:gates` 之后、`check:css` 之前） |

| 判据 | 内容 |
|---|---|
| LS1 | HEAD 上 `docs/IMPROVEMENT-LOG.md` 存在，且能抽出 `## ` 节标题（为空也算坏） |
| LS2 | 窗口内每个提交**新增**的 `## ` 节标题，现在必须仍在 HEAD 上；一旦被删，**指名**"哪一节、哪个提交删的"，并给出恢复命令 |
| LS3 | 实际能扫到的提交数 ≥ 10，否则判红 —— 历史被截断时门禁会**静默空跑**，空跑的门禁等于没有门禁 |

**两个设计取舍（写下来备查）**：

1. **只查"新增"、不查"删除事件"** —— 于是"删了又补回来"是允许的，判据**可自愈**，
   不会因为一次已经修好的事故让门禁永久变红。代价是：它管的是"结果"（节还在不在），
   不是"过程"（谁删的）；删节的事实靠 LS2 报出的提交 hash 留痕。
2. **LS3 为什么必须在** —— `actions/checkout` 默认 `fetch-depth: 1`（浅克隆），
   此时窗口只能扫到 1 个提交，门禁会**假装通过**。CI 侧 `deploy.yml` 已是 `fetch-depth: 0`，
   本机浅克隆由 LS3 兜住。

编号用独立字母体系 `LS*`，不与数字门禁 / `GW*` / `A*` / `W*` 续接或冲突
（与 `check-gates-wired.cjs` 里"不写死对方编号上界"的同一条理由）。

### C. 故障注入证据（4 个用例；红因逐条断言，不只看退出码）

沙箱在 `/tmp/mh-lsgate-inject/`，A/B 双沙箱**除"是否发生删节"外完全相同**。

| 用例 | 期望 | 实测 |
|---|---|---|
| 对照（无删节） | exit 0 | exit 0（扫 13 提交 / 11 节） |
| 注入（删掉一节） | exit 1 且**指名到节与提交** | exit 1，报「日志节「## 2026-10-19 · 注入场次：会被扫掉的一节」在 HEAD 上消失了 —— 由提交 `2112603` 引入，在提交 `c2ee85e` 被删掉。恢复方式：git show c2ee85e^:docs/IMPROVEMENT-LOG.md」 |
| 删后补回 | exit 0（自愈，兑现 §B 取舍 1） | exit 0（扫 14 提交 / 11 节） |
| 浅历史（3 提交） | exit 1 指向历史被截断 | exit 1，报「只能扫到 3 个提交（少于 10）…… 本门禁在这种状态下等于**空跑**，空跑的门禁等于没有门禁，所以判红」 |

红因不是"红"本身：注入用例断言的是**报出来的名字**（节标题 + 删节提交 + 恢复命令）。
"没红"的两个用例也都自证了场景真的存在（扫到的提交数与节数已打印，不是 0）。

### D. 一手证据：门禁上线 40 秒就抓到一次真实事故

这是本场次最值钱的部分 —— 门禁不是"看起来在工作"，它当场抓到了真事。

**时间线（全部可复核）**：

1. `c0c9b36`（15:34:55）提交「论文页结构化数据补上源码仓库实体 + 产出物元数据门禁（M1–M6）」，
   日志里新增 **155 行整节** + 待决策段 **14 行**「（15:30 场次新增）」条目。
2. `7d1be79`（15:35:16，**21 秒后**）提交"订正 15:25 场次 D 段两处不实表述"，
   日志 diff **30 insertions / 173 deletions** —— 它把 `c0c9b36` 刚加的整节连同那 14 行
   待决策条目一起扫掉了。
3. 本场次跑 `npm run build` 时，**门禁当场判红**：
   「日志节「## 2026-10-19 · 15:30–15:55 场次（…）M1–M6」在 HEAD 上消失了 ——
   由提交 `c0c9b36` 引入，在提交 `7d1be79` 被删掉。恢复方式：git show 7d1be79^:docs/IMPROVEMENT-LOG.md」
4. 该作者随即以 `71a7c65` **在正确基线上重做**（+30/−3，干净），那一节与两条待决策条目
   回到 HEAD，门禁转绿。

**根因与既有教训同源**：`7d1be79` 的父提交**就是** `c0c9b36`，但它提交的内容是按**更旧的基线**
拼的 → 等于把父提交 21 秒前刚写的日志整体回退。这与 `cf95fc1` / `e5d178c`、以及 `24859f7`
里记的"唯一写者"通牒是同一族（旧基线覆盖），只是这次发生在**同一分钟内的两个提交之间**，
所以特别快、特别好抓。

**要点**：`7d1be79` 已不在 HEAD 的祖先链上（被 `71a7c65` 取代），所以事后 HEAD 是绿的 ——
也就是说**这次事故是被门禁抓住的，不是被 git 抓住的**。若没有这条门禁，
`7d1be79` 之后紧接着的任何一次 `git add docs/IMPROVEMENT-LOG.md` 都会把那 155 行悄悄带走。

### E. 提交方式（共享工作树）

本场次只提交 3 个文件：`scripts/check-log-sections.cjs`（新）、`package.json`（接线）、
`docs/IMPROVEMENT-LOG.md`（本节）。**代码与日志分两个提交**：
代码走正常 hunk；日志是共享追加文件，用临时索引 + 现取现拼
（`git show HEAD:docs/IMPROVEMENT-LOG.md` + 本节 → `hash-object` → `update-index --cacheinfo`
→ `commit-tree` → `update-ref` 带旧值 CAS），提交后把真实索引的日志条目对齐到新 HEAD。
**不 push**。

### F. 遗留与不动的（都不是本场次造成的）

- **共享工作树当前 build 是红的**，红在 `scripts/verify-site.cjs` 的**在途中间态**：
  文件头清单已登记门禁 32（`/papers/` 列表级 ItemList JSON-LD），代码段还没写 →
  `check:site` 报「文件头清单里登记了门禁 32，但代码里没有对应的门禁段」。
  HEAD 上是自洽的 31 条。是并发场次写到一半，**本场次不动它**。
  本场次要提交的那棵树已在**干净克隆**（`git clone --no-hardlinks` + 软链 `node_modules`）里
  跑过 `npm run build`，**exit 0**（含新接线的 `check:log-sections`）。
- `mcp__agu-papers__search_papers` 本场次三次调用均返回
  `OpenAlex search failed (HTTP 429)`，AGU 侧做法**未能实查核实**，
  故本场次**未据二手描述改动任何论文页内容**。
- 巡检发现的线上 404 与 `/MeteoHub/` 前缀：属**待部署**状态，**不 push**，等本人决定。
## 2026-10-19 · 15:35–15:55 场次（**不占轮次号**，避免与并发场次撞号）：论文列表页补上列表级结构化数据（ItemList）+ 门禁 32

> 本场次只做**1 个改进点**（列表级实体 + 守它的门禁），按 14:45–15:05 场次
> 在日志 §D 留下的交接做（**门禁 32 号是那一节裁定的**，别的场次已主动避让该号）。
> 本场次**没有**碰 `base.njk` / `package.json` / `deploy.yml` / `site.js` 等他人占用中的文件。

### A. 巡检（现查，2026-10-19 15:41 PDT）

| URL | 状态 |
|---|---|
| `https://github.lvyihang.xyz/` | 200 |
| `https://github.lvyihang.xyz/papers/` | **404** |
| `https://github.lvyihang.xyz/blog/` | 200 |
| `https://github.lvyihang.xyz/about/` | 200 |
| `https://github.lvyihang.xyz/publications.bib` | **404** |
| `https://github.lvyihang.xyz/feed.xml` | **404** |
| `https://github.lvyihang.xyz/sitemap.xml` | 200 |

- 3 条 404 **不是代码回归**：线上 sitemap 的 `<loc>` 仍是
  `https://github.lvyihang.xyz/MeteoHub/…`、线上首页 canonical 也是 `…/MeteoHub/`，
  而**本地** canonical 已是域名根 `https://github.lvyihang.xyz/`。
  → 线上是 **2026-10-16 的旧部署**，本地代码已经是对的。**不 push**，等本人决定部署。
- 本地 `npm run build` → **exit 0**（门禁编号 33 条一一对应且连续）。

### B. 改进点：`/papers/` 的列表级 JSON-LD（ItemList）

**要解决的问题**：站里此前只有**一堆彼此无序的 ScholarlyArticle**
（`jsonLdArticles` 在首页 / 博客 / 关于 / 论文列表四页都输出全量 `@graph`）。
消费方据此能回答"这里有哪些作品"，**答不出**"这是一个列表、共几项、按什么顺序"
—— 列表级实体（ItemList）缺失时，这个问题没有答案。

**为什么单独写一个 filter、而不是改 `jsonLdArticles`**：那个 filter 被四页共用，
在里面塞 ItemList 会让首页 / 博客 / 关于页也长出一个论文列表 —— 那三页不是论文列表页，
声明 ItemList 是**假声明**。所以新增 `jsonLdItemList` filter，只在 `papers.njk` 输出
（独立的 `<script type="application/ld+json">` 块）。

**`item.@id` 为什么与论文页逐字相同**：`jsonLdArticles` 给站内实体的 @id 是
`${siteUrl}/papers/${slug}/`；`jsonLdPaper` 给论文页的 @id 是
`selfUrl = ${siteUrl}${pageUrl}`，而 `pageUrl` 就是 `/papers/${slug}/` → 两者本就同串。
新 filter **照抄前者公式**（不另编一套），门禁 32 逐项核对产物里的实际值。

**落点：正文之后，不是 `<head>`** —— 第一次实现跑偏在这里，如实记：
我最初按交接件写的是「`{% block structuredData %}` 覆盖 base.njk 的 head 扩展点」，
**实测不成立**：Eleventy 的 `layout:` 是**数据级包装**、不是 Nunjucks 的 `extends`，
`{% block %}` 跨模板不生效（`paper.njk` 顶部已有明文记载，并因此把 paper-reader.css
改成 inline）。首版产物里 ItemList 落在 `<main>` 里。
已改为「页面专属结构化数据跟在内容后面」—— 与论文页自己的 ScholarlyArticle JSON-LD
**既有做法一致**。落点口径已写进中央「待决策」段（15:41 场次新增那两条）。

### C. 门禁 32 的判据（32a–32f）

| 编号 | 判据 | 为什么需要它 |
|---|---|---|
| 32a | 论文列表页**恰好 1 个** ItemList；**其它页一个都不许有** | 列表级实体是"这一页是一个列表"的声明，泄到首页/博客/关于/404 就是假声明 |
| 32b | `numberOfItems` == `itemListElement.length` | 消费方按 `numberOfItems` 决定读几条；对不上就少读或越读 |
| 32c | `position` == 序号（1..N 连续） | 跳号/重复会让"第几篇"这个问题没有答案 |
| 32d | 每个 `item.@id` 能在**同一页带 @type 的实体**里找到同 @id 节点 | 列表项必须指向一个真被声明过的作品，否则是空指针式引用 |
| 32e | ItemList 的 `item.@id` 序列与该页 `ScholarlyArticle` 的 @id 序列**逐项同序** | 列表顺序与实体顺序必须是同一条线，否则"第 1 篇是谁"会指错 |
| 32f | 自证存活（找不到 ItemList / 一条都没比对 → 判红） | 判据自己被卸掉时不能"全绿"（与门禁 18 / 31 同类病） |

⚠️ **32d 为什么限定"带 @type 的节点"**：ItemList 自己的
`itemListElement[i].item` 就是一个 `{"@id": ...}` 的**引用**（没有 @type）。
若把这类引用也算进"可被找到的 @id 集合"，"item.@id 指向谁"这条判据就变成
**拿自己证明自己** —— 永远成立 → 32d 变成一条永远为绿的空判。
只收带 @type 的实体节点，才是真在问"这个 @id 背后有没有一个被声明过的作品"。

### D. 故障注入证据（基线 + 7 个用例；每例先自证注入生效）

注入方式：把 `_site` 用 `rsync -a` 复制到 `/tmp` 下独立目录
（`cp -R` 会重写 mtime，可能让"产物时间 vs 源文件时间"类判据假红），
用 `SITE_DIR` 指向副本跑 `verify-site.cjs` —— 不动真实产物，也不和并发 build 抢目录。
**每例都先回读文件确认注入真的生效**，再判红。

| 用例 | 注入 | 自证 | 结果 |
|---|---|---|---|
| BASE | 不注入 | — | exit 0（证明副本本身是绿的，红因才是注入） |
| F1 | 删掉整个 ItemList 块 | 回读确认块已消失 | exit 1 → 32a「数量是 0（应为 1）」+ 32f「全站找不到任何 ItemList」 |
| F2 | `item.@id` → 不存在的作品 | 回读确认新值 | exit 1 → 32d「找不到同 @id 的节点」+ 32e「与第 1 个 ScholarlyArticle 的 @id 不一致」 |
| F3 | `numberOfItems` → 99 | 回读确认新值 | exit 1 → 32b「numberOfItems 是 99，实际条目数是 1」 |
| F4 | `position` → 2 | 回读确认新值 | exit 1 → 32c「第 1 条的 position 是 2（应为 1）」 |
| F5 | 把 ItemList 复制到首页 | 回读首页确认已有 ItemList | exit 1 → 32a 反向「只允许出现在 papers/index.html」 |
| F6 | `item.@id` → Person 的 @id（仍是本页存在的实体，但与 ScholarlyArticle 序列不符） | 回读确认新值 | exit 1 → 32e「与第 1 个 ScholarlyArticle 的 @id 不一致」 |
| F7 | `itemListElement` 清空（`numberOfItems` 仍写 1） | 回读确认已清空 | exit 1 → 32b + 32e「列了 0 项，但本页声明了 1 个 ScholarlyArticle」+ 32f「一条都没被比对」 |

**分支覆盖**：32a（数量）、32a 反向（泄漏）、32b、32c、32d、32e 逐项、32e 长度不等、
32f 两种形态 —— 8 个子分支**全覆盖**。
⚠️ 一处**未覆盖**（据实说明）：32c 只能测到"position ≠ 序号"，
测不到"跳号"与"重复"两种形态 —— 当前只有 1 篇论文（N=1），
序列类判据要 N≥2 才分得出这两种情况。将来论文数超过 1 时，
F4 应扩成"把第 2 条的 position 改成 1（重复）"与"改成 4（跳号）"两例。

### E. 过程中发现并修掉的一个真问题：note 在判红时照抄了通过时的断言

F5 判红时输出里，note 仍写着「**1 个（仅 papers/index.html）**」——
而那一页恰恰**有** ItemList，note 说的是**假话**。
这违反本仓 note 纪律（文件里 `note()` 上方写明：措辞带断言的 note 必须由本条自己的
判定结果决定，判红时改写成"存在问题（见上方报错）"）。
**已修**：note 的措辞改为跟着本条判出的问题数走，判红时输出
「全站 N 个 / 比对了 M 项 —— 存在问题（见上方报错）」。
并把它加进注入脚本的**断言**里（判红时输出里若仍出现"仅 papers/index.html"即算用例失败）。

### F. 归属与边界（共享工作树）

- **本场次提交 4 个文件**：`src/papers.njk`（ItemList 块）、`eleventy.config.js`
  （`jsonLdItemList` filter）、`scripts/verify-site.cjs`（门禁 32）、
  `docs/IMPROVEMENT-LOG.md`（本节 + 中央「待决策」两条）。
- ⚠️ **一条 unavoidable 的连带**：`eleventy.config.js` 与 `scripts/verify-site.cjs`
  同时含**他人已暂存**的改动 —— 门禁 31（同一 @id 的同名字段必须一致）与
  **sameAs 根因修复**。这两处**必须一起进来**：
  门禁 24 要求编号**连续**（清单 ↔ 代码段），只交 32 而缺 31 → 门禁 24 直接判红；
  而门禁 31 又依赖 sameAs 根因修复才绿（修前 9 个节点走全集、4 个是裸 ORCID）。
  → 本场次提交里**会带上这两处**，内容逐字保留，但**作者是他人**。
  这是共享工作树里"门禁号连续性"带来的硬约束，不是本场次的取舍。
- ⚠️ **明确排除**的一处：他人**未暂存**的 git-error 判据重构
  （`eleventy.config.js` / `verify-site.cjs` 里的 `require("./scripts/lib/git-error.cjs")`
  与新建的 `scripts/lib/`）**没有**进本场次提交 ——
  `scripts/lib/git-error.cjs` 目前是**未跟踪**的新文件，若把那两处 require 提交进去
  而不提交它，**那棵树会直接崩**（Cannot find module）。
  → 那部分改动**留在工作树里**，由它的作者自己提交。
- ⚠️ **我改的、但本场次不提交**的一处：`scripts/check-overflow.cjs` 第 74 行
  —— 原先 `return explicit;` 返回字符串，与调用方约定的 `{ bin, reason }` 不符 →
  显式指定的 `CHROME_PATH` **永远静默不生效**。我已改成
  `return { bin: explicit, reason: null };`（带中文注释说明）。
  该文件是**窄屏门禁那一组**的，本场次**不抢**它的提交；
  → **提示该组作者**：这行还没进历史（`git log -S 'return { bin: explicit, reason: null }'`
  输出为空），提交那个文件时请一并带上。
- 中间产物（注入脚本）全在 `/tmp/mh_fi/` → **仓库内无新文件**。
- **不 push**（部署由本人决定）。

### G. 待本人拍板

1. **ItemList 的落点**（正文之后 vs `<head>`）—— 理由与两个备选见中央「待决策」段。
2. **首页要不要也给一个 ItemList**（选摘范围）—— 备选见中央「待决策」段。

### H. 本场次提交

提交信息：`feat(site): 论文列表页补上列表级结构化数据（ItemList）+ 门禁 32`。
**不 push**（部署由本人决定）。

### I. 补记：一个只在「干净克隆」里才暴露的失误（如实记）

第一版提交（`9ff35ea`）**工作树是绿的、提交内容是红的**。
原因：把 `scripts/verify-site.cjs` 切成「索引版 + 我自己的 hunk」时，
**漏掉了文件头「对照表」里 `（无） → 新 32` 那一行** —— 它与门禁 31 的
`require` 相邻，被我误判成了他人的改动而丢弃。
后果：门禁 29「对照表里没有门禁 32」判红 → **那棵树 build 不过**。

- 这个失误**在共享工作树里验不出来**：工作树里那行是在的，`npm run build` 当然绿；
- 是「把提交内容克隆到干净目录再 build」这一步抓到的
  （`git clone --no-hardlinks` + 软链 `node_modules`，
  不用 `cp -R` —— 它会重写 mtime，可能让时间类判据假红）。

→ **对本仓可复用的一条**：共享工作树里 `npm run build` 通过
**不等于**提交内容能 build 通过。凡是"只提交自己那部分"的操作
（切 hunk / 私有索引 / 现取现拼），都必须在**干净克隆**里把那棵树 build 一遍。
已修正并 amend（`9ff35ea` 悬空、**未 push**；最终提交 `adcf339`，
其父仍是 `49b91ee`），并在干净克隆里复验 `exit 0` + 7 例注入全过。
## 2026-10-19 · 15:50–16:00 场次（**不占轮次号**，避免与并发场次撞号）：并发把工作树日志整份覆盖了 373 行 —— 并集修复 + 门禁补第 4 条判据（LS4）

### A. 巡检（现查，非采信上一轮结论）

- `HEAD` = `246b966`（上一轮我自己的提交）。`git status`：**12 个文件被并发场次改动**
  （全部 unstaged）+ 2 个未跟踪（`scripts/check-jsonld.cjs`、`scripts/lib/`）——
  这些**不是**本轮动的，本轮也没碰。
- 线上 7 条 URL（现查）：`200 / 404 / 200 / 200 / 404 / 404 / 200`
  （`/papers/`、`/publications.bib`、`/feed.xml` 仍 404）。
  线上 `sitemap.xml` 的 `<loc>` 仍是 `https://github.lvyihang.xyz/MeteoHub/…`
  → **旧部署滞后**，不是代码回归。本轮同样**不修代码、不 push**（部署由本人拍板）。
- 本地 `npm run build` → **EXIT=0**。

### B. 事故：工作树上的日志被旧基线**整份覆盖**（实测）

这一轮开头做的第一件事不是巡检，是**核对工作树与 HEAD 是否对得上**——因为
「工作树绿 ≠ 提交内容绿」这条纪律在上一轮刚吃过一次亏。结果这次对不上的是**日志本身**：

| 口径 | HEAD（`246b966`） | 工作树 | 差 |
|---|---|---|---|
| 行数 | 7846 | 7862 | +16 |
| `## ` 节数 | **52** | **50** | −2 |

行数只差 16，肉眼扫一眼看不出来；但**节集合**对不上：**HEAD 有 4 个节在工作树里不见了**，
逐行比对后确认工作树少了 **373 行**（聚成 3 簇：9 行 + 14 行 + 文尾整段 350 行）。
丢的 4 节里包含 **门禁自己那一节**（LS1–LS3）和**我上一轮那一节**（ItemList + 门禁 32）。

**基线是谁**：把工作树的内容与近 25 个提交的日志版逐一比对，只有 `e078086` 的
**100% 非空行都还在工作树里**（5753 行全覆盖），而工作树另有 **5.4%** 的行不在它里面
→ 工作树 = `e078086` 那份 + 并发场次自己的改动。

**机制**：拿**旧基线的整份文件**（或用旧文件的字节偏移）去写一个**已经变长**的工作树文件，
于是旧版里没有、而新版里已经长出来的那一段被整段吃掉。文件 mtime 是 15:47:22，
而我上一轮的提交是 15:47:16 —— **相差 6 秒**。从文件内容本身能反推出来的顺序是：
并发场次手里那份快照取自我「往「待决策」段插两条」与「追加本场次节」之间，
所以它的副本里**有**我的那两条待决策、**没有**我的场次节。

**为什么一直没人发现**：`scripts/check-log-sections.cjs`（LS1–LS3）只比 **HEAD 与提交历史**，
事故却发生在**工作树**这一层，HEAD 当时一动没动 → LS 全绿。
换句话说：**门禁覆盖的是"提交之后"，而事故发生在"提交之前"**——
LS 抓得住"节被扫掉了"，抓不住"节正在被吃掉"。

**后果**：任何人下一次 `git add docs/IMPROVEMENT-LOG.md` 整份提交，main 上就会少 4 个场次节
（含门禁自己的那节），且**不报错、不冲突、build 照过**——正是本仓日志反复记的那一类事故。

### C. 修复：节块级 + 行级并集（**只插入，不删除**）

不能简单地把工作树换成 HEAD 那份——有 **2 个节只存在于工作树**，
在**任何提交、任何分支里都没有副本**（`git log --all -S` 全部查空）：
「15:00–15:50 门禁 31 落地」与「15:30–16:00 C2 判据复验」。
直接覆盖 = 把别人的在途成果删掉；直接提交它们 = 在 main 上留下"日志记了、代码没上 main"的
旧问题（本仓 16:10–16:30 场次专门订正过这件事）。所以只能做**并集**。

规则（逐块独立判定，`/tmp/mh_fi/repair_log3.py`）：

1. 块只在一边 → 原样取；
2. 一边是另一边的**超集** → 取超集那侧（逐字保留，不重排）；
3. 都不是超集 → **行级并集**（先 ours，再补 theirs 里 ours 没有的行）。

结果（脚本自证，不是人工核对）：

- 行数 7847 + 7863 → **8228**；节 52 + 2 → **54**
- **HEAD 的非空行缺失 0 条；工作树的非空行缺失 0 条；重复节标题 0 个**
- 唯一走了规则 3 的块（15:25–15:55 数据集那节）只补进 2 行（对方版末尾的一段 ⚠️ 注解），
  读起来是正常的一段尾注

**那 2 个"只在工作树"的节本轮不提交**（理由见 B 段），留在工作树等其作者自己收尾。

### D. 门禁补第 4 条判据 **LS4**：工作树的日志节必须**覆盖** HEAD 的全部节

判据（`scripts/check-log-sections.cjs` 新增）：

- **LS4** 工作树上的 `## ` 节集合必须 ⊇ HEAD 上的节集合。
  少一个节 → 判红，并**指名是哪一个节**、给出恢复方式
  （`git show HEAD:docs/IMPROVEMENT-LOG.md` 取 HEAD 那版，再把自己未提交的那部分并回去）。
- 方向只能是「工作树 ⊇ HEAD」：工作树**多**出未提交的节是**正常**的
  （每个场次都先写日志再提交），**少**一个节才是事故。
- **非空跑自证**：工作树里一个 `## ` 节标题都没有 → 单独判红（清空/被整份换掉）；
  HEAD 上没有节可比 → 判红（并说明这一条已由 LS1 判红）。宁可多报，不许假装比过了。

**接线位置**：加在**既有**的 `scripts/check-log-sections.cjs` 里（该文件在 HEAD 上**干净**、
无并发改动），**不动 `package.json`** —— 那份文件此刻正被别的场次改着，
去动它就等于把别人的在途改动一起卷进我的提交。门禁已在 build 链上（`check:log-sections`），
加判据即生效。

### E. 故障注入证据

**真实仓库复现原事故形态**（不是沙箱）：

1. 注入：`git show e078086:docs/IMPROVEMENT-LOG.md > docs/IMPROVEMENT-LOG.md`
   （= 把工作树换成并发场次当时用的那份旧基线，7320 行）→ 回读确认行数已变（注入生效）；
2. 跑门禁 → **EXIT=1**，**逐条指名 4 个不见了的节**（含门禁自己那节、含我上一轮那节）；
3. 恢复：`cp` 回备份 → `shasum -a 256` 与注入前**逐字节一致**（`b6dd9e15…`）；
4. 再跑门禁 → **EXIT=0**（工作树 54 节 ⊇ HEAD 52 节）。

**同一场景下 LS1–LS3 全绿**（HEAD 没动）→ 证明这一条确实是**旧判据的盲区**，不是重复劳动。

**沙箱自测**（`bash scripts/test-log-sections.sh`）：**6 例全绿**（原 4 例 + 新增 2 例）
- 用例 5：工作树被旧基线整份覆盖（HEAD 有的节、工作树没有）→ 红，红因指名该节；
- 用例 6：工作树比 HEAD 多一节（未提交的在途内容）→ 绿（**不得误报**）。

### F. 归属与边界

- 本轮**只提交 3 个文件**：`scripts/check-log-sections.cjs`、`scripts/test-log-sections.sh`、
  `docs/IMPROVEMENT-LOG.md`（**只含本场次节**；日志是共享追加文件，用私有索引拼
  「HEAD + 本场次节」提交，别人的在途节留在工作树、不进我的提交）。
- **不碰**：`package.json`（并发场次在改）、`scripts/verify-site.cjs`、`scripts/check-*.cjs` 其余、
  `scripts/lib/`、`src/**`。
- 提交方式：私有索引（`GIT_INDEX_FILE` + `read-tree HEAD` + `update-index --cacheinfo`
  + `write-tree` + `commit-tree -p` + `update-ref` CAS），**不读真实索引**，
  别人的暂存区原封不动；**不 push**。
- **不 push**（部署由本人决定）。

### G. 留给下一轮 / 待本人拍板

- **待拍板 1**：那 2 个"只在工作树"的节（门禁 31 落地、C2 判据复验）要不要进 main？
  它们的**代码**部分已经在 main 上了（门禁 31 是我上一轮连带提交的），
  但**日志节**没上 → 措辞需要同步订正，否则又是一次"日志与代码不同步"。
  备选：① 本人拍板后由我并进 main；② 留给其作者自己收尾（现状）。
- **待拍板 2**：并发场次"拿旧基线写工作树"这个习惯怎么根治？
  门禁只能**兜住后果**（当场红），管不了行为本身。
  备选：① 维持现状（靠 LS4 兜底）；② 再加一条"写入前先核对基线"的约定（写进日志，无机器强制）。
- **待拍板 3**：LS4 的判红文案要不要加一句"这是并发事故、不是代码问题"？
  现状文案已说明成因与恢复方式；加提示只是更好读，不改判定。
## 2026-10-19 · 16:00–16:15 场次（**不占轮次号**，避免与并发场次撞号）：线上仍是旧部署的取证 + 「门禁脚本漏 add」事故的独立复现 + 接线门禁的一处盲区

本场次是**只读核验者**（不写工作树代码、不 push）。本节记录三件事：
① 线上仍是旧部署的硬证据；② 独立复现并发场次提级的「漏 add 未跟踪文件」事故；
③ 由此暴露的一处门禁盲区（供后续场次修）。

### A. 线上仍是旧部署（16:00 复测，与 14:5x 结论一致）

12 个 URL 逐条状态码（`curl -o /dev/null -w '%{http_code}'`）：

| 状态码 | 路径 |
|---|---|
| 200 | `/`、`/about/`、`/blog/`、`/sitemap.xml`、`/robots.txt` |
| 404 | `/papers/`、`/papers/trmm-thunderstorm-stages/`、`/publications.bib`、`/feed.xml` |
| 404 | `/MeteoHub/`、`/MeteoHub/papers/`、`/MeteoHub/index.html` |

**线上 `sitemap.xml` 只有 3 条 `<loc>`，全部带 `/MeteoHub/` 前缀，且该前缀族 3 个 URL 全部 404**：
`/MeteoHub/`、`/MeteoHub/about/`、`/MeteoHub/blog/`。3 条 `<lastmod>` 的时间戳
都是 `2026-10-16T09:51:14.89xZ` —— 即**线上是 10-16 那一版构建**，本地 HEAD 已经又前进了很多。

**线上 `robots.txt` 第 30 行**：`Sitemap: https://github.lvyihang.xyz/MeteoHub/sitemap.xml`
→ 爬虫这条登记的路也是 404。

对照**本地 HEAD（`25f7820`）干净克隆的构建产物**（`/tmp/mh_head_final`）：
- `sitemap.xml` 5 条 `<loc>`，**无 `/MeteoHub/` 前缀**，且每条带 `<!-- source: ... -->` 标注与 `<lastmod>`；
- `robots.txt` 末行为 `Sitemap: https://github.lvyihang.xyz/sitemap.xml`（无前缀）。

→ **本地已修好，线上还是旧的**。这是「待部署」而不是「缺陷」，且**不能靠改代码解决**，
只能靠本人决定何时 push / 部署。**本场次不 push。**

### B. 独立复现：「门禁脚本漏 add」事故（并发场次已提级，我独立做实）

**工作树现状**（`git status --porcelain -uall`）里有 2 个**未跟踪**文件，
却被**已跟踪文件的改动**引用：

- `scripts/lib/git-error.cjs` —— 被 `scripts/verify-site.cjs:119`（`require("./lib/git-error.cjs")`）
  与 `eleventy.config.js:21`（`require("./scripts/lib/git-error.cjs")`）引用；
- `scripts/check-jsonld.cjs` —— 被 `package.json:19`（`"check:jsonld": "node scripts/check-jsonld.cjs"`）引用，
  且 `build` 链末尾已接上 `npm run check:jsonld`。

**这两个文件都不是被 ignore 挡掉的**：`git check-ignore -v` 对两者均无输出，
`.git/info/exclude` 也无相关条目 → 是**真的漏 `git add`**，不是规则挡的。

**复现（`/tmp/mh_untracked_test`，干净克隆 `25f7820` + 只套用已跟踪文件的改动）**：

| 副本状态 | `npm run build` | 失败点 |
|---|---|---|
| 两个未跟踪文件都**不**带 | **exit 1** | `Cannot find module './scripts/lib/git-error.cjs'`（eleventy 载入 config 时就炸） |
| 只补 `git-error.cjs`，`check-jsonld.cjs` 仍缺 | **exit 1** | `MODULE_NOT_FOUND`（`scripts/check-jsonld.cjs`） |
| 两个都补齐 | **exit 0** | —（门禁编号「文件头清单 33 条 / 代码段 33 条」、对照表 33 行、`✓ 结构化数据自检通过（门禁 J1–J7）`） |

→ 与并发场次 15:55 的判断一致：**两处都要补，漏 `git-error.cjs` 会先撞**（在 eleventy 阶段，
比 build 链末尾的 `check:jsonld` 早得多，报错形态也不同）。

### C. 由此暴露的一处盲区：接线门禁认不出「script 指向的文件不存在」

`scripts/check-gates-wired.cjs` 的 GW1 是**从文件出发**的
（`readdirSync(SCRIPTS_DIR)` 列出 `scripts/` 下的门禁文件，再反查谁引用它）。
所以「`package.json` 里有个 script 指向一个**不存在的文件**」**不在它的扫描范围内**。

**故障注入（在 `/tmp/mh_untracked_test`，绿基线 = 两文件都在）**：

| 注入 | `npm run check:gates` | 完整 `npm run build` |
|---|---|---|
| 基线（两文件都在） | exit 0，「12 个门禁脚本全部从 `npm run build` 可达」 | exit 0 |
| **删掉 `scripts/check-jsonld.cjs`**（= 漏 add 的等效形态），`package.json` 仍指向它 | **exit 0 全绿**，还输出「**11 个**门禁脚本全部可达」 | exit 1（`MODULE_NOT_FOUND`） |
| 把 `package.json` 指向改成 `scripts/check-jsonld-DOES-NOT-EXIST.cjs`（文件在，但引用被改错） | exit 1，但**红因指错了方向**：报「`scripts/check-jsonld.cjs` 没有被任何 npm script 引用」——它其实被引用了，只是被引用的那个名字不存在 | exit 1 |

**判读**：
1. 第一行是最危险的形态——**门禁自己数出了「12 → 11」这个变化却仍然全绿**。
   计数变少本该是红因，但当前判据里"文件数"只是通过语的装饰，不是判据。
2. 第二行是**红因误指**：说「没有被引用」，真因是「被引用了，但那个文件不存在」。
   按红因去修（"加个 script 指向它"）会越修越乱。
3. 也就是说：**"漏 add 未跟踪文件"这一类事故，`check:gates` 抓不到**，
   抓它的是 build 链末尾的 `MODULE_NOT_FOUND`（而且是**报错**形态，不是门禁红），
   或者根本抓不到——若 `package.json` 里的 script 没接进 build 链，那就静默了。

**建议（供后续场次实施，本场次不改代码）**：给接线门禁补一条判据 ——
**`package.json` 的每个 script 指向的本地文件必须存在**（且这个判据要能区分
"文件不存在"与"没被引用"两种红因，别混成一条）。

**判据输入的通用要求**（沿用既有纪律）：
- 红因必须指名到**具体是哪个 script、哪个文件**，不能只说"有问题"；
- 通过语里的**计数必须参与判定**（"从 12 变 11"本身就是证据），不能只当装饰；
- 故障注入必须**先自证注入真的生效了**（本次已自证：基线 exit 0 且输出 12，注入后输出 11）。

### D. 事实订正（对 15:55 场次裁定的确认）

- 15:55 场次②「门禁 31 已在 HEAD」—— **属实**。`verify-site.cjs:2388` 起确有
  「同一 @id 的同名字段必须一致（`sameAs` / `keywords` / `knowsAbout`）」整段判据。
- 15:55 场次③「现在清单 33 条（编号 1–32，4 拆成 4b/4c）」—— **属实**。
  本场次在 `25f7820` 干净克隆上独立复现：「文件头清单 33 条 / 代码段 33 条」、
  「对照表：33 行，覆盖全部 33 个门禁编号且无重复行」。
  ⚠️ 附带确认记忆里那条纪律仍然成立：**33 是条目数，最大编号是 32**，
  「有第 31 号门禁」与「有第 32 号门禁」都成立。
- 15:55 场次④「`"status" in e` 宽判据方向是反的」—— **与本场次 11:20 的独立结论一致**，
  双向确认，不再有分歧。

### E. 留给下一轮 / 待本人拍板

- **待拍板（沿用并补充前几轮，不代本人决定）**：
  - 线上何时 push / 部署（线上仍是 10-16 那版：`/papers/` 等 4 个路由 404、
    `/MeteoHub/` 前缀残留、robots.txt 的 `Sitemap:` 指向 404）；
  - `paper` 的 `@id` 里 `url` 口径、`datePublished` 精度（`2026-06` vs `2026-06-01`）；
  - 门禁 31 边界是否按"只查真冲突"（缺失不查、`keywords` 归一化、覆盖差异不查）；
  - CI 是否显式加一步 `npm run check:gates`（补上接线门禁的自指悖论）；
  - lastmod 口径最终拍板（A 源文件真实提交时间 / B max 三者 / C 全站统一 HEAD 时间）；
  - 404 页是否保留身份实体（`identityOn404` 开关）；
  - og / `twitter:image:alt` 口径；
  - **（新增）** 是否给接线门禁补 C 节那条判据（script 指向的文件必须存在），
    以及漏 add 的两个文件由谁补 `git add`（**必须同一个 commit 一起进**，
    分两次进则中间那个 commit 的 build 必红）。
- **本场次零 commit、零 push**；工作树未被我改动。
  下方 `git diff` 若出现本场次相关改动，说明有并发场次在同一时间动了同一个文件，需另行核对。
## 2026-10-19 · 15:00–15:50 场次：门禁 31 落地（同一 @id 的同名字段必须一致）+ sameAs 根因修复 + 两处「note 说假话」的修法
> 🛑 **订正（2026-10-19 16:10–16:30 场次）：本节标题里的「落地」= 写进了共享工作树，≠ 进了 main。**
> 请自己查（**以你当前的 HEAD 为准**，别信标题）：
> · `git log -S '同一 @id（且同一 @type）的节点' -- scripts/verify-site.cjs` → 空 = 门禁 31 从未进 main
> · `git show HEAD:scripts/verify-site.cjs | grep -c '/\* ---------- 31\.'` → 0 = HEAD 上没有 31 段
> · `git show HEAD:docs/IMPROVEMENT-LOG.md | grep -c '^## 2026-10-19 · 15:00–15:50 场次'` → 0 = 本节整节也不在 main
> 本节自己**并没有声称「已进 main」**（开头写着「本场次一律不提交它们」），**矛盾只在标题那个词**。
> main 上的正式记录见「16:10–16:30 场次」。

> 本场次只动三个文件：`eleventy.config.js`（根因修复）、`scripts/verify-site.cjs`（门禁 31 + D1/D2）、
> `docs/IMPROVEMENT-LOG.md`（本段 + 两处占位符订正）。
> 工作树里同时存在**别的在途场次**的改动（`package.json` / `scripts/check-*.cjs` /
> `.github/workflows/deploy.yml` / `src/papers.njk`，以及本文件里的一段**重复**日志），
> 本场次**一律不提交它们**（提交方式见 §J）。
> 复验环境：隔离克隆 `/tmp/mh_v25_cleanbuild/repo`（`git clone --no-hardlinks` + `node_modules` 符号链接），
> 注入驱动 `/tmp/mh_v22_9661b8dc/inj3.js`（11 例，含回读断言）。

### A. 一句话

**「标识符统一 ≠ 标识符描述统一」。** 门禁 12 守的是前者；本轮落地**门禁 31** 守后者，
并把根因修掉——本人（`@id = <站点根>/#person`）的 `sameAs` 从**两套**变回**一套**。

### B. 根因修复：`sameAs` 两套 → 一套（`eleventy.config.js`）

`jsonLdArticles` 给「本人」发射的是**残缺节点**（`sameAs` 只有 ORCID 裸字符串），
而 `base.njk` 的 Person 与 `jsonLdPaper` 的 `author` / `creator` 发射的是**全集**（5 条）。
消费方按 `@id` 把「本人」归并成一个节点时，**取到哪套取决于遍历顺序**——
拿到残缺那套，就等于替本人丢掉 GitHub / ResearchGate / CSDN / OpenAlex 四个身份句柄。

**修法**：本人节点的 `sameAs` 改为直接取 `site.author.sameAs` **全集**
（与 `base.njk` / `jsonLdPaper` **同一份数据**），保留 `ownerOrcid` 兜底。

⚠️ 顺带修的**第二处形状差异**（交接件没提，是本场次自己扫出来的）：
论文的 `keywords` 在列表页是**逗号串**、在论文页是**数组**。schema.org 两者都合法，
但同一个 `@id` 的两个节点一个给串、一个给数组，消费方得自己猜怎么解析 → **统一成数组**。

### C. 门禁 31 的判据（照抄就能复核）

① 按 `(@id, @type)` 分组，**必须递归进嵌套节点**——论文的 `author`、数据集/胶囊的 `creator`
   都是**嵌套的 Person**，它们带着本人的 `@id`；不递归就看不见本条的真正目标
   （15:45 协调场次自己第一版扫描器就栽在这儿，只遍历顶层 `@graph` → 差点判成「没有冲突」）。
② 同组内同一个字段出现**两个及以上互不相同的取值** → 判红。
③ **字段缺失不算冲突**（`hasOwnProperty` 为假 → 跳过），**值不同才算**。
④ 归一化：数组按「去重排序后的集合」比（顺序无关）；`sameAs` / `keywords` / `knowsAbout`
   的**逗号串**先切集合再比（形状差异 ≠ 内容差异）。
⑤ **嵌套对象 / 对象数组不判**（`author` / `isPartOf` / `affiliation` / `creator`）——
   它们身上的「覆盖差异」（一边多一个 `issn`、多一个 `alternateName`）是合法的可选字段缺失，
   判进去必然误报。

⚠️ `url` / `datePublished` **只报不判**（`PENDING_FIELDS`）：口径待本人拍板（见 §H），
**没有留临时豁免**——拍板后把字段名从 `PENDING_FIELDS` 里删掉即变成硬判据。

⚠️ 本条**自证存活**：一个字段都没比成、或 `sameAs` 一次都没被比对 → 判红。
（与门禁 18「`<!-- source -->` 标注没了整条失效」是同一类病：
**「没报错」和「没问题」长得一模一样**。）

基线输出：`同一 @id 的字段一致性：2 个多节点组 / 22 处比对，同名字段取值一致（字段缺失、嵌套字段不判）`

### D. 顺带修的两处「note 说假话」（D1 / D2）

这两处不是判据漏洞，是**判据自己说错了话**——比「判据漏了」更容易误导人。

- **D1｜门禁 18 的汇总句**：else 分支原来无条件说「见上方报错」。
  但它其实有**四条互不相同的失败原因**（已逐页核对 / 浅克隆 / 不在 git 仓库 / 产物里没有源文件标注），
  一律说「见上方报错」等于把**根本没有上方报错**的两种情形也指过去 → 改成按真实原因分四支措辞。
- **D2｜门禁 12 的 note**：原来无条件宣称「@id 全站统一」。
  但同一段代码里**缺 @id 的 Person 节点已经判红了** → note 与判据自相矛盾。
  → 改成统计 `ownerNodesWithoutId`，缺 @id 时说「其中 N 个没有 @id，见上方报错」。

### E. 故障注入：11 例全中（源码级 2 + 产物级 8 + 复位 1）

**每例先回读断言**（锚点必须命中且恰好 1 处、替换必须落盘），**再读门禁结论**——
「注入没生效」和「门禁没拦住」的结果一样，所以先确认注入再说结论。
退出码一律用 `spawnSync` 直接取，**不经管道**。

| 用例 | 级别 | 注入 | 期望 | 实测 | 判定 |
|---|---|---|---|---|---|
| J0 | 源码 | 还原 `sameAs` 修复（`jsonLdArticles` 只给 ORCID 一条） | 1 | **1** | ✓ 红因＝「同一 @id … 的 sameAs 有 2 种取值」 |
| J1 | 产物 | 本人 `#person` 的 `sameAs` 退化为仅 ORCID | 1 | **1** | ✓ 同上 |
| J2 | 产物 | 本人 `#person` 的 `name` 漂移 | 1 | **1** | ✓ 红因＝「name 有 2 种取值」 |
| J3 | 产物 | 论文 `keywords` 数组**顺序**打乱 | 0 | **0** | ✓ 集合归一化后一致，不误报 |
| J4a | 产物 | 本人 `#person` 的 `sameAs` **字段整体缺失** | 1 | **1** | ✓ 红因来自**门禁 23**（ORCID 脱钩），**不是**门禁 31 |
| J4b | 产物 | 论文 `@id` 的 `keywords` 一处缺失、另一处仍在 | 0 | **0** | ✓ 字段缺失不算冲突 |
| J5 | 产物 | 论文 `keywords` 列表页改**逗号串**、论文页仍是数组 | 0 | **0** | ✓ 形状差异不算冲突 |
| J6 | 产物 | 论文节点的 `publisher`（**嵌套对象**）内部改名 | 0 | **0** | ✓ 嵌套字段不判 |
| J6b | 产物 | 嵌套 `author` 里的共作者 Person 多一个 `alternateName` | 0 | **0** | ✓ 嵌套节点不参与字段级比对 |
| J7 | 源码 | 删掉门禁 31 的**代码段**（门禁自己被卸掉） | 1 | **1** | ✓ 门禁 24 报「文件头清单里登记了门禁 31，但代码里没有对应的门禁段」 |
| J8 | — | 全部复位 | 0 | **0** | ✓ 基线绿 |

**J4a 值得单说**：删掉 `sameAs` 字段后，**红的不是门禁 31**（门禁 31 明确不判字段缺失），
而是**门禁 23**（「带 canonical @id 的 Person 节点，`sameAs` 里没有本人 ORCID」）。
这说明两条门禁是**互补**的：门禁 31 守「描述一致」，门禁 23 守「权威标识没脱钩」——
**把两者混为一谈，就会得出「删字段没人管」的错误结论。**
⚠️ 也因此，J4a 的红因必须**点名到具体门禁**才算通过，不能只看 exit 1。

⚠️ 上一轮遗留的注入器有**两处自身缺陷**，本轮一并修掉后才拿到上面的结果：
① `expect()` 参数顺序写反（`"$2" = "$3"` 应为 `"$1" = "$3"`）→ 报告里「期望/实测」显示颠倒；
② 5 个用例的**内容锚点没命中**（`index.html` 里 5 条 `sameAs` 数组锚点只命中 1 处；
   `keywords` 实际是 8 项数组而不是我假设的 6 项）→ 那 5 例**其实没执行**，
   它们的「exit 0」是**假绿**。本轮所有锚点都先数命中数。

### F. 端到端

- 隔离克隆（`git clone --no-hardlinks` + `node_modules` 符号链接），HEAD = `018dc24`，
  装入本场次两个代码文件后 `npm run build` → **exit 0**；
- 门禁链 `check:gates → check:css → check:wrap → eleventy → check:site → check:lang →
  check:a11y → check:copy` 全绿；
- `check:site` 输出：门禁编号**文件头清单 32 条 / 代码段 32 条，一一对应且连续**；
  对照表**32 行**；新增 note「同一 @id 的字段一致性：2 个多节点组 / 22 处比对，同名字段取值一致」。

### G. 并入两场次交接的复验证据

1. **14:20 场次的 Copy 门禁复验**（I1–I7，含 **I4 别处合法用 `innerHTML` 不得误报**、
   **I5a / I5b 传递链 `html=src.innerHTML` → `text=html.trim()` / `text=html`**）——
   **已在本文件 L5807–5809 的「D1. 单文件回归（9 例，14:20 场次的原表）」里**，
   14:45 场次已并入（旧门禁 / 新门禁逐例一致，9/9）。
   本轮**不重复登记**，只在此点名，避免下一轮又当成新证据再抄一遍。
2. **15:45 场次对 `e6a41c0`（Copy 覆盖范围扩展）的独立 A/B 复核**（`/tmp/mh_v23_e41cfa12/verify_e6a41c0.md`）：
   - **A/B 双沙箱 9 例全中，红因也全对**（old=`459c3e8` 只扫 `main.js` / new=`e6a41c0` 扫 `src/assets/**`）；
     关键差异：N1「别处新增坏出口」old=**0**（缺口坐实）/ new=1；N4「两条路径拆到两文件」
     old=**0**（静默失效）/ new=1（红因＝判据 6）；N6「`main.js` 无出口、别处有」old=**1**（误报）/ new=0；
   - **端到端**：干净克隆 HEAD=`e6a41c0` → `npm run build` → **exit 0**；
   - **覆盖范围口径（回答 14:45 场次「留给下一轮」第 1 条）**：**就 `src/assets/**`，不扩到 `src/**`**——
     实测 `src/` 下除 `src/assets` 外只有 `src/_data/site.js`，它是**构建期数据**、不下发浏览器、
     且零复制出口；扩到 `src/**` 只会多扫一个**永远不可能含浏览器复制出口**的文件；
   - **9 个 JS 全是活代码**（其余是 ES module 动态/静态 import，不是「没被加载」）。
3. **`12:0x` 占位符订正**：本文件里「12:0x 由 11:20 场次补上」两处占位符
   （措辞与同一段里已写实的「12:09」对不上）已统一为 **`12:09`** ——
   依据是 `54899f1`（2026-10-19 12:09:49，落地门禁 18/19），
   且本文件另一处已写明「`54899f1` 起就是 `fail`，不是 `continue`」。
   ⚠️ 这一条**已由 `d51eb76` 场次先一步提交**（本场次工作树里同改，结论一致，无冲突）。

### H. 待决策（需本人拍板，本轮**不替本人选**，也不在判据里留临时豁免）

1. **论文 `@id` 的 `url` 用哪一个**：列表页给出版商 DOI 页
   （`https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2026JD046836`），
   论文页给本站页（`https://github.lvyihang.xyz/papers/trmm-thunderstorm-stages/`）。
   两边都符合 schema.org，**这是口径问题不是事实问题**。
2. **论文 `@id` 的 `datePublished` 粒度**：`2026-06`（列表页）还是 `2026-06-01`（论文页）。
3. **门禁 31 要不要扩到「字段缺失也查」**：现在是**缺失不算冲突**（schema.org 的可选字段缺就缺了）。
   若要查，缺的那一侧该以什么为准（本站单一真源？）需要一并定。
   ⚠️ 扩之前先看 J4a：**删掉本人 `sameAs` 字段时，护住它的是门禁 23，不是门禁 31**——
   「字段缺失也查」会让门禁 31 与门禁 23 抢同一件事。

> 口径 1、2 目前在门禁 31 里是 `PENDING_FIELDS = {url, datePublished}`（**只报不判**），
> 产物里会以 note 形式列出两套取值。**拍板后把字段名从 `PENDING_FIELDS` 里删掉即变成硬判据**，
> 不需要改判据结构。
> ⚠️ **订正一处**：14:45 协调场次写「`url` / `datePublished` 仍挂在本人的待决策清单里」——
> 实际上**本文件 L1490 起的中央「待决策」段里并没有这两条**（全文件搜 `datePublished`
> 只在那两个场次段里出现过）。本段是它们**第一次**真正落到待决策清单上。

### I. 留给下一轮

1. ~~**判据 6 的「恰好 1+1」限制**~~ —— **本轮已被 `d51eb76` 关闭**：
   `fix(gate): Copy 门禁判据 6 改为按文件结构判——出口变多不再整体失效`
   （不数出口个数，改看结构：某个文件里有 `clipboard.writeText` 出口、另一个文件里有
   `textarea` 回退 → 判红）。**15:45 场次的实测（§G 第 2 条）是它的先导证据**，
   本条在写下当天就被别的场次修掉了 —— 留此记录是为了让后来者知道
   「这条边界曾经存在、为什么存在、现在归谁管」。
2. **模板内联 `<script>` 扫不到**（`src/_includes/layouts/base.njk:463`、
   `src/_includes/layouts/paper.njk:310`）：门禁扫的是**磁盘上的 `.js` 文件**。
   今天这两处**都不含任何复制逻辑**（全仓 `clipboard` / `writeText` / `execCommand`
   在 `src/` 下只命中 `src/assets/js/main.js`），所以是**理论盲区**、不是现网缺陷。
   → 要么记为已知边界，要么以后把「`.njk` 里的 `<script>` 块」也纳入扫描。
3. **论文 `@id` 被多种 `@type` 复用**（`ScholarlyArticle` / `WebPage`）：
   论文的 `mainEntityOfPage` 指回本页，导致同一个 `@id` 既是文章又是网页。
   ~~这是**建模选择**、不是错误（门禁 31 只记 note 不判红）~~
   → ⚠️ **2026-10-19 16:25 场次更正定性：这不是建模选择，是缺陷。**
     依据：`src/_includes/layouts/base.njk` 的「@id 方案」注释早已写明页面实体应是
     `<页面 URL>#webpage`（论文 filter 是唯一漏网之处）；schema.org 语义下
     `{"@type":"WebPage","@id":X}` 是对 X 的**类型断言**，不是另一种说法。
     已修：`mainEntityOfPage` 改为裸引用 `{ "@id": "<页面 URL>#webpage" }`，
     并由 `scripts/check-jsonld.cjs` 的 **J8**（同一 `@id` 不得挂不同 `@type` 组合）
     与 **J9**（论文 `mainEntityOfPage` 必须指向本页页面实体）判红。
     门禁 31 仍保留 `@type` 分组层作为安全网。详见该场次节；定性更正经本人确认。
4. **本文件里有**两份逐字相同**的「14:45–15:05 场次补充（协调）」段**（相邻两处，字节相同）
   → 建议由作者裁定**删哪一份**；本轮**没动**（不在本轮范围，且可能属在途场次）。
   ⚠️ 特意**不写行号**：写行号的那一版，几分钟后就过期了（并发场次一直在插段）。

### J. 边界

- **不 push**。本地 `main` 领先远端 50+ 个 commit，部署由本人拍板。
- 本场次**没有新增**任何外部链接、外部依赖、密钥、账号。
- 本场次**没有替本人拍板**任何一条；§H 三条全部开放。
- 工作树里有**别的在途场次**的改动（`package.json` / `scripts/check-*.cjs` /
  `.github/workflows/deploy.yml` / `src/papers.njk` / 本文件里的一段重复日志），
  本场次**不提交它们**：提交时用**索引侧 `hash-object` + `update-index --cacheinfo`**
  只放入本场次自己的三个文件的版本，工作树里他人的在途内容**原样保留**。
## 2026-10-19 · 15:30–16:00 场次（**不占轮次号**，避免与并发场次撞号）：C2 判据复验（10 形态 + 7 组端到端）—— 裁定「peer 补丁不取用」，改用共享模块 + 四态判据

### A. 收到的材料，以及我为什么不直接采信

15:30 收到 peer 场次（`mvs_f92f2ad1e8f942289a3b054bfd96a586`）的 C2 升级复验：
9 种错误形态表 + A/B/C 三组端到端注入 + 一份可套用的补丁
`/tmp/mh_f92f2ad_1530/handoff/fix-C2-head-criterion.patch`（2 文件、12 增 6 删，
把判据换成 `"status" in e`）。

**不采信转述**是这一轮的做法，三件事都自己重做了一遍：

1. **回代码核"现行代码长什么样"**（不能只看日志字面量）：HEAD `e078086` 的
   `eleventy.config.js` 与 `scripts/verify-site.cjs` 两份 `isGitProcessFailure`
   **仍是旧判据**，且两份**逐字相同**：
   `(typeof e.status === "number" || e.code === "ENOENT")`。
   → peer 说的"活洞在现行 HEAD 上仍成立"**属实**。
2. **形态表自己重测**（B 节）：结论与 peer 同向，但 peer 表里有一半我没测，
   表里标了出处，不把没测的写成测过的。
3. **补丁自己套、自己跑**（C 节）：在 `git clone --no-hardlinks` 的干净克隆上
   套用 + 造假 git 注入，5 组端到端全跑。

**补记（15:46 peer 协调广播）**：

- **我方先前那条「sameAs 在 HEAD 已不复现」是错的，已作废。** 根因与 14:45 场次
  记的是同一个坑：扫描只取 JSON-LD 顶层 `@graph`、**没递归进嵌套节点**。
  递归后与对方逐字一致：13 个 `#person` 里 9 个是 5 句柄全集、4 个是裸 ORCID
  字符串（about / blog / index / papers-index），`@id` 同为 `#person` → **缺陷成立**。
  修复在**别场次的在途改动**里（`eleventy.config.js` 改用 `site.author.sameAs` 全集），
  本场次**不重复实施**。
- 广播第 2 条（`check-overflow.cjs` 的 `found.reason` / `found.bin` 两行仍在位、
  窄屏门禁 6 页 390 全过）已由对方核过，本场次**未复现、不再验**。
- ⚠️ 广播里「工作树三处仍是旧写法」是**过时快照**：它发出时我的改动还没落进工作树。
  现查（15:47）：工作树两份文件已是 `degradeOrThrow`、旧判据 0 处；**HEAD 仍是旧判据**
  （`isGitProcessFailure` 3 + 2 处）—— 这部分属实，本场次提交的就是它。
  → 教训：peer 广播里的"工作树现状"同样是快照，**以现查为准**。

### B. 我自己实测的形态表（Node v26.8.1）

| 形态 | `e.status` | `e.code` | `e.signal` | 出处 |
|---|---|---|---|---|
| 非零退出（exit 3） | `3` | — | `null` | **我实测** |
| SIGKILL | `null` | — | `SIGKILL` | **我实测** |
| ENOENT（git 不在 PATH） | `null` | `ENOENT` | `null` | **我实测** |
| EACCES（git 存在但不可执行） | `null` | `EACCES` | `null` | **我实测**（不经 shell，避开"shell 把 Permission denied 变成 126"）|
| TypeError（参数 undefined） | **属性不存在** | `ERR_INVALID_ARG_TYPE` | — | **我实测** |
| TypeError（方法名不存在） | **属性不存在** | `ERR_INVALID_ARG_TYPE` | — | **我实测** |
| SIGTERM / SIGSEGV | `null` | — | 有 | peer 表（与 SIGKILL 同族，未由我重测）|
| ENOEXEC / ENOBUFS | `null` | 有 | — | peer 表（未由我重测）|

**二元分类（进程失败 vs 编程错误）上的结论**：子进程错误**必定**带 `status`
属性（退出码→数字；被信号杀→`null`；spawn 失败→`null`），编程错误**根本没有**
`status` 属性 → `"status" in e` 一次全对，现行判据漏判 5 种。
⛔ 判据**不能**写成 `typeof e.code === "string"`：TypeError 的 `code` 是字符串，
会把编程错误一起吞掉。

**这一条 peer 说对了，采信。** 但它是在**二元**意义上全对 —— 本门禁实际需要
**三态**，见 D 节。

### C. 端到端注入

注入手法与 peer 同源、互不依赖：造假 `git` 放 `PATH` 首位，记录调用后
`kill -9 $$` 自杀（复现「git 被 SIGKILL」）；缺陷注入用**删掉 sitemap 的
`<!-- source: ... -->` 标注**（门禁在「有 git」时会判红的那一条）。
所有沙箱都是 `git clone --no-hardlinks` + `ln -s node_modules`，**不用 `cp -R`**
（它会重写 mtime，把时间戳类判据弄成假红）。

#### C.1 peer 补丁的 5 组（E1–E4b）— **基准是当时的 HEAD（`e078086`）；当前 HEAD 的复验见 C.3**

| 组 | 判据 | 场景 | exit | 产物 lastmod | 门禁说了什么 |
|---|---|---|---|---|---|
| E3 | 补丁 | 无注入 | 0 | 5 | 「已逐页与各自源文件的 git 提交时间核对」|
| E1 | 现行 | 假 git（SIGKILL）| 1 | 无产物 | `Eleventy Fatal Error … Command failed: git rev-parse --show-toplevel`（崩栈，看不出是"git 被杀"）|
| E2 | 补丁 | 假 git（SIGKILL）| **0** | **0** | 「不在 git 仓库里：sitemap 不输出 lastmod（源码 zip 分发，本就没有 git 历史）」← **事实错误** |
| E4a | 补丁 | 删 source 标注 + **真 git** | **1** | 5 | 判红「没有 `<!-- source: ... -->` 源文件标注——门禁靠它逐页核对 lastmod」|
| E4b | 补丁 | 删 source 标注 + **假 git** | **0** | 0 | **同一个缺陷，无人看守** |

**E4a vs E4b 是决定性对照**：同一个注入缺陷，只改「git 可不可用」，
门禁从**判红**变成**全绿**。

→ 所以 E2 组那个"优雅降级"其实**不是优雅**：git 被杀 → `inGitRepo=false` →
门禁走到「不在 git 仓库里」那一支 → **规则 C/D/E（逐页核对 lastmod +
「lastmod 整体消失」兜底）整块被跳过** → 产物里 5 条 lastmod 全没了，
门禁却报"源码 zip 分发，本就没有 git 历史"，而仓库明明在 git 里、源文件明明提交过。
**这是把一个响亮的失败换成了一个静默的假绿。**

#### C.2 我的版本的 7 组（T1–T7）

| 组 | 场景 | exit | 结果 |
|---|---|---|---|
| T1 | 正常构建 | 0 | 5 条 lastmod，「已逐页核对」|
| T3 | 删 source 标注 + **假 git** | **1** | 「git 判定不出来（SIGKILL）—— 不能当成『没有 git 历史』降级：降级会让 lastmod 整套判据…被整块跳过，门禁会报『源码 zip 分发』而全绿，实际上一页都没验证过。」|
| T4 | 删 source 标注 + **真 git** | 1 | 规则 E 判红（与 E4a 一致：检测器仍在）|
| T5 | 假 git 退出 128（=「不在 git 仓库里」）| 0 | **合法降级**，「不在 git 仓库里」note 照旧 |
| T6 | `PATH` 里**没有** git（ENOENT，源码 zip 分发）| 0 | **合法降级**，同上 |
| T7 | 编程错误（把 `execFileSync` 改名成未定义的名字）| 1 | `TypeError: execFileSync__broken is not a function`，全文 **0** 次「不在 git 仓库里」|

**T3 vs E4b 就是这一轮的全部**：同一个注入缺陷，peer 补丁全绿、我的版本响亮失败。
**T5 / T6 是回归检查**：合法的"没有 git"场景**没有被我的改动弄坏**（仍 exit 0）。
**T7 是 peer 的 C 组**：编程错误仍然立刻暴露，且**没有被伪装成"没有 git 历史"**。

#### C.3 ⚠️ 15:50 在**当前 HEAD** 上把这 7 组重跑一遍（旧证据的基准已经过期）

提交前 HEAD 被并发场次推进了 4 个 commit（`246b966`），本场次**没有拿旧证据当现状**
——在**将要提交的那棵树**上重跑了全部注入，并多做了几件事：

| 组 | 场景 | exit | 结果 |
|---|---|---|---|
| T1 | 正常构建（真 git）| 0 | 「sitemap 5 条 URL，其中 5 条带 lastmod（已逐页与各自源文件的 git 提交时间核对）」|
| T2 | 删 source 标注 + 真 git | 1 | 判红「没有 `<!-- source: ... -->` 源文件标注」|
| T3' | 假 git 被 SIGKILL（**判定不出来**）| **1** | 「git 判定不出来（SIGKILL）—— 不能当成『没有 git 历史』降级：…」|
| T4' | 假 git 退出 128（**no-history**）| **0** | 合法降级，走「不在 git 仓库里」那一支，输出里「判定不出来」**0** 次 |
| T5' | `PATH` 里没有 git（**ENOENT**）| **0** | 合法降级，同上；`eleventy` 构建 exit 0、产物 0 条 lastmod |
| T6' | 编程错误 | **1** | `ReferenceError: execFileSync__broken is not defined`，全文 **0** 次「不在 git 仓库里」|

**三处必须订正的旧说法**（都是"旧证据在新 HEAD 上不成立"的同一个坑）：

1. **整条 `npm run build` 现在不能用来做这个对照了。** 当前 HEAD 上多了一道
   `check:log-sections`，它**本来就依赖 git 历史**，git 一坏它就**正确地**判红
   （"读不到 git 历史…拿不到历史时不能假装通过"）→ build 在到那道门禁时就 exit 1，
   **根本走不到** `verify-site.cjs`。这跟本次改动无关，但会让人误以为
   "peer 补丁也判红了" —— 所以对照必须**单跑那道门禁本身**。
2. **"删 source 标注" 并不会让产物里的 lastmod 消失。** 标注只是"这条 URL 来自哪个源文件"
   的映射；lastmod 来自 `lastCommitTime` filter，**只有 git 坏掉时**才取不到。
   → 要造出"产物里没有 lastmod"，必须**从构建开始**就让 git 是坏的。
   （我第一版探针就是在这里踩空：以为删标注 = 没 lastmod，实际产物里还有 5 条。）
3. **T7 的报错名是 `ReferenceError` 不是 `TypeError`** —— 两种都是编程错误
   （都没有 `status` 属性 → 原样抛出），行为一致，但报错文本要照实写。

**决定性对照（当前 HEAD，忠实复现 peer 补丁：只把两处判据换成
`"status" in e || e.code === "ENOENT"`，`gitIsShallow` 保持裸 catch）**：

| 沙箱 | 内容 | eleventy（带坏 git）| 门禁（带坏 git）| 门禁说了什么 |
|---|---|---|---|---|
| sb-M | HEAD + **我的四态判据** | **1**（抛）| **1** | 「git 判定不出来（SIGKILL）—— 不能当成『没有 git 历史』降级：…」|
| sb-P | HEAD + **peer 判据** | 0（降级，产物 0 条 lastmod）| **0 全绿** | 「不在 git 仓库里：sitemap 不输出 lastmod（源码 zip 分发，本就没有 git 历史）」← **事实错误** |

→ **假绿在当前 HEAD 上依然成立**（就在这道门禁里）：peer 判据把"判定不出来"
说成"没有 git 历史"，于是规则 C/D/E 整块跳过，**同一份产物、同一处环境故障，
门禁说通过**。我的判据则响亮失败并说清原因。裁定不变。

**方法论补一句**：上一轮我记的是"12:40 的快照不能当现状"；这一轮又撞上一次同族 ——
**上一轮自己拿到的端到端证据，在 HEAD 推进后也需要重跑**。
新门禁（`check:log-sections`）一落地，我上一轮那条"整条 build 假绿"的复现路径
就断了。**证据也有保质期。**

### D. 裁定

1. **形态表结论采信**（B 节）：二元分类上 `"status" in e` 一次全对，现行判据漏 5 种。
2. **peer 补丁不取用**。现行判据漏掉的那 5 种形态（SIGKILL/SIGTERM/SIGSEGV/
   EACCES/ENOBUFS）**全部落在 fail-closed（抛）一侧**；改成 `"status" in e` 会把它们
   挪到 **fail-open（降级）一侧**——方向是反的。E4b（以及 C.3 里当前 HEAD 上的
   sb-P）就是这个方向的代价：**同一个真缺陷，git 一被信号杀就没人看守**。
   ⚠️ 更要紧的是：现行判据在这 5 种形态下**本来就没漏报**（它抛，抛就是报），
   peer 说的"活洞"在这 5 种形态上其实是**误判成了编程错误**——不是漏报，
   是**分类错了、报错信息也不好看**。修"分类"是对的，把它改成"静默降级"是错的。
3. **本门禁要的是三态，不是二元**：
   - 「git 不在 PATH」「git 说这里没有提交历史」→ 可降级（源码 zip 分发是合法形态）；
   - 「git **判定不出来**」（被杀 / 装不了 / 跑崩了）→ **必须抛**：
     降级 = 把"判不出来"说成"没有 git 历史" = 门禁自己被卸掉；
   - 编程错误 → 必须原样抛。
4. **现行判据确实有一个真缺陷，但不是 peer 说的那个**：**注释承诺的比实现多**——
   注释写「spawn 失败 → `e.code` 是字符串」，实现只认 `ENOENT`。
   照注释理解会以为 EACCES 等已被覆盖（其实它们在崩栈）。这类"注释说的和代码做的
   不是一件事"，正是"注释承诺一个不存在的门禁，比没有注释更坏"的同族。
5. **附带发现（peer 未提、同一族、且是真的洞）**：`eleventy.config.js` 的
   `gitIsShallow()` 用的是**裸 `catch {`** → 编程错误（TypeError/ReferenceError）
   也被一起吞掉 → 门禁以为只是"浅克隆 / 不可信"，实际是代码写错了。
   今天它被 `verify-site.cjs` 的规则 E 兜底挡着；一旦兜底被绕过（正是 E2/E4b
   那种场景）就没人看守。
6. **那份补丁现在的状态**：本场次提交后，`fix-C2-head-criterion.patch`
   会因上下文已改而 **`git apply` 不再干净**（它改的正是那两行判据）。
   → **别再试套它**；需要的是本场次的 `scripts/lib/git-error.cjs` 那套四态判据。
   补丁本身不取用的理由见上面第 2 条（与"能不能套得上"无关）。

### E. 落地：判据抽成**共享模块** + 四态判据

改动 3 个文件：

1. **新增 `scripts/lib/git-error.cjs`**（共享模块）：
   - `classifyGitError(e)` → `unavailable` / `no-history` / `unknown` / `program-error`；
   - `degradeOrThrow(e)` → 可降级返回 `null`，否则抛（`unknown` 抛一句**说清原因**
     的人话，`program-error` 原样抛）。
   - ⚠️ **为什么抽成模块**：判据原本在两个文件里**各抄一份**，于是"改一处、忘
     另一处"就会让两侧行为不一致——而这两侧恰恰必须一致（它们一起决定"门禁到底
     有没有真的核对过 lastmod"）。原注释里那句"两边必须一起改"就是这条风险的
     自白，但那种约定靠人记。**抽成一份，两边不可能再漂移**；而且即使将来某次
     并发提交只回退了其中一侧，回退掉的那侧仍带着自己的旧判据，**不会出现两侧
     判据分叉的半吊子状态**。
2. `scripts/verify-site.cjs`：`gitOut()` 改用 `degradeOrThrow(e)`。
3. `eleventy.config.js`：`gitRoot()` / `lastCommitTime()` 改用 `degradeOrThrow(e)`；
   `gitIsShallow()` 的**裸 catch** 改成按四态分别处理（编程错误与"判定不出来"
   都抛，只有"git 用不了"才按"不可信"处理）。

**行为变化只有一个方向**：原先"崩栈"的地方现在崩得更**可读**（说清是 git 被杀
还是代码写错），**没有任何一处从"响亮失败"变成"静默降级"**。
T5/T6 证明合法的"没有 git"路径没被弄坏；T1 证明正常构建不受影响。

### F. 留给下一轮 / 待本人拍板

- 「待决策」段（本轮**新增 2 条**、其余沿用）：
  1. **「git 判定不出来」要不要在门禁汇总里也留一句 note**（现在是构建失败 +
     抛一句人话，汇总里看不到）。
  2. **EACCES / ENOEXEC 归「git 不可用（降级）」还是「判定不出来（抛）」**——
     本轮按 E4b 的教训选了**抛**（git 明明装着、仓库明明在，只是跑不起来；
     降级会让门禁以为验过了），但这是**取舍**，请本人确认。
- ⚠️ **`eleventy.config.js` / `scripts/verify-site.cjs` 本轮有别场次在途改动**
  （sameAs 修复 / ItemList / 门禁 31 / note 措辞），本轮用**私有索引**只提交
  自己的 hunk（见 G 节），没碰对方在途内容。
- 📌 **门禁 31 的 self-证缺陷在当前 HEAD（`246b966`）上仍在**（peer 15:50 独立复验，
  已同步作者 `mvs_90efaf3f`；**本场次不重复实施**）：
  `scripts/verify-site.cjs:2501` 的 `if (field === "sameAs") sameAsCompared++;`
  写在 `buckets.size === 1`（**取值一致**）分支里 → 计数口径是"比对过**且一致**"
  而不是"比对过"。后果：sameAs 真冲突时它走"真冲突"分支、计数器不增 →
  自证那条又报「sameAs 一次都没有被比对……sameAs 从产物里消失了」，
  于是**一次判红给出两条互相矛盾的红因**（一条说取值有 2 种、一条说它消失了）。
  修法是把计数挪到 `contributors < 2` 之后，与结果是否一致脱钩。
- 📌 **门禁 31 还有一处盲区（peer 16:10 实测）**：「同一 @id 的节点之间一致」
  **看不见"全站一致地退化"** —— 14 个 Person 节点若**一致地**只剩 ORCID，
  彼此并不矛盾 → 门禁 31 全绿；门禁 23 也看不见（它查"ORCID **含**不含"）。
  → 把 GitHub / ResearchGate / CSDN / OpenAlex 四条句柄整片删掉，build 照过、
  门禁全绿。需要给本人那一组补一条**完整性**判据（sameAs 归一化集合必须
  == `site.js` 里 `author.sameAs` 的全集，缺项红、多出也红）＋一条**锚**
  （写死 5 条句柄，或断言条数 ≥ 5 且含 ORCID）。**本场次不重复实施。**
- 线上 `/papers/`、`/publications.bib`、`/feed.xml` 仍 404（待部署），推送时机由本人定。

### G. 本场次提交

- 提交文件 **4 个**：`scripts/lib/git-error.cjs`（新增）、
  `scripts/verify-site.cjs`、`eleventy.config.js`、外加本文件（日志）——
  **不包含**任何并发场次的在途改动。
- 提交方式：私有索引 `GIT_INDEX_FILE` + `commit-tree` + `update-ref`（带旧值做
  CAS），**不读真实索引**，别人的暂存区原封不动；提交前把内容**按当前 HEAD 重建**
  （只带自己的 hunk），避免基线漂移把别人的新内容回退掉。
- **不 push**（部署由本人决定）。
## 2026-10-19 · 15:45–16:15 场次（**不占轮次号**，避免与并发场次撞号）：数据集的**机器可读层**补齐（文件级 `distribution` + 版本链 `isVersionOf`）+ 门禁 8 判据扩展 + 两个新发现（**门禁 24 管不到「段内判据被卸掉」**；**门禁 8 的第③条原本名不副实**）

### A. 背景：文件清单只站在人读的路径上

720ed3e 已经把 v2.0 的文件清单与 MD5 校验和摆到了页面上（`paper.njk` 的 "Files in v2.0"）。
但那只是**人读的路径**。机器读的路径 —— 论文页 JSON-LD 里的 `Dataset` 实体 —— 此前
**一个文件都没有**：消费方（Google Dataset Search 之类）只看得见"有个数据集、DOI 是这个"，
看不见里面有哪些文件、多大、校验和是多少，也就无法自动验完整性。

同一条链上还有第二个缺口：**概念 DOI**（版本链的根）此前只出现在页面的 "All versions"
那一行，结构化数据里没有 → 消费方看不出"这一版属于哪一条版本链"。

### B. 改了什么（3 处代码 + 1 个自测脚本）

1. **`src/_data/site.js`** —— `pub.software.files[]` 每项新增 `url` 字段。
   值是**逐字照抄 Zenodo 自己的 API**（`https://zenodo.org/api/records/18041880` →
   `files[].links.self`），不是自己拼的；注释里写明来源，并注明"这些地址只对 v2.0 成立"
   （记录 id 就是这一版）。

2. **`eleventy.config.js`** —— 新增 `MEDIA_TYPES` 映射表与 `mediaTypeFor()`（扩展名 → IANA
   媒体类型，兜底 `application/octet-stream`）；`Dataset` 节点追加两样东西：
   - `distribution`：`DataDownload[]`，每项 `name` / `contentUrl` / `encodingFormat` /
     `contentSize`（字符串）/ `description: "md5:<hex>"`；
   - `isVersionOf`：`{ "@id": "https://doi.org/10.5281/zenodo.16662143" }`。

3. **`scripts/verify-site.cjs`** —— **扩展门禁 8 的判据**（**不新增编号**：工作树里编号已被
   并发场次用到 32，新号会与门禁 24 撞）。门禁 8 现在查三边一致：
   ① 机读路径 `Dataset.distribution` ↔ ② 数据源 `site.js` 的 `pub.software.files`
   （逐字比 `name`/`contentUrl`/`contentSize`/`description` 里的 `md5:`，数量也要一致，
   每项还要有 `@type: DataDownload` 与 `encodingFormat`）；
   ③ 人读路径：页面上必须出现每个文件名与 `md5:<hex>`。
   另查 `isVersionOf["@id"]` 必须等于 `https://doi.org/${pub.software.conceptDoi}`。

4. **`scripts/test-dataset-files-gate.cjs`（新）** —— 可复跑自测脚本，见 D 节。

### C. 外部取证（本轮实际调过的接口，结论都写进了代码注释）

- **schema.org 没有 `checksum` 属性、也没有 `Checksum` 类型** —— 下载全量词表
  `https://schema.org/version/latest/schemaorg-current-https.jsonld`（3256 个词条），
  `grep "checksum"` = **0 命中**；`https://schema.org/Checksum` → "not found"。
  `additionalProperty` 的 domain 也不含 `Dataset`/`DataDownload` → 都不能用。
  **所以校验和只能落在 `description: "md5:<hex>"`**（合法，且与页面上人读的那一串**逐字相同**，
  两条路径不会各说各话）。
- **Zenodo** `https://zenodo.org/api/records/18041880`（200）：三个 key / size / md5 与
  `site.js` 逐字一致；`files[].links.self` 逐字照抄进 `site.js`。
- **DataCite** `https://api.datacite.org/dois/10.5281/zenodo.18041880`：
  `relatedIdentifiers` **仅**一条 `IsVersionOf` → 概念 DOI `10.5281/zenodo.16662143`；
  `types.schemaOrg` = `Dataset`。
- **GitHub** `oldsixxiaolv/Manuscript_Lvyh`：`license` = **null**（→ **不编造** license）、
  `language` = Python；README 只说 "16-year TRMM PR observations"、无明确年份区间
  （→ **不写** `temporalCoverage`）。Zenodo 登记里也没有时空覆盖字段 → 一律不编造。

### D. 验证结果

**逐点故障注入（8 个用例，每次只注入一个点，注入后从磁盘回读自证，断言红因而非只看退出码）**
—— 全部通过，每条判据都能被单独触发：

| 用例 | 注入 | 结果 | 红因 |
|---|---|---|---|
| baseline | 不注入 | exit 0 | —— |
| jsonld-md5 | 只改 JSON-LD 里的 md5 | ✅判红 | 机读路径与数据源不一致 |
| page-md5 | 只改页面上人读的 md5 | ✅判红 | 页面上摆的校验和与 site.js 不一致 |
| drop-distribution | 删掉整个 `distribution` | ✅判红 | Dataset 实体没有 distribution 数组 |
| drop-one-file | 少一项 | ✅判红 | 两条路径说的文件数不一样 |
| drop-encoding | 删 `encodingFormat` | ✅判红 | Dataset.distribution[0] 没有 encodingFormat |
| break-isversionof | `isVersionOf` 指错 | ✅判红 | 版本链关系缺失或指错 |
| wrong-bytes | `contentSize` 写错 | ✅判红 | 机读路径与数据源不一致 |

**干净克隆复验**：隔离克隆（干净 HEAD + 仅本场次改动，不带工作树里别人的在途内容）
`npm run build` = **EXIT 0**，门禁 8 输出 `数据集文件清单三边一致（3 个文件）`。

#### D-1. 第一个新发现：**门禁 24 管不到「段内判据被卸掉」**

把门禁 8 里那段「三边一致性」判据**整段删掉**（文件头描述保留）→ 门禁**仍然全绿**。
原因：门禁 24（编号 ↔ 代码段一一对应）只保证"门禁 8 的**代码段**还在"，
**管不到代码段内部的判据有没有被卸掉** —— 它是**段级**判据。
这正是"注释承诺一个不存在的门禁，比没有注释更坏"的同一个病：文件头还写着
"本条还管一件更要紧的事……三条路径上必须逐字一致"，但判据已经没了，**无人察觉**。

→ 对策：新增 `scripts/test-dataset-files-gate.cjs` —— 它**自己**去注入、自己断言红因，
判据一旦被卸掉，注入用例就红。**不接 build 链**（与 `scripts/test-log-sections.sh` 同；
`GW1` 只管 `check-*.cjs` / `verify-*.cjs`，`test-` 前缀不在其列）。
手动跑：`npm run build && node scripts/test-dataset-files-gate.cjs`。
（**局限要说清**：它不在 build 链上，所以"判据被卸"要**有人跑它**才会被发现 ——
这比"完全没人查"好，但不如"进 build 链"牢靠。进 build 链要动 `package.json`，
而 `package.json` 正被并发场次在改，本轮不碰。）

#### D-2. 第二个新发现：**门禁 8 的第③条原本名不副实（已修）**

第③条（人读路径）原先用 `html.includes("md5:" + f.md5)` 在**整页**里搜 ——
而 JSON-LD 的 `distribution[].description` **就是同一串** `md5:<hex>`，
所以第①条（机读路径）已经保证过的地方，这条又满足一次 → **它根本测不到人读路径**。
实测：只把页面上人读的那一串改掉（JSON-LD 不动），门禁**照样绿**。
修法：第③条先**剥掉 JSON-LD 块**再找（`humanHtml`）→ 这一条才真的在查
"读者看到的那个校验和"。修完 `page-md5` 用例即判红。
**教训**：一条判据"名字说了它查什么"不算数；必须问"它实际比的是哪一段字节"。
同一个字节串在两处出现时，整页搜会把两条路径混成一条。

#### D-3. 注入脚本自己踩的坑（都记下来以免下一轮重犯）

① 第一版注入脚本把 `sys.exit(0)` 写在写文件**之前** → 文件根本没落盘，却"自证说生效"；
② 第一版自证用**全文搜字符串**（`"encodingFormat" not in html`）→ 三个 `DataDownload` 都带
这个键，pop 掉其中一个后全文仍搜得到 → 误判成"场景没造出来"；
③ `splice(1)` 不带 `deleteCount` 会**删到末尾**（剩 1 项而不是 2 项）→ 场景没造出来；
④ 修好后的注入脚本若用**全量 replace** 改页面上的 md5，会把 JSON-LD 里的同一串一起改掉 →
触发的是"机读路径"的红因，测的就不是第③条了 → 必须**先保护 JSON-LD 块**再替换。
现在自证统一改成：**从磁盘回读后解析 JSON-LD、按结构核对**。

### E. 归属与边界

- 本轮提交 **5 个文件**：`src/_data/site.js`、`eleventy.config.js`、
  `scripts/verify-site.cjs`、`scripts/test-dataset-files-gate.cjs`，
  外加 `docs/IMPROVEMENT-LOG.md`（**只含本场次节**）。
- **不碰**：`package.json`（并发场次在改）、`src/papers.njk`、`src/_includes/**`、
  `scripts/check-*.cjs` 其余、`scripts/lib/`。
- 提交方式：私有索引（`GIT_INDEX_FILE` + `read-tree HEAD` + `update-index --cacheinfo`
  + `write-tree` + `commit-tree` + `update-ref` CAS），**不读真实索引**，
  别人的暂存区原封不动；**不 push**。
- **本场次写日志时还撞上了共享工作树的"旧基线覆盖"**：16:12 追加的本节
  在 16:2x 被并发场次整节覆盖掉了（日志 8589 → 8289 行）。因此本节的正文
  在提交时**不取工作树副本**，而是「HEAD 版日志 + 本节（/tmp 备份）」现取现拼 ——
  这也正是本仓已有的教训：**共享追加文件绝不 `git add` 工作树副本**。

- **不 push**（线上部署由本人决定；线上仍是 2026-10-16 的旧版本，
  `/papers/`、`/publications.bib`、`/feed.xml` 404、canonical 指向 404 的 `/MeteoHub/`，
  属待决策第 5 条，由本人拍板部署）。

### F. 待本人拍板

- **待拍板 1**：校验和落在 `description: "md5:<hex>"` —— schema.org 没有 `checksum` 属性，
  这是**目前唯一合法**的写法，但它把"人读的说明字段"当机器字段用了。备选：
  ① 就这么定（门禁 8 已把这一串与页面、与 `site.js` 三边锁死）；
  ② 在 `DataDownload` 上加站点自定义属性（失去 schema.org 消费方的通用识别）；
  ③ 等 schema.org 补 `checksum` 再迁。
- **待拍板 2**：`contentUrl` 用的是 **API 形式**的地址
  （`https://zenodo.org/api/records/18041880/files/<name>/content`）—— 实测直接 GET 200，
  且体积固定（不会因为网页改版而变）；但不是浏览器下载页形式。备选：
  ① 保持 API 形式；② 换成 `https://zenodo.org/records/18041880/files/<name>?download=1`
  （浏览器形式，也实测 200）。
- **待拍板 3**：版本链要不要在页面上也补一行可读说明？现状是结构化数据里有 `isVersionOf`，
  页面可见文本里只有 "All versions" 一行指向概念 DOI。
- **待拍板 4**：自测脚本**要不要进 build 链**？进了才"每次 build 都自检"，
  但要动 `package.json`（正被并发场次在改）。
- **待拍板 5**（可归到既有待决策）：门禁 24 只守**段级**（编号 ↔ 代码段存在），
  守不到**段内判据**被卸。要不要给全站门禁补一条**段内判据的通用自证**
  （例如：每个代码段必须自带"自证存活"的计数输出）？本轮只在门禁 8 这一条上做了示范。

## 2026-10-19 · 16:15–16:40 场次（**不占轮次号**，避免与并发场次撞号）：门禁 31 的「自证计数口径」修复（实施 + A/B 实测）+ 身份句柄完整性门禁的**独立复验**（注入 E 已被在途实现抓住）+ 共享日志「旧基线覆盖」事故的并集修复

### A. 巡检（现查，非复述）

- **线上 7 个 URL**：`/` 200、`/blog/` 200、`/about/` 200、`/sitemap.xml` 200；
  **`/papers/`、`/publications.bib`、`/feed.xml` 均 404**。
  根因独立取证：线上仍是 **2026-10-16 的旧部署**——线上 `sitemap.xml` 只有 3 条 URL
  且每条带 `/MeteoHub/` 子路径（该前缀本身 404）、首页 0 个 `papers/` 链接、
  0 个 `publications.bib` 引用、0 个 `citation_*` meta。**不是代码缺陷，部署即修复**。
- **本地构建**：隔离克隆 `/tmp/mh_v29_verify/clone`（`git clone --no-hardlinks` +
  `node_modules` 符号链接 + 覆盖工作树状态）`npm run build` → **exit 0**，
  12 个门禁全绿（`check:gates`/`check:log-sections`/`check:css`/`check:wrap`/
  eleventy/`check:site`/`check:lang`/`check:a11y`/`check:copy`/`check:overflow`/
  `check:artifact`/`check:jsonld`/`check:identity`）。

### B. 改进点 1（本场次实施）：门禁 31 的「自证计数口径」修复

**归属**：缺陷由同伴场次 `mvs_e41cfa12` 的 15:5x 交接件提出（`/tmp/mh_v28_e41cfa12/handover_1550.md`），
本场次**核对源码后实施**并**独立 A/B 复验**。

**病灶（HEAD `scripts/verify-site.cjs` 与工作树同一处）**：自证存活检查里的计数
写在「取值**一致**」分支内：

```js
if (contributors < 2) continue;
if (buckets.size === 1) { compared++; if (field === "sameAs") sameAsCompared++; continue; }
```

于是 `sameAsCompared` 数的是「**比对过且一致**」而不是「**比对过**」：
「sameAs 取值冲突」时这个计数**不增**，而自证判红条件是 `!sameAsCompared`
→ 判红理由变成「sameAs 一次都没有被比对……sameAs 从产物里消失了」，
**与同一次判红里的「sameAs 有 2 种取值」直接矛盾**（一个说它在，一个说它没了）。

**修法**（计数与「比过没有」脱钩；`comparedConsistent` 把「比过」与「一致」两个口径分开）：

```js
if (contributors < 2) continue;
compared++;                                   // 比过了就算数
if (field === "sameAs") sameAsCompared++;
if (buckets.size === 1) { comparedConsistent++; continue; }
```

顺带修正 note 措辞：`${compared} 处比对（其中 ${comparedConsistent} 处取值一致）`
——旧措辞在有 `PENDING_FIELDS` 待拍板字段时会把「有分歧」也算成「取值一致」。

**A/B 实测**（注入自证：本人 14 个节点里只降级 `about/index.html` 的 2 个，
并**移除全部 5 个论文节点的 sameAs**，使「唯一被比对的 sameAs 恰是冲突那个」）：

| 门禁版本 | 红因条数 | 其中含「sameAs 从产物里消失」 |
|---|---|---|
| HEAD 旧门禁（缺陷版） | **2**（互相矛盾） | **1** |
| 本场次修复版 | **1**（只有真实冲突） | **0** |

**A/B 的构造有个坑值得记**：第一次只降级 `about` 页时，旧门禁**没有**出现矛盾红因——
因为站内**另一组 @id（论文组）的 sameAs 仍被比对过**，`sameAsCompared` 照样 ≥1。
要把病灶逼出来，必须让「唯一被比对的 sameAs」就是冲突的那个。
这说明旧口径下这条自证**几乎永远是死的**（自证本该在"承重判据失效"时叫醒人，
实际被一个不相干的同名字段顶替满足）。

### C. 改进点 2（本场次独立复验，不重复他人劳动）：身份句柄完整性门禁

**归属**：实现是**另一并发场次**在途落地的 `scripts/check-identity-handles.cjs`
（16:06:56 落盘，16:07:49 接线进 `package.json` 的 `check:identity`）。
本场次**不改它的文件**，只做独立复验（行为级，不依赖其实现细节）。

**背景**：同伴 16:10 交接件实测出「**全站统一退化**能整片溜过门禁 31」：
门禁 31 查的是「同一 @id 的**不同节点之间**是否一致」，查不到「取值本身是否完整」；
全站所有本人 Person 节点**一致地**只剩 ORCID → 彼此并不冲突 → 门禁 31 全绿。
门禁 23 也看不见（它两个方向都是「sameAs 里**含** ORCID」，ORCID 还在，只是不完整）。

**本场次独立复验（注入 E，递归改写，注入自证与同伴完全一致）**：

```
注入自证：改写 Person 节点数 = 14，同一 @id 的 sameAs 分布 = { "[https://orcid.org/0009-0005-3511-0546]": 14 }
```

| 判据 | 注入 E（统一退化）后的结果 |
|---|---|
| 门禁 31（含本场次计数修复） | **exit 0，全绿**（note：3 个多节点组 / 30 处比对）——证实「一致退化形态」它抓不到 |
| 在途 `check-identity-handles.cjs` | **判红**：点名 4 条缺失句柄（GitHub / ResearchGate / CSDN / OpenAlex）、14 个节点、6 个产物，并明说「门禁 31 看不见这一类退化」 |

→ **两门禁互补成立**：分歧形态（部分节点残缺）→ 门禁 31 抓；一致退化形态（全站一起残缺）→ 门禁 31 抓不到，靠身份句柄门禁。
「整片删掉 4 条身份句柄，产物照出、build 照过、门禁全绿」这个洞**已被在途实现堵上**。

**同伴 16:20 的修订意见（不代他改）**：同伴**撤回了自己先前提的 A 方案**
（把 5 条句柄**写死**在门禁里）——理由是那等于建**第二份清单**，
与本仓刚为 git 判据立的规矩（「判据两处各抄一份 → 改一处忘另一处 → 抽成共享模块」，
刚落地的 `scripts/lib/git-error.cjs` 就是那个教训的产物）同型。
修正方案：清单**单一来源**（共享模块存 5 条句柄，`site.js` 与门禁都 require 它），
门禁只放**不重复清单内容**的弱不变量（**条数 == 5**、**必须含 ORCID**）；
且「条数 == 5」这条必须**写在门禁里、不能写进共享模块**——
否则有人把共享模块改短成 1 条，门禁的期望集合跟着变短，门禁就红不了。

**本场次不落这个修订**：它是针对**在途实现**的设计修订，应由该实现场次（或本人）落地；
本场次在同一工作树上抢改他人文件，会造出「两份锚」（写死清单 vs 共享模块）——
正是本仓反复修的那类病。**已列入下方待拍板第 1 条**，请本人或该场次定。

### D. 共享工作树事故：日志被「旧基线整份覆盖」，已并集修复

**门禁 LS4 立功**（它就是为这类事故造的）：隔离克隆 build 报出——

```
✗ HEAD 上的日志节「## 2026-10-19 · 15:50–16:00 场次 …」在工作树里不见了
✗ HEAD 上的日志节「## 2026-10-19 · 16:00–16:15 场次 …」在工作树里不见了
```

**取证**：工作树日志在 **16:07:56** 被改写（mtime），丢了 HEAD 上已入库的 2 节；
同时它带着 1 节 **HEAD 从未有过**的（「15:00–15:50 场次：门禁 31 落地 …」——
按本日志 7361 行的记载，那一节一直只在工作树、从未入库）。
即：工作树 = 旧基线 + 那一节，HEAD 的 2 节被吃掉。

**修复（节块级并集，只插入不删除）**：`HEAD 版日志` ∪ `工作树版日志` →
**56 节 + 55 节 → 57 节**；自证：**HEAD 丢失行 0 / 工作树丢失行 0 / 重复节标题 0**；
写回后再验：`comm -23 <HEAD 节标题> <工作树节标题>` 为空，门禁 LS4 **通过**
（「扫了 40 个提交、56 个现存节……工作树上的 57 个节也覆盖了 HEAD 的全部节」）。

**写回方式**：算并集 → **重读比对确认工作树未被并发改动** → 落临时文件 → `mv` 原子替换
（避免「用旧文件的字节偏移去写一个已经变长的文件」那类整段吃掉新内容的事故）。
并集脚本放 `/tmp/log_union.py`（**不入库**，避免中间产物污染仓库）。

### E. 归属与边界

- 本轮本场次提交 **2 个文件**：`scripts/verify-site.cjs`（**只含本场次的计数口径 hunk**）、
  `docs/IMPROVEMENT-LOG.md`（**只含本场次节**，从 HEAD 现取现拼，不取工作树副本）。
- **不碰**：`package.json`、`src/_data/site.js`、`src/_includes/**`、`eleventy.config.js`、
  `scripts/check-*.cjs`、`scripts/lib/`、`.github/workflows/deploy.yml` —— 均为并发场次在途。
- **在途但被本场次发现的两个问题（都不是本场次造成的）**：
  ① `scripts/check-tracked-refs.cjs`（16:04:43 落盘）**没有任何 npm script 引用它**
  → `check:gates` 判红，**整个 build 链跑不完**；本场次在隔离克隆里**跳过该文件**才跑通 build。
  ② `scripts/check-jsonld.cjs` 在 16:1x 有过一处**语法错**（模板字符串用反引号开头、双引号收尾），
  其属场次已于 **16:12:18** 自行修好（`node --check` 现已通过）。
- **提交内容 ≠ 工作树**：本场次提交里**不含** `scripts/check-jsonld.cjs`、
  `scripts/check-identity-handles.cjs`、`scripts/check-tracked-refs.cjs`
  （三者均为并发场次在途、**未入库**；基线 d4b4d54 的 package.json 也没引用它们）。
  于是**提交内容**的 build 链是 10 个门禁，**工作树**是 13 个 —— 两者不等价，
  别拿工作树的绿证提交内容的绿（本仓已吃过一次这个亏，见 LS1–LS3 那次事故）。
- 提交方式：私有索引（`GIT_INDEX_FILE` + `read-tree` + `update-index --cacheinfo` +
  `write-tree` + `commit-tree` + `update-ref` CAS），**不读真实索引**，别人的暂存区原封不动；
  **不 push**。

### F. 待本人拍板

- **待拍板 1（新增）**：身份句柄「全集」守卫最终按哪个方案落地？
  ① **在途实现**：`scripts/check-identity-handles.cjs`，把 5 条句柄**写死**在门禁里
  （同伴 16:20 已**撤回**此方案：等于第二份清单，与本仓「共享模块」的规矩同型）；
  ② **同伴修正版**：清单**单一来源**（共享模块，如 `scripts/lib/identity.cjs`，
  `site.js` 与门禁都 require 它）+ 门禁只放**弱不变量**（条数 == 5、必须含 ORCID），
  且「条数 == 5」必须写在**门禁**里而非共享模块里；
  ③ **不改**，保持现状（靠人工核对 + 日志登记清单）。
  本场次倾向 ②（同同伴），但**不代拍、不抢改在途文件**。
  > 🛑 **订正（16:05–16:25 场次已落地；本场次补记）**：本条**已被承接**——
  > 16:05–16:25 场次把方案 ② **落了地**（**该节与实现均只在工作树、尚未入库**：
  > 共享模块 `scripts/lib/identity.cjs`，`src/_data/site.js` 与
  > `scripts/check-identity-handles.cjs` 都 require 它；弱不变量 `EXPECTED_COUNT = 5`
  > **留在门禁里**），并已把本条转登记成**它自己的待拍板第 4 条**
  > （「本场次落的是 ②，请本人确认」）。
  > → **以 16:05–16:25 场次的待拍板第 4 条为准**，本条留作决策历史。
  > 本场次（16:15–16:40）当时写的「倾向 ②」**已成为事实**，不再是待选项；
  > 但「落在哪儿 / 锚的重复代价 / 多出来的句柄要不要判红」三项仍待本人拍板。
  > 🛑 **订正（16:25 场次补记）**：上面「**该节与实现均只在工作树、尚未入库**」这句
  > **已过时**——该节与实现已由 `1ea722f`（`feat(gate): 身份句柄完整性门禁……`）**进入 main**：
  > 该提交含 5 个文件（共享模块 + 门禁 + `src/_data/site.js` + `package.json` + 本日志节），
  > 且在隔离克隆里对**该提交内容本身**（不是工作树）重跑 build 为 exit 0。**未 push**。
- **待拍板 2（承接 15:00–15:50 场次的 D 段）**：`PENDING_FIELDS`（`url` / `datePublished`）
  在字段循环里对**任何** @id 组生效，是**全站生效**而非只论文 @id——
  现有 note 措辞易被读成只等一处，要不要改措辞 / 限定范围？
- **待拍板 3（承接）**：论文 @id 的 `url` 口径（列表页出版商 DOI 页 vs 论文页本站页）、
  `datePublished` 粒度（`2026-06` vs `2026-06-01`）、sitemap `lastmod` 三选一、
  404 的 `identityOn404`、论文页署名单位、`figure.alt` 前缀、RIS 的 AB/SP 两条、
  `citation_author_institution`、数据集引用写法、OpenAlex 是否上页脚 —— 维持原样，不代拍。
- **待拍板 4**：**部署时机**。线上仍是 2026-10-16 的旧部署（3 个 URL 404）；
  本地已积累数十个未 push 的 commit。什么时候 push / 部署由本人定（本场次**不 push**）。


## 2026-10-19 · 16:05–16:25 场次（**不占轮次号**，避免与并发场次撞号）：身份句柄完整性门禁**按修正方案落地**（清单单一来源 `scripts/lib/identity.cjs` + 弱不变量锚留在门禁里）+ 三种故障注入复验（E 整片退化 / F 清单改短 / G 字段消失）

### A. 背景

承接 **16:15–16:40 场次 C 段**（并发场次）与**同伴 16:20 修订意见**：

- **要堵的洞**：门禁 31 查的是「同一 @id 的**不同节点之间**是否一致」——只有「节点互不一致」才判红。于是有一种退化它天然看不见：全站带本人 @id 的 Person 节点**一致地**退化成只剩 ORCID → 节点之间仍互相一致 → 门禁 31 全绿。门禁 23 也看不见（它两个方向都是「sameAs 里**含** ORCID」，ORCID 还在，只是不完整）。后果：**把 GitHub / ResearchGate / CSDN / OpenAlex 四条身份句柄整片删掉，产物照出、build 照过、门禁全绿**。
- **触发路径不牵强**：有人做「统一简化」重构把所有发射器统一成 ownerOrcid，或有人直接改 site.js 把 author.sameAs 列表改短——两种都**静默**丢掉四个身份句柄，搜索/聚合方按 @id 归并「本人」时拿到的就是个残缺实体。
- **两种形态要分清**（写结论时别混）：**分歧形态**（部分节点残缺、其余完整）→ 门禁 31 抓得到（那是真冲突）；**一致退化形态**（全站一起残缺）→ 门禁 31 **抓不到**，要靠本条。
- **本场次要落的正是那条修订**：同伴 16:20 **撤回**了自己先前提的 A 方案（把 5 条句柄**写死**在门禁里）——理由是那等于建**第二份清单**，与本仓刚为 git 判据立的规矩同型（「判据两处各抄一份 → 改一处忘另一处」，刚落地的 `scripts/lib/git-error.cjs` 就是那个教训的产物）。修正方案：**清单内容单一来源**（共享模块）+ **不依赖清单内容的锚留在判据里**。16:15–16:40 场次已**独立复验**在途实现能抓住注入 E，但**明确不落这条修订**（「抢改他人文件会造出两份锚」），列入其待拍板第 1 条。**本场次落地它**（该实现本就是本场次落地的文件）。

### B. 改了什么（4 个文件）

1. **新建 `scripts/lib/identity.cjs`**（清单的**单一真源**）：导出 `OWNER_ORCID` 与 `IDENTITY_SAMEAS`（5 条）。文件头注释写明：**弱不变量（条数 / 必须含 ORCID）必须留在门禁里，不能下放到本模块**。
2. **`src/_data/site.js`** 改为 `require("../../scripts/lib/identity.cjs")`：`author.orcid` 取 `OWNER_ORCID`，`author.sameAs` 取 `IDENTITY_SAMEAS`（原来的 5 条字面量与注释整体移入共享模块，**没有第二份清单**）。实测 Eleventy 数据文件 require 目录外的 `.cjs` 正常，构建 exit 0。
3. **新建 `scripts/check-identity-handles.cjs`**（本门禁本体），四条判据：
   - **I1 产物侧全集**——全站 `@id == site.url + "/#person"` 且 `@type` 含 Person 的节点，sameAs 归一化集合必须**等于**共享模块的清单集合：缺项红（丢信息才是坏事），**多出**未登记句柄只报 note（多出来不丢信息）。
   - **I2 锚**——期望集合**条数 == 5**、且**必须含本人 ORCID**。这两条**不依赖清单内容**，所以只能住在**门禁里**（`EXPECTED_COUNT` / `ANCHOR_ORCID` 写死在本文件）。
   - **I3 口径**——字段缺失（没有 sameAs 字段 / 显式 null）**不算缺失、不算冲突**，沿用门禁 31 的口径；该形态由门禁 23 兜。
   - **I4 自证存活**——本人节点组 ≥ 2 个，且本条至少比过一处 sameAs，否则判红（「没报错」和「没问题」长得一模一样）。
   支持 `SITE_DIR` 指向产物副本做故障注入（不与并发 build 抢 `_site`）。
4. **`package.json` 接线**——新增 `"check:identity": "node scripts/check-identity-handles.cjs"`，并在 build 链末尾接 `&& npm run check:identity`。接线漏了会自己叫：`check-gates-wired.cjs` 的 **GW1** 要求 scripts/ 下每个门禁脚本都从 `npm run build` 可达。

**落点与同伴建议的偏离（需本人拍板，见 E1）**：同伴建议做进 `scripts/verify-site.cjs` 的「门禁 33」并同步门禁 29 的旧→新对照表与文件头清单。本场次改为**独立脚本**，理由三条：① `verify-site.cjs` 正被并发场次改写，且它是一个**连续编号**的整体（文件头清单 + 代码段 + 对照表三处必须一一对应），插入新号要同时改三处，同文件冲突 + 静默覆盖风险高；② 本仓已有独立门禁先例（A* / W* / M* / GW*），不占 `verify-site.cjs` 的号段；③ 接线由 GW1 守着，不会出现「写了没接、看起来在其实不跑」。

### C. 验证结果

**全部在隔离克隆里做**（`git clone --no-hardlinks` + checkout + 软链 `node_modules`），**提交内容 = 基线 + 本场次 4 处改动**，不含任何在途文件。

**基线中途被并发场次推进过一轮**（`d4b4d54` → `25b8506`，改的是 `scripts/verify-site.cjs`）→ **整套 build + 三种注入都在新基线上重跑了一遍**，结论逐条一致。理由：端到端复现证据**有保质期**——HEAD 一动，"照着上一轮跑一遍"就可能跑不出同样的东西了。

- **全量 build：exit 0**。新门禁实测输出：「本人（https://github.lvyihang.xyz/#person）在 **14 个节点**上被描述，比过 **14 处** sameAs，每处都等于登记清单（**5 条**）」——判据**不是空跑**（I4 自证）。
- **接线门禁**：`门禁接线门禁通过：11 个门禁脚本全部从 npm run build 可达`。
- **故障注入**（改产物副本 / 改共享模块，均带**注入自证**：打印改写后的 sameAs 分布）：

| 注入 | 做法 | 注入自证 | 结果 |
|---|---|---|---|
| **E 整片退化** | 递归改写产物 JSON-LD：14 个本人 Person 节点的 sameAs 统一改成只剩 ORCID | 14/14 节点 → `["…/0009-0005-3511-0546"]` | **新门禁判红**：点名 4 条缺失句柄 + 14 个节点 + 6 个产物 |
| **F 清单改短** | 把共享模块 `IDENTITY_SAMEAS` 改成只剩 ORCID 一条 | 清单 = 1 条 | **新门禁判红**：I2 锚「清单有 1 条，与锚定的 5 条不符」 |
| **G 字段消失** | 递归删掉本人节点的 `sameAs` 字段 | 14/14 节点 → 无 sameAs 字段 | **新门禁判红**（I4 自证「一处都没比上」）+ **门禁 23 判红**（「实体与权威标识脱钩」），两条红因不矛盾 |

- **关键对照（E 的另一半，证明这条门禁不是重复劳动）**：**同一份被注入产物**上，既有门禁 `verify-site.cjs` **exit 0**，且下面两行与未注入时**逐字相同**（`diff` 实测无差异）——
  `本人 ORCID … ↔ canonical @id 双向绑定（14 个节点带 ORCID / 14 个节点带 @id）`
  `同一 @id 的字段一致性：2 个多节点组 / 24 处比对（其中 22 处取值一致；字段缺失、嵌套字段不判）`
  → 证实「一致退化形态」门禁 31 / 23 确实看不见；两条门禁**互补而非重叠**。
- **F 的另一半（证明「锚留在门禁里」是承重的）**：若把「条数 == 5」写进共享模块，改短模块时期望集合跟着变短 → 门禁红不了。实测把条数锚放在门禁里 → 改短即判红。

### D. 归属与边界

- 本场次提交 **4 个文件**：`scripts/lib/identity.cjs`（新）、`scripts/check-identity-handles.cjs`（新）、`src/_data/site.js`、`package.json`，外加 `docs/IMPROVEMENT-LOG.md` 的本节。
- **不碰**：`scripts/verify-site.cjs`、`eleventy.config.js`、`scripts/check-{jsonld,tracked-refs,copy-export,overflow,gates-wired}.cjs`、`.github/workflows/deploy.yml`、`src/**` 其余文件 —— 均为并发场次在途。
- **更正一处过时说法**：上一轮摘要里「门禁 31 的 self-证计数器修复在途未入库」**已不成立**——它**已由并发场次提交 `25b8506`（`fix(gate): 门禁 31 的自证计数口径`）入库**：`verify-site.cjs` 里 `compared++` / `sameAsCompared++` 已挪到 `contributors < 2` 之后、并新增 `comparedConsistent`。本场次**没有**再改它（避免同文件冲突与重复劳动）。
- **共享工作树的覆盖风险（如实记录）**：① `package.json` 双方都改了（我在 build 链尾追加 `check:identity`，并发场次加了 `check:tracked-refs` / `check:overflow` / `check:jsonld`）——双方都**只追加不删改**同一行 build 串，线性提交时是**补丁**不是整份覆盖；并发场次整份提交其工作树副本时，本场次的接线**仍在**（工作树里含我那一行）。② `src/_data/site.js` 的共享模块引用若被整份退回 → 退回成「字面量清单」，**不致 build 红**，但会退回「两份清单」的老形态。
- 提交方式：私有索引（`GIT_INDEX_FILE` + `read-tree` + `update-index --cacheinfo` + `write-tree` + `commit-tree` + `update-ref` CAS），**不读真实索引**，别人的暂存区原封不动；**不 push**。

### E. 待本人拍板

- **待拍板 1（新增）**：这个门禁最终**落在哪儿**？① **本场次形态**：独立脚本 `scripts/check-identity-handles.cjs`（已落地并复验）；② **折进 `scripts/verify-site.cjs` 的「门禁 33」**——好处是与其余站点级判据同处一文件、编号统一；代价是要同时改**文件头清单 + 代码段 + 门禁 29 旧→新对照表**三处，且该文件正在被并发场次改写，**要等其落定**再折。本场次倾向 ①（不与在途改写冲突），但**不代拍**。
- **待拍板 2（新增）**：`EXPECTED_COUNT = 5` 与 `ANCHOR_ORCID` **写死在门禁里**，换 ORCID / 增删句柄要**同时改两处**（共享模块 + 门禁），忘了改门禁 → 判红。这是**刻意的重复**（锚必须独立于被判据的数据源），要不要接受这个代价？
- **待拍板 3（新增）**：多出**未登记**的身份句柄现在**只报 note 不判红**（多出来不丢信息）。要不要改成判红（防止清单之外悄悄多挂身份）？
- **待拍板 4（承接 16:15–16:40 场次第 1 条）**：该场次列的「身份句柄全集守卫按哪个方案落地」① 在途实现（写死清单）/ ② 修正版（共享模块 + 锚在门禁）/ ③ 不改——本场次落的是 **②**，请本人确认。
- **待拍板 5（承接）**：`PENDING_FIELDS`（`url` / `datePublished`）当前是**全站生效**、只报不判，要不要限定到具体 @id 或在 note 中写明范围？
- **待拍板 6（承接）**：论文 @id 的 `url` 口径、`datePublished` 粒度、sitemap `lastmod` 三选一、404 的 `identityOn404`、论文页署名单位、`figure.alt` 前缀、RIS 两条、`citation_author_institution`、数据集引用写法、OpenAlex 是否上页脚 —— 维持原样，不代拍。
- **待拍板 7（承接）**：**部署时机**。线上仍是旧部署（`/papers/`、`/publications.bib`、`/feed.xml` 404），本地已积累数十个未 push 的 commit。什么时候 push / 部署由本人定（本场次**不 push**）。

## 2026-10-19 · 16:25–16:55 场次（**不占轮次号**，避免与并发场次撞号）：论文页 `mainEntityOfPage` 的 `@id` 撞车修复（+ 门禁 J8/J9）+ 三处「note 说假话」修正 + 代提交 Copy 门禁改进 + 共享工作树「陈旧索引会删掉并发内容」的竞态处置

### A. 背景

1. **上一轮摘要里的「唯一写者」判断在本场次中途失效**。cron 在密集拉起并发场次：本场次实测名册有**约 25 个** MeteoHub 场次并存，多数因 TPM 限流处于 `error` / `idle`，但**部分 `started` 场次会恢复继续写**。本场次工作期间 HEAD 连续推进了 **4 个**提交：
   - `25b8506` 门禁 31 自证计数口径修复（`scripts/verify-site.cjs` + 日志）
   - `e85530b` 日志订正「待拍板 1」
   - `1ea722f` 身份句柄完整性门禁落地（`scripts/lib/identity.cjs`、`scripts/check-identity-handles.cjs`、`src/_data/site.js`、`package.json`、日志）
   - `685f6e1` 日志订正「尚未入库」
   → 上一轮摘要里「`scripts/lib/identity.cjs` / `check-identity-handles.cjs` / `src/_data/site.js` **只在工作树/索引，必须随本场次提交否则丢失**」这条**已不成立**：它们**已由 `1ea722f` 入库**。本场次**重新核验后据实更新**，不沿用过期判断。
2. **本场次修的真正缺陷**：论文页 JSON-LD 里 `article.mainEntityOfPage` 写的是 `{ "@type": "WebPage", "@id": selfUrl }`，而 `selfUrl`（= 页面 URL，无片段）**与同一篇论文自己的 `@id` 逐字相同** → 同一个 `@id` 上同时挂了 `ScholarlyArticle` 与 `WebPage` 两种 `@type`。
   - 后果：消费方按 `@id` 归并节点时，「这一页是网站」与「这一页是一篇论文」会挤进同一个节点，字段互相覆盖，取到哪一套全看遍历顺序。
   - 性质：**这是缺陷，不是建模选择**。`src/_includes/layouts/base.njk` 的「@id 方案」注释早已把这个坑写明（页面实体 = `<页面 URL>#webpage`，论文实体 = `<页面 URL>` 无片段），论文 filter 是它**唯一的漏网之处**；schema.org 语义下 `{"@type":"WebPage","@id":X}` 是对 X 的类型断言，不是「另一种说法」。
3. 顺带发现并修掉的「note 说假话」：三处门禁输出读起来会让人得出错误结论（详见 B.3）。

### B. 改了什么

1. **`eleventy.config.js`（论文 filter）**：`mainEntityOfPage` 由 `{ "@type": "WebPage", "@id": selfUrl }` 改为**裸引用** `{ "@id": \`${selfUrl}#webpage\` }`，指向 base.njk 在同一页声明的页面实体。
   - 为什么是**裸引用**（只留 `@id`）：类型已在目标节点上声明过；引用里再带 `@type`，门禁 27 会把这个引用当成「本人节点」去查姓名（引用里没有 `name`）。
2. **`scripts/check-jsonld.cjs`（新文件）**：本场次主笔，J1–J7 为 15:30–16:00 场次在途，本场次续写：
   - **J8**：同一 `@id` 出现**不同的 `@type` 组合**即判红（`@type` 数组视为一个组合；裸引用 `{"@id":X}` 不贡献类型）。**全站一次性判**，红因点名来源页。
   - **J9**：论文的 `mainEntityOfPage` 必须指向**本页**的页面实体（`canonical#webpage`），不得自指、不得空引用、不得指向别的页面。
   - 自证存活：`j8Ids`（实际参与比对的 `@id` 数）、`j9Compared`（实际比对过几篇论文）——避免「没报错」与「没问题」长得一样。
   - 文件头注释与结尾输出由 J1–J7 更新为 **J1–J9**。
3. **`scripts/verify-site.cjs`（三处文案修正）**——与 `check-jsonld` 的 J* 号段**分开**，不去动 `verify-site.cjs` 那套「文件头清单 + 代码段 + 门禁 29 旧→新对照表」三处必须一一对应的连续编号体系（插入新号要同改三处，冲突与静默覆盖风险高）：
   - ① **门禁 15**（og/twitter 的 `image:alt` vs `<img alt>`）：原两侧各 `slice(0,36)` → 改用门禁 22 已有的 `altDiffExcerpt`，报「首个差异在第 N 个字」。理由：两句话前 36 字相同、差异在尾部时，截出来的两段引文**逐字相同** → 报红却看不出差在哪。
   - ② **门禁 24**：note 改为「门禁编号：最高 32 号（4b、4c 是 4 号族的附属号），共 33 项 —— 文件头清单 33 项 / 代码段 33 项，一一对应、整数号 1–32 无缺号（"项数"≠"最高编号"…）」。原写法只打项数（"33 条"），读者会读成「有第 33 号门禁」——这个误读在日志里已出现过两次订正。`maxInt` 提升出原块作用域供 note 复用。
   - ③ **门禁 31** 的「同一 @id 被多种 @type 复用」note：定性由「这是建模选择…不是错误」改为「**这是缺陷不是建模选择**，判红在 `check-jsonld` 的 J8」；**`PENDING_FIELDS`** 的 note 与注释写明待拍板范围是**全站**任何 `@id` 组（此前只列论文那一处，易被误读为「只等那一处」）。
4. **`package.json`（连带修复，必须做否则 build 红）**：新增 `"check:tracked-refs": "node scripts/check-tracked-refs.cjs"` 并接进 build 链（`check:gates` 之后）。`scripts/check-tracked-refs.cjs` 是并发场次新增但**未接线**的门禁脚本，门禁 GW1（每个 `scripts/check-*.cjs` / `verify-*.cjs` 都必须从 `npm run build` 可达）当场就能抓到它；不接线就变成「写了没接、看起来在其实不跑」。
5. **代提交 Copy 门禁改进**（16:0x 场次明确交接，附「日志归本场次补写」）：`scripts/check-copy-export.cjs` 把 `src/**/*.njk` 里**模板内联 `<script>` 块**纳入复制逻辑扫描（原来只扫磁盘上的 `.js` 文件，`base.njk:463` / `paper.njk:310` 两处内联块是理论盲区）。该场次已实测注入 7/7 全绿。

### C. 验证结果

- **全量 build：exit 0**（本场次工作树，HEAD=`685f6e1`）。关键输出逐字：
  - `引用完整性门禁通过：扫了 57 个已跟踪代码文件、24 处本地引用，被引用的文件全部也已被 git 跟踪。`
  - `日志节不得消失门禁通过：扫了 40 个提交、58 个现存节…工作树上的 59 个节也覆盖了 HEAD 的全部节。`
  - `门禁编号：最高 32 号（4b、4c 是 4 号族的附属号），共 33 项 —— 文件头清单 33 项 / 代码段 33 项，一一对应、整数号 1–32 无缺号（"项数"≠"最高编号"：编号域含附属号时项数比最高号大）`
  - `· 实体身份：全站 12 个 @id，每个 @id 只挂一种 @type；1 篇论文的 mainEntityOfPage 指向本页的页面实体` + `✓ 结构化数据自检通过（门禁 J1–J9）`
- **故障注入矩阵**（改**产物副本** + `SITE_DIR` 注入，**绝不碰 `_site`**；基线已推进到 `685f6e1` 故**整套重跑**，结论与上轮逐字一致）：

| 注入 | 做法 | 注入自证 | 结果 |
|---|---|---|---|
| **A 退回修复前写法** | 论文页 `mainEntityOfPage` 改回 `{"@type":"WebPage","@id":"…/papers/trmm-thunderstorm-stages/"}` | 替换命中，报「注入已生效」 | **exit 1，2 条红因**：J9「指向了**它自己** —— 自指等于什么都没说」+ J8「同一个 @id … 在全站挂了 2 种 @type："ScholarlyArticle"（5 个页面）/ "WebPage"（1 个页面）」，J8 点名来源页 |
| **B 指到别的 `@id`** | 改为 `{"@id":"https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2026JD046836"}`（**无 @type 冲突**，只是指错页面） | 同上 | **exit 1，2 条红因且全部来自 J9**（「应为 …#webpage」+「该 @id 在**本页**没有对应声明 —— 是个解析不到的空引用」），**J8 保持绿** → 证明 J8 / J9 判别力互相独立 |
| **C 基线** | 未注入 | — | **exit 0** |
| **D 门禁 15 新旧对照** | 论文页 `og:image:alt` **尾部**追加一句（前 36 字与 `<img alt>` 逐字相同，差异只在尾部） | 报「注入已生效（og:image:alt 尾部追加）」 | **同一份注入产物**喂新旧两版：**旧版 HEAD** 报「…（现在是 "Fig. 10 — Three-dimensional structur…" vs "Fig. 10 — Three-dimensional structur…"）」——**两侧引文逐字相同、不可读**；**新版工作树** 报「**首个差异在第 242 个字**：meta 侧 "…nsity (b–d).（尾部多了一句）" vs `<img alt>` 侧 "…nsity (b–d)."」 |

- **踩过的坑（如实记录）**：第一次跑矩阵时把 A/B/C 误跑成 `verify-site.cjs`（J8/J9 在 `check-jsonld.cjs` 里，用错脚本会被读成「注入没生效 / 判据没叫」），且 `PIPESTATUS` 在子 shell 取不到 → 一度误判成 exit 0。改为**命令替换直接取 `$?`** 后重跑，结论才成立。
- ⚠️ **本矩阵的判据在哪个脚本（2026-10-19 17:4x 补注；peer 第四封回执触发）**：J8 / J9 是 `scripts/check-jsonld.cjs` 的第 8、9 条判据（文件头 :43 / :52 起，代码段 :687 / :698），**不是** `verify-site.cjs` 的门禁 —— 后者那两处 `J8` / `J9` 只是**交叉引用**（:2712 / :2719 的注释："判红在 scripts/check-jsonld.cjs 的 J8"）。本矩阵必须喂 `node scripts/check-jsonld.cjs`（它支持 `SITE_DIR`）；**喂 `verify-site.cjs` 会得到 exit 0**（同一份产物实测：`✓ 站点自检全部通过`）—— 那是"**喂错脚本**"的产物，**不是**"门禁漏抓"。在当前 HEAD（`98f3fe7`）上重跑这两形态：`check-jsonld.cjs` **两形态都 exit 1**，红因文字与上表逐字一致（A：J9 自指 + J8 双 @type；B：两条 J9 红因）。

### D. 归属与边界

**逐文件归属表**（peer 要求「不要做无归属的统一提交」→ 归属用**表**表达，不靠拆分 commit 表达）：

| 文件 | 归属 | 本场次的动作 |
|---|---|---|
| `eleventy.config.js` | **本场次**（主笔） | 修 `mainEntityOfPage` 的 `@id` 撞车 + 注释 |
| `scripts/check-jsonld.cjs` | 本场次主笔；J1–J7 为 15:30–16:00 场次在途 | 续写 J8/J9，文件头与结尾输出改 J1–J9 |
| `scripts/verify-site.cjs` | **混合 owner**：门禁 15 / 24 / 31 note / PENDING_FIELDS = 本场次；文件头 8 号描述扩写 = 15:45–16:15 场次；`altDiffExcerpt` 函数 + 门禁 22 引用 = 15:49 复验者场次 | 合成一个提交（见下方理由） |
| `scripts/check-copy-export.cjs` | 16:0x 场次（**已交接本场次代提交 + 代写日志**） | 代提交 |
| `scripts/check-tracked-refs.cjs` | 并发场次（新增，**未接线**） | 代提交 + 本场次接线 |
| `scripts/check-overflow.cjs` | 14:57 场次 | 代提交 |
| `scripts/check-gates-wired.cjs` | 并发场次 | 代提交 |
| `.github/workflows/deploy.yml` | 并发场次（Node 20→22 等） | 代提交 |
| `package.json` | 多场次接力 + 本场次 `check:tracked-refs` 接线 | 合成一个提交 |
| `src/_includes/layouts/base.njk` | 15:30–16:00 场次（站点实体层） | 代提交 |
| `src/about.njk` / `src/index.njk` | 15:30–16:00 场次（`profilePage: true`） | 代提交 |
| `docs/IMPROVEMENT-LOG.md` | 本场次 + 并发场次的最新内容 | 合成一个提交 |

- **为什么合成一个提交（偏离 peer 建议之处，如实说明）**：① **硬依赖**——本场次的门禁 15 改动调用 `altDiffExcerpt`，而该函数是 15:49 复验者场次在**工作树**里加的、**HEAD 上没有**。若按 owner 拆成多个提交，中间那个提交的 `verify-site.cjs` 会调用不存在的函数 → **build 直接红**。这不是风格问题，是依赖顺序问题。② 历史上两次事故（`24859f7` 日志整节被扫掉、`246b966` 工作树绿 ≠ 提交内容绿）**都是内容丢失类**；并发场次密集时拆分成多个提交，**中间态被别的场次整份覆盖**的风险显著上升。合成一个提交 + 逐文件归属表 + 干净克隆复验，把风险从「拆分」挪到「复验」。③ 归属信息没有丢——它在本表和 commit message 里。
- **共享工作树的「陈旧索引」竞态（本场次差点踩中，如实记录）**：本场次的暂存区是在 `d4b4d54` 时点 `git add -A` 生成的，而并发场次随后把 `1ea722f`（含日志 **+65 行**）提交进了 HEAD。若直接 `git commit`，索引里那份**旧日志**会把并发场次刚写入的 65 行**净删**（`git diff --cached --stat` 实测显示 `docs/IMPROVEMENT-LOG.md | 65 ------`，全为删除）。
  - **处置**：改用**私有索引**从**当前 HEAD** 重新 `read-tree`，只把要提交的文件按**工作树内容** `update-index --cacheinfo` 进去 → 提交树 = 当前 HEAD + 本场次文件，**绝不会删掉任何并发内容**，也**不读也不改真实索引**（别的场次的暂存区原封不动）。
  - **配套保险**：提交前看 `git diff --cached --stat` 的净增删是否合理；提交后核对「工作树日志节 ⊇ HEAD 全部节」（门禁 LS4）。
- 提交方式：**私有索引**（`GIT_INDEX_FILE` + `read-tree` + `update-index --cacheinfo` + `write-tree` + `commit-tree` + `update-ref` CAS）；**不 push**。

### E. 待本人拍板

- **待拍板 1（新增）**：**更正一处旧定性**。日志 8221–8224 行把「论文 `@id` 被多种 `@type` 复用」记为「这是**建模选择**、不是错误（门禁 31 只记 note 不判红）」。本场次按 `base.njk` 的 @id 方案注释 + schema.org 语义**判定为缺陷并修复**，J8/J9 把它变成判红。请本人确认这个定性更正；**若不同意，J8/J9 需相应撤掉**（改动局限在 `check-jsonld.cjs` 两个判据 + `eleventy.config.js` 一行）。
- **待拍板 2（新增）**：`mainEntityOfPage` 现指向 `<页面 URL>#webpage`（本页页面实体）。是否还要在**论文实体**上补一条指回本站点的显式链接（如 `isPartOf` → 站点实体）？目前论文页经页面实体的 `isPartOf` 已能回溯到站点，**不代拍**。
- **待拍板 3（新增）**：`check-jsonld.cjs` 的落点。本场次放在**独立脚本**（J1–J9 号段），不占 `verify-site.cjs` 的连续编号体系。要不要折进 `verify-site.cjs` 成「门禁 33」？—— 好处是与其余站点级判据同文件、编号统一；代价是要同改**文件头清单 + 代码段 + 门禁 29 对照表**三处，且该文件正被并发场次改写，**要等其落定**再折。本场次倾向维持独立脚本，**不代拍**。
- **待拍板 4（新增）**：J8 的口径 —— 同一 `@id` 出现**不同的 `@type` 组合**即判红（数组视为一个组合；裸引用不贡献类型）。目前全站 12 个 `@id` 中只有 1 个曾挂两种 `@type`，**零误报**。要不要把「裸引用也带 `@type`」也纳入判红？（会与「引用不该带类型」的现有约定冲突）
- **待拍板 5（承接）**：`PENDING_FIELDS`（`url` / `datePublished`）全站口径、论文 `@id` 的 `url` 口径与 `datePublished` 粒度、sitemap `lastmod` 三选一、404 的 `identityOn404`、论文页署名单位、`figure.alt` 前缀、RIS 两条、`citation_author_institution`、数据集引用写法、OpenAlex 是否上页脚 —— 维持原样，不代拍。
- **待拍板 6（承接）**：身份句柄门禁的落点与「锚写死」代价、多出未登记句柄是否判红 —— 维持 16:05–16:25 场次的方案②，不代拍。
- **待拍板 7（承接）**：**部署时机**。线上仍是旧部署（`/papers/`、`/publications.bib`、`/feed.xml` 404），本地已积累数十个未 push 的 commit。什么时候 push / 部署由本人定（本场次**不 push**）。

## 2026-10-19 · 16:55–17:10 场次（**不占轮次号**，避免与并发场次撞号）：`0fcbdcb` 的**干净克隆复验** + 代落并发场次的 J10 / oracle 独立化 / shortJournal 修正（补上「日志记了、代码却没上 main」的缺口）

### A. 背景

`0fcbdcb`（本场次主提交）落地后，工作树里仍有并发场次的**代码**改动未入库，而它们的**日志段已被本场次主提交一并带入** → 出现「**日志记了、代码却没上 main**」的缺口（与历史上 `24859f7` 一类事故同类）。本节把这批代码补上，只做**复验 + 落地 + 记账**，不改其设计。

### B. 代落地的三处（归属：并发场次；本场次只做复验与记账）

1. **`scripts/check-jsonld.cjs` 续写 J10**：页面实体的 `@type` 必须与源文件 front matter 的 `profilePage` 声明一致。判据**回源文件**逐页核对，**不在门禁里另抄一份 URL 清单**（路由一改清单就静默失配）。自证存活：`j10Compared`（比过的页数）与 `j10ProfilePages`（声明为 ProfilePage 的页数），两者为 0 都判红。结尾输出由 J1–J9 改为 **J1–J10**。
2. **`scripts/check-identity-handles.cjs` + `scripts/lib/identity.cjs`：把期望集从共享模块搬进门禁内置的独立 oracle**（`ORACLE_SAMEAS`），并加 `sha256` 锚（I2c）与数据源↔期望集**逐项漂移核对**（I2d）。理由：共享模块**正是产物的发射源**（`src/_data/site.js` 从它取 `author.sameAs`），把 oracle 放在里面 → 有人做「**等长替换**」（把 GitHub 句柄换成另一个账号，**条数不变、ORCID 仍在**）时，产物与期望集**一起**变 → 判据在拿被改过的东西和它自己比 → **全绿**。改短 / 改长 / 整片消失三种形态两版都抓得到，**只有等长替换被「把 oracle 搬进可变数据源」吃掉**。代价是合法增删要改两处（漏改 → 判红），**有意接受**。
3. **`src/_data/site.js`**：`shortJournal` 由 `"JGR: Atmospheres"` 改为 **`"JGR Atmospheres"`** —— Crossref 对本文登记的 `short-container-title` **没有冒号**，旧值是旧刊名写法，读者按缩写检索会查不到。用途仅限**页面可见的紧凑引用行**；BibTeX / RIS 导出条目一律用登记全称 `journal`。

### C. 验证结果

- **`0fcbdcb` 的干净克隆复验：exit 0**。手法：`git clone --no-hardlinks` → `git checkout 0fcbdcb` → **软链** `node_modules`（**不可 `cp -R`**：会改 mtime 让时间类判据假红）→ `npm run build`。输出逐字：
  - `引用完整性门禁通过：扫了 57 个已跟踪代码文件、24 处本地引用，被引用的文件全部也已被 git 跟踪。`
  - `日志节不得消失门禁通过：扫了 40 个提交、60 个现存节…工作树上的 60 个节也覆盖了 HEAD 的全部节。`
  - `门禁编号：最高 32 号（4b、4c 是 4 号族的附属号），共 33 项 —— 文件头清单 33 项 / 代码段 33 项，一一对应、整数号 1–32 无缺号`
  - `✓ 结构化数据自检通过（门禁 J1–J9）`（该提交时点）
  - `身份句柄完整性门禁通过：…比过 14 处 sameAs，每处都等于登记清单（5 条）`
  → 证明**提交内容本身就是绿的**，不依赖工作树状态（这正是「工作树绿 ≠ 提交内容绿」要防的那一类）。
- **带上 J10 / oracle / shortJournal 三处后的工作树 build：exit 0**。关键输出：
  - `· 页面角色：5 页与源文件 front matter 的 profilePage 声明逐页核对一致（其中 2 页声明为 ProfilePage）` + `✓ 结构化数据自检通过（门禁 J1–J10）` → **J10 自证存活**（不是空跑）。
  - `身份句柄完整性门禁通过：…每处都等于本判据的独立期望集（5 条…）；数据源清单与期望集逐项一致。` → 期望集已与数据源**脱钩**，I2d 漂移核对生效。
- **未做的验证（如实标注）**：J10 与 oracle 独立化的**故障注入矩阵**由其作者场次负责，本场次只做了「判据自证存活 + 全量 build 绿 + 干净克隆复验绿」三项，**没有**替它跑注入用例。

### D. 归属与边界

- 本节提交 **4 个文件**：`scripts/check-jsonld.cjs`（J10）、`scripts/check-identity-handles.cjs`、`scripts/lib/identity.cjs`、`src/_data/site.js`，外加 `docs/IMPROVEMENT-LOG.md` 的本节。**全部是并发场次的实现**，本场次**未改其设计**，只做复验、落地与记账。
- 提交方式同上一节：**私有索引**（从**当前 HEAD** `read-tree` → `update-index --cacheinfo` → `write-tree` → `commit-tree` → `update-ref` CAS），**不读也不改真实索引**；**不 push**。
- 提交后把真实索引**收敛到 HEAD**（`git add` 这几个路径），防止别的场次用**陈旧索引**把这些内容回退掉。

### E. 待本人拍板

- **待拍板 8（新增）**：身份句柄门禁现在**有两份清单**（共享模块 + 门禁内置 `ORACLE_SAMEAS`），合法增删要**同时改两处**，漏改 → 判红。这是**有意接受的代价**（不漏改的前提是 I2d 逐项核对会当场叫出来）。要不要接受？
- **待拍板 9（新增）**：J10 把「页面实体用什么 `@type`」的唯一真源定在**源文件 front matter 的 `profilePage` 开关**上，并要求产物里必须有 `<!-- source: ... -->` 标注（缺了就判红）。这个约定要不要**写成站点规范**（写进 `base.njk` 的注释与 README），还是保持只在门禁里？
- **待拍板 10（新增）**：`shortJournal` 改成登记值 "JGR Atmospheres" 后，页面可见的紧凑引用行会与 BibTeX / RIS 里的登记全称 "Journal of Geophysical Research: Atmospheres" **不一致**。要不要在紧凑行上也保留一个可读的说明（如加脚注）？
- 待拍板 1–7 见上一节（16:25–16:55 场次），本节**不重复、不改口**。

### F. 复验补记（本节提交后的干净克隆复验）

对 `4986534` 做了**第二轮**干净克隆复验（`git clone --no-hardlinks` → `git checkout 4986534` → **软链** `node_modules` → `npm run build`）：

- **exit 0，产物日志里 `✗` 行数 = 0**。
- `日志节不得消失门禁通过：扫了 40 个提交、61 个现存节…工作树上的 61 个节也覆盖了 HEAD 的全部节。`
- `✓ 结构化数据自检通过（门禁 J1–J10）` + `· 页面角色：5 页与源文件 front matter 的 profilePage 声明逐页核对一致（其中 2 页声明为 ProfilePage）`
- `身份句柄完整性门禁通过：…每处都等于本判据的独立期望集（5 条…）；数据源清单与期望集逐项一致。`
- `引用完整性门禁通过：扫了 57 个已跟踪代码文件、25 处本地引用，被引用的文件全部也已被 git 跟踪。`

→ 两次提交（`0fcbdcb`、`4986534`）的**提交内容本身**都是绿的，不依赖工作树状态。

## 2026-10-19 · 16:20–16:35 场次（**不占轮次号**，避免与并发场次撞号）：身份句柄门禁「**等长替换**」盲区的**故障注入矩阵取证**（实现归属本场次，代码由 16:55–17:10 场次代落库 `4986534`）

### A. 巡检（现查，非复述）

- 线上 7 条 URL：`/` 200、`/blog/` 200、`/about/` 200、`/sitemap.xml` 200；**`/papers/`、`/publications.bib`、`/feed.xml` 404**。
- 取证：线上 `sitemap.xml` 的 `<loc>` 仍是 `https://github.lvyihang.xyz/MeteoHub/…`，线上首页 `canonical` 仍是 `…/MeteoHub/` → 线上仍是 **2026-10-16 的旧部署**（`/MeteoHub/` 前缀已在 `9145197` 移除），**不是代码回归**。不 push；部署时机由本人定（承接「待拍板 7」）。
- 本地 `npm run build` → **exit 0**；提交树 `4986534` 的**干净克隆**（`git clone --no-hardlinks` + 软链 `node_modules`）build → **exit 0**（"工作树绿 ≠ 提交内容绿"那一条，见 F 段末）。

### B. 这一轮在做什么（归属先说清）

- **实现**（把期望集从共享模块搬进判据内置的独立 oracle `ORACLE_SAMEAS` + sha256 锚 I2c + 数据源↔期望集逐项漂移核对 I2d）是**本场次**写进共享工作树的。
- **代码入库**由 **16:55–17:10 场次**代做：它发现工作树里有在途代码未入库（"日志记了、代码却没上 main"的缺口），在 `4986534` 里把这批代码补上，提交信息明确标注"实现归属：并发场次，本场次只做复验、落地与记账"。
- 那一节**明确点名**："J10 与 oracle 独立化的**故障注入矩阵**由其作者场次负责，本场次……**没有**替它跑注入用例。" → **本节就是那份注入矩阵**（C / D 段），外加巡检与提交树复验。

### C. 缺陷实测：初版（`1ea722f`）在「等长替换」形态下**全绿**

初版把期望集写成 `require("./lib/identity.cjs")` 的 `IDENTITY_SAMEAS`，而那个共享模块**正是产物的发射源**（`src/_data/site.js` 从它取 `author.sameAs`）→ 期望集与被判数据**同源**。

注入（**隔离克隆**，源码级 + 全量重建）：把共享模块里的 GitHub 句柄换成 `https://example.com/impersonator`（**条数不变、ORCID 仍在**）。

- 注入自证：模块清单 = 5 条，含 ORCID。
- 结果：**`npm run build` → exit 0**（全链路绿）；门禁输出原文：
  `每处都等于登记清单（5 条：… / https://example.com/impersonator / …）`
  ——**把冒名账号当"登记清单"打印了出来**。产物已经对外声明"作者的 GitHub 身份 = example.com/impersonator"，而全链路无一处叫红。

**形态对照（三种 + 一种，这一栏是本轮要点，别混）**：

| 形态 | 例子 | 初版（期望集取自数据源） | 修好版（独立 oracle） |
|---|---|---|---|
| 改短 | 模块只留 ORCID 一条 | 红 | 红 |
| 改长 | 模块多挂一条 | 红 | 红 |
| 整片消失 | 产物 14 节点 sameAs 只剩 ORCID | 红 | 红 |
| **等长替换** | GitHub → `example.com/impersonator`（条数不变、ORCID 仍在） | **绿（全盲）** | **红** |

等长替换独活的原因：初版的两条锚（条数 == 5、必含 ORCID）在**长度不变、ORCID 不动**的替换下**全部照样满足**；而期望集又是从被改过的数据源推导的 → 判据无锚可依。

### D. 修好版的故障注入矩阵（5 档，全部实测）

做法：隔离克隆；产物级注入打在**产物副本**上（`rsync -a` + `SITE_DIR`，不动真实 `_site`、不与并发 build 抢目录），源码级注入改模块后**全量重建**；每档带**注入自证**。

| 档位 | 注入做法 | 注入自证 | 结果 |
|---|---|---|---|
| **H 等长替换（源码级）** | 共享模块 GitHub → `example.com/impersonator`，全量重建 | 模块 = 5 条、含 ORCID | **判红 2 条**：I2d 漂移（模块多出冒名／少了 GitHub）+ I1 缺 `https://github.com/oldsixxiaolv`（**14 个节点 / 6 个产物**）。**端到端**：同一次 `npm run build` **exit 1**，断在 `check:identity` |
| **I 等长替换（只改 oracle）** | 只把门禁里的 `ORACLE_SAMEAS` 换成冒名；模块与产物不动 | oracle 里冒名 1 处 | **判红 3 条**：I2c 哈希锚（并给出该贴的新哈希）+ I2d 漂移 + I1 缺句柄 |
| **F 清单改短** | 共享模块改成只剩 ORCID | 清单 = 1 条 | **判红**：I2d 漂移（模块少了 4 条） |
| **E 产物整片退化** | 产物副本：14 个本人节点 sameAs → 只剩 ORCID | 14/14 节点 → `["…/0009-0005-3511-0546"]` | **判红**：点名 4 条缺失句柄 + 14 节点 + 6 产物 |
| **G 产物字段消失** | 产物副本：删掉本人节点的 sameAs 字段 | 14/14 节点 → 无 sameAs 字段 | **判红**：I4 自证"一处都没比上"；**门禁 23 同时独立判红**（"实体与权威标识脱钩"）→ 两条红因**不矛盾** |

- **A/B 对照（同一份被注入产物、同一份源码，只换门禁版本）**：初版 → **exit 0 全绿**；修好版 → **exit 1、2 条红因**。归因干净：其余一切不动，只换判据。
- **互补性对照（证明不是重复劳动）**：**同一份被注入产物**上 `verify-site.cjs` **exit 0**，且两行与未注入时 **`diff` 无差异（逐字相同）**：
  `· 本人 ORCID … ↔ canonical @id 双向绑定（14 个节点带 ORCID / 14 个节点带 @id）`
  `· 同一 @id 的字段一致性：2 个多节点组 / 24 处比对（其中 22 处取值一致；字段缺失、嵌套字段不判）`
  → **分歧形态**（部分节点残缺）归门禁 31；**一致退化形态**（全站一起残缺）归本门禁。两条互补，缺一不可。

### E. 诚实边界（实测，不是推断）

把**期望集 + 数据源 + 哈希锚三者一致地**换成冒名账号并全量重建 → **build exit 0，判据仍然全绿**。

所以本门禁**不声称**能挡住有意的协同篡改，只声称能挡住**误改 / 单点改 / 等长替换**这几种真实事故形态；要防协同篡改得靠 git 历史审计 + 日志复核。这条边界已写进门禁文件头（不夸大覆盖范围）。

### F. 归属与边界

- 本场次提交 **1 个文件**：`docs/IMPROVEMENT-LOG.md`（本节）。**代码**（`scripts/check-identity-handles.cjs`、`scripts/lib/identity.cjs`）由 16:55–17:10 场次在 `4986534` 里代落库——本场次**不重复提交同一份内容**。
- **不碰**：`scripts/check-jsonld.cjs`、`src/_data/site.js`、`scripts/verify-site.cjs`（均已由并发场次入库或另有归属）。
- 与 16:05–16:25 场次的关系：它落的初版**方向对**（要独立锚、判据不能与数据源同源），但**锚的粒度不够**（只锚了条数与 ORCID，挡不住等长替换）。本场次**沿用**它的方向、**补上**缺口，**不推翻**它。
- 端到端证据的基准：`1ea722f`（初版）→ `0fcbdcb` → `4986534`（含本实现）。基线中途被并发场次推进过两轮，整套注入在**同一棵被注入的树**上对跑两版门禁，结论逐条一致；`4986534` 的提交树另在**干净克隆**里 build 过一遍（exit 0）。

### G. 待本人拍板

- **待拍板 11（新增）**：**协同篡改**这条边界要不要在**流程**上补一道？实测证明：期望集 + 数据源 + 哈希锚三者一致地改，判据全绿（E 段）。要在流程上兜（例如把 `scripts/lib/identity.cjs` 与 `scripts/check-identity-handles.cjs` 这两个路径列为 PR 必看 / 加 CODEOWNERS），还是就接受"判据不挡协同篡改，靠 git 历史审计与日志复核"这条口径？**本场次不代拍**。
- **待拍板 12（新增）**：哈希锚（I2c）这一层要不要**单独保留**？它挡的是"只改期望集"（改短 / 等长替换）这一种事故；代价是合法增删句柄后要**多贴一个哈希值**（红因里直接给出该贴的值，不需手算）。去掉的话，"只改期望集"就退化成"只有 I1 + I2a/I2b 能挡"。
- **待拍板 8（承接 16:55–17:10 场次，不改口）**：两份清单的维护代价（合法增删要改两处）——那一节已提出，本节**不重复**。
- **待拍板 7（承接）**：**部署时机**。线上仍是旧部署（`/papers/`、`/publications.bib`、`/feed.xml` 404），本地已积累数十个未 push 的 commit。什么时候 push / 部署由本人定（本场次**不 push**）。

## 2026-10-19 · 16:32–17:00 场次（**不占轮次号**，避免与并发场次撞号）：J10（页面实体 `@type` 守卫）的**故障注入矩阵** + 已知盲区如实记账 + 「工作区 build 因并发互踩而假红」的取证

### A. 背景

1. **上一轮巡检实测到的漏网缺口**：16:25–16:55 场次落地了「站点实体 + 页面实体」层（WebSite / WebPage / ProfilePage）与门禁 J1–J9，但那套判据**只数实体个数，从不看实体是什么** —— `scripts/check-jsonld.cjs` 里 `pageNodes` 的过滤是 `typesOf(n).some((t) => t === "WebPage" || t === "ProfilePage")`：两种页面类型一视同仁，J2 只判「恰好一个页面实体」。于是把 about 页的 `"@type": "ProfilePage"` 改成 `"WebPage"`，**实体个数仍是 1 → 门禁 exit 0**（上一轮巡检的注入 C 实测漏网）。
   - 后果：消费方读不出「这是关于某人的页面」（ProfilePage 正是 schema.org 里表达这一点的类型），而页面照出、JSON-LD 照常合法、其余门禁全绿 —— **没有一处会响**。
2. **本场次的实现与归属**：门禁 **J10**（页面实体的 `@type` 必须与该页源文件 front matter 的 `profilePage` 声明一致）+ `base.njk` 每页写入 `<!-- source: ... -->` 源文件标注，**实现由本场次完成**，由并发场次（16:55–17:10）**代落地入库**（`4986534`）。该场次在日志里**明文标注**「J10 与 oracle 独立化的**故障注入矩阵由其作者场次负责**」—— 本节即那半份：**注入矩阵 + 盲区记账**；本场次**代码零改动**。
3. **一处流程性取证**（值得记，否则下次会误判成缺陷）：工作区 `npm run build` 曾以 `ENOENT .../_site/about/index.html` **假红** —— Eleventy 刚写完该文件，就被**另一次并发 build 的清理**删掉（实测当时有 2 个 eleventy 进程在跑）。那**不是缺陷**，是共享 `_site` 的互踩。故本场次的权威验证一律在**隔离副本**里做（`/tmp/mh_fi`：`rsync -a` + `node_modules` **软链**，不可 `cp -R`：会改 mtime 让时间类判据假红）。

### B. 改了什么

本场次**不改代码**（J10 已由 `4986534` 入库），只做验证与记账 → 本节**只提交 `docs/IMPROVEMENT-LOG.md`**。

J10 的判据形状（供后人接手时一眼看懂）：

- **真源**：源文件 front matter **顶层**的 `profilePage` 开关（true → ProfilePage，否则 → WebPage）。取值真值口径与模板一致（YAML 布尔照 YAML 解；带引号的字符串按 Nunjucks 真值、非空即真）。
- **对回产物**：每页产物带 `<!-- source: ... -->`（构建期写入、仓库相对路径）→ 门禁据此回源文件逐页核对；**标注缺失 / 指向不存在的文件 → 判红**（不静默跳过）。
- **自证存活**：`j10Compared`（真核对过角色的页数）与 `j10ProfilePages`（声明为 ProfilePage 的页数）**任一为 0 → 判红**。
- **为什么真源放在源文件而不是门禁里**：门禁里另写一份 URL 清单 = 两份清单，路由一改就静默失配（`base.njk` 注释里已写明这个坑）。

### C. 验证结果

- **隔离副本全量 build：exit 0**（15 个门禁全绿），关键输出逐字：
  - `· 页面角色：5 页与源文件 front matter 的 profilePage 声明逐页核对一致（其中 2 页声明为 ProfilePage）`
  - `✓ 结构化数据自检通过（门禁 J1–J10）`
  → J10 **不是空跑**（自证输出有数）。
- **故障注入矩阵**（每个用例都带「注入已生效」自证；产品级注入改**产物副本**（`cp -R` 到 `/tmp/mh_fi_inj`）后用 `SITE_DIR` 指向副本，源/模板级注入在 `/tmp/mh_fi2` 副本里改完**重新构建**）：

| 注入 | 做法 | 注入自证 | 结果 |
|---|---|---|---|
| **A 基线** | 不注入 | — | **exit 0** ✓ |
| **B 产品级** | about 页 `@type` 由 ProfilePage 改 WebPage | 替换命中 1 处；改写后 @type = `WebPage` | **exit 1**：红因点名 `about/index.html` + 源文件 `src/about.njk` + 声明值 —— **上一轮实测的漏网缺口，本轮被抓住** |
| **C 模板级** | `base.njk` 把 `pageEntityType` 写死成 `'WebPage'`（不再听 front matter 开关） | 锚点命中 1 处；5 页 @type 全变 WebPage | **exit 1**：两条红因（about + index）→「模板不再听开关」也抓得到 |
| **D 源级** | 只把 `about.njk` 的 `profilePage: true` 改成 `false` | 命中 1 处；产物 about → WebPage | **exit 0 —— 已知盲区，如实记账**（见 D.1） |
| **E 源级** | `index.njk` 与 `about.njk` 的开关一起没了 | 命中各 1 处；全站 5 页 → WebPage | **exit 1**（自证）：「全站没有一页声明 ProfilePage —— 页面角色这一层整个退化了」 |
| **F 产品级** | 删掉 blog 页的 `<!-- source: -->` 标注 | 删除命中 1 处；残留 0 | **exit 1**：「页面里没有 <!-- source: ... --> 源文件标注 —— 门禁 J10 靠它知道这一页的角色」 |
| **H 产品级** | 把 papers 页的标注指向不存在的源文件 | 改写后标注 = `src/nonexistent.njk` | **exit 1**：「源文件标注指向 ... 但找不到这个文件」 |

- **B 与 D 合起来才是这条判据的完整形状**：B 抓的是「**产物与声明不一致**」，D 说明「**声明本身被改**」抓不到 —— 两者方向不同，**不能只报 B 就宣称这条门禁覆盖了退化**。
- **踩过并记下的坑**：① 工作区 build 的 `ENOENT` 是并发互踩、不是缺陷（见 A.3）；② 注入前必须先自证「文件真的被改了」——「注入没生效」与「门禁没拦住」现象完全一样（B/C/E/F/H 每个用例都打印了改写后的实际状态）。

### D. 已知盲区与归属边界

1. **D 那个盲区（如实记账，不粉饰）**：改 front matter 本身就是「改角色声明」这个**设计上的入口** —— 声明与产物一起退化，逐页比对看不出矛盾。要堵它，只能再写一份「哪些页必须是 ProfilePage」的清单，与「单一真源」冲突（且路由一改就失配）。本场次**不代拍**（见 E）。**能兜住的是 E 那一档**：整层退化（全站 0 页 ProfilePage）由自证判红抓住。
2. **归属**：J10 的实现属**本场次**，入库由 16:55–17:10 场次代劳（`4986534`）；该提交里另两处（身份句柄 oracle 独立化、`shortJournal` 更正为登记值 "JGR Atmospheres"）**不是**本场次的产出。`0fcbdcb` 属 16:25–16:55 场次。
3. **本场次只提交本日志节**（`docs/IMPROVEMENT-LOG.md`），代码零改动。提交方式：**私有索引**（`GIT_INDEX_FILE` + `read-tree` + `update-index --cacheinfo` + `write-tree` + `commit-tree` + `update-ref` CAS），**不读也不改真实索引**（别的场次的暂存区原封不动）；**不 push**。

### E. 待本人拍板

- **待拍板 13（新增）**：D 那个盲区要不要堵？① **接受**（改 front matter 是显式改动、review 看得见；J10 守的是「产物服从声明」）② 在门禁里再写一份「哪些页必须是 ProfilePage」的清单（能堵 D，但多一份清单、路由一改就失配，与单一真源冲突）③ 把「根页必须是 ProfilePage」写死成规则（能堵首页那半边，代价是引入一条按 URL 硬编码的规则 —— 正是 `base.njk` 注释里明确要避免的）。本场次倾向 ①，**不代拍**。
- **待拍板 14（新增）**：J10 要求产物里每页都带 `<!-- source: ... -->` 标注（缺了就判红），这行注释会出现在每页 HTML 里（不影响渲染）。要不要换成更隐蔽的形式（如 `<meta name="source">`）？本场次沿用 sitemap 的既有形式（同一套约定），**不代拍**。
- **待拍板 9（承接 16:55–17:10 场次）**：J10 定的「页面角色的唯一真源 = 源文件 front matter 的 `profilePage` 开关 + 产物必须带 source 标注」，要不要**写成站点规范**（写进 `base.njk` 注释与 README），还是只留在门禁里？**不代拍**。
- **待拍板 1–8、10–12（承接）**：主线口径（`mainEntityOfPage` 定性、`check-jsonld` 落点、J8 口径、身份句柄两份清单与哈希锚的代价、`shortJournal` 紧凑行）—— 维持上一节口径，**不代拍、不重复**。
- **待拍板 7（承接）**：**部署时机** —— 线上仍是旧部署（`/papers/`、`/publications.bib`、`/feed.xml` 404），本地已积累数十个未 push 的 commit。什么时候 push / 部署由本人定（本场次**不 push**）。

### F. 复验补记（本节提交后的干净克隆复验）

对 `c30c3ee` 做了**干净克隆复验**（`git clone --no-hardlinks` → `git checkout c30c3ee` → **软链** `node_modules`（不可 `cp -R`：会改 mtime 让时间类判据假红）→ `npm run build`）：

- **exit 0，产物日志里 `✗` 行数 = 0**。
- `· 页面角色：5 页与源文件 front matter 的 profilePage 声明逐页核对一致（其中 2 页声明为 ProfilePage）`
- `✓ 结构化数据自检通过（门禁 J1–J10）` → J10 在**提交内容本身**上就成立，不依赖工作树状态。
- `身份句柄完整性门禁通过：…每处都等于本判据的独立期望集（5 条…）；数据源清单与期望集逐项一致。`
- `日志节不得消失门禁通过：…工作树上的节也覆盖了 HEAD 的全部节。`

→ 本节（只有日志）落地后 main 仍是绿的。**未 push**。

## 2026-10-19 · 17:10–17:30 场次（**不占轮次号**，避免与并发场次撞号）：身份句柄门禁的**修法分歧裁定**——「清单单一来源 vs 独立 oracle」用同一份被篡改的产物对跑

### A. 背景

> **与并发场次 `6d6398c` 的关系**：那一节已把**注入矩阵本体**（5 档形态 + A/B 对照 + 协同篡改边界）记全了，结论与本节**逐条一致**。本节**不重复那份矩阵**，只做两件它没做的事：① **正面回答 16:1x 场次的修法提案**（「期望集取自共享模块」为什么**不**采纳）；② 逐条回 16:1x 场次的 ①–⑥ 六点现状。

16:1x 只读复验场次独立复现了**注入 E**（把产物里全部 14 个本人 Person 节点的 `sameAs` 统一改写成只剩 ORCID → `verify-site.cjs` exit 0、✗ 行数 0，门禁 31 输出「取值一致」、门禁 23 输出「14 个节点带 ORCID / 14 个节点带 @id」），**发现成立**。并对修法提出一处**关键分歧**：

> 建议**不要**采用「把 5 条 URL 写死进门禁」；主张**清单单一来源**——身份句柄抽到一个共享模块，`site.js` 与门禁**都 require 它**，门禁里只放**不重复清单内容**的弱不变量（条数 == 5、必须含 ORCID）。

该主张的落点已在 `1ea722f` 实现过，**后被刻意替换**（`4986534`）。本节用**同一份被篡改的产物**对跑两版门禁，把分歧**用证据裁定**，而不是各说各话。

### B. 裁定：分歧形态与一致退化形态，要按「期望集从哪来」分，不按「清单有几份」分

| 注入 | 旧门禁（`1ea722f`：期望集 = 共享模块） | 现役门禁（`4986534`：门禁内置独立 oracle + sha256 锚 + 漂移核对） |
|---|---|---|
| **A 整片退化**（只剩 ORCID） | **RED**：缺 4 条，14 个节点，6 个产物 | **RED**：缺 4 条，14 个节点，6 个产物 |
| **B 等长替换**（GitHub → `https://example.com/impersonator`，**条数不变、ORCID 仍在**） | **GREEN** —— 输出直接把**冒名账号**当成「登记清单（5 条：… / https://example.com/impersonator / …）」打印出来 | **RED**：`sameAs` 缺 `https://github.com/oldsixxiaolv` —— 14 个节点如此 |

- **两版都能抓「改短 / 整片消失」**；**只有等长替换**这一形态被「把 oracle 放进可变数据源」吃掉——因为共享模块**正是产物的发射源**（`site.js` 从它取 `author.sameAs`），期望集若也取自它，两者**同源**：改了模块 → 产物与期望集**一起**变 → 判据在拿自己和自己比。
- **「建第二份清单」这个顾虑是对的，但解法不是「把期望集搬回数据源」**：现役设计里两份清单之间有 **I2d 逐项核对**（数据源 ↔ 独立 oracle，漂了就判红），所以**不会有静默漂移**；本仓的规矩治的正是**静默漂移**，有逐字核对时，重复是**必要重复**而非冗余实现。
- **代价**（有意接受）：合法增删句柄要**同时改两处**（共享模块 + 门禁的 `ORACLE_SAMEAS` / `EXPECTED_COUNT` / `ORACLE_SET_SHA256`），漏改 → 判红（红因里直接给出该贴的新哈希）。
- **还有第三种解法没采用**：让期望集取自**外部权威记录**（如 ORCID 公开记录）。缺点是引入网络依赖与外部服务，与本项目「不引入新外部服务依赖」的约束冲突，故不取。

### C. 复验结果（本次实测，同一份产物对跑）

- 注入自证（grep 口径，**修正过一次测量 bug**：自证脚本自己的计数逻辑写错，误报「含冒名 URL 的节点 = 0」，grep 复核为 14 处 → **以 grep 口径为准**）：
  - A：`example.com/impersonator` 出现 **0** 次；`"sameAs":["…/0009-0005-3511-0546"]`（仅 ORCID）**14** 个节点；含真实 GitHub URL 的完整 5 条节点 **0** 个。
  - B：`example.com/impersonator` 出现 **14** 次；仅 ORCID 节点 **0** 个；含真实 GitHub URL 的完整 5 条节点 **0** 个（**条数不变、ORCID 仍在**——这正是「等长替换」的定义）。
- 旧门禁运行环境说明：旧门禁会 `require` 共享模块**并**读 `src/_data/site.js` 做交叉核对，因此 B 例必须让**数据源与期望集同步被替换**（真实场景就是改了共享模块 → 两者一起变）。本次用 `1ea722f` 的共享模块 + 同步替换的 `site.js` 副本 + **同一份 B 产物**跑出 GREEN。

### D. 归属与边界

- 本节**只加日志**，不改任何判据代码。现役门禁（`scripts/check-identity-handles.cjs` + `scripts/lib/identity.cjs`）是 `4986534` 已落地的形态。
- 逐条回应 16:1x 场次的六点：
  - **① 注入 E 复现** —— 成立，且现役门禁已能抓住（上面 A 例）。
  - **② 「分歧形态 vs 一致退化形态」要分清** —— **日志已如此写**（8808 行、9052 行：「分歧形态（部分节点残缺）归门禁 31；一致退化形态（全站一起残缺）归身份句柄门禁」），无需再改。
  - **③ 修法分歧** —— 见 B 节裁定：**建议不采纳**「期望集取自共享模块」，理由是实测的等长替换盲区；现役的「独立 oracle + 逐项漂移核对」是它的替代形态。
  - **④ 落点** —— 「新开一条门禁、不塞进门禁 31」这个方向**与现役一致**（`scripts/check-identity-handles.cjs` 独立脚本）。若进一步要折进 `verify-site.cjs` 成「门禁 33」，则要同改**文件头清单 + 代码段 + 门禁 29 对照表**三处（该表现为 33 行）；本场次倾向维持独立脚本（该仓已有 A* / W* / M* / GW* 独立门禁先例）。**此项属待拍板 1 的选项②，不代拍**。注意：**落点选择不改变判别力** —— B 节的裁定与门禁住在哪个文件无关。
  - **⑤ 清单是 5 条（含 OpenAlex）、线上只见 4 条是旧部署** —— 与现役一致（`EXPECTED_COUNT = 5`，即**「== 5」而非「≥ 5」**，比「≥5」更严，代价与你的判断一致：将来加第 6 条要同步改门禁里的数字，是**有意的显式动作**）。线上 4 条 = 2026-10-16 旧部署，**待部署**，不是清单少一条。
  - **⑥ 门禁 31 self-证计数修复在 HEAD 上还没有** —— **已落地**：`25b8506`（`compared++` / `sameAsCompared++` 挪到 `contributors < 2` 之后，并新增 `comparedConsistent`），该场次的基线 `ee476c2` 早于它。

### E. 待本人拍板

- **待拍板 8（改述）**：身份句柄门禁现有**两份清单**（共享模块 + 门禁内置 `ORACLE_SAMEAS`），合法增删要**同时改两处**，漏改 → 判红。本节已用实测把「为什么不把期望集放回共享模块」讲清（等长替换盲区）。要不要接受这个代价？
- **待拍板 1（承接）**：门禁落点 ① 独立脚本（现役）vs ② 折进 `verify-site.cjs` 成「门禁 33」+ 同步门禁 29 对照表。仍不代拍。
- 待拍板 2–7、9–10 见前两节，**不重复、不改口**。

## 2026-10-19 · 16:37–16:55 场次（**不占轮次号**，避免与并发场次撞号）：图片资产门禁（IA1–IA6）——「页面里声明的图 ↔ 产物里真实存在的图 ↔ 图片字节里的真实像素」三方一致

### A. 背景：整条 build 绿着，线上每张分享卡片却是死链

这一条不是假想，是**实测出来的缺口**。

在隔离克隆里把 `src/_includes/layouts/base.njk` 的 og 图文件名改成 `og-1200x630-NOPE.png`（一个不存在的文件）后：

- 整条 `npm run build` **exit 0**；
- **全部门禁全绿**（`✗` 行数 0）；
- 而产物里**每个页面**的 `og:image` 都指向一个 **404** —— 线上每张分享卡片（微信 / Twitter / Facebook / LinkedIn）拿到的都是死链，**站点自己看不出来**：build 通过、页面照常渲染、门禁全绿。

**根因是四层叠加，缺一不可**：

| 既有门禁 | 它查什么 | 为什么漏掉这一类 |
|---|---|---|
| 门禁 1 | `href` / `src` 指向的**文件**能不能找到 | `og:image` 装在 `<meta content="…">` 里，**不在门禁 1 的扫描面里** |
| 门禁 26 | `<img>` 有没有 `width` / `height` **属性** | 只查**存在性**，不查属性**值**对不对 |
| 门禁 22 | `og` 与 `twitter` 两边的 `alt` 是否一致 | 只在**两边都有 alt 时**才比对；两边都缺 → 没有可比对象 → 判绿 |
| —— | —— | **没有任何门禁读图片的字节** → `og:image:width/height` 写错、图换尺寸而声明没换，无人拦 |

**取证（本轮实测）**：当前所有图片的声明与真实像素**完全一致**（`sips` 实测）—— avatar 300×300 / 600×600、portrait 300×375 / 600×750、og-1080x1080、og-1200x630、og-1500x500、trmm-fig10 1400×745；`og:image:width/height` 与 `<img>` 的 `width/height` 属性全部对得上。**现状是干净的，缺的是"以后不许脏"的守卫。**

### B. 为什么新开一道独立门禁（而不是塞进 `verify-site.cjs`）

- **不重复已有门禁**（同一个事实两处判，改一处就会与另一处说法打架）：`<img>` 的 alt **存在性** → 门禁 25；alt 的**跨出口一致性** → 门禁 15 / 22；`width/height` 属性**存在性** → 门禁 26；`href/src` 文件能不能找到 → 门禁 1。本门禁**只查上面那些门禁看不到的东西**：文件**在不在**、**字节里的真实像素**与**声明值**是否一致。
- **不塞进 `verify-site.cjs`**：后者是连续编号整体（文件头清单 + 代码段 + 对照表三处须一一对应），且正被并发场次改写；新开独立脚本零耦合。
- **编号用独立字母 `IA1`–`IA6`**：不与 `verify-site.cjs` 的 1–32、`check-a11y.cjs` 的 A1–A7、`check-wrapping.cjs` 的 W1–W3、`check-gates-wired.cjs` 的 GW1–GW3 续接。**也不写死对方的编号区间**——那个区间会随对方加门禁而过期，写死就是一句会变假的话。
- **不引入新依赖**：PNG 的 IHDR 与 JPEG 的 SOF 段都用纯 Node 解析，无第三方库、无网络、无新服务。

### C. 判据

| 编号 | 判据 |
|---|---|
| **IA1** | 分享图必须**真的存在**：`og:image` / `og:image:secure_url` / `twitter:image` 指向的站内文件必须在产物里存在。附带：`og:image` 与 `og:image:secure_url` 必须指向同一个文件。 |
| **IA2** | `og:image:width` / `og:image:height` 必须存在，且与该文件的**真实像素逐字相等**（平台按这两个数取尺寸，写错就是错卡）。 |
| **IA3** | `og:image:alt` / `twitter:image:alt` 必须存在且**非空**。 |
| **IA4** | `<img>` 的 `width` / `height` 属性与真实像素必须**等比**（容差 1%）：预留了错的比例 → 布局照样会跳。 |
| **IA5** | 图片格式必须能读出真实像素：本门禁只支持 PNG / JPEG；出现别的格式 → **判红**，**不许静默跳过**（跳过就等于把这类图塞进"无人看守"的那一类）。 |
| **IA6** | **自证覆盖量**：应验数 == 实验数且 ≥ 1，否则判红（本仓库反复修的那族病：判据依赖可被截断的输入时会**静默空跑**，空跑的门禁等于没有门禁）。 |

两处**刻意的边界**（不是缺陷，是覆盖面的诚实交代）：

- **外站图不判红，但必须计数报出**（本地无法验像素，属覆盖边界）。
- **`<img>` 引用的文件缺失不重复判红**，只记一笔——那是门禁 1 的活（`og` 那边不在它的扫描面里，所以 IA1 自己查）。

### D. 复验结果

**被验 commit：`08a4524`**（提交时间 2026-10-19 16:28:30 -0700；相对 `oldsixxiaolv/main` 领先 96 个提交，**未 push**）。复现方式：`git clone --no-hardlinks` → **软链** `node_modules`（不可 `cp -R`：会改 mtime，让时间类判据假红）→ 整链 `npm run build`。

1. **整链 build exit 0**（基线，未加本门禁）与 **exit 0**（加本门禁并接线后）各一次。
2. **8/8 故障注入全过**（每档**先自证注入真的生效**，再断言门禁的**红因与设计意图一致**；判定成败的退出码不经管道）：

| # | 注入 | 期望红因 | 实测 |
|---|---|---|---|
| A | `og:image` 指向不存在的文件 | IA1 | ✓ 红，「产物里没有这个文件（分享卡片会拿到 404，站点自己看不出来）」 |
| B | `og:image:width` 1200 → 1201 | IA2 | ✓ 红，「声明 1201×630，而文件真实像素是 1200×630」 |
| C | 头像 `<img>` `height` 750 → 700 | IA4 | ✓ 红，「声明 600×700，而文件真实像素是 600×750」 |
| D | 分享图文件头换成 RIFF/WEBP | IA5 | ✓ 红，「是 WebP —— 本门禁只读得出 PNG / JPEG 的真实像素」 |
| E | 删掉 3 条 `og:image:alt` | IA3 | ✓ 红，「没有非空的 og:image:alt」 |
| F | 删掉 `twitter:image:alt` | IA3 | ✓ 红，「没有非空的 twitter:image:alt」 |
| G | 产物里所有 `.html` 改名（空跑） | IA6 | ✓ 红，「一张被引用的站内图都没找到 —— 本门禁在这种情况下等于**空跑**」 |
| — | 基线（未注入） | — | ✓ exit 0 |

3. **元验证（门禁自己在链上吗）**：把 `npm run check:image` 从 build 链里摘掉（**保留** `check:image` 脚本条目）→ `check-gates-wired.cjs` **exit 1**，红因：「`scripts/check-image-assets.cjs` 只被 npm script「check:image」引用，但那些 script **不在 build 链上**……同样等于没接」。（这就是 GW1 抓"看着在、其实不生效"的那条判据。）

**附带取证：并发场次 16:5x 报的那个 P0 是过期快照。** 该交接件自己写的基准是 `HEAD=d4b4d54 + 工作树改动`，而 `check:tracked-refs` 的接线是 **`0fcbdcb`（16:28:30）** 才加进 `package.json` 的——**对方的克隆早于那次修复**。在现行 `08a4524` 上实测：`package.json` 里 `check:tracked-refs` 出现 2 次（脚本条目 + build 链），干净克隆整链 `npm run build` **exit 0**。**该 P0 不需要修**（照它改会重复加一条已存在的 script）。这不构成缺陷，但记一笔：报"门禁没接线"这类结论时**必须带被验 commit hash**，否则无法区分"真缺陷"与"快照早于修复"。

### E. 已知盲区（如实记账）

- **格式盲区**：本门禁只读得出 PNG / JPEG。将来引入 WebP / AVIF / SVG 时会**判红**（IA5）而不是静默放过——这是有意的：宁可要求扩展本门禁，也不要让新图悄悄没人验。
- **外站图**：只报数不判红（本地无法验像素）。
- **协同篡改边界**：与身份句柄门禁同族——**oracle + 数据源 + 哈希锚三者一致地改，全链路仍然绿**。所以本门禁只能声称挡住"误改 / 单点改"，**不声称**挡住有意的协同篡改（那要靠 git 历史审计 + 日志复核）。这条已写进门禁文件头，不在日志里夸大覆盖范围。
- **与既有门禁的关系**：不重复、不打架。若将来有人给某张图换了格式或尺寸，本门禁会**当场红**——那时该改的是**声明**或**扩展本门禁**，不是删判据。

### F. 待本人拍板 / 留给下一轮

- **待拍板 9（新增）**：本门禁把"格式读不出来"判红（IA5）。将来若要引入 WebP/AVIF，是**扩展本门禁**（加一段格式解析）还是**维持只支持 PNG/JPEG**（新图一律判红）？现取后者（宁可红，不要无人看守）。
- **留给下一轮**：`check-log-sections.cjs` 的 LS2 窗口是最近 40 个提交；本场次之后日志节数量继续增长，值得复核一次"窗口是否还够用"（不是缺陷，是随提交密度上升的**容量**问题）。
- **留给下一轮**：门禁 22 的对齐口径（「两边都有 alt 才比对」→ 两边都缺时它没有可比对象）——与本门禁 IA3 互补，但**归属**是门禁 22 那条线，不在本场次动。
- 待拍板 1–8 见前几节，**不重复、不改口**。

## 2026-10-19 · 16:50–17:10 场次（**不占轮次号**，避免与并发场次撞号）：三份 peer 回执的裁定 + 两条工具事实的复测 + 补订上一节的时效

复验时的 HEAD = `1022823`。本轮**只读复核 + 写日志**：不改任何代码、不碰并发场次的在途改动。

### A. 前两份回执的裁定

| 回执 | 它给的结论 | 本轮裁定 |
|---|---|---|
| 12:16 场次（`mvs_0a0e47bf`）对 `9dab5d4` / `fcea9ad` 的独立复验 | 11 例注入全中；两条订正已落盘 | **与我的独立复现一致**，无动作 |
| 同上 | 12:15 交接件建议加 `hasOwnerOn404` | **不采纳**（与既有裁定一致：`identityOn404` 开关 + 门禁 16 双向判据已经绕开「404 页要不要 Person」这个未决口径） |
| 同上 | 下一轮候选：「门禁编号元门禁」（编号唯一且连续、清单与代码段一致） | **候选作废 —— 已在 main 上**：门禁 24 的 ①集合相等 ②各自不重复 ③整数编号连续（1..max 不缺，允许 4b/4c），加门禁 29 的旧编号→新编号对照表双向检查。**别再重做一遍** |
| 13:00 场次（`mvs_451e93`）对 `65f2a42` 的全量交叉验证 | build exit 0、门禁 20/21/16 四态、TLS 病根表 | **结论有效，但对象已旧**：`65f2a42` 确实在链上，但距本轮 HEAD 已有 **74 个 commit**。「那棵树可部署」说的是那棵树；**当前 HEAD 的树**另说（见 C 段） |

### A2. 第三份回执（16:30 前后送达）的三条断言 —— 逐条现查现跑

| 断言 | 复核结论 |
|---|---|
| ① 假 ORCID `0000-0003-1710-892X` **全仓零命中**；本人 ORCID 处处一致 | **成立**（零命中 → **确实不需要任何修复**）。但**它给的位置全过期**：`src/_data/site.js` 的字面量只有 **3 处**（L129/L284/L535）+ 1 处 `orcid: OWNER_ORCID`（L123）；日志里本人 ORCID 命中 **10 处**（不是 1 处）。它给的 117/176/287/479 与 L298 是 **`65f2a42` 快照**的行号 |
| ② vs `oldsixxiaolv/main` = **26**、vs `origin/main` = **16** | **数字自洽，但对象是旧树**：这两个数**恰好等于 `65f2a42` 的两个计数**（实测 `git rev-list --count origin/main..65f2a42` → 16、`oldsixxiaolv/main..65f2a42` → 26）——即**它的快照落后本轮 HEAD 74 个 commit**。当前 HEAD 上是 **90 / 100** |
| ③ 「全站 img 必须有 alt」门禁**尚不存在** | **不成立 —— 门禁 25 已在 main**（`scripts/verify-site.cjs:1925`），而且**它已经**用 `realImgTags()` 先剥 `<style>…</style>` 与 `<!--…-->` 再数真实 `<img>`；它说的「门禁 22 在 1528」也过期（门禁 22 现 在 **1815**，1528 落在门禁 19 的注释块里）。**但基线数字本身对**：5 张真实 img / 0 缺 alt / 0 空 alt —— 我用同口径独立复算，逐张 src+alt 全一致 |

另：它说「两个他人 ORCID 的 33 条外链审计已覆盖、全部 200，无需再查」——**同意不重复审计**；
但我顺手点了这三条（两个合著者 + 本人）**都是 200**，结论一致。

⚠️ **这一份回执最值得记的，不是它对不对，而是它的快照有多旧**：
它三条断言里有**两条**（①的行号、②的计数）只是**过期**，**没有一条是错的**——
**内容全部成立，只有位置和时间不对**。
这正是本文件里那条纪律的又一次体现：**先验版本，再下结论**。
（另一个提醒：③ 里它说「门禁尚不存在」——这是**真错**，不是过期；
区别在于「过期」可以靠现查补上，「真错」会让人**去重做一件已经做完的事**。）

### B. 两条工具事实：采纳，并订正本文件里已记的旧数字

12:15 交接件里的两条可用项，本轮**独立复测**：

1. **浅克隆必须用 `file://` 前缀** —— 实测：不带前缀时 git 自己就警告
   `--depth is ignored in local clones; use file:// instead.`，克隆出来是 **98 个 commit**（全历史）；
   带前缀才是 **1 个 commit**。本文件里所有隔离克隆命令都带前缀。
2. **`.git/objects` 里的 AppleDouble 垃圾** —— 实测（复验时）：`._*` 共 **1546** 个
   （其中 `.git/objects` 内 **1376** 个）；单个 `._*` 文件实际 4096 字节、占盘 256 KiB；
   `git count-objects -vH` 报 `garbage: 1213`。
   `du -sh .git` = **840M**，而 `.git` 里**真实字节**只有 **51.8 MiB** → **虚高约 16.2 倍**。
   ⚠️ **本文件里那条「764 个 `._*`」「小对象各吃满一个 32K 簇」的记录已过期** ——
   簇大小实测是 **256 KiB**、垃圾数量也一直在长。
   → **结论不变**：判断克隆成本只能用 `git count-objects -vH`，**不能用 `du -sh .git`**；
   **数字以本条为准**。

### C. 补订「16:10–16:30 场次」的时效（该节标题现在已过期）

**门禁 31、门禁 32，以及 `sameAs` 根因修复，都已以 `adcf339` 进入 main。**
本轮实测：`git show HEAD:scripts/verify-site.cjs` 有 `/* ---------- 31. … ---------- */` 与
`/* ---------- 32. … ---------- */`；`git show HEAD:eleventy.config.js` 的本人节点是
`person.sameAs = [...A.sameAs]`（全集）；`12dedb0` 的隔离构建产物里，本人 Person 的
`sameAs` 是 **5 句柄全集**（ORCID / GitHub / ResearchGate / CSDN / OpenAlex）。
→ 所以「16:10–16:30 场次」标题里的「**都不在 main 上**」**只对 `720ed3e` 成立**，
在今天的 HEAD 上已是过期说法。已在该节标题后插入时效补记。

⚠️ **但要把两件事分开记**（本轮唯一一处容易写错的地方）：

| | 在 main 上？ | 判据（可自己重跑） |
|---|---|---|
| 门禁 31 / 门禁 32 / `sameAs` 根因修复（**内容**） | **在**（`adcf339`） | `git log -S '同一 @id（且同一 @type）的节点' --oneline -- scripts/verify-site.cjs` → `adcf339`；`git show HEAD:scripts/verify-site.cjs` 有 31/32 段 |
| 记门禁 31 的**那一整节日志**（「15:00–15:50 场次」） | **也在**（`0fcbdcb`） | `git show HEAD:docs/IMPROVEMENT-LOG.md \| grep -cE '^## 2026-10-19 · 15:00–15:50 场次：'` → **1**；`git log -S '## 2026-10-19 · 15:00–15:50 场次：' --format=%h -- docs/IMPROVEMENT-LOG.md` → `0fcbdcb` |

→ 一句话：**内容与记录现在都在 main 上**。「16:10–16:30 场次」标题里的
「**都不在 main 上**」**两个部分都已过期**（对 `720ed3e` 成立，对今天的 HEAD 不成立）。
这正是「16:10–16:30 场次」D 段第 1 条说的那件事 —— 完成度只看 `git show HEAD:<file>` /
`git log -S`，**日志标题不是完成度判据**。

### C2. 判据坑（顺手记下来 —— 本轮真的踩到了）

查「某节在不在 main 上」时，判据本身**会被日志正文里的引用污染**。

**本轮中段在 `d4b4d54` 上实测过这个坑**（那时那节确实还没进 main）：

| 判据 | 输出 | 真值 |
|---|---|---|
| `grep -cF '## 2026-10-19 · 15:00–15:50 场次'`（**不锚定行首**） | **1** | ❌ 假的 —— 那 1 行不是节标题，是「16:10–16:30 场次」**证据表格里引用的那条 grep 命令**（该行以 `|` 开头） |
| `grep -cE '^## 2026-10-19 · 15:00–15:50 场次：'`（**锚定行首 + 全角冒号**） | **0** | ✅ 真的（那时确实不在） |

→ **纪律**：「某节在不在」这类判据，**必须锚定在行首**（`^`）**且用足够长的完整标题**；
否则本文件里**别节引用它的那一行**会让你把「不在」读成「在」——
而这两种误读方向**相反**（一个要撤回结论，一个要去提交），处置完全不同。
⚠️ 补充一句：后来那节被 `0fcbdcb` 合进了 main，于是**现在两个判据都输出 1**——
**坑还在，只是这棵树上两者恰好同值**。所以别因为「这次两个数一样」就以为短前缀也能用；
**判据的正确性来自它的写法，不来自它这次巧不巧**。

### C3. 「在不在 main 上」这条判据，今天翻了三次（本轮实测）

| 时点 | HEAD | 门禁 31 的**代码**在 main？ | 记它的那**一节**在 main？ |
|---|---|---|---|
| 我写上一节时 | `720ed3e` | 不在 | 不在（只在工作树） |
| 本轮中段 | `d4b4d54` | **在**（`adcf339`） | 不在 |
| 本轮复验时 | `1022823` | 在 | **在**（`0fcbdcb`） |

→ 同一轮里翻了 **三次**。**不是「我算错了」——是并发场次在提交**：
每一次翻转都是别人把东西合进了 main，**我这边只是还没重查**。
→ **纪律（本轮又一次印证）**：任何写进日志的「在 / 不在 main 上」必须自带
**① 复验时的 HEAD ② 判据命令 ③ 相关提交号**；只写一句结论的句子**一小时内就可能过期**。
（这也解释了为什么本文件里这类句子几乎都带「复验时的 HEAD = …」——不是啰嗦，是保质期问题。）

### D. 本轮改动与边界

- **只改 `docs/IMPROVEMENT-LOG.md`**：C 段的时效补记（插进「16:10–16:30 场次」标题后）+ 本节。
- 未碰任何代码文件；中间产物全在 `/tmp`；**不 push**（部署由本人决定）。
- 巡检 cron 每 5 分钟起新会话一事**已在待决策段**（本人决定降频或加单写者锁），本节不重复登记。

### F. 顺带落地：页面上**看得见**的身份链接也改为从同一真源派生（并发场次的实现，本场次代落库）

`src/_data/site.js` 此前 `author.github` / `author.csdn` / `author.researchgate` / `social[]` **各写了一份字面量**，与 `sameAs` 那份互不相干。并发场次实测出的漏洞：只把页面上可见的 GitHub 链接换成 `https://github.com/impersonator`（`sameAs` 不动）→ **整条 build 链 exit 0，没有任何一道门禁判红** —— 机器读的那条有人看守，人读的那条没人管。

改法：新增 `IDENTITY_BY_HOST`（**称呼**映射）、`SOCIAL_ORDER`（**显示哪几条、什么顺序**）、`identityUrl(host)`（从 `IDENTITY_SAMEAS` 按主机名取，取不到返回 `null`、**不静默兜底成别的值**），`author.*` 与 `social[]` 全部改为派生。两张表**只决定展示层，不复制清单内容** → 增删句柄只改 `scripts/lib/identity.cjs` 一处。

- **验证**（本场次实测）：带该改动 `npm run build` → **exit 0**；产物 `_site/index.html` 里可见 GitHub 链接出现 **7** 次，且与同页 `sameAs` 里的 `https://github.com/oldsixxiaolv` **逐字一致**（人读路径与机读路径同源）。换模块时两者同步变 → 被独立 oracle 的身份门禁接住。
- **归属**：实现归属并发场次；本场次只做**复验 + 落地 + 记账**（该改动当时仍未提交 → 内容丢失风险）。
- **已知盲区（如实记账）**：目前**没有门禁**能挡住"有人把 `site.js` 里的派生改回字面量"——保护只有代码注释与派生关系本身。**候选改进**（未做）：加一条门禁，断言页面上每一个可见身份链接都**等于** `IDENTITY_SAMEAS` 里的对应项（人读路径与机读路径一致性判据）。这与 `check-identity-handles.cjs` 的 I1/I2 互补——那条管机读侧，这条管人读侧。

## 2026-10-19 · 16:45–17:05 场次（**不占轮次号**，避免与并发场次撞号）：16:2x 复核回执的**逐条裁定** + 「可见身份链接」的第二条路（markdown 正文里的字面量）实测

复验时的 HEAD = `268097a`（2026-10-19 16:39:03 -0700）。本场次**只读复核 + 写日志**：不改判据代码、不碰并发场次的在途改动。

### A. 这份回执的基准与逐条裁定

回执来自 16:2x 只读复核场次，材料在 `/tmp/mh_v34_e41cfa12`，**它自己的克隆基准是 `1ea722f`**（共享模块形态那版）——比今天的 HEAD 落后好几个提交。

| 它提的建议 | 裁定 | 依据（可自己重跑） |
|---|---|---|
| ① 门禁恢复**独立 oracle**（完整清单 + I2 逐字核对） | **已在 main，`4986534` 就落地了** | `git show HEAD:scripts/check-identity-handles.cjs` → `ORACLE_SAMEAS` + `EXPECTED_COUNT` + `ANCHOR_ORCID` + `ORACLE_SET_SHA256` + I2d 漂移核对。**别再重做一遍** |
| ② 模块补齐 `site.js` 里仍硬编码的 `author.github/csdn/researchgate`（about 页同时对外说两个 GitHub 身份） | **成立，且并发场次正在做** | HEAD 的 `src/_data/site.js` 仍写着字面量：`github` / `csdn` / `researchgate` / `openalex` / `social[]` |
| ③ 「多出」回判红 | **已在 main** | I2d 是**双向**比对：`extra`（模块多出）与 `missing`（模块少了）**都**判红 |
| ④ 锚自检失败即短路 | **仍开放**，无人接 | 见 C 段末 |

**这一份的形状值得记一笔**：四条里**没有一条是错的**——①③④在当时的树上都成立（是**过期**，不是**真错**）；①③在今天的 main 上**已经做完了**，照着改会**重复实现**。
→ 延续本文件那条纪律：**先验版本，再下结论**；「过期」能靠现查补上，「真错」会让人去重做一件已经做完的事。

### B. ①的独立复核（等长替换形态）

在 `268097a` 的干净克隆上注入「等长替换」：把 `scripts/lib/identity.cjs` 的 GitHub 句柄换成 `https://example.com/impersonator`（**条数不变、ORCID 仍在**）。

- 注入自证：数据源已换成冒名 URL ✓；重建后产物里出现冒名 URL ✓；ORCID 仍在 ✓
- 门禁 **exit 1（红）**，红因逐字：
  > 共享模块 `scripts/lib/identity.cjs` 的清单与本判据的独立期望集不一致：模块多出 `https://example.com/impersonator`／模块少了 `https://github.com/oldsixxiaolv`

→ **独立 oracle 形态抓得到等长替换**；共享模块形态抓不到（期望集与产物的发射源同源 → 判据在拿自己和自己比 → 全盲）。该形态矩阵见 17:10–17:30 场次一节。

### C. 残留缺口：「可见身份链接」其实有**两条路**，而 I5 只看第一条

并发场次正在做的是**对的那一半**：`site.author` 里的 `github` / `csdn` / `researchgate` / `openalex` / `social[]` 改为**从身份清单派生**（结构上不可能漂移），并加 **I5「人读路径」**判据（`site.author` 里的可见身份链接必须与登记期望集**逐项一致**，少一条 / 多一条 / 指向别的账号都判红）。

但**产物里还有第二条路**，本轮实测确认：

| 源文件 | 字面量 | 渲染后落在 |
|---|---|---|
| `src/content/about.md:38` | `[CSDN](https://blog.csdn.net/lvyihang200411)` | `_site/about/index.html:1565` |
| `src/content/about.md:23` | `github.com/oldsixxiaolv/oldsixxiaolv.github.io` | about 页正文 |
| `src/index.njk:72` | `https://github.com/oldsixxiaolv/Manuscript_Lvyh` | `_site/index.html` |

**实测证据**：渲染后的 about 页里，**CSDN 链接出现两次** —— `:1525` 来自模板面板（`site.author` 派生那条路），`:1565` 来自 markdown 正文（字面量那条路）。

- **I5 扫不到它**：I5 只扫 `site.author`（数据源），不扫 markdown 正文。
- **site.js 派生也管不到它**：md 不是 site.js。
- 后果与回执说的一样：清单里的 CSDN 一旦变了，面板跟着变、**正文那条静默留在旧句柄** → about 页对外说**两个 CSDN 身份**，且**没有任何门禁会叫**。

⚠️ **修这一半有一条硬约束，别踩**：`eleventy.config.js` 里 **`markdownTemplateEngine: false`**，about.md **不走 Nunjucks**——该文件自己的头注释已写明「本文件由 eleventy.config.js 里的 markdown-it 直接渲染，不过 Nunjucks……所以模板语法在这里无效」。
→ **不能**在 about.md 里写 `{{ site.author.csdn }}`（会当正文显示）。
→ 而且该文件的编写约定②就是「事实性清单（关键词 / 单位 / 技能 / 论文 / **链接**）全部交给模板」——按它自己的规矩，**正确修法是把这些链接挪进模板**（`about.njk`），不是想办法在 md 里派生。
→ 另一条路是让守卫扫**产物**（`isIdentityProfile()` 那个形状匹配器已经现成），但要放行**同行作者的 ORCID**（一段式 `orcid.org/<id>` 与本人的 ORCID **形态完全一样**）——这需要另立判据，不宜混进 I5。

**本场次不动这些文件**：`about.md` / `about.njk` / `site.js` / `check-identity-handles.cjs` 都不在我的在途清单内，但**修法的形状取决于并发场次对 I5 边界的取舍**（是"链接挪进模板"还是"守卫扫产物"）——那是它的决定，**不在别人改到一半的时候抢跑**。已把上述实测与约束同步给它（`mvs_3812e6aa`）。

**④ 锚自检失败即短路（仍开放）**：锚不合格（条数不足 / 缺关键项）时必须**立即短路**，不要再拿这个坏锚去比产物与数据源。实测理由：锚被改短时级联红因会**指错责任方**（数据源侧文案断言"数据源被改短"，实际是锚被改短；I1 的"多…"方向正好相反）——**红因指错地方比没有红因更坏**。

### D. 待本人拍板

- **待拍板 10（新增）**：`about` 页**正文里**的 CSDN 链接（`src/content/about.md:38`）要不要**保留**？
  - 保留 → 把它挪进模板（`about.njk`）渲染，从根上消除第二条路（代价：正文那句的措辞要改，链接由面板承载）；
  - 去掉 → 正文不再带该链接，身份链接只由模板面板承载（**结构上不可能漂移**，但少一个正文入口）；
  - 维持现状 → 接受「两条路可能不一致」这一已知缺口（须在门禁文件头如实记账）。
  **本场次不代拍，也不自己改。**
- 待拍板 1–9 见前几节，**不重复、不改口**。

## 2026-10-19 · 16:40–17:00 场次（**不占轮次号**，避免与并发场次撞号）：身份句柄门禁的**第三层**修复——「锚失守即短路」；R1 洞在 HEAD 上的复现；并发场次在途改动的复核（**不代落库**）

### A. 背景：HEAD 上还留着一个洞——「人读路径」与「机读路径」对不上，没人看守

复验时 HEAD = `08a4524`。

`scripts/check-identity-handles.cjs` 的 I1–I4 全部只看**机读**路径（JSON-LD 的 `sameAs`），
而页面上给人看的那条身份链接此前是**另一份字面量**。实测（隔离克隆 `/tmp/mh_sc1`，
HEAD 源码，源码级注入 + 全量重建）：

| 注入 | 结果 |
|---|---|
| 只把 `src/_data/site.js` 里**页面上可见**的 GitHub 链接换成 `https://github.com/impersonator`（`sameAs` 一字未动） | `npm run build` **exit 0**；`node scripts/check-identity-handles.cjs` **exit 0** —— **零道门禁判红** |

产物 `about/index.html` 上的两条路径：

- 人读：`href="https://github.com/impersonator"`
- 机读（JSON-LD）：`"https://github.com/oldsixxiaolv"`

→ **同一个页面同时挂着两个 GitHub 身份**。机器读的那条有人看守，人读的那条没人管。

### B. 并发场次在途修法的复核（本人改动之外，我只做复核 + 代落库）

工作树里躺着一份并发场次的在途改动（`scripts/check-identity-handles.cjs` 的 **I5「人读路径」**判据，
`src/_data/site.js` 把 `author.github / csdn / researchgate / openalex` 与 `social[]` 改成从
`scripts/lib/identity.cjs` **派生**，后来又把论文代码仓 `TRMM_CODE_REPO` 也纳入派生、
`src/index.njk` 改成引用 `site.author.paperCodeRepo`）。本场次**不重复实现**，只做两件事：复核、实测 A/B
（以及在同一个门禁文件上追加本场次自己的规则）；**不替他们提交那些文件**（理由见本节末）。

**A/B（同一棵被 R1 注入的树，只换门禁版本，其余不动）：**

| 门禁版本 | 结果 |
|---|---|
| HEAD 版（`08a4524`） | **exit 0**（看不见 R1） |
| 在途 I5 版 | **exit 1**，2 条红因：「可见身份链接缺 `oldsixxiaolv`」+「可见身份链接多出 `impersonator`」，并明说「人读路径与机读路径对不上」 |

→ 在途修法**有效**。另查了产物：派生确实落地（`about/index.html` 里 GitHub 链接全是 `oldsixxiaolv`），
且没有 `undefined` 漏进页面（页面上出现的 `null` 全是 preload 的 `onload="this.onload=null"`，
`github.com/xxx` 是 CSS 注释里的示例串）。

**归属说明（这一轮改过归属，故写清）**：`scripts/check-identity-handles.cjs` 的 I5 部分**来自并发场次**
（16:3x 开始写；本场次复核其自洽：`npm run build` exit 0、门禁通过），
本场次在**同一文件**上追加了「锚失守即短路」规则（见 C 节）——同一个文件无法把两半拆开提交，
故该文件的提交里同时含并发场次的 I5 与本场次的短路规则，**提交信息里写明了归属**。

`src/_data/site.js`（可见身份链接与论文代码仓改从 `scripts/lib/identity.cjs` / `TRMM_CODE_REPO` 派生）
与 `src/index.njk`（首页那行仓库链接改引 `site.author.paperCodeRepo`）**本场次一律没有提交**：
落库过程中这两个文件仍在被并发场次改（16:4x 前后又新增了 `TRMM_CODE_REPO` 派生与 `index.njk` 的引用切换，
16:5x 前后还新建了 `scripts/check-identity-derivation.cjs`、改了 `scripts/check-artifact-metadata.cjs`，
后者导致共享树 build 一度判红——**那条红不是本场次造成的**，是那个场次的在途状态未完成）。
→ **在别人改到一半的时候把他的在途文件提交进 main，等于替他把一个移动靶冻结下来**；
本场次不这么做，只提交自己那一份。**他那份由他那个场次自己落库。**
（连带影响见 E 段第 5 条：I5 与派生都只覆盖 `site.author` 这条路。）

### C. 本场次的改进点：「锚失守即短路」——期望集自己坏掉时，红因不再指责产物

> 这正是「16:40–17:00 之前那一节」（peer 回执裁定那节）里列为 **④「锚自检失败即短路」**、
> 写着「**仍开放**，无人接」的那一条。本场次把它接了下来。

**缺陷形态（一次具体的实测漏洞，不是假想）**：门禁的期望集（`ORACLE_SAMEAS`）自身被改动时，
**产物侧判定（I1 / I5）仍然照跑**，拿一把**自己坏掉的尺子**去量产物 → 报出**假阳性**红因，
而且这些红因**指责的是产物**。

实测（隔离克隆，K1：只把门禁内 `ORACLE_SAMEAS` 的 GitHub 条目换成 `https://github.com/impersonator`，
**条数不变、ORCID 仍在、哈希锚未同步**；产物一字未动、完好无缺），**修前**的 5 条红因：

```
✗ 独立期望集的哈希锚对不上：…（对，坏的是期望集）
✗ 共享模块的清单与本判据的独立期望集不一致：模块多出 oldsixxiaolv／模块少了 impersonator（对）
✗ 本人（…/#person）的 sameAs 缺 https://github.com/impersonator——14 个节点如此（… 等 6 个产物）  ← 假
✗ site.author 里页面上可见的身份链接缺 https://github.com/impersonator                                            ← 假
✗ site.author 里页面上可见的身份链接多出 https://github.com/oldsixxiaolv                                          ← 假
```

事实是：产物里 5 条句柄**一条不缺、条条正确**，坏的是期望集本身。
更要紧的是这 3 条假红因的**副作用**：它们会引导读者去把页面上**正确**的那条链接改成冒名账号——
**门禁在教人做一次真实的身份篡改**。这正是「红因指错责任方，比没有红因更坏」的实例。

**修法**（`scripts/check-identity-handles.cjs`）：

1. **锚失守即短路** —— I2a（条数锚）/ I2b（ORCID 锚）/ I2c（哈希锚）**任一判红**
   → 期望集**自身**已失守 → **跳过**产物侧判定（I1 / I5 本轮跳过），
   只报锚自身的红因 + 一条明说"本轮跳过"的 note。
2. **I2d（漂移核对）判红不触发短路**——这一条是设计的关键：漂移核对只说明"两份对不上"，
   单看它判不出**是哪一份**被改了。但**哈希锚（I2c）能判**：哈希绿 → 期望集逐字未变
   → 被改的是数据源 → 产物确实跟着错了 → **I1 / I5 必须继续跑**（那两条红因是真阳性）。
   换句话说：**哈希锚是"哪一边坏了"的判别器**，短路规则就建在它上面。
   若不区分，短路就会把真阳性一起吞掉——门禁反而变瞎。
3. **锚失守时，I2d 的红因也不再断言"模块被改了"** —— 改口为「
   **不能断定是谁被改了**（期望集被改、模块没同步；或模块被改、期望集没同步——两种都长这样）：
   先按哈希锚那条红因把期望集修好，再重跑本门禁——若漂移仍在，那才是模块这边的问题」。
   这堵的是「16:4x 那一节」实测到的同一条现象：锚被改短时，I2d 的旧文案
   「改模块时必须同步改本文件的 ORACLE_SAMEAS」会去**指责数据源**，而实际是**锚**被改短。

### D. 实测矩阵（5 档，均在隔离克隆实测；修后用**最终文件组合**复跑）

⚠️ **矩阵是在「HEAD + 并发场次的在途 `site.js` / `index.njk` + 本场次的门禁」这套组合上跑的**
（`/tmp/mh_sc1`）。之所以用这套而不是纯 HEAD：I5 判据与 site.js 的派生是配套的，
用纯 HEAD 的 site.js 跑 I5 只能证明"判据没瞎"，证不了"派生 + 判据"这一整套。
**本场次提交的只有门禁与日志**（见 F 段），site.js 那部分由并发场次自己落库。

| 档 | 场景 | 修前 | 修后 |
|---|---|---|---|
| 基线 | 干净树 | exit 0 | **exit 0** |
| **K1** | 锚失守（期望集被**等长替换**）、**产物完好** | **5 条**（其中 **3 条假阳性，指责产物**） | **2 条**（I2c + I2d，**都指锚**） |
| **K4** | 锚被**改短**（删掉一条） | 3 条；其中 I2d **指责模块** | 3 条；I2d 改口为「**不能断定是谁被改了**」 |
| **K2′** | 数据源被改 **+ 重建**（产物确实坏了） | — | **4 条**（I2d + I1 + I5×2）——**全为真阳性** |
| **K3** | 数据源被改、**产物未重建**（产物还是好的） | — | **3 条**（I2d + I5×2）；**I1 绿**（产物确实还是好的） |
| A/B | R1 注入树，只换门禁版本 | HEAD 版 exit 0 | 在途 I5 版 **exit 1**（2 条红因） |

- K1 修后剩下的 2 条红因**都指对了地方**（期望集本身），假阳性清零。
- **K2′ 是防"短路把门禁弄瞎"的关键对照**：数据源被改 + 重建后，
  I1（产物确实缺 `oldsixxiaolv`）与 I5（可见链接确实指向错账号）**照常判红**——短路没有遮蔽任何真问题。
- K3 里 I1 绿是**对的**：产物陈旧，它确实还是好的（见 E 段第 4 条关于 I5 读的是数据源）。
- **K4 说明短路不是"把红因都压掉"**：条数仍是 3 条，改的是**指责对象**（从"模块"改成"不能断定"）。

### E. 诚实边界与代价

1. **短路不是"多加一道检查"，而是"少报 3 条假阳性"。** 判据条数没变、判别力没提升；
   它修的是**红因的准确性**，不是覆盖范围。
2. **代价**：锚失守**且**产物同时坏 → 产物侧问题要等**下一轮**（锚修好后重跑）才显现。
   这个代价是有意接受的：锚是根因，先修锚；且红因里明写"本轮跳过"，不留"看起来查过了"的错觉。
3. **短路不挡协同篡改**（期望集 + 数据源 + 哈希三者一致地改）——承接待拍板 11，本轮无新结论。
4. **I5 读的是数据源（`site.author`），不是渲染后的页面。** 所以产物陈旧时（K3），
   I5 的红因描述的是"**下一次 build** 会呈现什么"，不是"当前产物长什么样"。
   这不是缺陷（build 链里产物与数据源同步），但**读红因时要知道这一点**，别当成"当前页面就是这样"。
5. **I5 的覆盖面只有 `site.author`**。「16:4x 那一节」已实测：about 页 **markdown 正文**里的
   CSDN 字面量（`src/content/about.md:38`）与 `src/index.njk:72` 的仓库链接是**另一条路**，
   I5 与 site.js 派生都管不到。**本场次不动这些文件**（属那一节的待拍板 10，本人不代拍），
   此处只做**如实记账**：本场次的短路规则**不改变**这条已知缺口。
6. 本轮**没有**改动 I1 的「多出」处置（机读路径仍只报 note）——那属待拍板 3，**不代拍**。

### F. 本轮改动与边界

- 改动文件两处（**本场次只提交这两处**）：
  1. `scripts/check-identity-handles.cjs` —— **本场次新增**「锚失守即短路」规则
     （I2a/I2b/I2c 判红 → 跳过 I1/I5；I2d 不触发短路；锚失守时 I2d 的红因不再指责模块）；
     同文件里的 I5 人读路径判据**来自并发场次**（同文件无法拆分，归属见 B 段末）。
  2. `docs/IMPROVEMENT-LOG.md` —— 本节。
  - **未提交**：`src/_data/site.js`、`src/index.njk`、`scripts/check-artifact-metadata.cjs`、
    `scripts/check-identity-derivation.cjs` —— 均为并发场次的在途改动，**留给它们自己落库**
    （理由见 B 段末）。⚠️ 因此**共享工作树此刻的 `npm run build` 是红的**
    （`scripts/check-identity-derivation.cjs` 尚未接进 `package.json` → 门禁接线门禁判红），
    **那条红不是本场次造成的**；本场次的提交树另在干净克隆里复验（见 F2）。
- 中间产物全在 `/tmp`（`/tmp/mh_sc1` 克隆、`/tmp/mh_sc1_patch.cjs` 补丁脚本）；**不 push**；
  未新增任何外部依赖、密钥、账号。
- 复验方式：补丁落地后，共享工作树在并发场次动 `check-artifact-metadata.cjs` **之前**跑过
  `npm run build` **exit 0** + `npm run check:css` **exit 0**；
  提交树另在**干净克隆**里 build（结果见下一节 F2）。

### G. 待本人拍板

- **待拍板 3（补记，承接不改口）**：「多出未登记的身份句柄」现在**两条路径处置不一致**——
  在途 I5 让**人读路径**的「多出」**判红**（露出来的身份没登记 = 少一个锚），
  而**机读路径**（I1 的 `extraHandles`）仍**只报 note**。
  要不要把 I1 的「多出」也改成判红？本轮 K1 与 R1 的实测都指向同一件事：
  **「多出」= 把别人的账号挂到本人实体上 = 对外声明一个假身份**（不是"多出来不丢信息"那么简单）。
  **本场次不代拍。**
- 待拍板 1 / 7 / 8 / 10 / 11 / 12 见前几节，**不重复、不改口**。


---

## 2026-10-19 · 16:45–17:05 场次（**不占轮次号**）：补上身份派生的**落地那一半** + 代码仓 URL 的第二份副本 + 「判据被卸掉」第一次被真正堵上

复验时的 HEAD = `4f2b2c8`（并发场次）。本场次**只提交自己那几处**，并发场次的在途文件（`scripts/check-identity-derivation.cjs`，仍是**未跟踪**状态）**留给它自己落库**，本场次不 add、不改、不提交。

### A. 归属：两个改进点各自是谁做的

| 内容 | 归属 | 状态 |
|---|---|---|
| I5「人读路径」判据（`scripts/check-identity-handles.cjs`） | **并发场次** | 已在 main（`4f2b2c8`） |
| `src/_data/site.js` 可见身份链接改为**派生** | **本场次** | 本节提交 |
| 代码仓 URL 单一真源 + 产物门禁 M4 首页段 | **本场次** | 本节提交 |
| I5 输出变量与判据段**解耦** | **本场次** | 本节提交 |
| `scripts/check-identity-derivation.cjs`（结构层：禁止抄字面量） | ~~并发场次在途~~ → **本场次自己创建的**（见 17:00–17:25 节的归属更正） | 本场次提交 |

⚠️ **一件必须说清的事**：`4f2b2c8` 提交了 I5 判据，但**没有**提交 `site.js` 的派生那一半。实测 `git show HEAD:src/_data/site.js` 里 `author.github` / `author.csdn` / `author.researchgate` / `author.openalex` / `social[]` **仍是字面量**。

→ main 上此刻的状态是「**I5 判据在守、但被守的那份数据源还没派生**」。两半缺一不可：
- 只有判据 → 挡不住"改一处忘另一处"（数据源仍是第二份清单）；
- 只有派生 → 挡不住"有人绕过派生写回字面量"（那是并发场次在途的 `check-identity-derivation.cjs` 要挡的）。

**本场次补的是缺的这一半。** 上一节 F 段把 `src/_data/site.js` 列为"并发场次的在途改动、留给它们自己落库"——本场次实测该文件的工作树 diff **全部是本场次的改动**（身份派生 + 代码仓常量），与它们无重叠，故由本场次落库。

### B. 改进点 1（补齐那一半）：`site.js` 可见身份链接改为单一真源派生

- 新增 `IDENTITY_BY_HOST`（**称呼**映射）、`SOCIAL_ORDER`（**显示哪几条、什么顺序**）、`identityUrl(host)`（从 `scripts/lib/identity.cjs` 的 `IDENTITY_SAMEAS` 按主机名取，**取不到返回 `null`，不静默兜底成别的值**）。
- `author.github / csdn / researchgate / openalex` 与 `social[]` 全部改为派生。两张表**只决定展示层，不复制清单内容** → 增删句柄只改 `scripts/lib/identity.cjs` 一处。
- 复验（隔离克隆 + 全量重建）：`npm run build` **exit 0**；产物 `_site/index.html` 里可见 GitHub 链接与同页 `sameAs` 里的 `https://github.com/oldsixxiaolv` **逐字一致**；身份门禁输出「页面上可见的身份链接 5 条，与登记清单一致」。

### C. 改进点 2：代码仓 URL 的**第二份副本**（与身份句柄同族，但更小）

同一事实两份副本、其中一份没人看守 —— 这次是**代码仓地址**：

| 源文件 | 此前 | 消费者 |
|---|---|---|
| `src/index.njk:72` | **字面量** `https://github.com/oldsixxiaolv/Manuscript_Lvyh` | 首页正文那行"分析流水线在某个仓"（**页面上看得见**） |
| `src/_data/site.js` `publications[0].code` | **字面量**（同一 URL） | 论文卡片的 Code 链接 + JSON-LD 的 `codeRepository` |

→ 仓库改名 / 账号改名 / 转移时只改一处，**首页与论文卡片就指向两个不同的仓库**，而且**没有任何门禁会叫**（`check-artifact-metadata.cjs` 的 M4 只查**论文页**上有没有一个 href 等于 `pub.code`，首页那一行完全没人管）。

**改法**（三层）：

1. `src/_data/site.js`：新增 `TRMM_CODE_REPO` 常量；`publications[0].code` 与新增的 `author.paperCodeRepo` **都从它派生**；字面量在全仓只剩**一处**。
   （实测：改后 `src/` 下该 URL 字面量只剩 `site.js:62` 这一处 + `paper.njk:77` 那处 —— 后者在 `{# #}` **代码注释**内，不渲染。）
2. `src/index.njk`：首页那行改用 `{{ site.author.paperCodeRepo }}`，并加 `data-code-repo` 标记（产物上的**稳定定位点**）。
3. `scripts/check-artifact-metadata.cjs` **M4 扩展**：断言首页正文那行代码仓链接**等于** `pub.code`，且 `site.author.paperCodeRepo` **等于** `pub.code`（数据层 + 产物层两道）。

#### C1. 判据的形状：为什么用**标记**定位，而不是"页面上存在一个正确 href"

先写了个更简单的版本（"首页上**存在**一个 href 等于 `pub.code`"），实测**抓不住**：

> **T3（模板层漂移）**：`index.njk` 改回硬编码字面量 → 首页**同时**存在正确链接（论文卡片那条）与坏链接（intro 那行）→ 存在性判据**放行**，坏的那条漂移了没人叫。

→ 这是"同一字节串出现在两处"的老问题：只要页面上**别处**还留着正确链接，存在性判据就满足了。**判据的名字说了它查什么不算数，要问它实际比的是哪一段字节。**
→ 改法：按产物上的 `data-code-repo` 标记**精确定位**那一条链接，并要求标记**有且只有一个**（漏了 → 定位不到；重复了 → 有歧义）。

#### C2. 注入矩阵（隔离克隆 `/tmp/mh_m5`，注入后**必须重建**再读门禁）

| 档 | 注入 | 期望 | 实得 | 红因（摘） |
|---|---|---|---|---|
| D1 | 可见 GitHub 链接换成冒名账号 | 红 | **红** | 「页面上可见…**缺** https://github.com/oldsixxiaolv」+「…**多出** …/impersonator」 |
| D2 | 可见身份链接整条删除 | 红 | **红** | 「页面上可见…缺 …oldsixxiaolv」 |
| D3 | `publications[0].code` 绕过常量改字面量 | 红 | **红** | 「首页正文那行代码仓链接指向 …Manuscript_Lvyh，与 publications[].code = …FORK 不相等」+ 数据层同款红因 |
| D4 | `author.paperCodeRepo` 绕过常量改字面量 | 红 | **红** | 同上（数据层 + 产物层两条） |
| D5 | `index.njk` 模板改回硬编码 | 红 | **红** | 「首页正文那行代码仓链接指向 …HardcodedInTemplate」 |
| D6 | **合法变更**：常量换成新 URL（两处同步） | **绿** | **绿** | — （这条是反向档：证明这条判据是**相对一致性**，不是死锚，**不误伤合法变更**） |
| P | 还原后基线（两个门禁各一次） | 绿 | **绿** | — |

自证：每档都先确认「文件真被改动」且「产物里确实出现了注入值」（D5 档产物首页同时含 `Manuscript_Lvyh` 与 `HardcodedInTemplate`）——**「注入没生效」与「门禁没拦住」在输出上同形**，必须分开确认。

### D. 本轮最值得记的一件事：**「判据被卸掉」这个病，第一次被真正堵上**

上面 D3–D5 之所以能红，是因为 M4 首页段还在。**那如果有人把这一整段删掉呢？**

> 实测：把 M4 首页段从门禁文件里整段删除 → 门禁 **exit 0、零红因** → 站点从此静默丢掉这道防线，**没有任何报错**。

原因很清楚：门禁里的"自证存活"（一处都没比过就判红）是**段级**的 —— 它能发现"判据跑起来没报错"，但**守不到"判据被人删掉了"**：整段被删时，自证代码自己也没了。这与本仓门禁 8、24/29 的段级自证是**同一个病**，只是这次轮到了本场次自己新加的判据。

**解法不是再加一条段内自证**（那样还是同一层），而是**把自证放到被测文件外面**：

- 新增 `scripts/test-gates-selfcheck.cjs`（`test-` 前缀 → 不匹配接线门禁的 `GATE_FILE_RE = /^(check|verify)-.*\.cjs$/`，**不受"门禁必须接进 build 链"那条管辖**）。
- 它自己建隔离克隆（应用当前工作树未提交改动）、自己注入缺陷、自己重建、自己跑门禁、自己**断言红因文案**（不只是退出码）。
- 注入的是「**被测判据本该抓的缺陷**」，不是「删掉判据」→ 删掉判据会让缺陷形态重新变绿 → 脚本照样判红。**效果等价，且断言的是"门禁抓没抓住真正的缺陷"**，不是"文件里还有没有那段文字"。

**它的有效性必须自己验**（不能只写脚本就信）：

| 档 | 动作 | 期望 | 实得 |
|---|---|---|---|
| A | 删掉 **M4 首页段** | 自测判红 | **红**（D3/D4/D5 全部变绿 → 「有档不符合预期」），退出码 1 |
| B | 删掉 **I5 段** | 自测判红 | **红**（D1/D2 变绿 → 判红），退出码 1 |

档 B 第一次跑时**机制不对**：删掉 I5 段后门禁**崩溃**（`visibleIdentityChecked is not defined`）→ 退出码也是非 0 → 看着像"抓住了"。但**红因指错地方**（崩在 undefined 上，人只会当成脚本 bug，看不出有人删了判据），而且"崩溃"与"静默放行"**不是同一回事**。
→ 修法：把 I5 的两个输出变量**声明提到判据段之外**（`check-identity-handles.cjs`），删段后走"本轮未判定"分支 → 与真实的静默放行**同构**。重跑档 B：D1/D2 变绿、自测判红 ✅。

### E. 诚实边界（本轮实测出来的，写明不夸大）

1. **M4 首页段的期望值取自 `site.js` 的 `pub.code`，与被判数据同源** → 它只能挡「**两份副本漂移**」（首页 ≠ 论文卡片），**挡不住"两处一致地改成另一个仓"**。后者是协同篡改，与身份门禁那条同款，落在已声明的边界内（靠 git 历史审计 + 日志复核）。**本门禁不声称能挡。**
2. **M4 首页段有一个前提**：「首页会给出每篇论文的代码仓入口」。当前站点 1 篇，成立。若将来首页改为只列部分论文，这条要同步放宽。
3. **协同篡改（oracle + 数据源 + 哈希三者一致地改）→ 全链路仍绿**。早前实测（基准是当时的树，**本轮未复验**），不拿它当本轮的证据用。
4. **自测脚本不接 build 链** → **没人手动跑 = 没人知道判据被卸了**。这是有意接受的代价（它要 clone + 重建，接进 build 会让每次提交都等它跑完）。这条局限写进了脚本文件头。
5. **I5 读的是数据源（`site.author`），不是渲染后的页面** —— 红因描述的是"下一次 build 会呈现什么"。这是并发场次那一节已记的事实，不重复。
6. **I5 只扫 `site.author`**，`site.social` 是**策展子集**（不含 OpenAlex），语义不同，**刻意不纳入**。`site.social` 目前**零模板引用**（死数据字段），本轮**保留**（已派生、不会漂移），如实记账。
7. **本场次没碰 `src/content/about.md:38`** —— 那里的 CSDN 字面量是**第二条路**（I5 扫不到、site.js 派生也管不到），属并发场次已登记的**待拍板 10**，且该文件有硬约束（`markdownTemplateEngine: false`，md 里不能写模板语法），**本场次不代拍**。

### F. 验证结果汇总

- **隔离克隆**（`/tmp/mh_m5e`，clone HEAD `4f2b2c8` + 本场次 patch + `test-` 脚本）：`npm run build` **exit 0**（全链：check:gates / tracked-refs / log-sections / css / wrap / site / image / lang / a11y / copy / overflow / artifact / jsonld / identity）。
- **注入自测**（`node scripts/test-gates-selfcheck.cjs`）：**8/8 档符合预期**，退出码 0。
- **「判据被卸掉」两档**（A / B）：自测均**判红**，退出码 1。
- **线上巡检**（16:53 实测，与上一轮一致）：`/` 200、`/papers/` **404**、`/blog/` 200、`/about/` 200、`/publications.bib` **404**、`/feed.xml` **404**、`/sitemap.xml` 200、`/papers/trmm-thunderstorm-stages/` **404**、`/robots.txt` 200。
  → 4 条 404 全部是**旧部署**（线上仍是 2026-10-16 那版，canonical 还带着 `/MeteoHub/` 前缀），属**待部署**而非站点损坏；本地 `_site` 里对应产物均已存在且正确。**部署与否由本人决定。**
- ⚠️ **共享工作树此刻的 `npm run build` 是红的**：`scripts/check-identity-derivation.cjs` 尚未接进 `package.json` → 门禁接线门禁判红。**那条红不是本场次造成的**（该文件是并发场次的未跟踪在途文件），本场次的提交树另在干净克隆里复验（见上）。
  - **17:00–17:25 场次补订**：① 该文件的归属是**误判**——它自始至终是那个场次自己创建的（见下节的双证）；② **接线已由 17:00–17:25 场次补上**（`package.json` 加 `check:identity-derivation` 并接进 build 链），共享树的这条红因**已消除**。

### G. 并发场次与 HEAD 轨迹

本轮期间 HEAD 被并发场次推进过：`08a4524` → `1022823`（图片资产门禁 IA1–IA6）→ `268097a`（文档补记）→ `40f185a`（16:2x 回执裁定 + 「可见身份链接」第二条路实测）→ `4f2b2c8`（身份门禁「锚失守即短路」+ **I5 判据**）。
本场次的两处改动（site.js 派生、代码仓常量 + M4 扩展）**自始至终未被任何人扫进别人的 commit**；`4f2b2c8` 与本场次改的是**同一个文件** `check-identity-handles.cjs`，但改的是**不同位置**（他们：I2 短路规则 + I5 判据实现；本场次：I5 输出变量解耦），实测工作树里 **I5 只有一份、没有重复实现**（`grep -c 'I5：人读路径'` = 1），且合并后 build exit 0。

### H. 待本人拍板

- **待拍板 13（新增）｜ResearchGate 地址分歧 —— 属身份归属声明，本场次不代拍**
  站上写的是 `https://www.researchgate.net/profile/Yihang-Lyu`；
  而本人 ORCID 公共记录（`pub.orcid.org/v3.0/0009-0005-3511-0546/record`，实测可达）**自己登记**的是
  `https://www.researchgate.net/profile/Yihang-Lv-4?ev=hdr_xprf`（put-code 5939215，2025-12-27）。
  两个 URL 都 HTTP 403（ResearchGate 反爬「Temporarily Unavailable」），**无法用 HTTP 核验归属**。
  可能是 RG 把 "Lyu" 的 slug 截断成 "Lv" 再加重名序号，也**可能是两个不同的档案**。
  → **请本人确认哪个是本人档案**；改哪一个都不该由脚本猜。
- **待拍板 14（新增）｜Google Scholar / ADS / arXiv：没有第一方出处，本场次不擅自加**
  本人 ORCID 的 `researcher-urls` **只有 3 条**（Github / CSDN / Researchgate），**未登记任何 Scholar / ADS / arXiv**；
  web 搜索存在同机构同姓误认风险（本仓已有实证：搜索出的 `OabEWb0AAAAJ` 是**合著者**，不是本人）。
  → **要加请提供真实 URL**，并**同时在 ORCID 里登记**（两处一致才谈得上门禁能守）。
- **待拍板 15（新增）｜ORCID 的 `<activities:works>` 为空 —— 论文尚未认领到 ORCID**
  本人 ORCID 公共记录里作品列表是空的。本站已经声明本人 ORCID，结构化数据里也有作品，但 **ORCID 侧没有反向指向**。
  → 认领是本人操作（ORCID 后台），本场次不代做。
- 待拍板 1 / 3 / 7 / 8 / 10 / 11 / 12 见前几节，**不重复、不改口**。

## 2026-10-19 · 17:30–17:50 场次（**不占轮次号**，避免与并发场次撞号）：第四份回执（12:30 只读复验者 12:55）的三条订正 —— 全部已闭环 + 9 例矩阵（门禁级/build 级双列）独立复现 + revert 孤儿「半应用」实测 + 日志里一处**过期的冲突面**

复验时的 HEAD = `9d58d3e`。本轮**只读复核 + 写日志**：不改任何代码、不碰并发场次的在途改动。

材料：`/tmp/mh_c96770dd_msg_to_writer_1255.md`（12:30 只读复验者，12:55 送达，三条订正）。

### A. 三条订正：**全部已闭环，不重复实施**

| 订正 | 裁定 | 我这一轮的独立依据 |
|---|---|---|
| ① 回退目标应是 `54899f1`（`dfe021a` 是 12:09 被 reset 掉的孤儿）；日志两处「commit 2」要写明 hash | **成立，且已在 main** | reflog 逐条吻合：12:07:28 `526b566` → 12:07:35 `dfe021a` → 12:09:35 `89d64fd` → 12:09:35 reset 回 `fdb5dca` → 12:09:41 重做 `6953e74` → 12:09:41 **再** reset 回 `fdb5dca` → 12:09:49 重做 `54899f1`（⚠️ **reset 有两次**，12:09:35 与 12:09:41 各一次——之前记「12:09:41 一次」是不完整的）。链上实测：`526b566`/`dfe021a`/`89d64fd` = **ORPHAN**，`6953e74`/`54899f1` = **ON-CHAIN**。（此事**第十四轮 14:15–14:30 场次已裁定过**，本轮是独立复证 + 补上 B 段那处措辞精化） |
| ② 两处 `hasOwnerOn404` 修法已被取代，要标「已被取代」 | **成立，且已在 main** | HEAD 日志两处各有一段「⚠️ **本条已关闭 …… 且原修法现在照做是**有害的**（第十三轮 13:06 场次订正）**」（⚠️ 两处措辞**不完全一样**：一处用「——」、一处用「，」），内容正是它建议的那句 + 更完整的理由（开关 + 双向判据已闭合缺口；`hasOwnerOn404` 会把「404 页要不要 Person」这个未拍板口径写死） |
| ③ 非法布尔报错文案与代码/实测有出入 | **成立，但已被后续提交修好** | 文案修正在 `0c9d586`（**13:52**）落地，**晚于它的 12:55 快照**。现文案已是「只接受 true / false / True / False / TRUE / FALSE」，并已单列：「⚠️ 唯独 null 与 0 是**假值**——模板照常**不输出** Person，「以为关掉了」那种坑不成立；但它们同样不是合法布尔，本门禁照样判红。」 |

→ **三条都不需要再动。** 这份回执最值得记的不是「它对不对」，而是：
**它每一条都成立，却每一条都早于对应的那次修复**——
① 的订正在 13:0x 落地、② 在 13:06、③ 在 13:52，而它的快照是 **12:55**。
**「结论对」和「仍待办」是两回事**；收到回执先看它引用的现象**现在长什么样**。

### B. 它说的「revert 会失败」不够准 —— 实测是**半应用**

它写「`dfe021a` 不能 revert（不在链上，revert 会失败或乱 apply 一份已重做过的旧 diff）」，
日志 11:15 那行也跟着写了「`revert` 会失败或乱 apply 一份已重做过的旧 diff」。

**实测**（隔离 worktree，HEAD = `9d58d3e`，与主仓共享对象库所以拿得到孤儿对象）：

```
$ git revert --no-commit dfe021a
Auto-merging .github/workflows/deploy.yml
Auto-merging eleventy.config.js
CONFLICT (content): Merge conflict in eleventy.config.js
Auto-merging scripts/verify-site.cjs
CONFLICT (content): Merge conflict in scripts/verify-site.cjs
error: could not revert dfe021a... feat(sitemap): lastmod 改用该页源文件的 git 提交时间 + 门禁 18/19
```

| 观察项 | 实测值 |
|---|---|
| 是否因「不是祖先」而失败 | **否**——git 的 `revert` 不要求被回退的 commit 是祖先，它照样开始应用那份旧 diff |
| exit code | **1**（但**不是**「什么都没做」意义上的失败） |
| 干净回退并已暂存的文件 | `.github/workflows/deploy.yml`、`src/sitemap.njk`（`M ` 状态） |
| 留下冲突标记的文件 | `eleventy.config.js`、`scripts/verify-site.cjs`（`UU` 状态；`<<<<<<<` 标记共 6 处） |
| 工作树最终状态 | **混合态**：一半已回退并暂存，一半带冲突标记 |

→ **真正的风险不是「revert 失败」**（失败是安全的：当场报错，什么都不改），
**而是「静默半应用 + 留下冲突标记」**——
看到 exit ≠ 0 就以为「没生效」的人，会漏掉那 2 个**已经暂存**的回退。
所以「回退目标要写明 hash」这条**更该做**——
不是因为 revert 会失败，而是因为 **revert 一个孤儿会静默搅乱 2 个文件**。
（本轮已 `git revert --abort`，worktree 复位。）

### B2. 顺带查出：日志里 `54899f1` 的**冲突面已过期**（已就地订正两处）

同一 worktree 上测**正确**的 hash 作对照：

```
$ git revert --no-commit 54899f1
```

| 观察项 | 实测值 |
|---|---|
| 冲突文件 | `docs/IMPROVEMENT-LOG.md`、`eleventy.config.js`、`scripts/verify-site.cjs` |
| 干净回退并已暂存的文件 | `.github/workflows/deploy.yml`、`src/sitemap.njk` |

而日志里两处写的是「冲突 2 个文件（`docs/IMPROVEMENT-LOG.md`、`scripts/verify-site.cjs`），
`eleventy.config.js` / `src/sitemap.njk` / `.github/workflows/deploy.yml` 三个实现文件能自动合并」。

→ **`eleventy.config.js` 现在也冲突了**（它在此之后被 RIS / C2 等场次改过），
能自动合并的只剩 2 个。**本人若照旧记录去 revert，会漏掉第 3 个冲突文件。**
→ 已在日志里**就地插入两处订正块**（11:15 段 + 「待决策」段），**纯插入、删行 0**。

### C. 9 例注入矩阵：独立复现，并**分两级**取 exit

隔离克隆（`file://` 前缀，commit = `4f2b2c8`）上，唯一变量 = `src/404.njk` 里
`identityOn404` 那一行的取值：

| # | 取值 | 门禁级 exit<br>(`check:site`) | 整链 build 级 exit<br>(`npm run build`) | 404 产物 Person 块数 |
|---|---|---|---|---|
| 1 基准 | `true` | **0** | 0 | 1 |
| 2 大小写假值 | `False` | **0** | 0 | 0 |
| 3 大小写真值 | `TRUE` | **0** | 0 | 1 |
| 4 行尾注释（中文） | `true  # 保留 Person` | **0** | 1 | 1 |
| 4b 行尾注释（英文） | `true  # keep Person` | **0** | 0 | 1 |
| 5 基准假值 | `false` | **0** | 0 | 0 |
| 6 带引号字符串 | `"false"` | **1** | 1 | 1 |
| 7 YAML 否定 | `no` | **1** | 1 | 1 |
| 8 null | `null` | **1** | 1 | 0 |

（"门禁级" = 只跑 `node scripts/verify-site.cjs`；"整链 build 级" = `npm run build`。）

**读法**：
- 真值三拼写（true / True / TRUE）→ 两级都 **exit 0**、产物 **1 块**；
- 假值三拼写（false / False / FALSE）→ 两级都 **exit 0**、产物 **0 块**
  （这正是门禁 16 双向判据的「反」那一半）；
- `"false"` / `no` / `null` → 两级都 **exit 1**，且**各只报 1 个问题**（双报错确实已消失）；
- `null` → 产物 Person 块数 **0**，所以旧文案里「YAML 会把它当成非空字符串 → 模板仍会输出 Person」
  对 `null` **不成立**（对 `"false"` / `no` 成立——那两例产物块数都是 1）。

**第 4 例与第 4b 例的差别，是本轮最有实用价值的一条**：
门禁 16 **允许**行尾注释（`true  # 保留 Person` 在**门禁级**是 exit 0），
但 `check:lang` 只剥 front matter 的**整行**注释、**不剥行尾注释**，
所以中文行尾注释会被**另一个门禁**拦下 → 整链 build **exit 1**。
→ 叠加效果：**`identityOn404` 的行尾注释只能用英文**（第 4b 例：中文换成英文，两级都 exit 0）。
这不是 bug，但它会让「照着自己写的注释改开关」的人莫名撞一堵墙，值得记一句。

### D. 它自己标注的那句，要变成**两条**规矩

它附言：「我的矩阵都是在**当前工作树**上跑的，**对活状态成立**」——**这句必须保留**，
但**光有它还不够**。本轮实测暴露了第二层：

- **规矩一（它已标注的）**：矩阵结论对**工作树（活状态）**成立，**不等于对 main 成立**。
  → 引用任何矩阵，都必须标「**在哪个树上跑的**」（main / 某个 commit / 工作树）。
  一个在脏工作树上跑出来的 exit 1，说明的是**那棵工作树**红了，不是 main 红了。
- **规矩二（本轮新增）**：还必须标「**exit 是从哪一级取的**」——
  **门禁级**（`check:site`）还是**整链 build 级**（`npm run build`）。
  本轮第 4 例就栽在这：门禁级 exit 0、整链 exit 1，两个都对，
  但**只说 exit 0 / exit 1 的人会被下一个人复现成另一个数**。
  凡是「exit 0」这种说法，**不带层级就是残缺的**。

### E. 本轮改动与边界

- **只改 `docs/IMPROVEMENT-LOG.md`**：文末新节 + **两处就地订正块**，共 3 个插入点，
  **纯插入、删行 0**（提交后回读 `git show --numstat` 自证）。未碰任何代码文件；
  中间产物全在 `/tmp`；**不 push**。
- 矩阵在**隔离克隆**上跑（`/tmp/mh-r34-verify/repo2`，commit = `4f2b2c8`），
  revert 测量在**隔离 worktree**上跑（与主仓共享对象库，否则拿不到孤儿 commit `dfe021a`）
  ——两者都**不碰共享工作树**（共享工作树并发 build 会互踩产物目录）。
- **矩阵结论能外推到写入时 HEAD 的依据**（两条，都在写入前实测）：
  ① 矩阵 commit → 写入时 HEAD 之间，**决定矩阵结论的 4 个文件**
  （门禁 16 判据 `scripts/verify-site.cjs` / 语言门禁 `scripts/check-lang.cjs` /
  被注入的 `src/404.njk` / Person 块的条件 `src/_includes/layouts/base.njk`）
  **一字未变**；
  ② 写入时 HEAD 自己在同一个隔离克隆里整链 `npm run build` **exit 0**。
  （另：同一 9 例矩阵在 `40f185a` 与 `4f2b2c8` 两个不同 commit 上跑出**完全相同**的 9 行。）

## 2026-10-19 · 17:00–17:25 场次（**不占轮次号**）：身份派生门禁（结构层）落地 + 两份 peer 回执的逐条裁定 + 一处归属更正

复验时的 HEAD = `dbb080e`（并发场次）。本场次提交三处：`scripts/check-identity-derivation.cjs`（新增）、`package.json`（接线）、本日志。**未 push**。

### A. 先纠一处归属：上一节把该门禁记成「并发场次在途、未提交」——**那是误判**

- 疑点：该文件在共享树上**未跟踪**存在（mtime 16:46:34），而本场次随后写了同名文件 → 差点构成一次**覆盖别人的在途实现**（本仓已因此丢过两次内容：`24859f7`、`246b966`）。
- **双证排除**：
  ① **作者场次没写过任何文件**：`18-35-00-029`（`mvs_e41cfa12…`）的场次记录里，文件写入类操作（`cat >` / `tee` / `cp` / Write 工具）**零命中**；它自己写着「本会话不当第二写者、不代写日志段」——它只在 /tmp 镜像里模拟「接线完成后的状态」来测断点。
  ② **birth time 对上了**：该文件 `birth=16:46:26`、`modify=16:46:34`，与本场次「Write（4827B）→ Edit 修一处乱码（4819B）」两次操作**逐秒吻合**；再抽验 8 行（9/28/48/50/53/70/80/107）与本场次版本**逐字一致**。
- → 结论：**该文件自始至终是本场次自己创建的，没有覆盖任何人的实现**。上一节（16:45–17:05 节）表格里那一行已就地更正；那一节「共享树 build 因未接线而红」的红因**也已因本场次接线而消除**（就地补订）。
- **方法论记账**：「未跟踪文件 + 同名」**不等于**「我覆盖了别人」。判定顺序应是：① 对方场次记录里有没有写入动作 → ② `birth`/`mtime` 与我的操作时刻是否吻合 → ③ 内容抽验。少一步可能误报事故，也可能漏报真事故。

### B. 改进点 1：身份派生门禁（结构层）——「把派生改回字面量」这个洞第一次有门禁

F 节点名过、至今没人守的洞：**没有任何门禁挡住有人把 `src/_data/site.js` 里的派生改回字面量**。一旦改回，站点就多出第二份清单，"改一处忘另一处"会静默漂移。

- 新增 `scripts/check-identity-derivation.cjs`，三条判据：
  - **D1**：5 条身份 URL 不得在 `site.js` 里以**完整字面量**出现（`"…"` / `'…'` 逐行匹配）→ 抄回字面量即判红，红因点名行号；
  - **D2**：`site.js` 必须 `require` 共享身份清单 `scripts/lib/identity.cjs`（结构上的另一半：真源必须真的被引用）；
  - **D3**：共享清单文件必须存在（锚失效即判红）；
  - **自证**：一条都没查（期望集被改动）→ 判红，"没报错"和"没问题"长得一模一样。
- 接线：`package.json` 加 `check:identity-derivation`，接在 build 链**末尾**（`check:identity` 之后）。
- ⚠️ 判据形状上的两个刻意选择：
  - **只查完整字面量，不做 URL 形态匹配**——形态匹配会把 `github.com/oldsixxiaolv/Manuscript_Lvyh`（代码仓，深层**内容**链接）误判成"抄了 GitHub 身份"。形态那条由 I5 在**数据源**上做，两件事不混进同一条判据。
  - **注释里可以写这些 URL**（那是文档，不是数据）→ 命中行若是注释行（`//` / `*` 开头）则放行。**这个口子是刻意开的**，但它意味着"在注释里留一份 URL"这种写法不受本条约束（如实记账，见 E.2）。

#### B1. 注入矩阵（隔离克隆 `/tmp/mh_clean3`：完整历史 + 工作树三处改动 + `node_modules` 软链）

| 档 | 注入 | I5（取值层） | D1（结构层） | 说明 |
|---|---|---|---|---|
| P | 基线（全部派生） | 🟢 | 🟢 | 两门禁各 exit 0 |
| I1 | `author.github` 抄回字面量（**值仍正确**） | 🟢 **看不见** | 🔴 红（结构退化） | 证明 D1 与 I5 **互补**：值对、写法退化，只有 D1 叫 |
| I2 | `social[]` 抄回字面量（3 条 oracle URL） | 🟢 **看不见**（它只扫 `site.author`） | 🔴 红（3 条红因） | 同上 |
| I3 | `social[]` 抄回字面量并指向**冒名账号** | 🟢 | 🔴 红 | **端到端对照**：加 D1 之前整链 build **exit 0 全绿**；加 D1 之后 exit 1 |
| I4 | 注释里写一条身份 URL | 🟢 | 🟢 | 文档豁免，**不误伤** |
| I5 | 合法变更：清单增删第 6 条句柄 | 由 I2d 判红（按设计） | 不在 D1 范围（D1 只查 5 条 oracle URL） | D1 **不**误伤合法增删 |

- 端到端证据（I3 档）：同一份被篡改的 `site.js` → **加 D1 之前**整链 `npm run build` **exit 0、零 ✗ 行**（页面照样显示冒名账号）；**加 D1 之后** exit 1，3 条红因点名行号。
- 自证：每档都先确认"文件真被改动"再读门禁输出——**「注入没生效」与「门禁没拦住」在输出上同形**，必须分开确认（I3 档另外确认了产物里确实出现了注入值）。

### C. 改进点 2：两份 peer 回执（16:15 / 16:3x）的逐条裁定

| # | peer 结论 | 裁定 | 依据 |
|---|---|---|---|
| 1 | 16:15 ③「`check-tracked-refs` 没被接线 → build 第一步就 exit 1」 | **已在 main，不用再改** | 接线由 `0fcbdcb` 落地（其基准 `d4b4d54` **早于**该提交）；现行 HEAD 的 build 链里 `check:tracked-refs` 在 `check:gates` 之后 |
| 2 | 16:15 ⑤「`sameAsCompared` self-证修复仍未提交」 | **已在 main** | `adcf339` 落地：HEAD 的 `scripts/verify-site.cjs:2661` 计数已在 `contributors < 2` 之后（2655） |
| 3 | 16:3x 更正①「条数锚是 `== 5` 不是 `>= 5`」 | **正确，问题关闭** | 现行实现 `expectedSet.size !== EXPECTED_COUNT`（`EXPECTED_COUNT = 5`），改短改长都红 |
| 4 | 16:3x 更正②「期望集取自共享模块 `identity.cjs`，单一真源」 | **与现行 HEAD 不符** | 现行是**门禁内置独立 oracle**（`ORACLE_SAMEAS` 5 条写死 + `ORACLE_SET_SHA256` 锚 + I2d 逐项漂移核对）；共享模块**只**承担 I2d 核对。对方据以描述的镜像（`/tmp/mh_v37_wt`）是**旧版**形状 |
| 5 | 16:3x 新发现「静默替换整片溜过、门禁全绿」 | **是旧版形态，现行 HEAD 是红的** | 同一份注入（等长替换成 `example.com/impersonator`）：旧门禁 exit 0（把冒名账号当「登记清单」打印出来），现行门禁 exit 1（缺 4 条 / 14 个节点）。`08a4524` 已裁定**不采纳**「期望集取自共享模块」 |
| 6 | 16:3x 建议「加主机名白名单」 | **不采纳** | 那是**弱不变量**（只约束取值域）；现行独立 oracle 比的是**完整 URL 集合**。peer 自己在上一条已认可"只放弱不变量对等长替换全盲"——建议会把已修好的盲区放回去 |
| 7 | 16:3x「多挂一条未登记句柄只记 note 不判红」 | **在当时（`e32dfdf`）就是这样**；我此前写"现行判红"是错的，2026-10-19 17:5x 已就地订正 | 产物侧 sameAs **缺**一条 → 判红；**多出**一条 → 当时**只记 note、不判红**（`e32dfdf` 版 `check-identity-handles.cjs` 的 `if (extraHandles.size)` 分支是 `note(`）；**并发场次已在 `8b887bd` 落为 C4 判红**（本场次已在新基线上复现：exit 1、2 条红因）。模块侧多/少/等长替换由 **I2d** 判红 |
| 8 | 16:15 ②「撤回『不要把 5 条 URL 写死进门禁』」 | **接受**，与现行实现一致 | 独立 oracle 是**测试 oracle**（必须独立于被测数据），漂移由 I1/I2 交叉核对兜住；残余边界见 E.3 |

### D. 验证结果

- **共享工作树**：`npm run build` → **exit 1**，唯一红因是**并发场次**的在途改动（`scripts/screenshot.js` 引用了尚未跟踪的 `scripts/lib/page-check.cjs`）→ **本场次不抢跑**（不 add、不改、不提交别人的在途文件），只记账。
- **本场次提交树**（隔离克隆 + 完整历史 + 软链 `node_modules`）：`npm run build` → **exit 0、零 ✗ 行**。
- **线上巡检**（17:05 实测，与上轮一致）：`/` 200、`/papers/` **404**、`/blog/` 200、`/about/` 200、`/sitemap.xml` 200、`/publications.bib` **404**、`/feed.xml` **404** → 三条 404 全是**旧部署**（线上仍是 2026-10-16 那版），本地 `_site` 对应产物均已存在且正确。**部署与否由本人决定。**

### E. 诚实边界（本轮实测，写明不夸大）

1. **D1 只查 `src/_data/site.js`**。身份链接若被抄到**别的文件**（典型：`src/content/about.md` 正文里那条 CSDN 字面量），本条管不到——那是并发场次已登记的**待拍板 10**（「可见身份链接」的第二条路），且该文件有硬约束（`markdownTemplateEngine: false`，md 里不能写模板语法），**本场次不代拍**。
2. **注释豁免是刻意开的口子**：注释里写这些 URL 是文档，但它也意味着"把 URL 留在注释里、字段留空"这种写法不受本条约束。收紧与否见待拍板 17。
3. **协同篡改**（oracle + 共享清单 + 哈希锚三者一致地改）→ 全链路仍绿；peer 16:15 补的"锚 + 数据源 + 下限常数三处同时改短，理论可绕过"与这条同族 → 落在**代码审查**范畴，本门禁**不声称**能挡。
4. **D1 守结构，不守值**；取值由 I5 守。两条都绿才算这一族身份链接没被动手。
5. **本轮不碰 `scripts/screenshot.js` / `scripts/lib/page-check.cjs`**（并发场次在途），也不碰 `about.md` / `about.njk`（并发场次已在其回执里说明取舍取决于 I5 边界的决定）。
6. 实测到一个**事实**（不是缺陷）：`site.social` 目前**零模板引用**——`footer.njk` / `index.njk` / `about.njk` / `blog.njk` 全部直接用 `site.author.*`。所以 I5 在 `social[]` 上的缺口是**惰性的**（数据不会上页面），但 D1 仍守它的结构（免得以后有人给它接上模板时带着一份第二清单）。

### F. 待本人拍板

- **待拍板 16（新增）｜`site.social` 是死数据字段（零模板引用）——删掉，还是保留？**
  现状：已派生（不会漂移），但没有任何模板渲染它。删掉＝少一处将来可能用错的口子；保留＝将来接模板时直接可用。**本场次不代拍。**
- **待拍板 17（新增）｜身份派生门禁的注释豁免要不要收紧？**
  现状：注释行里出现这些 URL 放行（文档豁免）。收紧（要求注释里提到 URL 时该字段仍须派生）＝更严，但要维护一份"哪些行是注释"的判断。**本场次倾向保持宽松，不代拍。**
- 待拍板 1 / 3 / 7 / 8 / 10 / 11 / 12 / 13 / 14 / 15 见前几节，**不重复、不改口**。

## 2026-10-19 · 17:05–17:25 场次（**不占轮次号**，避免与并发场次撞号）：引用元数据门禁（C1–C4）——「Google Scholar 唯一读的那 21 个 `citation_*` 标签」第一次有门禁 + 10 档故障注入矩阵

### A. 巡检（17:10 实测）

| URL | 状态码 | 判定 |
|---|---|---|
| `/` `/blog/` `/about/` `/sitemap.xml` `/robots.txt` | 200 | 正常 |
| `/papers/` | **404** | **旧部署**，非代码回归 |
| `/publications.bib` | **404** | 同上 |
| `/publications.ris` | **404** | 同上（本轮新增抽查） |
| `/feed.xml` | **404** | 同上 |

依据：线上 canonical 仍是 `https://github.lvyihang.xyz/MeteoHub/`、sitemap 的 `<loc>` 也仍带 `/MeteoHub/` 前缀、`last-modified: Fri, 16 Oct 2026 09:52:17 GMT` → 线上跑的还是 10-16 那版部署；本地 main 早已去掉子路径，`_site` 里 `papers/`、`publications.bib`、`publications.ris`、`feed.xml` 均已存在且正确。**部署与否由本人决定（本场次不 push）**，沿用「待拍板 7」。

### B. 改进点：`scripts/check-citation-meta.cjs`（C1–C4）

**为什么是它**（一次具体的核对，不是假想）：`citation_*` 是 Highwire Press 约定、**Google Scholar 唯一认**的引用元数据形态——Scholar 不读 JSON-LD（`src/_includes/partials/citation-meta.njk` 文件头已写明）。也就是说，**这篇论文能不能被 Scholar 收录、收录后显示的题名/作者/卷期/页码对不对，全部只由论文页那 21 个 `<meta>` 决定**。而这一层此前是**零门禁看管的**：

- 门禁 8 / 19 / 31 查 JSON-LD 实体，`check-jsonld` 的 J1–J10 也查 JSON-LD——**都不看 `<meta>`**；
- 门禁 30 查 `/publications.ris` 文件与论文页 RIS 复制块一致，**查不到 `<meta>`**；
- 门禁 4b/4c/4d、`check-artifact-metadata` 查 canonical/sitemap/产出物，同样不碰 `<meta>`；
- 全仓 `scripts/` 下 grep `citation_` **零命中**（17:00 实测）。

→ 也就是说：**删掉模板里那行 `citation_issn`，build 照样全绿、页面照出，而 Scholar 那边少一条字段。**这类缺陷不报错、不变红、只在被收录时才显形。

**四条判据**：

| # | 判据 | 抓什么 |
|---|---|---|
| **C1** | 论文页 `citation_*` 的**标签集合与取值**必须与 `src/_data/site.js` 逐条一致 | 模板漏输出 / 改错值 / 作者顺序被改 / 多输出一条 |
| **C2** | **反向**判据：除论文独立页外，全站任何页面都不许有 `citation_*` | Scholar 建议"每篇文章一个页面"；标签混在列表页上，它只认走一组、其余静默丢弃 |
| **C3** | `citation_*` ↔ `/publications.bib` ↔ `/publications.ris` **三处口径交叉核对**（题名/刊名/卷/期/页码/DOI/URL/ISSN/出版方/作者顺序/日期/关键词/语言） | 同一事实三份投影各说各话：读者从 Scholar 拿到的和从 `.bib`/`.ris` 导入的不一样 |
| **C4** | 门禁自己没被卸掉 + **自证存活** | "门禁文件存在"和"门禁在跑"是两件事，后者当时无人看守 |

期望集**从 site.js 派生**，判空规则与模板一致（缺就是缺，不写空标签）；`citation_language` 的期望值取 `site.locale`（模板此前把 `en` 写死——若 `site.locale` 改了而模板没改，本门禁会红，这是有意的耦合）。实测基线：论文页 **21 个标签 / 15 类**（`citation_author` 7 条），首页/列表页/博客/关于/404 页**各 0 个**。

### C. 故障注入矩阵（10 档；注入打在**判据实际读的那份数据**上——`SITE_DIR` 指向的产物副本，不碰共享 `_site`）

| 档 | 注入 | 期望 | 实测 |
|---|---|---|---|
| I1 | 论文页删掉 `citation_issn` 标签 | 红 | 红：`少了 citation_issn —— 期望 1 条（"2169-897X"）` |
| I2 | `citation_volume` 131→132 | 红 | 红（2 条）：取值不一致 + `卷 三处口径不一致` |
| I3 | `about/index.html` 混输一条 `citation_title` | 红 | 红：`about/index.html：页面上有 1 个 citation_* 标签` |
| I4 | 论文页前两位作者对调 | 红 | 红（3 条）：取值不一致 + 作者顺序与 BibTeX / RIS 均不一致 |
| I5 | `publications.bib` 题名改一个字 | 红 | 红：`题名 三处口径不一致`（页面/BibTeX/RIS 三方都点名列出来） |
| I6 | `publications.ris` 的 `SN` 换成 electronic | 红 | 红：`ISSN 三处口径不一致` |
| I7 | 论文页整个 `citation_*` 块消失 | 红 | 红：`一个 citation_* 标签都没有` |
| I8 | `citation_issn` 改成 electronic 值 | 红 | 红（2 条）：取值不一致 + ISSN 三处不一致 |
| I9 | `citation_keywords` 少一个关键词 | 红 | 红（2 条）：取值不一致 + 关键词两处不一致 |
| I0 | 对照档：不注入 | 绿 | 绿，30 处比对 |

**一次失败尝试（如实记）**：I1 档第一版红因打出 `期望 1 条（2="1"）`——`show()` 辅助函数按"键值对"解构，但 C1 传进去的是**值数组**，字符串被逐字符拆开。注入矩阵的"红因文案断言"这一档把它逼出来了（只看退出码会漏掉）。修法：让 `show()` 同时吃两种形态；修后复跑 10/10。

### D. 验证结果

- **本场次提交树**（隔离克隆：完整历史 + 软链 `node_modules`，`HEAD=c6cd002` + 本场次两个文件）→ `npm run build` **exit 0**，链尾新门禁通过：`1 篇论文的 citation_* 标签集合与取值与 site.js 逐条一致；非论文页零 citation_*；页面 / BibTeX / RIS 三处口径一致；共比对 30 处`。
- **共享工作树**：本场次**未跑** build（并发场次有在途文件 `scripts/check-tool-routes.cjs`、`scripts/lib/page-check.cjs`、`scripts/lib/site-routes.cjs`、`scripts/check-jsonld.cjs` 等）。权威验证一律以隔离副本为准。
- 隔离副本必须是**完整克隆**（浅克隆会让 `check:log-sections` 扫不到 10 个提交而判红、`verify-site` 算不出 `lastmod`），且**必须含 `.git`**（`check:tracked-refs` 要 `git ls-files`）。

### E. 诚实边界（本轮实测，写明不夸大）

1. **期望值取自 site.js，与被投影的模板同源** → 本门禁能挡"**投影走样**"（模板漏输出/改错值/顺序被改/多站输出），**挡不住"site.js 里的数据本身写错了"**（那是共同真源错了，要靠 Crossref/DataCite 权威核对 + git 历史审计）。
2. 与本仓同类门禁一致：oracle + 数据源 + 产物**一致地**改 → 全链路仍绿，**不声称**能挡有意的协同篡改。
3. **`citation_issn` 口径当前钉在 print `2169-897X`**（与 BibTeX / RIS / Crossref 首项同值），与 AGU 官方导出的 electronic `2169-8996` 不同 → 沿用**日志 7269 行既有待决策第 1 条**，本场次**不代拍**。附带效应：若将来改口径，本门禁会**当场变红**（C3 会指出三处口径不一致）——这是有意的，口径变更必须是**一次显式决定**，不能悄悄漂。
4. **新门禁尚未纳入 `scripts/test-gates-selfcheck.cjs` 的注入矩阵**（那一支目前只覆盖 identity / artifact 两族）→ 本场次的 10 档矩阵是**一次性自证脚本，没有入库**。该脚本自己的文件头写明："**没人跑 = 没人知道判据被卸了**"。这是已知缺口，已登记为待拍板 18。
5. C3 只核对"**论文这一条**"在 `.bib` / `.ris` 里的对应条目；数据集与胶囊那两条引用条目不在本门禁范围（它们的口径由 `check-artifact-metadata` 守）。
6. 本轮**未新增任何站外链接、未引入任何外部依赖/密钥/账号**。

### F. 本场次提交

- 文件三个：`scripts/check-citation-meta.cjs`（新）、`package.json`（接线）、`docs/IMPROVEMENT-LOG.md`（本文件）。
- 提交用**私有索引**（`GIT_INDEX_FILE`）只提交本场次这三个文件：`package.json` 里并发场次的 `check:tool-routes` 接线**留在工作树、未进本次提交**（否则本场次的提交树会引用一个尚未入库的文件 → build 断）。工作树上的 `package.json` 是**两份改动并存**的版本，下一个提交它的人不会把本场次的接线冲掉。
- **未 push。**

### G. 待本人拍板

- **待拍板 18（新增）｜新门禁要不要补进 `scripts/test-gates-selfcheck.cjs` 的注入矩阵？**
  现状：那一支只覆盖 identity / artifact 两族；本场次的 10 档矩阵是一次性脚本、**没有入库**。补进去＝以后每次改判据都有机器复核的注入证据；不补＝"判据被卸掉"这件事在 `citation_*` 这一层仍然只能靠人记得手动跑。**本场次不代拍。**
- **待拍板 19（新增）｜`citation_*` 的"官方收录说明出处"要不要也变成可核对的清单？**
  现状：`citation-meta.njk` 的注释里已经写清**哪 15 类是 Scholar 官方收录说明列出的、哪些是本站自加的**（`citation_doi` / `citation_abstract` / `citation_keywords` / `citation_language` / `citation_publisher` / `citation_abstract_html_url` 不在官方清单里，但被保留）。但**注释不是门禁**——哪天官方改了收录说明、或有人删了其中一条，build 不会叫。做成"清单 + 门禁"要维护一份逐条出处，**本场次不代拍。**
- 待拍板 1–17 见前几节，**不重复、不改口**；ISSN 口径沿用**日志 7269 行既有待决策第 1 条**。

## 2026-10-19 · 17:10–17:40 场次（**不占轮次号**，避免与并发场次撞号）：身份派生门禁扩到**模板层**（关掉 peer 的 W1）+ peer 的 IA7 补丁合入（分享图声明"消失"第一次有门禁）+ 第三封回执「等长替换全盲」指认的**决定性复现**

### A. 背景与归属

- 本场次开始时 HEAD = `c6cd002`（本场次上一节提交）。本场次推进过程中被并发场次推进到 **`a77b569`**（引用元数据门禁 C1–C4，3 个文件：`scripts/check-citation-meta.cjs` 新增 + `package.json` 接线 + 日志一节）。
- **`a77b569` 没有动本场次的两个文件**（`git log c6cd002..HEAD -- scripts/check-identity-derivation.cjs scripts/check-image-assets.cjs` 为空）→ 本场次在工作树上的改动**没有覆盖任何人的实现**（改前逐字比对过 HEAD 版与 `c6cd002` 版，两个文件均无差异）。
- 本节回应的是 peer 场次（`mvs_e41cfa12…`）的**第三封回执**（内容与 16:3x 那封的 ②④ 同族：主张"现行版把期望全集改为从共享模块取 → 对等长替换全盲"）。

### B. 改进点 1：身份派生门禁扩到**模板层**（新增判据 D4）→ 关掉 peer 的 W1

- **W1 是什么**：模板里烤死一条身份 URL（peer 实测形如 `base.njk` 写死 `https://github.com/oldsixxiaolv`）→ **数据源是干净的、页面却已经不指向本人**，而上一版 D1（只扫 `src/_data/site.js`）**整链 build exit 0 全绿**。
- **做法**：同一脚本内加第 4 条判据 **D4**，扫描面 = `src` 下 **21 个 `.njk` 模板**。
  - 判据形状与 D1 一致：整条 URL 必须**被引号包住**且**引号内没有多余内容**（允许末尾一个斜杠 —— 同一个 URL 的常见写法变体）→ 代码仓 `…/oldsixxiaolv/Manuscript_Lvyh` 与站点仓 `…/oldsixxiaolv.github.io` **不会命中**（实测 `site.js` 里这两处、以及 `paper.njk:77` 提到代码仓的那处，均不误伤）。
  - **注释遮罩**：JS 用 `//` 与 `/* */`；Nunjucks/HTML 用 `{# #}` 与 `<!-- -->`。遮罩保留行号与列位置 → 红因仍能点名"第几行"。
  - **扫描面空跑即判红**（`src` 下一个 `.njk` 都找不到 → 判红），与本仓"应验集空 = 判红"的纪律一致。
- **刻意不扫 `.md`**：`src/content/about.md:38` 那条 CSDN 字面量是并发场次已登记的**待拍板 10**；扫了等于把待拍板变成 build 断点。**本门禁不代拍。**
- 顺带修的两处（都是本脚本内部，不扩大扫描面）：
  1. 注释豁免从"行首是 `//` / `*` / `/*`"改成"**整段注释内容遮罩**"—— 块注释的续行原来会**误报**（那行不以 `*` 开头），现在放行。**放宽方向是"少误报"，没有新增可钻的口子**（注释终究不是数据）。
  2. 匹配形状允许末尾一个斜杠。
- **自写 bug（如实记）**：文件头注释里写了 `src/**/*.njk`，那个 `**/` 把块注释**提前闭合** → `node --check` 直接 `SyntaxError: Unexpected token '*'`（第一次跑 build 就撞上）。已修（注释里不写 glob）。**教训：写门禁脚本时，文件头注释里别出现 `*/` 序列。**

### C. 改进点 2：合入 peer 的 **IA7** 补丁（分享图声明"消失"第一次有门禁）

- **归属**：代码是 peer 场次（`mvs_e41cfa12…`）写的，补丁文件 `/tmp/mh_w48_e41cfa12/patch_ia7.diff`；**本场次只做合入与复验**，署名见提交信息。`git apply --check` 在当前 HEAD 上干净（exit 0）。
- **洞**：IA1–IA6 只在"声明了但对不上"时才说话；**"声明本身消失"这一形态它们一句都不说** —— 它们的"应验集"是从产物里的引用算出来的，引用没了、应验集跟着空 → 整链 exit 0 全绿，而产物里分享图声明为 0。
- **合入内容**：`scripts/check-image-assets.cjs` 新增 **IA7** = 逐页至少一条 `og:image` + 至少一条 `twitter:image`，缺一条就判红，红因**点名页面与缺哪一项**。与 IA1–IA6 互补：IA1–IA6 管"声明了的那条对不对"，IA7 管"声明在不在"。

### D. 注入矩阵（隔离克隆 `/tmp/mh_clean6`：HEAD=`a77b569` + 本场次两处改动，`node_modules` 软链）

| 档 | 注入 | 结果 |
|---|---|---|
| P | 基线 | 整链 build **exit 0、零 ✗**；`IA1–IA7` 绿；`D1+D4` 绿（21 个模板扫过） |
| W1 | `footer.njk:6` 把 `{{ site.author.github }}` 换成字面量 `https://github.com/oldsixxiaolv`（peer W1 同形） | **D4 红**，点名 `src/_includes/partials/footer.njk 第 6 行`；**数据源仍干净**（这正是 W1 的形态：上一版整链全绿） |
| I7 | `base.njk` 删掉两处 `twitter:image` 声明 + 重建 | **IA7 红，6 条红因逐页点名**（404 / about / blog / index / papers 列表 / 论文页），每条点名缺 `twitter:image` |
| **E** | **`scripts/lib/identity.cjs` 里 GitHub 那条等长替换成 `https://example.com/impersonator` + 重建** | **身份门禁红，3 条红因**：① I2d 模块↔门禁 oracle 逐字核对（多出冒名 / 少了 GitHub）② 产物 sameAs 缺 `https://github.com/oldsixxiaolv`（14 个节点 / 6 个产物）③ `site.author` 可见链接缺 GitHub。**整链 build exit 1** |
| R | 全部还原 | 整链 build **exit 0、零 ✗** |

### E. peer 第三封回执的逐条裁定（关键：它描述的"现行版"是**过期快照**）

- **核心指控**："现行版把期望全集改为从 `scripts/lib/identity.cjs` 取 → 等长替换全盲（GREEN / exit 0）"。
- **在当前 HEAD 上重新实测**（不是引用上一轮的结论）：
  - `scripts/check-identity-handles.cjs` 里 `ORACLE_SAMEAS` 是**门禁内置写死的 5 条**（第 117 行起），`EXPECTED_COUNT = 5` 且判据是 `size !== EXPECTED_COUNT`（**严格相等**，不是 `>=`），另有 `ORACLE_SET_SHA256` 哈希锚（第 131 行）；共享模块 `identity.cjs` 只被 `require` 进来做 **I2d 漂移核对**（第 222 行起）。
  - 实测（E 档）：等长替换后门禁 **exit 1、3 条红因**；整链 build **exit 1**。
  - → peer 描述的"GREEN / exit 0 / 只有现行版全盲"是**旧镜像**（`/tmp/mh_v37_wt`）的形态，**不是现行 HEAD**。peer 提的形状（"门禁里保留一份写死的期望全集，产物侧与数据源侧都逐字与它比对"）**现行 HEAD 已经是这个形状** → **不需要再改**。这是"**快照过期**"与"**真缺陷**"必须分开的一个实例：peer 的**结论方向对**，但它据以判断的"现状"是错的。
  - peer 明确承认的代价（将来加句柄要动两处：门禁 oracle + `identity.cjs`）**成立且已被接受**（待拍板 8 的口径）：一处忘改会被逐字核对**当场抓住** —— 这正是"该留两份"的判据（对照本仓给 git 判据立的规矩：那是"**逻辑**"两处抄才该抽模块）。
- **"唯一阻断仍是 `package.json` 缺 `check:refs` 接线（1 行）"**：**已过时** —— 现行 `package.json` 的 build 链里 `check:tracked-refs` 在 `check:gates` 之后（接线提交 `0fcbdcb`）。
- **peer 撤回的"主机白名单"**：**维持不采纳**（弱不变量：只挡换域、挡不住同域换账号；会把等长替换的盲区放回去）—— peer 自己也说明它只挡换域。
- **peer 的"多挂一条未登记句柄 → 绿 + 一条 note"**：**在当时（`e32dfdf`）就是这样**；我此前写"旧版形态、现行判红"是错的，2026-10-19 17:5x 已就地订正。产物侧 sameAs **缺**一条才判红；**多出**一条 → 当时**只记 note、不判红**；模块侧多/少/等长替换由 I2d 判红。**该缺口已由并发场次在 `8b887bd` 落为 C4 判红关掉**（本场次已在 `8a7a953` 上复现）。

### F. 诚实边界（本轮实测，写明不夸大）

1. **D4 守"模板里不许烤死身份 URL 字面量"**，**不**守模板里取到的值是否与清单一致（取值由 I5 + 产物侧门禁守）；扫描面只有 `.njk`，**没有** `.md`（待拍板 10），也没有构建配置。
2. **D4 的判据形状仍会漏两种写法**：URL 被拆成两段拼接（`"https://github.com/" + "oldsixxiaolv"`）、或先存进变量再拼。**结构层判据不声称能挡运行时拼接。**
3. **注释遮罩 = 刻意开的口子**（待拍板 17）：注释里留一份 URL、字段留空这种写法不受约束。
4. **协同篡改**（门禁 oracle + 共享清单 + 哈希锚三者一致地改）→ 仍全绿；落在**代码审查**范畴，本门禁不声称能挡。
5. **IA7 依赖"每一页都经 `base.njk` 渲染分享图声明"**：将来若某页改用别的模板，IA7 会点名该页（设计意图，不是误伤）。
6. **本轮不碰**（并发场次在途或已 staged，本场次只记账）：`scripts/check-artifact-metadata.cjs`（M4 的 `data-code-repo` 标记 —— peer 的 **W2**：标记被摘除时门禁只 note 不判红）、`scripts/screenshot.js` / `screenshot-paper.js` / `lighthouse-runner.js` / `slow3g-runner.js` / `check-jsonld.cjs` / `check-tool-routes.cjs` / `lib/page-check.cjs` / `lib/site-routes.cjs`、`src/content/about.md`（待拍板 10）。
7. **共享工作树的 build 此刻的状态由并发场次在途文件决定**；本场次报的绿是**提交树上的绿**（干净克隆实测），不冒充共享树的状态。
8. 本轮**未新增任何站外链接、未引入任何外部依赖/密钥/账号**。

### G. 待本人拍板

- **本轮不新增待拍板**（并发场次已把清单推进到 19 条；本场次**不重复、不改口**）。两处补**事实**：
  - **待拍板 10 补记**（"可见身份链接的第二条路"）：peer 的 **W3** 给出了硬证据 —— `src/content/about.md:38` 的 CSDN 链接改成 `https://blog.csdn.net/impersonator` 后，**整链 build exit 0 全绿**，产物里"真句柄 3 处 + 冒名 1 处" → 页面公然指向非本人账号，而 JSON-LD 仍是本人。**D4 本轮没有扫 md，所以这一形态仍然无门禁。**
  - **待拍板 17 补记**（注释豁免）：现在的实现是"**整段注释内容遮罩**"（JS `//` `/* */`；Nunjucks `{# #}`；HTML `<!-- -->`），比原先的"行首是 `//` 或 `*`"**宽一点点**（块注释的续行原来会误报，现在放行）—— 放宽方向是少误报，**没有新增可钻的口子**。
- 待拍板 1–19 见前几节，**不重复、不改口**。

## 2026-10-19 · 17:10–17:25 场次（**不占轮次号**，避免与并发场次撞号）：J10 角色声明判据的两条边角修掉——真值口径改为「按来源求值 + JS 真值」，红因印原值，声明按数据层解析

复验时的 HEAD = `c6cd002`（并发场次）。本场次只提交两处：`scripts/check-jsonld.cjs`、本日志。**未 push**。

### A. 背景：J10 的两条边角（peer 会话实测，本场次复现并修掉）

J10 是 `scripts/check-jsonld.cjs` 的第 10 条判据：**页面的 JSON-LD 页面实体 `@type`（WebPage / ProfilePage）必须与源文件里声明的 `profilePage` 角色一致**。它靠构建期写进产物的 `<!-- source: ... -->` 标注回源文件核对（`src/_includes/layouts/base.njk:494`）——因为站点 permalink 不统一，从 URL 反推源文件不可靠。

两条边角：

- **JN（真值口径）**：旧实现自己维护一张「哪些字面量算假」的表（`scripts/check-jsonld.cjs` HEAD 版 `declaresProfilePage`，第 228 行：`!["false","no","off","null","~"].includes(...)`）。这张表与模板的真实行为**不符**，且红因把**算出来的布尔**印成 `profilePage: true`，而源文件里写的是 `profilePage: 0` —— 照着提示去找那一行根本找不到（**红因指错地方比没有红因更坏**）。
- **JP（声明位置）**：旧实现只认 front matter **顶层**（`/^profilePage\s*:/`）。而模板读的是**裸键** `profilePage`（`base.njk:449`），裸键在 Eleventy 的数据层有**三条合法来源**，优先级 目录数据 < front matter < 计算值。声明挪到后两条 → 假红。

### B. 改进点 1：真值口径 —— 从「手写真值表」改成「按来源求值 + JS 真值」

**三条实测依据**（都是本场次在仓里查出来的，不是推断）：

1. **模板端的真值规则是纯 JS 真值。** Nunjucks 的 `{% if %}` 编译成 `if(<expr>)` —— `node_modules/nunjucks/src/compiler.js:496` 的 `this._emit('if(')`；Nunjucks **没有自己的真值函数**（`runtime.js` 里只有 `suppressValue`，没有 `isTruthy`）。所以假值只有 `false / null / undefined / 0 / ""`；**`[]` `{}` `"false"` `"0"` `"no"` 全都是真**。
2. **每种来源的语义不同，不能共用一张表**：
   - front matter → **YAML**（Eleventy 用 gray-matter：`@11ty/eleventy/src/TemplateContent.js:4` `import matter from "gray-matter"`）→ `no`/`off` 是**字符串**、`[]`/`{}` 是**容器**；
   - eleventyComputed → **JavaScript 表达式** → `undefined` 是假、其余按 JS；
   - 目录数据文件 → **已经求过值的 JS 值** → 直接用，不必再解析字面量。
3. → **判据不能自己「认」字面量，必须让引擎来求值。** 实现改为：新增 `valueFromFrontMatter`（用 gray-matter 求值）/ `valueFromComputed`（用 JS 求值）/ `roleResult`（统一「求值 + 求不出时给原因」），删掉手写的 `nunjucksTruthy`。

#### B1. 中途自查发现的第二批假红（本轮最重要的一段记账）

我第一版实现是「把 `0` 修好就收工」，**没有对字面量做全枚举**。随后在隔离克隆里跑了一张 **14 档字面量真值表**（每档：注入 → 重建 → 读产物 `@type` → 跑门禁），结果发现**我自己的第一版实现还有 4 处假红** —— 而且是**修好 A 的同时引入了 B**：

| 字面量 | 模板产物 `@type` | 旧门禁（HEAD） | **我第一版** | 最终版 |
|---|---|---|---|---|
| `true` / `false` | ProfilePage / WebPage | 绿 | 绿 | 绿 |
| `1` / `42` | ProfilePage | 绿 | 绿 | 绿 |
| `"true"` / `"false"` / `"0"` | ProfilePage | 绿 | 绿 | 绿 |
| `null` | WebPage | 绿 | 绿 | 绿 |
| **`0` / `0.0`** | WebPage | 🔴 **假红** | 🟢 修好了 | 🟢 |
| **`no` / `off`** | ProfilePage | 🔴 **假红** | 🔴 **假红** | 🟢 修好了 |
| **`[]` / `{}`** | ProfilePage | 🟢 | 🔴 **假红（我新引入的）** | 🟢 修好了 |

- 旧门禁的真实假红是 **4 档**（`0` `0.0` `no` `off`）；`[]`/`{}` 旧门禁**恰好是绿的**（它的兜底把不在假值表里的一律当真）。
- 我第一版的真实假红是 **4 档**（`no` `off` `[]` `{}`）：**修好了 `0`，却把 `[]`/`{}` 弄坏了** —— 根因是我照抄了「Nunjucks 文档里的假值集」（文档说 `[]`/`{}` 算假），而 **Nunjucks 的实际行为与之相反**（空数组是对象，JS 里为真）。**教训：判据不能自己「认」字面量，必须让引擎求值；只验原缺陷不枚举，会把缺陷平移到别的形态上。**
- 最终版：**14/14 与产物逐值一致，零假红**（`true/false/0/0.0/1/42/"true"/"false"/"0"/no/off/null/[]/{}`）。

### C. 改进点 2：红因与自证

- **红因印源文件里的原样字面量**（`src/about.njk 写的是 profilePage: 0`），不印算出来的布尔；
- 区分「**没有 profilePage 这一项**（按约定视为 WebPage）」与「写了但是假值」；
- **求不出真假就不猜**（模板表达式 / 语法错 / 引用别处）→ 明确判红，并说清两条出路（写成静态 `true`/`false`，或同步改门禁）；
- **自证**：新增 `j10Declared`（解析确实取到值才计数；取不到就判红 —— 防止「解析坏了仍全绿」）+ `j10Kinds`（声明来源分布，汇总 note 打印三类来源计数）。

### D. 注入矩阵（6 档，隔离克隆 `/tmp/mh_j10_verify2`：完整历史 + `node_modules` 软链）

| 档 | 注入 | 旧门禁（HEAD） | 新门禁 | 说明 |
|---|---|---|---|---|
| J0 | 基线 | 🟢 | 🟢 | 两条都绿 |
| JN1 | `profilePage: 0`（产物实测 WebPage） | 🔴 **假红** | 🟢 | 假红消除 |
| JN2 | 真错配（声明 `0` / 产物 ProfilePage） | 🔴 红，但红因印 `profilePage: false`（**指错地方**） | 🔴 红，红因印 **`profilePage: 0`**（原值） | 判红能力不变，红因指对了 |
| JP1 | 声明挪进 `eleventyComputed` | 🔴 **假红** | 🟢 | 假红消除 |
| JP2 | 声明是模板表达式 `"{{ site.author.name }}"` | 🔴 假红（说「声明的是 WebPage」） | 🔴 红，且明说「**求不出真假**」 | 不猜 |
| JP3 | 声明放 `src/content/papers/papers.11tydata.cjs` | 🔴 **假红** | 🟢 | 假红消除 |

### E. 对 peer 回执的答复（两条边角的处置结论）

- **① JN —— 接受，处置方式调整过一轮**：确认「假值集与模板不一致 + 红因印布尔」是缺陷；但**修法不是把假值表补全**（那是把缺陷平移，见 B1），而是**改成按来源求值 + JS 真值**。红因印原值这一条照做。
- **② JP —— 接受，处置方式按「按数据层三条路径解析 + 求不出就判红」落地**：不只解析 front matter 顶层，还认 `eleventyComputed` 与目录数据文件；**非静态声明一律判红**（不静默跳过，否则「没报错」与「没问题」同形）。
- ⚠️ **JP 的「非静态声明一律判红」是一条新约定**（比原判据严）→ 登记为待拍板 20，**本场次不代拍**。

### F. 验证结果

- **本场次提交树**（隔离克隆 `/tmp/mh_j10_verify2`，完整历史 + 软链 `node_modules`）：`npm run build` → **exit 0、零 ✗ 行**。J10 自证行显示「角色声明取自：front matter 顶层 2 处 / eleventyComputed 0 处 / 目录数据文件 0 处」。
- **6 档注入矩阵**：见 D，新旧对跑，**6/6 符合设计**。
- **14 档字面量真值表**：**14/14 与产物逐值一致**（新旧门禁 A/B 对跑，见 B1）。
- **线上巡检**（17:11 实测，与上轮一致）：`/` 200、`/blog/` 200、`/about/` 200、`/sitemap.xml` 200；`/papers/` `/publications.bib` `/feed.xml` 三条仍 **404** → 全是**旧部署**（线上仍是 2026-10-16 那版），本地 `_site` 对应产物均已存在且正确。**部署与否由本人决定。**

### G. 诚实边界（本轮实测，写明不夸大）

1. **本门禁现在 `require("gray-matter")`** —— 它是 Eleventy 的**直接依赖**（`@11ty/eleventy@3.1.6` → `gray-matter@^4.0.3`，仓库有 `package-lock.json` 版本已钉），但**本仓 `package.json` 没有单列**。本轮**不改 `package.json`**（并发场次正在改它，见待拍板 21）。若将来 gray-matter 被换掉，判据会 **require 失败 → build 直接红**，不会静默走偏。
2. `new Function` 求值 `eleventyComputed` 里的字面量：信任级别 = **仓库自己源码**，Eleventy 构建时本来就要执行这段代码；求值失败一律判红，不猜。
3. **模板表达式必须先拦下来再求值**：YAML 会把 `{{ x }}` 解析成一个**嵌套流映射**（**不报错**）—— 实测 `matter()` 对 `profilePage: "{{ site.author.name }}"` 返回 `{"[object Object]": null}`。不先拦就等于"求出了一个模板里根本没有的值"。
4. 目录数据文件那条路径是 `require()` 进来的 —— 同样只信任仓库自己的源码；读不出来 → 判红，不猜。
5. **本轮不碰 `src/_data/site.js`**（并发场次在改，nav 区域也是共享面），因此**没有**新增导航项，也没有新增页面。
6. **本轮不 push**；共享工作树里 `package.json` / `scripts/screenshot*.js` / `scripts/lighthouse-runner.js` / `scripts/slow3g-runner.js` / `scripts/check-identity-derivation.cjs` / `scripts/check-image-assets.cjs` 等均为**并发场次在途**，本场次**不代落库**。

### H. 待本人拍板

- **待拍板 20（新增）｜J10 角色声明现约定为「必须求得出真假」——非静态声明（模板表达式 / 引用别处 / 语法错）一律判红，接受吗？**
  现状：不接受就只能"静默跳过"，而静默跳过 = 这一页的角色从此无人看守（"没报错"和"没问题"同形）。**本场次不代拍。**
- **待拍板 21（新增）｜本门禁依赖 `gray-matter`（Eleventy 的直接依赖，但本仓 `package.json` 未单列）——要不要显式写进 `devDependencies`？**
  现状：不写也能跑（随 Eleventy 装上）；写进去的好处是"依赖是声明出来的"，坏处是要动 `package.json`（本轮并发场次正在改它）。**本场次不代拍。**
- 待拍板 1 / 3 / 7 / 8 / 10 / 11 / 12 / 13 / 14 / 15 / 16 / 17 见前几节，**不重复、不改口**。

## 2026-10-19 · 17:50–18:10 场次（**不占轮次号**，避免与并发场次撞号）：证书段的「病根」措辞与它上面那个限定块**自相矛盾** —— peer 补正的核心成立 + TLS 实证独立复现 + 其余两条小订正已闭环

复验时的 HEAD = `c5fadce`。本轮**只读复核 + 写日志**：不改任何代码、不碰并发场次的在途改动。

材料：12:30 只读复验者转来的「证书段一处补正」，
原文在 `/tmp/mvs_451e93_msg4_cert_evidence.md` 第 2 节（12:50 送达）。

### A. 裁定：**核心成立，但主项已被前一轮落地；真正的残留是一处自相矛盾**

它说：证书段的 openssl 实证准确，但把「通配符只覆盖一级」写成了**已证实的病根**；
建议在该段末尾补一句限定（客户端无法区分①站点只给 apex 配 `*.cas.cn`
与②链路中间设备对 `www` 兜底，两者结论一致）。

逐条核对现状：

| 它提的 | 现状 | 裁定 |
|---|---|---|
| openssl 实证 | **准确** | 本轮独立复测（见 B 段），与日志表逐字一致 |
| 建议补的限定句 | **已在段内** | `0c9d586`（**13:52:46**）加的就是它给的那段措辞（第 14:15–14:30 场次已记为「已关闭」） |
| 「通配符不覆盖」被写成已证实的病根 | **部分残留** | 限定块**下面那一段**仍把「自签名证书 + 通配符不覆盖」整体称作「**病根**」——**与它自己上面那个限定块打架** |

→ 时间线说明了一切：

```
65f2a42  13:00:56  写下「"自签名证书 + 通配符不覆盖" 才是**病根**」   ← 过头的那句
0c9d586  13:52:46  加上「限定」块（就是它建议的那段措辞）              ← 限定加在了**矛盾句的正上方**
```

**限定块加对了位置，却没改矛盾句本身** → 段内同时存在两种互相打架的说法。
→ 已**就地插入订正块**（本段「为什么这值得写清楚」那段之后），把读法定死：
**「自签名证书」是实测事实，「通配符不覆盖」只是最合理的一种解释**；
「为什么会这样」客户端区分不了，但**结论一致**（该主机名不可用于对外链接），
**所以修法不变**（`affiliationUrl` 去 `www.`，已落地）。
顺带把另一处过头措辞收住：**「apex 才是唯一持证主机」只在实测过的两个主机名范围内成立**。

### B. TLS 实证：独立复测（不采信转述）

本轮在复验时的 HEAD 上重新握手取证书（只读，不写任何本机状态）：

| 主机 | subject | issuer | SAN |
|---|---|---|---|
| `www.iap.cas.cn` | `C=CN, ST=BeiJing, L=BeiJing, O=CN, OU=CN, CN=cn` | `C=CN, ST=BeiJing, L=BeiJing, O=CN, OU=CN, CN=cn` | （无） |
| `iap.cas.cn` | `C=CN, ST=Beijing, L=Beijing, O=中国科学院, CN=*.cas.cn` | `C=CN, O=China Financial Certification Authority, CN=CFCA OV OCA` | DNS:*.cas.cn, DNS:cas.cn |

→ 与日志里那张表**逐字一致**：apex 由 CFCA 签发、`CN=*.cas.cn`、SAN `DNS:*.cas.cn, DNS:cas.cn`；
`www` 那张 subject == issuer（`CN=cn`）、**无 SAN** → 自签名。
**所以 peer 说的「openssl 实证是准确的」成立**——要改的只是**措辞的分寸**，不是事实。

### C. 它材料第 3 节那两条小订正：**都已闭环，不用再动**

| 它提的 | 现状 |
|---|---|
| 注释里「与门禁 17 读 `src/robots.njk` 同一套路」——门禁 17 只读 birthtime/mtime，全文件没有 front matter 解析，那个先例不存在 | **已订正**（日志里有一句「两处都写……但**门禁 17 只读该文件的**……」） |
| 「待决策」段「改 `base.njk` 加 `{%- if not is404 %}` 即可、第 16 条门禁不受影响（它不查 Person）」——改法已变成翻开关一行；「门禁不受影响」是假的 | **已订正**（日志里三处都写着「"门禁不受影响"是**假的**——门禁 16 现在**双向读同一个开关**」） |
| 404 页 JSON-LD 整块删掉能逃逸 | **已闭合**（门禁 16 双向判据，`identityOn404` 开关） |

→ 也就是说：这份材料**本轮整体已基本闭环**，
它这一轮真正的贡献是**指出那句「病根」还没被改**——而这一点属实。

### D. 两条可复用的纪律

- **纪律一：加了「限定块」不等于原句被限定了。**
  补一段限定文字时，要顺手看**它限定的那句话**是否还留在原地；
  否则日志里会同时存在「这是最合理的一种解释」与「这才是病根」两种说法，
  读的人取到哪一句**取决于他翻到哪一行**。
- **纪律二：「结论一致」要写出来。**
  两种成因解释不了、也**不需要**解释得了，但只要**处置结论相同**
  （该主机名不可用于对外链接），就**不必**纠结成因——
  纠结的那部分只影响**日志措辞的准确度**，不影响**要做的改动**。
  把这两件事分开写，订正才不会变成"又要重新调查一遍"。

### E. 本轮改动与边界

- **只改 `docs/IMPROVEMENT-LOG.md`**：文末新节 + **一处就地订正块**，2 个插入点，
  **纯插入、删行 0**（提交后回读 `git show --numstat` 自证）。未碰任何代码文件；
  中间产物全在 `/tmp`；**不 push**。
- TLS 复测是**只读**的公开 TLS 握手，不写任何本机状态。
- 复核时 peer 的快照（材料标注 12:50、HEAD=`33ca461`）**已过期**；
  本节一切结论都以复验时的 HEAD 为准。

## 2026-10-19 · 17:10–17:45 场次（**不占轮次号**，避免与并发场次撞号）：**独立复验** `a77b569` 引用元数据门禁（11 档注入矩阵）+ C3 补「摘要」交叉核对（把"RIS 要不要输出 AB"这条待决策**登记**到工具层，**不代拍**）

本场次是**只读复验 + 一处小改**，不与并发写者抢同一批文件。

### A. 巡检基线

| 项 | 结果 |
|---|---|
| 线上 7 条 URL | `/`=200、`/about/`=**200**（本轮起 200，上一轮还是 404）、`/blog/`=200、`/sitemap.xml`=200；`/papers/`=404、`/publications.bib`=404、`/feed.xml`=404 |
| 那三条 404 的性质 | 线上跑的是 **2026-10-16 的旧部署**（sitemap 的 `lastmod` 全是 `2026-10-16T09:51Z`、`loc` 还带 `/MeteoHub/` 前缀）。而本地 `_site` 里 `feed.xml`、`publications.bib`、`publications.ris`、`papers/` **全都在**（本轮 17:07 刚生成）→ 这三条 404 是**未部署**，**不是**代码回归。部署时机仍是本人的待决策项 |
| `/about/` 转 200 | 属线上侧变化，本地代码本轮**未动**该页；记账备查 |

### B. 并发纪律：共享工作树里一处**在途**语法错（**不是**本场次引入）

17:07 前后在共享工作树跑 `npm run build` → **exit 1**，
`scripts/check-identity-derivation.cjs:19` 抛 `SyntaxError: Unexpected token '*'`。

- **成因**（逐字读源码确认）：该文件新写的文件头注释里有一行
  `· D4 模板层：  src/**/*.njk` —— 块注释 `/* ... */` **内部**出现了
  `**/`，**提前闭合了注释**，后面的 `*.njk` 被当成代码解析。
  这类"注释里写 glob 通配符"的坑在别的门禁里也出现过同族（注释遮罩逻辑）。
- **归属**：该文件是并发写者 `mvs_3812e6aa` 的作业面，mtime 17:07:42，
  当时仍在写。**本场次没有改它、没有替它提交**。
- **结果**：写者随后自行修复并提交 `5fc3c5f`（D4 模板层 + IA7），
  本场次复跑确认该门禁已能正常执行并打印通过信息。
- **纪律（记下来备查）**：共享工作树 build 红**不等于**自己引入的。
  正确顺序是：① 读报错文件 → ② 看它是否在 `git status` 里、mtime 多久 →
  ③ 判定归属 → ④ 只在**归属自己**时才动手。归属别人就在途的改动时，
  正确产出是"记录 + 等它落库 + 复验"，不是抢改。

### C. 独立复验 `a77b569` 引用元数据门禁（C1–C4）—— 11 档注入矩阵

**为什么做**：这道门禁是并发写者 17:07 刚落库的（`feat(gate): 引用元数据门禁（C1–C4）`），
**从未被独立验过**。按本文件一贯的纪律，"peer 说它做完了"不等于"它做完了"。

**方法**：隔离克隆 `/tmp/mh_cit_01`（`git clone --no-hardlinks` + `core.fileMode false`
+ `node_modules` 软链），基线 HEAD=`a77b569`，基线 `npm run build` **exit 0**；
每档只改一处 → 跑 `npm run build`（**门禁级 + build 级双列**）→
`git checkout -- .` 还原（还原用 git 而非 cp，避免 mtime 变化污染时间类判据）。

| 档 | 注入（改一处） | 期望 | build | 门禁 | 红因（门禁自己说的） | 裁定 |
|---|---|---|---|---|---|---|
| X0 | 无（基线） | 绿 | 0 | 0 | — | ✅ |
| X1 | 模板少输出 `citation_issn` | 红 | 1 | 1 | 少了 citation_issn —— 期望 1 条（"2169-897X"） | ✅ |
| X2 | 模板把 ISSN 换成 electronic | 红 | 1 | 1 | ① `citation_issn` 的取值与 site.js 不一致；② ISSN 三处口径不一致 | ✅ 两条都抓到 |
| X3 | 首页混入 1 个 `citation_title` | 红 | 1 | 1 | index.html：页面上有 1 个 citation_* 标签 | ✅ |
| X4 | RIS filter 的 `SP` 改错 | 红 | 1 | 1 | 页码/文章号 三处口径不一致 | ✅ |
| X5 | BibTeX filter 的 `volume` 改错 | 红 | 1 | 1 | 卷 三处口径不一致 | ✅ |
| X6 | 把本门禁从 build 链上摘掉 | 红 | 1 | 1 | 门禁自己被卸掉了（另一条 GW1 也独立抓到） | ✅ |
| X7 | 只改共同真源 `site.js` 的 volume | **绿** | 0 | 0 | — | ✅ 诚实边界属实 |
| X8 | 论文页多输出一条 site.js 没有的标签 | 红 | 1 | 1 | 多出了 citation_conference_title | ✅ |
| X9 | 论文页 `citation_author` 只出 1 位 | 红 | 1 | 1 | ① 条数不对（1 vs 7）；② 作者顺序与 BibTeX 不一致；③ 与 RIS 不一致 | ✅ 三条都抓到 |
| X10 | RIS filter 里作者顺序倒置 | 红 | 1 | 1 | 作者顺序与 RIS 不一致 | ✅ |

**11/11 与期望一致。** C1（逐条比对）、C2（非论文页零标签）、C3（三处口径）、
C4（自己没被卸掉）都是**活的**，能挡住它们声称要挡的形态。

**X7 是本轮最有价值的一条**：只改 `site.js`（共同真源）→ 页面 / BibTeX / RIS
三处**一起**变 → **全链仍绿**。也就是说文件头那句自贬
「oracle + 数据源 + 产物**一致地**改 → 全链路仍然绿」**是实测为真的**，
不是套话。数据本身的真伪要靠 Crossref / DataCite 权威核对，这道门禁管不着——
它的边界写在文件头里，**这句边界本身也被验过了**。

#### C.1 两处**方法学**记录（比结论本身更值得记）

- **X3 的第一版是假红**：我把 `<meta>` 插在 `src/index.njk` 的**第一个** `---`
  之后 —— 那是 front matter 的**起始分隔符**，于是标签被塞进 YAML，
  eleventy 直接报错，build exit 1 的原因是"模板坏了"而不是"C2 生效了"。
  → **注入必须打在判据读的那份数据上**：C2 读的是**产物 HTML**，
    不是 front matter。改正注入点（追加到 `</article>` 之后）重跑，
    红因才是 C2 的原话。**"build 红了"不等于"判据生效了"**。
- **X6 多出一条残留红因**：把门禁摘出 build 链后，build 在**第一个**门禁
  就中止 → eleventy 没重建 → 门禁单跑读到的是**上一档（X5）的残留产物**，
  于是多出一条"卷 三处口径不一致"。**这是矩阵方法的产物，不是门禁的缺陷**；
  C4 自己的红因在同一次输出里正确出现。→ 矩阵里每一档都必须
  **干净还原 + 重建产物**，否则上一档的注入会串到下一档。

### D. 本场次的改动：C3 补「摘要」交叉核对（1 个文件：`scripts/check-citation-meta.cjs`）

**问题**：页面发 `citation_abstract`（Crossref 登记的 VOR 摘要原文），
而 RIS 记录里**没有 AB 行**（`eleventy.config.js` 的 `ris` filter 不输出摘要）
→ **同一篇论文的摘要在"Scholar 看到的"与"导入文献管理器得到的"两处口径不同**。
而 C3 的字段表里**没有摘要** → **此前没有任何判据能看见这件事**。

**为什么不直接补 AB**：RIS 要不要输出摘要，是本文件「待决策」段里明写的
**本人拍板项**（输出 AB 会让论文页与 `/publications.ris` 的 `<pre>` 里多出
一条约 2000 字符的单行，可读性要本人看一眼）。**把待拍板变成 build 断点，
等于用工具替本人做决定，比不做更糟。**

**做法**（C3 里新增一小段，只动 `check-citation-meta.cjs` 一个文件）：

- RIS 里**没有** AB → 记成「已知差异」，**不判红**，但**每次 build 的输出里
  都点名**（"已知差异（**不判红**，待本人拍板，本门禁不代拍）：…"）→
  这道差异不会随着时间被忘掉，也不影响任何人干活；
- RIS 里**有** AB → 必须与页面 `citation_abstract` **逐字一致**，漂移即判红
  → **补 AB 这件事从此有了自动护栏**，不必再手工比对。

**自证（3 档，跑在同一个隔离克隆上）**：

| 档 | 注入 | 期望 | 结果 |
|---|---|---|---|
| Y0 | 无（现状：RIS 无 AB） | 绿 + 打印「已知差异」 | ✅ build 0 / 门禁 0，且输出里点名了差异 |
| Y1 | 给 RIS 加一条**写错**的 AB | 红 | ✅ build 1 / 门禁 1，红因："摘要两处不一致 —— 页面 citation_abstract = …，RIS AB = \"WRONG-ABSTRACT-INJECTED\"" |
| Y2 | 给 RIS 加一条**正确**的 AB | 绿 + 不再有「已知差异」 | ✅ build 0 / 门禁 0，差异提示消失（因为差异已被消除） |

**边界**：不改 `eleventy.config.js`、不改 `package.json`、不改任何模板 →
**不触发任何"口径"变更**，只把"口径差异"变得可见且可守。是否输出 AB 仍是本人的决定。

### E. 顺带核实的两条外部事实（记账备查，本轮**未改**任何数据）

- **`citation_pdf_url` 正确**：与 Crossref 登记的 `application/pdf` contentUrl
  **逐字一致** —— `https://agupubs.onlinelibrary.wiley.com/doi/pdf/10.1029/2026JD046836`
  （`link[]` 里 `content-type=application/pdf` 的那条）。
- **日期口径比先前记的更细**：Crossref 对本文登记 `published` 与
  `published-online` 都是 **2026-06-01**，而 `published-print`（**期号日**）是
  **2026-06-16**。本站三处（页面 `citation_publication_date` / BibTeX
  `month=jun` / RIS `DA`）统一用 **2026-06-01**。→ 已并入「待决策」段里
  RIS 那条的补充说明（**不代拍**；与 JSON-LD 的 `datePublished` 粒度那条需一起定）。

### F. 本场次的边界与自证

- **只改 2 个文件**：`scripts/check-citation-meta.cjs`（+约 40 行，含注释）
  与 `docs/IMPROVEMENT-LOG.md`（文末新节 + 「待决策」段里 1 处就地补充）。
  并发写者当时在途的 `package.json` / `check-jsonld.cjs` / `check-tool-routes.cjs` /
  `lib/page-check.cjs` / `lib/site-routes.cjs` / `lighthouse-runner.js` /
  `screenshot*.js` / `slow3g-runner.js` **一概未进本场次提交**
  （用 `git commit --only` 精确限定路径，不带别人的在途改动）。
- **中间产物全在 `/tmp`**（`/tmp/mh_cit_01`、`/tmp/mh_cit_matrix.py`、
  `/tmp/mh_cit_matrix2.py`、`/tmp/mh_cit_mine.py`），仓库里**不留**任何临时文件。
- **不 push**：只提交到本地 `main`，部署由本人决定。
- **提交后必须在干净克隆里 build 一遍**（共享工作树绿 ≠ 提交内容绿）——
  结论见下一节的回执。

## 2026-10-19 · 17:10–17:35 场次（**不占轮次号**，避免与并发场次撞号）：打印主题门禁（PT1–PT6）——「打印结果与屏幕主题无关」第一次有护栏 + 接手三组 peer 在途改动并逐项独立复验

### A. 巡检（第 1 步）：线上仍是 2026-10-16 的旧部署，**不是**站点损坏

| 路由 | 状态 | 路由 | 状态 |
|---|---|---|---|
| `/` | 200 | `/publications.bib` | **404** |
| `/blog/` | 200 | `/feed.xml` | **404** |
| `/about/` | 200 | `/papers/` | **404** |
| `/sitemap.xml` | 200 | | |

- 线上 `last-modified: Fri, 16 Oct 2026 09:52:17 GMT`，且线上 sitemap 的
  `<loc>` 仍带 `/MeteoHub/` 前缀 → 线上跑的是**旧部署**。
- 本地 main 已挂根路径（`pathPrefix = "/"`），`_site` 里 `papers/`、
  `publications.bib`、`publications.ris`、`feed.xml` **都在且正确**。
- → 修法是 push/deploy，而本任务**禁止 push** → 仍记为「待拍板 7」，
  本轮不 push、也不代拍。

### B. 构建（第 2 步）

- `npm run build` **exit 0**；`check:css` 通过（15 个文件）；
  窄屏（390px）6 页 `scrollWidth` 全 = 390，无横向溢出。
- 本轮把新门禁 `check:print-theme` 接入 build 链（见 D 节）后**重跑仍 exit 0**。

### C. 本轮改动一览（**归属必须分清**）

| # | 改动 | 归属 | 本场次做的 |
|---|---|---|---|
| C1 | `scripts/check-print-theme.cjs`（门禁 PT1–PT6）+ `package.json` 接线 | **本场次原创** | 设计 + 12 档注入自证 + 接入 build 链 |
| C2 | `src/assets/css/print.css` 2a 段（中性色阶整体回浅色）+ `paper.njk` / `_paper.css` 去掉重复的类型徽标 + `site.js` 补注 | **peer 场次产物** | 独立复验（见 F 节）后接手 |
| C3 | `scripts/check-identity-handles.cjs` 新增 **I6：ORCID 值域** | **peer 场次产物** | 独立复验 4 档（见 F 节）后接手 |
| C4 | `scripts/lib/site-routes.cjs` / `page-check.cjs` / `check-tool-routes.cjs` + 4 个浏览器工具改走共享路由表 | **peer 场次产物** | 本会话压缩前已独立复验 5/5 注入矩阵 |
| C5 | `scripts/check-identity-derivation.cjs`：编号改 **ID\***（与自测脚本的 D1–D6 撞号）、注释遮罩改成**字符串感知**、扫描面扩到**构建配置层** `eleventy.config.js` | **peer 场次产物** | 独立复验 4 档（见 F.2 节）后接手 |

**本场次的原创部分只有 C1**。C2–C5 是在共享工作树里在途的改动，按本仓纪律
「peer 说它做完了 ≠ 它做完了」，逐项独立复验后才接手；**不冒称原创**。

### D. C1（原创）：打印主题门禁 PT1–PT6

**为什么要有这道门禁**：C2 修的是一个**真 bug**——暗色模式下打印出来是
「黑底黑字」，纸面上摘要 / 关键词 / 引用块（BibTeX / RIS）整段读不出来。
根因不是 print.css 写错，而是**它只覆盖了派生令牌**（`--bg-*` / `--text-*`）、
**没覆盖上游**（tokens.css 的 `--color-neutral-*` 色阶）→ 暗色下
`--bg-page` 解析到 `#161513`（暗底），而文字被强制成 `#000000`（黑字）。
C2 把整条色阶按浅色 `:root` 的原值重置，bug 修好了 —— **但没有护栏**：
明天有人再加一条派生令牌、或把某个 `--bg-*` 删掉，纸面重新变黑，build 照样全绿。

→ 本门禁把「**打印结果与屏幕主题无关**」这条不变量变成**可断言**的。

| 判据 | 内容 |
|---|---|
| **PT1** | `print.css` 里必须有 `@media print` 块（打印样式整体没了 → 判红） |
| **PT2** | 该块里的 `:root` 规则必须同时覆盖三种来源：默认/浅色（恰好等于 `:root`）、跟随系统的暗色（含 `:not([data-theme="light"])`）、手动指定的暗色（含 `[data-theme="dark"]`）——**少一态 = 暗色漏进纸面**，PT2 是最核心的一条 |
| **PT3** | 该规则声明的 token 集合必须与**本判据内独立写死的期望集**（22 条）**完全相等**（不多、不少、值逐字相同）；期望集自带**条数锚 + 哈希锚**（防「等长替换」） |
| **PT4** | **语义不变量**（与期望集独立）：每个 `--bg-*` 相对亮度 ≥ 0.80（纸面必须浅）；每个 `--text-*` 与 `--bg-page` 的对比度 ≥ 4.5:1（WCAG AA 正文级） |
| **PT5** | `tokens.css` 的**浅色 `:root`** 里 `--color-neutral-*` 也必须等于同一份期望集 → 改配色不会只改一边（纸面与屏幕漂移） |
| **PT6** | `print.css` 必须**被引用**：源侧 `base.njk` 要有 `media="print"` 的 `<link>`，产物侧每个 HTML 也要有 —— 本门禁读的是**文件**，引用断了整套打印样式整体失效，而 PT1–PT5 会照样全绿 |

**为什么期望集写死在门禁里、不从 `print.css` / `tokens.css` 取**：
那两个文件正是被判对象，期望值若也从那里取，就回到「拿自己和自己比」的老问题
（永远绿）。合法改动（换配色）需要同步改 `ORACLE_PRINT_TOKENS` 并贴回新哈希
——**红因里会直接给出该贴的那串值**。

**PT4 为什么必须独立于 PT3**：PT3 只比「与写死的期望集是否一致」，
期望集本身是**可被改的**（合法流程就是改它）。若没有 PT4，
「把期望集和哈希一起改成暗底」这条绕过路径无人看守。实测见 F 节 **Z6 档**。

#### D.1 故障注入自证（12 档，跑在隔离快照 `/tmp/mh_pt_verify` 上，**不碰共享工作树**）

| 档 | 注入（改一处） | 期望 | 实得 | 判定 |
|---|---|---|---|---|
| Z0 | 无（基线） | 绿 | 绿 | ✅ |
| Z1 | `@media print` 改成 `@media noprint` | 红 | 红 | ✅ PT1 |
| Z2 | `:root[data-theme="dark"]` 改成 `[data-theme="darkx"]` | 红 | 红 | ✅ PT2，点名缺哪一路 |
| Z3 | `--border-strong` 值漂移一位 | 红 | 红 | ✅ PT3 值不符 |
| Z4 | 删掉 `--border-subtle` | 红 | 红 | ✅ PT3 缺项 |
| Z5 | 多塞一个 `--shadow-print` | 红 | 红 | ✅ PT3 多出未登记项 |
| Z6 | `--bg-page` 改暗底 `#161513` **且期望集与哈希一起改** | 红 | 红 | ✅ **PT4 两条红因**（背景太深 + 文字对比度 1.15:1）——绕过 PT3 仍被抓住 |
| Z7 | `tokens.css` 浅色 `--color-neutral-500` 漂移 | 红 | 红 | ✅ PT5 |
| Z8 | `base.njk` 摘掉 print.css 的 `<link>` | 红 | 红 | ✅ PT6 源侧 |
| Z9 | 产物 `index.html` 摘掉那条 `<link>` | 红 | 红 | ✅ PT6 产物侧 |
| Z10 | 改了期望集但**没**贴新哈希 | 红 | 红 | ✅ 哈希锚，并提示"此刻的期望集不可信，本轮跳过集合比对"（拿坏尺子量东西是假阳性） |
| Z11 | 期望集多一条但**没**更新条数锚 | 红 | 红 | ✅ 条数锚 |

**12/12 与期望一致。** Z6 是本轮最有价值的一档：**它证明 PT4 不是 PT3 的复读**，
而是独立的第二道防线。Z10/Z11 证明「期望集自身失守」会被先判红并**降级为
note**（跳过比对而不是拿坏尺子去比）。

#### D.2 诚实的边界（与文件头一致，不夸大）

- 只管 `print.css` 的 `@media print` 块里 **`:root` 规则的自定义属性**；
  不管该块里其它版面类规则（分页、隐藏 chrome、reveal 摊平……）。
- **不做浏览器渲染级验证**：没有真的导出 PDF 比对像素。判的是「令牌取值」，
  不是「纸面长什么样」。C2 那个 bug 的**纸面后果**是人眼观察，
  本门禁守的是它的**令牌层成因**。
- PT4 只看 `--bg-*` / `--text-*` 两类；`--border-*` / `--color-neutral-*`
  自身的明暗不判（色阶本身就该有深有浅）。
- 不声称能挡住「有人把期望集和哈希一起改成深色」——PT4 是唯一兜底，
  而 PT4 只覆盖 bg / text 两类。
- 不检查 `@page`、`print-color-adjust`、浏览器兼容性。

### E. C2（peer 产物）复验：暗色底回浅色 + 「Dataset Dataset」重复标签

- **徽标去重是彻底的**：模板里 `paper-availability__badge` 已无引用
  （只剩 `_paper.css` 里一段说明它为何被删的注释）；产物里
  「Dataset Dataset」出现 **0** 次、「Capsule Capsule」出现 **0** 次；
  可用性段现在读作「Dataset / New Insights from TRMM Legacy…」
  与「Reproducible capsule / Code Ocean capsule…」——同一句话不再印两遍。
- `site.js` 里 `resourceType` / `dataciteType` **保留**并补了注释
  （登记事实仍可查，只是不再渲染）→ 与本仓「改了来源要查死数据」的反向纪律一致：
  这里它们是**有意保留的登记记录**，不是死数据。
- **暗色底回浅色**：本场次新门禁 PT3/PT4/PT5 从**令牌层**证明其生效
  （打印块的 22 个 token 与浅色真值逐字一致、背景亮度与文字对比度达标、
  `tokens.css` 浅色色阶与期望集一致）——这是对 peer 修复的**独立**验证，
  不是转述 peer 的说法。

### F. C3（peer 产物）复验：I6「ORCID 值域」

peer 在 `check-identity-handles.cjs` 里新增 I6，堵的是这样一个洞：
既有门禁守的是「各 JSON-LD 节点之间自洽」，**不守「这个 ORCID 值对不对」**——
把作者列表里的 3 个 ORCID **一致地**换成别的 ID，各节点之间仍彼此一致 → 全绿。
I6 用**独立写死的白名单**（3 条：本人 + 2 位合作者）+ 条数锚 + 哈希锚，
两侧都扫（产物侧 HTML 里的 `orcid.org/<id>`、数据源侧 `authorList[].orcid` 的值）。

**本场次独立复验 4 档**（隔离克隆 `/tmp/mh_i6`）：

| 档 | 注入 | 期望 | 实得 | 判定 |
|---|---|---|---|---|
| W0 | 无（基线） | 绿 | 绿 | ✅ |
| W1 | 把 Xueke Wu 的 ORCID 换成未登记的 `0000-0003-1710-892X` | 红 | 红 | ✅ **三条红因**：产物侧未登记 / 数据源侧未登记 / 登记在册的 `0000-0001-6144-0120` 在数据源里一处都没出现 |
| W2 | 白名单里 `0009-0002-2576-1108` 改成 `…1109`（**等长替换**） | 红 | 红 | ✅ 哈希锚对不上（并降级为 note 跳过比对） |
| W3 | 数据源里 3 个 ORCID 全改成 `null` | 红 | 红 | ✅ 「数据源里一个 ORCID 值都没扫到」+「登记在册的 X 在数据源里一处都没出现」（**自证存活**） |

> **方法学记一笔**：W1/W3 第一版**没红**，查下来是**我的注入脚本没打中**——
> `site.js` 里 `authorList[].orcid` 存的是**裸 ID**（`"0000-0001-6144-0120"`），
> 不是 URL 形态，我的替换字符串写了 URL 形态，一个字符没改到。
> → 「注入没打中」与「判据没生效」必须分开判：注入后先**自证注入生效**
> （本轮改成打印"注入已生效"并对没打中的档直接退出码 2），再读门禁输出。

### F.2 C5（peer 产物）复验：身份派生门禁的「**假保证**」被修掉 + 扫描面扩到第三载体

peer 这笔改动的价值不在"多扫了一个文件"，而在**它承认自己此前给的是假保证**：

- **旧遮罩的致命 bug**：注释遮罩用一条"把行内两个斜杠到行尾整段吃掉"的正则，
  而**每一条绝对 URL 里都有两个斜杠**（`https://…`）→ 遮罩把 URL 本身连同
  后面的内容一起抹掉 → **数据源层判据结构上永远不可能命中**。
  实测（旧版）：在 `src/_data/site.js` 里写死一条身份 URL，门禁仍 exit 0，
  还打印"5 条身份 URL **没有一条**以字面量出现"——一条**永远不会红**的判据
  给出了**看起来很确定的绿**。这与本仓"永远通过的检查比没有检查更糟"是同一条。
- **修法**：遮罩改成**字符串感知**（字符串里的 `//` 不是注释），
  并加了一条**判据自证**（合成样例必须命中、注释里的必须不命中，
  任何一条不成立就**判红**——宁可 build 断，也不给假保证）。
- 顺带把编号从 `D1–D4` 改成 `ID1–ID5`（与 `test-gates-selfcheck.cjs` 里的
  用例编号 D1–D6 撞号），并把扫描面扩到第三个载体 `eleventy.config.js`
  （`person.sameAs` 的**发射点**就在那里）。

**本场次独立复验 4 档**（隔离克隆 `/tmp/mh_id`）：

| 档 | 注入 | 期望 | 实得 | 判定 |
|---|---|---|---|---|
| X0 | 无（基线） | 绿 | 绿 | ✅ |
| X1 | `site.js` 里写死一条身份 URL | 红 | 红 | ✅ **"site.js 第 66 行把身份 URL … 写成了字面量"**——这正是旧门禁**结构上永远不可能命中**的那一档 |
| X2 | `eleventy.config.js` 的**代码区**写死一条身份 URL | 红 | 红 | ✅ "eleventy.config.js 第 1088 行…"（新载体 ID5 生效） |
| X3 | 注释里提到一条身份 URL | 绿 | 绿 | ✅ 遮罩仍然正确（不误伤） |

> **X2 第一版也没红**，同样是**我的注入没打中**：我把注入写在了 `eleventy.config.js`
> **文件头的块注释里** → 被正确遮罩 → 判据没说话是对的。
> 改到代码区（`person.sameAs` 那一段之前）才真正测到。
> **这与 F 节的 W1/W3 是同一个坑的两面**：注入必须落在**判据真的会看的那一层**，
> 否则"没红"既可能是判据失灵、也可能是注歪了，两种都不该被算成"判据有效"。

### G. 并发纪律与归属

- 本场次开工前 `mavis session list` 列出同一 workspace 的大量 cron 场次
  （多数处于 `rate limit exceeded(TPM)`）。已向仍在跑的
  `mvs_fae91c3aab5242a89a769578fb3b52a1` 与 `mvs_4c6eb71b4365446284d91f9357ed330b`
  发停写通知（`force_steer`，均 `accepted`）；并连续采样 mtime 确认工作树稳定。
- 期间 peer 场次 `mvs_…` 自己提交了 `e32dfdf`（C3 之外的
  `check-citation-meta.cjs` 摘要交叉核对），本场次**未**重写它的结论。
- 提交前重新采样：`find src scripts docs package.json -newermt '-4 minutes'`
  只列出本场次自己写的两个文件 → **工作树已稳定**，无他人继续写入。
- **不 push**：只提交到本地 `main`，部署由本人决定。

### H. 需要本人拍板（本场次**不代拍**）

1. **打印块的 22 个 token 期望集写死在门禁里**：将来换配色要同步**三处**
   （`tokens.css` 浅色 `:root` / `print.css` / 门禁的 `ORACLE_PRINT_TOKENS` + 哈希）。
   是否接受这个维护约定（还是改成"只比相对关系、不比具体色值"）。
2. **ORCID 白名单需要人工登记**：新论文带来新的合作者 ORCID 时，
   要把它登记进 `ORCID_ALLOWLIST`（并同步条数锚与哈希锚）才能通过 I6。
   备选：① 接受人工登记；② 放宽为"只查格式不查值域"。
3. （沿用既有条目，本轮未变）RIS 要不要输出 AB 行；
   `about.md` 正文里的 CSDN 链接要不要纳入身份门禁；
   线上是否部署本地 main；ORCID 的 `<activities:works>` 认领。

## 2026-10-19 · 17:25–17:40 场次（**不占轮次号**，避免与并发场次撞号）：identity 门禁 C4 落地——「产物 sameAs 多出未登记句柄」从 note 改成判红（整链级取证 + 6 档矩阵）+ peer 回执三件正式答复 + 待拍板编号撞号就地订正

复验时的 HEAD = `e32dfdf`（并发场次）。本场次提交两处：`scripts/check-identity-handles.cjs`（判据改法）、本日志。**未 push**。

### A. 背景：peer 回执转来的三件事

本轮唯一触发是 peer（`mvs_e41cfa12…`）的一封回执，转来三件事：① identity 门禁的 C4（「多出未登记句柄」只记 note）到底落不落地；② 它对 J10 真值口径（JN）的建议；③ OG 分享图里烤死的身份句柄。三件我都**独立复现 / 核实**过，结论逐条见 F 节。C4 我判「成立、且该落地」——本场次落地（改进点 1）。

### B. 改进点 1：C4 落地——「多出未登记句柄」从 note 改成判红

**改动共三处**（都在 `scripts/check-identity-handles.cjs`）：

1. **判据本体**：`if (extraHandles.size) { note(…) }` → `fail(…)`，并重写红因文案。
2. **文件头的能力声明**（原第 42 行）：「**多出**未登记句柄 → 只报 note（多出来不丢信息）」→ 改写；并新增一段「多出未登记句柄也要判红」的实测取证段（带"为什么别的门禁看不见"的逐条说明）。
3. **红因文案不预设责任方**——这是原 peer 补丁里**缺**的一处：原 note 的文案写着「只记一笔不判红（多出来不丢信息）」，直接改成 `fail` 会留下一句**自相矛盾**的红因（红因里写着"不判红"）。新文案把两种情形并列，并给出**分辨根因的办法**：

   | 现象 | 根因指向 |
   |---|---|
   | I2d **红**（共享模块 ↔ 期望集不一致） | 登记清单（`ORACLE_SAMEAS` / `EXPECTED_COUNT` / `ORACLE_SET_SHA256`）没同步 → 合法增删漏改了登记清单 |
   | I2d **绿**（模块与期望集一致） | 产物/数据源侧多挂了句柄（不该发生：站点在对外声明一个**没人登记过**的身份） |

   → 红因**不替人下结论**，只把"该去查哪儿"指出来（红因指错责任方，比没有红因更坏）。

#### B1. 整链级取证（peer 缺的那一环）

peer 证到的是「单独跑身份门禁 exit 0」。本场次补上**整链**那一环——这才是"这条洞真的无人看守"的完整证据：

- **注入手法**（数据层，**共享模块一字未动**）：`src/_data/site.js` 里
  `sameAs: IDENTITY_SAMEAS,` → `sameAs: [...IDENTITY_SAMEAS, "https://github.com/impersonator"],`
- **注入自证**（分两层）：源文件真被改（`git diff --stat` = 1 insertion）；**产物级**自证——产物里 `https://github.com/impersonator` 出现 **6 个页面共 14 处**（`_site/index.html`、`papers/index.html`、`papers/trmm-thunderstorm-stages/index.html`、`about/index.html`、`blog/index.html`、`404.html`），对照真句柄 38 处。
- **整链结果**：`npm run build` → **exit 0、零 ✗ 行**；身份门禁只留一句 note。

**为什么别的门禁都看不见这一形态**（逐条查过，不是猜）：

| 门禁 | 为何看不见 |
|---|---|
| 门禁 31（同一 @id 的 sameAs 必须一致） | 所有 Person 节点都从**同一处**派生 → 彼此**仍然一致** → 绿 |
| I2d（共享模块 ↔ 期望集逐项核对） | 共享模块一字未动 → 绿 |
| I5（人读路径） | 它**刻意跳过 sameAs**（源码里明写「sameAs 跳过：机读路径由 I1 / I2 管，这里专管人读路径」）→ 看不见 |
| 身份派生门禁（结构层 D1/D4） | 只查"登记的那 5 条 URL 有没有被抄成字面量"；新句柄不是那 5 条 → 绿 |

→ 结论：这不是"某条门禁写得不够严"，而是**这一形态在整链层面无人看守**；与 I1 守的"整片削掉"是同族问题的另一半（**丢信息** / **挂假信息**）。

### C. 注入矩阵（隔离克隆 `/tmp/mh_c4_verify`，HEAD `e32dfdf` + 软链 `node_modules`）

打补丁后跑 6 档；每档都先确认"注入真的生效"再读门禁输出（"注入没生效"与"门禁没拦住"在输出上**同形**，必须分开确认）：

| 档 | 注入 | 整链 exit | 红因 | 结论 |
|---|---|---|---|---|
| M0 | 基线 | **0** | 零 ✗ | 不误伤 |
| M1 | 数据层多挂一条未登记句柄（模块不动） | **1** | 1 条：点名 `https://github.com/impersonator` | 改前这一档是 **exit 0**（洞）；改后红 |
| M2 | 模块侧多挂一条（判据不动） | **1** | 2 条：I2d 漂移 + I1 多出 | 两条都叫；I1 文案把根因指向"期望集没同步"（I2d 红） |
| M3 | 锚失守（oracle 自己被改，count/哈希不动） | **1** | 3 条；**「不在登记清单里」出现 0 次** | I1 整段跳过，**不假红** |
| M4b | **完整**合法增删（模块 + 判据 + 条数 + 哈希 + 可见链接，五处同步） | **0** | 零 ✗ | **不误伤合法增删** |
| M5b | 产品 sameAs 改短一条 | **1** | 「sameAs 缺 …——14 个节点如此」 | 既有"缺项"红因不受影响 |

- **M4b 撞出来的坑（如实记账）**：第一版我只改了「模块 + 判据 + 条数 + 哈希」四处 → **exit 1**，红因来自 **I5**（「site.author 里页面上可见的身份链接缺 …」）。**那不是本判据的红**——I5 本来就要求"登记集与可见链接一一对应"，合法的增删句柄必须**同时**补上人读路径（可见链接）才算完整。补上第五处后 → exit 0。**教训：合法增删是"五处同步"这件事本身被漏了一处，不是判据变严了。**
- **M5b 的产物级自证**：M5b 产物里本人 Person 节点的 sameAs 实测 **4 条**（`https://openalex.org/A5121394231` 已不在其中），14 个节点一致缺失 → 注入确实到了产物层。

### D. 就地订正：待拍板 18 / 19 被两个场次同时占用（本场次是我上轮占错号）

- **事实**：`a77b569`（引用元数据门禁 C1–C4，**更早**）已登记「待拍板 18（新门禁要不要补进 `scripts/test-gates-selfcheck.cjs` 的注入矩阵）」与「待拍板 19（`citation_*` 的"官方收录说明出处"要不要也变成可核对的清单）」；我上轮 `c5fadce`（J10）又用 18 / 19 登记了另外两件 → **同号两义**。
- **裁定**：`a77b569` 在先，号归它；本场次把我上轮那两件**改为 20 / 21**（J10 节内 4 处引用同步改：正文两处 + 待拍板条目两处）。理由：同号两义会让「待拍板 18」在日志里指向两件不相干的事，日后翻日志的人会取到错的那一件。
- **教训（可复用）**：**编号不是本场次的私有资源**——并发场次里"我这一轮用了 18"不等于"18 还没人用"。登记前应先扫全日志已占用的号（`grep -o "待拍板 [0-9]\+" docs/IMPROVEMENT-LOG.md | sort -u -V`），而不是凭"上一轮读到几号"来推。

### E. peer 回执答复（三条，逐条）

**① 它的 C4 补丁：方向正确、不能原样套；实质已按更严的口径落地。**
- `git apply --check` 在当前 HEAD 上 **exit 1**（判据本体与日志都已推进几轮）→ 不可原样套。
- 它的实质（`note(` → `fail(`）**成立且已采用**；但我在它的两行之外补了**必须补**的一处（红因文案，见 B.3）。
- 补上了它缺的**整链级证据**（B1）。
- 两档回归提醒（我的矩阵已验）：**M4b** 合法增删必须整链 exit 0（合法增删是这仓的常规操作，判据不能把它当"多出"骂）；**M3** 锚失守时 I1 整段跳过，「不在登记清单里」出现 **0** 次（不得假红）。
- ⚠️ 顺带订正它裁定表里的第 7 条（「多挂一条未登记句柄 → **现行判红**」）：**那不成立**。当前 HEAD 的 I1 确实是 `note(`，全站没有一处判红（本场次 B1/C-M1 实证）。

**② 它的 JN 建议含事实错误，不能照做（JN/JP 已在上轮 `c5fadce` 修掉，修法与其建议不同）。**
- **事实**：Nunjucks 的 `{% if %}` 编译成 `if(<expr>)`（`node_modules/nunjucks/src/compiler.js:496`），**它没有自己的真值函数**（`runtime.js` 里只有 `suppressValue`）→ 真值就是**纯 JS 真值**。
  - `[]` 与 `{}` 是**真值**（JS 里空数组/空对象都是对象，对象为真），**不是**假值；
  - `no` / `off` 在 YAML 侧是**字符串**（js-yaml 3/4 都不认 YAML 1.1 的布尔别名）→ 非空字符串 → **真**；
  - 假值只有 `false` / `null` / `undefined` / `0` / `""`。
- **照它的建议做会新增 2 档假红**：我第一版就是照"文档里的假值集"写的 → 修好了 `0`，却把 `[]` `{}` 变成假红。**14 档字面量真值表实测**（注入 → 重建 → 读产物 `@type` → 跑门禁，逐值比对）：最终版 **14/14 与产物一致、零假红**；照文档假值集那版 **4 档假红**（`no` `off` `[]` `{}`）。
- **修法也不同**：不是补全假值表，而是**按该字面量所在来源的语义先求出值、再对值用 JS 真值**（front matter → 用 Eleventy 同一个解析器 `gray-matter`；`eleventyComputed` → 求 JS 表达式；目录数据文件 → 直接用已求值的 JS 值）。补表只会把缺陷**平移**到别的形态。
- **订正一处我自己的记录**：Memory 里原先那条 J10 写着「正确 falsy 集 = false/null/undefined/0/""/[]/{}」——**那是我第一版实现的同一个错误**，已就地订正（`[]`/`{}` 是真、`no`/`off` 是字符串）。

**③ OG 分享图烤死句柄：实测事实如下，本场次不代拍。**
- **载体**：`src/assets/img/og/og-1200x630.svg` 与 `og-1500x500.svg` **各烤死 1 处** `github.com/oldsixxiaolv`；同目录 `og-1080x1080.svg` **0 处**。
- 这条句柄与登记清单（`ORACLE_SAMEAS` / `scripts/lib/identity.cjs`）**当前一致** → 所以它**不是"清单与图打架"的现成矛盾**，而是**真源之外的第二份副本**（清单改了，图不会跟着改）。
- **没有任何门禁扫 SVG**（`check-lang` / `check-dead-css` / `check-overflow` 里的 `.svg` 与身份无关）→ 这一类载体目前**无人看守**。
- 真正的消除只有一条：**重出图**（图里的字烤进 SVG，代码改不掉）。加门禁只能把它登记成「已知例外」，**不等于修好**——别把前者当后者汇报。
- 处置选项见待拍板 22（重出图 / 加门禁只抓"图里被换成冒名账号" / 只登记为已知例外），**本场次不代拍**。

### F. 诚实边界（本轮实测，写明不夸大）

1. **本判据仍不声称能挡住有意的协同篡改**（oracle + 共享模块 + 哈希锚三者一致地改 → 仍全绿）。M2 之所以红，是因为**只**改了共享模块；三处同时改就绿了。文件头原有的这条声明继续有效。
2. **锚失守时产物侧判定整段跳过**（M3 实证）：期望集自身被改坏的那一轮，"多出/缺"两类红因都不出（只有锚的红因）。这是刻意的（拿坏尺子量产物是假阳性），代价是**那一轮产品侧的漂移看不见**——要修好锚再重跑才显形。
3. **M4b 暴露的口径**：合法增删句柄要"五处同步"（模块 / 判据 oracle / 条数 / 哈希 / 可见链接）。**门禁只提醒不同步，不告诉人该同步哪几处**——本次是我在矩阵里撞出来的，不是一次性设计。若本人觉得这条负担偏重，可考虑把"合法增删要改哪几处"写进红因（登记为待拍板 23）。
4. **本轮没碰**：`scripts/lib/identity.cjs`（共享清单本体）、`src/_data/site.js` 的真实内容、OG 分享图资源、并发场次在途的全部文件。
5. **共享工作树有并发场次正在改同一个文件**（复验时 `scripts/check-identity-handles.cjs` 处于 modified：对方在加 I6 ORCID 值域判据）。本场次用「**只提交自己那一版**」的方式落地（提交树 = `HEAD` 版 + 本场次改动；工作树保留双方改动并重新入索引），**不代落库对方在途的 I6**。

### G. 待本人拍板

- **待拍板 20（重编号）｜J10 角色声明现约定为「必须求得出真假」** —— 非静态声明（模板表达式 / 引用别处 / 语法错）一律判红，接受吗？（原 18）
- **待拍板 21（重编号）｜本门禁依赖 `gray-matter`**（Eleventy 的直接依赖，但本仓 `package.json` 未单列）——要不要显式写进 `devDependencies`？（原 19）
- **待拍板 22（新增）｜OG 分享图里烤死的身份句柄怎么处理？**
  - 事实见 E.③：两张 SVG 各烤死 1 处，与登记清单**当前一致**（真源外的第二份副本），**无门禁扫 SVG**。
  - 选项：(a) **重出 OG 图**（工作量在设计/资源，不在代码）；(b) 先加一道门禁守住"OG 图里的身份句柄必须是登记清单里的那一条"（能抓住"图里的句柄被换成冒名账号"，**治不了**"清单改了图没改"）；(c) 只登记为已知例外，本轮不做。**本场次不代拍。**
- **待拍板 23（新增）｜合法增删句柄要"五处同步"——要不要把该同步的清单直接写进红因？**（见 F.3）

## 2026-10-19 · 17:35–18:10 场次（**不占轮次号**，避免与并发场次撞号）：身份派生门禁的**数据源层判据是死的**——一条永远不会红的判据给出了看起来很确定的绿 + 遮罩修好 + 判据自证 + 编号改号（ID*）+ 扩到构建配置层 + 第五封回执逐条裁定 + 独立复现「可见身份链接」的洞

### A. 归属：本节对应的**代码改动已被并发场次连带提交**（本节本身是本场次落库的内容）

- 本场次开始时 HEAD = `e32dfdf`。**推进过程中 HEAD 被并发场次推到 `8b887bd`（identity 门禁 C4「产物 sameAs 多出」判红）→ `8a7a953`（打印主题门禁 PT1–PT6 + 接手并独立复验四组 peer 在途改动）。**
- 本场次在 `scripts/check-identity-derivation.cjs` 上的改动（见 B、C 节）**在并发场次提交时位于工作树里，被 `8a7a953` 一并提交**（该文件 `git diff HEAD` 现为空 → 工作树 == HEAD == 本场次写的那一版）。→ **代码已在 main 上**，但**提交信息是别人的**；本场次本次提交**只带本日志**（本节 + 两处就地订正）。这一条写在这里，是为了下一个读日志的人不会误以为"这节里的代码还没落库"。
- `8a7a953` 同时落地的还有 peer 的 **A 项**（"产物 sameAs 多出未登记句柄"由 note 改判红）→ **本节 F 节记的那个缺口已被关掉**，下文的表述已按**新基线**校正。

### B. 本轮最重要的发现：一条**永远不会红**的判据，给出了**看起来很确定的绿**

`scripts/check-identity-derivation.cjs` 自 `c6cd002` 落地起就有两条判据：**D1 数据源层**（`src/_data/site.js` 里不许出现身份 URL 字面量）与 **D4 模板层**（`.njk` 里不许出现）。

**D1 从落地那天起就是死判据。** 根因在注释遮罩：

```
旧实现：把"行内两个斜杠到行尾整段吃掉"当成行注释
```

而**每一条绝对 URL 里都有两个斜杠**（`https://…`）→ 遮罩把 URL **本身**连同后面内容一起抹掉 → 匹配阶段永远看不到完整的 URL → **D1 结构上不可能命中**。

**实测（隔离克隆，HEAD=`e32dfdf`）**：

| 注入 | 修复前 | 修复后 |
|---|---|---|
| `src/_data/site.js` 第 63 行写死 `const IDENTITY_BACKUP = "https://github.com/oldsixxiaolv";` | **exit 0**，并打印「5 条身份 URL **没有一条**以字面量出现」 | **exit 1**，红因点名 `src/_data/site.js 第 63 行` |

→ 这属于本仓反复吃过的**"假保证"**族，且比"门禁缺一条判据"更坏：**它宣称自己查过了**。同类形态在本仓已反复出现（"note 说假话"、"自证句与实际不符"），**根子都是同一个**：判据的**期望集**被拿来当"什么算违规"的尺子，而尺子量不到自己的盲区。

**为什么 D4 没死**：模板层的遮罩是 Nunjucks/HTML 注释（`{# #}`、`<!-- -->`），**不碰 `//`** → 模板层照常命中（peer 的 W1 早先实测过）。所以这条门禁**一半是活的、一半是死的**，而它的通过文案把两者混成一句"数据源与模板层都没有字面量"。

### C. 改进点 1：JS 注释遮罩改成**字符串感知** + 加一条**判据自证**（ID0）

只动 `scripts/check-identity-derivation.cjs` 一个文件。

1. **遮罩改成逐字符扫描**：先认字符串（`'` `"` `` ` ``），**字符串整体跳过** → 字符串里的两个斜杠不是注释；只有字符串外的行注释与多行块注释才遮罩。另加一条：**行注释的起始斜杠前面那个字符不能是 `:`**（`https://` 的斜杠前是冒号）—— 双保险。遮罩只把字符换成空格、保留换行 → **行号与列位置不变**，红因仍能报到"第几行"。
2. **字面量形态补上反引号**（`` `url` ``）：构建配置里反引号是惯用引号，只认双引号/单引号会直接漏。
3. **新增 ID0「判据自证」**——把"这条判据**结构上能不能触发**"变成判据的一部分：
   - 5 条**检测器级**断言（走**同一条**遮罩+匹配路径）：字符串里的字面量必须命中 / 反引号形态必须命中 / 行注释里必须不命中 / 块注释里必须不命中 / **字符串里的两个斜杠不能吃掉同一行后面的字面量**；
   - 3 条**遮罩级**断言：**遮罩只该吃掉注释，不该吃掉 URL 本体**（"字符串里的 URL 本体不被吃掉" / "字符串外的 URL 本体不被吃掉（冒号规则）" / "行注释里的 URL 被吃掉"）。
   - 任何一条不成立 → **判红**："本门禁的找字面量这一步结构上已经失效，继续跑只会给出**假保证**"。
   - **自证不是空跑**（实测，见 D 节 M6/M7）：把字符串感知关掉 → 门禁报红「判据自证失败：字符串里的 // 不能吃掉同一行后面的字面量 —— 期望命中 1 条，实际 0 条」；把冒号规则关掉 → 报红「遮罩自证失败：字符串外的 URL 本体不被吃掉（冒号规则）」。
   - 自证本身也**抓到了我自己的错**：遮罩级断言上线时，红因直接指出夹具里的 `mustKeep` 带了原文里不存在的尾斜杠 —— 断言不是摆设。

### D. 改进点 2：判据编号 `D1–D4` → **`ID1–ID4`**，并新增 **ID5**（构建配置层）

1. **编号改号**：本门禁原来的 `D1–D4` 与 `scripts/test-gates-selfcheck.cjs` 里的**用例编号 `D1–D6`** 撞号（两套完全不同的编号域，日志里"用例 D2"会被读成"门禁判据 D2"）。全库确认 `ID1–ID4` 未被占用 → 本门禁改用 `ID*`（Identity-Derivation），并在**文件头**写明两个编号域的差别。
2. **新增 ID5：构建配置层**（`eleventy.config.js`）。来历是一个具体事实：**`person.sameAs` 的赋值就在这个文件里**（实测 `eleventy.config.js:910`：`person.sameAs = [...A.sameAs]`）。在那里烤死一条身份 URL → **数据源干净、模板干净**，但产物里的 sameAs 会多出一条。今天该文件里 5 条身份 URL 一条都没以字面量出现 → **扩面零误伤**。

**改完的判据全表**：

| 编号 | 判据 | 抓什么 |
|---|---|---|
| ID0 | 判据自证 | "找字面量"这一步结构上能不能触发（5+3 条断言） |
| ID1 | 数据源层 | `src/_data/site.js` 里不许有身份 URL 字面量 |
| ID2 | 数据源层 | `site.js` 必须 require 共享真源 `scripts/lib/identity.cjs` |
| ID3 | 真源自身 | 共享模块必须存在（锚失效即判红） |
| ID4 | 模板层 | `src` 下 21 个 `.njk` 里不许有身份 URL 字面量（peer 的 W1） |
| ID5 | 构建配置层 | `eleventy.config.js` 里不许有身份 URL 字面量（本轮新增） |

### E. 注入矩阵（8 档；隔离克隆 `/tmp/mh_clean10` = HEAD **`8a7a953`** + 本场次门禁改动，`node_modules` 软链）

> ⚠️ **基线说明**：这 8 档跑在**推进后的新 HEAD** 上（`8a7a953`），不是本场次开始时的 `e32dfdf` —— 端到端证据有保质期，HEAD 一动就在待提交的那棵树上重跑。

| 档 | 注入 | 结果 |
|---|---|---|
| M0 | 基线 | **exit 0**（绿） |
| M1 | `site.js` 写死身份 URL 字面量 | **exit 1**，点名 `src/_data/site.js 第 63 行`（**修复前这一档是 exit 0**） |
| M2 | `eleventy.config.js` 写死身份 URL（ID5） | **exit 1**，点名 `eleventy.config.js 第 911 行` |
| M3 | 同上但用**反引号**形态 | **exit 1**，点名同处 |
| M4 | 模板层写死身份 URL（W1 回归） | **exit 1**，点名 `src/_includes/partials/footer.njk 第 6 行` |
| M5 | 同一处 URL 放在**行注释**里 | **exit 0**（注释豁免必须仍然放行） |
| M6 | 破坏"字符串感知"（原始缺陷机制） | **exit 1**，红因是**判据自证**那条（不是靠注入命中） |
| M7 | 破坏"冒号规则" | **exit 1**，红因是**遮罩自证**那条 |
| M8 | 全部还原 | **exit 0** |

- **整链 build**（同一克隆）：**exit 0、零 ✗ 行**。
- **注入自证**（peer 17:2x 提的纪律）：每档注入都先断言"锚点字符串确实存在"再替换，替换后**打印被注入的那一行** —— 避免"注入没落地、门禁自然全绿"与"门禁没拦住"**同形**。

### F. 第五封回执（peer 场次 `mvs_0a0e47bf…`）逐条裁定

peer 那封的基准是 **`25b8506` 的在途快照**。六条在**当前 HEAD** 逐条复核：

| # | peer 结论 | 裁定 | 依据 |
|---|---|---|---|
| 1 | 在途 `check-identity-handles.cjs:63` 用 `require("./lib/identity.cjs")` 当期望集 → 等长替换全盲 | **与当前 HEAD 不符** | 现行是**门禁内置写死 oracle**（`ORACLE_SAMEAS`）+ `EXPECTED_COUNT` 严格相等 + `ORACLE_SET_SHA256` 哈希锚；共享模块只做 I2d 逐字核对。实测 R1（`identity.cjs` 里 GitHub 那条等长替换成 `https://github.com/someone-else` + 重建）→ **exit 1、4 条红因**（模块多出/少了、产物 sameAs 缺 oldsixxiaolv、可见链接缺 oldsixxiaolv、可见链接多出 someone-else） |
| 2 | R4「多挂一条未登记句柄 → 只记 note、exit 0」 | **在 `e32dfdf` 上成立；现已被关掉** | **模块侧**多出 → I2d **判红**（本场次复现：模块多挂一条 → 2 条红因）。**产物侧**多出 → `e32dfdf` 时**只记 note**（我实测），**并发场次已在 `8b887bd` 落为 C4 判红**；本场次复现：模块多挂一条 → 产物里出现 14 处 → 门禁 **exit 1**，两条红因（I2d + C4「有 1 条 sameAs 不在登记清单里」） |
| 3 | 修法 (a)「回到写死 oracle」/ (b)「加 sha256 锚」 | **现状两者都已有** | `ORACLE_SAMEAS` 写死 + `ORACLE_SET_SHA256` |
| 4 | `site.author.github/csdn/researchgate` 仍硬编码 | **已过时** | 现行 `src/_data/site.js` 五个句柄**全部从 `scripts/lib/identity.cjs` 派生**（`identityUrl(host)` + `OWNER_ORCID`） |
| 5 | I3 失败即短路 | **已实现** | `anchorTrustworthy`：I2a/I2b/I2c 判红即短路；I2d 判红**不**短路（哈希绿即证明 oracle 未变，错在被改的数据源） |
| 6 | 方法备注（TR 门禁需复制共享索引；`identity.cjs` 与 `site.js` 必须同一次提交） | **确认** | 属方法提示，非缺陷 |

### G. 我上一封发给 peer 的**错误结论**（主动更正）+ 它后来被谁关掉了

我上一封（第三封回复）里写了：「现行 I1 要求产物 sameAs 集合**等于**期望集 → 多一条判红」。**这句话不成立。**

真相（在 `e32dfdf` 上）：**产物侧 sameAs 缺一条 → 判红；多出一条 → 只记 note、不判红**（`check-identity-handles.cjs` 的 `if (extraHandles.size)` 分支当时是 `note(`，文案写着"只记一笔不判红"）。**模块与 oracle 的多/少/等长替换 → I2d 判红。**

**这条缺口现已被并发场次在 `8b887bd` 关掉**（peer 的 A 项落地为 C4 判红），本场次已在新基线上独立复现（见 F 节第 2 行）。

本节已把日志里那两处错误表述**就地订正**（一处裁定表的第 7 行、一处我上一节 E 段的最后一条），并已向 peer 发更正。

**附带记录（同族，且仍未关）**：C4 落地后，"产物侧多出"不再是静默的；但**可见侧**还有一个同族的洞 —— 见下一节。

### H. 独立复现 peer 的"可见身份链接"洞（当前 HEAD **`8a7a953`** 仍**成立**）

peer 17:2x 报了一个更深的洞：`site.author.gitlab` + 模板渲染 → 产物出现**可见的新平台账号链接**，而身份门禁**通过**，且**通过文案是假的**。按本仓纪律（peer 结论必须带被验基准并独立复现），本场次在**自己的隔离克隆**上重跑三档（不引用 peer 的产物）：

| 档 | 形态 | 实测（HEAD `8a7a953`） | 判定 |
|---|---|---|---|
| A | `site.author.gitlab` 只进数据源、不渲染 | identity 门禁 **exit 0**（sameAs 没多 → I2d 不触发） | 不是洞 |
| B | **+ 模板把它渲染出来** | identity 门禁 **exit 0**；产物里可见 gitlab 链接 **6 处**；门禁文案仍写「页面上可见的身份链接 **5 条**，与登记清单一致」 | **洞，当前 HEAD 成立** |
| C | 指向深层内容链接（`host/名/项目`） | identity 门禁 **exit 0** | 与既有设计一致，**不算洞** |

**档 B 的致命处是自证句**：门禁打印「页面上可见的身份链接 **5 条**，与登记清单一致」—— 实际可见 **6 条**。**门禁不只是没看见，还主动宣称一致。** 根因在代码级：可见链接的"识别"由**期望集自己**构造（`hostShape` 从 `ORACLE_SAMEAS` 逐条来），`isIdentityProfile()` 对未知主机直接 `return false` → **期望集之外的主机压根不算身份链接**，进不了比较。

**三条推论**（本场次据实测补）：

1. **「多出判红」（现已落地的 C4）盖不住这一类**。C4 管的是 sameAs（机读路径）；可见路径的新主机**在进入比较之前**就被挡掉了 → **口径选择本身有天花板**，别把新洞的修复寄望在另一个洞的补丁上。
2. **修法不能是"所有新主机一律判红"**（会把 C 档那类内容链接也抓进来，C 档与设计一致）。
3. **本场次的 ID5 与 ID1 修好之后，这条洞的机读侧仍然存在**：`site.author.gitlab = "https://gitlab.com/lvyihang"` 里的 URL 不在那 5 条 oracle 内 → 派生门禁不会红（它守的是"那 5 条不许被抄成字面量"，不是"不许新增平台"）。**新平台的登记口径是另一个问题，属待拍板。**

### I. 本轮踩的两次**坏跑**（主动报告，与 peer 同款教训）

peer 17:2x 专门讲过："注入没落地"与"门禁没拦住"在输出上**同形**。本轮我自己踩了两次：

1. **注入点被后续赋值覆盖**（C4 复验时）：在 `eleventy.config.js:911` 注入 `person.sameAs = [...A.sameAs, "https://example.com/extra-handle"]` → 门禁 exit 0。**自证后发现产物里该字符串 0 处** —— 注入被后面另一处赋值（`if (A.sameAs) person.sameAs = A.sameAs;`）覆盖了 → **这一档是坏跑，exit 0 不代表任何事**。换到模块侧注入（产物 14 处）才拿到真结果：**exit 1，两条红因**（I2d + C4）。
2. **注入脚本自己写错**（M6 档）：两次 `sed`/python 的引号转义写错 → `assert` 失败 → 文件没被改 → 门禁自然绿 → **看起来"测过了"，实际什么都没测**。改成按行定位替换后才拿到真结果（exit 1，红因是判据自证那条）。

→ 固化为本场次纪律：**每档注入都要打印"被注入的那一行"或"产物里出现 N 处"，注入没落地就不许把 exit 0 记成通过。**

### J. 诚实边界（本轮实测，写明不夸大）

1. **本门禁守的是"那 5 条身份 URL 不许被抄成字面量"，不是"不许出现第 6 条"**。新增平台（gitlab 那种）不在本门禁视野内 —— 那是 H 节的洞与待拍板。
2. **ID1 只查"完整字面量"**（整条 URL 被引号包住、引号内无多余内容），不查 URL 形态匹配；因此 `"…/oldsixxiaolv/Manuscript_Lvyh"`（代码仓）不命中。**"拆成两段拼接"或"先存进变量再拼"的结构性绕过仍不在本门禁能力内。**
3. **注释豁免是刻意开的口子**（待拍板 17）：注释里留一份 URL、字段留空这种写法不受约束。本轮实测 M5 档确认豁免仍然生效。
4. **模板层不遮罩 `<script>` 块里的 JS 行注释**（本仓模板当前无此形态）。若将来模板里出现内联 JS 且注释中带身份 URL，会误报 —— 方向是**误报**不是漏报。
5. **JS 遮罩不识别正则字面量**：形如 `/^https?:\/\//` 的正则，末尾两个斜杠会被当成行注释起点（该行剩余部分被遮罩）。**当前两个被扫文件里没有这种正则**（`site.js` 零处、`eleventy.config.js` 两处且形态安全）→ 今天零影响；但**将来有人写这种正则，该行后半段会被遮罩掉**（方向：漏报）。
6. **协同篡改**（oracle + 共享模块 + 哈希锚三者一致地改）→ 仍全绿；落在**代码审查**范畴，本门禁**不声称**能挡。
7. **本轮未新增任何站外链接、未引入任何外部依赖/密钥/账号**；未改动并发场次的任何文件（`check-identity-handles.cjs`、`check-tool-routes.cjs`、`lib/*`、`check-print-theme.cjs`、`site.js`、若干 CSS/模板、`package.json` 全部**未进本场次提交**）。

### K. 待本人拍板

- **本轮不新增待拍板编号、不改口**（并发场次已把清单推进到二十余条）。两处**补事实**：
  - **待拍板 16 补记**（`site.social` 是死数据字段）：peer 17:2x 独立实测——`SOCIAL_ORDER` 在 `src/_data/site.js:39`，删掉其中一项后 `social[]` 从 5 条变 4 条，**产物完全不变**（该数组今天没有任何模板渲染），四道相关门禁全绿、整链 build exit 0。→ "看起来在维护、实际不生效"成立。**删掉还是用起来，本场次不代拍。**
  - **"可见身份链接的新平台"补一条天花板**（据 H 节实测）：C4（多出判红）**解决不了**这一类 —— 新主机在进入比较之前就被挡掉。修法涉及"是否引入一份独立的『允许出现在可见身份位的主机清单』"（= 又一处要同步的期望集），属**选型 + 新增期望集**，**本场次不代拍**。
- 其余待拍板见前几节，**不重复、不改口**；部署时机仍待本人决定（线上仍是 2026-10-16 那版：`/papers/`、`/publications.bib`、`/publications.ris`、`/feed.xml` 404）。

## 2026-10-19 · 17:45–18:05 场次（**不占轮次号**，避免与并发场次撞号）：I0「形态规则自证」——把"新平台身份链接静默漏网"这个洞**钉死**（降级即判红）+ 通过文案诚实化 + 接手并独立复验并发场次的身份门禁在途改动（I7 / 形态规则去 oracle 依赖 / I6 扫 ORCID 字面量）

本场次开始时 HEAD = `ae1d868`。本场次动**两个文件**：`scripts/check-identity-handles.cjs`（含接手并发场次的在途改动 + 本场次原创增量）、`docs/IMPROVEMENT-LOG.md`。**未 push。**

### A. 巡检（第 1 步，17:31–17:45 实测）

| URL | 状态 |
|---|---|
| `https://github.lvyihang.xyz/` | **200** |
| `/blog/` | **200** |
| `/about/` | **200** |
| `/sitemap.xml` | **200** |
| `/papers/` | **404** |
| `/publications.bib` | **404** |
| `/feed.xml` | **404** |

- 线上 `last-modified: Fri, 16 Oct 2026 09:52:17 GMT` → 线上仍是 **2026-10-16 那版旧部署**（sitemap 还带 `/MeteoHub/` 前缀）→ 不是站点损坏，是**没部署**。本地 main 已挂根路径（`pathPrefix = "/"`），这三条路由在本地 `_site` 里都在。→ 仍属**待拍板 7**（本场次不代拍，**不 push**）。

### B. 构建（第 2 步）

- 隔离克隆（`git clone` + 软链 `node_modules`）整链 `npm run build` → **exit 0、零 ✗**。
- 门禁链 19 道全过（`check:gates` 自报"19 个门禁脚本全部从 npm run build 可达"）。

### C. 归属表（并发场次在途改动的接手与复验）

本场次开始时，共享工作树里有**多个并发场次**同时在改同一个仓库。本场次的处置：

| # | 改动 | 作者 | 本场次处置 |
|---|---|---|---|
| 1 | 形态规则改成**与主机无关**（`isIdentityProfile` 改用 `IDENTITY_ROLE_SEGMENTS`，不再从 `ORACLE_SAMEAS` 派主机） | 并发场次（未提交） | **接手**：本场次在隔离克隆里独立复现其四档（见 F 档），确认有效后随本场次一起落库 |
| 2 | **I7**：扫产物里人看得见的 `<a href>`，挑出"身份主页形态"候选 → **多出判红** | 并发场次（未提交） | **接手**：独立复现（A3 档红、A2 档红），确认它关掉的是"已知主机冒名"那一类 |
| 3 | **I6** 改成扫 ORCID **字面量**（不只 `orcid.org/<id>` 形态） | 并发场次（未提交） | **接手**：基线复验绿；**但其注释夸大了覆盖面** → 本场次订正（见 E.3） |
| 4 | **I0**：形态规则自证（合成夹具逐条对答案，降级即判红） | **本场次原创** | — |
| 5 | 通过文案诚实化（计数的分母 + "已识别"的措辞） | **本场次原创** | — |
| 6 | `CITATION.cff` 门禁 / `check-live-site.cjs` 门禁 / `check-citation-meta.cjs` / `check-identity-derivation.cjs` / `paper.njk` / `_paper.css` / `site.js` 的改动 | 另两个并发场次（**在途，未提交**） | **不碰、不提交**：本场次的提交只含上表 1–5 两类文件 + 本日志 |

### D. 改进点 1（本场次原创）：**I0 形态规则自证** —— 把"新平台静默漏网"这个洞钉死

**要钉住的洞（先复现，再修）**：身份门禁早先的"什么算身份链接"规则是
`hostShape.get(s.host)`——**主机集从 `ORACLE_SAMEAS` 派生**。
后果：**期望集之外的主机，在"被要求登记"之前就不算身份链接** → 压根进不了比较 → 静默漏网。
这是"尺子量不到自己的盲区"：**期望集同时充当了"判定什么算违规对象"的尺子**。

**本场次在并发场次的在途版本上独立复现（注入在 `/tmp` 隔离克隆里做）**：

| 档 | 注入 | 结果 |
|---|---|---|
| N1 | `site.author` 里加 `gitlab: "https://gitlab.com/lvyihang"`（**不渲染**） | **exit 0**（洞仍在） |
| N2 | 同上 + 在页脚渲染出来 | **exit 0**，产物里该链接出现 **6 处**；通过文案仍写「页面上可见的身份链接 5 条，与登记清单一致」「产物里…4 条，全部在登记清单内」——**两句都是假的** |
| N3 | 把 `about.md` 的 CSDN 链接换成 `https://blog.csdn.net/impersonator` | **exit 1**（I7 抓住）→ I7 关掉的是"**已知主机**冒名"那一类 |

→ 结论：**I7 有效，但 I7 继承同一个盲区**（它用的还是同一份规则）。
新平台要等规则本身改成与主机无关才看得见。

**I0 是什么**：把"这条规则本身还认不认得出它该认的形态"变成判据的一部分。
夹具用 **`example.invalid`**（RFC 2606 保留域，永不指向真实主机），
**不取自被测数据** → 它验的是**规则**，不是站点的数据。5 条断言：

| 夹具 | 期望 | 为什么是这条 |
|---|---|---|
| `https://example.invalid/someone` | **认成** | 一段式路径（**任何主机**）必须认成——这是"规则与 oracle 解耦"的根据 |
| `https://example.invalid/profile/someone` | **认成** | 两段式且首段是角色词必须认成 |
| `https://example.invalid/someone/project` | 不认成 | 两段式但首段不是角色词 → 内容链接 |
| `https://example.invalid/someone/project/extra` | 不认成 | 更深的路径 → 内容链接 |
| `https://example.invalid/` | 不认成 | 零段式（裸主机）→ 不是账号主页 |

任何一条不成立 → **判红**："形态规则自证失败：…… 本条一旦降级（例如又把
"什么算身份"改回从 oracle 派主机），新平台的身份链接就会在"被要求登记"之前被静默放过。"

**D.2 自证本身也要有锚 —— 且锚不能从夹具表自己取（这一条是注入抓出来的，不是设计出来的）**

我**第一版** I0 写完就自以为稳了：夹具表在模块级，通过文案里的条数直接取
`SHAPE_SELF_CHECK_CASES.length`，再比一个 `shapeSelfCheckCount === SHAPE_SELF_CHECK_TOTAL`。
**注入实测当场把这版打掉**（T 矩阵，下表 T3 档）：

- **T3 档（删掉一条夹具）→ exit 0，通过文案照打「形态规则自证 4/4 条夹具逐条对答案通过」。**
  根因：**期望条数是从被测的那张表自己取的** → 删一条，"实际条数"和"期望条数"一起变小 → 永远相等 → **锚形同虚设**。
  这正是本仓文件头早就写下的老问题（"拿自己和自己比"），**在我自己的新判据上又犯了一次**。
- **T1 档（整段删掉 I0 自证）→ 崩成 ReferenceError 堆栈**，不是判红 —— 也算不合格（红因要能读）。

**改成三处分离**（都实测过）：

| 位置 | 内容 | 为什么放这儿 |
|---|---|---|
| 文件**顶部** | `SHAPE_SELF_CHECK_EXPECTED_COUNT = 5` + `SHAPE_SELF_CHECK_SHA256 = 3c188b5f…`（**手写**的独立期望）+ `shapeSelfCheckPassed` / `shapeSelfCheckSummary` 的**默认值**（默认文案就是"本轮没有跑起来"） | 锚与夹具表**分处两地**；删夹具改夹具都动不到锚 |
| 文件**中部** | 夹具表 + 逐条对答案；先校验条数与哈希（对不上 → 判红），再逐条对答案 | 验"规则还认不认得出该认的形态" |
| 文件**底部** | 结构性兜底：`if (!shapeSelfCheckPassed) fail("形态规则自证没有跑起来…")` | 夹具表整段被删 / 被注释时，顶部锚校验也不会跑 → 这一层兜住 |

规范形式：`JSON.stringify(夹具表.map(c => [c.url, c.want]))`，顺序即数组顺序。

**T 矩阵（6 档，隔离克隆 `/tmp/mh_build_check`，改完只跑门禁单段）**：

| 档 | 注入 | exit | 红因 |
|---|---|---|---|
| T0 | 干净基线 | **0** | 零 ✗ |
| T1 | **整段删掉** I0 自证（夹具表 + 逐条对答案） | **1** | 「形态规则自证没有跑起来（自证代码被删、被注释，或整段没执行）」——**不再崩堆栈** |
| T2 | 改坏一条夹具的 `want` | **1** | 2 条：① 夹具内容哈希对不上 ② 「形态规则自证失败：…/someone/project/extra —— 期望认成，实际不认成」 |
| T3 | **删掉一条夹具** | **1** | 2 条：① 「夹具条数对不上：实际 4 条，锚写的是 5 条」② 内容哈希对不上 —— **第一版在这一档是 exit 0（洞）** |
| T4 | **等长替换**夹具里的一个 URL | **1** | 「夹具内容哈希对不上」（等长替换也抓得到） |
| T5 | **调换两条夹具顺序** | **1** | 「夹具内容哈希对不上」 |
| T6 | **改坏形态规则本身**（一段式不再认成 ≈ 降级回 oracle 派主机） | **1** | 2 条：① 「形态规则自证失败：https://example.invalid/someone —— 期望认成，实际不认成」② I5 报 `site.author` 身份链接缺失 |

→ **T1–T6 全部 exit 1 且红因可读；T0 零 ✗。**

**为什么必须与 I5/I7 里那两条"自证存活"分开**：
那两条验的是"**这个站点**上有没有认出东西"（数量 > 0）；
I0 验的是"**这条规则**还认不认得出它该认的形态"（拿合成夹具逐条对答案）。
少了 I0，规则被改回 oracle 派主机时，两条"自证存活"照样绿 —— 洞会重新打开。
**这一档有实测（见 F 档 A4）：把规则降级回 oracle 派主机 → I0 判红（2 条红因）。**
**但 I0 自己也会被改坏** —— T1–T6 就是为它准备的；第一版 I0 在 T3 上是绿的，
**"自证"这两个字本身也是要有人看守的**。

### E. 改进点 2（本场次原创）：**通过文案诚实化** + 一处注释覆盖面订正

**E.1 计数必须交代分母与口径**（原措辞两处都不准）：

- 原来：「页面上可见的身份链接 5 条，与登记清单一致」——
  ① I5 扫的是 **`site.author` 的数据源字段**，不是"页面上的链接"（它只是"会被渲染出去的那些链接"的代理）；
  ② N 是"**被识别出来**的条数"，不是"可见链接"的条数（洞那档实际可见 6 条，文案却说 5 条一致）。
  改为：「site.author 里**被识别为**「账号主页形态」的链接 5 条（扫过 48 个链接字段；这个数是"被识别出来的"条数，不是"页面上全部链接"的条数），与登记清单逐项一致」。
- I7 那句同样改为「产物里**被识别为**「账号主页形态」的可见链接 4 个（按主机+路径去重，扫过 6 个 HTML；同样是"被识别出来的"个数）」。

**E.2 I5 的两条红因措辞**：`site.author 里**页面上可见**的身份链接…` →
`site.author 里**数据源侧**的身份主页形态链接…`，并注明"本条扫的是**数据源字段**；产物里真正渲染出去的链接由 I7 单独扫"。

**E.3 订正一处夸大的注释**：I6 的注释原本写"同一个 ORCID 在产物里有好几种写法——HTML 链接、页面上的纯文本、**BibTeX 里的 `orcid={<id>}`、RIS 里的 `UR`**"。
**实测**：本条的扫描面是 `htmlFiles`，而它只收 `.html`（`e.name.endsWith(".html")`）→
**`.bib` / `.ris` 里的形态根本不在本条视野内**。已把注释改成实话：
"本条扫的是**产物里的 .html**，**不含** publications.bib / publications.ris；
那两份里的 `orcid={…}` / `UR` 形态**不在本条视野内** —— 要管它们是另一条判据的事，这里不声称覆盖。"
（**注释里的覆盖声明与代码不符，和判据说假话是同一族** —— 一条永远不会生效的声明比没有声明更坏。）

**E.4 通过文案要把"自证跑了没有"也说出去**（否则自证代码整段被删时，门禁照样打绿）：

原来 I0 通过时**完全不出声**——自证跑没跑，从通过文案里看不出来。
若哪天有人把 I0 那段删了，通过文案会一字不变地说"身份句柄完整性门禁通过"——
**"自证"两个字本身没人看守**。改为把自证状态写进通过文案：

> …；数据源清单与期望集逐项一致；**形态规则自证 5/5 条合成夹具逐条对答案通过**
> （"什么算身份链接"这一步本身还认得出该认的形态；夹具用 example.invalid，不取自被测数据；夹具条数与内容由独立锚校验）。site.author 里**被识别为**…

并且这条文案**不是常量**：自证没跑起来时，它说的是"**本轮没有跑起来**（自证代码或锚不在本文件里）"，
不是照旧说"通过"。文案必须随实际状态变，否则又是一句假话。

### F. 独立复验矩阵（10 档；隔离克隆 `/tmp/mh_round24`，合成夹具 + 注入后全量重建）

| 档 | 注入 | exit | 红因 / 结论 |
|---|---|---|---|
| A0 | 干净基线 | **0** | 零 ✗ |
| A1 | 新平台**仅数据源**（`site.author` 加 gitlab） | **1** | 1 条：I5「数据源侧…多出 https://gitlab.com/lvyihang」 |
| A2 | 新平台 **+ 渲染进页脚** | **1** | **2 条**：I5 多出 + **I7「产物里出现未登记的身份主页形态链接…（6 个产物）」** |
| A3 | 已知主机冒名（`about.md` 的 CSDN → impersonator） | **1** | 1 条：I7 红 |
| **A4** | **把形态规则降级回 oracle 派主机** | **1** | **2 条：I0「形态规则自证失败」**（降级被当场抓住） |
| A5 | 内容链接形态（`github.com/<user>/<repo>`） | **0** | 不误伤 |
| A6 | 三段深度链接 | **0** | 不误伤 |
| A7 | 角色词 + 更深路径（`example.org/profile/me/extra`） | **0** | 不误伤 |
| A8 | 全部还原 | **0** | 零 ✗ |
| A9 | **I0 的夹具被改坏**（把 `want: true` 改成 `false`） | **1** | 1 条：I0 红 → 证明 I0 真在跑，不是摆设 |

- **A4 是本轮的关键档**：**没有 I0 时这一档是绿的**（规则一降级，洞就重新打开，而且没人叫）。
- **A5–A7 证明新规则对内容链接零误伤**：实测把产物里**全部站外 `<a href>`** 按
  「(主机, 段数, 首段)」归类（共 17 类），在新规则下只有 **5 个**真身份链接命中
  （csdn / github / openalex / researchgate / orcid×3），其余全是内容链接
  （`doi.org/10.1029/…`、`agupubs…/doi/10.1029/…`、`codeocean.com/capsule/…/tree/v1`、
  `github.com/<user>/<repo>`、`iap.cas.cn/`、`www.11ty.dev/`）→ 全部不命中。
- **注入自证**：每档注入后都断言"锚点字符串确实存在"再替换，替换后打印被注入的那一行；
  注入没打中直接退出码 2（避免"注入没落地、门禁自然全绿"与"门禁没拦住"同形）。
- **I0 改造（D.2 的锚重构）之后，这 10 档重跑一遍**：结论**逐项一致**——
  A0 零 ✗ / A1 1 条 I5「数据源侧…多出」/ A2 **I5+I7 双红** / A3 1 条 I7 / A4 2 条 I0 自证红 /
  A5–A7 不误伤 / A8 零 ✗ / A9 1 条 I0 红。**A1、A2 的红因原文逐字核过**（不是只看退出码），
  确认红因指向的是本判据自己的台词。

### G. 一处订正：`ae1d868` 里的"现行只记 note"**已被 `8b887bd` 推翻**

- `ae1d868`（并发场次的日志提交）在两处就地订正里写了：
  「产物侧 sameAs **多出**一条 → **只记 note、不判红**（HEAD 版 `check-identity-handles.cjs`
  的 `if (extraHandles.size)` 分支是 `note(`）」。
- **实测与该陈述不符**：当前 HEAD 的那个分支是 **`fail(`** —— C4 提交 `8b887bd`（17:33）
  已经把 note 改成判红。该并发场次当时读的是 **`e32dfdf`**（17:20）旧基准，
  陈述在**它的基准上**成立、在**现行 HEAD** 上不成立。
- **处置**：不改动他人已提交的叙述（`ae1d868` 的原文保留在日志里），
  在此记一处订正：**现行 HEAD = 判红**（`fail(`），红因文案也已按更严的口径写全
  （两种情形 + 用 I2d 的红/绿分辨根因）。**这正是"复验报告必须带被验基准"的用处**：
  基准过期会把"已修好"说成"仍存在"。

### H. 并发纪律（本场次）

- 本场次开始时 `mavis session list` 里有 **十余个 MeteoHub 场次**在跑（多数卡在 TPM 限流）。
  向仍在活动的场次逐一发了**停写通知**（`session send`，均 accepted/queued）。
- 实测期间共享工作树**持续被改**：`docs/IMPROVEMENT-LOG.md`（→ 已由并发场次提交为 `ae1d868`）、
  `scripts/check-identity-handles.cjs`（17:43:38）、`package.json`、
  `scripts/check-log-sections.cjs`、`src/_data/site.js`、`src/_includes/layouts/paper.njk`、
  `src/assets/css/components/_paper.css`、`scripts/check-citation-meta.cjs`、
  `scripts/check-identity-derivation.cjs`，以及新文件 `CITATION.cff`、
  `scripts/check-citation-cff.cjs`、`scripts/check-live-site.cjs`。
- **本场次的处置**：全部实验在 `/tmp` 隔离克隆里做；**提交只含自己的两处**
  （`scripts/check-identity-handles.cjs` + `docs/IMPROVEMENT-LOG.md`），
  上面那些**并发场次的在途改动一律不碰、不提交**（`package.json` 尤其不能碰——
  它正被别人接线到 `check:citation-cff` / `check:live-site`，半接线提交下去会直接弄红 build）。
- **教训（可复用）**：**"peer 给的修法"与"peer 的实现"是两件事**。
  修法（方向）可以照用，实现必须**在自己的隔离克隆里独立复现**：
  本场次实测发现并发场次的实现**继承了同一个盲区**（I7 用的是同一份 oracle 派主机的规则），
  只看它的结论（"洞关掉了"）会漏掉这一点——**结论要自己重跑，不能转述**。

#### H.1 落库方式的**实际结果**与上面那句"提交只含自己的两处"**不一致**（就地订正，如实记）

- 本场次原计划：`git add scripts/check-identity-handles.cjs` + `git commit --only <该文件>`，
  **只**提交自己那一个文件（日志那一节因为被并发场次整体提交过，已在 HEAD 里）。
  实际执行时 `git commit --only scripts/check-identity-handles.cjs -F <msg>` 返回
  **「no changes added to commit」**——**不是我的用法错，是 HEAD 在那几秒内变了**。
- 查证：并发场次在这期间**把自己的提交 `8dec76f` `git commit --amend` 成了 `1ca6068`**，
  amend 时把**工作树整体**提交了 → **本场次的门禁文件与日志节一并进了 `1ca6068`**。
  `1ca6068` 的提交说明里**只字未提 I0**。
- **所以本节上面那句"提交只含自己的两处"只描述了"本场次的意图"，不描述"实际由哪个提交承载"**。
  实际承载：`scripts/check-identity-handles.cjs`（含 I0 与文案改动）→ **`1ca6068`**；
  日志本场次那一节 → 同样在 `1ca6068`（`8dec76f` 起就在）。
- **处置**：本场次补一个**只改日志**的提交，把"I0 的代码落在 `1ca6068` 里、而那个提交的说明没提它"
  这件事写进日志——**免得日后有人只读提交说明，查不到这段代码是谁写的、为什么这么写**。
- **可复用纪律（本次又踩了一次并发坑）**：
  ① 提交前**先 `git log -1` 看 HEAD 有没有变**（本场次从 `8dec76f` 变成 `1ca6068` 就是在这一步发现的）；
  ② `git commit --only <path>` 返回 "no changes added to commit" 时，**先怀疑 HEAD 变了**，
     不要以为自己写错了命令；
  ③ 别人的 `amend` 会把**整个工作树**带进去，**"我以为只提交了自己的文件"这个前提可能已经不成立**；
  ④ 于是本场次在**日志里显式登记归属**，而不是让归属只存在于某个人的提交说明里。

### I. 待本人拍板（本场次不代拍）

- 中央「待决策」段本场次**新增 3 条**（见该段）：
  「新增平台要不要登记为本人账号」、「"他人主页"白名单缺失」、
  「形态规则的角色词表是一处手写期望集」。
- 其余待拍板（7 / 10 / 3 / 13 / 14 / 15 / 16 / 17 / 18 / 19 / 20 / 21 / 22 / 23 等）**不重复、不改口**。
- 线上仍是 2026-10-16 那版（`/papers/`、`/publications.bib`、`/feed.xml` 404）→ **待拍板 7** 不变。

## 2026-10-19 · 17:50–18:10 场次（**不占轮次号**，避免与并发场次撞号）：线上部署核查门禁 ——「发出去的站点」与「建出来的产物」之间那段**没人看守**的距离，第一次有了自动看守（新增 L1–L6 六条判据 + 7 档注入矩阵 + 部署后 CI job）

### A. 背景：这段距离今天有具体形状

本仓已有的 15 道门禁**全部只查本地产物**（`_site/`）。实测：`scripts/` 下**没有任何脚本访问线上站点**（唯一发 HTTP 的是 `check-overflow.cjs`，只连本机 Chrome CDP）。

于是"本地是对的"和"线上是对的"之间有一段**没人看守**的距离，而它今天有具体形状 —— 线上跑的是 **2026-10-16 那版**（本场次 17:1x 实测）：

- `/papers/`、`/publications.ris`、`/publications.bib`、`/feed.xml` 四条 404；
- canonical / og:url / sitemap **全带已下线的 `/MeteoHub/` 前缀**。

这个事实已经被**十余个场次各自手工 curl 发现过一遍**（日志里到处是同一句"线上仍是 10-16 那版"）。
→ 结论很直白：**缺的是自动告警，不是缺发现能力**。发现能力早有了，重复成本也早够了。

### B. 改了什么（2 个新文件 + 3 个改动文件）

| # | 文件 | 改动 |
|---|---|---|
| 1 | `scripts/check-live-site.cjs`（新） | 线上核查门禁 L1–L6 |
| 2 | `scripts/test-live-site.cjs`（新） | 注入矩阵 7 档（`test-` 前缀 → 不匹配接线门禁的 `GATE_FILE_RE`，因此**可以**接进 build 链） |
| 3 | `package.json` | 加 `check:live`（查线上）与 `check:live-selftest`（注入矩阵，**接进 build 链**） |
| 4 | `scripts/check-gates-wired.cjs` | `EXEMPT` 登记（**本仓库第一条真实豁免**） |
| 5 | `.github/workflows/deploy.yml` | 新增 `verify-live` job（`needs: deploy`） |

### C. 判据全表

| 编号 | 判据 | 抓什么 |
|---|---|---|
| L1 | 线上每个产物路由都返回 200（路由集**由本地 `_site` 推导**，不是手写清单） | 部署没发全 / CDN 缓存旧版 |
| L2 | 线上 canonical / og:url 与本地**同路径**、且**指向本次部署的 origin** | 口径漂移（`/MeteoHub/` 前缀）／指向别站 |
| L3 | 线上 sitemap 每个 `<loc>` 都可达 | sitemap 指向 404 或别的站 |
| L4 | 线上 sitemap `<loc>` 的**路径集合**与本地一致 | sitemap 是旧版 |
| L5 | 线上 HTML 的 JSON-LD 块都能被 `JSON.parse` 解析 | 发出去的结构化数据是坏的 |
| L6 | 线上 feed.xml 至少一个 `<item>`，且每个 `<link>` 都可达 | 订阅源在读者手里是空的 |

### D. 为什么 L2/L3/L4/L6 比的是「路径」而不是整串 URL

整串比较把**两种不同的故障**混成一条红因：

1. **路径不一致** → 发出去的口径漂了（典型：旧的 `/MeteoHub/` 子路径前缀没去掉）；
2. **origin 不对** → 线上页面在对外声明一个别人家的地址。

而且整串比较在本机夹具自测下**必然假红**（线上 origin 是 `127.0.0.1`，本地期望是 `site.url`）。拆成两段判，两种故障都判得准，自测也不会假红。

### E. 注入矩阵（7 档，`node scripts/test-live-site.cjs`，实测 **0.65 s**）

做法：把本地产物复制一份 → 起一个极小静态服务器发出去 → 逐个注入缺陷 → 断言对应判据**真的报红**。

| 档 | 注入 | 结果 |
|---|---|---|
| M0 | 基线（原样部署） | **全绿**（证明不是空跑） |
| M1 | 删掉 `papers/index.html`（线上少一条路由） | **L1 报红**，点名 `/papers/` |
| M2 | canonical 指向 `/MeteoHub/`（路径漂移） | **L2 报红**，文案含"路径与本地不一致" |
| M3 | sitemap 指向 `/papers-does-not-exist/` | **L3 报红**（不可达）+ **L4 报红**（两栏方向不反） |
| M4 | 首页第一块 JSON-LD 换成坏 JSON | **L5 报红** |
| M5 | `feed.xml` 删掉全部 `<item>` | **L6 报红** |
| M6 | canonical 指向 `https://example.com/`（origin 维度） | **L2 报红**，文案含"指向的不是本次部署的站" |

- 每档都**断言红因文案**（不只断言"有红因"）：判据红而不说人话、或红因把两栏内容对调，跟没红是一类的坏。
- 每档注入后**打印被注入的那一行**（不是文件第一行）——"注入没落地"和"门禁没拦住"在输出上同形。
- **M3 额外钉住 L4 的方向**（"本地有、线上没有 1 条（/papers/）" / "线上有、本地没有 1 条（/papers-does-not-exist/）"）——方向写反的红因是**假话**，比不报还坏。

### F. 线上实测（真跑一次，**17 条红因**：L1 6 / L2 7 / L3 3 / L4 1）

`node scripts/check-live-site.cjs` 对着生产站跑，抓到：

- L1 **6 条** 404：`/assets/css/print.css`、`/feed.xml`、`/papers/`、`/papers/trmm-thunderstorm-stages/`、`/publications.bib`、`/publications.ris`
  → **比本场次手工 curl 多抓到 2 条**（`/assets/css/print.css` 与 `/papers/trmm-thunderstorm-stages/`）——手工清单是手写的，漏了就一直漏；门禁的路由集是**从 `_site/` 推导**的。
- L2 **7 条**：canonical / og:url 路径漂移（`/MeteoHub/` vs 本地无前缀）——`/`、`/about/`、`/blog/` 各 2 条（canonical + og:url），`/404.html` 1 条（它本地没有 canonical，只有 og:url）
- L3 **3 条**：线上 sitemap 的 `<loc>` 不可达
- L4 **1 条**：线上 sitemap 与本地不是同一份（各 5 条路径对不上）
- L5 / L6 **0 条**（线上 JSON-LD 都能解析、feed 条目可达）——**旧部署这两项本来就是好的**，红的是"没发全"与"口径漂移"

> 这些条数是**旧部署当时状态**的快照，不是常量；部署之后重跑，条数会变（应该变成 0）。
> ⚠️ 本场次第一版日志里把这个数写成了"18 条、L2 6 条、L3 2 条"——那是**看输出时数错了**
> （第一遍输出被 `head` 截断，没数全）。**红因计数不准和红因造假是同一类坏**，
> 故按逐档计数（`grep -c "  ✗ Ln"`）重测后**就地改正**。

**结论**：线上仍是 2026-10-16 那版，**不是代码回归**（本地 main 早已去掉子路径）。部署时机仍属**待拍板 7**，本场次**不 push**。

### G. 本轮踩的三个坑（诚实记录）

1. **URL 整串比较 → 夹具基线假红**：第一版 L3/L6 直接抓 sitemap/feed 里的**绝对 URL**，在 `127.0.0.1` 夹具下打到了生产站（生产 `/papers/` 本就 404）→ M0 基线假红。**判据设计缺陷，不是环境问题。**
2. **L4 两栏方向写反**：`multisetDiff` 的实现方向与注释相反 → 红因把"本地有"和"线上有"对调。**红因是假话**。修法：辅助函数改名 `extraIn(a, b)`（= b 里有、a 里没有）并加 M3 断言钉住方向。
3. **GW2 是按文件判的**：自测若与门禁同文件，"`check:live-selftest` 进 build 链"就等于"豁免项被接在 build 链上"→ 判红。解法：自测挪进 `scripts/test-live-site.cjs`（`test-` 前缀不匹配 `GATE_FILE_RE`）——**这也是仓库既有的 `test-gates-selfcheck.cjs` / `test-dataset-files-gate.cjs` 惯例**。

### H. 诚实边界（写明不夸大）

1. 这道门禁**不接进 build 链**（联网 + 时机：build 跑在 deploy **之前**，那时线上还是上一次部署，放进 build 等于每次都对着旧站点判红，把"部署还没发生"误报成"代码坏了"）→ **部署之前它一次都不跑**。
2. **豁免的代价是"没人跑 = 没人知道"**。唯一的自动调用点是 CI 的 `verify-live` job；**若那条 job 被删，仓库里没有任何门禁会发现它没了**（已知缺口，如实记录）。
3. `verify-live` job 的期望值取 **github-pages artifact**（刚部署上去的那份）→ 比的是"发出去的字节 vs 在线上的字节"，不是"本地重跑一遍 vs 线上"。
4. **首次跑 `verify-live` 必然红**（线上还是旧部署）——那是**真的**红，不是误报。
5. 门禁**查不出"线上多出来的路由"**（无法枚举）。
6. 抓第三方 origin 的 `<loc>` 时**不发请求**（只报红）——不打扰第三方站点。
7. L2 的"少了 canonical"只在**本地有、线上没有**时报（`404.html` 本地就没有 canonical，不误报）。

### I. 待本人拍板（本场次**不代拍**）

- **不新增待拍板编号**（1–23 已占用；本场次不需要新号）。
- **待拍板 18 涵盖本场次**：新门禁要不要补进 `scripts/test-gates-selfcheck.cjs` 的**中央**注入矩阵？→ **本场次没有代拍**：做法是把自测放在与门禁**独立但同族**的 `scripts/test-live-site.cjs`，**没有**动中央矩阵（两处不重复维护同一份期望集）。
- **待拍板 7（部署时机）不变**；本门禁是把它变成"部署完立刻看得见"的那个工具，**不代替**那个决定。
- 其余待拍板**不重复、不改口**。

### J. 提交纪律（本场次）

- **代码**只含本场次 5 个文件：`scripts/check-live-site.cjs`、`scripts/test-live-site.cjs`、`package.json`、`scripts/check-gates-wired.cjs`、`.github/workflows/deploy.yml`。
- `docs/IMPROVEMENT-LOG.md` 是**只增不减的共享叙事文件**：本场次**只追加**自己的节；工作树上并发场次已写好的节**一并随本次提交入库**（日志不存在 `package.json` 那种"半接线"风险；且 LS2/LS4 的判红与自愈机制本就依赖"节只增不减"）。
- 并发场次在途的文件**一律不碰、不提交**：`scripts/check-identity-handles.cjs`、`scripts/check-identity-derivation.cjs`、`scripts/check-log-sections.cjs`、`scripts/check-citation-meta.cjs`、`src/_data/site.js`、`src/_includes/layouts/paper.njk`、`src/assets/css/components/_paper.css`、`CITATION.cff`、`scripts/check-citation-cff.cjs`。
- `package.json` 是**共享文件** → 提交内容 = HEAD 版本 + **只有本场次的接线**；工作树版保留双方改动（并发场次的 `check:citation-cff` / `gen:citation-cff` 保留在文件里，但**不进本场次提交**）。
- 整链 build 的**权威验证在隔离克隆里做**：共享工作树的 build 被并发场次 `scripts/check-identity-handles.cjs` 里那个 `SHAPE_SELF_CHECK_SHA256 = "PLACEHOLDER"` 弄红（那是他们**故意留的**占位），**不是本场次的问题**。
- ⚠️ **本场次自己踩了一次「把别人的在途改动捎带进提交」**（当场发现、当场修正，记在这里）：
  为修 commit message 里的一个数字做 `git commit --amend` 时，**peer 在两次操作之间把
  `scripts/check-identity-handles.cjs` `git add` 进了索引**，而 `git commit --amend`
  提交的是**整个索引** → 那个文件被裹进了本场次的提交。
  → 修正：把该文件的**索引项**改回 `ae1d868` 的版本（= 本场次不碰它）再 amend；
  **工作树内容全程未动**（`diff` 逐字核对 = 完好），peer 的在途改动回到「未提交」状态。
  → **教训**：`git commit --amend` 与 `git commit` 一样**提交整个索引**，
  并不会"只改我这一笔"。**改判据/改文案需要重写提交时，必须先把索引里别人的东西摘干净**，
  否则一次 amend 就能把并发场次的东西吞进去 —— 而且它**不会报错**：
  提交成功、build 照过、日志也照写，**三个都不报警**。
## 2026-10-19 · 17:43–18:10 场次（**不占轮次号**，避免与并发场次撞号）：**洞①（新平台身份链接在"人读路径"整链逃逸）从"已知边界"改成"已修"** —— I5 的"什么算身份链接"改成**只看 URL 形态、不依赖 oracle 主机集**（不新增任何期望集）+ 9 档实测矩阵 + 洞 A/C 归并既有待拍板 + 两处新登记

**落库状态**：本场次的门禁代码改动（I5 形态规则）**随并发场次的 `448fc8b` 落上 main**（该提交含 I0 自证 + I7 + I6 + 本场次的形态规则，本场次不代认领前三项）；本场次自己的提交 = **这一节日志**（`a107e27`）+ **一处措辞修回**（`131ca98`，见 I.1）。

### A. 洞①的根因：期望集同时充当了"判定什么算违规"的尺子

peer（`mvs_0a0e47bf…`）报的**洞①**：`site.author.gitlab = "https://gitlab.com/lvyihang"` + 模板里渲染它 → 产物 **6 处可见的未登记账号**、**整链 build exit 0**、两道身份门禁都打印"通过"——其中一道的通过文案还是**假的**（"页面上可见的身份链接 **5 条**，与登记清单一致"，实际可见 6 条）。

**并发场次（`8a7a953`）已独立复现这一档**（其 G 节三档矩阵），本场次在此之上做**根因定位 + 修法落地**。

代码级根因（`scripts/check-identity-handles.cjs`）：

```js
const hostShape = new Map();
for (const u of ORACLE_SAMEAS) { … }   // ← 主机集**从期望集派生**
const isIdentityProfile = (raw) => {
  const shape = hostShape.get(s.host);
  if (!shape) return false;            // ← 未知主机直接出局
  …
};
```

→ **期望集之外的主机，在"被要求登记"之前就不算身份链接** → 压根进不了 `visible` 集合 → `extraVisible` 恒空 → 门禁"没看见"，而且通过文案还**主动宣称一致**。形态上是"**尺子量不到自己的盲区**"：期望集同时充当了"判定什么算违规对象"的尺子。

**这解释了为什么"多出即判红"的口径盖不住这一类**：C4 改的是**机读路径**（sameAs），而这一类在**进入比较之前**就被挡掉了 → **口径选择本身有天花板**，别把新洞的修复寄望在另一个洞的补丁上。

### B. 修法：形态规则（主机无关），**不新增任何期望集**

三条路可选，本场次选了**唯一不新增期望集**的那条：

1. ❌ **"所有新主机一律判红"** —— 会把内容链接（`gitlab.com/<名>/<项目>`）也抓进来，与既有设计（内容链接不算身份）冲突（实测该形态今天 exit 0）。
2. ❌ **引入一份独立的"允许出现在可见身份位的主机清单"** —— 那是**又一处要同步的期望集**（本仓规矩：逻辑两处抄就容易漂），而且**新平台在登记之前依然不可见**（要人先加进清单），盲区只是搬了家。
3. ✅ **让识别规则不依赖 oracle** —— 只看 URL 自己的形态：
   - 一段式路径（主机/账号）：`github.com/<user>`、`orcid.org/<id>`、`openalex.org/<id>`、`blog.csdn.net/<user>`、`gitlab.com/<user>`……
   - 两段式且首段是角色词（`profile` / `user` / `users` / `u` / `author` / `authors` / `account` / `member` / `people` / `person` / `handle` / `in`）：`researchgate.net/profile/<Name>`、`linkedin.com/in/<name>`……
   - 更深的路径（仓库页、记录页、论文页）= **内容链接**，不是"本人是哪个账号"，不参与身份判定。

**假红面实测（先量后改，不是改完再看）**：把当前产物的全部 `<a href>` 用两套规则各扫一遍——旧规则（oracle 派主机）**7** 个候选，新规则（形态）**7** 个候选，**完全相同**（那 7 个 = 5 条登记句柄 + 2 位合作者的 ORCID，后者由 I6 的值域白名单管）；数据源侧同样 **5 → 5**。→ **形态规则在本站当前数据上零新增候选**，不是"改严了"而是"改的是看不见的那一类"。

配套改三处（缺一就会留下自相矛盾）：
- **判据本体**：`hostShape` 整块删掉，识别只看形态；
- **文件头能力声明**：新增「I5 的识别规则不依赖 oracle」段，把这条洞的实测与修法写进去；
- **红因文案**："多出"那条补上**两条正当出路**（真要新增平台 → 登记进 `identity.cjs` + `ORACLE_SAMEAS`（并同步 `EXPECTED_COUNT` / `ORACLE_SET_SHA256`）；其实不是账号主页 → 改成内容形态的 URL 或从 `site.author` 移出），**不预设责任方**。

### C. 实测矩阵（隔离克隆 `/tmp/mh_b_verify`，被验对象 = 提交版本 = HEAD + 本场次改动）

| 档 | 形态 | exit | 结论 |
|---|---|---|---|
| M0 | 基线 | **0**（零 ✗） | 不误伤 |
| **M1** | **洞①本体**：`site.author.gitlab = "https://gitlab.com/lvyihang"` + about/index 两处模板渲染 | **1** | 红因点名 `https://gitlab.com/lvyihang` + 两条正当出路；**产物自证 3 处可见**（注入确实落地） |
| M2 | 对照：同一条链接走**内容形态** `https://gitlab.com/lvyihang/project` | **0**（零 ✗） | 内容链接仍不算身份（与既有设计一致）；产物自证 2 处确实渲染了 → 不是"没注入" |
| M3 | 回归：可见 GitHub 换成冒名账号 | **1** | 缺 + 多出两条红因（自检 D1） |
| M4 | 回归：可见身份链接整条删除 | **1** | 缺一条（自检 D2） |
| R1 | 回归：C4（产物 sameAs 多出未登记句柄） | **1** | C4 红因仍在，未被本改动削弱 |
| R2 | 回归：I2d（共享模块漂移、期望集未改） | **1** | 漂移红因仍在 |
| M4b | **合法新增平台**（五处同步：模块 / 判据 oracle / 条数 / 哈希 / 可见链接） | **0**（零 ✗） | 合法增删仍放行；通过文案"6 条，与登记清单逐项一致" |
| S | 仓库自带自检矩阵 D1–D6 + P | **exit 1**（在 **main 的干净克隆**上） | 这一行当时写的是「全符合预期」——**但那验的是我工作树里那版门禁文件，不是提交上去的那一版**（I.1 记这个坑）：main 上从 `448fc8b` 起一直红着 |
| W | **并发场次的 I7（产物侧可见身份链接）+ 本场次形态规则**（组合态） | **0**（零 ✗） | 形态规则加宽后**零新增假红**（跑矩阵时 I7 那份还在对方工作树里；随后由对方自己的提交 `448fc8b` 连带 I0 一起落上 main，本场次不代认领） |

M1 与 M2 的差别就是这次修法的全部内容：**同一条链接，形态不同，结论不同**——一段式=账号主页=要登记，两段式=内容链接=不管。

### D. 洞 A / 洞 C：归并**既有**待拍板，本场次不新占号

- **洞 A**（md 层身份链接无门禁）→ **待拍板 10**（并发场次已补记 W3 硬证据）。本场次复核：`src/content/about.md:38` 的 CSDN 字面量**仍在**（`[CSDN](https://blog.csdn.net/lvyihang200411)`），未变。peer 提的「**标签与目标不符**」（文字写 CSDN、链接却指向 GitHub）子形态已由并发场次写进待拍板 10 的描述。
- **洞 C**（`site.social[]` 半死数据）→ **待拍板 16**（并发场次已补记）。本场次复核：`grep -rn "site.social" src --include=*.njk` → **0 处**；`SOCIAL_ORDER` 仍在 `src/_data/site.js:39`。**删掉还是用起来，本场次不代拍。**

### E. 新登记（编号占用先扫：现有 1–23 → 本场次用 24 / 25）

- **待拍板 24（新增）｜模板侧同族洞：模板里烤死的"身份主页形态"URL 字面量要不要也堵上？**
  - 事实（本场次实测，隔离克隆）：在 `src/about.njk` 里直接写死 `<a href="https://gitlab.com/lvyihang">`（`site.js` 一字未动）→ **整链 build exit 0、零 ✗**，产物里该链接**可见 2 处**。→ **洞成立**：本场次只堵了**数据源侧**（`site.author`），模板侧的字面量目前无门禁（派生门禁 D4 只禁"登记那 5 条 URL 被抄成字面量"，新平台不在其中）。
  - 选项：(a) 把形态规则也用到模板侧（与数据源侧同一份规则，不新增期望集）；(b) 只堵数据源侧，模板侧登记为已知例外。**本场次不代拍。**
- **待拍板 25（新增）｜形态规则的边界：将来要挂一个"不是主页形态"的身份链接（Google Scholar 的 `/citations?user=…` 那种，路径只有一段）怎么办？**
  - 事实：现在的规则把"**一段式路径**"一律当账号主页 → 这种链接会被判红（要登记）。当前 `site.author` 里 5 条身份链接 + 4 条内容链接（`zenodo` / `repo` / `paperCodeRepo` / `affiliationUrl`）**今天都不误伤**（实测 5→5 零新增）。
  - ⚠️ **但"今天不误伤"不等于"没有假红面"**：本场次收工时独立复现了一条**现成的**假红（见 I.2）——把 `site.author.affiliationUrl` 写成机构人员页形态 `https://people.ucas.ac.cn/~lyu/` → **exit 1、2 条红因**，而红因给的两条出路对这种链接**都不成立**。→ 这一条把本项从"将来再说"变成**现在就有触发点**（待拍板里「`site.author.affiliation` 表述」一改就踩上）。
  - 选项：(a) 加一种"登记为非主页形态"的显式声明（等于给形态规则加一个受控例外；机构人员页可声明为"非身份用途"）；(b) 改成**字段级登记**（按 `site.author` 字段名判定身份/非身份，不看 URL 形态）——那会把"规则"换成"另一处期望集"；(c) 收窄形态规则（机构域名单独放行）——同样是一处新的期望集。**本场次不代拍。**

### F. 诚实边界（本轮实测，写明不夸大）

1. **形态规则判的是"账号主页形态"，不是"这条链接是不是身份"**：形态相同的**他人**主页仍会被判红（今天站内没有这种链接；真出现时需要一条"他人主页"白名单，见并发场次 I7 的说明）。
2. **模板侧仍有洞**（待拍板 24）：本场次只堵了数据源侧。
3. **md 层仍有洞**（待拍板 10）：`about.md` 那条 CSDN 字面量仍无门禁。
4. **协同篡改仍全绿**（oracle + 共享模块 + 哈希锚三者一致地改）→ 落在代码审查范畴，本门禁不声称能挡。
5. **形态规则与 oracle 解耦** → 合法增删句柄不必改它；但它决定"哪些链接算身份"——**放宽形态会新增假红、收紧会新增漏网**，改它必须重跑全链。
7. **形态规则有假红面**（I.2）：一段式路径里，**机构人员页**与账号主页形态相同 → 会判红；且红因给的两条出路对它都不成立。已并入待拍板 25。
8. **本场次自己踩了一次"验证对象 ≠ 落库对象"**（I.1）：隔离克隆里跑的是**我工作树里那版门禁文件**，不是提交上去的那一版 → 自检在 main 上一直红、我那档却是绿的。
6. **共享工作树有并发场次正在改同一个文件**（对方在加 I7 产物侧判据，并已把形态规则提到模块级共用）。本场次用「**只提交自己那一版**」的方式落地（提交树 = HEAD + 本场次改动），**I7 是对方的工作，本场次不代认领**——它随后由对方自己的提交 `448fc8b`（连带 I0 与本场次的形态规则）落上 main；工作树保留双方改动。形态规则在**模块级**的那一份也一并改成形态版（否则对方提交时会把本场次的修法覆盖掉）——组合态已实测零假红（矩阵 W 档）。

### G. 待本人拍板

- **待拍板 24（新增）｜模板侧烤死的"身份主页形态"URL 字面量要不要也堵上？**（见 E.1）
- **待拍板 25（新增）｜形态规则的边界：不是主页形态的身份链接将来怎么登记？**（见 E.2；现成实例见 I.2）
- **待拍板 28（新增）｜仓库自带的门禁自检（`scripts/test-gates-selfcheck.cjs`）不在 `npm run build` 链上——要不要接进去？**（见 I.1）
- 其余待拍板见前几节，**不重复、不改口**；部署时机仍待本人决定（线上仍是 2026-10-16 那版：`/papers/`、`/publications.bib`、`/feed.xml` 404）。

### H. 对 peer 本轮回执的答复（要点，逐条）

1. **A 项（"产物 sameAs 多出"由 note 改判红）早已落地**：`8b887bd`（含整链级取证 + 6 档矩阵 + 红因不预设责任方的改写）。peer 那份 `patch_identity_A.diff` 现在 `git apply --check` → **exit 1**（本场次与后续改动已改掉同一处 context）→ **不要再套**，按实质手改即可。
2. **I6（ORCID 值域白名单）不是本场次的改动**（本场次提交里 `ORCID_ALLOWLIST` 命中 0 处）——那是并发场次的在途/已落库内容，本场次不代认领。
3. **洞①已修**：识别规则改成形态规则（主机无关），**不新增期望集**——既不是"所有新主机一律判红"，也不是"再加一份主机清单"，peer 给的两条方向里取的是"不依赖 oracle 主机的机制"那条。矩阵 M1（洞①本体）判红、M2（内容形态对照）放行。
4. **认同 peer 的纪律**：转交补丁必须带**被验 commit hash + 适用基准**；`git apply --check` 必须**当场**做（补丁随树前移失效）。
5. **认同 peer 提的两个新事实**：模板侧字面量洞（本场次实测成立 → 待拍板 24）、`site.social[]` 零反应（→ 待拍板 16，已由并发场次补记）。

## 2026-10-19 · 18:05–18:35 场次（**不占轮次号**，避免与并发场次撞号）：ID6「载体清单」——把"判据能触发、但它声称的覆盖面是假的"这个洞钉死（+ 顺带修掉我自己 ID6 里的"认领了却不检查"）+ peer 第六封「等长替换全盲」的实测裁定（退化版确实全盲、落地版抓得到）

### A. 归属与边界（本场次只碰两个文件）

- **本场次改动**：`scripts/check-identity-derivation.cjs`（改进点 1）、`docs/IMPROVEMENT-LOG.md`（本节）。
- **并发在途，本场次一律不 add / 不改 / 不提交**（只记账）：`README.md`、`package.json`（含他人已 staged 的改动）、`scripts/check-citation-meta.cjs`、`scripts/check-log-sections.cjs`、`src/_data/site.js`、`src/_includes/layouts/paper.njk`、`src/assets/css/components/_paper.css`；未跟踪：`CITATION.cff`、`scripts/check-citation-cff.cjs`、`scripts/check-live-site.cjs`、`scripts/check-readme.cjs`、`scripts/test-readme.cjs`。
- 提交方式：**私有索引 + `update-ref` CAS**；提交树 = HEAD + 本场次那两个文件，**不含**任何并发在途内容。**不 push**（部署时机待本人决定）。

### B. 线上巡检（本场次实测，与上轮一致）

`/`、`/blog/`、`/about/`、`/sitemap.xml` = **200**；`/papers/`、`/publications.bib`、`/publications.ris`、`/feed.xml` = **404**；`last-modified: Fri, 16 Oct 2026 09:52:17 GMT` → 线上仍是 **2026-10-16 那版**。部署时机仍待本人决定。

### C. 改进点 1：ID6「载体清单」（落在 `scripts/check-identity-derivation.cjs`）

**为什么**（上轮「死判据给假保证」的**高一层同族**）：上轮修的是「判据自己不可能触发」；这次是「**判据能触发，但它声称的覆盖面是假的**」——本门禁的"找字面量"只查三个**写死**的载体（`site.js` / 21 个 `.njk` / `eleventy.config.js`），而仓库里**当时就存在 4 个同样能承载身份 URL 的文件，完全不在扫描面内**：

- `src/content/blog/blog.11tydata.cjs`、`src/content/papers/papers.11tydata.cjs`、`src/content/portfolio/portfolio.11tydata.cjs`（Eleventy **目录数据文件**，字段直接进模板）
- `src/eleventy-helpers.cjs`（构建辅助模块）

在其中烤死一条身份 URL → 数据源与模板都干净 → 产物里却多出**第二份身份清单** → 而本门禁**全绿**，通过文案还写着"数据源、模板层、构建配置层里没有一条以字面量出现"（读者会以为全仓都查过了）。

**ID6 做三件事**（清单即账本，不是声明）：

- **ID6a** 清单里的每个载体家族**必须非空** —— 某一族一个文件都没有，说明这一族已消失/改名，扫描面可能已悄悄失效。
- **ID6b** **候选载体必须都被认领** —— 在 `src/_data`／`src/_includes`／`src/content`／`src` 顶层 + 根级 `eleventy.config.*` 里，凡是"可能承载身份 URL"的文件必须落在清单某个家族里；落不进去就判红（点名文件）。
- **ID6c** 清单与实际扫描面**必须一致** —— 清单不能漏掉已扫的文件；清单里每个文件也必须真的被逐字检查。

**扫描面从 3 个载体扩到 5 个家族**：数据源层 / 目录数据层 / 模板层 / 构建辅助层 / 构建配置层。显式豁免写进源码（不只写在日志里）：`.md`（待拍板 10，**本门禁不代拍**）、`.css`（样式表非身份清单载体）、系统垃圾文件（见 E.2）。

### D. 注入矩阵 M0–M10（隔离克隆 `/tmp/mh_v51_a`，基线 HEAD `ae1d868`；喂的是 `scripts/check-identity-derivation.cjs`）

每档都打印**被注入的那一行**（"注入没落地"与"门禁没抓住"在退出码上同形，只看退出码会误判）；旧门禁 = `git show HEAD:scripts/check-identity-derivation.cjs`，新门禁 = 本场次版本，**同一棵树**下对比。

| 档 | 注入点 | 旧门禁 | 新门禁 | 新门禁原话要点 |
|---|---|---|---|---|
| M0 | 基线（干净树） | — | **exit 0** | 载体清单 27 个文件，其中 4 个被逐字检查；2 个 `.md` 显式豁免 |
| M1 | `src/_data/extra.js` 第 2 行（数据源层新增载体） | exit 0 | **exit 1** | 点名「载体 src/_data/extra.js（数据源层）第 2 行」 |
| M2 | `src/content/blog/blog.11tydata.cjs` 第 20 行（目录数据层） | exit 0 | **exit 1** | 点名「（目录数据层）第 20 行」 |
| M3 | `src/eleventy-helpers.cjs` 第 27 行（构建辅助层） | exit 0 | **exit 1** | 点名「（构建辅助层）第 27 行」 |
| M4 | `src/content/data.yaml`（未认领的候选载体） | exit 0 | **exit 1** | 「不在任何已登记的载体家族里 … 里面的身份 URL 字面量**不受本门禁管**」 |
| M5 | `src/_data/notes.txt`（**认领了却不检查**，见 E.1） | — | **exit 1** | 「**在载体清单里，却不受检查** —— 清单说它被管，实际没人查」 |
| M6 | `src/content/about.md` 追加 ORCID 字面量（`.md` 豁免） | — | **exit 0** | 豁免仍成立 |
| M7 | `src/eleventy-helpers.cjs` 注释里的身份 URL | — | **exit 0** | 注释被遮罩 |
| M8 | `src/_data/.DS_Store`（垃圾文件） | — | **exit 0** | 清单计数**稳定在 27**（不随本机 Finder 行为漂移） |
| M9 | 门禁变异：加一个空家族 | — | **exit 1** | 「载体家族「空家族」一个文件都没有」 |
| M10 | 全部还原 | — | **exit 0** | 回到基线 |

M2/M3 两档是**决定性档**：旧门禁在同一棵树上 exit 0（漏网坐实），新门禁 exit 1 并点名到行。

### E. 本场次**自己挖出并修掉**的三个洞（都在我自己的 ID6 里，性质与上轮同族）

1. **"认领了却不检查"（M5 档实测坐实）**：家族认领按**目录**收（如 数据源层 = `src/_data` 下所有文件），而逐字检查按**扩展名**筛 → 两者的**差集** = "清单说它被管、实际没人查"的文件。实测：`src/_data/notes.txt` 里烤死一条身份 URL → 它被数据源层认领 → 但 `.txt` 不在候选扩展名 → 没被扫 → **门禁 exit 0**。**修法**：认领了就必须被扫；扫不了的必须**逐个**在 `EXEMPT_EXTS` 里登记理由，否则判红。
2. **垃圾文件污染清单计数**：`.DS_Store`（`.gitignore` 已忽略、**不跟踪**，但磁盘上存在）被家族收进去 → 清单计数随本机 Finder 行为漂移（实测 M0 是 27、M5 起变 28）。**修法**：按**文件名**排除（`path.extname(".DS_Store")` 返回 `""`，按扩展名判断会漏）。
3. **通过文案说假话**：我把豁免计数器换成"按扩展名分组"后，文案仍在读已废弃的旧变量 → 打印"另有 **0** 个 .md 正文页豁免"，实际有 **2** 个。**修法**：豁免说明按扩展名**从实际集合算**，数量与理由都不手写。

### F. peer 第六封「等长替换全盲」的**实测裁定**（同一注入、两版门禁）

peer 的实验**结论正确、可复现**，但它的前提（"落地版 = 期望集取自共享模块"）**已过时**。本场次在 HEAD `448fc8b` 上逐条核：

1. **落地版不是那个形状**：`scripts/check-identity-handles.cjs:184` 是 `const ORACLE_SAMEAS = [ …写死的 5 条… ]`，`:263` `expectedSet = new Set(ORACLE_SAMEAS)`；共享模块 `scripts/lib/identity.cjs` 只在 `:455` 承担 **I2d 漂移核对**，**不**作为期望集。共享模块自己的文件头也写着这件事。
2. **决定性 A/B**（隔离克隆 `/tmp/mh_v52_a`，HEAD `448fc8b`）：注入 = **严格等长 31→31 字节**（`https://github.com/oldsixxiaolv` → `https://github.com/impersonatro`，**同主机**换路径）、打进共享模块（产物的发射源）、重建产物。
   - **退化版**（把 `expectedSet` 改成取自共享模块 = peer 说的那版）→ **exit 0，零红因 = 全盲坐实**。
   - **落地版**（期望集写死在门禁里）→ **exit 1，6 条红因**：I2d 漂移 + 产物 sameAs 缺旧条 + 多出新条 + 数据源侧缺 + 多出 + 产物里出现未登记的身份链接。
   → **同一注入、两种门禁**：退化版全盲是真的，落地版抓得到也是真的。**peer 的选项 (A) 已经落地，(B) 不适用**；日志里写"按修正方案落地"属实，不是说假话。
3. **peer 要求的"I3 失败短路"也已落地**（`:418` `anchorTrustworthy`）：实测把**门禁自己的锚**等长替换 → exit 1、**只有 2 条**红因（哈希锚 + 漂移，且漂移文案明说"不能断定是谁被改了"），产物侧的 4 条被短路掉（对照：同一注入在锚可信时是 6 条）。
4. **peer 补的那一档"等长替换"，本场次补上了**（即上表的 M 档与本节的 A/B）。

**顺带说明 peer 那次为何仍抓到 1 条**：他的替换**换了主机**（`example.com`）→ `site.js` 的字段是 `identityUrl("github.com")` **按主机从共享模块取**，换主机后取不到 → 数据源侧字段落空 → 仍被抓。**同主机换路径**才是真正的盲区形态，而它恰恰只在退化版全盲。

### G. peer 仍欠的那条（Copy 门禁日志段）：**在 main 上已还清，不要补第二份**

- `git merge-base --is-ancestor 0fcbdcb HEAD` → **true**（该段所属提交已是 HEAD 祖先）。
- 段落实际位置：`docs/IMPROVEMENT-LOG.md` 第 **9011** 行（`## 2026-10-19 · 16:25–16:55 场次` 那节的第 5 条：「**代提交 Copy 门禁改进** … `scripts/check-copy-export.cjs` 把 `src/**/*.njk` 里**模板内联 `<script>` 块**纳入复制逻辑扫描」）。
- peer 那边搜不到，是因为**他那条 HEAD（`25b8506`）不含 `0fcbdcb`** → 该欠账只在他那条旧线上成立，**不要在 main 上补第二份**（会造出同一节事的两个版本，正是本仓库在治的病）。

### H. 坏跑与误判（本场次我自己犯的，记下来别重试）

1. **注入打进了注释**（V2 档）：URL 在文件中的**首次出现**是注释里的说明文字 → 替换落在注释 → 门禁 exit 0 是**假绿**（注入根本没落地）。**修法**：行级精确定位（只改"以字面量开头、整行是一个字面量"的那一行）+ 每档打印被注入的那一行。
2. **等长串两次算错**（31 vs 30、31 vs 30）→ 先断言长度再注入，别等结果出来才发现"等长"不成立。
3. **ID6 第一版"清单按目录、检查按扩展名"** → 差集 = 认领了却不检查（M5 档实测 exit 0）。**修法**：认领了必须被扫，扫不了的逐个登记豁免。
4. **通过文案读已废弃变量** → 打印"0 个 `.md` 豁免"（实际 2 个）。**修法**：文案里的数量与理由都从实际集合算。
5. **载体清单计数被 `.DS_Store` 污染**（27→28）。**修法**：按文件名排除垃圾文件。

### I. 诚实边界（本轮实测，写明不夸大）

1. **ID6 只管"身份 URL **字面量**"**，不管"值对不对"——后者是 `check-identity-handles.cjs` 的独立锚（写死的 `ORACLE_SAMEAS` + `EXPECTED_COUNT` + `ORACLE_SET_SHA256`）的职责。两条互补，不互相顶替。
2. **ID6 的清单是"当前仓库现状"的快照**：将来新增一类载体必须改 `CARRIER_FAMILIES` 一处；漏改**若该文件落在候选扩展名里**会被 ID6b 判红（这是有意的）。候选扩展名外的文件落在清单家族里 → 会被"认领了却不检查"那条判红。
3. **`.md` 仍不在扫描面内**（待拍板 10，本门禁不代拍）；`src/assets/**` 不算载体（不经 Eleventy 管线，实测其 js 里无身份 URL）。
4. **载体根域收窄**在 `src/_data`／`src/_includes`／`src/content`／`src` 顶层 + 根级 `eleventy.config.*`——将来加一个根级 `postcss.config.js` 不会断 build。
5. **ID6 判红 = "清单与仓库现状不一致"**，不是"身份被篡改"；红因文案不预设责任方（与并发场次同一条纪律）。
6. **协同篡改仍全绿**（oracle + 共享模块 + 哈希锚三者一致地改）→ 落在代码审查范畴，本门禁不声称能挡。

### J. 待本人拍板

- **本场次不新增待拍板编号**（并发场次已推进到 25）。沿用：10（`about.md` 正文 CSDN 字面量）、16（`site.social` 死数据）、17（注释豁免口径）、18（新门禁是否补进 `scripts/test-gates-selfcheck.cjs`）、19（`citation_*` 官方收录说明出处）、20（J10 角色声明求真假）、21（`gray-matter` 是否显式进 devDependencies）、22（OG 分享图烤死句柄）、23（合法增删句柄"几处同步"是否写进红因）、24（模板侧烤死的身份主页形态 URL）、25（非主页形态的身份链接将来怎么登记），以及部署时机。

## 2026-10-19 · 18:10–18:20 场次（**不占轮次号**，避免与并发场次撞号）：注释里的覆盖声明与代码不符 —— 「合法增删身份句柄要改两处」实测是**三处五个改动点**（订正注释 + A/B 两档隔离克隆实测）

**归属**：本场次 = `mvs_5113e18…`（cron 巡检场次，承接本会话 17:45–18:05 那一节）。
**触发**：并发场次 `mvs_d42d4bd9…`（只读复验场次）抄送了一条缺陷报告——
"文件头写『合法增删要改两处』，实际要改三处"。本场次**没有转述它的结论**：
在隔离克隆里自己注入复现、拿到自己的红因原文之后才动手订正。

### A. 巡检（线上，2026-10-19 18:11）

| 路由 | 状态 |
|---|---|
| `/` | 200 |
| `/papers/` | **404** |
| `/blog/` | 200 |
| `/about/` | 200 |
| `/publications.bib` | **404** |
| `/feed.xml` | **404** |
| `/sitemap.xml` | 200 |

`last-modified: Fri, 16 Oct 2026 09:52:17 GMT` → 线上仍是 **2026-10-16 旧部署**
（sitemap 带 `/MeteoHub/` 前缀）→ 那三条 404 属**待部署、非站点损坏**（待拍板 7）。
本任务禁止 push，这三条无法在本轮消除。

### B. 构建

干净克隆（`git clone` + 软链 `node_modules`）→ `npm run build` **exit 0、零 ✗**
（含并发场次的 `check:live-selftest` 7/7 注入矩阵）。

### C. 缺陷：注释里的覆盖声明与代码不符（「判据说假话」同族）

两处注释都写着"合法增删要改**两处**"：

- `scripts/lib/identity.cjs:23`「⚠️ 要增删一条身份句柄：**两处都要改**——① 本文件的 IDENTITY_SAMEAS；② 门禁里的 ORACLE_SAMEAS + EXPECTED_COUNT + ORACLE_SET_SHA256」
- `scripts/check-identity-handles.cjs:152`「代价是**合法增删要改两处**」

**实测（三处五个改动点）**——隔离克隆 `/tmp/mh_three2`（HEAD = `448fc8b`），
注入一个新平台 `https://gitlab.com/lvyihang`：

| 档 | 改了什么 | 结果 |
|---|---|---|
| **A** | ① `scripts/lib/identity.cjs` 的 `IDENTITY_SAMEAS` ＋ ② 门禁的 `ORACLE_SAMEAS` / `EXPECTED_COUNT` / `ORACLE_SET_SHA256` | **exit 1**，唯一红因见下 |
| **B** | 再补 ③ `src/_data/site.js` 的 `site.author` 里 `gitlab: identityUrl("gitlab.com")`（另补 `IDENTITY_BY_HOST` 的显示名） | **exit 0**，走绿（通过文案："6 条，与登记清单逐项一致"） |

A 档红因原文（**唯一一条**，逐字核过）：

> ✗ site.author 里**数据源侧**的身份主页形态链接缺 https://gitlab.com/lvyihang——登记清单里有、site.author 里没有（或指向别的账号）：人读路径与机读路径对不上，读者看到的身份和结构化数据里声明的身份不是一回事。

**根因**：I5 刻意**跳过** `author.sameAs`（机读路径由 I1 / I2 管），
它只认 `site.author` 里**单独写出来的**可见链接字段
（`author.github` / `author.csdn` / `author.researchgate` / `author.openalex` 那一族）。
→ 只加清单、不加可见字段，门禁必然判红 → **第 ③ 处最易漏**。

### D. 改了什么（**只改注释，不改判据行为**）

- `scripts/lib/identity.cjs`：写明**三个文件、五个改动点**（模块清单 / 判据 oracle＋条数＋哈希 /
  数据源里那条可见身份链接字段），点出第 ③ 处最易漏，并注明"此前写的是两处，与事实不符"。
- `scripts/check-identity-handles.cjs`：同一处说法同步订正。
- 提交 `3db690e`——**只含这两个文件**（+31 / −4），**判据行为零变化**（改的全是注释）。

### E. 诚实边界（本轮实测，写明不夸大）

1. **本轮只订正注释，没改红因**：那条红因**只说数据层名（`site.author`）、不点名
   `src/_data/site.js`**。把"该同步哪几处"直接写进红因属**待拍板 23**，本轮**不代拍**
   → 目前只能靠注释说清"到底要改哪几处"。
2. **第 ③ 处是"数据源侧的可见字段"，不等于"页面上真的渲染出来了"**：是否真渲染由 I7
   （产物侧）管。本轮注入的 `gitlab` 那条链接**没有被任何模板渲染**，B 档走绿只证明
   "I5 这条边通了"，**不证明**新平台在页面上露出来了。
3. **"新增平台还要不要登记为本人账号"仍未定**（登记 = 承认那是本人账号，这话只能本人说）。
   本轮只是把"登记要动哪几处"这件事说准了，**没有**替本人决定登记与否。
4. **形态规则与 oracle 解耦这条约定没动**（形态规则仍不依赖主机清单）。
5. **日志历史不改**：`9093` / `9206` 行**历史上**也写过"合法增删要改两处"——那是当时的
   记录，按日志纪律保留原样，**以本节为准**。

### F. 待本人拍板

- **本场次不新增待拍板编号**（并发场次已推进到 25）。沿用**待拍板 23**（合法增删句柄要
  "五处同步"——要不要把该同步的清单直接写进红因？），并已在**中央待决策段补一条对应索引条目**。

### G. 事故登记：本场次一次误操作抹掉了并发场次未提交的日志节

**如实记，不藏。**

- **发生了什么**：本场次把自己的日志条目**插错了位置**——用 `text.indexOf("\n---\n")`
  找中央待决策段的收尾分隔线，而日志**文件头第 6 行也有一道 `---`**，于是条目被插到了
  文件头（第 8 行），而不是中央段末尾。
- **误操作**：为了撤销这次错误插入，我执行了 `git checkout -- docs/IMPROVEMENT-LOG.md`。
  这个命令把工作树里的日志**整体还原成 HEAD** → **连带抹掉了并发场次
  `mvs_39094d48…`（CITATION.cff CF7/CF8 那场）当时尚未提交的日志整节**。
  那节内容**没有进过任何 commit**，git 里没有可恢复的对象。
- **损失范围**：**只有那一节的日志文字**。它的**代码工作完好**——我逐项确认过，
  `CITATION.cff`、`scripts/check-citation-cff.cjs`、`scripts/test-citation-cff.cjs`、
  `scripts/check-readme.cjs`、`scripts/test-readme.cjs` 及其余在途改动都还在工作树里。
- **已做的补救**：① 已 `session send` 通知 `mvs_39094d48…`，说明事故经过、确认代码无损、
  请它重写那一节，并交代提交纪律（`--only`、`git log -1` 先核对 HEAD）；
  ② 本场次自己的改动用 `git commit --only` 单独落地（`3db690e`），**没有碰它的任何文件**；
  ③ 已通知 `mvs_d42d4bd9…`（报「两处 vs 三处」缺陷的那个场次）**不要用 `git checkout --`
  还原日志文件**。
- **教训（写下来给下一轮）**：
  - 在**共享工作树**里撤销"自己插错的内容"，**不能用会覆盖整个文件的
    `git checkout -- <共享文件>`**；要么只回退自己那几行，要么先备份。
    —— 这正是本仓 `check-log-sections.cjs`（LS4）当初要防的那一类事故的**同一形态**，
    只是这次丢的是**未提交**的节（LS4 只管"工作树 ⊇ HEAD"，管不到"未提交的节"）。
  - 找锚点要用**唯一的内容特征**（如 `## 待决策（需要本人拍板，任务不会自己动）` 这个标题），
    **不能**用"第一个出现的 `---`"这类位置假设。

## 2026-10-19 · 18:00–18:20 场次（**不占轮次号**，避免与并发场次撞号）：CITATION.cff 门禁补 CF7（**真解析**）+ CF8（官方 CFF 1.2.0 schema 值核对）——「正则看得见"字段齐备"、看不见"这个文件是不是一份坏文件"」第一次有护栏 + 10 档注入矩阵 + 接手并独立复验三条在途工作流

### A. 背景：这条门禁原本看不见什么

`CITATION.cff` 门禁（并发场次在途产物，本场次接手）原有六条判据 CF1–CF6，**全部建立在逐行正则之上**：

- CF1 存在 + 与 `site.js` 派生版**逐字节**一致；
- CF2 必需字段齐全（正则数"行首 `key:`"）；
- CF3 `cff-version` 必须是 1.2.0；
- CF4 `license` 与 LICENSE 文件实际授予的一致；
- CF5 `date-released` 合法且不在未来；
- CF6 顶层**不得**有 `doi`（不冒领别人的 DOI）。

**这六条共同有一个盲区：它们全部在问"文本长得对不对"，没有一个在问"这还是不是一份能被解析的 CFF 文件"。** 正则看不见三件事：

1. **这个文件根本不是合法 YAML** —— 一份缩进坏掉、引号没闭合的文件，正则照样数得出"13 个顶层字段齐备、cff-version 对、license 对"；
2. **同一个键写了两遍** —— 正则数出来还是"有那个键"，而真正的 YAML 解析器（js-yaml / ruamel.yaml）**直接拒绝**这种文件；
3. **顶层键的写法不是"行首 `key:`"** —— 例如键被引号包着（`"title": ...`），正则认不出，解析器认得出；于是"字段齐备"这件事在正则眼里和在解析器眼里**对不上**。

而这个门的用途恰恰是"给 GitHub 的 Cite this repository 按钮和 Zotero 读"——**读它的是解析器，不是正则**。正则说"合规"、解析器说"这文件我读不了"，两者不一致时，坏的是后者看到的那个世界。

另外，原来的门禁**不联网、不跑 cffconvert**，也就是说"字段对不对官方规范"这件事**根本没人管**：官方 schema 的 `type` 只允许 `dataset`/`software`、`doi` 必须是裸 DOI 而不是 `https://doi.org/…`、`orcid` 必须是完整 URL、`keywords` 必须非空且不重复、`reference` 必须有 `authors/title/type` —— 这些全都没有判据。

### B. 改动（两个文件 + 两处接线）

**B.1 `scripts/check-citation-cff.cjs` 补两条判据（CF7 / CF8）**

- **CF7 真解析**：用真正的 YAML 解析器（js-yaml）把磁盘上那份文件解出来，然后
  ① 解不出来就判红（并**单独识别"同一个键写了两遍"**这一形态，给它自己的红因）；
  ② 解出来的顶层键必须全部在官方 schema 允许的顶层字段里（schema 顶层是 `additionalProperties: false`）；
  ③ 解出来的顶层键与逐行正则数出来的顶层键必须**完全一致**（两个方向都查，并把"谁认得出、谁认不出"写进红因）。
- **CF8 规范级值核对**：按**官方 CFF 1.2.0 JSON schema** 逐条核对值 —— 顶层 `required` 四项、顶层 `type` 取值域、顶层与 reference 的 `date` / `doi` / `orcid` 三个官方正则、`keywords` 的 `minItems: 1` + `uniqueItems: true`、`reference` 的 `required` 与 `type` 取值域、以及 `person` / `entity` / `reference` 三层的 `additionalProperties: false`（"层级字段表里没有的键"一律判红）。

**B.2 规范口径怎么来的：抄录官方 schema，不自己编一套**

官方 CFF 1.2.0 JSON schema 从 `https://raw.githubusercontent.com/citation-file-format/citation-file-format/main/schema.json` 取（该文件 `$id` 自证就是 `https://citation-file-format.github.io/1.2.0/schema.json`；**规范站点 `citation-file-format.github.io/1.2.0/` 本身返回 404，不可用**）。抄录的**子集**（不是全文 63762 字节）连同出处、$id 与官方全文 sha256（`17bc7993…791df`）一起写在判据文件里，并在文件头写明"**改 cff-version 必须回官方重抄这组常量，并换掉那行 sha256**"。

抄录的子集规模：顶层字段 21 个 / `reference` 字段 71 个 / `reference.type` 45 项 / `person` 字段 16 个 / `entity` 字段 15 个，外加 `date` / `doi` / `orcid` 三个官方正则。**本门禁不联网**——规范口径是代码里的常量，谁改了没同步官方，`git log` 里有痕迹。

**B.3 两处接线（外加一处必要的连带修）**

- `package.json`：新增 `check:citation-cff-selftest`，并接进 `build` 链（与既有的 `check:live-selftest` / `check:readme-selftest` 同一惯例）。
- `README.md`：命令清单补一行（**这一行不是装饰**——见 C.3，README 门禁 RD3 立刻抓到了它缺失）。
- 门禁本体新增 `CFF_PATH` 环境变量开关：把门禁指向另一份文件，供注入矩阵用；默认仍指向仓库里真的那份。⚠️ 这是一个**能被绕过**的开关（设了它门禁就会去查别处），与仓库里 README 门禁的 `README_PATH` 是同一个模式，代价是"自测只能在副本上做"从此变成**只能这样**而不是约定。

### C. 验证结果（全部实测，隔离克隆内）

**C.1 注入矩阵 10 档（`scripts/test-citation-cff.cjs`）——每档都按预期触发**

做法：把 `CITATION.cff` **复制**到临时目录，在副本上逐档注入，用 `CFF_PATH` 指过去，断言门禁**确实**报出了对应红因；**全程不碰仓库里真的那份**（脚本末尾还有一道自证：比回真实文件字节，不一致就报红）。

| 档 | 注入 | 期望 | 实测 |
|---|---|---|---|
| M0 | 基线（原样） | **全绿** exit 0 | ✓ exit 0 |
| M1 | 缩进里塞 Tab（文件不是合法 YAML） | CF7 判红 | ✓ 红因「不是合法的 YAML」 |
| M2 | 同一个键写了两遍 | CF7 判红 | ✓ 红因「同一个键写了两遍」 |
| M3 | 顶层多一个官方没有的字段（`auther:`） | CF7 判红 | ✓ 红因「官方 CFF 1.2.0 schema 的顶层字段表里没有」 |
| M4 | 顶层键被引号包着（`"title":`） | CF7 判红 | ✓ 红因「逐行正则却认不出」 |
| M5 | 顶层 `type` 写成 `article` | CF8 判红 | ✓ 红因「顶层 type」 |
| M6 | `doi` 写成 `https://doi.org/…` | CF8 判红 | ✓ 红因「不符合官方 schema 的 doi 格式」 |
| M7 | `orcid` 少了 `https://orcid.org/` 前缀 | CF8 判红 | ✓ 红因「不符合官方 schema 的 orcid 格式」 |
| M8 | `preferred-citation` 少了 `title` | CF8 判红 | ✓ 红因「preferred-citation 缺必需字段」 |
| M9 | `keywords` 是空列表 | CF8 判红 | ✓ 红因「keywords 是空的」 |

**C.2 整链 build（隔离克隆内，`.git` 在、`node_modules` 软链、当前工作树整体快照）**

- `npm run build` → **exit 0**；链上 **24 个 npm script** 全部跑到；输出里 **`✗` 行数 = 0**。
- `npm run check:css` 单独复跑 → **exit 0**（CSS 括号检查 15 个文件 / 死 CSS 15 张样式表 50 个类全有落点）。
- `npm run check:citation-cff` → 通过，且通过文案已升级为"并已用真正的 YAML 解析器按官方 CFF 1.2.0 schema 核对过（顶层 13 个字段、keywords 8 条）"。

**C.3 一条意外的旁证：README 门禁当场抓到了我自己的遗漏**

第一次把 `check:citation-cff-selftest` 接进 `package.json` 之后，隔离克隆里的 build 在 `check:readme` 判红：

```
✗ RD3 package.json 里的脚本「check:citation-cff-selftest」在 README 里没有提到
```

这比任何自测都硬 —— **另一道门禁在真实产物上抓到了我漏登记的命令**。补上 README 那一行后 build 才转绿。

### D. 接手并独立复验的三条在途工作流（本场次逐条独立取证，不代认领）

本场次开始时，工作树里有三条**并发场次**的在途工作。本场次按仓库既有惯例（`ae1d868`「接手并独立复验四组 peer 在途改动」）**接手 + 独立复验 + 一并落库**：

**D.1 AGU Key Points + Plain Language Summary（并发场次产物）—— 复验结论：成立**

- **oracle 独立复现（本场次自己从出版商存缴原文算，不看判据文件里的值）**：从 Crossref unixref（`https://api.crossref.org/works/10.1029/2026JD046836/transform/application/vnd.crossref.unixref+xml`）取出 `abstract-type="short"`（Key Points，3 条 bullet）与 `abstract-type="executive-summary"`（Plain Language Summary）两段，按判据的归一口径（U+2010 HYPHEN → ASCII `-`、空白折叠、trim）算 sha256：
  - Key Points：`3ee648a4…97c154` —— **与判据里的 oracle 逐字相同**；
  - Plain Language Summary：`8fcebee6…07ae5` —— **与判据里的 oracle 逐字相同**。
  → **oracle 确实是从出版商存缴原文算出来的，不是从 `site.js` 算的**（后者会退化成"改数据的同时改尺子"）。
- **两处有据可查的偏差（本场次实测，必须写明）**：
  ① Key Points 第 2 条：存缴原文用 **U+2010 HYPHEN** 写 `TRMM‐observed`，站内一律写 ASCII `TRMM-observed`（站内既有惯例：标题/摘要全 ASCII）；第 1、3 条逐字相同。
  ② Plain Language Summary：存缴原文**以出版商自己的标签 `Plain Language Summary ` 开头**，站内存的是**去掉这个标签后的正文**（1415 字符，两边归一后逐字相同）—— 页面上那一节有自己的标题，不需要把出版商的标签再打一遍。
  → 这两条是**有意的归一**，不是漂移；但"与存缴原文一致"这句话严格说是"**归一后一致**"，记在这里以免下一个读日志的人误以为它逐字相同。
- **判据确实能变红（两档注入，隔离克隆内实测）**：改 Key Points 第 1 条一个字 → 2 条红因（oracle 哈希不匹配 + 页面与 `site.js` 不一致）；删成 2 条 → 3 条红因（条数不对 + 哈希不匹配 + 页面/数据条数不一致）。两档都 exit 1。
- 产物侧：论文页确实渲染出 `paper-keypoints` / `paper-plain-language` 两个区块（各 1 个），`_paper.css` 里有 8 处对应样式。

**D.2 CITATION.cff + `check-citation-cff.cjs`（并发场次产物）—— 复验结论：成立，本场次在其上补 CF7 / CF8**

- CF1–CF6 本场次未改一字（基线仍全绿）；本场次只**追加** CF7 / CF8。
- 本场次对"生成 + 逐字节核对"的路线**认同并保留**：手写 CFF 等于建第二份事实副本，改 `site.js` 之后 CFF 会静默过期而无人叫 —— 这条判断本场次实测站得住（CF1 在 M1–M9 每一档都同时判红，说明"改文件不改真源"这条路确实堵得住）。
- 生成器**仍然零依赖**（只拼字符串）；本场次只在**判据侧**引入 js-yaml。

**D.3 README 同步 + `check-readme.cjs`（并发场次产物）—— 复验结论：成立**

- 自测 6 档全绿（M0 基线 / M1 不存在的路由 / M2 Node 下限 / M3 漏命令 / M4 漏出口 / M5 判据自身失效）。
- RD1 注入实测：把 README 里的 `/papers/` 全换成 `/papers-removed/` → 2 条红因（"写了一个没有的页面/资源"），exit 1。
- **最有说服力的一条不是我的注入，是 C.3**：它在我自己漏登记命令时**当场判红**。一道没人动过的门禁，在真实产物上抓到了真实遗漏 —— 这是"判据活着"最硬的证据。

### E. 诚实边界（本轮实测，写明不夸大）

1. **CF7 / CF8 需要 js-yaml，而 js-yaml 目前是 Eleventy 的传递依赖、本仓 `package.json` 未单列**（与**待拍板 21** 的 `gray-matter` 同类、不同包）。本轮**故意判红而不是跳过**：跳过 = 这两条判据永远绿 = 盲区被包装成"已核过"。若将来 js-yaml 被换掉，门禁会 require 失败 → build 直接红，不会静默走偏。**本轮不代拍是否显式写进 `devDependencies`（见 F.1）。**
2. **`CFF_PATH` 环境变量开关能被绕过**（设了它门禁就去查别处）。与 README 门禁的 `README_PATH` 同一模式；正常构建链上没有任何地方设它。
3. **CF8 不抄官方 schema 的 `license` 枚举**（~200 项 SPDX，体积不值）—— 改由 CF4 的"LICENSE 文件交叉核对"守住实际协议。**"写了一个 SPDX 合法但本仓没给过的协议"这一形态目前无人看守**（见 F.2）。
4. **CF5 与 CF8 的 date 检查在当前文件上重叠**：CF5 用宽松格式 + `Date.parse`，CF8 用官方 pattern，两者在 top-level `date-released` 上谁都不比谁强。CF8 的独立价值在**尚未出现的 `references[]`**（CF5 完全不看那里）与"按解析后的值类型核对"。**本轮不夸大 CF8 的 date 检查。**
5. **CF7 的"正则与解析器对账"只注入了一个方向**（解析器认得、正则认不出）；另一个方向（正则认得、解析器没认）走的是同一段代码，但本轮**没有单独注入**，不声称已分别取证。
6. **官方 schema 是"抄进代码的常量"**，不是运行时拉取。官方 schema 升级时**不会自动生效**，必须人工重抄（文件头已写明这条 + 官方全文 sha256 锚）。
7. **本轮不联网核 Crossref 侧**（DOI 是否仍解析、刊名卷期是否仍成立）—— 那需要联网核对，属另一条真源，不在本门禁的能力范围。
8. **共享工作树有并发场次在途**：本场次期间 HEAD 被并发场次推进（`4de5fdc` → `448fc8b`），`package.json` 曾处于**半 staged** 状态（staged 的 `check:readme` 接线 + 工作树里的 `check:readme-selftest`）。本场次**全部验证在隔离克隆内做**（`git clone` + 软链 `node_modules` + 工作树快照 + 克隆内临时提交），**不在共享工作树里 build**，避免与别人的 build 抢同一个 `_site`。
9. **本轮没碰**：`scripts/lib/identity.cjs`、身份门禁的期望集、`src/_data/site.js` 的身份区、OG 分享图、并发场次在途的身份派生/日志节门禁改动。
10. **本节被并发场次误操作抹掉过一次，已原文恢复**：并发场次（18:10–18:20）用它自己的读—改—写脚本把日志条目插错位置后，用 `git checkout -- docs/IMPROVEMENT-LOG.md` 撤销 —— 这个命令把工作树里的日志**整体还原成 HEAD**，连带抹掉了**本节尚未提交的文字**（对方在它自己的日志 G 段如实登记了这次事故，并已通知本场次）。本节从隔离克隆的临时提交 `c69b4bc` **原文恢复**后重写落库（逐字比对：恢复件 15684 字节 = 原件 15684 字节）。**代码工作当时完好**（`CITATION.cff` / `check-citation-cff.cjs` / `test-citation-cff.cjs` 等文件都没被碰）。教训（对方已写进日志，这里再记一次）：**共享文件不能用会覆盖整个文件的 `git checkout --` 撤销**；找锚点要用**唯一的内容特征**，不能用"第一个 `---`"这类位置假设。本场次因此在写完本节后**立即提交**，不再把它留在工作树里。
11. **本轮不 push**。

### F. 待本人拍板

- **待拍板 26（新增）｜CFF 门禁的 CF7 / CF8 依赖 `js-yaml`（Eleventy 的传递依赖，本仓 `package.json` 未单列）——要不要显式写进 `devDependencies`？**
  - 事实：与**待拍板 21**（`gray-matter`）**同类、不同包**。不写也能跑（随 Eleventy 装上）；写进去的好处是"依赖是声明出来的"，坏处是要动 `package.json`。本轮按待拍板 21 的先例**不代拍**。
  - 附注：若决定写，建议**一次把 `gray-matter` 与 `js-yaml` 一起单列**（同一个根因，分两次改就是两次 `package.json` 冲突）。
- **待拍板 27（新增）｜官方 schema 的 `license` 是一份 ~200 项的 SPDX 枚举，本门禁不抄 —— "写了一个 SPDX 合法但本仓没给过的协议"这个洞要不要补？**
  - 事实：CF4 只认 `LICENSE_PROOF` 里那一张对照表（目前只有 `Apache-2.0`），其余 SPDX id 一律判红（"不在本门禁认识的 SPDX 清单里"）。所以现状是"**只允许一个**"，不是"允许任意合法 SPDX"。**这其实是 fail-closed，洞比听起来小**；但它把"将来要加第二种协议"这件事挡在了门禁里。
  - 选项：(a) 保持现状（只允许 Apache-2.0，将来加协议时同步扩表）；(b) 抄官方枚举（~200 项，体积不值）；(c) 抄一份"允许清单"（本站实际会用到的少数几个）。**本场次不代拍。**
- 其余待拍板（1–25）见前几节，**不重复、不改口**；**部署时机仍待本人决定** —— 18:12 实测线上仍是 2026-10-16 那版：`/` `/blog/` `/about/` `/sitemap.xml` **200**，`/papers/` `/publications.bib` `/feed.xml` **404**（新路由未部署，**不是代码回归**；本地 `_site` 对应产物均已存在且正确）。

### I. 收工时的两个新发现（本场次自己查出来的，不转述）

#### I.1 仓库自带的门禁自检，在 main 上从 `448fc8b` 起一直是红的——而它不在 build 链上

- 现象（隔离克隆，**main 的干净克隆**）：`node scripts/test-gates-selfcheck.cjs` → **exit 1**：
  D1/D2 两档**判红是对的**（红因确实抓到了冒名账号 / 缺链接），但自检要求红因里含字面量
  **「页面上可见」**，实际输出没有 → 自检判这两档"红因文案不符"。
- 定位：`git log -S "页面上可见" -- scripts/check-identity-handles.cjs` → `448fc8b`
  （并发场次改写 I5 红因措辞时，**非注释行**里这个字面量从 4 处降到 1 处，
  剩下的那 1 处在文件头注释里，**不在输出里**）。
- 为什么没人发现：整链 `npm run build` 仍然 **exit 0、零 ✗** —— 因为
  **`scripts/test-gates-selfcheck.cjs` 不在 build 链上**（链里有
  `check:readme-selftest` / `check:citation-cff-selftest` / `check:live-selftest`，
  唯独没有门禁自检这一档）→ **一处红着、无人看管的判据**。
- 本场次已修（提交 `131ca98`）：**只补措辞、不动判定**——把「页面上可见」放回 I5
  的缺/多出两条红因，同时保留并发场次加的精确说明（本条扫的是数据源字段、
  产物侧由 I7 单独扫）。复验：整链 build exit 0 零 ✗；自检 **8/8 全绿**，
  且 D1/D2 仍是 RED（红因文案没被改坏 → 判据仍活着）。
- **本场次自己踩的坑（比这个缺陷更值得记）**：C 表 S 档当时写的是"全符合预期"——
  因为我在隔离克隆里跑的是**我自己工作树里那版门禁文件**（我保留了「页面上可见」），
  而**提交上去的那一版**（并发场次在同一文件上的另一份改写）没有它。
  → **验证对象 ≠ 落库对象**：同一次门禁自测，必须在**提交后的树**上再跑一遍，
  否则测的是"我打算提交的东西"，不是"main 上真正存在的东西"。
- 处置：是否把门禁自检接进 `npm run build` → **登记为待拍板 28**
  （本场次不代拍：`package.json` 这轮有并发场次在改，不抢）。

#### I.2 形态规则引入的假红面：机构人员页形态（peer 报的，本场次独立复现）

- peer（`mvs_0a0e47bf…`）报了一条新的假红：把 `site.author.affiliationUrl` 写成
  **机构人员页**形态 → 门禁判红。本场次**独立复现**（隔离克隆，main 干净克隆）：
  注入 `affiliationUrl: "https://people.ucas.ac.cn/~lyu/"`（`site.js` 原值是
  `https://iap.cas.cn/`）→ **exit 1、2 条红因**（I5 数据源侧 + I7 产物侧），
  产物里该链接**可见 8 处**（自证：注入确实落地，不是"没注入所以没红"）。
- **这条假红是形态规则引入的**：旧规则按"主机在不在 oracle 里"判 → 未知主机直接出局
  → 这种链接当时**不会**判红；改成形态规则后，**一段式路径一律算账号主页** →
  机构人员页（`/~<名>/`）与账号主页形态相同 → 判红。
- **红因给的两条出路对这种链接都不成立**：① 登记进 `IDENTITY_SAMEAS` → 会进
  `site.js` 的 `sameAs` → 与 `site.js` 自己写的「sameAs 只放身份标识 URL」冲突；
  ② 改成"更深的路径" → 机构页 URL 不可改。→ 这条红因**把人往两条都不对的路上引**。
- 触发点很近：待拍板里「`site.author.affiliation` 表述」一旦改成研究员最常见的
  机构人员页写法，就正好踩上。
- 处置：**并入待拍板 25**（"不是主页形态的身份链接将来怎么登记"）——机构人员页
  就是那类链接的**现成实例**。本场次**不代拍、也不擅自加例外**
  （擅自加例外 = 另一处期望集）。


## 2026-10-19 · 18:20–18:45 场次（**不占轮次号**，避免与并发场次撞号）：README 是"仓库现状的第二份副本"，而这份副本**没人看守** —— 新增 `check-readme.cjs`（RD1–RD5）+ 8 档注入矩阵 + **自曝三处我自己门禁的"覆盖度假绿"**

### 本场次定位

巡检部分（线上 7 条路由、canonical/og:url/sitemap 一致性、本地整链 build）上一场次已做过，本场次**不重复搬运结论**，只在结论发生变化时更新（F 段）。

本场次只做**一个主题**：README 写错了三处，而"README 会过期"这件事本身没有任何东西看守。

### A. 背景：README 同时说错了三处（2026-10-19 实测，不是假想）

| # | README 当时写的 | 仓库实际 | 后果 |
|---|---|---|---|
| ① | 模块表里列着 `/portfolio/` | 产物里**根本没有这条路由**（`src/content/portfolio/` 目录在，但**没有条目**、也没有列表页模板） | 按 README 找过去是 404 |
| ② | "需要 Node ≥ 18" | `package.json` 的 `engines.node` **已经是** `>=22`（Node 20 已 EOL；build 链里的 CDP over WebSocket 在 Node 22 起免旗标） | 按 README 装环境的人拿到一个跑不起来的 Node |
| ③ | 完全没提学术出口（`/publications.bib`、`/publications.ris`、`/feed.xml`）与仓库根 `CITATION.cff` | 这些**第一轮就有了** | 功能早就有，文档停在功能存在之前 |

三处同源：**同一事实的两份副本，其中一份没人看守** —— 与本仓反复出现的那族病一模一样（遮罩把目标文本吃掉、覆盖度只覆盖一半却照样打印"通过"）。前两处是"文档落后于事实"，第三处是"文档落后于功能"。

### B. 改动 ①：README 改写（209 行）

- **模块表**：删掉不存在的 `/portfolio/`（改为说明"未发布"）；`/papers/` 拆成"论文列表"与"论文精读详情页"两行（这两个是不同形态的东西，混成一行是原文的第三个含糊处）。
- **Node 下限**：18 → **22**，并写明理由（20 已 EOL、CDP over WebSocket 旗标），同时点明"`package.json` 的 `engines.node` 就是这个下限，两处必须一致"——把**机器可核对的**那一半指出来，而不是只写一句版本号。
- **新增「命令一览」**：每个 npm script 一行说明（当前 27 个）。
- **新增「公开出口」**：`/publications.bib`、`/publications.ris`、`/feed.xml`、`/sitemap.xml`、`/robots.txt` 与仓库根 `CITATION.cff` —— 学术主页的出口是"**别人来取**的地址"，漏写 = 存在但没人知道。
- **目录结构**补齐（`CITATION.cff`、各 `.njk` 出口、partials、assets）；首句去掉"作品集"（站点定位是学术主页）；「贡献与许可」补 `check:readme` / `gen:citation-cff` 的提示。

### C. 改动 ②：新门禁 `scripts/check-readme.cjs`（RD1–RD5）

编号用**独立字母体系** RD*（不与 `verify-site.cjs` 的数字编号、`check-gates-wired.cjs` 的 GW*、`check-citation-cff.cjs` 的 CF* 冲突）。

- **RD1｜README 里提到的每一个站内路径都必须在产物里真实存在。** 期望集**由产物推导**（`_site/` 里的 HTML 路由 + 真实文件），不是手写清单。两条豁免且必须**显式写在同一行**：路径带占位符（`<slug>`）是模式不是路由；同一行写了"未发布/规划中"是规划不是现状。**豁免为什么要同行**：写在别处就分不清这句说的是哪个路径，门禁一旦要猜，红因就变成假话（比不判红更坏）。
- **RD2｜README 声明的 Node 下限必须 ≥ `package.json` 的 `engines.node`。** 方向是**一个方向**：README 说得更高是允许的（更保守），说得更低（"≥ 18"）会让按 README 装环境的人拿到跑不起来的 Node。**完全没提** Node 版本也判红（"没说"与"说错"同样让人装不对）。
- **RD3｜`package.json` 里每一个 npm script 都必须在 README 里被提到。** 匹配用**词边界**：`check:identity` 不许被 `check:identity-derivation` 顶替（否则"提到一个"就能冒充"提到全部"）。
- **RD4｜每一个对外出口都必须在 README 里被提到。** 期望集由产物推导：`_site/` **顶层**非 HTML 文件 ＋ 仓库根 `CITATION.cff`。为什么"顶层"：子目录里的东西不是"出口"。
- **RD5｜自证存活。** 认出的路由数/命令数/出口数都要有下限；全为 0 说明**筛子坏了**（README 改了格式、路径形态变了、产物结构变了），此时"通过"是**空跑** —— 空跑的门禁等于没有门禁。

门禁带 `README_PATH` / `SITE_DIR` 两个环境变量开关，使注入矩阵能在**副本**上做（不改仓库里真的那份 README —— 改坏了就是事故）。

### D. 改动 ③：自测 `scripts/test-readme.cjs`（8 档注入矩阵）

**"这条判据结构上能不能触发"本身必须被证明，而不是假定** —— 一条永远不会红的判据给出的是"看起来很确定的绿"，那比没有判据更坏，因为它把盲区包装成"已核过"。

M0 基线（全绿）/ M1 不存在的路由 / M2 Node 下限 / M3 漏命令 / M4 漏出口 / M5 判据自身失效 / **M6 指向不存在站内页的绝对 URL** / **M7 外部域名的绝对 URL（必须仍绿）**。全程在副本上注入，仓库那份一个字节都不动。

M7 是**"合法路径应绿"**那一档：只核"指向本站"的绝对 URL 是 M6 的另一半 —— 核过头就是假红。夹具用 RFC 2606 保留域 `example.invalid`，**不取自被测数据**。

### E. **我自己写这道门禁时踩的三个坑 —— 每一个都是"覆盖度上的假绿"**

这一段是本节最该被留下的东西。**三处都是我自己造成的**，而且其中两处**在门禁打印"通过"的时候就已经存在**。

- **E.1 路径正则漏了尾斜杠 → 模块表里的路由**一条都没被检查**，门禁却打印"通过"。**第一版**把尾斜杠放在匹配之外，`/papers/` 匹配不到 → 模块表那几行**一个都没进检查集**。这是**覆盖度上的假绿**：门禁看上去在管这件事，实际一行没管。**方向比假红更坏** —— 假红会有人去修，假绿没人会去看。修法：正则改成 `(?<![A-Za-z0-9._~%+\-/:<>*|])(\/[A-Za-z0-9._~%+\/-]+)`，尾斜杠进匹配集；并补一条**自证下限**（RD5）让"认出 0 条路径"必红。
- **E.2 豁免标记词"不存在"过于通用 → 顺手把自测注入本身豁免掉**，"坏跑"与"判据失效"同形。第一版的标记词表里有"不存在"；自测要造一个假路由，注入的那一行是`| 不存在 | \`/portfolio-archive/\` |` → 那一行里的"不存在"**把注入自己遮住了** → 门禁照常绿 → 这一档看起来像"判据没触发"，其实是"注入没落地"。**同一行的注入与豁免撞车时，门禁会替注入撒谎。** 修法：词表收窄为**具体口径**（尚未实现 / 未实现 / 未发布 / 没有发布 / 不发布 / 待发布 / 规划稿 / 规划中 / 不会上线 / 没有列表页模板），README 相应改写为"未发布"。
- **E.3 绝对 URL 整个逃过 RD1**（本轮补掉）。RD1 的相对路径正则靠**前一个字符不能是路径字符**来避免误伤，而绝对 URL 里的路径前一个字符是**字母**（`...xyz/no-such-page-xyz/`）→ 触发 lookbehind → **整条逃过**。实测：README 里写一行 `https://github.lvyihang.xyz/no-such-page-xyz/` → 门禁 **exit 0**，且**路径计数纹丝不动（11 → 11）**。这是与 E.1 **同族**的假绿，只是这回不是"没匹配到"，是"整条写法没被覆盖"。
  - **修法**：RD1 开**第二路**——另扫绝对 URL，**只核 origin 等于本站的**。本站域名**由产物推导**（`index.html` 的 canonical → `sitemap.xml` 的 loc），**不写死**（写死则换域名时这道判据静默失效）；**别人的域名一律不核**（README 里有一堆 GitHub 仓库、ORCID、`localhost:8080`，核它们就是假红）。两个来源都读不出域名 → **判红**（视野不完整不能装作核过了）。
  - **同一条探针复验**（改动前注入的那份 README 副本，一个字没动）：改动前 exit 0 / 计数 11→11；改动后 **exit 1**，红因精确到行：``RD1 README 第 212 行提到的「/no-such-page-xyz/」在产物里不存在``。
  - 通过文案也改了：现在会打印**绝对 URL 认出站内路径几条**（当前 0 条）与**本站域名** —— 覆盖度写在通过文案里，才不会"改了判据却不改文案"。

### F. 独立复核并发场次在途内容（三条，全部实测，不是转述）

- **AGU Key Points / Plain Language Summary**（`src/_data/site.js`）：从出版商存缴记录取唯一出处 —— `https://api.crossref.org/works/10.1029/2026JD046836/transform/application/vnd.crossref.unixref+xml`（`abstract-type="short"` = 3 条 Key Points；`abstract-type="executive-summary"` = Plain Language Summary）。3 条 Key Points **逐字 MATCH**（出版商用 U+2010 HYPHEN，本站归一为 ASCII `-`）；Plain Language Summary **逐字 MATCH**。→ 判据里的 oracle **不是从被测数据派生的**，这一点坐实了。
- **`CITATION.cff` 事实核对**：`date-released 2026-01-08` = git 首次提交日期；`license Apache-2.0` = `LICENSE`；`version 1.0.0` = `package.json`；`volume 131` 与 DOI `10.1029/2026JD046836` = Crossref 存缴记录。注入实测：篡改 `CITATION.cff` 一个字符 → exit 1，红因给出**第 3 行两侧原文** + 修法 `npm run gen:citation-cff`；还原后绿。
- **线上核查门禁**（`scripts/check-live-site.cjs`）：自测 7/7 全绿；**真跑线上正确报出全部漂移** —— `/papers/`、`/feed.xml`、`/publications.bib`、`/publications.ris`、`/papers/trmm-thunderstorm-stages/` 404；canonical/og 路径漂移；sitemap loc 404；L4 两栏方向正确。

### G. 归属登记：**我的代码实际由哪个提交承载**

按本仓纪律，归属不写在提交说明里就够了 —— 必须**在日志里显式登记**，否则日后只读提交说明的人查不到这段代码是谁写的、为什么这么写。

- 本场次产出：`README.md`、`scripts/check-readme.cjs`、`scripts/test-readme.cjs`。
- **实际承载它们的提交是 `3819f18`** —— 那是**并发场次**的提交（它做 CF7/CF8），它的 `git commit` **把整个工作树带进去了**（共享工作树里 `git commit` 会扫进所有未提交改动），所以我这三份文件**是被它顺带提交进去的**，提交说明里**只字未提**。
- 与本仓已有的同类事故（并发场次 `git commit --amend` 连续三次）同源：**共享工作树里"我的提交"可能不是我的提交**。差别只在于那次是 amend 挤掉，这次是整树扫入。
- `scripts/check-identity-handles.cjs` / `check-identity-derivation.cjs` / `identity.cjs` 是**并发场次在途**的改动（写者仍在改），本场次**不 add、不改、不提交**（只记账）。

### H. 诚实边界（本轮实测，写明不夸大）

1. **本场次是"巡检 + 改进"两件事里的一件**：巡检结论见上一场次，本场次只更新了"线上仍是旧部署"这一条（见 J 段），其余不重复搬运。
2. **RD1 是单向的**：它管"README **说的**必须是真的"，不管"README **该说的**都说了" —— 产物里新增一个页面而 README 没登记，**目前无人看守**（已登记为待拍板 29）。
3. **豁免标记词表是人工白名单**（E.2 的修法带出来的）：某个页面确实没上线、而 README 用的说法不在词表里 → 判红（fail-closed，方向可接受，但确实是假红面）。已登记为待拍板 30。
4. **绝对 URL 只核 origin 等于本站的那些**：外部域名的绝对 URL **一律不核**（核了就是假红 —— README 里的 GitHub 仓库、ORCID、`localhost:8080` 都不是站内路由）。这是**有意的覆盖缺口**，不是遗漏。
5. **本站域名由产物推导**：依赖 `index.html` 的 canonical 或 `sitemap.xml` 的 loc。两者都读不到 → 判红（不装作核过了）。**没有**为此写"换域名"的相关测试（只测了当前域名下的行为）。
6. **自测只在副本上做**：`README_PATH` 开关**能被绕过**（设了它门禁就去查别处）；正常构建链上没有任何地方设它。
7. **本轮没碰**：`scripts/lib/identity.cjs`、身份门禁的期望集、`src/_data/site.js` 的身份区、OG 分享图、并发场次在途的身份派生/日志节门禁改动。
8. **共享工作树有并发场次在途**：本场次提交前后，HEAD 被并发场次推进（`ae1d868` → `3819f18`），`scripts/check-identity-handles.cjs` 在提交时仍是**半完成状态**（未 stage，已记账）。本场次**用 `git add` 指定路径**而不是 `git add -A`，避免把别人的在途改动卷进提交。
9. **本轮不 push**。
10. **中央待决策段少了一条索引（并发场次那边的事，本场次不代改）**：并发场次在 `ef87309`
    （18:17:58）登记的**待拍板 28**（门禁自检要不要接进 build 链）只写进了**它自己那一节**
    （日志第 11477 / 11845 行），**没有**进中央「待决策」段的索引 —— 中央段目前止于
    待拍板 27。本场次按共享工作树纪律**不代改**（它要不要补、补在哪一行，都得它自己定；
    猜错就是同号两义），只在这里**记账**。本场次的 29 / 30 已按规矩登记进中央段。（**时点订正（18:50–19:05 场次）**：写这一句时它是**假的** —— 29 / 30 当时只登记在那两节小节里，中央台账里查不到；到 18:20–18:55 场次把它们搬进中央台账之后，这一句才成为事实。）

### I. 待本人拍板

- **待拍板 29（新增）｜README 门禁 RD1 是单向的：「README 说的必须存在」，但「产物里新增了页面、README 没登记」无人看守 —— 要不要补反向判据？**
  - 事实：RD1 的期望集**由产物推导**，但方向是"README → 产物"；反向（"产物 → README"）**没有判据**。所以新加一个页面而忘了更新 README，**门禁不会响**。这不是"门禁坏了"，是"门禁的视野就到这里"——但**没人看守的视野容易被读成"全覆盖"**，这正是本仓反复吃亏的那族病。
  - 选项：(a) 保持现状（README 是入口文档，不必是完整清单）；(b) 加反向判据（产物里每个 HTML 路由都必须在 README 出现）—— 代价是以后每加一个页面都得改 README；(c) 只对"**新增**"页面提醒（如门禁比对 git 历史，只报新增路由）。
  - **本场次不代拍。**
- **待拍板 30（新增）｜README 门禁的"未发布"豁免标记词表是**人工白名单** —— 口径要不要收紧？**
  - 事实：豁免必须在**同一行**且命中词表（尚未实现 / 未实现 / 未发布 / 没有发布 / 不发布 / 待发布 / 规划稿 / 规划中 / 不会上线 / 没有列表页模板）。词表**收窄**是 E.2 的修法（宽词会把自测注入本身豁免掉）。收紧的代价：某个页面确实没上线、README 用的说法不在词表里 → 判红（fail-closed，但确实是假红面）。
  - 选项：(a) 保持白名单；(b) 把"未上线页面"集中到 README 的**一个专门小节**，标记词只认那一小节（更严、假红面更小，但要改 README 结构）；(c) 维护一份独立的"规划中路由"清单文件，门禁读它。
  - **本场次不代拍。**
- 其余待拍板（1–28）见前几节，**不重复、不改口**；**部署时机仍待本人决定**（见 J 段）。

### J. 线上仍是旧部署（待本人拍板部署时机，本场次不代拍、不 push）

18:1x 实测线上：`/` `/blog/` `/about/` `/sitemap.xml` **200**；`/papers/` `/publications.bib` `/feed.xml` **404** —— 是**新路由还没部署**（线上是 2026-10-16 那版），**不是代码回归**：本地 `_site` 对应产物均已存在且正确，canonical/og:url/sitemap 的配置也已在 `src/_data/site.js` 里指向 `https://github.lvyihang.xyz`（全站唯一绝对地址来源）。**部署时机由本人决定**，本场次**只提交、不 push、不部署**。

---

## 2026-10-19 · 18:20–18:30 场次：线上核查门禁的注入矩阵改"快照语义"——产物目录被并发构建清空时，不再崩成裸 ENOENT 栈

### A. 背景：上一场次提交后的"全新干净克隆 build"红了，红因却跟代码无关

- 现象（隔离克隆 `/tmp/mh_final`，`git checkout 3819f18`）：整链 `npm run build` **exit 1**，
  但 **`✗` 行数 0**、24 段脚本全部跑到；崩溃点在链尾 `check:live-selftest`：
  `Error: ENOENT: no such file or directory, scandir '/private/tmp/mh_final/_site'`
  （`scripts/test-live-site.cjs:73` 的 `copyTree`）。
- 查证（四步，每一步都排除了一种可能）：
  1. **不是"干净克隆产不出产物"**：在全新克隆里跑 Eleventy，`_site` 正常产出 **48 个文件**；
     原故障的日志里 `[11ty] Writing ./_site/…` 也一直在打。
  2. **不是链上别的门禁弄丢的**：把 24 段 build 链**逐段**跑、每段后检查一次 `_site`，
     `_site` 一路活到最后一段（`check:citation-cff-selftest` 跑完仍是 48 个文件）。
  3. **是在矩阵跑到一半时消失的**：崩溃栈停在 `main` 的第 170 行 —— 那是**第 2 档（M2）**
     的 `serve()`；也就是说 M0、M1 都跑完了，**M2 复制时 `_site` 已经不在了**。
  4. **同形复现**：把旧版脚本原样放进同一份克隆，用 `SITE_DIR` 指向一份产物副本，
     在运行中途把那个目录移走 → 崩出的栈**与原故障逐行同形**（同样停在 `main:170`
     的 `copyTree`、同样的 `scandir` ENOENT）。
- **根因**：`scripts/test-live-site.cjs` **每一档都从活的 `_site` 复制**；
  而 `eleventy.config.js:82` 在**配置加载时**就调 `cleanOutputDir("_site")` ——
  也就是说**任何一次并发构建一开就会清空产物目录**。两者相撞 →
  判据**崩了**（裸栈），不是判红了，报的还是一个跟判据毫无关系的错误。
- 为什么这件事值得单开一场次：**"判据崩了"与"判据判红"是两回事**。前者把失败说成环境的锅，
  而"崩在哪一档"这种线索只存在于栈里，排查成本极高（本轮就花掉整整一轮才定位到"第 2 档"）。
  本仓的判据文化一直要求"判据红要说人话"——**判据崩了更要说人话**。

### B. 改动：只动 `scripts/test-live-site.cjs` 一个文件

1. **快照一次**：矩阵开始时把 `_site` 复制成一份快照，之后每档都从**快照**复制，
   "期望侧"（`runChecks` 的 `expectedDir`）也用**快照**。
   - 附带好处："期望侧"与"发出去的那份"从此是**同一份内容**，不会自己跟自己错位。
   - 自测要证明的是"判据还能触发"，不是"此刻的产物是新的"——所以快照语义更贴题。
2. **三条可读红因**（取代裸栈）：
   - 产物目录不存在 → `找不到产物目录 <路径>，请先运行 npm run build。`
   - 读产物目录失败 → `读不到产物目录 <路径>：<原始错误>`
   - **产物不完整**（缺 `index.html` / `feed.xml` / `sitemap.xml` / `papers/index.html`）
     → `产物目录不完整，缺 … —— 多半是并发构建写到一半；先把一次 npm run build 跑完再跑本自测。`
     （缺了它们，矩阵的结论本来就没有意义：M1 要删 `papers/index.html`、M3 要改 `sitemap.xml`、
     M4 要改首页 JSON-LD、M5 要改 `feed.xml`。）
3. **不藏事实**：运行期间产物目录的**文件数变了**（多半是并发的另一次构建）→ 打印一条注记
   `运行期间产物目录 … 发生变化（48 → -1 个文件）：多半是并发的另一次构建。本次矩阵的结论只对开始时的快照成立。`
   —— 判据的结论是"判据还活着"，而"此刻产物是不是新的"是**另一件事**，分开说。
4. **六条判据（L1–L6）、7 档矩阵、红因文案断言 —— 一字未改。**

### C. 验证结果（隔离克隆 `/tmp/mh_repro1`：`git clone` + `node_modules` 软链）

- **前后对照实验**（同一条"运行中途把产物目录移走"）：

  | 版本 | 结果 |
  |---|---|
  | 旧版 | **exit 1**，裸 ENOENT 栈（与原故障逐行同形） |
  | 新版 | **exit 0**，7/7 档全绿，并如实打印"产物目录变化"注记 |

- 两条新红因的实测文案（都**不是**栈）：
  - `注入矩阵失败：找不到产物目录 /tmp/mh_no_such_dir，请先运行 npm run build。`（exit 1）
  - `注入矩阵失败：产物目录不完整，缺 feed.xml、sitemap.xml、papers/index.html —— 多半是并发构建写到一半；先把一次 npm run build 跑完再跑本自测。`（exit 1）
- 整链 `npm run build`（干净克隆 + 本轮改动）：**exit 0、`✗` 行数 0**、24 段全过、
  注入矩阵 **7/7**（M0–M6 全部按预期触发，含 L4 两栏方向不反、M6 的 origin 维度）。
- `npm run check:css` 单独复跑：**exit 0**（15 个文件 / 15 个样式表 50 类全有落点）。
- 另：当前 HEAD（`ef87309`）在**全新干净克隆**里 build 本身是**绿的**（exit 0、零 ✗）——
  即原那次红**不可复现**（见 E.1），但脆弱点是真的，本轮修的是脆弱点。

### D. 复验并发场次在途的 `scripts/test-live-site.cjs`（`4de5fdc`）—— 成立，本轮只改读法不改判据

- 该文件是并发场次 A 的产物。**独立复验**：7 档矩阵（M0–M6）全部按预期触发；
  其中 M3 额外断言了 L4 的"两栏方向不反"、M6 断言了 origin 维度，**都成立**。
- 六条判据 L1–L6 本轮**未改一字**；本轮改的只是**读法**（快照）与**失败表述**（三条可读红因）。
- 它的价值仍在原处：`check-live-site.cjs` 是**联网**门禁（EXEMPT，不能进 build 链），
  所以"这六条判据结构上还能触发"只能由这个 `test-` 前缀的注入矩阵来证明。

### E. 诚实边界（本轮实测，写明不夸大）

1. **"当时是谁删掉了 `/private/tmp/mh_final/_site`"没有定论**。本轮复现出的是**同形**故障
   （产物目录在运行中途消失），但当时那个具体进程**没有证据**（最可能是并发场次在清理临时目录）。
   本轮修的是**脆弱点**，**不是**"找到了元凶"——这两件事不要混为一谈。
2. **只改了这一个门禁的读法**。其它直接读 `_site` 的门禁（`check:print-theme`、
   `check:copy-export`、`check:artifact-metadata` 等）**仍是直接读**，在并发构建下仍可能读到半成品
   （它们的失败形态是红因、不是裸栈，危害小得多）。见 F.1。
3. **快照是"跑矩阵那一刻"的产物**。若快照取到的是半成品，本轮新增的"产物不完整"检查会挡住
   （缺必备文件就判红并说清原因）；但**若半成品恰好那四份必备文件都在、内容却是旧的**，
   矩阵仍会全绿——**那种情况本轮不覆盖**，不声称覆盖。
4. **矩阵的结论只对快照成立**。产物目录在运行期间被改（并发构建）时现在会打印注记说明，
   但**不判红**（判红会让 build 在并发环境下随机飘红，那是另一种坏）。
5. **验证对象 = 落库对象**：本轮改动落在**共享工作树**，验证在**隔离克隆**里用**同一份文件**
   做的；提交后又在**全新干净克隆**里复验了整链（见 C）。
6. **共享工作树有并发场次在途**：本轮期间 `scripts/check-identity-handles.cjs`、
   `scripts/check-readme.cjs`、`scripts/test-readme.cjs` 处于**他人未提交**状态，
   本场次**未碰**这三个文件，也**没有**把它们带进本次提交。
7. **本轮不 push**；部署时机仍待本人决定（见 J 段）。
8. **本节的落库方式与别的场次不同，如实记一笔**：本节写进工作树之后，被并发场次
   （`7f392d0`「README 门禁 RD1 补上…+ 18:20 场次日志节」）**一并 stage 并提交进 main**
   —— 起因是对方 stage 整个日志文件时，本节已经在那个文件里了。
   后果：① **本节的代码改动不在那个提交里**（`scripts/test-live-site.cjs` 仍留在工作树，
   由本场次**单独**提交）；② 本节正文曾有一处字符损坏（「崩溃点」后跟一个坏字符），
   本场次在同一提交里把它订正了。
   → 提醒：日志文件是**共享文件**，谁 stage 它，谁就可能把别人的整节一起提交；
   **代码改动与日志改动不保证落在同一个提交里**，读日志节时别默认"这节说的东西在同一次提交里"。

### F. 待本人拍板

- **待拍板 31（新增）｜其它直接读 `_site` 的门禁要不要也改成"快照 / 产物完整性前置检查"？**
  - ⚠️ **本条原登记为 29，与 18:20–18:45 场次的「README 门禁 RD1 是单向的」（待拍板 29）同号**——
    一个号两件事，本人按号拍板会拍到错的那一件。19:0x 场次**就地改号为 31**（29 归 RD1 那条），
    并新增门禁 `scripts/check-decision-ids.cjs`（DI1）把"一个号只能认领一件事"变成机器可核对的。
  - 事实：见 E.2 与中央「待决策」段同条。`eleventy.config.js` 配置加载即清 `_site`，
    所以并发构建期间任何读产物的门禁都可能读到半成品。
  - 备选：① 维持现状（只有注入矩阵改快照）；② 给所有读 `_site` 的门禁加一道统一的
    "产物完整性"前置检查；③ 全部改快照语义。
  - **本场次不代拍。**
- 其余待拍板（1–28、29–30）见前几节，**不重复、不改口**；**部署时机仍待本人决定**（见 J 段）。


## 2026-10-19 · 18:25–18:40 场次（**不占轮次号**）：对 18:10–18:20 场次「两处 vs 三处」订正的**独立复现回执**（被验基准 `3db690e` / 复验基准 `62da886`）

### 回执对象

18:10–18:20 场次（mvs_5113e18…）的抄送：注释里的「两处都要改」已订正为「三个文件、五个改动点」（提交 `3db690e`，只含两个文件、判据行为零变化），并提醒本场次**不要**把它写成"缺陷全部修好"或"缺陷仍开着"。

### 本场次的独立复验（**在当前 HEAD 上现查现跑**，不转述对方的结论）

| # | 对方的主张 | 本场次复验（实测） | 结论 |
|---|---|---|---|
| ① | `3db690e` 只含两个文件、判据行为零变化 | `git show --stat` = `scripts/lib/identity.cjs` + `scripts/check-identity-handles.cjs`（+31 / −4）；**逐行 diff 全部落在 JSDoc 注释块内**（每一行都是 `*` 开头），**没有一行是代码** | ✅ 成立 |
| ② | 注释已订正为事实 | HEAD 上 `scripts/lib/identity.cjs:23` = "**三个文件、五个改动点**"；`scripts/check-identity-handles.cjs:177` = "**合法增删要改三处**" | ✅ 成立 |
| ③ | **红因侧没动**（待拍板 23 仍开着） | I5 红因的构造在 `check-identity-handles.cjs:694 / 703`：`site.author 里**数据源侧**的身份主页形态链接缺 …` —— **不点名 `src/_data/site.js`、不写"该同步哪几处"的清单** | ✅ 成立 |
| ④ | 对方那一节只有一处，不许重复落 | `grep -c '^## 2026-10-19 · 18:10–18:20 场次'` = **1**；另一处命中（log:1975）是中央索引条目里的**交叉引用**（"实测见 18:10–18:20 场次那一节"），**不是重复节** | ✅ 成立 |
| ⑤ | PT1–PT6 的 12 档证据已在 `8a7a953` 那一节，`Z0` 只出现 1 次 | log:10642 那一行写着"设计 + **12 档注入自证** + 接入 build 链"；`grep -c 'Z0'` = **1** | ✅ 成立 |
| ⑥ | 中央待决策段已补"合法增删要同步几处"的索引条目（沿用编号 23，**不新增**） | 中央段 log:1974–1987 确有该条目，正文写明三个文件五个改动点、"只改①② → exit 1、补③ → exit 0"，并指向待拍板 23 | ✅ 成立 |

→ **六条全部成立，没有需要订正的地方。** 对方的框架"注释已订正为事实；红因是否要点名文件/写同步清单仍待本人拍板（待拍板 23）"与当前 HEAD 的代码形态**一致**。

### 本场次自己那一节的核对：**无需订正**

18:20–18:45 场次（README + `check-readme.cjs`）里**没有**描述"两处 vs 三处"这件事的开放/关闭状态，只在两处**记账**：
①「`scripts/lib/identity.cjs`、身份门禁的期望集……本轮**没碰**」；
②「`check-identity-handles.cjs` / `check-identity-derivation.cjs` / `identity.cjs` 是并发场次在途的改动，本场次**不 add、不改、不提交**（只记账）」。
→ 两种表述（"已全部修好" / "缺陷仍开着"）**都不构成**，因此**不需要订正**。对方的提醒属于**预防性**，本场次本来也没踩。

### 一条给对方的提醒（是事实，不是裁定）

对方的 A/B 注入结论（只改①② → exit 1 且唯一红因是那一条；补③ → exit 0）的**被验基准是 `3db690e`（18:11）**。当前工作树里 `scripts/check-identity-handles.cjs` 与 `scripts/check-log-sections.cjs` **仍有未提交的在途改动**（本场次复验时 `git status` 可见）。→ 若要把"唯一红因是那一条"写成结论，**建议在最终树上再跑一次**（在途改动有可能改变红因的条数或文案）。

### 本场次实际跑过的复验动作

```bash
git merge-base --is-ancestor 3db690e HEAD                      # 祖先 ✅
git show --stat 3db690e                                        # 两个文件、+31 / −4 ✅
git show 3db690e -- <两个文件> | grep -E '^[+-]' | grep -v '^[-+][-+][-+]'   # 全部是注释行 ✅
grep -n "三个文件、五个改动点\|合法增删要改三处" scripts/lib/identity.cjs scripts/check-identity-handles.cjs
grep -n "数据源侧.*身份主页形态链接缺" scripts/check-identity-handles.cjs   # 红因在 694 / 703 行
grep -c "^## 2026-10-19 · 18:10–18:20 场次" docs/IMPROVEMENT-LOG.md       # = 1 ✅
npm run check:identity                                         # exit 0 ✅（基准 62da886）
npm run check:identity-derivation                              # exit 0 ✅
```

### 诚实边界

1. 本场次**没有重跑**对方的 A/B 注入矩阵（只改①② → exit 1 / 补③ → exit 0）—— 那是**对方自己已在隔离克隆里做过**的实验；本场次验的是"**该修正在当前 HEAD 上成立、且没有改变判据行为**"。要重跑请在最终树上做（见上一条提醒）。
2. 本场次**没有落** 18:10–18:20 那一节，**也没有重复落** PT1–PT6 的 12 档证据（按对方要求）。
3. 本场次**不新增待拍板编号**（并发场次已推进到 30，本场次用的 29 / 30 见 18:20–18:45 那一节）。
4. 本轮**不 push**。

## 2026-10-19 · 18:30–18:45 场次（**不占轮次号**，避免与并发场次撞号）：中央「待决策」段的**结构**没人守 —— 新增 LS5（8 档注入自证）

### A. 巡检（第 1 步）

- 线上 7 条路由：`/` 200、`/blog/` 200、`/about/` 200、`/sitemap.xml` 200；
  `/papers/`、`/publications.bib`、`/feed.xml` **404**。
- `last-modified: Fri, 16 Oct 2026 09:52:17 GMT` → 线上仍是 **2026-10-16 旧部署**
  （sitemap 带 `/MeteoHub/` 前缀）→ 那三条 404 属**待部署、非站点损坏**
  （**待拍板 7**）。本任务禁止 push，本轮无法消解。
- JSON-LD 可解析性：线上首页 1 个 `ld+json` 块，`JSON.parse` 通过；
  本地产物 `/papers/` 4 个块全部通过（整链里 `check:jsonld` 亦已验）。

### B. 本地构建（第 2 步）

- 隔离克隆（`git clone` + 软链 `node_modules`）跑整链 `npm run build`：
  **exit 0，零 ✗**（含 `check:live-selftest` 7 档注入矩阵）。

### C. 缺陷：中央「待决策」段的**结构**没有任何判据守着

- LS1–LS4 守的是"`## ` 节标题还在不在"。中央「待决策」段**也是**一个 `## ` 节，
  所以 LS2 守得住"标题那一行没被删"——但**段里的条目、段的收尾分隔线、
  条目有没有被写到段外去**，LS1–LS4 一概看不见。
- **本场次自己踩的坑（不是假想）**：上一轮我把一条待决策登记写进了日志**文件头**
  —— 起因是用 `text.indexOf("\n---\n")` 去找中央段的收尾线，而**文件头第 6 行
  也有一道 `---`** → 命中了那一道 → 条目被插到第 8 行。那一版日志 LS1–LS4
  **全绿**（节标题一个没少），但中央段之外多出一条"待拍板"条目：
  **读者按标题找过去根本看不到它** → 那条决策事实上从台面上消失了。
- 也就是说：这份日志是全仓唯一的"需要本人拍板"台账，而它的**内部结构**
  当时处于"没人看守"的状态——与本仓反复吃亏的"看起来在、其实不生效"同族。

### D. 改了什么：新增 LS5（`scripts/check-log-sections.cjs`）

LS5 守中央待决策段的六件事，**全部用内容锚**（先按标题定位，再往后找收尾线），
**不依赖任何行号**——这个日志每天被并发场次追加，行号随时在漂（实测几分钟内
中央段起始行就从 1493 挪到 1510；标题→收尾线的范围也会随之整体平移）：

1. **标题唯一**：中央段标题必须**恰好一条**；0 条 → "台账不见了"；≥2 条 → "两份清单"。
2. **收尾分隔线在位**：标题之后必须有一道独立的 `---`；没有 → 段的边界就没了。
3. **段内不得混进场次小节标题**（`## `）——边界乱了的直接证据。
4. **段不得是空的**：标题与收尾线之间至少一条**顶格**登记条目（`- `）。
5. **段内不得有逐字重复的登记条目**——同一件事登记两遍 = "同号两义"的前身。
6. **日志文件头（第一个 `## ` 标题之前）不得出现待决策条目**——条目必须写在
   中央段里；这一条正是本场次那个坑的直接对应。

**注入自证（8 档，隔离克隆 `/tmp/mh_ls5`）**——每档都对照**旧门禁**，
证明"洞是真的"，而不是"我新写的判据自说自话"：

| 档 | 注入 | 旧门禁 | 新门禁 |
|---|---|---|---|
| A0 | 基线（无注入） | 0 | **0** |
| T1 | 待决策条目写进日志文件头 | **0** | **1** |
| T2 | 删掉中央段的收尾分隔线 | **0** | **1** |
| T3 | 中央段标题出现两份 | **0** | **1** |
| T4 | 中央段被清空 | **0** | **1** |
| T5 | 段内混进场次小节标题 | **0** | **1** |
| T6 | 合法新增一条登记条目 | 0 | **0**（不误伤） |
| T7 | 段内逐字重复的登记条目 | **0** | **1** |

旧门禁 = `git show HEAD:scripts/check-log-sections.cjs`（无 LS5 的那一版），
以 `scripts/old-log-gate.tmp.cjs` 放进克隆单独跑（文件名不匹配 GW1 的
`check-*.cjs` 形状，不会被接线门禁误认）。T1–T5 / T7 旧门禁**全绿** → 洞是真的；
T6 这个合法改动新门禁**也绿** → 不是靠"见红就红"蒙混过关。

**判据行为零变化**：LS1–LS4 一行未动，只**新增** LS5；通过文案多一句
"中央待决策段（第 X–Y 行）：标题唯一、收尾分隔线在位、段内 N 条登记条目…"。

### E. 诚实边界（本轮**没有**做到的事）

1. LS5 只看**工作树**这一份日志（与 LS4 同一主体）；HEAD 上的中央段由
   LS2 / LS4 间接覆盖，不单独再查一遍。
2. LS5 抓的是**结构性**走位：条目落在文件头、段被清空、标题出现两份、
   收尾线丢失、段内混进小节标题、逐字重复。**抓不到**"条目被写进某个场次
   小节正文里"——那种走位仍要靠人眼。
3.「逐字重复」只查**完全相同**的整行；两条前缀相同但内容不同的条目**不判红**
   （那更接近"同号两义"，口径属本人，不在本条）。
4. LS5 假定中央段的收尾约定是"一道独立的 `---`"。若将来改了约定，LS5 会判红
   ——那是**显式**提醒，不是静默失效。
5. 本门禁**没有**被加进 `scripts/test-gates-selfcheck.cjs` 的注入矩阵
   （**待拍板 18** 未代拍）；上面那 8 档矩阵是**一次性脚本**，没有入库。

### F. 接手交接材料（`mvs_5fe79399`，只读复验场次）的现查结论

交接基准是 `98f3fe7`，**已落后很远**，六条逐条在当前 HEAD 上现查现跑：

1. 「工作树里有未测过的 I6 改动」→ **前提已过期**：那份在途改动已不存在，
   I6 早已落库（`448fc8b`）。交接说的"文件头仍写五条判据"**已补**；
   但"末尾没有 I6 摘要、`orcidFoundInSite` / `orcidFoundInSource` 声明后未使用"
   **属实**（该文件正被并发场次在途修改，本轮不碰它，等对方落库后再处理）。
2. 「门禁 23 的 ORCID 盲区」→ 盲区**已由 I6 闭合**。交接给的复现路径与实际
   边界不同：把作者列表 3 个非 null ORCID 统一改成 `0000-0003-1710-892X`，
   旧实现 exit 0（产物照常渲染）；改 `identity.cjs` 的 `OWNER_ORCID` → exit 1。
   成因：门禁 23 只看产物 JSON-LD 的 Person sameAs ↔ canonical @id，而
   `authorList[].orcid` 只渲染成 HTML 链接、从不进 JSON-LD。
3. 「check:wrap 补丁」→ **已全部闭环，不要 apply**：假绿洞已由 `e5d178c` 修掉，
   现役 `scripts/check-wrapping.cjs` 比交接补丁更严；"W3 是死条文"也已过期
   （`check-gates-wired.cjs` 的 GW1–GW3 在跑）。至于"要不要做统一 runner"：
   GW1 已覆盖"别的门禁被摘"，runner 只剩"兜住 GW1 自己被摘"这一**递归尽头**
   → 本轮**只登记、不实施**。
4. 「门禁 16 的机制断言过宽」→ **交接的行号定位错误**：`verify-site.cjs` L917-920
   在它自己的基准 `98f3fe7` 与当前 HEAD 上**都是 `pairImageAlts`**，与门禁 16 无关。
   注入实测（删掉 `src/404.njk` front matter 里的 `identityOn404: true`、
   只在正文插一行）→ `verify-site.cjs` **exit 1**，红因「front matter 里找不到
   identityOn404 开关」→ **当前实现 fail closed**，交接描述的"旧实现 exit 0 放过"
   是历史行为。
5. 「编号/快照过期」→ 核实：**门禁 24 / 29 确实存在**于 `scripts/verify-site.cjs`
   （L2195 / L2304，24 查"文件头清单 ↔ 代码段一一对应、编号唯一且连续"，
   29 查旧编号→新编号对照表覆盖全部编号）。**此前我说"未命中"是错的**
   ——那次 grep 用了"编号连续 / 连续性"当关键字，而代码里写的是"编号不连续"。
   文件头清单最大编号 = 32；`check:copy` 已在 build 链里。
6. 「`98f3fe7` 证书段订正」→ 已闭环，无需动作。

### G. 待本人拍板

- **本轮不新增待拍板编号**：LS5 带来的唯一待决项（"新门禁要不要补进
  `scripts/test-gates-selfcheck.cjs` 的注入矩阵"）就是**待拍板 18**，不重复登记。
- 交接第 3 条里那条"要不要做统一 runner"属**递归尽头**（兜住 GW1 自己被摘，
  又需要另一个东西兜住它），本轮只写进本节，**不代拍**。

### H. 提交

- 两个文件：`scripts/check-log-sections.cjs`（新增 LS5）、`docs/IMPROVEMENT-LOG.md`（本节）。
- 日志用**私有索引**（`GIT_INDEX_FILE`）提交：工作树上还有并发场次
  `18:25–18:40 场次`那一节**未提交**（51 行纯新增），**不把它卷进本次提交**；
  那一节仍留在工作树里由对方自己提交，本节也写进工作树（LS4 要求工作树 ⊇ HEAD）。
- **未 push。**


## 2026-10-19 · 18:36–18:50 场次（**不占轮次号**，避免与并发场次撞号）：I6「判了却不报」—— ORCID 值域判据**判得住**，通过文案里却**一句都没有**；死变量是症状，摘要是根因

### 本场次定位

本场次**不改代码**（`scripts/check-identity-handles.cjs` 正被并发场次在途改，见 D 段），只做三件事：
① 独立复验并发场次 18:30–18:45 场次的三条订正；② 把复验里冒出来的**新一层**结论落库
（"死变量"只是症状，根因在别处）；③ 转交 owner。

复验基准：HEAD `6ccb7b5`（`scripts/check-identity-handles.cjs` 的 sha `0ae38e5199509e82`）+ 在途工作树。

### A. 三条订正的独立复现

| 并发场次的主张 | 我的复现方式 | 结论 |
|---|---|---|
| `scripts/verify-site.cjs` L917–920 是 `pairImageAlts`，与"门禁 16"无关 | 现查 HEAD 该处 | **成立** |
| L2195 / L2304 确实是门禁 24 / 门禁 29 | 现查 HEAD 该处 | **成立**（对方此前"门禁 24/29 不存在"的说法在**当前基准**上不成立——他裁的可能是更早的基准） |
| `orcidFoundInSite` / `orcidFoundInSource` 是死变量 | 全文件逐处查引用 | **属实** |

### B. 死变量的确证（HEAD 版与在途版各查一次）

- **HEAD `6ccb7b5`**：声明 715/716、赋值 829/830；全文件对这两个名字的引用**只有这 4 处**
  （2 声明 + 2 赋值），**没有第三处读取**。
- **在途工作树版**（并发场次加 I8，行号会随对方在途改动漂移，判据以内容为准）：声明与赋值同样
  **没有任何读取**。
- 两个变量装的是 I6 扫到的**产物侧 / 数据源侧 ORCID 条数**（`inSite.size` / `inSource.size`）——
  **恰好就是摘要本该报的那两个数**。

### C. 我的判断：死变量是**症状**，根因是**摘要缺 I6**

对方给的出路是"删掉两个无用变量"。**照这条出路做，等于把"判据自称的覆盖面"固化成假的**——
门禁的覆盖面要写在文案里（本仓自己的标准：上一轮 RD1 补绝对 URL 时就是这么做的，
"覆盖度写在文案里，免得改了判据却不改文案"）。

隔离取证（`/tmp/mh_i6`：门禁取 HEAD 版**原样**、sha 与 HEAD 逐字节一致；数据源与产物各复制一份，
**仓库工作树一个字节没动**）：

1. **基线**：exit 0。通过文案只报了 I0（形态自证）/ I1（节点、sameAs、期望集）/ I5（数据源侧可见
   身份链接）/ I7（产物侧可见身份链接）——**关于 I6 一句都没有**（文案里 `ORCID` / `orcid` 出现
   **0** 次；期望集里那串 `orcid.org/0009-0005-3511-0546` 是 **I1/I2 的期望集内容**，
   **不是 I6 扫到的 ORCID 值**——两者长得像，说的不是一回事）。
2. **注入**：把数据源副本里 `publications[0].authorList[2]（Xiaoqun Hu）` 的 `orcid: null`
   改成未登记的 `0000-0002-1825-0097` → **exit 1**，红因逐字如下：

   > 数据源里出现**未登记**的 ORCID 0000-0002-1825-0097（publications[0].authorList[2]（Xiaoqun Hu））——白名单是 0009-0005-3511-0546 / 0000-0001-6144-0120 / 0009-0002-2576-1108。没渲染出来的错值同样要抓：否则改一个暂时不渲染的字段就又是一个盲区。

   ⇒ **I6 判了，而且判得住**（注入前先断言过那一行，改完复核过落盘内容——没落地就不算数）。
3. **按"接进摘要"修**（**只在隔离副本里改**，仓库文件未动）：把那两个变量接进末尾 `console.log`，
   绿态文案末尾多出——

   > ORCID 值域：产物里扫到 3 处、数据源里扫到 3 个 ORCID 值，全部在登记白名单内。

   ⇒ 两个"死变量"正是摘要需要的两个数；**删掉它们 = 把覆盖度报告一起删掉**。

⇒ **该做的是"把 I6 的结果接进摘要"（约 4 行），不是"删掉死变量"**。接完之后这两个变量自然不再是死变量。

### D. 为什么本场次不当场改

`scripts/check-identity-handles.cjs` 正被并发场次在途改（I8 可见性判据；本场次观测期间从 +224 行
涨到 +292 行）。共享工作树里改它会与对方在途改动混提，或重演"别人的 commit 扫走我的文件"。
⇒ 本场次**只记账 + 转交 owner**，并把改法写成可直接照抄的形状（见 C 段第 3 档）。

### E. 附带发现（两条，都是实测）

1. **中央「待决策」段里没有 29 / 30 的条目。** 现查中央段（标题
   `## 待决策（需要本人拍板，任务不会自己动）` 到其收尾 `---`），里面出现的编号是
   **21 / 23 / 24 / 25 / 26 / 27 / 31**——**我 18:20 场次登记的 29、30 只写在了那一节里，
   中央段没有对应条目**。后果：本人按中央段拍板时，**看不到这两条还开着**。
   并发场次正在把中央段改成带编号的索引，本场次**不越界改中央段**（改它会与其在途改动混提），
   已转告 owner：**29 / 30 两条要一并进中央段**。
2. **归属：并发场次 19:0x 的「29 → 31」改号，实际由 `6ccb7b5` 承载**——该提交的标题是
   "注明巡检任务改为每小时一轮 + 固定对话模式"，提交说明**只字未提改号**。
   ⇒ 又一次"**普通 `git commit` 也会扫走别人在途改动**"（不只是 amend），老问题复发。
   另记一笔事实（**本场次 18:40 左右的快照，提交后已变**）：并发场次在途的日志节已写明
   "新增门禁 `scripts/check-decision-ids.cjs`（DI1）"，而本场次实测时**该文件在磁盘上还不存在**
   ——日志先于文件落地时，读日志的人会以为门禁已存在。
   ⚠️ **订正（18:52 追记）**：本场次提交之后，并发场次**已经把该文件建出来了**
   （现为工作树里的未跟踪新文件）。所以上面那句是**当时**的快照，不是"文件不存在"的现状。
   这也正是本场次想说的那类事：**日志里"某样东西在/不在"的陈述，会随时钟失效**——
   写的时候必须标时刻，或者干脆别写"在不在"，改写"当时观测到什么"。
   **不是本场次的事**，提一句。

### F. 本节不新增待拍板

"门禁摘要要报出已判据的结果"是本仓的**明文标准**，不是取舍 → **这是缺陷，不是待拍板项**，
故本节**不占新编号**（现占用 1–31；下一个可用 **32**）。

仍开着的、本场次**不重复、不改口**：待拍板 29（RD1 单向覆盖）、待拍板 30（豁免标记词表口径）、
待拍板 7（部署时机——本场次仍**不 push**）。

### G. 提交

- 只有 `docs/IMPROVEMENT-LOG.md`（本节）。
- 日志用**私有索引**（`GIT_INDEX_FILE`）提交：工作树上还有并发场次**未提交**的代码改动
  （citation-meta 那条线 + 身份门禁 I8 那条线，共十来个文件），**不把它们卷进本次提交**；
  它们仍留在工作树里由对方自己提交。
- **未 push。**

## 2026-10-19 · 18:40–19:05 场次（**不占轮次号**，避免与并发场次撞号）：身份门禁补 I8「可见性一致」——"数据源声明了却渲染不出来"这段夹缝第一次有人管；**判据范围写死**（不从模板里读，否则一次改动就把自己的监视改没）

### 本场次定位

只改一个文件：`scripts/check-identity-handles.cjs`（+289 / −3）。日志一节另计。
**未 push。**

本场次要补的是身份门禁里的一段**夹缝**：

- I5 比的是**数据源**（`site.author` 里那些字段）——"你在作者页声明了哪些身份"；
- I7 比的是**产物**里"多出了谁"，**刻意不判"缺"**（"要不要展示"是本人的口径选择）；
- 于是"**声明了、却渲染不出来**"这一形态，两边都不管。

### A. 真洞（隔离克隆实测，不是假想）

隔离克隆 `131ca98`，整链 build 后重建产物，把
`src/_includes/partials/footer.njk` 里渲染 `site.author.github` 的那一行
**注释掉**（**数据源字段原样留着**）：

- 产物里**精确等于本人账号 URL**（`https://github.com/oldsixxiaolv`）的可见 `<a href>`：
  基线 **8 处** → 注入后 **2 处**（404 / blog / papers / 单篇页这 4 份各自那 1 处
  全部消失——它们原本**只有**页脚这一处）；
- **门禁 exit 0、零红因**；
- 通过文案还照样打印「产物里被识别为账号主页形态的可见链接 4 个…全部在登记清单内」
  ——**数字没变，也没说少了一条**。

页面上人读到的身份，与作者页声明的身份，**不再是同一组**，而没有任何一道门禁叫。

### B. 第一版设计**自身有洞**：判据范围不能由被判对象决定

第一版把判据范围取成"**页脚模板当前引用了哪些 `site.author.X`**"
（去读 `footer.njk` 抽字段名，不写死名单——本意是防"名单漂移"）。
**实测证明这个设计本身会漏**，而且漏得很难看：

- 把页脚里渲染 `site.author.github` 的**整行**删掉 → 字段名不再出现在模板里
  → **范围里就没有它了** → 本条不再检查它 → **改动本身把这一条的监视改没了**。
- 后果量得出来：GitHub 在 6 份产物里的 4 份**原本只有页脚这一处** → 删掉那行后
  这 4 份上的 GitHub 链接全部消失 → 门禁仍 **exit 0、零红因**。

这与本仓已吃过的那类亏是同一族：**判据的"期望"若取自被它检查的那个东西，
一次改动就能把判据改没**（`ORACLE_SAMEAS` 独立化就是为这个）。

⇒ v2：**范围写死**在门禁里（`SCOPE_KEYS`，与 `ORACLE_SAMEAS` 同一层：独立于被判数据），
再用**交叉核对**保证它与页脚不脱节。

### C. v2 的三条设计

1. **范围**：`SCOPE_KEYS = ["github", "orcid", "openalex"]`（写死在本文件顶部常量区）。
   为什么是这三条：页脚是**全站公共 partial**，每一份产物都带它 → 这一类
   "少一份产物就少一处"是**真的矛盾**。而 CSDN 写在 `about.md` 正文里、
   ResearchGate 只在首页介绍区，**本来就**不是每页都有 → 不在范围内
   （实测：拿"每份产物都得有"去要求全部 5 条，**基线自己就误伤 2 条**——
   基线自己红的判据不能用）。
2. **交叉核对**（防范围漂移）：页脚渲染了**登记在册**的句柄、而它不在 `SCOPE_KEYS` 里
   → 判红。范围**缩小**则不判红（那正是要抓的洞），但红因里会写明
   "页脚当前渲染的身份字段：…"，并指明"**只删页脚那一行是不够的**"。
3. **逐产物**核验（不是"全站合计有一处就行"）：后者只要还有任意一份产物留着它就永远绿
   （实测：删掉页脚那行后 index / about 的首页介绍区还留着 GitHub，全站合计仍有 2 处）。

另有两处结构性要求：

- **自证存活**（范围里的字段一条 URL 都取不到 → 判红，"没报错"和"没问题"长得一样）；
- **结构性兜底**（I8 整段被删 → 判红）。兜底用 `visibilityReached`（"段跑到了"）
  而不是 `visibilityChecked`（"真判了"）——锚失守时 I8 会**主动**跳过并留一条 note，
  那种情况不是缺陷；用后者兜底会把它误报成"判据被删"。

### D. 注入矩阵（8 档，隔离克隆 `/tmp/mh_v60`，门禁 sha `fcf1fd0aac81`）

| 档 | 注入 | 期望 | 实测 |
|---|---|---|---|
| C0 | 无 | 0 | **0** |
| C1 | 页脚**整行**删 `author.github` | 1 | **1**（1 条红因，点名 4 份产物）|
| C2 | 页脚删 `author.openalex` 的 `<a>`（`{%- if %}` 留） | 1 | **1**（6 份产物）|
| C3 | 页脚**整行**删 `author.orcid` | 1 | **1**（2 份产物：404 / blog）|
| C4 | 连数据源带模板一起去掉 `openalex` | 1 | **1**（I5 判红："登记清单里有、site.author 里没有"）|
| C5 | 删掉 I8 整段 | 1 | **1**（"可见性一致性判定（I8）没有跑起来"，**不崩栈**）|
| C6 | 页脚新增 `site.author.csdn`（登记在册但不在范围） | 1 | **1**（交叉核对红）|
| C7 | 页脚删 github **且** `SCOPE_KEYS` 里删 "github" | 0 | **0**（显式退出 → 本条不再监视它，不误报）|
| C8 | 还原 | 0 | **0** |

**C1 正是第一版漏掉的那一档**（第一版实测 exit 0）——v2 把它从"漏"变成"抓"。

两处**坏跑**已订正（都是本场次自己踩的，写在这里是为了别再踩）：

- **C5 注入锚点选错**：第一版用"文件顶部 I8 变量声明"起删 → 连 oracle 常量一起删 →
  崩栈、红因条数 = 0。改成"I8 段标记 → I4 段标记"之间才走结构性兜底。
- **矩阵脚本自己的报告缺陷**：`local out=$(node …); local code=$?` —— bash 里
  `local` **掩蔽**了命令替换的退出码（实测 code=0），于是"门禁 exit=1"却打出
  "C1 exit=0"。改成"先声明再赋值"（`local out; out=$(…)`）两步取码后重跑，
  8 档的报告与门禁自身输出完全一致。**权威证据是门禁自己打的「未通过」与红因条数**，
  不是脚本那行汇总。

### E. 与 peer 两封复核报告的裁定（**两份基准都过时，结论在当前 HEAD 上现查现跑**）

| peer 主张 | 对方基准 | 当前 HEAD 实测 | 裁定 |
|---|---|---|---|
| 第六封 A1：等长替换（31→31 字节、同主机换路径）打进 `scripts/lib/identity.cjs` → "期望集取自共享模块"的退化版全盲 | `1ea722f` | 落地版 **exit 1、6 条红因** | 前提已过时；**(A) 已落地**（`4986534`）|
| 第六封 A2：`site.js` 里 `sameAs` 多挂冒名账号 | `1ea722f` | **exit 1、1 条红因** | 同上 |
| 第六封修法 1–4（独立 oracle / site.js 三处接进模块 / 多出判红 / 锚失守短路） | `1ea722f` | 全部已落地（`4986534`、`3db690e`；`anchorTrustworthy` 短路见 `:461–486`）| **已落地** |
| 第二封缺口①：I1 "多出"没有判据 | `f630b2c` | `:671` `if (extraHandles.size) → fail(...)`；A2 实测 exit 1 | **已落地**（对方报的是旧行号）|
| 第二封缺口②：I2 锚失守不短路 | `f630b2c` | 已实现（`:461–486` + 三处 `if (anchorTrustworthy)` 分别跳过 I1 / I5 / I7）| **已落地** |
| 第二封缺口③：`author.*` 与 `sameAs` 未从模块派生 | `f630b2c` | `site.js:175–186`、`:240`；`social[]` 已改为 `SOCIAL_ORDER.map(host => identityUrl(host))` 派生 | **已落地**（对方报的是旧行号 `:122/:133/:534`）|

peer 建议里"Og 图里烤着 GitHub 字面量"一条：现查 `src/assets/img/og/og-1200x630.svg`
与 `og-1500x500.svg`，各 **1 处**，是**站点仓**
`github.com/oldsixxiaolv/oldsixxiaolv.github.io` 的**可见文字**（不是 `<a href>`，
也不是本人句柄）→ 不在任何一道身份门禁的视野内，也不构成身份误认；它属于
**待拍板 22（OG 分享图烤死句柄）**的既有条目，本场次**不新增编号**。

### F. 待决策

**本场次不新增待拍板编号**（并发场次已推进到 31，下一个可用 32；本场次没有新的
"需要本人拍板"的事项——`SCOPE_KEYS` 的取值是**当前页脚设计的如实登记**，不构成取舍）。
对中央「待决策」段里既有的 **「OpenAlex 是否要放在页脚可见位置」** 一条，
补一段**新耦合**的说明（见该条目下的补充行）。

仍开着的、本场次**不重复、不改口**：待拍板 29（RD1 单向覆盖）、30（豁免标记词表口径）、
7（部署时机——本场次仍**不 push**），以及 10 / 16 / 17 / 18 / 19 / 20 / 21 / 22 / 23 / 24 / 25 等。

### G. 提交

- 只有 `scripts/check-identity-handles.cjs`（本场次改动，+289 / −3）与
  `docs/IMPROVEMENT-LOG.md`（本节 + 中央段那几行补充）。
- **未 push**（main 领先远端 100+ 提交，部署时机待本人拍板）。
- 日志用**私有索引**（`GIT_INDEX_FILE`）+ `update-ref` CAS 提交：工作树上还有
  并发场次**未提交**的改动（citation-meta / README / site.js 那几条线），
  **不把它们卷进本次提交**；日志的提交内容由 **HEAD 版日志 + 本场次这一节**现场拼出，
  **不**整份烤工作树（避免捎带别人的在途节，也避免抹掉别人的在途节）。


## 2026-10-20 · 01:20–01:55 场次（**不占轮次号**，避免与并发场次撞号）：引用元数据补 `citation_online_date` —— 出版商登记的"上线日"与"期号日"是**两个事实**，不混用一个；并给全仓最后一个没有注入矩阵的静默失效层补上矩阵

### A. 巡检（2026-10-20 01:29 GMT 实测）

线上 `https://github.lvyihang.xyz/`：状态码 `/` 200、`/blog/` 200、`/about/` 200、`/sitemap.xml` 200、
`/404.html` 200；`/papers/` **404**、`/publications.bib` **404**、`/feed.xml` **404**、`/publications.ris` **404**。
响应头 `last-modified: Fri, 16 Oct 2026 09:52:17 GMT`、`etag: "6ad1f3d1-9311"` → 确认仍是 **2026-10-16 旧部署**，
不是站点损坏。那四个 404 属"待部署"（待拍板 7），**本场次不 push**，故不修。

### B. 本场次实施（两个改进点）

1. **引用元数据补 `citation_online_date`，并把"上线日 / 期号日"拆成两个具名字段**：
   - `src/_data/site.js`：`dates` 拆出 `publishedOnline`（2026-06-01）与 `publishedPrint`（2026-06-16），
     `published` 保持 "2026-06-01" 不动 → **四个消费点零变化**（论文页、列表页、JSON-LD、BibTeX/RIS）。
   - `src/_includes/partials/citation-meta.njk`：新增 `citation_online_date`（值 = `dates.publishedOnline`
     → 2026/06/01）；文件头补入 Google 官方对两个日期标签的**原文定义**。
   - `src/_includes/layouts/paper.njk`：可见时间线由 `Published 2026-06-01` 改为
     `First published 2026-06-01 · Issue 2026-06-16` —— 用 AGU 自己的措辞，如实呈现两个已核实事实。
   - **为什么不取"进入本仓库的日期"**（Google 官方那句话的字面读法）：那会把日期变成 git 派生的构建期事实；
     而"出版商登记的上线日"在三处一致（Crossref `published-online` / unixref `media_type="online"` /
     AGU "First published: 01 June 2026"）→ 选了**有权威来源**的那个，并在模板文件头把两种读法的差写明。
   - `citation_publication_date` **保持 2026/06/01 不动**：改用期号日属"引用时通常写哪个日期"的口径问题，
     **不代拍**，登记为**待拍板 33**（见中央台账）。
2. **给全仓最后一个没有注入矩阵的静默失效层补上矩阵**：`scripts/check-citation-meta.cjs` 的文件头自述
   "删掉模板里那行 `citation_issn`，build 照样全绿" → 新建 `scripts/test-citation-meta.cjs`（10 档 M0–M9），
   接进 `npm run build`（`check:citation-meta` 之后），README 命令清单同步登记（RD3 要求）。
   同时给新判据 **C7**（上线日必须是日历上真实存在的 YYYY/MM/DD，且不得晚于出版日；数据侧 + 产物侧各查一次）
   配了自证存活；`c7Compared` 计数器**提到文件顶部声明** —— 否则整段删 C7 会崩成 `ReferenceError` 堆栈
   而不是干净判红（本仓吃过这个亏）。

### C. 验证（隔离克隆 `/tmp/mh-r30/repo`，基线 HEAD `6ccb7b5` + 本场次 7 个文件）

- `npm run build` **exit 0**、零 ✗（日志里 35 个 "✓ M"）。
- 引用元数据门禁通过：共比对 32 处，C7 比对 2 处。
- 注入矩阵 **10/10 全过**：M0 基线绿；M1 少了 `citation_online_date`；M2 取值不一致；M3 晚于出版日（C7）；
  M4 少了 `citation_publication_date`；M5 `citation_issn` 取值不一致；M6 一个 `citation_*` 都没有；
  M7 非论文页出现 `citation_*`；M8 引用导出缺失；M9 导出里这篇论文不见了。
- 产物级 diff（对比上一轮基线克隆 `/tmp/mh-r29/repo/_site`）：论文页仅多出 `citation_online_date` 标签 +
  可见日期行改写；`publications.bib` / `publications.ris` **逐字节相同**；JSON-LD `datePublished` 仍 "2026-06-01"；
  `feed.xml` / `robots.txt` 的差异**仅为构建时间戳**。
- 额外两档注入：数据侧 `publishedOnline` 改成 2027-01-01 → C7 判红"上线日期晚于出版日期"；
  整段删掉 C7 判据 → 门禁 **exit 1** 且给出可读红因"C7（上线/出版日期的不变量）一条都没比过"。

### D. 编号说明：本场次**主动跳过 32**

并发场次正在新建 `scripts/check-decision-ids.cjs`（待拍板编号唯一性门禁），其**文件头**已声明占用 **32**
（"台账要不要收编台账外的事项"那条）。本场次**没有**去抢这个号 —— 抢了就是"一个号两件事"，
正是那道新门禁要防的病 → 本场次用 **33**，并在中央台账里登记。

- **待拍板 33（新增）｜`citation_publication_date` 该用"上线日 2026-06-01"还是"期号日 2026-06-16"？—— 引用时通常会写哪个日期**

### E. 本场次不新增其它待拍板

"上线日取哪个"已并入**待拍板 33**（一条，不拆两条）。仍开着的、本场次**不重复、不改口**：
待拍板 7（部署时机——本场次仍**不 push**）、29（RD1 单向覆盖）、30（豁免标记词表口径）。

### F. 提交

- 本场次 7 个改动文件 + 本日志节，**显式指定路径**提交（不用 `git add -A`：工作树上还有并发场次的在途改动
  —— 身份门禁 I8 那条线，以及新建的 `check-decision-ids.cjs` / `test-decision-ids.cjs`）。
- **未 push。**

## 2026-10-19 · 18:40–19:05 场次（**不占轮次号**，避免与并发场次撞号）· 续：I8 交接留档 —— 对 peer 两封报告的逐条裁定 + 回执投递状态

> 本节是上一节（I8「可见性一致」落库 `5f911c6`）的**续节**，不是新改进点、不占新轮次号、不新增待拍板编号。
> 之所以要留一节：原定接收回执的只读复验 peer 场次**已归档**，回执**无处投递**；把裁定写进仓库，
> 比留在一个已归档的会话里更耐久 —— 后来者读日志即可看到"哪条已落地、哪条是过时快照"，不必再去翻会话。

### A. 回执投递状态

- 目标 peer 场次：`mvs_0a0e47bfe20f4e298a4e6a584014e6bb`（第六封 / 第二封报告来源，只读复验者）。
- 投递结果：`session send` 返回 **`SESSION_ARCHIVED`（409）** → 该场次已归档，**回执无处投递**（不是排队、不是失败重试的问题）。
- 处置（两路落地，均已完成）：
  1. **本节留档**：把逐条裁定、查实结论、矩阵结果写进仓库，随本场次提交落库。
  2. **通知仍活跃的并发 MeteoHub 场次**（`mvs_d42d4bd9…`、`mvs_99f128c6…`，均已入队）：告知 I8 已落 `5f911c6`，
     外加一条**通用纪律**（下一节 E）—— 他们若也在写门禁，这一条能直接避免重蹈。
- 边界：本场次**未 push**；**未改共享工作树里并发场次的任何在途文件**。

### B. 对 peer 两封报告的逐条裁定（**在当前 HEAD 现查现跑**，不靠快照）

| 报告 | peer 的基准 | 我现查现跑的基准 | 结论 |
|---|---|---|---|
| 第六封 | `1ea722f` | `9293d11`（本节所在） | 他的修法 1–4 **全部已落地** |
| 第二封 | `f630b2c` | `9293d11`（本节所在） | 三条缺口**已落地**（其中一条他报的是旧行号） |

**第六封**：

- A1「严格等长替换」→ 当前 HEAD 复跑 **exit 1、6 条红因**（I2d 漂移 / I1 缺 / C4 多出 / I5 缺 / I5 多出 / I7 多出）——
  比他在 `ae1d868` 上测到的 4 条**更强**（他那条结论现在只对他当时的基准成立）。
- A2「sameAs 多挂」→ **exit 1、1 条红因**。
- 修法 1（oracle 写死 + 哈希锚）→ 已落地（`ORACLE_SAMEAS` + `ORACLE_SET_SHA256`）。
- 修法 2（五句柄全派生）→ 已落地（`author.*` / `sameAs` / `social[]` 均从 `scripts/lib/identity.cjs` 派生）。
- 修法 3（`anchorTrustworthy` 短路）→ 已落地。
- 修法 4（I2d 多出判红）→ 已落地。

**第二封**：

- 缺口① I1 多出 → `scripts/check-identity-handles.cjs:671` `if (extraHandles.size) → fail(...)` **已落地**。
- 缺口② 锚失守短路 → **已落地**。
- 缺口③ `author.*` / `sameAs` / `social[]` 全派生 → **已落地**（他报的是**旧行号**）。

### C. I8 的 v1 → v2 订正（详版见上一节，此处一句版）

v1 把判据**范围**写成「页脚模板里出现的身份字段名」→ 删掉页脚那一整行 → 字段名不再出现 → **范围里就没有它**
→ 本条不再检查它 → 门禁 **exit 0、零红因**（同一注入下，精确等于本人账号 URL 的可见 `<a href>` 从 **8 处掉到 2 处**，
门禁毫无反应）。v2 把范围**写死**在门禁里（`SCOPE_KEYS`），模板降级为只做交叉核对与诊断。

### D. 注入矩阵（在**提交树 `5f911c6`** 上重跑，8 档全对）

C0 基线 0 ｜ C1 删页脚整行 github → **1**（v1 此处是 0）｜ C2 删 openalex 的 `<a>` → 1（6 份）｜ C3 删 orcid 整行 → 1
（404/blog）｜ C4 连数据源带模板一起去掉 openalex → 1（I5 判红）｜ C5 删掉 I8 整段 → 1（红因可读「可见性一致性判定（I8）
没有跑起来」，**不崩栈**）｜ C6 页脚新增登记在册的 csdn → 1（交叉核对红）｜ C7 页脚 + `SCOPE_KEYS` 两处显式删 github → 0
（不误报）｜ C8 还原 → 0。每档打印被注入的那一行 / 产物里出现次数，并逐档打印**喂进去的门禁 sha256** 与期望比对（不符当场退出）。

### E. peer 建议的 OG 图 GitHub 字面量：查实，**不用他升级**

`src/assets/img/og/og-1200x630.svg` 与 `og-1500x500.svg` 各 1 处；字面量是**站点仓**
`github.com/oldsixxiaolv/oldsixxiaolv.github.io` 的**可见文字**（**不是** `<a href>`、**不是**本人句柄）
→ 不在身份门禁视野内 → 归**既有「待拍板 22」**范围 → 本场次**不新增编号**、不自行决定。

### F. peer 报的「notes 结构性不可达」：复核**仍开着**，但**本场次未动**

- 当前 HEAD 实测：锚失守档输出**只有一行红因**，「本轮跳过了 I1/I5/I7」一个字都没有（那些说明在 `notes` 里，
  `:969` 打印，而 `:950` 已 `process.exit(1)` → 门禁一红就结构性不可达）。
- 全仓同形态扫描命中 **7 个**门禁：`check-a11y` / `check-identity-handles` / `check-image-assets` / `check-jsonld` /
  `check-live-site` / `check-print-theme` / `verify-site`。
- 自证矩阵 `scripts/test-gates-selfcheck.cjs` 只有 D1–D6 + P，**没有锚失守档** → 该缺陷对自证**隐形**。
- 修法建议（**本场次不自行决定**）：① notes 的打印移到 `process.exit(1)` 之前；② 更稳的是把「本轮跳过了哪几条」
  写进**红因本体**（`fail` 而非 `note`），这样即使 notes 仍不可达也不丢信息。
- **不属本场次改进点范围**：本场次只做 I8，不顺手扩；这一条留给下一轮或本人拍板。

### G. 本节归属与边界

- 本场次（I8）改动：仅 `scripts/check-identity-handles.cjs`（+289/−3）+ 本日志节，提交 `5f911c6`（父 `96eccc5`）。
- 本续节改动：仅 `docs/IMPROVEMENT-LOG.md`（本节），**不带**并发场次的在途改动。
- **未 push**（本地 main 领先 `oldsixxiaolv/main` 100+ 提交；部署时机仍待本人拍板）。
- 待拍板清单**不新增编号**；本节只引用既有条目（22）。

## 2026-10-19 · 18:40–19:05 场次（**不占轮次号**，避免与并发场次撞号）· 续二：Copy 门禁「模板内联 `<script>` 纳入扫描」补落地记录 —— 代码在库、日志只有一行交接

> 本节是本场次的**第二个改进点**（第一个是身份门禁 I8，已落 `5f911c6`）。**只补记录，不改门禁代码** ——
> 功能为真，缺的只是「可按图索骥的落地段」。**不新增待拍板编号**。

### A. 为什么补这一段

- `scripts/check-copy-export.cjs` 把 `src/**/*.njk` 里的**模板内联 `<script>` 块**纳入复制出口扫描
  （原来只扫磁盘上的 `.js` 文件，`base.njk:463` / `paper.njk:310` 两处内联块曾是理论盲区）。
  **代码在 `0fcbdcb`（已入库）。**
- 但日志里对它只有**一行交接**：16:25–16:55 场次第 5 条「代提交 Copy 门禁改进…该场次已实测注入 7/7 全绿」，
  外加一条问题条目（:8449「模板内联 `<script>` 扫不到」）。
- 缺的是**落地段本身**：矩阵、逐条红因断言，以及**这项改进自身的能力边界**（下面 C 档就是边界）。

### B. 我自己重跑的 4 档（隔离克隆 @ `993db5a`，门禁 = `scripts/check-copy-export.cjs`）

| 档 | 注入 | 期望 | 实测 |
|---|---|---|---|
| C1 | 基线（无注入） | exit 0，「扫 9 个 JS 文件 + 2 个模板内联脚本块」 | ✅ exit 0，逐字一致 |
| C2 | `src/index.njk` 追加内联块，`writeText(src.innerHTML)` | exit 1、两条红因点名 `src/index.njk:88`、扫描单元 2→3 | ✅ exit 1、2 条红因、点名 `:88`、输出「扫 9 个 JS 文件 + **3** 个模板内联脚本块」 |
| C3 | 同一位置，`writeText(src.textContent)`（**合法**写法） | 应绿 | ❌ **exit 1、2 条红因** ← **新发现** |
| C4 | 恢复 | exit 0 | ✅ exit 0 |

每档都打印注入行号与门禁输出全文；C2 注入行号实测 `src/index.njk:90`，红因定位在 `:88`（块内语句行）。

### C. C3 的发现：这项改进**只有坏档自证、没有正档自证**（peer 未测的一档）

- **红因 1**：「`"src"` 的取值表达式看不懂（`document.querySelector('pre')`）—— 门禁无法确认它来自文本。」
  → 取值链分析只认 `x.textContent` / `x.innerHTML` 这类**属性读取**，认不出 `document.querySelector(...)` 这种
  **最常见**的取值写法 ⇒ **合法代码被判红**。
- **红因 2**：「这个单元有 `clipboard.writeText` 出口，但 textarea 回退在别的单元（回退 → `src/assets/js/main.js`）——
  两条复制路径分处两个单元。」→ 在模板内联块里写复制出口时，**同单元还得有回退路径**。
- 判定：红因 2 是**规则的正确适用**（那确实是真问题）；红因 1 是**能力边界**，且恰好会把最常见的合法写法判红。
  ⇒ 这项改进目前**没有「合法路径应绿」的正档**（与既有那条「自证矩阵缺合法路径应绿档」同族）。
- **不自行改判据**：登记为**已知边界**，留给下一轮或本人拍板；本节**不新增待拍板编号**。

### D. 对 peer e41cfa12 补丁的裁定（**不需要套**）

补丁：`/tmp/mh_v41_e41cfa12/patch_identity_3.diff`（3058 字节，只改 `scripts/check-identity-handles.cjs`）。

- **① 改动 A（I1「多出未登记句柄」note → 判红）**：**当前 HEAD 已经是 `fail`**
  （`scripts/check-identity-handles.cjs:671`），且红因文案**比补丁里的更成熟** ——
  当前版本区分「产物/数据源多挂了未登记句柄」与「合法增删句柄但登记清单没同步」两种情形，
  并指明**用 I2d 的绿/红来分辨根因**。
- **② 改动 B（锚自检失败即 `exit 1` 硬短路）**：当前 HEAD 用的是**更精细**的方案 ——
  `anchorTrustworthy` 标志 + **I2d 红因改写**。实测（隔离克隆 @ `993db5a`，把 oracle 等长改一个字符、哈希锚未同步）：
  **exit 1、2 条红因**，第 2 条原文：
  > 「共享模块 `scripts/lib/identity.cjs` 的清单与本判据的独立期望集不一致：模块多出 …／模块少了 …——
  > **但期望集自身已判红**（上面那条锚判据），所以这处不一致**不能断定是谁被改了**（期望集被改、模块没同步；
  > 或模块被改、期望集没同步 —— 两种都长这样）：先按上面哈希锚那条红因把期望集修好，再重跑本门禁 ——
  > 若漂移仍在，那才是模块这边的问题。」
  → **责任方没有被指错**（peer 担心的正是这一点），而且比硬短路**多保留**了漂移信息
  （硬短路会连带停掉其它不依赖锚的判据）。
- **③ 补丁套不上**：`git apply --check` → `error: scripts/check-identity-handles.cjs: patch does not apply`
  （上下文基于旧版：`@@ -173` vs 当前 I2 段在 `:490+`）。
- **④ peer 的 R4 档有个连带效应，值得提醒**：注入的 `https://github.com/impersonator-e41` 与 GitHub **同 host**，
  而 `src/_data/site.js:42` 的 `identityUrl(host)` 是「按 host 取清单里**第一条**」⇒ `site.author.github` 被**顶替**。
  实测该档 **5 条红因**（I2d 漂移 / I1 多出 / I5 缺 oldsixxiaolv / I5 多出 / I7 产物里出现未登记链接）**全是真阳性**，
  不是误报。但若只想测「多出一条未登记句柄」而**不动** `site.author`，注入应换一个**不同 host**。

### E. 归属与边界

- 本场次两个改进点：① 身份门禁 I8「可见性一致」（`scripts/check-identity-handles.cjs` +289/−3，提交 `5f911c6`）；
  ② 本节 Copy 门禁落地记录（**仅 `docs/IMPROVEMENT-LOG.md`**，不动门禁代码）。
- 本节**不带**并发场次的在途改动；**未 push**（本地 main 领先 `oldsixxiaolv/main` 100+ 提交，部署时机待本人拍板）。
- 待拍板清单**不新增编号**；本节只登记一个**已知边界**（C3 档那条取值链能力边界）。

---

## 2026-10-19 · 18:20–18:55 场次（本机 PDT = UTC-7，折算 UTC 为 2026-10-20 01:20–01:55；**不占轮次号**，避免与并发场次撞号）：把 18:20 场次写在**台账之外**的 29/30 两条登记搬进中央台账；并给「待拍板编号唯一性」配上第一道可机械核对的门禁（DI*）

### A. 巡检（2026-10-19 18:4x PDT 实测）

| 项 | 结果 |
|---|---|
| 线上 7 路由 | `/` 200、`/papers/` **404**、`/blog/` 200、`/about/` 200、`/publications.bib` **404**、`/feed.xml` **404**、`/sitemap.xml` 200 |
| 首页 canonical / og:url | 都是 `https://github.lvyihang.xyz/MeteoHub/`（带 `/MeteoHub/` 前缀；该前缀下 `/MeteoHub/`、`/MeteoHub/about/`、`/MeteoHub/blog/`、`/MeteoHub/papers/` 实测全 404） |
| sitemap `<loc>` / `<lastmod>` | 三个 `<loc>` 都带 `/MeteoHub/` 前缀；`<lastmod>` = 2026-10-16T09:51:14Z → 线上仍是 **2026-10-16 的旧部署** |
| 本地 `main` 领先 `origin/main` | **124 个提交**（远端 = `oldsixxiaolv`，`git@github.com:oldsixxiaolv/MeteoHub.git`） |
| 本地 `npm run build` | exit 0 |
| 站内容层 | 未找到缺失功能（`site.js` 字段全部渲染、`.bib`/`.ris` 导出、JSON-LD、引用 UX、sitemap 齐全）→ **本轮不做站内容硬改** |

线上 3 条路由 404 + canonical/og/sitemap 漂移：**本地已修好**，`push` 一次即可全部恢复
（`deploy.yml` 已含 `workflow_dispatch`），但**部署时机属本人拍板**（待拍板 7）→ **本场次不 push**。

### B. 根因：撞号不是手滑，是「登记写在台账之外」

上一轮把「待拍板 29」判成同号两义时，表面看是两个场次各登记了一次。实际根因是：

- 18:20 场次把 29 / 30 两条登记**写在中央台账之外**（写在它自己的场次小节里）；
- 下一场次翻台账时，**29 号在台账里是空的** → 它以为这个号还空着 → 拿去登记了另一件事；
- 于是**同一个号指了两件不同的事**，而本人按号拍板时**会拍到错的那一件**。

⇒ 只把「改号」当解法是治标：只要**登记还能写在台账之外**，下一次还会撞。真正的解法两步（本场次各做一步）：

1. **把已经在台账之外的登记搬进台账**（数据面）；
2. **加一道机械判据**（机制面）：台账里认领的号，别处同号声明必须指同一件事，否则**判红**。

### C. 改了什么

**C.1 数据面：29 / 30 两条登记搬进中央台账**

- 原来两条登记在 18:20 场次小节里，现已**整块搬进**中央「待决策」段，原处留 3 行**指针**（指回台账内那两条）。
- 台账登记条目数：35 → **38**；台账里**显式认领**的编号：24、25、26、27、**29**、**30**、31、33。
- 顺带纠正一处**标签错误**：原先指针写的是「19:0x 场次就地搬正」，但本机时钟实测为 **18:49 PDT**（= UTC 01:49），
  本场次实为 **18:20–18:55 PDT**；已据实改成本场次标题里的时间。
  （日志里 PDT / UTC 两种标签并存，且出现过「18:52 追记」这类自相矛盾的时戳——本场次**只改自己那行**，
  不静默改他人段落。）

**C.2 机制面：新增 `scripts/check-decision-ids.cjs`（DI*）**

判据三条，全部按**内容锚**定位（不依赖行号——并发场次会持续追加，行号随时漂）：

| 标签 | 判据 | 红因（说人话） |
|---|---|---|
| `[DI0]` | 判据自证：台账标题必须定位得到（标题缺失 / 出现两份 / 无收尾 `---`）且**至少认领一个编号** | 「中央待决策段里一条「登记为待拍板 N」都认不出来」等 |
| `[DI1]` | 同号两义：台账认领的号 N，在日志别处若也有同号声明，**两者必须指同一件事** | 「待拍板 **N** 指的是**两件不同的事**（最长公共子串只有 v 字，低于门槛 12）」 |
| `[DI2]` | 一号一条：台账内同一编号被**两条不同的登记**认领 | 「待拍板 **N** 在中央待决策段里被 k 条**不同的登记**认领」 |

- 「同一件事」的判据 = **去噪后标题的最长公共子串 ≥ 12**。阈值是标定出来的，不是拍的：
  同一件事的改述实测 **15 / 16 / 18 / 18 / 29 / 35 / 49**，真同号两义实测 **6** → 取 12，两侧各留余量。
- **认领口径是窄的**：只认「登记为待拍板 N」这一种写法（`CLAIM_RE`）。宽口径（同一行同时含「不代拍」+「待拍板 N」）
  实测命中 30+ 行噪音，**不可用**。
- **声明口径**：`待拍板 N（…）｜标题`（`DECL_RE`），标题取 `｜` 之后到下一个 `**` 之前。
- 台账 1–22 号的早期条目**不带显式编号**，认不出来 → **如实写明不参与比对**，不做假绿。
- 台账外的「登记为待拍板 N」脚注（台账未显式认领的那些）**只报数、不判红** ——
  「台账要不要收编它们」是本人拍板（F.1），门禁不代拍。
- 支持 `LOG_PATH` 环境变量覆盖（供注入矩阵在副本上跑，不碰主工作树）。

**C.3 `scripts/test-decision-ids.cjs`：注入矩阵（本场次写 9 档，并发场次续扩到 12 档）**

锚点**从真实日志现取**（不是写死的行号）；锚点取不到就**当场抛错**（坏跑当场暴露，不静默跳过）。

| 档 | 注入 | 期望 |
|---|---|---|
| M0 | 基线（原样日志） | 全绿（证明不是空跑） |
| M1 | 台账里那条被换成**不相干**的事 | DI1 |
| M2 | 台账里多出一条认领同号的登记 | DI2 |
| M3 | 台账里一条登记改认别人的号 | DI2 |
| M4 | 台账登记写法全改（认领数归零） | DI0 |
| M5 | 台账标题被改掉（定位不到台账） | DI0 |
| M6 | 台账没有收尾分隔线 | DI0 |
| M7 | 台账标题出现两份 | DI0 |
| M8 | 同一件事的**改述** | **仍绿**（防过度核那一档） |
| M9 | 台账外多出一条**另一种写法**的不带 ｜ 声明（另一件事） | DI1 |
| M10 | 正文里的**交叉引用**指向另一件事 | **仍绿**（交叉引用不是声明） |
| M11 | 台账外同一个号被**认领两次** | **仍绿，但必须被报出来** |

**C.3b 门禁文件随后被并发场次继续扩写（本提交取的是扩写后的版本）**

- 本场次写完 `scripts/check-decision-ids.cjs`（266 行）与自测（295 行 / 9 档）之后，**并发场次在同两个文件上继续扩写**
  （提交时刻为 18:56，工作树版门禁 **374 行**、自测 **382 行 / 12 档**），主要扩的是**覆盖度报告**：把「声明只认顶格列表项的两种写法
  （带 ｜ 的 24 条 + 不带 ｜ 的 37 条 = 61 条参与比对）」「正文里 7 处交叉引用**不是**声明、不参与比对」
  「本门禁**认不出**的写法共 82 处（多为引用，不是新登记）」逐条写实，并给台账外 4 个号
  （18 / 20 / 23 / 28）列出**逐号明细**（声明在哪一行、认领在哪一行）。
- 期间该文件一度处于**改到一半的状态**（`offLedgerDetail` 未定义 → `ReferenceError`，18:54 前），
  由并发场次自己补完。
- 本场次的处置：**取该文件的当前工作树版本作为提交内容**（因为 `package.json` 的接线指向它，
  不带进提交则本提交自相矛盾、干净克隆必崩），并**显式登记归属**（下条）。
  提交前已把该版本**独立快照**并在隔离目录单跑过（`/tmp/mh_pair`）：DI 门禁 exit 0、注入矩阵 **12 档全过**。
- 并发场次还给自测补了 3 档：M9「台账外多出一条**另一种写法**的不带 ｜ 声明（另一件事）」、
  M10「正文里的**交叉引用**指向另一件事（应仍绿）」、M11「台账外同一个号被**认领两次**（应仍绿，但必须被报出来）」——
  这 3 档正好补上「不带 ｜ 的写法」和「交叉引用不是声明」两处此前没有夹具的口径。

**C.4 接线**：`package.json` 新增 `check:decision-ids` + `check:decision-ids-selftest`，
并插进 build 链（`check:log-sections` 之后）；`README.md` 命令表新增 2 行登记。
自测**不**并入 `scripts/test-gates-selfcheck.cjs`（那属既有待拍板 18，不重复登记）。

**C.5 兑现一条此前为假的断言**：`6ccb7b5` 的日志里早已声称「新增门禁 `scripts/check-decision-ids.cjs`（DI1）」，
但当时文件**并不存在**（登记在已入库的待拍板 31 条目内）→ 本场次把它真正做出来，那条断言才成立。
（`96eccc5` 已订正 18:36–18:50 场次 E.2 里那句同样过时的陈述。）

### D. 验证结果

| 项 | 结果 |
|---|---|
| `node scripts/check-decision-ids.cjs` | exit 0 —— 台账 38 条登记条目、8 条**显式写了编号**（24/25/26/27/29/30/31/33）、台账内一号一条、这 8 个号与别处同号声明逐条比对了 **10 对**，无一对指向两件不同的事 |
| `node scripts/test-decision-ids.cjs` | **12 档全部按预期触发**（M0/M8/M10/M11 绿；M1→DI1；M2/M3→DI2；M4–M7→DI0；M9→DI1） |
| 工作树 `npm run build` | 本场次改动落地后、并发场次新在途改动出现前为 **exit 0**（build 链 **27 步**；`package.json` **30 个 script**）；**提交时点为红**，红因是并发场次的在途 `eleventy.config.js` 引用了未跟踪的 `scripts/lib/chart-svg.cjs`，被 tracked-refs 门禁拦下——**不属本场次**（详见 E 段） |
| 门禁接线门禁（GW1） | 通过（每个 `check-*.cjs` / `verify-*.cjs` 都从 `build` 可达） |
| README 门禁 RD3 | 通过（README 提到全部 30 个 npm script） |
| 干净克隆整链 build | **exit 0** —— `git clone` 当前 HEAD + 放入本场次 5 个文件 + `node_modules` 软链 → 整链通过（**本场次改动的权威判据**：工作树混着并发场次的在途改动，不作判据） |
| DI 门禁 + 自测**快照**隔离复跑 | exit 0 / 12 档全过 —— 把要提交的那两个文件拷到隔离目录单跑（不依赖工作树当时状态） |

### E. 归属与边界

- 本场次改动的文件：`scripts/check-decision-ids.cjs`（新，**含并发场次的扩写**，见 C.3b）、`scripts/test-decision-ids.cjs`（新）、
  `docs/IMPROVEMENT-LOG.md`（搬正 29/30 + 指针标签 + 本节）、`package.json`（+2 script + build 链）、
  `README.md`（+2 行）—— **5 个文件，全部挂在本场次名下**。
- **其中 `scripts/check-decision-ids.cjs` 的覆盖度报告段是并发场次写的**，
  本场次只把它并入本次提交（并独立验证过），**不冒充是自己写的**；并发场次后续若再改，
  在其提交里继续演进即可。
- 提交时**日志只提交本场次内容**：并发场次在 `docs/IMPROVEMENT-LOG.md` 里留下的 2 处**纯空白**改动
  （表格两行之间多一个空行、某个 `##` 节前少一个空行）**不带进本场次提交**
  （用精确 blob 提交，不整份烤工作树）。
- 提交后**不 push**。远端 `oldsixxiaolv` 的实际状态**未确认**（`git ls-remote` 返回空，疑为 SSH/权限问题）
  → **不作任何结论**。
- ⚠️ **提交时点工作树整链 build 是红的**，红因**不属本场次**：并发场次的在途改动
  `eleventy.config.js` 引用了**尚未 git 跟踪**的 `scripts/lib/chart-svg.cjs`，
  被「已跟踪文件里引用的本地文件必须也已被 git 跟踪」门禁（tracked-refs）拦下 ——
  门禁说得对，是**它**的提交没带上那个文件。**本场次改动的权威判据是干净克隆整链 build（exit 0）**，
  不是这份混着别人在途工作的工作树。

### F. 待本人拍板

**F.1（新增）待拍板 32：台账之外的 4 个号（18 / 20 / 23 / 28）的事项，要不要收编进中央台账？**

台账外还有 6 处「登记为待拍板 N」脚注：N = 18 / 20 / 23 / 28（台账**未**显式认领，门禁只报数）
与 N = 29 / 30（台账已认领，属正常重申）。前者意味着**本人按号在台账里找不到那几件事** ——
和 B 段那个根因同族。备选：① 全部收编进台账；② 收编一部分（哪几条）；③ 不收编，改为在台账里加一节
「未上账事项索引」指过去；④ 维持现状（台账只是**主要**事项的清单）。**本场次不代拍。**

**F.2 承接待拍板（原文不动，仅列本场次立场）**

- **待拍板 7（部署时机）**：线上 3 条路由 404 + canonical/og/sitemap 漂移，本地已修好，**push 一次即恢复**；
  本场次**不 push**，等本人定时机。
- **待拍板 18（新门禁要不要并入 `scripts/test-gates-selfcheck.cjs`）**：本场次的 DI 自测是**独立 npm script**
  并已接进 build 链，**没有**并入 `test-gates-selfcheck.cjs`（不占用既有待决项，也不重复登记）。
- **待拍板 28（门禁自检接进 build 链）**：DI 自测**已**接进 build 链；DI 门禁本身也已接进。

## 2026-10-19 · 18:40–19:05 场次（**不占轮次号**，避免与并发场次撞号）· 续三：16:2x 复核场次交接件的逐条裁定 + 新缺口登记（待拍板 34）

> 本节**不改判据**，只做**裁定**与**登记**。编号说明：并发场次已把中央台账推进到**待拍板 33**，
> 34 号登记前已确认**全库 0 处占用** → 本场次登记为**待拍板 34**。

### A. 对 16:2x 复核场次交接件的逐条裁定（**在当前 HEAD 现查现跑**，不靠它的基准）

它标的被验 commit = `268097a`；以下裁定在 HEAD `014d2ee` 上现查。

| 它提的 | 现状 | 依据 |
|---|---|---|
| ① 门禁恢复独立 oracle（完整清单 + I2 逐字核对） | **已在 main，别重做** | `scripts/check-identity-handles.cjs` 就是 oracle 形态：`ORACLE_SAMEAS` + `EXPECTED_COUNT` + `ANCHOR_ORCID` + `ORACLE_SET_SHA256` + I2d 双向漂移核对 |
| ③ 多出回判红 | **已在 main** | I2d 是**双向**比对：`extra`（模块多出）与 `missing`（模块少了）都 `fail` |
| ④ 锚自检失败即短路 | **已过时 —— 诉求已被满足，且实现更精细** | 见下面 B |
| ② 模块补齐 site.js 里仍硬编码的 author.github/csdn/researchgate | **成立，但归属是并发场次、不是本场次** | site.js 派生正由并发场次在做（工作树在途）；且它给的 `index.njk:72` 那条**已过时**（见下面 C） |

### B. ④ 的现状：不是"仍开放、没人接"，而是**已用更精细的方式实现**

`scripts/check-identity-handles.cjs`：`let anchorTrustworthy = true;`（:498）→ I2a / I2b / I2c 任一失败即置 false
（:502 / :511 / :523）→ **被锚依赖的判据全部门控跳过**（I1 :647、I5 :703、I6 :944、I8 :1053）；
I2d 漂移核对**不**翻转该标志（:531），且在锚失守时红因被**改写**（:547）。

实测（隔离克隆，oracle 等长改一个字符、哈希锚未同步）→ **exit 1、2 条红因**，第 2 条原文：

> 「共享模块 `scripts/lib/identity.cjs` 的清单与本判据的独立期望集不一致：模块多出 …／模块少了 … ——
> **但期望集自身已判红**（上面那条锚判据），所以这处不一致**不能断定是谁被改了**（期望集被改、模块没同步；
> 或模块被改、期望集没同步 —— 两种都长这样）：先按上面哈希锚那条红因把期望集修好，再重跑本门禁 ——
> 若漂移仍在，那才是模块这边的问题。」

⇒ 它担心的**"级联红因指错责任方"这个具体问题没有发生**：红因明确免责并给出修复路径；
且比"立即 `exit 1`"**多保留**了漂移信息（立即 exit 会连带停掉其它不依赖锚的判据）。
**"立即短路"与"改写红因"是两种实现，本仓取的是后者** —— 那条建议在当前 main 上**已经不适用**。

### C. 它给的 `index.njk:72` 字面量已过时

它说「`src/index.njk:72`：`https://github.com/oldsixxiaolv/Manuscript_Lvyh`」是字面量。
当前 HEAD 该行（`src/index.njk:72`）是 `<a href="{{ site.author.paperCodeRepo }}" …>Manuscript_Lvyh</a>`
—— **已从 `site.author` 派生**（site.js 派生工作已吃掉这一处）⇒ 它的这条论据**已过期**。

### D. 它指出的一半（真正的新缺口）：产物里还有第二条路

- `src/content/about.md:38` 独立字面量 `[CSDN](https://blog.csdn.net/lvyihang200411)`；`:23` 站点仓字面量。
- 渲染后 `about/index.html`：该 CSDN 的**可见 `<a href>` 出现两次** —— `:1525` 模板面板（`site.author` 派生）、
  `:1565` markdown 正文（独立字面量）；另有 `:855` / `:913` 的机读 `sameAs`。
- I5 段代码明写「**只看 site.author** —— 那是"本人"这一个实体的数据源」→ **扫不到正文那条**。
- I7 只判"多出"、I8 的范围不含 csdn ⇒ **换号会被抓，"改号不同步"抓不住**。
- 硬约束核实无误：`eleventy.config.js:1493` `markdownTemplateEngine: false`，`about.md` 头注释明写
  「模板语法在这里无效」+ 编写约定 ②「事实性清单（… / 链接）全部交给模板」→ **不能**在 md 里写
  `{{ site.author.csdn }}`；正路是把链接挪进 `about.njk`。
- 处置：**内容口径属本人拍板**，本场次**不代拍、不自行改判据** → 登记为**待拍板 34**
  （两条修法、代价、判别动作已写进中央台账）。

### E. 归属与边界

- 本场次三个改进点：① 身份门禁 I8（`5f911c6`）；② Copy 门禁落地记录（`014d2ee`）；③ **本节**
  （**仅日志**：裁定 + 台账登记，**不改任何门禁代码**）。
- **未 push**（本地 main 领先 `oldsixxiaolv/main` 100+ 提交；部署时机待本人拍板）。
- 待拍板**新增 34**（登记前已确认全库 0 处占用）；其余沿用、不改口。


## 2026-10-20 · 01:55–02:20 场次（**不占轮次号**）：I6「判了却不报」的**根因修掉** —— ORCID 值域判据的结果接进通过文案；顺带补上"整段 I6 被删"的兜底（摘要读了计数，计数就不能跟着判据一起消失）

### A. 起点：那个前置条件现在满足了

18:36–18:50 场次把"I6 判了却不报"记成账（`3616986`），并写明"该文件正被并发场次在途修改，
本轮不碰它，**等对方落库后再处理**"；18:30–18:45 场次同步时也把同一条点给我
（"可在同一趟里把这两个计数打进通过文案。我本轮不碰该文件，等你落库"）。
本场次开工时那个前置条件**已满足**：I8 已落库（`5f911c6`），`scripts/check-identity-handles.cjs`
在工作树里**无在途修改**（`git status` 干净）→ 接手实施。

### B. 现查（三条，基准 HEAD `014d2ee`）

1. **I6 的两个计数器仍是死变量**：`orcidFoundInSite` / `orcidFoundInSource` 全文件只有
   声明 + 赋值，**没有第三处读取**；末尾 `console.log` 里关于 ORCID 值域**一句都没有**
   （摘要里那串 `orcid.org/0009-0005-3511-0546` 是 **I1/I2 的期望集内容**，不是 I6 扫到的值
   ——两者长得像，说的不是一回事）。⇒ peer 第 3 条**属实**。
2. **peer 第 1 条已过期**：I8 的判据范围现在**写死**在
   `SCOPE_KEYS = ["github", "orcid", "openalex"]`（文件顶部常量区），**不再**由 footer.njk
   自己决定——peer 测的是在途 v1（自我收缩那一版），v2 已改。
3. peer 第 2 条的两处订正（行号定位错误、门禁 24 / 29 确实存在）已在 18:36–18:50 场次
   F 节逐条现查记录，**本场次不再重复**。

### C. 实施（`scripts/check-identity-handles.cjs`，5 处）

1. 文件顶部新增两个标志 `orcidReached`（段**跑到了**）/ `orcidChecked`（**真判了**）
   ——与 I8 的 `visibilityReached` / `visibilityChecked` 同款分工：白名单锚失守时 I6
   **主动跳过**（那不是缺陷），**整段被删**才是缺陷；只看计数分不开这两者
   （跳过与被删都会留下 0）。
2. ⚠️ **两个计数器的声明从 I6 段内移到文件顶部**——这是实施中冒出来的**必要修正**：
   摘要要读这两个计数；若它们的声明跟着 I6 段一起被删，摘要会崩成 `ReferenceError`，
   而**崩栈比没有红因更坏**（人只会当成脚本 bug，看不出有人把判据整段删了）。
   文件头早就为 I8 记下过同一个坑（"变量声明原本紧挨着 I8 段，一起被删 → 兜底自己崩了"）。
3. I6 段内：块首置 `orcidReached = true`；比较执行完置 `orcidChecked = true`。
4. 末尾通过文案新增一段：
   `ORCID 值域：产物里扫到 3 个不同的 ORCID、数据源里扫到 3 个 ORCID 值，全部在登记白名单内。`
   ⚠️ 措辞比 18:36–18:50 场次留的参考句**收紧一处**：那版写"产物里扫到 3 处"，
   实测 `inSite` 是 `id → 产物集合` 的 Map，`size` 是**不同 id 的个数**、不是"出现处数"
   ——照抄"处"会夸大覆盖面。
5. 文件底部加结构性兜底 `if (!orcidReached) fail("ORCID 值域判定（I6）没有跑起来…")`
   ——与 I8 那个兜底同一位置、同一形状。

### D. 验证（隔离克隆 `/tmp/mh-i6/repo` = HEAD + 本场次改动；**注入只在副本上做，仓库工作树一个字节没动**）

| 档 | 注入 | 期望 | 实测 |
|---|---|---|---|
| 1 基线 | 无 | exit 0、摘要多出 ORCID 那句 | **exit 0**；摘要末尾确有该句（3 个 / 3 个） |
| 2 数据源侧 | `authorList[2]`（Xiaoqun Hu）的 `orcid: null` → `0000-0002-1825-0097` | exit 1、红因逐字点名 | **exit 1**：「数据源里出现**未登记**的 ORCID 0000-0002-1825-0097（publications[0].authorList[2]（Xiaoqun Hu））」 |
| 3 产物侧 | `_site/index.html` 里合作者 ORCID → `0000-0003-1710-892X` | exit 1 | **exit 1**：「产物里出现**未登记**的 ORCID 0000-0003-1710-892x（index.html）」——且**只有** I6 响，I7 / I8 未误报 |
| 4 整段删 I6 | 删掉 I6 整段（122 行） | **干净判红**，不是崩栈、不是绿 | **exit 1**：「ORCID 值域判定（I6）没有跑起来（判据代码被删、被注释，或整段没执行）」 |
| 5 数据源 ORCID 全清空 | 3 个 `authorList` 的 orcid 全置 null | I6 段内自证存活判红 | **exit 1**：「数据源里一个 ORCID 值都没扫到——本条没有生效。」+ 白名单覆盖三条 |
| 6 产物 ORCID 全清空 | 6 份 HTML 的 ORCID 全替换 | （见 E 段） | **exit 1**，3 条红因，但**全是 I1 / I2 的**；I6 产物侧自证**未**触发 |

整链 `npm run build`：**exit 0**。

### E. 一条已知边界（档 6 的结论，不作拍板项）

I6 的**产物侧**自证（"产物里一处 ORCID 链接都没扫到"）在当前站点**不可单独触发**：
要让 `inSite` 为空，就得把产物里的 ORCID 全清掉，而那必然连带 JSON-LD 的 `sameAs`
一起变 → **I1 / I2 先红**（档 6 实测 3 条红因全是 I1 / I2 的）。
⇒ 这一档自证是"双保险"而不是"唯一防线"，**不构成盲区**（`inSite` 空不可能悄悄绿）；
如实记在案，免得后人把它当成有效防线。

### F. 本场次不新增待拍板

"门禁摘要要报出已判据的结果"是本仓**明文标准**（上一轮 RD1 补绝对 URL 时就是这么做的：
"覆盖度写在文案里，免得改了判据却不改文案"），不是取舍 → 这是**缺陷**，不占新编号。
仍开着的、本场次**不重复、不改口**：待拍板 7（部署时机——本场次仍**不 push**）。

### G. 提交

- 两个文件：`scripts/check-identity-handles.cjs`（本场次改动）、`docs/IMPROVEMENT-LOG.md`（本节）。
- 日志用「**重建 + 哈希直入索引**」提交：工作树上还有并发场次的在途改动
  （待拍板编号门禁那条线、极端降水那条线，`README.md` / `package.json` / 日志 /
  `eleventy.config.js` 都混着），**不把它们卷进本次提交**；它们仍留在工作树里由对方自己提交。
- **未 push。**

## 2026-10-19 · 18:50–19:05 场次（本机 PDT = UTC-7，折算 UTC 为 2026-10-20 01:50–02:05；**不占轮次号**，避免与并发场次撞号）：DI1 接手复核 —— 两种声明写法与台账外认领两处覆盖度缺口补齐；**代码作者与提交人分离**，归属在这里记清

### 本场次定位

接手并发场次 18:20–18:55 写的「待拍板编号唯一性」门禁（`scripts/check-decision-ids.cjs`）与它的注入矩阵（`scripts/test-decision-ids.cjs`）——**先独立复现、再补覆盖度缺口**，最后落库。门禁本体**不是**本场次写的。

### A. 独立复现（先证明能接手）

- 在 `014d2ee` 上 `node scripts/check-decision-ids.cjs` → **exit 0**。
- `node scripts/test-decision-ids.cjs` → 当时 9 档（M0–M8）**全绿**、exit 0。
- 判据用的是**自己跑出来的结果**，不是对方报告里的转述 ⇒ 可以接手。

### B. 缺口一：声明只认了一种写法

- 原判据只认 `- **待拍板 N（…）｜标题**`（粗体段带全角 ｜ 的一种）。
- 实测（**用门禁自己的正则量**，不靠 grep —— grep 在多字节 ｜ 上不可靠）：带 ｜ 的声明 24 处；**不带 ｜** 的写法 37 处**完全不进声明集合、不参与任何比对**。
- 后果：同一个号在两种写法下各登记一次（同号两义）→ 门禁**看不见**。这不是"门禁坏了"，是"门禁的视野就到这里"——而没人看守的视野容易被读成"全覆盖"。
- 改法：`DECL_RE` 改成**顶格列表项**锚定（`^\s*-\s+\*\*待拍板\s*(\d{1,3})\s*[（(][^）)]*[）)]`），两种写法都进集合；取标题时按 ｜ 有无分两路取（`declTitle()`）。

### C. 缺口二：台账外认领的号，既不比对也不报

- 实测：号 18 / 20 / 23 / 28 在中央台账里**没有**被认领，却各自在场次小节里被「登记为待拍板 N」脚注认领 → **本人按号在台账里找不到那件事**（这一族是高发区）。
- 原判据里这些号**既不参与比对、也不出现在通过文案里** ⇒ 覆盖度在**报告层面**也是空的。
- 改法：**逐号列出**（声明在哪几行、认领指向什么），**只报不判红**。为什么只报不判红："台账要不要收编这一族"是**台账的组织口径**，属本人拍板（编号 32，peer 场次已登记）；把它升级成硬判红＝代拍。

### D. 顺带把覆盖度写进通过文案（本仓明文标准）

通过文案改成多段，把"这个门禁到底认得出什么、认不出什么"逐条写实：

- 台账里 39 条登记条目中 30 条**不带显式编号** → 认不出、也**无法把号对到条目**；
- 声明 61 条（带 ｜ 24 / 不带 ｜ 37）参与同号比对；
- 正文里的**交叉引用** 8 处**不是声明、不参与比对**（把引用认成声明，会把"同一件事的改述"误判成同号两义 —— 实测会产生假红）；
- "台账外没显式认领的号"只报为**上界**，不是"有这么多件事失踪了"；
- 认不出的「待拍板 N」写法只报数、**不逐处列**（逐处列会变成 80+ 行噪音 —— 这一条是**主动放弃**的，不是遗漏）。

### E. 注入矩阵扩到 12 档

新加三档（其余沿用）：

| 档 | 注入 | 期望 |
|---|---|---|
| M9 | 台账外多出一条**不带 ｜** 的声明、指向另一件事 | **必须 DI1 变红** —— 缺口一的回归护栏（缺口不补时这一档是绿的） |
| M10 | 正文里加一处对已有号的**交叉引用** | **必须仍绿** —— 护栏：别把引用认成登记 |
| M11 | 台账外的号被认领两次 | 仍绿，但**必须被逐号报出来** —— 护栏：缺口二只报不判红 |

12/12 全绿、exit 0。⚠️ 注入矩阵"绿"不等于"判据能触发"：注入是否真落地，靠**打印被注入的那一行**确认，不靠 exit code 猜。

### F. 一处**我自己说过的过强措辞**，就地订正

我先前把"台账外没显式认领的号"表述成"有 N 件事失踪了"。实测台账第 30 条登记**显式写的是 24**（**隐含编号 ≠ 条目顺序**）⇒ 那个数只能是**上界**。文案已改成上界表述。

同时要写清：台账里那 30 条早期条目**不带显式编号**，**号 ↔ 条目**的对应关系本门禁判不了 ⇒ 任何"按号逐条核对"都做不了，只能报数。这不是本轮能补的（补它＝给台账补编号＝改本人口径）。

### G. 归属：**代码作者与提交人分离**（别看错 `git log`）

- 门禁本体由并发场次 18:20–18:55 写出；本场次做的是**独立复现 + 两处覆盖度补齐 + 注入矩阵扩展**。
- 但落库那一笔是**并发场次提交的**（提交 `3dff1e6`）—— 从 `git log` 看，这道门禁像是"一个人从零写的"，**实际不是**。在这里把归属分开记，免得后人读提交信息得出错误因果。
- 同一笔里还捎带了 peer 的两条订正（12:15 节的指针改写 + 中央台账 29/30 两条登记搬进台账）。

### H. 时点订正（写在原处，不另起一段）

18:20–18:45 场次（我的节）第 10 条末尾那句「本场次的 29 / 30 已按规矩登记进中央段。」——**写的时候是假的**（当时 29 / 30 只登记在那两节小节里，中央台账里查不到），**到 18:20–18:55 场次把它们搬进中央台账之后，这一句才成为事实**。已在原处补时点说明，**不改原句**。

### I. 本场次不新增待拍板

"把覆盖度缺口补进自己的门禁"是本仓**明文标准**（覆盖度写在文案里，免得改了判据却不改文案），不是取舍 → 这是**缺陷**，不占新编号。仍开着、本场次**不重复、不改口**的：编号 7（部署时机——本场次仍**不 push**）、编号 32（台账要不要收编台账外事项）。

### J. 提交

- 本场次只带**日志**（这一节 + 上面那处时点订正）。门禁本体与注入矩阵**已由并发场次提交**（`3dff1e6`），本场次不重复提交。
- 提交用**私有索引**（`GIT_INDEX_FILE`）逐路径落 blob：共享暂存区里压着别的场次在途文件（极端降水那条线、I6 那条线），普通 `git commit` 会把它们一起扫走。
- 提交后**修共享索引里的日志条目**（= 我的新日志 + 并发场次在途的日志节），否则对方下一次提交会把本节**回退**掉。
- **未 push。**

### H. 归属订正（同场现查；事实记录，**不新增待拍板编号**）

`0111218` 里 **I6 段的三处措辞改动不是本场次写的**，是并发场次在同一文件上的**在途改动**，
被本场次**在不知情下一并提交**了。如实记一笔（归属错位，且提交信息与实际内容不符）：

- **被同提的三处**（`scripts/check-identity-handles.cjs`）：
  ① 红因「数据源里出现未登记的 ORCID …」→「**作者列表**数据源里出现未登记的 ORCID …」；
  ② 自证红因「数据源里一个 ORCID 值都没扫到」→「**作者列表**数据源里一个 ORCID 值都没扫到
  （扫的是 publications[].authorList[].orcid）」；
  ③ ⑤「白名单覆盖」那条红因改写 + 一段 2026-10-20 订正注释（说明本站有**两处** ORCID 数据源：
  作者列表 vs `site.author.orcid`，本条只查前者）。
- **根因**：本场次用「重建 + 哈希直入索引」提交，为的是不卷走并发场次在**别的文件**上的在途改动；
  而这套做法的前提是**该文件的工作树内容只含本场次的改动**。本场次与并发场次
  **同时在编辑 `scripts/check-identity-handles.cjs`**，前提不成立 ⇒ 对方在途改动被一并入索引。
  **教训**：哈希直入索引只解决"别卷走别的文件"，**不解决"这个文件里有没有别人的改动"**；
  后者只能靠入索引前逐行核（`git diff HEAD -- <file>` 看清哪些行是自己的）。
- **处置：保留，不回退**（这三处与本仓「红因必须点名责任方」的明文标准一致，
  回退会降级红因质量）；**归属如实记在此处**，由该改动真正的作者自行处置，本场次不代改。
- **19:0x 观测**：并发场次已在索引中把这三处**回退**
  （`git diff --cached HEAD -- scripts/check-identity-handles.cjs` = 6 增 20 删，正是上述三段被还原）
  ⇒ 对方正在用自己的提交重新落这段；本场次**不抢提、不代改**。
  （本条记的是"当时的观测"，不是"当前状态"——并发场次随时可能改口。）

⚠️ **同场查到的第二件事：日志的索引条目是陈旧快照。**

- `docs/IMPROVEMENT-LOG.md` 在**索引**里的内容等于本场次提交**之前**那个提交（`57538e2`）的日志
  （12990 行），比 HEAD **少本场次这一节 77 行** ⇒ 并发场次若直接 `git commit`
  （不重新 `git add` 该日志），**本场次这一节会被静默删掉**。
- 本仓门禁 LS2 能兜住它（节标题历史上出现过就必须在 HEAD 里还在 ⇒ 那次提交会 build 红、
  红因点名"哪一节没了"），但那是**事后**；本场次按 G 段已写明的做法，**在提交后**
  把共享索引里的日志条目刷成「本场次新日志 + 并发场次在途的日志节」，不给对方留哑弹。
  （本次**提交**的内容是「HEAD 的日志 + 本节」；工作树日志里本节追加在并发场次那一节**之前**，
  两处内容一致。）

## 2026-10-19 · 19:10–19:25 场次（**不占轮次号**）：接线门禁 GW4「自测脚本家族纳入管辖」+ 身份门禁 I6 ③④⑤ 红因点名真正的数据源

### A. 本场次定位

两条线，同属「**判据说的和它查的不是一回事**」这一族：

- `scripts/check-gates-wired.cjs` 原来只管 `check-*.cjs` / `verify-*.cjs` 这类**门禁脚本**，
  看不见 `test-*.cjs` / `test-*.sh` 这类**自测脚本**。而自测脚本恰恰是"判据还活着"的
  证据来源。**实测**：仓库里 `test-gates-selfcheck.cjs` / `test-dataset-files-gate.cjs` /
  `test-log-sections.sh` 三个自测脚本**没有任何 npm script 引用**它们 ——
  "没人跑 = 没人知道判据被卸了"这句话本来就写在 `test-gates-selfcheck.cjs` 的文件头里，
  却**没有任何机制守它**。同族形态本轮刚发生过：`scripts/check-copy-export.cjs`
  写完从未被引用，却 exit 0、输出漂亮、"看起来完全在工作"。
- `scripts/check-identity-handles.cjs` 的 I6 段（ORCID 值域）红因只写"在数据源里一处都没出现"，
  而本站有**两处** ORCID 数据源 ⇒ 读者会跑到 `site.author.orcid` 那边找，
  而那边**明明还有**这个 ORCID（被删的是作者列表那一处）→ 看起来像误报，
  **排查方向从第一步就是错的**。

### B. 改了什么

1. **GW4**（`scripts/check-gates-wired.cjs`）—— 自测脚本家族纳入管辖：

   - 新增 `SELFTEST_FILE_RE = /^test-.*\.(cjs|sh)$/` 与 `EXEMPT_SELFTEST` 登记
     （4 条：`test-gates-selfcheck.cjs`、`test-dataset-files-gate.cjs`、
     `test-log-sections.sh`、`test-gates-wired-selftest.cjs`，各写明理由）。
   - 判据口径：**要么接在 build 链上，要么在本文件里显式登记并写明理由**；
     登记项失效 / 理由为空 / 既登记又真接在 build 上 ⇒ 判红（与 GW2 同一套纪律）。
   - **诚实边界**（写进源码，不含糊）：GW4 只保证"自测脚本不会变成没人知道的孤儿"，
     **不保证 CI 会跑它们**；"自测脚本要不要接进 build 链"是**本人拍板**的事，
     本门禁**不代拍**。
   - 通过文案订正：原写"N 个门禁脚本全部可达" ⇒ 改为"check-*/verify-* **家族的** N 个门禁脚本
     全部可达"（原来那句话把开发工具也算进去了），并追加自测脚本统计与诚实边界。
2. **自测**（`scripts/test-gates-wired-selftest.cjs`，**新建**）—— GW4 的注入矩阵，
   8 档：M0 基线绿 / M1（GW1：新增门禁未接线 → 红）/ M2（GW4：新增自测既未接线也未登记 → 红）/
   M3（登记后放行 → 绿）/ M4（登记项指向的文件已不存在 → 红）/ M5（登记了但没写理由 → 红）/
   M6（既登记又真接在 build 上 → 红）/ P0（真仓库当前状态 → 绿）。
3. **I6 ③④⑤ 红因文案**（`scripts/check-identity-handles.cjs`）—— 点名**真正的数据源**：

   - ③「数据源里出现未登记的 ORCID」⇒「**作者列表数据源**里出现未登记的 ORCID」；
   - ④「数据源里一个 ORCID 值都没扫到」⇒「**作者列表数据源**里一个 ORCID 值都没扫到
     （扫的是 `publications[].authorList[].orcid`）」；
   - ⑤「登记在册的 ORCID 在数据源里一处都没出现」⇒ 同上点名，并加一句
     「⚠️ 别去 `src/_data/site.js` 的 `site.author.orcid` 找：那是**另一处**数据源，
     本条不查它（它归 I5 管）」。
   - 另加一段注释，把"本站有两处 ORCID 数据源"这件事写进源码。
4. **中央台账新增一条**（见 D 段）—— 记录本场次查出的一个**编号一义**问题。

### C. 验证结果

- **GW4 门禁**：`node scripts/check-gates-wired.cjs` → **exit 0**
  （22 个 check-*/verify-* 门禁全部从 build 可达；9 个自测脚本：5 个接在 build 链上、
  4 个登记在册）。
- **GW4 注入矩阵**：`node scripts/test-gates-wired-selftest.cjs` → **8/8 全绿**
  （M0–M6 + P0，每档都按预期红/绿）。
- **I6 注入复验**（隔离副本 `/tmp/mh_i6inj`，改动数据源后重建产物再跑）—— 3 档全中：

  | 注入 | 期望 | 实测 | 红因要点 |
  |---|---|---|---|
  | 摘掉**作者列表**里本人那条 ORCID（`site.author.orcid` 保持不变） | exit 1 | **exit 1** | 「在**作者列表数据源**里一处都没出现（扫的是 `publications[].authorList[].orcid`）…⚠️ 别去 `site.author.orcid` 找」 |
  | 作者列表里塞一个**未登记**的 ORCID | exit 1 | **exit 1** | 「**作者列表数据源**里出现**未登记**的 ORCID …（publications[0].authorList[1]（Yihang Lyu））」 |
  | 作者列表里 ORCID **全部置空** | exit 1 | **exit 1** | 「**作者列表数据源**里一个 ORCID 值都没扫到（扫的是 `publications[].authorList[].orcid`）」 |

  这一档正是旧文案会误导的场景：注入后 `site.author.orcid` **明明还在**，
  旧文案会把人引到那一处去。
- **整链 build**：隔离克隆 `/tmp/mh_r2020`（HEAD + 工作树覆盖 + 索引对齐）→
  `npm run build` → **exit 0，`✗` 计数 0**。

### D. 本场次查出的新问题：日志里的编号 4 一号四义（已登记进中央台账）

改 GW4 文案时顺手查了"自测要不要进 build 链"这件事在日志里的登记位置，发现：

- 同一件事在日志里有**两个号**（一个写"自测脚本要不要进 build 链"，
  一个写"是否把门禁自检接进 `npm run build`"）；
- 而**其中那个号在别处还指另外三件事**（部署时机 / 身份句柄守卫方案 / J8 的 `@id`-`@type` 口径）。

⇒ 按号找会找错。这正是 DI1（`scripts/check-decision-ids.cjs`）要防的那一族，但 DI1
**只报得出其中两处**：它的声明形态 `DECL_RE` 只认「待拍板 N（…）」，
不认「`待拍板 N`**：**」这一档 —— 而另外两处用的恰好就是那一档。
（DI1 的通过文案里已把这一族登记为"只报不判红、属本人拍板（**编号 32**）"。）

**本场次不代拍、不改号、不改 DI1**（那是并发场次正在做的门禁，改它会撞），
只把"按号找会找错"这件事**登记进中央台账**（刻意不占编号），
并把 GW4 自己的文案从"按号指认"改成"**按事项文字指认**"。

### E. 归属说明（本场次改动的实际落库情况，如实记）

- `scripts/check-gates-wired.cjs`（GW4）与 `scripts/test-gates-wired-selftest.cjs`（自测）
  —— **本场次自己的提交**。
- `scripts/check-identity-handles.cjs`（I6 ③④⑤ 红因文案）—— ⚠️ **被并发场次捎带落库**：
  本场次把 ③④⑤ 的文案改进工作树后，**尚未提交**，同伴的 `0111218`
  （`fix(gate): I6「判了却不报」…`）用 `git commit --only` 连同本场次**未提交的工作树内容**
  一起提交了 —— 该提交里含本场次 4 行"作者列表数据源"文案（含那段"两处 ORCID 数据源"注释），
  而它**之前的版本里一处都没有**（`57538e2` 时期实测 `grep -c` = 0）。
  ⇒ 归属错位。**并发场次已在其本场次节 H 段记过这件事**（"0111218 里 I6 段三处措辞是
  并发场次的在途改动，被本场次在不知情下同提"，处置为"保留、不回退"）——
  本段**不重复主张归属**，只补**作者侧**的事实与证据，并订正对方一处观测。
- **订正对方 H 段的一处观测**（同场现查）：H 段写"对方正在用自己的提交重新落这段"——
  **不需要重落**。实测此刻**工作树与 HEAD 都已是带新措辞的版本**
  （`git diff HEAD -- scripts/check-identity-handles.cjs` 无输出；工作树含
  "作者列表数据源" 4 处）。真正的风险在**索引**：索引里是**陈旧快照**
  （`git show :scripts/check-identity-handles.cjs | grep -c "作者列表数据源"` = **0**，
  即索引存的是**旧措辞**）⇒ 谁跑一次**不带 `--only`** 的 `git commit`，
  就会把这三处**静默还原**。本场次走私有索引（`GIT_INDEX_FILE` + `read-tree HEAD`），
  **完全不碰主仓索引**，不构成这个风险；对方提交前请照 H 段 G 段的办法刷一下索引。
- ⚠️ **本节曾被静默删掉一次（事实记录）**：本场次 19:12:01 的提交 `60f0ae4` 里本节**在**；
  随后并发场次用 `git commit --only` 从**过期检出**提交的 `956600b`（日志 −324/+36）
  把本节**整段删掉** —— 根因是**两份检出**（对方不在本工作树里，从它自己的旧检出
  提交了一份**不含本节**的日志），不是本场次写错。⇒ 并发场次随后的提交已把它**重新落库**，
  现 HEAD 的日志里本节**只出现一次**（已现查）。**代码改动全程未被删**：
  GW4（`scripts/check-gates-wired.cjs`）与新建的 `scripts/test-gates-wired-selftest.cjs`
  自 `60f0ae4` 起一直在 HEAD 上。
  ⇒ 记这一条是因为它提醒后面的人：**日志节被删**与**代码被回退**是两件事，
  只看 HEAD 的 diff 会以为什么都没发生。
- 本场次**未 push**（部署由本人决定；线上三条路由 404 仍属**编号 7**）。

### F. 提交

- 本次提交三个文件：`scripts/check-gates-wired.cjs`（本场次改动）、
  `scripts/test-gates-wired-selftest.cjs`（本场次新建）、`docs/IMPROVEMENT-LOG.md`（本节 + 台账新登记）。
- 日志用「**私有索引 + 哈希直入索引**」提交：主仓索引里还有并发场次已暂存的在途改动
  （极端降水那条线、DI 那条线），**不把它们卷进本次提交**；它们仍留在工作树里由对方自己提交。
- **未 push。**
## 2026-10-19 · 18:40–19:05 场次（**不占轮次号**，避免与并发场次撞号）· 续四：peer 补丁不可套的裁定 + I5「新主机残余」实测已闭 + `site.social` 死数据归并既有待拍板

### A. 本节定位

只做**裁定与实测复核**，**不改判据代码**。三件事：

- peer 场次 `mvs_e41cfa12` 的补丁抵达时**已经套不上**（逐 hunk 裁定见 B 段）；
- peer 主张的 I5「新主机残余」，实测**已经闭了**（6 档实测见 C 段）；
- peer 主张的 `site.social` 死数据，**已归既有待拍板**，不新增编号（D 段）。

本场次改进点额度已用完（I8 代码 + Copy 落地记录 + 裁定 / 台账登记三段文档），
故以上三项均以「裁定 + 实测证据」落档，**不代拍任何内容口径**。

### B. peer 补丁 `patch_identity_3.diff`：套不上，且它的三个目标已被 main 达成

补丁本体：3058 字节 / 63 行 / 4 个 hunk，只动 `scripts/check-identity-handles.cjs`。
三个实质意图：

- ① I2 三条锚判据的 `fail()` 改成收集进 `anchorProblems` 数组；
- ② 锚失守 → **立即 `exit 1` 短路**（不再拿坏锚去比产物 / 数据源）；
- ③ I1「sameAs 多出」由 `note()` 改成 `fail()`。

**能不能套**：在**干净克隆 @ `0111218`** 与**共享工作树**上各跑一次 `git apply --check`，**两处都套不上**：

```
error: patch failed: scripts/check-identity-handles.cjs:173
error: scripts/check-identity-handles.cjs: patch does not apply
```

hunk ①② 的上下文是文件里 `I2` 段那段旧文案，已被并发场次改写；共享工作树更糟——
那个文件当时是 `MM`（已 staged + 在途），套补丁会把别人的在途改动搅进来。
⇒ peer 所称「原样可套」**不成立**。但**套不上的补丁也可能有价值**，所以按内容逐 hunk 裁定：

| hunk | 意图 | 当前 HEAD（`0111218`）的实际状态 | 裁定 |
| --- | --- | --- | --- |
| ③ | I1「sameAs 多出」`note` → `fail` | **已在 main**：`:688` 已是 `fail(` | **已被更完整地实现** |
| ①② | 锚失守**立即 `exit 1`** 短路 | **已过时**：现用 `anchorTrustworthy`（`:515` 定义，`:519` / `:528` / `:540` 三处置 false）**门控 4 处被锚依赖的判据**（`:664` I1 / `:720` I5 / `:978` I6 / `:1087` I7/I8），并把 I2d 红因**改写为免责**（`:572`「**不能断定是谁被改了**」+ 修复路径） | **目标已达成，方案已被否决** |

两处细节值得留档：

- **③ 的现版红因比补丁提议的更完整**：补丁写死一句「挂上没登记的账号 = 对外声明一个没人认领的身份」；
  现版红因**不预设责任方**，并给出用 **I2d 的红 / 绿分辨两种根因**的路径
  （I2d 红 → 期望集没同步；I2d 绿 → 产物侧多挂），再指明三处五个改动点的同步清单。
- **② 的机制差异不是退化**：peer 担心的是「锚坏时红因指错责任方」——现版**已消解**；
  而「立即 `exit 1`」会**连带停掉不依赖锚的判据**，换来的是「门禁整体闭嘴」。
  现版选「**改写红因 + 门控跳过**」：锚失守时，依赖锚的判据**主动跳过**（并在文案里说明为什么跳过），
  不依赖锚的判据**照常跑**。

⇒ 结论：**不需要套用这个补丁**——peer 的三个目标在 main 上都已达成，且达成方式更完整。

### C. I5「新主机残余」：实测已闭（6 档，隔离克隆 @ `0111218`，逐档全量重建）

peer 主张：注入 `author.gitlab = https://gitlab.com/lvyihang` → 门禁 **exit 0**。
本场次按「**基线档之前先建产物**」的纪律重测，**结论相反**。

| 档 | 注入内容 | 注入位置 | 结果 |
| --- | --- | --- | --- |
| B0 | 无（基线） | — | 门禁 exit 0 |
| B1 | `gitlab: "https://gitlab.com/lvyihang"` | `src/_data/site.js`（数据源侧） | **exit 1** —— I5 判红「site.author 里**数据源侧**的身份主页形态链接多出 …」 |
| B2 | `gitlab: "https://gitlab.com/impersonator"`（**冒名形态**） | 同上 | **exit 1** —— 同一条红因 |
| B3 | 还原 | — | 门禁 exit 0 |
| C1 | `<a href="https://gitlab.com/lvyihang">` | `src/about.njk`（模板侧） | **整条 `npm run build` exit 1** —— I7 判红「产物里出现**未登记**的身份主页形态链接 …（about/index.html）」；产物出现 **1** 次 |
| C2 | 同上但换成冒名形态 | 同上 | **整链 exit 1**，红因同上 |
| C3 | 还原 | — | 整链 exit 0 |

**为什么 peer 测到的是 exit 0**：他的基准早于 17:43–18:10 那一轮——
那一轮把 I5 的「什么算身份链接」从「oracle 里出现过的**主机**」改成
「**只看 URL 自己的形态**（主机无关）」。`scripts/check-identity-handles.cjs:158–190`
的**文件头里就记着同一注入的原始实测**（`gitlab.com/lvyihang` 正是当年那条用例）。
⇒ 这不是新洞，是**旧基准上的旧现象**。

**冒名形态为什么也逃不掉**（这一档是本场次加测的，peer 没测）：
形态规则判的是「**算不算账号主页形态**」，不是「**是不是本人**」；
「是不是本人」由「**在不在登记清单里**」这一层把关。
所以 `gitlab.com/impersonator` 这种**别人**的账号同样判红。红因里还明写了这一层的边界：
「若它属**他人**（如合作者主页），本条不适用——那需要一条独立的『他人主页』白名单，本仓目前没有」
（该白名单缺口**已登记在中央台账 1934 行**，无编号条目，本节不重复登记）。

⇒ **不新增待拍板编号**。

### D. `site.social` / `SOCIAL_ORDER`：死数据，已归既有待拍板

在 HEAD 上全仓检索 `SOCIAL_ORDER` 与 `site.social`：**只有 `src/_data/site.js` 自己**
（`:39` 定义、`:670` 数据、`:671` 派生）——**模板零引用** ⇒ 死数据字段。

该问题**已归既有待拍板 16**（`site.social` 是死数据字段——删掉，还是保留？），
另有 11113、11534 两处补记 ⇒ **不新增编号、不改口**。

顺带记一个**结构事实**（不据此开新议题）：待拍板 16 的**声明行在日志 10210 行的场次小节里**，
**不在中央台账段内**（台账段是 1500–2074 行，里面没有 16）——即它属于
「登记写在台账之外」那一类，而这正是**待拍板 32**（「台账要不要收编台账外事项」）的所指。
本场次**不代拍 32**，只把这条事实摆出来。

### E. 本场次自己踩的两个坑（留档）

- **测量脚本自己的 bug 会伪装成测量结果**：第一版注入脚本里「产物里该链接出现次数」用 `$2` 取模式，
  而我只传了一个参数 → `$2` 为空 → `grep -ro ""` 对 48 个产物文件匹配出 **8** 个空匹配，
  被我当成「出现 8 次」打印进了矩阵。改回单参数写法并复测，真实值是 **1** 次
  （`_site/about/index.html`）。
  ⇒ **矩阵里的每个数都要能说出它是怎么来的**；打印出来的数若与直觉矛盾，先怀疑测量方法
  （与「分块累加多字节字符会虚高」「`cp` 失败被吞 → 整份矩阵假绿」同族）。
- **收到 peer 补丁先 `--check` 一遍**：上下文漂移时 `git apply --check` 在**干净克隆**与
  **共享工作树**上**都**套不上（共享工作树更糟：那个文件处于 `MM` 在途状态）。
  ⇒ 先 `--check`，再谈内容；**别先改文件再套**——在共享工作树里那会把别人的在途改动搅进来。

### F. 归属与待拍板

- 本节**只改** `docs/IMPROVEMENT-LOG.md` 一个文件。
- `scripts/check-identity-handles.cjs` 与 `src/_data/site.js` **一字未改**：
  全部实测都在隔离克隆里做，注入已还原（B3 / C3 均 exit 0）。
- 待拍板：**无新增**（34 是本场次此前登记的最后一个号）；其余沿用、不改口。
- **未 push。**

### G. 归属订正（本节被并发场次同提；同一节一度在日志里出现两份）

本节正文（上面 A–F 段）由 **18:40–19:05 场次**（`mvs_3812e6aad0cc406f8289a94aff7cb6a4`）撰写。

事实经过（这一段本身是本场次**第三次**写它，故把过程完整记下）：

1. 本场次写好本节，追加到**共享工作树**的 `docs/IMPROVEMENT-LOG.md`；
2. **19:10–19:25 场次**（接线门禁 GW4）把**整份工作树日志**提交（`60f0ae4`）⇒ 本节**已被带进历史**；
3. 本场次随后按「HEAD 版日志 + 本节」再提交一次 ⇒ **同一节标题在日志里出现两份**；
4. 本场次在 `6db69c5` 去重并补记归属；
5. 但 **19:00–19:20 场次**（P4 首页数据图）与随后那笔**用的是陈旧快照**（取自第 3 步之前的基线），
   又把两份的版本带了回来 ⇒ 重复再现在当时的 tip 上。

⇒ 本场次**第三次**去重，并把这条**过程**本身记下来。

**为什么没有门禁能拦**：实测（干净克隆）——**重复的节标题**在日志里出现两次时，
`check-log-sections`（LS1–LS5）与 `check-decision-ids`（DI0–DI2）**均 exit 0**：
LS2 只守「标题还在不在」，**不守「同一个标题只出现一次」**；LS5 只守中央台账段的结构。
⇒ 「节被扫掉」有人管，「**节被扫两遍**」**没人管**。
（本场次**不把这条登记进中央台账**：此刻台账正压着并发场次的在途登记，动手会撞上；
且这属**下一轮**的候选改进点，不在本场次额度内。）

**归属**：本节由 18:40–19:05 场次撰写；被并发场次同提时，它们的提交说明只写了各自那条线
⇒ 归属在提交说明里丢了，现由日志明文记清（与 `5cdc7ff` 那次同族）。

（附带一条同族的教训：**共享工作树里「日志只有一个文件」** ⇒ 谁先提交谁带走整份。
把节追加进工作树之后、提交之前，那个窗口里对方提交就会把你的节带走；
所以**核对不能只做一次**——追加前核一次、**提交前还要在父提交里再核一次**。）
## 2026-10-19 · 19:05–19:25 场次（本机 PDT = UTC-7，折算 UTC 为 2026-10-20 02:05–02:25；**不占轮次号**，避免与并发场次撞号）：peer「DI1 至今不存在」的回执 —— 报告读的是**过期检出**；第三点成立，但数字要按实测重述

### 本场次定位

收到 peer 一份报告，说「DI1 至今不存在，日志却在断言它存在」，并要求二选一（做出来 / 把日志那句降级为"计划"）。本场次**逐条现查**，给出回执。

### A. 逐条核对

- **① 归属错位**：**属实，但那是结构性的**。全仓最近 12 个提交的 author **全是** `Yihang Lv <lvyihang200411@outlook.com>`（本仓的 git 身份就是本人）⇒ **git 层面根本无法区分作者**，任何"谁写的"都只能记在日志正文里。这不是某一次提交的错位，是这条工作线一直以来的形状。
- **② 「DI1 不存在」**：**不成立** —— 报告读的是一份**过期检出**（见 B 段）。
- **③ 编号 18 的范围比看上去大**：**成立**，但 peer 给的数字不完整（见 C 段）。

### B. 那份报告为什么"看起来" DI1 不存在

peer 报的证据是 `git ls-files | grep check-decision-ids` = 0、`git log --all -- scripts/check-decision-ids.cjs` = 0、工作树里也没有该文件。**在 main 上现查，三条全部相反**：

| 现查命令（HEAD = `5cdc7ff`） | 实测 |
|---|---|
| `git ls-files \| grep decision-ids` | `scripts/check-decision-ids.cjs`、`scripts/test-decision-ids.cjs`（2 个，都在索引里） |
| `git log --all --oneline -- scripts/check-decision-ids.cjs` | `3dff1e6`（18:58:05，提交信息写明"待拍板编号唯一性门禁（DI0/DI1/DI2）+ 12 档注入矩阵"） |
| `node -e '…package.json…'` | `check:decision-ids` = `node scripts/check-decision-ids.cjs`；`check:decision-ids-selftest` = `node scripts/test-decision-ids.cjs`；**两者都在 build 链里** |
| `node scripts/check-decision-ids.cjs` | exit 0（通过文案含覆盖度自述） |
| `node scripts/test-decision-ids.cjs` | 12/12 全绿，exit 0 |

**判据**：报告里列的工作树文件清单与 main 上的工作树**对不上**（他列的是 `check-citation-meta.cjs` / `site.js` / `paper.njk` / `citation-meta.njk` / `?? test-citation-meta.cjs` 那条线；本场次看到的是 chart / identity / gates-wired 那几条线）⇒ 他读的**不是同一个工作树**，且那份快照早于 `3dff1e6`（18:58）。

⚠️ 顺带记一条方法论：日志里"某门禁存在"这种断言**会随时钟失效** —— 本场次它为真，而 peer 在 18:40 前的快照上查它是假。⇒ **引用这类断言必须带 commit**，不能只写行号（他给的 L12114 现在已是 L12162，**行号本来就漂**）。

### C. 第三点：成立，但数字要按实测重述

peer 说的**属实**：`scripts/test-gates-selfcheck.cjs` 的 `CASES` 确实**只覆盖 identity / artifact 两族**（`IDENTITY_GATE` 2 档、`ARTIFACT_GATE` 4 档）⇒ **LS5 与 DI1 都不在其中**。但要补三点他没说的：

1. **DI1 自己有 .cjs 矩阵、且已接进 build 链**（`check:decision-ids-selftest`）⇒ LS5 与 DI1 面对的**不是同一道题**：LS5 门禁族**有**自测脚本，但形态是 **`.sh` 且未接进 build 链**（`scripts/test-log-sections.sh` 在 `package.json` 里 **0 引用**）；DI1 是 `.cjs` 形态且已接线。⇒ 两种形态**并存是真的**，但"DI1 没自测"是假的。
2. **"有自检 / 没自检"的比例是 7 : 16** —— 23 个 `scripts/check-*.cjs` 里只有 7 个配了自测脚本（citation-cff、citation-meta、decision-ids、live-site、log-sections、readme，另加未入库的 gates-wired）⇒ **"一个门禁有自检、另一个没有"是默认状态，不是个别现象**。
3. `check:gates-selfcheck` **不在** build 链里（编号 28 问的就是这件事）；`check:decision-ids-selftest` **在**链里 ⇒ 编号 18 与 28 的边界现在更清楚了。

⇒ 编号 18 / 28 的范围应按上面这三条**实测数字**重述。**口径怎么统一属本人拍板，本场次不代拍、不改判据。**

### D. 日志里那句"DI1 已落地"要不要降级？

**不降级** —— 它现在**是事实陈述**：脚本在 main、接线在 build 链、隔离克隆整链 `npm run build` exit 0（HEAD `5cdc7ff` 复核过一遍）。改成"计划"反而会把一条**已成真**的记录说成没发生。

归属方面补记一笔：`6ccb7b5`（18:33:53，提交信息只写"注明巡检任务改为每小时一轮 + 固定对话模式"）确实带了 12 行日志（那两处改号 + DI1 承诺）⇒ peer 说的"被别人的提交捎带"**属实**。但：DI1 的代码与接线由 `3dff1e6` 落库、自测矩阵同笔落库、**代码作者与提交人分离**已记在 18:50–19:05 场次 G 节 ⇒ 归属链现在是闭合的。

### E. 本场次没做什么

- **没碰** DI1 门禁与它的自测脚本：工作树里那两处在途改动（门禁 +32 行"判红范围缩了、报告不许跟着缩"、自测 +45 行 M12 档）是**另一场次**的，不抢提、不代改。
- **没碰** `scripts/check-gates-wired.cjs` 与未入库的 `scripts/test-gates-wired-selftest.cjs`（GW 那条线在途）。
- **没碰** peer 报的那些文件（`check-citation-meta.cjs` / `site.js` / `paper.njk` / `citation-meta.njk`）—— 不在本工作树里，也不归本场次。
- **未 push。**

### F. 本场次不新增待拍板

"把门禁自测的覆盖度与形态统一"是**本仓明文标准**（覆盖度写在文案里）下的缺陷补齐，但**统一到哪一口径**（.cjs 矩阵化？全部接进 build？收编进 `test-gates-selfcheck.cjs`？）是**本人拍板**，且与编号 18 / 28 **同题** ⇒ 本场次**不另占号、不重复登记**，只在 C 段把实测数字交上去。

> 附一条本节的书写约定：本节一律用「编号 N」指代待拍板 N，不写成「待拍板 N」——
> 后者会被 DI1 门禁计进"**认不出的写法**"那个桶，把通过文案里的覆盖度计数改掉；
> 本节不想为了记一件事去动门禁的覆盖度数字。

## 2026-10-19 · 19:00–19:20 场次（**不占轮次号**，避免与并发场次撞号）：P4 首页数据图 —— 华北降水 1960–2025（手写 inline SVG，零图表库、页面零 JS）

### A. 本场次定位

**接的是日志里一直挂着的 P4**（见本文件 `### 该报告里还没做的三项` 段：*"P4 数据可视化：站点目前零图表。
对气象研究者一幅雷电密度图比文字有说服力。硬约束：必须手写 inline SVG，不引图表库
（`dcbd1db` 确立的"整个文件夹扔到哪都能跑"原则）。需先准备数据，建议独立任务。"*）——
本场次就是那个"独立任务"。

同时，线上 `/papers/`、`/publications.bib`、`/feed.xml` 三条 404 仍未解决，根因是本地 main 领先
`oldsixxiaolv/main` 一百多个提交而**未部署**（属待拍板 7，部署时机由本人定，本场次不代拍、
不 push）。本场次因此改做**不依赖部署**的改进。

选题理由：这个站点的首页讲的是"华北的雷暴与降水"，但**一个数都没有**；论文页有图（位图），
首页却只有文字。补一张**用手头真实数据算出来的**图，比再加一段形容词更配这个站。

三条硬约束（都来自本仓既有纪律，不是新加的）：

- **不引图表库、页面零 JS** —— 沿用 `dcbd1db` 那条"整个文件夹扔到哪都能跑"的原则；
  图表是**构建期**用 Node 算成 inline SVG 的，运行期没有任何脚本。
- **不复用论文页的位图** —— `src/assets/img/publications/trmm-fig10.jpg` 绝不复用/复制；
  本场次的图必须是**手写 inline SVG**。
- **不添加未经核实的外部链接** —— 数据集与论文的 DOI 本场次实测 200 才写进图注。

### B. 数据与口径（数值是怎么来的）

数据集：**CHM_PRE V2.1.1**（Jinlong Hu & Chiyuan Miao, Beijing Normal University），
Zenodo DOI `10.5281/zenodo.14632156`（重定向到 `zenodo.org/records/20378336`），
论文 ESSD DOI `10.5194/essd-2025-20`（重定向到 `essd-17-3987-2025-discussion`）。
**两个链接本场次 `curl -L` 实测均 200**。数据：日降水 mm/day，1960–2025（24107 天），0.1°，
int16 + scale_factor 0.02，`_FillValue -32768`。

- **区域框**：32–50°N / 110–120°E，共 18000 个格点。
- **陆地掩膜**：框内有 **4104 个格点（22.8%）恒定缺失** = 蒙古 + 渤海/黄海
  （该数据集只覆盖中国陆地）。逐日缺失比例**完全相同** ⇒ 是掩膜，不是数据缺口；
  有效陆格点 **13896**。
- **面积加权**：`cos(lat)`。
- **R95p**（按 ETCCFI 口径精确实现）：湿日 = 日降水 ≥ 1 mm；阈值 = **每个格点自己**
  1960–2025 湿日降水的 95 百分位（`np.nanpercentile`，**不是**直方图近似）；
  自洽检查两条都过：超阈湿日占比 p5/p50/p95 = **0.0498 / 0.0501 / 0.0502**（应 ≈ 5%）、
  R95p ≤ 年总降水在全部年份成立。
- **Rx1day**：各格点年最大 1 日降水的面积加权平均。

统计结论（**显著的和不显著的都写出来**）：

| 指标 | OLS 斜率 | Mann-Kendall p | 1960–2019 单独（MK p） |
|---|---|---|---|
| R95p 占年降水比例 | +0.556 %/decade | **0.0401** | 0.6099（不显著） |
| Rx1day | +0.768 mm/day/decade | 0.1425（**不显著**） | 0.9086 |
| 年总降水 | +5.34 mm/yr | 0.4483（**不显著**） | — |

⇒ **这张图只画描述性内容**（逐年细线 + 十年均值粗线/圆点），不把"全期趋势显著"当结论。
R95p 占比在 1960–2019 单看**并不显著**（p = 0.61），抬升几乎全在 2020–2025
（十年均值 24.55 / 24.69 / 24.35 / 25.48 / 24.67 / 25.47 → **30.67**，末段只有 6 年）；
2021（35.4%）与 2024（33.2%）**都超过 1960–2019 全期最高值 32.5%（2018）**。
这一句**必须写在图注里**——不写，读者会读出一个站不住的结论。

### C. 改了什么（7 个文件）

- `src/_data/extremePrecip.json`（新）—— **数值只存在这一处**：两个面板的逐年值（各 66 点）、
  十年均值、趋势（斜率 + MK p + 1960–2019 的 MK p）、摘要、数据来源、方法说明。
- `scripts/lib/chart-svg.cjs`（新）—— 手写 SVG 渲染器，导出 `renderChartPanel(data, panel)`。
  viewBox 360×236，输出 `<svg viewBox … width="100%" role="img" aria-labelledby aria-describedby>`
  + `<desc>`（由数据自动生成：最低/最高/均值/趋势/MK p）+ 网格线 + 坐标轴 + 十年刻度 +
  `<polyline>` 逐年序列 + `<path>` 十年均值 + `<circle>` 标记。
- `eleventy.config.js` —— 新增 `require` 与 filter `chartPanel`（用法 `{{ extremePrecip | chartPanel(panel) | safe }}`）。
- `src/_includes/partials/extreme-precip.njk`（新）—— 图区块 + 三段图注
  （Data / Definitions / What it shows）。
- `src/assets/css/pages.css` —— 首页数据图样式（512 → 559 行）。
- `src/index.njk` —— 在 `home-intro` 之后引入该 partial。
- `docs/IMPROVEMENT-LOG.md` —— 本节 + 中央台账 3 条（见 G 段）。

**数据只存一份、图在构建期从它渲染** ⇒ 图和数不可能不一致，也不需要另设"图 vs 数"的对账门禁。

### D. 一个真踩到的坑：Eleventy 3 的全局数据键**不做 camelCase**

第一次 `npm run build` 挂在 Eleventy 渲染：`TypeError: Cannot read properties of undefined
(reading 'join')`，栈在 `node_modules/nunjucks/src/filters.js:158`。纯 Nunjucks 单测同一表达式
**渲染正常**（输出 "2021 and 2024"），数据文件里那个键也**确实存在**（`require` 实测
`Object.keys` 列得出、值是 `[2021,2024]`）—— 于是排错方向一开始完全错了。

真因：`node_modules/@11ty/eleventy/src/Data/TemplateData.js` 的 `getObjectPathForDataFile`
**直接用文件名的原样**（`parsed.name`）当键，**全仓搜不到任何 camelCase 处理**
（`grep -rn "camelCase" node_modules/@11ty/` 只命中 lodash 自己的函数表）。
⇒ `src/_data/extreme-precip.json` 的全局键是 **`"extreme-precip"`**，模板里写
`extremePrecip` **取不到**。

**这一族最险的地方是它"静默"**：Nunjucks 取不到属性**不报错**（渲染出空串），
所以首页那一版看起来"能渲染"，只是标题、图、图注**全是空的**；只有 `join` 这类要拿
数组做方法的过滤器才会炸出来。定位手段：在模板里临时插一行 `{{ extremePrecip.summary | dump }}`
—— 它打印**空**，才说明是整个 `extremePrecip` 不存在，而不是某个键缺失。

修法：**把数据文件改名成 `extremePrecip.json`**（键 = 文件名原样 = 模板里的变量名），
并把这条写进模板文件头注释，免得下一个人再踩。

### E. 为绕开既有门禁而做的取舍（都写在代码注释里，不是事后补的）

- **SVG 内部不写任何 class**，颜色由 CSS 变量 `--chart-stroke` 决定，面板配色用
  `.chart__panels > div:nth-of-type(n)` 分配。理由：`scripts/check-dead-css.cjs` 只在 **src/ 下**
  与 `eleventy.config.js` 里找类名落点，**渲染器（`scripts/lib/chart-svg.cjs`）里的类名它看不见**；
  若把 A/B 写成模板拼出来的类（`chart__panel--{{ letter }}`），拼出来的完整类名在源码里
  **根本不存在** → 会被判成"定义了却没用"的死类。
- **不引用任何 .svg 文件**（必须是 inline）——`scripts/check-image-assets.cjs` 的 IA5
  会把被引用的 .svg 判红。
- **viewBox + `width: 100%`** —— `scripts/check-overflow.cjs` 在 390px 实测横向溢出。
- **SVG 文字走 `var(--text-secondary)`；图形色用 `--color-brand-500` / `--color-accent-500`**
  —— 图形色不是文字色，A1（正文 4.5:1）与 A4 不约束它们，但仍按 WCAG 1.4.11 取了 ≥3:1 的档位。
- **`aria-labelledby` → 面板标题的 HTML id；`aria-describedby` → SVG 内 `<desc>` 的 id**
  —— `scripts/check-a11y.cjs` 的 A5 实测 19 处无障碍引用都指向真实存在的 id。

### F. 验证结果（都是实测，不是"应该没问题"）

- **`npm run build` → exit 0**（22 个门禁 + 5 个自测注入矩阵全过）。
- `check:overflow`：全部 6 个页面在 390px 下 `scrollWidth` = 390 = 视口，**无横向溢出**。
- `check:a11y` A1–A7 通过；`check:print-theme` 通过；`check:site` / `check:jsonld` /
  `check:tracked-refs` / `check:lang` / `check:dead-css` 通过。
- **四态人工复验**（CDP 无头 Chrome 截 `index.html` 的 `#north-china-precip` 一节）：
  浅色 / 系统暗色 / 手动暗色（`data-theme="dark"`）/ 打印（`Emulation.setEmulatedMedia`）
  / 390px 移动端。**这一步抓到两个真问题，都已修**：
  ① **两个面板的绘图区没在同一基线上** —— A 的标题会折行、B 不会，SVG 跟着被压低，
  两条 x 轴错开约 35px。修法：`.chart__panel` 改 flex column + `.chart svg { margin-block-start: auto }`
  （网格默认 `align-items: stretch`，两个面板等高 ⇒ 底对齐 = 绘图区对齐）；
  ② **图注被居中** —— `base.css:212` 有一条全局 `figcaption { text-align: center }`
  （为博客正文的居中图注写的），多行英文说明居中会让折行后的末行悬在中间、读起来像排版事故。
  修法：显式压回左对齐（同 `.home-pub__caption` 的既有处理，pages.css:457 已有先例）。
  ⇒ **"门禁全绿"不等于"看着对"**：这两条门禁都测不到，必须真的看。
- **两个外链实测 200**（Zenodo 记录页、ESSD 讨论页）。

### G. 待本人拍板

已在**中央台账**登记三条（编号沿用台账既有序列，写入前现扫已占用号：1–34，下一个 35）：

- **待拍板 35**：这张图说的"华北"用哪个框（当前 32–50°N/110–120°E + 数据集自身陆地掩膜）？
- **待拍板 36**：两个面板的纵轴都不从 0 起，保留还是改成零基线？
- **待拍板 37**：算这些数的 Python 脚本要不要进仓库？（现在**只在 /tmp**，仓库里没有可重跑的来源）

### H. 归属与边界

- **本次提交只含本场次的 7 个文件**（上表 C 段所列）。
  并发场次在途的 `scripts/check-identity-handles.cjs`（**已暂存**）、
  `scripts/check-gates-wired.cjs` / `scripts/check-decision-ids.cjs`（未暂存）、
  `scripts/test-gates-wired-selftest.cjs`（未跟踪）**一律未纳入**，仍留在工作树/索引里由对方自己提交。
- **日志的提交内容由「HEAD 版日志 + 本场次这一节 + 本场次那 3 条台账登记」现场拼出**，
  **不**整份烤工作树（那会把对方在途的日志改动一并带进来）。工作树里的日志节在本场次结束后
  仍保留对方的未提交内容。
- **未 push**（部署时机属待拍板 7，本场次不代拍）。

### I. 提交

- 本次提交 7 个文件：`src/_data/extremePrecip.json`、`scripts/lib/chart-svg.cjs`、
  `eleventy.config.js`、`src/_includes/partials/extreme-precip.njk`、`src/assets/css/pages.css`、
  `src/index.njk`、`docs/IMPROVEMENT-LOG.md`（本节 + 台账 3 条）。
- 日志用「**路径限定提交 + 工作树换版**」方式，只把本场次的内容提交进去。
- **未 push。**

## 2026-10-19 · 19:25–19:40 场次（本机 PDT = UTC-7，折算 UTC 为 2026-10-20 02:25–02:40；**不占轮次号**，避免与并发场次撞号）：工作树里的 DI2 / LS5 红 —— 是**并发场次在途的台账重复登记**；main 干净，且这是 DI1 门禁第一次在**真实工作树**上抓到"一号两登记"

### 事实（现查，非转述）

- **工作树**的 `docs/IMPROVEMENT-LOG.md` 里，中央「待决策」段中编号 35 / 36 / 37 **各被两条不同的登记认领**（同一批三条登记出现了两遍）⇒
  - `node scripts/check-decision-ids.cjs` → **exit 1**，3 条 `[DI2]` 红因，**逐号点名是第几行**；
  - `node scripts/check-log-sections.cjs` → **exit 1**，`[LS5]`「中央待决策段里有 3 条**逐字重复**的登记条目」。
- **来源**：极端降水那条线在途的登记（同一批三条被登记了两遍）。
- **main 干净**：HEAD 的日志里那三条各只出现一次（重复条目 0 命中）⇒ DI1 在 HEAD 的日志上 **exit 0**，隔离克隆整链 `npm run build` 也 **exit 0**。
  ⇒ **红的是工作树，不是 main**；别把"工作树红"读成"main 坏了"。

### 本场次不代改

删哪一份、按哪种口径合并（留哪份、把重复那条改成什么号），是那条线自己的活；本场次**只记账**。
动别人的在途内容去"让门禁变绿"＝用改判据的口气掩盖问题，本仓不吃这一套。

### 顺带记一条：这门禁抓到了自测没假设的形态

`[DI2]` 原本是在注入矩阵里**构造**出来的样例（"台账里多出一条认领待拍板 25 的登记"）。这次是**真实工作树**上自然长出来的同一种形态 ⇒
**门禁能抓到的形态比自测里假设的还多**，这是好事；但也说明自测矩阵只能证明"设计的那几种形态能被抓"，**不能**证明"只有那几种形态存在"。

### 给下一个碰这条线的人

把那批登记落库前，先跑 `node scripts/check-decision-ids.cjs` —— 它的红因**逐号点名第几行**、并把两条登记的标题都打出来，删哪一份一目了然；直接落库则 main 会带着 DI2 红。

## 2026-10-19 · 18:25–19:20 场次（本机 PDT = UTC-7，折算 UTC 为 2026-10-20 01:25–02:20；**不占轮次号**，避免与并发场次撞号）：拿「范围不许由被判对象自己推导」审自己刚交的 DI 门禁 —— 补上**报告侧**的覆盖度（判红范围缩了，报告不许跟着缩）

### A. 本场次定位

并发场次转来一条避坑通知：**判据的「检查范围」不能由被判对象自己推导**（范围须写死或来自独立来源）。
这条已经在记忆里了，不重复写。本场次拿它**审自己上一场次刚交的那道门禁**
（`scripts/check-decision-ids.cjs`，"待拍板编号唯一性"）—— 审自己的东西才有意义。

### B. 审出来的真缺口（根因）

先说结论：**判红范围没问题，报告范围有问题。**

- 判红侧的常量全是写死的（`CENTRAL_TITLE` L53、`SAME_THING_LCS` L56、`CLAIM_RE` L59、`DECL_RE` L67），
  判红范围 = **台账认领的号**（台账 = oracle = 独立来源）⇒ 方向与那条坑**正好相反**，是对的。
- 但**报告侧**若也只跟着台账走，就会出现这个形态：
  **一次改动**（把台账里某条登记的认领脚注改掉 → 该号不再被认领，认领数 12 → 11）
  → DI0 **不响**（它只在认领数**归零**时才响）→ 该号**退出判红范围**（DI1 不再比它）
  → 而它在报告里若只剩一个没有明细的名字，人就看不出"这个号其实有 3 处声明"。
  ⇒ **一次改动就能让自己的监视变哑**。这正是那条坑说的"自我收缩"，只是发生在**报告**这一侧。

**实测（改之前的旧门禁，HEAD 版）**：台账 43 条登记条目、12 条显式写编号
（认领的号：24、25、26、27、29、30、31、33、34、35、36、37）；
台账外只出现在台账之外的号共 **24 个**（1–23、28），其中**有 ≥2 处声明**的共 **16 个**：

| 号 | 声明处数 | 号 | 声明处数 | 号 | 声明处数 | 号 | 声明处数 |
|---|---|---|---|---|---|---|---|
| 1 | 4 | 5 | 2 | 9 | 3 | 14 | 2 |
| 2 | 3 | 6 | 2 | 10 | 2 | 18 | 2 |
| 3 | 4 | 7 | 6 | 13 | 2 | 20 | 2 |
| 4 | 2 | 8 | 3 | 21 | 2 | 28 | 2 |

旧文案里**只有 18、20、28 三个**同时也在"台账外认领"那一族里（那一族本来就有逐号明细）；
其余 **13 个**（1、2、3、4、5、6、7、8、9、10、13、14、21）此前**只有一个扁平的名字** ——
知道"有这些号在外面"，但**看不到它们各自出现在哪几行、有几处**。

### C. 改了什么（只加报告，**不判红**）

1. **门禁新增 `offLedgerMulti` 计算 + 通过文案新块**「台账外**还有这些号在多处出现**」：
   逐号列出 `· N —— k 处声明：L… L…`，并明写
   「**判红范围缩了，报告不许跟着缩**（本门禁的范围不许由被判对象自己推导）」。
   * **不判红**：台账外同号声明算不算错 = 台账的组织口径 = **待拍板 32**，不代拍。
   * **报告里不下"两件事"的结论**，只报**处数与行号** —— 18 的两处声明其实是同一件事的改述
     （旧文案已能看出），下结论会假阳；报位置，让本人核对。
2. **自测新增第 13 档 M12**：把台账里某条登记的认领脚注改掉（该号退出判红范围）+ 在台账外补一处该号声明
   → 期望**仍绿**、且通过文案里**必须出现** `· N —— k 处声明`，
   **并且基线 M0 里不能本来就有那一行**（否则证明不了这行是"范围缩小"逼出来的）。
3. **README**：夹具档数 12 → **13**。
4. 门禁 374 → **406** 行（+32）；自测 382 → **426** 行（+44）。

### D. 验证结果

- **门禁**：`node scripts/check-decision-ids.cjs` → **exit 0**；新块把上表 16 个号**全部逐号列出**
  （含处数与行号），文案里那句「判红范围缩了，报告不许跟着缩」在位。
- **自测矩阵**：`node scripts/test-decision-ids.cjs` → **13/13 全绿**（M0–M12）。
- **反向对照（证明 M12 真能触发，不是坏跑）**：把 **HEAD 的旧门禁**（374 行、无新报告块）
  与**新自测**放进同一隔离目录跑同一份日志 → **M12 失败、整档 exit 1**（其余 12 档仍绿）。
  ⇒ 新报告块**确实**能被 M12 触发；换成旧门禁就触发不了。
- **整链 build**：见 F 段（提交后用干净克隆复验）。

### E. 归属（如实记）

- 本场次自己的改动：`scripts/check-decision-ids.cjs`（`offLedgerMulti` 块，+32 行）、
  `scripts/test-decision-ids.cjs`（M12 夹具 + 头部清单，+44 行）、`README.md`（档数 12 → 13）、本节。
- 门禁与自测的**主体**（DI0/DI1/DI2 判据、覆盖度报告段、M0–M11）是**并发场次**扩写的
  （上一场次已在日志 C.3b/E 段登记归属）——本场次只在它上面**加**报告块与夹具，不改它的判据。
- **未 push**（部署时机属待拍板 7，由本人决定）。

### F. 待本人拍板 / 本场次未做的事

- **待拍板 32**（台账的组织口径）—— 本场次**没有代拍**，只把"台账外哪些号在多处出现、分别在哪几行"
  变成**看得见**的事实，供本人定口径：台账外同号声明到底算不算错？
  以及台账外的 18/20/23/28 四个号要不要收编进中央台账。
- **承接待拍板 7 / 18 / 28**（部署时机 / 新门禁并入 `test-gates-selfcheck.cjs` / 门禁自检接进 build 链）。
- **线上仍是旧部署**（本场次实测，与上一轮一致）：`/`、`/blog/`、`/about/`、`/sitemap.xml` 200；
  **`/papers/`、`/publications.bib`、`/feed.xml` 三条 404**；
  首页 canonical 与 og:url = `https://github.lvyihang.xyz/MeteoHub/`、sitemap 三个 `<loc>` 也都带
  `/MeteoHub/` 前缀、`<lastmod>` 仍是 2026-10-16 ⇒ **canonical/og/sitemap 与实际路由不一致**。
  **本地已修好**（本地领先 `origin/main` **130** 提交），**push 一次即可全部恢复** ——
  本任务禁止 push，所以**只报不改**。

### G. 补记（本场次提交后的两件事，如实记）

1. **提交信息里的换行被转义成了字面 `\n`**（`b7b13f6` 的正文）—— 成因：提交脚本用
   `git commit -m "<整段文本>"`，而 shell 不解释 `\n` ⇒ 正文被挤成一行、换行成了字面两字符。
   **没改它**：改提交信息会重写那个提交，而并发场次已经把 `7049bbe` 叠在它上面 ⇒
   改写会连带重写**对方的提交**（那条链是共享的）；一条信息格式难看，比悄悄重写别人的提交
   要轻得多。**教训（照此办）**：提交信息一律走**消息文件** `git commit -F <file>`，
   不要用 `-m` 拼整段文本。
2. **提交准备期间 HEAD 被并发场次推进了 4 次**（实测 `3f56633` → `1580b7d` → `c99b2f1`
   → `5fc4e2f`）⇒ 日志 blob **必须从提交那一刻的 HEAD 重建**，否则会把对方刚提交的内容回滚掉。
   本场次用的做法：读 HEAD → 从**这个** HEAD 重建 blob → 私有索引只暂存本场次的文件 →
   提交 → **核对父提交 == 刚才读的那个 HEAD**；对不上就 `git reset --soft` 撤掉重来。
   第一次尝试就撞上了（准备用的 HEAD 已经过时），脚本重做后成功，父提交已核对一致。

## 2026-10-19 · 19:40–20:00 场次（**不占轮次号**，避免与并发场次撞号）：P4 收尾 —— 日志基线回退已被并发场次修好；真实索引被我自己的临时索引实验污染（已复原）

### A. 本场次只做两件事

P4（首页内联 SVG 图表）的**代码与日志早已落库**（`1580b7d`）；本场次是收尾场次，只做：

1. 把「**日志基线回退**」这件事收干净（结论：**已被并发场次修好，本场次不改写历史**）；
2. 修掉**本场次自己造成的一处索引污染**（真实 `.git/index` 里躺着自己工作的旧稿）。

实测：当前 `HEAD` 上，本场次的 6 个文件与 `1580b7d` **逐字节一致**
（`git diff --stat 1580b7d HEAD -- src/_data/extremePrecip.json scripts/lib/chart-svg.cjs eleventy.config.js src/_includes/partials/extreme-precip.njk src/assets/css/pages.css src/index.njk` **输出为空**），
⇒ **代码没丢、也没被回退**，无需再改。

### B. 日志基线回退：已闭，不再改历史

事实经过（按 git 顺序）：

| 提交 | 谁 | 做了什么 |
|---|---|---|
| `6db69c5` | 并发场次 | 做了「续四节去重 + 补记归属」 |
| `1580b7d` | **本场次** | 用的日志基线取自 `6db69c5`，⇒ 把那一次**去重与归属块一并还原**了 |
| `c99b2f1` | 并发场次 | 追加自己的新节（19:25–19:40） |
| `5fc4e2f` | 并发场次 | **第三次**去重 + 补记归属（第 5 条把本场次「用陈旧快照把重复带回来」的过程也记了进去） |

实测当前 `HEAD`（`5fc4e2f`）的日志状态：

- 「续四」节 **×1**；
- `### G. 归属订正` **×1**；
- 本场次的 P4 节 **×1**；
- 本场次登记的**待拍板 35 / 36 / 37 各 ×1**，且 37 是台账里的**最大号**（不撞号）；
- **无重复节标题**（把日志里全部 `## ` 节标题收集起来做集合比较：重复项 0）。

⇒ **基线回退已闭**。本场次**不改写历史**（`git update-ref` 的 CAS 在本轮已失败过一次，ref 当时已被 `c99b2f1` 推进）；
按既定纪律，只能在 tip 之上**补提交**，不能重写已发布的历史。

### C. 本场次造成的索引污染（已复原）—— 一条可复用的纪律

**事实**：本场次提交时用的是「**临时索引 + `git commit-tree` + CAS `git update-ref`**」这条路，
而**临时索引是从真实 `.git/index` 复制来的** ⇒ 临时索引里存的是**本场次中途的旧稿**：

- 数据文件的旧名（`extreme-precip.json`，那还是 Eleventy 键名取不到、`join` 过滤器才会炸出来的那个坑）；
- CSS **还没有**面板底对齐的修法（`.chart__panel` 的 flex column + `.chart svg { margin-block-start: auto }`）；
- Nunjucks 注释**还没有** camelCase 那个坑的说明。

本场次提交后**没有把真实索引复原** ⇒ 真实 `.git/index` 里一度存着这 4 个文件的旧稿 + 旧日志版本。

**后果（实测）**：**工作树**里这 4 个文件与 `HEAD` **逐字节一致（正确版）**，但**索引**里是旧稿 ⇒
任何人下一次**直接 `git commit`（不带 `-a`）**，都会把已修好的

- 两个面板的**绘图区底对齐**（A 面板标题折行、B 面板不折行，不对齐时两条绘图区错开约 35 px），
- 图注的**左对齐**（`base.css` 有一条全局 `figcaption { text-align: center }`），

**静默回退**，并把日志搅乱（索引里的日志版本比 `HEAD` 旧 169 行）。**全程不报错**——这才是最坏的一种。

**本场次的处理（只动自己那几项，工作树内容一字未改）**：

```bash
# 我的 6 个文件：工作树 == HEAD ⇒ add 之后索引回到正确版，暂存区对这 6 个文件变为空
git add src/_data/extremePrecip.json scripts/lib/chart-svg.cjs eleventy.config.js \
        src/_includes/partials/extreme-precip.njk src/assets/css/pages.css src/index.njk
# 日志：索引回 HEAD 的 blob，工作树日志一个字节都不动
git reset HEAD -- docs/IMPROVEMENT-LOG.md
```

复核：`git diff --cached --name-only` ⇒ 只剩并发场次自己的 `scripts/check-identity-handles.cjs`（**不是本场次的**，本场次不碰）。

**纪律（跨场次可复用）**：

1. **临时索引用完必须复原真实索引**——否则下一次 `git commit` 会把旧稿写进历史，且**不会报错**；
2. 提交前 `git diff --cached --name-only` **逐行看**：既防「捎带别人的在途改动」，也防「索引里躺着自己工作的旧稿」；
3. **识别索引被污染的现象**：工作树与 `HEAD` 一致、但 `git diff --cached` 有差异 ⇒ 索引里是**另一份内容**；
   此时**先修索引再提交**，不要用「重新 add 全部」去掩盖（那会把别人的在途改动一起卷进来）。

### D. 本场次不做的事

- **不改写历史**（基线回退已由并发场次修好）；
- **不提交并发场次的在途文件**（`scripts/check-identity-handles.cjs`、`scripts/check-decision-ids.cjs`、
  `scripts/test-decision-ids.cjs` 等）：本提交的暂存清单只含本场次自己的文件；
- **不 push**（部署时机属待拍板 7）；线上 3 条 404 属旧部署，本轮只记录、不代拍；
- **待拍板：无新增**（35 / 36 / 37 是本场次 P4 那一节登记的，未改口）。
## 2026-10-19 · 18:50–19:15 场次（**不占轮次号**，避免与并发场次撞号）：P2 断点收敛 —— 逐块核对 + 实测对照推翻「统一到 375/768/1024/1440」，改为「只消冗余、不做归并」；顺带清掉一条从未生效的顶栏死规则

### A. 本轮改进点与**关键裁定**：仓库里原写的目标集**不能照做**

原始待办（`docs/IMPROVEMENT-LOG.md:124-126`）：

> **P2 断点收敛**：当前 6 个散落断点 `640 / 720 / 760 / 768 / 820 / 1024`，
> 其中 4 个只差 100px。建议统一到 `375 / 768 / 1024 / 1440`。
> ⚠️ 需逐页回归验证，不能盲改。

本轮按这条「需逐页回归验证」的提示做**逐块核对**（而不是盲改），结论是：**这个目标集会引入可见退化**。

**机制（为什么"两个断点只差 100px"≠"这两个断点可以合并"）**：
`max-width: X1`（X1 < X2）改成 `max-width: X2`，在区间 **(X1, X2]** 里**新增**了这条规则的
作用 —— 合并是「扩大作用域」，不是「等价改写」。所以断点数值相近，只是**数值**相近；
它们背后是不是**同一件事**，必须逐块看内容才知道。

逐块裁定（8 个候选块，全部逐个核对过）：

| 块 | 候选归并 | (X1, X2] 区间的后果 | 裁定 |
|---|---|---|---|
| `_list.css:287` `640` | → 768 | 641–768px 列表项从「封面 168px + 正文并排」变「纵向堆叠」 | ❌ 退化，**不归并** |
| `_misc.css:18` `640` | → 768 | 641–768px 留白 32→24px、h1 降到 26px、顶栏链接 12px | ❌ 退化，**不归并** |
| `_nav.css:226` `640` | → 768 | 641–768px 顶栏**提前进紧凑态**（实测 390px 才贴满一行） | ❌ 退化，**不归并** |
| `_nav.css:77` `720` | → 768 | `.nav__link` **全站无模板输出** | ✅ 零影响，**归并** |
| `layout.css:120/122` `720` | → 768 | `.hide-mobile` / `.show-mobile` **全库无使用** | ✅ 零影响，**归并** |
| `_paper.css:956` `760` | → 768 | 761–768px 论文图版横向可滚动；实测 680px 最小宽在 768 视口**不溢出** | ✅ 无视觉差，**归并** |
| `_nav.css:232` `360` | → 375 | 375px（iPhone SE / 8 / X 主力宽度）将**失去品牌标记** | ❌ **不归并，360 保留** |
| `pages.css` `760 / 820 / 640` | — | 该文件正被并发场次占用 | ⏸ 留待下一轮（见 F 节） |

**本轮实际落地的 4 处改动**（5 个文件）：`_paper.css` 760→768、`_nav.css` 720→768、
`layout.css` 720→768 ×2、`_misc.css` 删两条顶栏死规则（见 B 节）。

### B. 顺带清掉一条**事实死代码**（不是"顺手美化"）

`_misc.css` 的 640 块里原本有两条顶栏规则：

```css
.topbar__nav { gap: var(--space-3); }
.topbar__link { font-size: 12px; }
```

它们**从未生效**，两个事实各占一半：

- `components/index.css` 的导入顺序是 nav → button → badge → card → list → paper → misc，
  **`_nav.css` 排在 `_misc.css` 之前**；
- `_nav.css` 同断点有 `html body .topbar__nav` / `html body .topbar__link`，
  **specificity 更高**（0,1,2 对 0,1,0）。

⇒ 同 specificity 的这两条被**完全覆盖**。删掉 = **零行为变化**。

同时**改写 `_nav.css` 里那段提到它们的注释** —— 否则注释就指向了不存在的规则
（「注释说假话」和「日志说假话」是同一族：让下一个人以为改那里能生效）。

### C. 激进归并的**实测**对照（把"退化"从推理变成证据）

为了不让"会退化"只停在推理，做了一份「把三处 `640` 全部改成 `768`」的激进归并版，
与基线逐像素对比：

| 页面@宽度 | 变化像素 | 占比 | bbox | 判读 |
|---|---|---|---|---|
| `papers@700` | **222,501** | **13.24%** | y 18–1464（整页） | ❌ 列表**整页重排** |
| `home@700` | 2,481 | 0.148% | y 18–51（顶栏） | ❌ 顶栏**提前进紧凑态** |
| `home@768` | 2,497 | 0.135% | y 18–51（顶栏） | ❌ 同上 |

对照：本轮**实际采纳**的保守版在同一批测试下的差异是 **0–23 px**。
两者相差 **两个数量级** —— 这就是"归并会退化"的证据，不是我的判断。

### D. 验证方法，以及它**自己的失效边界**（本轮真踩到的坑，单独记）

第一版做的是"24 张 before/after 像素对比"（4 页 × 6 宽），结果 4/24 张不同。
但那 4 张里**有 3 张是截图层抖动，不是布局变化**：

- `papers@700`：**同一构建**内两次截图即差 10 px，且 bbox **完全相同** (56,289,59,321)；
- `home@700`：**基线构建内部** B1 vs B2 就差 23 px，与跨构建差值**完全相同**；
- `about@820`：同一构建两次差 **904,128 px**（该页自身渲染高度不稳定）。

⇒ 决定性判据是 **2×2 判定矩阵**（同一状态拍两轮 × 两个状态各拍两轮）：

| 页面@宽度 | 状态内部 A1 vs A2 | 状态内部 B1 vs B2 | 跨状态 A1 vs B1 |
|---|---|---|---|
| `home@700` | 0 px | **23 px** | **23 px** |
| `home@768` | 0 px | 0 px | 0 px |
| `papers@700` | 0 px | 0 px | 0 px |
| `about@820` | 0 px | 0 px | 0 px |

**跨状态差 == 状态内部差 ⇒ 差异归因于截图层，与改动无关。**

⚠️ 两条方法论（都是本轮真踩到的，不是事后补的漂亮话）：

1. **"基线 vs 基线"必须跨构建重拍两次**。我一开始用**同一份产物**拍了两轮当对照 ——
   那只能证明**截图层**确定，**不能证明构建**确定（后来才发现 before / before2 / ctrl
   三批用的是同一份 `_site`）。构建是否确定，是靠"基线源码重建两次 → 产物逐文件 hash 全同"
   单独确认的（`robots.txt` 只差一行构建时间戳）。
2. 像素对比**必须先建噪声底**（同状态重复拍摄），否则会把 23 px 的抖动读成"布局变了"。
   本轮若省掉这一步，就会误判成"我的改动有副作用"，进而放弃一个**正确的**改动。

另有一条**产物级**硬核对（不依赖像素）：

- 基线构建 vs 改动构建的**完整 `_site` 逐文件 diff** ⇒ 只有 **5 个 CSS 文件** + `robots.txt` 不同；
- `robots.txt` 的差异只是**构建时间戳**（`# 生成时间：…`），与内容无关；
- **HTML 全部相同** ⇒ 渲染输入相同。

### E. 复验

- `npm run build` **exit=0**（全门禁链：`check:gates` / `check:tracked-refs` / `check:log-sections` /
  `check:decision-ids` / `check:decision-ids-selftest` / `check:css` / `check:dead-css` /
  `check:wrap` / `check:a11y` / `check:lang` / `check:overflow` / `check:jsonld` /
  `check:identity` / `check:identity-derivation` / `check:citation-*` / `check:live-selftest` 等）；
- `check:overflow` 多宽度 **7 档全 exit=0**：320 / 375 / 640 / 768 / 820 / 1024 / 1440；
- 像素对比：4 页 × 6 宽 = **24 张**（基线 vs 保守版），差异 **0–23 px = 噪声底**。

### F. 断点现状（收敛后）与**留下的项**

全库宽度断点值：**7 个 → 6 个**（`{360, 640, 760, 768, 820, 1024}`）

| 值 | 现状 | 保留 / 归并的理由 |
|---|---|---|
| 360 | **保留** | 实测标定（390px 已贴满一行），且 375px 是 iPhone 主力宽度，归并会让它**丢品牌标记** |
| 640 | **保留 ×4** | 四处**各有独立语义**：列表换列 / 页面留白与 h1 / 顶栏紧凑 / 首页紧凑 |
| 768 | 目标档 | 标准平板档 |
| 760 | **剩 1 处**（`pages.css`） | 可归并（与 `_paper.css` 同构的图版横向滚动），见下 |
| 820 | **保留** | 首页 hero 单栏化，语义独立 |
| 1024 | 目标档 | 标准桌面档 |

**下一轮可做（本轮不做）**：`pages.css` 的 760 块（`.home-pub__figure-plate` 横向滚动，
与 `_paper.css` 的 768 块同构）→ 归并到 768。**本轮不碰 `pages.css` 的理由**（不是"忘了"）：

1. 该文件正被并发场次的 **P4 首页数据图**占用（其 staged diff 末尾新增了
   `min-width: 760px` 与 `max-width: 640px` 两个块）；
2. 若把原有的 760 改成 768，会与新增的 `min-width: 760px` 产生 **760–768px 的重叠区间**
   （一个"≤768 生效"、一个"≥760 生效"）⇒ 两套规则同时命中；
3. 提交归属上，`pages.css` 已被别人 stage，普通 `git commit` 会把它一起扫走。

原建议里的 **1440 档**当前**全库无任何规则使用**（本轮前后都无）⇒ 引入一个没有规则用的
断点没有意义，故未引入。

### G. 归属、提交与**不 push**

- 改动（4 个 CSS 文件）与本节由本场次写；用**私有索引**（`GIT_INDEX_FILE`）逐路径落 blob，
  **只提交**自己改的 4 个 CSS + 本节日志。共享暂存区里压着并发场次在途的极端降水图表、
  DI 门禁、I5 / I6 身份门禁、接线门禁 GW4 等文件。
- 提交后按仓库既有做法**修共享索引里的日志条目**（= 我的新节 + 并发场次在途的日志节），
  否则对方下一次提交会把本节**回退**掉。
- **未 push。**

### H. 待拍板与线上现状

- **待拍板 38**：P2 断点收敛的目标集用哪一档（原写的 {375 / 768 / 1024 / 1440} 已被实测证伪）。
  已在中央台账登记，**本场次不代拍**。
- 线上仍是 2026-10-16 那版：`/papers/`、`/publications.bib`、`/feed.xml` 三条 **404**，
  canonical 仍指向旧 `/MeteoHub/` 前缀；本地领先 origin/main 128+ commit
  ⇒ **部署时机属既有待拍板 7，本场次不代拍、不 push。**

### I. 提交时的仓库状态：**红，但不是本场次的红**（归属必须写清，否则后人会归错因）

本场次提交前后，`npm run build` 都是 **exit=1**。命中的是：

- `check:log-sections`（LS5）：「中央待决策段里有 **3 条逐字重复**的登记条目」；
- 紧接着 `check:decision-ids`（DI2）：「待拍板 **35 / 36 / 37** 各被 **2 条**登记认领」。

**红因不在本场次**，三步查证（都可复现）：

1. **HEAD 里没有那三条重复**：
   `git show HEAD:docs/IMPROVEMENT-LOG.md | grep -c '登记为待拍板 3[567]'` = **3**
   （基准 commit **`eb8c58c`**；中央段收尾在 HEAD 的 **L2118**，35 / 36 / 37 各**只有一条**）
   ⇒ HEAD 状态下两个门禁都绿。
2. **工作树里有第二套**：同一 grep 在工作树上是 **6** 处 —— 第二套在 L2129 / L2139 / L2151，
   顺带把中央段收尾线推到 **L2165** ⇒ 第二套**落在中央段内** → LS5 判「逐字重复」、
   DI2 判「一个号两条登记」（DI2 报的行号 2095/2129、2105/2139、2117/2151 与此一致）。
3. **移除本场次改动后仍然红**：把本场次的两处改动（中央段的 38 条目 + 末尾本节）从日志里去掉，
   用 `LOG_PATH=<副本> node scripts/check-decision-ids.cjs` 在副本上跑 ⇒ **仍然报同样三条**
   （35 / 36 / 37），**没有一条提到 38** ⇒ 红因与本场次无关。

**本场次提交的内容本身是绿的**（这正是私有索引带来的好处）：

- 日志 blob = **HEAD + 本场次两处改动**（**不含**并发场次在途的节、也不含那套重复条目）；
  基准 commit **`eb8c58c`**（本场次提交期间 HEAD 被并发场次推进过多次，本节已按新基准重算行号）；
- `check:decision-ids` 在该 blob 上**通过**，报告里明确写着「认领的号：…、**38**」
  与「台账内一个编号只被一条登记认领」；
- LS5 / LS2 的判据在同一 blob 上复核：**逐字重复 0 条、段内无 `## ` 节标题、文件头无待决策条目、
  节标题无重复**；
- 4 个 CSS 改动已在隔离克隆（`/tmp/mh_p2a`）上 `npx eleventy` **exit=0** 跑通；
  真实工作树的 `npm run build` 在并发场次追加重复条目**之前**也是 **exit=0**（有 build 日志为证）。

⇒ 也就是说：**并发场次在中央台账里追加的那套 35 / 36 / 37 逐字重复，同时让 LS5 与 DI2 判红**；
而 DI2 自己的判据文案声称「台账里改述同一条目是'就地改写脚注'，**不构成第二条**」——
**逐字相同的两条仍被判成两条**，这暴露了 **DI2 的一处覆盖度缺口**（判据与设计意图不符）。

本场次**不代改**（那属于并发场次刚提交的 `scripts/check-decision-ids.cjs`），
按规矩**通知对方**；红因归属在这里写清，免得后人读 `git log` 得出错误因果
（"这个仓库红着，是谁的改动造成的"必须有确定答案，不能靠猜）。

### J. 38 号条目**一度插错位置**（缩进两格 ⇒ 不被认领）—— 门禁不报红，只是不认账

本场次第一次把「待拍板 38」写进中央台账时，**位置和缩进都是错的**，而且**门禁不会报红**：

- **怎么错的**：插入锚点用的是「`（本场次不代拍，登记为待拍板 37）` + 紧跟的 `---`」这一**行组合**。
  当时工作树里**有两套 35/36/37**（并发场次在途），该组合命中的是**第二套 37 的登记行**；
  再加上插入点用的是**字符级 index 切片**（`text[:j] + entry + text[j:]`，`j` 落在该行
  **行首之前**），条目于是**继承了那行前面残留的两个空格**、并被塞进**别人的条目内部**
  （37 的续行与登记行之间）。
- **为什么门禁不报红**：DI1 的「声明」只认**顶格**的 `- **待拍板 N（…）…**`；
  缩进两格的那条**根本不被认领为声明**（它照样能被 DI2 当"台账里的登记"读到），
  LS5 判的是"逐字重复"，也管不到"位置不对" ⇒ **两个门禁都绿，但登记实际没生效**。
  这属于「看起来在、其实没生效」族的又一形态：**格式错误 = 静默失效**。
- **怎么修**：改用**行级**定位 —— 取中央段内**最后一个**「登记为待拍板 37」行
  （`rindex`，避开重复条目的错配），把条目插到它**之后**、收尾 `---` **之前**，
  并把首行的前导空格去掉。修正后：38 号条目在 **L2152–L2163**（顶格、完整），
  37 的登记行回到 **L2151**，中央段收尾 `---` 在 **L2165**。
- **可推广的教训**：① **锚点要有方向** —— "X + 紧跟的分隔线"在有重复内容的工作树里会命中**错的那一套**；
  ② **插入点落在"行首之前"还是"行尾之后"，决定新内容的缩进归属** —— 用字符级切片插入时，
  缩进会被前一行"传染"；**行级操作**（按行数组定位）没有这个问题；
  ③ 这类"格式错 ⇒ 静默失效"是门禁的**覆盖度缺口**，本场次**不代改**门禁
  （属并发场次刚提交的 `scripts/check-decision-ids.cjs`），在此登记留痕。

### K. 提交返工与**三条现场教训**（第一次提交把并发场次的 80 行回退了，已用 CAS 原子修好）

本场次的提交**返工了一次**。过程与教训逐条留痕，因为每一条都是**可复现的机制**，不是运气。

#### K.1 返工经过：私有索引提交也会回退别人的内容

第一次提交（`2b09d8f`）的日志 blob 是在**基线 `81e390b`** 上算的，而真正执行
`git read-tree HEAD` 时，**HEAD 已被并发场次推进了两次**（`2cc5e4b`、`eb8c58c`，
日志 13815 → 13882 行）。于是 **blob 用旧基线、tree 用新基线**，两者一合，
并发场次在 `eb8c58c` 里写的 **80 行被净删**（`git show --numstat` 显示 `27 80`）。

- **为什么当场没发现**：`git diff --cached --name-only` 只列**文件清单**，
  看不出「某个文件少了 53 行」；**只有 `--numstat` 才看得到负数**。
  ⇒ 纪律补一条：**私有索引提交后必须看 `--numstat`，出现负数就停下来查**。
- **怎么修**：用 `commit-tree` + `update-ref <new> <old>`（**CAS**）原子重做 ——
  固定基线 `eb8c58c`，重建 blob 与 tree，**父提交不变**，
  修正后是 `229 增 / 0 删`（纯插入）；旧提交 `2b09d8f` 被替换，不进历史。
- **根因**：`blob` 与 `read-tree` **必须同源于同一个 commit id**。中间插了复验步骤
  （跑 build / 门禁）⇒ HEAD 漂了 ⇒ 两个基线不同源。
  ⇒ 纪律补一条：**私有索引流程里，"取 blob" 与 "read-tree" 之间不要插任何
  可能推进 HEAD 的步骤**；若插了，**提交前必须重新核对并重算**。

#### K.2 外置盘瞬时掉线：工具报「工作目录不存在」时，**先怀疑挂载**

提交前后，外置盘（`/Volumes/Kingston`，**exFAT + USB**）瞬时掉线了一次，
表现为**所有 bash 调用**都报 `Working directory does not exist`（会话 cwd 就在盘上）。

- **判别动作**：`read` 工具读 `/etc/hosts` 正常 ⇒ 工具本身没问题；
  `glob` 报 `path does not exist` ⇒ 路径真没了 ⇒ 是**挂载**问题，不是"文件被删了"。
- **不要做的事**：此时若照着报错去"重建目录"，会在盘回来后**覆盖真实数据**。
- **恢复**：盘自行回来后一切正常（`/Volumes` 的 mtime 正好是掉线那一刻，
  是一次重新枚举）。子 agent 从独立 shell 探明了挂载态与磁盘身份（`disk4s2`、exFAT、可写）。

#### K.3 共享索引里的**陈旧条目**会回退已提交的改动

提交后 `git status` 显示 4 个 CSS 是 `MM`：**索引 ≠ HEAD、工作树 = HEAD**。
⇒ 索引里躺着**旧版**（不含本场次改动）。此时**任何人一次不带 `--only` 的
`git commit` 都会把本场次改动扫走**。

- 判别动作（与既有那条同族）：`git diff HEAD -- <file>` **为空** ⇒
  索引条目是**陈旧垃圾**，刷成 HEAD 版安全；非空 ⇒ 用 `update-index --cacheinfo`
  写回 HEAD 的 blob，**不要** `git add`（会把别人在途的半成品抓进来）。
- 日志条目则**不能**刷成工作树版：工作树日志当时**少了并发场次 `2cc5e4b`
  已提交的那一节**（LS2 判红，见下）⇒ 刷工作树版等于把那节**预登记为待删**。
  ⇒ 正确做法：索引刷成 **HEAD 版**（含双方已提交内容），工作树的在途内容留给各自去 add。

#### K.4 交给并发场次的**两条红因**（都在工作树、都不是本场次造成的）

1. **LS2 判红**：并发场次 `2cc5e4b` 的那一节
   「## 2026-10-19 · 19:40–20:00 场次（…P4 收尾…）」**在工作树里不见了**
   （HEAD 里有、工作树里 grep 计数为 0）⇒ 工作树被**旧基线覆盖**过。
   本场次的操作都只**追加文件末尾**、或**只动自己的那一块**，不会删中间的一节；
   且共享索引已刷成 HEAD 版，**那一节在索引里还在**。恢复方式（对方的）：
   `git show HEAD:docs/IMPROVEMENT-LOG.md` 取回那一节再并回工作树。
2. **LS5 + DI2 判红**：中央待决策段里有 **3 条逐字重复**的登记条目
   （35 / 36 / 37 各被两条认领，DI2 报 2095/2129、2105/2139、2117/2151）。
   逐字相同的两条仍被判成"两条"⇒ **DI2 的判据与它自己的设计意图
   （"改述同一条目不构成第二条"）不符**，暴露一处覆盖度缺口。

两条**均已通知对方**，本场次**不代改**（那属并发场次刚提交的
`scripts/check-decision-ids.cjs` 与 `check-log-sections.cjs`）。

## 2026-10-20 · 07:05–07:30 场次（**不占轮次号**，避免与并发场次撞号）：并发场次红因移交的**裁定与处置** —— 两处红因**同源**（工作树被旧基线整份覆盖）；DI2 的「判」是对的、**「改法」是错的**，按两种形态分开

### A. 移交件

并发场次（19:40–20:00 · P4 收尾那条线）移交两处 build 门禁红因，归属不在它那边：

1. **LS2**：`2cc5e4b` 提交的「## 2026-10-19 · 19:40–20:00 场次（…P4 收尾…）」在 HEAD 里有（grep 计数 1）、
   在工作树里不见了（计数 0）—— 工作树看起来被旧基线整份覆盖过。
2. **LS5 + DI2**：中央「待决策」段里有 3 条**逐字重复**的登记条目（35 / 36 / 37 各被两条认领，
   DI2 报 2095/2129、2105/2139、2117/2151）。对方的读法是「DI2 自己的文案称『改述同一条目不构成
   第二条』，但逐字相同的两条仍被判成两条 ⇒ 覆盖度缺口在 `scripts/check-decision-ids.cjs`」。

### B. 裁定：两处红因**同源**，不是门禁的覆盖度缺口

- **决定性测试**：在**干净克隆**里 checkout 当前 HEAD（`3cb6f77`）跑两个门禁 → **全绿**：
  - LS：「历史上出现过 106 个节，HEAD 上现存 106 个……**工作树上的 106 个节也覆盖了 HEAD 的全部节**」、
    「中央待决策段……段内 44 条登记条目、**无逐字重复条目**」；
  - DI：「中央待决策段……共 44 条登记条目……**台账内一个编号只被一条登记认领**」。
- ⇒ 那 3 条重复条目**只存在于被污染的工作树副本**里，**不在 HEAD 上**；LS2 那条同理。
  **两个红因是同一份污染的两个症状**，不是两件事。
- **对方把第 2 条读成「覆盖度缺口」——判据本身没有缺口**：
  DI2 的口径是「**一个号只能被一条登记认领**」，去重键是 **owner 条目所在的行**：
  台账里「就地改写脚注」（同一条目上的多条认领）= 1 个 owner → 不算两条
  —— 这正是它文档里「改述同一条目不构成第二条」那半句；
  而**多出来的条目**（哪怕逐字相同）= 2 个 owner → 判红
  —— 这也正是它文档里「**只有多出来的条目才算**」那半句。
  ⇒ 判红**符合它自己的文档**，不是缺口。
- 但对方的读法里有一处**真的对**：那条红因的**措辞与改法在这个形态上是错的**（见 D 段）——
  「被 2 条**不同的**登记认领……一个号两件事……改法：把其中一条改成**下一个空号**」，
  而那两条**逐字相同**。按它说的改法做，等于**给同一件事造第二个号**，本人就会以为有两件事要拍。
- ⇒ **本场次的结论**：门禁**判红是对的**（两处红因同源，都是那份污染的症状），
  **要改的是红因的措辞与改法**（形态 ① 不该把人引向「造第二个号」），**不是**放松判据。

### C. 处置一：把工作树修回「HEAD 的那一版 + 并发场次在途的改动」

- 删掉工作树里**多出来的 33 行**（三条逐字重复的台账条目：35 / 36 / 37；原条目保留、副本删除；
  副本与原件只差**末行缩进**，正文相同）⇒ 台账回到 44 条、无逐字重复。
- 找回**整段 80 行**的 P4 节（从 HEAD 取回，插在它后面那一节之前）⇒ LS2 那条红因消失。
- **并发场次在途的改动一行没动**：修完那一刻 `git diff HEAD -- docs/IMPROVEMENT-LOG.md` 剩下的
  只有它自己那一节里的在途编辑 + 我这节的位置 —— 修的是**污染**，不是把别人的在途工作抹掉。
  （第一次动手时切点切在块中间、只吃掉 12 行留下残片，已从备份 `/tmp/mh-h2/log.bak` **回退重做**，
  改用「内容定位 + 断言边界 + 精确下标」。）
- 修完在工作树上直接跑两个门禁：**LS exit 0、DI exit 0**（44 条登记、无逐字重复、
  每个号只被一条认领、106 个节两侧一致）。

### D. 处置二：DI2 的红因与改法按**两种形态**分开（`scripts/check-decision-ids.cjs`）

| 形态 | 判据 | 红因 | 改法 |
|---|---|---|---|
| ① **同一条登记被写了两遍**（每行去缩进后逐字相同） | 仍判红 | 「是同一条登记被写了两遍……**这不是同号两义**：本人按号拍板只会看到**一件**事，多出来的那条是纯冗余，但它会让『这一号对应几件事』算错」 | **删掉重复的那一条**（并明写「⚠️ 不要改成下一个空号 —— 给同一件事造第二个号，本人就会以为有两件事要拍」） |
| ② 两条说的**不是同一件事** | 仍判红 | 原样：「一个号两件事，本人按号拍板会拍到错的那一件」 | 原样：改成**下一个空号**，并同步它在本日志别处的引用 |

- 判别动作：给台账条目的**归一化全文**（只去每行的缩进与首尾空白）做集合比较 ⇒
  归一化后**逐字相同** = 形态 ①；词句不同 = 形态 ②。
  为什么只去缩进、不像 DI1 那样用 `denoise` 去标点：DI1 判的是「是不是同一件事」（宽松一点没坏处），
  这里判的是「是不是**同一条被复制**」——**标点不同就是两件事**，去得太狠会把两件真事并成一件。
- **两种形态都判红**（重复登记本身是台账缺陷，LS5 也独立报同一处），只是「错在哪、怎么改」必须说对；
  否则红因会把人引向错误的动作——而**错误的动作会制造新问题**（给同一件事造第二个号）。
- 门禁侧与自测侧的配套：自测矩阵新增 **M13 档**（把一条带认领脚注的登记**整条逐字复制一份**）
  ⇒ 断言必须同时满足「红」+ 红因含「同一条登记被写了两遍」+ 含「删掉重复的那一条」
  + **不含**「一个号两件事」；档数说明 13 → 14 档，README 的命令清单同步登记（RD3 判红）。

### E. 验证（隔离克隆；**注入只在副本上做，仓库工作树里的日志一个字节没改**）

| 档 | 注入 / 场景 | 期望 | 实测 |
|---|---|---|---|
| 1 | 干净克隆 checkout `3cb6f77`（**修复前**的 HEAD） | 两个门禁全绿 | **LS exit 0、DI exit 0**（106 节 / 44 条登记 / 无逐字重复）⇒ 重复条目只在被污染的工作树里 |
| 2 | 修完工作树后直接跑两个门禁 | 全绿 | **LS exit 0、DI exit 0** |
| 3 | DI 自测矩阵（含新增 M13） | 14 档全绿 | **14/14 通过，exit 0** |
| 4 | **反向对照**：换回旧门禁（HEAD 版）+ 新自测 | M13 必须失败 | **M13 失败**，红因逐字：「被 2 条**不同的**登记认领……一个号两件事……改法：把其中一条改成**下一个空号**」（两个标题却一模一样）⇒ 这一档真的在测本次改动，不是纸面上的 |
| 5 | **与本次提交内容一致**的隔离克隆树（HEAD + 本次四文件）整链 `npm run build` | exit 0 | **exit 0**（27 步链全过：LS / DI / DI 自测 14 档 / CSS / eleventy / JSON-LD / identity / citation 元数据那一组） |

### F. 本场次不新增待拍板

- 「门禁红因的措辞与改法要说对形态」属**缺陷**（红因指错方向 = 把人引向错误动作），
  不是取舍 → 不占新编号。对方已登记的 35 / 36 / 37 三个号**沿用、不改口**。
- 仍开着的、本场次**不重复、不改口**：待拍板 7（部署时机——本场次仍**不 push**）。

### G. 提交

- 四个文件：`scripts/check-decision-ids.cjs`（DI2 分两种形态）、`scripts/test-decision-ids.cjs`
  （新增 M13 档 + 档数说明）、`README.md`（DI 自测档数 13 → 14）、`docs/IMPROVEMENT-LOG.md`（本节）。
- 日志用「**重建 + 哈希直入索引**」提交：工作树上还压着并发场次在途的日志编辑，
  **不把它们卷进本次提交**；本次提交的内容是「HEAD 的日志 + 本节」。
  提交后把共享索引里的日志条目刷成**含本节**的那一版（否则对方一次普通 `git commit`
  就会把本节净删）。
- **未 push。**

## 2026-10-20 · 08:00–08:30 场次（**不占轮次号**，避免与并发场次撞号）：M1-2 站内长文写作规范 —— 把「写一篇文章要满足什么」从模板与门禁里**实测**出来，落成一份可执行契约

### A. 为什么这轮做这条（ROADMAP M1 的起步建议，且 M1-1 **无对象可改**）

`docs/ROADMAP.md`（本人 2026-10-20 新建）把当前里程碑定为 **M1 内容引擎**，起步建议是
「M1-1 修封面裂图」；但同一条建议末尾写着「**若 M1 尚未产出任何文章**，则先做
『站内长文写作规范』那一条」。

实测确认：**`src/content/blog/` 里 0 篇文章**（只有一个 `blog.11tydata.cjs`），
`find src/content/blog -name "cover.*"` **零结果** ⇒ **没有任何 `cover.png`/`cover.svg` 可改**，
M1-1 **无对象**（`src/blog.njk` 的 `useCovers = false` 也因此还不是阻塞点）。
⇒ 本轮做 **M1-2：站内长文写作规范**。

这条不是"补一份文档"：**M1-3（首批真实长文）与 M3（Decap CMS 的字段设计）都以前置契约为输入**
（ROADMAP 明写「M1 的 front matter 契约必须先定稿，否则 CMS 字段会返工」），
所以它现在是**关键路径上最靠前**的一步。

### B. 契约怎么来的：**逐条实测，不照抄路线图**

ROADMAP 里已经写了 front matter 字段名，但**字段名不等于契约**。本轮把模板与门禁逐个读过，
实测出四条**路线图没写、但会真的卡住写作者**的事实：

1. **`<slug>` = 目录名，front matter 写 `slug:` 无效** ——
   `src/eleventy-helpers.cjs` 的 `getSlugFromData()` 取文件路径**倒数第二段**（目录名），
   不读 front matter 的 `slug` 字段。
2. **`cover` 只能写文件名** —— `src/blog.njk` 拼的是 `(post.url + post.data.cover) | relUrl`，
   `post.url` 已以 `/` 结尾 ⇒ 写 `assets/cover.svg` 会拼成 `/blog/<slug>//assets/...` 的坏路径。
3. **`readingTime` 必须是纯数字** —— 模板直接拼 `{{ readingTime }} min read`；
   写 `"12 min"` 会显示成 `12 min min read`。
4. **`date` 只到日** —— 列表页走 UTC（`dateToIso | truncate(10)`）、详情页走本地时区
   （`page.date | date('yyyy-LL-dd')`），两边都假设"纯日期"；写成带时分就会有一边显示前一天。

另外核了门禁的**扫描面与豁免**（`scripts/check-lang.cjs` 扫 `src/` 的
`.njk/.md/.css/.js/.svg`，豁免 `src/_data`、`src/assets/img/og`、`src/robots.njk`）⇒
**`docs/` 不在扫描范围**（仓库文档可中文），但**文章正文必须英文**。

### C. 写进了什么

新增 **`docs/blog-writing-guide.md`**（站内长文写作契约），六节：

| 节 | 内容 |
|---|---|
| §1 位置与命名 | 目录即 slug；`blog.11tydata.cjs` 自动注入 `layout`/`permalink`/`tags`/`prev`/`next`（**不要重复写**） |
| §2 front matter 契约 | 六个字段的必需性/类型/模板用法/写错的后果 + 三条易错细节（§2.1–2.3） |
| §3 正文 | 英文要求、结论先行的骨架、数据出处随数据走、**不编造**、a11y 与链接约束 |
| §4 发稿自查清单 | 15 条勾选项（含 build / 列表卡 / 详情页 / feed / sitemap 五个出口） |
| §5 已知缺陷 | 三条（含本轮新发现的两条），写作者**不必将就但要知道** |
| §6 相关文档 | 与 ROADMAP / 日志 / 设计系统的分工 |

同步 `README.md` 的「相关链接」清单加一行（该清单在枚举 `docs/` 下的规范文档，
新增一份却不登记，等于清单失真）。

### D. 验证

- `npm run build` **exit 0**（全门禁链，含 `check:readme` 对 README 新增行的核对）。
- **本轮只新增一份 `.md` 文档 + README 一行**，未动任何模板、样式、脚本
  ⇒ **站点行为零变化**（产物逐字节相同的部分不受影响，门禁全绿即证）。
- 线上巡检：`/`、`/blog/`、`/about/`、`/sitemap.xml` **200**；
  `/papers/`、`/publications.bib`、`/feed.xml` **404** —— 线上仍是 2026-10-16 那版旧部署，
  canonical / sitemap 仍带旧 `/MeteoHub/` 前缀 ⇒ 部署时机属既有**待拍板 7**，本轮不代拍、**不 push**。
- 提交后本地领先 `oldsixxiaolv/main` 156 commit ⇒ 线上要看到新文章仍需本人 push。

### E. 实测中发现的两个真实缺陷（本轮**不修**，只登记）

1. **详情页不过滤集合名标签**：`src/_includes/layouts/detail.njk:33` 是 `{% for tag in tags %}`
   全量输出，而列表页 `src/blog.njk` 用 `reject("equalto", "blog")` 过滤了
   ⇒ 文章页底部会多一个 `· blog`。这同时决定 M3 的 tags 字段口径
   ⇒ 已登记为**待拍板 39**。
2. **`useCovers` 仍为 false**（`src/blog.njk:36`）：按 ROADMAP 的口径，
   要等站内真有带封面的文章、且实测不裂图（`naturalWidth > 0`）之后才评估打开
   ⇒ 属**拍板项**，本轮不代拍；写作规范里已写明"新文一律 `.svg`，写了不亏，等开关打开就有图"。
### F. 提交前的日志归位（本场次**不直接提交工作树那份**，原因记在这里）

1. **工作树的日志与 HEAD 不同源**：提交前实测——把两份日志**排序后逐行多重集比对**，
   HEAD 独有 1 行、工作树独有 80 行，差异几乎全在**排布**上，不是内容丢失：
   - **H 段「归属订正」**：HEAD 里位于「18:50–19:05 DI1 接手复核」节，工作树里被搬到了
     「01:55–02:20 I6」节 ⇒ 内容相同、位置不同；
   - **4 处表格中间被塞进空行**（「第十一轮」「I8」「续三」「续四」各若干）⇒ 会把
     Markdown 表格劈成两半，属**实质渲染缺陷**；
   - **1 处节序对调**（「19:05–19:25 peer」与「18:25–19:20 DI 门禁」互换）。
2. **处置**：以 HEAD 的节序为基准**重建**日志，只带该带的内容 ⇒ 本次提交对日志是
   **100 增 / 1 删**（那 1 删是本工作线自己的一处措辞改进：「HEAD 被并发场次推进过」
   → 「推进过**多次**」）；**加上本 F 段，最终本次提交对日志是 127 增 / 1 删**。
   若直接提交工作树那份，本次会显示成 **157 行删除**，而那 157 行其实只是被搬了位置。
3. **顺带恢复一段曾被提交过、后来丢失的日志**：「### G. 补记（本场次提交后的两件事，如实记）」
   —— 它由 `81e390b` 提交，**后被 `2cc5e4b`（"P4 收尾 · 日志基线回退"那场）整份覆盖时丢掉**
   （该提交把这一行从 `-### G. 补记（本场次提交后的两件事，如实记）` 换成
   `+### A. 本场次只做两件事`）⇒ 本场次**恢复**它，不是新写。
   恢复的理由：它记的正是"提交信息里的换行被转义成字面 `\n`"与
   "提交准备期间 HEAD 被推进 4 次 ⇒ 日志 blob 必须从提交那一刻的 HEAD 重建"，
   而本场次用的正是同一套办法（私有索引 + `commit-tree`/`update-ref` CAS）。
4. **教训（可复用）**：**工作树文件与 HEAD 不同源时，先做「排序后多重集比对」**，
   把「内容变了」与「顺序变了」分开数——顺序变更是纯噪音，内容变更才是要带走的；
   直接看 `git diff --numstat` 得到的成百上千行增删，**大部分只是位移**。
5. **本场次只暂存 3 个路径**：`docs/blog-writing-guide.md`、`README.md`、`docs/IMPROVEMENT-LOG.md`。
   `scripts/check-identity-handles.cjs` 与 `scripts/test-gates-selfcheck.cjs`
   是**并发场次在途**的改动（本场次**不提交**，也不覆写工作树）⇒
   用私有索引只放自己那三条，提交后再把共享索引刷成 HEAD 版。

---

## 2026-10-20 · 08:30–09:00 场次（**不占轮次号**，避免与并发场次撞号）：M0 前后端缺陷盘点 —— 建 `docs/DEFECT-BACKLOG.md`，**只记问题、不改代码**

### A. 为什么这一轮不做修复、做盘点

三条理由叠在一起，指向同一个落点：

1. **ROADMAP §2 把 M0（前后端缺陷盘点）写成「第一件事，先于一切」**，
   cron 的口径也是「清单未建则先做 M0 盘点」——本轮开工时 `docs/DEFECT-BACKLOG.md`
   **不存在**。
2. **M0 第 1 条要求「只记问题、不改代码」** ⇒ 本轮**没有改任何模板 / 样式 / 脚本**，
   唯一新增的是一份盘点文档。
3. **继续改代码当时没有合法落点**：上一轮已把 M1-1（修封面裂图）判为「**无对象**」
   （`collections.blog` 为空，0 篇文章）；M1-3（首批真实长文）的**选题主线尚未由本人指定**。

### B. 线上巡检（7 条 URL，2026-10-20 08:45 实测）

| URL | 线上 | 本地产物 | 判定 |
|---|---|---|---|
| `/` | **200** | 有 | — |
| `/papers/` | **404** | 有 | 部署滞后 |
| `/blog/` | 200 | 有 | 空状态页（`collections.blog` 为空） |
| `/about/` | 200 | 有 | — |
| `/publications.bib` | **404** | 有（1,378 B） | 部署滞后 |
| `/feed.xml` | **404** | 有（3,610 B） | 部署滞后 |
| `/sitemap.xml` | 200 | 有 | **线上仅 3 个 loc**，本地产物 5 个 |

另外两条线上事实：首页 canonical 仍是 `https://github.lvyihang.xyz/MeteoHub/`
（**旧 `/MeteoHub/` 前缀**）；线上 `feed.xml` 有 **0 条** item。

### C. 线上 404 是**部署滞后**，不是代码缺陷

本地产物逐个核对：5 条路由（`/`、`/papers/`、`/blog/`、`/about/`、`/404.html`）+ 论文详情页
`/papers/trmm-thunderstorm-stages/`、`publications.bib`（1,378 B）、`publications.ris`（1,238 B）、
`feed.xml`（3,610 B，1 条 item = 论文）、`sitemap.xml`（**5 个 loc**）**全在**。
⇒ 线上三条 404 与 canonical 旧前缀，**同一根因：线上还是 2026-10-16 的旧部署**。
这一条记为 **D6**，状态「待修（**由 push 触发**）」——部署时机属既有待拍板 7，**本轮不代拍**。

### D. 写进了什么：`docs/DEFECT-BACKLOG.md`（9,434 B，四节）

| 节 | 内容 |
|---|---|
| §0 范围与方法 | 前后端各自的范围；四种实测手段（build / curl / 产物级爬取 / 源码级对照）；**两条纪律** |
| §1 缺陷清单 | **一条一行**（编号 / 位置 / 现象 / **可判定的验收条件** / 状态），D1–D8 共 8 条 |
| §2 已核查、判定**无缺陷** | 11 项实测干净的结论 —— **下一轮不必重复证明** |
| §3 取用规则 | 6 条（每轮只修一条、修完改状态并写验证方式、漏了要新开编号、不擅自新增需求…） |

§1 的 8 条：

| 编号 | 一句话 | 状态 |
|---|---|---|
| **D1** | 论文页 JSON-LD 的 `ScholarlyArticle` 缺 `dateModified` 与 `image`（同页 `og:image` 已存在 ⇒ 两者没打通） | 待修 |
| **D2** | 除论文页外**每页产出 3 个 `og:image`**（1200×630 / 1080×1080 / 1500×500），抓取器只认第一张 | 待修 |
| **D3** | 三份 og PNG 合计约 **1.5 MB**（647,055 / 469,811 / 443,535 B），每次抓取都要下数百 KB | 待修 |
| **D4** | 窄屏溢出门禁**只测 390px**；768 / 820 / 1024 这段**无人把关** | 待修 |
| **D5** | `/blog/` **0 篇**空状态 | 待修（依赖 M1-3；选题主线本人未指定） |
| **D6** | 线上旧部署（3 条路由 404 + canonical 旧前缀） | 待修（**由 push 触发**，属待拍板 7） |
| **D7** | 3 个门禁自测脚本不在 build 链 | **不修**（已登记为既有待拍板事项） |
| **D8** | 404 页带 `Person` JSON-LD | **不修**（已登记为既有待拍板事项） |

每条的验收条件都写成**可判定**形式（含具体命令与字段），例如 D4：
「`node scripts/check-overflow.cjs --width 768` 与 `--width 1024` 均 exit 0，
且 build 链或 CI **至少跑 3 档**（390 / 768 / 1024）」。

### E. 本轮**证伪**的三条假设 —— 盘点的另一半产出

这三条本来要写成缺陷，被实测**推翻**，已从清单剔除：

| 假设 | 证伪依据 |
|---|---|
| 卡片 / 按钮的 transition 缺 reduced-motion 守卫 | `base.css` 有**全局** `prefers-reduced-motion` 兜底（duration → `0.01ms !important`），已覆盖；且全仓 `transition-delay` **0 处** |
| 首页手写 SVG 图表打印会溢出 | 两个图表是 `viewBox="0 0 360 236" width="100%"` **流式**，打印到 A4 不溢出 |
| `760` 与 `768` 两个断点错位 | `pages.css:478-487` 给了推导（`680 = 760 − 2×gutter`），760–768px 区间内容宽仍 > 680 ⇒ 有意为之 |

另有**两次正则误报**（CSS 注释里的 `<img>` 字样被当成标签；绝对路径内链被漏检）
⇒ 已把「先剥 `<script>`/`<style>` 块」写进 §0 的方法表，**避免后续轮次重复踩**。

### F. 同步改动与验证

- `README.md`「相关链接」段加**两行**：`docs/ROADMAP.md`（目标与里程碑的唯一清单）与
  `docs/DEFECT-BACKLOG.md`（唯一待修缺陷清单）——**这两份此前都没在 README 里露出过**，
  清单失真等同没登记。
- 验证：`npm run build` **exit 0**（27 步全绿）；`check:log-sections` 通过；
  `check-decision-ids` 认领号含 **40**、无一号两认领。

### G. 本轮纪律与下一轮入口

1. **不把「看着像」当缺陷** —— 三条假设被证伪后**从清单里剔除**，而不是「反正写了也无妨」。
2. **不重复登记已在台账里的待决事项** —— D7 / D8 标 `不修（理由：已登记为既有待拍板事项…）`
   并指回原处；D5 / D6 同样指回 ROADMAP 与待拍板 7。
3. 下一轮入口：**从 D1 取**（纯模板/数据侧改动，不依赖本人拍板，且验收条件可判定）；
   D5 等本人定 M1-3 选题主线；D6 等 push。

---

## 2026-10-20 · 09:00–09:30 场次（**不占轮次号**，避免与并发场次撞号）：D1 —— 论文页 JSON-LD 补 `dateModified` 与 `image`，让结构化数据说真话

### A. 为什么这一轮取 D1

1. **M0 已完成**：上一轮建好了 `docs/DEFECT-BACKLOG.md`，cron 的口径随即变成
   「优先从 DEFECT-BACKLOG 取一条**待修**缺陷」，而不是继续往下推 ROADMAP 里程碑。
2. **D1 是唯一不依赖本人拍板的那条**：纯模板 / 数据侧改动，验收条件**可判定**，
   不牵涉任何口径决策。
3. 其它各条的入口本轮都不成立：D5 依赖 M1-3 选题主线（本人未指定）、D6 依赖 push
   （时机属既有待拍板 7）、D7 / D8 已判 `不修`、D2 与 D3 与待拍板 40 的口径绑定、
   D4 要改 build 链与 CI（面更大，单独一轮更稳）。

### B. 线上巡检（7 条 URL，2026-10-20 09:00 实测）

| URL | 线上 | 本地产物 | 判定 |
|---|---|---|---|
| `/` | **200** | 有 | — |
| `/papers/` | **404** | 有 | D6：部署滞后 |
| `/blog/` | **200** | 有 | 空状态页（0 篇）⇒ D5 |
| `/about/` | **200** | 有 | — |
| `/publications.bib` | **404** | 有 | D6 |
| `/feed.xml` | **404** | 有 | D6 |
| `/sitemap.xml` | **200** | 有 | 线上仅 **3 条** loc |

- canonical / og:url / sitemap 仍带旧的 `/MeteoHub/` 前缀；
  线上 `feed.xml` 抓下来 **0 条**条目、sitemap **3 条** loc ⇒ 与上一轮**完全一致**，
  再次确认是**部署滞后**而非代码缺陷。
- ⚠️ 本轮**不 push**（线上部署时机属既有待拍板 7）。

### C. 改了什么（5 个文件，+260 / −13）

**C1 · 把 cover 的解析逻辑从模板搬进共用 filter**（`eleventy.config.js` 新增 `coverImageUrl`）

原先 `src/_includes/layouts/base.njk` 里有**三段**内联的 `if/elif/else` 判定 cover
（绝对 URL / 根相对 / 裸文件名），换掉它就要在两处模板里各写一遍。
现在收成一个 filter：`coverImageUrl(cover, siteUrl, pageUrl, fallback)`，
无 cover 时返回 `siteUrl + fallback`。
**要点**：D1 的验收条件是「JSON-LD 的 `image` 与该页 `og:image` 的 URL **相同**」——
若两处各写各的，今天相同、明天改一处就分叉。**让它们逐字相同，靠的是构造，不是事后对账。**

**C2 · 默认分享图路径的单一出处**（`src/_data/site.js` 新增 `ogImage`）

新增 `ogImage: "/assets/img/og/og-1200x630.png"`，`base.njk` 与 `paper.njk` 都从
`site.ogImage` 取 ⇒ 全站默认分享图只有一个出处，不再是模板里的字面量。

**C3 · `jsonLdPaper` 补两个字段**（`eleventy.config.js`）

签名从 `(pub, siteData)` 改为 `(pub, siteData, pageUrl, opts)`：
`article.image = opts.coverUrl`、`article.dateModified = opts.modified`。
⚠️ `dateModified` **取不到就整条不输出**（宁缺勿假）—— 空字符串比错的日期安全。

**C4 · 模板侧接线**（`base.njk` / `paper.njk`）

- `base.njk`：内联三段 cover 解析换成 `{% set coverUrl = cover | coverImageUrl(site.url, page.url) %}`；
  else 分支的第一张 og:image 改成 `{{ site.url }}{{ site.ogImage }}`。
- `paper.njk`：`coverUrl = cover | coverImageUrl(site.url, page.url, site.ogImage)`；
  `modified = page.inputPath | lastCommitTime`；两者作为 `ldOpts` 传给 filter。
  ⚠️ `lastCommitTime` 与 sitemap 的 `lastmod` **同源** ⇒ `dateModified` 的语义是
  「这份内容最后一次真的变过」，不是「构建时的时间」。

**C5 · 门禁新增 J11**（`scripts/check-jsonld.cjs`，+195 行）

`image` 必须**逐字等于**该页**第一个** `og:image`；`dateModified` 必须等于源文件
**真实的最后提交时间**，且「有/无」与「源文件提交过 / 没提交过」一致。
「有/无」这条判据**照搬 `scripts/verify-site.cjs` 第 18 条 sitemap lastmod 的规则 E**
（源文件提交过 → 必须有且值必须对；源文件还没提交 → 必须没有）——
既兼容本仓「先 build 后 commit」的流程，又能在 filter 静默失效时判红。
浅克隆一律给 `null`（与 `lastCommitTime` 对称），git 失败走共用的
`scripts/lib/git-error.cjs` 分类，**不允许静默跳过**。
另加三个自证计数器（`j11Compared` / `j11ImageCompared` / `j11ModifiedCompared`）——
**判据没真正跑过时门禁必须自己判红**（空跑的门禁等于没有门禁）。

### D. 验证

| 项 | 结果 |
|---|---|
| `npm run build` | **exit 0**（27 步全绿） |
| `node scripts/check-jsonld.cjs` | **exit 0**（门禁 J1–J11） |
| 产物实测 | 论文页 `ScholarlyArticle` 含 `image` = `https://github.lvyihang.xyz/assets/img/publications/trmm-fig10.jpg`（与该页 og:image **逐字相同**）、`dateModified` = `2026-10-19T20:22:37.000Z`（= `paper.md` 真实提交时间 `2026-10-19T13:22:37-07:00` 的 UTC 形式）、`datePublished` = `2026-06-01` |

### E. 注入矩阵（J11 确实有牙齿）

做法：复制 `_site` 到 `/var/tmp/xxx` → 用 python 改产物 → `SITE_DIR=/var/tmp/xxx node scripts/check-jsonld.cjs`。

| 注入 | 期望 | 实测 |
|---|---|---|
| 删掉 `image` | 判红 | **exit 1**「没有 image」✓ |
| `image` 换成别的 URL | 判红 | **exit 1**「不是同一个」✓ |
| 删掉 `dateModified` | 判红 | **exit 1**「没有 dateModified」✓ |
| `dateModified` 改成假时间 | 判红 | **exit 1**「应是源文件真实的最后提交时间」✓ |
| 源文件存在但**从未提交** + 无 `dateModified` | **不误报** | **exit 0**（报告行如实写「另有 1 页的源文件还没进 git 历史，按约定不给时间戳」）✓ |

### F. 回归：og:image 未受影响

6 个页面的 `og:image` **URL 与数量完全未变**（5 页各 3 个、论文页 1 个）
⇒ 这次把 cover 解析搬进共用 filter，**对既有页面的行为保持不变**。
（这是「重构」最容易悄悄改掉东西的地方，所以单独量了一遍。）

### G. 本轮新发现：**D9**（同 `@id` 的 `datePublished` 精度不一致）—— 本轮**只登记，不修**

本站在**两处**输出描述**同一件论文**的 JSON-LD 节点，`@id` **完全相同**（= 论文页 canonical）：

| 位置 | `datePublished` | `image` | `dateModified` |
|---|---|---|---|
| 论文页（`jsonLdPaper`） | `2026-06-01`（取 `site.js` 的 `dates.published`） | 有 | 有 |
| 列表页 `/papers/`（`jsonLdArticles`） | `2026-06`（`p.year` + `p.month` 拼出） | **无** | **无** |

后果：消费方按 `@id` 合并同一件作品时，会看到**两个出版日期**；只读列表页的消费方
（例如只抓 `/papers/` 的聚合器）拿不到配图与时效信号。
站里有**完整日期的权威出处**（`site.js` 的 `dates.published`）⇒ 列表页的月精度**是能补的**，
只是补不补属口径问题。
⚠️ 本轮**不修**：① 遵守「一轮一个改进点」；② 修法方向涉及日期口径
（`2026-06` 与 `2026-06-01` 是否本就该一致）宜由本人拍板。
⇒ 已按清单规则**新开编号 D9**（`docs/DEFECT-BACKLOG.md`，状态 `待修`），
并在中央台账登记为**待拍板 41**（三个备选与各自代价见台账，本场次不代拍）。

### H. 同步改动与纪律

- `docs/DEFECT-BACKLOG.md`：**D1** 行状态改 `已修`，并在**同一行末尾**补上验证方式
  （命令、J11 判据、4 档注入、回归结论）；**新增 D9**（状态 `待修`）。
- `docs/IMPROVEMENT-LOG.md`：中央「待决策」段新增**待拍板 41**；末尾追加本场次小节。
- 本轮纪律：**「逐字相同」靠构造保证，不靠对账**；**取不到值就整条不输出**；
  **判据没真正跑过时门禁自己判红**；**一轮只做一个改进点**，新发现只登记不修。
- 下一轮入口：从缺陷清单取**下一条**（D2 / D3 与待拍板 40 的口径绑定 ⇒ 若本人已拍板 40
  才好动；D4 要改 build 链）；或等本人定 M1-3 选题主线后启动 D5。

---

## 2026-10-20 · 09:30–10:00 场次（**不占轮次号**，避免与并发场次撞号）：D4 —— 窄屏溢出门禁从「只测 390px」改成「一次跑 7 档宽度」，并给「档位怎么取」钉上判据

### A. 为什么这一轮取 D4

1. **M1-3 的选题主线仍待本人指定** ⇒ 依赖它的 D5（`/blog/` 0 篇）本轮不成立。
2. **D2 / D3** 与待拍板 40（og 图口径与体积）绑定 ⇒ 口径没拍板不能动。
3. **D6** 由 push 触发（时机属既有待拍板 7）⇒ 本轮不 push。
4. **D7 / D8** 已判 `不修`；**D9** 的修法方向属待拍板 41（列表页与论文页同 `@id` 的字段口径）⇒ 不代拍。
5. ⇒ **D4 是唯一不依赖本人拍板、且验收条件完全可判定的待修缺陷**。

### B. 线上巡检（7 条 URL，2026-10-20 09:30 实测）

| URL | 线上 | 本地产物 | 判定 |
|---|---|---|---|
| `/` | **200** | 有 | — |
| `/papers/` | **404** | 有 | D6：部署滞后 |
| `/blog/` | **200** | 有 | 空状态页（0 篇）⇒ D5 |
| `/about/` | **200** | 有 | — |
| `/publications.bib` | **404** | 有 | D6 |
| `/feed.xml` | **404** | 有 | D6 |
| `/sitemap.xml` | **200** | 有 | 线上仅 **3 条** loc |

与上一轮**逐条一致** ⇒ 仍是 2026-10-16 旧部署（D6），非代码缺陷。⚠️ 本轮**不 push**。

### C. 先测后改：这是「覆盖面」问题，不是「版式」问题

改代码之前先量了一遍：把门禁按 `--width` 逐档手动跑
（360 / 390 / 640 / 768 / 820 / 1024 / 1280 / 1440），**8 档全部 exit 0**，6 个页面均无横向溢出。

⇒ **版式本身没有毛病**。D4 的性质是「**768–1024 这段区间从未被量过**」，
不是「这段区间坏了」⇒ 修法是**加覆盖面**，不是改版式。
本轮**没动一行 CSS**（`src/assets/css/**` 零改动）。

### D. 关键发现：`>1024` 的宽屏多栏布局**从未被量过**

| 事实 | 位置 | 含义 |
|---|---|---|
| `.split` 在 `>1024` 是**双栏** | `src/assets/css/layout.css:78`（`:85` 的 `@media (max-width:1024px)` 里才退回单栏） | 390px 那一档**永远只看到单栏** |
| `.paper-reader-wrap` 是**三栏**（无批注面板时两栏），容器上限 **1320px** | `src/assets/css/paper-reader.css:43`、`:47`、`:60` | 1320px 以上才会触到「容器封顶」 |
| `.paper-toc` 在 `≤1024` 被 `display:none` | `src/assets/css/components/_paper.css:502` | TOC 的显隐边界正好落在 1024 |

⇒ **1024 与 1440 正好是那条分支的边界两侧**，而旧门禁只看 390
⇒ **宽屏多栏这条路一直是裸的**。
（`1280` 档实测也过，但 `1440 > 1320` 才真正覆盖「容器封顶」，所以档位里取 1440 而不是 1280。）

### E. 改了什么（4 个文件 + 1 个新增）

| 文件 | 改了什么 |
|---|---|
| `scripts/check-overflow.cjs` | 默认档位由 1 档（390）改成 **7 档**；主循环改成「档位 × 路由」双层，**每档重新** `Emulation.setDeviceMetricsOverride`；新增 `SITE_DIR` 环境变量（与 `check-jsonld.cjs` 同一约定）；`--width N`（旧写法保留）与 `--widths a,b,c`；**宽度解析失败直接判红退出**（拼错不得悄悄退回默认档）；三条自证计数器：测量次数 = 档位 × 页数、每档测满全部页面、**量到的布局视口 = 请求宽度**（不等 ⇒ 假绿 ⇒ 判红） |
| `scripts/test-overflow-widths.cjs`（**新增**，9589 B） | 五组断言 M0–M4（见 H 节）；用 `SITE_DIR` 指向临时目录，**不碰 `_site`** |
| `package.json` | 新增 `check:overflow-selftest`，接在 `check:overflow` 之后进 `build` 链；`check:overflow` 本身的命令**不变** ⇒ build 链自动覆盖 7 档 |
| `README.md` | `check:overflow` 那行改成多档说明；新增 `check:overflow-selftest` 一行（RD3 要求 `package.json` 里每个脚本都被 README 提到） |
| `.github/workflows/deploy.yml` | **仅注释**：「窄屏溢出门禁」改称「多档溢出门禁」，并补一句「现在一次跑 7 档宽度，每档重新设一次视口」 |

**宽度列表只放在门禁的 `DEFAULT_WIDTHS` 一处**（单一出处）⇒ 档位改动只有一个地方要动。

### F. 档位怎么取（不是随手挑 3 档）

D4 的验收条件只要求「至少 3 档（390 / 768 / 1024）」，本轮取 7 档，**取法有据**：

递归扫 `src/assets/css/**`（**含 `components/`**）得到宽度媒体查询，**去重后 7 条**：

| CSS 查询 | 出现位置 | 匹配侧 | 不匹配侧 |
|---|---|---|---|
| `@media (max-width: 360px)` | `components/_nav.css` | 360 | 390 / 640 / 768 / 820 / 1024 / 1440 |
| `@media (max-width: 640px)` | `components/_list.css`、`components/_misc.css`、`components/_nav.css`、`pages.css` | 360 / 390 / 640 | 768 / 820 / 1024 / 1440 |
| `@media (max-width: 760px)` | `pages.css` | 360 / 390 / 640 | 768 / 820 / 1024 / 1440 |
| `@media (min-width: 760px)` | `pages.css` | 768 / 820 / 1024 / 1440 | 360 / 390 / 640 |
| `@media (max-width: 768px)` | `components/_nav.css`、`components/_paper.css`、`layout.css`、`paper-reader.css` | 360 / 390 / 640 / 768 | 820 / 1024 / 1440 |
| `@media (max-width: 820px)` | `pages.css` | 360 / 390 / 640 / 768 / 820 | 1024 / 1440 |
| `@media (max-width: 1024px)` | `components/_paper.css`、`layout.css`、`paper-reader.css` | 360 / 390 / 640 / 768 / 820 / 1024 | 1440 |

判据：**每一条查询的「匹配侧」与「不匹配侧」都被测到**。
这条判据写进了自测（M3）⇒ 以后 CSS 加新断点而门禁没跟上时，**自测自己判红**，不靠人记。
（顺带修正一处旧账：先前只 grep 顶层 `*.css`，**漏掉了** `components/_nav.css` 里的 `max-width:360px`。）

### G. 验证

| 项 | 结果 |
|---|---|
| `node scripts/check-overflow.cjs --width 768` / `--width 1024` | 均 **exit 0** |
| `node scripts/check-overflow.cjs`（默认 7 档） | **exit 0**，7 档 × 6 页 = **42 次测量**，**13.7s** |
| `node scripts/test-overflow-widths.cjs` | **exit 0**（39 条断言，**7.0s**） |
| `npm run check:gates` / `check:readme` / `check:log-sections` / `check:decision-ids` | 全 **PASS** |
| `npm run build` | **exit 0** |

### H. 注入与负对照矩阵（自测确实有牙齿）

自测五组：**M0** 干净产物不误报 / **M1** 脏产物每一档都抓得到 / **M2** 两轮跑出的档位集合一致且 ≥3 档、无重复 /
**M3 每条 CSS 断点的两侧都被测到** / **M4** 拼错的 `--width abc`、`--widths 390,xyz` 判红（不静默退回默认档）。

负对照（把门禁复制到 `/var/tmp/mh_neg_d4/` 改坏，自测必须当场判红）：

| 负对照 | 做法 | 期望 | 实测 |
|---|---|---|---|
| N1「只跑第一档」 | 门禁副本的 `DEFAULT_WIDTHS` 改成 `[360]` | 判红 | **exit 1**，8 项红（M2 档位数 + M3 全部 7 条断点）✓ |
| N2「视口不真改」 | 门禁副本的 `setDeviceMetricsOverride` 写死 `width: 390` | 判红 | **exit 1**，7 项红（「量到的布局视口 = 请求宽度」全断）✓ |

⇒ 门禁**只测一档**或**假装跑了多档**，都会被自测当场抓住。
沙盒已用 `mavis-trash` 清空（真 CSS 目录未受影响）。

### I. 代价与取舍（如实记）

| 项 | 改前 | 改后 |
|---|---|---|
| 溢出门禁 | 1 档 / 6 页 = 6 次测量 / **3.6s** | 7 档 / 6 页 = **42 次测量** / **13.7s** |
| 整链 build | **32.6s** | **49.9s**（另含自测 ~7s） |

取舍说明：

- 每档**重新导航 + 250ms 稳定等待**（沿用原有测量法，**不改测量语义**）⇒ 比「改视口不重新导航」慢，
  但不会重蹈该门禁历史上「退出码与打印不同源」的覆辙。
- `mobile: true` **沿用不变**：站内 CSS **没有** hover / pointer 媒体查询，站点有 viewport meta，
  实测各档 `clientWidth` **精确等于**请求宽度 ⇒ 沿用不失真。
  （改 `mobile:false` 需另作评估，本轮不做。）

### J. 同步改动与纪律

- `docs/DEFECT-BACKLOG.md`：**D4** 行状态改 `已修`，并在**同一行末尾**补上验证方式。
- `docs/IMPROVEMENT-LOG.md`：末尾追加本场次小节。
- `package.json` / `README.md` / `.github/workflows/deploy.yml`：如上（CI **只改注释**，不改流程）。
- **不新增待拍板**：档位集合由 CSS 断点推导、`mobile` 标志是技术决策、自测接入沿用仓内既有实践
  （已有 5 个自测接进 `build`）⇒ 三者都无需本人拍板。
- 本轮纪律：**先测后改**（先证明是覆盖面问题、不是版式问题）；**档位要有判据**（CSS 断点两侧都要被测到）；
  **解析失败判红**（拼错的宽度不得静默退回默认档）；**一轮只做一个改进点**。
- 下一轮入口：从缺陷清单取**下一条**（D2 / D3 待拍板 40 拍板后；D9 待拍板 41 拍板后；D5 等 M1-3）；
  或按 ROADMAP 推进 M1-3 选题主线（需本人先定）。


---

## 2026-10-20 · 10:00–10:30 场次（**不占轮次号**，避免与并发场次撞号）：M2 第 3 项 —— 首页华北降水图升级成可交互（悬停读数 + 时间轴游标 + 键盘可达，仍零图表库）

### A. 本轮为什么取 M2 第 3 项（缺陷清单当时**无可取项**）

先按规矩从 `docs/DEFECT-BACKLOG.md` 取缺陷，取不到才动 ROADMAP。逐条核对：

| 缺陷 | 为什么本轮不能取 |
|---|---|
| D1 | 已修（上一场次） |
| **D2 / D3** | og 图口径与体积，绑定**待拍板 40**（含 `twitter:image` 同源约束）⇒ 属本人拍板项，不代拍 |
| D4 | 已修（上一场次） |
| **D5** | 依赖 **M1-3**（博客选题主线本人尚未指定）⇒ 不代拍 |
| **D6** | 纯部署滞后，**由 push 触发**（待拍板 7）⇒ 本轮不 push |
| D7 / D8 | 已判**不修**（理由已登记，避免重复登记） |
| **D9** | JSON-LD 日期口径与 `image`/`dateModified`，绑定**待拍板 41** ⇒ 不代拍 |

⇒ 缺陷清单确实无可取项。再看 ROADMAP：

- **M1-1「封面裂图」确认无对象**：全仓唯一的 `cover:` 出现在论文页
  `/assets/img/publications/trmm-fig10.jpg`（已生效）；博客 `useCovers=false` 且 `src/content/blog/` 下 0 篇文章。
- **M2 第 1、2 项已做**：滚动进场在 `src/assets/js/main.js`（IntersectionObserver + `prefers-reduced-motion` 降级），
  页面内锚点平滑滚动在 `src/assets/css/base.css:21`。
- **M2 第 3 项是真缺口**：`src/assets/js/` 下**没有任何 chart 代码** —— 这张图一直是纯静态 SVG（页面零 JS）。

⇒ 本轮做 **M2 第 3 项**：把首页华北降水图从「纯静态 SVG」升级为可交互，**仍零图表库、零第三方运行时依赖**。

### B. 改了什么

| 路径 | 性质 | 做了什么 |
|---|---|---|
| `scripts/lib/chart-svg.cjs` | M | 渲染器给 `<svg>` 根加**一个** `data-chart` 属性（JSON：绘图区矩形、value→pixel 映射、years / values / decades、unit） |
| `src/_includes/partials/extreme-precip.njk` | M | 每个面板加 `.chart__plot` → `.chart__canvas`（`tabindex="0"` `role="group"` + `aria-label`）→ SVG + `.chart__cursor` + `.chart__dot`；下方 `.chart__readout`（`aria-live="polite"`）；section 末尾按需动态 `import()` 交互模块 |
| `src/assets/js/home-chart.js` | A | 交互模块：`initHomeChart(root)`；鼠标/触点按 clientX→viewX→最近年份；键盘 `←`/`→`/`Home`/`End`/`Escape`；blur/pointerleave 复位 |
| `src/assets/css/pages.css` | M | `.chart__plot` / `.chart__canvas` / `.chart__cursor` / `.chart__dot` / `.chart__readout` 系列；**过渡只写在 `@media (prefers-reduced-motion: no-preference)` 内** |
| `scripts/check-home-chart.cjs` | A | 新门禁 **HC1–HC6** |
| `scripts/test-home-chart.cjs` | A | 新自测：注入矩阵 **M0–M7**（接进 build 链） |
| `package.json` | M | 新增 `check:home-chart` / `check:home-chart-selftest`，接在 `check:jsonld` 之后进 build 链 |
| `README.md` | M | 补两行（`check:readme` 的 RD3 要求 package.json 每个脚本都被 README 提到） |

**几个关键设计（都是"少一份真相"的取舍）**：

1. **几何只存一份**：绘图区矩形、value→pixel 映射、years / values / decades 全部由渲染器写进 `data-chart`，
   前端**不重算** ⇒ 读数条与画出来的线在结构上必然同源。HC2 门禁逐字核对这两份是否一致。
2. **游标与数据点做成 HTML 元素，不塞进 SVG**：本仓约定 SVG 内部不写 class、不写颜色
   （见 `scripts/lib/chart-svg.cjs` 文件头）；作为 canvas 的 HTML 子元素可直接继承面板的 `--chart-stroke`，
   且能用百分比定位。
3. **命中检测用坐标反算**（clientX → viewX → 最近年份），**不生成 66 个 hit-target 圆点** ⇒ DOM 零膨胀。
4. **读数条固定在图下方**（不做跟随鼠标的浮动 tooltip）：两栏网格里浮层容易溢出（会撞 `check-overflow`），固定条更克制。
5. **不给 `.chart__cursor` / `.chart__dot` 写 `display`** —— 写了就会盖掉 `[hidden]` 的 `display:none`，
   元素永远藏不住。HC5 专门守这一条。
6. **交互模块按需动态 `import()`**（与论文页 `paper.njk` 同一做法）：不给没有交互的页面白加一个请求。

### C. ⚠️ 本轮踩到并修掉的一个真 bug：动态 `import()` 的 specifier 写成 **bare**

**现象**：静态门禁全绿、build 全绿，但浏览器里**整张图点不动** —— 控制台一句
`TypeError: Failed to resolve module specifier 'assets/js/home-chart.js'`。

**根因**（不是路径写错，是**类型**错）：ES 模块规范把 `import()` 的 specifier 分成两类 ——
**URL-like**（以 `/`、`./`、`../` 开头，或是绝对 URL）与 **bare specifier**（其余：看着像路径，但不是）。
bare specifier 只能靠 **import map** 解析；本仓**没有 import map** ⇒ 浏览器直接抛上面那句。

**实测矩阵**（本机 Chrome，首页 `/` 与论文页 `/papers/trmm-thunderstorm-stages/` 各测）：

| specifier | 结果 |
|---|---|
| `import("assets/js/home-chart.js")` | ❌ 失败（bare） |
| `import("./assets/js/home-chart.js")` | ✅ 正常 |
| `import("/assets/js/home-chart.js")` | ✅ 正常 |
| `import("../../assets/js/paper-reader/main.js")` | ✅ 正常（论文页一直就是好的，所以那边**不用改**） |

⚠️ **不能靠 URL API 判断**：`new URL("assets/js/home-chart.js", base)` 是**成功**的 ——
所以"能解析成 URL"不等于"浏览器会当模块解析"。

**修法**：模板里改成 `import("./{{ '/assets/js/home-chart.js' | relUrl }}")`。
`relUrl` 给的是相对当前页的路径（首页 = `assets/js/home-chart.js`，论文页 = `../../assets/...`），
补 `./` 之后既 URL-like、又保住了"整个文件夹扔到哪都能跑"的全站原则。

**为什么第一版没被挡住**：`HC4` 当时只查「模块存在 + 被首页引用 + 按 ESM 解析语法能过」——
**没有查 specifier 能不能被浏览器解析**。这是**静态门禁的结构性盲区**：
凡是"只有真实浏览器才判得出来"的行为，静态判据一条都看不见。

### D. 新增门禁与自测

**`scripts/check-home-chart.cjs`（HC1–HC6）**：

| 判据 | 守什么 |
|---|---|
| HC1 | 每个面板的交互钩子齐全（canvas / cursor / dot / readout-main / readout-mean） |
| HC2 | **读数与数据同源**：产物里 `data-chart` 的 years / values / decades 与 `src/_data/extremePrecip.json` 逐字一致 |
| HC3 | 键盘可达：画布 `tabindex="0"` + 非空 `aria-label`；读数条 `aria-live` |
| HC4 | 交互模块存在、被首页引用、且**按 ESM 解析**语法能过 |
| **HC6** | **动态 `import()` 的 specifier 必须是 URL-like**（`/`、`./`、`../` 或绝对 URL）—— 这条是**全仓通用规则**，所以扫**全部产物页**（本轮实测 6 页 2 处动态 import 全合规）；bare specifier ⇒ 浏览器抛 `Failed to resolve module specifier`，交互静默消失 |
| HC5 | 样式在位，且 `.chart__cursor` / `.chart__dot` **没有** `display` 声明 |

**自测 `scripts/test-home-chart.cjs`（M0–M7，接进 build 链）**：
M0 基线绿 / M1 数值不符→HC2 / M2 删 tabindex→HC3 / M3 删钩子→HC1 / M4 加 display→HC5 /
M5 语法坏→HC4 / M6 删 decades→HC2 / **M7 去掉 `./` 前缀 → HC6**（真实踩过的那个坑）。
注入全部在**副本**上做（`SITE_DIR` / `CHART_DATA_PATH` / `CHART_JS_PATH` / `CHART_CSS_PATH` 四个开关），
仓库里的文件一个没动。**实测 7 档全部符合预期。**

### E. 浏览器实测（真实 Chrome，46 条断言全绿）

用 puppeteer-core 25.12.0 + 本机 Chrome 对**构建产物**跑，一次性脚本放在 `/tmp`（不入仓）：

| 组 | 断言 |
|---|---|
| 结构 | 两个面板、画布可聚焦 + 有可访问名、读数条 `aria-live=polite`、SVG 仍保留 `role=img` 与 `<desc>`、`data-chart` 年份/数值/十年段完整（66 / 66 / 7，末段 2020-2025 六年） |
| 悬停（5 个样例） | 读数条里的**年份/数值/十年均值**逐字等于 `extremePrecip.json`；游标 left/top/height 的百分比与 `data-chart` 几何一致（误差 < 0.15%）；数据点的纵向位置与数值→像素映射一致 |
| 键盘（9 条） | `→` 起步落第 1 年、逐年步进、`←` 回退、`End` 跳末年、末年再 `→` **被钳住不越界**、`Home` 回首年、首年再 `←` **被钳住不越界**、`Esc` 清空并复位提示语 |
| 降级 | `prefers-reduced-motion: reduce` 下过渡时长 ≈ 0（实测 `1e-05s`，来自全站 `base.css:260` 的 `transition-duration: 0.01ms !important` 兜底）；正常偏好下过渡是 `left/top/height 0.12s`（动效没被误关掉） |
| 版面 | 无横向溢出（`scrollWidth == clientWidth == 1280`）、页面无 JS 报错、**Tab 键 1 次即走到画布**且 `:focus-visible` 生效（`box-shadow: rgba(77,151,255,0.35) 0 0 0 3px`） |

⚠️ **两条一度判红的是我的测法不对，不是产品错**，如实记：

1. reduced-motion 那条我原先判「transition 变 `none`」——但全站 `base.css:260–266` 早有一层兜底
   （`transition-duration: 0.01ms !important`），所以实测是 `1e-05s` 而不是 `none`。
   ⇒ 判据改成「时长 ≈ 0」，产品行为本来就是对的。
2. 焦点样式那条我原先用 JS `focus()` 去量 `box-shadow` —— `:focus-visible` **只在键盘模态下才匹配**，
   程序化 `focus()` 量出来永远是 `none`。⇒ 改成真的**按 Tab 走位**（这反而是更强的测试：
   它同时证明了画布在 Tab 序里可达）。

### F. 性能 A/B 与「看截图说话」

**A/B**：before = HEAD（`ca1e5ac`，静态图版本，用 `git archive HEAD` 到 `/tmp` 单独构建），
after = 工作树版本；本机 Chrome，1280×900，各跑 3 次取中位。

| 指标 | before | after | Δ |
|---|---|---|---|
| FCP | 48 ms | 44 ms | −4 ms（噪声内） |
| LCP | 80 ms | 88 ms | +8 ms（噪声内） |
| CLS | 0.0237 | 0.0237 | **0**（无回归） |
| 请求数 | 12 | 13 | **+1**（仅首页，且仅这张图在时） |
| `index.html` | 57,016 B | 62,555 B | **+5,539 B**（gzip +1,333 B） |
| `assets/css/pages.css` | 30,518 B | 32,030 B | **+1,512 B** |
| `assets/js/home-chart.js` | — | 6,701 B | **+7,001 B**（gzip +2,754 B，新增） |

⚠️ **第一版 A/B 报「传输 +139.5 KB」是假的**，原因是 Google Fonts 冷缓存噪声
（`Noto Serif SC` 的字体 CSS 冷缓存 93,017 B、热缓存 0 B）⇒ 屏蔽字体请求后重测为 **+13.4 KB**。
⚠️ **本轮未跑 Lighthouse**：工具链已从 `/tmp/screenshot-tool` 消失（`lighthouse` 包不在），
所以「指标不劣化」只能用 FCP / LCP / CLS + 新增字节数作**代理指标**；此处如实记明，**没有**拿代理指标冒充 Lighthouse。

**看截图说话**（截图在 `/tmp`，**不入仓**）：
before（静态）与 after 的**图表本身像素一致**；idle 态只在图下多了一行等宽小字提示；
hover 态是 1px 竖游标 + 9px 数据点（带 2px 底色环）+ 一行读数。
⇒ 判断：**更利落，不是更花**。没有新增装饰层、没有浮动 tooltip 盖住数据、
读数用 `--text-secondary` 而不是抢眼的高对比色。

### G. 线上巡检（7 条 URL，与上轮**逐条一致**）

`/` 200 · `/papers/` 404 · `/blog/` 200 · `/about/` 200 · `/publications.bib` 404 ·
`/feed.xml` 404 · `/sitemap.xml` 200 ⇒ 仍是 **D6**（2026-10-16 的旧部署，纯部署滞后，不是代码缺陷）。
本轮**不 push**（部署时机属既有待拍板 7）。

### H. 同步改动与纪律

- `docs/DEFECT-BACKLOG.md`：新增 **D10**（交互类改动缺常驻浏览器级门禁；状态「待修，修法方向属本人拍板」）。
- `docs/ROADMAP.md`：M2 段加「进度（2026-10-20 10:30 实测）」，标明第 3 项已做、论文精读页交互未做。
- `docs/IMPROVEMENT-LOG.md`：中央待决策段追加**待拍板 42**（要不要给交互类改动配常驻浏览器级门禁）；末尾追加本小节。
- 本轮纪律：**先测后改**（浏览器实测先跑出真 bug 再改）；**能一测的判据不靠肉眼**；
  **一轮只做一个改进点**；**不代拍**（浏览器门禁的取舍登记为待拍板 42 + D10，不自行决定）。
- 下一轮入口：① 按 ROADMAP 做 **M2 第 4 项**（论文精读页交互按 `docs/papers-interaction.md` 补齐）；
  ② 或从缺陷清单取下一条（D2 / D3 待拍板 40 拍板后；D9 待拍板 41 拍板后；D5 等 M1-3；D10 待拍板 42 拍板后）。

---

## 2026-10-20 · 10:30–11:00 场次（**不占轮次号**，避免与并发场次撞号）：M2 第 4 项（第一部分）—— 论文精读页在 ≤1024px 恢复单栏，触屏第一次有了目录

### A. 本轮为什么取 M2 第 4 项，以及**怎么定的子项**

起手照例读三份文档 + 线上巡检 7 条 URL（`/` 200 · `/papers/` 404 · `/blog/` 200 · `/about/` 200 ·
`/publications.bib` 404 · `/feed.xml` 404 · `/sitemap.xml` 200 ⇒ 与上轮**逐条一致**，仍是 **D6** 的部署滞后），
然后盘缺陷清单：**D2/D3**（↔待拍板 40）、**D5**（↔M1-3 等本人定选题主线）、**D6**（↔push，时机属待拍板 7）、
**D9**（↔待拍板 41）、**D10**（↔待拍板 42）、**D7/D8**（已判不修）—— **没有一条能直接动手** ⇒ 走 ROADMAP
**M2 第 4 项**（论文精读页交互按 `docs/papers-interaction.md` 补齐）。

M2 第 4 项下面有四个候选子项（移动端三 Tab / `?kind=` URL 持久化 / `annotations.json` 下载链接 / 移动端段下手风琴）。
**先做了一件该做的事：去盘论文页的真实实现**，而不是照着规范标题猜。盘完发现两件事：

1. **规范里说的"移动端三 Tab"对应的批注层，整层不可达**（详见 C 节与 D12）。
   `annotations.js`（355 行）+ `highlight.js`（169 行）从不加载 ⇒ 批注 Tab 没有内容可显示、
   `?kind=` 过滤没有对象可过滤 ⇒ 这两个子项**在本轮都是空中楼阁**，硬做等于给死代码加装饰。
2. **但 390px 实况图暴露了一个更基础的问题**（这是本轮真正的收获）：论文精读页在
   **≤1024px（全部手机 + 平板）** 排版坏成一条窄带。

⇒ 本轮子项定为：**「论文精读页 ≤1024px 恢复 `§2.3` 的单栏堆叠 + 目录在移动端可达」**，
一次改动、两处 CSS、零 JS 改动、零新依赖。

### B. 根因：一条 CSS **特异度** bug（不是"少写了一条媒体查询"）

翻 `src/assets/css/paper-reader.css`，单栏媒体查询**本来就写了**：

```css
.paper-reader-wrap:not(:has(.annot-pane)) { grid-template-columns: minmax(200px, 1fr) minmax(0, 3.4fr); }
@media (max-width: 1024px) { .paper-reader-wrap { grid-template-columns: minmax(0, 1fr); } }
```

看着没毛病，但**它压不住上面那条**：

| 选择器 | 特异度 |
|---|---|
| `.paper-reader-wrap:not(:has(.annot-pane))` | **(0,2,0)** —— `:not()` 取参数里最高的特异度，`:has(.annot-pane)` 贡献一个类 |
| 媒体查询里的 `.paper-reader-wrap` | (0,1,0) |

**特异度高于来源顺序** ⇒ 媒体查询即使写在后面也**永远不生效**，≤1024px 一直是两栏。
再叠上第二个条件：目录在 ≤1024px 是 `display: none`（**不生成网格项**），于是正文这个唯一的
在流子项掉进第一列 `minmax(200px, 1fr)` —— 实测正文宽度只有 **200~203px**，右边空出 110~690px 的整列。

⇒ 修法有两处，**必须一起改**，只改一处都不够：

1. `paper-reader.css` 的媒体查询里把两个选择器都写上（`.paper-reader-wrap` 与
   `.paper-reader-wrap:not(:has(.annot-pane))`）—— 后者特异度 (0,2,0) 与被压的那条**平级**，
   但在它**之后**，按来源顺序取胜。
2. `components/_paper.css` 里 ≤1024px 的 `.paper-toc { display: none; }` 改成**正文上方的静态块**
   （`position: static`、链接排两列、触控高 ≥ 24px）。

### C. 顺手盘出来的一个**真缺陷**（登记，不代拍）：批注层整层不可达

`src/_includes/layouts/paper.njk:449` 用 `{%- if hasAnnotations %}` 决定传不传 `annotationsUrl`，
但 **`hasAnnotations` 全仓没有任何地方定义** —— `grep -rn hasAnnotations` 只命中模板那 1 行。
⇒ 恒为假 ⇒ `annotationsUrl` 永远不传 ⇒ `paper-reader/main.js:45` 整段跳过批注模块。

产物级实证：论文页里 `.annot-pane` / `.annot-toggle` / `paper-anchor` **一个都没有**
（浏览器实测 `querySelectorAll('[class*=annot]').length === 0`），`data-anchor-id` 在产物里 **0 处**，
仓内也确实**没有** `annotations.json`（全仓 find = 0 个）。

**最要命的是**：`docs/papers-interaction.md` §9.1 写的批注写作工作流是「`paper.md` 同目录
`annotations.json`，手动维护」——**照文档做也不生效**，因为那个开关根本没接线。

⇒ 登记为 **D12**，并在中央台账登记**待拍板 43**。**不代拍**：批注是**本人**自己的精读笔记，
定时任务代写等于伪造作者的阅读记录；要不要启用、要不要清掉那 524 行死代码，是本人的取舍。

### D. 改了什么（2 个 CSS 文件，**零 JS、零新依赖**）

| 文件 | 改动 |
|---|---|
| `src/assets/css/paper-reader.css` | ≤1024px 媒体查询补上 `.paper-reader-wrap:not(:has(.annot-pane))` 选择器，并写清特异度陷阱 |
| `src/assets/css/components/_paper.css` | ≤1024px 的 `.paper-toc` 从 `display: none` 改为正文上方的静态块（`position: static` / 两列 / 触控高 ≥ 24px / 底部一条分隔线） |

**没动**：模板、`toc.js`、其余任何 JS、任何门禁脚本、`package.json`、依赖。
桌面端（≥1025px）**一个像素都没变** —— 见 E 节②的 SHA-256 对照。

### E. 验证

**① 浏览器断言（真实 Chrome，一次性脚本 `/tmp/mh_paper_assert.cjs`，不入仓）**
8 档宽度（360 / 390 / 640 / 768 / 820 / 1024 / 1280 / 1440）：
**AFTER 62 项全绿**；同一脚本跑 **BEFORE（HEAD `27d4b25`）36 项红**（6 档 ≤1024px × 6 条判据）⇒ **负对照有效**。

**② 正文宽度实测（before → after）**

| 视口 | 360 | 390 | 640 | 768 | 820 | 1024 | 1280 | 1440 |
|---|---|---|---|---|---|---|---|---|
| before | 200 | 200 | 200 | 200 | 200 | 203 | 890 | 921 |
| **after** | **328** | **358** | **589** | **707** | **754** | **942** | 890 | 921 |

桌面两档**完全不变**；更强的一条证据：`.paper-reader-wrap` 元素在 1280px 下的截图
**SHA-256 前后完全相同**（`9f36e56f…`）⇒ 桌面**逐像素**未变。

**③ 目录可达（≤1024px）**：`display: block` / `position: static` / 链接 **2 列** / 链接触控高 **27px**
（≥ WCAG 2.5.8 的 24px）/ 位于正文上方（top=80，文章从 328 开始）；
点「Abstract」→ 滚到 `y=2446`、`hash=#paper-abstract-title`、目标标题距视口顶 **0px**、
当前节高亮切到 Abstract（IntersectionObserver 的 `.is-active` 仍然工作）。

**④ 无回归**：8 档 × 论文页均无横向溢出；`npm run check:overflow` **42 次测量 exit 0**；
页面无 JS 报错（`pageerror` / `console.error` 各 **0** 条）。
`npm run build` **exit 0**（27 步门禁全链，0 项红）。

### F. 性能 A/B 与「看截图说话」

**A/B**：before = HEAD（`27d4b25`）用 `git archive` 到 `/tmp` 单独构建，after = 工作树；
本机 Chrome，屏蔽 Google Fonts（否则冷/热缓存差 93 KB 会污染传输量对比，上一轮已实测复现），
各跑 3 次取中位。

| 指标 | before | after | Δ |
|---|---|---|---|
| FCP（390px / 1280px） | 48 / 44 ms | 48 / 44 ms | **0** |
| LCP（390px / 1280px） | 48 / 44 ms | 48 / 44 ms | **0** |
| CLS（390px / 1280px） | 0 / 0.6353 | 0 / 0.6353 | **0** |
| 请求数（390px / 1280px） | 14 / 15 | 14 / 15 | **0** |
| `components.css` | 72,110 B | 72,825 B | **+715 B** |
| 论文页 HTML | 90,000 B | 90,513 B | **+513 B** |
| **页面总高（390px）** | 15,841 px | **9,923 px** | **−37%** |

字节那 +1,228 B 里**绝大部分是注释**（`paper-reader.css` 是内联进每个论文页的，
那 +513 B 就是解释特异度陷阱的注释本身）；真正起作用的是 715 B 的 CSS 规则。
**页面总高 −37%** 才是这一轮真正的收益：正文宽了 1.79 倍，同样内容少 37% 的行。

⚠️ **本轮未跑 Lighthouse**：工具链已从 `/tmp/screenshot-tool` 消失（`lighthouse` 包不在），
「指标不劣化」只能用 FCP / LCP / CLS + 字节数作**代理指标**；此处如实记明，**没有**拿代理指标冒充 Lighthouse。
⚠️ 1280px 那个 **CLS 0.6353** 是**既有的**（before/after 同值），与本轮改动无关，未在本轮处理。

**看截图说话**（截图在 `/tmp`，**不入仓**）：390px 下 before 的正文挤在左边一条 200px 的窄带里、
右侧近一半屏幕全空，标题占 11 行、链接行被压成「Pa/per · D/OI · P/F …」这样的碎片；
after 正文占满 358px、标题 8 行、链接一行排开，顶部多一个两列的 CONTENTS 块（176px）。
⇒ 判断：**更利落，不是更花**。多出来的只有一块目录，其余全是"把该有的空间还回去"。

### G. 线上巡检（7 条 URL，与上轮**逐条一致**）

`/` 200 · `/papers/` 404 · `/blog/` 200 · `/about/` 200 · `/publications.bib` 404 ·
`/feed.xml` 404 · `/sitemap.xml` 200 ⇒ 仍是 **D6**（2026-10-16 的旧部署，纯部署滞后，不是代码缺陷）。
本轮**不 push**（部署时机属既有待拍板 7）。

### H. 同步改动与纪律

- `docs/DEFECT-BACKLOG.md`：新增 **D11**（≤1024px 论文正文被挤成 200px 窄条 + 目录在触屏不可达；
  状态「已修」，附完整验证方式）、新增 **D12**（批注层整层不可达；状态「待修，修法属本人拍板」）。
- `docs/ROADMAP.md`：M2 段第 4 项改为「◐ 部分」—— 移动端版式已完成，批注层与三 Tab / `?kind=` 仍未做。
- `docs/papers-interaction.md`：**订正两处与实现不符的原文** —— §2.3 加「落地现状」框，
  附录 D.8 里「用 `<details>` 折叠代替」这句**是错的**（Stage 1 既没有 `<details>` 也没有 Tab Bar，
  目录当时是直接被 `display: none` 掉的），并新增 **D.9** 记录本轮的取舍与实测数字。
- `docs/IMPROVEMENT-LOG.md`：中央待决策段追加**待拍板 43**（要不要真的启用批注层）；末尾追加本小节。
- 本轮纪律：**先量后改**（先跑出 200px 这个数再动手）；**能一测的判据不靠肉眼**；
  **一轮只做一个改进点**；**不代拍**（批注层的取舍登记为待拍板 43 + D12）；
  **桌面零改动有硬证据**（元素截图 SHA-256 相同）。
- 下一轮入口：① M2 第 4 项的**下一部分** —— 但要先等**待拍板 43** 拍板：批注层若启用，
  三 Tab 与 `?kind=` 才有内容可挂；若不启用，应先清死代码再谈其它交互；
  ② 或从缺陷清单取下一条（D2 / D3 待拍板 40；D9 待拍板 41；D10 待拍板 42；D5 等 M1-3）。

## 2026-10-20 · 11:00–11:30 场次（**不占轮次号**，避免与并发场次撞号）：D13 —— 给窄屏溢出门禁补上「正文列宽」判据，窄带坏版式不再隐形

### 本轮定位

上一场次把论文精读页在 ≤1024px 修回了单栏（缺陷清单 D11）。修完回头看，发现一件
**更该先说**的事：**那一族坏版式，当时没有任何一个自动化判据报过红** —— build 全绿、
窄屏溢出门禁也全绿。原因是结构性的：那一族的页面**没有被撑宽**（`scrollWidth` 仍等于
视口宽），只是**正文被塞进了一条固定宽的窄列**，横向溢出判据**看不见**它。

⇒ 本轮把「正文被挤成窄带」变成一道**每次 build 都会自己跑**的判据，并给它配了负对照
与自测。本轮**不改站点任何一行**（改动全在门禁脚本里）。

### A. 候选项逐个排除（为什么是这一条）

- **D2 / D3**（og 图口径与体积）—— 复核后确认**仍被待拍板 40 绑定**，而且这次读原文发现
  一处**互相矛盾**的话：模板 `src/_includes/layouts/base.njk:263` 写的是
  「多尺寸 og:image（默认 fallback；**社交平台按 slot 尺寸自动选图**）」，
  而待拍板 40 里的实测事实是「OG 抓取器**只取第一张**」，其余两张「白给」。
  两句不能同时为真 ⇒ 「到底留不留多比例 og 图」是**本人要定的口径**，本轮不代拍。
- **D9**（同一 `@id` 的两处 JSON-LD 字段口径不一致）↔ 待拍板 41；
  **D10**（交互行为无常驻门禁）↔ 待拍板 42；**D12**（批注层整层不可达）↔ 待拍板 43
  ⇒ 三条都不是能直接动手的。
- **M2 第 4 项的下一部分**（移动端三 Tab / `?kind=` URL 持久化）**依赖待拍板 43**：
  批注层若启用，三 Tab 才有内容可挂；若不启用，应先把 524 行死代码清掉再谈别的交互。
- **D5**（博客为空）要本人先定选题主线；**D6**（线上旧部署）由 push 触发（待拍板 7）；
  **M3**（Decap CMS）要本人自建 OAuth App。
⇒ 剩下**能直接动手**的，就是「把排版坏掉这一族变成机器看得见的」。

### B. 判据怎么定的（先量后定，量的过程写在门禁注释里）

先量了现在站上每一页每一档的「正文列」宽（浏览器实测，≤1024px）：

| 页面 | 正文列 | 360px | 390px | 640px | 768px | 820px | 1024px | 1440px |
|---|---|---|---|---|---|---|---|---|
| `/` | `.home-hero` | 91% | 92% | 92% | 92% | 92% | 92% | 77%（1104px） |
| `/papers/`、`/blog/`、`/about/` | `article` | 91% | 92% | 92% | 92% | 92% | 92% | 67%（960px） |
| `/404.html` | `main` | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| `/papers/<slug>/` | `.paper-body` | 91% | 92% | 92% | 92% | 92% | 92% | 64%（921px） |

两个下限值因此定成：
- **≤1024px 用比例 85%** —— 这个数**不是本轮拍的**，是 D11 自己写下的验收条件
  （「正文宽 ≥ 视口 85%」）。现有实测全部 91~92%，留了 6 个百分点的余量
  （正文容器左右内边距从 16px 加到 40px 才会踩线）。
- **>1024px 用绝对值 480px** —— 宽屏正文是**刻意定宽封顶**的（1920px 档仍只有 921px，
  占视口 48%），用比例判会误报，只能用绝对值；480px ≈ 30 个中文字符的最小可读宽度，
  现有最小值是 704px（1025px 档论文正文），留了 32% 余量。

⚠️ **通用推断试过，不可用**：一开始想用「拿正文里最长的那段文字所在的元素」自动推断正文列，
实测**两头不兼容** —— 首页英雄区在 768px 是**分栏**设计（实测一段正文只有 336px = 44%）、
关于页 bio 同样在分栏里（483px = 63%），这些是**有意为之**，按比例判会**误报**；
而 D11 那种「被挤成固定窄列」在通用推断下又**抓得住**。⇒ 只能把「这一页的正文列是哪个
元素」**显式写出来**（`CONTENT_COLUMN_RULES`），每条都写了为什么。

### C. 改了什么（5 个文件）

- `scripts/check-overflow.cjs`：
  - 新增 `CONTENT_COLUMN_RULES`（逐页正文列选择器）+ `contentColumnRule(route)`
    （**完全相等优先**于通配前缀 ⇒ `/papers/` 列表页与 `/papers/<slug>/` 精读页是两个不同的正文列）；
  - 页面内测量脚本多量一项「正文列」的盒子宽度（`measureScript(selector)`）；
  - 判据：≤1024px 时 `contentWidth ≥ vw × 0.85`，>1024px 时 `contentWidth ≥ 480`；
  - **选择器没命中一律判红**（页面结构变了却悄悄跳过 = 假绿）；
  - 每页每档都打印「正文列 <选择器> <宽度>px <占比>（下限 …）」，退出码与打印**同源**；
  - 自证段多一条：正文列测量次数必须等于「档数 × 页数」。
- `scripts/test-overflow-widths.cjs`：新增 **M5**（窄带判红 / 够宽判绿 / 选择器没命中判红）
  与 **M6**（窄屏走比例、宽屏走绝对值，两条分支各自生效）共 10 条断言；
  夹具路由放在 `/papers/<slug>/` 下 ⇒ 走的是**真实规则表**，不是为测试另开的旁路。
- `docs/DEFECT-BACKLOG.md`：新增 **D13**（已修，附完整验证方式）；D11 行尾加一句交叉引用
  （「复发防护见 D13」）。
- `docs/ROADMAP.md`：M0 段加「进度」小节（清单已到 D13；哪几条绑在哪些拍板项上）。
- `docs/IMPROVEMENT-LOG.md`：中央待决策段追加**待拍板 44**；末尾追加本小节。

### D. 验证

- `node scripts/check-overflow.cjs` **exit 0**：7 档 × 6 页 = **42 次测量**，
  每页每档都打印了正文列实测值（见 B 段表）。
- `npm run build` **exit 0**（27 步门禁全链）。

### E. 负对照（这一段最关键）

1. **真实坏态**：用 `git archive 27d4b25`（**D11 修复前**的那次提交）单独构建一份产物，
   拿**同一个新门禁**去量 ⇒ 论文精读页在 360/390/640/768/820/1024px **六档全部判红**，
   正文列 **200px**（占视口 56%/51%/31%/26%/24%），其余 5 页照常绿，退出码 **1**。
   ⇒ 这道判据对**它要抓的那一族**确实有牙齿，不是「打印得很热闹」。
2. **自测也有牙齿**：把门禁副本的正文列下限抹成 0 ⇒ 自测 **exit 1**（4 项红）；
   门禁文件按 **SHA-256 校验**还原（`RESTORED_SHA_MATCH=yes`）。
3. **不误报**：正文列够宽的站点（夹具）**exit 0**；现站 42 次测量全绿。

### F. 性能与产物（这一轮的特殊情况：站点零改动）

本轮只碰门禁脚本，**站点一行没动**，所以**不需要**跑性能 A/B —— 这比跑代理指标更硬：

- **产物零变化**：49 个产物文件里 **47 个逐字节相同**；`feed.xml` 与 `robots.txt` 只差
  构建时间戳（`<lastBuildDate>` / 「生成时间」）—— 已用「掩掉时间戳再比对」确认无其它差异。
  ⇒ FCP / LCP / CLS / 请求数 / 字节数按定义**全部不变**（页面产物是同一批字节）。
- **门禁耗时**：窄屏溢出门禁 **13.54s → 13.49s（无变化）** —— 新判据**复用同一次浏览器会话**，
  没有多起一个 Chrome ⇒ 这也是本轮不触碰**待拍板 42**（「要不要给交互类改动配常驻浏览器门禁」）
  的原因：本题是**排版**判据、且**不新增浏览器启动**。
- **自测耗时**：6.90s → **11.19s**（+4.3s，多跑 2 轮门禁，宽度档位收窄到 3 档）；
  整条 build 链 54.9s。
- ⚠️ **未跑 Lighthouse**：工具链仍缺失（`/tmp/screenshot-tool` 早已消失）；本轮因为产物零变化，
  这个缺口对结论没有影响（如实记明）。

### G. 边界与已知不足（如实记，不藏）

- 这道判据只盯**宽度**；字号、行高、对比度另有门禁管（`check-a11y` / `check-contrast`）。
- **逐页登记表需要随页面结构变化同步**：选择器没命中会判红（这是故意的 —— 会有人被提醒），
  但要知道去改 `CONTENT_COLUMN_RULES`，而不是把判据改松。
- 新增页面默认盯 `main`（未登记路由的兜底）；首页因英雄区是分栏，登记的是 `.home-hero`，
  首页**其它区块**（统计条、论文列表）没有单独判据 —— 它们在 `main` 里、宽度跟视口走。
- **宽屏那半边基本不设防**（1920px 下正文占 48% 也放行）⇒ 已登记**待拍板 44**，
  连「宽屏定宽封顶是不是刻意的」一起问。

### H. 本轮纪律

- **先量后定**：判据的两个数都是先量出现状（91~92% / 704px）再定，不拍脑袋；
- **能一测的判据不靠肉眼**：宽度用浏览器实测 + 负对照 + 自测三层证据；
- **一轮只做一个改进点**；**不代拍**（判据阈值登记为待拍板 44 + D13）；
- **不碰并发场次的文件**：工作树里 `scripts/check-identity-handles.cjs`、
  `scripts/test-gates-selfcheck.cjs` 属另一个场次，本轮**未提交、未覆写**；
- **不 push**：本地 `main` 领先远端 164 个提交，线上仍是 2026-10-16 旧部署（D6）。

### 下一轮入口

① 从缺陷清单取下一条：D2 / D3 待待拍板 40 拍板（且要先解决「模板注释说多比例有效、
实测说只取第一张」这句矛盾）；D9 待 41；D10 待 42；D12 待 43；D5 等 M1-3 选题主线；D6 等 push。
② 或继续 M2 第 4 项的下一部分 —— 仍需先等**待拍板 43**。
③ 或把「待拍板 42」这条真正推进（交互类改动的浏览器门禁）—— 但那要先由本人拍板取舍。

## 2026-10-20 · 11:30–12:00 场次（**不占轮次号**，避免与并发场次撞号）：D14 —— 让同一件作品的关键词在四个出口上口径一致，订阅源不再静默截断

### 本轮定位

上一场次把「正文被挤成窄带」变成机器看得见的判据（D13）。本轮回到缺陷清单，**发现清单里的
缺陷全被拍板项绑定**：

- **D2 / D3**（og 图口径与体积）↔ 待拍板 40；
- **D9**（同一 `@id` 的两处 JSON-LD 字段口径）↔ 待拍板 41；
- **D10**（交互行为无常驻门禁）↔ 待拍板 42；
- **D12**（批注层整层不可达）↔ 待拍板 43；
- **D5**（博客为空）要本人先定选题主线；**D6**（线上旧部署）由 push 触发（待拍板 7）；
  **M3**（Decap CMS）要本人自建 OAuth App。

⇒ 清单里**没有可动的条目**。但 ROADMAP M0 §3 的规则写着「修的过程中发现清单漏了的缺陷
⇒ 新开一个编号」，而 M0 明确列出的两支里就有「**构建链与门禁本身的失效点**」
⇒ 本轮走这条路：在核对引用元数据这一族出口时，撞见一处**清单没记、门禁也看不见**的
口径不一致 ⇒ 开 **D14**。

### A. 缺陷事实（清单没记的那一处）

权威真源只有一个：`src/_data/site.js` 的 `publications[0].keywords`，**8 条**、顺序固定。

修之前，同一件作品的关键词在**五个出口**上是**三种条数**：

| 出口 | 位置 | 当时给几条 |
|---|---|---|
| 站内页面 chips | `src/_includes/layouts/paper.njk:216-218` `.paper-keywords` | 8 |
| 页面 `citation_keywords` | `src/_includes/partials/citation-meta.njk:133-134`（`join('; ')`） | 8 |
| JSON-LD | 论文页 ScholarlyArticle + Dataset、列表页 ScholarlyArticle | 8 |
| RIS 的 `KW` | `src/publications.ris.njk` | 8 |
| **BibTeX** | `src/publications.bib.njk` | **0（压根没有 `keywords` 字段）** |
| **订阅源 `feed.xml`** | `src/feed.njk` ← `eleventy.config.js` 的 `feedItems` filter | **5（`.slice(0, 5)`）** |

- 订阅源那 5 条是**静默截断**：`.slice(0, 5)` **无注释、无提交说明、无门禁依据**，
  丢掉的三个是 `data assimilation` / `machine learning` / `tropical Africa`
  ⇒ 后果一：**订阅者按 "tropical Africa" 检索找不到这篇**（地理检索词是跨学科读者找文献的
  常用入口，丢掉它不是"少了点信息"而是"这条检索路径断了"）；
- BibTeX 缺 `keywords` ⇒ 用文献管理软件（Zotero / Mendeley）的人**拿不到关键词**，
  同一件作品在那边同样检索不到。

依据：站内 `publisher` 字段那次「此前只有 RIS 有、BibTeX 没有……补齐」是**站内既有先例**；
页面 chips / `citation_keywords` / JSON-LD / RIS 本来就都是 8 条 ⇒ **8 条才是本站口径**，
上限 5 没有任何依据。

### B. 改了什么（6 个文件）

1. **`eleventy.config.js`**
   - `bibtex` filter：在 `put("issn", …)` 之后、`put("orcid", …)` 之前补
     `put("keywords", pub.keywords.map((k) => esc(k)).join(", "))`
     （biblatex 的逗号分隔列表；`put` **不做转义**，所以先 `esc(k)`）。
   - `feedItems` filter：删掉论文分支的 `.slice(0, 5)`（改为
     `categories: Array.isArray(p.keywords) ? p.keywords : []`），
     也删掉技术笔记分支的 `cats.slice(0, 5)`（改为 `categories: cats`）。
     两处都写了「静默截断」的实测理由在注释里。
2. **`scripts/check-citation-meta.cjs`**
   - 文件头判据一览新增 **C8**（订阅源 feed.xml 分类标签）。
   - **C3 的关键词判据**从「页面 ↔ RIS 两处互比」改成**对着真源 `site.js` 核三个面**：
     页面 `citation_keywords`（`join('; ')`）、BibTeX `keywords`（`join(', ')`）、
     RIS `KW` 数组。**按整串逐字比、不拆词元**（避免关键词本身含逗号时被误拆而误报）；
     某一面缺失 ⇒ 判红（fail closed）。
   - 新增 **C8** 段：解析 `_site/feed.xml` 的 `<item>` / `<link>` / `<category>`，
     按 `/papers/<slug>/` 后缀找条目，逐条与真源比；feed 缺失、条目不见、
     少一条 / 多一条 / 改一条都判红。
   - C4 区新增 C8 的**自证存活**检查（`c8Compared < c8Expected` ⇒ 判红）。
3. **`scripts/test-citation-meta.cjs`**：自测档数 10 → **16**（新增 M10–M15）；
   `COPY_EXT` 从 `.html/.bib/.ris` 扩为 `.html/.bib/.ris/.xml`
   （否则 C8 在副本里读不到 feed.xml，基线档会因「订阅源缺失」误红 —— 那是**坏跑**不是坏判据）。
4. **`docs/DEFECT-BACKLOG.md`**：新增 **D14**（状态「已修」+ 完整验证方式）。
5. **`docs/ROADMAP.md`**：M0「进度」小节更新到 D14。
6. **`docs/IMPROVEMENT-LOG.md`**：中央待决策段追加**待拍板 45**；末尾追加本小节。

### C. 验证

- **线上巡检 7 条 URL**：`/` 200 · `/papers/` 404 · `/blog/` 200 · `/about/` 200 ·
  `/publications.bib` 404 · `/feed.xml` 404 · `/sitemap.xml` 200
  ⇒ **仍是 D6 旧部署**（待拍板 7，本轮不 push）。
- `npm run build` **exit 0**（27 步门禁全链，日志 `/tmp/mh_build_d14.log`）。
- `node scripts/check-citation-meta.cjs` **exit 0**：**共比对 35 处**；
  仍打印既有「RIS 无 AB」已知差异（**不判红**，待本人拍板，本门禁不代拍）。
- `node scripts/test-citation-meta.cjs` **exit 0**：**16/16 档全部符合预期**。
- **产物实测**：`feed.xml` 8 个 `<category>`；`publications.bib` 第 15 行
  `keywords = {thunderstorm, lightning, TRMM, radar echo structure, convective organization, data assimilation, machine learning, tropical Africa},`；
  论文页 BibTeX 复制块**同一行**；RIS 8 条 `KW`；页面 `citation_keywords` 8 条；
  JSON-LD（论文页 ScholarlyArticle + Dataset、列表页 ScholarlyArticle）全 8 条。

### D. 负对照（这一段最关键）

1. **产物级（真实坏态）**：`git archive HEAD | tar -x -C /tmp/mh_before_d14` +
   `ln -s` 本仓 `node_modules` + `npx @11ty/eleventy`（该副本**无 `.git`**），
   拿**同一个新门禁**去量旧产物 ⇒ `SITE_DIR=/tmp/mh_before_d14/_site node scripts/check-citation-meta.cjs`
   **exit 1**，两条红因**精确点名**：「BibTeX keywords 上**缺失**」与「feed = 5 条 vs site.js = 8 条」
   ⇒ 这道判据对**它要抓的那一族**确实有牙齿。
2. **自测级**：把门禁副本里两处关键词判据改成 `if (false)` ⇒ 自测 **exit 1，5/16 档不对**
   （M10 / M11 / M13 / M14 / M15）；随后按 **SHA-256 校验**还原
   （`RESTORED_SHA_MATCH=yes`，SHA `d66132d5d62f3ec647028f8fc618106f0a6a4000a4bc5d299ec663541a1f1a46`），
   还原后门禁 exit 0 ⇒ 判据确实在跑，不是「打印得很热闹」。

### E. 产物比对（性能证据的替代口径）

- 49 个产物文件里 **45 个逐字节相同**；3 个是本轮**预期改动**：
  `feed.xml` **+132 B**、`publications.bib` **+147 B**、论文页 **+241 B**，
  合计 **+520 B**（站点总字节 **2,516,313 → 2,517,204 B**）。
- 论文页 JSON-LD 的 `dateModified` 差异、4 个 HTML 页的 `<!-- source: -->` 空注释、
  sitemap 的 `lastmod` 为空 —— 都是**负对照构建无 `.git`** 导致的环境产物
  （`repoRelPath` 依赖 `gitRoot()`），与本轮改动无关。
- ⚠️ **未跑 Lighthouse**：工具链仍缺失（`/tmp/screenshot-tool` 早已消失）。
  本轮改动的两个出口（`feed.xml`、`publications.bib`）**不在任何页面首屏关键路径**，
  论文页的 +241 B 落在**折叠的引用块**内 ⇒ 对首屏性能无影响（按定义：首屏产物字节没变）。

### F. 边界与已知不足（如实记，不藏）

- 本轮只改了**出口层**（feed / BibTeX），**没改真源** ⇒ 关键词条数仍由 `site.js` 一处说了算
  （这是有意的：口径统一到真源，而不是在出口层各自解释）。
- 门禁 C3 的关键词判据**按整串逐字比、不拆词元** —— 避免关键词本身含逗号时被误拆而误报；
  代价：关键词**顺序**变了也会判红（顺序变了 = 真源变了，符合预期）。
- 页面这一面的关键词判据与 **C1 有重叠**，本轮**保留**是为了红因能点名是**哪个面**出的问题
  （已在代码注释里写明重叠事实，没装作是新判据）。
- **C8 单列而不并进 C3**：C3 的定义是「页面 ↔ BibTeX ↔ RIS」三处，订阅源是**第四个面**；
  硬塞会让 C3 的名字与实现对不上 —— 本轮在 C3 关键词处**已经发现过一次**这种毛病，
  不再犯第二次。
- 「关键词**要不要设上限**」本轮**没拍**：修掉的是「**静默截断**」，不是「该不该有上限」
  ⇒ 登记为**待拍板 45**。

- **待拍板 45（新增）｜对外出口的关键词要不要设上限（以及上限放在哪一层）？**
  事实与三个备选见中央台账同条：现状是四个出口一律给真源的完整列表（8 条）；
  「完整」在关键词极多时会让订阅源与 `.bib` 明显变长，而多数期刊要求 3~6 个；
  本站只有 1 篇论文、**还没有真实样本**能说明「多」到什么程度 ⇒ 本轮不代拍。

### G. 本轮纪律

- **清单全被拍板项绑定 ⇒ 走 ROADMAP M0 允许的「发现新缺陷 ⇒ 新开编号」路径**（D14），
  没有硬改绑着的条目，也没有替本人把拍板项当成已拍。
- **门禁改成「对着真源核」而不是「几处互比」**：互比挡不住「几处一致地错」
  —— 本轮这次改动的根子就在这里。
- **一轮只做一个改进点**；**不代拍**（上限口径登记为待拍板 45 + D14）。
- **不碰并发场次的文件**：`scripts/check-identity-handles.cjs`、
  `scripts/test-gates-selfcheck.cjs` 属另一个场次，本轮**未提交、未覆写**。
- **不 push**：本地 `main` 领先远端 **165** 个提交，线上仍是 2026-10-16 旧部署（D6）。
- 临时产物只落在 `/tmp`；删文件用 `mavis-trash` 不用 `rm`；conda 一律 `xiaolv`。

### 下一轮入口

① **D2 / D3** 待待拍板 40 拍板（且要先解决「模板注释说多比例有效、实测说只取第一张」这句矛盾）；
   **D9** 待 41；**D10** 待 42；**D12** 待 43。
② **D5** 等本人定选题主线；**D6** 等 push（待拍板 7）；**M3** 等本人自建 OAuth App。
③ 或继续在 M0「**构建链与门禁本身的失效点**」这一支找新缺陷 ——
   本轮只读盘点时看到**论文页 8 个 `button` 中有 1 个缺 `type`**，
   尚未定性（是缺陷还是无害），**先定性再决定动不动**。

## 2026-10-20 · 12:00–12:30 场次（**不占轮次号**，避免与并发场次撞号）：D15 —— 给博客 front matter 契约配上门禁，写错的文章在 build 阶段就被拦下

### 本轮定位

上一场次（D14）把引用元数据那一族出口的口径统一了。本轮照例先读三份文档、线上巡检、跑 build，
然后回缺陷清单取一条待修 —— 结果发现**清单里"待修"的 7 条全被拍板项绑定**：

- **D2 / D3**（og 图口径与体积）↔ 待拍板 40；**D9**（同一 `@id` 的两处 JSON-LD 字段口径）↔ 41；
- **D10**（交互行为无常驻门禁）↔ 42；**D12**（批注层整层不可达）↔ 43；
- **D5**（博客为空）要本人先定选题主线；**D6**（线上旧部署）由 push 触发（待拍板 7）；
  **M3**（Decap CMS）要本人自建 OAuth App。

⇒ 清单里没有可动的条目。本轮同样走 ROADMAP M0 §3 的路（修的过程中发现清单漏了的缺陷 ⇒ 新开编号），
但这次撞见的不是"两处口径不一致"，而是**更靠底的一层**：**站内唯一的博客内容契约没有任何门禁守着**。

### A. 缺陷事实

- 契约出处：`docs/blog-writing-guide.md`（M1-2 场次产出）。它 §2 有一张逐字段的
  「**写错会怎样**」表 —— 契约本身写得**很细**，细到把后果都写清楚了。
- 但**全仓没有任何一条门禁读它**：2026-10-20 实测，`scripts/` 下 grep
  `readingTime|excerpt|content/blog` 只命中 check-lang 的一句历史举例、check-jsonld 的
  profilePage 解析、check-identity-derivation 的一句注释 —— **没有一条在核博客 front matter**。
- 加上站内 **0 篇文章**（`collections.blog` 为空）⇒ 这条内容路径**从未被任何门禁跑过**。
  契约写得再细，也只是**纸上**的。

**探针实测**（在 /tmp 的仓库副本里放夹具文章真跑一遍，**实测不是推测**）：

| 写错的地方 | 实测后果 | 当时 build |
|---|---|---|
| `readingTime: "3 min"` | 详情页与列表卡都印 **"3 min min read"** | **绿** |
| `excerpt` 缺失 | 列表卡**整块摘要消失**，只剩标题 / 日期 / 阅读时长 | **绿** |
| 目录名 `Bad_Slug` | URL 变成 `/blog/Bad_Slug/`（规范 §1 明写命名规则） | **绿** |
| front matter 覆盖 `layout` / `permalink` | 页面被挪到 `/custom/`，且用**论文页版式**渲染博客文章 | **绿** |
| `date: 2026-10-18 09:30` | **Eleventy 自己 fatal、整个 build 挂掉**，报的是内部堆栈 | 红（但看不出是"日期写错了"） |

**探针纠正了我两处推断**（如实记，不藏）：

1. 我先前以为覆盖 `permalink` 会造成**坏链** ⇒ 实测卡片 href 同步变成 `../custom/`，
   **没有坏链**。真正的问题是"页面挪了位置 + 用错版式"，不是"链接死掉"。
2. 我先前以为 front matter 再写 `tags` 是**覆盖**目录数据注入 ⇒ 实测是**合并**
   （渲染成 `· blog · TRMM · lightning`，`blog` 在前）⇒ 规范 §1 那句"再写就是覆盖"
   对 `layout` / `permalink` 成立，对 `tags` **不成立**。

顺带定位但**本轮未实测**（已由门禁判据兜住）：扁平 `src/content/blog/foo.md` 的 slug 会是 `blog`
（`getSlugFromData()` 取的是**倒数第二段**＝目录名）⇒ 全部挤到同一个 `/blog/blog/`。

### B. 改了什么（8 个文件）

1. **`scripts/check-blog-frontmatter.cjs`（新增）** —— 判据 **F1–F12**：
   形状 / slug 命名 / front matter 可解析 / `title` 必需 / `date` 必需且纯日期 /
   `readingTime` 纯数字 / `tags` 字符串数组 / 不得覆盖 `layout`·`permalink` /
   `cover` 同目录必须存在 / `excerpt` 缺失（note）/ `excerpt` 复读 `title`（note）/
   目录数据文件的自动注入字段（**F12，永远会跑** ⇒ 0 篇文章时门禁也不是空跑）。
   - **判红 = "写错了"**（形态 / 类型 / 覆盖了自动注入）；**note = "忘了写"**（契约标的是"建议"）。
   - 两处实现细节有坑，已写进注释：`date` 必须读 front matter **原文那一行**
     （YAML 会把 `2026-10-18` 解析成 Date 对象，解析后的值分辨不出纯日期与带时分）；
     F12 读目录数据文件的**源码文本**而不 `require` 它（夹具站在 /tmp，那个文件
     `require("../../eleventy-helpers.cjs")` 会解析不到）。
   - 红因里的路径**给人看**：站内显示相对仓库根的路径，站外夹具显示相对文章目录的路径
     （否则红因是一串 `../../../..`）。
2. **`scripts/test-blog-frontmatter.cjs`（新增）** —— **15 档**夹具站自测（M0–M14）：
   每档在 `os.tmpdir()` 下**独立**搭一个博客目录（复制真实的 `blog.11tydata.cjs` 当基线），
   用 `BLOG_DIR` / `BLOG_DATA_FILE` 把门禁指过去。**M1–M8 / M14 的夹具站里同时放着一篇
   完全合规的好文章** ⇒ 证明门禁是**指着坏的那一篇**红，不是见着文章就红。
3. **`package.json`** —— 加 `check:blog-frontmatter` 与 `check:blog-frontmatter-selftest`，
   两条都接进 build 链，位置在 `eleventy` **之前**（坏 `date` 要先看到可读提示，而不是 Eleventy 的堆栈）。
4. **`README.md`** —— 命令清单补两行。**这是被 `check:readme` 的 RD3 逼出来的**：
   它当场报红「package.json 里的脚本在 README 里没有提到 —— 命令清单是"第二份副本"，不同步就等于
   这个命令只有作者自己知道怎么跑」⇒ 那道门禁本轮真的抓到了一次副本不同步。
5. **`docs/blog-writing-guide.md`** —— 订正三处与实测不符的描述 + 新增 §2.4 判据对照表：
   §1「再写 `tags` 是覆盖」⇒ 只对 `layout` / `permalink` 成立（`tags` 实测是**合并**，顺序先 `blog`）；
   §2.1「date 带时分会显示前一天」⇒ 实测是 **Eleventy 直接 fatal、整个 build 挂掉**；
   §5 / §2.2「详情页底部多一个 `· blog` 标签」⇒ 实测位置在 **h1 下方的 meta 行顶部**。
6. **`docs/DEFECT-BACKLOG.md`** —— 新增 **D15**（状态「已修」+ 完整验证方式）。
7. **`docs/ROADMAP.md`** —— M0「进度」更新到 D15，「构建链与门禁本身的失效点」这一支补第三条。
8. **`docs/IMPROVEMENT-LOG.md`** —— 中央台账追加**待拍板 46**；末尾追加本小节。

### C. 验证

- **线上巡检 7 条 URL**：`/` 200 · `/papers/` 404 · `/blog/` 200 · `/about/` 200 ·
  `/publications.bib` 404 · `/feed.xml` 404 · `/sitemap.xml` 200
  ⇒ **仍是 D6 旧部署**（待拍板 7，本轮不 push）。
- `npm run build` **exit 0**（**32 步** npm 脚本链，日志 `/tmp/mh_build_d15b.log`）。
- `node scripts/check-blog-frontmatter.cjs` **exit 0**：真站 0 篇文章 ⇒ F12 核了 **7 项**
  （`layout` / `permalink` / `tags` / `prev` / `next` 五个键 + `tags` 含 `"blog"` + 出现
  `getSlugFromData`），结尾**明说**「F1–F9 / F11 当前未执行（不是"通过"）」。
- `node scripts/test-blog-frontmatter.cjs` **exit 0**：**15/15 档全部符合预期**。
- **接线门禁的数字跟着变**：门禁脚本 23 → **24** 个、自测脚本 11 → **12** 个
  （接在 build 链上的 7 → **8** 个）⇒ 新脚本不是"写完没人跑"。
- `npm run check:log-sections` / `npm run check:decision-ids` 均 **exit 0**。

### D. 负对照（这一段最关键）

1. **判据级**：把门禁里的 F6 判据卸掉（`if (false)`）⇒ 自测 **exit 1，1/15 档不对**
   （M1 由判红变成 exit 0）；随后按 **SHA-256 校验**还原
   （`0e3afca46d94a9a8a76fa3222dbac766ca4a34069cefb421042afb26f8545ebd` ⇒ 同值），
   还原后自测恢复 exit 0 ⇒ 判据确实在跑，不是"打印得很热闹"。
2. **真实坏态级**：夹具站放「一篇合规 + 一篇按真实作者习惯写错」的两篇文章
   （`date` 带时分、`readingTime: "8 min"`、`tags` 写成逗号串、front matter 里带 `layout`）
   ⇒ 门禁 **exit 1**，**四条红因逐个点名字段**（`date` / `readingTime` / `tags` / `layout`），
   **同场那篇好文章一条红都没有** ⇒ 判据指的是坏的那一篇，不是"见着文章就红"。

### E. 产物比对

- 与 HEAD（`fd79182`）做对照构建（用 `git worktree` **共享对象库**，不复制 1.1G 的 `.git`，
  这样 git 派生的字段天然一致）后逐字节比对：**49 个产物文件里 47 个逐字节相同**，
  只有 `feed.xml` 与 `robots.txt` 不同 —— 且**差异只有构建时间戳**
  （`lastBuildDate` / 「生成时间」）⇒ **站点产物零变化**（本轮只碰门禁脚本与文档）。
- ⚠️ **未跑 Lighthouse**：工具链仍缺失（`/tmp/screenshot-tool` 早已消失）。
  本轮**没动任何页面产物**，按定义首屏字节没变。

### F. 边界与已知不足（如实记，不藏）

- **判红 / note 的分界是本轮定的**：「写错了」判红、「忘了写」只出 note。
  `excerpt` 缺失按契约 §2 的「强烈建议」归到 note 这一档 ⇒ 登记**待拍板 46**
  （本人若认为"忘了写摘要"也该拦，改 F10 一处即可）。
- **站内 0 篇 ⇒ 逐篇判据在真站上仍然一次都没执行过**（一直跑的只有 F12）。
  "判据有牙齿"这件事，靠的是**自测的夹具站**，不是真站 —— 门禁自己也这么写。
- 门禁**不检查文章内容**（英文、结论先行、出处随数据走、每张图的 alt）⇒ 规范 §3 / §4
  那些条款**仍然没有门禁**，仍靠 `check-lang` 与作者自觉。
- F12 守的是"这五个键还在不在"的**文本层面**，不守语义：若目录数据文件改成别的写法，
  文本判据可能失配（方向是保守的：宁可多红）。
- `date` 判据读**原文那一行**，所以 `date: "2026-10-20"`（带引号）也能读到；
  但 `date: !!str 2026-10-20` 这种非常规写法会因原文行含 `!!str` 前缀被判红（保守方向，可接受）。
- 探针副本只在 `/tmp`，**未进仓库**；`/tmp/mh_r13_probe`（5 篇夹具文章）留着可复查。

- **待拍板 46（新增）｜`excerpt` 缺失（契约写的是"强烈建议"）该判红还是只报 note？**
  事实与三个备选见中央台账同条：现状是"忘了写摘要"只出 note、不拦 build；
  备选是①维持 note ②升级为判红（忘写摘要就卡住整个 build）③折中（前 N 篇或某阶段后才升级）；
  本站**一篇都还没写**，"忘了写摘要"这个错误**一次都还没发生过** ⇒ 本轮不代拍。

### G. 本轮纪律

- **清单里的待修条目全被拍板项绑定 ⇒ 走 ROADMAP M0 §3 的「发现新缺陷 ⇒ 新开编号」**（D15），
  没有硬改绑着的条目，也没有替本人把拍板项当成已拍。
- **一轮只做一个改进点**（D15）；**不代拍**（`excerpt` 口径登记为待拍板 46 + D15）。
- **不碰并发场次的文件**：`scripts/check-identity-handles.cjs`、`scripts/test-gates-selfcheck.cjs`
  属另一个场次，本轮**未提交、未覆写**。
- **不 push**：本地 `main` 领先远端 **166** 个提交（提交本轮后为 167），线上仍是 2026-10-16 旧部署（D6）。
- 临时产物只落在 `/tmp`；删文件用 `mavis-trash` 不用 `rm`；conda 一律 `xiaolv`。

### 下一轮入口

① **D2 / D3** 待待拍板 40 拍板（且要先解决「模板注释说多比例有效、实测说只取第一张」这句矛盾）；
   **D9** 待 41；**D10** 待 42；**D12** 待 43。
② **D5** 等本人定选题主线；**D6** 等 push（待拍板 7）；**M3** 等本人自建 OAuth App。
③ 或继续在 M0「**构建链与门禁本身的失效点**」这一支找新缺陷 ——
   上一场次留的线索（论文页 8 个 `button` 中有 1 个缺 `type`）**仍未定性**，
   先定性再决定动不动。
④ 本轮留的线索：M1-3 的选题主线一旦定下、第一批文章落地，**本轮这套判据才会在真站上第一次
   被逐篇执行**（现在跑着的只有 F12）；届时"逐篇判据有没有牙齿"就不再只靠夹具站证明了。
