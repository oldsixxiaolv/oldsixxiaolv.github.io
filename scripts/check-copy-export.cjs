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
 *   4. 两条复制路径（writeText 与 textarea 回退）必须取**同一个变量**，
 *      避免将来只改一条、两条出口行为分叉。
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

if (!fs.existsSync(target)) {
  console.error(`  ✗ 找不到要检查的文件：${target}`);
  console.error("    → 门禁读不到源码就无法判定（判红，不静默放行）");
  process.exit(1);
}

const raw = fs.readFileSync(target, "utf-8");
const code = stripComments(raw);
const rel = path.relative(path.join(__dirname, ".."), target);

// ---- 1) 找出所有复制出口 --------------------------------------------------
// 出口 A：navigator.clipboard.writeText(X)
const writeTextVars = [];
for (const m of code.matchAll(/\.writeText\(\s*([A-Za-z_$][\w$]*)\s*\)/g)) {
  writeTextVars.push(m[1]);
}
// 出口 B：<textarea 变量>.value = X
const textareaVars = [];
for (const m of code.matchAll(/([A-Za-z_$][\w$]*)\s*=\s*document\.createElement\(\s*["']textarea["']\s*\)/g)) {
  textareaVars.push(m[1]);
}
const fallbackVars = [];
for (const buf of textareaVars) {
  const re = new RegExp("\\b" + buf + "\\s*\\.value\\s*=\\s*([A-Za-z_$][\\w$]*)", "g");
  for (const m of code.matchAll(re)) fallbackVars.push(m[1]);
}

const exits = [
  ...writeTextVars.map((v) => ({ kind: "clipboard.writeText", varName: v })),
  ...fallbackVars.map((v) => ({ kind: "textarea 回退", varName: v })),
];

if (exits.length === 0) {
  problems.push(
    `${rel}: 找不到任何复制出口（clipboard.writeText / textarea 回退）——` +
      "要么复制功能被删了，要么这段源码改成了门禁看不懂的写法。" +
      "门禁看不懂时必须判红：否则它会一直'全绿'，看着像在守着，其实没守。"
  );
}

// ---- 2) 两条路径必须取同一个变量 ------------------------------------------
const distinct = [...new Set(exits.map((e) => e.varName))];
if (exits.length > 1 && distinct.length > 1) {
  problems.push(
    `${rel}: 复制出口取的不是同一个变量（${exits
      .map((e) => `${e.kind} → ${e.varName}`)
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

for (const e of exits) {
  const r = trace(e.varName);
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
