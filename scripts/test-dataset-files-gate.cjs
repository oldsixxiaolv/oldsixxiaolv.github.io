#!/usr/bin/env node
/* 门禁 8「数据集文件清单三边一致」的**可复跑自测脚本**。
 *
 * 为什么要有这个文件：
 *   门禁 24（编号 ↔ 代码段一一对应）只保证"门禁 8 的代码段还在"，
 *   **管不到代码段内部的判据有没有被卸掉**。实测：把门禁 8 里那段
 *   「三边一致性」判据整段删掉（文件头描述保留），门禁**仍然全绿**
 *   —— 站点从此静默丢掉这道防线，没有任何报错。
 *   （"注释承诺一个不存在的门禁，比没有注释更坏" —— 同一个病。）
 *   本脚本就是那道防线：它**自己**去注入故障、自己断言门禁的红因，
 *   判据一旦被卸掉，注入用例就会红。
 *
 * 用法（手动跑，不在 build 链上 —— 与 scripts/test-log-sections.sh 同）：
 *   npm run build && node scripts/test-dataset-files-gate.cjs
 *
 * 纪律：
 *   ① 一次只注入一个点（批量注入会让"某一个本来就不可收缩的元素"撑爆整页，
 *      几个方案测出同一个数字，看起来像"方案全都无效"）。
 *   ② 注入后**从磁盘回读**自证（不信任内存里的字符串）。
 *   ③ 断言**红因里的关键短语**，不只是退出码 —— 退出码只证明"有东西被抓住了"，
 *      不证明"是被设计的那条判据抓住的"。
 *   ④ 只在临时目录里改副本，绝不碰仓库工作树的 _site。
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SITE = path.join(ROOT, "_site");
const GATE = path.join(ROOT, "scripts", "verify-site.cjs");
const PAGE = "papers/trmm-thunderstorm-stages/index.html";
const LD_RE = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;

/* ---------- 工具 ---------- */
const read = (p) => fs.readFileSync(p, "utf8");
const write = (p, s) => fs.writeFileSync(p, s, "utf8");

/** 取出产物里那个 Dataset 节点（按 DOI 认，不靠 @type 猜）。 */
function datasetNode(html) {
  for (const m of html.matchAll(LD_RE)) {
    const doc = JSON.parse(m[1]);
    for (const n of doc["@graph"] || []) {
      if (n["@type"] === "Dataset" && String(n["@id"] || "").startsWith("https://doi.org/10.5281/zenodo.")) {
        return n;
      }
    }
  }
  return null;
}

/** 就地改 Dataset 节点并整段重写 JSON-LD 块。返回 [新 html, 是否改到]。 */
function patchDataset(html, fn) {
  for (const m of html.matchAll(LD_RE)) {
    const doc = JSON.parse(m[1]);
    let hit = false;
    for (const n of doc["@graph"] || []) {
      if (n["@type"] === "Dataset" && String(n["@id"] || "").startsWith("https://doi.org/10.5281/zenodo.")) {
        fn(n);
        hit = true;
      }
    }
    if (hit) {
      const next = JSON.stringify(doc, null, 0);
      return [html.replace(m[0], m[0].replace(m[1], next)), true];
    }
  }
  return [html, false];
}

function copyTree(src, dst) {
  fs.cpSync(src, dst, { recursive: true });
}

/* ---------- 用例 ---------- */
/* 每个用例：inject 改产物，check 从磁盘回读后核对结构（不是全文搜字符串），
   expect 是**红因里必须出现的短语**（空串 = 期望绿）。 */
const CASES = [
  {
    name: "baseline",
    desc: "未注入（基线）—— 门禁必须是绿的",
    expect: "",
    inject: null,
  },
  {
    name: "jsonld-md5",
    desc: "只改 JSON-LD 里的 md5",
    expect: "机读路径与数据源不一致",
    inject: (h) => patchDataset(h, (n) => (n.distribution[0].description = "md5:deadbeefdeadbeefdeadbeefdeadbeef")),
    check: (n) => n.distribution[0].description === "md5:deadbeefdeadbeefdeadbeefdeadbeef",
  },
  {
    name: "page-md5",
    desc: "只改页面上人读可见的 md5",
    expect: "页面上摆的校验和与 site.js 不一致",
    inject: (h) => {
      // 只改**人读路径**：先把 JSON-LD 块挖出来保护起来，替换完再装回去 ——
      // 全量 replace 会连 JSON-LD 里的 description 一起换掉，
      // 那样触发的是"机读路径"的红因，测的就不是这一条判据了。
      const blocks = [];
      const masked = h.replace(LD_RE, (m) => {
        blocks.push(m);
        return `\u0000LD${blocks.length - 1}\u0000`;
      });
      const out = masked.replace(
        "md5:5acccbea49b5522de089f8a07a3ac134",
        "md5:cafebabecafebabecafebabecafebabe"
      );
      let i = 0;
      return [out.replace(/\u0000LD(\d+)\u0000/g, (_, k) => blocks[+k]), true];
    },
    check: null, // 页面级用例另设断言
    checkHtml: (h) => h.includes("md5:cafebabecafebabecafebabecafebabe"),
  },
  {
    name: "drop-distribution",
    desc: "删掉整个 distribution 数组",
    expect: "没有 distribution 数组",
    inject: (h) => patchDataset(h, (n) => delete n.distribution),
    check: (n) => !("distribution" in n),
  },
  {
    name: "drop-one-file",
    desc: "distribution 少一项（文件数对不上）",
    expect: "两条路径说的文件数不一样",
    inject: (h) => patchDataset(h, (n) => n.distribution.splice(1, 1)),
    check: (n) => Array.isArray(n.distribution) && n.distribution.length === 2,
  },
  {
    name: "drop-encoding",
    desc: "删掉某一项的 encodingFormat",
    expect: "没有 encodingFormat",
    inject: (h) => patchDataset(h, (n) => delete n.distribution[0].encodingFormat),
    check: (n) => !n.distribution[0].encodingFormat,
  },
  {
    name: "break-isversionof",
    desc: "isVersionOf 指到别的 DOI",
    expect: "版本链关系缺失或指错",
    inject: (h) => patchDataset(h, (n) => (n.isVersionOf = { "@id": "https://doi.org/10.9999/broken" })),
    check: (n) => n.isVersionOf && n.isVersionOf["@id"] === "https://doi.org/10.9999/broken",
  },
  {
    name: "wrong-bytes",
    desc: "contentSize 写成别的字节数",
    expect: "机读路径与数据源不一致",
    inject: (h) => patchDataset(h, (n) => (n.distribution[0].contentSize = "999")),
    check: (n) => n.distribution[0].contentSize === "999",
  },
];

/* ---------- 主流程 ---------- */
if (!fs.existsSync(SITE)) {
  console.error(`✗ 没有产物目录 ${SITE} —— 先跑 npm run build 再跑本脚本。`);
  process.exit(2);
}
if (!fs.existsSync(GATE)) {
  console.error(`✗ 找不到门禁脚本 ${GATE}`);
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mh-dataset-gate."));
console.log(`临时工作区: ${tmp}\n`);

let failed = 0;
const results = [];

for (const c of CASES) {
  const dir = path.join(tmp, c.name);
  copyTree(SITE, dir);
  const pagePath = path.join(dir, PAGE);

  if (c.inject) {
    const before = read(pagePath);
    const [after, ok] = c.inject(before);
    if (!ok) {
      console.log(`  ✗ ${c.name}: 注入点没找到 —— **场景没造出来**（不算通过，也不算失败）`);
      failed++;
      results.push([c.name, "SCENE-NOT-BUILT"]);
      continue;
    }
    write(pagePath, after);
    // ② 从磁盘回读自证
    const back = read(pagePath);
    if (back !== after) {
      console.log(`  ✗ ${c.name}: 回读与写入不一致 —— 注入没真正落盘`);
      failed++;
      results.push([c.name, "INJECT-FAILED"]);
      continue;
    }
    const node = datasetNode(back);
    const proven = c.checkHtml
      ? c.checkHtml(back)
      : node
        ? c.check(node)
        : false;
    if (!proven) {
      console.log(`  ✗ ${c.name}: 注入自证失败 —— **场景没造出来**（不算通过，也不算失败）`);
      failed++;
      results.push([c.name, "INJECT-FAILED"]);
      continue;
    }
    console.log(`  · ${c.name}: 注入已落盘（磁盘回读自证通过）`);
  }

  let out = "";
  let code = 0;
  try {
    out = execFileSync("node", [GATE], {
      cwd: ROOT,
      env: { ...process.env, SITE_DIR: dir },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    code = e.status === null ? 1 : e.status;
    out = `${e.stdout || ""}${e.stderr || ""}`;
  }

  if (c.expect === "") {
    const ok = code === 0;
    console.log(`    → exit=${code} ${ok ? "✓ 基线是绿的" : "✗ 基线竟然红了（说明判据或产物本身有问题）"}`);
    if (!ok) failed++;
    results.push([c.name, ok ? "GREEN" : "UNEXPECTED-RED"]);
    continue;
  }

  const red = code === 1 && out.includes(c.expect);
  console.log(`    → exit=${code} ${red ? "✓ 判红且红因正确" : "✗ 没按预期判红 / 红因不对"}`);
  if (!red) {
    failed++;
    const hits = out.split("\n").filter((l) => l.includes(":")).slice(-4);
    for (const l of hits) console.log(`        ${l.trim().slice(0, 180)}`);
  }
  results.push([c.name, red ? "RED-OK" : `RED-BAD(exit=${code})`]);
}

/* ---------- 汇总 ---------- */
console.log("\n===== 汇总 =====");
for (const [name, st] of results) {
  const mark = st === "GREEN" ? "—基线绿" : st === "RED-OK" ? "✅判红" : "❌" + st;
  console.log(`${mark}  ${name}`);
}
console.log(`\n临时工作区: ${tmp}（可手动删）`);

if (failed) {
  console.log(`\n✗ ${failed} 个用例没通过 —— 门禁 8 的判据可能已被卸掉或失效。`);
  process.exit(1);
}
console.log(`\n✓ 门禁 8 的 ${CASES.length - 1} 条判据全部能被单独触发，且红因与设计一致。`);
process.exit(0);
