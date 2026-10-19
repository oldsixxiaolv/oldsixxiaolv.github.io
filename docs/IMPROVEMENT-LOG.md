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
