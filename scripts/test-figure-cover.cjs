#!/usr/bin/env node
/**
 * 论文封面图一致性门禁的**自测**（注入矩阵）—— 证明 CV1–CV4 每一条都**能变红**。
 *
 * 为什么要有这个自测：
 *   一条**永远不会红**的判据，给出的是"看起来很确定的绿"——它比没有判据更坏，
 *   因为它把"盲区"包装成"已核过"。本门禁判的是"四个出口是不是同一张图"，
 *   而"注入没生效"（正则没匹配上、正文图那个 <img> 没定位到、归一化写错了）
 *   恰恰是最容易发生、也最不容易看出来的失败模式。
 *   所以"这条判据结构上能不能触发"必须**被证明**。
 *
 * 做法：把产物（论文页）、真源（site.js）、论文页源（paper.md）、
 *   package.json **各复制**一份到临时目录，在副本上逐个注入缺陷，
 *   用环境变量把门禁指向副本，断言门禁**确实**报出了对应的那条红因。
 *   ⚠️ 全程**不动仓库里的任何文件** —— 注入必须在副本上做。
 *   （这正是门禁里留 SITE_DIR / SITE_DATA_PATH / PAPERS_DIR / PKG_PATH
 *     这四个开关的原因：没有它们，自测就只能去改仓库文件，改坏了就是事故。）
 *   ⚠️ 真源副本要带齐**同层依赖**：site.js 顶部 require 了
 *     `../../scripts/lib/identity.cjs`，所以副本按同样的相对层级摆放。
 *
 * 十二档：
 *   CV0  基线（原样）                    → 必须**全绿**（证明这套判据不是空跑）
 *   CV1  og:image 换成另一张图            → CV1
 *   CV2  twitter:image 换成另一张图        → CV1
 *   CV3  正文 <img> 的 src 换成另一张图   → CV1
 *   CV4  JSON-LD 的 image 换成另一张图    → CV1
 *   CV5  og:image:width 写错             → CV2
 *   CV6  正文 <img> 的 height 写错        → CV2
 *   CV7  front matter 加回 cover 副本     → CV3
 *   CV8  真源里 figure.src 漂移           → CV1（页面与真源对不上）
 *   CV9  真源里 figure.width 漂移         → CV2
 *   CV10 门禁被卸掉（build 链里摘掉）     → CV4
 *   CV11 **边界负对照**：真源与产物**一起**改错 → **必须判绿**
 *
 * ⚠️ CV11 这一档是**故意判绿**的，理由写在这里，别当成漏网：
 *   本门禁守的是"一处真源"与"四个出口同图"。如果有人把**真源与产物一起**
 *   改成另一张图，四个出口仍然彼此一致 ⇒ 门禁**抓不到**。
 *   这是**已知边界**，不是缺陷；把它写成一条会跑的自测，是为了让这个边界**可证**，
 *   而不是只在注释里说说。封面图选得对不对仍靠人工核。
 *
 * 用法：node scripts/test-figure-cover.cjs
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-figure-cover.cjs");
const SITE = path.join(ROOT, "_site");
const SITE_JS = path.join(ROOT, "src", "_data", "site.js");
const IDENTITY = path.join(ROOT, "scripts", "lib", "identity.cjs");
const PAPERS = path.join(ROOT, "src", "content", "papers");
const PKG = path.join(ROOT, "package.json");

const siteData = require(SITE_JS);
const pub = siteData.publications.find((p) => p && p.figure && p.figure.src);
if (!pub) {
  console.error("封面图门禁自测失败：真源里没有带 figure 的论文记录。");
  process.exit(1);
}
const SLUG = pub.slug;
const PAPER_HTML = path.join(SITE, "papers", SLUG, "index.html");
const PAPER_MD = path.join(PAPERS, SLUG, "paper.md");

for (const [label, p] of [
  [`_site/papers/${SLUG}/index.html`, PAPER_HTML],
  ["src/content/papers/*/paper.md", PAPER_MD],
  ["src/_data/site.js", SITE_JS],
  ["scripts/lib/identity.cjs", IDENTITY],
  ["package.json", PKG],
]) {
  if (!fs.existsSync(p)) {
    console.error(`封面图门禁自测失败：找不到 ${label}（${p}）。`);
    process.exit(1);
  }
}

/* 另一张**真实存在**的图（用来做"换成另一张图"的注入） */
const OTHER = "/assets/img/og/og-1200x630.png";

/* ---------- 沙箱 ---------- */
function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function makeSandbox() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mh-figcover-"));
  copyFile(PAPER_HTML, path.join(tmp, "_site", "papers", SLUG, "index.html"));
  copyFile(SITE_JS, path.join(tmp, "src", "_data", "site.js"));
  copyFile(IDENTITY, path.join(tmp, "scripts", "lib", "identity.cjs"));
  copyFile(PAPER_MD, path.join(tmp, "src", "content", "papers", SLUG, "paper.md"));
  copyFile(PKG, path.join(tmp, "package.json"));
  return tmp;
}

function sbPaths(tmp) {
  return {
    html: path.join(tmp, "_site", "papers", SLUG, "index.html"),
    site: path.join(tmp, "src", "_data", "site.js"),
    md: path.join(tmp, "src", "content", "papers", SLUG, "paper.md"),
    pkg: path.join(tmp, "package.json"),
  };
}

function editText(file, fn) {
  const before = fs.readFileSync(file, "utf8");
  const after = fn(before);
  if (after === before) {
    console.error(`封面图门禁自测失败：注入没有改动 ${file}（注入本身失效了）。`);
    process.exit(1);
  }
  fs.writeFileSync(file, after);
}

/**
 * 改产物里某个 @type 的 JSON-LD 节点。
 * ⚠️ 不用正则去替 `"image": "…"`：产物里**第一个** `"image"` 是作者头像
 * （Person 节点），文章图在 ScholarlyArticle 节点里——替错一处就是
 * "注入生效了但没注到该注的地方"，自测会假装通过。
 */
function editJsonLd(html, type, fn) {
  const re = /(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g;
  let touched = false;
  const out = html.replace(re, (all, open, body, close) => {
    let obj;
    try {
      obj = JSON.parse(body.trim());
    } catch (_) {
      return all;
    }
    const isGraph = obj && !Array.isArray(obj) && Array.isArray(obj["@graph"]);
    const nodes = Array.isArray(obj) ? obj : isGraph ? obj["@graph"] : [obj];
    let changed = false;
    const next = nodes.map((n) => {
      if (n && n["@type"] === type) {
        changed = true;
        return fn(n);
      }
      return n;
    });
    if (!changed) return all;
    touched = true;
    const payload = Array.isArray(obj)
      ? next
      : isGraph
        ? { ...obj, "@graph": next }
        : next[0];
    return `${open}${JSON.stringify(payload, null, 2)}${close}`;
  });
  if (!touched) {
    console.error(`封面图门禁自测失败：JSON-LD 注入没找到 @type=${type} 的节点。`);
    process.exit(1);
  }
  return out;
}

function runGate(tmp) {
  const r = spawnSync(process.execPath, [GATE], {
    env: {
      ...process.env,
      SITE_DIR: path.join(tmp, "_site"),
      SITE_DATA_PATH: path.join(tmp, "src", "_data", "site.js"),
      PAPERS_DIR: path.join(tmp, "src", "content", "papers"),
      PKG_PATH: path.join(tmp, "package.json"),
    },
    encoding: "utf8",
  });
  return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
}

/* ---------- 注入档 ---------- */
const CASES = [
  {
    id: "CV0",
    label: "基线（原样）",
    expect: "green",
  },
  {
    id: "CV1",
    label: "og:image 换成另一张图",
    expect: "red",
    marker: "门禁 CV1",
    inject: (p) => editText(p.html, (s) => s.replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${OTHER}$2`)),
  },
  {
    id: "CV2",
    label: "twitter:image 换成另一张图",
    expect: "red",
    marker: "门禁 CV1",
    inject: (p) => editText(p.html, (s) => s.replace(/(<meta name="twitter:image" content=")[^"]*(")/, `$1${OTHER}$2`)),
  },
  {
    id: "CV3",
    label: "正文 <img> 的 src 换成另一张图",
    expect: "red",
    marker: "门禁 CV1",
    inject: (p) =>
      editText(p.html, (s) =>
        s.replace(/(class="paper-figure__img"\s*\n\s*src=")[^"]*(")/, `$1../../${OTHER.replace(/^\//, "")}$2`)
      ),
  },
  {
    id: "CV4",
    label: "JSON-LD 的 image 换成另一张图",
    expect: "red",
    marker: "门禁 CV1",
    inject: (p) =>
      editText(p.html, (s) =>
        editJsonLd(s, "ScholarlyArticle", (n) => ({
          ...n,
          image: `https://github.lvyihang.xyz${OTHER}`,
        }))
      ),
  },
  {
    id: "CV5",
    label: "og:image:width 写错",
    expect: "red",
    marker: "门禁 CV2",
    inject: (p) => editText(p.html, (s) => s.replace(/(<meta property="og:image:width" content=")[^"]*(")/, "$11200$2")),
  },
  {
    id: "CV6",
    label: "正文 <img> 的 height 写错",
    expect: "red",
    marker: "门禁 CV2",
    inject: (p) => editText(p.html, (s) => s.replace(/(paper-figure__img"[\s\S]*?height=")[^"]*(")/, "$1630$2")),
  },
  {
    id: "CV7",
    label: "front matter 加回 cover 副本",
    expect: "red",
    marker: "门禁 CV3",
    inject: (p) =>
      editText(p.md, (s) => s.replace(/^(pubKey:.*)$/m, `$1\ncover: "${OTHER}"\ncoverWidth: 1200\ncoverHeight: 630`)),
  },
  {
    id: "CV8",
    label: "真源里 figure.src 漂移（没重建产物）",
    expect: "red",
    marker: "门禁 CV1",
    inject: (p) =>
      editText(p.site, (s) =>
        s.replace(/(src:\s*")\/assets\/img\/publications\/trmm-fig10\.jpg(")/, `$1${OTHER}$2`)
      ),
  },
  {
    id: "CV9",
    label: "真源里 figure.width 漂移",
    expect: "red",
    marker: "门禁 CV2",
    inject: (p) =>
      editText(p.site, (s) => s.replace(/(width:\s*)1400(,\s*\n\s*height:\s*745)/, "$11200$2")),
  },
  {
    id: "CV10",
    label: "门禁被卸掉（build 链里摘掉）",
    expect: "red",
    marker: "门禁自己被卸掉了",
    inject: (p) => {
      const pkg = JSON.parse(fs.readFileSync(p.pkg, "utf8"));
      const before = pkg.scripts.build;
      pkg.scripts.build = before.replace(/\s*&&\s*npm run check:figure-cover(?![\w-])/, "");
      if (pkg.scripts.build === before) {
        console.error("封面图门禁自测失败：CV10 注入没有改动 build 链（注入本身失效了）。");
        process.exit(1);
      }
      delete pkg.scripts["check:figure-cover"];
      fs.writeFileSync(p.pkg, JSON.stringify(pkg, null, 2));
    },
  },
  {
    id: "CV11",
    label: "边界负对照：真源与产物一起改错",
    expect: "green",
    inject: (p) => {
      // 真源换成另一张图（src / 宽 / 高一起换）
      editText(p.site, (s) =>
        s
          .replace(/(src:\s*")\/assets\/img\/publications\/trmm-fig10\.jpg(")/, `$1${OTHER}$2`)
          .replace(/(width:\s*)1400(,\s*\n\s*height:\s*)745/, "$11200$2630")
      );
      // 产物四个出口一起换成同一张图
      editText(p.html, (s) => {
        const withMeta = s
          .replace(/(<meta property="og:image" content=")[^"]*(")/, `$1https://github.lvyihang.xyz${OTHER}$2`)
          .replace(/(<meta name="twitter:image" content=")[^"]*(")/, `$1https://github.lvyihang.xyz${OTHER}$2`)
          .replace(/(class="paper-figure__img"\s*\n\s*src=")[^"]*(")/, `$1../../${OTHER.replace(/^\//, "")}$2`)
          .replace(/(<meta property="og:image:width" content=")[^"]*(")/, "$11200$2")
          .replace(/(<meta property="og:image:height" content=")[^"]*(")/, "$1630$2")
          .replace(/(paper-figure__img"[\s\S]*?width=")[^"]*(")/, "$11200$2")
          .replace(/(paper-figure__img"[\s\S]*?height=")[^"]*(")/, "$1630$2");
        return editJsonLd(withMeta, "ScholarlyArticle", (n) => ({
          ...n,
          image: `https://github.lvyihang.xyz${OTHER}`,
        }));
      });
    },
  },
];

/* ---------- 跑 ---------- */
let pass = 0;
let fail = 0;
const failures = [];

for (const c of CASES) {
  const tmp = makeSandbox();
  try {
    const p = sbPaths(tmp);
    if (c.inject) c.inject(p);
    const r = runGate(tmp);
    if (c.expect === "green") {
      if (r.code === 0) {
        pass++;
        console.log(`  ✓ ${c.id} ${c.label} → 判绿（符合预期）`);
      } else {
        fail++;
        failures.push(`${c.id} ${c.label}：期望判绿，实际 exit ${r.code}\n${r.out.trim()}`);
        console.log(`  ✗ ${c.id} ${c.label} → 实际判红（不符合预期）`);
      }
    } else {
      if (r.code === 1 && r.out.includes(c.marker)) {
        pass++;
        console.log(`  ✓ ${c.id} ${c.label} → 判红且命中「${c.marker}」（符合预期）`);
      } else {
        fail++;
        failures.push(
          `${c.id} ${c.label}：期望 exit 1 且命中「${c.marker}」，实际 exit ${r.code}\n${r.out.trim()}`
        );
        console.log(`  ✗ ${c.id} ${c.label} → 未按预期判红`);
      }
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

console.log("");
if (fail) {
  console.error(`封面图门禁自测未通过：${pass} 档符合预期，${fail} 档不符合。\n`);
  failures.forEach((f) => console.error(`  ✗ ${f}\n`));
  process.exit(1);
}
console.log(
  `封面图门禁自测通过：${pass} 档全部符合预期` +
    `（CV0 绿 · CV1–CV10 红 · CV11 绿 = 已知边界）。`
);
