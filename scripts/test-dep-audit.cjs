#!/usr/bin/env node
/**
 * 自测 AUD0–AUD9：给 scripts/check-dep-audit.cjs 的每条判据找一次「它会红」的证据
 *
 * 为什么要有这个自测（2026-10-27 场次，缺陷 D115）：
 *   这道门禁守的是「依赖树里没有已知的 high / critical 漏洞」——**防攻击**的一条底座。
 *   而「门禁是绿的」有两种可能：
 *   ① 依赖树确实干净；② **它压根没做成一次漏洞查询（或读错了结果），却报告成"查过了、没问题"**。
 *   2026-10-27 在这台机器上实测到的就是第 ② 种，而且是**两处独立**的：
 *     · **形状错了**（DA1 从未生效）：npm 7+ 的报告里 `vulnerabilities` 是
 *       **数组**（每项是 [包名, 详情] 这一对），旧版按"以包名为键的对象"读
 *       ⇒ 读到的是数组下标 ⇒ `.severity` 恒 undefined ⇒ **真���有 high/critical
 *       漏洞也判绿**；
 *     · **错误对象**（DA2 缺位）：`npm audit` 请求失败时把 `{message, error}`
 *       打到 stdout，旧版同样落到"零漏洞" ⇒ 打印"审计通过"并 exit 0。
 *   ⇒ 所以这里要证明的**不只是**"有漏洞会红"（DA1），更是
 *   **"审计没做成 / 形状不认识时必须红，而不是绿"**（DA2）。
 *
 * 做法（全在临时目录的副本上，仓库里的原件一个字节都不动）：
 *   · 把门禁复制成 <tmp>/scripts/check-dep-audit.cjs；
 *   · 造一份**假 npm**（<tmp>/bin/npm），让它按环境变量指定的夹具打印固定 JSON
 *     —— 靠门禁侧的 `DEP_AUDIT_NPM` 注入（与 check-overflow.cjs 的
 *     `CHROME_PATH` 同一套做法）⇒ **自测全程不联网**。
 *
 * 夹具的形状**照抄**本机 npm 11.19.0 的真实实现
 * （@npmcli/arborist/lib/audit-report.js 的 `toJSON()`）—— 不照抄就会重演
 * "门禁按自己想象的形状读报告"这件事。
 *
 * 档位：
 *   AUD0  基线：完整报告、`vulnerabilities: []` ⇒ 判绿
 *   AUD1  报告里有 high 漏洞（**数组对**形状）⇒ 判红，且红因**只**是 DA1
 *        （**这一档就是原缺陷形态**：真漏洞存在却判绿）
 *   AUD2  npm 返回**错误对象**（2026-10-27 实测到的形状，逐字复刻）⇒ 判红，
 *        且红因**只**是 DA2（一次查询都没做成）
 *   AUD3  报告结构不完整（缺 metadata）⇒ 判红，红因**只**是 DA2
 *   AUD4  （负对照）卸掉门禁副本的 DA2 判定 ⇒ DA2 / DA3 两份夹具必须**转绿**
 *        （证明那条红确实是 DA2 判出来的，不是别处来的）
 *   AUD5  （负对照）卸掉门禁副本的 DA1 判定 ⇒ DA1 夹具必须转绿
 *   AUD6  只报 low / moderate ⇒ 判绿（不判红，防假红）
 *   AUD7  报告缺 `vulnerabilities` 字段 ⇒ 判红 DA2（形状不认识 ⇒ 不给结论）
 *   AUD8  传给 npm 的参数里必须含**写死的官方 registry** 与 --json
 *        （防"有人把 registry 改回镜像源" ⇒ 回到「永远报不出漏洞」的形态）
 *   AUD9  `vulnerabilities` 是**旧的对象形状**（以包名为键）⇒ 判红 DA2
 *        （**这正是旧门禁读错的那一种形状**；必须红，不能绿）
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
const GATE = path.join(ROOT, "scripts", "check-dep-audit.cjs");

function sha256(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

/* 原件指纹：**自测开始时**记下来，收尾时比对 ——
   证明这一整轮注入全在副本上，仓库里的原件一个字节都没动。 */
const GATE_SHA_AT_START = sha256(GATE);

/* 假 npm：把 argv 记下来（DA8 用），把指定夹具打到 stdout，然后按指定码退出。 */
const FAKE_NPM_SOURCE = [
  "#!/usr/bin/env node",
  '"use strict";',
  'const fs = require("fs");',
  'const argvOut = process.env.FAKE_AUDIT_ARGV_OUT;',
  'if (argvOut) fs.writeFileSync(argvOut, JSON.stringify(process.argv.slice(2)));',
  'const fx = process.env.FAKE_AUDIT_FIXTURE;',
  'if (fx && fs.existsSync(fx)) process.stdout.write(fs.readFileSync(fx, "utf8"));',
  'process.exit(Number(process.env.FAKE_AUDIT_EXIT || "0"));',
  ""
].join("\n");

/* 一条 high 漏洞的详情（照抄 npm 的 Vuln.toJSON() 的字段）。 */
const HIGH_VULN = {
  name: "markdown-it",
  severity: "high",
  isDirect: true,
  via: [
    {
      source: 1093928,
      name: "markdown-it",
      dependency: "markdown-it",
      title: "Regular Expression Denial of Service",
      url: "https://github.com/advisories/GHSA-example",
      severity: "high",
      range: "<14.3.3"
    }
  ],
  effects: [],
  range: "<14.3.3",
  nodes: ["node_modules/markdown-it"],
  fixAvailable: { name: "markdown-it", version: "14.3.3", isSemVerMajor: false }
};

const COUNTS = (over) =>
  Object.assign(
    { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
    over || {}
  );

/* 夹具：形状照 npm 7+ 的 `npm audit --json` 真实输出。 */
const FIXTURES = {
  /* 完整且无漏洞的报告 */
  clean: {
    auditReportVersion: 2,
    vulnerabilities: [],
    metadata: {
      vulnerabilities: COUNTS(),
      dependencies: { prod: 11, dev: 119, optional: 0, peer: 0, peerOptional: 0, total: 130 }
    }
  },
  /* 完整且有一个 high 漏洞的报告 */
  high: {
    auditReportVersion: 2,
    vulnerabilities: [["markdown-it", HIGH_VULN]],
    metadata: {
      vulnerabilities: COUNTS({ high: 1, total: 1 }),
      dependencies: { prod: 11, dev: 119, optional: 0, peer: 0, peerOptional: 0, total: 130 }
    }
  },
  /* 2026-10-27 实测到的错误对象（逐字复刻那份形状） */
  errorObject: {
    message:
      "request to https://registry.npmjs.org/-/npm/v1/security/advisories/bulk failed, " +
      "reason: Client network socket disconnected before secure TLS connection was established",
    error: { summary: "", detail: "" }
  },
  /* 结构不完整的报告：不是错误对象，但也不是一份审计报告 */
  incomplete: { auditReportVersion: 2, vulnerabilities: [] },
  /* 只有 low / moderate */
  lowModerate: {
    auditReportVersion: 2,
    vulnerabilities: [
      ["some-pkg", { name: "some-pkg", severity: "low", isDirect: true, via: [], effects: [], range: "<1.0.1", nodes: [], fixAvailable: true }]
    ],
    metadata: {
      vulnerabilities: COUNTS({ low: 1, moderate: 1, total: 2 }),
      dependencies: { prod: 11, dev: 119, optional: 0, peer: 0, peerOptional: 0, total: 130 }
    }
  },
  /* 报告缺 `vulnerabilities` 字段 */
  noVulnsField: {
    auditReportVersion: 2,
    metadata: {
      vulnerabilities: COUNTS(),
      dependencies: { prod: 11, dev: 119, optional: 0, peer: 0, peerOptional: 0, total: 130 }
    }
  },
  /* 旧的对象形状：以包名为键 —— 旧门禁就是按这个形状读的（所以它读出了 0 条） */
  legacyObjectShape: {
    auditReportVersion: 2,
    vulnerabilities: { "markdown-it": HIGH_VULN },
    metadata: {
      vulnerabilities: COUNTS({ high: 1, total: 1 }),
      dependencies: { prod: 11, dev: 119, optional: 0, peer: 0, peerOptional: 0, total: 130 }
    }
  }
};

/* 造一个临时副本区：<tmp>/scripts/<门禁>、<tmp>/bin/npm、<tmp>/fx/*.json */
function makeSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mh-dep-audit-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(dir, "bin"), { recursive: true });
  fs.mkdirSync(path.join(dir, "fx"), { recursive: true });
  fs.copyFileSync(GATE, path.join(dir, "scripts", "check-dep-audit.cjs"));
  const npmPath = path.join(dir, "bin", "npm");
  fs.writeFileSync(npmPath, FAKE_NPM_SOURCE, { mode: 0o755 });
  fs.chmodSync(npmPath, 0o755);
  for (const [name, obj] of Object.entries(FIXTURES)) {
    fs.writeFileSync(path.join(dir, "fx", `${name}.json`), JSON.stringify(obj, null, 2));
  }
  return dir;
}

function gateOf(dir) {
  return path.join(dir, "scripts", "check-dep-audit.cjs");
}

function readArgv(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return null;
  }
}

/* 跑副本里的门禁（假 npm 供它调用），返回 { code, out, argv }。 */
function runGate(dir, fixture, exitCode) {
  const argvOut = path.join(dir, "fx", `${fixture}.argv.json`);
  const env = {
    ...process.env,
    DEP_AUDIT_NPM: path.join(dir, "bin", "npm"),
    FAKE_AUDIT_FIXTURE: path.join(dir, "fx", `${fixture}.json`),
    FAKE_AUDIT_EXIT: String(exitCode === undefined ? 0 : exitCode),
    FAKE_AUDIT_ARGV_OUT: argvOut
  };
  try {
    const out = execFileSync(process.execPath, [gateOf(dir)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env
    });
    return { code: 0, out, argv: readArgv(argvOut) };
  } catch (e) {
    return {
      code: typeof e.status === "number" ? e.status : 1,
      out: `${e.stdout || ""}${e.stderr || ""}`,
      argv: readArgv(argvOut)
    };
  }
}

/* 改副本里的一个文件；注入点找不到就当场抛错（不静默跳过）。 */
function patch(file, from, to) {
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes(from)) {
    throw new Error(
      `注入点不存在，已中止（不静默跳过）：\n  文件：${file}\n  锚点：${from}`
    );
  }
  fs.writeFileSync(file, text.replace(from, to));
}

/** 红因归属纯净：只允许出现 id 这一条判据编号。 */
function onlyCause(out, id) {
  const other = id === "DA1" ? "DA2" : "DA1";
  return out.includes(id) && !out.includes(other);
}

const results = [];
function record(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${id}${detail ? " —— " + detail : ""}`);
}

/* ---------------- DA0：基线 ---------------- */
{
  const dir = makeSandbox();
  const r = runGate(dir, "clean", 0);
  const ok = r.code === 0 && !/DA1|DA2/.test(r.out);
  record(
    "AUD0 基线（完整且无漏洞的报告）",
    ok,
    ok ? "判绿" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- DA1：有 high 漏洞 ⇒ 判红（原缺陷形态：真漏洞存在） ---------------- */
{
  const dir = makeSandbox();
  const r = runGate(dir, "high", 1);
  const ok = r.code === 1 && onlyCause(r.out, "DA1");
  record(
    "AUD1 报告里有 high 漏洞 ⇒ DA1 判红（红因只属于 DA1）",
    ok,
    ok ? "红了，红因点名 DA1" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- DA2：npm 返回错误对象 ⇒ 判红 ---------------- */
{
  const dir = makeSandbox();
  const r = runGate(dir, "errorObject", 1);
  const ok = r.code === 1 && onlyCause(r.out, "DA2");
  record(
    "AUD2 npm 返回错误对象（一次查询都没做成）⇒ DA2 判红（红因只属于 DA2）",
    ok,
    ok ? "红了，红因点名 DA2" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- DA3：报告结构不完整 ⇒ 判红 ---------------- */
{
  const dir = makeSandbox();
  const r = runGate(dir, "incomplete", 1);
  const ok = r.code === 1 && onlyCause(r.out, "DA2");
  record(
    "AUD3 报告结构不完整（缺 metadata）⇒ DA2 判红（红因只属于 DA2）",
    ok,
    ok ? "红了，红因点名 DA2" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- DA4：（负对照）卸掉 DA2 判定 ⇒ 两份夹具转绿 ---------------- */
{
  const dir = makeSandbox();
  patch(gateOf(dir), "if (!isAuditReport) {", "if (false) {");
  const a = runGate(dir, "errorObject", 1);
  const b = runGate(dir, "incomplete", 1);
  const ok = a.code === 0 && b.code === 0;
  record(
    "AUD4 负对照：卸掉 DA2 判定 ⇒ DA2 / DA3 两份夹具转绿",
    ok,
    ok
      ? "两份夹具都转绿 ⇒ 那条红确实是 DA2 判出来的"
      : `errorObject code=${a.code}\nincomplete code=${b.code}\n${a.out}\n${b.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- DA5：（负对照）卸掉 DA1 判定 ⇒ DA1 夹具转绿 ---------------- */
{
  const dir = makeSandbox();
  patch(
    gateOf(dir),
    'const bad = entries.filter((pair) => Array.isArray(pair) && pair[1] && ["high", "critical"].includes(pair[1].severity));',
    "const bad = [];"
  );
  const r = runGate(dir, "high", 1);
  const ok = r.code === 0;
  record(
    "AUD5 负对照：卸掉 DA1 判定 ⇒ DA1 夹具转绿",
    ok,
    ok ? "转绿 ⇒ 那条红确实是 DA1 判出来的" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- DA6：只报 low / moderate ⇒ 判绿 ---------------- */
{
  const dir = makeSandbox();
  const r = runGate(dir, "lowModerate", 1);
  const ok = r.code === 0 && !/DA1|DA2/.test(r.out);
  record(
    "AUD6 只报 low / moderate 级别的公告 ⇒ 判绿（不判红）",
    ok,
    ok ? "判绿" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- DA7：缺 vulnerabilities 字段 ⇒ 判红 ---------------- */
{
  const dir = makeSandbox();
  const r = runGate(dir, "noVulnsField", 0);
  const ok = r.code === 1 && onlyCause(r.out, "DA2");
  record(
    "AUD7 报告缺 vulnerabilities 字段 ⇒ DA2 判红（形状不认识，不给结论）",
    ok,
    ok ? "红了，红因点名 DA2" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- DA8：传给 npm 的参数必须是官方 registry + --json ---------------- */
{
  const dir = makeSandbox();
  const r = runGate(dir, "clean", 0);
  const argv = r.argv || [];
  const hasRegistry = argv.some((a) => a === "--registry=https://registry.npmjs.org");
  const hasJson = argv.includes("--json");
  const ok = r.code === 0 && hasRegistry && hasJson;
  record(
    "AUD8 传给 npm 的参数含写死的官方 registry 与 --json",
    ok,
    ok ? "参数正确" : `argv=${JSON.stringify(argv)}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- DA9：旧的对象形状 ⇒ 判红（形状不认识） ---------------- */
{
  const dir = makeSandbox();
  const r = runGate(dir, "legacyObjectShape", 1);
  const ok = r.code === 1 && onlyCause(r.out, "DA2");
  record(
    "AUD9 vulnerabilities 是旧的对象形状 ⇒ DA2 判红（旧门禁就是按它读的）",
    ok,
    ok ? "红了，红因点名 DA2" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- 收尾：仓库原件没被动过 ---------------- */

const problems = [];
if (sha256(GATE) !== GATE_SHA_AT_START) {
  problems.push("仓库里的门禁原件在自测期间被改动了 —— 自测必须只在副本上注入。");
}

if (problems.length) {
  console.error("\n依赖漏洞审计门禁自测未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

const bad = results.filter((r) => !r.ok);
console.log(
  `\n注入矩阵：${results.length} 档里 ${results.length - bad.length} 档按预期触发` +
    `${bad.length ? `，${bad.length} 档未通过` : ""}（DA4 / DA5 是负对照）。`
);
if (bad.length) bad.forEach((b) => console.log(`  · 未通过：${b.id}`));
console.log("  · 原件校验：门禁的 SHA-256 与自测开始时一致。");
process.exit(bad.length ? 1 : 0);
