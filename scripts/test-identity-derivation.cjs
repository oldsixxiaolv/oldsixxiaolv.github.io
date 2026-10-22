#!/usr/bin/env node
/**
 * 自测 ID0–ID7：给 scripts/check-identity-derivation.cjs 的每条判据找一次「它会红」的证据
 *
 * 为什么要有这个自测（2026-10-22 的 D59 第十批）：
 *   这道门禁守的是「身份清单只有一份、页面上那一份必须是**派生**出来的」。
 *   而「门禁是绿的」有两种可能：① 它真的没问题；② 它的判据从来没被真正执行过。
 *   这两件事长得一模一样。所以每条判据都要有一档**注入**证明它会红，
 *   再有一档**负对照**证明「卸掉那一步之后确实就绿了」——否则红可能来自别处。
 *
 * ⚠️ 本批同时堵上了这道门禁**自己身上的三个真洞**（都是实跑出来的，不是推演的）：
 *   ① **判据编号只活在注释里**：旧的 fail() 只收一句文案，23 处调用没有一处带编号
 *      ⇒ 红因里没有判据坐标（人读不出是哪条判据），而且自测**根本无法按编号断言
 *      「红因归属」**——判据级负对照在旧门禁上写都写不出来。
 *      现在每条判据都有编号，编号就写在红因里（`✗ 门禁 IDx：…`）。
 *   ② **"判据自证"是恒等式**：旧的 siteChecked / templateChecked / configChecked
 *      三个变量都是直接赋值 `ORACLE_SAMEAS.length`，所以 `!== EXPECTED_COUNT`
 *      **永远为假** ⇒ 那三条自证**永远不会红**——而它们就写在"一条都没查 =
 *      判据本身没生效"的注释下面。一条永远不会红的自证，给出了看起来很确定的绿。
 *      现在改成 ID7：逐**比较点**覆盖度自证（静态目录，21 个点）。
 *   ③ **没有可卸开关**：旧门禁没有任何开关 ⇒ "卸掉某条判据"这件事无法表达 ⇒
 *      判据级负对照无从谈起。现在有 SWITCH_ON 表，而且它**真的被 fail() 消费**
 *      （声明了却没人看的开关等于没有开关——那样负对照会永远不成立）。
 *
 * 夹具怎么造（为什么不照抄真仓库）：
 *   夹具是一个**临时目录**（不是 git 仓 —— 这道门禁不依赖 git 索引）：
 *     <tmp>/repo/scripts/check-identity-derivation.cjs  门禁副本
 *     <tmp>/repo/scripts/lib/identity.cjs                共享清单（真源）
 *     <tmp>/repo/src/_data/site.js                       数据源层（派生，不写死）
 *     <tmp>/repo/src/_data/extra.json                    数据源层第二个文件
 *     <tmp>/repo/src/_includes/layouts/base.njk          模板层
 *     <tmp>/repo/src/_includes/layouts/paper.njk         模板层
 *     <tmp>/repo/src/content/blog/blog.11tydata.cjs      目录数据层
 *     <tmp>/repo/src/content/papers/papers.11tydata.cjs  目录数据层
 *     <tmp>/repo/src/eleventy-helpers.cjs                构建辅助层
 *     <tmp>/repo/eleventy.config.js                      构建配置层
 *   门禁的 ROOT 根是「它自己所在目录的上一级」，所以副本里的它**天然**
 *   指向副本里的仓，不需要任何环境变量。
 *   ⚠️ 五个载体家族**每个都非空**（这正是 ID6a 要守的），且
 *      「清单里除了已扫过的文件之外还剩几个载体」> 0（ID6d 要守的）。
 *
 * ⚠️ 身份 URL **不在本文件里写死** —— 它从门禁源码的 ORACLE_SAMEAS 里解析出来。
 *   理由跟门禁本身一样：本仓库只能有**一份**身份清单；自测里再抄一份就是
 *   第二份清单（而且自测文件是已跟踪代码文件，会被别的门禁扫到）。
 *
 * ⚠️ 本文件源码里**不得出现**字面量的本地 require 语法 ——
 *   门禁 TR1 会扫到**已跟踪的代码文件**（包括本文件），
 *   一旦这里写着一个真的本地 require，提交后门禁会对着自己判红。
 *   夹具里 site.js 的 require 路径是**拼出来的**（拼完才写进夹具）。
 *
 * 档位（4 档绿 + 12 档注入 + 11 档判据级负对照 + 2 档精准性负对照
 *      + 2 档覆盖度自证 + 3 档退回旧口径 = 34 档）：
 *   G0    基线绿
 *   G1    身份 URL 写在**注释**里（JS 行注释 + HTML 注释）   ⇒ 绿（注释豁免）
 *   G2    数据源层里有一个 .md 文件                        ⇒ 绿（豁免扩展名生效）
 *   G3    site.js 里写了**代码仓深链**（句柄 + /子路径）      ⇒ 绿（只查完整字面量）
 *   ID0a  遮罩层自证的期望被改坏                          ⇒ ID0
 *   ID1a  site.js 里写死一条身份 URL                        ⇒ ID1
 *   ID2a  site.js 不 require 共享真源                       ⇒ ID2
 *   ID3a  共享清单不存在                                    ⇒ ID3
 *   ID4a  模板里写死一条身份 URL                            ⇒ ID4
 *   ID5a  构建配置里写死一条身份 URL                        ⇒ ID5
 *   ID6a  目录数据层整个家族空了                            ⇒ ID6a
 *   ID6b  新增一个**没被任何家族认领**的候选载体             ⇒ ID6b
 *   ID6c  清单漏掉了正在被扫描的一个文件                    ⇒ ID6c
 *   ID6c' 清单漏掉一个 .njk（真实的不一致形态）              ⇒ {ID6b, ID6c}（耦合，见下）
 *   ID6d  清单里的某个载体**不在检查面内**（.txt）           ⇒ ID6d
 *   ID7a  ID5 那一整段判据被摘掉                            ⇒ ID7
 *   N-ID0 … N-ID7 负对照（逐条，11 档）：卸掉某条判据 ⇒ 对应注入必须**转绿**
 *   P-ID1 精准性负对照：卸 ID1 + ID1a 注入 + ID2a 注入 ⇒ 必须**恰好**红 {ID2}
 *   P-ID7 精准性负对照：前提不在场（eleventy.config.js 没了）+ 模板写死 URL ⇒ 恰好红 {ID4, ID5}
 *   COV-A 覆盖度自证：比较点静态目录每个点都有落点，自报数量与独立数出的一致
 *   COV-B 覆盖度自证：门禁里 ID0–ID7 每条都有红因出口与可卸开关（结构层；
 *                     开关真被消费由 N-ID0–N-ID7 十一档负对照在行为层证明）
 *   RE-1  退回旧口径（没有覆盖度自证）⇒ ID7a 那一档**塌陷成绿**
 *   RE-2  退回旧口径（红因不带编号）  ⇒ 红因编号**解析不到**（按编号判归属无从谈起）
 *   RE-3  退回旧口径（开关不被消费）  ⇒ 卸开关后红**还在**（负对照不成立）
 *
 * ⚠️ ID6c' 这一档记录了一个**结构耦合**：ID6c（清单与扫描面不一致）与
 *   ID6b（候选载体必须被认领）在真实的不一致形态下**必然同时红** ——
 *   清单漏掉一个正在被扫描的文件时，那个文件同时变成了"没被认领的候选"。
 *   所以 ID6c 单独红的那一档用"清单里多出一个不在扫描面的文件"来构造。
 *
 * ⚠️ 每档都断言「红因编号多重集**完全相等**」，不只是「包含期望的那条」——
 *   一档里出现两条判据的红，红因归属就不可判定了（那是脚本的缺陷，不是产品的缺陷）。
 *   N-ID0–N-ID7 / P-ID1 / P-ID7 这十三档负对照正是「归属纯净」的守门人。
 *
 * ⚠️ 注入到**门禁副本 / 夹具文件**上的每一处改动，都额外断言：
 *   同行替换类 ⇒ 「改动行数 = 声明值」；整段摘除类 ⇒ 「块内含指定标记 +
 *   总行数不变（行号不位移）+ 摘完仍是合法脚本」；增删文件类 ⇒ 「文件存在性」。
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
const GATE = path.join(ROOT, "scripts", "check-identity-derivation.cjs");

function sha256(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

/* 原件指纹：**自测开始时**记下来，收尾时比对 ——
   证明这一整轮注入全在副本上，仓库里的原件一个字节都没动。 */
const GATE_SHA_AT_START = sha256(GATE);

/* ---------- 身份 URL：从门禁源码里解析，不在本文件写死 ----------
   跟门禁一样的理由：仓库里只能有一份身份清单。
   门禁的 ORACLE_SAMEAS 是双引号数组，取区间里的双引号字符串即可。 */
function readOracleUrls(gateSrc) {
  const m = /const ORACLE_SAMEAS = \[([\s\S]*?)\];/.exec(gateSrc);
  if (!m) throw new Error("解析不到门禁的 ORACLE_SAMEAS 声明 —— 自测中止。");
  const urls = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  if (urls.length < 2) throw new Error(`ORACLE_SAMEAS 只解析出 ${urls.length} 条 —— 自测中止。`);
  return urls;
}
const ORACLE = readOracleUrls(fs.readFileSync(GATE, "utf8"));
/* 常用取用：一条完整身份 URL（写死用）、一条代码仓深链（不该命中用）。 */
const URL_FULL = ORACLE[0];
const URL_HANDLE = ORACLE[1];
const URL_DEEPLINK = `${URL_HANDLE}/demo-repo`;

/* ---------- 夹具里的固定事实 ---------- */
/* 夹具里 site.js 的 require 路径 —— **拼出来的**：
   自测源码里不能出现 `require("…相对路径…")` 的完整形态（TR1/TR2 会对着自己判红）。 */
const SHARED_REL = "../../" + "scripts/lib/identity.cjs";

const SITE_SRC = [
  "// 身份清单的单一真源是 scripts/lib/identity.cjs —— 这里只派生，不写死。",
  `const { IDENTITY_SAMEAS } = require("${SHARED_REL}");`,
  "",
  "module.exports = {",
  '  url: "https://example.test",',
  "  author: {",
  '    name: "Demo Author",',
  "    sameAs: IDENTITY_SAMEAS,",
  "  },",
  "};",
  "",
].join("\n");

const SHARED_SRC = ["const IDENTITY_SAMEAS = [];", "module.exports = { IDENTITY_SAMEAS };", ""].join("\n");

const TPL_SRC = [
  "<footer>",
  '  <a href="{{ site.url }}/">Home</a>',
  "</footer>",
  "",
].join("\n");

const DIRDATA_SRC = [
  "module.exports = {",
  "  eleventyComputed: {",
  '    permalink: "/demo/",',
  "  },",
  "};",
  "",
].join("\n");

const HELPER_SRC = ['module.exports = { demoHelper: () => "demo" };', ""].join("\n");

const CONFIG_SRC = ["module.exports = function () {", "  return {};", "};", ""].join("\n");

const EXTRA_JSON = '{\n  "demo": true\n}\n';

/* ================= 夹具 ================= */

function write(p, text) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
}

function makeSandbox() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "mh-identity-deriv-"));
  const repo = path.join(base, "repo");
  fs.mkdirSync(path.join(repo, "scripts", "lib"), { recursive: true });
  fs.copyFileSync(GATE, path.join(repo, "scripts", "check-identity-derivation.cjs"));
  write(path.join(repo, "scripts", "lib", "identity.cjs"), SHARED_SRC);
  write(path.join(repo, "src", "_data", "site.js"), SITE_SRC);
  write(path.join(repo, "src", "_data", "extra.json"), EXTRA_JSON);
  write(path.join(repo, "src", "_includes", "layouts", "base.njk"), TPL_SRC);
  write(path.join(repo, "src", "_includes", "layouts", "paper.njk"), TPL_SRC);
  write(path.join(repo, "src", "content", "blog", "blog.11tydata.cjs"), DIRDATA_SRC);
  write(path.join(repo, "src", "content", "papers", "papers.11tydata.cjs"), DIRDATA_SRC);
  write(path.join(repo, "src", "eleventy-helpers.cjs"), HELPER_SRC);
  write(path.join(repo, "eleventy.config.js"), CONFIG_SRC);
  return { base, repo };
}

const siteOf = (s) => path.join(s.repo, "src", "_data", "site.js");
const sharedOf = (s) => path.join(s.repo, "scripts", "lib", "identity.cjs");
const baseTplOf = (s) => path.join(s.repo, "src", "_includes", "layouts", "base.njk");
const configOf = (s) => path.join(s.repo, "eleventy.config.js");
const gateOf = (s) => path.join(s.repo, "scripts", "check-identity-derivation.cjs");
const extraJsOf = (s) => path.join(s.repo, "src", "_includes", "extra.js");
const notesTxtOf = (s) => path.join(s.repo, "src", "_data", "notes.txt");
const notesMdOf = (s) => path.join(s.repo, "src", "_data", "notes.md");
const blogDataOf = (s) => path.join(s.repo, "src", "content", "blog", "blog.11tydata.cjs");
const papersDataOf = (s) => path.join(s.repo, "src", "content", "papers", "papers.11tydata.cjs");

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

/** 红因编号**多重集**（只认行首的「✗ 门禁 IDx：」，消息正文里出现的字样不算）。 */
function redIds(out) {
  const list = [];
  const re = /^[ \t]*✗[ \t]*门禁[ \t]+(ID[0-9][a-z]?)/gm;
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
 * 用途：证明 ID7 能抓到「整段判据静默失效」。
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
      ? "  // ↑ 这一段判据被摘掉了（自测注入）：用来证明 ID7 能抓到「整段静默失效」。"
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

/** 新增一个夹具文件（断言原来不存在）。 */
function addFile(s, file, text) {
  if (fs.existsSync(file)) throw new Error(`文件已经存在，注入点无效：${file}`);
  write(file, text);
}

/** 删掉一个夹具文件（断言原来存在）。 */
function removeFile(s, file) {
  if (!fs.existsSync(file)) throw new Error(`文件本来就不存在，注入点无效：${file}`);
  fs.unlinkSync(file);
}

/* ================= 注入档各自的动作 ================= */

/** ID0a：把遮罩层自证的一条期望改坏 ⇒ 遮罩自证失败。 */
function injectMaskSelfCheckBroken(s) {
  patchGate(s, 'mustKeep: "https://example.com/path",', 'mustKeep: "https://example.com/path-2",', 1);
}

/** ID1a：site.js 里写死一条身份 URL。 */
function injectSiteLiteral(s) {
  patchFile(siteOf(s), '  url: "https://example.test",', `  leak: "${URL_FULL}",`, 1);
}

/** ID2a：site.js 不 require 共享真源。 */
function injectNoSharedRequire(s) {
  patchFile(
    siteOf(s),
    `const { IDENTITY_SAMEAS } = require("${SHARED_REL}");`,
    "const { IDENTITY_SAMEAS } = {};",
    1
  );
}

/** ID3a：共享清单不存在。 */
function injectSharedMissing(s) {
  removeFile(s, sharedOf(s));
}

/** ID4a：模板里写死一条身份 URL。 */
function injectTemplateLiteral(s) {
  patchFile(baseTplOf(s), '  <a href="{{ site.url }}/">Home</a>', `  <a href="${URL_FULL}">Home</a>`, 1);
}

/** ID5a：构建配置里写死一条身份 URL。 */
function injectConfigLiteral(s) {
  patchFile(configOf(s), "module.exports = function () {", `const leak = "${URL_FULL}"; module.exports = function () {`, 1);
}

/** ID6a：目录数据层整个家族空了。 */
function injectFamilyEmptied(s) {
  removeFile(s, blogDataOf(s));
  removeFile(s, papersDataOf(s));
}

/** ID6b：新增一个没被任何家族认领的候选载体。 */
function injectUnclaimedCarrier(s) {
  addFile(s, extraJsOf(s), 'module.exports = { demo: true };\n');
}

/** ID6c：清单漏掉了正在被扫描的一个文件（.njk 不在 src 顶层 ⇒ 也不在候选认领面里）。 */
function injectScanSurfaceMismatch(s) {
  patchGate(
    s,
    "alreadyScanned.add(ELEVENTY_CONFIG);",
    'alreadyScanned.add(ELEVENTY_CONFIG); alreadyScanned.add(path.join(ROOT, "src", "ghost.njk"));',
    1
  );
}

/** ID6c'：清单漏掉一个正在被扫描的 .njk（真实的不一致形态 ⇒ ID6b 与 ID6c 必然同时红）。
 *  ⚠️ 必须**同行替换**：改成两行会让后面所有行位移，`changedLines` 的位置口径会把
 *     几百行都算成"改动"⇒ 断言失效。 */
function injectCarrierListMissingTpl(s) {
  patchGate(
    s,
    "files: () => listFiles(SRC, true).filter((f) => TEMPLATE_EXTS.has(path.extname(f))),",
    'files: () => listFiles(SRC, true).filter((f) => TEMPLATE_EXTS.has(path.extname(f)) && !f.endsWith("paper.njk")),',
    1
  );
}

/** ID6d：清单里的某个载体不在检查面内（.txt：既不在候选扩展名、也没登记豁免）。 */
function injectCarrierNotChecked(s) {
  addFile(s, notesTxtOf(s), "demo note\n");
}

/** ID7a：把 ID5 那一整段判据摘掉（等行数注释替换 ⇒ 行号不位移）。
 *  ⚠️ 起锚点要含**整段**（段注释 + `try {`），止锚点要含 **catch 的收尾 `}`**：
 *     只从 `const configSource = …` 起摘 ⇒ 原地留下一个悬空的 `try {`
 *       ⇒ 副本变成 "Missing catch or finally after try"，
 *     只收到 `waivePrefix("ID5.");` 止 ⇒ 原地留下 catch 的 `}`，同样语法错。
 *     门禁直接语法错误 ⇒ 红因变成"语法错"而不是"判据失效"，归属全废。 */
function injectId5BlockRemoved(s) {
  neutralizeBlock(
    s,
    "/* ---------- ID5：构建配置层同样不许抄字面量（sameAs 的发射点） ---------- */",
    'waivePrefix("ID5.");\n}',
    'mark("ID5.read")'
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

/* ================= G0 / G1 / G2 / G3：绿档 ================= */

/* G0：基线 —— 身份链接全部派生，五个载体家族都非空。 */
{
  const s = makeSandbox();
  expectGreenBaseline(
    "G0 基线（临时目录上）",
    s,
    "身份链接全部派生自共享清单、五个载体家族都非空、21 个比较点都跑过"
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* G1：身份 URL 写在**注释**里 —— 判绿。
   证明注释豁免还在（那是**刻意开的口子**，见门禁文件头「待拍板 17」）。 */
{
  const s = makeSandbox();
  patchFile(
    siteOf(s),
    "// 身份清单的单一真源是 scripts/lib/identity.cjs —— 这里只派生，不写死。",
    `// 身份清单的单一真源是 scripts/lib/identity.cjs —— 例：${URL_FULL}`,
    1
  );
  patchFile(
    baseTplOf(s),
    '  <a href="{{ site.url }}/">Home</a>',
    `  <!-- 身份句柄示例：${URL_FULL} -->`,
    1
  );
  expectGreenBaseline("G1 身份 URL 写在注释里（JS 行注释 + HTML 注释）⇒ 绿（注释豁免）", s);
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* G2：数据源层里有一个 .md 文件 —— 判绿。
   .md 是**显式登记的豁免扩展名**（待拍板 10），登记了就不该红。 */
{
  const s = makeSandbox();
  addFile(s, notesMdOf(s), "# Demo\n");
  expectGreenBaseline("G2 数据源层里有一个 .md 文件 ⇒ 绿（豁免扩展名生效）", s);
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* G3：site.js 里写了**代码仓深链**（身份句柄 + /子路径）—— 判绿。
   本门禁只查**完整字面量**；深链是代码仓地址，不是身份句柄。 */
{
  const s = makeSandbox();
  patchFile(siteOf(s), "    sameAs: IDENTITY_SAMEAS,", `    repo: "${URL_DEEPLINK}",`, 1);
  expectGreenBaseline("G3 site.js 里写了代码仓深链 ⇒ 绿（只查完整字面量，不做 URL 形态匹配）", s);
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= 注入档 ID0a / ID1a / ID2a / ID3a / ID4a / ID5a ================= */

{
  const s = makeSandbox();
  injectMaskSelfCheckBroken(s);
  expectRed("ID0a 遮罩层自证的期望被改坏 ⇒ ID0", s, ["ID0"], {
    mustContain: "遮罩自证失败",
  });
  fs.rmSync(s.base, { recursive: true, force: true });
}

{
  const s = makeSandbox();
  injectSiteLiteral(s);
  expectRed("ID1a site.js 里写死一条身份 URL ⇒ ID1", s, ["ID1"], {
    mustContain: "写成了字面量",
  });
  fs.rmSync(s.base, { recursive: true, force: true });
}

{
  const s = makeSandbox();
  injectNoSharedRequire(s);
  expectRed("ID2a site.js 不 require 共享真源 ⇒ ID2", s, ["ID2"], {
    mustContain: "没有 require 共享身份清单",
  });
  fs.rmSync(s.base, { recursive: true, force: true });
}

{
  const s = makeSandbox();
  injectSharedMissing(s);
  expectRed("ID3a 共享清单不存在 ⇒ ID3", s, ["ID3"], {
    mustContain: "不存在",
  });
  fs.rmSync(s.base, { recursive: true, force: true });
}

{
  const s = makeSandbox();
  injectTemplateLiteral(s);
  expectRed("ID4a 模板里写死一条身份 URL ⇒ ID4", s, ["ID4"], {
    mustContain: "写成了字面量",
  });
  fs.rmSync(s.base, { recursive: true, force: true });
}

{
  const s = makeSandbox();
  injectConfigLiteral(s);
  expectRed("ID5a 构建配置里写死一条身份 URL ⇒ ID5", s, ["ID5"], {
    mustContain: "写成了字面量",
  });
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= 注入档 ID6a / ID6b / ID6c / ID6c' / ID6d / ID7a ================= */

{
  const s = makeSandbox();
  injectFamilyEmptied(s);
  expectRed("ID6a 目录数据层整个家族空了 ⇒ ID6a", s, ["ID6a"], {
    mustContain: "一个文件都没有",
  });
  fs.rmSync(s.base, { recursive: true, force: true });
}

{
  const s = makeSandbox();
  injectUnclaimedCarrier(s);
  expectRed("ID6b 新增一个没被任何家族认领的候选载体 ⇒ ID6b", s, ["ID6b"], {
    mustContain: "不在任何已登记的载体家族里",
  });
  fs.rmSync(s.base, { recursive: true, force: true });
}

{
  const s = makeSandbox();
  injectScanSurfaceMismatch(s);
  expectRed("ID6c 清单漏掉了正在被扫描的一个文件 ⇒ ID6c", s, ["ID6c"], {
    mustContain: "载体清单漏掉了正在被扫描的文件",
  });
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ID6c'：真实的不一致形态 ⇒ ID6b 与 ID6c **必然同时红**（结构耦合，如实记录）。 */
{
  const s = makeSandbox();
  injectCarrierListMissingTpl(s);
  expectRed(
    "ID6c' 清单漏掉一个正在被扫描的 .njk ⇒ {ID6b, ID6c}（两者结构耦合）",
    s,
    ["ID6b", "ID6c"],
    {
      mustContain: "载体清单漏掉了正在被扫描的文件",
      note: "清单漏掉一个正在被扫描的文件时，那个文件同时变成未认领候选 ⇒ 必然两条一起红",
    }
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

{
  const s = makeSandbox();
  injectCarrierNotChecked(s);
  expectRed("ID6d 清单里的某个载体不在检查面内（.txt）⇒ ID6d", s, ["ID6d"], {
    mustContain: "在载体清单里，却不受检查",
  });
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ID7a：ID5 整段判据被摘掉 ⇒ 旧口径抓不到（它只有恒等式自证），
   新口径由 ID7 的逐比较点覆盖度自证抓到。 */
{
  const s = makeSandbox();
  injectId5BlockRemoved(s);
  expectRed("ID7a ID5 那一整段判据被摘掉 ⇒ ID7", s, ["ID7"], {
    mustContain: "逐比较点覆盖度自证失败",
    note: "旧口径（恒等式自证）下这一档是绿的",
  });
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= 判据级负对照 N-ID0 … N-ID7 ================= */

/** 卸掉某条判据的开关（判据仍计算、只是不说话）。 */
function unloadJudge(s, id) {
  patchGate(s, `const ${id}_ON = true;`, `const ${id}_ON = false;`, 1);
}

const NEG_CASES = [
  ["ID0", "遮罩层自证的期望被改坏", injectMaskSelfCheckBroken],
  ["ID1", "site.js 里写死一条身份 URL", injectSiteLiteral],
  ["ID2", "site.js 不 require 共享真源", injectNoSharedRequire],
  ["ID3", "共享清单不存在", injectSharedMissing],
  ["ID4", "模板里写死一条身份 URL", injectTemplateLiteral],
  ["ID5", "构建配置里写死一条身份 URL", injectConfigLiteral],
  ["ID6a", "目录数据层整个家族空了", injectFamilyEmptied],
  ["ID6b", "新增一个没被任何家族认领的候选载体", injectUnclaimedCarrier],
  ["ID6c", "清单漏掉了正在被扫描的一个文件", injectScanSurfaceMismatch],
  ["ID6d", "清单里的某个载体不在检查面内（.txt）", injectCarrierNotChecked],
  ["ID7", "ID5 那一整段判据被摘掉", injectId5BlockRemoved],
];

for (const [id, what, inject] of NEG_CASES) {
  const s = makeSandbox();
  unloadJudge(s, id);
  inject(s);
  expectGreen(`N-${id} 负对照：卸掉 ${id} 判定后，「${what}」必须转绿`, s, `证明这一档的红确实来自 ${id} 判定本身`);
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= 精准性负对照 P-ID1 / P-ID7 ================= */

/* 卸掉 ID1 + ID1a 注入 + ID2a 注入 ⇒ 必须**恰好**红 {ID2}。
   这档证明两件事：① ID1 与 ID2 的判定互不越界；
   ② ID1 被卸掉之后，ID2 仍然是唯一说话的那一条（卸判据是精准的，不是把门禁整个关掉）。 */
{
  const s = makeSandbox();
  unloadJudge(s, "ID1");
  injectSiteLiteral(s);
  injectNoSharedRequire(s);
  expectRed("P-ID1 精准性负对照：卸 ID1 + ID1a 注入 + ID2a 注入 ⇒ 恰好红 ID2", s, ["ID2"], {
    mustContain: "没有 require 共享身份清单",
    note: "ID1 被卸掉后不应再有第二条判据替它说话",
  });
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* 前提不在场（eleventy.config.js 没了）+ 模板写死 URL ⇒ 必须**恰好**红 {ID4, ID5}。
   eleventy.config.js 读不出来时，ID5 判红（没有判断对象），ID5. 的比较点一并豁免
   ⇒ ID7 不该拿一个读不到的文件说事。
   ⚠️ 这里**故意选 eleventy.config.js 而不是 site.js**：
      删掉 site.js 会连带触发 ID6c（`alreadyScanned` 只在真的读到 site.js 时才含它，
      而载体清单里已经没有它了）⇒ 红因变成 {ID1, ID4, ID6c}，归属不纯净；
      而构建配置层家族**无条件**返回 [ELEVENTY_CONFIG]，删文件不触发 ID6c
      ⇒ 红因恰好 {ID4, ID5}。 */
{
  const s = makeSandbox();
  removeFile(s, configOf(s));
  injectTemplateLiteral(s);
  expectRed(
    "P-ID7 精准性负对照：前提不在场 + 模板写死 URL ⇒ 恰好红 {ID4, ID5}",
    s,
    ["ID4", "ID5"],
    {
      mustContain: "读不到 eleventy.config.js",
      note: "前提不在场 ⇒ 相关比较点豁免，不乱说话；且不连带触发 ID6c",
    }
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= COV-A / COV-B：覆盖度自证 ================= */

/* COV-A：比较点的**静态目录**必须是真的 ——
   ① 独立数出的目录项与门禁自报的总点数一致；
   ② 每个目录项在源码里都**有落点**（不是只在目录里挂着）；
   ③ 门禁自报的「N/M 个比较点都跑过」里的 N 与 M 都等于目录长度。
   ⚠️ 目录必须静态：动态登记的话，把一整块判据删掉时它连同自己的比较点一起消失
      ⇒ ID7 反而判绿 ⇒ ID7 就守不住它要守的东西。 */
{
  const s = makeSandbox();
  const src = fs.readFileSync(GATE, "utf8");
  /* min 的取值有两种写法：字面量数字（min: 1）与常量名（min: EXPECTED_COUNT）——
     两种都要认，否则数出来的目录项会偏少，"自报数量 == 独立数出的数量"就成了一句空话。
     行尾**不能**锚 `$`：目录项行尾都带 `// 注释`。 */
  const catalog = [
    ...src.matchAll(/^\s*\{\s*key:\s*"([^"]+)",\s*min:\s*(?:[A-Za-z_][A-Za-z0-9_]*|\d+)\s*\},?/gm),
  ].map((m) => m[1]);
  const unique = [...new Set(catalog)].sort();
  /* 目录里不能有重复键：重复键会让"目录长度 == 独立数出的长度"这类断言失真，
     也说明这份目录本身不是一份干净的账本（同一个比较点记两次 ⇒ 少一个点也看不出来）。 */
  const dupKeys = [...new Set(catalog.filter((k, i) => catalog.indexOf(k) !== i))];

  /* 每个目录项在源码里至少出现两次：一次在目录里，一次在落点上。 */
  const noUseSite = unique.filter((k) => {
    const n = (src.match(new RegExp(`"${k.replace(/\./g, "\\.")}"`, "g")) || []).length;
    return n < 2;
  });

  const r = runGate(s);
  const m = /逐比较点覆盖度自证：(\d+)\/(\d+) 个比较点都跑过/.exec(r.out);
  const ran = m ? Number(m[1]) : -1;
  const total = m ? Number(m[2]) : -1;

  const ok =
    r.code === 0 &&
    unique.length >= 1 &&
    dupKeys.length === 0 &&
    noUseSite.length === 0 &&
    total === unique.length &&
    ran === unique.length;

  record(
    "COV-A 覆盖度自证：比较点静态目录每个点都有落点，自报数量与独立数出的一致",
    ok,
    ok
      ? `目录 ${unique.length} 个比较点（无重复键）、每个都有落点；门禁自报 ${ran}/${total} 都跑过（不是编的数字）`
      : `目录 ${unique.length} 个（重复键：${dupKeys.join("、") || "无"}；无落点的：${noUseSite.join("、") || "无"}）；` +
        `自报 ${ran}/${total}；code=${r.code}\n${r.out}`
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* COV-B：门禁源码里 ID0–ID7 每条判据都要有红因出口与可卸开关，
   而且那个开关标识符在源码里至少出现两次（声明一次、SWITCH_ON 里再引用一次）。
   ⚠️ 这一档只管**结构**：它抓不住「开关表还在、但 fail() 不再看它」那种形态
      （那个形态下开关标识符照样出现两次）。
      那种形态由**行为**抓：N-ID0–N-ID7 这十一档负对照逐条卸掉开关，
      对应的注入必须转绿 —— 开关若没被消费，红还在，负对照就不成立。
      两层加起来才完整：结构层保证"每条判据都有开关"，行为层保证"开关真的管用"。 */
{
  const s = makeSandbox();
  const src = fs.readFileSync(GATE, "utf8");
  const want = ["ID0", "ID1", "ID2", "ID3", "ID4", "ID5", "ID6a", "ID6b", "ID6c", "ID6d", "ID7"];
  const exits = want.filter((id) => !new RegExp(`fail\\(\\s*"${id}"`).test(src));
  const switches = want.filter((id) => !new RegExp(`const ${id}_ON = true;`).test(src));
  const notReferenced = want.filter(
    (id) => (src.match(new RegExp(`\\b${id}_ON\\b`, "g")) || []).length < 2
  );
  const ok = exits.length === 0 && switches.length === 0 && notReferenced.length === 0;
  record(
    "COV-B 覆盖度自证：门禁里 ID0–ID7 每条都有红因出口与可卸开关（结构层）",
    ok,
    ok
      ? `红因出口 ${want.join("/")} 齐全；可卸开关 ${want.join("/")} 齐全且每个都被别处引用一次`
      : `缺红因出口：${exits.join("、") || "无"}；缺可卸开关：${switches.join("、") || "无"}；` +
        `开关未被别处引用：${notReferenced.join("、") || "无"}`
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= RE-1 / RE-2 / RE-3：退回旧口径 ================= */

/* RE-1：退回旧口径（**没有覆盖度自证**）⇒ ID7a 那一档必须**塌陷成绿**。
   旧门禁那三条"自证存活"是恒等式（siteChecked = ORACLE_SAMEAS.length），
   永远不会红 ⇒ 整段判据被摘掉它也发现不了。 */
{
  const s = makeSandbox();
  patchGate(s, "if (missingPoints.length) {", "if (false && missingPoints.length) {", 1);
  injectId5BlockRemoved(s);
  const r = runGate(s);
  const got = redIds(r.out);
  const ok = r.code === 0 && got.length === 0;
  record(
    "RE-1 退回旧口径（没有覆盖度自证）⇒ ID7a 那一档塌陷成绿",
    ok,
    ok
      ? "退回旧口径后整段判据被摘掉也没人叫 —— 证明 ID7 这一档抓的是真东西"
      : `旧口径下居然还是红的（code=${r.code}，红因 ${fmtIds(got)}）⇒ 这一档证明不了什么\n${r.out}`
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* RE-2：退回旧口径（**红因不带编号**）⇒ 红因编号**解析不到**。
   旧门禁的 fail() 只收一句文案 ⇒ "按编号断言红因归属"这件事根本无从谈起。 */
{
  const s = makeSandbox();
  patchGate(s, "problems.push(`门禁 ${id}：${msg}`);", "problems.push(msg);", 1);
  injectSiteLiteral(s);
  const r = runGate(s);
  const got = redIds(r.out);
  const ok = r.code !== 0 && got.length === 0;
  record(
    "RE-2 退回旧口径（红因不带编号）⇒ 红因编号解析不到",
    ok,
    ok
      ? `门禁仍然红（code=${r.code}），但一个编号都解析不到 —— 证明"按编号判红因归属"是这一批新加的能力`
      : `红因编号解析到了 ${fmtIds(got)} ⇒ 退回改造没打上\n${r.out}`
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* RE-3：退回旧口径（**开关不被消费**）⇒ 卸掉开关后红**还在** ⇒ 负对照不成立。 */
{
  const s = makeSandbox();
  patchGate(s, "if (SWITCH_ON[id] === false) return;", "if (false) return;", 1);
  unloadJudge(s, "ID1");
  injectSiteLiteral(s);
  const r = runGate(s);
  const got = redIds(r.out);
  const ok = r.code !== 0 && got.includes("ID1");
  record(
    "RE-3 退回旧口径（开关不被 fail() 消费）⇒ 卸开关后红还在",
    ok,
    ok
      ? `卸掉 ID1 开关后红因里仍有 ${fmtIds(got)} ⇒ 证明 N-ID1 这一档靠的是"开关真被消费"`
      : `卸掉 ID1 开关后红因是 ${fmtIds(got)} ⇒ 退回改造没打上\n${r.out}`
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= 收尾 ================= */

const failed = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`  ${r.ok ? "✓" : "✗"} ${r.id}`);
  if (!r.ok) console.log(`      ${r.detail}`);
}
console.log(
  `\n身份派生门禁自测：${results.length - failed.length}/${results.length} 档符合预期` +
    `（注入矩阵：${results.length} 档里 ${results.length - failed.length} 档按预期触发）。`
);

/* 原件指纹校验：这一整轮注入全在副本上，仓库里的门禁原件必须一个字节都没动。 */
const gateShaNow = sha256(GATE);
if (gateShaNow !== GATE_SHA_AT_START) {
  console.error(
    `\n✗ 仓库里的门禁原件被改动了（SHA-256 不一致）—— 自测过程中不该动它，已中止。`
  );
  process.exit(1);
}
console.log("门禁原件未被动过（SHA-256 一致）。");

if (failed.length) {
  console.error(`\n有 ${failed.length} 档不符合预期。`);
  process.exit(1);
}
