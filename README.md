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

| kind | 调色板 token | 含义 |
| --- | --- | --- |
| `question` | `--kind-question-edge` / `--kind-question-ink` | 疑问 / 待查 |
| `insight` | `--kind-insight-edge` / `--kind-insight-ink` | 心得 / 灵感 |
| `critique` | `--kind-critique-edge` / `--kind-critique-ink` | 方法学质疑 |
| `figure` | `--kind-figure-edge` / `--kind-figure-ink` | 配合插图说明 |
| `link` | `--kind-link-edge` / `--kind-link-ink` | 外链补充阅读 |
| `typo` | `--kind-typo-edge` / `--kind-typo-ink` | 待勘误 |

> 批注各 kind 的配色**唯一真源**是 `src/assets/css/components/_paper.css` 的 kind 调色板段
> （每 kind 一条 edge + 一条 ink）；上表只列 token 名，不复制色值 ——
> 色值抄进文档等于多一份会各自漂移的副本。完整规范见 `docs/papers-interaction.md` §3.4。

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


> **这张表不写具体档数**：每套自测的档位会随自测演进而增减（注入档 / 判据级负对照 /
> 覆盖度自证 / 故意判绿 / 退回旧口径自检 …），把会变的数字写进现状陈述，
> **每加一档就变成一句假话**。所以表里只写每套自测**查什么能力**；
> 要确切档数，跑对应的 `npm run …-selftest`，它的输出会打印「N 档里 N 档按预期触发」。

| 命令 | 查什么 |
| --- | --- |
| `npm run build` | 整链：先跑离线门禁，再 Eleventy 构建，再跑产物门禁 |
| `npm run serve` | 本地 dev server（热更新） |
| `npm run check:gates` | **门禁接线**：每道门禁都必须从 `build` 可达（防止"门禁被摘掉"），**GW1–GW6**：门禁脚本（`check-` / `verify-` 开头）必须从 `build` 可达（GW1）、确实接不上的必须显式登记并写明理由（GW2）、本门禁自己没被卸掉（GW3）、自测脚本（`test-` 开头）也要有人跑（GW4）、**`scripts/` 顶层那些既不是门禁也不是自测的手工脚本必须二选一：接进 `build` 链、或登记成手工工具并写明它需要什么**（GW5 —— 这条缝此前无人看守：实测有脚本依赖**未声明**的第三方包，干净克隆里根本跑不起来）、**登记必须点名它 require 的每一个未声明第三方包**，否则"它需要什么"这句话是空的（GW6 —— 机器核对，不靠人自觉） |
| `npm run check:selftest-guard` | **自测档位清单守卫**：每个接在 build 链上的自测都必须经由 `scripts/run-selftest.cjs` 跑，并与 `scripts/lib/selftest-slots.cjs` 的**静态清单**双向对账（少跑一档、多跑一档都判红）—— 静态清单**独立于各自测实现**，删掉某一档时清单不会跟着变 ⇒ 守卫当场红（从实现反推的清单是镜子，不是守卫）；包装器另有一条**兜底判据**：每个行首标记行都必须有出处（是清单里的编号、还是登记过的锚点、还是被显式声明成「不是一档」），没有出处就判红 ⇒ 编号形态不合格的档不再"守卫看不见"；元门禁五条判据：SG1（接线上的自测必须都在静态清单里，否则守卫对它完全无效）、SG2（必须经由包装器，绕过包装器等于没人守）、SG3（清单不许留孤儿：文件没了、或没人跑，都判红）、SG4（覆盖度自证：接线自测数与清单条目数都不得低于下限，防止两边被一起砍掉时一起变绿）、SG5（登记自洽：锚点词不得与清单编号重叠、锚点次数必须为正整数、登记不许留孤儿） |
| `npm run check:selftest-guard-selftest` | 上面那道元门禁的本地夹具自测（注入矩阵，在**临时目录副本**上跑，仓库真源一个字节不改，证明它能变红；含**判据级负对照**：静态清单缺一项 ⇒ 红因只有 SG1、某个自测绕过包装器 ⇒ 只有 SG2、清单留孤儿 ⇒ 只有 SG3、接线与清单被一起砍到下限以下 ⇒ 只有 SG4、登记自相矛盾（锚点与编号重叠 / 登记留孤儿 / 锚点次数非法）⇒ 只有 SG5；**红因归属纯净性断言**（每档红只许出现自己那一条判据的编号）；包装器侧另有少跑一档 / 多跑一档两档，红因**点名缺的那一档**；兜底判据侧另有：一行首词形态不合格又没登记 ⇒ 红因只有兜底判据且点名那一行、锚点登记了却没跑 ⇒ 红因点名那个锚点、锚点恰好兑现 ⇒ 放行、显式声明成「不是一档」的行 ⇒ 不误报；自测本身红 ⇒ 退出码原样透传，不许被包装器吞掉） |
| `npm run check:tracked-refs` | TR1–TR6：已跟踪文件里引用的本地文件必须也已被 git 跟踪（代码文件的静态 require/import 与 HTML 页面的本地资源引用都在内，各带一条自证存活） |
| `npm run check:tracked-refs-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，在**临时 git 仓**上跑，证明它能变红；含 **判据级负对照**（逐条卸掉 TR1–TR6 后对应注入必须转绿）、**精准性负对照**、**覆盖度自证**（代码侧与 HTML 侧的数量都与夹具真实数量对账）、**故意判绿**（注释里 / 字符串里写着本地 require 的字样、HTML 里的站内绝对 URL、HTML 注释里的资源引用都不算引用 —— 补之前这几档是红的）；**红因归属纯净性断言**（每档红只许出现自己那一条判据的编号）） |
| `npm run check:log-sections` | 改进日志的 `##` 节**只增不减**（历史全量核对） |
| `npm run check:deps` | **依赖与运行时体检**（离线）：声明下限不得低于下限表（DEP1 —— 表记的是「低于这一版就中过招」的上游事实，与现在锁哪一版无关）、锁文件实际锁定的版本不得低于下限表（DEP2）、锁文件每个包条目都必须带 `integrity` 哈希（DEP3）、锁文件根声明必须与 `package.json` 逐字一致（DEP4 —— 不一致时 `npm ci` 直接失败、CI 会红，而本机看不出来）、**CI 用的 Node 版本必须同时满足 `package.json` 的 `engines` 与依赖树各包的 `engines` 下限**（DEP5 —— npm 对 engines 不匹配默认只警告不报错 ⇒ 声明与实际跑的运行时脱节没人看得见；各 setup-node 步骤还必须是同一个版本）、**CI 用的 Node 不得低于底线表**（DEP6 —— Node 20 已于 2026-04-30 结束支持；底线表独立于当前钉的版本，声明被放松也拦得住） |
| `npm run check:deps-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，在**副本**上注入，证明它能变红；含判据级负对照） |
| `npm run check:dep-audit` | **依赖漏洞审计（联网，不在 build 链上）**：用 npm 官方源跑 `npm audit`，依赖树里有 high / critical 级公告就判红（DA1）。⚠️ 必须显式指定官方源 —— npm 镜像源**不实现 advisories 接口**（实测 404），在镜像源上跑 `npm audit` 永远报不出漏洞，却给人「已经查过了」的错觉 |
| `npm run check:url-safety` | **注入面**（离线）：产物里不得出现**可执行 URL**（US1 —— 脚本协议与 `data:text/html` / `data:image/svg+xml` 这类「点开即执行」的 URL；`data:image/png` 这类只是显示的不算；按**上下文**扫：HTML/SVG 只看 URL 属性值、**事件处理属性**（`onclick=` / `onload=` —— 那是会执行的代码）、内联脚本、内联 style 与 `srcdoc`（它的值是会被当作文档执行的 HTML），URL 值先**解码 HTML 实体**并去掉制表符/换行 ⇒ `&#106;avascript:` 与 `java<TAB>script:` 这类混淆也抓得住；协议必须落在**该位置的开头**（属性值的开头 / 字符串字面量的开头 / CSS 的 `url(` 后面）⇒ 散文里提到 `javascript:`、正则字面量、查询串里带这个词都**不**判红；`<img src>` 里的 SVG 是惰性图片 ⇒ 放过）、站内 JS **与 HTML 内联脚本**不得把字符串当 HTML 解析（US2 —— `innerHTML` / `outerHTML` / `insertAdjacentHTML` / `document.write` / `setHTMLUnsafe`；站内文本一律走 `createTextNode`）、注释层的外链必须**只放行 http/https**（US3 —— 门禁在 Node 里**真的 import 产物里的白名单模块**、喂 20 条输入逐条核对放行与否：静态扫描看不出白名单到底放行了什么，**行为实测**才算数；且白名单必须**导出协议清单**且恰为 http/https —— 输入表是有限的，表外的协议只能靠清单抓；清单**必须真被用上**、不许读环境变量，否则判红）、覆盖度自证（US4 —— 产物里必须找得到那个模块、必须能 import 成功、产物 JS 文件数不得低于下限，且 build 链里必须有脚本的命令**逐字**等于 `node scripts/check-url-safety.cjs`：只提到文件名不算，被 `\|\| true` 架空、被注释掉、带了参数，也都不算）、**渲染层必须绑在白名单上**（US5 —— **全站** JS 与页面内联脚本里除白名单模块外**不得产出 href**（对象键 / 下标赋值 / 属性赋值 / `setAttribute` / `setAttributeNS` 五种写法都认；站内跳转 `location.href`、数据属性 `data-href`、片段链接除外）⇒ 白名单模块是唯一能产出 href 的地方，渲染层改回「把数据里的 URL 直接写进 href」当场判红） |
| `npm run check:url-safety-selftest` | 上面那道门禁的本地夹具自测（**39** 档：合成产物副本上注入 **SA0–SA12** 与 **SA18–SA34**，证明它能变红 —— 含**独立复核三轮实测出来的假绿路径**：HTML 实体混淆、制表符混淆、同一行里 `//` 之后的注入点、事件处理属性里的脚本协议、渲染层绕过白名单的**五种**写法（对象键 / 下标赋值 / `setAttribute` / `setAttributeNS` / 大写属性名）、渲染层挪出目录或挪进页面内联脚本、白名单导出清单与实际行为脱钩、build 链只提到门禁名 / 被 `\|\| true` 架空 / 被注释掉、表外协议；含**判绿对照 SA25 与 SA35–SA38**（惰性 SVG、站内跳转 `location.href`、数据属性 `data-href`、散文里提到 `javascript:`、查询串里带 `javascript:` —— 正当写法一律不许假红）；含判据级负对照 **SA13–SA17**（逐条卸掉判据后同一夹具必须转绿）与**子判据级负对照 SA27**（单独卸掉某条子判据后对应夹具必须转绿）） |
| `npm run check:decision-ids` | **编号唯一性**：一个编号只能指一件事 —— **DI0–DI4**。**DI0 / DI4** 是判据自证（台账定位得到、且至少认领一个编号，否则判据空跑）；**DI1** 台账认领的号在别处有同号声明时，两者必须指向同一件事；**DI2** 中央台账内一个编号只能被一条登记认领；**DI3** **缺陷台账**（`docs/DEFECT-BACKLOG.md`）里同一个缺陷号同样只能被一行认领 —— 两套号互不引用、不可混用，本门禁分别判红、不做跨套比对。**红因与改法按两种形态分开**：逐字相同 ⇒ **重复登记**，删掉多出来那一行；词句不同 ⇒ **同号两义**，改成下一个空号（最大号 + 1，不是填补空缺） |
| `npm run check:decision-ids-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，在**副本**上注入，证明它能变红；含**缺陷台账这一族**的四档：同一条缺陷登记被逐字写两遍 ⇒ 红因必须是"重复登记"、同一个缺陷号被两条不同登记认领 ⇒ 红因必须是"同号两义"且改法点名下一个空号、台账小节标题被改掉 ⇒ 判据自证判红、**判据级负对照**把该判据整行摘掉后同一注入必须转绿） |
| `npm run check:blog-frontmatter` | 博客 front matter 契约（`docs/blog-writing-guide.md`）：形状 / slug 命名 / 字段类型 / 不得覆盖自动注入的字段 |
| `npm run check:blog-frontmatter-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，证明它能变红） |
| `npm run check:tag-leak` | 集合名标签不许漏到读者眼前：渲染详情页版式与列表页，确认集合名（`blog` / `portfolio`）没被当主题标签印出来 |
| `npm run check:tag-leak-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，证明它能变红） |
| `npm run check:css` | CSS 大括号平衡 + 死 CSS |
| `npm run check:dead-css-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，在**自造的最小夹具站**上跑，证明它能变红；含 **判据级负对照**：分别卸掉 DZ1–DZ4 判定后对应注入必须转绿，证明每条判据的红确实来自它自己；**红因归属纯净性断言**（每档红只许出现自己那一条判据的编号）；**覆盖度自证**（样式表目录被清空必须判红）；**门禁被摘掉**必须判红） |
| `npm run check:css-braces-selftest` | CSS 大括号平衡那道门禁（`npm run check:css` 的前一半）的本地夹具自测（注入矩阵，在**自造的最小夹具站**上跑，证明它能变红；含 **判据级负对照**：分别卸掉 CB1–CB4 判定后对应注入必须转绿，证明每条判据的红确实来自它自己；**红因归属纯净性断言**（每档红只许出现自己那一条判据的编号，多一条少一条都算失败）；**遮罩自证**（注释、字符串、未加引号 url() 里的花括号必须被跳过）；**空跑判红**（一张样式表都扫不到必须判红）；**门禁自己没被卸掉**必须判红；**覆盖度自证**（报出的样式表张数与真实张数一致）；每处注入额外断言**改动行数**符合声明，防「破坏没打上」） |
| `npm run check:wrap` | 长 DOI / 长 URL 不能把窄屏页面撑破 |
| `npm run check:wrap-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，在**自造的最小夹具站**上跑，证明它能变红；含 **判据级负对照**（N-W1–N-W4）：分别卸掉 W1–W4 判定后对应注入必须转绿，证明每条判据的红确实来自它自己；**精准性负对照**（卸 W4 + 破坏解析器 + 叠加 W2 注入 ⇒ **仍红但红因集合恰为 {W2}**）；**红因归属纯净性断言**（每档红只许出现自己那一条判据的编号，多一条少一条都算失败）；**级联洞**（同一声明块里末位是 break-word 必须判红 —— 补之前是绿的）；**!important 假阳性**（`anywhere !important` 必须判绿 —— 补之前是红的）；**解析器自证**（解析器坏了必须判红）；**覆盖度自证**（报出的扫描数量与夹具真实数量一致；门禁源码里 W1–W4 每条都有红因出口与可卸开关）；每处注入额外断言**改动行数**符合声明，防「破坏没打上」） |
| `npm run check:focus-ring` | **键盘焦点环必须够看得见**：焦点环是**双色环**（内圈 + 外圈），在浅色 / 暗色（`prefers-color-scheme`）/ 暗色（`[data-theme]`）三个主题 × 7 个登记底色上，两圈里**至少一圈**的对比度必须 ≥ 3:1（WCAG 1.4.11 非文本对比度 —— 单一颜色做不到这件事：不透明的 brand-400 在主按钮底上只有 1.85:1）；两圈必须是实色、两圈必须引用不同的 token、两处暗色块的写法必须与 `:root` 逐字相同（靠内层色阶 token 被暗色重映射）、本门禁自己必须接在 build 链上 |
| `npm run check:focus-ring-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，证明它能变红；含 **判据级负对照**（卸掉某条判据后对应注入必须转绿）、**故意判绿**（内外圈引用互换、外圈换成纯黑都必须判绿 —— 判据守的是「至少一圈达标」，不挑具体颜色）、**同源负对照**（卸掉 FC1 后仍红，但红因里不再出现 FC1）、**覆盖度自证**（底色清单被清空必须判红）、**扫描器自证**（把对比度计算弄坏必须让注入转绿）、**门禁被摘掉**必须判红） |
| `npm run check:tool-routes` | 浏览器工具量到的必须是真页面，不是本站 404 页 |
| `npm run check:tool-routes-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，在**自造的最小夹具站**上跑，证明 RT1–RT9 每条判据都能变红；含 **判据级负对照**：卸掉 RT5 后对应注入必须转绿、卸掉 RT5 后再叠加一条 RT7 注入必须**仍红**但红因集合恰为 {RT7}（证明卸判据是精准的，不是把门禁整个关掉）、卸掉 RT9 后对应注入必须转绿；**红因归属纯净性断言**（每档红只许出现自己那一条判据的编号，连红因**行数**也要相等）；**故意判绿**（工具里写的是真实存在的本地文件系统路径、站点路径只出现在注释里 —— 两者都必须判绿）；**覆盖度自证**（判据编号从门禁源码现读，门禁新加判据而本矩阵没补档即判红）） |
| `npm run check:navigation` | **顶层导航只有一份真源**：`site.js` 的 nav 数组与各模板的 `eleventyNavigation` 必须逐位对齐（key 同名、order 等于位次），产物上每一页的页头导航必须与真源一致，导航入口必须指向真实存在的页面 |
| `npm run check:navigation-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，证明它能变红；含**负对照**：三处一起改必须判绿、门禁被摘掉必须判红） |
| `npm run check:site-js` | **站点 JS 真的能被浏览器加载起来**：产物 JS 的语法按浏览器加载它的那张嘴判（module / 经典脚本）、模块说明符必须闭合到真实存在的产物文件（裸说明符判红）、内联脚本必须能解析、内联 module 的说明符与 `<script src>` 必须按**页面 URL 口径**落到真实存在的文件 |
| `npm run check:site-js-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，证明它能变红；含 **判据级负对照**（卸掉某条判据后对应注入必须转绿）、**故意判绿**（把 import 指向一个真实存在的新文件必须判绿）、**覆盖度自证**（抽掉全部 JS 必须判红）；另有**D10 原样复刻**与一档扫描器 tricky 档） |
| `npm run check:js-targets` | **站内脚本查询的目标 DOM 必须在产物里真实存在**：脚本用 `querySelector` / `closest` / `getElementById` 拿的元素，若在产物里找不到、也不由站内脚本运行时创建 ⇒ 那段行为**永远不会发生**（脚本被下载、被执行，却命中不到任何东西）⇒ 判红（JA1）。判定按 **CSS 选择器语义**逐层做：选择器列表按顶层逗号拆成**分支**（分支之间是「或」，任一分支可达即可），分支内的 token（类名 / 属性名 / id）之间是「与」，伪类 / 伪元素 / 标签名不产生约束；选择器写在 `const` 绑定里的也能解出来，脚本**运行时创建**的类名 / 属性名也算可达。另含**覆盖度自证**（JA2）、**门禁自己没被卸掉**（JA3）与**逐模块提取自证**（JA4） |
| `npm run check:js-targets-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，在**自造的最小夹具站**上跑，证明它能变红；含 **判据级负对照**：分别卸掉 JA1–JA4 判定后对应注入必须转绿，证明每条判据的红确实来自它自己；**红因归属纯净性断言**（每档红只许出现自己那一条判据的编号，多一条少一条都算失败）；**覆盖度自证**（所有脚本都不查 DOM 必须判红）、**常量解析**档、**运行时创建**档） |
| `npm run check:site` | 结构化数据与元数据逐项核对（`scripts/verify-site.cjs`） |
| `npm run check:verify-site-selftest` | 上面那道门禁的本地夹具自测（**注入矩阵**，在真实产物的副本 + 沙箱源码副本上跑，证明 0–33 号每道门禁都能变红；含 **判据级负对照**（逐条卸掉门禁开关后对应注入必须转绿 —— 这同时证明每个可卸开关都真被 `fail()` 消费）、**精准性负对照**（比较点目录少登记一项 / 门禁 32 少一条判据 / `fail()` 不再读开关表 ⇒ 覆盖度自证必须报红）、**退回旧口径自检**（红因不带门禁号 ⇒ 编号解析为空；产物为空时每页检查必须显式豁免，不能悄悄不跑）、**红因归属纯净性断言**（每档红只许出现自己那一条门禁号）） |
| `npm run check:page-deps` | **页面依赖闭包**：一页的 `lastmod` 必须等于它**依赖闭包**里最晚的 git 提交时间（内容由别的文件提供时也算数）；闭包不许退化成「只看自己」、不许引用不存在的文件，模板引用必须写字面量，sitemap 不许漏掉页面，全局数据必须登记 |
| `npm run check:page-deps-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，证明它能变红；含**故意判绿**的负对照） |
| `npm run check:404-depth` | 404 页的站内 URL 必须根绝对（GitHub Pages 把 404 页送到任意缺失路径，相对 URL 会被解析到请求路径下） |
| `npm run check:404-depth-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，证明它能变红） |
| `npm run check:mount-contract` | 文档与代码口径一致：凡是承诺产物可整体搬迁到任意部署位置的行，都必须带例外限定；README 要讲清 404 页这个例外，`relUrl` 的 404 特判也得在位 |
| `npm run check:mount-contract-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，证明它能变红） |
| `npm run check:deploy-target` | **发布落点必须对得上**：文档里的发布命令（只认**代码块里**那一行）用的远端必须在 `git remote -v` 里真实存在（DP1）、该远端必须指向文档声明的发布仓库（DP2 —— 命令说推 A、声明说落点是 B 时就靠这条抓住）、推的分支必须在部署工作流的触发分支里（DP3 —— 推到不触发的分支**不报错也不部署**，最难发现）；另含覆盖度自证（DP4：一条发布命令 / 一个远端 / 一处发布仓库声明 / 要扫的活文档都得在，缺一即判红，防「改空了通过」）；**部署工作流本身**也归这条门禁管：工作流里的 action 必须钉到 **commit SHA**（DP5 —— tag 是可移动引用，上游改 tag 就换了要跑的代码）、工作流**顶层** permissions 必须只读（DP6 —— 顶层写权限 = 每个 job 都持有，含执行仓内代码的那个；写权限要收窄到具体 job）、action 的**执行运行时**必须是 node24（DP7 —— 运行时由上游 action.yml 的 `runs.using` 决定，Node 20 已于 2026-04-30 EOL；仓内用「node24 底线表 + 基线表（按 SHA 反查版本）」离线核对，升级必须同步改表）、部署必须**串行且不杀在途**（DP8 —— `concurrency` 段必须在，`cancel-in-progress` 不得为 `true`：true 意味着新推送一到就杀掉正在跑的生产部署，站点停在半更新状态而 run 只显示 cancelled）、每个 job 必须声明 `timeout-minutes`（DP9 —— GitHub 默认上限 360 分钟，配合「不杀在途」，一次挂死的部署能独占并发组六小时）、CI 的依赖安装必须走**锁文件安装**（DP10 —— `npm install` 会绕过锁文件重新解析版本范围，构建不再可复现）、CI 取包必须指向 **npm 官方源**且配 `replace-registry-host=always`（DP11 —— 本仓锁文件里 130 条 resolved 全部指向第三方镜像，不改这一条，GitHub 的 runner 就是去那个镜像取包；换主机**不改内容**，integrity 哈希照旧校验） |
| `npm run check:deploy-target-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，在**临时 git 仓副本**上跑，证明它能变红；含**判据级负对照**：复制门禁源码到 tmp 再同行替换掉某条判据 ⇒ 同一夹具**转绿**，证明那条红确实是它判出来的；**红因归属纯净性断言**（每档红只许出现自己那一条判据的编号）；**覆盖度自证**（每条红因至少有一档能证明它会变红）） |
| `npm run check:design-contract` | 设计系统文档与代码一致：徽标类名族、token、partial 清单、dev/prod 判定都必须与 `src/assets/css` / `eleventy.config.js` 对得上 |
| `npm run check:design-contract-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，证明它能变红） |
| `npm run check:design-components` | 设计系统文档 §6「组件清单」的类名与规格必须与代码现实一致：§6.1 / §6.2 / §6.5 / §6.6 点名的类名必须在 `src/assets/css` 里真实存在（DCX1 —— 写 `.btn-primary` 而代码只有 `.btn--primary`，照着文档实现就等于实现了一个不存在的类）；这些小节点名的规格 token 必须真被该组件自己的 CSS 规则 var() 引用（DCX2 —— 「token 在代码里存在」不等于「这个组件用了它」）；§6.1 变体表的 min-height 必须与 CSS 逐行一致（DCX3 —— 变体自己没写就回退取基础类的值，44px↔36px 互换也要抓出来）；另含覆盖度自证（DCX4：类名数 / 规格 token 数 / 尺寸表行数 / CSS 规则数都不得低于门槛，防「把文档改空了就能过」）；含「规划中」的行整体豁免（文档有权写还没落地的能力，但必须明写） |
| `npm run check:design-components-selftest` | 上面那道门禁的本地夹具自测（**合成夹具**注入矩阵 —— 夹具里的类名与 token 名都换成另外一套，证明门禁是**真源驱动**而不是把真实类名写死；含**判据级负对照**：复制门禁源码到 tmp 再同行替换掉某条判据 ⇒ 同一夹具**转绿**，证明那条红确实是它判出来的；**红因归属纯净性断言**（每档红只许出现自己那一条判据的编号）；**覆盖度自证**（每条红因、每条判据都至少一档能证明它会变红）；另含**前缀唯一性自证**（本门禁的编号前缀不许被别的门禁占用）） |
| `npm run check:information-architecture` | 信息架构文档与代码现实必须对得上：文档里出现的每一条字面站内路径，要么当前真实存在、要么在『落地状态』表里被逐条点名（IAC1 —— 两者都不是，就是既没实现、也没被承认没实现）；『落地状态』表不得过期、也不许点名根路径（IAC2 —— 已经实现的还留在表里 = 表在骗人，点名根路径 = 豁免全站、等于这张表什么都不管）；导航表必须与真源 `src/_data/site.js` 的 nav 数组逐项对齐（IAC3 —— 入口个数与路径集合都要一样）；内容源路径必须带 `src/` 前缀且真实存在（IAC4 —— 照着缺前缀的路径建目录，Eleventy 压根不采集那个位置）；front matter 字段必须与真源一致（IAC5 —— 博客字段得是站内写作契约列出的可写字段，论文字段得是真实条目真读的那些，还没实现的集合那一节必须明写「规划中」）；已拍板的口径不许被规划稿推翻（IAC6 —— 全站英文、后台形态 Decap CMS 两条已定结论，文档必须写明且不得复述被推翻的旧说法）；另含覆盖度自证（IAC7：扫到的路径数 / 清单条目数 / 核对过的字段数 / 文档行数 / 核对过的页面骨架小节数 / 页面区块锚点数都不得低于门槛，防「把文档改空了就能过」）；§四「各页面骨架」必须与页面模板真源逐条对账（IAC8 —— 文档多写一个模板里根本没有的区块 = 凭空承诺；IAC9 —— 模板里真实存在的区块必须逐个列出来，已实现的页面还必须整行写出「区块锚点」；IAC10 —— 还没有页面模板的路由必须在小节里明写「规划中」）；详情页骨架同样要逐条对账（IAC11 —— 详情页小节多写一个集合 layout 里根本没有的区块 = 凭空承诺；IAC12 —— 集合 layout 里真实存在的区块必须逐个列出来，详情页小节还必须整行写出「区块锚点」；IAC13 —— 详情页路由（家族前缀 + `{slug}`）解析不到真实集合与它的 layout 时必须明写「规划中」；IAC14 —— 任何已经有内容条目的集合，文档都必须为它写一节详情页骨架） |
| `npm run check:information-architecture-selftest` | 上面那道门禁的本地夹具自测（**合成夹具**注入矩阵 —— 夹具里的路径名 / 集合名 / 字段名都换成另外一套，证明门禁是**真源驱动**而不是把真实名字写死；含**判据级负对照**：复制门禁源码到 tmp 再同行替换掉某条判据 ⇒ 同一夹具**转绿**，证明那条红确实是它判出来的；**红因归属纯净性断言**（每档红只许出现自己那一条判据的编号）；**覆盖度自证**（每条红因、每条判据都至少一档能证明它会变红）；另含**前缀唯一性自证**（本门禁的编号前缀不许被别的门禁占用）） |
| `npm run check:doc-snapshot` | 现状陈述里不许写死每轮都会变的数量（如 build 链的段数）：含缺陷编号的历史块按原样保留，现状块里出现「数字 + 步」就判红 |
| `npm run check:doc-snapshot-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，证明它能变红，且每档只触发自己那一条判据） |
| `npm run check:doc-reality` | 文档里的「现状」与「接入流程」必须和代码现实一致：论文语境段落点名的论文标识得在 `src/content/papers/` 下真实存在（DR1）；现状陈述里不许写死会变的论文篇数（DR2）；「必填 front matter 字段」清单里的字段得真在 front matter 里（DR3）；自动注入的字段不许被列为必填（DR4）；另含覆盖度自证（DR5：活文档 / 真实论文 / 目录数据文件 / 必填字段清单 / 论文语境段落，五样缺一即判红，防「改空了通过」）；活文档点名的仓内路径得真实存在（DR6，照着它去改文件不会落空）；接入流程文档必须在、且每份活文档检出的仓内路径候选数不得低于下限（DR7，防扫描面被收窄或文档被改空）；接入指南里不许写死会变的条目数（DR8）；改进计划类文档的每条改进项都必须同时写出「当时的证据」与「当前状态」两个标记、且现状必须写成机器可核对的断言（DR9：结构与覆盖度自证，断言被删光即判红，防「改空了通过」）；断言里的 token 必须在门禁登记过，没登记的不会被检查（DR10）；断言取值必须与代码现实逐条一致，代码变了而本文没跟上即判红（DR11）；改进计划这类活文档里不许写死会变的篇幅数（DR12，明确标为「当时的」的历史那一半豁免） |
| `npm run check:doc-reality-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，在**临时副本**上跑，证明它能变红；含**判据级负对照**：复制门禁源码到 tmp 再同行替换掉某条判据 ⇒ 同一夹具**转绿**，证明那条红确实是它判出来的；**红因归属纯净性断言**（每档红只许出现自己那一条判据的编号）；**覆盖度自证**（每条红因至少有一档能证明它会变红）） |
| `npm run check:writing-contract` | 站内**写作契约**（`docs/blog-writing-guide.md`）必须和代码现实一致：§2.4 的 F 判据对照表与 front matter 门禁源码里真实存在的判据得一一对上（WC1）；§2.5 的 T 判据对照表与集合名门禁源码要对上（WC2）；正文里提及的判据编号得真实存在（WC3）；§1「自动注入的字段」表与目录数据文件实际注入的字段要对上（WC4）；§2 字段表里标为「可写」的字段不许同时出现在 §4 自查清单的「别写」里（WC5）；不许写死「N 档」这种每轮都会变的数字（WC6）；另含覆盖度自证（WC7：活文档 / 两道门禁源码 / 目录数据文件 / §1 注入字段表 / §2 字段表 / §2.4 的 F 表 / §2.5 的 T 表 / §4 自查清单段，九样缺一即判红，防「改空了通过」） |
| `npm run check:writing-contract-selftest` | 上面那道门禁的本地夹具自测（**合成夹具**注入矩阵，在**临时副本**上跑，证明它能变红；含**判据级负对照**：复制门禁源码到 tmp 再同行替换掉某条判据 ⇒ 同一夹具**转绿**，证明那条红确实是它判出来的；**红因归属纯净性断言**（每档红只许出现自己那一条判据的编号）；**覆盖度自证**（每条红因至少有一档能证明它会变红）） |
| `npm run check:markdown-tables` | **仓库里每一张 Markdown 表格都必须真的是一张表**：表格是两段式语法（表头行 ＋ 分隔行），中途出现空行 ⇒ GFM 在空行处就终止表格，空行之后那些行渲染时退化成**带字面竖线的段落**，不是表格（TBL1）；表头行与分隔行**必须配成一张表** —— 两行格数要相等、分隔行每格都要有连字符，否则 GFM **整块都不识别**，同样退化成段落（TBL5）；真正属于本表的数据行，其**未转义竖线**算出的格数必须与表头相等 —— 少一格 ⇒ GFM 在右侧补空格、**内容不丢**；多一格 ⇒ 多出来的那几格**被忽略**；**行内代码 span 里的裸竖线**会把它切开 ⇒ 后面几格整体左移错列、尾部被丢（TBL2）；另含覆盖度自证（TBL3：扫到的文件数 / 表数 / 数据行数都不得低于门槛，防「扫不到东西就当没问题」）与门禁自己没被卸掉（TBL4）；**扫描面不得越界**（TBL6：仓库自己的 .gitignore 声明了哪些目录不进版本控制，那些目录里的 markdown 不是仓库内容 —— 扫它等于拿本机状态冒充仓库状态（本地红、线上绿）；扫到了就判红，且不判它的表格；.gitignore 读不到则 fail closed） |
| `npm run check:markdown-tables-selftest` | 上面那道门禁的本地夹具自测（**合成夹具**注入矩阵 —— 夹具里的表格内容与真实仓库完全不同，证明门禁是**真源驱动**；含**判据级负对照**：复制门禁源码到 tmp 再同行替换掉某条判据 ⇒ 同一夹具**转绿**，证明那条红确实是它判出来的；**红因归属纯净性断言**（每档红只许出现自己那一条判据的编号）；**覆盖度自证**（门禁在基线上确实认出了应有的文件 / 表 / 数据行数）；另含**前缀唯一性自证**（本门禁的编号前缀不许被别的门禁占用）） |
| `npm run check:paper-interaction` | 论文精读交互契约：文档与 README 里的 kind 配色契约必须和代码现实一致 —— §3.4 表与 README 表的 kind 集合必须与批注脚本里的 kind 真源**双向**一致，少列多列都判红（PI1）；代码内部自洽（标签与图标的 kind 键集合相同、调色板的 kind 集合与代码一致、每个 kind 的 edge 与 ink 成对齐全，PI2）；文档表里的 kind token 必须在调色板真源里真实定义（PI3）；文档表里不得复制色值真源（PI4 —— kind 配色的唯一真源是样式表里的 kind 调色板段，文档只列 token 名；这一族漂移正是「抄了第二份」造成的）；文档里的批注类名必须真实存在（PI5 —— 普通类名精确命中，模板类按前缀匹配）；文档里带 kind 属性选择器的规则必须用代码里真正承载该属性的类（PI6 —— 挂到别的类上那条规则永远匹配不上）；另含覆盖度自证（PI7：kind 真源脚本 / 调色板真源样式表 / §3.4 表 / README 表 / 附录 B 表 / §5.2 代码块，六样缺一即判红，防「改空了通过」）；论文正文的每一个小节标题都必须能被目录选中（PI8 —— 目录脚本只挑带 id 的标题，markdown 裸标题渲染出来没有 id，会被整条排除，论文自己的小节就进不了目录）；同一份论文正文里的 id 不得重复（PI9 —— 重名时 #id 只解析到第一个，目录锚点会指错地方） |
| `npm run check:paper-interaction-selftest` | 上面那道门禁的本地夹具自测（**合成夹具**注入矩阵 —— 夹具里的 kind 与类名都换成另外一套，证明门禁是**真源驱动**而不是把真实 kind 写死；在**临时副本**上跑，证明它能变红；含**判据级负对照**：复制门禁源码到 tmp 再同行替换掉某条判据 ⇒ 同一夹具**转绿**，证明那条红确实是它判出来的；**红因归属纯净性断言**（每档红只许出现自己那一条判据的编号，多一条少一条都算失败）；**覆盖度自证**（每条红因、每条判据都至少有一档能证明它会变红）；另含**前缀唯一性自证**（本门禁的编号前缀不许被别的门禁占用）） |
| `npm run check:image` | 页面里声明的图与产物里真实存在的图是同一张（**分享图体积上限 ≤ 200 KB**、`og:image:type` 与文件**真实格式**一致，两者都带空跑防护） |
| `npm run check:image-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，在**自造的最小夹具站**上跑，证明它能变红；含**判据级负对照**（门禁副本分别卸掉 IA8 / IA9 / IA10 判定后对应注入必须转绿，证明那条红确实来自它自己）；**红因归属纯净性断言**（每档红只许出现自己那一条判据的编号，多一条少一条都算失败）；**覆盖度自证**（门禁新加判据而本矩阵没补档必须判红）；**故意判绿**（`<style>` 块与 HTML 注释里的假 `<img>` 不算图）） |
| `npm run check:img-srcset` | 响应式图片声明（`srcset` / `imagesrcset`）的**每个候选 URL** 必须落到真实存在的产物文件（按页面 URL 口径解析）；`<img>` 必须留 `src` 兜底；候选列表不得为空；描述符必须合法且**不得混用宽度与密度**（混用会让整条声明被浏览器忽略） |
| `npm run check:img-srcset-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，证明它能变红；含 **判据级负对照**（卸掉某条判据后对应注入必须转绿）、**故意判绿**（把候选改成一个真实存在的新文件必须判绿）、**覆盖度自证**（抽掉全部 srcset 必须判红）、一档扫描器 tricky 档） |
| `npm run check:img-loading` | **每张 `<img>` 都必须显式声明加载策略**：必须写 `loading`，且取值只能是 `eager` / `lazy`（不写 = 落回浏览器默认的 eager，首屏之外的图也抢带宽；写错取值浏览器会**静默忽略**）；`loading="eager"` 必须配 `fetchpriority="high"`（首屏 LCP 候选图的优先级必须显式给出），`fetchpriority="high"` 必须配 `loading="eager"`（两个属性成对，`high` 配 `lazy` 自相矛盾）；`fetchpriority` 取值只能是 `high` / `low` / `auto`（拼错会被静默忽略）；另含**覆盖度自证**与**门禁自己没被卸掉** |
| `npm run check:img-loading-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，证明它能变红；含 **判据级负对照**（卸掉某条判据后对应注入必须转绿）、**红因归属纯净性断言**（每档红只许出现自己那一条判据的编号）、**故意判绿**（`lazy` + `fetchpriority="low"` 是合法组合；新增一张合法的 lazy 图）、**覆盖度自证**（抽掉全部 `<img>` 必须判红）、一档扫描器 tricky 档） |
| `npm run check:img-publish` | **图片发布清单必须与「每张源图各自的消费点」严格对齐**：源代码（`src/**`，先剥注释；门禁与文档不算消费点）里**没人引用**的源图**不许**出现在产物里（IP1 —— 那是没人请求却占着部署体积的死副本，比如分享图 PNG 的 SVG 设计母版）；**被引用**的源图**必须**出现在产物里（IP2，否则页面拿它当 `<img src>` 直接 404）；产物里不许出现源目录已无的残留副本（IP3）；另含**覆盖度自证**（IP4）与**门禁自己没被卸掉**（IP5） |
| `npm run check:img-publish-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，在**自造的最小夹具站**上跑，证明它能变红；含 **判据级负对照**：分别卸掉 IP1–IP3 判定后对应注入必须转绿，证明每条判据的红确实来自它自己；**红因归属纯净性断言**（每档红只许出现自己那一条判据的编号，多一条少一条都算失败）；**覆盖度自证**（引用检测器认不出任何一张图必须判红）） |
| `npm run check:author-assets` | **作者图片资产三处必须对齐**：`site.js` 的 `author.photo` 里每个「值是图片路径」的键都必须有**真实消费点**（模板 / 脚本 / 配置的**代码**里引用了它；注释里提到不算）；每个键指向的源文件必须真实存在（否则页面直接断图）；源目录 `src/assets/img/author/` 下的每个文件都必须被某个键引用（防「文件在、没人用」却仍被打进产物）；产物 `assets/img/author/` 的文件集合必须与引用集合**完全一致**（多出来的就是漏删的旧文件）；另含**覆盖度自证**与**门禁自己没被卸掉** |
| `npm run check:author-assets-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，证明它能变红；含 **判据级负对照**（卸掉某条判据后对应注入必须转绿）、**红因归属纯净性断言**（每档红只许出现自己那一条判据的编号）、**故意判绿**（删掉非资产键 `alt` 不该判红）、**覆盖度自证**（真源 / 源目录 / 产物目录全空必须判红）、**注释剥离**档（消费点只写在注释里必须判红）） |
| `npm run check:figure-cover` | 论文封面图只有一处真源（site.js 的 `publications[].figure`），且正文 `<img>`、og:image、twitter:image、JSON-LD image 四个出口是**同一张图、同一组尺寸**；论文页 front matter 不得留封面副本 |
| `npm run check:figure-cover-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，在**临时沙箱副本**（真源 site.js + 论文页产物 + front matter + package.json）上跑，证明 CV1–CV4 每条判据都能变红；含**判据级负对照**（逐条卸掉 CV1–CV4 后对应注入必须转绿，证明每条判据的红确实来自它自己）、**红因归属纯净性断言**（每档红的红因集合必须**恰为**预期那几条，多一条少一条都算失败）、**覆盖度自证**（门禁解析出的判据集合与静态清单双向相等、红因出口数 == 归属表条数、每条红因至少有一档能证明它会变红）、**故意判绿**的边界负对照（真源与产物一起改错 ⇒ 门禁抓不到，必须判绿）、**真源读不出来**（真源文件不存在 / 真源是语法错的 JS ⇒ 门禁必须**打印失败横幅与那条红因**再退出，不许静默判红）） |
| `npm run check:lang` | 语言标记统一 + 编码损坏 |
| `npm run check:lang-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，在**自造的最小夹具站**上跑，证明 LG1–LG7 每条判据都能变红；含 **判据级负对照**（逐条卸掉 LG1–LG7 后对应注入必须转绿，其中一档叠加注入以证明卸判据是精准的、不是把门禁整个关掉）、**故意判绿**（front matter 整行注释、Nunjucks 注释、HTML 注释、CSS 注释、JS 行注释、数据层目录豁免、OG 品牌图目录豁免、exFAT 资源叉跳过、产物里的非 HTML 文件不扫、内联 script 与 style 块不扫 —— 每条豁免**单独**验一次）、**红因归属纯净性断言**（每档红只许出现自己那一条判据的编号）、**覆盖度自证**（判据编号从门禁源码现读，门禁新加判据而本矩阵没补档即判红）） |
| `npm run check:site-language` | 非 HTML 对外出口（feed / bib / ris / robots / sitemap）全英文；robots 的构建时刻与 feed 的 `lastBuildDate` 同一瞬间；语言门禁的每一条豁免都必须真的豁免到了**会渲染**的中文（中文只写在注释里的豁免判红，因为那是暗门） |
| `npm run check:site-language-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，证明它能变红；含**负对照**：分别卸掉 CJK 判定与「剥掉注释后再判」，证明这两条判据真的在起作用） |
| `npm run check:feed-discovery` | 订阅与爬虫的**自我描述入口**必须存在，且必须指向本站：每页**恰好一处** RSS 自动发现（`<link rel="alternate" type="application/rss+xml">`，按页面 URL 口径解析后落到本站 `feed.xml`，外域一律判红）；`feed.xml` 必须有 `<atom:link rel="self">` 且等于本站 feed 的规范绝对 URL，频道级 `<title>` / `<link>` / `<description>` 三件套齐备；`robots.txt` 必须**恰好一行** `Sitemap:` 且等于本站 sitemap 的规范绝对地址 |
| `npm run check:feed-discovery-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，证明它能变红；含 **判据级负对照**（卸掉某条判据后对应注入必须转绿；FD5 那档断言的是「红因里不再出现 FD5」—— 覆盖度自证与入口缺失天然同源，卸掉它不可能转绿，断言照实写）、**故意判绿**（href 换成与本站同源的绝对 URL 必须判绿）、一档扫描器 tricky 档） |
| `npm run check:feed-title` | 订阅源的**显示名必须只有一份**：真源 `site.feedTitle` 必须存在、非空、且是「站点名 + 自己的后缀」派生的；模板层（`.njk`）不许把显示名的后缀片段烤成字面量；产物里每处 RSS 自动发现的 `title` 属性、`feed.xml` 频道级 `<title>` 与真源三者必须逐字相同 |
| `npm run check:feed-title-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，证明它能变红；含 **判据级负对照**（卸掉某条判据后对应注入必须转绿）、**故意判绿**（片段只出现在模板注释里、整站一致改名都必须判绿）） |
| `npm run check:target-blank-rel` | **新标签页打开的链接必须带 rel 安全属性**：模板层（`.njk`）与产物层里每一个会开新浏览上下文的 `target`（`_blank` 或命名目标）的 `<a>` / `<area>`，`rel` 的 token 集合必须同时含 `noopener` 与 `noreferrer`（少 `noopener` ⇒ 目标页面能用 `window.opener` 把本站这个标签页导航走；少 `noreferrer` ⇒ 会把访客的来源页带出去）；`rel` 必须写成**字面量**（模板变量静态判不出，判红）；模板与产物都不许有 `<base target>`（那是**全站默认**的打开目标） |
| `npm run check:target-blank-rel-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，证明它能变红；含 **判据级负对照**（卸掉某条判据后对应注入必须转绿）、**故意判绿**（rel 多带无关 token、rel 的 token 大写、坏链接只出现在 HTML 注释或 Nunjucks 注释里、普通站内链接没有 rel，都必须判绿）、**覆盖度自证**（产物里一处会开新上下文的链接都不剩必须判红）、**扫描器自证**（把「读 rel 的 token」弄坏必须判红）） |
| `npm run check:block-language` | 块级内容全英文：产物里的 JSON-LD 结构化数据（逐块 JSON.parse 后递归遍历字段值与键名）、内联 `<script>`、内联 `<style>`（剥掉 CSS 注释后）都不许有中日韩字符；字段级豁免必须「用得出」（豁免用不上时只提示、不拦 build） |
| `npm run check:block-language-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，证明它能变红；含**负对照**：分别卸掉 CJK 判定与「剥掉 CSS 注释」，证明这两条判据真的在起作用） |
| `npm run check:css-comment-weight` | 产物里不许有 CSS 注释字节：内联 `<style>` 与外链 CSS 都不许带注释（注释在源码里保留 —— 那是维护者的笔记，不该跟着产物发给访客）；剥掉注释后仍须有内容（防「清空内联 CSS」骗过前一条）；覆盖度自证（内联块数、外链 CSS 数、每页都得有内联块） |
| `npm run check:css-comment-weight-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，证明它能变红；含**负对照**：分别卸掉 CW1 判定与「字符串字面量保护」，证明这两条判据真的在起作用；另有一档断言产物内联块与源码剥注释后**逐字相等**、一档剥除器的单元夹具） |
| `npm run check:css-publish` | **CSS 发布清单必须与「源样式各自的角色」严格对齐**：源 `src/assets/css/**` 下每个样式都必须有角色（内联 / 外链 / partial / 顺序声明），归不进任何角色就是死文件或漏了引用（CS1）；只被内联、没被外链的样式与顺序声明文件**不许**出现在产物里（CS2，否则就是没人引用却占着部署体积的副本）；被 `<link>` 引用的与 partial **必须**出现在产物里（CS3，否则页面样式直接 404）；产物里不许出现源目录已无的残留副本（CS4）；磁盘 partial 清单、`components/index.css` 的 `@import` 清单、`eleventy.config.js` 的 `order` 数组三处必须**集合相同且同序**（CS5）；另含覆盖度自证（CS6）、门禁自己没被卸掉（CS7）与模式判得出（CS8：产物里必须有 components.css，否则判不出 dev/prod 模式） |
| `npm run check:css-publish-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，在**自造的最小夹具站**上跑，证明它能变红；含 **判据级负对照**：分别卸掉 CS1–CS8 判定后对应注入必须转绿，证明每条判据的红确实来自它自己；**红因归属纯净性断言**（每档红只许出现自己那一条判据的编号，多一条少一条都算失败）；**覆盖度自证**（四类角色各至少认出一处）） |
| `npm run check:third-party` | **零第三方前端运行时依赖**：产物里的子资源引用（`script` / `img` / `iframe` / `video` 等）、`<link>` 的资源提示（`stylesheet` / `preload` / `preconnect` / `icon` 等）、CSS 的 `@import` 与 `url()`、站内 JS 的**硬编码**外域请求目标与外域 `import`，一律不许指向外域；确需外域的按**（域，上下文）**登记在门禁的白名单里并写明理由 |
| `npm run check:third-party-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，证明它能变红；含 **负对照**：分别卸掉 TD1–TD4 判定，证明那几档的红确实来自这四条判据本身；另有两档专验白名单的粒度与「用不上只提示不判红」） |
| `npm run check:a11y` | WCAG AA 实测缺陷固化成可重复检查 |
| `npm run check:a11y-contrast-selftest` | 上面那道门禁里**底色 token 跨主题压暗**判据的本地夹具自测（注入矩阵，证明它能变红：亮底 token 在暗色没重映射、压暗后仍偏亮都判红） |
| `npm run check:print-theme` | 打印结果与屏幕主题无关（深色底不会打成白底） |
| `npm run check:print-theme-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，在**自造的最小夹具站**上跑，证明 PT1–PT7 每条判据都能变红；含 **判据级负对照**（逐条卸掉 PT1–PT7 后对应注入必须转绿，其中一档叠加注入以证明卸判据是精准的、不是把门禁整个关掉）、**红因归属纯净性断言**（每档红只许出现自己那一条判据的编号，缺前提文件时只许红 PT7）、**覆盖度自证**（判据编号从门禁源码现读，门禁新加判据而本矩阵没补档即判红）） |
| `npm run check:copy` | 直接出字节的出口（`.bib` / `.ris`）取值方式正确 |
| `npm run check:copy-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，在**自造的最小夹具站**上跑，证明 CE1–CE9 每条判据都能变红；含 **判据级负对照**（逐条卸掉 CE1–CE9 后对应注入必须转绿）、**精准性负对照**（卸掉一条判据叠加另一条不连坐的注入，证明卸判据是精准的、不是把门禁整个关掉）、**红因归属纯净性断言**（每档红只许出现自己那几条判据的编号；前提缺失时只许红 CE1 / CE8，不连坐 CE7）、**覆盖度自证**（判据编号从门禁源码现读，门禁新加判据而本矩阵没补档即判红）） |
| `npm run check:overflow` | 多档宽度（360 / 390 / 640 / 768 / 820 / 1024 / 1440）都无横向溢出，独立交互目标的点击区达到 WCAG 2.5.8 的要求，且滚动定位的目标（跳转链接、论文页目录）不会被吸顶顶栏遮住（真浏览器实测，每档重新设视口；测量期间**外部资源请求**在浏览器层被拦掉 ⇒ **测量结果不依赖本机能不能出网**，外网不可达时照样能跑；拦哪些域是**从产物自身推导**的 —— 站点将来新增任何外域子资源，都会被自动收进清单，不需要人记得维护）**BR1–BR4**（浏览器这一环的自我保护）：**浏览器不许走代理**（`--no-proxy-server`）⇒ 测量与「这台机器此刻配了什么代理」彻底解耦 —— 实测 Chrome 会用**系统代理设置**，而它**未必豁免回环地址** ⇒ 门禁访问本机临时服务也会被代理接管 ⇒ 页面永远加载不完；**每一处等浏览器都有上限**（新增 `--timeout <毫秒>`，默认 20000；CDP 调用、load 事件、WebSocket 握手都受它管）；**浏览器层失败有专属红因**（点名「浏览器层失败」并写明「本次一次测量都没做成」，与「页面真的越界」措辞可区分，不抛未捕获异常栈）；**失败路径也会回收浏览器进程与临时目录**（此前超时路径直接抛出去 ⇒ 门禁拉起的 Chrome 留在机器上，实测堆积过 248 个） |
| `npm run check:overflow-selftest` | 上面那道门禁的本地夹具自测（证明它能变红：少测一档、视口没真改都判红；另含两档**负对照**：M7 ＝ 把门禁里「在浏览器层拦掉外部字体」那一步摘掉 ⇒ 当场判红，且红因点名「外部字体域 / 没有被阻断」（并断言输出里**没有「超时」**，免得红因串成「页面压根没加载完」）；M8 ＝ 另起一个本机服务扮演「产物之外的东西」，测量期间从它拿到响应 ⇒ 当场判红，且红因点名「不是本机产物服务」并带上那个资源的地址；M9 ＝ 把门禁里「从产物自身推导外域主机」那一步摘掉 ⇒ 覆盖度自证当场判红，红因点名 D75 与那个漏掉的外域主机（同样断言输出里没有「超时」，免得红因串成「页面压根没加载完」）；M10 ＝ 页面在脚本里发起外域请求（静态扫描看不到的那一类）⇒ 判红并点名那个外域主机，把这条判据卸掉后同一夹具转绿）另含两档**浏览器这一环**的对照：M11 ＝ 给浏览器注入「取消回环豁免 + 指向一个挂死代理」两枚旗标（造出「这台机器配了代理」的场景，不碰机器全局设置）⇒ 真门禁必须**照常判绿**（浏览器不碰代理），而**摘掉 `--no-proxy-server`** 的副本必须**判红**且红因是**浏览器层**（这一档有牙齿：不是恒绿也不是恒红）；M12 ＝ 用一个「起得来、连不上」的假浏览器 ⇒ 门禁必须判红、红因点名「浏览器层」、**不含「横向溢出」**、不是一整页未捕获异常的栈回溯，且失败后**浏览器进程已被回收**。自测本身**分三档**：绿 / 判红 / 跳过 —— 门禁**一次宽度都没量到**时只报**一条**红并说清是「浏览器层失败」还是「测量之前就判红了」，其余断言标成**跳过**而不是红（否则一次工具故障会伪装成「九条判据都坏了」） |
| `npm run check:overflow-targets-selftest` | 上面那道门禁里**触点尺寸**判据的本地夹具自测（证明它能变红：触点过小且换行处紧邻会判红；判定或收集被卸掉也会判红） |
| `npm run check:overflow-anchors-selftest` | 上面那道门禁里**滚动定位让位**判据的本地夹具自测（证明它能变红：目标被吸顶顶栏盖住会判红；判定、检测或收集被卸掉也会判红） |
| `npm run check:artifact` | 产物里的 @id / license / 版本 / 地址与 `site.js` 逐字一致 |
| `npm run check:artifact-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，在**自造的最小夹具站**上跑，证明 M1–M8 每条判据都能变红；含 **判据级负对照**（逐条卸掉 M1–M8 后对应注入必须转绿 —— 这同时证明每个可卸开关都真被消费）、**精准性负对照**（卸判据叠加另一条不连坐的注入 / 前提不在场时依赖判据整段跳过）、**故意判绿**（不带标记的链接不算 / 没注册产出物时豁免 / 真源只有 license 时不报假红）、**覆盖度自证**、**红因归属纯净性断言**） |
| `npm run check:jsonld` | JSON-LD 合法，站点实体与页面实体接得上 |
| `npm run check:jsonld-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，在**自造的最小夹具站**上跑，证明 J0–J12 每条判据都能变红；含 **判据级负对照**（逐条卸掉 J0–J12 后对应注入必须转绿 —— 这同时证明每个可卸开关都真被消费）、**精准性负对照**（profilePage 写在 eleventyComputed / 目录数据文件里也认；非论文页多一张 og:image 不误伤）、**绿档**（基线全绿 / 覆盖度自证那行在输出里 / 红因带编号前缀 / 卸开关后红因一个不剩）、**退回旧口径自检**（覆盖度自证被摘 ⇒ 整块判据被摘也全绿；红因不带编号 ⇒ 编号解析为空；开关不被消费 ⇒ 卸开关后红还在）、**红因归属纯净性断言**） |
| `npm run check:home-chart` | 首页降水图的交互层：钩子齐全、**读数与数据同源**、键盘可达、模块与样式在位 |
| `npm run check:home-chart-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，证明它能变红） |
| `npm run check:about-dataset` | about 页对同一条 Zenodo 记录的描述必须与 DataCite 登记事实一致：类型、登记标题、可见 DOI、散文措辞四处同源，散文里不许写死地址 |
| `npm run check:about-dataset-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，证明它能变红；含**故意判绿**的边界负对照） |
| `npm run check:identity` | 身份句柄（ORCID / GitHub / CSDN / ResearchGate）登记一致 |
| `npm run check:identity-handles-selftest` | 上面那道门禁的本地夹具自测（**注入矩阵**＋ **判据级负对照**，在**自造的最小夹具站**上跑，证明这道门禁的每条判据都能变红；因该门禁的判据**没有编号**，红因归属改用**判据文案片段集合**判定：每条判据登记一个**互不包含**的唯一文案片段，断言命中集合**恰为**期望集合（多一条少一条都算失败）；负对照在**门禁副本**里把该判据的守卫条件**同行替换为永假**（行数不变、逐行比对只差一行）后重跑同一注入 ⇒ 目标红因必须消失；**覆盖度自证**（判据清单静态登记，每条都须有 ≥1 档且能在门禁源码里找到）；**门禁原件逐字节未变**断言；夹具的句柄、期望集与判据范围**全部运行期派生**，源码里不写死任何真实句柄） |
| `npm run check:identity-derivation` | 身份 URL 必须**派生**出来，不许抄成字面量 |
| `npm run check:identity-derivation-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，在**自造的最小夹具站**上跑，证明 ID0–ID7 每条判据都能变红；含 **判据级负对照**（逐条卸掉 ID0–ID7 后对应注入必须转绿 —— 这同时证明每个可卸开关都真被消费）、**精准性负对照**（卸判据叠加另一条不连坐的注入 / 前提不在场时只许红那一条判据）、**故意判绿**（注释里的身份 URL 豁免 / 豁免扩展名生效 / 只查完整字面量不做 URL 形态匹配 / 临时目录上的基线）、**覆盖度自证**（比较点静态目录逐点核对 / 每条判据都有红因出口与可卸开关）、**退回旧口径自检**（覆盖度自证被摘 ⇒ 判据级负对照塌陷成绿；红因不带编号 ⇒ 编号解析为空；开关不被消费 ⇒ 卸开关后红还在）、**红因归属纯净性断言**） |
| `npm run check:citation-meta` | 论文页 `citation_*` 标签与 `site.js` 逐字一致 |
| `npm run check:citation-meta-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，证明它能变红） |
| `npm run check:citation-cff` | 仓库根 `CITATION.cff` 与 `site.js` 逐字节一致 |
| `npm run gen:citation-cff` | 按 `site.js` **重写** `CITATION.cff`（改过事实后跑这个） |
| `npm run check:citation-cff-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，证明它能变红） |
| `npm run check:live` | 线上部署核查（**不在 build 链**，部署后跑）：线上每个产物路由都要 200；**发出去的口径**逐条核对 —— canonical、og:url、**og:image**、以及 **JSON-LD 里的站内口径**（站内 ＝ 相对地址，或 origin 是本站的绝对地址；站外的 sameAs、DOI 落地页之类**不比对**）；sitemap 与本地同一份且每条可达；JSON-LD 全部可解析；feed 条目链接可达 |
| `npm run check:live-selftest` | 线上核查门禁的本地夹具自测（注入矩阵）：少一条路由、canonical 与 og:url 指向旧前缀或别的站、sitemap 指向 404、JSON-LD 坏掉、feed 没有条目、**og:image 指向旧前缀**（M7）、**JSON-LD 里的站内口径漂了**（M8）；另含两档**判据级负对照**（把 og:image 与 JSON-LD 站内口径那两段判据从**门禁副本**里卸掉 ⇒ 同一夹具必须转绿 ⇒ 证明那两条红确实是它们判出来的，不是别的判据的红） |
| `npm run check:readme` | 本 README 里可机器核对的事实（路由 / Node 下限 / 命令 / 出口）与现状一致 |
| `npm run check:readme-selftest` | 上面那道门禁的本地夹具自测（注入矩阵，证明它能变红） |

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
5. 发布：把内容推到 `origin` 的 `main` 分支 —— 部署工作流监听这个分支，推上去即部署：

   ```bash
   git push origin main
   ```

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