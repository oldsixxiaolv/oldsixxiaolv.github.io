#!/usr/bin/env node
/**
 * Copy 出口的取值方式检查（**源码级**）。
 *
 * 为什么需要它：站点里有几个"直接出字节"的出口 —— `publications.bib`、
 * `publications.ris`、`feed.xml`、`sitemap.xml`，它们的内容会被 HTML 转义机制
 * 咬坏。但还有一类出口是**在浏览器里发生的**：论文页的 "Copy BibTeX" /
 * "Copy RIS" 按钮，它把 `<pre>` 里的文本送进剪贴板，访客再粘进文献管理器。
 *
 * ⚠️ 关键区别（这正是本检查与"页面显示"判据的分界）：
 *   - **页面**：内容会被 HTML 解析器过一遍 → `&` 在产物里是 `&amp;`，
 *     浏览器 `textContent` 读出来时**自动还原** → 看到的是原文。
 *     这时 autoescape 是**正确行为**，不该改。
 *   - **直出件**（.bib / .ris / feed.xml / sitemap.xml）与**剪贴板**：不经过
 *     HTML 解析器 → 必须自己保证字节正确。
 *
 * 为什么必须是**源码级**检查：产品级门禁（看产物）**观测不到 JS 内部怎么取值**。
 * 产物里的 `<pre>` 无论用 textContent 还是 innerHTML 取，长得一模一样；
 * 只有读源码才知道复制出去的是"文本"还是"HTML 源码"。
 *
 * 为什么**不**写成"整个 JS 文件不得含 innerHTML"：那是个过宽的断言。
 * 今天文件里 innerHTML 零命中只是**巧合**；将来别处合法用一次（哪怕跟复制
 * 毫无关系）就会误报。→ 本检查只盯**真正喂给复制出口的那个值**。
 * （本仓库现在就有一个真实的例子：`src/assets/js/paper-reader/annotations.js`
 * 里的 `node.innerHTML = v` 是渲染批注 HTML，与复制毫无关系。）
 *
 * 判定（缺一即判红）：
 *   1. 扫描集合里必须有复制出口（clipboard.writeText / textarea 回退）——
 *      找不到 = 门禁看不懂了；
 *   2. 复制出口取到的值，必须**最终来自 `.textContent` 读取**；
 *   3. 取值链上**不得**出现 `.innerHTML` / `.outerHTML`（那是 HTML 源码，不是文本）；
 *   4. **同一个文件内**的两条复制路径（writeText 与 textarea 回退）必须取
 *      **同一个值**，避免将来只改一条、两条出口行为分叉；
 *   5. 门禁认出的出口数必须与源码里**实际的调用点**数一致——少认一个，
 *      就说明有一条复制路径门禁根本没看见，而"没看见"不等于"没问题"。
 *   6. 一个复制功能的**两条路径必须同文件**：某文件里有 clipboard.writeText
 *      出口、却没有同一文件里的 textarea 回退 → 它的回退在别的文件 →
 *      第 4 条（按文件核对"两条路径取同一个值"）就够不着它 → 判红。
 *      （只在"全站存在 textarea 回退"时启用：全站都不用回退方案时，
 *        单独一个 clipboard-only 的复制功能不算缺陷。）
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
 *
 * ⚠️ 第二十轮补的一条**覆盖范围**（本轮）：
 *   本检查原先**只扫 `src/assets/js/main.js` 一个文件**。而 `src/assets/js/`
 *   下实际有 9 个浏览器 JS（main / nav / theme / paper-reader×6）——
 *   将来只要在**别处**加一个 Copy 按钮，这条门禁**看不见**：
 *   它会照常报"2 个出口，取值来自 textContent"并 exit 0，
 *   而那个新按钮完全可以是 `writeText(src.innerHTML)`。
 *   → **没看见 = 没守**：门禁绿着，缺陷照样上线。
 *   现在改成扫 `src/assets/` 下所有 `.js`，并由此补两条判据：
 *   6. **跨文件的两条路径**：writeText 与 textarea 回退若**分处两个文件**，
 *      判据 4 就无法核对它们是否取同一个值 → 判红（门禁看不懂就不放行）。
 *      ⚠️ 第二十一轮**改写**了这条的触发条件，理由见下面的"第二十一轮"段：
 *      原来的写法（只在"全站恰好一个 writeText 且恰好一个 textarea 回退"时触发）
 *      会在出口变多时**整体失效**。
 *   7. **某个文件里没有复制出口，不算问题**（它只是不参与复制）：
 *      判据 1 改成对**整个扫描集合**成立，而不是对每个文件成立。
 *      —— 这条正是"别处合法用一次 innerHTML 不得误报"能成立的前提。
 *
 * ⚠️ 第二十一轮补的一条**触发条件改写**（实测坐实的漏洞，不是假想）：
 *   第二十轮加的第 6 条（跨文件的两条路径 → 判红）当时写的是
 *   "**全站恰好一个** writeText **且恰好一个** textarea 回退、且分处两个文件"。
 *   → **writeText 出口一旦达到 2 个，这条判据就整体不再触发**，
 *   跨文件拆分那条路径**静默通过**（exit 0）。
 *   而"将来在别处加**第二个**复制功能"恰恰是这条门禁最该生效的场景 ——
 *   **保护恰好在最需要它的时候被关掉**。（15:45 独立复验场次实测坐实，
 *   本场次独立复现。）
 *   → 现在**不数出口个数**，改看**结构**：
 *   某个文件里有 writeText 却没有同一文件里的 textarea 回退 → 判红。
 *   出口有几个都不影响这条触发；两个**各自独立**的复制功能若各自带齐
 *   两条路径（同文件内有 writeText 也有回退），互不误伤。
 *   代价（已知边界）：本站若将来引入"只有剪贴板路径、没有回退"的复制功能，
 *   而全站别处仍在用回退方案，该文件会被判红 —— 那是本门禁要的口径，
 *   要改口径先改这里，别绕过门禁。
 *
 * ⚠️ 第二十二轮补的一条**扫描面**（本轮；接上一轮"留给下一轮"第 2 条）：
 *   本检查扫的是 `src/assets/` 下的**磁盘 .js 文件**。但站点里还有
 *   **模板内联的 `<script>` 块**——它们不是 .js 文件，一个都扫不到：
 *     · src/_includes/layouts/base.njk:463   （<script>，主题早期注入）
 *     · src/_includes/layouts/paper.njk:310  （<script type="module">）
 *   → 门禁会照常报"扫 9 个 JS 文件：2 个出口……"并 exit 0，**看上去守着全站**；
 *     而将来若有人在这两个模板里写一个 `writeText(src.innerHTML)`，
 *     门禁**看不见**，缺陷照样上线。**没看见 = 没守**——和前面所有轮次
 *     踩的坑是同一个病，只是这次的盲区在"文件形态"上而不是"写法"上。
 *   → 现在把**模板内联脚本块**也纳入扫描：逐个 .njk 抽出内联 <script>，
 *     去掉 Nunjucks 注释，**用同一套判据**分析。
 *   ⚠️ 两个刻意的排除，各有理由：
 *     ① `type="application/ld+json"` 的块**不扫**——那是**数据**不是代码，
 *        里面不可能有复制出口；把它当 JS 解析只会制造噪音。
 *     ② 带 `src=` 的块**不扫**——那是外部 .js 文件，本来就被磁盘扫描覆盖，
 *        重复算一次会让"出口数"对不上计数自检。
 *   ⚠️ 命令行注入模式（`node scripts/check-copy-export.cjs <文件>`）的语义
 *      保持不变：**只查你给的那个文件**。给了 .njk 时，查的是它内部的
 *      内联脚本块（这样"模板里的坏出口"也能被注入用例覆盖到）。
 */
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");

// ---------------------------------------------------------------------------
// 扫描集合
// ---------------------------------------------------------------------------

/**
 * 列出目录下的所有 .js。
 * 跳过 `._*`（exFAT / AppleDouble 资源叉，本仓库的卷上是 exFAT，
 * 会凭空多出这些二进制文件——它们不是源码，扫了只会添乱）。
 */
function listBrowserJs(root) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // 目录不存在 → 当作没有文件（由"扫描集合为空"那条判红兜住）
    }
    for (const e of entries) {
      if (e.name.startsWith("._")) continue;
      if (e.name === "node_modules") continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith(".js")) out.push(p);
    }
  };
  walk(root);
  return out.sort();
}

// 给了路径就只查它（**只给故障注入用**）；不给就查全站浏览器 JS。
const cliFiles = process.argv.slice(2).filter((a) => !a.startsWith("-"));

/**
 * 抽出**模板内联的 <script> 块**。
 *
 * 为什么必须单独抽：门禁扫的是**磁盘 .js 文件**，而模板里的内联脚本
 * 一个都不在那儿（见文件头"第二十二轮"段）。→ 扫描面必须显式补上，
 * 否则"门禁绿着"只是因为它没看那里。
 *
 * 排除项（各有理由，见文件头）：
 *   · `type="application/ld+json"` → 数据不是代码；
 *   · 带 `src=` → 外部 .js 文件，已被磁盘扫描覆盖，重复算会让出口数对不上。
 */
function listTemplateScripts(root) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith("._")) continue;
      if (e.name === "node_modules") continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith(".njk")) {
        const raw = fs.readFileSync(p, "utf-8");
        const rel = path.relative(REPO, p);
        for (const m of raw.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
          const attrs = m[1];
          const body = m[2];
          if (/type\s*=\s*["']application\/ld\+json["']/i.test(attrs)) continue; // 数据
          if (/\bsrc\s*=/i.test(attrs)) continue; // 外部 .js，磁盘扫描已覆盖
          // 去掉 Nunjucks 注释 {# ... #}：它不是 JS，留着会干扰注释剥离
          const code = body.replace(/{#[\s\S]*?#}/g, " ");
          if (!code.trim()) continue;
          const line = raw.slice(0, m.index).split("\n").length;
          out.push({
            rel: `${rel}:${line}`,
            absPath: p,
            code,
          });
        }
      }
    }
  };
  walk(root);
  return out.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
}

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

/** 取表达式的"根标识符"：`text` → "text"；`text.trim()` → "text"；
    `src.innerHTML` → "src"。取不到根（不以标识符开头）→ null（判红，不猜）。 */
function rootOf(expr) {
  const m = String(expr).trim().match(/^([A-Za-z_$][\w$]*)/);
  return m ? m[1] : null;
}

const HTML_READERS = /\.\s*(innerHTML|outerHTML)\b/;
const TEXT_READER = /\.\s*textContent\b/;

/** 找某个变量的所有声明表达式 */
function declarationsOf(code, name) {
  const out = [];
  const re = new RegExp("\\b(?:const|let|var)\\s+" + name + "\\s*=\\s*([^;\\n]+)", "g");
  for (const m of code.matchAll(re)) out.push(m[1].trim());
  return out;
}

/**
 * 顺着取值链回溯：每个标识符都要能解释清楚，
 * 终点必须是 `.textContent` 读取；链上出现 innerHTML/outerHTML 立即判红。
 * 解释不了（声明找不到 / 表达式看不懂）→ 判红，不静默放行。
 */
function trace(code, name, seen = new Set()) {
  if (seen.has(name)) return { ok: false, why: "取值链出现环，无法判定" };
  seen.add(name);
  const decls = declarationsOf(code, name);
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
      const r = trace(code, id[1], seen);
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
function judge(code, expr) {
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
  return trace(code, root);
}

/**
 * 分析**一个文件**：找出复制出口、核对取值链、核对计数。
 * 返回该文件自己的问题（没有复制出口不算问题——判据 1 对整个集合成立）。
 */
/**
 * 分析**一个扫描单元**（一段源码）：找出复制出口、核对取值链、核对计数。
 *
 * ⚠️ 磁盘 .js 文件与**模板内联脚本块**走的是**同一套判据**：
 *    判据只有一套，才谈得上"门禁守着的是复制出口这个行为本身"，
 *    而不是"某一种文件形态里的复制出口"。（两者一旦用两套判据，
 *    就会出现"内联脚本里的坏出口按 .js 的判据就不算坏"这种漏看。）
 */
function analyzeSource(rel, raw, absPath) {
  const code = stripComments(raw);
  const mask = stringMask(code); // 计数用：标出字符串字面量内容所在的位置
  const fileProblems = [];

  // ---- 1) 找出所有复制出口 ----------------------------------------------
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

  // ---- 1b) 出口计数自检：源码里的调用点必须与门禁认出的出口一一对应 -----
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
    fileProblems.push(
      `${rel}: 源码里有 ${writeTextCallSites} 处 writeText 调用，但门禁只认出 ` +
        `${writeTextExprs.length} 个**剪贴板**出口——有复制路径没被门禁看见。` +
        "（多半是实参写法超出了正则能匹配的范围。）" +
        "少认 = 没守：这条路径里完全可能藏着 innerHTML。"
    );
  }
  if (textareaCreateSites !== textareaVars.length) {
    fileProblems.push(
      `${rel}: 源码里有 ${textareaCreateSites} 处 textarea 创建，但门禁只认出 ` +
        `${textareaVars.length} 个 textarea 变量——回退路径没被门禁看见。`
    );
  }

  // ---- 2) 两条路径必须取同一个值（**按文件**）----------------------------
  // 比较的是"实参的根标识符"：`text` 与 `text.trim()` 算同一个值（同一个源），
  // `text` 与 `src.innerHTML` 算不同（一个来自文本、一个来自 HTML 源码）。
  // ⚠️ 为什么按文件而不是按全站：一个文件里的 writeText + textarea 回退
  //    是**同一个复制功能的两条路径**（剪贴板不可用时的兜底），
  //    它们必须取同一个值。而两个**各自独立**的复制功能分处两个文件时，
  //    本来就该取不同的值 —— 按全站比会误伤。跨文件的那一种情况
  //    （同一个功能的两条路径被拆到两个文件）由第 6 条单独兜住。
  const roots = exits.map((e) => rootOf(e.expr));
  const distinct = [...new Set(roots.filter(Boolean))];
  if (exits.length > 1 && distinct.length > 1) {
    fileProblems.push(
      `${rel}: 复制出口取的不是同一个值（${exits
        .map((e) => `${e.kind} → ${e.expr}`)
        .join("，")}）——` +
        "将来只改一条路径，两条出口的行为就会分叉（剪贴板一份、回退一份）。"
    );
  }

  // ---- 3) 取值链必须最终来自 .textContent，且链上不得有 innerHTML -------
  for (const e of exits) {
    const r = judge(code, e.expr);
    if (!r.ok) fileProblems.push(`${rel}: ${e.kind} → ${r.why}`);
  }

  return { rel, absPath, exits, fileProblems };
}

/** 分析一个**磁盘文件**（.js 扫描集合，或注入模式指定的文件） */
function analyzeFile(absPath) {
  if (!fs.existsSync(absPath)) {
    return {
      rel: path.relative(REPO, absPath),
      absPath,
      exits: [],
      fileProblems: [
        `${path.relative(REPO, absPath)}: 找不到要检查的文件：${absPath}——` +
          "门禁读不到源码就无法判定（判红，不静默放行）",
      ],
    };
  }
  const rel = path.relative(REPO, absPath);
  return analyzeSource(rel, fs.readFileSync(absPath, "utf-8"), absPath);
}

// ---------------------------------------------------------------------------
// 汇总判定
// ---------------------------------------------------------------------------

// ---- 扫描单元：磁盘 .js 文件 + **模板内联脚本块** ------------------------
// ⚠️ 两类单元走**同一套判据**（analyzeSource）。只有一套判据，
//    才谈得上"门禁守着的是复制出口这个行为本身"。
//    少扫一类 = 那一类里的坏出口**静默通过**（见文件头"第二十二轮"段）。
//
// ⚠️ 注入模式（命令行给了文件）时**只查你给的那个文件**，不掺模板扫描：
//    注入用例的语义是"让这一个文件红/绿"，掺进别的单元会让计数对不上。
const jsFiles = cliFiles.length
  ? cliFiles.map((f) => path.resolve(f))
  : listBrowserJs(path.join(REPO, "src", "assets"));

const units = [];
for (const f of jsFiles) {
  if (cliFiles.length && f.endsWith(".njk")) {
    // 注入模式给了模板 → 查它**内部**的内联脚本块
    const inner = listTemplateScripts(path.dirname(f)).filter((t) => t.absPath === f);
    if (inner.length === 0) {
      problems.push(
        `${path.relative(REPO, f)}: 这个模板里没有内联 <script> 块` +
          "（type=application/ld+json 的数据块与带 src= 的外部脚本都不算）——" +
          "注入用例可能选错了目标，门禁没什么可判的。"
      );
    }
    for (const t of inner) units.push({ rel: t.rel, absPath: f, code: t.code, kind: "template" });
  } else {
    units.push({ rel: path.relative(REPO, f), absPath: f, code: null, kind: "js" });
  }
}
if (!cliFiles.length) {
  for (const t of listTemplateScripts(path.join(REPO, "src"))) {
    units.push({ rel: t.rel, absPath: t.absPath, code: t.code, kind: "template" });
  }
}

const jsUnitCount = units.filter((u) => u.kind === "js").length;
const tplUnitCount = units.filter((u) => u.kind === "template").length;

// 扫描面自查：磁盘 .js 扫不到 = 一个洞，模板扫描补不了（两套形态各管一段）
if (!cliFiles.length && jsUnitCount === 0) {
  console.error(
    "  ✗ 磁盘 JS 扫描集合是空的（src/assets/ 下没找到 .js）——" +
      "扫描面本身没了，门禁看不懂就判红。"
  );
  process.exit(1);
}
if (units.length === 0) {
  console.error(
    "  ✗ 扫描集合里一个单元都没有（磁盘 .js + 模板内联脚本块）——" +
      "扫描面本身没了，门禁看不懂就判红。"
  );
  process.exit(1);
}

const analyses = units.map((u) =>
  u.kind === "template"
    ? analyzeSource(u.rel, u.code, u.absPath)
    : analyzeFile(u.absPath)
);
for (const a of analyses) problems.push(...a.fileProblems);

const allExits = analyses.flatMap((a) => a.exits.map((e) => ({ ...e, rel: a.rel })));

// ---- 判据 1：扫描集合里必须有复制出口 ------------------------------------
// 判据 1 对**集合**成立，而不是对每个文件成立：某个文件里没有复制出口
// 只是"它不参与复制"，不是问题。真要判红的是"整个站点都没有复制出口"——
// 那说明复制功能被删了，或门禁看不懂现在的写法。
if (allExits.length === 0) {
  problems.push(
    units.length === 1
      ? `${analyses[0].rel}: 找不到任何复制出口（clipboard.writeText / textarea 回退）——` +
          "要么复制功能被删了，要么这段源码改成了门禁看不懂的写法。" +
          "门禁看不懂时必须判红：否则它会一直'全绿'，看着像在守着，其实没守。"
      : `在 ${units.length} 个扫描单元（${jsUnitCount} 个 JS 文件 + ${tplUnitCount} 个模板内联脚本块）` +
          "里找不到任何复制出口（clipboard.writeText / textarea 回退）——" +
          "要么复制功能被删了，要么它被挪到了扫描范围之外。" +
          "门禁看不懂时必须判红：否则它会一直'全绿'，看着像在守着，其实没守。"
  );
}

// ---- 判据 6：复制出口必须"自足"（同一个功能的两条路径必须同文件）-------
// 一个文件里的 clipboard.writeText 与 textarea 回退，是**同一个复制功能的两条路径**
// （剪贴板不可用时的兜底）。判据 2 按文件核对"两条路径取同一个值"——
// 一旦这两条路径分处两个文件，判据 2 就够不着那条 writeText：
// 将来只改它一条、两条出口的行为就会分叉（剪贴板一份、回退一份），而门禁看不见。
//
// ⚠️ 这里曾踩过一个坑（第二十一轮实测坐实）：早先的写法是"全站恰好一个
//    writeText **且**恰好一个 textarea 回退、且分处两个文件"才判红。
//    → **writeText 出口一旦达到 2 个，这条判据就整体不再触发**，
//    跨文件拆分那条路径**静默通过**（exit 0）。而"将来加第二个复制功能"
//    恰恰是这条门禁最该生效的场景 —— 保护恰好在最需要它的时候被关掉。
//    → 现在**不数出口个数**，改看**结构**：某文件有 writeText 却没有
//    同文件的 textarea 回退 → 判红。出口有几个都不影响触发。
//
// 只在"全站存在 textarea 回退"时启用：全站都不采用回退方案时，
// 单独一个 clipboard-only 的复制功能不算缺陷（不该误伤）。
const byFile = new Map();
for (const a of analyses) {
  byFile.set(a.rel, {
    rel: a.rel,
    hasWriteText: a.exits.some((e) => e.kind === "clipboard.writeText"),
    hasFallback: a.exits.some((e) => e.kind === "textarea 回退"),
  });
}
const fallbackFiles = [...byFile.values()]
  .filter((f) => f.hasFallback)
  .map((f) => f.rel);

if (fallbackFiles.length > 0) {
  for (const f of byFile.values()) {
    if (f.hasWriteText && !f.hasFallback) {
      problems.push(
        `${f.rel}: 这个单元有 clipboard.writeText 出口，但 textarea 回退在别的单元` +
          `（回退 → ${fallbackFiles.join("、")}）—— 两条复制路径分处两个单元。` +
          "本检查按单元核对「两条路径取同一个值」，跨单元就够不着这条 writeText：" +
          "将来只改它一条、两条出口的行为就会分叉（剪贴板一份、回退一份），而门禁看不见。" +
          "请把回退路径与 writeText 放回同一个单元（同文件，或同一个模板内联脚本块）。"
      );
    }
  }
}

// ---- 输出 -----------------------------------------------------------------
if (problems.length) {
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(
    `\nCopy 出口检查失败：${problems.length} 个问题` +
      `（扫描 ${jsUnitCount} 个 JS 文件 + ${tplUnitCount} 个模板内联脚本块）`
  );
  process.exit(1);
}

if (units.length === 1) {
  console.log(
    `Copy 出口检查通过（${analyses[0].rel}：${allExits.length} 个出口，取值来自 textContent）`
  );
} else {
  const hosts = [...new Set(allExits.map((e) => e.rel))];
  console.log(
    `Copy 出口检查通过（扫 ${jsUnitCount} 个 JS 文件 + ${tplUnitCount} 个模板内联脚本块：` +
      `${allExits.length} 个出口在 ${hosts.join("、")}，取值来自 textContent）`
  );
}
