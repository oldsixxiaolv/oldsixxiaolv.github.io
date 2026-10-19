# MeteoHub · 站点改进日志

> 这个文件是**自动巡检任务的进度记录**。每轮巡检开始时先读它，避免重复做已经做过的事；
> 做完新的改进后追加到末尾。
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
  404 页由 `src/404.njk`（布局 `layouts/page.njk` → `layouts/base.njk`）生成，
  逐项实测产物 `_site/404.html`：
  - `og:type` = **`website`** ✓ 正确——第三轮定的规则（只有带 `pubKey` 的论文页
    才算 `article`）在 404 页上**没有**误判，这条**不用改**；
  - **完全没有 `noindex`**（`grep -c noindex` = **0**）← 这是**真实缺陷**，
    404 页面会被搜索引擎当正常页面收录；
  - **发着 canonical** 指向 `https://github.lvyihang.xyz/404.html`（指向自身）；
  - **带着全站 JSON-LD**，实测 `@type` 去重后含
    `Person` / `ScholarlyArticle` / `Grant` / `MediaObject` / `Organization` /
    `Periodical`——即 404 页上挂着一篇论文的实体。
  规范做法是：**404 不发 canonical**、**保留 `noindex`**、**不发结构化数据**。
  本轮**没有顺手改**：①超出"1–2 个改进点"的范围；②`base.njk` 的 meta 是
  全站共用的，改错会让 404 页**连 noindex 都保不住**，反而更糟。
  要改是独立一个小改动（`404.njk` 走一套独立的 meta 分支），可以下一轮做。
- **`date:` 被同时用作三种含义，sitemap `lastmod` 与 robots "生成时间" 都不真实**（第六轮新增，实测）：
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
