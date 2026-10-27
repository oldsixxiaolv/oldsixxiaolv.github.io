/**
 * 站内 JS 的**遮罩扫描**与**第三方包名提取** —— 一条真源，两处引用。
 *
 * 为什么要有这个文件：
 *   两道门禁要回答同一个问题，但答案必须**同口径**：
 *     · `scripts/check-tracked-refs.cjs`（TR1）问「这段代码引用的**本地**文件是不是也被 git 跟踪了」；
 *     · `scripts/check-gates-wired.cjs`（GW6 / GW8）问「这段代码 require 的**第三方包**是不是在 package.json 里声明了」。
 *   两边都要先把**注释**与**字符串**从代码里剥掉，否则：
 *     · 注释里写一句 `require('foo')` 会被当成真引用；
 *     · **夹具字符串**里写 `require('ghost-pkg')`（自测里用来造"缺包"场景）
 *       会被当成"这个脚本真的依赖 ghost-pkg" ⇒ **假红**。
 *   ⇒ 剥法必须**只有一份**。各写一份 ⇒ 两边的口径迟早漂移，而漂移的方向通常是
 *     "一边变严、一边没变" ⇒ 假红或漏报，且没人知道。
 *
 * 遮罩的规则（原样搬自 check-tracked-refs.cjs，**行为不变**）：
 *   ① 注释整体遮掉（行注释与块注释）；字符串里的双斜杠不是注释 ⇒ 先认字符串、整段跳过。
 *   ② 字符串**不在引用位**时，连内容一起遮掉：
 *      「字符串里存着 require 字样」只是文字；require 语句里那个字符串才是路径
 *      —— 引用位 = 前面紧挨着 require( / import( / from / import。
 *   遮罩只把字符换成空格、保留换行 ⇒ 行号与列位置不变。
 *
 * ⚠️ 诚实边界（写清楚，不藏）：
 *   · 只认**字面量**：`require(某个变量)` 这类动态写法扫不出来（不假装扫全了）。
 *   · 遮罩是**词法近似**，不是完整解析器：正则字面量里的引号可能让遮罩错位
 *     ⇒ 后果最多是**多扫出一处字符串**，而多扫出的字符串若不在引用位就仍被遮掉。
 *   · 第三方包名按**首段**归一（`@scope/name` 取两段）⇒ 子路径引用（`pkg/sub`）
 *     记到 `pkg` 上 —— 那正是要声明的那个包名。
 */
"use strict";

/** 引用位：前面紧挨着 require( / import( / from / import。 */
const REF_POS_RE = /(?:\b(?:require|import)\s*\(\s*|\b(?:from|import)\s*)$/;

/** 遮罩到某个位置为止的文本里，当前这个位置是不是在引用位上。 */
function inRefPosition(maskedSoFar, at) {
  const from = Math.max(0, at - 120);
  return REF_POS_RE.test(maskedSoFar.slice(from, at).join(""));
}

/* ---------- 正则字面量：不做处理就会让遮罩整体错位 ----------
   一条正则里出现引号（`/["']/`、`/from\s+["']/` 这种）时，
   遮罩器会把它当成"字符串开始" ⇒ 从此往后的引号配对全乱 ⇒
   **后面整段代码（包括注释里的字样）都被当成字符串内容保留下来**
   ⇒ 扫描器会把注释里的 `from "x"` 当成真引用 ⇒ **假红**。
   （实测：scripts/check-site-js.cjs 里的正则让它整段错位，
     GW8 一度把 `x` 与 `…` 报成"未声明的第三方包"。）

   判断一个 `/` 是**正则**还是**除号**用启发式（与 check-site-js.cjs 同款）：
   前一个有效字符是标识符字符 / 数字 / 右括号 / 右方括号 / 右花括号 / 引号
   ⇒ 大概率是除号；但前一个标识符是 return / typeof 这类关键字 ⇒ 正则；
   其余（运算符、逗号、左括号、分号等）⇒ 正则。 */
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
 * 遮罩：把注释、**正则字面量**、以及**不在引用位**上的字符串内容换成空格（保留换行）。
 * @param {string} text 源码
 * @returns {string} 遮罩后的源码（等长）
 */
function maskForScan(text) {
  const out = text.split("");
  const n = text.length;
  const blank = (from, to) => {
    for (let k = from; k < to && k < n; k++) if (out[k] !== "\n") out[k] = " ";
  };
  let prev = ""; // 上一个有效代码字符
  let lastWord = ""; // 上一个标识符
  let i = 0;
  while (i < n) {
    const c = text[i];
    const c2 = i + 1 < n ? text[i + 1] : "";
    if (c === "/" && c2 === "/") {
      let j = i;
      while (j < n && text[j] !== "\n") j++;
      blank(i, j);
      prev = "";
      lastWord = "";
      i = j;
      continue;
    }
    if (c === "/" && c2 === "*") {
      const end = text.indexOf("*/", i + 2);
      const j = end === -1 ? n : end + 2;
      blank(i, j);
      prev = "";
      lastWord = "";
      i = j;
      continue;
    }
    /* 正则字面量：整段遮掉（含字符类 [...] 与转义）—— 不处理会让遮罩整体错位。 */
    if (c === "/" && startsRegex(prev, lastWord)) {
      let j = i + 1;
      let inClass = false;
      while (j < n) {
        const d = text[j];
        if (d === "\\") {
          j += 2;
          continue;
        }
        if (d === "[") inClass = true;
        else if (d === "]") inClass = false;
        else if (d === "/" && !inClass) break;
        else if (d === "\n") break; // 正则不能跨行
        j++;
      }
      const end = Math.min(j + 1, n);
      blank(i, end);
      prev = "/";
      lastWord = "";
      i = end;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      let j = i + 1;
      while (j < n) {
        if (text[j] === "\\") {
          j += 2;
          continue;
        }
        if (text[j] === quote) break;
        j++;
      }
      const close = Math.min(j, n);
      if (!inRefPosition(out, i)) blank(i + 1, close);
      prev = c;
      lastWord = "";
      i = j + 1;
      continue;
    }
    if (!/\s/.test(c)) {
      prev = c;
      lastWord = /[A-Za-z0-9_$]/.test(c) ? lastWord + c : "";
    }
    i++;
  }
  return out.join("");
}

/** Node 内置模块 —— 不算第三方依赖。 */
const BUILTIN_MODULES = new Set([
  "assert", "buffer", "child_process", "cluster", "console", "constants", "crypto",
  "dgram", "dns", "domain", "events", "fs", "http", "http2", "https", "inspector",
  "module", "net", "os", "path", "perf_hooks", "process", "punycode", "querystring",
  "readline", "repl", "stream", "string_decoder", "sys", "timers", "tls", "trace_events",
  "tty", "url", "util", "v8", "vm", "wasi", "worker_threads", "zlib",
]);

/** 包名归一：`@scope/name` 取两段，其余取首段。 */
function packageNameOf(spec) {
  return spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
}

/**
 * 源码里引用的**第三方包**（去重、排序）。
 * 遮罩后再扫 ⇒ 注释里的字样与夹具字符串里的字样都不算数。
 *
 * @param {string} src 源码
 * @returns {string[]} 第三方包名（升序）
 */
function thirdPartyPackages(src) {
  const masked = maskForScan(src);
  const out = new Set();
  const patterns = [
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g, // require("pkg")
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g, // import("pkg")（动态 import）
    /\bfrom\s+["']([^"']+)["']/g, // import x from "pkg" / export … from "pkg"
    /\bimport\s+["']([^"']+)["']/g, // import "pkg"（副作用导入）
  ];
  for (const re of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(masked)) !== null) {
      const spec = m[1];
      if (spec.startsWith(".") || spec.startsWith("/")) continue; // 本地文件
      if (spec.startsWith("node:")) continue; // node: 前缀的内置模块
      const name = packageNameOf(spec);
      if (BUILTIN_MODULES.has(name)) continue;
      out.add(name);
    }
  }
  return [...out].sort();
}

/**
 * 源码里引用的**本地相对路径**（以 "." 开头）。
 *
 * 与 `thirdPartyPackages()` 的分工：那边只管**第三方包**（本地路径被过滤掉），
 * 这边只管**本地文件**（第三方包名被过滤掉）⇒ 两边合起来才是"这个文件依赖什么"。
 *
 * ⚠️ 认得哪些形态（**逐条实测过**，不是推演）：
 *   ✓ `require("./x.js")`                    —— 静态 require
 *   ✓ `import x from "./x.js"`                —— 默认 / 具名 / 命名空间导入
 *   ✓ `import "./x.js"`                      —— 副作用导入
 *   ✓ `export { x } from "./x.js"`           —— 重导出
 *   ✓ `await import("./x.js")`               —— **动态 import**（`import(...)` 带括号）
 *   ✗ `require(某个变量)` / `import(某个变量)` —— 非字面量，扫不出来（不假装扫全了）
 *   ✗ 模板字符串拼出来的路径                  —— 同上
 *
 * ⚠️ **动态 import 之前是漏的**（实测）：旧口径只认 `require(` / `from ` / `import `，
 *   认不出 `import(`（带括号）⇒ 而本仓 `src/assets/js/paper-reader/main.js` 里
 *   **恰恰有 4 条动态 import**（./toc.js / ./theme.js / ./annotations.js / ./highlight.js）
 *   ⇒ 那 4 条引用**一条都不被 TR1 认** ⇒ 目标没被提交时**没有任何门禁会红**。
 *
 * ⚠️ 遮罩后再扫 ⇒ 注释里的字样与夹具字符串里的字样都不算数（与第三方包那边同口径）。
 *
 * ⚠️ **返回的是有序数组、保留重复**（不是去重集合）：调用方里有判据在数
 *   「比对过**几处**引用」（TR2 的自证存活、COV-A 的覆盖度自证）⇒
 *   同一目标被引用两次必须算**两处** ⇒ 去重会让那个计数口径悄悄变掉。
 *
 * @param {string} src 源码
 * @returns {string[]} 本地相对路径（按出现顺序；同一路径可重复出现）
 */
function localRefs(src) {
  const masked = maskForScan(src);
  const out = [];
  const patterns = [
    /\brequire\s*\(\s*["'](\.[^"']+)["']\s*\)/g, // require("./x.js")
    /\bimport\s*\(\s*["'](\.[^"']+)["']\s*\)/g, // import("./x.js")（**动态** import）
    /\bfrom\s*["'](\.[^"']+)["']/g, // import x from "./x.js" / export … from "./x.js"
    /\bimport\s*["'](\.[^"']+)["']/g, // import "./x.js"（副作用导入）
  ];
  for (const re of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(masked)) !== null) out.push(m[1]);
  }
  return out;
}

module.exports = { maskForScan, thirdPartyPackages, packageNameOf, localRefs, BUILTIN_MODULES };
