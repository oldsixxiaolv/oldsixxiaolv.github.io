#!/usr/bin/env node
/**
 * 自测 W0–W23：给 scripts/check-wrapping.cjs 的每条判据找一次「它会红」的证据
 *
 * 为什么要有这个自测（2026-10-21 的 D59 第七批）：
 *   这道门禁守的是「一条长 DOI / 长 URL 不能把窄屏页面撑破」——
 *   overflow-wrap 写成 break-word 之后**页面看不出差别**，只有真出事那天才会爆。
 *   而「门禁是绿的」有两种可能：① 它真的没问题；② 它的判据从来没被真正执行过。
 *   这两件事长得一模一样。所以每条判据都要有一档**注入**证明它会红，
 *   再有一档**负对照**证明「卸掉那一步之后确实就绿了」——否则红可能来自别处。
 *
 * ⚠️ 本批还堵上了这道门禁**自己身上的两个真洞**（实测出来的，不是推演的）：
 *   ① **级联洞**：旧门禁只读一条规则里的**第一条** overflow-wrap 声明，
 *      而 CSS 是**后写覆盖先写** ⇒
 *      `p { overflow-wrap: anywhere; overflow-wrap: break-word; }` 实际生效值是
 *      break-word，旧门禁读成 anywhere ⇒ **放行**，还打印「其中无 break-word」——
 *      一句明确的假话。对应档位：**W2a**（补之前这一档是绿的）。
 *   ② **!important 假阳性**：`overflow-wrap: anywhere !important` 是合法写法，
 *      旧门禁把整串当值去比对 ⇒ 误报。对应档位：**G1 / G5**（补之前这两档是红的）。
 *
 * 夹具怎么造（为什么不照抄真仓库）：
 *   夹具站是**最小**的，只留三样东西：
 *     <tmp>/scripts/check-wrapping.cjs   门禁副本（负对照要改它的 W*_ON 开关与解析器）
 *     <tmp>/package.json                   build 链里必须有本门禁（W3 看这个）
 *     <tmp>/src/assets/css/fixture.css     一张样式表（带全局兜底规则）
 *     <tmp>/src/fixture.njk                 一个模板（内含 1 个 <style> 块 + 1 处 style 属性）
 *   门禁的 ROOT 根是「它自己所在目录的上一级」，所以副本里的它**天然**
 *   指向副本里的站，不需要任何环境变量。
 *
 *   ⚠️ 夹具里刻意**不放**任何 break-word（除非那一档就是要注入它）：
 *      否则 W2 会跟着红 ⇒ 红因归属被污染（两条判据同时红，
 *      就说不清红因到底来自哪一条了）。
 *
 * 档位（6 档绿 + 11 档注入 + 4 档判据级负对照 + 1 档精准性负对照 + 2 档覆盖度自证 = 24 档）：
 *   G0    基线绿
 *   G1    CSS 里写 `overflow-wrap: anywhere !important`   ⇒ 绿（**补之前是红的**）
 *   G2    同块里先 break-word 后 anywhere（合法末位覆盖） ⇒ 绿（**补之前是红的**）
 *   G3    注释里写 break-word                              ⇒ 绿（注释不算声明）
 *   G4    AppleDouble 侧车（._*.css）里有 break-word      ⇒ 绿（侧车必须被跳过）
 *   G5    模板内联 <style> 里写 !important                ⇒ 绿（补之前是红的）
 *   W1a   完全没有全局兜底规则                            ⇒ W1
 *   W1b   全局兜底规则缺一个标签类型                      ⇒ W1
 *   W1c   全局兜底规则用 break-all 而不是 anywhere        ⇒ W1
 *   W2a   同块里末位是 break-word（级联洞）               ⇒ W2（**补之前是绿的**）
 *   W2b   模板内联 <style> 里有 break-word                ⇒ W2
 *   W2c   模板 style="..." 属性里有 break-word            ⇒ W2
 *   W2d   inlineCss 引用了 src/assets/css/ 之外的文件     ⇒ W2
 *   W2e   overflow-wrap: normal（非法兜底值）             ⇒ W2
 *   W3    门禁自己被卸掉（build 链里走不到它）             ⇒ W3
 *   W4a   破坏解析器（改成读第一条声明）                  ⇒ W4
 *   W4b   破坏解析器（不剥离 !important）                  ⇒ W4
 *   N-W1 负对照：卸掉 W1 ⇒ W1a 的注入必须**转绿**
 *   N-W2 负对照：卸掉 W2 ⇒ W2a 的注入必须**转绿**
 *   N-W3 负对照：卸掉 W3 ⇒ W3 的注入必须**转绿**
 *   N-W4 负对照：卸掉 W4 ⇒ W4a 的注入必须**转绿**
 *   P-W4 精准性负对照：卸掉 W4 + 破坏解析器 + W2e 注入 ⇒ 必须**恰好**红 W2
 *   COV-A 覆盖度自证：门禁报出的三类扫描数量与夹具真实数量一致（不是编的）
 *   COV-B 覆盖度自证：门禁源码里 W1–W4 每条都有红因出口与可卸开关（现读源码）
 *
 * ⚠️ 每档都断言「红因编号多重集**完全相等**」，不只是「包含期望的那条」——
 *   一档里出现两条判据的红，红因归属就不可判定了（那是脚本的缺陷，不是产品的缺陷）。
 *   N-W1–N-W4 / P-W4 这五档负对照正是「归属纯净」的守门人。
 *
 * ⚠️ 注入到**门禁副本 / 夹具文件**上的每一处改动，都额外断言「改动行数 = 声明值」：
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
const GATE = path.join(ROOT, "scripts", "check-wrapping.cjs");

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

/* 全局兜底规则：一条规则覆盖全部 12 种承载文字的元素类型，用 anywhere。
   这是 W1 要找的那条规则；各档注入就动它。 */
const GLOBAL_RULE =
  "p, li, dd, dt, td, th, figcaption, blockquote, pre, code, a, span { overflow-wrap: anywhere; }";

const FIXTURE_CSS = ["/* fixture 样式表 */", ".fixture-plain { color: inherit; }", GLOBAL_RULE].join(
  "\n"
) + "\n";

/* 模板：1 处 style 属性 + 1 个内联 <style> 块（都干净，交给绿档与各条腿的注入）。 */
const FIXTURE_NJK = [
  '<p style="color: inherit">hello</p>',
  "<style>",
  "  .fixture-inline { color: inherit; }",
  "</style>",
].join("\n") + "\n";

function makeSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mh-wrapping-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.copyFileSync(GATE, path.join(dir, "scripts", "check-wrapping.cjs"));

  /* build 链：build → npm run check:wrap → node scripts/check-wrapping.cjs
     （W3 沿这条链找「指向本门禁的 script」） */
  write(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name: "wrapping-fixture",
        scripts: {
          build: "npm run check:wrap",
          "check:wrap": "node scripts/check-wrapping.cjs",
        },
      },
      null,
      2
    ) + "\n"
  );

  write(path.join(dir, "src", "assets", "css", "fixture.css"), FIXTURE_CSS);
  write(path.join(dir, "src", "fixture.njk"), FIXTURE_NJK);
  return dir;
}

/* 夹具里的常用路径 */
const cssOf = (dir) => path.join(dir, "src", "assets", "css", "fixture.css");
const njkOf = (dir) => path.join(dir, "src", "fixture.njk");
const gateOf = (dir) => path.join(dir, "scripts", "check-wrapping.cjs");

/* ================= 跑门禁 / 解析红因 ================= */

/** 跑副本里的门禁，返回 { code, out }。 */
function runGate(dir) {
  try {
    const out = execFileSync(
      process.execPath,
      [path.join(dir, "scripts", "check-wrapping.cjs")],
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

/** 红因编号**多重集**（只认行首的「✗ 门禁 Wn：」，消息正文里出现的字样不算）。 */
function redIds(out) {
  const list = [];
  const re = /^[ \t]*✗[ \t]*门禁[ \t]+(W\d+)/gm;
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
 * 这一层是「破坏真的打上了吗」的自证：注入点存在不等于改动落到了预期的那一处；
 * 增量口径还保证「一处 patch 只动一行」，多改一行也会当场暴露。
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

/**
 * 在文件末尾追加若干行，并断言「恰好追加了 expectLines 行、且前面的内容一个字没动」。
 * 追加的口径与替换不同：替换看「改动行数」，追加看「新增行数」
 * （文件末尾那个换行槽位不算内容行，所以不能拿改动行数去比）。
 */
function appendFile(file, text, expectLines) {
  const before = fs.readFileSync(file, "utf8");
  fs.appendFileSync(file, text);
  const after = fs.readFileSync(file, "utf8");
  const added = text.split("\n").length - 1;
  const untouched = after.slice(0, before.length) === before && after.slice(before.length) === text;
  if (added !== expectLines || !untouched) {
    throw new Error(
      `这一处追加与声明不符（期望新增 ${expectLines} 行，实际 ${added} 行；` +
        `前面内容未被动过：${untouched}）—— 已中止。\n  追加：${text}`
    );
  }
}

/** 改**门禁副本**，并断言「这一处改动恰好动了 expectDiff 行」。 */
function patchGate(dir, from, to, expectDiff) {
  patchFile(gateOf(dir), from, to, expectDiff);
}

/** 把门禁从 build 链上摘掉（W3 的注入）：build 不再能走到本门禁。 */
function unwireGate(dir) {
  write(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "wrapping-fixture", scripts: { build: "echo build" } }, null, 2) +
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
 *        而不只是「编号对上了」（如 W1a/b/c 三档文案不同）。
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
  expectGreenBaseline("G0 基线（夹具站上）", dir, "全局兜底齐全、样式干净、门禁接在 build 链上");
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= G1–G5：绿档 ================= */

/* G1：`overflow-wrap: anywhere !important` 是完全合法的写法 ⇒ 必须判绿。
   ⚠️ 这一档**补之前是红的**：旧门禁把整串当值去比对，
   判成「不是受支持的兜底值」⇒ 误报。 */
{
  const dir = makeSandbox();
  patchFile(
    cssOf(dir),
    ".fixture-plain { color: inherit; }",
    ".fixture-plain { overflow-wrap: anywhere !important; }",
    1
  );
  expectGreenBaseline("G1 `anywhere !important` ⇒ 绿（补之前这一档是红的）", dir);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* G2：同一声明块里先 break-word 后 anywhere —— 末位生效，合法 ⇒ 必须判绿。
   ⚠️ 这一档**补之前也是红的**：旧门禁只读第一条（break-word）⇒ 误报。 */
{
  const dir = makeSandbox();
  patchFile(
    cssOf(dir),
    ".fixture-plain { color: inherit; }",
    ".fixture-plain { overflow-wrap: break-word; overflow-wrap: anywhere; }",
    1
  );
  expectGreenBaseline("G2 同块里先 break-word 后 anywhere ⇒ 绿（补之前这一档是红的）", dir);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* G3：注释里写 break-word —— 注释不是声明 ⇒ 判绿。 */
{
  const dir = makeSandbox();
  appendFile(cssOf(dir), "/* 这里写着 overflow-wrap: break-word，只是注释 */\n", 1);
  expectGreenBaseline("G3 注释里的 break-word ⇒ 绿（注释不算声明）", dir);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* G4：AppleDouble 侧车（._*.css）里有 break-word —— 侧车必须被跳过。
   侧车是二进制，内容不可控，不跳过的话门禁会指向一个用户从没写过的文件。 */
{
  const dir = makeSandbox();
  write(path.join(dir, "src", "assets", "css", "._fixture-side.css"), "x{overflow-wrap:break-word}\n");
  expectGreenBaseline("G4 AppleDouble 侧车里有 break-word ⇒ 绿（侧车被跳过）", dir);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* G5：模板内联 <style> 里写 !important —— 合法写法在模板这条腿上也得判绿。 */
{
  const dir = makeSandbox();
  patchFile(
    njkOf(dir),
    "  .fixture-inline { color: inherit; }",
    "  .fixture-inline { overflow-wrap: anywhere !important; }",
    1
  );
  expectGreenBaseline("G5 模板内联 <style> 里的 !important ⇒ 绿（补之前这一档是红的）", dir);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= 注入档 W1a–W1c ================= */

/* W1a：完全没有全局兜底规则。 */
{
  const dir = makeSandbox();
  patchFile(cssOf(dir), GLOBAL_RULE, ".fixture-other { color: inherit; }", 1);
  expectRed("W1a 完全没有全局兜底规则 ⇒ W1", dir, ["W1"], {
    mustContain: "找不到",
    note: "全局兜底没了，窄屏上的长串没人挡",
  });
  fs.rmSync(dir, { recursive: true, force: true });
}

/* W1b：全局兜底规则少覆盖一种元素类型（这里少了 span）。 */
{
  const dir = makeSandbox();
  patchFile(
    cssOf(dir),
    "pre, code, a, span { overflow-wrap: anywhere; }",
    "pre, code, a { overflow-wrap: anywhere; }",
    1
  );
  expectRed("W1b 全局兜底规则缺一种标签类型 ⇒ W1", dir, ["W1"], {
    mustContain: "没有覆盖",
  });
  fs.rmSync(dir, { recursive: true, force: true });
}

/* W1c：全局兜底规则用 break-all —— 它在允许值里，但**不是** anywhere。 */
{
  const dir = makeSandbox();
  patchFile(
    cssOf(dir),
    "figcaption, blockquote, pre, code, a, span { overflow-wrap: anywhere; }",
    "figcaption, blockquote, pre, code, a, span { overflow-wrap: break-all; }",
    1
  );
  expectRed("W1c 全局兜底规则用 break-all 而不是 anywhere ⇒ W1", dir, ["W1"], {
    mustContain: "应当是 anywhere",
  });
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= 注入档 W2a–W2e ================= */

/* W2a：同一声明块里**末位**是 break-word —— CSS 级联下它就是生效值。
   ⚠️ 这一档**补之前是绿的**：旧门禁只读第一条（anywhere）⇒ 把一个
   照样挡不住长串的规则放行了，还打印「其中无 overflow-wrap: break-word」。 */
{
  const dir = makeSandbox();
  appendFile(cssOf(dir), ".fixture-bad { overflow-wrap: anywhere; overflow-wrap: break-word; }\n", 1);
  expectRed("W2a 同块里末位是 break-word（级联洞）⇒ W2", dir, ["W2"], {
    mustContain: "用了 overflow-wrap: break-word",
    note: "补之前这一档是绿的 —— 门禁放行了一个照样挡不住长串的规则",
  });
  fs.rmSync(dir, { recursive: true, force: true });
}

/* W2b：模板内联 <style> 里的 break-word（第二条腿）。 */
{
  const dir = makeSandbox();
  patchFile(
    njkOf(dir),
    "  .fixture-inline { color: inherit; }",
    "  .fixture-inline { overflow-wrap: break-word; }",
    1
  );
  expectRed("W2b 模板内联 <style> 里有 break-word ⇒ W2", dir, ["W2"], {
    mustContain: "模板内联 <style>",
  });
  fs.rmSync(dir, { recursive: true, force: true });
}

/* W2c：模板 style="..." 属性里的 break-word（第三条腿）。 */
{
  const dir = makeSandbox();
  patchFile(njkOf(dir), 'style="color: inherit"', 'style="overflow-wrap: break-word"', 1);
  expectRed("W2c 模板 style 属性里有 break-word ⇒ W2", dir, ["W2"], {
    mustContain: "style 属性",
  });
  fs.rmSync(dir, { recursive: true, force: true });
}

/* W2d：inlineCss 引用了 src/assets/css/ 之外的文件 ⇒ 门禁看不见它 ⇒ 盲区。 */
{
  const dir = makeSandbox();
  appendFile(njkOf(dir), '{% inlineCss "src/other/extra.css" %}\n', 1);
  expectRed("W2d inlineCss 引用了 css 目录之外的文件 ⇒ W2", dir, ["W2"], {
    mustContain: "inlineCss 引用了",
    note: "盲区：那份文件里的 overflow-wrap 门禁永远扫不到",
  });
  fs.rmSync(dir, { recursive: true, force: true });
}

/* W2e：非法兜底值 normal。 */
{
  const dir = makeSandbox();
  patchFile(cssOf(dir), ".fixture-plain { color: inherit; }", ".fixture-plain { overflow-wrap: normal; }", 1);
  expectRed("W2e overflow-wrap: normal（非法兜底值）⇒ W2", dir, ["W2"], {
    mustContain: "不是受支持的兜底值",
  });
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= 注入档 W3 ================= */

/* W3：门禁自己被卸掉（build 链里走不到它）。 */
{
  const dir = makeSandbox();
  unwireGate(dir);
  expectRed("W3 门禁自己被卸掉（build 链里走不到它）⇒ W3", dir, ["W3"], {
    mustContain: "门禁自己被卸掉了",
  });
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= 注入档 W4a / W4b ================= */

/* W4a：破坏解析器 —— 改成读**第一条**声明（级联语义就没了）。
   只改一行：末位生效 → 首条生效。 */
{
  const dir = makeSandbox();
  patchGate(dir, "const eff = pool[pool.length - 1];", "const eff = pool[0];", 1);
  expectRed("W4a 破坏解析器（读第一条声明）⇒ W4", dir, ["W4"], {
    mustContain: "解析器自证失败",
    note: "解析器坏了却没人管 ⇒ 门禁会安静地给出错的结论",
  });
  fs.rmSync(dir, { recursive: true, force: true });
}

/* W4b：破坏解析器 —— 不剥离 !important（合法写法被误报）。
   这一档会红**两条** W4（两份合成样例都被带崩），所以期望多重集是 {W4, W4}。 */
{
  const dir = makeSandbox();
  patchGate(
    dir,
    'return { value: raw.replace(IMPORTANT_RE, "").trim(), important };',
    "return { value: raw.trim(), important };",
    1
  );
  expectRed("W4b 破坏解析器（不剥离 !important）⇒ W4 ×2", dir, ["W4", "W4"], {
    mustContain: "解析器自证失败",
  });
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= 判据级负对照 N-W1–N-W4 ================= */

/* N-W1：卸掉 W1 ⇒ W1a 的注入必须转绿 */
{
  const dir = makeSandbox();
  patchGate(dir, "const W1_ON = true;", "const W1_ON = false;", 1);
  patchFile(cssOf(dir), GLOBAL_RULE, ".fixture-other { color: inherit; }", 1);
  expectGreen(
    "N-W1 负对照：卸掉 W1 判定后，W1a 的注入转绿",
    dir,
    "证明 W1a 那档的红确实来自 W1 判定本身"
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* N-W2：卸掉 W2 ⇒ W2a 的注入必须转绿 */
{
  const dir = makeSandbox();
  patchGate(dir, "const W2_ON = true;", "const W2_ON = false;", 1);
  appendFile(cssOf(dir), ".fixture-bad { overflow-wrap: anywhere; overflow-wrap: break-word; }\n", 1);
  expectGreen(
    "N-W2 负对照：卸掉 W2 判定后，W2a 的注入转绿",
    dir,
    "证明 W2a 那档的红确实来自 W2 判定本身"
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* N-W3：卸掉 W3 ⇒ W3 的注入必须转绿 */
{
  const dir = makeSandbox();
  patchGate(dir, "const W3_ON = true;", "const W3_ON = false;", 1);
  unwireGate(dir);
  expectGreen(
    "N-W3 负对照：卸掉 W3 判定后，W3 的注入转绿",
    dir,
    "证明 W3 那档的红确实来自 W3 判定本身"
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* N-W4：卸掉 W4 ⇒ W4a 的注入必须转绿 */
{
  const dir = makeSandbox();
  patchGate(dir, "const W4_ON = true;", "const W4_ON = false;", 1);
  patchGate(dir, "const eff = pool[pool.length - 1];", "const eff = pool[0];", 1);
  expectGreen(
    "N-W4 负对照：卸掉 W4 判定后，W4a 的注入转绿",
    dir,
    "证明 W4a 那档的红确实来自 W4 判定本身"
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= P-W4：精准性负对照 ================= */

/* 卸掉 W4 + 破坏解析器 + 塞一个 W2e 注入 ⇒ 必须**恰好**红 W2。
   这档证明两件事：① W2 与 W4 的判定互不越界；
   ② 解析器被破坏这件事在 W4 被卸掉之后，就**不该**再有第二条判据替它说话。 */
{
  const dir = makeSandbox();
  patchGate(dir, "const W4_ON = true;", "const W4_ON = false;", 1);
  patchGate(dir, "const eff = pool[pool.length - 1];", "const eff = pool[0];", 1);
  patchFile(cssOf(dir), ".fixture-plain { color: inherit; }", ".fixture-plain { overflow-wrap: normal; }", 1);
  expectRed("P-W4 精准性负对照：卸 W4 + 破坏解析器 + W2e 注入 ⇒ 恰好红 W2", dir, ["W2"], {
    mustContain: "不是受支持的兜底值",
    note: "W4 被卸掉后不应再有第二条判据替它说话",
  });
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= COV-A：扫描面数量自证 ================= */

/* 门禁报出的三类扫描数量必须与夹具里真实的数量一致（且 ≥ 1）——
   证明它真的在数，而不是打印一个凑出来的数字。 */
{
  const dir = makeSandbox();
  const r = runGate(dir);
  const m = /已扫 (\d+) 个 CSS 文件 \+ (\d+) 个模板内联 <style> 块 \+ (\d+) 处 style 属性/.exec(
    r.out
  );
  const n = m ? Number(m[1]) : -1;
  const s = m ? Number(m[2]) : -1;
  const a = m ? Number(m[3]) : -1;
  const cssReal = fs
    .readdirSync(path.join(dir, "src", "assets", "css"))
    .filter((f) => f.endsWith(".css") && !f.startsWith("._")).length;
  const njkReal = fs.readFileSync(njkOf(dir), "utf8");
  const styleReal = (njkReal.match(/<style[^>]*>/gi) || []).length;
  const attrReal = (njkReal.match(/(?<![\w-])style\s*=\s*(["'])/gi) || []).length;
  const ok = r.code === 0 && n === cssReal && s === styleReal && a === attrReal && n >= 1;
  record(
    "COV-A 覆盖度自证：报出的三类扫描数量与夹具真实数量一致",
    ok,
    ok
      ? `报出 ${n} 个 CSS 文件 / ${s} 个内联 <style> / ${a} 处 style 属性，` +
        `夹具真实 ${cssReal} / ${styleReal} / ${attrReal}（不是编的数字）`
      : `报出 ${n}/${s}/${a}，真实 ${cssReal}/${styleReal}/${attrReal}，code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= COV-B：判据覆盖度自证（现读门禁源码） ================= */

/* 门禁源码里 W1–W4 每条判据都要有红因出口（note("Wn"）与可卸开关（const Wn_ON = true;）——
   门禁新加判据而本矩阵没跟上时，这一档会立刻变红。 */
{
  const dir = makeSandbox();
  const src = fs.readFileSync(GATE, "utf8");
  const noteIds = [...new Set([...src.matchAll(/note\(\s*"(W\d+)"/g)].map((m) => m[1]))].sort();
  const switches = [...src.matchAll(/const (W\d+)_ON = true;/g)].map((m) => m[1]).sort();
  const want = ["W1", "W2", "W3", "W4"];
  const ok =
    JSON.stringify(noteIds) === JSON.stringify(want) &&
    JSON.stringify(switches) === JSON.stringify(want);
  record(
    "COV-B 覆盖度自证：门禁里 W1–W4 每条都有红因出口与可卸开关",
    ok,
    ok
      ? `红因出口 ${noteIds.join("/")}，可卸开关 ${switches.join("/")}（现读源码，不是写死的）`
      : `期望 ${want.join("/")}，实际 红因出口 ${noteIds.join("/")} / 开关 ${switches.join("/")}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= 收尾：仓库原件没被动过 ================= */

const problems = [];
if (sha256(GATE) !== GATE_SHA_AT_START) {
  problems.push("仓库里的门禁原件在自测期间被改动了 —— 自测必须只在副本上注入。");
}

if (problems.length) {
  console.error("\n长串断行门禁自测未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

const bad = results.filter((r) => !r.ok);
console.log(
  `\n注入矩阵：${results.length} 档里 ${results.length - bad.length} 档按预期触发` +
    `${bad.length ? `，${bad.length} 档未通过` : ""}` +
    `（N-W1–N-W4、P-W4 是判据级负对照）。`
);
if (bad.length) bad.forEach((b) => console.log(`  · 未通过：${b.id}`));
console.log("  · 原件校验：门禁的 SHA-256 与自测开始时一致。");
process.exit(bad.length ? 1 : 0);
