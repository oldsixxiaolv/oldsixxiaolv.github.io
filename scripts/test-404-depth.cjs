#!/usr/bin/env node
/**
 * 404 页路径深度门禁的**自测**（注入矩阵 + 判据级负对照）——
 * 证明 E0–E3 每一条都**能变红**，而且**只能**由它自己变红。
 *
 * 为什么要有这个自测：
 *   一条**永远不会红**的判据，给出的是"看起来很确定的绿"——它比没有判据更坏，
 *   因为它把"盲区"包装成"已核过"。这道门禁判的是**产物里的 URL 形态**，
 *   而"注入没生效"（正则没匹配上、属性名写错、锚点不存在）恰恰是最容易发生、
 *   也最不容易看出来的失败模式。所以"这条判据结构上能不能触发"必须**被证明**。
 *
 * 本自测守四件事（缺任何一件，它就只是"跑过一遍"，不是"证明过"）：
 *   ① **红因归属纯净** —— 命中的判据集合必须**恰好**等于期望集合：
 *      多一条（连坐）少一条（漏判）都算失败；每条红因行都必须能被归类，
 *      归不了类 ⇒ 出现了本自测不知道的新红因 ⇒ 判红。
 *   ② **覆盖度自证** —— 门禁每加一条判据，本自测就必须补一档。
 *      判据清单是**静态登记**的：动态登记的话，门禁新加判据时它连同自己的
 *      比较点一起消失 ⇒ 覆盖度自证反而判绿。
 *   ③ **判据级负对照** —— 在**门禁副本**里把该判据的守卫条件换成永假，
 *      注入同一份坏数据 ⇒ 该判据的红因必须消失、其余红因照旧。
 *   ④ **门禁原件逐字节未变** —— 注入与负对照改的全是副本，原件不许动。
 *
 * 做法：把 404 产物与一份普通页面的产物**各复制**一份到临时目录，
 *   在副本上逐个注入缺陷，用 SITE_DIR 把门禁指向副本。
 *   ⚠️ 全程**不动仓库里的任何文件** —— 注入必须在副本上做。
 *     （这正是门禁里留 SITE_DIR 这个开关的原因：没有它，自测就只能去改仓库文件，
 *       改坏了就是事故，也会和并发的 build 抢同一个 _site 目录。）
 *
 * 档位：
 *   N0 基线（原样）                → 必须**全绿**（证明这套判据不是空跑）
 *   N1 把 404 某个 CSS 改回相对   → E1
 *   N2 把 404 的站内链接挪到站外   → E2
 *   N3 把普通页面某个链接改根绝对   → E3
 *   N4 把 404 产物整个拿走         → E0
 *   NC1–NC4 逐条摘掉 E0–E3         → 对应红因消失、门禁转绿
 *
 * 用法：node scripts/test-404-depth.cjs
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-404-depth.cjs");
const SITE_404 = path.join(ROOT, "_site", "404.html");
/** E3 用：一份普通页面（首页）。它的站内 URL 必须是相对的。 */
const SITE_HOME = path.join(ROOT, "_site", "index.html");

/** 已累积的失败明细。声明在最前面：bail() 要用它把明细带出来。 */
const failures = [];
let pass = 0;
let failCount = 0;

/**
 * 自测自身出问题时的中止（不是门禁判红，是自测跑不动）。
 * ⚠️ 必须把**已经累积的失败明细**一并带出来：负对照的锚点失配往往发生在
 *   前面几档已经红掉之后，只报一句"中止"会把"哪条判据没变红"这个最关键的信息丢掉。
 */
function bail(msg) {
  console.error(`404 页路径深度自测中止：${msg}`);
  if (failures.length) {
    console.error(`中止前已累积 ${failures.length} 条未通过明细：`);
    failures.forEach((f) => console.error(`  ✗ ${f}\n`));
  }
  process.exit(1);
}

for (const [label, p] of [
  ["_site/404.html", SITE_404],
  ["_site/index.html", SITE_HOME],
]) {
  if (!fs.existsSync(p)) {
    console.error(`404 页路径深度自测失败：找不到 ${label}（${p}）。`);
    console.error("请先跑 npm run build。");
    process.exit(1);
  }
}

const gateBefore = fs.readFileSync(GATE, "utf8");
const original = {
  html404: fs.readFileSync(SITE_404, "utf8"),
  htmlHome: fs.readFileSync(SITE_HOME, "utf8"),
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mh-404depth-selftest-"));

/* ---------------- 红因判据表：每条判据一个唯一文案片段 ----------------
   片段必须**互不包含**（否则一条红因会同时落进两个判据 ⇒ 归属不纯），
   这一条在下面「红因表自证」里当场验。 */
const CAUSES = {
  E0: "找不到 404 产物",
  E1: "404 页里出现了相对站内 URL",
  E2: "404 页只检出",
  E3: "非 404 页面",
};

/* 门禁自己的判据清单（**静态登记**，不动态生成）。 */
const CRITERIA = ["E0", "E1", "E2", "E3"];

/* ---------------- 工具 ---------------- */

/** 替换一次；锚点不存在就抛错（坏跑必须当场暴露，不能记成"测过了"）。 */
function replaceOnce(text, from, to) {
  if (!text.includes(from)) throw new Error(`注入锚点不存在：找不到「${from}」`);
  return text.replace(from, to);
}

/**
 * 在副本上注入 → 跑门禁 → 归类红因。
 * 每次跑都用**独立的产物目录**，避免上一档的残留影响下一档。
 * gatePath 省略时跑门禁原件（注入档）；负对照传门禁**副本**的路径。
 */
function run(mutate, gatePath) {
  const siteDir = fs.mkdtempSync(path.join(tmp, "site-"));
  let html404 = original.html404;
  let htmlHome = original.htmlHome;
  let drop404 = false;

  if (mutate) {
    const next = mutate({ html404, htmlHome });
    if (!next) throw new Error("注入没有改变任何内容 —— 锚点不存在，这一档是坏跑");
    if (typeof next.html404 === "string") html404 = next.html404;
    if (typeof next.htmlHome === "string") htmlHome = next.htmlHome;
    if (next.drop404 === true) drop404 = true;
    if (html404 === original.html404 && htmlHome === original.htmlHome && !drop404) {
      throw new Error("注入没有改变任何内容 —— 这一档是坏跑");
    }
  }

  fs.writeFileSync(path.join(siteDir, "index.html"), htmlHome);
  if (!drop404) fs.writeFileSync(path.join(siteDir, "404.html"), html404);

  const r = spawnSync(process.execPath, [gatePath || GATE], {
    env: { ...process.env, SITE_DIR: siteDir },
    encoding: "utf8",
  });
  const err = r.stderr || "";
  const redLines = [];
  for (const line of err.split("\n")) {
    const m = line.match(/^\s*✗\s(.*)$/);
    if (m) redLines.push(m[1]);
  }
  /* 归类：每条红因行必须**恰好**落进一个判据。
     落不进 ⇒ 出现了本自测不知道的新红因（归属不纯）；落进两个 ⇒ 判据表有歧义。 */
  const causes = new Set();
  const unknown = [];
  for (const line of redLines) {
    const hits = Object.keys(CAUSES).filter((k) => line.indexOf(CAUSES[k]) !== -1);
    if (hits.length === 1) causes.add(hits[0]);
    else unknown.push(`${hits.length ? "归属有歧义" : "无法归类"}：${line}`);
  }
  return {
    code: r.status,
    err,
    redLines,
    causes: [...causes].sort(),
    unknown,
    crashed:
      /SyntaxError|ReferenceError|TypeError|Node\.js v/.test(err) ||
      (r.status !== 0 && redLines.length === 0),
  };
}

function keyOf(set) {
  return set.length ? set.join(" + ") : "（无红因）";
}

/* ---------------- 注入档 ---------------- */

const CASES = [
  { id: "N0", label: "基线（原样）", expect: "green", criterion: null },

  { id: "N1", label: "404 某个 CSS 改回相对路径", expect: "red", causes: ["E1"], criterion: "E1",
    apply: (p) => ({
      html404: replaceOnce(
        p.html404,
        'href="/assets/css/components.css"',
        'href="assets/css/components.css"'
      ),
    }) },

  // N2：把 404 页的站内链接"挪到站外" ⇒ 站内 URL 数量掉到阈值以下 ⇒ E2
  // （注意：全部改成**站外绝对地址**，而不是改回相对路径 ——
  //   否则 E1 会先判红，就测不到 E2 了。这一档要单独证明 E2 自己能变红。）
  { id: "N2", label: "404 的站内链接挪到站外（数量掉到阈值下）", expect: "red", causes: ["E2"], criterion: "E2",
    apply: (p) => {
      const re = /(?:href|src)="\/(?!\/)[^"]*"/g;
      const before = (p.html404.match(re) || []).length;
      if (before < 8) throw new Error("404 页的站内 URL 本来就不足 8 个，注入前提不成立");
      return { html404: p.html404.replace(re, 'href="https://example.invalid/removed"') };
    } },

  { id: "N3", label: "普通页面链接改根绝对", expect: "red", causes: ["E3"], criterion: "E3",
    apply: (p) => ({
      htmlHome: replaceOnce(
        p.htmlHome,
        'href="assets/css/components.css"',
        'href="/assets/css/components.css"'
      ),
    }) },

  // N4：把 404 产物整个拿走 ⇒ E0。
  // 这一档是 E0 **唯一**能变红的场合 —— 门禁里 E0 只在"产物不在"时触发，
  // 所以没有这一档，E0 就是一条**没人证明过**的判据。
  { id: "N4", label: "404 产物缺失", expect: "red", causes: ["E0"], criterion: "E0",
    apply: () => ({ drop404: true }) },
];

/* ---------------- 判据级负对照：在**门禁副本**里卸掉那条判据 ----------------
   每条判据一档：注入同一份坏数据 + 门禁副本里把该判据的守卫条件改成永假
   ⇒ 该判据的红因必须消失（其余红因照旧）。
   ⚠️ 副本与原件必须**只差那一行**（逐行比对断言）——否则负对照动的不止判据。
   ⚠️ 替换一律**同行**进行：多写一行会让后面所有行位移，逐行比对会误判。 */
const NEUTERS = [
  { id: "NC1", label: "卸掉 E0 的「404 产物缺失」判定", base: "N4", drop: "E0",
    from: "if (!has404) {", to: "if (false) {" },
  { id: "NC2", label: "卸掉 E1 的「相对站内 URL」判定", base: "N1", drop: "E1",
    from: "for (const u of relativeOnes) {", to: "for (const u of []) {" },
  { id: "NC3", label: "卸掉 E2 的「覆盖度下限」判定", base: "N2", drop: "E2",
    from: "if (internal.length < MIN_INTERNAL_URLS) {", to: "if (false) {" },
  { id: "NC4", label: "卸掉 E3 的「其余页面仍相对」判定", base: "N3", drop: "E3",
    from: "if (isRootAbsolute(u)) {", to: "if (false) {" },
];

/* ---------------- 跑全部档位 ---------------- */

console.log("404 页路径深度门禁 · 本地注入矩阵：\n");

for (const c of CASES) {
  let r;
  try {
    r = run(c.apply || null);
  } catch (e) {
    failCount++;
    failures.push(`${c.id} ${c.label}：注入本身坏了：${e.message}`);
    console.log(`  ✗ ${c.id} ${c.label} → 注入本身坏了`);
    continue;
  }
  if (r.crashed) {
    failCount++;
    failures.push(`${c.id} ${c.label}：门禁崩了（不是判红，是脚本炸了）\n${r.err.trim()}`);
    console.log(`  ✗ ${c.id} ${c.label} → 门禁崩溃`);
    continue;
  }
  if (r.unknown.length) {
    failCount++;
    failures.push(
      `${c.id} ${c.label}：红因归属不纯（有一条红因落不进任何判据）\n${r.unknown.join("\n")}\n${r.err.trim()}`
    );
    console.log(`  ✗ ${c.id} ${c.label} → 红因归属不纯`);
    continue;
  }
  if (c.expect === "green") {
    if (r.code !== 0 || r.redLines.length) {
      failCount++;
      failures.push(`${c.id} ${c.label}：期望判绿，实际 exit ${r.code}\n${r.err.trim()}`);
      console.log(`  ✗ ${c.id} ${c.label} → 实际判红（不符合预期）`);
      continue;
    }
  } else {
    const want = (c.causes || []).slice().sort();
    if (r.code !== 1) {
      failCount++;
      failures.push(
        `${c.id} ${c.label}：期望 exit 1，实际 exit ${r.code}（期望红因判据：${keyOf(want)}）\n${r.err.trim()}`
      );
      console.log(`  ✗ ${c.id} ${c.label} → 未按预期判红（exit ${r.code}，期望 ${keyOf(want)}）`);
      continue;
    }
    if (keyOf(want) !== keyOf(r.causes)) {
      failCount++;
      failures.push(
        `${c.id} ${c.label}：红因判据集合应为 ${keyOf(want)}，实际 ${keyOf(r.causes)}\n${r.err.trim()}`
      );
      console.log(`  ✗ ${c.id} ${c.label} → 红因集合不符`);
      continue;
    }
  }
  pass++;
  const detail =
    c.expect === "green" ? "判绿" : `判红且红因集合恰为 ${keyOf(c.causes)}`;
  console.log(`  ✓ ${c.id} ${c.label} → ${detail}（符合预期）`);
}

/* ---------------- 判据级负对照 ---------------- */

for (const nc of NEUTERS) {
  const base = CASES.find((x) => x.id === nc.base);
  if (!base) bail(`负对照 ${nc.id} 引用的基线档 ${nc.base} 不存在。`);

  const count = gateBefore.split(nc.from).length - 1;
  if (count !== 1) {
    bail(`负对照 ${nc.id} 的替换目标命中 ${count} 次（应当恰好 1 次）——门禁源码形态变了。`);
  }
  const copy = gateBefore.split(nc.from).join(nc.to);

  /* 副本与原件必须**只差那一行**（行数也要一样）——否则负对照动的不止判据。 */
  const a = gateBefore.split("\n");
  const b = copy.split("\n");
  const diff = a.filter((line, i) => line !== b[i]).length;
  if (diff !== 1 || a.length !== b.length) {
    bail(
      `负对照 ${nc.id}：门禁副本与原件差了 ${diff} 行 / 行数 ${a.length}→${b.length}` +
        `（应当恰好 1 行且行数不变）。`
    );
  }

  const gateDir = fs.mkdtempSync(path.join(tmp, "gate-"));
  const gateCopy = path.join(gateDir, "check-404-depth.cjs");
  fs.writeFileSync(gateCopy, copy);

  let r;
  try {
    r = run(base.apply || null, gateCopy);
  } catch (e) {
    failCount++;
    failures.push(`${nc.id} ${nc.label}：注入本身坏了：${e.message}`);
    console.log(`  ✗ ${nc.id} ${nc.label} → 注入本身坏了`);
    continue;
  }

  const want = (base.causes || []).filter((x) => x !== nc.drop).sort();
  if (r.crashed || r.unknown.length) {
    failCount++;
    failures.push(`${nc.id} ${nc.label}：门禁崩了或红因归属不纯\n${r.err.trim()}`);
    console.log(`  ✗ ${nc.id} ${nc.label} → 门禁崩溃 / 归属不纯`);
    continue;
  }
  if (keyOf(want) !== keyOf(r.causes)) {
    failCount++;
    failures.push(
      `${nc.id} ${nc.label}：卸掉「${nc.drop}」后红因集合应为 ${keyOf(want)}，实际 ${keyOf(r.causes)}\n${r.err.trim()}`
    );
    console.log(`  ✗ ${nc.id} ${nc.label} → 卸判据后红因集合不符`);
    continue;
  }
  if (!want.length && r.code !== 0) {
    failCount++;
    failures.push(`${nc.id} ${nc.label}：卸掉「${nc.drop}」后应判绿，实际 exit ${r.code}\n${r.err.trim()}`);
    console.log(`  ✗ ${nc.id} ${nc.label} → 卸判据后未转绿`);
    continue;
  }
  pass++;
  console.log(
    `  ✓ ${nc.id} ${nc.label} → 卸掉该判据后「${nc.drop}」的红因消失，其余 ${keyOf(want)}（符合预期）`
  );
}

/* ---------------- 红因表自证 ----------------
   ① 每个判据片段必须**真的**出现在门禁源码里（门禁改了文案 ⇒ 本表要跟着改）；
   ② 片段之间**互不包含**（否则一条红因会落进两个判据 ⇒ 归属不纯）。 */
for (const [k, frag] of Object.entries(CAUSES)) {
  if (gateBefore.indexOf(frag) === -1) {
    failCount++;
    failures.push(`红因表自证：判据 ${k} 的文案片段在门禁源码里找不到 ⇒ 门禁文案变了，本表要同步。`);
    console.log(`  ✗ 红因表自证：${k} 的片段在门禁源码里找不到`);
  }
}
const causeKeys = Object.keys(CAUSES);
for (let i = 0; i < causeKeys.length; i++) {
  for (let j = i + 1; j < causeKeys.length; j++) {
    const a = CAUSES[causeKeys[i]];
    const b = CAUSES[causeKeys[j]];
    if (a.indexOf(b) !== -1 || b.indexOf(a) !== -1) {
      failCount++;
      failures.push(
        `红因表自证：判据 ${causeKeys[i]} 与 ${causeKeys[j]} 的文案片段互相包含 ⇒ 一条红因会落进两个判据，归属不纯。`
      );
      console.log(`  ✗ 红因表自证：${causeKeys[i]} 与 ${causeKeys[j]} 的片段互相包含`);
    }
  }
}

/* ---------------- 覆盖度自证 ----------------
   门禁每加一条判据，本自测就必须补一档 —— 否则新判据的「能不能变红」没人证明。
   判据清单是**静态登记**的（不动态生成）：动态登记的话，门禁新加一条判据时
   它连同自己的比较点一起消失 ⇒ 覆盖度自证反而判绿。 */
const covered = new Set();
for (const c of CASES) if (c.criterion) covered.add(c.criterion);
const missing = CRITERIA.filter((id) => !covered.has(id));
if (missing.length) {
  failCount++;
  failures.push(
    `覆盖度自证：门禁判据 ${missing.join("、")} 没有对应的注入档 —— ` +
      `门禁新加了判据，本自测必须补一档（否则新判据「能不能变红」没人证明）。`
  );
  console.log(`  ✗ 覆盖度自证：${missing.join("、")} 没有对应的注入档`);
}
/* 反向：门禁里的判据必须与静态清单**完全对齐**（两个方向都查）。
   只查「清单 ⊆ 门禁」是不够的 —— 那样门禁新加一条判据（或加一条**没编号**的
   裸红因）时本自测毫无察觉，新判据的「能不能变红」就没人证明了。 */
const gateCriteria = new Set();
for (const m of gateBefore.matchAll(/fail\(\s*`E(\d+)/g)) gateCriteria.add(`E${m[1]}`);
const failCalls = (gateBefore.match(/\bfail\s*\(/g) || []).length;
if (!gateCriteria.size) {
  failCount++;
  failures.push(
    "覆盖度自证：门禁源码里一个「fail(`E<编号>`」形态的红因都没解析到 —— " +
      "门禁的红因编号写法变了（或判据被改名），静态清单已与门禁对不齐。"
  );
  console.log("  ✗ 覆盖度自证：门禁源码里解析不到判据编号");
} else {
  const gateOnly = [...gateCriteria].filter((id) => !CRITERIA.includes(id));
  const listOnly = CRITERIA.filter((id) => !gateCriteria.has(id));
  if (gateOnly.length || listOnly.length) {
    failCount++;
    failures.push(
      `覆盖度自证：门禁里多出的判据 ${gateOnly.join("、") || "（无）"}、` +
        `清单里多出的判据 ${listOnly.join("、") || "（无）"} —— 两侧对不齐。`
    );
    console.log("  ✗ 覆盖度自证：门禁判据与静态清单对不齐");
  }
}
/* 门禁里每条判据恰好一条红因（fail 调用数 == 判据数）：
   门禁若多出一条**没编号**的裸红因，上面那条按编号解析的检查看不见它。 */
if (failCalls !== CRITERIA.length) {
  failCount++;
  failures.push(
    `覆盖度自证：门禁里 fail() 被调用 ${failCalls} 次，判据清单却有 ${CRITERIA.length} 条 —— ` +
      `一条判据应当恰好对应一条红因（多出来的多半是一条没编号的裸红因）。`
  );
  console.log(`  ✗ 覆盖度自证：fail() 调用数 ${failCalls} ≠ 判据数 ${CRITERIA.length}`);
}

/* 门禁原件必须逐字节未变（注入与负对照改的都是副本）。 */
if (fs.readFileSync(GATE, "utf8") !== gateBefore) {
  failCount++;
  failures.push("门禁原件被改了 —— 自测只许改副本，原件必须逐字节未变。");
  console.log("  ✗ 门禁原件被改了");
}

/* ---------------- 汇总 ---------------- */
fs.rmSync(tmp, { recursive: true, force: true });

if (failCount) {
  console.error(`\n404 页路径深度自测：${failCount} 档未通过。`);
  failures.forEach((f) => console.error(`  ✗ ${f}\n`));
  process.exit(1);
}
console.log(
  `\n404 页路径深度自测：${pass} 档全部符合预期` +
    `（N0 判绿 · 其余注入档判红且红因判据集合完全相等 · ` +
    `${NEUTERS.length} 档判据级负对照全部转绿），` +
    `覆盖门禁全部 ${CRITERIA.length} 条判据（${CRITERIA.join("、")}）。`
);
