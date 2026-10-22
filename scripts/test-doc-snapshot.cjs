#!/usr/bin/env node
/**
 * 自测 DS1–DS4：给 scripts/check-doc-snapshot.cjs 的每一条红因找一次「它会红」的证据
 *
 * 为什么要有这个自测（2026-10-22 的 D66 场次）：
 *   这道门禁守的是「每轮都会变的数量，不许写死在现状陈述里」——
 *   build 链的段数每加一道门禁就 +1，写进文档等于每轮都要再订正一次。
 *   而「门禁是绿的」有两种可能：① 它真的没问题；② 它的判据从来没被真正执行过。
 *   这两件事长得一模一样。所以每条判据都要有一档**注入**证明它会红，
 *   再有一档**负对照**证明「卸掉那一步之后确实就绿了」——否则红可能来自别处。
 *
 * 原版的毛病（就是缺陷 D64 记的那条）：
 *   只有 6 档，断言只查「输出里**含**期望的编号」与「**不多于一条**」；
 *   零红因归属表 ⇒ 门禁 11 处 `fail()` 有没有被登记过，自测不知道；
 *   零覆盖度自证 ⇒ 门禁日后新增判据、或新增一条没编号的裸红因，自测毫无察觉；
 *   零判据级负对照 ⇒ 无法证明红因确实由该判据产生；
 *   判红档只看退出码 ⇒ 门禁自身崩了（语法错、抛异常）也是 exit 1，会被当成判红放过；
 *   11 条红因里有 6 条**无档可证**（读不到 package.json / 解析失败 / 数不出段数 /
 *   扫描范围里没有 ROADMAP.md / 小节被删空 / 小节被整体标成历史块）。
 *
 * 本轮补的四件套：
 *   ① **红因归属表**（`CAUSES` 11 条 ＋ 静态 `CRITERIA` 清单 4 条）
 *   ② **运行时归属纯净**：每条红因行必须被**恰好一条**归属认领，
 *      且认出的判据必须与**行首编号**一致 ⇒ 出现没编号的裸红因，当场暴露
 *   ③ **覆盖度自证（双向）**：`fail()` 调用点数 == 归属条数 / 每个调用点的判据都在清单 /
 *      门禁解析出的判据**集合** == 静态清单 / 每条归属恰好认领一个调用点 /
 *      片段互不包含 / **每条红因至少有一档能证明它会红**
 *   ④ **判据级负对照** NC-DS1–NC-DS4：在门禁**副本**里给该判据的**每一条** `fail()`
 *      调用**同行**加 `if (false) ` 前缀（行数不变）⇒ 目标红因消失、其余照旧
 *
 * ⚠️ 这道门禁的 `fail()` 是**单参数**，判据号写在消息正文开头（`DS2 …`），
 *    红因行格式是 `  ✗ <消息>`（**没有「门禁」二字、没有独立编号前缀**）——
 *    所以取编号只能从**行首**取，不能全表扫片段：DS1 的红因正文尾部会附上
 *    「出问题那一行的原文」，全表扫可能被无关原文误命中。
 *    归属因此先按**行首判据**过滤，再在该判据的归属条目里找片段。
 *
 * ⚠️ 归属片段的**静态**绑定用「区间法」：片段必须落在「它自己的那个 `fail()` 调用点
 *    之后、下一个调用点之前」。不能靠解析参数文本 —— DS3d 的消息是两段模板拼接、
 *    第二段里才有归属片段，而且模板里有转义反引号（`\`**D<n>**\``）。
 *
 * ⚠️ 注入一律在**副本**上做（文档副本 + 门禁副本 + package.json 副本），
 *    仓库里的任何文件一个字节都不动（收尾按 SHA-256 自证）。
 *
 * 用法：node scripts/test-doc-snapshot.cjs
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const GATE = path.join(ROOT, "scripts", "check-doc-snapshot.cjs");
const PKG_SRC = path.join(ROOT, "package.json");
/** 扫描面与门禁默认一致：仓库根 + docs/（都不递归）。 */
const SRC_DIRS = [ROOT, path.join(ROOT, "docs")];

function sha256(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

/* 原件指纹：**自测开始时**记下来，收尾时比对 ——
   证明这一整轮注入全在副本上，仓库里的原件一个字节都没动。 */
const GATE_SHA_AT_START = sha256(GATE);

/* ================= 红因归属表 + 静态判据清单 ================= */

/**
 * 每条 `fail()` 调用点一行 —— 这就是「红因归属表」。
 *
 * frag = 该调用点的红因正文里一段**唯一可辨**的片段。三条用处：
 *   ① 静态：把门禁源码里的 `fail()` 调用点与本表**一一对应**（见 COV2 段）；
 *   ② 运行时：每条红因行必须被**恰好一条**归属认领 ——
 *      一条都认领不到 ⇒ 出现了本表没登记过的新红因；被两条同时认领 ⇒ 归属不纯；
 *   ③ 交叉校验：归属认出的判据必须与红因行**开头**的编号一致（对不上 ⇒ 归属表错了）。
 *
 * ⚠️ 片段之间必须**互不包含**，否则一条红因行会被两条归属同时认领 ⇒ 归属就不纯了。
 * ⚠️ 一个编号可以覆盖多条红因（DS2 四条、DS3 四条、DS4 两条）⇒
 *    **「红因条数」与「判据集合」是两个量，必须分开断言**。
 *    本表按**调用点**登记（一条红因一条归属），静态判据清单按**编号**登记（4 条）。
 */
const CAUSES = [
  { id: "C1", crit: "DS2", frag: "读不到就没法判", desc: "package.json 不在场 ⇒ 数不出 build 链段数" },
  { id: "C2", crit: "DS2", frag: "读不懂就没法判", desc: "package.json 解析失败 ⇒ 数不出 build 链段数" },
  { id: "C3", crit: "DS2", frag: "没有它就判不了", desc: "package.json 里没有 scripts.build ⇒ 数不出段数" },
  { id: "C4", crit: "DS2", frag: "等于没基准", desc: "scripts.build 数不出任何段 ⇒ 门禁的实测基准是空的" },
  { id: "C5", crit: "DS1", frag: "现状陈述里写死了", desc: "现状陈述里写死了会变的数量（数字 + 步）" },
  { id: "C6", crit: "DS3", frag: "扫描范围里没有", desc: "扫描范围里没有受盯的那份文档" },
  { id: "C7", crit: "DS3", frag: "失去了判读对象", desc: "受盯的那一节被删掉或改了标题" },
  { id: "C8", crit: "DS3", frag: "现状陈述不能被删空", desc: "受盯的那一节被删空了" },
  { id: "C9", crit: "DS3", frag: "整体豁免掉了", desc: "受盯的那一节每一块都是历史块 ⇒ DS1 对它完全失明" },
  { id: "C10", crit: "DS4", frag: "只扫到", desc: "扫到的 markdown 文件数低于下限 ⇒ 扫描面被收窄（空跑风险）" },
  { id: "C11", crit: "DS4", frag: "一个历史块都没认出", desc: "一个历史块都没认出 ⇒ 豁免机制失灵" },
];

/* 静态判据清单：门禁里出现过的判据必须**恰好**是这四个（多一个少一个都露）。 */
const CRITERIA = ["DS1", "DS2", "DS3", "DS4"];

/* 门禁自己的失败 / 通过横幅 —— 用来判「门禁确实跑到了自己的结论」。
   少了这两条，node 遇到语法错或未捕获异常（也是 exit 1）会被当成「判红通过」。 */
const GATE_FAIL_BANNER = "文档快照门禁未通过：";
const GATE_PASS_BANNER = "文档快照门禁通过：";

/* ================= 夹具站 ================= */

/** 扫描面里的全部 markdown（含 `._*` 与 IMPROVEMENT-LOG.md —— 让门禁自己按规则过滤）。 */
function collectOriginals() {
  const map = new Map(); // name -> 源路径（docs 覆盖仓库根，与复制顺序一致）
  for (const dir of SRC_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isFile() && e.name.endsWith(".md")) map.set(e.name, path.join(dir, e.name));
    }
  }
  return map;
}

const ORIGINALS = collectOriginals();
if (ORIGINALS.size === 0) {
  console.error("文档快照自测失败：一个 markdown 文件都没找到，注入前提不成立。");
  process.exit(1);
}
if (!fs.existsSync(PKG_SRC)) {
  console.error(`文档快照自测失败：找不到 ${path.relative(ROOT, PKG_SRC)}。`);
  process.exit(1);
}

/** 门禁会**计入** scanned 的文件名（排除 AppleDouble 侧车与历史日志）。 */
function countedNames(names) {
  return names.filter((n) => !n.startsWith("._") && n !== "IMPROVEMENT-LOG.md");
}

/** 造一个夹具站：门禁副本 + 文档副本 + package.json 副本。 */
function makeSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mh-docsnapshot-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.copyFileSync(GATE, path.join(dir, "scripts", "check-doc-snapshot.cjs"));
  const mdDir = path.join(dir, "md");
  fs.mkdirSync(mdDir);
  for (const [name, src] of ORIGINALS) fs.copyFileSync(src, path.join(mdDir, name));
  fs.copyFileSync(PKG_SRC, path.join(dir, "package.json"));
  return dir;
}

const mdDirOf = (dir) => path.join(dir, "md");
const pkgOf = (dir) => path.join(dir, "package.json");
const gateOf = (dir) => path.join(dir, "scripts", "check-doc-snapshot.cjs");

/* ================= 跑门禁 / 解析红因 ================= */

/** 跑副本里的门禁，返回 { code, out }。 */
function runGate(dir, envExtra) {
  const env = Object.assign({}, process.env, {
    DS_DOC_DIRS: mdDirOf(dir),
    DS_PACKAGE_JSON: pkgOf(dir),
  }, envExtra || {});
  const r = spawnSync(process.execPath, [gateOf(dir)], { env, encoding: "utf8" });
  return {
    code: typeof r.status === "number" ? r.status : -1,
    out: `${r.stdout || ""}${r.stderr || ""}`,
  };
}

/** 所有红因行（`  ✗ …` 开头的行）。裸红因也算 —— 它没有编号。 */
function redRows(out) {
  return out.split("\n").filter((l) => /^[ \t]*✗/.test(l));
}

/** 红因行的行首判据号；裸红因返回 null。 */
function rowPrefix(row) {
  const m = /^[ \t]*✗[ \t]+(DS\d+)/.exec(row);
  return m ? m[1] : null;
}

/** 多重集完全相等（不是「包含」）：多一条、少一条都算这档失败。 */
function sameMultiset(got, want) {
  if (got.length !== want.length) return false;
  const g = [...got].sort();
  const w = [...want].sort();
  return g.every((x, i) => x === w[i]);
}

function fmtIds(ids) {
  return [...ids].sort().join("+") || "（无）";
}

/* ================= 覆盖度自证用的解析器 ================= */

/**
 * 从门禁源码里解析出**全部** `fail()` 调用点及其判据编号。
 *
 * ⚠️ 这道门禁的 `fail()` 是**单参数**、判据号在消息正文开头 ⇒
 *    正则取到的第一段模板文本要再按 `^(DS\d+)` 提编号。
 * ⚠️ 必须用**整文件**正则而不是逐行找 `fail(` —— 多行调用（`fail(\n  \`DS3 …\``）
 *    逐行是数不出来的。
 * ⚠️ DS3d 的消息里有转义反引号，正则截到的只是第一段模板 ⇒ 判据号仍能取到
 *    （第一段就以 `DS3 ` 开头），但**归属片段不在这一段** ⇒ 静态绑定必须走区间法。
 */
function scanFailCalls(src) {
  const calls = [];
  const re = /(?<![.\w$])fail\s*\(\s*(?:`([^`]*)`|"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const chunk = m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3];
    const cm = /^(DS\d+)/.exec(chunk);
    calls.push({ index: m.index, crit: cm ? cm[1] : null, chunk: chunk });
  }
  return calls;
}

/**
 * 一个归属片段落在**哪些**调用点的区间里。
 * 规则：片段必须出现在「它自己的那个调用点之后、下一个调用点之前」——
 * 落在区间外 ⇒ 它认领错了调用点（或根本没被登记）。
 * @returns {number[]} 认领了这个片段的调用点下标
 */
function ownersOfFrag(frag, calls, src) {
  const owners = [];
  let from = 0;
  for (;;) {
    const k = src.indexOf(frag, from);
    if (k < 0) break;
    from = k + 1;
    for (let i = 0; i < calls.length; i++) {
      const start = calls[i].index;
      const end = i + 1 < calls.length ? calls[i + 1].index : src.length;
      if (k > start && k < end) owners.push(i);
    }
  }
  return owners;
}

/**
 * 运行时归属：把每条红因行交给归属表认领。
 *
 * 先取**行首判据号**，再在**该判据**的归属条目里找片段命中：
 *   · 不用「全表扫片段」—— DS1 的红因正文尾部会附上出问题那一行的原文，
 *     全表扫可能被无关原文误命中（跨判据污染）。
 *   · 行首没有编号（裸红因）⇒ 一条归属都认领不到 ⇒ 当场暴露。
 */
function attributeRows(out) {
  return redRows(out).map((row) => {
    const prefix = rowPrefix(row);
    const cands = prefix ? CAUSES.filter((c) => c.crit === prefix) : [];
    const hits = cands.filter((c) => row.includes(c.frag));
    return {
      row: row,
      hits: hits.map((c) => c.id),
      crits: hits.map((c) => c.crit),
      prefix: prefix,
    };
  });
}

/* ================= 注入 / 破坏的公用动作 ================= */

/** 替换一次；锚点不存在就抛错（坏跑必须当场暴露，不能记成「测过了」）。 */
function replaceOnce(text, from, to) {
  if (!text.includes(from)) throw new Error(`注入锚点不存在：找不到「${from}」`);
  return text.replace(from, to);
}

function readMd(dir, name) {
  return fs.readFileSync(path.join(mdDirOf(dir), name), "utf8");
}

function writeMd(dir, name, text) {
  fs.writeFileSync(path.join(mdDirOf(dir), name), text);
}

function readPkg(dir) {
  return JSON.parse(fs.readFileSync(pkgOf(dir), "utf8"));
}

function writePkg(dir, pkg) {
  fs.writeFileSync(pkgOf(dir), JSON.stringify(pkg, null, 2) + "\n");
}

/** 副本与原件的「改动行数」—— 证明注入确实打上了，且只打了声明的那些行。 */
function changedLines(a, b) {
  const la = a.split("\n");
  const lb = b.split("\n");
  const n = Math.max(la.length, lb.length);
  let c = 0;
  for (let i = 0; i < n; i++) if (la[i] !== lb[i]) c += 1;
  return c;
}

/**
 * 把门禁副本里某个判据的**每一条** `fail()` 调用**同行**加 `if (false) ` 前缀。
 *
 * 为什么是「同行加前缀」而不是改判断条件：
 *   · 门禁**没有** `DS*_ON` 开关（不像 check-css-braces），改条件会碰到生产契约；
 *   · 同行加前缀 ⇒ **行数不变** ⇒ 可与基线副本逐行比对，只差该判据的调用数；
 *   · 静默的是**判定**（`fail()` 不再被调用），不是**红因文案**。
 *
 * ⚠️ 下标要**倒序**处理：插入会让后面的下标整体位移。
 */
function unloadCriterion(dir, crit) {
  const file = gateOf(dir);
  const before = fs.readFileSync(file, "utf8");
  const calls = scanFailCalls(before).filter((c) => c.crit === crit);
  if (!calls.length) throw new Error(`门禁副本里找不到判据 ${crit} 的 fail() 调用`);
  let out = before;
  for (let i = calls.length - 1; i >= 0; i -= 1) {
    out = out.slice(0, calls[i].index) + "if (false) " + out.slice(calls[i].index);
  }
  fs.writeFileSync(file, out);
  const after = fs.readFileSync(file, "utf8");
  const n = changedLines(before, after);
  if (n !== calls.length) {
    throw new Error(
      `卸掉 ${crit} 的改动行数与声明不符（期望 ${calls.length} 行，实际 ${n} 行）—— 已中止。`
    );
  }
  /* 语法自检：静默之后门禁必须还是能跑的脚本。 */
  const chk = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (chk.status !== 0) {
    throw new Error(`卸掉 ${crit} 之后门禁副本语法不过：${(chk.stderr || "").trim()}`);
  }
  return calls.length;
}

/* ================= 断言 ================= */

const results = [];
/** 所有判红档实际认领过的归属条目 —— 收尾断言「每条红因至少有一档能证明它会红」。 */
const coveredCauses = new Set();

function record(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${id}${detail ? " —— " + detail : ""}`);
}

/**
 * 一档「注入 ⇒ 应当恰好红这么几条判据」。
 * @param want 期望的判据编号**多重集**（必须完全相等，不只是「包含」）
 * @param opts.mustContain 红因文案里必须出现的片段：证明「红的是这一类问题」，
 *        而不只是「编号对上了」（同一个编号下有多条红因时靠它区分）
 * @param opts.rows 期望的红因**行数**（一条判据可能触发多条红因）
 * @param opts.env 覆盖门禁的环境变量（用于「package.json 不在场」这类注入）
 */
function expectRed(id, dir, want, opts) {
  const o = opts || {};
  const r = runGate(dir, o.env);
  const rows = redRows(r.out);
  const got = rows.map(rowPrefix);
  const idsOk = sameMultiset(got, want);
  const textOk = !o.mustContain || r.out.includes(o.mustContain);
  const rowsOk = o.rows === undefined ? rows.length === want.length : rows.length === o.rows;
  /* 门禁必须跑到了自己的结论（横幅出现）—— 否则「门禁崩了」也是 exit 1，会被当成判红。 */
  const bannerOk = r.out.includes(GATE_FAIL_BANNER);
  /* 归属纯净：每条红因行恰好被一条归属认领，且认出的判据与行首编号一致。 */
  const attr = attributeRows(r.out);
  const attrOk =
    attr.length === rows.length &&
    attr.every((row) => row.hits.length === 1 && row.crits[0] === row.prefix);
  const ok = r.code === 1 && idsOk && textOk && rowsOk && bannerOk && attrOk;
  attr.forEach((row) => row.hits.forEach((h) => coveredCauses.add(h)));
  record(
    id,
    ok,
    ok
      ? `红了，判据 = ${fmtIds(got)}（${rows.length} 条红因、归属纯净）${o.note ? "；" + o.note : ""}`
      : `期望判据 ${fmtIds(want)} 且只有这些` +
        `${o.mustContain ? `、文案含「${o.mustContain}」` : ""}` +
        `${o.rows !== undefined ? `、红因行数 ${o.rows}` : ""}` +
        `${bannerOk ? "" : "、且须出现门禁失败横幅"}` +
        `${attrOk ? "" : "、且每条红因行恰好被一条归属认领"}` +
        `，实际 code=${r.code} 红因 ${fmtIds(got)}（${rows.length} 行）` +
        `归属 ${attr.map((x) => `${x.prefix}<-${x.hits.join("+") || "无"}`).join(" / ")}\n${r.out}`
  );
}

/** 一档「绿档」：门禁应当 exit 0、一个红因都不许有，且须出现通过横幅。 */
function expectGreen(id, dir, note) {
  const r = runGate(dir);
  const rows = redRows(r.out);
  const bannerOk = r.out.includes(GATE_PASS_BANNER);
  const ok = r.code === 0 && rows.length === 0 && bannerOk;
  record(
    id,
    ok,
    ok
      ? `绿，一个红因都不剩${note ? "；" + note : ""}`
      : `不该红，却 exit ${r.code}，红因 ${fmtIds(rows.map(rowPrefix))}` +
        `${bannerOk ? "" : "（且缺少门禁通过横幅）"}\n${r.out}`
  );
}

/* ================= 注入档 SP0–SP11 ================= */

console.log("文档快照门禁 · 本地注入矩阵：\n");

/* SP0：基线 —— 原样，必须**全绿**（证明这套判据不是空跑）。 */
{
  const dir = makeSandbox();
  expectGreen("SP0 基线（原样）", dir, "文档面完整、package.json 可解析、历史块认得出");
  fs.rmSync(dir, { recursive: true, force: true });
}

/* SP1：往 ROADMAP §1 的构建链行里写死「共 27 步」⇒ DS1。 */
{
  const dir = makeSandbox();
  writeMd(
    dir,
    "ROADMAP.md",
    replaceOnce(
      readMd(dir, "ROADMAP.md"),
      "- **构建链**：`npm run build` 跑**全链门禁**（门禁 → eleventy → 产物核对），**必须 exit 0**。",
      "- **构建链**：`npm run build` 共 27 步（门禁 → eleventy → 产物核对），**必须 exit 0**。"
    )
  );
  expectRed("SP1 ROADMAP §1 构建链行写死「共 27 步」", dir, ["DS1"], {
    mustContain: "现状陈述里写死了",
    note: "数字每轮都变，写进现状陈述等于每轮都要再订正一次",
  });
  fs.rmSync(dir, { recursive: true, force: true });
}

/* SP2：删掉 DEFECT-BACKLOG 的 §2 小节 ⇒ DS3（门禁失去判读对象）。 */
{
  const dir = makeSandbox();
  const lines = readMd(dir, "DEFECT-BACKLOG.md").split("\n");
  const head = lines.findIndex((l) => /^##\s+2\./.test(l));
  if (head < 0) throw new Error("注入锚点不存在：找不到「## 2.」小节");
  let end = lines.length;
  for (let i = head + 1; i < lines.length; i += 1) {
    if (/^#{1,6}\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  writeMd(dir, "DEFECT-BACKLOG.md", [...lines.slice(0, head), ...lines.slice(end)].join("\n"));
  expectRed("SP2 删掉 DEFECT-BACKLOG 的 §2 小节", dir, ["DS3"], {
    mustContain: "失去了判读对象",
  });
  fs.rmSync(dir, { recursive: true, force: true });
}

/* SP3：把所有 `**D<n>**` 标记去掉（并中和「数字 + 步」）⇒ DS4（豁免机制失灵）。
   ⚠️ 为什么连「数字 + 步」一起中和：豁免坏掉时历史块会全部涌进 DS1 ⇒ 那样
   SP3 就会同时触发 DS1 与 DS4，分不清是谁在报警。DS1 的触发能力由 SP1 单独证明。 */
{
  const dir = makeSandbox();
  for (const name of fs.readdirSync(mdDirOf(dir))) {
    if (!name.endsWith(".md")) continue;
    const p = path.join(mdDirOf(dir), name);
    let text = fs.readFileSync(p, "utf8");
    if (!/\*\*D\d+\*\*/.test(text)) continue;
    text = text.replace(/\*\*D(\d+)\*\*/g, "D$1");
    text = text.replace(/(\d+)(\s*)步/g, "$1$2段");
    fs.writeFileSync(p, text);
  }
  expectRed("SP3 去掉所有 `**D<n>**` 标记（豁免机制失灵）", dir, ["DS4"], {
    mustContain: "一个历史块都没认出",
  });
  fs.rmSync(dir, { recursive: true, force: true });
}

/* SP4：只给门禁看 9 个 markdown 文件（低于下限 10）⇒ DS4（扫描面被收窄）。
   ⚠️ 保留 ROADMAP.md 与 DEFECT-BACKLOG.md —— 否则会连带触发 DS3，变量就不唯一了。 */
{
  const dir = makeSandbox();
  const mdDir = mdDirOf(dir);
  const counted = countedNames(fs.readdirSync(mdDir).filter((n) => n.endsWith(".md")));
  const keep = new Set(["ROADMAP.md", "DEFECT-BACKLOG.md"]);
  for (const n of counted) {
    if (keep.size >= 9) break;
    if (!keep.has(n)) keep.add(n);
  }
  if (keep.size !== 9) throw new Error(`夹具 md 数量异常：凑不满 9 个（${keep.size}）`);
  for (const n of fs.readdirSync(mdDir)) {
    if (!keep.has(n)) fs.unlinkSync(path.join(mdDir, n));
  }
  expectRed("SP4 只给门禁看 9 个 markdown 文件", dir, ["DS4"], {
    mustContain: "只扫到",
    note: "扫描面被收窄 ⇒ 这道门禁已经看不到大部分活文档",
  });
  fs.rmSync(dir, { recursive: true, force: true });
}

/* SP5：把 package.json 的 scripts.build 删掉 ⇒ DS2（门禁自己数不出基准）。 */
{
  const dir = makeSandbox();
  const pkg = readPkg(dir);
  delete pkg.scripts.build;
  writePkg(dir, pkg);
  expectRed("SP5 package.json 里没有 scripts.build", dir, ["DS2"], {
    mustContain: "没有它就判不了",
  });
  fs.rmSync(dir, { recursive: true, force: true });
}

/* SP6：package.json **整个不在场** ⇒ DS2（门禁连读都读不到）。
   ⚠️ 旧版 6 档只碰了「scripts.build 缺失」这一条分支，
      「文件根本不在场」这条红因**始终没人证明过它能变红**。 */
{
  const dir = makeSandbox();
  expectRed("SP6 package.json 整个不在场", dir, ["DS2"], {
    mustContain: "读不到就没法判",
    env: { DS_PACKAGE_JSON: path.join(dir, "package-missing.json") },
  });
  fs.rmSync(dir, { recursive: true, force: true });
}

/* SP7：package.json **存在但内容是坏 JSON** ⇒ DS2。
   ⚠️ 「坏了就当它不存在」正是最容易被写成静默绿的地方。 */
{
  const dir = makeSandbox();
  fs.writeFileSync(pkgOf(dir), '{ "scripts": { "build": "npm run build" \n');
  expectRed("SP7 package.json 是坏 JSON", dir, ["DS2"], {
    mustContain: "读不懂就没法判",
  });
  fs.rmSync(dir, { recursive: true, force: true });
}

/* SP8：scripts.build **在、但数不出段**（`"&&"`）⇒ DS2（门禁的实测基准是空的）。 */
{
  const dir = makeSandbox();
  const pkg = readPkg(dir);
  pkg.scripts.build = "&&";
  writePkg(dir, pkg);
  expectRed("SP8 scripts.build 数不出任何段（\"&&\"）", dir, ["DS2"], {
    mustContain: "等于没基准",
    note: "非空但切不出段数 ⇒ 与「没有它」是两条不同的红因",
  });
  fs.rmSync(dir, { recursive: true, force: true });
}

/* SP9：把 ROADMAP.md 从扫描面里拿走 ⇒ DS3（这道门禁盯的就是它）。 */
{
  const dir = makeSandbox();
  fs.unlinkSync(path.join(mdDirOf(dir), "ROADMAP.md"));
  expectRed("SP9 扫描范围里没有 ROADMAP.md", dir, ["DS3"], {
    mustContain: "扫描范围里没有",
  });
  fs.rmSync(dir, { recursive: true, force: true });
}

/* SP10：把 ROADMAP 的 §1 **内容**删空（标题留着）⇒ DS3（现状陈述被删空）。 */
{
  const dir = makeSandbox();
  const lines = readMd(dir, "ROADMAP.md").split("\n");
  const head = lines.findIndex((l) => /^##\s+1\./.test(l));
  if (head < 0) throw new Error("注入锚点不存在：找不到「## 1.」小节");
  let end = lines.length;
  for (let i = head + 1; i < lines.length; i += 1) {
    if (/^#{1,6}\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  writeMd(dir, "ROADMAP.md", [...lines.slice(0, head + 1), ...lines.slice(end)].join("\n"));
  expectRed("SP10 ROADMAP §1 被删空", dir, ["DS3"], {
    mustContain: "现状陈述不能被删空",
  });
  fs.rmSync(dir, { recursive: true, force: true });
}

/* SP11：把 ROADMAP 的 §1 换成**只有历史块**的一节 ⇒ DS3（整节被豁免，DS1 对它失明）。 */
{
  const dir = makeSandbox();
  const lines = readMd(dir, "ROADMAP.md").split("\n");
  const head = lines.findIndex((l) => /^##\s+1\./.test(l));
  if (head < 0) throw new Error("注入锚点不存在：找不到「## 1.」小节");
  let end = lines.length;
  for (let i = head + 1; i < lines.length; i += 1) {
    if (/^#{1,6}\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  writeMd(
    dir,
    "ROADMAP.md",
    [
      ...lines.slice(0, head + 1),
      "- **D1** 占位：这一节整体被标成了历史块。",
      ...lines.slice(end),
    ].join("\n")
  );
  expectRed("SP11 ROADMAP §1 整节都是历史块", dir, ["DS3"], {
    mustContain: "整体豁免掉了",
    note: "否则把整节标成历史就能把 DS1 整体绕过",
  });
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= 判据级负对照 NC-DS1–NC-DS4 ================= */

/* NC-DS1：卸掉 DS1 ⇒ SP1 的注入必须转绿。 */
{
  const dir = makeSandbox();
  const n = unloadCriterion(dir, "DS1");
  writeMd(
    dir,
    "ROADMAP.md",
    replaceOnce(
      readMd(dir, "ROADMAP.md"),
      "- **构建链**：`npm run build` 跑**全链门禁**（门禁 → eleventy → 产物核对），**必须 exit 0**。",
      "- **构建链**：`npm run build` 共 27 步（门禁 → eleventy → 产物核对），**必须 exit 0**。"
    )
  );
  expectGreen(
    `NC-DS1 负对照：卸掉 DS1 判定（${n} 处）后，SP1 的注入转绿`,
    dir,
    "证明 SP1 那档的红确实来自 DS1 判定本身"
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* NC-DS2：卸掉 DS2 ⇒ SP5 的注入必须转绿。 */
{
  const dir = makeSandbox();
  const n = unloadCriterion(dir, "DS2");
  const pkg = readPkg(dir);
  delete pkg.scripts.build;
  writePkg(dir, pkg);
  expectGreen(
    `NC-DS2 负对照：卸掉 DS2 判定（${n} 处）后，SP5 的注入转绿`,
    dir,
    "证明 SP5 那档的红确实来自 DS2 判定本身"
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* NC-DS3：卸掉 DS3 ⇒ SP2 的注入必须转绿。 */
{
  const dir = makeSandbox();
  const n = unloadCriterion(dir, "DS3");
  const lines = readMd(dir, "DEFECT-BACKLOG.md").split("\n");
  const head = lines.findIndex((l) => /^##\s+2\./.test(l));
  if (head < 0) throw new Error("注入锚点不存在：找不到「## 2.」小节");
  let end = lines.length;
  for (let i = head + 1; i < lines.length; i += 1) {
    if (/^#{1,6}\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  writeMd(dir, "DEFECT-BACKLOG.md", [...lines.slice(0, head), ...lines.slice(end)].join("\n"));
  expectGreen(
    `NC-DS3 负对照：卸掉 DS3 判定（${n} 处）后，SP2 的注入转绿`,
    dir,
    "证明 SP2 那档的红确实来自 DS3 判定本身"
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* NC-DS4：卸掉 DS4 ⇒ SP4 的注入必须转绿。 */
{
  const dir = makeSandbox();
  const n = unloadCriterion(dir, "DS4");
  const mdDir = mdDirOf(dir);
  const counted = countedNames(fs.readdirSync(mdDir).filter((x) => x.endsWith(".md")));
  const keep = new Set(["ROADMAP.md", "DEFECT-BACKLOG.md"]);
  for (const x of counted) {
    if (keep.size >= 9) break;
    if (!keep.has(x)) keep.add(x);
  }
  for (const x of fs.readdirSync(mdDir)) {
    if (!keep.has(x)) fs.unlinkSync(path.join(mdDir, x));
  }
  expectGreen(
    `NC-DS4 负对照：卸掉 DS4 判定（${n} 处）后，SP4 的注入转绿`,
    dir,
    "证明 SP4 那档的红确实来自 DS4 判定本身"
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= COV2：覆盖度自证（双向） ================= */

/*
 * 这一段回答一个问题：**门禁里到底有几条红因、每条红因在源码里被调用了几次，
 *   自测知不知道？**
 * 六条互相独立的静态断言（缺一条就露一个洞）：
 *   COV2a 门禁里的 fail() 调用点数 == 归属表条数（多一条少一条都露）
 *   COV2b 每个调用点的判据都在静态清单里（清单外的新判据会露）
 *   COV2c 门禁解析出的判据集合 == 静态清单（**双向**：门禁多出来的、
 *          清单里写了门禁却没用上的，两边都会露）
 *   COV2d 每条归属恰好认领一个调用点（片段必须落在它自己的调用点区间里）
 *   COV2e 归属片段互不包含（否则一条红因行会被两条归属同时认领 ⇒ 归属不纯）
 *   COV2g **每条红因至少有一档能证明它会红**（11 条红因一条都不能漏）
 */
{
  const src = fs.readFileSync(GATE, "utf8");
  const calls = scanFailCalls(src);

  record(
    "COV2a 门禁的 fail() 调用点数 == 归属表条数",
    calls.length === CAUSES.length,
    calls.length === CAUSES.length
      ? `${calls.length} 个调用点 ↔ ${CAUSES.length} 条归属`
      : `解析出 ${calls.length} 个调用点，归属表登记了 ${CAUSES.length} 条`
  );

  const stray = calls.filter((c) => CRITERIA.indexOf(c.crit) < 0);
  record(
    "COV2b 每个调用点的判据都在静态清单里",
    stray.length === 0,
    stray.length === 0
      ? `调用点的判据：${calls.map((c) => c.crit).join(" / ")}`
      : `清单外的判据：${stray.map((c) => c.crit).join(" / ")}`
  );

  const gateSet = [...new Set(calls.map((c) => c.crit))].sort();
  const listSet = [...new Set(CRITERIA)].sort();
  record(
    "COV2c 门禁解析出的判据集合 == 静态清单（双向）",
    gateSet.length === listSet.length && gateSet.every((x, i) => x === listSet[i]),
    gateSet.join(",") === listSet.join(",")
      ? `判据集合 = {${gateSet.join(", ")}}`
      : `门禁 = {${gateSet.join(", ")}}，清单 = {${listSet.join(", ")}}`
  );

  /* 每条归属的片段必须落在「它自己的那个调用点」后面、下一个调用点前面。 */
  const pairing = CAUSES.map((c) => {
    const owners = ownersOfFrag(c.frag, calls, src);
    const ownerCall = owners.length === 1 ? calls[owners[0]] : null;
    return { c, owners, ok: owners.length === 1 && !!ownerCall && ownerCall.crit === c.crit };
  });
  const badPair = pairing.filter((p) => !p.ok);
  record(
    "COV2d 每条归属恰好认领一个调用点",
    badPair.length === 0,
    badPair.length === 0
      ? pairing.map((p) => `${p.c.id}→${p.c.crit}`).join(" / ")
      : badPair.map((p) => `${p.c.id}(${p.c.crit}) 认领了 ${p.owners.length} 个调用点`).join(" / ")
  );

  const fragClash = [];
  for (let i = 0; i < CAUSES.length; i += 1) {
    for (let j = i + 1; j < CAUSES.length; j += 1) {
      const a = CAUSES[i].frag;
      const b = CAUSES[j].frag;
      if (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) fragClash.push(`${CAUSES[i].id}/${CAUSES[j].id}`);
    }
  }
  record(
    "COV2e 归属片段互不包含",
    fragClash.length === 0,
    fragClash.length === 0 ? `${CAUSES.length} 段片段互不包含` : `互相包含：${fragClash.join(" / ")}`
  );
}

/* COV2f：运行时归属纯净 —— **一条判据触发多条红因**时，每条红因行都要各自认领。
 * 这一档故意让 DS3 触发两次（ROADMAP.md 不在场 ＋ DEFECT-BACKLOG 的 §2 标题被删）
 * ⇒ 两行红因、两行都必须被各自的一条归属认领，且认出的判据与行首编号一致。
 * 这一档同时证明「红因条数」与「判据集合」是两个量。 */
{
  const dir = makeSandbox();
  fs.unlinkSync(path.join(mdDirOf(dir), "ROADMAP.md"));
  const lines = readMd(dir, "DEFECT-BACKLOG.md").split("\n");
  const head = lines.findIndex((l) => /^##\s+2\./.test(l));
  if (head < 0) throw new Error("注入锚点不存在：找不到「## 2.」小节");
  let end = lines.length;
  for (let i = head + 1; i < lines.length; i += 1) {
    if (/^#{1,6}\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  writeMd(dir, "DEFECT-BACKLOG.md", [...lines.slice(0, head), ...lines.slice(end)].join("\n"));

  const r = runGate(dir);
  const rows = redRows(r.out);
  const attr = attributeRows(r.out);
  const ok =
    r.code === 1 &&
    rows.length === 2 &&
    attr.length === 2 &&
    attr.every((row) => row.hits.length === 1 && row.crits[0] === row.prefix && row.prefix === "DS3") &&
    attr[0].hits[0] !== attr[1].hits[0];
  record(
    "COV2f 运行时红因归属纯净（一条判据触发多条红因时逐条认领）",
    ok,
    ok
      ? `2 条红因行都被 DS3 判据各自认领（${attr.map((x) => x.hits.join("")).join(" / ")}）`
      : `code=${r.code} 红因行 ${rows.length}，归属=${attr
          .map((x) => `${x.prefix}<-${x.hits.join("+") || "无"}`)
          .join(" / ")}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* COV2g：每条红因**至少有一档**能证明它会变红 —— 11 条一条都不能漏。
 * 这一条把「注入档」与「归属表」扣在一起：归属表里多写一条没人能触发的红因，
 * 或者少写一条门禁真会报的，都会在这里露出来。 */
{
  const all = CAUSES.map((c) => c.id);
  const missing = all.filter((id) => !coveredCauses.has(id));
  record(
    "COV2g 每条红因至少有一档能证明它会变红",
    missing.length === 0,
    missing.length === 0
      ? `${all.length} 条红因全部有档可证`
      : `没有档能证的红因：${missing.join(" / ")}`
  );
}

/* ================= 收尾：仓库原件没被动过 ================= */

const problems = [];
if (sha256(GATE) !== GATE_SHA_AT_START) {
  problems.push("仓库里的门禁原件在自测期间被改动了 —— 自测必须只在副本上注入。");
}

if (problems.length) {
  console.error("\n文档快照门禁自测未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

const bad = results.filter((r) => !r.ok);
console.log(
  `\n自测矩阵：${results.length} 档里 ${results.length - bad.length} 档按预期触发` +
    `${bad.length ? `，${bad.length} 档未通过` : ""}` +
    `（SP0–SP11 是注入档；NC-DS1–NC-DS4 是判据级负对照；COV2a–COV2g 是覆盖度自证）。`
);
if (bad.length) bad.forEach((b) => console.log(`  · 未通过：${b.id}`));
console.log("  · 原件校验：门禁的 SHA-256 与自测开始时一致。");
process.exit(bad.length ? 1 : 0);
