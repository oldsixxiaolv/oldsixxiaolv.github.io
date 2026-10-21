#!/usr/bin/env node
/**
 * 顶层导航契约门禁的**自测**（注入矩阵）——证明 NA1–NA5 每一条都**能变红**。
 *
 * 为什么这个自测是必需的：
 *   这道门禁守的是「两份真源对齐」。它跟别的门禁不一样的地方在于：
 *   **两份真源与产物现在恰好是对齐的**（修完 order 化石之后），
 *   所以在真站上它永远判绿 —— 一道「只在自己身上永远绿、没人知道它判红过没有」
 *   的门禁，等于没写（这正是 check-gates-wired.cjs 文件头写的同一族形态：
 *   「看起来在、其实不生效」）。
 *   ⇒ 必须有一套**注入矩阵**把每一条判据都逼红一次。
 *
 * 做法：
 *   每档都在 os.tmpdir() 下建一个**独立**的夹具站：
 *     <tmp>/_site/**            ← 复制仓库里真实的那份产物（NA3/NA4 的基线靠它）
 *     <tmp>/src/**              ← 复制模板与真源 site.js（NA1/NA2 的基线靠它）
 *     <tmp>/scripts/lib/        ← identity.cjs（site.js 自己 require 它，路径是相对的）
 *   再用 SITE_DIR / SITE_DATA_PATH / SRC_DIR / PKG_PATH 把门禁指向夹具站。
 *   ⚠️ 全程不动仓库里的任何文件；跑完再自证真目录一个字节都没变。
 *
 * 九档（NT0–NT8）：
 *   NT0  基线：一份完全对齐的导航                → exit 0（证明这套判据不是空跑）
 *   NT1  About 的 order 改成 6                  → 判红，点名「位次」（NA2）
 *   NT2  blog.njk 的 key 改成 Journal            → 判红，点名「eleventyNavigation 里有」（NA1）
 *   NT3  site.js 里 About 的 label 改成 About Us → 判红，点名「nav 数组里有」（NA1）
 *   NT4  site.js 里多一个 nav 入口 Extra         → 判红，点名「nav 数组里有」（NA1）
 *   NT5  site.js 里 About 指向 /nowhere/        → 判红，点名「没有对应页面」（NA4）
 *   NT6  产物里 about 页的页头少一个链接         → 判红，点名「页头导航有 3 项」（NA3）
 *   NT7  **负对照**：三处（真源 / 模板 / 产物）一起把 Blog 改成 Journal
 *                                                → **判绿** —— 证明门禁守的是
 *                                                  「对齐」而不是「具体是哪几个入口」
 *   NT8  **负对照**：package.json 里把本门禁摘掉 → 判红，点名「门禁自己被卸掉了」（NA5）
 *
 * ⚠️ NT7 是这一族里最要紧的一档：
 *   门禁如果写死了「必须是 Home / Papers / Blog / About 四个」，
 *   它就会变成"锁死内容"的门禁 —— 而内容该由本人定。
 *   NT7 把三处一起改成另一套**同样自洽**的导航，门禁必须判绿。
 *   它的可执行形式就是「门禁不锁死入口集合」这条边界。
 *
 * 用法：node scripts/test-navigation-contract.cjs
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-navigation-contract.cjs");
const REAL_SITE = path.join(ROOT, "_site");
const REAL_SRC = path.join(ROOT, "src");
const REAL_PKG = path.join(ROOT, "package.json");

if (!fs.existsSync(REAL_SITE)) {
  console.error(
    `顶层导航自测失败：找不到产物目录 ${REAL_SITE} —— ` +
      `夹具站的基线要靠它，先跑一次 npm run build。`
  );
  process.exit(1);
}

/* ---------- 夹具站 ---------- */
function buildFixture(id) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `mh-nav-${id}-`));
  fs.cpSync(REAL_SITE, path.join(root, "_site"), { recursive: true });
  fs.cpSync(REAL_SRC, path.join(root, "src"), { recursive: true });
  fs.mkdirSync(path.join(root, "scripts", "lib"), { recursive: true });
  fs.cpSync(
    path.join(ROOT, "scripts", "lib", "identity.cjs"),
    path.join(root, "scripts", "lib", "identity.cjs")
  );
  return {
    root,
    site: path.join(root, "_site"),
    src: path.join(root, "src"),
    data: path.join(root, "src", "_data", "site.js"),
    pkg: path.join(root, "package.json"),
  };
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

/** 产物里所有 html 文件：逐个过一遍 fn。 */
function mutateProduct(fx, fn) {
  const files = [];
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p, r);
      else if (e.name.endsWith(".html")) files.push(p);
    }
  };
  walk(fx.site, "");
  for (const f of files) mutate(f, fn);
}

/* ---------- 跑门禁 ---------- */
function runGate(fx, extraEnv) {
  const env = Object.assign({}, process.env, {
    SITE_DIR: fx.site,
    SITE_DATA_PATH: fx.data,
    SRC_DIR: fx.src,
  });
  if (extraEnv) Object.assign(env, extraEnv);
  const r = spawnSync(process.execPath, [GATE], { env, encoding: "utf8" });
  return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
}

/* ---------- 注入矩阵 ---------- */
const CASES = [
  {
    id: "NT0",
    expect: "green",
    desc: "基线：完全对齐的导航",
    apply: () => {},
  },
  {
    id: "NT1",
    expect: "red",
    subs: ["位次"],
    desc: "About 的 order 改成 6（位次对不上）",
    apply: (fx) => {
      const ok = mutate(path.join(fx.src, "about.njk"), (t) =>
        t.replace(/^  order: \d+$/m, "  order: 6")
      );
      if (!ok) throw new Error("没找到 about.njk 的 order 行");
    },
  },
  {
    id: "NT2",
    expect: "red",
    subs: ["eleventyNavigation 里有"],
    desc: "blog.njk 的 key 改成 Journal（与 nav 数组对不上）",
    apply: (fx) => {
      const ok = mutate(path.join(fx.src, "blog.njk"), (t) =>
        t.replace(/^  key: Blog$/m, "  key: Journal")
      );
      if (!ok) throw new Error("没找到 blog.njk 的 key 行");
    },
  },
  {
    id: "NT3",
    expect: "red",
    subs: ["nav 数组里有"],
    desc: "site.js 里 About 的 label 改成 About Us（与模板 key 对不上）",
    apply: (fx) => {
      const ok = mutate(fx.data, (t) =>
        t.replace(
          '{ label: "About", href: "/about/" }',
          '{ label: "About Us", href: "/about/" }'
        )
      );
      if (!ok) throw new Error("没找到 site.js 的 About 入口");
    },
  },
  {
    id: "NT4",
    expect: "red",
    subs: ["nav 数组里有"],
    desc: "site.js 里多一个 nav 入口 Extra（模板里没有对应 key）",
    apply: (fx) => {
      const ok = mutate(fx.data, (t) =>
        t.replace(
          '    { label: "About", href: "/about/" },\n  ],',
          '    { label: "About", href: "/about/" },\n    { label: "Extra", href: "/extra/" },\n  ],'
        )
      );
      if (!ok) throw new Error("没找到 site.js 的 nav 数组结尾");
    },
  },
  {
    id: "NT5",
    expect: "red",
    subs: ["没有对应页面"],
    desc: "site.js 里 About 指向 /nowhere/（产物里没有这个页面）",
    apply: (fx) => {
      const ok = mutate(fx.data, (t) =>
        t.replace(
          '{ label: "About", href: "/about/" }',
          '{ label: "About", href: "/nowhere/" }'
        )
      );
      if (!ok) throw new Error("没找到 site.js 的 About 入口");
    },
  },
  {
    id: "NT6",
    expect: "red",
    subs: ["页头导航有 3 项"],
    desc: "产物里 about 页的页头少一个链接",
    apply: (fx) => {
      const file = path.join(fx.site, "about", "index.html");
      const ok = mutate(file, (t) =>
        t.replace(/<a\b[^>]*class="topbar__link"[^>]*>\s*About\s*<\/a>\s*/g, "")
      );
      if (!ok) throw new Error("没找到 about 页页头的 About 链接");
    },
  },
  {
    id: "NT7",
    expect: "green",
    desc: "负对照：真源 / 模板 / 产物三处一起把 Blog 改成 Journal",
    apply: (fx) => {
      const a = mutate(fx.data, (t) =>
        t.replace(
          '{ label: "Blog", href: "/blog/" }',
          '{ label: "Journal", href: "/blog/" }'
        )
      );
      if (!a) throw new Error("没找到 site.js 的 Blog 入口");
      const b = mutate(path.join(fx.src, "blog.njk"), (t) =>
        t.replace(/^  key: Blog$/m, "  key: Journal")
      );
      if (!b) throw new Error("没找到 blog.njk 的 key 行");
      mutateProduct(fx, (t) => t.replace(/>Blog<\/a>/g, ">Journal</a>"));
    },
  },
  {
    id: "NT8",
    expect: "red",
    subs: ["门禁自己被卸掉了"],
    desc: "负对照：package.json 里把本门禁摘掉",
    apply: (fx) => {
      const pkg = JSON.parse(fs.readFileSync(REAL_PKG, "utf8"));
      delete pkg.scripts["check:navigation"];
      pkg.scripts.build = pkg.scripts.build
        .replace("npm run check:navigation && ", "")
        .replace("npm run check:navigation-selftest && ", "");
      fs.writeFileSync(fx.pkg, JSON.stringify(pkg, null, 2));
      return { PKG_PATH: fx.pkg };
    },
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

const beforeSrc = fingerprint(REAL_SRC);
const beforeSite = fingerprint(REAL_SITE);

/* ---------- 跑 ---------- */
let failed = 0;
const lines = [];
for (const c of CASES) {
  const fx = buildFixture(c.id);
  let extraEnv = null;
  try {
    const r = c.apply(fx);
    if (r && r.PKG_PATH) extraEnv = r;
  } catch (e) {
    failed++;
    lines.push(`✗ ${c.id} 注入失败：${e.message}`);
    continue;
  }
  const { code, out } = runGate(fx, extraEnv);
  const want = c.expect === "green" ? 0 : 1;
  if (code !== want) {
    failed++;
    lines.push(
      `✗ ${c.id}（${c.desc}）：期望 exit ${want}，实测 exit ${code}\n${out.trim()}`
    );
    continue;
  }
  if (c.expect === "red") {
    const missing = (c.subs || []).filter((s) => !out.includes(s));
    if (missing.length) {
      failed++;
      lines.push(
        `✗ ${c.id}（${c.desc}）：判红了，但红因里**看不到**「${missing.join(" / ")}」\n${out.trim()}`
      );
      continue;
    }
    lines.push(`✓ ${c.id}  ${c.desc} → 判红，红因点名到位`);
  } else {
    if (!out.includes("顶层导航契约门禁通过")) {
      failed++;
      lines.push(`✗ ${c.id}（${c.desc}）：判绿，但没打出通过语\n${out.trim()}`);
      continue;
    }
    lines.push(`✓ ${c.id}  ${c.desc} → 判绿（负对照通过）`);
  }
  fs.rmSync(fx.root, { recursive: true, force: true });
}

/* ---------- 自证：真目录一个字节都没变 ---------- */
const afterSrc = fingerprint(REAL_SRC);
const afterSite = fingerprint(REAL_SITE);
if (beforeSrc !== afterSrc) {
  failed++;
  lines.push("✗ 自测动了仓库里的 src/ —— 夹具站必须与真目录彻底分开。");
}
if (beforeSite !== afterSite) {
  failed++;
  lines.push("✗ 自测动了仓库里的 _site/ —— 夹具站必须与真目录彻底分开。");
}

if (failed) {
  console.error("顶层导航契约门禁自测未通过：\n");
  lines.forEach((l) => console.error(`  ${l}`));
  console.error(`\n  ${failed} 档未通过。\n`);
  process.exit(1);
}

console.log(`顶层导航契约门禁自测通过：${CASES.length} 档（NT0–NT8）注入矩阵全部符合预期。`);
lines.forEach((l) => console.log(`  ${l}`));
