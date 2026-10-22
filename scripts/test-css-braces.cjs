#!/usr/bin/env node
/**
 * 自测 CB1–CB4：给 scripts/check-css-braces.cjs 的每条判据找一次「它会红」的证据
 *
 * 为什么要有这个自测（2026-10-21 的 D59 第六批）：
 *   这道门禁守的是「CSS 花括号配平」—— 少一个 } 会让后面的规则被**静默吞掉**
 *   （构建不报错、HTTP 全 200、控制台干净，只有肉眼看截图才发现）。
 *   而「门禁是绿的」有两种可能：① 它真的没问题；② 它的判据从来没被真正执行过。
 *   这两件事长得一模一样。所以每条判据都要有一档**注入**证明它会红，
 *   再有一档**负对照**证明「卸掉那一步之后确实就绿了」——否则红可能来自别处。
 *
 * 夹具怎么造（为什么不照抄真仓库）：
 *   夹具站是**最小**的，只留三样东西：
 *     <tmp>/scripts/check-css-braces.cjs   门禁副本（负对照要改它的 CB*_ON 开关与遮罩实现）
 *     <tmp>/package.json                   build 链里必须有本门禁（CB4 看这个）
 *     <tmp>/src/assets/css/fixture-*.css   两张样式表
 *   门禁的 REPO 根是「它自己所在目录的上一级」，所以副本里的它**天然**
 *   指向副本里的站，不需要任何环境变量。
 *
 *   ⚠️ 夹具里的注释**刻意不写花括号**：CB3a/N-CB3/P-CB3 三档要「破坏注释遮罩」，
 *      若夹具注释里本来就有 {，遮罩一坏 CB1 就会跟着红 ⇒ 红因归属被污染（两条判据同时红，
 *      就说不清红因到底来自哪一条了）。所以「注释里有 {」单独用 G1 档来测。
 *
 * 档位（5 档绿 + 10 档注入 + 7 档判据级负对照 + 7 档覆盖度自证 = 29 档）：
 *   G0    基线绿
 *   G1    注释里有 {                          ⇒ 绿（遮罩有效）
 *   G2    字符串里有 {                        ⇒ 绿（遮罩有效）
 *   G3    未加引号 url() 里有 {               ⇒ 绿（遮罩有效；**补之前这一档是红的**）
 *   G4    AppleDouble 侧车（._*.css）里有未配对 { ⇒ 绿（侧车必须被跳过）
 *   CB1a  第一张表少一个 }                    ⇒ CB1
 *   CB1b  第一张表多一个 }（depth = -1）       ⇒ CB1
 *   CB1c  多余的 }（depth = 0 且 minDepth < 0）⇒ CB1
 *   CB1d  **第二张**表少一个 }                ⇒ CB1（证明不是只看一张表）
 *   CB2   样式表目录被清空                    ⇒ CB2（空跑 ⇒ 判红）
 *   CB2b  样式表目录整个不在场                ⇒ CB2（目录缺失也必须判红，不能静默绿）
 *   CB3a  破坏注释遮罩                        ⇒ CB3
 *   CB3b  破坏 url() 剥离                     ⇒ CB3
 *   CB4   门禁自己被卸掉（build 链里不叫它了） ⇒ CB4
 *   CB4pkg package.json 是坏 JSON              ⇒ CB4（读不到就当没有 ⇒ 静默绿，必须判红）
 *   N-CB1 负对照：卸掉 CB1 ⇒ CB1a 的注入必须**转绿**
 *   N-CB2 负对照：卸掉 CB2 ⇒ CB2 / CB2b 的注入必须**转绿**
 *   N-CB3 负对照：卸掉 CB3 ⇒ CB3a / CB3b 的注入必须**转绿**
 *   N-CB4 负对照：卸掉 CB4 ⇒ CB4 的注入必须**转绿**
 *   P-CB3 精准性负对照：卸掉 CB3 + 破坏遮罩 + CB1a 注入 ⇒ 必须**恰好**红 CB1
 *   COV   覆盖度自证：门禁报出的文件数与夹具里真实的 .css 张数一致（不是编的）
 *   COV2a 门禁里的 fail() 调用点数 == 归属表条数
 *   COV2b 每个调用点的判据都在静态清单里
 *   COV2c 门禁解析出的判据集合 == 静态清单（**双向**）
 *   COV2d 每条归属恰好认领一个调用点
 *   COV2e 归属片段互不包含
 *   COV2f 运行时红因归属纯净（一条判据触发多条红因时逐条认领）
 *
 * ⚠️ 每档都断言「红因编号多重集**完全相等**」，不只是「包含期望的那条」——
 *   一档里出现两条判据的红，红因归属就不可判定了（那是脚本的缺陷，不是产品的缺陷）。
 *   N-CB1–N-CB4 / P-CB3 这五档负对照正是「归属纯净」的守门人。
 *
 * ⚠️ 判红/判绿档还额外断言**门禁自己的横幅**（失败横幅 / 通过横幅）：
 *   node 遇到语法错或未捕获异常也是 exit 1，只看退出码会把「门禁崩了」当成判红。
 *   横幅必须出现，才说明门禁真的跑到了它自己的结论。
 *
 * ⚠️ 本轮（D65）补的是「红因归属表」+「覆盖度自证（双向）」两件：
 *   原来的 COV 只证明「报出的文件数不是编的」，**没有**证明
 *   ① 门禁里每一条 fail() 调用点都被自测登记过（漏一条 ⇒ 自测不知道）；
 *   ② 自测登记的判据清单与门禁里实际用的判据集合**完全一致**（门禁偷偷加了 CB5、
 *      或者清单里写了门禁根本没用上的判据 ⇒ 都得露出来）。
 *   这正是 D63 / D64 场次在 check-tag-leak / check-404-depth / check-mount-contract
 *   上确立的同一套口径。
 *
 * ⚠️ 注入到**门禁副本**上的每一处改动，都额外断言「副本与原件的改动行数 = 声明值」：
 *   证明破坏确实打上了，而且只打了声明的那些行（既防「没打上」，也防「顺手多改了一行」）。
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
const GATE = path.join(ROOT, "scripts", "check-css-braces.cjs");

function sha256(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

/* 原件指纹：**自测开始时**记下来，收尾时比对 ——
   证明这一整轮注入全在副本上，仓库里的原件一个字节都没动。 */
const GATE_SHA_AT_START = sha256(GATE);

/* ================= 红因归属表 + 静态判据清单 ================= */

/**
 * 每条 fail() 调用点一行 —— 这就是「红因归属表」。
 *
 * frag = 该调用点的红因正文里一段**唯一可辨**的片段。三条用处：
 *   ① 静态：把门禁源码里的 fail() 调用点与本表**一一对应**（见 COV2 段）；
 *   ② 运行时：每条红因行必须被**恰好一条**归属认领（按片段命中）——
 *      一条都认领不到 ⇒ 出现了本表没登记过的新红因；被两条同时认领 ⇒ 归属不纯；
 *   ③ 交叉校验：归属认出的判据必须与红因行开头的编号一致（对不上 ⇒ 归属表错了）。
 *
 * ⚠️ 片段之间必须**互不包含**，否则一条红因行会被两条归属同时认领 ⇒ 归属就不纯了。
 * ⚠️ CB4 有**两个**调用点（读不到 package.json / 门禁自己被卸掉），两条红因文案不同
 *    ⇒ 用两个片段区分；它们的判据号都是 CB4 —— **一条判据可以触发多条红因**，
 *    所以「红因条数」与「判据集合」是两个量，必须分开断言。
 */
const CAUSES = [
  { id: "C1", crit: "CB1", frag: "未闭合", desc: "样式表括号不平衡（depth 与 minDepth 都要查）" },
  { id: "C2", crit: "CB2", frag: "一张样式表都扫不到", desc: "扫描面为空 ⇒ 空跑" },
  { id: "C3", crit: "CB3", frag: "遮罩自证失败", desc: "遮罩自证失败（注释 / 字符串 / url()）" },
  {
    id: "C4",
    crit: "CB4",
    frag: "读不到 package.json",
    desc: "读不到 package.json ⇒ 无法确认接在 build 链上",
  },
  {
    id: "C5",
    crit: "CB4",
    frag: "门禁自己被卸掉了",
    desc: "build 链里没有指向本门禁的 script",
  },
];

/* 静态判据清单：门禁里出现过的判据必须**恰好**是这四个（多一个少一个都露）。 */
const CRITERIA = ["CB1", "CB2", "CB3", "CB4"];

/* 门禁自己的失败 / 通过横幅 —— 用来判「门禁确实跑到了自己的结论」。
 * 少了这两条，node 遇到语法错或未捕获异常（也是 exit 1）会被当成「判红通过」。 */
const GATE_FAIL_BANNER = "CSS 括号检查未通过：";
const GATE_PASS_BANNER = "CSS 括号检查通过（";

/* ================= 夹具站 ================= */

function write(p, text) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
}

/* 样式表 A。注释里**刻意不写花括号**（理由见文件头）；带一个**加了引号**的 url()，
   好让 CB3b「破坏 url() 剥离」这一档面对的是真实现场形态。 */
const MAIN_CSS =
  [
    "/* fixture 样式表 A（注释里刻意不写花括号，理由见自测文件头） */",
    '.fixture-a { background: url("./_nav.css"); }',
    ".fixture-b { color: inherit; }",
  ].join("\n") + "\n";

/* 样式表 B：证明受检范围不止一张表 */
const SECOND_CSS = ".fixture-c { color: inherit; }\n";

function makeSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mh-css-braces-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.copyFileSync(GATE, path.join(dir, "scripts", "check-css-braces.cjs"));

  /* build 链：build → npm run check:css → node scripts/check-css-braces.cjs
     （CB4 沿这条链找「指向本门禁的 script」） */
  write(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name: "css-braces-fixture",
        scripts: {
          build: "npm run check:css",
          "check:css": "node scripts/check-css-braces.cjs",
        },
      },
      null,
      2
    ) + "\n"
  );

  write(path.join(dir, "src", "assets", "css", "fixture-main.css"), MAIN_CSS);
  write(path.join(dir, "src", "assets", "css", "fixture-second.css"), SECOND_CSS);
  return dir;
}

/* 夹具里的常用路径 */
const cssMainOf = (dir) => path.join(dir, "src", "assets", "css", "fixture-main.css");
const cssSecondOf = (dir) => path.join(dir, "src", "assets", "css", "fixture-second.css");
const cssDirOf = (dir) => path.join(dir, "src", "assets", "css");
const gateOf = (dir) => path.join(dir, "scripts", "check-css-braces.cjs");

/* ================= 跑门禁 / 解析红因 ================= */

/** 跑副本里的门禁，返回 { code, out }。 */
function runGate(dir) {
  try {
    const out = execFileSync(
      process.execPath,
      [path.join(dir, "scripts", "check-css-braces.cjs")],
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

/** 红因编号**多重集**（只认行首的「✗ 门禁 CBn：」，消息正文里出现的字样不算）。 */
function redIds(out) {
  const list = [];
  const re = /^[ \t]*✗[ \t]*门禁[ \t]+(CB\d+)/gm;
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

/* ================= 覆盖度自证用的解析器 ================= */

/**
 * 从门禁源码里解析出**全部** fail() 调用点及其判据编号（首参）。
 * 正则同时吃四种写法：多行模板字面量 / 单行模板字面量 / 双引号 / 单引号。
 * ⚠️ 必须用整文件正则而不是逐行找 `fail(` —— 多行调用（`fail(\n  "CB3",`）
 *    逐行是数不出来的。
 */
function scanFailCalls(src) {
  const calls = [];
  const re = /(?<![.\w$])fail\s*\(\s*(?:`([^`]*)`|"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const crit = m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3];
    calls.push({ index: m.index, crit: crit });
  }
  return calls;
}

/**
 * 一个归属片段落在**哪些**调用点的区间里。
 * 规则：片段必须出现在「它自己的那个调用点之后、下一个调用点之前」——
 * 落在区间外 ⇒ 它认领错了调用点（或根本没被登记）。
 * @returns {number[]} 认领了这个片段的调用点下标
 */
function ownersOfFrag(frag, calls, src) {
  const owners = [];
  let from = 0;
  for (;;) {
    const k = src.indexOf(frag, from);
    if (k < 0) break;
    from = k + 1;
    for (let i = 0; i < calls.length; i++) {
      const start = calls[i].index;
      const end = i + 1 < calls.length ? calls[i + 1].index : src.length;
      if (k > start && k < end) owners.push(i);
    }
  }
  return owners;
}

/**
 * 运行时归属：把每条红因行交给归属表认领。
 * 每行必须**恰好**被一条归属认领，且认出的判据要与行首编号一致；
 * 行首没有编号（裸红因）或认不出归属 ⇒ 这一行就是「没登记过的新红因」。
 */
function attributeRows(out) {
  const rows = out.split("\n").filter((l) => /^[ \t]*✗[ \t]*门禁[ \t]/.test(l));
  return rows.map((row) => {
    const hits = CAUSES.filter((c) => row.includes(c.frag));
    const m = /^[ \t]*✗[ \t]*门禁[ \t]+(CB\d+)/.exec(row);
    return {
      row: row,
      hits: hits.map((c) => c.id),
      crits: hits.map((c) => c.crit),
      prefix: m ? m[1] : null,
    };
  });
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

/** 副本与原件的「改动行数」—— 证明注入确实打上了，且只打了声明的那些行。 */
function changedLines(a, b) {
  const la = a.split("\n");
  const lb = b.split("\n");
  const n = Math.max(la.length, lb.length);
  let c = 0;
  for (let i = 0; i < n; i++) if (la[i] !== lb[i]) c++;
  return c;
}

/**
 * 改**门禁副本**，并断言「这一处改动恰好动了 expectDiff 行」。
 * 这一层是「破坏真的打上了吗」的自证：注入点存在不等于改动落到了预期的那一处；
 * 增量口径还保证「一处 patch 只动一行」，多改一行也会当场暴露。
 */
function patchGate(dir, from, to, expectDiff) {
  const file = gateOf(dir);
  const before = fs.readFileSync(file, "utf8");
  patch(file, from, to);
  const n = changedLines(before, fs.readFileSync(file, "utf8"));
  if (n !== expectDiff) {
    throw new Error(
      `门禁副本这一处改动的行数与声明不符（期望 ${expectDiff} 行，实际 ${n} 行）—— 已中止。\n  锚点：${from}`
    );
  }
}

/** 把门禁从 build 链上摘掉（CB4 的注入）。 */
function unwireGate(dir) {
  write(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "css-braces-fixture", scripts: { build: "echo build" } }, null, 2) +
      "\n"
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
 *        而不只是「编号对上了」（如 CB1a/b/c 三档文案不同）。
 */
function expectRed(id, dir, want, opts) {
  const o = opts || {};
  const r = runGate(dir);
  const got = redIds(r.out);
  const idsOk = sameMultiset(got, want);
  const textOk = !o.mustContain || r.out.includes(o.mustContain);
  /* 门禁必须跑到了自己的结论（横幅出现）—— 否则「门禁崩了」也是 exit 1，会被当成判红。 */
  const bannerOk = r.out.includes(GATE_FAIL_BANNER);
  /* 归属纯净：每条红因行恰好被一条归属认领，且认出的判据与行首编号一致。 */
  const rows = attributeRows(r.out);
  const attrOk =
    rows.length === got.length &&
    rows.every((row) => row.hits.length === 1 && row.crits[0] === row.prefix);
  const ok = r.code === 1 && idsOk && textOk && bannerOk && attrOk;
  record(
    id,
    ok,
    ok
      ? `红了，红因编号 = ${fmtIds(got)}（归属纯净）${o.note ? "；" + o.note : ""}`
      : `期望红因 ${fmtIds(want)} 且只有这些` +
        `${o.mustContain ? `、文案含「${o.mustContain}」` : ""}` +
        `${bannerOk ? "" : "、且须出现门禁失败横幅"}` +
        `${attrOk ? "" : "、且每条红因行恰好被一条归属认领"}` +
        `，实际 code=${r.code} 红因 ${fmtIds(got)}` +
        `归属 ${rows.map((x) => `${x.prefix}<-${x.hits.join("+") || "无"}`).join(" / ")}\n${r.out}`
  );
}

/** 一档「负对照：卸掉某条判定 ⇒ 应当完全转绿，一个红因都不许剩」。 */
function expectGreen(id, dir, note) {
  const r = runGate(dir);
  const got = redIds(r.out);
  const bannerOk = r.out.includes(GATE_PASS_BANNER);
  const ok = r.code === 0 && got.length === 0 && bannerOk;
  record(
    id,
    ok,
    ok
      ? `转绿了，红因一个不剩${note ? "；" + note : ""}`
      : `仍然红（code=${r.code}）红因 ${fmtIds(got)}` +
        `${bannerOk ? "" : "（且缺少门禁通过横幅）"} ⇒ 负对照不成立\n${r.out}`
  );
}

/** 一档「绿档」：门禁应当 exit 0 且一个红因都不许有。 */
function expectGreenBaseline(id, dir, note) {
  const r = runGate(dir);
  const got = redIds(r.out);
  const bannerOk = r.out.includes(GATE_PASS_BANNER);
  const ok = r.code === 0 && got.length === 0 && bannerOk;
  record(
    id,
    ok,
    ok
      ? `绿${note ? "；" + note : ""}`
      : `不该红，却 exit ${r.code}，红因 ${fmtIds(got)}` +
        `${bannerOk ? "" : "（且缺少门禁通过横幅）"}\n${r.out}`
  );
}

/* ================= G0：基线（绿） ================= */

{
  const dir = makeSandbox();
  expectGreenBaseline("G0 基线（夹具站上）", dir, "两张样式表都配平、遮罩有效、门禁接在 build 链上");
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= G1–G4：遮罩相关的绿档 ================= */

/* G1：注释里有 { —— 必须被跳过，否则门禁会把注释里的花括号当成规则结构（假阳性）。 */
{
  const dir = makeSandbox();
  fs.appendFileSync(cssMainOf(dir), "\n/* 注释里的 { 不该被计入 */\n");
  expectGreenBaseline("G1 注释里有 { ⇒ 绿（遮罩有效）", dir);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* G2：字符串里有 { —— 同理。 */
{
  const dir = makeSandbox();
  fs.appendFileSync(cssMainOf(dir), '\n.fixture-d { content: "{"; }\n');
  expectGreenBaseline("G2 字符串里有 { ⇒ 绿（遮罩有效）", dir);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* G3：未加引号的 url(data:…) 里有 { ——
   ⚠️ 这一档**补之前是红的**：旧门禁只剥字符串与注释，不剥 url()，
   而文件头却声称「跳过 url() 里的 data URI」⇒ 文档说假话。
   这一档就是那句假话的证伪现场。 */
{
  const dir = makeSandbox();
  fs.appendFileSync(
    cssMainOf(dir),
    "\n.fixture-e { background: url(data:image/svg+xml;utf8,<svg>{); }\n"
  );
  expectGreenBaseline("G3 未加引号 url() 里有 { ⇒ 绿（补之前这一档是红的）", dir);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* G4：AppleDouble 侧车（._*.css）里有未配对的 { —— 必须被跳过。
   侧车是二进制，头部随机字节里可能含一个未闭合的 {，
   不跳过的话脚本会**失败退出并指向一个用户从没写过的文件**，极具误导性。 */
{
  const dir = makeSandbox();
  write(path.join(cssDirOf(dir), "._fixture-side.css"), "{\n\x00\x01binary-ish\n");
  expectGreenBaseline("G4 AppleDouble 侧车里有未配对的 { ⇒ 绿（侧车被跳过）", dir);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= 注入档 CB1a–CB1d ================= */

/* CB1a：少一个 } —— depth = 1 */
{
  const dir = makeSandbox();
  patch(cssMainOf(dir), ".fixture-b { color: inherit; }", ".fixture-b { color: inherit;");
  expectRed("CB1a 第一张表少一个 } ⇒ CB1", dir, ["CB1"], {
    mustContain: "未闭合 1 个 {",
    note: "少一个 } 会让后面的规则被静默吞掉",
  });
  fs.rmSync(dir, { recursive: true, force: true });
}

/* CB1b：多一个 } —— depth = -1 */
{
  const dir = makeSandbox();
  fs.appendFileSync(cssMainOf(dir), "\n}\n");
  expectRed("CB1b 第一张表多一个 } ⇒ CB1", dir, ["CB1"], { mustContain: "多出 1 个 }" });
  fs.rmSync(dir, { recursive: true, force: true });
}

/* CB1c：多余的 } —— 开合**总数相等**，但中途深度为负（depth = 0 且 minDepth < 0）。
   形态：末尾规则少了一个收尾 }，同时前面多了一个孤立的 }。
   这一档专门覆盖「只看最终 depth 会漏掉」的那种形态 —— 门禁必须同时查 minDepth。 */
{
  const dir = makeSandbox();
  fs.appendFileSync(cssMainOf(dir), "\n} .fixture-d { color: inherit;\n");
  expectRed("CB1c 多余的 }（depth=0 且 minDepth<0）⇒ CB1", dir, ["CB1"], {
    mustContain: "多余的 }",
    note: "开合总数相等，只看最终 depth 会漏掉这一类",
  });
  fs.rmSync(dir, { recursive: true, force: true });
}

/* CB1d：**第二张**表少一个 } —— 证明受检范围是全部样式表，不只是第一张。 */
{
  const dir = makeSandbox();
  patch(cssSecondOf(dir), ".fixture-c { color: inherit; }", ".fixture-c { color: inherit;");
  expectRed("CB1d 第二张表少一个 } ⇒ CB1（证明不是只看一张表）", dir, ["CB1"], {
    mustContain: "fixture-second.css",
  });
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= 注入档 CB2 / CB2b ================= */

/* CB2：样式表目录还在，但里面一张表都没有 ⇒ 空跑 ⇒ 判红。
   ⚠️ 补之前门禁此时会打印「通过（0 个文件）」并 exit 0
   ⇒ 目录一旦被清空，这道护栏就静默地不再护栏，而 build 照样全绿。 */
{
  const dir = makeSandbox();
  fs.rmSync(cssMainOf(dir), { force: true });
  fs.rmSync(cssSecondOf(dir), { force: true });
  expectRed("CB2 样式表目录被清空（扫不到任何表）⇒ CB2（空跑判红）", dir, ["CB2"]);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* CB2b：整个样式表目录不在场 ⇒ 同样必须判红，不能因为「读不到目录」就静默绿。 */
{
  const dir = makeSandbox();
  fs.rmSync(cssDirOf(dir), { recursive: true, force: true });
  expectRed("CB2b 样式表目录整个不在场 ⇒ CB2", dir, ["CB2"]);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= 注入档 CB3a / CB3b ================= */

/* CB3a：破坏**注释遮罩** —— 注释分支不再跳过注释内容。
   注意：夹具的注释里没有花括号（见文件头），所以遮罩一坏只有 CB3 红、CB1 仍然绿
   ⇒ 红因归属纯净。 */
{
  const dir = makeSandbox();
  patchGate(
    dir,
    "      i = end === -1 ? src.length : end + 2;",
    "      i += 1; // 破坏：注释内容不再被跳过",
    1
  );
  expectRed("CB3a 破坏注释遮罩 ⇒ CB3", dir, ["CB3"], {
    mustContain: "遮罩自证失败",
  });
  fs.rmSync(dir, { recursive: true, force: true });
}

/* CB3b：破坏 **url() 剥离** —— url() 里的内容不再被跳过。 */
{
  const dir = makeSandbox();
  patchGate(
    dir,
    "  return out.replace(/url\\([^)]*\\)/g, \" \");",
    "  return out; // 破坏：url() 里的内容不再被跳过",
    1
  );
  expectRed("CB3b 破坏 url() 剥离 ⇒ CB3", dir, ["CB3"], {
    mustContain: "遮罩自证失败",
  });
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= 注入档 CB4 ================= */

/* CB4：门禁自己被卸掉（build 链里不叫它了） */
{
  const dir = makeSandbox();
  unwireGate(dir);
  expectRed("CB4 门禁自己被卸掉（build 链里不叫它了）⇒ CB4", dir, ["CB4"], {
    mustContain: "门禁自己被卸掉了",
  });
  fs.rmSync(dir, { recursive: true, force: true });
}

/* CB4pkg：package.json **存在但内容是坏 JSON** ⇒ 门禁必须判红 CB4。
 * ⚠️ 为什么单独造这一档：CB4 有**两个**调用点（读不到 package.json /
 *    门禁自己被卸掉）。只测后者 ⇒ 前者那条红因就永远没人证明过；
 *    而「package.json 坏了就当它不存在」正是最容易被写成静默绿的地方。 */
{
  const dir = makeSandbox();
  write(path.join(dir, "package.json"), '{ "scripts": { "build": "npm run check:css" \n');
  expectRed("CB4pkg package.json 是坏 JSON ⇒ CB4", dir, ["CB4"], {
    mustContain: "读不到 package.json",
    note: "CB4 的另一个调用点也必须能被触发",
  });
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= 判据级负对照 N-CB1–N-CB4 ================= */

/* N-CB1：卸掉 CB1 ⇒ CB1a 的注入必须转绿 */
{
  const dir = makeSandbox();
  patchGate(dir, "const CB1_ON = true;", "const CB1_ON = false;", 1);
  patch(cssMainOf(dir), ".fixture-b { color: inherit; }", ".fixture-b { color: inherit;");
  expectGreen(
    "N-CB1 负对照：卸掉 CB1 判定后，CB1a 的注入转绿",
    dir,
    "证明 CB1a 那档的红确实来自 CB1 判定本身"
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* N-CB2：卸掉 CB2 ⇒ CB2 / CB2b 的注入必须转绿 */
{
  const dir = makeSandbox();
  patchGate(dir, "const CB2_ON = true;", "const CB2_ON = false;", 1);
  fs.rmSync(cssMainOf(dir), { force: true });
  fs.rmSync(cssSecondOf(dir), { force: true });
  expectGreen(
    "N-CB2 负对照：卸掉 CB2 判定后，CB2 的注入转绿",
    dir,
    "证明 CB2 那档的红确实来自 CB2 判定本身"
  );
  fs.rmSync(dir, { recursive: true, force: true });
}
{
  const dir = makeSandbox();
  patchGate(dir, "const CB2_ON = true;", "const CB2_ON = false;", 1);
  fs.rmSync(cssDirOf(dir), { recursive: true, force: true });
  expectGreen(
    "N-CB2 负对照：卸掉 CB2 判定后，CB2b 的注入转绿",
    dir,
    "证明 CB2b 那档的红确实来自 CB2 判定本身"
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* N-CB3：卸掉 CB3 ⇒ CB3a / CB3b 的注入必须转绿 */
{
  const dir = makeSandbox();
  patchGate(dir, "const CB3_ON = true;", "const CB3_ON = false;", 1);
  patchGate(
    dir,
    "      i = end === -1 ? src.length : end + 2;",
    "      i += 1; // 破坏：注释内容不再被跳过",
    1
  );
  expectGreen(
    "N-CB3 负对照：卸掉 CB3 判定后，CB3a 的注入转绿",
    dir,
    "证明 CB3a 那档的红确实来自 CB3 判定本身"
  );
  fs.rmSync(dir, { recursive: true, force: true });
}
{
  const dir = makeSandbox();
  patchGate(dir, "const CB3_ON = true;", "const CB3_ON = false;", 1);
  patchGate(
    dir,
    "  return out.replace(/url\\([^)]*\\)/g, \" \");",
    "  return out; // 破坏：url() 里的内容不再被跳过",
    1
  );
  expectGreen(
    "N-CB3 负对照：卸掉 CB3 判定后，CB3b 的注入转绿",
    dir,
    "证明 CB3b 那档的红确实来自 CB3 判定本身"
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* N-CB4：卸掉 CB4 ⇒ CB4 的注入必须转绿 */
{
  const dir = makeSandbox();
  patchGate(dir, "const CB4_ON = true;", "const CB4_ON = false;", 1);
  unwireGate(dir);
  expectGreen(
    "N-CB4 负对照：卸掉 CB4 判定后，CB4 的注入转绿",
    dir,
    "证明 CB4 那档的红确实来自 CB4 判定本身"
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= P-CB3：精准性负对照 ================= */

/* 卸掉 CB3 + 破坏注释遮罩 + 塞一个 CB1 注入 ⇒ 必须**恰好**红 CB1。
   这档证明两件事：① CB1 与 CB3 的判定互不越界；
   ② 遮罩被破坏这件事在 CB3 被卸掉之后，就**不该**再有任何判据替它说话。 */
{
  const dir = makeSandbox();
  patchGate(dir, "const CB3_ON = true;", "const CB3_ON = false;", 1);
  patchGate(
    dir,
    "      i = end === -1 ? src.length : end + 2;",
    "      i += 1; // 破坏：注释内容不再被跳过",
    1
  );
  patch(cssMainOf(dir), ".fixture-b { color: inherit; }", ".fixture-b { color: inherit;");
  expectRed("P-CB3 精准性负对照：卸 CB3 + 破坏遮罩 + CB1 注入 ⇒ 恰好红 CB1", dir, ["CB1"], {
    mustContain: "未闭合 1 个 {",
    note: "CB3 被卸掉后不应再有第二条判据替它说话",
  });
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= COV：覆盖度自证 ================= */

/* 门禁报出的文件数必须与夹具里真实的 .css 张数一致（且 ≥ 1）——
   证明它真的在数文件，而不是打印一个凑出来的数字。 */
{
  const dir = makeSandbox();
  const r = runGate(dir);
  const m = /CSS 括号检查通过（(\d+) 个文件）/.exec(r.out);
  const n = m ? Number(m[1]) : -1;
  const actual = fs
    .readdirSync(cssDirOf(dir))
    .filter((n) => n.endsWith(".css") && !n.startsWith("._")).length;
  const ok = r.code === 0 && n >= 1 && n === actual;
  record(
    "COV 覆盖度自证：报出的文件数与真实张数一致",
    ok,
    ok
      ? `报出 ${n} 个文件，夹具里真实 ${actual} 张（不是编的数字）`
      : `报出 ${n}，真实 ${actual}，code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= COV2：覆盖度自证（双向） ================= */

/* 这一段回答一个问题：**门禁里到底有几条判据、每条判据在源码里被调用了几次，
   自测知不知道？**
   上面的 COV 只证明了「报出的文件数不是编的」，没回答这个问题 ⇒ 本轮补上。
 *
 * 六条互相独立的断言（缺一条就露一个洞）：
 *   COV2a 门禁里的 fail() 调用点数 == 归属表条数（多一条少一条都露）
 *   COV2b 每个调用点的判据都在静态清单里（清单外的新判据会露）
 *   COV2c 门禁解析出的判据集合 == 静态清单（**双向**：门禁多出来的、
 *          清单里写了门禁却没用上的，两边都会露）
 *   COV2d 每条归属恰好认领一个调用点（片段必须落在它自己的调用点区间里）
 *   COV2e 归属片段互不包含（否则一条红因行会被两条归属同时认领 ⇒ 归属不纯）
 *   COV2f 运行时归属纯净（一条判据触发多条红因时，每条红因行都恰好被一条归属认领）
 */
{
  const src = fs.readFileSync(GATE, "utf8");
  const calls = scanFailCalls(src);

  record(
    "COV2a 门禁的 fail() 调用点数 == 归属表条数",
    calls.length === CAUSES.length,
    calls.length === CAUSES.length
      ? `${calls.length} 个调用点 ↔ ${CAUSES.length} 条归属`
      : `解析出 ${calls.length} 个调用点，归属表登记了 ${CAUSES.length} 条`
  );

  const stray = calls.filter((c) => CRITERIA.indexOf(c.crit) < 0);
  record(
    "COV2b 每个调用点的判据都在静态清单里",
    stray.length === 0,
    stray.length === 0
      ? `调用点的判据：${calls.map((c) => c.crit).join(" / ")}`
      : `清单外的判据：${stray.map((c) => c.crit).join(" / ")}`
  );

  const gateSet = [...new Set(calls.map((c) => c.crit))].sort();
  const listSet = [...new Set(CRITERIA)].sort();
  record(
    "COV2c 门禁解析出的判据集合 == 静态清单（双向）",
    gateSet.length === listSet.length && gateSet.every((x, i) => x === listSet[i]),
    gateSet.join(",") === listSet.join(",")
      ? `判据集合 = {${gateSet.join(", ")}}`
      : `门禁 = {${gateSet.join(", ")}}，清单 = {${listSet.join(", ")}}`
  );

  /* 每条归属的片段必须落在「它自己的那个调用点」后面、下一个调用点前面。 */
  const pairing = CAUSES.map((c) => {
    const owners = ownersOfFrag(c.frag, calls, src);
    const ownerCall = owners.length === 1 ? calls[owners[0]] : null;
    return { c, owners, ok: owners.length === 1 && !!ownerCall && ownerCall.crit === c.crit };
  });
  const badPair = pairing.filter((p) => !p.ok);
  record(
    "COV2d 每条归属恰好认领一个调用点",
    badPair.length === 0,
    badPair.length === 0
      ? pairing.map((p) => `${p.c.id}→${p.c.crit}`).join(" / ")
      : badPair.map((p) => `${p.c.id}(${p.c.crit}) 认领了 ${p.owners.length} 个调用点`).join(" / ")
  );

  const fragClash = [];
  for (let i = 0; i < CAUSES.length; i++) {
    for (let j = i + 1; j < CAUSES.length; j++) {
      const a = CAUSES[i].frag;
      const b = CAUSES[j].frag;
      if (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) fragClash.push(`${CAUSES[i].id}/${CAUSES[j].id}`);
    }
  }
  record(
    "COV2e 归属片段互不包含",
    fragClash.length === 0,
    fragClash.length === 0
      ? `${CAUSES.length} 段片段互不包含`
      : `互相包含：${fragClash.join(" / ")}`
  );
}

/* COV2f：运行时归属纯净 —— **一条判据触发多条红因**时，每条红因行都要各自认领。
 * 这一档故意把**两张**表都打破 ⇒ CB1 触发两次 ⇒ 两行红因，两行都必须被 C1 认领，
 * 且认出的判据与行首编号一致。 */
{
  const dir = makeSandbox();
  patch(cssMainOf(dir), ".fixture-b { color: inherit; }", ".fixture-b { color: inherit;");
  patch(cssSecondOf(dir), ".fixture-c { color: inherit; }", ".fixture-c { color: inherit;");
  const r = runGate(dir);
  const rows = attributeRows(r.out);
  const got = redIds(r.out);
  const ok =
    r.code === 1 &&
    got.length === 2 &&
    rows.length === 2 &&
    rows.every((row) => row.hits.length === 1 && row.crits[0] === row.prefix && row.prefix === "CB1");
  record(
    "COV2f 运行时红因归属纯净（一条判据触发多条红因时逐条认领）",
    ok,
    ok
      ? `2 条红因行都被 C1 认领，行首编号与归属判据一致`
      : `code=${r.code} 红因 ${fmtIds(got)}，归属=${rows
          .map((x) => `${x.prefix}<-${x.hits.join("+") || "无"}`)
          .join(" / ")}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= 收尾：仓库原件没被动过 ================= */

const problems = [];
if (sha256(GATE) !== GATE_SHA_AT_START) {
  problems.push("仓库里的门禁原件在自测期间被改动了 —— 自测必须只在副本上注入。");
}

if (problems.length) {
  console.error("\nCSS 括号门禁自测未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

const bad = results.filter((r) => !r.ok);
console.log(
  `\n自测矩阵：${results.length} 档里 ${results.length - bad.length} 档按预期触发` +
    `${bad.length ? `，${bad.length} 档未通过` : ""}` +
    `（N-CB1–N-CB4、P-CB3 是判据级负对照；COV / COV2 是覆盖度自证）。`
);
if (bad.length) bad.forEach((b) => console.log(`  · 未通过：${b.id}`));
console.log("  · 原件校验：门禁的 SHA-256 与自测开始时一致。");
process.exit(bad.length ? 1 : 0);
