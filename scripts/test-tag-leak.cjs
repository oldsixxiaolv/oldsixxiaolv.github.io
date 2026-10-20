#!/usr/bin/env node
/**
 * 集合名标签泄漏门禁的**自测**（注入矩阵）—— 证明 T1–T5 每一条都**能变红**。
 *
 * 为什么这个自测是必需的（一次具体的核对，不是假想）：
 *   站内 **0 篇文章** ⇒ 详情页版式从未被渲染过，产物层永远看不到这个泄漏。
 *   一道"在自己身上永远不执行"的门禁等于没写：它 exit 0、输出漂亮，
 *   但没人知道它判红过没有 —— 这正是 check-gates-wired.cjs 文件头写的同一族形态
 *   （"看起来在、其实不生效"）。
 *
 * 做法：
 *   每档都在 os.tmpdir() 下新建一个**独立**的夹具站：
 *     <tmp>/content/<集合>/<集合>.11tydata.cjs  ← 复制仓库里真实的那几份
 *     <tmp>/layouts/detail.njk                  ← 复制真实版式（可能注入坏态）
 *     <tmp>/blog.njk                            ← 复制真实列表页（可能注入坏态）
 *   再用 DETAIL_LAYOUT / LIST_PAGE / CONTENT_DIR 三个环境变量把门禁指向夹具站。
 *   ⚠️ 全程不动仓库里的任何文件；跑完再自证真目录一个字节都没变。
 *
 * 七档（N0–N6）：
 *   N0  基线：原样的版式 + 原样的集合清单        → exit 0（证明这套判据不是空跑）
 *   N1  版式漏滤集合名 "blog"（修复前的原样）    → 判红，T1 点名 blog
 *   N2  版式漏滤集合名 "portfolio"              → 判红，T5 点名 portfolio
 *   N3  过滤过头（把标签全滤掉）                 → 判红，T2 点名主题标签 TRMM
 *   N4  把 tags 本身滤掉（"看起来修好了"的错法）  → 判红，T3 点名版式判定
 *   N5  列表页漏滤集合名 "blog"                  → 判红，T4 点名 blog
 *   N6  新增一个用同一版式的集合 "notes" 但没滤   → 判红，T5 点名 notes
 *
 * N4 值得单列：它是**最可能发生的错修** —— 集合名确实不见了，
 *   但文章也被偷偷换成了首页版式（"Back to Home"），页脚回不到列表页。
 *   只查"集合名还在不在"的门禁会放过它；T3 才拦得住。
 *
 * 用法：node scripts/test-tag-leak.cjs
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-tag-leak.cjs");
const REAL_DETAIL = path.join(ROOT, "src", "_includes", "layouts", "detail.njk");
const REAL_LIST = path.join(ROOT, "src", "blog.njk");
const REAL_CONTENT = path.join(ROOT, "src", "content");

/** 版式里那行"展示用标签"的过滤链（注入的锚点）。 */
const FILTER_LINE = '{% set topicTags = tags | reject("equalto", "blog") | reject("equalto", "portfolio") %}';
/** 列表页里那行过滤链（注入的锚点）。 */
const LIST_FILTER_LINE = '{% set topicTags = post.data.tags | reject("equalto", "blog") %}';
/** 版式里判定 isPortfolio 的那行（注入"把 tags 本身滤掉"的锚点）。 */
const IS_PORTFOLIO_LINE = '{% set isPortfolio = tags and "portfolio" in tags %}';

for (const f of [REAL_DETAIL, REAL_LIST]) {
  if (!fs.existsSync(f)) {
    console.error(`集合名标签泄漏自测失败：找不到 ${f} —— 夹具站要复制它，先确认文件还在。`);
    process.exit(1);
  }
}

/* ---------- 夹具站 ---------- */
function buildFixture(c) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `mh-tag-leak-${c.id}-`));
  const contentDir = path.join(root, "content");
  fs.mkdirSync(path.join(root, "layouts"), { recursive: true });
  fs.cpSync(REAL_CONTENT, contentDir, { recursive: true });

  const detailPath = path.join(root, "layouts", "detail.njk");
  const listPath = path.join(root, "blog.njk");
  fs.copyFileSync(REAL_DETAIL, detailPath);
  fs.copyFileSync(REAL_LIST, listPath);

  return {
    root,
    contentDir,
    detailPath,
    listPath,
    /** 改版式（文本层面：门禁也是按文本核的） */
    editDetail(fn) {
      const before = fs.readFileSync(detailPath, "utf8");
      const after = fn(before);
      if (after === before) throw new Error("注入没有改变版式的内容（锚点没找到？）");
      fs.writeFileSync(detailPath, after);
    },
    /** 改列表页 */
    editList(fn) {
      const before = fs.readFileSync(listPath, "utf8");
      const after = fn(before);
      if (after === before) throw new Error("注入没有改变列表页的内容（锚点没找到？）");
      fs.writeFileSync(listPath, after);
    },
    /** 新增一个集合（目录数据文件），版式用 detail.njk */
    addCollection(name) {
      const dir = path.join(contentDir, name);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, `${name}.11tydata.cjs`),
        [
          `const { getSlugFromData } = require("../../eleventy-helpers.cjs");`,
          "",
          "module.exports = {",
          '  layout: "layouts/detail.njk",',
          "  permalink: (data) => `/${name}/${getSlugFromData(data)}/`,",
          `  tags: ["${name}"],`,
          "};",
          "",
        ].join("\n")
      );
    },
  };
}

/* ---------- 七档 ---------- */
const CASES = [
  { id: "N0", desc: "基线：原样的版式 + 原样的集合清单", expect: "green" },
  {
    id: "N1",
    desc: "版式漏滤集合名 blog（修复前的原样）",
    expect: "red",
    code: "T1",
    sub: "blog",
    setup: (fx) => {
      fx.editDetail((t) => {
        const out = t.replace(
          FILTER_LINE,
          '{% set topicTags = tags | reject("equalto", "portfolio") %}'
        );
        if (out === t) throw new Error("注入锚点不存在：版式里没有那行过滤链");
        return out;
      });
    },
  },
  {
    id: "N2",
    desc: "版式漏滤集合名 portfolio（该集合的分支现在不印标签，所以只有 T5 看得见）",
    expect: "red",
    code: "T5",
    sub: "portfolio",
    setup: (fx) => {
      fx.editDetail((t) => {
        const out = t.replace(
          FILTER_LINE,
          '{% set topicTags = tags | reject("equalto", "blog") %}'
        );
        if (out === t) throw new Error("注入锚点不存在：版式里没有那行过滤链");
        return out;
      });
    },
  },
  {
    id: "N3",
    desc: "过滤过头（集合名连同主题标签一起滤掉）",
    expect: "red",
    code: "T2",
    sub: "TRMM",
    setup: (fx) => {
      fx.editDetail((t) => {
        const out = t.replace(FILTER_LINE, "{% set topicTags = [] %}");
        if (out === t) throw new Error("注入锚点不存在：版式里没有那行过滤链");
        return out;
      });
    },
  },
  {
    id: "N4",
    desc: "把 tags 本身滤掉（集合名没了，版式也被换成首页版式）",
    expect: "red",
    code: "T3",
    sub: "Back to Blog",
    setup: (fx) => {
      fx.editDetail((t) => {
        const out = t.replace(
          IS_PORTFOLIO_LINE,
          '{% set tags = tags | reject("equalto", "blog") | reject("equalto", "portfolio") %}\n' +
            IS_PORTFOLIO_LINE
        );
        if (out === t) throw new Error("注入锚点不存在：版式里没有 isPortfolio 那行");
        return out;
      });
    },
  },
  {
    id: "N5",
    desc: "列表页漏滤集合名 blog",
    expect: "red",
    code: "T4",
    sub: "blog",
    setup: (fx) => {
      fx.editList((t) => {
        const out = t.replace(LIST_FILTER_LINE, "{% set topicTags = post.data.tags %}");
        if (out === t) throw new Error("注入锚点不存在：列表页里没有那行过滤链");
        return out;
      });
    },
  },
  {
    id: "N6",
    desc: "新增一个用同一版式的集合 notes，但版式没滤它",
    expect: "red",
    code: "T5",
    sub: "notes",
    setup: (fx) => {
      fx.addCollection("notes");
    },
  },
];

/* ---------- 跑一档 ---------- */
function run(c) {
  const fx = buildFixture(c);
  try {
    if (c.setup) c.setup(fx);
    const r = spawnSync(process.execPath, [GATE], {
      env: {
        ...process.env,
        DETAIL_LAYOUT: fx.detailPath,
        LIST_PAGE: fx.listPath,
        CONTENT_DIR: fx.contentDir,
      },
      encoding: "utf8",
      cwd: ROOT,
    });
    return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
}

/* ---------- 自证：真文件一个字节都没被动过 ---------- */
function snapshotReal() {
  const out = {};
  const walk = (dir, prefix) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) walk(full, rel);
      else if (e.isFile())
        out[rel] = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
    }
  };
  walk(REAL_CONTENT, "content");
  for (const f of [REAL_DETAIL, REAL_LIST]) {
    out[path.basename(f)] = crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
  }
  return out;
}

/* ---------- 开跑 ---------- */
const beforeReal = snapshotReal();
let failed = 0;
console.log("集合名标签泄漏门禁 · 本地注入矩阵：\n");

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
  } else {
    // 判红档：退出码 1，且输出里同时出现「判据编号」与「被点名的那个东西」
    const hitCode = new RegExp(`\\b${c.code}\\b`).test(r.out);
    const hitSub = r.out.includes(c.sub);
    if (r.code === 1 && hitCode && hitSub) {
      console.log(`  ✓ ${c.id} ${c.desc} → 判红，红因命中「${c.code}」并点名「${c.sub}」`);
    } else {
      console.error(
        `  ✗ ${c.id} ${c.desc} → 期望 exit 1 且红因含「${c.code}」与「${c.sub}」，实际 exit ${r.code}`
      );
      console.error(r.out.split("\n").map((l) => "      " + l).join("\n"));
      failed++;
    }
  }
}

/* ---------- 自证：真文件没被动过 ---------- */
{
  const afterReal = snapshotReal();
  const before = JSON.stringify(beforeReal);
  const after = JSON.stringify(afterReal);
  if (before !== after) {
    console.error(
      `\n  ✗ 真文件被改动或缺了文件 —— 自测必须只在副本上注入` +
        `（详情页版式 / 列表页 / 内容目录）。`
    );
    failed++;
  }
}

console.log("");
if (failed) {
  console.error(`集合名标签泄漏自测未通过：${failed}/${CASES.length} 档不对。\n`);
  process.exit(1);
}
console.log(
  `集合名标签泄漏自测通过：${CASES.length} 档全部符合预期` +
    `（注入只在 /tmp 的夹具站上做，仓库里的版式 / 列表页 / 内容目录未被改动）。\n`
);
