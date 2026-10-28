#!/usr/bin/env node
/**
 * 门禁 TD1–TD5：零第三方前端运行时依赖
 *
 * 为什么需要它（2026-10-21 的 D37）：
 *   docs/ROADMAP.md 第 63–64 行把「零运行时依赖」写成**硬约束**：
 *     「目前没有任何第三方前端库/框架，样式与脚本全手写。
 *       这个约束要保持（性能 + 可控 + 无供应链风险）。」
 *   而**没有任何一道门禁守着它**。实测（全仓门禁逐条看过）：
 *     · 判「外域 script src」的判据：**0 条**；
 *     · 判「第三方 CSS」的判据：**0 条**；
 *     · 判「运行时向外部发请求」的判据：**0 条**。
 *   scripts/verify-site.cjs 里那个 EXTERNAL 正则是**用来解析相对链接**的，
 *   它判的是「链接指向的站内页面存不存在」，**不判「资源从哪来」**。
 *   ⇒ 任何人往 base.njk 里加一行
 *       <script src="https://cdn.example.com/analytics.js"></script>
 *     **npm run build 仍然全绿**：CDN 的脚本进了产物、访客的浏览器去执行它，
 *     本站既没有声明、也没有报告 —— 供应链风险从「不存在」变成「已引入」，
 *     而**没有任何一道门禁说过一个字**。
 *
 *   这不是「产物现在有违规」，而是**看护缺口**。实测（改动前）产物现状：
 *     · 外域 script src：**0 条**；
 *     · 外域 img src / srcset / iframe / video / audio / track：**0 条**；
 *     · 外域 CSS 的 @import 与 url()：**0 条**；
 *     · 站内 JS 里的硬编码外域请求目标：**0 条**；
 *     · 唯一的外域是 **Google Fonts**（fonts.googleapis.com 的 2 个 stylesheet
 *       + 2 个 preload as=style，fonts.gstatic.com 的 1 个 preconnect）——
 *       这**不是**前端库/框架，是 webfont，而且是 base.njk 里**有意**的设计
 *       （那里有详细取舍注释：关键路径只留 3 个 Latin 字族，Noto Serif SC 异步）。
 *   ⇒ 现状**满足**这条约束，缺的只是**看守**。所以本轮改的是门禁，
 *     不是构造层 —— 站内一个字都不改。
 *
 * 五条判据（编号用独立字母体系 TD*，不与既有各族续接或冲突：
 *   check-lang 的 FF*、check-site-language 的 TX*、check-block-language 的 BL*、
 *   check-jsonld 的 J*、check-a11y 的 A*、check-wrapping 的 W*、
 *   check-gates-wired 的 GW*、check-readme 的 RD*、check-css-comment-weight 的
 *   CW* 与 CQ*、check-home-chart 的 HC*、check-page-deps 的 LM*、
 *   check-citation-cff 的 CF*、verify-site.cjs 的数字编号体系）：
 *   TD1 HTML 里的**子资源引用**（script 的 src、img / source / video / audio /
 *      track / iframe / embed / object / input 的资源属性）指向外域 ⇒ 判红。
 *      —— 「第三方前端脚本 / 图片 / 字体文件」全在这一条里。
 *   TD2 link 标签的**资源提示**（stylesheet / preload / modulepreload / prefetch /
 *      preconnect / dns-prefetch / icon）指向外域 ⇒ 判红，
 *      **除非**该域在白名单里登记且上下文对得上。
 *   TD3 产物 CSS（外链 css 文件 + 内联 style 块）里的
 *      @import 与 url() 指向外域 ⇒ 判红。
 *   TD4 站内 JS（外链 js 文件 + 内联 script 块）里的**硬编码**外域请求目标、
 *      以及外域的 import 说明符 ⇒ 判红。
 *   TD5 覆盖度自证：产物页面数、外链 CSS 文件数、外链 JS 文件数、
 *      本地 script src 数、本地 stylesheet link 数都不得为 0。
 *      —— 「没报错」和「没问题」长得一模一样：枚举器坏了，门禁会一直绿着。
 *   TD6 **站外样式表不许占据渲染阻塞位**（D117，2026-10-28 场次）：
 *      每一个指向站外的 `link[rel=stylesheet]`，都必须有**配对的非阻塞加载
 *      路径** —— 同一 href 的 `link[rel=preload][as=style]` 且带 onload 换装
 *      （`rel` 改成 stylesheet）。没有这条路径 ⇒ 判红。
 *      —— 为什么要有这条：`<link rel="stylesheet">` 在 <head> 里是**渲染阻塞**
 *      资源 ⇒ **第一次绘制要等它**。本站的关键 CSS（tokens + base）已内联、
 *      自己那 4 个 CSS 也都走 preload+onload 换装 ⇒ 若还留一张站外表在阻塞位，
 *      **首屏就被一个第三方 CDN 的可用性单点卡住**（那个源慢或挂 ⇒ 全站白屏，
 *      而本站自己的资源一个都不缺）。
 *      —— 判据判的是「**有没有非阻塞路径**」，不是「有没有站外表」：
 *      站外表**可以存在**，只要它同时有一条不挡首屏的加载路径
 *      （本仓两张 Google Fonts 表现在都是这个形态：preload+onload 换装，
 *      <noscript> 里另有一份同步兜底）。反过来，光有 preload 而**没有 onload
 *      换装**不算数 —— 那张表在 JS 生效时永远不会变成 stylesheet。
 *      —— ⚠️ **只管已登记（白名单允许 link:stylesheet）的域**：一张**未登记**的
 *      站外表本来就被 TD2 判红（「这个外域你没登记」）⇒ 同一事实已有红因，
 *      再叠一条 TD6 就是同一事实出两条红因、红因归属没法判定。
 *      ⇒ 分工：TD2 管「这个外域准不准用」，TD6 管「已经准用了的那张表
 *      是不是把首屏挡住了」。
 *      —— 诚实边界：<noscript> 里那份同步兜底**仍然是阻塞的**（无 JS 的浏览器
 *      会卡在它上面）。本站的论文精读、图表等交互本就依赖 JS，故不判红；
 *      真要做到「连无 JS 也不等第三方」，只能自托管字体（见日志待决策段）。
 *
 * 白名单是**登记式**，不是拍板式：
 *   当前只登记两处，都是站点**现在就在用**的 Google Fonts：
 *     · fonts.googleapis.com —— 允许 link:stylesheet 与 link:preload；
 *     · fonts.gstatic.com —— 只允许 link:preconnect（本站不直接请求它，
 *       它只是那份 Google Fonts CSS 里 @font-face 指向的字体二进制域）。
 *   加新域 = 改这个文件并写明理由。**删掉条目是好事**：白名单条目用不上时
 *   只出提示、不判红 —— 门禁不能反过来惩罚「把 Google Fonts 撤掉」这种改进。
 *   白名单是 **(域, 上下文)** 粒度的：登记了 fonts.googleapis.com 不等于它的
 *   任何用法都放行 —— 拿它当 script src 照样判红。
 *
 * 诚实边界（不写清楚就成了过度声称）：
 *   · 只判**产物**（_site）。源码里写了但没渲染进产物的东西不在视野内。
 *   · TD4 **只抓硬编码**外域 URL。目标由 DOM 属性 / 配置注入的请求
 *     （例如论文精读层从 DOM 取 annotations.json 的路径）**判不了**，
 *     只计数并提示 —— 那种请求的目标是访客侧数据，不是第三方服务。
 *   · 不判**导航链接**（a 的 href、canonical、alternate 等元数据指针）——
 *     指向 ORCID / GitHub / DOI 是正常的对外引用，不是运行时依赖。
 *   · 不判 meta 标签里的 URL（og:image 之类是给爬虫看的，不是浏览器取的资源）。
 *   · 不判**数据 URL**（data: 与 blob: 是自包含的，不发起网络请求）。
 *   · 不判 CSS 语义、不判脚本行为，只判「资源从哪来」。
 *
 * 用法：node scripts/check-third-party.cjs   （有错 exit 1）
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SITE = path.join(ROOT, "_site");

/* 判据开关：存在的唯一理由是自测的负对照要把某一条判据**单独**卸掉，
   证明「那一档的红确实来自这一条判据本身」。默认值恒为 true。 */
const TD1_ON = true;
const TD2_ON = true;
const TD3_ON = true;
const TD4_ON = true;
const TD6_ON = true;

/* TD5 的覆盖度下限（现值：6 个页面 / 16 个外链 CSS / 10 个外链 JS /
   6 个本地 script src / 42 个 stylesheet link）。
   低于这些数说明枚举逻辑坏了，不是「没问题」。 */
const MIN_PAGES = 1;
const MIN_CSS_FILES = 1;
const MIN_JS_FILES = 1;
const MIN_LOCAL_SCRIPT = 1;
const MIN_LOCAL_STYLESHEET = 1;

/* ---------------- 白名单（登记式） ----------------
   域 → { contexts: 允许的上下文, reason: 为什么允许 }。
   contexts 用的是本门禁自己的上下文标记，见下方各处定义。 */
const ALLOWLIST = {
  "fonts.googleapis.com": {
    contexts: ["link:stylesheet", "link:preload", "link:preconnect"],
    reason:
      "Google Fonts 的 webfont CSS（Inter / Source Serif 4 / JetBrains Mono / " +
      "Noto Serif SC）。本站不引入任何第三方前端库/框架；字体二进制由那份 CSS " +
      "里的 @font-face 指向 fonts.gstatic.com。" +
      "preconnect 是为了让这份 CSS 的 DNS + TLS 不落在关键路径上。",
  },
  "fonts.gstatic.com": {
    contexts: ["link:preconnect"],
    reason:
      "Google Fonts 的字体二进制域。本站**不直接**请求它（没有 link 指向它，" +
      "CSS 里也没有 url() 指向它），这个 preconnect 只是提前建连。",
  },
};

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

/**
 * 扫出 HTML 里所有开始标签（含属性原文），跳过注释 / 声明 / 结束标签。
 * 逐字符走：**引号内的 > 不算标签结束** —— 属性值里出现 > 是合法的。
 * @param {string} html
 * @returns {{name: string, attrSrc: string}[]}
 */
function scanTags(html) {
  const tags = [];
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
    if (html.startsWith("<!", lt) || html.startsWith("</", lt)) {
      const e = html.indexOf(">", lt);
      i = e < 0 ? n : e + 1;
      continue;
    }
    const m = /^<([a-zA-Z][-\w:]*)/.exec(html.slice(lt, lt + 64));
    if (!m) {
      i = lt + 1;
      continue;
    }
    const name = m[1].toLowerCase();
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
    tags.push({ name, attrSrc: html.slice(lt + m[0].length, j) });
    i = j + 1;
  }
  return tags;
}

/**
 * 解析标签的属性表（属性名小写；同名属性取第一个）。
 * @param {string} attrSrc
 * @returns {Record<string, string>}
 */
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

/**
 * 把一个 URL 归类：本地 / 自包含 / 外域 / 其它协议。
 * @param {string} raw
 * @returns {{kind: string, url?: URL}}
 */
function classifyUrl(raw) {
  const v = String(raw === undefined || raw === null ? "" : raw).trim();
  if (!v) return { kind: "empty" };
  if (/^data:/i.test(v) || /^blob:/i.test(v)) return { kind: "inline" };
  if (v.startsWith("//")) {
    try {
      return { kind: "external", url: new URL("https:" + v) };
    } catch (_) {
      return { kind: "opaque" };
    }
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(v)) {
    let u;
    try {
      u = new URL(v);
    } catch (_) {
      return { kind: "opaque" };
    }
    if (u.protocol === "http:" || u.protocol === "https:") {
      return { kind: "external", url: u };
    }
    return { kind: "opaque", url: u };
  }
  return { kind: "local" };
}

/**
 * 白名单查询：域 + 上下文都要对得上才算放行。
 * @param {string} host
 * @param {string} context
 * @returns {{ok: boolean, reason: string|null}}
 */
function allowance(host, context) {
  const entry = ALLOWLIST[host];
  if (!entry) return { ok: false, reason: null };
  if (!entry.contexts.includes(context)) {
    return {
      ok: false,
      reason:
        `该域只登记用于 ${entry.contexts.join(" / ")}，不用于 ${context} —— ` +
        `白名单是按（域，上下文）粒度登记的，不是按域一刀切。`,
    };
  }
  return { ok: true, reason: entry.reason };
}

/** srcset 的每一项：逗号分隔，每项取第一个 token（URL），其余是描述符。 */
function srcsetUrls(value) {
  return String(value)
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0])
    .filter((u) => u.length > 0);
}

/* 子资源属性表：元素 → 该元素上会发起网络请求的属性。 */
const MEDIA_RESOURCE_ATTRS = {
  img: ["src", "srcset"],
  source: ["src", "srcset"],
  video: ["src", "poster"],
  audio: ["src"],
  track: ["src"],
  iframe: ["src"],
  embed: ["src"],
  object: ["data"],
  input: ["src"],
};

/* 会发起网络请求或建连的 link rel → 上下文标记。 */
const LINK_FETCH_RELS = {
  stylesheet: "link:stylesheet",
  preload: "link:preload",
  modulepreload: "link:modulepreload",
  prefetch: "link:prefetch",
  preconnect: "link:preconnect",
  "dns-prefetch": "link:dns-prefetch",
  icon: "link:icon",
  "apple-touch-icon": "link:icon",
  "mask-icon": "link:icon",
  manifest: "link:manifest",
};

/* ---------------- JS 侧：剥注释 + 找调用点 ---------------- */

/**
 * 判断一个 / 是不是**正则字面量**的开头（否则是除号）。
 *
 * 判据：前一个有效字符是标识符字符、数字、右括号或右方括号 ⇒ 除号；
 * 但前一个标识符是 return / typeof / new 这类关键字 ⇒ 正则；
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
  if (/[A-Za-z0-9_$)\]]/.test(prev)) return REGEX_KEYWORDS.has(lastWord);
  return true;
}

/**
 * 去掉 JS 的注释，保留字符串与模板串的内容（行数不丢）。
 * 逐字符走五个状态：行注释 / 块注释 / 引号串 / 模板串 / 正则字面量。
 *
 * ⚠️ 正则字面量必须单独认出来：正则里出现「斜杠 + 斜杠」是合法的
 *    （例如匹配 URL 的 /a\/\/b/），若当成行注释，**整行之后的内容会被吃掉**
 *    ⇒ 判据会静默漏报。
 *
 * @param {string} src
 * @returns {string}
 */
function stripJsComments(src) {
  const n = src.length;
  let out = "";
  let i = 0;
  let prev = ""; // 上一个非空白字符
  let lastWord = ""; // 上一个标识符

  while (i < n) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const e = src.indexOf("*/", i + 2);
      const end = e < 0 ? n : e + 2;
      let nl = 0;
      for (let k = i; k < end; k++) if (src[k] === "\n") nl++;
      out += "\n".repeat(nl); // 保留行数，便于报行号
      i = end;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      let j = i + 1;
      while (j < n) {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === quote) break;
        j++;
      }
      out += src.slice(i, j + 1);
      prev = quote;
      lastWord = "";
      i = j + 1;
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
      out += src.slice(i, Math.min(j + 1, n));
      prev = "/";
      lastWord = "";
      i = j + 1;
      continue;
    }
    out += c;
    if (!/\s/.test(c)) {
      prev = c;
      lastWord = /[A-Za-z0-9_$]/.test(c) ? lastWord + c : "";
    }
    i++;
  }
  return out;
}

/**
 * 把实参列表（从开括号处起）按**顶层**逗号切开。
 * @param {string} src
 * @param {number} openIdx 开括号的下标
 * @returns {string[]}
 */
function splitArgs(src, openIdx) {
  const args = [];
  const n = src.length;
  let depth = 0;
  let q = null;
  let i = openIdx + 1;
  let start = i;
  while (i < n) {
    const c = src[i];
    if (q) {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === q) q = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      q = c;
      i++;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") {
      depth++;
      i++;
      continue;
    }
    if (c === ")" || c === "]" || c === "}") {
      if (depth === 0) {
        args.push(src.slice(start, i));
        break;
      }
      depth--;
      i++;
      continue;
    }
    if (c === "," && depth === 0) {
      args.push(src.slice(start, i));
      start = i + 1;
      i++;
      continue;
    }
    i++;
  }
  return args.map((a) => a.trim());
}

/** 实参是不是一个（无插值的）字符串字面量。是则返回其内容，否则 null。 */
function literalOf(argText) {
  const m = /^(?:"([^"]*)"|'([^']*)'|`([^`]*)`)$/.exec(argText);
  if (!m) return null;
  const v = m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3];
  if (v.indexOf("${") >= 0) return null; // 模板串带插值 → 不是字面量
  return v;
}

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "DELETE", "HEAD", "PATCH", "OPTIONS"]);

/* 请求类 API：正则 → 目标取第几个实参 + 是否需要 HTTP 方法守卫。 */
const REQUEST_APIS = [
  { re: /\bfetch\s*\(/g, argIndex: 0, label: "fetch" },
  { re: /\bimportScripts\s*\(/g, argIndex: 0, label: "importScripts" },
  { re: /\bnew\s+Worker\s*\(/g, argIndex: 0, label: "new Worker" },
  { re: /\bnew\s+EventSource\s*\(/g, argIndex: 0, label: "new EventSource" },
  { re: /\bnew\s+WebSocket\s*\(/g, argIndex: 0, label: "new WebSocket" },
  { re: /\bsendBeacon\s*\(/g, argIndex: 0, label: "navigator.sendBeacon" },
  { re: /\.\s*open\s*\(/g, argIndex: 1, label: "XMLHttpRequest.open", methodGuard: true },
];

/* import 说明符：静态副作用导入、from 形式、动态 import()。 */
const IMPORT_RES = [
  { re: /\bimport\s+["']([^"']+)["']/g, label: "import" },
  { re: /\bfrom\s+["']([^"']+)["']/g, label: "import ... from" },
  { re: /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g, label: "import()" },
];

/* 内联 script 里哪些 type 算「JavaScript」——JSON-LD / JSON 不是脚本，不扫。 */
const JS_SCRIPT_TYPES = new Set([
  "",
  "module",
  "text/javascript",
  "application/javascript",
  "text/ecmascript",
  "application/ecmascript",
]);

const problems = [];
const notes = [];
const allowHits = new Map(); // host → 命中次数
let unjudgeableRequests = 0;

/* ---------------- 产物目录 ---------------- */

if (!fs.existsSync(SITE)) {
  console.error("第三方依赖门禁未通过：\n");
  console.error("  ✗ 找不到产物目录 _site —— 先跑 npm run build 再跑本门禁。");
  console.error("");
  process.exit(1);
}

const allFiles = walk(SITE);
const htmlFiles = allFiles.filter((f) => path.extname(f).toLowerCase() === ".html");
const cssFiles = allFiles.filter((f) => path.extname(f).toLowerCase() === ".css");
const jsFiles = allFiles.filter((f) => path.extname(f).toLowerCase() === ".js");
htmlFiles.sort();
cssFiles.sort();
jsFiles.sort();

/* ---------------- TD1 / TD2：HTML 里的外域引用 ---------------- */

let localScriptSrc = 0;
let localStylesheet = 0;
let scriptSrcTotal = 0;

for (const file of htmlFiles) {
  const rel = path.relative(SITE, file);
  const html = fs.readFileSync(file, "utf8");
  /* TD6 用：站外样式表有哪些、它们各自有没有非阻塞加载路径。 */
  const extStylesheets = new Map(); // href → { host }
  const nonBlockingPaths = new Set(); // href（同一 href 的 preload+onload 换装）
  for (const tag of scanTags(html)) {
    const attrs = parseAttrs(tag.attrSrc);

    /* --- script 的 src --- */
    if (tag.name === "script" && attrs.src) {
      scriptSrcTotal++;
      const c = classifyUrl(attrs.src);
      if (c.kind === "local") {
        localScriptSrc++;
      } else if (c.kind === "external") {
        const host = c.url.host.toLowerCase();
        const ok = allowance(host, "html:script");
        if (ok.ok) {
          allowHits.set(host, (allowHits.get(host) || 0) + 1);
        } else if (TD1_ON) {
          problems.push(
            `TD1 ${rel} 的 <script src="${attrs.src}"> 指向外域 ${host} —— ` +
              `本站的硬约束是零第三方前端运行时依赖（docs/ROADMAP.md 第 63–64 行）。\n` +
              `      → 第三方脚本进产物 = 访客的浏览器去执行别人家的代码，` +
              `供应链风险与性能都不可控。\n` +
              `      → 若确有必要，先在 scripts/check-third-party.cjs 的白名单里` +
              `按（域，上下文）登记并写明理由。\n` +
              (ok.reason ? `      → 当前登记状态：${ok.reason}\n` : "")
          );
        }
      }
    }

    /* --- link 的资源提示 --- */
    if (tag.name === "link" && attrs.href) {
      const rels = String(attrs.rel || "")
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
      /* TD6：先记下「这张表是站外的吗」「它有没有非阻塞加载路径」——
         登记与判定分开做，判定在页面级（TD6）。 */
      if (rels.includes("stylesheet")) {
        const c0 = classifyUrl(attrs.href);
        if (c0.kind === "external") {
          extStylesheets.set(attrs.href, { host: c0.url.host.toLowerCase() });
        }
      }
      if (
        rels.includes("preload") &&
        String(attrs.as || "").toLowerCase() === "style" &&
        attrs.onload &&
        /stylesheet/i.test(attrs.onload)
      ) {
        nonBlockingPaths.add(attrs.href);
      }
      for (const r of rels) {
        const context = LINK_FETCH_RELS[r];
        if (!context) continue; // canonical / alternate / author 等元数据指针
        const c = classifyUrl(attrs.href);
        if (c.kind === "local") {
          if (context === "link:stylesheet") localStylesheet++;
          continue;
        }
        if (c.kind !== "external") continue;
        const host = c.url.host.toLowerCase();
        const ok = allowance(host, context);
        if (ok.ok) {
          allowHits.set(host, (allowHits.get(host) || 0) + 1);
          continue;
        }
        if (!TD2_ON) continue;
        problems.push(
          `TD2 ${rel} 的 <link rel="${r}" href="${attrs.href}"> 指向外域 ${host} —— ` +
            `link 标签的这项 rel 会真的发起网络请求（取样式 / 预载 / 建连），` +
            `属于运行时依赖。\n` +
            `      → 站内资源一律用相对路径；确需外域的，在` +
            `scripts/check-third-party.cjs 的白名单里按（域，上下文）登记并写明理由。\n` +
            (ok.reason ? `      → 当前登记状态：${ok.reason}\n` : "")
        );
      }
    }

    /* --- 其余子资源元素 --- */
    const mediaAttrs = MEDIA_RESOURCE_ATTRS[tag.name];
    if (mediaAttrs) {
      for (const attrName of mediaAttrs) {
        const raw = attrs[attrName];
        if (!raw) continue;
        const urls = attrName === "srcset" ? srcsetUrls(raw) : [raw];
        for (const u of urls) {
          const c = classifyUrl(u);
          if (c.kind !== "external") continue;
          const host = c.url.host.toLowerCase();
          const ok = allowance(host, "html:media");
          if (ok.ok) {
            allowHits.set(host, (allowHits.get(host) || 0) + 1);
            continue;
          }
          if (!TD1_ON) continue;
          problems.push(
            `TD1 ${rel} 的 <${tag.name} ${attrName}="${u}"> 指向外域 ${host} —— ` +
              `访客要向外部服务器取这个资源，属于运行时依赖。\n` +
              `      → 站内资源一律用相对路径（本站的图片与图标全部自托管）。`
          );
        }
      }
    }
  }

  /* --- TD6：站外样式表不许占据渲染阻塞位 --- */
  if (TD6_ON) {
    for (const [href, info] of extStylesheets) {
      /* 只管**已登记**（白名单允许 link:stylesheet）的域。
         ⚠️ 为什么不管未登记的域：一张**未登记**的站外表本来就被 TD2 判红
         （"这个外域你没登记"）⇒ 同一事实已有红因；再叠一条 TD6 就是
         **同一事实出两条红因**，红因归属就没法判定了。
         ⇒ 分工：TD2 管「这个外域准不准用」，TD6 管「已经准用了的那张表
         是不是把首屏挡住了」。未登记 ⇒ 先过 TD2；登记了却留在阻塞位 ⇒ TD6。 */
      if (!allowance(info.host, "link:stylesheet").ok) continue;
      if (nonBlockingPaths.has(href)) continue;
      problems.push(
        `TD6 ${rel} 的 <link rel="stylesheet" href="${href}"> 指向外域 ${info.host}，` +
          `而它**没有配对的非阻塞加载路径** —— <link rel="stylesheet"> 在 <head> 里是` +
          `**渲染阻塞**资源 ⇒ **本站的第一次绘制要等这个第三方源**。\n` +
          `      → 本站自己的关键 CSS（tokens + base）已内联、自己那 4 个 CSS 也都走` +
          `preload+onload 换装 ⇒ 留一张站外表在阻塞位，等于**首屏被第三方 CDN 的` +
          `可用性单点卡住**（那个源慢或挂 ⇒ 全站白屏，而本站自己的资源一个都不缺）。\n` +
          `      → 改法：同一 href 另加一条 ` +
          `<link rel="preload" as="style" href="…" onload="this.rel='stylesheet'">，` +
          `并在 <noscript> 里留一份同步兜底（本站两张 Google Fonts 表就是这个形态）。\n` +
          `      → 想彻底不依赖第三方，只能自托管字体（见改进日志待决策段）。`
      );
    }
  }
}

/* ---------------- TD3：产物 CSS 里的外域引用 ---------------- */

let cssRefTotal = 0;

/**
 * 取出一个 CSS 片段里的 @import 与 url() 目标。
 * @param {string} css
 * @returns {{context: string, url: string}[]}
 */
function cssReferences(css) {
  const refs = [];
  let m;
  const impRe = /@import\s+(?:url\(\s*)?(?:"([^"]*)"|'([^']*)')/gi;
  while ((m = impRe.exec(css)) !== null) {
    refs.push({ context: "css:import", url: m[1] !== undefined ? m[1] : m[2] });
  }
  const urlRe = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"]+))\s*\)/gi;
  while ((m = urlRe.exec(css)) !== null) {
    const u = m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3];
    refs.push({ context: "css:url", url: u });
  }
  return refs;
}

/** 判一段 CSS（外链文件或内联块）里的外域引用。 */
function judgeCss(css, where) {
  const seen = new Set();
  for (const ref of cssReferences(css)) {
    const key = ref.url.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    cssRefTotal++;
    const c = classifyUrl(key);
    if (c.kind !== "external") continue;
    const host = c.url.host.toLowerCase();
    const ok = allowance(host, ref.context);
    if (ok.ok) {
      allowHits.set(host, (allowHits.get(host) || 0) + 1);
      continue;
    }
    if (!TD3_ON) continue;
    problems.push(
      `TD3 ${where} 引用了外域 ${host}（${ref.context}：${key}）—— ` +
        `CSS 从外部服务器取样式表或资源，属于运行时依赖。\n` +
        `      → 本站所有 CSS 与图片都自托管；确需外域的，在` +
        `scripts/check-third-party.cjs 的白名单里登记并写明理由。`
    );
  }
}

for (const file of cssFiles) {
  judgeCss(fs.readFileSync(file, "utf8"), path.relative(SITE, file));
}
for (const file of htmlFiles) {
  const rel = path.relative(SITE, file);
  const html = fs.readFileSync(file, "utf8");
  const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    judgeCss(m[1] || "", `${rel} 的内联 <style> 块`);
  }
}

/* ---------------- TD4：站内 JS 里的硬编码外域请求目标 ---------------- */

let jsCallTotal = 0;

/**
 * 判一段 JS（外链文件或内联块）里的硬编码外域请求目标与外域 import。
 * @param {string} code
 * @param {string} where
 */
function judgeJs(code, where) {
  const src = stripJsComments(code);

  for (const api of REQUEST_APIS) {
    api.re.lastIndex = 0;
    let m;
    while ((m = api.re.exec(src)) !== null) {
      const openIdx = src.indexOf("(", m.index + m[0].length - 1);
      if (openIdx < 0) continue;
      const args = splitArgs(src, openIdx);
      if (api.methodGuard) {
        const method = args[0] ? literalOf(args[0]) : null;
        if (!method || !HTTP_METHODS.has(method.toUpperCase())) continue;
      }
      const argText = args[api.argIndex];
      if (argText === undefined) continue;
      jsCallTotal++;
      const target = literalOf(argText);
      if (target === null) {
        unjudgeableRequests++;
        continue;
      }
      const c = classifyUrl(target);
      if (c.kind !== "external") continue;
      const host = c.url.host.toLowerCase();
      const ok = allowance(host, "js:request");
      if (ok.ok) {
        allowHits.set(host, (allowHits.get(host) || 0) + 1);
        continue;
      }
      if (!TD4_ON) continue;
      problems.push(
        `TD4 ${where} 里 ${api.label} 的目标是外域 ${host}（${target}）—— ` +
          `站内脚本在运行时向外部服务器发请求，属于第三方运行时依赖。\n` +
          `      → 确需外域的，在 scripts/check-third-party.cjs 的白名单里登记并写明理由。`
      );
    }
  }

  for (const imp of IMPORT_RES) {
    imp.re.lastIndex = 0;
    let m;
    while ((m = imp.re.exec(src)) !== null) {
      const spec = m[1];
      const c = classifyUrl(spec);
      if (c.kind !== "external") continue;
      const host = c.url.host.toLowerCase();
      const ok = allowance(host, "js:import");
      if (ok.ok) {
        allowHits.set(host, (allowHits.get(host) || 0) + 1);
        continue;
      }
      if (!TD4_ON) continue;
      problems.push(
        `TD4 ${where} 里 ${imp.label} 的说明符指向外域 ${host}（${spec}）—— ` +
          `从 CDN 导入模块 = 把第三方代码的执行权交给外域服务器，属于第三方运行时依赖。\n` +
          `      → 本站的模块全部自托管（src/assets/js/ → assets/js/）。`
      );
    }
  }
}

for (const file of jsFiles) {
  judgeJs(fs.readFileSync(file, "utf8"), path.relative(SITE, file));
}
for (const file of htmlFiles) {
  const rel = path.relative(SITE, file);
  const html = fs.readFileSync(file, "utf8");
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = parseAttrs(m[1] || "");
    const type = String(attrs.type || "").trim().toLowerCase();
    if (!JS_SCRIPT_TYPES.has(type)) continue; // JSON-LD 之类不是脚本
    judgeJs(m[2] || "", `${rel} 的内联 <script> 块`);
  }
}

/* ---------------- TD5：覆盖度自证 ---------------- */

if (htmlFiles.length < MIN_PAGES) {
  problems.push(
    `TD5 只扫到 ${htmlFiles.length} 个产物页面（要求至少 ${MIN_PAGES} 个）—— \n` +
      `      枚举逻辑多半坏了；「没报错」和「没问题」长得一模一样。`
  );
}
if (cssFiles.length < MIN_CSS_FILES) {
  problems.push(
    `TD5 只扫到 ${cssFiles.length} 个外链 CSS 文件（要求至少 ${MIN_CSS_FILES} 个）—— \n` +
      `      枚举逻辑多半坏了。`
  );
}
if (jsFiles.length < MIN_JS_FILES) {
  problems.push(
    `TD5 只扫到 ${jsFiles.length} 个外链 JS 文件（要求至少 ${MIN_JS_FILES} 个）—— \n` +
      `      枚举逻辑多半坏了。`
  );
}
if (localScriptSrc < MIN_LOCAL_SCRIPT) {
  problems.push(
    `TD5 只枚举到 ${localScriptSrc} 个本地 <script src>（要求至少 ${MIN_LOCAL_SCRIPT} 个）—— \n` +
      `      枚举逻辑多半坏了；TD1 一旦扫不到东西就会一直绿着。`
  );
}
if (localStylesheet < MIN_LOCAL_STYLESHEET) {
  problems.push(
    `TD5 只枚举到 ${localStylesheet} 个本地 stylesheet <link>（要求至少 ${MIN_LOCAL_STYLESHEET} 个）—— \n` +
      `      枚举逻辑多半坏了；TD2 一旦扫不到东西就会一直绿着。`
  );
}

/* 白名单条目用不上 ⇒ 只出提示，不判红（门禁不能惩罚「把外部依赖撤掉」这种改进）。 */
for (const [host, entry] of Object.entries(ALLOWLIST)) {
  if (!allowHits.get(host)) {
    notes.push(
      `白名单里的 ${host} 这一轮没被用到（登记的上下文：${entry.contexts.join(" / ")}）—— ` +
        `只提示不判红：把外部依赖撤掉是好事，不该把 build 打红。`
    );
  }
}
if (unjudgeableRequests > 0) {
  notes.push(
    `有 ${unjudgeableRequests} 处请求调用的目标**不是字面量**（由 DOM 属性或变量注入），` +
      `TD4 判不了 —— 那是访客侧数据的目标，不是第三方服务。`
  );
}

/* ---------------- 汇总 ---------------- */

if (problems.length) {
  console.error("第三方依赖门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

console.log(
  `第三方依赖门禁通过：${htmlFiles.length} 个产物页面 / ${cssFiles.length} 个外链 CSS / ` +
    `${jsFiles.length} 个外链 JS —— 外域子资源 0 个。`
);
console.log(
  `  · 枚举：${scriptSrcTotal} 个 <script src>（本地 ${localScriptSrc} 个）、` +
    `${localStylesheet} 个本地 stylesheet <link>、${cssRefTotal} 处 CSS 引用、` +
    `${jsCallTotal} 处 JS 请求调用。`
);
notes.forEach((n) => console.log(`  · ${n}`));
console.log(
  `  · 唯一的外域是 Google Fonts（已按（域，上下文）登记）：` +
    `${[...allowHits.keys()].join(" / ") || "（本轮无外域命中）"}。`
);
console.log("  · 判据出处：docs/DEFECT-BACKLOG.md D39（零第三方前端运行时依赖无门禁看守）。");
