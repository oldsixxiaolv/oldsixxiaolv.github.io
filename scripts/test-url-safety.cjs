#!/usr/bin/env node
/**
 * 注入面门禁的**自测** —— 四件套。
 *
 * 这道门禁判的是「产物里没有可执行 URL / 站内不把字符串当 HTML 解析 /
 * 注释外链只放行 http/https / 渲染层绑在白名单上」，而这四件事在真站上**都是好的**
 * （实测：产物 0 处可执行 URL、0 处 innerHTML、6 条注释链接全是 https）
 * ⇒ 它在真仓上**永远判绿** —— 一道「只在自己身上绿、没人知道它判红过没有」的门禁，
 * 等于没写（同族形态见 check-gates-wired.cjs 文件头：「看起来在、其实不生效」）。
 * ⇒ 必须有一套**注入矩阵**把每一条判据都逼红一次。
 *
 *   一、红因归属表 —— 门禁的 note() 调用逐条登记判据号与**唯一文案片段**。
 *   二、归属纯净 —— 运行时的每一条红因必须**恰好**被一条归属认领；
 *      判据集合必须**恰为**期望值（多一条、少一条都算失败）。
 *   三、覆盖度自证 —— 门禁的 note() 调用点与归属表**双向**对齐；
 *      门禁解析出的判据集合与静态清单一致；每条红因、每条判据都至少一档判红。
 *   四、判据级负对照 —— 在门禁**副本**里把某条判据卸掉
 *      （把它那一个 `const USn_ON = true;` 改成 false，**行数不变**），
 *      对应夹具必须转绿 ⇒ 证明那条红确实是它判出来的，而不是别的判据顺带报出来的。
 *
 * ⚠ 每一档的注入都是**照着真实事故形态**造的：
 *   SA7（HTML 实体混淆）、SA8（制表符混淆）、SA9（同一行里 `//` 之后的注入点）
 *   三档来自 2026-10-27 那次**独立复核**实测出来的假绿路径 ——
 *   它们在真实 Chrome 里**真的会执行**，而当时的门禁全绿。
 *
 * 夹具是**一份合成的最小产物**（HTML + 站点 JS + **从仓库真源复制的 paper-reader 模块** +
 * package.json），门禁通过 SITE_DIR / PKG_PATH 指过去 ⇒ 注入全程不碰仓库里的任何文件
 * （末尾有仓库真源的 sha256 自证）。
 *
 * 用法：node scripts/test-url-safety.cjs
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-url-safety.cjs");
/** 真源里的白名单模块与 paper-reader 模块（夹具从它复制 ⇒ 改真源，夹具自动跟着改）。 */
const ALLOWLIST_SRC = path.join(ROOT, "src/assets/js/paper-reader/url-safety.js");
const PAPER_READER_SRC = path.join(ROOT, "src/assets/js/paper-reader");

/* ========== 一、红因归属表：判据 → 唯一文案片段 ========== */

const CAUSES = [
  { id: "US1", crit: "US1", frag: "US1 " },
  { id: "US2", crit: "US2", frag: "US2 " },
  { id: "US3", crit: "US3", frag: "US3 " },
  { id: "US4", crit: "US4", frag: "US4 " },
  { id: "US5", crit: "US5", frag: "US5 " },
];
/** 静态判据清单（门禁里应当且仅应当有这些判据）。 */
const CRITERIA = ["US1", "US2", "US3", "US4", "US5"];

/* ========== 工具 ========== */

/** 扫出源码里所有 note() 调用点（模板字面量 / 引号都吃）。 */
const NOTE_RE = /(?<![.\w$])note\s*\(\s*(?:`([^`]*)`|"([^"]*)"|'([^']*)')/g;
function scanNoteCalls(src) {
  const out = [];
  for (const m of src.matchAll(NOTE_RE)) {
    const literal = m[1] ?? m[2] ?? m[3] ?? "";
    out.push({ index: m.index, literal, crit: (literal.match(/^\s*(US\d+)\b/) || [])[1] || "" });
  }
  return out;
}

/** 门禁输出里每条红因起头都是 "  ✗ "。 */
function causeHeads(out) {
  return out.split("\n").filter((l) => /^\s*✗\s/.test(l));
}

/** 归属：每条红因必须**恰好**被一条归属认领；返回判据集合。 */
function attribute(out) {
  const rows = causeHeads(out).map((line) => ({
    line,
    owners: CAUSES.filter((c) => line.includes(c.frag)),
  }));
  const impure = rows.find((r) => r.owners.length !== 1) || null;
  const crits = [
    ...new Set(rows.filter((r) => r.owners.length === 1).map((r) => r.owners[0].crit)),
  ].sort();
  return { rows, crits, impure };
}

/* ========== 夹具 ========== */

/** 夹具的产物：一份最小但健康的站点产物（形状与真站一致）。 */
function fixtureFiles() {
  return {
    "index.html": `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>fixture</title></head>
<body>
  <p><a href="https://example.com/paper">paper</a></p>
  <script type="module" src="/assets/js/main.js"></script>
</body>
</html>
`,
    "assets/js/main.js": `// 站点脚本（夹具）：干净的一份 —— 没有把字符串当 HTML 解析。
export const ready = true;
`,
  };
}

/** 夹具里 paper-reader 模块的相对目录（与门禁源码里那张表一致）。 */
const PAPER_READER_REL = path.join("assets", "js", "paper-reader");
/** 夹具里白名单模块的相对路径（与门禁源码里那张表一致）。 */
const ALLOWLIST_REL = path.join(PAPER_READER_REL, "url-safety.js");

/* ========== 副本构造 ========== */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mh-url-safety-selftest-"));

/** 建一个夹具站（产物 + package.json），在副本上注入。 */
function buildFixture(mutate) {
  const dir = fs.mkdtempSync(path.join(tmp, "case-"));
  const site = path.join(dir, "_site");
  for (const [rel, text] of Object.entries(fixtureFiles())) {
    const p = path.join(site, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
  }
  /* paper-reader 模块：整目录从**仓库真源**复制（改了真源，夹具自动跟着改）。 */
  const dst = path.join(site, PAPER_READER_REL);
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(PAPER_READER_SRC)) {
    if (!name.endsWith(".js")) continue;
    fs.copyFileSync(path.join(PAPER_READER_SRC, name), path.join(dst, name));
  }
  /* 夹具的 package.json：build 链里必须**真的执行**本门禁（覆盖度自证里那条接线判据）。 */
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name: "fixture",
        version: "1.0.0",
        private: true,
        scripts: { build: `node scripts/${path.basename(GATE)}` },
      },
      null,
      2
    )
  );
  if (mutate) mutate({ dir, site });
  return dir;
}

/** 跑一次门禁（夹具通过 SITE_DIR / PKG_PATH 注入）。 */
function runGate(gatePath, fixtureDir) {
  const env = {
    ...process.env,
    SITE_DIR: path.join(fixtureDir, "_site"),
    PKG_PATH: path.join(fixtureDir, "package.json"),
  };
  const r = spawnSync(process.execPath, [gatePath], { env, encoding: "utf8", cwd: ROOT });
  return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
}

/** 改夹具产物里的某个文件（按相对路径）。 */
function patch(site, rel, fn) {
  const p = path.join(site, rel);
  fs.writeFileSync(p, fn(fs.readFileSync(p, "utf8")));
}

/* ========== 注入档 ========== */

const MUT = {
  /** 产物 HTML 的 href 里出现可执行 URL ⇒ 只有 US1 应当红。 */
  executableUrl: ({ site }) => {
    patch(site, "index.html", (s) => s.replace("https://example.com/paper", "javascript:alert(1)"));
  },
  /** 站点 JS 把字符串当 HTML 解析 ⇒ 只有 US2 应当红。 */
  parseStringAsHtml: ({ site }) => {
    patch(site, path.join("assets", "js", "main.js"), (s) => `${s}\nnode.innerHTML = userInput;\n`);
  },
  /**
   * 白名单模块**放行一切** ⇒ 只有 US3 应当红。
   *
   * ⚠ 注入刻意**不写**那个协议的字面量：写进去的话 US1 的文本扫描也会命中
   * （它扫的就是「产物里出现可执行 URL 的形态」）⇒ 那一档会同时红两条判据，
   * 归因就不纯了。改成「放行一切」更贴近真实事故（白名单被放松），
   * 而且它证明 US3 判的是**行为**、不是文本长相。
   */
  allowlistTooLoose: ({ site }) => {
    patch(site, ALLOWLIST_REL, (s) =>
      s.replace(
        "return SAFE_LINK_SCHEMES.includes(parsed.protocol);",
        "return true; // 注入：白名单被放松成放行一切"
      )
    );
  },
  /** 白名单多放行一个协议（mailto:）⇒ 只有 US3 应当红（13 条旧探针抓不到它）。 */
  allowlistExtraScheme: ({ site }) => {
    patch(site, ALLOWLIST_REL, (s) =>
      s.replace(
        'export const SAFE_LINK_SCHEMES = ["http:", "https:"];',
        'export const SAFE_LINK_SCHEMES = ["http:", "https:", "mailto:"];'
      )
    );
  },
  /** 产物里没有白名单模块 ⇒ 「判不出」⇒ 只有 US4 应当红。 */
  allowlistMissing: ({ site }) => {
    fs.rmSync(path.join(site, ALLOWLIST_REL));
  },
  /** build 链里只**提到**门禁名、并不真的执行它 ⇒ 只有 US4 应当红。 */
  wiringGutted: ({ dir }) => {
    const p = path.join(dir, "package.json");
    const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
    pkg.scripts.build = `echo "scripts/${path.basename(GATE)}"`;
    fs.writeFileSync(p, JSON.stringify(pkg, null, 2));
  },
  /** 产物里一个 JS 文件都没有 ⇒ 只有 US4 应当红。 */
  noJsFiles: ({ site }) => {
    fs.rmSync(path.join(site, "assets", "js"), { recursive: true, force: true });
  },
  /** 渲染层绕过白名单（把数据里的 URL 直接写进 href）⇒ 只有 US5 应当红。 */
  renderBypassesAllowlist: ({ site }) => {
    patch(site, path.join(PAPER_READER_REL, "annotations.js"), (s) =>
      s.replace(
        'el("a", attrs, `${l.label} →`)',
        'el("a", { href: l.url, target: "_blank", rel: "noopener noreferrer" }, `${l.label} →`)'
      )
    );
  },
  /** HTML 内联脚本里出现 innerHTML ⇒ 只有 US2 应当红（真实浏览器里会执行）。 */
  inlineScriptParsesHtml: ({ site }) => {
    patch(site, "index.html", (s) =>
      s.replace("</body>", "<script>document.body.innerHTML = userInput;</script>\n</body>")
    );
  },
  /** HTML 实体混淆的脚本协议 ⇒ 只有 US1 应当红（浏览器会解码后执行）。 */
  entityObfuscation: ({ site }) => {
    patch(site, "index.html", (s) =>
      s.replace("https://example.com/paper", "&#106;avascript:alert(1)")
    );
  },
  /** 制表符混淆的脚本协议 ⇒ 只有 US1 应当红（URL 解析会去掉制表符）。 */
  tabObfuscation: ({ site }) => {
    patch(site, "index.html", (s) =>
      s.replace("https://example.com/paper", "java\tscript:alert(1)")
    );
  },
  /** 同一行里 `//` 之后的注入点 ⇒ 只有 US1 应当红（注释剥离不能吃掉它）。 */
  sameLineAfterSlashes: ({ site }) => {
    patch(site, path.join("assets", "js", "main.js"), (s) =>
      `${s}\nconst CDN = "//cdn.example.com"; const u = "javascript:alert(1)";\n`
    );
  },
};

/** 注入档：expect=null 表示期望判绿，否则期望判红且判据集合**恰为** expect。 */
const CASES = [
  { id: "SA0", label: "基线（健康的合成产物）", mutate: null, expect: null },
  { id: "SA1", label: "产物 HTML 的 href 里出现可执行 URL", mutate: MUT.executableUrl, expect: ["US1"] },
  { id: "SA2", label: "站点 JS 把字符串当 HTML 解析", mutate: MUT.parseStringAsHtml, expect: ["US2"] },
  { id: "SA3", label: "白名单被放松成放行一切", mutate: MUT.allowlistTooLoose, expect: ["US3"] },
  { id: "SA4", label: "产物里没有白名单模块（判不出）", mutate: MUT.allowlistMissing, expect: ["US4"] },
  { id: "SA5", label: "渲染层绕过白名单（href 直接写进渲染层）", mutate: MUT.renderBypassesAllowlist, expect: ["US5"] },
  { id: "SA6", label: "HTML 内联脚本把字符串当 HTML 解析", mutate: MUT.inlineScriptParsesHtml, expect: ["US2"] },
  { id: "SA7", label: "HTML 实体混淆的脚本协议", mutate: MUT.entityObfuscation, expect: ["US1"] },
  { id: "SA8", label: "制表符混淆的脚本协议", mutate: MUT.tabObfuscation, expect: ["US1"] },
  { id: "SA9", label: "同一行里 `//` 之后的注入点", mutate: MUT.sameLineAfterSlashes, expect: ["US1"] },
  { id: "SA10", label: "白名单多放行 mailto:", mutate: MUT.allowlistExtraScheme, expect: ["US3"] },
  { id: "SA11", label: "build 链只提到门禁名、并不真的执行", mutate: MUT.wiringGutted, expect: ["US4"] },
  { id: "SA12", label: "产物里一个 JS 文件都没有", mutate: MUT.noJsFiles, expect: ["US4"] },
];

/* ========== 四、判据级负对照 ========== */

const NEG_CASES = [
  { id: "SA13", crit: "US1", case: "SA1", label: "卸掉 US1" },
  { id: "SA14", crit: "US2", case: "SA2", label: "卸掉 US2" },
  { id: "SA15", crit: "US3", case: "SA3", label: "卸掉 US3" },
  { id: "SA16", crit: "US4", case: "SA4", label: "卸掉 US4" },
  { id: "SA17", crit: "US5", case: "SA5", label: "卸掉 US5" },
];

/** 在门禁副本里卸掉某条判据：把 `const USn_ON = true;` 改成 false（**行数不变**）。 */
function unloadCriterion(src, crit) {
  const re = new RegExp(`const ${crit}_ON = true;`, "g");
  if (!re.test(src)) return null;
  return src.replace(re, `const ${crit}_ON = false;`);
}

/* ========== 执行 ========== */

let failed = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => {
  console.log(`  ✗ ${msg}`);
  failed += 1;
};

const gateSrc = fs.readFileSync(GATE, "utf8");
const calls = scanNoteCalls(gateSrc);
const seenCauses = new Set();
const seenCriteria = new Set();

/** 仓库真源（门禁 + 渲染层 + 白名单模块 + paper-reader 目录）的整体指纹。 */
function repoDigest() {
  const h = crypto.createHash("sha256");
  const files = [GATE, ALLOWLIST_SRC, path.join(ROOT, "src/assets/js/paper-reader/annotations.js")];
  for (const name of fs.readdirSync(PAPER_READER_SRC)) {
    if (name.endsWith(".js")) files.push(path.join(PAPER_READER_SRC, name));
  }
  for (const p of files) {
    h.update(p).update(fs.existsSync(p) ? fs.readFileSync(p) : "<missing>");
  }
  return h.digest("hex");
}
const REAL_DIGEST = repoDigest();

/** 跑一档注入并核对：判红/判绿、门禁确实跑到自己的结论、归属纯净、判据集合恰为。 */
function checkCase(spec, fixtureDir, gatePath) {
  const r = runGate(gatePath, fixtureDir);
  const a = attribute(r.out);
  if (a.impure) {
    bad(
      `${spec.id} ${spec.label} → 有红因无法唯一归类（匹配到 ${a.impure.owners.length} 条归属）：` +
        `${a.impure.line.trim().slice(0, 90)}`
    );
    return;
  }
  if (spec.expect === null) {
    if (r.code !== 0 || !r.out.includes("注入面门禁通过")) {
      bad(`${spec.id} ${spec.label} → 期望判绿（exit 0），实测 exit ${r.code}`);
      console.log(r.out.split("\n").filter((l) => l.includes("✗")).join("\n"));
      return;
    }
    if (a.rows.length !== 0) {
      bad(`${spec.id} ${spec.label} → 判绿但仍有 ${a.rows.length} 条红因`);
      return;
    }
    ok(`${spec.id} ${spec.label} → 判绿 exit 0，零红因`);
    return;
  }
  if (r.code !== 1 || !r.out.includes("注入面门禁未通过")) {
    bad(
      `${spec.id} ${spec.label} → 期望门禁自己报红（exit 1），实测 exit ${r.code}` +
        `（非 1 说明门禁崩了，不是判红）`
    );
    console.log(r.out.split("\n").slice(0, 4).join("\n"));
    return;
  }
  if (a.crits.join(",") !== spec.expect.join(",")) {
    bad(
      `${spec.id} ${spec.label} → 判据集合应为恰为 {${spec.expect.join(", ")}}，` +
        `实测 {${a.crits.join(", ") || "空"}}`
    );
    console.log(a.rows.map((x) => x.line.trim().slice(0, 110)).join("\n"));
    return;
  }
  for (const row of a.rows) seenCauses.add(row.owners[0].id);
  for (const c of a.crits) seenCriteria.add(c);
  ok(`${spec.id} ${spec.label} → 判红 exit 1，判据集合恰为 {${a.crits.join(", ")}}，红因 ${a.rows.length} 条`);
}

console.log("注入面门禁 · 自测（四件套）：\n");

/* ---- 一、红因归属表 ---- */
console.log("一、红因归属表");
{
  const bads = [];
  for (let a = 0; a < CAUSES.length; a++) {
    for (let b = 0; b < CAUSES.length; b++) {
      if (a !== b && CAUSES[a].frag.includes(CAUSES[b].frag)) bads.push(`${CAUSES[a].id}⊃${CAUSES[b].id}`);
    }
  }
  if (bads.length) bad(`文案片段互不包含：${bads.join("、")}`);
  else ok(`${CAUSES.length} 条红因归属登记（${CAUSES.map((c) => c.id).join(" / ")}），文案片段互不包含`);

  const orphan = CAUSES.filter((c) => !CRITERIA.includes(c.crit));
  if (orphan.length) bad(`归属里有不在静态清单里的判据：${orphan.map((c) => c.id).join("、")}`);
  else ok(`每条归属的判据都在静态清单 ${JSON.stringify(CRITERIA)} 内`);

  const noCause = CRITERIA.filter((c) => !CAUSES.some((x) => x.crit === c));
  if (noCause.length) bad(`静态清单里的判据没有红因归属：${noCause.join("、")}`);
  else ok("静态清单里的每条判据都至少有一条红因归属");
}

/* ---- 二、覆盖度自证 ---- */
console.log("\n二、覆盖度自证");
{
  const owners = calls.map((c) => CAUSES.filter((x) => c.literal.includes(x.frag)));
  const multi = owners.map((o, i) => ({ i, o })).filter((x) => x.o.length !== 1);
  if (multi.length) {
    bad(`有 ${multi.length} 个 note() 调用点没能唯一归属：${multi.map((m) => m.i).join(", ")}`);
  } else {
    ok(`门禁的 ${calls.length} 个 note() 调用点逐个唯一归属（双向对齐）`);
  }

  if (calls.length !== CAUSES.length) {
    bad(`门禁 note() 调用点数 ${calls.length} != 归属表 ${CAUSES.length} 条`);
  } else {
    ok(`调用点数 ${calls.length} == 归属表条数 ${CAUSES.length}`);
  }
  const claimed = owners.map((o) => (o.length === 1 ? o[0].id : ""));
  const dup = claimed.filter((id) => id && claimed.filter((x) => x === id).length > 1);
  if (dup.length) bad(`有归属认领了多个调用点：${[...new Set(dup)].join("、")}`);
  else ok("每条归属恰好认领一个调用点（无遗漏、无多领）");

  const critSet = [...new Set(calls.map((c) => c.crit).filter(Boolean))].sort();
  if (critSet.join(",") !== [...CRITERIA].sort().join(",")) {
    bad(`门禁解析出的判据集合 {${critSet.join(", ")}} != 静态清单 {${CRITERIA.join(", ")}}`);
  } else {
    ok(`门禁解析出的判据集合 {${critSet.join(", ")}} == 静态清单`);
  }
  const critMismatch = calls.filter((c, i) => owners[i].length === 1 && owners[i][0].crit !== c.crit);
  if (critMismatch.length) bad(`有调用点解析出的判据号与归属登记不一致：${critMismatch.length} 处`);
  else ok("每个调用点解析出的判据号与归属登记一致");
}

/* ---- 三、注入档 ---- */
console.log("\n三、注入档");
const fixtures = {};
for (const spec of CASES) {
  let dir;
  try {
    dir = buildFixture(spec.mutate);
  } catch (e) {
    bad(`${spec.id} ${spec.label} → 注入本身坏了：${e.message}`);
    continue;
  }
  fixtures[spec.id] = dir;
  checkCase(spec, dir, GATE);
}

/* ---- 四、判据级负对照 ---- */
console.log("\n四、判据级负对照");
{
  for (const nc of NEG_CASES) {
    const patched = unloadCriterion(gateSrc, nc.crit);
    if (patched === null) {
      bad(`${nc.id} → 门禁里找不到判据 ${nc.crit} 的开关（const ${nc.crit}_ON = true;）`);
      continue;
    }
    const beforeLines = gateSrc.split("\n");
    const afterLines = patched.split("\n");
    if (beforeLines.length !== afterLines.length) {
      bad(`${nc.id} → 卸判据改变了行数（${beforeLines.length} → ${afterLines.length}）`);
      continue;
    }
    const diff = beforeLines.filter((l, i) => l !== afterLines[i]).length;
    if (diff !== 1) {
      bad(`${nc.id} → 差异行数 ${diff} != 1`);
      continue;
    }
    const gateDir = fs.mkdtempSync(path.join(tmp, "gate-"));
    const mirror = path.join(gateDir, "check-url-safety.cjs");
    fs.writeFileSync(mirror, patched);
    const base = runGate(GATE, fixtures[nc.case]);
    const baseAttr = attribute(base.out);
    if (baseAttr.crits.join(",") !== nc.crit) {
      bad(`${nc.id} → 基线 ${nc.case} 的判据集合应为恰为 {${nc.crit}}，实测 {${baseAttr.crits.join(", ") || "空"}}`);
      continue;
    }
    const r = runGate(mirror, fixtures[nc.case]);
    const a = attribute(r.out);
    if (r.code !== 0 || !r.out.includes("注入面门禁通过")) {
      bad(`${nc.id} → 卸掉 ${nc.crit} 后 ${nc.case} 夹具必须转绿（exit 0），实测 exit ${r.code}`);
      console.log(r.out.split("\n").filter((l) => l.includes("✗")).join("\n"));
    } else if (a.rows.length !== 0) {
      bad(`${nc.id} → 卸掉 ${nc.crit} 后 ${nc.case} 夹具判绿但仍有 ${a.rows.length} 条红因`);
    } else {
      ok(
        `${nc.id} 卸掉 ${nc.crit}（差异 ${diff} 行，行数不变）→ ` +
          `基线 {${nc.crit}} ⇒ 同一夹具转绿，零红因`
      );
    }
  }
}

/* ---- 每条红因、每条判据都至少一档判红 ---- */
{
  const noCase = CAUSES.filter((c) => !seenCauses.has(c.id)).map((c) => c.id);
  if (noCase.length) bad(`这些红因没有任何一档判红（等于不可证）：${noCase.join("、")}`);
  else ok(`每条红因都至少一档判红（${seenCauses.size}/${CAUSES.length}）`);
  const noCrit = CRITERIA.filter((c) => !seenCriteria.has(c));
  if (noCrit.length) bad(`这些判据没有任何一档判红：${noCrit.join("、")}`);
  else ok(`每条判据都至少一档判红（${seenCriteria.size}/${CRITERIA.length}）`);
}

/* ---- 仓库真源一个字节没动 ---- */
{
  const after = repoDigest();
  if (after !== REAL_DIGEST) {
    bad("自测期间仓库真源被改动了 —— 注入必须只在副本上做");
  } else {
    ok(`仓库真源指纹前后一致（${REAL_DIGEST.slice(0, 16)}…）—— 注入全程只在临时副本上做`);
  }
}

console.log("");
if (failed) {
  console.log(`注入面门禁自测失败：${failed} 项断言未通过。`);
  process.exit(1);
}
console.log("注入面门禁自测全部通过。");
