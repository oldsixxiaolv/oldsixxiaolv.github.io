#!/usr/bin/env node
/**
 * 门禁 AV1–AV6：作者图片资产集合必须与真源字段的引用集合**完全一致**
 *
 * 为什么要有这个门禁（一次实测坐实的看护缺口，不是假想）：
 *   `src/_data/site.js` 的 `author.photo` 里曾经**并列过两组**照片：
 *     · portrait / portraitSmall / portraitSize —— 600×750 竖版，**全站在用**
 *       （about.njk、hero.njk 的 <img>、srcset、Person JSON-LD 的 image）
 *     · avatar / avatarSmall / avatarSize —— 600×600 方形，**全仓零消费点**
 *   方形那组是「改过名没删干净」的遗留：字段还在、文件还在
 *   （src/assets/img/author/avatar.jpg 与 avatar-sm.jpg），
 *   于是它们**照样被打进产物**（合计约 60 余 KB），却**没有任何页面引用它们**。
 *
 *   危害有三层：
 *     ① 产物里多出两份没人要的作者照片（部署体积白付）；
 *     ② 真源里 `author.photo.avatar` 与 `author.photo.portrait` **语义重叠** ——
 *        后来的人照着写模板会拿到一个尺寸口径不同的旧照；
 *     ③ 「改过名没删干净」这件事**没有任何门禁守着** —— 下次再引入一张
 *        没人用的作者图，同样会静静进产物。
 *
 *   ⇒ 本门禁把「作者图片资产」这一族钉死：
 *     源目录里不该有没人引用的文件，产物目录里不该有真源之外的残留，
 *     真源里不该有没人用的资产键。
 *
 * 六条判据（编号用独立字母体系 AV*，**不与既有前缀冲突**：
 *   check-a11y 的 A*、check-img-srcset 的 SX*、check-img-loading 的 IL*、
 *   check-image-assets 的 IA*、check-third-party 的 TD*、check-home-chart 的 HC*、
 *   check-page-deps 的 LM*、check-gates-wired 的 GW*、check-readme 的 RD*、
 *   check-doc-snapshot 的 DS*、check-author-assets（本门禁）的 AV* 均不同名）：
 *   AV1 `author.photo` 下**每个资产键**（值是图片路径的键）都必须有**真实消费点**
 *      —— 消费点 = 模板 / 脚本 / 配置的**代码**里引用了它。
 *      ⚠️ 消费点检测**先剥注释**再匹配：别处注释里的一句「见 photo.xxx」
 *      不算消费（否则门禁能被一句注释糊弄过去）。
 *   AV2 每个资产键指向的源文件必须在 `src/assets/` 下**真实存在** ——
 *      防「字段指向不存在的文件」（页面会拿它当 <img src> ⇒ 直接断图）。
 *   AV3 `src/assets/img/author/` 下的**每个文件**都必须被某个资产键引用 ——
 *      防「文件在、没人用」（本轮那条遗留正是这一族）。
 *   AV4 **产物** `assets/img/author/` 下的文件集合必须与资产键引用的集合
 *      **完全一致**（既不多也不少）—— 多出来的就是漏删的旧文件。
 *   AV5 **覆盖度自证** —— 资产键 / 源文件 / 产物文件三样，每一样都**至少要认到一处**，
 *      一处都没认到说明枚举器坏了，不是「没问题」。
 *   AV6 **门禁自己没被卸掉** —— package.json 的 build 链里必须真的有本门禁。
 *
 * ⚠️ 门禁**守不了什么**（写清楚，不藏）：
 *   · **不判这些照片好不好看、尺寸对不对** —— 那是审美与视觉取舍，不归本门禁。
 *   · **不判别的图片目录**（og 图、论文配图、论文封面）—— 它们各有各的
 *     约定（og 图是对外分享图、论文封面由 front matter 指定），
 *     混进「作者图片」这一族会误判。本门禁只管 author 目录。
 *   · **不判数据源里的非资产键**（如 `alt`、`portraitSize` 这类尺寸/文本键）——
 *     AV1 只管「值是图片路径」的键；`alt` 这类键有没有被用，由别的门禁与
 *     读代码的人负责，混进来会让本门禁对现状变红。
 *   · **消费点的判定是「文本里出现了引用」**，不是「运行时真的用它」——
 *     本站是静态站，模板里写了就是用了。
 *
 * 环境变量（自测要在**副本**上注入缺陷，不能改仓库里的真文件）：
 *   SITE_DIR   —— 产物目录（默认 _site）
 *   PKG_PATH   —— package.json 的路径（默认仓库根的 package.json）
 *   REPO_ROOT  —— 仓库根（默认本文件所在目录的上一级）——
 *                 自测用它把「真源」「源目录」「消费点扫描范围」整体指向夹具站。
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const REPO = process.env.REPO_ROOT ? path.resolve(process.env.REPO_ROOT) : ROOT;
const SITE = process.env.SITE_DIR ? path.resolve(process.env.SITE_DIR) : path.join(REPO, "_site");
const PKG = process.env.PKG_PATH ? path.resolve(process.env.PKG_PATH) : path.join(REPO, "package.json");
const SELF = path.basename(__filename);

/* 判据开关：存在的唯一理由是自测的负对照要把某一条判据**单独**卸掉，
   证明「那一档的红确实来自这一条判据本身」。默认值恒为 true。 */
const AV1_ON = true;
const AV2_ON = true;
const AV3_ON = true;
const AV4_ON = true;
const AV5_ON = true;
const AV6_ON = true;

/* AV5 的覆盖度下限（只要本站还在，这三样每一类都得**比过至少一处**；
   一处都没有说明枚举器坏了，不是「没问题」）。
   ⚠️ 下限刻意取 1 而不是更大：下限取大会与其它判据**耦合** ——
   故意制造「少一个文件」这类缺陷形态时，覆盖度也会跟着红，
   于是同一档出现两条判据的编号，红因归属就不可判定了。 */
const MIN_ASSET_KEYS = 1;
const MIN_SOURCE_FILES = 1;
const MIN_SITE_FILES = 1;

const problems = [];
/** 记一条判红。id 是判据编号（AVn）—— 自测靠它断言「红因归属纯净」。 */
function fail(id, msg) {
  problems.push(`${id}：${msg}`);
}
function report() {
  console.error("作者图片资产门禁未通过：\n");
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

/* ================= 工具：剥注释（消费点检测前必做） ================= */

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
  if (ext === ".njk" || ext === ".md" || ext === ".html" || ext === ".css") return stripMarkupComments(text);
  return text;
}

/* ================= 工具：真源 ================= */

const SITE_JS = path.join(REPO, "src", "_data", "site.js");
if (!fs.existsSync(SITE_JS)) {
  console.error("作者图片资产门禁未通过：\n");
  console.error(`  ✗ 找不到真源 ${SITE_JS} —— 无法核对作者图片资产。`);
  console.error("");
  process.exit(1);
}
let siteData;
try {
  siteData = require(SITE_JS);
} catch (e) {
  console.error("作者图片资产门禁未通过：\n");
  console.error(`  ✗ 真源 ${SITE_JS} 读不出来（${e.message}）—— 无法核对作者图片资产。`);
  console.error("");
  process.exit(1);
}

const photo = (siteData.author && siteData.author.photo) || {};
const IMAGE_EXT = /\.(?:png|jpe?g|gif|webp|avif|svg)$/i;

/** 资产键 = 值是「以 / 开头的图片路径」的键。其它键（尺寸、alt）不归本门禁管。 */
const assetKeys = Object.keys(photo).filter((k) => {
  const v = photo[k];
  return typeof v === "string" && v.startsWith("/") && IMAGE_EXT.test(v);
});

/** 资产键 → 源文件绝对路径（真源里的路径以 /assets/ 开头，对应仓库的 src/assets/）。 */
const sourceFileOf = (key) => path.join(REPO, "src", photo[key].replace(/^\//, ""));
/** 资产键 → 产物相对路径（/assets/… 去掉开头的斜杠）。 */
const siteRelOf = (key) => photo[key].replace(/^\//, "");

/* ================= 工具：消费点扫描 ================= */

/** 扫哪些文件找消费点：模板、脚本、配置、文档。 */
const SCAN_DIRS = ["src", "scripts"];
const SCAN_FILES = ["eleventy.config.js", "package.json"];

/**
 * 消费点 = 「代码里」出现了 photo.<键>。
 * 扫描时**排除**：真源自身（那是定义处）、本门禁与它的自测（检查者不是使用者，
 *   否则门禁/自测里写一句就能自证通过）。
 */
function findConsumers(key) {
  const re = new RegExp("\\bphoto\\." + key + "\\b");
  const hits = [];
  const skip = new Set([path.resolve(SITE_JS)]);
  for (const d of SCAN_DIRS) {
    for (const f of walk(path.join(REPO, d))) {
      const abs = path.resolve(f);
      if (skip.has(abs)) continue;
      if (abs === path.resolve(__filename)) continue;
      if (abs === path.resolve(path.join(REPO, "scripts", "test-author-assets.cjs"))) continue;
      if (!/\.(?:njk|js|cjs|mjs|md|css|json|yml|yaml)$/i.test(f)) continue;
      let text;
      try {
        text = fs.readFileSync(f, "utf8");
      } catch {
        continue;
      }
      if (re.test(codeOnly(f, text))) hits.push(path.relative(REPO, f).split(path.sep).join("/"));
    }
  }
  for (const f of SCAN_FILES) {
    const abs = path.join(REPO, f);
    if (!fs.existsSync(abs)) continue;
    let text;
    try {
      text = fs.readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    if (re.test(codeOnly(abs, text))) hits.push(f);
  }
  return hits;
}

/* ================= AV1：资产键必须有真实消费点 ================= */

const consumerMap = new Map();
for (const key of assetKeys) {
  const hits = findConsumers(key);
  consumerMap.set(key, hits);
  if (AV1_ON && hits.length === 0) {
    fail("AV1",
      `真源 author.photo 的「${key}」（${photo[key]}）**全仓找不到消费点** —— ` +
        `没有任何模板 / 脚本 / 配置在代码里用它（注释里提到不算）。` +
        `这样的键是「改过名没删干净」的遗留：它对应的文件仍会被打进产物却没人引用。` +
        `请删掉这个键（连同它指向的文件），或让它真的被用上。`
    );
  }
}

/* ================= AV2：资产键指向的源文件必须存在 ================= */

for (const key of assetKeys) {
  if (!AV2_ON) break;
  const f = sourceFileOf(key);
  if (!fs.existsSync(f)) {
    fail("AV2",
      `真源 author.photo 的「${key}」指向 ${photo[key]}，但源文件 ` +
        `${path.relative(REPO, f).split(path.sep).join("/")} **不存在** —— ` +
        `页面会拿它当 <img src>，直接断图。`
    );
  }
}

/* ================= AV3：源目录里不许有没人引用的文件 ================= */

const AUTHOR_SRC = path.join(REPO, "src", "assets", "img", "author");
const sourceFiles = walk(AUTHOR_SRC).map((f) => path.basename(f)).sort();
const referencedSrc = new Set(assetKeys.map((k) => path.basename(sourceFileOf(k))));

if (AV3_ON) {
  for (const name of sourceFiles) {
    if (!referencedSrc.has(name)) {
      fail("AV3",
        `源目录 src/assets/img/author/ 里的 ${name} **没有任何真源字段引用它** —— ` +
          `它会被原样拷进产物（访客下载得到，却没有任何页面用）。` +
          `要么在 author.photo 里给它一个键并真的用上，要么把它从仓库里删掉。`
      );
    }
  }
}

/* ================= AV4：产物目录的文件集合必须与引用集合一致 ================= */

const AUTHOR_SITE = path.join(SITE, "assets", "img", "author");
const siteFiles = walk(AUTHOR_SITE).map((f) => path.basename(f)).sort();
const referencedSite = new Set(assetKeys.map((k) => path.basename(siteRelOf(k))));

if (AV4_ON) {
  for (const name of siteFiles) {
    if (!referencedSite.has(name)) {
      fail("AV4",
        `产物 assets/img/author/ 里的 ${name} **不在真源引用的集合里** —— ` +
          `这是漏删的旧文件（源目录里可能已删，但产物里还留着）。`
      );
    }
  }
  for (const name of referencedSite) {
    if (siteFiles.includes(name)) continue;
    /* 「产物少了」只在**源文件确实存在**时判 —— 源文件都不存在的情况
       归 AV2（字段指向不存在的文件）管，两条判据不重复、也不互相污染红因。 */
    if (!fs.existsSync(path.join(AUTHOR_SRC, name))) continue;
    fail("AV4",
      `真源引用的 ${name} **在产物里不存在**（源文件在，构建没拷进去）—— ` +
        `页面会拿它当 <img src>，直接断图。`
    );
  }
}

/* ================= AV5：覆盖度自证 ================= */

if (AV5_ON) {
  if (assetKeys.length < MIN_ASSET_KEYS) {
    fail("AV5",
      `真源 author.photo 一个资产键都没认出（认出 ${assetKeys.length} 个）—— ` +
        `枚举器可能坏了，不是「没问题」。`
    );
  }
  if (sourceFiles.length < MIN_SOURCE_FILES) {
    fail("AV5",
      `源目录 src/assets/img/author/ 一个文件都没认出（认出 ${sourceFiles.length} 个）` +
        `—— 枚举器可能坏了，不是「没问题」。`
    );
  }
  if (siteFiles.length < MIN_SITE_FILES) {
    fail("AV5",
      `产物目录 assets/img/author/ 一个文件都没认出（认出 ${siteFiles.length} 个）` +
        `—— 枚举器可能坏了，不是「没问题」。`
    );
  }
}

/* ================= AV6：门禁自己没被卸掉 ================= */

if (AV6_ON) {
  let pkg = null;
  try {
    pkg = JSON.parse(fs.readFileSync(PKG, "utf8"));
  } catch (e) {
    fail("AV6", `读不到 package.json（${e.message}）—— 无法确认本门禁接在 build 链上。`);
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
      fail("AV6", `门禁自己被卸掉了：package.json 的 build 链里没有指向 scripts/${SELF} 的 script。`);
    }
  }
}

/* ================= 汇总 ================= */

if (problems.length) report();

const keyList = assetKeys.join(" / ");
console.log(
  `作者图片资产门禁通过：真源 author.photo 的 ${assetKeys.length} 个资产键（${keyList}）` +
    `都有真实消费点、指向的源文件都存在；源目录 ${sourceFiles.length} 个文件与产物目录 ` +
    `${siteFiles.length} 个文件**一一对应**，没有没人引用的残留；本门禁接在 build 链上。`
);
