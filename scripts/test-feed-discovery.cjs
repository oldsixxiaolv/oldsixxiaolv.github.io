#!/usr/bin/env node
/**
 * 门禁 FD1–FD6（scripts/check-feed-discovery.cjs）的本地夹具自测
 *
 * 这个自测要证明两件事，缺一不可：
 *   ① 门禁**能变红** —— 每条判据各有一档注入，让它真的报出来。
 *   ② 门禁**红得准** —— 只断言「注入能变红」不够，那只说明门禁**有反应**，
 *      不说明红因来自**那一条判据**。所以对每条判据再补一档**负对照**：
 *      把门禁副本里的 `const FDn_ON = true;` 改成 false 之后，
 *      对应的注入必须**转绿**，才能证明红因确实是这一条判据判出来的。
 *
 * 另有两档是「必须判绿」的边界负对照：
 *   · href 换成**与本站同源的绝对 URL** ⇒ 必须判绿（门禁守的是「指向本站的
 *     feed.xml」这件事，不是某一种写法，也不是某一份固定清单）；
 *   · 扫描器 tricky 档：注释 / `<script>` 原始文本 / 别人的属性值里写的
 *     假 RSS 自动发现**都不算数**。
 *
 * 一档是「红，但红因里不再出现 FD5」：
 *   FD5 是**覆盖度自证**判据，它报告的其实是「判据没落到东西上」——
 *   这种故障天然会与 FD1/FD2/FD4 同时发生（没有入口 ⇒ 入口缺失），
 *   所以卸掉 FD5 之后**不可能转绿**（真实缺陷还在），
 *   能证明的只是「红因里不再有 FD5 这一条」—— 断言必须照实写，不能硬凑成绿。
 *
 * 用法：node scripts/test-feed-discovery.cjs
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-feed-discovery.cjs");
const REAL_SITE = path.join(ROOT, "_site");
const REAL_SITE_JS = path.join(ROOT, "src", "_data", "site.js");
const REAL_IDENTITY = path.join(ROOT, "scripts", "lib", "identity.cjs");
// ⚠️ site.js 的**同层依赖**（D131 踩到）：它 require 了 `../eleventy-draft.cjs`
//   （草稿判定的唯一真源）⇒ 夹具里缺它 ⇒ site.js 加载即抛错 ⇒
//   门禁读不到站点数据 ⇒ 报出与注入无关的假红。
const REAL_DRAFT_MODULE = path.join(ROOT, "src", "eleventy-draft.cjs");

/* 夹具站要带的文件类型：HTML 页面 + feed.xml + robots.txt（+ sitemap.xml）。
   门禁只读这三类，不需要图片与 CSS。 */
const KEEP_EXT = new Set([".html", ".xml", ".txt"]);

if (!fs.existsSync(REAL_SITE)) {
  console.error(
    `订阅自描述门禁自测失败：找不到产物目录 ${REAL_SITE} —— ` +
      `夹具站的基线要靠它，先跑一次 npm run build。`
  );
  process.exit(1);
}

/* ---------- 夹具站 ---------- */

function copyRelevant(fromDir, toDir) {
  fs.mkdirSync(toDir, { recursive: true });
  for (const e of fs.readdirSync(fromDir, { withFileTypes: true })) {
    if (e.name.startsWith("._")) continue; // exFAT 上的 AppleDouble 资源叉
    const p = path.join(fromDir, e.name);
    if (e.isDirectory()) {
      copyRelevant(p, path.join(toDir, e.name));
    } else if (e.isFile() && KEEP_EXT.has(path.extname(e.name).toLowerCase())) {
      fs.copyFileSync(p, path.join(toDir, e.name));
    }
  }
}

function buildFixture(id) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `mh-feed-${id.toLowerCase()}-`));
  const site = path.join(root, "_site");
  copyRelevant(REAL_SITE, site);

  /* 门禁副本：门禁里的 ROOT = 父目录 ⇒ 产物、package.json、site.js 都按
     夹具站的布局摆好，门禁在夹具里读到的就是夹具自己的东西。 */
  fs.mkdirSync(path.join(root, "scripts", "lib"), { recursive: true });
  const gate = path.join(root, "scripts", "check-feed-discovery.cjs");
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
          build: "npm run check:feed-discovery",
          "check:feed-discovery": "node scripts/check-feed-discovery.cjs",
        },
      },
      null,
      2
    )
  );

  const htmlFiles = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".html")) htmlFiles.push(p);
    }
  };
  walk(site);

  /* site.url 从夹具站自己的 site.js 读（不写死字面量） */
  const siteUrl = String(require(siteJs).url || "").replace(/\/+$/, "");

  return { root, gate, site, htmlFiles, pkg, siteUrl, feed: path.join(site, "feed.xml"), robots: path.join(site, "robots.txt") };
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

/** 在门禁副本里把某条判据卸掉（`const FDn_ON = true;` → false）。 */
function patchGate(fx, name) {
  const needle = `const ${name}_ON = true;`;
  const before = fs.readFileSync(fx.gate, "utf8");
  if (!before.includes(needle)) throw new Error(`门禁副本里找不到 ${needle}`);
  fs.writeFileSync(fx.gate, before.replace(needle, `const ${name}_ON = false;`));
}

/* RSS 自动发现入口的定位与改写（只认 rel=alternate + type=application/rss+xml） */
const RSS_TAG_RE = /<link rel="alternate" type="application\/rss\+xml"[^>]*\/>/;

/** 改某个页面 RSS 自动发现入口的 href。 */
function rewriteRssHref(file, to) {
  const before = fs.readFileSync(file, "utf8");
  const after = before.replace(
    /(<link rel="alternate" type="application\/rss\+xml"[^>]*?href=")([^"]*)("[^>]*?\/>)/,
    `$1${to}$3`
  );
  if (after === before) throw new Error(`没找到 RSS 自动发现入口（${file}）`);
  fs.writeFileSync(file, after);
}

/** 删掉某个页面的 RSS 自动发现入口。 */
function dropRssDiscovery(file) {
  const before = fs.readFileSync(file, "utf8");
  const after = before.replace(RSS_TAG_RE, "");
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
  /* FD1：删掉 about 页的 RSS 自动发现 */
  dropAboutDiscovery: (fx) => {
    dropRssDiscovery(path.join(fx.site, "about", "index.html"));
  },
  /* FD1：同一页出现两处 RSS 自动发现 */
  duplicateDiscovery: (fx) => {
    const file = path.join(fx.site, "index.html");
    const ok = mutate(file, (t) =>
      t.replace(
        "</head>",
        '<link rel="alternate" type="application/rss+xml" title="dup" href="feed.xml" />\n</head>'
      )
    );
    if (!ok) throw new Error("没找到 </head>");
  },
  /* FD1：href 指向站内另一个文件 */
  pointToOtherFile: (fx) => {
    rewriteRssHref(path.join(fx.site, "index.html"), "sitemap.xml");
  },
  /* FD1：href 指向外域 */
  pointToExternal: (fx) => {
    rewriteRssHref(path.join(fx.site, "index.html"), "https://example.com/feed.xml");
  },
  /* FD1：href 换成与本站同源的绝对 URL（必须判绿） */
  sameOriginAbsolute: (fx) => {
    rewriteRssHref(path.join(fx.site, "index.html"), `${fx.siteUrl}/feed.xml`);
  },
  /* FD2：feed 的 atom:link rel="self" 指向别的 URL */
  feedAtomWrongUrl: (fx) => {
    const ok = mutate(fx.feed, (t) =>
      t.replace(
        '<atom:link href="https://github.lvyihang.xyz/feed.xml" rel="self" type="application/rss+xml" />',
        '<atom:link href="https://github.lvyihang.xyz/papers/" rel="self" type="application/rss+xml" />'
      )
    );
    if (!ok) throw new Error("没找到 feed.xml 的 <atom:link>");
  },
  /* FD2：feed 缺 atom:link */
  feedAtomMissing: (fx) => {
    const ok = mutate(fx.feed, (t) =>
      t.replace(/^\s*<atom:link[^\n]*\n/m, "")
    );
    if (!ok) throw new Error("没找到 feed.xml 的 <atom:link> 那一行");
  },
  /* FD3：feed 频道缺 description */
  feedNoDescription: (fx) => {
    mutateChannelHead(fx.feed, (h) =>
      h.replace(/^\s*<description>[^\n]*<\/description>\n/m, "")
    );
  },
  /* FD4：robots.txt 缺 Sitemap: 行 */
  robotsNoSitemap: (fx) => {
    const ok = mutate(fx.robots, (t) => t.replace(/^Sitemap:.*\n/m, ""));
    if (!ok) throw new Error("没找到 robots.txt 的 Sitemap: 行");
  },
  /* FD4：Sitemap: 指向外域 */
  robotsExternalSitemap: (fx) => {
    const ok = mutate(fx.robots, (t) =>
      t.replace("Sitemap: https://github.lvyihang.xyz/sitemap.xml", "Sitemap: https://example.com/sitemap.xml")
    );
    if (!ok) throw new Error("没找到 robots.txt 的 Sitemap: 行");
  },
  /* FD4：两行 Sitemap: */
  robotsTwoSitemaps: (fx) => {
    const ok = mutate(fx.robots, (t) =>
      t.replace(
        "Sitemap: https://github.lvyihang.xyz/sitemap.xml",
        "Sitemap: https://github.lvyihang.xyz/sitemap.xml\nSitemap: https://github.lvyihang.xyz/sitemap.xml"
      )
    );
    if (!ok) throw new Error("没找到 robots.txt 的 Sitemap: 行");
  },
  /* FD5：抽掉产物里全部 RSS 自动发现（覆盖度自证） */
  stripAllDiscovery: (fx) => {
    for (const f of fx.htmlFiles) {
      mutate(f, (t) => t.replace(new RegExp(RSS_TAG_RE.source, "g"), ""));
    }
  },
  /* FD6：package.json 里把本门禁摘掉 */
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
  /* 必须判绿：注释 / <script> 原始文本 / 别人的属性值里的假 RSS 入口都不算数 */
  trickyNoise: (fx) => {
    const file = path.join(fx.site, "index.html");
    const ok = mutate(file, (t) =>
      t.replace(
        "</body>",
        [
          '<!-- <link rel="alternate" type="application/rss+xml" href="evil.xml" /> -->',
          '<script>var s = \'<link rel="alternate" type="application/rss+xml" href="evil.xml">\';</script>',
          '<div data-x="<link rel=\'alternate\' type=\'application/rss+xml\' href=\'evil.xml\'>"></div>',
          "</body>",
        ].join("\n")
      )
    );
    if (!ok) throw new Error("没找到 </body>");
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
    id: "FT0",
    expect: "green",
    desc: "基线：完全健康的产物",
    apply: () => {},
  },
  {
    id: "FT1",
    expect: "red",
    subs: ["FD1：", "**没有** RSS 自动发现入口"],
    desc: "某个页面没有 RSS 自动发现入口（FD1）",
    apply: (fx) => INJECT.dropAboutDiscovery(fx),
  },
  {
    id: "FT2",
    expect: "red",
    subs: ["FD1：", "处 RSS 自动发现入口"],
    desc: "同一页面出现两处 RSS 自动发现入口（FD1）",
    apply: (fx) => INJECT.duplicateDiscovery(fx),
  },
  {
    id: "FT3",
    expect: "red",
    subs: ["FD1：", "指向的不是本站的 feed"],
    desc: "RSS 自动发现入口指向站内另一个文件（FD1）",
    apply: (fx) => INJECT.pointToOtherFile(fx),
  },
  {
    id: "FT4",
    expect: "red",
    subs: ["FD1：", "指向**外域**"],
    desc: "RSS 自动发现入口指向外域（FD1）",
    apply: (fx) => INJECT.pointToExternal(fx),
  },
  {
    id: "FT5",
    expect: "red",
    subs: ["FD2：", "规范绝对地址"],
    desc: "feed 的 <atom:link rel=\"self\"> 指向别的 URL（FD2）",
    apply: (fx) => INJECT.feedAtomWrongUrl(fx),
  },
  {
    id: "FT6",
    expect: "red",
    subs: ["FD2：", "没有 <atom:link>"],
    desc: "feed.xml 缺 <atom:link>（FD2）",
    apply: (fx) => INJECT.feedAtomMissing(fx),
  },
  {
    id: "FT7",
    expect: "red",
    subs: ["FD3：", "<description> 缺失或为空"],
    desc: "feed 频道缺 <description>（FD3）",
    apply: (fx) => INJECT.feedNoDescription(fx),
  },
  {
    id: "FT8",
    expect: "red",
    subs: ["FD4：", "没有 Sitemap: 行"],
    desc: "robots.txt 缺 Sitemap: 行（FD4）",
    apply: (fx) => INJECT.robotsNoSitemap(fx),
  },
  {
    id: "FT9",
    expect: "red",
    subs: ["FD4：", "Sitemap: 指向"],
    desc: "robots.txt 的 Sitemap: 指向外域（FD4）",
    apply: (fx) => INJECT.robotsExternalSitemap(fx),
  },
  {
    id: "FT10",
    expect: "red",
    subs: ["FD4：", "行 Sitemap:"],
    desc: "robots.txt 有两行 Sitemap:（FD4）",
    apply: (fx) => INJECT.robotsTwoSitemaps(fx),
  },
  {
    id: "FT11",
    expect: "red",
    subs: ["FD1：", "FD5：", "一处 RSS 自动发现入口都没找到"],
    desc: "负对照：抽掉产物里全部 RSS 自动发现（FD5 覆盖度自证）",
    apply: (fx) => INJECT.stripAllDiscovery(fx),
  },
  {
    id: "FT12",
    expect: "red",
    subs: ["FD6：", "门禁自己被卸掉了"],
    desc: "负对照：package.json 里把本门禁摘掉（FD6）",
    apply: (fx) => INJECT.unwireGate(fx),
  },
  {
    id: "FT13",
    expect: "green",
    desc: "负对照：卸掉 FD1 判定 ⇒ FT1 的注入转绿",
    apply: (fx) => {
      patchGate(fx, "FD1");
      INJECT.dropAboutDiscovery(fx);
    },
  },
  {
    id: "FT14",
    expect: "green",
    desc: "负对照：卸掉 FD2 判定 ⇒ FT5 的注入转绿",
    apply: (fx) => {
      patchGate(fx, "FD2");
      INJECT.feedAtomWrongUrl(fx);
    },
  },
  {
    id: "FT15",
    expect: "green",
    desc: "负对照：卸掉 FD3 判定 ⇒ FT7 的注入转绿",
    apply: (fx) => {
      patchGate(fx, "FD3");
      INJECT.feedNoDescription(fx);
    },
  },
  {
    id: "FT16",
    expect: "green",
    desc: "负对照：卸掉 FD4 判定 ⇒ FT9 的注入转绿",
    apply: (fx) => {
      patchGate(fx, "FD4");
      INJECT.robotsExternalSitemap(fx);
    },
  },
  {
    id: "FT17",
    expect: "red-not",
    must: ["FD1："],
    not: ["FD5："],
    desc: "负对照：卸掉 FD5 ⇒ FT11 的注入仍然红（FD1 在报同一件事），但红因里不再出现 FD5",
    apply: (fx) => {
      patchGate(fx, "FD5");
      INJECT.stripAllDiscovery(fx);
    },
  },
  {
    id: "FT18",
    expect: "green",
    desc: "负对照：卸掉 FD6 判定 ⇒ FT12 的注入转绿",
    apply: (fx) => {
      patchGate(fx, "FD6");
      INJECT.unwireGate(fx);
    },
  },
  {
    id: "FT19",
    expect: "green",
    desc: "负对照：href 换成与本站同源的绝对 URL（门禁守的是「指向本站的 feed」，不是某一种写法）",
    apply: (fx) => INJECT.sameOriginAbsolute(fx),
  },
  {
    id: "FT20",
    expect: "green",
    desc: "扫描器 tricky 档：注释 / <script> 原始文本 / 别人的属性值里的假 RSS 入口不算数",
    apply: (fx) => INJECT.trickyNoise(fx),
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
    if (!out.includes("订阅自描述门禁通过")) {
      failed++;
      lines.push(`✗ ${c.id}（${c.desc}）：判绿，但没打出通过语\n${out.trim()}`);
      fs.rmSync(fx.root, { recursive: true, force: true });
      continue;
    }
    lines.push(`✓ ${c.id}  ${c.desc} → 判绿（负对照通过）`);
  } else if (c.expect === "red-not") {
    const missing = (c.must || []).filter((s) => !out.includes(s));
    const leaked = (c.not || []).filter((s) => out.includes(s));
    if (missing.length || leaked.length) {
      failed++;
      lines.push(
        `✗ ${c.id}（${c.desc}）：红因不对 —— 缺少「${missing.join(" / ")}」，` +
          `仍出现「${leaked.join(" / ")}」\n${out.trim()}`
      );
      fs.rmSync(fx.root, { recursive: true, force: true });
      continue;
    }
    lines.push(`✓ ${c.id}  ${c.desc} → 红因里 FD5 已被摘干净`);
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
const afterGate = crypto.createHash("sha256").update(fs.readFileSync(GATE)).digest("hex");
if (beforeSite !== afterSite) {
  failed++;
  lines.push("✗ 自测动了仓库里的 _site/ —— 夹具站必须与真目录彻底分开。");
}
if (beforeGate !== afterGate) {
  failed++;
  lines.push("✗ 自测动了仓库里的门禁原件 —— 负对照必须打在副本上。");
}

if (failed) {
  console.error("订阅自描述门禁自测未通过：\n");
  lines.forEach((l) => console.error(`  ${l}`));
  console.error(`\n  ${failed} 档未通过。\n`);
  process.exit(1);
}

console.log(`订阅自描述门禁自测通过：${CASES.length} 档（FT0–FT20）注入矩阵全部符合预期。`);
lines.forEach((l) => console.log(`  ${l}`));
