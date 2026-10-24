#!/usr/bin/env node
/**
 * 自测：scripts/check-jsonld.cjs（门禁 J0–J13）
 *
 * 为什么要有这个自测：
 *   这道门禁守的是"结构化数据这一层还在不在、接不接得上"——它一旦失效，
 *   **不会报错**：页面照出、JSON-LD 照常合法、其它门禁全绿，只有逐个节点读
 *   才知道少了一层。空跑的门禁等于没有门禁。
 *
 * 本自测的形态（与 scripts/test-identity-derivation.cjs 同一套范式）：
 *   · 绿档（G0–G3）—— 临时目录上的基线必须全绿
 *   · 注入档（J0–J13，含 J11b）—— 每条判据各来一个"只让它红"的坏形态，
 *     断言红因编号**多重集恰好**等于预期 ⇒ 证明它真的会红、且归属纯净
 *   · 判据级负对照（N-J0–N-J13，含 N-J11b）—— 同一个坏形态 + 卸掉该判据的开关
 *     ⇒ 该判据的红因必须**一个都不剩** ⇒ 证明开关真的被 fail() 消费
 *   · 精准性负对照（P-*）—— 合法但少见的写法不该被误伤
 *   · 退回旧口径（RE-*）—— 把新口径的关键机制拆掉，证明旧口径确实漏
 *
 *   共 40 档：4 绿 + 15 注入 + 15 判据级负对照 + 3 精准性 + 3 退回旧口径。
 *
 * ⚠️ 全部注入都在**临时目录里的副本**上做，仓库里的原件一个字节都不动
 *   （收尾时用 SHA-256 校验）。
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const GATE = path.join(ROOT, "scripts", "check-jsonld.cjs");

function sha256(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

/* 原件指纹：**自测开始时**记下来，收尾时比对 ——
   证明这一整轮注入全在副本上，仓库里的原件一个字节都没动。 */
const GATE_SHA_AT_START = sha256(GATE);

/* ---------- 夹具里的固定事实 ---------- */
const SITE_URL = "https://example.test";
const SITE_ID = `${SITE_URL}/#website`;
const PERSON_ID = `${SITE_URL}/#person`;
const HOME_URL = `${SITE_URL}/`;
const HOME_PAGE_ID = `${HOME_URL}#webpage`;
const PAPER_URL = `${SITE_URL}/papers/paper/`;
const PAPER_PAGE_ID = `${PAPER_URL}#webpage`;
const PAPER_ID = PAPER_URL;
const OG_IMAGE = `${SITE_URL}/assets/cover.png`;
/* 博客文章页（J13 用）：作品实体的 @id = 页面 URL（**无片段**），
   与页面实体的 @id（带 #webpage）不同 —— 这不是自引用。 */
const BLOG_URL = `${SITE_URL}/blog/post/`;
const BLOG_PAGE_ID = `${BLOG_URL}#webpage`;
const BLOG_ID = BLOG_URL;
/* ⚠️ 标题与描述里**故意带撇号**：HTML 侧写成 `&#39;`，JSON-LD 侧是原字符 ——
   J13 逐字比较前必须解 HTML 实体，否则会把同一句话判成两句（假红）。 */
const BLOG_TITLE = "A reader's first impression";
const BLOG_DESC = "What a reader's first impression actually is.";
const BLOG_DATE = "2026-10-24";

/* ---------- 从门禁源码里解析可卸开关表（不在本文件写死）----------
   跟门禁一样的理由：仓库里只能有一份判据清单。
   写死的话，门禁改了开关名而自测没改 ⇒ 自测仍在测一个不存在的开关。 */
function readSwitches(gateSrc) {
  const ids = [...gateSrc.matchAll(/const (J\d+)_ON = true;/g)].map((m) => m[1]);
  if (!ids.length) throw new Error("解析不到门禁的可卸开关声明（const Jx_ON = true;）—— 自测中止。");
  return ids;
}
const SWITCH_IDS = readSwitches(fs.readFileSync(GATE, "utf8"));

/* ---------- 夹具源码 ---------- */
const SITE_SRC = [
  "module.exports = {",
  `  url: "${SITE_URL}",`,
  "  author: {",
  '    name: "Demo Author",',
  "  },",
  "};",
  "",
].join("\n");

/* 首页源：front matter 顶层声明 profilePage: true（⇒ 角色 ProfilePage）。 */
const HOME_SRC = ["---", "profilePage: true", "---", "", "<p>home</p>", ""].join("\n");

/* 论文页源：显式写 profilePage: false（按约定仍是 WebPage）。
   ⚠️ 为什么显式写 false 而不是"不写"：
      ① 判据级负对照要把「显式 false」与「没有这一项」两种写法都钉住；
      ② injJ10 需要一个**可以原地翻面**的键（同行替换 ⇒ 行数不变 ⇒ 位置口径不位移）。 */
const PAPER_SRC = [
  "---",
  "layout: layouts/base.njk",
  "profilePage: false",
  "---",
  "",
  "<p>paper</p>",
  "",
].join("\n");

/* 博客文章页源：**没有** profilePage（按约定是 WebPage），
   作品类型 `structuredType` 走**目录数据文件**（数据层的第三条路径）。
   ⚠️ 为什么不给它写 front matter 里的 structuredType：
      那样就只测到了三条路径里的一条；目录数据文件是本站真实的做法
      （src/content/blog/blog.11tydata.cjs 就是这么注入的）。 */
const BLOG_SRC = [
  "---",
  'title: "A reader\'s first impression"',
  "layout: layouts/detail.njk",
  "---",
  "",
  "<p>post</p>",
  "",
].join("\n");

/* 目录数据文件：注入集合级的裸键 structuredType。 */
const BLOG_DATA_SRC = [
  'module.exports = { structuredType: "BlogPosting" };',
  "",
].join("\n");

/* ================= 夹具 ================= */

function write(p, text) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
}

/* 产物：一页一个 ld+json 块（站点 / 页面实体 / 本人），论文页再加论文实体。 */
function homeHtml() {
  const blocks = [
    `<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","@id":"${SITE_ID}","url":"${HOME_URL}","publisher":{"@id":"${PERSON_ID}"}}</script>`,
    `<script type="application/ld+json">{"@context":"https://schema.org","@type":"ProfilePage","@id":"${HOME_PAGE_ID}","url":"${HOME_URL}","isPartOf":{"@id":"${SITE_ID}"},"mainEntity":{"@id":"${PERSON_ID}"}}</script>`,
    `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Person","@id":"${PERSON_ID}","name":"Demo Author"}</script>`,
  ].join("\n");
  return [
    "<!doctype html>",
    '<html><head>',
    `<link rel="canonical" href="${HOME_URL}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    "</head><body>",
    "<!-- source: src/index.njk -->",
    blocks,
    "</body></html>",
    "",
  ].join("\n");
}

function paperHtml(dateModified) {
  const blocks = [
    `<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","@id":"${SITE_ID}","url":"${HOME_URL}","publisher":{"@id":"${PERSON_ID}"}}</script>`,
    `<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage","@id":"${PAPER_PAGE_ID}","url":"${PAPER_URL}","isPartOf":{"@id":"${SITE_ID}"},"mainEntity":{"@id":"${PAPER_ID}"}}</script>`,
    `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Person","@id":"${PERSON_ID}","name":"Demo Author"}</script>`,
    `<script type="application/ld+json">{"@context":"https://schema.org","@type":"ScholarlyArticle","@id":"${PAPER_ID}","mainEntityOfPage":{"@id":"${PAPER_PAGE_ID}"},"image":"${OG_IMAGE}","dateModified":"${dateModified}"}</script>`,
  ].join("\n");
  return [
    "<!doctype html>",
    '<html><head>',
    `<link rel="canonical" href="${PAPER_URL}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    "</head><body>",
    "<!-- source: src/papers/paper.njk -->",
    blocks,
    "</body></html>",
    "",
  ].join("\n");
}

const NOT_FOUND_HTML = ["<!doctype html>", "<html><body>404</body></html>", ""].join("\n");

/* 博客文章页产物：多一个作品实体（BlogPosting），页面实体的 mainEntity 指向它。
   ⚠️ HTML 侧的 h1 / meta description 里的撇号写成 `&#39;`，JSON-LD 侧是原字符 ——
      J13 比较前必须解实体，否则这一页会被判成"机器读到的与人看到的不是同一句"。 */
function blogHtml() {
  const ent = (s) => s.replace(/'/g, "&#39;");
  const blocks = [
    `<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","@id":"${SITE_ID}","url":"${HOME_URL}","publisher":{"@id":"${PERSON_ID}"}}</script>`,
    `<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage","@id":"${BLOG_PAGE_ID}","url":"${BLOG_URL}","isPartOf":{"@id":"${SITE_ID}"},"mainEntity":{"@id":"${BLOG_ID}"}}</script>`,
    `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Person","@id":"${PERSON_ID}","name":"Demo Author"}</script>`,
    `<script type="application/ld+json">{"@context":"https://schema.org","@type":"BlogPosting","@id":"${BLOG_ID}","url":"${BLOG_URL}","headline":"${BLOG_TITLE}","description":"${BLOG_DESC}","datePublished":"${BLOG_DATE}","author":{"@id":"${PERSON_ID}"},"mainEntityOfPage":{"@id":"${BLOG_PAGE_ID}"}}</script>`,
  ].join("\n");
  return [
    "<!doctype html>",
    '<html><head>',
    `<link rel="canonical" href="${BLOG_URL}" />`,
    `<meta name="description" content="${ent(BLOG_DESC)}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    "</head><body>",
    "<!-- source: src/blog/post.md -->",
    `<h1>${ent(BLOG_TITLE)}</h1>`,
    `<time datetime="${BLOG_DATE}">${BLOG_DATE}</time>`,
    blocks,
    "</body></html>",
    "",
  ].join("\n");
}

/* 沙箱：门禁副本 + scripts/lib 两个依赖 + 夹具源码 + 产物 + 一个 git 仓库。
   ⚠️ git 仓库是**为了让 J11 的 dateModified 真的可比**（那半条判据取的是
      依赖闭包里最晚的提交时间；没有 git 历史 ⇒ 取不到 ⇒ 无从比较）。
      沙箱在临时目录里，不在任何 git 仓库内部 ⇒ `git rev-parse --show-toplevel`
      只会看到沙箱自己。 */
function makeSandbox() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "mh-jsonld-"));
  const repo = path.join(base, "repo");
  fs.mkdirSync(path.join(repo, "scripts", "lib"), { recursive: true });
  fs.copyFileSync(GATE, path.join(repo, "scripts", "check-jsonld.cjs"));
  for (const f of ["page-deps.cjs", "git-error.cjs"]) {
    fs.copyFileSync(
      path.join(ROOT, "scripts", "lib", f),
      path.join(repo, "scripts", "lib", f)
    );
  }
  write(path.join(repo, "src", "_data", "site.js"), SITE_SRC);
  write(path.join(repo, "src", "index.njk"), HOME_SRC);
  write(path.join(repo, "src", "papers", "paper.njk"), PAPER_SRC);
  /* 博客文章页：源文件 + 目录数据文件（作品类型走数据层的第三条路径）。 */
  write(path.join(repo, "src", "blog", "post.md"), BLOG_SRC);
  write(path.join(repo, "src", "blog", "blog.11tydata.cjs"), BLOG_DATA_SRC);
  /* gray-matter 等第三方依赖：借真实仓库的 node_modules（符号链接）。
     沙箱在临时目录（APFS）⇒ 符号链接没问题。 */
  try {
    fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(repo, "node_modules"), "dir");
  } catch (e) {
    /* 借不到就退化成"gray-matter 解析不了 front matter" ⇒ J10 会判红，
       绿档会失败 —— 那比默默放过好。 */
  }
  /* git 仓库：先提交源文件，再按提交时间生成产物。 */
  const git = (args) =>
    execFileSync("git", args, { cwd: repo, stdio: ["ignore", "pipe", "ignore"] });
  git(["init", "-q"]);
  git(["add", "-A"]);
  git(["-c", "user.email=t@t.test", "-c", "user.name=T", "commit", "-q", "-m", "init"]);
  const stamp = new Date(
    git(["log", "-1", "--format=%cI", "--", "src/papers/paper.njk"]).toString().trim()
  ).toISOString();
  write(path.join(repo, "_site", "index.html"), homeHtml());
  write(path.join(repo, "_site", "papers", "paper", "index.html"), paperHtml(stamp));
  write(path.join(repo, "_site", "blog", "post", "index.html"), blogHtml());
  write(path.join(repo, "_site", "404.html"), NOT_FOUND_HTML);
  return { base, repo };
}

const homeOf = (s) => path.join(s.repo, "_site", "index.html");
const paperOf = (s) => path.join(s.repo, "_site", "papers", "paper", "index.html");
const blogOf = (s) => path.join(s.repo, "_site", "blog", "post", "index.html");
const notFoundOf = (s) => path.join(s.repo, "_site", "404.html");
const homeSrcOf = (s) => path.join(s.repo, "src", "index.njk");
const paperSrcOf = (s) => path.join(s.repo, "src", "papers", "paper.njk");
const blogSrcOf = (s) => path.join(s.repo, "src", "blog", "post.md");
const blogDataOf = (s) => path.join(s.repo, "src", "blog", "blog.11tydata.cjs");
const gateOf = (s) => path.join(s.repo, "scripts", "check-jsonld.cjs");

/* ================= 跑门禁 / 解析红因 ================= */

/** 跑副本里的门禁，返回 { code, out }。 */
function runGate(s) {
  try {
    const out = execFileSync(process.execPath, [gateOf(s)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      cwd: s.repo,
    });
    return { code: 0, out };
  } catch (e) {
    return {
      code: typeof e.status === "number" ? e.status : 1,
      out: `${e.stdout || ""}${e.stderr || ""}`,
    };
  }
}

/** 红因编号**多重集**（只认行首的「✗ 门禁 Jx：」，消息正文里出现的字样不算）。 */
function redIds(out) {
  const list = [];
  const re = /^[ \t]*✗[ \t]*门禁[ \t]+(J[0-9]{1,2})/gm;
  let m;
  while ((m = re.exec(out)) !== null) list.push(m[1]);
  return list;
}

/** 多重集完全相等（不是「包含」）：多一条、少一条都算这档失败。 */
function sameMultiset(got, want) {
  if (got.length !== want.length) return false;
  const g = [...got].sort();
  const w = [...want].sort();
  return g.every((x, i) => x === w[i]);
}

function fmtIds(ids) {
  return [...ids].sort().join("+") || "（无）";
}

/* ================= 注入手法 ================= */

/** 改一个文件；注入点找不到就当场抛错（不静默跳过）。 */
function patch(file, from, to) {
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes(from)) {
    throw new Error(
      `注入点不存在，已中止（不静默跳过）：\n  文件：${file}\n  锚点：${from}`
    );
  }
  fs.writeFileSync(file, text.replace(from, to));
}

/** 两个文本的「改动行数」—— 证明注入确实打上了，且只打了声明的那些行。 */
function changedLines(a, b) {
  const la = a.split("\n");
  const lb = b.split("\n");
  const n = Math.max(la.length, lb.length);
  let c = 0;
  for (let i = 0; i < n; i++) if (la[i] !== lb[i]) c++;
  return c;
}

/**
 * 改一个文件，并断言「这一处改动恰好动了 expectDiff 行」。
 * 增量口径保证「一处 patch 只动一行」，多改一行也会当场暴露。
 * ⚠️ 一律**同行替换**：改成多行会让后面所有行位移，`changedLines` 的位置口径
 *    会把几百行都算成"改动"⇒ 断言失效。
 */
function patchFile(file, from, to, expectDiff) {
  const before = fs.readFileSync(file, "utf8");
  patch(file, from, to);
  const n = changedLines(before, fs.readFileSync(file, "utf8"));
  if (n !== expectDiff) {
    throw new Error(
      `这一处改动的行数与声明不符（期望 ${expectDiff} 行，实际 ${n} 行）—— 已中止。\n  锚点：${from}`
    );
  }
}

/** 改**门禁副本**，并断言「这一处改动恰好动了 expectDiff 行」。 */
function patchGate(s, from, to, expectDiff) {
  patchFile(gateOf(s), from, to, expectDiff);
}

/**
 * 改一个文件，并断言「行数正好多了 expectGrow 行」。
 * 用于**会插入行**的注入（多行替换）：位置口径的 changedLines 在插入后会
 * 把后面所有行都算成"改动"⇒ 那个口径在这里没有意义 ⇒ 改用"行数增量"口径。
 */
function patchFileGrow(file, from, to, expectGrow) {
  const before = fs.readFileSync(file, "utf8");
  patch(file, from, to);
  const after = fs.readFileSync(file, "utf8");
  const grew = after.split("\n").length - before.split("\n").length;
  if (grew !== expectGrow) {
    throw new Error(
      `这一处改动多出的行数与声明不符（期望多 ${expectGrow} 行，实际多 ${grew} 行）—— 已中止。\n  锚点：${from}`
    );
  }
}

/**
 * 把门禁副本里**一段连续的判据代码**整段摘掉（换成同样行数的注释行）。
 * 用途：证明 J12 能抓到「整段判据静默失效」。
 * 口径：**行数不变**（行号不位移 ⇒ 后面所有注入点仍然对得上），
 *   并断言被摘掉的那段里**含指定标记**（证明摘对了地方），
 *   摘完必须还是一份能解析的脚本（否则红因会变成「语法错误」，归属就废了）。
 */
function neutralizeBlock(s, startAnchor, endAnchor, mustContain) {
  const file = gateOf(s);
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const start = lines.findIndex((l) => l.includes(startAnchor));
  if (start < 0) throw new Error(`起锚点不存在，已中止：${startAnchor}`);
  const tail = lines.slice(start).join("\n");
  const at = tail.indexOf(endAnchor);
  if (at < 0) throw new Error(`止锚点不存在，已中止：${endAnchor}`);
  const end = start + tail.slice(0, at + endAnchor.length).split("\n").length - 1;
  const block = lines.slice(start, end + 1);
  if (!block.some((l) => l.includes(mustContain))) {
    throw new Error(
      `被摘掉的那段里没有出现标记「${mustContain}」—— 摘错了地方，已中止。`
    );
  }
  const totalBefore = lines.length;
  const filler = Array.from({ length: block.length }, (_, i) =>
    i === 0
      ? "  // ↑ 这一段判据被摘掉了（自测注入）：用来证明 J12 能抓到「整段静默失效」。"
      : "  //"
  );
  lines.splice(start, block.length, ...filler);
  fs.writeFileSync(file, lines.join("\n"));
  if (lines.length !== totalBefore) {
    throw new Error("整段摘除后总行数变了（行号会位移）—— 已中止。");
  }
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    throw new Error(`摘掉那一段之后门禁副本不再是合法脚本 —— 已中止。\n${e.stderr || e.message}`);
  }
  return block.length;
}

/* ================= 注入档各自的动作 ================= */
/* 目标：每个注入**只**让一条判据红 ⇒
   ① 注入档能断言"红因多重集恰好等于 [那一条]" ⇒ 证明它真的会红；
   ② 判据级负对照（同一个注入 + 卸开关）能断言"完全转绿"。 */

/** J0：论文页多出一个坏 JSON 块（好块仍在 ⇒ 不影响别的判据）。 */
function injJ0(s) {
  // 同行替换（不新起一行）⇒ 夹具行数不变，后续注入点仍然对得上。
  patchFile(
    paperOf(s),
    "</body></html>",
    '<script type="application/ld+json">{ this is not json }</script></body></html>',
    1
  );
}

/** J1：首页 WebSite 的 url 与站点根不符（@id 不动 ⇒ 不牵连 isPartOf）。 */
function injJ1(s) {
  patchFile(
    homeOf(s),
    `"@type":"WebSite","@id":"${SITE_ID}","url":"${HOME_URL}"`,
    `"@type":"WebSite","@id":"${SITE_ID}","url":"${SITE_URL}/other/"`,
    1
  );
}

/** J2：首页页面实体的 url 与 canonical 不符（@id 不动）。 */
function injJ2(s) {
  patchFile(
    homeOf(s),
    `"@type":"ProfilePage","@id":"${HOME_PAGE_ID}","url":"${HOME_URL}"`,
    `"@type":"ProfilePage","@id":"${HOME_PAGE_ID}","url":"${SITE_URL}/elsewhere/"`,
    1
  );
}

/** J3：首页页面实体的 isPartOf 指向别处。 */
function injJ3(s) {
  patchFile(
    homeOf(s),
    `"isPartOf":{"@id":"${SITE_ID}"},"mainEntity":{"@id":"${PERSON_ID}"}`,
    `"isPartOf":{"@id":"${SITE_URL}/#other"},"mainEntity":{"@id":"${PERSON_ID}"}`,
    1
  );
}

/** J4：首页页面实体的 mainEntity 指向站点实体（指向错，但不是空引用）。 */
function injJ4(s) {
  patchFile(
    homeOf(s),
    `"mainEntity":{"@id":"${PERSON_ID}"}`,
    `"mainEntity":{"@id":"${SITE_ID}"}`,
    1
  );
}

/** J5：论文页的站点实体换一个 @id ⇒ 全站两个站点实体。
 *  ⚠️ 必然与 J1 同时红：那个 @id 不符 J1 的口径，这是真的（两个红因各自成立）。
 *  ⚠️ 论文页的 isPartOf 同步改到新 @id：这样 J3（页面→站点归属链）仍然自洽，
 *     注入就只留下「J1 口径不符」与「J5 全站不唯一」两条红因，归属不串。 */
function injJ5(s) {
  patchFile(
    paperOf(s),
    `"@type":"WebSite","@id":"${SITE_ID}"`,
    `"@type":"WebSite","@id":"${SITE_URL}/#website-2"`,
    1
  );
  patchFile(
    paperOf(s),
    `"isPartOf":{"@id":"${SITE_ID}"}`,
    `"isPartOf":{"@id":"${SITE_URL}/#website-2"}`,
    1
  );
}

/** J6：错误页声明了 WebSite 实体。 */
function injJ6(s) {
  patchFile(
    notFoundOf(s),
    "<html><body>404</body></html>",
    `<html><body>404<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","@id":"${SITE_ID}","url":"${HOME_URL}"}</script></body></html>`,
    1
  );
}

/** J7：全站没有一页声明 ProfilePage（两页的 profilePage 声明都注释掉，
 *  首页产物里的 @type 也同步改成 WebPage ⇒ J10 仍然一致，只有 J7 的两条自证红）。
 *  ⚠️ 注释掉而不是删掉：删行会让后面的行位移 ⇒ 位置口径的断言失效；
 *     注释掉是**同一行**的改写，行数不变，且 YAML 里注释行不是声明 ⇒ 效果相同。 */
function injJ7(s) {
  patchFile(homeSrcOf(s), "profilePage: true", "# profilePage: true", 1);
  patchFile(paperSrcOf(s), "profilePage: false", "# profilePage: false", 1);
  patchFile(
    homeOf(s),
    `"@type":"ProfilePage","@id":"${HOME_PAGE_ID}"`,
    `"@type":"WebPage","@id":"${HOME_PAGE_ID}"`,
    1
  );
}

/** J8：同一个 @id 挂了两种 @type（加一个 @id 与论文实体相同、类型不同的节点；
 *  类型用 "Thing" ⇒ 不进"页面实体"计数 ⇒ 不牵连 J2）。
 *  ⚠️ 同行替换（不新起一行）⇒ 夹具行数不变。 */
function injJ8(s) {
  patchFile(
    paperOf(s),
    "</body></html>",
    `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Thing","@id":"${PAPER_ID}"}</script></body></html>`,
    1
  );
}

/** J9：论文实体的 mainEntityOfPage 指向它自己。 */
function injJ9(s) {
  patchFile(
    paperOf(s),
    `"mainEntityOfPage":{"@id":"${PAPER_PAGE_ID}"}`,
    `"mainEntityOfPage":{"@id":"${PAPER_ID}"}`,
    1
  );
}

/** J10：论文页源文件声明 profilePage: true（把 false 翻面），
 *  产物里的 @type 仍是 WebPage ⇒ 角色不一致（J10 红），
 *  且不影响 j10ProfilePages（首页仍是 ProfilePage，全站仍有 ProfilePage）。 */
function injJ10(s) {
  patchFile(paperSrcOf(s), "profilePage: false", "profilePage: true", 1);
}

/** J11：论文实体的 image 与该页第一个 og:image 不是同一个（图文不符）。
 *  ⚠️ 为什么用"对不上"而不是"没有 image"：少了 image 时 J11 的 image 比对
 *     **从未发生** ⇒ J7 的存活自证会另外红一条（那是自证在正常工作，不是归属污染）。
 *     两种形态都要覆盖，所以拆成两档：injJ11（对不上）与 injJ11b（没有）。 */
function injJ11(s) {
  patchFile(
    paperOf(s),
    `"image":"${OG_IMAGE}"`,
    `"image":"${SITE_URL}/assets/other.png"`,
    1
  );
}

/** J11b：论文实体没有 image ⇒ J11 红 + J7 的存活自证红（image 比对从未发生）。 */
function injJ11b(s) {
  patchFile(paperOf(s), `,"image":"${OG_IMAGE}"`, "", 1);
}

/** J12：把 J3（归属链）整段判据摘掉 ⇒ 覆盖度自证必须红。 */
function injJ12(s) {
  neutralizeBlock(
    s,
    "/* ---- J3：归属链完整",
    'waive("J3.publisher", from);\n  }',
    'mark("J3.isPartOf", from);'
  );
}

/** J13：作品实体的 headline 与页面 h1 不是同一句
 *  （机器读到的标题 ≠ 人看到的标题）。
 *  ⚠️ 为什么改 headline 而不是把整个 BlogPosting 块删掉：
 *     删块 ⇒ J13 的"恰好一个实体"红 **加上** J4 的"mainEntity 成了空引用"红
 *     ⇒ 两条红因，归属不纯（那两条各自都成立，但这一档就同时测了两条判据）。
 *     只改 headline ⇒ 恰好一条 J13 红因。 */
function injJ13(s) {
  patchFile(
    blogOf(s),
    `"headline":"${BLOG_TITLE}"`,
    '"headline":"A headline that is not the page title"',
    1
  );
}

/* ================= 断言 ================= */

const results = [];
function record(id, ok, detail) {
  results.push({ id, ok, detail });
}

/** 一档「应当红，且红因编号多重集**恰好**等于 want」。 */
function expectRed(id, s, want, o = {}) {
  const r = runGate(s);
  const got = redIds(r.out);
  const ok =
    r.code !== 0 && sameMultiset(got, want) && (!o.mustContain || r.out.includes(o.mustContain));
  record(
    id,
    ok,
    ok
      ? `红了，红因编号 = ${fmtIds(got)}（归属纯净）${o.note ? "；" + o.note : ""}`
      : `期望红因 ${fmtIds(want)} 且只有这些` +
        `${o.mustContain ? `、文案含「${o.mustContain}」` : ""}` +
        `，实际 code=${r.code} 红因 ${fmtIds(got)}\n${r.out}`
  );
}

/** 一档「应当绿：exit 0 且一个红因都不许有」。 */
function expectGreen(id, s, note) {
  const r = runGate(s);
  const got = redIds(r.out);
  const ok = r.code === 0 && got.length === 0;
  record(
    id,
    ok,
    ok
      ? `转绿了，红因一个不剩${note ? "；" + note : ""}`
      : `仍然红（code=${r.code}）红因 ${fmtIds(got)} ⇒ 负对照不成立\n${r.out}`
  );
}

/** 一档「绿档」：门禁应当 exit 0 且一个红因都不许有。
 *  o.mustContain —— 输出里必须出现的一段文字（用来钉住"走的是哪条数据层路径"）。 */
function expectGreenBaseline(id, s, note, o = {}) {
  const r = runGate(s);
  const got = redIds(r.out);
  const ok =
    r.code === 0 && got.length === 0 && (!o.mustContain || r.out.includes(o.mustContain));
  record(
    id,
    ok,
    ok
      ? `绿${note ? "；" + note : ""}`
      : `不该红，却 exit ${r.code}，红因 ${fmtIds(got)}` +
        `${o.mustContain ? `，输出里也没有「${o.mustContain}」` : ""}\n${r.out}`
  );
}

/**
 * 一档「某个编号的红因必须**一个都不剩**」。
 *  o.also —— 允许残留的红因编号**多重集**（必须**恰好**是它，不多不少）。
 *            默认为空 ⇒ 除 goneId 外一个红因都不许剩（门禁必须完全转绿）。
 *  ⚠️ 有些残留是**应该**残留的：例如 J5 的注入必然让 J1 也红（造第二个站点
 *     实体 ⇒ 那个页面的 @id 不符 J1 口径）；J11b 让 J11 的 image 比对从未发生
 *     ⇒ J7 的存活自证理应红一条。那是自证在正常工作，不是归属污染。
 */
function expectNoRed(id, s, goneId, o = {}) {
  const r = runGate(s);
  const got = redIds(r.out);
  const also = o.also || [];
  const ok = !got.includes(goneId) && sameMultiset(got, also);
  record(
    id,
    ok,
    ok
      ? `「${goneId}」的红因一个都不剩` +
        `（现存红因 ${fmtIds(got)}）${o.note ? "；" + o.note : ""}`
      : `期望没有「${goneId}」的红因、且现存红因恰好是 ${fmtIds(also)}，` +
        `实际 ${fmtIds(got)}\n${r.out}`
  );
}

/* ================= G0 / G1 / G2 / G3：绿档 ================= */

/* G0：基线 —— 临时目录上全绿。 */
{
  const s = makeSandbox();
  expectGreenBaseline(
    "G0 基线（临时目录上）",
    s,
    "站点实体 / 页面实体 / 归属链 / mainEntity / 论文实体 / 作品实体全部接得上，31 个比较点都跑过"
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* G1：覆盖度自证真的在跑（输出里有那行）。 */
{
  const s = makeSandbox();
  const r = runGate(s);
  const ok = r.code === 0 && /逐比较点覆盖度自证：\d+\/\d+ 个比较点都跑过/.test(r.out);
  record(
    "G1 覆盖度自证在跑",
    ok,
    ok ? "输出里有覆盖度自证那一行" : `输出里没有覆盖度自证那一行\n${r.out}`
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* G2：门禁的输出里有编号化的红因前缀（结构自证：编号真的进了输出）。 */
{
  const s = makeSandbox();
  injJ3(s);
  const r = runGate(s);
  const ok = r.code !== 0 && /^\s*✗\s*门禁\s+J3：/m.test(r.out);
  record(
    "G2 红因带编号前缀",
    ok,
    ok ? "红因形如「✗ 门禁 J3：…」" : `红因没有编号前缀\n${r.out}`
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* G3：判定开关真被 fail() 消费（卸掉 J3 ⇒ 注入的红因消失）。 */
{
  const s = makeSandbox();
  injJ3(s);
  patchGate(s, "const J3_ON = true;", "const J3_ON = false;", 1);
  const r = runGate(s);
  const got = redIds(r.out);
  const ok = r.code === 0 && got.length === 0;
  record(
    "G3 开关真被 fail 消费",
    ok,
    ok
      ? "卸掉 J3 开关后红因一个不剩 ⇒ 开关不是摆设"
      : `卸掉 J3 开关后仍然红：${fmtIds(got)}\n${r.out}`
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= 注入档：每条判据都真的会红 ================= */

const INJ_CASES = [
  { id: "J0", inj: injJ0, want: ["J0"] },
  { id: "J1", inj: injJ1, want: ["J1"] },
  { id: "J2", inj: injJ2, want: ["J2"] },
  { id: "J3", inj: injJ3, want: ["J3"] },
  { id: "J4", inj: injJ4, want: ["J4"] },
  {
    id: "J5",
    inj: injJ5,
    want: ["J1", "J5"],
    also: ["J1"],
    note: "造第二个站点实体必然让那个页面的 J1 也红（两个红因各自成立）",
  },
  { id: "J6", inj: injJ6, want: ["J6"] },
  {
    id: "J7",
    inj: injJ7,
    want: ["J7", "J7"],
    note: "j10Declared 与 j10ProfilePages 两条自证各红一条",
  },
  { id: "J8", inj: injJ8, want: ["J8"] },
  { id: "J9", inj: injJ9, want: ["J9"] },
  { id: "J10", inj: injJ10, want: ["J10"] },
  { id: "J11", inj: injJ11, want: ["J11"] },
  {
    id: "J11b",
    inj: injJ11b,
    switch: "J11",
    want: ["J11", "J7"],
    also: ["J7"],
    note: "image 整个没了 ⇒ J11 的 image 比对从未发生 ⇒ J7 的存活自证理应红一条",
  },
  { id: "J12", inj: injJ12, want: ["J12"] },
  { id: "J13", inj: injJ13, want: ["J13"] },
];

for (const c of INJ_CASES) {
  const s = makeSandbox();
  c.inj(s);
  expectRed(`${c.id} 注入（红因恰好是 ${fmtIds(c.want)}）`, s, c.want, { note: c.note });
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= 判据级负对照：卸掉开关 ⇒ 该判据不再说话 ================= */

for (const c of INJ_CASES) {
  const sw = c.switch || c.id;
  const s = makeSandbox();
  c.inj(s);
  patchGate(s, `const ${sw}_ON = true;`, `const ${sw}_ON = false;`, 1);
  expectNoRed(`N-${c.id} 卸开关后该判据不再说话`, s, sw, {
    also: c.also,
    note: c.also && c.also.length ? `允许残留：${fmtIds(c.also)}（各自成立）` : "完全转绿",
  });
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= 精准性负对照：合法写法不该被误伤 ================= */

/* P-J10a：把首页的 profilePage 声明挪进 eleventyComputed（数据层的第二条路径）
   ⇒ 角色仍是 ProfilePage ⇒ 必须绿，且汇总里要报出"eleventyComputed 1 处"。 */
{
  const s = makeSandbox();
  patchFileGrow(
    homeSrcOf(s),
    "profilePage: true",
    "eleventyComputed:\n  profilePage: true",
    1
  );
  expectGreenBaseline(
    "P-J10a profilePage 挪进 eleventyComputed",
    s,
    "J10 认数据层的三条路径，不是只认 front matter 顶层",
    { mustContain: "eleventyComputed 1 处" }
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* P-J10b：把论文页的 profilePage 声明挪进**目录数据文件**（数据层的第三条路径）
   ⇒ 角色仍是 WebPage ⇒ 必须绿，且汇总里要报出"目录数据文件 1 处"。 */
{
  const s = makeSandbox();
  patchFile(paperSrcOf(s), "profilePage: false", "# profilePage: false", 1);
  write(
    path.join(s.repo, "src", "papers", "papers.11tydata.cjs"),
    "module.exports = { profilePage: false };\n"
  );
  expectGreenBaseline(
    "P-J10b profilePage 挪进目录数据文件",
    s,
    "目录数据文件也是裸键的一条合法来源",
    { mustContain: "目录数据文件 1 处" }
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* P-J11a：给非论文页加一张 og:image ⇒ J11 只管论文页 ⇒ 必须绿。 */
{
  const s = makeSandbox();
  patchFileGrow(
    homeOf(s),
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />\n<meta property="og:image" content="${SITE_URL}/assets/other.png" />`,
    1
  );
  expectGreenBaseline(
    "P-J11a 非论文页多一张 og:image",
    s,
    "J11 只管论文页自己的 ScholarlyArticle，不该误伤别的页"
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= 退回旧口径 ================= */

/* RE-1：把 fail 的编号参数去掉（退回"编号只活在文案里"的老口径）
   ⇒ 红因行不再是「✗ 门禁 Jx：」⇒ 自测按编号抓不到任何东西。 */
{
  const s = makeSandbox();
  injJ3(s);
  patchGate(
    s,
    "const fail = (id, msg) => {",
    'const fail = (msg) => { const id = "?";',
    1
  );
  const r = runGate(s);
  const got = redIds(r.out);
  const ok = got.length === 0 && r.code !== 0;
  record(
    "RE-1 退回无编号 fail() ⇒ 编号抓不到",
    ok,
    ok
      ? "老口径下红因不带结构化编号 ⇒ 自测的编号断言根本不成立（这正是本轮要修的）"
      : `老口径下居然抓到了编号 ${fmtIds(got)} ⇒ 判据没退回去\n${r.out}`
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* RE-2：把覆盖度判定短路（退回"没有覆盖度自证"的老口径）
   ⇒ 整段 J3 被摘掉也**全绿** ⇒ 证明 J12 抓的正是"整块被摘"这件事。 */
{
  const s = makeSandbox();
  injJ12(s);
  patchGate(s, "if (missing.length) {", "if (false && missing.length) {", 1);
  expectGreen(
    "RE-2 退回无覆盖度自证 ⇒ 整块被摘也全绿",
    s,
    "老口径下 J3 整段被摘掉无人看守 ⇒ 这正是 J12 要补的洞"
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* RE-3：把 fail 里的开关消费去掉（退回"开关是摆设"的老口径）
   ⇒ 卸掉开关后红因仍在 ⇒ 负对照不成立。 */
{
  const s = makeSandbox();
  injJ3(s);
  patchGate(s, "if (SWITCH_ON[id] === false) return;", "if (false) return;", 1);
  patchGate(s, "const J3_ON = true;", "const J3_ON = false;", 1);
  const r = runGate(s);
  const got = redIds(r.out);
  const ok = got.includes("J3");
  record(
    "RE-3 退回不消费开关的老口径 ⇒ 负对照不成立",
    ok,
    ok
      ? "老口径下卸掉开关仍然红 ⇒ 负对照根本证明不了什么（这正是本轮要修的）"
      : `老口径下卸掉开关居然转绿了 ⇒ 判据没退回去\n${r.out}`
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= 汇总 ================= */

const failed = results.filter((r) => !r.ok);
results.forEach((r) => {
  console.log(`${r.ok ? "✓" : "✗"} ${r.id} —— ${r.detail}`);
});
console.log("");
if (failed.length) {
  console.error(`自测未通过：${failed.length}/${results.length} 档失败。`);
  failed.forEach((r) => console.error(`  ✗ ${r.id}`));
  process.exit(1);
}
console.log(`自测通过：${results.length}/${results.length} 档全部按预期触发。`);

/* 收尾：门禁原件必须一个字节都没动（这一整轮注入全在副本上）。 */
const gateShaNow = sha256(GATE);
if (gateShaNow !== GATE_SHA_AT_START) {
  console.error(
    `✗ 门禁原件被改动了（${GATE_SHA_AT_START} → ${gateShaNow}）—— 自测不该碰仓库里的文件。`
  );
  process.exit(1);
}
console.log("门禁原件 SHA-256 未变（所有注入都在临时目录的副本上）。");
