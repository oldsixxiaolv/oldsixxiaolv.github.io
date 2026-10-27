#!/usr/bin/env node
/**
 * 注入面门禁 —— 判据 US1–US5（**离线**，不联网）。
 *
 * 为什么要有这道门禁（一次具体的实测，不是假想）：
 *   2026-10-27 实测：本站的**注释层**把注释数据里的链接 URL **原样**写进 `href`
 *   （src/assets/js/paper-reader/annotations.js）：
 *     el("a", { href: l.url, target: "_blank", rel: "noopener noreferrer" }, …)
 *   ⇒ 一条**脚本协议**的 URL 会在**被点击时执行脚本**。
 *   而这条路径上：
 *     · **没有任何协议白名单**（`href` 直接取 JSON 里的字符串）；
 *     · **全仓没有任何一道门禁查「可执行 URL」** —— 实测
 *       `grep -rn "javascript:" scripts/*.cjs` 只在 check-overflow 的一句注释里出现，
 *       那里讲的是「这类 URL 没有主机名」，与「能不能执行」无关。
 *   本站的注释数据是**仓库里的 annotations.json**（本人可控），实测 6 条链接全是 https、
 *   产物里 0 处可执行 URL ⇒ **当前没有真实入侵面**。
 *   ⇒ 这是**看护缺口**，不是「现在正被攻击」—— 但缺口本身正是上一轮 D105 那类
 *     「检查从来没真正跑过」的温床：等它变成真实入侵面时，已经没有任何门禁会红。
 *
 * 判据：
 *   US1 可执行 URL —— 产物里不得出现「点开/加载就会执行」的 URL：
 *      脚本协议（javascript: / vbscript:）、`data:text/html`、`data:application/*script`、
 *      `data:image/svg+xml`（SVG 里可以带脚本）。
 *      `data:image/png` 这类**只是显示**的不算；
 *      `<img src="data:image/svg+xml,…">` 里的 SVG 是**惰性图片**（不跑脚本）⇒ 放过。
 *      ⚠ 扫描是**按上下文**的，不是整文件搜字符串：
 *        HTML / SVG 只看 **URL 属性值**、**事件处理属性**（onclick= / onload= …）、
 *        内联脚本体、内联 style、**srcdoc**（它的值是会被当作文档执行的 HTML）；
 *        JS / JSON / XML / 文本看全文；CSS 看全文但**放过** `data:image/svg+xml`
 *        （CSS 里的 SVG 图片不会执行脚本，那是常见合法写法）。
 *        URL 属性值在匹配前会**解码 HTML 实体**并去掉制表符/换行
 *        （浏览器解析 href 时也是这么做的）⇒ `&#106;avascript:` 与 `java<TAB>script:`
 *        这类混淆**必须**一起抓住（实测它们在真实 Chrome 里会执行）。
 *        ⚠ 事件处理属性这一族是 2026-10-27 独立复核**实测出来的回归**：
 *          早先只扫 URL 属性值 ⇒ `<button onclick="javascript:alert(1)">` 全绿，
 *          而它在真实 Chrome 里**会执行**（复核用 headless Chrome 实测 `__pwned=1`）。
 *   US2 字符串不当 HTML 解析 —— 产物 JS **与 HTML 内联脚本**里不得出现
 *      `innerHTML` / `outerHTML` / `insertAdjacentHTML` / `document.write` /
 *      `setHTMLUnsafe` / `document["write"]` 的**赋值或调用**。
 *      本站文本一律走 `createTextNode` / `textContent`。
 *   US3 外链协议白名单（**行为实测**）—— 注释层的白名单必须**只放行 http/https**：
 *      门禁在 Node 里**真的 import 产物里的那个纯模块**，喂一表输入逐条核对放行与否。
 *      ⇒ **静态扫描看不出白名单到底放行了什么，行为实测才算数。**
 *      ⚠ 还必须**导出协议清单**（`SAFE_LINK_SCHEMES`）且**恰为** {http:, https:}：
 *        输入表是有限的 ⇒ 表外的协议（`intent:` 等）它抓不到；
 *        清单要是**数据**（导出出来可核对），藏在代码里就等于「判不出」⇒ 判红。
 *   US4 覆盖度自证 —— 产物里必须找得到那个纯模块、必须能 import 成功、产物 JS 文件数
 *      不得低于下限；**build 链里必须真的执行本门禁**（不是「提到过它的文件名」）；
 *      一处都没比过 / 判不出来 ⇒ **判红**（判不出 ≠ 没问题）。
 *   US5 渲染层必须绑在白名单上 —— **全站** JS 里（白名单模块**除外**）
 *      **不得产出 href**，除非它是**片段**链接（`#…`）。
 *      ⇒ 白名单模块是**唯一**能产出 href 的地方；渲染层一旦改回「把数据里的 URL
 *        直接写进 href」，这条判据当场判红。
 *      ⚠ 认的是**产出的写法**（对象键 `href:` / 属性赋值 `.href =` /
 *        `setAttribute("href", …)` / 拼出来的属性名），不是某一个正则 ——
 *        早先只认前两种 ⇒ `setAttribute("href", …)` 与 `{"href": …}` 能绕过去
 *        （独立复核实测：真实页面上真的渲染出了 `<a href="javascript:…">`，
 *        门禁却判绿并宣称 href 只来自白名单 —— 那是一句**不成立的结论**）。
 *      ⚠ 这条判据是「形状级」的：它证的是「href 只来自白名单」，
 *        不证白名单本身放行了什么 —— 那是 US3 的活（两者互补）。
 *
 * ⚠ 诚实边界（写清楚，不藏）：
 *   · US1 抓不到**拼出来的** URL（例如把协议名拆成两半再拼）——
 *     运行时那道白名单（US3）仍然兜得住它。
 *   · US3 只测**一个模块**（白名单那一个）；别的模块若自己拼 href，US5 会判红。
 *   · US5 认的是「产出 href 的写法」；用变量拼出属性名（`setAttribute(name, …)`）
 *     绕开是理论上可能的 —— 但那已经超出「日常手滑」的范畴，且 US1 仍在同一处兜底。
 *   · US1 判的是**产物里的形态**；浏览器本身还有一层行为差异
 *     （实测：带 `target="_blank"` 的顶层 `javascript:` 导航在当前 Chrome 里不执行）——
 *     但那是**浏览器的行为**，不是门禁或代码给的保证，本门禁不依赖它。
 *   · 本门禁**不执行**被检查方除了那个纯白名单模块以外的任何代码
 *     （纯模块无 DOM 依赖、无顶层副作用；门禁只 import 它并调一个纯函数）。
 *
 * 环境变量（自测要在**副本**上注入缺陷，不能改仓库里的真文件）：
 *   SITE_DIR  —— 产物目录（默认 _site）
 *   PKG_PATH  —— package.json 的路径（默认仓库根的 package.json）——
 *                自测用它证明「门禁自己被卸掉」那条判据真的在起作用。
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const ROOT = path.resolve(__dirname, "..");
const SITE = process.env.SITE_DIR ? path.resolve(process.env.SITE_DIR) : path.join(ROOT, "_site");
const PKG = process.env.PKG_PATH ? path.resolve(process.env.PKG_PATH) : path.join(ROOT, "package.json");
const SELF = path.basename(__filename);

/* 判据开关：存在的唯一理由是自测的负对照要把某一条判据**单独**卸掉，
   证明「那一档的红确实来自这一条判据本身」。默认值恒为 true。 */
const US1_ON = true;
const US2_ON = true;
const US3_ON = true;
const US4_ON = true;
const US5_ON = true;

/* 覆盖度下限（产物里至少要有这些，门禁才真的比过东西）。
 * ⚠ MIN_JS_FILES 取 2（不是 1）：取 1 的话，「产物里一个 JS 都没有」那一档
 *   会**同时**触发「找不到白名单模块」这条子判据 ⇒ 单独关掉文件数那条子判据，
 *   那一档仍然判红 ⇒ 自测**证不了**这条子判据自己在起作用（独立复核实测）。
 *   取 2 ⇒ 可以构造「只剩白名单模块」的夹具，把文件数那条**单独**逼红。 */
const MIN_SITE_FILES = 1;
const MIN_JS_FILES = 2;

/** 白名单模块在产物里的相对路径。 */
const ALLOWLIST_MODULE = path.join("assets", "js", "paper-reader", "url-safety.js");

/** 外链白名单的输入表：[URL, 期望放行?] —— 期望值写死在这张表里，门禁不改。 */
const URL_CASES = [
  ["https://example.com/paper", true],
  ["http://example.com/paper", true],
  ["HTTPS://EXAMPLE.COM/paper", true],
  ["javascript:alert(1)", false],
  ["  javascript:alert(1)  ", false],
  ["java\tscript:alert(1)", false],
  ["java\nscript:alert(1)", false],
  ["data:text/html,<script>alert(1)</script>", false],
  ["data:application/javascript,alert(1)", false],
  ["data:image/svg+xml,<svg onload=alert(1)>", false],
  ["vbscript:msgbox(1)", false],
  ["mailto:someone@example.com", false],
  ["tel:+8613800000000", false],
  ["ftp://example.com/paper", false],
  ["file:///etc/passwd", false],
  ["blob:https://example.com/uuid", false],
  ["//evil.example/paper", false],
  ["/relative/path", false],
  ["relative/path", false],
  ["", false],
];

/** 会**执行**的 URL 形态（`data:image/png` 这类只是显示的，不算）。 */
const EXECUTABLE_URLS = [
  { id: "js", re: /javascript\s*:/i, why: "javascript: —— 点开/加载即执行脚本" },
  { id: "vbscript", re: /vbscript\s*:/i, why: "vbscript: —— 旧式脚本协议" },
  { id: "data-html", re: /data\s*:\s*text\/html/i, why: "data:text/html —— 内联 HTML 文档，脚本照跑" },
  {
    id: "data-script",
    re: /data\s*:\s*application\/(?:x-)?(?:java|ecma)script/i,
    why: "data:application/*script —— 内联脚本",
  },
  { id: "data-svg", re: /data\s*:\s*image\/svg\+xml/i, why: "data:image/svg+xml —— SVG 里可以带脚本" },
];

/** 把字符串当 HTML 解析的 API（只看**赋值/调用**，不看裸词 —— 注释里提到不算）。 */
const HTML_PARSING_APIS = [
  { re: /\.innerHTML\s*[+]?=/, why: "innerHTML 赋值 —— 把字符串当 HTML 解析" },
  { re: /\.outerHTML\s*[+]?=/, why: "outerHTML 赋值 —— 把字符串当 HTML 解析" },
  { re: /\.insertAdjacentHTML\s*\(/, why: "insertAdjacentHTML —— 把字符串当 HTML 解析" },
  { re: /\bdocument\.write(?:ln)?\s*\(/, why: "document.write —— 把字符串当 HTML 解析" },
  { re: /\bdocument\s*\[\s*["'](?:write|writeln)["']\s*\]\s*\(/, why: "document['write'] —— 把字符串当 HTML 解析" },
  { re: /\.setHTMLUnsafe\s*\(/, why: "setHTMLUnsafe —— 把字符串当 HTML 解析（不过滤脚本）" },
];

/** HTML / SVG 里承载 URL 的属性（只看这些属性的值）。
 *  ⚠ `srcdoc` **不在**这里 —— 它的值不是 URL，是**一份会被当作文档执行的 HTML**
 *    ⇒ 单独当成「内联文档」扫（见 htmlContexts）。 */
const URL_ATTRS = new Set([
  "href",
  "src",
  "action",
  "formaction",
  "xlink:href",
  "data",
  "poster",
  "cite",
  "background",
  "ping",
  "manifest",
  "longdesc",
  "usemap",
]);

/** 参与扫描的文本文件后缀。 */
const TEXT_EXT = new Set([
  ".html",
  ".htm",
  ".js",
  ".mjs",
  ".css",
  ".json",
  ".xml",
  ".txt",
  ".md",
  ".svg",
  ".webmanifest",
]);

const problems = [];
const note = (msg) => problems.push(msg);

function fail() {
  console.error("注入面门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

/* ================= 工具 ================= */

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

/**
 * 剥掉 JS 的注释，**字符串感知**。
 *
 * ⚠ 为什么要字符串感知：早先用 `(?<!:)\/\/[^\n]*` 剥行注释，结果**同一行里**
 * 只要先出现过 `//`（哪怕在字符串或正则里，比如 `"https://cdn…"`），
 * 该行**后面**的整行都被吃掉 ⇒ 同一行的注入点就看不见了（实测复现）。
 * ⇒ 这里走一遍迷你词法：先认字符串（' " `），字符串里的 `//` 不算注释。
 */
function stripJsComments(src) {
  let out = "";
  let i = 0;
  let quote = null;
  const n = String(src).length;
  while (i < n) {
    const c = String(src)[i];
    if (quote) {
      out += c;
      if (c === "\\") {
        out += String(src)[i + 1] || "";
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === "/" && String(src)[i + 1] === "*") {
      const end = String(src).indexOf("*/", i + 2);
      const stop = end < 0 ? n : end + 2;
      out += " ";
      i = stop;
      continue;
    }
    if (c === "/" && String(src)[i + 1] === "/") {
      const end = String(src).indexOf("\n", i);
      const stop = end < 0 ? n : end;
      out += " ";
      i = stop;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** 剥掉 CSS 的块注释、HTML 的注释。 */
function stripBlockComments(text, ext) {
  let out = String(text);
  if (ext === ".css") out = out.replace(/\/\*[\s\S]*?\*\//g, " ");
  else if (ext === ".html" || ext === ".htm" || ext === ".xml" || ext === ".svg")
    out = out.replace(/<!--[\s\S]*?-->/g, " ");
  return out;
}

/** HTML 实体解码（数值实体 + 少数几个与 URL 相关的命名实体）。 */
const NAMED_ENTITIES = { colon: ":", tab: "\t", newline: "\n", sol: "/", amp: "&", lpar: "(", rpar: ")" };
function decodeEntities(s) {
  return String(s)
    .replace(/&#(x[0-9a-f]+|[0-9]+);?/gi, (m, num) => {
      const code =
        num[0].toLowerCase() === "x" ? parseInt(num.slice(1), 16) : parseInt(num, 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return m;
      try {
        return String.fromCodePoint(code);
      } catch (_) {
        return m;
      }
    })
    .replace(/&([a-z]+);/gi, (m, name) => {
      const key = name.toLowerCase();
      return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, key) ? NAMED_ENTITIES[key] : m;
    });
}

/** 浏览器解析 href 时会去掉制表符与换行 ⇒ 匹配前先去掉（免得混淆绕过）。 */
function stripUrlNoise(s) {
  return String(s).replace(/[\t\n\r]/g, "");
}

/**
 * HTML / SVG 里值得扫的片段：URL 属性值、**事件处理属性**、内联脚本体、内联 style、srcdoc。
 *
 * ⚠ 为什么要连**标签名**和**属性名**一起带出来（2026-10-27 独立复核实测出来的回归）：
 *   早先这层只收「URL 属性值 + 内联脚本体 + 内联 style」⇒ 事件处理属性
 *   （`onclick=` / `onload=`）**整族漏掉**：`<button onclick="javascript:alert(1)">`
 *   在真实 Chrome 里**会执行**，而当时的门禁判绿（比更早那版「全文扫」还退了一步）。
 *   ⇒ 现在事件处理属性也是一等上下文。
 *
 * ⚠ 为什么标签扫描要**认引号**：属性值里带 `>`（`srcdoc="<script>…</script>"`）
 *   会让朴素的 `<[^>]*>` 把标签截断 ⇒ 恰好把最该抓的那种值切掉。
 *   ⇒ 用「引号优先」的扫描式：`"` / `'` 里的 `>` 不算标签结束。
 */
function htmlContexts(html) {
  const out = [];
  /* 扫描式：先试「整块 <script>…</script>」，再试普通标签。
     ⚠ 顺序很重要：srcdoc 的属性值里**含** `<script>`，若先剥脚本块，
       那个脚本就被当成真脚本块剥掉了 ⇒ srcdoc 里的执行面反而看不见。
       标签分支里属性值是**按引号整段吃**的，所以 srcdoc 里的 `<script>`
       会随属性值一起被吃掉、不会走到脚本分支。 */
  const SCAN_RE =
    /<script\b((?:"[^"]*"|'[^']*'|[^>"'])*)>([\s\S]*?)<\/script\s*>|<([a-zA-Z][-\w:]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/gi;
  const ATTR_RE = /([a-zA-Z_:][-\w:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

  /** 把一个标签的属性拆出来，按属性类别放进上下文。 */
  const pushAttrs = (tag, attrText) => {
    ATTR_RE.lastIndex = 0;
    let a;
    while ((a = ATTR_RE.exec(attrText || "")) !== null) {
      const name = a[1].toLowerCase();
      const value = a[2] ?? a[3] ?? a[4] ?? "";
      if (URL_ATTRS.has(name)) {
        out.push({ kind: `属性 ${a[1]}`, tag, attr: name, text: value });
      } else if (/^on[a-z]+$/.test(name)) {
        /* 事件处理属性：值是**要执行的代码**，`javascript:` 在里面会跑 */
        out.push({ kind: `事件处理属性 ${a[1]}`, tag, attr: name, text: value });
      } else if (name === "style") {
        out.push({ kind: "内联 style", tag, attr: name, text: value });
      } else if (name === "srcdoc") {
        /* srcdoc 的值不是 URL，是**一份会被当作文档执行的 HTML** */
        out.push({ kind: "srcdoc 内联文档", tag, attr: name, text: value });
      }
    }
  };

  let m;
  while ((m = SCAN_RE.exec(String(html))) !== null) {
    if (m[2] !== undefined) {
      /* 整块内联脚本：脚本**自身**的属性也扫（src 之类），脚本体也扫 */
      pushAttrs("script", m[1]);
      if (m[2].trim()) out.push({ kind: "内联脚本", tag: "script", attr: "", text: m[2] });
      continue;
    }
    pushAttrs(m[3].toLowerCase(), m[4]);
  }
  return out;
}

/** 产物里参与扫描的文本文件。 */
function collectTextFiles() {
  const out = [];
  for (const abs of walk(SITE)) {
    const ext = path.extname(abs).toLowerCase();
    if (!TEXT_EXT.has(ext)) continue;
    let text;
    try {
      text = fs.readFileSync(abs, "utf8");
    } catch (_) {
      continue;
    }
    out.push({ abs, rel: path.relative(SITE, abs), ext, text });
  }
  return out;
}

const textFiles = collectTextFiles();
const jsFiles = textFiles.filter((f) => f.ext === ".js" || f.ext === ".mjs");
const htmlFiles = textFiles.filter((f) => f.ext === ".html" || f.ext === ".htm" || f.ext === ".svg");

/* ================= US1：产物里不得有可执行 URL ================= */

if (US1_ON) {
  for (const f of textFiles) {
    const hits = [];
    if (f.ext === ".html" || f.ext === ".htm" || f.ext === ".svg") {
      /* HTML / SVG：按**上下文**扫 —— URL 属性值、事件处理属性、内联脚本体、内联 style、srcdoc。 */
      for (const ctx of htmlContexts(stripBlockComments(f.text, f.ext))) {
        const normalized = stripUrlNoise(decodeEntities(ctx.text));
        for (const p of EXECUTABLE_URLS) {
          /* `<img src="data:image/svg+xml,…">` 里的 SVG 是**惰性图片**：
             图片上下文里 SVG 不跑脚本（浏览器实测）⇒ 放过。
             ⚠ 只放过 `<img src>`；`<a href="data:image/svg+xml,…">` 点开是**导航**
               ⇒ 那一路仍判红。 */
          if (p.id === "data-svg" && ctx.tag === "img" && ctx.attr === "src") continue;
          if (p.re.test(normalized)) hits.push(`${ctx.kind}：${p.why}`);
        }
        /* srcdoc 的内容会被当作**一份 HTML 文档**执行 ⇒ 里面有 <script> 或
           事件处理属性就是执行面（早先只看 URL 形态，抓不到这一族）。 */
        if (ctx.kind === "srcdoc 内联文档" && (/<script\b/i.test(normalized) || /\son[a-z]+\s*=/i.test(normalized))) {
          hits.push("srcdoc 内联文档：内嵌的 HTML 里有 <script> 或事件处理属性（srcdoc 的内容会被当作文档执行）");
        }
      }
    } else if (f.ext === ".css") {
      /* CSS：全文扫，但**放过** data:image/svg+xml（CSS 里的 SVG 图片不执行脚本）。 */
      const normalized = stripBlockComments(f.text, f.ext);
      for (const p of EXECUTABLE_URLS) {
        if (p.id === "data-svg") continue; // data:image/svg+xml 在 CSS 里合法
        if (p.re.test(normalized)) hits.push(`CSS：${p.why}`);
      }
    } else {
      /* JS / JSON / XML / 文本：全文扫（JS 先剥注释）。 */
      const base = f.ext === ".js" || f.ext === ".mjs" ? stripJsComments(f.text) : f.text;
      const normalized = stripBlockComments(base, f.ext);
      for (const p of EXECUTABLE_URLS) {
        if (p.re.test(normalized)) hits.push(p.why);
      }
    }
    if (hits.length) {
      note(
        `US1 ${f.rel}：出现可执行 URL（${[...new Set(hits)].join("；")}）—— ` +
          `这类 URL 在浏览器里是「执行」而不是「显示」；` +
          `站内的链接一律走协议白名单（http/https），别处也不该出现它们。`
      );
    }
  }
}

/* ================= US2：站内 JS 不得把字符串当 HTML 解析 ================= */

if (US2_ON) {
  const scan = (rel, where, code) => {
    const hits = HTML_PARSING_APIS.filter((p) => p.re.test(code));
    if (hits.length) {
      note(
        `US2 ${rel}（${where}）：出现「把字符串当 HTML 解析」的写法` +
          `（${hits.map((h) => h.why).join("；")}）—— 站内文本一律走 createTextNode / textContent，` +
          `数据一旦流进去就是脚本执行。`
      );
    }
  };
  for (const f of jsFiles) scan(f.rel, "站点 JS", stripJsComments(f.text));
  /* HTML 内联脚本同样会执行 ⇒ 也要扫（早先漏了这条，真实浏览器里会跑）。 */
  for (const f of htmlFiles) {
    for (const ctx of htmlContexts(f.text)) {
      if (ctx.kind !== "内联脚本") continue;
      scan(f.rel, "内联脚本", ctx.text);
    }
  }
}

/* ================= US3：外链协议白名单（行为实测） ================= */

/* 白名单模块的状态：ok / missing / import-failed / bad-output。
   非 ok 的一律归 US4（判不出 ≠ 没问题），US3 只在 import 成功时才判。 */
let allowlistState = "ok";
let allowlistDetail = "";
let probed = null;
const allowlistAbs = path.join(SITE, ALLOWLIST_MODULE);

if (!fs.existsSync(allowlistAbs)) {
  allowlistState = "missing";
} else {
  const probe = [
    `import * as mod from ${JSON.stringify(pathToFileURL(allowlistAbs).href)};`,
    `const cases = ${JSON.stringify(URL_CASES)};`,
    `const out = {`,
    `  __hasFn__: typeof mod.isSafeLinkUrl === "function",`,
    `  __schemes__: Array.isArray(mod.SAFE_LINK_SCHEMES) ? mod.SAFE_LINK_SCHEMES : null,`,
    `};`,
    `for (const c of cases) out[c[0]] = mod.isSafeLinkUrl ? mod.isSafeLinkUrl(c[0]) : null;`,
    `process.stdout.write("__US_PROBE__" + JSON.stringify(out));`,
  ].join("\n");
  const r = spawnSync(process.execPath, ["--input-type=module", "--eval", probe], {
    encoding: "utf8",
  });
  if (r.status !== 0) {
    allowlistState = "import-failed";
    allowlistDetail = String(r.stderr || "").split("\n").slice(0, 3).join(" ").trim();
  } else {
    const marker = "__US_PROBE__";
    const idx = String(r.stdout || "").indexOf(marker);
    if (idx < 0) {
      allowlistState = "bad-output";
      allowlistDetail = String(r.stdout || "").slice(0, 120).trim();
    } else {
      try {
        probed = JSON.parse(String(r.stdout).slice(idx + marker.length));
      } catch (e) {
        allowlistState = "bad-output";
        allowlistDetail = String(e.message);
      }
    }
  }
}

if (US3_ON && allowlistState === "ok") {
  /* ⚠ 这里必须留**一个** note() 调用点（自测的红因归属表按调用点认领判据）。
     所有 US3 的理由先收进 reasons，最后一次 note() 报出去。 */
  const reasons = [];

  /* ① 白名单**导出的协议清单**必须恰为 {http:, https:}。
     ⚠ 为什么要查「导出的清单」而不只是喂一张输入表（2026-10-27 独立复核实测）：
       输入表是**有限的** ⇒ 表外的协议（`intent:`、`chrome:`…）它抓不到，
       而白名单一旦多放行一个协议，多出来的就是**表以外**的那一族入口。
       ⇒ 清单必须是**数据**（导出出来可被审阅、可被核对），
         藏在代码里（写死一个 if 分支）就等于「判不出」⇒ 判红。 */
  const wantSchemes = ["http:", "https:"];
  if (!probed.__hasFn__) {
    reasons.push(`白名单模块没有导出 isSafeLinkUrl —— 判不出它到底放行了什么`);
  }
  if (!probed.__schemes__) {
    reasons.push(
      `白名单模块没有导出 SAFE_LINK_SCHEMES（协议清单必须是**数据**才能被核对）—— 判不出它到底放行了什么`
    );
  } else {
    const got = [...new Set(probed.__schemes__)].sort();
    if (got.join(",") !== wantSchemes.join(",")) {
      reasons.push(
        `白名单的协议清单是 [${got.join(", ")}]，不是恰好 [${wantSchemes.join(", ")}] —— ` +
          `多放行一个协议就多一族入口（输入表抓不到表外的协议，所以这条必须单独看）`
      );
    }
  }

  /* ② 逐条核对输入表的放行/拒绝。 */
  for (const [u, expected] of URL_CASES) {
    const actual = probed[u];
    if (actual === expected) continue;
    reasons.push(
      `输入「${u.replace(/\n/g, "\\n").replace(/\t/g, "\\t")}」` +
        `期望 ${expected ? "放行" : "拒绝"}，实测 ${actual === true ? "放行" : actual === false ? "拒绝" : "读不出"}`
    );
  }

  if (reasons.length) {
    note(
      `US3 外链白名单不是「只放行 http/https」：${reasons.join("；")} —— ` +
        `白名单只该放行 http/https（${ALLOWLIST_MODULE}）。`
    );
  }
}

/* ================= US4：覆盖度自证 + 门禁自己没被卸掉 ================= */

if (US4_ON) {
  /* 四条判据各留**一个** note() 调用点（理由收集在数组里）——
     这样自测的红因归属表才能「一条判据对一个唯一文案片段」。 */
  const us4Reasons = [];
  if (textFiles.length < MIN_SITE_FILES) {
    us4Reasons.push(
      `产物文本文件只有 ${textFiles.length} 个 —— 判据没有落到任何东西上`
    );
  }
  if (jsFiles.length < MIN_JS_FILES) {
    us4Reasons.push(
      `产物里的站点 JS 只有 ${jsFiles.length} 个（下限 ${MIN_JS_FILES}）—— ` +
        `「站内不把字符串当 HTML 解析」「href 只来自白名单」这两条判据没落到东西上`
    );
  }
  if (allowlistState === "missing") {
    us4Reasons.push(
      `产物里找不到白名单模块 ${ALLOWLIST_MODULE} —— ` +
        `「注释外链只放行 http/https」这件事判不了`
    );
  } else if (allowlistState === "import-failed") {
    us4Reasons.push(
      `白名单模块 import 失败（${allowlistDetail || "原因未取到"}）—— ` +
        `「注释外链只放行 http/https」这件事判不了`
    );
  } else if (allowlistState === "bad-output") {
    us4Reasons.push(
      `白名单模块的实测输出读不出来（${allowlistDetail}）—— ` +
        `「注释外链只放行 http/https」这件事判不了`
    );
  }

  let pkg = null;
  try {
    pkg = JSON.parse(fs.readFileSync(PKG, "utf8"));
  } catch (e) {
    us4Reasons.push(`读不到 package.json（${e.message}）—— 无法确认本门禁接在 build 链上`);
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
    /* ⚠ 判据是「build 链里**真的执行**本门禁」，不是「提到过它的文件名」——
       只看文件名的话，`echo "scripts/check-url-safety.cjs"` 也能骗过（实测复现：
       那样改完，check-gates-wired 与本门禁**双双判绿**，而门禁从未运行）。
       ⇒ 要求可达脚本的命令里真的写着 `node scripts/<本门禁>`。 */
    const invokedRe = new RegExp(`node\\s+(?:\\./)?scripts/${SELF.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    const invoked = Object.keys(SCRIPTS).filter((n) => seen.has(n) && invokedRe.test(SCRIPTS[n] || ""));
    if (!invoked.length) {
      us4Reasons.push(
        `门禁自己被卸掉了：package.json 的 build 链里没有任何可达脚本真的执行 ` +
          `node scripts/${SELF}（光提到文件名不算）`
      );
    }
  }

  if (us4Reasons.length) {
    note(
      `US4 覆盖度自证没过（${us4Reasons.length} 处）：` +
        us4Reasons.join("；") +
        ` —— 一处都没比过 / 判不出来时一律判红（判不出 ≠ 没问题）。`
    );
  }
}

/* ================= US5：渲染层必须绑在白名单上 ================= */

if (US5_ON) {
  /* ⚠ 扫**全站** JS（不是某个目录）—— 早先只扫 `assets/js/paper-reader/`，
     于是「把渲染层挪出这个目录」就失管了（目录不是护栏，是当时的实现细节）。
     判据是「白名单模块是**唯一**能产出 href 的地方」⇒ 范围就该是全站。 */
  const offenders = [];

  /* ⚠ 认的是「**产出 href**」的几种**写法**，不是某一个正则：
     早先只认 `href:` 与 `href =` ⇒ `setAttribute("href", …)` 与 `{"href": …}`
     这两种**同样自然**的写法能绕过去（2026-10-27 独立复核实测：把渲染层改成
     绕道后，真实页面上真的渲染出了 `<a href="javascript:…">`，门禁却判绿，
     还宣称「href 只来自白名单模块」—— 那是一句**不成立的结论**）。 */
  const SHAPES = [
    /* 对象键：`href:` / `"href":` / `'href':` / `` `href`: `` —— 引号是**键的一部分**，
       漏掉它就漏掉了 `{"href": …}` 这种同样自然的写法（独立复核实测的 N2）。 */
    { re: /\bhref\b["'`]?\s*:/g, why: "对象字面量里的 href 键" },
    { re: /\.href\s*=/g, why: "href 属性赋值" },
    { re: /setAttribute\s*\(\s*(["'`])\s*href\s*\1/g, why: 'setAttribute("href", …)' },
    { re: /setAttribute\s*\(\s*(["'`][^"'`]*["'`]\s*\+\s*)+/g, why: "setAttribute 的属性名是拼出来的" },
  ];

  for (const f of jsFiles) {
    if (path.resolve(f.abs) === path.resolve(allowlistAbs)) continue; // 白名单模块自身除外
    const code = stripJsComments(f.text);
    for (const shape of SHAPES) {
      shape.re.lastIndex = 0;
      let m;
      while ((m = shape.re.exec(code)) !== null) {
        const tail = code.slice(m.index + m[0].length, m.index + m[0].length + 160);
        /* 只放过**片段**链接（"#…"）；其余一律判红 ——
           片段是站内锚点，写死在前端代码里；把数据里的 URL 写进 href 就是绕过白名单。 */
        if (/^\s*[:,]?\s*["'`]#/.test(tail)) continue;
        const line = code.slice(0, m.index).split("\n").length;
        offenders.push(`${f.rel}:${line}（${shape.why}：${tail.trim().slice(0, 40)}）`);
      }
    }
  }
  if (offenders.length) {
    note(
      `US5 渲染层没有绑在白名单上：站点 JS 里出现了 ${offenders.length} 处 ` +
        `非片段的 href 产出 —— ${offenders.slice(0, 5).join("、")}` +
        (offenders.length > 5 ? " …" : "") +
        ` —— href 只能由白名单模块产出（src/assets/js/paper-reader/url-safety.js 的 ` +
        `externalLinkAttrs）；把数据里的 URL 直接写进 href = 绕过白名单 = 门禁形同虚设。`
    );
  }
}

/* ================= 汇总 ================= */

if (problems.length) fail();

console.log(
  `注入面门禁通过：产物 ${textFiles.length} 个文本文件里没有可执行 URL、` +
    `${jsFiles.length} 个站点 JS 与 ${htmlFiles.length} 个 HTML/SVG 里没有把字符串当 HTML 解析、` +
    `外链白名单只放行 http/https（${URL_CASES.length} 条输入逐条核对过、` +
    `导出的协议清单恰为 http:/https:）、` +
    `站点 JS 里的 href 只来自白名单模块。`
);
