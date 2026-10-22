# MeteoHub · 个人学术站点

一个为大气科学研究者打造的个人学术站点：**自介 + 论文 + 博客 + 论文精读**。
Eleventy 11ty 从 Markdown 源构建出纯静态站点，零后端、零数据库。

## 模块

| 模块 | 路径 | 说明 |
| --- | --- | --- |
| 首页 | `/` | 自介 bio + Manuscript_Lvyh inline link + 近期博客/论文/精读入口 |
| 论文列表 | `/papers/` | 全部同行评议论文：状态角标、作者高亮，外加 DOI / PDF / 胶囊 / 数据集链接 |
| 论文精读 | `/papers/trmm-thunderstorm-stages/` | 单篇论文：左侧原文 + 右侧批注，六种 kind 配色 + 双向联动 |
| 博客 | `/blog/` | 学习笔记与长文思考，按发布日期倒序 |
| 关于 | `/about/` | 我是谁 / 研究方向 / 教育背景 / 联系方式 |

> **作品集模块（`/portfolio/`）目前没有发布**：`src/content/portfolio/` 目录与其
> `portfolio.11tydata.cjs` 还在（加内容时可直接用），但目录下**没有条目**，
> 也没有列表页模板 `src/portfolio.njk`，所以产物里**未发布** `/portfolio/` 路由。
> 保留还是删除见 `docs/IMPROVEMENT-LOG.md` 的待拍板段。

## 论文精读（站点差异化亮点）

论文详情页左半部分渲染论文原文，右半部分是批注侧栏。
每个批注按 `kind` 分类，配色走设计系统的设计 token（不写死 HEX）：

| kind | 颜色 token | 含义 |
| --- | --- | --- |
| `question` | `--color-brand-400` | 疑问 / 待查 |
| `insight` | `--color-accent-400` | 心得 / 灵感 |
| `critique` | `--color-warning` | 方法学质疑 |
| `figure` | `--color-sage-700` | 配合插图说明 |
| `link` | `--color-sage-500` | 外链补充阅读 |
| `typo` | `--color-danger` | 待勘误 |

> 上表与 `src/assets/css/components/_paper.css` 保持一致。`docs/papers-interaction.md` 附录 C 曾提议把 `figure` 改成 `--color-brand-300`，但代码目前仍按 `sage-700` 渲染 —— 要改请同时改两边。

段落和批注卡双向联动：点段落到批注卡闪烁、点批注卡回滚段落并闪烁、
滚动正文时 IntersectionObserver 自动高亮侧栏当前批注卡。键盘 ←/→ 在段间切换，
Esc 取消高亮。完整交互规范见 `docs/papers-interaction.md`。

## 设计语言

「流场蓝 × 暖橙赭石」的冷暖对照：蓝主调（流场蓝 + sage 数据绿）作理性背景，
赭石橙（accent-400）作强调与温度感。字体走 Noto Serif SC + Source Serif 4 + Inter，
长文进 `<article>` 自动切衬线，UI 用无衬线。
完整规范（颜色 token / 字号阶梯 / 间距 / 圆角阴影）见 `docs/design-system.md`。

## 启动

需要 **Node ≥ 22**（`package.json` 的 `engines.node` 就是这个下限，两处必须一致）。

> 为什么不是 18/20：Node 20 已于 2026-04-30 结束支持（EOL），继续用它跑构建等于
> 把发布管线建在不再收安全更新的运行时上；另外 build 链里的窄屏溢出门禁要用
> CDP over WebSocket，Node 20 上必须加 `--experimental-websocket` 旗标，
> Node 22.0.0 起免旗标、22.4.0 起转正。

```bash
npm install      # 一次性
npm run serve    # http://localhost:8080（带热更新）
npm run build    # 产出 _site/，并跑完整门禁链
```

`npm run build` 出的 `_site/` 是纯静态产物，可托管到 GitHub Pages、Vercel、
Cloudflare Pages、Nginx 等任意静态服务。详细运行 / 调试见 `HOW_TO_RUN.md`。

### 命令一览

`npm run build` = 下面这些门禁**按序**跑一遍（门禁全过才算构建成功）。
`npm run serve` 是本地预览。

| 命令 | 查什么 |
| --- | --- |
| `npm run build` | 整链：先跑离线门禁，再 Eleventy 构建，再跑产物门禁 |
| `npm run serve` | 本地 dev server（热更新） |
| `npm run check:gates` | **门禁接线**：每道门禁都必须从 `build` 可达（防止"门禁被摘掉"） |
| `npm run check:tracked-refs` | 已跟踪文件里引用的本地文件必须也已被 git 跟踪 |
| `npm run check:tracked-refs-selftest` | 上面那道门禁的本地夹具自测（18 档注入矩阵，在**临时 git 仓**上跑，证明它能变红；含 **4 档判据级负对照**（逐条卸掉 TR1–TR4 后对应注入必须转绿）、**2 档精准性负对照**、**2 档覆盖度自证**、**2 档故意判绿**（注释里 / 字符串里写着本地 require 的字样都不算引用 —— 补之前这两档是红的）；**红因归属纯净性断言**（每档红只许出现自己那一条判据的编号）） |
| `npm run check:log-sections` | 改进日志的 `##` 节**只增不减**（历史全量核对） |
| `npm run check:decision-ids` | 待拍板编号唯一性：一个编号只能指一件事（台账内外同号必须是同一件事） |
| `npm run check:decision-ids-selftest` | 上面那道门禁的本地夹具自测（14 档注入矩阵，证明它能变红） |
| `npm run check:blog-frontmatter` | 博客 front matter 契约（`docs/blog-writing-guide.md`）：形状 / slug 命名 / 字段类型 / 不得覆盖自动注入的字段 |
| `npm run check:blog-frontmatter-selftest` | 上面那道门禁的本地夹具自测（20 档注入矩阵，证明它能变红） |
| `npm run check:tag-leak` | 集合名标签不许漏到读者眼前：渲染详情页版式与列表页，确认集合名（`blog` / `portfolio`）没被当主题标签印出来 |
| `npm run check:tag-leak-selftest` | 上面那道门禁的本地夹具自测（7 档注入矩阵，证明它能变红） |
| `npm run check:css` | CSS 大括号平衡 + 死 CSS |
| `npm run check:dead-css-selftest` | 上面那道门禁的本地夹具自测（16 档注入矩阵，在**自造的最小夹具站**上跑，证明它能变红；含 **7 档判据级负对照**：分别卸掉 DZ1–DZ4 判定后对应注入必须转绿，证明每条判据的红确实来自它自己；**红因归属纯净性断言**（每档红只许出现自己那一条判据的编号）；一档**覆盖度自证**（样式表目录被清空必须判红）；一档**门禁被摘掉**必须判红） |
| `npm run check:css-braces-selftest` | CSS 大括号平衡那道门禁（`npm run check:css` 的前一半）的本地夹具自测（22 档注入矩阵，在**自造的最小夹具站**上跑，证明它能变红；含 **7 档判据级负对照**：分别卸掉 CB1–CB4 判定后对应注入必须转绿，证明每条判据的红确实来自它自己；**红因归属纯净性断言**（每档红只许出现自己那一条判据的编号，多一条少一条都算失败）；**遮罩自证**（注释、字符串、未加引号 url() 里的花括号必须被跳过）；**空跑判红**（一张样式表都扫不到必须判红）；**门禁自己没被卸掉**必须判红；一档**覆盖度自证**（报出的样式表张数与真实张数一致）；每处注入额外断言**改动行数**符合声明，防「破坏没打上」） |
| `npm run check:wrap` | 长 DOI / 长 URL 不能把窄屏页面撑破 |
| `npm run check:wrap-selftest` | 上面那道门禁的本地夹具自测（24 档注入矩阵，在**自造的最小夹具站**上跑，证明它能变红；含 **4 档判据级负对照**（N-W1–N-W4）：分别卸掉 W1–W4 判定后对应注入必须转绿，证明每条判据的红确实来自它自己；**1 档精准性负对照**（卸 W4 + 破坏解析器 + 叠加 W2 注入 ⇒ **仍红但红因集合恰为 {W2}**）；**红因归属纯净性断言**（每档红只许出现自己那一条判据的编号，多一条少一条都算失败）；**级联洞**（同一声明块里末位是 break-word 必须判红 —— 补之前是绿的）；**!important 假阳性**（`anywhere !important` 必须判绿 —— 补之前是红的）；**解析器自证**（解析器坏了必须判红）；两档**覆盖度自证**（报出的扫描数量与夹具真实数量一致；门禁源码里 W1–W4 每条都有红因出口与可卸开关）；每处注入额外断言**改动行数**符合声明，防「破坏没打上」） |
| `npm run check:focus-ring` | **键盘焦点环必须够看得见**：焦点环是**双色环**（内圈 + 外圈），在浅色 / 暗色（`prefers-color-scheme`）/ 暗色（`[data-theme]`）三个主题 × 7 个登记底色上，两圈里**至少一圈**的对比度必须 ≥ 3:1（WCAG 1.4.11 非文本对比度 —— 单一颜色做不到这件事：不透明的 brand-400 在主按钮底上只有 1.85:1）；两圈必须是实色、两圈必须引用不同的 token、两处暗色块的写法必须与 `:root` 逐字相同（靠内层色阶 token 被暗色重映射）、本门禁自己必须接在 build 链上 |
| `npm run check:focus-ring-selftest` | 上面那道门禁的本地夹具自测（22 档注入矩阵，证明它能变红；含 **6 档判据级负对照**（卸掉某条判据后对应注入必须转绿）、**2 档故意判绿**（内外圈引用互换、外圈换成纯黑都必须判绿 —— 判据守的是「至少一圈达标」，不挑具体颜色）、一档**同源负对照**（卸掉 FC1 后仍红，但红因里不再出现 FC1）、一档**覆盖度自证**（底色清单被清空必须判红）、一档**扫描器自证**（把对比度计算弄坏必须让注入转绿）、一档**门禁被摘掉**必须判红） |
| `npm run check:tool-routes` | 浏览器工具量到的必须是真页面，不是本站 404 页 |
| `npm run check:tool-routes-selftest` | 上面那道门禁的本地夹具自测（15 档注入矩阵，在**自造的最小夹具站**上跑，证明 RT1–RT9 每条判据都能变红；含 **3 档判据级负对照**：卸掉 RT5 后对应注入必须转绿、卸掉 RT5 后再叠加一条 RT7 注入必须**仍红**但红因集合恰为 {RT7}（证明卸判据是精准的，不是把门禁整个关掉）、卸掉 RT9 后对应注入必须转绿；**红因归属纯净性断言**（每档红只许出现自己那一条判据的编号，连红因**行数**也要相等）；**2 档故意判绿**（工具里写的是真实存在的本地文件系统路径、站点路径只出现在注释里 —— 两者都必须判绿）；一档**覆盖度自证**（判据编号从门禁源码现读，门禁新加判据而本矩阵没补档即判红）） |
| `npm run check:navigation` | **顶层导航只有一份真源**：`site.js` 的 nav 数组与各模板的 `eleventyNavigation` 必须逐位对齐（key 同名、order 等于位次），产物上每一页的页头导航必须与真源一致，导航入口必须指向真实存在的页面 |
| `npm run check:navigation-selftest` | 上面那道门禁的本地夹具自测（9 档注入矩阵，证明它能变红；含两档**负对照**：三处一起改必须判绿、门禁被摘掉必须判红） |
| `npm run check:site-js` | **站点 JS 真的能被浏览器加载起来**：产物 JS 的语法按浏览器加载它的那张嘴判（module / 经典脚本）、模块说明符必须闭合到真实存在的产物文件（裸说明符判红）、内联脚本必须能解析、内联 module 的说明符与 `<script src>` 必须按**页面 URL 口径**落到真实存在的文件 |
| `npm run check:site-js-selftest` | 上面那道门禁的本地夹具自测（18 档注入矩阵，证明它能变红；含 **6 档判据级负对照**（卸掉某条判据后对应注入必须转绿）、一档**故意判绿**（把 import 指向一个真实存在的新文件必须判绿）、一档**覆盖度自证**（抽掉全部 JS 必须判红）；另有一档**D10 原样复刻**与一档扫描器 tricky 档） |
| `npm run check:js-targets` | **站内脚本查询的目标 DOM 必须在产物里真实存在**：脚本用 `querySelector` / `closest` / `getElementById` 拿的元素，若在产物里找不到、也不由站内脚本运行时创建 ⇒ 那段行为**永远不会发生**（脚本被下载、被执行，却命中不到任何东西）⇒ 判红（JA1）。判定按 **CSS 选择器语义**逐层做：选择器列表按顶层逗号拆成**分支**（分支之间是「或」，任一分支可达即可），分支内的 token（类名 / 属性名 / id）之间是「与」，伪类 / 伪元素 / 标签名不产生约束；选择器写在 `const` 绑定里的也能解出来，脚本**运行时创建**的类名 / 属性名也算可达。另含**覆盖度自证**（JA2）、**门禁自己没被卸掉**（JA3）与**逐模块提取自证**（JA4） |
| `npm run check:js-targets-selftest` | 上面那道门禁的本地夹具自测（18 档注入矩阵，在**自造的最小夹具站**上跑，证明它能变红；含 **4 档判据级负对照**：分别卸掉 JA1–JA4 判定后对应注入必须转绿，证明每条判据的红确实来自它自己；**红因归属纯净性断言**（每档红只许出现自己那一条判据的编号，多一条少一条都算失败）；一档**覆盖度自证**（所有脚本都不查 DOM 必须判红）、一档**常量解析**档、一档**运行时创建**档） |
| `npm run check:site` | 结构化数据与元数据逐项核对（`scripts/verify-site.cjs`） |
| `npm run check:verify-site-selftest` | 上面那道门禁的本地夹具自测（**77 档注入矩阵**，在真实产物的副本 + 沙箱源码副本上跑，证明 0–33 号每道门禁都能变红；含 **35 档判据级负对照**（逐条卸掉门禁开关后对应注入必须转绿 —— 这同时证明每个可卸开关都真被 `fail()` 消费）、**3 档精准性负对照**（比较点目录少登记一项 / 门禁 32 少一条判据 / `fail()` 不再读开关表 ⇒ 覆盖度自证必须报红）、**2 档退回旧口径自检**（红因不带门禁号 ⇒ 编号解析为空；产物为空时每页检查必须显式豁免，不能悄悄不跑）、**红因归属纯净性断言**（每档红只许出现自己那一条门禁号）） |
| `npm run check:page-deps` | **页面依赖闭包**：一页的 `lastmod` 必须等于它**依赖闭包**里最晚的 git 提交时间（内容由别的文件提供时也算数）；闭包不许退化成「只看自己」、不许引用不存在的文件，模板引用必须写字面量，sitemap 不许漏掉页面，全局数据必须登记 |
| `npm run check:page-deps-selftest` | 上面那道门禁的本地夹具自测（8 档注入矩阵，证明它能变红；含一档**故意判绿**的负对照） |
| `npm run check:404-depth` | 404 页的站内 URL 必须根绝对（GitHub Pages 把 404 页送到任意缺失路径，相对 URL 会被解析到请求路径下） |
| `npm run check:404-depth-selftest` | 上面那道门禁的本地夹具自测（4 档注入矩阵，证明它能变红） |
| `npm run check:mount-contract` | 文档与代码口径一致：凡是承诺产物可整体搬迁到任意部署位置的行，都必须带例外限定；README 要讲清 404 页这个例外，`relUrl` 的 404 特判也得在位 |
| `npm run check:mount-contract-selftest` | 上面那道门禁的本地夹具自测（5 档注入矩阵，证明它能变红） |
| `npm run check:design-contract` | 设计系统文档与代码一致：徽标类名族、token、partial 清单、dev/prod 判定都必须与 `src/assets/css` / `eleventy.config.js` 对得上 |
| `npm run check:design-contract-selftest` | 上面那道门禁的本地夹具自测（7 档注入矩阵，证明它能变红） |
| `npm run check:doc-snapshot` | 现状陈述里不许写死每轮都会变的数量（如 build 链的段数）：含缺陷编号的历史块按原样保留，现状块里出现「数字 + 步」就判红 |
| `npm run check:doc-snapshot-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，证明它能变红，且每档只触发自己那一条判据） |
| `npm run check:image` | 页面里声明的图与产物里真实存在的图是同一张 |
| `npm run check:image-selftest` | 上面那道门禁的本地夹具自测（14 档注入矩阵，在**自造的最小夹具站**上跑，证明它能变红；含一档**判据级负对照**（门禁副本卸掉 IA8 判定后对应注入必须转绿，证明那条红确实来自它自己）；**红因归属纯净性断言**（每档红只许出现自己那一条判据的编号，多一条少一条都算失败）；一档**覆盖度自证**（门禁新加判据而本矩阵没补档必须判红）；两档**故意判绿**（`<style>` 块与 HTML 注释里的假 `<img>` 不算图）） |
| `npm run check:img-srcset` | 响应式图片声明（`srcset` / `imagesrcset`）的**每个候选 URL** 必须落到真实存在的产物文件（按页面 URL 口径解析）；`<img>` 必须留 `src` 兜底；候选列表不得为空；描述符必须合法且**不得混用宽度与密度**（混用会让整条声明被浏览器忽略） |
| `npm run check:img-srcset-selftest` | 上面那道门禁的本地夹具自测（17 档注入矩阵，证明它能变红；含 **6 档判据级负对照**（卸掉某条判据后对应注入必须转绿）、一档**故意判绿**（把候选改成一个真实存在的新文件必须判绿）、一档**覆盖度自证**（抽掉全部 srcset 必须判红）、一档扫描器 tricky 档） |
| `npm run check:img-loading` | **每张 `<img>` 都必须显式声明加载策略**：必须写 `loading`，且取值只能是 `eager` / `lazy`（不写 = 落回浏览器默认的 eager，首屏之外的图也抢带宽；写错取值浏览器会**静默忽略**）；`loading="eager"` 必须配 `fetchpriority="high"`（首屏 LCP 候选图的优先级必须显式给出），`fetchpriority="high"` 必须配 `loading="eager"`（两个属性成对，`high` 配 `lazy` 自相矛盾）；`fetchpriority` 取值只能是 `high` / `low` / `auto`（拼错会被静默忽略）；另含**覆盖度自证**与**门禁自己没被卸掉** |
| `npm run check:img-loading-selftest` | 上面那道门禁的本地夹具自测（17 档注入矩阵，证明它能变红；含 **6 档判据级负对照**（卸掉某条判据后对应注入必须转绿）、**红因归属纯净性断言**（每档红只许出现自己那一条判据的编号）、**2 档故意判绿**（`lazy` + `fetchpriority="low"` 是合法组合；新增一张合法的 lazy 图）、一档**覆盖度自证**（抽掉全部 `<img>` 必须判红）、一档扫描器 tricky 档） |
| `npm run check:img-publish` | **图片发布清单必须与「每张源图各自的消费点」严格对齐**：源代码（`src/**`，先剥注释；门禁与文档不算消费点）里**没人引用**的源图**不许**出现在产物里（IP1 —— 那是没人请求却占着部署体积的死副本，比如分享图 PNG 的 SVG 设计母版）；**被引用**的源图**必须**出现在产物里（IP2，否则页面拿它当 `<img src>` 直接 404）；产物里不许出现源目录已无的残留副本（IP3）；另含**覆盖度自证**（IP4）与**门禁自己没被卸掉**（IP5） |
| `npm run check:img-publish-selftest` | 上面那道门禁的本地夹具自测（11 档注入矩阵，在**自造的最小夹具站**上跑，证明它能变红；含 **3 档判据级负对照**：分别卸掉 IP1–IP3 判定后对应注入必须转绿，证明每条判据的红确实来自它自己；**红因归属纯净性断言**（每档红只许出现自己那一条判据的编号，多一条少一条都算失败）；一档**覆盖度自证**（引用检测器认不出任何一张图必须判红）） |
| `npm run check:author-assets` | **作者图片资产三处必须对齐**：`site.js` 的 `author.photo` 里每个「值是图片路径」的键都必须有**真实消费点**（模板 / 脚本 / 配置的**代码**里引用了它；注释里提到不算）；每个键指向的源文件必须真实存在（否则页面直接断图）；源目录 `src/assets/img/author/` 下的每个文件都必须被某个键引用（防「文件在、没人用」却仍被打进产物）；产物 `assets/img/author/` 的文件集合必须与引用集合**完全一致**（多出来的就是漏删的旧文件）；另含**覆盖度自证**与**门禁自己没被卸掉** |
| `npm run check:author-assets-selftest` | 上面那道门禁的本地夹具自测（16 档注入矩阵，证明它能变红；含 **6 档判据级负对照**（卸掉某条判据后对应注入必须转绿）、**红因归属纯净性断言**（每档红只许出现自己那一条判据的编号）、一档**故意判绿**（删掉非资产键 `alt` 不该判红）、一档**覆盖度自证**（真源 / 源目录 / 产物目录全空必须判红）、一档**注释剥离**档（消费点只写在注释里必须判红）） |
| `npm run check:figure-cover` | 论文封面图只有一处真源（site.js 的 `publications[].figure`），且正文 `<img>`、og:image、twitter:image、JSON-LD image 四个出口是**同一张图、同一组尺寸**；论文页 front matter 不得留封面副本 |
| `npm run check:figure-cover-selftest` | 上面那道门禁的本地夹具自测（12 档注入矩阵，证明它能变红；含一档**故意判绿**的边界负对照） |
| `npm run check:lang` | 语言标记统一 + 编码损坏 |
| `npm run check:lang-selftest` | 上面那道门禁的本地夹具自测（28 档注入矩阵，在**自造的最小夹具站**上跑，证明 LG1–LG7 每条判据都能变红；含 **8 档判据级负对照**（逐条卸掉 LG1–LG7 后对应注入必须转绿，其中一档叠加注入以证明卸判据是精准的、不是把门禁整个关掉）、**10 档故意判绿**（front matter 整行注释、Nunjucks 注释、HTML 注释、CSS 注释、JS 行注释、数据层目录豁免、OG 品牌图目录豁免、exFAT 资源叉跳过、产物里的非 HTML 文件不扫、内联 script 与 style 块不扫 —— 每条豁免**单独**验一次）、**红因归属纯净性断言**（每档红只许出现自己那一条判据的编号）、一档**覆盖度自证**（判据编号从门禁源码现读，门禁新加判据而本矩阵没补档即判红）） |
| `npm run check:site-language` | 非 HTML 对外出口（feed / bib / ris / robots / sitemap）全英文；robots 的构建时刻与 feed 的 `lastBuildDate` 同一瞬间；语言门禁的每一条豁免都必须真的豁免到了**会渲染**的中文（中文只写在注释里的豁免判红，因为那是暗门） |
| `npm run check:site-language-selftest` | 上面那道门禁的本地夹具自测（7 档注入矩阵，证明它能变红；含两档**负对照**：分别卸掉 CJK 判定与「剥掉注释后再判」，证明这两条判据真的在起作用） |
| `npm run check:feed-discovery` | 订阅与爬虫的**自我描述入口**必须存在，且必须指向本站：每页**恰好一处** RSS 自动发现（`<link rel="alternate" type="application/rss+xml">`，按页面 URL 口径解析后落到本站 `feed.xml`，外域一律判红）；`feed.xml` 必须有 `<atom:link rel="self">` 且等于本站 feed 的规范绝对 URL，频道级 `<title>` / `<link>` / `<description>` 三件套齐备；`robots.txt` 必须**恰好一行** `Sitemap:` 且等于本站 sitemap 的规范绝对地址 |
| `npm run check:feed-discovery-selftest` | 上面那道门禁的本地夹具自测（21 档注入矩阵，证明它能变红；含 **6 档判据级负对照**（卸掉某条判据后对应注入必须转绿；FD5 那档断言的是「红因里不再出现 FD5」—— 覆盖度自证与入口缺失天然同源，卸掉它不可能转绿，断言照实写）、一档**故意判绿**（href 换成与本站同源的绝对 URL 必须判绿）、一档扫描器 tricky 档） |
| `npm run check:feed-title` | 订阅源的**显示名必须只有一份**：真源 `site.feedTitle` 必须存在、非空、且是「站点名 + 自己的后缀」派生的；模板层（`.njk`）不许把显示名的后缀片段烤成字面量；产物里每处 RSS 自动发现的 `title` 属性、`feed.xml` 频道级 `<title>` 与真源三者必须逐字相同 |
| `npm run check:feed-title-selftest` | 上面那道门禁的本地夹具自测（17 档注入矩阵，证明它能变红；含 **6 档判据级负对照**（卸掉某条判据后对应注入必须转绿）、两档**故意判绿**（片段只出现在模板注释里、整站一致改名都必须判绿）） |
| `npm run check:target-blank-rel` | **新标签页打开的链接必须带 rel 安全属性**：模板层（`.njk`）与产物层里每一个会开新浏览上下文的 `target`（`_blank` 或命名目标）的 `<a>` / `<area>`，`rel` 的 token 集合必须同时含 `noopener` 与 `noreferrer`（少 `noopener` ⇒ 目标页面能用 `window.opener` 把本站这个标签页导航走；少 `noreferrer` ⇒ 会把访客的来源页带出去）；`rel` 必须写成**字面量**（模板变量静态判不出，判红）；模板与产物都不许有 `<base target>`（那是**全站默认**的打开目标） |
| `npm run check:target-blank-rel-selftest` | 上面那道门禁的本地夹具自测（23 档注入矩阵，证明它能变红；含 **6 档判据级负对照**（卸掉某条判据后对应注入必须转绿）、**5 档故意判绿**（rel 多带无关 token、rel 的 token 大写、坏链接只出现在 HTML 注释或 Nunjucks 注释里、普通站内链接没有 rel，都必须判绿）、一档**覆盖度自证**（产物里一处会开新上下文的链接都不剩必须判红）、一档**扫描器自证**（把「读 rel 的 token」弄坏必须判红）） |
| `npm run check:block-language` | 块级内容全英文：产物里的 JSON-LD 结构化数据（逐块 JSON.parse 后递归遍历字段值与键名）、内联 `<script>`、内联 `<style>`（剥掉 CSS 注释后）都不许有中日韩字符；字段级豁免必须「用得出」（豁免用不上时只提示、不拦 build） |
| `npm run check:block-language-selftest` | 上面那道门禁的本地夹具自测（12 档注入矩阵，证明它能变红；含两档**负对照**：分别卸掉 CJK 判定与「剥掉 CSS 注释」，证明这两条判据真的在起作用） |
| `npm run check:css-comment-weight` | 产物里不许有 CSS 注释字节：内联 `<style>` 与外链 CSS 都不许带注释（注释在源码里保留 —— 那是维护者的笔记，不该跟着产物发给访客）；剥掉注释后仍须有内容（防「清空内联 CSS」骗过前一条）；覆盖度自证（内联块数、外链 CSS 数、每页都得有内联块） |
| `npm run check:css-comment-weight-selftest` | 上面那道门禁的本地夹具自测（22 档注入矩阵，证明它能变红；含两档**负对照**：分别卸掉 CW1 判定与「字符串字面量保护」，证明这两条判据真的在起作用；另有一档断言产物内联块与源码剥注释后**逐字相等**、一档剥除器的单元夹具） |
| `npm run check:css-publish` | **CSS 发布清单必须与「源样式各自的角色」严格对齐**：源 `src/assets/css/**` 下每个样式都必须有角色（内联 / 外链 / partial / 顺序声明），归不进任何角色就是死文件或漏了引用（CS1）；只被内联、没被外链的样式与顺序声明文件**不许**出现在产物里（CS2，否则就是没人引用却占着部署体积的副本）；被 `<link>` 引用的与 partial **必须**出现在产物里（CS3，否则页面样式直接 404）；产物里不许出现源目录已无的残留副本（CS4）；磁盘 partial 清单、`components/index.css` 的 `@import` 清单、`eleventy.config.js` 的 `order` 数组三处必须**集合相同且同序**（CS5）；另含覆盖度自证（CS6）与门禁自己没被卸掉（CS7） |
| `npm run check:css-publish-selftest` | 上面那道门禁的本地夹具自测（19 档注入矩阵，在**自造的最小夹具站**上跑，证明它能变红；含 **7 档判据级负对照**：分别卸掉 CS1–CS7 判定后对应注入必须转绿，证明每条判据的红确实来自它自己；**红因归属纯净性断言**（每档红只许出现自己那一条判据的编号，多一条少一条都算失败）；一档**覆盖度自证**（四类角色各至少认出一处）） |
| `npm run check:third-party` | **零第三方前端运行时依赖**：产物里的子资源引用（`script` / `img` / `iframe` / `video` 等）、`<link>` 的资源提示（`stylesheet` / `preload` / `preconnect` / `icon` 等）、CSS 的 `@import` 与 `url()`、站内 JS 的**硬编码**外域请求目标与外域 `import`，一律不许指向外域；确需外域的按**（域，上下文）**登记在门禁的白名单里并写明理由 |
| `npm run check:third-party-selftest` | 上面那道门禁的本地夹具自测（21 档注入矩阵，证明它能变红；含 4 档**负对照**：分别卸掉 TD1–TD4 判定，证明那几档的红确实来自这四条判据本身；另有两档专验白名单的粒度与「用不上只提示不判红」） |
| `npm run check:a11y` | WCAG AA 实测缺陷固化成可重复检查 |
| `npm run check:a11y-contrast-selftest` | 上面那道门禁里**底色 token 跨主题压暗**判据的本地夹具自测（6 档注入矩阵，证明它能变红：亮底 token 在暗色没重映射、压暗后仍偏亮都判红） |
| `npm run check:print-theme` | 打印结果与屏幕主题无关（深色底不会打成白底） |
| `npm run check:print-theme-selftest` | 上面那道门禁的本地夹具自测（27 档注入矩阵，在**自造的最小夹具站**上跑，证明 PT1–PT7 每条判据都能变红；含 **7 档判据级负对照**（逐条卸掉 PT1–PT7 后对应注入必须转绿，其中一档叠加注入以证明卸判据是精准的、不是把门禁整个关掉）、**红因归属纯净性断言**（每档红只许出现自己那一条判据的编号，缺前提文件时只许红 PT7）、一档**覆盖度自证**（判据编号从门禁源码现读，门禁新加判据而本矩阵没补档即判红）） |
| `npm run check:copy` | 直接出字节的出口（`.bib` / `.ris`）取值方式正确 |
| `npm run check:copy-selftest` | 上面那道门禁的本地夹具自测（25 档注入矩阵，在**自造的最小夹具站**上跑，证明 CE1–CE9 每条判据都能变红；含 **9 档判据级负对照**（逐条卸掉 CE1–CE9 后对应注入必须转绿）、**1 档精准性负对照**（卸掉一条判据叠加另一条不连坐的注入，证明卸判据是精准的、不是把门禁整个关掉）、**红因归属纯净性断言**（每档红只许出现自己那几条判据的编号；前提缺失时只许红 CE1 / CE8，不连坐 CE7）、一档**覆盖度自证**（判据编号从门禁源码现读，门禁新加判据而本矩阵没补档即判红）） |
| `npm run check:overflow` | 多档宽度（360 / 390 / 640 / 768 / 820 / 1024 / 1440）都无横向溢出，独立交互目标的点击区达到 WCAG 2.5.8 的要求，且滚动定位的目标（跳转链接、论文页目录）不会被吸顶顶栏遮住（真浏览器实测，每档重新设视口） |
| `npm run check:overflow-selftest` | 上面那道门禁的本地夹具自测（证明它能变红：少测一档、视口没真改都判红） |
| `npm run check:overflow-targets-selftest` | 上面那道门禁里**触点尺寸**判据的本地夹具自测（证明它能变红：触点过小且换行处紧邻会判红；判定或收集被卸掉也会判红） |
| `npm run check:overflow-anchors-selftest` | 上面那道门禁里**滚动定位让位**判据的本地夹具自测（证明它能变红：目标被吸顶顶栏盖住会判红；判定、检测或收集被卸掉也会判红） |
| `npm run check:artifact` | 产物里的 @id / license / 版本 / 地址与 `site.js` 逐字一致 |
| `npm run check:artifact-selftest` | 上面那道门禁的本地夹具自测（26 档注入矩阵，在**自造的最小夹具站**上跑，证明 M1–M8 每条判据都能变红；含 **8 档判据级负对照**（逐条卸掉 M1–M8 后对应注入必须转绿 —— 这同时证明每个可卸开关都真被消费）、**2 档精准性负对照**（卸判据叠加另一条不连坐的注入 / 前提不在场时依赖判据整段跳过）、**4 档故意判绿**（不带标记的链接不算 / 没注册产出物时豁免 / 真源只有 license 时不报假红）、**2 档覆盖度自证**、**红因归属纯净性断言**） |
| `npm run check:jsonld` | JSON-LD 合法，站点实体与页面实体接得上 |
| `npm run check:jsonld-selftest` | 上面那道门禁的本地夹具自测（38 档注入矩阵，在**自造的最小夹具站**上跑，证明 J0–J12 每条判据都能变红；含 **14 档判据级负对照**（逐条卸掉 J0–J12 后对应注入必须转绿 —— 这同时证明每个可卸开关都真被消费）、**3 档精准性负对照**（profilePage 写在 eleventyComputed / 目录数据文件里也认；非论文页多一张 og:image 不误伤）、**4 档绿档**（基线全绿 / 覆盖度自证那行在输出里 / 红因带编号前缀 / 卸开关后红因一个不剩）、**3 档退回旧口径自检**（覆盖度自证被摘 ⇒ 整块判据被摘也全绿；红因不带编号 ⇒ 编号解析为空；开关不被消费 ⇒ 卸开关后红还在）、**红因归属纯净性断言**） |
| `npm run check:home-chart` | 首页降水图的交互层：钩子齐全、**读数与数据同源**、键盘可达、模块与样式在位 |
| `npm run check:home-chart-selftest` | 上面那道门禁的本地夹具自测（6 档注入矩阵，证明它能变红） |
| `npm run check:about-dataset` | about 页对同一条 Zenodo 记录的描述必须与 DataCite 登记事实一致：类型、登记标题、可见 DOI、散文措辞四处同源，散文里不许写死地址 |
| `npm run check:about-dataset-selftest` | 上面那道门禁的本地夹具自测（15 档注入矩阵，证明它能变红；含一档**故意判绿**的边界负对照） |
| `npm run check:identity` | 身份句柄（ORCID / GitHub / CSDN / ResearchGate）登记一致 |
| `npm run check:identity-derivation` | 身份 URL 必须**派生**出来，不许抄成字面量 |
| `npm run check:identity-derivation-selftest` | 上面那道门禁的本地夹具自测（34 档注入矩阵，在**自造的最小夹具站**上跑，证明 ID0–ID7 每条判据都能变红；含 **11 档判据级负对照**（逐条卸掉 ID0–ID7 后对应注入必须转绿 —— 这同时证明每个可卸开关都真被消费）、**2 档精准性负对照**（卸判据叠加另一条不连坐的注入 / 前提不在场时只许红那一条判据）、**4 档故意判绿**（注释里的身份 URL 豁免 / 豁免扩展名生效 / 只查完整字面量不做 URL 形态匹配 / 临时目录上的基线）、**2 档覆盖度自证**（比较点静态目录逐点核对 / 每条判据都有红因出口与可卸开关）、**3 档退回旧口径自检**（覆盖度自证被摘 ⇒ 判据级负对照塌陷成绿；红因不带编号 ⇒ 编号解析为空；开关不被消费 ⇒ 卸开关后红还在）、**红因归属纯净性断言**） |
| `npm run check:citation-meta` | 论文页 `citation_*` 标签与 `site.js` 逐字一致 |
| `npm run check:citation-meta-selftest` | 上面那道门禁的本地夹具自测（10 档注入矩阵，证明它能变红） |
| `npm run check:citation-cff` | 仓库根 `CITATION.cff` 与 `site.js` 逐字节一致 |
| `npm run gen:citation-cff` | 按 `site.js` **重写** `CITATION.cff`（改过事实后跑这个） |
| `npm run check:citation-cff-selftest` | 上面那道门禁的本地夹具自测（10 档注入矩阵，证明它能变红） |
| `npm run check:live` | 线上部署核查（**不在 build 链**，部署后跑） |
| `npm run check:live-selftest` | 线上核查门禁的本地夹具自测（7 档注入矩阵） |
| `npm run check:readme` | 本 README 里可机器核对的事实（路由 / Node 下限 / 命令 / 出口）与现状一致 |
| `npm run check:readme-selftest` | 上面那道门禁的本地夹具自测（6 档注入矩阵，证明它能变红） |

> **唯一不在 `build` 链里的门禁**是 `npm run check:live`（线上部署核查）：
> 它要联网，而 build 跑在 deploy **之前**，那时线上还是上一次部署，
> 接进 build 等于每次都对着旧站点判红。它的位置在**部署之后** ——
> `.github/workflows/deploy.yml` 的 `verify-live` job 会在部署完立刻跑它。

### 公开出口

站点对外提供这些可被引用的地址（`site.js` 的 `url` 是全站唯一绝对地址来源）：

| 出口 | 地址 | 说明 |
| --- | --- | --- |
| BibTeX | `/publications.bib` | 作者名已转成 `Last, First`，缺字段不输出 |
| RIS | `/publications.ris` | 引用管理器通用格式 |
| RSS | `/feed.xml` | 博客与论文更新 |
| 站点地图 | `/sitemap.xml` | 路由与 `lastmod`（取源文件最后一次 git 提交时间） |
| robots | `/robots.txt` | |
| 仓库引用元数据 | 仓库根 `CITATION.cff` | CFF 1.2.0；GitHub 的 "Cite this repository" 按钮读它，`preferred-citation` 指向站内那篇 JGR 论文 |

### 部署到 GitHub Pages（`github.lvyihang.xyz` 根目录）

本项目部署在**用户站仓库** `oldsixxiaolv/oldsixxiaolv.github.io`，内容铺在域名根 `/`，没有子路径：

1. `src/_data/site.js` 的 `url` 设为 `https://github.lvyihang.xyz` —— 全站唯一绝对地址来源，canonical / og:url / sitemap 全由它派生。
2. **不要**硬编码 `/assets/...`，全部用 `{{ '/assets/css/pages.css' | relUrl }}` 过滤器渲染成相对路径（`assets/...` / `../assets/...`）。相对路径与挂载点无关，`_site/` 整个文件夹扔到哪都能跑；**唯一例外是 404 页**——GitHub Pages 会把 `/404.html` 的内容送到任意未匹配路径，而浏览器地址栏仍停在请求路径上，相对 URL 在那里没有正确解，所以 404 页的站内 URL 一律**根绝对**（`/assets/...`），普通页面仍照旧相对。
3. 仓库 **Settings → Pages → Source → `GitHub Actions`**，Custom domain 填 `github.lvyihang.xyz`。
4. dev server 验证：`npm run serve`，开 `http://127.0.0.1:8080/`，与线上结构一致。

详细方案、验证步骤见 **`docs/DEPLOY.md`**。

## 添加内容

- **博客**：在 `src/content/blog/YYYY-MM-DD-slug/index.md` 加 frontmatter
  （`title / slug / date / author / tags / excerpt / cover / readingTime / status`）。
- **作品集**：在 `src/content/portfolio/<slug>/index.md` 加
  （`title / slug / type / year / role / stack / cover / repo / demo / status`）。
  ⚠️ 目前**只加文件不会上线**：作品集没有列表页模板（`src/portfolio.njk`），
  目录里也没有条目，所以产物里**未发布** `/portfolio/` 路由 —— 要发布得先补列表页。
  待拍板见 `docs/IMPROVEMENT-LOG.md`。
- **论文**：在 `src/content/papers/<slug>/` 加：
  - `paper.md`（正文，**YAML frontmatter 必须在第 1 行**，11ty v3 不解析放在 HTML 注释后的 frontmatter）—— 必填 `title / slug / authors / journal / year / doi / tags`，其余按需（`doi_url / pdf / abstract` 或 `summary` / description / cover / status / readingStatus / affiliation / layout）。三篇现有论文的字段并不完全一致，写之前先照抄同目录里最接近的一篇。
  - `annotations.json`（批注，至少 `id / kind / title / body / tags / createdAt / anchor` 字段，`anchor.value` 必须能命中 paper.md 的段落 id）。
  - `cover.svg`（1500×600 学术封面）。
  - `index.md`（可选入口页；被 `eleventyConfig.ignores.add("src/content/papers/*/index.md")` 排除，不参与渲染）。

  段落 id 用 `<h2 id="p-XXX">` 或 `<a id="p-XXX"></a>`，批注 `anchor.value` 必须能命中（frontmatter 必须文件第 1 行，否则 11ty 解析不到）。

三类内容的 `layout` 与 `permalink` 都由各自目录下的 `<dirname>.11tydata.cjs` 注入，新文章不用自己写。

加完后 `npm run serve` 自动 rebuild。

## 目录结构

```
.
├── eleventy.config.js     # 11ty 配置（collections / filters / passthrough / pathPrefix / components.css 生成）
├── package.json           # 脚本与门禁入口（engines.node = ">=22"）
├── CITATION.cff           # 仓库引用元数据（CFF 1.2.0）—— 由 npm run gen:citation-cff 从 site.js 生成
├── scripts/               # 21 道门禁（check-*.cjs / verify-site.cjs）+ 本地 QA 工具（screenshot / lighthouse / slow3g）
├── HOW_TO_RUN.md          # 详细运行 / 调试 / 部署前 checklist
├── README.md
├── CNAME.example          # 自定义域名占位示例（本项目站不需要，见 docs/DEPLOY.md）
├── LICENSE                 # Apache License 2.0
├── _archive/               # 旧平台归档（不回溯，不参与构建）
├── docs/                   # 设计 / 信息架构 / 论文交互 / 部署 / 改进日志 / 验收报告
├── src/
│   ├── _data/site.js       # 全局元信息（标题 / nav / 作者 / site.url / 论文 / 身份句柄）
│   ├── _includes/
│   │   ├── layouts/        # base / index / page / detail / paper
│   │   └── partials/       # header / footer / hero / publications / citation-meta / theme-toggle
│   ├── assets/
│   │   ├── css/            # tokens / base / components(7 partial) / layout / pages / a11y / paper-reader / print
│   │   ├── js/             # main / nav / theme + paper-reader/ ESM 模块
│   │   ├── img/            # author / og(三尺寸) / publications
│   │   └── favicon.svg
│   ├── eleventy-helpers.cjs
│   ├── index.njk / about.njk / blog.njk / papers.njk / 404.njk   # 页面模板
│   ├── publications.bib.njk / publications.ris.njk / feed.njk / sitemap.njk / robots.njk   # 对外出口
│   └── content/
│       ├── about.md
│       ├── blog/<slug>/index.md
│       ├── papers/<slug>/paper.md + annotations.json + cover.svg
│       └── portfolio/      # 目录在、条目空 → 当前不发布 /portfolio/ 路由
└── .github/workflows/deploy.yml   # GH Pages 自动部署（build → deploy → verify-live）
```

## 部署

GitHub Pages 部署步骤（Actions 工作流 + Settings 配置 + 自定义域名 +
故障排查）见 **`docs/DEPLOY.md`**。

## 贡献与许可

源码采用 Apache License 2.0（见 `LICENSE`）。博客正文 / 论文批注等内容采用
CC BY-NC-SA 4.0。提交 PR / Issue 前请本地跑一遍 `npm run build` —— 它会跑完整
门禁链，**门禁全过**才算通过（`npm run check:readme` 也在链上：改了路由、
Node 下限、命令或公开出口，README 不同步就会红）。改过 `site.js` 里的事实
（论文 DOI / 作者 / 关键词）后，记得跑 `npm run gen:citation-cff` 重生成
`CITATION.cff`，否则 `npm run check:citation-cff` 会判红。

## 相关链接

- 论文手稿仓：[oldsixxiaolv/Manuscript_Lvyh](https://github.com/oldsixxiaolv/Manuscript_Lvyh) —— 与本站仓（MeteoHub）分开，专门存放合作论文的批注版与配套数据管线（TRMM 2026 论文 + Zenodo doi: 10.5281/zenodo.18041880）
- 详细运行 / 调试：`HOW_TO_RUN.md`
- 改进目标与里程碑：`docs/ROADMAP.md`（**目标与里程碑的唯一清单**）
- 缺陷清单：`docs/DEFECT-BACKLOG.md`（**唯一待修缺陷清单**，每轮从「待修」里取一条）
- 信息架构：`docs/information-architecture.md`（设计规划稿，含尚未实现的 `/tags/` `/search/` `/cv/`）
- 设计规范：`docs/design-system.md`
- 论文精读交互：`docs/papers-interaction.md`
- 站内长文写作规范：`docs/blog-writing-guide.md`（front matter 契约、正文结构、发稿自查清单）
- 部署说明：`docs/DEPLOY.md`
- 工程取舍记录：`docs/implementation-notes.md`

> `docs/` 下的验收 / 性能类报告（`acceptance-report.md`、`lighthouse-include.md`、`og-image-and-a11y-report.md`、`lighthouse/*.json`、`fa-data/`）是**历史快照**，只反映各自标注日期的实测状态，不随代码更新，需要现状请重跑 `scripts/` 里对应的工具。