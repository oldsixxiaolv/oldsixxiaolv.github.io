#!/usr/bin/env node
/**
 * 产物洁净度门禁 —— 守住「不该发布的东西不发布」这件事（判据 AH1–AH3）。
 *
 * 为什么要有这道门禁（本轮体检坐实的看护缺口，不是假想）：
 *   本轮把**产物**（`_site/`）逐项过了一遍，实测现状：
 *     · 本机绝对路径 —— **0** 处；
 *     · macOS 资源叉（`._*`）与 `.DS_Store` —— **0** 个（这一格已有门禁守着）；
 *     · sourcemap —— **0** 个；
 *     · 调试残留（`console.log` / `console.debug` / `debugger`）—— **0** 处
 *       （站点现有那两处 `console.warn` 是**正当告警**，不在判红范围内）。
 *   ⇒ 现状**满足**。但把全仓门禁逐条核对下来：**「产物里不该出现本机绝对路径」**
 *     与 **「产物里不该留调试语句」** 这两格**没有任何门禁守着** ——
 *     属「当前没事 ≠ 有东西保证它继续没事」这一族。
 *   ⇒ 本轮改的是**看守**，不是产物：站内一个字都不改，产物零变化。
 *
 * 三条判据（编号用独立字母体系 AH*，与既有各族均不同名：
 *   门禁接线门禁的 GW*、README 门禁的 RD*、站点 JS 门禁的 JS*、
 *   第三方门禁的 TD*、verify-site 的数字体系等）：
 *   AH1 **本机绝对路径** —— 产物里不得出现构建机上的目录。
 *      这类路径会顺手泄露：构建机的用户名、目录结构，甚至**外接盘的卷名**
 *      （卷名常常带人名）。判定 = 已知根前缀 + 足够的路径段数。
 *   AH2 **调试语句** —— 产物里的 JavaScript（外链文件 + HTML 内联脚本）不得留
 *      `console.log(` / `console.debug(` / `debugger`。
 *      ⚠️ `console.warn` 与 `console.error` **不判红**（告警与报错是正当用途）。
 *   AH3 **覆盖度自证** —— 本门禁必须真的比过了东西（扫到足够多的产物文件、
 *      至少一个 HTML、至少一段 JS）。一处都没比过就判红：
 *      「通过」是**空跑**，空跑的门禁等于没有门禁。
 *
 * ⚠️ AH1 的**假红清单**（实现前先列，判据才敢收窄；每一条都有理由）：
 *   ① 站内根相对路径（`/assets/css/tokens.css`）—— **不报**：
 *      它不是本机根前缀（`/assets` 不在根表里）。
 *   ② 域名后面的路径（`https://example.com/home/user/profile`）—— **不报**：
 *      判定前**先把 URL 整段挖空**，域名后面的路径不是本机路径。
 *   ③ 只有一段的 `/home/x` 与 `/tmp/x` —— **不报**：这两个根是最可能撞上
 *      站内路由的名字 ⇒ 要求它们后面**至少两段**；其余根（用户目录、卷名等）
 *      至少一段即可（它们当路由的概率约等于零）。
 *   ④ Windows 形态（`C:\Users\...`）—— **照样判红**（构建机可能是 Windows）。
 *
 * ⚠️ AH1 的**诚实边界**（写清楚才算数）：
 *   · 判的是「看起来像本机路径的**字面量**」；被编码过的内容看不见。
 *   · 只认已知根前缀（将来出现新的机器形态，要往根表里加）。
 *   · 一个候选若**前面紧挨着词字符或路径字符**，不算命中（那是别的路径的尾巴）。
 *
 * ⚠️ AH2 的**诚实边界**：
 *   · 判的是**产物**（浏览器真的执行的那份），不是源码。
 *   · 字符串字面量与注释里的 `console.log` **不算**（先遮罩再匹配）。
 *   · 模板串整体遮罩（含插值里的代码）⇒ 插值中的调试语句**会漏**（保守方向）。
 *   · 正则字面量**不遮罩** ⇒ 形如 `/console.log(/` 的写法会被误报（本仓不存在）。
 *   · HTML **正文**里出现的 `console.log` 字样**不算**（只判 `<script>` 标签里的）。
 *
 * 环境变量（自测要在**副本**上注入缺陷，不能改仓库里真的那份产物）：
 *   SITE_DIR  —— 产物目录（默认 `_site`）。
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITE = process.env.SITE_DIR ? path.resolve(process.env.SITE_DIR) : path.join(ROOT, "_site");

/* 判据开关：存在的唯一理由是自测的负对照要把某一条判据**单独**卸掉，
   证明「那一档的红确实来自这一条判据本身」。默认值恒为 true。 */
const AH1_ON = true;
const AH2_ON = true;
const AH3_ON = true;

/* AH3 的覆盖度下限（低于这些数说明扫描面被收窄或枚举坏了，不是「没问题」）。 */
const MIN_FILES = 5;
const MIN_HTML_FILES = 1;
const MIN_JS_UNITS = 1;

const problems = [];
const fail = (id, msg) => problems.push({ id, msg });

/* ================= 工具：枚举产物 ================= */

function walk(dir, acc) {
  acc = acc || [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return acc;
  }
  for (const e of entries) {
    if (e.name.startsWith("._")) continue; // macOS 的 AppleDouble 资源叉
    if (e.name === ".DS_Store") continue; // macOS 的目录元数据
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.isFile()) acc.push(p);
  }
  return acc;
}

/** 读一个产物文件；读不出来返回 null。 */
function readFileSafe(p) {
  try {
    return fs.readFileSync(p);
  } catch (_) {
    return null;
  }
}

/** 产物里的相对路径（用于红因指名道姓）。 */
function relOf(abs) {
  return path.relative(SITE, abs).split(path.sep).join("/");
}

/* ================= AH1：本机绝对路径 ================= */

/**
 * 已知本机根前缀 → 命中所需的最少路径段数（根之后）。
 *
 * 取 1 的那些几乎不可能是站内路由（用户目录、卷名、系统目录）；
 * `/home/` 与 `/tmp/` 取 2 —— 这两个是唯一两个还可能撞上站内路由的名字。
 */
const MACHINE_ROOTS = [
  { prefix: "/Users/", minSegs: 1 },
  { prefix: "/Volumes/", minSegs: 1 },
  { prefix: "/root/", minSegs: 1 },
  { prefix: "/opt/", minSegs: 1 },
  { prefix: "/private/var/", minSegs: 1 },
  { prefix: "/private/tmp/", minSegs: 1 },
  { prefix: "/var/folders/", minSegs: 1 },
  { prefix: "/usr/local/", minSegs: 1 },
  { prefix: "/Applications/", minSegs: 1 },
  { prefix: "/home/", minSegs: 2 },
  { prefix: "/tmp/", minSegs: 2 },
];

/* 根前缀按长度降序 —— 判定「命中的是哪个根」时先长后短，避免前缀互相吃掉。 */
const ROOTS_BY_LEN = MACHINE_ROOTS.slice().sort((a, b) => b.prefix.length - a.prefix.length);

const ROOT_ALTS = MACHINE_ROOTS.map((r) => r.prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
/* 根前缀**自带前导斜杠** ⇒ 这里不能再多写一个（否则会要求「//Users/」这种双斜杠形态）。 */
const POSIX_PATH_RE = new RegExp("(?:" + ROOT_ALTS + ")[^\\s\"'`<>]*", "g");
const WIN_PATH_RE = /[A-Za-z]:\\Users\\[^\s"'`<>]*/g;

/* URL 形态（判定前整段挖空 —— 域名后面的路径不是本机路径）。 */
const URL_SPANS = [
  /https?:\/\/[^\s"'`<>]+/gi,
  /\/\/[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}[^\s"'`<>]*/g,
];

/** 把一段文本里的 URL 挖成等长的空格（保留长度与换行，行号不漂）。 */
function blankUrls(text) {
  let out = text;
  for (const re of URL_SPANS) {
    out = out.replace(re, (m) => m.replace(/[^\n]/g, " "));
  }
  return out;
}

/** 某一行在文本里的行号（1 起）。 */
function lineOf(text, idx) {
  let line = 1;
  for (let i = 0; i < idx && i < text.length; i++) if (text[i] === "\n") line++;
  return line;
}

/** 候选前面那个字符是不是「词字符或路径字符」——是的话它只是别的路径的尾巴。 */
function tailOfSomething(ch) {
  return !!ch && /[A-Za-z0-9._~%+\-]/.test(ch);
}

/**
 * 在一段文本里找本机绝对路径。
 * @returns {{path: string, line: number}[]} 命中的候选
 */
function findMachinePaths(text) {
  const stripped = blankUrls(text);
  const hits = [];

  const consider = (matched, index, rootPrefix, minSegs) => {
    const before = index > 0 ? stripped[index - 1] : "";
    if (tailOfSomething(before)) return; // 是别的路径的尾巴
    const rest = matched.slice(rootPrefix.length);
    const segs = rest.split(/[\\/]/).filter(Boolean).length;
    if (segs < minSegs) return; // 段数不够（站内路由可能撞名）
    hits.push({ path: matched, line: lineOf(stripped, index) });
  };

  POSIX_PATH_RE.lastIndex = 0;
  let m;
  while ((m = POSIX_PATH_RE.exec(stripped)) !== null) {
    const matched = m[0];
    const root = ROOTS_BY_LEN.find((r) => matched.startsWith(r.prefix));
    if (!root) continue;
    consider(matched, m.index, root.prefix, root.minSegs);
  }

  WIN_PATH_RE.lastIndex = 0;
  while ((m = WIN_PATH_RE.exec(stripped)) !== null) {
    // Windows 的根是盘符 + \Users\，段数从用户名那段起算
    const rootPrefix = m[0].slice(0, m[0].indexOf("\\Users\\") + "\\Users\\".length);
    consider(m[0], m.index, rootPrefix, 1);
  }

  return hits;
}

/* ================= AH2：调试语句 ================= */

/**
 * 把 JavaScript 里的注释与字符串**内容**屏蔽成空格（保留长度与换行）。
 * 这样「字符串里写着 console.log(」不会被当成调试语句。
 *
 * ⚠️ 模板串整体屏蔽（含 `${}` 里的代码）⇒ 插值中的调试语句会漏（保守方向）。
 * ⚠️ 正则字面量不屏蔽（判不出正则与除号）⇒ 形如 /console.log(/ 的写法会误报。
 */
function maskJs(src) {
  const n = src.length;
  const out = src.split("");
  const blank = (a, b) => {
    for (let k = a; k < b && k < n; k++) if (out[k] !== "\n") out[k] = " ";
  };
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") {
      let j = i;
      while (j < n && src[j] !== "\n") j++;
      blank(i, j);
      i = j;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const e = src.indexOf("*/", i + 2);
      const end = e < 0 ? n : e + 2;
      blank(i, end);
      i = end;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n) {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === c) break;
        if (src[j] === "\n") break; // 未闭合
        j++;
      }
      blank(i + 1, Math.min(j, n)); // 内容屏蔽，引号保留
      i = Math.min(j + 1, n);
      continue;
    }
    if (c === "`") {
      let j = i + 1;
      while (j < n) {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === "`") break;
        j++;
      }
      blank(i, Math.min(j + 1, n));
      i = Math.min(j + 1, n);
      continue;
    }
    i++;
  }
  return out.join("");
}

/* 调试语句的两种形态。`console.warn` / `console.error` 不在其中（正当用途）。 */
const CONSOLE_DEBUG_RE = /(?<![\w$])console\s*\.\s*(?:log|debug)\s*\(/g;
const DEBUGGER_RE = /(?<![\w$.])debugger(?![:\w$])/g;

/** 在一段 JavaScript 代码里找调试语句。 */
function findDebugStatements(code) {
  const masked = maskJs(code);
  const hits = [];
  let m;
  CONSOLE_DEBUG_RE.lastIndex = 0;
  while ((m = CONSOLE_DEBUG_RE.exec(masked)) !== null) {
    hits.push({ what: m[0].replace(/\s+/g, ""), line: lineOf(masked, m.index) });
  }
  DEBUGGER_RE.lastIndex = 0;
  while ((m = DEBUGGER_RE.exec(masked)) !== null) {
    hits.push({ what: "debugger", line: lineOf(masked, m.index) });
  }
  hits.sort((a, b) => a.line - b.line);
  return hits;
}

/* 内联脚本的 type → 是不是 JavaScript。 */
const MODULE_SCRIPT_TYPES = new Set(["module"]);
const CLASSIC_SCRIPT_TYPES = new Set([
  "",
  "text/javascript",
  "application/javascript",
  "text/ecmascript",
  "application/ecmascript",
]);

function scriptKindOf(typeAttr) {
  const t = String(typeAttr || "").trim().toLowerCase();
  if (MODULE_SCRIPT_TYPES.has(t)) return "module";
  if (CLASSIC_SCRIPT_TYPES.has(t)) return "classic";
  return null; // application/ld+json 之类不是脚本
}

/** 取标签的属性表（属性名小写；同名属性取第一个）。 */
function parseAttrs(attrSrc) {
  const out = {};
  const re = /([A-Za-z_:][-\w:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(attrSrc)) !== null) {
    const name = m[1].toLowerCase();
    if (Object.prototype.hasOwnProperty.call(out, name)) continue;
    out[name] = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : "";
  }
  return out;
}

/**
 * 抽出 HTML 里真正的 `<script>` 块。
 * 先把 HTML 注释挖空（注释里的 <script> 不算），再找标签；
 * 属性值里的 '>' 不算标签结束。
 * @returns {{body: string, offset: number}[]}
 */
function scriptBlocks(html) {
  const noComments = html.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
  const out = [];
  const lower = noComments.toLowerCase();
  let i = 0;
  while (i < noComments.length) {
    const lt = noComments.indexOf("<script", i);
    if (lt < 0) break;
    const after = noComments[lt + 7];
    if (after && !/[\s>]/.test(after)) {
      i = lt + 7;
      continue; // 那是 <scriptfoo>，不是脚本标签
    }
    let j = lt + 7;
    let quote = null;
    while (j < noComments.length) {
      const c = noComments[j];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === ">") {
        break;
      }
      j++;
    }
    const attrs = noComments.slice(lt + 7, j);
    const bodyStart = j + 1;
    const close = lower.indexOf("</script", bodyStart);
    const bodyEnd = close < 0 ? noComments.length : close;
    out.push({ attrs, body: noComments.slice(bodyStart, bodyEnd), offset: bodyStart });
    i = bodyEnd;
  }
  return out;
}

/* ================= 扫一遍产物 ================= */

const files = walk(SITE);
const relFiles = files.map((p) => ({ abs: p, rel: relOf(p) }));

let htmlCount = 0;
let jsFileCount = 0;
let inlineCount = 0;

/* AH1：逐文件找本机绝对路径（一个文件一条红因）。 */
if (AH1_ON) {
  for (const f of relFiles) {
    const buf = readFileSafe(f.abs);
    if (!buf) continue;
    const text = buf.toString("latin1"); // 按字节读，编码无关
    const hits = findMachinePaths(text);
    if (!hits.length) continue;
    const first = hits[0];
    fail(
      "AH1",
      `产物里有本机绝对路径 —— 文件「${f.rel}」第 ${first.line} 行起共 ${hits.length} 处，` +
        `第一处：${first.path}。` +
        `构建机的用户名、目录结构、卷名都会顺手泄露出去；` +
        `修法：改掉产出这条路径的那一处（别把路径硬编码进源码或数据）。`
    );
  }
}

/* AH2：外链 JS 文件 + HTML 内联脚本。 */
if (AH2_ON) {
  for (const f of relFiles) {
    const ext = path.extname(f.rel).toLowerCase();
    if (ext !== ".js" && ext !== ".mjs") continue;
    const buf = readFileSafe(f.abs);
    if (!buf) continue;
    jsFileCount++;
    const hits = findDebugStatements(buf.toString("latin1"));
    if (!hits.length) continue;
    const first = hits[0];
    fail(
      "AH2",
      `产物里的 JavaScript 留了调试语句 —— 文件「${f.rel}」第 ${first.line} 行起共 ${hits.length} 处，` +
        `第一处：${first.what}。` +
        `⚠️ console.warn 与 console.error 是正当用途，不在判红范围内。`
    );
  }
  for (const f of relFiles) {
    if (path.extname(f.rel).toLowerCase() !== ".html") continue;
    htmlCount++;
    const buf = readFileSafe(f.abs);
    if (!buf) continue;
    const html = buf.toString("latin1");
    for (const s of scriptBlocks(html)) {
      const kind = scriptKindOf(parseAttrs(s.attrs).type);
      if (!kind) continue; // 不是 JavaScript（JSON-LD 之类）
      inlineCount++;
      const hits = findDebugStatements(s.body);
      if (!hits.length) continue;
      const first = hits[0];
      fail(
        "AH2",
        `产物里的 HTML 内联脚本留了调试语句 —— 文件「${f.rel}」第 ${first.line} 行起共 ${hits.length} 处，` +
          `第一处：${first.what}。` +
          `⚠️ console.warn 与 console.error 是正当用途，不在判红范围内。`
      );
    }
  }
}

/* HTML 文件数（AH3 的覆盖度自证用）。AH2 关掉时也要数。 */
if (!AH2_ON) {
  for (const f of relFiles) {
    if (path.extname(f.rel).toLowerCase() !== ".html") continue;
    htmlCount++;
    const buf = readFileSafe(f.abs);
    if (!buf) continue;
    for (const s of scriptBlocks(buf.toString("latin1"))) {
      if (scriptKindOf(parseAttrs(s.attrs).type)) inlineCount++;
    }
  }
}

/* AH3：覆盖度自证 —— 一处都没比过就判红（空跑的门禁等于没有门禁）。 */
if (AH3_ON) {
  const jsUnits = jsFileCount + inlineCount;
  const missing = [];
  if (relFiles.length < MIN_FILES) {
    missing.push(`产物文件 ${relFiles.length} 个（至少要 ${MIN_FILES} 个）`);
  }
  if (htmlCount < MIN_HTML_FILES) {
    missing.push(`HTML 文件 ${htmlCount} 个（至少要 ${MIN_HTML_FILES} 个）`);
  }
  if (jsUnits < MIN_JS_UNITS) {
    missing.push(`JavaScript 单元 ${jsUnits} 个（至少要 ${MIN_JS_UNITS} 个）`);
  }
  if (missing.length) {
    fail(
      "AH3",
      `本门禁几乎没比过任何东西 —— ${missing.join("；")}。` +
        `扫描面被收窄或枚举坏了，此时「通过」是**空跑**，空跑的门禁等于没有门禁。`
    );
  }
}

/* ================= 汇总 ================= */

if (problems.length) {
  console.error("产物洁净度门禁未通过：\n");
  problems.forEach((p) => console.error(`  · ${p.id}：${p.msg}`));
  console.error("");
  process.exit(1);
}

console.log(
  `产物洁净度门禁通过：扫到 ${relFiles.length} 个产物文件` +
    `（HTML ${htmlCount} 个；JavaScript 单元 ${jsFileCount + inlineCount} 个` +
    `＝${jsFileCount} 个外链文件 + ${inlineCount} 段内联脚本）；` +
    `本机绝对路径 0 处、调试语句 0 处。`
);
