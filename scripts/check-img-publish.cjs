#!/usr/bin/env node
/**
 * 门禁 IP1–IP5：**图片发布清单**必须与「源图片各自的消费点」严格对齐
 *
 * 为什么要有这个门禁（一次实测坐实的看护缺口，不是假想）：
 *   `eleventy.config.js` 的 assetGlobs 曾经用一条覆盖
 *     src/assets/img/ 下 {svg,png,jpg,jpeg,webp} 的通配，
 *   把源目录里的图片**原样直拷**进产物。而源目录里的 9 张图里，
 *   **有 3 张的产物副本没有任何页面引用**：
 *     og/og-1080x1080.svg（5,190 B）/ og/og-1200x630.svg（7,143 B）/
 *     og/og-1500x500.svg（5,722 B）—— 它们是**分享图的设计母版**
 *     （`docs/og-image-and-a11y-report.md` 记着 SVG → PNG 的转换关系，
 *     站内真正发布的是同名的 **PNG**，三处 `og:image:type` 全部是 `image/png`），
 *     不是「没人用的死文件」，而是「**没人请求的设计源**」。
 *   合计 18,055 B 的「访客下载得到、却没有任何页面引用」的文件。
 *
 *   这与 D50 修掉的 CSS 死副本**同根**：**通配直拷**把「设计源 / 构建输入」
 *   一起当成了「发布物」。
 *   更要紧的是**没有门禁守着「图片发布清单」**：
 *     · 源里新增一张图、忘了引用 ⇒ 它照样进产物（死副本）；
 *     · 源里新增一张图、引用了，但构建清单漏了 ⇒ 页面图片 404，门禁却一句都不说。
 *   ⇒ 本门禁把「源图片的消费点」钉死：被人引用的图**必须**发布，
 *     没人引用的图**不得**发布。
 *
 * 五条判据（编号用独立字母体系 IP*，**不与既有前缀冲突**：
 *   IA*（图片资产）/ IL*（图片加载）/ IS*（其自测）/ AV*（作者图片）/
 *   AT*（其自测）/ IP*（本门禁）均不同名）：
 *   IP1 **死副本** —— 「源侧没有消费点」的源图出现在产物里 ⇒ 判红
 *      （没人请求，却占着部署体积）。
 *      ⚠️ 走**源侧**枚举（源里有、没人引用、却在产物里）；
 *        「产物里有、源里没有」是 IP3 的事 —— 两边各管一处，
 *        同一处缺陷**只允许红一条**，红因归属才可判定。
 *   IP2 **漏拷** —— 「源侧有消费点」的源图没出现在产物里 ⇒ 判红
 *      （页面会拿它当 <img src>，直接 404）。
 *   IP3 **孤儿** —— 产物里出现源目录已经没有了的图 ⇒ 判红
 *      （源文件删了、构建清单没跟着改）。
 *   IP4 **覆盖度自证** —— 至少认出一处「有消费点」的源图；
 *      一处都没认到说明引用检测器坏了，不是「没问题」。
 *   IP5 **门禁自己没被卸掉** —— package.json 的 build 链里必须真的有本门禁。
 *
 * ================= 消费点怎么算 =================
 *   消费点 = **源代码里出现了这张图的文件名**（先剥注释再匹配 ——
 *   注释里的一句「见 xxx.png」不算引用）。
 *   扫描面 = `src/` 下的全部文本文件（模板 / 真源 / 样式 / 脚本）；
 *   **不扫** `scripts/`（门禁与自测是**检查者**，不是使用者 ——
 *   否则在门禁里写一句就能自证通过）、**不扫** `docs/`（文档不是消费点）、
 *   **不扫** `eleventy.config.js`（构建清单是**发布方**，不是使用方）。
 *   ⚠️ 文件名按**词边界**匹配（左边不是字母/数字/`-`，右边不是字母/数字），
 *     免得 `a.png` 把 `ba.png` 也算成有引用。
 *   ⚠️ 消费点的判定是「文本里出现了引用」，不是「运行时真的用它」——
 *     这与 AV1（作者图片）的口径一致，不重复造第二套真相。
 *   ⚠️ 真源里的**路径**也算引用（`site.js` 的 `ogImage: "/assets/img/og/x.png"`
 *     是站内发布那张图的声明）；反过来，「真源里声明了却没人渲染」不在本门禁职责内
 *     —— 那是 AV1 与 IA7 的事（见下「守不了什么」）。
 *
 * ⚠️ 门禁**守不了什么**（写清楚，不藏）：
 *   · **不判图片内容对不对**（像素、比例、格式、颜色）—— 那是 IA1–IA7 的事。
 *   · **不判「真源里声明了但没人渲染」**（例如 site.js 里多写了一个 photo 键）
 *     —— 那是 AV1（作者图片）与 IA7（分享图声明在不在）的事。
 *   · **不判 src/assets/ 以外的图**（论文 / 博客封面由 eleventy.after 的
 *     copyCovers() 拷到 `_site/<section>/<slug>/`，不在 assets/ 下）。
 *   · **不判 CSS / JS** —— 各有各的发布门禁（CS* 与既有 JS 门禁）。
 *
 * 环境变量（自测要在**副本**上注入缺陷，不能改仓库里的真文件）：
 *   SITE_DIR   —— 产物目录（默认 _site）
 *   PKG_PATH   —— package.json 的路径（默认仓库根的 package.json）
 *   REPO_ROOT  —— 仓库根（默认本文件所在目录的上一级）——
 *                 自测用它把「源」「产物」整体指向夹具站。
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const REPO = process.env.REPO_ROOT ? path.resolve(process.env.REPO_ROOT) : ROOT;
const SITE = process.env.SITE_DIR ? path.resolve(process.env.SITE_DIR) : path.join(REPO, "_site");
const PKG = process.env.PKG_PATH ? path.resolve(process.env.PKG_PATH) : path.join(ROOT, "package.json");
const SELF = path.basename(__filename);

/* 判据开关：存在的唯一理由是自测的负对照要把某一条判据**单独**卸掉，
   证明「那一档的红确实来自这一条判据本身」。默认值恒为 true。 */
const IP1_ON = true;
const IP2_ON = true;
const IP3_ON = true;
const IP4_ON = true;
const IP5_ON = true;

/* IP4 的覆盖度下限：只要本站还在，就至少有一张图**被人引用**。
   ⚠️ 下限刻意取 1 而不是更大：下限取大会与其它判据**耦合** ——
   故意制造「少一张图」这类缺陷形态时，覆盖度也会跟着红，
   于是同一档出现两条判据的编号，红因归属就不可判定了。
   ⚠️ 「无引用的源图」**不设下限**：设计母版（og 的三个 SVG）本来就无人引用，
   它们将来被删掉之后不该让门禁凭空判红。 */
const MIN_REFERENCED = 1;

/* 图片扩展名。产物与源用同一套判据，避免「源里算图片、产物里不算」。 */
const IMAGE_EXT = /\.(?:png|jpe?g|gif|webp|avif|svg)$/i;

/* 源侧：图片资产目录（发布清单作用在这里）。
   产物侧：_site/assets/（图片副本都落在这里；
   论文 / 博客封面由 copyCovers() 拷到 _site/<section>/<slug>/，不在范围内）。 */
const SRC_ASSETS = path.join(REPO, "src", "assets");
const PROD_ASSETS = path.join(SITE, "assets");
/* 消费点的扫描面：src/ 下的全部文本文件。 */
const SRC_DIR = path.join(REPO, "src");

const problems = [];
/** 记一条判红。id 是判据编号（IPn）—— 自测靠它断言「红因归属纯净」。 */
function fail(id, msg) {
  problems.push(`${id}：${msg}`);
}
function report() {
  console.error("图片发布清单门禁未通过：\n");
  problems.forEach((p) => console.error(`  · ${p}`));
  console.error("");
  process.exit(1);
}

/* ================= 工具：文件枚举 ================= */

function walk(dir, acc) {
  acc = acc || [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (e.name.startsWith("._")) continue; // exFAT 上的 AppleDouble 资源叉
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

/** 目录下的图片相对路径（正斜杠风格，排序，跳过 AppleDouble 资源叉）。 */
function imageRels(dir) {
  const out = [];
  for (const f of walk(dir)) {
    if (!IMAGE_EXT.test(f)) continue;
    out.push(path.relative(dir, f).split(path.sep).join("/"));
  }
  out.sort();
  return out;
}

/* ================= 工具：剥注释（引用检测前必做） ================= */

/**
 * 剥掉 JS 的行注释与块注释，**保留字符串字面量**。
 * 自己扫一遍字符串是必要的：URL 里的 "https://" 不是注释，
 * 用正则一刀切会把后半行代码连同引用一起吃掉。
 */
function stripJsComments(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c;
      i++;
      while (i < n) {
        if (src[i] === "\\") {
          out += src.slice(i, i + 2);
          i += 2;
          continue;
        }
        out += src[i];
        if (src[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** 剥掉 Nunjucks 注释 {# … #} 与 HTML 注释 <!-- … -->。 */
function stripMarkupComments(src) {
  return src
    .replace(/\{#[\s\S]*?#\}/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

/** 按扩展名挑合适的剥法。 */
function codeOnly(file, text) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".js" || ext === ".cjs" || ext === ".mjs") return stripJsComments(text);
  if (ext === ".njk" || ext === ".md" || ext === ".html" || ext === ".css" || ext === ".svg")
    return stripMarkupComments(text);
  return text;
}

/* ================= 事实采集 ================= */

if (!fs.existsSync(SRC_ASSETS)) {
  console.error("图片发布清单门禁未通过：\n");
  console.error(`  ✗ 找不到源图片目录 src/assets —— 无法核对图片发布清单。`);
  console.error("");
  process.exit(1);
}
if (!fs.existsSync(PROD_ASSETS)) {
  console.error("图片发布清单门禁未通过：\n");
  console.error(`  ✗ 找不到产物图片目录 ${PROD_ASSETS} —— 先构建产物再跑本门禁。`);
  console.error("");
  process.exit(1);
}

const srcRels = imageRels(SRC_ASSETS);
const prodRels = imageRels(PROD_ASSETS);
const srcSet = new Set(srcRels);
const prodSet = new Set(prodRels);

/* ---- 消费点扫描：src/ 下的全部文本文件（剥注释后拼成一个大字符串） ---- */
const sourceCode = (() => {
  const chunks = [];
  for (const f of walk(SRC_DIR)) {
    if (!/\.(?:njk|js|cjs|mjs|json|css|html|md|txt|yml|yaml|svg)$/i.test(f)) continue;
    let text;
    try {
      text = fs.readFileSync(f, "utf8");
    } catch {
      continue;
    }
    chunks.push(codeOnly(f, text));
  }
  return chunks.join("\n");
})();

/**
 * 某张图在源代码里有没有消费点。
 * 词边界：左边不是字母/数字/`-`，右边不是字母/数字 ——
 *   免得 `a.png` 把 `ba.png` 也算成有引用。
 */
function hasConsumer(rel) {
  const name = path.basename(rel);
  const re = new RegExp(`(?<![A-Za-z0-9_-])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9])`);
  return re.test(sourceCode);
}

/** 源图 → 是否有消费点。 */
const referenced = new Map();
for (const rel of srcRels) referenced.set(rel, hasConsumer(rel));
const referencedSet = new Set([...referenced].filter(([, v]) => v).map(([k]) => k));

/* ================= IP1：死副本（没人引用的图不得出现在产物） ================= */

if (IP1_ON) {
  /* ⚠️ 走**源侧**：只有「源目录里有、且没人引用」的图进了产物才算死副本。
     产物里多出来的、源目录里根本没有的图是 IP3 的事（孤儿）——
     两条判据各管一边，同一处缺陷**只允许红一条**，红因归属才可判定。 */
  for (const rel of srcRels) {
    if (referenced.get(rel)) continue; // 有人引用 ⇒ 该发布（那是 IP2 的事）
    if (!prodSet.has(rel)) continue; // 没人引用、也没发布 ⇒ 正是想要的，不判红
    fail("IP1",
      `产物 _site/assets/${rel} 是**没人引用的副本** —— ` +
        `它在源目录里，但**源代码里没有任何地方引用它**（注释里提到不算）。` +
        `它占着部署体积，却没有任何页面会去请求它。` +
        `若它是设计母版（分享图的 SVG 源），请把它从构建的直拷清单里去掉` +
        `（eleventy.config.js 的 assetGlobs）；若它该被用上，请在代码里真的引用它。`
    );
  }
}

/* ================= IP2：漏拷（被引用的图必须在产物里） ================= */

if (IP2_ON) {
  for (const rel of srcRels) {
    if (!referenced.get(rel)) continue;
    if (prodSet.has(rel)) continue;
    fail("IP2",
      `源图片 src/assets/${rel} **被代码引用了却没出现在产物里** —— ` +
        `页面会拿它当 <img src> / <meta content>，副本不在就直接 404。` +
        `请把它加进 eleventy.config.js 的 assetGlobs 直拷清单` +
        `（若它不在 src/assets/ 下，请先确认它的发布路径由谁负责）。`
    );
  }
}

/* ================= IP3：孤儿（产物里的图必须有源） ================= */

if (IP3_ON) {
  for (const rel of prodRels) {
    if (srcSet.has(rel)) continue;
    fail("IP3",
      `产物 _site/assets/${rel} **在源目录 src/assets/ 里已经不存在了** —— ` +
        `这是没人认领的残留副本（源文件删了、构建清单没跟着改）。`
    );
  }
}

/* ================= IP4：覆盖度自证 ================= */

if (IP4_ON) {
  if (referencedSet.size < MIN_REFERENCED) {
    fail("IP4",
      `一张「有消费点」的源图都没认出（认出 ${referencedSet.size} 张）—— ` +
        `引用检测器可能坏了，不是「没问题」。`
    );
  }
  if (prodRels.length === 0) {
    fail("IP4",
      `产物 _site/assets/ 一张图都没认出来 —— 枚举器可能坏了，不是「没问题」。`
    );
  }
}

/* ================= IP5：门禁自己没被卸掉 ================= */

if (IP5_ON) {
  let pkg = null;
  try {
    pkg = JSON.parse(fs.readFileSync(PKG, "utf8"));
  } catch (e) {
    fail("IP5", `读不到 package.json（${e.message}）—— 无法确认本门禁接在 build 链上。`);
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
      fail("IP5", `门禁自己被卸掉了：package.json 的 build 链里没有指向 scripts/${SELF} 的 script。`);
    }
  }
}

/* ================= 通过 ================= */

if (problems.length) {
  report();
}

const refCount = referencedSet.size;
console.log(
  `图片发布清单门禁通过：源图片 ${srcRels.length} 张（被引用 ${refCount} / 无消费点 ${srcRels.length - refCount}）、` +
    `产物 ${prodRels.length} 张 —— 发布类与产物严格一致：` +
    `既没有没人引用的副本，也没有漏拷的图。`
);
if (srcRels.length - refCount > 0) {
  console.log(
    `  · 不发布（源代码里没有消费点）：` +
      srcRels.filter((r) => !referenced.get(r)).join(" / ")
  );
}
