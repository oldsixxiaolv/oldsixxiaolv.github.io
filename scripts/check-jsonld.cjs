#!/usr/bin/env node
/**
 * 门禁 J0–J13：站点实体（WebSite）与页面实体（WebPage / ProfilePage）这一层
 * 必须存在，并且彼此接得上；实体身份（@id）全站唯一；作品实体（BlogPosting）
 * 必须与页面上人能看到的东西逐字一致。
 *
 * 为什么要有这个门禁：
 *   本站此前的结构化数据只有两层——"我是谁"（Person）与"我产出过什么"
 *   （ScholarlyArticle / Dataset / SoftwareSourceCode）。**站点自己从未被
 *   声明过**：没有 WebSite 节点，页面实体也没有。于是消费方拿不到两个
 *   最基础的答案：
 *     · "这个站点是谁的"（谁在运营它）
 *     · "这一页的主题是谁 / 是什么"（这一页到底在讲什么）
 *   个人学术主页的 JSON-LD 惯例（2026-10-19 查证的外部做法）是最少三件套：
 *   WebSite + Person + ProfilePage（讲作者的页面，mainEntity → Person）。
 *
 *   这类缺失**不会报错**：页面照常渲染、JSON-LD 照常能被 JSON.parse
 *   （verify-site 第 2 条查的就是那个）、其它门禁全绿——只有逐个节点读
 *   才知道少了这一层。所以要有机器门禁兜住。
 *
 * ⚠️ 编号是「红因归属」的唯一坐标（2026-10-22，D59 第十一批）：
 *   每条红因统一印成「  ✗ 门禁 Jx：…」，可卸开关 `Jx_ON` 真的被 fail() 消费。
 *   本文件原先的 fail(msg) **没有编号参数**，43 处红因里只有 9 处在正文里
 *   手写了 "J10" 这样的字样 ⇒ 编号只活在注释与文案里，没有一处是结构化归属；
 *   而文件头声称 J1–J11，实现里 J3 又与 J4 合并成一段、那两条红因都没标编号
 *   ⇒ 编号体系与实现对不上。现在 J0（块可解析）与 J3（归属链）补齐，
 *   并新增 J12（逐比较点覆盖度自证）。
 *
 * 判据（编号 J*，与 verify-site.cjs 的数字编号、check-a11y.cjs 的 A*、
 *       check-wrapping.cjs 的 W*、check-gates-wired.cjs 的 GW* 都不续接）：
 *   J0 每个 ld+json 块本身必须是**合法 JSON**（解析失败直接判红，
 *      不许静默跳过 —— 跳过的话"块坏了"会伪装成"这一页没有实体"，
 *      报错信息会指向错误的病根）
 *   J1 每个非错误页都声明**恰好一个** WebSite 节点，且：
 *      · @id 恒为 <站点根>/#website
 *      · url 恒为 <站点根>/
 *   J2 每个非错误页都声明**恰好一个**页面实体（WebPage / ProfilePage），且：
 *      · @id 恒为 <该页 canonical>#webpage
 *      · url **逐字等于**该页 <link rel="canonical"> 的 href
 *   J3 归属链完整：页面实体的 isPartOf → WebSite 的 @id；
 *      WebSite 的 publisher → "本人"的 @id（与该页 Person 节点同一个）
 *      （"本人"这个 @id 只能有**一个**来源：该页的 Person 声明）
 *   J4 mainEntity 能解析，且指向"这一页真正在讲的东西"：
 *      · 作品页（该页自己声明了 @id == 本页 canonical 的作品实体
 *        —— 论文页的 ScholarlyArticle、博客文章页的 BlogPosting）
 *        → 必须指向那个作品实体
 *      · 其余页 → 必须指向本页的 Person 节点
 *      · 无论哪种，被指向的节点都必须在**本页**有声明（不能是空引用）
 *   J5 全站只应有一个站点实体：所有页的 WebSite @id 集合大小必须为 1
 *   J6 错误页不得声明 WebSite / WebPage / ProfilePage
 *      （404 页要表达的是"这里没有内容"；它既不是站点页面，也不是关于
 *        某人的页面。口径与 verify-site 第 16 条一致）
 *   J7 **自证存活**：判据必须真的比过东西——比过 0 页 / 0 处时判红。
 *      （"没报错"和"没问题"长得一模一样：判据一旦被卸掉，门禁会一直绿着，
 *        而产物早就变了。）
 *   J8 **同一个 @id 不得挂在不同的 @type 上**。
 *      实体身份是 @id：同一个 @id 必须只讲**一件事**。若它同时是
 *      "这一页是网站"（WebPage）和"这一页是一篇论文"（ScholarlyArticle），
 *      消费方按 @id 归并节点时两套字段会挤在一起，取到哪套全看遍历顺序。
 *      ⚠️ 判据**必须连嵌套引用一起看**：JSON-LD 语义里
 *      {"@type": "WebPage", "@id": X} 这种引用同样是对节点 X 的类型断言——
 *      只看顶层声明会漏掉本门禁要抓的正是那一类（论文页的
 *      mainEntityOfPage 就是这么写的：它引用的是论文实体自己的 @id，
 *      却顺带声明了另一个 @type）。
 *   J9 **论文的 mainEntityOfPage 必须指向承载它的那一页**，且那个 @id
 *      必须在**本页**有声明（不能是空引用）、也不能是论文实体自己。
 *      修 J8 之前论文页的 mainEntityOfPage 指回论文自己（自指），是个
 *      什么都不说的空转；J9 把它钉到"页面实体"上，并给出一条指名道姓的红因
 *      （J8 只说"有冲突"，J9 说"谁指错了"）。
 *   J10 **页面实体的 @type 必须与该页源文件声明的角色一致**
 *      （`profilePage: true` → ProfilePage，否则 → WebPage）。
 *      J2 只判"恰好一个页面实体"，**从不看它的 @type 是什么**：把关于页的
 *      ProfilePage 改成 WebPage 无人看守 —— 页面照出、JSON-LD 照常合法、
 *      其余门禁全绿，消费方却再也读不出"这是关于某人的页面"。
 *      角色声明的真源是**数据层**（base.njk 读的是裸键 `profilePage`），
 *      门禁回源按 Eleventy 的优先级逐页核对，而不是在门禁里另抄一份
 *      URL 清单。裸键在 Eleventy 里有**三条**合法来源，判据只认其中一条
 *      就会判出**假红**（实测：把 profilePage 挪进 eleventyComputed，
 *      产物是正确的 ProfilePage，门禁却报"声明的是 WebPage"）：
 *        ① 本页 front matter **顶层**            —— 首页 / 关于页用的就是这条
 *        ② 本页 front matter 的 **eleventyComputed** —— 计算结果也进数据层
 *        ③ 沿路径生效的**目录数据文件**（<dir>/<dir>.11tydata.cjs）——
 *           它注入的也是裸键（不是 site.*）
 *      优先级（Eleventy）：目录数据 < front matter < 计算值。
 *      ⚠️ **全局数据（src/_data/*）不是一条路径**：它挂在 site.* 下面，
 *      而模板读的是裸键 —— 两者不是一回事。
 *      另：真值口径必须与模板一致。模板端是**纯 JS 真值**（Nunjucks 的
 *      `{% if %}` 编译成 `if(<expr>)`，它没有自己的真值函数）→ 假的是
 *      false / null / undefined / 0 / ""；**[] / {} / "false" / "no" 都是真**。
 *      判据不能自己"认"字面量：必须**按该字面量所在来源的语义**（front matter
 *      走 gray-matter、eleventyComputed 走 JS、目录数据是已求值的 JS 值）
 *      先求出值，再对值用 JS 真值；求不出就不猜（判红并说清原因）。
 *      产物里的源文件路径由构建期写入（`<!-- source: ... -->`，base.njk），
 *      与 sitemap 的同名标注同一套约定 —— 站点的 permalink 不统一，
 *      从 URL 反推源文件不可靠。
 *   J11 **论文页自己的 ScholarlyArticle 必须有 image 与 dateModified**。
 *      缺这两个字段**不会报错**：页面照常渲染、JSON-LD 照常合法、
 *      其余门禁全绿，只是消费方拿到的作品条目"无图、无时效信号"。
 *      · image 必须**逐字等于**该页第一个 og:image 的 URL（社交平台只认
 *        第一张；结构化数据里的图与页面上那张分享图不是同一张 = 图文不符）。
 *      · dateModified 必须等于该页**依赖闭包里最晚的提交时间**
 *        （闭包规则见 scripts/lib/page-deps.cjs：一页的内容由版式 partial、
 *        全局数据、目录数据文件共同决定，只看页面自己的源文件会漏报 ——
 *        D34 的实测：首页渲染的 extremePrecip.json 改了，lastmod 却不动），
 *        且"有/无"与"闭包里有没有已提交的文件"一致（本仓流程是先 build 后
 *        commit，新写的论文页在 build 时还没进历史，就是"没有"这一档）。
 *        取值与 sitemap 的 lastmod 同一数据源（同一个函数），
 *        浅克隆 / 不在 git 仓库里两边同样取不到 → 两边一致，不判有也不判无。
 *   J12 **逐比较点覆盖度自证**：静态目录里登记的每一个比较点，
 *      都必须在"该跑的地方"真的跑到。
 *      ⚠️ 为什么单列一条：J7 的存活自证是**总数**口径
 *        （`comparisons < pagesChecked`），而每一页本来就贡献 3–5 处比较
 *        ⇒ **整段判据被摘掉**时，剩下的比较点照样把总数撑过页数
 *        ⇒ J7 照样绿 ⇒ "整块被摘"无人看守。J12 改成**逐页逐比较点**：
 *        每个非错误页都逐个点名它该跑哪些比较点，跑过或前提不在场（豁免）
 *        都要有记录，缺一个就判红。
 *      ⚠️ 比较点目录必须**静态登记**：运行时拼出来的键在源码里查不到落点
 *        ⇒ 整块判据被摘掉时它连同自己的比较点一起消失 ⇒ 自证被自己拆掉。
 *      ⚠️ 判据被卸掉（开关关）⇒ 它的比较点不算缺失，否则"卸判据"永远转不了绿。
 *   J13 **作品实体（BlogPosting）必须完整，且与页面上人能看到的东西逐字一致**。
 *      背景（2026-10-24；缺陷清单 D94）：论文页早就有完整的作品实体
 *      （ScholarlyArticle），博客文章页此前**一个作品节点都没有** ——
 *      结构化数据里只有"这一页是网站"与"这一页在讲本人"，站点自己的文章
 *      在机器眼里不是一篇文章。缺了它**不会报错**：页面照出、JSON-LD 照常
 *      合法、其它门禁全绿，只有逐个节点读才知道少了这一层。
 *      · 源文件声明了 `structuredType`（数据层的三条路径，与 J10 同一套）
 *        的页面 ⇒ 产物里必须**恰好一个**该类型的实体；
 *      · 没有声明的页面 ⇒ 产物里**不得出现** BlogPosting（不许漏出去）；
 *      · 那个实体的字段必须与页面所见**逐字一致**：
 *        @id / url = 该页 canonical；headline = 页面 h1；
 *        description = 该页 meta description；datePublished = 页面 <time>；
 *        author = 本页的"本人" @id；mainEntityOfPage = 本页页面实体。
 *      ⚠️ 逐字比较前必须**解 HTML 实体**：meta 与 h1 里的撇号是 `&#39;`，
 *        JSON-LD 里是原字符 —— 不解码就会把同一句话判成两句。
 *
 * 与既有门禁的关系（**刻意不重复**）：
 *   · verify-site 第 2 条查 JSON-LD 能否 JSON.parse → 本门禁不查解析本身，
 *     只用解析结果；但**解析失败时本门禁直接判红**（不静默跳过），否则
 *     "块坏了"会伪装成"没找到实体"。
 *   · verify-site 第 10 条查 @id/url 是否绝对地址；第 12 条查本人 @id 唯一；
 *     第 19 条查作品 @id 全站一致；第 27 条查本人节点姓名；第 31 条查同一
 *     @id 的同名字段不漂移 —— 那些查的是**已声明实体之间的一致性**。
 *     本门禁查的是**这一层是否存在，以及它与页面的归属链是否接得上**。
 *
 * 用法：node scripts/check-jsonld.cjs   （有错 exit 1）
 *      SITE_DIR=/tmp/xxx 可把产物目录指到别处（故障注入用）。
 */
const fs = require("fs");
const path = require("path");
const matter = require("gray-matter"); // Eleventy 自己用的 front matter 解析器（J10 求值用）
// ⚠️ 这里原先还 import 了 execFileSync 与 git-error.cjs 的 degradeOrThrow ——
//   它们只服务于本文件自己那份 git 查询（gitTop / gitIsShallow / gitCommitTime）。
//   D34 起 git 查询与"闭包最晚提交时间"的算法都搬进 scripts/lib/page-deps.cjs，
//   那三个函数已删除 ⇒ 这两个 import 变成没人用的（留着只会让人误以为
//   "判不出来要抛"这件事在本文件里还有一份判据）。抛的语义现在在
//   page-deps.cjs → git-error.cjs 那一条链上，全站只有一份。

const SITE = process.env.SITE_DIR
  ? path.resolve(process.env.SITE_DIR)
  : path.resolve(__dirname, "../_site");
const ROOT = path.resolve(__dirname, ".."); // 仓库根：J10 要回源文件核对页面角色
const problems = [];
const notes = [];

/* ---------- 判据编号与可卸开关 ----------
   编号是「红因归属」的唯一坐标：红因统一印成「门禁 Jx：…」，
   自测按这个编号断言"哪条判据在说话"（多一条、少一条都算失败）。
   ⚠️ 2026-10-22（D59 第十一批）实测修：本文件原先的 fail(msg) **没有编号参数**，
      43 处红因里只有 9 处在正文里手写了"J10"/"J9"这样的字样 ⇒ 编号只活在注释与
      文案里，没有一处是**结构化归属**。而文件头声称 J1–J11，实现里 J3 又与 J4
      合并成一段、且那两条红因都没标编号 ⇒ 编号体系与实现对不上。
   ⚠️ 开关必须**真的被 fail() 消费**：声明了却没人看的开关等于没有开关
      （那样自测的负对照永远不成立 —— 红还在，"卸掉判据就转绿"证明不了什么）。 */
const J0_ON = true; // ld+json 块本身必须是合法 JSON
const J1_ON = true; // 每页恰好一个 WebSite 实体，且 @id / url 口径固定
const J2_ON = true; // 每页恰好一个页面实体，且与 canonical 对得上
const J3_ON = true; // 归属链完整（isPartOf → WebSite、publisher → Person）
const J4_ON = true; // mainEntity 指向本页真正在讲的东西
const J5_ON = true; // 全站只有一个站点实体
const J6_ON = true; // 错误页不得声明这三类实体
const J7_ON = true; // 自证存活
const J8_ON = true; // 同一个 @id 不得挂在不同的 @type 上
const J9_ON = true; // 论文 mainEntityOfPage 指向承载它的那一页
const J10_ON = true; // 页面 @type 与源文件声明的角色一致
const J11_ON = true; // 论文页 ScholarlyArticle 必须有 image 与 dateModified
const J12_ON = true; // 逐比较点覆盖度自证
const J13_ON = true; // 作品实体（BlogPosting）必须完整且与页面所见一致

const SWITCH_ON = {
  J0: J0_ON,
  J1: J1_ON,
  J2: J2_ON,
  J3: J3_ON,
  J4: J4_ON,
  J5: J5_ON,
  J6: J6_ON,
  J7: J7_ON,
  J8: J8_ON,
  J9: J9_ON,
  J10: J10_ON,
  J11: J11_ON,
  J12: J12_ON,
  J13: J13_ON,
};

/* 开关关 ⇒ 这条判据不说话（**计算照做**，不短路）——
   这样"卸掉一条判据"不会连带改变其它判据拿到的输入，负对照才成立。 */
const fail = (id, msg) => {
  if (SWITCH_ON[id] === false) return;
  problems.push(`门禁 ${id}：${msg}`);
};
const note = (msg) => notes.push(msg);

/* ---------- 逐比较点覆盖度目录（**静态登记**）----------
   每个「该被比对过」的位置都记一笔（mark），静态目录里每个比较点都必须被记到。

   ⚠️ 为什么要有这一层（2026-10-22 实测）：
     本文件原先的 J7 自证是 `comparisons < pagesChecked` —— **总数**口径。
     每一页本来就贡献 3–5 处比较，所以**整段判据被摘掉**时，剩下的比较点照样把
     总数撑过页数 ⇒ J7 照样绿 ⇒ "整块被摘"无人看守。总数自证抓不住这一类退化。

   ⚠️ 目录必须**静态登记**：运行时拼出来的键在源码里查不到落点 ⇒ 整块判据被摘掉时
     它连同自己的比较点一起消失 ⇒ 覆盖度自证反而判绿 ⇒ 自证被自己拆掉。

   everyPage = true 的比较点：**每个非错误页**都必须真的跑到（逐页逐比较点）。
   min = 该比较点至少要被记到几次（全站级比较点的下限）。 */
const COVERAGE_POINTS = [
  { key: "J0.blocks", min: 1 }, // 至少遇到过一个 ld+json 块（遇到就记，不是"解析成功"）
  { key: "J1.siteEntity", min: 1, everyPage: true }, // 每页都数了 WebSite 实体个数
  { key: "J1.siteId", min: 1, everyPage: true }, // 每页都比了 WebSite 的 @id
  { key: "J1.siteUrl", min: 1, everyPage: true }, // 每页都比了 WebSite 的 url
  { key: "J2.pageEntity", min: 1, everyPage: true }, // 每页都数了页面实体个数
  { key: "J2.pageUrl", min: 1, everyPage: true }, // 每页都比了页面实体的 url
  { key: "J2.pageId", min: 1, everyPage: true }, // 每页都比了页面实体的 @id
  { key: "J3.personEntity", min: 1, everyPage: true }, // 每页都数了 Person 实体个数
  { key: "J3.isPartOf", min: 1, everyPage: true }, // 每页都比了 isPartOf
  { key: "J3.publisher", min: 1, everyPage: true }, // 每页都比了 publisher
  { key: "J4.mainEntity", min: 1, everyPage: true }, // 每页都取了 mainEntity
  { key: "J4.mainEntityDecl", min: 1 }, // mainEntity 的"空引用"检查至少跑过一次
  { key: "J5.siteUnique", min: 1 }, // 全站站点唯一性至少判过一次
  { key: "J6.errorPage", min: 1 }, // 错误页至少判过一次
  { key: "J7.selfAlive", min: 1 }, // 自证存活段至少判过一次
  { key: "J8.typedIds", min: 1 }, // 全站 @id→@type 表至少建过一次
  { key: "J9.mainEntityOfPage", min: 1 }, // 至少比过一个论文的 mainEntityOfPage
  { key: "J10.sourceMark", min: 1, everyPage: true }, // 每页都读了 source 标注
  { key: "J10.roleResolve", min: 1, everyPage: true }, // 每页都解析了角色声明
  { key: "J10.roleType", min: 1, everyPage: true }, // 每页都比了角色与 @type
  { key: "J11.paperPage", min: 1 }, // 至少有一页论文实体对上了本页 canonical
  { key: "J11.image", min: 1 }, // 至少逐字比过一次 image 与 og:image
  { key: "J11.dateModified", min: 1 }, // 至少逐字比过一次 dateModified
  { key: "J13.declaredType", min: 1, everyPage: true }, // 每页都解析了源文件声明的结构化类型
  { key: "J13.entityCount", min: 1, everyPage: true }, // 每页都数了该类型的实体个数
  { key: "J13.id", min: 1 }, // 至少逐字比过一次作品实体的 @id / url
  { key: "J13.headline", min: 1 }, // 至少逐字比过一次 headline 与页面 h1
  { key: "J13.description", min: 1 }, // 至少逐字比过一次 description 与 meta description
  { key: "J13.datePublished", min: 1 }, // 至少逐字比过一次 datePublished 与页面 <time>
  { key: "J13.author", min: 1 }, // 至少逐字比过一次 author 与本人节点的 @id
  { key: "J13.mainEntityOfPage", min: 1 }, // 至少逐字比过一次 mainEntityOfPage 与本页页面实体
];

/* 逐页记账：页标识 -> 该页真正跑过的比较点。
   （"*" 是全站级比较点的页标识。） */
const pageHits = new Map();
const pageWaived = new Map();
const globalWaived = new Set();
const waivedKeys = new Set();
const hitCount = Object.create(null);

const marksOf = (page) => {
  let s = pageHits.get(page);
  if (!s) {
    s = new Set();
    pageHits.set(page, s);
  }
  return s;
};
const waivesOf = (page) => {
  let s = pageWaived.get(page);
  if (!s) {
    s = new Set();
    pageWaived.set(page, s);
  }
  return s;
};
/* 记一笔：这一步真的比对过了（结论是红是绿都算"跑过"）。 */
const mark = (key, page) => {
  marksOf(page).add(key);
  hitCount[key] = (hitCount[key] || 0) + 1;
};
/* 豁免：这一步的前提不在场（无判断对象），不算"没跑到"。 */
const waive = (key, page) => {
  if (page === null || page === undefined) globalWaived.add(key);
  else waivesOf(page).add(key);
  waivedKeys.add(key);
};
const waivePrefix = (prefix, page) => {
  for (const p of COVERAGE_POINTS) if (p.key.startsWith(prefix)) waive(p.key, page);
};
/* 比较点归哪条判据：key 的第一段就是判据编号（J0./J1./…/J12.）。 */
const ownerOf = (key) => key.split(".")[0];

/* 站点公开地址（site.url）——@id 口径的唯一基准。
   ⚠️ 读不到就直接判红，**不跳过**：site.url 空了以后下面每一条 @id 判据
   都变成"和空串比"，会一路绿灯通过——那叫门禁自己被卸掉，不叫没问题。 */
let SITE_URL = "";
try {
  const siteData = require(path.resolve(__dirname, "../src/_data/site.js"));
  SITE_URL = (siteData.url || "").replace(/\/+$/, "");
} catch {
  /* 下面统一判红 */
}
if (!SITE_URL) {
  console.error("✗ 读不到 site.url（src/_data/site.js），本门禁无法判定 @id 口径。");
  process.exit(1);
}

if (!fs.existsSync(SITE)) {
  console.error(`✗ 找不到产物目录 ${SITE}，请先运行 npm run build`);
  process.exit(1);
}

/* ---------- 收集产物页面 ---------- */
const allFiles = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else allFiles.push(p);
  }
})(SITE);

const rel = (f) => path.relative(SITE, f);
// exFAT 卷上 macOS 会留 AppleDouble 资源叉（._foo.html），它同样以 .html 结尾。
const htmlFiles = allFiles.filter(
  (f) => f.endsWith(".html") && !path.basename(f).startsWith("._")
);

/* ---------- JSON-LD 工具 ---------- */

/** "@type" 可以是字符串，也可以是字符串数组（多类型实体）。
    只认字符串的话，数组型 @type 会被整条判据静默跳过——那是"判据自己
    被卸掉"，与删掉断言标注同族。 */
function typesOf(node) {
  const raw = node["@type"];
  if (typeof raw === "string") return raw.trim() ? [raw.trim()] : [];
  if (Array.isArray(raw)) {
    return raw.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim());
  }
  return [];
}

/** 一份 ld+json 块里"声明"的节点（不是嵌套引用）。
    · 顶层是 @graph 数组 → 数组的每一项是声明
    · 顶层是带 @type 的对象 → 它本身是声明
    其余（嵌套对象）一律当引用处理——引用没有 @type，不参与实体判定。 */
function declarationsOf(parsed) {
  if (!parsed || typeof parsed !== "object") return [];
  if (Array.isArray(parsed["@graph"])) {
    return parsed["@graph"].filter((n) => n && typeof n === "object");
  }
  if (typesOf(parsed).length) return [parsed];
  return [];
}

/** 递归收集一个 ld+json 块里所有"既有 @id 又有 @type"的对象。
    ⚠️ 嵌套对象**也要收**：JSON-LD 语义里 {"@type": "WebPage", "@id": X}
    这种引用同样是对节点 X 的类型断言——消费方按 @id 归并时，声明里的
    @type 与引用里的 @type 会合到一起。只看顶层声明，恰好会漏掉
    J8 要抓的那一类冲突（论文页 mainEntityOfPage 就是这么写的）。
    纯裸引用（{"@id": X}，没有 @type）不贡献类型，不影响判定。 */
function typedNodes(parsed) {
  const out = [];
  (function scan(n) {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) {
      n.forEach(scan);
      return;
    }
    const t = typesOf(n);
    if (typeof n["@id"] === "string" && n["@id"] && t.length) {
      out.push({
        id: n["@id"],
        typeKey: t.slice().sort().join("+"),
        types: t.join(" / "),
      });
    }
    for (const v of Object.values(n)) scan(v);
  })(parsed);
  return out;
}

/** 取一条 <link> 的属性值。rel 可能有多个 token（rel="canonical" 之外还可能
    带别的），所以按 token 判，不做整串相等。 */
function linkAttr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i"));
  return m ? m[1] : "";
}

/** 该页的 canonical href。属性顺序不固定（rel 在前或 href 在前都可能），
    所以逐个 <link> 标签看，不写死一个正则顺序。 */
function canonicalOf(html) {
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rels = linkAttr(tag, "rel").split(/\s+/).filter(Boolean);
    if (!rels.includes("canonical")) continue;
    const href = linkAttr(tag, "href");
    if (href) return href;
  }
  return "";
}

/** 该页的源文件标注（构建期由 base.njk 写入：<!-- source: src/xxx.njk -->）。
    与 sitemap 里的同名标注同一套约定。 */
function sourceOf(html) {
  const m = html.match(/<!--\s*source:\s*([^>]*?)\s*-->/);
  return m ? m[1].trim() : "";
}

/** 该页**第一个** og:image 的 URL（J11 用）。
    社交平台只认第一张，所以"这一页的 og:image"指的就是它。
    属性顺序不固定，逐个 <meta> 标签看，不写死一个正则顺序。 */
function ogImageOf(html) {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    if (linkAttr(tag, "property").toLowerCase() !== "og:image") continue;
    const content = linkAttr(tag, "content");
    if (content) return content;
  }
  return "";
}

/* ---------- J11 需要"这一页内容真实的最后改变时间" ----------
   与 verify-site.cjs 第 18 条（sitemap 的 lastmod）**同一套判据、同一份数据源**：
   两者回答的是同一个问题——「这个 URL 的内容最后一次真的变过是什么时候」。

   ⚠️ 口径在 D34（2026-10-21）改过一次：原先取「该页**源文件自身**的最后提交
   时间」，但页面内容常常由别的文件提供（版式 partial、全局数据、目录数据
   文件）——那些文件一改，页面内容就变了，时间戳却原地不动。
   现在取「**依赖闭包里最晚的提交时间**」（闭包规则见 scripts/lib/page-deps.cjs）。

   ⚠️ 这里原先**自己**抄了一份 git 查询（gitTop / gitIsShallow / gitCommitTime）。
      同一件事抄三份（eleventy / verify-site / 这里）意味着抄错一处就静默漏报，
      而这三处恰恰必须一致 —— 它们一起决定"门禁到底有没有真的核对过时间戳"。
      现在三处都从 page-deps.cjs 取，口径只有一份。

   浅克隆里 `git log -1 -- <file>` 只能查到 HEAD 那一次，查出来的值
   「看起来像提交时间、其实是 checkout 时间」⇒ 与 eleventy 的 lastCommitTime
   filter **同样地**：浅克隆一律不给。 */
const { expectedLastmod } = require("./lib/page-deps.cjs");

/* ---------- 角色声明的解析（真值口径 + 数据层）---------- */

/**
 * 模板端的真值口径：**纯 JavaScript 真值**。
 *
 *   Nunjucks 的 `{% if %}` 编译成 `if(<expr>)` —— 见 nunjucks/src/compiler.js:496
 *   的 `this._emit('if(')`。Nunjucks **没有自己的真值函数**（runtime.js 里只有
 *   suppressValue，没有 isTruthy）。所以模板端的真假就是 JS 的真假：
 *     · `0` / `0.0` / `""` / `null` / `undefined`  → 假
 *     · `[]` / `{}` / `"false"` / `"0"` / `"no"`   → **真**（对象 / 非空字符串）
 *
 *   ⚠️ 这里踩过的两个坑（都判出过**假红**）：
 *     ① 旧口径只认 ["false","no","off","null","~"]，**漏了 0** ——
 *        `profilePage: 0` 模板里是假（→ WebPage），门禁却当真（→ ProfilePage）。
 *     ② 旧口径把 `[]` `{}` `no` `off` 当**假** —— 与模板**相反**：
 *        `profilePage: []` 产物实测是 ProfilePage（空数组是对象，JS 里为真），
 *        门禁却判它 WebPage；`profilePage: no` 产物是 ProfilePage
 *        （YAML 1.1 的 no 布尔别名在 js-yaml 里**不成立**，它是字符串）。
 *     假红比漏报更坏：它把人引去改一处本来正确的东西。
 *
 *   → 结论：判据**不能自己"认"字面量**，必须**按该字面量所在来源的语义**
 *     先求出值，再对那个值用 JS 真值。求不出值就不猜（判红并说清原因）。
 */
function jsTruthy(value) {
  return Boolean(value);
}

/**
 * front matter 里的字面量 → 值。
 *   用 **gray-matter**（Eleventy 自己用的 front matter 解析器：
 *   @11ty/eleventy/src/TemplateContent.js:4 `import matter from "gray-matter"`；
 *   gray-matter/lib/engines.js 的 yaml 引擎是 `yaml.safeLoad`）求值，
 *   保证与 Eleventy 解析出来的值**逐值一致**。
 *   解析失败 → 判据求不出真假 → 交给调用方判红，不猜。
 */
function valueFromFrontMatter(raw, key = "profilePage") {
  try {
    const doc = matter("---\n" + key + ": " + raw + "\n---\n");
    if (!doc.data || !Object.prototype.hasOwnProperty.call(doc.data, key)) {
      return { ok: false, reason: `解析出来的 front matter 里没有 ${key} 这一项` };
    }
    return { ok: true, value: doc.data[key] };
  } catch (e) {
    return { ok: false, reason: `YAML 解析失败（${String(e.message).split("\n")[0]}）` };
  }
}

/**
 * eleventyComputed 里的字面量 → 值。
 *   那个块里写的是 **JavaScript 表达式**（不是 YAML），所以按 JS 语义求值。
 *   求不出（引用了别处、含模板表达式、语法错）→ 判据求不出真假 → 交给调用方判红。
 *   ⚠️ 这里求值的是**仓库自己源码里的字面量**，信任级别与下面
 *      `require()` 目录数据文件、以及 Eleventy 构建时执行这段代码完全相同。
 */
function valueFromComputed(raw) {
  try {
    const value = new Function("return (" + raw + ");")(); // eslint-disable-line no-new-func
    return { ok: true, value };
  } catch (e) {
    return { ok: false, reason: `JavaScript 求值失败（${String(e.message).split("\n")[0]}）` };
  }
}

/**
 * 解析出"角色声明"的结果：raw（原样字面量，红因要印它）+ value（求出来的值）。
 *   evaluable=false 时带 reason（说清为什么求不出）。
 */
function roleResult(raw, where, kind, evaluator) {
  // 模板表达式（{{ }} / {% %} / {# #}）必须**先**拦下来：
  // YAML 会把 `{{ x }}` 解析成一个**嵌套流映射**（不报错），
  // 那样就"求出了值"，却是模板里根本没有的那个值。
  if (/[{][{%#]/.test(raw)) {
    return {
      raw,
      where,
      kind,
      evaluable: false,
      reason: "这一项里含模板表达式（{{ }} / {% %} / {# #}），判据求不出它的真假",
    };
  }
  const r = evaluator(raw);
  if (!r.ok) return { raw, where, kind, evaluable: false, reason: r.reason };
  return { raw, where, kind, evaluable: true, value: r.value };
}

/** 去掉 YAML 行尾注释：# 前要有空白，且不在引号里。 */
function stripYamlComment(v) {
  let quote = "";
  for (let i = 0; i < v.length; i++) {
    const c = v[i];
    if (quote) {
      if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === "#" && (i === 0 || /\s/.test(v[i - 1]))) return v.slice(0, i);
  }
  return v;
}

/** 源文件 front matter 原文（没有 front matter 返回 null）。 */
function frontMatterOf(file) {
  const text = fs.readFileSync(file, "utf8");
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1] : null;
}

/** front matter 里某个键的**原样字面量**（找不到返回 null）。
 *    computed=true 时只找 eleventyComputed 块里的同名键。
 *    缩进块里的注释行要先排除（`  # profilePage: true` 不是声明）。 */
function scalarIn(block, key, computed = false) {
  const lines = block.split(/\r?\n/);
  const keyRe = new RegExp("^" + (computed ? "\\s+" : "") + key + "\\s*:");
  let hit = null;
  if (computed) {
    const start = lines.findIndex((l) => /^eleventyComputed\s*:/.test(l));
    if (start < 0) return null;
    for (let i = start + 1; i < lines.length; i++) {
      const l = lines[i];
      // 下一个**顶层键** → 块结束（顶层注释行不算，它不以 # 开头却是缩进的）
      if (/^[A-Za-z_][\w-]*\s*:/.test(l)) break;
      if (l.trim().startsWith("#")) continue;
      if (keyRe.test(l)) {
        hit = l;
        break;
      }
    }
  } else {
    hit = lines.find((l) => keyRe.test(l)) || null;
  }
  if (!hit) return null;
  return stripYamlComment(hit.slice(hit.indexOf(":") + 1)).trim();
}

/** 沿页面源文件路径向上找生效的目录数据文件（外层在前，内层覆盖外层）。 */
function directoryDataChain(file) {
  const chain = [];
  let dir = path.dirname(path.resolve(file));
  while (dir.startsWith(ROOT + path.sep)) {
    const base = path.basename(dir);
    for (const ext of [".11tydata.cjs", ".11tydata.js", ".11tydata.mjs"]) {
      const p = path.join(dir, base + ext);
      if (fs.existsSync(p)) {
        chain.push(p);
        break;
      }
    }
    dir = path.dirname(dir);
  }
  return chain.reverse();
}

/** 该页的"角色声明"（profilePage 开关）——按 Eleventy 的**数据层**找。
 *
 *  返回 { raw, where, kind, evaluable, error }
 *    raw       —— 源文件里的**原样字面量**（红因要印它，不能印算出来的布尔）
 *    where     —— 声明所在文件（仓库相对路径）
 *    kind      —— front-matter / computed / directory-data / none
 *    evaluable —— 该字面量能否被静态求值（含 {{ }} 的模板表达式不能）
 *    error     —— 非空表示"读不出来"（目录数据文件 require 失败）
 *
 *  ⚠️ 为什么不能只看 front matter 顶层（JP 的实测）：
 *    模板读的是**裸键** `profilePage`（base.njk:449），裸键在 Eleventy 里
 *    有三条合法来源。判据只认其中一条 → 合法写法被判红（假红），
 *    而假红会把人引到"改掉一处本来正确的东西"上去。 */
function resolveDeclaredRole(file) {
  const block = frontMatterOf(file);
  if (block !== null) {
    // ② eleventyComputed 的优先级高于 front matter 顶层（Eleventy：计算值最后合入）
    const computed = scalarIn(block, "profilePage", true);
    if (computed !== null) {
      return roleResult(computed, path.relative(ROOT, file), "computed", valueFromComputed);
    }
    const top = scalarIn(block, "profilePage");
    if (top !== null) {
      return roleResult(top, path.relative(ROOT, file), "front-matter", valueFromFrontMatter);
    }
  }
  // ③ 目录数据文件（裸键，优先级最低）
  for (const p of directoryDataChain(file)) {
    let mod;
    try {
      mod = require(p);
    } catch (e) {
      return {
        raw: "",
        where: path.relative(ROOT, p),
        kind: "directory-data",
        evaluable: false,
        reason: `读不出目录数据文件（${e.message}）`,
      };
    }
    let raw = null;
    if (mod && Object.prototype.hasOwnProperty.call(mod, "profilePage")) {
      raw = mod.profilePage;
    } else if (
      mod &&
      mod.eleventyComputed &&
      Object.prototype.hasOwnProperty.call(mod.eleventyComputed, "profilePage")
    ) {
      raw = mod.eleventyComputed.profilePage;
    }
    if (raw !== null) {
      // 目录数据文件是**已经求过值的 JS 值** → 直接对它用 JS 真值，
      // 不用再解析字面量（也省掉"字面量写法千奇百怪"这一类问题）。
      return {
        raw: String(raw),
        where: path.relative(ROOT, p),
        kind: "directory-data",
        evaluable: true,
        value: raw,
      };
    }
  }
  // 没有这一项 → 按约定视为 WebPage（假）
  return { raw: "", where: path.relative(ROOT, file), kind: "none", evaluable: true, value: false };
}

/* ---------- 作品实体（J4 与 J13 共用）---------- */

/** "作品实体"类型集合：**这一页自己产出**的东西。
    ⚠️ 为什么 Dataset / SoftwareSourceCode 不在里面：
      它们是作品的**附属物**（这份数据、这份代码），不是"这一页在讲的作品"；
      论文页里的 SoftwareSourceCode 节点的 @id 也不是页面 URL。 */
const WORK_TYPES = new Set([
  "Article",
  "BlogPosting",
  "NewsArticle",
  "ScholarlyArticle",
  "ScholarlyChapter",
  "TechArticle",
  "Review",
  "CreativeWork",
]);

/** 解 HTML 实体。
    ⚠️ meta 标签与 h1 里的撇号是 `&#39;`，JSON-LD 里是原字符 ——
      不解码就会把同一句话判成两句。`&amp;` 必须**最后**解，
      否则 `&amp;#39;` 这类会被解两次。 */
function decodeEntities(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/** 该页的 meta description（name="description" 的那一个）。 */
function metaDescriptionOf(html) {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    if (linkAttr(tag, "name").toLowerCase() !== "description") continue;
    const content = linkAttr(tag, "content");
    if (content) return decodeEntities(content);
  }
  return "";
}

/** 该页**第一个** h1 的文字（剥标签、解实体、压空白）。
    页面里若有多个 h1，取第一个 —— 首屏那个才是这一页的标题。 */
function h1TextOf(html) {
  const m = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (!m) return "";
  return decodeEntities(m[1].replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

/** 该页**第一个** <time datetime="..."> 的日期值。 */
function timeDateOf(html) {
  const m = html.match(/<time\b[^>]*\bdatetime\s*=\s*"([^"]*)"/i);
  return m ? m[1].trim() : "";
}

/**
 * 源文件声明的"结构化类型"（裸键 `structuredType`）——与 J10 的角色声明
 * **同一套数据层**（front matter 顶层 / eleventyComputed / 目录数据文件）。
 *
 *  ⚠️ 为什么不按 URL 硬编码"哪些页该是 BlogPosting"：
 *    路由一改，硬编码就会静默失配（判红的是无关的页，或漏掉新加的页）。
 *    真源由模板端决定（detail.njk 读裸键 `structuredType`），门禁回源核对。
 *
 *  返回 { raw, where, kind, evaluable, value }（与角色声明同一套形状）：
 *    value —— 声明的类型名（字符串）；kind = "none" 时 value = null。
 */
function resolveDeclaredStructuredType(file) {
  const block = frontMatterOf(file);
  if (block !== null) {
    const computed = scalarIn(block, "structuredType", true);
    if (computed !== null) {
      return roleResult(computed, path.relative(ROOT, file), "computed", valueFromComputed);
    }
    const top = scalarIn(block, "structuredType");
    if (top !== null) {
      return roleResult(
        top,
        path.relative(ROOT, file),
        "front-matter",
        (raw) => valueFromFrontMatter(raw, "structuredType")
      );
    }
  }
  for (const p of directoryDataChain(file)) {
    let mod;
    try {
      mod = require(p);
    } catch (e) {
      return {
        raw: "",
        where: path.relative(ROOT, p),
        kind: "directory-data",
        evaluable: false,
        reason: `读不出目录数据文件（${e.message}）`,
      };
    }
    let raw = null;
    if (mod && Object.prototype.hasOwnProperty.call(mod, "structuredType")) {
      raw = mod.structuredType;
    } else if (
      mod &&
      mod.eleventyComputed &&
      Object.prototype.hasOwnProperty.call(mod.eleventyComputed, "structuredType")
    ) {
      raw = mod.eleventyComputed.structuredType;
    }
    if (raw !== null) {
      // 目录数据文件是**已经求过值的 JS 值** → 直接用它，不必再解析字面量。
      return {
        raw: String(raw),
        where: path.relative(ROOT, p),
        kind: "directory-data",
        evaluable: true,
        value: raw,
      };
    }
  }
  return { raw: "", where: path.relative(ROOT, file), kind: "none", evaluable: true, value: null };
}

/* ---------- 逐页检查 ---------- */
let pagesChecked = 0;
let errorPagesChecked = 0;
let pageEntitiesFound = 0;
let j9Compared = 0; // J9 真正比过的论文数
/* 非错误页清单（逐页逐比较点覆盖度自证用）。 */
const nonErrorPages = [];
/* "比较处数"由**逐页命中数**派生，不再单独维护一个总数计数器。
   ⚠️ 原先那是一个**总数**口径（每页 3–5 处）：整段判据被摘掉时，剩下的比较点
      照样把总数撑过页数 ⇒ J7 的 `comparisons < pagesChecked` 照样绿
      ⇒ "整块被摘"无人看守。强自证交给 J12（逐页逐比较点目录）。 */
const comparisons = () => {
  let n = 0;
  for (const s of pageHits.values()) n += s.size;
  return n;
};
let j8Ids = 0; // J8 真正看过的 @id 个数
let j10Compared = 0; // J10 真正核对过角色的页数
let j10ProfilePages = 0; // J10 里声明为 ProfilePage 的页数
let j10Declared = 0; // J10 里真的找到"角色声明"的页数（自证：解析确实跑过）
let j11Compared = 0; // J11 真正核对过的论文页数
let j11ImageCompared = 0; // J11 里 image 真正逐字比过的次数
let j11ModifiedCompared = 0; // J11 里 dateModified 真正逐字比过的次数（源文件已提交）
let j13Compared = 0; // J13 里真正逐字核对过字段的作品实体个数
const j10Kinds = {}; // 角色声明来自哪条数据层路径（front-matter / computed / directory-data / none）
const websiteIds = new Set();
// J8 的全站口径：@id → (@type 组合 → 出现在哪些页)
const siteTypeUse = new Map();

for (const file of htmlFiles) {
  const from = rel(file);
  const html = fs.readFileSync(file, "utf8");
  const isErrorPage = path.basename(file) === "404.html";

  /* 1) 取出全部 ld+json 块并解析。
        解析失败**在这里判红**（不静默跳过）：否则"块坏了"会伪装成
        "这一页没有 WebSite 节点"，报错信息会指向错误的病根。 */
  const declarations = [];
  const typed = []; // J8 用：所有"带 @id 且带 @type"的出现处（含嵌套引用）
  for (const m of html.matchAll(
    /<script[^>]*type\s*=\s*"application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
  )) {
    let parsed = null;
    mark("J0.blocks", from); // ← 遇到块就记（"这一步执行过"，不是"解析成功"）
    try {
      parsed = JSON.parse(m[1]);
    } catch (e) {
      fail(
        "J0",
        `${from}: JSON-LD 块解析失败 —— ${e.message}（解析本身由 verify-site 第 2 条负责，这里直接判红以免被当成"实体缺失"）`
      );
      continue;
    }
    declarations.push(...declarationsOf(parsed));
    typed.push(...typedNodes(parsed));
  }

  const websites = declarations.filter((n) => typesOf(n).includes("WebSite"));
  const pageNodes = declarations.filter((n) =>
    typesOf(n).some((t) => t === "WebPage" || t === "ProfilePage")
  );
  const persons = declarations.filter((n) => typesOf(n).includes("Person"));
  const articles = declarations.filter((n) => typesOf(n).includes("ScholarlyArticle"));

  /* ---- J6：错误页不得声明这一层 ---- */
  if (isErrorPage) {
    errorPagesChecked++;
    mark("J6.errorPage", from);
    if (websites.length) {
      fail(
        "J6",
        `${from}: 错误页声明了 WebSite 实体 —— 404 页要表达的是"这里没有内容"，它不是一个站点页面`
      );
    }
    if (pageNodes.length) {
      fail(
        "J6",
        `${from}: 错误页声明了页面实体（${pageNodes
          .map((n) => typesOf(n).join("/"))
          .join(" / ")}）—— 404 页不是"关于某人的页面"`
      );
    }
    continue;
  }

  pagesChecked++;
  nonErrorPages.push(from);
  const canonical = canonicalOf(html);

  /* ---- J1：恰好一个 WebSite 节点，且口径固定 ---- */
  mark("J1.siteEntity", from);
  if (websites.length !== 1) {
    fail(
      "J1",
      `${from}: WebSite 实体必须**恰好一个**，实际 ${websites.length} 个` +
        `（缺了 = 站点自己从未被声明；多个 = 消费方会把站点读成好几个）`
    );
    waive("J1.siteId", from);
    waive("J1.siteUrl", from);
  } else {
    const site = websites[0];
    const id = typeof site["@id"] === "string" ? site["@id"] : "";
    const url = typeof site.url === "string" ? site.url : "";
    mark("J1.siteId", from);
    mark("J1.siteUrl", from);
    if (id !== `${SITE_URL}/#website`) {
      fail(
        "J1",
        `${from}: WebSite 的 @id 是 ${JSON.stringify(id)}，应为 ${JSON.stringify(`${SITE_URL}/#website`)}`
      );
    }
    if (url !== `${SITE_URL}/`) {
      fail(
        "J1",
        `${from}: WebSite 的 url 是 ${JSON.stringify(url)}，应为 ${JSON.stringify(`${SITE_URL}/`)}`
      );
    }
    if (id) websiteIds.add(id);
  }

  /* ---- 本人 @id：从该页的 Person 声明里取（不另立一个来源） ---- */
  mark("J3.personEntity", from);
  let personId = "";
  if (persons.length !== 1) {
    fail(
      "J3",
      `${from}: Person 实体必须**恰好一个**（本人），实际 ${persons.length} 个 —— ` +
        `publisher / mainEntity 都要指向它，指不准就等于没接上`
    );
  } else {
    personId = typeof persons[0]["@id"] === "string" ? persons[0]["@id"] : "";
  }

  /* ---- J2：恰好一个页面实体，且与 canonical 对得上 ---- */
  mark("J2.pageEntity", from);
  if (pageNodes.length !== 1) {
    fail(
      "J2",
      `${from}: 页面实体（WebPage / ProfilePage）必须**恰好一个**，实际 ${pageNodes.length} 个` +
        `（缺了 = 消费方拿不到"这一页在讲谁"）`
    );
    waive("J2.pageUrl", from);
    waive("J2.pageId", from);
  } else {
    pageEntitiesFound++;
    const page = pageNodes[0];
    const id = typeof page["@id"] === "string" ? page["@id"] : "";
    const url = typeof page.url === "string" ? page.url : "";
    if (!canonical) {
      fail(
        "J2",
        `${from}: 取不到 canonical，无法核对页面实体的 url —— 页面实体与 canonical 必须指向同一个地址`
      );
      waive("J2.pageUrl", from);
      waive("J2.pageId", from);
    } else {
      mark("J2.pageUrl", from);
      mark("J2.pageId", from);
      if (url !== canonical) {
        fail(
          "J2",
          `${from}: 页面实体的 url 是 ${JSON.stringify(url)}，与该页 canonical ` +
            `${JSON.stringify(canonical)} **不一致** —— 结构化数据说的是另一个地址`
        );
      }
      if (id !== `${canonical}#webpage`) {
        fail(
          "J2",
          `${from}: 页面实体的 @id 是 ${JSON.stringify(id)}，应为 ${JSON.stringify(`${canonical}#webpage`)}`
        );
      }
    }
  }

  /* ---- J10：页面实体的 @type 必须与源文件声明的角色一致 ----
     角色声明的真源是**数据层**（base.njk 按裸键 `profilePage` 选
     ProfilePage / WebPage）。判据回源按 Eleventy 的优先级逐页核对，
     不在门禁里另抄一份 URL 清单 —— 路由一改，清单就会静默失配。 */
  if (pageNodes.length === 1) {
    const page = pageNodes[0];
    const srcRel = sourceOf(html);
    if (!srcRel) {
      fail(
        "J10",
        `${from}: 页面里没有 <!-- source: ... --> 源文件标注 —— 本条判据靠它知道` +
          `这一页的角色（profilePage），标注没了这条判据就失效了` +
          `（base.njk 里那行 <!-- source: ... --> 不能删）`
      );
      waivePrefix("J10.role", from);
      waive("J10.sourceMark", from);
    } else {
      mark("J10.sourceMark", from);
      const srcPath = path.resolve(ROOT, srcRel);
      if (!fs.existsSync(srcPath)) {
        fail(
          "J10",
          `${from}: 源文件标注指向 ${JSON.stringify(srcRel)}，但找不到这个文件 —— ` +
            `判据无从核对这一页的角色`
        );
        waivePrefix("J10.role", from);
      } else {
        j10Compared++;
        mark("J10.roleResolve", from);
        const role = resolveDeclaredRole(srcPath);
        j10Kinds[role.kind] = (j10Kinds[role.kind] || 0) + 1;
        if (role.error) {
          // 读不出来 → 不猜。猜错就是一条假红。
          fail("J10", `${from}: 无法确定这一页的角色声明 —— ${role.error}`);
          waive("J10.roleType", from);
        } else if (!role.evaluable) {
          // 声明求不出真假（含模板表达式、语法错、引用了别处）→ 判据**求不出**。
          // 这里**不猜**：猜错会把合法的写法判成"角色不一致"（假红），
          // 把人引到去改一处本来正确的东西。但也不能静默跳过 ——
          // "没报错"和"没问题"长得一模一样，跳过等于这一页的角色从此无人看守
          // → 明确判红，并说清两条出路。
          fail(
            "J10",
            `${from}: 这一页的角色声明求不出真假（${role.where} 里写的是 ` +
              `profilePage: ${role.raw}）—— ${role.reason}。` +
              `本条判据对这一页无法核对。请把它写成静态的 true / false，` +
              `或同步修改 scripts/check-jsonld.cjs 的角色解析。`
          );
          waive("J10.roleType", from);
        } else {
          const isProfile = jsTruthy(role.value);
          if (isProfile) j10ProfilePages++;
          if (role.raw !== "") j10Declared++;
          const expected = isProfile ? "ProfilePage" : "WebPage";
          const actual = typesOf(page).filter((t) => t === "WebPage" || t === "ProfilePage");
          mark("J10.roleType", from);
          if (actual.length !== 1 || actual[0] !== expected) {
            // ⚠️ 红因印**源文件里的原样字面量**，不印算出来的布尔：
            //    布尔是判据的结论，原值是作者写的东西。印布尔会让读者
            //    照着提示去找一行并不存在的内容（"profilePage: true"）。
            const said = role.raw
              ? `写的是 profilePage: ${role.raw}`
              : "**没有 profilePage 这一项**（按约定视为 WebPage）";
            fail(
              "J10",
              `${from}: 页面实体的 @type 是 ${JSON.stringify(typesOf(page).join(" / ") || "(无)")}，` +
                `但源文件声明的角色是 ${expected}（${role.where} ${said}）` +
                `—— 这一页的角色与源文件不一致` +
                `（ProfilePage 降级成 WebPage 消费方就读不出"这是关于某人的页面"）`
            );
          }
        }
      }
    }
  } else {
    waivePrefix("J10.role", from);
  }

  /* ---- J3：归属链完整（isPartOf → WebSite、publisher → 本人） ----
     ⚠️ 2026-10-22（D59 第十一批）：这一段原先与 J4 合并在同一段里，
        且两处的红因都没标编号 ⇒ 文件头声称的 J3（归属链）在实现里**没有归属**。
        现在拆成两段，J3 管归属链、J4 管 mainEntity。 */
  if (pageNodes.length === 1 && websites.length === 1) {
    const page = pageNodes[0];
    const site = websites[0];
    const siteId = typeof site["@id"] === "string" ? site["@id"] : "";
    const publisherId =
      site.publisher && typeof site.publisher === "object" ? site.publisher["@id"] : "";
    const isPartOfId =
      page.isPartOf && typeof page.isPartOf === "object" ? page.isPartOf["@id"] : "";
    mark("J3.isPartOf", from);

    if (isPartOfId !== siteId) {
      fail(
        "J3",
        `${from}: 页面实体的 isPartOf 指向 ${JSON.stringify(isPartOfId)}，` +
          `应是站点实体的 @id ${JSON.stringify(siteId)} —— 页面与站点没接上`
      );
    }
    if (personId) {
      mark("J3.publisher", from);
      if (publisherId !== personId) {
        fail(
          "J3",
          `${from}: 站点实体的 publisher 指向 ${JSON.stringify(publisherId)}，` +
            `应是"本人"的 @id ${JSON.stringify(personId)} —— 站点与作者没接上`
        );
      }
    } else {
      /* 本人 @id 取不到（Person 不唯一）⇒ publisher 无从比较 ⇒ 豁免，
         不让 J12 的覆盖度自证拿一个不存在的判断对象说事。 */
      waive("J3.publisher", from);
    }
  } else {
    waive("J3.isPartOf", from);
    waive("J3.publisher", from);
  }

  /* ---- J4：mainEntity —— 这一页在讲谁 ----
     作品页 = 本页自己声明了 @id 等于本页 canonical 的**作品实体**
     （论文页的 ScholarlyArticle、博客文章页的 BlogPosting）；
     其余页 = 本人的 Person 节点。
     ⚠️ 前提比原先**宽**：原先这一段与 J3 合并 ⇒ 站点实体缺失时整段被跳过；
        现在 mainEntity 的判定只依赖页面实体，不依赖站点实体 ⇒ 站点出问题也能被看见。
     ⚠️ 2026-10-24（D96）：原先这一段只认 ScholarlyArticle —— 博客文章页声明了
        自己的 BlogPosting（@id 同样是页面 URL、无片段）却被当成"非论文页"，
        判据会要求它的 mainEntity 指向本人 ⇒ **假红**（把一处本来正确的东西
        报成错的）。口径因此泛化成"作品实体族"（WORK_TYPES）。 */
  if (pageNodes.length === 1) {
    const page = pageNodes[0];
    mark("J4.mainEntity", from);
    const mainEntityId =
      page.mainEntity && typeof page.mainEntity === "object" ? page.mainEntity["@id"] : "";
    if (!mainEntityId) {
      fail("J4", `${from}: 页面实体没有 mainEntity —— 消费方拿不到"这一页在讲谁"`);
      waive("J4.mainEntityDecl", from);
    } else {
      mark("J4.mainEntityDecl", from);
      const workNode = declarations.find(
        (d) => d["@id"] === canonical && typesOf(d).some((t) => WORK_TYPES.has(t))
      );
      const isWorkPage = Boolean(workNode);
      const workLabel = isWorkPage
        ? "作品页（" + typesOf(workNode).join("/") + "）"
        : "非作品页";
      const expected = isWorkPage ? canonical : personId;
      if (mainEntityId !== expected) {
        fail(
          "J4",
          `${from}: 页面实体的 mainEntity 指向 ${JSON.stringify(mainEntityId)}，` +
            `应为 ${JSON.stringify(expected)}（本页是${workLabel}）`
        );
      }
      if (!declarations.some((d) => d["@id"] === mainEntityId)) {
        fail(
          "J4",
          `${from}: 页面实体的 mainEntity 指向 ${JSON.stringify(mainEntityId)}，` +
            `但该 @id 在**本页**没有对应声明 —— 是个解析不到的空引用`
        );
      }
    }
  } else {
    waive("J4.mainEntity", from);
    waive("J4.mainEntityDecl", from);
  }

  /* ---- J8 的采集：全站口径的 @id → @type 组合表 ----
     判红放在循环之后（一次性判），因为"同一个 @id 挂了两种 @type"这件事
     本来就是**跨页**才看得出来：论文实体在列表页声明成 ScholarlyArticle，
     在论文页又被引用成 WebPage —— 单看一页可能只看到其中一半。 */
  for (const t of typed) {
    if (!siteTypeUse.has(t.id)) siteTypeUse.set(t.id, new Map());
    const m = siteTypeUse.get(t.id);
    if (!m.has(t.typeKey)) m.set(t.typeKey, { types: t.types, pages: new Set() });
    m.get(t.typeKey).pages.add(from);
  }

  /* ---- J9：论文的 mainEntityOfPage 必须指向承载它的那一页 ----
     列表页的论文实体（jsonLdArticles 出的那批）本来就没有这个字段，
     它们不归这条管；有这个字段的只有论文页那个（jsonLdPaper 出的）。 */
  for (const a of articles) {
    const m = a.mainEntityOfPage;
    if (!m || typeof m !== "object") continue;
    const mid = typeof m["@id"] === "string" ? m["@id"] : "";
    j9Compared++;
    mark("J9.mainEntityOfPage", from);
    if (!mid) {
      fail(
        "J9",
        `${from}: 论文实体「${a["@id"] || "(无 @id)"}」的 mainEntityOfPage 没有 @id —— ` +
          `消费方拿不到"这篇论文挂在哪一页"`
      );
      continue;
    }
    if (mid === a["@id"]) {
      fail(
        "J9",
        `${from}: 论文实体「${mid}」的 mainEntityOfPage 指向了**它自己** —— ` +
          `自指等于什么都没说；应指向本页的页面实体 <页面 URL>#webpage`
      );
      continue;
    }
    if (canonical && mid !== `${canonical}#webpage`) {
      fail(
        "J9",
        `${from}: 论文实体的 mainEntityOfPage 指向 ${JSON.stringify(mid)}，` +
          `应为 ${JSON.stringify(`${canonical}#webpage`)}（本页的页面实体）`
      );
    }
    if (!declarations.some((d) => d["@id"] === mid)) {
      fail(
        "J9",
        `${from}: 论文实体的 mainEntityOfPage 指向 ${JSON.stringify(mid)}，` +
          `但该 @id 在**本页**没有对应声明 —— 是个解析不到的空引用`
      );
    }
  }

  /* ---- J11：论文页的 ScholarlyArticle 必须有 image 与 dateModified ----
     缺这两个字段**不会报错**：页面照常渲染、JSON-LD 照常合法、其它门禁全绿，
     只是消费方（Bing 实体、Wikipedia、Google 普通检索的富结果）拿到的
     是一条"无图、无时效信号"的作品条目。
     两条判据：
       · image 必须**逐字等于**该页第一个 og:image 的 URL。
         社交平台只认第一张 og:image；结构化数据里的图与页面上那张分享图
         不是同一张就是"图文不符"—— 这条专治它。
       · dateModified 必须等于该页源文件**真实的最后提交时间**，且
         "有/无"要与"源文件提交过/没提交过"一致：
           源文件提交过 → 必须有，且值必须对；
           源文件还没提交 → 必须没有（本仓流程是「先 build 后 commit」，
                              新写的论文页在 build 时还没进历史，就是这种）。
         取不到（浅克隆 / 不在 git 仓库）→ 模板那边同样取不到
         （同一份判据、同一处降级），两边一致，不判"有"也不判"无"。
     只管「本页自己那篇论文」（@id == 本页 canonical 的那个 ScholarlyArticle）——
     列表页那批论文实体不归这条管。 */
  for (const a of articles) {
    if (!canonical || a["@id"] !== canonical) continue;
    j11Compared++;
    mark("J11.paperPage", from);

    /* —— image —— */
    const ogImage = ogImageOf(html);
    const img = typeof a.image === "string" ? a.image : "";
    if (!img) {
      fail(
        "J11",
        `${from}: 论文实体「${a["@id"]}」没有 image —— ` +
          `消费方拿到的作品条目是"无图条目"，在图搜与富结果里没有缩略图`
      );
      waive("J11.image", from);
    } else if (!ogImage) {
      fail(
        "J11",
        `${from}: 论文实体的 image 是 ${JSON.stringify(img)}，` +
          `但该页**没有 og:image** —— 图与分享卡片对不上`
      );
      waive("J11.image", from);
    } else {
      mark("J11.image", from);
      j11ImageCompared++;
      if (img !== ogImage) {
        fail(
          "J11",
          `${from}: 论文实体的 image 是 ${JSON.stringify(img)}，` +
            `与该页第一个 og:image（${JSON.stringify(ogImage)}）**不是同一个** —— ` +
            `图文不符：机器读到的图与人看到的分享图不是同一张`
        );
      }
    }

    /* —— dateModified —— */
    const srcRel = sourceOf(html);
    // 闭包口径：这一页的内容由哪些文件决定 ⇒ 取其中最晚的提交时间。
    // 与 sitemap 的 lastmod 同一个函数（scripts/lib/page-deps.cjs）⇒ 两边不可能对不上。
    const closure = srcRel ? expectedLastmod(srcRel) : null;
    const realCommit = closure ? closure.time : null;
    const fromFile = closure ? closure.from : null;
    const modified = typeof a.dateModified === "string" ? a.dateModified : "";
    if (realCommit) {
      j11ModifiedCompared++;
      mark("J11.dateModified", from);
      if (!modified) {
        fail(
          "J11",
          `${from}: 论文实体「${a["@id"]}」没有 dateModified —— ` +
            `但这一页的依赖闭包里最晚的提交时间是 ${realCommit}` +
            `（来自 ${fromFile}）：这一页确实改过，机器侧却看不到时效信号`
        );
      } else if (modified !== realCommit) {
        fail(
          "J11",
          `${from}: 论文实体的 dateModified 是 ${JSON.stringify(modified)}，` +
            `应是这一页依赖闭包里最晚的提交时间 ${JSON.stringify(realCommit)}` +
            `（来自 ${fromFile}）—— 时间戳必须是真的`
        );
      }
    } else {
      /* 没有可用的 git 历史（浅克隆 / 不在仓库里）⇒ 模板那边同样取不到
         （同一份判据、同一处降级），两边一致，不判"有"也不判"无"。
         这条比较点没有判断对象 ⇒ 豁免（不让 J12 拿它说事）。 */
      waive("J11.dateModified", from);
      if (modified) {
        fail(
          "J11",
          `${from}: 论文实体的 dateModified 是 ${JSON.stringify(modified)}，` +
            `但它的源文件（${srcRel || "(没标 source)"}）的依赖闭包里查不到提交历史 —— ` +
            `没有真实数据源却给出了时间戳`
        );
      }
    }
  }

  /* ---- J13：作品实体（BlogPosting）必须完整，且与页面所见逐字一致 ----
     缺这一层**不会报错**：页面照出、JSON-LD 照常合法、其它门禁全绿，
     只有逐个节点读才知道少了一篇"文章"。
     判定口径（与 J10 同一套纪律：不按 URL 硬编码，回源读数据层）：
       · 源文件声明了 structuredType 的页 ⇒ 产物里必须**恰好一个**该类型的实体；
       · 没声明的页 ⇒ 产物里**不许出现** BlogPosting（不许漏出去）；
       · 那个实体的字段必须与页面所见**逐字一致**：
         @id / url = 该页 canonical；headline = 页面 h1；
         description = 该页 meta description；datePublished = 页面 <time>；
         author = 本页本人节点的 @id；mainEntityOfPage = 本页页面实体。
     ⚠️ 逐字比较前必须解 HTML 实体：meta 与 h1 里的撇号是 &#39;，
        JSON-LD 里是原字符 —— 不解码就会把同一句话判成两句。 */
  {
    mark("J13.declaredType", from);
    const j13SrcRel = sourceOf(html);
    const j13SrcPath = j13SrcRel ? path.resolve(ROOT, j13SrcRel) : "";
    if (!j13SrcRel || !fs.existsSync(j13SrcPath)) {
      fail(
        "J13",
        `${from}: 页面里没有 <!-- source: ... --> 源文件标注（或标注的文件找不到）—— ` +
          `本条判据靠它知道这一页声明了什么作品类型` +
          `（base.njk 里那行 <!-- source: ... --> 不能删）`
      );
      waivePrefix("J13.", from);
    } else {
      const declared = resolveDeclaredStructuredType(j13SrcPath);
      if (!declared.evaluable) {
        // 声明求不出（模板表达式 / 语法错）→ 判红，不猜。
        fail(
          "J13",
          `${from}: 这一页声明的结构化类型求不出（${declared.where} 里写的是 ` +
            `structuredType: ${declared.raw}）—— ${declared.reason}。` +
            `本条判据对这一页无法核对。`
        );
        waivePrefix("J13.", from);
      } else {
        const declaredType = typeof declared.value === "string" ? declared.value.trim() : "";
        const hasDeclared = declaredType !== "";
        // 没声明 ⇒ 这一页要查的是"不许漏出来"的那一半。
        const wantedType = hasDeclared ? declaredType : "BlogPosting";
        const found = declarations.filter((n) => typesOf(n).includes(wantedType));
        mark("J13.entityCount", from);
        if (!hasDeclared) {
          if (found.length) {
            fail(
              "J13",
              `${from}: 这一页没有声明 structuredType，产物里却出现了 ${found.length} 个 ` +
                `${wantedType} 实体 —— 没有声明的作品类型不许漏出来`
            );
          }
        } else if (found.length !== 1) {
          fail(
            "J13",
            `${from}: 源文件声明的结构化类型是 ${declaredType}（${declared.where}），` +
              `产物里必须**恰好一个**该类型的实体，实际 ${found.length} 个` +
              `（缺了 = 消费方读不到这一篇；多个 = 消费方会读成好几篇）`
          );
          waivePrefix("J13.", from);
        } else {
          const node = found[0];
          j13Compared++;

          /* —— @id / url = 该页 canonical —— */
          mark("J13.id", from);
          const nid = typeof node["@id"] === "string" ? node["@id"] : "";
          const nurl = typeof node.url === "string" ? node.url : "";
          if (!canonical) {
            fail("J13", `${from}: 取不到 canonical，无法核对 ${declaredType} 实体的 @id / url`);
          } else if (nid !== canonical || nurl !== canonical) {
            fail(
              "J13",
              `${from}: ${declaredType} 实体的 @id 是 ${JSON.stringify(nid)}、url 是 ${JSON.stringify(nurl)}，` +
                `两者都应为该页 canonical ${JSON.stringify(canonical)} —— ` +
                `结构化数据说的是另一个地址`
            );
          }

          /* —— headline = 页面 h1 —— */
          mark("J13.headline", from);
          const headline = typeof node.headline === "string" ? node.headline : "";
          const h1 = h1TextOf(html);
          if (!h1) {
            fail("J13", `${from}: 页面里没有 h1，无法核对 ${declaredType} 实体的 headline`);
          } else if (headline !== h1) {
            fail(
              "J13",
              `${from}: ${declaredType} 实体的 headline 是 ${JSON.stringify(headline)}，` +
                `与页面 h1 ${JSON.stringify(h1)} **不是同一句** —— ` +
                `机器读到的标题与人看到的标题不一致`
            );
          }

          /* —— description = 该页 meta description —— */
          mark("J13.description", from);
          const desc = typeof node.description === "string" ? node.description : "";
          const metaDesc = metaDescriptionOf(html);
          if (!metaDesc) {
            fail(
              "J13",
              `${from}: 页面里没有 meta description，无法核对 ${declaredType} 实体的 description`
            );
          } else if (desc !== metaDesc) {
            fail(
              "J13",
              `${from}: ${declaredType} 实体的 description 与该页 meta description **不是同一句** —— ` +
                `搜索结果里那段话与结构化数据里那段话不一致`
            );
          }

          /* —— datePublished = 页面 <time> —— */
          mark("J13.datePublished", from);
          const published = typeof node.datePublished === "string" ? node.datePublished : "";
          const pageDate = timeDateOf(html);
          if (!pageDate) {
            fail(
              "J13",
              `${from}: 页面里没有 <time datetime="...">，无法核对 ${declaredType} 实体的 datePublished`
            );
          } else if (published !== pageDate) {
            fail(
              "J13",
              `${from}: ${declaredType} 实体的 datePublished 是 ${JSON.stringify(published)}，` +
                `与页面 <time> 的 ${JSON.stringify(pageDate)} **不是同一个日期**`
            );
          }

          /* —— author = 本页本人节点的 @id —— */
          mark("J13.author", from);
          const authorId =
            node.author && typeof node.author === "object" ? node.author["@id"] : "";
          if (!personId) {
            fail("J13", `${from}: 取不到本人节点的 @id，无法核对 ${declaredType} 实体的 author`);
          } else if (authorId !== personId) {
            fail(
              "J13",
              `${from}: ${declaredType} 实体的 author 指向 ${JSON.stringify(authorId)}，` +
                `应是本页本人节点的 @id ${JSON.stringify(personId)}`
            );
          }

          /* —— mainEntityOfPage = 本页页面实体 —— */
          mark("J13.mainEntityOfPage", from);
          const meopId =
            node.mainEntityOfPage && typeof node.mainEntityOfPage === "object"
              ? node.mainEntityOfPage["@id"]
              : "";
          const wantPageId = canonical ? canonical + "#webpage" : "";
          if (!wantPageId) {
            fail(
              "J13",
              `${from}: 取不到 canonical，无法核对 ${declaredType} 实体的 mainEntityOfPage`
            );
          } else if (meopId !== wantPageId) {
            fail(
              "J13",
              `${from}: ${declaredType} 实体的 mainEntityOfPage 指向 ${JSON.stringify(meopId)}，` +
                `应是本页的页面实体 ${JSON.stringify(wantPageId)}`
            );
          } else if (!declarations.some((d) => d["@id"] === meopId)) {
            fail(
              "J13",
              `${from}: ${declaredType} 实体的 mainEntityOfPage 指向 ${JSON.stringify(meopId)}，` +
                `但该 @id 在**本页**没有对应声明 —— 是个解析不到的空引用`
            );
          }
        }
      }
    }
  }
}

/* ---- J5：全站只有一个站点实体 ---- */
mark("J5.siteUnique", "*");
if (websiteIds.size > 1) {
  fail(
    "J5",
    `全站出现 ${websiteIds.size} 个不同的 WebSite @id：` +
      `${[...websiteIds].map((s) => JSON.stringify(s)).join(" / ")} —— ` +
      `全站必须指向同一个站点实体`
  );
}

/* ---- J8：同一个 @id 不得挂在不同的 @type 上（全站一次性判） ---- */
{
  let idCount = 0;
  mark("J8.typedIds", "*");
  for (const [id, m] of siteTypeUse) {
    idCount++;
    if (m.size <= 1) continue;
    const detail = [...m.values()]
      .map((v) => `"${v.types}"（${[...v.pages].sort().join("、")}）`)
      .join(" / ");
    fail(
      "J8",
      `同一个 @id「${id}」在全站挂了 ${m.size} 种 @type：${detail} —— ` +
        `实体身份就是 @id：同一个 @id 必须只讲一件事，否则消费方按 @id 归并时` +
        `两套字段会挤在一起，取到哪一套全看遍历顺序。` +
        `页面实体用 <页面 URL>#webpage，论文实体用 <页面 URL>（无片段），两者不能共用`
    );
  }
  if (!idCount) {
    fail("J8", "全站没有找到任何带 @id 且带 @type 的 JSON-LD 节点 —— 本条判据从未真正执行过");
  }
  j8Ids = idCount;
}

/* ---- J7：自证存活 ---- */
mark("J7.selfAlive", "*");
if (pagesChecked === 0) {
  fail("J7", "产物里一个可检查的页面都没有 —— 判据从未被真正执行过");
}
if (pageEntitiesFound === 0) {
  fail("J7", "全站没有找到任何页面实体（WebPage / ProfilePage）—— 判据从未被真正执行过");
}
if (comparisons() < pagesChecked) {
  fail("J7", `只比了 ${comparisons()} 处，却检查了 ${pagesChecked} 页 —— 判据没有逐页执行`);
}
if (!j9Compared) {
  fail(
    "J7",
    "全站没有比到任何一个 mainEntityOfPage —— 本条判据从未真正执行过" +
      "（论文页的 mainEntityOfPage 消失了，判据也就跟着失效了）"
  );
}
if (!j10Compared) {
  fail(
    "J7",
    "全站没有比到任何一页的页面角色 —— 本条判据从未真正执行过" +
      "（页面实体与源文件声明的 profilePage 角色从未被核对过）"
  );
}
if (!j10Declared) {
  // 自证：角色声明的**解析**确实跑过。若解析逻辑坏了（比如 front matter
  // 的读法写错），它会"什么都没找到" → 全部按 WebPage 判 → 门禁照样绿，
  // 而首页/关于页其实是 ProfilePage。缺了这一条，那类退化无人看守。
  fail(
    "J7",
    "全站没有一页找到角色声明 —— J10 的角色解析从未真正取到值" +
      "（解析逻辑坏了：所有页都被当成 WebPage 判，门禁照样绿）"
  );
}
if (!j10ProfilePages) {
  fail(
    "J7",
    "全站没有一页声明 ProfilePage —— 页面角色这一层整个退化了，" +
      "消费方拿不到「这是关于某人的页面」" +
      "（首页与关于页的 profilePage: true 是不是被改名或删掉了？）"
  );
}
if (!j11Compared) {
  // 自证：J11 必须真的在论文页上跑过。否则"论文实体没有 image / dateModified"
  // 这条判据就是空转的（列表页那批论文实体不归它管，@id != canonical）。
  fail(
    "J7",
    "全站没有核对到任何一页的论文实体 —— J11 从未真正执行过" +
      "（论文页自己的 ScholarlyArticle 消失了，image / dateModified 就无人看守）"
  );
}
if (!j11ImageCompared) {
  fail(
    "J7",
    "J11 没有比到任何一个 image —— 判据从未真正执行过" +
      "（论文页的 ScholarlyArticle 没有 image，或该页没有 og:image 可比）"
  );
}
if (!j13Compared) {
  // 自证：J13 必须真的在作品页上跑过。否则"作品实体没有 headline / description /
  // datePublished"这条判据就是空转的 —— 整段被摘掉时门禁照样绿。
  fail(
    "J7",
    "全站没有逐字核对过任何一个作品实体 —— J13 从未真正执行过" +
      "（作品实体（BlogPosting）消失了，或它没有可比对的字段，" +
      "headline / description / datePublished 就无人看守）"
  );
}

/* ---------- J12：逐比较点覆盖度自证 ----------
   ⚠️ 2026-10-22（D59 第十一批）实测补：J7 的存活自证是**总数**口径
     （`comparisons < pagesChecked`），抓不住「整段判据被摘掉」——
     因为每一页本来就贡献 3–5 处比较，摘掉一段后剩下的照样把总数撑过页数。
     这里改成**逐页逐比较点**：静态目录里每个比较点都必须在该跑的地方真的跑到。
   ⚠️ 判据被卸掉（开关关）⇒ 它的比较点不算缺失 —— 否则"卸判据"永远转不了绿。 */
{
  /* 全站一个错误页都没有 ⇒ J6 没有判断对象 ⇒ 豁免它的比较点。 */
  if (errorPagesChecked === 0) waive("J6.errorPage", null);
  const missing = [];
  for (const p of COVERAGE_POINTS) {
    const owner = ownerOf(p.key);
    if (SWITCH_ON[owner] === false) continue; // 判据被卸掉 ⇒ 不算缺失
    if (globalWaived.has(p.key)) continue; // 前提不在场 ⇒ 豁免
    if (p.everyPage) {
      for (const pg of nonErrorPages) {
        if (waivesOf(pg).has(p.key)) continue; // 该页前提不在场 ⇒ 豁免
        if (!marksOf(pg).has(p.key)) missing.push(`${p.key} @ ${pg}`);
      }
    } else {
      const n = hitCount[p.key] || 0;
      if (n >= p.min) continue; // 跑够了
      if (waivedKeys.has(p.key)) continue; // 前提不在场（每处都豁免了）⇒ 不算缺失
      missing.push(`${p.key}（记到 ${n} 次，至少要 ${p.min} 次）`);
    }
  }
  if (missing.length) {
    fail(
      "J12",
      `逐比较点覆盖度自证失败：${missing.length} 个比较点没跑到 —— ` +
        `${missing.slice(0, 6).join("；")}${missing.length > 6 ? " …" : ""}。` +
        `这说明有判据**没有真正执行**（或者整段被摘掉了）——门禁正在给出一个假的绿。`
    );
  }
  /* 结构自证：每个可卸开关都必须有比较点归属 ——
     否则"卸掉某条判据"这个动作在覆盖度自证里**根本不可观测**：
     卸了它，比较点目录里也没有它的点 ⇒ 覆盖度自证照样绿 ⇒ 负对照不成立。 */
  for (const id of Object.keys(SWITCH_ON)) {
    if (id === "J12") continue; // J12 自己就是自证，它没有比较点
    if (!COVERAGE_POINTS.some((p) => ownerOf(p.key) === id)) {
      fail(
        "J12",
        `判据 ${id} 在比较点目录里没有任何落点 —— 卸掉它的开关时覆盖度自证看不出变化，` +
          `"卸开关转绿"这件事对它不成立。请在 COVERAGE_POINTS 里给它补一个键。`
      );
    }
  }
}

/* ---------- 汇总 ---------- */
if (problems.length) {
  console.error("站点结构化数据门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

note(
  `${pagesChecked} 个非错误页都声明了站点实体与页面实体（${pageEntitiesFound} 个页面实体），` +
    `归属链与 mainEntity 全部接得上`
);
if (errorPagesChecked) {
  note(`${errorPagesChecked} 个错误页没有声明站点实体与页面实体`);
}
note(
  `实体身份：全站 ${j8Ids} 个 @id，每个 @id 只挂一种 @type；` +
    `${j9Compared} 篇论文的 mainEntityOfPage 指向本页的页面实体`
);
note(
  `页面角色：${j10Compared} 页与源文件声明的 profilePage 角色逐页核对一致` +
    `（其中 ${j10ProfilePages} 页声明为 ProfilePage；` +
    `角色声明取自：front matter 顶层 ${j10Kinds["front-matter"] || 0} 处 / ` +
    `eleventyComputed ${j10Kinds["computed"] || 0} 处 / ` +
    `目录数据文件 ${j10Kinds["directory-data"] || 0} 处）`
);
note(
  `论文实体的图与时效：${j11Compared} 页论文核对了 image（${j11ImageCompared} 处逐字比对，` +
    `与该页第一个 og:image 相同）；dateModified 逐字核对 ${j11ModifiedCompared} 处` +
    (j11ModifiedCompared < j11Compared
      ? `（另有 ${j11Compared - j11ModifiedCompared} 页的源文件还没进 git 历史，按约定不给时间戳）`
      : "")
);
note(
  `作品实体与页面所见：${j13Compared} 个作品实体逐字核对了 ` +
    `@id / url、headline（= 页面 h1）、description（= meta description）、` +
    `datePublished（= 页面 <time>）、author、mainEntityOfPage`
);
notes.forEach((n) => console.log(`· ${n}`));
const ranPoints = COVERAGE_POINTS.filter(
  (p) =>
    SWITCH_ON[ownerOf(p.key)] !== false &&
    !globalWaived.has(p.key) &&
    !waivedKeys.has(p.key)
).length;
const waivedPoints = COVERAGE_POINTS.length - ranPoints;
console.log(
  `逐比较点覆盖度自证：${ranPoints}/${COVERAGE_POINTS.length} 个比较点都跑过` +
    `（另有 ${waivedPoints} 个因前提不在场或判据被卸掉而豁免）。`
);
console.log("✓ 结构化数据自检通过（门禁 J0–J13）");
