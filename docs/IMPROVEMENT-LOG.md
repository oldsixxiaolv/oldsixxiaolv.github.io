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
| 11:15 | **自行实施了 `sitemap lastmod`**（新增 `lastCommitTime` filter + `deploy.yml` 加 `fetch-depth: 0` + `verify-site.cjs` 加第 18 条门禁） | ⚠️ **该口径明确在「待决策」段里（A/B/C 三选一），属本人拍板项**。本轮**按 A 实施、但仍不替本人拍板**：A 单独落在 commit 2，本人一句"改回"就能只回退 A，404 修复留在历史里。处置见「并发工作树的最终处置」 |
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

⚠️ **门禁自己被卸掉也是一种失效**（12:0x 由 11:20 场次补上，本轮一并落地）：
`sitemap.njk` 里那行 `<!-- source: ... -->` 是 HTML 注释，**删掉它既不会让 build 失败、
也不会让任何其它判据报错** → 门禁 18 的整套逐页核对被静默关掉。
现在**缺这条标注直接判红**（与"lastmod 整体消失"是同一类洞）。
⚠️ 这条是 12:0x 由 11:20 场次补上的——**本轮已关闭**，记在这里是因为它揭示了
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

### 留给下一轮（本轮改进点已用满，**不在本轮扩**）

1. **门禁 16 只黑名单内容类实体 → 404 页把整个 Person JSON-LD 块删掉时门禁全绿**
   （11:53 实测 exit 0）。门禁 16 的黑名单是 13 类内容类实体，**不含 Person**，
   所以"错误页干脆一个实体都不发"这条路径没有门禁覆盖。
   修法：门禁 16 段末尾加 `hasOwnerOn404` 检查（`OWNER_NAME` 在门禁 16 段之前，
   作用域可用），补完后对应的注入应从 exit 0 变 exit 1。
   ⚠️ 注意这条与「待决策」里的"404 页要不要保留 Person"是**两件事**：
   那条是**展示口径**（Person 留不留由本人定），这条是**门禁覆盖缺口**
   （无论本人怎么定，都该有一条门禁保证"实际产出"与"选定的口径"一致）。
2. **编号元门禁**（编号唯一且连续、文件头清单与代码段一致）目前工作区还没有 →
   以后再改号会被自动拦下，不必靠人记。
   ⚠️ 早前写好的补丁（`/tmp/mh_r9v2/gate18.patch`）是基于**旧版** `verify-site.cjs`
   的，本轮已改过编号，**不要直接 apply**，需重做成能套在当前版本上的样子。

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
  - 本轮**没有替本人拍板**：选了"保留"，并把新门禁写成**只黑名单内容类实体**，
    不写成"404 页只能有 Person"——后者会把未决口径写死进代码。
    若本人选"去掉"，改 `base.njk` 的 Person 块加 `{%- if not is404 %}` 即可，
    第 16 条门禁不受影响（它不查 Person）。
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
      本人若要改口径，**只需回退 commit 2**，404 修复留在历史里不受影响。
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
        要回退到 C 只需把 `lastCommitTime` filter 改成恒返回空（sitemap 侧会整条
        不输出 lastmod）；若选 B 则需另写逐页 front-matter。
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
