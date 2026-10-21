#!/usr/bin/env node
/**
 * 门禁 CW1–CW4 / CQ1–CQ3：产物 CSS 的注释字节 + 与源的内容一致性
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
 *   CW1–CW4 守的是「产物里没有注释字节」——那是**症状**。
 *   CQ1–CQ3 守的是「产物 CSS 应当就是源 CSS 剥掉注释后的结果」——那是**结果**
 *   （编号用 CQ*，与上面的 CW* 不续接；理由见下面 CQ 段的头注释）。
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

/* CW4 的覆盖度下限（枚举逻辑坏了的兜底）。
   ⚠️ 这里只写下限，不写实测规模：实测规模（外链 CSS 个数 / 内联块个数 / 每页块数）
   会随发布清单变化 —— D50 起外链 CSS 从 16 个降到 12 个（4 个只供内联的源样式
   不再出独立副本）。低于下限说明枚举逻辑坏了，不是「没问题」。 */
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

/* ---------------- CQ1–CQ3：产物 CSS 与源 CSS 的内容一致性 ----------------
 *
 * 为什么需要它（2026-10-21 的 D38）：
 *   CW1–CW4 守的是「产物里没有注释字节」——那是**症状**。
 *   但没有任何一条判据守着「产物 CSS 应当就是源 CSS 剥掉注释后的结果」——
 *   那是**结果**。少了结果判据，产物与源之间就没有任何一致性保证：
 *   实测（改动前）往产物 pages.css 注入 39 B「来历不明」的规则，
 *   check-css-comment-weight / check-css-braces / check-dead-css /
 *   check-wrapping **四道门禁全绿** —— 谁也没报告。
 *
 *   更要紧的是：components.css 里那 19 KB 注释之所以被剥掉，
 *   **靠的是剥除钩子恰好排在写盘之后**（钩子顺序的巧合），不是构造保证。
 *   顺序一改注释就回来了，而门禁只是「看到注释才报」。
 *
 * 判据（CQ* 与 CW* 不续接）：
 *   CQ1 一对一文件：产物剥注释后，必须与源剥注释后**逐字相等**
 *      （assets/css/** 与 src/assets/css/** 同名一一对应；
 *        components.css 是合成产物，不参与本条，交给 CQ2）。
 *   CQ2 拼接产物 components.css：index.css 声明的每个 partial，
 *      其剥注释后的内容必须**逐字出现**在产物里，且出现顺序与声明一致；
 *      剥掉这些内容后剩余部分**不得含左花括号** —— 不得有源里没有的规则块。
 *   CQ3 覆盖度自证：产物里不许有源目录已经没有的 CSS；components.css 必须存在；
 *      **源里有、产物里没有的 CSS，必须是「本来就不发布」的那几个**
 *      （被 {% inlineCss %} 内联的源样式 + components/index.css 这个顺序声明
 *        + components/ 下的 7 个 partial —— partial 只在 dev 直拷，prod 的
 *        components.css 是 concat 后的单文件，D51）
 *      —— 其余的源样式都得在产物里，否则就是「新增的源样式没被复制进产物」
 *      （页面会拿它当 <link href>，直接断样式）；
 *      磁盘上的 partial 与 index.css 声明的必须一致 —— 否则新增 partial 时
 *      门禁会静默放过它。
 *
 * ⚠️ 本门禁**只看 prod 产物** —— CQ2 要求 components.css 逐字包含每个 partial，
 *   那是 concat 形态才成立的性质；dev 产物里 components.css 是 @import hub，
 *   跑本门禁会当场判红（这不是 bug，是「这份门禁不支持 dev 产物」的事实）。
 *
 * 为什么自己算、不 import 构建期的剥除器：
 *   与 CW1–CW4 同一纪律 —— 用被检查方自己的函数判自己，判据就没有独立性。
 *   本门禁用**词法扫描**（token 正则）自己剥注释，
 *   与 scripts/lib/css-comments.cjs 的**字符级扫描器**是两套独立实现。
 */

/* 判据开关：存在的唯一理由是自测的负对照要把某一条判据**单独**卸掉，
   证明「那一档的红确实来自这一条判据本身」。默认值恒为 true。 */
const CQ1_ON = true;
const CQ2_ON = true;
const CQ3_ON = true;

const SRC_CSS_ROOT = path.join(ROOT, "src", "assets", "css");
const PROD_CSS_ROOT = path.join(SITE, "assets", "css");

/** 目录下的 .css 相对路径（正斜杠风格，排序，跳过 AppleDouble 资源叉）。 */
function cssRels(dir) {
  const out = [];
  (function scan(d) {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith("._")) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) scan(p);
      else if (e.name.toLowerCase().endsWith(".css")) {
        out.push(path.relative(dir, p).split(path.sep).join("/"));
      }
    }
  })(dir);
  out.sort();
  return out;
}

/** components/index.css 里声明的 partial 清单（@import url("./_xxx.css")）。 */
function declaredPartials(hubFile) {
  if (!fs.existsSync(hubFile)) return [];
  const hub = fs.readFileSync(hubFile, "utf8");
  const out = [];
  const re = /@import\s+url\(\s*["']\.\/(_[^"']+\.css)["']\s*\)/g;
  let m;
  while ((m = re.exec(hub)) !== null) out.push(m[1]);
  return out;
}

const srcRels = cssRels(SRC_CSS_ROOT);
const prodRels = cssRels(PROD_CSS_ROOT);
const partials = declaredPartials(path.join(SRC_CSS_ROOT, "components", "index.css"));
const srcSet = new Set(srcRels);
const prodSet = new Set(prodRels);

/* ---- 被 {% inlineCss %} 内联的源样式（它们在源里有、在产物里没有是对的） ----
 *
 * D50 起（见 docs/DEFECT-BACKLOG.md）：tokens / base / paper-reader 三个源样式
 * 走 {% inlineCss %} 内联进 HTML —— **内联才是它们的唯一消费路径**，
 * 产物里不该再有它们的独立副本。所以 CQ3 的「源有产物没有」这条判据，
 * 必须先知道「哪些源样式本来就不发布」。
 *
 * 判定依据 = 模板里 {% inlineCss "src/assets/css/X.css" %} 的**字面量**。
 * ⚠️ 匹配前先剥 Nunjucks / HTML 注释：注释里的一句不算引用。
 * ⚠️ 本门禁**不 import** 任何被检查方的模块 —— 判定依据是自己扫模板得来的。
 */
function inlinedCssRels() {
  const out = new Set();
  const srcDir = path.join(ROOT, "src");
  const prefix = "src/assets/css/";
  const files = [];
  (function scan(d) {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith("._")) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) scan(p);
      else if (e.name.toLowerCase().endsWith(".njk")) files.push(p);
    }
  })(srcDir);
  const re = /\{%\s*inlineCss\s+"([^"]+)"\s*%\}/g;
  for (const f of files) {
    let text;
    try {
      text = fs.readFileSync(f, "utf8");
    } catch (_) {
      continue;
    }
    const code = text.replace(/\{#[\s\S]*?#\}/g, " ").replace(/<!--[\s\S]*?-->/g, " ");
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(code)) !== null) {
      const p = m[1].split(path.sep).join("/");
      if (!p.startsWith(prefix)) continue;
      out.add(p.slice(prefix.length));
    }
  }
  return out;
}

/* 「本来就不发布」的源样式：被内联的 + components/index.css（顺序声明）
   + components/ 下的 7 个 partial。
   ⚠️ index.css 只被构建与门禁当**声明**读，浏览器从不加载它（D50）。
   ⚠️ partial 只在 **dev** 直拷：prod 的 components.css 是 7 个分片顺序拼接
     后的单文件，分片本身没有任何页面请求（D51）⇒ prod 产物里没有它们是对的。 */
const NOT_PUBLISHED = new Set([...inlinedCssRels(), "components/index.css"]);
{
  // 扫磁盘上的 partial（**不是** index.css 声明的那份）——
  // 声明漏了谁由 CQ3(d) 管，这里管「哪些文件天生不发布」。
  const compDir = path.join(SRC_CSS_ROOT, "components");
  let entries = [];
  try {
    entries = fs.readdirSync(compDir, { withFileTypes: true });
  } catch (_) {
    entries = [];
  }
  for (const e of entries) {
    if (e.name.startsWith("._")) continue;
    if (!e.isFile()) continue;
    if (!e.name.startsWith("_") || !e.name.toLowerCase().endsWith(".css")) continue;
    NOT_PUBLISHED.add(`components/${e.name}`);
  }
}

if (!fs.existsSync(SRC_CSS_ROOT)) {
  problems.push(
    `CQ3 找不到源 CSS 目录 src/assets/css —— 本门禁要拿产物与源逐字比对，源没了就无从比对。\n` +
      `      → 门禁必须和仓库一起跑；单独把门禁拷到别处会立刻红，这是有意的。`
  );
}

/* ---- CQ1：一对一文件，产物剥注释后 == 源剥注释后（逐字） ---- */

let cq1Checked = 0;
if (CQ1_ON && fs.existsSync(SRC_CSS_ROOT)) {
  for (const rel of prodRels) {
    if (rel === "components.css") continue; // 合成产物，交给 CQ2
    const srcFile = path.join(SRC_CSS_ROOT, rel);
    if (!fs.existsSync(srcFile)) continue; // 缺源由 CQ3 报（这里没有可比对象）
    const prodStripped = stripComments(fs.readFileSync(path.join(PROD_CSS_ROOT, rel), "utf8"));
    const srcStripped = stripComments(fs.readFileSync(srcFile, "utf8"));
    cq1Checked++;
    if (prodStripped !== srcStripped) {
      let i = 0;
      const n = Math.min(prodStripped.length, srcStripped.length);
      while (i < n && prodStripped[i] === srcStripped[i]) i++;
      problems.push(
        `CQ1 assets/css/${rel} 的产物内容与源 src/assets/css/${rel} 不一致 —— ` +
          `剥掉注释后两者仍不相等，说明产物里有源里没有的字节，或产物被改过。\n` +
          `      → 第一处差异在第 ${i} 个字符（产物 ${prodStripped.length} 字符 / 源 ${srcStripped.length} 字符）。\n` +
          `      → 产物是 src/assets/css/** 的拷贝再剥注释（构建期做）；对不上就是拷贝、剥除或改写环节出了问题。`
      );
    }
  }
}

/* ---- CQ2：components.css 必须逐字包含 index.css 声明的每个 partial ---- */

let cq2Checked = 0;
if (CQ2_ON && fs.existsSync(SRC_CSS_ROOT)) {
  const compProd = path.join(PROD_CSS_ROOT, "components.css");
  if (fs.existsSync(compProd) && partials.length > 0) {
    const prodStripped = stripComments(fs.readFileSync(compProd, "utf8"));
    let remainder = prodStripped;
    let lastAt = -1;
    let allFound = true;
    for (const name of partials) {
      const srcFile = path.join(SRC_CSS_ROOT, "components", name);
      if (!fs.existsSync(srcFile)) {
        problems.push(
          `CQ2 components/index.css 声明了 ${name}，但 src/assets/css/components/${name} 不存在。`
        );
        allFound = false;
        continue;
      }
      // 构建时拼的是「partial 源文本 trim 之后」再整体剥注释 ——
      // 这里按同一口径取片段，才能与产物里的那段逐字对上。
      const piece = stripComments(fs.readFileSync(srcFile, "utf8").trim());
      if (piece.length === 0) {
        problems.push(`CQ2 partial ${name} 剥掉注释后是空的 —— 没有内容可比。`);
        allFound = false;
        continue;
      }
      const at = prodStripped.indexOf(piece);
      if (at < 0) {
        problems.push(
          `CQ2 产物 components.css 里找不到 ${name} 的内容（逐字比对）—— ` +
            `源里有、产物里没有，或内容对不上。`
        );
        allFound = false;
        continue;
      }
      if (at <= lastAt) {
        problems.push(
          `CQ2 产物 components.css 里 ${name} 出现在第 ${at} 个字符处，位置不在上一个 partial 之后 —— ` +
            `拼接顺序与 components/index.css 的声明不一致（渲染层级会变）。`
        );
      }
      lastAt = at;
      remainder = remainder.split(piece).join("");
    }
    cq2Checked = partials.length;
    // 剥掉所有 partial 后剩下的是「头部说明 + 分片标记 + 分隔空行」，
    // 里面**不该有规则块**。有「{」就说明产物里混进了源里没有的样式。
    if (allFound && remainder.includes("{")) {
      problems.push(
        `CQ2 产物 components.css 里有源里没有的规则块 —— ` +
          `剥掉 ${partials.length} 个 partial 的内容后，剩余部分仍含左花括号。`
      );
    }
  }
}

/* ---- CQ3：覆盖度自证 ---- */

if (CQ3_ON && fs.existsSync(SRC_CSS_ROOT)) {
  // (a) assets/** 下的 CSS 必须都在 assets/css/ 下（否则本门禁的对应关系漏判）
  for (const file of allFiles) {
    if (path.extname(file).toLowerCase() !== ".css") continue;
    const rel = path.relative(SITE, file).split(path.sep).join("/");
    if (!rel.startsWith("assets/")) continue;
    if (!rel.startsWith("assets/css/")) {
      problems.push(
        `CQ3 产物里的 ${rel} 不在 assets/css/ 下 —— 本门禁按 assets/css/ 与 ` +
          `src/assets/css/ 一一对应判，别处放 CSS 会漏判。`
      );
    }
  }
  // (b) 合成产物必须在
  if (!prodSet.has("components.css")) {
    problems.push("CQ3 产物里没有 assets/css/components.css —— 组件样式缺失。");
  }
  // (c) 双向文件集：产物有源没有 / 源有产物没有
  for (const rel of prodRels) {
    if (rel === "components.css") continue;
    if (!srcSet.has(rel)) {
      problems.push(
        `CQ3 产物里有 assets/css/${rel}，但源 src/assets/css/${rel} 不存在 —— ` +
          `产物里出现了来路不明的 CSS。`
      );
    }
  }
  for (const rel of srcRels) {
    if (prodSet.has(rel)) continue;
    /* 「本来就不发布」的源样式在源里有、产物里没有是**对的**（D50/D51）：
       被 {% inlineCss %} 内联的三个（内联才是它们的消费路径）+
       components/index.css（partial 顺序的书面声明，浏览器从不加载）+
       components/ 下的 7 个 partial（只在 dev 直拷，prod 是 concat 单文件）。
       其余的源样式都必须在产物里 —— 少了就是「新增的源样式没被复制进产物」。 */
    if (NOT_PUBLISHED.has(rel)) continue;
    problems.push(
      `CQ3 源里有 src/assets/css/${rel}，但产物 _site/assets/css/${rel} 不存在 —— ` +
        `新增的源样式没被复制进产物。`
    );
  }
  // (d) partial 名单：磁盘上的 vs index.css 声明的
  const compDir = path.join(SRC_CSS_ROOT, "components");
  const diskPartials = fs.existsSync(compDir)
    ? fs
        .readdirSync(compDir)
        .filter((n) => n.startsWith("_") && n.toLowerCase().endsWith(".css"))
        .sort()
    : [];
  for (const n of diskPartials) {
    if (!partials.includes(n)) {
      problems.push(
        `CQ3 源里有 partial components/${n}，但 components/index.css 没有声明它 —— ` +
          `partial 名单与产物拼接依据不一致。`
      );
    }
  }
  for (const n of partials) {
    if (!diskPartials.includes(n)) {
      problems.push(
        `CQ3 components/index.css 声明了 ${n}，但源目录 src/assets/css/components/ 下没有这个 partial。`
      );
    }
  }
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
console.log(
  `  · 内容一致性：${cq1Checked} 个产物 CSS 文件与源逐字相等；` +
    `components.css 逐字包含 ${cq2Checked} 个 partial。`
);
console.log("  · 源码里的 CSS 注释一个字没动：那是维护者的笔记，不是访客的带宽。");
console.log("  · 判据出处：docs/DEFECT-BACKLOG.md D37（注释字节）与 D38（内容一致性）。");
