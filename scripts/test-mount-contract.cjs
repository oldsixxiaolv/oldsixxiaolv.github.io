#!/usr/bin/env node
/**
 * 挂载无关契约门禁的**自测** —— 四件套。
 *
 * 这道门禁判的是**文档文本**（挂载无关承诺必须带例外限定），
 * 而"注入没生效"（锚点不存在、改的是副本还是原件、门禁自己被卸掉了）
 * 恰恰是最容易发生、也最不容易看出来的失败模式。
 * 所以自测必须回答四件事：
 *
 *   一、红因归属表 —— 门禁的 8 处 fail() 调用逐条登记判据号与**唯一文案片段**。
 *   二、归属纯净 —— 运行时的每一条红因必须**恰好**被一条归属认领；
 *      判据集合必须**恰为**期望值（多一条、少一条都算失败）。
 *   三、覆盖度自证 —— 门禁的 fail() 调用点与归属表**双向**对齐；
 *      门禁解析出的判据集合与静态清单一致；每条红因、每条判据都至少一档判红。
 *   四、判据级负对照 —— 在门禁**副本**里把某条判据卸掉
 *      （给它每一条 fail() 调用同行加 `if (false) ` 前缀，**行数不变**），
 *      该判据的红因必须消失、其余红因必须照旧。
 *
 * 注入全程只在 /tmp 副本上做；仓库里的文件一个字节都不动（末尾有 sha256 自证）。
 *
 * 用法：node scripts/test-mount-contract.cjs
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-mount-contract.cjs");
const CONFIG_SRC = path.join(ROOT, "eleventy.config.js");
/** 扫描面与门禁默认一致：仓库根 + docs/（都不递归）。 */
const SRC_DIRS = [ROOT, path.join(ROOT, "docs")];

/* ========== 一、红因归属表：判据 → 唯一文案片段 ========== */

const CAUSES = [
  { id: "MC1", crit: "MC1", frag: "有一行挂载无关承诺，却没在同一行里说明例外" },
  { id: "MC2a", crit: "MC2", frag: "扫描范围里没有 README.md" },
  { id: "MC2b", crit: "MC2", frag: "README.md 里没有一行同时含" },
  { id: "MC3a", crit: "MC3", frag: "读不到源码就没法验证例外是否兑现" },
  { id: "MC3b", crit: "MC3", frag: '里找不到 addFilter("relUrl")' },
  { id: "MC3c", crit: "MC3", frag: "relUrl 过滤器里没有 ctx.is404 的 404 特判" },
  { id: "MC4a", crit: "MC4", frag: "个 markdown 文件（要求至少" },
  { id: "MC4b", crit: "MC4", frag: "一处挂载无关承诺都没检出（要求至少" },
];
/** 静态判据清单（门禁里应当且仅应当有这些判据）。 */
const CRITERIA = ["MC1", "MC2", "MC3", "MC4"];

/* ========== 工具 ========== */

/** 扫出源码里所有 fail() 调用点（单行/多行、模板字面量/引号都吃）。 */
const FAIL_RE = /(?<![.\w$])fail\s*\(\s*(?:`([^`]*)`|"([^"]*)"|'([^']*)')/g;
function scanFailCalls(src) {
  const out = [];
  for (const m of src.matchAll(FAIL_RE)) {
    const literal = m[1] ?? m[2] ?? m[3] ?? "";
    out.push({
      index: m.index,
      anchor: m[0].slice(0, m[0].indexOf("(") + 1),
      literal,
      crit: (literal.match(/^\s*(MC\d+)\b/) || [])[1] || "",
    });
  }
  return out;
}

/** 门禁输出里每条红因起头都是 "  ✗ "，其后的缩进行是同一条红因的续行。 */
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

function replaceOnce(text, from, to) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error(`注入锚点出现 ${n} 次（应恰好 1 次）：「${from.slice(0, 36)}…」`);
  return text.replace(from, to);
}

/* ========== 副本构造 ========== */

/** 收集扫描面里的全部 markdown（含 `._*` 与 IMPROVEMENT-LOG.md —— 让门禁自己按规则过滤）。 */
const originals = [];
for (const dir of SRC_DIRS) {
  if (!fs.existsSync(dir)) continue;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isFile() && e.name.endsWith(".md")) originals.push({ name: e.name, src: path.join(dir, e.name) });
  }
}
if (originals.length === 0) {
  console.error("挂载无关契约自测失败：一个 markdown 文件都没找到，注入前提不成立。");
  process.exit(1);
}
if (!fs.existsSync(CONFIG_SRC)) {
  console.error("挂载无关契约自测失败：找不到 eleventy.config.js。");
  process.exit(1);
}

/** 仓库真实文件（门禁 + 全部 markdown + 配置）的整体指纹：自测前后必须一致。 */
function repoDigest() {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(GATE));
  for (const f of originals.slice().sort((a, b) => (a.src < b.src ? -1 : 1))) {
    h.update(f.src).update(fs.readFileSync(f.src));
  }
  h.update(fs.readFileSync(CONFIG_SRC));
  return h.digest("hex");
}
const REAL_DIGEST = repoDigest();

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mh-mountcontract-selftest-"));

/** 给副本做内容指纹，用来判断"这一档到底有没有真的改动"。 */
function fingerprint(mdDir, cfgPath) {
  const h = crypto.createHash("sha256");
  for (const name of fs.readdirSync(mdDir).sort()) {
    h.update(name).update(fs.readFileSync(path.join(mdDir, name)));
  }
  h.update(fs.existsSync(cfgPath) ? fs.readFileSync(cfgPath) : "<no-config>");
  return h.digest("hex");
}

/** 建一个独立副本目录（md 全量 + 配置），在副本上注入。 */
function buildCase(mutate) {
  const work = fs.mkdtempSync(path.join(tmp, "case-"));
  const mdDir = path.join(work, "md");
  fs.mkdirSync(mdDir);
  for (const f of originals) fs.copyFileSync(f.src, path.join(mdDir, f.name));
  const cfgPath = path.join(work, "eleventy.config.js");
  fs.copyFileSync(CONFIG_SRC, cfgPath);
  if (mutate) {
    const before = fingerprint(mdDir, cfgPath);
    mutate({
      mdDir,
      cfgPath,
      read: (p) => fs.readFileSync(p, "utf8"),
      write: (p, s) => fs.writeFileSync(p, s),
      drop: (p) => fs.unlinkSync(p),
    });
    if (fingerprint(mdDir, cfgPath) === before) {
      throw new Error("注入没有改变任何内容 —— 锚点不存在，这一档是坏跑");
    }
  }
  return { work, mdDir, cfgPath };
}

/** 跑一次门禁；useRepo=true 时不覆盖扫描面（直接跑仓库原件）。 */
function runGate(gatePath, mdDir, cfgPath, useRepo) {
  const env = { ...process.env };
  if (useRepo) {
    delete env.MCC_DOC_DIRS;
    delete env.MCC_CONFIG;
  } else {
    env.MCC_DOC_DIRS = mdDir;
    env.MCC_CONFIG = cfgPath;
  }
  const r = spawnSync(process.execPath, [gatePath], { env, encoding: "utf8" });
  return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
}

/* ========== 二、注入档 ========== */

const DEPLOY_QUALIFIER =
  "（**404 页除外**：GitHub Pages 会把 `/404.html` 的内容送到任意未匹配路径，" +
  "而浏览器地址栏仍停在请求路径上，相对 URL 在那里没有正确解，" +
  "故 404 页的站内 URL 一律**根绝对**）";
const ROADMAP_QUALIFIER = "「整个文件夹扔到哪都能跑」原则（普通页面不受影响）";

const MUT = {
  dropDeployQualifier: ({ mdDir, read, write }) => {
    const p = path.join(mdDir, "DEPLOY.md");
    write(p, replaceOnce(read(p), DEPLOY_QUALIFIER, ""));
  },
  dropRoadmapQualifier: ({ mdDir, read, write }) => {
    const p = path.join(mdDir, "ROADMAP.md");
    write(p, replaceOnce(read(p), ROADMAP_QUALIFIER, "「整个文件夹扔到哪都能跑」原则"));
  },
  dropReadmeGithubPages: ({ mdDir, read, write }) => {
    const p = path.join(mdDir, "README.md");
    write(p, replaceOnce(read(p), "GitHub Pages 会把", "GitHub 服务会把"));
  },
  dropIs404Branch: ({ cfgPath, read, write }) => {
    write(
      cfgPath,
      replaceOnce(
        read(cfgPath),
        "    // 404 页：站内 URL 一律根绝对（理由见上面的注释块）\n" +
          "    if (this && this.ctx && this.ctx.is404) {\n" +
          '      return "/" + clean;\n' +
          "    }\n",
        ""
      )
    );
  },
  renameRelUrlFilter: ({ cfgPath, read, write }) => {
    write(cfgPath, replaceOnce(read(cfgPath), 'addFilter("relUrl"', 'addFilter("relUrlX"'));
  },
  dropConfig: ({ cfgPath, drop }) => drop(cfgPath),
  dropReadme: ({ mdDir, drop }) => drop(path.join(mdDir, "README.md")),
  keepTwoMd: ({ mdDir }) => {
    const keep = new Set(["README.md", "HOW_TO_RUN.md"]);
    for (const name of fs.readdirSync(mdDir)) {
      if (!keep.has(name)) fs.unlinkSync(path.join(mdDir, name));
    }
  },
  wipePromiseWording: ({ mdDir, read, write }) => {
    for (const name of fs.readdirSync(mdDir)) {
      if (name.startsWith("._")) continue;
      const p = path.join(mdDir, name);
      let t = read(p);
      for (const marker of ["任何挂载点都能跑", "扔到哪都能跑", "挂载点无关", "挂载无关"]) {
        t = t.split(marker).join("可移植");
      }
      write(p, t);
    }
  },
};

/** 注入档：expect=null 表示期望判绿，否则期望判红且判据集合**恰为** expect。 */
const CASES = [
  { id: "MT0", label: "基线（原样，副本）", mutate: null, expect: null },
  { id: "MT0r", label: "基线（仓库原件，未覆盖扫描面）", mutate: null, expect: null, repo: true },
  { id: "MT1", label: "DEPLOY.md 承诺行删掉限定词", mutate: MUT.dropDeployQualifier, expect: ["MC1"] },
  { id: "MT2", label: "README 承诺行去掉「GitHub Pages」", mutate: MUT.dropReadmeGithubPages, expect: ["MC2"] },
  { id: "MT3", label: "relUrl 的 404 分支被删掉", mutate: MUT.dropIs404Branch, expect: ["MC3"] },
  { id: "MT4", label: "只给门禁看 2 个 markdown 文件", mutate: MUT.keepTwoMd, expect: ["MC4"] },
  { id: "MT5", label: "README.md 从扫描范围里消失", mutate: MUT.dropReadme, expect: ["MC2"] },
  { id: "MT6", label: "eleventy.config.js 不存在", mutate: MUT.dropConfig, expect: ["MC3"] },
  { id: "MT7", label: "relUrl 过滤器被改名（找不到 addFilter）", mutate: MUT.renameRelUrlFilter, expect: ["MC3"] },
  { id: "MT8", label: "全部文档的承诺措辞被抹掉", mutate: MUT.wipePromiseWording, expect: ["MC2", "MC4"] },
  { id: "MT9", label: "两个文件的承诺行同时失去限定", mutate: (c) => { MUT.dropDeployQualifier(c); MUT.dropRoadmapQualifier(c); }, expect: ["MC1"], rows: 2 },
  { id: "MT10", label: "承诺失去限定 + README 去掉「GitHub Pages」", mutate: (c) => { MUT.dropDeployQualifier(c); MUT.dropReadmeGithubPages(c); }, expect: ["MC1", "MC2"] },
  { id: "MT11", label: "relUrl 分支被删 + 只留 2 个 md", mutate: (c) => { MUT.dropIs404Branch(c); MUT.keepTwoMd(c); }, expect: ["MC3", "MC4"] },
];

/* ========== 四、判据级负对照 ========== */

/** 在门禁副本里卸掉某条判据：给它每一条 fail() 调用**同行**加 `if (false) ` 前缀。 */
function unloadCriterion(src, calls, crit) {
  const targets = calls.filter((c) => c.crit === crit);
  let out = src;
  for (const t of targets.slice().reverse()) {
    out = out.slice(0, t.index) + "if (false) " + out.slice(t.index);
  }
  return { src: out, count: targets.length };
}

const NEG_CASES = [
  { id: "NC1", unload: "MC1", base: "MT10", mutate: CASES.find((c) => c.id === "MT10").mutate, expectBase: ["MC1", "MC2"], expect: ["MC2"] },
  { id: "NC2", unload: "MC2", base: "MT10", mutate: CASES.find((c) => c.id === "MT10").mutate, expectBase: ["MC1", "MC2"], expect: ["MC1"] },
  { id: "NC3", unload: "MC3", base: "MT11", mutate: CASES.find((c) => c.id === "MT11").mutate, expectBase: ["MC3", "MC4"], expect: ["MC4"] },
  { id: "NC4", unload: "MC4", base: "MT11", mutate: CASES.find((c) => c.id === "MT11").mutate, expectBase: ["MC3", "MC4"], expect: ["MC3"] },
];

/* ========== 执行 ========== */

let failed = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => {
  console.log(`  ✗ ${msg}`);
  failed += 1;
};

const gateSrc = fs.readFileSync(GATE, "utf8");
const calls = scanFailCalls(gateSrc);
const seenCauses = new Set();
const seenCriteria = new Set();

/** 跑一档注入并核对：判红/判绿、门禁确实跑到自己的结论、归属纯净、判据集合恰为。 */
function checkCase(label, spec, gatePath, fx) {
  const r = runGate(gatePath, fx.mdDir, fx.cfgPath, spec.repo);
  const a = attribute(r.out);
  if (a.impure) {
    bad(`${label} → 有红因无法唯一归类（匹配到 ${a.impure.owners.length} 条归属）：${a.impure.line.trim().slice(0, 90)}`);
    return;
  }
  if (spec.expect === null) {
    if (r.code !== 0 || !r.out.includes("挂载无关契约门禁通过")) {
      bad(`${label} → 期望判绿（exit 0），实测 exit ${r.code}`);
      console.log(r.out.split("\n").filter((l) => l.includes("✗")).join("\n"));
      return;
    }
    if (a.rows.length !== 0) {
      bad(`${label} → 判绿但仍有 ${a.rows.length} 条红因`);
      return;
    }
    ok(`${label} → 判绿 exit 0，零红因`);
    return;
  }
  if (r.code !== 1 || !r.out.includes("挂载无关契约门禁未通过")) {
    bad(`${label} → 期望门禁自己报红（exit 1），实测 exit ${r.code}（非 1 说明门禁崩了，不是判红）`);
    console.log(r.out.split("\n").slice(0, 4).join("\n"));
    return;
  }
  if (a.crits.join(",") !== spec.expect.join(",")) {
    bad(`${label} → 判据集合应为恰为 {${spec.expect.join(", ")}}，实测 {${a.crits.join(", ") || "空"}}`);
    console.log(a.rows.map((x) => x.line.trim().slice(0, 110)).join("\n"));
    return;
  }
  if (spec.rows !== undefined && a.rows.length !== spec.rows) {
    bad(`${label} → 红因条数应为 ${spec.rows}，实测 ${a.rows.length}`);
    return;
  }
  for (const row of a.rows) seenCauses.add(row.owners[0].id);
  for (const c of a.crits) seenCriteria.add(c);
  ok(`${label} → 判红 exit 1，判据集合恰为 {${a.crits.join(", ")}}，红因 ${a.rows.length} 条`);
}

console.log("挂载无关契约门禁 · 自测（四件套）：\n");

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

/* ---- 二、覆盖度自证（先做，因为注入档要用它校验） ---- */
console.log("\n二、覆盖度自证");
{
  const owners = calls.map((c) => CAUSES.filter((x) => c.literal.includes(x.frag)));
  const multi = owners.map((o, i) => ({ i, o })).filter((x) => x.o.length !== 1);
  if (multi.length) bad(`有 ${multi.length} 个 fail() 调用点没能唯一归属`);
  else ok(`门禁的 ${calls.length} 个 fail() 调用点逐个唯一归属（双向对齐）`);

  if (calls.length !== CAUSES.length) {
    bad(`门禁 fail() 调用点数 ${calls.length} != 归属表 ${CAUSES.length} 条`);
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
for (const spec of CASES) {
  let fx;
  try {
    fx = spec.repo ? { mdDir: ROOT, cfgPath: CONFIG_SRC } : buildCase(spec.mutate);
  } catch (e) {
    bad(`${spec.id} ${spec.label} → 注入本身坏了：${e.message}`);
    continue;
  }
  checkCase(`${spec.id} ${spec.label}`, spec, GATE, fx);
}

/* ---- 四、判据级负对照 ---- */
console.log("\n四、判据级负对照");
for (const spec of NEG_CASES) {
  const targets = calls.filter((c) => c.crit === spec.unload);
  if (targets.length === 0) {
    bad(`${spec.id} → 门禁里找不到判据 ${spec.unload} 的 fail() 调用`);
    continue;
  }
  let fx;
  try {
    fx = buildCase(spec.mutate);
  } catch (e) {
    bad(`${spec.id} → 基线注入坏了：${e.message}`);
    continue;
  }
  /* 先确认基线确实红、且目标判据在场（否则负对照可能平凡通过）。 */
  const base = runGate(GATE, fx.mdDir, fx.cfgPath, false);
  const baseAttr = attribute(base.out);
  if (baseAttr.crits.join(",") !== spec.expectBase.join(",")) {
    bad(`${spec.id} → 基线 ${spec.base} 的判据集合应为 {${spec.expectBase.join(", ")}}，实测 {${baseAttr.crits.join(", ") || "空"}}`);
    continue;
  }

  /* 在门禁副本里卸掉这条判据。 */
  const patched = unloadCriterion(gateSrc, calls, spec.unload);
  const beforeLines = gateSrc.split("\n");
  const afterLines = patched.src.split("\n");
  if (beforeLines.length !== afterLines.length) {
    bad(`${spec.id} → 卸判据改变了行数（${beforeLines.length} → ${afterLines.length}）`);
    continue;
  }
  const diff = beforeLines.filter((l, i) => l !== afterLines[i]).length;
  if (diff !== patched.count) {
    bad(`${spec.id} → 差异行数 ${diff} != 该判据的 fail() 调用数 ${patched.count}`);
    continue;
  }

  const gateDir = path.join(fx.work, "scripts");
  fs.mkdirSync(gateDir);
  const mirror = path.join(gateDir, "check-mount-contract.cjs");
  fs.writeFileSync(mirror, patched.src);

  const r = runGate(mirror, fx.mdDir, fx.cfgPath, false);
  const a = attribute(r.out);
  if (a.impure) {
    bad(`${spec.id} → 卸掉 ${spec.unload} 后有红因无法唯一归类`);
    continue;
  }
  if (r.code !== 1 || !r.out.includes("挂载无关契约门禁未通过")) {
    bad(`${spec.id} → 卸掉 ${spec.unload} 后应仍判红（其余判据在场），实测 exit ${r.code}`);
    continue;
  }
  if (a.crits.join(",") !== spec.expect.join(",")) {
    bad(`${spec.id} → 卸掉 ${spec.unload} 后判据集合应为恰为 {${spec.expect.join(", ")}}，实测 {${a.crits.join(", ") || "空"}}`);
    continue;
  }
  ok(`${spec.id} 卸掉 ${spec.unload}（${patched.count} 处 fail() 调用，差异 ${diff} 行，行数不变）→ 基线 {${spec.expectBase.join(", ")}} ⇒ 剩 {${a.crits.join(", ")}}`);
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

/* ---- 门禁与仓库真实文件未被改动 ---- */
{
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(GATE));
  for (const f of originals.slice().sort((a, b) => (a.src < b.src ? -1 : 1))) {
    h.update(f.src).update(fs.readFileSync(f.src));
  }
  h.update(fs.readFileSync(CONFIG_SRC));
  const digest = h.digest("hex");
  if (digest !== REAL_DIGEST) {
    bad(`仓库里的门禁 / 文档 / eleventy.config.js 在自测期间被改动了（sha256 ${digest} != ${REAL_DIGEST}）`);
  } else {
    ok("门禁源码、仓库全部 markdown、eleventy.config.js 的 sha256 未变（注入只在 /tmp 副本上做）");
  }
}

/* ---- 汇总 ---- */
if (failed) {
  console.error(`\n挂载无关契约自测：${failed} 项未通过。`);
  process.exit(1);
}
console.log(
  `\n挂载无关契约自测：${CASES.length} 档注入 + ${NEG_CASES.length} 档判据级负对照全部符合预期` +
    `（MC1–MC4 每条都能变红，红因归属唯一，覆盖度双向自证）。`
);
