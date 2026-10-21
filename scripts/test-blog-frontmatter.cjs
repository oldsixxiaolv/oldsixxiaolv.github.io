#!/usr/bin/env node
/**
 * 博客 front matter 契约门禁的**自测**（注入矩阵）——证明 F1–F12 每一条都**能变红**。
 *
 * 为什么这个自测是必需的（一次具体的核对，不是假想）：
 *   站内 **0 篇文章** ⇒ 门禁的逐篇判据（F1–F9 / F11）**在真站上永远跑不到**。
 *   一道"在自己身上永远不执行"的门禁等于没写：它 exit 0、输出漂亮，
 *   但没人知道它判红过没有 —— 这正是 check-gates-wired.cjs 文件头写的同一族形态
 *   （"看起来在、其实不生效"）。缺陷清单 D15 就是这一族在**内容管线**上的实例：
 *   契约写在 docs/blog-writing-guide.md 里，而全仓没有一条门禁读它。
 *
 * 做法：
 *   每档都在 os.tmpdir() 下新建一个**独立**的夹具站：
 *     <tmp>/blog/blog.11tydata.cjs   ← 复制仓库里真实的那份（F12 的基线靠它）
 *     <tmp>/blog/<slug>/index.md     ← 文章
 *   再用 BLOG_DIR / BLOG_DATA_FILE 环境变量把门禁指向夹具站。
 *   ⚠️ 全程不动仓库里的任何文件；跑完再自证真目录一个字节都没变。
 *
 * 二十档（M0–M19）：
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
 *   M13 站内一篇文章都没有                   → exit 0，且明说「当前未执行」
 *   M14 front matter 覆盖 permalink          → 判红，点名 permalink
 *   M15 封面叫 cover.png，里面装的是 SVG 文本 → 判红，点名「格式与扩展名对不上」
 *   M16 封面叫 cover.svg，里面装的是 PNG 字节 → 判红，点名「格式与扩展名对不上」
 *   M17 封面文件名不叫 cover.<ext>          → 判红，点名「文件名必须是」
 *   M18 一张真 PNG 封面 + 规范的名字          → **exit 0**（证明 F13–F15 不假红）
 *   M19 封面既不是位图也不是 SVG             → 判红，点名「读不出」+「F14」
 *
 *   M1–M8 / M14 的夹具站里**同时放着那篇完全合规的好文章** ——
 *   证明门禁不是"见着文章就红"，而是**指着坏的那一篇**红。
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
  excerpt: "A one-sentence summary that adds something beyond the headline.",
  readingTime: 3,
  tags: ["fixture"],
};

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
  return {
    root,
    blogDir,
    dataFile,
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
  };
}

/* ---------- 二十档 ---------- */
const CASES = [
  { id: "M0", desc: "基线：一篇完全合规的文章", expect: "green" },
  {
    id: "M1",
    desc: 'readingTime 写成 "3 min"（会印成 "3 min min read"）',
    expect: "red",
    sub: "readingTime",
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.writeArticle("bad-post", { ...GOOD, readingTime: '"3 min"' });
    },
  },
  {
    id: "M2",
    desc: "目录名写成 Bad_Slug（URL 会变成 /blog/Bad_Slug/）",
    expect: "red",
    sub: "slug",
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.writeArticle("Bad_Slug", GOOD);
    },
  },
  {
    id: "M3",
    desc: "front matter 覆盖 layout（版式被换成论文页）",
    expect: "red",
    sub: "layout",
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.writeArticle("bad-post", { ...GOOD, layout: "layouts/paper.njk" });
    },
  },
  {
    id: "M4",
    desc: "date 带时分（Eleventy 会直接 fatal、整个 build 挂掉）",
    expect: "red",
    sub: "date",
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.writeArticle("bad-post", { ...GOOD, date: "2026-10-18 09:30" });
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
      fx.writeArticle("bad-post", { ...GOOD, tags: "not-an-array" });
    },
  },
  {
    id: "M7",
    desc: "cover 指向同目录里不存在的文件",
    expect: "red",
    sub: "cover",
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.writeArticle("bad-post", { ...GOOD, cover: "missing.svg" });
    },
  },
  {
    id: "M8",
    desc: "缺 title（契约 §2 列为必需）",
    expect: "red",
    sub: "title",
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.writeArticle("bad-post", { ...GOOD, title: undefined });
    },
  },
  {
    id: "M9",
    desc: "缺 excerpt（契约写的是「强烈建议」⇒ 只出 note，不拦 build）",
    expect: "note",
    sub: "没有 `excerpt`",
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.writeArticle("bad-post", { ...GOOD, excerpt: undefined });
    },
  },
  {
    id: "M10",
    desc: "excerpt 与 title 逐字相同（契约 §4 自查项 ⇒ 只出 note）",
    expect: "note",
    sub: "逐字相同",
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.writeArticle("bad-post", { ...GOOD, excerpt: GOOD.title });
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
    desc: "站内一篇文章都没有（真站现状 ⇒ 明说「未执行」而不是「通过」）",
    expect: "note",
    sub: "当前未执行",
    setup: () => {},
  },
  {
    id: "M14",
    desc: "front matter 覆盖 permalink（文章被挪到 /custom/）",
    expect: "red",
    sub: "permalink",
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.writeArticle("bad-post", { ...GOOD, permalink: "/custom/" });
    },
  },
  {
    id: "M15",
    desc: "封面叫 cover.png，里面装的是 SVG 文本（契约 §2.3 记的历史坑）",
    expect: "red",
    sub: "SVG 文本",
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.writeArticle("bad-post", { ...GOOD, cover: "cover.png" });
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
      fx.writeArticle("bad-post", { ...GOOD, cover: "cover.svg" });
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
      fx.writeArticle("bad-post", { ...GOOD, cover: "banner.svg" });
      fx.writeCover("bad-post", "banner.svg", SVG_TEXT);
    },
  },
  {
    id: "M18",
    desc: "一张真 PNG 封面 + 规范的文件名（F13–F15 不该假红）",
    expect: "green",
    setup: (fx) => {
      fx.writeArticle("good-post", GOOD);
      fx.writeArticle("with-cover", { ...GOOD, cover: "cover.png" });
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
      fx.writeArticle("bad-post", { ...GOOD, cover: "cover.png" });
      fx.writeCover("bad-post", "cover.png", PLAIN_TEXT);
    },
  },
];

/* ---------- 跑一档 ---------- */
function run(c) {
  const fx = buildFixture(c);
  try {
    if (c.setup) c.setup(fx);
    const r = spawnSync(process.execPath, [GATE], {
      env: { ...process.env, BLOG_DIR: fx.blogDir, BLOG_DATA_FILE: fx.dataFile },
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
    if (r.code === 1 && subs.every((s) => r.out.includes(s))) {
      console.log(`  ✓ ${c.id} ${c.desc} → 判红，红因命中「${subs.join("」与「")}」`);
    } else {
      console.error(
        `  ✗ ${c.id} ${c.desc} → 期望判红且红因含「${c.sub}」，实际 exit ${r.code}`
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
