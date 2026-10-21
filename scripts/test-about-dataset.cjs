#!/usr/bin/env node
/**
 * about 页产出物描述门禁的**自测**（注入矩阵）—— 证明 AP1–AP6 每一条都**能变红**。
 *
 * 为什么要有这个自测：
 *   一条**永远不会红**的判据，给出的是"看起来很确定的绿"——它比没有判据更坏，
 *   因为它把"盲区"包装成"已核过"。本门禁判的是**产物与真源的一致性**，
 *   而"注入没生效"（标记变了、正则没匹配上、定位不到那一行）恰恰是最容易发生、
 *   也最不容易看出来的失败模式。所以"这条判据结构上能不能触发"必须**被证明**。
 *
 * 做法：把产物（about 页 / 论文页 / **首页**）、真源（site.js）、散文源（about.md）
 *   **各复制**一份到临时目录，在副本上逐个注入缺陷，用环境变量把门禁指向副本，
 *   断言门禁**确实**报出了对应的那条红因。
 *   ⚠️ 全程**不动仓库里的任何文件** —— 注入必须在副本上做。
 *   （这正是门禁里留 SITE_DIR / SITE_DATA_PATH / ABOUT_MD_PATH 这三个开关的原因：
 *     没有它们，自测就只能去改仓库文件，改坏了就是事故。）
 *   ⚠️ 真源副本要带齐**同层依赖**：site.js 顶部 require 了
 *     `../../scripts/lib/identity.cjs`，所以副本按同样的相对层级摆放
 *     （<tmp>/repo/src/_data/site.js + <tmp>/repo/scripts/lib/identity.cjs）。
 *
 * 十五档：
 *   AT0 基线（原样）                    → 必须**全绿**（证明这套判据不是空跑）
 *   AT1 Contact 行把类型写成 Software    → AP1
 *   AT2 Contact 行可见的 DOI 换成别的     → AP2
 *   AT3 Selected output 的链接文字用旧标题 → AP3（引用口径的 v1.0 标题）
 *   AT4 散文里把这条记录说成 "tool"      → AP4
 *   AT5 散文源文件里写死了记录的地址      → AP4（第二份副本）
 *   AT6 真源里 author.zenodo 漂移         → AP2
 *   AT7 真源里登记类型被改（没重建产物）  → AP1
 *   AT8 产物上的定位标记被删掉            → AP1/AP2（判据定位不到）
 *   AT9 论文页的术语被改成 Software        → AP1（跨页一致性）
 *   AT10 **边界负对照**：真源与产物**一起**改错 → **必须判绿**
 *   AT11 首页简介段把这条记录说成 "tool"   → AP6
 *   AT12 首页简介段不按登记类型称呼它      → AP6
 *   AT13 首页上的定位标记被删掉            → AP6（判据定位不到）
 *   AT14 首页简介段把这条记录说成 "code"   → AP6
 *
 * ⚠️ AT10 这一档是**故意判绿**的，理由写在这里，别当成漏网：
 *   本门禁守的是「页面与真源不漂移」。如果有人把**真源与页面一起**改成别的
 *   （连 DataCite 登记事实也一起改），页面与真源仍然自洽 ⇒ 门禁**抓不到**。
 *   这是**已知边界**，不是缺陷；把它写成一条会跑的自测，是为了让这个边界**可证**，
 *   而不是只在注释里说说。真源正确性靠人工核 + 外部登记核对（DataCite）。
 *   ⚠️ D29 起这一档**必须连首页一起改**：真源类型变成 Software 后，首页那句
 *   也要跟着说 software，否则 AT10 会因为**首页没跟着改**而判红 —— 那就变成
 *   在测"首页有没有跟着真源变"，不是在本档要测的"两边一起改错时门禁判绿"。
 *
 * 用法：node scripts/test-about-dataset.cjs
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-about-dataset.cjs");
const SITE = path.join(ROOT, "_site");
const ABOUT_MD = path.join(ROOT, "src", "content", "about.md");
const SITE_JS = path.join(ROOT, "src", "_data", "site.js");
const IDENTITY = path.join(ROOT, "scripts", "lib", "identity.cjs");

const siteData = require(SITE_JS);
const pub = siteData.publications.find((p) => p && p.software && p.software.doi);
if (!pub) {
  console.error("about 页门禁自测失败：真源里没有带 software 的论文记录。");
  process.exit(1);
}
const SLUG = pub.slug;
const ABOUT_HTML = path.join(SITE, "about", "index.html");
const PAPER_HTML = path.join(SITE, "papers", SLUG, "index.html");
const HOME_HTML = path.join(SITE, "index.html");

for (const [label, p] of [
  ["_site/about/index.html", ABOUT_HTML],
  [`_site/papers/${SLUG}/index.html`, PAPER_HTML],
  ["_site/index.html", HOME_HTML],
  ["src/content/about.md", ABOUT_MD],
  ["src/_data/site.js", SITE_JS],
  ["scripts/lib/identity.cjs", IDENTITY],
]) {
  if (!fs.existsSync(p)) {
    console.error(`about 页门禁自测失败：找不到 ${label}（${p}）。`);
    process.exit(1);
  }
}

const original = {
  about: fs.readFileSync(ABOUT_HTML, "utf8"),
  paper: fs.readFileSync(PAPER_HTML, "utf8"),
  home: fs.readFileSync(HOME_HTML, "utf8"),
  md: fs.readFileSync(ABOUT_MD, "utf8"),
  js: fs.readFileSync(SITE_JS, "utf8"),
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mh-about-dataset-selftest-"));

/** 在副本上注入 → 跑门禁 → 返回 {code, out} */
function run(mutate) {
  const siteDir = path.join(tmp, "site");
  const repoDir = path.join(tmp, "repo");
  const mdPath = path.join(tmp, "about.md");

  const parts = { ...original };
  if (mutate) {
    const next = mutate(parts);
    if (!next) throw new Error("注入没有改变任何内容 —— 锚点不存在，这一档是坏跑");
    Object.assign(parts, next);
  }

  fs.rmSync(siteDir, { recursive: true, force: true });
  fs.rmSync(repoDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(siteDir, "about"), { recursive: true });
  fs.mkdirSync(path.join(siteDir, "papers", SLUG), { recursive: true });
  fs.mkdirSync(path.join(repoDir, "src", "_data"), { recursive: true });
  fs.mkdirSync(path.join(repoDir, "scripts", "lib"), { recursive: true });

  fs.writeFileSync(path.join(siteDir, "about", "index.html"), parts.about);
  fs.writeFileSync(path.join(siteDir, "papers", SLUG, "index.html"), parts.paper);
  fs.writeFileSync(path.join(siteDir, "index.html"), parts.home);
  fs.writeFileSync(path.join(repoDir, "src", "_data", "site.js"), parts.js);
  fs.writeFileSync(path.join(repoDir, "scripts", "lib", "identity.cjs"), fs.readFileSync(IDENTITY, "utf8"));
  fs.writeFileSync(mdPath, parts.md);

  const r = spawnSync(process.execPath, [GATE], {
    env: {
      ...process.env,
      SITE_DIR: siteDir,
      SITE_DATA_PATH: path.join(repoDir, "src", "_data", "site.js"),
      ABOUT_MD_PATH: mdPath,
    },
    encoding: "utf8",
  });
  return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
}

/** 替换一次；锚点不存在就抛错（坏跑必须当场暴露，不能记成"测过了"） */
function replaceOnce(text, from, to) {
  if (!text.includes(from)) throw new Error(`注入锚点不存在：找不到「${from}」`);
  return text.replace(from, to);
}

let failed = 0;
function expectRed(label, mutate, expect) {
  let r;
  try {
    r = run(mutate);
  } catch (e) {
    console.log(`  ✗ ${label} → 注入本身坏了：${e.message}`);
    failed += 1;
    return;
  }
  if (r.code !== 1) {
    console.log(`  ✗ ${label} → 期望判红（exit 1），实测 exit ${r.code}`);
    failed += 1;
    return;
  }
  if (!r.out.includes(expect)) {
    console.log(`  ✗ ${label} → 判红了，但红因里没有「${expect}」`);
    failed += 1;
    return;
  }
  console.log(`  ✓ ${label} → 判红，且红因点名「${expect}」`);
}

function expectGreen(label, mutate) {
  let r;
  try {
    r = run(mutate);
  } catch (e) {
    console.log(`  ✗ ${label} → 注入本身坏了：${e.message}`);
    failed += 1;
    return;
  }
  if (r.code !== 0) {
    console.log(`  ✗ ${label} → 期望判绿（exit 0），实测 exit ${r.code}`);
    console.log(
      r.out
        .split("\n")
        .filter((l) => l.includes("✗"))
        .map((l) => `      ${l.trim()}`)
        .join("\n")
    );
    failed += 1;
    return;
  }
  console.log(`  ✓ ${label} → 判绿`);
}

const REGISTERED = pub.software.registeredTitle;
const CITE = pub.software.citeTitle;
const URL = pub.software.url;

console.log("about 页产出物描述门禁 · 自测（注入矩阵）\n");

/* AT0 基线 */
expectGreen("AT0 基线（原样）", null);

/* AT1 Contact 行类型写成 Software */
expectRed(
  "AT1 Contact 行把类型写成 Software",
  (p) => ({ about: replaceOnce(p.about, "<dt>Dataset</dt>", "<dt>Software</dt>") }),
  "登记事实"
);

/* AT2 可见 DOI 换成别的 */
expectRed(
  "AT2 Contact 行可见的 DOI 换成别的",
  (p) => ({
    about: replaceOnce(
      p.about,
      ">Zenodo · doi:10.5281/zenodo.18041880</a>",
      ">Zenodo · doi:10.5281/zenodo.16662143</a>"
    ),
  }),
  "可见的 DOI"
);

/* AT3 链接文字回退到引用口径的旧标题 */
expectRed(
  "AT3 Selected output 的链接文字用旧标题",
  (p) => ({ about: replaceOnce(p.about, `>${REGISTERED}</a>`, `>${CITE}</a>`) }),
  "登记标题"
);

/* AT4 散文里说成 tool */
expectRed(
  "AT4 散文里把这条记录说成 tool",
  (p) => ({
    about: replaceOnce(
      p.about,
      "the stage-identification dataset for thunderstorms",
      "the stage-identification tool for thunderstorms"
    ),
  }),
  "tool"
);

/* AT5 散文源文件写死地址 */
expectRed(
  "AT5 散文源文件里写死了记录的地址",
  (p) => ({
    md: replaceOnce(
      p.md,
      "[Zenodo]({{DATASET_URL}})",
      "[Zenodo](https://doi.org/10.5281/zenodo.18041880)"
    ),
  }),
  "第二份副本"
);

/* AT6 真源里 author.zenodo 漂移 */
expectRed(
  "AT6 真源里 author.zenodo 漂移",
  (p) => ({
    js: replaceOnce(
      p.js,
      "zenodo: DATASET_URL,",
      'zenodo: "https://doi.org/10.5281/zenodo.16662143",'
    ),
  }),
  "author.zenodo"
);

/* AT7 真源里登记类型被改（产物没重建） */
expectRed(
  "AT7 真源里登记类型被改（产物没重建）",
  (p) => ({
    js: replaceOnce(p.js, 'const DATASET_TYPE = "Dataset";', 'const DATASET_TYPE = "Software";'),
  }),
  "登记事实"
);

/* AT8 产物上的定位标记被删掉 */
expectRed(
  "AT8 产物上的定位标记被删掉",
  (p) => ({ about: replaceOnce(p.about, " data-dataset-contact", "") }),
  "标记"
);

/* AT9 论文页术语被改 */
expectRed(
  "AT9 论文页的术语被改成 Software",
  (p) => ({ paper: replaceOnce(p.paper, "<dt>Dataset</dt>", "<dt>Software</dt>") }),
  "登记事实"
);

/* AT10 边界负对照：真源与产物一起改错 ⇒ 必须判绿
   ⚠️ D29 起必须**连首页一起改**：真源类型变成 Software 后，首页那句也要说 software，
   否则这一档会因为"首页没跟着真源变"而判红 —— 那就变成在测"首页有没有跟着真源变"，
   不是在本档要测的"两边一起改错时门禁判绿"。 */
expectGreen(
  "AT10 边界负对照：真源与产物一起改错",
  (p) => ({
    js: replaceOnce(p.js, 'const DATASET_TYPE = "Dataset";', 'const DATASET_TYPE = "Software";'),
    about: replaceOnce(p.about, "<dt>Dataset</dt>", "<dt>Software</dt>")
      .replace("about-output__meta\">Dataset: ", "about-output__meta\">Software: ")
      .replace(
        "the stage-identification dataset for thunderstorms",
        "the stage-identification software for thunderstorms"
      ),
    paper: replaceOnce(p.paper, "<dt>Dataset</dt>", "<dt>Software</dt>"),
    /* 首页那句里的两处类型词都要换：只换一处的话，"before" 里还留着 dataset，
       类型词那条判据仍然成立 ⇒ 这一档就测不到"两边一起改错"了。 */
    home: replaceOnce(
      p.home,
      "The TRMM tropical convection dataset behind this work is released",
      "The TRMM tropical convection software behind this work is released"
    ).replace("the dataset is archived on", "the software is archived on"),
  })
);

/* AT11 首页简介段把这条记录说成 tool */
expectRed(
  "AT11 首页简介段把这条记录说成 tool",
  (p) => ({
    home: replaceOnce(p.home, "the dataset is archived on", "the tool is archived on"),
  }),
  "tool"
);

/* AT12 首页简介段不按登记类型称呼它
   ⚠️ 两处类型词都要换掉：只换一处的话，"before" 里还留着 dataset，
   类型词那条判据照样通过 ⇒ 这一档会假绿。 */
expectRed(
  "AT12 首页简介段不按登记类型称呼它",
  (p) => ({
    home: replaceOnce(
      p.home,
      "The TRMM tropical convection dataset behind this work is released",
      "The TRMM tropical convection material behind this work is released"
    ).replace("the dataset is archived on", "the material is archived on"),
  }),
  "没有按登记类型"
);

/* AT13 首页上的定位标记被删掉 */
expectRed(
  "AT13 首页上的定位标记被删掉",
  (p) => ({ home: replaceOnce(p.home, " data-dataset-home", "") }),
  "标记"
);

/* AT14 首页简介段把这条记录说成 code */
expectRed(
  "AT14 首页简介段把这条记录说成 code",
  (p) => ({
    home: replaceOnce(p.home, "the dataset is archived on", "the code is archived on"),
  }),
  "code"
);

console.log("");
if (failed) {
  console.error(`about 页门禁自测失败：${failed} 档没达到预期。`);
  process.exit(1);
}
console.log(
  "about 页门禁自测通过：15 档全部符合预期" +
    "（AT0 绿 · AT1–AT9 红 · AT10 绿 = 已知边界 · AT11–AT14 红）。"
);
