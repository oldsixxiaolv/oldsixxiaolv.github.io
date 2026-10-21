#!/usr/bin/env node
/**
 * 自测 JB0–JB14：给 scripts/check-js-targets.cjs 的每条判据找一次「它会红」的证据
 *
 * 为什么要有这个自测（2026-10-21 的 D51）：
 *   这道门禁守的是「站内脚本查询的目标，在产物里真实存在（或由脚本自己创建）」。
 *   而「门禁是绿的」有两种可能：① 它真的没问题；② 它的判据从来没被真正执行过。
 *   这两件事长得一模一样。所以每条判据都要有一档**注入**证明它会红，
 *   再有一档**负对照**证明「卸掉那一步之后确实就绿了」——
 *   否则红可能来自别处。
 *
 * 做法（全在临时目录的副本上，仓库里的原件一个字节都不动）：
 *   造一个**最小夹具站**（不依赖真 _site —— 真产物每次 build 都在变，
 *   拿它当基准会让自测跟着 build 抖）：
 *     <tmp>/scripts/check-js-targets.cjs  门禁副本（负对照要改它的 JAn_ON 开关）
 *     <tmp>/package.json                    build 链里必须有本门禁（JA3 看这个）
 *     <tmp>/src/assets/js/fixture-main.js     查产物里**真实存在**的目标
 *     <tmp>/src/assets/js/fixture-const.js    选择器写在 const 绑定里（门禁要能解出来）
 *     <tmp>/src/assets/js/fixture-runtime.js  目标由脚本**运行时创建**（不算死目标）
 *     <tmp>/_site/index.html                  产物页面
 *   门禁的 REPO 根是「它自己所在目录的上一级」，所以副本里的它**天然**
 *   指向副本里的站，不需要任何环境变量。
 *
 *   ⚠️ 夹具里的 data-* 属性一律用**无值写法**（`data-fixture-flag` 而不是
 *     `data-fixture-flag="1"）—— 本门禁第一版就是栽在「只认 name= 的属性名提取器」
 *     上：无值写法（本站大量使用）全被漏收，于是门禁**反向误报**
 *     「产物里明明有、门禁却说找不到」。基线档（JB0）必须能守住这个坑。
 *   ⚠️ 夹具里**不出现任何真实站点的类名 / 属性名 / id**（否则门禁/自测源码自己
 *     就成了「目标存在」的证据，自证会假绿）—— 全部用 fixture-* 命名。
 *
 * 档位（6 档注入 + 4 档判据级负对照 + 2 档绿档 + 1 档覆盖度自证）：
 *   JB0  基线绿
 *   JB1  查一个产物里没有的**类名**                             ⇒ JA1
 *   JB2  查一个产物里没有的**属性名**                           ⇒ JA1
 *   JB3  查一个产物里没有的 **id**                              ⇒ JA1
 *   JB4  const 绑定的选择器指向缺失属性                        ⇒ JA1
 *   JB5  目标由脚本**运行时创建** ⇒ 放行（绿）
 *   JB6  选择器列表：任一分支可达就放行（绿）
 *   JB7  门禁自己被卸掉（build 链里不叫它了）                   ⇒ JA3
 *   JB8  提取器全瞎（所有脚本都不查 DOM）                       ⇒ JA2（覆盖度自证）
 *   JB9  只用**动态选择器**的模块（门禁看不见它）               ⇒ JA4
 *   JB10 负对照：卸掉 JA1 ⇒ JB1–JB4 的注入必须**全部转绿**
 *   JB11 负对照：卸掉 JA2 ⇒ JB8 的注入必须转绿
 *   JB12 负对照：卸掉 JA3 ⇒ JB7 的注入必须转绿
 *   JB13 负对照：卸掉 JA4 ⇒ JB9 的注入必须转绿
 *   JB14 覆盖度自证档：基线上门禁**确实认出**了 ≥1 个目标 token
 *
 * ⚠️ 每档都断言「红因编号集合**完全相等**」，不只是「包含期望的那条」——
 *   一档里出现两条判据的红，红因归属就不可判定了（那是脚本的缺陷，不是产品的缺陷）。
 *   JB10–JB13 这四档负对照正是「归属纯净」的守门人：
 *   卸掉 JA1 之后 JB1 若还红，说明是别的判据越界管了死目标 ⇒ 立刻暴露。
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const GATE = path.join(ROOT, "scripts", "check-js-targets.cjs");

function sha256(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

/* 原件指纹：**自测开始时**记下来，收尾时比对 ——
   证明这一整轮注入全在副本上，仓库里的原件一个字节都没动。 */
const GATE_SHA_AT_START = sha256(GATE);

/* ================= 夹具站 ================= */

function write(p, text) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
}

/** 产物页面：夹具里所有 data-* 都用**无值写法**（守住布尔属性那个坑）。 */
const PRODUCT_HTML = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>fixture</title></head>
  <body>
    <div class="fixture-panel" data-fixture-flag>
      <span data-fixture-child>fixture</span>
      <span id="fixture-node">fixture</span>
      <span data-fixture-const>fixture</span>
    </div>
    <div class="fixture-runtime-host"></div>
  </body>
</html>
`;

/** 查的目标在产物里**真实存在**。 */
const MAIN_JS = `/* fixture: 站内脚本查询的目标在产物里真实存在 */
(function () {
  "use strict";
  const panel = document.querySelector(".fixture-panel");
  const flag = document.querySelector("[data-fixture-flag]");
  const node = document.getElementById("fixture-node");
  if (panel && flag && node) {
    panel.classList.add("fixture-panel-active");
  }
})();
`;

/** 选择器写在 const 绑定里 —— 门禁必须能解出来（否则这个目标就没人检查了）。 */
const CONST_JS = `/* fixture: 选择器写在 const 绑定里 */
const FIXTURE_CONST_SELECTOR = "[data-fixture-const]";

(function () {
  "use strict";
  const host = document.querySelector(FIXTURE_CONST_SELECTOR);
  if (host) host.classList.add("fixture-const-hit");
})();
`;

/** 目标元素由脚本**自己运行时创建** ⇒ 不算死目标。 */
const RUNTIME_JS = `/* fixture: 目标元素由脚本自己运行时创建 */
(function () {
  "use strict";
  const host = document.querySelector(".fixture-runtime-host");
  if (!host) return;
  const node = document.createElement("div");
  node.className = "fixture-runtime-node";
  host.appendChild(node);
  const created = document.querySelector(".fixture-runtime-node");
  if (created) created.setAttribute("data-fixture-runtime", "1");
})();
`;

/** 只用**动态选择器**的模块：门禁看不见它的目标 ⇒ JA4 必须红。 */
const DYNAMIC_JS = `/* fixture: 只用动态选择器 —— 门禁看不见它的目标 */
(function () {
  "use strict";
  const sel = buildSelector();
  const el = document.querySelector(sel);
  if (el) el.classList.add("fixture-dynamic-hit");
})();
`;

function makeSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mh-js-targets-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });

  fs.copyFileSync(GATE, path.join(dir, "scripts", "check-js-targets.cjs"));

  write(
    path.join(dir, "package.json"),
    JSON.stringify(
      { name: "js-targets-fixture", scripts: { build: "node scripts/check-js-targets.cjs" } },
      null,
      2
    ) + "\n"
  );

  write(path.join(dir, "src", "assets", "js", "fixture-main.js"), MAIN_JS);
  write(path.join(dir, "src", "assets", "js", "fixture-const.js"), CONST_JS);
  write(path.join(dir, "src", "assets", "js", "fixture-runtime.js"), RUNTIME_JS);
  write(path.join(dir, "_site", "index.html"), PRODUCT_HTML);

  return dir;
}

/* ================= 跑门禁 / 解析红因 ================= */

/** 跑副本里的门禁，返回 { code, out }。 */
function runGate(dir) {
  try {
    const out = execFileSync(
      process.execPath,
      [path.join(dir, "scripts", "check-js-targets.cjs")],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    return { code: 0, out };
  } catch (e) {
    return {
      code: typeof e.status === "number" ? e.status : 1,
      out: `${e.stdout || ""}${e.stderr || ""}`,
    };
  }
}

/** 红因编号集合（只认行首的「· JAn：」，消息正文里出现的字样不算）。 */
function redIds(out) {
  const ids = new Set();
  const re = /^[ \t]*·[ \t]*(JA\d+)[ \t]*：/gm;
  let m;
  while ((m = re.exec(out)) !== null) ids.add(m[1]);
  return ids;
}

function sameSet(got, want) {
  if (got.size !== want.length) return false;
  return want.every((x) => got.has(x));
}

function fmtIds(ids) {
  return [...ids].sort().join("+") || "（无）";
}

/** 改副本里的一个文件；注入点找不到就当场抛错（不静默跳过）。 */
function patch(file, from, to) {
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes(from)) {
    throw new Error(
      `注入点不存在，已中止（不静默跳过）：\n  文件：${file}\n  锚点：${from}`
    );
  }
  fs.writeFileSync(file, text.replace(from, to));
}

/* 夹具里的常用路径 */
const jsOf = (dir, rel) => path.join(dir, "src", "assets", "js", rel);
const gateOf = (dir) => path.join(dir, "scripts", "check-js-targets.cjs");

const results = [];
function record(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${id}${detail ? " —— " + detail : ""}`);
}

/**
 * 一档「注入 ⇒ 应当恰好红这么几条判据」。
 * 期望集合必须**完全相等**：多一条、少一条都算这档失败。
 */
function expectRed(id, dir, want, note) {
  const r = runGate(dir);
  const got = redIds(r.out);
  const ok = r.code === 1 && sameSet(got, want);
  record(
    id,
    ok,
    ok
      ? `红了，红因编号 = ${fmtIds(got)}（归属纯净）${note ? "；" + note : ""}`
      : `期望红因 ${fmtIds(new Set(want))} 且只有这些，实际 code=${r.code} 红因 ${fmtIds(got)}\n${r.out}`
  );
}

/** 一档「应当完全绿，一个红因都不许剩」。 */
function expectGreen(id, dir, note) {
  const r = runGate(dir);
  const got = redIds(r.out);
  const ok = r.code === 0 && got.size === 0;
  record(
    id,
    ok,
    ok
      ? `绿了，红因一个不剩${note ? "；" + note : ""}`
      : `不该红，却 exit ${r.code}，红因 ${fmtIds(got)}\n${r.out}`
  );
}

/* ================= JB0：基线（绿） ================= */

{
  const dir = makeSandbox();
  expectGreen("JB0 基线（夹具站上）", dir, "查得到的目标不误伤、无值属性写法也认得出");
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= 注入档 JB1–JB4：JA1（死目标） ================= */

/* JB1：查一个产物里没有的**类名** */
{
  const dir = makeSandbox();
  write(
    jsOf(dir, "fixture-absent.js"),
    `/* fixture: 查一个产物里没有的类名 */
(function () {
  "use strict";
  const el = document.querySelector(".fixture-absent-class");
  if (el) el.classList.add("fixture-absent-hit");
})();
`
  );
  expectRed("JB1 查产物里没有的类名 ⇒ JA1", dir, ["JA1"]);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* JB2：查一个产物里没有的**属性名** */
{
  const dir = makeSandbox();
  write(
    jsOf(dir, "fixture-absent.js"),
    `/* fixture: 查一个产物里没有的属性名 */
(function () {
  "use strict";
  const el = document.querySelector("[data-fixture-absent-attr]");
  if (el) el.classList.add("fixture-absent-hit");
})();
`
  );
  expectRed("JB2 查产物里没有的属性名 ⇒ JA1", dir, ["JA1"]);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* JB3：查一个产物里没有的 **id** */
{
  const dir = makeSandbox();
  write(
    jsOf(dir, "fixture-absent.js"),
    `/* fixture: 查一个产物里没有的 id */
(function () {
  "use strict";
  const el = document.getElementById("fixture-absent-id");
  if (el) el.classList.add("fixture-absent-hit");
})();
`
  );
  expectRed("JB3 查产物里没有的 id ⇒ JA1", dir, ["JA1"]);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* JB4：const 绑定的选择器指向缺失属性 ⇒ 常量解析必须真的在工作 */
{
  const dir = makeSandbox();
  patch(
    jsOf(dir, "fixture-const.js"),
    'const FIXTURE_CONST_SELECTOR = "[data-fixture-const]";',
    'const FIXTURE_CONST_SELECTOR = "[data-fixture-absent-const]";'
  );
  expectRed("JB4 const 绑定的选择器指向缺失属性 ⇒ JA1", dir, ["JA1"], "常量解析不是摆设");
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= 绿档 JB5–JB6：不该判红的两类 ================= */

/* JB5：把「运行时创建」抽掉 ⇒ 那个目标就既不在产物里、也没人创建它 ⇒ 必须转红。
   ⚠️ 这么做是为了证明「运行时创建算可达」这个豁免**真的在工作**：
     若它没生效，基线（JB0）早就是红的了 ⇒ 这一档证明的不是「豁免有用」，
     而是「脚本确实查了这个目标、豁免确实在替它挡着」。 */
{
  const dir = makeSandbox();
  patch(
    jsOf(dir, "fixture-runtime.js"),
    '  node.className = "fixture-runtime-node";\n',
    ""
  );
  expectRed("JB5 抽掉运行时创建 ⇒ 目标彻底消失 ⇒ JA1", dir, ["JA1"], "证明「运行时创建算可达」这个豁免确实在挡着");
  fs.rmSync(dir, { recursive: true, force: true });
}

/* JB6：选择器列表里任一分支可达就放行 */
{
  const dir = makeSandbox();
  write(
    jsOf(dir, "fixture-list.js"),
    `/* fixture: 选择器列表 —— 一支可达就放行 */
(function () {
  "use strict";
  const el = document.querySelector(".fixture-panel, [data-fixture-absent-list]");
  if (el) el.classList.add("fixture-list-hit");
})();
`
  );
  expectGreen("JB6 选择器列表里任一分支可达 ⇒ 放行", dir, "CSS 语义：分支之间是「或」");
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= 注入档 JB7–JB9：JA3 / JA2 / JA4 ================= */

/* JB7：门禁自己被卸掉 */
{
  const dir = makeSandbox();
  write(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "js-targets-fixture", scripts: { build: "echo build" } }, null, 2) + "\n"
  );
  expectRed("JB7 门禁自己被卸掉（build 链里不叫它了） ⇒ JA3", dir, ["JA3"]);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* JB8：提取器全瞎（所有脚本都不查 DOM）⇒ 覆盖度自证必须红。
   ⚠️ 脚本文件**保留**（只是不再查 DOM）：模块数要仍然 > 0，
      否则 JA2 会同时红在「一个脚本都没读到」上 ⇒ 一档红两条，归属不可判定。 */
{
  const dir = makeSandbox();
  for (const rel of ["fixture-main.js", "fixture-const.js", "fixture-runtime.js"]) {
    write(jsOf(dir, rel), `/* fixture: 这个脚本不查任何 DOM */\nconsole.log("fixture");\n`);
  }
  expectRed("JB8 提取器全瞎（所有脚本都不查 DOM）⇒ JA2（覆盖度自证）", dir, ["JA2"]);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* JB9：只用动态选择器的模块 ⇒ 门禁看不见它的目标 ⇒ JA4 必须红 */
{
  const dir = makeSandbox();
  write(jsOf(dir, "fixture-dynamic.js"), DYNAMIC_JS);
  expectRed("JB9 只用动态选择器的模块 ⇒ JA4", dir, ["JA4"]);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= 判据级负对照 JB10–JB13 ================= */

/* JB10：卸掉 JA1 ⇒ 四种死目标注入（缺类名 / 缺属性名 / 缺 id / const 指向缺失）全部转绿。
   ⚠️ 一次装四种注入：只要其中任何一种的红不是来自 JA1，这个沙箱就仍然红 ⇒ 立刻暴露。 */
{
  const injections = [
    ["缺类名", `/* fixture */\n(function () {\n  const el = document.querySelector(".fixture-absent-class");\n  if (el) el.classList.add("fixture-absent-hit");\n})();\n`],
    ["缺属性名", `/* fixture */\n(function () {\n  const el = document.querySelector("[data-fixture-absent-attr]");\n  if (el) el.classList.add("fixture-absent-hit");\n})();\n`],
    ["缺 id", `/* fixture */\n(function () {\n  const el = document.getElementById("fixture-absent-id");\n  if (el) el.classList.add("fixture-absent-hit");\n})();\n`],
  ];
  for (const [name, body] of injections) {
    const dir = makeSandbox();
    patch(gateOf(dir), "const JA1_ON = true;", "const JA1_ON = false;");
    write(jsOf(dir, "fixture-absent.js"), body);
    expectGreen(`JB10 负对照：卸掉 JA1 ⇒ ${name}的注入转绿`, dir, "证明那档的红确实来自 JA1 判定本身");
    fs.rmSync(dir, { recursive: true, force: true });
  }
  /* const 绑定那一条单独来一次（要改的是另一个文件） */
  {
    const dir = makeSandbox();
    patch(gateOf(dir), "const JA1_ON = true;", "const JA1_ON = false;");
    patch(
      jsOf(dir, "fixture-const.js"),
      'const FIXTURE_CONST_SELECTOR = "[data-fixture-const]";',
      'const FIXTURE_CONST_SELECTOR = "[data-fixture-absent-const]";'
    );
    expectGreen("JB10 负对照：卸掉 JA1 ⇒ const 绑定指向缺失的注入转绿", dir, "证明那档的红确实来自 JA1 判定本身");
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/* JB11：卸掉 JA2 ⇒ JB8 的注入必须转绿 */
{
  const dir = makeSandbox();
  patch(gateOf(dir), "const JA2_ON = true;", "const JA2_ON = false;");
  for (const rel of ["fixture-main.js", "fixture-const.js", "fixture-runtime.js"]) {
    write(jsOf(dir, rel), `/* fixture: 这个脚本不查任何 DOM */\nconsole.log("fixture");\n`);
  }
  expectGreen("JB11 负对照：卸掉 JA2 判定后，JB8 的注入转绿", dir, "证明 JB8 那档的红确实来自 JA2 判定本身");
  fs.rmSync(dir, { recursive: true, force: true });
}

/* JB12：卸掉 JA3 ⇒ JB7 的注入必须转绿 */
{
  const dir = makeSandbox();
  patch(gateOf(dir), "const JA3_ON = true;", "const JA3_ON = false;");
  write(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "js-targets-fixture", scripts: { build: "echo build" } }, null, 2) + "\n"
  );
  expectGreen("JB12 负对照：卸掉 JA3 判定后，JB7 的注入转绿", dir, "证明 JB7 那档的红确实来自 JA3 判定本身");
  fs.rmSync(dir, { recursive: true, force: true });
}

/* JB13：卸掉 JA4 ⇒ JB9 的注入必须转绿 */
{
  const dir = makeSandbox();
  patch(gateOf(dir), "const JA4_ON = true;", "const JA4_ON = false;");
  write(jsOf(dir, "fixture-dynamic.js"), DYNAMIC_JS);
  expectGreen("JB13 负对照：卸掉 JA4 判定后，JB9 的注入转绿", dir, "证明 JB9 那档的红确实来自 JA4 判定本身");
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= JB14：覆盖度自证（门禁不是空跑） ================= */

{
  const dir = makeSandbox();
  const r = runGate(dir);
  const m = /选择器 (\d+) 个、目标 token (\d+) 个/.exec(r.out);
  const nums = m ? m.slice(1).map((x) => Number(x)) : [];
  const ok = r.code === 0 && nums.length === 2 && nums[0] >= 1 && nums[1] >= 1;
  record(
    "JB14 覆盖度自证：基线上门禁确实认出了目标 token",
    ok,
    ok
      ? `选择器 ${nums[0]} 个、目标 token ${nums[1]} 个 —— 判据有真实命中，不是空跑`
      : `没读到覆盖度统计（或统计不对），缺自证证据\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= 收尾：仓库原件没被动过 ================= */

const problems = [];
if (sha256(GATE) !== GATE_SHA_AT_START) {
  problems.push("仓库里的门禁原件在自测期间被改动了 —— 自测必须只在副本上注入。");
}

if (problems.length) {
  console.error("\n站内 JS 目标门禁自测未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

const bad = results.filter((r) => !r.ok);
console.log(
  `\n注入矩阵：${results.length} 档里 ${results.length - bad.length} 档按预期触发` +
    `${bad.length ? `，${bad.length} 档未通过` : ""}` +
    `（JB10–JB13 是判据级负对照）。`
);
if (bad.length) bad.forEach((b) => console.log(`  · 未通过：${b.id}`));
console.log("  · 原件校验：门禁的 SHA-256 与自测开始时一致。");
process.exit(bad.length ? 1 : 0);
