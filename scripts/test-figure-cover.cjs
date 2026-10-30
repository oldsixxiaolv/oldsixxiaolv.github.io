#!/usr/bin/env node
/**
 * 论文封面图一致性门禁的**自测**（四件套）—— 证明 CV1–CV4 每一条判据、
 * 以及门禁里**每一条红因出口**，都**能被观测到变红**。
 *
 * 为什么要有这个自测（老教训，不是假想）：
 *   一条**永远不会红**的判据，给出的是"看起来很确定的绿"——它比没有判据更坏，
 *   因为它把"盲区"包装成"已核过"。本门禁判的是"四个出口是不是同一张图"，
 *   而"注入没生效"（正则没匹配上、正文图那个 <img> 没定位到、归一化写错了）
 *   恰恰是最容易发生、也最不容易看出来的失败模式。
 *
 * ⚠️ **老版自测（CV0–CV11 共 12 档）的四个真实缺口**（D68 那轮修的就是它们）：
 *   ① **零红因归属表** —— 门禁里有 **16 处红因出口**，老版自测只认得
 *      「门禁 CV1」「门禁 CV2」「门禁 CV3」三种**行首带编号**的文案；
 *      而 16 条红因里**只有 7 条行首带编号**，另外 **9 条行首没有编号**
 *      （「真源读不出来」「没有 slug」「论文页产物不存在」「找不到论文页源目录」
 *      「真源里一篇带 figure 的论文都没有」「应验 N 篇实测只验了 M 篇」
 *      「找不到 package.json」「门禁自己被卸掉了」）⇒ **它们一条都测不到**。
 *   ② **零覆盖度自证** —— 门禁日后新增一条红因出口，老版自测**毫无察觉**。
 *   ③ **零判据级负对照** —— 无法证明"红的那条红因确实由这条判据产生"。
 *   ④ **判红档只看退出码 + 只查「含」** —— 门禁自身崩了（语法错、抛异常）
 *      也是 exit 1，会被当成判红放过；而且"红因条数对不对、是不是只红了我要的那条"
 *      完全看不见（老版 SP 档里 CV7 一档就红 3 条、CV8 红 4 条，老版只查「含 CV3」）。
 *
 * 本版做五件事（门禁本体只在 **D67 修复**里动过「判红前必须先打印」，
 *   **判定逻辑一字未改**）：
 *   ① **红因归属表**（`CAUSES` 16 条）：把门禁的 **16 处 `note()` 出口**逐条登记，
 *      每条归属恰好认领**一个**出口点（**区间法**静态绑定），归属片段**互不包含**
 *      且在门禁源码里**只出现一次**。
 *   ② **归属纯净**：运行时每条红因行**恰好**被一条归属认领 —— 按「**行首有没有编号**」
 *      分流：行首有编号的只在**该判据**的归属里找片段；行首没编号的只在
 *      **无编号归属**里找。出现"没编号却被当成某判据"或"一条红因被两条归属认领"当场判红。
 *   ③ **双向覆盖度自证**（COV1–COV7）：门禁解析出的判据集合 == 静态清单（**双向**）、
 *      出口数 == 归属条数、每条归属恰好认领一个出口、片段互不包含且唯一、
 *      每条判据至少有一条归属、**每条红因至少有一档能证明它会变红**。
 *   ④ **判据级负对照**（NC-CV1–NC-CV4）：在**门禁副本**上把某条判据的收集型出口
 *      全部卸掉（`if (false) ` 前缀，**行数不变**），再跑同一条注入 ⇒
 *      期望红因 = 原集合 − 被卸判据的归属。
 *   ⑤ **档位清单守卫**（前置守卫，**不算档**）：实际跑过的档位号集合 == 静态清单 ⇒
 *      **删掉任何一档当场暴露**（否则少跑一档照样全绿 ⇒ SP12 这个 D67 护栏被删掉就没人看守）。
 *
 * 档位（**34 档**）：
 *   SP0–SP22  注入档（23 档）：逐条红因出口都要有档可证
 *   NC-CV1–NC-CV4  判据级负对照（4 档）
 *   COV1–COV7      覆盖度自证（7 档）
 *
 * ⚠️ **SP11 是故意判绿的边界负对照**：真源与产物**一起**改错 ⇒ 四个出口仍彼此一致
 *   ⇒ 门禁**抓不到**。这是**已知边界**不是缺陷（写成一档会跑的自测，是为了让这个
 *   边界**可证**，而不是只在注释里说说）。封面图选得对不对仍靠人工核。
 *
 * ⚠️ **SP12 / SP13 是缺陷 D67 的修复护栏**：真源读不出来时，门禁必须**先打印失败横幅
 *   与那条红因**再退出。早退过一次（收集完就立刻 exit）⇒ 红因被吞、失败横幅也来不及打
 *   ⇒ 外面只看到"exit 1、零输出"，连"为什么红"都看不到。
 *   SP12 用「真源文件**不存在**」触发，SP13 用「真源**存在但是语法错的 JS**」触发
 *   （解析阶段就抛 ⇒ 同一条 catch 路径）⇒ 两档都必须看到横幅 + 红因**恰为** P1。
 *
 * 用法：node scripts/test-figure-cover.cjs
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-figure-cover.cjs");
const SITE = path.join(ROOT, "_site");
const SITE_JS = path.join(ROOT, "src", "_data", "site.js");
const IDENTITY = path.join(ROOT, "scripts", "lib", "identity.cjs");
// ⚠️ site.js 的**同层依赖**（D131 踩到）：它 require 了 `../eleventy-draft.cjs`
//   （草稿判定的唯一真源）⇒ 沙箱里缺它 ⇒ site.js 加载即抛错 ⇒
//   门禁读不到站点数据 ⇒ 报出与注入无关的假红。
const DRAFT_MODULE = path.join(ROOT, "src", "eleventy-draft.cjs");
const PAPERS = path.join(ROOT, "src", "content", "papers");
const PKG = path.join(ROOT, "package.json");

const FAIL_BANNER = "论文封面图一致性门禁未通过：";
const PASS_BANNER = "论文封面图一致性门禁通过";

/* 静态判据清单 —— 必须与门禁源码里解析出的判据集合**双向**相等 */
const CRITERIA = ["CV1", "CV2", "CV3", "CV4"];

/**
 * 红因归属表：门禁的 **16 处 `note()` 出口**逐条登记。
 *   owner   —— 这条红因归哪条判据（null = 前置类，不属于任何一条判据）
 *   numbered —— 这条红因**行首**有没有判据号（"门禁 CV1："这种）
 *              ⚠️ 行首有没有编号是**两回事**：CV3 的三条红因里只有一条行首带编号。
 *   site    —— "push" = 走 `note()` 进 problems；"early" = 收集完立刻 exit（红因被吞）
 *              ⚠️ D67 修好后门禁里**不应再有** "early" 出口 ⇒ COV3 把它钉成 0
 *              （真退回旧写法，COV3 立刻转红）。
 *   frag    —— 红因文案里的一段**字面量**（运行时靠它认领；静态靠它绑定出口点）
 */
const CAUSES = [
  { id: "P1", owner: null, numbered: false, site: "push", frag: "读不到真源" },
  { id: "P2", owner: null, numbered: false, site: "push", frag: "没有 slug，算不出论文页路径" },
  { id: "P3", owner: null, numbered: false, site: "push", frag: "论文页产物不存在" },
  { id: "C1a", owner: "CV1", numbered: true, site: "push", frag: "找不到正文成果图" },
  { id: "C1b", owner: "CV1", numbered: true, site: "push", frag: "取不到值——出口缺一个" },
  { id: "C1c", owner: "CV1", numbered: true, site: "push", frag: "指向站外地址" },
  { id: "C1d", owner: "CV1", numbered: true, site: "push", frag: "与真源不是同一张图" },
  { id: "C2a", owner: "CV2", numbered: true, site: "push", frag: "缺——尺寸没有声明" },
  { id: "C2b", owner: "CV2", numbered: true, site: "push", frag: "真源 publications[].figure 里是" },
  { id: "C3a", owner: "CV3", numbered: true, site: "push", frag: "front matter 里还有" },
  { id: "C3b", owner: "CV3", numbered: false, site: "push", frag: "找不到论文页源目录" },
  { id: "C3c", owner: "CV3", numbered: false, site: "push", frag: "一个带 pubKey 的论文页源文件都没找到" },
  { id: "C4a", owner: "CV4", numbered: false, site: "push", frag: "真源里一篇带 figure 的论文都没有" },
  { id: "C4b", owner: "CV4", numbered: false, site: "push", frag: "实测只验了" },
  { id: "C4c", owner: "CV4", numbered: false, site: "push", frag: "找不到 package.json，无法确认本门禁是否接在 build 上" },
  { id: "C4d", owner: "CV4", numbered: false, site: "push", frag: "门禁自己被卸掉了" },
];

/* ================= 门禁源码分析（注释感知） ================= */

/**
 * 把源码里的注释换成等长空白 ⇒ **偏移量不变**，于是注释里的 `note(` 不会被
 * 当成出口点，而片段位置仍与原始源码一一对应。
 */
function stripComments(text) {
  let out = "";
  let i = 0;
  const n = text.length;
  let inBlock = false;
  while (i < n) {
    const c = text[i];
    const c2 = text[i + 1];
    if (inBlock) {
      if (c === "*" && c2 === "/") {
        inBlock = false;
        out += "  ";
        i += 2;
        continue;
      }
      out += c === "\n" ? "\n" : " ";
      i++;
      continue;
    }
    if (c === "/" && c2 === "*") {
      inBlock = true;
      out += "  ";
      i += 2;
      continue;
    }
    if (c === "/" && c2 === "/") {
      while (i < n && text[i] !== "\n") {
        out += " ";
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** 找出所有 `note(` 调用点及其代码区间（注释感知，偏移量与原文一致） */
function noteRegions(text) {
  const code = stripComments(text);
  const re = /(?<![.\w$])note\s*\(/g;
  const out = [];
  let m;
  while ((m = re.exec(code))) {
    const start = m.index;
    let depth = 0;
    let i = start + m[0].length - 1;
    let quote = null;
    for (; i < code.length; i++) {
      const ch = code[i];
      if (quote) {
        if (ch === "\\") {
          i++;
          continue;
        }
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        continue;
      }
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push({ start, end: i, callEnd: i + 1 });
    re.lastIndex = i;
  }
  return out;
}

/** 这个 note() 之后是不是紧跟着 `process.exit(`（⇒ 早期退出型：红因被吞） */
function isEarlyExit(text, region) {
  const tail = stripComments(text).slice(region.callEnd, region.callEnd + 200);
  return /^\s*;?\s*process\.exit\s*\(/.test(tail);
}

/** 门禁源码里出现过的判据号集合（静态清单要跟它双向相等） */
function parsedCriteria(text) {
  return [...new Set(text.match(/\bCV\d\b/g) || [])].sort();
}

/* ================= 夹具站 ================= */

const siteData = require(SITE_JS);
const pub = siteData.publications.find((p) => p && p.figure && p.figure.src);
if (!pub) {
  console.error("封面图门禁自测失败：真源里没有带 figure 的论文记录。");
  process.exit(1);
}
const SLUG = pub.slug;
const PAPER_HTML = path.join(SITE, "papers", SLUG, "index.html");
const PAPER_MD = path.join(PAPERS, SLUG, "paper.md");

for (const [label, p] of [
  [`_site/papers/${SLUG}/index.html`, PAPER_HTML],
  ["src/content/papers/*/paper.md", PAPER_MD],
  ["src/_data/site.js", SITE_JS],
  ["scripts/lib/identity.cjs", IDENTITY],
  ["package.json", PKG],
]) {
  if (!fs.existsSync(p)) {
    console.error(`封面图门禁自测失败：找不到 ${label}（${p}）。`);
    process.exit(1);
  }
}

/* 另一张**真实存在**的图（用来做"换成另一张图"的注入） */
const OTHER = "/assets/img/og/og-1200x630.png";

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function makeSandbox() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mh-figcover-"));
  copyFile(PAPER_HTML, path.join(tmp, "_site", "papers", SLUG, "index.html"));
  copyFile(SITE_JS, path.join(tmp, "src", "_data", "site.js"));
  copyFile(DRAFT_MODULE, path.join(tmp, "src", "eleventy-draft.cjs"));
  copyFile(IDENTITY, path.join(tmp, "scripts", "lib", "identity.cjs"));
  copyFile(PAPER_MD, path.join(tmp, "src", "content", "papers", SLUG, "paper.md"));
  copyFile(PKG, path.join(tmp, "package.json"));
  return tmp;
}

function sbPaths(tmp) {
  return {
    tmp,
    html: path.join(tmp, "_site", "papers", SLUG, "index.html"),
    site: path.join(tmp, "src", "_data", "site.js"),
    md: path.join(tmp, "src", "content", "papers", SLUG, "paper.md"),
    pkg: path.join(tmp, "package.json"),
  };
}

function editText(file, fn) {
  const before = fs.readFileSync(file, "utf8");
  const after = fn(before);
  if (after === before) {
    console.error(`封面图门禁自测失败：注入没有改动 ${file}（注入本身失效了）。`);
    process.exit(1);
  }
  fs.writeFileSync(file, after);
}

/**
 * 改产物里某个 @type 的 JSON-LD 节点。
 * ⚠️ 不用正则去替 `"image": "…"`：产物里**第一个** `"image"` 是作者头像
 * （Person 节点），文章图在 ScholarlyArticle 节点里——替错一处就是
 * "注入生效了但没注到该注的地方"，自测会假装通过。
 */
function editJsonLd(html, type, fn) {
  const re = /(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g;
  let touched = false;
  const out = html.replace(re, (all, open, body, close) => {
    let obj;
    try {
      obj = JSON.parse(body.trim());
    } catch (_) {
      return all;
    }
    const isGraph = obj && !Array.isArray(obj) && Array.isArray(obj["@graph"]);
    const nodes = Array.isArray(obj) ? obj : isGraph ? obj["@graph"] : [obj];
    let changed = false;
    const next = nodes.map((n) => {
      if (n && n["@type"] === type) {
        changed = true;
        return fn(n);
      }
      return n;
    });
    if (!changed) return all;
    touched = true;
    const payload = Array.isArray(obj)
      ? next
      : isGraph
        ? { ...obj, "@graph": next }
        : next[0];
    return `${open}${JSON.stringify(payload, null, 2)}${close}`;
  });
  if (!touched) {
    console.error("封面图门禁自测失败：JSON-LD 注入没找到 @type=${type} 的节点。");
    process.exit(1);
  }
  return out;
}

function runGate(p, opts) {
  const o = opts || {};
  const r = spawnSync(process.execPath, [o.gate || GATE], {
    env: {
      ...process.env,
      SITE_DIR: path.join(p.tmp, "_site"),
      SITE_DATA_PATH: path.join(p.tmp, "src", "_data", "site.js"),
      PAPERS_DIR: path.join(p.tmp, "src", "content", "papers"),
      PKG_PATH: path.join(p.tmp, "package.json"),
      ...(o.env || {}),
    },
    encoding: "utf8",
  });
  return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
}

/** 门禁输出里的红因行（`  ✗ <消息>`），去掉前缀只留消息 */
function redCauseLines(out) {
  return out
    .split("\n")
    .filter((l) => /^\s*✗\s+/.test(l))
    .map((l) => l.replace(/^\s*✗\s+/, ""));
}

/**
 * 把一条红因行归到归属表条目上。
 * ⚠️ 分流口径：**行首**有没有判据号。有 ⇒ 只能在「该判据 + 行首带编号」的归属里找；
 *   没有 ⇒ 只能在「行首不带编号」的归属里找。
 */
function attributeRow(message) {
  const head = /^门禁\s+(CV\d+)/.exec(message);
  const pool = head
    ? CAUSES.filter((c) => c.numbered && c.owner === head[1])
    : CAUSES.filter((c) => !c.numbered);
  const hits = pool.filter((c) => message.includes(c.frag));
  return { head: head ? head[1] : null, ids: hits.map((c) => c.id) };
}

/* ================= 断言 ================= */

const results = [];
/** 所有档位实际认领过的归属条目 —— 收尾断言「每条红因至少有一档能证明它会红」 */
const coveredCauses = new Set();

function record(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${id}${detail ? " —— " + detail : ""}`);
}

/** 把一条红因行归到归属表条目上；归不纯（命中 0 条或 ≥2 条）当场判红 */
function attributeRows(rows) {
  const ids = [];
  const impure = [];
  for (const m of rows) {
    const a = attributeRow(m);
    if (a.ids.length !== 1) {
      impure.push(`「${m.slice(0, 60)}」被 ${a.ids.length} 条归属认领（${a.ids.join(",") || "无"}）`);
      continue;
    }
    ids.push(a.ids[0]);
    coveredCauses.add(a.ids[0]);
  }
  return { ids, impure };
}

function multisetEq(a, b) {
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.length === sb.length && sa.every((x, i) => x === sb[i]);
}

/**
 * 一档「注入 ⇒ 应当**恰好**红这么几条红因」。
 * @param want 期望的归属 id **多重集**（必须完全相等，不只是「包含」）
 */
function expectRed(id, setup, want, opts) {
  const o = opts || {};
  const tmp = makeSandbox();
  try {
    const p = sbPaths(tmp);
    if (setup) setup(p);
    const r = runGate(p, o);
    const rows = redCauseLines(r.out);
    const problems = [];
    if (r.code !== 1) problems.push(`期望 exit 1，实际 exit ${r.code}`);
    if (!r.out.includes(FAIL_BANNER)) problems.push("输出里没有门禁的失败横幅");
    const { ids, impure } = attributeRows(rows);
    impure.forEach((s) => problems.push("归属不纯：" + s));
    if (!multisetEq(ids, want)) {
      problems.push(`红因集合不是「恰为」：期望 [${want.join(",")}]，实际 [${ids.join(",")}]`);
    }
    if (problems.length) {
      record(id, false, problems.join("；"));
      return { ids };
    }
    record(id, true, `红了，判据归属 = ${want.join("+")}（${want.length} 条红因、归属纯净）`);
    return { ids };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** 一档「注入 ⇒ 必须全绿」：exit 0 + 通过横幅 + 零红因行 */
function expectGreen(id, setup, opts) {
  const o = opts || {};
  const tmp = makeSandbox();
  try {
    const p = sbPaths(tmp);
    if (setup) setup(p);
    const r = runGate(p, o);
    const rows = redCauseLines(r.out);
    const problems = [];
    if (r.code !== 0) problems.push(`期望 exit 0，实际 exit ${r.code}`);
    if (!r.out.includes(PASS_BANNER)) problems.push("输出里没有门禁的通过横幅");
    if (rows.length) problems.push(`期望零红因行，实际 ${rows.length} 行`);
    if (problems.length) {
      record(id, false, problems.join("；"));
      return { ids: [] };
    }
    record(id, true, "判绿（一个红因都不剩）");
    return { ids: [] };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/* ---------- 门禁副本：卸掉某条判据的收集型出口 ---------- */

/**
 * 造一个门禁副本，并把 `owner` 这条判据的**所有** `note()` 出口卸掉
 * （在调用前加 `if (false) ` 前缀 ⇒ **行数不变**、控制流不变、零崩溃风险）。
 */
function makeUnloadedGate(tmp, owner, mutate) {
  const src = fs.readFileSync(GATE, "utf8");
  const regions = noteRegions(src);
  const owners = regionOwners(src, regions);
  const targets = regions.filter((r, i) => owners[i] === owner);
  if (!targets.length) {
    console.error(`封面图门禁自测失败：判据 ${owner} 在门禁里没有可卸的收集型出口。`);
    process.exit(1);
  }
  let out = src;
  for (const r of targets.slice().sort((a, b) => b.start - a.start)) {
    out = out.slice(0, r.start) + "if (false) " + out.slice(r.start);
  }
  if (mutate) out = mutate(out, src);
  const gatePath = path.join(tmp, "gate", "check-figure-cover.cjs");
  fs.mkdirSync(path.dirname(gatePath), { recursive: true });
  fs.writeFileSync(gatePath, out);
  const chk = spawnSync(process.execPath, ["--check", gatePath], { encoding: "utf8" });
  if (chk.status !== 0) {
    console.error(`封面图门禁自测失败：门禁副本语法不合法（${owner}）：\n${chk.stderr}`);
    process.exit(1);
  }
  return { gatePath, changed: targets.length };
}

/** 每个 note() 区间归哪条判据（按归属片段落在哪个区间里定） */
function regionOwners(src, regions) {
  const owners = [];
  for (const r of regions) {
    const inside = CAUSES.filter((c) => {
      const pos = src.indexOf(c.frag);
      return pos >= 0 && pos >= r.start && pos <= r.end;
    });
    owners.push(inside.length === 1 ? inside[0].owner : null);
  }
  return owners;
}

/**
 * 一档判据级负对照：卸掉某条判据 ⇒ 同一注入的红因集合应当变成
 *   「原集合 − 被卸判据的归属」。
 */
function expectGreenAfterUnload(id, owner, setup, baseWant) {
  const tmp = makeSandbox();
  try {
    const p = sbPaths(tmp);
    const { gatePath } = makeUnloadedGate(tmp, owner);
    if (setup) setup(p);
    const r = runGate(p, { gate: gatePath });
    const rows = redCauseLines(r.out);
    const problems = [];
    if (r.code !== 0) problems.push(`期望 exit 0，实际 exit ${r.code}`);
    if (!r.out.includes(PASS_BANNER)) problems.push("输出里没有门禁的通过横幅");
    const { ids, impure } = attributeRows(rows);
    impure.forEach((s) => problems.push("归属不纯：" + s));
    const want = baseWant.filter((x) => {
      const c = CAUSES.find((e) => e.id === x);
      return !c || c.owner !== owner;
    });
    if (!multisetEq(ids, want)) {
      problems.push(`红因集合不是「原集合 − 被卸判据」：期望 [${want.join(",")}]，实际 [${ids.join(",")}]`);
    }
    if (problems.length) {
      record(id, false, problems.join("；"));
      return;
    }
    record(id, true, `卸掉 ${owner} 的收集型出口后，注入档的红因变成 [${want.join(",") || "空"}]`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/* ================= 注入档 ================= */

/* —— 产物侧注入 —— */
const INJ_OG_IMAGE = (p) => editText(p.html, (s) => s.replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${OTHER}$2`));
const INJ_TW_IMAGE = (p) => editText(p.html, (s) => s.replace(/(<meta name="twitter:image" content=")[^"]*(")/, `$1${OTHER}$2`));
const INJ_BODY_SRC = (p) =>
  editText(p.html, (s) => s.replace(/(class="paper-figure__img"\s*\n\s*src=")[^"]*(")/, `$1../../${OTHER.replace(/^\//, "")}$2`));
const INJ_LD_IMAGE = (p) =>
  editText(p.html, (s) => editJsonLd(s, "ScholarlyArticle", (n) => ({ ...n, image: `https://github.lvyihang.xyz${OTHER}` })));
const INJ_OG_W = (p) => editText(p.html, (s) => s.replace(/(<meta property="og:image:width" content=")[^"]*(")/, "$11200$2"));
const INJ_BODY_H = (p) => editText(p.html, (s) => s.replace(/(paper-figure__img"[\s\S]*?height=")[^"]*(")/, "$1630$2"));
const INJ_FM_COVER = (p) =>
  editText(p.md, (s) => s.replace(/^(pubKey:.*)$/m, `$1\ncover: "${OTHER}"\ncoverWidth: 1200\ncoverHeight: 630`));
const INJ_SRC_DRIFT = (p) =>
  editText(p.site, (s) => s.replace(/(src:\s*")\/assets\/img\/publications\/trmm-fig10\.jpg(")/, `$1${OTHER}$2`));
const INJ_WIDTH_DRIFT = (p) => editText(p.site, (s) => s.replace(/(width:\s*)1400(,\s*\n\s*height:\s*745)/, "$11200$2"));
const INJ_GATE_UNWIRED = (p) => {
  const pkg = JSON.parse(fs.readFileSync(p.pkg, "utf8"));
  const before = pkg.scripts.build;
  pkg.scripts.build = before.replace(/\s*&&\s*npm run check:figure-cover(?![\w-])/, "");
  if (pkg.scripts.build === before) {
    console.error("封面图门禁自测失败：SP10 注入没有改动 build 链（注入本身失效了）。");
    process.exit(1);
  }
  delete pkg.scripts["check:figure-cover"];
  fs.writeFileSync(p.pkg, JSON.stringify(pkg, null, 2));
};
/* 边界负对照：真源与产物一起改错 ⇒ 四个出口仍彼此一致 ⇒ 门禁必须判绿 */
const INJ_BOTH = (p) => {
  editText(p.site, (s) =>
    s
      .replace(/(src:\s*")\/assets\/img\/publications\/trmm-fig10\.jpg(")/, `$1${OTHER}$2`)
      .replace(/(width:\s*)1400(,\s*\n\s*height:\s*)745/, "$11200$2630")
  );
  editText(p.html, (s) =>
    editJsonLd(
      s
        .replace(/(<meta property="og:image" content=")[^"]*(")/, `$1https://github.lvyihang.xyz${OTHER}$2`)
        .replace(/(<meta name="twitter:image" content=")[^"]*(")/, `$1https://github.lvyihang.xyz${OTHER}$2`)
        .replace(/(class="paper-figure__img"\s*\n\s*src=")[^"]*(")/, `$1../../${OTHER.replace(/^\//, "")}$2`)
        .replace(/(<meta property="og:image:width" content=")[^"]*(")/, "$11200$2")
        .replace(/(<meta property="og:image:height" content=")[^"]*(")/, "$1630$2")
        .replace(/(paper-figure__img"[\s\S]*?width=")[^"]*(")/, "$11200$2")
        .replace(/(paper-figure__img"[\s\S]*?height=")[^"]*(")/, "$1630$2"),
      "ScholarlyArticle",
      (n) => ({ ...n, image: `https://github.lvyihang.xyz${OTHER}` })
    )
  );
};

/* —— 真源/前提侧注入（覆盖原本**完全无档可证**的红因）—— */
const INJ_NO_SLUG = (p) => editText(p.site, (s) => s.replace(/(slug:\s*")[^"]*(")/, "$1$2"));
const INJ_NO_PAPER_HTML = (p) => fs.rmSync(p.html);
const INJ_NO_FIGURE = (p) => editText(p.site, (s) => s.replace(/\n\s*figure:\s*\{[\s\S]*?\n\s*\},?\n/, "\n"));
const INJ_NO_BODY_IMG = (p) =>
  editText(p.html, (s) => s.replace(/(<img[^>]*class="paper-figure__img"[^>]*\/>)/, "<!--正文图被删-->"));
/* ⚠️ 删**整条 <meta> 声明**，不是把 content 清空：
   清空后 metaProp() 仍返回 ""（不是 null）⇒ 走的是「值不等于真源」那条分支，
   测不到「缺——尺寸没有声明 / 取不到值——出口缺一个」这两条红因。 */
const INJ_NO_OG_META = (p) =>
  editText(p.html, (s) => s.replace(/<meta property="og:image" content="[^"]*"\s*\/?>/g, ""));
const INJ_EXTERNAL_OG = (p) =>
  editText(p.html, (s) => s.replace(/(<meta property="og:image" content=")[^"]*(")/, "$1https://example.com/other.png$2"));
const INJ_NO_OG_W = (p) =>
  editText(p.html, (s) => s.replace(/<meta property="og:image:width" content="[^"]*"\s*\/?>/g, ""));

/* 坏真源（语法错）：`require` 在**解析阶段**就抛 ⇒ 走的是同一个 catch 分支。
   整份文件替换成确定无法解析的内容，避免"碰巧还能解析"的注入失效。 */
const INJ_BAD_SOURCE_JS = (p) =>
  editText(p.site, () => "module.exports = { url: 'https://example.invalid', <<< 故意写坏 >>> };\n");

/* 坏真源（文件不存在）：让 `require(SITE_DATA_PATH)` 直接抛 ⇒ 门禁走那条 catch 分支 */
const ENV_BAD_SOURCE = { SITE_DATA_PATH: "/tmp/mh-figcover-no-such-site.js" };
const ENV_NO_PAPERS_DIR = { PAPERS_DIR: "/tmp/mh-figcover-no-such-papers" };
const ENV_NO_PKG = { PKG_PATH: "/tmp/mh-figcover-no-such-package.json" };

console.log("");

/* —— 注入档 SP0–SP21 —— */
expectGreen("SP0 基线（原样）", null);
expectRed("SP1 og:image 换成另一张图", INJ_OG_IMAGE, ["C1d"]);
expectRed("SP2 twitter:image 换成另一张图", INJ_TW_IMAGE, ["C1d"]);
expectRed("SP3 正文 <img> 的 src 换成另一张图", INJ_BODY_SRC, ["C1d"]);
expectRed("SP4 JSON-LD 的 image 换成另一张图", INJ_LD_IMAGE, ["C1d"]);
expectRed("SP5 og:image:width 写错", INJ_OG_W, ["C2b"]);
expectRed("SP6 正文 <img> 的 height 写错", INJ_BODY_H, ["C2b"]);
expectRed("SP7 front matter 加回 cover 副本", INJ_FM_COVER, ["C3a", "C3a", "C3a"]);
expectRed("SP8 真源里 figure.src 漂移", INJ_SRC_DRIFT, ["C1d", "C1d", "C1d", "C1d"]);
expectRed("SP9 真源里 figure.width 漂移", INJ_WIDTH_DRIFT, ["C2b", "C2b"]);
expectRed("SP10 门禁被卸掉（build 链里摘掉）", INJ_GATE_UNWIRED, ["C4d"]);
expectGreen("SP11 边界负对照：真源与产物一起改错（必须判绿）", INJ_BOTH);

/* —— 真源读不出来 ⇒ 必须看得见失败横幅与那条红因（缺陷 D67 的修复护栏）—— */
expectRed("SP12 真源读不出来 ⇒ 打印失败横幅与红因（P1）", null, ["P1"], { env: ENV_BAD_SOURCE });

/* 另一种触发方式：真源文件**存在**但**语法错** ⇒ require 在解析阶段就抛
   ⇒ 同一条 catch 路径 ⇒ 同样必须打印横幅 + 那一条红因 */
expectRed("SP13 真源是语法错的 JS ⇒ 同一条 catch 路径也得打印（P1）", INJ_BAD_SOURCE_JS, ["P1"]);

/* —— 真源/前提侧的其余红因（原本完全无档可证的那些）—— */
expectRed("SP14 找不到论文页源目录", null, ["C3b", "C3c"], { env: ENV_NO_PAPERS_DIR });
expectRed("SP15 真源里论文没有 slug", INJ_NO_SLUG, ["P2", "C4b"]);
expectRed("SP16 论文页产物不存在", INJ_NO_PAPER_HTML, ["P3", "C4b"]);
expectRed("SP17 真源里一篇带 figure 的论文都没有", INJ_NO_FIGURE, ["C4a"]);
expectRed("SP18 找不到 package.json", null, ["C4c"], { env: ENV_NO_PKG });
expectRed("SP19 正文 <img> 整个被删", INJ_NO_BODY_IMG, ["C1a", "C1b", "C2a", "C2a"]);
expectRed("SP20 产物里没有 og:image 这条声明", INJ_NO_OG_META, ["C1b"]);
expectRed("SP21 og:image 指向站外地址", INJ_EXTERNAL_OG, ["C1c"]);
expectRed("SP22 产物里没有 og:image:width 这条声明", INJ_NO_OG_W, ["C2a"]);

/* ================= 判据级负对照 ================= */

expectGreenAfterUnload("NC-CV1 卸掉 CV1 ⇒ CV1 的注入转绿", "CV1", INJ_OG_IMAGE, ["C1d"]);
expectGreenAfterUnload("NC-CV2 卸掉 CV2 ⇒ CV2 的注入转绿", "CV2", INJ_OG_W, ["C2b"]);
expectGreenAfterUnload("NC-CV3 卸掉 CV3 ⇒ CV3 的注入转绿", "CV3", INJ_FM_COVER, ["C3a", "C3a", "C3a"]);
expectGreenAfterUnload("NC-CV4 卸掉 CV4 ⇒ CV4 的注入转绿", "CV4", INJ_GATE_UNWIRED, ["C4d"]);

/* ================= 覆盖度自证 ================= */

const GATE_SRC = fs.readFileSync(GATE, "utf8");
const GATE_SHA_AT_START = crypto.createHash("sha256").update(GATE_SRC).digest("hex");
const REGIONS = noteRegions(GATE_SRC);
const REGION_OWNERS = regionOwners(GATE_SRC, REGIONS);

/* COV1：门禁解析出的判据集合 == 静态清单（双向） */
{
  const parsed = parsedCriteria(GATE_SRC);
  const staticSet = [...CRITERIA].sort();
  const onlyParsed = parsed.filter((x) => !staticSet.includes(x));
  const onlyStatic = staticSet.filter((x) => !parsed.includes(x));
  const ok = onlyParsed.length === 0 && onlyStatic.length === 0;
  record(
    "COV1 门禁解析出的判据集合 == 静态判据清单（双向）",
    ok,
    ok
      ? `门禁解析出 {${parsed.join(",")}}，静态清单 {${staticSet.join(",")}}`
      : `门禁多出 [${onlyParsed.join(",")}]，静态清单多出 [${onlyStatic.join(",")}]`
  );
}

/* COV2：门禁里收集型出口数 == 归属表条数 */
{
  const n = REGIONS.length;
  const ok = n === CAUSES.length;
  record(
    "COV2 门禁里收集型出口数 == 归属表条数",
    ok,
    `门禁里 note( 有 ${n} 处，归属表登记了 ${CAUSES.length} 条` +
      (ok ? "" : `（对不上：门禁多了 ${n - CAUSES.length} 处、归属表多了 ${CAUSES.length - n} 条）`)
  );
}

/* COV3：门禁里**没有**「收集完立刻 exit」的出口 ⇒ 判红时红因不会被吞（缺陷 D67 回归护栏） */
{
  const early = REGIONS.filter((r) => isEarlyExit(GATE_SRC, r)).length;
  const declared = CAUSES.filter((c) => c.site === "early").length;
  const ok = early === 0 && declared === 0;
  record(
    "COV3 门禁里没有「收集完立刻 exit」的出口（判红时红因不会被吞）",
    ok,
    ok
      ? "0 处收集完立刻 exit 的出口 ⇒ 每条红因都会被打印出来"
      : `门禁里有 ${early} 处收集完立刻 exit（归属表声明了 ${declared} 条 early）⇒ 那条红因会被吞掉`
  );
}

/* COV4：每条归属恰好认领一个出口点（区间法绑定） */
{
  const problems = [];
  for (const c of CAUSES) {
    const pos = GATE_SRC.indexOf(c.frag);
    if (pos < 0) {
      problems.push(`${c.id} 的片段「${c.frag}」在门禁源码里找不到`);
      continue;
    }
    const inside = REGIONS.filter((r) => pos >= r.start && pos <= r.end);
    if (inside.length !== 1) {
      problems.push(`${c.id} 的片段落在 ${inside.length} 个出口区间里`);
      continue;
    }
    const idx = REGIONS.indexOf(inside[0]);
    if (REGION_OWNERS[idx] !== c.owner) {
      problems.push(`${c.id} 认领的出口点归属是 ${REGION_OWNERS[idx]}，不是 ${c.owner}`);
    }
  }
  for (let i = 0; i < REGIONS.length; i++) {
    const inside = CAUSES.filter((c) => {
      const pos = GATE_SRC.indexOf(c.frag);
      return pos >= 0 && pos >= REGIONS[i].start && pos <= REGIONS[i].end;
    });
    if (inside.length !== 1) {
      problems.push(`第 ${i + 1} 个出口区间里落了 ${inside.length} 条归属（应恰好 1 条）`);
    }
  }
  record(
    "COV4 每条归属恰好认领一个出口点",
    problems.length === 0,
    problems.length === 0
      ? `${CAUSES.length} 条归属 ↔ ${REGIONS.length} 个出口点，一一对应`
      : problems.join("；")
  );
}

/* COV5：归属片段互不包含，且在门禁源码里各出现一次 */
{
  const problems = [];
  for (const c of CAUSES) {
    const n = GATE_SRC.split(c.frag).length - 1;
    if (n !== 1) problems.push(`${c.id} 的片段「${c.frag}」在门禁源码里出现 ${n} 次（应恰好 1 次）`);
  }
  for (let i = 0; i < CAUSES.length; i++) {
    for (let j = i + 1; j < CAUSES.length; j++) {
      const a = CAUSES[i].frag;
      const b = CAUSES[j].frag;
      if (a.includes(b) || b.includes(a)) {
        problems.push(`${CAUSES[i].id} 与 ${CAUSES[j].id} 的片段互相包含`);
      }
    }
  }
  record(
    "COV5 归属片段互不包含且各出现一次",
    problems.length === 0,
    problems.length === 0 ? `${CAUSES.length} 条片段全部唯一且互不包含` : problems.join("；")
  );
}

/* COV6：每条判据至少有一条归属 */
{
  const missing = CRITERIA.filter((c) => !CAUSES.some((x) => x.owner === c));
  const extra = [...new Set(CAUSES.map((c) => c.owner).filter(Boolean))].filter((c) => !CRITERIA.includes(c));
  const ok = missing.length === 0 && extra.length === 0;
  record(
    "COV6 每条判据至少有一条归属",
    ok,
    ok
      ? CRITERIA.map((c) => `${c}→${CAUSES.filter((x) => x.owner === c).length} 条`).join("，")
      : `没有归属的判据 [${missing.join(",")}]，不属于任何判据的归属 [${extra.join(",")}]`
  );
}

/* COV7：每条红因至少有一档能证明它会变红（运行时观察集合） */
{
  const missing = CAUSES.map((c) => c.id).filter((id) => !coveredCauses.has(id));
  record(
    "COV7 每条红因至少有一档能证明它会变红",
    missing.length === 0,
    missing.length === 0
      ? `${CAUSES.length} 条红因全部有档可证`
      : `没有档能证明它会变红的红因：[${missing.join(",")}]`
  );
}

/* ================= 收尾：前置守卫（都不进 results，都不算档） ================= */
/* 注意：下面这些是**前置守卫**，不是矩阵里的一档 ⇒ 不进 results，
   否则报出的「档数」会比下面枚举的档位号（23 注入 + 4 负对照 + 7 覆盖度 = 34）对不上。 */

console.log("");
const nowSha = crypto.createHash("sha256").update(fs.readFileSync(GATE)).digest("hex");
const gateIntact = nowSha === GATE_SHA_AT_START;
console.log(
  `  ${gateIntact ? "✓" : "✗"} 门禁原件 SHA-256 前后一致（自测运行期间未被改动） —— sha256 = ${nowSha.slice(0, 16)}…`
);

/**
 * 档位清单守卫：实际跑过的档位号集合 == 静态清单。
 * ⚠️ 为什么要有它：**删掉任何一档，自测原本照样全绿**（少跑一个注入只是少证明一件事，
 *   判据集合、出口数、归属数都没变）⇒ 尤其是 SP12 这个 D67 护栏被删掉时，
 *   "D67 已修"就彻底没人看守了。这道守卫把档位号集合钉死，少一档当场暴露。
 */
const EXPECTED_SLOTS = [
  ...Array.from({ length: 23 }, (_, i) => `SP${i}`),
  "NC-CV1",
  "NC-CV2",
  "NC-CV3",
  "NC-CV4",
  "COV1",
  "COV2",
  "COV3",
  "COV4",
  "COV5",
  "COV6",
  "COV7",
];
const actualSlots = results.map((r) => (/^(SP\d+|NC-CV\d+|COV\d+)/.exec(r.id) || [])[1]);
const slotSet = [...new Set(actualSlots.filter(Boolean))].sort();
const wantSet = [...EXPECTED_SLOTS].sort();
const slotsOk =
  actualSlots.length === results.length &&
  slotSet.length === wantSet.length &&
  slotSet.every((s, i) => s === wantSet[i]);
console.log(
  `  ${slotsOk ? "✓" : "✗"} 档位清单守卫：实际档位号集合 == 静态清单（${wantSet.length} 个档位号）`
);

const bad = results.filter((r) => !r.ok);
console.log(
  `\n自测矩阵：${results.length} 档里 ${results.length - bad.length} 档按预期触发` +
    `（SP0–SP22 是注入档；NC-CV1–NC-CV4 是判据级负对照；COV1–COV7 是覆盖度自证）。\n`
);
if (bad.length || !gateIntact || !slotsOk) {
  console.error(`\n自测失败：${bad.length} 档没有按预期触发。\n`);
  for (const b of bad) console.error(`  ✗ ${b.id}\n${b.detail}\n`);
  if (!gateIntact) console.error("  ✗ 门禁原件 SHA-256 前后不一致\n");
  if (!slotsOk) {
    console.error(
      `  ✗ 档位清单对不上：期望 [${wantSet.join(",")}]，实际 [${slotSet.join(",")}]\n`
    );
  }
  process.exit(1);
}
console.log("自测通过：全部档位按预期触发。\n");
