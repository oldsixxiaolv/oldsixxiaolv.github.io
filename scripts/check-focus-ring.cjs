#!/usr/bin/env node
/**
 * 门禁 FC1–FC7：键盘焦点环的**可见性**（对比度），不是「有没有焦点环」
 *
 * 为什么要有这个（2026-10-21 的 D47）：
 *   缺陷清单 §2 早就写过「焦点可见性：全局 `:focus-visible` 用
 *   `box-shadow: var(--shadow-focus)`，16 处 `outline: none` 全部配了替代指示」——
 *   那一行核的是**存在性**（有没有替代指示），**没核替代指示的对比度**。
 *   而本站的替代指示是一个 **35% 半透明的蓝色**（`rgba(58,134,255,.35)`）：
 *     · 浅色页面底（#faf8f5）上 **1.48:1**
 *     · 暗色页面底（#0f0e0c）上 **1.78:1**
 *     · 主按钮底（#1453d8）上 **1.25:1**
 *   WCAG 1.4.11（非文本对比度）要求 UI 组件的视觉指示至少 **3:1** ⇒ 键盘用户
 *   在本站 Tab 导航时几乎看不见焦点在哪。**全仓没有任何一道门禁覆盖这件事。**
 *
 * 为什么不能只把半透明改成不透明：
 *   单一颜色在本站**多种底色**上不可能同时达到 3:1 ——
 *   主按钮底 #1453d8 上，不透明的 brand-400（#3a86ff）也只有 1.85:1。
 *   ⇒ 修法必须是**双色环**：内圈与页面底强对比、外圈取调色板另一极兜底，
 *   这样**任何底色上至少有一圈 ≥ 3:1**（判据 FC3 就在算这件事）。
 *
 * 判据：
 *   FC1 `:root` 必须定义 `--focus-ring-inner` / `--focus-ring-outer`，
 *       且 `--shadow-focus` 必须是**双层** box-shadow（内圈 spread < 外圈 spread，
 *       内圈 spread ≥ 2px —— 更窄的环在视觉上不构成指示器）。
 *       两圈必须引用**不同的** token —— 两圈同色就退化成单色环，
 *       兜底的那一圈没了，底色一换就又不达标。
 *   FC2 两处暗色块（`prefers-color-scheme: dark` 与 `[data-theme="dark"]`）里的
 *       `--shadow-focus` 必须与 `:root` **逐字相同** —— 本方案依赖「表达式相同、
 *       靠内层色阶 token 被重映射」这个前提，暗色块另写一个值就会破。
 *   FC3 **对比度**（本门禁的主判据）：每个主题下，每个登记底色，
 *       焦点环两圈里**至少一圈**与该底色的对比度 ≥ 3:1。
 *   FC4 焦点环两圈的颜色必须**不透明** —— 半透明必然拉低对比度。
 *   FC5 覆盖度自证：两个主题各自至少认出 MIN_BACKGROUNDS 个底色，
 *       且两圈颜色都解析得出来（解析器坏了 ⇒ 判据失效 ⇒ 必须报红）。
 *       同时要求 CSS 目录至少扫到 MIN_CSS_FILES 个样式表、MIN_FOCUS_RULES 条焦点环规则。
 *   FC6 门禁自己没被卸掉：package.json 的 build 链里必须真的有本门禁。
 *   FC7 **全站 CSS 兜底**：任何 `:focus-visible` 规则都不许自己画一个
 *       不受管制的焦点环 —— 焦点环只能走 `var(--shadow-focus)`（唯一真源）
 *       或直接引用 `--focus-ring-inner` + `--focus-ring-outer`（双色环）；
 *       把 box-shadow 置 none 时必须在**同一条规则**里补一个 outline
 *       （forced-colors 的系统色适配就是这一形态）。
 *       没有这条判据，FC1–FC6 只能守住 token 真源 —— 任何人在任何 CSS 文件里
 *       另写一个 `box-shadow: 0 0 0 3px var(--color-brand-400)` 就绕过了整套对比度检查。
 *
 * ⚠️ **判据的边界**（别把它读成「焦点环无障碍达标」）：
 *   · 本门禁只判**颜色对底色的对比度**这一个维度。焦点环的位置、形状、
 *     是否被 overflow 裁切、键盘可达性都不在这里（那些属于浏览器级判据，
 *     尚未拍板，见缺陷清单 D10）。
 *   · 焦点环画在元素**外侧**（box-shadow 的 spread 向外扩展），所以它落在
 *     **元素相邻的那个底色**上，而不是元素自身的底色上 —— FC3 因此按
 *     「相邻底色」建模。若将来把焦点环改成画在元素内侧，FC3 的建模要跟着改。
 *   · FC7 判的是**写法**（有没有绕开 token 真源），不判每一处焦点环的对比度；
 *     走 `--shadow-focus` 的那 12 处由 FC1–FC4 一次性担保。
 *
 * 编号体系：**独立编号 FC1–FC7**，与其它门禁都不续接
 *   （A* 可访问性 / DC* 设计系统契约 / CW* CSS 注释 / F* 博客 front matter …）。
 *
 * 自包含：不 import 任何其它脚本（包括别的门禁），只用 Node 内置能力。
 * 副本注入：FCR_TOKENS_CSS / FCR_CSS_DIR / FCR_PKG 三个环境变量可把输入指向副本。
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const TOKENS_CSS = process.env.FCR_TOKENS_CSS || path.join(ROOT, "src/assets/css/tokens.css");
const CSS_DIR = process.env.FCR_CSS_DIR || path.join(ROOT, "src/assets/css");
const PKG_JSON = process.env.FCR_PKG || path.join(ROOT, "package.json");

/* ---------------- 判定开关（自测的判据级负对照靠它） ---------------- */
const FC1_ON = true;
const FC2_ON = true;
const FC3_ON = true;
const FC4_ON = true;
const FC5_ON = true;
const FC6_ON = true;
const FC7_ON = true;

/* ---------------- 判据参数 ---------------- */
/** 焦点环必须达到的对比度（WCAG 1.4.11 非文本对比度，AA）。 */
const MIN_RATIO = 3;
/** 登记的底色：焦点环画在元素外侧，落在**相邻底色**上 —— 这些是本站真实用到的底色。 */
const BACKGROUNDS = [
  "--bg-page",
  "--bg-surface",
  "--bg-elevated",
  "--bg-muted",
  "--bg-subtle",
  "--button-primary-bg",
  "--color-accent-50",
];
/** FC5 的覆盖度下限（每个主题至少要认出这么多个底色）。 */
const MIN_BACKGROUNDS = 5;
/** FC1：内圈最小 spread（px）。 */
const MIN_INNER_SPREAD = 2;
/** FC5：FC7 的覆盖度下限 —— 至少扫到这么多个样式表、这么多条焦点环规则。 */
const MIN_CSS_FILES = 10;
const MIN_FOCUS_RULES = 10;

const DARK_MQ_SEL = ':root:not([data-theme="light"])';
const DARK_ATTR_SEL = '[data-theme="dark"]';

/* ---------------- 失败收集 ---------------- */
const failures = [];
function fail(msg) {
  failures.push(msg);
}
function pass(msg) {
  console.log("  ✓ " + msg);
}

/* ================= CSS 解析（自包含，不依赖任何外部库） ================= */

/** 剥掉 CSS 块注释（注释里可能有花括号与分号，会干扰后面的配平与取变量）。 */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

/** 按括号配平取出 `sel { ... }` 的**内容**；找不到返回 null。 */
function pickBlock(css, sel) {
  const head = sel + " {";
  const i = css.indexOf(head);
  if (i < 0) return null;
  let depth = 0;
  for (let k = i + head.length - 1; k < css.length; k++) {
    const c = css[k];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return css.slice(i + head.length, k);
    }
  }
  return null;
}

/** 取出一个 CSS 块里定义的自定义属性 → 原始值字符串。 */
function parseVars(block) {
  const m = new Map();
  if (!block) return m;
  const re = /(--[A-Za-z][A-Za-z0-9_-]*)\s*:\s*([^;]+);/g;
  let x;
  while ((x = re.exec(block))) m.set(x[1], x[2].trim());
  return m;
}

/** 括号感知的顶层切分（rgba(1, 2, 3, .4) 里的逗号不能当分隔符）。 */
function splitTop(str, isSep) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const c of str) {
    if (c === "(") depth++;
    else if (c === ")") depth--;
    if (depth === 0 && isSep(c)) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter((s) => s !== "");
}

/** 解析颜色：#rgb / #rrggbb / #rrggbbaa / rgb() / rgba()；认不出返回 null。 */
function parseColor(v) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  let m = s.match(/^#([0-9a-fA-F]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) {
      h = h.split("").map((c) => c + c).join("");
    }
    if (h.length !== 6 && h.length !== 8) return null;
    const num = (i) => parseInt(h.slice(i, i + 2), 16);
    return { r: num(0), g: num(2), b: num(4), a: h.length === 8 ? num(6) / 255 : 1 };
  }
  m = s.match(/^rgba?\(([^)]*)\)$/i);
  if (m) {
    const parts = splitTop(m[1], (c) => c === ",");
    if (parts.length < 3) return null;
    const n = (t) => {
      const q = t.trim();
      if (q.endsWith("%")) return (parseFloat(q) / 100) * 255;
      return parseFloat(q);
    };
    const a = parts.length >= 4 ? (String(parts[3]).trim().endsWith("%")
      ? parseFloat(parts[3]) / 100
      : parseFloat(parts[3])) : 1;
    return { r: n(parts[0]), g: n(parts[1]), b: n(parts[2]), a: Number.isFinite(a) ? a : 1 };
  }
  return null;
}

/**
 * 解析一个变量：整值就是一个 var() 时继续追；追到字面颜色为止。
 * @param {string} name 变量名
 * @param {Map} table 当前主题的变量表
 * @param {Map} root 浅色 :root 的变量表（暗色未覆写的变量回退到这里 —— 与 CSS 级联一致）
 */
function resolveVar(name, table, root, depth = 0) {
  if (depth > 8) return null;
  const raw = table.get(name) != null ? table.get(name) : root.get(name);
  if (raw == null) return null;
  const vm = raw.match(/^var\(\s*(--[A-Za-z][A-Za-z0-9_-]*)\s*\)$/);
  if (vm) return resolveVar(vm[1], table, root, depth + 1);
  return parseColor(raw);
}

/* ================= 对比度（WCAG 2.x 相对亮度） ================= */
function channel(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function luminance(c) {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}
function contrast(a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}
/** 半透明色合成到不透明底上（焦点环与底色都是不透明时这条用不到，但底色可能是半透明的）。 */
function composite(fg, bg) {
  return { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 };
}

/* ================= 焦点环（双层 box-shadow）分解 ================= */
/**
 * 把 `box-shadow` 的值拆成若干圈。
 * @returns {{spread:number, colorText:string, varRef:string|null}|null}
 */
function parseShadowLayers(value) {
  if (typeof value !== "string") return null;
  const segs = splitTop(value, (c) => c === ",");
  const layers = [];
  for (const seg of segs) {
    const parts = seg.split(/\s+/).filter((s) => s !== "");
    if (parts.length < 4) return null; // 至少 offset-x offset-y blur spread
    const spread = parseFloat(parts[3]);
    if (!Number.isFinite(spread)) return null;
    const colorText = parts.slice(4).join(" ");
    const vm = colorText.match(/^var\(\s*(--[A-Za-z][A-Za-z0-9_-]*)\s*\)$/);
    layers.push({ spread, colorText, varRef: vm ? vm[1] : null });
  }
  if (layers.length < 2) return null;
  // 内圈 = spread 最小的一圈；外圈 = 最大的
  layers.sort((a, b) => a.spread - b.spread);
  return { inner: layers[0], outer: layers[layers.length - 1], count: layers.length };
}

/* ================= FC7 的解析层：扫全站 CSS、找出焦点环规则 ================= */

/**
 * 递归列出目录下的 .css 文件。
 * ⚠️ 必须跳过 `._*` —— exFAT 卷上写文件会生成 AppleDouble 侧车（`._tokens.css`），
 *    那是二进制元数据，不是样式表，扫进去只会产生假阳性。
 */
function listCssFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue; // 隐藏文件与 AppleDouble 侧车
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listCssFiles(p));
    else if (e.isFile() && e.name.endsWith(".css")) out.push(p);
  }
  return out.sort();
}

/**
 * 把一段 CSS 拆成规则列表；@media / @supports 这类 at-rule 会**递归下钻**，
 * 因为焦点环规则常常就写在 @media 里。
 * @returns {{selector:string, body:string, at:number}[]}
 */
function collectRules(css, from, to, out) {
  let i = from;
  while (i < to) {
    const open = css.indexOf("{", i);
    if (open < 0 || open >= to) break;
    const prelude = css.slice(i, open).trim();
    let depth = 0;
    let k = open;
    for (; k < to; k++) {
      if (css[k] === "{") depth++;
      else if (css[k] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    if (k >= to) break; // 花括号没配平，放弃这一段
    if (prelude.startsWith("@")) collectRules(css, open + 1, k, out);
    else out.push({ selector: prelude, body: css.slice(open + 1, k), at: open });
    i = k + 1;
  }
  return out;
}

/** 取一条规则里的声明 → Map（prop（小写）→ value）。同名属性取第一次出现的。 */
function parseDecls(body) {
  const m = new Map();
  for (const seg of splitTop(body, (c) => c === ";")) {
    const ci = seg.indexOf(":");
    if (ci < 0) continue;
    const prop = seg.slice(0, ci).trim().toLowerCase();
    const val = seg.slice(ci + 1).trim();
    if (prop && !m.has(prop)) m.set(prop, val);
  }
  return m;
}

/** 去掉结尾的 !important。 */
function stripImportant(v) {
  return String(v).replace(/!\s*important\s*$/i, "").trim();
}

/**
 * 这个选择器是不是**落在被聚焦元素自己身上**？
 * `.card:focus-visible`      ⇒ 是（焦点环画在 .card 上）
 * `.card:focus-visible::before` ⇒ 否（伪元素是另一个盒子）
 * `.card:focus-visible .card__img` ⇒ 否（子元素）
 * `.paper-anchor:focus-visible .paper-anchor__count` ⇒ 否
 */
function isFocusOnSelf(sel) {
  const s = sel.replace(/::[A-Za-z-]+/g, ""); // 去伪元素
  const parts = s
    .replace(/[>+~]/g, " ")
    .split(/\s+/)
    .filter((x) => x !== "");
  if (!parts.length) return false;
  return parts[parts.length - 1].includes(":focus-visible");
}

/** 偏移量 → 行号（stripComments 保留了换行，所以偏移量仍然对得上原文件）。 */
function lineOf(text, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text[i] === "\n") line++;
  return line;
}

/* ================= 读取输入 ================= */
if (!fs.existsSync(TOKENS_CSS)) {
  console.error("门禁 FC1：找不到 " + TOKENS_CSS + " —— 读不到 token 真源就没法核对焦点环。");
  process.exit(1);
}
const css = stripComments(fs.readFileSync(TOKENS_CSS, "utf8"));

const rootVars = parseVars(pickBlock(css, ":root"));
const darkMqVars = parseVars(pickBlock(css, DARK_MQ_SEL));
const darkAttrVars = parseVars(pickBlock(css, DARK_ATTR_SEL));

const THEME_LIGHT = { key: "light", label: "浅色", table: rootVars, root: rootVars };
const THEME_DARK_MQ = { key: "dark-mq", label: "暗色（prefers-color-scheme）", table: darkMqVars, root: rootVars };
const THEME_DARK_ATTR = { key: "dark-attr", label: "暗色（[data-theme=dark]）", table: darkAttrVars, root: rootVars };
const THEMES = [THEME_LIGHT, THEME_DARK_MQ, THEME_DARK_ATTR];

/* ================= FC7：扫描全站 CSS，收集焦点环规则 ================= */
/* 扫描在判定开关**之外**做 —— 覆盖度计数不能被 FC7_ON 摘掉。 */
const cssFiles = listCssFiles(CSS_DIR);
const focusRules = [];
for (const file of cssFiles) {
  const raw = fs.readFileSync(file, "utf8");
  const stripped = stripComments(raw);
  for (const rule of collectRules(stripped, 0, stripped.length, [])) {
    const sels = rule.selector.split(",");
    if (!sels.some((s) => isFocusOnSelf(s))) continue;
    const decls = parseDecls(rule.body);
    if (!decls.has("box-shadow")) continue; // 这条规则不画阴影，也就没得判
    const rel = path.relative(ROOT, file);
    focusRules.push({
      file: rel.startsWith("..") ? file : rel, // 副本在仓外时用绝对路径，别显示 ../../../../
      line: lineOf(stripped, rule.at),
      selector: rule.selector.replace(/\s+/g, " ").trim(),
      shadow: stripImportant(decls.get("box-shadow")),
      outline: decls.has("outline") ? stripImportant(decls.get("outline")) : null,
    });
  }
}

/* ================= 计数（覆盖度自证用）—— 必须放在判定开关之外 ================= */
const counts = {
  backgrounds: THEMES.map((t) => BACKGROUNDS.filter((b) => resolveVar(b, t.table, t.root) != null).length),
  rings: THEMES.map((t) => {
    const shadow = parseShadowLayers(t.table.get("--shadow-focus"));
    if (!shadow) return 0;
    return [shadow.inner, shadow.outer].filter((l) => resolveVar(l.varRef || l.colorText, t.table, t.root) != null).length;
  }),
  themes: THEMES.length,
  cssFiles: cssFiles.length,
  focusRules: focusRules.length,
};

/* ================= FC1：两个焦点环 token + 双层阴影 ================= */
if (FC1_ON) {
  let ok = true;
  for (const name of ["--focus-ring-inner", "--focus-ring-outer"]) {
    if (!rootVars.has(name)) {
      fail(`FC1：tokens.css 的 :root 里没有定义 ${name} —— 焦点环必须拆成内圈与外圈两色，单一颜色在多种底色上不可能同时达到 ${MIN_RATIO}:1。`);
      ok = false;
    }
  }
  const shadow = parseShadowLayers(rootVars.get("--shadow-focus"));
  if (!shadow) {
    fail("FC1：--shadow-focus 不是双层 box-shadow（至少要两圈：内圈 + 外圈）—— 单层环在深色底按钮上达不到 " + MIN_RATIO + ":1。");
    ok = false;
  } else {
    if (shadow.count < 2) {
      fail("FC1：--shadow-focus 只有一层阴影 —— 焦点环必须至少两圈。");
      ok = false;
    }
    if (shadow.inner.spread < MIN_INNER_SPREAD) {
      fail(`FC1：焦点环内圈 spread 只有 ${shadow.inner.spread}px（下限 ${MIN_INNER_SPREAD}px）—— 更窄的环在视觉上不构成指示器。`);
      ok = false;
    }
    if (shadow.outer.spread <= shadow.inner.spread) {
      fail(`FC1：焦点环外圈 spread（${shadow.outer.spread}px）没有比内圈（${shadow.inner.spread}px）宽 —— 两圈必须套在一起。`);
      ok = false;
    }
    for (const [which, layer] of [["内圈", shadow.inner], ["外圈", shadow.outer]]) {
      if (layer.varRef !== "--focus-ring-inner" && layer.varRef !== "--focus-ring-outer") {
        fail(`FC1：焦点环${which}的颜色写成了 ${layer.colorText} —— 两圈必须分别引用 --focus-ring-inner / --focus-ring-outer，否则底色一改就又不达标。`);
        ok = false;
      }
    }
    if (shadow.inner.varRef != null && shadow.inner.varRef === shadow.outer.varRef) {
      fail(
        `FC1：焦点环两圈都引用 ${shadow.inner.varRef} —— 双色环退化成单色环，` +
          `兜底的那一圈没了（底色一换就又不达标）；两圈必须分别引用 --focus-ring-inner 与 --focus-ring-outer。`
      );
      ok = false;
    }
  }
  if (ok) pass("FC1：焦点环是双层环（内圈 + 外圈），两圈各自引用 --focus-ring-inner / --focus-ring-outer 且互不相同");
}

/* ================= FC2：两处暗色块的 --shadow-focus 与 :root 逐字相同 ================= */
if (FC2_ON) {
  const base = rootVars.get("--shadow-focus");
  let ok = true;
  for (const t of [THEME_DARK_MQ, THEME_DARK_ATTR]) {
    const v = t.table.get("--shadow-focus");
    if (v == null) {
      fail(`FC2：${t.label} 的块里没有 --shadow-focus —— 暗色主题必须沿用同一套双色环表达式（靠内层色阶 token 被重映射）。`);
      ok = false;
    } else if (v !== base) {
      fail(`FC2：${t.label} 的 --shadow-focus 与 :root 不一致 —— 本方案依赖「表达式相同、靠内层色阶 token 重映射」，暗色块另写一个值就破了。`);
      ok = false;
    }
  }
  if (ok) pass("FC2：两处暗色块的 --shadow-focus 与 :root 逐字相同");
}

/* ================= FC3：每个底色上至少一圈 ≥ 3:1 ================= */
const ratioReport = [];
if (FC3_ON) {
  let ok = true;
  for (const t of THEMES) {
    const shadow = parseShadowLayers(t.table.get("--shadow-focus"));
    if (!shadow) {
      fail(`FC3：${t.label} 的 --shadow-focus 解析不出双层阴影 —— 没法算对比度。`);
      ok = false;
      continue;
    }
    const pageBg = resolveVar("--bg-page", t.table, t.root);
    for (const bgName of BACKGROUNDS) {
      const raw = resolveVar(bgName, t.table, t.root);
      if (raw == null) {
        fail(`FC3：${t.label} 认不出底色 ${bgName} —— 登记的底色清单对不上 token 真源，这条对比度就没法判。`);
        ok = false;
        continue;
      }
      const bg = raw.a < 1 && pageBg ? composite(raw, pageBg) : raw;
      const inner = resolveVar(shadow.inner.varRef || shadow.inner.colorText, t.table, t.root);
      const outer = resolveVar(shadow.outer.varRef || shadow.outer.colorText, t.table, t.root);
      if (!inner || !outer) {
        fail(`FC3：${t.label} 解析不出焦点环的颜色 —— 没法算对比度。`);
        ok = false;
        continue;
      }
      const ci = contrast(inner, bg);
      const co = contrast(outer, bg);
      const best = Math.max(ci, co);
      ratioReport.push({ theme: t.label, bg: bgName, ci, co, best });
      if (best < MIN_RATIO) {
        fail(
          `FC3：${t.label}主题下焦点环在 ${bgName} 上只有 ${best.toFixed(2)}:1（内圈 ${ci.toFixed(2)}:1 / 外圈 ${co.toFixed(2)}:1）` +
            ` —— 低于 ${MIN_RATIO}:1，键盘用户看不见焦点在哪。`
        );
        ok = false;
      }
    }
  }
  if (ok) pass(`FC3：三个主题 × ${BACKGROUNDS.length} 个底色上，焦点环两圈里至少一圈都 ≥ ${MIN_RATIO}:1`);
}

/* ================= FC4：两圈必须不透明 ================= */
if (FC4_ON) {
  let ok = true;
  for (const t of THEMES) {
    const shadow = parseShadowLayers(t.table.get("--shadow-focus"));
    if (!shadow) continue; // FC1 已经报过了
    for (const [which, layer] of [["内圈", shadow.inner], ["外圈", shadow.outer]]) {
      const c = resolveVar(layer.varRef || layer.colorText, t.table, t.root);
      if (!c) continue;
      if (c.a < 1) {
        fail(`FC4：${t.label} 的焦点环${which}是不透明度的 ${c.a.toFixed(2)} —— 半透明必然拉低对比度，焦点环必须用实色。`);
        ok = false;
      }
    }
  }
  if (ok) pass("FC4：焦点环两圈都是实色（alpha = 1）");
}

/* ================= FC5：覆盖度自证 ================= */
if (FC5_ON) {
  let ok = true;
  THEMES.forEach((t, i) => {
    if (counts.backgrounds[i] < MIN_BACKGROUNDS) {
      fail(`FC5：${t.label}只认出 ${counts.backgrounds[i]} 个底色（下限 ${MIN_BACKGROUNDS}）—— 枚举器坏了，FC3 早就失去了覆盖面。`);
      ok = false;
    }
    if (counts.rings[i] < 2) {
      fail(`FC5：${t.label}只解析出 ${counts.rings[i]} 圈焦点环颜色（要 2 圈）—— 解析器坏了，FC3 早就失去了覆盖面。`);
      ok = false;
    }
  });
  if (counts.cssFiles < MIN_CSS_FILES) {
    fail(`FC5：只扫到 ${counts.cssFiles} 个样式表（下限 ${MIN_CSS_FILES}）—— CSS 目录没找对，FC7 早就失去了覆盖面。`);
    ok = false;
  }
  if (counts.focusRules < MIN_FOCUS_RULES) {
    fail(`FC5：只认出 ${counts.focusRules} 条焦点环规则（下限 ${MIN_FOCUS_RULES}）—— 规则扫描器坏了，FC7 早就失去了覆盖面。`);
    ok = false;
  }
  if (ok) {
    pass(
      `FC5：覆盖度自证 —— 三个主题各自认出 ${counts.backgrounds.join(" / ")} 个底色、${counts.rings.join(" / ")} 圈焦点环颜色；扫到 ${counts.cssFiles} 个样式表、${counts.focusRules} 条焦点环规则`
    );
  }
}

/* ================= FC6：门禁自己没被卸掉 ================= */
if (FC6_ON) {
  let pkg = null;
  try {
    pkg = JSON.parse(fs.readFileSync(PKG_JSON, "utf8"));
  } catch (e) {
    fail("FC6：读不出 " + PKG_JSON + " —— 没法确认本门禁还接在 build 链上。");
  }
  if (pkg) {
    const build = String((pkg.scripts && pkg.scripts.build) || "");
    if (!build.includes("check:focus-ring")) {
      fail("FC6：package.json 的 build 链里没有 check:focus-ring —— 本门禁被摘掉了（或者只注册了没接链）。");
    } else {
      pass("FC6：本门禁接在 npm run build 链上");
    }
  }
}

/* ================= FC7：全站 CSS 兜底 —— 焦点环不许绕开 token 真源 ================= */
if (FC7_ON) {
  let ok = true;
  for (const r of focusRules) {
    const usesShadowToken = /var\(\s*--shadow-focus\s*\)/.test(r.shadow);
    const usesInner = /var\(\s*--focus-ring-inner\s*\)/.test(r.shadow);
    const usesOuter = /var\(\s*--focus-ring-outer\s*\)/.test(r.shadow);
    const isNone = /^none$/i.test(r.shadow);
    const hasOutline = r.outline != null && !/^none$/i.test(r.outline);
    if (usesShadowToken) continue; // 唯一真源，FC1–FC4 一次性担保
    if (usesInner && usesOuter) continue; // 直接写双色环：与 --shadow-focus 等价
    if (isNone && hasOutline) continue; // 改用 outline 作指示器（forced-colors 系统色形态）
    const why = isNone
      ? "把 box-shadow 置成了 none 却没有在同一条规则里补 outline —— 焦点指示器被整个抹掉了"
      : usesInner || usesOuter
        ? "只引用了焦点环两色中的一色 —— 双色环退化成单色环，底色一换就又不达标"
        : "自己另写了一个不受管制的焦点环 —— 它绕开了 --shadow-focus / --focus-ring-* 的对比度担保";
    fail(
      `FC7：${r.file}:${r.line} 的 \`${r.selector}\` 把 box-shadow 写成了 \`${r.shadow}\` —— ${why}。` +
        `焦点环只能走 var(--shadow-focus)，或同时引用 --focus-ring-inner 与 --focus-ring-outer，或置 none 并在同一条规则里补 outline。`
    );
    ok = false;
  }
  if (ok) {
    pass(`FC7：全站 ${counts.cssFiles} 个样式表里的 ${counts.focusRules} 条焦点环规则都走 token 真源（或 outline 系统色形态），没有绕开对比度担保`);
  }
}

/* ================= 结论 ================= */
if (failures.length) {
  console.error("");
  console.error("焦点环门禁未通过（" + failures.length + " 条）：");
  for (const f of failures) console.error("  · " + f);
  if (ratioReport.length) {
    console.error("");
    console.error("  实测对比度（内圈 / 外圈 / 最好的一圈）：");
    for (const r of ratioReport) {
      console.error(
        `    ${r.theme.padEnd(22)} ${r.bg.padEnd(22)} ${r.ci.toFixed(2).padStart(6)} / ${r.co.toFixed(2).padStart(6)} / ${r.best.toFixed(2).padStart(6)}:1`
      );
    }
  }
  process.exit(1);
}

console.log("");
console.log(
  "焦点环门禁通过：焦点环是双色环（内圈 + 外圈），三个主题下每个登记底色上都至少一圈 ≥ " +
    MIN_RATIO +
    ":1；两圈都是实色；全站 " +
    counts.focusRules +
    " 条焦点环规则都走 token 真源；本门禁接在 build 链上。"
);
if (ratioReport.length) {
  console.log("  实测对比度（内圈 / 外圈）：");
  for (const r of ratioReport) {
    console.log(
      `    ${r.theme.padEnd(22)} ${r.bg.padEnd(22)} ${r.ci.toFixed(2).padStart(6)} / ${r.co.toFixed(2).padStart(6)}:1`
    );
  }
}
process.exit(0);
