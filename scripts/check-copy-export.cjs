#!/usr/bin/env node
/**
 * Copy 出口的取值方式检查（**源码级**）。
 *
 * 为什么需要它：站点里有三个"直接出字节"的出口 —— `publications.bib`、
 * `feed.xml`、`sitemap.xml`，它们的内容会被 HTML 转义机制咬坏。但还有第四个
 * 出口是**在浏览器里发生的**：论文页的 "Copy BibTeX" 按钮，它把 `<pre>` 里的
 * 文本送进剪贴板，访客再粘进文献管理器。
 *
 * ⚠️ 关键区别（这正是本检查与"页面显示"判据的分界）：
 *   - **页面**：内容会被 HTML 解析器过一遍 → `&` 在产物里是 `&amp;`，
 *     浏览器 `textContent` 读出来时**自动还原** → 看到的是原文。
 *     这时 autoescape 是**正确行为**，不该改。
 *   - **直出件**（.bib / feed.xml / sitemap.xml）与**剪贴板**：不经过 HTML
 *     解析器 → 必须自己保证字节正确。
 *
 * 为什么必须是**源码级**检查：产品级门禁（看产物）**观测不到 JS 内部怎么取值**。
 * 产物里的 `<pre>` 无论用 textContent 还是 innerHTML 取，长得一模一样；
 * 只有读源码才知道复制出去的是"文本"还是"HTML 源码"。
 *
 * 为什么**不**写成"整个 main.js 不得含 innerHTML"：那是个过宽的断言。
 * 今天文件里 innerHTML 零命中只是**巧合**；将来别处合法用一次（哪怕跟复制
 * 毫无关系）就会误报。→ 本检查只盯**真正喂给复制出口的那个值**。
 *
 * 判定（缺一即判红）：
 *   1. 复制出口必须存在（clipboard.writeText / textarea 回退）——找不到 = 门禁看不懂了；
 *   2. 复制出口取到的值，必须**最终来自 `.textContent` 读取**；
 *   3. 取值链上**不得**出现 `.innerHTML` / `.outerHTML`（那是 HTML 源码，不是文本）；
 *   4. 两条复制路径（writeText 与 textarea 回退）必须取**同一个值**，
 *      避免将来只改一条、两条出口行为分叉；
 *   5. 门禁认出的出口数必须与源码里**实际的调用点**数一致——少认一个，
 *      就说明有一条复制路径门禁根本没看见，而"没看见"不等于"没问题"。
 *
 * ⚠️ 第十九轮补的一条**计数自检**（与第 5 条配套，方向相反）：
 *   第 5 条要数得准，前提是"调用点"这个数本身算得对。所以计数时**先把
 *   字符串字面量的内容抹掉**再数——否则文案里出现一句 "writeText(" 就会
 *   被当成一个调用点，数字对不上，白报一次红。宁可误报也不能漏报：
 *   漏报 = 有路径没守。
 *
 * ⚠️ 第十八轮补的一条**检测逃逸**（实测，不是假想）：
 *   本检查最初**只认裸标识符实参**（`\.writeText\(\s*([A-Za-z_$][\w$]*)\s*\)`）。
 *   于是 `writeText(src.innerHTML)`、`writeText(text.trim())` 这类
 *   **实参不是裸标识符**的调用**根本不会被识别为出口**——门禁会报
 *   "1 个出口，取值来自 textContent"并 exit 0，而实际剪贴板路径在复制 HTML 源码。
 *   → **漏看一条路径 = 等于没守这条路径**：门禁看着绿，缺陷照样上线。
 *   现在改成**匹配整个实参表达式**，再按表达式本身判定（见下）。
 */
const fs = require("fs");
const path = require("path");

// 允许传一个文件路径（**只给故障注入用**）；默认检查仓库里那一份。
const target = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, "..", "src", "assets", "js", "main.js");

const problems = [];

/** 剥掉注释（保留字符串字面量：判定要认 "textarea" 这个 createElement 参数） */
function stripComments(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === "/*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? src.length : end + 2;
      out += " ";
      continue;
    }
    if (two === "//") {
      const end = src.indexOf("\n", i);
      i = end === -1 ? src.length : end;
      out += " ";
      continue;
    }
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      let j = i + 1;
      while (j < src.length && src[j] !== quote) j += src[j] === "\\" ? 2 : 1;
      out += src.slice(i, Math.min(j + 1, src.length));
      i = j + 1;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** 标出"字符串字面量内容"所在的字符区间（不含引号本身）。
    用来判断某个匹配**起点**是不是落在文案里 —— 落在文案里的
    "writeText(" 不是一个调用点，不该被数进去。
    ⚠️ 不能把字面量内容直接抹掉再计数：那样 `createElement("textarea")`
    里的 "textarea" 也被抹了，连"这个 textarea 变量是不是被认出来了"
    都数不出来。→ 这里只标位置，不改内容。 */
function stringMask(src) {
  const mask = new Uint8Array(src.length);
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      let j = i + 1;
      while (j < src.length && src[j] !== quote) j += src[j] === "\\" ? 2 : 1;
      for (let k = i + 1; k < Math.min(j, src.length); k++) mask[k] = 1;
      i = j + 1;
      continue;
    }
    i++;
  }
  return mask;
}

/** 数"真实调用点"：匹配**起点**落在字符串字面量内容里的，不算。 */
function countOutsideStrings(src, mask, re) {
  let n = 0;
  for (const m of src.matchAll(re)) if (!mask[m.index]) n++;
  return n;
}

if (!fs.existsSync(target)) {
  console.error(`  ✗ 找不到要检查的文件：${target}`);
  console.error("    → 门禁读不到源码就无法判定（判红，不静默放行）");
  process.exit(1);
}

const raw = fs.readFileSync(target, "utf-8");
const code = stripComments(raw);
const mask = stringMask(code); // 计数用：标出字符串字面量内容所在的位置
const rel = path.relative(path.join(__dirname, ".."), target);

// ---- 1) 找出所有复制出口 --------------------------------------------------
// 出口 A：navigator.clipboard.writeText(<实参表达式>)
// ⚠️ **必须匹配整个实参**，不能只认裸标识符（见文件头的"检测逃逸"说明）：
//    `writeText(src.innerHTML)` / `writeText(text.trim())` 这类调用若不被识别为
//    出口，门禁就会漏看这条路径 —— 而"没看见"不等于"没问题"。
const writeTextExprs = [];
for (const m of code.matchAll(/\.\s*writeText\s*\(\s*((?:[^()]|\([^()]*\))*)\s*\)/g)) {
  writeTextExprs.push(m[1].trim());
}
// 出口 B：<textarea 变量>.value = <实参表达式>
const textareaVars = [];
for (const m of code.matchAll(/([A-Za-z_$][\w$]*)\s*=\s*document\.createElement\(\s*["']textarea["']\s*\)/g)) {
  textareaVars.push(m[1]);
}
const fallbackExprs = [];
for (const buf of textareaVars) {
  const re = new RegExp("\\b" + buf + "\\s*\\.value\\s*=\\s*([^;,\\n]*)", "g");
  for (const m of code.matchAll(re)) fallbackExprs.push(m[1].trim());
}

const exits = [
  ...writeTextExprs.map((expr) => ({ kind: "clipboard.writeText", expr })),
  ...fallbackExprs.map((expr) => ({ kind: "textarea 回退", expr })),
];

if (exits.length === 0) {
  problems.push(
    `${rel}: 找不到任何复制出口（clipboard.writeText / textarea 回退）——` +
      "要么复制功能被删了，要么这段源码改成了门禁看不懂的写法。" +
      "门禁看不懂时必须判红：否则它会一直'全绿'，看着像在守着，其实没守。"
  );
}

// ---- 1b) 出口计数自检：源码里的调用点必须与门禁认出的出口一一对应 -------
// 为什么必须自查：上面两段正则**有可能漏匹配**（例如实参里再套一层括号
// `writeText(fn(() => x))`）。漏匹配的后果不是"判红"，而是**少认一个出口**
// ——门禁会照常报"N 个出口"然后 exit 0，而那条没被看见的复制路径里
// 完全可以是 `writeText(src.innerHTML)`。
// → "没看见"不等于"没问题"：这里用**更宽松的调用点计数**反过来校验
//   **出口数**。计数用的正则刻意比提取用的宽松（不要求前面那个点），
//   差别本身就是"提取漏了"的信号。数目对不上，一律判红。
//
// ⚠️ 已知局限：写成 `clipboard["writeText"](x)` 这种把函数名放进方括号
//    的写法，宽松计数也数不到（函数名在字符串字面量里）。这种写法在
//    本站不会出现；真出现了，"找不到任何复制出口"那条会先判红。
const writeTextCallSites = countOutsideStrings(code, mask, /\bwriteText\s*\(/g);
const textareaCreateSites = countOutsideStrings(
  code,
  mask,
  /\bcreateElement\s*\(\s*["']textarea["']\s*\)/g
);
if (writeTextCallSites !== writeTextExprs.length) {
  problems.push(
    `${rel}: 源码里有 ${writeTextCallSites} 处 writeText 调用，但门禁只认出 ` +
      `${writeTextExprs.length} 个**剪贴板**出口——有复制路径没被门禁看见。` +
      "（多半是实参写法超出了正则能匹配的范围。）" +
      "少认 = 没守：这条路径里完全可能藏着 innerHTML。"
  );
}
if (textareaCreateSites !== textareaVars.length) {
  problems.push(
    `${rel}: 源码里有 ${textareaCreateSites} 处 textarea 创建，但门禁只认出 ` +
      `${textareaVars.length} 个 textarea 变量——回退路径没被门禁看见。`
  );
}

// ---- 2) 两条路径必须取同一个值 --------------------------------------------
// 比较的是"实参的根标识符"：`text` 与 `text.trim()` 算同一个值（同一个源），
// `text` 与 `src.innerHTML` 算不同（一个来自文本、一个来自 HTML 源码）。

/** 取表达式的"根标识符"：`text` → "text"；`text.trim()` → "text"；
    `src.innerHTML` → "src"。取不到根（不以标识符开头）→ null（判红，不猜）。 */
function rootOf(expr) {
  const m = String(expr).trim().match(/^([A-Za-z_$][\w$]*)/);
  return m ? m[1] : null;
}

const roots = exits.map((e) => rootOf(e.expr));
const distinct = [...new Set(roots.filter(Boolean))];
if (exits.length > 1 && distinct.length > 1) {
  problems.push(
    `${rel}: 复制出口取的不是同一个值（${exits
      .map((e) => `${e.kind} → ${e.expr}`)
      .join("，")}）——` +
      "将来只改一条路径，两条出口的行为就会分叉（剪贴板一份、回退一份）。"
  );
}

// ---- 3) 取值链必须最终来自 .textContent，且链上不得有 innerHTML ---------
/** 找某个变量的所有声明表达式 */
function declarationsOf(name) {
  const out = [];
  const re = new RegExp("\\b(?:const|let|var)\\s+" + name + "\\s*=\\s*([^;\\n]+)", "g");
  for (const m of code.matchAll(re)) out.push(m[1].trim());
  return out;
}

const HTML_READERS = /\.\s*(innerHTML|outerHTML)\b/;
const TEXT_READER = /\.\s*textContent\b/;

/**
 * 顺着取值链回溯：每个标识符都要能解释清楚，
 * 终点必须是 `.textContent` 读取；链上出现 innerHTML/outerHTML 立即判红。
 * 解释不了（声明找不到 / 表达式看不懂）→ 判红，不静默放行。
 */
function trace(name, seen = new Set()) {
  if (seen.has(name)) return { ok: false, why: "取值链出现环，无法判定" };
  seen.add(name);
  const decls = declarationsOf(name);
  if (decls.length === 0) {
    return { ok: false, why: `找不到 "${name}" 的声明（门禁看不懂它从哪来）` };
  }
  const whys = [];
  for (const expr of decls) {
    if (HTML_READERS.test(expr)) {
      return {
        ok: false,
        why:
          `"${name}" 取自 .${HTML_READERS.exec(expr)[1]} —— 那是 HTML 源码，不是文本。` +
          "复制出去会被文献管理器当成实体（&amp; / &#92; 之类），或直接粘出标签。",
      };
    }
    if (TEXT_READER.test(expr)) continue; // 终点：来自 textContent，OK
    const id = expr.match(/^([A-Za-z_$][\w$]*)\s*$/);
    if (id) {
      const r = trace(id[1], seen);
      if (!r.ok) return r;
      continue;
    }
    return {
      ok: false,
      why: `"${name}" 的取值表达式看不懂（${expr}）——门禁无法确认它来自文本。`,
    };
  }
  return { ok: true };
}

/**
 * 判定一个**出口实参表达式**安不安全。
 *
 * 两步，顺序不能换：
 *   1. 表达式**本身**若直接读了 .innerHTML / .outerHTML → 立即判红。
 *      这一步必须在回溯之前：实参写成 `src.innerHTML` 时，根标识符是 `src`，
 *      只回溯 `src` 只能知道"src 是从 DOM 里拿的"，看不出拿的是**哪一部分**。
 *   2. 否则取根标识符，沿取值链回溯（trace）到 .textContent 为止。
 *      回溯不动 → 判红（门禁看不懂就不放行）。
 */
function judge(expr) {
  const e = String(expr).trim();
  const htmlHit = e.match(/\.\s*(innerHTML|outerHTML)\b/);
  if (htmlHit) {
    return {
      ok: false,
      why:
        `取值表达式直接读了 .${htmlHit[1]} —— 那是 HTML 源码，不是文本。` +
        "复制出去会被文献管理器当成实体（&amp; / &#92; 之类），或直接粘出标签。",
    };
  }
  const root = rootOf(e);
  if (!root) {
    return {
      ok: false,
      why: `取值表达式看不懂（${e}）——门禁无法确认它来自文本。`,
    };
  }
  return trace(root);
}

for (const e of exits) {
  const r = judge(e.expr);
  if (!r.ok) problems.push(`${rel}: ${e.kind} → ${r.why}`);
}

// ---- 输出 -----------------------------------------------------------------
if (problems.length) {
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(`\nCopy 出口检查失败：${problems.length} 个问题（${rel}）`);
  process.exit(1);
}
console.log(
  `Copy 出口检查通过（${rel}：${exits.length} 个出口，取值来自 textContent）`
);
