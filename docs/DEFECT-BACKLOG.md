# MeteoHub 缺陷清单（DEFECT-BACKLOG）

> 本文件是**缺陷的唯一清单**，2026-10-20 由 M0 盘点产出。
> 每一轮从「待修」里**取一条**来修（不是随手挑）；修完把状态改成 `已修` 并写上验证方式。
> 目标与里程碑在 `docs/ROADMAP.md`；每一轮的实际改动在 `docs/IMPROVEMENT-LOG.md`。
>
> **编号说明**：本清单的 `D` 编号、`scripts/verify-site.cjs` 内部的 `D` 编号、
> 日志台账里的「待拍板 N」是**三套互不相干的命名空间**，互不引用、不可混用。

---

## 0. 盘的范围与方法

**范围**（照 ROADMAP §2 M0 第 2 条）：

- **前端**：断点错位、窄屏溢出、裂图与空状态、对比度、焦点可见性、暗色/打印主题一致性、
  首屏信息密度、动效缺失处、加载性能
- **后端**：构建链与门禁本身的失效点、SEO/JSON-LD 缺项、feed/sitemap 覆盖、对外出口、
  404 行为、RSS 可订阅性、内容管线的断点

**方法**（2026-10-20 实测，全部可复现）：

| 手段 | 用法 |
|---|---|
| `npm run build` | 27 步门禁全链，看现状红绿 |
| `curl` 七条 URL | `/`、`/papers/`、`/blog/`、`/about/`、`publications.bib`、`feed.xml`、`sitemap.xml` |
| 产物级爬取 | 相对链接/资源逐条解析到磁盘；`<script>`/`<style>` 块先剥掉，避免把 CSS 注释里的字样误判成标签 |
| 产物级结构核对 | JSON-LD 按 `@graph` 递归取每个 `@type` 的字段集；og/feed/sitemap 直接读 XML |
| 源码级对照 | CSS 媒体查询逐条定位到 `文件:行`；门禁脚本读判据本体，不信日志里的转述 |

**两条纪律**：

1. **不把"看着像"当缺陷**。本轮有三条假设被实测证伪并从清单里剔除（见 §2）。
2. **不重复登记已在台账里的待决事项**。已登记的一律标 `不修（理由：…）` 并指回原处。

---

## 1. 缺陷清单（一条一行）

| 编号 | 位置 | 现象 | 可判定的验收条件 | 状态 |
|---|---|---|---|---|
| **D1** | 论文页 JSON-LD；构造处 `src/_data/site.js`（`publications[].schema`） | `ScholarlyArticle` 有 `datePublished` / `headline` / `identifier` / `sameAs` / `abstract` / `keywords`，但**缺 `dateModified`、也缺 `image`**；同一页的 `<meta property="og:image">` 已存在 ⇒ 两者没打通（Google 的 Article 结构化数据把 `image` 列为建议项，`dateModified` 是时效信号） | 论文页 JSON-LD 的 `ScholarlyArticle` 同时含**非空** `dateModified` 与 `image`，且 `image` 与该页 `og:image` 的 URL 相同；`node scripts/check-jsonld.cjs` exit 0，且该门禁**新增对应断言**（以后新增文章页同样成立） | **已修**（2026-10-20 09:00–09:30 场次）· 验证方式：① `node scripts/check-jsonld.cjs` exit 0（门禁新增 **J11** 判据：`image` 逐字等于本页第一个 `og:image`；`dateModified` 等于该页源文件真实的最后提交时间，且「有/无」与「源文件提交过/没提交过」一致）② 产物实测 `ScholarlyArticle` 含 `image` = 该页 og:image 同 URL、`dateModified` = `paper.md` 的 `git log` 提交时间 ③ 4 档注入验证：删 `image` / 改 `image` URL / 删 `dateModified` / 改假 `dateModified` 均判红 exit 1；「源文件存在但从未提交 + 无 `dateModified`」exit 0 不误报 ④ `npm run build` exit 0，且 6 个页面的 `og:image` URL 与数量**完全未变**（回归无副作用） |
| **D2** | `src/_includes/layouts/base.njk` 的 og 块 | 除论文页外，**每个页面都产出 3 个 `<meta property="og:image">`**（1200×630 / 1080×1080 / 1500×500，产物实测 5 个页面各 3 个）；OG 抓取器只取**第一张**，多给会被忽略 | 每个页面产物里 `og:image` **恰好 1 个**；若要保留其它尺寸，用 `og:image:width` / `og:image:height` 表达，或改挂 `twitter:image` | 待修 |
| **D3** | `src/assets/img/og/og-1080x1080.png`（647,055 B）、`og-1200x630.png`（469,811 B）、`og-1500x500.png`（443,535 B） | 三份 og 图合计约 **1.5 MB**，社交平台每次抓取都要下载数百 KB；同目录已有 `.svg` 版本，但社交平台不支持 SVG 当 og:image | 被 `og:image` 引用的那张图 **≤ 200 KB**（JPEG 即可，社交平台通吃），且 `og:image:type` 与实际格式一致 | 待修 |
| **D4** | `scripts/check-overflow.cjs`（原 104–108 行：`--width` 默认 390）、`.github/workflows/deploy.yml` | 窄屏溢出门禁**只测 390px 一个宽度**；本仓有 768 / 820 / 1024 / 640 / 360 五个断点，`768`–`1024` 这段区间**没有任何自动化把关** | `node scripts/check-overflow.cjs --width 768` 与 `--width 1024` 均 exit 0；且 build 链或 CI **至少跑 3 档**（390 / 768 / 1024） | **已修**（2026-10-20 09:30–10:00 场次）· 验证方式：① `node scripts/check-overflow.cjs --width 768` 与 `--width 1024` 均 exit 0 ② 默认 **7 档**（360 / 390 / 640 / 768 / 820 / 1024 / 1440）× 6 页 = **42 次测量**，exit 0；每档**重新设**视口，并核对「量到的布局视口 = 请求宽度」，不等即判红 ③ 新增 `scripts/test-overflow-widths.cjs`（`npm run check:overflow-selftest`，**已接进 build 链**）exit 0（39 条断言）④ 档位取法有据：仓内 CSS 宽度媒体查询递归去重后共 **7 条**（`max-width` 360 / 640 / 760 / 768 / 820 / 1024 + `min-width` 760），自测逐条核对「**匹配侧与不匹配侧都被测到**」⇒ 以后 CSS 加新断点而门禁没跟上时自测判红 ⑤ 负对照判红：门禁副本改成「只跑第一档」⇒ 自测 exit 1（8 项红）；门禁副本改成「视口不真改」⇒ 自测 exit 1（7 项红） ⑥ `npm run build` exit 0 |
| **D5** | `src/content/blog/`（只有 `blog.11tydata.cjs`） | `collections.blog` 为空 ⇒ `/blog/` 走空状态页；`feed.xml` 里只有 1 条（论文）条目，没有一条技术笔记 | `/blog/` 至少 **3 篇真实长文**；列表卡有 excerpt / readingTime / 主题标签；`/blog/<slug>/` 全部 200；`feed.xml` 出现文章条目 | 待修（**依赖 M1-3**；选题主线本人尚未指定 ⇒ 本条不代拍） |
| **D6** | 线上 `https://github.lvyihang.xyz` | 线上仍是 2026-10-16 旧部署：`/papers/`、`/publications.bib`、`/feed.xml` **404**；canonical / og:url / sitemap 仍带旧 `/MeteoHub/` 前缀。本地产物齐全（5 条路由 + `publications.bib` + `publications.ris` + `feed.xml` 全在）⇒ **纯部署滞后，不是代码缺陷** | push 后线上七条 URL **全 200**、canonical 不含 `/MeteoHub/`、CI 的 `verify-live` 作业 exit 0 | 待修（**由 push 触发**；时机属既有待拍板 7，本轮不代拍） |
| **D7** | `scripts/test-gates-selfcheck.cjs`、`scripts/test-dataset-files-gate.cjs`、`scripts/test-gates-wired-selftest.cjs` | 三个门禁自测脚本**未被任何 npm script 引用**，只能手动跑（已在 `check-gates-wired.cjs` 的 `EXEMPT_SELFTEST` 里逐条登记并写明理由） | ——（结论属本人拍板） | 不修（理由：已登记为既有待拍板事项「自测脚本要不要进 build 链」，不重复登记） |
| **D8** | 404 产物 `_site/404.html` 的 JSON-LD | 404 页带 `Person` / `Organization` / `PostalAddress` / `CollegeOrUniversity`（`identityOn404` 开关当前为开） | ——（结论属本人拍板） | 不修（理由：已登记为既有待拍板事项「404 页要不要保留 Person」，不重复登记） |
| **D9** | `eleventy.config.js` 的 `jsonLdArticles`（列表页）与 `jsonLdPaper`（论文页） | 两个描述**同一件论文**的 JSON-LD 节点，`@id` 完全相同（= 论文页 canonical），但字段口径不一致：① `datePublished` 精度不同——论文页给 `2026-06-01`（取自 `src/_data/site.js` 的 `publications[].dates.published`，站内有完整日期的权威出处），列表页给 `2026-06`（由 `p.year` + `p.month` 拼出）；② 列表页节点**没有** `image` 与 `dateModified`，论文页有 ⇒ 消费方按 `@id` 合并同一件作品时会看到两个出版日期，且只读列表页时拿不到图与时效 | 同一 `@id` 的两个节点：`datePublished` **精度一致**（要么都到日、要么都到月）；`image` 与 `dateModified` 的「有/无」策略一致 | 待修（**修法方向属本人拍板**：日期口径以哪一处为准、`image`/`dateModified` 是补齐还是两处都不给；本条不代拍） |
| **D10** | `scripts/check-home-chart.cjs`（HC1–HC6 全是**静态**判据）；仓内唯一的浏览器级门禁是 `scripts/check-overflow.cjs`（CDP 骨架就写在它自己文件里，未抽公共库） | 首页降水图升级成可交互后，它的**交互行为**（悬停读数、键盘逐年步进、游标/数据点定位、`prefers-reduced-motion` 降级）**没有任何常驻门禁守着** —— 只有一次性实测脚本跑过。本轮就撞上一个**只有真实浏览器能发现**的真 bug：动态 `import()` 的 specifier 写成 bare（`assets/js/home-chart.js`）⇒ Chrome 抛 `Failed to resolve module specifier`，整张图**静默失去交互**，而 build 与当时的静态门禁**都还是绿的**（该类已被 HC6 补上，但 HC6 只覆盖这一类，不覆盖行为） | 有一道**浏览器级**门禁，用真实浏览器打开首页并断言：① 两个画布可聚焦、Tab 能走到、`:focus-visible` 生效；② 悬停到某个 x 时读数条里的年份/数值/十年均值与 `src/_data/extremePrecip.json` 一致；③ `←`/`→`/`Home`/`End`/`Escape` 行为符合预期且不越界；④ 游标与数据点的百分比位置与 `data-chart` 里的几何一致；⑤ `prefers-reduced-motion: reduce` 下过渡时长 ≈ 0；⑥ 页面无 JS 报错、无横向溢出 | 待修（**修法方向属本人拍板**：要不要给交互类改动配常驻浏览器门禁；代价是 build 时间 —— 本仓已有一道浏览器级门禁 `check:overflow`，7 档宽度已占约 14 s；本条不代拍） |
| **D11** | `src/assets/css/paper-reader.css`（≤1024px 的单栏媒体查询）、`src/assets/css/components/_paper.css`（≤1024px 目录 `display: none`） | 论文精读页在 **≤1024px（全部手机 + 平板）** 排版坏成一条窄带：① 单栏媒体查询**根本没生效** —— `.paper-reader-wrap:not(:has(.annot-pane))` 的特异度是 (0,2,0)，高于媒体查询里 `.paper-reader-wrap` 的 (0,1,0)，而**特异度压过来源顺序**，所以 ≤1024px 仍是两栏；② 目录在同一断点被 `display: none`（不生成网格项），于是正文被塞进第一列 `minmax(200px, 1fr)` ⇒ 实测 360/390/640/768/820/1024px 下**正文宽度只有 200~203px**，右边空出 110~690px 的一整列；③ 触屏读者同时**没有任何跳转手段**（目录被隐藏 + 正文高 1.7 万像素） | ① ≤1024px 时 `.paper-reader-wrap` 只有 **1 条 grid 轨道**，正文宽 ≥ 视口 85%；② ≥1025px 仍是 2 栏、目录仍 sticky，且桌面产物**逐像素不变**；③ ≤1024px 目录**可见**（display ≠ none）、`position: static`、链接排 2 列、触控高 ≥ 24px、位于正文上方；④ 点目录能滚到对应标题并更新 hash 与 `.is-active`；⑤ 8 档宽度均无横向溢出；⑥ 无 JS 报错 | **已修**（2026-10-20 10:30–11:00 场次）· 验证方式：① 浏览器断言（一次性脚本 `/tmp/mh_paper_assert.cjs`，不入仓）8 档宽度（360/390/640/768/820/1024/1280/1440）：AFTER **62 项全绿**，同一脚本跑 BEFORE（HEAD `27d4b25`）**36 项红**（6 档 ≤1024px × 6 条判据）⇒ 负对照有效 ② 正文宽度实测 360 → 328px、390 → 358px、640 → 589px、768 → 707px、820 → 754px、1024 → 942px（原为 200/200/200/200/200/203px）；1280/1440 的 `.paper-reader-wrap` 元素截图 SHA-256 前后**完全相同**（`9f36e56f…`）⇒ 桌面零改动 ③ 目录实测 display=block、position=static、链接 2 列、链接触控高 27px（≥24px）、位于正文上方；点「Abstract」→ 滚到 y=2446、hash=`#paper-abstract-title`、目标标题距视口顶 0px、当前节高亮切到 Abstract ④ `npm run check:overflow` 42 次测量 exit 0；页面无 JS 报错（pageerror / console.error 各 0 条）⑤ 性能 A/B（before=HEAD `27d4b25` 单独构建，屏蔽 Google Fonts，各 3 次取中位）：FCP/LCP 前后**同值**（390px 48ms、1280px 44ms），CLS 前后**同值**（390px 0、1280px 0.6353 属既有、与本次改动无关），请求数不变（14/15）；字节 **+1228 B**（components.css +715、论文页 HTML +513 —— paper-reader.css 内联进论文页，那 +513 B 里绝大部分是解释特异度陷阱的注释）；**页面总高 15841 → 9923 px（−37%）**，正文宽 1.79 倍 ⇒ 同样内容少 37% 的行 ⑥ `npm run build` exit 0（27 步门禁全链） |
| **D12** | `src/_includes/layouts/paper.njk:449`（`{%- if hasAnnotations %}`）、`src/assets/js/paper-reader/main.js:45`（`if (opts.annotationsUrl)`）、`eleventy.config.js:119`（`addPassthroughCopy("src/content/papers/**/annotations.json")`） | 批注子系统**整体不可达**：`paper.njk` 靠 `hasAnnotations` 决定传不传 `annotationsUrl`，但 `hasAnnotations` **全仓没有任何地方定义**（`grep -rn hasAnnotations` 只命中模板那 1 行）⇒ 恒为假 ⇒ `annotationsUrl` 永远不传 ⇒ `main.js` 整段跳过 `annotations.js`（355 行）与 `highlight.js`（169 行）⇒ 产物里 `.annot-pane` / `.annot-toggle` / `paper-anchor` **一个都没有**（浏览器实测 `querySelectorAll('[class*=annot]').length === 0`，`data-anchor-id` 在产物里 0 处）；而 `docs/papers-interaction.md` §9.1 给的批注写作工作流恰恰是「`paper.md` 同目录 `annotations.json`，手动维护」⇒ **照文档做也不生效**；仓内也确实**没有** `annotations.json`（全仓 find = 0 个） | 二选一：① 定义 `hasAnnotations`（构建期按文件是否存在判定）**且**提供 `annotations.json` ⇒ 论文页出现 `.annot-pane`、搜索框、kind 过滤 chips、`?a=` 直链、移动端 bottom sheet；② 明确「本仓暂不启用批注层」，把 `annotations.js` / `highlight.js` / `paper-reader.css` 里对应的死代码清掉或在文档写明「Stage 2 才接」 | 待修（**修法属本人拍板**：要不要真的写批注数据。批注是**本人**的精读笔记，代写等于伪造作者阅读记录 ⇒ 本条不代拍；已登记为待拍板 43） |

---

## 2. 本轮已核查、判定**无缺陷**（不必重查）

这些是 M0 盘过、实测干净的项。**它们不是"没看"，是"看了、合格"** —— 下一轮不必重复证明。

| 方面 | 实测结论 |
|---|---|
| **坏链** | 6 个页面共 **128 条**相对链接/资源（`.bib` / `.ris` / `.css` / `.jpg` / `.svg` / `.xml` / 无扩展名）逐条解析到磁盘，**断链 0 条** |
| **图片** | 全部 `<img>` 带 `width`/`height`（比例预留到位）；首页与关于页肖像带 `srcset` + `sizes` + `loading="eager"` + `fetchpriority="high"` + `decoding="async"`（**LCP 元素已优化**） |
| **焦点可见性** | 全局 `:focus-visible` 用 `box-shadow: var(--shadow-focus)`，暗色主题在 `tokens.css:249` 有对应覆写；16 处 `outline: none` **全部配了替代指示**（同选择器的 `box-shadow` / `background`）；`forced-colors` 与 `prefers-contrast: more` 两档另有专门适配 |
| **动效降级** | `base.css` 有**全局** `prefers-reduced-motion` 兜底（`transition-duration` / `animation-duration` → `0.01ms !important`），卡片/按钮/论文卡里的 transition **已被它覆盖**，不是漏网；全仓 `transition-delay` / `animation-delay` **0 处**，兜底压不住 delay 的风险不存在；滚动驱动动画另有 `no-preference` 门控 |
| **暗色 / 打印** | 暗色 token 全部在 `tokens.css` 覆写（组件层只对图片、渐变等做个别调整）；`print.css`（257 行）覆盖 topbar / 卡片 / 论文三栏塌陷 / 外链标注 / 批注控件等；`check:print-theme` 有 PT1–PT6 判据并写明了覆盖边界 |
| **RSS** | item 含 `guid` / `pubDate` / `dc:creator` / `dc:identifier` / `category`；`atom:link rel="self"` 在位；每个页面有 `rel="alternate" type="application/rss+xml"` autodiscovery ⇒ 订阅可发现 |
| **JSON-LD 覆盖** | 6 个页面全部有 `Person` + `ScholarlyArticle`；列表页另有 `ItemList`；论文页另有 `Dataset` / `DataDownload` / `SoftwareSourceCode`；404 页按预期不带 `WebPage`、带 `noindex, follow` |
| **门禁链** | 27 步全绿；`check:live` 由 CI 的 `verify-live` 作业在**部署之后**执行（拿刚部署的 artifact 比对，不接进 build 链是**有意**的）；`check:gates-wired` 兜住"门禁没接进 build"的自指盲区；三个自测脚本未接链的**事实与理由**都已写进源码（不是只写在日志里） |
| **断点错位** | `760` 与 `768` 并存是**有意**的：`pages.css:478-487` 给了推导（`680 = 760 − 2×gutter`），且 760–768px 区间内容宽仍 > 680 ⇒ 不会多出一条没必要的滚动条。**不是错位** |
| **首页数据图** | 两个图表都是 `viewBox="0 0 360 236" width="100%"` 流式 ⇒ 打印到 A4 不会溢出；`chart__panels` 的两栏由 `min-width: 760px` 控，与图表的可读宽度上限 880px 相容 |
| **站点体积** | 产物 48 个文件共 **2.4 MB**；站点 JS 共 **38.6 KB**（零第三方运行时依赖保持） |

---

## 3. 取用规则

1. 每轮**只修一条**。取哪一条由本轮场次判断，但必须**从本清单里取**。
2. 修完把该行状态改成 `已修`，并在**同一行末尾**补上验证方式（命令 + 结论）。
3. 修的过程中发现清单漏了的缺陷 ⇒ **新开一个编号**追加，不复用旧号。
4. 判定"其实没问题"的 ⇒ 状态改成 `不修（理由：…）`，理由要具体到"哪条判据不成立"。
5. 清单之外**不擅自新增需求**；想加功能先写进日志的中央「待拍板」段。
6. 本清单**不另立待拍板编号** —— 需要本人拍板的事，一律写进 `docs/IMPROVEMENT-LOG.md` 的中央台账。
