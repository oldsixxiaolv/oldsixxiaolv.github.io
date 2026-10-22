#!/usr/bin/env node
/**
 * Copy 出口门禁自测（判据 CE1–CE9）。
 *
 * 为什么需要它：check-copy-export 是全仓**判据最多**的门禁之一（9 条），
 * 而它**零自证判据**——门禁自己没有任何一条能证明"我这条判据还能变红"。
 * → 没有自测时，它就可能一直绿着，而绿的原因跟"没守"在结果上长得一模一样。
 *
 * 这份自测用**门禁自带的注入模式**（`node scripts/check-copy-export.cjs <文件>`
 * 只查你给的那个文件）搭夹具：每个用例只需要摆一个文件，不必造整站布局。
 *
 * 夹具的形状：
 *   <tmp>/package.json                  —— CE9 要读它（门禁自己有没有接在 build 上）
 *   <tmp>/scripts/check-copy-export.cjs —— 门禁副本（REPO = <tmp>，相对路径好看）
 *   <tmp>/src/assets/js/*.js            —— 磁盘 .js 扫描面
 *   <tmp>/src/_includes/*.njk           —— 模板内联脚本块扫描面
 *
 * 自测要做四件事（缺一件就等于没测）：
 *   ① **红因归属纯净**：每档红只许出现自己那几条判据的编号，**多重集完全相等**；
 *   ② **判据级负对照**：逐条卸掉 CE1–CE9，对应缺陷档必须转绿
 *      （证明"这档红确实是这条判据抓到的"，而不是"门禁整体红了"）；
 *   ③ **精准性负对照**：卸一条判据 + 叠加另一个不连坐的注入 ⇒
 *      被卸的那条红因消失、另一条仍在（证明卸判据是精准的，不是把门禁整个关掉）；
 *   ④ **覆盖度自证**：判据编号从**门禁源码现读**（不写死），
 *      门禁新加判据而本矩阵没补档 ⇒ 判红。
 *
 * 另外还断言：副本相对门禁原件的**差异行数**与声明一致、门禁原件**逐字节未变**。
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(ROOT, "scripts", "check-copy-export.cjs");
const GATE_SRC = fs.readFileSync(GATE, "utf8");
const GATE_SHA = crypto.createHash("sha256").update(GATE_SRC).digest("hex");

/* ── 覆盖度自证：判据编号从门禁源码现读（不写死） ─────────────────────────
   ⚠️ 这段必须在**判定开关之外**（不在任何 if / 循环体内做计数），
      否则"覆盖度"本身就成了可被卸掉的东西。 */
const GATE_IDS = [
  ...new Set([...GATE_SRC.matchAll(/\bCE(\d+)\b/g)].map((m) => `CE${m[1]}`)),
].sort();
const EXPECT_IDS = ["CE1", "CE2", "CE3", "CE4", "CE5", "CE6", "CE7", "CE8", "CE9"];

/* ── 夹具用的源码样本 ─────────────────────────────────────────────────── */

/** 正常样本：同文件里 writeText + textarea 回退，两条路径取同一个值。 */
const GOOD_BOTH = [
  "const pre = document.querySelector('pre');",
  "const text = pre.textContent;",
  "navigator.clipboard.writeText(text);",
  "const ta = document.createElement('textarea');",
  "ta.value = text;",
].join("\n");

/** 正常样本：只有剪贴板一条路径（注入模式下全站无回退 ⇒ 不触发 CE6）。 */
const GOOD_CLIP_ONLY = [
  "const pre = document.querySelector('pre');",
  "const text = pre.textContent;",
  "navigator.clipboard.writeText(text);",
].join("\n");

/** CE2：调用点语法超出提取正则能匹配的范围（没有点号的 writeText(）。 */
const BAD_CE2 = [
  "const pre = document.querySelector('pre');",
  "const text = pre.textContent;",
  "navigator.clipboard.writeText(text);",
  "writeText(text);",
].join("\n");

/** CE3：textarea 创建的写法超出提取正则能匹配的范围（window.document.…）。 */
const BAD_CE3 = [
  "const pre = document.querySelector('pre');",
  "const text = pre.textContent;",
  "navigator.clipboard.writeText(text);",
  "window.document.createElement('textarea');",
].join("\n");

/** CE4：复制出口直接读了 .innerHTML。 */
const BAD_CE4 = [
  "const pre = document.querySelector('pre');",
  "const src = pre;",
  "navigator.clipboard.writeText(src.innerHTML);",
].join("\n");

/** CE5：同文件两条复制路径取的不是同一个值。 */
const BAD_CE5 = [
  "const pre = document.querySelector('pre');",
  "const text = pre.textContent;",
  "const other = pre.textContent;",
  "navigator.clipboard.writeText(text);",
  "const ta = document.createElement('textarea');",
  "ta.value = other;",
].join("\n");

/** CE4 + CE5 同时成立（精准性负对照用）。 */
const BAD_CE4_CE5 = [
  "const pre = document.querySelector('pre');",
  "const other = pre.textContent;",
  "navigator.clipboard.writeText(pre.innerHTML);",
  "const ta = document.createElement('textarea');",
  "ta.value = other;",
].join("\n");

/** CE7：整个文件里没有复制出口。 */
const NO_EXIT = [
  "const pre = document.querySelector('pre');",
  "const text = pre.textContent;",
  "console.log(text);",
].join("\n");

/** CE6：writeText 与 textarea 回退被拆到两个文件。 */
const CE6_CLIP = [
  "const pre = document.querySelector('pre');",
  "const text = pre.textContent;",
  "navigator.clipboard.writeText(text);",
].join("\n");
const CE6_FALLBACK = [
  "const pre = document.querySelector('pre');",
  "const text = pre.textContent;",
  "const ta = document.createElement('textarea');",
  "ta.value = text;",
].join("\n");

/** 绿档：文案字符串里出现 writeText( —— 计数自检不许把它当成调用点。 */
const GOOD_TIP = [
  "const pre = document.querySelector('pre');",
  "const text = pre.textContent;",
  "const tip = '调用 writeText(内容) 复制';",
  "navigator.clipboard.writeText(text);",
].join("\n");

/** 绿档：注释里出现 writeText( —— 剥注释后不许把它当成调用点。 */
const GOOD_COMMENT = [
  "const pre = document.querySelector('pre');",
  "const text = pre.textContent;",
  "// 旧实现：navigator.clipboard.writeText(src.innerHTML)",
  "navigator.clipboard.writeText(text);",
].join("\n");

/** 模板内联脚本块里的正常出口。 */
const TPL_GOOD = [
  "<script>",
  "  const pre = document.querySelector('pre');",
  "  const text = pre.textContent;",
  "  navigator.clipboard.writeText(text);",
  "</script>",
].join("\n");

/** 模板里只有数据块（type=application/ld+json）⇒ 没有可分析的脚本块。 */
const TPL_NO_CODE = [
  '<script type="application/ld+json">',
  '{"@context":"https://schema.org"}',
  "</script>",
].join("\n");

/* ── 夹具构造 ─────────────────────────────────────────────────────────── */

const PKG_GOOD = {
  name: "mh-copy-fixture",
  version: "0.0.0",
  scripts: {
    build: "npm run check:copy",
    "check:copy": "node scripts/check-copy-export.cjs",
  },
};
/** CE9 用：build 链里没有 check:copy ⇒ 门禁自己被卸掉了。 */
const PKG_UNWIRED = {
  name: "mh-copy-fixture",
  version: "0.0.0",
  scripts: {
    build: "node scripts/something-else.cjs",
    "check:copy": "node scripts/check-copy-export.cjs",
  },
};

const fixtures = [];

/**
 * 摆一个夹具站。
 * @param {object} spec
 * @param {object} spec.files      相对夹具根的路径 → 内容
 * @param {object} [spec.pkg]      package.json 内容（默认 PKG_GOOD）
 * @param {number[]} [spec.disable] 要卸掉的判据编号（改一行开关）
 */
function makeFixture(spec) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mh-copy-"));
  fixtures.push(dir);

  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify(spec.pkg || PKG_GOOD, null, 2) + "\n"
  );

  // 门禁副本：按 spec.disable 改对应开关（每条判据一行）
  let src = GATE_SRC;
  for (const n of spec.disable || []) {
    const from = `const CE${n}_ON = true;`;
    const to = `const CE${n}_ON = false;`;
    if (!src.includes(from)) {
      throw new Error(`副本构造失败：门禁源码里找不到开关 ${from}`);
    }
    src = src.replace(from, to);
  }
  fs.writeFileSync(path.join(dir, "scripts", "check-copy-export.cjs"), src);

  for (const [rel, content] of Object.entries(spec.files || {})) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return dir;
}

/** 副本相对门禁原件的差异行数（行数变了返回 -1）。 */
function diffLineCount(a, b) {
  const A = a.split("\n");
  const B = b.split("\n");
  if (A.length !== B.length) return -1;
  let n = 0;
  for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) n++;
  return n;
}

/** 跑夹具里的门禁副本。 */
function runGate(dir, args) {
  const r = spawnSync(
    process.execPath,
    [path.join(dir, "scripts", "check-copy-export.cjs"), ...args],
    { encoding: "utf8", cwd: dir }
  );
  return { code: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

/** 红因编号：只从 stderr 抽，且行首锚定（stdout 里也可能有以"门禁 CE…"开头的说明）。 */
function causesOf(stderr) {
  return [...stderr.matchAll(/^\s*✗\s*门禁 (CE\d+)/gm)].map((m) => m[1]);
}

function sorted(xs) {
  return [...xs].sort();
}

function sameMultiset(a, b) {
  return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
}

/* ── 用例矩阵 ─────────────────────────────────────────────────────────── */

const CASES = [
  /* —— 绿档（5 档）：门禁看着绿，而且必须真的绿 —— */
  {
    id: "G1",
    label: "正常样本：同文件两条复制路径取同一个值",
    mode: "inject",
    target: "src/assets/js/clip.js",
    files: { "src/assets/js/clip.js": GOOD_BOTH },
    expect: "green",
    causes: [],
  },
  {
    id: "G2",
    label: "正常样本：只有剪贴板一条路径（全站无回退 ⇒ 不触发 CE6）",
    mode: "inject",
    target: "src/assets/js/clip.js",
    files: { "src/assets/js/clip.js": GOOD_CLIP_ONLY },
    expect: "green",
    causes: [],
  },
  {
    id: "G3",
    label: "正常样本：模板内联脚本块里的出口",
    mode: "inject",
    target: "src/_includes/paper.njk",
    files: { "src/_includes/paper.njk": TPL_GOOD },
    expect: "green",
    causes: [],
  },
  {
    id: "G4",
    label: "文案字符串里出现 writeText( —— 计数自检不许把它当成调用点",
    mode: "inject",
    target: "src/assets/js/clip.js",
    files: { "src/assets/js/clip.js": GOOD_TIP },
    expect: "green",
    causes: [],
  },
  {
    id: "G5",
    label: "注释里出现 writeText( —— 剥注释后不许把它当成调用点",
    mode: "inject",
    target: "src/assets/js/clip.js",
    files: { "src/assets/js/clip.js": GOOD_COMMENT },
    expect: "green",
    causes: [],
  },

  /* —— 红档（每条判据一档）：红因归属必须纯净 —— */
  {
    id: "CE1",
    label: "扫描面缺失：磁盘 .js 与模板内联脚本块都没有",
    mode: "scan",
    files: { "src/assets/.keep": "" },
    expect: "red",
    causes: ["CE1"],
    expectText: "扫描集合是空的",
  },
  {
    id: "CE2",
    label: "计数自检：源码里的 writeText 调用点数多于门禁认出的出口数",
    mode: "inject",
    target: "src/assets/js/clip.js",
    files: { "src/assets/js/clip.js": BAD_CE2 },
    expect: "red",
    causes: ["CE2"],
    expectText: "处 writeText 调用",
  },
  {
    id: "CE3",
    label: "计数自检：源码里的 textarea 创建点数多于门禁认出的变量数",
    mode: "inject",
    target: "src/assets/js/clip.js",
    files: { "src/assets/js/clip.js": BAD_CE3 },
    expect: "red",
    causes: ["CE3"],
    expectText: "处 textarea 创建",
  },
  {
    id: "CE4",
    label: "取值链：复制出口直接读了 .innerHTML",
    mode: "inject",
    target: "src/assets/js/clip.js",
    files: { "src/assets/js/clip.js": BAD_CE4 },
    expect: "red",
    causes: ["CE4"],
    expectText: "取值表达式直接读了",
  },
  {
    id: "CE5",
    label: "同一单元两条复制路径取的不是同一个值",
    mode: "inject",
    target: "src/assets/js/clip.js",
    files: { "src/assets/js/clip.js": BAD_CE5 },
    expect: "red",
    causes: ["CE5"],
    expectText: "复制出口取的不是同一个值",
  },
  {
    id: "CE6",
    label: "复制出口不自足：writeText 与 textarea 回退被拆到两个文件",
    mode: "scan",
    files: {
      "src/assets/js/clip.js": CE6_CLIP,
      "src/assets/js/fallback.js": CE6_FALLBACK,
    },
    expect: "red",
    causes: ["CE6"],
    expectText: "textarea 回退在别的单元",
  },
  {
    id: "CE7",
    label: "扫描集合里一个复制出口都没有",
    mode: "inject",
    target: "src/assets/js/plain.js",
    files: { "src/assets/js/plain.js": NO_EXIT },
    expect: "red",
    causes: ["CE7"],
    expectText: "找不到任何复制出口",
  },
  {
    id: "CE8a",
    label: "注入前提缺失：目标文件不可读",
    mode: "inject",
    target: "src/assets/js/missing.js",
    files: {},
    expect: "red",
    causes: ["CE8"],
    expectText: "找不到要检查的文件",
  },
  {
    id: "CE8b",
    label: "注入前提缺失：目标模板里没有内联脚本块",
    mode: "inject",
    target: "src/_includes/data.njk",
    files: { "src/_includes/data.njk": TPL_NO_CODE },
    expect: "red",
    causes: ["CE8"],
    expectText: "没有内联 <script> 块",
  },
  {
    id: "CE9",
    label: "门禁自己没被卸掉：build 链里没有 check:copy",
    mode: "scan",
    pkg: PKG_UNWIRED,
    files: { "src/assets/js/clip.js": GOOD_CLIP_ONLY },
    expect: "red",
    causes: ["CE9"],
    expectText: "门禁自己被卸掉了",
  },

  /* —— 判据级负对照（9 档）：卸掉某条判据 ⇒ 对应缺陷档必须转绿 —— */
  {
    id: "N-CE1",
    label: "负对照：卸掉 CE1 ⇒ 扫描面缺失那档转绿",
    mode: "scan",
    disable: [1],
    files: { "src/assets/.keep": "" },
    expect: "green",
    causes: [],
  },
  {
    id: "N-CE2",
    label: "负对照：卸掉 CE2 ⇒ 计数自检那档转绿",
    mode: "inject",
    target: "src/assets/js/clip.js",
    disable: [2],
    files: { "src/assets/js/clip.js": BAD_CE2 },
    expect: "green",
    causes: [],
  },
  {
    id: "N-CE3",
    label: "负对照：卸掉 CE3 ⇒ textarea 计数自检那档转绿",
    mode: "inject",
    target: "src/assets/js/clip.js",
    disable: [3],
    files: { "src/assets/js/clip.js": BAD_CE3 },
    expect: "green",
    causes: [],
  },
  {
    id: "N-CE4",
    label: "负对照：卸掉 CE4 ⇒ 取值链那档转绿",
    mode: "inject",
    target: "src/assets/js/clip.js",
    disable: [4],
    files: { "src/assets/js/clip.js": BAD_CE4 },
    expect: "green",
    causes: [],
  },
  {
    id: "N-CE5",
    label: "负对照：卸掉 CE5 ⇒ 两条路径不同值那档转绿",
    mode: "inject",
    target: "src/assets/js/clip.js",
    disable: [5],
    files: { "src/assets/js/clip.js": BAD_CE5 },
    expect: "green",
    causes: [],
  },
  {
    id: "N-CE6",
    label: "负对照：卸掉 CE6 ⇒ 跨文件拆分那档转绿",
    mode: "scan",
    disable: [6],
    files: {
      "src/assets/js/clip.js": CE6_CLIP,
      "src/assets/js/fallback.js": CE6_FALLBACK,
    },
    expect: "green",
    causes: [],
  },
  {
    id: "N-CE7",
    label: "负对照：卸掉 CE7 ⇒ 没有出口那档转绿",
    mode: "inject",
    target: "src/assets/js/plain.js",
    disable: [7],
    files: { "src/assets/js/plain.js": NO_EXIT },
    expect: "green",
    causes: [],
  },
  {
    id: "N-CE8",
    label: "负对照：卸掉 CE8 ⇒ 注入前提缺失那档转绿",
    mode: "inject",
    target: "src/assets/js/missing.js",
    disable: [8],
    files: {},
    expect: "green",
    causes: [],
  },
  {
    id: "N-CE9",
    label: "负对照：卸掉 CE9 ⇒ 门禁没被卸掉那档转绿",
    mode: "scan",
    pkg: PKG_UNWIRED,
    disable: [9],
    files: { "src/assets/js/clip.js": GOOD_CLIP_ONLY },
    expect: "green",
    causes: [],
  },

  /* —— 精准性负对照：卸 CE5 + 叠加 CE4 ⇒ 只有 CE5 的红因消失，CE4 仍在 —— */
  {
    id: "P-CE4",
    label: "精准性负对照：卸掉 CE5 叠加 CE4 缺陷 ⇒ 只剩 CE4",
    mode: "inject",
    target: "src/assets/js/clip.js",
    disable: [5],
    files: { "src/assets/js/clip.js": BAD_CE4_CE5 },
    expect: "red",
    causes: ["CE4"],
    expectText: "取值表达式直接读了",
  },
];

/* ── 跑矩阵 ───────────────────────────────────────────────────────────── */

let failures = 0;
const covered = new Set();

for (const c of CASES) {
  const dir = makeFixture(c);
  const gateSrc = fs.readFileSync(path.join(dir, "scripts", "check-copy-export.cjs"), "utf8");

  // 副本差异行数必须与声明一致（卸一条判据 = 改一行）
  const declared = (c.disable || []).length;
  const actual = diffLineCount(GATE_SRC, gateSrc);
  if (actual !== declared) {
    console.error(
      `✗ ${c.id}：副本相对门禁原件的差异行数是 ${actual}，声明是 ${declared}`
    );
    failures++;
    continue;
  }

  const args = c.mode === "inject" ? [path.join(dir, c.target)] : [];
  const r = runGate(dir, args);
  const got = causesOf(r.stderr);
  for (const id of got) covered.add(id);

  if (c.expect === "green") {
    if (r.code !== 0) {
      console.error(`✗ ${c.id}（${c.label}）：期望判绿，门禁却 exit ${r.code}`);
      console.error(r.stderr.split("\n").slice(0, 6).join("\n"));
      failures++;
      continue;
    }
    if (got.length !== 0) {
      console.error(
        `✗ ${c.id}（${c.label}）：期望判绿，却出现红因 ${got.join("、")}`
      );
      failures++;
      continue;
    }
  } else {
    if (r.code === 0) {
      console.error(`✗ ${c.id}（${c.label}）：期望判红，门禁却 exit 0`);
      failures++;
      continue;
    }
    if (!sameMultiset(got, c.causes)) {
      console.error(
        `✗ ${c.id}（${c.label}）：红因多重集不符 —— 期望 [${sorted(c.causes).join("、")}]，` +
          `实际 [${sorted(got).join("、")}]`
      );
      failures++;
      continue;
    }
  }

  if (c.expectText && !r.stderr.includes(c.expectText)) {
    console.error(
      `✗ ${c.id}（${c.label}）：红因文案里没命中「${c.expectText}」`
    );
    failures++;
    continue;
  }

  console.log(`  · ${c.id} ${c.label} —— 按预期（${c.expect === "green" ? "判绿" : "红因 " + sorted(got).join("、")}）`);
}

/* ── 覆盖度自证：门禁源码现读的判据编号，每一条都要被至少一档覆盖 ────── */

if (JSON.stringify(GATE_IDS) !== JSON.stringify(EXPECT_IDS)) {
  console.error(
    `✗ 覆盖度自证失败：门禁源码里的判据编号是 [${GATE_IDS.join("、")}]，` +
      `本矩阵认识的是 [${EXPECT_IDS.join("、")}] —— 门禁新加/改号了判据，本矩阵必须补档`
  );
  failures++;
} else {
  const missing = EXPECT_IDS.filter((id) => !covered.has(id));
  if (missing.length) {
    console.error(
      `✗ 覆盖度自证失败：判据 [${missing.join("、")}] 没有任何一档能把它变红 —— ` +
        "覆盖矩阵有空洞"
    );
    failures++;
  }
}

/* ── 门禁原件逐字节未变（自测不许偷偷改门禁） ───────────────────────── */

const GATE_SHA_AFTER = crypto
  .createHash("sha256")
  .update(fs.readFileSync(GATE, "utf8"))
  .digest("hex");
if (GATE_SHA_AFTER !== GATE_SHA) {
  console.error("✗ 门禁原件在本自测跑完前被改动了（sha256 变了）");
  failures++;
}

/* ── 清理夹具 ─────────────────────────────────────────────────────────── */

for (const dir of fixtures) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* 临时目录清不掉不影响判定 */
  }
}

if (failures) {
  console.error(`\nCopy 出口门禁自测失败：${failures} 处不符预期`);
  process.exit(1);
}

console.log(
  `Copy 出口门禁自测通过：${CASES.length} 档全部按预期触发` +
    `（覆盖判据 ${GATE_IDS.join("、")}；含 ${CASES.filter((c) => c.id.startsWith("N-")).length} 档判据级负对照、` +
    `${CASES.filter((c) => c.id.startsWith("P-")).length} 档精准性负对照、1 档覆盖度自证）。`
);
