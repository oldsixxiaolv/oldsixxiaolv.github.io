#!/usr/bin/env node
/**
 * 自测 IU0–IU10：给 scripts/check-img-publish.cjs 的每条判据找一次「它会红」的证据
 *
 * 为什么要有这个自测（2026-10-21 的 D50）：
 *   这道门禁守的是「产物里的图 = 被人引用的源图，一一对应」。
 *   而「门禁是绿的」有两种可能：① 它真的没问题；② 它的判据从来没被真正执行过。
 *   这两件事长得一模一样。所以每条判据都要有一档**注入**证明它会红，
 *   再有一档**负对照**证明「卸掉那一步之后确实就绿了」——
 *   否则红可能来自别处。
 *
 * 做法（全在临时目录的副本上，仓库里的原件一个字节都不动）：
 *   造一个**最小夹具站**（不依赖真 _site —— 真产物每次 build 都在变，
 *   拿它当基准会让自测跟着 build 抖）：
 *     <tmp>/scripts/check-img-publish.cjs  门禁副本（负对照要改它的 IPn_ON 开关）
 *     <tmp>/package.json                    build 链里必须有本门禁（IP5 看这个）
 *     <tmp>/src/assets/img/hero.png         被模板引用的图
 *     <tmp>/src/assets/img/portrait.png     被真源引用的图
 *     <tmp>/src/assets/img/og/design-master.svg  **设计母版**：源里有、没人引用、
 *                                            产物里没有 —— 这就是 D52 的正确形态
 *     <tmp>/src/_includes/layouts/base.njk  模板：引用 hero.png
 *     <tmp>/src/_data/site.js               真源：引用 portrait.png
 *     <tmp>/_site/assets/img/{hero,portrait}.png  产物：只含被引用的两张
 *   门禁的 REPO 根是「它自己所在目录的上一级」，所以副本里的它**天然**
 *   指向副本里的站，不需要任何环境变量。
 *
 * 档位（7 档注入 + 3 档判据级负对照 + 2 档基线/自证）：
 *   IU0  基线绿（并自证「设计母版留在源里、不进产物」是合法的）
 *   IU1  产物里多一张**没人引用的设计母版副本**                ⇒ IP1（D52 的形状）
 *   IU2  产物里少一张**被引用**的图                            ⇒ IP2
 *   IU3  产物里多一张源目录已无的图                            ⇒ IP3
 *   IU4  删掉模板里的引用点（源图还在、产物副本也还在）        ⇒ IP1
 *   IU5  引用检测器认不出任何一张图（清引用 + 清产物）          ⇒ IP4（覆盖度自证）
 *   IU6  门禁自己被卸掉（build 链里不叫它了）                   ⇒ IP5
 *   IU7  负对照：卸掉 IP1 ⇒ IU1 的注入必须**转绿**
 *   IU8  负对照：卸掉 IP2 ⇒ IU2 的注入必须**转绿**
 *   IU9  负对照：卸掉 IP3 ⇒ IU3 的注入必须**转绿**
 *   IU10 覆盖度自证档：基线上门禁**确实认出**了 ≥1 张被引用的图
 *
 * ⚠️ 每档都断言「红因编号集合**完全相等**」，不只是「包含期望的那条」——
 *   一档里出现两条判据的红，红因归属就不可判定了（那是脚本的缺陷，不是产品的缺陷）。
 *   IU7–IU9 这三档负对照正是「归属纯净」的守门人：
 *   卸掉 IP3 之后 IU3 若还红，说明 IP1 越界管了孤儿 ⇒ 立刻暴露。
 *
 * ⚠️ IU5 为什么必须**同时**清掉产物：引用检测器全瞎时，产物里的每张图都会
 *   被当成「没人引用的副本」（IP1），覆盖度也归零（IP4）—— 两条判据同源，
 *   一档里必红两条。为了让这一档**只**检验 IP4，产物一并清空：
 *   产物空 ⇒ IP1 无从谈起（没有副本），IP4 两支同时成立 ⇒ 红因恰好 {IP4}。
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
const GATE = path.join(ROOT, "scripts", "check-img-publish.cjs");

function sha256(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

/* 原件指纹：**自测开始时**记下来，收尾时比对 ——
   证明这一整轮注入全在副本上，仓库里的原件一个字节都没动。 */
const GATE_SHA_AT_START = sha256(GATE);

/* ================= 夹具站 ================= */

function write(p, text) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
}

/**
 * 造一个最小夹具站：三张源图（两张被引用、一张是设计母版），产物只含被引用的两张。
 * ⚠️ 夹具里**不出现任何真实站点的图片名**（否则门禁/自测源码自己就成了消费点，
 *   自证会假绿）—— 全部用 fixture-* 命名。
 */
function makeSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mh-img-publish-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });

  fs.copyFileSync(GATE, path.join(dir, "scripts", "check-img-publish.cjs"));

  write(
    path.join(dir, "package.json"),
    JSON.stringify(
      { name: "img-publish-fixture", scripts: { build: "node scripts/check-img-publish.cjs" } },
      null,
      2
    ) + "\n"
  );

  /* 三张源图 */
  write(path.join(dir, "src", "assets", "img", "fixture-hero.png"), "PNG-fixture-hero\n");
  write(path.join(dir, "src", "assets", "img", "fixture-portrait.png"), "PNG-fixture-portrait\n");
  write(
    path.join(dir, "src", "assets", "img", "og", "fixture-design-master.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>\n'
  );

  /* 两处消费点：模板一条、真源一条 */
  write(
    path.join(dir, "src", "_includes", "layouts", "base.njk"),
    '<img src="/assets/img/fixture-hero.png" alt="fixture">\n'
  );
  write(
    path.join(dir, "src", "_data", "site.js"),
    'const portrait = "/assets/img/fixture-portrait.png";\n'
  );

  /* 产物：只含被引用的两张 —— 设计母版**不在产物里**（D52 修完之后的形态） */
  write(path.join(dir, "_site", "assets", "img", "fixture-hero.png"), "PNG-fixture-hero\n");
  write(path.join(dir, "_site", "assets", "img", "fixture-portrait.png"), "PNG-fixture-portrait\n");

  return dir;
}

/* ================= 跑门禁 / 解析红因 ================= */

/** 跑副本里的门禁，返回 { code, out }。 */
function runGate(dir) {
  try {
    const out = execFileSync(
      process.execPath,
      [path.join(dir, "scripts", "check-img-publish.cjs")],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    return { code: 0, out };
  } catch (e) {
    return {
      code: typeof e.status === "number" ? e.status : 1,
      out: `${e.stdout || ""}${e.stderr || ""}`,
    };
  }
}

/** 红因编号集合（只认行首的「· IPn：」，消息正文里出现的字样不算）。 */
function redIds(out) {
  const ids = new Set();
  const re = /^[ \t]*·[ \t]*(IP\d+)[ \t]*：/gm;
  let m;
  while ((m = re.exec(out)) !== null) ids.add(m[1]);
  return ids;
}

function sameSet(got, want) {
  if (got.size !== want.length) return false;
  return want.every((x) => got.has(x));
}

function fmtIds(ids) {
  return [...ids].sort().join("+") || "（无）";
}

/** 改副本里的一个文件；注入点找不到就当场抛错（不静默跳过）。 */
function patch(file, from, to) {
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes(from)) {
    throw new Error(
      `注入点不存在，已中止（不静默跳过）：\n  文件：${file}\n  锚点：${from}`
    );
  }
  fs.writeFileSync(file, text.replace(from, to));
}

/* 夹具里的常用路径 */
const prodOf = (dir, rel) => path.join(dir, "_site", "assets", "img", rel);
const srcOf = (dir, rel) => path.join(dir, "src", "assets", "img", rel);
const gateOf = (dir) => path.join(dir, "scripts", "check-img-publish.cjs");

/** 把源图拷进产物（**顺带建出目标父目录** —— copyFileSync 不会自己建）。 */
function copyIntoProd(dir, srcRel, prodRel) {
  const dest = prodOf(dir, prodRel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(srcOf(dir, srcRel), dest);
}

const results = [];
function record(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${id}${detail ? " —— " + detail : ""}`);
}

/**
 * 一档「注入 ⇒ 应当恰好红这么几条判据」。
 * 期望集合必须**完全相等**：多一条、少一条都算这档失败。
 */
function expectRed(id, dir, want, note) {
  const r = runGate(dir);
  const got = redIds(r.out);
  const ok = r.code === 1 && sameSet(got, want);
  record(
    id,
    ok,
    ok
      ? `红了，红因编号 = ${fmtIds(got)}（归属纯净）${note ? "；" + note : ""}`
      : `期望红因 ${fmtIds(new Set(want))} 且只有这些，实际 code=${r.code} 红因 ${fmtIds(got)}\n${r.out}`
  );
}

/** 一档「负对照：卸掉某条判定 ⇒ 应当完全转绿，一个红因都不许剩」。 */
function expectGreen(id, dir, note) {
  const r = runGate(dir);
  const got = redIds(r.out);
  const ok = r.code === 0 && got.size === 0;
  record(
    id,
    ok,
    ok
      ? `转绿了，红因一个不剩${note ? "；" + note : ""}`
      : `仍然红（code=${r.code}）红因 ${fmtIds(got)} ⇒ 负对照不成立\n${r.out}`
  );
}

/* ================= IU0：基线（绿） ================= */

{
  const dir = makeSandbox();
  const r = runGate(dir);
  const got = redIds(r.out);
  const ok = r.code === 0 && got.size === 0;
  record(
    "IU0 基线（夹具站上）",
    ok,
    ok
      ? "门禁绿 —— 设计母版留在源里、不进产物，判据不误伤"
      : `门禁不该红，却 exit ${r.code}，红因 ${fmtIds(got)}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= 注入档 IU1–IU6 ================= */

/* IU1（IP1）：产物里多一张**没人引用的设计母版副本** —— 这就是 D52 的形状：
   源里的分享图 SVG 母版被通配直拷进了产物，却没有任何页面请求它。 */
{
  const dir = makeSandbox();
  copyIntoProd(
    dir,
    path.join("og", "fixture-design-master.svg"),
    path.join("og", "fixture-design-master.svg")
  );
  expectRed("IU1 产物里塞一张没人引用的设计母版副本 ⇒ IP1", dir, ["IP1"]);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* IU2（IP2）：产物里少一张**被引用**的图 —— 页面会拿它当 <img src>，直接 404 */
{
  const dir = makeSandbox();
  fs.rmSync(prodOf(dir, "fixture-hero.png"));
  expectRed("IU2 产物里少了被引用的图（fixture-hero.png） ⇒ IP2", dir, ["IP2"]);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* IU3（IP3）：产物里多一张源目录已无的图 —— 没人认领的残留副本 */
{
  const dir = makeSandbox();
  write(prodOf(dir, "fixture-orphan.png"), "PNG-fixture-orphan\n");
  expectRed("IU3 产物里塞一张源目录已无的图（fixture-orphan.png） ⇒ IP3", dir, ["IP3"]);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* IU4（IP1）：删掉模板里的引用点 —— 源图还在、产物副本也还在，
   于是它从「该发布的图」变成「没人引用的副本」。 */
{
  const dir = makeSandbox();
  patch(
    path.join(dir, "src", "_includes", "layouts", "base.njk"),
    '<img src="/assets/img/fixture-hero.png" alt="fixture">\n',
    ""
  );
  expectRed("IU4 删掉模板里的引用点 ⇒ IP1", dir, ["IP1"]);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* IU5（IP4）：引用检测器认不出任何一张图 —— 覆盖度自证必须红。
   ⚠️ 产物一并清空：否则「检测器全瞎」会同时触发 IP1（每张产物图都成了没人引用的副本），
      两条判据同源、一档必红两条，红因归属就不可判定了。 */
{
  const dir = makeSandbox();
  patch(
    path.join(dir, "src", "_includes", "layouts", "base.njk"),
    '<img src="/assets/img/fixture-hero.png" alt="fixture">\n',
    ""
  );
  patch(
    path.join(dir, "src", "_data", "site.js"),
    'const portrait = "/assets/img/fixture-portrait.png";\n',
    ""
  );
  fs.rmSync(prodOf(dir, "fixture-hero.png"));
  fs.rmSync(prodOf(dir, "fixture-portrait.png"));
  expectRed("IU5 引用检测器认不出任何一张图 ⇒ IP4（覆盖度自证）", dir, ["IP4"]);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* IU6（IP5）：门禁自己被卸掉 */
{
  const dir = makeSandbox();
  write(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "img-publish-fixture", scripts: { build: "echo build" } }, null, 2) + "\n"
  );
  expectRed("IU6 门禁自己被卸掉（build 链里不叫它了） ⇒ IP5", dir, ["IP5"]);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= 判据级负对照 IU7–IU9 ================= */

/* IU7：卸掉 IP1 ⇒ IU1 的注入（没人引用的设计母版副本）必须转绿 */
{
  const dir = makeSandbox();
  patch(gateOf(dir), "const IP1_ON = true;", "const IP1_ON = false;");
  copyIntoProd(
    dir,
    path.join("og", "fixture-design-master.svg"),
    path.join("og", "fixture-design-master.svg")
  );
  expectGreen("IU7 负对照：卸掉 IP1 判定后，IU1 的注入转绿", dir, "证明 IU1 那档的红确实来自 IP1 判定本身");
  fs.rmSync(dir, { recursive: true, force: true });
}

/* IU8：卸掉 IP2 ⇒ IU2 的注入（被引用却漏拷）必须转绿 */
{
  const dir = makeSandbox();
  patch(gateOf(dir), "const IP2_ON = true;", "const IP2_ON = false;");
  fs.rmSync(prodOf(dir, "fixture-hero.png"));
  expectGreen("IU8 负对照：卸掉 IP2 判定后，IU2 的注入转绿", dir, "证明 IU2 那档的红确实来自 IP2 判定本身");
  fs.rmSync(dir, { recursive: true, force: true });
}

/* IU9：卸掉 IP3 ⇒ IU3 的注入（源已无的残留副本）必须转绿。
   ⚠️ 这一档同时证明 IP1 **没有**越界去管孤儿：否则 IP1 会接着红，负对照不成立。 */
{
  const dir = makeSandbox();
  patch(gateOf(dir), "const IP3_ON = true;", "const IP3_ON = false;");
  write(prodOf(dir, "fixture-orphan.png"), "PNG-fixture-orphan\n");
  expectGreen("IU9 负对照：卸掉 IP3 判定后，IU3 的注入转绿", dir, "证明 IU3 那档的红确实来自 IP3 判定本身");
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= IU10：覆盖度自证（门禁不是空跑） ================= */

{
  const dir = makeSandbox();
  const r = runGate(dir);
  const m = /源图片 (\d+) 张（被引用 (\d+) \/ 无消费点 (\d+)）、产物 (\d+) 张/.exec(r.out);
  const nums = m ? m.slice(1).map((x) => Number(x)) : [];
  const ok =
    r.code === 0 && nums.length === 4 && nums[0] === 3 && nums[1] >= 1 && nums[3] >= 1;
  record(
    "IU10 覆盖度自证：基线上门禁确实认出了被引用的图",
    ok,
    ok
      ? `源图片 ${nums[0]} 张（被引用 ${nums[1]} / 无消费点 ${nums[2]}）、产物 ${nums[3]} 张 —— 判据有真实命中，不是空跑`
      : `没读到覆盖度统计（或统计不对），缺自证证据\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= 收尾：仓库原件没被动过 ================= */

const problems = [];
if (sha256(GATE) !== GATE_SHA_AT_START) {
  problems.push("仓库里的门禁原件在自测期间被改动了 —— 自测必须只在副本上注入。");
}

if (problems.length) {
  console.error("\n图片发布清单门禁自测未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

const bad = results.filter((r) => !r.ok);
console.log(
  `\n注入矩阵：${results.length} 档里 ${results.length - bad.length} 档按预期触发` +
    `${bad.length ? `，${bad.length} 档未通过` : ""}` +
    `（IU7–IU9 是判据级负对照）。`
);
if (bad.length) bad.forEach((b) => console.log(`  · 未通过：${b.id}`));
console.log("  · 原件校验：门禁的 SHA-256 与自测开始时一致。");
process.exit(bad.length ? 1 : 0);
