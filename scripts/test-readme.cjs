#!/usr/bin/env node
/**
 * README 事实核对门禁的**自测**（注入矩阵）—— 证明 RD1–RD5 每一条都**能变红**。
 *
 * 为什么要有这个自测：
 *   一条**永远不会红**的判据，给出的是"看起来很确定的绿"——它比没有判据更坏，
 *   因为它把"盲区"包装成"已核过"。本仓已经吃过好几次这种亏
 *   （遮罩把目标文本本身吃掉、覆盖度只覆盖一半还照样打印"通过"）。
 *   所以"这条判据结构上能不能触发"本身必须**被证明**，而不是假定。
 *
 * 做法：把 README **复制**一份到临时目录，在副本上逐个注入缺陷，
 *   用 `README_PATH` 环境变量把门禁指向副本，然后断言门禁**确实**报出了
 *   对应的那条红因。
 *   ⚠️ 全程**不动仓库里真的那份 README** —— 注入必须在副本上做。
 *   （这正是门禁里加 `README_PATH` 这个开关的原因：没有它，自测就只能去改
 *     仓库文件，改坏了就是事故。）
 *
 * 六档：
 *   M0 基线（原样）           → 必须**全绿**（证明这套判据不是空跑）
 *   M1 README 写了一个不存在的路由 → RD1
 *   M2 README 的 Node 下限低于 package.json → RD2
 *   M3 README 漏掉了一个命令   → RD3
 *   M4 README 漏掉了一个对外出口 → RD4
 *   M5 判据自身失效（一个路由都认不出）→ RD5
 *
 * 用法：node scripts/test-readme.cjs
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-readme.cjs");
const README = path.join(ROOT, "README.md");

if (!fs.existsSync(README)) {
  console.error("README 自测失败：找不到 README.md。");
  process.exit(1);
}
if (!fs.existsSync(path.join(ROOT, "_site", "index.html"))) {
  console.error("README 自测失败：找不到 _site/index.html，请先运行 npm run build。");
  process.exit(1);
}

const original = fs.readFileSync(README, "utf8");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mh-readme-selftest-"));
const copyPath = path.join(tmp, "README.md");

/** 在副本上注入 → 跑门禁 → 返回 {code, out} */
function run(mutate) {
  let text = original;
  if (mutate) {
    const next = mutate(text);
    if (next === text) throw new Error("注入没有改变内容 —— 锚点不存在，这一档是坏跑");
    text = next;
  }
  fs.writeFileSync(copyPath, text);
  const r = spawnSync(process.execPath, [GATE], {
    env: { ...process.env, README_PATH: copyPath },
    encoding: "utf8",
  });
  return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
}

/** 替换一次；锚点不存在就抛错（坏跑必须当场暴露，不能记成"测过了"）。 */
function replaceOnce(text, from, to) {
  if (!text.includes(from)) throw new Error(`注入锚点不存在：找不到「${from}」`);
  const out = text.replace(from, to);
  if (out === text) throw new Error(`注入没有改变内容：「${from}」`);
  return out;
}

/** 替换**全部**出现；一个都没换到就抛错。
 *  为什么需要"全部"：M3 要证明"漏掉一个命令"能被抓到，而命令名在 README 里
 *  可能出现**多次**（表格里一次、正文里一次）——只改一处的话，名字还在，
 *  RD3 本来就该绿，那一档就变成了"坏跑"而不是"判据没触发"。 */
function replaceAll(text, from, to) {
  if (!text.includes(from)) throw new Error(`注入锚点不存在：找不到「${from}」`);
  const out = text.split(from).join(to);
  if (out === text) throw new Error(`注入没有改变内容：「${from}」`);
  return out;
}

const cases = [];

/* M0 基线 */
const m0 = run(null);
cases.push(["M0 基线（原样 README）", m0.code === 0, m0.out.trim().split("\n").slice(-1)[0]]);

/* M1：写一个不存在的路由
 *   ⚠️ 注入行里**不能出现**任何"未实现"标记词 —— 否则那一行会被
 *      "规划中的路径"豁免掉，注入自己把自己遮住了（第一版就这么坏跑过）。 */
const m1 = run((t) =>
  replaceOnce(t, "| 博客 | `/blog/` |", "| 旧归档 | `/portfolio-archive/` | 往年的项目 |")
);
cases.push([
  "M1 README 写了不存在的路由",
  m1.code === 1 && m1.out.includes("RD1") && m1.out.includes("/portfolio-archive/"),
  m1.out.trim().split("\n").slice(-1)[0],
]);

/* M2：Node 下限低于 package.json */
const m2 = run((t) => replaceOnce(t, "需要 **Node ≥ 22**", "需要 **Node ≥ 18**"));
cases.push([
  "M2 README 的 Node 下限低于 package.json",
  m2.code === 1 && m2.out.includes("RD2"),
  m2.out.trim().split("\n").slice(-1)[0],
]);

/* M3：漏掉一个命令（要**全部**换掉，否则名字还在，RD3 本来就该绿） */
const m3 = run((t) => replaceAll(t, "check:citation-cff", "check:citation-xxx"));
cases.push([
  "M3 README 漏掉了一个命令",
  m3.code === 1 && m3.out.includes("RD3") && m3.out.includes("check:citation-cff"),
  m3.out.trim().split("\n").slice(-1)[0],
]);

/* M4：漏掉一个对外出口 */
const m4 = run((t) => replaceOnce(t, "| BibTeX | `/publications.bib` |", "| BibTeX | `/publications-x.bib` |"));
cases.push([
  "M4 README 漏掉了一个对外出口",
  m4.code === 1 && m4.out.includes("RD4") && m4.out.includes("publications.bib"),
  m4.out.trim().split("\n").slice(-1)[0],
]);

/* M5：判据自身失效（把 README 里的路径全部改成认不出的形态） */
const m5 = run((t) => t.replace(/\/[A-Za-z0-9._~%+-]+/g, ""));
cases.push([
  "M5 判据自身失效（一个路径都认不出）",
  m5.code === 1 && m5.out.includes("RD5"),
  m5.out.trim().split("\n").slice(-1)[0],
]);

/* ---------- 汇总 ---------- */
let failed = 0;
console.log("README 事实核对门禁 · 本地注入矩阵：\n");
for (const [label, ok, detail] of cases) {
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  if (!ok) {
    failed++;
    console.log(`      详情：${detail}`);
  }
}
fs.rmSync(tmp, { recursive: true, force: true });

if (failed) {
  console.error(`\n自测失败：${failed} 档没有按预期触发。\n`);
  process.exit(1);
}
console.log(`\n自测通过：${cases.length} 档全部按预期触发。\n`);
