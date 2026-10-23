#!/usr/bin/env node
/**
 * 信息架构契约门禁 · 自测（四件套）。
 *
 * 四件套是什么：
 *   一、红因归属表 —— 门禁的每一条红因都必须能**唯一**归到一条判据；
 *      判据集合必须恰好是静态清单里的那几条。
 *   二、覆盖度自证 —— 门禁源码里的 fail() 调用点逐个唯一归属、条数与归属表相等、
 *      判据集合与静态清单相等；门禁源码里的判据编号前缀只允许自己的 IAC
 *      （以及一位的 D 缺陷台账号），且 IAC 前缀全仓唯一。
 *   三、注入档 —— 每造一个坏夹具，门禁必须**自己**判红，且判据集合**恰为**预期。
 *      夹具全部是**合成式**的（路径名、集合名、字段名与真实仓库完全不同），
 *      以此证明门禁读的是真源，不是把真仓库的名字写死。
 *   四、判据级负对照 —— 把门禁源码复制到临时目录，同行替换卸掉某条判据，
 *      对应夹具必须转绿；断言「行数不变」「差异行数 == 该判据的 fail() 数」
 *      「原件 sha256 前后一致」。
 *      ⚠️ **不给生产门禁加可卸开关** —— 加了开关就等于在门禁里留后门；
 *      负对照一律在副本上做。
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-information-architecture.cjs");

/* ========== 一、红因归属表：判据 → 唯一文案片段 ========== */

const CAUSES = [
  { id: "IAC1a", crit: "IAC1", frag: "既不真实存在、也没在『落地状态』表里被点名" },
  { id: "IAC2a", crit: "IAC2", frag: "找不到『落地状态』表" },
  { id: "IAC2b", crit: "IAC2", frag: "点名了根路径" },
  { id: "IAC2c", crit: "IAC2", frag: "当前已经真实存在" },
  { id: "IAC3a", crit: "IAC3", frag: "读不到真源" },
  { id: "IAC3b", crit: "IAC3", frag: "找不到导航表" },
  { id: "IAC3c", crit: "IAC3", frag: "个入口，真源 nav 数组有" },
  { id: "IAC3d", crit: "IAC3", frag: "在文档的导航表里没有" },
  { id: "IAC3e", crit: "IAC3", frag: "在真源 nav 数组里没有" },
  { id: "IAC4a", crit: "IAC4", frag: "没有 src/ 前缀" },
  { id: "IAC4b", crit: "IAC4", frag: "在源码树里不存在" },
  { id: "IAC4c", crit: "IAC4", frag: "不是目录" },
  { id: "IAC5a", crit: "IAC5", frag: "找不到 Blog 的 front matter 小节" },
  { id: "IAC5b", crit: "IAC5", frag: "既不是站内博客写作契约里列出的可写字段" },
  { id: "IAC5c", crit: "IAC5", frag: "写进去是**覆盖**自动注入的值" },
  { id: "IAC5d", crit: "IAC5", frag: "找不到 Paper 的 front matter 小节" },
  { id: "IAC5e", crit: "IAC5", frag: "真实论文条目不读它" },
  { id: "IAC5f", crit: "IAC5", frag: "这个集合当前没有任何条目" },
  { id: "IAC6a", crit: "IAC6", frag: "与已拍板结论冲突的表述" },
  { id: "IAC6b", crit: "IAC6", frag: "没有写明已拍板结论" },
  { id: "IAC7a", crit: "IAC7", frag: "覆盖度自证不足" },
  { id: "IAC8a", crit: "IAC8", frag: "模板里没有这些区块" },
  { id: "IAC9a", crit: "IAC9", frag: "没有「区块锚点」行" },
  { id: "IAC9b", crit: "IAC9", frag: "没有列出" },
  { id: "IAC10a", crit: "IAC10", frag: "却没有明写「规划中」" },
  { id: "IAC11a", crit: "IAC11", frag: "该集合的 layout 里没有这些区块" },
  { id: "IAC12a", crit: "IAC12", frag: "这一节没有写出区块锚点声明" },
  { id: "IAC12b", crit: "IAC12", frag: "这一节漏列了" },
  { id: "IAC13a", crit: "IAC13", frag: "解析不到真实的集合与 layout" },
  { id: "IAC14a", crit: "IAC14", frag: "但文档里没有为它写一节详情页骨架" },
];
/** 静态判据清单（门禁里应当且仅应当有这些判据）。 */
const CRITERIA = [
  "IAC1", "IAC2", "IAC3", "IAC4", "IAC5", "IAC6", "IAC7",
  "IAC8", "IAC9", "IAC10", "IAC11", "IAC12", "IAC13", "IAC14",
];

/* ========== 工具 ========== */

/** 扫出源码里所有 fail() 调用点（单行/多行、模板字面量/引号都吃）。 */
const FAIL_RE = /(?<![.\w$])fail\s*\(\s*(?:`([^`]*)`|"([^"]*)"|'([^']*)')/g;
function scanFailCalls(src) {
  const out = [];
  for (const m of src.matchAll(FAIL_RE)) {
    const literal = m[1] ?? m[2] ?? m[3] ?? "";
    out.push({
      index: m.index,
      literal,
      crit: (literal.match(/^\s*(IAC\d+)\b/) || [])[1] || "",
    });
  }
  return out;
}

/** 门禁输出里每条红因起头都是 "  ✗ "。 */
function causeHeads(out) {
  return out.split("\n").filter((l) => /^\s*✗\s/.test(l));
}

/** 归属：每条红因必须**恰好**被一条归属认领；返回判据集合。 */
function attribute(out) {
  const rows = causeHeads(out).map((line) => ({
    line,
    owners: CAUSES.filter((c) => line.includes(c.frag)),
  }));
  const impure = rows.find((r) => r.owners.length !== 1) || null;
  const crits = [
    ...new Set(rows.filter((r) => r.owners.length === 1).map((r) => r.owners[0].crit)),
  ].sort();
  return { rows, crits, impure };
}

function replaceOnce(text, from, to) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error(`注入锚点出现 ${n} 次（应恰好 1 次）：「${from.slice(0, 40)}…」`);
  return text.replace(from, to);
}

/* ========== 夹具（合成式：路径名 / 集合名 / 字段名都与真实仓库完全不同） ========== */

/** 合成文档：行数组（用单引号字符串，代码块里的反引号不需要转义）。
 *  刻意压得比门禁的文档行数门槛（120 行）**短一点** —— 缩档用例删掉填充行之后
 *  必须掉到门槛以下，否则那档根本不会判红。 */
const DOC_LINES = [
  "# 合成信息架构文档",
  "",
  "> 合成夹具：这里的路径、集合名、字段名都与真实仓库完全不同。",
  "",
  "## 落地状态",
  "",
  "| 未落地路径 | 规划意图 | 当前现状 |",
  "|---|---|---|",
  "| `/fx-works/` | 作品集整族 | 集合 0 条内容，也没有列表页 |",
  "| `/fx-tags/` | 标签索引页 | 没有该路由 |",
  "| `/fx-search/` | 站内检索 | 没有该路由 |",
  "| `/fx-cv/` | 关于页的 CV 链接 | 没有产物 |",
  "| `/fx-cv.pdf` | CV 编译产物 | 未生成 |",
  "| `/fx-admin/` | 后台入口 | 后台形态已拍板，但尚未接入 |",
  "| `/fx-plan` | 规划路径族（逐条列在 §一） | 整族未实现 |",
  "",
  "## 一、设计目标与边界",
  "",
  "1. **全站英文**（中文版不做）",
  "",
  "边界：不做用户登录与评论；内容后台形态已拍板为 **Decap CMS**，**尚未接入**；站内检索：**规划中**。",
  "",
  "规划中的路径族（整族被上表里的 `/fx-plan` 点名）：`/fx-plan-1/`、`/fx-plan-2/`、`/fx-plan-3/`、`/fx-plan-4/`、`/fx-plan-5/`、`/fx-plan-6/`、`/fx-plan-7/`、`/fx-plan-8/`。",
  "",
  "## 二、导航层级",
  "",
  "| 序号 | 标签 | 路径 | 性质 |",
  "|---|---|---|---|",
  "| 1 | Home | `/` | 门面 |",
  "| 2 | Papers | `/papers/` | 学术 |",
  "| 3 | Blog | `/blog/` | 长文 |",
  "| 4 | About | `/about/` | 介绍 |",
  "",
  "## 三、各页面骨架",
  "",
  "### 3.1 `/`",
  "区块锚点：`partials/fx-hero.njk` · `.fx-intro` · `#fx-home-focus-title`",
  "### 3.2 `/blog/`",
  "区块锚点：`.fx-blog__head` · `.fx-blog__list`",
  "### 3.3 `/papers/`",
  "区块锚点：`.fx-papers__head` · `partials/fx-pubs.njk`",
  "### 3.4 `/about/`",
  "区块锚点：`.fx-about__head` · `#fx-about-edu-title`",
  "### 3.5 `/fx-works/`",
  "**规划中** —— 合成作品集整族尚未落地。",
  "### 3.6 `/blog/{slug}/`",
  "区块锚点：`.fx-note__head` · `.fx-note__body` · `.fx-note__back`",
  "### 3.7 `/papers/{slug}/`",
  "区块锚点：`.fx-paper__head` · `.fx-paper__body` · `.fx-paper__cite`",
  "",
  "## 四、URL / 命名规范",
  "",
  "| 类型 | 规则 | 示例 |",
  "|---|---|---|",
  "| 论文 | `/papers/{slug}/` | `demo-paper` |",
  "| 博客 | `/blog/{slug}/` | `demo-note` |",
  "| 静态资源 | `/assets/{path}` | `assets/app.css` |",
  "| 错误页 | `/404.html` | — |",
  "",
  "文件名规范：",
  "",
  "- 博客：`src/content/blog/{slug}/index.md` + 可选 `src/content/blog/{slug}/cover.svg`",
  "- 论文：`src/content/papers/{slug}/paper.md` + 可选 `src/content/papers/{slug}/annotations.json`",
  "- 单页：`src/content/about.md`",
  "",
  "## 五、内容元数据 Schema",
  "",
  "### 5.1 Blog Front Matter",
  "",
  "```yaml",
  "---",
  "title: A synthetic note about synthetic rainfall",
  "date: 2026-01-02",
  "excerpt: One synthetic sentence for the synthetic card.",
  "readingTime: 5",
  "tags: [synthetic, rainfall]",
  "cover: cover.svg",
  "---",
  "```",
  "",
  "### 5.2 Portfolio Front Matter",
  "",
  "**规划中** —— 作品集整族尚未落地，下面这份 schema 只是设计意图。",
  "",
  "```yaml",
  "---",
  "title: A synthetic project",
  "type: tool",
  "---",
  "```",
  "",
  "### 5.3 Paper Front Matter",
  "",
  "```yaml",
  "---",
  "pubKey: demo-key",
  "date: 2026-02-03",
  "description: A synthetic abstract line for metadata.",
  "summary: A synthetic one-line summary for the list card.",
  "tags: [synthetic]",
  "---",
  "```",
  "",
  "## 六、与静态生成的衔接",
  "",
  "| 来源 | 工具 | 输出 |",
  "|---|---|---|",
  "| `src/content/blog/**` | Eleventy | `/blog/...` |",
  "| `src/content/papers/**` | Eleventy | `/papers/...` |",
  "| `src/content/about.md` | Eleventy | `/about/` |",
  "| RSS、sitemap | Eleventy | `/feed.xml`、`/sitemap.xml` |",
];

/** 填充行：给覆盖度门槛留余量，缩档用例整段删掉它。
 *  首尾两行由数组自己算出来，不写死编号 —— 改了条数也不会对不上。 */
const FILLER_COUNT = 18;
const FILLER_LINES = [];
for (let i = 1; i <= FILLER_COUNT; i++) {
  FILLER_LINES.push(`合成填充行 ${String(i).padStart(2, "0")}`);
}
const FILLER_START = FILLER_LINES[0];
const FILLER_END = FILLER_LINES[FILLER_LINES.length - 1];

const DOC_BASE = [...DOC_LINES.slice(0, DOC_LINES.length - 1), ...FILLER_LINES, ""].join("\n");

/** 合成真源：站点数据（导航数组）。 */
const FIX_SITE_JS = [
  "module.exports = {",
  "  nav: [",
  '    { label: "Home", href: "/" },',
  '    { label: "Papers", href: "/papers/" },',
  '    { label: "Blog", href: "/blog/" },',
  '    { label: "About", href: "/about/" },',
  "  ],",
  "};",
  "",
].join("\n");

/** 合成真源：站内博客写作契约的可写字段表。 */
const FIX_GUIDE = [
  "# 合成站内博客写作契约",
  "",
  "## 2. 可写字段",
  "",
  "| 字段 | 必需 | 类型 | 模板怎么用 | 写错会怎样 |",
  "|---|---|---|---|---|",
  "| `title` | **是** | 字符串 | 卡片标题 | 缺失 → 无名 |",
  "| `date` | **是** | `YYYY-MM-DD` | 日期 | 缺失 → 空 |",
  "| `excerpt` | 建议 | 字符串 | 卡片摘要 | 缺失 → 无摘要 |",
  "| `readingTime` | 建议 | 纯数字 | 阅读时长 | 非数字 → 坏 |",
  "| `tags` | 可选 | 字符串数组 | 主题标签 | 见下 |",
  "| `cover` | 可选 | 文件名 | 封面 | 见下 |",
  "",
].join("\n");

/** 合成真源：站点源码树（模板 / 内容 / 集合数据文件）。 */
const FIX_FILES = {
  "src/index.njk": [
    "---",
    "layout: layouts/base.njk",
    "---",
    '<article class="fx-home">',
    '  {% include "partials/fx-hero.njk" %}',
    '  <section class="fx-intro">',
    "    <p>合成介绍段。</p>",
    "  </section>",
    '  <h2 id="fx-home-focus-title">合成焦点标题</h2>',
    "</article>",
    "",
  ].join("\n"),
  "src/about.njk": [
    "---",
    "layout: layouts/base.njk",
    "---",
    '<article class="fx-about">',
    '  <header class="fx-about__head">',
    "    <h1>合成关于页</h1>",
    "  </header>",
    '  <section aria-labelledby="fx-about-edu-title">',
    '    <h2 id="fx-about-edu-title">合成教育经历</h2>',
    "  </section>",
    "</article>",
    "",
  ].join("\n"),
  "src/blog.njk": [
    "---",
    'permalink: "/blog/"',
    "---",
    '<article class="fx-blog">',
    '  <header class="fx-blog__head">',
    "    <h1>合成随笔列表</h1>",
    "  </header>",
    '  <ul class="fx-blog__list">',
    '    <li class="fx-blog__item">合成条目</li>',
    "  </ul>",
    "</article>",
    "",
  ].join("\n"),
  "src/papers.njk": [
    "---",
    'permalink: "/papers/"',
    "---",
    '<article class="fx-papers">',
    '  <header class="fx-papers__head">',
    "    <h1>合成论文列表</h1>",
    "  </header>",
    '  {% include "partials/fx-pubs.njk" %}',
    "</article>",
    "",
  ].join("\n"),
  "src/feed.njk": ["---", "permalink: \"/feed.xml\"", "---", "", "合成订阅源。", ""].join("\n"),
  "src/sitemap.njk": ["---", "permalink: \"/sitemap.xml\"", "---", "", "合成站点地图。", ""].join("\n"),
  "src/404.njk": ["---", "permalink: /404.html", "---", "", "合成错误页。", ""].join("\n"),
  "src/_includes/partials/fx-hero.njk": [
    '<section class="fx-hero">',
    "  <h1>合成首页英雄区</h1>",
    "</section>",
    "",
  ].join("\n"),
  "src/_includes/partials/fx-pubs.njk": [
    '<ul class="fx-pubs">',
    '  <li class="fx-pubs__item">合成论文条目</li>',
    "</ul>",
    "",
  ].join("\n"),
  /* 集合条目的详情页模板（IAC11–IAC14 的真源）。
   *  detail.njk：页面容器就是最外层的 <article>。
   *  paper.njk：外面套一层只做栅格的 <div>，真正的容器是里层的 <article>
   *            —— 用来验证「页面容器 = 最外层语义容器」这条派生规则。 */
  "src/_includes/layouts/detail.njk": [
    '<article class="fx-note">',
    '  <header class="fx-note__head">',
    "    <h1>合成随笔详情</h1>",
    "  </header>",
    '  <div class="fx-note__body">',
    "    <p>合成正文。</p>",
    "  </div>",
    '  <nav class="fx-note__back">',
    '    <a href="/blog/">返回列表</a>',
    "  </nav>",
    "</article>",
    "",
  ].join("\n"),
  "src/_includes/layouts/paper.njk": [
    '<div class="fx-reader">',
    '  <article class="fx-paper">',
    '    <header class="fx-paper__head">',
    "      <h1>合成论文详情</h1>",
    "    </header>",
    '    <section class="fx-paper__body">',
    "      <p>合成论文正文。</p>",
    "    </section>",
    '    <footer class="fx-paper__cite">',
    "      <p>合成引用块。</p>",
    "    </footer>",
    "  </article>",
    "</div>",
    "",
  ].join("\n"),
  "src/assets/app.css": ["/* 合成静态资源 */", ".fx { color: #333; }", ""].join("\n"),
  "src/_data/site.js": FIX_SITE_JS,
  "src/content/about.md": ["---", "title: Synthetic about", "---", "", "合成单页。", ""].join("\n"),
  "src/content/blog/blog.11tydata.cjs": [
    "module.exports = {",
    '  layout: "layouts/detail.njk",',
    "  permalink: (data) => `/blog/${getSlug(data)}/`,",
    '  tags: ["blog"],',
    "  eleventyComputed: {",
    "    prev: (data) => null,",
    "    next: (data) => null,",
    "  },",
    "};",
    "",
  ].join("\n"),
  "src/content/papers/papers.11tydata.cjs": [
    "module.exports = {",
    '  layout: "layouts/paper.njk",',
    "  permalink: (data) => `/papers/${getSlug(data)}/`,",
    "  eleventyComputed: {",
    "    slug: (data) => getSlug(data),",
    "  },",
    '  tags: ["papers"],',
    "};",
    "",
  ].join("\n"),
  "src/content/papers/demo-paper/paper.md": [
    "---",
    "pubKey: demo-key",
    "date: 2026-02-03",
    "description: A synthetic abstract line for metadata.",
    "summary: A synthetic one-line summary for the list card.",
    "---",
    "",
    "合成论文正文。",
    "",
  ].join("\n"),
  "src/content/portfolio/portfolio.11tydata.cjs": [
    "module.exports = {",
    '  layout: "layouts/detail.njk",',
    "  permalink: (data) => `/portfolio/${getSlug(data)}/`,",
    '  tags: ["portfolio"],',
    "  eleventyComputed: {",
    "    prev: (data) => null,",
    "    next: (data) => null,",
    "  },",
    "};",
    "",
  ].join("\n"),
};

/* ========== 夹具装配 ========== */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mh-ia-selftest-"));

/** 建一个独立夹具（临时目录 + 合成文档 + 合成源码树 + 合成真源）。 */
function buildFixture(mutate) {
  const state = { doc: DOC_BASE, omit: new Set() };
  if (mutate) mutate(state);
  const dir = fs.mkdtempSync(path.join(tmp, "case-"));
  fs.mkdirSync(path.join(dir, "docs"), { recursive: true });
  const omitted = (rel) => {
    for (const o of state.omit) {
      if (rel === o || rel.startsWith(o + "/")) return true;
    }
    return false;
  };
  for (const [rel, content] of Object.entries(FIX_FILES)) {
    if (omitted(rel)) continue;
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  fs.writeFileSync(path.join(dir, "docs", "blog-writing-guide.md"), FIX_GUIDE);
  fs.writeFileSync(path.join(dir, "docs", "information-architecture.md"), state.doc);
  return dir;
}

/** 跑一次门禁（夹具通过 IAC_DOC / IAC_SRC / IAC_SITE_DATA / IAC_GUIDE 注入）。 */
function runGate(gatePath, fixtureDir) {
  const env = {
    ...process.env,
    IAC_DOC: path.join(fixtureDir, "docs", "information-architecture.md"),
    IAC_SRC: path.join(fixtureDir, "src"),
    IAC_SITE_DATA: path.join(fixtureDir, "src", "_data", "site.js"),
    IAC_GUIDE: path.join(fixtureDir, "docs", "blog-writing-guide.md"),
  };
  const r = spawnSync(process.execPath, [gatePath], { env, encoding: "utf8", cwd: ROOT });
  return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
}

/* ========== 注入档 ========== */

const MUT = {
  /** 文档里多一条既没实现、也没被点名的路径 ⇒ IAC1。 */
  docUnlistedPath: (s) => {
    s.doc = replaceOnce(
      s.doc,
      "## 一、设计目标与边界",
      "另有一条从未被点名的路径 `/fx-never/`。\n\n## 一、设计目标与边界"
    );
  },
  /** 『落地状态』表里点名了一条**已经存在**的路径 ⇒ IAC2（表过期）。 */
  docStaleListEntry: (s) => {
    s.doc = replaceOnce(
      s.doc,
      "| `/fx-works/` | 作品集整族 | 集合 0 条内容，也没有列表页 |",
      "| `/fx-works/` | 作品集整族 | 集合 0 条内容，也没有列表页 |\n| `/blog/` | 早已落地却仍留在表里 | 过期条目 |"
    );
  },
  /** 导航表多出一行（路径取一条真实路由，免得顺带触发 IAC1）⇒ IAC3。 */
  docExtraNavRow: (s) => {
    s.doc = replaceOnce(
      s.doc,
      "| 4 | About | `/about/` | 介绍 |",
      "| 4 | About | `/about/` | 介绍 |\n| 5 | Feed | `/feed.xml` | 附属 |"
    );
  },
  /** 内容源路径没有 src/ 前缀 ⇒ IAC4。
   *  锚点取「§四 文件名规范」那一整行（`src/content/about.md` 在文档里出现两次：
   *  §四 与 §七；只动 §四 那一次，§七 保持合法 ⇒ 恰好触发一条 IAC4）。 */
  docContentPathNoSrc: (s) => {
    s.doc = replaceOnce(
      s.doc,
      "- 单页：`src/content/about.md`",
      "- 单页：`content/about.md`"
    );
  },
  /** 内容源路径指向不存在的目录 ⇒ IAC4。 */
  docContentPathMissing: (s) => {
    s.doc = replaceOnce(
      s.doc,
      "- 单页：`src/content/about.md`",
      "- 单页：`src/content/nope.md`"
    );
  },
  /** Blog front matter 多一个不生效的字段 ⇒ IAC5。 */
  docBlogYamlSlug: (s) => {
    s.doc = replaceOnce(s.doc, "title: A synthetic note about synthetic rainfall", "slug: demo-note\ntitle: A synthetic note about synthetic rainfall");
  },
  /** Paper front matter 多一个不生效的字段 ⇒ IAC5。 */
  docPaperYamlDoi: (s) => {
    s.doc = replaceOnce(s.doc, "pubKey: demo-key", "pubKey: demo-key\ndoi: 10.0000/synthetic");
  },
  /** 作品集那一节不写「规划中」⇒ IAC5。 */
  docPortfolioNotPlanned: (s) => {
    s.doc = replaceOnce(
      s.doc,
      "**规划中** —— 作品集整族尚未落地，下面这份 schema 只是设计意图。",
      "作品集整族尚未落地，下面这份 schema 只是设计意图。"
    );
  },
  /** 复述被推翻的语言口径 ⇒ IAC6。 */
  docChinesePrimary: (s) => {
    s.doc = replaceOnce(
      s.doc,
      "站内检索：**规划中**。",
      "站内检索：**规划中**。旧口径写着中文为主要语言。"
    );
  },
  /** 不写明已拍板的语言口径 ⇒ IAC6。 */
  docDropEnglish: (s) => {
    s.doc = replaceOnce(s.doc, "1. **全站英文**（中文版不做）", "1. 英文为主");
  },
  /** 文档被删到覆盖度门槛以下（只删填充行，路径与字段不动）⇒ IAC7。 */
  docShrink: (s) => {
    const lines = s.doc.split("\n");
    const a = lines.indexOf(FILLER_START);
    const b = lines.indexOf(FILLER_END);
    if (a < 0 || b < 0) throw new Error("填充行锚点不见了");
    s.doc = lines.slice(0, a).concat(lines.slice(b + 1)).join("\n");
  },
  /** 静态资源目录不在了 ⇒ /assets/ 不再是真实路径 ⇒ IAC1。 */
  srcNoAssets: (s) => {
    s.omit.add("src/assets");
  },
  /** 『落地状态』表头改名 ⇒ 门禁看不见这张表 ⇒ IAC2（找不到表）＋IAC1（表里点名的路径全部失去豁免）＋IAC7（清单条目数归零）。 */
  docListHeaderRenamed: (s) => {
    s.doc = replaceOnce(
      s.doc,
      "| 未落地路径 | 规划意图 | 当前现状 |",
      "| 还没做的路径 | 规划意图 | 当前现状 |"
    );
  },
  /** 『落地状态』表里点名根路径 ⇒ IAC2（点名根路径等于豁免全站）。 */
  docListRootPath: (s) => {
    s.doc = replaceOnce(
      s.doc,
      "| `/fx-works/` | 作品集整族 | 集合 0 条内容，也没有列表页 |",
      "| `/fx-works/` | 作品集整族 | 集合 0 条内容，也没有列表页 |\n| `/` | 根路径 | 占位 |"
    );
  },
  /** 导航表表头改名 ⇒ 门禁找不到导航表 ⇒ IAC3。 */
  docNavHeaderRenamed: (s) => {
    s.doc = replaceOnce(
      s.doc,
      "| 序号 | 标签 | 路径 | 性质 |",
      "| 序号 | 标签 | 入口 | 性质 |"
    );
  },
  /** 导航表里有一个入口换成了另一个 ⇒ 真源里有、文档表里没有 ⇒ IAC3。 */
  docNavHrefSwapped: (s) => {
    s.doc = replaceOnce(
      s.doc,
      "| 4 | About | `/about/` | 介绍 |",
      "| 4 | Feed | `/feed.xml` | 介绍 |"
    );
  },
  /** 真源 site.js 读不到 ⇒ IAC3（读不到真源 + 两边对不上）。 */
  srcNoSiteData: (s) => {
    s.omit.add("src/_data/site.js");
  },
  /** 内容源路径指向的是**文件**却按目录用 ⇒ IAC4（不是目录）。 */
  docContentPathIsFile: (s) => {
    s.doc = replaceOnce(
      s.doc,
      "- 单页：`src/content/about.md`",
      "- 单页：`src/content/about.md/**`"
    );
  },
  /** Blog 的 front matter 小节整个不见了 ⇒ IAC5（找不到 Blog 小节）。
   *  顺带给 Paper 的示例补一个**合法**字段（slug 是集合自动注入的），
   *  把核对过的字段数维持在门槛之上 ⇒ 这一档只红 IAC5，不连带 IAC7。 */
  docBlogSectionMissing: (s) => {
    s.doc = replaceOnce(
      s.doc,
      "### 5.1 Blog Front Matter",
      "### 5.1 合成随笔 Front Matter"
    );
    s.doc = replaceOnce(s.doc, "pubKey: demo-key", "pubKey: demo-key\nslug: demo-paper");
  },
  /** Blog 的 front matter 里写了 layout ⇒ IAC5（覆盖自动注入的字段）。 */
  docBlogYamlLayout: (s) => {
    s.doc = replaceOnce(
      s.doc,
      "cover: cover.svg",
      "cover: cover.svg\nlayout: layouts/detail.njk"
    );
  },
  /** Paper 的 front matter 小节整个不见了 ⇒ IAC5（找不到 Paper 小节）。 */
  docPaperSectionMissing: (s) => {
    s.doc = replaceOnce(
      s.doc,
      "### 5.3 Paper Front Matter",
      "### 5.3 合成论文 Front Matter"
    );
  },
  /** 已实现的小节多写一个模板里根本不存在的区块 ⇒ IAC8。 */
  docGhostAnchor: (s) => {
    s.doc = replaceOnce(
      s.doc,
      "区块锚点：`partials/fx-hero.njk` · `.fx-intro` · `#fx-home-focus-title`",
      "区块锚点：`partials/fx-hero.njk` · `.fx-intro` · `#fx-home-focus-title` · `.fx-ghost`"
    );
  },
  /** 已实现的小节整行没有「区块锚点」⇒ IAC9（缺行这一路）。 */
  docNoAnchorLine: (s) => {
    s.doc = replaceOnce(
      s.doc,
      "### 3.2 `/blog/`\n区块锚点：`.fx-blog__head` · `.fx-blog__list`\n",
      "### 3.2 `/blog/`\n"
    );
  },
  /** 已实现的小节漏列一个模板里真实存在的区块 ⇒ IAC9（漏列这一路）。 */
  docMissingAnchor: (s) => {
    s.doc = replaceOnce(
      s.doc,
      "区块锚点：`partials/fx-hero.njk` · `.fx-intro` · `#fx-home-focus-title`",
      "区块锚点：`partials/fx-hero.njk` · `#fx-home-focus-title`"
    );
  },
  /** 还没落地的小节不写「规划中」⇒ IAC10。 */
  docPlannedMissing: (s) => {
    s.doc = replaceOnce(
      s.doc,
      "**规划中** —— 合成作品集整族尚未落地。",
      "合成作品集整族尚未落地。"
    );
  },
  /** 详情页小节写了一个 layout 里不存在的区块 ⇒ IAC11。 */
  docGhostDetailAnchor: (s) => {
    s.doc = replaceOnce(
      s.doc,
      "区块锚点：`.fx-paper__head` · `.fx-paper__body` · `.fx-paper__cite`",
      "区块锚点：`.fx-paper__head` · `.fx-paper__body` · `.fx-paper__cite` · `.fx-paper__ghost`"
    );
  },
  /** 详情页小节漏列了 layout 里真实存在的区块 ⇒ IAC12（漏列这一路）。 */
  docMissingDetailAnchor: (s) => {
    s.doc = replaceOnce(
      s.doc,
      "区块锚点：`.fx-paper__head` · `.fx-paper__body` · `.fx-paper__cite`",
      "区块锚点：`.fx-paper__head` · `.fx-paper__cite`"
    );
  },
  /** 详情页小节整行没有「区块锚点」⇒ IAC12（缺声明行这一路）。 */
  docNoDetailAnchorLine: (s) => {
    s.doc = replaceOnce(
      s.doc,
      "### 3.7 `/papers/{slug}/`\n区块锚点：`.fx-paper__head` · `.fx-paper__body` · `.fx-paper__cite`\n",
      "### 3.7 `/papers/{slug}/`\n"
    );
  },
  /** 详情页路由解析不到集合与 layout ⇒ IAC13。
   *  顺带把 `/fx-nowhere/` 点名进『落地状态』表，免得顺带触发 IAC1
   *  （红因归属必须纯净：一档只红一条判据）。 */
  docUnresolvableDetailRoute: (s) => {
    s.doc = replaceOnce(
      s.doc,
      "| `/fx-plan` | 规划路径族（逐条列在 §一） | 整族未实现 |",
      "| `/fx-plan` | 规划路径族（逐条列在 §一） | 整族未实现 |\n| `/fx-nowhere/` | 合成未落地的详情页家族 | 没有对应的集合与 layout |"
    );
    s.doc = replaceOnce(
      s.doc,
      "### 3.7 `/papers/{slug}/`\n区块锚点：`.fx-paper__head` · `.fx-paper__body` · `.fx-paper__cite`\n",
      "### 3.7 `/papers/{slug}/`\n区块锚点：`.fx-paper__head` · `.fx-paper__body` · `.fx-paper__cite`\n### 3.8 `/fx-nowhere/{slug}/`\n"
    );
  },
  /** 有内容条目的集合没有详情页小节 ⇒ IAC14。 */
  docNoDetailSection: (s) => {
    s.doc = replaceOnce(
      s.doc,
      "### 3.7 `/papers/{slug}/`\n区块锚点：`.fx-paper__head` · `.fx-paper__body` · `.fx-paper__cite`\n",
      ""
    );
  },
};

/** 注入档：expect=null 表示期望判绿，否则期望判红且判据集合**恰为** expect。 */
const CASES = [
  { id: "IACR0", label: "基线（合成文档 + 合成源码树 + 合成真源）", mutate: null, expect: null },
  { id: "IACR1", label: "文档里多一条没被点名的路径", mutate: MUT.docUnlistedPath, expect: ["IAC1"] },
  { id: "IACR2", label: "『落地状态』表里点名了已存在的路径", mutate: MUT.docStaleListEntry, expect: ["IAC2"] },
  { id: "IACR3", label: "导航表多出一行", mutate: MUT.docExtraNavRow, expect: ["IAC3"] },
  { id: "IACR4", label: "内容源路径缺 src/ 前缀", mutate: MUT.docContentPathNoSrc, expect: ["IAC4"] },
  { id: "IACR5", label: "内容源路径指向不存在的目录", mutate: MUT.docContentPathMissing, expect: ["IAC4"] },
  { id: "IACR6", label: "Blog front matter 多一个不生效的字段", mutate: MUT.docBlogYamlSlug, expect: ["IAC5"] },
  { id: "IACR7", label: "Paper front matter 多一个不生效的字段", mutate: MUT.docPaperYamlDoi, expect: ["IAC5"] },
  { id: "IACR8", label: "作品集那节不写「规划中」", mutate: MUT.docPortfolioNotPlanned, expect: ["IAC5"] },
  { id: "IACR9", label: "复述被推翻的语言口径", mutate: MUT.docChinesePrimary, expect: ["IAC6"] },
  { id: "IACR10", label: "不写明已拍板的语言口径", mutate: MUT.docDropEnglish, expect: ["IAC6"] },
  { id: "IACR11", label: "文档被删到覆盖度门槛以下", mutate: MUT.docShrink, expect: ["IAC7"] },
  { id: "IACR12", label: "静态资源目录不在了", mutate: MUT.srcNoAssets, expect: ["IAC1"] },
  { id: "IACR13", label: "『落地状态』表头改名（门禁看不见这张表）", mutate: MUT.docListHeaderRenamed, expect: ["IAC1", "IAC2", "IAC7"] },
  { id: "IACR14", label: "『落地状态』表里点名了根路径", mutate: MUT.docListRootPath, expect: ["IAC2"] },
  { id: "IACR15", label: "导航表表头改名", mutate: MUT.docNavHeaderRenamed, expect: ["IAC3"] },
  { id: "IACR16", label: "真源 site.js 读不到", mutate: MUT.srcNoSiteData, expect: ["IAC3"] },
  { id: "IACR17", label: "内容源路径指向的是文件却按目录用", mutate: MUT.docContentPathIsFile, expect: ["IAC4"] },
  { id: "IACR18", label: "Blog 的 front matter 小节不见了", mutate: MUT.docBlogSectionMissing, expect: ["IAC5"] },
  { id: "IACR19", label: "Blog 的 front matter 里写了 layout", mutate: MUT.docBlogYamlLayout, expect: ["IAC5"] },
  { id: "IACR20", label: "Paper 的 front matter 小节不见了", mutate: MUT.docPaperSectionMissing, expect: ["IAC5"] },
  { id: "IACR21", label: "导航表里有一个入口被换成了另一个", mutate: MUT.docNavHrefSwapped, expect: ["IAC3"] },
  { id: "IACR22", label: "页面骨架多写一个模板里没有的区块", mutate: MUT.docGhostAnchor, expect: ["IAC8"] },
  { id: "IACR23", label: "页面骨架整行没有「区块锚点」", mutate: MUT.docNoAnchorLine, expect: ["IAC9"] },
  { id: "IACR24", label: "页面骨架漏列一个模板里真实存在的区块", mutate: MUT.docMissingAnchor, expect: ["IAC9"] },
  { id: "IACR25", label: "未落地的小节没写「规划中」", mutate: MUT.docPlannedMissing, expect: ["IAC10"] },
  { id: "IACR26", label: "详情页骨架多写一个 layout 里没有的区块", mutate: MUT.docGhostDetailAnchor, expect: ["IAC11"] },
  { id: "IACR27", label: "详情页骨架漏列一个 layout 里真实存在的区块", mutate: MUT.docMissingDetailAnchor, expect: ["IAC12"] },
  { id: "IACR28", label: "详情页骨架整行没有「区块锚点」", mutate: MUT.docNoDetailAnchorLine, expect: ["IAC12"] },
  { id: "IACR29", label: "详情页路由解析不到集合与 layout", mutate: MUT.docUnresolvableDetailRoute, expect: ["IAC13"] },
  { id: "IACR30", label: "有内容条目的集合没有详情页小节", mutate: MUT.docNoDetailSection, expect: ["IAC14"] },
];

/** 在门禁副本里卸掉某条判据：给它每一条 fail() 调用**同行**加 `if (false) ` 前缀。 */
function unloadCriterion(src, calls, crit) {
  const targets = calls.filter((c) => c.crit === crit);
  let out = src;
  for (const t of targets.slice().reverse()) {
    out = out.slice(0, t.index) + "if (false) " + out.slice(t.index);
  }
  return { src: out, count: targets.length };
}

/** 负对照档：卸掉某条判据后，对应夹具必须转绿。 */
const NEG_CASES = [
  { id: "NC-IAC1", crit: "IAC1", case: "IACR1", label: "卸掉 IAC1" },
  { id: "NC-IAC2", crit: "IAC2", case: "IACR2", label: "卸掉 IAC2" },
  { id: "NC-IAC3", crit: "IAC3", case: "IACR3", label: "卸掉 IAC3" },
  { id: "NC-IAC4", crit: "IAC4", case: "IACR4", label: "卸掉 IAC4" },
  { id: "NC-IAC5", crit: "IAC5", case: "IACR6", label: "卸掉 IAC5" },
  { id: "NC-IAC6", crit: "IAC6", case: "IACR9", label: "卸掉 IAC6" },
  { id: "NC-IAC7", crit: "IAC7", case: "IACR11", label: "卸掉 IAC7" },
  { id: "NC-IAC8", crit: "IAC8", case: "IACR22", label: "卸掉 IAC8" },
  { id: "NC-IAC9", crit: "IAC9", case: "IACR23", label: "卸掉 IAC9" },
  { id: "NC-IAC10", crit: "IAC10", case: "IACR25", label: "卸掉 IAC10" },
  { id: "NC-IAC11", crit: "IAC11", case: "IACR26", label: "卸掉 IAC11" },
  { id: "NC-IAC12", crit: "IAC12", case: "IACR27", label: "卸掉 IAC12" },
  { id: "NC-IAC13", crit: "IAC13", case: "IACR29", label: "卸掉 IAC13" },
  { id: "NC-IAC14", crit: "IAC14", case: "IACR30", label: "卸掉 IAC14" },
];

/* ========== 执行 ========== */

let failed = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => {
  console.log(`  ✗ ${msg}`);
  failed += 1;
};

const gateSrc = fs.readFileSync(GATE, "utf8");
const calls = scanFailCalls(gateSrc);
const seenCauses = new Set();
const seenCriteria = new Set();

/** 仓库真源（门禁 + 信息架构文档 + 真源数据 + 写作契约 + package.json）的整体指纹。 */
function repoDigest() {
  const h = crypto.createHash("sha256");
  const paths = [
    GATE,
    path.join(ROOT, "docs", "information-architecture.md"),
    path.join(ROOT, "src", "_data", "site.js"),
    path.join(ROOT, "docs", "blog-writing-guide.md"),
    path.join(ROOT, "package.json"),
  ];
  for (const p of paths) h.update(p).update(fs.existsSync(p) ? fs.readFileSync(p) : "<missing>");
  return h.digest("hex");
}
const REAL_DIGEST = repoDigest();

/** 跑一档注入并核对：判红/判绿、门禁确实跑到自己的结论、归属纯净、判据集合恰为。 */
function checkCase(spec, fixtureDir, gatePath) {
  const r = runGate(gatePath, fixtureDir);
  const a = attribute(r.out);
  if (a.impure) {
    bad(
      `${spec.id} ${spec.label} → 有红因无法唯一归类（匹配到 ${a.impure.owners.length} 条归属）：` +
        `${a.impure.line.trim().slice(0, 90)}`
    );
    return;
  }
  if (spec.expect === null) {
    if (r.code !== 0 || !r.out.includes("信息架构契约门禁通过")) {
      bad(`${spec.id} ${spec.label} → 期望判绿（exit 0），实测 exit ${r.code}`);
      console.log(r.out.split("\n").filter((l) => l.includes("✗")).join("\n"));
      return;
    }
    if (a.rows.length !== 0) {
      bad(`${spec.id} ${spec.label} → 判绿但仍有 ${a.rows.length} 条红因`);
      return;
    }
    ok(`${spec.id} ${spec.label} → 判绿 exit 0，零红因`);
    return;
  }
  if (r.code !== 1 || !r.out.includes("信息架构契约门禁未通过")) {
    bad(
      `${spec.id} ${spec.label} → 期望门禁自己报红（exit 1），实测 exit ${r.code}` +
        `（非 1 说明门禁崩了，不是判红）`
    );
    console.log(r.out.split("\n").slice(0, 4).join("\n"));
    return;
  }
  if (a.crits.join(",") !== spec.expect.join(",")) {
    bad(
      `${spec.id} ${spec.label} → 判据集合应为恰为 {${spec.expect.join(", ")}}，` +
        `实测 {${a.crits.join(", ") || "空"}}`
    );
    console.log(a.rows.map((x) => x.line.trim().slice(0, 110)).join("\n"));
    return;
  }
  for (const row of a.rows) seenCauses.add(row.owners[0].id);
  for (const c of a.crits) seenCriteria.add(c);
  ok(
    `${spec.id} ${spec.label} → 判红 exit 1，判据集合恰为 {${a.crits.join(", ")}}，红因 ${a.rows.length} 条`
  );
}

console.log("信息架构契约门禁 · 自测（四件套）：\n");

/* ---- 一、红因归属表 ---- */
console.log("一、红因归属表");
{
  const bads = [];
  for (let a = 0; a < CAUSES.length; a++) {
    for (let b = 0; b < CAUSES.length; b++) {
      if (a !== b && CAUSES[a].frag.includes(CAUSES[b].frag)) bads.push(`${CAUSES[a].id}⊃${CAUSES[b].id}`);
    }
  }
  if (bads.length) bad(`文案片段互不包含：${bads.join("、")}`);
  else ok(`${CAUSES.length} 条红因归属登记（${CAUSES.map((c) => c.id).join(" / ")}），文案片段互不包含`);

  const orphan = CAUSES.filter((c) => !CRITERIA.includes(c.crit));
  if (orphan.length) bad(`归属里有不在静态清单里的判据：${orphan.map((c) => c.id).join("、")}`);
  else ok(`每条归属的判据都在静态清单 ${JSON.stringify(CRITERIA)} 内`);

  const noCause = CRITERIA.filter((c) => !CAUSES.some((x) => x.crit === c));
  if (noCause.length) bad(`静态清单里的判据没有红因归属：${noCause.join("、")}`);
  else ok("静态清单里的每条判据都至少有一条红因归属");
}

/* ---- 二、覆盖度自证 ---- */
console.log("\n二、覆盖度自证");
{
  const owners = calls.map((c) => CAUSES.filter((x) => c.literal.includes(x.frag)));
  const multi = owners.map((o, i) => ({ i, o })).filter((x) => x.o.length !== 1);
  if (multi.length) {
    bad(`有 ${multi.length} 个 fail() 调用点没能唯一归属：${multi.map((m) => m.i).join(", ")}`);
  } else {
    ok(`门禁的 ${calls.length} 个 fail() 调用点逐个唯一归属（双向对齐）`);
  }

  if (calls.length !== CAUSES.length) {
    bad(`门禁 fail() 调用点数 ${calls.length} != 归属表 ${CAUSES.length} 条`);
  } else {
    ok(`调用点数 ${calls.length} == 归属表条数 ${CAUSES.length}`);
  }
  const claimed = owners.map((o) => (o.length === 1 ? o[0].id : ""));
  const dup = claimed.filter((id) => id && claimed.filter((x) => x === id).length > 1);
  if (dup.length) bad(`有归属认领了多个调用点：${[...new Set(dup)].join("、")}`);
  else ok("每条归属恰好认领一个调用点（无遗漏、无多领）");

  const critSet = [...new Set(calls.map((c) => c.crit).filter(Boolean))].sort();
  if (critSet.join(",") !== [...CRITERIA].sort().join(",")) {
    bad(`门禁解析出的判据集合 {${critSet.join(", ")}} != 静态清单 {${CRITERIA.join(", ")}}`);
  } else {
    ok(`门禁解析出的判据集合 {${critSet.join(", ")}} == 静态清单`);
  }
  const critMismatch = calls.filter((c, i) => owners[i].length === 1 && owners[i][0].crit !== c.crit);
  if (critMismatch.length) bad(`有调用点解析出的判据号与归属登记不一致：${critMismatch.length} 处`);
  else ok("每个调用点解析出的判据号与归属登记一致");

  /* 门禁源码里的判据编号前缀：只允许自己的 IAC，以及一位的 D（缺陷台账号）。
     多字母前缀会把**别的门禁**的编号带进 README 的对账范围（RD6 按前缀逐个比较）。 */
  const critTokenRe = /(?<![A-Za-z0-9_-])([A-Z][A-Z-]{0,4})(\d{1,3})/g;
  const prefixes = [...new Set([...gateSrc.matchAll(critTokenRe)].map((m) => m[1]))];
  const foreign = prefixes.filter((p) => p !== "IAC" && !(p.length === 1 && p === "D"));
  if (foreign.length) {
    bad(
      `门禁源码里出现了别的门禁的判据编号前缀：${foreign.join("、")} —— ` +
        `会把别的门禁的编号带进 README 对账范围。`
    );
  } else {
    ok("门禁源码里的判据编号前缀只有 IAC（自己的）与 D（缺陷台账号，一位）");
  }

  /* IAC 前缀全仓唯一：否则 README 的 IAC 编号对账会同时算上别人的门禁。 */
  const scriptsDir = path.join(ROOT, "scripts");
  const iacOwners = new Set();
  for (const f of fs.readdirSync(scriptsDir)) {
    if (!/^(check|verify)-.*\.cjs$/.test(f)) continue;
    const t = fs.readFileSync(path.join(scriptsDir, f), "utf8");
    for (const m of t.matchAll(critTokenRe)) {
      if (m[1] === "IAC") iacOwners.add(f);
    }
  }
  const iacList = [...iacOwners].sort();
  if (iacList.length !== 1 || iacList[0] !== "check-information-architecture.cjs") {
    bad(`IAC 前缀不是全仓唯一：${iacList.join("、") || "（没有）"} —— 别人的门禁也用 IAC 会让 README 对账算错`);
  } else {
    /* 措辞说明：这一行**刻意用中文开头** —— 它是收尾自检行、不是编号档，
       而行首若是 ASCII 单词（这里是 IAC），档位守卫会要求它在静态清单里
       有出处（编号 / 锚点 / 显式非档位）。同块其余断言都是中文开头，
       这里保持一致，不去改共享静态清单。 */
    ok("判据前缀 IAC 全仓唯一（只有 check-information-architecture.cjs 在用）");
  }
}

/* ---- 三、注入档 ---- */
console.log("\n三、注入档");
const fixtures = {};
for (const spec of CASES) {
  let dir;
  try {
    dir = buildFixture(spec.mutate);
  } catch (e) {
    bad(`${spec.id} ${spec.label} → 注入本身坏了：${e.message}`);
    continue;
  }
  fixtures[spec.id] = dir;
  checkCase(spec, dir, GATE);
}

/* ---- 四、判据级负对照 ---- */
console.log("\n四、判据级负对照");
for (const neg of NEG_CASES) {
  const targets = calls.filter((c) => c.crit === neg.crit);
  if (targets.length === 0) {
    bad(`${neg.id} → 门禁里找不到判据 ${neg.crit} 的 fail() 调用`);
    continue;
  }
  const patched = unloadCriterion(gateSrc, calls, neg.crit);
  const fixtureDir = fixtures[neg.case];
  if (!fixtureDir) {
    bad(`${neg.id} → 找不到 ${neg.case} 的夹具（那一档注入本身坏了，先修注入档）`);
    continue;
  }
  const beforeLines = gateSrc.split("\n");
  const afterLines = patched.src.split("\n");
  if (beforeLines.length !== afterLines.length) {
    bad(`${neg.id} → 卸判据改变了行数（${beforeLines.length} → ${afterLines.length}）`);
    continue;
  }
  const diff = beforeLines.filter((l, i) => l !== afterLines[i]).length;
  if (diff !== patched.count) {
    bad(`${neg.id} → 差异行数 ${diff} != 该判据的 fail() 调用数 ${patched.count}`);
    continue;
  }
  const gateDir = fs.mkdtempSync(path.join(tmp, "gate-"));
  const mirror = path.join(gateDir, "check-information-architecture.cjs");
  fs.writeFileSync(mirror, patched.src);
  const base = runGate(GATE, fixtureDir);
  const baseAttr = attribute(base.out);
  const baseCrits = baseAttr.crits.join(",");
  if (baseCrits !== neg.crit) {
    bad(`${neg.id} → 基线 ${neg.case} 的判据集合应为恰为 {${neg.crit}}，实测 {${baseCrits || "空"}}`);
    continue;
  }
  const r = runGate(mirror, fixtureDir);
  const a = attribute(r.out);
  if (r.code !== 0 || !r.out.includes("信息架构契约门禁通过")) {
    bad(`${neg.id} → 卸掉 ${neg.crit} 后 ${neg.case} 夹具必须转绿（exit 0），实测 exit ${r.code}`);
    console.log(r.out.split("\n").filter((l) => l.includes("✗")).join("\n"));
    continue;
  }
  if (a.rows.length !== 0) {
    bad(`${neg.id} → 卸掉 ${neg.crit} 后 ${neg.case} 夹具判绿但仍有 ${a.rows.length} 条红因`);
    continue;
  }
  ok(
    `${neg.id} ${neg.label}（${patched.count} 处 fail() 调用，差异 ${diff} 行，行数不变）→ ` +
      `基线 {${neg.crit}} ⇒ 同一夹具转绿，零红因`
  );
}

/* ---- 每条红因、每条判据都至少一档判红 ---- */
{
  const noCase = CAUSES.filter((c) => !seenCauses.has(c.id)).map((c) => c.id);
  if (noCase.length) bad(`这些红因没有任何一档判红（等于不可证）：${noCase.join("、")}`);
  else ok(`每条红因都至少一档判红（${seenCauses.size}/${CAUSES.length}）`);
  const noCrit = CRITERIA.filter((c) => !seenCriteria.has(c));
  if (noCrit.length) bad(`这些判据没有任何一档判红：${noCrit.join("、")}`);
  else ok(`每条判据都至少一档判红（${seenCriteria.size}/${CRITERIA.length}）`);
}

/* ---- 仓库真源一个字节没动 ---- */
{
  const after = repoDigest();
  if (after !== REAL_DIGEST) {
    bad("自测期间仓库真源被改动了 —— 注入必须只在 /tmp 副本上做");
  } else {
    ok(`仓库真源指纹前后一致（${REAL_DIGEST.slice(0, 16)}…）—— 注入全程只在临时副本上做`);
  }
}

/* ---- 收尾：清掉临时目录 ---- */
try {
  fs.rmSync(tmp, { recursive: true, force: true });
} catch (e) {
  /* 临时目录清不掉不影响判定（它是 /tmp 下的副本，不是仓库）。 */
}

console.log("");
if (failed) {
  console.log(`信息架构契约门禁自测失败：${failed} 项断言未通过。`);
  process.exit(1);
}
console.log("信息架构契约门禁自测全部通过。");
