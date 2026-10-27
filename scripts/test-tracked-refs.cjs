#!/usr/bin/env node
/**
 * 自测 TR1–TR6：给 scripts/check-tracked-refs.cjs 的每条判据找一次「它会红」的证据
 *
 * 为什么要有这个自测（2026-10-21 的 D59 第八批）：
 *   这道门禁守的是「提交后的那棵树还能不能跑」——
 *   引用方进了索引、被引用方没进 ⇒ 全新克隆 `npm run build` 直接断。
 *   而「门禁是绿的」有两种可能：① 它真的没问题；② 它的判据从来没被真正执行过。
 *   这两件事长得一模一样。所以每条判据都要有一档**注入**证明它会红，
 *   再有一档**负对照**证明「卸掉那一步之后确实就绿了」——否则红可能来自别处。
 *
 * ⚠️ 本批同时堵上了这道门禁**自己身上的两个真洞**（实测出来的，不是推演的）：
 *   ① **注释当引用**：旧门禁不剥注释 ⇒ 注释里写着一行指向 `./lib/ghost.cjs`
 *      的本地 require 就会被当真引用 ⇒ 对着一个**从没写过的文件**判红。
 *   ② **字符串当引用**：旧门禁也不看字符串 ⇒ 一段存着 require 字样的普通字符串
 *      （自测脚本拼夹具时最常见）也会被当真引用 ⇒ 同样的假红。
 *   两个都是**假阳性**：真有问题的那次反而被淹了。
 *   对应档位：**G1 / G2**（补之前这两档是红的）。
 *
 * 夹具怎么造（为什么不照抄真仓库）：
 *   夹具是一个**临时 git 仓**（`git init` + `git add`）——
 *   因为 TR1/TR2/TR3 全部依赖「索引里的跟踪集合」，没有索引就没法测。
 *   夹具站是**最小**的，只有三样东西：
 *     <tmp>/repo/scripts/check-tracked-refs.cjs   门禁副本（负对照要改它的 TR*_ON 开关与遮罩）
 *     <tmp>/repo/scripts/app.cjs                  引用方（引用仓内 helper + 仓外依赖）
 *     <tmp>/repo/scripts/lib/helper.cjs           被引用方（已跟踪）
 *     <tmp>/outside/x.cjs                         仓外的「依赖」（证明仓外引用会被跳过）
 *   门禁的 ROOT 根是「它自己所在目录的上一级」，所以副本里的它**天然**
 *   指向副本里的仓，不需要任何环境变量。
 *
 *   ⚠️ 夹具里刻意让 app.cjs 引用一处**仓外**路径（`../../outside/x.cjs`）：
 *      这样 TR2 的口径才测得到 —— TR2 数的是**比对过**的仓内引用，
 *      仓外那几处只该被「跳过」，不该被算进「比对过」。
 *
 *   夹具还有一份 **HTML**（docs/demo.html ＋ 它引的 styles.css / logo.svg / app.js / mod.js），
 *   用来测 TR5/TR6 那条 HTML 侧的维度：
 *     · 4 处**仓内**本地资源引用（link / img / script / 内联 module 的 import）
 *       —— 目标都在仓里、也都在索引里 ⇒ 基线必须绿；
 *     · 1 处**仓外**引用（../../outside/remote.png）⇒ 应当被跳过；
 *     · 1 处**站内路由链接**（<a href="./page.html">）⇒ 那是页面链接，不是资源引用，
 *       **不能**判红（page.html 磁盘上并不存在）；
 *     · 根绝对站内 URL 与 HTML 注释里的引用 ⇒ 各自单列一档绿档（G3 / G4）。
 *
 * 档位（5 档绿 + 10 档注入 + 6 档判据级负对照 + 2 档精准性负对照 + 2 档覆盖度自证 = 25 档）：
 *   G0    基线绿
 *   G1    注释里写着一个本地 require（指向不存在的文件）⇒ 绿（**补之前是红的**）
 *   G2    字符串里存着一个本地 require 的字样              ⇒ 绿（**补之前是红的**）
 *   G3    HTML 里写着一条**根绝对**的站内 URL             ⇒ 绿（站内 URL 不是仓库里的文件）
 *   G4    HTML 注释里写着一个本地资源引用                ⇒ 绿（注释不是引用）
 *   T1a   引用的目标磁盘上不存在                          ⇒ TR1
 *   T1b   引用的目标磁盘上有、但**没有被 git 跟踪**        ⇒ TR1
 *   T2a   索引里一个代码文件都没有                        ⇒ TR2
 *   T2b   有代码文件，但一处**仓内**引用都没比对过        ⇒ TR2
 *   T3    索引读不到                                      ⇒ TR3（红因**恰为** {TR3}）
 *   T4a   遮罩被破坏（行注释不再被剥）                    ⇒ TR4
 *   T4b   遮罩被破坏 + 夹具也脏                          ⇒ 只红 {TR4}（TR1/TR2 整段跳过）
 *   T5a   HTML 引用的目标磁盘上不存在                    ⇒ TR5
 *   T5b   HTML 引用的目标磁盘上有、但**没有被 git 跟踪**  ⇒ TR5
 *   T6a   索引里一个 HTML 文件都没有                      ⇒ TR6
 *   N-TR1 负对照：卸掉 TR1 ⇒ T1a 的注入必须**转绿**
 *   N-TR2 负对照：卸掉 TR2 ⇒ T2a 的注入必须**转绿**
 *   N-TR3 负对照：卸掉 TR3 ⇒ T3 的注入必须**转绿**
 *   N-TR4 负对照：卸掉 TR4 ⇒ T4a 的注入必须**转绿**
 *   N-TR5 负对照：卸掉 TR5 ⇒ T5a 的注入必须**转绿**
 *   N-TR6 负对照：卸掉 TR6 ⇒ T6a 的注入必须**转绿**
 *   P-TR4 精准性负对照：卸掉 TR4 + 破坏遮罩 + T1b 注入 ⇒ 必须**恰好**红 TR1
 *   P-TR3 精准性负对照：卸掉 TR3 + 索引坏 + T1b 注入 ⇒ 必须仍然**绿**（前提不在场 ⇒ 整段跳过）
 *   COV-A 覆盖度自证：门禁报出的扫描数量与夹具真实数量一致（不是编的）
 *   COV-B 覆盖度自证：门禁源码里 TR1–TR6 每条都有红因出口与可卸开关（现读源码）
 *
 * ⚠️ 每档都断言「红因编号多重集**完全相等**」，不只是「包含期望的那条」——
 *   一档里出现两条判据的红，红因归属就不可判定了（那是脚本的缺陷，不是产品的缺陷）。
 *   N-TR1–N-TR6 / P-TR4 / P-TR3 这八档负对照正是「归属纯净」的守门人。
 *
 * ⚠️ 注入到**门禁副本 / 夹具文件**上的每一处改动，都额外断言「改动行数 = 声明值」：
 *   证明破坏确实打上了，而且只打了声明的那些行（既防「没打上」，也防「顺手多改了一行」）。
 *
 * ⚠️ 本文件源码里**不得出现**字面量的本地 require / import 语法 ——
 *   门禁 TR1 会扫到**已跟踪的代码文件**（包括本文件），
 *   一旦这里写着一个真的本地 require（或 `from "./x"` / `import("./x")`），
 *   提交后门禁会对着自己判红。
 *   所有这类文本都用 `KW.req` / `KWHTML` 拼出来。
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
const GATE = path.join(ROOT, "scripts", "check-tracked-refs.cjs");
const SHARED_LIB = path.join(__dirname, "lib", "js-refs.cjs");

function sha256(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

/* 原件指纹：**自测开始时**记下来，收尾时比对 ——
   证明这一整轮注入全在副本上，仓库里的原件一个字节都没动。 */
const GATE_SHA_AT_START = sha256(GATE);

/* 关键字拼出来：本文件源码里不许出现字面量的本地 require（见文件头）。 */
const KW = { req: "requ" + "ire", imp: "im" + "port" };
const reqText = (p) => `${KW.req}("${p}")`;

/* ---------- HTML 夹具 ----------
   ⚠️ 同样不许出现字面量的本地 import 语法：本文件是**已跟踪的 .cjs**，
      门禁 TR1 会扫它 ⇒ 字面量的 `from "./x"` / `import("./x")` 会把本文件
      当成一处真引用 ⇒ 对着不存在的路径判红。⇒ 关键字与路径都拼出来。 */
const KWHTML = { imp: "im" + "port", from: "fr" + "om" };

/* HTML 夹具里的四条**仓内**本地资源引用：link / img / script / 内联 module 的 import。
   目标文件都真实存在、也都会进索引 ⇒ 基线必须是绿的。 */
const HTML_LOCAL_REFS = ["./styles.css", "./logo.svg", "./app.js", "./mod.js"];
/* 仓外引用（应当被跳过）、站内路由链接（页面链接，不是资源引用）、
   根绝对站内 URL、HTML 注释里的引用 —— 各自单列一档。 */
const HTML_OUTSIDE_REF = "../../outside/remote.png";
const HTML_ANCHOR_REF = "./page.html";
const HTML_ROOT_ABS_REF = "/favicon.ico";
const HTML_COMMENT_REF = "./commented.css";

const HTML_DOC_SRC =
  [
    "<!doctype html>",
    '<html lang="zh">',
    "<head>",
    '  <meta charset="utf-8">',
    `  <link rel="stylesheet" href="${HTML_LOCAL_REFS[0]}">`,
    "</head>",
    "<body>",
    `  <a href="${HTML_ANCHOR_REF}">站内路由链接</a>`,
    `  <img src="${HTML_LOCAL_REFS[1]}" alt="仓库里的图">`,
    `  <img src="${HTML_OUTSIDE_REF}" alt="仓库外的图">`,
    `  <script src="${HTML_LOCAL_REFS[2]}"></script>`,
    '  <script type="module">',
    `    ${KWHTML.imp} { init } ${KWHTML.from} "${HTML_LOCAL_REFS[3]}";`,
    "    init();",
    "  </script>",
    "</body>",
    "</html>",
  ].join("\n") + "\n";

/* ================= 夹具 ================= */

function write(p, text) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
}

function git(cwd, args) {
  execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
}

/* app.cjs：一处**仓内**引用（./lib/helper.cjs）+ 一处**仓外**引用（../../outside/x.cjs）。 */
const APP_SRC =
  [
    `const helper = ${reqText("./lib/helper.cjs")};`,
    `const outside = ${reqText("../../outside/x.cjs")};`,
    "module.exports = { helper, outside };",
  ].join("\n") + "\n";

const HELPER_SRC = "module.exports = 1;\n";
const OUTSIDE_SRC = "module.exports = 2;\n";

function makeSandbox() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "mh-tracked-refs-"));
  const repo = path.join(base, "repo");
  fs.mkdirSync(path.join(repo, "scripts", "lib"), { recursive: true });
  fs.mkdirSync(path.join(repo, "docs"), { recursive: true });
  fs.copyFileSync(GATE, path.join(repo, "scripts", "check-tracked-refs.cjs"));
  /* 门禁现在把"遮罩扫描"外包给 scripts/lib/js-refs.cjs（一条真源，两处引用）——
     沙箱里必须把它一起放进去，否则门禁副本 require 不到 ⇒ 直接崩在启动阶段。
     ⚠️ 刻意把它放在**仓库之外**（<base>/lib/），并把门禁副本里那句 require 改成
     指向仓外（../../lib/js-refs.cjs）—— 理由是 T2b 那一档：
     它要测「一处**仓内**引用都没比对过 ⇒ TR2 判红」，而门禁自己那条 require
     就在仓内 ⇒ 仓内引用恒 ≥ 1 ⇒ 那一档的前提永远不成立。
     把夹具用的共享库挪到仓外，那一档的前提就重新可达了 ——
     **断言没变、只改驱动**（真仓里那条 require 是仓内且被跟踪的，
     由真仓上的门禁自己守着；沙箱只负责把 TR2 的分支练到）。 */
  fs.mkdirSync(path.join(base, "lib"), { recursive: true });
  const libCopy = path.join(base, "lib", "js-refs.cjs");
  fs.copyFileSync(SHARED_LIB, libCopy);
  {
    const gateSrc = fs.readFileSync(path.join(repo, "scripts", "check-tracked-refs.cjs"), "utf8");
    /* 指向**绝对路径**，而不是仓外相对路径（../../lib/js-refs.cjs）：
       相对路径会被 TR1 认成一处「指向仓库外的本地引用」⇒ 门禁报出的
       「仓外引用数」比夹具真实值多 1 ⇒ COV-A 的覆盖度自证对不上。
       绝对路径**不是相对路径** ⇒ TR1 那条只认以 "." 开头的 specifier 的正则
       压根不认它 ⇒ 夹具的真实数量不变 ⇒ **断言一个字不用改（只改驱动）**。 */
    const patched = gateSrc.replace(
      'require("./lib/js-refs.cjs")',
      `require(${JSON.stringify(libCopy)})`
    );
    if (patched === gateSrc) {
      throw new Error("沙箱搭建失败：门禁副本里找不到那句 require（坏跑）");
    }
    fs.writeFileSync(path.join(repo, "scripts", "check-tracked-refs.cjs"), patched);
  }
  write(path.join(repo, "scripts", "app.cjs"), APP_SRC);
  write(path.join(repo, "scripts", "lib", "helper.cjs"), HELPER_SRC);
  write(path.join(base, "outside", "x.cjs"), OUTSIDE_SRC);
  /* HTML 夹具：页面本体 ＋ 它引用的四个仓内目标 ＋ 一个仓外目标（故意不存在也没关系，
     它在仓外 ⇒ 应当被跳过而不是判红）。 */
  write(path.join(repo, "docs", "demo.html"), HTML_DOC_SRC);
  write(path.join(repo, "docs", "styles.css"), "/* fixture */\n");
  write(path.join(repo, "docs", "logo.svg"), '<svg xmlns="http://www.w3.org/2000/svg"></svg>\n');
  write(path.join(repo, "docs", "app.js"), 'console.log("fixture app");\n');
  write(path.join(repo, "docs", "mod.js"), "export function init() {}\n");
  git(repo, ["init", "-q"]);
  git(repo, ["add", "-A"]);
  return { base, repo };
}

/* 夹具里的常用路径 */
const appOf = (s) => path.join(s.repo, "scripts", "app.cjs");
const htmlOf = (s) => path.join(s.repo, "docs", "demo.html");
const gateOf = (s) => path.join(s.repo, "scripts", "check-tracked-refs.cjs");
/* 共享库副本放在**仓库之外**（见 makeSandbox 的注释）⇒ 它不在跟踪集合里。 */
const libOf = (s) => path.join(s.base, "lib", "js-refs.cjs");

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

/** 红因编号**多重集**（只认行首的「✗ 门禁 TRn：」，消息正文里出现的字样不算）。 */
function redIds(out) {
  const list = [];
  const re = /^[ \t]*✗[ \t]*门禁[ \t]+(TR\d+)/gm;
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

/**
 * 在文件末尾追加若干行，并断言「恰好追加了 expectLines 行、且前面的内容一个字没动」。
 * 追加的口径与替换不同：替换看「改动行数」，追加看「新增行数」。
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
function patchGate(s, from, to, expectDiff) {
  patchFile(gateOf(s), from, to, expectDiff);
}

/** 改**共享库副本**（沙箱里那份 scripts/lib/js-refs.cjs），并断言改动行数。 */
function patchLib(s, from, to, expectDiff) {
  patchFile(libOf(s), from, to, expectDiff);
}

const results = [];
function record(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${id}${detail ? " —— " + detail : ""}`);
}

/**
 * 一档「注入 ⇒ 应当恰好红这么几条判据」。
 * @param want 期望的红因编号多重集（必须完全相等）
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

/**
 * 一档「注入 ⇒ 应当红，且红因**全部**属于某一族**（至少一条）**」。
 *
 * ⚠️ 为什么要有这个变体（不是"恰好一条"）：
 *   TR4 的遮罩自证有**多条**样例（注释里的 require / 注释里的动态 import …），
 *   遮罩被破坏时**有几条坏就红几条** ⇒ 红因条数会随样例表增长而变化。
 *   ⇒ 断言"恰好一条"会把"样例表变长了"误判成"门禁坏了"。
 *   ⇒ 正确断言是：**红因全部是 TR4，且至少一条**（归属仍纯净：
 *   没有任何**别的**判据替它说话）。
 */
function expectRedAllOf(id, s, want, opts) {
  const o = opts || {};
  const r = runGate(s);
  const got = redIds(r.out);
  const allOf = got.length > 0 && got.every((x) => want.includes(x));
  const textOk = !o.mustContain || r.out.includes(o.mustContain);
  const ok = r.code === 1 && allOf && textOk;
  record(
    id,
    ok,
    ok
      ? `红了，${got.length} 条红因全部属于 ${fmtIds(want)}（归属纯净）` +
        `${o.note ? "；" + o.note : ""}`
      : `期望红因全部属于 ${fmtIds(want)} 且至少一条，` +
        `实际 code=${r.code} 红因 ${fmtIds(got)}\n${r.out}`
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

/**
 * 一档「绿档」：门禁应当 exit 0、一个红因都不许有，**且 HTML 侧比对过的引用数必须不变**。
 * 为什么要多这一条数字：绿档里塞的「陷阱」（站内 URL / 注释里的引用）如果被门禁
 * 当成了真引用，要么判红（看得见），要么被当成仓内引用**算进了比对数**（看不见）。
 * 只断「绿」会漏掉后一种 —— 所以比对数也得钉住。
 */
function expectGreenBaselineHtml(id, s, note, wantHtmlCompared) {
  const r = runGate(s);
  const got = redIds(r.out);
  const m = /比对过 (\d+) 处仓内本地资源引用/.exec(r.out);
  const compared = m ? Number(m[1]) : -1;
  const ok = r.code === 0 && got.length === 0 && compared === wantHtmlCompared;
  record(
    id,
    ok,
    ok
      ? `绿；HTML 侧比对过 ${compared} 处仓内本地资源引用（与基线一致）` +
        `${note ? "；" + note : ""}`
      : `期望绿且 HTML 侧比对过 ${wantHtmlCompared} 处，实际 code=${r.code}、` +
        `红因 ${fmtIds(got)}、比对 ${compared}\n${r.out}`
  );
}

/* ================= 注入手法（几档复用） ================= */

/** T1a：仓内引用指向一个磁盘上**不存在**的文件。 */
function injectMissingTarget(s) {
  patchFile(appOf(s), reqText("./lib/helper.cjs"), reqText("./lib/missing.cjs"), 1);
}

/** T1b：仓内引用指向一个磁盘上有、但**没进索引**的文件。 */
function injectUntrackedTarget(s) {
  write(path.join(s.repo, "scripts", "lib", "ghost.cjs"), "module.exports = 3;\n");
  patchFile(appOf(s), reqText("./lib/helper.cjs"), reqText("./lib/ghost.cjs"), 1);
}

/**
 * T1c：引用形态换成**动态 import**（`import("./x")` 带括号的那种），
 * 而目标磁盘上有、但**没进索引** ⇒ 应当仍然红 TR1。
 *
 * ⚠️ 这一档是缺陷 D114 的守卫：旧口径**认不出** `import(` ⇒ 那一次注入会**静默通过**
 *   ⇒ 而这正是 TR1 存在的根本理由（"引用方进了提交、被引用方没进" ⇒ 提交后那棵树会断）
 *   在动态 import 形态下**完全失效**。
 */
function injectUntrackedTargetViaDynamicImport(s) {
  write(path.join(s.repo, "scripts", "lib", "ghost.cjs"), "module.exports = 3;\n");
  patchFile(
    appOf(s),
    reqText("./lib/helper.cjs"),
    `const g = await ${KW.imp}("./lib/ghost.cjs");`,
    1
  );
}

/** T3：把索引弄坏（.git 变成一个不是 gitdir 的文件）。 */
function breakIndex(s) {
  fs.rmSync(path.join(s.repo, ".git"), { recursive: true, force: true });
  fs.writeFileSync(path.join(s.repo, ".git"), "not a git dir\n");
}

/** T2a：把脚本目录整个从索引里摘掉（只留一个非代码文件）⇒ 索引里没有代码文件了。
 * ⚠️ 门禁副本被负对照改过之后，它的工作树内容与索引里的不一致 ⇒ git rm 会拒绝，
 *    所以这里必须带 -f（这是一次性的临时夹具，索引随便改）。
 * ⚠️ 夹具的 HTML 里还有两个**代码扩展名**的目标（docs/app.js 与 docs/mod.js）——
 *    它们也必须一起离开索引，否则「索引里没有代码文件」这条前提就不成立。 */
function untrackScripts(s) {
  git(s.repo, ["rm", "-q", "-r", "-f", "--cached", "scripts"]);
  git(s.repo, ["rm", "-q", "-f", "--cached", "--", "docs/app.js", "docs/mod.js"]);
  write(path.join(s.repo, "README.md"), "# fixture\n");
  git(s.repo, ["add", "README.md"]);
}

/**
 * T2a 的配套手术：让「索引里没有代码文件」这一件事**单独**发生。
 * 夹具的 HTML 引用了两处代码扩展名的目标（./app.js ＋ 内联 module 的 ./mod.js）；
 * 那两处在代码文件离开索引后会变成「磁盘上有、没进索引」⇒ TR5 也会红
 * ⇒ 红因集合就不再是 {TR2}，归属不纯了。
 * ⇒ 把这两处改指到仍然存在、也仍然在索引里的资源上，让 T2a 只剩 TR2 说话。
 */
function repointHtmlCodeRefs(s) {
  patchFile(htmlOf(s), `src="${HTML_LOCAL_REFS[2]}"`, `src="${HTML_LOCAL_REFS[0]}"`, 1);
  patchFile(
    htmlOf(s),
    `${KWHTML.from} "${HTML_LOCAL_REFS[3]}"`,
    `${KWHTML.from} "${HTML_LOCAL_REFS[0]}"`,
    1
  );
}

/** T4a/T4b：破坏遮罩（行注释不再被剥）。
 * ⚠️ 遮罩实现现在住在**共享库** scripts/lib/js-refs.cjs 里（一条真源，两处引用），
 *    所以这一处注入要打在沙箱里那份**共享库副本**上，而不是门禁副本上
 *    —— 打错地方的话，注入点根本不存在（夹具会当场抛错，而不是"悄悄没打上"）。
 *    断言一个字没改：TR4 的语义（遮罩坏了 ⇒ 遮罩自证失败 ⇒ 整段跳过）完全没变。 */
function breakMask(s) {
  patchLib(s, 'if (c === "/" && c2 === "/") {', 'if (false && c === "/" && c2 === "/") {', 1);
}

/** T5a：HTML 引用的目标磁盘上**不存在** ⇒ 这个页面打开就是坏样式 / 坏脚本。 */
function injectHtmlMissingTarget(s) {
  patchFile(htmlOf(s), `href="${HTML_LOCAL_REFS[0]}"`, 'href="./missing.css"', 1);
}

/** T5b：HTML 引用的目标磁盘上有、但**没进索引** ⇒ 提交后这棵树会断。 */
function injectHtmlUntrackedTarget(s) {
  write(path.join(s.repo, "docs", "ghost.css"), "/* ghost */\n");
  patchFile(htmlOf(s), `href="${HTML_LOCAL_REFS[0]}"`, 'href="./ghost.css"', 1);
}

/** T6a：把 HTML 从索引里摘掉（工作树留着）⇒ 索引里一个 .html 都没有。
 * ⚠️ 带 -f：夹具里的门禁副本被负对照改过之后工作树与索引不一致 ⇒ git rm 会拒绝。 */
function untrackHtml(s) {
  git(s.repo, ["rm", "-q", "-f", "--cached", "--", "docs/demo.html"]);
}

/* ================= G0：基线（绿） ================= */

{
  const s = makeSandbox();
  expectGreenBaseline(
    "G0 基线（临时 git 仓上）",
    s,
    "仓内引用已被跟踪、仓外引用被跳过、遮罩自证通过；" +
      "HTML 侧 4 处仓内资源引用也都在，站内路由链接没被当成资源引用"
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= G1 / G2：绿档 ================= */

/* G1：注释里写着一个指向不存在文件的本地 require —— 注释不是引用 ⇒ 判绿。
   ⚠️ 这一档**补之前是红的**：旧门禁不剥注释 ⇒ 对着 `./lib/ghost.cjs` 判红。 */
{
  const s = makeSandbox();
  appendFile(appOf(s), `// ${reqText("./lib/ghost.cjs")} —— 这只是注释\n`, 1);
  expectGreenBaseline("G1 注释里的本地 require ⇒ 绿（补之前这一档是红的）", s);
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* G2：字符串里存着一段本地 require 的字样 —— 只是文字，不是引用 ⇒ 判绿。
   ⚠️ 这一档**补之前也是红的**：旧门禁连字符串都不看 ⇒ 同样的假红。 */
{
  const s = makeSandbox();
  appendFile(appOf(s), `const sample = '${reqText("./lib/ghost.cjs")}';\n`, 1);
  expectGreenBaseline("G2 字符串里的本地 require 字样 ⇒ 绿（补之前这一档是红的）", s);
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= G3 / G4：HTML 侧的绿档 ================= */

/* G3：根绝对路径（站内 URL）—— 部署后由站点根解析，不是仓库里的文件 ⇒ 不能判红。
   ⚠️ 夹具是**按行**拼的，追加的行落在 </html> 之后；门禁只做正则扫描，不看标签结构。 */
{
  const s = makeSandbox();
  appendFile(htmlOf(s), `  <img src="${HTML_ROOT_ABS_REF}" alt="站内 URL">\n`, 1);
  expectGreenBaselineHtml(
    "G3 HTML 里的根绝对站内 URL ⇒ 绿（站内 URL 不是仓库里的文件）",
    s,
    "站内 URL 与仓内文件引用不是一回事",
    HTML_LOCAL_REFS.length
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* G4：HTML 注释里写着一个本地资源引用 —— 注释不是引用 ⇒ 判绿。 */
{
  const s = makeSandbox();
  appendFile(
    htmlOf(s),
    `  <!-- <link rel="stylesheet" href="${HTML_COMMENT_REF}"> -->\n`,
    1
  );
  expectGreenBaselineHtml(
    "G4 HTML 注释里的资源引用 ⇒ 绿（注释不是引用）",
    s,
    "注释里的路径只是举例，不是引用",
    HTML_LOCAL_REFS.length
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= 注入档 T1a / T1b ================= */

/* T1a：引用的目标磁盘上不存在 ⇒ 这棵树根本跑不起来。 */
{
  const s = makeSandbox();
  injectMissingTarget(s);
  expectRed("T1a 引用的目标磁盘上不存在 ⇒ TR1", s, ["TR1"], {
    mustContain: "磁盘上找不到它",
  });
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* T1b：引用的目标磁盘上有、但没进索引 ⇒ 提交后这棵树会断（2026-10-19 那个 P0）。 */
{
  const s = makeSandbox();
  injectUntrackedTarget(s);
  expectRed("T1b 引用的目标没有被 git 跟踪 ⇒ TR1", s, ["TR1"], {
    mustContain: "没有被 git 跟踪",
    note: "这正是门禁要拦的那个 P0：引用方进了提交、被引用方没进",
  });
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* T1c：引用形态是**动态 import**，目标没进索引 ⇒ 仍然红 TR1（缺陷 D114 的守卫）。
   ⚠️ **旧口径这一档是绿的** —— 旧正则认不出 `import(`（带括号）⇒ 注入静默通过
   ⇒ TR1 的核心承诺在动态 import 形态下失效。 */
{
  const s = makeSandbox();
  injectUntrackedTargetViaDynamicImport(s);
  expectRed("T1c 动态 import 的目标没被 git 跟踪 ⇒ TR1", s, ["TR1"], {
    mustContain: "没有被 git 跟踪",
    note: "旧口径认不出 import( ⇒ 动态 import 形态下 TR1 形同虚设",
  });
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= 注入档 T2a / T2b ================= */

/* T2a：索引里一个代码文件都没有 ⇒ 判据从未被真正执行过。 */
{
  const s = makeSandbox();
  untrackScripts(s);
  repointHtmlCodeRefs(s);
  expectRed("T2a 索引里一个代码文件都没有 ⇒ TR2", s, ["TR2"], {
    mustContain: "一个已跟踪的代码文件都没扫到",
    note: "HTML 侧那两处代码目标同时被改指 ⇒ 这一档只让 TR2 说话",
  });
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* T2b：有代码文件，但一处**仓内**引用都没比对过（唯一那处指向仓外）⇒ 判红。
   ⚠️ 旧口径把仓外那处也算进「扫到的引用」⇒ 这一档在旧口径下是绿的。 */
{
  const s = makeSandbox();
  /* 把那处仓内引用改成**另一处仓外**引用（不动行数，注入点也唯一） */
  patchFile(appOf(s), reqText("./lib/helper.cjs"), reqText("../../outside/y.cjs"), 1);
  expectRed("T2b 只有仓外引用、一处仓内引用都没比对过 ⇒ TR2", s, ["TR2"], {
    mustContain: "仓内",
    note: "旧口径把仓外依赖也算进「比对过」⇒ 自证存活形同虚设",
  });
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= 注入档 T3 ================= */

/* T3：索引读不到 ⇒ 只报 TR3，TR1/TR2 整段跳过（红因**恰为** {TR3}）。 */
{
  const s = makeSandbox();
  breakIndex(s);
  expectRed("T3 索引读不到 ⇒ TR3（TR1/TR2 整段跳过）", s, ["TR3"], {
    mustContain: "读不到 git 索引",
    note: "前提不在场 ⇒ 只让前提那一条说话，红因归属保持纯净",
  });
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= 注入档 T4a / T4b ================= */

/* T4a：遮罩被破坏（行注释不再被剥）⇒ 遮罩自证失败 ⇒ TR4。 */
{
  const s = makeSandbox();
  breakMask(s);
  expectRedAllOf("T4a 遮罩被破坏 ⇒ TR4", s, ["TR4"], {
    mustContain: "遮罩自证失败",
    note: "遮罩坏了却没人管 ⇒ 门禁会安静地给出错的结论",
  });
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* T4b：遮罩坏了 + 夹具也脏 ⇒ 仍**恰好**红 {TR4}：
   TR1 的结论建立在遮罩之上 ⇒ 这一轮它整段跳过，不替遮罩说话。 */
{
  const s = makeSandbox();
  breakMask(s);
  injectUntrackedTarget(s);
  expectRedAllOf("T4b 遮罩坏了 + 夹具也脏 ⇒ 只红 TR4（TR1 整段跳过）", s, ["TR4"], {
    mustContain: "遮罩自证失败",
    note: "前提不在场 ⇒ 依赖它的判据整段跳过，不拿不可信的结论凑数",
  });
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= 注入档 T5a / T5b ================= */

/* T5a：HTML 引用的目标磁盘上不存在 ⇒ 这个页面打开就是坏样式 / 坏脚本。 */
{
  const s = makeSandbox();
  injectHtmlMissingTarget(s);
  expectRed("T5a HTML 引用的目标磁盘上不存在 ⇒ TR5", s, ["TR5"], {
    mustContain: "但磁盘上找不到它",
    note: "这正是门禁要拦的那个断链：页面在仓库里躺着，引用的资源却不在",
  });
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* T5b：HTML 引用的目标磁盘上有、但没进索引 ⇒ 提交后这棵树会断（与 TR1 同一个道理）。 */
{
  const s = makeSandbox();
  injectHtmlUntrackedTarget(s);
  expectRed("T5b HTML 引用的目标没有被 git 跟踪 ⇒ TR5", s, ["TR5"], {
    mustContain: "没有被 git 跟踪",
    note: "引用方进了提交、被引用方没进 ⇒ 全新克隆里这个页面会少掉样式",
  });
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= 注入档 T6a ================= */

/* T6a：索引里一个 HTML 文件都没有 ⇒ TR5 从未被真正执行过 ⇒ 判红。 */
{
  const s = makeSandbox();
  untrackHtml(s);
  expectRed("T6a 索引里一个 HTML 文件都没有 ⇒ TR6", s, ["TR6"], {
    mustContain: "一个已跟踪的 HTML 文件都没扫到",
    note: "HTML 侧的自证存活：没报错和「没问题」长得一模一样",
  });
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= 判据级负对照 N-TR1–N-TR6 ================= */

/* N-TR1：卸掉 TR1 ⇒ T1a 的注入必须转绿 */
{
  const s = makeSandbox();
  patchGate(s, "const TR1_ON = true;", "const TR1_ON = false;", 1);
  injectMissingTarget(s);
  expectGreen(
    "N-TR1 负对照：卸掉 TR1 判定后，T1a 的注入转绿",
    s,
    "证明 T1a 那档的红确实来自 TR1 判定本身"
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* N-TR2：卸掉 TR2 ⇒ T2a 的注入必须转绿 */
{
  const s = makeSandbox();
  patchGate(s, "const TR2_ON = true;", "const TR2_ON = false;", 1);
  untrackScripts(s);
  repointHtmlCodeRefs(s);
  expectGreen(
    "N-TR2 负对照：卸掉 TR2 判定后，T2a 的注入转绿",
    s,
    "证明 T2a 那档的红确实来自 TR2 判定本身"
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* N-TR3：卸掉 TR3 ⇒ T3 的注入必须转绿（前提不在场时整段跳过） */
{
  const s = makeSandbox();
  patchGate(s, "const TR3_ON = true;", "const TR3_ON = false;", 1);
  breakIndex(s);
  expectGreen(
    "N-TR3 负对照：卸掉 TR3 判定后，T3 的注入转绿",
    s,
    "证明 T3 那档的红确实来自 TR3 判定本身"
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* N-TR4：卸掉 TR4 ⇒ T4a 的注入必须转绿 */
{
  const s = makeSandbox();
  patchGate(s, "const TR4_ON = true;", "const TR4_ON = false;", 1);
  breakMask(s);
  expectGreen(
    "N-TR4 负对照：卸掉 TR4 判定后，T4a 的注入转绿",
    s,
    "证明 T4a 那档的红确实来自 TR4 判定本身"
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* N-TR5：卸掉 TR5 ⇒ T5a 的注入必须转绿 */
{
  const s = makeSandbox();
  patchGate(s, "const TR5_ON = true;", "const TR5_ON = false;", 1);
  injectHtmlMissingTarget(s);
  expectGreen(
    "N-TR5 负对照：卸掉 TR5 判定后，T5a 的注入转绿",
    s,
    "证明 T5a 那档的红确实来自 TR5 判定本身"
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* N-TR6：卸掉 TR6 ⇒ T6a 的注入必须转绿 */
{
  const s = makeSandbox();
  patchGate(s, "const TR6_ON = true;", "const TR6_ON = false;", 1);
  untrackHtml(s);
  expectGreen(
    "N-TR6 负对照：卸掉 TR6 判定后，T6a 的注入转绿",
    s,
    "证明 T6a 那档的红确实来自 TR6 判定本身"
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= P-TR4 / P-TR3：精准性负对照 ================= */

/* 卸掉 TR4 + 破坏遮罩 + 塞一个 T1b 注入 ⇒ 必须**恰好**红 TR1。
   这档证明两件事：① TR1 与 TR4 的判定互不越界；
   ② TR4 被卸掉之后，TR1 仍然是唯一说话的那一条（卸判据是精准的，不是把门禁整个关掉）。 */
{
  const s = makeSandbox();
  patchGate(s, "const TR4_ON = true;", "const TR4_ON = false;", 1);
  breakMask(s);
  injectUntrackedTarget(s);
  expectRed("P-TR4 精准性负对照：卸 TR4 + 破坏遮罩 + T1b 注入 ⇒ 恰好红 TR1", s, ["TR1"], {
    mustContain: "没有被 git 跟踪",
    note: "TR4 被卸掉后不应再有第二条判据替它说话",
  });
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* 卸掉 TR3 + 索引坏 + 塞一个 T1b 注入 ⇒ 必须仍然**绿**：
   索引读不到时压根没有跟踪集合可判 ⇒ TR1/TR2 整段跳过，
   不会拿一个空索引去说「没发现问题」。 */
{
  const s = makeSandbox();
  patchGate(s, "const TR3_ON = true;", "const TR3_ON = false;", 1);
  breakIndex(s);
  injectUntrackedTarget(s);
  expectGreen(
    "P-TR3 精准性负对照：卸 TR3 + 索引坏 + 脏夹具 ⇒ 仍然绿（前提不在场 ⇒ 整段跳过）",
    s,
    "证明「前提不在场时整段跳过」不是靠 TR3 那条红因撑着的"
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= COV-A：扫描面数量自证 ================= */

/* 门禁报出的数量必须与夹具里真实的数量一致（且 ≥ 1）——
   证明它真的在数，而不是打印一个凑出来的数字。代码侧与 HTML 侧各算一遍。 */
{
  const s = makeSandbox();
  const r = runGate(s);
  const m = /扫了 (\d+) 个已跟踪代码文件、比对过 (\d+) 处仓内本地引用/.exec(r.out);
  const o = /另有 (\d+) 处指向仓库外/.exec(r.out);
  const files = m ? Number(m[1]) : -1;
  const compared = m ? Number(m[2]) : -1;
  const outside = o ? Number(o[1]) : -1;
  const h = /另扫了 (\d+) 个已跟踪 HTML 文件、比对过 (\d+) 处仓内本地资源引用/.exec(r.out);
  const ho = /处仓内本地资源引用（另有 (\d+) 处指向仓库外/.exec(r.out);
  const htmlFiles = h ? Number(h[1]) : -1;
  const htmlCompared = h ? Number(h[2]) : -1;
  const htmlOutside = ho ? Number(ho[1]) : -1;

  /* 独立算一遍夹具的真实数量（不抄门禁的逻辑） */
  const tracked = execFileSync("git", ["ls-files", "-z"], {
    cwd: s.repo,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
  const codeReal = tracked.filter(
    (f) => [".cjs", ".js", ".mjs"].includes(path.extname(f)) && fs.existsSync(path.join(s.repo, f))
  ).length;
  const appSrc = fs.readFileSync(appOf(s), "utf8");
  const inRepoReal = (appSrc.match(/"\.\/lib\//g) || []).length;
  const outRepoReal = (appSrc.match(/"\.\.\/\.\.\/outside\//g) || []).length;

  /* HTML 侧同样独立算一遍：数「夹具里那几条路径真的写进了页面」。 */
  const htmlSrc = fs.readFileSync(htmlOf(s), "utf8");
  const htmlFilesReal = tracked.filter(
    (f) => f.toLowerCase().endsWith(".html") && fs.existsSync(path.join(s.repo, f))
  ).length;
  const htmlInRepoReal = HTML_LOCAL_REFS.filter((r) => htmlSrc.includes(`"${r}"`)).length;
  const htmlOutRepoReal = htmlSrc.includes(`"${HTML_OUTSIDE_REF}"`) ? 1 : 0;

  const ok =
    r.code === 0 &&
    files === codeReal &&
    compared === inRepoReal &&
    outside === outRepoReal &&
    files >= 1 &&
    compared >= 1 &&
    htmlFiles === htmlFilesReal &&
    htmlCompared === htmlInRepoReal &&
    htmlOutside === htmlOutRepoReal &&
    htmlFiles >= 1 &&
    htmlCompared >= 1;
  record(
    "COV-A 覆盖度自证：报出的扫描数量与夹具真实数量一致",
    ok,
    ok
      ? `代码侧报出 ${files} 个代码文件 / ${compared} 处仓内引用 / ${outside} 处仓外引用，` +
        `夹具真实 ${codeReal} / ${inRepoReal} / ${outRepoReal}；` +
        `HTML 侧报出 ${htmlFiles} 个页面 / ${htmlCompared} 处仓内引用 / ${htmlOutside} 处仓外引用，` +
        `夹具真实 ${htmlFilesReal} / ${htmlInRepoReal} / ${htmlOutRepoReal}（不是编的数字）`
      : `代码侧报出 ${files}/${compared}/${outside}，真实 ${codeReal}/${inRepoReal}/${outRepoReal}；` +
        `HTML 侧报出 ${htmlFiles}/${htmlCompared}/${htmlOutside}，` +
        `真实 ${htmlFilesReal}/${htmlInRepoReal}/${htmlOutRepoReal}，code=${r.code}\n${r.out}`
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= COV-B：判据覆盖度自证（现读门禁源码） ================= */

/* 门禁源码里 TR1–TR6 每条判据都要有红因出口（note("TRn") 与可卸开关（const TRn_ON = true;）——
   门禁新加判据而本矩阵没跟上时，这一档会立刻变红。 */
{
  const s = makeSandbox();
  const src = fs.readFileSync(GATE, "utf8");
  const noteIds = [...new Set([...src.matchAll(/note\(\s*"(TR\d+)"/g)].map((m) => m[1]))].sort();
  const switches = [...src.matchAll(/const (TR\d+)_ON = true;/g)].map((m) => m[1]).sort();
  const want = ["TR1", "TR2", "TR3", "TR4", "TR5", "TR6"];
  const ok =
    JSON.stringify(noteIds) === JSON.stringify(want) &&
    JSON.stringify(switches) === JSON.stringify(want);
  record(
    "COV-B 覆盖度自证：门禁里 TR1–TR6 每条都有红因出口与可卸开关",
    ok,
    ok
      ? `红因出口 ${noteIds.join("/")}，可卸开关 ${switches.join("/")}（现读源码，不是写死的）`
      : `期望 ${want.join("/")}，实际 红因出口 ${noteIds.join("/")} / 开关 ${switches.join("/")}`
  );
  fs.rmSync(s.base, { recursive: true, force: true });
}

/* ================= 收尾：仓库原件没被动过 ================= */

const problems = [];
if (sha256(GATE) !== GATE_SHA_AT_START) {
  problems.push("仓库里的门禁原件在自测期间被改动了 —— 自测必须只在副本上注入。");
}

if (problems.length) {
  console.error("\n引用完整性门禁自测未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

const bad = results.filter((r) => !r.ok);
console.log(
  `\n注入矩阵：${results.length} 档里 ${results.length - bad.length} 档按预期触发` +
    `${bad.length ? `，${bad.length} 档未通过` : ""}` +
    `（N-TR1–N-TR6、P-TR4、P-TR3 是判据级负对照）。`
);
if (bad.length) bad.forEach((b) => console.log(`  · 未通过：${b.id}`));
console.log("  · 原件校验：门禁的 SHA-256 与自测开始时一致。");
process.exit(bad.length ? 1 : 0);
