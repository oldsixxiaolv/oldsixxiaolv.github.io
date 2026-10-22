#!/usr/bin/env node
/**
 * CSS 括号平衡检查。
 *
 * 为什么需要它：这个项目已经被"少一个花括号"坑过两次——
 *   1. layout.css 少一个 } → 后面 18 条规则被静默吞掉，页面看着"就是没样式"
 *   2. pages.css 改 .home-hero__title 时同样漏了 } → 整个 hero 之后的
 *      版式（按钮、FIELD NOTE 贴纸、人像卡）全部失效
 * 两次都是**静默**的：构建不报错、控制台无 error、HTTP 全部 200，
 * 只有肉眼看截图才发现。所以必须在构建阶段就拦住。
 *
 * 为什么不能用现成工具：这个项目没装 stylelint/postcss，也不打算为一个
 * 括号计数器引入依赖树。CSS 的花括号配对足够简单，几十行就能覆盖，
 * 而且不引入依赖就不会有依赖自身的版本问题。
 *
 * 计数前先剥掉注释：注释里出现 { 或 }（本项目的注释大量举例 CSS 片段）
 * 会造成假阳性。同时跳过字符串字面量与 url(...) 里的内容（资源路径与
 * data URI —— 未加引号的 url(data:…) 里也可能有 { ，那是资源内容不是规则结构）。
 *
 * ================= 判据清单（编号 CB*，2026-10-21 D59 第六批） =================
 *   CB1 **括号不平衡** —— 少一个 } / 多一个 } / 多余的 }（depth 与 minDepth 都要查）。
 *   CB2 **扫描面为空** —— src/assets/css 下一张样式表都扫不到 ⇒ 门禁没有判断对象
 *      （空跑）⇒ 判红。补之前扫到 0 个文件时门禁会打印「通过（0 个文件）」并 exit 0
 *      —— 目录一旦改名或被清空，这道护栏就**静默地不再护栏**，而 build 照样全绿
 *      （"空跑的门禁等于没有门禁"这一族）。
 *   CB3 **遮罩自证** —— 「剥注释 / 剥字符串 / 剥 url(...)」这三件事本身必须有效：
 *      合成样例里注释、字符串、url() 里的 { 必须都被跳过。任何一条不成立 ⇒ 判红。
 *      为什么要有它：遮罩一旦失效，门禁会把**不该计入的** { 当成规则结构（假阳性），
 *      或反过来把**该计入的**吃掉（漏报）—— 而这两种失效**都不会**让门禁自己变红，
 *      只会让它安静地给出错的结论（一条永远不会红的判据给出看起来很确定的绿）。
 *   CB4 **门禁自己没被卸掉** —— package.json 的 build 链里必须真的有本门禁。
 *      做法沿用 check-dead-css 的 DZ3：沿 `npm run` 链从 build 往下走，
 *      凡是指向 scripts/check-css-braces.cjs 的 script 都算「还接着」。
 *   ⚠️ `CB` 前缀全仓此前零占用 ⇒ 首次编号化，无外部引用需要连带更新。
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const CSS_DIR = path.join(REPO, "src", "assets", "css");
const PKG = path.join(REPO, "package.json");
const SELF = path.basename(__filename);

/* 判据开关：存在的唯一理由是自测的负对照要把某一条判据**单独**卸掉，
   证明「那一档的红确实来自这一条判据本身」。默认值恒为 true。
   ⚠️ 开关只包住 fail()：**计算无条件做** —— 否则卸一条判据会连带关掉别条。 */
const CB1_ON = true;
const CB2_ON = true;
const CB3_ON = true;
const CB4_ON = true;

const problems = [];
function fail(id, msg) {
  problems.push(`${id}：${msg}`);
}

function* walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // 目录不在场 ⇒ 扫描面为空 ⇒ 交给 CB2 判红（不抛栈、不静默绿）
  }
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    // ⚠️ 必须跳过 `._*`：本项目在外接 exFAT 盘上开发，macOS 会给每个文件
    // 留一份 AppleDouble 资源叉（`._paper.css`），它也以 .css 结尾。
    // 资源叉是二进制，头部随机字节里可能含一个未闭合的 `{`，
    // 那样脚本会**失败退出并指向一个用户从没写过的文件**，极具误导性。
    // .gitignore 已排除 `._*`，但那只管 git，管不到这个脚本。
    else if (entry.name.endsWith(".css") && !entry.name.startsWith("._")) yield p;
  }
}

/** 剥掉注释与字符串，只留下结构字符；再剥掉 url(...) 里的内容。 */
function strip(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === "/*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    const c = src[i];
    if (c === '"' || c === "'") {
      const quote = c;
      i++;
      while (i < src.length && src[i] !== quote) i += src[i] === "\\" ? 2 : 1;
      i++;
      continue;
    }
    out += c;
    i++;
  }
  // url(...) 里是资源路径 / data URI，里面的 { } 不是规则结构。
  // （与 check-dead-css 的 stripCss 同一处理：那边用它排除 url() 里的文件名。）
  return out.replace(/url\([^)]*\)/g, " ");
}

/** 数一数文本里还剩多少个花括号（开合都算）。 */
function braceCount(text) {
  let n = 0;
  for (const ch of text) if (ch === "{" || ch === "}") n++;
  return n;
}

/* ================= CB3：遮罩自证 =================
   合成样例：三个「不该计入 { 的位置」+ 各自剥完后必须恰好剩 1 对花括号（2 个）。
   任一条不成立 ⇒ 判红（宁可 build 断，也不给假保证）。 */
const MASK_PROOFS = [
  { name: "注释里的 { 必须被跳过", text: "/* { */ .a { color: red; }" },
  { name: "字符串里的 { 必须被跳过", text: '.a { content: "{"; }' },
  { name: "url(...) 里的 { 必须被跳过", text: ".a { background: url(data:image/svg+xml;utf8,<svg>{); }" },
];

if (CB3_ON) {
  for (const p of MASK_PROOFS) {
    const n = braceCount(strip(p.text));
    if (n !== 2) {
      fail(
        "CB3",
        `遮罩自证失败：${p.name} —— 剥完之后花括号还剩 ${n} 个（应为 2 个）。` +
          `遮罩一旦失效，门禁会把不该计入的 { 当成规则结构（假阳性），` +
          `或把该计入的吃掉（漏报），而这两种失效都不会让门禁自己变红。`
      );
    }
  }
}

/* ================= CB1 / CB2：扫样式表 ================= */

const files = [...walk(CSS_DIR)];

/* CB2：扫描面为空 ⇒ 空跑 ⇒ 判红（补之前是「通过（0 个文件）」静默绿）。 */
if (CB2_ON && files.length === 0) {
  fail(
    "CB2",
    `src/assets/css 下一张样式表都扫不到 —— 括号检查没有判断对象（空跑）。` +
      `目录改名或被清空时，这道护栏会静默地不再护栏，而 build 照样全绿。`
  );
}

for (const file of files) {
  const stripped = strip(fs.readFileSync(file, "utf8"));
  let depth = 0;
  let minDepth = 0;
  for (const ch of stripped) {
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth < minDepth) minDepth = depth;
    }
  }
  const rel = path.relative(REPO, file);
  if (CB1_ON && (depth !== 0 || minDepth < 0)) {
    fail(
      "CB1",
      `${rel}  未闭合 ${depth > 0 ? depth + " 个 {" : ""}${depth < 0 ? " 多出 " + -depth + " 个 }" : ""}` +
        `${depth === 0 && minDepth < 0 ? "（存在多余的 }）" : ""} —— ` +
        `缺失的收尾花括号会让后面的规则被静默吞掉：构建不报错、HTTP 200、\n` +
        `      控制台干净，只有肉眼看截图才发现。`
    );
  }
}

/* ================= CB4：门禁自己没被卸掉 ================= */

if (CB4_ON) {
  let pkg = null;
  try {
    pkg = JSON.parse(fs.readFileSync(PKG, "utf8"));
  } catch (e) {
    fail("CB4", `读不到 package.json（${e.message}）—— 无法确认本门禁接在 build 链上。`);
  }
  if (pkg) {
    const SCRIPTS = pkg.scripts || {};
    const NPM_RUN_RE = /\bnpm\s+run\s+([A-Za-z0-9:_-]+)/g;
    const seen = new Set();
    const queue = ["build"];
    while (queue.length) {
      const name = queue.shift();
      if (seen.has(name)) continue;
      seen.add(name);
      const cmd = SCRIPTS[name] || "";
      NPM_RUN_RE.lastIndex = 0;
      let m;
      while ((m = NPM_RUN_RE.exec(cmd)) !== null) {
        if (SCRIPTS[m[1]] !== undefined) queue.push(m[1]);
      }
    }
    const wired = Object.keys(SCRIPTS).filter(
      (n) => seen.has(n) && (SCRIPTS[n] || "").includes(SELF)
    );
    if (!wired.length) {
      fail(
        "CB4",
        `门禁自己被卸掉了：package.json 的 build 链里没有指向 scripts/${SELF} 的 script。`
      );
    }
  }
}

/* ================= 汇报 ================= */

if (problems.length) {
  console.error("CSS 括号检查未通过：\n");
  for (const p of problems) console.error(`  ✗ 门禁 ${p}`);
  console.error("");
  process.exit(1);
}

console.log(`CSS 括号检查通过（${files.length} 个文件）`);
