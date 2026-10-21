#!/usr/bin/env node
/**
 * 门禁 DZ1–DZ4：死 CSS —— CSS 里定义了、但页面上永远不会出现的类。
 *
 * 为什么需要它：死 CSS **不会让构建失败**。它只是让 stylesheet 越滚越大，
 * 并且——这是真正的危害——**让读代码的人以为那些元素还在页面上**。
 * 本项目就吃过这个亏：首页的「ACHIEVEMENTS 成果条」「三处入口」
 * 「Recently collected」三块版块被删掉之后，pages.css 里留下了
 * 18 个零引用的类（.home-achievement* / .home-pillars / .home-pillar* /
 * .home-latest* / .home-index / .home-section-head）。半年后有人要
 * 「把成果条加回来」，会以为只要改改 site.js 的数据就行——实际上
 * 版块、样式、数据三处已经各走各的。
 *
 * ⚠️ **本轮（D52）把受检范围从「只守 pages.css」扩到「全部 15 个样式表」**。
 *   原版 TARGETS = ["src/assets/css/pages.css"]，文件头写的理由是
 *   「全站扫会**误报**，而且是原理性的误报」——**那条理由只对「组合式类名」
 *   成立**（badge--{{ st.tone }} / paper-anchor--${kind} 这类由数据或运行时
 *   拼出来的名字，静态扫永远看不到具体值），对「其余 14 个样式表里早就躺着
 *   的真死类」根本不成立。
 *   实测（扩范围后的第一次跑）：**49 个类在页面上零落点**，其中绝大多数
 *   从站点第一次 Eleventy 接入那天起就没人用过（git log -S 实证：它们只在
 *   CSS 文件里出现过，模板从未引用过）。
 *   ⇒ 误报的那几类改为**显式登记表**（REGISTRY）：登记**具体类名**（不是前缀，
 *     前缀豁免会把 badge--danger 这种真死类一起放过），并由 DZ4 反向自证 ——
 *     登记项一旦失去依据就判红，登记表就不许变成垃圾场。
 *
 * 四条判据（编号 DZ*，与既有前缀均不冲突：
 *   A/AN/AP/AT/AV/BL/C/CF/CQ/CV/CW/DC/DI/DS/DT/E/F/FC/FD/FF/FS/FT/FX/FZ/
 *   GA/GB/GW/HC/IA/ID/IL/IS/J/JS/JT/LM/LS/LT/M/MC/MT/NA/NT/PT/RD/SP/ST/SX/
 *   TD/TR/TS/TX/W/CS/CU/IP/IU/JA/JB 均不同名）：
 *   DZ1 **死类** —— 样式表里定义了、而页面侧与其它样式表里都没有落点的类
 *      ⇒ 判红（一条一条点名，让人知道该删哪条）。
 *   DZ2 **覆盖度自证** —— 样式表数 / 被检查的类名数 / 页面侧 token 数
 *      都不得为 0；扫不到东西时报红，而不是安静地绿。
 *   DZ3 **门禁自己没被卸掉** —— package.json 的 build 链里必须真的有本门禁。
 *   DZ4 **登记表反向自证** —— 每条登记项的依据必须仍然成立：
 *      构造点文件还在、前缀字面量还在、取值字面量还在、类名仍被某个样式表定义；
 *      「保留 / 待拍板」类则必须在**定义它的那个样式表的注释里**写明保留理由。
 *
 * ================= 落点怎么算（三处，缺一不可） =================
 *   ① 页面侧 —— src/ 下的模板 / 脚本 / 内容 / 数据 + eleventy.config.js
 *      + eleventy-helpers.cjs，**剥注释**后按**词边界 token**匹配。
 *      范围刻意排除 docs/（改进日志里会逐条写到类名，那不是「这个类在页面上
 *      活着」），也排除 src/assets/css（那是 ②）。
 *   ② 其它样式表 —— 剥注释后按词边界 token 匹配（一个类若被另一个样式表的
 *      复合选择器引用，它就有落点）。
 *   ③ 登记表 —— 见上。
 *   ⚠️ **词边界**（左边不是字母/数字/连字符，右边同）而不是子串：子串匹配会
 *      拿 `--text-muted` 去证明 `.text-mut` 活着，拿 `--color-brand-50` 去
 *      证明 `.brand` 活着 —— 那是**偶然豁免**，不是落点。词边界匹配后，
 *      `.text-mut` / `.text-sec` / `.measure` / `.tabular` / `.tab` 这几个
 *      才暴露为真死类（它们此前一直被上面那类巧合捂着）。
 *
 * 三个容易踩的坑（都已在下面处理）：
 *   1. **注释里的类名不算数**。本项目的注释大量举例 CSS 片段
 *      （`.home-achievement__label` 这种），不剥注释会把它们全算成「在用」，
 *      门禁就永远不响。JS 的行/块注释也剥（保留字符串字面量）。
 *   2. **url() 里的文件名不算类名**。`@import url("./_nav.css")` 里的
 *      `.css` 会被当成一个类。
 *   3. **AppleDouble 资源叉**（`._paper.css`）：外接 exFAT 盘上 macOS
 *      给每个文件留一份资源叉，它也以 .css 结尾、内容是二进制。
 *      .gitignore 排除了 `._*`，但那只管 git，管不到这个脚本。
 *
 * 为什么不用现成工具：stylelint 有 no-unused-selectors，但它要装依赖、
 * 要配 selector-disallowed-list，而且**不认站点自己的模板与数据**——
 * 本项目改版块时模板和数据是一起动的，工具看不出「这个类是不是真的
 * 还挂在页面上」。几十行脚本够用，且不引入依赖就没有依赖自身的版本问题。
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const REPO = process.env.REPO_ROOT ? path.resolve(process.env.REPO_ROOT) : ROOT;
const PKG = process.env.PKG_PATH ? path.resolve(process.env.PKG_PATH) : path.join(REPO, "package.json");
const SELF = path.basename(__filename);

const CSS_DIR = path.join(REPO, "src", "assets", "css");
const SRC_DIR = path.join(REPO, "src");

/* 判据开关：存在的唯一理由是自测的负对照要把某一条判据**单独**卸掉，
   证明「那一档的红确实来自这一条判据本身」。默认值恒为 true。 */
const DZ1_ON = true;
const DZ2_ON = true;
const DZ3_ON = true;
const DZ4_ON = true;

/* DZ2 的覆盖度下限。
   ⚠️ 一律取 1，不取更大：下限取大会与其它判据**耦合** —— 故意制造某类缺陷
      形态时，覆盖度也会跟着红，于是同一档出现两条判据的编号，红因归属就不可
      判定了。 */
const MIN_TABLES = 1;
const MIN_CLASSES = 1;
const MIN_PAGE_TOKENS = 1;

/**
 * ================= 登记表 =================
 * 静态扫**证明不了**「这个类在页面上活着」的那几类，逐条登记。
 *
 * 三种 kind：
 *   dynamic —— 类名由**运行时**或**数据**拼出来（模板的 {{ }}、JS 的 ${ }）。
 *             依据 = 构造点文件 + 前缀字面量 + 取值字面量，三样都必须在场。
 *   held    —— 有意保留：要么文档化刻意留着，要么归属某条**待拍板**事项
 *             （本轮是 D12 / 待拍板 43：批注层去留未定）。
 *             依据 = 类名必须仍被某个样式表定义，**且**必须在定义它的那个
 *             样式表的**注释里**写明保留理由 ——「保留」必须写在原地，
 *             不能只躺在这张表里。
 *
 * ⚠️ 登记的是**具体类名**，不是前缀：登记 `badge--` 会把 `badge--danger`
 *    这种真死类一起放过（本轮实测 `badge--danger` / `badge--filled-brand`
 *    确实没有落点，已删）。
 */
const REGISTRY = [
  /* —— 动态组合类：类名由数据或运行时拼出来 —— */
  {
    cls: "badge--sage",
    kind: "dynamic",
    site: "src/_includes/partials/publications.njk",
    prefix: "badge--",
    why: "publications.njk 用 class=\"badge badge--{{ st.tone }}\" 拼角标，STATUS 表里 published → sage",
  },
  {
    cls: "badge--warning",
    kind: "dynamic",
    site: "src/_includes/partials/publications.njk",
    prefix: "badge--",
    why: "同上：STATUS 表里 revision → warning",
  },
  {
    cls: "paper-anchor--question",
    kind: "dynamic",
    site: "src/assets/js/paper-reader/annotations.js",
    prefix: "paper-anchor--",
    why: "annotations.js 用 paper-anchor--${primary.kind} 打段落锚点，kind 取自 KIND_LABELS",
  },
  {
    cls: "paper-anchor--insight",
    kind: "dynamic",
    site: "src/assets/js/paper-reader/annotations.js",
    prefix: "paper-anchor--",
    why: "同上：KIND_LABELS 里的 insight",
  },
  {
    cls: "paper-anchor--critique",
    kind: "dynamic",
    site: "src/assets/js/paper-reader/annotations.js",
    prefix: "paper-anchor--",
    why: "同上：KIND_LABELS 里的 critique",
  },
  {
    cls: "paper-anchor--figure",
    kind: "dynamic",
    site: "src/assets/js/paper-reader/annotations.js",
    prefix: "paper-anchor--",
    why: "同上：KIND_LABELS 里的 figure",
  },
  {
    cls: "paper-anchor--link",
    kind: "dynamic",
    site: "src/assets/js/paper-reader/annotations.js",
    prefix: "paper-anchor--",
    why: "同上：KIND_LABELS 里的 link",
  },
  {
    cls: "paper-anchor--typo",
    kind: "dynamic",
    site: "src/assets/js/paper-reader/annotations.js",
    prefix: "paper-anchor--",
    why: "同上：KIND_LABELS 里的 typo",
  },
  {
    cls: "paper-toc__item--h3",
    kind: "dynamic",
    site: "src/assets/js/paper-reader/toc.js",
    prefix: "paper-toc__item--",
    why: "toc.js 用 paper-toc__item--${h.tagName.toLowerCase()} 打目录条目，标签取自 HEADING_SELECTOR",
  },

  /* —— 待拍板：D12 / 待拍板 43（批注层整体不可达，清不清属本人拍板） —— */
  {
    cls: "annotating",
    kind: "held",
    why: "D12 / 待拍板 43：批注层整体不可达（hasAnnotations 恒假），清不清属本人拍板",
  },
  {
    cls: "annot-inline",
    kind: "held",
    why: "D12 / 待拍板 43：同上（移动端内联批注）",
  },
  {
    cls: "annot-pane-wrap",
    kind: "held",
    why: "D12 / 待拍板 43：同上（批注面板容器）",
  },

  /* —— 文档化保留：_nav.css 文件头写明「footer 级品牌锁定块随时可能接回来」 —— */
  {
    cls: "brand",
    kind: "held",
    why: "_nav.css 文件头写明：footer 级的品牌锁定块随时可能接回来，故保留",
  },
  {
    cls: "brand__logo",
    kind: "held",
    why: "同上",
  },
  {
    cls: "brand__name",
    kind: "held",
    why: "同上",
  },
];

/* ================= 工具 ================= */

const problems = [];
/** 记一条判红。id 是判据编号（DZn）—— 自测靠它断言「红因归属纯净」。 */
function fail(id, msg) {
  problems.push(`${id}：${msg}`);
}

/** 剥掉 CSS 的块注释、字符串字面量、url() —— 只留下结构与选择器。 */
function stripCss(src) {
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
    const c = src[i];
    if (c === '"' || c === "'") {
      const quote = c;
      i++;
      while (i < src.length && src[i] !== quote) i += src[i] === "\\" ? 2 : 1;
      i++;
      continue;
    }
    out += c;
    i++;
  }
  // url(...) 里是资源路径，里面的 `.css` / `.png` 不是类名
  return out.replace(/url\([^)]*\)/g, " ");
}

/** 取出 CSS 里的全部块注释正文（登记表 held 类要在注释里找理由）。 */
function cssComments(src) {
  const out = [];
  const re = /\/\*([\s\S]*?)\*\//g;
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}

/** 剥掉 JS 的行注释与块注释，**保留字符串字面量**。 */
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

/** 剥掉 Nunjucks 注释 {# … #} 与 HTML 注释 <!-- … -->。 */
function stripMarkupComments(src) {
  return src.replace(/\{#[\s\S]*?#\}/g, " ").replace(/<!--[\s\S]*?-->/g, " ");
}

/** 按扩展名挑合适的剥法。 */
function codeOnly(file, text) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".js" || ext === ".cjs" || ext === ".mjs") return stripJsComments(text);
  if (ext === ".njk" || ext === ".md" || ext === ".html" || ext === ".svg") {
    return stripMarkupComments(text);
  }
  return text;
}

/** 取出一个 CSS 文本里出现过的全部类选择器名。 */
function classNames(cssText) {
  const out = new Set();
  const stripped = stripCss(cssText);
  // 以 . 开头的标识符；首字符必须是字母/下划线/连字符，避免把 .5em、
  // .75rem 这类小数点后的数字当成类名。
  for (const m of stripped.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) out.add(m[1]);
  return out;
}

/**
 * 词边界 token 集合。
 * token = 标识符片段（可含连字符与下划线）。左边不是标识符字符、右边也不是，
 * 才算一个完整 token —— 于是 `text-mut` 不会被 `--text-muted` 里的片段冒充。
 */
function tokens(text) {
  const out = new Set();
  for (const m of text.matchAll(/-?[_a-zA-Z][\w-]*/g)) out.add(m[0]);
  return out;
}

function* walkFiles(dir, accept) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "_site") continue;
      yield* walkFiles(p, accept);
    } else if (accept(entry.name, p)) {
      yield p;
    }
  }
}

const isAppleDouble = (name) => name.startsWith("._");

/* ================= 事实采集 ================= */

/* —— CSS 侧：全部样式表（不再只守 pages.css） —— */
const cssFiles = [
  ...walkFiles(CSS_DIR, (name) => name.endsWith(".css") && !isAppleDouble(name)),
].sort();

/** 文件 → 原文 / 剥注释后的文本 / 类名集合 / token 集合 */
const cssInfo = new Map();
for (const file of cssFiles) {
  const raw = fs.readFileSync(file, "utf-8");
  const stripped = stripCss(raw);
  cssInfo.set(file, {
    raw,
    stripped,
    classes: classNames(raw),
    tokens: tokens(stripped),
  });
}

/** 类名 → 定义它的样式表（同一个类可能在多个文件里都出现）。 */
const definedIn = new Map();
for (const [file, info] of cssInfo) {
  for (const cls of info.classes) {
    if (!definedIn.has(cls)) definedIn.set(cls, []);
    definedIn.get(cls).push(file);
  }
}

/* —— 页面侧：模板 / 脚本 / 内容 / 数据 / 构建配置 —— */
const USAGE_EXT = new Set([
  ".njk",
  ".md",
  ".js",
  ".cjs",
  ".mjs",
  ".svg",
  ".html",
  ".json",
  ".yaml",
  ".yml",
]);
const usageFiles = [
  ...walkFiles(SRC_DIR, (name, full) => {
    if (isAppleDouble(name)) return false;
    if (full.startsWith(CSS_DIR)) return false;
    return USAGE_EXT.has(path.extname(name).toLowerCase());
  }),
  // 站点根部的构建配置也可能直接写出类名
  path.join(REPO, "eleventy.config.js"),
  path.join(REPO, "eleventy-helpers.cjs"),
].filter((f) => fs.existsSync(f));

/** 页面侧 token 集合（剥注释后）。 */
const pageTokens = new Set();
/** 页面侧文件 → 剥注释后的原文（登记表的构造点校验用字面量判断）。 */
const pageText = new Map();
for (const file of usageFiles) {
  let text = fs.readFileSync(file, "utf-8");
  text = codeOnly(file, text);
  pageText.set(file, text);
  for (const t of tokens(text)) pageTokens.add(t);
}

/* ================= DZ1：死类 ================= */

const registryByCls = new Map(REGISTRY.map((r) => [r.cls, r]));

if (DZ1_ON) {
  for (const [cls, files] of definedIn) {
    if (registryByCls.has(cls)) continue; // 登记表里显式登记的类另有依据
    if (pageTokens.has(cls)) continue; // 页面侧有落点
    // 别的样式表里也提到它 ⇒ 它有落点（可能是被另一个样式表的复合选择器引用）
    let usedElsewhere = false;
    for (const [file, info] of cssInfo) {
      if (files.includes(file)) continue;
      if (info.tokens.has(cls)) {
        usedElsewhere = true;
        break;
      }
    }
    if (usedElsewhere) continue;
    const rels = files.map((f) => path.relative(REPO, f)).join("、");
    fail(
      "DZ1",
      `.${cls}  （只出现在 ${rels}）—— CSS 里定义了，页面侧与其它样式表里都没有落点，` +
        `页面上永远不会有这个元素。` +
        `这类规则不会让构建失败，却会让人以为对应元素还在页面上：` +
        `要么删掉这些规则，要么把元素真的加回模板（并把数据补上）。`
    );
  }
}

/* ================= DZ2：覆盖度自证 ================= */

/* ⚠️ 计数一律**无条件**做，判定才受开关控制 —— 计数写在开关里面会与别的判据
   耦合（同一档出现两条判据的编号，红因归属就不可判定了）。 */
const tableCount = cssFiles.length;
const classCount = definedIn.size;
const pageTokenCount = pageTokens.size;
/** 至少有一个类找到了页面侧落点（证明落点扫描器认得出东西）。 */
let aliveCount = 0;
for (const cls of definedIn.keys()) if (pageTokens.has(cls)) aliveCount++;

if (DZ2_ON) {
  if (tableCount < MIN_TABLES) {
    fail("DZ2", `一个样式表都没扫到（扫到 ${tableCount} 个）—— 枚举器可能坏了，不是「没问题」。`);
  }
  if (classCount < MIN_CLASSES) {
    fail("DZ2", `一个类名都没认出来（认出 ${classCount} 个）—— 类名提取器可能坏了，不是「没问题」。`);
  }
  if (pageTokenCount < MIN_PAGE_TOKENS) {
    fail(
      "DZ2",
      `页面侧一个 token 都没读到（读到 ${pageTokenCount} 个）—— ` +
        `落点扫描器可能坏了，不是「没问题」。`
    );
  }
  if (aliveCount < 1) {
    fail(
      "DZ2",
      `没有任何一个类在页面侧找到落点（${classCount} 个类里认出 0 个）—— ` +
        `落点扫描器可能坏了，不是「没问题」。`
    );
  }
}

/* ================= DZ3：门禁自己没被卸掉 ================= */

if (DZ3_ON) {
  let pkg = null;
  try {
    pkg = JSON.parse(fs.readFileSync(PKG, "utf8"));
  } catch (e) {
    fail("DZ3", `读不到 package.json（${e.message}）—— 无法确认本门禁接在 build 链上。`);
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
      fail("DZ3", `门禁自己被卸掉了：package.json 的 build 链里没有指向 scripts/${SELF} 的 script。`);
    }
  }
}

/* ================= DZ4：登记表反向自证 ================= */

/* ⚠️ **反耦合规则**：样式表一张都没扫到时，登记表的校验**整个跳过** ——
   那种情况下「登记项还在不在」根本无从谈起，那是 DZ2 的事。
   不这么写，两条判据会在同一档同时红，红因归属就不可判定了。 */
if (DZ4_ON && tableCount > 0) {
  for (const entry of REGISTRY) {
    const { cls, kind } = entry;

    /* ① 登记的类必须仍被某个样式表定义（否则登记项已无对象）。 */
    const files = definedIn.get(cls);
    if (!files) {
      fail(
        "DZ4",
        `登记项 .${cls} 已经失效：没有任何样式表还定义这个类 —— ` +
          `要么把规则加回来，要么把这条登记项删掉。登记项不许变成垃圾场。`
      );
      continue;
    }

    if (kind === "dynamic") {
      /* ② 构造点文件必须还在。 */
      const sitePath = path.join(REPO, entry.site);
      if (!fs.existsSync(sitePath) || !pageText.has(sitePath)) {
        fail(
          "DZ4",
          `登记项 .${cls} 的构造点 ${entry.site} 不存在（或不再被扫描）—— ` +
            `这条登记的依据没了，要么补回构造点，要么删掉这条登记项。`
        );
        continue;
      }
      const siteText = pageText.get(sitePath);
      /* ③ 前缀字面量必须还在构造点里（构造方式改了，登记项就失效了）。 */
      if (!siteText.includes(entry.prefix)) {
        fail(
          "DZ4",
          `登记项 .${cls} 的构造点 ${entry.site} 里已经找不到前缀 "${entry.prefix}" —— ` +
            `构造方式变了，这条登记的依据没了。`
        );
        continue;
      }
      /* ④ 取值字面量必须还在（构造点本身，或页面侧别处）。 */
      if (!cls.startsWith(entry.prefix)) {
        fail(
          "DZ4",
          `登记项 .${cls} 的前缀 "${entry.prefix}" 不是它的前缀 —— 登记项自身写错了。`
        );
        continue;
      }
      const value = cls.slice(entry.prefix.length);
      const valueInSite = siteText.includes(value);
      const valueInPage = [...pageText.values()].some((t) => t.includes(value));
      if (!valueInSite && !valueInPage) {
        fail(
          "DZ4",
          `登记项 .${cls} 的取值 "${value}" 在页面侧已经不存在了 —— ` +
            `这个组合类名不会再被产生，这条登记的依据没了。`
        );
        continue;
      }
    } else if (kind === "held") {
      /* ⑤ 保留必须在**原地**写明：类名要出现在定义它的那个样式表的注释里。 */
      const rel = path.relative(REPO, files[0]);
      const comments = cssComments(cssInfo.get(files[0]).raw).join("\n");
      const re = new RegExp(`(?<![\\w-])\\.${cls.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`);
      if (!re.test(comments)) {
        fail(
          "DZ4",
          `登记项 .${cls} 在 ${rel} 里没有写明保留理由 —— ` +
            `「保留」必须写在原地（定义它的样式表的注释里），不能只躺在门禁的登记表里。`
        );
        continue;
      }
      if (!entry.why || !entry.why.trim()) {
        fail("DZ4", `登记项 .${cls} 没有写保留理由（why 为空）。`);
        continue;
      }
    }
  }
}

/* ================= 汇报 ================= */

if (problems.length) {
  console.error("死 CSS 门禁未通过：\n");
  for (const p of problems) console.error(`  · ${p}`);
  console.error("");
  process.exit(1);
}

console.log(
  `死 CSS 门禁通过：${tableCount} 个样式表、${classCount} 个类名` +
    `（页面侧找到落点 ${aliveCount} 个、登记表登记 ${REGISTRY.length} 个），` +
    `没有「CSS 里定义了但页面上永远不会有」的类。`
);
if (REGISTRY.length) {
  console.log(
    `  · 登记项（静态扫证明不了它们活着，故显式登记）：` +
      REGISTRY.map((r) => `.${r.cls}`).join(" / ")
  );
}
