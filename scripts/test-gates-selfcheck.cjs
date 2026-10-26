#!/usr/bin/env node
/**
 * 门禁自测（注入式）—— 守住"**承重的判据本身还在**"这件事。
 *
 * 为什么需要这个脚本（一次实测出来的病，不是假想）：
 *   门禁里的"自证存活"（一处都没比过就判红）是**段级**的：它能发现
 *   "判据跑起来没报错"，但**守不到"判据被人删掉了"**——
 *   整段被删时，自证代码自己也没了，门禁照样全绿。
 *   实测（M4 首页段）：把那一整段从门禁文件里删掉 → 门禁 exit 0、
 *   零红因 → 站点从此静默丢掉这道防线，没有任何报错。
 *
 *   这类"文件头清单 ↔ 代码段"的对���是本仓库反复吃过的亏
 *   （门禁 8、门禁 24/29 的段级自证）。解法不是再加一条段内自证，
 *   而是**把自证放到被测文件外面**：本脚本自己注入故障、自己跑门禁、
 *   自己断言**红因文案**（不只是退出码）。
 *   → 判据一旦被卸掉，对应的注入用例就红，脚本判红。
 *
 * 形态：注入的是"**被测判据本该抓的缺陷**"，不是"删掉判据"。
 *   删掉判据 → 缺陷形态重新变绿 → 本脚本照样判红。效果等价，且
 *   断言的是"门禁抓没抓住真正的缺陷"，不是"文件里有没有那段文字"。
 *
 * 怎么跑：node scripts/test-gates-selfcheck.cjs
 *   · 自己建隔离克隆（应用当前工作树的未提交改动），**不写共享工作树**
 *   · 逐档：注入 → 重建产物 → 跑对应门禁 → 断言退出码与红因文案
 *   · 跑完清理；失败时保留现场并打印路径
 *
 * ⚠️ 为什么不接进 build 链：本脚本会 clone + 重建，耗时远长于一次 build，
 *   接进 build 会让每次提交都要等它跑完。门禁接线门禁只管
 *   `check-*.cjs` / `verify-*.cjs`（GATE_FILE_RE），本文件用 `test-` 前缀，
 *   不在它的管辖范围内 → 需���人手动跑。这条局限必须写明：
 *   **"没人跑 = 没人知道判据被卸了"**。
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const TMP = path.join(os.tmpdir(), `meteohub-gates-selfcheck-${process.pid}`);

const IDENTITY_GATE = "scripts/check-identity-handles.cjs";
const ARTIFACT_GATE = "scripts/check-artifact-metadata.cjs";

/* ---------- 隔离克隆：带 .git（eleventy 取 lastCommitTime 要用）+ 应用工作树改动 ---------- */
function sh(cmd, cwd) {
  return execSync(cmd, { cwd, stdio: "pipe" }).toString();
}

function prepare() {
  fs.rmSync(TMP, { recursive: true, force: true });
  sh(`git clone -q ${JSON.stringify(ROOT)} ${JSON.stringify(TMP)}`);
  // 未提交的改动（已暂存 + 未暂存）一起带过去；未跟踪文件不带
  // （那属于别的工作流，本脚本不碰）
  const diff = execSync("git diff HEAD", { cwd: ROOT, stdio: "pipe" }).toString();
  if (diff.trim()) {
    const patchFile = path.join(TMP, ".selfcheck.patch");
    fs.writeFileSync(patchFile, diff);
    sh(`git apply ${JSON.stringify(patchFile)}`, TMP);
    fs.rmSync(patchFile);
  }
  // node_modules 复用（不重新装，省时间）
  const nm = path.join(ROOT, "node_modules");
  if (fs.existsSync(nm)) {
    fs.symlinkSync(nm, path.join(TMP, "node_modules"));
  }
}

/* ---------- 门禁运行 ---------- */
function runGate(rel) {
  try {
    const out = sh(`node ${rel}`, TMP);
    return { code: 0, out };
  } catch (e) {
    return {
      code: e.status,
      out: ((e.stdout || "") + (e.stderr || "")).toString(),
    };
  }
}

function rebuild() {
  execSync("npx eleventy >/dev/null 2>&1", { cwd: TMP });
}

const read = (rel) => fs.readFileSync(path.join(TMP, rel), "utf8");
const write = (rel, s) => fs.writeFileSync(path.join(TMP, rel), s);

function inject(rel, from, to) {
  const before = read(rel);
  if (!before.includes(from)) {
    return { ok: false, why: `注入锚点没找到：${JSON.stringify(from.slice(0, 60))}` };
  }
  write(rel, before.replace(from, to));
  const after = read(rel);
  if (after === before) {
    return { ok: false, why: "注入后文件内容没变（replace 未命中？）" };
  }
  return { ok: true };
}

function revert(rel, backup) {
  write(rel, backup);
}

/* ---------- 缺陷形态矩阵 ---------- */
const CASES = [
  {
    id: "D1",
    desc: "可见 GitHub 链接被换成冒名账号（I5 该抓）",
    gate: IDENTITY_GATE,
    expect: "red",
    mustContain: ["页面上可见", "oldsixxiaolv"],
    apply() {
      return inject(
        "src/_data/site.js",
        'github: identityUrl("github.com"),',
        'github: "https://github.com/impersonator",'
      );
    },
  },
  {
    id: "D2",
    desc: "可见身份链接整条删除（I5 该抓）",
    gate: IDENTITY_GATE,
    expect: "red",
    mustContain: ["页面上可见"],
    apply() {
      return inject("src/_data/site.js", 'github: identityUrl("github.com"),\n', "");
    },
  },
  {
    id: "D3",
    desc: "publications[0].code 绕过常量改回字面量（M4 该抓）",
    gate: ARTIFACT_GATE,
    expect: "red",
    mustContain: ["publications[].code"],
    apply() {
      return inject(
        "src/_data/site.js",
        "code: TRMM_CODE_REPO,",
        'code: "https://github.com/oldsixxiaolv/Manuscript_Lvyh_FORK",'
      );
    },
  },
  {
    id: "D4",
    desc: "author.paperCodeRepo 绕过常量改回字面量（M4 该抓）",
    gate: ARTIFACT_GATE,
    expect: "red",
    mustContain: ["author.paperCodeRepo"],
    apply() {
      return inject(
        "src/_data/site.js",
        "paperCodeRepo: TRMM_CODE_REPO,",
        'paperCodeRepo: "https://github.com/oldsixxiaolv/OtherRepo",'
      );
    },
  },
  {
    id: "D5",
    desc: "首页模板改回硬编码字面量（M4 该抓——存在性判据抓不到这一档）",
    gate: ARTIFACT_GATE,
    expect: "red",
    mustContain: ["首页正文那行代码仓链接指向"],
    apply() {
      return inject(
        "src/index.njk",
        "{{ site.author.paperCodeRepo }}",
        "https://github.com/oldsixxiaolv/HardcodedInTemplate"
      );
    },
  },
  {
    id: "D6",
    desc: "合法变更：常量换成新 URL（两处同步）——必须放行",
    gate: ARTIFACT_GATE,
    expect: "green",
    mustContain: [],
    apply() {
      return inject(
        "src/_data/site.js",
        'const TRMM_CODE_REPO = "https://github.com/oldsixxiaolv/Manuscript_Lvyh";',
        'const TRMM_CODE_REPO = "https://github.com/oldsixxiaolv/Manuscript_Lvyh_v2";'
      );
    },
  },
  {
    id: "D7",
    desc:
      "期望集锚失守时，「本轮跳过了哪几条判定」的说明必须打出来" +
      "（notes 曾因结构原因排在 process.exit(1) 之后 ⇒ 结构性死代码：红路径永远打不出）",
    gate: IDENTITY_GATE,
    expect: "red",
    mustContain: [
      "**跳过**产物侧全集判定（I1）",
      "**跳过**人读路径判定（I5）",
      "**跳过**产品侧可见身份链接判定（I7）",
      "**跳过**可见性一致性判定（I8）",
    ],
    apply() {
      /* 注入锚失守：把期望集的哈希锚改掉一位 → I2c 判红 → anchorTrustworthy=false
         → I1/I5/I7/I8 四条判定本轮跳过（四条 note 同时被 push）。
         ⚠️ 注入锚用「常量定义的那一行开头」而不是那一串哈希值本身：
            哈希值会随期望集合法增删而变，写死整串会有一天突然"注入失败"。 */
      return inject(
        "scripts/check-identity-handles.cjs",
        'const ORACLE_SET_SHA256 = "',
        'const ORACLE_SET_SHA256 = "0'
      );
    },
  },
];

/* ---------- 跑矩阵 ---------- */
const results = [];
let failed = false;

prepare();

const backups = {};
/* IDENTITY_GATE 也在备份清单里：D7 档要往门禁文件里注入"锚失守"，
   注入必须能被还原——否则这一档的注入会漏到后面的档位和基线里，
   让"后面的档位红了"变成"其实是被上一档污染了"。 */
for (const rel of ["src/_data/site.js", "src/index.njk", IDENTITY_GATE]) {
  backups[rel] = read(rel);
}

for (const c of CASES) {
  // 每档都从干净状态开始
  for (const rel of Object.keys(backups)) revert(rel, backups[rel]);
  rebuild();

  const inj = c.apply();
  if (!inj.ok) {
    failed = true;
    results.push({
      id: c.id,
      desc: c.desc,
      got: "注入失败",
      pass: false,
      detail: inj.why,
    });
    continue;
  }

  rebuild(); // 注入后必须重建，否则读到的是上一档的产物
  const g = runGate(c.gate);
  const red = g.code !== 0;
  const hit = c.expect === "red" ? red : !red;
  const missing = c.mustContain.filter((m) => !g.out.includes(m));
  const pass = hit && missing.length === 0;
  if (!pass) failed = true;

  const reasons = g.out
    .split("\n")
    .filter((l) => l.includes("✗"))
    .map((l) => l.trim())
    .join(" | ");

  results.push({
    id: c.id,
    desc: c.desc,
    expect: c.expect,
    got: red ? "RED" : "GREEN",
    pass,
    detail:
      (missing.length ? `红因缺片段 ${JSON.stringify(missing)}；` : "") +
      (reasons ? `红因：${reasons}` : g.out.split("\n").filter(Boolean).slice(-1)[0] || ""),
  });
}

// 还原 + 基线必须绿
for (const rel of Object.keys(backups)) revert(rel, backups[rel]);
rebuild();
for (const rel of [IDENTITY_GATE, ARTIFACT_GATE]) {
  const g = runGate(rel);
  const ok = g.code === 0;
  if (!ok) failed = true;
  results.push({
    id: "P",
    desc: `基线（还原后）${rel} 必须绿`,
    expect: "green",
    got: g.code === 0 ? "GREEN" : "RED",
    pass: ok,
    detail: g.code === 0 ? "" : g.out.split("\n").filter((l) => l.includes("✗")).join(" | "),
  });
}

console.log("\n=== 门禁自测（注入式）===");
console.log(`隔离克隆：${TMP}`);
for (const r of results) {
  console.log(
    `${r.pass ? "✓" : "✗"} ${r.id}  期望=${r.expect || "-"} 实得=${r.got}  ${r.desc}` +
      (r.detail ? `\n    ${r.detail}` : "")
  );
}
console.log(
  failed
    ? "\n✗ 有档不符合预期——门禁可能已被卸掉或判据有洞（红因文案也要看，不只看退出码）"
    : "\n✓ 全部符合预期：判据还活着，且能抓住它本该抓的缺陷"
);

if (!failed) {
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log("（隔离克隆已清理）");
} else {
  console.log("（现场已保留，便于人工复查）");
}
process.exit(failed ? 1 : 0);
