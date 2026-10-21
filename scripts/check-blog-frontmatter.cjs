#!/usr/bin/env node
/**
 * 博客 front matter 契约门禁 —— 把 `docs/blog-writing-guide.md` 那份契约变成
 * **每次 build 都会自己跑**的判据。
 *
 * 为什么要有这个门禁（一次具体的核对结果，不是假想）：
 *   `docs/blog-writing-guide.md`（M1-2 场次产出）是站内博客文章的**唯一契约**，
 *   里面逐条写明了 front matter 怎么写、每个字段**写错会怎样**（§2 的「写错会怎样」列）。
 *   而**全仓没有任何一条门禁读它**（2026-10-20 实测：`scripts/` 下 grep
 *   `readingTime|excerpt|content/blog` 只命中 check-lang 的一句历史举例、
 *   check-jsonld 的 profilePage 角色解析、check-identity-derivation 的一句注释，
 *   **没有一条在核博客 front matter**）。
 *   更要紧的是：站内 **0 篇文章** ⇒ 这条内容路径**从未被任何门禁跑过**。
 *   于是契约里最容易写错的地方全部无人把关。实测（2026-10-20 12:00–12:30 场次，
 *   在 /tmp 的仓库副本里放夹具文章实测出来的，不是推测）：
 *     · `readingTime: "3 min"`  ⇒ 详情页与列表卡都印 **"3 min min read"**；
 *     · `excerpt` 缺失          ⇒ 列表卡**整块摘要消失**，只剩标题 / 日期 / 时长；
 *     · 目录名写成 `Bad_Slug`   ⇒ URL 变成 `/blog/Bad_Slug/`（规范 §1 明写命名规则）；
 *     · front matter 覆盖 `layout` / `permalink`
 *                              ⇒ 页面被挪到别处，且用**论文页版式**渲染博客文章；
 *     · `date` 写成 `2026-10-18 09:30`
 *                              ⇒ Eleventy 自己 fatal、**整个 build 挂掉**，
 *                                报的还是内部堆栈而不是可读提示。
 *   前四条 build **全绿**（没有任何一条判据看得见它们）。
 *   ⇒ 这就是缺陷清单 D15：**契约写下来了，但没人守**。
 *
 *   2026-10-21（D40）又查出同一族的第二个实例：**封面**这条内容路径。
 *   契约（§2.3）写得比谁都细（"必须是真 SVG 文本"、连历史踩的坑都记着），
 *   而门禁这边两个方向都不对：
 *     · F9 只查"文件在不在"，**不查格式、不查文件名** ⇒ 契约明令禁止的形态
 *       （文件叫 cover.png、里面装的是 `<svg …>` 文本）**全链 exit 0**，
 *       没有任何一道门禁看守；
 *     · 另一个方向：图片门禁 IA5 当时**只读得出 PNG / JPEG**，
 *       于是**照契约写一张真 SVG 封面，build 必红**（IA5 + IA6 双重判红）。
 *   ⇒ F13–F15 是补第一个缺口；IA5 的 SVG 能力是同轮补上的另一半。
 *
 * 判据一览（F 编号，与 verify-site 的数字编号、check-jsonld 的 J 编号互不相干）：
 *   F1  文章**形状**：必须是 `<slug>/index.md`。扁平 `<name>.md` 不行 ——
 *       `getSlugFromData()` 取的是**倒数第二段**（目录名），扁平文件的倒数第二段
 *       是 `blog` ⇒ 全部挤到同一个 `/blog/blog/`。
 *   F2  **slug 命名**：`小写 ASCII + 单连字符`（`^[a-z0-9]+(?:-[a-z0-9]+)*$`）。
 *   F3  front matter **可解析**。
 *   F4  `title` **必需**、非空字符串。
 *   F5  `date` **必需**、且是**纯日期** `YYYY-MM-DD`（不带时分秒）。
 *   F6  `readingTime` 若出现 ⇒ 必须是**纯数字**（模板直接拼 "N min read"，
 *       写成 "3 min" 就会印成 "3 min min read"）。
 *   F7  `tags` 若出现 ⇒ 必须是**字符串数组**。
 *   F8  front matter **不得**出现 `layout` / `permalink`（会覆盖目录数据注入）。
 *   F9  `cover` 若出现 ⇒ **同目录**必须真实存在该文件（否则开关一开就是裂图）。
 *   F10 `excerpt` 缺失 / 为空 ⇒ **note**（契约写的是「强烈建议」，不是硬错）。
 *   F11 `excerpt` 与 `title` 逐字相同 ⇒ **note**（契约 §4 的自查项）。
 *   F12 **自动注入字段**齐不齐（目录数据文件）—— 这一条**永远会跑**，
 *       所以本站即使 0 篇文章，本门禁也不是空跑。
 *   F13 封面的**真实字节格式**必须与扩展名一致：`.svg` 必须是 SVG 文本，
 *       `.png` / `.jpg` / `.jpeg` 必须是真位图，`.webp` 必须是真 WebP。
 *       （契约 §2.3 记的就是这个坑：文件叫 cover.png、里面装的却是 `<svg …>` 文本
 *        ⇒ 服务器按扩展名发 Content-Type、浏览器拒绝解码、naturalWidth = 0 ⇒ 裂图。）
 *   F14 **覆盖度自证**：声明了封面的文章，封面必须真的被逐字节验过
 *       （应验 == 实测）；读不出真实格式的封面会在这里被点名。
 *   F15 封面的**文件名**必须是 `cover.<ext>`（ext ∈ svg/png/jpg/jpeg/webp）——
 *       因为构建脚本 eleventy.config.js 的 copyCovers() **只复制**这种名字的文件；
 *       写成别的名字，F9 会绿（文件确实在）但产物里根本没有它 ⇒ 封面 404。
 *
 * ⚠️ **note 与判红的分界**（写清楚，免得后人以为本门禁什么都拦）：
 *   判红 = 「**写错了**」（形态不对、类型不对、覆盖了自动注入）；
 *   note = 「**忘了写**」（契约里标的是"建议"）。
 *   `excerpt` 缺失归到 note 这一档是**本轮定的**，已登记为**待拍板 46** ——
 *   本人若认为"忘了写摘要"也该拦，改 F10 一处即可。
 *
 * ⚠️ **自证存活**：站内 0 篇文章时，F1–F9 / F11 一条都跑不到 ——
 *   本门禁会在结尾**明说「判据未执行（站内还没有文章）」**，不把它写成「通过」。
 *   判据本身有没有牙齿，由 `scripts/test-blog-frontmatter.cjs` 的夹具站负责
 *   （那个自测**接在 build 链上**，每次 build 都证明一遍）。
 *
 * ⚠️ F12 读的是目录数据文件的**源码文本**（不是 require 它）：夹具站在 /tmp 里，
 *   那个文件 `require("../../eleventy-helpers.cjs")` 会解析不到 ——
 *   所以这里只做**文本层面的**核对（键名与 `getSlugFromData` 的出现）。
 *
 * 环境变量：
 *   BLOG_DIR        —— 覆盖要扫的文章目录（自测的夹具站用它）；
 *   BLOG_DATA_FILE  —— 覆盖目录数据文件的路径（默认取 BLOG_DIR 下的同名文件）。
 */
const fs = require("fs");
const path = require("path");
const matter = require("gray-matter"); // Eleventy 自己用的 front matter 解析器

const ROOT = path.resolve(__dirname, "..");
const BLOG_DIR = process.env.BLOG_DIR || path.join(ROOT, "src", "content", "blog");
const BLOG_DATA_FILE =
  process.env.BLOG_DATA_FILE || path.join(BLOG_DIR, "blog.11tydata.cjs");

/** slug 命名规则（规范 §1：小写 ASCII + 连字符）。 */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** 纯日期 YYYY-MM-DD（不带时分秒）。 */
const PURE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** front matter 原文块（只看第一个 --- 到下一个 ---）。 */
const FRONT_MATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?=\r?\n|$)/;

/* ---------- 封面（F13–F15） ---------- */
/* 封面文件名必须是 `cover.<ext>`。这个扩展名集合**不是**这里拍脑袋定的，
   而是与 eleventy.config.js 的 copyCovers() 实际复制的五种一一对应
   （它只复制名为 cover.svg / cover.png / cover.jpg / cover.jpeg / cover.webp 的文件）。
   写成别的名字 ⇒ 源码里有这个文件、F9 也绿，但产物里根本没有它 ⇒ 封面 404。 */
const COVER_NAME_RE = /^cover\.(svg|png|jpg|jpeg|webp)$/;
/* 扩展名 ⇒ 期望的**真实**格式（用来跟字节嗅探结果对账）。 */
const EXT_FORMAT = { svg: "SVG", png: "PNG", jpg: "JPEG", jpeg: "JPEG", webp: "WebP" };

const problems = [];
const notes = [];
const fail = (m) => problems.push(m);
const note = (m) => notes.push(m);

/** 给人看的路径：站内显示相对仓库根的路径；自测夹具在 /tmp（仓库外）时，
    退一步显示相对文章目录的路径 —— 红因里塞一串 "../../../.." 没人看得下去。 */
function displayPath(p) {
  const toRoot = path.relative(ROOT, p).split(path.sep).join("/");
  if (toRoot && !toRoot.startsWith("..")) return toRoot;
  const toBlog = path.relative(BLOG_DIR, p).split(path.sep).join("/");
  if (toBlog && !toBlog.startsWith("..")) return toBlog;
  return path.basename(p) || p;
}

/** 嗅探一个文件的**真实格式**（只看头几个字节，够判类型就行）。
    返回 { format, label } 或 null（读不出来 / 不认识）。
    ⚠️ 自带魔数判断，**不 import** 被检查方的任何代码。 */
function sniffFormat(file) {
  let buf;
  try {
    const fd = fs.openSync(file, "r");
    try {
      buf = Buffer.alloc(Math.min(4096, fs.fstatSync(fd).size));
      fs.readSync(fd, buf, 0, buf.length, 0);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
  const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length >= 8 && PNG_SIG.every((b, i) => buf[i] === b)) {
    return { format: "PNG", label: "PNG 位图" };
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { format: "JPEG", label: "JPEG 位图" };
  }
  if (
    buf.length >= 12 &&
    buf.toString("latin1", 0, 4) === "RIFF" &&
    buf.toString("latin1", 8, 12) === "WEBP"
  ) {
    return { format: "WebP", label: "WebP 位图" };
  }
  if (buf.length >= 4 && buf.toString("latin1", 0, 4) === "GIF8") {
    return { format: "GIF", label: "GIF 位图" };
  }
  /* SVG 是文本：文件里得有 <svg …> 标签才算数
     （只看开头 2 KB；只看 "<svg" 三个字母会把 XML 声明误判成 SVG）。 */
  if (/<svg[\s>]/i.test(buf.toString("utf8", 0, 2048))) {
    return { format: "SVG", label: "SVG 文本" };
  }
  return null;
}

/* ---------- 目录数据文件：F12（永远会跑） ---------- */
let dataFileChecked = 0;
if (!fs.existsSync(BLOG_DIR)) {
  fail(
    `文章目录不存在：${displayPath(BLOG_DIR)} —— ` +
      `博客集合的入口目录没了，articles 收不到任何页面。`
  );
} else {
  if (!fs.existsSync(BLOG_DATA_FILE)) {
    fail(
      `目录数据文件不存在：${path.relative(ROOT, BLOG_DATA_FILE) || BLOG_DATA_FILE} —— ` +
        `规范 §1 依赖它自动注入 layout / permalink / tags / prev / next；` +
        `它没了，文章会退回 Eleventy 默认布局与默认 URL。`
    );
  } else {
    const dataSrc = fs.readFileSync(BLOG_DATA_FILE, "utf8");
    const rel = displayPath(BLOG_DATA_FILE);
    /** 自动注入的 5 个字段：键名必须都还在。 */
    const REQUIRED_KEYS = [
      { key: "layout", why: "文章用详情页版式渲染" },
      { key: "permalink", why: "URL 由目录名决定（/blog/<slug>/）" },
      { key: "tags", why: "集合名标签" },
      { key: "prev", why: "详情页底部的上一篇" },
      { key: "next", why: "详情页底部的下一篇" },
    ];
    for (const { key, why } of REQUIRED_KEYS) {
      const re = new RegExp(`^\\s*${key}\\s*:`, "m");
      if (!re.test(dataSrc)) {
        fail(
          `目录数据文件 ${rel} 里没有注入 \`${key}\`（${why}）—— ` +
            `规范 §1 把它列为「自动注入、不要重复写」的字段，少了它，文章会渲染不对。`
        );
      } else {
        dataFileChecked++;
      }
    }
    if (!/tags\s*:\s*\[[^\]]*["']blog["']/.test(dataSrc)) {
      fail(
        `目录数据文件 ${rel} 的 \`tags\` 里没有集合名 "blog" —— ` +
          `规范 §2.2 说详情页与列表页都靠它区分「主题标签」与「集合名」。`
      );
    } else {
      dataFileChecked++;
    }
    if (!/getSlugFromData/.test(dataSrc)) {
      fail(
        `目录数据文件 ${rel} 没有用 getSlugFromData() 取 slug —— ` +
          `规范 §1 写死「slug = 目录名」（不读 front matter 的 slug 字段）；` +
          `换成别的取法，permalink 与规范就不一致了。`
      );
    } else {
      dataFileChecked++;
    }
  }
}

/* ---------- 扫文章目录 ---------- */
const articles = []; // { slug, file }
const flatFiles = []; // 直接躺在 BLOG_DIR 下的 .md
const dirsWithoutIndex = [];

if (fs.existsSync(BLOG_DIR)) {
  for (const name of fs.readdirSync(BLOG_DIR).sort()) {
    const full = path.join(BLOG_DIR, name);
    if (!fs.statSync(full).isDirectory()) {
      if (name.endsWith(".md")) flatFiles.push(full);
      continue;
    }
    const index = path.join(full, "index.md");
    if (fs.existsSync(index)) {
      articles.push({ slug: name, file: index });
    } else {
      dirsWithoutIndex.push(full);
    }
  }
}

/* ---------- F1：形状 ---------- */
for (const f of flatFiles) {
  const rel = displayPath(f);
  fail(
    `${rel}: 文章文件不能直接躺在文章目录根下 —— ` +
      `规范 §1 规定形状是 \`<slug>/index.md\`；扁平文件的目录名是 "blog"，` +
      `permalink 会解析成 /blog/blog/（多篇挤到同一个 URL）。`
  );
}
for (const d of dirsWithoutIndex) {
  const rel = displayPath(d);
  const leftovers = fs.readdirSync(d);
  note(
    `${rel}/: 这个目录里没有 index.md（现有：${leftovers.join("、") || "空"}）—— ` +
      `规范 §1 的文章形状是 \`<slug>/index.md\`；若它是废弃目录，删掉即可。`
  );
}

/* ---------- 逐篇核 front matter（F2–F11） ---------- */
let comparedArticles = 0;
let comparedFields = 0;
/* 封面计数（F14 的自证依据）：声明了 cover 的文章 / 其中文件确实在的 /
   其中真的读出了真实格式的。 */
let coverDeclared = 0;
let coverPresent = 0;
let coverVerified = 0;
const coverUnverified = [];

for (const a of articles) {
  const rel = displayPath(a.file);
  const src = fs.readFileSync(a.file, "utf8");
  comparedArticles++;

  // F2 slug 命名
  if (!SLUG_RE.test(a.slug)) {
    fail(
      `${rel}: slug "${a.slug}" 不符合命名规则 —— ` +
        `规范 §1 要求「小写 ASCII + 连字符」（如 trmm-stage-lightning）；` +
        `目录名会直接进 URL，大写 / 下划线 / 空格 / 连续连字符都会让链接变丑。`
    );
  } else {
    comparedFields++;
  }

  // F3 front matter 可解析
  const rawMatch = src.match(FRONT_MATTER_RE);
  let data = null;
  if (!rawMatch) {
    fail(
      `${rel}: 没有 front matter（--- 包裹的那一段）—— ` +
        `规范 §2 的契约全在 front matter 里，读不到就没有 title / date / excerpt。`
    );
    continue;
  }
  try {
    data = matter(src).data;
  } catch (e) {
    fail(
      `${rel}: front matter 解析失败 —— ${String(e.message || e).split("\n")[0]}；` +
        `YAML 写错会让整篇文章的数据层为空。`
    );
    continue;
  }
  comparedFields++;

  // F4 title 必需
  if (data.title === undefined || data.title === null || data.title === "") {
    fail(
      `${rel}: front matter 缺 \`title\` —— 规范 §2 把它列为**必需**；` +
        `缺了详情页 h1 空白、列表卡无名。`
    );
  } else if (typeof data.title !== "string") {
    fail(
      `${rel}: \`title\` 必须是字符串（现在是 ${typeof data.title}）—— ` +
        `模板直接把它当标题文本输出。`
    );
  } else {
    comparedFields++;
  }

  // F5 date 必需且是纯日期
  //   ⚠️ 必须看**原文那一行**：YAML 会把 2026-10-18 解析成 Date 对象，
  //   解析后的值分辨不出「纯日期」与「带时分」。
  const dateLine = rawMatch[1].match(/^[ \t]*date[ \t]*:[ \t]*(.*)$/m);
  if (!dateLine) {
    fail(
      `${rel}: front matter 缺 \`date\` —— 规范 §2 把它列为**必需**；` +
        `它决定列表卡眉标、详情页日期、feed 的 pubDate 与 prev/next 排序。`
    );
  } else {
    const rawDate = dateLine[1].trim().replace(/^["']|["']$/g, "").trim();
    if (!PURE_DATE_RE.test(rawDate)) {
      fail(
        `${rel}: \`date\` 必须是纯日期 YYYY-MM-DD（现在是 "${rawDate}"）—— ` +
          `规范 §2.1 要求「只写日期，不写时分」：带了时分，Eleventy 会在 ` +
          `Data cascade value for \`date\` 这里 fatal、整个 build 挂掉。`
      );
    } else {
      comparedFields++;
    }
  }

  // F6 readingTime 必须是纯数字
  if (data.readingTime !== undefined && data.readingTime !== null) {
    const rt = data.readingTime;
    const isNumber = typeof rt === "number" && Number.isFinite(rt) && rt > 0;
    const isNumericString = typeof rt === "string" && /^\d+$/.test(rt.trim()) && Number(rt.trim()) > 0;
    if (!isNumber && !isNumericString) {
      fail(
        `${rel}: \`readingTime\` 必须是纯数字（现在是 ${JSON.stringify(rt)}）—— ` +
          `模板直接拼 "\${readingTime} min read"，写成 "3 min" 会印成 "3 min min read"。`
      );
    } else {
      comparedFields++;
    }
  }

  // F7 tags 必须是字符串数组
  if (data.tags !== undefined && data.tags !== null) {
    if (!Array.isArray(data.tags) || data.tags.some((t) => typeof t !== "string")) {
      fail(
        `${rel}: \`tags\` 必须是字符串数组（现在是 ${JSON.stringify(data.tags)}）—— ` +
          `列表卡把它们当主题标签逐个渲染成徽章。`
      );
    } else {
      comparedFields++;
    }
  }

  // F8 不得覆盖自动注入的字段
  for (const key of ["layout", "permalink"]) {
    if (data[key] !== undefined) {
      fail(
        `${rel}: front matter 覆盖了 \`${key}\` —— ` +
          `规范 §1 说这两个字段是目录数据**自动注入**的，front matter 里再写就是覆盖；` +
          `覆盖后 permalink 会把文章挪到别处、layout 会换成别的版式。`
      );
    } else {
      comparedFields++;
    }
  }

  // F9 cover 必须在同目录真实存在
  if (data.cover !== undefined && data.cover !== null && data.cover !== "") {
    const coverPath = path.join(path.dirname(a.file), String(data.cover));
    if (!fs.existsSync(coverPath)) {
      fail(
        `${rel}: \`cover\` 指向的文件不存在（${String(data.cover)}）—— ` +
          `规范 §2.3 说它只能是**同目录下的文件名**；文件不在，封面开关一开就是裂图。`
      );
    } else {
      comparedFields++;
    }
  }

  // F13 / F14 / F15：封面
  //   F9 只查"文件在不在"；这两条查的是**别的两件事**：
  //   真实字节格式与扩展名对不对得上（F13）、文件名是不是构建脚本会复制的那种（F15）。
  if (data.cover !== undefined && data.cover !== null && data.cover !== "") {
    const coverName = String(data.cover);
    coverDeclared++;
    const coverPath = path.join(path.dirname(a.file), coverName);

    // F15：文件名必须是 cover.<ext>
    if (!COVER_NAME_RE.test(coverName)) {
      fail(
        `${rel}: \`cover\` 的文件名必须是 \`cover.<ext>\`（现在是 ${JSON.stringify(coverName)}）—— ` +
          `规范 §2.3 说它只能是同目录下的文件名；构建脚本的 copyCovers() **只复制** ` +
          `cover.svg / cover.png / cover.jpg / cover.jpeg / cover.webp 这五种名字，` +
          `别的名字不会进产物 ⇒ 封面开关一开就是 404。`
      );
    }

    // F13：真实字节格式必须与扩展名一致
    if (fs.existsSync(coverPath) && fs.statSync(coverPath).isFile()) {
      coverPresent++;
      const ext = path.extname(coverName).toLowerCase().replace(/^\./, "");
      const want = EXT_FORMAT[ext];
      const got = sniffFormat(coverPath);
      if (!got) {
        coverUnverified.push(coverName);
        fail(
          `${rel}: 读不出 \`cover\` 的真实格式（${coverName}）—— ` +
            `它既不是 PNG / JPEG / WebP 位图，也不是 SVG 文本；` +
            `规范 §2.3 要求封面是**能被浏览器解码的真图**，否则就是裂图。`
        );
      } else if (want && got.format !== want) {
        coverVerified++;
        fail(
          `${rel}: \`cover\` 的真实格式与扩展名对不上（文件叫 ${coverName}，` +
            `里面装的是 ${got.label}）—— 服务器按扩展名发 Content-Type，` +
            `浏览器拒绝解码 ⇒ naturalWidth = 0 ⇒ **裂图**；` +
            `规范 §2.3 记的就是这个坑：真 SVG 必须用 .svg 扩展名。`
        );
      } else {
        coverVerified++;
      }
      comparedFields++;
    }
  }

  // F10 excerpt 缺失 ⇒ note（契约写的是「强烈建议」；是否升级为判红 = 待拍板 46）
  const hasExcerpt = typeof data.excerpt === "string" && data.excerpt.trim() !== "";
  if (!hasExcerpt) {
    note(
      `${rel}: 没有 \`excerpt\` —— 规范 §2 把它列为「强烈建议」；` +
        `缺了列表卡整块摘要消失，只剩标题 / 日期 / 阅读时长。`
    );
  } else {
    comparedFields++;
  }

  // F11 excerpt 与 title 逐字相同 ⇒ note（规范 §4 的自查项）
  if (hasExcerpt && typeof data.title === "string" && data.excerpt.trim() === data.title.trim()) {
    note(
      `${rel}: \`excerpt\` 与 \`title\` 逐字相同 —— 规范 §4 说摘要不该复读标题，` +
        `复读等于没给读者任何额外信息。`
    );
  } else {
    comparedFields++;
  }
}

/* ---------- F14：覆盖度自证 ---------- */
/* 应验 = 声明了封面且文件确实在磁盘上的；实测 = 真的读出了真实格式的。
   两者必须相等 —— 否则本门禁在"有封面"的情况下判绿，而它其实什么都没验，
   那就是**空跑**，空跑的门禁等于没有门禁。
   （与图片门禁 IA6 同一族：判据依赖可被截断的输入时会静默空跑。） */
if (coverPresent > 0 && coverVerified !== coverPresent) {
  fail(
    `封面判据 F14：应验 ${coverPresent} 张封面（文件确实在磁盘上），` +
      `实测只读出真实格式 ${coverVerified} 张 —— ` +
      `本门禁在有封面时等于**空跑**，空跑的门禁等于没有门禁，所以判红。` +
      `没验出来的：${coverUnverified.join("、") || "（未点名）"}`
  );
}

/* ---------- 汇总 ---------- */
const shown = problems.slice(0, 40);
if (problems.length) {
  console.error("博客 front matter 契约门禁未通过：\n");
  shown.forEach((p) => console.error(`  ✗ ${p}`));
  if (problems.length > shown.length) {
    console.error(`  ✗ …另有 ${problems.length - shown.length} 条红因未展开`);
  }
  console.error("");
  console.error(
    `  契约出处：docs/blog-writing-guide.md（§1 位置与命名 / §2 front matter 契约 / ` +
      `§2.1~§2.3 各字段的"写错会怎样"）。`
  );
  console.error("");
  process.exit(1);
}

console.log(
  `博客 front matter 契约门禁通过：扫了 ${articles.length} 篇文章、` +
    `比了 ${comparedFields} 处 front matter 字段；` +
    `目录数据文件的自动注入字段核了 ${dataFileChecked} 项；` +
    `封面核了 ${coverVerified} 张（声明 ${coverDeclared} 张、文件在 ${coverPresent} 张）。`
);
if (notes.length) {
  console.log(`  · note（**不判红**，契约里标的是"建议"）：`);
  notes.forEach((n) => console.log(`      · ${n}`));
}
if (articles.length === 0 || coverDeclared === 0) {
  const gaps = [];
  if (articles.length === 0) {
    gaps.push(
      `站内还没有文章 ⇒ F1–F9 / F11 / F13–F15 这些**逐篇**判据**当前未执行**（不是"通过"）`
    );
  }
  if (coverDeclared === 0) {
    gaps.push(`站内还没有封面 ⇒ F13 / F14 / F15 这些**逐封面**判据**当前未执行**（不是"通过"）`);
  }
  console.log(
    `  ⚠️ ${gaps.join("；")}；` +
      `F12（目录数据文件的自动注入字段）本轮真的跑了。` +
      `判据本身有没有牙齿由 scripts/test-blog-frontmatter.cjs 的夹具站负责` +
      `（那个自测接在 build 链上，每次 build 都证明一遍）。`
  );
}
console.log(
  `  · 判红 = "写错了"（形态 / 类型 / 覆盖了自动注入）；note = "忘了写"（契约标的是"建议"）。` +
    `excerpt 缺失归 note 是本轮定的，已登记为待拍板 46。`
);
