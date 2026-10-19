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
 * 四条判据：
 *   I1 产物侧全集 —— 全站 @id == site.url + "/#person" 的 Person 节点，
 *                    sameAs 归一化集合必须**等于**共享模块 scripts/lib/identity.cjs
 *                    的清单集合：缺项红（丢信息才是坏事）。
 *                    **多出**未登记句柄 → 只报 note（多出来不丢信息）。
 *   I2 锚 —— 期望集合的**条数 == EXPECTED_COUNT**、且**必须含本人 ORCID**。
 *            这两条**不依赖清单内容**，所以只能住在**本文件**里：
 *            写在共享模块里的话，模块被改短时期望集合跟着变短，判据就红不了
 *            ——那等于判据把自己卸掉了。**清单内容单一来源；不依赖清单内容的
 *            锚留在判据里。**
 *   I3 口径 —— 字段缺失（没有 sameAs 字段 / 显式 null）**不算缺失、不算冲突**，
 *              沿用门禁 31 的口径；这种形态由门禁 23 兜（带 canonical @id 的
 *              节点必须带本人 ORCID）。
 *   I4 自证存活 —— 本人节点组 ≥ 2 个，且本条至少比过一处 sameAs，
 *              否则判红（"没报错"和"没问题"长得一模一样）。
 *
 * ⚠️ ANCHOR_ORCID 故意**不**从共享模块取：锚必须独立于被判据的数据源，
 *   否则有人把模块里的 ORCID 换成别人的，本条会跟着一起变，红不了。
 *   代价是：ORCID 换了要同时改本文件与共享模块；忘了改本文件 → 本条判红
 *   （这是有意的：锚失守就该叫）。
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

const ROOT = path.resolve(__dirname, "..");
/* SITE_DIR 只给故障注入用：改产物做注入测试时如果直接改 _site，
   会和并发的 build 抢同一个目录。 */
const SITE = process.env.SITE_DIR
  ? path.resolve(process.env.SITE_DIR)
  : path.join(ROOT, "_site");

/* ---------- 期望集合：内容取自共享模块（单一真源） ---------- */
const { IDENTITY_SAMEAS } = require("./lib/identity.cjs");

/* ---------- 锚：不依赖清单内容，因此写死在本判据里 ---------- */
const EXPECTED_COUNT = 5;
const ANCHOR_ORCID = "https://orcid.org/0009-0005-3511-0546";

const problems = [];
const notes = [];
const fail = (msg) => problems.push(msg);
const note = (msg) => notes.push(msg);

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
const expectedSet = new Set(IDENTITY_SAMEAS);

/* ---------- I2：锚自身的两条弱不变量 ---------- */
{
  if (expectedSet.size !== EXPECTED_COUNT) {
    fail(
      `身份句柄清单有 ${expectedSet.size} 条，与本判据锚定的 ${EXPECTED_COUNT} 条不符` +
        `——清单被改短（或改长）时，期望集合会跟着变，判据就红不了了。` +
        `确要增删句柄，请同步改 scripts/check-identity-handles.cjs 的 EXPECTED_COUNT。`
    );
  }
  if (!expectedSet.has(ANCHOR_ORCID)) {
    fail(
      `身份句柄清单里没有本人 ORCID（${ANCHOR_ORCID}）——` +
        `清单里必须有这条权威标识，否则"本人"在结构化数据里就没有锚。`
    );
  }
}

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
{
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
    note(
      `有 ${extraHandles.size} 条 sameAs 不在登记清单里：${fmt([...extraHandles])}——` +
        `只记一笔不判红（多出来不丢信息；登记清单在 scripts/lib/identity.cjs）`
    );
  }
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
    `比过 ${compared} 处 sameAs，每处都等于登记清单（${expectedSet.size} 条：` +
    `${[...expectedSet].join(" / ")}）。`
);
if (notes.length) {
  console.log("—");
  notes.forEach((n) => console.log(`  · ${n}`));
}
