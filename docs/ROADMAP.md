# MeteoHub 路线图（2026-10-20 起）

> 本文件是**改进目标与里程碑的唯一清单**，由本人 2026-10-20 指示创建。
> 详细的每一轮改动记录一律写进 `docs/IMPROVEMENT-LOG.md`（含中央「待拍板」台账）；
> **本文件不另立待决策编号**，避免同一件事出现第二份副本。
> 术语与现状以仓库实测为准；与代码冲突时以代码为准，并回头修本文件。

---

## 0. 目标与已拍板

### 0.1 本人已拍板（2026-10-20）

| 事项 | 结论 | 对本文件的影响 |
|---|---|---|
| **后台形态** | **Decap CMS**（`/admin/`，GitHub OAuth 登录） | M3 按此实施，不再评估其它方案 |
| **站内布局** | **现有布局是基准，保持不动**（本人 2026-10-20 原话：「我现在这个布局是很优秀的」） | 不改版式与信息结构；一切工作都是**在这个基础上做修复与增强**；新页面复用现有设计系统；动效只叠加、不重排 |
| **站内语言** | **保持全站英文** | 硬约束不变；中文只出现在 commit message 与日志里 |

尚未拍板：**博客选题主线**（见 M1）—— 本文件不代拍。

### 0.2 四个硬指标

把 MeteoHub 做成一个**学术访客愿意反复回访**的站点：前端观感与动效做得扎实、
内容有真正的阅读价值、并且**本人能登录后台直接写博客**。

四个硬指标（用户原话拆解）：

| 编号 | 目标 | 判定 |
|---|---|---|
| **G-A** | 后端前端都很好 | 构建链零红、页面无坏链无裂图、SEO/可访问性/性能门禁全绿 |
| **G-B** | 内容非常吸引人 | 站内博客有真实长文（不是空列表页）、首屏有人愿意读、feed 有订阅价值 |
| **G-C** | 有动态效果 | 滚动进场、悬停反馈、数据图交互、页面切换；动效不牺牲可访问性与性能 |
| **G-D** | 有后台供本人写博客 | `/admin/` 可登录、可新建/编辑/发布文章，发布即上线 |

---

## 1. 现状基线（2026-10-20 实测，不是推测）

- **栈**：Eleventy 3.1.6 纯静态站 → GitHub Pages（`.github/workflows/deploy.yml`，push `main` 自动构建部署）。
  Node ≥ 22。
- **构建链**：`npm run build` 跑**全链门禁**（门禁 → eleventy → 产物核对），**必须 exit 0**。
  门禁链的段数**每轮都变**（每加一道门禁就 +1），所以这里**不写数字** ——
  需要确切段数时由 `scripts/check-doc-snapshot.cjs` 现场实测（判据 DS2）。
  现有门禁覆盖：日志段结构(LS)、待拍板编号(DI)、CSS 括号/死代码、换行、窄屏溢出与**交互目标点击区**、
  a11y、JSON-LD、身份句柄、引用元数据/CITATION.cff、README 事实核对(RD)、路径引用(TR)、
  语言一致性、图片资产、打印主题、拷贝导出等。
- **路由**：`/`、`/papers/`、`/blog/`、`/about/`、论文独立页 `/papers/<slug>/`，
  对外出口 `publications.bib` / `publications.ris` / `feed.xml` / `sitemap.xml`。
- **站内语言：全站英文**（`src/_data/site.js` 的 locale 说明，`scripts/check-lang.cjs` 强制）。
  → **站内博客正文必须是英文**；CSDN 上的中文笔记要进站必须改写，不是搬运。
- **博客现状：`src/content/blog/` 里 0 篇文章**（`collections.blog` 为空，
  注释写明「技术笔记都发在 CSDN 上」）。`/blog/` 现在靠空状态页指向 CSDN。
- **文章形态**：`src/content/blog/<slug>/index.md` → permalink `/blog/<slug>/`；
  模板消费的 front matter 字段：**`title` / `date` / `excerpt` / `cover` / `tags` / `readingTime`**。
  `tags` 已由目录级 `blog.11tydata.cjs` 自动补 `blog` 标签。
- **已知内容侧缺陷（现成可做的小活）**：`src/blog.njk` 里 `useCovers = false`，
  原因是历史 front matter 写 `cover: cover.png` 而磁盘上那个文件其实是 **SVG 文本**
  （扩展名骗了服务器，Chrome 拒解码 → naturalWidth=0 → 裂图）。
  正解：内容侧把 `cover.png` 改名 `cover.svg` 并同步 front matter，之后才把开关打开。
- **已有动效资产**：`src/assets/js/` 下 `theme.js`（明暗）、`nav.js`、`main.js`、
  `paper-reader/`（论文精读交互）；首页华北降水图是**手写 inline SVG、零图表库、页面零 JS**。
- **零运行时依赖**：目前没有任何第三方前端库/框架，样式与脚本全手写。
  **这个约束要保持**（性能 + 可控 + 无供应链风险）。

---

## 2. 里程碑（按顺序推进，一轮一个点）

### M0 · 前后端缺陷盘点（第一件事，先于一切）

**为什么先做这个**：本人 2026-10-20 的要求是「在这个布局基础之上**修复**后端和前端」。
「修复」要有抓手才不跑偏：不是凭空加功能，而是**把现有布局里的毛病一个个找出来并修掉**。
所以第一件事是**盘点**：把缺陷变成一份有编号、可逐条销账的清单，之后每轮只修一条。

**做什么**
1. 跑 `npm run build`（全链门禁）看现状红绿；跑线上 curl 与浏览器逐页看
   （首页 / 列表页 / 论文独立页 / about / 404），**只记问题、不改代码**。
2. 盘的范围：**前端**（断点错位、窄屏溢出、裂图与空状态、对比度、焦点可见性、暗色/打印主题不一致、
   首屏信息密度、动效缺失处、加载性能）；**后端**（构建链与门禁本身的失效点、SEO/JSON-LD 缺项、
   feed/sitemap 覆盖、对外出口、404 行为、RSS 可订阅性、内容管线的断点）。
3. 产出 `docs/DEFECT-BACKLOG.md`：每条一行 —— 编号 `D1、D2…`、页面/位置、现象、
   **可判定的验收条件**、状态（`待修` / `已修` / `不修（理由）`）。
   一条缺陷只允许一个编号；修完把状态改成 `已修` 并写上验证方式。
4. 清单之外**不擅自新增需求**；要加新功能先写进「待拍板」。

**验收**
- `docs/DEFECT-BACKLOG.md` 存在，每条都有编号与可判定判据；
- 后续每轮都从这份清单里取一条来修（不是随手挑）。

**进度（2026-10-20 20:40 实测）**
- 缺陷清单已到 **D32**（D1 / D4 / D11 / D13 / D14 / D15 / D16 / D17 / D18 / D19 / D20 / D21 / D22 / D23 / D24 / D25 / D27 / D28 / D29 / D30 / D31 已修；D2 / D3 / D5 / D6 / D9 / D10 / D12 / D26 / D32 待修；D7 / D8 不修）。
- 「构建链与门禁本身的失效点」这一支已补**四条**：
  ① **D13**：窄屏溢出门禁只查「横向溢出」，查不出「正文被挤成窄带」（D11 那一族坏版式当时
  build 与全部门禁都绿）—— 2026-10-20 11:00–11:30 场次给该门禁补了「正文列宽」判据
  （≤1024px ≥ 视口 85%、>1024px ≥ 480px）并加了对应自测，负对照用修复前的产物验过；
  ② **D14**：同一件作品的关键词在五个出口上给三种条数（订阅源被 `.slice(0, 5)` 静默截到 5 条、
  BibTeX 压根没有 `keywords` 字段），而引用元数据门禁 C3 在文件头写着「关键词」在核对范围内、
  **实现却只比了「页面 ↔ RIS」两处** ⇒ 声明范围与实现范围不一致。
  2026-10-20 11:30–12:00 场次把关键词改成**对着真源 `site.js` 核**（页面 / BibTeX / RIS 三个面），
  并新增 **C8** 核第四个面（订阅源），两处都带自证存活；自测从 10 档扩到 16 档；
  ③ **D15**：博客 front matter 契约（`docs/blog-writing-guide.md`）**没有任何门禁守着**，
  而站内 **0 篇文章** ⇒ 这条内容路径**从未被任何门禁跑过**。2026-10-20 12:00–12:30 场次
  在仓库副本里放夹具文章**实测**出五条「写错了但无人拦」的后果：`readingTime: "3 min"`
  ⇒ 印成 "3 min min read"；`excerpt` 缺失 ⇒ 列表卡整块摘要消失；目录名 `Bad_Slug`
  ⇒ URL 变成 `/blog/Bad_Slug/`；front matter 覆盖 `layout`/`permalink` ⇒ 页面挪走且用论文页版式；
  `date` 带时分 ⇒ **Eleventy 直接 fatal、整个 build 挂掉** —— 前四条 build **全绿**。
  本轮把契约变成门禁 `scripts/check-blog-frontmatter.cjs`（F1–F12，接在 build 链 `eleventy` **之前**），
  配自测 `scripts/test-blog-frontmatter.cjs`（15 档夹具站，**接在 build 链**）；
  顺带订正规范里三处与实测不符的描述（`tags` 是**合并**不是覆盖 / `date` 带时分是 build 挂掉不是"显示前一天" /
  `· blog` 标签在 h1 下方的 meta 行顶部）。D15 **不是新增需求** —— 契约本来就在站内，是**没人守**；
  按 M0 §3「一条缺陷一个编号」补号销账。
  ④ **D16**：详情页版式把**集合名标签**当主题标签印给了读者（`· blog` 在 h1 下方的 meta 行顶部），
  而这条路径**任何门禁都看不见** —— 站内 0 篇文章 ⇒ 详情页版式从未被渲染过，产物层永远没有这个页面；
  规范 §2.2 早已把它列为「待修」的已知缺陷，缺陷清单里却一直没有编号。
  2026-10-20 12:30–13:00 场次用**真构建 A/B** 复现并修掉：同一篇夹具文章、只换版式，
  旧版 meta 行 = `· blog · TRMM · lightning`、新版 = `· TRMM · lightning`（页脚仍是 `← Back to Blog`）。
  配套门禁 `scripts/check-tag-leak.cjs`（判据 T1–T5，接在 build 链 `eleventy` **之前**）
  + 自测 `scripts/test-tag-leak.cjs`（**7 档**注入矩阵，**接在 build 链**）：
  门禁**渲染仓库里真实的那个版式**（不扫产物 —— 站内没文章，扫产物永远扫不到），
  集合名从目录数据文件的「layout 指向哪个版式」**推导**出来 ⇒ 新增集合忘了滤就自动判红；
  另有一条 T3 专门盯「把 tags 本身滤掉」这种**看起来修好了**的错修（集合名没了，版式也被换成首页版式）。
  D16 同样**不是新增需求** —— 是把规范 §2.2 里已经写明的契约变成门禁。
- 本轮另修一条**前端真缺陷**（不属于上面那一支，是一条线上就摆着的坏版式）：**D17** ——
  **404 页在任意缺失路径下版式全失、站内链接全 404**。机制：GitHub Pages 对**任何**未匹配的路径
  都返回 `/404.html` 的内容，但**浏览器地址栏仍停在请求的 URL 上**；而 404 页用的全是**相对 URL**
  ⇒ 浏览器按**请求路径**去解析它们（请求 `/papers/does-not-exist/` 时
  `assets/css/components.css` 变成 `/papers/does-not-exist/assets/css/components.css`）。
  2026-10-20 13:00–13:30 场次用**真实 Chrome + CDP** 坐实：请求嵌套缺失路径时
  **4 个 preload 换装的样式表全部加载失败**（连 `<noscript>` 兜底一起坏）、**6 条站内链接全部 404**
  ⇒ 页面只剩内联 critical CSS，版式全失、导航全断。
  根因是**相对路径在 404 场景下没有正确解**（请求路径的深度不可知）⇒ 404 页的站内 URL 必须**根绝对**。
  修法落在**一处**：自定义 `relUrl` 过滤器里对 404 页返回根绝对路径
  （判据取自**实测确认**的 `this.ctx.is404`，**不是** `this.is404` —— 后者恒为 `undefined`），
  **只改 404 页**、其余页面一字未动 ⇒ 19 处模板调用点不动，
  也保住了 base.njk 注释里写明的「整个文件夹扔到哪都能跑」原则（普通页面不受影响）。
  配套门禁 `scripts/check-404-depth.cjs`（判据 E1–E3，接在 build 链）+ 自测
  `scripts/test-404-depth.cjs`（4 档注入矩阵，**接在 build 链**）；
  同时把 `scripts/verify-site.cjs` 门禁 1 的**作用范围**改成「404 页豁免、其余页面照旧」
  （否则新门禁一绿、build 就在老门禁上判红 —— 实测首轮 build 正是 exit 1、22 条红因全是这一项）。
- **D18**：D17 把 404 页改成根绝对路径之后，**活文档里的「挂载无关」承诺没跟着改** ——
  `README.md`（部署第 2 条）、`docs/DEPLOY.md`、`docs/ui-ux-pro-max-improvement-plan.md`（§2.4 / §3.4）
  四处仍**无条件**承诺「整个文件夹扔到哪都能跑」，**没提 404 页这个例外**。
  契约本身没变（除 404 页外仍是相对路径），但据此做部署决策会拿到错误前提
  （站点挂到子路径下时 404 页的站内 URL 会指到挂载点之外）⇒ 读者（尤其 agent）会按错的前提做事。
  而且这类漂移**没有门禁守着**：`check-404-depth.cjs` 判的是**产物里的 URL 形态**，
  全仓**没有任何一条门禁核对「文档承诺 vs 代码行为」**。
  2026-10-20 13:30–14:00 场次把这条原则**写成显式契约**：4 处承诺在同一行里补上限定
  （README 那条还讲清原因：GitHub Pages 的 404 语义 ⇒ 相对 URL 没有正确解 ⇒ 404 页走根绝对），
  并配门禁 `scripts/check-mount-contract.cjs`（判据 **MC1–MC4**：MC1 承诺带限定 /
  MC2 README 讲清例外 / MC3 源码里 `ctx.is404` 特判在位 / MC4 覆盖度自证，防「改空了就通过」）
  + 自测 `scripts/test-mount-contract.cjs`（**5 档**注入矩阵，**接在 build 链**）。
  同场还订正了**2 处会反复漂的快照数字**（`docs/DEFECT-BACKLOG.md` §0 手段表与本文 M0 §1
  都写「27 步门禁」，实际已到 38 步）—— 那个数字每轮都变，改成**不含数字**的写法（「全链门禁」），
  才不会下一轮又漂。D18 **不是新增需求**：D17 场次留下的「下一轮入口」第三条
  （「要不要把这条原则写进 `docs/` 的显式契约」）正是本轮做的事。
- **D19**：D18 那轮在「下一轮入口」②里留的线索 —— **门禁只钉住了"承诺"这一类文档漂移**，
  还没有「文档里写的默认值 / 口径 vs 代码实际行为」的通用对照 ——
  顺着它查下去就撞见**视觉规范自己**和代码脱节：`docs/design-system.md`（这份文档写着
  「本文档是视觉规范的唯一来源」）的 §6 有**三处**对不上：① §6.0 的 `_badge.css` 行把徽标变体写成
  `` `--brand` / `--accent` / `--sage` … ``（读起来像 CSS 变量，实际是类名修饰器 `.badge--brand` …），
  且 `.badge--quiet` **完全没写**（该类被 `src/blog.njk` 与 `publications.njk` 真实使用）；
  ② §6.4 的示例 HTML 用 `.badge-brand` / `.badge-neutral`（**单横线**，全仓 CSS 里一个都没有，
  `.badge-neutral` **根本不存在**）；③ §6.0 的 dev/prod 双模表把判定**写反**了 ——
  写着「dev：NODE_ENV 不等于 production（含裸跑 npm run build）」，而 `eleventy.config.js` 是
  `isProductionBuild = !isDevServer` ⇒ **裸跑构建走 prod**（实测产物头部就写着 `bundled (production)`）。
  2026-10-20 14:00–14:30 场次把这三处改成与代码一致（类名写成真实的双横线类名并补齐变体表、
  双模表改按 `--serve` 判定、体积数字改成**不含数字**的写法、§6.4 的字号 token 对齐 `_badge.css`），
  并配门禁 `scripts/check-design-system-contract.cjs`（判据 **DC1–DC6**：DC1 徽标类名族齐全 /
  DC2 文档不得虚构 CSS 变量 / DC3 partial 清单三处一致 / DC4 双模口径 == 代码 /
  DC5 徽章规格的 token 要真被 `var()` 引用 / DC6 覆盖度自证，防「改空了就通过」）
  + 自测 `scripts/test-design-system-contract.cjs`（注入矩阵，**接在 build 链**；D19 时 7 档，D20 补到 8 档，D21 补到 10 档）。
  D19 **不是新增需求** —— 规范本来就在站内，是**没人守**；按 M0 §3「一条缺陷一个编号」补号销账。
- **D20**：D19 那轮在「下一轮入口」②里留的线索 —— **反向**的那一半还没做。
  D19 的 DC2 判的是「文档提到 ⇒ CSS 里得有」（**正向**），于是「CSS 里定义了、文档没提」
  这类漏项**照样没人拦**。顺藤摸下去就撞见：`docs/design-system.md` §10 标题写的是
  「CSS **完整**自定义属性（可直接复制到 global.css）」，但实测 `src/assets/css/tokens.css`
  定义 **109** 个变量、§10 只列 **107** 个，缺 `--font-serif`（列表页 / 论文卡 / 精读页的标题在用）
  与 `--text-accent`（about 页与首页的强调色小标签在用）——
  ⚠️ 而 §10 列出的那 107 个**本身全对**（逐个核对，107 个全部在 `tokens.css` 里真实存在）⇒ 缺口就只是这 2 个。
  ⚠️ **不要误伤**：另有约 30 个 CSS 变量（`--bg-card` / `--border` / `--kind-*` / `--ghost` /
  `--chart-stroke` 等）定义在 `a11y.css` / `pages.css` / `_paper.css` / `_button.css`，
  属**组件局部变量**、不在主题调色板内 ⇒ 「**§10 == tokens.css 的变量集合**」才是正确判据，
  把它们算进来会假红。
  2026-10-20 14:30–15:00 场次按此修：§10 补上那 2 个（按 `tokens.css` 的**实际取值**写），
  并给 `scripts/check-design-system-contract.cjs` 加判据 **DC7**（§10 与 `tokens.css` 的变量集合
  **必须完全相等**，两个方向都判：缺项、多项都红），配自测档 **DT7**；
  同时把自测里「每档只触发它自己那一条判据」从**人工核对**升级成**脚本断言**
  （判据编号只从红因行开头取），并把 **DT2 的注入点从 §10 挪到 §11** ——
  §10 是 DC7 的比对面，注入点放那儿会同时触发 DC2 与 DC7，就分不清是谁在报警了。
  D20 **不是新增需求** —— §10 的「完整」是文档自己写的承诺，是**没人守**。
- **D21**：D20 把 §10 盯住了，但**同一份文档的调色板两节（§2.2 / §2.3）还没人守** ——
  `docs/design-system.md` §2.2「Light 模式 CSS 变量」与 §2.3「Dark 模式 CSS 变量」是
  `src/assets/css/tokens.css` 的**文档副本**，实测已经漂了：§2.3 的暗色块只列 35 个，
  `tokens.css` 的暗色块有 43 个 —— 漏掉 8 个覆写（`--text-accent` / `--link-color` /
  `--link-hover` / `--shadow-focus` / `--color-success` / `--color-warning` /
  `--color-danger` / `--button-primary-bg`）；其中 success / warning / danger 三个暗色值
  **正是 §2.4 对比表 Dark 列写的值** ⇒ §2.4 引用了一个在 §2.3 里**查不到出处**的量。
  §2.2 也漏 3 个（`--text-accent` / `--button-primary-bg` / `--shadow-focus`）。
  ⚠️ **不要误伤**：两节里**已列**的那些变量取值本身**全对**（逐个核对 0 处不符），
  §2.4 的三个对比度数字实算也全对 ⇒ 缺口只是**漏项**不是**错值**；
  §2.3 末尾的 `[data-theme="dark"]` 块是**有意简写**，不是漏项。
  2026-10-20 15:00–15:30 场次按此修：§2.2 补 3 个、§2.3 补 8 个（取值逐字照 `tokens.css`），
  顺带把 §2.3 末尾那块**误导性**的注释（「同样用上面那套变量，可由 JS 注入」—— 实际是
  `tokens.css` 里写死的 CSS，JS 只改 `<html>` 上的 `data-theme` 属性）改成如实描述；
  并给 `scripts/check-design-system-contract.cjs` 加判据 **DC8**（三条子判据：
  ① **取值一致** —— 文档两个块里每个变量的取值必须与 `tokens.css` 对应块逐字相同；
  ② **暗色块集合双向相等** —— 漏一个 = 暗色下这个量根本没被覆写，多一个 = 文档里的暗色值是幻觉；
  ③ **浅色调色板不得漏项** —— `tokens.css` `:root` 里属于调色板家族的变量 §2.2 必须全列；
  ⚠️ 只对调色板家族做反向核对，`tokens.css` 里另有约 50 个非配色量归 §10（DC7）管），
  配自测档 **DT8 / DT9**（注入点就打在 §2.2 / §2.3 这两个比对面）；
  同时把 **DT7 的注入变量名**从 `--color-injected-selftest` 改成 `--injected-selftest-xyz` ——
  用调色板前缀会**一箭双雕**（DC7 与 DC8 同时炸），就分不清是谁在报警了。
  D21 **不是新增需求** —— §2.2 / §2.3 的「变量清单」是文档自己写的承诺，是**没人守**。
- **D22**：D21 把「视觉规范里的 token」盯住了，但**文档里写死的数值**这一族还没有人守 ——
  `docs/ROADMAP.md` §1 现状基线写「`npm run build` 共 **27 步**」、`docs/DEFECT-BACKLOG.md` §2
  门禁链行写「**27 步**全绿」，而**修前**实测 build 链是 **40 段**（39 个 `npm run` + 1 个裸 `eleventy`）⇒ 漂了 13。
  ⚠️ **这不是新问题**：D18 那场就把口径定成「**不含数字**的写法」（「全链门禁」），
  并当场订正了 2 处会反复漂的快照数字 —— 但那两处「现状陈述」**没改到**，
  而且这个原则**全仓无人守**（没有任何一条门禁判「文档里写死的易变数量」）。
  同一行的「三个自测脚本未接链」也陈旧了（`EXEMPT_SELFTEST` 实测 **4** 条）。
  2026-10-20 15:30–16:00 场次按此修：两处改成不含数字的写法；
  新增门禁 `scripts/check-doc-snapshot.cjs`（判据 **DS1–DS4**：DS1 现状块出现「数字 + 步」即判红 /
  DS2 实测基准自证 / DS3 两个现状小节必须存在、非空、且各自至少含 1 个非历史块 /
  DS4 豁免机制与覆盖度自证）+ 自测 `scripts/test-doc-snapshot.cjs`（**6 档**注入矩阵，**接在 build 链**）。
  D22 **不是新增需求** —— 「每轮都会变的数量不该写死在现状陈述里」是 D18 自己写下的原则，是**没人守**。
- **D23**：这一条是**前端真缺陷**（不是文档漂移那一支）——
  首页与论文列表页那 7 个资源出口（Paper / DOI / PDF / Code / Capsule / Data / Figure）
  的**可点区只有 13px 高**：`src/assets/css/pages.css` 的 `.home-pub__link` 是
  `font: 600 10px/1.3` 且**无 padding**，行盒就那么高。窄屏（360 / 390px）下换行处
  上下两个目标的 24px 圆**互相相交**（实测圆心距 17.4px < 24px）
  ⇒ WCAG 2.5.8（Target Size, Minimum, AA）的 spacing 例外也**不成立**
  ⇒ 这是 **AA 级客观不通过**，不是风格偏好。
  ⚠️ **不要误伤**：全站 6 页 × 2 档窄屏盘点下来，所有 <24px 的目标里
  **只有这一类是"非行内"的独立目标**；其余全是散文里的行内链接（作者名 / DOI 文本 /
  邮箱 / 页脚社交行），走 WCAG 2.5.8 的**行内例外**；首页社交链接 20px 但圆心距 45px
  ⇒ spacing 例外成立 ⇒ **合规，不动**。
  ⚠️ 与 **D11** 同族但**不是复发**：D11 写下的「触控高 ≥ 24px」验收线指的是论文精读页
  TOC 链接（实测 27 / 49px，本来就合规），**不含**首页论文卡片这批 `.home-pub__link`
  ⇒ 这是同一族坏版式的**新位置**。
  2026-10-20 16:00–16:30 场次按此修：`.home-pub__link` 加 `min-height: 24px`
  并把 `align-items` 由 `baseline` 改成 `center`（让 24px **对称地**罩住文字，
  ↗ 箭头相对文字的位置与字号、配色、横向间距**一律不动**）；
  配套门禁给 `scripts/check-overflow.cjs` 增判据 **TS1–TS4**（按 WCAG 2.5.8 原文实现
  **三条通过路径**：① ≥24×24；② spacing 例外；③ 行内例外 —— 其中"在句子里"的判据是
  **最近的块级祖先**去掉所有目标后仍剩非目标文字，且目标本身是行内盒；
  豁免数必须在通过文案里**如实报出**，不许悄悄放过）
  + 自测 `scripts/test-overflow-targets.cjs`（**6 档**注入矩阵，**接在 build 链**）。
  连带修了一处：`scripts/test-overflow-widths.cjs` 的夹具站原本**一个交互目标都没有**
  ⇒ 新判据的 **TS1**（一个都没量到即判红）在 M0 / M5 两档「干净产物应判绿」里判红
  ⇒ 已在夹具里加一句**行内链接**（并在文件头写清**不可删**及原因）。
  D23 **不是新增需求** —— 「触控高 ≥ 24px」这条验收线**项目自己早就写下了**（D11），
  只是**没人量到首页这批**；本轮是把同一族坏版式的**新位置**补上。
  ⚠️ **边界**：本轮**不动** `scripts/check-a11y.cjs`（它是纯静态门禁、没有浏览器，
  量不到渲染后的尺寸）；也**不新增**浏览器门禁 —— 复用 `check-overflow.cjs` 已有的
  Chrome 会话与 7 档宽度。**待拍板 42** 问的是「**交互行为**（读数 / 键盘 / 游标）
  要不要配常驻浏览器门禁」，本轮断言的是**静态布局属性**（渲染后的触点尺寸），
  且是扩展**已存在且已在 build 链内**的浏览器门禁 ⇒ **不代拍、不新增登记**。
- **D24**：又是一条**前端真缺陷**（同样不是文档漂移那一支）——
  **「滚到了却看不见」**：站内所有「滚动定位」都把目标滚到视口**顶**
  （跳转链接 `#main`、论文页目录条目的 `scrollIntoView({block:"start"})`），
  而吸顶顶栏 `header.topbar` 是 `position:sticky; top:0`、高 56px、就钉在那儿
  ⇒ **目标被顶栏整条盖住**。修前实测（6 页 × 2 档，真实 Chrome + CDP）：
  跳转链接 `#main` 被盖 **56px**（整整一条顶栏，4/6 页）；
  论文页目录 6 个标题被盖 **~15px** —— 而标题行高只有 15px
  ⇒ **被盖的正好是整条标题，点目录后一个字都看不见**。
  根因不是「忘了写让位」，而是**写了但没生效**：`paper-reader.css` 里那条注释写着
  「点目录后标题不被顶栏压住」的 `scroll-margin-top: 88px`
  挂在 `.paper-body h2[id], .paper-body h3[id]` 上，
  而论文页真正被目录指向的 6 个标题都在 `.paper-body` **外面**的 `<section>` 里
  （`.paper-body` 内那 4 个标题是 markdown 的 `##`、**没有 id**）
  ⇒ 实测**匹配 0 个元素** ⇒ 那条意图写了很久却从未生效。
  ⚠️ 这条也是 **D11 当年验收口径的漏网**：D11 的验收文案写的是
  「目标标题距视口顶 0px」—— 只验了「滚到了」、**没验「没被遮住」**
  ⇒ 顺手把这个 bug 放过了。
  2026-10-20 16:30–17:00 场次按此修：改法选**根滚动容器**（`html`）给
  `scroll-padding-top: 88px`（88 = topbar 56 + 32 呼吸，与 `.paper-toc` /
  `.annot-pane` 的 `top: 88px` 同一口径）——
  **不选**逐目标挂 `scroll-margin-top`：那种写法要靠选择器逐条匹配、
  **漏一条就白写**（本仓已经因此白写过一次），加在根上则**一视同仁**；
  同时删掉 `paper-reader.css` 那条匹配 0 个元素的死 `scroll-margin-top`
  （留着是 latent bug —— 将来 `.paper-body` 标题一旦有 id，
  会与容器 scroll-padding **相加**成 176px）；
  配套门禁给 `scripts/check-overflow.cjs` 增判据 **AN1–AN3**
  （AN1 目标不得被吸顶顶栏遮住 —— 遮挡线按**计算样式**找
  `position:sticky/fixed` 且当前矩形贴着视口顶的元素，**不写死 class 名**；
  AN2 判据**自证存活**（每页每档都量到目标 + 判据空跑即判红，
  且用**独立信号**「钉在文档顶的吸顶元素」交叉验证遮挡线检测没坏）；
  AN3 **论文页目录覆盖自证** —— 量到的目录目标数必须等于该页带 id 的标题数，
  少了就说明「目录指不到的那些标题」是**判据盲区**）
  + 自测 `scripts/test-overflow-anchors.cjs`（**8 档**注入矩阵，**接在 build 链**：
  含 4 条判据级负对照 —— 遮挡判定被卸掉 ⇒ 转绿、遮挡线**检测**被卸掉
  ⇒ **转红且红因是 AN2 空跑**（不许悄悄放过）、站内锚点收集被卸掉 ⇒ AN2 判红、
  目录目标收集被卸掉 ⇒ AN3 判红）。
  连带修了一处：`scripts/test-overflow-targets.cjs` 与 `scripts/test-overflow-widths.cjs`
  的夹具站原本**没有可解析的锚点目标** ⇒ 新判据的 **AN2**
  在两份自测的「干净产物应判绿」档里判红 ⇒ 已给夹具补 `<main id="main">`
  + 一条**句子里**的跳转链接（行内例外，不给 TS1 添乱），两份自测恢复全绿。
  D24 **不是新增需求** —— 「点目录后标题不被顶栏压住」这条意图
  **项目自己早就写下了**（就在 `paper-reader.css` 的注释里），只是**从没生效**；
  本轮是把它**真的做出来**，并给它配上门禁。
  ⚠️ **边界**：本轮**不动** `src/assets/js/paper-reader/highlight.js` 的 `block:"center"`
  （整个批注子系统当前不可达 ⇒ 不受影响）；**不新增**浏览器门禁 ——
  复用 `check-overflow.cjs` 已有的 Chrome 会话与 7 档宽度；
  **待拍板 42** 问的是「**交互行为**要不要配常驻浏览器门禁」，
  本轮断言的是**渲染后的滚动落点与遮挡几何** ⇒ **不代拍、不新增登记**。
- **D25**：还是一条**前端真缺陷**（同样不是文档漂移那一支）——
  **暗色主题下论文精读页的 Key Points 三条要点完全读不出来**（实测 **1.03:1**，AA 要 4.5:1）。
  根因在**token 层**：`.paper-keypoints` 自带底色 `var(--color-accent-50)`，
  而 `tokens.css` 的暗色段**只重映射了 accent-400/500**，**accent-50 漏了**
  ⇒ 亮奶白底 `#fff3eb` 原样留在暗色页面上，压在上面的是暗色近白正文 `#f5f2ea`。
  ⚠️ 同一页的 `.paper-plain-language` 用 `--color-brand-50`（暗色**有**重映射）就正常
  ⇒ 差别只在一个 token 有没有跨主题翻档。
  ⚠️ 本轮**证伪了三条**看着像缺陷的东西：① `.paper-keypoints h2` 的 accent-700 其实合格
  （**8.42:1**，静态扫描统一拿 `--bg-page` 当底色 ⇒ 大面积误报）；
  ② 全站其余「亮底」多属 badge tinted 底 / 装饰图版 / hover 态，**不是缺陷**；
  ③ `.paper-head__meta .dot` 装饰点（1.51 / 1.65:1）属**设计取舍** ⇒ **另开 D26**，不代拍。
  2026-10-20 17:00–17:30 场次按此修：改法落在 **token 层**（`tokens.css` 暗色两处块
  重映射 `--color-accent-50: #2a1408`，对齐 `--color-brand-50` 的既有正确做法），
  **不选**组件层局部覆写 —— A8 是 **token 级**判据，组件层覆写会仍被判红；
  连带修两处：`.paper-keypoints h2` 暗色改 `--color-accent-500`
  （暗色 accent-700 压新底只有 1.85:1）、`.badge--accent` 补
  `@media (prefers-color-scheme: dark)` 路径覆写
  （accent-50 压暗后该路径下 accent-600 文字只剩 3.22:1）。
  配套门禁给 `scripts/check-a11y.cjs` 增判据 **A8**
  （凡是**被当作底色用**的色阶 token，浅色主题下 L ≥ 0.7 亮底档**必须**在暗色被重映射，
  且重映射后不得比该主题 `--bg-page` 亮出 0.05）
  + 自测 `scripts/test-a11y-contrast.cjs`（**6 档**注入矩阵，**接在 build 链**：
  含 C1 真实缺陷形态判红且**只有 A8 一条**红因、C2/C3 两种红因文案可区分、
  C4 真暗值转绿、C5 按 SHA-256 校验原件没被动过）。
  D25 **不是新增需求** —— 「被当作底色的 token 跨主题要翻档」这条意图
  **本仓既有正确做法里就有**（`--color-brand-50` 暗色段就重映射了），
  只是 accent-50 被漏掉；本轮是把它**补齐**，并给它配上门禁。
  ⚠️ **边界**：A8 只认**显式**写进 `background` / `background-color` 的 `var(--token)`
  （并展开一层底色 token 的引用），靠伪元素 / filter / SVG 造出来的底看不到；
  「暗底 + 暗字」那一族**不在本判据范围内** ⇒ A8 **不等于**完整 WCAG 审计。
- **D26**：这一轮**不是**前端视觉缺陷，是一条**内容事实缺陷**——
  **首页华北降水图图注的「Data.」段，出处与登记事实不符**。
  三个同源症状：① **论文链接指向同行评审讨论页**：
  `source.paperUrl` 写的是 `https://doi.org/10.5194/essd-2025-20`，
  实测落点是 `essd.copernicus.org/articles/17/3987/2025/essd-17-3987-2025-**discussion**.html`
  —— 那是**同行评审的往返记录页**，不是论文页（正式发表版 `10.5194/essd-17-3987-2025`，
  落点 `essd.copernicus.org/articles/17/3987/2025/`）⇒ **链接照样打得开、页面照样好看，没人会发现**；
  ② **署名漏一位注册创作者**：Zenodo 记录（`10.5281/zenodo.14632156`，DataCite）的 creator
  是 **3 位**（Hu Jinlong / Miao Chiyuan / **Zhang Qi**，机构均 Beijing Normal University），
  站点只写 2 位 ⇒ 读的人会以为这份数据是两个人做的；
  ③ `source.paperTitle` 记的是「**数据集标题的截断混写**」（既不是论文标题 —— 真论文标题没有
  `CHM_PRE V2:` 前缀；也不是完整数据集标题 —— 漏了 `considering spatial autocorrelation and
  covariates`），而且**全仓无人渲染**。
  ⚠️ 三者是**同一处「出处未按登记事实记录」**的根因，落在同一段落、同一数据源块 ⇒ 一条缺陷处理。
  ⚠️ **判定口径**（这条容易再踩）：ESSD/Copernicus 的 DOI 由 **Crossref** 登记、**不在** DataCite
  ⇒ `api.datacite.org/dois/10.5194/...` 一律 **404**，**不能**拿 DataCite 的 404 判 DOI 不存在；
  要判必须看**真实落点**（node `fetch` 跟重定向）。
  ⚠️ 本轮**排除了八条**看着像缺陷的东西（每条都做过实测，不是推断）：
  ① 暗色 selector 写法（`:root:not([data-theme="light"])` + `[data-theme="dark"]`，三态主题）⇒ 正确；
  ② 图版白纸衬底（`div.home-pub__figure-plate` / `div.paper-figure__plate` 暗色下 own=白）
  —— CSS 注释明确记录了写死 `#ffffff` 的理由（避免与图本身白底之间裂出发灰接缝）
  ⇒ 改它等于翻转**已记录的设计决策**，排除；
  ③ 外链可达性门禁 —— CodeOcean 403、Zenodo/DOI TLS 失败，**环境不可靠** ⇒ 会产出假红，排除；
  ④ 引用元数据 —— `check-citation-meta.cjs` 的 C1–C8 已覆盖，排除；
  ⑤ `extremePrecip.json` 的 `summary` 派生量 —— **上一轮摘要里那两条「严重不符」是自造探针口径错误**，
  重新逐条精确核算后**全部通过**（`shareYearsAbovePre2020Max`=[2021,2024] 用的是严格 `>`；
  `earlierRx1dayRange`=[52.4,55.8] 是**各年代均值**的极差、不是逐年值的极差；
  两个面板 7 个 `decadal` 均值与 `trend.perDecade`（OLS×10）逐条对上）⇒ 该数据文件完全自洽，候选作废；
  ⑥ ARIA 引用完整性 —— 自写静态探针扫全部产物页 **0 问题**，且 A5/A6/A7 已全覆盖，排除；
  ⑦ 运行时控制台报错 —— CDP 逐页抓 6 个页面，console 零报错、零异常、零 ≥400 响应，排除；
  ⑧ 论文引用元数据 vs 外部登记 —— `mcp__agu-papers__get_metadata` 与 OpenAlex 交叉核，
  站内 volume 131 / issue 11 / articleNumber e2026JD046836 / 作者顺序 7 人 / ISSN / 期刊 / 出版日
  **逐条吻合**，排除。
  2026-10-20 18:00–18:30 场次按此修：`source` 段改成**结构化**
  （`creators` 3 位 + `affiliation` + `paper{doi,title,journal,volume,issue,pages,year}` + `dataDoi`），
  删掉 `paperUrl` / `authors` / `paperTitle` 三个字段；图注按结构化字段渲染，
  印出**完整论文标题** + 期刊 / 卷 / 期 / 页 / 年。
  配套门禁给 `scripts/check-home-chart.cjs` 增判据 **HC7**
  （**HC7-1** 论文 DOI 必须是 Copernicus 正式发表版形态 `10.5194/<刊>-<卷>-<首页>-<年>`
  （预印本/讨论页形态一律判红），且从 DOI 读出的**卷 / 首页 / 年**要与真源对上；
  论文标题必须是**另一份登记记录**（Zenodo 数据集标题）的**后缀** ⇒ 单独截断标题会被抓住；
  **HC7-2** 产物「Data.」段与真源**逐字一致**，且不许出现第三个 DOI）
  + 自测 `scripts/test-home-chart.cjs`（**14 档**注入矩阵，**接在 build 链**：
  M8–M12 五种错法各自判红；M13 是**边界负对照** —— 真源与产物**一起**改错时门禁**判绿**，
  把「门禁守不了什么」变成一条**会跑**的自测）。
  D26 **不是新增需求** ——「出处要按登记事实记录」这条意图**本仓自己早就写下了**
  （模板文件头就写着「数值只存在一处」「图注必须写清三件事」），
  只是那一段**从未按登记事实核过**；本轮是把它**真的对齐**并给它配上门禁。
  ⚠️ **边界**：HC7 守的是「产物与真源不漂移」+「DOI 形态与卷/页/年自洽」+
  「论文标题与数据集登记标题成后缀关系」；它**守不了**「真源自己写错」
  （creators 少一位、或两个标题一起改错）⇒ 真源正确性仍靠人工核 + 外部登记核对。
- **D27**（本轮修的是缺陷 **D28**）：这一轮还是**内容事实缺陷**那一支，但换成**站内介绍自己的那几处措辞**——
  **about 页对同一条 Zenodo 数据集记录（`10.5281/zenodo.18041880`）给了三处互相矛盾、
  且与登记事实不符的描述**：① Contact 行写死 `<dt>Software</dt>`，② Selected output 段
  类型词写死 `Code`，③ 散文把这条记录说成「tool / code」；而 DataCite 登记事实是
  `types.resourceTypeGeneral` = **`Dataset`**（v1.0 / v2.0 / 概念 DOI 三条登记**一律** Dataset）。
  ④ 附带一处名字对不上：Selected output 的链接文字用的是 v1.0 时期的旧标题
  「Thunderstorms stage identification」，而这条记录**当前登记的标题**（v2.0）是论文标题。
  ⚠️ **不要误伤**：论文参考文献表里那条写的是「Lyu Y.(2025). … [Software]. Zenodo.」——
  那是**论文原文的引用写法**（标题沿用 v1.0、类型标 `[Software]`），本站与论文保持一致是对的；
  论文精读页的 `<dt>Dataset</dt>` + `registeredTitle` + 双标题说明是**正确基准** ⇒ 本轮**只管页面上
  对这条记录的描述**，引用条目与论文页都不动。
  2026-10-20 19:00–19:40 场次按此修，分两层：
  ① **描述层**：Contact 行、Selected output 段、散文列表项三处的类型词统一取**登记事实**
     （`Dataset`）；Selected output 的链接文字改用 `registeredTitle`（这一版在 Zenodo 登记的名字），
     括号里给**版本号**（`Zenodo · v2.0`）而不是引用口径的「作者-年」——
     v2.0 的登记标题是 2026 年随论文发布改的，而作者-年是 2025，两者并排会让读者把 2025
     误读成这条记录的年份；散文改成「数据集在 Zenodo（可引用）+ 分析代码在 GitHub」，
     与记录 description 原文一致（description 里就写着代码在 GitHub）。
  ② **真源层**（治「同一事实两份副本」）：`site.js` 顶部加一组常量
     `DATASET_DOI` / `DATASET_URL` / `DATASET_TYPE`，`software.doi` / `.url` / `.resourceType` 与
     `author.zenodo` / `.zenodoDoi` / `.zenodoType` **全部从它派生**；散文里原本**写死**的
     `10.5281/zenodo.*` 地址改成**构建期占位符**（`about.md` 不过 Nunjucks ⇒ 由
     `eleventy.config.js` 在 `md.render` 之前替换，**取不到真值就原样留下占位符** ——
     露错优于静默渲染成空链接）。
  门禁 `scripts/check-about-dataset.cjs`（判据 **AP1–AP5**：类型词跨页一致 / 可见 DOI 同源 /
  登记标题 / 散文措辞与不写死地址 / 覆盖度自证 + build 链接线自证）
  + 自测 `scripts/test-about-dataset.cjs`（**11 档**注入矩阵，**接在 build 链**：
  AT0 基线绿 · AT1–AT9 九种错法各自判红且**红因点名对应的那一条** · **AT10 边界负对照**
  —— 真源与产物**一起**改错时判绿，把「门禁守不了什么」变成会跑的测试）。
  D28 **不是新增需求** ——「同一事实只存一处、描述按登记事实写」这条意图**本仓自己早就写下了**
  （`site.js` 文件头、`about.md` 文件头都写着「数值只存在一处」「可核实事实不写死字面量」），
  只是那三处**从未按登记事实核过**；本轮是把它**真的对齐**并给它配上门禁。
  ⚠️ **边界**：AP1–AP5 守的是「产物与真源不漂移」+「类型词与登记事实一致」+「不出现第二份副本」；
  它**守不了**「真源自己写错」（把 `DATASET_TYPE` 改成 `Software` 并重建 ⇒ 产物与真源仍自洽）
  ⇒ 真源正确性仍靠**人工核 + 外部登记核对**（DataCite）。
  ⚠️ 本轮顺带修了两处**注释与现状不符**：`resourceType` 的注释还写着「页面上不渲染它」
  （本轮起 about 页开始渲染它了）；`software.author` 缺一条「页面上刻意不渲染它」的解释。
- 剩下的后端缺陷都绑在本人拍板项上（D2 / D3 ↔ 待拍板 40、D9 ↔ 41、D10 ↔ 42、D12 ↔ 43、
  D5 ↔ M1-3 选题主线、D6 ↔ push 时机 = 待拍板 7）⇒ 那几个方向本轮没有可动手项。
  ⚠️ 本轮顺带查明 **D6 之所以能积到上百个提交**：线上站点来自**公开发布仓**
  `oldsixxiaolv/oldsixxiaolv.github.io`，而 `docs/DEPLOY.md` §二 的发布命令推的是**私有源码仓**
  `oldsixxiaolv/MeteoHub` ⇒ 照文档 push **不更新线上**，且**看不出来**（push 成功、CI 不跑）。
  「发布到哪个仓」已登记为**待拍板 49**，本轮不代拍。
- **D28**（本轮修的是缺陷 **D29**）：这一轮还是**内容事实缺陷**那一支，但换成**首页那句自我介绍**——
  **首页简介段把同一条 Zenodo 数据集记录（`10.5281/zenodo.18041880`）说成「code / tool」**，
  与登记事实不符，也与**上一轮刚修好的 about 页自相矛盾**（about 页已改口「dataset + code on GitHub」，
  首页仍在说「code / tool」⇒ 同一份记录，站内两页给了两种说法）。
  原文：「Storm identification **code** and **figure data** are released openly — the stage-identification
  **tool** is archived on [Zenodo], and the TRMM analysis pipeline lives in [Manuscript_Lvyh].」
  三个同源症状：① 把一条登记为 `Dataset` 的记录说成「**tool**」；
  ② 把登记在 Zenodo 上的**数据**说成「**code** / figure data」（记录里装的是
  `TRMM_tropical_convection_dataset.zip` 等数据文件）；
  ③ 把「代码在 GitHub」与「数据在 Zenodo」混进同一句 ⇒ 读者只会以为 Zenodo 上那条是代码。
  登记事实（DataCite `types.resourceTypeGeneral` = **`Dataset`**）与记录 description 原文
  （「This **database** is for the article … You can come to my GitHub to download the **codes**」）
  指向同一件事：**数据在 Zenodo、代码在 GitHub**。
  2026-10-20 19:45–20:20 场次按此修，分两层：
  ① **措辞层**：那段改成「The TRMM tropical convection 〈类型〉 behind this work is released openly —
     the 〈类型〉 is archived on [Zenodo] so it gets a DOI and stays citable, and the analysis code
     lives in [Manuscript_Lvyh].」—— 类型词从**真源** `site.author.zenodoType` 取（与 about 页、
     论文页同一口径，不另写字面量）；「TRMM tropical convection」逐字取自记录内的文件名
     （记录没写「tropical Africa」，不编）。
  ② **结构层**（这一条是门禁的一部分）：段落次序固定为「这条记录是什么 → 它的链接 → 代码在 GitHub」，
     门禁只看**链接之前**那段文字（那正是「这条记录是什么」那一句）⇒ 链接之后的
     「the analysis code lives in …」说的是 GitHub 仓库，不该被类型词约束。
  门禁 `scripts/check-about-dataset.cjs` 增判据 **AP6**（**仍不改名**：文件头已如实写清真实覆盖面 ——
  about 页 3 处 + 论文页 1 处 + **首页简介段 1 处 = 5 处**；改名要牵动 package.json / README / 自测三处，
  且 `AP*` 编号已入日志）+ 自测 `scripts/test-about-dataset.cjs` 增 **4 档**（AT11–AT14，
  合计 **15 档**注入矩阵，**接在 build 链**）：AT11（说成 tool）/ AT12（不按登记类型称呼它 —— **两处**
  类型词都要换，只换一处会假绿）/ AT13（定位标记被删）/ AT14（说成 code）⇒ 逐档判红且红因点名。
  负对照（真实坏态级）：把新门禁跑在**修前产物**上 ⇒ exit 1、**4 条**红因**全部只落在首页**
  （about 页与论文页无假红 ⇒ AP1–AP5 没被误伤）。
  D29 **不是新增需求** —— 「同一事实只存一处、描述按登记事实写」这条意图本仓自己早就写下了
  （`site.js` 文件头写着「数值只存在一处」），只是首页那处**从未按登记事实核过**；
  本轮是把它**真的对齐**并给它配上门禁。
  ⚠️ **边界**：AP6 守的是「首页简介段与真源不漂移」+「按登记类型称呼这条记录」；
  它**守不了**「真源自己写错」（真源与页面一起改成 Software 并重建 ⇒ 仍自洽，AT10 就是这条边界的
  可执行版本）⇒ 真源正确性仍靠**人工核 + 外部登记核对**（DataCite）。
  ⚠️ 本轮顺带清掉一处**每轮都会变的数字**：上一条里「D6 之所以能积到 173 个提交」的提交数是
  **每轮 +1 的快照**，与 D18 / D19 / D22 订正过的是同一族问题 ⇒ 改成不含数字的写法（「上百个提交」），
  事实不变、也不会再随轮次漂移。
  ⚠️ 本轮**没有新增待拍板项**：剩下能动手的后端缺陷仍全绑在既有待拍板项上
  （D2 / D3 ↔ 40、D9 ↔ 41、D10 ↔ 42、D12 ↔ 43、D5 ↔ 选题主线、D6 ↔ push 时机 = 7），
  所以本轮按 §3 规则 3 **新开 D29** 而不是重开旧号。
- **D29**（本轮修的是缺陷 **D30**）：这一轮**不是**内容事实缺陷那一支，换成**同一张图的多处声明对不对得上**——
  **论文成果图的 src / 宽 / 高有两份真源，而四个出口各取各的**：
  真源之一是 `site.js` 的 `publications[0].figure`（`src` / `width` / `height` / `alt` / `caption`），
  真源之二是论文页 front matter 的 `cover` / `coverWidth` / `coverHeight`；
  正文 `<img class="paper-figure__img">` 读**前者**，而 `og:image` / `og:image:secure_url` /
  `og:image:width` / `og:image:height` / `twitter:image` / JSON-LD 的 `ScholarlyArticle.image`
  读**后者** ⇒ 改一处忘另一处，**正文图与分享卡就不是同一张**；旧图一旦被删，`og:image` 立刻变死链
  （线上每张分享卡片拿到的都是 404，而 build 通过、门禁全绿、页面照常渲染）。
  最矛盾的一处：论文页 front matter **自己的注释**写着「封面图与它的 alt 都在 site.js 的
  `publications[].figure` 里」⇒ **注释描述的意图与代码实际状态相反**，那份副本是历史遗留
  （注释按意图写的，代码没跟上）。
  盲区有据可查：`check-image-assets.cjs` 的 **IA1–IA7** 逐条验「**声明的那张图**自身对不对」
  （文件在不在、声明尺寸等不等于真实像素、alt 有没有），**从不验「同一张图的多个声明是不是同一张」**
  ⇒ 与 D27 / D28 处理过的「同一事实两份副本」是同一族病。
  2026-10-20 20:20–20:40 场次按此修，分两层：
  ① **数据层**：论文页 front matter **删掉** `cover` / `coverWidth` / `coverHeight` 三行副本，
     注释改写为「封面图的 src / 宽 / 高 / alt 都不在这里写，唯一真源是 site.js 的 `publications[].figure`」。
  ② **模板层**：`base.njk` 新增 `figureCover` / `coverSrc` / `coverW` / `coverH` 四个 set ——
     front matter 的 `cover` **优先**，没有则回落到 `pubMeta.figure`；`og:image` 段与 `twitter:image` 段的
     条件与取值全部改走 `coverSrc`，og 宽高改走 `coverW` / `coverH`；
     `paper.njk` 的 JSON-LD `coverUrl` 也改走同一个 `coverSrc`。
     ⚠️ front matter 的 `cover` 机制**保留**给**没有 pubKey 的内容页**（博客等）做页面级覆盖，
     论文页走回落路径 ⇒ 两条路互不干扰，通用机制没被拆掉。
  门禁**新开一个文件** `scripts/check-figure-cover.cjs`（判据 **CV1–CV4**），**不并进 IA**：
  IA 管「每条声明自身对不对」，本门禁管「同一张图的多个声明之间对不对得上」，
  判据形状不同，混在一起会让 IA 的逐条自证计数含义变含混。
  CV1 四个出口（正文 `<img>` / og:image / twitter:image / JSON-LD `ScholarlyArticle.image`）
  归一化成站内路径后**逐字相同**且等于 `figure.src`；CV2 `og:image:width/height` 与正文 `<img>`
  的 width / height 属性等于 `figure.width/height`；CV3 论文页 front matter **不得**再出现
  `cover` / `coverWidth` / `coverHeight`；CV4 覆盖度自证 + 本门禁必须接在 build 链
  （用 `/npm run check:figure-cover(?![\w-])/` 精确匹配，避免 `check:figure-cover-selftest`
  的前缀把它蒙混过去）。
  自测 `scripts/test-figure-cover.cjs`：**12 档**注入矩阵 CV0–CV11，**接在 build 链**；
  **CV11 是边界负对照**（真源与产物**一起**改错 ⇒ 判绿）—— 把「门禁守不了什么」做成一条**会跑**的自测。
  ⚠️ 归一化要同时吃**绝对 URL** 与**页内相对路径**（本仓 `| relUrl` 产出的是相对路径 ——
  论文页上是 `../../assets/…`）⇒ 这是「整个文件夹扔到哪都能跑」的搬迁契约（404 页除外，普通页面不受影响），门禁不能按挂载点写死。
  负对照（真实坏态级）：把新门禁跑在**修前产物 + 修前真源**上
  （`git worktree add --detach` 取 HEAD `2db68f0` + `node_modules` 软链 + eleventy 单独构建）
  ⇒ exit 1、**3 条**红因**全部只落在真源副本上**（`cover` / `coverWidth` / `coverHeight` 三条 CV3，无假红）。
  ⚠️ **如实记**：CV1 / CV2 在修前产物上是**绿的** —— 因为两份副本**当前取值恰好相同**，漂移**尚未发生**；
  门禁抓的是「副本存在」这个形态，漂移一旦发生（CV8 / CV9 两档就是那个形态）即判红。
  浏览器实测（真实 Chrome + CDP）：四个出口归一化后**同一张图**；`og:image:width/height` =
  正文 `<img>` 属性 = **实际像素**，三者相等；正文图**确实加载成功**（`complete` 且 `naturalWidth>0`）；
  console 错误 0、未捕获异常 0、加载失败请求 0。
  D30 **不是新增需求** —— 「封面图的真源在 site.js」这条意图本仓自己早就写在 front matter 的
  注释里了，只是代码没跟上 ⇒ 本轮是把它**真的对齐**并给它配上门禁。
  ⚠️ **边界**：CV1–CV4 守的是「一处真源」+「四个出口同图同尺寸」；它**守不了**「封面图选得对不对」
  （真源与产物一起改成另一张图 ⇒ 仍自洽，CV11 就是这条边界的可执行版本）⇒ 选图仍靠人工核。
  ⚠️ 本轮**顺带修**一处**现状陈述与事实不符**：README 命令表里 `check:about-dataset-selftest`
  那行仍写着「11 档注入矩阵」，D28 已把它扩到 **15 档**（脚本自身结尾行也是 15 档）⇒ 订正为 15 档。
  ⚠️ 本轮**排除了一个候选方向**：论文标题大小写（站内写大写「From」，Zenodo / Code Ocean 两条
  自建记录写小写「from」）—— **已证伪**：出版商侧登记原题就是大写「From」
  （OpenAlex 与 Semantic Scholar 两路独立镜像一致）⇒ 站内正确，不用改。
  ⚠️ 本轮**没有新增待拍板项**：剩下能动手的后端缺陷仍全绑在既有待拍板项上
  （D2 / D3 ↔ 40、D9 ↔ 41、D10 ↔ 42、D12 ↔ 43、D5 ↔ 选题主线、D6 ↔ push 时机 = 7），
  所以本轮按 §3 规则 3 **新开 D30** 而不是重开旧号。

- **D30**（本轮修的是缺陷 **D31**）：这一轮还是**内容事实缺陷**那一支，换成**图注里那个「区域」本身**——
  首页华北降水图的图注里写着「land gridpoints **inside the box** only」，但**全站从头到尾没说过这个 box 在哪**：
  数据文件的 `region` 字段里明明写着 "North China, 32-50 N, 110-120 E"，
  **却从来没有被任何模板渲染过**（`region` 在 `src/` 下的引用数 = 0，只剩数据文件里那一行）；
  `source.landGridpoints`（13,896）同样无人渲染。
  ⇒ 读者被告知了「**排除**了蒙古和海」，却没被告知「**包含**的是哪一块」——
  图注里出现了一个**没有先行词的指代**（"the box"）。
  ⚠️ **为什么 build 与既有门禁全绿**：这条缺陷**不产生任何错误值** —— 页面照常渲染、链接照常可点、
  数字照常自洽（`extremePrecip.json` 的全部派生值已在上一轮实测自洽），
  缺的只是一个**从没写出来**的定义 ⇒ 任何「值对不对」型判据都抓不到它。
  盲区有据可查：`check-home-chart.cjs` 的 **HC1–HC7** 覆盖钩子 / 读数同源 / 键盘 / 模块 / 样式 /
  import specifier / 出处登记事实，**没有一条问「图注说的那个区域到底是什么」**。
  2026-10-20 20:45–21:25 场次按此修，分两层：
  ① **数据层**：`region` 从字符串改成**结构化**对象 `{ bbox, landGridpoints }`
     （坐标与格点数各自可渲染、可比对，不能塞在一个没人渲染的字符串里）；
     `source.landGridpoints` 挪进 `region`（它是「**这个框里**有多少个陆地格点」，不是数据集的属性）；
     `method.area` 去掉「inside the box only」这半句（改由模板 + 格点数一起承担），
     顺带把 `method.area` / `method.weighting` 的**句首大写**补上（原来两句话都是小写开头 ——
     上一句的续句被当成了独立句）。
  ② **模板层**：`extreme-precip.njk` 的「Data.」段在出处句之后加一句
     「The region is {{ bbox }} ({{ 格点数 }} land gridpoints inside the box).」——
     坐标**排在「the box」之前**，指代才有先行词。
  门禁：**HC8**（挂在既有 `check:home-chart`，**不新开 npm script** ⇒ README 命令表不用改）——
     HC8-1 真源 `region` 必须是结构化对象且 `bbox` / `landGridpoints` 都非空；
     HC8-2 产物图注里必须逐字出现 `region.bbox` 与 `region.landGridpoints`；
     HC8-3 **顺序**：图注里出现「the box」时，区域范围必须排在它**之前**。
  自测 `scripts/test-home-chart.cjs`：**19 档** M0–M18（**接在 build 链**），新增 M14–M18 五档：
     M14 产物里没有区域范围 / M15 没有陆地格点数 / M16 真源坐标改了产物没跟着改 /
     M17 范围被挪到「the box」之后（悬空指代）/ M18 真源 `region` 退回字符串 ⇒ 各自判红且红因点名。
  负对照（真实坏态级）：新门禁跑在**修前产物 + 修前真源**上
  （`git worktree add --detach` 取 HEAD `113bffa` + `node_modules` 软链 + eleventy 单独构建）
  ⇒ exit 1、红因点名「真源里的 region 不是结构化对象」；
  再交叉两组（**修前产物 + 修后真源** ⇒ 「图注里没有区域范围」；**修后产物 + 修前真源** ⇒ 同前）
  ⇒ 三种错法都堵得住。
  浏览器实测（真实 Chrome + CDP）：图注「Data.」段的**真实 DOM 文本** =
  「… 2025. The region is 32-50 N, 110-120 E (13,896 land gridpoints inside the box).
  The dataset covers the Chinese mainland, so Mongolia and the sea are excluded by its own mask.
  Area-weighted by cos(latitude).」；坐标与格点数都在、坐标排在「the box」之前；
  h1 = 1、#main = 1、两张图都加载成功；console 错误 0、未捕获异常 0、加载失败请求 0。
  ⚠️ **边界**：HC8 守的是「区域被写出来」+「指代有先行词」；它**守不了**「这个框选得对不对」——
  坐标或格点数真源自己写错（框选偏了、格点数算错）时门禁照样绿 ⇒ 仍靠人工核 + 原始数据核对。
  ⚠️ 本轮**查清但没有修**的一条（登记为缺陷 **D32**，本轮**不代拍**）：
  页脚「Edit on GitHub」与 about 页「源码在哪」都指向**公开发布仓** `oldsixxiaolv/oldsixxiaolv.github.io`，
  而那个仓**停更 4 天、比本地 main 落后 181 个提交**（最后 push 2026-10-16T09:51:01Z），
  **全部 D 系列修复都不在里面** ⇒ ① 从页脚点「Edit this page」打开的是**旧副本**的编辑界面，
  改完提交、CI 重新部署 ⇒ **线上会退回 2026-10-16 的版本**（那版连 `/papers/` 都没有）；
  ② `/papers/` 页的编辑链接指向 `…/edit/main/src/papers.njk`，而**那个文件在公开仓的 main 分支里根本不存在**
  （GitHub API 文件树 MISS、`contents` API 404）⇒ 编辑器只会给出「该分支没有这个文件」的死路。
  修法（改 `site.author.repo` 指向哪个仓）**属待拍板 49**（发布到哪个仓），
  公开仓要追平则要 push（时机属**待拍板 7**）⇒ 本轮**只登记、不动手**。
  ⚠️ 本轮**排除了一个候选方向**：`extremePrecip.json` 里其余无人渲染的字段
  （`summary.meanRx1dayMm` / `shareRecordYear` / `shareRecordValue` / `recentSharePct` /
  `r95pAmount1960sMm` / `r95pAmountRecentMm` / `source.datasetTitle` / `method.trend`）
  ⇒ **不是缺陷**：它们是**可选的补充信息**，而 D31 那条是**指代读不成句**，形态不同。
  ⚠️ 本轮**没有新增待拍板项**：清单里剩下的「待修」仍全绑在既有拍板项上
  （D2 / D3 ↔ 40、D9 ↔ 41、D10 ↔ 42、D12 ↔ 43、D5 ↔ 选题主线、D26 视觉取舍、
  D6 ↔ push 时机 = 7 + 发布仓 = 49），D32 ↔ 49。

---

### M1 · 内容引擎（最高优先，因为博客现在是空的）

**为什么先做**：G-B 与 G-D 都依赖它。一个没有文章的 `/blog/` 页，再多动效也是空壳。

**做什么**
1. 修封面裂图：内容侧 `cover.png` → `cover.svg`（front matter 同步），确认 `useCovers` 能安全打开。
2. 写「站内长文写作规范」：front matter 契约（title/date/excerpt/readingTime/tags/cover）+
   正文结构（结论先行、图/代码/数据出处、延伸阅读）+ 英文风格要求 + 与 `check-lang`/`check-a11y`/
   `check-wrap` 的兼容点。
3. 产出**首批真实长文**：只允许基于仓库里已有的真实材料改写 ——
   CSDN 上的 Python/xarray/Fortran/WRF 技术笔记、`/papers/trmm-thunderstorm-stages/` 论文精读、
   华北降水数据集（`src/_data/extremePrecip.json`）。**不得编造数据、结论或引用**。
   ⚠️ **选题主线本人尚未指定**（2026-10-20 只确认了「布局别动」与「保持英文」）。
   在本人给方向之前：先把上面第 1、2 条（封面裂图、写作规范）做完，**不要自行定主线**；
   候选（待本人选）：① 论文精读 ② 华北降水数据 ③ CSDN 笔记改写成英文。
   本人给了方向后再落第一批文章。
4. 文章之间、��章与论文页、博客与 `/about/` 之间建立互链；`feed.xml` 里能看到新文章。

**验收**
- `/blog/` 不再是空状态页，至少 3 篇真实长文，列表卡有 excerpt / readingTime / 主题标签。
- 每篇：标题与日期完整、excerpt 非空、封面不裂（有封面的话）、`/blog/<slug>/` 可打开。
- `npm run build` exit 0；线上 `/blog/` 与 `/blog/<slug>/` 全部 200。

---

### M2 · 动效与前端质感（对应 G-C + G-A）

**做什么**
- **原则：动效要克制，只加在「需要的地方」**。判据是**好看、利落**，不是动效数量 ——
  一屏里有一两处让人舒服的反馈，胜过满屏的位移与缩放。做之前先问「这里加了什么会更好看」。
- 滚动进场（`IntersectionObserver` + `prefers-reduced-motion` 降级为直接显示）；
- 列表卡/论文卡的悬停与聚焦反馈；页面内锚点平滑滚动；
- 首页华北降水数据图升级为**可交互**（悬停读数、时间轴游标、键盘可达），仍保持零图表库；
- 论文精读页交互按 `docs/papers-interaction.md` 的既有规范补齐。

**进度（2026-10-20 10:30 实测）**
- 滚动进场：✅ 已做（`src/assets/js/main.js`，IntersectionObserver + `prefers-reduced-motion` 降级）
- 列表卡/论文卡悬停与聚焦反馈、页面内锚点平滑滚动：✅ 已做（`src/assets/css/base.css:21` 等）
- 首页华北降水图可交互：**✅ 已做（2026-10-20 10:00–10:30 场次）** ——
  悬停/触点读数、年份-数值-十年均值三行读数条、时间轴游标 + 数据点、键盘
  `←`/`→`/`Home`/`End`/`Escape` 逐年步进；**零图表库、零第三方运行时依赖**，
  交互模块按需动态 `import()`（只有这张图在页面上时才下载）。
  几何与数值由渲染器写进 SVG 的 `data-chart`，前端**不重算** ⇒ 读数与画出来的线同源。
  证据见 `docs/IMPROVEMENT-LOG.md` 的「2026-10-20 · 10:00–10:30 场次」小节。
- 论文精读页交互按 `docs/papers-interaction.md` 补齐：**◐ 部分**（2026-10-20 10:30–11:00 场次做完移动端版式）——
  ≤1024px 恢复 `§2.3` 的**单栏堆叠**：修掉一条 CSS **特异度** bug（`.paper-reader-wrap:not(:has(.annot-pane))`
  的 (0,2,0) 压过了媒体查询里的 (0,1,0) ⇒ ≤1024px 一直是两栏），实测 360–1024px 正文宽度从
  200~203px 回到 328~942px，页面总高 −37%；目录在 ≤1024px 从 `display: none` 改为正文上方的
  **静态块**（两列、触控高 ≥ 24px），触屏读者第一次有了跳转手段。桌面 1280/1440px 逐像素不变。
  ⬜ **仍未做**：批注层（`annotations.json` 全仓不存在 + `hasAnnotations` 全仓未定义 ⇒ 524 行批注代码
  不可达，见 D12）、移动端三 Tab 与 `?kind=` URL 持久化（`§7` / `§6`）。
  证据见 `docs/IMPROVEMENT-LOG.md` 的「2026-10-20 · 10:30–11:00 场次」小节。

**验收**
- 动效在 `prefers-reduced-motion: reduce` 下全部退化为无动画（可实测）；
- 键盘可完整操作新增交互；`check-a11y`、`check-overflow`、`check-wrap` 仍全绿；
- Lighthouse 指标不劣化（对照 `docs/lighthouse/` 的历史快照重测并记录差值）；
- **看截图说话**：动效前后各截一张，判断是「更利落」还是「更花」；后者要回退。

---

### M3 · 后台：让本人能登录写博客（对应 G-D）

**已定方案（2026-10-20 本人确认）：Decap CMS（`/admin/`）**

- **形态**：纯静态后台，跟站点一起发布在 GitHub Pages 上，**不需要维护任何服务器**。
- **写入路径与现有构建完全对齐**：Decap 的 folder collection 天然就是
  `folder/<slug>/index.md`，与本项目 `src/content/blog/<slug>/index.md` 一一对应，
  写完直接 commit → 触发 `deploy.yml` → 自动上线。
- **登录**：GitHub OAuth（一次性建一个 OAuth App，回调指向 Decap 的 OAuth 中转地址）。
  只用 GitHub，**不引入新的外部服务/账号/密钥**（凭据在 OAuth App 里，不进仓库）。
  ⚠️ **OAuth App 必须由本人建**（在 GitHub 开发者设置里，牵涉本人账号）：
  定时任务走到这一步要停下请本人操作，不得代建，也**不得把 client secret 写进仓库**。
- **需要做的**：`src/admin/index.html`、`src/admin/config.yml`（blog 集合的字段与
  `src/content/blog` 路径对齐）、`.gitignore` 里放行 admin、README 里补一句使用说明。

**为什么是它**（本人 2026-10-20 已确认采用；另两个方案未采用，记录在此备查）

| 方案 | 代价 | 结论 |
|---|---|---|
| **Decap CMS**（静态） | 一次 OAuth 配置；无服务器 | ✅ **采用** |
| 自建 Node 后端（Orange Pi + SQLite + 管理 UI） | 要另起一套服务、备份、TLS、鉴权；**且 GitHub Pages 构建要再从它取内容 → 两份内容源** | 备选，除非本人明确要「真·服务端后台」 |
| 托管 CMS（Tina/Sanity 等） | 新账号、新密钥、外网依赖 | 不采用 |

**前置依赖**：M1 的 front matter 契约必须先定稿，否则 CMS 字段会返工。

**验收**
- `/admin/` 能用 GitHub 账号登录；
- 新建一篇文章 → 提交 → CI 构建 → 线上 `/blog/<slug>/` 出现（**本轮不 push 时只能验证到 commit 与构建通过，push 由本人决定**）；
- `npm run build` exit 0；README 中提到 `/admin/` 时该路由**必须已经存在**（RD1 门禁会核）。

---

### M4 · 检索与出口（对应 G-A / G-B）

- 站内搜索（静态索引方案，如 pagefind；构建期产出索引、运行时零后端）；
- 内容 API（`/api/posts.json` 等 JSON 出口，给未来的前端/外部工具用）；
- `feed.xml` 增加博客条目后的订阅完整性自检；`sitemap.xml` 覆盖新路由。

**验收**：搜索可用且不拖慢首屏；JSON 出口可被 `curl` 取到并被机器校验；feed/sitemap 无遗漏。

---

### M5 · 收尾（对应 G-A）

- 暗色模式全站覆盖一致性；打印主题覆盖新页面；移动端断点复核；
- 首页首屏信息密度与「回访理由」（更新了什么/最新文章/最新论文）复查。

---

## 3. 硬约束（每轮都必须守住）

1. **不 push**。只 commit 到本地 `main`；线上部署由本人决定。
2. **不引入新的外部服务、密钥、账号**；不加未经核实的外部链接（找不到真实 URL 宁可不加）。
3. **站内文字一律英文**（`check-lang` 强制，2026-10-20 本人确认保持全英文）；中文只在 commit message 与日志里。
4. **内容不得编造**：不得虚构数据、结论、引用或实验结果；写不出来就写「本轮无内容可写」。
5. **保持零第三方前端运行时依赖**；动效只用原生 API。
6. **以现有布局为基准做修复与增强，不重做版式**（2026-10-20 本人确认：「我现在这个布局是很优秀的」）：
   不改首页 / 列表页 / 论文页的版式与信息结构；**新页面**（文章详情、搜索、后台）一律复用现有设计系统
   （`src/assets/css/tokens.css` + `components/`），不引入新的视觉语言。
   动效是**叠加**在现有布局上的，不是重排；动效要克制，判据是好看而不是动效多。
   **优先修既有缺陷**（见 M0 缺陷清单），不要用「加功能」代替「修问题」。
7. **不破坏既有门禁**：每次改动后 `npm run build` 必须 exit 0；门禁红了先定位红因再改，
   不许为了让门禁变绿而放宽判据。
8. **待本人拍板的事写进 `docs/IMPROVEMENT-LOG.md` 中央台账**（编号连续），不要自己拍板。
9. **只提交本轮自己改的文件**，不要 `git add -A`（共享工作树里有并发场次在途的改动，
   一次 `git add -A` 会把它们卷进来）。
10. 文件删除用 `mavis-trash`，不用 `rm`。
11. 每轮只推进 **1 个** 改进点，做完即止；不要一轮铺开半个里程碑。

---

## 4. 与既有文档的分工

| 文档 | 管什么 |
|---|---|
| `docs/ROADMAP.md`（本文件） | **目标与里程碑**（改什么、按什么顺序） |
| `docs/IMPROVEMENT-LOG.md` | 每一轮实际做了什么、验证结果、中央「待拍板」台账 |
| `docs/design-system.md` | 颜色 token / 字号阶梯 / 间距 / 圆角阴影 |
| `docs/papers-interaction.md` | 论文精读页的交互规范 |
| `docs/information-architecture.md` | 信息架构规划稿（含尚未实现的 `/tags/` `/search/` `/cv/`） |
| `docs/DEPLOY.md` | 部署与故障排查 |
| `docs/acceptance-report.md`、`docs/lighthouse*`、`docs/fa-data/` | 历史实测快照，不随代码更新 |

---

## 5. 起步建议（下一轮就从这里接）

**M1-1：修封面裂图**（小、稳、立刻见效）
把 `src/content/blog/*/index.md` 的 `cover:` 改成真实存在的 `cover.svg`，
确认图片资产门禁与 `check:image` 通过后，再评估打开 `src/blog.njk` 的 `useCovers`。
若 M1 尚未产出任何文章，则先做「站内长文写作规范」那一条。
