#!/usr/bin/env node
/**
 * 自测：给 scripts/check-css-publish.cjs 的每条判据找一次「它会红」的证据
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
 *     <tmp>/_site/assets/css/**             产物：**随模式**（见下）
 *   门禁的 ROOT 是「它自己所在目录的上一级」，所以副本里的它**天然**
 *   指向副本里的站，不需要任何环境变量。
 *
 * 夹具站的**模式**（D51 起）：门禁从产物自身判 dev/prod（components.css 里
 *   有没有 @import），所以夹具必须能造出两种形态：
 *     prod —— components.css 是 concat 单文件（无 @import），产物里**没有** partial；
 *     dev  —— components.css 是 @import hub，产物里**有**两个 partial。
 *
 * 档位（注入 / 判据级负对照 / 基线 / 覆盖度自证四类；确切档数以收尾「档位清单守卫」打印为准）：
 *   CU0  基线绿（prod 夹具，并自证四类角色都被认出来了）
 *   CU0b 基线绿（dev 夹具 —— hub 形态下也必须绿）
 *   CU1  产物里多一份「内联类」死副本（tokens.css）        ⇒ CS2
 *   CU2  产物里少了「外链类」样式（layout.css）            ⇒ CS3
 *   CU3  产物里多一份源目录已无的 CSS（orphan.css）        ⇒ CS4
 *   CU4  源里多一份没人引用的样式（dead.css）              ⇒ CS1
 *   CU5  顺序声明里指向一个不存在的 partial                 ⇒ CS5
 *   CU6  order 数组里多一个名字（集合对不上）               ⇒ CS5
 *   CU7  内联类清零（删源 + 删模板引用）                   ⇒ CS6（覆盖度自证）
 *   CU8  产物里多一份「顺序声明」死副本（index.css）       ⇒ CS2
 *   CU9  **dev** 产物里少了 partial 副本（_nav.css）       ⇒ CS3
 *   CU10 门禁自己被卸掉（build 链里不叫它了）              ⇒ CS7
 *   CU11 顺序声明与 order 数组集合相同但不同序             ⇒ CS5
 *   CU19 **prod** 产物里多一份 partial 副本（_btn.css）    ⇒ CS2（D51 的形状）
 *   CU20 prod 产物里没有 components.css（判不出模式）     ⇒ CS8
 *   CU12–CU18（负对照）卸掉 CS1–CS7 的判定开关
 *        ⇒ 对应注入必须**转绿**（红因一个都不许剩）
 *   CU21（负对照）卸掉 CS8 的判定开关 ⇒ CU20 必须转绿
 *   CU22 **覆盖度自证**（**故意排在基线之后、注入之前**：判据一漂移，
 *        第一件事就该把诊断报出来 —— 排在后面的话，前面任何一档崩掉都会让它跑不到）：
 *        门禁源码里的判据编号集合 == 本自测的静态清单（**双向**）
 *        ⇒ 门禁多一条判据而本矩阵没为它补档、或本矩阵登记了门禁压根没有的判据，
 *          都立刻判红（缺陷 D70 的修法 —— 门禁加判据时本矩阵没跟上，从前**毫无察觉**）
 *   CU23（自证的反向验证）门禁源码**多**一条判据 ⇒ CU22 那道检查必须报出来
 *   CU24（自证的反向验证）门禁源码**少**一条判据 ⇒ CU22 那道检查必须报出来
 *
 * ⚠️ 每档都断言「红因编号集合**完全相等**」，不只是「包含期望的那条」——
 *   一档里出现两条判据的红，红因归属就不可判定了（那是脚本的缺陷，不是产品的缺陷）。
 *
 * 收尾：按 SHA-256 校验仓库里的门禁原件没被动过；外加一道**档位清单守卫**
 *   （实际跑过的档位号集合 == 静态清单 ⇒ 删掉任何一档当场暴露）。
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
 *
 * mode = "prod"（默认）：产物 components.css 是 concat 单文件（无 @import），
 *   产物里**没有** partial —— prod 不发布分片（D51）。
 * mode = "dev"：产物 components.css 是 @import hub，产物里**有**两个 partial。
 */
function makeSandbox(mode = "prod") {
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

  /* 产物：**随模式** —— 门禁从 components.css 的形态判 dev/prod。 */
  write(path.join(dir, "_site", "assets", "css", "layout.css"), ".fixture-layout{color:#333}\n");
  if (mode === "dev") {
    write(path.join(dir, "_site", "assets", "css", "components", "_btn.css"), ".fixture-btn{padding:4px}\n");
    write(path.join(dir, "_site", "assets", "css", "components", "_nav.css"), ".fixture-nav{display:flex}\n");
    write(
      path.join(dir, "_site", "assets", "css", "components.css"),
      '/* fixture dev hub */\n@import url("./components/_btn.css");\n@import url("./components/_nav.css");\n'
    );
  } else {
    write(
      path.join(dir, "_site", "assets", "css", "components.css"),
      "/* fixture bundle */\n.fixture-btn{padding:4px}\n.fixture-nav{display:flex}\n"
    );
  }

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

/**
 * 负对照专用的注入：**锚点不在**时不抛异常，而是**记一档红**。
 *
 * 为什么单独一套（缺陷 D70 的配套修法）：
 *   锚点 `const CSn_ON = true;` 找不到 ⇒ 说明门禁的这条判据被改名或被删了 ——
 *   这**本身就是要报的事**。若在这里抛异常，整场自测会**中断**，
 *   后面那道覆盖度自证（CU22）就**跑不到** ⇒ 恰恰在最需要它的时候拿不到诊断
 *   （D72 场次实测：门禁少了 CS8 时，CU21 的锚点消失 ⇒ 自测崩在 CU21，
 *    「门禁少了一条判据」这句诊断一句都没打印）。
 */
function patchSwitch(file, from, to, id) {
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes(from)) {
    record(
      id,
      false,
      `注入点不存在：门禁源码里没有「${from}」—— 这条判据的开关被改名或被删了（这正是要报的事，不是脚本的错）`
    );
    return false;
  }
  fs.writeFileSync(file, text.replace(from, to));
  return true;
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

/* ================= 判据静态清单与源码解析（缺陷 D70 的修法） ================= */

/**
 * 门禁判据编号的**静态清单** —— 必须与 scripts/check-css-publish.cjs 一一对应。
 *
 * 为什么要有它（缺陷 D70，2026-10-22 D72 场次）：
 *   下面的注入矩阵是**手写**的。门禁哪天加了一条新判据（比如 CS9），
 *   矩阵不会自己长出一档去覆盖它 ⇒「门禁多了一条没人证明过的判定」从前**毫无察觉**：
 *   自测照样全绿，README 的对应行也就跟着说假话（这正是缺陷 D69 的成因）。
 *   所以必须有**双向**对账：门禁源码解析出的判据集合 == 这份静态清单，
 *   多一条、少一条都判红。
 */
const CRITERIA = ["CS1", "CS2", "CS3", "CS4", "CS5", "CS6", "CS7", "CS8"];

/**
 * 判据 → 档位映射：每条判据**由哪一档证明它会红**、**由哪一档做负对照**
 * （卸掉它以后，对应的注入必须转绿）。
 * CU22 会核对这张表的键集合与 CRITERIA 完全一致，
 * 并核对表里点名的每一档**真的跑过** —— 否则「覆盖」只是嘴上说说。
 */
const CRITERION_SLOTS = {
  CS1: { inject: "CU4", negative: "CU12" },
  CS2: { inject: "CU1", negative: "CU13" },
  CS3: { inject: "CU2", negative: "CU14" },
  CS4: { inject: "CU3", negative: "CU15" },
  CS5: { inject: "CU5", negative: "CU16" },
  CS6: { inject: "CU7", negative: "CU17" },
  CS7: { inject: "CU10", negative: "CU18" },
  CS8: { inject: "CU20", negative: "CU21" },
};

/**
 * 档位清单（收尾的「档位清单守卫」用）：
 * 实际跑过的档位号集合必须与它**完全相等** ⇒ 少跑一档当场暴露
 * （从前「少测一档，矩阵照样全绿」，谁也看不出来）。
 */
const EXPECTED_SLOTS = [
  "CU0", "CU0b",
  "CU1", "CU2", "CU3", "CU4", "CU5", "CU6", "CU7", "CU8", "CU9", "CU10", "CU11",
  "CU12", "CU13", "CU14", "CU15", "CU16", "CU17", "CU18",
  "CU19", "CU20", "CU21",
  "CU22", "CU23", "CU24",
];

/**
 * 一段源码里的**判据编号**（只取 CS 前缀）。
 *
 * 口径与 scripts/check-readme.cjs 的 RD6 一致：
 *   · **含注释** —— 门禁把判据含义写在注释里，那些也是判据编号；
 *   · **区间展开** —— "CS1–CS8" 只写了两头，中间六个编号**根本没出现**，
 *     只收单点会把 {CS1,CS8} 当成完整声明；
 *   · **只认 en/em dash**（U+2013 / U+2014）—— 把 ASCII 连字符也算进去
 *     会误吃 "A1-B2" 这类普通写法；
 *   · **按前缀取值** —— 源码里还有 C1 / CQ2 / D50 这类与判据无关的大写编号，
 *     只取 CS 前缀天然免疫。
 */
const CRIT_RANGE_RE = /(?<![A-Za-z0-9_-])(CS)(\d{1,3})\s*[–—]\s*(?:CS)?(\d{1,3})/g;
const CRIT_TOKEN_RE = /(?<![A-Za-z0-9_-])(CS)(\d{1,3})/g;

function criterionIdsOf(text) {
  const ids = new Set();
  let m;
  CRIT_RANGE_RE.lastIndex = 0;
  while ((m = CRIT_RANGE_RE.exec(text)) !== null) {
    const a = Number(m[2]);
    const b = Number(m[3]);
    if (b < a || b - a > 200) continue; // 区间写坏了就当没写，别把整份文件吃进去
    for (let k = a; k <= b; k++) ids.add(`CS${k}`);
  }
  CRIT_TOKEN_RE.lastIndex = 0;
  while ((m = CRIT_TOKEN_RE.exec(text)) !== null) ids.add(`CS${m[2]}`);
  return ids;
}

/**
 * 双向比对两个判据集合。
 *   extra   —— 只在「实际」里有的（门禁多出来的判据）
 *   missing —— 只在「清单」里有的（门禁少掉的判据）
 */
function compareCriterionSets(actual, expected) {
  const extra = [...actual].filter((x) => !expected.includes(x)).sort();
  const missing = expected.filter((x) => !actual.has(x)).sort();
  return { ok: extra.length === 0 && missing.length === 0, extra, missing };
}

/* ================= CU0：基线（prod 夹具） ================= */

{
  const dir = makeSandbox("prod");
  const r = runGate(dir);
  const got = redIds(r.out);
  const ok = r.code === 0 && got.size === 0;
  /* 覆盖度自证：夹具里四类角色都得被门禁认出来（数字来自门禁的通过信息） */
  const m = /内联 (\d+) \/ 外链 (\d+) \/ partial (\d+) \/ 顺序声明 (\d+)/.exec(r.out);
  const roles = m ? m.slice(1).map((x) => Number(x)) : [];
  const rolesOk = roles.length === 4 && roles.every((n) => n >= 1);
  record(
    "CU0 基线（prod 夹具站上）",
    ok && rolesOk,
    ok
      ? rolesOk
        ? `门禁绿；四类角色都认出来了（内联 ${roles[0]} / 外链 ${roles[1]} / partial ${roles[2]} / 顺序声明 ${roles[3]}）`
        : `门禁绿，但没读到角色统计 —— 覆盖度自证缺证据\n${r.out}`
      : `门禁不该红，却 exit ${r.code}，红因 ${fmtIds(got)}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= CU0b：基线（dev 夹具） ================= */

{
  const dir = makeSandbox("dev");
  const r = runGate(dir);
  const got = redIds(r.out);
  const ok = r.code === 0 && got.size === 0;
  const modeOk = /判为 \*\*dev/.test(r.out);
  record(
    "CU0b 基线（dev 夹具站上）",
    ok && modeOk,
    ok
      ? modeOk
        ? "门禁绿；产物形态被判为 dev（@import hub）"
        : "门禁绿，但没读到模式判定 —— 模式自证缺证据\n" + r.out
      : `门禁不该红，却 exit ${r.code}，红因 ${fmtIds(got)}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= CU22：覆盖度自证（**故意排在最前面**） =================
   判据一漂移，第一件事就该把诊断报出来 —— 排在后面的话，前面任何一档崩掉
   都会让它跑不到（D72 场次实测：门禁少了 CS8 时，负对照 CU21 的注入锚点消失，
   整场自测中断 ⇒ 「门禁少了一条判据」这句诊断一句都没打印）。 */
{
  const gateSet = criterionIdsOf(fs.readFileSync(GATE, "utf8"));
  const cmp = compareCriterionSets(gateSet, CRITERIA);
  const slotCmp = compareCriterionSets(new Set(Object.keys(CRITERION_SLOTS)), CRITERIA);
  const mapped = [...new Set(Object.values(CRITERION_SLOTS).flatMap((s) => [s.inject, s.negative]))];
  const notListed = mapped.filter((s) => !EXPECTED_SLOTS.includes(s));
  const ok = cmp.ok && slotCmp.ok && notListed.length === 0;
  record(
    "CU22 覆盖度自证：门禁判据集合 == 静态清单（双向）",
    ok,
    ok
      ? `门禁 {${[...gateSet].sort().join(",")}} 与静态清单双向相等；` +
          `${Object.keys(CRITERION_SLOTS).length} 条判据各自都有注入档与负对照档，且这些档都在档位清单里`
      : `对账未通过 —— 门禁多出 {${cmp.extra.join(",") || "无"}}，门禁缺少 {${cmp.missing.join(",") || "无"}}；` +
          `映射表多出 {${slotCmp.extra.join(",") || "无"}}，映射表缺少 {${slotCmp.missing.join(",") || "无"}}；` +
          `映射表点名的档位不在档位清单里 {${notListed.join(",") || "无"}}`
  );
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

/* CU9（CS3）：**dev** 产物里少了 partial 副本 —— hub 的 @import 按相对路径指向它 */
{
  const dir = makeSandbox("dev");
  fs.rmSync(prodOf(dir, "components/_nav.css"));
  expectRed("CU9 dev 产物里少了 partial 副本（components/_nav.css） ⇒ CS3", dir, ["CS3"]);
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

/* CU19（CS2）：**prod** 产物里多一份 partial 副本 —— 这就是 D51 的形状：
   prod 的 components.css 是 concat 单文件，分片本身没人请求。 */
{
  const dir = makeSandbox("prod");
  write(
    prodOf(dir, "components/_btn.css"),
    fs.readFileSync(srcOf(dir, "components/_btn.css"), "utf8")
  );
  expectRed("CU19 prod 产物里塞一份没人引用的 partial 副本 ⇒ CS2", dir, ["CS2"]);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* CU20（CS8）：prod 产物里没有 components.css —— 判不出模式 */
{
  const dir = makeSandbox("prod");
  fs.rmSync(prodOf(dir, "components.css"));
  expectRed("CU20 prod 产物里没有 components.css（判不出模式） ⇒ CS8", dir, ["CS8"]);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= 判据级负对照 CU12–CU18 与 CU21 ================= */

/* CU12：卸掉 CS1 ⇒ CU4 的注入（没人引用的源样式）必须转绿 */
{
  const id = "CU12 负对照：卸掉 CS1 判定后，CU4 的注入转绿";
  const dir = makeSandbox();
  const ok = patchSwitch(path.join(dir, "scripts", "check-css-publish.cjs"), "const CS1_ON = true;", "const CS1_ON = false;", id);
  if (ok) {
  write(srcOf(dir, "dead.css"), ".fixture-dead{color:red}\n");
    expectGreen(id, dir, "证明 CU4 那档的红确实来自 CS1 判定本身");
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

/* CU13：卸掉 CS2 ⇒ CU1 的注入（内联类死副本）必须转绿 */
{
  const id = "CU13 负对照：卸掉 CS2 判定后，CU1 的注入转绿";
  const dir = makeSandbox();
  const ok = patchSwitch(path.join(dir, "scripts", "check-css-publish.cjs"), "const CS2_ON = true;", "const CS2_ON = false;", id);
  if (ok) {
  fs.copyFileSync(srcOf(dir, "tokens.css"), prodOf(dir, "tokens.css"));
    expectGreen(id, dir, "证明 CU1 那档的红确实来自 CS2 判定本身");
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

/* CU14：卸掉 CS3 ⇒ CU2 的注入（外链类漏拷）必须转绿 */
{
  const id = "CU14 负对照：卸掉 CS3 判定后，CU2 的注入转绿";
  const dir = makeSandbox();
  const ok = patchSwitch(path.join(dir, "scripts", "check-css-publish.cjs"), "const CS3_ON = true;", "const CS3_ON = false;", id);
  if (ok) {
  fs.rmSync(prodOf(dir, "layout.css"));
    expectGreen(id, dir, "证明 CU2 那档的红确实来自 CS3 判定本身");
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

/* CU15：卸掉 CS4 ⇒ CU3 的注入（源已无的残留副本）必须转绿 */
{
  const id = "CU15 负对照：卸掉 CS4 判定后，CU3 的注入转绿";
  const dir = makeSandbox();
  const ok = patchSwitch(path.join(dir, "scripts", "check-css-publish.cjs"), "const CS4_ON = true;", "const CS4_ON = false;", id);
  if (ok) {
  write(prodOf(dir, "orphan.css"), ".fixture-orphan{color:red}\n");
    expectGreen(id, dir, "证明 CU3 那档的红确实来自 CS4 判定本身");
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

/* CU16：卸掉 CS5 ⇒ CU5 的注入（声明与磁盘对不上）必须转绿 */
{
  const id = "CU16 负对照：卸掉 CS5 判定后，CU5 的注入转绿";
  const dir = makeSandbox();
  const ok = patchSwitch(path.join(dir, "scripts", "check-css-publish.cjs"), "const CS5_ON = true;", "const CS5_ON = false;", id);
  if (ok) {
  patch(srcOf(dir, "components/index.css"), '@import url("./_nav.css");', '@import url("./_ghost.css");');
    expectGreen(id, dir, "证明 CU5 那档的红确实来自 CS5 判定本身");
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

/* CU17：卸掉 CS6 ⇒ CU7 的注入（内联类清零）必须转绿 */
{
  const id = "CU17 负对照：卸掉 CS6 判定后，CU7 的注入转绿";
  const dir = makeSandbox();
  const ok = patchSwitch(path.join(dir, "scripts", "check-css-publish.cjs"), "const CS6_ON = true;", "const CS6_ON = false;", id);
  if (ok) {
  fs.rmSync(srcOf(dir, "tokens.css"));
  patch(
    path.join(dir, "src", "_includes", "layouts", "base.njk"),
    '{% inlineCss "src/assets/css/tokens.css" %}\n',
    ""
  );
    expectGreen(id, dir, "证明 CU7 那档的红确实来自 CS6 判定本身");
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

/* CU18：卸掉 CS7 ⇒ CU10 的注入（门禁被卸掉）必须转绿 */
{
  const id = "CU18 负对照：卸掉 CS7 判定后，CU10 的注入转绿";
  const dir = makeSandbox();
  const ok = patchSwitch(path.join(dir, "scripts", "check-css-publish.cjs"), "const CS7_ON = true;", "const CS7_ON = false;", id);
  if (ok) {
  write(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "css-publish-fixture", scripts: { build: "echo build" } }, null, 2) + "\n"
  );
    expectGreen(id, dir, "证明 CU10 那档的红确实来自 CS7 判定本身");
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

/* CU21：卸掉 CS8 ⇒ CU20 的注入（prod 缺 components.css）必须转绿 */
{
  const id = "CU21 负对照：卸掉 CS8 判定后，CU20 的注入转绿";
  const dir = makeSandbox("prod");
  const ok = patchSwitch(path.join(dir, "scripts", "check-css-publish.cjs"), "const CS8_ON = true;", "const CS8_ON = false;", id);
  if (ok) {
  fs.rmSync(prodOf(dir, "components.css"));
    expectGreen(id, dir, "证明 CU20 那档的红确实来自 CS8 判定本身");
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= 覆盖度自证的反向验证 CU23–CU24 ================= */

/* CU23（自证的反向验证）：门禁源码**多**一条判据 ⇒ CU22 那道对账必须报出来 */
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mh-css-crit-"));
  const copy = path.join(dir, "check-css-publish.cjs");
  const real = criterionIdsOf(fs.readFileSync(GATE, "utf8"));
  /* 注入一个**保证不存在**的编号（真实门禁里最大的那个 + 1）——
     门禁本身若已经漂移过，这一档仍要保持绿：它验的是「检查本身灵不灵」，
     不是「门禁此刻的状态」（后者是 CU22 的活）。 */
  const fresh = `CS${Math.max(...[...real].map((x) => Number(x.slice(2)))) + 1}`;
  fs.writeFileSync(copy, fs.readFileSync(GATE, "utf8") + `\nconst ${fresh}_ON = true;\n`);
  const cmp = compareCriterionSets(criterionIdsOf(fs.readFileSync(copy, "utf8")), [...real]);
  const ok = !cmp.ok && cmp.extra.length === 1 && cmp.extra[0] === fresh && cmp.missing.length === 0;
  record(
    "CU23 反向验证：门禁多一条判据时，对账必须报出来",
    ok,
    ok
      ? `注入的 ${fresh} 被报成 extra ⇒ 门禁日后加判据而本矩阵没跟上时，自测会红`
      : `对账没按预期报出 extra=[${fresh}] ⇒ 实际 extra={${cmp.extra.join(",") || "无"}} missing={${cmp.missing.join(",") || "无"}}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* CU24（自证的反向验证）：门禁源码**少**一条判据（CS8）⇒ CU22 那道对账必须报出来 */
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mh-css-crit-"));
  const copy = path.join(dir, "check-css-publish.cjs");
  const real = criterionIdsOf(fs.readFileSync(GATE, "utf8"));
  const nums = [...real].map((x) => Number(x.slice(2))).sort((a, b) => a - b);
  const targetNum = nums[nums.length - 1];
  const target = `CS${targetNum}`;
  /* ⚠️ 顺序要紧：先把包含目标编号的区间**收缩**掉（目标恰是区间右端时最常见），
     再把剩下的目标编号改名成 CXn（CXn 不匹配 CS 前缀 ⇒ 从集合里消失）。
     反过来做的话，区间会把目标编号展开回来，注入等于没做（D71 踩过这个坑）。
     目标取「真实门禁里最大的那个编号」⇒ 门禁若已漂移过，这一档仍要保持绿
     （它验的是「检查本身灵不灵」，不是门禁此刻的状态）。 */
  let text = fs.readFileSync(GATE, "utf8");
  text = text.replace(/CS(\d{1,3})[–—]CS(\d{1,3})/g, (m, a, b) => {
    const lo = Number(a);
    const hi = Number(b);
    if (hi !== targetNum) return m;
    return hi - 1 < lo ? "" : `CS${lo}–CS${hi - 1}`;
  });
  text = text.replace(new RegExp(`CS${targetNum}(?![0-9])`, "g"), `CX${targetNum}`);
  fs.writeFileSync(copy, text);
  const cmp = compareCriterionSets(criterionIdsOf(fs.readFileSync(copy, "utf8")), [...real]);
  const ok = !cmp.ok && cmp.missing.length === 1 && cmp.missing[0] === target && cmp.extra.length === 0;
  record(
    "CU24 反向验证：门禁少一条判据时，对账必须报出来",
    ok,
    ok
      ? `注入后 ${target} 从集合里消失，被报成 missing ⇒ 门禁日后少判据而本矩阵还写着时，自测会红`
      : `对账没按预期报出 missing=[${target}] ⇒ 实际 extra={${cmp.extra.join(",") || "无"}} missing={${cmp.missing.join(",") || "无"}}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= 收尾：仓库原件没被动过 + 档位清单守卫 ================= */

const problems = [];
if (sha256(GATE) !== GATE_SHA_AT_START) {
  problems.push("仓库里的门禁原件在自测期间被改动了 —— 自测必须只在副本上注入。");
}

/* 档位清单守卫（**不算档**）：实际跑过的档位号集合 == 静态清单。
   少了任何一档（哪怕是有人整段删掉了）当场暴露 ——
   从前「少测一档，矩阵照样全绿」，谁也看不出来（D69 的教训）。 */
const ranSlots = new Set(
  results
    .map((r) => {
      const m = /^(CU\d+[a-z]?)/.exec(r.id);
      return m ? m[1] : "";
    })
    .filter(Boolean)
);
const missingSlots = EXPECTED_SLOTS.filter((s) => !ranSlots.has(s));
const extraSlots = [...ranSlots].filter((s) => !EXPECTED_SLOTS.includes(s)).sort();
if (missingSlots.length) {
  problems.push(
    `档位清单守卫：这些档位没有跑过 —— ${missingSlots.join("、")}（少跑一档 = 少证明一件事，矩阵却照样全绿）。`
  );
}
if (extraSlots.length) {
  problems.push(`档位清单守卫：这些档位不在静态清单里 —— ${extraSlots.join("、")}（清单与实跑对不上）。`);
}

/* 每条判据都必须**真的有**它自己的注入档与负对照档 ——
   映射表里写一个从不存在（或根本没跑）的档位号，覆盖就只是嘴上说说。 */
const mappedSlots = [...new Set(Object.values(CRITERION_SLOTS).flatMap((s) => [s.inject, s.negative]))];
const mappedNotRan = mappedSlots.filter((s) => !ranSlots.has(s));
if (mappedNotRan.length) {
  problems.push(
    `档位清单守卫：映射表点名的这些档位没有跑过 —— ${mappedNotRan.join("、")}（每条判据都必须真的有它自己的注入档与负对照档）。`
  );
}

if (problems.length) {
  console.error("\nCSS 发布清单门禁自测未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

const bad = results.filter((r) => !r.ok);
console.log(
  `\n档位矩阵：${results.length} 档里 ${results.length - bad.length} 档按预期触发` +
    `${bad.length ? `，${bad.length} 档未通过` : ""}` +
    `（CU12–CU18 与 CU21 是判据级负对照；CU22–CU24 是覆盖度自证）。`
);
if (bad.length) bad.forEach((b) => console.log(`  · 未通过：${b.id}`));
console.log(
  `  · 档位清单守卫：实际跑过 ${ranSlots.size} 个档位号，与静态清单（${EXPECTED_SLOTS.length} 个）完全相等。`
);
console.log("  · 原件校验：门禁的 SHA-256 与自测开始时一致。");
process.exit(bad.length ? 1 : 0);
