#!/usr/bin/env node
/**
 * check-page-deps.cjs · 页面依赖闭包门禁（LM1–LM5）
 * ---------------------------------------------------------------------------
 * 为什么要有它（一次具体的实测，不是假想）：
 *   sitemap 的 <lastmod> 语义是「这个 URL 的**内容**最后一次改变的时间」。
 *   2026-10-21 实测：首页 <lastmod> 停在 2026-10-21T03:07:24Z
 *   （= src/index.njk 自己的提交时间），而首页渲染的
 *   src/_data/extremePrecip.json 在 05:05:04Z 才改过
 *   ⇒ sitemap 谎称「首页自 03:07 起没变过」。
 *   而**没有任何门禁发现**：verify-site 的规则 18 与 check-jsonld 的 J11
 *   恰恰要求 lastmod 精确等于「自己源文件」的时间 —— 把错语义钉死了。
 *
 *   D32 的修法：lastmod 改成「依赖闭包里最晚的提交时间」
 *   （scripts/lib/page-deps.cjs 里定义了闭包的六条规则），构建侧与两处门禁
 *   都调同一个函数。
 *
 *   ⚠️ 但那三处**共用同一个函数** ⇒ 它们可能**一起错**：闭包算法一旦退化，
 *   三处会一致地给出同一个错值，全都判绿。所以本门禁提供的是
 *   **不依赖那个函数算出的时间戳**的独立证据 ——
 *   它只看「闭包的结构」与「产物里的实际内容」，一个时间戳都不碰。
 *
 * 五条判据：
 *   LM1 闭包非退化 —— 每页闭包必含自身源文件，且依赖数 ≥ 2
 *       （退化成「只有自己」= D34 的病根形态）。
 *   LM2 闭包可信 —— ① 闭包里没有「引用了但文件不存在」的项（含页面自身）；
 *       ② 站点所有模板的 include / extends / import / from 目标都是**字面量**
 *       （写成变量 ⇒ 扫描器看不见 ⇒ 闭包不可信 ⇒ 少报）。
 *   LM3 覆盖度自证 —— sitemap 的 <url> 条数 ≥ 1；每条都带 <!-- source: -->
 *       标注、标注互不重复、且都能找到对应产物；
 *       条数与产物里的 HTML 页数一致（没有页面被漏出 sitemap）。
 *   LM4 内容级交叉验证 —— 数据文件的**特征串**出现在某页产物 HTML 里
 *       ⇒ 该文件必须在该页闭包里（抓「闭包漏收数据文件」的独立证据）。
 *   LM5 全局数据登记齐全 —— eleventy.config.js 里每个 addGlobalData("X")
 *       都在 page-deps.cjs 的 GLOBAL_DATA_DEPS 里有登记，
 *       且登记的文件真实存在；addGlobalData 的参数必须是字面量。
 *
 * ⚠️ 本门禁的边界（写清楚，别把它的保证当无限）：
 *   · 它**不核对时间戳本身**。lastmod 的值对不对，由 verify-site 规则 18 与
 *     check-jsonld 的 J11 负责（那两处与构建侧共用 page-deps.cjs）。
 *     本门禁守的是「闭包这个集合算得对不对」，两者互补。
 *   · LM4 的特征串是**抽样**：每个数据文件只取最长的若干条（见
 *     FEATURE_STRING_LIMIT），所以它能证明「闭包漏收了这个文件」，
 *     证明不了「闭包多收了这个文件」（多收只是 lastmod 偏晚，不会谎称没变）。
 *   · 特征串只在**产物 HTML** 里找。某页不渲染某个数据文件，
 *     自然不会产生证据 —— 那种情况由 LM1/LM2 的结构性判据兜底。
 *   · LM2② 只认**字面量**路径；写成变量就判红。这是有意的取舍：
 *     宁可多报（要求作者把路径写成字面量），也不要闭包静默少收。
 *
 * 两个输入可用环境变量改（自测脚本要在**副本**上做注入，不能碰仓库里的文件）：
 *   SITE_DIR          产物目录（默认 _site）
 *   METEO_REPO_ROOT   源码树根（默认仓库根；由 scripts/lib/page-deps.cjs 读取）
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { pageDeps, GLOBAL_DATA_DEPS, REPO_ROOT } = require("./lib/page-deps.cjs");

const ROOT = path.resolve(__dirname, "..");
const SITE = path.resolve(process.env.SITE_DIR || path.join(ROOT, "_site"));

/* ---- 可调参数（自测的负对照会改这两个常量，所以放在文件顶部、有稳定名字） ---- */

/* LM1：闭包至少要有几个文件。「只有自己」= D34 病根形态。 */
const MIN_CLOSURE_FILES = 2;

/* LM4：每个数据文件取几条特征串（取最长的几条，最有区分度）。 */
const FEATURE_STRING_LIMIT = 3;

/* LM4：特征串的最短长度（太短的串在别处也会出现，判不出因果）。 */
const FEATURE_STRING_MIN_LEN = 24;

/* LM4：至少要有多少条「内容确实出现在产物里」的证据。
   0 条 ⇒ 特征串提取或匹配坏了 ⇒ 这条判据是**空跑**（永远绿），必须判红。
   （自测的负对照会把这个下限调到 0，好证明 LT2/LT5 的红确实来自这两条判据。） */
const MIN_FEATURE_EVIDENCE = 1;

/* LM3：产物里这些 HTML 不是「页面」，不计入 sitemap 条数核对。 */
const NON_PAGE_HTML = ["404.html"];

/* LM1：闭包天然只有一个文件的页面，在这里登记并写明理由。
   ⚠️ 现在是空的：全站每一页都有版式或数据依赖，闭包都不止一个文件。
   将来真有「独立到底」的单文件页面时才登记，且必须写明理由。 */
const MIN_CLOSURE_EXEMPT = {};

let problems = 0;
function bad(msg) {
  problems += 1;
  console.error(`  ✗ ${msg}`);
}
function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

function readOrNull(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch (_) {
    return null;
  }
}

function walkFiles(dir, matchRe) {
  const out = [];
  (function walk(d) {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (matchRe.test(e.name)) out.push(full);
    }
  })(dir);
  return out.sort();
}

function relOf(abs) {
  const rel = path.relative(REPO_ROOT, path.resolve(abs));
  if (!rel || rel.startsWith("..")) return null;
  return rel.split(path.sep).join("/");
}

/* ================================================================== *
 * 读 sitemap：每个 <url> 块 → { loc, source, outputFile }
 * ================================================================== */
const sitemapPath = path.join(SITE, "sitemap.xml");
const sitemapText = readOrNull(sitemapPath);
if (sitemapText === null) {
  console.error(`  ✗ LM3 找不到 sitemap 产物：${sitemapPath}`);
  process.exit(1);
}

const pages = [];
{
  const blocks = sitemapText.match(/<url>[\s\S]*?<\/url>/g) || [];
  for (const block of blocks) {
    const loc = (block.match(/<loc>([\s\S]*?)<\/loc>/) || [])[1] || "";
    const source = (block.match(/<!--\s*source:\s*([^>]*?)\s*-->/) || [])[1] || "";
    pages.push({ loc, source, outputFile: outputFileFor(loc), block });
  }
}

/** <loc> → 产物 HTML 的绝对路径（dir/index.html 或 x.html，两种都试）。 */
function outputFileFor(loc) {
  let pathname = loc;
  const m = loc.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/]*(\/.*)?$/);
  if (m) pathname = m[1] || "/";
  pathname = pathname.split("?")[0].split("#")[0];
  const trimmed = pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!trimmed) return path.join(SITE, "index.html");
  const dirForm = path.join(SITE, ...trimmed.split("/"), "index.html");
  if (fs.existsSync(dirForm)) return dirForm;
  const fileForm = path.join(SITE, ...trimmed.split("/")) + ".html";
  return fileForm;
}

/* ================================================================== *
 * LM1 / LM2 —— 逐页看闭包
 * ================================================================== */
const closures = new Map(); // source → { deps, missing }

{
  let lm1Bad = 0;
  let lm2Bad = 0;
  for (const page of pages) {
    const src = page.source;
    if (!src) continue; // LM3 会报「缺标注」，这里不重复报
    const c = pageDeps(src);
    closures.set(src, c);

    // LM1：闭包含自身 + 依赖数达标
    if (!c.deps.includes(src)) {
      bad(`LM1 ${src} 的依赖闭包里没有它自己 —— 闭包算错了，lastmod 无从谈起`);
      lm1Bad += 1;
    } else if (!(src in MIN_CLOSURE_EXEMPT) && c.deps.length < MIN_CLOSURE_FILES) {
      bad(
        `LM1 ${src} 的依赖闭包只有 ${c.deps.length} 个文件（${c.deps.join("、")}）—— ` +
          `闭包退化成「只看自己」了，这正是 D34 的病根形态（页面内容由别的文件提供时 lastmod 会原地不动）`
      );
      lm1Bad += 1;
    }

    // LM2①：闭包里没有「引用了但文件不存在」的项
    if (c.missing.length) {
      bad(
        `LM2 ${src} 的依赖闭包里引用了不存在的文件：${c.missing.join("、")} —— ` +
          `闭包算不出来，这种情况下 lastmod 一定是错的`
      );
      lm2Bad += 1;
    }
  }
  if (!lm1Bad) ok(`LM1 闭包非退化（${pages.length} 页，每页闭包都含自身且依赖数 ≥ ${MIN_CLOSURE_FILES}）`);
  if (!lm2Bad) ok("LM2① 闭包里的每个被引用文件都真实存在");
}

/* ================================================================== *
 * LM2② —— 所有模板的 include/extends/import/from 目标都必须是字面量
 * ================================================================== */
{
  const TEMPLATE_RE = /\{%-?\s*(include|extends|import|from)\s+([\s\S]*?)\s*-?%\}/g;
  const COMMENT_RE = /\{#[\s\S]*?#\}/g; // Nunjucks 注释：里面的东西不是真指令
  const templates = walkFiles(path.join(REPO_ROOT, "src"), /\.(njk|md|html|liquid)$/i);
  const bads = [];
  for (const file of templates) {
    const raw = readOrNull(file);
    if (raw === null) continue;
    const stripped = raw.replace(COMMENT_RE, "");
    TEMPLATE_RE.lastIndex = 0;
    let m;
    while ((m = TEMPLATE_RE.exec(stripped)) !== null) {
      const arg = m[2].trim();
      if (arg.startsWith('"') || arg.startsWith("'")) continue;
      bads.push(`${relOf(file)} :: {% ${m[1]} ${arg} %}`);
    }
  }
  if (bads.length) {
    for (const b of bads) {
      bad(`LM2 ${b} 的目标不是字面量 —— 扫描器看不见它 ⇒ 这一页的依赖闭包会漏收它（少报）`);
    }
  } else {
    ok(`LM2② 所有模板的 include/extends/import/from 目标都是字面量（扫了 ${templates.length} 个模板文件）`);
  }
}

/* ================================================================== *
 * LM3 —— 覆盖度自证
 * ================================================================== */
{
  let lm3Bad = 0;
  if (pages.length < 1) {
    bad("LM3 sitemap 里一条 <url> 都没有 —— 没有任何页面被闭包分析覆盖");
    lm3Bad += 1;
  }
  const seenSource = new Map();
  for (const page of pages) {
    if (!page.source) {
      bad(`LM3 ${page.loc || "(没有 loc)"} 这条 <url> 没有 <!-- source: --> 标注 —— 不知道它对应哪个源文件，闭包无从谈起`);
      lm3Bad += 1;
      continue;
    }
    if (seenSource.has(page.source)) {
      bad(`LM3 ${page.source} 被两条 <url> 同时标注（${seenSource.get(page.source)} 与 ${page.loc}）—— 标注与 URL 不是一一对应`);
      lm3Bad += 1;
    } else {
      seenSource.set(page.source, page.loc);
    }
    if (!fs.existsSync(path.join(REPO_ROOT, page.source))) {
      bad(`LM3 ${page.loc} 的 <!-- source: --> 指向 ${page.source}，但这个文件在仓库里不存在`);
      lm3Bad += 1;
    }
    if (!fs.existsSync(page.outputFile)) {
      bad(`LM3 ${page.loc} 在产物里找不到对应的 HTML（试过 ${relOf(page.outputFile) || page.outputFile}）—— 这一页的闭包无法交叉验证`);
      lm3Bad += 1;
    }
  }
  const htmlPages = walkFiles(SITE, /\.html$/i).filter((f) => !NON_PAGE_HTML.includes(path.basename(f)));
  if (pages.length !== htmlPages.length) {
    bad(
      `LM3 sitemap 有 ${pages.length} 条 <url>，产物里有 ${htmlPages.length} 个 HTML 页（不含 ${NON_PAGE_HTML.join("、")}）—— ` +
        `数量对不上：有页面被漏出 sitemap（它的依赖闭包就没人分析），或 sitemap 多写了`
    );
    lm3Bad += 1;
  }
  if (!lm3Bad) ok(`LM3 覆盖度自证（${pages.length} 条 <url>，逐条都有唯一的 source 标注，条数与产物的 ${htmlPages.length} 个 HTML 页一致）`);
}

/* ================================================================== *
 * LM4 —— 内容级交叉验证（独立证据：不碰时间戳，只看产物里到底有什么）
 * ================================================================== */
const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
function htmlEscape(s) {
  return s.replace(/[&<>"]/g, (c) => HTML_ESCAPES[c]);
}
/** 产物里出现了这个串？原文与 HTML 转义形态都试。 */
function htmlContains(html, text) {
  if (html.includes(text)) return true;
  const esc = htmlEscape(text);
  return esc !== text && html.includes(esc);
}

function collectJsonStrings(value, out) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectJsonStrings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => collectJsonStrings(v, out));
}

function collectJsStrings(raw) {
  const out = [];
  const re = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
  let m;
  while ((m = re.exec(raw)) !== null) out.push(m[0].slice(1, -1));
  return out;
}

/** 去掉块级标记（标题 / 列表 / 引用），剩下的才是正文。 */
function stripBlockPrefix(line) {
  return line
    .replace(/^\s{0,3}#{1,6}\s+/, "")
    .replace(/^\s*[-*+]\s+/, "")
    .replace(/^\s*\d+[.)]\s+/, "")
    .replace(/^\s*>\s?/, "");
}

/**
 * 一行 markdown → 若干「保证在 HTML 里连续」的纯文本段。
 * 规则：遇到标记就断开。**绝不把被删掉的标记两侧拼成一段** ——
 * 那样拼出来的串在 HTML 里并不连续（标记会变成标签），一匹配就误报。
 */
function markdownRuns(line) {
  const runs = [];
  let cur = "";
  const flush = () => {
    if (cur) runs.push(cur);
    cur = "";
  };
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === "\\" && i + 1 < line.length) {
      cur += line[i + 1]; // 转义：下一个字符按字面量处理
      i += 2;
      continue;
    }
    if (ch === "!" && line[i + 1] === "[") {
      const close = line.indexOf(")", i);
      flush();
      i = close > 0 ? close + 1 : line.length;
      continue;
    }
    if (ch === "`") {
      const close = line.indexOf("`", i + 1);
      flush();
      if (close > 0) {
        runs.push(line.slice(i + 1, close));
        i = close + 1;
      } else {
        i = line.length;
      }
      continue;
    }
    if (ch === "*" || ch === "_") {
      flush();
      i += line[i + 1] === ch ? 2 : 1;
      continue;
    }
    if (ch === "[") {
      const closeBracket = line.indexOf("]", i);
      if (closeBracket > 0 && line[closeBracket + 1] === "(") {
        const closeParen = line.indexOf(")", closeBracket + 2);
        flush();
        if (closeParen > 0) {
          runs.push(line.slice(i + 1, closeBracket)); // 链接文字：锚文本在 HTML 里连续
          i = closeParen + 1;
          continue;
        }
      }
      flush();
      i += 1;
      continue;
    }
    if (ch === "<") {
      const close = line.indexOf(">", i);
      if (close > 0) {
        flush();
        i = close + 1;
        continue;
      }
    }
    cur += ch;
    i += 1;
  }
  flush();
  return runs;
}

/* 特征串的「唯一性」过滤：同一个串如果在 src/ 下别的文本文件里也出现，
   那它就不能用来判定「这一页用了这个数据文件」（可能是巧合）。 */
const SRC_TEXT_RE = /\.(njk|md|js|cjs|mjs|json|html|liquid)$/i;
let srcTextCache;
function srcTextFiles() {
  if (srcTextCache) return srcTextCache;
  srcTextCache = walkFiles(path.join(REPO_ROOT, "src"), SRC_TEXT_RE).map((f) => ({
    abs: f,
    text: readOrNull(f) || "",
  }));
  return srcTextCache;
}

function isUniqueInSrc(text, selfAbs) {
  for (const f of srcTextFiles()) {
    if (f.abs === selfAbs) continue;
    if (f.text.includes(text)) return false;
  }
  return true;
}

/** 一个数据文件 → 它的特征串（最长的若干条）。 */
function featureStringsFor(rel) {
  const abs = path.join(REPO_ROOT, rel);
  const raw = readOrNull(abs);
  if (raw === null) return [];
  const ext = path.extname(rel).toLowerCase();
  let candidates;
  if (ext === ".json") {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      return [];
    }
    candidates = [];
    collectJsonStrings(parsed, candidates);
  } else if (ext === ".js" || ext === ".cjs" || ext === ".mjs") {
    candidates = collectJsStrings(raw);
  } else if (ext === ".md") {
    candidates = [];
    for (const line of raw.split(/\r?\n/)) {
      for (const run of markdownRuns(stripBlockPrefix(line))) candidates.push(run);
    }
  } else {
    return [];
  }

  const seen = new Set();
  const picked = [];
  for (const s of candidates) {
    if (typeof s !== "string") continue;
    const t = s.trim();
    if (t.length < FEATURE_STRING_MIN_LEN) continue;
    if (!t.includes(" ")) continue;
    // 这些字符在 HTML 里会被转义 ⇒ 原串在产物里不连续，别拿来当证据
    if (/[&<>"']/.test(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    if (!isUniqueInSrc(t, abs)) continue;
    picked.push(t);
  }
  picked.sort((a, b) => b.length - a.length);
  return picked.slice(0, FEATURE_STRING_LIMIT);
}

/* 本门禁关注的「数据文件」：src/_data/ 下的全部文件 + GLOBAL_DATA_DEPS 登记的。 */
function dataFilesInScope() {
  const set = new Set();
  const dir = path.join(REPO_ROOT, "src/_data");
  if (fs.existsSync(dir)) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isFile()) set.add(`src/_data/${e.name}`);
    }
  }
  for (const deps of Object.values(GLOBAL_DATA_DEPS)) {
    for (const p of deps) set.add(p);
  }
  return [...set].sort();
}

{
  const dataFiles = dataFilesInScope();
  const feats = new Map();
  for (const df of dataFiles) feats.set(df, featureStringsFor(df));
  const withFeats = dataFiles.filter((d) => (feats.get(d) || []).length > 0);

  let lm4Bad = 0;
  let evidence = 0; // 「产物里确实出现了这个数据文件的内容」的证据条数
  for (const page of pages) {
    const html = readOrNull(page.outputFile);
    if (html === null) continue; // LM3 已经报过
    const c = closures.get(page.source);
    if (!c) continue;
    for (const df of dataFiles) {
      const hit = (feats.get(df) || []).find((f) => htmlContains(html, f));
      if (!hit) continue;
      evidence += 1;
      if (c.deps.includes(df)) continue;
      bad(
        `LM4 ${page.loc} 的产物里出现了 ${df} 的内容（特征串「${hit.slice(0, 48)}…」），` +
          `但 ${df} 不在这一页的依赖闭包里 —— 闭包漏收了它 ⇒ 这一页的 lastmod 会少报`
      );
      lm4Bad += 1;
    }
  }
  /* ⚠️ 空跑检查：一条特征串都没在任何产物里命中 ⇒ 要么特征串提取坏了，
     要么匹配坏了 —— 这时 LM4 是「永远绿」的假绿，跟没写一样。
     判据自己必须能证明它**确实在比对**。 */
  if (evidence < MIN_FEATURE_EVIDENCE) {
    bad(
      `LM4 只拿到 ${evidence} 条「内容确实出现在产物里」的证据（下限 ${MIN_FEATURE_EVIDENCE}）—— ` +
        `特征串提取或匹配坏了，这条判据现在是空跑（永远绿）`
    );
    lm4Bad += 1;
  }
  if (!lm4Bad) {
    ok(
      `LM4 内容级交叉验证（${withFeats.length} 个数据文件共 ${withFeats.reduce((n, d) => n + feats.get(d).length, 0)} 条特征串，` +
        `在 ${pages.length} 个产物里命中 ${evidence} 次（内容确实出现在产物里），没有发现闭包漏收数据文件）`
    );
  }
}

/* ================================================================== *
 * LM5 —— 全局数据登记齐全
 * ================================================================== */
{
  const cfgPath = path.join(REPO_ROOT, "eleventy.config.js");
  const cfg = readOrNull(cfgPath);
  if (cfg === null) {
    bad(`LM5 找不到 ${relOf(cfgPath)}`);
  } else {
    const literalRe = /addGlobalData\(\s*["']([^"']+)["']/g;
    const variableRe = /addGlobalData\(\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*[,)]/g;
    const declared = [];
    let m;
    while ((m = literalRe.exec(cfg)) !== null) declared.push(m[1]);
    const variableForm = [];
    variableRe.lastIndex = 0;
    while ((m = variableRe.exec(cfg)) !== null) variableForm.push(m[1]);

    let lm5Bad = 0;
    for (const name of variableForm) {
      bad(`LM5 eleventy.config.js 里的 addGlobalData(${name} …) 不是字面量 —— 扫描器没法把它和依赖闭包对应起来`);
      lm5Bad += 1;
    }
    for (const name of declared) {
      if (!Object.prototype.hasOwnProperty.call(GLOBAL_DATA_DEPS, name)) {
        bad(
          `LM5 eleventy.config.js 里注册了全局数据 "${name}"，但 scripts/lib/page-deps.cjs 的 GLOBAL_DATA_DEPS 里没有登记它 —— ` +
            `用了它的页面，闭包会漏收它依赖的文件（少报）`
        );
        lm5Bad += 1;
      }
    }
    for (const [name, deps] of Object.entries(GLOBAL_DATA_DEPS)) {
      for (const p of deps) {
        if (!fs.existsSync(path.join(REPO_ROOT, p))) {
          bad(`LM5 GLOBAL_DATA_DEPS["${name}"] 登记的文件 ${p} 在仓库里不存在`);
          lm5Bad += 1;
        }
      }
    }
    if (!lm5Bad) {
      ok(
        `LM5 全局数据登记齐全（eleventy.config.js 注册了 ${declared.length} 个：${declared.join("、")}；` +
          `全部在 GLOBAL_DATA_DEPS 有登记，登记的文件都存在）`
      );
    }
  }
}

/* ---------- 收尾 ---------- */
if (problems) {
  console.error(`\n页面依赖闭包自检**未通过**：${problems} 项不符预期。`);
  process.exit(1);
}
console.log("\n页面依赖闭包自检通过（门禁 LM1–LM5）。");
