#!/usr/bin/env node
/**
 * 依赖漏洞审计（联网）—— 判据 DA1。
 *
 * ⚠️ 为什么这道检查**不接进 build 链**：
 *   它必须联网取漏洞公告库，而本仓的 build 链要保持**零网络依赖**
 *   （CI 里没有凭据，build 也必须可离线复现）⇒ 它是**周期性手动检查**，
 *   登记在 scripts/check-gates-wired.cjs 的 EXEMPT 里（理由写在那里）。
 *   离线的那一半在 scripts/check-deps.cjs（DEP1–DEP4），那个接在 build 链上。
 *
 * ⚠️ **为什么必须显式指定官方 registry**（2026-10-27 实测出来的坑）：
 *   本机（CI 同款）的 npm registry 是 registry.npmmirror.com，
 *   而该镜像**不实现 advisories 接口** ——
 *   实测 `npm audit` 在它上面返回
 *   `404 Not Found - POST /-/npm/v1/security/advisories/bulk [NOT_IMPLEMENTED]`
 *   ⇒ `npm audit` **看起来跑过了、却永远报不出任何漏洞**（这比没有检查更坏：
 *   它给人「已经查过了」的错觉）。
 *   ⇒ 本脚本把 registry **写死**成官方源，不继承任何本机配置。
 *
 * 判据：
 *   DA1 —— 依赖树里不得有 high / critical 级别的已知漏洞。
 *
 * 用法：npm run check:dep-audit
 */
const { spawnSync } = require("child_process");

const OFFICIAL_REGISTRY = "https://registry.npmjs.org";

console.log(`依赖漏洞审计（联网，registry 写死为 ${OFFICIAL_REGISTRY} —— 镜像源不实现 advisories 接口）\n`);

const r = spawnSync(
  "npm",
  ["audit", `--registry=${OFFICIAL_REGISTRY}`, "--json"],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
);

if (r.error) {
  console.error(`  ✗ DA1 跑不动 npm audit：${r.error.message}`);
  console.error("    （需要能访问 npm 官方 registry；本机若走代理，请确认代理放行 registry.npmjs.org）");
  process.exit(1);
}

let report = null;
try {
  report = JSON.parse(r.stdout || "{}");
} catch (e) {
  console.error(`  ✗ DA1 npm audit 的输出解析失败：${e.message}`);
  console.error(`    原始输出前 400 字：${(r.stdout || "").slice(0, 400)}`);
  process.exit(1);
}

/* npm audit 在「没有漏洞」时退出码为 0；有漏洞时退出码非 0 —— 两种都要读它的 JSON。 */
const vulns = report.vulnerabilities || {};
const counts = (report.metadata && report.metadata.vulnerabilities) || {};
const names = Object.keys(vulns);
const bad = names.filter((n) => ["high", "critical"].includes(vulns[n].severity));

console.log(
  `  依赖树规模：${Object.keys((report.dependencies && {}) || {}).length || "（见 metadata）"}；` +
    `漏洞统计：${JSON.stringify(counts)}`
);

if (bad.length) {
  console.error("\n依赖漏洞审计未通过：\n");
  for (const n of bad) {
    const v = vulns[n];
    console.error(`  ✗ DA1 ${n}：severity=${v.severity}，受影响范围 ${v.range}`);
    for (const via of v.via || []) {
      if (typeof via === "object") console.error(`      · ${via.title}（${via.url}）`);
    }
    console.error(`      可修：${JSON.stringify(v.fixAvailable)}`);
  }
  console.error("");
  console.error("  修法：升到修复版本（升完同步 scripts/check-deps.cjs 的下限表），");
  console.error("        然后重跑本脚本。");
  process.exit(1);
}

if (names.length) {
  console.log(`  low / moderate 级别的公告（不判红，仅列出）：${names.join("、")}`);
}
console.log("依赖漏洞审计通过：依赖树里没有 high / critical 级别的已知漏洞。");
