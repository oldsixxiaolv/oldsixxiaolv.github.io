#!/usr/bin/env node
/**
 * 自测 M1–M8：给 scripts/check-artifact-metadata.cjs 的每条判据找一次「它会红」的证据
 *
 * 为什么要有这个自测（2026-10-22 的 D59 第九批）：
 *   这道门禁守的是「论文页结构化数据里的数据集 / 胶囊 / 代码仓库，
 *   必须与 src/_data/site.js 单一真源逐字段一致」。
 *   而「门禁是绿的」有两种可能：① 它真的没问题；② 它的判据从来没被真正执行过。
 *   这两件事长得一模一样。所以每条判据都要有一档**注入**证明它会红，
 *   再有一档**负对照**证明「卸掉那一步之后确实就绿了」——否则红可能来自别处。
 *
 * ⚠️ 本批同时堵上了这道门禁**自己身上的四个真洞**（都是实跑出来的，不是推演的）：
 *   ① **论文页用的是存在性判据**：旧实现只看「页面上至少有一个 href 等于 pub.code」
 *      ⇒ 论文页那两条代码仓链接里**只要有一条**还对，门禁就放行 ⇒ 另一条漂移没人叫。
 *      现在改成按 `data-code-repo` **标记**定位，且要求**每一条**带标记的链接都对。
 *   ② **M6 用子串匹配判「门禁自己没被卸掉」**：旧实现是 `build.includes("check:artifact")`
 *      ⇒ 本批新增的 `check:artifact-selftest` 名字里就含 `check:artifact`
 *      ⇒ 真正把 `check:artifact` 从 build 链摘掉之后，M6 反而判绿。
 *      现在沿 `npm run` 链从 build 往下走，只认真的指向本文件的 script。
 *   ③ **M8 之前只看「一共比过几处」**：只要 M2/M3/M4 里任何一条还在比，它就非 0
 *      ⇒ **M1 整段被摘掉也照样判绿**（判据还在文件里、但一行都不执行）。
 *      现在逐**比较点**核对（M8a 那一档就是这条的现场）。
 *   ④ **M1/M2 的 license 期望值与模板投影表达式不同源**：模板投影的是
 *      `sw.licenseUrl || sw.license`，门禁却拿 `sw.licenseUrl || undefined` 去比
 *      ⇒ 一旦 licenseUrl 被删（正是 M5 想让作者补的东西），页面是对的、门禁却报假红。
 *
 * 夹具怎么造（为什么不照抄真仓库）：
 *   夹具是一个**临时目录**（不是 git 仓 —— 这道门禁不依赖 git 索引）：
 *     <tmp>/repo/scripts/check-artifact-metadata.cjs  门禁副本（负对照要改它的 M*_ON 开关与判据代码）
 *     <tmp>/repo/src/_data/site.js                     真源（一条论文：数据集 + 胶囊 + 代码仓）
 *     <tmp>/repo/_site/index.html                      首页（**有且只有一条**带标记的代码仓链接）
 *     <tmp>/repo/_site/papers/demo-paper/index.html     论文页（两个 JSON-LD 块 + **两条**带标记的链接）
 *     <tmp>/repo/package.json                           build 链：build → check:artifact → 门禁
 *   门禁的 ROOT 根是「它自己所在目录的上一级」，所以副本里的它**天然**
 *   指向副本里的仓，不需要任何环境变量。
 *
 *   ⚠️ 论文页刻意放**两条**带标记的链接（页头按钮 + 可得性段那一行），
 *      两条都指向真源仓库 —— 与真实站点同构。少放一条的话，
 *      「存在性判据抓不到漂移」这个洞在夹具上就复现不出来。
 *   ⚠️ 论文页与首页都刻意放**不带标记**的链接（指向别的仓）：
 *      证明门禁只认带标记的那几条，不把普通链接拖进来比。
 *
 * 档位（4 档绿 + 10 档注入 + 8 档判据级负对照 + 2 档精准性负对照 + 2 档覆盖度自证 = 26 档）：
 *   G0    基线绿
 *   G1    论文页有一条**不带标记**的链接指向别的仓        ⇒ 绿（标记定位生效）
 *   G2    真源里这篇论文**没有**注册产出物               ⇒ 绿（相关比较点被豁免，M8 不误报）
 *   G3    真源里只有 license（没有 licenseUrl）          ⇒ 绿（旧口径下是**假红**）
 *   M1a   数据集实体的 @id 漂了（页面上找不到真源 DOI）   ⇒ M1
 *   M1b   数据集的 license 与真源不一致                  ⇒ M1
 *   M2a   胶囊的 codeRepository 与真源不一致              ⇒ M2
 *   M3a   代码仓实体的 codeRepository 漂了                ⇒ M3
 *   M3b   代码仓实体的 creator.sameAs 里没有本人 ORCID    ⇒ M3
 *   M4a   论文页**两条**标记链接里有一条漂了              ⇒ M4（存在性判据抓不到的那一种）
 *   M5a   复用条款退化成一句非 URL 的字符串              ⇒ M5
 *   M6a   真正指向门禁的那条从 build 链上被摘掉          ⇒ M6（子串匹配抓不到的那一种）
 *   M7a   有一个 JSON-LD 块解析失败                      ⇒ M7（红因**恰为** {M7}）
 *   M8a   M1 那一整段判据被摘掉                          ⇒ M8
 *   N-M1 … N-M8 负对照（逐条，8 档）：卸掉某条判据 ⇒ 对应注入必须**转绿**
 *   P-M1 精准性负对照：卸 M1 + M1a 注入 + M2a 注入 ⇒ 必须**恰好**红 {M2}
 *   P-M7 精准性负对照：前提不在场（M7a）+ 论文页链接漂（M4a）⇒ 必须**恰好**红 {M7}
 *   COV-A 覆盖度自证：比较点静态目录的每个点在源码里都有落点，且自报数量与独立数出的一致
 *   COV-B 覆盖度自证：门禁里 M1–M8 每条都有红因出口与可卸开关（结构层；
 *                     开关真被消费由 N-M1–N-M8 八档负对照在行为层证明）
 *
 * ⚠️ 每档都断言「红因编号多重集**完全相等**」，不只是「包含期望的那条」——
 *   一档里出现两条判据的红，红因归属就不可判定了（那是脚本的缺陷，不是产品的缺陷）。
 *   N-M1–N-M8 / P-M1 / P-M7 这十档负对照正是「归属纯净」的守门人。
 *
 * ⚠️ 注入到**门禁副本 / 夹具文件**上的每一处改动，都额外断言「改动行数 = 声明值」：
 *   证明破坏确实打上了，而且只打了声明的那些行（既防「没打上」，也防「顺手多改了一行」）。
 *
 * ⚠️ 本文件源码里**不得出现**字面量的本地 require 语法 ——
 *   门禁 TR1 会扫到**已跟踪的代码文件**（包括本文件），
 *   一旦这里写着一个真的本地 require，提交后门禁会对着自己判红。
 *
 * 收尾：按 SHA-256 校验仓库里的门禁原件没被动过。
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const GATE = path.join(ROOT, "scripts", "check-artifact-metadata.cjs");

function sha256(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

/* 原件指纹：**自测开始时**记下来，收尾时比对 ——
   证明这一整轮注入全在副本上，仓库里的原件一个字节都没动。 */
const GATE_SHA_AT_START = sha256(GATE);

/* ================= 夹具里的固定事实 ================= */

const FX = {
  siteUrl: "https://example.test",
  slug: "demo-paper",
  repo: "https://github.com/example/repo",
  otherRepo: "https://github.com/example/other",
  orcid: "https://orcid.org/0000-0002-1825-0097",
  swDoi: "10.0000/demo-dataset",
  swLicense: "https://creativecommons.org/licenses/by/4.0/",
  swVersion: "1.0",
  capDoi: "10.0000/demo-capsule",
  capUrl: "https://codeocean.com/capsule/1/tree/v1",
  capLicense: "http://www.apache.org/licenses/LICENSE-2.0",
  capVersion: "2.0",
};

/* 真源：一篇论文，三件产出物。software / capsule 各占**一行** ——
   注入要能单独把某一行摘掉（绿档 G2 就靠这个）。 */
const SITE_SRC = [
  "module.exports = {",
  `  url: "${FX.siteUrl}",`,
  "  author: {",
  '    name: "Demo Author",',
  `    orcid: "${FX.orcid}",`,
  `    sameAs: ["${FX.orcid}"],`,
  `    paperCodeRepo: "${FX.repo}",`,
  "  },",
  "  publications: [",
  "    {",
  `      slug: "${FX.slug}",`,
  `      code: "${FX.repo}",`,
  `      software: { doi: "${FX.swDoi}", url: "https://doi.org/${FX.swDoi}", version: "${FX.swVersion}", licenseUrl: "${FX.swLicense}" },`,
  `      capsule: { doi: "${FX.capDoi}", url: "${FX.capUrl}", version: "${FX.capVersion}", licenseUrl: "${FX.capLicense}" },`,
  "    },",
  "  ],",
  "};",
  "",
].join("\n");

/* 论文页：两个 JSON-LD 块（块 A = @graph 里的数据集 + 胶囊；块 B = 代码仓实体），
   外加**两条**带 data-code-repo 标记的链接（都指向真源仓库）。 */
const PAPER_SRC = [
  "<!doctype html>",
  '<html lang="en">',
  "<head><title>Demo paper</title></head>",
  "<body>",
  "<h1>Demo paper</h1>",
  `<p><a class="code-button" href="${FX.repo}" data-code-repo target="_blank" rel="noopener noreferrer">Code ↗</a></p>`,
  '<section class="availability">',
  `<p>Code: <a class="code-availability" href="${FX.repo}" data-code-repo target="_blank" rel="noopener noreferrer">example/repo</a></p>`,
  `<p>Paper: <a class="paper-pdf" href="${FX.siteUrl}/papers/${FX.slug}/">PDF</a></p>`,
  "</section>",
  '<script type="application/ld+json">',
  "{",
  '  "@context": "https://schema.org",',
  '  "@graph": [',
  "    {",
  '      "@type": "Dataset",',
  `      "@id": "https://doi.org/${FX.swDoi}",`,
  `      "identifier": "https://doi.org/${FX.swDoi}",`,
  `      "license": "${FX.swLicense}",`,
  `      "version": "${FX.swVersion}"`,
  "    },",
  "    {",
  '      "@type": "SoftwareSourceCode",',
  `      "@id": "https://doi.org/${FX.capDoi}",`,
  `      "identifier": "https://doi.org/${FX.capDoi}",`,
  `      "codeRepository": "${FX.capUrl}",`,
  `      "license": "${FX.capLicense}",`,
  `      "version": "${FX.capVersion}"`,
  "    }",
  "  ]",
  "}",
  "</script>",
  '<script type="application/ld+json">',
  "{",
  '  "@context": "https://schema.org",',
  '  "@type": "SoftwareSourceCode",',
  `  "@id": "${FX.repo}",`,
  `  "url": "${FX.repo}",`,
  `  "identifier": "${FX.repo}",`,
  `  "codeRepository": "${FX.repo}",`,
  '  "creator": {',
  '    "@type": "Person",',
  `    "@id": "${FX.siteUrl}/#person",`,
  '    "name": "Demo Author",',
  `    "url": "${FX.siteUrl}/#person",`,
  `    "sameAs": ["${FX.orcid}"]`,
  "  },",
  `  "citation": { "@id": "${FX.siteUrl}/papers/${FX.slug}/" }`,
  "}",
  "</script>",
  "</body>",
  "</html>",
  "",
].join("\n");

/* 首页：**有且只有一条**带标记的代码仓链接（多一条 ⇒ 判据有歧义，门禁要红）。 */
const HOME_SRC = [
  "<!doctype html>",
  '<html lang="en">',
  "<head><title>Home</title></head>",
  "<body>",
  `<p><a class="code-entry" href="${FX.repo}" data-code-repo target="_blank" rel="noopener noreferrer">example/repo</a></p>`,
  `<p><a class="site-home" href="${FX.siteUrl}/">Home</a></p>`,
  "</body>",
  "</html>",
  "",
].join("\n");

/* build 链：build → check:artifact → 门禁。
   ⚠️ 刻意**同时**挂一个 check:artifact-selftest（名字里含 "check:artifact"）：
      M6 旧口径是 `build.includes("check:artifact")` ⇒ 只要 build 串里还留着
      那个名字，它就判绿 —— 哪怕真正指向门禁的那条已经被摘掉。
      真实仓库本批新增自测脚本后就是这个形状 ⇒ 夹具必须同构，
      否则 M6a 那一档根本抓不到这个洞。 */
const PKG_SRC =
  JSON.stringify(
    {
      name: "artifact-metadata-fixture",
      private: true,
      scripts: {
        build: "npm run check:artifact && npm run check:artifact-selftest",
        "check:artifact": "node scripts/check-artifact-metadata.cjs",
        "check:artifact-selftest": "node scripts/test-artifact-metadata.cjs",
      },
    },
    null,
    2
  ) + "\n";

/* ================= 夹具 ================= */

function write(p, text) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
}

function makeSandbox() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "mh-artifact-meta-"));
  const repo = path.join(base, "repo");
  fs.mkdirSync(path.join(repo, "scripts"), { recursive: true });
  fs.copyFileSync(GATE, path.join(repo, "scripts", "check-artifact-metadata.cjs"));
  write(path.join(repo, "src", "_data", "site.js"), SITE_SRC);
  write(path.join(repo, "_site", "index.html"), HOME_SRC);
  write(path.join(repo, "_site", "papers", FX.slug, "index.html"), PAPER_SRC);
  write(path.join(repo, "package.json"), PKG_SRC);
  return { base, repo };
}

const siteOf = (s) => path.join(s.repo, "src", "_data", "site.js");
const paperOf = (s) => path.join(s.repo, "_site", "papers", FX.slug, "index.html");
const homeOf = (s) => path.join(s.repo, "_site", "index.html");
const pkgOf = (s) => path.join(s.repo, "package.json");
const gateOf = (s) => path.join(s.repo, "scripts", "check-artifact-metadata.cjs");

/* ================= 跑门禁 / 解析红因 ================= */

/** 跑副本里的门禁，返回 { code, out }。 */
function runGate(s) {
  try {
    const out = execFileSync(process.execPath, [gateOf(s)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (e) {
    return {
      code: typeof e.status === "number" ? e.status : 1,
      out: `${e.stdout || ""}${e.stderr || ""}`,
    };
  }
}

/** 红因编号**多重集**（只认行首的「✗ 门禁 Mn：」，消息正文里出现的字样不算）。 */
function redIds(out) {
  const list = [];
  const re = /^[ \t]*✗[ \t]*门禁[ \t]+(M\d+)/gm;
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
 * 把门禁副本里**一段连续的判据代码**整段摘掉（换成同样行数的注释行）。
 * 用途：证明 M8 能抓到「整段判据静默失效」——
 *   旧口径只看「一共比过几处」，M1 整段被摘掉也判绿。
 * 口径：**行数不变**（行号不位移 ⇒ 后面所有注入点仍然对得上），
 *   并断言被摘掉的那段正好是声明的行数。
 */
function neutralizeBlock(s, startAnchor, endAnchor, expectLines) {
  const file = gateOf(s);
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const start = lines.findIndex((l) => l.includes(startAnchor));
  if (start < 0) throw new Error(`起锚点不存在，已中止：${startAnchor}`);
  const tail = lines.slice(start).join("\n");
  const at = tail.indexOf(endAnchor);
  if (at < 0) throw new Error(`止锚点不存在，已中止：${endAnchor}`);
  const end = start + tail.slice(0, at + endAnchor.length).split("\n").length - 1;
  const block = lines.slice(start, end + 1);
  if (block.length !== expectLines) {
    throw new Error(
      `被摘掉的那段行数与声明不符（期望 ${expectLines} 行，实际 ${block.length} 行）—— 已中止。`
    );
  }
  const filler = Array.from({ length: expectLines }, (_, i) =>
    i === 0
      ? "  // ↑ 这一段判据被摘掉了（自测注入）：用来证明 M8 能抓到「整段静默失效」。"
      : "  //"
  );
  lines.splice(start, expectLines, ...filler);
  fs.writeFileSync(file, lines.join("\n"));
  /* 摘完必须还是一份能解析的脚本 —— 否则红因会变成「语法错误」，归属就废了。 */
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    throw new Error(`摘掉那一段之后门禁副本不再是合法脚本 —— 已中止。\n${e.stderr || e.message}`);
  }
}

/* ---------- 注入档各自的动作 ---------- */

/** M1a：数据集实体的 @id 漂了 ⇒ 页面上找不到 @id = 真源 DOI 的 Dataset。 */
function injectDatasetIdDrift(s) {
  patchFile(
    paperOf(s),
    `"@id": "https://doi.org/${FX.swDoi}",`,
    `"@id": "https://doi.org/10.0000/other-dataset",`,
    1
  );
}

/** M1b：数据集的 license 与真源不一致（页面写成了 MIT）。 */
function injectDatasetLicenseDrift(s) {
  patchFile(paperOf(s), `"license": "${FX.swLicense}",`, `"license": "MIT",`, 1);
}

/** M2a：胶囊的 codeRepository 与真源不一致。 */
function injectCapsuleRepoDrift(s) {
  patchFile(paperOf(s), `"codeRepository": "${FX.capUrl}",`, `"codeRepository": "https://codeocean.com/capsule/1/tree/v2",`, 1);
}

/** M3a：代码仓实体的 codeRepository 漂了 ⇒ 结构化数据里再也找不到它。 */
function injectRepoEntityDrift(s) {
  patchFile(paperOf(s), `"codeRepository": "${FX.repo}",`, `"codeRepository": "${FX.otherRepo}",`, 1);
}

/** M3b：代码仓实体的 creator.sameAs 里没有本人 ORCID。 */
function injectCreatorOrcidDropped(s) {
  patchFile(paperOf(s), `"sameAs": ["${FX.orcid}"]`, `"sameAs": ["${FX.siteUrl}/#person"]`, 1);
}

/** M4a：论文页**两条**带标记的链接里有一条漂了（存在性判据抓不到的那一种）。 */
function injectPaperMarkedLinkDrift(s) {
  patchFile(
    paperOf(s),
    `class="code-availability" href="${FX.repo}"`,
    `class="code-availability" href="${FX.otherRepo}"`,
    1
  );
}

/** M5a：复用条款退化成一句非 URL 的字符串（真源与页面**一致地**退化）。
    两边一起改 ⇒ M1 的字段比较仍然是"一致"的，红因只可能来自 M5。 */
function injectReuseTermNotUrl(s) {
  patchFile(siteOf(s), `licenseUrl: "${FX.swLicense}"`, `licenseUrl: "CC BY 4.0"`, 1);
  patchFile(paperOf(s), `"license": "${FX.swLicense}",`, `"license": "CC BY 4.0",`, 1);
}

/** M6a：真正指向门禁的那条被摘掉，但 build 链里**仍然**留着
    名字里含 "check:artifact" 的另一条（check:artifact-selftest）。
    ⚠️ 旧口径（build 串做子串匹配）在这里会判**绿** ——
       子串还在，但它指的根本不是门禁 ⇒ 这就是 M6 那个洞的现场。 */
function unwireGate(s) {
  patchFile(
    pkgOf(s),
    `"build": "npm run check:artifact && npm run check:artifact-selftest"`,
    `"build": "npm run check:artifact-selftest"`,
    1
  );
}

/** M7a：有一个 JSON-LD 块解析失败（给块 A 塞一个多余的逗号）。 */
function injectBrokenJsonBlock(s) {
  patchFile(paperOf(s), `"version": "${FX.swVersion}"`, `"version": "${FX.swVersion}",,`, 1);
}

/** M8a：M1 那一整段判据被摘掉（比较点从此一次都不跑）。 */
function neutralizeM1Block(s) {
  neutralizeBlock(
    s,
    "/* M1 数据集 */",
    '    waivePrefix("M1.");\n  }',
    25
  );
}

const results = [];
function record(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${id}${detail ? " —— " + detail : ""}`);
}

/**
 * 一档「注入 ⇒ 应当恰好红这么几条判据」。
 * @param want 期望的红因编号多重集（必须完全相等）
 * @param mustContain 红因文案里必须出现的片段（可选）：证明「红的是这一类问题」，
 *        而不只是「编号对上了」。
 */
function expectRed(id, s, want, opts) {
  const o = opts || {};
  const r = runGate(s);
  const got = redIds(r.out);
  const idsOk = sameMultiset(got, want);
  const textOk = !o.mustContain || r.out.includes(o.mustContain);
  const ok = r.code === 1 && idsOk && textOk;
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

/** 一档「负对照：卸掉某条判定 ⇒ 应当完全转绿，一个红因都不许剩」。 */
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

/** 一档「绿档」：门禁应当 exit 0 且一个红因都不许有。 */
function expectGreenBaseline(id, s, note) {
  const r = runGate(s);
  const got = redIds(r.out);
  const ok = r.code === 0 && got.length === 0;
  record(
    id,
    ok,
    ok
      ? `绿${note ? "；" + note : ""}`
      : `不该红，却 exit ${r.code}，红因 ${fmtIds(got)}\n${r.out}`
  );
}

/* ================= G0 / G1 / G2：绿档 ================= */

/* G0：基线 —— 一切与真源一致。 */
{
  const s = makeSandbox();
  expectGreenBaseline(
    "G0 基线（临时目录上）",
    s,
    "三件产出物的字段与真源逐字一致、标记定位生效、门禁接在 build 链上"
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* G1：论文页有一条**不带标记**的链接指向别的仓 —— 判绿。
   证明门禁只认带 data-code-repo 标记的那几条，不把普通链接拖进来比。 */
{
  const s = makeSandbox();
  patchFile(
    paperOf(s),
    `class="paper-pdf" href="${FX.siteUrl}/papers/${FX.slug}/"`,
    `class="paper-pdf" href="${FX.otherRepo}"`,
    1
  );
  expectGreenBaseline("G1 论文页有一条不带标记的链接指向别的仓 ⇒ 绿（标记定位生效）", s);
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* G2：真源里这篇论文**没有**注册产出物 —— 判绿。
   这时 M1./M2./M5. 的比较点被**豁免**（前提不成立，不是漏跑）⇒ M8 不该误报。 */
{
  const s = makeSandbox();
  patchFile(
    siteOf(s),
    `      software: { doi: "${FX.swDoi}", url: "https://doi.org/${FX.swDoi}", version: "${FX.swVersion}", licenseUrl: "${FX.swLicense}" },`,
    "      // software: 这一篇没有注册数据集产出物",
    1
  );
  patchFile(
    siteOf(s),
    `      capsule: { doi: "${FX.capDoi}", url: "${FX.capUrl}", version: "${FX.capVersion}", licenseUrl: "${FX.capLicense}" },`,
    "      // capsule: 这一篇没有注册胶囊产出物",
    1
  );
  expectGreenBaseline(
    "G2 真源里没有注册产出物 ⇒ 绿（相关比较点被豁免，M8 不误报）",
    s
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* G3：真源里**只有 license、没有 licenseUrl** —— 判绿。
   模板投影的是 `licenseUrl || license`，所以页面上的 license 就是那一句 license。
   ⚠️ 这一档**补之前是红的**：旧门禁拿 `licenseUrl || undefined` 去比
      ⇒ 期望值是 undefined、页面上却有值 ⇒ 报一条「不一致」的**假红**
      （页面是对的、门禁在骂人）。这一档就是那句假话的证伪现场。 */
{
  const s = makeSandbox();
  patchFile(
    siteOf(s),
    `licenseUrl: "${FX.swLicense}"`,
    `license: "${FX.swLicense}"`,
    1
  );
  expectGreenBaseline(
    "G3 真源里只有 license（没有 licenseUrl）⇒ 绿（旧口径下是假红）",
    s
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= 注入档 M1a / M1b ================= */

/* M1a：数据集实体漂了 ⇒ 页面上再也找不到 @id = 真源 DOI 的 Dataset。 */
{
  const s = makeSandbox();
  injectDatasetIdDrift(s);
  expectRed("M1a 数据集实体的 @id 漂了 ⇒ M1", s, ["M1"], {
    mustContain: "的 Dataset 实体",
  });
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* M1b：数据集的 license 与真源不一致。 */
{
  const s = makeSandbox();
  injectDatasetLicenseDrift(s);
  expectRed("M1b 数据集的 license 与真源不一致 ⇒ M1", s, ["M1"], {
    mustContain: "license 不一致",
  });
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= 注入档 M2a ================= */

/* M2a：胶囊的 codeRepository 与真源不一致。 */
{
  const s = makeSandbox();
  injectCapsuleRepoDrift(s);
  expectRed("M2a 胶囊的 codeRepository 与真源不一致 ⇒ M2", s, ["M2"], {
    mustContain: "codeRepository 不一致",
  });
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= 注入档 M3a / M3b ================= */

/* M3a：代码仓实体的 codeRepository 漂了 ⇒ 结构化数据里再也找不到指向真源仓库的实体。 */
{
  const s = makeSandbox();
  injectRepoEntityDrift(s);
  expectRed("M3a 代码仓实体的 codeRepository 漂了 ⇒ M3", s, ["M3"], {
    mustContain: "结构化数据里没有 codeRepository",
  });
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* M3b：代码仓实体的 creator.sameAs 里没有本人 ORCID。 */
{
  const s = makeSandbox();
  injectCreatorOrcidDropped(s);
  expectRed("M3b 代码仓实体的 creator.sameAs 里没有本人 ORCID ⇒ M3", s, ["M3"], {
    mustContain: "sameAs 里没有本人 ORCID",
  });
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= 注入档 M4a ================= */

/* M4a：论文页**两条**带标记的链接里有一条漂了。
   ⚠️ 这一档是「存在性判据」那个洞的现场：只要还有一条对的，
      旧口径就放行 ⇒ 这一档在旧口径下是**绿的**。 */
{
  const s = makeSandbox();
  injectPaperMarkedLinkDrift(s);
  expectRed("M4a 论文页两条标记链接里有一条漂了 ⇒ M4", s, ["M4"], {
    mustContain: "带 data-code-repo 标记的链接指向",
    note: "存在性判据抓不到这一档（旧口径下它是绿的）",
  });
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= 注入档 M5a ================= */

/* M5a：复用条款退化成一句非 URL 的字符串。 */
{
  const s = makeSandbox();
  injectReuseTermNotUrl(s);
  expectRed("M5a 复用条款不是可解析的绝对 URL ⇒ M5", s, ["M5"], {
    mustContain: "不是可解析的绝对 URL",
  });
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= 注入档 M6a ================= */

/* M6a：真正指向门禁的那条从 build 链上被摘掉，
   但 build 串里**仍然**留着名字含 "check:artifact" 的另一条。
   ⚠️ 旧口径（子串匹配）在这里会判绿 —— 子串还在，但它指的不是门禁。
      下面那行断言就是把"子串确实还在"这件事当场钉住。 */
{
  const s = makeSandbox();
  unwireGate(s);
  const buildStr = JSON.parse(fs.readFileSync(pkgOf(s), "utf8")).scripts.build;
  const stillThere = buildStr.includes("check:artifact");
  expectRed("M6a 真正指向门禁的那条从 build 链上被摘掉 ⇒ M6", s, ["M6"], {
    mustContain: "门禁自己被卸掉了",
    note: stillThere
      ? "build 串里 'check:artifact' 子串仍在（旧口径会被骗过），但它指的不是门禁 ⇒ 新口径照样判红"
      : "⚠️ 夹具形状不对：build 串里已经不含 'check:artifact' 子串 ⇒ 这一档证明不了子串匹配那个洞",
  });
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= 注入档 M7a ================= */

/* M7a：有一个 JSON-LD 块解析失败 ⇒ 红因**恰为** {M7}（M1–M5 整段跳过）。 */
{
  const s = makeSandbox();
  injectBrokenJsonBlock(s);
  expectRed("M7a 有一个 JSON-LD 块解析失败 ⇒ M7（红因恰为 {M7}）", s, ["M7"], {
    mustContain: "有一个 JSON-LD 块解析失败",
    note: "前提不在场 ⇒ 依赖判据整段跳过，不拿不可信的结论凑数",
  });
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= 注入档 M8a ================= */

/* M8a：M1 那一整段判据被摘掉 ⇒ M8 必须抓到「这些比较点一次都没跑过」。 */
{
  const s = makeSandbox();
  neutralizeM1Block(s);
  expectRed("M8a M1 整段判据被摘掉 ⇒ M8", s, ["M8"], {
    mustContain: "一次都没跑过",
    note: "旧口径只看「一共比过几处」⇒ 这一档在旧口径下是绿的",
  });
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= 判据级负对照 N-M1 / N-M4 / N-M6 / N-M7 / N-M8 ================= */

/* N-M1：卸掉 M1 ⇒ M1a 的注入必须转绿 */
{
  const s = makeSandbox();
  patchGate(s, "const M1_ON = true;", "const M1_ON = false;", 1);
  injectDatasetIdDrift(s);
  expectGreen(
    "N-M1 负对照：卸掉 M1 判定后，M1a 的注入转绿",
    s,
    "证明 M1a 那档的红确实来自 M1 判定本身"
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* N-M2：卸掉 M2 ⇒ M2a 的注入必须转绿 */
{
  const s = makeSandbox();
  patchGate(s, "const M2_ON = true;", "const M2_ON = false;", 1);
  injectCapsuleRepoDrift(s);
  expectGreen(
    "N-M2 负对照：卸掉 M2 判定后，M2a 的注入转绿",
    s,
    "证明 M2a 那档的红确实来自 M2 判定本身"
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* N-M3：卸掉 M3 ⇒ M3a 的注入必须转绿 */
{
  const s = makeSandbox();
  patchGate(s, "const M3_ON = true;", "const M3_ON = false;", 1);
  injectRepoEntityDrift(s);
  expectGreen(
    "N-M3 负对照：卸掉 M3 判定后，M3a 的注入转绿",
    s,
    "证明 M3a 那档的红确实来自 M3 判定本身"
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* N-M4：卸掉 M4 ⇒ M4a 的注入必须转绿 */
{
  const s = makeSandbox();
  patchGate(s, "const M4_ON = true;", "const M4_ON = false;", 1);
  injectPaperMarkedLinkDrift(s);
  expectGreen(
    "N-M4 负对照：卸掉 M4 判定后，M4a 的注入转绿",
    s,
    "证明 M4a 那档的红确实来自 M4 判定本身"
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* N-M5：卸掉 M5 ⇒ M5a 的注入必须转绿 */
{
  const s = makeSandbox();
  patchGate(s, "const M5_ON = true;", "const M5_ON = false;", 1);
  injectReuseTermNotUrl(s);
  expectGreen(
    "N-M5 负对照：卸掉 M5 判定后，M5a 的注入转绿",
    s,
    "证明 M5a 那档的红确实来自 M5 判定本身"
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* N-M6：卸掉 M6 ⇒ M6a 的注入必须转绿 */
{
  const s = makeSandbox();
  patchGate(s, "const M6_ON = true;", "const M6_ON = false;", 1);
  unwireGate(s);
  expectGreen(
    "N-M6 负对照：卸掉 M6 判定后，M6a 的注入转绿",
    s,
    "证明 M6a 那档的红确实来自 M6 判定本身"
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* N-M7：卸掉 M7 ⇒ M7a 的注入必须转绿 */
{
  const s = makeSandbox();
  patchGate(s, "const M7_ON = true;", "const M7_ON = false;", 1);
  injectBrokenJsonBlock(s);
  expectGreen(
    "N-M7 负对照：卸掉 M7 判定后，M7a 的注入转绿",
    s,
    "证明 M7a 那档的红确实来自 M7 判定本身"
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* N-M8：卸掉 M8 ⇒ M8a 的注入必须转绿 */
{
  const s = makeSandbox();
  patchGate(s, "const M8_ON = true;", "const M8_ON = false;", 1);
  neutralizeM1Block(s);
  expectGreen(
    "N-M8 负对照：卸掉 M8 判定后，M8a 的注入转绿",
    s,
    "证明 M8a 那档的红确实来自 M8 判定本身"
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= 精准性负对照 P-M1 / P-M7 ================= */

/* 卸掉 M1 + M1a 注入 + M2a 注入 ⇒ 必须**恰好**红 {M2}。
   这档证明两件事：① M1 与 M2 的判定互不越界；
   ② M1 被卸掉之后，M2 仍然是唯一说话的那一条（卸判据是精准的，不是把门禁整个关掉）。 */
{
  const s = makeSandbox();
  patchGate(s, "const M1_ON = true;", "const M1_ON = false;", 1);
  injectDatasetIdDrift(s);
  injectCapsuleRepoDrift(s);
  expectRed("P-M1 精准性负对照：卸 M1 + M1a 注入 + M2a 注入 ⇒ 恰好红 M2", s, ["M2"], {
    mustContain: "codeRepository 不一致",
    note: "M1 被卸掉后不应再有第二条判据替它说话",
  });
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* 前提不在场（M7a）+ 论文页链接漂（M4a）⇒ 必须**恰好**红 {M7}。
   论文页读不出来时，M4 的论文页那半边整段跳过（它没有可判的对象），
   不拿一个读不到的页面去说「链接漂了」。 */
{
  const s = makeSandbox();
  injectBrokenJsonBlock(s);
  injectPaperMarkedLinkDrift(s);
  expectRed(
    "P-M7 精准性负对照：前提不在场 + 论文页链接漂 ⇒ 恰好红 M7",
    s,
    ["M7"],
    {
      mustContain: "有一个 JSON-LD 块解析失败",
      note: "论文页读不出来 ⇒ M4 那半边整段跳过，不乱说话",
    }
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= COV-A / COV-B：覆盖度自证 ================= */

/* COV-A：比较点的**静态目录**必须是真的 ——
   ① 每个目录项在源码里都有落点（不是只在目录里挂着）；
   ② 门禁自报的「N/N 个比较点都跑过」里的 N 与独立数出的目录长度相等；
   ③ 门禁自报的「共比对 N 处」在合理区间内（≥1 且 ≤目录长度）。
   ⚠️ 目录必须静态：动态登记的话，把一整块判据删掉时它连同自己的比较点一起消失
      ⇒ M8 反而判绿 ⇒ M8 就守不住它要守的东西。 */
{
  const s = makeSandbox();
  const src = fs.readFileSync(GATE, "utf8");
  const catalog = [...src.matchAll(/^\s*"(M\d+\.[A-Za-z.]+)",$/gm)].map((m) => m[1]);
  const unique = [...new Set(catalog)].sort();

  /* 每个目录项在源码里至少出现两次：一次在目录里，一次在落点上。 */
  const noUseSite = unique.filter((k) => {
    const n = (src.match(new RegExp(`"${k.replace(/\./g, "\\.")}"`, "g")) || []).length;
    return n < 2;
  });

  const r = runGate(s);
  const m = /共比对 (\d+) 处；逐比较点覆盖度自证：(\d+)\/(\d+) 个比较点都跑过/.exec(r.out);
  const compared = m ? Number(m[1]) : -1;
  const ran = m ? Number(m[2]) : -1;
  const total = m ? Number(m[3]) : -1;

  const ok =
    r.code === 0 &&
    unique.length >= 1 &&
    noUseSite.length === 0 &&
    total === unique.length &&
    ran === unique.length &&
    compared >= 1 &&
    compared <= unique.length;

  record(
    "COV-A 覆盖度自证：比较点静态目录每个点都有落点，自报数量与独立数出的一致",
    ok,
    ok
      ? `目录 ${unique.length} 个比较点、每个都有落点；门禁自报 ${ran}/${total} 都跑过、` +
        `共比对 ${compared} 处（不是编的数字）`
      : `目录 ${unique.length} 个（无落点的：${noUseSite.join("、") || "无"}）；` +
        `自报 ${ran}/${total}、共比对 ${compared}；code=${r.code}\n${r.out}`
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* COV-B：门禁源码里 M1–M8 每条判据都要有红因出口与可卸开关，
   而且那个开关标识符在源码里至少出现两次（声明一次、别处再引用一次）。
   ⚠️ 这一档只管**结构**：它抓不住「开关表还在、但 fail() 不再看它」那种形态
      （那个形态下开关标识符照样出现两次）。
      那种形态由**行为**抓：N-M1–N-M8 这 8 档负对照逐条卸掉开关，
      对应的注入必须转绿 —— 开关若没被消费，红还在，负对照就不成立。
      两层加起来才完整：结构层保证"每条判据都有开关"，行为层保证"开关真的管用"。 */
{
  const s = makeSandbox();
  const src = fs.readFileSync(GATE, "utf8");
  const want = ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8"];
  const exits = want.filter((id) => !new RegExp(`fail\\(\\s*"${id}"`).test(src));
  const switches = want.filter(
    (id) => !new RegExp(`const ${id}_ON = true;`).test(src)
  );
  const notReferenced = want.filter(
    (id) => (src.match(new RegExp(`\\b${id}_ON\\b`, "g")) || []).length < 2
  );
  const ok = exits.length === 0 && switches.length === 0 && notReferenced.length === 0;
  record(
    "COV-B 覆盖度自证：门禁里 M1–M8 每条都有红因出口与可卸开关（结构层）",
    ok,
    ok
      ? `红因出口 ${want.join("/")} 齐全；可卸开关 ${want.join("/")} 齐全且每个都被别处引用一次` +
        `（开关真被消费由 N-M1–N-M8 八档负对照在行为层证明）`
      : `缺红因出口：${exits.join("、") || "无"}；缺开关：${switches.join("、") || "无"}；` +
        `声明了却没人引用：${notReferenced.join("、") || "无"}`
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= 收尾：仓库原件没被动过 ================= */

const problems = [];
if (sha256(GATE) !== GATE_SHA_AT_START) {
  problems.push("仓库里的门禁原件在自测期间被改动了 —— 自测必须只在副本上注入。");
}

if (problems.length) {
  console.error("\n产出物元数据门禁自测未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

const bad = results.filter((r) => !r.ok);
console.log(
  `\n注入矩阵：${results.length} 档里 ${results.length - bad.length} 档按预期触发` +
    `${bad.length ? `，${bad.length} 档未通过` : ""}` +
    `（N-M1–N-M8、P-M1、P-M7 是判据级负对照）。`
);
if (bad.length) bad.forEach((b) => console.log(`  · 未通过：${b.id}`));
console.log("  · 原件校验：门禁的 SHA-256 与自测开始时一致。");
process.exit(bad.length ? 1 : 0);
