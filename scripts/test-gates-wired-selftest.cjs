#!/usr/bin/env node
/**
 * 门禁接线门禁的故障注入自测 —— 守住"GW4（自测脚本也要有人跑）这条判据还在"。
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

/* 真门禁里 EXEMPT 登记的那个门禁（check-live-site.cjs，必须联网、不进 build 链）。
   沙箱里也要给它建壳：GW2 会查"豁免项指向的文件是否还存在"，
   缺了它会先一步判红，把被测形态淹掉。**不给它接进 build 链** ——
   豁免项一旦真接在 build 上，GW2 会判"状态自相矛盾"。 */
const EXEMPTED_GATES = ["check-live-site.cjs"];

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
 *   files      —— 要放进 scripts/ 的文件名数组（内容随便，门禁只看文件名与接线）
 *   extra      —— 额外的 npm script（键值对）
 *   buildExtra —— build 链上额外要跑的 npm script 名
 *   register   —— 往真门禁副本的 EXEMPT_SELFTEST 里注入的登记行
 */
function makeSandbox(dir, opt) {
  const o = Object.assign(
    { files: [], extra: {}, buildExtra: [], register: null },
    opt
  );
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });

  /* 门禁副本：先照抄真门禁，再按需要改 EXEMPT_SELFTEST */
  let gate = fs.readFileSync(path.join(ROOT, GATE_REL), "utf8");
  if (o.register) {
    const anchor = "const EXEMPT_SELFTEST = {";
    if (!gate.includes(anchor)) {
      throw new Error(`注入锚点没找到：${anchor}`);
    }
    gate = gate.replace(anchor, `${anchor}\n${o.register}`);
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
  /* 本档要考察的文件 */
  for (const f of o.files) {
    fs.writeFileSync(path.join(dir, "scripts", f), "// 沙箱占位\n");
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
];

/* ---------- 跑矩阵 ---------- */
const results = [];
let failed = false;

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
for (const r of results) {
  console.log(
    `${r.pass ? "✓" : "✗"} ${r.id}  期望=${r.expect || "-"} 实得=${r.got}  ${r.desc}` +
      (r.detail ? `\n    ${r.detail}` : "")
  );
}
console.log(
  failed
    ? "\n✗ 有档不符合预期——GW4 可能已被卸掉或判据有洞（红因文案也要看，不只看退出码）"
    : "\n✓ 全部符合预期：GW4 还活着，且能抓住它本该抓的缺陷"
);

if (!failed) {
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log("（沙箱已清理）");
} else {
  console.log("（现场已保留，便于人工复查）");
}
process.exit(failed ? 1 : 0);
