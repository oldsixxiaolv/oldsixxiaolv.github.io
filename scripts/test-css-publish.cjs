#!/usr/bin/env node
/**
 * 自测 CU0–CU18：给 scripts/check-css-publish.cjs 的每条判据找一次「它会红」的证据
 *
 * 为什么要有这个自测（2026-10-21 的 D48）：
 *   这道门禁守的是「产物里只该有发布类的 CSS，不该有没人引用的副本」。
 *   而「门禁是绿的」有两种可能：① 它真的没问题；② 它的判据从来没被真正执行过。
 *   这两件事长得一模一样。所以每条判据都要有一档**注入**证明它会红，
 *   再有一档**负对照**证明「卸掉那一步之后确实就绿了」——
 *   否则红可能来自别处。
 *
 * 做法（全在临时目录的副本上，仓库里的原件一个字节都不动）：
 *   造一个**最小夹具站**（不依赖真 _site —— 真产物每次 build 都在变，
 *   拿它当基准会让自测跟着 build 抖）：
 *     <tmp>/scripts/check-css-publish.cjs  门禁副本（负对照要改它的 CSn_ON 开关）
 *     <tmp>/package.json                    build 链里必须有本门禁（CS7 看这个）
 *     <tmp>/eleventy.config.js              partial 拼接顺序的机器镜像（CS5 看这个）
 *     <tmp>/src/assets/css/**               五个源样式，四个角色各占位（CS1/CS6）
 *     <tmp>/src/_includes/layouts/base.njk  模板：内联 + 外链两种消费路径
 *     <tmp>/_site/assets/css/**             产物：发布类 + 合成产物 components.css
 *   门禁的 ROOT 是「它自己所在目录的上一级」，所以副本里的它**天然**
 *   指向副本里的站，不需要任何环境变量。
 *
 * 档位（11 档注入 + 7 档判据级负对照）：
 *   CU0  基线绿（并自证四类角色都被认出来了）
 *   CU1  产物里多一份「内联类」死副本（tokens.css）        ⇒ CS2
 *   CU2  产物里少了「外链类」样式（layout.css）            ⇒ CS3
 *   CU3  产物里多一份源目录已无的 CSS（orphan.css）        ⇒ CS4
 *   CU4  源里多一份没人引用的样式（dead.css）              ⇒ CS1
 *   CU5  顺序声明里指向一个不存在的 partial                 ⇒ CS5
 *   CU6  order 数组里多一个名字（集合对不上）               ⇒ CS5
 *   CU7  内联类清零（删源 + 删模板引用）                   ⇒ CS6（覆盖度自证）
 *   CU8  产物里多一份「顺序声明」死副本（index.css）       ⇒ CS2
 *   CU9  产物里少了 partial 副本（_nav.css）               ⇒ CS3
 *   CU10 门禁自己被卸掉（build 链里不叫它了）              ⇒ CS7
 *   CU11 顺序声明与 order 数组集合相同但不同序             ⇒ CS5
 *   CU12–CU18（负对照）卸掉 CS1–CS7 的判定开关
 *        ⇒ 对应注入必须**转绿**（红因一个都不许剩）
 *
 * ⚠️ 每档都断言「红因编号集合**完全相等**」，不只是「包含期望的那条」——
 *   一档里出现两条判据的红，红因归属就不可判定了（那是脚本的缺陷，不是产品的缺陷）。
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
const GATE = path.join(ROOT, "scripts", "check-css-publish.cjs");

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
 * 造一个最小夹具站：四个角色各占位、产物只含发布类。
 * 角色布局（刻意做成最小集，判据的形状才看得清）：
 *   tokens.css            内联（模板 {% inlineCss %}）
 *   layout.css            外链（模板 <link>）
 *   components/_btn.css   partial
 *   components/_nav.css   partial
 *   components/index.css  顺序声明（@import 清单）
 */
function makeSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mh-css-publish-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });

  fs.copyFileSync(GATE, path.join(dir, "scripts", "check-css-publish.cjs"));

  write(
    path.join(dir, "package.json"),
    JSON.stringify(
      { name: "css-publish-fixture", scripts: { build: "node scripts/check-css-publish.cjs" } },
      null,
      2
    ) + "\n"
  );

  /* partial 拼接顺序的机器镜像 —— 必须与磁盘清单、index.css 的 @import 同序 */
  write(path.join(dir, "eleventy.config.js"), 'const order = ["_btn", "_nav"];\n');

  write(path.join(dir, "src", "assets", "css", "tokens.css"), ":root{--fixture:1}\n");
  write(path.join(dir, "src", "assets", "css", "layout.css"), ".fixture-layout{color:#333}\n");
  write(path.join(dir, "src", "assets", "css", "components", "_btn.css"), ".fixture-btn{padding:4px}\n");
  write(path.join(dir, "src", "assets", "css", "components", "_nav.css"), ".fixture-nav{display:flex}\n");
  write(
    path.join(dir, "src", "assets", "css", "components", "index.css"),
    '/* 夹具：partial 顺序的书面声明 */\n@import url("./_btn.css");\n@import url("./_nav.css");\n'
  );

  write(
    path.join(dir, "src", "_includes", "layouts", "base.njk"),
    '{% inlineCss "src/assets/css/tokens.css" %}\n' +
      '<link rel="stylesheet" href="{{ \'/assets/css/layout.css\' | relUrl }}">\n'
  );

  /* 产物：发布类（外链 + 两个 partial）+ 合成产物 components.css */
  write(path.join(dir, "_site", "assets", "css", "layout.css"), ".fixture-layout{color:#333}\n");
  write(path.join(dir, "_site", "assets", "css", "components", "_btn.css"), ".fixture-btn{padding:4px}\n");
  write(path.join(dir, "_site", "assets", "css", "components", "_nav.css"), ".fixture-nav{display:flex}\n");
  write(path.join(dir, "_site", "assets", "css", "components.css"), "/* fixture bundle */\n");

  return dir;
}

/* ================= 跑门禁 / 解析红因 ================= */

/** 跑副本里的门禁，返回 { code, out }。 */
function runGate(dir) {
  try {
    const out = execFileSync(
      process.execPath,
      [path.join(dir, "scripts", "check-css-publish.cjs")],
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

/** 红因编号集合（只认行首的「· CSn：」，消息正文里出现的字样不算）。 */
function redIds(out) {
  const ids = new Set();
  const re = /^[ \t]*·[ \t]*(CS\d+)[ \t]*：/gm;
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
const prodOf = (dir, rel) => path.join(dir, "_site", "assets", "css", rel);
const srcOf = (dir, rel) => path.join(dir, "src", "assets", "css", rel);

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

/* ================= CU0：基线 ================= */

{
  const dir = makeSandbox();
  const r = runGate(dir);
  const got = redIds(r.out);
  const ok = r.code === 0 && got.size === 0;
  /* 覆盖度自证：夹具里四类角色都得被门禁认出来（数字来自门禁的通过信息） */
  const m = /内联 (\d+) \/ 外链 (\d+) \/ partial (\d+) \/ 顺序声明 (\d+)/.exec(r.out);
  const roles = m ? m.slice(1).map((x) => Number(x)) : [];
  const rolesOk = roles.length === 4 && roles.every((n) => n >= 1);
  record(
    "CU0 基线（夹具站上）",
    ok && rolesOk,
    ok
      ? rolesOk
        ? `门禁绿；四类角色都认出来了（内联 ${roles[0]} / 外链 ${roles[1]} / partial ${roles[2]} / 顺序声明 ${roles[3]}）`
        : `门禁绿，但没读到角色统计 —— 覆盖度自证缺证据\n${r.out}`
      : `门禁不该红，却 exit ${r.code}，红因 ${fmtIds(got)}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= 注入档 CU1–CU11 ================= */

/* CU1（CS2）：产物里多一份「内联类」死副本 —— 内联才是它的唯一消费路径 */
{
  const dir = makeSandbox();
  fs.copyFileSync(srcOf(dir, "tokens.css"), prodOf(dir, "tokens.css"));
  expectRed("CU1 产物里塞一份内联类的死副本（tokens.css） ⇒ CS2", dir, ["CS2"]);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* CU2（CS3）：产物里少了「外链类」样式 —— 页面会拿它当 <link href>，直接 404 */
{
  const dir = makeSandbox();
  fs.rmSync(prodOf(dir, "layout.css"));
  expectRed("CU2 产物里少了外链类样式（layout.css） ⇒ CS3", dir, ["CS3"]);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* CU3（CS4）：产物里多一份源目录已无的 CSS —— 没人认领的残留副本 */
{
  const dir = makeSandbox();
  write(prodOf(dir, "orphan.css"), ".fixture-orphan{color:red}\n");
  expectRed("CU3 产物里塞一份源目录已无的 CSS（orphan.css） ⇒ CS4", dir, ["CS4"]);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* CU4（CS1）：源里多一份没人引用的样式 —— 归不进任何角色 */
{
  const dir = makeSandbox();
  write(srcOf(dir, "dead.css"), ".fixture-dead{color:red}\n");
  expectRed("CU4 源里塞一份没人引用的样式（dead.css） ⇒ CS1", dir, ["CS1"]);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* CU5（CS5）：顺序声明里指向一个不存在的 partial */
{
  const dir = makeSandbox();
  patch(
    srcOf(dir, "components/index.css"),
    '@import url("./_nav.css");',
    '@import url("./_ghost.css");'
  );
  expectRed("CU5 顺序声明里指向一个不存在的 partial ⇒ CS5", dir, ["CS5"]);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* CU6（CS5）：order 数组里多一个名字 —— 集合对不上 */
{
  const dir = makeSandbox();
  patch(
    path.join(dir, "eleventy.config.js"),
    'const order = ["_btn", "_nav"];',
    'const order = ["_btn", "_nav", "_ghost"];'
  );
  expectRed("CU6 order 数组里多一个名字（集合对不上） ⇒ CS5", dir, ["CS5"]);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* CU7（CS6）：内联类清零 —— 一个被内联的源样式都没认出来 */
{
  const dir = makeSandbox();
  fs.rmSync(srcOf(dir, "tokens.css"));
  patch(
    path.join(dir, "src", "_includes", "layouts", "base.njk"),
    '{% inlineCss "src/assets/css/tokens.css" %}\n',
    ""
  );
  expectRed("CU7 内联类清零（删源 + 删模板引用） ⇒ CS6（覆盖度自证）", dir, ["CS6"]);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* CU8（CS2）：产物里多一份「顺序声明」死副本 —— 浏览器从不加载它 */
{
  const dir = makeSandbox();
  write(
    prodOf(dir, "components/index.css"),
    fs.readFileSync(srcOf(dir, "components/index.css"), "utf8")
  );
  expectRed("CU8 产物里塞一份顺序声明的死副本（components/index.css） ⇒ CS2", dir, ["CS2"]);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* CU9（CS3）：产物里少了 partial 副本 —— dev 的 @import 按相对路径指向它 */
{
  const dir = makeSandbox();
  fs.rmSync(prodOf(dir, "components/_nav.css"));
  expectRed("CU9 产物里少了 partial 副本（components/_nav.css） ⇒ CS3", dir, ["CS3"]);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* CU10（CS7）：门禁自己被卸掉 */
{
  const dir = makeSandbox();
  write(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "css-publish-fixture", scripts: { build: "echo build" } }, null, 2) + "\n"
  );
  expectRed("CU10 门禁自己被卸掉（build 链里不叫它了） ⇒ CS7", dir, ["CS7"]);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* CU11（CS5）：集合相同但不同序 —— 渲染层级会悄悄变 */
{
  const dir = makeSandbox();
  patch(
    srcOf(dir, "components/index.css"),
    '@import url("./_btn.css");\n@import url("./_nav.css");',
    '@import url("./_nav.css");\n@import url("./_btn.css");'
  );
  expectRed("CU11 顺序声明与 order 数组集合相同但不同序 ⇒ CS5", dir, ["CS5"]);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= 判据级负对照 CU12–CU18 ================= */

/* CU12：卸掉 CS1 ⇒ CU4 的注入（没人引用的源样式）必须转绿 */
{
  const dir = makeSandbox();
  patch(path.join(dir, "scripts", "check-css-publish.cjs"), "const CS1_ON = true;", "const CS1_ON = false;");
  write(srcOf(dir, "dead.css"), ".fixture-dead{color:red}\n");
  expectGreen("CU12 负对照：卸掉 CS1 判定后，CU4 的注入转绿", dir, "证明 CU4 那档的红确实来自 CS1 判定本身");
  fs.rmSync(dir, { recursive: true, force: true });
}

/* CU13：卸掉 CS2 ⇒ CU1 的注入（内联类死副本）必须转绿 */
{
  const dir = makeSandbox();
  patch(path.join(dir, "scripts", "check-css-publish.cjs"), "const CS2_ON = true;", "const CS2_ON = false;");
  fs.copyFileSync(srcOf(dir, "tokens.css"), prodOf(dir, "tokens.css"));
  expectGreen("CU13 负对照：卸掉 CS2 判定后，CU1 的注入转绿", dir, "证明 CU1 那档的红确实来自 CS2 判定本身");
  fs.rmSync(dir, { recursive: true, force: true });
}

/* CU14：卸掉 CS3 ⇒ CU2 的注入（外链类漏拷）必须转绿 */
{
  const dir = makeSandbox();
  patch(path.join(dir, "scripts", "check-css-publish.cjs"), "const CS3_ON = true;", "const CS3_ON = false;");
  fs.rmSync(prodOf(dir, "layout.css"));
  expectGreen("CU14 负对照：卸掉 CS3 判定后，CU2 的注入转绿", dir, "证明 CU2 那档的红确实来自 CS3 判定本身");
  fs.rmSync(dir, { recursive: true, force: true });
}

/* CU15：卸掉 CS4 ⇒ CU3 的注入（源已无的残留副本）必须转绿 */
{
  const dir = makeSandbox();
  patch(path.join(dir, "scripts", "check-css-publish.cjs"), "const CS4_ON = true;", "const CS4_ON = false;");
  write(prodOf(dir, "orphan.css"), ".fixture-orphan{color:red}\n");
  expectGreen("CU15 负对照：卸掉 CS4 判定后，CU3 的注入转绿", dir, "证明 CU3 那档的红确实来自 CS4 判定本身");
  fs.rmSync(dir, { recursive: true, force: true });
}

/* CU16：卸掉 CS5 ⇒ CU5 的注入（声明与磁盘对不上）必须转绿 */
{
  const dir = makeSandbox();
  patch(path.join(dir, "scripts", "check-css-publish.cjs"), "const CS5_ON = true;", "const CS5_ON = false;");
  patch(srcOf(dir, "components/index.css"), '@import url("./_nav.css");', '@import url("./_ghost.css");');
  expectGreen("CU16 负对照：卸掉 CS5 判定后，CU5 的注入转绿", dir, "证明 CU5 那档的红确实来自 CS5 判定本身");
  fs.rmSync(dir, { recursive: true, force: true });
}

/* CU17：卸掉 CS6 ⇒ CU7 的注入（内联类清零）必须转绿 */
{
  const dir = makeSandbox();
  patch(path.join(dir, "scripts", "check-css-publish.cjs"), "const CS6_ON = true;", "const CS6_ON = false;");
  fs.rmSync(srcOf(dir, "tokens.css"));
  patch(
    path.join(dir, "src", "_includes", "layouts", "base.njk"),
    '{% inlineCss "src/assets/css/tokens.css" %}\n',
    ""
  );
  expectGreen("CU17 负对照：卸掉 CS6 判定后，CU7 的注入转绿", dir, "证明 CU7 那档的红确实来自 CS6 判定本身");
  fs.rmSync(dir, { recursive: true, force: true });
}

/* CU18：卸掉 CS7 ⇒ CU10 的注入（门禁被卸掉）必须转绿 */
{
  const dir = makeSandbox();
  patch(path.join(dir, "scripts", "check-css-publish.cjs"), "const CS7_ON = true;", "const CS7_ON = false;");
  write(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "css-publish-fixture", scripts: { build: "echo build" } }, null, 2) + "\n"
  );
  expectGreen("CU18 负对照：卸掉 CS7 判定后，CU10 的注入转绿", dir, "证明 CU10 那档的红确实来自 CS7 判定本身");
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= 收尾：仓库原件没被动过 ================= */

const problems = [];
if (sha256(GATE) !== GATE_SHA_AT_START) {
  problems.push("仓库里的门禁原件在自测期间被改动了 —— 自测必须只在副本上注入。");
}

if (problems.length) {
  console.error("\nCSS 发布清单门禁自测未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

const bad = results.filter((r) => !r.ok);
console.log(
  `\n注入矩阵：${results.length} 档里 ${results.length - bad.length} 档按预期触发` +
    `${bad.length ? `，${bad.length} 档未通过` : ""}` +
    `（CU12–CU18 是判据级负对照）。`
);
if (bad.length) bad.forEach((b) => console.log(`  · 未通过：${b.id}`));
console.log("  · 原件校验：门禁的 SHA-256 与自测开始时一致。");
process.exit(bad.length ? 1 : 0);
