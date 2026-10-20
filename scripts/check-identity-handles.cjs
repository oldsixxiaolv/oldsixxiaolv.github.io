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
 * 五条判据：
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
 * ⚠️ 为什么要留两份清单（共享模块 + 本文件的独立期望集）：
 *   仓库的规矩是"判据两处各抄一份 → 改一处忘另一处"，但那条规矩治的是
 *   **静默漂移**，靠**逐字核对**兜底；这里两处恰恰就是"逐字核对"的关系（I2d），
 *   漂了就红 → 不会静默。而"清单只留一份"会让期望集与被判数据同源 →
 *   等长替换全盲（上面那次实测）。代价是**合法增删要改两处**，
 *   这个代价是有意接受的；漏改 → 判红（漂了就该叫）。
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

const problems = [];
const notes = [];
const fail = (msg) => problems.push(msg);
const note = (msg) => notes.push(msg);

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

/* ---------- I5：人读路径（页面上看得见的身份链接）必须与登记清单一致 ---------- */
if (anchorTrustworthy) {
  /* 身份"主页形态"：某主机上**指向一个账号主页**的 URL 形态。
     同一主机上的深层链接（github.com/<user>/<repo>、researchgate.net/publication/...）
     是**内容链接**，不是"本人是哪个账号"，不该被这条判红。
     · 一段式主机（github.com/<user>、orcid.org/<id>、blog.csdn.net/<user>、
       openalex.org/<id>）：任何一段式路径都算主页形态；
     · 两段式且首段是角色词的主机（researchgate.net/profile/<Name>）：
       只有首段相同才算（/publication/... 是内容链接）。 */
  const urlShape = (raw) => {
    try {
      const u = new URL(String(raw).trim());
      return { host: u.host, segs: u.pathname.split("/").filter(Boolean) };
    } catch {
      return null;
    }
  };
  const hostShape = new Map();
  for (const u of ORACLE_SAMEAS) {
    const s = urlShape(u);
    if (!s) continue;
    hostShape.set(s.host, {
      segs: s.segs.length,
      roleFirst: s.segs.length >= 2 ? s.segs[0] : null,
    });
  }
  const isIdentityProfile = (raw) => {
    const s = urlShape(raw);
    if (!s) return false;
    const shape = hostShape.get(s.host);
    if (!shape) return false;
    if (s.segs.length !== shape.segs) return false;
    if (shape.roleFirst && s.segs[0] !== shape.roleFirst) return false;
    return true;
  };

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
      `site.author 里**页面上可见**的身份链接缺 ${fmt(missingVisible)}——` +
        `登记清单里有、页面上没有（或指向别的账号）：人读路径与机读路径对不上，` +
        `读者看到的身份和结构化数据里声明的身份不是一回事。`
    );
  }
  if (extraVisible.length) {
    fail(
      `site.author 里**页面上可见**的身份链接多出 ${fmt(extraVisible)}——` +
        `它们不在本判据的登记清单里：页面上露出来的身份没有登记，等于少一个锚。`
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
  visibleIdentityChecked = true;
} else {
  note(
    `期望集自身失守（锚判据已判红）→ 本轮**跳过**人读路径判定（I5）：` +
      `理由同 I1——此刻的期望集不可信，` +
      `"页面上少了谁 / 多出了谁"这种结论会顺着假阳性把人引到改错的地方。`
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
    (visibleIdentityChecked
      ? `页面上可见的身份链接 ${visibleIdentityCount} 条，与登记清单一致。`
      : `页面上可见的身份链接本轮未判定（期望集自身失守，或 I5 判据不在本文件里）`)
);
if (notes.length) {
  console.log("—");
  notes.forEach((n) => console.log(`  · ${n}`));
}
