#!/usr/bin/env node
/**
 * 自测档位静态清单守卫（元门禁）的本地夹具自测 —— 缺陷 D71 的修法（证明它真会红）。
 *
 * 这个自测证明两件事：
 *   ① **包装器真的会红**：把某一档从自测里删掉 / 加一档没登记的 ⇒ 包装器当场判红，
 *      且红因点名那一档（不是笼统地"红"）。
 *   ② **元门禁真的会红**：静态清单缺一项 / 接线绕过包装器 / 清单留孤儿 /
 *      接线与清单被一起砍到下限以下 / 登记自相矛盾 ⇒ 元门禁当场判红，
 *      且**红因归属纯净**（每档红只许出现自己那一条判据的编号）。
 *
 * 后八档（MSG9–MSG16）守的是缺陷 D73 的修法：**兜底判据**。
 *   以前「行首词形态不合格」的档守卫根本看不见（删掉照样全绿）；
 *   现在它们要么登记成锚点、要么被显式声明成「不是一档」，
 *   而**任何没有出处的行首标记行都会当场判红**（SF3），
 *   登记过的锚点也必须恰好跑够登记的次数（SF4）。
 *
 * ⚠️ 所有注入都在**临时目录的副本**上做（包装器、元门禁、静态清单、package.json
 *    全是副本），仓库真源一个字节都不改 —— 与本仓其它自测同一套做法。
 *
 * 编号用独立字母体系 MSG*（元门禁自测的档位号），与 SG*（元门禁判据）、
 * SF*（包装器判据）互不重叠。
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SCRIPTS_DIR = path.join(ROOT, "scripts");
const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "mh-selftest-guard-"));

const results = [];
function record(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${id}${detail ? " —— " + detail : ""}`);
}

/** 跑一个 node 命令，返回退出码与合并后的输出。 */
function runNode(args, cwd) {
  const r = spawnSync(process.execPath, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return { code: typeof r.status === "number" ? r.status : 1, out: (r.stdout || "") + (r.stderr || "") };
}

/* ---------- 副本树 ---------- */

const REAL_SLOTS = require(path.join(ROOT, "scripts", "lib", "selftest-slots.cjs"));
const REAL_TEST_FILES = fs
  .readdirSync(SCRIPTS_DIR, { withFileTypes: true })
  .filter((e) => e.isFile() && /^test-.*\.(cjs|sh)$/.test(e.name))
  .map((e) => e.name);

/** 写一份静态清单模块（副本用，不带真源的文件头）。 */
function writeLib(dir, slots, noise, extra) {
  const body =
    `const SLOTS = ${JSON.stringify(slots, null, 2)};\n` +
    `const NOISE = ${JSON.stringify(noise, null, 2)};\n` +
    `const EXTRA = ${JSON.stringify(extra || {}, null, 2)};\n` +
    `module.exports = { SLOTS, NOISE, EXTRA };\n`;
  fs.writeFileSync(path.join(dir, "scripts", "lib", "selftest-slots.cjs"), body);
}

/**
 * 造一棵副本树：包装器 + 元门禁 + 静态清单 + package.json（均可按需改写）
 * + 每个自测脚本的**桩文件**（元门禁会检查"清单里的文件真实存在"，桩就够）。
 */
function buildTree(mutate) {
  const dir = fs.mkdtempSync(path.join(TMP_ROOT, "case-"));
  fs.mkdirSync(path.join(dir, "scripts", "lib"), { recursive: true });
  for (const f of ["run-selftest.cjs", "check-selftest-guard.cjs"]) {
    fs.copyFileSync(path.join(SCRIPTS_DIR, f), path.join(dir, "scripts", f));
  }
  const ctx = {
    dir,
    pkg: JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")),
    slots: JSON.parse(JSON.stringify(REAL_SLOTS.SLOTS)),
    noise: JSON.parse(JSON.stringify(REAL_SLOTS.NOISE)),
    extra: JSON.parse(JSON.stringify(REAL_SLOTS.EXTRA || {})),
  };
  if (mutate) mutate(ctx);
  writeLib(dir, ctx.slots, ctx.noise, ctx.extra);
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(ctx.pkg, null, 2));
  const stubNames = new Set([...REAL_TEST_FILES, ...Object.keys(ctx.slots)]);
  for (const n of stubNames) {
    const p = path.join(dir, "scripts", n);
    if (!fs.existsSync(p)) fs.writeFileSync(p, "// 桩文件：元门禁只检查它真实存在\n");
  }
  return ctx;
}

/** 元门禁在副本树上的运行结果。 */
function runGate(ctx) {
  return runNode([path.join(ctx.dir, "scripts", "check-selftest-guard.cjs")], ctx.dir);
}

/** 输出里出现的判据编号集合（按行首编号抓，与门禁红因文案里的编号区分开）。 */
function gateCriteriaIn(text) {
  const found = new Set();
  for (const line of text.split("\n")) {
    const m = /^\s*✗\s+(SG\d+)/.exec(line);
    if (m) found.add(m[1]);
  }
  return [...found].sort();
}

/** 包装器红因里的判据编号集合（SF*）。 */
function wrapperCriteriaIn(text) {
  const found = new Set();
  for (const line of text.split("\n")) {
    const m = /^\s*✗\s+(SF\d+)/.exec(line);
    if (m) found.add(m[1]);
  }
  return [...found].sort();
}

/* ---------- MSG0：基线（真源上跑元门禁） ---------- */
{
  const r = runNode([path.join(SCRIPTS_DIR, "check-selftest-guard.cjs")], ROOT);
  record(
    "MSG0",
    r.code === 0,
    r.code === 0
      ? "真源上元门禁是绿的（接线与静态清单自洽）"
      : `真源上元门禁居然是红的（exit=${r.code}）：${r.out.trim().split("\n").slice(0, 4).join(" / ")}`
  );
}

/* ---------- 包装器的三档 + 一档失败透传 ---------- */

/** 造一个夹具自测：按给定档位号打印行首编号；exitCode 非 0 时以该码退出。 */
function makeFixture(ctx, ids, exitCode) {
  const body =
    ids.map((id) => `console.log("  ✓ ${id} 夹具的一档 —— 按预期");`).join("\n") +
    (exitCode ? `\nprocess.exit(${exitCode});\n` : "\n");
  fs.writeFileSync(path.join(ctx.dir, "scripts", "test-guard-fixture.cjs"), body);
}

/** 一个只登记两档的清单 + 一个夹具自测。 */
function fixtureTree(ids, exitCode) {
  const ctx = buildTree((c) => {
    c.slots = { "test-guard-fixture.cjs": ["F1", "F2"] };
    c.noise = {};
  });
  makeFixture(ctx, ids, exitCode);
  return ctx;
}

function runWrapper(ctx) {
  return runNode(
    [path.join(ctx.dir, "scripts", "run-selftest.cjs"), "scripts/test-guard-fixture.cjs"],
    ctx.dir
  );
}

{
  const ctx = fixtureTree(["F1"], 0);
  const r = runWrapper(ctx);
  const named = r.out.includes("F2");
  record(
    "MSG1",
    r.code === 1 && named,
    r.code === 1 && named
      ? "少跑一档 ⇒ 包装器当场红，红因点名缺的那一档 F2"
      : `少跑一档时包装器没按预期红（exit=${r.code}，红因点名 F2：${named ? "是" : "否"}）：${r.out.trim().split("\n").slice(0, 4).join(" / ")}`
  );
}

{
  const ctx = fixtureTree(["F1", "F2", "F3"], 0);
  const r = runWrapper(ctx);
  const named = r.out.includes("F3");
  record(
    "MSG2",
    r.code === 1 && named,
    r.code === 1 && named
      ? "多跑一档（清单里没有）⇒ 包装器当场红，红因点名多的那一档 F3"
      : `多跑一档时包装器没按预期红（exit=${r.code}，红因点名 F3：${named ? "是" : "否"}）：${r.out.trim().split("\n").slice(0, 4).join(" / ")}`
  );
}

{
  const ctx = fixtureTree(["F1", "F2"], 0);
  const r = runWrapper(ctx);
  record(
    "MSG3",
    r.code === 0,
    r.code === 0
      ? "档位与静态清单完全一致 ⇒ 包装器放行（绿）"
      : `档位一致时包装器不该红（exit=${r.code}）：${r.out.trim().split("\n").slice(0, 4).join(" / ")}`
  );
}

{
  const ctx = fixtureTree(["F1", "F2"], 3);
  const r = runWrapper(ctx);
  record(
    "MSG8",
    r.code === 3 && r.out.includes("自测本身未通过"),
    r.code === 3 && r.out.includes("自测本身未通过")
      ? "自测本身红 ⇒ 包装器透传失败（exit=3），没有把失败吞掉"
      : `自测本身红时包装器的退出码是 ${r.code}（应为 3），输出含「自测本身未通过」：${r.out.includes("自测本身未通过")}`
  );
}

/* ---------- 元门禁的四条判据：每条都要能单独转红 ---------- */

{
  const ctx = buildTree((c) => {
    delete c.slots["test-404-depth.cjs"]; // 静态清单缺一项
  });
  const r = runGate(ctx);
  const crit = gateCriteriaIn(r.out);
  record(
    "MSG4",
    r.code === 1 && crit.length === 1 && crit[0] === "SG1",
    r.code === 1 && crit.length === 1 && crit[0] === "SG1"
      ? "静态清单缺一项 ⇒ 元门禁红，且红因只有 SG1（归属纯净）"
      : `静态清单缺一项时元门禁的判定是 exit=${r.code} / 红因 ${crit.join(",") || "（无）"}（应为 exit=1 / 只有 SG1）`
  );
}

{
  const ctx = buildTree((c) => {
    c.pkg.scripts["check:404-depth-selftest"] = "node scripts/test-404-depth.cjs"; // 绕过包装器
  });
  const r = runGate(ctx);
  const crit = gateCriteriaIn(r.out);
  record(
    "MSG5",
    r.code === 1 && crit.length === 1 && crit[0] === "SG2",
    r.code === 1 && crit.length === 1 && crit[0] === "SG2"
      ? "某个自测绕过包装器 ⇒ 元门禁红，且红因只有 SG2（归属纯净）"
      : `绕过包装器时元门禁的判定是 exit=${r.code} / 红因 ${crit.join(",") || "（无）"}（应为 exit=1 / 只有 SG2）`
  );
}

{
  const ctx = buildTree((c) => {
    // 登记一个真实存在、但没接在 build 链上的自测 ⇒ 孤儿
    c.slots["test-gates-selfcheck.cjs"] = ["Z0"];
  });
  const r = runGate(ctx);
  const crit = gateCriteriaIn(r.out);
  record(
    "MSG6",
    r.code === 1 && crit.length === 1 && crit[0] === "SG3",
    r.code === 1 && crit.length === 1 && crit[0] === "SG3"
      ? "静态清单里有孤儿（文件在、没人跑）⇒ 元门禁红，且红因只有 SG3（归属纯净）"
      : `清单有孤儿时元门禁的判定是 exit=${r.code} / 红因 ${crit.join(",") || "（无）"}（应为 exit=1 / 只有 SG3）`
  );
}

{
  const ctx = buildTree((c) => {
    // 接线与清单被一起砍到下限以下 ⇒ SG1 / SG3 一起绿，只有空跑保护会红
    const three = ["test-404-depth.cjs", "test-tag-leak.cjs", "test-citation-meta.cjs"];
    const pkg = c.pkg;
    const trimmed = {};
    three.forEach((f, i) => {
      trimmed[`check:sg-${i}`] = `node scripts/run-selftest.cjs scripts/${f}`;
    });
    trimmed.build = "npm run check:sg-0 && npm run check:sg-1 && npm run check:sg-2";
    pkg.scripts = trimmed;
    const only = {};
    for (const f of three) only[f] = c.slots[f];
    c.slots = only;
    // EXTRA 必须**跟着清单一起裁** —— 否则会留下指向已不在清单里的孤儿登记，
    // 那一档会连坐 SG5，红因就不再是"只有 SG4"这条干净对照了。
    const onlyExtra = {};
    for (const f of three) if (c.extra[f]) onlyExtra[f] = c.extra[f];
    c.extra = onlyExtra;
  });
  const r = runGate(ctx);
  const crit = gateCriteriaIn(r.out);
  record(
    "MSG7",
    r.code === 1 && crit.length === 1 && crit[0] === "SG4",
    r.code === 1 && crit.length === 1 && crit[0] === "SG4"
      ? "接线与清单被一起砍到下限以下 ⇒ 元门禁红，且红因只有 SG4（空跑保护）"
      : `接线与清单一起被砍时元门禁的判定是 exit=${r.code} / 红因 ${crit.join(",") || "（无）"}（应为 exit=1 / 只有 SG4）`
  );
}

/* ---------- 兜底判据（缺陷 D73 的修法）：MSG9–MSG12 ---------- */

/**
 * 造一棵只含一个夹具自测的副本树：清单登记该夹具的编号，
 * 夹具自测按给定的**原始行**打印（这样才能造出「首词形态不合格」的行）。
 */
function rawTree(lines, opts) {
  const o = opts || {};
  const ctx = buildTree((c) => {
    c.slots = { "test-guard-fixture.cjs": o.ids || ["F1"] };
    c.noise = {};
    c.extra = o.extra || { "test-guard-fixture.cjs": { anchors: [], notSlots: [] } };
  });
  const body =
    lines.map((l) => `console.log(${JSON.stringify(l)});`).join("\n") +
    (o.exitCode ? `\nprocess.exit(${o.exitCode});\n` : "\n");
  fs.writeFileSync(path.join(ctx.dir, "scripts", "test-guard-fixture.cjs"), body);
  return ctx;
}

{
  // 一行的首词是 ASCII、但形态不合格（纯字母无数字）且没有登记 ⇒ 守卫以前根本看不见它
  const ctx = rawTree(
    ["  ✓ F1 夹具的一档 —— 按预期", "  ✓ WEIRD 形态不合格的一行 —— 按预期"],
    { ids: ["F1"] }
  );
  const r = runWrapper(ctx);
  const crit = wrapperCriteriaIn(r.out);
  record(
    "MSG9",
    r.code === 1 && crit.length === 1 && crit[0] === "SF3" && r.out.includes("WEIRD"),
    r.code === 1 && crit.length === 1 && crit[0] === "SF3" && r.out.includes("WEIRD")
      ? "有一行首词形态不合格又没登记 ⇒ 包装器当场红，红因只有 SF3，且点名那一行"
      : `未登记的档位行没被兜底判据抓住（exit=${r.code} / 红因 ${crit.join(",") || "（无）"} / 点名 WEIRD：${r.out.includes("WEIRD") ? "是" : "否"}）`
  );
}

{
  // 登记了锚点但自测没跑那一档 ⇒ 锚点登记没兑现
  const ctx = rawTree(["  ✓ F1 夹具的一档 —— 按预期"], {
    ids: ["F1"],
    extra: { "test-guard-fixture.cjs": { anchors: [{ word: "COV", count: 1 }], notSlots: [] } },
  });
  const r = runWrapper(ctx);
  const crit = wrapperCriteriaIn(r.out);
  record(
    "MSG10",
    r.code === 1 && crit.length === 1 && crit[0] === "SF4" && r.out.includes("COV"),
    r.code === 1 && crit.length === 1 && crit[0] === "SF4" && r.out.includes("COV")
      ? "锚点登记了却没跑 ⇒ 包装器当场红，红因只有 SF4，且点名那个锚点"
      : `锚点没兑现时包装器的判定是 exit=${r.code} / 红因 ${crit.join(",") || "（无）"} / 点名 COV：${r.out.includes("COV") ? "是" : "否"}`
  );
}

{
  // 锚点恰好兑现 ⇒ 绿（正对照：证明上面的红不是因为锚点机制本身有问题）
  const ctx = rawTree(
    ["  ✓ F1 夹具的一档 —— 按预期", "  ✓ COV 覆盖度自证：夹具的一档 —— 按预期"],
    {
      ids: ["F1"],
      extra: { "test-guard-fixture.cjs": { anchors: [{ word: "COV", count: 1 }], notSlots: [] } },
    }
  );
  const r = runWrapper(ctx);
  record(
    "MSG11",
    r.code === 0,
    r.code === 0
      ? "锚点恰好兑现 ⇒ 包装器放行（绿）"
      : `锚点兑现时包装器不该红（exit=${r.code}）：${r.out.trim().split("\n").slice(0, 4).join(" / ")}`
  );
}

{
  // 显式声明「不是一档」的行不该被误判成隐形档
  const ctx = rawTree(
    ["  ✓ F1 夹具的一档 —— 按预期", "  ✓ token 真源没被自测改动 —— 按预期"],
    {
      ids: ["F1"],
      extra: { "test-guard-fixture.cjs": { anchors: [], notSlots: ["token"] } },
    }
  );
  const r = runWrapper(ctx);
  record(
    "MSG12",
    r.code === 0,
    r.code === 0
      ? "显式声明成「不是一档」的行不误报 ⇒ 包装器放行（绿）"
      : `显式声明的非档位行被误报了（exit=${r.code}）：${r.out.trim().split("\n").slice(0, 4).join(" / ")}`
  );
}

/* ---------- 元门禁 SG5：登记自洽 —— MSG13–MSG15 ---------- */

{
  // 锚点词与静态清单的编号重合 ⇒ 同一个词既是编号又是锚点，判定说不清
  const ctx = buildTree((c) => {
    c.extra["test-404-depth.cjs"] = { anchors: [{ word: "N0", count: 1 }], notSlots: [] };
  });
  const r = runGate(ctx);
  const crit = gateCriteriaIn(r.out);
  record(
    "MSG13",
    r.code === 1 && crit.length === 1 && crit[0] === "SG5",
    r.code === 1 && crit.length === 1 && crit[0] === "SG5"
      ? "锚点词与清单编号重合 ⇒ 元门禁红，且红因只有 SG5（归属纯净）"
      : `锚点与编号重合时元门禁的判定是 exit=${r.code} / 红因 ${crit.join(",") || "（无）"}（应为 exit=1 / 只有 SG5）`
  );
}

{
  // EXTRA 登记了一个不在静态清单里的文件 ⇒ 孤儿登记（它守的东西不在守卫视野里）
  const ctx = buildTree((c) => {
    c.extra["test-not-in-manifest.cjs"] = { anchors: [{ word: "ZZZ", count: 1 }], notSlots: [] };
  });
  const r = runGate(ctx);
  const crit = gateCriteriaIn(r.out);
  record(
    "MSG14",
    r.code === 1 && crit.length === 1 && crit[0] === "SG5",
    r.code === 1 && crit.length === 1 && crit[0] === "SG5"
      ? "EXTRA 登记了清单里没有的文件 ⇒ 元门禁红，且红因只有 SG5（归属纯净）"
      : `EXTRA 有孤儿登记时元门禁的判定是 exit=${r.code} / 红因 ${crit.join(",") || "（无）"}（应为 exit=1 / 只有 SG5）`
  );
}

{
  // 锚点的 count 不是 ≥1 的整数 ⇒ 锚点没有意义
  const ctx = buildTree((c) => {
    c.extra["test-404-depth.cjs"] = { anchors: [{ word: "ZZZ", count: 0 }], notSlots: [] };
  });
  const r = runGate(ctx);
  const crit = gateCriteriaIn(r.out);
  record(
    "MSG15",
    r.code === 1 && crit.length === 1 && crit[0] === "SG5",
    r.code === 1 && crit.length === 1 && crit[0] === "SG5"
      ? "锚点的 count 不是正整数 ⇒ 元门禁红，且红因只有 SG5（归属纯净）"
      : `锚点 count 非法时元门禁的判定是 exit=${r.code} / 红因 ${crit.join(",") || "（无）"}（应为 exit=1 / 只有 SG5）`
  );
}

{
  // 两条红因同时出现时归属必须纯净：少跑一档（SF1）+ 一行没登记（SF3），不含 SF2
  const ctx = rawTree(
    ["  ✓ F1 夹具的一档 —— 按预期", "  ✓ WEIRD 形态不合格的一行 —— 按预期"],
    { ids: ["F1", "F2"] }
  );
  const r = runWrapper(ctx);
  const crit = wrapperCriteriaIn(r.out);
  record(
    "MSG16",
    r.code === 1 && crit.length === 2 && crit[0] === "SF1" && crit[1] === "SF3",
    r.code === 1 && crit.length === 2 && crit[0] === "SF1" && crit[1] === "SF3"
      ? "少跑一档 + 一行没登记 ⇒ 红因恰为 SF1 与 SF3 两条（归属纯净，不含 SF2）"
      : `两条红因同时出现时归属不纯：exit=${r.code} / 红因 ${crit.join(",") || "（无）"}（应为 exit=1 / SF1+SF3）`
  );
}

/* ---------- 收尾 ---------- */
const bad = results.filter((r) => !r.ok);
console.log(
  `\n自测矩阵：${results.length} 档里 ${results.length - bad.length} 档按预期触发` +
    (bad.length ? `\n失败 ${bad.length} 档：${bad.map((b) => b.id).join(" / ")}` : "")
);
try {
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
} catch (e) {
  /* 临时目录清不掉不算判据失败，但要说出来 */
  console.error(`（临时目录没清掉：${TMP_ROOT} —— ${e.message}）`);
}
process.exit(bad.length ? 1 : 0);
