#!/usr/bin/env node
/**
 * 自测 DY0–DY12：给 scripts/check-dead-css.cjs 的每条判据找一次「它会红」的证据
 *
 * 为什么要有这个自测（2026-10-21 的 D52）：
 *   这道门禁守的是「CSS 里定义的类，页面上真的会出现」。
 *   而「门禁是绿的」有两种可能：① 它真的没问题；② 它的判据从来没被真正执行过。
 *   这两件事长得一模一样。所以每条判据都要有一档**注入**证明它会红，
 *   再有一档**负对照**证明「卸掉那一步之后确实就绿了」——
 *   否则红可能来自别处。
 *
 * 夹具怎么造（为什么不照抄真仓库）：
 *   夹具站是**最小**的，只留四样东西：
 *     <tmp>/scripts/check-dead-css.cjs  门禁副本（负对照要改它的 DZ*_ON 开关）
 *     <tmp>/package.json                build 链里必须有本门禁（DZ3 看这个）
 *     <tmp>/src/assets/css/fixture-{main,second}.css  两张样式表
 *     <tmp>/src/_includes/layouts/fixture.njk         页面侧（给活类一个落点）
 *     <tmp>/<登记表的构造点路径>                        每个动态登记项一个构造点
 *   门禁的 REPO 根是「它自己所在目录的上一级」，所以副本里的它**天然**
 *   指向副本里的站，不需要任何环境变量。
 *
 *   ⚠️ **登记表是从门禁源码里解析出来的，不是写死的**：门禁的 REGISTRY 增删条目时，
 *      夹具跟着变，自测不必手改；反过来，若门禁的登记表与夹具对不上，
 *      自测会当场红（登记项失效），不会假绿。
 *      代价是自测源码里**不出现任何真实类名**（夹具文件在 /tmp，不在仓库里）。
 *
 *   ⚠️ 为什么夹具不能照抄真仓库：真仓库里「删掉构造点文件」会同时让一批
 *      **别的** CSS 类变成死类（它们本来就靠这个构造点活着）⇒ 那一档会同时
 *      红 DZ1 和 DZ4，红因归属就不可判定了。最小夹具里构造点只喂登记项，
 *      删掉它只影响登记项 ⇒ 归属纯净。
 *
 * 档位（6 档注入 + 4 档判据级负对照 + 2 档基线/自证）：
 *   DY0  基线绿
 *   DY1  往第一张样式表里塞一个没人用的类                ⇒ DZ1
 *   DY2  往**第二张**样式表里塞一个没人用的类            ⇒ DZ1（证明受检范围不是只看一张表）
 *   DY3  删掉登记项的构造点文件                          ⇒ DZ4
 *   DY4  把构造点里的前缀字面量改掉                      ⇒ DZ4
 *   DY5  删掉登记项在样式表里的定义                      ⇒ DZ4
 *   DY6  门禁自己被卸掉（build 链里不叫它了）            ⇒ DZ3
 *   DY7  把样式表目录清空（扫不到任何表）                ⇒ DZ2（覆盖度自证）
 *   DY8  负对照：卸掉 DZ1 ⇒ DY1 / DY2 的注入必须**转绿**
 *   DY9  负对照：卸掉 DZ2 ⇒ DY7 的注入必须**转绿**
 *   DY10 负对照：卸掉 DZ3 ⇒ DY6 的注入必须**转绿**
 *   DY11 负对照：卸掉 DZ4 ⇒ DY3 / DY4 / DY5 的注入必须**转绿**
 *   DY12 覆盖度自证：基线上门禁**确实**认出了页面侧有落点的类
 *
 * ⚠️ 每档都断言「红因编号集合**完全相等**」，不只是「包含期望的那条」——
 *   一档里出现两条判据的红，红因归属就不可判定了（那是脚本的缺陷，不是产品的缺陷）。
 *   DY8–DY11 这四档负对照正是「归属纯净」的守门人：
 *   卸掉 DZ4 之后 DY3 若还红，说明 DZ1 越界管了登记项 ⇒ 立刻暴露。
 *
 * 收尾：按 SHA-256 校验仓库里的门禁原件没被动过。
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const vm = require("vm");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const GATE = path.join(ROOT, "scripts", "check-dead-css.cjs");

function sha256(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

/* 原件指纹：**自测开始时**记下来，收尾时比对 ——
   证明这一整轮注入全在副本上，仓库里的原件一个字节都没动。 */
const GATE_SHA_AT_START = sha256(GATE);

/* ================= 从门禁源码里读登记表 ================= */

/**
 * 登记表（REGISTRY）是门禁源码里的一个**字面量数组**。
 * 这里把它切出来在隔离上下文里求值（vm.runInNewContext，不碰全局），
 * 这样自测不必把真实类名写死在源码里，门禁改登记表时夹具自动跟着变。
 * 求值失败 ⇒ 当场抛错（不静默跳过），因为拿不到登记表就没法造夹具。
 */
function readRegistry() {
  const src = fs.readFileSync(GATE, "utf8");
  const startMarker = "const REGISTRY = [";
  const start = src.indexOf(startMarker);
  if (start === -1) throw new Error("门禁源码里找不到 REGISTRY 定义 —— 夹具造不出来。");
  const bodyStart = start + startMarker.length - 1;
  const end = src.indexOf("\n];", bodyStart);
  if (end === -1) throw new Error("门禁源码里的 REGISTRY 数组没有正常收尾 —— 夹具造不出来。");
  const literal = src.slice(bodyStart, end + 2);
  const list = vm.runInNewContext(literal, Object.create(null), { timeout: 2000 });
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error("从门禁源码里读出来的登记表不对 —— 夹具造不出来。");
  }
  return list;
}

const REGISTRY = readRegistry();

/* 动态登记项里，前缀**只被一条**登记项用的那条 —— DY4 改前缀时用它，
   否则改一个前缀会同时影响共享同一前缀的其它登记项（红因仍是 DZ4，但说不清是哪条）。 */
const DYNAMIC = REGISTRY.filter((e) => e.kind === "dynamic");
const UNIQUE_PREFIX_ENTRY = DYNAMIC.find(
  (e) => REGISTRY.filter((x) => x.kind === "dynamic" && x.prefix === e.prefix).length === 1
);

/* ================= 夹具站 ================= */

function write(p, text) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
}

/**
 * 造一个最小夹具站。
 * ⚠️ 夹具里的类名一律 fixture-* 开头（活类）或直接取自登记表（登记项），
 *    绝不写死真站点的类名 —— 写死了就分不清「门禁认出来的」和「自测自己写的」。
 */
function makeSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mh-dead-css-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.copyFileSync(GATE, path.join(dir, "scripts", "check-dead-css.cjs"));

  write(
    path.join(dir, "package.json"),
    JSON.stringify(
      { name: "dead-css-fixture", scripts: { build: "node scripts/check-dead-css.cjs" } },
      null,
      2
    ) + "\n"
  );

  /* 样式表 A：登记表的每一个类都要被定义（否则 DZ4 会说"登记项已失效"）。
     「保留待拍板」那一类还必须在**定义它的这个文件**的注释里点名 ——
     这正是 DZ4 ⑤ 要求的"保留要写在原地"。 */
  const main = ["/* fixture 样式表 A */"];
  for (const e of REGISTRY) {
    if (e.kind === "held") main.push(`/* 保留待拍板（fixture）：.${e.cls} */`);
    main.push(`.${e.cls} { color: inherit; }`);
  }
  main.push(".fixture-live-a { color: inherit; }");
  write(path.join(dir, "src", "assets", "css", "fixture-main.css"), main.join("\n") + "\n");

  /* 样式表 B：证明受检范围不止一张表 */
  write(
    path.join(dir, "src", "assets", "css", "fixture-second.css"),
    ".fixture-live-b { color: inherit; }\n"
  );

  /* 构造点：每个动态登记项一个文件，路径与登记表一致，内容里写出 prefix+value */
  const bySite = new Map();
  for (const e of DYNAMIC) {
    if (!bySite.has(e.site)) bySite.set(e.site, []);
    bySite.get(e.site).push(`${e.prefix}${e.cls.slice(e.prefix.length)}`);
  }
  for (const [site, classes] of bySite) {
    write(
      path.join(dir, site),
      `<!-- fixture 构造点：类名由前缀 + 取值拼出来 -->\n<div class="${classes.join(" ")}"></div>\n`
    );
  }

  /* 页面侧：给两个活类一个落点（否则基线就有死类，DY0 不绿） */
  write(
    path.join(dir, "src", "_includes", "layouts", "fixture.njk"),
    '<div class="fixture-live-a fixture-live-b"></div>\n'
  );

  return dir;
}

/* ================= 跑门禁 / 解析红因 ================= */

/** 跑副本里的门禁，返回 { code, out }。 */
function runGate(dir) {
  try {
    const out = execFileSync(
      process.execPath,
      [path.join(dir, "scripts", "check-dead-css.cjs")],
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

/** 红因编号集合（只认行首的「· DZn：」，消息正文里出现的字样不算）。 */
function redIds(out) {
  const ids = new Set();
  const re = /^[ \t]*·[ \t]*(DZ\d+)[ \t]*：/gm;
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
const cssMainOf = (dir) => path.join(dir, "src", "assets", "css", "fixture-main.css");
const cssSecondOf = (dir) => path.join(dir, "src", "assets", "css", "fixture-second.css");
const gateOf = (dir) => path.join(dir, "scripts", "check-dead-css.cjs");
/** 构造点文件：按路径排序取第一个（保证可复现） */
const firstSiteOf = (dir) => {
  const sites = [...new Set(DYNAMIC.map((e) => e.site))].sort();
  return { rel: sites[0], abs: path.join(dir, sites[0]) };
};

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

/* ================= DY0：基线（绿） ================= */

{
  const dir = makeSandbox();
  const r = runGate(dir);
  const got = redIds(r.out);
  const ok = r.code === 0 && got.size === 0;
  record(
    "DY0 基线（夹具站上）",
    ok,
    ok
      ? "门禁绿 —— 夹具里的类都有落点，登记表依据齐全"
      : `门禁不该红，却 exit ${r.code}，红因 ${fmtIds(got)}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= 注入档 DY1–DY7 ================= */

/* DY1（DZ1）：第一张样式表里塞一个没人用的类 */
{
  const dir = makeSandbox();
  fs.appendFileSync(cssMainOf(dir), ".fixture-dead-one { color: red; }\n");
  expectRed("DY1 第一张样式表塞死类 ⇒ DZ1", dir, ["DZ1"]);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* DY2（DZ1）：**第二张**样式表里塞一个没人用的类 ——
   这一档是「受检范围扩到全部样式表」的证据：老门禁只看 pages.css，
   范围不扩的话这一档根本不会红。 */
{
  const dir = makeSandbox();
  fs.appendFileSync(cssSecondOf(dir), ".fixture-dead-two { color: red; }\n");
  expectRed("DY2 第二张样式表塞死类 ⇒ DZ1（证明不是只看一张表）", dir, ["DZ1"]);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* DY3（DZ4）：删掉登记项的构造点文件 —— 登记项的依据没了，必须判红 */
{
  const dir = makeSandbox();
  const site = firstSiteOf(dir);
  fs.rmSync(site.abs, { force: true });
  expectRed(`DY3 删掉构造点文件（${site.rel}） ⇒ DZ4`, dir, ["DZ4"]);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* DY4（DZ4）：把构造点里的前缀字面量改掉 —— 构造方式变了，登记依据没了 */
{
  const dir = makeSandbox();
  if (!UNIQUE_PREFIX_ENTRY) {
    throw new Error("登记表里没有「前缀只被一条登记项用」的动态项，DY4 无法构造。");
  }
  const e = UNIQUE_PREFIX_ENTRY;
  const value = e.cls.slice(e.prefix.length);
  const siteAbs = path.join(dir, e.site);
  patch(siteAbs, `${e.prefix}${value}`, value);
  expectRed(`DY4 改掉构造点的前缀字面量（${e.prefix}） ⇒ DZ4`, dir, ["DZ4"]);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* DY5（DZ4）：删掉登记项在样式表里的定义 —— 登记项已经没有对象了 */
{
  const dir = makeSandbox();
  const e = DYNAMIC[0];
  patch(cssMainOf(dir), `.${e.cls} { color: inherit; }\n`, "");
  expectRed(`DY5 删掉登记类的定义（${e.cls}） ⇒ DZ4`, dir, ["DZ4"]);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* DY6（DZ3）：门禁自己被卸掉 */
{
  const dir = makeSandbox();
  write(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "dead-css-fixture", scripts: { build: "echo build" } }, null, 2) + "\n"
  );
  expectRed("DY6 门禁自己被卸掉（build 链里不叫它了） ⇒ DZ3", dir, ["DZ3"]);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* DY7（DZ2）：样式表一张都扫不到 —— 覆盖度自证必须红。
   ⚠️ 这一档只红 DZ2：门禁里 DZ4 有「样式表 0 张时整条跳过」的反耦合规则，
   DZ1 没有类可判，DZ3 与样式表无关 —— 三条都不掺和。 */
{
  const dir = makeSandbox();
  fs.rmSync(cssMainOf(dir), { force: true });
  fs.rmSync(cssSecondOf(dir), { force: true });
  expectRed("DY7 样式表目录清空（扫不到任何表） ⇒ DZ2（覆盖度自证）", dir, ["DZ2"]);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= 判据级负对照 DY8–DY11 ================= */

/* DY8：卸掉 DZ1 ⇒ DY1 / DY2 的注入必须转绿 */
{
  const dir = makeSandbox();
  patch(gateOf(dir), "const DZ1_ON = true;", "const DZ1_ON = false;");
  fs.appendFileSync(cssMainOf(dir), ".fixture-dead-one { color: red; }\n");
  expectGreen("DY8 负对照：卸掉 DZ1 判定后，DY1 的注入转绿", dir, "证明 DY1 那档的红确实来自 DZ1 判定本身");
  fs.rmSync(dir, { recursive: true, force: true });
}
{
  const dir = makeSandbox();
  patch(gateOf(dir), "const DZ1_ON = true;", "const DZ1_ON = false;");
  fs.appendFileSync(cssSecondOf(dir), ".fixture-dead-two { color: red; }\n");
  expectGreen("DY8 负对照：卸掉 DZ1 判定后，DY2 的注入转绿", dir, "证明 DY2 那档的红确实来自 DZ1 判定本身");
  fs.rmSync(dir, { recursive: true, force: true });
}

/* DY9：卸掉 DZ2 ⇒ DY7 的注入必须转绿 */
{
  const dir = makeSandbox();
  patch(gateOf(dir), "const DZ2_ON = true;", "const DZ2_ON = false;");
  fs.rmSync(cssMainOf(dir), { force: true });
  fs.rmSync(cssSecondOf(dir), { force: true });
  expectGreen("DY9 负对照：卸掉 DZ2 判定后，DY7 的注入转绿", dir, "证明 DY7 那档的红确实来自 DZ2 判定本身");
  fs.rmSync(dir, { recursive: true, force: true });
}

/* DY10：卸掉 DZ3 ⇒ DY6 的注入必须转绿 */
{
  const dir = makeSandbox();
  patch(gateOf(dir), "const DZ3_ON = true;", "const DZ3_ON = false;");
  write(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "dead-css-fixture", scripts: { build: "echo build" } }, null, 2) + "\n"
  );
  expectGreen("DY10 负对照：卸掉 DZ3 判定后，DY6 的注入转绿", dir, "证明 DY6 那档的红确实来自 DZ3 判定本身");
  fs.rmSync(dir, { recursive: true, force: true });
}

/* DY11：卸掉 DZ4 ⇒ DY3 / DY4 / DY5 的注入必须转绿 */
{
  const dir = makeSandbox();
  patch(gateOf(dir), "const DZ4_ON = true;", "const DZ4_ON = false;");
  const site = firstSiteOf(dir);
  fs.rmSync(site.abs, { force: true });
  expectGreen("DY11 负对照：卸掉 DZ4 判定后，DY3 的注入转绿", dir, "证明 DY3 那档的红确实来自 DZ4 判定本身");
  fs.rmSync(dir, { recursive: true, force: true });
}
{
  const dir = makeSandbox();
  patch(gateOf(dir), "const DZ4_ON = true;", "const DZ4_ON = false;");
  const e = UNIQUE_PREFIX_ENTRY;
  const value = e.cls.slice(e.prefix.length);
  patch(path.join(dir, e.site), `${e.prefix}${value}`, value);
  expectGreen("DY11 负对照：卸掉 DZ4 判定后，DY4 的注入转绿", dir, "证明 DY4 那档的红确实来自 DZ4 判定本身");
  fs.rmSync(dir, { recursive: true, force: true });
}
{
  const dir = makeSandbox();
  patch(gateOf(dir), "const DZ4_ON = true;", "const DZ4_ON = false;");
  const e = DYNAMIC[0];
  patch(cssMainOf(dir), `.${e.cls} { color: inherit; }\n`, "");
  expectGreen("DY11 负对照：卸掉 DZ4 判定后，DY5 的注入转绿", dir, "证明 DY5 那档的红确实来自 DZ4 判定本身");
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= DY12：覆盖度自证（门禁不是空跑） ================= */

{
  const dir = makeSandbox();
  const r = runGate(dir);
  const m = /(\d+) 个样式表、(\d+) 个类名（页面侧找到落点 (\d+) 个、登记表登记 (\d+) 个）/.exec(r.out);
  const nums = m ? m.slice(1).map((x) => Number(x)) : [];
  const ok =
    r.code === 0 &&
    nums.length === 4 &&
    nums[0] >= 1 &&
    nums[1] >= 1 &&
    nums[2] >= 1 &&
    nums[3] === REGISTRY.length;
  record(
    "DY12 覆盖度自证：基线上门禁确实认出了页面侧有落点的类",
    ok,
    ok
      ? `样式表 ${nums[0]} 张、类名 ${nums[1]} 个（页面侧落点 ${nums[2]} 个、登记 ${nums[3]} 条）—— 判据有真实命中，不是空跑`
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
  console.error("\n死 CSS 门禁自测未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

const bad = results.filter((r) => !r.ok);
console.log(
  `\n注入矩阵：${results.length} 档里 ${results.length - bad.length} 档按预期触发` +
    `${bad.length ? `，${bad.length} 档未通过` : ""}` +
    `（DY8–DY11 是判据级负对照）。`
);
if (bad.length) bad.forEach((b) => console.log(`  · 未通过：${b.id}`));
console.log("  · 原件校验：门禁的 SHA-256 与自测开始时一致。");
process.exit(bad.length ? 1 : 0);
