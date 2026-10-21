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

**进度（2026-10-21 07:40 实测）**
- 缺陷清单已到 **D47**（D1 / D4 / D11 / D13 / D14 / D15 / D16 / D17 / D18 / D19 / D20 / D21 / D22 / D23 / D24 / D25 / D27 / D28 / D29 / D30 / D31 / D33 / D34 / D35 / D36 / D37 / D38 / D39 / D40 / D41 / D42 / D43 / D44 / D45 / D46 / D47 已修；D2 / D3 / D5 / D6 / D9 / D10 / D12 / D26 / D32 待修；D7 / D8 不修）。
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

- **D31**（本轮修的是缺陷 **D33**）：这一轮还是**内容事实缺陷**那一支，换成**图上那
  些统计量与图上那些年度值之间对不对得上**——
  首页降水图上的十年均值、趋势斜率、Mann-Kendall p 值、summary 里的派生量，
  在 `extremePrecip.json` 里都是**离线算好存进去**的，与同一文件里的 `panels[].values`
  **没有任何校验关系**；而 HC1–HC8 里**没有一条**核「派生量是否真由年度值推出」
  （HC2 只核「产物里的 data-chart 与 JSON 逐字一致」、HC7 只核出处、HC8 只核区域）⇒
  改一个年度值（补 2026、修正某个数），**图会动**，而「What it shows.」与 `<desc>` 里的
  0.556 / p=0.0401 / p=0.6099 / 25.4% / 32.5% / 63.91 / 52.4-55.8 **全部原地不动**，
  `npm run build` 仍全绿；其中 p 与 0.05 的关系直接决定站内那两句显著性断言
  （panel A 的「rose … over the full record」、panel B 的「its full-record trend is
  not significant」）成不成立 ⇒ **结论会静默翻转**。
  ⚠️ **为什么 build 与既有门禁全绿**：这条缺陷**不产生任何错误值** ——
  页面照常渲染、派生量彼此自洽、链接照常可点，缺的只是「派生量与年度值之间那条关系」
  ⇒ 任何「值对不对」型判据都抓不到它。
  ⚠️ **本轮还查出一条更硬的**：**panel B 的 p 值当下就无法复现** —— 发布值只保留 3 位小数，
  四舍五入把 1961 与 2004 两个**不同**的全精度值压成同一个 52.605，造出一条**人造并列**；
  不登记它的解算方向，S 有 263 / 264 / 265 三个候选（p = 0.1455 / 0.1440 / 0.1425），
  谁也说不准站内那个 0.1425 是怎么来的。
  2026-10-20 21:30–22:10 场次按此修，分三层：
  ① **数据层**：`extremePrecip.json` 加顶层 `precision` 块 —— 写明 `values` 是全精度序列的
     3 位小数**发布副本**、统计量在全精度上算，并把那条人造并列登记为
     `roundedTies`（`years` = 1961 / 2004，`roundedValue` = 52.605，
     `resolvedOrder` = "ascending" = 早的一年更小）。
  ② **门禁层**：新增判据 **HC9**（挂在既有 `check:home-chart`，**不新开 npm script**
     ⇒ README 命令表不用改）：
     HC9-1 每个十年均值 = 由该十年的年度值重算；HC9-2 趋势斜率 = 由全部年度值重算的
     最小二乘斜率；HC9-3 Mann-Kendall p 值 = 由年度值重算 S → 双侧正态近似 p，
     与发布值 `toFixed(4)` **逐字相等**，且「发布值里的并列对集合」必须与
     「登记的并列对集合」**完全一致**（有并列没登记 ⇒ 判红）；
     HC9-4 summary 的派生量 = 由年度值重算。
     「至 2019」的截止年**由数据推导**（最后一个十年的起始年 − 1），不硬编码。
     `summary.meanAnnualMm` / `r95pAmount1960sMm` / `r95pAmountRecentMm`
     **不可由年度值推出**（缺年度总量）⇒ 显式跳过并在通过文案里写明。
  ③ **自测层**：`scripts/test-home-chart.cjs` 扩到 **25 档** M0–M24，新增 M19–M24 六档：
     改一个年度值 / 改一个十年均值 / 改一个趋势斜率 / 改一个 p 值 / 改一个 summary 派生量 /
     清空并列登记 ⇒ 各自判红且红因点名。
  ⚠️ **本轮修掉了判据自身的一个自指坑**（自测当场抓出来的）：容差若按「被检查值自己的
  小数位」来算，把 `0.556` 改成 `0.6` 会把容差从 ±0.0005 放宽到 ±0.05 ⇒ **缺陷被容差
  吞掉**（M21 判红暴露）⇒ 发布精度改为**门禁里的常量表** `STAT_DECIMALS`，
  真源与门禁都不能随手改宽。
  负对照：真源与产物**一起**把 1960 年的 23.495 改成 24.495 ⇒ exit 1 且**只有 HC9 红**
  （HC2 保持绿），红因点名「Mann-Kendall mkP 发布 0.0401，由年度值重算得 0.0495」——
  **这正是原缺陷形态**（产物与真源仍然自洽，派生量却不再由年度值推出）。
  统计口径经 **scipy 1.17.1**（`kendalltau`）独立复核：panel A 0.040058 / 0.609887、
  panel B 0.142502 / 0.908602 ⇒ 与站内发布的 0.0401 / 0.6099 / 0.1425 / 0.9086
  **逐位吻合** ⇒ **站内科学结论一个字不动**（本轮修的是「可复现性」，不是「数字」）。
  ⚠️ **边界**：HC9 守的是「派生量与年度值自洽」；它**守不了**「年度值本身对不对」——
  有人把整条序列换成一个自洽但错误的版本（连同所有派生量一起重算），它照样绿 ⇒
  年度值的正确性仍靠人工核 + 外部登记核对（DataCite / 出版商页面）；
  并列解算的**方向**（哪一年更大）是人写的声明，门禁只能靠「发布 p 值必须与该声明下的
  重算值一致」来交叉验证，声明与发布值一起改错时仍然自洽。
  ⚠️ 本轮**没有新增待拍板项**：清单里剩下的「待修」仍全绑在既有拍板项上
  （D2 / D3 ↔ 40、D9 ↔ 41、D10 ↔ 42、D12 ↔ 43、D5 ↔ 选题主线、D26 视觉取舍、
  D6 ↔ push 时机 = 7 + 发布仓 = 49），D32 ↔ 49。

- **D32**（本轮修的是缺陷 **D34**）：这一轮离开「内容事实」那一支，换成**时间戳的语义**——
  sitemap 的 `<lastmod>` 说的是「这个 URL 的**内容**最后一次改变的时间」，
  而实现取的是「该页**源文件自身**的最后提交时间」⇒ 页面内容由别的文件提供时
  （首页的图表数据在 `src/_data/extremePrecip.json`、版式在
  `src/_includes/layouts/base.njk`、about 页的散文在 `src/content/about.md`），
  那些文件一改，页面内容就变了，lastmod 却原地不动。
  实测（2026-10-20 本机，git 与产物双侧核对；下文 ISO 时间为 UTC）：首页 `<lastmod>` = `2026-10-21T03:07:24Z`
  （= `src/index.njk` 自己），而它渲染的 `src/_data/extremePrecip.json` 在
  `2026-10-21T05:05:04Z`（D31 那次提交）才改过 ⇒ sitemap 谎称「首页自 03:07 起没变过」。
  ⚠️ **为什么 build 与既有门禁全绿**：verify-site 规则 18 的 D / E 与 check-jsonld 的 J11
  恰恰要求 lastmod **精确等于「自己源文件」的时间** ⇒ 这是一条**「门禁越严、错得越牢」**
  的缺陷：门禁不是漏看了，是**把错语义钉死了**。
  2026-10-20 22:10–22:50 场次按此修，分三层：
  ① **共享库层**：新建 `scripts/lib/page-deps.cjs`，定义「页面依赖闭包」的六条规则
     （页面自身源文件 + 目录数据文件 + layout 链 + 模板 include / extends / import / from
     的**字面量**路径 + 闭包内模板里**整词**出现的全局数据变量名 + 闭包内 JS / CJS 的
     **相对** `require()`），并给出「闭包里最晚的提交时间」；
     `addGlobalData` 注入的变量来源用 `GLOBAL_DATA_DEPS` **显式登记**（`buildYear` /
     `aboutHtml`），登记不全 ⇒ 少报 ⇒ 门禁 LM5 判红。
  ② **口径统一层**：构建侧（`lastCommitTime` filter）、`scripts/verify-site.cjs`、
     `scripts/check-jsonld.cjs` 三处**调同一个函数**；`check-jsonld.cjs` 里自抄的
     `gitTop` / `gitIsShallow` / `gitCommitTime` 三个函数**删掉**（抄两份会漂移、
     漂移会静默漏报）；`repoRelPath` 的基准也从 git root **统一到仓库根**
     （今天两者相等是巧合，不是约定）。
  ③ **门禁层**：新增 `scripts/check-page-deps.cjs`（判据 **LM1–LM5**）与自测
     `scripts/test-page-deps.cjs`（**LT0–LT7** 共 8 档）。
     ⚠️ **为什么还要一道新门禁**：构建侧与那两处门禁**共用同一个函数** ⇒ 闭包算法一旦退化，
     三处会一致地给出同一个错值，全都判绿 ⇒ 新门禁提供的是**不依赖那个函数算出的时间戳**
     的独立证据：LM1 闭包非退化（不许退化成「只看自己」）、LM2 闭包可信（不许引用不存在的
     文件；模板引用必须是字面量）、LM3 覆盖度自证（sitemap 条数与产物 HTML 页数一致、
     每条 `<url>` 都有唯一的 source 标注）、LM4 内容级交叉验证（数据文件的**特征串**出现在
     某页产物里 ⇒ 该文件必须在该页闭包里）、LM5 全局数据登记齐全。
  ⚠️ **代价，明说不藏着**：共享同一套版式的页面**会拿到同一个时间戳**
  （`/about/` `/blog/` `/papers/` 与论文页都依赖 `layouts/base.njk`）⇒ 这是**正确**的
  （那几个页面确实同时变了）；老注释里「每页 lastmod 各不相同」的附带好处**已不再成立**，
  也不再值得追求 —— 少报才是缺陷（sitemap 谎称内容没变），多报只多一次重抓。
  ⚠️ **边界**：闭包**不计入** CSS / JS 等静态资源，也**不计入** `eleventy.config.js` 本身；
  闭包扫描只认**字面量**路径（写成变量就判红）；`addGlobalData` 的名字必须字面量登记。
  负对照（LT7）：把门禁副本的三条判据调到最松后重跑「闭包退化」与「数据变量扫不出」
  两档注入 ⇒ 门禁**判绿** ⇒ 证明那两档的红确实来自 LM1 / LM4 本身。
  ⚠️ 本轮**没有新增待拍板项**：清单里剩下的「待修」仍全绑在既有拍板项上
  （D2 / D3 ↔ 40、D9 ↔ 41、D10 ↔ 42、D12 ↔ 43、D5 ↔ 选题主线、D26 视觉取舍、
  D6 ↔ push 时机 = 7 + 发布仓 = 49），D32 ↔ 49。

- **D33**（本轮修的是缺陷 **D35**）：这一轮离开「时间戳语义」那一支，换成**硬约束与门禁的关系**——
  「站内文字一律英文」这条硬约束，在 robots.txt 上**不但没人守，还被门禁反向锁死**：
  `scripts/verify-site.cjs` 的门禁 17 与门禁 20 都拿产物里那行**中文**注释
  （`# 生成时间：…`）当锚点 ⇒ 想让门禁保持绿，产物里就必须留中文；
  一按硬约束把注释英文化，两条门禁立刻红，而红因「找不到『生成时间』这一行」
  与「我把注释改成英文了」**毫无字面关联** ⇒ 这是**最坏的门禁形态**：
  门禁越严，照硬约束做的代价越大。
  2026-10-20 23:10–23:45 场次按此修，分四层：
  ① **产物层**：`src/robots.njk` 产物里那些普通 `#` 注释行**全部英文化**，
     构建时刻那一行改成**结构化机器可读 key**（`# generated-at: <ISO>`）——
     机器认的是**结构**（`key: value` 的形状），不是**措辞**（某个中文词）。
  ② **门禁锚点层**：门禁 17 / 20 的锚点从 `/^#\s*生成时间[：:]\s*(.+?)\s*$/m`
     换成 `/^#\s*generated-at:\s*(.+?)\s*$/m` ⇒ 锚在结构上，不锚在文案上；
     措辞以后再改（哪怕改成另一种语言）也不会把门禁打红。
  ③ **豁免层**：`scripts/check-lang.cjs` 原本把 `src/robots.njk` **整文件豁免**
     （理由就是「门禁 17 / 20 拿其中的中文标记当锚点」）⇒ 豁免**删掉**。
     ⚠️ 豁免这条线本轮还顺带查了另一处：**产物层的非 HTML 对外出口完全无人扫语言**
     —— `check-lang.cjs` 的产物层只扫 `.html`，而 `_site` 顶层 5 个对外出口
     （`feed.xml` / `publications.bib` / `publications.ris` / `robots.txt` / `sitemap.xml`）
     **无一被扫** ⇒ 那条硬约束在产物层只覆盖了 HTML 一半。
  ④ **新门禁层**：新增 `scripts/check-site-language.cjs`（判据 **TX1–TX4**）与自测
     `scripts/test-site-language.cjs`（**TX0–TX6** 共 7 档）。
     TX1 扫 `_site` 顶层**所有非 `.html` 文件**（枚举**不硬编码文件名** ⇒ 以后新增出口自动纳入）；
     TX2 独立复算 robots 的 `# generated-at:` 与 feed 的 `<lastBuildDate>` 是否同一瞬间；
     TX3 核对语言门禁的**两个**豁免清单（目录豁免 + 单文件豁免）**每一条都真的豁免到了
     会渲染的中文**（判据 = 剥掉注释后仍含 CJK：中文只在注释里 ⇒ 判红，那是**暗门**；
     豁免项下已无任何中文 ⇒ 只出 note 不判红，免得「把中文身份字段改成英文」这种好事把 build 打红）；
     TX4 覆盖度自证（扫到的出口数 ≥ 5、豁免条目数 ≥ 1）。
  ⚠️ **为什么 TX2 要「独立复算」**：它与门禁 17 / 20 若共用同一个解析函数，
  那个函数一旦坏掉，两边会一致地给出同一个错值、**全都判绿**
  ⇒ 独立复算才提供「构建时刻说的是真话」这条证据（沿用 D34 的 LM4 思路）。
  ⚠️ **一条原则，本轮顺手定下来**：**站内（产物）必须全英文；仓库内文档（`docs/`）可以是中文** ——
  `check-decision-ids` / `check-mount-contract` 里那些中文锚点是**合理的**
  （仓库内文档本来就是中文），不属于本缺陷 ⇒ 查的时候得先分清「合理中文锚点」与「缺陷锚点」，
  否则会把好门禁当成坏门禁去改。
  负对照：TX5（卸掉 CJK 判定）⇒ TX1 的注入转绿；TX6（卸掉「剥注释后再判」）⇒ TX3 的注入转绿
  ⇒ 证明那两档的红确实来自 TX1 / TX3 本身。
  ⚠️ 本轮**没有新增待拍板项**：清单里剩下的「待修」仍全绑在既有拍板项上
  （D2 / D3 ↔ 40、D9 ↔ 41、D10 ↔ 42、D12 ↔ 43、D5 ↔ 选题主线、D26 视觉取舍、
  D6 ↔ push 时机 = 7 + 发布仓 = 49），D32 ↔ 49。

- **D34**（本轮修的是缺陷 **D36**）：这一轮还是**硬约束与门禁的关系**那一支，换成**硬约束的覆盖面**——
  「站内文字一律英文」在**可见文本**上其实是达成的，但在**块级内容**上是零覆盖：
  `scripts/check-lang.cjs` 的 `strip()` 把产物（以及模板）里的 `<script>…</script>` 与
  `<style>…</style>` **连同内容一起涂白**；而本站的 CSS / JS 恰恰是**字面内联在模板里**的
  （`base.njk` 的内联 CSS 与内联 JS、`paper.njk` 的内联 CSS 与内联 JS、
  `partials/extreme-precip.njk` 的内联 JS、`about.njk` 的内联 CSS），
  **不在** `src/assets/` 下的 `.css` / `.js` 文件里 ⇒ 内联内容在**源码层与产物层双双失守**。
  JSON-LD 更彻底：它是**构建时现场拼装**的（模板拼串 + `src/_data/site.js` 的字段），
  源码层连「文件里有没有中文」都无从谈起，而 `src/_data` 整个目录又被 `check-lang` 豁免。
  2026-10-20 23:45–00:05 场次按此修，分两层：
  ① **覆盖面层**：新增 `scripts/check-block-language.cjs`（判据 **BL1–BL6**）与自测
     `scripts/test-block-language.cjs`（**12 档**）。
     BL1 逐个 `JSON.parse` 产物里的 `ld+json` 块，**坏了判红、不静默跳过**
     （静默跳过会让「块坏了」伪装成「没找到内容」）；
     BL2 逐块递归遍历**字符串值与键名**，命中有中日韩字符判红；
     BL3 豁免**字段级**（`@type` + 键名）且必须「用得出」——
     用上了记 note 说明用在哪；一次都没用上（该字段已英文化）⇒ **只出 note 不判红**
     （免得「把中文身份字段改成英文」这种好事把 build 打红）；
     BL4 内联 `<script>`（非 ld+json、无 src）里的中文判红 —— 那是**可执行文本**
     （`document.title`、aria-label 覆写都写在这儿，而且它不出现在可见文字里，最容易漏）；
     BL5 内联 `<style>` **剥掉 CSS 注释后**的中文判红 —— 注释不渲染，不算站内文字；
     BL6 覆盖度自证（四项下限都不得为 0）。
  ② **既有门禁层**：`scripts/check-lang.cjs` **一个字没改** ——
     它管**源码层**与产物的**可见文本**，新门禁管**被它涂白的那几块**，两边不重叠
     （与 `check-jsonld.cjs` 的 J1–J11 管「结构化数据的存在性与一致性」、
     `check-site-language.cjs` 的 TX1–TX4 管「非 HTML 对外出口」同理）。
  ⚠️ **本轮实测的一个数**：`_site/index.html` 的 2006 个中日韩字符里，**可见文本 0 个**，
     其余 2003 个全部落在被涂白的块里（内联 `<style>` 721 + 1282 = CSS 注释；
     JSON-LD 3 = `Person` 节点 `alternateName` 的「吕亦航」）⇒
     **这条硬约束此前是「靠人眼守着的」**：可见层守住了，块级层根本没被看。
  ⚠️ **豁免为什么留了一条**：唯一的字段级豁免是 `Person.alternateName` ——
     schema.org 里 `alternateName` 本就是为**跨语言实体消歧**准备的字段
     （本人姓名的中文写法），`src/about.njk` 的注释已写明「中文名不进页面」。
     留它是因为它**确实用得上**（现用 7 处）；一旦它被改成英文，门禁会出
     「这条豁免可以删了」的提示而**不会**判红。
  负对照：BL6（卸掉 CJK 判定）⇒ BL2 的注入转绿；
  BL7（卸掉「剥 CSS 注释」）⇒ BL5a 的注入转红
  ⇒ 证明那两档的红确实来自 BL2 / BL5 本身。
  ⚠️ 本轮**没有新增待拍板项**：清单里剩下的「待修」仍全绑在既有拍板项上
  （D2 / D3 ↔ 40、D9 ↔ 41、D10 ↔ 42、D12 ↔ 43、D5 ↔ 选题主线、D26 视觉取舍、
  D6 ↔ push 时机 = 7 + 发布仓 = 49），D32 ↔ 49。
- **D35**（本轮修的是缺陷 **D37**）：这一轮还是**硬约束与门禁的关系**那一支的延续，
  换成**「发给访客的字节」**这一侧——
  产物里的 CSS **有一半是注释字节**，而其中**内联的那一部分正落在每页都要重下的关键路径上**：
  ① **外链 CSS**（`_site/assets/css/**`，16 个文件、256,627 B）里 **121,525 B 是注释（47%）**——
     独立文件、有缓存，但首次访问仍要下载；
  ② **内联 `<style>`**（6 个页面、14 个块、191,176 B）里 **84,922 B 是注释（44%）**——
     它在 HTML 里，**不可缓存、每次翻页都要重下**；而内联 CSS 存在的**全部理由**
     就是把关键样式塞进 HTML 省一次往返（`base.njk` 的注释原话：「Critical CSS：
     tokens + base 内联（first paint 即用，省一次 round trip）」），
     注释让这项优化在**不可缓存的关键路径上**多背了 84,922 B 浏览器一个字节都不会用的东西；
  ③ 源码里的注释写得极密（记录取舍理由、实测数字、踩过的坑）⇒ 那是**维护者的资产**，
     但**一个字都不该跟着产物发给访客**；
  ④ 仓内**没有任何**体积 / 字节预算门禁，也**没有**门禁比对「产物 CSS == 源 CSS」
     ⇒ 这类字节流失**无人看守**。
  2026-10-21 00:05–01:05 场次按此修，**源码层一个字不动**：
  ① **产物层**剥掉 CSS 注释：新增 `scripts/lib/css-comments.cjs`（字符级扫描器，
     **字符串字面量整段原样保留**——`content:` 的值里写着注释文本是合法 CSS，
     剥掉会改渲染；**保留注释里的换行**，产物行号与源码基本对齐），
     在 `eleventy.after` 钩子里对产物统一剥一次；
     **落点选 `eleventy.after` 而不是 `inlineCss` shortcode**：shortcode 只覆盖 3 份源，
     漏掉 `src/about.njk` 手写的那块 `<style>`；after 钩子一处覆盖两条来源 + 外链 CSS。
     ⚠️ **不 minify**：只剥注释、**不折叠空白** —— minify 的风险更高（`calc()`、字符串字面量），
     而「剥注释」是可证**语义零变化**的最小改动；
  ② **门禁层**新增 `scripts/check-css-comment-weight.cjs`（判据 **CW1–CW4**）：
     产物里的内联 `<style>`（CW1）与外链 CSS（CW2）都**不得含 CSS 注释**；
     剥掉注释后**仍须有内容**（CW3，防「清空内联 CSS」骗过前两条）；
     覆盖度自证（CW4：内联块数 / 外链 CSS 数 / 页面数下限，且**每个 HTML 页面都得有内联块**）。
     ⚠️ 门禁**自带**词法扫描器、**不 import** 被检查方的剥除器
     （用被检查方自己的函数判自己，判据就没有独立性）⇒ 两套实现互为交叉验证；
  ③ **自测层**新增 `scripts/test-css-comment-weight.cjs`（**12 档** CW0–CW8）。
  ⚠️ **本轮实测的数**：外链 CSS 256,627 → 135,102 B（**省 121,525 B，47%**）；
     6 个页面合计 352,112 → 267,190 B（**省 84,922 B，24%**），内联块 191,176 → 106,254 B（**44%**）。
  ⚠️ **本轮踩到的坑（已在代码里留注释）**：
  ① **钩子顺序** —— 在 exFAT 目标盘上写一个文件就会在旁边长出 `._<name>` 资源叉；
     剥注释那一步写回 6 个 HTML + 16 个 CSS，当场生成 **22 个** `._*`，`check:artifact` 立刻判红
     ⇒ `eleventy.after` 里**所有写盘动作必须先做完、最后统一清一次**资源叉；
  ② **块注释里写了字面 `*/`**（在 JSDoc 里举例写了 `content:"/* c */"`）⇒ 提前闭合注释
     ⇒ `SyntaxError` ⇒ 块注释内绝不能出现 `*/`，改用散文描述
     （**字符串字面量里出现 `*/` 是安全的**）。
  负对照：CW5（卸掉 CW1 判定）⇒ 注入转绿；
  CW6（卸掉「字符串字面量保护」）⇒ 注入转红、且未注入时真产物仍绿
  ⇒ 证明那两档的红确实来自 CW1 与字符串保护本身。
  ⚠️ 本轮**没有新增待拍板项**：只动产物层、源码层一个字没改，不涉及取舍；
  清单里剩下的「待修」仍全绑在既有拍板项上
  （D2 / D3 ↔ 40、D9 ↔ 41、D10 ↔ 42、D12 ↔ 43、D5 ↔ 选题主线、D26 视觉取舍、
  D6 ↔ push 时机 = 7 + 发布仓 = 49），D32 ↔ 49。
- **D36**（本轮修的是缺陷 **D38**）：还是**硬约束与门禁的关系**那一支，
  换成**「产物与源之间有没有一致性判据」**这一侧——
  D35 把「产物里没有注释字节」守住了，但那是**症状**；
  「产物 CSS 应当就是源 CSS 剥掉注释后的结果」是**结果**，**无人看守**：
  ① **实测**：往产物 `pages.css` 注入 39 B「来历不明」的规则
     （`.injected-from-nowhere { color: red; }`），
     `check-css-comment-weight` / `check-css-braces` / `check-dead-css` /
     `check-wrapping` **四道门禁全绿** —— 产物总字节从 135,102 变成 135,142，
     **没有任何一道门禁报告**；
  ② 更硬的一条：`components.css` 是 `eleventy.after` 钩子把 7 个 partial
     **直接 concat** 出来的（**不剥注释**），它那 **19,373 B** 注释之所以被剥掉，
     **靠的是剥除钩子恰好排在写盘之后**（钩子顺序的**巧合**），不是构造保证 ——
     顺序一改注释就回来，而门禁只是「看到注释才报」；
  ③ D35 留下的自测档只覆盖**内联块**那一半（CW7），**外链 CSS 连自测都没有**。
  2026-10-21 00:40–01:10 场次按此修，**只补看护、不动构造层**：
  ① 门禁 `scripts/check-css-comment-weight.cjs` 加三条判据 **CQ1–CQ3**：
     **CQ1** 一对一文件（`_site/assets/css/**` 与 `src/assets/css/**` 同名一一对应，
     **15 个**）剥掉注释后，产物与源必须**逐字相等**；
     **CQ2** 拼接产物 `components.css`：`components/index.css` 声明的每个 partial，
     其剥注释后的内容必须**逐字出现**在产物里且顺序与声明一致，
     剥掉这些内容后剩余部分**不得含左花括号**（⇒ 不得有源里没有的规则块）；
     **CQ3** 覆盖度自证：产物与源的 CSS 文件集必须一一对应（`components.css` 除外）、
     `components.css` 必须存在、磁盘上的 partial 与 `index.css` 声明的必须一致；
  ② ⚠️ **判据形状的两个坑（实测）**：
     **不用手写 CSS 规则解析器** —— `@media` 内部的规则会被吞进外层选择器
     （`components.css` 282 条规则被聚成几条大块、误报 235 条）
     ⇒ 改用「逐字相等 + 逐字包含」两种最朴素的比对；
     **取片段的口径必须与构建一致** —— 构建拼的是「partial 源文本 trim 之后」
     再整体剥注释，门禁取片段也必须按同一口径（先 trim 后剥），
     否则片段对不上（两种口径实测差 88 B）；
  ③ ⚠️ 门禁仍**自带**词法扫描器、**不 import** 被检查方的剥除器
     ⇒ 与 `scripts/lib/css-comments.cjs` 构成两套独立实现、互为交叉验证；
     三个判据开关 `CQ1_ON` / `CQ2_ON` / `CQ3_ON` **只为自测的负对照**存在，默认恒为 true；
  ④ **自测层** `scripts/test-css-comment-weight.cjs` 加 **7 档正向注入 + 3 档负对照**
     （CQ1a 产物末尾塞外来规则 / CQ1b 就地改坏一条声明 / CQ2a 删掉一个 partial /
     CQ2b 拼接产物里塞外来规则 / CQ3a 源里多一个 CSS 文件 / CQ3b 产物里少一个 CSS 文件 /
     CQ3c 源里多一个未声明的 partial；CQ1n / CQ2n / CQ3n 分别卸掉对应判据）。
     负对照：CQ1n / CQ2n / CQ3n 各自把对应判据置 false ⇒ 对应注入档**转绿**
     ⇒ 证明那三档的红确实来自 CQ1 / CQ2 / CQ3 本身。
  ⚠️ **原缺陷形态的复现**：同样的 39 B 注入现在被 **CQ1** 抓住（修前是四道门禁全绿）。
  ⚠️ 本轮**没有新增待拍板项**：只补看护、不改构造层、不涉及取舍；
  清单里剩下的「待修」仍全绑在既有拍板项上
  （D2 / D3 ↔ 40、D9 ↔ 41、D10 ↔ 42、D12 ↔ 43、D5 ↔ 选题主线、D26 视觉取舍、
  D6 ↔ push 时机 = 7 + 发布仓 = 49），D32 ↔ 49。
- **D37**（本轮修的是缺陷 **D39**）：还是**硬约束与门禁的关系**那一支，
  换成**「这条硬约束本身有没有门禁守着」**这一侧——
  D35 把「产物里没有注释字节」守住了、D36 把「产物 == 源」守住了，
  但**更上面一层**的那条硬约束还悬着：
  「零运行时依赖」写在本文第 63–64 行（性能 + 可控 + 无供应链风险），
  **却没有任何一道门禁在看它**：
  ① **实测**：全仓 36 道门禁逐条看过 —— 判「外域 `<script src>`」的 **0 条**、
     判「第三方 CSS」的 **0 条**、判「运行时向外部发请求」的 **0 条**；
     `scripts/verify-site.cjs` 里那个 `EXTERNAL` 正则是**用来解析相对链接**的
     （判「链接指向的站内页面存不存在」），**不判「资源从哪来」**；
  ② 后果：往 `base.njk` 里加一行
     `<script src="https://cdn.example.com/analytics.js"></script>`，
     **`npm run build` 仍然全绿** —— CDN 的脚本进了产物、访客的浏览器去执行它，
     本站既没声明也没报告 ⇒ 供应链风险从「不存在」变成「已引入」，
     而**没有任何一道门禁说过一个字**；
  ③ 产物现状**恰好满足**这条约束（外域 `script src` **0 个**、外域
     `img`/`iframe`/`video`/`audio`/`track` 等 **0 个**、外域 CSS 的 `@import` 与
     `url()` **0 个**、站内 JS 硬编码外域请求目标 **0 个**；唯一的外域是
     **Google Fonts** 的 2 个 stylesheet + 2 个 preload + 2 个 preconnect ——
     那是 `base.njk` 里**有意**的 webfont 设计（不是前端库/框架），
     `tokens.css` 还为此备了本地 fallback）
     ⇒ 这是**看护缺口**、不是现存违规 ⇒ 修法是**加门禁**，不是改构造层。
  2026-10-21 01:20–01:40 场次按此修，**只补看护、站内一个字不改**：
  ① 门禁 `scripts/check-third-party.cjs` 加判据 **TD1–TD5**：
     **TD1** HTML 的子资源引用（`script` 的 `src`；`img`/`source`/`video`/
     `audio`/`track`/`iframe`/`embed`/`object`/`input` 的资源属性，含 `srcset`）
     指向外域 ⇒ 判红；
     **TD2** `<link>` 的资源提示（`stylesheet`/`preload`/`modulepreload`/
     `prefetch`/`preconnect`/`dns-prefetch`/`icon`）指向外域 ⇒ 判红；
     **TD3** 产物 CSS（外链 `.css` + 内联 `<style>` 块）的 `@import` 与 `url()`
     指向外域 ⇒ 判红；
     **TD4** 站内 JS（外链 `.js` + 内联 `<script>` 块）的**硬编码**外域请求目标
     （`fetch`/`importScripts`/`Worker`/`EventSource`/`WebSocket`/`sendBeacon`/
     `XMLHttpRequest.open`）与外域 `import` 说明符 ⇒ 判红；
     **TD5** 覆盖度自证（产物页面数 / 外链 CSS 数 / 外链 JS 数 / 本地 `script src` 数 /
     本地 stylesheet `link` 数都不得为 0 ⇒ 枚举器坏了门禁会一直绿着）；
  ② 白名单是**登记式**且按**（域，上下文）**粒度：当前只登记 Google Fonts 两处；
     **用不上的条目只出提示、不判红**（门禁不能反过来惩罚「把外部依赖撤掉」这种改进）；
  ③ 门禁**自带** HTML 标签扫描器 / CSS 引用提取器 / JS 注释剥离器，
     **不 import** 被检查方的任何代码；四个判据开关 `TD1_ON`–`TD4_ON`
     **只为自测的负对照**存在，默认恒为 true；
  ④ 自测 `scripts/test-third-party.cjs`（**21 档**注入矩阵，**接在 build 链**）：
     12 档外域注入 + 2 档覆盖度自证 + 4 档负对照 + 2 档白名单专项；
  ⑤ ⚠️ **本轮新增了 2 个 npm script**（D36 那轮刻意没加，为的是不牵动 RD3 / GW1 / GW4；
     本轮这条约束独立成一道门禁、职责不含在任何既有门禁里 ⇒ 独立文件 + 独立 script 更清楚）
     ⇒ 同步 `package.json` 的 build 链与 `README.md` 命令表（RD3），
     `check-gates-wired` 复核 GW1 / GW4 全过；
  ⑥ ⚠️ **门禁当场抓到我自己的疏漏**：白名单第一版只给 `fonts.googleapis.com`
     登记了 `link:stylesheet` 与 `link:preload`，**漏了 `link:preconnect`**
     （`base.njk` 里对它也有 preconnect）⇒ 门禁第一次跑就红了 6 条
     ⇒ 登记补全后绿。（这正是「（域，上下文）」粒度该有的行为：
     登记了某个域，不等于它的任何用法都放行。）
  ⚠️ **原缺陷形态的复现**：注入外域 `<script src>` 现在被 **TD1** 抓住
     （修前是全链门禁全绿）。
  ⚠️ 本轮**没有新增待拍板项**：只补看护、不改构造层、不涉及取舍；
  清单里剩下的「待修」仍全绑在既有拍板项上
  （D2 / D3 ↔ 40、D9 ↔ 41、D10 ↔ 42、D12 ↔ 43、D5 ↔ 选题主线、D26 视觉取舍、
  D6 ↔ push 时机 = 7 + 发布仓 = 49），D32 ↔ 49。
- **D38**（本轮修的是缺陷 **D40**）：还是**硬约束与门禁的关系**那一支，
  但这一轮撞上的不是「约束没人守」，而是**「看守和契约对着干」**——
  博客封面的这条内容路径**从来没有被任何一道门禁真正跑过**
  （站内至今没有文章），而**契约与门禁给出的说法是相反的**：
  ① **实测（照契约写就红）**：`docs/blog-writing-guide.md` §2.3 的契约让作者用
     **真 SVG 文本**当封面，`eleventy.config.js` 的 `copyCovers()` 也确实复制
     `cover.{svg,png,jpg,jpeg,webp}` ⇒ 契约推荐的形态**是能进产物的**；
     可把一张真 SVG 封面塞进产物后跑图片门禁 ⇒ **IA5 + IA6 双红**
     （红因是「应验 6 张图，只验出 5 张」）
     ⇒ **照本站自己写的契约写封面，`npm run build` 必红**；
  ② **实测（契约禁止的形态没人守）**：反过来把 `cover: cover.png` 配上一份
     **内容其实是 SVG 文本**的文件 —— 全链门禁 **exit 0**：
     **没有任何一条判据去看文件里到底是什么字节**，扩展名与真实格式对不上，
     门禁完全看不见（服务器按扩展名发 Content-Type、浏览器拒绝解码 ⇒ 裂图）；
  ③ **实测（文件名骗人无人守）**：front matter 门禁的 F9 只查
     「`cover` 这个键在不在、指向的文件存不存在」，**文件名可以随便起**
     （`banner.svg` 也算数）；而 `copyCovers()` **只复制 `cover.<ext>`**
     ⇒ F9 绿、产物里根本没有它 ⇒ 封面 404；
  ④ **实测（比例判据对封面不成立）**：列表卡的封面槽是 **16:9** 且
     `object-fit: cover`（**会裁切**），模板里 `width="800" height="450"` 写的是
     **槽位**比例；可 IA4 的判据是「声明比例 == 资产比例」
     ⇒ 作者只要封面不是 16:9 就判红，而**作者没有任何办法自救**
     （裁切是设计，比例不匹配是常态）；
  ⑤ **实测（过时事实）**：`src/blog.njk` 的封面开关注释还在陈述
     「blog/portfolio 的 front matter 都写 `cover: cover.png`、
     那个文件里装的是 SVG 文本、四张卡里有两张会裂图」——
     那批内容**早已归档删除**，站内没有那些文章、也没有那些文件
     ⇒ **注释会误导下一个改开关的人**。
  2026-10-21 02:00–02:30 场次按此修，**只补看护 + 订正契约文字，站内一个字不改**：
  ① 图片门禁 `scripts/check-image-assets.cjs`：**IA5 扩展支持 SVG**
     —— 但**只对内容 `<img>`**；**og / twitter 分享图仍必须位图**
     （社交平台不解析 SVG ⇒ 单独判红）；IA4 对 SVG 改用**文件的固有尺寸**
     （`width` / `height`，没有就取 `viewBox` 的后两个数）来核比例；
     IA6 覆盖度自证把 SVG 计入已验证；
  ② front matter 门禁 `scripts/check-blog-frontmatter.cjs` 补判据 **F13 / F14 / F15**：
     **F13** 封面文件的**真实字节格式**必须与扩展名一致
     （自带魔数嗅探器，**不 import** 被检查方代码；读不出格式也判红）；
     **F14** 覆盖度自证（存在的封面数 == 读出真实格式的封面数）；
     **F15** 文件名**必须**是 `cover.<ext>`（扩展名集合直接取 `copyCovers()`
     实际复制的五种，不另拍脑袋）；
  ③ 自测 `scripts/test-blog-frontmatter.cjs` 补 **M15–M19** 五档
     （`.png` 装 SVG 文本 / `.svg` 装 PNG 字节 / `banner.svg` /
     真 PNG 全绿 / 既非位图也非 SVG），**20 档全过**；
  ④ 文档订正：`docs/blog-writing-guide.md` §2.3 契约 + §2.4 判据对照表
     （补 F13–F15 与「文件名必须是 `cover.<ext>`」）、
     `src/blog.njk` 注释（**只改注释，产物零变化**）、
     `docs/DEFECT-BACKLOG.md` 开 **D40** 行（已修）；
  ⑤ ⚠️ **沙箱实证**（图片门禁的 SVG 能力**没有**另开自测文件，
     改用沙箱 A/B + 负对照，避免多一个文件、一条 build 接线、一行 README）：
     同一份注入产物，旧门禁（`git show HEAD:scripts/check-image-assets.cjs`）
     **IA5 + IA6 双红**、新门禁 **exit 0**；
     负对照一（`<img>` 指向假 WebP）仍判红 IA5 + IA6；
     负对照二（og 图指向 SVG）判红「分享卡片图必须是位图」。
  ⚠️ **第 ④ 条（封面比例口径）本轮不代拍** —— 三条备选都涉及取舍：
  ① 模板按封面**资产真实尺寸**输出 `width` / `height`
     （要给 `eleventy.config.js` 加一个读图片尺寸的 filter，属**构造层**改动，
     宜单独一轮）；② 契约规定封面**必须 16:9**（内容 / 视觉取舍）；
  ③ IA4 对「被裁切填充」的图**豁免**比例判据。
  ⇒ 登记为**待拍板 50**。
  ⚠️ 本轮**新增一个待拍板项**（待拍板 50）；清单里剩下的「待修」仍全绑在
  既有拍板项上
  （D2 / D3 ↔ 40、D9 ↔ 41、D10 ↔ 42、D12 ↔ 43、D5 ↔ 选题主线、D26 视觉取舍、
  D6 ↔ push 时机 = 7 + 发布仓 = 49），D32 ↔ 49。
- **D39**（本轮修的是缺陷 **D41**）：还是**同一事实两份副本、其中一份没人看守**
  那一族，但这一轮撞上的是**顶层导航**这条路径 —— 顶层导航有**两份真源**：
  ① **真源一** = `src/_data/site.js` 的 `nav` 数组，这是**真正驱动渲染**的那一份
     （`src/_includes/partials/header.njk:10` 就是从它取 `navItems`）；
  ② **真源二** = 各页面模板 front matter 里的 `eleventyNavigation`（key / order），
     Eleventy 用它生成 `collections.navigation` 集合。
  **实测（已经漂移）**：`eleventyNavigation.order` 的实际序列是 1 / 2 / 3 / **5** ——
  About 停在 **5**，那是首版站点还有 5 个顶层入口（「作品集」「论文精读」尚未撤下）时的
  **化石值**，**order 4 空缺**；而 nav 数组现在只有 4 项，About 在**第 4 位**。
  **实测（假事实）**：`site.js` 里那段注释写着「Home 1 / Papers 2 / Blog 3 / **About 4**」
  —— 与模板现状**不符**（注释写的是它**期望**的一致状态，不是现状）。
  **实测（零看守）**：`scripts/` 全目录搜 `eleventyNavigation` —— **零命中**；
  `src/` 全目录搜 `collections.navigation` —— **零命中**（没人消费这个集合）
  ⇒ 这第二份副本今天是**死数据**，漂了也不会有人看见。
  2026-10-21 02:30–03:00 场次按此修，**只补看护 + 订正化石值与注释，构造层不动**：
  ① **化石值订正**：`src/about.njk` 的 `order: 5` → `order: 4`
     （这是**订正**「已不存在的现状」，不是改设计意图 —— 权威的「第几个」就是 nav 数组里的位置）；
  ② **注释订正**：`site.js` 的 nav 注释改为写明「权威顺序就是这份数组、
     `eleventyNavigation.order` 是第二份副本、必须逐位对齐」，并指认新门禁
     （把「一句约定」变成「被守着的约定」）；
  ③ 新门禁 `scripts/check-navigation-contract.cjs`（判据 **NA1–NA5**）：
     **NA1** 两份真源必须一一对应（nav 的每个 label 在 `eleventyNavigation` 里恰有一个
     同名 key，反之亦然；多、少、重复都点名）/ **NA2** `eleventyNavigation.order`
     必须**等于**该入口在 nav 数组里的位次 —— 这一条就是「化石 order 4 空缺」的照妖镜 /
     **NA3** 产物上**每一页**的页头导航（条目数、顺序、可见文字、点开去哪）必须与真源
     逐项一致 —— 产物里的**相对链接**要先还原成站内路径再比（本站用相对 URL 策略：
     同一个 "/" 在首页产物里是 `href="./"`、在论文详情页里是 `href="../../"`、
     在 404 页里是 `href="/"`；直接比字符串会得到一堆**假红**）/
     **NA4** 导航入口指向的页面必须**真实存在**（站内入口不许指向产物里没有的页面）/
     **NA5** 覆盖度自证 + 门禁自己没被卸掉；
  ④ 自测 `scripts/test-navigation-contract.cjs`（**NT0–NT8**，接在 build 链），
     含两档**负对照**：**NT7**（真源 / 模板 / 产物**三处一起**把 Blog 改成 Journal
     ⇒ 必须**判绿**，证明门禁守的是「对齐」而不是「具体是哪几个入口」）
     与 **NT8**（把本门禁从 `package.json` 摘掉 ⇒ 必须判红）；
  ⑤ 文档：`docs/DEFECT-BACKLOG.md` 开 **D41** 行（已修）、
     README 命令表补 2 行（RD3）；顺带订正两处**陈旧数字**
     （`scripts/test-blog-frontmatter.cjs` 头部仍写「十五档（M0–M14）」、
     README 仍写「15 档注入矩阵」—— D38 加了 M15–M19 却漏改这两处）。
  ⚠️ **本轮不代拍** —— 「顶层导航到底该留几份真源」是**构造层取舍**：
  保留两份并由门禁强制对齐（本轮做法），还是干脆删掉 `eleventyNavigation`
  收敛成单一真源（要牵动 package.json / README / 自测三处）？
  ⇒ 登记为**待拍板 51**。
  ⚠️ 清单里剩下的「待修」仍全绑在既有拍板项上
  （D2 / D3 ↔ 40、D9 ↔ 41、D10 ↔ 42、D12 ↔ 43、D5 ↔ 选题主线、D26 视觉取舍、
  D6 ↔ push 时机 = 7 + 发布仓 = 49），D32 ↔ 49。
- **D40**（本轮修的是缺陷 **D42**）：还是**「本该被守住的东西没人看守」**那一族，
  但这一轮撞上的是**站点 JavaScript** —— 它是全站唯一一类
  **「产物里被浏览器真的执行，却从没有任何门禁解析过一行」**的东西：
  ① **实测（有多少）**：站点有 **10 个 JS 文件**
     （`src/assets/js/` 下 `home-chart.js` / `main.js` / `nav.js` / `theme.js`，
     `src/assets/js/paper-reader/` 下 `annotations.js` / `highlight.js` / `main.js` /
     `reading-progress.js` / `theme.js` / `toc.js`），全部被复制进产物
     `_site/assets/js/`，全部由浏览器真的加载执行；
  ② **实测（零看守）**：全仓搜 `new Function｜acorn｜node --check｜vm.Script｜esprima`
     只命中三处**都不是这件事**的地方 —— `check-home-chart.cjs`（HC6 只扫**产物页**
     里的动态 `import()` 且**只判 bare 与否**，不判目标存不存在、不判语法）、
     `check-jsonld.cjs`（那是 JSON）、`check-third-party.cjs`
     （只判**外域** import 说明符，判存在性不归它管）
     ⇒ **站内 JS 的语法正确性与模块图闭合性至今零覆盖**；
  ③ **这个坑本仓已经踩过一次**（D10 场次实测）：动态 `import()` 的说明符写成 bare
     ⇒ Chrome 抛 `Failed to resolve module specifier`
     ⇒ 整张首页图**静默失去交互**，而当时 build 与所有静态门禁**都还是绿的**；
     现有门禁里最接近的是 HC6，但它只覆盖 9 个里的**那 2 条**（两处内联 module）
     且只判 bare 与否，**JS 文件里的 7 条**（`main.js` 的 2 条静态 import +
     `paper-reader/main.js` 的 5 条动态 import）**完全无人核**
     ⇒ 同一个坑可以再踩 7 次；
  ④ **实测（全部 import 位点）**：`paper-reader/main.js` 的 **5 个动态 import**
     （`./reading-progress.js` / `./toc.js` / `./theme.js` / `./annotations.js` /
     `./highlight.js`）+ `main.js` 的 **2 个静态 import**（`./theme.js` / `./nav.js`）
     + 2 个内联 module 的说明符（首页 `./assets/js/home-chart.js`、
     论文页 `../../assets/js/paper-reader/main.js`）⇒ 共 **9 个模块说明符**，
     其中只有 2 条被 HC6 的 bare 规则扫到，其余 **7 条无人核**；
  ⑤ **后果**：任何一处说明符写错（写成 bare / 少个 `./` / 文件改名没跟着改），
     **访客的浏览器会静默丢掉整块功能**（首页图 / 阅读进度条 / 目录 / 批注层 /
     高亮联动），而 build 全绿 ⇒ 这类失败只能靠**产物侧**的静态解析提前到 CI。
  ⚠️ **本轮不是「产物现在有违规」**：实测产物现状**全部健康**（10 个文件都能解析、
     9 个说明符全部闭合、6 个 `<script src>` 全部落地）⇒ 这是**看护缺口**、
     不是现存违规 ⇒ 修法是**加门禁**、**不改构造层**，站内一个字不改、**产物零变化**。
  2026-10-21 03:30–04:00 场次按此修，**只补看护**：
  ① 新门禁 `scripts/check-site-js.cjs`（判据 **JS1–JS6**，**纯产物侧**、
     零第三方依赖、**全程不执行被检查方代码**）：
     **JS1** 产物 JS 文件的语法按浏览器**加载它的那张嘴**判（`type="module"` 按 ESM、
     经典 `<script src>` 按经典脚本；口径从 HTML 的 script 标签 + 模块图反推，不是猜的）/
     **JS2** 产物 JS 文件里的每个模块说明符（静态 `import` / `export … from` /
     动态 `import()`）按**该模块自己的产物路径**解析，必须落到真实存在的产物文件；
     **裸说明符判红**（本仓无 import map，浏览器必然抛
     `Failed to resolve module specifier`，且违反「零第三方前端运行时依赖」）/
     **JS3** 内联脚本按 classic / module 对应口径必须能解析 /
     **JS4** 内联 module 的说明符必须按**页面 URL 口径**（不是文件路径）落地
     —— 这正是 D10 那类 bug 的真凶 /
     **JS5** `<script src>` 必须按页面 URL 口径落地 /
     **JS6** 覆盖度自证 + 门禁自己没被卸掉；
  ② **只判产物、不判源码**：浏览器加载的是**产物**，产物的路径（相对/绝对、根相对）
     由 Eleventy 的 `relUrl` 过滤器在渲染时改写，源码里的写法与访客实际请求的 URL
     不是一回事 ⇒ 判产物 = 判访客真正经历的那件事，也免去源↔产物路径映射的维护负担；
  ③ 外域说明符**不重复判红**（归 `check-third-party` 的 TD4），`data:` / `blob:`
     自包含不判；**非字面量**的动态 import 只计数并提示，不判红（静态判不了）；
  ④ 扫描器**自写**（门禁不得 import 被检查方的 lib），能分辨注释 / 字符串 /
     模板串 / 正则字面量里的**假** `import(` 与真的说明符；
  ⑤ 自测 `scripts/test-site-js.cjs`（**JT0–JT17**，接在 build 链）：
     **6 档判据级负对照**（副本里把 `const JSn_ON` 改成 false 后对应注入必须转绿
     —— 只断言「能变红」不够，那只说明门禁有反应，不说明红因来自那一条判据）/
     **1 档故意判绿**（把 import 指向一个**真实存在的新文件** ⇒ 仍绿，
     证明守的是「目标存不存在」而不是固定文件清单）/
     **1 档扫描器 tricky 档**（注释 / 字符串 / 模板串 / 正则里各埋一个指向不存在
     文件的假 import ⇒ 必须判绿，两头夹逼才能证明扫描器只认真说明符）/
     **1 档 D10 原样复刻**（首页内联 module 的说明符写成裸的 ⇒ 必须判红）；
  ⑥ 文档：`docs/DEFECT-BACKLOG.md` 开 **D42** 行（已修）、
     README 命令表补 2 行（RD3）。
  ⚠️ **本轮不代拍、也不新增待拍板**：交互类要不要配常驻浏览器门禁是**待拍板 42**
     （D10 那一条），本门禁只做**静态解析**，**不越界**替它拍板；
     本轮也**没有构造层取舍**要拍（不改文件、不改文案、不删能力）⇒ 无新增拍板项。
  ⚠️ 清单里剩下的「待修」仍全绑在既有拍板项上
  （D2 / D3 ↔ 40、D9 ↔ 41、D10 ↔ 42、D12 ↔ 43、D5 ↔ 选题主线、D26 视觉取舍、
  D6 ↔ push 时机 = 7 + 发布仓 = 49），D32 ↔ 49。

- **D41**（本轮修的是缺陷 **D43**）：还是**「本该被守住的东西没人看守」**那一族，
  但这一轮撞上的是**响应式图片声明**（`srcset`）—— 浏览器**按视口宽 / 设备像素比**
  从候选里挑一张去请求，**候选断链 = 那个宽度下直接断图**：
  ① **实测（有多少）**：产物里有 **2 处 `<img srcset>`**（首页与关于页的作者肖像）、
     共 **4 个候选 URL**；而这两张肖像带 `loading="eager"` + `fetchpriority="high"`
     ⇒ 它们就是 **LCP 元素** ⇒ 候选断链 = **LCP 直接失败**；
  ② **实测（零看守）**：`verify-site.cjs` 的通用引用正则
     `/(?:href|src)\s*=\s*"([^"]*)"/gi` **匹配不到 `srcset`**（`src` 后面跟的是 `set=`
     而不是 `=`，正则要求属性名后紧跟 `=`）⇒ 整条声明在它眼里**根本不存在**；
     `check-404-depth.cjs` 读了 `srcset` 但**只判路径形态**、不判存在性；
     `check-third-party.cjs` 扫 `img[srcset]` 但**只判外域**（TD1）；
     `check-image-assets.cjs` 只管 og:image / twitter:image 装在 `content` 属性里的
     **分享图**（IA1–IA7），**不看 `<img>` 的 srcset**
     ⇒ **响应式图片的候选存在性至今零覆盖**；
  ③ **实测坐实（决定性）**：把首页肖像的 600w 候选改成
     `assets/img/author/mh-d43-missing.jpg`（副本里确实不存在），对该副本跑
     **14 道产物侧门禁** ⇒ **14 道全部 exit 0**，没有任何一道报告这件事；
  ④ **后果**：换肖像图时改了 `src` 忘了改 `srcset`（或反之）、或候选仍写着旧文件名
     ⇒ **访客在那个宽度下看到的是断图**，而 build 全绿。
  ⚠️ **本轮不是「产物现在有违规」**：实测产物现状**全部健康**（4 个候选全部存在、
     描述符合法且未混用 `w`/`x`、两处 `<img>` 都带 `src` 兜底）⇒ 这是**看护缺口**、
     不是现存违规 ⇒ 修法是**加门禁**、**不改构造层**，站内一个字不改、**产物零变化**。
  2026-10-21 04:50–05:20 场次按此修，**只补看护**：
  ① 新门禁 `scripts/check-img-srcset.cjs`（判据 **SX1–SX6**，**纯产物侧**、
     零第三方依赖、**自带** HTML 标签扫描器而不 import 被检查方代码）：
     **SX1** `srcset` / `imagesrcset` 的**每个候选 URL** 必须按**页面 URL 口径**
     落到真实存在的产物文件（外域候选不判，归 TD1；含 `data:` URI 的声明整条跳过
     并计数提示 —— 它自身含逗号，按逗号切分会碎，判存在性必然误报）/
     **SX2** 带 `srcset` 的 `<img>` 必须同时有**非空的 `src`**（`src` 是规范要求的
     兜底属性；`srcset` 是在它之上的增强，不能替代它）/
     **SX3** `srcset` 声明**不得为空**（空候选列表被浏览器整条忽略）/
     **SX4** **描述符**必须合法（只允许 `<宽度>w` / `<密度>x` / 不写），且同一列表里
     **不得混用 `w` 与 `x`**（按 HTML 规范混用会让**整条声明被忽略**）/
     **SX5** **覆盖度自证**（一处 `srcset` 都没有 ⇒ 枚举器坏了，不是「没问题」）/
     **SX6** **门禁自己没被卸掉**；
  ② **只判产物、不判源码**：浏览器加载的是**产物**，产物的路径由 Eleventy 的 `relUrl`
     过滤器在渲染时改写 ⇒ 判产物 = 判访客真正经历的那件事；
  ③ 自测 `scripts/test-img-srcset.cjs`（**ST0–ST16** 十七档，接在 build 链）：
     **6 档判据级负对照**（副本里把 `const SXn_ON` 改成 false 后对应注入必须转绿）/
     **1 档故意判绿**（把候选改成一个**真实存在的新文件** ⇒ 仍绿，证明守的是
     「存在性」而不是固定文件清单）/
     **1 档覆盖度负对照**（抽掉全部 `srcset` ⇒ 必须判红）/
     **1 档扫描器 tricky 档**（HTML 注释 / `<script>` 原始文本 / 别人的属性值里各埋
     一个指向不存在文件的假 `srcset` ⇒ 必须判绿）；
  ④ 文档：`docs/DEFECT-BACKLOG.md` 开 **D43** 行（已修）、
     README 命令表补 2 行（RD3）。
  ⚠️ **本轮不代拍、也不新增待拍板**：本门禁只做**静态判定**，不碰「图片好不好看 /
  裁得好不好」这类视觉取舍（那属 **待拍板 42** 的范围）；本轮也**没有构造层取舍**
  要拍（不改文件、不改文案、不删能力）⇒ 无新增拍板项。

- **D42**（本轮修的是缺陷 **D44**）：还是**「本该被守住的东西没人看守」**那一族，
  但这一轮撞上的是**订阅与爬虫的「自我描述入口」** —— 站点对人来说是「几个页面」，
  对机器来说要靠**自描述**才能被找到：
  ① **实测（有什么）**：本站有四个对外出口（`publications.bib` / `publications.ris` /
     `feed.xml` / `sitemap.xml`），其中三个**只能靠自描述被机器找到** ——
     **每页的 RSS 自动发现**（`<link rel="alternate" type="application/rss+xml">`：
     浏览器的「订阅本页」与阅读器列表靠它）、**feed 的 `<atom:link rel="self">`**
     （聚合器据此知道这个 feed 自己的正式地址，多源抓取时不会把它当成别人的）、
     **robots.txt 的 `Sitemap:` 行**（爬虫据此知道站点地图在哪）；
  ② **实测（零看守）**：全仓逐条 grep 坐实 —— `'rss+xml'` ⇒ **0 命中**、
     `'atom'` ⇒ **0 命中**、`'Sitemap:'` ⇒ **0 命中**。
     `check-site-language.cjs`（TX1–TX4）只判这些出口的**语言**与 robots 的构建时刻标记，
     **不判结构与指向**；`check-lang.cjs` 文件头写着「非 HTML 的对外出口由
     `check-site-language.cjs` 负责」；`check-third-party.cjs` 只扫 `.html` / `.css` / `.js`
     ⇒ **robots.txt 里的外域 URL 连外域那道门禁都够不着**；
     `verify-site.cjs` 的通用引用正则会核 `<link href>` 的**目标存在**，
     但**不核「有没有这条声明」**，也不核它指向谁；
  ③ **实测坐实（决定性）**：把产物复制到 `/tmp` 后逐条注入三处故障
     （删掉 about 页的 RSS 自动发现 / 把 feed 的 `atom:link rel="self"` 指向 `/papers/` /
     把 robots.txt 的 `Sitemap:` 指向 `https://example.com/sitemap.xml`），
     对该副本跑 **15 道产物侧门禁** ⇒ **三处故障，15 道全绿，0 道报告**；
  ④ **后果**：模板改版时把 RSS 自动发现删掉、或把 `atom:link` / `Sitemap:` 指到别的站
     ⇒ 订阅器把本站当成别人的 feed 来订阅、爬虫找不到站点地图
     ⇒ **全站内容对机器不可发现**，而 build 全绿、访客也看不出来（人眼看的页面一切正常）。
  ⚠️ **本轮不是「产物现在有违规」**：实测产物现状**全部健康**（6 个页面各有且仅有 1 处
     RSS 自动发现且 href 按页面 URL 口径全部落到本站 `feed.xml`；`atom:link rel="self"`
     = `https://github.lvyihang.xyz/feed.xml`；`robots.txt` 恰好一行 `Sitemap:` 且指向本站
     sitemap；频道级三件套齐备）⇒ 这是**看护缺口**、不是现存违规 ⇒ 修法是**加门禁**、
     **不改构造层**，站内一个字不改、**产物零变化**。
  2026-10-21 05:40–06:40 场次按此修，**只补看护**：
  ① 新门禁 `scripts/check-feed-discovery.cjs`（判据 **FD1–FD6**，**纯产物侧**、
     零第三方依赖、**自带** HTML 标签扫描器与属性解析器而不 import 被检查方代码）：
     **FD1** 每页（含 404）必须**恰好一处** RSS 自动发现，其 `href` 按**页面 URL 口径**
     解析后必须落到**本站的 `feed.xml`**（站内相对路径 / 根相对路径 / 与本站同源的绝对
     URL 三种写法都算「指向本站」；外域 / 重复 / 缺项 / 空 href 一律判红）/
     **FD2** `feed.xml` 必须有 `<atom:link>`，`rel="self"`、`type="application/rss+xml"`、
     href 等于 `site.url` + `/feed.xml`/
     **FD3** feed **频道级** `<title>` / `<link>` / `<description>` 三件套存在且非空
     （频道头 = `<channel>` 到第一个 `<item>` 之间，item 里的同名字段不算）/
     **FD4** `robots.txt` 必须**恰好一行** `Sitemap:` 且等于 `site.url` + `/sitemap.xml`/
     **FD5** 覆盖度自证（页面数 ≥ 1、扫到的入口 ≥ 1、`feed.xml` 与 `robots.txt` 都读到）/
     **FD6** 门禁自己没被卸掉（package.json 的 build 链里必须真的有本门禁）；
  ② `site.url` 从 **`src/_data/site.js`** 读（真源）⇒ 读不到即判红、**不猜**；
     判红文案**逐条带判据编号前缀**（`FD1：`…）⇒ 负对照能断言「红因来自哪一条」；
  ③ 自测 `scripts/test-feed-discovery.cjs`（**21 档** FT0–FT20，接在 build 链）：
     每条判据各有一档注入 + **6 档判据级负对照**（副本里把 `const FDn_ON` 改成 false 后
     对应注入必须转绿）+ **1 档故意判绿**（href 换成与本站同源的绝对 URL ⇒ 仍绿，
     证明守的是「指向本站的 feed」这件事而不是某一种写法）/
     **1 档扫描器 tricky 档**（HTML 注释 / `<script>` 原始文本 / 别人的属性值里各埋一个
     假 RSS 入口 ⇒ 必须判绿）；
     ⚠️ **一条照实写、不硬凑成绿的负对照**：FD5 是**覆盖度自证**，它报告的其实是
     「判据没落到东西上」，这种故障天然与 FD1 同源（没有入口 ⇒ 入口缺失）⇒ 卸掉 FD5 之后
     **不可能转绿**（真实缺陷还在），能证明的只是「红因里不再出现 FD5」
     ⇒ 该档断言写成「仍然红、但红因里 FD5 已被摘干净」；
  ④ 文档：`docs/DEFECT-BACKLOG.md` 开 **D44** 行（已修）、
     README 命令表补 2 行（RD3）。
  ⚠️ **本轮不代拍、也不新增待拍板**：本门禁只做**静态判定**（入口在不在、指向谁、
  声明合不合规），**不判订阅器能不能真的拉到内容**（feed 有无 item 归 verify-site 第 7 条）、
  **不判 robots.txt 的 User-agent 分组**、**不判 feed 频道 `<link>` 指向哪**（那是站点
  信息架构）；本轮**没有构造层取舍**要拍 ⇒ 无新增拍板项。

- **D43**（本轮修的是缺陷 **D45**）：还是**「本该被守住的东西没人看守」**那一族，
  但这一轮撞上的是**同一份订阅源对外报的「显示名」** —— 上一个场次（D42）把
  「订阅入口在不在」守住了，这一轮才问：**入口在，但它对外报的名字对不对？**
  ① **实测（两份副本）**：同一串字面量 `Yihang Lyu · Publications and notes`
     在**两个文件里各写了一遍** —— ① `src/_includes/layouts/base.njk:139` 的
     RSS 自动发现 `<link rel="alternate" type="application/rss+xml" title="…">`
     （浏览器「订阅本页」按钮里显示的就是这个属性）、
     ② `src/feed.njk:23` 的频道级 `<title>…</title>`（订阅器列表里显示的是这个）
     ⇒ **同一事实两份副本**；
  ② **实测（零看守）**：`check-feed-discovery.cjs`（FD1–FD6，D42 刚加的）只判
     「入口在不在 / 指向谁 / 频道三件套齐不齐」，**不判两处报的名字一不一样**；
     `check-identity-handles.cjs` 的 I5 只扫 `site.author` 数据层；
     `verify-site.cjs` 只核链接目标存在，不核属性值 ⇒ **没有任何一道门禁
     会因为这两个名字对不上而响**；
  ③ **实测坐实（决定性）**：把产物复制到 `/tmp`，把 `index.html` 的自动发现
     `title` 改成 `Yihang Lyu · Publications`（与 feed 频道 title 不同），
     对该副本跑 **16 道 SITE_DIR 产物侧门禁** ⇒ **16/16 全绿，0 道判红**；
  ④ **后果**：改一处忘另一处 ⇒ 浏览器里显示的订阅名与订阅器里 feed 自己的名字
     对不上（访客看着像订了两个不同的源），而 build 全绿、访客也看不出来。
  ⚠️ **本轮不是「产物现在有违规」**：实测产物现状**完全一致**（6 个页面共 6 处
     自动发现入口，`title` 逐字相同）⇒ 与 D42 不同，这一轮**构造层要动**
     （把字面量收敛成一份真源），但**产物逐字不变**。
  2026-10-21 06:40–07:40 场次按此修，**收敛真源 + 补看护**：
  ① **根因修（构造层）**：`src/_data/site.js` 新增 `SITE_TITLE` /
     `FEED_TITLE_SUFFIX` 两个常量与 `feedTitle` 字段（由这两个常量拼出）；
     `base.njk` 与 `feed.njk` 两处都从 `site.feedTitle` 派生
     ⇒ **一个字面量都不许再留在模板里**，且**产物逐字未变**；
  ② 新门禁 `scripts/check-feed-title.cjs`（判据 **FX1–FX6**，零第三方依赖、
     **自带** HTML 标签扫描器 / 属性解析器 / 注释遮罩器 / 实体解码器而不
     import 被检查方代码）：**FX1** 真源契约（`site.feedTitle` 存在、非空、
     且是「站点名 + 自己的后缀」派生的 —— 写成另一份独立字面量即判红）/
     **FX2** 模板层（`.njk`）不许把显示名的后缀片段烤成字面量（**分隔符不算
     实质部分** ⇒ 只烤死「Publications and notes」这一档也抓得住；注释豁免）/
     **FX3** 三处一致：产物里每处 RSS 自动发现的 `title` 属性 ↔ `feed.xml`
     频道级 `<title>` ↔ 真源 `site.feedTitle` 逐字相同（比的是**渲染后的文字**）/
     **FX4** 覆盖度自证（页面数 ≥ 1、扫到的入口 ≥ 1、读到 feed.xml 与频道 title、
     真源字段存在、扫到 .njk 模板 ≥ 1 ⇒ 否则「判据没落到东西上」判红）/
     **FX5** 门禁自己没被卸掉（package.json 的 build 链里必须真的有本门禁）/
     **FX6** 扫描器自证（合成样例走**同一条**遮罩 + 匹配路径：正文里的**固定探针
     token**必须命中、注释里的必须不命中；探针**不**取自真源，真源坏了由 FX1 负责）；
  ③ 自测 `scripts/test-feed-title.cjs`（**FZ0–FZ16** 十七档，接在 build 链）：
     每条判据各有一档注入 + **6 档判据级负对照**（副本里把 `const FXn_ON = true;`
     改成 false ⇒ 对应注入必须转绿）+ **2 档故意判绿**（片段只出现在模板注释里
     必须判绿；**整站一致改名**（真源 + 产物一起改）必须判绿 ⇒ 守的是「一份真源 +
     三处一致」而不是某一份固定清单）；
  ④ 文档：`docs/DEFECT-BACKLOG.md` 开 **D45** 行（已修）、
     README 命令表补 2 行（RD3）。
  ⚠️ **本轮不代拍、也不新增待拍板**：本门禁只做**静态判定**（三处字面量是否逐字
  相同），**不判订阅器里显示成什么样**（那是阅读器的事）；真源的名字本身
  （「Yihang Lyu · Publications and notes」）**沿用现状**，本轮没有改名 ⇒
  **没有构造层取舍**要拍 ⇒ 无新增拍板项。

- **D44**（本轮修的是缺陷 **D46**）：还是**「本该被守住的东西没人看守」**那一族，
  但这一轮撞上的是**外链的安全属性** —— 前两个场次（D42 / D43）守的是「订阅源对外
  报什么」，这一轮才问：**访客点开外链之后，我们自己的标签页还在不在我们手里？**
  ① **实测（零看守，逐条 grep 坐实）**：`scripts/` 下**没有任何一个脚本**含
     `noopener` / `noreferrer` / `target=` / `_blank` 字样 ⇒ 全仓**零门禁**覆盖
     这条属性。`verify-site.cjs` 的通用引用正则只核**链接目标存在**、不核属性值；
     `check-third-party.cjs`（TD1–TD5）只判**外域**、不判 rel；
     `check-a11y.cjs` 只管可访问性。
  ② **实测（修前坏态，决定性）**：把产物复制到 `/tmp`，① 把 `index.html` 一个
     `target="_blank"` 链接的 `rel` 属性**整个删掉**、② 把 `about/index.html`
     一个链接的 `rel` 改成只剩 `me`（两个保护 token 都没了），对该副本跑
     **18 道 SITE_DIR 产物侧门禁** ⇒ **18/18 全绿，0 道判红**。
  ③ **后果**：`target="_blank"` 的链接会在**新标签页**里打开目标页面，而新标签页
     默认**持有 `window.opener`** ⇒ 目标页面里的脚本可以反过来用
     `window.opener.location = "…"` 把本站这个标签页**导航走**
     （reverse tabnabbing：访客点了外链，回头一看自己的站点被换成了钓鱼页）。
     规范给的解法是 `rel="noopener noreferrer"`，而本站在 **7 个模板文件里手写了
     43 处** ⇒ **同一份安全属性 7 份副本、零看守**。
  ⚠️ **本轮不是「产物现在有违规」**：实测产物现状 **66/66 全部合规**
     （6 个页面 66 处 `target="_blank"`：61 处 `rel="noopener noreferrer"`、
     5 处 `rel="noopener noreferrer me"`；模板层 43 处同样全合规）
     ⇒ 缺的只是**看守** ⇒ 与 D42 同款，**只加门禁、不改构造层** ⇒ **产物逐字不变**。
  2026-10-21 07:50–08:50 场次按此修，**补看护**：
  ① 新门禁 `scripts/check-target-blank-rel.cjs`（判据 **GA1–GA6**，零第三方依赖、
     **自带** HTML 标签扫描器 / 属性解析器 / 注释遮罩器而不 import 被检查方代码）：
     **GA1** 模板层（`.njk`）里每个**会开新浏览上下文**的 `target`（`_blank` 或
     **命名目标**）的 `<a>` / `<area>` 必须带 `rel`，且 `rel` 的 **token 集合**必须
     同时含 `noopener` 与 `noreferrer`；`rel` 必须是**字面量**（模板变量静态判不出
     ⇒ 判红）/ **GA2** 产物层同上 / **GA3** 覆盖度自证（扫到的 .njk 模板 ≥ 1、
     模板里会开新上下文的链接 ≥ 1、HTML 页面 ≥ 1、产物里会开新上下文的链接 ≥ 1
     ⇒ 否则「判据没落到东西上」判红；**覆盖度计数放在判定开关之外**）/
     **GA4** 门禁自己没被卸掉 / **GA5** 扫描器自证（合成样例走**同一条**扫描 +
     判定路径：合规样例必须判绿、少一个 token 的必须判红、**token 必须精确匹配**
     （`noopenerx` 不算 `noopener`）、注释里的必须不命中、带 `target` 的 `<base>`
     必须能被检出）/ **GA6** 模板与产物都不许有 `<base target>`（那是**全站默认**
     的打开目标）；
  ② 自测 `scripts/test-target-blank-rel.cjs`（**GB0–GB22** 二十三档，接在 build 链）：
     每条判据各有一档注入 + **6 档判据级负对照**（副本里把 `const GAn_ON = true;`
     改成 false ⇒ 对应注入必须转绿）+ **5 档故意判绿**（rel 多带无关 token、
     rel 的 token 大写、坏链接只出现在 HTML 注释里、坏链接只出现在 Nunjucks 注释里、
     普通站内链接没有 rel）+ 1 档覆盖度负对照 + 1 档扫描器自证负对照；
  ③ 文档：`docs/DEFECT-BACKLOG.md` 开 **D46** 行（已修）、
     README 命令表补 2 行（RD3）。
  ⚠️ **本轮不代拍、也不新增待拍板**：本门禁只做**静态判定**（`target` 与 `rel` 的
  属性值合不合规），**不判访客点开之后浏览器到底给不给 opener**（那是浏览器的事）；
  **不判该不该开新标签页**（那是信息架构与设计取舍）；本轮**没有构造层取舍**要拍
  ⇒ 无新增拍板项。

- **D45**（本轮修的是缺陷 **D47**）：这一轮撞上的是**「看得见吗」** —— 前几个场次
  （D42 / D43 / D44）守的都是**「有没有」**（有没有自描述入口 / 有没有第二份副本 /
  有没有安全属性），这一轮才问：**就算有，够不够看得见？**
  ① **实测（零看守，逐条 grep 坐实）**：`focus-visible` 在全仓 `scripts/check-*.cjs` /
     `scripts/verify-*.cjs` 里命中 **0** ⇒ 焦点可见性**没有任何一道门禁**；
     `check-a11y.cjs`（A1–A8）只管**文字与底色**的对比度、**不看 box-shadow**；
     `check-design-system-contract.cjs` 只核 token 与文档**一致**、**不核数值**。
     缺陷清单 §2 那行「焦点可见性」核的是**存在性**（有没有替代指示），
     **替代指示本身够不够看得见，一个字都没提**。
  ② **实测（对比度，决定性）**：替代指示是一个 **35% 半透明的蓝**
     （`--shadow-focus: 0 0 0 3px rgba(58,134,255,.35)`）⇒ 浅色页面底 **1.48:1**、
     暗色页面底 **1.78:1**、浅色主按钮底 **1.25:1** —— 全部远低于 WCAG 1.4.11
     （非文本对比度）要求的 **3:1** ⇒ 键盘用户 Tab 导航时几乎看不出焦点在哪。
     ⚠️ 与 D44 不同：**这一轮产物现状是真的不达标**（不是「缺看守」）⇒ 修的是构造层。
  ③ **为什么不能只把半透明改成不透明**：单一颜色在本站**多种底色**上不可能同时达标
     —— 不透明的 brand-400（#3a86ff）在主按钮底 #1453d8 上也只有 **1.85:1** ⇒
     唯一稳健的解法是**双色环**（内圈与页面底强对比、外圈取调色板另一极兜底 ⇒
     任何底色上**至少有一圈 ≥ 3:1**）。
  ④ **修法（只改 token，12 处引用点自动生效）**：`tokens.css` 新增 `--focus-ring-inner`
     （`var(--color-brand-800)`）与 `--focus-ring-outer`（`var(--color-neutral-0)`），
     `--shadow-focus` 改成 `0 0 0 2px var(--focus-ring-inner), 0 0 0 4px var(--focus-ring-outer)`；
     两处暗色主题块的写法与 `:root` **逐字相同** —— 暗色色阶是**反映射**的
     （暗色下 brand-800 = #dbeaff、neutral-0 = #0f0e0c）⇒ 同一对声明自动变成
     「内浅外深」，**不需要逐主题覆写**。`base.css` / `_button.css` / `_paper.css` /
     `pages.css` / `paper-reader.css` 里那 12 处 `var(--shadow-focus)` **一个字都没动**。
     文档 `docs/design-system.md` 同步四处（浅色块 / 暗色块 / 阴影示例 / 完整变量表）。
     ⚠️ **另补一处同源形态**：`a11y.css` 的 `@media (prefers-contrast: more)` 里那条
     `:focus-visible` 覆写把焦点环**写死成单色** `var(--color-brand-400)`（主按钮底上只有
     1.92:1）⇒ 同样改成双色（加粗到内 3px / 外 6px，但**仍是双色**）；
     `forced-colors: active` 那条（`outline: 3px solid Highlight` + `box-shadow: none`）是
     **系统色适配**，保持原样不动。
  ⑤ **新门禁** `scripts/check-focus-ring.cjs`（判据 **FC1–FC7**，零第三方依赖、
     **自带** CSS 块解析 / 颜色解析 / 括号感知切分 / WCAG 相对亮度计算 / 全站 CSS 规则扫描
     而不 import 被检查方代码）：**FC1** 双层结构 + 两圈各引一个 token + 两圈互不相同 + 内圈
     spread ≥ 2px / **FC2** 两处暗色块与 `:root` 逐字相同 / **FC3** **三个主题 × 每个
     登记底色**上两圈里**至少一圈 ≥ 3:1**（按「相邻底色」建模：焦点环画在元素外侧，
     落在**相邻**底色上）/ **FC4** 两圈必须实色 / **FC5** 覆盖度自证（**计数放在判定
     开关之外**）/ **FC6** 门禁自己没被卸掉（package.json 的 build 链）/
     **FC7 全站 CSS 兜底**：任何 `:focus-visible` 规则都**不许自己另写焦点环** ——
     只能走 `var(--shadow-focus)`、同时引用 `--focus-ring-inner` + `--focus-ring-outer`，
     或置 `none` 并在**同一条规则**里补 `outline`（forced-colors 的系统色形态即此）。
     ⚠️ 没有 FC7 的话，FC1–FC6 只能守住 token 真源 —— 任何人在任何 CSS 文件里另写一个
     `box-shadow: 0 0 0 3px var(--color-brand-400)` 就能绕开整套对比度检查。
  ⑥ **自测** `scripts/test-focus-ring.cjs`（**FS0–FS25** 二十六档，接在 build 链）：
     每条判据各有一档注入 + **7 档判据级负对照**（副本里把 `const FCn_ON = true;`
     改成 false ⇒ 对应注入必须转绿）+ **3 档故意判绿**（内外圈引用互换、外圈换成纯黑、
     高对比档改用 outline 系统色形态 —— 判据守的是「至少一圈达标」，**不挑具体颜色**）+
     **1 档同源负对照**（卸掉 FC1 后仍红但红因里不再有 FC1）+ 覆盖度自证 + 门禁被摘掉 +
     扫描器自证等档。夹具站有**两份**输入：token 真源副本（FC1–FC5 的注入打在这里）
     与**全站 CSS 目录副本**（FC7 的注入打在这里，每档跑之前都从 pristine 恢复）。
     ⚠️ 断言只认**失败条目**（`· FCn：`），不看通过行 —— 通过行里同样带着判据编号，
     只看「输出里有 FCn：」会误判。
  ⚠️ **本轮不代拍、也不新增待拍板**：对比度是**客观的 WCAG 指标**，双色环是达标方向上
  唯一稳健的解；两个新 token **全部取自现有色板**、**零新增颜色** ⇒ 不是审美取舍。
  ⚠️ 本门禁只判**颜色对底色的对比度**这一个维度：焦点环的位置 / 形状 / 是否被
  `overflow` 裁切 / 键盘可达性都**不在**这里（那些属浏览器级判据，见 D10 待拍板 42）。

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
