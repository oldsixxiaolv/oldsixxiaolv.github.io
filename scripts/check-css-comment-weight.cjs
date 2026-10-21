#!/usr/bin/env node
/**
 * 门禁 CW1–CW4：产物里的 CSS 不得带注释字节
 *
 * 为什么需要它（2026-10-21 的 D37）：
 *   本站的 CSS 注释写得极密 —— 记录取舍理由、实测数字、踩过的坑。
 *   这些注释对**维护者是资产**，但它们**不该跟着产物发给访客**。
 *   2026-10-21 的实测（改动前）：
 *     · 外链 CSS（_site/assets/css/**，16 个文件，256,627 B）里有 121,525 B
 *       是注释 —— **47%**。独立文件、有缓存，但首次访问仍要下载；
 *     · 内联 <style>（6 个页面、14 个块、191,176 B）里有 84,922 B 是注释 ——
 *       **44%**。这一部分更糟：它在 HTML 里，**不可缓存、每次翻页重下**。
 *       内联 CSS 存在的全部理由就是把关键样式塞进 HTML 省一次往返，
 *       注释让这项优化在**不可缓存的关键路径上**多背了几十 KB
 *       浏览器一个字节都不会用的东西。
 *
 *   修法（不在本门禁里，在构建期）：`scripts/lib/css-comments.cjs` +
 *   `eleventy.config.js` 的 `eleventy.after` 钩子 —— **产物层**剥注释，
 *   **源码层一个字不动**（源码注释是维护者的笔记，不是访客的带宽）。
 *
 * 本门禁守什么（判据编号 CW*，与 check-block-language 的 BL*、
 *   check-lang 的 FF*、check-jsonld 的 J*、check-site-language 的 TX*、
 *   check-a11y 的 A* 都不续接）：
 *   CW1 产物里内联 <style> 不得含 CSS 注释
 *   CW2 产物里外链 CSS 文件不得含 CSS 注释
 *   CW3 剥注释后仍须有内容 —— 且整个产物的 CSS 集合里仍须有规则块
 *      （防「把样式整份清空/删成只剩 @import」这种"合法但页面没样式"的退化：
 *        清空内联 CSS 同样能骗过 CW1/CW2 —— 没有注释了，但也没样式了。）
 *   CW4 覆盖度自证 —— 内联块数、外链 CSS 文件数都不得为 0，且**每个**
 *      HTML 页面都得有内联块："没报错"和"没问题"长得一模一样，
 *      判据一旦被卸掉或枚举逻辑坏了，门禁会一直绿着。
 *
 * 边界（如实写明）：
 *   · 只判**产物**（_site）。源码里的注释一个字都不动，也不判 ——
 *     那是维护者的资产，不是缺陷。
 *   · 只剥**块注释**（CSS 没有行注释语法）。
 *   · **字符串字面量里的内容一律不算注释** —— 诸如 `content:` 的值里
 *     写着「斜杠 + 星号 … 星号 + 斜杠」是合法 CSS，把它判成注释是假红。
 *     本门禁用**词法扫描**（token 正则）区分字符串与注释，
 *     与构建期剥除器（字符级扫描器）是**两套独立实现**，互为交叉验证。
 *   · 不判 CSS 的**语义**（选择器是否有效、属性是否被支持）——
 *     那是浏览器的事，不是构建门禁的事。
 *
 * 用法：node scripts/check-css-comment-weight.cjs   （有错 exit 1）
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SITE = path.join(ROOT, "_site");

/* CW4 的覆盖度下限（现值：16 个外链 CSS / 14 个内联块 / 每个页面 2–3 个内联块）。
   低于这些数说明枚举逻辑坏了，不是"没问题"。 */
const MIN_CSS_FILES = 5;
const MIN_INLINE_BLOCKS = 3;
const MIN_PAGES = 1;

/* ---------- CSS 词法扫描（门禁自带，不 import 构建期的剥除器） ----------
   一次扫描把文本切成「字符串」与「注释」两类 token：
     · 字符串：双引号 / 单引号，含反斜杠转义；
     · 注释：块注释（斜杠 + 星号 … 星号 + 斜杠）。
   同一类里**先闭合的、再未闭合的** —— 已闭合的那条先试上，未闭合的兜底。
   字符串与注释之间不需要排序：扫描器从左往右逐位尝试，
   双引号位置只可能匹配字符串模式，斜杠位置只可能匹配注释模式。

   「未闭合」的三条兜底分支是必要的 —— CSS 里若有一条没闭合的字符串，
   扫描器必须把它整段吃掉（与浏览器一致），否则后面真正的注释会被误判。

   ⚠️ 这与 scripts/lib/css-comments.cjs 的实现**刻意不同**：
      那边是逐字符扫描，这边是 token 正则。两边独立，才能互证。
      本门禁**不允许** import 那个 lib —— 用被检查方自己的函数判自己，
      判据就没有独立性了。 */

/* 字符串字面量的 token 模式（双 / 单引号，各有「已闭合 / 未闭合」两条）。
   ⚠️ 负对照（自测 CW6）会把下面这行整体摘掉，模拟「不保护字符串字面量」的
      那类检测器 —— 那样 content: 的值里写着注释文本时就会被误判成注释。 */
const CSS_STRING_SOURCES = [
  '"(?:[^"\\\\]|\\\\.)*"',
  "'(?:[^'\\\\]|\\\\.)*'",
  '"(?:[^"\\\\]|\\\\.)*$',
  "'(?:[^'\\\\]|\\\\.)*$'",
];

/* 块注释的 token 模式（已闭合 / 未闭合）。 */
const CSS_COMMENT_SOURCES = ["\\/\\*[\\s\\S]*?\\*\\/", "\\/\\*[\\s\\S]*$"];

const CSS_TOKEN_SOURCE = [...CSS_STRING_SOURCES, ...CSS_COMMENT_SOURCES].join("|");

/**
 * 把 CSS 切成 token 列表。
 *
 * ⚠️ 必须带**起始下标**：用「文本内容 + indexOf」回找位置是错的 ——
 *    一段字符串字面量里可以原样写着「斜杠 + 星号 … 星号 + 斜杠」这段注释文本
 *    （content 属性的值里就这么写过），indexOf 会先撞上字符串里那份，
 *    切片就错位了。
 * @param {string} css
 * @returns {{text: string, kind: "comment" | "string", index: number}[]}
 */
function scanCss(css) {
  const re = new RegExp(CSS_TOKEN_SOURCE, "g");
  const out = [];
  let m;
  while ((m = re.exec(css)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex++; // 防御：零长匹配会让死循环
      continue;
    }
    out.push({
      text: m[0],
      kind: m[0].startsWith("/*") ? "comment" : "string",
      index: m.index,
    });
  }
  return out;
}

/**
 * 数出注释 token 的个数（判 CW1 / CW2 用）。
 * @param {string} css
 * @returns {number}
 */
function countComments(css) {
  let n = 0;
  for (const t of scanCss(css)) if (t.kind === "comment") n++;
  return n;
}

/**
 * 剥掉注释（判 CW3 用：剥完必须仍有内容）。
 * 注释里的**换行保留**（只丢非换行字符）—— 与构建期剥除器同一口径。
 * @param {string} css
 * @returns {string}
 */
function stripComments(css) {
  let out = "";
  let last = 0;
  for (const t of scanCss(css)) {
    if (t.kind !== "comment") continue;
    out += css.slice(last, t.index);
    out += t.text.replace(/[^\n]/g, "");
    last = t.index + t.text.length;
  }
  return out + css.slice(last);
}

/* ---------------- 工具 ---------------- */

function walk(dir) {
  const found = [];
  let st;
  try {
    st = fs.statSync(dir);
  } catch (_) {
    return found;
  }
  if (st.isFile()) return [dir];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return found;
  }
  for (const e of entries) {
    if (e.name.startsWith("._")) continue; // macOS 的 AppleDouble 资源叉
    const p = path.join(dir, e.name);
    if (e.isDirectory()) found.push(...walk(p));
    else if (e.isFile()) found.push(p);
  }
  return found;
}

/** 页面里所有 <style> 块的内容。 */
function styleBlocks(html) {
  const out = [];
  const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1] || "");
  return out;
}

const problems = [];
const notes = [];

/* ---------------- 产物目录 ---------------- */

if (!fs.existsSync(SITE)) {
  console.error("产物 CSS 注释门禁未通过：\n");
  console.error("  ✗ 找不到产物目录 _site —— 先跑 npm run build 再跑本门禁。");
  console.error("");
  process.exit(1);
}

const allFiles = walk(SITE);
const htmlFiles = allFiles.filter((f) => path.extname(f).toLowerCase() === ".html");
const cssFiles = allFiles.filter(
  (f) =>
    path.extname(f).toLowerCase() === ".css" &&
    path.relative(SITE, f).split(path.sep)[0] === "assets"
);
htmlFiles.sort();
cssFiles.sort();

/* ---------------- CW1：内联 <style> 不得含注释 ---------------- */

let inlineBlockCount = 0;
let inlineBytes = 0;
const pagesWithoutInline = [];

for (const file of htmlFiles) {
  const rel = path.relative(SITE, file);
  const html = fs.readFileSync(file, "utf8");
  const blocks = styleBlocks(html);
  if (blocks.length === 0) pagesWithoutInline.push(rel);
  for (const css of blocks) {
    inlineBlockCount++;
    inlineBytes += Buffer.byteLength(css, "utf8");
    const inlineCommentCount = countComments(css);
    if (inlineCommentCount > 0) {
      problems.push(
        `CW1 ${rel} 的内联 <style> 里有 ${inlineCommentCount} 处 CSS 注释 —— ` +
          `内联 CSS 不可缓存、每次翻页都要重下，注释在这里是纯粹的浪费。\n` +
          `      → 剥除发生在构建期（eleventy.after 钩子调 scripts/lib/css-comments.cjs）。\n` +
          `      → 如果这里红了，多半是钩子没跑到：先确认 npm run build 走的是完整的 eleventy 步骤。`
      );
    }
  }
}

/* ---------------- CW2：外链 CSS 不得含注释 ---------------- */

let cssBytes = 0;
for (const file of cssFiles) {
  const rel = path.relative(SITE, file);
  const css = fs.readFileSync(file, "utf8");
  cssBytes += Buffer.byteLength(css, "utf8");
  const fileCommentCount = countComments(css);
  if (fileCommentCount > 0) {
    problems.push(
      `CW2 ${rel} 里有 ${fileCommentCount} 处 CSS 注释 —— 产物不该带注释字节。\n` +
        `      → 源码里的注释是维护者的笔记（保留），产物里的必须剥掉（构建期做）。`
    );
  }
}

/* ---------------- CW3：剥注释后仍须有内容 ---------------- */

let braceTotal = 0;
for (const file of cssFiles) {
  const rel = path.relative(SITE, file);
  const css = fs.readFileSync(file, "utf8");
  const stripped = stripComments(css);
  if (stripped.trim().length === 0) {
    problems.push(
      `CW3 ${rel} 剥掉注释后**空了** —— 这个文件现在一个字节的有效样式都没有。\n` +
        `      → 清空内联 CSS 同样能骗过 CW1/CW2（没有注释了，但也没样式了）。`
    );
  }
  if (stripped.includes("{")) braceTotal++;
}

for (const file of htmlFiles) {
  const rel = path.relative(SITE, file);
  const html = fs.readFileSync(file, "utf8");
  const blocks = styleBlocks(html);
  blocks.forEach((css, i) => {
    if (stripComments(css).trim().length === 0) {
      problems.push(
        `CW3 ${rel} 的第 ${i + 1} 个内联 <style> 剥掉注释后**空了** —— ` +
          `这个块现在一个字节的有效样式都没有。\n` +
          `      → 清空内联 CSS 同样能骗过 CW1/CW2。`
      );
    }
  });
}

if (cssFiles.length > 0 && braceTotal === 0) {
  problems.push(
    `CW3 整个产物的 ${cssFiles.length} 个 CSS 文件里**一个规则块都没有**（全是 @import 或空）—— ` +
      `页面会没有样式。`
  );
}

/* ---------------- CW4：覆盖度自证 ---------------- */

if (htmlFiles.length < MIN_PAGES) {
  problems.push(
    `CW4 只扫到 ${htmlFiles.length} 个产物页面（要求至少 ${MIN_PAGES} 个）—— \n` +
      `      枚举逻辑多半坏了；"没报错"和"没问题"长得一模一样。`
  );
}
if (inlineBlockCount < MIN_INLINE_BLOCKS) {
  problems.push(
    `CW4 只扫到 ${inlineBlockCount} 个内联 <style> 块（要求至少 ${MIN_INLINE_BLOCKS} 个）—— \n` +
      `      枚举逻辑多半坏了；判据一旦从未被执行过，它会一直绿着。`
  );
}
if (cssFiles.length < MIN_CSS_FILES) {
  problems.push(
    `CW4 只扫到 ${cssFiles.length} 个外链 CSS 文件（要求至少 ${MIN_CSS_FILES} 个）—— \n` +
      `      枚举逻辑多半坏了；判据一旦从未被执行过，它会一直绿着。`
  );
}
for (const rel of pagesWithoutInline) {
  problems.push(
    `CW4 ${rel} 一个内联 <style> 块都没有 —— 每个页面都得有内联块。\n` +
      `      → 内联 CSS 是本站 critical CSS 优化的落点，少一个页面就少一个。`
  );
}

/* ---------------- 汇总 ---------------- */

if (problems.length) {
  console.error("产物 CSS 注释门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

console.log(
  `产物 CSS 注释门禁通过：${htmlFiles.length} 个产物页面 / ${inlineBlockCount} 个内联 <style> 块` +
    `（${inlineBytes} B）、${cssFiles.length} 个外链 CSS 文件（${cssBytes} B）—— 注释字节 0。`
);
notes.forEach((n) => console.log(`  · ${n}`));
console.log("  · 源码里的 CSS 注释一个字没动：那是维护者的笔记，不是访客的带宽。");
console.log("  · 判据出处：docs/DEFECT-BACKLOG.md D37。");
