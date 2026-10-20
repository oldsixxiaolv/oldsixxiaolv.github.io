#!/usr/bin/env node
/**
 * 身份句柄完整性门禁 —— 守住"本人"的身份句柄集合不被**整片**削掉。
 *
 * 为什么要有这个门禁（一次具体的实测漏洞，不是假想）：
 *   门禁 31 查的是"同一 @id 的**不同节点之间**是否一致"——只有"节点互不一致"
 *   才判红。于是有一种退化它**天然看不见**：全站所有带本人 @id 的 Person 节点
 *   **一致地**退化成只剩 ORCID 一条 → 节点之间仍然互相一致 → 门禁 31 全绿。
 *   门禁 23 也看不见：它两个方向都是"sameAs 里**含** ORCID"，ORCID 还在，
 *   只是不完整 → 全绿。
 *   合并起来的后果：**把 GitHub / ResearchGate / CSDN / OpenAlex 四条身份句柄
 *   整片删掉，产物照出、build 照过、门禁全绿**——而这正是门禁 31 被造出来
 *   要防的那件事本身。（实测取证见 docs/IMPROVEMENT-LOG.md 的 16:10 场次交接件，
 *   注入 E：改写 14 处 Person.sameAs，注入前后门禁 31 的 exit 都是 0。）
 *
 *   触发路径并不牵强：有人做"统一简化"重构，把所有发射器统一成 ownerOrcid；
 *   或有人直接改 site.js 把 author.sameAs 列表改短。两种都会**静默**丢掉
 *   四个身份句柄——搜索/聚合方按 @id 归并"本人"时，拿到的就是个残缺实体。
 *
 *   两种形态要分清楚（写结论时别混）：
 *     · **分歧形态**（部分节点残缺、其余完整）→ 门禁 31 抓得到（那是真冲突）；
 *     · **一致退化形态**（全站一起残缺）→ 门禁 31 **抓不到**，要靠本条。
 *
 * ⚠️ 本门禁自己也踩过一次同族的坑：**判据在自己的数据源里找期望值**。
 *   2026-10-19 16:05–16:25 场次落的初版，期望集直接取
 *   `require("./lib/identity.cjs")` 的 IDENTITY_SAMEAS——而那个共享模块
 *   **正是产物的发射源**（src/_data/site.js 从它取 author.sameAs）。于是：
 *     有人把模块里的 GitHub 句柄换成 https://example.com/impersonator
 *     （**条数不变、ORCID 仍在**）→ 重建后产物的 sameAs 与期望集**一起**变 →
 *     判据在"拿被改过的东西和它自己比" → **全绿**。
 *   实测（隔离克隆，源码级注入 + 全量重建）：build exit 0，门禁输出里直接把
 *   冒名账号当"登记清单"打印了出来——对外声明的作者身份就此被改写。
 *   形态上这叫**等长替换**：改短 / 改长 / 整片消失两版都抓得到，
 *   **只有"长度不变、内容换掉"这一形态被"把 oracle 搬进可变数据源"吃掉**。
 *   修法（就在本文件里）：**期望集必须是本判据自己的、独立于数据源的写死清单**
 *   （ORACLE_SAMEAS）；数据源那份只用来做**漂移核对**（I2d）。
 *
 * 判据清单（I0 是"判据本身还能不能触发"的自证，不是内容检查）：
 *   I0 形态规则自证 —— "什么算身份链接"这一步结构上还能不能触发：
 *              夹具用 example.invalid（RFC 2606 保留域），**不取自被测数据**；
 *              规则一旦退回"从 oracle 派主机"，本条立刻判红
 *              （否则新平台的身份链接会在"被要求登记"之前被静默放过）。
 *   I1 产物侧全集 —— 全站 @id == site.url + "/#person" 的 Person 节点，
 *                    sameAs 归一化集合必须**等于**本文件内置的独立期望集
 *                    ORACLE_SAMEAS：缺项红（丢信息才是坏事）。
 *                    **多出**未登记句柄 → 判红（见下方「多出未登记句柄」段）。
 *   I2 锚与独立期望集 —— 四条**互不依赖**的检查：
 *        I2a 期望集条数 == EXPECTED_COUNT（写死在本文件）
 *        I2b 期望集必须含本人 ORCID（写死在本文件）
 *        I2c 期望集的 sha256 == ORACLE_SET_SHA256（期望集**自己**被改动也要红）
 *        I2d 共享模块 scripts/lib/identity.cjs 的清单必须与期望集**逐项一致**
 *            （漂移核对：数据源改了而期望集没改 → 判红，逼人把两处一起改）
 *        **锚失守即短路**：I2a / I2b / I2c 任一判红 → 期望集**自身**已不可信，
 *        此时**不再**拿它去比产物（I1 / I5 本轮跳过）——拿一把自己坏掉的尺子
 *        去量产物，报出来的"产物缺 X"是假阳性，而且会把人引到改错的地方。
 *        I2d 判红**不**触发短路：哈希锚绿就证明期望集逐字未变，被改的是数据源，
 *        产物确实跟着错了 → I1 / I5 必须继续跑（那两条红因是真阳性）。
 *   I3 口径 —— 字段缺失（没有 sameAs 字段 / 显式 null）**不算缺失、不算冲突**，
 *              沿用门禁 31 的口径；这种形态由门禁 23 兜（带 canonical @id 的
 *              节点必须带本人 ORCID）。
 *   I4 自证存活 —— 本人节点组 ≥ 2 个，且本条至少比过一处 sameAs，
 *              否则判红（"没报错"和"没问题"长得一模一样）。
 *   I5 人读路径 —— site.author 里**页面上看得见**的身份链接，必须与登记
 *              期望集**逐项一致**（少一条、多一条、指向别的账号 → 判红）。
 *              这条守的是"人读的那条边"：I1–I4 全都只看**机读**路径
 *              （JSON-LD 的 sameAs），而页面上给人看的链接此前是**另一份
 *              字面量**，改它不会有任何门禁叫（实测见下）。
 *              "什么算身份链接"的识别规则**只看 URL 自己的形态**，
 *              不看"哪台主机是身份平台"（见下「I5 的识别规则不依赖 oracle」段）。
 *   I6 ORCID 值域 —— 全站（产物 + 数据源两侧）出现的每一个 ORCID 都必须
 *              登记在 ORCID_ALLOWLIST 里；白名单自带条数锚 + 哈希锚。
 *              这条守的是"这个 ORCID 值对不对"：门禁 23 查的是"节点之间
 *              一致"，把作者列表里的 ORCID **一致地**换成别的 ID 仍然自洽
 *              → 绿（实测：整链 build exit 0，产物照常渲染错 id）。
 *   I7 产品侧可见身份链接 —— 扫产物里人看得见的 <a href>，挑出"身份主页
 *              形态"的候选（规则与 I5 共用同一份），必须逐字落在登记清单里：
 *              **多出 = 判红**。这条守的是"人读路径"里**数据源之外**的那一半：
 *              正文里写死的字面量（如 src/content/about.md:38 的 CSDN 链接）。
 *              实测（peer 的 W3）：把那条换成冒名账号 → 整链 build exit 0、
 *              门禁全绿，页面公然指向非本人账号，而 JSON-LD 仍是本人。
 *              **只判"多出"不判"缺"**（"缺"归 I5）；**ORCID 不由本条判**
 *              （那是 I6 的值域白名单该管的事）。
 *
 * ⚠️ I5 要守的洞（一次具体的实测漏洞，不是假想）：
 *   I1–I4 查的全是 JSON-LD 里的 sameAs；**页面上可见**的 author.github /
 *   author.csdn / author.researchgate / social[] 此前各自写了一份字面量，
 *   与 sameAs 互不相干。实测（隔离克隆 + 源码级注入 + 全量重建）：
 *     只把 site.js 里**可见的** GitHub 链接换成 https://github.com/impersonator
 *     （sameAs 一字未动）→ **整条 build 链 exit 0**，零道门禁判红。
 *   后果：页面上写着"这是我的 GitHub"，结构化数据里却是另一个账号——
 *   机器读的那条有人看守，人读的那条没人管，两条路径对不上。
 *   修法两层：① site.js 的可见链接**从身份清单派生**（结构上不可能漂移）；
 *   ② 本条把"人读路径"也纳入守卫（有人绕过派生直接写死字面量 → 判红）。
 *
 * ⚠️ I5 刻意**只扫 site.author**（"本人"这一个实体的数据源），不扫产物里的
 *   全部链接：论文页会合法地链到**同行**的 ORCID，而同行的 ORCID 与本人的
 *   在 URL 形态上**完全一样**（一段式）——全站扫就必须去区分"本人 / 他人"，
 *   那是另一条判据该管的事，不该混进这条。
 *
 * ⚠️ 「多出未登记句柄」也要判红（一次具体的实测漏洞，不是假想）：
 *   早先把"产物 sameAs 比期望集多出来的句柄"只记 note，理由是"多出来不丢信息"。
 *   实测（隔离克隆，源码级注入 + 全量重建）：
 *     只在 src/_data/site.js 里把 author.sameAs 改成
 *     [...IDENTITY_SAMEAS, "https://github.com/impersonator"]
 *     （**共享模块 scripts/lib/identity.cjs 一字未动**）→
 *     **整条 build 链 exit 0、零道门禁判红**，而产物里
 *     https://github.com/impersonator 出现在 6 个页面共 14 处。
 *   为什么别的门禁看不见这一形态：
 *     · 门禁 31（同一 @id 的 sameAs 必须一致）→ 所有节点都从同一处派生，
 *       彼此**仍然一致** → 绿；
 *     · I2d（共享模块 ↔ 期望集逐项核对）→ 模块一字未动 → 绿；
 *     · I5（人读路径）→ 它**刻意跳过 sameAs**（机读路径由 I1/I2 管）→ 看不见；
 *     · 身份派生门禁（结构层）→ 只查"登记的那 5 条 URL 有没有被抄成字面量"，
 *       新句柄不是登记的那 5 条 → 绿。
 *   后果：站点在 JSON-LD 里对外声明一个**没人登记过**的身份，全链路无一道
 *   门禁叫 → 与 I1 守的"整片削掉"是同族问题的另一半（丢信息 / 挂假信息）。
 *   现在多出即判红；红因**不预设责任方**，用 I2d 的红/绿分辨根因
 *   （I2d 红 → 期望集没同步；I2d 绿 → 产物侧多挂了句柄）。
 * ⚠️ I5 的"身份主页形态"识别**不依赖 oracle 的主机集**（一次实测漏洞，不是假想）：
 *   早先 I5 用"oracle 里出现过的**主机**"来判什么算身份主页（hostShape），
 *   `isIdentityProfile()` 对**未知主机**直接 `return false`。后果：
 *   **期望集之外的主机，在"被要求登记"之前就不算身份链接** → 压根进不了比较
 *   → 静默漏网。实测（隔离克隆，源码级注入 + 全量重建，基准 8a7a953）：
 *     ① 在 src/_data/site.js 的 site.author 里加一项
 *        gitlab: "https://gitlab.com/lvyihang"；
 *     ② 并在 about.njk 的联系方式里把它渲染出来 →
 *     产物出现 **6 处可见的未登记账号**，**整条 build 链 exit 0**，
 *     两道身份门禁都打印"通过"——其中一道的通过文案还是**假的**
 *     （它说"页面上可见的身份链接 5 条，与登记清单一致"，实际可见 6 条）。
 *   根因（形态上是"尺子量不到自己的盲区"）：**期望集同时充当了
 *     "判定什么算违规对象"的尺子**——期望集之外的对象在进入比较**之前**
 *     就被挡掉了。修法不是"再加一份主机清单"（那只是把盲区搬个家），
 *     而是让**识别规则不依赖 oracle**：只看 URL 自己的形态。
 *   现在的规则（形态规则，与主机无关）：
 *     · 一段式路径（主机/账号）：github.com/<user>、orcid.org/<id>、
 *       openalex.org/<id>、blog.csdn.net/<user>、gitlab.com/<user>……
 *     · 两段式且首段是角色词（profile / user / u / in / author / handle……）：
 *       researchgate.net/profile/<Name>、linkedin.com/in/<name>……
 *     · 更深的路径（仓库页、记录页、论文页）= **内容链接**，
 *       不是"本人是哪个账号"，不参与身份判定。
 *   为什么不用"从 oracle 派主机"：那正是这个洞的根因——oracle 一改，
 *     判据的视野跟着变，新平台在登记之前就不可见。
 *   为什么不用"所有新主机一律判红"：那会把内容链接（仓库页、记录页）
 *     也抓进来，与既有设计（内容链接不算身份）冲突。
 *   改这条规则时注意：它与 oracle **解耦**（oracle 增删句柄不必改它），
 *     但它决定"哪些链接算身份"——放宽形态会新增假红，收紧会新增漏网，
 *     改完必须重跑全链。
 * ⚠️ 为什么要留两份清单（共享模块 + 本文件的独立期望集）：
 *   仓库的规矩是"判据两处各抄一份 → 改一处忘另一处"，但那条规矩治的是
 *   **静默漂移**，靠**逐字核对**兜底；这里两处恰恰就是"逐字核对"的关系（I2d），
 *   漂了就红 → 不会静默。而"清单只留一份"会让期望集与被判数据同源 →
 *   等长替换全盲（上面那次实测）。代价是**合法增删要改三处**
 *   （模块清单 / 判据 oracle＋条数＋哈希 / 数据源里那条**可见**身份链接字段
 *   ——三个文件五个改动点；2026-10-19 实测校准，此前这里写的"两处"不符事实），
 *   这个代价是有意接受的；漏改 → 判红（漂了就该叫）。
 *   ⚠️ 最易漏的是第三处：I5 跳过 author.sameAs，只认 site.author 里
 *      **单独写出来的**可见链接字段 → 只改前两处会判红。实测（隔离克隆
 *      2026-10-19）：只改模块 + 判据 → exit 1，唯一红因「site.author 里
 *      **数据源侧**的身份主页形态链接缺 …」；补上第三处 → exit 0。
 *      ⚠️ 该红因**不点名 src/_data/site.js**（只说数据层名 site.author）——
 *      红因里点名文件 / 写出同步清单属"待拍板 23"，未代拍。
 *
 * ⚠️ 哈希锚（I2c）能挡什么、不能挡什么（不夸大覆盖范围）：
 *   能挡：只改期望集（改短或等长替换）而没同步哈希 → 判红。
 *   不能挡：期望集 + 数据源 + 哈希三者**一致地**改 → 仍然全绿。
 *   那已超出"判据"能防的范围（要防它得靠 git 历史审计 + 日志复核）。
 *   所以本门禁**不声称**能挡住有意的协同篡改，只声称能挡住
 *   误改 / 单点改 / 等长替换这几种真实事故形态。
 *
 * ⚠️ 为什么不写进 scripts/verify-site.cjs：那里的门禁是一个**连续编号**的整体
 *   （文件头清单 + 代码段 + 对照表三处必须一一对应），插入新号要同时改三处；
 *   而那个文件正被并发场次改写。本门禁是独立主题的产物级检查，与
 *   check-a11y（A*）、check-wrapping（W*）、check-artifact-metadata（M*）
 *   同一形态：不占用 verify-site.cjs 的号段。接线由 check-gates-wired.cjs
 *   的 GW1 守着（漏接线会判红）。
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
/* SITE_DIR 只给故障注入用：改产物做注入测试时如果直接改 _site，
   会和并发的 build 抢同一个目录。 */
const SITE = process.env.SITE_DIR
  ? path.resolve(process.env.SITE_DIR)
  : path.join(ROOT, "_site");

/* ---------- 独立期望集（oracle）：写死在本判据里，不从数据源取 ----------
   ⚠️ 这一份**必须**与产物的发射源（scripts/lib/identity.cjs）分开：
     期望集若由被判数据推导出来，判据就是在"拿自己和自己比"——
     等长替换（长度不变、内容换掉）这种形态会全盲。实测见文件头。          */
const ORACLE_SAMEAS = [
  "https://orcid.org/0009-0005-3511-0546",
  "https://github.com/oldsixxiaolv",
  "https://www.researchgate.net/profile/Yihang-Lyu",
  "https://blog.csdn.net/lvyihang200411",
  "https://openalex.org/A5121394231",
];

/* ---------- 锚：不依赖任何清单内容，因此写死在本判据里 ---------- */
const EXPECTED_COUNT = 5;
const ANCHOR_ORCID = "https://orcid.org/0009-0005-3511-0546";
/* 期望集自身的哈希锚：期望集被改动、而这个值没同步更新 → 判红。
   规范形式 = 期望集按字典序排序后用 "\n" 连接（无尾随换行）。
   合法增删句柄后不必手算：跑一次本门禁，红因里会直接给出该贴的新值。 */
const ORACLE_SET_SHA256 = "cd9e39b57ef069d59b2065be2a52658c0eecc243e7f4bfbdc35b895914817ac7";

/* ---------- I6 的白名单：全站声明的 ORCID 值域（写死在本判据里） ----------
   ⚠️ 为什么它**不能**从数据源取：scripts/lib/identity.cjs 正是产物的发射源，
   期望值若也从那里取，就回到文件头说的"拿自己和自己比"的老问题。
   下面这份必须与产物、数据源都**独立**：数据源里的 ORCID 值改了，
   期望值不会跟着变 → 才红得了。 */
const ORCID_ALLOWLIST = [
  "0009-0005-3511-0546", // 本人
  "0000-0001-6144-0120", // 合作者 Xueke Wu
  "0009-0002-2576-1108", // 合作者 Guohao Hu
];
const ORCID_ALLOWLIST_COUNT = 3;
/* 白名单自身的哈希锚（规范形式与 ORACLE_SET_SHA256 相同：排序后 "\n" 连接）。
   白名单被改过（哪怕等长替换）而没同步 → 判红。 */
const ORCID_ALLOWLIST_SHA256 =
  "3339bc28f8b27e7781c3178c7c1c9c176ddbd927473c43af97cef0c275493350";

const problems = [];
const notes = [];
const fail = (msg) => problems.push(msg);
const note = (msg) => notes.push(msg);

/* ---------- I0（形态规则自证）的**锚**：条数 + 哈希，写死在本文件里 ----------
   ⚠️ 为什么锚不能从夹具表自己取：夹具表若被删掉一条，"实际条数"和"期望条数"
   会一起变小 → 永远相等 → 锚形同虚设（这正是文件头说的"拿自己和自己比"）。
   所以条数与哈希都是**手写的独立期望**，夹具表被删 / 被改 / 被换顺序 → 判红。
   规范形式：夹具表按 [[url, want], ...] 的 JSON 序列化（顺序即数组顺序）。 */
const SHAPE_SELF_CHECK_EXPECTED_COUNT = 5;
const SHAPE_SELF_CHECK_SHA256 =
  "3c188b5fc5a98a91d1b5b6720396484ae92c294307f838d7b9147b27b85ac08f";
/* 自证是否真的跑过、跑的结果怎么描述。默认值是"没跑起来"——
   整段自证代码若被删掉，通过文案会照实说"没跑起来"，而不是继续自称"核过"。 */
let shapeSelfCheckPassed = false;
let shapeSelfCheckSummary =
  "形态规则自证**本轮没有跑起来**（自证代码或锚不在本文件里）——" +
  "这一条缺失时，I5/I7 就算打印「通过」，也只是「没看见」，不是「核过」。";

/* ---------- 数据源清单：只用于漂移核对（I2d），**不**作为期望集 ---------- */
let IDENTITY_SAMEAS = null;
try {
  ({ IDENTITY_SAMEAS } = require("./lib/identity.cjs"));
} catch (e) {
  fail(
    `读不到 scripts/lib/identity.cjs（${e.message}）——` +
      `本门禁无法做清单漂移核对，直接判红。`
  );
}

/* ---------- 单一真源（取 @id 基准要用 site.url） ---------- */
let siteData = null;
try {
  siteData = require(path.join(ROOT, "src/_data/site.js"));
} catch (e) {
  fail(`读不到 src/_data/site.js（${e.message}）——本门禁没有真源可比，直接判红。`);
}
if (!siteData) {
  console.error("身份句柄完整性门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

const SITE_URL = (siteData.url || "").replace(/\/+$/, "");
const OWNER_ID = SITE_URL + "/#person";
const expectedSet = new Set(ORACLE_SAMEAS);

/* ---------- 归一化：sameAs 允许数组或逗号串（两种形状同一份数据） ---------- */
const normSameAs = (value) => {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  return new Set(raw.map((s) => String(s).trim()).filter(Boolean));
};
const setDiff = (a, b) => [...a].filter((x) => !b.has(x));
const fmt = (arr) => (arr.length ? arr.join(" / ") : "（无）");

/* ---------- 身份"主页形态"规则：I5 与 I7 共用**一份** ----------
   为什么必须共用一份（而不是两处各写一份）：这条规则回答的是
   "什么样的链接算'指向一个账号主页'"。判据的规则若有两份拷贝，
   改一处忘一处 → 两道判据对同一条链接给出不同结论，
   而且**没人会发现它们打架**（各自都"看起来对"）。

   ⚠️ 规则本身**不依赖 oracle 的主机集**（一次实测漏洞的根因，见文件头）：
     早先这里从 ORACLE_SAMEAS 派主机（hostShape），`isIdentityProfile()` 对
     **未知主机**直接 return false → 期望集之外的主机（gitlab.com 这种新平台）
     在"被要求登记"之前就**不算身份链接** → 压根进不了比较 → 静默漏网
     （实测：site.author.gitlab + 模板渲染 → 产物 6 处可见未登记账号，
     整链 exit 0，两道身份门禁都"通过"，其中一道的通过文案还是假的）。
     现在改成**只看 URL 自己的形态**（主机无关）：
     · 一段式路径（主机/账号）：github.com/<user>、orcid.org/<id>、
       openalex.org/<id>、blog.csdn.net/<user>、gitlab.com/<user>……；
     · 两段式且首段是角色词：researchgate.net/profile/<Name>、
       linkedin.com/in/<name>……；
     · 更深的路径（仓库页、记录页、论文页）= **内容链接**，
       不是"本人是哪个账号"，不参与身份判定。
     改这条规则时注意：它与 oracle **解耦**（oracle 增删句柄不必改它），
     但它决定"哪些链接算身份"——放宽形态会新增假红，收紧会新增漏网，
     改完必须重跑全链。 */
const IDENTITY_ROLE_SEGMENTS = new Set([
  "profile", "user", "users", "u", "author", "authors",
  "account", "member", "people", "person", "handle", "in",
]);
const urlShape = (raw) => {
  try {
    const u = new URL(String(raw).trim());
    return {
      scheme: u.protocol.replace(/:$/, ""),
      host: u.host,
      segs: u.pathname.split("/").filter(Boolean),
    };
  } catch {
    return null;
  }
};
const isIdentityProfile = (raw) => {
  const s = urlShape(raw);
  if (!s) return false;
  if (s.scheme !== "http" && s.scheme !== "https") return false;
  if (s.segs.length === 1) return true;
  if (s.segs.length === 2 && IDENTITY_ROLE_SEGMENTS.has(s.segs[0].toLowerCase())) {
    return true;
  }
  return false;
};

/* ---------- I0：形态规则自证 —— "什么算身份链接"这一步结构上还能不能触发 ----------
   为什么要有这条（一次实测出来的漏洞，不是假想）：
     早先 I5 用"oracle 里出现过的**主机**"来判什么算身份主页（hostShape），
     isIdentityProfile() 对**未知主机**直接 return false。后果：
     **期望集之外的主机，在"被要求登记"之前就不算身份链接** → 压根进不了比较
     → 静默漏网。实测（隔离克隆，源码级注入 + 全量重建）：
       ① src/_data/site.js 的 site.author 里加一项
          gitlab: "https://gitlab.com/lvyihang"；
       ② 并在页脚把它渲染出来；
     产物出现 **6 处可见的未登记账号**，**整条 build 链 exit 0**，
     两道身份门禁都打印"通过"——其中一道的通过文案还是**假的**
     （它说"页面上可见的身份链接 5 条，与登记清单一致"，实际可见 6 条）。
   根因是"尺子量不到自己的盲区"：**期望集同时充当了"判定什么算违规对象"的尺子**，
   期望集之外的对象在进入比较**之前**就被挡掉了。
   本条把"这条规则本身还认不认得出它该认的形态"变成判据的一部分：
     夹具用的是 **example.invalid**（RFC 2606 保留域，永不指向真实主机），
     **不取自被测数据**，所以它验的是**规则**，不是站点的数据。
   任何一条断言不成立 → 判红："本条已经降级，继续跑只会给出假保证"。
   ⚠️ 与 I5/I7 里那两条"自证存活"不是一回事：
     那两条验的是"**这个站点**上有没有认出东西"（数量 > 0）；
     本条验的是"**这条规则**还认不认得出它该认的形态"（拿合成夹具逐条对答案）。
     少了本条，规则被改回 oracle 派主机时，两条"自证存活"照样绿 —— 洞会重新打开。 */
/* 夹具表：**内容**写死在这里，但"有几条、内容是什么"由文件顶部的锚独立把关
   （SHAPE_SELF_CHECK_EXPECTED_COUNT + SHAPE_SELF_CHECK_SHA256），
   所以删一条、改一条、调顺序都会判红——锚不是从这张表自己取的。 */
const SHAPE_SELF_CHECK_CASES = [
  { url: "https://example.invalid/someone", want: true,
    why: "一段式路径（任何主机）必须认成账号主页形态——这是规则与 oracle 解耦的根据" },
  { url: "https://example.invalid/profile/someone", want: true,
    why: "两段式且首段是角色词必须认成账号主页形态" },
  { url: "https://example.invalid/someone/project", want: false,
    why: "两段式但首段不是角色词 → 内容链接，不该算身份" },
  { url: "https://example.invalid/someone/project/extra", want: false,
    why: "更深的路径 → 内容链接，不该算身份" },
  { url: "https://example.invalid/", want: false,
    why: "零段式（裸主机）→ 不是账号主页" },
];
{
  /* I0 锚：条数 + 哈希（期望值写死在文件顶部，不从这张表取） */
  if (SHAPE_SELF_CHECK_CASES.length !== SHAPE_SELF_CHECK_EXPECTED_COUNT) {
    fail(
      `形态规则自证的夹具条数对不上：实际 ${SHAPE_SELF_CHECK_CASES.length} 条，` +
        `锚写的是 ${SHAPE_SELF_CHECK_EXPECTED_COUNT} 条。` +
        `夹具被删过或被加过 → 自证就只剩"自己证明自己"，判红。`
    );
  }
  const shapeDigest = crypto
    .createHash("sha256")
    .update(JSON.stringify(SHAPE_SELF_CHECK_CASES.map((c) => [c.url, c.want])))
    .digest("hex");
  if (shapeDigest !== SHAPE_SELF_CHECK_SHA256) {
    fail(
      `形态规则自证的夹具内容哈希对不上：实际 ${shapeDigest}，` +
        `锚写的是 ${SHAPE_SELF_CHECK_SHA256}。` +
        `夹具被改过（包括等长替换）→ 自证可能已经名不副实，判红。`
    );
  }
  /* 逐条对答案：规则还认不认得出它该认的形态 */
  for (const c of SHAPE_SELF_CHECK_CASES) {
    const got = isIdentityProfile(c.url);
    if (got !== c.want) {
      fail(
        `形态规则自证失败：${c.url} —— 期望${c.want ? "认成" : "不认成"}「账号主页形态」，` +
          `实际${got ? "认成" : "不认成"}。${c.why}。` +
          `本条一旦降级（例如又把"什么算身份"改回从 oracle 派主机），` +
          `新平台的身份链接就会在"被要求登记"之前被静默放过。`
      );
    }
  }
  shapeSelfCheckPassed = true;
  shapeSelfCheckSummary =
    `形态规则自证 ${SHAPE_SELF_CHECK_CASES.length}/${SHAPE_SELF_CHECK_EXPECTED_COUNT} 条合成夹具逐条对答案通过` +
    `（"什么算身份链接"这一步本身还认得出该认的形态；夹具用 example.invalid，不取自被测数据；` +
    `夹具条数与内容由独立锚校验）。`;
}

/* 同一身份主页的**归一化键**：主机 + 路径段（主机由 URL 解析器天然小写）。
   I7 用它判断"是不是登记在册的那一个账号"——比的是**账号**而不是**字符串**：
   末尾多一个斜杠这类写法差异，不该被判成"多出一个身份"。
   （I5 比的是 site.author 里的原始字符串，两处口径不同是有意的：
     I5 的对象是数据字段，I7 的对象是产物里渲染出去的链接。） */
const profileKey = (raw) => {
  const s = urlShape(raw);
  return s ? `${s.host}/${s.segs.join("/")}` : null;
};

/* ---------- I2：锚与独立期望集（四条互不依赖的检查） ---------- */
/* 锚是否可信：I2a / I2b / I2c 任一判红 → 期望集**自身**失守，
   此刻的 expectedSet 不能再当判据去比产物——拿一把自己坏掉的尺子去量
   产物，报出来的"产物缺 X"是**假阳性**，而且会把人引到改错的地方
   （红因指错责任方，比没有红因更坏）。此时只报锚自身的红因，
   产物侧判定（I1 / I5）本轮跳过，等期望集修好再重跑。 */
let anchorTrustworthy = true;
{
  /* I2a 条数锚：期望集被改短 / 改长 → 判红 */
  if (expectedSet.size !== EXPECTED_COUNT) {
    anchorTrustworthy = false;
    fail(
      `独立期望集有 ${expectedSet.size} 条，与本判据锚定的 ${EXPECTED_COUNT} 条不符` +
        `——期望集被改短（或改长）时，判据就跟着变，红不了了。` +
        `确要增删句柄，请同步改 scripts/check-identity-handles.cjs 的 EXPECTED_COUNT。`
    );
  }
  /* I2b ORCID 锚：期望集里必须有这条权威标识 */
  if (!expectedSet.has(ANCHOR_ORCID)) {
    anchorTrustworthy = false;
    fail(
      `独立期望集里没有本人 ORCID（${ANCHOR_ORCID}）——` +
        `期望集里必须有这条权威标识，否则"本人"在结构化数据里就没有锚。`
    );
  }
  /* I2c 期望集自身的哈希锚：期望集被改过（哪怕是等长替换）而没同步 → 判红 */
  const computedOracleHash = crypto
    .createHash("sha256")
    .update([...ORACLE_SAMEAS].sort().join("\n"))
    .digest("hex");
  if (computedOracleHash !== ORACLE_SET_SHA256) {
    anchorTrustworthy = false;
    fail(
      `独立期望集的哈希锚对不上：现在算出来是 ${computedOracleHash}，` +
        `本文件锚着 ${ORACLE_SET_SHA256}——期望集被改过而哈希锚没同步` +
        `（改清单是合法操作，但要把上面这串新哈希贴回 ORACLE_SET_SHA256）。`
    );
  }
  /* I2d 漂移核对：数据源那份清单必须与独立期望集逐项一致
     ⚠️ 这一条判红**不**翻转 anchorTrustworthy：漂移核对只说明"两份对不上"，
        单看它判不出是哪一份被改了。但哈希锚（I2c）能判：哈希绿 → oracle
        逐字未变 → 被改的是数据源 → 产物确实跟着错了 → 产物侧判定（I1/I5）
        **必须继续跑**，那两条红因是真阳性。所以这里只判红，不短路。 */
  if (IDENTITY_SAMEAS) {
    const sourceSet = new Set(IDENTITY_SAMEAS);
    if (sourceSet.size !== IDENTITY_SAMEAS.length) {
      fail(
        `共享模块 scripts/lib/identity.cjs 的清单里有重复项` +
          `（${IDENTITY_SAMEAS.length} 项 / ${sourceSet.size} 个不同值）——` +
          `清单要求逐项唯一，否则"等于期望集"这个比对说不清。`
      );
    }
    const extra = setDiff(sourceSet, expectedSet);
    const missing = setDiff(expectedSet, sourceSet);
    if (extra.length || missing.length) {
      if (!anchorTrustworthy) {
        /* 锚自身已判红 → 这处不一致**判不出是谁被改的**，不能断言"模块被改了"。
           （16:4x 场次实测：锚被改短时，这条文案会去指责数据源，
             而实际是锚被改短——红因指错责任方，比没有红因更坏。） */
        fail(
          `共享模块 scripts/lib/identity.cjs 的清单与本判据的独立期望集不一致：` +
            `模块多出 ${fmt(extra)}／模块少了 ${fmt(missing)}——` +
            `但**期望集自身已判红**（上面那条锚判据），所以这处不一致` +
            `**不能断定是谁被改了**（期望集被改、模块没同步；` +
            `或模块被改、期望集没同步——两种都长这样）：` +
            `先按上面哈希锚那条红因把期望集修好，再重跑本门禁——` +
            `若漂移仍在，那才是模块这边的问题。`
        );
      } else {
        fail(
          `共享模块 scripts/lib/identity.cjs 的清单与本判据的独立期望集不一致：` +
            `模块多出 ${fmt(extra)}／模块少了 ${fmt(missing)}——` +
            `两份清单是"逐字核对"的关系（这里就是那条核对）：` +
            `改模块时必须同步改本文件的 ORACLE_SAMEAS` +
            `（以及 EXPECTED_COUNT / ORACLE_SET_SHA256）。`
        );
      }
    }
  }
}

/* ---------- 产物扫描 ---------- */
const htmlFiles = [];
(function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.isFile() && e.name.endsWith(".html")) htmlFiles.push(p);
  }
})(SITE);

if (!htmlFiles.length) {
  fail(`产物目录里一个 HTML 都没有（${SITE}）——本门禁无从判断，直接判红。`);
}

/* 全递归收集 JSON-LD 节点（论文的 author、数据集的 creator 这些嵌套的
   Person 也要收进来——它们同样带着本人 @id） */
const collectNodes = (root, out = []) => {
  if (Array.isArray(root)) {
    for (const v of root) collectNodes(v, out);
    return out;
  }
  if (!root || typeof root !== "object") return out;
  out.push(root);
  for (const v of Object.values(root)) collectNodes(v, out);
  return out;
};
const typesOf = (node) => {
  const t = node["@type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((x) => typeof x === "string");
  return [];
};

/* 本人节点组：@id == site.url + "/#person" 且 @type 含 Person */
const group = [];
const extraHandles = new Set();
let compared = 0; // 真正比过 sameAs 的节点数（I4 自证存活用）

for (const file of htmlFiles) {
  const rel = path.relative(SITE, file);
  const html = fs.readFileSync(file, "utf8");
  for (const m of html.matchAll(
    /<script[^>]*type\s*=\s*"application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
  )) {
    let parsed;
    try {
      parsed = JSON.parse(m[1]);
    } catch (e) {
      /* 解析失败必须自己报：解析不了就看不见本人的节点，
         "看不见"会被误当成"没问题" */
      fail(`${rel}：有一块 JSON-LD 解析失败（${e.message}）——本门禁无法确认身份句柄。`);
      continue;
    }
    for (const node of collectNodes(parsed)) {
      if (node["@id"] !== OWNER_ID) continue;
      if (!typesOf(node).includes("Person")) continue;
      group.push({ rel, node });
      /* I3 口径：字段缺失（undefined / null）不算缺失、不算冲突 —— 跳过，
         这种形态由门禁 23 兜。字段在（哪怕是空数组）才算一个值。 */
      if (node.sameAs === undefined || node.sameAs === null) continue;
      compared++;
      const set = normSameAs(node.sameAs);
      for (const u of setDiff(set, expectedSet)) extraHandles.add(u);
    }
  }
}

/* ---------- I1：产物侧的全集（逐节点） ---------- */
if (anchorTrustworthy) {
  /* 按"实际 sameAs 集合"归并，红因里成组报，不刷屏 */
  const bySet = new Map(); // setKey → { set, pages:Set, count }
  for (const { rel, node } of group) {
    if (node.sameAs === undefined || node.sameAs === null) continue;
    const set = normSameAs(node.sameAs);
    const key = [...set].sort().join("|");
    if (!bySet.has(key)) bySet.set(key, { set, pages: new Set(), count: 0 });
    const g = bySet.get(key);
    g.count++;
    g.pages.add(rel);
  }
  for (const [, g] of bySet) {
    const missing = setDiff(expectedSet, g.set);
    if (!missing.length) continue;
    const pages = [...g.pages];
    const shown =
      pages.slice(0, 3).join("、") + (pages.length > 3 ? ` 等 ${pages.length} 个产物` : "");
    fail(
      `本人（${OWNER_ID}）的 sameAs 缺 ${fmt(missing)}——` +
        `${g.count} 个节点如此（${shown}）。` +
        `身份句柄整片缺失时各节点之间仍然"一致"，门禁 31 看不见这一类退化。`
    );
  }
  if (extraHandles.size) {
    fail(
      `有 ${extraHandles.size} 条 sameAs 不在登记清单里：${fmt([...extraHandles])}——` +
        `这些句柄**已经渲染进产物**（机读路径 JSON-LD 的 sameAs），` +
        `却不在本判据的登记清单里。两种情形都长这样：` +
        `① 产物/数据源多挂了未登记句柄（不该发生：站点在对外声明一个没人登记过的身份）；` +
        `② 合法增删句柄、但登记清单（ORACLE_SAMEAS / EXPECTED_COUNT / ORACLE_SET_SHA256）` +
        `没同步。分辨根因看 I2d：I2d 红了 → 共享模块与期望集不一致 → 根因在**期望集没同步**；` +
        `I2d 绿了 → 模块与期望集一致 → 根因在**产物侧多挂了句柄**。`
    );
  }
} else {
  note(
    `期望集自身失守（锚判据 I2a / I2b / I2c 已判红）→ 本轮**跳过**产物侧全集判定（I1）：` +
      `此刻的期望集不可信，拿它去比产物，报出来的"产物缺 X"是**假阳性**，` +
      `而且会把人引到改错的地方（真相是期望集被改了，责任方在判据这边）。` +
      `先修好期望集（ORACLE_SAMEAS / EXPECTED_COUNT / ORACLE_SET_SHA256）再重跑本门禁，` +
      `产物侧的问题会在下一轮显现。`
  );
}

/* I5 结果的输出变量：**声明在 I5 段之外**——
   这样"整段 I5 被删掉"时，门禁不会因为 ReferenceError 崩掉，
   而是走"本轮未判定"分支 → 与真实的静默放行**同构**，
   由 scripts/test-gates-selfcheck.cjs 精确发现"判据被卸了"。
   （红因指错地方比没有红因更坏：崩在 undefined 上，人只会当成脚本 bug，
     反而看不出有人把判据整段删了。） */
let visibleIdentityCount = 0;
let visibleIdentityChecked = false;
let visibleUrlFieldCount = 0;

/* ---------- I5：人读路径（页面上看得见的身份链接）必须与登记清单一致 ---------- */
if (anchorTrustworthy) {
  /* 身份"主页形态"的判定规则（urlShape / isIdentityProfile）已提到文件前部
     ——I5 与 I7 要用**同一份**，两处各抄一份就会漂。
     规则只讲 URL 自己的形态、**不看主机清单**（主机无关）：
     见文件头「I5 的识别规则不依赖 oracle」段。 */

  /* 只看 site.author —— 那是"本人"这一个实体的数据源。
     sameAs 跳过：机读路径由 I1 / I2 管，这里专管人读路径。 */
  const visible = new Set();
  let urlFields = 0;  for (const [key, value] of Object.entries(siteData.author || {})) {
    if (key === "sameAs") continue;
    const urls = Array.isArray(value)
      ? value
      : typeof value === "string"
        ? [value]
        : [];
    for (const u of urls) {
      const t = String(u || "").trim();
      if (!t) continue;
      urlFields++;
      if (isIdentityProfile(t)) visible.add(t);
    }
  }

  const missingVisible = setDiff(expectedSet, visible);
  const extraVisible = setDiff(visible, expectedSet);
  if (missingVisible.length) {
    fail(
      `site.author 里**数据源侧**的身份主页形态链接缺 ${fmt(missingVisible)}——` +
        `登记清单里有、site.author 里没有（或指向别的账号）：人读路径与机读路径对不上，` +
        `读者看到的身份和结构化数据里声明的身份不是一回事。` +
        `（本条扫的是**数据源字段**；产物里真正渲染出去的链接由 I7 单独扫。）`
    );
  }
  if (extraVisible.length) {
    fail(
      `site.author 里**数据源侧**的身份主页形态链接多出 ${fmt(extraVisible)}——` +
        `它们不在本判据的登记清单里：页面上露出来的身份没有登记，等于少一个锚。` +
        `两种情形都长这样：① 真要新增一个身份平台（换个主机的账号）→ 先登记进 ` +
        `scripts/lib/identity.cjs 的 IDENTITY_SAMEAS **和**本文件的 ORACLE_SAMEAS` +
        `（并同步 EXPECTED_COUNT / ORACLE_SET_SHA256）；` +
        `② 这个链接其实不是账号主页（仓库页、记录页之类）→ 它的 URL 形态不该是` +
        `"一段式账号"，请改成内容形态的 URL（更深的路径），或把它从 site.author 移出。`
    );
  }
  /* I5 自证存活：一个都没识别出来 = 判据失效（URL 形态规则坏了 / 数据源
     改得面目全非），必须自己叫出来——"没报错"和"没问题"长得一模一样。 */
  if (!visible.size) {
    fail(
      `site.author 里一个"身份主页形态"的链接都没识别出来` +
        `（扫过 ${urlFields} 个链接字段）——本条没有生效。`
    );
  }
  visibleIdentityCount = visible.size;
  visibleUrlFieldCount = urlFields;
  visibleIdentityChecked = true;
} else {
  note(
    `期望集自身失守（锚判据已判红）→ 本轮**跳过**人读路径判定（I5）：` +
      `理由同 I1——此刻的期望集不可信，` +
      `"页面上少了谁 / 多出了谁"这种结论会顺着假阳性把人引到改错的地方。`
  );
}

/* ---------- I6：ORCID 值域 —— 全站声明的每一个 ORCID 都必须已登记 ----------
   为什么要有这条（一次实测出来的漏洞，不是假想）：
     门禁 23 查的是**产物 JSON-LD 里** Person 节点的 sameAs ↔ canonical @id
     双向绑定。而作者列表里的 publications[].authorList[].orcid 只渲染成
     HTML 里的 <a href="https://orcid.org/…">，**从不进入 JSON-LD**
     → 那一路根本不在门禁 23 的视野里。
     又因为门禁 23 查的是"节点之间一致"，把作者列表里的 ORCID **一致地**
     换成别的 ID，各节点之间仍然彼此一致 → 全绿。
     实测（隔离克隆，整链 build）：把 authorList 里 3 个非 null 的 orcid
     统一改成同一个不存在的 ID → **build exit 0、门禁全绿**，
     而产物里 19 处 orcid.org/0000-0003-1710-892X 照常渲染出去。
     → 现有门禁守的是"自洽"，**不守"这个 ORCID 值对不对"**。
     换句话说：门禁能抓住"各节点之间打架"，抓不住"全站一致地写错"。

   两侧都要扫，缺一不可：
     ① 产物侧（HTML 里的 orcid.org/<id>）—— 抓"已经渲染出去、被人看到的"；
     ② 数据源侧（authorList[].orcid 的**值**）—— 抓"改了但暂时没渲染的"。
        只扫产物侧的话，把一个不渲染的字段改成错值就又是一个盲区。
*/
let orcidFoundInSite = 0;
let orcidFoundInSource = 0;
{
  const normId = (raw) => {
    const m = String(raw || "").trim().match(/([0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9Xx])/);
    return m ? m[1].toLowerCase() : "";
  };
  const allow = new Set(ORCID_ALLOWLIST.map((s) => s.toLowerCase()));

  /* 锚：条数 + 哈希。白名单自身失守时**不**拿它去比产物
     （拿一把自己坏掉的尺子量产物，报出来的是假阳性）。 */
  let allowTrustworthy = true;
  if (allow.size !== ORCID_ALLOWLIST_COUNT) {
    allowTrustworthy = false;
    fail(
      `ORCID 白名单有 ${allow.size} 条，与本判据锚定的 ${ORCID_ALLOWLIST_COUNT} 条不符` +
        `——白名单被改短（或改长）时判据就跟着变，红不了了。` +
        `确要增删 ORCID，请同步改 scripts/check-identity-handles.cjs 的 ORCID_ALLOWLIST_COUNT。`
    );
  }
  const allowHash = crypto
    .createHash("sha256")
    .update([...allow].sort().join("\n"))
    .digest("hex");
  if (allowHash !== ORCID_ALLOWLIST_SHA256) {
    allowTrustworthy = false;
    fail(
      `ORCID 白名单的哈希锚对不上：现在算出来是 ${allowHash}，` +
        `本文件锚着 ${ORCID_ALLOWLIST_SHA256}——白名单被改过而哈希锚没同步` +
        `（改白名单是合法操作，但要把上面这串新哈希贴回 ORCID_ALLOWLIST_SHA256）。`
    );
  }

  if (!allowTrustworthy) {
    note(
      `ORCID 白名单自身失守（条数锚或哈希锚已判红）→ 本轮**跳过** ORCID 值域判定（I6）：` +
        `此刻的白名单不可信，拿它去比产物，报出来的"这个 ORCID 没登记"是**假阳性**。`
    );
  } else {
    /* ① 产物侧：ORCID **字面量**（不只 orcid.org/<id> 形态）
       为什么扫字面量而不是只扫链接：同一个 ORCID 在 **HTML 产物**里有好几种写法——
       链接（orcid.org/<id>）、页面上的纯文本。只认链接那一种形态，纯文本就漏了
       （"换一种写法就不受管"本身就是个洞）。
       ⚠️ 覆盖范围要说清（本条扫的是**产物里的 .html**，**不含**
       publications.bib / publications.ris）：那两份产物里的 orcid={…} / UR
       形态**不在本条视野内** —— 要管它们是另一条判据的事，这里不声称覆盖。 */
    const ORCID_LITERAL_RE = /\b[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9Xx]\b/g;
    const inSite = new Map(); // id → Set(相对路径)
    for (const file of htmlFiles) {
      const rel = path.relative(SITE, file);
      const html = fs.readFileSync(file, "utf8");
      for (const m of html.matchAll(ORCID_LITERAL_RE)) {
        const id = m[0].toLowerCase();
        if (!inSite.has(id)) inSite.set(id, new Set());
        inSite.get(id).add(rel);
      }
    }
    /* ② 数据源侧：作者列表里的 orcid 值 */
    const inSource = new Map(); // id → 位置描述数组
    for (const [pi, pub] of (siteData.publications || []).entries()) {
      for (const [ai, a] of ((pub && pub.authorList) || []).entries()) {
        if (!a || !a.orcid) continue;
        const id = normId(a.orcid);
        if (!id) {
          fail(
            `publications[${pi}].authorList[${ai}].orcid 的值不是合法 ORCID 形态` +
              `（${a.orcid}）——本条判不出它是哪个标识，只能判红。`
          );
          continue;
        }
        if (!inSource.has(id)) inSource.set(id, []);
        inSource.get(id).push(`publications[${pi}].authorList[${ai}]（${a.name}）`);
      }
    }

    /* ③ 判定：白名单外的 id 一律判红 */
    for (const [id, rels] of inSite) {
      if (allow.has(id)) continue;
      const shown = [...rels].slice(0, 3).join("、") + (rels.size > 3 ? ` 等 ${rels.size} 个产物` : "");
      fail(
        `产物里出现**未登记**的 ORCID ${id}（${shown}）——` +
          `本站声明的身份标识必须是登记在册的那几个（${fmt(ORCID_ALLOWLIST)}）。` +
          `真要声明新的 ORCID，先把它登记进 ORCID_ALLOWLIST` +
          `（并同步 ORCID_ALLOWLIST_COUNT 与 ORCID_ALLOWLIST_SHA256），再改数据。`
      );
    }
    for (const [id, locs] of inSource) {
      if (allow.has(id)) continue;
      fail(
        `数据源里出现**未登记**的 ORCID ${id}（${locs.join("、")}）——` +
          `白名单是 ${fmt(ORCID_ALLOWLIST)}。` +
          `没渲染出来的错值同样要抓：否则改一个暂时不渲染的字段就又是一个盲区。`
      );
    }

    /* ④ 自证存活：一条都没扫到 = 本条没生效（"没报错"和"没问题"长得一样） */
    if (!inSite.size) {
      fail(
        `产物里一处 ORCID 链接都没扫到（扫了 ${htmlFiles.length} 个 HTML）——本条没有生效。`
      );
    }
    if (!inSource.size) {
      fail(`数据源里一个 ORCID 值都没扫到——本条没有生效。`);
    }
    /* ⑤ 白名单覆盖：登记在册的每一个 ORCID 都得在数据源里真的出现，
       否则"清单"和"数据源"已经对不上（删了一方而另一方还留着）。 */
    for (const id of allow) {
      if (!inSource.has(id)) {
        fail(
          `登记在册的 ORCID ${id} 在数据源里一处都没出现——` +
            `清单与数据源对不上（可能删了数据却没删登记，或反之）。`
        );
      }
    }
    orcidFoundInSite = inSite.size;
    orcidFoundInSource = inSource.size;
  }
}

/* ---------- I7：产品侧可见身份链接（人读路径）必须逐字在登记清单里 ----------
   为什么要有这条（一次具体的实测漏洞，不是假想）：
     I1 管的是**机读路径**（产物 JSON-LD 里的 sameAs ↔ 独立期望集）；
     I5 管的是**数据源**（site.author 里那些会被渲染出去的链接字段）。
     两者都**不扫产物里人看得见的 <a href>**。而产物里的可见链接有两类来源：
       ① 模板从 site.author 派生的（I5 间接管住）；
       ② **正文里写死的字面量**——典型是 src/content/about.md:38 的 CSDN 链接
          （身份派生门禁的 D4 只扫 .njk、不扫 .md，理由见该文件注释）。
     实测（peer 的 W3，整链 build）：把 about.md 那条 CSDN 链接换成
       https://blog.csdn.net/impersonator →
       **整链 build exit 0、门禁全绿**，产物里"真句柄 3 处 + 冒名 1 处"，
       页面公然指向非本人账号，而 JSON-LD 里的 sameAs 仍是本人 →
       人读路径与机读路径指向了**两个不同的人**，而没有任何一道门禁叫。
     本条把**产物侧的可见身份链接**纳入判据：
       · 候选识别用与 I5 **同一套**"身份主页形态"规则（同一主机 + 同一段数 +
         同一角色词）——两处抄同一套规则就会漂，所以抽成一份共用；
       · 候选必须逐字落在登记清单里 → **多出 = 判红**；
       · **只判"多出"，不判"缺"**：本站不必把 5 条句柄全都显示出来
         （OpenAlex 放不放页脚是本人的待决策项，见日志「待决策」段），
         "缺"的方向归 I5（它看的是 site.author 那一份数据源）。
       · **ORCID 不由本条判**：orcid.org 上每一个 id 都是"某个人"的身份主页形态，
         论文页会合法地链到**同行**的 ORCID（形态与本人的完全一样）——
         那是 **I6 的值域白名单**该管的事，两条判据不重复管同一件事。
         （I5 当年刻意不扫产物，也是因为这个；I6 落地后才把这条路让出来。）

   ⚠️ 已知边界（写明覆盖范围，不夸大）：
     · 期望集里**没有的主机**不会被认成"身份主页形态" → 新平台形态进不了比较；
     · 产物里若合法地链到**他人的**非 ORCID 主页（如合作者的 GitHub），
       本条会把它当成"多出"判红——目前站内没有这种链接；
       真要出现时需要一条独立的"他人主页"白名单（尚未建立，见日志待办）。 */
let productVisibleCount = 0;
let productVisibleChecked = false;
if (anchorTrustworthy) {
  const registeredKeys = new Set(
    [...expectedSet].map((u) => profileKey(u)).filter(Boolean)
  );
  const extra = new Map(); // 原始 URL → Set(产物相对路径)
  const seenKeys = new Set();
  for (const file of htmlFiles) {
    const rel = path.relative(SITE, file);
    const html = fs.readFileSync(file, "utf8");
    for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)) {
      const href = String(m[1] || "").trim();
      if (!href) continue;
      const s = urlShape(href);
      if (!s) continue; // 相对链接 / 非 URL：本条不判
      if (s.host === "orcid.org") continue; // ORCID 的值域由 I6 管
      if (!isIdentityProfile(href)) continue; // 内容链接（深层路径）不算身份
      const key = profileKey(href);
      if (!key) continue;
      seenKeys.add(key);
      if (registeredKeys.has(key)) continue;
      if (!extra.has(href)) extra.set(href, new Set());
      extra.get(href).add(rel);
    }
  }
  for (const [href, rels] of extra) {
    const shown =
      [...rels].slice(0, 3).join("、") + (rels.size > 3 ? ` 等 ${rels.size} 个产物` : "");
    fail(
      `产物里出现**未登记**的身份主页形态链接 ${href}（${shown}）——` +
        `它是**账号主页形态**的链接（形态规则与主机无关：见文件头），但不是登记在册的那一条：` +
        `页面上人读到的身份，与结构化数据里声明的身份不是同一个人。` +
        `三条正当出路：① 改回登记在册的那一条（${[...expectedSet].join(" / ")}）；` +
        `② 改成一个"内容链接"形态（深层路径，如 github.com/<user>/<repo>）；` +
        `③ 若它确属**本人**的另一个账号，先登记进 ORACLE_SAMEAS` +
        `（并同步 EXPECTED_COUNT 与 ORACLE_SET_SHA256）。` +
        `若它属**他人**（如合作者主页），本条不适用——那需要一条独立的` +
        `"他人主页"白名单，本仓目前没有。`
    );
  }
  /* 自证存活：一个候选都没识别出来 = 判据失效（规则坏了 / 产物形态变了），
     必须自己叫出来——"没报错"和"没问题"长得一模一样。 */
  if (!seenKeys.size) {
    fail(
      `产物里一处"身份主页形态"的可见链接都没识别出来` +
        `（扫了 ${htmlFiles.length} 个 HTML）——本条没有生效。`
    );
  }
  productVisibleCount = seenKeys.size;
  productVisibleChecked = true;
} else {
  note(
    `期望集自身失守（锚判据已判红）→ 本轮**跳过**产品侧可见身份链接判定（I7）：` +
      `理由同 I1——此刻的期望集不可信，"页面上多出了谁"会是假阳性。`
  );
}

/* ---------- I4：自证存活 ---------- */
if (group.length < 2) {
  fail(
    `全站只找到 ${group.length} 个带本人 @id（${OWNER_ID}）的 Person 节点——` +
      `本条的判断对象都没了，"没报错"和"没问题"长得一模一样。`
  );
}
if (!compared) {
  fail(
    `本人节点组里一处 sameAs 都没比上（${group.length} 个节点全都没有这个字段）——` +
      `本条没有生效。字段整体缺失这一形态由门禁 23 兜，但本条不能空跑。`
  );
}

/* I0 的**结构性兜底**：自证代码整段被删 / 被注释掉 → 上面那条锚校验也不会跑，
   这里再兜一层（锚在文件顶部、这段在文件底部，两处不同位置）。
   少这一层的话，"自证代码被删"这种改法会安静地留下一个绿。 */
if (!shapeSelfCheckPassed) {
  fail(
    "形态规则自证没有跑起来（自证代码被删、被注释，或整段没执行）——" +
      "这一条缺失时，I5/I7 就算照常打印「通过」，也只是「没看见」，不是「核过」。"
  );
}

if (problems.length) {
  console.error("身份句柄完整性门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

console.log(
  `身份句柄完整性门禁通过：本人（${OWNER_ID}）在 ${group.length} 个节点上被描述，` +
    `比过 ${compared} 处 sameAs，每处都等于本判据的独立期望集（${expectedSet.size} 条：` +
    `${[...expectedSet].join(" / ")}）；数据源清单与期望集逐项一致；` +
    `${shapeSelfCheckSummary}` +
    (visibleIdentityChecked
      ? `site.author 里**被识别为**「账号主页形态」的链接 ${visibleIdentityCount} 条` +
        `（扫过 ${visibleUrlFieldCount} 个链接字段；这个数是"被识别出来的"条数，` +
        `不是"页面上全部链接"的条数），与登记清单逐项一致（少一条、多一条都判红）。`
      : `site.author 侧的身份链接本轮未判定（期望集自身失守，或 I5 判据不在本文件里）`) +
    (productVisibleChecked
      ? `产物里**被识别为**「账号主页形态」的可见链接 ${productVisibleCount} 个` +
        `（按主机+路径去重，扫过 ${htmlFiles.length} 个 HTML；同样是"被识别出来的"个数），` +
        `全部在登记清单内。`
      : `产物侧可见身份链接本轮未判定（期望集自身失守）。`)
);
if (notes.length) {
  console.log("—");
  notes.forEach((n) => console.log(`  · ${n}`));
}
