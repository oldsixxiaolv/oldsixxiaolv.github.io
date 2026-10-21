#!/usr/bin/env node
/**
 * 门禁 SX1–SX6（scripts/check-img-srcset.cjs）的本地夹具自测
 *
 * 这个自测要证明两件事，缺一不可：
 *   ① 门禁**能变红** —— 每条判据各有一档注入，让它真的报出来。
 *   ② 门禁**红得准** —— 只断言「注入能变红」不够，那只说明门禁**有反应**，
 *      不说明红因来自**那一条判据**。所以对每条判据再补一档**负对照**：
 *      把门禁副本里的 `const SXn_ON = true;` 改成 false 之后，
 *      对应的注入必须**转绿**，才能证明红因确实是这一条判据判出来的。
 *
 * 另有两档是「必须判绿」的边界负对照：
 *   · 候选改成一个**真实存在的新文件** ⇒ 必须判绿（门禁守的是「存在性」，
 *     不是「某一份固定清单」）；
 *   · 扫描器 tricky 档：注释 / `<script>` 原始文本 / 别人的属性值里写的
 *     假 `srcset` **都不算数**。
 *
 * 用法：node scripts/test-img-srcset.cjs
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-img-srcset.cjs");
const REAL_SITE = path.join(ROOT, "_site");

/* 夹具站要带的文件类型：HTML 页面 + 图片（srcset 的候选就是图片）。
   图片必须一起复制，否则基线站本身就是「断链」的。 */
const KEEP_EXT = new Set([".html", ".jpg", ".jpeg", ".png", ".svg", ".webp", ".avif", ".gif"]);

if (!fs.existsSync(REAL_SITE)) {
  console.error(
    `响应式图片门禁自测失败：找不到产物目录 ${REAL_SITE} —— ` +
      `夹具站的基线要靠它，先跑一次 npm run build。`
  );
  process.exit(1);
}

/* ---------- 夹具站 ---------- */

function copyRelevant(fromDir, toDir) {
  fs.mkdirSync(toDir, { recursive: true });
  for (const e of fs.readdirSync(fromDir, { withFileTypes: true })) {
    if (e.name.startsWith("._")) continue; // exFAT 上的 AppleDouble 资源叉
    const p = path.join(fromDir, e.name);
    if (e.isDirectory()) {
      copyRelevant(p, path.join(toDir, e.name));
    } else if (e.isFile() && KEEP_EXT.has(path.extname(e.name).toLowerCase())) {
      fs.copyFileSync(p, path.join(toDir, e.name));
    }
  }
}

function buildFixture(id) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `mh-srcset-${id}-`));
  copyRelevant(REAL_SITE, path.join(root, "_site"));
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  const gate = path.join(root, "scripts", "check-img-srcset.cjs");
  fs.copyFileSync(GATE, gate);
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify(
      {
        name: "mh-fixture",
        private: true,
        scripts: {
          build: "npm run check:img-srcset",
          "check:img-srcset": "node scripts/check-img-srcset.cjs",
        },
      },
      null,
      2
    )
  );
  const htmlFiles = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".html")) htmlFiles.push(p);
    }
  };
  walk(path.join(root, "_site"));
  return { root, gate, site: path.join(root, "_site"), htmlFiles, pkg: path.join(root, "package.json") };
}

function readIf(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

/** 改一个文件：fn 收到原文，返回新原文；返回是否真的改动了。 */
function mutate(file, fn) {
  const before = fs.readFileSync(file, "utf8");
  const after = fn(before);
  if (after === before) return false;
  fs.writeFileSync(file, after);
  return true;
}

/** 在门禁副本里把某条判据卸掉（`const SXn_ON = true;` → false）。 */
function patchGate(fx, name) {
  const needle = `const ${name}_ON = true;`;
  const before = fs.readFileSync(fx.gate, "utf8");
  if (!before.includes(needle)) throw new Error(`门禁副本里找不到 ${needle}`);
  fs.writeFileSync(fx.gate, before.replace(needle, `const ${name}_ON = false;`));
}

/* ---------- 注入动作（负对照档要再注入一次） ---------- */

const INDEX = "index.html";
const PORTRAIT_SRC = ' src="assets/img/author/portrait.jpg"';
const PORTRAIT_SRCSET =
  'srcset="assets/img/author/portrait-sm.jpg 300w, assets/img/author/portrait.jpg 600w"';

const INJECT = {
  /* SX1：候选指向不存在的文件（首页肖像的 600w 那一张） */
  missingCandidate: (fx) => {
    const file = path.join(fx.site, INDEX);
    const ok = mutate(file, (t) =>
      t.replace(
        "assets/img/author/portrait.jpg 600w",
        "assets/img/author/mh-d43-missing.jpg 600w"
      )
    );
    if (!ok) throw new Error("没找到首页肖像的 600w 候选");
  },
  /* SX2：把 <img> 的 src 兜底去掉 */
  noSrcFallback: (fx) => {
    const file = path.join(fx.site, INDEX);
    const ok = mutate(file, (t) => t.replace(PORTRAIT_SRC, ""));
    if (!ok) throw new Error("没找到首页肖像的 src 属性");
  },
  /* SX3：空的 srcset 声明 */
  emptySrcset: (fx) => {
    const file = path.join(fx.site, INDEX);
    const ok = mutate(file, (t) => t.replace(PORTRAIT_SRCSET, 'srcset=""'));
    if (!ok) throw new Error("没找到首页肖像的 srcset 属性");
  },
  /* SX4：候选列表里混用宽度描述符（w）与密度描述符（x） */
  mixedDescriptors: (fx) => {
    const file = path.join(fx.site, INDEX);
    const ok = mutate(file, (t) =>
      t.replace(
        "assets/img/author/portrait-sm.jpg 300w, assets/img/author/portrait.jpg 600w",
        "assets/img/author/portrait-sm.jpg 300w, assets/img/author/portrait.jpg 2x"
      )
    );
    if (!ok) throw new Error("没找到首页肖像的候选列表");
  },
  /* SX1：<picture> 里的 <source srcset> 断链 */
  missingSource: (fx) => {
    const file = path.join(fx.site, INDEX);
    const ok = mutate(file, (t) =>
      t.replace(
        "</body>",
        '<picture><source srcset="assets/img/author/mh-d43-missing-source.jpg 1x" /></picture>\n</body>'
      )
    );
    if (!ok) throw new Error("没找到 </body>");
  },
  /* SX1：<link imagesrcset> 断链 */
  missingImagesrcset: (fx) => {
    const file = path.join(fx.site, INDEX);
    const ok = mutate(file, (t) =>
      t.replace(
        "</head>",
        '<link rel="preload" as="image" imagesrcset="assets/img/author/mh-d43-missing-link.jpg 1x" />\n</head>'
      )
    );
    if (!ok) throw new Error("没找到 </head>");
  },
  /* SX5：抽掉产物里全部 srcset 声明（覆盖度自证） */
  stripAllSrcset: (fx) => {
    for (const f of fx.htmlFiles) {
      mutate(f, (t) => t.replace(/ srcset="[^"]*"/g, ""));
    }
  },
  /* SX6：package.json 里把本门禁摘掉 */
  unwireGate: (fx) => {
    fs.writeFileSync(
      fx.pkg,
      JSON.stringify(
        {
          name: "mh-fixture",
          private: true,
          scripts: { build: "npm run check:other", "check:other": "node scripts/check-other.cjs" },
        },
        null,
        2
      )
    );
  },
  /* 必须判绿：把候选改成一个**真实存在的新文件** */
  pointToRealNewFile: (fx) => {
    fs.writeFileSync(path.join(fx.site, "assets", "img", "author", "portrait-xl.jpg"), "fixture");
    const file = path.join(fx.site, INDEX);
    const ok = mutate(file, (t) =>
      t.replace(
        "assets/img/author/portrait.jpg 600w",
        "assets/img/author/portrait-xl.jpg 600w"
      )
    );
    if (!ok) throw new Error("没找到首页肖像的 600w 候选");
  },
  /* 必须判绿：注释 / <script> 原始文本 / 别人的属性值里的假 srcset 都不算数 */
  trickyNoise: (fx) => {
    const file = path.join(fx.site, INDEX);
    const ok = mutate(file, (t) =>
      t
        .replace(
          "</body>",
          [
            '<!-- <img srcset="assets/img/author/mh-d43-missing-comment.jpg 1x" /> -->',
            "<script>var s = '<img srcset=\"assets/img/author/mh-d43-missing-script.jpg 1x\">';</script>",
            "<div data-x=\"<img srcset='assets/img/author/mh-d43-missing-attr.jpg 1x'>\"></div>",
            "</body>",
          ].join("\n")
        )
    );
    if (!ok) throw new Error("没找到 </body>");
  },
};

/* ---------- 跑门禁 ---------- */
function runGate(fx) {
  const env = Object.assign({}, process.env);
  delete env.SITE_DIR;
  delete env.PKG_PATH;
  const r = spawnSync(process.execPath, [fx.gate], { env, encoding: "utf8" });
  return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
}

/* ---------- 注入矩阵 ---------- */
const CASES = [
  {
    id: "ST0",
    expect: "green",
    desc: "基线：完全健康的产物",
    apply: () => {},
  },
  {
    id: "ST1",
    expect: "red",
    subs: ["mh-d43-missing.jpg", "没有这个文件"],
    desc: "srcset 候选指向不存在的文件（SX1）",
    apply: (fx) => INJECT.missingCandidate(fx),
  },
  {
    id: "ST2",
    expect: "red",
    subs: ["没有**非空的 src**"],
    desc: "<img> 带 srcset 却没有 src 兜底（SX2）",
    apply: (fx) => INJECT.noSrcFallback(fx),
  },
  {
    id: "ST3",
    expect: "red",
    subs: ["候选列表是**空的**"],
    desc: "空的 srcset 声明（SX3）",
    apply: (fx) => INJECT.emptySrcset(fx),
  },
  {
    id: "ST4",
    expect: "red",
    subs: ["同时**用了宽度描述符"],
    desc: "候选列表里混用 w 与 x（SX4）",
    apply: (fx) => INJECT.mixedDescriptors(fx),
  },
  {
    id: "ST5",
    expect: "red",
    subs: ["mh-d43-missing-source.jpg", "没有这个文件"],
    desc: "<picture> 里的 <source srcset> 断链（SX1）",
    apply: (fx) => INJECT.missingSource(fx),
  },
  {
    id: "ST6",
    expect: "red",
    subs: ["mh-d43-missing-link.jpg", "没有这个文件"],
    desc: "<link imagesrcset> 断链（SX1）",
    apply: (fx) => INJECT.missingImagesrcset(fx),
  },
  {
    id: "ST7",
    expect: "red",
    subs: ["一处都没比过"],
    desc: "负对照：抽掉产物里全部 srcset 声明（SX5 覆盖度自证）",
    apply: (fx) => INJECT.stripAllSrcset(fx),
  },
  {
    id: "ST8",
    expect: "red",
    subs: ["门禁自己被卸掉了"],
    desc: "负对照：package.json 里把本门禁摘掉（SX6）",
    apply: (fx) => INJECT.unwireGate(fx),
  },
  {
    id: "ST9",
    expect: "green",
    desc: "负对照：卸掉 SX1 判定 ⇒ ST1 的注入转绿",
    apply: (fx) => {
      patchGate(fx, "SX1");
      INJECT.missingCandidate(fx);
    },
  },
  {
    id: "ST10",
    expect: "green",
    desc: "负对照：卸掉 SX2 判定 ⇒ ST2 的注入转绿",
    apply: (fx) => {
      patchGate(fx, "SX2");
      INJECT.noSrcFallback(fx);
    },
  },
  {
    id: "ST11",
    expect: "green",
    desc: "负对照：卸掉 SX3 判定 ⇒ ST3 的注入转绿",
    apply: (fx) => {
      patchGate(fx, "SX3");
      INJECT.emptySrcset(fx);
    },
  },
  {
    id: "ST12",
    expect: "green",
    desc: "负对照：卸掉 SX4 判定 ⇒ ST4 的注入转绿",
    apply: (fx) => {
      patchGate(fx, "SX4");
      INJECT.mixedDescriptors(fx);
    },
  },
  {
    id: "ST13",
    expect: "green",
    desc: "负对照：卸掉 SX5 判定 ⇒ ST7 的注入转绿",
    apply: (fx) => {
      patchGate(fx, "SX5");
      INJECT.stripAllSrcset(fx);
    },
  },
  {
    id: "ST14",
    expect: "green",
    desc: "负对照：卸掉 SX6 判定 ⇒ ST8 的注入转绿",
    apply: (fx) => {
      patchGate(fx, "SX6");
      INJECT.unwireGate(fx);
    },
  },
  {
    id: "ST15",
    expect: "green",
    desc: "负对照：把候选改成一个真实存在的新文件（门禁守存在性、不守固定清单）",
    apply: (fx) => INJECT.pointToRealNewFile(fx),
  },
  {
    id: "ST16",
    expect: "green",
    desc: "扫描器 tricky 档：注释 / <script> 原始文本 / 别人的属性值里的假 srcset 不算数",
    apply: (fx) => INJECT.trickyNoise(fx),
  },
];

/* ---------- 真目录的指纹（跑完自证没被动过） ---------- */
function fingerprint(dir) {
  const hash = crypto.createHash("sha256");
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1
    )) {
      const p = path.join(d, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        walk(p, r);
      } else {
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
    lines.push(
      `✗ ${c.id}（${c.desc}）：期望 exit ${want}，实测 exit ${code}\n${out.trim()}`
    );
    fs.rmSync(fx.root, { recursive: true, force: true });
    continue;
  }
  if (c.expect === "red") {
    const missing = (c.subs || []).filter((s) => !out.includes(s));
    if (missing.length) {
      failed++;
      lines.push(
        `✗ ${c.id}（${c.desc}）：判红了，但红因里**看不到**「${missing.join(" / ")}」\n${out.trim()}`
      );
      fs.rmSync(fx.root, { recursive: true, force: true });
      continue;
    }
    lines.push(`✓ ${c.id}  ${c.desc} → 判红，红因点名到位`);
  } else {
    if (!out.includes("响应式图片门禁通过")) {
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
const afterSite = fingerprint(REAL_SITE);
const afterGate = crypto.createHash("sha256").update(fs.readFileSync(GATE)).digest("hex");
if (beforeSite !== afterSite) {
  failed++;
  lines.push("✗ 自测动了仓库里的 _site/ —— 夹具站必须与真目录彻底分开。");
}
if (beforeGate !== afterGate) {
  failed++;
  lines.push("✗ 自测动了仓库里的门禁原件 —— 负对照必须打在副本上。");
}

if (failed) {
  console.error("响应式图片门禁自测未通过：\n");
  lines.forEach((l) => console.error(`  ${l}`));
  console.error(`\n  ${failed} 档未通过。\n`);
  process.exit(1);
}

console.log(`响应式图片门禁自测通过：${CASES.length} 档（ST0–ST16）注入矩阵全部符合预期。`);
lines.forEach((l) => console.log(`  ${l}`));
