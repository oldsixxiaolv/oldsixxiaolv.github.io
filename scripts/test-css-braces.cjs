#!/usr/bin/env node
/**
 * 自测 CB0–CB19：给 scripts/check-css-braces.cjs 的每条判据找一次「它会红」的证据
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
 * 档位（5 档绿 + 9 档注入 + 7 档判据级负对照 + 1 档覆盖度自证 = 22 档）：
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
 *   N-CB1 负对照：卸掉 CB1 ⇒ CB1a 的注入必须**转绿**
 *   N-CB2 负对照：卸掉 CB2 ⇒ CB2 / CB2b 的注入必须**转绿**
 *   N-CB3 负对照：卸掉 CB3 ⇒ CB3a / CB3b 的注入必须**转绿**
 *   N-CB4 负对照：卸掉 CB4 ⇒ CB4 的注入必须**转绿**
 *   P-CB3 精准性负对照：卸掉 CB3 + 破坏遮罩 + CB1a 注入 ⇒ 必须**恰好**红 CB1
 *   COV   覆盖度自证：门禁报出的文件数与夹具里真实的 .css 张数一致（不是编的）
 *
 * ⚠️ 每档都断言「红因编号多重集**完全相等**」，不只是「包含期望的那条」——
 *   一档里出现两条判据的红，红因归属就不可判定了（那是脚本的缺陷，不是产品的缺陷）。
 *   N-CB1–N-CB4 / P-CB3 这五档负对照正是「归属纯净」的守门人。
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
function expectGreen(id, dir, note) {
  const r = runGate(dir);
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
function expectGreenBaseline(id, dir, note) {
  const r = runGate(dir);
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
  `\n注入矩阵：${results.length} 档里 ${results.length - bad.length} 档按预期触发` +
    `${bad.length ? `，${bad.length} 档未通过` : ""}` +
    `（N-CB1–N-CB4、P-CB3 是判据级负对照）。`
);
if (bad.length) bad.forEach((b) => console.log(`  · 未通过：${b.id}`));
console.log("  · 原件校验：门禁的 SHA-256 与自测开始时一致。");
process.exit(bad.length ? 1 : 0);
