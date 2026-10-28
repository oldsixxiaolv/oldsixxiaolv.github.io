#!/usr/bin/env node
/**
 * 依赖漏洞审计（联网）—— 判据 **DA1** / **DA2**。
 *
 * ⚠️ 为什么这道检查**不接进 build 链**：
 *   它必须联网取漏洞公告库，而本仓的 build 链要保持**零网络依赖**
 *   （CI 里没有凭据，build 也必须可离线复现）⇒ 它是**周期性手动检查**，
 *   登记在 scripts/check-gates-wired.cjs 的 EXEMPT 里（理由写在那里）。
 *   离线的那一半在 scripts/check-deps.cjs（DEP1–DEP4），那个接在 build 链上。
 *   ⚠️ 但"周期性"这件事**只靠自觉**：本脚本既不在 build 链上、CI 里也没有
 *   任何地方调它（实测 `.github/workflows/` 全树 0 处 audit）⇒
 *   「谁在什么时候跑过它」没有任何机制保证。属既有待拍板事项，本脚本不代拍。
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
 * ══ 2026-10-27 场次实测：这个门禁有**两处独立的假绿**，本轮一起修掉 ══
 *
 * ⚠️ **假绿一：DA1 读错了 npm 报告的形状 ⇒ 它从来没有可能红过**（缺陷 D115）
 *   npm 7+ 的 `npm audit --json` 报告长这样（**逐字照抄**本机 npm 11.19.0
 *   的实现 @npmcli/arborist/lib/audit-report.js 的 `toJSON()`）：
 *     {
 *       "auditReportVersion": 2,
 *       "vulnerabilities": {          ← **对象**：键是包名，值是那份详情
 *         "markdown-it": { "name": "markdown-it", "severity": "high",
 *                            "isDirect": true, "via": [ {…公告…} ],
 *                            "effects": [], "range": "<14.3.3",
 *                            "nodes": ["node_modules/markdown-it"],
 *                            "fixAvailable": {…} }
 *       },
 *       "metadata": {
 *         "vulnerabilities": { "info": 0, "low": 0, "moderate": 0,
 *                              "high": 1, "critical": 0, "total": 1 },
 *         "dependencies": { "prod": 11, "dev": 119, "optional": 0,
 *                            "peer": 0, "peerOptional": 0, "total": 130 }
 *       }
 *     }
 *   ⚠️ **D115 把这里的「中间态」当成了「最终形状」（2026-10-28 场次实测发现）**：
 *     那份实现**先**把漏洞收成数组、再**压成对象**：
 *       const vulnerabilities = []
 *       for (const [name, vuln] of this.entries()) {
 *         vulnerabilities.push([name, vuln.toJSON()])
 *         obj.metadata.vulnerabilities[vuln.severity]++
 *       }
 *       obj.vulnerabilities = vulnerabilities
 *         .sort(([a], [b]) => localeCompare(a, b))
 *         .reduce((set, [name, vuln]) => { set[name] = vuln; return set; }, {})
 *     ⇒ **数组只是中间步骤**；最终落到 `obj.vulnerabilities` 的是**对象**。
 *     D115 只读到 `vulnerabilities.push([name, …])` 那一行 ⇒ 把 **npm 6 的旧形状**
 *     当成了 npm 7+ 的形状。⇒ 2026-10-28 实测出来的后果：
 *       · DA2 要求 `Array.isArray(vulnerabilities)` ⇒ **真实报告永远被拒**
 *         ⇒ 这道门禁**永远红** ⇒ 依赖漏洞这一维度**从来没有过任何结论**
 *         （既没有"有漏洞"的结论，也没有"没漏洞"的结论）；
 *       · 而 DA1 按数组读 ⇒ 即使放行也是**恒绿** ⇒ 假绿原样留着。
 *     ⇒ 现在 DA1 / DA2 都按**对象**形状读（见下面代码）。
 *     ⚠️ **教训**：读第三方实现要看**「最终产出的那个变量」**，
 *       不是右边表达式里的中间形态。
 *   （D115 之前那一版读的是 `report.vulnerabilities` 当"以包名为键的对象"：
 *     const vulns = report.vulnerabilities || {};
 *     const names = Object.keys(vulns);                       // ← 数组下标 ["0","1"]
 *     const bad = names.filter(n => ["high","critical"].includes(vulns[n].severity));
 *                                                          // ← vulns["0"] 是 [名,详情] 这一对
 *                                                          //    ⇒ .severity 恒 undefined
 *     ⇒ `bad` **恒为空** ⇒ **即便依赖树里真的有 high / critical 漏洞，DA1 也永远判绿**。
 *     ⇒ 这比"查不到就当没问题"更糟：**查到了也当没问题**。）
 *
 * ⚠️ **假绿二：审计请求失败时，也判绿**（同一缺陷的另一半）
 *   `npm audit` **失败**时**不一定"跑不起来"** —— 它会**成功执行**，
 *   并把一份**错误对象**打到 stdout（本轮实测到的形状，逐字）：
 *     { "message": "request to https://registry.npmjs.org/-/npm/v1/security/advisories/bulk
 *                    failed, reason: Client network socket disconnected before secure
 *                    TLS connection was established",
 *       "error": { "summary": "", "detail": "" } }
 *   而这份 JSON 里**没有** `vulnerabilities`、**没有** `metadata`
 *   ⇒ 旧版读到 `vulns = {}` ⇒ `bad = []` ⇒
 *   **打印「依赖漏洞审计通过：依赖树里没有 high / critical 级别的已知漏洞」并 exit 0**
 *   ⇒ **一次漏洞查询都没做成，却报告成"查过了、没问题"**。
 *   本轮实测：本机跑这道门禁**当场**打印"审计通过"—— 而底层那次请求
 *   根本没成功（TLS 握手被中断）。⇒ 门禁自己文件头警告的"给人错觉"，
 *   **不是理论风险，是这台机器上正在发生的事**。
 *   ⇒ DA2 专门管这件事：**先确认拿到的确实是一份 npm 7+ 的审计报告，再谈漏洞**。
 *     报告不成立 ⇒ **判红**，红因写明「本轮没有关于依赖漏洞的任何结论」。
 *
 * 判据：
 *   DA1 —— 依赖树里不得有 high / critical 级别的已知漏洞。
 *         （按 npm 7+ 真实的**以包名为键的对象**形状读；读不到条目 = 没有漏洞）
 *   DA2 —— 审计必须**真的做成了**：拿到的必须是一份 npm 7+ 的审计报告 ——
 *         `metadata.vulnerabilities.total` 是数字，**且** `vulnerabilities` 是对象。
 *         「拿不到报告」与「不认识它的形状」都**不是**「没有漏洞」——
 *         前两者判红，只有后者判绿。
 *
 * 用法：npm run check:dep-audit
 *
 * ⚠️ `DEP_AUDIT_NPM` 环境变量（**自测夹具用**）：指定"npm"这个可执行文件的位置。
 *   默认 "npm"（走 PATH）。自测靠它把真 npm 换成一份**假 npm**（输出固定夹具），
 *   从而**不联网**也能把每条判据的"会红"证明出来 —— 与仓内
 *   `scripts/check-overflow.cjs` 用 `CHROME_PATH` 注入浏览器是同一套做法。
 *   ⚠️ 这个变量**只给自测用**：手改它去绕开审计 = 自己骗自己。
 */
"use strict";

const { spawnSync } = require("child_process");

const OFFICIAL_REGISTRY = "https://registry.npmjs.org";
const npmBin = process.env.DEP_AUDIT_NPM || "npm";

console.log(
  `依赖漏洞审计（联网，registry 写死为 ${OFFICIAL_REGISTRY} —— 镜像源不实现 advisories 接口）\n`
);

const r = spawnSync(
  npmBin,
  ["audit", `--registry=${OFFICIAL_REGISTRY}`, "--json"],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
);

/* ---------- DA2（第一步）：npm 根本跑不起来 ---------- */
if (r.error) {
  console.error(`  ✗ DA2 跑不动 npm audit：${r.error.message}`);
  console.error(
    "    （需要能访问 npm 官方 registry；本机若走代理，请确认代理放行 registry.npmjs.org）"
  );
  process.exit(1);
}

/* ---------- DA2（第二步）：输出压根不是 JSON ---------- */
let report = null;
try {
  report = JSON.parse(r.stdout || "{}");
} catch (e) {
  console.error(`  ✗ DA2 npm audit 的输出解析失败：${e.message}`);
  console.error(`    原始输出前 400 字：${(r.stdout || "").slice(0, 400)}`);
  process.exit(1);
}

/* ---------- DA2（第三步）：这是不是**一份 npm 7+ 的审计报告**？ ----------
 * 真的报告必须同时满足两件事（依据见文件头）：
 *   ① `metadata.vulnerabilities.total` 是数字（计数表）；
 *   ② `vulnerabilities` 是**以包名为键的对象**。
 * 少任何一条 ⇒ 我们读不出漏洞 ⇒ **不给结论**（判红），而不是"没有漏洞"。
 * ⚠️ 必须**排除数组**：npm 6 的旧形状是数组（每项是 [包名, 详情]），
 *    而本门禁不读它 —— 读到不认识的形状 ⇒ 不给结论（判红），不是"没有漏洞"。 */
const vulnMeta = report && report.metadata && report.metadata.vulnerabilities;
const hasCounts = !!vulnMeta && typeof vulnMeta === "object" && typeof vulnMeta.total === "number";
const rawEntries = report && report.vulnerabilities;
const vulnsIsObject =
  !!rawEntries && typeof rawEntries === "object" && !Array.isArray(rawEntries);
const isAuditReport = hasCounts && vulnsIsObject;

if (!isAuditReport) {
  const why =
    (report && report.message) ||
    (report && report.error && (report.error.summary || report.error.detail)) ||
    "";
  console.error(
    "  ✗ DA2 拿到的不是一份 npm 审计报告 ⇒ 本轮**没有关于依赖漏洞的任何结论**（不是「没有漏洞」）"
  );
  if (why) console.error(`    npm 的原话：${String(why).slice(0, 300)}`);
  else if (!hasCounts) {
    console.error("    （报告里没有 metadata.vulnerabilities.total —— 计数表不在）");
  } else if (Array.isArray(rawEntries)) {
    console.error(
      "    （报告里 vulnerabilities 是**数组** —— 那是 npm 6 的旧形状；" +
        "npm 7+ 的形状是**以包名为键的对象**，本门禁不读旧形状）"
    );
  } else {
    console.error(
      "    （报告里 vulnerabilities 不是「以包名为键的对象」 —— 形状不认识）"
    );
  }
  console.error(`    原始输出前 400 字：${(r.stdout || "").slice(0, 400)}`);
  console.error(
    "    修法：确认能访问 npm 官方 registry 的 advisories 端点（代理要放行 registry.npmjs.org）；"
  );
  console.error("          若 npm 改了报告形状，请照着它的实现改这里的读法（不要退回「读不到就算没有」）。");
  process.exit(1);
}

/* ---------- DA1：报告成立，才轮到谈漏洞 ---------- */
/* npm 7+ 的形状：vulnerabilities 是**以包名为键的对象**（见文件头）。
   防御式：DA2 已经保证过它是对象；这里的兜底只是**不让脚本在异常输入上崩掉**
   （崩掉 = 退出码也是 1，看起来像"判红"，会把"没结论"和"有漏洞"混成同一件事）。
   ⚠️ 兜底**不是**判据 —— 真正的把关在上面的 DA2。 */
const entries = vulnsIsObject ? Object.entries(rawEntries) : [];
/* 这一行写成**单行**：自测的判据级负对照要靠"逐字替换这一行"来卸掉 DA1
   （多行锚点容易因为缩进/换行对不上而失配）。 */
const bad = entries.filter((pair) => pair[1] && ["high", "critical"].includes(pair[1].severity));

console.log(
  `  依赖树规模：${JSON.stringify(
    (report.metadata && report.metadata.dependencies) || {}
  )}；漏洞统计：${JSON.stringify(vulnMeta)}`
);

if (bad.length) {
  console.error("\n依赖漏洞审计未通过：\n");
  for (const pair of bad) {
    const n = pair[0];
    const v = pair[1] || {};
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

const allNames = entries.map((p) => p[0]);
if (allNames.length) {
  console.log(
    `  low / moderate 级别的公告（不判红，仅列出）：${allNames.join("、")}`
  );
}
console.log("依赖漏洞审计通过：依赖树里没有 high / critical 级别的已知漏洞。");
