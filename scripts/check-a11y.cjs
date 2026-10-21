#!/usr/bin/env node
/**
 * 可访问性门禁 —— 把 axe-core 实测出来的 WCAG AA 缺陷固化成可重复的检查。
 *
 * 为什么要有这个（第十二轮）：站内自检（scripts/verify-site.cjs）管的是
 * 结构与一致性（链接、JSON-LD、canonical、sitemap…），**没有一条查可访问性**。
 * 用 axe-core 4.10.2 实测全站 6 个页面（暗色 + 浅色两套主题）后，
 * 查出了三类真实缺陷，且**都不影响 build 能否通过**：
 *   ① 暗色主题下 11px 的强调色小标签对比度只有 3.49:1（AA 要 4.5:1）；
 *   ② 正文里的链接只靠颜色区分，与正文的对比度只有 1.17–2.61:1
 *      （WCAG 1.4.1 要 ≥3:1，或另给一条非颜色线索）；
 *   ③ 横向可滚动的 BibTeX 代码块键盘不可聚焦（WCAG 2.1.1）。
 * 这些都是"肉眼看截图看不出来、但真的挡人"的问题，所以必须做成门禁，
 * 否则下次改样式就会被悄悄改回去。
 *
 * 编号体系：**独立编号 A1–A4**，与 scripts/verify-site.cjs 的数字编号
 * **不续接**。理由：那边的门禁会自查"文件头清单与代码段一一对应且连续"，
 * 两边撞号会让追溯日志时指错对象（⚠️ 也不要在这里写死对方的编号区间 ——
 * 那个区间会随对方加门禁而过期，写死就是一句会变假的话）。
 * 同门的 check-lang.cjs / check-dead-css.cjs 也都不用数字编号，沿用同一惯例：
 *   A1. 文本对比度（WCAG 1.4.3）：三套主题下正文 / 弱化 / 强调 / 链接色
 *       对两种底色都要 ≥ 4.5:1；徽标用的 accent 组合也不能被改坏；
 *       且两处暗色 token 定义必须逐项一致（零漂移）。
 *   A2. 正文链接的非颜色区分（WCAG 1.4.1）：正文容器里的链接必须有下划线。
 *   A3. 可滚动区域必须可聚焦（WCAG 2.1.1）：横向可滚动的 BibTeX 块要有 tabindex="0"。
 *   A4. 强调色不得绕过语义 token 直接当文字色：源码里
 *       `color: var(--color-accent-600)` 只允许出现在徽标上（accent-600 配
 *       accent-50 底，5.07:1 合格），其余位置必须走 --text-accent。
 *   A5. 无障碍引用必须指向**真实存在**的 id：aria-labelledby /
 *       aria-describedby / aria-controls / aria-owns / aria-activedescendant
 *       / <label for> / <th headers> 引用的每一个 id 都必须在同一页存在。
 *   A6. id 必须唯一，且页内锚点必须可达：同一页不得有两个元素用同一个 id；
 *       <a href="#xxx"> 指向的 id 必须在本页存在。
 *   A7. 标题层级：每页**恰好一个** <h1>，且不得跳级（h2 之后不能直接 h4）。
 *   A8. 底色 token 必须跨主题压暗：凡是**被当作底色用**的色阶 token，
 *       若它在浅色主题下落在「亮底档」（L ≥ 0.7），就必须在暗色主题里被重映射，
 *       且重映射后不得比该主题的 --bg-page 亮出 0.05 以上
 *       （暗色页面上留一块亮底，就是「暗色正文压在亮底上读不出来」的缺陷形态）。
 *
 * ⚠️ **不重复已有的门禁**：<img> 的 alt 存在性由 scripts/verify-site.cjs 的
 *    门禁 25 管、width/height 由门禁 26 管（第十五轮 commit 93f9497 加的），
 *    本脚本不重复造一遍 —— 同一个事实两处判，改一处就会与另一处说法打架。
 *    同理，门禁 1 只查 href/src 指向的**文件**能不能找到，它**显式跳过**
 *    纯锚点链接（`href="#xxx"`），所以"锚点能不能解析"一直无人看守；
 *    A5/A6 补的正是这个洞，不是把门禁 1 重做一遍。
 *
 * 判据的边界（避免"门禁通过 = 站点无障碍达标"这种误读）：
 * 本脚本只覆盖上列七条**可机器判定**的判据，不等于完整的 WCAG 审计。
 * 完整审计仍要靠 axe-core（scripts/ 下另有人工跑的记录）。
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
/* 这三个路径可用环境变量改 —— 自测脚本（scripts/test-a11y-contrast.cjs）要能在
   **副本**上注入缺陷形态，让 A8 的判据被证明"能变红"。
   仓库里的原件全程不动，自测最后按 SHA-256 校验它没被动过。 */
const SITE = process.env.SITE_DIR || path.join(ROOT, "_site");
const TOKENS_CSS =
  process.env.A11Y_TOKENS_CSS || path.join(ROOT, "src", "assets", "css", "tokens.css");
const SRC_DIR = process.env.A11Y_SRC_DIR || path.join(ROOT, "src");

const problems = [];
const notes = [];
const fail = (msg) => problems.push(msg);
const note = (msg) => notes.push(msg);

/* ---------------- 工具：WCAG 对比度 ---------------- */

function hexToRgb(hex) {
  let h = String(hex).trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function relativeLuminance(rgb) {
  const ch = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(rgb[0]) + 0.7152 * ch(rgb[1]) + 0.0722 * ch(rgb[2]);
}

function contrast(rgbA, rgbB) {
  const la = relativeLuminance(rgbA);
  const lb = relativeLuminance(rgbB);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/* ---------------- 工具：CSS 解析 ---------------- */

/** 去掉注释（注释里可能有 { }，会打乱后面的配对） */
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * 按括号配对取出某个选择器后面的整块内容。
 * ⚠️ 不能用"下一个 }"或"下一个块注释开头"当结束标记 —— tokens.css 里
 *    :root { 后面紧跟一行块注释（内容是 "Brand · 流场蓝"），
 *    用注释当结束标记会只切出 10 个字符，解析出 0 个 token，
 *    门禁会拿着空表去比对，然后"全绿"（实测踩过）。
 */
function extractBlock(css, marker) {
  const re = new RegExp("^[ \\t]*" + marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[ \\t]*\\{", "m");
  const m = re.exec(css);
  if (!m) return null;
  const open = css.indexOf("{", m.index);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  return null;
}

/** 取出块里的 --token: value 声明 */
function parseTokens(block) {
  const out = {};
  if (!block) return out;
  const re = /--([a-z0-9-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(block))) out[m[1]] = m[2].trim();
  return out;
}

/** 顺着 var(--x) 链解出最终颜色；解不出来返回 null */
function resolveColor(name, tokens, depth = 0) {
  if (depth > 12) return null;
  const raw = tokens[name];
  if (raw === undefined) return null;
  const v = raw.trim();
  const varRef = /^var\(\s*--([a-z0-9-]+)\s*\)$/.exec(v);
  if (varRef) return resolveColor(varRef[1], tokens, depth + 1);
  if (v.startsWith("#")) return hexToRgb(v);
  return null;
}

/** 丢掉指定媒体查询的整块（forced-colors / print 不代表常规视觉） */
function stripMedia(css, shouldStrip) {
  let out = "";
  let i = 0;
  while (i < css.length) {
    const at = css.indexOf("@media", i);
    if (at === -1) {
      out += css.slice(i);
      break;
    }
    out += css.slice(i, at);
    const brace = css.indexOf("{", at);
    if (brace === -1) {
      out += css.slice(at);
      break;
    }
    const cond = css.slice(at + 6, brace).trim();
    let depth = 0;
    let j = brace;
    for (; j < css.length; j++) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") {
        depth--;
        if (depth === 0) {
          j++;
          break;
        }
      }
    }
    if (shouldStrip(cond)) {
      /* 整块丢弃 */
    } else {
      out += css.slice(at, j);
    }
    i = j;
  }
  return out;
}

/** 取顶层规则（@media 整块算一条，不会把里面的规则单独拎出来） */
function topLevelRules(css) {
  const rules = [];
  let selStart = 0;
  let depth = 0;
  let braceStart = -1;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === "{") {
      if (depth === 0) braceStart = i;
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) {
        rules.push({
          selector: css.slice(selStart, braceStart).trim(),
          body: css.slice(braceStart + 1, i),
        });
        selStart = i + 1;
      }
    } else if (c === ";" && depth === 0) {
      selStart = i + 1;
    }
  }
  return rules;
}

/**
 * 扫 HTML 找元素前，先把"不是内容"的部分剔掉。
 * ⚠️ 实测踩过：about 页内联样式的 CSS 注释里有一句说明文字
 *    "…<img> 上的 width/height 属性负责首屏前的比例预留…"，
 *    光秃秃一个 <img> 被当成了真元素，当时的门禁报"缺 alt"——假阳性。
 *    同理，HTML 注释与内联脚本里也可能出现 <img> / <pre> 的字面量。
 */
function stripNonContent(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

/* ---------------- 工具：HTML 标签扫描 ----------------
   A5/A6/A7 要按**标签**逐个看（谁带了 aria-labelledby、谁带了 id、
   标题标签出现了哪些），所以需要一份"标签名 + 属性"的清单。
   不引第三方解析器（本站不引外部依赖），但**不能**用 /<[^>]+>/ 这种朴素写法：
   属性值里可能有 ">"，朴素正则会把一个标签截断，后面所有基于标签的判据
   都会跟着错。下面的正则按**带引号的属性值**整体跳过 ">"。

   ⚠️ 同一个标签上写了两个 id 属性（HTML 本身不允许）也要算两次：
   属性表用"后者覆盖前者"存的话，重复 id 就被吃掉了。所以 id 另存一份
   数组（idList），按出现次数统计，不按属性表统计。 */
function scanTags(html) {
  const out = [];
  const re = /<([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[1].toLowerCase();
    const attrs = {};
    const idList = [];
    const are = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>`]+))/g;
    let a;
    while ((a = are.exec(m[2]))) {
      const name = a[1].toLowerCase();
      const val = a[2] !== undefined ? a[2] : a[3] !== undefined ? a[3] : a[4];
      attrs[name] = val;
      if (name === "id") idList.push(val);
    }
    out.push({ tag, attrs, idList, raw: m[0] });
  }
  return out;
}

/* ---------------- 收集产物 ---------------- */

if (!fs.existsSync(SITE)) {
  console.error(`✗ 找不到产物目录 ${SITE}，请先运行 npm run build`);
  process.exit(1);
}

const allFiles = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else allFiles.push(p);
  }
})(SITE);

const htmlFiles = allFiles.filter(
  (f) => f.endsWith(".html") && !path.basename(f).startsWith("._")
);

/* =====================================================================
 * 门禁 A1 · 文本对比度（WCAG 1.4.3）
 * ===================================================================== */
{
  const css = fs.readFileSync(TOKENS_CSS, "utf8");
  const themes = [
    { name: "浅色 :root", tokens: parseTokens(extractBlock(css, ":root")) },
    {
      name: "暗色 prefers-color-scheme",
      tokens: parseTokens(extractBlock(css, "@media (prefers-color-scheme: dark)")),
    },
    {
      name: "暗色 [data-theme=dark]",
      tokens: parseTokens(extractBlock(css, '[data-theme="dark"]')),
    },
  ];

  for (const t of themes) {
    if (!t.tokens || Object.keys(t.tokens).length === 0) {
      fail(`门禁 A1：没能从 tokens.css 解析出「${t.name}」的 token（解析器坏了，不是样式坏了）`);
    }
  }

  // 文字色 × 底色：正文级文字一律按 4.5:1 判（这些 token 都用在 11–16px 的小字上）
  const fgList = ["text-primary", "text-secondary", "text-muted", "text-accent", "link-color"];
  const bgList = ["bg-page", "bg-surface"];
  const MIN = 4.5;

  for (const t of themes) {
    if (!t.tokens || !Object.keys(t.tokens).length) continue;
    for (const fg of fgList) {
      for (const bg of bgList) {
        const f = resolveColor(fg, t.tokens);
        const b = resolveColor(bg, t.tokens);
        if (!f || !b) {
          fail(
            `门禁 A1：「${t.name}」的 ${fg} / ${bg} 解析不出最终颜色` +
              `（多半是 ${!f ? fg : bg} 指向的 token 在这一套主题里没有定义）`
          );
          continue;
        }
        const r = contrast(f, b);
        if (r < MIN) {
          fail(
            `门禁 A1：「${t.name}」${fg} 对 ${bg} 的对比度只有 ${r.toFixed(2)}:1，AA 要求 ≥${MIN}:1`
          );
        }
      }
    }
  }

  // 徽标 .badge--accent 浅色下是「accent-600 文字 + accent-50 底」。
  // 这一条是给"有人去改 --color-accent-600 本体"设的护栏：
  // 改它能一次修好所有 accent-600 文字，但会把徽标弄坏（实测 5.07:1 → 掉到 2.x:1）。
  {
    const light = themes[0].tokens;
    const f = resolveColor("color-accent-600", light);
    const b = resolveColor("color-accent-50", light);
    if (f && b) {
      const r = contrast(f, b);
      if (r < MIN) {
        fail(
          `门禁 A1：徽标 .badge--accent 的 accent-600/accent-50 组合只有 ${r.toFixed(2)}:1（AA 要求 ≥${MIN}:1）—— ` +
            `不要去改 --color-accent-600 本体，要改请用 --text-accent`
        );
      }
    } else {
      fail("门禁 A1：解析不出徽标用的 color-accent-600 / color-accent-50");
    }
  }

  // 两处暗色定义必须逐项一致。theme.js 启动即显式写 data-theme，
  // 所以 [data-theme="dark"] 才是实际生效路径；两份定义不一致时，
  // 「跟随系统」和「手动切深色」会看到两套不同的颜色。
  {
    const [mq, dt] = [themes[1].tokens, themes[2].tokens];
    if (mq && dt && Object.keys(mq).length && Object.keys(dt).length) {
      const keys = new Set([...Object.keys(mq), ...Object.keys(dt)]);
      const drift = [...keys].filter((k) => mq[k] !== dt[k]).sort();
      if (drift.length) {
        fail(
          `门禁 A1：两处暗色 token 定义有 ${drift.length} 项漂移（${drift
            .map((k) => `${k}: media=${mq[k]} / attr=${dt[k]}`)
            .join("；")}）`
        );
      } else {
        note(
          `门禁 A1：两处暗色 token 定义逐项一致（各 ${Object.keys(mq).length} 项，零漂移）`
        );
      }
    }
  }
}

/* =====================================================================
 * 门禁 A2 · 正文链接的非颜色区分（WCAG 1.4.1）
 * ===================================================================== */
{
  // 判据容器：正文里成段出现链接的地方。
  // ⚠️ 原来 base.css 里写的是 `.article a`，但全站**没有任何模板**用 class="article"
  //    （博客正文用 .detail）—— 那条规则从来没生效过，"正文链接带下划线"
  //    是设计意图落空，不是被人删的。这里列的是真实存在的容器。
  //
  // 判据按**容器逐页**做，不是把所有页面的样式合并后看"有没有一条"。
  // 合并判据有个漏检：base.css 是内联进每一页的，若某一页的样式块
  // 丢了这条规则，合并后别的页还留着 → 门禁照样绿，而那一页已经坏了。
  // 所以：先看哪个页面**真的出现了**这个容器，再在**那些页面**里要求规则存在。
  const containers = [
    ".prose a",
    ".detail a",
    ".paper-head__authors a",
    ".list-empty__body a",
    ".about-output__meta a",
  ];

  // 该页用到的样式：内联 <style> 块 + 外链 <link> 的 css 文件。
  // 用产物而不是源码，是因为只有产物才代表"浏览器实际拿到的那一份"。
  const pageStyles = new Map(); // 相对路径 -> 合并后的 CSS 文本
  const pageHtml = new Map(); // 相对路径 -> HTML 文本
  for (const f of htmlFiles) {
    const rel = path.relative(SITE, f);
    const html = fs.readFileSync(f, "utf8");
    pageHtml.set(rel, html);
    const chunks = [];
    const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
    let m;
    while ((m = styleRe.exec(html))) chunks.push(m[1]);
    const linkRe = /<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
    while ((m = linkRe.exec(html))) {
      const href = m[1].split(/[?#]/)[0].replace(/^\.?\//, "");
      if (!href) continue;
      const p = path.join(SITE, href);
      if (fs.existsSync(p) && fs.statSync(p).isFile()) chunks.push(fs.readFileSync(p, "utf8"));
    }
    let css = stripComments(chunks.join("\n"));
    // 高对比度模式与打印样式里的下划线**不算数**：
    // 前者只在 Windows 强制配色下生效，后者根本不进屏幕。
    css = stripMedia(css, (cond) => /forced-colors/i.test(cond));
    css = stripMedia(css, (cond) => /(^|\W)print(\W|$)/i.test(cond));
    pageStyles.set(rel, css);
  }

  // 该页的样式里，哪些选择器带下划线
  const underlinedIn = (css) => {
    const set = new Set();
    for (const r of topLevelRules(css)) {
      if (r.selector.startsWith("@")) continue;
      if (!/text-decoration\s*:[^;]*underline/i.test(r.body)) continue;
      for (const sel of r.selector.split(",")) {
        const s = sel.trim();
        if (s) set.add(s);
      }
    }
    return set;
  };

  /* ---- 源级兜底：容器在产物里没有实例时，第二道判据 ----
   *
   * 为什么需要它（这是本轮实测出来的真覆盖漏洞）：
   *   .detail 是**博客/portfolio 详情页的正文容器**，而那两个集合目前是空的
   *   → 详情页模板（detail.njk）从未被构建渲染 → 产物里永远没有 .detail。
   *   → 上面那段"逐页"判据对 ".detail a" 只能"暂不判"（skipped）。
   *   → 于是"正文链接带下划线"这条判据在**最该守的那一类内容上无人看守**：
   *      谁把 base.css 那条规则里的 ".detail a," 删掉（"博客还没有内容，
   *      这是个死选择器" —— 一个非常合理的编辑动机），门禁照样全绿；
   *      等第一篇文章发出来，正文链接就只剩颜色区分（WCAG 1.4.1 违规），
   *      而**没有任何门禁会报**。
   *   实测：当前 base.css 里 .detail a 是在的（所以现在没问题），
   *   但删掉它 A2 今天不会红 —— 这就是漏洞本身。
   *
   * 做法：容器在产物里没有实例时，改为**源级**判据 —— 在 src/assets/css/**
   *   （以及 .njk 的 <style> 块）里找一条**恰好**以该选择器为目标、带
   *   text-decoration: underline 的规则。
   *   判据语义与产物级判据**同源**（两者都走 underlinedIn），
   *   所以两条路径不会出现"一个说行、一个说不行"。
   */
  const sourceUnderlined = (() => {
    const set = new Set();
    const files = [];
    (function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else files.push(p);
      }
    })(SRC_DIR);
    for (const f of files) {
      const ext = path.extname(f);
      let text = "";
      if (ext === ".css") {
        text = fs.readFileSync(f, "utf8");
      } else if (ext === ".njk") {
        const blocks = [];
        const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
        let m;
        while ((m = re.exec(fs.readFileSync(f, "utf8")))) blocks.push(m[1]);
        text = blocks.join("\n");
        if (!text.trim()) continue;
      } else {
        continue;
      }
      for (const s of underlinedIn(stripComments(text))) set.add(s);
    }
    return set;
  })();

  let missing = 0;
  let skipped = 0;
  for (const c of containers) {
    const cls = c.split(/\s+/)[0]; // ".prose a" → ".prose"
    const clsRe = new RegExp(`class=["'][^"']*\\b${cls.replace(/^\./, "")}\\b[^"']*["']`);
    const pages = [...pageHtml.entries()].filter(([, html]) => clsRe.test(html)).map(([rel]) => rel);
    if (!pages.length) {
      // 容器当前不在任何产物里（例如空态列表页没有实例）：
      // 产物级判据用不上，但**不能就此放过** —— 见上面"源级兜底"的说明。
      skipped++;
      if (sourceUnderlined.has(c)) {
        note(
          `门禁 A2：${c} 当前没有出现在任何产物页里（产物级判据空跑），` +
            `但源码 CSS 里它的下划线规则在 —— 已按源级判据兜住`
        );
      } else {
        missing++;
        fail(
          `门禁 A2：正文容器 ${c} 当前没有出现在任何产物页里（产物级判据用不上），` +
            `而源码 CSS 里也找不到它的 text-decoration: underline 规则 —— ` +
            `一旦它上线（详情页/列表页出现实例），正文链接就只剩颜色区分` +
            `（WCAG 1.4.1 违规），而且不会有门禁报`
        );
      }
      continue;
    }
    for (const rel of pages) {
      if (!underlinedIn(pageStyles.get(rel)).has(c)) {
        missing++;
        fail(
          `门禁 A2：${rel} 里的正文容器 ${c} 没有下划线` +
            `（WCAG 1.4.1 要求"不能只靠颜色区分"）—— 要么给它加一条 text-decoration: underline，` +
            `要么把链接色提到对正文 ≥3:1`
        );
      }
    }
  }
  if (!missing) {
    const byPage = containers.length - skipped;
    note(
      `门禁 A2：${containers.length} 个正文容器全部有非颜色区分（下划线）—— ` +
        `${byPage} 个按产物逐页判、${skipped} 个产物里暂无实例、按源码 CSS 判`
    );
  }
}

/* =====================================================================
 * 门禁 A3 · 可滚动区域必须可聚焦（WCAG 2.1.1）
 * ===================================================================== */
{
  let checked = 0;
  let missing = 0;
  /* 可横向滚动的引用块 = BibTeX 块 + RIS 块。两者是并列的两种引用格式，
     都是 overflow-x: auto 的横向滚动容器，键盘可聚焦的要求完全一样。
     ⚠️ 只认 paper-cite__bibtex 的话，后加的 RIS 块就成了 a11y 的盲区 ——
     块照样渲染、页面照样过，只有键盘用户滚不动。 */
  const SCROLLABLE_CITE_CLASSES = ["paper-cite__bibtex", "paper-cite__ris"];
  for (const f of htmlFiles) {
    const html = stripNonContent(fs.readFileSync(f, "utf8"));
    const re = /<pre\b[^>]*>/g;
    let m;
    while ((m = re.exec(html))) {
      const tag = m[0];
      const cls = /class=["']([^"']*)["']/.exec(tag);
      if (!cls) continue;
      const clsList = cls[1].split(/\s+/);
      if (!SCROLLABLE_CITE_CLASSES.some((c) => clsList.includes(c))) continue;
      checked++;
      if (!/\btabindex=["']0["']/i.test(tag)) {
        missing++;
        const id = /id=["']([^"']*)["']/.exec(tag);
        fail(
          `门禁 A3：${path.relative(SITE, f)} 里横向可滚动的引用块（RIS / BibTeX）${
            id ? ` #${id[1]}` : ""
          } 没有 tabindex="0"（键盘用户没法滚动它）`
        );
      }
    }
  }
  if (!missing) {
    note(`门禁 A3：${checked} 个引用代码块（RIS / BibTeX）都可键盘聚焦`);
  }
}

/* =====================================================================
 * 门禁 A4 · 强调色不得绕过语义 token 直接当文字色
 * ===================================================================== */
{
  // 为什么需要这条：门禁 A1 查的是 **token 层**（--text-accent 在各主题下
  // 对比度够不够），它管不到"某处直接写了 var(--color-accent-600)"这种用法。
  // 实测踩过：首页 .home-intro__label 用的就是 --color-accent-600，
  // 暗色下 3.49:1 不合格 —— axe 没报它（它当成"装饰性小标签"放过了），
  // 是我自己按计算样式逐个元素量出来的。教训是：**只查 token 不查用法，
  // 漏网的是用法**。
  //
  // 唯一的例外是徽标 .badge--accent：accent-600 文字 + accent-50 底 = 5.07:1，
  // 合格，而且是刻意选的（见 _badge.css 的注释）。所以白名单按选择器判定。
  const srcDir = path.join(ROOT, "src");
  const srcFiles = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else srcFiles.push(p);
    }
  })(srcDir);

  const hits = [];
  for (const f of srcFiles) {
    const ext = path.extname(f);
    if (ext !== ".css" && ext !== ".njk") continue;
    let text = fs.readFileSync(f, "utf8");
    if (ext === ".njk") {
      // njk 里只有 <style> 块里的 CSS 算数
      const blocks = [];
      const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
      let m;
      while ((m = re.exec(text))) blocks.push(m[1]);
      text = blocks.join("\n");
      if (!text.trim()) continue;
    }
    const css = stripComments(text);
    for (const r of topLevelRules(css)) {
      if (r.selector.startsWith("@")) continue;
      if (!/color\s*:\s*var\(\s*--color-accent-600\s*\)/i.test(r.body)) continue;
      for (const sel of r.selector.split(",")) {
        const s = sel.trim();
        if (!s) continue;
        if (/badge/.test(s)) continue; // 白名单：徽标
        hits.push(`${path.relative(ROOT, f)} → ${s}`);
      }
    }
  }

  if (hits.length) {
    for (const h of hits) {
      fail(
        `门禁 A4：${h} 直接把 --color-accent-600 当文字色 —— 暗色下它对页面底色只有 3.49:1，` +
          `而这类标签都是 11px 的小字（AA 要 4.5:1），请改用 --text-accent`
      );
    }
  } else {
    note("门禁 A4：强调色没有绕过 --text-accent 直接当文字色（徽标除外）");
  }
}

/* =====================================================================
 * 门禁 A5 · 无障碍引用必须指向真实存在的 id
 * ===================================================================== */
{
  // 为什么需要这条：ARIA 引用（aria-labelledby / aria-describedby …）是
  // **按 id 字符串**关联的，改模板时**没有任何东西会报错**——id 改了名字，
  // 页面照常渲染，样式照常生效，只是读屏器**默默读不出**那个名字：
  //   · aria-labelledby 指向不存在的 id → 元素**没有无障碍名**，
  //     读屏器退回到元素内容（看起来没事，其实层级全乱）；
  //   · <label for> 指向不存在的 id → 点击标签**点不动**那个输入框；
  //   · aria-controls / aria-owns 指向不存在的 id → 弹层与触发器失联。
  // 这类缺陷 axe-core 报不出来（它读的是计算后的可访问性树，
  // 引用断了它就当"没有名字"，不算 violation），所以只能自己查。
  //
  // 为什么不在 verify-site.cjs 的门禁 1 里一起查：门禁 1 查的是
  // **href/src 指向的文件**能不能找到，并且**显式跳过**纯锚点链接
  // （`href="#xxx"` 前面没有文件，脚本里是 `if (clean.startsWith("#")) return null`），
  // 所以"id 能不能解析"这一族一直无人看守。放在这里而不是塞进门禁 1，
  // 是因为它属于**无障碍**语义（ARIA 引用 = 无障碍名的来源），
  // 与"站内链接是不是死链"是两件事。
  const ARIA_REF_ATTRS = [
    "aria-labelledby",
    "aria-describedby",
    "aria-controls",
    "aria-owns",
    "aria-activedescendant",
  ];

  let broken = 0;
  let checked = 0;
  for (const f of htmlFiles) {
    const rel = path.relative(SITE, f);
    const html = stripNonContent(fs.readFileSync(f, "utf8"));
    const tags = scanTags(html);
    const ids = new Set();
    for (const t of tags) for (const id of t.idList) if (id !== "") ids.add(id);

    for (const t of tags) {
      for (const attr of ARIA_REF_ATTRS) {
        const v = t.attrs[attr];
        if (!v || !v.trim()) continue;
        for (const tok of v.trim().split(/\s+/)) {
          checked++;
          if (!ids.has(tok)) {
            broken++;
            fail(
              `门禁 A5：${rel} 里 <${t.tag} ${attr}="${v}"> 指向不存在的 id "${tok}" —— ` +
                `读屏器会读不出这个无障碍名（引用断了不报错，只是静默失效）`
            );
          }
        }
      }
      // <label for> 必须指向一个真实存在的表单控件（id 存在即可）
      if (t.tag === "label" && t.attrs.for && t.attrs.for.trim()) {
        checked++;
        const tok = t.attrs.for.trim();
        if (!ids.has(tok)) {
          broken++;
          fail(
            `门禁 A5：${rel} 里 <label for="${tok}"> 指向不存在的 id —— ` +
              `点标签点不动对应的输入框`
          );
        }
      }
      // 表格的 headers 属性同理
      if ((t.tag === "th" || t.tag === "td") && t.attrs.headers && t.attrs.headers.trim()) {
        for (const tok of t.attrs.headers.trim().split(/\s+/)) {
          checked++;
          if (!ids.has(tok)) {
            broken++;
            fail(
              `门禁 A5：${rel} 里 <${t.tag} headers="${tok}"> 指向不存在的 id`
            );
          }
        }
      }
    }
  }
  if (!broken) {
    note(`门禁 A5：${checked} 处无障碍引用（ARIA / label / headers）都指向真实存在的 id`);
  }
}

/* =====================================================================
 * 门禁 A6 · id 必须唯一，且页内锚点必须可达
 * ===================================================================== */
{
  // 为什么需要这条（两条判据，一组根因）：
  //   ① **重复 id**：HTML 规范里 id 在文档内必须唯一。重复时，
  //      浏览器与读屏器一律取**第一个**——于是 <label for>、aria-labelledby、
  //      锚点链接会**静默指向错的那个元素**。不报错、不变形，
  //      只是"点标签点不动""读到的名字串到别的区块去了"。
  //   ② **锚点不可达**：`href="#xxx"` 指向一个不存在的 id 时，
  //      点击**什么都不发生**（页面不跳、不报错）。这是典型的死链，
  //      而门禁 1 显式跳过纯锚点链接，所以此前无人看守。
  // 一句话：id 是无障碍名与页内导航的**唯一寻址方式**，
  // 它错了，上面那些引用会**集体静默失效**。
  let dupCount = 0;
  let anchorCount = 0;
  for (const f of htmlFiles) {
    const rel = path.relative(SITE, f);
    const html = stripNonContent(fs.readFileSync(f, "utf8"));
    const tags = scanTags(html);

    const idCount = new Map();
    for (const t of tags) {
      for (const id of t.idList) {
        if (id === "") continue;
        idCount.set(id, (idCount.get(id) || 0) + 1);
      }
    }
    const ids = new Set(idCount.keys());

    for (const [id, n] of idCount) {
      if (n > 1) {
        dupCount++;
        fail(
          `门禁 A6：${rel} 里 id "${id}" 出现 ${n} 次 —— ` +
            `id 必须唯一，否则 <label for> / aria-labelledby / 锚点会静默指向错的那个`
        );
      }
    }

    for (const t of tags) {
      if (t.tag !== "a") continue;
      const h = t.attrs.href;
      // href="#" 是"回到页首"，不是锚点；空 href 同理
      if (!h || !h.startsWith("#") || h.length < 2) continue;
      anchorCount++;
      const tok = h.slice(1);
      if (!ids.has(tok)) {
        fail(
          `门禁 A6：${rel} 里 <a href="${h}"> 指向本页不存在的 id "${tok}" —— ` +
            `点击不会有任何反应`
        );
      }
    }
  }
  if (!dupCount) {
    note(`门禁 A6：id 全站唯一，${anchorCount} 个页内锚点都能解析到本页的真实元素`);
  }
}

/* =====================================================================
 * 门禁 A7 · 标题层级：每页恰好一个 h1，且不得跳级
 * ===================================================================== */
{
  // 为什么需要这条：
  //   ① **h1 数量**：读屏器用户靠"标题列表"快速浏览页面。h1 多于一个，
  //      页面就没有唯一的"这是关于什么的"入口；h1 一个都没有，
  //      标题列表里第一层直接空着。两头都不对。
  //   ② **跳级**（h2 之后直接 h4）：读屏器把标题层级映射成大纲，
  //      跳级会让大纲出现空洞，用户按"跳到下一标题"时会**跳过一整层**内容。
  //      这条对搜索引擎同样有意义（h1 是页面主题的强信号）。
  // 这两条都是**结构性**的，不影响视觉，所以肉眼与截图都看不出来。
  let bad = 0;
  for (const f of htmlFiles) {
    const rel = path.relative(SITE, f);
    const html = stripNonContent(fs.readFileSync(f, "utf8"));
    const tags = scanTags(html);
    const heads = tags
      .filter((t) => /^h[1-6]$/.test(t.tag))
      .map((t) => Number(t.tag[1]));

    const h1n = heads.filter((h) => h === 1).length;
    if (h1n !== 1) {
      bad++;
      fail(
        `门禁 A7：${rel} 里有 ${h1n} 个 <h1>（应为 1 个）—— ` +
          `标题列表的第一层要么空着、要么有多条主线`
      );
    }
    for (let i = 1; i < heads.length; i++) {
      if (heads[i] - heads[i - 1] > 1) {
        bad++;
        fail(
          `门禁 A7：${rel} 的标题层级跳级 h${heads[i - 1]} → h${heads[i]} —— ` +
            `读屏器的大纲会空掉一层，"跳到下一个标题"会跳过一整层内容`
        );
      }
    }
  }
  if (!bad) {
    note("门禁 A7：每页恰好一个 <h1>，标题层级没有跳级");
  }
}

/* =====================================================================
 * 门禁 A8 · 底色 token 必须跨主题压暗（暗色主题不得残留浅色底）
 * ===================================================================== */
{
  // 为什么需要这条（缺陷清单 D25 的配套）：
  //   D25 修的缺陷是「暗色主题下论文精读页的 Key Points 三条要点完全读不出来」。
  //   实测（浏览器逐元素量真实底色，不是拿 --bg-page 猜）：
  //     暗色：.paper-keypoints 的底色是 --color-accent-50，而 tokens.css 的暗色段
  //     **只重映射了 accent-400/500**，accent-50 原样留着 = 亮奶白 #fff3eb；
  //     块内正文走 --text-primary，暗色值是近白 #f5f2ea
  //     ⇒ 近白字压在近白底上，实测 1.03:1，AA 要 4.5:1 —— 三条要点等于没有。
  //   根因不在某个组件的写法上，而在**token 层**：一个被当作底色用的色阶 token，
  //   跨主题没有跟着翻档。
  //   而之前的 A1 只核「登记过的 5 个文字色 token × 2 种底色」，
  //   **底色 token 本身从来不在被核之列** ⇒ 这一族缺陷一直无人看守。
  //
  // 判据：凡是**被当作底色用**的 --color-* token，
  //   ① 若它在浅色主题下的明度落在「亮底档」（L ≥ 0.7），它**必须**在暗色主题里被重映射；
  //   ② 重映射后的明度**不得高于**该主题 --bg-page 的明度 + 0.05
  //      （也就是「不能再是亮底」——暗色页面上留亮底就是这一族缺陷的形态）。
  // 两条都满足才算过。
  //
  // ⚠️ 覆盖范围的诚实边界（不写清楚就成了过度声称）：判据只认**显式**写进
  //    background / background-color 的地方（并展开一层底色 token 的引用）；
  //    靠伪元素、filter、SVG 造出来的底它看不到。渐变里出现的 var(--color-*)
  //    也算「当底色用」（它确实参与底色合成）。
  //    「暗底 + 暗字」这一族（底压暗了但字没跟着抬）不在本判据范围内。

  const LIGHT_SURFACE_MIN_L = 0.7; // 「亮底档」的明度下限
  const css = fs.readFileSync(TOKENS_CSS, "utf8");
  const light = parseTokens(stripComments(extractBlock(css, ":root") || ""));
  const dark = parseTokens(
    stripComments(extractBlock(css, "@media (prefers-color-scheme: dark)") || "")
  );

  if (!Object.keys(light).length || !Object.keys(dark).length) {
    fail(
      "门禁 A8：没能从 tokens.css 解析出浅色 / 暗色两套 token（解析器坏了，不是样式坏了）"
    );
  } else {
    /* ---------- 收集「被当作底色用」的 token ---------- */
    const bgUsed = new Set();
    const files = [];
    (function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else files.push(p);
      }
    })(SRC_DIR);
    for (const f of files) {
      const ext = path.extname(f);
      let text = "";
      if (ext === ".css") {
        text = fs.readFileSync(f, "utf8");
      } else if (ext === ".njk") {
        const blocks = [];
        const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
        let m;
        while ((m = re.exec(fs.readFileSync(f, "utf8")))) blocks.push(m[1]);
        text = blocks.join("\n");
        if (!text.trim()) continue;
      } else {
        continue;
      }
      const stripped = stripComments(text);
      const bgRe = /background(?:-color)?\s*:\s*([^;]+);/g;
      let bm;
      while ((bm = bgRe.exec(stripped))) {
        const valRe = /var\(\s*--([a-z0-9-]+)\s*\)/g;
        let vm;
        while ((vm = valRe.exec(bm[1]))) bgUsed.add(vm[1]);
      }
    }
    /* 展开一层：底色 token（--bg-page 之类）若指向某个 --color-*，
       那个 --color-* 也算被当底色用。 */
    for (const name of [...bgUsed]) {
      if (name.startsWith("color-")) continue;
      const def = light[name] || dark[name];
      if (!def) continue;
      const m = /var\(\s*--(color-[a-z0-9-]+)\s*\)/.exec(def);
      if (m) bgUsed.add(m[1]);
    }

    const darkPage = resolveColor("bg-page", dark);
    if (!darkPage) {
      fail("门禁 A8：解析不出暗色主题的 --bg-page，无法判断哪些底色 token 属于「亮底」");
    } else {
      const Lpage = relativeLuminance(darkPage);
      let surfaces = 0;
      let bright = 0;
      for (const name of [...bgUsed].sort()) {
        if (!name.startsWith("color-")) continue;
        const lv = resolveColor(name, light);
        if (!lv) continue; // 值不是具体颜色（关键字 / 渐变）→ 本判据不判
        surfaces++;
        const Llight = relativeLuminance(lv);
        if (Llight < LIGHT_SURFACE_MIN_L) continue; // 不是「亮底档」，暗色下沿用浅色值不算缺陷
        bright++;
        if (!(name in dark)) {
          fail(
            `门禁 A8：--${name} 在浅色主题下是亮底（L=${Llight.toFixed(3)} ≥ ${LIGHT_SURFACE_MIN_L}），` +
              `但暗色主题里**没有重映射**它 —— 亮底会原样留在暗色页面上，` +
              `压在上面的是暗色主题的近白正文，对比度会掉到 1:1 附近` +
              `（实测 1.03:1，AA 要 4.5:1，见缺陷清单 D25）`
          );
          continue;
        }
        const dv = resolveColor(name, dark);
        if (!dv) {
          fail(
            `门禁 A8：--${name} 在暗色主题里定义了，但解析不出最终颜色（多半是值写成了非十六进制）`
          );
          continue;
        }
        const Ldark = relativeLuminance(dv);
        if (Ldark > Lpage + 0.05) {
          fail(
            `门禁 A8：--${name} 在暗色主题里的值（L=${Ldark.toFixed(3)}）仍比该主题的页面底色` +
              `（L=${Lpage.toFixed(3)}）亮出很多 —— 暗色页面上就是一块亮底。` +
              `请把暗色值压到与 --bg-page 同一档（本仓用的是 #2a1408 这一档深暖底）`
          );
        }
      }
      if (bright === 0) {
        fail(
          "门禁 A8：一个「被当作底色用的亮底档 token」都没认出来 —— 判据可能已经失效"
        );
      } else {
        note(
          `门禁 A8：${surfaces} 个被当作底色用的色阶 token 里，${bright} 个亮底档的都已跨主题压暗` +
            `（阈值 L ≥ ${LIGHT_SURFACE_MIN_L}，暗色底 L=${Lpage.toFixed(3)}）`
        );
      }
    }
  }
}

/* ---------------- 汇总 ---------------- */
if (notes.length) {
  console.log("—");
  notes.forEach((n) => console.log(`  · ${n}`));
}

if (problems.length) {
  console.error(`\n✗ 可访问性自检未通过，共 ${problems.length} 个问题：`);
  problems.forEach((p) => console.error("  " + p));
  process.exit(1);
}
console.log("✓ 可访问性自检通过（门禁 A1–A8；这是机器可判的那几条，不等于完整 WCAG 审计）");
