#!/usr/bin/env node
/**
 * 博客 front matter 契约门禁的**自测**（注入矩阵）——证明 F1–F12 每一条都**能变红**。
 *
 * 为什么这个自测是必需的（一次具体的核对，不是假想）：
 *   这个门禁刚写下来时，站内 **0 篇文章** ⇒ 门禁的逐篇判据（F1–F9 / F11）
 *   **在真站上永远跑不到**。一道"在自己身上永远不执行"的门禁等于没写：
 *   它 exit 0、输出漂亮，但没人知道它判红过没有 —— 这正是 check-gates-wired.cjs
 *   文件头写的同一族形态（"看起来在、其实不生效"）。缺陷清单 D15 就是这一族在
 *   **内容管线**上的实例：契约写在 docs/blog-writing-guide.md 里，而全仓没有一条门禁读它。
 *   2026-10-23 站内已有文章、逐篇判据真的在跑，但**夹具站仍不能撤** ——
 *   它是"每一条判据能变红"的唯一证明；其中 M13 那档（0 篇文章）守的是
 *   **判据 F16**：空集合本身就要判红，不许退化成一句"判据未执行"就放过。
 *
 * 做法：
 *   每档都在 os.tmpdir() 下新建一个**独立**的夹具站：
 *     <tmp>/blog/blog.11tydata.cjs   ← 复制仓库里真实的那份（F12 的基线靠它）
 *     <tmp>/blog/<slug>/index.md     ← 文章
 *   再用 BLOG_DIR / BLOG_DATA_FILE 环境变量把门禁指向夹具站。
 *   ⚠️ 全程不动仓库里的任何文件；跑完再自证真目录一个字节都没变。
 *
 * 二十八档（M0–M27）：
 *   M0  基线：一篇完全合规的文章              → exit 0（证明这套判据不是空跑）
 *   M1  readingTime 写成 "3 min"             → 判红，点名 readingTime
 *   M2  目录名写成 Bad_Slug                  → 判红，点名 slug
 *   M3  front matter 覆盖 layout             → 判红，点名 layout
 *   M4  date 带时分（2026-10-18 09:30）      → 判红，点名 date
 *   M5  文章扁平地躺在目录根下               → 判红，点名「扁平」
 *   M6  tags 不是字符串数组                  → 判红，点名 tags
 *   M7  cover 指向不存在的文件                → 判红，点名 cover
 *   M8  缺 title                             → 判红，点名 title
 *   M9  缺 excerpt                           → **不判红**，只出 note
 *   M10 excerpt 与 title 逐字相同            → **不判红**，只出 note
 *   M11 目录数据文件不见了                   → 判红，点名「目录数据文件不存在」
 *   M12 目录数据文件不注入 prev 了           → 判红，点名 prev
 *   M13 站内一篇文章都没有                   → 判红，点名 F16（空集合是「内容路径没接上」）
 *   M14 front matter 覆盖 permalink          → 判红，点名 permalink
 *   M15 封面叫 cover.png，里面装的是 SVG 文本 → 判红，点名「格式与扩展名对不上」
 *   M16 封面叫 cover.svg，里面装的是 PNG 字节 → 判红，点名「格式与扩展名对不上」
 *   M17 封面文件名不叫 cover.<ext>          → 判红，点名「文件名必须是」
 *   M18 一张真 PNG 封面 + 规范的名字          → **exit 0**（证明 F13–F15 不假红）
 *   M19 封面既不是位图也不是 SVG             → 判红，点名「读不出」+「F14」
 *   M20 缺 description                       → 判红，点名 F17（meta description 回落成站点通用描述）
 *   M21 description 逐字等于 title          → 判红，点名 F18（复读标题）
 *   M22 description 逐字等于站点通用描述      → 判红，点名 F19（抄了通用描述）
 *   M23 两篇文章的 description 逐字相同       → 判红，点名 F20（每篇文章的 snippet 一模一样）
 *   M24 博客列表页缺 description               → 判红，点名 F21（/blog/ 的四个出口回落成站点通用描述）
 *   M25 博客列表页的 description 复读自己的 title → 判红，点名 F22
 *   M26 博客列表页的 description 照抄站点通用描述 → 判红，点名 F23
 *   M27 博客列表页模板不见了                    → 判红，点名 F21（读不到真源 ⇒ 判据没跑，不是"通过"）
 *
 *   除 M13（0 篇文章那一档）外，其余各档的夹具站里都**同时放着那篇完全合规的好文章** ——
 *   证明门禁不是"见着文章就红"，而是**指着坏的那一篇**红；
 *   M20–M23 那一档还额外断言**红因归属纯净**：好文章的名字**不得**出现在输出里。
 *   M24–M27 那一族（列表页）也一样：夹具站里默认放一份**合规的列表页**，
 *   那一族只在被注入的那一档里坏掉 ⇒ 每档仍然只注入**一个**缺陷。
 *   M9 / M10 是"忘了写"档：契约里写的是"建议"，所以它们**不该**拦下 build
 *   （excerpt 缺失要不要升级为判红 = 待拍板 46，本轮定的口径是 note）。
 *   M15–M19 是**封面**这一档（D40）：契约 §2.3 明写「必须是真 SVG 文本」，
 *   而旧版 F9 只查"文件在不在" ⇒ 契约禁止的形态全链 exit 0。
 *
 * 用法：node scripts/test-blog-frontmatter.cjs
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-blog-frontmatter.cjs");
const REAL_BLOG_DIR = path.join(ROOT, "src", "content", "blog");
const REAL_DATA_FILE = path.join(REAL_BLOG_DIR, "blog.11tydata.cjs");

if (!fs.existsSync(REAL_DATA_FILE)) {
  console.error(
    `博客 front matter 自测失败：找不到 ${REAL_DATA_FILE} —— ` +
      `夹具站的基线要靠它，先确认博客集合的目录数据文件还在。`
  );
  process.exit(1);
}

/* ---------- 一篇完全合规的文章（各档的"好文章"基准） ---------- */
const GOOD = {
  title: "A Perfectly Ordinary Fixture Article",
  date: "2026-10-20",
  /* description：SEO 用的那一句（标题的改写）；与 excerpt 分职，两者不能互相顶替。 */
  description: "A rewritten version of the fixture headline, saying what the article is about.",
  excerpt: "A one-sentence summary that adds something beyond the headline.",
  readingTime: 3,
  tags: ["fixture"],
};

/* 站点通用描述（src/_data/site.js）：判据 F19 拿它当"不可抄的值"，
   自测必须用**真值**去构造夹具（不写死一句，否则真源改了夹具就失真）。 */
const SITE = require(path.resolve(ROOT, "src", "_data", "site.js"));
const SITE_DESCRIPTION = String((SITE && SITE.description) || "").trim();
if (!SITE_DESCRIPTION) {
  console.error(
    `博客 front matter 自测失败：读不到站点通用描述（src/_data/site.js 的 description）—— ` +
      `判据 F19 的夹具档要用它来构造"照抄通用描述"的文章，读不到就没有可验的夹具。`
  );
  process.exit(1);
}

/** 把字段对象渲染成 front matter + 正文。undefined 的字段**不写**。 */
function articleMd(fields) {
  const lines = ["---"];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      lines.push(`${k}:`);
      v.forEach((x) => lines.push(`  - ${x}`));
    } else {
      lines.push(`${k}: ${v}`);
    }
  }
  lines.push("---", "", "Body paragraph for the fixture article.", "");
  return lines.join("\n");
}

/** M23 用：两篇不相干的文章共用的那一句 description。 */
const SHARED_DESCRIPTION = "One sentence reused by two unrelated articles.";

/* 夹具里"另一篇文章"的基准：除 description 外与 GOOD 相同，但 **description 必须不同** ——
   判据 F20（集合内 description 不得逐字相同）落地后，若两篇夹具文章共用一句 description，
   夹具站自己就会撞上 F20 ⇒ 那一档测的就不再是"它想测的那个缺陷"了。
   ⇒ 每档只注入**一个**缺陷，其余字段保持干净。 */
const OTHER = {
  ...GOOD,
  description: "A different fixture article, with a description of its own.",
};

/* ---------- 夹具里的博客列表页（F21–F23 的对象） ---------- */
/* 形状照 src/blog.njk：front matter + 一个极简的列表页骨架。
   ⚠️ 这份列表页是**合规**的（有自己的 description、不复读标题、不抄通用描述）——
   夹具站默认放它 ⇒ 原有各档的语义不变；只有 M24–M27 那一族会把它弄坏，
   于是每档仍然只注入**一个**缺陷。
   ⚠️ 它的 description 刻意与 GOOD.description 不同：F20 那一族守的是
   「集合内不同文章的 description 不得逐字相同」，而列表页不是文章 ——
   但两份文字撞在一起会让"到底是谁撞了"这件事说不清。 */
const LIST_PAGE_GOOD = [
  "---",
  "layout: layouts/page.njk",
  'permalink: "/blog/"',
  'title: "Fixture technical notes"',
  'description: "A fixture sentence about the blog list page, written in its own words."',
  "---",
  "",
  '<article class="list-page"><h1>Fixture technical notes</h1></article>',
  "",
].join("\n");

/* ---------- 封面的三种字节 ---------- */
/** 一张真的 1×1 PNG（标准 base64）—— "真位图"那一档的素材。 */
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
/** 一段真的 SVG 文本（带 width / height / viewBox）—— 契约 §2.3 推荐的那种。 */
const SVG_TEXT =
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">' +
  '<rect width="800" height="450" fill="#123456"/></svg>\n';
/** 既不是位图也不是 SVG 的一段文字 —— "读不出真实格式"那一档。 */
const PLAIN_TEXT = "This file is neither a bitmap nor an SVG document.\n";

/* ---------- 夹具站 ---------- */
function buildFixture(c) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `mh-blog-fm-${c.id}-`));
  const blogDir = path.join(root, "blog");
  fs.mkdirSync(blogDir, { recursive: true });
  const dataFile = path.join(blogDir, "blog.11tydata.cjs");
  fs.copyFileSync(REAL_DATA_FILE, dataFile);
  /* 列表页模板放在夹具站根下（与文章目录 blog/ 平级）——
     门禁靠 BLOG_LIST_PAGE 环境变量指过来，不指的话它会一直去读仓库里那个真文件，
     那样"注入缺陷"就注不到夹具站上（判据会一直在验真页面）。 */
  const listPage = path.join(root, "blog.njk");
  fs.writeFileSync(listPage, LIST_PAGE_GOOD);
  return {
    root,
    blogDir,
    dataFile,
    listPage,
    /** 写一篇 <slug>/index.md */
    writeArticle(slug, fields) {
      const dir = path.join(blogDir, slug);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "index.md"), articleMd(fields));
    },
    /** 写一个扁平 <name>.md（直接躺在目录根下） */
    writeFlat(name, fields) {
      fs.writeFileSync(path.join(blogDir, name), articleMd(fields));
    },
    /** 删掉目录数据文件 */
    dropDataFile() {
      fs.unlinkSync(dataFile);
    },
    /** 在 <slug>/ 目录里写一个封面文件（内容可以是二进制字节） */
    writeCover(slug, name, bytes) {
      const dir = path.join(blogDir, slug);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, name), bytes);
    },
    /** 改目录数据文件（文本层面，门禁也是按文本核的） */
    editDataFile(fn) {
      const before = fs.readFileSync(dataFile, "utf8");
      const after = fn(before);
      if (after === before) throw new Error("注入没有改变目录数据文件的内容");
      fs.writeFileSync(dataFile, after);
    },
    /** 改列表页模板（文本层面，门禁也是按文本核的） */
    editListPage(fn) {
      const before = fs.readFileSync(listPage, "utf8");
      const after = fn(before);
      if (after === before) throw new Error("注入没有改变列表页的内容");
      fs.writeFileSync(listPage, after);
    },
    /** 删掉列表页模板（读不到真源 ⇒ 判据必须判红，不能当"通过"） */
    dropListPage() {
      fs.unlinkSync(listPage);
    },
  };
}

/* ---------- 二十八档 ---------- */
const CASES = [
  {
    id: "M0",
    desc: "基线：一篇完全合规的文章",
    expect: "green",
    /* ⚠️ 这一档原来**没有 setup** ⇒ 夹具站是空的，它其实一直在测「0 篇文章」，
       而那一档是 M13 —— 也就是说「基线证明判据不是空跑」这句话从来没说真过。
       F16 落地后（空集合判红）它终于露馅：基线必须真的放一篇好文章进去。 */
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
    },
  },
  {
    id: "M1",
    desc: 'readingTime 写成 "3 min"（会印成 "3 min min read"）',
    expect: "red",
    sub: "readingTime",
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.writeArticle("bad-post", { ...OTHER, readingTime: '"3 min"' });
    },
  },
  {
    id: "M2",
    desc: "目录名写成 Bad_Slug（URL 会变成 /blog/Bad_Slug/）",
    expect: "red",
    sub: "slug",
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.writeArticle("Bad_Slug", OTHER);
    },
  },
  {
    id: "M3",
    desc: "front matter 覆盖 layout（版式被换成论文页）",
    expect: "red",
    sub: "layout",
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.writeArticle("bad-post", { ...OTHER, layout: "layouts/paper.njk" });
    },
  },
  {
    id: "M4",
    desc: "date 带时分（Eleventy 会直接 fatal、整个 build 挂掉）",
    expect: "red",
    sub: "date",
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.writeArticle("bad-post", { ...OTHER, date: "2026-10-18 09:30" });
    },
  },
  {
    id: "M5",
    desc: "文章扁平地躺在目录根下（permalink 会解析成 /blog/blog/）",
    expect: "red",
    sub: "扁平",
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.writeFlat("flat-post.md", GOOD);
    },
  },
  {
    id: "M6",
    desc: "tags 不是字符串数组",
    expect: "red",
    sub: "tags",
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.writeArticle("bad-post", { ...OTHER, tags: "not-an-array" });
    },
  },
  {
    id: "M7",
    desc: "cover 指向同目录里不存在的文件",
    expect: "red",
    sub: "cover",
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.writeArticle("bad-post", { ...OTHER, cover: "missing.svg" });
    },
  },
  {
    id: "M8",
    desc: "缺 title（契约 §2 列为必需）",
    expect: "red",
    sub: "title",
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.writeArticle("bad-post", { ...OTHER, title: undefined });
    },
  },
  {
    id: "M9",
    desc: "缺 excerpt（契约写的是「强烈建议」⇒ 只出 note，不拦 build）",
    expect: "note",
    sub: "没有 `excerpt`",
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.writeArticle("bad-post", { ...OTHER, excerpt: undefined });
    },
  },
  {
    id: "M10",
    desc: "excerpt 与 title 逐字相同（契约 §4 自查项 ⇒ 只出 note）",
    expect: "note",
    sub: "逐字相同",
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.writeArticle("bad-post", { ...OTHER, excerpt: GOOD.title });
    },
  },
  {
    id: "M11",
    desc: "目录数据文件不见了（自动注入的 layout / permalink 全没了）",
    expect: "red",
    sub: "目录数据文件不存在",
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.dropDataFile();
    },
  },
  {
    id: "M12",
    desc: "目录数据文件不注入 prev 了（详情页底部少上一篇）",
    expect: "red",
    sub: "prev",
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.editDataFile((t) => {
        const out = t.replace(/^[ \t]*prev:.*\n/m, "");
        if (out === t) throw new Error("注入锚点不存在：目录数据文件里没有 prev:");
        return out;
      });
    },
  },
  {
    id: "M13",
    desc: "站内一篇文章都没有（空集合 ⇒ F16 判红：内容路径没接上）",
    expect: "red",
    sub: ["F16", "集合为空"],
    setup: () => {},
  },
  {
    id: "M14",
    desc: "front matter 覆盖 permalink（文章被挪到 /custom/）",
    expect: "red",
    sub: "permalink",
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.writeArticle("bad-post", { ...OTHER, permalink: "/custom/" });
    },
  },
  {
    id: "M15",
    desc: "封面叫 cover.png，里面装的是 SVG 文本（契约 §2.3 记的历史坑）",
    expect: "red",
    sub: "SVG 文本",
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.writeArticle("bad-post", { ...OTHER, cover: "cover.png" });
      fx.writeCover("bad-post", "cover.png", SVG_TEXT);
    },
  },
  {
    id: "M16",
    desc: "封面叫 cover.svg，里面装的是 PNG 字节（扩展名反向骗人）",
    expect: "red",
    sub: "PNG 位图",
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.writeArticle("bad-post", { ...OTHER, cover: "cover.svg" });
      fx.writeCover("bad-post", "cover.svg", PNG_BYTES);
    },
  },
  {
    id: "M17",
    desc: "封面文件名不叫 cover.<ext>（copyCovers() 不会复制它 ⇒ 产物 404）",
    expect: "red",
    sub: "文件名必须是",
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.writeArticle("bad-post", { ...OTHER, cover: "banner.svg" });
      fx.writeCover("bad-post", "banner.svg", SVG_TEXT);
    },
  },
  {
    id: "M18",
    desc: "一张真 PNG 封面 + 规范的文件名（F13–F15 不该假红）",
    expect: "green",
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.writeArticle("with-cover", { ...OTHER, cover: "cover.png" });
      fx.writeCover("with-cover", "cover.png", PNG_BYTES);
    },
  },
  {
    id: "M19",
    desc: "封面既不是位图也不是 SVG（读不出真实格式 ⇒ F13 + F14 覆盖度自证）",
    expect: "red",
    sub: ["读不出", "F14"],
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.writeArticle("bad-post", { ...OTHER, cover: "cover.png" });
      fx.writeCover("bad-post", "cover.png", PLAIN_TEXT);
    },
  },
  {
    id: "M20",
    desc: "缺 description（⇒ meta description 回落成站点通用描述）",
    expect: "red",
    sub: ["F17", "bad-post"],
    not: "good-post",
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.writeArticle("bad-post", { ...OTHER, description: undefined });
    },
  },
  {
    id: "M21",
    desc: "description 与 title 逐字相同（复读标题）",
    expect: "red",
    sub: ["F18", "bad-post"],
    not: "good-post",
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.writeArticle("bad-post", { ...OTHER, description: GOOD.title });
    },
  },
  {
    id: "M22",
    desc: "description 照抄站点通用描述（每篇文章的 snippet 都会一样）",
    expect: "red",
    sub: ["F19", "bad-post"],
    not: "good-post",
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.writeArticle("bad-post", { ...OTHER, description: SITE_DESCRIPTION });
    },
  },
  {
    id: "M23",
    desc: "两篇文章的 description 逐字相同（集合内重样）",
    expect: "red",
    sub: ["F20", "bad-post"],
    not: "good-post",
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.writeArticle("bad-post", { ...OTHER, description: SHARED_DESCRIPTION });
      fx.writeArticle("bad-post-2", { ...OTHER, description: SHARED_DESCRIPTION });
    },
  },
  {
    id: "M24",
    desc: "博客列表页缺 description（⇒ /blog/ 的四个出口全回落成站点通用描述）",
    expect: "red",
    sub: ["F21", "缺 `description`"],
    not: "good-post",
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.editListPage((t) => {
        const out = t.replace(/^description:.*\n/m, "");
        if (out === t) throw new Error("注入锚点不存在：列表页里没有 description:");
        return out;
      });
    },
  },
  {
    id: "M25",
    desc: "博客列表页的 description 复读它自己的 title",
    expect: "red",
    sub: ["F22", "与它自己的"],
    not: "good-post",
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.editListPage((t) => {
        const out = t.replace(/^description:.*$/m, 'description: "Fixture technical notes"');
        if (out === t) throw new Error("注入锚点不存在：列表页里没有 description:");
        return out;
      });
    },
  },
  {
    id: "M26",
    desc: "博客列表页的 description 照抄站点通用描述",
    expect: "red",
    sub: ["F23", "站点通用描述"],
    not: "good-post",
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.editListPage((t) => {
        const out = t.replace(/^description:.*$/m, `description: "${SITE_DESCRIPTION}"`);
        if (out === t) throw new Error("注入锚点不存在：列表页里没有 description:");
        return out;
      });
    },
  },
  {
    id: "M27",
    desc: "博客列表页模板不见了（读不到真源 ⇒ 判据没跑，不是\"通过\"）",
    expect: "red",
    sub: ["F21", "读不到博客列表页"],
    not: "good-post",
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.dropListPage();
    },
  },
];

/* ---------- 跑一档 ---------- */
function run(c) {
  const fx = buildFixture(c);
  try {
    if (c.setup) c.setup(fx);
    const r = spawnSync(process.execPath, [GATE], {
      env: {
        ...process.env,
        BLOG_DIR: fx.blogDir,
        BLOG_DATA_FILE: fx.dataFile,
        BLOG_LIST_PAGE: fx.listPage,
      },
      encoding: "utf8",
      cwd: ROOT,
    });
    return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
}

/* ---------- 自证：真目录一个字节都没被动过 ---------- */
function snapshotRealBlogDir() {
  const out = {};
  const walk = (dir, prefix) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) walk(full, rel);
      else if (e.isFile())
        out[rel] = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
    }
  };
  walk(REAL_BLOG_DIR, "");
  return out;
}

/* ---------- 开跑 ---------- */
/** 一档可以要求命中多个红因（sub 给字符串或字符串数组）。 */
const subsOf = (c) => (Array.isArray(c.sub) ? c.sub : [c.sub]);
const beforeReal = snapshotRealBlogDir();
let failed = 0;
console.log("博客 front matter 契约门禁 · 本地注入矩阵：\n");

for (const c of CASES) {
  let r;
  try {
    r = run(c);
  } catch (e) {
    console.error(`  ✗ ${c.id} ${c.desc} —— 注入本身坏了：${e.message}`);
    failed++;
    continue;
  }
  if (c.expect === "green") {
    if (r.code === 0) {
      console.log(`  ✓ ${c.id} ${c.desc} → 门禁全绿（exit 0）`);
    } else {
      console.error(`  ✗ ${c.id} ${c.desc} → 期望 exit 0，实际 ${r.code}`);
      console.error(r.out.split("\n").map((l) => "      " + l).join("\n"));
      failed++;
    }
  } else if (c.expect === "red") {
    const subs = subsOf(c);
    /* not：红因**归属纯净**的断言 —— 这些字样**不得**出现在输出里。
       用来证明门禁指的是"坏的那一篇"，而不是把好文章也一起点了名。 */
    const nots = c.not ? (Array.isArray(c.not) ? c.not : [c.not]) : [];
    const hit = subs.every((s) => r.out.includes(s));
    const clean = nots.every((s) => !r.out.includes(s));
    if (r.code === 1 && hit && clean) {
      console.log(`  ✓ ${c.id} ${c.desc} → 判红，红因命中「${subs.join("」与「")}」`);
    } else {
      console.error(
        `  ✗ ${c.id} ${c.desc} → 期望判红且红因含「${c.sub}」` +
          (nots.length ? `、且不得出现「${nots.join("」「")}」` : "") +
          `，实际 exit ${r.code}`
      );
      console.error(r.out.split("\n").map((l) => "      " + l).join("\n"));
      failed++;
    }
  } else {
    /* note 档：不该拦下 build，但必须把"忘了写"说出来 */
    if (r.code === 0 && r.out.includes(c.sub) && r.out.includes("note")) {
      console.log(`  ✓ ${c.id} ${c.desc} → 不判红（exit 0），note 命中「${c.sub}」`);
    } else {
      console.error(
        `  ✗ ${c.id} ${c.desc} → 期望 exit 0 且输出含 note「${c.sub}」，实际 exit ${r.code}`
      );
      console.error(r.out.split("\n").map((l) => "      " + l).join("\n"));
      failed++;
    }
  }
}

/* ---------- 自证：真目录没被动过 ---------- */
{
  const afterReal = snapshotRealBlogDir();
  const before = JSON.stringify(beforeReal);
  const after = JSON.stringify(afterReal);
  if (before !== after) {
    console.error(
      `\n  ✗ 真目录 ${REAL_BLOG_DIR} 被改动或缺了文件 —— 自测必须只在副本上注入。`
    );
    failed++;
  }
}

console.log("");
if (failed) {
  console.error(`博客 front matter 自测未通过：${failed}/${CASES.length} 档不对。\n`);
  process.exit(1);
}
console.log(
  `博客 front matter 自测通过：${CASES.length} 档全部符合预期` +
    `（注入只在 /tmp 的夹具站上做，仓库里的博客目录未被改动）。\n`
);
