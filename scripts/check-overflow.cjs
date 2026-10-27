#!/usr/bin/env node
/**
 * 移动端横向溢出检测 —— 找出在窄屏上把页面撑宽的元素。
 *
 * 为什么要有这个：改进日志里 P3 那条写着「换行规则要改，但**不能盲改**，
 * 需逐页回归验证」。盲改的根源是没人知道**到底哪个元素**在撑宽——
 * 只看 `scrollWidth` 只有一个数字，改完也说不清改没改对。
 * 这个脚本把「哪个选择器越界、越界多少像素」直接列出来，
 * 改完再跑一次，两次的清单一对比就知道有没有修好、有没有弄坏别的页面。
 *
 * 只依赖 Node 内置能力 + 本机 Chrome（CDP over WebSocket），不装任何包。
 *
 * ⚠️ 为什么从「单档 390px」改成**多档宽度**（2026-10-20 修缺陷清单 D4）：
 *   此前这个门禁**只测 390px 一个宽度**。本仓的宽度媒体查询有 **6 个像素值**
 *   （360 / 640 / 760 / 768 / 820 / 1024，见 src/assets/css/ 全部 .css，含
 *   components/ 子目录），而 **768–1024 这段区间、以及 >1024 的宽屏分支，
 *   全都没有横向溢出的把关**。
 *   >1024 恰恰是**布局最复杂**的一侧：`max-width:1024px` 之外，
 *   `.split` 是双栏、`.paper-reader-wrap` 是三栏、`.paper-toc` 才显示
 *   （layout.css / paper-reader.css / components/_paper.css）——
 *   多栏布局最容易横向撑破，却从来没被量过。
 *   ⇒ 「只测 390px」不等于「窄屏没问题」，只等于**窄的那一档没问题**。
 *
 *   默认档位的取法 = **每个宽度媒体查询的「匹配」与「不匹配」两侧都被测到**：
 *     · 360 —— `max-width:360px` 的匹配侧（也是最小常见手机宽度）
 *     · 390 —— 常见手机宽度（本仓历来用的那档）；`max-width:360px` 的不匹配侧
 *     · 640 —— `max-width:640px` 的匹配侧；其不匹配侧由 768 覆盖
 *     · 768 —— `max-width:768px` 的匹配侧，也是 `min-width:760px` 的不匹配侧
 *     · 820 —— `max-width:820px` 的匹配侧
 *     · 1024 —— `max-width:1024px` 的匹配侧
 *     · 1440 —— `max-width:1024px` 的**不匹配侧**（宽屏多栏那一侧）；
 *       且 >1320px（.paper-reader-wrap 的容器上限），能覆盖"容器被封顶"的情形
 *   ⇒ `max-width:760px` 的匹配侧由 640 覆盖、不匹配侧由 768 覆盖。
 *   （这条覆盖关系由 scripts/test-overflow-widths.cjs **逐条核对**，不靠人记；
 *    以后 CSS 加了新断点，那个自测会判红，逼着这里同步。）
 *
 * ⚠️ 为什么还要量「正文列宽」（2026-10-20 修缺陷清单 D11 的**复发**风险）：
 *   横向溢出这个判据有个**结构性盲区**：页面**没被撑宽**，但正文被挤成了一条窄带，
 *   `scrollWidth` 仍然是视口宽 ⇒ 这个门禁**全绿**。
 *   缺陷清单 D11 就是这一族：论文精读页在 ≤1024px 一直是两栏，
 *   正文被塞进第一列 `minmax(200px,1fr)` —— 实测 360~1024px 下正文宽度只有
 *   200~203px（占视口 20%），右边空出 110~690px；**build 与当时全部门禁都是绿的**。
 *   ⇒ 这个门禁现在同时盯两件事：
 *       ① 有没有元素把页面撑出横向滚动（原有判据，退出码同源）；
 *       ② 每个页面的**正文列**有没有被挤窄（新增判据）。
 *     判据：≤1024px 时正文列 ≥ 视口 **85%**（D11 自己写下的验收线）；
 *           >1024px 时正文列 ≥ **480px**（绝对下限，约 30 个中文字符的可读宽度）。
 *     为什么 ≥1024px 换成绝对值：宽屏下正文列是**居中定宽**的（实测最小 704px，
 *     1920px 档只有 48%），用比例判会误报；窄屏下它是**跟着视口走**的，
 *     用比例判才抓得住「被栅格挤成固定窄列」这一族。
 *     「正文列」是哪个元素，逐页写在下表的 CONTENT_COLUMN_RULES 里；
 *     没登记的页面默认盯 `main`；**选择器没命中 = 判红**（页面结构变了就得让人知道）。
 *
 * ⚠️ 为什么还要量「触点尺寸」（2026-10-20 修缺陷清单 D23）：
 *   前两条判据盯的都是**版面**（有没有撑破、正文有没有被挤窄），
 *   都没管**能不能点得中** —— 而这一族坏版式在手机上是**看不见**的：
 *   桌面截图上那七个资源出口（Paper / DOI / PDF / Code / Capsule / Data / Figure）
 *   排得整整齐齐，窄屏下却只剩 **13px 高**的一行小字，
 *   换成手指（或触屏笔）几乎点不准。
 *   实测 375px：`.home-pub__link` 高 **13px**、宽 34~63px；
 *   换行处上下两个的 24px 圆**互相相交**（实测圆心距 **17.4px < 24px**）
 *   ⇒ WCAG 2.5.8（Target Size, Minimum, AA）的 **spacing 例外不成立**
 *   ⇒ 这是**实打实的 AA 级不通过**，不是风格偏好。
 *   判据按 WCAG 原文实现：一个目标算通过有三条路
 *     ① 渲染尺寸 ≥ **24×24** CSS px（最省事、也最稳）；
 *     ② **spacing 例外** —— 以它的包围盒为圆心画 24px 直径的圆，
 *        这个圆**不与任何其它目标的盒子相交、也不与任何其它欠尺寸目标的圆相交**；
 *     ③ **行内例外** —— 目标**在句子里**（散文里的行内链接），
 *        尺寸受同一行非目标文字的行高约束 ⇒ 豁免。
 *   ⚠️ ③ 的判据是「**行内盒** 且 **最近的块级祖先去掉所有目标之后还剩着非目标文字**」，
 *      **不是**「只要是 inline 就放过」—— 那会把「独占一行、旁边没别的字」的链接也放过去。
 *   判据编号 TS1–TS4：
 *     TS1 触点判据**自证存活**（一个目标都没量到 ⇒ 判红，防判据空跑）；
 *     TS2 测量**覆盖度自证**（每页每档都量过触点，缺一次就判红）；
 *     TS3 ① / ② / ③ 三条路的判定本身；
 *     TS4 **豁免如实报数**（被行内例外放过的目标有几个，必须在通过文案里说出来 ——
 *        默默放过就等于判据自己把范围缩掉了）。
 *
 * ⚠️ 为什么还要量「滚动定位让位」（2026-10-20 修缺陷清单 D24）：
 *   前三条判据盯的都是**版面**（撑破 / 挤窄 / 点不点得中），都没管
 *   **「跳过去了却看不见」** —— 这一族在窄屏与宽屏**都**坏，而且完全看不出来：
 *   站内所有「滚动定位」都是把目标滚到视口**顶**：跳转链接 `#main`、
 *   论文页目录条目（toc.js 的 `scrollIntoView({block:"start"})`）。
 *   顶栏 `header.topbar` 是 `position:sticky; top:0`、高 56px ⇒ 目标必须让开它，
 *   否则滚完目标被顶栏整条盖住。D24 实测（修前，6 页 × 2 档）：
 *     · 跳转链接 `#main` —— 被盖 **56px**（整整一条顶栏）；
 *     · 论文页目录 6 个标题 —— 标题行高只有 15px，被盖 **15px** = **整条标题**
 *       （"点目录后标题不被顶栏压住"这条意图写在 paper-reader.css 里很久了，
 *        但那条 `scroll-margin-top` 挂在 `.paper-body h2[id]` 上，
 *        而目录标题都在 `.paper-body` **外面**的 `<section>` 里 ⇒ **一条都没匹配上**）。
 *   量法：把目标**瞬时**滚到视口顶（`behavior:"instant"`，不等动画 ——
 *   否则读到的是滚动途中的中间位置），再看它的顶边落在吸顶顶栏底边的哪一侧。
 *   吸顶顶栏按**计算样式**找（position:sticky/fixed 且当前矩形贴着视口顶），
 *   **不写死 class 名** —— 判的是「顶上有没有东西挡着」这件事本身。
 *   判据编号 AN1–AN3：
 *     AN1 滚动定位目标**不得被吸顶顶栏遮住**（主判据）；
 *     AN2 判据**自证存活**（每页每档都要量到目标、全站至少量到一个；
 *        并且当站内确实存在「钉在文档顶的吸顶元素」时，必须至少识别到一次
 *        顶栏遮挡线 —— 少任何一条都说明这条判据在空跑，
 *        空跑的门禁等于没有门禁，所以判红）；
 *     AN3 **目录覆盖自证**（论文页量到的目录目标数必须等于该页带 id 的标题数 ——
 *        少了就说明「目录指不到的那些标题」根本没被这条判据量过）。
 *   修法只有一种：给**根滚动容器**（html）加 scroll-padding-top。
 *   不要逐个目标挂 scroll-margin-top —— 那要靠选择器逐条匹配，漏一条就白写
 *   （本仓已经因此白写过一次：那条规则挂在 .paper-body h2[id] 上，
 *   而目录标题都在 .paper-body 外面 ⇒ 一条都没匹配上）。
 *   另外注意：容器的 scroll-padding 与目标的 scroll-margin 是**相加**的，
 *   两者同时存在会让目标被推得更远。
 *
 * ⚠️ 为什么测量必须与外网无关（2026-10-22 修缺陷清单 **D74**）：
 *   此前这个门禁要等页面的 `Page.loadEventFired`，而站点的**三个 render-blocking
 *   字体样式表**（base.njk 里 fonts.googleapis.com 的 Inter / Source Serif 4 /
 *   JetBrains Mono）是**外网资源** ⇒ 外网不可达时，那几个请求会**一直挂着**，
 *   load 事件**永远不来** ⇒ 门禁必然 20s 超时判红。
 *   也就是说：**门禁的结论会随「这台机器当时能不能出网」而变** ——
 *   同一份产物，在联网的机器上是绿的，在离线的机器上是红的，
 *   而这两份结论**都说自己在量横向溢出**。
 *   实测（2026-10-22，本机外网整体不可达）：`npm run build` 的第 77 环
 *   就是这么红的，红因只有一句「等待 Page.loadEventFired 超时」——
 *   看不出是外网的问题，更看不出测量的前提是什么。
 *
 *   修法（**不动产品代码**，只动测量方式）：
 *   ① 用 CDP 的 `Network.setBlockedURLs` 在**浏览器层**把外部字体请求**确定性拦掉**
 *      ⇒ 那些请求立刻失败（不是挂住）⇒ load 事件照常来 ⇒ 测量离线可跑、结果可复现。
 *      ⚠️ 走过弯路：先试的是 Chrome 的 `--host-resolver-rules=MAP … ~NOTFOUND`，
 *        **实测在 macOS 上根本不生效** —— 直连字体域仍然是 `ERR_TIMED_OUT`
 *        （而不是 `ERR_NAME_NOT_RESOLVED`），说明规则没被采纳；
 *        改成浏览器层的 `Network.setBlockedURLs` 才拿到确定性的快速失败。
 *        （这一条要记住：**别再回到那条路上**。）
 *   ② 等待条件、判据阈值、判定逻辑**一个字都没改** —— 只是把「外网能不能出」
 *      从测量前提里**拿掉**。
 *   ③ 加**两道自证**，防止「阻断」这一步自己被卸掉：
 *      · 外部字体探针：页面内 `fetch` 一次外部字体域，**必须快速失败**。
 *        阻断生效 ⇒ 毫秒级拒绝；阻断没生效 ⇒ 要么取到内容、要么挂住，
 *        两种都判红（实测两者的区别是 0ms 与 5s 超时，判别力足够）。
 *      · 密闭性：测量期间**除本机产物服务外**，任何请求拿到响应都判红 ——
 *        测量结果不该依赖产物之外的任何东西。
 *   ⚠️ **诚实边界**：阻断之后页面用的是**系统回退字体**，不是 webfont。
 *      本门禁量的是**盒子宽度**（正文列宽、触点尺寸、遮挡面积、横向滚动），
 *      这些量的是布局盒，**不随字宽改变**；只有「断词导致的横向溢出」这一类
 *      可能因字体不同而有细微差别 —— 这一点在文末的通过文案里如实写出来。
 *
 * ⚠️ 为什么阻断清单要**从产物自身推导**（2026-10-23 修缺陷清单 **D75**）：
 *   D74 把「外部字体请求在浏览器层被拦掉」做成了**手写的两域清单**。
 *   那是**靠人记得维护**的清单：站点将来新增任何外域子资源
 *   （哪怕它已经被 scripts/check-third-party.cjs 合法白名单放行），
 *   那个域都不在阻断清单里 ⇒ 页面又要等它 ⇒ 测量重新依赖外网
 *   ⇒ **D74 的症状原样复发**（load 事件不来、红因指错方向），
 *   而**没有任何一道门禁会说一个字**。
 *   修法：阻断清单 = 手写底线（探针要用的字体域，**不能删**）
 *        ∪ **从产物自身推导**的外域主机（扫产物的 HTML 资源标签与 CSS 的 url()/@import）。
 *   「新增外域子资源」于是**不需要人去记得更新清单**：产物里多一个外域引用，
 *   阻断清单就多一个域 ⇒ 测量永远与外网解耦。
 *   并加一道**覆盖度自证**：产物里引用的每个外域主机都必须在实际交给 CDP 的
 *   阻断清单里 —— 推导一旦被摘掉或算漏，这道自证当场红（见自测的 M9 负对照）。
 *
 * ⚠️ 为什么浏览器必须与本机代理配置解耦（2026-10-27 修缺陷清单 **D109**）：
 *   D74 把「外网资源」从测量前提里拿掉了，但**漏了另一条通往网络的路**：
 *   浏览器自己也会用**这台机器的代理配置**（macOS 上是系统代理设置，
 *   `scutil --proxy` 说了算；Linux/CI 上还有环境变量那一套）。
 *   而门禁要访问的正是**本机临时服务器**（`http://127.0.0.1:<随机端口>`）——
 *   只要代理配置**没有把回环地址豁免掉**，这个本机请求也会被交给代理：
 *     代理不可达或卡住 ⇒ 页面永远加载不完 ⇒ `Page.loadEventFired` 永不触发
 *     ⇒ 门禁 20 秒后以「等待超时」收场。
 *   ⇒ **门禁的结论会随「这台机器此刻的代理配置」漂移**：
 *     同一份产物，配了代理的机器上红、没配的机器上绿，
 *     而两份结论都声称自己在量页面的排版。
 *   ⚠️ 实测证据（本机，2026-10-27，别再改回去）：
 *     · Chrome 在 macOS 上**不读** `http_proxy` / `all_proxy` 环境变量
 *       （实测：非回环地址 + 指向死端口的 `all_proxy`，页面照样加载）
 *       ⇒ 真正的代理源是**系统代理设置**，不是环境变量。
 *       （上一轮把这条归因成「环境变量」，是错的，已订正。）
 *     · `--proxy-bypass-list=<-loopback>` + `--proxy-server=http://127.0.0.1:<挂死端口>`
 *       ⇒ 回环请求被代理接管 ⇒ Chrome 挂住（实测 15 秒被外部闹钟杀掉）。
 *     · 同样的旗标再加 `--no-proxy-server` ⇒ 直连成功，页面照常加载。
 *       ⇒ **`--no-proxy-server` 的优先级压得住 `--proxy-server`**，
 *         这就是修法（BR1）的依据。
 *
 *   本轮新增的四条判据：
 *   BR1 **浏览器不碰代理** —— Chrome 必须带 `--no-proxy-server`：
 *        测量**不需要网络**（外域全在浏览器层被拦掉，页面来自本机），
 *        所以「这台机器配了什么代理」与测量**没有任何关系**，
 *        门禁必须自己把这条关系掐断，而不是指望系统配置恰好豁免了回环。
 *   BR2 **等浏览器处处有上限** —— 每一处等待（CDP 调用、load 事件、
 *        WebSocket 握手）都有上限，不许无限挂住：挂住等于卡死整条 build 链。
 *   BR3 **浏览器层失败有专属红因** —— 浏览器层坏了（起不来 / 连不上 /
 *        页面加载失败 / 等不到回音），红因必须**点名「浏览器层」**，
 *        并明确说明「本次一次测量都没做成」；
 *        **不许**与「页面真的越界」的红因混说（那会让读报告的人查错方向）。
 *   BR4 **失败路径回收浏览器** —— 门禁退出时，浏览器进程与临时目录
 *        **必须**被回收。此前超时路径直接抛出去 ⇒ 浏览器进程留在机器上
 *        （本机实测堆积了 245 个 `/var/folders/.../mh-cdp-*` 的 Chrome，
 *        机器越跑越慢，而机器越慢越容易超时 —— 越滚越糟）。
 *
 * 用法：
 *   node scripts/check-overflow.cjs                # 全部默认档位
 *   node scripts/check-overflow.cjs --width 320    # 只测某一档（调试用）
 *   node scripts/check-overflow.cjs --widths 390,768   # 只测指定的几档
 *   node scripts/check-overflow.cjs --timeout 8000 # 每次等浏览器的上限（毫秒）
 *
 * 环境变量：
 *   SITE_DIR —— 覆盖产物目录（故障注入用；与 scripts/check-jsonld.cjs 同一约定）。
 */
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");
const os = require("os");

const SITE = process.env.SITE_DIR
  ? path.resolve(process.env.SITE_DIR)
  : path.resolve(__dirname, "../_site");

/* ---------- 外部字体：测量与外网无关（2026-10-22 修缺陷清单 D74） ----------
 *
 * 这些是站点唯一的外域子资源（scripts/check-third-party.cjs 守着这条口径）。
 * 测量时把它们**在浏览器层拦掉**，测量结果就不再依赖「这台机器能不能出网」。
 */
const EXTERNAL_FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];
/** 探针打的那个域（必须是上面被拦的域之一，否则探针证明不了任何事）。 */
const FONT_PROBE_HOST = EXTERNAL_FONT_HOSTS[0];
/** 探针自己的等待上限：挂住这么久就判定「没被阻断」。 */
const FONT_PROBE_TIMEOUT_MS = 6000;
/** 「快速失败」的门槛：被阻断的请求应当是毫秒级失败。 */
const FONT_PROBE_FAST_FAIL_MS = 1500;
/** 探针在页面里跑的脚本：结果只有三种 —— 取到内容 / 快速失败 / 挂住。 */
const FONT_PROBE_SCRIPT = `(async () => {
  const t0 = Date.now();
  const outcome = await Promise.race([
    fetch('https://${FONT_PROBE_HOST}/__overflow_gate_probe.css', { mode: 'no-cors', cache: 'no-store' })
      .then(() => ({ kind: 'resolved' }))
      .catch(() => ({ kind: 'rejected' })),
    new Promise((r) => setTimeout(() => r({ kind: 'hung' }), ${FONT_PROBE_TIMEOUT_MS})),
  ]);
  return { kind: outcome.kind, ms: Date.now() - t0 };
})()`;

/* ---------- 外域主机识别：阻断清单从产物自身推导（2026-10-23 修缺陷清单 D75） ----------
 *
 * D74 把「外部字体请求在浏览器层被拦掉」做成了**手写的两域清单**。
 * 那是**靠人记得维护**的清单：站点将来新增任何外域子资源
 * （哪怕它已经被 scripts/check-third-party.cjs 合法白名单放行），
 * 那个域都不在阻断清单里 ⇒ 页面又要等它 ⇒ 测量重新依赖外网
 * ⇒ **D74 的症状原样复发**（load 事件不来、红因指错方向），
 * 而没有任何一道门禁会说一个字。
 *
 * 修法：阻断清单 = 手写**底线** ∪ **从产物自身推导**的外域主机。
 * 「新增外域子资源」于是**不需要人去记得更新清单**：
 * 产物里多一个外域引用，阻断清单就多一个域 ⇒ 测量永远与外网解耦。
 */

/** 本机主机名（这些不算外域 —— 相对路径解析出来也落在这一档）。 */
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/**
 * <link rel> 里哪些值表示「浏览器会去取这个资源」。
 * canonical / alternate / prev / next / author / license 这类是**指针**，
 * 浏览器不会去取它们 ⇒ 不算（否则会把站点自己的域名也算成外域）。
 */
const FETCHABLE_LINK_RELS = new Set([
  "stylesheet", "preload", "prefetch", "modulepreload", "prerender",
  "preconnect", "dns-prefetch", "icon", "manifest", "apple-touch-icon", "mask-icon",
]);

/** 每个资源标签用哪些属性去取资源（其余属性一律不看）。 */
const RESOURCE_ATTRS = {
  link: ["href"],
  script: ["src"],
  img: ["src", "srcset"],
  source: ["src", "srcset"],
  iframe: ["src"],
  video: ["src", "poster"],
  audio: ["src"],
  track: ["src"],
  embed: ["src"],
  object: ["data"],
  input: ["src"],
};

/**
 * 这个 URL 的主机名；不是「浏览器会去取的绝对外网 URL」就返回 null。
 *
 * · 相对路径按本机产物服务解析 ⇒ 主机名是 127.0.0.1 ⇒ 不算外域；
 * · data: / blob: / mailto: / javascript: 没有主机名 ⇒ 不算；
 * · 协议相对（//host/x）解析出来是外域 ⇒ 算。
 */
function hostOfUrl(raw) {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s || s.startsWith("#")) return null;
  let u;
  try {
    u = new URL(s, "http://127.0.0.1/");
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase();
  if (!host || LOCAL_HOSTS.has(host)) return null;
  return host;
}

/** srcset 的值里有哪些 URL（逗号分隔，每段取第一个词）。 */
function srcsetUrls(value) {
  return String(value)
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean);
}

/** 从一段 CSS 里推导它引用的外域主机（@import 与 url()）。 */
function hostsInCss(css) {
  const hosts = new Set();
  const text = String(css).replace(/<!--[\s\S]*?-->/g, "");
  const patterns = [
    /@import\s+(?:url\(\s*)?(?:"([^"]*)"|'([^']*)'|([^)\s;]+))/gi,
    /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) {
      const raw = (m[1] ?? m[2] ?? m[3] ?? "").trim();
      const host = hostOfUrl(raw);
      if (host) hosts.add(host);
    }
  }
  return hosts;
}

/** 解析一个标签的属性表（属性名小写）。 */
function parseAttrs(attrText) {
  const attrs = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let m;
  while ((m = re.exec(attrText)) !== null) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return attrs;
}

/**
 * **主扫描**：从一个 HTML 文件里推导它引用的外域主机。
 * 口径 = 「浏览器会去取回的东西」：资源标签的资源属性 ＋ CSS 的 @import / url()。
 * <a href> 导航链接、<link rel=canonical> 这类指针**不算**。
 */
function hostsInHtml(html) {
  const hosts = new Set();
  const clean = String(html)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi, "$1$2");
  const tagRe = /<([a-zA-Z][a-zA-Z0-9:-]*)((?:\s[^>]*?)?)(\/?)>/g;
  let m;
  while ((m = tagRe.exec(clean)) !== null) {
    const name = m[1].toLowerCase();
    const attrNames = RESOURCE_ATTRS[name];
    if (!attrNames) continue;
    const attrs = parseAttrs(m[2] || "");
    if (name === "link") {
      const rels = String(attrs.rel || "").toLowerCase().split(/\s+/).filter(Boolean);
      if (!rels.some((r) => FETCHABLE_LINK_RELS.has(r))) continue;
    }
    for (const attrName of attrNames) {
      const value = attrs[attrName];
      if (value === undefined) continue;
      const candidates = attrName === "srcset" ? srcsetUrls(value) : [value];
      for (const c of candidates) {
        const host = hostOfUrl(c);
        if (host) hosts.add(host);
      }
    }
  }
  /* 内联 <style> 里的 CSS 也会被浏览器去取。 */
  for (const s of clean.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    for (const host of hostsInCss(s[1])) hosts.add(host);
  }
  return hosts;
}

/**
 * **独立扫描**：覆盖度自证的**基准**。
 *
 * 为什么要有第二套：覆盖度自证如果只用同一套扫描，它就是**镜子不是守卫** ——
 * 扫描漏掉的东西，两边会一起漏 ⇒ 自证照样绿。
 * 这里用**不同的算法**再算一遍：把文档切成「标签块 / 文本」两类，
 * 只在标签块里按**属性名**取 URL（不解析属性表）；
 * 文本块一律不看（正文、JSON-LD 里的地址浏览器不会当资源去取）。
 * ⚠️ 两套口径必须一致（同一批「浏览器会去取」的位置），否则会误红。
 */
function hostsInHtmlByTags(html) {
  const hosts = new Set();
  const clean = String(html).replace(/<!--[\s\S]*?-->/g, "");
  const tokens = clean.match(/<[^>]*>|[^<]+/g) || [];
  let inStyle = false;
  for (const tok of tokens) {
    if (!tok.startsWith("<")) {
      if (inStyle) for (const host of hostsInCss(tok)) hosts.add(host);
      continue;
    }
    const nameM = /^<\/?\s*([a-zA-Z][a-zA-Z0-9:-]*)/.exec(tok);
    const name = nameM ? nameM[1].toLowerCase() : "";
    if (name === "style") {
      inStyle = !/^<\//.test(tok);
      continue;
    }
    const attrNames = RESOURCE_ATTRS[name];
    if (!attrNames) continue;
    if (name === "link") {
      const relM = /\brel\s*=\s*["']?([^"'\s>]*)/i.exec(tok);
      const rels = relM ? relM[1].toLowerCase().split(/\s+/) : [];
      if (!rels.some((r) => FETCHABLE_LINK_RELS.has(r))) continue;
    }
    for (const attrName of attrNames) {
      const re = new RegExp(`\\b${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`, "gi");
      let m;
      while ((m = re.exec(tok)) !== null) {
        const raw = (m[1] ?? m[2] ?? m[3] ?? "").trim();
        const candidates = attrName === "srcset" ? srcsetUrls(raw) : [raw];
        for (const c of candidates) {
          const host = hostOfUrl(c);
          if (host) hosts.add(host);
        }
      }
    }
  }
  return hosts;
}

/** 读一个产物文件；读不到就当它不存在（不猜、不报错）。 */
function readProductFile(dir, rel) {
  try {
    return fs.readFileSync(path.join(dir, rel), "utf8");
  } catch {
    return null;
  }
}

/** 从产物里推导「浏览器会去取回」的外域主机（主扫描）。 */
function deriveExternalHosts(dir, files) {
  const hosts = new Set();
  for (const rel of files) {
    const text = readProductFile(dir, rel);
    if (text === null) continue;
    const found = rel.endsWith(".css") ? hostsInCss(text) : hostsInHtml(text);
    for (const host of found) hosts.add(host);
  }
  return hosts;
}

/** 独立扫描（覆盖度自证的基准）。 */
function auditExternalHosts(dir, files) {
  const hosts = new Set();
  for (const rel of files) {
    const text = readProductFile(dir, rel);
    if (text === null) continue;
    const found = rel.endsWith(".css") ? hostsInCss(text) : hostsInHtmlByTags(text);
    for (const host of found) hosts.add(host);
  }
  return hosts;
}

/* ---------- 找 Chrome ----------
 *
 * 此前这里把路径写死成 macOS 的 app bundle 路径
 * （/Applications/Google Chrome.app/...），于是这个脚本在 CI 上
 * **根本跑不起来** —— 它在 Linux 上找不到那个路径。
 * 这也是 scripts/check-gates-wired.cjs 里那条豁免的真实成因，
 * 但那条豁免**写的理由是错的**（见该文件 EXEMPT 处的订正）：
 * GitHub 的 ubuntu runner 镜像**自带 google-chrome**
 * （runner-images 的 Ubuntu 24.04 / 26.04 镜像 README 里
 *  "Browsers and Drivers" 一节明确列着 Google Chrome 与 ChromeDriver），
 * 所以真正缺的不是 Chrome，而是**找 Chrome 的方式只认 macOS**。
 *
 * 现在按三级查找，优先级从高到低：
 *   ① CHROME_PATH 环境变量（显式指定；显式指定却找不到 → 直接报错，
 *      不退回自动查找——显式指定的意图就是"我说的那个"）；
 *   ② PATH 里的 google-chrome / google-chrome-stable / chromium /
 *      chromium-browser（CI 上命中的是这一级）；
 *   ③ 各平台常见安装位置（macOS 的 app bundle、Linux 的 /usr/bin 等）。
 *
 * ⚠️ 找不到 Chrome 时**直接失败，不静默跳过**：
 * 量不了窄屏溢出却不报错，等于给这个门禁发了一张"已通过"的假证书——
 * 那正是本仓库反复在修的那一族缺陷（"看起来在、其实不生效"）。 */
const CHROME_ENV_VAR = "CHROME_PATH";
const CHROME_NAMES = [
  "google-chrome",
  "google-chrome-stable",
  "chromium",
  "chromium-browser",
];
const CHROME_PATHS = [
  // macOS
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  // Linux
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/opt/google/chrome/chrome",
  "/snap/bin/chromium",
];

function findChrome() {
  const explicit = process.env[CHROME_ENV_VAR];
  if (explicit) {
    // ⚠️ 返回形状必须与下面两条一致（{ bin, reason }）：
    //   早先这里直接 `return explicit`（一个字符串），于是主流程里的
    //   `found.bin` 是 undefined → 走「找不到浏览器」分支 →
    //   **显式指定的 CHROME_PATH 永远不生效**（而且是静默不生效）。
    if (fs.existsSync(explicit)) return { bin: explicit, reason: null };
    return {
      bin: null,
      reason:
        `${CHROME_ENV_VAR} 指向的浏览器不存在：${explicit}\n` +
        `  （显式指定时不退回自动查找——你指的就是这一个。）`,
    };
  }

  // ② PATH
  const dirs = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  for (const name of CHROME_NAMES) {
    for (const dir of dirs) {
      const p = path.join(dir, name);
      try {
        fs.accessSync(p, fs.constants.X_OK);
        return { bin: p, reason: null };
      } catch {
        /* 换下一个 */
      }
    }
  }

  // ③ 常见安装位置
  for (const p of CHROME_PATHS) {
    if (fs.existsSync(p)) return { bin: p, reason: null };
  }
  return { bin: null, reason: null };
}

/** 默认档位 —— 取法与理由见文件头。 */
const DEFAULT_WIDTHS = [360, 390, 640, 768, 820, 1024, 1440];

/* ---------- 正文列（窄带检测）的判据与规则表 ---------- */

/** ≤1024px：正文列至少要占视口的这个比例（D11 自己写下的验收线）。 */
const CONTENT_MIN_RATIO = 0.85;
/** >1024px：正文列的绝对下限（px）—— 宽屏正文是居中定宽的，只能这么判。 */
const CONTENT_MIN_PX_WIDE = 480;
/** 比例判据适用的宽度上限（与站点的 1024px 断点一致）。 */
const CONTENT_RATIO_MAX_WIDTH = 1024;

/**
 * 每页的「正文列」= 承载正文的那个元素。
 *
 * 为什么逐页写死而不是自动推断（这轮踩过的坑）：
 *   试过「拿正文里最长的那段文字所在的元素」这种通用推断，结果**误报**——
 *   首页英雄区在 768px 是**分栏**设计（实测一段正文只有 336px = 44%），
 *   关于页的 bio 同样在分栏里（483px = 63%）；这些是**有意为之**，不是排版坏掉。
 *   反过来，「正文列被挤窄」这一族（D11）在通用推断下**又抓得住**，
 *   两头不兼容 ⇒ 只能把「这一页的正文列是哪个元素」显式写出来。
 *
 * 匹配规则：先找**完全相等**的，再找带通配符的前缀规则（`/papers/` + 通配 + `/`
 * 匹配 `/papers/<slug>/`）。`/papers/`（列表页）与 `/papers/<slug>/`（精读页）
 * 是两个不同的正文列，所以顺序上完全相等优先。
 *
 * 没登记的路由 ⇒ 默认盯 `main`（主容器不该被挤窄）。
 * ⚠️ 选择器**没命中**一律判红：页面结构变了却悄悄跳过 = 假绿。
 */
const CONTENT_COLUMN_RULES = [
  { match: "/", selector: ".home-hero", note: "首页英雄区（标题+导语+降水图）；它在 ≤1024px 是单栏，实测占视口 91~92%" },
  { match: "/papers/*/", selector: ".paper-body", note: "论文精读页的正文列（D11 坏掉的就是这一列）" },
  { match: "/papers/", selector: "article", note: "论文列表装在 article 容器里" },
  { match: "/blog/", selector: "article", note: "博客列表装在 article 容器里（列表卡）" },
  { match: "/about/", selector: "article", note: "关于页正文在 article 里（英雄区是分栏，不算正文列）" },
  { match: "/404.html", selector: "main", note: "短页，盯主容器" },
];

/** 取某个路由的正文列规则。 */
function contentColumnRule(route) {
  for (const r of CONTENT_COLUMN_RULES) {
    if (!r.match.includes("*") && r.match === route) return r;
  }
  for (const r of CONTENT_COLUMN_RULES) {
    if (!r.match.includes("*")) continue;
    const star = r.match.indexOf("*");
    const prefix = r.match.slice(0, star);
    const suffix = r.match.slice(star + 1);
    if (route.length > prefix.length && route.startsWith(prefix) && route.endsWith(suffix)) {
      return r;
    }
  }
  return { match: "(默认)", selector: "main", note: "未登记的路由，盯主容器" };
}

/* ---------- 触点尺寸（WCAG 2.5.8 Target Size, Minimum）---------- */

/**
 * 触点最小尺寸（CSS px）—— WCAG 2.5.8 的下限。
 * 判据实现照 WCAG 原文：一个目标只要满足「≥24×24」或「spacing 例外成立」
 * 或「行内例外」三者之一，就算通过（详见文件头）。
 */
const TARGET_MIN = 24;

/**
 * 判定一个目标算不算「在句子里」（行内例外）。
 * 判据两条同时成立才算：
 *   ① 自身是**行内盒**（computed display === 'inline'）——
 *      行内盒的尺寸受同一行非目标文字的行高约束，这正是 WCAG 说的
 *      「its size is otherwise constrained by the line-height of non-target text」；
 *   ② **父元素里还有别的文字** —— 只有自己一段文字的链接不算「在句子里」，
 *      它的大小没受任何非目标文字约束 ⇒ 行内例外不成立，要走 ① / ② 两条路。
 */
function isInSentence(t) {
  return t.display === "inline" && t.inSentence;
}

/** 以目标包围盒为圆心、半径 TARGET_MIN/2 的圆。 */
function targetCircle(t) {
  return { cx: t.x + t.w / 2, cy: t.y + t.h / 2, r: TARGET_MIN / 2 };
}

/** 两个圆是否相交（相切不算相交 —— WCAG 说的是 "does not intersect"）。 */
function circlesHit(a, b) {
  return Math.hypot(a.cx - b.cx, a.cy - b.cy) < a.r + b.r;
}

/** 圆与矩形是否相交（相切不算相交）。 */
function circleHitsRect(c, r) {
  const nx = Math.max(r.x, Math.min(c.cx, r.x + r.w));
  const ny = Math.max(r.y, Math.min(c.cy, r.y + r.h));
  return Math.hypot(nx - c.cx, ny - c.cy) < c.r;
}

/**
 * 按 WCAG 2.5.8 判定一批目标。
 * 返回 { violations, exemptInline, undersized }：
 *   violations —— 没过三条路的（每个附上「撞上了谁」）
 *   exemptInline —— 走行内例外的（数量要在通过文案里报出来，TS4）
 *   undersized —— 渲染尺寸不足 24×24 的（不论过没过，都报出来供人看）
 */
function evaluateTargets(targets) {
  const violations = [];
  let exemptInline = 0;
  let undersized = 0;
  for (const t of targets) {
    const small = t.w < TARGET_MIN || t.h < TARGET_MIN;
    if (small) undersized++;
    if (isInSentence(t)) {
      exemptInline++;
      continue;
    }
    if (t.w >= TARGET_MIN && t.h >= TARGET_MIN) continue;
    // spacing 例外：24px 圆不许碰到任何别的目标，也不许碰到别的欠尺寸目标的圆
    const c = targetCircle(t);
    let hit = null;
    for (const o of targets) {
      if (o === t) continue;
      if (circleHitsRect(c, o)) {
        hit = { other: o, why: "圆与它的盒子相交" };
        break;
      }
      if ((o.w < TARGET_MIN || o.h < TARGET_MIN) && circlesHit(c, targetCircle(o))) {
        hit = { other: o, why: "圆与它的 24px 圆相交" };
        break;
      }
    }
    if (hit) violations.push({ target: t, ...hit });
  }
  return { violations, exemptInline, undersized };
}

/**
 * 解析命令行里的宽度档位。
 *   --width N        只测某一档（可重复；保留旧写法，别的地方还在用）
 *   --widths a,b,c   只测指定的几档
 * 一个都不给 ⇒ 用 DEFAULT_WIDTHS。
 * ⚠️ 解析失败**直接判红退出**：把一个拼错的宽度当成"没传"而悄悄退回默认档位，
 *   等于给门禁发一张"我测过了"的假证书。
 */
function parseWidths(argv) {
  const list = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--width") {
      const raw = argv[i + 1];
      const v = Number(raw);
      if (raw === undefined || !Number.isFinite(v) || v <= 0) {
        throw new Error(`--width 需要一个正整数，收到：${raw === undefined ? "(缺值)" : raw}`);
      }
      list.push(v);
      i++;
    } else if (argv[i] === "--widths") {
      const raw = argv[i + 1];
      if (raw === undefined) throw new Error("--widths 后面要跟一串宽度，比如 --widths 390,768");
      for (const part of String(raw).split(",")) {
        const t = part.trim();
        if (!t) continue;
        const v = Number(t);
        if (!Number.isFinite(v) || v <= 0) throw new Error(`--widths 里有一个不是正整数：${t}`);
        list.push(v);
      }
      i++;
    }
  }
  return list.length ? [...new Set(list)] : DEFAULT_WIDTHS.slice();
}

let WIDTHS;
/**
 * 每次等浏览器的上限（毫秒）—— D109 的 BR2。
 *
 * 为什么要有这个参数：等待必须有上限（挂住 = 卡死整条 build 链），
 * 但上限本身不该写死：自测要跑「浏览器层失败」那一档，
 * 每次都等满默认的 20 秒会让自测慢得没法用 ⇒ 留一个可调的旋钮。
 */
const DEFAULT_WAIT_MS = 20000;
let WAIT_MS = DEFAULT_WAIT_MS;

/**
 * 解析 `--timeout <ms>`。
 * ⚠️ 解析失败**直接判红退出**：与宽度参数同一口径 ——
 *   把一个拼错的超时当成「没传」而悄悄用默认值，等于换了个没告诉人的默认值。
 */
function parseWaitMs(argv) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--timeout") {
      const raw = argv[i + 1];
      const v = Number(raw);
      if (raw === undefined || !Number.isFinite(v) || v <= 0) {
        throw new Error(`--timeout 需要一个正整数（毫秒），收到：${raw === undefined ? "(缺值)" : raw}`);
      }
      return v;
    }
  }
  return DEFAULT_WAIT_MS;
}

/**
 * 浏览器层失败 —— 与「页面判据判红」是**两回事**（D109 的 BR3）。
 *
 * 为什么要单开一个类型：门禁跑绿跑红的理由必须能一眼分开。
 *   · 页面判红 = 页面**确实**有问题（排版越界、触点过小……）⇒ 改产品。
 *   · 浏览器层失败 = **测量根本没做成** ⇒ 改门禁或改环境，别去改产品。
 * 此前两者混在同一条「检查失败：等待 … 超时」里，读报告的人只能去猜。
 */
class BrowserLayerError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = "BrowserLayerError";
    this.detail = detail || null;
  }
}

try {
  WIDTHS = parseWidths(process.argv.slice(2));
  WAIT_MS = parseWaitMs(process.argv.slice(2));
} catch (e) {
  console.error("✗ " + e.message);
  console.error("  用法：node scripts/check-overflow.cjs [--width N | --widths a,b,c] [--timeout 毫秒]");
  process.exit(1);
}

/* ---------- 1. 起一个临时静态服务器（只服务 _site/） ---------- */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".txt": "text/plain; charset=utf-8",
  ".bib": "text/plain; charset=utf-8",
};
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p.endsWith("/")) p += "index.html";
      const file = path.join(SITE, p);
      if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404).end("not found");
        return;
      }
      res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

/* ---------- 2. 起 Chrome 并连上 CDP ---------- */
/**
 * 已经在跑的浏览器与它的临时目录（模块级）。
 *
 * 为什么要在模块级记一份：D109 的 BR4 —— 此前失败路径是**直接抛出去**的，
 * 于是 `chrome.proc.kill()` 与临时目录清理那几行**根本没跑到**，
 * 浏览器进程留在机器上（实测堆积了 245 个）⇒ 机器越跑越慢，
 * 而机器越慢越容易触发等待超时 ⇒ 越滚越糟。
 * 记在这里，异常路径就能把它们收回来。
 */
let liveChrome = null;   // { proc, dir }
let liveServer = null;   // http.Server

/**
 * 回收浏览器与临时服务器（可重复调用；失败路径与正常路径都走它）。
 *
 * ⚠️ 为什么必须**升级到 SIGKILL**（实测）：只发 SIGTERM 时，
 *   **卡在启动阶段的 Chrome 扛着 SIGTERM 不退**（实测：代理把它的启动拖住时，
 *   那个进程能一直活着）⇒ 于是浏览器留在机器上（实测机器上堆到 **56 个**、
 *   负载冲到 **44**）⇒ 机器越忙越容易超时 ⇒ 越滚越糟。
 * ⇒ SIGTERM → 等 2 秒 → 还活着就 SIGKILL → 再等 → 然后才删临时目录
 *   （目录删不掉是因为 Chrome 还在写盘）。
 *
 * @returns {Promise<void>}
 */
async function releaseBrowser() {
  if (liveChrome) {
    const { proc, dir } = liveChrome;
    liveChrome = null;
    try {
      proc.kill("SIGTERM");
    } catch {
      /* 已经退了，kill 报错不影响判定 */
    }
    const exited = await new Promise((resolve) => {
      let settled = false;
      const done = (v) => {
        if (!settled) {
          settled = true;
          resolve(v);
        }
      };
      proc.once("exit", () => done(true));
      setTimeout(() => done(false), 2000);
    });
    if (!exited) {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* 已经退了 */
      }
      await new Promise((r) => {
        proc.once("exit", r);
        setTimeout(r, 2000);
      });
    }
    /* 删目录：Chrome 可能还在收尾写盘 ⇒ 最多试三次。 */
    for (let i = 0; i < 3; i++) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  }
  if (liveServer) {
    try {
      liveServer.close();
    } catch {
      /* 关不掉不影响判定 */
    }
    liveServer = null;
  }
}

async function startChrome(chromeBin) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mh-cdp-"));
  /* CI（Linux）上要额外两枚旗标：容器的沙箱常常起不来，
     /dev/shm 常常只有 64MB 而 Chrome 拿它当共享内存会崩。
     两条都只在 Linux 上加——macOS 本机不需要，也不该降级本机的沙箱。 */
  const linuxOnly = process.platform === "linux"
    ? ["--no-sandbox", "--disable-dev-shm-usage"]
    : [];
  let proc;
  try {
    proc = spawn(
      chromeBin,
      [
        "--headless=new",
        /* ⚠️ BR1（D109）：**不许碰任何代理**。
           测量不需要网络（外域在浏览器层被拦掉，页面来自本机临时服务），
           而这台机器的代理配置会把「访问本机临时服务」这件事也交给代理 ——
           实测（`--proxy-bypass-list=<-loopback>` + 挂死代理）会让 Chrome 挂住，
           页面永远加载不完 ⇒ 门禁以「等待超时」收场。
           这枚旗标的优先级压得住 `--proxy-server`（实测），
           所以测量从此与「这台机器此刻配了什么代理」无关。 */
        "--no-proxy-server",
        "--remote-debugging-port=0",
        `--user-data-dir=${dir}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-gpu",
        "--hide-scrollbars",
        "--disable-extensions",
        ...linuxOnly,
      ],
      { stdio: "ignore" }
    );
  } catch (e) {
    /* ⚠️ BR3：浏览器**起不来**也是浏览器层失败。
       此前这里是未捕获异常 ⇒ 直接抛一整页栈回溯，读报告的人看不出
       「这是测量环境坏了」还是「页面有问题」。 */
    throw new BrowserLayerError(
      `浏览器起不来：${e.message}`,
      `浏览器：${chromeBin}`
    );
  }
  /* 登记起来：失败路径要能把它收回去（BR4）。 */
  liveChrome = { proc, dir };

  // Chrome 把实际端口写在 user-data-dir/DevToolsActivePort
  const portFile = path.join(dir, "DevToolsActivePort");
  let port = null;
  /* BR2：等待有上限 —— 但**取端口是「浏览器启动」**，不是「测量」，
     两者的时间尺度不同：Chrome 冷启动（尤其机器正忙时）可能要十几秒。
     ⇒ 这里取「WAIT_MS 与 20s 里的较大者」，不跟着测量等待一起收窄
       （实测：收窄到 8–10s 时，机器稍忙就会偶发「没拿到调试端口」——
         那不是浏览器坏了，是给它的时间不够）。
     ⚠️ 上限仍然是**有**的（BR2 的本意就是「不许无限挂住」）。 */
  const tries = Math.max(200, Math.ceil(WAIT_MS / 100));
  const portWaitMs = tries * 100;
  for (let i = 0; i < tries; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (fs.existsSync(portFile)) {
      const t = fs.readFileSync(portFile, "utf8").split("\n");
      if (t[0] && t[0].trim()) {
        port = Number(t[0].trim());
        break;
      }
    }
  }
  if (!port) {
    throw new BrowserLayerError(
      `Chrome 启动超时：${portWaitMs}ms 内没拿到调试端口`,
      `浏览器：${chromeBin}`
    );
  }
  return { proc, port, dir };
}

/* ---------- 3. 极简 CDP 客户端 ---------- */
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = [];
    /* 通用事件钩子：门禁自己要观测的域事件（Network.*）走这里，
       不与 once() 的「等某个方法」机制混在一起。 */
    this.onAny = null;
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) {
        if (this.onAny) this.onAny(msg);
        this.listeners.forEach((fn) => fn(msg));
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      /* ⚠️ BR2（D109）：**每一处等待都有上限**。
         此前 `send()` 没有任何超时 ⇒ 浏览器接了连接但不回话时，
         门禁会**永远**挂在那里（不是慢，是挂住）⇒ 整条 build 链卡死。 */
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new BrowserLayerError(
            `等浏览器回话超时：${WAIT_MS}ms 内没等到 ${method} 的应答`,
            `浏览器接了连接但没回话（这台机器资源吃紧、或这台机器的代理/网络把它卡住时最常见）`
          )
        );
      }, WAIT_MS);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  once(method, timeoutMs = WAIT_MS) {
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new BrowserLayerError(
              `等待 ${method} 超时：${timeoutMs}ms 内浏览器没有回音`,
              `浏览器连上了但没把页面加载完（页面加载失败、或这台机器的网络/代理把它卡住了）`
            )
          ),
        timeoutMs
      );
      const fn = (msg) => {
        if (msg.method === method) {
          clearTimeout(timer);
          this.listeners = this.listeners.filter((x) => x !== fn);
          resolve(msg.params);
        }
      };
      this.listeners.push(fn);
    });
    /* ⚠️ D109：**这一条等待可能被「放弃」**。
       典型场景：等 load 事件的承诺先建好，随后另一个等待先超时并抛出 ⇒
       调用方已经不再 `await` 这条承诺 ⇒ 它稍后自己 reject 时就成了
       **未处理的拒绝** ⇒ Node 直接以「未捕获异常」结束进程，
       把本该是「浏览器层失败」的红因变成一整页栈回溯。
       ⇒ 这里给它挂一个**空处理器**：承诺本身仍然会 reject
       （`await` 它的人照样拿到那个异常），但 Node 不再认为它「没人管」。
       （这不是吞异常 —— 异常照样传给真正 await 它的那一处。） */
    promise.catch(() => {});
    return promise;
  }
}

/* ---------- 4. 页面里的测量脚本 ----------
 *
 * 传进来一个正文列选择器，一并量它的宽度（窄带检测用）。
 * 选择器**量不到**时 found=false —— 门禁据此判红，不当作「没事」。
 */
const measureScript = (contentSelector) => `(() => {
  const CONTENT_SELECTOR = ${JSON.stringify(contentSelector)};
  const vw = document.documentElement.clientWidth;
  const sel = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    if (el.className && typeof el.className === 'string') {
      s += '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.');
    }
    return s;
  };
  // 祖先里只要有一层是横向可滚容器，这个元素越界就是**有意为之**
  // （比如代码块、横向滑动的大图），不算把页面撑坏。
  const inScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
    return false;
  };
  const overflow = [], scrollers = [], offcanvas = [];
  /* 吸顶元素候选：顺手在这次全树扫描里挑出来，给下面「滚动定位让位」用 ——
     **不另扫一遍全树**（全树 getComputedStyle 是这个门禁最贵的一步，
     扫两遍等于白花一倍时间）。 */
  const stickyCandidates = [];
  /* 「钉在文档顶的吸顶元素」计数 —— 给 AN2 ③ 当**独立信号**用：
     如果这一页确实有个 sticky/fixed 元素是从文档最顶端开始的（顶栏长这样），
     那 AN1 就必须能认出遮挡线；认不出 ⇒ 判据在这页空跑 ⇒ 判红。
     ⚠️ 判据故意用**文档流位置**（offsetTop）而不是「滚动后的矩形」——
        后者正是 findOccluder 用的那个信号，拿它自证就是自己证明自己，
        检测一坏就一起坏 ⇒ 永远发现不了。用 offsetTop 才能是**独立**信号。 */
  let topAnchoredSticky = 0;
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.position === 'sticky' || cs.position === 'fixed') {
      stickyCandidates.push({ el, sel: sel(el) });
      if (el.offsetTop <= 1) topAnchoredSticky++;
    }
    if (cs.position === 'fixed') continue;
    if (r.right <= vw + 1 && r.left < -1) {
      // 被故意挪到屏幕左侧之外（如 skip-link、隐藏的抽屉）——不撑宽页面
      if (cs.position === 'absolute' || cs.position === 'fixed') { offcanvas.push(sel(el)); continue; }
    }
    if (r.right > vw + 1 || r.left < -1) {
      const rec = { sel: sel(el), left: Math.round(r.left), right: Math.round(r.right), over: Math.round(Math.max(r.right - vw, -r.left)) };
      if (inScroller(el)) scrollers.push(rec);
      else overflow.push(rec);
    }
  }
  // 只保留最外层的越界元素（子元素通常只是跟着父元素一起越界）
  const minimal = overflow.filter(o => !overflow.some(p => p !== o && p.sel !== o.sel && p.left <= o.left && p.right >= o.right));
  // 正文列：量它的**盒子宽度**（不含外边距），与视口比
  const ce = CONTENT_SELECTOR ? document.querySelector(CONTENT_SELECTOR) : null;
  const content = {
    selector: CONTENT_SELECTOR,
    found: !!ce,
    width: ce ? Math.round(ce.getBoundingClientRect().width) : null,
  };
  /* ---------- 触点（WCAG 2.5.8）----------
     只收**能用指针激活**的目标（链接 / 按钮 / 表单控件 / role=button）。
     刻意不收 [tabindex] 之类：可聚焦不等于可点击 ——
     首页降水图那个 tabindex="0" 的画布是**读数用**的可聚焦组，不是指针目标。 */
  const TARGET_SELECTOR = 'a[href], button, input, select, textarea, [role="button"]';
  const targets = [];
  for (const el of document.querySelectorAll(TARGET_SELECTOR)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    /* 「在句子里」：**向上找到最近的块级祖先**，看它去掉所有目标之后还剩不剩
       非目标文字。剩下的文字就是和它同处一个行内排版上下文的那些字
       （作者串里的「, 」、正文里的句子……）⇒ 它的尺寸受非目标文字的行高约束
       ⇒ 走行内例外。
       ⚠️ 为什么不能只看**直接父级**：本人（site.author）的名字被
       一个 strong.home-pub__self 包着，直接父级去掉目标后是空的，
       而它其实在作者串「Xueke Wu, Yihang Lyu, Guohao Hu」里 —— 那个「, 」
       是**祖父级**里的非目标文字。所以要往上走到块级祖先为止。
       ⚠️ 为什么必须止于**块级**：块级祖先是行内排版上下文的边界；
       再往上走（到 <body>）几乎总能捞到文字，那样**任何**链接都会被当成
       「在句子里」，例外就等于没有。 */
    let inSentence = false;
    let node = el;
    while (node && node !== document.documentElement) {
      const ncs = getComputedStyle(node);
      const blockish =
        !/^(inline|inline-block|inline-flex|inline-grid|ruby|ruby-base|ruby-text|contents)$/.test(ncs.display);
      if (blockish) {
        const clone = node.cloneNode(true);
        clone.querySelectorAll(TARGET_SELECTOR).forEach((n) => n.remove());
        inSentence = (clone.textContent || "").replace(/\\s+/g, " ").trim().length > 0;
        break;
      }
      node = node.parentElement;
    }
    targets.push({
      sel: sel(el),
      text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40),
      x: Math.round(r.left * 10) / 10,
      y: Math.round(r.top * 10) / 10,
      w: Math.round(r.width * 10) / 10,
      h: Math.round(r.height * 10) / 10,
      display: cs.display,
      inSentence,
    });
  }
  /* ---------- 滚动定位让位（吸顶顶栏）----------
     站内所有「滚动定位」都是把目标滚到视口**顶**：跳转链接 #main、
     论文页目录条目（toc.js 的 scrollIntoView({block:"start"})）。
     顶栏是 position:sticky; top:0、高 56px ⇒ 目标必须让开它，
     否则滚完目标被顶栏整条盖住（实测：跳转链接被盖 56px、
     目录标题被盖 15px = 整条标题）。

     遮挡线 = **钉在视口顶**的元素里最靠下的那条边：
       · 只认当前矩形贴着视口顶（r.top <= 1）的；
       · sticky 且 top 不是 0px 的不算（本站 .paper-toc / .annot-pane
         是 top:88px，是侧栏不是顶栏）；底部抽屉那种 fixed 也不算。
     按**计算样式**找、不写死 class 名 —— 判的是「顶上有没有东西挡着」
     这件事本身，换一套顶栏实现也不会漏判。 */
  const findOccluder = () => {
    let best = null;
    for (const c of stickyCandidates) {
      const r = c.el.getBoundingClientRect();
      if (r.height === 0 || r.width === 0) continue;
      if (r.top > 1) continue;
      if (!best || r.bottom > best.bottom) best = { sel: c.sel, top: r.top, bottom: r.bottom };
    }
    return best;
  };
  /* 滚动定位目标：① 站内锚点链接指到的元素；② 论文页的**目录目标**。
     ② 直接按 toc.js 的同一条规则取（article.paper 内的 h2[id]/h3[id]），
     **不等 toc.js 跑起来** —— 那是个动态 import，等它就等于让门禁
     「有时量到、有时量不到」（薛定谔的门禁比没有门禁更糟）。
     两个集合取并集：#main 这类静态锚点 + 目录标题。 */
  const anchorMap = new Map();
  for (const a of document.querySelectorAll('a[href^="#"]')) {
    const id = (a.getAttribute('href') || '').slice(1);
    if (!id || anchorMap.has(id)) continue;
    const t = document.getElementById(id);
    if (!t) continue;
    anchorMap.set(id, {
      id,
      kind: 'anchor',
      label: (a.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 30),
    });
  }
  const paperRoot = document.querySelector('article.paper');
  const tocHeadingCount = paperRoot ? paperRoot.querySelectorAll('h2[id], h3[id]').length : 0;
  if (paperRoot) {
    for (const h of paperRoot.querySelectorAll('h2[id], h3[id]')) {
      const prev = anchorMap.get(h.id);
      if (prev) {
        /* 这个 id 同时也是站内锚点（罕见）⇒ 标成目录目标，
           否则 AN3 的「量到的目录目标数」会少算一个 ⇒ 假红。 */
        prev.kind = 'toc';
        continue;
      }
      anchorMap.set(h.id, {
        id: h.id,
        kind: 'toc',
        label: (h.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 30),
      });
    }
  }
  const anchorTargets = [];
  for (const t of anchorMap.values()) {
    const el = document.getElementById(t.id);
    if (!el) continue;
    /* 瞬时滚动，不等动画 —— 否则读到的是滚动途中的中间位置。 */
    el.scrollIntoView({ block: 'start', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    const occ = findOccluder();
    const overlap = occ
      ? Math.max(0, Math.min(occ.bottom, r.bottom) - Math.max(occ.top, r.top))
      : 0;
    anchorTargets.push({
      id: t.id,
      kind: t.kind,
      label: t.label,
      top: Math.round(r.top * 10) / 10,
      height: Math.round(r.height * 10) / 10,
      occluded: Math.round(overlap * 10) / 10,
    });
  }
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  return {
    vw,
    pageScrollWidth: document.documentElement.scrollWidth,
    hasHScroll: document.documentElement.scrollWidth > vw + 1,
    overflow: minimal.slice(0, 12),
    scrollers: scrollers.slice(0, 8),
    offcanvas: offcanvas.slice(0, 3),
    content,
    targets,
    anchors: {
      occluder: (() => { const o = findOccluder(); return o ? { sel: o.sel, bottom: Math.round(o.bottom * 10) / 10 } : null; })(),
      targets: anchorTargets,
      tocHeadingCount,
      tocMeasured: anchorTargets.filter((a) => a.kind === 'toc').length,
      topAnchoredSticky,
    },
  };
})()`;

/* ---------- 主流程 ---------- */
(async () => {
  if (!fs.existsSync(SITE)) {
    console.error(`✗ 找不到 ${SITE}，请先运行 npm run build`);
    process.exit(1);
  }
  const found = findChrome();
  if (!found.bin) {
    if (found.reason) {
      console.error(`✗ ${found.reason}`);
    } else {
      console.error(
        "✗ 找不到可用的 Chrome / Chromium。\n" +
          "  这个门禁要用真实浏览器量多档宽度下的横向溢出，量不了就不算通过——\n" +
          "  静默跳过等于给这个门禁发一张「已通过」的假证书。\n" +
          "  · macOS：装 Google Chrome，或设 CHROME_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome\n" +
          "  · Linux / CI：GitHub 的 ubuntu runner 镜像自带 google-chrome，应能自动找到；\n" +
          "    若在此报错，说明 runner 镜像变了（把它加进 deploy.yml 的安装步骤），\n" +
          "    或设 CHROME_PATH=/usr/bin/google-chrome 明确指定。"
      );
    }
    process.exit(1);
  }
  const chromeBin = found.bin;
  console.log(`浏览器：${chromeBin}`);

  /* WebSocket 全局：Node 21.0.0 引入，**22.0.0 起不再需要 --experimental-websocket**，
     22.4.0 起转正。Node 20 上它默认不开（要加旗标），
     早于 20.10 的版本干脆没有 → 直接 new WebSocket(...) 会抛
     "WebSocket is not defined"，看不出是版本问题。
     这里提前判一次，把话说清楚。 */
  if (typeof WebSocket !== "function") {
    console.error(
      "✗ 当前 Node 没有全局 WebSocket（CDP over WebSocket 需要它）。\n" +
        "  · Node ≥ 22.4 默认可用\n" +
        "  · Node 20 需要 --experimental-websocket 旗标（本仓库不采用那条路）\n" +
        "  · 更早的版本没有该全局\n" +
        `  当前版本：${process.version}`
    );
    process.exit(1);
  }

  const pages = [];
  const styleFiles = [];
  (function walk(dir, base) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.name.startsWith("._")) continue;
      if (e.isDirectory()) walk(p, base + e.name + "/");
      else if (e.name.endsWith(".html")) pages.push(base + e.name);
      else if (e.name.endsWith(".css")) styleFiles.push(base + e.name);
    }
  })(SITE, "");
  const routes = pages.map((p) => (p.endsWith("/index.html") ? "/" + p.slice(0, -"index.html".length) : "/" + p));

  /* ---------- D75：阻断清单 = 手写底线 ∪ 从产物自身推导的外域主机 ---------- */
  /* ⚠️ 下面这一行是 D75 的注入点：把「从产物推导」这一步摘掉，
     阻断清单就只剩手写底线 ⇒ 覆盖度自证当场红（见自测里的 M9 负对照）。 */
  const derivedHosts = deriveExternalHosts(SITE, [...pages, ...styleFiles]);
  /* 覆盖度自证的**基准**：用另一套算法独立算一遍（口径必须一致，否则会误红）。 */
  const auditHosts = auditExternalHosts(SITE, [...pages, ...styleFiles]);
  const blockedHosts = new Set([...EXTERNAL_FONT_HOSTS, ...derivedHosts]);
  /** 交给 CDP `Network.setBlockedURLs` 的通配规则（`*` 匹配任意前缀/后缀）。 */
  const blockedPatterns = [...blockedHosts].map((h) => `*${h}*`);

  /* D75 覆盖度自证：产物里引用的每个外域主机都必须在实际交给浏览器的那份清单里。
     ⚠️ 这一道在**起 Chrome 之前**就判红：快、确定、不依赖网络。
     ⚠️ 它之所以不是空跑：上面那一步「推导」是**可摘的**（M9 负对照证明了这点）。 */
  const missingHosts = [...auditHosts].filter((h) => !blockedHosts.has(h));
  if (missingHosts.length) {
    console.error("\n✗ 窄屏溢出门禁未通过：\n");
    console.error(
      `  ✗ D75 阻断清单覆盖对不上：产物里引用的外域主机 ${missingHosts.join("、")} ` +
        `不在实际交给浏览器的那份阻断清单里 —— 测量会去等这些外域资源，` +
        `结论会随「这台机器能不能出网」而变。`
    );
    console.error("");
    process.exit(1);
  }

  const { server, port } = await startServer();
  liveServer = server;   // BR4：登记起来，失败路径要能把它关掉
  const chrome = await startChrome(chromeBin);

  /* 取 CDP 端点。⚠️ BR2：这一步也必须有上限 ——
     浏览器进程起来了但端口上没人应答时，不能无限等下去。 */
  let wsUrl;
  try {
    const verRes = await fetch(`http://127.0.0.1:${chrome.port}/json/version`, {
      signal: AbortSignal.timeout(WAIT_MS),
    });
    const ver = await verRes.json();
    wsUrl = `ws://127.0.0.1:${chrome.port}/devtools/browser/${ver.webSocketDebuggerUrl.split("/").pop()}`;
  } catch (e) {
    throw new BrowserLayerError(
      `连不上浏览器的调试端点（等 ${WAIT_MS}ms 超时）：${e.message}`,
      `浏览器：${chromeBin}`
    );
  }

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    /* ⚠️ BR2：握手也要有上限（此前这里能无限挂着）。 */
    const timer = setTimeout(
      () =>
        rej(
          new BrowserLayerError(
            `连浏览器超时：${WAIT_MS}ms 内没完成 WebSocket 握手`,
            `浏览器：${chromeBin}`
          )
        ),
      WAIT_MS
    );
    ws.addEventListener("open", () => {
      clearTimeout(timer);
      res();
    });
    ws.addEventListener("error", (e) => {
      clearTimeout(timer);
      rej(
        new BrowserLayerError(
          `连浏览器失败：${(e && e.message) || "WebSocket 握手被拒绝"}`,
          `浏览器：${chromeBin}`
        )
      );
    });
  });
  const cdp = new CDP(ws);

  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  /* 观测域事件用（密闭性自证要看到「哪些请求拿到了响应」）。 */
  await cdp.send("Network.enable", {}, sessionId);

  /* ⚠️ 阻断外部资源请求（D74 打底、D75 改成从产物推导）——
     这一行是**测量与外网解耦**的全部依赖：它让外部请求**立刻失败**
     而不是挂住，页面 load 事件照常来，测量结果不再随外网状态漂移。
     ⚠️ 这一行**不许被摘掉**：摘掉之后下面的「外部字体探针」会当场判红
     （见 scripts/test-overflow-widths.cjs 里的对应负对照档）。
     ⚠️ 清单本身也不能退化成手写的两域：D75 那一档负对照守的就是这件事。
     ⚠️ 别改成 Chrome 的 `--host-resolver-rules` —— 实测在 macOS 上不生效。 */
  await cdp.send("Network.setBlockedURLs", { urls: blockedPatterns }, sessionId);

  /* ---------- 密闭性观测：哪些请求拿到了响应 ---------- */
  const localOrigin = `http://127.0.0.1:${port}`;
  /** 是不是「本机产物服务提供的资源」。
   *  ⚠️ 必须比 **origin** 而不是比字符串前缀：`http://127.0.0.1:3918` 是
   *    `http://127.0.0.1:39187/…` 的前缀 ⇒ 用 startsWith 会把另一个端口
   *    （也就是「产物之外的东西」）误判成本机资源。 */
  const isLocalResource = (url) => {
    try {
      return new URL(url).origin === localOrigin;
    } catch {
      return false;
    }
  };
  const requestUrls = new Map();       // requestId → url
  const externalResponded = new Map(); // url → HTTP 状态码（只记「不是本机产物服务」的）
  const escapedHosts = new Map();     // host → 第一个请求地址（向「没被阻断的外域」发过的）
  const documentStatus = new Map();   // url → 主文档的 HTTP 状态码（BR3：页面到底加载成功没有）
  cdp.onAny = (msg) => {
    if (msg.method === "Network.requestWillBeSent") {
      const r = msg.params.request;
      if (r && r.url) {
        requestUrls.set(msg.params.requestId, r.url);
        /* D75 运行期兜底：测量期间向**没被阻断**的外域主机发请求 ⇒ 阻断清单漏了它。
           ⚠️ 这里按**主机名**判本机（不是 origin）：另一个端口的 127.0.0.1
           也是本机，它归密闭性判据管，不该混进这里。 */
        const host = hostOfUrl(r.url);
        if (host && !blockedHosts.has(host) && !escapedHosts.has(host)) {
          escapedHosts.set(host, r.url);
        }
      }
      return;
    }
    if (msg.method === "Network.responseReceived") {
      const url = requestUrls.get(msg.params.requestId);
      if (!url) return;
      /* ⚠️ BR3（D109）：**主文档**的响应状态码必须记账。
         实测（2026-10-27）：请求被代理打掉时，Chrome 会把代理返回的**错误响应体**
         **当成页面渲染出来** —— 地址栏仍是原地址、`location.origin` 也是原 origin
         （⇒ 靠 origin 判不出来），但那个文档**根本不是我们的页面**
         （没有 viewport meta ⇒ 量到 980px 的布局视口）。
         ⇒ 唯一可靠的判据是**状态码**：主文档不是 200 ⇒ 页面没加载出来。 */
      if (msg.params.type === "Document") {
        documentStatus.set(url, msg.params.response.status);
      }
      if (isLocalResource(url)) return; // 本机产物服务提供的资源 ⇒ 允许
      externalResponded.set(url, msg.params.response.status);
    }
  };

  let bad = 0;
  let measured = 0;
  const badPairs = []; // { width, route, scrollWidth } —— 溢出到底在哪一档、哪一页
  const viewportMismatch = []; // { width, route, actual } —— 请求的宽度与量到的布局视口对不上
  const perWidth = new Map(); // width → 该档测了多少页
  const narrowColumns = []; // { width, route, selector, contentWidth, min, reason } —— 正文被挤窄的位置
  const columnNotFound = []; // { width, route, selector } —— 正文列选择器没命中
  let columnChecked = 0; // 正文列实际量了多少次（自证用）
  const targetViolations = []; // { width, route, target, other, why } —— 触点没达到 WCAG 2.5.8
  let targetMeasured = 0; // 量到过触点的（页 × 档）次数（自证用）
  let targetCount = 0; // 一共量到多少个触点（自证用）
  let inlineExempt = 0; // 走行内例外被豁免的目标总数（TS4 如实报数）
  const anchorViolations = []; // { width, route, id, kind, label, occluded } —— 滚动定位目标被吸顶顶栏遮住
  let anchorMeasured = 0;    // 量到滚动定位目标的（页 × 档）次数（自证用）
  let anchorCount = 0;       // 一共量到多少个滚动定位目标（自证用）
  let anchorEmpty = 0;       // 一个目标都没量到的（页 × 档）次数（自证用）
  let tocExpected = 0;       // 论文页带 id 的标题总数（AN3 覆盖度自证用）
  let tocMeasured = 0;       // 其中被量到的目录目标数
  let occluderSeen = 0;      // 量到过吸顶顶栏的（页 × 档）次数（自证用）
  let topAnchoredSeen = 0;   // 存在「钉在文档顶的吸顶元素」的（页 × 档）次数（AN2 ③ 的独立信号）
  let probe = null;          // 外部字体探针的结果（只跑一次，见 D74 修法）

  for (const width of WIDTHS) {
    /* ⚠️ 每一档都要**重新设置**设备尺寸 —— 只设一次的话，
       后面几档量到的还是第一档的布局（看起来跑了很多档，其实量的是同一个宽度）。 */
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width, height: 844, deviceScaleFactor: 2, mobile: true,
    }, sessionId);

    console.log(`视口宽度 ${width}px，共 ${routes.length} 个页面`);
    for (const route of routes) {
      const url = `http://127.0.0.1:${port}${route}`;
      const loaded = cdp.once("Page.loadEventFired");
      const nav = await cdp.send("Page.navigate", { url }, sessionId);
      /* ⚠️ BR3（D109）：**页面没加载出来**是浏览器层的事，不是页面判据的事。
         此前这种情形会一路走到「正文列选择器没命中」——
         读报告的人会以为页面结构变了，实际上页面根本没加载出来。
         `Page.navigate` 的应答里带 errorText ⇒ 导航本身失败了 ⇒ 归浏览器层。 */
      if (nav && nav.errorText) {
        throw new BrowserLayerError(
          `页面没加载出来：${nav.errorText}`,
          `地址 ${url}（页面加载失败 ⇒ 这次没有关于这个页面的任何结论）`
        );
      }
      await loaded;
      /* ⚠️ BR3（D109）：确认**加载到的确实是我们要的那个页面**。
         实测（2026-10-27）：请求被代理打掉时，Chrome 会显示自己的**错误页**，
         而 `Page.navigate` 的 errorText **不一定**有值 ⇒ 门禁于是去量了那个错误页
         （错误页没有 viewport meta ⇒ 量到 980px 的布局视口）
         ⇒ 门禁给出的红因是「请求的视口宽度与实际量到的对不上」——
         而真相是「页面压根没加载出来」。
         ⇒ 判据：加载后的 document 仍须落在**本机产物服务**这个 origin 上
           （错误页的 origin 是 `null`，一测便知）。 */
      const locRes = await cdp.send(
        "Runtime.evaluate",
        { expression: "location.origin", returnByValue: true },
        sessionId
      );
      const origin = locRes.result && locRes.result.value;
      if (origin !== localOrigin) {
        throw new BrowserLayerError(
          `页面没加载出来：加载后落在 ${origin || "(空 origin，多半是浏览器的错误页)"}` +
            `，不是本机产物服务 ${localOrigin}`,
          `地址 ${url}`
        );
      }
      /* 主文档的**状态码**才是可靠的判据（实测：代理的错误响应体会被当成页面渲染，
         地址栏与 origin 都还是原地址 ⇒ 靠 origin 判不出来）。
         本机产物服务对存在的文件一律回 200 ⇒ 别的状态码就说明页面没加载出来。 */
      const docStatus = documentStatus.get(url);
      if (docStatus !== undefined && docStatus !== 200) {
        throw new BrowserLayerError(
          `页面没加载出来：主文档响应状态码是 ${docStatus}（本机产物服务只会回 200）`,
          `地址 ${url}`
        );
      }
      await new Promise((r) => setTimeout(r, 250)); // 等字体/布局稳定

      const rule = contentColumnRule(route);
      const res = await cdp.send(
        "Runtime.evaluate",
        { expression: measureScript(rule.selector), returnByValue: true },
        sessionId
      );
      const m = res.result.value;
      measured++;
      perWidth.set(width, (perWidth.get(width) || 0) + 1);

      /* 外部字体探针：**只跑一次**（在第一个被测页面上）。
         它证明的是「阻断生效了没有」，与具体哪一页无关 ⇒ 没必要每页每档都跑。
         判据见文件头：被阻断 ⇒ 毫秒级失败；没被阻断 ⇒ 要么取到内容、要么挂住。 */
      if (probe === null) {
        const pr = await cdp.send(
          "Runtime.evaluate",
          { expression: FONT_PROBE_SCRIPT, awaitPromise: true, returnByValue: true },
          sessionId
        );
        probe = pr.result && pr.result.value ? pr.result.value : null;
      }

      /* ⚠️ 量到的布局视口宽度必须等于请求的宽度 —— 不等就说明**这一档根本没被
         模拟成那个宽度**（典型成因：页面没有 viewport meta，mobile 模拟会退回
         980px 的布局视口）。这种情况下"这一档没溢出"是**假绿**，必须判红。 */
      if (Math.abs(m.vw - width) > 1) {
        viewportMismatch.push({ width, route, actual: m.vw });
      }

      /* ---------- 正文列（窄带检测） ---------- */
      const c = m.content;
      const useRatio = m.vw <= CONTENT_RATIO_MAX_WIDTH;
      const minWidth = useRatio
        ? Math.round(m.vw * CONTENT_MIN_RATIO)
        : CONTENT_MIN_PX_WIDE;
      let columnOk = true;
      let columnNote = "";
      if (!c.found) {
        columnOk = false;
        columnNote = "正文列选择器没命中（页面结构变了？）";
        columnNotFound.push({ width, route, selector: rule.selector });
      } else if (c.width < minWidth) {
        columnOk = false;
        columnNote = useRatio
          ? `正文被挤成窄带（占视口 ${Math.round((c.width / m.vw) * 100)}%，下限 ${Math.round(CONTENT_MIN_RATIO * 100)}%）`
          : `正文列太窄（${c.width}px，下限 ${CONTENT_MIN_PX_WIDE}px）`;
        narrowColumns.push({
          width, route, selector: rule.selector,
          contentWidth: c.width, viewport: m.vw, min: minWidth,
          reason: useRatio ? "ratio" : "absolute",
        });
      }
      if (c.found) columnChecked++;
      const pct = c.found ? Math.round((c.width / m.vw) * 100) : null;
      const columnLine = c.found
        ? `      正文列 ${c.selector} ${c.width}px ${pct}%（下限 ${useRatio ? `${Math.round(CONTENT_MIN_RATIO * 100)}%` : `${CONTENT_MIN_PX_WIDE}px`}）${columnOk ? "✓" : "✗"}`
        : `      正文列 ${c.selector} 未找到 ✗`;

      /* ---------- 触点尺寸（WCAG 2.5.8） ---------- */
      const targets = m.targets || [];
      targetMeasured++;
      targetCount += targets.length;
      const tEval = evaluateTargets(targets);
      inlineExempt += tEval.exemptInline;
      const smallest = targets.reduce(
        (acc, t) => (acc === null || t.h < acc.h ? t : acc),
        null
      );
      const targetLine =
        `      触点 ${targets.length} 个` +
        (smallest ? `（最矮 ${Math.round(smallest.h)}×${Math.round(smallest.w)}px ${smallest.sel}）` : "") +
        (tEval.undersized ? `，其中 ${tEval.undersized} 个不足 ${TARGET_MIN}×${TARGET_MIN}` : "") +
        (tEval.violations.length ? ` ✗ ${tEval.violations.length} 个不达标` : " ✓");
      tEval.violations.forEach((v) => {
        targetViolations.push({
          width, route,
          target: v.target, other: v.other, why: v.why,
        });
      });

      /* ---------- 滚动定位让位（吸顶顶栏，AN1–AN3） ---------- */
      const anchors = (m.anchors && m.anchors.targets) || [];
      anchorMeasured++;
      anchorCount += anchors.length;
      if (anchors.length === 0) anchorEmpty++;
      tocExpected += (m.anchors && m.anchors.tocHeadingCount) || 0;
      tocMeasured += (m.anchors && m.anchors.tocMeasured) || 0;
      const occluder = (m.anchors && m.anchors.occluder) || null;
      if (occluder) occluderSeen++;
      const topAnchored = (m.anchors && m.anchors.topAnchoredSticky) || 0;
      if (topAnchored > 0) topAnchoredSeen++;
      const anchorOccluded = anchors.filter((a) => a.occluded > 0);
      anchorOccluded.forEach((a) => {
        anchorViolations.push({ width, route, id: a.id, kind: a.kind, label: a.label, occluded: a.occluded });
      });
      const anchorLine =
        `      滚动定位 ${anchors.length} 个目标` +
        (occluder ? `，吸顶顶栏 ${occluder.sel} 底边 ${occluder.bottom}px` : "，本页没有吸顶顶栏") +
        (anchorOccluded.length ? ` ✗ ${anchorOccluded.length} 个被遮住` : " ✓");

      /* ⚠️ 行首的 ✓/✗ 现在代表**本页本档的全部判据**（横向溢出 + 正文列宽 + 触点尺寸）；
         退出码与它同源 —— 下面几处计数加起来就是最终退出码的依据。 */
      const status = m.hasHScroll
        ? "✗ 横向可拖"
        : columnOk && tEval.violations.length === 0 && anchorOccluded.length === 0
        ? "✓"
        : "✗";
      console.log(`  ${status} ${route}  (scrollWidth ${m.pageScrollWidth} / 视口 ${m.vw})`);
      console.log(columnLine);
      console.log(targetLine);
      console.log(anchorLine);
      if (columnNote) console.log(`      ${columnNote}`);
      anchorOccluded.forEach((a) => {
        console.log(
          `      滚动定位被顶栏遮住：#${a.id}「${a.label}」被遮 ${a.occluded}px` +
            `（${a.kind === "toc" ? "论文页目录条目" : "站内锚点"}）`
        );
      });
      tEval.violations.forEach((v) => {
        console.log(
          `      触点过小：${v.target.sel}「${v.target.text}」${Math.round(v.target.w)}×${Math.round(v.target.h)}px` +
            `（下限 ${TARGET_MIN}×${TARGET_MIN}，且 ${v.why}：${v.other.sel}「${v.other.text}」）`
        );
      });
      /* ⚠️ 退出码必须与打出来的 ✓/✗ **同源**：判据一律用 hasHScroll
         （页面真的能横向滚动 = documentElement.scrollWidth > 视口）。
         此前这里用的是 `m.overflow.length`（元素矩形扫描的结果）——两个条件
         不是一回事，矩形扫描**抓不到"内容溢出"**：一个 div 的盒子宽度仍是
         390px（超长内容撑在盒子里面），矩形扫描看不到它，但页面确实能横滚。
         结果就是：脚本打印"✗ 横向可拖"、退出码却给 0。
         ——"永远通过的检查比没有检查更糟"：谁把它接进 CI，谁就会拿到假绿。
       2026-10-19 实测（注入一个 400 字符长串的 div）：
         scrollWidth 4416 / 视口 390，输出 ✗，退出码 0。 */
      if (m.hasHScroll) {
        bad++;
        badPairs.push({ width, route, scrollWidth: m.pageScrollWidth });
      }
      if (m.overflow.length) {
        m.overflow.forEach((o) => console.log(`      越界 ${o.over}px  ${o.sel}`));
      }
      m.scrollers.forEach((o) => console.log(`      （容器内有意横滚）${o.sel}`));
    }
    console.log("");
  }

  /* ---------- 自证：每一档到底测了没有 ---------- */
  const problems = [];
  const expected = WIDTHS.length * routes.length;
  if (measured !== expected) {
    problems.push(
      `测量次数对不上：期望 ${WIDTHS.length} 档 × ${routes.length} 页 = ${expected} 次，实际 ${measured} 次 —— 有一档没跑完。`
    );
  }
  for (const w of WIDTHS) {
    const n = perWidth.get(w) || 0;
    if (n !== routes.length) {
      problems.push(`宽度 ${w}px 只测了 ${n} 个页面（应为 ${routes.length} 个）—— 这一档没被完整测量。`);
    }
  }
  if (viewportMismatch.length) {
    problems.push(
      `${viewportMismatch.length} 处「请求的视口宽度」与「实际量到的布局视口宽度」不符 —— ` +
        `这些档位等于没被真正测到：` +
        viewportMismatch.map((x) => `${x.route}@${x.width}px→${x.actual}px`).join("、")
    );
  }
  /* 正文列也自证：每一页每一档都要量过一次（量到 = 选择器命中）。 */
  if (columnChecked + columnNotFound.length !== expected) {
    problems.push(
      `正文列测量次数对不上：期望 ${expected} 次，实际 ${columnChecked + columnNotFound.length} 次 —— ` +
        `有一页没被量到。`
    );
  }
  /* TS1 / TS2：触点判据自证 —— 每页每档都要量一次触点，且**至少量到过一个**。
     一个都没量到 = 判据空跑（选择器写错、页面结构变了……）⇒ 判红。 */
  if (targetMeasured !== expected) {
    problems.push(
      `触点测量次数对不上：期望 ${expected} 次（每页每档一次），实际 ${targetMeasured} 次 —— ` +
        `有一页没被量到触点。`
    );
  }
  if (targetCount === 0) {
    problems.push(
      `TS1 一个触点都没量到 —— 触点判据此刻等于**空跑**，空跑的门禁等于没有门禁，所以判红。`
    );
  }

  /* AN2：滚动定位判据**自证存活** —— 空跑的门禁等于没有门禁。
     ① 每页每档都要量过一次（量到 = 该页确实有可解析的滚动定位目标）；
     ② 全站至少量到一个目标（选择器写错 / 页面结构变了 ⇒ 全军覆没）；
     ③ 全站至少识别到过一次吸顶顶栏 —— 一个顶栏都没认出来的话，
        AN1 的「没被遮住」是因为**没有东西可比**，等于空跑；
     ④ 每一页每一档都不许「一个目标都量不到」。 */
  if (anchorMeasured !== expected) {
    problems.push(
      `滚动定位测量次数对不上：期望 ${expected} 次（每页每档一次），实际 ${anchorMeasured} 次 —— ` +
        `有一页没被量到。`
    );
  }
  if (anchorCount === 0) {
    problems.push(
      `AN2 一个滚动定位目标都没量到 —— 滚动定位判据此刻等于**空跑**，空跑的门禁等于没有门禁，所以判红。`
    );
  }
  if (anchorEmpty > 0) {
    problems.push(
      `AN2 有 ${anchorEmpty} 个（页 × 档）**一个滚动定位目标都量不到** —— ` +
        `这些页面要么没有可解析的锚点，要么目标收集规则失效了。`
    );
  }
  /* AN2 ③：顶栏识别的自证 —— 但**必须有条件**。
     「全站一次顶栏都没认出来」本身不一定是缺陷（这个站本来就可以没有吸顶顶栏，
     比如纯文库夹具站）⇒ 无条件判红会误伤。
     条件用**独立信号**：这一页确实存在「从文档最顶端开始的吸顶元素」
     （offsetTop ≤ 1 —— 顶栏就长这样；侧栏 sticky top:88px 的 offsetTop 很大，
     底部抽屉的 fixed offsetTop 也不小 ⇒ 都不会被算进来）。
     只有当这种元素存在、却一个遮挡线都没认出来时，
     才能下结论说「检测坏了」⇒ AN1 在这些页上空跑 ⇒ 判红。 */
  if (topAnchoredSeen > 0 && occluderSeen === 0) {
    problems.push(
      `AN2 有 ${topAnchoredSeen} 个（页 × 档）存在钉在文档顶的吸顶元素，却一次顶栏遮挡线都没识别到 —— ` +
        `AN1 的「没被遮住」是因为**没有东西可比**，判据等于空跑，所以判红。`
    );
  }
  /* AN3：目录覆盖自证 —— 论文页「带 id 的标题数」必须与「被量到的目录目标数」相等。
     不等 = 有标题没被这条判据量过（收集规则漏了、或标题中途丢了 id）。 */
  if (tocMeasured !== tocExpected) {
    problems.push(
      `AN3 目录目标覆盖对不上：论文页共 ${tocExpected} 个带 id 的标题，只量到 ${tocMeasured} 个 —— ` +
        `有标题没被这条判据量过，目录指过去的目标是**判据盲区**。`
    );
  }

  /* ---------- D74 修法带来的两道自证 ---------- */
  /* ① 外部字体探针：阻断必须**真的生效**。
     探针在页面里 fetch 一次外部字体域：
       · 阻断生效 ⇒ 毫秒级失败（kind = rejected）；
       · 阻断没生效且外网通 ⇒ 取到内容（kind = resolved）⇒ 判红；
       · 阻断没生效且外网不通 ⇒ 请求挂住（kind = hung）⇒ 判红。
     后两种都说明「测量结论会随这台机器能不能出网而变」⇒ 必须判红。
     ⚠️ 探针一次都没跑起来（没有可测的页面）时，这道自证等于**空跑**，
        空跑的门禁等于没有门禁 ⇒ 判红。 */
  if (routes.length > 0 && !probe) {
    problems.push(
      `外部字体探针根本没跑起来 —— 这道自证此刻等于**空跑**，空跑的门禁等于没有门禁，所以判红。`
    );
  } else if (probe && probe.kind === "resolved") {
    problems.push(
      `外部字体域 ${FONT_PROBE_HOST} 在测量浏览器里**取到了内容** —— ` +
        `外部字体请求没有被阻断，测量结论会随这台机器能不能出网而变。`
    );
  } else if (probe && probe.kind === "hung") {
    problems.push(
      `外部字体域 ${FONT_PROBE_HOST} 在测量浏览器里**挂住了**（${probe.ms}ms 都没失败）—— ` +
        `外部字体请求没有被阻断，测量结论会随这台机器能不能出网而变。`
    );
  } else if (probe && probe.ms > FONT_PROBE_FAST_FAIL_MS) {
    problems.push(
      `外部字体域 ${FONT_PROBE_HOST} 失败得太慢（${probe.ms}ms，门槛 ${FONT_PROBE_FAST_FAIL_MS}ms）—— ` +
        `阻断可能没生效，测量结论会随这台机器能不能出网而变。`
    );
  }
  /* ② 密闭性：测量期间**除本机产物服务外**，任何请求拿到响应都判红 ——
     测量结果不该依赖产物之外的任何东西（外网、别的服务……）。 */
  if (externalResponded.size > 0) {
    problems.push(
      `测量期间有 ${externalResponded.size} 个**不是本机产物服务**的请求拿到了响应 —— ` +
        `测量结果会依赖产物之外的东西：` +
        [...externalResponded.entries()].map(([u, s]) => `${u}（HTTP ${s}）`).join("、")
    );
  }
  /* ③ D75 运行期兜底：测量期间向「**没有被阻断**的外域主机」发过请求 ⇒ 阻断清单漏了它。
     静态扫描扫不到的那些（JS 里 fetch、运行时才拼出来的地址）靠这一道兜住。 */
  if (escapedHosts.size > 0) {
    problems.push(
      `D75 测量期间浏览器向 ${escapedHosts.size} 个**没有被阻断**的外域主机发起了请求：` +
        [...escapedHosts.entries()].map(([h, u]) => `${h}（${u}）`).join("、") +
        ` —— 阻断清单漏了它们，测量结论会随这台机器能不能出网而变。`
    );
  }

  ws.close();
  /* 正常路径的回收也走同一个函数（BR4）：两条路径回收的是同一批东西，
     免得「正常路径清一次、失败路径漏一次」。 */
  await releaseBrowser();

  const widthList = WIDTHS.join(" / ");
  if (problems.length) {
    console.error("\n✗ 窄屏溢出门禁未通过：\n");
    problems.forEach((p) => console.error(`  ✗ ${p}`));
    if (badPairs.length) {
      console.error(`\n  横向溢出位置（宽度 → 路由）：`);
      badPairs.forEach((b) => console.error(`    · ${b.width}px  ${b.route}  (scrollWidth ${b.scrollWidth})`));
    }
    console.error("");
    process.exit(1);
  }
  if (bad) {
    console.error(`\n✗ ${bad} 处横向溢出（宽度 → 路由）：`);
    badPairs.forEach((b) => console.error(`  · ${b.width}px  ${b.route}  (scrollWidth ${b.scrollWidth})`));
    console.error("");
    process.exit(1);
  }
  if (columnNotFound.length) {
    console.error(`\n✗ ${columnNotFound.length} 处「正文列选择器没命中」—— 页面结构变了，门禁不能装作没看见：`);
    columnNotFound.forEach((n) => console.error(`  · ${n.width}px  ${n.route}  选择器 ${n.selector}`));
    console.error("");
    process.exit(1);
  }
  if (narrowColumns.length) {
    console.error(`\n✗ ${narrowColumns.length} 处「正文被挤成窄带」（宽度 → 路由）：`);
    narrowColumns.forEach((n) => {
      const limit = n.reason === "ratio"
        ? `下限 ${Math.round(CONTENT_MIN_RATIO * 100)}%`
        : `下限 ${CONTENT_MIN_PX_WIDE}px`;
      console.error(`  · ${n.width}px  ${n.route}  正文列 ${n.selector} ${n.contentWidth}px / 视口 ${n.viewport}px（${limit}）`);
    });
    console.error("");
    process.exit(1);
  }
  if (targetViolations.length) {
    console.error(
      `\n✗ ${targetViolations.length} 处触点未达 WCAG 2.5.8（Target Size, Minimum, AA）` +
        `（下限 ${TARGET_MIN}×${TARGET_MIN} CSS px，或 spacing 例外成立）：`
    );
    targetViolations.forEach((v) => {
      console.error(
        `  · ${v.width}px  ${v.route}  ${v.target.sel}「${v.target.text}」` +
          `${Math.round(v.target.w)}×${Math.round(v.target.h)}px（${v.why}：${v.other.sel}「${v.other.text}」）`
      );
    });
    console.error("");
    process.exit(1);
  }
  if (anchorViolations.length) {
    console.error(
      `\n✗ ${anchorViolations.length} 处滚动定位目标被吸顶顶栏遮住` +
        `（滚到了，但落点被顶住 ⇒ 目标看不见）:`
    );
    anchorViolations.forEach((v) => {
      console.error(
        `  · ${v.width}px  ${v.route}  #${v.id}「${v.label}」被遮 ${v.occluded}px` +
          `（${v.kind === "toc" ? "论文页目录条目" : "站内锚点"}）`
      );
    });
    console.error(
      `  ⇒ 修法：给**根滚动容器**加 scroll-padding-top（让位吸顶顶栏），` +
        `不要逐个目标挂 scroll-margin-top（漏一条就白写）。`
    );
    console.error("");
    process.exit(1);
  }
  console.log(
    `✓ 所有页面在 ${WIDTHS.length} 档宽度（${widthList}）下均无横向溢出，` +
      `且正文列都不窄、触点都达到 WCAG 2.5.8 的要求、滚动定位目标都没被吸顶顶栏遮住` +
      `（共 ${measured} 次测量，${routes.length} 个页面；` +
      `量到触点 ${targetCount} 个，其中 ${inlineExempt} 个按**行内例外**豁免；` +
      `量到滚动定位目标 ${anchorCount} 个（其中目录目标 ${tocMeasured} 个），` +
      `识别到吸顶顶栏 ${occluderSeen} 次）` +
      `；本次测量把产物里引用的全部 ${blockedHosts.size} 个外域主机` +
      `（${[...blockedHosts].join("、") || "无"}）在浏览器层拦掉了，测量不依赖本机能不能出网` +
      `（页面用的是系统回退字体，不是 webfont —— ` +
      `门禁量的是布局盒宽度，不随字宽改变，只有断词类横向溢出可能有细微差别）`
  );
  process.exit(0);
})().catch(async (e) => {
  /* ⚠️ BR4（D109）：**失败路径也要回收**。
     此前这里只有一句 `process.exit(1)` ⇒ 浏览器进程与临时目录留在机器上
     （实测堆积了 245 个 Chrome）⇒ 机器越跑越慢 ⇒ 越容易再触发等待超时。 */
  await releaseBrowser();
  if (e instanceof BrowserLayerError) {
    /* ⚠️ BR3（D109）：浏览器层失败要**专属红因**，
       且必须与「页面真的越界」的红因**措辞可区分** ——
       否则读报告的人会照着「页面有问题」去查产品，而问题其实在测量这一环。 */
    console.error("\n✗ 窄屏溢出门禁未通过（**浏览器层失败**，不是页面判据判红）：\n");
    console.error(`  ✗ BR3 浏览器层：${e.message}`);
    if (e.detail) console.error(`    · ${e.detail}`);
    console.error(
      "  ✗ BR3 本次**一次测量都没做成** ⇒ 这一轮**没有关于页面的任何结论**；" +
        "这是「测量没做成」，不是「页面有问题」。"
    );
    console.error(
      "  ⇒ 查法：先看浏览器本身能不能用（起得来吗、连得上吗），" +
        "再看这台机器的代理/网络有没有把它卡住（BR1：门禁已要求浏览器不走代理）。"
    );
    console.error("");
    process.exit(1);
  }
  console.error("检查失败：", e.message);
  process.exit(1);
});
