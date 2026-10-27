#!/usr/bin/env node
/**
 * 门禁接线门禁的故障注入自测 —— 守住"GW4（自测脚本也要有人跑）、
 * GW5 / GW6（手工脚本也要有人管、且登记得诚实）这几条判据还在"。
 *
 * 为什么要有这个脚本：
 *   仓库里的自测脚本本身就是"判据还活着"的证据来源；而这一族证据
 *   本轮刚出过事：三个自测脚本（test-gates-selfcheck.cjs /
 *   test-dataset-files-gate.cjs / test-log-sections.sh）**没有任何 npm script
 *   引用它们** —— 谁也不会跑 → 判据被卸了也没人知道。
 *   GW4 就是为堵这一族而加的。那么 **GW4 自己被卸掉**（整段删掉、
 *   或者判据改成永远为真）时，谁来发现？—— 就是本脚本。
 *
 * 形态：注入的是"**被测判据本该抓的缺陷**"，不是"删掉判据"。
 *   删掉判据 → 缺陷形态重新变绿 → 本脚本照样判红。
 *   所以每档都断言**红因文案**（不只看退出码）：
 *   红了但红因不是设计的那一条 → 同样算失败。
 *
 * 十五档（M0–M6 沿用，GW5 / GW6 那一族是 M7–M14）：
 *   M0  基线：全绿
 *   M1  新增门禁脚本却没接进 build 链 → GW1
 *   M2  新增自测脚本，既没接 build 链也没登记 → GW4
 *   M3  自测脚本登记在 EXEMPT_SELFTEST 里 → 放行
 *   M4  登记项指向的文件已经不存在 → 名单烂在里面
 *   M5  登记了但没写理由
 *   M6  既登记、又真接在 build 链上 → 自相矛盾
 *   M7  手工脚本既不在 build 链上、也没在 MANUAL_TOOLS 里登记 → GW5
 *   M8  登记了，但**没写明**它 require 的那个未声明依赖 → GW6
 *   M9  登记了并**写明**了那个未声明依赖 → 放行（防止 GW6 变成"必须逐字一致"的假红）
 *   M10 登记项指向的文件已经不存在 → 名单烂在里面（GW5 那一支）
 *   M11 登记了但没写理由 → GW5 那一支
 *   M12 既登记、又真接在 build 链上 → 自相矛盾（GW5 那一支）
 *   M13 接在 build 链上的手工脚本 require 了**未声明**的包 → GW6 另一支
 *   M14 **判据级负对照**：把 GW5 的调用整行摘掉 → M7 那个注入**必须转绿**
 *       （证明那条红确实是 GW5 判出来的，不是别的判据碰巧撞出来的）
 *
 * 用法：node scripts/test-gates-wired-selftest.cjs
 *   沙箱建在 mktemp 风格的临时目录里，**不碰仓库工作树**。
 *
 * ⚠️ 为什么不接进 build 链：本脚本要在沙箱里反复起门禁，耗时远长于一次 build；
 *   接进 build 会让每次提交都等它跑完。"自测要不要进 build 链"属本人拍板
 *   （日志中央台账「待拍板 4」「待拍板 28」）。本门禁在
 *   scripts/check-gates-wired.cjs 的 EXEMPT_SELFTEST 里登记了这件事。
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE_REL = "scripts/check-gates-wired.cjs";
const TMP = path.join(os.tmpdir(), `meteohub-gates-wired-selftest-${process.pid}`);

/* 真门禁里 EXEMPT_SELFTEST 登记的那几个自测脚本 —— 沙箱里必须给它们建壳，
   否则"登记项指向的文件不存在"会先一步判红，把被测形态淹掉。 */
const REGISTERED_SELFTESTS = [
  "test-gates-selfcheck.cjs",
  "test-dataset-files-gate.cjs",
  "test-log-sections.sh",
  "test-gates-wired-selftest.cjs",
];

/* 真门禁里 EXEMPT 登记的那些门禁 —— 沙箱里必须给它们建壳：
   GW2 会查"豁免项指向的文件是否还存在"，缺了它会先一步判红，把被测形态淹掉。
   **不给它们接进 build 链** —— 豁免项一旦真接在 build 上，GW2 会判"状态自相矛盾"。
   ⚠️ 这份名单必须与真门禁的 EXEMPT **逐条同步**：
     2026-10-27 实测 —— check-dep-audit.cjs 进 EXEMPT 时这里没跟上，
     于是**每一档**（含期望绿的那几档）都多出一条"豁免项已经不存在"的假红，
     整道自测长期判红；而它不在 build 链上 ⇒ 没人跑 ⇒ 没人发现。
     ⇒ 往后真门禁的 EXEMPT 一变，这里必须同步改（缺陷台账 D111）。 */
const EXEMPTED_GATES = ["check-live-site.cjs", "check-dep-audit.cjs"];

/* 真门禁里 MANUAL_TOOLS 登记的那些手工工具 —— 沙箱里同样必须给它们建壳：
   否则 GW5 会先一步判红（"登记项指向的文件已经不存在"），把被测形态淹掉。 */
const REGISTERED_MANUALS = [
  "lighthouse-runner.js",
  "screenshot.js",
  "screenshot-paper.js",
  "slow3g-runner.js",
  "contrast_check.py",
  "_contrast_predict.py",
];

function sh(cmd, cwd) {
  return execSync(cmd, { cwd, stdio: "pipe" }).toString();
}

/* ---------- 沙箱 ---------- */
function pkgFor(scripts) {
  return JSON.stringify(
    { name: "sandbox", private: true, version: "0.0.0", scripts },
    null,
    2
  );
}

/**
 * @param {string} dir      沙箱目录
 * @param {object} opt
 *   files        —— 要放进 scripts/ 的文件名数组（内容随便，门禁只看文件名与接线）
 *   extra        —— 额外的 npm script（键值对）
 *   buildExtra   —— build 链上额外要跑的 npm script 名
 *   register     —— 往真门禁副本的 EXEMPT_SELFTEST 里注入的登记行
 *   manual       —— 要放进 scripts/ 的手工工具 [{name, content}]
 *   registerManual —— 往真门禁副本的 MANUAL_TOOLS 里注入的登记行
 *   patchGate    —— [from, to]：改门禁副本的源码（判据级负对照）
 */
function makeSandbox(dir, opt) {
  const o = Object.assign(
    {
      files: [],
      extra: {},
      buildExtra: [],
      register: null,
      manual: [],
      registerManual: null,
      patchGate: null,
    },
    opt
  );
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });

  /* 门禁副本：先照抄真门禁，再按需要改 EXEMPT_SELFTEST / MANUAL_TOOLS */
  let gate = fs.readFileSync(path.join(ROOT, GATE_REL), "utf8");
  if (o.register) {
    const anchor = "const EXEMPT_SELFTEST = {";
    if (!gate.includes(anchor)) {
      throw new Error(`注入锚点没找到：${anchor}`);
    }
    gate = gate.replace(anchor, `${anchor}\n${o.register}`);
  }
  if (o.registerManual) {
    const anchor = "const MANUAL_TOOLS = {";
    if (!gate.includes(anchor)) {
      throw new Error(`注入锚点没找到：${anchor}`);
    }
    gate = gate.replace(anchor, `${anchor}\n${o.registerManual}`);
  }
  if (o.patchGate) {
    const [from, to] = o.patchGate;
    if (!gate.includes(from)) {
      throw new Error(`注入锚点没找到：${from}`);
    }
    gate = gate.replace(from, to);
  }
  fs.writeFileSync(path.join(dir, GATE_REL), gate);

  /* 已登记的自测脚本：给它们建壳（内容不重要） */
  for (const f of REGISTERED_SELFTESTS) {
    fs.writeFileSync(path.join(dir, "scripts", f), "// 沙箱占位\n");
  }
  /* 被豁免的门禁：同样建壳，但**不接进 build 链**（接了 GW2 会判自相矛盾） */
  for (const f of EXEMPTED_GATES) {
    fs.writeFileSync(path.join(dir, "scripts", f), "// 沙箱占位\n");
  }
  /* 已登记的手工工具：同样建壳（GW5 会查"登记项指向的文件是否还存在"） */
  for (const f of REGISTERED_MANUALS) {
    fs.writeFileSync(path.join(dir, "scripts", f), "// 沙箱占位\n");
  }
  /* 本档要考察的文件 */
  for (const f of o.files) {
    fs.writeFileSync(path.join(dir, "scripts", f), "// 沙箱占位\n");
  }
  /* 本档要考察的手工工具（内容可指定：GW6 要看它 require 了什么） */
  for (const m of o.manual) {
    fs.writeFileSync(path.join(dir, "scripts", m.name), m.content || "// 沙箱占位\n");
  }

  const scripts = Object.assign(
    {
      "check:gates": `node ${GATE_REL}`,
      build: "npm run check:gates",
    },
    o.extra
  );
  if (o.buildExtra.length) {
    scripts.build = `${scripts.build} && ${o.buildExtra
      .map((n) => `npm run ${n}`)
      .join(" && ")}`;
  }
  fs.writeFileSync(path.join(dir, "package.json"), pkgFor(scripts));
}

function runGate(dir) {
  try {
    return { code: 0, out: sh(`node ${GATE_REL}`, dir) };
  } catch (e) {
    return {
      code: e.status,
      out: ((e.stdout || "") + (e.stderr || "")).toString(),
    };
  }
}

/* ---------- 名单同步守卫 ----------
   真门禁的三个登记名单（EXEMPT / EXEMPT_SELFTEST / MANUAL_TOOLS）与本文件里
   用来建壳的三份名单**必须逐条一致**。

   为什么要有这一条（缺陷台账 D111 的根因）：
     真门禁的 EXEMPT 多了一条（check-dep-audit.cjs），本文件的建壳名单没跟上
     ⇒ 沙箱里 GW2 先一步判红 ⇒ **每一档**都多一条假红 ⇒ 整道自测长期判红，
     而它不在 build 链上 ⇒ 没人跑 ⇒ 没人发现 ⇒ "判据还活着"的证据链断了一环。
     ⇒ "真源一改、这里必须跟着改"这件事**必须机器守**，不能只靠人记得。 */
function registryKeys(src, name) {
  const start = src.indexOf(`const ${name} = {`);
  if (start < 0) return null;
  const end = src.indexOf("\n};", start);
  if (end < 0) return null;
  const body = src.slice(start, end);
  const keys = [];
  const re = /^\s*"([^"]+)":/gm;
  let m;
  while ((m = re.exec(body)) !== null) keys.push(m[1]);
  return keys;
}

function sameSet(a, b) {
  if (!a || !b) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}

const realGateSrc = fs.readFileSync(path.join(ROOT, GATE_REL), "utf8");
const SYNC_PAIRS = [
  ["EXEMPT", EXEMPTED_GATES],
  ["EXEMPT_SELFTEST", REGISTERED_SELFTESTS],
  ["MANUAL_TOOLS", REGISTERED_MANUALS],
];
const syncProblems = [];
for (const [name, local] of SYNC_PAIRS) {
  const real = registryKeys(realGateSrc, name);
  if (!real) {
    syncProblems.push(`真门禁里找不到 \`const ${name} = {\` 这一段 —— 解析器失效，请当场报错`);
    continue;
  }
  if (!sameSet(real, local)) {
    syncProblems.push(
      `真门禁的 ${name} 与本文件的建壳名单**不一致** —— ` +
        `真门禁：${real.join(" / ")}；本文件：${local.join(" / ")}。` +
        `不一致 ⇒ 沙箱里会先一步判红、把被测形态淹掉（实测：整道自测长期判红而没人发现）。` +
        `改法：两边同步。`
    );
  }
}

/* ---------- 缺陷形态矩阵 ---------- */
const CASES = [
  {
    id: "M0",
    desc: "基线：门禁全部接在 build 上、已登记的自测脚本都在册 —— 期望绿",
    expect: "green",
    mustContain: [],
    build: () => makeSandbox(path.join(TMP, "m0"), {}),
  },
  {
    id: "M1",
    desc: "新增一个门禁脚本却没接进 build 链（GW1 该抓）",
    expect: "red",
    mustContain: ["check-demo.cjs", "没有被任何 npm script 引用"],
    build: () => makeSandbox(path.join(TMP, "m1"), { files: ["check-demo.cjs"] }),
  },
  {
    id: "M2",
    desc: "新增一个自测脚本，既没接 build 链也没登记（GW4 该抓）",
    expect: "red",
    mustContain: ["test-demo.cjs", "自测脚本", "EXEMPT_SELFTEST"],
    build: () => makeSandbox(path.join(TMP, "m2"), { files: ["test-demo.cjs"] }),
  },
  {
    id: "M3",
    desc: "同一个自测脚本登记在 EXEMPT_SELFTEST 里 —— 必须放行",
    expect: "green",
    mustContain: [],
    build: () =>
      makeSandbox(path.join(TMP, "m3"), {
        files: ["test-demo.cjs"],
        register: '  "test-demo.cjs": "沙箱里的登记理由。",',
      }),
  },
  {
    id: "M4",
    desc: "登记项指向的文件已经不存在（名单烂在里面）",
    expect: "red",
    mustContain: ["test-ghost.cjs", "已经不存在"],
    build: () =>
      makeSandbox(path.join(TMP, "m4"), {
        register: '  "test-ghost.cjs": "指向一个不存在的文件。",',
      }),
  },
  {
    id: "M5",
    desc: "登记了但没写理由",
    expect: "red",
    mustContain: ["test-demo.cjs", "没有写理由"],
    build: () =>
      makeSandbox(path.join(TMP, "m5"), {
        files: ["test-demo.cjs"],
        register: '  "test-demo.cjs": "",',
      }),
  },
  {
    id: "M6",
    desc: "既登记、又真接在 build 链上（状态自相矛盾）",
    expect: "red",
    mustContain: ["test-demo.cjs", "自相矛盾"],
    build: () =>
      makeSandbox(path.join(TMP, "m6"), {
        files: ["test-demo.cjs"],
        extra: { "check:demo-selftest": "node scripts/test-demo.cjs" },
        buildExtra: ["check:demo-selftest"],
        register: '  "test-demo.cjs": "登记了，但事实上它已经接在 build 链上。",',
      }),
  },

  /* ---------- GW5 / GW6：手工脚本这一族 ---------- */

  {
    id: "M7",
    desc: "手工脚本既不在 build 链上、也没在 MANUAL_TOOLS 里登记（GW5 该抓）",
    expect: "red",
    mustContain: ["demo-tool.js", "MANUAL_TOOLS"],
    build: () =>
      makeSandbox(path.join(TMP, "m7"), {
        manual: [{ name: "demo-tool.js", content: "// 沙箱占位\n" }],
      }),
  },
  {
    id: "M8",
    desc: "登记了，但没写明它 require 的那个未声明依赖（GW6 该抓）",
    expect: "red",
    mustContain: ["demo-tool.js", "ghost-pkg", "没有写明"],
    build: () =>
      makeSandbox(path.join(TMP, "m8"), {
        manual: [{ name: "demo-tool.js", content: "require('ghost-pkg');\n" }],
        registerManual: '  "demo-tool.js": "手工工具：需要本机 Chrome 与本地静态服务器。",',
      }),
  },
  {
    id: "M9",
    desc: "登记了并写明了那个未声明依赖 —— 必须放行（防 GW6 变成假红）",
    expect: "green",
    mustContain: [],
    build: () =>
      makeSandbox(path.join(TMP, "m9"), {
        manual: [{ name: "demo-tool.js", content: "require('ghost-pkg');\n" }],
        registerManual:
          '  "demo-tool.js": "手工工具：需要 ghost-pkg 这个包（不在 package.json 里）。",',
      }),
  },
  {
    id: "M10",
    desc: "MANUAL_TOOLS 登记项指向的文件已经不存在（名单烂在里面）",
    expect: "red",
    mustContain: ["ghost-tool.js", "已经不存在"],
    build: () =>
      makeSandbox(path.join(TMP, "m10"), {
        registerManual: '  "ghost-tool.js": "指向一个不存在的文件。",',
      }),
  },
  {
    id: "M11",
    desc: "手工工具登记了但没写理由",
    expect: "red",
    mustContain: ["demo-tool.js", "没有写理由"],
    build: () =>
      makeSandbox(path.join(TMP, "m11"), {
        manual: [{ name: "demo-tool.js", content: "// 沙箱占位\n" }],
        registerManual: '  "demo-tool.js": "",',
      }),
  },
  {
    id: "M12",
    desc: "手工工具既登记、又真接在 build 链上（状态自相矛盾）",
    expect: "red",
    mustContain: ["demo-tool.js", "自相矛盾"],
    build: () =>
      makeSandbox(path.join(TMP, "m12"), {
        manual: [{ name: "demo-tool.js", content: "// 沙箱占位\n" }],
        extra: { "check:demo-tool": "node scripts/demo-tool.js" },
        buildExtra: ["check:demo-tool"],
        registerManual: '  "demo-tool.js": "登记了，但它事实上已经接在 build 链上。",',
      }),
  },
  {
    id: "M13",
    desc: "接在 build 链上的手工脚本 require 了未声明的包（GW6 另一支）",
    expect: "red",
    mustContain: ["demo-tool.js", "ghost-pkg", "npm ci"],
    build: () =>
      makeSandbox(path.join(TMP, "m13"), {
        manual: [{ name: "demo-tool.js", content: "require('ghost-pkg');\n" }],
        extra: { "check:demo-tool": "node scripts/demo-tool.js" },
        buildExtra: ["check:demo-tool"],
      }),
  },
  {
    id: "M14",
    desc: "判据级负对照：把 GW5 的调用整行摘掉 → M7 那个注入必须转绿",
    expect: "green",
    mustContain: [],
    build: () =>
      makeSandbox(path.join(TMP, "m14"), {
        manual: [{ name: "demo-tool.js", content: "// 沙箱占位\n" }],
        patchGate: [
          "for (const p of checkManualTools(manualFiles)) problems.push(p);",
          "// （判据级负对照：GW5 已被摘掉）",
        ],
      }),
  },
];

/* ---------- 跑矩阵 ---------- */
const results = [];
let failed = false;
if (syncProblems.length) failed = true;

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

for (const c of CASES) {
  let g;
  try {
    c.build();
    g = runGate(path.join(TMP, c.id.toLowerCase()));
  } catch (e) {
    failed = true;
    results.push({
      id: c.id,
      desc: c.desc,
      expect: c.expect,
      got: "沙箱构建失败",
      pass: false,
      detail: String(e.message || e),
    });
    continue;
  }

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
      (reasons
        ? `红因：${reasons}`
        : g.out
            .split("\n")
            .filter(Boolean)
            .slice(-1)[0] || ""),
  });
}

/* ---------- P0：真仓库当前状态必须绿 ----------
   沙箱全绿只说明判据在该抓的时候抓了；真仓库绿才说明"此刻没有欠账"。 */
{
  const g = runGate(ROOT);
  const ok = g.code === 0;
  if (!ok) failed = true;
  results.push({
    id: "P0",
    desc: "基线（真仓库当前状态）必须绿",
    expect: "green",
    got: g.code === 0 ? "GREEN" : "RED",
    pass: ok,
    detail:
      g.code === 0
        ? ""
        : g.out
            .split("\n")
            .filter((l) => l.includes("✗"))
            .join(" | "),
  });
}

console.log("\n=== 门禁接线门禁自测（注入式）===");
console.log(`沙箱：${TMP}`);
console.log(
  syncProblems.length
    ? `✗ 名单同步守卫：${syncProblems.join(" | ")}`
    : "✓ 名单同步守卫：真门禁的 EXEMPT / EXEMPT_SELFTEST / MANUAL_TOOLS 与本文件的建壳名单逐条一致"
);
for (const r of results) {
  console.log(
    `${r.pass ? "✓" : "✗"} ${r.id}  期望=${r.expect || "-"} 实得=${r.got}  ${r.desc}` +
      (r.detail ? `\n    ${r.detail}` : "")
  );
}
console.log(
  failed
    ? "\n✗ 有档不符合预期——GW4 / GW5 / GW6 可能已被卸掉或判据有洞（红因文案也要看，不只看退出码）"
    : "\n✓ 全部符合预期：GW4 / GW5 / GW6 还活着，且能抓住它们本该抓的缺陷"
);

if (!failed) {
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log("（沙箱已清理）");
} else {
  console.log("（现场已保留，便于人工复查）");
}
process.exit(failed ? 1 : 0);
