#!/usr/bin/env node
/**
 * 产物洁净度门禁（scripts/check-artifact-hygiene.cjs）的本地夹具自测。
 *
 * 这个自测要证明两件事，缺一不可：
 *   ① 门禁**能变红** —— 每条判据各有一档注入，让它真的报出来。
 *   ② 门禁**红得准** —— 只断言「注入能变红」不够，那只说明门禁**有反应**，
 *      不说明红因来自**那一条判据**。所以每档红都同时断言两件事：
 *      · 该条判据的编号**必须出现在失败条目里**（「· AHn：」）；
 *      · **其它**判据的编号**必须不出现**（否则就是同源缺陷，红因不纯）。
 *      再给每条判据补一档**负对照**：把门禁副本里的 `const AHn_ON = true;`
 *      改成 false 之后，对应的注入必须**转绿**，才能证明红因确实是这一条
 *      判据判出来的。
 *
 * 另有多档是「必须判绿」的边界负对照 —— 它们对应门禁头里写下的**假红清单**：
 *   · URL 域名后面的路径（`https://example.com/home/user/profile`）；
 *   · 站内根相对路径（`/assets/css/tokens.css`）；
 *   · 只有一段的 `/home/x`（根后面段数不够）；
 *   · `console.warn`（正当告警，不在判红范围内）；
 *   · HTML **正文**里出现的 `console.log` 字样（只判 <script> 标签里的）。
 *
 * 夹具站用真实产物的**副本**（门禁要扫整个产物，副本才完整），
 * 注入全部打在副本上；跑完断言仓库里真的那份产物与门禁原件**一个字节都没变**。
 *
 * 用法：node scripts/test-artifact-hygiene.cjs
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-artifact-hygiene.cjs");
const REAL_SITE = path.join(ROOT, "_site");

/* 注入锚点（相对**产物目录**；必须真实存在 —— 锚点不存在就是坏跑，当场暴露）。 */
const INDEX_HTML = "index.html";
const MAIN_JS = path.join("assets", "js", "main.js");

if (!fs.existsSync(REAL_SITE)) {
  console.error(
    `产物洁净度门禁自测失败：找不到产物目录 ${REAL_SITE} —— ` +
      `夹具站的基线要靠它，先跑一次 npm run build。`
  );
  process.exit(1);
}
for (const anchor of [INDEX_HTML, MAIN_JS]) {
  if (!fs.existsSync(path.join(REAL_SITE, anchor))) {
    console.error(`产物洁净度门禁自测失败：产物里找不到 ${anchor} —— 注入锚点没了，坏跑。`);
    process.exit(1);
  }
}

/* ---------- 夹具站 ---------- */

function copyTree(fromDir, toDir) {
  fs.mkdirSync(toDir, { recursive: true });
  for (const e of fs.readdirSync(fromDir, { withFileTypes: true })) {
    if (e.name.startsWith("._")) continue; // exFAT 上的 AppleDouble 资源叉
    if (e.name === ".DS_Store") continue;
    const p = path.join(fromDir, e.name);
    if (e.isDirectory()) copyTree(p, path.join(toDir, e.name));
    else if (e.isFile()) fs.copyFileSync(p, path.join(toDir, e.name));
  }
}

function buildFixture(id) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `mh-hygiene-${id}-`));
  copyTree(REAL_SITE, path.join(root, "_site"));
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  const gate = path.join(root, "scripts", "check-artifact-hygiene.cjs");
  fs.copyFileSync(GATE, gate);
  return { root, gate, site: path.join(root, "_site") };
}

/* ---------- 注入动作 ---------- */

/** 改一个文件：fn 收到原文，返回新原文；返回是否真的改动了。 */
function mutate(file, fn) {
  const before = fs.readFileSync(file, "utf8");
  const after = fn(before);
  if (after === before) return false;
  fs.writeFileSync(file, after);
  return true;
}

/** 在 index.html 的 </body> 前插一段内容。 */
function insertIntoIndex(fx, snippet) {
  const file = path.join(fx.site, INDEX_HTML);
  const ok = mutate(file, (t) => {
    if (!t.includes("</body>")) return t;
    return t.replace("</body>", `${snippet}\n</body>`);
  });
  if (!ok) throw new Error("没找到 index.html 里的 </body>");
}

/** 在 main.js 末尾追加一行代码。 */
function appendToMainJs(fx, snippet) {
  const file = path.join(fx.site, MAIN_JS);
  const ok = mutate(file, (t) => t + "\n" + snippet + "\n");
  if (!ok) throw new Error("没能往 main.js 末尾追加内容");
}

/** 在门禁副本里把某条判据卸掉（`const AHn_ON = true;` → false）。 */
function patchGate(fx, name) {
  const needle = `const ${name}_ON = true;`;
  const before = fs.readFileSync(fx.gate, "utf8");
  if (!before.includes(needle)) throw new Error(`门禁副本里找不到 ${needle}`);
  fs.writeFileSync(fx.gate, before.replace(needle, `const ${name}_ON = false;`));
}

const INJECT = {
  /* AH1：产物里出现构建机的绝对路径 */
  machinePath: (fx) => {
    insertIntoIndex(fx, '<p data-mh="/Users/liyihang/Desktop/secret-notes.txt"></p>');
  },
  /* AH1：URL 域名后面的路径（不是本机路径） */
  urlPath: (fx) => {
    insertIntoIndex(fx, '<p data-mh="https://example.com/home/user/profile"></p>');
  },
  /* AH1：站内根相对路径 + 只有一段的机器根路径 */
  sitePaths: (fx) => {
    insertIntoIndex(
      fx,
      '<p data-mh="/assets/css/tokens.css"></p>\n<p data-mh="/home/x"></p>\n<p data-mh="/tmp/y"></p>'
    );
  },
  /* AH2：外链 JS 里留调试语句 */
  consoleLog: (fx) => {
    appendToMainJs(fx, 'console.log("mh-hygiene-probe");');
  },
  /* AH2：console.warn 是正当告警，不该判红 */
  consoleWarn: (fx) => {
    appendToMainJs(fx, 'console.warn("mh-hygiene-probe");');
  },
  /* AH2：debugger 语句 */
  debuggerStmt: (fx) => {
    appendToMainJs(fx, "debugger;");
  },
  /* AH2：HTML 内联脚本里的调试语句 */
  inlineConsoleLog: (fx) => {
    insertIntoIndex(fx, '<script>console.log("mh-hygiene-probe");</script>');
  },
  /* AH2：HTML 正文里的同名字样（不在 <script> 标签里） */
  bodyConsoleLog: (fx) => {
    insertIntoIndex(fx, '<p>console.log("mh-hygiene-probe")</p>');
  },
  /* AH3：把产物抽空 ⇒ 覆盖度自证必须判红 */
  emptyProduct: (fx) => {
    fs.rmSync(fx.site, { recursive: true, force: true });
  },
};

/* ---------- 跑门禁 ---------- */
function runGate(fx) {
  const env = Object.assign({}, process.env);
  delete env.SITE_DIR;
  const r = spawnSync(process.execPath, [fx.gate], {
    env: Object.assign(env, { SITE_DIR: fx.site }),
    encoding: "utf8",
  });
  return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
}

/** 失败条目在门禁输出里长这样：「  · AH1：……」 —— 只认这一种，不认通过行。 */
function failBullet(out, id) {
  return out.includes("· " + id + "：");
}

/** 输出里出现了哪些判据编号的失败条目。 */
function bulletsFound(out) {
  const ids = new Set();
  const re = /· (AH\d)：/g;
  let m;
  while ((m = re.exec(out)) !== null) ids.add(m[1]);
  return ids;
}

/* ---------- 注入矩阵 ---------- */
const CASES = [
  {
    id: "HY0",
    expect: "green",
    desc: "基线：真实产物（无本机路径、无调试语句）",
    apply: () => {},
  },
  {
    id: "HY1",
    expect: "red",
    must: ["AH1"],
    forbid: ["AH2", "AH3"],
    desc: "产物里出现构建机的绝对路径（AH1）",
    apply: (fx) => INJECT.machinePath(fx),
  },
  {
    id: "HY2",
    expect: "green",
    desc: "URL 域名后面的路径不算本机路径（假红清单第 ② 条）",
    apply: (fx) => INJECT.urlPath(fx),
  },
  {
    id: "HY3",
    expect: "green",
    desc: "站内根相对路径与只有一段的机器根路径都不算（假红清单第 ① ③ 条）",
    apply: (fx) => INJECT.sitePaths(fx),
  },
  {
    id: "HY4",
    expect: "red",
    must: ["AH2"],
    forbid: ["AH1", "AH3"],
    desc: "外链 JS 里留 console.log（AH2）",
    apply: (fx) => INJECT.consoleLog(fx),
  },
  {
    id: "HY5",
    expect: "green",
    desc: "console.warn 是正当告警，不判红（假红清单第 ④ 条）",
    apply: (fx) => INJECT.consoleWarn(fx),
  },
  {
    id: "HY6",
    expect: "red",
    must: ["AH2"],
    forbid: ["AH1", "AH3"],
    desc: "JS 里留 debugger 语句（AH2）",
    apply: (fx) => INJECT.debuggerStmt(fx),
  },
  {
    id: "HY7",
    expect: "red",
    must: ["AH2"],
    forbid: ["AH1", "AH3"],
    desc: "HTML 内联脚本里留 console.log（AH2）",
    apply: (fx) => INJECT.inlineConsoleLog(fx),
  },
  {
    id: "HY8",
    expect: "green",
    desc: "HTML 正文里的 console.log 字样不算（只判 <script> 标签里的）",
    apply: (fx) => INJECT.bodyConsoleLog(fx),
  },
  {
    id: "HY9",
    expect: "red",
    must: ["AH3"],
    forbid: ["AH1", "AH2"],
    desc: "抽掉整个产物 ⇒ 覆盖度自证必须判红（AH3）",
    apply: (fx) => INJECT.emptyProduct(fx),
  },
  {
    id: "HY10",
    expect: "green",
    desc: "负对照：卸掉 AH1 判定 ⇒ HY1 的注入转绿",
    apply: (fx) => {
      patchGate(fx, "AH1");
      INJECT.machinePath(fx);
    },
  },
  {
    id: "HY11",
    expect: "green",
    desc: "负对照：卸掉 AH2 判定 ⇒ HY4 的注入转绿",
    apply: (fx) => {
      patchGate(fx, "AH2");
      INJECT.consoleLog(fx);
    },
  },
  {
    id: "HY12",
    expect: "green",
    desc: "负对照：卸掉 AH3 判定 ⇒ HY9 的注入转绿",
    apply: (fx) => {
      patchGate(fx, "AH3");
      INJECT.emptyProduct(fx);
    },
  },
];

/* ---------- 真目录与门禁原件的指纹（跑完自证没被动过） ---------- */
function fingerprint(dir) {
  const hash = crypto.createHash("sha256");
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1
    )) {
      if (e.name.startsWith("._")) continue;
      const p = path.join(d, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        walk(p, r);
      } else if (e.isFile()) {
        hash.update(r);
        hash.update(fs.readFileSync(p));
      }
    }
  };
  walk(dir, "");
  return hash.digest("hex");
}

const beforeSite = fingerprint(REAL_SITE);
const beforeGate = crypto.createHash("sha256").update(fs.readFileSync(GATE)).digest("hex");

/* ---------- 跑 ---------- */
let failed = 0;
const lines = [];
for (const c of CASES) {
  const fx = buildFixture(c.id);
  try {
    c.apply(fx);
  } catch (e) {
    failed++;
    lines.push(`✗ ${c.id} 注入失败：${e.message}`);
    fs.rmSync(fx.root, { recursive: true, force: true });
    continue;
  }
  const { code, out } = runGate(fx);
  const want = c.expect === "green" ? 0 : 1;
  if (code !== want) {
    failed++;
    lines.push(`✗ ${c.id}（${c.desc}）：期望 exit ${want}，实测 exit ${code}\n${out.trim()}`);
    fs.rmSync(fx.root, { recursive: true, force: true });
    continue;
  }
  if (c.expect === "red") {
    const missing = (c.must || []).filter((id) => !failBullet(out, id));
    if (missing.length) {
      failed++;
      lines.push(
        `✗ ${c.id}（${c.desc}）：判红了，但红因里**看不到**「${missing.join(" / ")}」\n${out.trim()}`
      );
      fs.rmSync(fx.root, { recursive: true, force: true });
      continue;
    }
    /* 红因必须**纯**：同源缺陷会让「红因归属」不可判定。 */
    const found = bulletsFound(out);
    const impure = (c.forbid || []).filter((id) => found.has(id));
    if (impure.length) {
      failed++;
      lines.push(
        `✗ ${c.id}（${c.desc}）：红因里混进了不该有的判据「${impure.join(" / ")}」—— ` +
          `这一档只该由一条判据判红\n${out.trim()}`
      );
      fs.rmSync(fx.root, { recursive: true, force: true });
      continue;
    }
    lines.push(`✓ ${c.id}  ${c.desc} → 判红，红因点名到位且不串味`);
  } else {
    if (!out.includes("产物洁净度门禁通过")) {
      failed++;
      lines.push(`✗ ${c.id}（${c.desc}）：判绿，但没打出通过语\n${out.trim()}`);
      fs.rmSync(fx.root, { recursive: true, force: true });
      continue;
    }
    lines.push(`✓ ${c.id}  ${c.desc} → 判绿（负对照通过）`);
  }
  fs.rmSync(fx.root, { recursive: true, force: true });
}

/* ---------- 自证：真目录与门禁原件一个字节都没变 ---------- */
if (fingerprint(REAL_SITE) !== beforeSite) {
  failed++;
  lines.push("✗ 自测动了仓库里的 _site/ —— 夹具站必须与真目录彻底分开。");
}
if (crypto.createHash("sha256").update(fs.readFileSync(GATE)).digest("hex") !== beforeGate) {
  failed++;
  lines.push("✗ 自测动了仓库里的门禁原件 —— 负对照必须打在副本上。");
}

if (failed) {
  console.error("产物洁净度门禁自测未通过：\n");
  lines.forEach((l) => console.error(`  ${l}`));
  console.error(`\n  ${failed} 档未通过。\n`);
  process.exit(1);
}

console.log(`产物洁净度门禁自测通过：${CASES.length} 档（HY0–HY12）注入矩阵全部符合预期。`);
lines.forEach((l) => console.log(`  ${l}`));
