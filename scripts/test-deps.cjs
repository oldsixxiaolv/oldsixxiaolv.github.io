#!/usr/bin/env node
/**
 * 依赖体检门禁的**自测** —— 四件套。
 *
 * 这道门禁判的是「依赖声明 / 锁文件 / 下限表 / **CI 用的 Node 版本**」四者的一致性，
 * 而「注入没生效」「改的是副本还是原件」「门禁自己被卸掉了」恰恰是最容易发生、
 * 也最不容易看出来的失败模式。所以自测必须回答四件事：
 *
 *   一、红因归属表 —— 门禁的 fail() 调用逐条登记判据号与**唯一文案片段**。
 *   二、归属纯净 —— 运行时的每一条红因必须**恰好**被一条归属认领；
 *      判据集合必须**恰为**期望值（多一条、少一条都算失败）。
 *   三、覆盖度自证 —— 门禁的 fail() 调用点与归属表**双向**对齐；
 *      门禁解析出的判据集合与静态清单一致；每条红因、每条判据都至少一档判红。
 *   四、判据级负对照 —— 在门禁**副本**里把某条判据卸掉
 *      （给它那一条 fail() 调用同行加 `if (false) ` 前缀，**行数不变**），
 *      对应夹具必须转绿 ⇒ 证明那条红确实是它判出来的，而不是别的判据顺带报出来的。
 *
 * 注入全程只在 /tmp 副本上做；仓库里的文件一个字节都不动（末尾有 sha256 自证）。
 *
 * 用法：node scripts/test-deps.cjs
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-deps.cjs");
/* 下限表从门禁源码里读（门禁作为模块被 require 时导出）⇒ 下限表改了，夹具自动跟着改。 */
const { DEP_FLOORS } = require(GATE);

/* ========== 一、红因归属表：判据 → 唯一文案片段 ========== */

const CAUSES = [
  { id: "DEP1", crit: "DEP1", frag: "依赖声明的下限低于下限表" },
  { id: "DEP2", crit: "DEP2", frag: "实际锁定的版本低于下限表" },
  { id: "DEP3", crit: "DEP3", frag: "没有 integrity 哈希" },
  { id: "DEP4", crit: "DEP4", frag: "锁文件与 package.json 的声明不一致" },
  { id: "DEP5", crit: "DEP5", frag: "CI 用的 Node 版本与声明/依赖树的要求对不上" },
  { id: "DEP6", crit: "DEP6", frag: "CI 用的 Node 版本低于底线表" },
];
/** 静态判据清单（门禁里应当且仅应当有这些判据）。 */
const CRITERIA = ["DEP1", "DEP2", "DEP3", "DEP4", "DEP5", "DEP6"];

/* ========== 工具 ========== */

/** 扫出源码里所有 fail() 调用点（单行/多行、模板字面量/引号都吃）。 */
const FAIL_RE = /(?<![.\w$])fail\s*\(\s*(?:`([^`]*)`|"([^"]*)"|'([^']*)')/g;
function scanFailCalls(src) {
  const out = [];
  for (const m of src.matchAll(FAIL_RE)) {
    const literal = m[1] ?? m[2] ?? m[3] ?? "";
    out.push({
      index: m.index,
      literal,
      crit: (literal.match(/^\s*(DEP\d+)\b/) || [])[1] || "",
    });
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

/** 下限表里那个包的「低一档」版本（用来造「低于下限」的注入）。 */
function belowVersion(v) {
  const parts = String(v).split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i] > 0) {
      parts[i] -= 1;
      for (let j = i + 1; j < parts.length; j++) parts[j] = 9;
      return parts.join(".");
    }
  }
  return "0.0.0";
}
/** 高一档的次版本（用来造「声明与锁文件对不上」的注入，且不触发下限判据）。 */
function aboveVersion(v) {
  const parts = String(v).split(".").map((x) => parseInt(x, 10) || 0);
  parts[parts.length - 1] += 1;
  return parts.join(".");
}

const FLOOR_NAME = Object.keys(DEP_FLOORS)[0];
const FLOOR_MIN = DEP_FLOORS[FLOOR_NAME].min;
const LOW = belowVersion(FLOOR_MIN);
const HIGH = aboveVersion(FLOOR_MIN);

/**
 * 夹具的部署工作流（最小形态，但形状与真仓一致：两个 job、两个 setup-node 步骤）。
 * CI 用的 Node 版本从**这里**读 ⇒ DEP5 / DEP6 的夹具改的就是这份文件。
 */
const FIXTURE_WORKFLOW = `name: Deploy MeteoHub to GitHub Pages

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Setup Node
        uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7
        with:
          node-version: 22
          cache: npm

  verify-live:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Setup Node
        uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7
        with:
          node-version: 22
`;

/** 夹具的 package.json / package-lock.json / 部署工作流（合成，但形状与真仓一致）。 */
function fixtureState() {
  return {
    pkg: {
      name: "fixture",
      version: "1.0.0",
      private: true,
      engines: { node: ">=22" },
      devDependencies: { [FLOOR_NAME]: `^${FLOOR_MIN}` },
    },
    lock: {
      name: "fixture",
      version: "1.0.0",
      lockfileVersion: 3,
      requires: true,
      packages: {
        "": {
          name: "fixture",
          version: "1.0.0",
          engines: { node: ">=22" },
          devDependencies: { [FLOOR_NAME]: `^${FLOOR_MIN}` },
        },
        [`node_modules/${FLOOR_NAME}`]: {
          version: FLOOR_MIN,
          resolved: `https://registry.npmjs.org/${FLOOR_NAME}/-/${FLOOR_NAME}-${FLOOR_MIN}.tgz`,
          integrity: "sha512-AAAA",
          dev: true,
        },
        "node_modules/other-dep": {
          version: "1.0.0",
          resolved: "https://registry.npmjs.org/other-dep/-/other-dep-1.0.0.tgz",
          integrity: "sha512-BBBB",
          engines: { node: ">=18" },
          dev: true,
        },
      },
    },
    workflow: FIXTURE_WORKFLOW,
  };
}

/* ========== 副本构造 ========== */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mh-deps-selftest-"));

/** 建一个夹具目录（门禁要读的三个文件），在副本上注入。 */
function buildFixture(mutate) {
  const state = fixtureState();
  if (mutate) mutate(state);
  const dir = fs.mkdtempSync(path.join(tmp, "case-"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(state.pkg, null, 2));
  fs.writeFileSync(path.join(dir, "package-lock.json"), JSON.stringify(state.lock, null, 2));
  const wfDir = path.join(dir, ".github", "workflows");
  fs.mkdirSync(wfDir, { recursive: true });
  fs.writeFileSync(path.join(wfDir, "deploy.yml"), state.workflow);
  return dir;
}

/** 跑一次门禁（夹具通过 DEPS_ROOT 注入）。 */
function runGate(gatePath, fixtureDir) {
  const env = { ...process.env, DEPS_ROOT: fixtureDir };
  const r = spawnSync(process.execPath, [gatePath], { env, encoding: "utf8", cwd: ROOT });
  return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
}

/* ========== 注入档 ========== */

const MUT = {
  /** 声明下限被放松回旧版（package.json 与锁文件根条目一起改，保持 DEP4 干净）⇒ DEP1。 */
  relaxFloor: (s) => {
    s.pkg.devDependencies[FLOOR_NAME] = `^${LOW}`;
    s.lock.packages[""].devDependencies[FLOOR_NAME] = `^${LOW}`;
  },
  /** 锁文件实际锁定的版本低于下限（声明不动）⇒ DEP2。 */
  staleLockedVersion: (s) => {
    const e = s.lock.packages[`node_modules/${FLOOR_NAME}`];
    e.version = LOW;
    e.resolved = `https://registry.npmjs.org/${FLOOR_NAME}/-/${FLOOR_NAME}-${LOW}.tgz`;
    e.integrity = "sha512-CCCC";
  },
  /** 某个包条目没有 integrity 哈希 ⇒ DEP3。 */
  dropIntegrity: (s) => {
    delete s.lock.packages["node_modules/other-dep"].integrity;
  },
  /** package.json 与锁文件根条目的声明对不上 ⇒ DEP4。 */
  desyncLock: (s) => {
    s.pkg.devDependencies[FLOOR_NAME] = `^${HIGH}`;
  },
  /** CI 的 Node 降到 20（声明与依赖树只要求 18）⇒ 只有 DEP6 应当红。 */
  ciBelowFloor: (s) => {
    s.pkg.engines.node = ">=18";
    s.lock.packages[""].engines.node = ">=18";
    setCiNode(s, 20);
  },
  /** 依赖树里某个包要求 Node ≥ 24，CI 仍是 22 ⇒ 只有 DEP5 应当红。 */
  depTreeNeedsNewer: (s) => {
    s.lock.packages["node_modules/other-dep"].engines.node = ">=24";
  },
  /** package.json 自己要求 Node ≥ 24，CI 仍是 22 ⇒ 只有 DEP5 应当红。 */
  pkgEnginesNeedNewer: (s) => {
    s.pkg.engines.node = ">=24";
    s.lock.packages[""].engines.node = ">=24";
  },
  /** 两个 setup-node 步骤用了不同的 Node 版本 ⇒ 只有 DEP5 应当红。 */
  stepsDisagree: (s) => {
    const idx = s.workflow.lastIndexOf("node-version: 22");
    s.workflow =
      s.workflow.slice(0, idx) +
      "node-version: 24" +
      s.workflow.slice(idx + "node-version: 22".length);
  },
  /** 某个 setup-node 步骤没写 node-version ⇒ 只有 DEP5 应当红。 */
  missingNodeVersion: (s) => {
    s.workflow = s.workflow.replace(/^[ \t]*node-version:[^\n]*\n/m, "");
  },
};

/** 把工作流里**所有** `node-version: N` 改成 N。 */
function setCiNode(s, v) {
  s.workflow = s.workflow.replace(/node-version:[ \t]*\S+/g, `node-version: ${v}`);
}

/** 注入档：expect=null 表示期望判绿，否则期望判红且判据集合**恰为** expect。 */
const CASES = [
  { id: "DA0", label: "基线（合成 package.json + lockfile）", mutate: null, expect: null },
  { id: "DA1", label: "声明下限被放松回旧版", mutate: MUT.relaxFloor, expect: ["DEP1"] },
  { id: "DA2", label: "锁文件锁定的版本低于下限", mutate: MUT.staleLockedVersion, expect: ["DEP2"] },
  { id: "DA3", label: "某个包条目没有 integrity", mutate: MUT.dropIntegrity, expect: ["DEP3"] },
  { id: "DA4", label: "package.json 与锁文件声明对不上", mutate: MUT.desyncLock, expect: ["DEP4"] },
  { id: "DA9", label: "CI 的 Node 降到 20（低于底线表）", mutate: MUT.ciBelowFloor, expect: ["DEP6"] },
  {
    id: "DA10",
    label: "依赖树要求 Node ≥ 24，CI 仍是 22",
    mutate: MUT.depTreeNeedsNewer,
    expect: ["DEP5"],
  },
  {
    id: "DA11",
    label: "package.json 要求 Node ≥ 24，CI 仍是 22",
    mutate: MUT.pkgEnginesNeedNewer,
    expect: ["DEP5"],
  },
  {
    id: "DA12",
    label: "两个 setup-node 步骤的 Node 版本不一致",
    mutate: MUT.stepsDisagree,
    expect: ["DEP5"],
  },
  {
    id: "DA13",
    label: "某个 setup-node 步骤没写 node-version",
    mutate: MUT.missingNodeVersion,
    expect: ["DEP5"],
  },
];

/* ========== 四、判据级负对照 ========== */

const NEG_CASES = [
  { id: "DA5", crit: "DEP1", case: "DA1", label: "卸掉 DEP1" },
  { id: "DA6", crit: "DEP2", case: "DA2", label: "卸掉 DEP2" },
  { id: "DA7", crit: "DEP3", case: "DA3", label: "卸掉 DEP3" },
  { id: "DA8", crit: "DEP4", case: "DA4", label: "卸掉 DEP4" },
  { id: "DA14", crit: "DEP5", case: "DA10", label: "卸掉 DEP5" },
  { id: "DA15", crit: "DEP6", case: "DA9", label: "卸掉 DEP6" },
];

/** 在门禁副本里卸掉某条判据：给它每一条 fail() 调用**同行**加 `if (false) ` 前缀。 */
function unloadCriterion(src, calls, crit) {
  const targets = calls.filter((c) => c.crit === crit);
  let out = src;
  for (const t of targets.slice().reverse()) {
    out = out.slice(0, t.index) + "if (false) " + out.slice(t.index);
  }
  return { src: out, count: targets.length };
}

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

/** 仓库真源（门禁 + package.json + lockfile）的整体指纹：自测前后必须一致。 */
function repoDigest() {
  const h = crypto.createHash("sha256");
  for (const p of [
    GATE,
    path.join(ROOT, "package.json"),
    path.join(ROOT, "package-lock.json"),
    path.join(ROOT, ".github/workflows/deploy.yml"),
  ]) {
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
    if (r.code !== 0 || !r.out.includes("依赖体检门禁通过")) {
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
  if (r.code !== 1 || !r.out.includes("依赖体检门禁未通过")) {
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

console.log("依赖体检门禁 · 自测（四件套）：\n");

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
    bad(`有 ${multi.length} 个 fail() 调用点没能唯一归属：${multi.map((m) => m.i).join(", ")}`);
  } else {
    ok(`门禁的 ${calls.length} 个 fail() 调用点逐个唯一归属（双向对齐）`);
  }

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
    const targets = calls.filter((c) => c.crit === nc.crit);
    if (targets.length === 0) {
      bad(`${nc.id} → 门禁里找不到判据 ${nc.crit} 的 fail() 调用`);
      continue;
    }
    const patched = unloadCriterion(gateSrc, calls, nc.crit);
    const beforeLines = gateSrc.split("\n");
    const afterLines = patched.src.split("\n");
    if (beforeLines.length !== afterLines.length) {
      bad(`${nc.id} → 卸判据改变了行数（${beforeLines.length} → ${afterLines.length}）`);
      continue;
    }
    const diff = beforeLines.filter((l, i) => l !== afterLines[i]).length;
    if (diff !== patched.count) {
      bad(`${nc.id} → 差异行数 ${diff} != 该判据的 fail() 调用数 ${patched.count}`);
      continue;
    }
    const gateDir = fs.mkdtempSync(path.join(tmp, "gate-"));
    const mirror = path.join(gateDir, "check-deps.cjs");
    fs.writeFileSync(mirror, patched.src);
    const base = runGate(GATE, fixtures[nc.case]);
    const baseAttr = attribute(base.out);
    if (baseAttr.crits.join(",") !== nc.crit) {
      bad(`${nc.id} → 基线 ${nc.case} 的判据集合应为恰为 {${nc.crit}}，实测 {${baseAttr.crits.join(", ") || "空"}}`);
      continue;
    }
    const r = runGate(mirror, fixtures[nc.case]);
    const a = attribute(r.out);
    if (r.code !== 0 || !r.out.includes("依赖体检门禁通过")) {
      bad(`${nc.id} → 卸掉 ${nc.crit} 后 ${nc.case} 夹具必须转绿（exit 0），实测 exit ${r.code}`);
      console.log(r.out.split("\n").filter((l) => l.includes("✗")).join("\n"));
    } else if (a.rows.length !== 0) {
      bad(`${nc.id} → 卸掉 ${nc.crit} 后 ${nc.case} 夹具判绿但仍有 ${a.rows.length} 条红因`);
    } else {
      ok(
        `${nc.id} 卸掉 ${nc.crit}（${patched.count} 处 fail() 调用，差异 ${diff} 行，行数不变）→ ` +
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
    bad("自测期间仓库真源被改动了 —— 注入必须只在 /tmp 副本上做");
  } else {
    ok(`仓库真源指纹前后一致（${REAL_DIGEST.slice(0, 16)}…）—— 注入全程只在临时副本上做`);
  }
}

console.log("");
if (failed) {
  console.log(`依赖体检门禁自测失败：${failed} 项断言未通过。`);
  process.exit(1);
}
console.log("依赖体检门禁自测全部通过。");
