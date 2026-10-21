#!/usr/bin/env node
/**
 * 页面依赖闭包门禁的**自测**（注入矩阵）—— 证明 LM1–LM5 每一条都**能变红**。
 *
 * 为什么要有这个自测：
 *   一条**永远不会红**的判据，给出的是「看起来很确定的绿」——它比没有判据更坏，
 *   因为它把「盲区」包装成「已核过」。这道门禁判的是**闭包的结构**，
 *   而「注入没生效」（锚点变了、正则没匹配上）恰恰是最容易发生、也最不容易
 *   看出来的失败模式。所以「这条判据结构上能不能触发」必须**被证明**。
 *
 * 做法：把产物目录与源码树**各复制**一份到临时目录，在副本上逐个注入缺陷，
 *   用环境变量把门禁指向副本，断言门禁**确实**报出了对应的那条红因。
 *   ⚠️ 全程**不动仓库里的任何文件** —— 注入必须在副本上做。
 *   （这正是门禁里留 SITE_DIR / METEO_REPO_ROOT 这两个开关的原因：
 *     没有它们，自测就只能去改仓库文件，改坏了就是事故。）
 *
 *   ⚠️ 门禁副本必须与 lib 副本**成对**放在同一个临时目录里
 *     （<tmp>/repo/scripts/check-page-deps.cjs + <tmp>/repo/scripts/lib/page-deps.cjs），
 *     因为门禁里的 require("./lib/page-deps.cjs") 是**相对门禁文件**解析的 ——
 *     只有这样，改 lib 副本才会真的改到门禁看到的那一份。
 *
 * 八档：
 *   LT0 基线（原样）                → 必须**全绿**（证明这套判据不是空跑）
 *   LT1 删掉一条 <!-- source: -->   → LM3（覆盖度自证：这条 URL 对不上源文件）
 *   LT2 闭包退化成「只看自己」      → LM1（把 lib 副本的 directDeps 改成永远返回空）
 *   LT3 source 指向不存在的文件     → LM2①（闭包里有「引用了但不存在」的项）
 *   LT4 include 写成变量形式        → LM2②（扫描器看不见 ⇒ 闭包不可信 ⇒ 少报）
 *   LT5 全局数据变量扫不出来        → LM4（把 lib 副本的 wordHas 改成恒假）
 *   LT6 新增一个没登记的 addGlobalData → LM5（全局数据登记漏了 ⇒ 少报）
 *   LT7 **负对照**：把门禁副本的三条判据调到最松，重跑 LT2 / LT5 的注入
 *     → 必须**判绿**。若仍判红，说明 LT2/LT5 的红来自别的什么，
 *     那两档的断言就没有指向 LM1 / LM4。
 *
 * 用法：node scripts/test-page-deps.cjs
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(ROOT, "scripts/check-page-deps.cjs");
const SITE = path.join(ROOT, "_site");
const CONFIG = path.join(ROOT, "eleventy.config.js");

for (const [label, p] of [
  ["scripts/check-page-deps.cjs", GATE],
  ["_site/", SITE],
  ["eleventy.config.js", CONFIG],
]) {
  if (!fs.existsSync(p)) {
    console.error(`页面依赖闭包自测失败：找不到 ${label}（${p}）。`);
    process.exit(1);
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mh-pagedeps-selftest-"));

/* ---------- 副本搭建 ---------- */

/** 复制产物目录 → 临时目录 */
function copySite() {
  const dir = fs.mkdtempSync(path.join(tmp, "site-"));
  fs.cpSync(SITE, dir, { recursive: true });
  return dir;
}

/** 复制源码树骨架 → 临时目录（门禁副本 + lib 副本 + src + 构建配置） */
function copyRepo() {
  const dir = fs.mkdtempSync(path.join(tmp, "repo-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.cpSync(path.join(ROOT, "src"), path.join(dir, "src"), { recursive: true });
  fs.cpSync(path.join(ROOT, "scripts/lib"), path.join(dir, "scripts/lib"), { recursive: true });
  fs.copyFileSync(CONFIG, path.join(dir, "eleventy.config.js"));
  fs.copyFileSync(GATE, path.join(dir, "scripts/check-page-deps.cjs"));
  return dir;
}

/* ---------- 注入工具 ---------- */

/** 改文件；锚点不存在就抛错（坏跑必须当场暴露，不能记成「测过了」） */
function patchFile(file, from, to) {
  const before = fs.readFileSync(file, "utf8");
  if (!before.includes(from)) throw new Error(`注入锚点不存在：${from}`);
  const after = before.replace(from, to);
  if (after === before) throw new Error(`注入没有改变任何内容：${from}`);
  fs.writeFileSync(file, after);
}

/* ---------- 跑门禁 ---------- */

/**
 * 在副本上注入 → 跑门禁副本 → 返回 {code, out}
 * mutate 收到 { siteDir, repoDir }，在里面改副本。
 */
function run(mutate) {
  const siteDir = copySite();
  const repoDir = copyRepo();
  if (mutate) mutate({ siteDir, repoDir });
  const r = spawnSync(process.execPath, [path.join(repoDir, "scripts/check-page-deps.cjs")], {
    env: { ...process.env, SITE_DIR: siteDir, METEO_REPO_ROOT: repoDir },
    encoding: "utf8",
  });
  return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
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
    console.log(r.out.split("\n").filter((l) => l.includes("✗")).join("\n"));
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

/* ---------- 注入矩阵 ---------- */
console.log("页面依赖闭包门禁 · 本地注入矩阵：\n");

expectGreen("LT0 基线（原样）", null);

expectRed(
  "LT1 删掉一条 <!-- source: --> 标注",
  ({ siteDir }) => {
    const file = path.join(siteDir, "sitemap.xml");
    const before = fs.readFileSync(file, "utf8");
    const after = before.replace(/<!--\s*source:[^>]*-->\s*/, "");
    if (after === before) throw new Error("注入锚点不存在：sitemap 里的 source 标注");
    fs.writeFileSync(file, after);
  },
  "没有 <!-- source: --> 标注"
);

expectRed(
  "LT2 闭包退化成「只看自己」（lib 副本的 directDeps 永远返回空）",
  ({ repoDir }) => {
    // 这就是 D34 的病根形态：页面内容明明由别的文件提供，闭包却只看自己。
    // 注意改的是 **lib 副本** —— 门禁副本 require 的是同一份副本，所以它真的生效。
    patchFile(
      path.join(repoDir, "scripts/lib/page-deps.cjs"),
      "function directDeps(rel) {",
      "function directDeps(rel) {\n    if (rel) return [];"
    );
  },
  "依赖闭包只有"
);

expectRed(
  "LT3 source 标注指向不存在的文件",
  ({ siteDir }) => {
    const file = path.join(siteDir, "sitemap.xml");
    patchFile(file, "<!-- source: src/index.njk -->", "<!-- source: src/index-not-here.njk -->");
  },
  "依赖闭包里引用了不存在的文件"
);

expectRed(
  "LT4 include 写成变量形式（扫描器看不见 ⇒ 闭包会漏收）",
  ({ repoDir }) => {
    patchFile(
      path.join(repoDir, "src/index.njk"),
      '{% include "partials/hero.njk"',
      "{% include heroPartial"
    );
  },
  "目标不是字面量"
);

expectRed(
  "LT5 全局数据变量扫不出来（lib 副本的 wordHas 恒假）",
  ({ repoDir }) => {
    patchFile(
      path.join(repoDir, "scripts/lib/page-deps.cjs"),
      "function wordHas(text, name) {",
      "function wordHas(text, name) {\n  return false;"
    );
  },
  "不在这一页的依赖闭包里"
);

expectRed(
  "LT6 新增一个没登记的 addGlobalData",
  ({ repoDir }) => {
    patchFile(
      path.join(repoDir, "eleventy.config.js"),
      'eleventyConfig.addGlobalData("aboutHtml", () => {',
      'eleventyConfig.addGlobalData("brandNewGlobal", () => "x");\n  eleventyConfig.addGlobalData("aboutHtml", () => {'
    );
  },
  "没有登记它"
);

/* ---------- LT7 负对照 ---------- */
/* 把门禁副本的三条判据调到最松：
     闭包下限 2 → 1（LM1 不再报「闭包太小」）
     特征串上限 3 → 0（LM4 拿不到任何特征串）
     命中下限 1 → 0（LM4 的空跑检查也不报）
   然后重跑 LT2 与 LT5 的注入 —— 门禁**必须判绿**。
   若仍判红，说明 LT2/LT5 的红不是来自这两条判据，那两档的断言就没有指向
   LM1 / LM4，自测本身是坏的。 */
function weakenGate(repoDir) {
  const file = path.join(repoDir, "scripts/check-page-deps.cjs");
  patchFile(file, "const MIN_CLOSURE_FILES = 2;", "const MIN_CLOSURE_FILES = 1;");
  patchFile(file, "const FEATURE_STRING_LIMIT = 3;", "const FEATURE_STRING_LIMIT = 0;");
  patchFile(file, "const MIN_FEATURE_EVIDENCE = 1;", "const MIN_FEATURE_EVIDENCE = 0;");
}

expectGreen(
  "LT7 负对照：门禁三条判据调到最松 + LT2 的注入（闭包退化）",
  ({ repoDir }) => {
    weakenGate(repoDir);
    patchFile(
      path.join(repoDir, "scripts/lib/page-deps.cjs"),
      "function directDeps(rel) {",
      "function directDeps(rel) {\n    if (rel) return [];"
    );
  }
);

expectGreen(
  "LT7 负对照：门禁三条判据调到最松 + LT5 的注入（数据变量扫不出）",
  ({ repoDir }) => {
    weakenGate(repoDir);
    patchFile(
      path.join(repoDir, "scripts/lib/page-deps.cjs"),
      "function wordHas(text, name) {",
      "function wordHas(text, name) {\n  return false;"
    );
  }
);

/* ---------- 收尾 ---------- */
if (failed) {
  console.error(`\n页面依赖闭包门禁自测**未通过**：${failed} 项不符预期。`);
  process.exit(1);
}
console.log(
  "\n注入矩阵通过：8 档全部符合预期（基线绿；覆盖度、闭包退化、闭包缺文件、字面量、" +
    "数据变量、登记漏项各自判红；LT7 是**负对照**——把门禁的判据调到最松后，" +
    "LT2/LT5 的注入不再被判红，证明这两档的红确实来自 LM1/LM4 本身）。"
);
