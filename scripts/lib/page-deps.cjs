/**
 * 页面依赖闭包 —— 「这一页的内容到底由哪些文件决定」。
 *
 * 为什么要有它（一次具体的实测，不是假想）：
 *   lastmod 的语义是「这个 URL 的**内容**最后一次改变的时间」。但原实现取的是
 *   **该页源文件自身**的最后提交时间 —— 页面内容由别的文件提供时，那些文件一改
 *   页面内容就变了，lastmod 却原地不动。
 *
 *   实测（2026-10-21，git 与产物双侧核对）：
 *     首页 <lastmod> = 2026-10-21T03:07:24Z
 *       = src/index.njk 自己的提交时间（2026-10-20T20:07:24-07:00）
 *     而首页渲染的 src/_data/extremePrecip.json 在 2026-10-21T05:05:04Z（D31 提交）
 *     才改过 ⇒ sitemap 声称「首页自 03:07 起没变过」，实际 05:05 之后首页的
 *     图表数据与图注都变了。**没有任何门禁发现这件事** —— 因为门禁 18 规则 D
 *     与 J11 恰恰要求 lastmod 精确等于「自己源文件」的时间，把错语义钉死了。
 *
 *   修法不是「记得把时间戳改对」，是**让 lastmod 的口径变成闭包**：
 *   一页的 lastmod = 它的依赖闭包里**最晚**的那个提交时间。
 *
 * ── 闭包的六条规则（与实现一一对应，改规则要改这里） ──
 *   ① 页面自身源文件
 *   ② 目录数据文件（src/content/<coll>/<coll>.11tydata.cjs）——
 *      论文页的 layout / permalink 由它给，不算进来就等于漏掉一半
 *   ③ layout 链：front matter 的 layout: → 该 layout 自己的 layout: → …
 *      （Eleventy 的 layout 是**数据级包装**，不是 Nunjucks extends）
 *   ④ 闭包内模板的 {% include %} / {% extends %} / {% import %} / {% from %}
 *      的**字面量**路径
 *   ⑤ 闭包内模板里以整词出现的全局数据变量名 → src/_data/<name>.*
 *      以及 addGlobalData 注册的名字 → GLOBAL_DATA_DEPS 里登记的文件
 *   ⑥ 闭包内 JS/CJS 的**相对** require() 目标
 *      （src/_data/site.js → scripts/lib/identity.cjs 就是这一条）
 *
 * ── 明确不计入闭包的东西（边界写在这里，免得被当成漏洞） ──
 *   · CSS / JS / 图片等静态资源：改样式不改「内容」
 *   · eleventy.config.js 本身：改构建配置不等于改内容（且它一动全站一起动，
 *     会让所有页的 lastmod 一起跳，没有任何信息量）
 *   · 依赖「整词出现」的扫描只看字面量：数据名拼错 → 那一项漏掉（少报）；
 *     扫描本身宁可多报——多报只是多一次重抓，少报才是缺陷。
 *
 * ── 降级语义（与 scripts/lib/git-error.cjs 同一套判据） ──
 *   不在 git 仓库里 / 浅克隆 → **不给时间戳**（空串），与现有 filter 一致。
 *   「git 判定不出来」→ 抛，绝不伪装成「没有 git 历史」（那会让整套 lastmod
 *   判据被静默跳过、门禁全绿而实际一页都没验证过）。
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { classifyGitError, degradeOrThrow } = require("./git-error.cjs");

/* 仓库根（= 本文件所在 scripts/lib/ 的上上级）。所有相对路径都以它为基准，
   与 check-jsonld.cjs 的 `path.resolve(ROOT, relPath)` 同一口径。

   ⚠️ METEO_REPO_ROOT 是**测试钩子**（与 SITE_DIR 同一性质）：自测要把
   「源码树副本」指给门禁看（注入 include 变量形式、改 addGlobalData 登记…），
   而自测**不动仓库里的任何文件**。不设这个变量时，基准恒为本仓库根。 */
const REPO_ROOT = process.env.METEO_REPO_ROOT
  ? path.resolve(process.env.METEO_REPO_ROOT)
  : path.resolve(__dirname, "..", "..");
const INCLUDES_DIR = "src/_includes";
const DATA_DIR = "src/_data";

/* ------------------------------------------------------------------ *
 * 全局数据注册表（GLOBAL_DATA_DEPS）
 *
 * eleventy.config.js 的 addGlobalData 注入的变量**不来自 src/_data/**，
 * 它们的来源只能在这里登记。规则 ⑤ 靠它把「模板引用了 aboutHtml」翻译成
 * 「这一页还依赖 src/content/about.md」。
 *
 * ⚠️ 漏登记的后果是**少报**（about 页改了散文，lastmod 不动）——
 *   所以门禁 LM5 会核对 eleventy.config.js 里每个 addGlobalData("X")
 *   在这里都有登记；新增一个 addGlobalData 却忘了登记 ⇒ 判红。
 * ------------------------------------------------------------------ */
const GLOBAL_DATA_DEPS = {
  // 纯计算（当前年份），不读任何文件 —— 但**必须登记**，
  // 否则 LM5 会把「这里没有登记」当成「没人用它」而放过。
  buildYear: [],
  // 正文散文在 src/content/about.md，由 eleventy.config.js 读进来渲染成 HTML。
  aboutHtml: ["src/content/about.md"],
};

/* ------------------------------------------------------------------ *
 * git 查询（带缓存；降级语义见文件头）
 * ------------------------------------------------------------------ */
let gitTopCache;
function gitTop() {
  if (gitTopCache !== undefined) return gitTopCache;
  try {
    const out = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    gitTopCache = out || null;
  } catch (e) {
    // 可降级（git 不在 PATH / 这里不是仓库）→ null；判定不出来 → 抛。
    gitTopCache = degradeOrThrow(e);
  }
  return gitTopCache;
}

let shallowCache;
function gitIsShallow() {
  if (shallowCache !== undefined) return shallowCache;
  try {
    shallowCache =
      execFileSync("git", ["rev-parse", "--is-shallow-repository"], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() === "true";
  } catch (e) {
    const kind = classifyGitError(e);
    if (kind === "unavailable" || kind === "no-history") shallowCache = true;
    else degradeOrThrow(e);
  }
  return shallowCache;
}

/** 有没有可用的 git 历史（不在仓库里 / 浅克隆 ⇒ 没有）。 */
function hasHistory() {
  return gitTop() !== null && !gitIsShallow();
}

const commitTimeCache = new Map();
/** 某个仓库相对路径最后一次提交的时间（UTC ISO）；null = 没有这个时间。 */
function commitTimeOf(rel) {
  if (commitTimeCache.has(rel)) return commitTimeCache.get(rel);
  let t = null;
  if (hasHistory()) {
    try {
      const out = execFileSync("git", ["log", "-1", "--format=%cI", "--", rel], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (out) {
        const d = new Date(out);
        if (!isNaN(d.getTime())) t = d.toISOString();
      }
    } catch (e) {
      degradeOrThrow(e);
    }
  }
  commitTimeCache.set(rel, t);
  return t;
}

/* ------------------------------------------------------------------ *
 * 小工具
 * ------------------------------------------------------------------ */
function readSafe(abs) {
  try {
    return fs.readFileSync(abs, "utf8");
  } catch (_) {
    return null;
  }
}

/** 绝对路径 → 仓库相对路径（正斜杠）。在仓库外返回 null。 */
function toRel(abs) {
  const rel = path.relative(REPO_ROOT, path.resolve(abs));
  if (!rel || rel.startsWith("..")) return null;
  return rel.split(path.sep).join("/");
}

/** 整词出现？（把 `-` 也当标识符的一部分，免得 "site-header" 命中 "site"） */
function wordHas(text, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![A-Za-z0-9_$\\-])${esc}(?![A-Za-z0-9_$\\-])`).test(text);
}

/* ------------------------------------------------------------------ *
 * 源文件里各种「引用」的字面量
 * ------------------------------------------------------------------ */
/* {% include "x" %} / {%- include "x" -%} / {% extends "x" %} / {% import "x" as y %}
   / {% from "x" import y %} */
const TEMPLATE_REF_RE = /\{%-?\s*(?:include|extends|import|from)\s+["']([^"']+)["']/g;
/* 只认字面量相对引用（点号开头）—— 绝对路径与包路径都不是本仓文件。
   ⚠️ 注释里**不要**再写「require 加圆括号加引号包裹的点号路径」这种示例：
       scripts/check-tracked-refs.cjs 的 TR1 是**全文正则扫描**（不剥离注释），
       注释里的示例会被当成真引用，然后报「磁盘上找不到这个文件」——
       那是**注释写法的地雷**，不是代码坏了。 */
const REQUIRE_RE = /require\(\s*["'](\.[^"']+)["']\s*\)/g;

/** front matter 里的 layout: */
function frontMatterLayout(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const lm = m[1].match(/^layout:\s*["']?([^"'\n#]+?)["']?\s*$/m);
  return lm ? lm[1].trim() : null;
}

/** 目录数据文件（.11tydata.cjs）里的 layout: "..." */
function jsLayoutProp(raw) {
  const lm = raw.match(/^\s*layout:\s*["']([^"']+)["']/m);
  return lm ? lm[1].trim() : null;
}

function templateRefs(raw) {
  const out = [];
  TEMPLATE_REF_RE.lastIndex = 0;
  let m;
  while ((m = TEMPLATE_REF_RE.exec(raw)) !== null) out.push(m[1]);
  return out;
}

function relativeRequires(raw) {
  const out = [];
  REQUIRE_RE.lastIndex = 0;
  let m;
  while ((m = REQUIRE_RE.exec(raw)) !== null) out.push(m[1]);
  return out;
}

/* ------------------------------------------------------------------ *
 * 路径解析
 * ------------------------------------------------------------------ */
/** layout 名 → 仓库相对路径（layouts/base.njk → src/_includes/layouts/base.njk） */
function resolveLayout(name) {
  if (!name) return null;
  const p = name.split(path.sep).join("/").replace(/^\.?\//, "");
  return `${INCLUDES_DIR}/${p}`;
}

/** 模板里的引用 → 仓库相对路径。
    "./y.njk" 相对包含方；"partials/x.njk" 相对 src/_includes/。 */
function resolveTemplateRef(name, fromAbs) {
  if (!name) return null;
  const p = name.split(path.sep).join("/");
  if (p.startsWith("./") || p.startsWith("../")) {
    return toRel(path.resolve(path.dirname(fromAbs), p));
  }
  return `${INCLUDES_DIR}/${p.replace(/^\.?\//, "")}`;
}

/** 相对 require → 仓库相对路径 */
function resolveRelative(name, fromAbs) {
  if (!name) return null;
  return toRel(path.resolve(path.dirname(fromAbs), name));
}

/* ------------------------------------------------------------------ *
 * 全局数据名字 → 数据文件
 * ------------------------------------------------------------------ */
let dataFileMapCache;
function dataFileMap() {
  if (dataFileMapCache) return dataFileMapCache;
  const map = new Map();
  const dir = path.join(REPO_ROOT, DATA_DIR);
  if (fs.existsSync(dir)) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isFile()) continue;
      const name = e.name.replace(/\.[^.]+$/, "");
      if (!map.has(name)) map.set(name, `${DATA_DIR}/${e.name}`);
    }
  }
  dataFileMapCache = map;
  return map;
}

/** 已知的数据变量名（src/_data/ 里的文件 + addGlobalData 注册的） */
function globalDataNames() {
  return [...dataFileMap().keys(), ...Object.keys(GLOBAL_DATA_DEPS)];
}

/* ------------------------------------------------------------------ *
 * 目录数据文件：src/content/<coll>/<coll>.11tydata.cjs
 * ------------------------------------------------------------------ */
function dirDataFileFor(rel) {
  const m = rel.match(/^src\/content\/([^/]+)\//);
  if (!m) return null;
  const coll = m[1];
  const p = `${"src/content"}/${coll}/${coll}.11tydata.cjs`;
  return fs.existsSync(path.join(REPO_ROOT, p)) ? p : null;
}

/* ------------------------------------------------------------------ *
 * 一个文件的一跳依赖
 * ------------------------------------------------------------------ */
function directDeps(rel) {
  const abs = path.resolve(REPO_ROOT, rel);
  const ext = path.extname(rel).toLowerCase();
  const out = [];
  const raw = readSafe(abs);
  if (raw === null) return out;

  if (ext === ".njk" || ext === ".md" || ext === ".html" || ext === ".liquid") {
    // ② 目录数据文件
    const dd = dirDataFileFor(rel);
    if (dd) out.push(dd);
    // ③ front matter 的 layout
    const layout = frontMatterLayout(raw);
    if (layout) {
      const p = resolveLayout(layout);
      if (p) out.push(p);
    }
    // ④ include / extends / import / from
    for (const ref of templateRefs(raw)) {
      const p = resolveTemplateRef(ref, abs);
      if (p) out.push(p);
    }
    // ⑤ 全局数据变量
    for (const name of globalDataNames()) {
      if (!wordHas(raw, name)) continue;
      if (Object.prototype.hasOwnProperty.call(GLOBAL_DATA_DEPS, name)) {
        for (const p of GLOBAL_DATA_DEPS[name]) out.push(p);
      } else {
        const p = dataFileMap().get(name);
        if (p) out.push(p);
      }
    }
  } else if (ext === ".js" || ext === ".cjs" || ext === ".mjs") {
    // 目录数据文件里的 layout:
    if (rel.endsWith(".11tydata.cjs")) {
      const layout = jsLayoutProp(raw);
      if (layout) {
        const p = resolveLayout(layout);
        if (p) out.push(p);
      }
    }
    // ⑥ 相对 require()
    for (const ref of relativeRequires(raw)) {
      const p = resolveRelative(ref, abs);
      if (p) out.push(p);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 闭包
 * ------------------------------------------------------------------ */
const depsCache = new Map();

/** 页面源文件（仓库相对路径）→ 依赖闭包。
    返回 { deps: [...], missing: [...] }；missing = 引用了但文件不存在。 */
function pageDeps(pageRel) {
  if (depsCache.has(pageRel)) return depsCache.get(pageRel);
  const deps = new Set();
  const missing = new Set();
  const seen = new Set();
  const stack = [pageRel];
  while (stack.length) {
    const rel = stack.pop();
    if (seen.has(rel)) continue;
    seen.add(rel);
    if (!fs.existsSync(path.resolve(REPO_ROOT, rel))) {
      missing.add(rel);
      continue;
    }
    deps.add(rel);
    for (const d of directDeps(rel)) {
      if (!seen.has(d)) stack.push(d);
    }
  }
  const out = { deps: [...deps].sort(), missing: [...missing].sort() };
  depsCache.set(pageRel, out);
  return out;
}

/* ------------------------------------------------------------------ *
 * 期望的 lastmod
 * ------------------------------------------------------------------ */
const expectedCache = new Map();

/** 一页的期望 lastmod。
    返回 { time, from, deps, missing, times }：
      time  = 闭包里最晚的提交时间（UTC ISO）；null = 没有可用的 git 历史
      from  = 提供这个时间的那个文件（红因里要指出来）
      times = 每个依赖文件各自的提交时间 */
function expectedLastmod(pageRel) {
  if (expectedCache.has(pageRel)) return expectedCache.get(pageRel);
  const { deps, missing } = pageDeps(pageRel);
  const times = {};
  let time = null;
  let from = null;
  for (const d of deps) {
    const t = commitTimeOf(d);
    if (!t) continue;
    times[d] = t;
    // ISO UTC 串可以直接按字典序比大小（位数固定、都是 Z 结尾）
    if (!time || t > time) {
      time = t;
      from = d;
    }
  }
  const out = { time, from, deps, missing, times };
  expectedCache.set(pageRel, out);
  return out;
}

module.exports = {
  REPO_ROOT,
  GLOBAL_DATA_DEPS,
  gitTop,
  gitIsShallow,
  hasHistory,
  commitTimeOf,
  toRel,
  pageDeps,
  expectedLastmod,
  dataFileMap,
  globalDataNames,
};
