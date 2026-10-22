#!/usr/bin/env node
/**
 * 工具路由门禁的**自测**（注入矩阵）—— 证明 RT1–RT9 每一条都**能变红**。
 *
 * 为什么要有这个自测（缺陷 D59 的第二批，2026-10-21 D58 场次）：
 *   一条**永远不会红**的判据，给出的是"看起来很确定的绿"——它比没有判据更坏，
 *   因为它把"盲区"包装成"已核过"。而"判据能不能变红"这件事，**只有注入能证明**。
 *   本仓已经吃过这一族亏：D51 查出三处 JS 空转、D52 查出死 CSS 门禁只守一张样式表、
 *   D57 给 IA8 加判据时也只能靠当场的 `/tmp` 注入矩阵证明它会红 ——
 *   **矩阵跑完即弃，仓库里没有任何东西保证它下次还在**。
 *   ⇒ 本脚本把那套矩阵**固化进仓库**，接在 build 链上。
 *
 * 本门禁守的是一条**具体证据链**（不是假想的风险）：
 *   三个浏览器工具（screenshot / lighthouse-runner / slow3g-runner）曾经各自手写
 *   一份要测的路由字面量，写的是早就改掉名的那条路由；它们**不检查 HTTP 状态码**，
 *   于是照样打印 "✓"、照样产出"可访问性 93 分"、照样记下一组 FCP/LCP/CLS ——
 *   而那些数字**全部来自本站 404 页**，与真测过的东西**完全同形**。
 *   判据 RT7/RT8/RT9 守的就是这条链的三个环节：路由来自共享表、测度前做可达性自检、
 *   工具自己不写站点路径。
 *
 * 做法：在**自造的最小夹具站**上逐档注入缺陷，断言门禁**报出的红因编号集合与预期完全相等**。
 *   ⚠️ 全程**不动仓库里的任何文件** —— 注入只在临时目录的副本上做。
 *   ⚠️ **不 require 被测门禁的代码**：门禁以**子进程**方式运行，
 *     本脚本只看它的**行为**（exit code + stderr 上的红因编号）。
 *   ⚠️ 为什么门禁必须**复制**而不是就地跑：本门禁的仓库根是
 *     `path.resolve(__dirname, "..")`（**硬编码，无环境变量开关**）⇒ 只有把副本放到
 *     夹具的 `scripts/` 下，ROOT 才会指向夹具根。⇒ 夹具因此**不需要 git、不需要真 `_site`**。
 *
 * 十五档：
 *   TT0  基线（原样）                     → 必须**全绿**（证明这套判据不是空跑）
 *   TT1  产物 _site 不在场                → RT1
 *   TT2  共享路由表模块不存在             → RT2
 *   TT3  共享路由表 require 抛错          → RT3
 *   TT4  共享路由表 allRoutes() 为空       → RT4
 *   TT5  规范路由在产物里不存在           → RT5（红因指名那条路由）
 *   TT6  scripts/ 下没有任何浏览器工具     → RT6
 *   TT7  某个工具没从共享路由表取路由      → RT7（红因指名那个工具）
 *   TT8  某个工具没做可达性自检            → RT8（红因指名那个工具）
 *   TT9  某个工具自己写死了站点路径        → RT9（红因指名那个工具与那条字面量）
 *   TT10 **故意判绿**：工具里写的是**真实存在的本地文件系统路径** → 必须仍判绿
 *        （证明 RT9 守的是「声称的站点路径」，不是「一切以 / 开头的字面量」）
 *   TT11 **故意判绿**：站点路径**只出现在注释里** → 必须仍判绿
 *        （证明 RT9 剥注释后只看代码行为；文档不是行为）
 *   TT12 **判据级负对照①**：门禁**副本**卸掉 RT5 + TT5 的注入 → 必须**转绿**
 *   TT13 **判据级负对照②**：门禁**副本**卸掉 RT5 + **同时**注入 RT5 与 RT7
 *        → 必须**仍红**，但红因集合恰为 {RT7}（证明卸判据是**精准**的，
 *          不是把门禁整个关掉）
 *   TT14 **判据级负对照③**：门禁**副本**卸掉 RT9 + TT9 的注入 → 必须**转绿**
 *
 * 三处必须说清的诚实边界（写在这里，别当成漏网）：
 *   ① **RT2 / RT3 / RT4 是同一族的三个坏法**（契约没了 / 读崩了 / 是空的），
 *      RT5 是**另一族**（契约好好地列出了路由，但产物里不存在）。分号不是为了好看，
 *      是因为这两族的**修法不同**，混成一个号 ⇒ 注入矩阵的两种红因集合无法区分
 *      ⇒ 「红因归属纯净」这条断言就废了。
 *   ② **RT9 只能单独触发，是因为注入只放在一个工具里**；若把四个工具都写死路径，
 *      RT9 会报四条红因（归属仍然纯净，只是条数变多）——本自测选一个工具，
 *      是为了让"红因**行数**"这条更强的断言也成立。
 *   ③ **TT10 依赖"该路径真实存在"**：RT9 用**存在性**区分"本地文件系统路径"与
 *      "声称的站点路径"。夹具里那个绝对路径是**本轮现造**的（`@OUTDIR@` 占位符在
 *      搭夹具时替换成沙箱里的真实目录）⇒ 它一定存在 ⇒ 该放行。
 *
 * 用法：node scripts/test-tool-routes.cjs
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const GATE = path.join(__dirname, "check-tool-routes.cjs");

/* 夹具用的路由。都是自造的，与真站点无关。 */
const FIXTURE_ROUTES = ["/", "/papers/"];
const MISSING_ROUTE = "/papers/gone-for-fixture/";

/* 夹具里的四个浏览器工具（对齐真仓库的工具文件名形状）。 */
const TOOL_FILES = [
  "screenshot.js",
  "screenshot-paper.js",
  "lighthouse-runner.js",
  "slow3g-runner.js",
];

/* ---------------- 夹具 ---------------- */

/**
 * 共享路由表模块（夹具版）。
 * ⚠️ 刻意写成**极简**的：只导出 allRoutes() ⇒ 夹具自足，
 *   任何一档的失败都只可能来自被测判据，不会来自夹具的复杂度。
 */
function routesModuleSource(routes) {
  return [
    "/* 自测夹具：极简共享路由表（不是真的 scripts/lib/site-routes.cjs） */",
    "module.exports = {",
    `  allRoutes: () => ${JSON.stringify(routes)},`,
    "};",
    "",
  ].join("\n");
}

/** 可达性自检模块（夹具版）—— 门禁只看工具源码里的**调用形状**，不执行它。 */
function pageCheckSource() {
  return [
    "/* 自测夹具：极简可达性自检模块 */",
    "function assertPageOk() {}",
    "function assertPagesOk() {}",
    "module.exports = { assertPageOk, assertPagesOk };",
    "",
  ].join("\n");
}

/**
 * 浏览器工具的源码（夹具版）。
 * ⚠️ 三处刻意设计：
 *   · `require("./lib/site-routes.cjs")` —— RT7 要认它；
 *   · `assertPagesOk(routes)` —— RT8 要认它；
 *   · **默认一个以 "/" 开头的字面量都没有** —— 免得每档都被 RT9 顺带打中，
 *     红因归属就不纯了。
 * ⚠️ `assertPagesOk` 的**解构行**里没有紧跟的 `(` ⇒ RT8 的正则
 *   `assertPages?Ok\s*\(` 不会把它误当成"调用过"。
 */
function toolSource(o) {
  const {
    requireRoutes = true,
    callAssert = true,
    literals = [],
    blockComments = [],
    lineComments = [],
  } = o || {};

  const L = [];
  L.push("#!/usr/bin/env node");
  L.push("/**");
  L.push(" * 自测夹具里的浏览器工具（不是真的工具）。");
  for (const c of blockComments) L.push(` * ${c}`);
  L.push(" */");
  for (const c of lineComments) L.push(`// ${c}`);
  L.push('const fs = require("fs");');
  L.push('const path = require("path");');
  if (requireRoutes) L.push('const { allRoutes } = require("./lib/site-routes.cjs");');
  L.push('const { assertPagesOk } = require("./lib/page-check.cjs");');
  L.push("");
  for (const lit of literals) L.push(`const legacyRoute = ${JSON.stringify(lit)};`);
  L.push("");
  L.push("async function main() {");
  L.push(requireRoutes ? "  const routes = allRoutes();" : "  const routes = [];");
  if (callAssert) L.push("  assertPagesOk(routes);");
  L.push('  const outDir = path.join(__dirname, "out");');
  L.push("  fs.mkdirSync(outDir, { recursive: true });");
  L.push("  console.log(routes.length);");
  L.push("}");
  L.push("");
  L.push("main();");
  L.push("");
  return L.join("\n");
}

/**
 * 搭一个夹具站（沙箱根目录）。
 * opts:
 *   noSite       —— 不造 _site/（RT1）
 *   noTools      —— 不造任何浏览器工具（RT6）
 *   routesModule —— "ok" | "missing" | "throws" | "empty"（RT2 / RT3 / RT4）
 *   extraRoute   —— 追加一条产物里不存在的路由（RT5）
 *   badTool      —— { file, requireRoutes, callAssert, literals, blockComments, lineComments }
 *   outDirLiteral—— 让某个工具写死一条**真实存在**的本地文件系统路径（TT10）
 */
function buildFixture(dir, opts) {
  const o = opts || {};

  if (!o.noSite) {
    fs.mkdirSync(path.join(dir, "_site", "papers"), { recursive: true });
    fs.writeFileSync(path.join(dir, "_site", "index.html"), "<!doctype html><title>fx</title>\n");
    fs.writeFileSync(
      path.join(dir, "_site", "papers", "index.html"),
      "<!doctype html><title>fx papers</title>\n"
    );
  }

  fs.mkdirSync(path.join(dir, "scripts", "lib"), { recursive: true });

  /* 共享路由表 */
  const routes = o.extraRoute ? FIXTURE_ROUTES.concat([o.extraRoute]) : FIXTURE_ROUTES.slice();
  const mode = o.routesModule || "ok";
  const routesFile = path.join(dir, "scripts", "lib", "site-routes.cjs");
  if (mode === "missing") {
    /* 什么都不写 ⇒ RT2 */
  } else if (mode === "throws") {
    fs.writeFileSync(
      routesFile,
      ["/* 自测夹具：这个模块一被 require 就抛错 */", 'throw new Error("fixture: route table is broken");', ""].join(
        "\n"
      )
    );
  } else if (mode === "empty") {
    fs.writeFileSync(routesFile, routesModuleSource([]));
  } else {
    fs.writeFileSync(routesFile, routesModuleSource(routes));
  }

  /* 可达性自检模块 */
  fs.writeFileSync(path.join(dir, "scripts", "lib", "page-check.cjs"), pageCheckSource());

  /* 浏览器工具 */
  if (!o.noTools) {
    for (const file of TOOL_FILES) {
      const t = { ...(o.badTool && o.badTool.file === file ? o.badTool : {}) };
      if (t.literalPlaceholder) {
        t.literals = [t.literalPlaceholder];
        delete t.literalPlaceholder;
      }
      fs.writeFileSync(path.join(dir, "scripts", file), toolSource(t));
    }
  }
}

/* ---------------- 门禁副本（负对照用） ---------------- */

/**
 * 把门禁复制到沙箱的 scripts/ 下（这样门禁的 ROOT 就是沙箱根）。
 * @param disableRt —— 要卸掉的判据编号（如 5 ⇒ 卸 RT5）
 * ⚠️ **卸判据必须自证**：改不到那个 `const RTn_ON = true;` 就直接失败 ——
 *   「破坏没打上」与「判据本来就不红」在结果上完全同形。
 * ⚠️ 副本与原件必须**只差那一行** —— 多差一行就说明负对照动的不止判据。
 */
function buildGateCopy(dir, disableRt) {
  const original = fs.readFileSync(GATE, "utf8");
  let copy = original;
  if (disableRt) {
    const from = `const RT${disableRt}_ON = true;`;
    const to = `const RT${disableRt}_ON = false;`;
    copy = copy.replace(from, to);
    if (copy === original) {
      console.error(
        `工具路由门禁自测失败：负对照没能改到 RT${disableRt} 判定（破坏没打上，这一档会假绿）。`
      );
      process.exit(1);
    }
    const a = original.split("\n");
    const b = copy.split("\n");
    const diff = a.filter((line, i) => line !== b[i]).length;
    if (diff !== 1 || a.length !== b.length) {
      console.error(
        `工具路由门禁自测失败：负对照的门禁副本与原件差了 ${diff} 行（应当恰好 1 行）。`
      );
      process.exit(1);
    }
  }
  const target = path.join(dir, "scripts", "check-tool-routes.cjs");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, copy);
  return target;
}

/* ---------------- 跑门禁 ---------------- */

function runGate(gatePath) {
  const r = spawnSync(process.execPath, [gatePath], { encoding: "utf8" });
  return { code: r.status, out: `${r.stdout || ""}`, err: `${r.stderr || ""}` };
}

/**
 * 从 **stderr** 里抽出红因编号（**按出现顺序、带重复**）。
 * ⚠️ 只取 stderr：门禁把**问题**写 stderr、把**通过语**写 stdout。
 * ⚠️ 按行匹配 `✗ 门禁 RTn` ⇒ 只数**红因行**，不会被红因正文里引用的编号带偏。
 */
function causesOf(stderr) {
  const out = [];
  const re = /^\s*✗\s*门禁 (RT\d+)/gm;
  let m;
  while ((m = re.exec(stderr)) !== null) out.push(m[1]);
  return out.sort();
}

/* ---------------- 注入档 ---------------- */

const CASES = [
  {
    id: "TT0",
    label: "基线（夹具原样）",
    expect: "green",
  },
  {
    id: "TT1",
    label: "产物 _site 不在场",
    expect: "red",
    causes: ["RT1"],
    opts: { noSite: true },
  },
  {
    id: "TT2",
    label: "共享路由表模块不存在",
    expect: "red",
    causes: ["RT2"],
    opts: { routesModule: "missing" },
  },
  {
    id: "TT3",
    label: "共享路由表 require 抛错",
    expect: "red",
    causes: ["RT3"],
    opts: { routesModule: "throws" },
  },
  {
    id: "TT4",
    label: "共享路由表 allRoutes() 为空",
    expect: "red",
    causes: ["RT4"],
    opts: { routesModule: "empty" },
  },
  {
    id: "TT5",
    label: "规范路由在产物里不存在",
    expect: "red",
    causes: ["RT5"],
    opts: { extraRoute: MISSING_ROUTE },
    expectText: MISSING_ROUTE,
  },
  {
    id: "TT6",
    label: "scripts/ 下没有任何浏览器工具",
    expect: "red",
    causes: ["RT6"],
    opts: { noTools: true },
  },
  {
    id: "TT7",
    label: "工具没从共享路由表取路由",
    expect: "red",
    causes: ["RT7"],
    opts: { badTool: { file: "screenshot.js", requireRoutes: false } },
    expectText: "screenshot.js",
  },
  {
    id: "TT8",
    label: "工具没做可达性自检",
    expect: "red",
    causes: ["RT8"],
    opts: { badTool: { file: "lighthouse-runner.js", callAssert: false } },
    expectText: "lighthouse-runner.js",
  },
  {
    id: "TT9",
    label: "工具自己写死了站点路径",
    expect: "red",
    causes: ["RT9"],
    opts: { badTool: { file: "slow3g-runner.js", literals: [MISSING_ROUTE] } },
    expectText: MISSING_ROUTE,
  },
  {
    id: "TT10",
    label: "故意判绿：工具里写的是真实存在的本地文件系统路径",
    expect: "green",
    opts: { badTool: { file: "slow3g-runner.js", literalPlaceholder: "@OUTDIR@" } },
  },
  {
    id: "TT11",
    label: "故意判绿：站点路径只出现在注释里",
    expect: "green",
    opts: {
      badTool: {
        file: "slow3g-runner.js",
        blockComments: [`旧路由曾在块注释里出现：${MISSING_ROUTE}`],
        lineComments: [`旧路由曾在行注释里出现：${MISSING_ROUTE}`],
      },
    },
  },
  {
    id: "TT12",
    label: "判据级负对照①：门禁副本卸掉 RT5 + TT5 的注入 → 必须转绿",
    expect: "green",
    disableRt: 5,
    opts: { extraRoute: MISSING_ROUTE },
  },
  {
    id: "TT13",
    label: "判据级负对照②：门禁副本卸掉 RT5 + 同时注入 RT5 与 RT7 → 必须仍红且红因集合恰为 {RT7}",
    expect: "red",
    causes: ["RT7"],
    disableRt: 5,
    opts: {
      extraRoute: MISSING_ROUTE,
      badTool: { file: "screenshot.js", requireRoutes: false },
    },
  },
  {
    id: "TT14",
    label: "判据级负对照③：门禁副本卸掉 RT9 + TT9 的注入 → 必须转绿",
    expect: "green",
    disableRt: 9,
    opts: { badTool: { file: "slow3g-runner.js", literals: [MISSING_ROUTE] } },
  },
];

/* ---------------- 跑 ---------------- */

/* 门禁原件的摘要 —— 跑完要比对：负对照改的是**副本**，原件必须逐字节未变。 */
const gateBefore = fs.readFileSync(GATE, "utf8");

let pass = 0;
let fail = 0;
const failures = [];
const covered = new Set();

for (const c of CASES) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mh-toolroutes-"));
  try {
    const fixture = path.join(tmp, "fixture");
    fs.mkdirSync(fixture, { recursive: true });

    /* TT10 要的那条"真实存在的本地文件系统路径"：本轮现造一个沙箱里的真目录。 */
    const outDir = path.join(fixture, "out");
    fs.mkdirSync(outDir, { recursive: true });

    /* 把 @OUTDIR@ 占位符换成本轮真实的绝对路径。 */
    const opts = JSON.parse(JSON.stringify(c.opts || {}));
    if (opts.badTool && opts.badTool.literalPlaceholder === "@OUTDIR@") {
      opts.badTool.literalPlaceholder = outDir;
    }
    buildFixture(fixture, opts);

    const gatePath = buildGateCopy(fixture, c.disableRt);

    const r = runGate(gatePath);
    const got = causesOf(r.err);

    if (c.expect === "green") {
      if (r.code === 0) {
        pass++;
        console.log(`  ✓ ${c.id} ${c.label} → 判绿（符合预期）`);
      } else {
        fail++;
        failures.push(`${c.id} ${c.label}：期望判绿，实际 exit ${r.code}\n${r.err.trim()}`);
        console.log(`  ✗ ${c.id} ${c.label} → 实际判红（不符合预期）`);
      }
      continue;
    }

    /* 红：exit 必须是 1，红因编号集合必须**完全相等**（多一条、少一条都算失败 ——
       多一条说明还有别的判据在说话（归属不纯），少一条说明这条判据没抓住）。
       集合按**多重集**比（带重复）⇒ 连"同一条判据报了两次"也算失败。 */
    const want = [...c.causes].sort();
    const gotKey = JSON.stringify(got);
    const wantKey = JSON.stringify(want);
    if (r.code !== 1) {
      fail++;
      failures.push(`${c.id} ${c.label}：期望 exit 1，实际 exit ${r.code}\n${r.err.trim()}`);
      console.log(`  ✗ ${c.id} ${c.label} → 未按预期判红（exit ${r.code}）`);
      continue;
    }
    if (gotKey !== wantKey) {
      fail++;
      failures.push(
        `${c.id} ${c.label}：红因编号集合应为 ${wantKey}，实际 ${gotKey}\n${r.err.trim()}`
      );
      console.log(`  ✗ ${c.id} ${c.label} → 红因集合不符（应为 ${wantKey}，实际 ${gotKey}）`);
      continue;
    }
    if (c.expectText && !r.err.includes(c.expectText)) {
      fail++;
      failures.push(`${c.id} ${c.label}：红因里没指名「${c.expectText}」\n${r.err.trim()}`);
      console.log(`  ✗ ${c.id} ${c.label} → 红因没指名目标`);
      continue;
    }
    want.forEach((k) => covered.add(k));
    pass++;
    console.log(`  ✓ ${c.id} ${c.label} → 判红且红因集合恰为 ${wantKey}（符合预期）`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/* ---------------- 覆盖度自证 ----------------
   门禁每加一条判据，本自测就必须补一档 —— 否则新判据的「能不能变红」没人证明。
   判据编号从**门禁源码里现读**（不写死名单）：新增一条判据、源码里出现它的编号 ⇒
   这里立刻判红，提醒补档。 */
const gateSource = fs.readFileSync(GATE, "utf8");
const gateIds = new Set(
  [...gateSource.matchAll(/\bRT(\d+)\b/g)].map((m) => `RT${m[1]}`)
);
const missing = [...gateIds].filter((id) => !covered.has(id)).sort();
if (missing.length) {
  fail++;
  failures.push(
    `覆盖度自证：门禁里有 ${missing.join("、")}，但本矩阵没有能触发它们的档 —— ` +
      `门禁新加了判据，本自测必须补一档（否则新判据「能不能变红」没人证明）。`
  );
  console.log(`  ✗ 覆盖度自证：${missing.join("、")} 没有对应的注入档`);
}

/* 门禁原件必须逐字节未变（负对照改的是副本）。 */
if (fs.readFileSync(GATE, "utf8") !== gateBefore) {
  fail++;
  failures.push("门禁原件被改了 —— 自测只许改副本，原件必须逐字节未变。");
  console.log("  ✗ 门禁原件被改了");
}

console.log("");
if (fail) {
  console.error(`工具路由门禁自测未通过：${pass} 档符合预期，${fail} 档不符合。\n`);
  failures.forEach((f) => console.error(`  ✗ ${f}\n`));
  process.exit(1);
}
console.log(
  `工具路由门禁自测通过：${pass} 档全部符合预期` +
    `（TT0 / TT10 / TT11 / TT12 / TT14 绿 · TT1–TT9 / TT13 红且红因集合完全相等），` +
    `覆盖门禁全部 ${[...gateIds].sort().join("、")} 判据。`
);
