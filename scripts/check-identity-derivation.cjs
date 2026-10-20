#!/usr/bin/env node
/**
 * 身份派生门禁 —— 守住"身份清单只有一份、页面上那一份必须是**派生**出来的"。
 *
 * 为什么要有这条（一次具体的实测漏洞，不是假想）：
 *   身份清单的真源是 scripts/lib/identity.cjs（IDENTITY_SAMEAS），
 *   产物里的 sameAs 与页面上看得见的身份链接都从它派生。
 *   但"派生"这件事**只有代码注释在保护**——没有任何门禁挡住有人把
 *   site.js 里的派生改回**字面量**。一旦改回字面量，站点就多出**第二份清单**：
 *   改一处忘另一处会静默漂移（这正是本仓库反复吃过的亏）。
 *
 *   同族的洞已经补过一半：check-identity-handles.cjs 的 I5 管的是**取值**
 *   （site.author 里可见的身份链接必须与登记期望集逐项一致）。本条管的是
 *   **结构**（这些取值**不许**是抄来的字面量）。两条互补：I5 抓"抄错了"，
 *   本条抓"根本不该抄"。
 *
 * ⚠️ 本条只查**完整字面量**，不做 URL 形态匹配——形态匹配会把
 *   "https://github.com/oldsixxiaolv/Manuscript_Lvyh"（代码仓，深层内容链接）
 *   误判成"抄了 GitHub 身份"。形态那条由 I5 在**数据源**上做，不混进本条。
 *
 * ⚠️ 注释里**可以**写这些 URL（那是文档，不是数据）；本条只判**代码**里的
 *   字符串字面量。判据：命中处所在行是注释行（// 或 * 开头）→ 放行。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITE_JS = path.join(ROOT, "src/_data/site.js");
const SHARED = path.join(ROOT, "scripts/lib/identity.cjs");

/* 期望集：与 check-identity-handles.cjs 的 ORACLE_SAMEAS 同一份内容。
   本条**不**从共享模块取期望值——共享模块是产物的发射源，从它取期望值
   就是"拿被改过的东西和它自己比"（那是 16:05 场次初版踩过的坑）。 */
const ORACLE_SAMEAS = [
  "https://orcid.org/0009-0005-3511-0546",
  "https://github.com/oldsixxiaolv",
  "https://www.researchgate.net/profile/Yihang-Lyu",
  "https://blog.csdn.net/lvyihang200411",
  "https://openalex.org/A5121394231",
];
const EXPECTED_COUNT = 5;

const problems = [];
const fail = (msg) => problems.push(msg);

let source = "";
try {
  source = fs.readFileSync(SITE_JS, "utf8");
} catch (e) {
  fail(`读不到 src/_data/site.js（${e.message}）——本门禁没有判断对象，直接判红。`);
}

/* ---------- D1：身份 URL 不得在 site.js 里以字面量出现 ---------- */
let checked = 0;
if (source) {
  const lines = source.split(/\r?\n/);
  for (const url of ORACLE_SAMEAS) {
    checked++;
    const needles = [`"${url}"`, `'${url}'`];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!needles.some((n) => line.includes(n))) continue;
      const trimmed = line.trim();
      const isComment =
        trimmed.startsWith("//") ||
        trimmed.startsWith("*") ||
        trimmed.startsWith("/*");
      if (isComment) continue; // 文档里提到这些 URL 是允许的
      fail(
        `src/_data/site.js 第 ${i + 1} 行把身份 URL ${url} **写成了字面量**——` +
          `身份清单的真源是 scripts/lib/identity.cjs，页面上的身份链接必须从它派生` +
          `（否则就多出第二份清单，改一处忘另一处会静默漂移）。`
      );
    }
  }

  /* ---------- D2：真源必须真的被引用（结构上的另一半） ---------- */
  if (!/require\(\s*["'][^"']*lib\/identity\.cjs["']\s*\)/.test(source)) {
    fail(
      `src/_data/site.js 没有 require 共享身份清单 scripts/lib/identity.cjs——` +
        `身份链接与 sameAs 就没有共同真源，本条的前提不成立。`
    );
  }

  /* ---------- D3：共享模块自身必须存在（锚失效即判红） ---------- */
  if (!fs.existsSync(SHARED)) {
    fail(`共享身份清单 scripts/lib/identity.cjs 不存在——真源没了，本门禁无从判断。`);
  }
}

/* ---------- 自证存活：一条都没查 = 判据本身没生效 ---------- */
if (source && checked !== EXPECTED_COUNT) {
  fail(
    `本门禁只查了 ${checked} 条身份 URL（应为 ${EXPECTED_COUNT} 条）——` +
      `期望集被改动了，本条没有生效。`
  );
}

if (problems.length) {
  console.error("身份派生门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

console.log(
  `身份派生门禁通过：src/_data/site.js 里 ${ORACLE_SAMEAS.length} 条身份 URL` +
    `**没有一条**以字面量出现（页面可见链接与 sameAs 全部派生自` +
    `scripts/lib/identity.cjs，站点只有一份身份清单）。`
);
