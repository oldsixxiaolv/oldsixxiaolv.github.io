#!/usr/bin/env node
/**
 * 引用元数据门禁的**自测**（注入矩阵）——证明 C1 / C2 / C3 / C7 每一条都**能变红**。
 *
 * 为什么要有这个自测：
 *   门禁文件头自己写着："删掉模板里那行 citation_issn，build 照样全绿，页面照出，
 *   而 Scholar 那边少一条字段。"——**引用层是静默失效最重的一层**：模板少输出
 *   一个标签、产物被改坏一个字节，构建都不报错，只在 Scholar 收录时才显形。
 *   全仓 20+ 道门禁里，注入矩阵此前只覆盖了三道（CITATION.cff / 线上核查 /
 *   README），**引用元数据这一道一直没有**。
 *
 * 做法：把产物 `_site` 复制一份到临时目录（只复制 .html / .bib / .ris 三类——
 *   门禁只读这三类），在**副本**上逐个注入缺陷，用 SITE_DIR 环境变量把门禁
 *   指向副本，然后断言门禁**确实**报出了对应的那条红因。
 *   ⚠️ 全程不动仓库里的源码，也不动真正的 `_site`。
 *   （SITE_DIR 这个开关是门禁本来就有的：README / CITATION.cff 两道自测
 *     用的是同一个模式——门禁必须能被指向一个副本，否则自测就只能去改真文件。）
 *
 * 十档：
 *   M0 基线（原样）                        → 必须**全绿**（证明这套判据不是空跑）
 *   M1 删掉 citation_online_date            → C1（少了标签）
 *   M2 改掉 citation_online_date 的值       → C1（取值与真源不一致）
 *   M3 把 citation_online_date 改到出版日之后 → C7（上线日不得晚于出版日）
 *   M4 删掉 citation_publication_date       → C1（少了标签）
 *   M5 改掉 citation_issn 的值              → C1（取值与真源不一致）
 *   M6 删掉论文页上**全部** citation_*      → C1（一个标签都没有）
 *   M7 首页注入一个 citation_title          → C2（非论文页出现 citation_*）
 *   M8 删掉 publications.bib                → C3（引用导出缺失）
 *   M9 改掉 publications.bib 里的 DOI       → C3（导出里这篇论文不见了）
 *
 * 用法：node scripts/test-citation-meta.cjs
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-citation-meta.cjs");
/* 产物目录。自测的**源**用独立变量名，避免与门禁的 SITE_DIR 语义混淆
   （门禁的 SITE_DIR 是"被检查的产物目录"，这里指向的是真产物）。 */
const SOURCE_SITE = process.env.SELFTEST_SITE_DIR
  ? path.resolve(process.env.SELFTEST_SITE_DIR)
  : path.join(ROOT, "_site");

if (!fs.existsSync(SOURCE_SITE)) {
  console.error(
    "引用元数据自测失败：找不到产物目录 " +
      SOURCE_SITE +
      "（先跑 npm run build，或用 SELFTEST_SITE_DIR 指定别的产物目录）。"
  );
  process.exit(1);
}

let siteData = null;
try {
  siteData = require(path.join(ROOT, "src/_data/site.js"));
} catch (e) {
  console.error(`引用元数据自测失败：读不到 src/_data/site.js（${e.message}）。`);
  process.exit(1);
}
const pubs = (siteData.publications || []).filter((p) => p && p.slug);
if (!pubs.length) {
  console.error("引用元数据自测失败：site.js 里没有带 slug 的论文条目，无从注入。");
  process.exit(1);
}

/* ---------- 复制产物：只复制门禁会读的三类文件 ---------- */
const COPY_EXT = new Set([".html", ".bib", ".ris"]);

function listProductFiles(dir, base = dir, out = []) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) listProductFiles(full, base, out);
    else if (e.isFile() && COPY_EXT.has(path.extname(e.name))) {
      out.push(path.relative(base, full).split(path.sep).join("/"));
    }
  }
  return out;
}

/** 复制一份产物到 dest；返回复制的文件相对路径列表。 */
function copyProduct(dest) {
  const rels = listProductFiles(SOURCE_SITE);
  for (const rel of rels) {
    const to = path.join(dest, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(SOURCE_SITE, rel), to);
  }
  return rels;
}

/* 开跑前先把真产物的关键文件读进来存档，最后逐字比对——
   "自测只在副本上注入"这句话，得**证明**过，不能只是说说。 */
const before = {};
for (const rel of [
  "index.html",
  "publications.bib",
  "publications.ris",
  ...pubs.map((p) => `papers/${p.slug}/index.html`),
]) {
  const p = path.join(SOURCE_SITE, rel);
  if (fs.existsSync(p)) before[rel] = fs.readFileSync(p, "utf8");
}

/** 复制必须**完整**：门禁读不到论文页就会报"产物不存在"这种红因，
    那样红因就分不清是注入造成的还是复制缺文件造成的——那叫坏跑。 */
function assertCopyComplete(rels) {
  const missing = [];
  for (const p of pubs) {
    const rel = `papers/${p.slug}/index.html`;
    if (!rels.includes(rel)) missing.push(rel);
  }
  for (const rel of ["index.html", "publications.bib", "publications.ris"]) {
    if (!rels.includes(rel)) missing.push(rel);
  }
  return missing;
}

/* ---------- 注入工具：锚点不存在就抛错（坏跑必须当场暴露） ---------- */
function replaceOnce(text, from, to) {
  if (!text.includes(from)) {
    throw new Error(`注入锚点不存在：找不到「${from}」`);
  }
  const out = text.replace(from, to);
  if (out === text) throw new Error(`注入没有改变内容：「${from}」`);
  return out;
}

/** 删掉**整行**（按行首/行内特征定位）；找不到就抛错。 */
function dropLineContaining(text, marker) {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => l.includes(marker));
  if (i < 0) throw new Error(`注入锚点不存在：找不到含「${marker}」的行`);
  lines.splice(i, 1);
  const out = lines.join("\n");
  if (out === text) throw new Error(`注入没有改变内容：「${marker}」`);
  return out;
}

/** 删掉**所有**含 marker 的行；一条都没删到就抛错。 */
function dropAllLinesContaining(text, marker) {
  const lines = text.split("\n");
  const kept = lines.filter((l) => !l.includes(marker));
  if (kept.length === lines.length) {
    throw new Error(`注入锚点不存在：一条含「${marker}」的行都没有`);
  }
  return kept.join("\n");
}

const PAPER = `papers/${pubs[0].slug}/index.html`;

/* ---------- 十档 ---------- */
const CASES = [
  { id: "M0", desc: "基线（原样）", expect: "green" },
  {
    id: "M1",
    desc: "删掉 citation_online_date",
    expect: "red",
    sub: "少了 citation_online_date",
    file: PAPER,
    mutate: (t) => dropLineContaining(t, 'name="citation_online_date"'),
  },
  {
    id: "M2",
    desc: "改掉 citation_online_date 的值",
    expect: "red",
    sub: "citation_online_date 的取值与 site.js 不一致",
    file: PAPER,
    mutate: (t) =>
      replaceOnce(
        t,
        '<meta name="citation_online_date" content="2026/06/01" />',
        '<meta name="citation_online_date" content="2026/06/02" />'
      ),
  },
  {
    id: "M3",
    desc: "把 citation_online_date 改到出版日之后（C7 的不变量）",
    expect: "red",
    sub: "上线日不可能晚于出版日",
    file: PAPER,
    mutate: (t) =>
      replaceOnce(
        t,
        '<meta name="citation_online_date" content="2026/06/01" />',
        '<meta name="citation_online_date" content="2027/01/01" />'
      ),
  },
  {
    id: "M4",
    desc: "删掉 citation_publication_date",
    expect: "red",
    sub: "少了 citation_publication_date",
    file: PAPER,
    mutate: (t) => dropLineContaining(t, 'name="citation_publication_date"'),
  },
  {
    id: "M5",
    desc: "改掉 citation_issn 的值",
    expect: "red",
    sub: "citation_issn 的取值与 site.js 不一致",
    file: PAPER,
    mutate: (t) =>
      replaceOnce(
        t,
        '<meta name="citation_issn" content="2169-897X" />',
        '<meta name="citation_issn" content="2169-8996" />'
      ),
  },
  {
    id: "M6",
    desc: "删掉论文页上全部 citation_*",
    expect: "red",
    sub: "一个 citation_* 标签都没有",
    file: PAPER,
    mutate: (t) => dropAllLinesContaining(t, 'name="citation_'),
  },
  {
    id: "M7",
    desc: "首页注入一个 citation_title（非论文页出现 citation_*）",
    expect: "red",
    sub: "页面上有",
    file: "index.html",
    mutate: (t) =>
      replaceOnce(
        t,
        "<head>",
        '<head>\n    <meta name="citation_title" content="Injected" />'
      ),
  },
  {
    id: "M8",
    desc: "删掉 publications.bib（引用导出缺失）",
    expect: "red",
    sub: "引用导出缺失",
    file: "publications.bib",
    mutate: null, // 删文件
    remove: true,
  },
  {
    id: "M9",
    desc: "改掉 publications.bib 里的 DOI（导出里这篇论文不见了）",
    expect: "red",
    sub: "的条目",
    file: "publications.bib",
    mutate: (t) =>
      replaceOnce(t, "10.1029/2026JD046836", "10.1029/2026JD999999"),
  },
];

/* ---------- 跑一档 ---------- */
function run(c) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mh-citation-selftest-${c.id}-`));
  try {
    const rels = copyProduct(dir);
    const missing = assertCopyComplete(rels);
    if (missing.length) {
      throw new Error(
        `复制产物不完整（缺 ${missing.join(" / ")}）——` +
          `多半是有并发构建正在清 _site，本档作废，不能记成「测过了」`
      );
    }
    if (c.remove) {
      const p = path.join(dir, c.file);
      if (!fs.existsSync(p)) throw new Error(`注入锚点不存在：找不到 ${c.file}`);
      fs.unlinkSync(p);
    } else if (c.mutate) {
      const p = path.join(dir, c.file);
      const before = fs.readFileSync(p, "utf8");
      const after = c.mutate(before);
      if (after === before) throw new Error("注入没有改变内容");
      fs.writeFileSync(p, after);
      /* 自证：注入确实落在文件里（坏跑必须当场暴露，不能记成"测过了"） */
      const check = fs.readFileSync(p, "utf8");
      if (check === before) throw new Error("注入写回后文件没变");
    }
    const r = spawnSync(process.execPath, [GATE], {
      env: { ...process.env, SITE_DIR: dir },
      encoding: "utf8",
      cwd: ROOT,
    });
    return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/* ---------- 开跑 ---------- */
let failed = 0;
console.log("引用元数据门禁 · 本地注入矩阵：\n");

for (const c of CASES) {
  let r;
  try {
    r = run(c);
  } catch (e) {
    console.error(`  ✗ ${c.id} ${c.desc} —— 注入本身坏了：${e.message}`);
    failed++;
    continue;
  }
  if (c.expect === "green") {
    if (r.code === 0) {
      console.log(`  ✓ ${c.id} ${c.desc} → 门禁全绿（exit 0）`);
    } else {
      console.error(`  ✗ ${c.id} ${c.desc} → 期望 exit 0，实际 ${r.code}`);
      console.error(r.out.split("\n").map((l) => "      " + l).join("\n"));
      failed++;
    }
  } else if (r.code === 1 && r.out.includes(c.sub)) {
    console.log(`  ✓ ${c.id} ${c.desc} → 判红，红因命中「${c.sub}」`);
  } else {
    console.error(
      `  ✗ ${c.id} ${c.desc} → 期望判红且红因含「${c.sub}」，实际 exit ${r.code}`
    );
    console.error(r.out.split("\n").map((l) => "      " + l).join("\n"));
    failed++;
  }
}

/* ---------- 自证：真产物一个字节都没被动过 ---------- */
{
  /* 注入只发生在 mkdtemp 出来的临时目录里；这里再确认真产物仍在原处、
     且内容与开跑前读到的完全一致。 */
  let touched = 0;
  const mustExist = [
    "index.html",
    "publications.bib",
    "publications.ris",
    ...pubs.map((p) => `papers/${p.slug}/index.html`),
  ];
  for (const rel of mustExist) {
    const p = path.join(SOURCE_SITE, rel);
    if (!fs.existsSync(p)) {
      touched++;
      continue;
    }
    if (before[rel] !== undefined && fs.readFileSync(p, "utf8") !== before[rel]) {
      touched++;
    }
  }
  if (touched) {
    console.error(
      `\n  ✗ 真产物 ${SOURCE_SITE} 被改动或缺了 ${touched} 个必需文件 —— ` +
        `自测必须只在副本上注入。`
    );
    failed++;
  }
}

console.log("");
if (failed) {
  console.error(`引用元数据自测未通过：${failed}/${CASES.length} 档不对。\n`);
  process.exit(1);
}
console.log(
  `引用元数据自测通过：${CASES.length} 档全部符合预期（注入只在副本上做，真产物与仓库源码未被改动）。\n`
);
