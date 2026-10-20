#!/usr/bin/env node
/**
 * 404 页路径深度门禁的**自测**（注入矩阵）—— 证明 E1–E3 每一条都**能变红**。
 *
 * 为什么要有这个自测：
 *   一条**永远不会红**的判据，给出的是"看起来很确定的绿"——它比没有判据更坏，
 *   因为它把"盲区"包装成"已核过"。这道门禁判的是**产物里的 URL 形态**，
 *   而"注入没生效"（正则没匹配上、属性名写错、锚点不存在）恰恰是最容易发生、
 *   也最不容易看出来的失败模式。所以"这条判据结构上能不能触发"必须**被证明**。
 *
 * 做法：把 404 产物与一份普通页面的产物**各复制**一份到临时目录，
 *   在副本上逐个注入缺陷，用 SITE_DIR 把门禁指向副本，
 *   断言门禁**确实**报出了对应的那条红因。
 *   ⚠️ 全程**不动仓库里的任何文件** —— 注入必须在副本上做。
 *     （这正是门禁里留 SITE_DIR 这个开关的原因：没有它，自测就只能去改仓库文件，
 *       改坏了就是事故，也会和并发的 build 抢同一个 _site 目录。）
 *
 * 四档：
 *   N0 基线（原样）                → 必须**全绿**（证明这套判据不是空跑）
 *   N1 把 404 某个 CSS 改回相对   → E1
 *   N2 把 404 的站内链接删光       → E2
 *   N3 把普通页面某个链接改根绝对  → E3
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

const original = {
  html404: fs.readFileSync(SITE_404, "utf8"),
  htmlHome: fs.readFileSync(SITE_HOME, "utf8"),
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mh-404depth-selftest-"));

/**
 * 在副本上注入 → 跑门禁 → 返回 {code, out}。
 * 每次跑都用**独立的产物目录**，避免上一档的残留影响下一档。
 */
function run(mutate) {
  const siteDir = fs.mkdtempSync(path.join(tmp, "site-"));
  const parts = { ...original };
  if (mutate) {
    const next = mutate(parts);
    if (!next) throw new Error("注入没有改变任何内容 —— 锚点不存在，这一档是坏跑");
    Object.assign(parts, next);
  }
  fs.writeFileSync(path.join(siteDir, "404.html"), parts.html404);
  fs.writeFileSync(path.join(siteDir, "index.html"), parts.htmlHome);

  const r = spawnSync(process.execPath, [GATE], {
    env: { ...process.env, SITE_DIR: siteDir },
    encoding: "utf8",
  });
  return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
}

/** 替换一次；锚点不存在就抛错（坏跑必须当场暴露，不能记成"测过了"）。 */
function replaceOnce(text, from, to) {
  if (!text.includes(from)) throw new Error(`注入锚点不存在：找不到「${from}」`);
  return text.replace(from, to);
}

let failed = 0;

function expectRed(label, mutate, expect) {
  let r;
  try {
    r = run(mutate);
  } catch (e) {
    console.log(`  ✗ ${label} → 注入本身坏了：${e.message}`);
    failed += 1;
    return;
  }
  if (r.code !== 1) {
    console.log(`  ✗ ${label} → 期望判红（exit 1），实测 exit ${r.code}`);
    failed += 1;
    return;
  }
  if (!r.out.includes(expect)) {
    console.log(`  ✗ ${label} → 判红了，但红因里没有「${expect}」`);
    console.log(r.out.split("\n").filter((l) => l.includes("✗")).join("\n"));
    failed += 1;
    return;
  }
  console.log(`  ✓ ${label} → 判红 exit 1，红因命中「${expect}」`);
}

function expectGreen(label, mutate) {
  let r;
  try {
    r = run(mutate);
  } catch (e) {
    console.log(`  ✗ ${label} → 注入本身坏了：${e.message}`);
    failed += 1;
    return;
  }
  if (r.code !== 0) {
    console.log(`  ✗ ${label} → 期望判绿（exit 0），实测 exit ${r.code}`);
    console.log(r.out.split("\n").filter((l) => l.includes("✗")).join("\n"));
    failed += 1;
    return;
  }
  console.log(`  ✓ ${label} → 判绿 exit 0`);
}

/* ---------- 矩阵 ---------- */
console.log("404 页路径深度门禁 · 本地注入矩阵：\n");

expectGreen("N0 基线（原样）", null);

// N1：把 404 页某个样式表改回相对路径 ⇒ E1
expectRed(
  "N1 404 某个 CSS 改回相对路径",
  (p) => ({
    html404: replaceOnce(
      p.html404,
      'href="/assets/css/components.css"',
      'href="assets/css/components.css"'
    ),
  }),
  "E1"
);

// N2：把 404 页的站内链接"挪到站外" ⇒ 站内 URL 数量掉到阈值以下 ⇒ E2
// （注意：全部改成**站外绝对地址**，而不是改回相对路径 ——
//   否则 E1 会先判红，就测不到 E2 了。这一档要单独证明 E2 自己能变红。）
expectRed(
  "N2 404 的站内链接挪到站外（数量掉到阈值下）",
  (p) => {
    const re = /(?:href|src)="\/(?!\/)[^"]*"/g;
    const before = (p.html404.match(re) || []).length;
    if (before < 8) throw new Error("404 页的站内 URL 本来就不足 8 个，注入前提不成立");
    return { html404: p.html404.replace(re, 'href="https://example.invalid/removed"') };
  },
  "E2"
);

// N3：把普通页面某个链接改成根绝对 ⇒ E3
expectRed(
  "N3 普通页面链接改根绝对",
  (p) => ({
    htmlHome: replaceOnce(
      p.htmlHome,
      'href="assets/css/components.css"',
      'href="/assets/css/components.css"'
    ),
  }),
  "E3"
);

/* ---------- 汇总 ---------- */
if (failed) {
  console.error(`\n404 页路径深度自测：${failed} 档未通过。`);
  process.exit(1);
}
console.log("\n404 页路径深度自测：4 档全部符合预期（E1–E3 都能变红，基线是绿的）。");
