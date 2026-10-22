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

**进度（2026-10-22 12:42 实测）**
- 缺陷清单已到 **D68**（D1 / D2 / D3 / D4 / D11 / D13 / D14 / D15 / D16 / D17 / D18 / D19 / D20 / D21 / D22 / D23 / D24 / D25 / D27 / D28 / D29 / D30 / D31 / D33 / D34 / D35 / D36 / D37 / D38 / D39 / D40 / D41 / D42 / D43 / D44 / D45 / D46 / D47 / D48 / D49 / D50 / D51 / D52 / D53 / D54 / D55 / D56 / D58 / D59 / D60 / D61 / D62 / D63 / D64 / D65 / D66 已修；D5 / D6 / D9 / D10 / D12 / D26 / D32 / D57 / D67 / D68 待修；D7 / D8 不修）。
- **D59 已做第一、二、三、四、五、六、七、八、九、十、十一、十二批**（第一批 2026-10-21 D57 场次；第二批 2026-10-21 D58 场次；
  第三批 2026-10-21 D59 场次；第四批 2026-10-21 D59 场次；第五批 2026-10-21 D59 场次；
  第六批 2026-10-21 D59 场次；第七批 2026-10-21 D59 场次；第八批 2026-10-21 D59 场次；第九批 2026-10-22 D59 场次；第十批 2026-10-22 D59 场次；第十一批 2026-10-22 D59 场次；第十二批 2026-10-22 D59 场次），**第十三轮（2026-10-22 D60 场次）修的不是 D59、而是缺陷 D3**（D59 侧只剩 `check-identity-handles` 一道，仍由**并发场次**在改），**第十四批（2026-10-22 D61 场次）补上 D59 侧最后一道 `check-identity-handles`**（⇒ D59 缺陷线收尾）：给
  `check-image-assets` 补了常驻自测
  `scripts/test-image-assets.cjs`（**20 档注入矩阵**，跑在自造的最小夹具站上，不依赖 `_site`），
  给 `check-tool-routes` 补了常驻自测 `scripts/test-tool-routes.cjs`（**15 档注入矩阵**，跑在
  自造的最小夹具站上，不依赖真 `_site`、不需要 git），给 `check-lang` 补了常驻自测
  `scripts/test-lang.cjs`（**28 档注入矩阵**，同样跑在自造的最小夹具站上），给 `check-print-theme`
  补了常驻自测 `scripts/test-print-theme.cjs`（**27 档注入矩阵**，同样跑在自造的最小夹具站上），
  给 `check-copy-export` 补了常驻自测 `scripts/test-copy-export.cjs`（**25 档注入矩阵**，同样跑在
  自造的最小夹具站上），给 `check-css-braces` 补了常驻自测 `scripts/test-css-braces.cjs`
  （**22 档注入矩阵**，同样跑在自造的最小夹具站上），给 `check-wrapping` 补了常驻自测
  `scripts/test-wrapping.cjs`（**24 档注入矩阵**，同样跑在自造的最小夹具站上），给
  `check-tracked-refs` 补了常驻自测 `scripts/test-tracked-refs.cjs`（**18 档注入矩阵**，跑在
  **临时 git 仓**上 —— TR1/TR2/TR3 全都依赖「索引里的跟踪集合」⇒ 它是唯一一道**必须要有 git**
  的门禁），给 `check-artifact-metadata` 补了常驻自测 `scripts/test-artifact-metadata.cjs`
  （**26 档注入矩阵**，跑在**自造的最小夹具站**上，不依赖真 `_site`、不需要 git），给
  `check-identity-derivation` 补了常驻自测 `scripts/test-identity-derivation.cjs`
  （**34 档注入矩阵**，跑在**自造的最小夹具站**上，不依赖真 `_site`、不需要 git），给
  `check-jsonld` 补了常驻自测 `scripts/test-jsonld.cjs`
  （**38 档注入矩阵**，跑在**自造的最小夹具站**上、不依赖真 `_site`，但**需要一个临时 git 仓**
  —— J11 的 dateModified 取的是**提交时间**，没有 git 就造不出可比的时间戳），给 `verify-site` 补了
  常驻自测 `scripts/test-verify-site.cjs`（**77 档注入矩阵**，跑在**真实产物的只读副本 + 每档独立的
  沙箱源码副本**上 —— 门禁 18 的 dateModified 取的也是**提交时间**，沙箱靠 `METEO_REPO_ROOT` 注入缝借到
  真仓库的 git 历史），给 `check-identity-handles` 补了常驻自测 `scripts/test-identity-handles.cjs`
  （**37 档注入矩阵 + 30 档判据级负对照**，跑在**自造的最小夹具站**上，不依赖真 `_site`、不需要 git），
  十三者都接进
  `npm run build` 与 README 命令表
  ⇒ D56 留在 `/tmp` 里那份
  「矩阵跑完即弃」的证明**已进仓库**；第三批还顺带给 `check-lang` **编号化**（此前一条编号都没有 ⇒
  红因无法按编号归属）成 **LG1–LG7**，并补了 3 条**自证存活**判据（源文件层空跑 / `_site` 缺失 /
  产物层空跑）；第四批给 `check-print-theme` 补了 **PT7「前提文件在场」**判据（此前 print.css
  缺失时门禁只打一行**裸红因**就退出 ⇒ 其余判据根本没跑）并把红因文案统一成 `门禁 PTn：` 前缀；
  第五批给 `check-copy-export` **编号化**成 **CE1–CE9**（此前一条编号都没有 ⇒ 红因同样无法按编号
  归属）并补了 **CE9「门禁自己没被卸掉」**判据（读 `package.json` 确认 `build` 仍链着
  `check:copy` 且 `check:copy` 仍指向本门禁），红因文案统一成 `门禁 CEn：` 前缀；
  第六批给 `check-css-braces` **编号化**成 **CB1–CB4**（此前同样一条编号都没有）并补了
  **CB2「扫描面为空」/ CB3「遮罩自证」/ CB4「门禁自己没被卸掉」**三条自证判据，同时修掉一个
  **假阳性**（`strip()` 此前不剥 `url(...)` ⇒ 未加引号的 `url(data:…)` 里的 `{` 被误计入，而旧文件头
  却声称「跳过 url() 里的 data URI」⇒ 文档说假话）；
  第七批给 `check-wrapping` **编号化**成 **W1–W4**（此前已有 W1–W3 ⇒ 编号沿用不换）并补了
  **W4「解析器自证」**判据，同时修掉两个真洞（**级联洞**：旧门禁只读一条规则里的第一条
  `overflow-wrap` 声明，而后写覆盖先写 ⇒ 「末位是 break-word」的规则被放行；**假阳性**：
  `overflow-wrap: anywhere !important` 被误报判红），并把 **W3 从字符串匹配升级为沿 `npm run`
  链遍历**（旧写法 `build.includes("check:wrap")` 会被本批新增的 `check:wrap-selftest` 名字骗过
  ⇒ 门禁被卸掉时反而判绿）；
  第八批给 `check-tracked-refs` **编号化**成 **TR1–TR4**（此前已有 TR1–TR2 ⇒ 编号**沿用
  不换**，`TR` 前缀已由本门禁独占）并补了 **TR3「索引可读」/ TR4「遮罩自证」**两条判据，同时修掉
  两个真洞（**注释当引用**与**字符串当引用**两处**假阳性** ⇒ 门禁会对着一个**从没写过的文件**
  报错，把真正该报的那次淹了）与一个口径洞（**TR2 数的是「扫到的本地引用总数」**，把**指向仓库外
  的依赖**也算进去 ⇒ 一份只引用 node_modules 的仓库也能让「自证存活」变绿 ⇒ 形同虚设），并把
  扫描改成**两层遮罩**（注释整体遮掉 + 字符串**不在引用位**时连内容一起遮掉 ⇒ 引用位 = 前面紧挨着
  require( / import( / from / import）；做法沿用仓库内已验证的 `check-identity-derivation` 的字符串
  感知遮罩）；
  第九批给 `check-artifact-metadata` **编号化**成 **M1–M8**（此前**一条编号都没有** ⇒ 红因无法按
  编号归属）并补了 **M7「前提可读」/ M8「逐比较点覆盖度自证」**两条判据，同时修掉三个真洞
  （**存在性判据**：论文页上指向代码仓的链接有两条，只要有一条对就放行 ⇒ 另一条漂移没人叫；
  **子串匹配**：旧写法 `build.includes("check:artifact")` 会被本批新增的
  `check:artifact-selftest` 名字骗过 ⇒ 门禁被卸掉时反而判绿；**总数自证**：旧口径只看**总数**
  ⇒ M1 整段被摘仍判绿）与一个口径洞（**license 不同源**：旧期望值是 `licenseUrl || undefined`，
  而模板投影的是 `licenseUrl || license` ⇒ `licenseUrl` 被删时页面是对的、门禁报假红），
  并把 **M6 从子串匹配升级为沿 `npm run` 链遍历**（做法沿用 `check-css-braces` 的 CB4）；
  第十批给 `check-identity-derivation` **编号化**成 **ID0–ID7**（此前**23 处 `fail()` 调用没有一处带编号**
  ⇒ 红因无法按编号归属，且文件头声称的「ID1–ID5」与实现用的 ID0–ID6 脱节）并补了 **ID7「逐比较点
  覆盖度自证」**判据（**21 个比较点静态登记 + 逐一记账**），同时修掉三个真洞（**恒等式假自证**：旧
  「自证存活」三条都直接赋值 `ORACLE_SAMEAS.length` ⇒ `!== EXPECTED_COUNT` **永远为假** ⇒ 那三条自证
  **永远不会红**，而它们就写在「一条都没查 = 判据本身没生效」的注释下面；**无可卸开关** ⇒ 判据级负对照
  无从谈起；**编号只活在注释里** ⇒ 文件头与实现脱节）并把 ID6a–ID6d 各自拆成独立可卸把手；
  第十一批给 `check-jsonld` **编号化**成 **J0–J12**（此前**43 处 `fail()` 只有 9 处带编号** ⇒ 大半红因
  无法按编号归属；**J3 与 J4 在实现里是合并的一段** ⇒ 文件头声称的编号与实现脱节）并补了 **J0
  「JSON-LD 块可解析」**（此前块解析失败会掉进别的判据里 ⇒ 归属错位）与 **J12「逐比较点覆盖度自证」**
  （**23 个比较点静态登记 + 逐一记账**）两条判据、把 **J3 与 J4 拆成两段**（J4 的前提原本被 J3 绑住
  ⇒ J3 一挂 J4 也哑火）、补了 `J0_ON`–`J12_ON` 十三个可卸把手并**接进 `fail()`**；
  第十二批给 `verify-site` **编号化**（此前 **133 处 `fail()` 一条编号都没有、零可卸把手、零覆盖度自证**
  ⇒ 红因只是一句裸人话 ⇒ 负对照无法指名到具体判据）：红因统一成 `门禁 <id>：…` 前缀、**133 处 `fail()`
  全部编号化**、补 **35 个可卸把手**（`G<id>_ON`）并**接进 `fail()`**（**计算照做**，只是不记红因 ⇒
  卸一条判据不连带关掉别条）、补 **门禁 0**（收集产物文件 + 查 macOS 资源叉）与 **门禁 33「逐比较点
  覆盖度自证」**（**34 个比较点静态登记 + 逐一记账** ⇒ 任何一整块判据被摘掉都会被抓到）。
  第十四批（2026-10-22 D61 场次）给 `check-identity-handles` 补上**最后一道**常驻自测
  `scripts/test-identity-handles.cjs`（**37 档注入矩阵 + 30 档判据级负对照**，跑在**自造的最小夹具站**上）。
  ⚠️ 本批**如实记下一处偏差**：该门禁的判据**一条编号都没有**，而门禁本体**被并发场次占用、本轮不得触碰**
  ⇒ 编号化与可卸开关本轮做不了 ⇒ 改用两个**等价替代**：① 红因归属用**判据文案片段集合**（每条判据登记
  一个**互不包含**的唯一文案片段，断言命中集合**恰为**期望集合 ⇒ 多一条少一条都算失败）；
  ② 判据级负对照用**门禁副本里卸判据**（守卫条件**同行替换为永假**，行数不变、逐行比对只差一行 ⇒
  证明卸的是这一条、不是把门禁整个关掉）⇒ **D59 缺陷线收尾**，13 道门禁全部有 `test-*` 配对。
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

- **D46**（本轮修的是缺陷 **D48**）：这一轮撞上的是**「同一张图，两处写法」** —— 前几个
  场次（D42 / D43 / D44 / D45）守的是「有没有」与「够不够看得见」，这一轮问的是
  **「同一件事，两处做得一样吗」**。
  ① **实测（坐实缺陷）**：作者肖像有两处出口 —— 首页 `hero.njk` 与关于页 `about.njk` ——
     两处是**同一张图**（`site.author.photo.portrait`）、**同一个角色**（首屏 hero 肖像）。
     产物实测：首页那张 `<img class="home-portrait__img">` 带 `loading="eager"` +
     `fetchpriority="high"`；关于页那张 `<img class="about-hero__photo">` **两个属性都没有**
     ⇒ 同一张图、同一个角色、**两种加载策略**（关于页那张按浏览器默认优先级加载）。
  ② **为什么这不是「文档笔误」**：全仓**四处**都写着关于页肖像有这两个属性 ——
     `hero.njk` 的注释（「照片是首屏 LCP 候选：…loading="eager" + fetchpriority="high"」）、
     `publications.njk` 的注释（「本页 LCP 是 hero 人像（eager + fetchpriority=high）」）、
     `check-img-srcset.cjs` 的文件头（「本站这两张肖像带 loading="eager" + fetchpriority="high"
     ⇒ 它们就是 LCP 元素」）、缺陷清单 §2「图片」行 ⇒ **是产物没跟上约定**，不是文档写错。
  ③ **实测坐实「没人看守」**：把产物退回修前形态后，跑 build 链里 `eleventy` 之后的
     **全部 55 道产物侧门禁** ⇒ **53 道 exit 0**，**没有任何一道**报告这张图缺加载策略；
     唯一判红的两道正是本轮新加的门禁与它的自测（自测的 IS0 基线就是真实产物 ⇒ 基线直接红）。
  ④ **修法（只改一处构造层）**：`src/about.njk` 的肖像补 `loading="eager"` +
     `fetchpriority="high"`（与首页人像**同款**写法与属性顺序）；产物差异**仅限**那两行，
     其余 5 张 `<img>`、全部页面文字与全部 CSS **逐字节未变**。
  ⑤ **新门禁** `scripts/check-img-loading.cjs`（判据 **IL1–IL6**，零第三方依赖、**自带**
     HTML 标签扫描器而不 import 被检查方代码）：**IL1** 每张真实 `<img>` 必须显式声明
     `loading` 且取值只能是 `eager` / `lazy`（不写 = 落回浏览器默认的 eager；写错取值
     浏览器**静默忽略**整条声明）/ **IL2** `loading="eager"` 必须配 `fetchpriority="high"`
     （eager = 优先图，优先级必须显式给出）/ **IL3** `fetchpriority="high"` 必须配
     `loading="eager"`（两个属性**成对**，`high` 配 `lazy` 自相矛盾）/ **IL4**
     `fetchpriority` 取值只能是 `high` / `low` / `auto`（拼错被静默忽略）/ **IL5**
     覆盖度自证（**计数放在判定开关之外**）/ **IL6** 门禁自己没被卸掉。
  ⑥ **自测** `scripts/test-img-loading.cjs`（**IS0–IS16** 十七档，接在 build 链）：每条判据
     各有一档注入 + **6 档判据级负对照** + **红因归属纯净性断言**（每档红只许出现自己那条
     判据的编号 —— 同源缺陷会让「红因归属」不可判定）+ **2 档故意判绿**（`lazy` +
     `fetchpriority="low"` 是合法组合；新增一张合法的 lazy 图）+ 覆盖度负对照 + 扫描器 tricky 档。
     夹具站只用真实产物里的 **HTML**（本门禁只读属性、不查图片文件）⇒ 夹具很轻。
  ⑦ ⚠️ **本轮不代拍、也不新增待拍板**：加载策略是**浏览器语义**上的对错
     （`eager`/`lazy`/`high` 的组合有明确规范含义），不是审美或性能取舍。
     本门禁只判**声明**，不判浏览器实际挑哪个 `srcset` 候选、也不判「哪个元素真的是 LCP」
     —— 那些属**浏览器级判据**（见 D10 待拍板 42）。

- **D47**（本轮修的是缺陷 **D49**）：这一轮撞上的是**「真源里有几个意思」** —— 前几个场次
  （D42 / D43 / D44 / D45 / D46）守的都是**产物侧**的「有没有」「够不够看得见」「两处一不一样」，
  这一轮第一次回头去核**真源本身**：「数据源里这个字段，真的有人用吗？」
  ① **本轮路线**：缺陷清单里仍是「待修」的 9 条（D2 / D3 / D5 / D6 / D9 / D10 / D12 / D26 / D32）
     **全部卡在拍板项上**（D2/D3→待拍板 40；D5→需本人定选题主线；D6→push 触发；D9→待拍板 41；
     D10→待拍板 42；D12→待拍板 43；D26→视觉取舍；D32→待拍板 49+7）⇒ 按规矩**不代拍**，
     改走**新缺陷普查**路线。两批普查（第一批 9 类形态、第二批 27 条命中）逐一甄别后**全是误报**
     （SVG 可访问性、markdown 链接锚点、模板占位符、历史归档），**空跑的判据禁做**；
     真正坐实的是这一条。
  ② **实测（坐实缺陷）**：`src/_data/site.js` 的 `author.photo` 段并列着**两组**照片 ——
     `portrait` / `portraitSmall` / `portraitSize`（600×750 竖版）与 `avatar` / `avatarSmall` /
     `avatarSize`（600×600 方形）。而 `avatar` / `avatarSmall` **全仓零消费点**：模板
     （`about.njk`、`hero.njk`）、`srcset` / `sizes`、Person JSON-LD（`base.njk`）**一律用 `portrait`**。
     真源自己的注释就写着「照片（首页人像卡 / 关于页 / Person JSON-LD 共用）」⇒ 这是
     **「改过名（avatar → portrait）没删干净」的遗留**，不是两套有意保留的照片。
     且两个死文件（`avatar.jpg` 48,062 B + `avatar-sm.jpg` 16,803 B = **64,865 B**）仍在源目录里，
     被 `eleventy.config.js` 的 `assetGlobs` **原样拷进产物** ⇒ 访客下载得到，却没有任何页面引用。
  ③ **修法（构造层 + 删文件，不动模板与样式）**：`site.js` 删掉 3 个死键（并加注释写明来历与
     缺陷号）；`mavis-trash` 删掉两个源文件（产物靠 passthrough glob 自动跟随，无需改 glob）；
     `portrait` 一组、全部模板、全部 CSS、全部 JSON-LD **一个字不动**。
  ④ **新门禁** `scripts/check-author-assets.cjs`（判据 **AV1–AV6**，零第三方依赖、**自带**
     注释遮罩器而不 import 被检查方代码）：**AV1** 每个「值是图片路径」的资产键都必须有
     **真实消费点**（**先剥注释**再匹配 ⇒ 注释里提到不算；并排除真源自身 / 门禁自身 / 自测自身，
     否则「写一句就算用」）/ **AV2** 键指向的源文件必须存在 / **AV3** 源目录每个文件都必须被引用 /
     **AV4** 产物的文件集合与引用集合**完全一致**（「少了」只在**源文件确实存在**时才判，与 AV2
     解耦）/ **AV5** 覆盖度自证（**下限取 1** —— 取大会与其它判据**耦合**，红因归属就不可判定）/
     **AV6** 门禁自己没被卸掉。
  ⑤ **自测** `scripts/test-author-assets.cjs`（**AT0–AT15** 十六档，接在 build 链）：每条判据
     各有一档注入 + **6 档判据级负对照** + **红因归属纯净性断言** + **1 档故意判绿**（删掉非资产键
     `alt` 不该判红）+ **1 档注释剥离档**（消费点只写在 `{# #}` 里必须判红）+ **1 档覆盖度档**
     （真源 / 源目录 / 产物目录**全空**形态 ⇒ 只红 AV5）。
  ⑥ **实测坐实「没人看守」**：修前形态下跑本门禁 ⇒ **AV1 判红 2 处**，红因逐个点名
     `avatar` / `avatarSmall`「全仓找不到消费点」；**半修形态**（键已删、两个旧文件还在源目录与
     产物里 ⇒ 正是「只删键忘删文件」的手滑形态）⇒ **AV3 判红 2 处 + AV4 判红 2 处**。
  ⑦ **产物核对**：把修前形态整棵树在 `/tmp` 单独重建（**带 `.git` 软链** —— 否则
     `dateModified` / `lastmod` 这类 git 派生字段口径不一致会造成假差异）后逐文件 SHA-256 比对
     **49 个 vs 47 个文件** ⇒ **只有两个旧头像文件消失**，其余 **45 个逐字节相同**，仅
     `feed.xml`（`lastBuildDate`）与 `robots.txt`（生成时刻）差构建时间戳；
     站点总字节 **2,335,357 → 2,270,492（−64,865 B）**。
  ⑧ ⚠️ **本轮不代拍、也不新增待拍板**：死字段与死文件是**客观事实**，不涉及审美取舍，
     也不改任何发布决策。

- **D48**（本轮修的是缺陷 **D50**）：这一轮撞上的是**「产物里多出来的文件」** —— 前几个场次
  （D42–D47）守的是**该有的有没有**（订阅源显示名、链接 `rel`、焦点环对比度、肖像加载、
  作者照片真源），这一轮反过来核**「不该有的还在不在」**。
  ① **本轮路线**：缺陷清单里仍是「待修」的 9 条（D2 / D3 / D5 / D6 / D9 / D10 / D12 / D26 / D32）
     **全部卡在拍板项上**（D2/D3→待拍板 40；D5→需本人定选题主线；D6→push 触发；D9→待拍板 41；
     D10→待拍板 42；D12→待拍板 43；D26→视觉取舍；D32→待拍板 49+7）⇒ 按规矩**不代拍**，
     改走**新缺陷普查**路线。按资源族逐个过：JS 家族与 img 家族全干净；`src/content/**`、
     `src/_data/**` 无死文件；`src/assets/fonts/**/*` 是**空 glob**（字体已改走 Google Fonts CDN，
     glob 永不匹配，价值过小）；og 图族撞待拍板 40；`theme-toggle.njk` 是**有意保留**的
     （文件头注释写明「留作未来复用」）⇒ 都不是缺陷。真正坐实的是 CSS 家族这一条。
  ② **实测（坐实缺陷）**：`eleventy.config.js` 的 `assetGlobs` 里有 `src/assets/css/*.css` 与
     `src/assets/css/components/*.css` 两条**通配** ⇒ 源目录里 15 个 CSS **原样直拷**进产物
     `_site/assets/css/`（16 个文件，含合成的 `components.css`）。但**全产物引用扫描**显示：
     **16 个产物 CSS 里只有 5 个被引用**（`pages.css` / `layout.css` / `components.css` /
     `a11y.css` / `print.css`）⇒ **4 个副本无人引用**：`tokens.css` 8,164 B + `base.css` 6,448 B
     + `paper-reader.css` 14,003 B —— 它们的**唯一消费路径**是模板里的 `{% inlineCss %}`
     （内联进 HTML 省一次往返），独立副本纯属通配的副作用；`components/index.css` 232 B ——
     partial 顺序的**书面声明**，浏览器从不加载它（dev 模式的 hub 是钩子生成的 `components.css`，
     它的 `@import` 按相对路径 `./components/_xxx.css` 指向分片，**不是**指向本文件）。
     合计 **28,847 B** 访客下载得到却没人请求。而**零门禁看守**：45 道门禁里没有一道核
     「某个源样式的产物副本有没有人引用」；更麻烦的是**「通配直拷」这个写法本身会持续制造
     新的死副本**。
  ③ **修法（只动构建清单与门禁，不动模板与样式）**：`assetGlobs` 的两条通配换成**显式发布清单**
     —— 四条顶层样式逐个列出（`layout.css` / `pages.css` / `a11y.css` / `print.css`）+
     一条 partial 通配 `src/assets/css/components/_*.css`（用 `_*` 既排除 `index.css`，
     又让新增 partial 自动纳入）；模板、CSS 内容、JSON-LD **一个字不动**。
  ④ **新门禁** `scripts/check-css-publish.cjs`（判据 **CS1–CS7**，零第三方依赖、**自带**
     注释遮罩器而不 import 被检查方代码）：**CS1** **角色穷尽**（源 `src/assets/css/**` 下每个
     `.css` 必须归入内联 / 外链 / partial / 顺序声明四类之一；**先剥 Nunjucks / HTML 注释**
     再匹配 ⇒ 注释里的一句「见 xxx.css」不算引用）/ **CS2** **死副本**（只内联未外链的样式 +
     顺序声明不许进产物）/ **CS3** **漏拷**（被 `<link>` 引用的 + partial 必须进产物）/
     **CS4** **孤儿**（产物里的 CSS 必须有源）/ **CS5** **顺序真源不分叉**（磁盘 partial 清单 ≡
     `components/index.css` 的 `@import` 清单 ≡ `eleventy.config.js` 的 `order` 数组，三者必须
     **集合相同且同序** —— DC3 只管集合，顺序没人管，渲染层级会悄悄变）/ **CS6** **覆盖度自证**
     （四类角色各至少认出一处；**下限取 1** —— 取大会与其它判据**耦合**，红因归属就不可判定）/
     **CS7** **门禁自己没被卸掉**。
  ⑤ **既有门禁的连带改造**：`check-css-comment-weight.cjs` 的 **CQ3「源有产物没有」改成角色感知**
     （不在「本来就不发布」集合（被内联的 + `components/index.css`）之外才判红；
     **CQ3a / CQ3b / CQ3c / CQ3n 四档语义与红因归属保持不变**）；两个自测里硬编码的产物文件名
     （`base.css`）换成 `pages.css` —— 它不再作为独立副本发布。
  ⑥ **自测** `scripts/test-css-publish.cjs`（**CU0–CU18** 共 19 档，接在 build 链）：11 档注入 +
     **7 档判据级负对照** + **红因归属纯净性断言**（每档红只许出现自己那一条判据的编号，
     多一条少一条都算失败）+ 覆盖度档；夹具是**自造的最小站**（不依赖真 `_site`，
     免得自测跟着 build 抖）。
  ⑦ **实测坐实「没人看守」**：修前形态（`assetGlobs` 还原成两条通配）跑本门禁 ⇒
     **CS2 精确判红 4 处**，红因逐个点名 `base.css` / `components/index.css` /
     `paper-reader.css` / `tokens.css`「没人引用的副本」。
  ⑧ **产物核对**：产物 CSS 从 **16 个降到 12 个**（**只少这 4 个**；其余 11 个与源**逐字相等**，
     由 CQ 门禁逐文件证明），站点总字节 **2,270,492 → 2,241,645（−28,847 B）**；
     双次 build 交叉只差 `feed.xml`（`lastBuildDate`）与 `robots.txt`（生成时刻）；侧车 count = 0。
  ⑨ ⚠️ **本轮不代拍、也不新增待拍板**：死副本是**客观事实**，不涉及审美取舍，
     也不改任何发布决策。

- **D49**（本轮修的是缺陷 **D51**）：这一轮是**上一轮（D48）自己造出来的缺陷** ——
  D48 把「产物里多出来的文件」这类问题立成了门禁 CS1–CS7，却把 **dev 的需求写成了 prod 的义务**。
  ① **本轮路线**：缺陷清单里仍是「待修」的 11 条（D2 / D3 / D5 / D6 / D9 / D10 / D12 / D15 /
     D26 / D32 与 D4/D11/D13…）**全部卡在拍板项上**（D2/D3→待拍板 40；D5→需本人定选题主线；
     D6→push 触发；D9→待拍板 41；D10→待拍板 42；D12→待拍板 43；D15→待拍板 46；
     D26→视觉取舍；D32→待拍板 49+7）⇒ 按规矩**不代拍**，改走**新缺陷普查**路线。
     普查按资源族过：JS 家族**零死模块**、`site.js` **零死键**、`src/content/**` 与
     `src/_data/**` 无死文件、sitemap `lastmod` 全同属**闭包口径**（不是缺陷）、
     og PNG 已是 8-bit colorType 2（无位深空间）、og 体积属**待拍板 40**、
     `package-lock.json` 的 `engines` 与 `package.json` 有漂移但 `npm ci` exit 0（卫生问题，
     留作下轮候选）⇒ 真正坐实的是 CSS 家族。
  ② **实测（坐实缺陷）**：修前 `_site/assets/css/components/` 下有 **7 个 `_*.css` partial 副本**
     合计 **40,881 B**（源文件合计 73,336 B，产物侧被 `stripProductCssComments` 剥过注释），
     而**全产物引用扫描显示零个页面引用它们**。根因有两层：
     **构造层**是 `assetGlobs` 里的 partial 通配把 7 个分片照直拷进产物；
     **判据层**是 D50 新立的 **CS3（partial 必须进产物）写成了无条件义务** ——
     而 partial 只有 dev 需要（dev 的 `components.css` 是 `@import` hub，
     浏览器按 `./components/_xxx.css` 相对路径去拉分片；**prod 的 `components.css` 是 7 个 partial
     顺序拼接后的单文件**，分片本身没人请求）。**CS2（死副本）当时也没抓住**，
     因为 partial 被排除在「不发布类」之外 ⇒ 7 份死副本从门禁缝里漏了过去。
  ③ **修法（只动构建清单与门禁，不动模板与样式）**：`assetGlobs` 去掉 partial 通配，
     改成 `if (isDevServer) { eleventyConfig.addPassthroughCopy("src/assets/css/components/_*.css"); }`
     （`isDevServer` / `isProductionBuild` 从钩子附近**上提到 `module.exports` 开头**，
     早于任何发布清单求值）⇒ **prod 不发布 partial、dev 照旧直拷**。
     CSS 内容、模板、JSON-LD **一个字不动**。
  ④ **门禁改成模式感知** `scripts/check-css-publish.cjs`（判据 **CS1–CS8**）：
     **模式从产物自身判** —— 读 `_site/assets/css/components.css`，含 `@import url(` ⇒ **dev**，
     否则 ⇒ **prod**（**不引入 env var、不解析 `assetGlobs`、不读 `process.argv`**
     ⇒ 判据取值范围与被检查方实际行为同源）。
     **CS2 / CS3 方向单一**：prod 时 partial 归「不发布类」（CS2 拦），dev 时归「发布类」（CS3 拦）。
     **新增 CS8**：产物缺 `components.css` ⇒ 判红 —— 模式判不出时 CS2/CS3 失去依据，
     这条原先**无人看守**。**CS1 / CS4 / CS5 / CS6 / CS7 语义不变**。
  ⑤ **既有门禁的连带改造**：`check-css-comment-weight.cjs` 的 `NOT_PUBLISHED` 集合
     **静态加入磁盘上的 `components/_*.css`**（CQ3(c) 才不会把「源有产物没有」误判成缺陷）
     ⇒ **CQ 门禁保持 prod-only**（CQ2 要求 `components.css` 逐字含每个 partial，
     只有 concat 形态成立）。
  ⑥ **自测** `scripts/test-css-publish.cjs`（**CU0–CU21** 共 23 档）：夹具从单模改成**双模**
     （`makeSandbox("prod")` 产物无 partial / `makeSandbox("dev")` 产物有两个 partial 且
     `components.css` 是 `@import` hub）；新增 **CU0b**（dev 基线 + 模式自证断言）、
     **CU19**（prod 夹具塞 partial 副本 ⇒ CS2）、**CU20**（prod 夹具删 `components.css` ⇒ CS8）、
     **CU21**（卸掉 `CS8_ON` ⇒ CU20 转绿）；**CU9** 改用 dev 夹具；**每档断言红因编号集合完全相等**。
  ⑦ **实测坐实「没人看守」**：把修前形态（当前 `_site` + 7 个源文件原样 partial）放 `/tmp` 副本
     ⇒ 门禁 **exit 1 且 CS2 精确判红 7 处**（逐个点名分片）、**只有 CS2 一条**
     （红因归属纯净）。
  ⑧ **产物核对**：prod 产物 **43 → 36 个文件**，逐文件 SHA-256 比对 ⇒
     **恰好只有 7 个 partial 消失**，其余**逐字节相同**（仅 `feed.xml` 的 `lastBuildDate` 与
     `robots.txt` 生成时刻差构建时间戳）；站点总字节 **2,241,645 → 2,200,764（−40,881 B）**。
     **dev 侧另行实测**：`npx eleventy --serve` ⇒ dev 产物落在 `_site_dev/`（不是 `_site/`），
     `_site_dev/assets/css/components/` 下 **7 个分片齐全**、`components.css` 是 `@import` hub；
     `SITE_DIR=_site_dev node scripts/check-css-publish.cjs` exit 0 且判为 dev。
  ⑨ ⚠️ **本轮不代拍、也不新增待拍板**：「prod 不发布 partial、dev 仍发布」是**客观事实**，
     `docs/design-system.md` §6.0 的 dev/prod 双模表由 DC4 强制 ⇒ **双模是契约**，
     本轮只让契约的 prod 那半边落地，**没有改契约**。

- **D50**（本轮修的是缺陷 **D52**）：这一轮是**上一轮（D49）把同一根因在另一个资源族上又踩了一次** ——
  D49 修掉的是 CSS 死副本，根因写得很清楚：「**通配直拷**把设计源 / 构建输入一起当成了发布物」。
  ① **本轮路线**：缺陷清单里仍是「待修」的 11 条（D2 / D3 / D5 / D6 / D9 / D10 / D12 / D15 /
     D26 / D32）**全部卡在拍板项上**（D2/D3→待拍板 40；D5→需本人定选题主线；D6→push 触发；
     D9→待拍板 41；D10→待拍板 42；D12→待拍板 43；D15→待拍板 46；D26→视觉取舍；D32→待拍板 49+7）
     ⇒ 按规矩**不代拍**，改走**新缺陷普查**路线。
  ② **普查（按资源族过）**：JS 家族零死模块、`site.js` 零死键、`src/content/**` 与 `src/_data/**`
     无死文件、sitemap `lastmod` 全同属**闭包口径**、og PNG 已是 8-bit colorType 2（无位深空间）、
     og 体积属**待拍板 40**、`package-lock.json` 的 `engines` 与 `package.json` 有漂移但
     `npm ci` exit 0（卫生问题，留作下轮候选）⇒ **图片家族**是唯一坐实的。
  ③ **实测（坐实缺陷）**：`src/assets/**` 下共 **10 个图片资源**，剥注释后逐个扫消费点 ⇒
     **恰好 3 个零消费点**：`src/assets/img/og/og-1080x1080.svg`（5,190 B）/
     `og-1200x630.svg`（7,143 B）/ `og-1500x500.svg`（5,722 B），合计 **18,055 B**；
     其余 7 个都有真实消费点（favicon ← `base.njk:103`；两张作者肖像 ← `site.js:336/337`；
     三张 og PNG ← `base.njk:292/293/299/300/331/482` 与 `site.js:146`；
     `trmm-fig10.jpg` ← `site.js:732`）。这 3 份是**分享图 PNG 的设计母版**
     （`docs/og-image-and-a11y-report.md` 记着 SVG → PNG 的转换），站内发布的是 PNG、
     三处 `og:image:type` 全是 `image/png` ⇒ 母版**没有任何页面请求**，
     却被 `assetGlobs` 的通配**照直拷进产物**。
  ④ **零门禁看守**：`check-image-assets.cjs`（IA1–IA7）只管「**声明了的那条**分享图对不对 /
     声明在不在」，**不看产物里多出来的副本**；`check-author-assets.cjs`（AV1–AV6）只管
     `src/assets/img/author/` 一个目录；`check-img-srcset.cjs` 只管 `srcset` 候选；
     `verify-site.cjs` 的通用引用正则只核「被引用的目标存在」、**不核「有没有多出来的」**
     ⇒ og 目录的死副本**零看守**。
  ⑤ **修法（只动构建清单与门禁，不删源文件）**：`assetGlobs` 的 img 通配去掉 `svg`
     （改为 `src/assets/img/**/*.{png,jpg,jpeg,webp}`）⇒ 母版**留在源里**（还要靠它再生成 PNG），
     只是**不发布**；`src/assets/*.svg`（favicon，仍被 `base.njk:103` 引用）照旧发布。
     ⚠️ 这与 D49 删死头像文件**不同** —— 那两个文件是**真死**（没人用、也不用再生成），
     这三个是**设计母版**（没人用、但还要用）⇒ 只停发布、不删源。
  ⑥ **新门禁** `scripts/check-img-publish.cjs`（判据 **IP1–IP5**，零第三方依赖、**自带**
     JS 注释遮罩器（保留字符串字面量）与 Nunjucks / HTML 注释遮罩器而不 import 被检查方代码）：
     **IP1** 源侧**没人引用**的源图出现在产物里 ⇒ 判红（**走源侧**枚举，与 IP3 分工 ⇒
     同一处缺陷只红一条，红因归属可判定）/ **IP2** 源侧**被引用**的源图没进产物 ⇒ 判红
     （页面拿它当 `<img src>` 直接 404）/ **IP3** 产物里出现源目录已无的图 ⇒ 判红（孤儿）/
     **IP4** 覆盖度自证（**下限取 1**，避免与其它判据耦合；「无引用的源图」**不设下限** ⇒
     母版将来被删也不该凭空判红）/ **IP5** 门禁自己没被卸掉。
     **消费点口径**：源侧 = `src/**` 剥注释后按**文件名词边界**匹配；**不扫** `scripts/`
     （门禁与自测是检查者，不是使用者）、**不扫** `docs/`（文档不是消费点）、
     **不扫** `eleventy.config.js`（构建清单是**发布方**，不是使用方）。
  ⑦ **自测** `scripts/test-img-publish.cjs`（**IU0–IU10** 共 11 档）：造**最小夹具站**
     （三张源图：两张被引用、一张是设计母版；产物只含被引用的两张）⇒ 基线绿；
     注入档覆盖「母版副本进产物 / 漏拷 / 孤儿 / 删掉引用点 / 检测器全瞎 / 门禁被卸掉」六种形态；
     **3 档判据级负对照**（分别卸掉 IP1–IP3 判定后对应注入必须转绿 —— 其中卸 IP3 那档同时证明
     **IP1 没有越界去管孤儿**）；**每档断言红因编号集合完全相等**；收尾校验门禁原件 SHA-256 未变。
     ⚠️ 档位设计里有一处**同源耦合**要小心：引用检测器全瞎时 IP1 与 IP4 会**同时**触发
     ⇒ IU5 的夹具**同时清空产物**，把这一档压成「只红 IP4」。
  ⑧ **实测坐实「没人看守」**：修前形态产物 ⇒ 门禁 **exit 1 且 IP1 精确判红 3 处**
     （逐个点名三份母版）、**只有 IP1 一条**（红因归属纯净）。
  ⑨ **产物核对**：prod 产物 **36 → 33 个文件**，逐文件 SHA-256 比对 ⇒
     **恰好只有 3 个 og SVG 消失**，其余**逐字节相同**（仅 `feed.xml` 的 `lastBuildDate` 与
     `robots.txt` 生成时刻差）；站点总字节 **2,200,764 → 2,182,709（−18,055 B）**；
     `_site` 侧车 count = 0；dev 侧 `_site_dev/assets/img/og/` **只剩三张 PNG**
     （母版不发布对 dev 同样成立 —— dev 产物里它们同样没人请求）。
  ⑩ ⚠️ **本轮不代拍、也不新增待拍板**：与待拍板 40（og 图口径与体积）**正交** ——
     无论 40 拍成「只留一张 og 图」还是「三张都留但换 JPEG / 压缩」，
     「SVG 设计母版不进产物」都成立 ⇒ 不因 40 阻塞本轮。

- **D51**（本轮修的是缺陷 **D53**）：这一轮**不再看资源清单**，改看**「脚本查的东西在不在」** ——
  前两轮（D49 / D50）都在清「产物里多出来的死副本」，本轮清的是**反过来那一类**：
  **站内脚本查询的目标 DOM 在产物里根本不存在**。
  ① **本轮路线**：缺陷清单里仍是「待修」的 9 条（D2 / D3 / D5 / D6 / D9 / D10 / D12 / D26 / D32）
     **全部卡在拍板项上**（D2/D3→待拍板 40；D5→需本人定选题主线；D6→push 触发（待拍板 7 + 49）；
     D9→待拍板 41；D10→待拍板 42；D12→待拍板 43；D26→视觉取舍；D32→待拍板 49）
     ⇒ 按规矩**不代拍**，改走**新缺陷普查**路线。
  ② **普查（每一族都要有真实命中才准立项）**：JS 死模块（源侧都有消费点）、
     `site.js` 死键、`src/content/**` 与 `src/_data/**` 死条目、产物全清单引用审计（33 文件无孤儿）、
     内部链接图、URL 四份构造一致性、语言族、feed.xml 规范、`print.css` 加载方式、
     `copyCovers()` 空跑、`_archive/meteohub-legacy/`（刻意归档）、`deploy.yml` 无 `npm ci`
     ⇒ **唯一有真实命中**的是「站内 JS 查询的目标 DOM 在产物里不存在」这一族。
  ③ **实测（坐实缺陷）**：① `src/assets/js/nav.js`（840 B）唯二操作的 `[data-nav-toggle]` 与
     `.nav` 在**全部 6 个产物页面里 0 处**（站点导航早已改成 `topbar`），却被 `main.js`
     **无条件** `import`；② `src/assets/js/paper-reader/reading-progress.js`（1,225 B）的
     `init()` 第一件事就是 `querySelector("[data-reading-progress]")`，找不到就 return
     （`paper.njk` 没有该元素），却被 `paper-reader/main.js` 的 `Promise.all` **无条件**动态 import；
     ③ `main.js` 里填年份的 `[data-year]` 是死代码（`footer.njk` 用构建期 `{{ buildYear }}`），
     且其上方注释「Current year in footer」**说假话**；④ 连带死样式：`_nav.css` 里 `.nav` /
     `.nav__link` 一族共 **5 条**规则，而文件头注释写着「`.nav`/`.nav__link`/`.theme-toggle` 是
     nav.js 的结构契约……不能删」⇒ **注释说假话**（`.theme-toggle` 一族**必须保留**：
     `data-theme-toggle` 在 6 个产物页里都存在）；⑤ **零门禁看守**（`check-site-js.cjs` 只判语法与
     模块说明符闭合，`check-dead-css.cjs` 只扫 `pages.css`，IP1 抓不到 —— 它们**有**引用点，
     只是引用点指向不存在的元素）。
  ④ **修法（只删空转代码 + 清假注释，不改任何设计）**：`mavis-trash` 删掉 `nav.js` 与
     `reading-progress.js`；`main.js` 去掉 `import "./nav.js"` 与 `[data-year]` 死代码块；
     `paper-reader/main.js` 的 `Promise.all` 改成 `[tocMod, themeMod]`、去掉 `reading-progress`
     的 import 与 `init` 调用；`paper.njk` 与 `eleventy.config.js` 里「6 个 ESM 子模块」
     同步订正为 5 个；`_nav.css` 删掉那 5 条死规则并改写文件头注释（写明原注释是假的、
     `.theme-toggle` 为何必须保留）；`print.css` 的隐藏清单去掉 `.reading-progress`
     （该功能已整体移除）、说明文字同步。**不动 `.theme-toggle` 一族、不动任何样式设计。**
  ⑤ **新门禁** `scripts/check-js-targets.cjs`（判据 **JA1–JA4**，零第三方依赖、**自带**
     JS 注释遮罩器而不 import 被检查方代码）：
     **JA1** 站内 JS 里选择器 API 的**字面量**参数，按 **CSS 语义逐层判定** ——
     选择器列表按顶层逗号拆**分支**（分支间「或」）、分支内 token 间「与」、
     伪类 / 伪元素 / 标签名**不产生约束**；token 若既不在产物 HTML 里（class 精确匹配 /
     属性名小写匹配 / id 匹配），也不在站内脚本**运行时创建**清单里
     （`classList.add|remove|toggle` / `.className=` / `setAttribute("class",…)` / `{ class: … }` /
     HTML 字符串 `class="…"` / `.id=` / `setAttribute("id",…)` / `{ id: … }` / `dataset:{…}`）
     ⇒ 判红；**JA2** 覆盖度自证（**下限取 1**，不与其它判据耦合）；
     **JA3** 门禁自己没被卸掉；**JA4** 逐模块提取自证（有选择器 API 调用却提取不到目标 ⇒ 判红
     ⇒ 要求把选择器显式化成字面量或 const 绑定的字面量；全仓唯一一处 const 绑定
     `home-chart.js` 的 `PANEL_SELECTOR` 由门禁的 `stringBindings()` 解出）。
     **不设豁免机制** —— `theme.js` 的 `[data-theme-toggle]` 真实存在，
     `paper-toc` / `annot-*` 由站内脚本运行时创建 ⇒ 无需豁免。
  ⑥ **自测** `scripts/test-js-targets.cjs`（**JB0–JB14** 共 18 档）：造**最小夹具站**
     （夹具里所有 `data-*` 一律用**无值**写法、全部 `fixture-*` 命名 ⇒ 门禁与自测源码自己
     不会成为消费点）；五档注入（缺类名 / 缺属性名 / 缺 id / const 绑定指向缺失 /
     抽掉运行时创建）⇒ **JA1**；选择器列表任一分支可达 ⇒ 绿；门禁被卸掉 ⇒ **JA3**；
     所有脚本都不查 DOM ⇒ **JA2**；只用动态选择器的模块 ⇒ **JA4**；
     **四档判据级负对照**（分别卸掉 JA1–JA4 后对应注入必须**完全转绿**）；
     **每档断言红因编号集合完全相等**；收尾校验门禁原件 SHA-256 未变。
  ⑦ **既有自测的连带改造**：`scripts/test-site-js.cjs` 的夹具原本用 `nav.js`
     ⇒ 删文件后 **6 档**失败（ENOENT / 「没找到 main.js 的 nav.js 导入行」）⇒ 改用
     `theme.js` 与 `fixture-missing.js`，**判据一个字没动**。
  ⑧ **实测坐实「没人看守」**：把修前形态的 `src/assets/js`（`git archive deca9a9`）放进
     `/tmp` 副本 + 当前 `_site` ⇒ 门禁 **exit 1 且 JA1 精确判红 7 处、只有 JA1 一条**
     （红因归属纯净；无 JA2 / JA3 / JA4）⇒ 7 条逐条点名 D53 的三处空转。
  ⑨ **产物核对**：prod 产物 **33 → 31 个文件**，逐文件 SHA-256 比对 ⇒ **恰好只有 6 个文件变化**
     （`nav.js` 消失 −840 / `reading-progress.js` 消失 −1,225 / `main.js` −502 /
     `paper-reader/main.js` −129 / `components.css` −778 / `print.css` −21），
     其余**逐字节相同**（仅 `feed.xml` 的 `lastBuildDate` 与 `robots.txt` 生成时刻差）；
     站点总字节 **2,182,709 → 2,179,214（−3,495 B）**；`_site` 侧车 count = 0；
     **全部 HTML 文件逐字节相同**（本轮只动脚本与样式，不碰任何 HTML）。
     ⚠️ **提交后再重建**另有 2 处差异：论文页与 sitemap 里该页的 `dateModified` / `<lastmod>`
     变成 **012bec5** 的提交时间（2026-10-21T20:16:21Z）—— 那是 **D34** 的
     「**依赖闭包里最晚的提交时间**」口径（论文页闭包含本轮改动的 `paper.njk`），
     而**另 4 页的 lastmod 保持不变** ⇒ 闭包口径按页面粒度生效，**不是回归**。
  ⑩ ⚠️ **本轮新增待拍板 52**：论文阅读进度条这个功能**到底要不要**（要 ⇒ 补 `paper.njk` 的元素
     + CSS + 恢复模块 + 补回 `print.css` 的隐藏规则；不要 ⇒ 到此为止）。
     本轮按「删空转死代码」处理，因为**空转本身不需要任何人拍板**；
     但「**要不要这个功能**」是设计取舍 ⇒ 登记为待拍板 52，**不代拍**。
- **D52**（本轮修的是缺陷 **D54**）：这一轮**不看构建清单**，改看**「样式表里定义了、页面上永远不会有」的元素** ——
  上一场（D51）撞的是「站内 JS 在查产物里根本不存在的 DOM」，这一场撞上的是同一族的另一半：
  **CSS 里定义了、页面上永远不会有**的元素。
  ① **为什么走普查**：清单里 9 条待修缺陷**全部卡在拍板**上（D2 / D3 / D5 / D6 / D9 / D10 /
     D12 / D26 / D32）⇒ 按规矩改走新缺陷普查。普查一族族过下来，唯一有**真实命中**的是
     「死 CSS」这一族 ⇒ 立 **D54**。
  ② **普查事实（零看守）**：`scripts/check-dead-css.cjs` 的样式表清单里**只列了
     `src/assets/css/pages.css` 一张**，而全站样式表**不止这一张** ⇒ 其余样式表里的死类
     **没有任何一道门禁会报告**；而且这道门禁**零自测**（`scripts/` 下没有配套自测）⇒
     「它能不能变红」从来没被证明过。
  ③ **判据本身有假豁免**：落点判定用的是**子串**匹配 —— `--text-muted` 里的 `text-mut`
     被当成 `.text-mut` 的落点、`--color-brand-50` 里的 `brand` 被当成 `.brand` 的落点
     ⇒ 那些类是**靠巧合豁免**的，不是靠判定豁免的。
  ④ **真死类的规模**：普查全站样式表得 58 个候选，逐条溯源（`git log -S` 查首次引入 +
     查模板与脚本的真实引用）后确认 **53 个真死类 + 1 个死属性选择器**；其中
     `.paper-tabs` / `.tab-panel` / `.paper-header` / `.status--finished` / `.crumbs` /
     `.page-header` **自首次接入 Eleventy 起就只进 CSS、模板从未引用过**。
  ⑤ **登记表机制**（静态扫证明不了的类必须显式登记）：一类是 **JS 运行时创建**的
     （`classList.add` / `.className=` 那批），一类是**保留待拍板**的（批注层那三个类，
     挂在待拍板 43 上）。⇒ 登记**具体类名**而非前缀（登记 `badge--` 会把真死类
     `badge--danger` / `badge--filled-brand` 一起放过）；`dynamic` 项要写明
     **构造点文件 + 前缀字面量 + 取值字面量**，`held` 项必须在**定义它的那张样式表的注释里**
     点名并写明理由。
  ⑥ **门禁** `scripts/check-dead-css.cjs`（判据 **DZ1–DZ4**，零第三方依赖）：
     **DZ1** 死类判红；**DZ2** 覆盖度自证（**计数写在判定开关之外**、下限取 **1**）；
     **DZ3** 门禁自己没被卸掉（npm run 闭包遍历）；**DZ4** 登记表反向自证（dynamic 四步校验 +
     held 的注释点名 + why 非空；`tableCount > 0` 时才生效，避免与 DZ2 同档双红）。
     落点判定从**子串**改成**词边界 token**（页面侧 = `src/**` 非 CSS + `eleventy.config.js` +
     `eleventy-helpers.cjs`，先剥 CSS / JS / Nunjucks / HTML 注释与 `url()`；跨 CSS 双侧各算一遍）。
  ⑦ **连带修另一道门禁**：删死类让 `check-design-system-contract.cjs` 的 **DC6**（徽标类数
     **硬编码下限**）判红 —— 那个下限会随「合法删掉一个死类」而失效、逼着人改门禁
     ⇒ 把参照系换成**规格真源**（§6.0 登记了几个类）：文档多列会判红、CSS 被裁剪会判红、
     两边都空会判红，而文档**少**列一个只由 DC1 负责 ⇒ 两条判据不耦合、红因归属仍唯一；
     其自测的 DT1 / DT6 锚点都指向**已删的类** ⇒ 改指现存的类，并**新增一档**证明新语义。
  ⑧ **连带订正文档**：`docs/design-system.md` 有 7 处把已删的类当在用（§6.0 拆分表 3 处、
     §6.4 徽标变体表 3 处、排版片段与验收清单各 1 处）⇒ 一并订正。
  ⑨ **删死类**：53 个真死类 + 1 个死属性选择器（10 个 CSS 文件），并订正 4 处**说假话的注释**；
     `check-a11y.cjs` 的 A1 护栏**判据保留、不放宽**，只改文案去掉已删类名。
  ⑩ **自测** `scripts/test-dead-css.cjs`（**最小夹具站**：登记表由门禁源码解析生成 ⇒
     自测源码里**不出现真实类名**，门禁不会把自己当成消费点）⇒ 含 **7 档判据级负对照**
     （分别卸掉 DZ1–DZ4 后对应注入必须**完全转绿**）、**红因编号集合完全相等**的归属纯净性断言、
     一档**覆盖度自证**、一档**门禁被摘掉**。
  ⑪ **验证**：`npm run build` exit 0；产物**文件数不变**、总字节 **−9,031 B**，
     变化**恰好 10 个文件**（4 个外链 CSS + 6 个 HTML，**每个 HTML 恰好 −475 B** ⇒
     变化只来自共享的内联 CSS 块）；`pages.css` / 全部 JS / 全部图片 / bib / ris / sitemap
     **逐字节相同**；用 `git archive HEAD` 重建上一场产物并**剥掉内联 `<style>` 块**后逐字节比对
     ⇒ **5 个 HTML 完全相同**（论文页唯一差异是 `/tmp` 副本缺 `.git` 导致 `dateModified` 未生成）
     ⇒ **本轮对 HTML 结构零影响**；**负对照**：在 `/tmp` 副本里把删掉的死类加回去 ⇒
     门禁 **exit 1、恰好 1 条 DZ1** ⇒ 证明它不是空跑。
  ⑫ ⚠️ **本轮新增待拍板 53**：设计系统文档 §6.0 的**类名族核对**要不要从「只守
     `_badge.css` 一张表」扩到全部 partial（现状：`_card.css` 那行写着「占位（未来扩展）｜—」，
     而该文件里实际有**活的** `.card` / `.card__img` 等类 ⇒ 文档漂移零看守）
     —— 这是「文档该写多细」的取舍 ⇒ 登记为待拍板 53，**不代拍**。


- **D53**（本轮修的是缺陷 **D55**）：这一轮**不看清单**，改看**「检查器自己的数字是从哪来的」** ——
  上一场（D52）撞的是「样式表里定义了、页面上永远不会有」的元素；这一场撞上的是同一族的另一半：
  **检查器里写着、样式表里已经不是那样的值**。
  ① **为什么走 D55**：清单里 9 条待修缺陷**全部卡在拍板**上（D2 / D3 / D5 / D6 / D9 / D10 /
     D12 / D26 / D32）⇒ 剩下一条**修法明确、不涉设计取舍**的 **D55**（其验收条件授权「更彻底」那版）。
  ② **缺陷事实**：`scripts/contrast_check.py` 是一份**手工维护的色值快照**（30 项硬编码 hex），
     文件头却写着「Tokens pulled directly from src/assets/css/tokens.css」⇒ 它的暗色 `accent-50`
     写成了 `--color-brand-50` 的暗色值 `#0e1a35`（真值 `#2a1408`），暗色 `accent-600` 写成了
     **全仓只此一处**的臆造值 `#cc6020`（真值 `#b14810`）。
  ③ **本轮取的是 D55 行授权的「更彻底」那版** —— 不修快照，**把快照整个删掉**：脚本改为**运行时直接
     解析** `src/assets/css/tokens.css`（LIGHT 取 `:root` 块；DARK 取 `@media
     (prefers-color-scheme: dark)` 内的 `:root:not([data-theme="light"])` 块并**回落 `:root`**；
     另解析 `[data-theme="dark"]` 块并与 media 块**逐项比对**，漂移即硬失败），**脚本内不再保留任何
     色值字面量**（旧快照表改成只列名字的必需 token 清单）。
  ④ **顺带纠正了第二类错误**：旧脚本把**暗色底色用错了 token** —— 真实暗色 `--bg-page` 是
     `neutral-0`、`--bg-surface` 是 `neutral-100`，而旧脚本拿 `neutral-50` 当页面底、`neutral-0`
     当卡片底（**正好互换**）⇒ 暗色那一半的数字整体不可信。
  ⑤ **配对表改用语义 token**（`--text-primary` / `--text-accent` / `--link-hover` / `--bg-page` /
     `--bg-surface` / `--bg-muted` …），标签与真实底色一一对应；**退出码分层**：0 = 全过 AA，
     1 = 有配对低于 AA，2 = 样式表读不出 ⇒「检查器看不懂」与「样式坏了」不再混成同一个红。
  ⑥ **当场查出新缺陷 D57**：新脚本第一次真读了暗色 token，才发现**暗色链接 hover 只有 2.46:1**
     （`base.css` 全局 `a:hover` → `--link-hover` → `brand-300` `#24528f` 压 `#0f0e0c`）⇒ 低于 AA
     的 4.5:1 ⇒ **旧脚本从来没算过这一对**（它只有浅色的 link hover），且旧脚本还把暗色页面底错用成
     `neutral-50` ⇒ 即便加了也只会算出另一个错数字。
  ⑦ **D57 的修法属视觉取舍**（换成 `brand-500` 还是 `brand-600`）⇒ 登记**待拍板 55**，不代拍；
     本轮只登记缺陷、不改 `tokens.css` ⇒ **站点侧零影响**。
  ⑧ **另登记 D56**：`tokens.css` 第 238 行注释里的对比度数字（15.99:1 / 9.50:1）与实算
     （15.62:1 / 9.24:1，与 D25 浏览器实测一致）不符 ⇒ 属独立缺陷，本轮不动。
  ⑨ **验证**：脚本报「LIGHT `:root` 111 · DARK media 覆写 44 · `[data-theme=dark]` 44（零漂移）」
     「required tokens 26 · all resolvable」；**24 对里 23 对过 AA、1 对不过**（红因 = D57）；
     **5 档负对照**红因归属纯净（改 token ⇒ 数字随文件变且其余 22 行逐字不变；删 token / 删暗色块 /
     两处暗色漂移 ⇒ 各自 exit 2 并点名；把暗色底色改回浅色值 ⇒ 正文压上去掉到 1.03:1，**复现 D25 的
     症状值**）；`npm run build` exit 0、0 个 ✗；**产物 31 文件 / 2,170,183 B 逐字节不变**（只有
     `feed.xml` / `robots.txt` 的构建时间戳变）—— 脚本**不在 build 链** ⇒ 站点侧零影响。
  ⑩ ⚠️ **本轮新增待拍板 54 / 55**：54 = 要不要把这个脚本升级成常驻 build 链门禁（但它**现在是红的**，
     且批注 chip 底色是**近似建模**）；55 = 暗色 `--link-hover` 换成哪一档 brand ⇒ 两件都是取舍 ⇒
     登记，**不代拍**。


- **D54**（本轮修的是缺陷 **D56**）：这一轮**不看清单**，改看**「注释里的数字是从哪来的」** ——
  D56 原本只点了 `tokens.css` 第 238 行那两个数（15.99:1 / 9.50:1），但 D53 刚查实「旧脚本把暗色底色用错
  token」⇒ **同一个错在注释层很可能不止一处** ⇒ 本轮不按单点修，按**整族**修。
  ① 落点扩到「全仓 CSS / 样式脚本 / 文档注释里**所有可核**的对比度断言」。「可核」的判据是：注释里
     给出了 fg / bg（要么明写 hex，要么能从 `tokens.css` 推出来）且能按 WCAG 公式复算 ⇒ **不可核的一律不动**
     （`_card.css` 的封面亮度是**素材采样实测**、focus ring 的 alpha 数字**没指明色值**）。
  ② **两套彼此独立的验算**（都**不复用** `scripts/contrast_check.py`，避免「用被检查方判被检查方」）：
     第一套把 token 表从 `tokens.css` 逐行抄下来、WCAG 公式自己实现，扫出 **43 条**断言、22 条与实算不符；
     第二套自己解析 `tokens.css` 的 LIGHT / DARK、用**正则捕获组从文件实时抽取**注释里的数字、口径表
     **只声明「哪句话的哪个数字对应哪一对 fg/bg」而不维护期望值** ⇒ 修完后 **52 条口径 / 79 个数字全部对上**
     （容差按注释数字的小数位数取 0.5×10⁻ᵈᵉᶜ ⇒ 「写 7.2 而实算 7.24」这种合规四舍五入不会被误判成漂移）。
  ③ **22 条里 8 条是假阳性** —— 全部是「**口径选错**」而非「数字错」：`pages.css` 那句「brand-500 对纸白
     6.4:1」的底色其实是 `var(--bg-surface)`（浅色 `#ffffff`）不是 `--bg-page`；`base.css` 那句「链接色与正文色
     1.17–2.61:1」的 1.17 口径是**暗色**次要文字压暗色链接。⇒ 逐条**读原文**排除，不靠猜。
  ④ **真漂移 14 条 + 验算没覆盖的 8 处 = 19 处编辑**（`tokens.css` 5、`_paper.css` 6、`_badge.css` 1、
     `pages.css` 3、`a11y.css` 1、`design-system.md` 2、`test-focus-ring.cjs` 1）—— 后 8 处是
     `color-mix` 压色的合成色、文档副本、脚本注释副本，第一套验算够不着。
  ⑤ **同时纠正了第二类系统错**：一批注释把「暗色底色」当 `neutral-50`，而真实暗色 `--bg-page` 是
     `neutral-0` `#0f0e0c` ⇒ **与 D53 查出的旧脚本同一个错**，注释层同步纠正（`tokens.css` 两处
     `was 4.38:1 → now 5.49:1` 订正为 `was 4.63:1 → now 5.84:1`，并写明口径是压暗色页面底）。
  ⑥ **只改注释、零声明值改动** ⇒ 渲染语义零变化 ⇒ **产物逐字节不变**（31 文件 / 2,170,183 B，只有
     `feed.xml` 的 `lastBuildDate` 与 `robots.txt` 的 `generated-at` 两个构建时间戳变）；另附两道硬证明：
     逐文件断言「当前 == HEAD 施加本轮列出的那几处替换」（除此以外没动别的）、5 个 CSS 源文件**剥掉注释后
     与 HEAD 逐字节相同**（用构建链同一套 `stripCssComments`）。
  ⑦ **不编造动机**：`_paper.css` danger 那条原写「压 20% 到近黑才过 4.5:1」，改成「是 4.67:1，压 20% 到近黑后
     是 6.38:1」—— 只陈述两个数，**不解释「为什么要压」**（那是设计意图，不是实测值）。
  ⑧ **覆盖度反查**：把全仓每一行对比度断言捞出来逐条判「可核 / 阈值 / 不可核 / 历史快照 / 归档 /
     历史缺陷描述」⇒ 可核的**全部**被口径表认领（52 条），其余四类逐条登记不修；**阈值**（"4.5:1" /
     "3:1" 这种 WCAG 要求值）不是实测断言，不算漂移。
  ⑨ **5 档判据级负对照**红因归属纯净：把某处注释改回旧漂移值 ⇒ **精确 1 处报红并指名**
     「注释写 15.99，实算 15.6166」；`_paper.css` 2.44→2.30 ⇒ 2 处报红（同一物理量在文件里有两处副本，
     两处都该红）；脚本注释副本 1.85→1.92 ⇒ 1 处报红；**删掉一条口径 ⇒ exit 2 由覆盖度下限判红**
     （口径 51<52 / 比对 78<79 / 文件 14<15 ⇒ 门禁自己被卸掉必须红）；**把 WCAG 公式弄坏 ⇒ 大面积报红**
     （证明它真在算，不是空跑）。
  ⑩ ⚠️ **本轮没有新增待拍板项**（对比度是客观 WCAG 指标，不涉审美取舍）；另登记缺陷 **D58**（两份
     2026-10-01 历史报告里的对比度数字 / 底色标注与真值不符 —— 与 D56 同族但落点不同，下一轮可取，
     **不代拍**）。

- **D55**（本轮修的是缺陷 **D58**）：这一轮**不看清单**，改看**「两份历史报告里的数字，读者会当成什么」** ——
  D58 点了两份 2026-10-01 的历史报告：og 报告 §7 的暗色列把「页面底色」记成 `neutral-50`，
  lighthouse 报告的方案 A / B 引用的 hex 与预估比值全对不上。上一场次（D54）刚把「注释层的错」按整族
  修完，其结论正是「同一类错会跨层出现」⇒ 本轮同样**不按单点修**，按**两份报告里的同类错**一起修。
  ① **先把口径钉死**（实测 `tokens.css` 的语义 token，不用旧脚本的快照表）：**LIGHT `--bg-page` =
     `neutral-50`** ⇒ og §7 **亮色列原本就是对的**；**DARK `--bg-page` = `neutral-0` `#0f0e0c`**
     ⇒ **只有暗色列的 bg 列错**；另实测 `[data-theme="dark"]` 块与 `@media` 块**零漂移**（A1 守则）。
  ② **验算独立于被检查方**：自己解析 `tokens.css` 的 LIGHT / DARK、WCAG 公式自己实现
     （**不复用** `scripts/contrast_check.py`）⇒ 逐行复算 §7 的 24 行。
  ③ **修法分两类**：凡**断言 token 的值 / 身份**（「`#ff8e4d` 是 accent-300 档」「light mode 的
     `--text-primary` 是 `#f5f2ea`」「`--color-accent-900` 是 `#7a330a`」）= 对设计系统的**当前事实**陈述
     ⇒ **必须订正**；凡**断言当时的实测**（axe 原始输出块、截图数、分数、时间戳、§2.2 的 P1.3 表、
     L126 底色未指明的「17.4:1」）= **历史记录** ⇒ **一律不改**。
  ④ **og 报告 §7**：6 行暗色页面底色行的 bg 列 `neutral-50` → `neutral-0` 并按真值重算
     （primary 17.25:1 / secondary 7.74:1 / muted 5.84:1 / link 6.60:1 / accent 10.20:1 / h1 17.25:1），
     **AA / AAA 判定一条都没变**；muted 行那个「was 4.38:1」经复算确认是**旧底色口径**（`#807c72` 压
     `neutral-50` = 4.3830）⇒ **保留原值并标注口径**，另给同底色口径的 4.63:1（与 `tokens.css` 注释一致）；
     表后新增一行「本表为 2026-10-01 快照、其余各行仍是当次数值」的口径说明。
  ⑤ **顺带查出两处 D58 行没点名的同类错（扩范围，已在日志写明）**：og §7 的结论句写「其中 13 / 24
     同时通过 AAA」，而**表内机械计数是 11 行 AAA=PASS / 13 行 AAA=FAIL** ⇒ **数字写反**，订正为 11 / 24
     （AA 仍 24 / 24 不变）；§7.1 那段「`color: neutral-900` on `background: accent-400 #ff7e33`，
     ratio 7.75:1」描述的配色**已不是当前实现**（当前是 `--signal-ink: var(--color-accent-900)` on
     `var(--color-accent-400)`，实测亮 7.23:1 / 暗 8.05:1），且 7.75:1 按当前 token **复算不出来**
     （最接近的是 `#0f0d0a` 压 `#ff7e33` = 7.65:1）⇒ 改为陈述当前实现 + 保留订正说明。
  ⑥ **lighthouse 报告**：根因段的**档位归属**（`#ff8e4d` 是**暗色 accent-400**，accent-300 真值是
     `#ff9550`）与 **light / dark 归属**（`#f5f2ea` 是**暗色** `--text-primary`，light 的 `#0f0d0a`）
     订正；方案 A 的 `#7a330a` → `#260e02`、方案 B 的 `#f5a575` / `#ffd5b8` → `#ffb787` / `#ffd9bd`；
     两行都加「当时的预估」标注 + 实算值（方案 A 实算暗色 8.05:1 / 亮色 7.23:1；方案 B 实算 cream
     压 accent-200 只有 **1.52:1**、压 accent-100 只有 **1.18:1**，**并不达标**）并指向 `pages.css`
     的 `.home-signal` 段；**axe 原始实测输出块（2.03:1）未动** —— 那 2.03:1 复算成立
     （`#f5f2ea` 压 `#ff8e4d` = 2.0341）。
  ⑦ **D58 行里我自己写错的数字一并订正**：原写「方案 B 实算 3.45:1」—— 3.4546 实为 `#e85f15` 压
     `#ffffff`，**配错了 fg/bg 对**；真值是 1.52:1 / 1.18:1。
  ⑧ **46 条判据的自证脚本**（放 `/tmp`，**不入库** —— 入库即等于新增门禁，属**待拍板 54**）+
     **12 档判据级负对照**红因归属纯净（改 bg 列 ⇒ 精确 1 条红并指名；改数值 / 结论句 / 口径说明 /
     §7.1 ⇒ 各 1 条红；换方案 A 的 hex ⇒ 2 条红（同一处事实的两个判据）；换方案 B 的值 ⇒ 1 条红；
     退回「accent-300 档」⇒ 1 条红；改 §3 之外的行 ⇒ 1 条红；删掉 L126 那行 ⇒ 2 条红；
     **删掉一条判据 ⇒ exit 2 由覆盖度下限判红**；**把 WCAG 公式弄坏 ⇒ 6 条大面积报红**）。
  ⑨ **产物零影响**：`docs/` 不进 Eleventy 输入区 ⇒ `npm run build` exit 0、0 个 ✗，产物 31 文件与
     HEAD **逐字节相同**（只有 `feed.xml` 的 `lastBuildDate` 与 `robots.txt` 的 `generated-at` 两个构建
     时间戳变）；6 道文档门禁均 exit 0。
  ⑩ ⚠️ **本轮没有新增待拍板项**（对比度是客观 WCAG 指标，不涉审美取舍）；**未新增门禁**（根治要靠
     「注释 / 文档里的对比度数字必须与实算一致」那道门禁，属**待拍板 54**）。

- **D56**（本轮修的是缺陷 **D2**）：这一轮**回到清单里唯一一条不挂拍板的待修缺陷** ——
  D2 说的是「除论文页外，每个页面都产出 3 个 `<meta property="og:image">`，而 OG 抓取器只取第一张」。
  上一场次（D55）的结论是「修完 D58 后，待修清单里 D2 / D3 是唯一不挂拍板的两条」⇒ 本轮取 **D2**。
  ① **先量真因**（不照抄缺陷描述）：修前产物实测 **6 个页面**里 5 个 `og=3`、论文页 `og=1`
     —— 与 D2 行写的「5 个页面各 3 个」一致。
  ② **改之前先查清谁在管这块**：`check-image-assets.cjs` 的 IA1–IA7（逐条验 og 家族，但 twitter
     **只验第一条**）、`check-img-publish.cjs` 的 IP1/IP2（发布清单 ↔ 消费点）、
     `check-jsonld.cjs` 的 J11（结构化数据的 image 必须等于该页**第一个** og:image）、
     `verify-site.cjs` 的门禁 22（og 与 twitter 指向**同一张图**时两处 alt 必须逐字相同，
     **按路径配对、不按顺序**）⇒ 结论：og 侧留 1 张、其余挪到 twitter 侧，**J11 与门禁 22 都不受影响**
     （第一个 og:image 的 URL 不变；1200×630 这张在 og 与 twitter 两边的 alt 本来就都是 `ogCardAlt`）。
  ③ **修法走 D2 行自己授权的那条**：og 家族**只留 1 张**（1200×630）；「若要保留其它尺寸 ⇒ 改挂
     `twitter:image`」—— 方形 1080×1080 与横幅 1500×500 **改挂 `twitter:image`**。理由也一并订正：
     **只有 X / Twitter 支持按显示槽位的比例从多张 twitter:image 里挑一张**（最多 5 张），og 那边
     抓取器只取第一张 ⇒ 模板里那句「社交平台按 slot 尺寸自动选图」**只对 twitter 成立**。
  ④ **三张图一张没少**：都还在 `src/assets/img/og/`、都还在发布、都还被引用（IP2 逐张守「被引用必须
     发布」）⇒ **没有留下死副本**，也没有把「多尺寸分享图」这个能力删掉。
  ⑤ **新判据 IA8**（`scripts/check-image-assets.cjs`）：每页 og:image **不得多于 1 条**；
     **0 条**仍归 IA7、**多于 1 条**归 IA8 ⇒ 合起来 = 恰好 1 条，且**同一处缺陷只红一条**
     （红因归属可判定）。
  ⑥ **twitter 侧改成逐条验**（IA1 文件存在 / IA3 alt 非空）：挪过去的那两张若只验第一条就没人验了 ⇒
     这是**本轮改动直接要求**的配套，不是顺手加的判据。
  ⑦ **逐字节证明改动是外科手术**：`git worktree` 拉 HEAD 单独构建出基线产物 ⇒ 文件清单完全相同，
     **只有 5 个 fallback 页的 head 变了**（每页 19 行差异 = 删 2 组 og:image + 加 2 组 twitter:image），
     **论文页逐字节不变**（它走 cover 分支），`feed.xml` / `robots.txt` 只有构建时间戳。
  ⑧ **6 档判据级负对照**红因归属纯净（注入一条**完全合法**的第二条 og:image ⇒ 精确 1 条红并指名；
     同样注入放在**论文页** ⇒ 仍被 IA8 抓到（证明逐页生效）；第二条 twitter:image 指向不存在的文件 ⇒
     精确 1 条红 IA1；第二条 twitter:image:alt 清空 ⇒ 精确 1 条红 IA3；**卸掉 IA8 开关 ⇒ 同一注入转绿**）。
  ⑨ **产物级硬判据**：6 个页面**og:image 恰好 1 条**；fallback 页 twitter:image 3 条、论文页 1 条；
     `npm run build` exit 0、0 个 ✗（`check:image` 以 IA1–IA8 通过）。
  ⑩ ⚠️ **本轮没有新增待拍板项**（og 元数据的条数是平台行为的事实陈述，不涉审美取舍）；
     ⚠️ **未把注入矩阵固化成常驻自测脚本**（要新增 npm script + 接进 build 链 + README 命令表，
     属结构性改动）⇒ 登记缺陷 **D59**（13 道门禁没有任何 `test-*` 配对，判据「能不能变红」无人看守）。

- **D57**（本轮修的是缺陷 **D59**）：这一轮**接着 D56 的尾巴** —— D56 给 `check-image-assets.cjs`
  加了 IA8（og:image 不得多于 1 条），但那道判据「会红」**只靠当场在 `/tmp` 里跑的注入矩阵证明**，
  矩阵跑完即弃 ⇒ 仓库里没有任何东西保证它下次还在 ⇒ 登记 **D59**。
  ① **本轮只做 D59 的第一批**（D59 行自己写着「分批做，别一次改 13 道门禁」）⇒ 只补
     `check-image-assets` 这一道，其余 **12 道**继续挂着待做。
  ② **落点**：常驻自测 `scripts/test-image-assets.cjs` —— **14 档注入矩阵**，跑在**自造的最小夹具站**
     上（两个页面 + 一张自造 1200×630 PNG + 一个自造 1080×1080 SVG，**不依赖 `_site`**）：
     IM0 基线绿 / IA1 / IA1(twitter 第二条) / IA2 / IA3 / IA3(twitter alt) / IA4 / IA5 / IA6 / IA7 /
     IA8 / IA8(另一页面，红因指名那个页面) / **2 档故意判绿** / **1 档判据级负对照**。
  ③ **为什么自造夹具站而不是复制真 `_site`**：自测于是**不依赖 build 产物**（没跑过 build 也能单跑）、
     **每档的失败只可能来自被测判据**；PNG 是手写的（`zlib.crc32` + `deflateSync` 现拼
     IHDR / IDAT / IEND），写完当场**回读校验真实像素确实是 1200×630** —— 夹具坏了会让**每一档**都以
     看不懂的方式失败 ⇒ 那就等于在测一个坏夹具，不是测判据。
  ④ **断言用「红因编号集合完全相等」**：编号从 **stderr** 抽（stdout 的提示行也带「门禁 IA1：」字样，
     混用会把编号集算错）；**多一条少一条都算失败** ⇒ **红因归属纯净**可判定。
  ⑤ **注入必须定点**：夹具页用 `<!--OG-->` / `<!--TW-->` 标记块圈起来，替换只动其中一块 ——
     否则「把 og 换成坏地址」会连 twitter 一起换掉 ⇒ twitter 那张真图也没了 ⇒ 可验集清空 ⇒ IA6 跟着红
     ⇒ 红因归属就不纯了。注入若**没产生任何变化** ⇒ 直接失败（不让它退化成「假绿」）。
  ⑥ **IM8（IA6 那档）必须两页都改**：门禁的「应验集」是**全站**引用算出来的，只改 index.html 的话
     `blog/index.html` 仍引用着站内 PNG ⇒ 可验集非空 ⇒ IA6 不触发 —— 这是本轮实测踩到并修掉的真 bug。
  ⑦ **判据级负对照**：门禁**副本**卸掉 `const IA8_ON = true;` 后跑 IM10 的注入 ⇒ 必须转绿；
     「破坏没打上」与「判据本来就不红」在结果上**完全同形** ⇒ 副本与原件**只差 1 行**的断言必须成立，
     且跑完断言**门禁原件逐字节未变**。
  ⑧ **覆盖度自证**：判据编号从**门禁源码现读**（不写死名单）⇒ 门禁新加一条判据、源码里出现它的编号，
     而本矩阵没补档 ⇒ 自测立刻判红 —— 这正是「矩阵跑完即弃」那个病根的**结构性堵法**。
  ⑨ **接线**：`package.json` 加 `check:image-selftest`，**接在 `check:image` 之后**（GW4）；README
     命令表加一行（RD3）；⚠️ **不登记进 `EXEMPT_SELFTEST`**（GW4：既接 build 又登记 ⇒ 自相矛盾）。
  ⑩ ⚠️ **本轮没有新增待拍板项**（纯工程补强，不涉审美与内容口径）；**中央台账不动**。

- **D58**（本轮修的是缺陷 **D59**）：这一轮**接着 D57 的尾巴** —— D57 给 `check-image-assets` 配了
  常驻自测，但 D59 行自己要求「分批做」，**还有 12 道**门禁仍无 `test-*` 配对。
  ① **本轮只做 D59 的第二批** ⇒ 只补 `check-tool-routes` 这一道，其余 **11 道**继续挂着待做。
  ② **落点**：常驻自测 `scripts/test-tool-routes.cjs` —— **15 档注入矩阵**，跑在**自造的最小夹具站**
     上（自造 `_site/` + 极简 `lib/site-routes.cjs` + 极简 `lib/page-check.cjs` + 四个浏览器工具，
     **不依赖真 `_site`、不需要 git**）：TT0 基线绿 / RT1–RT9 各一档 / **2 档故意判绿** /
     **3 档判据级负对照**。
  ③ **为什么必须把门禁「复制」到沙箱里跑**：本门禁的仓库根是 `path.resolve(__dirname, "..")` ——
     **硬编码，没有环境变量开关** ⇒ 只有把副本放进夹具的 `scripts/` 下，ROOT 才会指向夹具根。
     ⇒ 夹具因此不需要 git、不需要真产物，也不会和并发场次抢同一个 `_site` 目录。
  ④ **顺带发现并修掉一个「自述是错的」的门禁**：本门禁原来自称「用独立字母编号 TR*，不与其它门禁
     续接或冲突」—— **那句自述是错的**：`scripts/check-tracked-refs.cjs` 早就在用 TR1 / TR2，
     两个门禁各说各话指两件事。本轮改成 **RT1–RT9**（`RT` 全仓此前零占用；`docs/` 里的
     `TR1/TR2` 引用**全部**指 `check-tracked-refs` ⇒ 本门禁的旧号零外部引用 ⇒ 改前缀无外部影响）。
  ⑤ **判据从 4 条细化到 9 条**：RT2/RT3/RT4（路由表这份**契约**坏了：模块没了 / 读崩了 / 是空的）
     与 RT5（契约好好列出了路由，但产物里不存在 —— 产物没重建或路由改了名）**坏法不同、修法不同**
     ⇒ 混成一个号会让注入矩阵的两种红因集合无法区分，红因归属纯净的断言就废了。
  ⑥ **红因文案统一带 `门禁 RTn：` 前缀**（沿用 `门禁 IA1：` 惯例），自测只从 **stderr** 抽编号；
     断言用**多重集完全相等**（连红因**行数**也要相等 ⇒ 连「同一条判据报了两次」也算失败）。
  ⑦ **判据级负对照三种形态**：卸掉 RT5 ⇒ 对应注入转绿；卸掉 RT5 **再叠加一条 RT7 注入** ⇒
     **仍红**但红因集合恰为 `{RT7}`（证明卸判据是**精准**的，不是把门禁整个关掉）；卸掉 RT9 ⇒
     对应注入转绿。副本与原件**只差 1 行**的断言必须成立（「破坏没打上」与「判据本来就不红」
     在结果上完全同形），且跑完断言**门禁原件逐字节未变**。
  ⑧ **2 档故意判绿**：工具里写的是**真实存在的本地文件系统路径**、站点路径**只出现在注释里** ——
     两者都必须判绿 ⇒ 证明 RT9 守的是「**声称的站点路径**」而不是「一切以 `/` 开头的字面量」。
  ⑨ **接线**：`package.json` 加 `check:tool-routes-selftest`，**接在 `check:tool-routes` 之后**
     （GW4）；README 命令表加一行（RD3）；⚠️ **不登记进 `EXEMPT_SELFTEST`**（既接 build 又登记
     ⇒ 自相矛盾）。
  ⑩ ⚠️ **本轮没有新增待拍板项**（纯工程补强，不涉审美与内容口径）；**中央台账不动**。

- **D59**（本轮修的是缺陷 **D59**）：这一轮**接着 D58 的尾巴** —— D58 给 `check-tool-routes` 配了
  常驻自测，但 D59 行自己要求「分批做」，**还有 11 道**门禁仍无 `test-*` 配对。
  ① **本轮只做 D59 的第三批** ⇒ 只补 `check-lang` 这一道，其余 **10 道**继续挂着待做。
  ② **落点**：常驻自测 `scripts/test-lang.cjs` —— **28 档注入矩阵**，跑在**自造的最小夹具站**上
     （自造 `src/` 五种后缀 + `_site/` 页面与 feed，**不依赖真 `_site`、不需要 git**）：
     LG0 基线绿 / LG1–LG7 每条**至少**一档（LG1、LG2 各两档）/ **10 档故意判绿** /
     **8 档判据级负对照**。
  ③ **为什么必须把门禁「复制」到沙箱里跑**：本门禁的仓库根是 `path.join(__dirname, "..")` ——
     **硬编码，没有环境变量开关** ⇒ 只有把副本放进夹具的 `scripts/` 下，ROOT 才会指向夹具根。
     ⇒ 夹具因此不需要 git、不需要真产物，也不会和并发场次抢同一个 `_site` 目录。
  ④ **顺带给门禁本体编号化**：`check-lang` 此前**一条编号都没有**（红因是一句人话 ⇒ 自测没法
     按编号判定红因归属），本轮改成 **LG1–LG7**（`LG` 全仓此前零占用；`check-lang` 的判据在
     `docs/` 里**零外部引用** ⇒ 改号无外部影响）。
  ⑤ **判据按「坏法不同、修法不同」分号**：源文件层中文（LG1）/ 产物层中文（LG2）/ 源文件层
     U+FFFD（LG3）/ 产物层 U+FFFD（LG4）是**四处不同的坏法**；LG5（源文件层扫到 0 个）、
     LG6（`_site` 不在场）、LG7（`_site` 在场但扫到 0 个 `.html`）是**三种"空跑"**，
     修法各不相同 ⇒ 混成一个号会让注入矩阵的红因集合无法区分，红因归属纯净的断言就废了。
  ⑥ **顺带补上 3 条自证存活判据**（本轮新增的**行为变化**，如实记下）：补之前 `_site` 不存在时
     本门禁只打一行「产物层未扫描」就**判绿通过**，`SOURCE_EXTS` 一旦被改空也一样是「0 个 ⇒ 绿」
     ⇒ 补上后，**在没有构建产物的仓库上单独跑 `npm run check:lang` 会判红**；它在 build 链里
     位于 `eleventy` **之后** ⇒ build 链不受影响（与 `check-jsonld` 的既有做法一致）。
  ⑦ **红因文案统一带 `门禁 LGn：` 前缀**，自测只从 **stderr** 抽编号；断言用**多重集完全相等**
     （连红因**行数**也要相等 ⇒ 连「同一条判据报了两次」也算失败）。
  ⑧ **10 档故意判绿 = 每条豁免单独验一次**：front matter 整行注释、Nunjucks 注释、HTML 注释、
     CSS 注释、JS 行注释、数据层目录豁免、OG 品牌图目录豁免、exFAT 资源叉跳过、产物里的非 HTML
     文件不扫、内联 `<script>`/`<style>` 块不扫。少剥一处、豁免多写一条目录，产物里就会多出中文
     而门禁还是绿的 —— 而这类改动**永远不会让构建失败**。
  ⑨ **接线**：`package.json` 加 `check:lang-selftest`，**接在 `check:lang` 之后**（GW4）；
     README 命令表加一行（RD3）；⚠️ **不登记进 `EXEMPT_SELFTEST`**（既接 build 又登记
     ⇒ 自相矛盾）。
  ⑩ ⚠️ **本轮没有新增待拍板项**（纯工程补强，不涉审美与内容口径）；**中央台账不动**。

- **D59**（本轮修的是缺陷 **D59**）：这一轮**接着上一批的尾巴** —— 上一批给 `check-lang` 配了
  常驻自测，但 D59 行自己要求「分批做」，**还有 10 道**门禁仍无 `test-*` 配对。
  ① **本轮只做 D59 的第四批** ⇒ 只补 `check-print-theme` 这一道，其余 **9 道**继续挂着待做。
  ② **落点**：常驻自测 `scripts/test-print-theme.cjs` —— **27 档注入矩阵**，跑在**自造的最小夹具站**上
     （自造 `print.css` / `tokens.css` / `base.njk` + **两个**产物 HTML，**不依赖真 `_site`、
     不需要 git**）：PT0 基线绿 / PT1–PT7 每条**至少**一档 / **7 档判据级负对照** /
     **1 档精准性负对照**。
  ③ **为什么在 10 道候选里挑它**：① `PT` 前缀在 `scripts/` 里**独占**（只有 `check-print-theme`
     在用），`docs/` 里的 PT1–PT6 引用**全部指它自己** ⇒ **不用改前缀**（省掉 D58 那次
     TR→RT 换号的风险）；② 它是这批里**零自证判据**者之一 ⇒ 六条判据从未被证明过会红；
     ③ 它的期望集是**扁平对象字面量**（22 个 token）+ **哈希锚** ⇒ 自测可从门禁源码**现读**
     生成正确夹具，**连哈希都能对上**；④ 2026-10-19 那次已有一套 12 档注入矩阵（跑完即弃）
     ⇒ 设计可复用。
  ④ **为什么门禁必须「复制」到沙箱里跑**：本门禁的仓库根是 `path.resolve(__dirname, "..")` ——
     **硬编码，没有环境变量开关** ⇒ 只有把副本放进夹具的 `scripts/` 下，ROOT 才会指向夹具根。
     ⇒ 夹具因此不需要 git、不需要真产物，也不会和并发场次抢同一个 `_site` 目录。
  ⑤ **红因文案统一带 `门禁 PTn：` 前缀**，自测只从 **stderr** 抽编号（stdout 里也有一句以
     「门禁 PT4：」开头的**说明** ⇒ 只扫 stderr 才是天然隔离）；断言用**多重集完全相等**
     （连红因**行数**也要相等 ⇒ 连「同一条判据报了两次」也算失败）。
  ⑥ **顺带补上 PT7「判据的前提文件都在场」**（本轮新增的**行为变化**，如实记下）：print.css /
     tokens.css / base.njk 任一不在场 ⇒ 判红，并**跳过依赖它的那几条**。补之前 print.css 缺失时
     门禁只打一行**裸红因**就 exit 1 ⇒ **其余判据根本没跑**（同一时刻的其它问题要等下次才看得到）；
     tokens.css / base.njk 缺失时又分别归在 PT5 / PT6 名下 ⇒ 三种「前提缺失」与判据本身的红因
     混在一起 —— 这正是「空跑的门禁等于没有门禁」这一族。⇒ 现在前提缺失时红因**恰为 {PT7}**。
  ⑦ **判据的「计算」与「开关」解耦**：PT2 的 `:root` 规则、PT3 的期望集**无条件**算出来，
     判据开关只包住 `fail()` 与比对循环 ⇒ 卸一条判据**不连带**关掉别条；只有「前提文件不在场」
     才让依赖链整段跳过（那是 PT7 的职责）。
  ⑧ **两条必须说清的诚实边界**：① **PT1 会连坐 PT2–PT4**（`@media print` 块不存在时它们要看的
     东西也没了）⇒ 那一档负对照证明的是「注入的红因确实来自 PT1」，**证明不了**「卸 PT1 精准到
     不连坐」⇒ 精准性那一档改用 **PT3 + PT2** 组合（PT3a 不连坐 PT2）；② **PT4 两档必须连门禁的
     期望集一起改**（并同步哈希锚），否则 PT3 会先判红、压根轮不到 PT4 ⇒ 这两档的门禁副本与原件
     差 **2 行**（期望集 1 行 + 哈希锚 1 行），自测按档声明允许的差异行数。
  ⑨ **接线**：`package.json` 加 `check:print-theme-selftest`，**接在 `check:print-theme` 之后**
     （GW4）；README 命令表加一行（RD3）；⚠️ **不登记进 `EXEMPT_SELFTEST`**（既接 build 又登记
     ⇒ 自相矛盾）。
  ⑩ ⚠️ **本轮没有新增待拍板项**（纯工程补强，不涉审美与内容口径）；**中央台账不动**。

- **D59**（本轮修的是缺陷 **D59**）：这一轮**接着上一批的尾巴** —— 上一批给 `check-print-theme` 配了
  常驻自测，但 D59 行自己要求「分批做」，**还有 9 道**门禁仍无 `test-*` 配对。
  ① **本轮只做 D59 的第五批** ⇒ 只补 `check-copy-export` 这一道，其余 **8 道**继续挂着待做。
  ② **落点**：常驻自测 `scripts/test-copy-export.cjs` —— **25 档注入矩阵**，跑在**自造的最小夹具站**上
     （自造 `package.json` + `src/assets/js/*.js` + `src/_includes/*.njk`，**不依赖真 `_site`、
     不需要 git**）：G1–G5 绿档 / CE1–CE9 每条**至少**一档 / **9 档判据级负对照** /
     **1 档精准性负对照**。
  ③ **为什么在 9 道候选里挑它**：① `CE` 前缀全仓**零占用**（带冒号形式零命中；裸 `CE` 唯一命中在
     `node_modules/@sindresorhus/transliterate/replacements.js`，非本仓源码）⇒ 首次编号化**不用换号**；
     ② 它是这批里**零自证判据**者之一 ⇒ 九条判据从未被证明过会红；③ 它**自带注入模式**
     （`node scripts/check-copy-export.cjs <文件>` 只查指定文件）⇒ 夹具成本极低；④ 九条判据各有
     **独立失败形态** ⇒ 注入矩阵能逐条拆开。
  ④ **为什么门禁必须「复制」到沙箱里跑**：本门禁的仓库根是 `path.join(__dirname, "..")` ——
     **硬编码，没有环境变量开关** ⇒ 只有把副本放进夹具的 `scripts/` 下，ROOT 才会指向夹具根。
     ⇒ 夹具因此不需要 git、不需要真产物，也不会和并发场次抢同一个 `_site` 目录。
  ⑤ **红因文案统一带 `门禁 CEn：` 前缀**，自测只从 **stderr** 抽编号（stdout 里另有一句说明
     ⇒ 只扫 stderr 才是天然隔离）；断言用**多重集完全相等**（连红因**行数**也要相等 ⇒ 连
     「同一条判据报了两次」也算失败）。
  ⑥ **顺带给门禁本体编号化**（本轮新增的**行为变化**，如实记下）：`check-copy-export` 此前
     **一条编号都没有**（红因是一句人话 ⇒ 自测没法按编号判定红因归属），本轮改成 **CE1–CE9**，
     并**新增 CE9「门禁自己没被卸掉」**（读 `package.json` 确认 `build` 仍链着 `check:copy`、
     `check:copy` 仍指向本门禁）⇒ CE9 **只在非注入模式**生效。
  ⑦ **三条必须说清的诚实边界**：① 门禁的**提取**正则**不排除字符串字面量**（只要求前面有 `.`），
     而**计数**正则排除字面量 ⇒ 文案里写 `clipboard.writeText(` 会被**多认一个出口**并触发 CE2
     （门禁已知边界）⇒ 绿档只能用「无点的 `writeText(`」；② **CE1 把原来两处提前 `exit 1` 的
     扫描面自查合并成一条**（否则「扫描面为空」会同时报 CE1 与 CE7 ⇒ 红因不纯）；③ 原
     「找不到要检查的文件」那条**裸红因**在注入模式下**根本没机会输出**（`analyzeFile` 找不到文件
     直接 exit），本轮把它归成 **CE8「注入前提缺失」** ⇒ 前提缺失时红因**恰为 {CE1} 或 {CE8}**，
     不连坐。
  ⑧ **判据的「计算」与「开关」解耦**：提取/分析/计数**无条件**算出来，判据开关只包住 `push`
     ⇒ 卸一条判据**不连带**关掉别条；只有「前提缺失」才让依赖链整段跳过（那是 CE1 / CE8 的职责）。
  ⑨ **接线**：`package.json` 加 `check:copy-selftest`，**接在 `check:copy` 之后**（GW4）；
     README 命令表加一行（RD3）；⚠️ **不登记进 `EXEMPT_SELFTEST`**（既接 build 又登记
     ⇒ 自相矛盾）。
  ⑩ ⚠️ **本轮没有新增待拍板项**（纯工程补强，不涉审美与内容口径）；**中央台账不动**。

- **D59**（本轮修的是缺陷 **D59**）：这一轮**接着上一批的尾巴** —— 上一批给 `check-copy-export` 配了
  常驻自测，但 D59 行自己要求「分批做」，**还有 8 道**门禁仍无 `test-*` 配对。
  ① **本轮只做 D59 的第六批** ⇒ 只补 `check-css-braces` 这一道，其余 **7 道**继续挂着待做。
  ② **落点**：常驻自测 `scripts/test-css-braces.cjs` —— **22 档注入矩阵**，跑在**自造的最小夹具站**上
     （自造 `package.json` + 门禁副本 + 两张样式表，**不依赖真 `_site`、不需要 git**）：G0–G4 绿档 /
     CB1a–CB1d / CB2 / CB2b / CB3a / CB3b / CB4 各一档 / **7 档判据级负对照** /
     **1 档精准性负对照** / **1 档覆盖度自证**。
  ③ **为什么在 7 道候选里挑它**：① `CB` 前缀全仓**零占用**（带冒号形式零命中）⇒ 首次编号化**不用换号**；
     ② 它此前**一条编号都没有、零自证判据** ⇒ 它的判定从未被证明过会红；③ 改造面小（单文件、无注入
     模式、无外部引用）⇒ 一批就能做完。
  ④ **实测发现两个真洞**（这是本批的额外收获，不是纯补强）：① **空跑** —— 样式表一张都扫不到时，
     旧门禁打印「CSS 括号检查通过（0 个文件）」并 **exit 0** ⇒ 目录一旦被清空或改名，这道护栏就
     **静默地不再护栏**，而 build 照样全绿；② **假阳性** —— `strip()` 此前只剥注释与字符串、**不剥
     `url(...)`**，于是**未加引号**的 `url(data:image/svg+xml;utf8,<svg>{)` 里的 `{` 被计入 ⇒ 门禁误判红，
     而旧文件头却声称「跳过 url() 里的 data URI」⇒ **文档说假话**。
  ⑤ **给门禁本体编号化并补三条自证判据**（本轮新增的**行为变化**，如实记下）：`check-css-braces`
     此前**一条编号都没有**（红因是一句人话 ⇒ 自测没法按编号判定红因归属），本轮改成 **CB1–CB4**：
     ① **CB2「扫描面为空」** —— 一张样式表都扫不到 ⇒ 判红（补之前是 exit 0）；② **CB3「遮罩自证」** ——
     注释 / 字符串 / `url(...)` 里的 `{` 必须都被跳过，任一不成立 ⇒ 判红（遮罩失效时门禁会安静地给出
     错的结论，而这种失效**不会**让门禁自己变红）；③ **CB4「门禁自己没被卸掉」** —— 沿 `npm run` 链从
     build 往下走（做法沿用 `check-dead-css` 的 DZ3）⇒ 门禁被卸掉时必须判红。
  ⑥ **顺带修掉那个假阳性**：`strip()` 末尾补上 `url(...)` 剥离，用的是仓库内**已验证**的实现
     （`check-dead-css` 的 `stripCss` 同一行）⇒ 未加引号的 `url(data:…)` 不再误报。
     ⚠️ 对真实仓库**零影响**（仓库里的 `url(` **全部是加引号形态**）⇒ 只是把「文件头声称的行为」
     补成真的。
  ⑦ **红因文案统一带 `门禁 CBn：` 前缀**，自测只从 **stderr** 抽编号；断言用**多重集完全相等**
     （连红因**行数**也要相等 ⇒ 连「同一条判据报了两次」也算失败）。
  ⑧ **每处注入都额外断言「改动行数 = 声明值」**：既防「破坏没打上」（补丁文本与代码失配 ⇒ 什么都没改
     ⇒ 对照全绿却像是判据有缝），也防「顺手多改了一行」。口径是**增量**（这一处 patch 动了多少行），
     不是累计 ⇒ 一档里 patch 两次也不会互相干扰。
  ⑨ **接线**：`package.json` 加 `check:css-braces-selftest`，**接在 `check:css` 之后**（GW4）；
     README 命令表加一行（RD3）；⚠️ **不登记进 `EXEMPT_SELFTEST`**（既接 build 又登记 ⇒ 自相矛盾）。
  ⑩ ⚠️ **本轮没有新增待拍板项**（纯工程补强，不涉审美与内容口径）；**中央台账不动**。

- **D59**（本轮修的是缺陷 **D59**）：这一轮**接着上一批的尾巴** —— 上一批给 `check-css-braces` 配了
  常驻自测，但 D59 行自己要求「分批做」，**还有 7 道**门禁仍无 `test-*` 配对。
  ① **本轮只做 D59 的第七批** ⇒ 只补 `check-wrapping` 这一道，其余 **6 道**继续挂着待做。
  ② **落点**：常驻自测 `scripts/test-wrapping.cjs` —— **24 档注入矩阵**，跑在**自造的最小夹具站**上
     （自造 `package.json` + 门禁副本 + 一张样式表 + 一个模板，**不依赖真 `_site`、不需要 git**）：
     **6 档绿档** / W1a–W1c / W2a–W2e / W3 / W4a–W4b 各一档 / **4 档判据级负对照** /
     **1 档精准性负对照** / **2 档覆盖度自证**。
  ③ **为什么在 6 道候选里挑它**：① `W` 前缀**已由本门禁占用**（全仓带冒号形式实测：另两个脚本里
     的 `W1` / `W3` 都是注释里写的「peer 的 W1/W3」⇒ 归属明确）⇒ 编号**沿用不换**（W1–W3 语义
     完全不变），只把红因统一成 `门禁 Wn：` 前缀并各配一个 `const Wn_ON = true;` 开关；② 它此前
     **零自证判据** ⇒ 它的判定从未被证明过会红；③ 扫描面是 CSS + 模板内联 `<style>` + `style`
     属性 ⇒ **夹具不需要 git、也不需要 `_site`** ⇒ 一批就能做完。
  ④ **实测发现两个真洞**（这是本批的额外收获，不是纯补强）：① **级联洞** —— 旧 `wrapDecls()` 只取
     一条规则里的**第一条** `overflow-wrap` 声明，而 CSS 是**后写覆盖先写** ⇒
     `p { overflow-wrap: anywhere; overflow-wrap: break-word; }` 的实际生效值是 `break-word`，
     旧门禁却读成 `anywhere` ⇒ **放行**，并且还打印「其中无 overflow-wrap: break-word」⇒ **一句明确的
     假话**；② **假阳性** —— `overflow-wrap: anywhere !important` 合法，旧门禁把整串当值比对 ⇒ **误报
     判红**。
  ⑤ **给门禁本体补自证判据并升级接线判定**（本轮新增的**行为变化**，如实记下）：① 红因文案统一成
     `门禁 Wn：` 前缀、每条配 `const Wn_ON = true;` 可卸把手（卸一条**不连带**关掉别条的计算）；
     ② **新增 W4「解析器自证」**（4 条合成样例：末位生效 / `!important` 压过普通声明 / `!important`
     被剥离 / 注释里的声明不算，任一不符 ⇒ 判红）—— 解析器一旦被改坏，门禁会安静地给出错的结论，
     而这种失效**不会**让门禁自己变红；③ **W3 从字符串匹配升级为沿 `npm run` 链遍历**（做法沿用
     CB4）—— 旧写法 `build.includes("check:wrap")` 会被本批新增的 `check:wrap-selftest` 名字骗过
     ⇒ 门禁被卸掉时旧写法反而判**绿**；④ 扫描面目录不在场时由**抛栈**改成返回 `[]` 并由 W1 判红。
  ⑥ **CSS 级联按正确语义实现**：生效值 = 有 `!important` 时取最后那条 `!important`，否则取最后一条
     普通声明；`!important` 从值里剥离。比「任何一条 break-word 都红」更准确，代价很小。
  ⑦ **红因文案统一带 `门禁 Wn：` 前缀**，自测只从 **stderr** 抽编号；断言用**多重集完全相等**
     （连红因**行数**也要相等 ⇒ 连「同一条判据报了两次」也算失败）+ **文案命中**。
  ⑧ **每处注入都额外断言「改动行数 = 声明值」**：既防「破坏没打上」，也防「顺手多改了一行」。
     口径是**增量**（这一处 patch 动了多少行），不是累计；**追加类**注入口径不同（末尾换行槽位会被
     算成多一行）⇒ 用「新增行数 + 前文未被动」。
  ⑨ **接线**：`package.json` 加 `check:wrap-selftest`，**接在 `check:wrap` 之后**（GW4）；
     README 命令表加一行（RD3）；⚠️ **不登记进 `EXEMPT_SELFTEST`**（既接 build 又登记 ⇒ 自相矛盾）。
  ⑩ ⚠️ **本轮没有新增待拍板项**（纯工程补强，不涉审美与内容口径）；**中央台账不动**。

- **D59**（本轮修的是缺陷 **D59**）：这一轮**接着上一批的尾巴** —— 上一批给 `check-wrapping` 配了
  常驻自测，但 D59 行自己要求「分批做」，**还有 6 道**门禁仍无 `test-*` 配对。
  ① **本轮只做 D59 的第八批** ⇒ 只补 `check-tracked-refs` 这一道，其余 **5 道**继续挂着待做。
  ② **落点**：常驻自测 `scripts/test-tracked-refs.cjs` —— **18 档注入矩阵**，跑在**临时 git 仓**上
     （`git init` + `git add` 造出的最小夹具仓：门禁副本 + 一个引用方 + 一个被引用方 + 一个仓外的
     「依赖」；**不依赖真 `_site`**，但**必须有 git** —— TR1/TR2/TR3 全都依赖「索引里的跟踪集合」，
     没有索引就没法测）：**3 档绿档** / T1a / T1b / T2a / T2b / T3 / T4a / T4b 各一档 /
     **4 档判据级负对照** / **2 档精准性负对照** / **2 档覆盖度自证**。
  ③ **为什么在 5 道候选里挑它**：① `TR` 前缀**已由本门禁独占**（第二批把 `check-tool-routes` 的
     TR1–TR4 改成 RT1–RT9 正是为了避开它）⇒ 编号**沿用不换**（TR1–TR2 语义完全不变），只把红因
     统一成 `门禁 TRn：` 前缀并各配一个 `const TRn_ON = true;` 开关；② 它此前**零自证判据** ⇒ 它的
     判定从未被证明过会红；③ 体量最小 ⇒ 一批就能做完；④ 另四道各有更重的依赖（`check-jsonld`
     依赖提交时间、`verify-site` 是纯数字编号且三处一一对应、`check-identity-derivation` 有五个载体
     家族与 ORACLE 真 URL、`check-artifact-metadata` 依赖 `site.js` 真值）。
  ④ **实测发现门禁本体上的两个真洞 + 一个口径洞**（这是本批的额外收获，不是纯补强）：
     ① **注释当引用** —— 旧门禁不剥注释 ⇒ 注释里写着一行指向不存在文件的本地 require 就会被当真引用
     ⇒ 对着一个**从没写过的文件**判红；② **字符串当引用** —— 旧门禁连字符串都不看 ⇒ 一段存着
     require 字样的普通字符串（自测脚本拼夹具时最常见）同样被当真引用；两者都是**假阳性** ⇒
     真正该报的那次反而被淹了；③ **TR2 的计数口径** —— 旧口径数「扫到的本地引用总数」，把**指向
     仓库外的依赖**也算进去 ⇒ 一份只引用 node_modules 的仓库也能让「自证存活」变绿 ⇒ 形同虚设。
  ⑤ **给门禁本体补自证判据**：① 红因文案统一成 `门禁 TRn：` 前缀、每条配 `const TRn_ON = true;`
     可卸把手（卸一条**不连带**关掉别条的计算）；② **新增 TR3「索引可读」** —— 旧代码在
     `git ls-files` 失败时打一行**裸红因**就 exit 1 ⇒ **其余判据根本没跑**（同一时刻的其它问题要等
     下次才看得到），本轮改成一条判据且**前提不在场时 TR1/TR2 整段跳过** ⇒ 红因**恰为 {TR3}**；
     ③ **新增 TR4「遮罩自证」**（6 条合成样例）—— 遮罩一旦失效，门禁会安静地给出错的结论，而这种失效
     **不会**让门禁自己变红；遮罩坏了 ⇒ TR1 的结论不可信 ⇒ 这一轮 TR1/TR2 整段跳过（红因**恰为 {TR4}**）。
  ⑥ **扫描改成两层遮罩**：注释整体遮掉（字符串里的双斜杠不是注释 ⇒ 先认字符串整段跳过）+ 字符串
     **不在引用位**时连内容一起遮掉（引用位 = 前面紧挨着 require( / import( / from / import）——
     `require` 语句里那个路径字符串**必须留着**，别处的字符串只是文字）。做法沿用仓库内已验证的
     `check-identity-derivation` 的字符串感知遮罩，**不另造轮子**。
  ⑦ **红因文案统一带 `门禁 TRn：` 前缀**，自测只从 **stderr** 抽编号；断言用**多重集完全相等**
     （连红因**行数**也要相等 ⇒ 连「同一条判据报了两次」也算失败）+ **文案命中**。
  ⑧ **每处注入都额外断言「改动行数 = 声明值」**：既防「破坏没打上」，也防「顺手多改了一行」。
     口径是**增量**（这一处 patch 动了多少行），不是累计；**追加类**注入口径不同（末尾换行槽位会被
     算成多一行）⇒ 用「新增行数 + 前文未被动」。
  ⑨ **接线**：`package.json` 加 `check:tracked-refs-selftest`，**接在 `check:tracked-refs` 之后**（GW4）；
     README 命令表加一行（RD3）；⚠️ **不登记进 `EXEMPT_SELFTEST`**（既接 build 又登记 ⇒ 自相矛盾）。
  ⑩ ⚠️ **本轮没有新增待拍板项**（纯工程补强，不涉审美与内容口径）；**中央台账不动**。

- **D59**（本轮修的是缺陷 **D59**）：这一轮**接着上一批的尾巴** —— 上一批给 `check-tracked-refs` 配了
  常驻自测，但 D59 行自己要求「分批做」，**还有 5 道**门禁仍无 `test-*` 配对。
  ① **本轮只做 D59 的第九批** ⇒ 只补 `check-artifact-metadata` 这一道，其余 **4 道**继续挂着待做。
  ② **落点**：常驻自测 `scripts/test-artifact-metadata.cjs` —— **26 档注入矩阵**，跑在**自造的最小
     夹具站**上（自造 `package.json` + 门禁副本 + `src/_data/site.js` + 一张首页 + 一张论文页；
     **不依赖真 `_site`、不需要 git**）：**4 档绿档**（基线 / 不带标记的链接不算 / 没注册产出物时豁免 /
     真源只有 license 时不报假红）/ **10 档注入**（M1a / M1b / M2a / M3a / M3b / M4a / M5a / M6a /
     M7a / M8a）/ **8 档判据级负对照**（N-M1–N-M8）/ **2 档精准性负对照**（P-M1 / P-M7）/
     **2 档覆盖度自证**（COV-A / COV-B）。
  ③ **为什么在 4 道候选里挑它**：① `M` 前缀**已由本门禁独占**（全仓按「编号 + 冒号」的形式扫过，
     没有第二道门禁在用 `M`）⇒ 编号**沿用不换**（M1–M6 语义不变），只把红因统一成 `门禁 Mn：` 前缀
     并各配一个 `const Mn_ON = true;` 开关；② 它此前**一条编号都没有**（红因是一句人话 ⇒ 自测无法
     按编号归属）⇒ 它的判定从未被证明过会红；③ 它只依赖 `src/_data/site.js` 真值 + 产物页，
     **不依赖 git** ⇒ 夹具站最轻。
  ④ **实测发现门禁本体上的三个真洞 + 一个口径洞**（这是本批的额外收获，不是纯补强）：
     ① **存在性判据** —— 论文页上指向代码仓的链接有**两条**（页头 "Code ↗" 按钮 + "Data and code
     availability" 段），旧 M4 用 `hrefs.includes(pub.code)` ⇒ 只要**一条**对就放行 ⇒ 另一条漂移
     （仓库改名 / 转移后只改一处）**没人叫**；② **子串匹配** —— 旧 M6 写的是
     `build.includes("check:artifact")`，而本批新增的 `check:artifact-selftest` 名字里**含**这个
     子串 ⇒ 门禁被卸掉时旧写法反而判**绿**；③ **总数自证** —— 旧实现的自证存活只看 `compared`
     是不是 0 ⇒ 只要 M2 / M3 / M4 里任何一条还在比，它就非 0 ⇒ **M1 整段被摘掉也照样判绿**；
     ④ **license 口径不同源** —— 旧门禁的期望值是 `sw.licenseUrl || undefined`，而模板
     （`eleventy.config.js` 的 `jsonLdPaper`）投影的是 `sw.licenseUrl || sw.license` ⇒
     `licenseUrl` 被删时**页面是对的、门禁报假红**。
  ⑤ **给门禁本体补自证判据**：① 红因文案统一成 `门禁 Mn：` 前缀、每条配 `const Mn_ON = true;`
     可卸把手（卸一条**不连带**关掉别条的计算）；② **新增 M7「前提可读」**（真源不可读 / 论文页
     不存在 / JSON-LD 块坏 / **一个 JSON-LD 块都没有** ⇒ 报 M7 且依赖判据整段豁免 ⇒ 红因**恰为
     {M7}**）；③ **新增 M8「逐比较点覆盖度自证」**（**26 个比较点逐一登记 + 逐一记账** ⇒ 任何
     一整块判据被摘掉都会被抓到；比较点目录必须**静态** —— 动态登记的话，删掉一整块判据时它连同
     自己的比较点一起消失 ⇒ M8 反而判绿）；④ **M6 从子串匹配升级为沿 `npm run` 链遍历**
     （做法沿用 `check-css-braces` 的 CB4）。
  ⑥ **模板侧只加标记、不改版式**：`paper.njk` 的两处代码仓链接补 `data-code-repo` 属性；M4 改成
     **标记定位**（论文页「至少一条带标记的链接，且**每一条** href 都必须等于 `pub.code`」；
     首页保留「**恰好一条** + 那条要对」⇒ **不放宽**）。
  ⑦ **M1 / M2 的 license 期望值改成与模板同源**（`licenseUrl || license`）⇒ 修的是**假阳性**，
     不是把检查关掉。
  ⑧ **红因文案统一带 `门禁 Mn：` 前缀**，自测只从 **stderr** 抽编号；断言用**多重集完全相等**
     （连红因**行数**也要相等）+ **文案命中**；每处注入都额外断言**改动行数 = 声明值**。
  ⑨ **接线**：`package.json` 加 `check:artifact-selftest`，**接在 `check:artifact` 之后**（GW4）；
     README 命令表加一行（RD3）；⚠️ **不登记进 `EXEMPT_SELFTEST`**（既接 build 又登记 ⇒ 自相矛盾）。
  ⑩ ⚠️ **本轮没有新增待拍板项**（纯工程补强，不涉审美与内容口径）；**中央台账不动**。

- **D59**（本轮修的是缺陷 **D59**）：这一轮**接着上一批的尾巴** —— 上一批给 `check-artifact-metadata` 配了
  常驻自测，但 D59 行自己要求「分批做」，**还有 4 道**门禁仍无 `test-*` 配对。
  ① **本轮只做 D59 的第十批** ⇒ 只补 `check-identity-derivation` 这一道，其余 **3 道**继续挂着待做。
  ② **落点**：常驻自测 `scripts/test-identity-derivation.cjs` —— **34 档注入矩阵**，跑在**自造的最小
     夹具站**上（自造 `package.json` + 门禁副本 + `scripts/lib/identity.cjs` + `src/_data/site.js` +
     两个 `.njk` 模板 + 两个 `.11tydata.cjs` + `src/eleventy-helpers.cjs` + `eleventy.config.js`；
     **不依赖真 `_site`、不需要 git**）：**4 档绿档**（基线 / 注释里的身份 URL 豁免 / 豁免扩展名生效 /
     只查完整字面量不做 URL 形态匹配）/ **12 档注入**（ID0a / ID1a / ID2a / ID3a / ID4a / ID5a / ID6a /
     ID6b / ID6c / ID6c' / ID6d / ID7a）/ **11 档判据级负对照**（N-ID0–N-ID7）/ **2 档精准性负对照**
     （P-ID1 / P-ID7）/ **2 档覆盖度自证**（COV-A / COV-B）/ **3 档退回旧口径自检**（RE-1 / RE-2 / RE-3）。
  ③ **为什么在 4 道候选里挑它**：① `ID` 前缀**已由本门禁独占**（全仓按「编号 + 冒号」的形式扫过，
     没有第二道门禁在用 `ID`）⇒ 编号**沿用不换**（ID0–ID6 语义不变），只把红因统一成 `门禁 IDx：` 前缀
     并各配一个 `const IDx_ON = true;` 开关；② 它此前**23 处 `fail()` 一处没带编号** ⇒ 它的判定从未被
     证明过会红；③ 它**不依赖 git**（`check-tracked-refs` 必须有 git）⇒ 夹具站最轻。
  ④ **实测发现门禁本体上的三个真洞**（这是本批的额外收获，不是纯补强）：
     ① **恒等式假自证** —— 旧实现的「自证存活」三条（`siteChecked` / `templateChecked` /
     `configChecked`）都直接赋值 `ORACLE_SAMEAS.length` ⇒ `!== EXPECTED_COUNT` **永远为假** ⇒ 那三条
     自证**永远不会红**，而它们就写在「一条都没查 = 判据本身没生效」的注释下面（本门禁最坏的一种状态：
     一条永远不会红的自证，给出了看起来很确定的绿）；而且它们数的是「URL 条数」这个**常量**，不是
     「读过几个文件」；② **无可卸开关** ⇒ 判据级负对照无从谈起（某整块判据被摘掉仍判绿）；
     ③ **编号只活在注释里** —— 文件头声称「ID1–ID5」而实现用 ID0–ID6 ⇒ 门禁自己的文件头与实现脱节。
  ⑤ **给门禁本体补自证判据**：① 红因文案统一成 `门禁 IDx：` 前缀、每条配 `const IDx_ON = true;`
     可卸把手（`ID6a`–`ID6d` 各自独立，卸一条**不连带**关掉别条的计算）；② **新增 ID7「逐比较点覆盖度
     自证」**（**21 个比较点静态登记 + 逐一记账** ⇒ 任何一整块判据被摘掉都会被抓到；比较点目录必须
     **静态** —— 动态登记的话，删掉一整块判据时它连同自己的比较点一起消失 ⇒ ID7 反而判绿）；
     ③ 补两条**结构自证**（家族点数 ↔ `CARRIER_FAMILIES.length`、`ORACLE_SAMEAS.length` ↔
     `EXPECTED_COUNT`）⇒ 「少登记一个家族 / 改了期望集却没改常量」也会被抓到。
  ⑥ **前提缺失 ⇒ 相关比较点豁免**（`site.js` 读不到 ⇒ 豁免 `ID1.` / `ID2.`；模板列表空 ⇒ 豁免 `ID4.`；
     `eleventy.config.js` 读不到 ⇒ 豁免 `ID5.`；家族列不出文件 ⇒ 豁免该家族点）；**判据被卸掉 ⇒ 它的
     比较点不算缺失**（否则「卸判据」永远转不了绿，负对照不成立）。
  ⑦ **自测里踩到的四个坑（如实记下，都是"注入手法"层面的）**：① **注入必须同行替换** —— 改成两行会让
     后面所有行位移，而「改动行数」是**位置口径** ⇒ 几百行全被算成改动，断言直接失效；
     ② **整段摘除的起止锚点必须含整段** —— 只从 `const configSource = …` 起摘会原地留下悬空的
     `try {`，只收到 `waivePrefix("ID5.");` 止会原地留下 catch 的 `}` ⇒ 门禁副本直接语法错误，红因变成
     「语法错」而不是「判据失效」，归属全废 ⇒ 改成「从段注释起、到 catch 的 `}` 止」；
     ③ **覆盖度目录的 `min` 取值有两种写法**（字面量数字与常量名）⇒ 目录正则两种都要认，否则数出来的
     目录项偏少，「自报数量 == 独立数出的数量」就成了一句空话；
     ④ **「前提不在场」那一档要挑对删哪个文件** —— 删 `site.js` 会连带触发 ID6c（`alreadyScanned` 只在
     真读到它时才含它，而清单里已经没有它）⇒ 红因变成三条、归属不纯净；删 `eleventy.config.js` 不触发
     （构建配置层家族**无条件**返回它）⇒ 红因**恰为 {ID4, ID5}**。
  ⑧ **红因文案统一带 `门禁 IDx：` 前缀**，自测只从 **stderr** 抽编号；断言用**多重集完全相等**
     （连红因**行数**也要相等）+ **文案命中**；每处注入都额外断言**改动行数 = 声明值**。
  ⑨ **接线**：`package.json` 加 `check:identity-derivation-selftest`，**接在 `check:identity-derivation`
     之后**（GW4）；README 命令表加一行（RD3）；⚠️ **不登记进 `EXEMPT_SELFTEST`**（既接 build 又登记 ⇒
     自相矛盾）。
  ⑩ ⚠️ **本轮没有新增待拍板项**（纯工程补强，不涉审美与内容口径）；**中央台账不动**。

- **D59**（本轮修的是缺陷 **D59**）：这一轮**接着上一批的尾巴** —— 上一批给 `check-identity-derivation` 配了
  常驻自测，但 D59 行自己要求「分批做」，**还有 3 道**门禁仍无 `test-*` 配对。
  ① **本轮只做 D59 的第十一批** ⇒ 只补 `check-jsonld` 这一道，其余 **2 道**继续挂着待做。
  ② **落点**：常驻自测 `scripts/test-jsonld.cjs` —— **38 档注入矩阵**，跑在**自造的最小夹具站**上
     （自造 `src/_data/site.js` + 两个 `.njk` + 三个产物 HTML + 门禁副本 + `scripts/lib/page-deps.cjs` +
     `scripts/lib/git-error.cjs` + **一个临时 git 仓**；**不依赖真 `_site`**，但**需要一个 git 仓** ——
     J11 的 dateModified 取的是**提交时间**，没有 git 就造不出可比的时间戳）：**4 档绿档**（G0–G3）/
     **14 档注入**（J0–J12，含 J11b）/ **14 档判据级负对照**（N-J0–N-J12，含 N-J11b）/ **3 档精准性**
     （P-J10a / P-J10b / P-J11a）/ **3 档退回旧口径自检**（RE-1 / RE-2 / RE-3）。
  ③ **为什么挑它**：`check-identity-handles` 由**并发场次**在改 ⇒ 本轮不碰；`verify-site` 是剩下的最后一道
     ⇒ 留到下一批收尾。`check-jsonld` 的 `J` 前缀**已由本门禁独占**（全仓按「编号 + 冒号」的形式扫过）
     ⇒ 编号**沿用不换**（J1–J11 语义不变），只把红因统一成 `门禁 Jx：` 前缀；它此前 **43 处 `fail()`
     只有 9 处带编号** ⇒ 大半红因无法按编号归属，判定从未被证明过会红。
  ④ **实测发现门禁本体上的四个真洞**（本批的额外收获，不是纯补强）：① **编号与实现脱节** —— 文件头声称
     「J1–J11」，而实现里 **J3 与 J4 是合并的一段**（J4 的前提是 `pageNodes===1 && websites===1` ⇒ 被 J3
     绑住 ⇒ J3 一挂 J4 也跟着哑火）；② **JSON-LD 块解析失败没有自己的判据** —— 块坏了会掉进「实体数不对」
     这类别的判据里 ⇒ 归属错位；③ **零可卸开关** ⇒ 判据级负对照无从谈起（某整块判据被摘掉仍判绿）；
     ④ **零覆盖度自证** ⇒ 同上。
  ⑤ **给门禁本体补判据**：① 红因文案统一成 `门禁 Jx：` 前缀、**43 处 `fail(` 全部编号化**并逐条归属；
     ② **新增 J0「JSON-LD 块可解析」**与 **J12「逐比较点覆盖度自证」**（**23 个比较点静态登记 + 逐一
     记账** ⇒ 任何一整块判据被摘掉都会被抓到）；③ **把 J3 与 J4 拆成两段**（J4 的前提从
     `pageNodes===1 && websites===1` 放宽为 `pageNodes===1`）；④ 补 `J0_ON`–`J12_ON` 十三个可卸把手并
     **接进 `fail()`**（**计算照做**，只是不记红因 ⇒ 卸一条不连带关掉别条）；⑤ 补一条结构自证（每个
     `SWITCH_ON` 键须在 `COVERAGE_POINTS` 有落点）。
  ⑥ **覆盖度模型**：每个非错误页都要 mark 或逐页 waive；全站级项按 `hitCount >= min` 记账；**前提不在场
     ⇒ 相关比较点显式豁免**；**判据被卸掉 ⇒ 它的比较点不算缺失**（否则「卸判据」永远转不了绿，负对照
     不成立）；**比较点目录必须静态**（动态登记 ⇒ 删掉一整块判据时它连同自己的比较点一起消失 ⇒ J12
     反而判绿）。
  ⑦ **自测里踩到的坑（如实记下，都是「注入手法」层面的）**：① **注入一律同行替换** —— 改成两行会让后面
     所有行位移，而「改动行数」是**位置口径** ⇒ 几百行全被算成改动，断言直接失效；**会插行的注入改用
     行数增量口径**；② **止锚点必须含整段** —— J12 那一档若只收到 `\n    }` 会原地留下悬空的 `} else {`
     ⇒ 门禁副本语法错 ⇒ 红因变成「语法错」而不是「判据失效」，归属全废；③ **追加类注入不能用「改动
     行数」口径**；④ **红因归属有结构性耦合** —— J5 的注入连带 J1（论文页 `isPartOf` 指向变了 ⇒ J1 的 URL
     断言也红）⇒ 自测把它**同步改到新 `@id`** 让 J3 自洽 ⇒ 红因**恰为 {J1, J5}**；J11b（image 整个没了）
     连带 J7（image 比对从未发生 ⇒ 存活自证理应红）⇒ 红因**恰为 {J11, J7}**，负对照里如实留 J7、不硬凑；
     ⑤ **J7 注入故意把两页的 profilePage 注释掉** ⇒ 得 **{J7, J7}**（j10Declared 与 j10ProfilePages 各一条）。
  ⑧ **红因文案统一带 `门禁 Jx：` 前缀**，自测只从 **stderr** 抽编号；断言用**多重集完全相等**
     （连红因**行数**也要相等）+ **文案命中**；每处注入都额外断言**改动行数 = 声明值**；收尾校验**门禁
     原件 SHA-256 未变**（所有注入都发生在副本上）。
  ⑨ **接线**：`package.json` 加 `check:jsonld-selftest`，**接在 `check:jsonld` 之后**（GW4）；README 命令表
     加一行（RD3）；⚠️ **不登记进 `EXEMPT_SELFTEST`**（既接 build 又登记 ⇒ 自相矛盾）。
  ⑩ ⚠️ **本轮没有新增待拍板项**（纯工程补强，不涉审美与内容口径）；**中央台账不动**。

- **D59**（本轮修的是缺陷 **D59**）：这一轮**接着上一批的尾巴** —— 上一批给 `check-jsonld` 配了
  常驻自测，但 D59 行自己要求「分批做」，**还有 2 道**门禁仍无 `test-*` 配对。
  ① **本轮只做 D59 的第十二批** ⇒ 只补 `verify-site` 这一道；其余 **1 道**（`check-identity-handles`，
     由**并发场次**在改）继续挂着待做。
  ② **落点**：常驻自测 `scripts/test-verify-site.cjs` —— **77 档注入矩阵**，跑在**真实产物的只读副本 +
     每档独立的沙箱源码副本**上（产物侧共用一份 `_site` 副本；源码侧每档单独一份；`METEO_REPO_ROOT`
     注入缝让沙箱借到真仓库的 git 历史 —— 门禁 18 的 dateModified 取的是**提交时间**，没有 git 就造不出
     可比的时间戳）：**1 档基线**（G-BASE）/ **35 档注入**（INJ-*）/ **35 档判据级负对照**（NEG-*）/
     **3 档精准性**（P-33a / P-33b / P-33c）/ **2 档退回旧口径自检**（R-1 / R-2）/ **1 档原件未改**（G-IMMUT）。
  ③ **为什么挑它**：`check-identity-handles` 由**并发场次**在改 ⇒ 本轮不碰；`verify-site` 是剩下的最后
     一道 ⇒ 本批收尾。它的编号体系是**纯数字**（1–32 + 4b/4c）⇒ **沿用不换**；它此前 **133 处 `fail()`
     调用一条编号都没有** ⇒ 红因无法按编号归属，判定从未被证明过会红。
  ④ **实测发现门禁本体上的四个真洞**（本批的额外收获，不是纯补强）：① **零编号** —— 红因是一句裸人话，
     负对照没法指名到具体判据；② **零可卸把手** ⇒ 判据级负对照无从谈起（某整块判据被摘掉仍判绿）；
     ③ **零覆盖度自证** ⇒ 同上；④ **资源叉检查散在别处** ⇒ 没有自己的判据编号，归属错位。
  ⑤ **给门禁本体补判据**：① 红因文案统一成 `门禁 <id>：…` 前缀、**133 处 `fail(` 全部编号化**并逐条归属
     （**归属靠「所在门禁段」静态判定**，133 处无一在 function 体内 ⇒ 可脚本化自动插号）；② 补 **35 个可卸
     把手**（`G<id>_ON`）并**接进 `fail()`**（**计算照做**，只是不记红因 ⇒ 卸一条判据不连带关掉别条）；
     ③ **新增 0 号门禁**（收集产物文件 + 查 macOS 资源叉）与 **33 号门禁「逐比较点覆盖度自证」**
     （**34 个比较点静态登记 + 逐一记账** ⇒ 任何一整块判据被摘掉都会被抓到；33 **不把自己列入目录**，
     避免自证自我循环）；④ 补 `METEO_REPO_ROOT` 注入缝；⑤ 产物为空时对逐页检查**显式豁免并写明原因**，
     不许悄悄不跑。旧号→新号对照表补 `（无） → 新 0` 与 `（无） → 新 33`。
  ⑥ **覆盖度模型**：每个门禁段首 mark 一个比较点（与段同生共死 ⇒ 整块被摘时 mark 一起消失）；前提不在场
     ⇒ 相关比较点**显式豁免**并计入分母；**判据被卸掉 ⇒ 它的比较点不算缺失**（否则负对照不成立）；
     **比较点目录必须静态**（动态登记 ⇒ 删掉一整块判据时它连同自己的比较点一起消失 ⇒ 33 反而判绿）。
  ⑦ **自测里踩到的坑（如实记下）**：① **门禁 33 是在编号步骤之后才插入的** ⇒ 它的 `fail()` 一度没编号，
     红因变成 `门禁 <消息>：undefined` ⇒ 教训：**任何在编号之后新增的判据都要补编号**；② **沙箱复制不保
     mtime** ⇒ 门禁 17（robots.txt 的生成时刻 vs 源文件最后一次修改时刻）**误报**，首跑 72/77 档连锁失败
     ⇒ 修法：复制一律带 `preserveTimestamps`（小文件与 `_site` 副本都要）；③ **注入一律插在「该门禁自己
     的段首」** ⇒ 无需逐门禁手写触发器，且红因**归属天然纯净**（红因编号集合恰为该门禁一个）；④ **异步化
     之后 `results` 里推的必须是 await 后的结果** —— 推 Promise 会让每档的 `ok` / `id` 全是 undefined
     ⇒ 77 档全误判成失败；⑤ **同步 `spawnSync` 会让并发 worker 退化成串行** ⇒ 整份自测从约 45 秒变约
     175 秒 ⇒ 必须用异步 `execFile`。
  ⑧ **红因文案统一带 `门禁 <id>：` 前缀**，自测只从 **stderr** 抽编号；断言用**编号集合完全相等**（红因
     归属**恰为该门禁一个**）+ **文案命中**；收尾校验**门禁原件 SHA-256 未变**（所有注入都发生在副本上）。
  ⑨ **接线**：`package.json` 加 `check:verify-site-selftest`，**接在 `check:site` 之后**（GW4）；README 命令表
     加一行（RD3）；⚠️ **不登记进 `EXEMPT_SELFTEST`**（既接 build 又登记 ⇒ 自相矛盾）。
  ⑩ ⚠️ **本轮没有新增待拍板项**（纯工程补强，不涉审美与内容口径）；**中央台账不动**。

- **D60**（本轮修的是缺陷 **D3**）：这一轮**离开 D59 缺陷线** —— D59 的门禁补配只剩
  `check-identity-handles`（由**并发场次**在改）⇒ 按「清单里取一条来修」的规矩，改走**不挂拍板项**的
  待修缺陷 **D3**（分享图体积 + `og:image:type` 同步）。
  ① **为什么它不挂拍板**：D3 行的验收条件写死「被 `og:image` 引用的那张图 **≤ 200 KB**
     （JPEG 即可，社交平台通吃），且 `og:image:type` 与实际格式一致」⇒ 判据可判定、修法唯一
     ⇒ 属**纯工程补强** ⇒ 本轮**不代拍、也不新增待拍板项**（中央台账不动）。
  ② **实测发现的问题**：三张 og 图合计约 **1.5 MB**（PNG 分别是 647,055 / 469,811 / 443,535 B）
     ⇒ 社交平台每次抓取都要下载数百 KB；同目录虽有 `.svg` 母版，但社交平台不支持 SVG 当 og:image。
  ③ **做法**：三张图由 SVG 母版 → `rsvg-convert` → `sips` 转 **JPEG(q=90)**
     （107,358 / 113,997 / 112,615 B，合计约 1.5 MB → 334 KB）；**仓库只留 JPEG**，三张 PNG 已删；
     `site.js` 的 `ogImage` 指到 `.jpg`；模板层新增 `imageMime` filter 推导 MIME
     （og 家族与 twitter 家族共用同一出处）⇒ `og:image:type` 不再写死。
  ④ **顺手修掉一处同源走样**：模板里 WebSite JSON-LD 的 `"image"` 原本**写死** `.png` 路径 ⇒
     换格式后会留下一个 404 引用 ⇒ 一并改为 `site.ogImage`。
  ⑤ **门禁**：`check-image-assets` 扩到 **IA1–IA10**，新增 **IA9「分享图体积 ≤ 200 KB」**
     （阈值 204,800 B）与 **IA10「`og:image:type` 与真实魔数相符」**（MIME 一律读魔数不信扩展名），
     两条都带**空跑防护**；**测量与计数放在判定开关之外** ⇒ 卸开关不会连带卸掉空跑防护。
  ⑥ **自测**：`test-image-assets` 从 **14 档扩到 20 档**（新增 IM14 超限 / IM15 类型不符 /
     IM16 类型缺失 / IM17 空跑防护 / IM18 卸 IA9 / IM19 卸 IA10）。
  ⑦ **自测里踩到的坑**：① **注入必须真的把文件写大** —— 零像素会被 deflate 压回几 KB ⇒
     改用确定性伪随机像素；② **IM8 的期望集合必须写成 {IA6, IA9, IA10}** —— IA6 那一支要求全站
     本地图引用全断 ⇒ 必然连带触发 IA9/IA10 的空跑防护（**结构性依赖**，不是缺陷）；
     ③ **体积必须用 `fs.statSync().size` 量**（读前 64 KB 的取尺寸路径量不到全量）。
  ⑧ **文档**：`docs/DEFECT-BACKLOG.md` 的 D3 行改「已修」；README 命令表补新判据与档数；
     `docs/og-image-and-a11y-report.md` **保留历史快照表格原样**，只在顶部加现状指针与引用块。
  ⑨ ⚠️ **本轮没有新增待拍板项**（纯工程补强）；**中央台账不动**。

- **D61**（本轮修的是缺陷 **D59**）：这一轮**回到 D59 缺陷线并把它收尾** —— D59 要求给 13 道没有
  `test-*` 配对的门禁逐个补常驻自测；前 12 批补完 12 道，**剩最后一道 `check-identity-handles`**。
  ① **为什么这轮不编号化**：该门禁的判据**一条编号都没有**（红因全是「一句裸人话」），而门禁本体
     **被并发场次占用、本轮不得触碰** ⇒ 补编号与加可卸开关都做不了 ⇒ 改用两个**等价替代**（见 ③④）。
  ② **自测**：`scripts/test-identity-handles.cjs`（**37 档注入矩阵** IH0–IH36 ＋ **30 档判据级负对照**
     NC1–NC30），跑在**自造的最小夹具站**上（门禁副本 ＋ 生成的 `scripts/lib/identity.cjs` ＋ 生成的
     `src/_data/site.js` ＋ `footer.njk` 副本 ＋ 自造 `_site` 产物），**不依赖真 `_site`、不需要 git**。
  ③ **红因归属用「判据文案片段集合」代替「编号集合」**：每条判据登记一个**互不包含**的唯一文案片段
     （运行时自证：片段确实存在于门禁源码、且片段之间互不包含），断言红因命中集合**恰为**期望集合，
     **多一条少一条都算失败** ⇒ 红因归属不纯当场判红。
  ④ **判据级负对照用「门禁副本里卸判据」**：把该判据的守卫条件**同行替换为永假**（**行数不变**、
     与基线副本逐行比对**只差一行** ⇒ 证明卸的是这一条、不是把门禁整个关掉）后重跑同一注入 ⇒
     目标红因必须消失、其余红因照旧。
  ⑤ **覆盖度自证**：判据清单**静态登记**（12 条），要求每条都至少有一档、且能在门禁源码里找到；
     另有**门禁原件逐字节未变**断言（注入与负对照只改副本，不碰门禁本体）。
  ⑥ **夹具的句柄、期望集与判据范围全部运行期派生**（取自 `scripts/lib/identity.cjs` 与门禁源码里
     解析出的 `ORACLE_SAMEAS` / `SCOPE_KEYS`）⇒ 自测源码里**不写死任何真实句柄或真实字段名**；
     假数据一律用保留域与明显无效形态。
  ⑦ **结构性连坐如实写进期望集合**（不藏起来）：例如「产物清空」必然连带触发多条判据的空跑防护，
     这些档位的期望集合就是**多条**，而不是硬凑成一条。
  ⑧ **独立反向验证**：另跑一份不经自测脚本的手工夹具（真实 `site.js` ＋ 空产物）⇒ 门禁确实 exit 1
     且打出真实红因 ⇒ 自测矩阵不是「自说自话」。
  ⑨ **接线**：新增 npm script `check:identity-handles-selftest` 并**接进 `npm run build`**（GW4），
     README 命令表补一行（RD3）⇒ **不登记进 `EXEMPT_SELFTEST`**（两者同时做会判自相矛盾）。
  ⑩ ⚠️ **本轮没有新增待拍板项**（纯工程补强）；**中央台账不动**。
- **D62**（本轮修的是缺陷 **D60**）：这一轮给 `check-404-depth` 这道门禁**补判据编号 + 把它的自测补成四件套**
  —— 它原先的「找不到 404 产物」判据是**裸红因**（一条编号都没有），自测也只有 11 处注入，
  **零覆盖度自证、零判据级负对照、零「门禁没被卸掉」** ⇒ 红因归属不纯、判据能不能变红没人看守。
  ① **门禁侧**：给「找不到 404 产物」补编号 **E0** ⇒ 判据面变成 **E0–E3** 四条、**每条都有编号**。
  ② **判定逻辑与阈值一字未改**（`MIN_INTERNAL_URLS = 8` 等全部原样）⇒ 本轮只改「红因可不可归属」，
     不改「什么算不合格」。
  ③ **E0 与 E1/E2 拆成两段独立语句**：原先写成 `if (!has404) {…} else {…}` 时，摘掉 E0 的守卫条件
     会连带让 `else` 分支去读不存在的文件、**直接把门禁读崩** ⇒ 「E0 的红因消失」退化成「门禁崩了」，
     红因归属不纯。拆开后新增 `has404` / `html404Src` 两个常量，E0 与 E1/E2 各自独立守卫。
  ④ **自测侧**：把 `scripts/test-404-depth.cjs` 整文件重写为**四件套** ——
     **红因归属表**（`CAUSES` 四条互不包含的红因文案片段，运行时自证片段存在 + 互不包含）、
     **归属纯净**（命中集合**恰为**期望集合，多一条少一条都算失败；每条 `✗` 行都必须能归类）、
     **覆盖度自证**（`CRITERIA` 静态登记 ＋ **双向对齐**）、**门禁原件逐字节未变**。
  ⑤ **注入档 N0–N4**：N0 基线判绿；N1（404 页 CSS 改相对 ⇒ E1）、N2（404 站内链接挪到站外 ⇒ E2）、
     N3（首页链接改根绝对 ⇒ E3）、**N4 新增**（把 404 产物整个拿走 ⇒ **E0**）—— E0 此前**无档可证**。
  ⑥ **判据级负对照 NC1–NC4**：在**门禁副本**里把该判据的守卫条件**同行替换为永假**（行数不变、
     与基线副本逐行比对**只差一行**）⇒ 目标红因必须消失、其余红因照旧 ⇒ 四档全部干净转绿。
  ⑦ **覆盖度自证升级为「双向对齐」**（超出 D61 的单向口径）：静态清单 ↔ 门禁 `fail()` 调用数 ↔
     门禁源码里解析出的判据编号，**三者必须一致** ⇒ 能抓住「门禁新增编号判据」与
     「门禁新增没编号裸红因」两类单向口径抓不到的洞。
  ⑧ **自测自身两处补课**：红因**自带判据编号**（`期望红因判据：E1` 这类措辞）；
     `bail()` 中止时**一并带出已累积的失败明细**（否则失败无法指名到具体判据）。
  ⑨ **独立反向验证**：另跑一份**不经自测脚本**的手工夹具（正对照 1 档 ＋ 破坏 7 档：卸 E1/E0/E2 守卫、
     改 E3 红因文案、加一条**没编号**裸红因、加一条**已编号**判据、把 E2 门槛降到 0）
     ⇒ **8 档全部符合预期**（自测在每种改坏下都 exit 1 且红因指名到具体判据）⇒ 自测不是空跑。
  ⑩ **接线不变**：`check:404-depth-selftest` 早已接在 build 链上 ⇒ **build 链段数不变、README 不用改**。
  ⑪ ⚠️ **本轮没有新增待拍板项**（纯工程补强）；**中央台账不动**。
- **D63**（本轮修的是缺陷 **D61**）：这一轮把 `check-tag-leak` 这道门禁的**自测**补成四件套 ——
  它原先只有 7 档注入，断言只查「输出里**含**判据编号」与「**含**被点名的那个字符串」，
  **零覆盖度自证、零判据级负对照**，而且有**四条红因无档可证**（能不能变红没人证明）。
  ① **红因归属表**（`CAUSES` 11 条）：本门禁**一个编号覆盖多条红因**（`T1` 三条、`T2` 两条、`T3` 两条、
     `T4` 三条、`T5` 一条）⇒ 每条红因登记一个**唯一**文案片段（判据号 ＋ 片段），运行时自证片段
     确实存在、且片段之间**互不包含**。
  ② **归属纯净**：红因命中的判据集合**恰为**期望集合（多一条少一条都算失败）；每条红因行都必须能
     **唯一归类**（归不了类 ⇒ 出现了本自测不知道的新红因 ⇒ 同样判红）。
  ③ **覆盖度自证拆成两条**（因一编号多红因，`fail()` 调用数 11 ≠ 判据数 5，**不能比长度**）：
     (a) `fail()` 调用数 == 归属表条数（11 == 11）⇒ 抓住「多了一条没编号的裸红因」；
     (b) 门禁里解析出的判据**集合** == 静态清单（`T1`–`T5`）⇒ 抓住「多了一条新判据」。
     ⚠️ 口径补洞：数的是**全部** `fail()` 调用点（单行与多行模板字面量两种写法都算）—— 只数多行
     那一种的话，加一条**单行**裸红因就数不到 ⇒ 那条防线会变成空话。
  ④ **注入档 11 档**（N0–N10）：N0–N6 的**注入手法**保持原样，但期望集合改成**恰为**，**如实写出
     结构性连坐**（N1 实际 `T1`+`T5`、N3 实际 `T2`+`T5`、N4 实际 `T2`+`T3` —— 旧版只声称其中一条，
     却一直全绿）；**N7–N10 新增**，让四条原本**无档可证**的红因各自有档：N7 内容目录推不出集合名
     （空跑防护）、N8 详情页版式语法坏掉（渲染失败）、N9 详情页改版式找不到 meta 行、
     N10 列表页语法坏掉（渲染失败）。
  ⑤ **判据级负对照 NC1–NC5**：在**门禁副本**里把该判据的**每一条** `fail()` 调用**同行**加
     `if (false) ` 前缀（**行数不变**、与基线副本逐行比对**只差该判据的调用数**）⇒ 目标红因消失、
     其余红因照旧。
     ⚠️ 为什么不改用「守卫条件替换为永假」：`T2` 的守卫 `if (metaTags === null)` 与后面的 `else`
     分支耦合 —— 改成永假会让 `else` 分支去读 `null` 的 `metaTags.includes` ⇒ **直接崩门禁**，
     「目标红因消失」退化成「门禁崩了」，红因归属反而不纯。改用「静默该判据的每一条 `fail()` 调用」：
     不动控制流、零崩溃风险。
  ⑥ **锚点运行时派生**：`fail()` 调用点按归属表的文案片段认领，门禁改了缩进或换了写法自测会跟着走；
     详情页 meta 行的 class 名也从**门禁源码**派生（不写死）⇒ 自测源码里不写死任何真实标识。
  ⑦ **独立反向验证**：另跑一份**不经自测脚本**的手工矩阵（正对照 1 档 ＋ 破坏 7 档：卸掉 `T1` 的三条
     `fail()`、改掉 `T5` 的红因文案、多一条**没编号**裸红因、多一条**已编号**判据 `T6`、把 `T3a` 的
     文案改成与 `T2b` 的片段重叠、把 `T1c` 的守卫改成永真、删掉 `T5` 的 `fail()` 调用）⇒ **8 档全部
     符合预期**（每次改坏自测都 exit 1，红因指名到具体判据）⇒ 自测不是空跑。
  ⑧ **门禁本体一字未改**：`check-tag-leak.cjs` 的 11 处 `fail()` 早已全部带编号、无裸红因 ⇒
     本轮只改自测，不动生产门禁的公开契约（`T1`–`T5` 写在门禁文件头）。
  ⑨ **接线不变**：`check:tag-leak-selftest` 早已接在 `npm run build` ⇒ **build 链段数不变、
     README 不用改**。
  ⑩ ⚠️ **本轮没有新增待拍板项**（纯工程补强）；**中央台账不动**。
- **D64**（本轮修的是缺陷 **D62**）：这一轮把 `check-mount-contract` 这道门禁的**自测**补成四件套 ——
  它原先只有 5 档注入（MT0–MT4），断言只查「输出里**含** `MC1`/`MC2`/…」，
  **零覆盖度自证、零判据级负对照**，而且有**四条红因无档可证**
  （MC2 的「扫描范围里没有 README.md」、MC3 的「找不到配置文件」与「找不到 `addFilter("relUrl")`」、
  MC4 的「承诺一条都没检出」）。
  ① **红因归属表**（`CAUSES` 8 条）：门禁 8 处 `fail()` **全部带编号、无裸红因**，
     但**一个编号覆盖多条红因**（`MC1` 1 条、`MC2` 2 条、`MC3` 3 条、`MC4` 2 条）
     ⇒ 每条红因登记一个**唯一**文案片段（判据号 ＋ 片段），运行时自证片段确实存在、
     且片段之间**互不包含**。
  ② **归属纯净**：红因命中的判据集合**恰为**期望集合（多一条少一条都算失败）；
     每条红因行都必须能**唯一归类**（归不了类 ⇒ 出现了自测不知道的新红因）。
  ③ **覆盖度自证（双向）**：`fail()` 调用点数 8 == 归属表 8 条、每条归属恰好认领**一个**调用点、
     门禁里解析出的判据**集合** == 静态判据清单、每条红因与每条判据都**至少一档判红**。
  ④ **判据级负对照** NC1–NC4：在门禁**副本**里把该判据的**每一条** `fail()` 调用**同行**加
     `if (false) ` 前缀（**行数不变**、与基线副本逐行比对**只差该判据的调用数**）
     ⇒ 目标红因消失、**其余红因照旧**。
  ⑤ **注入档 13 档**：旧 5 档手法不变、期望改成「恰为」；新增 7 档覆盖原本无档可证的红因
     与连坐场景（含 MT8 抹掉全部承诺措辞 ⇒ `MC2`+`MC4` 连坐、MT9 两处同时失去限定 ⇒ 2 条红因）。
  ⑥ **独立反向验证**：正对照 1 档 ＋ 破坏 8 档 ⇒ **9 档全部符合预期**（每次改坏自测都 exit 1）。
  ⑦ **门禁本体一字未改** ＋ **接线不变**（`check:mount-contract-selftest` 早已接在 build 链上
     ⇒ **build 链段数不变、README 不用改**）。
  ⑧ ⚠️ **本轮没有新增待拍板项**（纯工程补强）；**中央台账不动**。
- **D65**（本轮修的是缺陷 **D63**）：这一轮把 `check-css-braces` 这道门禁的**自测**补上四件套 ——
  它原先有 22 档（5 绿 + 9 注入 + 7 判据级负对照 + 1「覆盖度自证」），但那档「覆盖度自证」
  只证明「门禁报出的文件数不是编的」，**与判据覆盖度无关**；
  **零红因归属表**（门禁 5 处 `fail()` 调用点有没有被登记过，自测不知道）、
  **零覆盖度自证**（门禁日后新增判据、或新增一条没编号的裸红因，本自测毫无察觉）、
  **判红档只看退出码**（门禁自身崩了也是 exit 1，会被当成判红放过）、
  **CB4 的第二个调用点无档可证**（「读不到 package.json」这条红因能不能变红始终没人证明）。
  ① **红因归属表**（`CAUSES` 5 条 ＋ 静态 `CRITERIA` 清单）：门禁 5 处 `fail()` 全部带编号、无裸红因，
     但**一个编号覆盖多条红因**（`CB4` 2 条）⇒ 每条调用点登记一个**唯一**文案片段，片段之间**互不包含**。
  ② **归属纯净（运行时）**：每条红因行必须被**恰好一条**归属认领，且认出的判据与行首编号一致
     ⇒ 出现没编号的裸红因，当场暴露。
  ③ **覆盖度自证（双向）**：`fail()` 调用点数 5 == 归属表 5 条、每条归属恰好认领**一个**调用点、
     门禁里解析出的判据**集合** == 静态判据清单、每条归属的片段必须落在它自己的调用点区间里。
  ④ **判红/判绿档加横幅断言**：判红档要求输出含门禁失败横幅、判绿档要求含通过横幅
     ⇒ 门禁崩了（语法错、抛异常）不会被当成判红放过。
  ⑤ **新增注入档 CB4pkg**：`package.json` 是坏 JSON ⇒ `CB4` 的第二个调用点也能被触发
     （旧版 22 档只碰到了「门禁自己被卸掉」那一个调用点）。
  ⑥ **独立反向验证**：正对照 1 档 ＋ 破坏 8 档 ⇒ **9 档全部符合预期**（每次改坏自测都 exit 1）。
  ⑦ **门禁本体一字未改** ＋ **接线不变**（`check:css-braces-selftest` 早已接在 build 链上
     ⇒ **build 链段数不变、README 不用改**）。
  ⑧ ⚠️ **本轮没有新增待拍板项**（纯工程补强）；**中央台账不动**。
- **D66**（本轮修的是缺陷 **D64**）：这一轮把 `check-doc-snapshot` 这道门禁的**自测**补上四件套 ——
  它原先只有 6 档（SP0–SP5），断言只查「输出里**含**期望的判据编号」与「**不多于一条**」；
  **零红因归属表**（门禁 11 处 `fail()` 有没有被登记过，自测不知道）、
  **零覆盖度自证**（门禁日后新增判据、或新增一条没编号的裸红因，本自测毫无察觉）、
  **零判据级负对照**（无法证明红因确实由该判据产生）、
  **判红档只看退出码**（门禁自身崩了也是 exit 1，会被当成判红放过），
  而且 11 条红因里有 **6 条无档可证**。
  ① **红因归属表**（`CAUSES` 11 条 ＋ 静态 `CRITERIA` 清单 4 条）：门禁 11 处 `fail()`
     全部登记，每条归属恰好认领**一个**调用点（片段须落在「它自己那个调用点之后、
     下一个调用点之前」的区间里），片段之间**互不包含**。
  ② **归属纯净**：红因命中的判据集合**恰为**期望集合；每条红因行都恰好被一条归属认领，
     且认出的判据与**行首编号**一致 ⇒ 出现没编号的裸红因当场暴露。
  ③ **覆盖度自证（双向）**：`fail()` 调用点数 11 == 归属表 11 条、每个调用点的判据都在清单、
     门禁里解析出的判据**集合** == 静态清单、**每条红因至少有一档能证明它会变红**。
  ④ **判据级负对照 NC-DS1–NC-DS4**：门禁**副本**里给该判据的**每一条** `fail()` 调用**同行**加
     `if (false) ` 前缀（**行数不变**、语法自检通过）⇒ 目标红因消失、**其余红因照旧**。
  ⑤ **注入档 12 档**：旧 5 档手法不变、期望改成「恰为」；新增 6 档覆盖原本无档可证的 6 条红因
     （package.json 不在场 / 是坏 JSON / scripts.build 数不出段数 / 扫描范围里没有 ROADMAP.md /
     §1 被删空 / §1 整节都是历史块）。
  ⑥ **独立反向验证**：正对照 1 档 ＋ 破坏 8 档 ⇒ **9 档全部符合预期**（每次改坏自测都 exit 1）。
  ⑦ **门禁本体一字未改** ＋ **接线不变**（`check:doc-snapshot-selftest` 早已接在 build 链上
     ⇒ **build 链段数不变、README 不用改**）。
  ⑧ ⚠️ **本轮没有新增待拍板项**（纯工程补强）；**中央台账不动**。
- **D67**（本轮修的是缺陷 **D65**）：这一轮把 `check-readme` 这道门禁的**自测**补上四件套 ——
  它原先只有 8 档（M0–M7），断言只查「输出里**含**期望的判据编号」；
  **零红因归属表**（门禁 14 处红因出口有没有被登记过，自测不知道）、
  **零覆盖度自证**（门禁日后新增判据、或新增一条没编号的裸红因，本自测毫无察觉）、
  **零判据级负对照**（无法证明红因确实由该判据产生）、
  **判红档只看退出码**（门禁自身崩了也是 exit 1，会被当成判红放过），
  而且门禁的 **4 处早期退出型红因完全无档可证**（README / package.json 不存在、
  package.json 是坏 JSON、产物 _site 不完整 —— 这 4 条**不进 problems**、
  **红因行首也没有判据号**，旧版「输出里含 RD1」式断言一条都测不到）。
  ① **红因归属表**（`CAUSES` 14 条 ＋ 静态 `CRITERIA` 清单 5 条）：**分两类** ——
     10 处收集型（`problems.push(`，红因行首带 `RD1`–`RD5`）＋
     4 处早期退出型（`console.error("  ✗ …")` ＋ `exit(1)`，行首**没有**编号）；
     每条归属恰好认领**一个**出口点（区间法绑定），片段之间**互不包含**。
  ② **归属纯净**：按「行首有没有判据号」分流 —— 有编号的只在**该判据**的归属里找片段，
     没编号的只在早期退出型归属里找 ⇒ 出现没编号的收集型裸红因当场暴露。
  ③ **覆盖度自证（双向）**：收集型出口数 10 == 归属表 10 条、早期退出型出口数 4 == 归属表 4 条、
     门禁里解析出的判据**集合** == 静态清单、每条归属恰好认领一个出口、片段互不包含、
     **每条红因至少有一档能证明它会变红**。
  ④ **判据级负对照 NC-RD1–NC-RD5**（门禁副本里给该判据的每一条 `problems.push(` 同行加
     `if (false) ` 前缀 ⇒ 行数不变、语法自检通过）＋ **早期退出型负对照 NC-E1–NC-E4**
     （卸掉那条 `console.error(` 的打印 ⇒ 门禁仍 exit 1、失败横幅仍在、但**零红因行**）。
  ⑤ **注入档 18 档**（SP0–SP17）：旧 8 档手法保留、期望改成「恰为」；
     新增 SP6（产物推不出本站域名）、SP7–SP9（Node 版本三态 / 命令数不足）、
     SP10（一个对外出口都认不出）、SP11–SP14（4 条早期退出型）、
     SP15–SP16（站内 / 外部绝对 URL 的一正一反）、SP17（漏掉既是路径又是出口的那个）。
  ⑥ **独立反向验证**：正对照 1 档 ＋ 破坏 8 档 ⇒ **9 档全部符合预期**（每次改坏自测都 exit 1）。
  ⑦ **门禁本体一字未改** ＋ **接线不变**（`check:readme-selftest` 早已接在 build 链上
     ⇒ **build 链段数不变、README 不用改**）。
  ⑧ ⚠️ **本轮没有新增待拍板项**（纯工程补强）；**中央台账不动**。
- **D68**（本轮修的是缺陷 **D66**）：这一轮把 `check-figure-cover` 这道门禁的**自测**补上四件套 ——
  它原先只有 12 档（CV0–CV11），断言只查「输出里**含**某段文案」；
  **零红因归属表**（门禁 16 处红因出口有没有被登记过，自测不知道）、
  **零覆盖度自证**（门禁日后新增一条红因出口或一条判据，本自测毫无察觉）、
  **零判据级负对照**（无法证明红因确实由该判据产生）、
  **只查「含」不查「恰为」**（有一档红 3 条、另一档红 4 条，老版照样判「通过」），
  而且门禁的 **16 条红因里只有 7 条行首带编号**，另外 **9 条行首无编号** ⇒
  旧版「含 CV1/CV2/CV3」式断言**一条都测不到**（**CV4 的 4 条红因全部无编号**）。
  ① **红因归属表**（`CAUSES` 16 条 ＋ 静态 `CRITERIA` 4 条）：门禁用 `note()` 包装收集
     ⇒ 源码里 `problems.push(` 只出现 **1 次**，真正的出口点是 **16 处 `note()` 调用**；
     每条归属恰好认领**一个**出口点（区间法绑定），归属片段之间**互不包含**且各出现一次。
  ② **归属纯净**：按「**行首有没有编号**」分流 —— 行首有编号的只在**该判据**的归属里找片段，
     行首无编号的只在**无编号归属**里找 ⇒ 出现「没编号却被当成某判据」或「一条红因被两条归属认领」当场判红。
  ③ **覆盖度自证（双向，COV1–COV7）**：门禁解析出的判据**集合** == 静态清单、
     收集型出口数 == 归属表条数、早期退出型出口数 == 归属表 early 条数、
     每条归属恰好认领一个出口、片段互不包含且唯一、每条判据至少有一条归属、
     **每条红因至少有一档能证明它会变红**。
  ④ **判据级负对照 NC-CV1–NC-CV4**（门禁副本里给该判据的每一条 `note(` 同行加
     `if (false) ` 前缀 ⇒ 行数不变、语法自检通过）⇒ 对应注入转绿。
  ⑤ **注入档 23 档**（SP0–SP22）：旧 12 档手法保留、期望改成「恰为」；
     新增 SP12（真源读不出来 ⇒ 静默判红）、SP13（去掉提前 exit 的门禁副本 ⇒ 被吞掉的红因能被看见）、
     SP14–SP18（找不到论文页源目录 / 没有 slug / 论文页产物不存在 / 真源里一篇带 figure 的论文都没有 /
     找不到 package.json）、SP19–SP22（正文图整个被删 / 没有 og:image 声明 / og:image 指向站外地址 /
     没有 og:image:width 声明）。
  ⑥ **横幅断言**：判红档要求输出含门禁失败横幅、判绿档要求含通过横幅 ⇒ 门禁自己崩了不会被当成判红放过。
  ⑦ **独立反向验证**：正对照 ＋ 破坏档 ⇒ 全部符合预期（每次改坏自测都 exit 1）。
  ⑧ **门禁本体行为一字未改**（只把头注释里指向自测的过期档位引用 `CV10 档` 改成现行档位 `SP11 档`）
     ＋ **接线不变** ⇒ **build 链段数不变**；README 命令表那一行同步改写（不再写死会变的档数）。
  ⑨ ⚠️ 本轮**没有新增待拍板项**（纯工程补强）；**中央台账不动**。
  ⑩ ⚠️ 本轮**顺手登记了两条不修的缺陷**：**D67**（门禁真源读不出来时**静默判红** ——
     红因被提前 `process.exit(1)` 吞掉；本轮**只登记不改门禁**，但自测已把当前形状钉住并
     用「去掉提前 exit 的副本」把被吞掉的红因捞出来 ⇒ 下一轮可直接照着修）、
     **D68**（README 命令表里另外三行的档数已过期：author-assets 写 16 实测 18、
     css-braces 写 22 实测 29、readme 写 6 实测 34）。
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
