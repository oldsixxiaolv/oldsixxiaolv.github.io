#!/usr/bin/env node
/**
 * 门禁 JS1–JS6：站点 JavaScript 的语法、模块图闭合与内联脚本
 *
 * 为什么要有这个门禁（一次实测坐实的看护缺口，不是假想）：
 *   本站有 **10 个站点 JS 文件**（src/assets/js/ 下 4 个 + src/assets/js/paper-reader/ 下 6 个），
 *   全部被复制进产物 _site/assets/js/，全部由浏览器真的加载执行。
 *   而 **scripts/ 里没有任何一道门禁解析过它们**。实测（全仓门禁逐条看过）：
 *     · 搜 `new Function|acorn|node --check|vm.Script|esprima` 全仓，
 *       只命中 check-home-chart.cjs（HC6 只扫**产物页**里的动态 import() 且
 *       **只判 bare 与否**）、check-jsonld.cjs（JSON）、
 *       check-third-party.cjs（只查**外域** import 说明符，判存在性不归它管）；
 *     · 也就是说，**站内 JS 的语法正确性、模块图闭合性，至今零覆盖**。
 *
 *   这个仓库已经吃过一次这样的亏（D10 场次实测）：
 *     动态 import() 的说明符写成了 bare 形式 ⇒ Chrome 抛
 *     `Failed to resolve module specifier` ⇒ 整张首页图**静默失去交互**，
 *     而当时 build 与所有静态门禁**都还是绿的**。
 *   现有门禁里最接近的是 check-home-chart 的 HC6，但它**只扫产物页（HTML）里的
 *   动态 import()**、且**只判 bare 与否**（不判目标存不存在、不判语法）⇒
 *   9 个模块说明符里它覆盖的是**那 2 条**（两处内联 module），
 *   **JS 文件里的 7 条**（main.js 的 2 条静态 import + paper-reader/main.js 的
 *   5 条动态 import）**完全无人核**。同一个坑可以再踩 7 次。
 *
 *   ⇒ 这不是「产物现在有违规」，而是**看护缺口**。实测改动前产物现状：
 *     · 10 个 JS 文件全部能通过 ESM 语法解析；
 *     · 7 个模块内说明符（main.js 的 2 个静态 + paper-reader/main.js 的 5 个动态）
 *       全部能落到真实存在的产物文件；
 *     · 2 个内联 module 的说明符全部能落地；
 *     · 6 个 <script src> 全部能落地；
 *     ⇒ 现状**满足**，缺的只是**看守**。所以本轮改的是门禁，不是构造层 ——
 *       站内一个字都不改，产物零变化。
 *
 * 六条判据（编号用独立字母体系 JS*，**不与既有前缀冲突**：
 *   注意 docs/lighthouse/*.json 里已有 Lighthouse 审计 id SJ0/SJ1/SJ3/SJ5/SJ8/SJ9，
 *   那是**另一种东西**，本门禁刻意避开 SJ* 以免同形混淆；
 *   其余各族 check-image-assets 的 IA*、check-blog-frontmatter 的 F*、
 *   check-about-dataset 的 AP*、check-navigation-contract 的 NA*、
 *   check-third-party 的 TD*、check-home-chart 的 HC*、check-page-deps 的 LM*、
 *   check-gates-wired 的 GW*、check-readme 的 RD*、verify-site.cjs 的数字体系 均不同名）：
 *   JS1 产物 JS 文件的**语法**必须成立 —— 按浏览器**加载它的那张嘴**判：
 *      `type="module"` 加载的按 ESM 判，经典 `<script src>` 加载的按经典脚本判。
 *      加载口径从 HTML 的 script 标签 + 模块图反推，不是猜的。
 *   JS2 产物 JS 文件里的**每个模块说明符**（静态 `import` / `export … from` /
 *      动态 `import()`）必须**落到真实存在的产物文件** —— 按**该模块自己的产物路径**解析。
 *      **裸说明符**（`import "lodash"`）判红：本仓没有 import map，浏览器会抛
 *      `Failed to resolve module specifier`；而且它同时违反「零第三方前端运行时依赖」。
 *   JS3 **内联脚本**（`<script>` / `<script type="module">` 里的代码）必须能解析 ——
 *      classic 按经典口径、module 按 ESM 口径。
 *   JS4 **内联 module 的说明符**必须按**页面 URL 口径**（不是文件路径）落到真实存在的文件。
 *      —— 这正是 D10 那类 bug 的真凶：页面里的相对路径是相对**页面**解析的。
 *   JS5 `<script src>` 必须按**页面 URL 口径**落到真实存在的产物文件。
 *   JS6 **覆盖度自证 + 门禁自己没被卸掉** —— 一处都没比过就判红；
 *      package.json 的 build 链里必须真的有本门禁。
 *
 * ⚠️ 门禁**守不了什么**（写清楚，不藏）：
 *   · 只判**静态**解析：语法对不对、模块图闭不闭合。
 *     **不判运行时行为**（DOM 对不对、事件绑没绑上、渲染出来好不好看）——
 *     那属于「交互类要不要配常驻浏览器门禁」，是**待拍板 42** 的范围，本门禁不代拍。
 *   · **不执行被检查方的任何代码**：ESM 口径用 `node --input-type=module --check`
 *     走 stdin（只解析，不运行），经典口径用 `new vm.Script(src)`（只编译，不运行）。
 *   · **不判外域说明符**：外域 import 由 check-third-party 的 TD4 判红，
 *     本门禁不重复判红（同一件事两道门禁各判一次，红因会互相盖住对方）。
 *   · `data:` / `blob:` 说明符自包含，不判红。
 *   · **非字面量的动态 import**（`import(某个变量)`）无法静态判定，只计数并提示，不判红。
 *   · **正则字面量与除号的区分**用的是启发式（看前一个有效字符与关键字）。
 *     判错的后果是把正则内容当成代码 —— 只可能**多报**（正则里出现 import( 时），
 *     不会漏报真错误。本站 JS 里没有任何正则字面量。
 *   · 经典口径用 vm.Script 编译，它比浏览器 classic **严格一点**：顶层 `await`
 *     会被判红（浏览器 classic 里 `await` 是合法标识符，只会运行期报错）。
 *     本站 classic 脚本里没有顶层 await，且这条严格化不会放过真错误。
 *
 * ⚠️ 为什么**只判产物**（_site）而不是源码：
 *   浏览器加载的是**产物**。产物的路径（相对/绝对、根相对）由 Eleventy 的 relUrl
 *   过滤器在渲染时改写，源码里的写法与访客实际请求的 URL 不是一回事。
 *   ⇒ 判产物 = 判访客真正经历的那件事，也免去源↔产物路径映射的维护负担。
 *
 * 环境变量（自测要在**副本**上注入缺陷，不能改仓库里的真文件）：
 *   SITE_DIR  —— 产物目录（默认 _site）
 *   PKG_PATH  —— package.json 的路径（默认仓库根的 package.json）——
 *                自测用它证明 JS6「门禁自己被卸掉」那条判据真的在起作用。
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const SITE = process.env.SITE_DIR ? path.resolve(process.env.SITE_DIR) : path.join(ROOT, "_site");
const PKG = process.env.PKG_PATH ? path.resolve(process.env.PKG_PATH) : path.join(ROOT, "package.json");
const SELF = path.basename(__filename);

/* 判据开关：存在的唯一理由是自测的负对照要把某一条判据**单独**卸掉，
   证明「那一档的红确实来自这一条判据本身」。默认值恒为 true。 */
const JS1_ON = true;
const JS2_ON = true;
const JS3_ON = true;
const JS4_ON = true;
const JS5_ON = true;
const JS6_ON = true;

/* JS6 的覆盖度下限（只要产物里有站点 JS 与内联脚本就该成立；
   低于这些数说明枚举逻辑坏了，不是「没问题」）。 */
const MIN_JS_FILES = 1;
const MIN_INLINE_SCRIPTS = 1;
const MIN_SPECIFIERS = 1;

const problems = [];
const note = (msg) => problems.push(msg);

/* 比过的处数：覆盖度自证用（JS6）。 */
let countJsFiles = 0;
let countInline = 0;
let countSpecs = 0;
let countSrcTags = 0;

function fail(msg) {
  console.error("站点 JS 门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

/* ================= 工具：产物枚举 ================= */

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
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.isFile()) acc.push(p);
  }
  return acc;
}

/* ================= 工具：HTML 里的 <script> 标签 ================= */

/**
 * 扫出 HTML 里所有 <script> 标签（含属性原文与标签体）。
 * 逐字符找标签边界：**引号内的 > 不算标签结束**。
 * @param {string} html
 * @returns {{attrs: string, body: string}[]}
 */
function scanScriptTags(html) {
  const out = [];
  const n = html.length;
  let i = 0;
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt < 0) break;
    if (html.startsWith("<!--", lt)) {
      const e = html.indexOf("-->", lt + 4);
      i = e < 0 ? n : e + 3;
      continue;
    }
    const m = /^<script\b/i.exec(html.slice(lt, lt + 16));
    if (!m) {
      i = lt + 1;
      continue;
    }
    let j = lt + m[0].length;
    let q = null;
    while (j < n) {
      const c = html[j];
      if (q) {
        if (c === q) q = null;
      } else if (c === '"' || c === "'") {
        q = c;
      } else if (c === ">") {
        break;
      }
      j++;
    }
    const attrs = html.slice(lt + m[0].length, j);
    const close = html.indexOf("</script", j);
    const bodyEnd = close < 0 ? n : close;
    out.push({ attrs, body: html.slice(j + 1, bodyEnd) });
    i = bodyEnd;
  }
  return out;
}

/** 解析标签的属性表（属性名小写；同名属性取第一个）。 */
function parseAttrs(attrSrc) {
  const out = {};
  const re = /([A-Za-z_:][-\w:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(attrSrc)) !== null) {
    const name = m[1].toLowerCase();
    if (Object.prototype.hasOwnProperty.call(out, name)) continue;
    out[name] =
      m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : "";
  }
  return out;
}

/* 内联脚本的 type → 加载口径。返回 "module" / "classic" / null（非 JavaScript）。 */
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

/* ================= 工具：JS 文本扫描 ================= */

const WORD_CHAR = /[A-Za-z0-9_$]/;

/**
 * 判断一个 / 是不是**正则字面量**的开头（否则是除号）。
 * 判据：前一个有效字符是标识符字符、数字、右括号、右方括号、右花括号或引号
 *   ⇒ 大概率是除号；但前一个标识符是 return / typeof 这类关键字 ⇒ 正则；
 * 其余（运算符、逗号、左括号、分号等）⇒ 正则。
 */
const REGEX_KEYWORDS = new Set([
  "return",
  "typeof",
  "instanceof",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "case",
  "do",
  "else",
  "yield",
  "await",
  "throw",
]);

function startsRegex(prev, lastWord) {
  if (prev === "") return true;
  if (/[A-Za-z0-9_$)\]}"'`]/.test(prev)) return REGEX_KEYWORDS.has(lastWord);
  return true;
}

/**
 * 把 JS 源码里的**非代码部分**屏蔽成空格（保留换行，行号不丢）：
 *   · 行注释、块注释 —— 整段屏蔽；
 *   · 字符串字面量 —— 只屏蔽**内容**，**保留两侧引号**（引号是「这里有个字面量」的信号）；
 *   · 模板串 —— 屏蔽**文字段**，**保留反引号**；`${…}` 里的内容是**代码**，不屏蔽；
 *   · 正则字面量 —— 整段屏蔽（正则里出现「斜杠 + 斜杠」是合法的，
 *     若当成行注释，**整行之后的内容会被吃掉** ⇒ 判据会静默漏报）。
 *
 * @param {string} src
 * @returns {string} 与 src 等长、同位置的「代码视图」
 */
function maskJs(src) {
  const n = src.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = src[i];

  /* 模式栈：code = 普通代码 / tmpl = 模板串文字段。
     模板串的 ${…} 会压入一个 code 帧（inExpr 标记），它遇到的第一个「回到 0 的 }」就结束。 */
  const stack = [{ kind: "code", brace: 0, inExpr: false }];
  let i = 0;
  let prev = ""; // 上一个有效代码字符
  let lastWord = ""; // 上一个标识符

  const blank = (a, b) => {
    for (let k = a; k < b && k < n; k++) if (src[k] !== "\n") out[k] = " ";
  };

  while (i < n) {
    const frame = stack[stack.length - 1];
    const c = src[i];

    if (frame.kind === "tmpl") {
      if (c === "\\") {
        blank(i, Math.min(i + 2, n));
        i += 2;
        continue;
      }
      if (c === "`") {
        stack.pop(); // 反引号保留
        prev = ")"; // 模板串的值后面跟 / ⇒ 当除号
        lastWord = "";
        i++;
        continue;
      }
      if (c === "$" && src[i + 1] === "{") {
        blank(i, i + 2);
        stack.push({ kind: "code", brace: 0, inExpr: true });
        prev = "";
        lastWord = "";
        i += 2;
        continue;
      }
      blank(i, i + 1);
      i++;
      continue;
    }

    /* ---- code 模式 ---- */
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
        if (src[j] === "\n") break; // 未闭合（字符串不能跨行）
        j++;
      }
      blank(i + 1, Math.min(j, n)); // 只屏蔽内容，引号保留
      prev = c;
      lastWord = "";
      i = Math.min(j + 1, n);
      continue;
    }
    if (c === "`") {
      stack.push({ kind: "tmpl", brace: 0 });
      prev = "";
      lastWord = "";
      i++;
      continue;
    }
    if (c === "/" && startsRegex(prev, lastWord)) {
      let j = i + 1;
      let inClass = false;
      while (j < n) {
        const d = src[j];
        if (d === "\\") {
          j += 2;
          continue;
        }
        if (d === "[") inClass = true;
        else if (d === "]") inClass = false;
        else if (d === "/" && !inClass) break;
        else if (d === "\n") break;
        j++;
      }
      blank(i, Math.min(j + 1, n));
      prev = "/";
      lastWord = "";
      i = Math.min(j + 1, n);
      continue;
    }
    if (c === "{") {
      frame.brace++;
    } else if (c === "}") {
      frame.brace--;
      if (frame.brace < 0 && frame.inExpr) {
        stack.pop(); // ${…} 结束，回到模板串文字段
        prev = "";
        lastWord = "";
        i++;
        continue;
      }
    }
    if (!/\s/.test(c)) {
      prev = c;
      lastWord = /[A-Za-z0-9_$]/.test(c) ? lastWord + c : "";
    }
    i++;
  }
  return out.join("");
}

/** 从原文的 pos 处读一个字符串字面量。读不出返回 null。 */
function readStringLiteral(src, pos) {
  const q = src[pos];
  if (q !== '"' && q !== "'") return null;
  let i = pos + 1;
  let value = "";
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") {
      const e = src[i + 1];
      if (e === "n") value += "\n";
      else if (e === "t") value += "\t";
      else if (e === "r") value += "\r";
      else if (e === "b") value += "\b";
      else if (e === "f") value += "\f";
      else if (e === "v") value += "\v";
      else if (e === "0") value += "\0";
      else if (e === "x") {
        value += String.fromCharCode(parseInt(src.substr(i + 2, 2), 16) || 0);
        i += 2;
      } else if (e === "u") {
        if (src[i + 2] === "{") {
          const end = src.indexOf("}", i + 3);
          if (end < 0) return null;
          value += String.fromCodePoint(parseInt(src.slice(i + 3, end), 16) || 0);
          i = end;
        } else {
          value += String.fromCharCode(parseInt(src.substr(i + 2, 4), 16) || 0);
          i += 4;
        }
      } else {
        value += e;
      }
      i += 2;
      continue;
    }
    if (c === q) return { value, end: i + 1 };
    if (c === "\n") return null; // 未闭合
    value += c;
    i++;
  }
  return null;
}

/** 从原文的 pos 处读一个模板串。带插值时 interpolated=true（无法静态判定）。 */
function readTemplateLiteral(src, pos) {
  if (src[pos] !== "`") return null;
  let i = pos + 1;
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "`") return { value: src.slice(pos + 1, i), end: i + 1, interpolated: false };
    if (c === "$" && src[i + 1] === "{") {
      return { value: src.slice(pos + 1, i), end: i + 1, interpolated: true };
    }
    i++;
  }
  return null;
}

/**
 * 从 from 处往后找 `from "…"` 形式的说明符。
 * 只在**语句层**（括号深度 0）找 from，且遇到语句结束（; 或提前闭合）就停 ——
 * 这样 `export function f(){ … from "x" … }` 里的 from 不会被误当成 export 的说明符。
 */
function findFromSpecifier(masked, src, from) {
  let depth = 0;
  let i = from;
  const limit = Math.min(masked.length, from + 4000);
  while (i < limit) {
    const c = masked[i];
    if (c === "(" || c === "[" || c === "{") {
      depth++;
      i++;
      continue;
    }
    if (c === ")" || c === "]" || c === "}") {
      if (depth === 0) return null;
      depth--;
      i++;
      continue;
    }
    if (depth === 0 && c === ";") return null;
    if (
      depth === 0 &&
      c === "f" &&
      masked.startsWith("from", i) &&
      !(i > 0 && WORD_CHAR.test(masked[i - 1])) &&
      !WORD_CHAR.test(masked[i + 4] || "")
    ) {
      let j = i + 4;
      while (j < masked.length && /\s/.test(masked[j])) j++;
      const lit = readStringLiteral(src, j);
      if (lit) return { value: lit.value, end: lit.end };
      return null;
    }
    i++;
  }
  return null;
}

/**
 * 抽出一段 JS 里的**全部模块说明符**。
 * 覆盖：静态副作用导入 `import "x"`、import 子句 `import a from "x"` /
 *   `import {a} from "x"` / `import * as ns from "x"`、
 *   重导出 `export … from "x"`、动态导入 `import("x")`。
 * 注释 / 字符串 / 模板串文字段 / 正则字面量里的「import」不算数。
 *
 * @param {string} src
 * @returns {{kind: string, spec: string|null, pos: number, end: number}[]}
 *          spec 为 null 表示**非字面量**（无法静态判定）
 */
function findSpecifiers(src) {
  const masked = maskJs(src);
  const specs = [];

  const importRe = /\bimport\b/g;
  let m;
  while ((m = importRe.exec(masked)) !== null) {
    const at = m.index;
    if (at > 0 && masked[at - 1] === ".") continue; // obj.import(...)
    let j = at + 6;
    while (j < masked.length && /\s/.test(masked[j])) j++;
    const ch = masked[j];
    if (ch === ".") continue; // import.meta —— 不是说明符
    if (ch === ":" || ch === "," || ch === "}" || ch === ")") continue; // 对象属性名
    if (ch === "(") {
      const arg = readCallArg(masked, src, j);
      specs.push({ kind: "dynamic", spec: arg.literal ? arg.value : null, pos: at, end: arg.end });
      importRe.lastIndex = Math.max(arg.end, j + 1);
      continue;
    }
    if (ch === '"' || ch === "'") {
      const lit = readStringLiteral(src, j);
      specs.push({ kind: "static", spec: lit ? lit.value : null, pos: at, end: lit ? lit.end : j });
      importRe.lastIndex = lit ? lit.end : j;
      continue;
    }
    if (ch === "`") {
      const tpl = readTemplateLiteral(src, j);
      specs.push({
        kind: "static",
        spec: tpl && !tpl.interpolated ? tpl.value : null,
        pos: at,
        end: tpl ? tpl.end : j,
      });
      importRe.lastIndex = tpl ? tpl.end : j;
      continue;
    }
    const from = findFromSpecifier(masked, src, j);
    if (from) {
      specs.push({ kind: "static", spec: from.value, pos: at, end: from.end });
      importRe.lastIndex = from.end;
    }
  }

  const exportRe = /\bexport\b/g;
  while ((m = exportRe.exec(masked)) !== null) {
    const at = m.index;
    if (at > 0 && masked[at - 1] === ".") continue;
    const from = findFromSpecifier(masked, src, at + 6);
    if (from) {
      specs.push({ kind: "export", spec: from.value, pos: at, end: from.end });
      exportRe.lastIndex = from.end;
    }
  }

  return specs;
}

/** import( 的实参是不是一个（无插值的）字面量。 */
function readCallArg(masked, src, j) {
  let k = j + 1;
  while (k < masked.length && /\s/.test(masked[k])) k++;
  const c = masked[k];
  if (c === '"' || c === "'") {
    const lit = readStringLiteral(src, k);
    if (lit) return { literal: true, value: lit.value, end: lit.end };
    return { literal: false, value: null, end: k };
  }
  if (c === "`") {
    const tpl = readTemplateLiteral(src, k);
    if (tpl && !tpl.interpolated) return { literal: true, value: tpl.value, end: tpl.end };
    return { literal: false, value: null, end: k };
  }
  return { literal: false, value: null, end: k };
}

function lineOf(src, pos) {
  let line = 1;
  for (let i = 0; i < pos && i < src.length; i++) if (src[i] === "\n") line++;
  return line;
}

/* ================= 工具：语法判定（只解析，不执行） ================= */

/** ESM 口径：node --input-type=module --check 走 stdin（只解析，不运行）。 */
function esmSyntaxError(src) {
  const r = spawnSync(process.execPath, ["--input-type=module", "--check"], {
    input: src,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status === 0) return null;
  const err = String(r.stderr || "")
    .split("\n")
    .filter(
      (l) =>
        l.trim() &&
        !/^\(node:/.test(l) &&
        !/^\(Use /.test(l) &&
        !/^\s*at /.test(l) && // 去掉堆栈帧：门禁要的是「哪里错了」，不是 V8 调用栈
        !/^\s*\^+\s*$/.test(l)
    )
    .slice(0, 6)
    .join(" ");
  return err || `node --check 退出码 ${r.status}`;
}

/** 经典脚本口径：new vm.Script(src) 只编译，不运行。 */
function classicSyntaxError(src) {
  try {
    new vm.Script(src);
    return null;
  } catch (e) {
    return String((e && e.message) || e).split("\n")[0];
  }
}

/* ================= 工具：URL 解析 ================= */

/**
 * 把一个说明符按 baseUrl 解析成站内路径。
 * baseUrl 是**页面 URL**（内联脚本、<script src>）或**模块 URL**（模块内说明符）。
 *
 * ⚠️ moduleMode 区分两套解析规则 —— 这是本门禁最容易出错的地方：
 *   · **HTML 里的 URL 引用**（<script src>）：不是以 / 开头也不是带协议 ⇒ 一律是
 *     **相对路径**，相对**页面**解析。`src="assets/js/main.js"` 是完全正常的写法，
 *     **不是**「裸 specifier」。
 *   · **模块说明符**（import / export … from / import()）：只有以 `./` 或 `../`
 *     开头（或就是 `.` / `..`）才算相对；**其余一律是裸 specifier** ——
 *     浏览器会去找 import map 或抛 Failed to resolve module specifier。
 *     本仓没有 import map ⇒ 裸 specifier 必然失败。
 *
 * @returns {{kind: string, url: string|null}}
 *   kind: relative | absolute | bare | external | selfcontained
 */
function resolveSpecifier(spec, baseUrl, moduleMode) {
  const s = String(spec);
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) {
    if (/^data:/i.test(s) || /^blob:/i.test(s)) return { kind: "selfcontained", url: null };
    return { kind: "external", url: null };
  }
  if (s.startsWith("//")) return { kind: "external", url: null };
  if (s.startsWith("/")) return { kind: "absolute", url: path.posix.normalize(s) };
  if (moduleMode) {
    const isRelative = s === "." || s === ".." || s.startsWith("./") || s.startsWith("../");
    if (!isRelative) return { kind: "bare", url: null };
  }
  const baseDir = path.posix.dirname(baseUrl);
  return { kind: "relative", url: path.posix.join(baseDir, s) };
}

/** 站内 URL → 产物文件路径。越界（跳出产物目录）返回 null。 */
function siteUrlToFile(url) {
  const abs = path.resolve(SITE, "." + url);
  const root = path.resolve(SITE);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

/** 产物文件 → 站内 URL（以 / 开头）。 */
function fileToSiteUrl(abs) {
  const rel = path.relative(SITE, abs).split(path.sep).join("/");
  return "/" + rel;
}

/** 产物 HTML 文件 → 页面 URL（index.html → 目录 URL）。 */
function pageUrlOf(relFromSite) {
  if (relFromSite === "index.html") return "/";
  if (relFromSite.endsWith("/index.html")) return "/" + relFromSite.slice(0, -"index.html".length);
  return "/" + relFromSite;
}

/* ================= 产物清单 ================= */

if (!fs.existsSync(SITE)) {
  console.error("站点 JS 门禁未通过：\n");
  console.error(`  ✗ 找不到产物目录 ${SITE} —— 先跑 npm run build 再跑本门禁。`);
  console.error("");
  process.exit(1);
}

const allFiles = walk(SITE);
const htmlFiles = allFiles
  .filter((f) => path.extname(f).toLowerCase() === ".html")
  .map((f) => ({ abs: f, rel: path.relative(SITE, f).split(path.sep).join("/") }))
  .sort((a, b) => (a.rel < b.rel ? -1 : 1));
const jsFiles = allFiles
  .filter((f) => path.extname(f).toLowerCase() === ".js")
  .map((f) => ({ abs: f, url: fileToSiteUrl(f) }))
  .sort((a, b) => (a.url < b.url ? -1 : 1));

/* 产物 JS 文件的加载口径：module / classic 的集合。
   由 HTML 的 <script src> 与模块图的 import 边反推。 */
const loadKinds = new Map(); // siteUrl → Set("module"|"classic")

function addLoadKind(url, kind) {
  if (!url) return;
  if (!loadKinds.has(url)) loadKinds.set(url, new Set());
  loadKinds.get(url).add(kind);
}

/* ================= 扫 HTML：内联脚本与 <script src> ================= */

const inlineScripts = []; // {pageUrl, pageRel, kind, code}
const scriptSrcTags = []; // {pageUrl, pageRel, kind, src}

for (const f of htmlFiles) {
  const html = fs.readFileSync(f.abs, "utf8");
  const pageUrl = pageUrlOf(f.rel);
  for (const tag of scanScriptTags(html)) {
    const attrs = parseAttrs(tag.attrs);
    const kind = scriptKindOf(attrs.type);
    if (kind === null) continue; // application/ld+json 等不是脚本
    if (attrs.src !== undefined && attrs.src !== "") {
      scriptSrcTags.push({ pageUrl, pageRel: f.rel, kind, src: attrs.src });
    } else {
      inlineScripts.push({ pageUrl, pageRel: f.rel, kind, code: tag.body });
    }
  }
}

/* ================= JS5：<script src> 必须落到真实存在的产物文件 ================= */

const srcTargets = []; // {tag, url, file}

for (const tag of scriptSrcTags) {
  countSrcTags++;
  const r = resolveSpecifier(tag.src, tag.pageUrl, false);
  if (r.kind === "external" || r.kind === "selfcontained") {
    note(
      `${tag.pageRel}：<script src="${tag.src}"> 指向站外/自包含地址 —— ` +
        `外域脚本由 check-third-party 判红，本门禁不重复判。`
    );
    continue;
  }
  const file = siteUrlToFile(r.url);
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    if (JS5_ON) {
      note(
        `${tag.pageRel}：<script src="${tag.src}"> 解析成站内路径 ${r.url}，` +
          `但产物里**没有这个文件** —— 访客的浏览器会拿到 404，脚本根本不会执行。`
      );
    }
    continue;
  }
  srcTargets.push({ tag, url: r.url, file });
  addLoadKind(r.url, tag.kind);
}

/* ================= JS4：内联 module 的说明符必须按页面 URL 口径落地 ================= */

const inlineTargets = []; // {inline, url, file}

for (const inl of inlineScripts) {
  if (inl.kind !== "module") continue;
  const specs = findSpecifiers(inl.code);
  for (const sp of specs) {
    countSpecs++;
    if (sp.spec === null) {
      note(
        `${inl.pageRel}：内联 module 里有**非字面量**的 import() —— ` +
          `它的目标无法静态判定，本门禁判不了（只提示，不判红）。`
      );
      continue;
    }
    const r = resolveSpecifier(sp.spec, inl.pageUrl, true);
    if (r.kind === "external" || r.kind === "selfcontained") continue;
    if (r.kind === "bare") {
      if (JS4_ON) {
        note(
          `${inl.pageRel}：内联 module 的 import 说明符「${sp.spec}」是**裸说明符** —— ` +
            `浏览器会抛 Failed to resolve module specifier，整段脚本直接不执行。`
        );
      }
      continue;
    }
    const file = siteUrlToFile(r.url);
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      if (JS4_ON) {
        note(
          `${inl.pageRel}：内联 module 的 import 说明符「${sp.spec}」解析成站内路径 ${r.url}，` +
            `但产物里**没有这个文件** —— 浏览器会抛 Failed to resolve module specifier，` +
            `这段内联脚本直接不执行。`
        );
      }
      continue;
    }
    inlineTargets.push({ inline: inl, url: r.url, file });
    addLoadKind(r.url, "module"); // import() 载入的永远是模块
  }
}

/* ================= JS2：产物 JS 文件里的每个说明符必须落到真实存在的产物文件 ================= */

const moduleEdges = []; // {fromUrl, toUrl}

for (const jf of jsFiles) {
  const src = fs.readFileSync(jf.abs, "utf8");
  const specs = findSpecifiers(src);
  for (const sp of specs) {
    countSpecs++;
    if (sp.spec === null) {
      note(
        `${jf.url}：第 ${lineOf(src, sp.pos)} 行有**非字面量**的 import() —— ` +
          `它的目标无法静态判定，本门禁判不了（只提示，不判红）。`
      );
      continue;
    }
    const r = resolveSpecifier(sp.spec, jf.url, true);
    if (r.kind === "external" || r.kind === "selfcontained") continue;
    if (r.kind === "bare") {
      if (JS2_ON) {
        note(
          `${jf.url}：第 ${lineOf(src, sp.pos)} 行的模块说明符「${sp.spec}」是**裸说明符** —— ` +
            `浏览器会抛 Failed to resolve module specifier；` +
            `本站没有 import map，裸说明符必然解析失败（也违反「零第三方前端运行时依赖」）。`
        );
      }
      continue;
    }
    const file = siteUrlToFile(r.url);
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      if (JS2_ON) {
        note(
          `${jf.url}：第 ${lineOf(src, sp.pos)} 行的模块说明符「${sp.spec}」解析成站内路径 ${r.url}，` +
            `但产物里**没有这个文件** —— 浏览器会抛 Failed to resolve module specifier，` +
            `这个模块根本不会被加载。`
        );
      }
      continue;
    }
    moduleEdges.push({ fromUrl: jf.url, toUrl: r.url });
    addLoadKind(r.url, "module"); // import 载入的永远是模块
  }
}

/* ================= JS1：产物 JS 文件的语法（按加载口径） ================= */

for (const jf of jsFiles) {
  countJsFiles++;
  const src = fs.readFileSync(jf.abs, "utf8");
  const kinds = loadKinds.get(jf.url);
  if (!kinds || !kinds.size) {
    // 没有任何入口加载它：仍按 module 口径判一遍（语法坏的文件不该留在产物里），
    // 但要说明它没被任何页面加载。
    const err = esmSyntaxError(src);
    if (err && JS1_ON) {
      note(
        `${jf.url}：按 module 口径解析失败（这个文件没有被任何页面加载，仍需能解析）：${err}`
      );
    }
    continue;
  }
  for (const kind of kinds) {
    const err = kind === "module" ? esmSyntaxError(src) : classicSyntaxError(src);
    if (err && JS1_ON) {
      note(`${jf.url}：按 ${kind} 口径解析失败（语法错误）：${err}`);
    }
  }
}

/* ================= JS3：内联脚本的语法 ================= */

for (const inl of inlineScripts) {
  countInline++;
  const err = inl.kind === "module" ? esmSyntaxError(inl.code) : classicSyntaxError(inl.code);
  if (err && JS3_ON) {
    note(
      `${inl.pageRel}：内联 ${inl.kind} 脚本解析失败（语法错误）：${err}`
    );
  }
}

/* ================= JS6：覆盖度自证 + 门禁自己没被卸掉 ================= */

if (JS6_ON) {
  if (countJsFiles < MIN_JS_FILES || countInline < MIN_INLINE_SCRIPTS || countSpecs < MIN_SPECIFIERS) {
    note(
      `本门禁一处都没比过（产物 JS 文件 ${countJsFiles} 个 / 内联脚本 ${countInline} 段 / ` +
        `模块说明符 ${countSpecs} 个）—— 判据没有落到任何东西上，直接判红。`
    );
  }

  let pkg = null;
  try {
    pkg = JSON.parse(fs.readFileSync(PKG, "utf8"));
  } catch (e) {
    note(`读不到 package.json（${e.message}）—— 无法确认本门禁接在 build 链上。`);
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
      note(`门禁自己被卸掉了：package.json 的 build 链里没有指向 scripts/${SELF} 的 script。`);
    }
  }
}

/* ================= 汇总 ================= */

if (problems.length) fail();

const moduleKinds = jsFiles.filter((f) => (loadKinds.get(f.url) || new Set()).has("module")).length;
console.log(
  `站点 JS 门禁通过：产物 ${countJsFiles} 个 JS 文件（${moduleKinds} 个按 module 口径解析通过）、` +
    `${countInline} 段内联脚本、${countSpecs} 个模块说明符全部闭合到真实存在的产物文件、` +
    `${countSrcTags} 个 <script src> 全部落地。`
);
