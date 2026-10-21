#!/usr/bin/env node
/**
 * 门禁 A8「底色 token 必须跨主题压暗」的**本地夹具自测**（注入矩阵）
 * —— 证明这条判据结构上**能变红**，而不是永远绿着。
 *
 * 为什么要有这个自测（缺陷清单 D25 的配套）：
 *   D25 修的缺陷是「暗色主题下论文精读页的 Key Points 三条要点完全读不出来」
 *   （实测对比度 1.03:1，AA 要 4.5:1）。根因是 tokens.css 的暗色段
 *   **漏重映射了 --color-accent-50** —— 一个被当作底色用的色阶 token，
 *   跨主题没有跟着翻档，于是亮奶白底原样留在暗色页面上。
 *   这条判据的危险在于它**极易整条失效而不露痕迹**：
 *   阈值调错、"亮底档"的定义写歪、token 收集规则漏了一种写法 ——
 *   这三种情况都会让门禁**一直绿**，而"绿"读起来完全像在工作。
 *   它守的恰恰是「暗色页面上读者看不看得见字」，是最该有牙齿的判据。
 *   ⇒ 「这条判据结构上能不能触发」必须**被证明**，不能靠人记得。
 *
 * 做法：把 tokens.css 与源码 CSS **复制到临时目录**，在副本上注入缺陷形态，
 *   用环境变量把门禁指向副本，逐档断言门禁的红绿与红因内容。
 *   ⚠️ 注入**只在副本上**做，全程**不动仓库里的任何文件**；
 *     最后按 SHA-256 校验门禁原件与真实 tokens.css 都没被动过。
 *
 * 五档：
 *   C0 基线（真实 tokens.css 原样）⇒ 必须**全绿**（不许误报）
 *   C1 真实缺陷形态（把 accent-50 的暗色重映射删掉）⇒ 必须**判红**，
 *      且红因**点名 --color-accent-50**、且**只有** A8 这一条
 *   C2 新增一个亮底 token、暗色**没有**重映射 ⇒ 判红并点名它
 *   C3 同一个 token、暗色**重映射了但仍是亮值** ⇒ 判红并点名它
 *      （红因要区别于 C2 —— 是"压暗后仍比页面底色亮"，不是"没重映射"）
 *   C4 同一个 token、暗色重映射成**真暗值** ⇒ 必须**转绿**（判据不许误报）
 *   C5 真身校验 ⇒ 门禁原件与真实 tokens.css 按 SHA-256 校验没被动过
 *
 * 用法：node scripts/test-a11y-contrast.cjs
 *   （已接进 npm run build，见 package.json 的 check:a11y-contrast-selftest）
 */
const { spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-a11y.cjs");
const REAL_TOKENS = path.join(ROOT, "src", "assets", "css", "tokens.css");
const REAL_CSS_DIR = path.join(ROOT, "src", "assets", "css");

let failures = 0;
function ok(label, detail) {
  console.log(`  ✓ ${label}${detail ? `  ${detail}` : ""}`);
}
function bad(label, detail) {
  failures++;
  console.log(`  ✗ ${label}${detail ? `  ${detail}` : ""}`);
}
function assert(cond, label, detail) {
  cond ? ok(label, detail) : bad(label, detail);
}

if (!fs.existsSync(GATE)) {
  console.error(`A8 自测失败：找不到门禁 ${GATE}`);
  process.exit(1);
}

const sha256 = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const GATE_SHA_BEFORE = sha256(GATE);
const TOKENS_SHA_BEFORE = sha256(REAL_TOKENS);

/* ---------- 夹具 ---------- */

/** 递归复制目录（只复制副本，仓库原件不动） */
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, e.name);
    const d = path.join(to, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

/**
 * 最小可用的产物夹具页。
 * 门禁 A2/A3/A5/A6/A7 也要跑：A2 的五个正文容器一个都不放（走源码级兜底），
 * A3/A5 没有对应实例，A6/A7 只要一个 h1 且 id 唯一 —— 这页足够。
 */
const FIXTURE_HTML = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>A8 contrast selftest</title></head>
<body>
<main class="fixture-page">
<h1>A8 contrast selftest</h1>
<p>Fixture page for the theme-surface judgment self-test.</p>
</main>
</body>
</html>
`;

/** 注入用的测试 token 名（刻意取一个仓库里不存在的名字） */
const TEST_TOKEN = "color-selftest-50";
const TEST_LIGHT = "#fffefd"; // 亮底（浅色主题）
const TEST_DARK_BRIGHT = "#fffefd"; // 暗色里**仍是**亮值
const TEST_DARK_OK = "#1a1a1a"; // 暗色里真的压暗了

/** 往浅色 :root 块里加一条声明 */
function injectLight(tokens, decl) {
  const re = /^([ \t]*)--color-accent-50:[ \t]*#fff3eb;.*$/m;
  if (!re.test(tokens)) throw new Error("浅色 :root 里找不到 --color-accent-50 锚点");
  return tokens.replace(re, (m, ind) => `${m}\n${ind}${decl}`);
}

/** 往两处暗色块里加一条声明（两处都要加 —— 否则 A1 的零漂移会先炸） */
function injectDark(tokens, decl) {
  const re = /^([ \t]*)--color-accent-50:[ \t]*#2a1408;.*$/gm;
  let n = 0;
  const out = tokens.replace(re, (m, ind) => {
    n++;
    return `${m}\n${ind}${decl}`;
  });
  if (n !== 2) throw new Error(`暗色块锚点找到 ${n} 处（应为 2 处）`);
  return out;
}

/** 把两处暗色块里的 accent-50 重映射删掉 —— 这就是 D25 的缺陷形态 */
function removeDarkAccent50(tokens) {
  const re = /^[ \t]*--color-accent-50:[ \t]*#2a1408;[ \t]*\r?\n/gm;
  const out = tokens.replace(re, "");
  if (out === tokens) throw new Error("没找到可删的 --color-accent-50 暗色重映射");
  return out;
}

/** 从门禁输出里抽出 A8 的红因（note 行以「· 」开头，红因行没有） */
function a8Reasons(out) {
  return out.split("\n").filter((l) => l.includes("门禁 A8：") && !l.includes("·"));
}

function runGate(tokensPath, srcDir, siteDir) {
  const r = spawnSync(process.execPath, [GATE], {
    cwd: ROOT,
    env: {
      ...process.env,
      SITE_DIR: siteDir,
      A11Y_TOKENS_CSS: tokensPath,
      A11Y_SRC_DIR: srcDir,
    },
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return { code: r.status, out: `${r.stdout || ""}\n${r.stderr || ""}` };
}

/* ---------- 主流程 ---------- */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mh-a11y-contrast-selftest-"));
try {
  const siteDir = path.join(tmp, "site");
  fs.mkdirSync(siteDir);
  fs.writeFileSync(path.join(siteDir, "index.html"), FIXTURE_HTML);

  const srcDir = path.join(tmp, "src");
  copyDir(REAL_CSS_DIR, path.join(srcDir, "assets", "css"));
  /* 夹具自己的 CSS：让测试 token 真的被当作底色用 */
  fs.writeFileSync(
    path.join(srcDir, "assets", "css", "_selftest-fixture.css"),
    `/* 自测夹具：让 --color-selftest-50 真的被当作底色用 */\n` +
      `.selftest-surface { background: var(--${TEST_TOKEN}); }\n`
  );

  const tokensPath = path.join(tmp, "tokens.css");
  const real = fs.readFileSync(REAL_TOKENS, "utf8");

  /* ---------- C0 基线：真实 tokens.css 原样 ⇒ 必须全绿 ---------- */
  fs.writeFileSync(tokensPath, real);
  const c0 = runGate(tokensPath, srcDir, siteDir);
  assert(
    c0.code === 0,
    "C0 基线（真实 tokens.css 原样）判绿",
    `exit=${c0.code}${c0.code === 0 ? "" : ` —— ${c0.out.split("\n").slice(-6).join(" | ")}`}`
  );
  assert(
    a8Reasons(c0.out).length === 0,
    "C0 基线没有 A8 红因（判据不误报）",
    `${a8Reasons(c0.out).length} 条`
  );

  /* ---------- C1 真实缺陷形态：删掉 accent-50 的暗色重映射 ---------- */
  fs.writeFileSync(tokensPath, removeDarkAccent50(real));
  const c1 = runGate(tokensPath, srcDir, siteDir);
  const r1 = a8Reasons(c1.out);
  assert(c1.code === 1, "C1 缺陷形态（accent-50 暗色未重映射）判红", `exit=${c1.code}`);
  assert(
    r1.some((l) => l.includes("--color-accent-50")),
    "C1 红因点名了 --color-accent-50",
    r1[0] ? r1[0].trim().slice(0, 96) : "（没有 A8 红因）"
  );
  assert(
    r1.length === 1,
    "C1 的红因只有 A8 这一条（没混进别的判据）",
    r1.length ? `${r1.length} 条` : "0 条"
  );

  /* ---------- C2 新增亮底 token、暗色没有重映射 ---------- */
  fs.writeFileSync(
    tokensPath,
    injectLight(real, `--${TEST_TOKEN}: ${TEST_LIGHT};`)
  );
  const c2 = runGate(tokensPath, srcDir, siteDir);
  const r2 = a8Reasons(c2.out);
  assert(c2.code === 1, "C2 亮底 token 暗色未重映射 ⇒ 判红", `exit=${c2.code}`);
  assert(
    r2.some((l) => l.includes(`--${TEST_TOKEN}`) && l.includes("没有重映射")),
    "C2 红因点名了该 token，并说清是「没有重映射」",
    r2[0] ? r2[0].trim().slice(0, 96) : "（没有 A8 红因）"
  );

  /* ---------- C3 暗色重映射了、但仍是亮值 ---------- */
  fs.writeFileSync(
    tokensPath,
    injectDark(injectLight(real, `--${TEST_TOKEN}: ${TEST_LIGHT};`), `--${TEST_TOKEN}: ${TEST_DARK_BRIGHT};`)
  );
  const c3 = runGate(tokensPath, srcDir, siteDir);
  const r3 = a8Reasons(c3.out);
  assert(c3.code === 1, "C3 暗色重映射了但仍是亮底 ⇒ 判红", `exit=${c3.code}`);
  assert(
    r3.some((l) => l.includes(`--${TEST_TOKEN}`) && l.includes("仍比该主题的页面底色")),
    "C3 红因点名了该 token，并说清是「压暗后仍比页面底色亮」",
    r3[0] ? r3[0].trim().slice(0, 96) : "（没有 A8 红因）"
  );

  /* ---------- C4 暗色重映射成真暗值 ⇒ 必须转绿 ---------- */
  fs.writeFileSync(
    tokensPath,
    injectDark(injectLight(real, `--${TEST_TOKEN}: ${TEST_LIGHT};`), `--${TEST_TOKEN}: ${TEST_DARK_OK};`)
  );
  const c4 = runGate(tokensPath, srcDir, siteDir);
  assert(
    c4.code === 0,
    "C4 暗色真的压暗了 ⇒ 判据不许误报",
    `exit=${c4.code}${c4.code === 0 ? "" : ` —— ${c4.out.split("\n").slice(-6).join(" | ")}`}`
  );
  assert(
    !a8Reasons(c4.out).some((l) => l.includes(`--${TEST_TOKEN}`)),
    "C4 没有关于该 token 的 A8 红因",
    `${a8Reasons(c4.out).filter((l) => l.includes(TEST_TOKEN)).length} 条`
  );

  /* ---------- C5 真身校验 ---------- */
  assert(
    sha256(GATE) === GATE_SHA_BEFORE,
    "C5 门禁原件按 SHA-256 校验没被动过（注入全程只在副本上）",
    `${GATE_SHA_BEFORE.slice(0, 12)}…`
  );
  assert(
    sha256(REAL_TOKENS) === TOKENS_SHA_BEFORE,
    "C5 真实 tokens.css 按 SHA-256 校验没被动过",
    `${TOKENS_SHA_BEFORE.slice(0, 12)}…`
  );
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures) {
  console.error(`\n✗ A8 自测未通过：${failures} 项红。\n`);
  process.exit(1);
}
console.log("\n✓ A8 自测通过：底色 token 跨主题压暗这条判据证明了能变红。");
process.exit(0);
