#!/usr/bin/env node
/**
 * 门禁 JA1–JA4：**站内 JS 查询的目标 DOM 必须在产物里真实存在**
 *
 * 为什么要有这个门禁（一次实测坐实的看护缺口，不是假想）：
 *   站内脚本通过 querySelector / closest / getElementById 去拿页面上的元素。
 *   一旦**目标元素根本不存在**，那段代码就是**100% 空转**：事件监听器注册了，
 *   却永远命中不到任何元素；条件判断永远为假；模块被下载、被解析、被执行，
 *   产出的效果是零。
 *
 *   本轮实测抓到三处**同族**的空转（缺陷清单 D53）：
 *     ① src/assets/js/nav.js —— 它唯二操作的 DOM（抽屉容器与它的开关按钮）
 *        在**全部产物页面里 0 处**：站点导航早已改成 topbar 一套，
 *        旧的抽屉结构连同脚本一起被遗忘。脚本仍被 main.js 无条件 import。
 *     ② src/assets/js/paper-reader/reading-progress.js —— init() 的第一件事
 *        就是找进度条元素，找不到就 return；模板与样式表里从来没有这个元素。
 *        它仍被 paper-reader/main.js 无条件动态 import（论文页每次都下载）。
 *     ③ main.js 里给 [data-year] 填年份的那几行 —— 页脚年份走构建期的
 *        buildYear，模板里从来没有 data-year 元素。
 *
 *   这类缺陷**没有任何门禁能抓到**：
 *     · IP1（图片发布清单）管的是「源里有、没人引用、却进了产物」——
 *       这三处**有**引用点（main.js import 了它们），方向正好相反；
 *     · CS2–CS3（CSS 发布清单）管 CSS，不管 JS；
 *     · 死 CSS 门禁只扫 pages.css（其余样式表有运行时创建的类名，扫全站会误报）。
 *   ⇒ 也就是说：**「脚本活着，但它操作的 DOM 从不存在」这一族完全没人看守。**
 *
 * 四条判据（编号用独立字母体系 JA*，**不与既有前缀冲突**：
 *   JS*（站内 JS 门禁）/ JT*（工具路由）/ IP*（图片发布清单）/ IA*（图片资产）
 *   / CS*（CSS 发布清单）等均不同名）：
 *   JA1 **死目标** —— 脚本查询的选择器，在产物里找不到、也不由站内脚本运行时
 *      创建 ⇒ 判红（那段行为永远不会发生）。
 *      判定按 **CSS 选择器列表**的语义逐层做：
 *        ① 选择器列表按逗号拆成**分支**（分支之间是「或」：任一分支可达即可）；
 *        ② 分支内的 token（类名 / 属性名 / id）之间是「与」：全部满足才算可达；
 *        ③ 伪类、伪元素、标签名不产生约束（它们不是「目标是否存在」的证据）。
 *      「运行时创建」也算可达：脚本自己建出来的元素，产物里当然没有。
 *   JA2 **覆盖度自证** —— 至少认出一个目标 token；一个都没认出说明
 *      提取器坏了，不是「没问题」。
 *   JA3 **门禁自己没被卸掉** —— package.json 的 build 链里必须真的有本门禁。
 *   JA4 **逐模块提取自证** —— 凡源码里出现过选择器 API 调用的模块，
 *      必须至少提取到一个选择器（**字面量**与 **const 绑定的字面量**都算）；
 *      两者都提取不到 ⇒ 这个模块的 DOM 目标完全不受本门禁检查（判红）。
 *
 * ⚠️ 门禁**守不了什么**（写清楚，不藏）：
 *   · **动态拼接的选择器**（参数是运行时算出来的字符串）静态抓不到 ——
 *     本门禁只认字面量参数与 const 绑定的字面量。
 *     ⇒ 只靠动态选择器定位元素的模块会被 **JA4** 判红（门禁看不见它，
 *       就要求把它写出来）。这不是误报，是「显式化」的要求。
 *   · **`:not(...)` 里的类名**会被当成普通类名抽出来（本站没有用到这种写法）。
 *   · **不判脚本逻辑对不对**（算错了、顺序错了、竞态）—— 那是行为层的事。
 *   · **不判元素存在之后行为是否正确**（元素在，但用错了）—— 本门禁只管
 *     「查得到 / 查不到」。
 *   · **不判 src/assets/js/ 以外的脚本**（构建期的 .cjs 不进浏览器，
 *     它们的"目标"是文件系统，不是 DOM）。
 *   · **不判动态创建清单里没被识别的创建形态**（例如把类名拼成变量再赋值）；
 *     那种写法静态不可判，门禁只能保守放行。
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
const JA1_ON = true;
const JA2_ON = true;
const JA3_ON = true;
const JA4_ON = true;

/* JA2 的覆盖度下限：只要站内还有脚本在查 DOM，就至少能认出一个目标 token。
   ⚠️ 下限刻意取 1：取大会与其它判据**耦合**（故意制造「目标全不存在」这类
   缺陷形态时，覆盖度也会跟着红 ⇒ 同一档出现两条编号 ⇒ 红因归属不可判定）。 */
const MIN_TOKENS = 1;

/* 受检面：浏览器端脚本目录（构建期的 .cjs 不进浏览器，不受检）。 */
const JS_DIR = path.join(REPO, "src", "assets", "js");

const problems = [];
/** 记一条判红。id 是判据编号（JAn）—— 自测靠它断言「红因归属纯净」。 */
function fail(id, msg) {
  problems.push(`${id}：${msg}`);
}
function report() {
  console.error("站内 JS 目标门禁未通过：\n");
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

/* ================= 工具：剥注释（做提取前必做） ================= */

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

/* ================= 事实采集：产物侧 ================= */

if (!fs.existsSync(JS_DIR)) {
  console.error("站内 JS 目标门禁未通过：\n");
  console.error(`  ✗ 找不到站内脚本目录 src/assets/js —— 无法核对脚本查询的目标。`);
  console.error("");
  process.exit(1);
}
if (!fs.existsSync(SITE)) {
  console.error("站内 JS 目标门禁未通过：\n");
  console.error(`  ✗ 找不到产物目录 ${SITE} —— 先构建产物再跑本门禁。`);
  console.error("");
  process.exit(1);
}

/**
 * 取一个标签上的属性（名字 + 值）。
 *
 * ⚠️ **布尔属性（无值写法）必须收进来** —— 本站大量用 `data-reveal`、
 * `data-chart-canvas` 这种「有名字没值」的写法。只认 "name=" 的提取器
 * 会把它们全漏掉，于是门禁会**反向误报**「产物里明明有、门禁却说找不到」。
 * （这正是本门禁第一版栽的坑：漏收 ⇒ 6 处假红。）
 *
 * 引号里的值整体吞掉，避免值里的 "=" 被当成属性名。
 */
function parseAttrs(tag) {
  const body = tag.replace(/^<[a-zA-Z][\w:-]*/, "");
  const out = [];
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const name = m[1].toLowerCase();
    if (!name) continue;
    let value = null;
    if (m[2] !== undefined) value = m[2];
    else if (m[3] !== undefined) value = m[3];
    else if (m[4] !== undefined) value = m[4];
    out.push({ name, value });
  }
  return out;
}

/**
 * 产物 HTML 里的三类事实：类名集合、属性名集合、id 集合。
 */
function productFacts() {
  const classes = new Set();
  const attrs = new Set();
  const ids = new Set();
  for (const f of walk(SITE)) {
    if (!/\.html?$/i.test(f)) continue;
    let text;
    try {
      text = fs.readFileSync(f, "utf8");
    } catch {
      continue;
    }
    // 去掉 script/style 的正文：里面的 < 会被当成标签
    text = text.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ");
    // 标签匹配要能扛住属性值里的 ">"（否则标签会被截断、后面的属性全丢）
    for (const m of text.matchAll(/<[a-zA-Z][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>/g)) {
      for (const a of parseAttrs(m[0])) {
        attrs.add(a.name);
        if (a.name === "class" && a.value) {
          a.value.split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
        } else if (a.name === "id" && a.value) {
          ids.add(a.value);
        }
      }
    }
  }
  return { classes, attrs, ids };
}

/* ================= 事实采集：运行时创建（源侧） ================= */

/** 把 "a b c" 这样的列表拆成单个名字。 */
function addTokens(set, value) {
  if (!value) return;
  for (const t of String(value).split(/\s+/)) {
    if (t) set.add(t);
  }
}

/**
 * 站内脚本**运行时创建**的类名 / 属性名 / id。
 * 脚本自己建出来的元素，产物里当然没有 —— 它们不算「死目标」。
 * 覆盖的创建形态（本仓实际用到的都在内）：
 *   classList.add/remove/toggle("X") · .className = "X" ·
 *   setAttribute("class", "X") · { class: "X" } · HTML 字符串里的 class="X"
 *   setAttribute("data-xxx", …) · dataset: { xxx: … }（→ data-xxx）
 */
function dynamicFacts(jsFiles) {
  const classes = new Set();
  const attrs = new Set();
  const ids = new Set();
  for (const f of jsFiles) {
    let text;
    try {
      text = fs.readFileSync(f, "utf8");
    } catch {
      continue;
    }
    const t = stripJsComments(text);
    for (const m of t.matchAll(/classList\.(?:add|remove|toggle)\s*\(\s*["'`]([^"'`]*)["'`]/g)) addTokens(classes, m[1]);
    for (const m of t.matchAll(/\.className\s*=\s*["'`]([^"'`]*)["`]/g)) addTokens(classes, m[1]);
    for (const m of t.matchAll(/setAttribute\s*\(\s*["'`]class["'`]\s*,\s*["'`]([^"'`]*)["`]/g)) addTokens(classes, m[1]);
    for (const m of t.matchAll(/(?:^|[,{]\s*)class\s*:\s*["'`]([^"'`]*)["`]/g)) addTokens(classes, m[1]);
    for (const m of t.matchAll(/\bclass\s*=\s*["']([^"']*)["']/g)) addTokens(classes, m[1]);
    for (const m of t.matchAll(/\.id\s*=\s*["'`]([^"'`]*)["`]/g)) ids.add(m[1]);
    for (const m of t.matchAll(/setAttribute\s*\(\s*["'`]id["'`]\s*,\s*["'`]([^"'`]*)["`]/g)) ids.add(m[1]);
    for (const m of t.matchAll(/(?:^|[,{]\s*)id\s*:\s*["'`]([^"'`]*)["`]/g)) ids.add(m[1]);
    for (const m of t.matchAll(/dataset\s*:\s*\{([^}]*)\}/g)) {
      for (const k of m[1].matchAll(/([A-Za-z_][\w-]*)\s*:/g)) attrs.add(`data-${k[1].toLowerCase()}`);
    }
    for (const m of t.matchAll(/setAttribute\s*\(\s*["'`](data-[a-zA-Z_:][\w:.-]*)["'`]/g)) attrs.add(m[1].toLowerCase());
  }
  return { classes, attrs, ids };
}

/* ================= 选择器提取 ================= */

/** 选择器 API 的「宽松」检测：只看有没有调用（用于 JA4 的对照）。 */
const API_CALL_RE = /(?:querySelectorAll|querySelector|closest|getElementsByClassName|getElementById)\s*\(/g;
/** 选择器 API 的「严格」提取：只认**字面量**参数。 */
const API_LITERAL_RE =
  /(?:querySelectorAll|querySelector|closest|getElementsByClassName|getElementById)\s*\(\s*(["'`])([^"'`]+)\1/g;
/** 选择器 API 的「参数是裸标识符」形态：交给常量绑定解析。 */
const API_IDENT_RE =
  /(?:querySelectorAll|querySelector|closest|getElementsByClassName|getElementById)\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/g;

/**
 * 按 CSS 语义把一个选择器列表拆成分支（分支之间是「或」）。
 * 括号 / 方括号里的逗号不拆（:not(a, b) 是一个整体）。
 */
function splitBranches(selector) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of selector) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

/**
 * 一个分支里要满足的 token。
 * 伪类、伪元素、标签名不产生约束（它们不是「目标存在与否」的证据）。
 */
function branchTokens(branch) {
  const classes = new Set();
  const attrs = new Set();
  const ids = new Set();
  for (const m of branch.matchAll(/\.([A-Za-z_][\w-]*)/g)) classes.add(m[1]);
  for (const m of branch.matchAll(/\[([A-Za-z_][\w-]*)/g)) attrs.add(m[1].toLowerCase());
  for (const m of branch.matchAll(/#([A-Za-z_][\w-]*)/g)) ids.add(m[1]);
  return { classes, attrs, ids };
}

/**
 * 提取一个模块里所有选择器调用。
 * getElementById / getElementsByClassName 的参数**不是** CSS 选择器，
 * 要按它们各自的语义处理（否则 id 会被当成标签名、class 会被当成后代选择器）。
 */
function pushSelector(out, api, arg) {
  if (api === "getElementById") {
    out.push({
      api,
      selector: `#${arg}`,
      branches: [{ selector: `#${arg}`, tokens: { classes: new Set(), attrs: new Set(), ids: new Set([arg]) } }],
    });
  } else if (api === "getElementsByClassName") {
    const names = arg.split(/\s+/).filter(Boolean);
    out.push({
      api,
      selector: `.${names.join(" .")}`,
      branches: [{ selector: `.${names.join(" .")}`, tokens: { classes: new Set(names), attrs: new Set(), ids: new Set() } }],
    });
  } else {
    const branches = splitBranches(arg).map((b) => ({ selector: b, tokens: branchTokens(b) }));
    out.push({ api, selector: arg, branches });
  }
}

/**
 * 模块里「常量绑定的字面量」：const SEL = "[data-x]" ⇒ SEL 本身就代表那个选择器。
 *
 * 不解析它会有两种坏结果：
 *   ① 该模块被判「提取逻辑失灵」（JA4）—— 其实只是写法不是字面量；
 *   ② 那个目标**根本没人检查** —— 而它恰恰是真实的 DOM 契约
 *      （本仓 home-chart.js 的 PANEL_SELECTOR 就是这种）。
 */
function stringBindings(src) {
  const map = new Map();
  const t = stripJsComments(src);
  const re = /(?:^|[;{}\s])(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(["'`])([^"'`\n]+)\2/g;
  let m;
  while ((m = re.exec(t)) !== null) map.set(m[1], m[3]);
  return map;
}

function extractSelectors(src) {
  const out = [];
  const t = stripJsComments(src);
  API_LITERAL_RE.lastIndex = 0;
  let m;
  while ((m = API_LITERAL_RE.exec(t)) !== null) {
    const api = m[0].slice(0, m[0].indexOf("(")).trim();
    pushSelector(out, api, m[2]);
  }
  /* 参数是**裸标识符**时：能解出常量绑定的字面量就按字面量处理，
     解不出来的留给 JA4（说明这个模块的 DOM 目标完全不受本门禁检查）。 */
  const bindings = stringBindings(src);
  API_IDENT_RE.lastIndex = 0;
  while ((m = API_IDENT_RE.exec(t)) !== null) {
    const api = m[0].slice(0, m[0].indexOf("(")).trim();
    const value = bindings.get(m[1]);
    if (value === undefined) continue;
    pushSelector(out, api, value);
  }
  return out;
}

/* ================= 判定 ================= */

const product = productFacts();
const jsFiles = walk(JS_DIR)
  .filter((f) => /\.js$/i.test(f))
  .sort();
const dynamic = dynamicFacts(jsFiles);

function tokenOk(kind, value) {
  if (kind === "class") return product.classes.has(value) || dynamic.classes.has(value);
  if (kind === "attr") {
    const v = value.toLowerCase();
    return product.attrs.has(v) || dynamic.attrs.has(v);
  }
  return product.ids.has(value) || dynamic.ids.has(value);
}

/** 一个分支可达 = 它的每个 token 都满足。 */
function branchReachable(branch) {
  const missing = [];
  for (const c of branch.tokens.classes) if (!tokenOk("class", c)) missing.push(`类名 .${c}`);
  for (const a of branch.tokens.attrs) if (!tokenOk("attr", a)) missing.push(`属性 [${a}]`);
  for (const i of branch.tokens.ids) if (!tokenOk("id", i)) missing.push(`id #${i}`);
  return { ok: missing.length === 0, missing };
}

/** 一个选择器可达 = 至少一个分支可达。 */
function selectorReachable(sel) {
  let best = null;
  for (const branch of sel.branches) {
    const r = branchReachable(branch);
    if (r.ok) return { ok: true, missing: [] };
    if (!best) best = r;
  }
  return best || { ok: true, missing: [] };
}

/* 每个模块的提取结果（含 JA4 需要的两个计数）。 */
const modules = jsFiles.map((f) => {
  let src = "";
  try {
    src = fs.readFileSync(f, "utf8");
  } catch {
    src = "";
  }
  const calls = (stripJsComments(src).match(API_CALL_RE) || []).length;
  const selectors = extractSelectors(src);
  return {
    file: f,
    rel: path.relative(REPO, f).split(path.sep).join("/"),
    calls,
    selectors,
  };
});

const allSelectors = modules.flatMap((m) => m.selectors.map((s) => ({ ...s, module: m.rel })));
const tokenCount = allSelectors.reduce(
  (n, s) => n + s.branches.reduce((k, b) => k + b.tokens.classes.size + b.tokens.attrs.size + b.tokens.ids.size, 0),
  0
);

/* ================= JA1：死目标 ================= */

if (JA1_ON) {
  for (const sel of allSelectors) {
    const r = selectorReachable(sel);
    if (r.ok) continue;
    fail(
      "JA1",
      `${sel.module} 查询的选择器 "${sel.selector}" 在产物里**找不到对应元素**` +
        `（缺的：${r.missing.join("、")}）—— 这段行为**永远不会发生**：` +
        `脚本会被下载、被执行，却命中不到任何东西（事件监听器注册了也白注册，` +
        `条件判断恒为假）。要么让产物里真的出现这个元素（模板补上 / 别忘了 include ` +
        `那个 partial），要么把这段查询连同它服务的代码一起删掉。`
    );
  }
}

/* ================= JA2：覆盖度自证 ================= */

if (JA2_ON) {
  if (tokenCount < MIN_TOKENS) {
    fail(
      "JA2",
      `一个目标 token 都没认出（认出 ${tokenCount} 个）—— 提取器可能坏了，` +
        `不是「没问题」。`
    );
  }
  if (modules.length === 0) {
    fail("JA2", `站内脚本目录 src/assets/js 下一个 .js 都没读到 —— 枚举器可能坏了。`);
  }
  if (product.classes.size === 0 && product.attrs.size === 0 && product.ids.size === 0) {
    fail("JA2", `产物里一个类名 / 属性名 / id 都没读出来 —— 产物扫描器可能坏了。`);
  }
}

/* ================= JA3：门禁自己没被卸掉 ================= */

if (JA3_ON) {
  let pkg = null;
  try {
    pkg = JSON.parse(fs.readFileSync(PKG, "utf8"));
  } catch (e) {
    fail("JA3", `读不到 package.json（${e.message}）—— 无法确认本门禁接在 build 链上。`);
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
      fail("JA3", `门禁自己被卸掉了：package.json 的 build 链里没有指向 scripts/${SELF} 的 script。`);
    }
  }
}

/* ================= JA4：逐模块提取自证 ================= */

if (JA4_ON) {
  for (const m of modules) {
    if (m.calls === 0) continue; // 这个模块压根没查 DOM
    if (m.selectors.length === 0) {
      fail(
        "JA4",
        `${m.rel} 里有 ${m.calls} 处选择器 API 调用，却**一个选择器都没提取到** —— ` +
          `字面量与 const 绑定的字面量都算过，说明这些调用的参数是**真正动态**的，` +
          `这个模块的 DOM 目标完全不受本门禁检查。请把选择器写成字面量` +
          `（或 const 绑定的字面量），门禁才看得见它。`
      );
    }
  }
}

/* ================= 通过 ================= */

if (problems.length) {
  report();
}

const withCalls = modules.filter((m) => m.calls > 0).length;
console.log(
  `站内 JS 目标门禁通过：受检脚本 ${modules.length} 个（其中 ${withCalls} 个查询 DOM）、` +
    `选择器 ${allSelectors.length} 个、目标 token ${tokenCount} 个 —— ` +
    `脚本查询的目标要么在产物里真实存在，要么由站内脚本运行时创建，没有指向不存在元素的行为。`
);
console.log(
  `  · 产物侧事实：类名 ${product.classes.size} 个、属性名 ${product.attrs.size} 个、id ${product.ids.size} 个；` +
    `运行时创建：类名 ${dynamic.classes.size} 个、属性名 ${dynamic.attrs.size} 个、id ${dynamic.ids.size} 个。`
);
