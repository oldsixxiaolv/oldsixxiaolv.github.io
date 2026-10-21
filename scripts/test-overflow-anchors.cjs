#!/usr/bin/env node
/**
 * 窄屏溢出门禁的**滚动定位让位判据自测**（注入矩阵）—— 证明 AN1–AN3 每一条都**能变红**。
 *
 * 为什么要有这个自测（缺陷清单 D24 的配套）：
 *   D24 修的缺陷是「滚到了却看不见」：站内所有滚动定位都把目标滚到视口**顶**，
 *   而吸顶顶栏（sticky; top:0; 高 56px）就钉在那儿 ⇒ 目标被整条盖住。
 *   这条判据的危险在于它**极易整条失效而不露痕迹**：
 *   遮挡线检测写错、判定那段被改成恒不违规、目标收集规则写漏了选择器 ——
 *   这三种情况都会让门禁**一直绿**，而"绿"读起来完全像在工作。
 *   它守的是「读者点完目录到底看没看到东西」，恰恰是最该有牙齿的判据。
 *   ⇒ 「这条判据结构上能不能触发」必须**被证明**，不能靠人记得。
 *
 * 做法：造几个**夹具页面**，用 SITE_DIR 把门禁指向夹具目录，
 *   逐档断言门禁的红绿与红因内容。
 *   ⚠️ 负对照**只在副本上注入**（把门禁复制到临时目录再改）——
 *     全程**不动仓库里的任何文件**；最后按 SHA-256 校验门禁原件没被动过。
 *
 * ⚠️ 夹具的三条硬要求（少一条就会假绿）：
 *   ① **必须有 sticky 顶栏**（`position:sticky; top:0; 高 56px`）——
 *      没有它就没有遮挡线，AN1 无从判定。
 *   ② **正文必须够高**（能滚）—— 页面太短时 scrollIntoView 根本滚不动，
 *      目标停在原位、也就不被盖 ⇒ 缺陷形态会**假绿**。
 *   ③ **目标必须够深** —— 目标要在页面中部，光靠"滚到顶"这个动作就能滚过去；
 *      如果目标就在顶栏正下方，scroll-padding 生效与否都看不出差别。
 *
 * 八档：
 *   A0 基线（让位 / 不让位 两种形态 + 论文页）→ 必须**全绿**（不许误报）
 *   A1 缺陷形态（去掉 scroll-padding-top）→ 必须**判红**，且红因要**点名**目标与被遮像素
 *   A2 红因单一 → A1 那档的红因里**不许**混进横向溢出 / 正文列 / 触点的红因
 *   A3 负对照（判定被卸掉）→ 门禁副本里的遮挡判定换成"恒不违规" ⇒ A1 那档转绿
 *      ⇒ 自测的「A1 必须红」断言当场失败 ⇒ 自测 exit 1 ⇒ 证明这条判据有牙齿
 *   A4 负对照（检测被卸掉）→ 门禁副本里的遮挡线检测恒返回空 ⇒ **不许转绿**：
 *      必须转红，且红因是 AN2 的「判据空跑」那条 —— 检测坏了不许被悄悄放过
 *   A5 负对照（目标收集被卸掉）→ 门禁副本量不到任何站内锚点 ⇒ 必须因 **AN2 自证**判红
 *   A6 负对照（目录收集被卸掉）→ 门禁副本量不到论文页目录目标 ⇒ 必须因 **AN3** 判红
 *   A7 真身校验 → 门禁原件按 SHA-256 校验没被动过（注入全程只在副本上做）
 *
 * 用法：node scripts/test-overflow-anchors.cjs
 *   （已接进 npm run build，见 package.json 的 check:overflow-anchors-selftest）
 */
const { spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-overflow.cjs");

let failures = 0;
function ok(label, detail) {
  console.log(`  ✓ ${label}${detail ? `  ${detail}` : ""}`);
}
function bad(label, detail) {
  failures++;
  console.log(`  ✗ ${label}${detail ? `  ${detail}` : ""}`);
}
function assert(cond, label, detail) {
  cond ? ok(label, detail) : bad(label, detail);
}

if (!fs.existsSync(GATE)) {
  console.error(`滚动定位自测失败：找不到门禁 ${GATE}`);
  process.exit(1);
}

/** 门禁原件的指纹（负对照全程只在副本上注入，最后要拿它校验原件没被动过）。 */
const gateDigest = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const GATE_SHA_BEFORE = gateDigest(GATE);

/* ---------- 夹具页面 ---------- */

const VIEWPORT_META = '<meta name="viewport" content="width=device-width, initial-scale=1.0" />';

/** 顶栏 + 让位规则 + 足够高的正文 —— 三件缺一不可（见文件头）。 */
const BASE_CSS = `
  body { margin: 0; }
  .topbar { position: sticky; top: 0; height: 56px; background: #ececec; z-index: 50; }
  main { padding: 0 16px; }
  .filler { height: 2500px; }
`;

/**
 * 一页夹具。
 * @param {object} o
 * @param {boolean} o.withPadding  根滚动容器是否给 scroll-padding-top（让位）
 * @param {boolean} o.paper         是否做成论文页（article.paper + 带 id 的 h2）
 */
function page(title, { withPadding, paper }) {
  const padding = withPadding
    ? `html { scroll-padding-top: 88px; }`
    : `/* 自测注入：不给根滚动容器让位 —— 这就是 D24 的缺陷形态 */`;
  const inner = paper
    ? `<article class="paper">
         <div class="filler"></div>
         <section><h2 id="paper-alpha">Alpha section</h2><p>Prose for the alpha section.</p></section>
         <section><h2 id="paper-beta">Beta section</h2><p>Prose for the beta section.</p></section>
       </article>`
    : `<div class="filler"></div>
       <section id="sec"><h2>Deep section</h2><p>Prose for the deep section.</p></section>`;
  const links = paper
    ? `<p>Jump to <a href="#main">the main content</a> of this fixture page.</p>`
    : `<p>Jump to <a href="#main">the main content</a> or straight to
         <a href="#sec">the deep section</a> of this fixture page.</p>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
${VIEWPORT_META}
<title>${title}</title>
<style>
${BASE_CSS}
${padding}
</style>
</head>
<body>
<header class="topbar">MeteoHub fixture</header>
<main id="main">
<h1>${title}</h1>
${links}
${inner}
</main>
</body>
</html>
`;
}

/** ① 让位（正确形态）：根滚动容器给了 scroll-padding-top ⇒ 目标落在顶栏下方 ⇒ 必须绿。 */
const F_OK = page("Anchor selftest — makes room for the sticky bar", {
  withPadding: true,
  paper: false,
});

/** ② 让位 + 论文页：article.paper 内两个带 id 的 h2 ⇒ 用来验 AN3 的目录覆盖自证。 */
const F_OK_PAPER = page("Anchor selftest — paper page with a table of contents", {
  withPadding: true,
  paper: true,
});

/**
 * ③ 缺陷形态：**不给**根滚动容器让位 ⇒ 目标被滚到视口顶、正好落在顶栏底下
 *    ⇒ 顶栏把它盖住 ⇒ 必须判红。
 */
const F_NO_PADDING = page("Anchor selftest — sticky bar covers the target", {
  withPadding: false,
  paper: false,
});

/* ---------- 跑门禁 ---------- */

/**
 * 跑门禁（可以是副本）。SITE_DIR 指向夹具目录；
 * 副本放在临时目录里 —— 门禁自己的默认产物路径用 __dirname 推算，
 * 但我们**总是**显式给 SITE_DIR，所以副本照跑不误。
 */
function runGate(gatePath, siteDir, extraArgs) {
  const r = spawnSync(process.execPath, [gatePath, ...(extraArgs || [])], {
    cwd: ROOT,
    env: { ...process.env, SITE_DIR: siteDir },
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return { code: r.status, out: `${r.stdout || ""}\n${r.stderr || ""}` };
}

/** 从门禁输出里抽出「滚动定位」相关的红因、**自证**红因，以及**别的**红因（用于 A2）。 */
function parseGateOutput(out) {
  const lines = out.split("\n");
  const anchorReasons = lines.filter(
    (l) => /滚动定位被顶栏遮住/.test(l) || /^\s+·\s+\d+px\s+\S+\s+#/.test(l)
  );
  const selfProof = lines.filter((l) => /AN2|AN3/.test(l));
  const otherReasons = lines.filter(
    (l) =>
      /✗\s*横向可拖/.test(l) ||
      /正文被挤成窄带/.test(l) ||
      /正文列太窄/.test(l) ||
      /正文列选择器没命中/.test(l) ||
      /触点过小/.test(l)
  );
  const summary = (out.match(/量到滚动定位目标\s*\d+\s*个（其中目录目标\s*\d+\s*个）/) || [])[0] || "";
  return { anchorReasons, selfProof, otherReasons, summary };
}

/* ---------- 主流程 ---------- */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mh-overflow-anchors-selftest-"));
try {
  const passDir = path.join(tmp, "pass");
  const failDir = path.join(tmp, "fail");
  fs.mkdirSync(passDir);
  fs.mkdirSync(failDir);
  fs.writeFileSync(path.join(passDir, "a0_ok.html"), F_OK);
  fs.writeFileSync(path.join(passDir, "a0_paper.html"), F_OK_PAPER);
  fs.writeFileSync(path.join(failDir, "a1_no_padding.html"), F_NO_PADDING);

  /* A0：让位形态都该绿 —— 判据不许误报 */
  const pass = runGate(GATE, passDir, ["--width", "360"]);
  const pp = parseGateOutput(pass.out);
  assert(
    pass.code === 0,
    "A0 让位形态（普通页 + 论文页）都判绿",
    `exit=${pass.code}${pass.code === 0 ? "" : ` —— ${pass.out.split("\n").slice(-8).join(" | ")}`}`
  );
  assert(
    /目录目标\s*2\s*个/.test(pp.summary),
    "A0 通过文案里如实报出了目录目标数（AN3 覆盖自证有据可查）",
    pp.summary || "（没匹配到摘要）"
  );

  /* A1：缺陷形态必须判红，且红因要点名 */
  const fail = runGate(GATE, failDir, ["--width", "360"]);
  const fp = parseGateOutput(fail.out);
  assert(fail.code === 1, "A1 不让位 ⇒ 目标被顶栏盖住 ⇒ 判红", `exit=${fail.code}`);
  assert(
    fp.anchorReasons.length > 0,
    "A1 红因里点名了滚动定位判据",
    `${fp.anchorReasons.length} 条`
  );
  assert(
    fp.anchorReasons.some((l) => /#main/.test(l)),
    "A1 红因点名了被盖住的目标 id",
    fp.anchorReasons[0] ? fp.anchorReasons[0].trim().slice(0, 70) : "（无）"
  );
  assert(
    fp.anchorReasons.some((l) => /被遮\s*[\d.]+px/.test(l)),
    "A1 红因报出了被遮的像素数",
    fp.anchorReasons[0] ? fp.anchorReasons[0].trim().slice(0, 90) : "（无）"
  );

  /* A2：红因单一 —— 不许混进别的判据 */
  assert(
    fp.otherReasons.length === 0,
    "A2 红因里没有混进横向溢出 / 正文列 / 触点的问题",
    fp.otherReasons.length ? fp.otherReasons.join(" | ").slice(0, 140) : "只有滚动定位这一条"
  );

  const gateSrc = fs.readFileSync(GATE, "utf8");

  /* A3：负对照 —— 把遮挡判定换成"恒不违规"，缺陷形态必须转绿（否则 A1 的红是假的） */
  const mutGate = path.join(tmp, "gate-mutated.cjs");
  const NEEDLE_JUDGE = "const anchorOccluded = anchors.filter((a) => a.occluded > 0);";
  if (!gateSrc.includes(NEEDLE_JUDGE)) {
    bad("A3 负对照的前提成立（门禁里找得到遮挡判定那一行）", `没找到「${NEEDLE_JUDGE}」`);
  } else {
    fs.writeFileSync(
      mutGate,
      gateSrc.replace(
        NEEDLE_JUDGE,
        "const anchorOccluded = []; // 自测注入：遮挡判定被卸掉"
      )
    );
    const mut = runGate(mutGate, failDir, ["--width", "360"]);
    assert(
      mut.code === 0,
      "A3 遮挡判定被卸掉后缺陷形态转绿（⇒ A1 那次判红确实是这条判据判的）",
      `exit=${mut.code}`
    );
  }

  /* A4：负对照 —— 把遮挡线**检测**卸掉：必须**不许**转绿，
        而要转红且红因是 AN2 的「判据空跑」那条（检测坏了不许被悄悄放过）。 */
  const mutGate2 = path.join(tmp, "gate-mutated2.cjs");
  const NEEDLE_DETECT = "let best = null;";
  if (!gateSrc.includes(NEEDLE_DETECT)) {
    bad("A4 负对照的前提成立（门禁里找得到遮挡线检测那一行）", `没找到「${NEEDLE_DETECT}」`);
  } else {
    fs.writeFileSync(
      mutGate2,
      gateSrc.replace(
        NEEDLE_DETECT,
        "let best = null;\n    return null; // 自测注入：遮挡线检测被卸掉"
      )
    );
    const mut2 = runGate(mutGate2, failDir, ["--width", "360"]);
    const mp = parseGateOutput(mut2.out);
    assert(
      mut2.code === 1 && mp.selfProof.some((l) => /AN2/.test(l)),
      "A4 遮挡线检测被卸掉后门禁转红，且红因是 AN2 的判据空跑自证",
      `exit=${mut2.code}${mut2.code === 1 ? "" : "（竟然转绿了 —— 空跑的判据被放过了）"}`
    );
  }

  /* A5：负对照 —— 把站内锚点收集卸掉，门禁必须因 AN2 自证判红 */
  const mutGate3 = path.join(tmp, "gate-mutated3.cjs");
  const NEEDLE_COLLECT = `for (const a of document.querySelectorAll('a[href^="#"]')) {`;
  if (!gateSrc.includes(NEEDLE_COLLECT)) {
    bad("A5 负对照的前提成立（门禁里找得到站内锚点收集那一行）", `没找到「${NEEDLE_COLLECT}」`);
  } else {
    fs.writeFileSync(
      mutGate3,
      gateSrc.replace(
        NEEDLE_COLLECT,
        `for (const a of []) { // 自测注入：站内锚点收集被卸掉`
      )
    );
    const mut3 = runGate(mutGate3, passDir, ["--width", "360"]);
    const mp3 = parseGateOutput(mut3.out);
    assert(
      mut3.code === 1 && mp3.selfProof.some((l) => /AN2/.test(l)),
      "A5 站内锚点收集被卸掉后门禁因 AN2 自证判红（防判据空跑）",
      `exit=${mut3.code}`
    );
  }

  /* A6：负对照 —— 把论文页目录目标收集卸掉，门禁必须因 AN3 判红 */
  const mutGate4 = path.join(tmp, "gate-mutated4.cjs");
  const NEEDLE_TOC = `for (const h of paperRoot.querySelectorAll('h2[id], h3[id]')) {`;
  if (!gateSrc.includes(NEEDLE_TOC)) {
    bad("A6 负对照的前提成立（门禁里找得到目录目标收集那一行）", `没找到「${NEEDLE_TOC}」`);
  } else {
    fs.writeFileSync(
      mutGate4,
      gateSrc.replace(
        NEEDLE_TOC,
        `for (const h of []) { // 自测注入：目录目标收集被卸掉`
      )
    );
    const mut4 = runGate(mutGate4, passDir, ["--width", "360"]);
    const mp4 = parseGateOutput(mut4.out);
    assert(
      mut4.code === 1 && mp4.selfProof.some((l) => /AN3/.test(l)),
      "A6 目录目标收集被卸掉后门禁因 AN3 覆盖自证判红（防目录目标成盲区）",
      `exit=${mut4.code}`
    );
  }

  /* A7：门禁原件没被动过 */
  const GATE_SHA_AFTER = gateDigest(GATE);
  assert(
    GATE_SHA_AFTER === GATE_SHA_BEFORE,
    "A7 门禁原件按 SHA-256 校验没被动过（注入全程只在副本上）",
    `${GATE_SHA_BEFORE.slice(0, 12)}…`
  );
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures) {
  console.error(`\n✗ 滚动定位自测未通过：${failures} 项红。\n`);
  process.exit(1);
}
console.log("\n✓ 滚动定位自测通过：AN1–AN3 每条都证明了能变红。");
process.exit(0);
