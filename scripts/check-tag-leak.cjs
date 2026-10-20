#!/usr/bin/env node
/**
 * 集合名标签泄漏门禁 —— 守住「集合名只用来判定版式，不出现在读者眼前」这条线。
 *
 * 为什么要有这道门禁（一次具体的核对，不是假想）：
 *   `src/content/blog/blog.11tydata.cjs` 给每篇文章注入 `tags: ["blog"]` ——
 *   这是 Eleventy 的**集合归属**机制（集合就是按 tag 建的，`collections.blog` 靠它）。
 *   `src/blog.njk`（列表页）一直把它滤掉，只显示主题标签；
 *   而 `src/_includes/layouts/detail.njk`（详情页版式）原先**直接印 tags** ⇒
 *   每篇文章的 meta 行顶部都多出一个 `· blog`
 *   （2026-10-20 实测：渲染顺序 `· blog · TRMM · lightning`，位置在 h1 下方的 meta 行顶部）。
 *   这不是"少写一个标签"，是**把内部机制印给读者看了**。
 *
 * ⚠️ 站内 **0 篇文章** ⇒ 详情页版式**从未被任何门禁跑过**，
 *   产物层也**永远看不到**这个泄漏（没有文章就没有详情页）。
 *   所以这道门禁不扫产物，而是**用 Nunjucks 直接渲染仓库里真实的那个模板**。
 *
 * 门禁怎么做（为什么这样才算数）：
 *   · 渲染的是 `src/_includes/layouts/detail.njk` **本体**（不是副本、不是手抄一份），
 *     用的是 Eleventy 同一个模板引擎 Nunjucks、同一套 filter 语义。
 *   · 只把三个**与标签无关**的 filter 打了桩：
 *       relUrl     —— 只改路径前缀（Eleventy 会按页面深度算成 `../`），与标签无关；
 *       date       —— 只格式化日期，与标签无关；
 *       dateToIso  —— 只格式化日期，与标签无关。
 *     其余一切（`reject` 过滤器、`isBlog` 判定、meta 行的循环）都是模板自己的代码。
 *   · 渲染上下文里的 `tags` = **从真实数据文件推出来的集合名** + 几个主题标签。
 *     集合名不是写死在门禁里的常量，而是从内容目录里那些目录数据文件
 *     （`src/content/<集合名>/<集合名>.11tydata.cjs`）
 *     的「谁用了 detail 版式」推出来的 ⇒ **新增集合忘了滤，门禁自动判红**。
 *
 * 判据：
 *   T1 详情页的**主题标签位**上不得出现集合名。
 *   T2 主题标签必须**一个不少**地还在（防"过滤过头"：把标签全滤掉也算"修好了"）。
 *   T3 详情页的**版式判定**必须完好 —— `isBlog` 仍由原始 tags 判定，
 *      页面底部仍回到 `/blog/`（"Back to Blog"）。
 *      （这条专门盯一种"看起来修好了"的错法：直接把 `tags` 本身滤掉 ——
 *        集合名是不见了，版式也一起被改成首页版式了。）
 *   T4 列表页的徽章上不得出现集合名，主题标签徽章必须在。
 *   T5 detail 版式的过滤链必须盖住**每一个**用这个版式的集合名。
 *      为什么 T5 不能只靠渲染看出来：集合名只有落在**会印标签的那个分支**上
 *      才会漏 —— 现在的 portfolio 分支印的是 year / role / type / stack，不印标签，
 *      所以「portfolio 有没有被滤掉」在产物里是看不见的。T5 只能读模板源码。
 *      ⚠️ T5 认的是 `reject(...)` 这种写法（集合名出现在 reject 的参数里）。
 *         换一种过滤实现方式时，要同步改这里。
 *
 * 环境变量（供 scripts/test-tag-leak.cjs 的注入矩阵用）：
 *   DETAIL_LAYOUT —— 覆盖要渲染的详情页版式；
 *   LIST_PAGE     —— 覆盖要渲染的列表页；
 *   CONTENT_DIR   —— 覆盖内容根目录（从它推导集合名）。
 */
const fs = require("fs");
const path = require("path");
const nunjucks = require("nunjucks"); // Eleventy 自己用的模板引擎（与 @11ty/eleventy 同一个）

const ROOT = path.resolve(__dirname, "..");
const DETAIL_LAYOUT =
  process.env.DETAIL_LAYOUT || path.join(ROOT, "src", "_includes", "layouts", "detail.njk");
const LIST_PAGE = process.env.LIST_PAGE || path.join(ROOT, "src", "blog.njk");
const CONTENT_DIR = process.env.CONTENT_DIR || path.join(ROOT, "src", "content");
/** 详情页版式在目录数据文件里的写法（Eleventy 的 layout 字段值）。 */
const DETAIL_LAYOUT_NAME = "layouts/detail.njk";
/** meta 行里标签前面的分隔符（U+00B7 MIDDLE DOT，模板里就这个字符）。 */
const DOT = "·";

const problems = [];
const fail = (m) => problems.push(m);

/* ---------- 工具 ---------- */

/** 去掉 front matter（模板的 front matter 是 Eleventy 用的，不是 Nunjucks 语法）。 */
function stripFrontMatter(src) {
  const m = src.match(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?=\r?\n|$)/);
  return m ? src.slice(m[0].length) : src;
}

/** 与 Eleventy 同款的环境：Nunjucks 默认 autoescape=true（Eleventy 没改它）。 */
function makeEnv() {
  const env = new nunjucks.Environment(
    new nunjucks.FileSystemLoader([path.join(ROOT, "src", "_includes")]),
    { autoescape: true, throwOnUndefined: false }
  );
  // 只桩掉与标签无关的三个 filter（理由见文件头）。
  env.addFilter("relUrl", (u) => (u === null || u === undefined ? "" : String(u)));
  env.addFilter("date", (v) => {
    if (!v) return "";
    const d = v instanceof Date ? v : new Date(String(v));
    return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  });
  env.addFilter("dateToIso", (v) => {
    if (!v) return "";
    const d = v instanceof Date ? v : new Date(String(v));
    return isNaN(d.getTime()) ? "" : d.toISOString();
  });
  return env;
}

/** 渲染模板本体。 */
function renderTemplate(env, file, ctx) {
  return env.renderString(stripFrontMatter(fs.readFileSync(file, "utf8")), ctx);
}

/**
 * 从内容目录里推出「哪些集合名会出现在详情页版式上」。
 * 依据是目录数据文件里的两个字段：`layout`（用哪个版式）与 `tags`（注入什么标签）。
 * ⚠️ 判据跟着**数据**走而不是写死常量 ⇒ 新增集合忘了在版式里滤掉，门禁自动判红。
 */
function detailCollectionNames() {
  const names = [];
  if (!fs.existsSync(CONTENT_DIR)) return names;
  for (const dir of fs.readdirSync(CONTENT_DIR).sort()) {
    const full = path.join(CONTENT_DIR, dir);
    let st;
    try {
      st = fs.statSync(full);
    } catch (_) {
      continue;
    }
    if (!st.isDirectory()) continue;
    for (const f of fs.readdirSync(full).sort()) {
      if (!f.endsWith(".11tydata.cjs")) continue;
      const src = fs.readFileSync(path.join(full, f), "utf8");
      const layout = (src.match(/^[ \t]*layout[ \t]*:[ \t]*["']([^"']+)["']/m) || [])[1] || "";
      if (layout !== DETAIL_LAYOUT_NAME) continue;
      const raw = (src.match(/^[ \t]*tags[ \t]*:[ \t]*\[([^\]]*)\]/m) || [])[1] || "";
      for (const m of raw.matchAll(/["']([^"']+)["']/g)) {
        if (!names.includes(m[1])) names.push(m[1]);
      }
    }
  }
  return names;
}

/** 列表页自己列的是哪个集合（从它的 front matter `pagination.data` 读）。 */
function listCollectionName() {
  const src = fs.readFileSync(LIST_PAGE, "utf8");
  const fm = src.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?=\r?\n|$)/);
  const m = ((fm && fm[1]) || "").match(/data[ \t]*:[ \t]*collections\.([A-Za-z0-9_-]+)/);
  return m ? m[1] : "";
}

/** 详情页 meta 行里的标签（`· xxx` 那些 span）；返回 null = 没找到 meta 行。 */
function detailMetaTags(html) {
  const meta = html.match(/<p class="detail__meta">([\s\S]*?)<\/p>/);
  if (!meta) return null;
  const out = [];
  for (const m of meta[1].matchAll(/<span>([\s\S]*?)<\/span>/g)) {
    const t = m[1].trim();
    if (t.startsWith(DOT)) out.push(t.slice(DOT.length).trim());
  }
  return out;
}

/** 列表页的主题标签徽章。 */
function listBadges(html) {
  const out = [];
  for (const m of html.matchAll(/<span class="badge badge--brand">([\s\S]*?)<\/span>/g)) {
    out.push(m[1].trim());
  }
  return out;
}

/* ---------- 跑起来 ---------- */

const TOPIC_TAGS = ["TRMM", "lightning"]; // 合成的主题标签（夹具站用）
const env = makeEnv();
const collectionNames = detailCollectionNames();

if (!collectionNames.length) {
  fail(
    `T1 推不出任何集合名 —— ${path.relative(ROOT, CONTENT_DIR) || CONTENT_DIR} 下没有 ` +
      `任何「layout 指向 ${DETAIL_LAYOUT_NAME}」的目录数据文件。` +
      `集合名是门禁判据的来源，没有它这道门禁就是空跑。`
  );
}

/* ---- 详情页版式 ---- */
let detailHtml = "";
let metaTags = null;
try {
  detailHtml = renderTemplate(env, DETAIL_LAYOUT, {
    title: "A Fixture Article",
    // 只放**一个**集合名：同时放多个会让版式判定二选一（isPortfolio 优先），
    // 渲染出来的就不是博客版式了。集合名的"盖没盖全"由 T5 单独核。
    tags: [collectionNames[0] || "blog", ...TOPIC_TAGS],
    date: "2026-10-20",
    page: { url: "/blog/fixture-article/", date: new Date("2026-10-20T00:00:00Z") },
    readingTime: 12,
    content: "<p>Fixture body.</p>",
    prev: null,
    next: null,
  });
  metaTags = detailMetaTags(detailHtml);
} catch (e) {
  fail(
    `T1 渲染详情页版式失败 —— ${String(e.message || e).split("\n")[0]}；` +
      `模板改坏了（语法错 / 用了没注册的 filter），门禁必须先把它报出来。`
  );
}

if (metaTags === null) {
  fail(
    `T2 详情页里找不到 meta 行（<p class="detail__meta">）—— ` +
      `模板改了版式的话，这里要跟着改；改不到就说明判据已经指错地方。`
  );
} else {
  // T1：集合名不得出现在主题标签位上
  for (const c of collectionNames) {
    if (metaTags.includes(c)) {
      fail(
        `T1 详情页把集合名「${c}」当主题标签印出来了 —— ` +
          `集合名是目录数据文件注入的（只用来判定版式与集合归属），不该给读者看；` +
          `版式里要用「滤掉集合名的那一份 tags」，不要直接印 tags。`
      );
    }
  }
  // T2：主题标签一个都不能少（防过滤过头）
  for (const t of TOPIC_TAGS) {
    if (!metaTags.includes(t)) {
      fail(
        `T2 详情页的主题标签「${t}」不见了 —— ` +
          `集合名该滤，主题标签不该滤；把两者一起滤掉不算修好。` +
          `当前 meta 行的标签：${metaTags.length ? metaTags.join(" / ") : "（空）"}`
      );
    }
  }
}

// T3：版式判定必须完好（isBlog 仍由原始 tags 判定）
if (detailHtml && !/Back to Blog/.test(detailHtml)) {
  fail(
    `T3 详情页底部没有「Back to Blog」—— 版式判定被改坏了：` +
      `isBlog 必须仍然由**原始的** tags 判定（"blog" in tags）；` +
      `把 tags 本身滤掉会让文章偷偷退回首页版式（"Back to Home"）。`
  );
}
if (detailHtml && !/href="[^"]*\/blog\/"/.test(detailHtml)) {
  fail(
    `T3 详情页底部的返回链接不指向 /blog/ —— ` +
      `isBlog / listHref 这条链断了（多半是拿滤过的 tags 去判定版式了）。`
  );
}

/* ---- T5：过滤链盖住了每一个用这个版式的集合名（读模板源码） ---- */
{
  const detailSrc = fs.readFileSync(DETAIL_LAYOUT, "utf8");
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const c of collectionNames) {
    const re = new RegExp(`reject\\([^)]*["']${esc(c)}["']`);
    if (!re.test(detailSrc)) {
      fail(
        `T5 详情页版式的过滤链没有盖住集合名「${c}」—— ` +
          `这个集合的页面用的就是这个版式，集合名却没被排除掉；` +
          `将来它的分支一旦开始印标签，集合名就会漏到读者眼前。` +
          `（判据认的是 reject(...) 这种写法：换实现方式时要同步改这里。）`
      );
    }
  }
}

/* ---- 列表页 ---- */
let listHtml = "";
let badges = [];
try {
  listHtml = renderTemplate(env, LIST_PAGE, {
    site: { author: { csdn: "https://blog.csdn.net/example" } },
    posts: [
      {
        url: "/blog/fixture-article/",
        date: new Date("2026-10-20T00:00:00Z"),
        data: {
          title: "A Fixture Article",
          excerpt: "An excerpt that says something beyond the headline.",
          readingTime: 12,
          tags: [listCollectionName() || "blog", ...TOPIC_TAGS],
        },
      },
    ],
    page: { url: "/blog/" },
  });
  badges = listBadges(listHtml);
} catch (e) {
  fail(
    `T4 渲染列表页失败 —— ${String(e.message || e).split("\n")[0]}；` +
      `模板改坏了，门禁必须先把它报出来。`
  );
}

if (listHtml) {
  const listCollection = listCollectionName();
  if (listCollection && badges.includes(listCollection)) {
    fail(
      `T4 列表页把集合名「${listCollection}」印成主题标签徽章了 —— ` +
        `它只是集合归属，不是给读者看的分类词。`
    );
  }
  for (const t of TOPIC_TAGS) {
    if (!badges.includes(t)) {
      fail(
        `T4 列表页的主题标签徽章「${t}」不见了 —— ` +
          `当前徽章：${badges.length ? badges.join(" / ") : "（空）"}`
      );
    }
  }
}

/* ---------- 汇总 ---------- */
if (problems.length) {
  console.error("集合名标签泄漏门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  console.error(
    `  判据出处：docs/blog-writing-guide.md §2.2（tags 是主题标签，不是集合名）。`
  );
  console.error("");
  process.exit(1);
}

console.log(
  `集合名标签泄漏门禁通过：渲染了详情页版式（集合名 ${collectionNames.join(" / ")}）` +
    `与列表页（集合 ${listCollectionName() || "?"}）；` +
    `详情页主题标签位上是 ${metaTags && metaTags.length ? metaTags.join(" / ") : "（空）"}，` +
    `列表页徽章是 ${badges.length ? badges.join(" / ") : "（空）"}。`
);
console.log(
  `  · 集合名由内容目录里的目录数据文件推导 ⇒ 新增集合忘了在版式里滤掉，这里会自动判红。`
);
