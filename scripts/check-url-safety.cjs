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
 *      `data:image/png` 这类**只是显示**的不算。
 *      ⚠ 扫描是**按上下文**的，不是整文件搜字符串：
 *        HTML / SVG 只看**URL 属性值**、内联脚本体、内联 style；
 *        JS / JSON / XML / 文本看全文；CSS 看全文但**放过** `data:image/svg+xml`
 *        （CSS 里的 SVG 图片不会执行脚本，那是常见合法写法）。
 *        URL 属性值在匹配前会**解码 HTML 实体**并去掉制表符/换行
 *        （浏览器解析 href 时也是这么做的）⇒ `&#106;avascript:` 与 `java<TAB>script:`
 *        这类混淆**必须**一起抓住（实测它们在真实 Chrome 里会执行）。
 *   US2 字符串不当 HTML 解析 —— 产物 JS **与 HTML 内联脚本**里不得出现
 *      `innerHTML` / `outerHTML` / `insertAdjacentHTML` / `document.write` /
 *      `setHTMLUnsafe` / `document["write"]` 的**赋值或调用**。
 *      本站文本一律走 `createTextNode` / `textContent`。
 *   US3 外链协议白名单（**行为实测**）—— 注释层的白名单模块必须**只放行 http/https**：
 *      门禁在 Node 里**真的 import 产物里的那个纯模块**，喂一表输入逐条核对放行与否。
 *      ⇒ **静态扫描看不出白名单到底放行了什么，行为实测才算数。**
 *   US4 覆盖度自证 —— 产物里必须找得到那个纯模块、必须能 import 成功、产物 JS 文件数
 *      不得为 0；**build 链里必须真的执行本门禁**（不是「提到过它的文件名」）；
 *      一处都没比过 / 判不出来 ⇒ **判红**（判不出 ≠ 没问题）。
 *   US5 渲染层必须绑在白名单上 —— paper-reader 的模块里（白名单模块**除外**）
 *      **不得出现 `href` 属性**，除非它是**片段**链接（`#…`）。
 *      ⇒ 白名单模块是**唯一**能产出 `href` 的地方；渲染层一旦改回「把数据里的 URL
 *      直接写进 href」，这条判据当场判红。
 *      ⚠ 这条判据是「形状级」的：它证的是「href 只来自白名单」，
 *      不证白名单本身放行了什么 —— 那是 US3 的活（两者互补）。
 *
 * ⚠ 诚实边界（写清楚，不藏）：
 *   · US1 抓不到**拼出来的** URL（例如把协议名拆成两半再拼）——
 *     运行时那道白名单（US3）仍然兜得住它。
 *   · US3 只测**一个模块**（白名单那一个）；别的模块若自己拼 href，US5 会判红。
 *   · US5 认的是「href 属性」这个形态；用 `setAttribute("hr" + "ef", …)` 绕开是
 *     理论上可能的 —— 但那已经超出「日常手滑」的范畴，且 US1 仍在同一处兜底。
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

/* 覆盖度下限（产物里至少要有这些，门禁才真的比过东西）。 */
const MIN_SITE_FILES = 1;
const MIN_JS_FILES = 1;

/** 白名单模块在产物里的相对路径。 */
const ALLOWLIST_MODULE = path.join("assets", "js", "paper-reader", "url-safety.js");
/** paper-reader 模块目录（产物内）—— US5 在这里扫。 */
const PAPER_READER_DIR = path.join("assets", "js", "paper-reader");

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
  { re: /javascript\s*:/i, why: "javascript: —— 点开/加载即执行脚本" },
  { re: /vbscript\s*:/i, why: "vbscript: —— 旧式脚本协议" },
  { re: /data\s*:\s*text\/html/i, why: "data:text/html —— 内联 HTML 文档，脚本照跑" },
  {
    re: /data\s*:\s*application\/(?:x-)?(?:java|ecma)script/i,
    why: "data:application/*script —— 内联脚本",
  },
  { re: /data\s*:\s*image\/svg\+xml/i, why: "data:image/svg+xml —— SVG 里可以带脚本" },
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

/** HTML / SVG 里承载 URL 的属性（只看这些属性的值）。 */
const URL_ATTRS = new Set([
  "href",
  "src",
  "action",
  "formaction",
  "xlink:href",
  "data",
  "poster",
  "srcdoc",
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

/** HTML / SVG 里值得扫的片段：URL 属性值、内联脚本体、内联 style。 */
function htmlContexts(html) {
  const out = [];
  const attrRe = /([a-zA-Z_:][-\w:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let m;
  while ((m = attrRe.exec(html)) !== null) {
    const name = m[1].toLowerCase();
    const value = m[2] ?? m[3] ?? m[4] ?? "";
    if (URL_ATTRS.has(name)) out.push({ kind: `属性 ${m[1]}`, text: value });
    else if (name === "style") out.push({ kind: "内联 style", text: value });
  }
  const scriptRe = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = scriptRe.exec(html)) !== null) {
    if (m[1].trim()) out.push({ kind: "内联脚本", text: m[1] });
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
      /* HTML / SVG：只看 URL 属性值、内联脚本体、内联 style。 */
      for (const ctx of htmlContexts(stripBlockComments(f.text, f.ext))) {
        const normalized = stripUrlNoise(decodeEntities(ctx.text));
        for (const p of EXECUTABLE_URLS) {
          if (p.re.test(normalized)) hits.push(`${ctx.kind}：${p.why}`);
        }
      }
    } else if (f.ext === ".css") {
      /* CSS：全文扫，但**放过** data:image/svg+xml（CSS 里的 SVG 图片不执行脚本）。 */
      const normalized = stripBlockComments(f.text, f.ext);
      for (const p of EXECUTABLE_URLS) {
        if (p.re === EXECUTABLE_URLS[4].re) continue; // data:image/svg+xml 在 CSS 里合法
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
    `import { isSafeLinkUrl } from ${JSON.stringify(pathToFileURL(allowlistAbs).href)};`,
    `const cases = ${JSON.stringify(URL_CASES)};`,
    `const out = {};`,
    `for (const c of cases) out[c[0]] = isSafeLinkUrl(c[0]);`,
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
  for (const [u, expected] of URL_CASES) {
    const actual = probed[u];
    if (actual === expected) continue;
    note(
      `US3 外链白名单放行了不该放行的（或拒了不该拒的）：` +
        `输入「${u.replace(/\n/g, "\\n").replace(/\t/g, "\\t")}」` +
        `期望 ${expected ? "放行" : "拒绝"}，实测 ${actual === true ? "放行" : actual === false ? "拒绝" : "读不出"} —— ` +
        `白名单只该放行 http/https（${ALLOWLIST_MODULE}）。`
    );
  }
}

/* ================= US4：覆盖度自证 + 门禁自己没被卸掉 ================= */

if (US4_ON) {
  /* 四条判据各留**一个** note() 调用点（理由收集在数组里）——
     这样自测的红因归属表才能「一条判据对一个唯一文案片段」。 */
  const us4Reasons = [];
  if (textFiles.length < MIN_SITE_FILES || jsFiles.length < MIN_JS_FILES) {
    us4Reasons.push(
      `本门禁一处都没比过（产物文本文件 ${textFiles.length} 个 / 站点 JS ${jsFiles.length} 个）—— ` +
        `判据没有落到任何东西上`
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
  const dirAbs = path.join(SITE, PAPER_READER_DIR);
  const files = walk(dirAbs).filter((p) => /\.(?:js|mjs)$/i.test(p));
  const offenders = [];
  for (const abs of files) {
    if (path.resolve(abs) === path.resolve(allowlistAbs)) continue; // 白名单模块自身除外
    const rel = path.relative(SITE, abs);
    const code = stripJsComments(fs.readFileSync(abs, "utf8"));
    const re = /\bhref\s*[:=]/g;
    let m;
    while ((m = re.exec(code)) !== null) {
      const after = code.slice(m.index + m[0].length, m.index + m[0].length + 120);
      /* 只放过**片段**链接（"#…"）；其余一律判红 ——
         片段是站内锚点，写死在前端代码里；把数据里的 URL 写进 href 就是绕过白名单。 */
      if (/^\s*["'`]#/.test(after)) continue;
      const line = code.slice(0, m.index).split("\n").length;
      offenders.push(`${rel}:${line}（${after.trim().slice(0, 40)}）`);
    }
  }
  if (offenders.length) {
    note(
      `US5 渲染层没有绑在白名单上：paper-reader 的模块里出现了 ${offenders.length} 处 ` +
        `非片段的 href 属性 —— ${offenders.slice(0, 5).join("、")}` +
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
    `外链白名单只放行 http/https（${URL_CASES.length} 条输入逐条核对过）、` +
    `paper-reader 的 href 只来自白名单模块。`
);
