#!/usr/bin/env node
/**
 * 门禁 FX1–FX6（scripts/check-feed-title.cjs）的本地夹具自测
 *
 * 这个自测要证明两件事，缺一不可：
 *   ① 门禁**能变红** —— 每条判据各有一档注入，让它真的报出来。
 *   ② 门禁**红得准** —— 只断言「注入能变红」不够，那只说明门禁**有反应**，
 *      不说明红因来自**那一条判据**。所以对每条判据再补一档**负对照**：
 *      把门禁副本里的 `const FXn_ON = true;` 改成 false 之后，
 *      对应的注入必须**转绿**，才能证明红因确实是这一条判据判出来的。
 *
 * 另有三档是「必须判绿」的边界负对照：
 *   · 模板**注释**里写了显示名的后缀片段 ⇒ 必须判绿（门禁守的是「模板正文里
 *     烤死了字面量」，不是「这个词出现过」）；
 *   · **整站一致改名**（真源 + 产物两处一起改）⇒ 必须判绿
 *     （门禁守的是「一份真源 + 三处一致」，不是某一份固定清单）。
 *
 * 夹具站是**真实产物 + 真实模板 + 真实 site.js 的副本**：
 *   · 真源（src/_data/site.js）与模板（src 目录下全部 .njk）必须一起进夹具 ——
 *     FX1/FX2/FX4 判的就是这两层，只给产物那 FX2/FX4 就没有判断对象；
 *   · 门禁副本放在夹具的 scripts/ 下 ⇒ 门禁自己的 ROOT 落到夹具根，
 *     它读到的产物、真源、package.json 全部是夹具自己的东西。
 *
 * 用法：node scripts/test-feed-title.cjs
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-feed-title.cjs");
const REAL_SITE = path.join(ROOT, "_site");
const REAL_SRC = path.join(ROOT, "src");
const REAL_SITE_JS = path.join(REAL_SRC, "_data", "site.js");
const REAL_IDENTITY = path.join(ROOT, "scripts", "lib", "identity.cjs");
// ⚠️ site.js 的**同层依赖**（D131 踩到）：它 require 了 `../eleventy-draft.cjs`
//   （草稿判定的唯一真源）⇒ 夹具里缺它 ⇒ site.js 加载即抛错 ⇒
//   门禁读不到站点数据 ⇒ 报出与注入无关的假红。
const REAL_DRAFT_MODULE = path.join(REAL_SRC, "eleventy-draft.cjs");

/* 夹具站要带的文件类型：HTML 页面 + feed.xml + robots.txt（+ sitemap.xml）。 */
const KEEP_EXT = new Set([".html", ".xml", ".txt"]);

if (!fs.existsSync(REAL_SITE)) {
  console.error(
    `订阅源显示名门禁自测失败：找不到产物目录 ${REAL_SITE} —— ` +
      `夹具站的基线要靠它，先跑一次 npm run build。`
  );
  process.exit(1);
}

/* ---------- 夹具站 ---------- */

function copyRelevant(fromDir, toDir, keep) {
  fs.mkdirSync(toDir, { recursive: true });
  for (const e of fs.readdirSync(fromDir, { withFileTypes: true })) {
    if (e.name.startsWith("._")) continue; // exFAT 上的 AppleDouble 资源叉
    const p = path.join(fromDir, e.name);
    if (e.isDirectory()) {
      copyRelevant(p, path.join(toDir, e.name), keep);
    } else if (e.isFile() && keep(path.extname(e.name).toLowerCase())) {
      fs.copyFileSync(p, path.join(toDir, e.name));
    }
  }
}

function buildFixture(id) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `mh-ftitle-${id.toLowerCase()}-`));
  const site = path.join(root, "_site");
  copyRelevant(REAL_SITE, site, (ext) => KEEP_EXT.has(ext));

  /* 模板层：.njk 全部带上（FX2 扫的就是这一层），外加真实 site.js。 */
  copyRelevant(REAL_SRC, path.join(root, "src"), (ext) => ext === ".njk");

  /* 门禁副本：门禁里的 ROOT = 父目录 ⇒ 产物、真源、package.json 都按
     夹具站的布局摆好，门禁在夹具里读到的就是夹具自己的东西。 */
  fs.mkdirSync(path.join(root, "scripts", "lib"), { recursive: true });
  const gate = path.join(root, "scripts", "check-feed-title.cjs");
  fs.copyFileSync(GATE, gate);
  fs.copyFileSync(REAL_IDENTITY, path.join(root, "scripts", "lib", "identity.cjs"));
  fs.mkdirSync(path.join(root, "src", "_data"), { recursive: true });
  const siteJs = path.join(root, "src", "_data", "site.js");
  fs.copyFileSync(REAL_SITE_JS, siteJs);
  // ⚠️ 同层依赖也要带齐（D131）：site.js require 了 `../eleventy-draft.cjs`。
  fs.copyFileSync(REAL_DRAFT_MODULE, path.join(root, "src", "eleventy-draft.cjs"));

  const pkg = path.join(root, "package.json");
  fs.writeFileSync(
    pkg,
    JSON.stringify(
      {
        name: "mh-fixture",
        private: true,
        scripts: {
          build: "npm run check:feed-title",
          "check:feed-title": "node scripts/check-feed-title.cjs",
        },
      },
      null,
      2
    )
  );

  const htmlFiles = [];
  const walkHtml = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walkHtml(p);
      else if (e.name.endsWith(".html")) htmlFiles.push(p);
    }
  };
  walkHtml(site);

  return {
    root,
    gate,
    site,
    htmlFiles,
    pkg,
    siteJs,
    feed: path.join(site, "feed.xml"),
    tmplDir: path.join(root, "src", "_includes", "partials"),
  };
}

/* ---------- 改文件的小工具 ---------- */

/** 改一个文件：fn 收到原文，返回新原文；返回是否真的改动了。 */
function mutate(file, fn) {
  const before = fs.readFileSync(file, "utf8");
  const after = fn(before);
  if (after === before) return false;
  fs.writeFileSync(file, after);
  return true;
}

/** 在门禁副本里把某条判据卸掉（`const FXn_ON = true;` → false）。 */
function patchGate(fx, name) {
  const needle = `const ${name}_ON = true;`;
  const before = fs.readFileSync(fx.gate, "utf8");
  if (!before.includes(needle)) throw new Error(`门禁副本里找不到 ${needle}`);
  fs.writeFileSync(fx.gate, before.replace(needle, `const ${name}_ON = false;`));
}

/** 把门禁副本里的扫描器找字面量那一步弄坏（命中即返回空）。 */
function breakFindNeedle(fx) {
  const needle = "if (!needle) return hits;";
  const before = fs.readFileSync(fx.gate, "utf8");
  if (!before.includes(needle)) throw new Error(`门禁副本里找不到 ${needle}`);
  fs.writeFileSync(fx.gate, before.replace(needle, "if (needle) return hits;"));
}

/* ---------- 真源常量（从夹具自己的 site.js 里读，不写死字面量） ---------- */

function siteConsts(siteJs) {
  const t = fs.readFileSync(siteJs, "utf8");
  const title = (/\bconst SITE_TITLE = "([^"]*)";/.exec(t) || [])[1] || "";
  const suffix = (/\bconst FEED_TITLE_SUFFIX = "([^"]*)";/.exec(t) || [])[1] || "";
  return { title, suffix, feedTitle: `${title} \u00b7 ${suffix}` };
}

/* RSS 自动发现入口（只认 rel=alternate + type=application/rss+xml）。 */
const RSS_TAG_RE = /<link rel="alternate" type="application\/rss\+xml"[^>]*\/>/;

/** 改某个页面 RSS 自动发现入口的 title 属性。 */
function rewriteDiscoveryTitle(file, to) {
  const before = fs.readFileSync(file, "utf8");
  const after = before.replace(
    /(<link rel="alternate" type="application\/rss\+xml"[^>]*?title=")([^"]*)(")/,
    `$1${to}$3`
  );
  if (after === before) throw new Error(`没找到 RSS 自动发现入口（${file}）`);
  fs.writeFileSync(file, after);
}

/** 只改 feed 频道头（<channel> 到第一个 <item> 之间），不碰 item。 */
function mutateChannelHead(file, fn) {
  const xml = fs.readFileSync(file, "utf8");
  const at = xml.search(/<item[\s>]/i);
  const head = at >= 0 ? xml.slice(0, at) : xml;
  const tail = at >= 0 ? xml.slice(at) : "";
  const newHead = fn(head);
  if (newHead === head) throw new Error("没找到 feed 频道头里要改的那一段");
  fs.writeFileSync(file, newHead + tail);
}

/* ---------- 注入动作（负对照档要再注入一次） ---------- */

const INJECT = {
  /* FX3：页面上的 RSS 自动发现 title 与 feed 频道 title 对不上 */
  pageTitleDrift: (fx) => {
    const c = siteConsts(fx.siteJs);
    rewriteDiscoveryTitle(path.join(fx.site, "index.html"), `${c.title} \u00b7 Publications`);
  },
  /* FX3：feed 频道 title 单独改了（页面那边没改） */
  feedChannelTitleDrift: (fx) => {
    const c = siteConsts(fx.siteJs);
    mutateChannelHead(fx.feed, (h) => {
      const after = h.replace(
        /<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i,
        `<title>${c.title} \u00b7 Somewhere Else</title>`
      );
      if (after === h) throw new Error("没找到 feed 频道头里的 <title>");
      return after;
    });
  },
  /* FX1：真源字段存在但为空 */
  feedTitleEmpty: (fx) => {
    const ok = mutate(fx.siteJs, (t) =>
      t.replace(/feedTitle: `\$\{SITE_TITLE\} \u00b7 \$\{FEED_TITLE_SUFFIX\}`,/, 'feedTitle: "",')
    );
    if (!ok) throw new Error("没找到 site.js 里的 feedTitle 赋值");
  },
  /* FX1：真源写成另一份**独立**字面量（不含站点名） */
  feedTitleIndependent: (fx) => {
    const ok = mutate(fx.siteJs, (t) =>
      t.replace(
        /feedTitle: `\$\{SITE_TITLE\} \u00b7 \$\{FEED_TITLE_SUFFIX\}`,/,
        'feedTitle: "Some Other Feed Name",'
      )
    );
    if (!ok) throw new Error("没找到 site.js 里的 feedTitle 赋值");
  },
  /* FX2：模板正文里烤死了显示名的后缀片段 */
  bakeSuffixInTemplate: (fx) => {
    const c = siteConsts(fx.siteJs);
    fs.mkdirSync(fx.tmplDir, { recursive: true });
    fs.writeFileSync(
      path.join(fx.tmplDir, "__fz-baked.njk"),
      `<p>${c.suffix}</p>\n`
    );
  },
  /* 必须判绿：片段只出现在注释里 */
  suffixInCommentOnly: (fx) => {
    const c = siteConsts(fx.siteJs);
    fs.mkdirSync(fx.tmplDir, { recursive: true });
    fs.writeFileSync(
      path.join(fx.tmplDir, "__fz-comment.njk"),
      `{# ${c.suffix} #}\n<!-- ${c.suffix} -->\n<p>{{ site.feedTitle }}</p>\n`
    );
  },
  /* 必须判绿：整站一致改名（真源 + 产物两处一起改） */
  renameEverywhere: (fx) => {
    const c = siteConsts(fx.siteJs);
    const NEW_SUFFIX = "Papers and notes";
    const NEW_TITLE = `${c.title} \u00b7 ${NEW_SUFFIX}`;
    const okJs = mutate(fx.siteJs, (t) =>
      t.replace(
        /const FEED_TITLE_SUFFIX = "[^"]*";/,
        `const FEED_TITLE_SUFFIX = "${NEW_SUFFIX}";`
      )
    );
    if (!okJs) throw new Error("没找到 site.js 里的 FEED_TITLE_SUFFIX");
    for (const f of fx.htmlFiles) {
      mutate(f, (t) => t.split(c.feedTitle).join(NEW_TITLE));
    }
    mutateChannelHead(fx.feed, (h) => h.split(c.feedTitle).join(NEW_TITLE));
  },
  /* FX4：产物里一个 HTML 都不剩（覆盖度自证） */
  deleteAllHtml: (fx) => {
    for (const f of fx.htmlFiles) fs.rmSync(f);
  },
  /* FX5：package.json 里把本门禁摘掉 */
  unwireGate: (fx) => {
    fs.writeFileSync(
      fx.pkg,
      JSON.stringify(
        {
          name: "mh-fixture",
          private: true,
          scripts: { build: "npm run check:other", "check:other": "node scripts/check-other.cjs" },
        },
        null,
        2
      )
    );
  },
};

/* ---------- 跑门禁 ---------- */
function runGate(fx) {
  const env = Object.assign({}, process.env);
  delete env.SITE_DIR;
  delete env.PKG_PATH;
  const r = spawnSync(process.execPath, [fx.gate], { env, encoding: "utf8" });
  return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
}

/* ---------- 注入矩阵 ---------- */
const CASES = [
  {
    id: "FZ0",
    expect: "green",
    desc: "基线：真源、模板、产物三者一致",
    apply: () => {},
  },
  {
    id: "FZ1",
    expect: "red",
    subs: ["FX3：", "两处对外报的名字不一样"],
    desc: "页面上的 RSS 自动发现 title 与 feed 频道 title 对不上（FX3）",
    apply: (fx) => INJECT.pageTitleDrift(fx),
  },
  {
    id: "FZ2",
    expect: "red",
    subs: ["FX3：", "两处对外报的名字不一样"],
    desc: "feed 频道 title 单独改了、页面没改（FX3）",
    apply: (fx) => INJECT.feedChannelTitleDrift(fx),
  },
  {
    id: "FZ3",
    expect: "red",
    subs: ["FX1：", "缺失或为空"],
    desc: "真源 site.feedTitle 存在但是空的（FX1）",
    apply: (fx) => INJECT.feedTitleEmpty(fx),
  },
  {
    id: "FZ4",
    expect: "red",
    subs: ["FX1：", "形状不对"],
    desc: "真源 site.feedTitle 写成另一份独立字面量（FX1）",
    apply: (fx) => INJECT.feedTitleIndependent(fx),
  },
  {
    id: "FZ5",
    expect: "red",
    subs: ["FX2：", "写成了字面量"],
    desc: "模板正文里烤死了显示名的后缀片段（FX2）",
    apply: (fx) => INJECT.bakeSuffixInTemplate(fx),
  },
  {
    id: "FZ6",
    expect: "green",
    desc: "负对照：片段只出现在模板注释里（注释豁免，必须判绿）",
    apply: (fx) => INJECT.suffixInCommentOnly(fx),
  },
  {
    id: "FZ7",
    expect: "green",
    desc: "负对照：整站一致改名（真源 + 产物一起改，必须判绿）",
    apply: (fx) => INJECT.renameEverywhere(fx),
  },
  {
    id: "FZ8",
    expect: "green",
    desc: "负对照：卸掉 FX1 判定 ⇒ FZ3 的注入转绿",
    apply: (fx) => {
      patchGate(fx, "FX1");
      INJECT.feedTitleEmpty(fx);
    },
  },
  {
    id: "FZ9",
    expect: "green",
    desc: "负对照：卸掉 FX2 判定 ⇒ FZ5 的注入转绿",
    apply: (fx) => {
      patchGate(fx, "FX2");
      INJECT.bakeSuffixInTemplate(fx);
    },
  },
  {
    id: "FZ10",
    expect: "green",
    desc: "负对照：卸掉 FX3 判定 ⇒ FZ1 的注入转绿",
    apply: (fx) => {
      patchGate(fx, "FX3");
      INJECT.pageTitleDrift(fx);
    },
  },
  {
    id: "FZ11",
    expect: "green",
    desc: "负对照：卸掉 FX4 判定 ⇒ 删光产物的注入转绿",
    apply: (fx) => {
      patchGate(fx, "FX4");
      INJECT.deleteAllHtml(fx);
    },
  },
  {
    id: "FZ12",
    expect: "green",
    desc: "负对照：卸掉 FX5 判定 ⇒ 门禁被摘掉的注入转绿",
    apply: (fx) => {
      patchGate(fx, "FX5");
      INJECT.unwireGate(fx);
    },
  },
  {
    id: "FZ13",
    expect: "green",
    desc: "负对照：卸掉 FX6 判定 ⇒ 扫描器被弄坏的注入转绿",
    apply: (fx) => {
      patchGate(fx, "FX6");
      breakFindNeedle(fx);
      INJECT.bakeSuffixInTemplate(fx);
    },
  },
  {
    id: "FZ14",
    expect: "red",
    subs: ["FX5：", "门禁自己被卸掉了"],
    desc: "package.json 里把本门禁摘掉（FX5）",
    apply: (fx) => INJECT.unwireGate(fx),
  },
  {
    id: "FZ15",
    expect: "red",
    subs: ["FX4：", "一个页面都没扫到"],
    desc: "产物里一个 HTML 都不剩（FX4 覆盖度自证）",
    apply: (fx) => INJECT.deleteAllHtml(fx),
  },
  {
    id: "FZ16",
    expect: "red",
    subs: ["FX6：", "扫描器自证失败"],
    desc: "扫描器的「找字面量」被弄坏（FX6 扫描器自证）",
    apply: (fx) => {
      breakFindNeedle(fx);
      INJECT.bakeSuffixInTemplate(fx);
    },
  },
];

/* ---------- 真目录的指纹（跑完自证没被动过） ---------- */
function fingerprint(dir) {
  const hash = crypto.createHash("sha256");
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1
    )) {
      const p = path.join(d, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        walk(p, r);
      } else {
        hash.update(r);
        hash.update(fs.readFileSync(p));
      }
    }
  };
  walk(dir, "");
  return hash.digest("hex");
}

const beforeSite = fingerprint(REAL_SITE);
const beforeSrc = fingerprint(REAL_SRC);
const beforeGate = crypto.createHash("sha256").update(fs.readFileSync(GATE)).digest("hex");

/* ---------- 跑 ---------- */
let failed = 0;
const lines = [];
for (const c of CASES) {
  const fx = buildFixture(c.id);
  try {
    c.apply(fx);
  } catch (e) {
    failed++;
    lines.push(`✗ ${c.id} 注入失败：${e.message}`);
    fs.rmSync(fx.root, { recursive: true, force: true });
    continue;
  }
  const { code, out } = runGate(fx);
  const want = c.expect === "green" ? 0 : 1;
  if (code !== want) {
    failed++;
    lines.push(
      `✗ ${c.id}（${c.desc}）：期望 exit ${want}，实测 exit ${code}\n${out.trim()}`
    );
    fs.rmSync(fx.root, { recursive: true, force: true });
    continue;
  }
  if (c.expect === "green") {
    if (!out.includes("订阅源显示名门禁通过")) {
      failed++;
      lines.push(`✗ ${c.id}（${c.desc}）：判绿，但没打出通过语\n${out.trim()}`);
      fs.rmSync(fx.root, { recursive: true, force: true });
      continue;
    }
    lines.push(`✓ ${c.id}  ${c.desc} → 判绿（负对照通过）`);
  } else {
    const missing = (c.subs || []).filter((s) => !out.includes(s));
    if (missing.length) {
      failed++;
      lines.push(
        `✗ ${c.id}（${c.desc}）：判红了，但红因里**看不到**「${missing.join(" / ")}」\n${out.trim()}`
      );
      fs.rmSync(fx.root, { recursive: true, force: true });
      continue;
    }
    lines.push(`✓ ${c.id}  ${c.desc} → 判红，红因点名到位`);
  }
  fs.rmSync(fx.root, { recursive: true, force: true });
}

/* ---------- 自证：真目录与门禁原件一个字节都没变 ---------- */
const afterSite = fingerprint(REAL_SITE);
const afterSrc = fingerprint(REAL_SRC);
const afterGate = crypto.createHash("sha256").update(fs.readFileSync(GATE)).digest("hex");
if (beforeSite !== afterSite) {
  failed++;
  lines.push("✗ 自测动了仓库里的 _site/ —— 夹具站必须与真目录彻底分开。");
}
if (beforeSrc !== afterSrc) {
  failed++;
  lines.push("✗ 自测动了仓库里的 src/ —— 夹具站必须与真目录彻底分开。");
}
if (beforeGate !== afterGate) {
  failed++;
  lines.push("✗ 自测动了仓库里的门禁原件 —— 负对照必须打在副本上。");
}

if (failed) {
  console.error("订阅源显示名门禁自测未通过：\n");
  lines.forEach((l) => console.error(`  ${l}`));
  console.error(`\n  ${failed} 档未通过。\n`);
  process.exit(1);
}

console.log(`订阅源显示名门禁自测通过：${CASES.length} 档（FZ0–FZ16）注入矩阵全部符合预期。`);
lines.forEach((l) => console.log(`  ${l}`));
