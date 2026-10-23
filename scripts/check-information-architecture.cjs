#!/usr/bin/env node
/**
 * 信息架构契约门禁 —— 守住「docs/information-architecture.md 里写的路径 / 导航 /
 * 元数据 == 代码现实」这条线。
 *
 * 为什么要有这道门禁（一次具体的实测，不是假想）：
 *   2026-10-23（D84 场次）实测：`docs/information-architecture.md` 是本项目的
 *   信息架构规划稿，但它**从来没有任何门禁看过**（既不在别的门禁的扫描面里，
 *   也没有哪条判据提到它）⇒ 它漂了没人知道。实测至少漂了这些处：
 *     · §1.1 目标 4 写「中文为主要语言，英文版本留作未来扩展」——
 *       与已拍板的「保持全站英文」直接冲突；
 *     · §1.2 写「不做：管理后台（所有内容通过 PR / Markdown 直接更新）」——
 *       与已拍板的后台形态（Decap CMS）直接冲突；
 *     · §1.2 写「不做：客户端搜索」，§4.6 却整节描述 /search/ —— 自相矛盾；
 *     · /portfolio/ 整块（§2.1 / §2.2 / §3.1 / §3.2 / §4.2 / §五 / §七）都被
 *       写成「已经在那儿」，而站内**根本没有 portfolio**：没有列表页模板、
 *       集合里 0 条内容、导航里也没有它 ⇒ 点开就是 404；
 *     · §3.1 导航表列 5 个一级入口，而真源 src/_data/site.js 的 nav 只有 4 个；
 *     · §五 的文件名规范写 /content/blog/{yyyy-mm-dd-slug}/index.md、论文配
 *       annotations.json —— 真实路径全在 src/ 下面，slug 就是目录名，
 *       而且真实论文条目里**没有** annotations.json；
 *     · §6.1 Blog 的 front matter 示例含 slug / author / status —— 这三个字段
 *       **不生效**（目录名决定 URL，author / status 压根不存在）；
 *     · §6.3 Paper 的 front matter 示例写着 title / authors / journal / year /
 *       doi / pdf —— 论文页的这些字段**根本不从 front matter 读**，唯一真源是
 *       src/_data/site.js 的 publications[] ⇒ 照着示例写就是白写；
 *     · §七 的静态生成衔接表把来源写成 content/blog/** —— 照着建目录会建在
 *       仓库根的 content/ 下，Eleventy **不采集** ⇒ 建了也没有页面。
 *   这族漂移不会让站点变坏，只会让后来的人（包括 agent）照着**不存在的路径**
 *   实现、照着**不被消费的字段**写内容，或者照着**建错目录**的规范建目录。
 *
 * 判据（IAC1–IAC7）：
 *   IAC1 文档里出现的每一条**字面站内路径**，必须「当前真实存在」或者
 *        「在『落地状态』表里被逐条点名」—— 两样都不是 ⇒ 判红
 *        （这条路径既没实现、也没被承认没实现）。
 *   IAC2 『落地状态』表不得过期 —— 表里点名的路径必须**当前确实没实现**
 *        （已经实现了还留在表里 ⇒ 表在骗人）。
 *   IAC3 §3.1 的导航表必须与真源 src/_data/site.js 的 nav 数组**逐项对齐**
 *        （条目数一致、路径集合一致）。
 *   IAC4 文档里的**内容源路径**必须带 src/ 前缀，且它指向的目录 / 文件
 *        **真实存在** —— 否则照着建目录会建到 Eleventy 不采集的地方。
 *   IAC5 §6 的 front matter 字段必须与真源一致：
 *        · Blog 的字段必须属于「站内博客写作契约」列出的可写字段
 *          （layout / permalink 写了反而会覆盖自动注入）；
 *        · Paper 的字段必须属于真实论文条目的 front matter ∪ 集合自动注入字段；
 *        · 还没实现的集合，它那一节必须明写「规划中」。
 *   IAC6 已拍板的口径不得被推翻 —— 文档必须写明「全站英文」且不得再写
 *        「中文为主要语言」；必须写明后台形态是 Decap CMS 且不得再写
 *        「不做：管理后台」。
 *   IAC7 覆盖度自证 —— 扫到的路径数 / 清单条目数 / 导航行数 / 字段数 /
 *        页面骨架小节数 / 页面区块锚点数都不得低于门槛；
 *        防止「把文档改空了」「把表头改名让门禁看不见」就能过。
 *   IAC8 §四 里写下的每个区块锚点，必须在该路由的页面模板里**真实存在**
 *        —— 文档描述了一个模板里根本没有的区块 ⇒ 这份文档在骗人。
 *   IAC9 反过来：模板里真实存在的区块，文档必须**逐个**列出来；而且该小节
 *        必须有「区块锚点」行 —— 一行都没有 = 没承诺，列漏了 = 文档过期。
 *   IAC10 还没有页面模板的路由（未落地），§四 那一小节必须明写「规划中」
 *        —— 否则会被当成已经能用的页面骨架。
 *
 * ⚠️ 诚实边界（写清楚才算数）：
 *   · 静态检查，不联网、不跑构建、不依赖产物目录 ⇒ 可以在 build 链的
 *     pre-eleventy 段跑。
 *   · 门禁不 import 被检查方：自己读文件、自己解析 site.js 的 nav 数组。
 *   · IAC1 判的是**路径**；「这条路径上的页面内容对不对」不在本门禁范围。
 *   · IAC1 把「已实现集合下的条目路径」也算覆盖（例如 /papers/xxx/）——
 *     规划稿举的例子 slug 本来就是示意，不是断言某个具体条目已存在。
 *   · IAC6 判的是**措辞契约**（必须写明已拍板结论、不得复述被推翻的口径），
 *     判不了「换个说法表达同一意思」。
 *   · §八 评审清单是散文，门禁不看它。
 *   · IAC8 / IAC9 / IAC10 只管**列表页 / 单页**这一层（src 根下的页面模板）；
 *     详情页（/blog/{slug}/、/papers/{slug}/）的骨架**不在**本门禁范围内
 *     —— 详情页由集合的 permalink 规则生成，不是 src 根下的页面模板。
 *   · 同一小节里写了多行「区块锚点」时，门禁把各行的锚点**合起来**与该路由的
 *     模板对账 ⇒ 一行只写该路由自己的区块，别把详情页的也塞进来。
 *   · 区块锚点的派生规则是**机械的**（见下面「页面区块锚点」那一段）：
 *     它能证明「文档说的区块在模板里有」，判不了「这个区块的排版好不好看」。
 *
 * 环境变量（供 scripts/test-information-architecture.cjs 的注入矩阵用）：
 *   IAC_DOC       —— 覆盖信息架构文档路径。
 *   IAC_SRC       —— 覆盖站点源码根目录（模板 / 内容 / 集合数据文件）。
 *   IAC_SITE_DATA —— 覆盖真源 site.js 的路径。
 *   IAC_GUIDE     —— 覆盖站内博客写作契约文档的路径。
 *   注入必须在副本上做，不动仓库里的文件。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DOC = process.env.IAC_DOC
  ? path.resolve(process.env.IAC_DOC)
  : path.join(ROOT, "docs", "information-architecture.md");
const SRC = process.env.IAC_SRC ? path.resolve(process.env.IAC_SRC) : path.join(ROOT, "src");
const SITE_DATA = process.env.IAC_SITE_DATA
  ? path.resolve(process.env.IAC_SITE_DATA)
  : path.join(ROOT, "src", "_data", "site.js");
const GUIDE = process.env.IAC_GUIDE
  ? path.resolve(process.env.IAC_GUIDE)
  : path.join(ROOT, "docs", "blog-writing-guide.md");

/* 覆盖度门槛（自证用，防止「把文档改空了」「把表头改名就绕过」）。 */
const MIN_PATHS = 20;
const MIN_LIST_ENTRIES = 1;
const MIN_FIELDS = 6;
const MIN_DOC_LINES = 120;
/* 页面骨架这一层的覆盖度：真实站点有 4 个已实现页面、16 个区块锚点；
   门槛只保证「§四 还真的在描述页面骨架」，不保证数量跟得上。 */
const MIN_SKELETON_PAGES = 4;
const MIN_BLOCK_ANCHORS = 8;

/* 『落地状态』表第一列允许的表头写法。 */
const LIST_HEADERS = ["未落地路径", "未实现路径", "待实现路径"];
/* 导航表里表示路径的那一列的表头写法。 */
const NAV_HEADER = "路径";
/* front matter 里写了会覆盖自动注入、因而禁止出现的字段。 */
const FORBIDDEN_IN_FRONTMATTER = ["layout", "permalink"];

/* 已拍板、文档不得推翻的口径（IAC6）。 */
const DECIDED = [
  {
    must: /全站英文|站内全英文|全站只写英文|站内只写英文|全站保持英文|站内只写英文/,
    mustNot: /中文为主要语言|以中文为主|中文为主语言/,
    what: "站内语言（全站英文；中文版不做）",
  },
  {
    must: /Decap/i,
    mustNot: /不做：管理后台|不做:管理后台|所有内容通过 PR/,
    what: "内容后台形态（已拍板为 Decap CMS）",
  },
];

const problems = [];
function fail(m) {
  problems.push(m);
}

/* ==================== 小工具 ==================== */

/** 一段模板文件的 front matter 原文；没有就返回 null。 */
function frontMatterOf(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1] : null;
}

/** front matter 里的**顶层**键名（续行、注释、嵌套块都跳过）。 */
function frontMatterKeys(fm) {
  const out = new Set();
  if (!fm) return out;
  for (const line of fm.split(/\r?\n/)) {
    if (/^\s/.test(line)) continue;
    if (/^\s*#/.test(line)) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:/);
    if (m) out.add(m[1]);
  }
  return out;
}

/** 表格行拆成单元格（去掉首尾两个空壳）。 */
function splitCells(line) {
  return line
    .split("|")
    .slice(1, -1)
    .map((x) => x.trim());
}

/* ==================== 真源：站点路由 ==================== */

/**
 * 路由 → 页面模板文件（src 根下的 .njk；front matter 的 permalink 优先，
 * 没有就按文件名推：index.njk ⇒ /，about.njk ⇒ /about/）。
 *
 * 只看 src 根这一层：src/_includes/ 下的 partial 与 layout 不是页面；
 * src/content/ 下的条目页由集合的 permalink 规则生成，不一张张登记。
 * 「页面骨架」这一层关心的就是「这个路由对应哪个模板」。
 */
function pageTemplateMap() {
  const out = new Map();
  let names = [];
  try {
    names = fs.readdirSync(SRC);
  } catch (e) {
    return out;
  }
  for (const n of names) {
    if (!n.endsWith(".njk") || n.startsWith("._")) continue;
    const abs = path.join(SRC, n);
    const text = fs.readFileSync(abs, "utf8");
    const fm = frontMatterOf(text);
    let permalink = null;
    if (fm) {
      const m = fm.match(/^permalink:\s*(.+?)\s*$/m);
      if (m) {
        const v = m[1].trim().replace(/^["']|["']$/g, "");
        if (v && !v.includes("${")) permalink = v;
      }
    }
    if (!permalink) {
      const base = n.replace(/\.njk$/, "");
      permalink = base === "index" ? "/" : `/${base}/`;
    }
    if (!out.has(permalink)) out.set(permalink, abs);
  }
  return out;
}

/**
 * 站点里**真实存在的字面路由**：页面模板的路由 + 静态资源前缀。
 */
function literalRoutes() {
  const out = new Set(pageTemplateMap().keys());
  // 静态资源前缀：构建配置把 src/assets/** 原样复制到 /assets/ ⇒ 它是真实存在的路径前缀。
  if (fs.existsSync(path.join(SRC, "assets"))) out.add("/assets/");
  return out;
}

/* ==================== 真源：页面区块锚点 ====================
 *
 * HTML 里没有「块」的概念，「页面骨架」要能被逐条对账，就得有一个**机械**的定义。
 * 规则写死在这里，文档侧只照抄派生的结果 —— 门禁不替文档猜「本该有哪些块」：
 *   · 先剥掉 front matter（YAML 不是 HTML）、Nunjucks 注释 {# ... #}、
 *     HTML 注释、<style> 与 <script> 块
 *     —— 不剥的话，front matter 里一句 YAML 注释「<title> 直接退化成……」
 *        会被当成真标签，把页面容器顶深一层（实测踩过：blog.njk 就是这样）。
 *   · 模板里每个 {% include "X" %} 是一个独立的块 ⇒ 锚点就是 X 本身。
 *   · HTML 标签栈的最外层元素（深度 0）是页面容器，它的**直接子级**（深度 1）
 *     才是「页面区块」；再往里是区块内部的零件，不进骨架这一层。
 *   · 深度 1 元素的锚点优先级：id="V" ⇒ #V ；class="A B" ⇒ .A.B ；
 *     都没有但有 aria-labelledby="V" ⇒ #V ；都没有 ⇒ 不算锚点。
 */
const HTML_VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
  "meta", "param", "source", "track", "wbr",
]);

/** 剥掉模板里与「骨架」无关的部分（front matter / 注释 / style / script）。 */
function stripTemplateNoise(text) {
  return text
    .replace(/^---\r?\n[\s\S]*?\r?\n---/, "")
    .replace(/\{#[\s\S]*?#\}/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "");
}

/** 模板里 include 的 partial 名（每个都是一个独立的区块）。 */
function includeAnchorsOf(text) {
  const out = [];
  for (const m of text.matchAll(/\{%-?\s*include\s+"([^"]+)"\s*-?%\}/g)) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

/** 标签属性值（只认双引号写法；模板里的属性一律是双引号）。 */
function attrValueOf(tagText, name) {
  const m = tagText.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`));
  return m ? m[1].trim() : null;
}

/** 一个元素的区块锚点（按上面写的优先级）。 */
function anchorOfTag(tagText) {
  const id = attrValueOf(tagText, "id");
  if (id) return `#${id}`;
  const cls = attrValueOf(tagText, "class");
  if (cls) {
    const parts = cls.split(/\s+/).filter(Boolean);
    if (parts.length) return `.${parts.join(".")}`;
  }
  const labelled = attrValueOf(tagText, "aria-labelledby");
  if (labelled) {
    const first = labelled.split(/\s+/).filter(Boolean)[0];
    if (first) return `#${first}`;
  }
  return null;
}

/** 一个页面模板的「区块锚点」集合（去重，顺序不保证）。 */
function blockAnchorsOf(file) {
  let raw = "";
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (e) {
    return [];
  }
  const text = stripTemplateNoise(raw);
  const out = new Set(includeAnchorsOf(text));
  const stack = [];
  const re = /<(\/)?([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let m;
  while ((m = re.exec(text))) {
    const closing = m[1] === "/";
    const name = m[2].toLowerCase();
    const rest = m[3] || "";
    if (closing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i] === name) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const selfClosing = /\/\s*$/.test(rest) || HTML_VOID_TAGS.has(name);
    const depth = stack.length;
    if (depth === 1) {
      const a = anchorOfTag(rest);
      if (a) out.add(a);
    }
    if (!selfClosing) stack.push(name);
  }
  return [...out];
}

/**
 * 集合数据文件（<name>.11tydata.cjs）的顶层键 + 自动计算字段名。
 * 例：blog 的 layout / permalink / tags / prev / next。
 */
function dataFileKeys(src) {
  const out = new Set();
  const lines = src.split(/\r?\n/);
  let inComputed = false;
  for (const line of lines) {
    if (/^\s*eleventyComputed:\s*\{/.test(line)) {
      inComputed = true;
      continue;
    }
    if (inComputed) {
      if (/^\s{0,2}\}/.test(line)) {
        inComputed = false;
        continue;
      }
      const m = line.match(/^\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/);
      if (m) out.add(m[1]);
      continue;
    }
    const m = line.match(/^  ([A-Za-z_][A-Za-z0-9_]*)\s*:/);
    if (m && m[1] !== "eleventyComputed") out.add(m[1]);
  }
  return out;
}

/**
 * 站点里声明的**集合**（每个集合一个目录，目录下有同名 .11tydata.cjs）。
 * family = permalink 家族前缀（/blog/ /papers/ /portfolio/ …）。
 * items   = 集合里的条目数（0 条 ⇒ 这个家族不产出任何页面）。
 */
function collections() {
  const out = [];
  const contentDir = path.join(SRC, "content");
  let names = [];
  try {
    names = fs.readdirSync(contentDir);
  } catch (e) {
    return out;
  }
  for (const c of names.sort()) {
    if (c.startsWith("._")) continue;
    const dir = path.join(contentDir, c);
    let st = null;
    try {
      st = fs.statSync(dir);
    } catch (e) {
      continue;
    }
    if (!st.isDirectory()) continue;
    const dataFile = path.join(dir, `${c}.11tydata.cjs`);
    let family = null;
    const injected = new Set();
    if (fs.existsSync(dataFile)) {
      const src = fs.readFileSync(dataFile, "utf8");
      const m = src.match(/permalink:[^\n]*?[`'"]([^`'"]*\/)[`'"](?=[,}\s])/);
      if (m) family = m[1].replace(/\$\{[^}]*\}/g, "").replace(/\/+/g, "/");
      for (const k of dataFileKeys(src)) injected.add(k);
    }
    let items = [];
    try {
      items = fs
        .readdirSync(dir)
        .filter((n) => n !== `${c}.11tydata.cjs` && !n.startsWith("._"));
    } catch (e) {
      items = [];
    }
    out.push({ name: c, family, injected, items: items.length });
  }
  return out;
}

/** 真实论文条目的 front matter 字段（论文页的 bibliographic 字段不在这里）。 */
function paperFrontMatterFields() {
  const out = new Set();
  const dir = path.join(SRC, "content", "papers");
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch (e) {
    return out;
  }
  for (const d of names) {
    if (d.startsWith("._")) continue;
    const md = path.join(dir, d, "paper.md");
    if (!fs.existsSync(md)) continue;
    const fm = frontMatterOf(fs.readFileSync(md, "utf8"));
    for (const k of frontMatterKeys(fm)) out.add(k);
  }
  return out;
}

/** 站内博客写作契约里列出的**可写 front matter 字段**（那张表的第 1 列）。 */
function guideWritableFields() {
  const out = new Set();
  let text = "";
  try {
    text = fs.readFileSync(GUIDE, "utf8");
  } catch (e) {
    return out;
  }
  let inTable = false;
  for (const line of text.split(/\r?\n/)) {
    if (!/^\s*\|/.test(line)) {
      inTable = false;
      continue;
    }
    const cells = splitCells(line);
    if (!inTable) {
      if (cells.length >= 5 && cells[0] === "字段" && cells[1] === "必需") inTable = true;
      continue;
    }
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    const key = cells[0].replace(/`/g, "").trim();
    if (key) out.add(key);
  }
  return out;
}

/* ==================== 文档解析 ==================== */

/** 文档的小节（标题 + 正文行）。 */
function sectionsOf(lines) {
  const out = [];
  let cur = null;
  for (const line of lines) {
    const m = line.match(/^(#{2,4})\s+(.*)$/);
    if (m) {
      cur = { heading: m[2], lines: [] };
      out.push(cur);
      continue;
    }
    if (cur) cur.lines.push(line);
  }
  return out;
}

/** 文档里所有表格（表头行 + 数据行）。 */
function tablesOf(lines) {
  const out = [];
  let cur = null;
  for (const line of lines) {
    if (!/^\s*\|/.test(line)) {
      cur = null;
      continue;
    }
    const cells = splitCells(line);
    if (cur === null) {
      cur = { header: cells, rows: [] };
      out.push(cur);
      continue;
    }
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    cur.rows.push(cells);
  }
  return out;
}

/** 小节里第一个 ```yaml 代码块的正文；没有就返回 null。 */
function yamlBlockOf(section) {
  let inFence = false;
  let isYaml = false;
  let buf = [];
  for (const line of section.lines) {
    const f = line.match(/^```(\w*)\s*$/);
    if (f) {
      if (!inFence) {
        inFence = true;
        isYaml = f[1].toLowerCase() === "yaml";
        buf = [];
      } else {
        inFence = false;
        if (isYaml) return buf.join("\n");
      }
      continue;
    }
    if (inFence && isYaml) buf.push(line);
  }
  return null;
}

/** 小节里 yaml 代码块的顶层键名。 */
function yamlKeysOf(section) {
  const block = yamlBlockOf(section);
  const out = new Set();
  if (block === null) return out;
  for (const line of block.split(/\r?\n/)) {
    if (/^\s/.test(line)) continue;
    if (/^\s*#/.test(line)) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:/);
    if (m) out.add(m[1]);
  }
  return out;
}

/** 集合对应的 front matter 小节（标题提到它、且带 yaml 块）。 */
function metaSectionOf(sections, name) {
  const words = [name.toLowerCase(), name.toLowerCase().replace(/s$/, "")];
  for (const s of sections) {
    const h = s.heading.toLowerCase();
    if (!words.some((w) => w && h.includes(w))) continue;
    if (yamlBlockOf(s) === null) continue;
    return s;
  }
  return null;
}

/**
 * 小节标题里的路由：反引号包着、以 / 开头的那一个。
 * 标题里没有这种反引号 ⇒ 这一小节不是「某个路由的骨架」，门禁不管它。
 */
function routeOfHeading(heading) {
  for (const m of heading.matchAll(/`([^`]+)`/g)) {
    const t = m[1].trim();
    if (t.startsWith("/")) return t;
  }
  return null;
}

/**
 * 小节里「区块锚点」行给出的锚点。
 * 行首是「区块锚点：」，后面是反引号包着的锚点（多个用分隔符隔开）。
 * 同一小节写了多行 ⇒ 锚点合起来算（没写 = 没承诺，漏写 = 文档过期）。
 */
function anchorAnchorsOf(section) {
  const out = [];
  let found = false;
  for (const line of section.lines) {
    const m = line.match(/^\s*区块锚点[：:]\s*(.+)$/);
    if (!m) continue;
    found = true;
    for (const t of m[1].matchAll(/`([^`]+)`/g)) {
      const a = t[1].trim();
      if (a && !out.includes(a)) out.push(a);
    }
  }
  return { found, anchors: out };
}

/* 内容源路径：以 content/ 结尾的那一段路径（含前面的 src/ 或 /）。 */
const CONTENT_PATH_RE = /[A-Za-z0-9._~%+\-<>{}\/*]*content\/[A-Za-z0-9._~%+\-<>{}\/*]*/g;

/** 文档里出现的所有**内容源路径**。 */
function contentPathsOf(text) {
  const out = [];
  for (const m of text.matchAll(CONTENT_PATH_RE)) {
    const p = m[0];
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

/* 站内路径的字面量：/ 开头，段里只允许常见的 URL 字符。 */
const PATH_RE = /(?<![A-Za-z0-9._~%+\-/])(\/[A-Za-z0-9._~%+\-]*(?:\/[A-Za-z0-9._~%+\-]*)*)/g;

/**
 * 把内容源路径从文本里**挖空**（原地留等长空格）。
 *
 * 为什么必须挖空而不是「跳过含 content/ 的那一段」：
 *   `/content/papers/{slug}/paper.md` 里，`}` 不在站内路径的字符集内 ⇒
 *   站内路径那条正则会从 `}` 之后**重新起切**，切出一个假路径 `/paper.md`。
 *   同理 `/content/blog/{slug}/index.md` 会切出 `/index.md`。
 *   这两条路径都不是站内 URL，是**文件名**，混进路由清单就是假红。
 */
function blankContentPaths(text) {
  return text.replace(CONTENT_PATH_RE, (m) => " ".repeat(m.length));
}

/** 文档里出现的所有**字面站内路径**（已剔除省略号、协议相对链接、内容源路径）。 */
function pathTokensOf(text) {
  const out = [];
  for (const m of blankContentPaths(text).matchAll(PATH_RE)) {
    let p = m[1];
    if (p.startsWith("//")) continue; // 协议相对 / 外部 URL
    if (p.includes("..")) continue; // 省略号（/blog/... 这类示意）
    p = p.split("?")[0]; // 查询串不是路径的一部分
    if (!p) continue;
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

/** 内容源路径解析：返回它指向的真实路径（目录或文件）。 */
function resolveContentPath(p) {
  const segs = p.split("/").filter(Boolean);
  const parts = [];
  let truncated = false;
  for (const s of segs) {
    if (s === "*" || s === "**" || /[{<]/.test(s) || s.endsWith("*")) {
      truncated = true;
      break;
    }
    parts.push(s);
  }
  const dir = truncated;
  return { rel: parts.join("/"), isDir: dir };
}

/* ==================== 判据 ==================== */

function main() {
  if (!fs.existsSync(DOC)) {
    console.log(`✗ IAC7 覆盖度自证不足：找不到信息架构文档 ${DOC}`);
    process.exit(1);
  }
  const docText = fs.readFileSync(DOC, "utf8");
  const docLines = docText.split("\n");
  const sections = sectionsOf(docLines);
  const tables = tablesOf(docLines);

  /* --- 真源 --- */
  const livePaths = literalRoutes();
  const cols = collections();
  const implementedFamilies = cols
    .filter((c) => c.family && (c.items > 0 || livePaths.has(c.family)))
    .map((c) => c.family);

  let siteData = null;
  try {
    siteData = require(SITE_DATA);
  } catch (e) {
    fail(`IAC3 读不到真源 ${SITE_DATA}（${e.message}）—— 没有真源可比，直接判红。`);
  }
  const nav = siteData && Array.isArray(siteData.nav) ? siteData.nav : [];
  const navHrefs = nav.map((n) => String((n && n.href) || "").trim());

  /* --- 『落地状态』表 --- */
  const listTable = tables.find((t) => t.header.some((c) => LIST_HEADERS.includes(c.replace(/`/g, "").trim())));
  const listEntries = [];
  if (listTable) {
    const col = listTable.header.findIndex((c) => LIST_HEADERS.includes(c.replace(/`/g, "").trim()));
    for (const row of listTable.rows) {
      const cell = (row[col] || "").replace(/`/g, "").trim();
      if (!cell) continue;
      listEntries.push(cell);
    }
  }

  /** 一个路径当前是不是真实存在。 */
  const isLive = (p) => livePaths.has(p) || implementedFamilies.some((f) => p.startsWith(f));
  /** 一个路径有没有被『落地状态』表点名（前缀点名即覆盖整族）。 */
  const isListed = (p) => listEntries.some((e) => p === e || p.startsWith(e));

  /* --- IAC1：字面路径必须已实现或被点名 --- */
  const paths = pathTokensOf(docText);
  let uncovered = 0;
  for (const p of paths) {
    if (isLive(p) || isListed(p)) continue;
    uncovered++;
    fail(
      `IAC1 文档里出现「${p}」，但它当前既不真实存在、也没在『落地状态』表里被点名 —— ` +
        `这条路径既没实现、也没被承认没实现。`
    );
  }

  /* --- IAC2：『落地状态』表不得过期 --- */
  if (!listTable) {
    fail("IAC2 文档里找不到『落地状态』表（表头要有「未落地路径」一列）—— 没有它，未实现的路径就没人负责交代。");
  }
  for (const e of listEntries) {
    if (e === "/") {
      fail("IAC2 『落地状态』表里点名了根路径 / —— 那会豁免全站所有路径，等于这张表什么都不管。");
      continue;
    }
    if (isLive(e)) {
      fail(`IAC2 『落地状态』表里的「${e}」当前已经真实存在 —— 这张表已经过期，会骗到后来的人。`);
    }
  }

  /* --- IAC3：导航表必须与真源逐项对齐 --- */
  const navTable = tables.find((t) => t.header.includes(NAV_HEADER));
  if (!navTable) {
    fail("IAC3 文档里找不到导航表（表头要有「路径」一列）—— 没有它，导航口径就没有落点。");
  } else {
    const col = navTable.header.indexOf(NAV_HEADER);
    const docHrefs = navTable.rows.map((r) => (r[col] || "").replace(/`/g, "").trim()).filter(Boolean);
    if (docHrefs.length !== navHrefs.length) {
      fail(
        `IAC3 导航表列了 ${docHrefs.length} 个入口，真源 nav 数组有 ${navHrefs.length} 个 —— ` +
          `两份不是同一组入口。`
      );
    }
    for (const h of navHrefs) {
      if (!docHrefs.includes(h)) fail(`IAC3 真源 nav 里的入口 ${h} 在文档的导航表里没有。`);
    }
    for (const h of docHrefs) {
      if (!navHrefs.includes(h)) fail(`IAC3 文档导航表里的入口 ${h} 在真源 nav 数组里没有。`);
    }
  }

  /* --- IAC4：内容源路径必须带 src/ 前缀且真实存在 --- */
  const contentPaths = contentPathsOf(docText);
  for (const p of contentPaths) {
    const bare = p.replace(/^\//, "");
    if (!bare.startsWith("src/")) {
      fail(
        `IAC4 内容源路径「${p}」没有 src/ 前缀 —— 照着它建目录会建在仓库根下，` +
          `Eleventy 不采集那个位置 ⇒ 建了也没有页面。`
      );
      continue;
    }
    const { rel, isDir } = resolveContentPath(bare);
    if (!rel) continue;
    // rel 是**仓库根相对**的（src/content/...），而 SRC 指向 src/ 本身
    // ⇒ 去掉 src/ 前缀再拼，否则会拼成 src/src/content/... 恒判不存在。
    const abs = path.join(SRC, rel.replace(/^src\//, ""));
    if (!fs.existsSync(abs)) {
      fail(`IAC4 内容源路径「${p}」指向的${isDir ? "目录" : "文件"} ${rel} 在源码树里不存在。`);
      continue;
    }
    if (isDir && !fs.statSync(abs).isDirectory()) {
      fail(`IAC4 内容源路径「${p}」指向的 ${rel} 不是目录。`);
    }
  }

  /* --- IAC5：元数据字段必须与真源一致 --- */
  const blogCol = cols.find((c) => c.name === "blog");
  const papersCol = cols.find((c) => c.name === "papers");
  const guideFields = guideWritableFields();
  let fieldsChecked = 0;

  const blogSection = metaSectionOf(sections, "blog");
  if (!blogSection) {
    fail("IAC5 文档里找不到 Blog 的 front matter 小节（标题要提到 Blog、且带一个 yaml 代码块）。");
  } else {
    const keys = yamlKeysOf(blogSection);
    const allowed = new Set([...guideFields, ...(blogCol ? blogCol.injected : [])]);
    for (const k of keys) {
      fieldsChecked++;
      if (!allowed.has(k)) {
        fail(
          `IAC5 Blog 的 front matter 示例里有字段 ${k} —— 它既不是站内博客写作契约里列出的可写字段，` +
            `也不是集合自动注入的字段 ⇒ 写了不生效。`
        );
      }
    }
    for (const k of FORBIDDEN_IN_FRONTMATTER) {
      if (keys.has(k)) {
        fail(`IAC5 Blog 的 front matter 示例里写了 ${k} —— 写进去是**覆盖**自动注入的值，不是"更保险"。`);
      }
    }
  }

  const paperSection = metaSectionOf(sections, "papers");
  if (!paperSection) {
    fail("IAC5 文档里找不到 Paper 的 front matter 小节（标题要提到 Paper、且带一个 yaml 代码块）。");
  } else {
    const keys = yamlKeysOf(paperSection);
    const allowed = new Set([
      ...paperFrontMatterFields(),
      ...(papersCol ? papersCol.injected : []),
    ]);
    for (const k of keys) {
      fieldsChecked++;
      if (!allowed.has(k)) {
        fail(
          `IAC5 Paper 的 front matter 示例里有字段 ${k} —— 真实论文条目不读它，` +
            `（论文的标题 / 作者 / 期刊 / DOI 唯一真源是站点数据里的 publications 数组）⇒ 写了不生效。`
        );
      }
    }
  }

  for (const c of cols) {
    if (!c.family || isLive(c.family)) continue;
    const sec = metaSectionOf(sections, c.name);
    if (!sec) continue;
    if (!sec.lines.join("\n").includes("规划中")) {
      fail(
        `IAC5 ${c.name} 这个集合当前没有任何条目（也没有对应的列表页），` +
          `但它那一节没有明写「规划中」—— 会被当成已经能用的 schema。`
      );
    }
  }

  /* --- IAC6：已拍板的口径不得被推翻 --- */
  for (const d of DECIDED) {
    if (d.mustNot.test(docText)) {
      fail(`IAC6 文档里出现了与已拍板结论冲突的表述（${d.what}）—— 已拍板的口径不能被这份规划稿推翻。`);
    }
    if (!d.must.test(docText)) {
      fail(`IAC6 文档里没有写明已拍板结论（${d.what}）—— 规划稿必须把已定下来的口径记下来。`);
    }
  }

  /* --- IAC8 / IAC9 / IAC10：§四 的页面骨架必须与模板现实对得上 --- */
  const tplMap = pageTemplateMap();
  let anchorsChecked = 0;
  let pagesChecked = 0;
  for (const sec of sections) {
    const route = routeOfHeading(sec.heading);
    if (route === null) continue; // 这一小节不是在描述某个路由
    const tpl = tplMap.get(route);
    if (!tpl) {
      // 没有页面模板 ⇒ 这个路由未落地 ⇒ 这一小节必须明写「规划中」。
      if (!sec.lines.join("\n").includes("规划中")) {
        fail(`IAC10 文档「${route}」这一节当前没有对应的页面模板，却没有明写「规划中」—— 会被当成已经能用的页面骨架。`);
      }
      continue;
    }
    pagesChecked++;
    const derived = blockAnchorsOf(tpl);
    /* 锚点计数记的是**真源派生出来多少**，不是文档写了多少 ——
       文档少写由 IAC9 判红；这个计数只保证「真源确实有这么多区块可核对」。 */
    anchorsChecked += derived.length;
    const { found, anchors } = anchorAnchorsOf(sec);
    if (!found) {
      fail(`IAC9 文档「${route}」这一节没有「区块锚点」行 —— 已实现的页面必须写出它的区块锚点，否则这份文档对页面结构没有任何可核对的承诺。`);
      continue;
    }
    const ghost = anchors.filter((a) => !derived.includes(a));
    if (ghost.length) {
      fail(`IAC8 文档「${route}」这一节的区块锚点里写了 ${ghost.join("、")} —— 模板里没有这些区块。`);
    }
    const missing = derived.filter((a) => !anchors.includes(a));
    if (missing.length) {
      fail(`IAC9 文档「${route}」这一节没有列出 ${missing.join("、")} —— 模板里真实存在的区块必须逐个列出来。`);
    }
  }

  /* --- IAC7：覆盖度自证 --- */
  const short = [];
  if (paths.length < MIN_PATHS) short.push(`扫到的站内路径 ${paths.length} 个 < ${MIN_PATHS}`);
  if (listEntries.length < MIN_LIST_ENTRIES) {
    short.push(`『落地状态』表条目 ${listEntries.length} 条 < ${MIN_LIST_ENTRIES}`);
  }
  if (fieldsChecked < MIN_FIELDS) short.push(`核对过的元数据字段 ${fieldsChecked} 个 < ${MIN_FIELDS}`);
  if (docLines.length < MIN_DOC_LINES) short.push(`文档行数 ${docLines.length} < ${MIN_DOC_LINES}`);
  if (pagesChecked < MIN_SKELETON_PAGES) {
    short.push(`核对过的页面骨架小节 ${pagesChecked} 个 < ${MIN_SKELETON_PAGES}`);
  }
  if (anchorsChecked < MIN_BLOCK_ANCHORS) {
    short.push(`已实现页面的区块锚点 ${anchorsChecked} 个 < ${MIN_BLOCK_ANCHORS}`);
  }
  if (short.length) fail(`IAC7 覆盖度自证不足：${short.join("；")}`);

  if (problems.length) {
    console.log("信息架构契约门禁未通过：");
    for (const p of problems) console.log(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(
    `信息架构契约门禁通过（站内路径 ${paths.length} 条 · 内容源路径 ${contentPaths.length} 条 · ` +
      `『落地状态』表 ${listEntries.length} 条 · 导航 ${navHrefs.length} 项 · 元数据字段 ${fieldsChecked} 个 · ` +
      `页面骨架 ${pagesChecked} 个 · 页面区块锚点 ${anchorsChecked} 个 · ` +
      `已实现集合家族 ${implementedFamilies.length} 个）`
  );
}

main();
