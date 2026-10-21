#!/usr/bin/env node
/**
 * 站点 JS 门禁的**自测**（注入矩阵）——证明 JS1–JS6 每一条都**能变红**。
 *
 * 为什么这个自测是必需的：
 *   这道门禁守的是「站点 JS 能不能被浏览器真的加载起来」。
 *   而**产物现在是好的**（10 个 JS 文件全部能解析、7 个模块内说明符全部闭合、
 *   2 个内联 module 说明符全部落地、6 个 <script src> 全部落地），
 *   所以它在真站上**永远判绿** —— 一道「只在自己身上永远绿、没人知道它判红过没有」
 *   的门禁，等于没写（同族形态见 check-gates-wired.cjs 文件头：
 *   「看起来在、其实不生效」）。
 *   ⇒ 必须有一套**注入矩阵**把每一条判据都逼红一次。
 *
 * 做法（**副本式夹具**，不靠环境变量指向真目录）：
 *   每档都在 os.tmpdir() 下建一个**独立**的夹具站：
 *     <tmp>/_site/**                 ← 只复制真产物里的 .html 与 .js（门禁只看这两类）
 *     <tmp>/package.json              ← 最小 package.json，build 链指向本门禁
 *     <tmp>/scripts/check-site-js.cjs ← 门禁**副本**
 *   然后直接 `node <tmp>/scripts/check-site-js.cjs`：
 *   门禁的 ROOT = path.resolve(__dirname, "..") = <tmp>，
 *   所以它天然只看得见**这份副本**的 _site 与 package.json ——
 *   副本与夹具站天然同源，不需要靠环境变量指路，也就不会误读真目录。
 *   ⚠️ 全程不动仓库里的任何文件；跑完再自证真目录一个字节都没变。
 *
 * 十八档（JT0–JT17）：
 *   JT0  基线：一份完全健康的产物                 → exit 0（证明这套判据不是空跑）
 *   JT1  产物 JS 文件里注入语法错                 → 判红，点名「语法错误」（JS1）
 *   JT2  模块说明符指向不存在的文件               → 判红，点名「模块说明符」「没有这个文件」（JS2）
 *   JT3  裸说明符（import "lodash"）              → 判红，点名「裸说明符」（JS2）
 *   JT4  内联 module 的说明符指向不存在的文件     → 判红，点名「内联 module」（JS4）
 *   JT5  内联脚本注入语法错                       → 判红，点名「内联」「语法错误」（JS3）
 *   JT6  <script src> 指向不存在的文件            → 判红，点名「没有这个文件」（JS5）
 *   JT7  **负对照**：把 import 指向一个**新造的、真实存在的**文件
 *                                                 → **判绿** —— 证明门禁守的是
 *                                                   「目标存不存在」而不是「固定文件清单」
 *   JT8  **负对照**：抽掉产物里全部 JS 与 script 标签
 *                                                 → 判红，点名「一处都没比过」（JS6 覆盖度自证）
 *   JT9  **负对照**：package.json 里把本门禁摘掉  → 判红，点名「门禁自己被卸掉了」（JS6）
 *   JT10 **负对照**：卸掉 JS1 判定 → JT1 的注入转绿
 *   JT11 **负对照**：卸掉 JS2 判定 → JT2 的注入转绿
 *   JT12 **负对照**：卸掉 JS2 判定 → JT3（裸说明符）的注入转绿
 *   JT13 **负对照**：卸掉 JS3 判定 → JT5 的注入转绿
 *   JT14 **负对照**：卸掉 JS4 判定 → JT4 的注入转绿
 *   JT15 **负对照**：卸掉 JS5 判定 → JT6 的注入转绿
 *   JT16 **扫描器 tricky 档**：注释 / 字符串 / 模板串 / 正则字面量里各埋一个
 *        **指向不存在文件的假 import**，另配一个真的 import.meta 与一个真的 import
 *                                                 → **判绿** —— 证明扫描器只认真说明符
 *   JT17 **D10 原样复刻**：首页内联 module 的说明符写成裸的
 *                                                 → 判红，点名「裸说明符」
 *                                                   「Failed to resolve module specifier」（JS4）
 *
 * ⚠️ JT15 是这一族里最容易被糊弄过去的一档：
 *   一个偷懒的扫描器（直接对源码跑正则）会把注释里、字符串里、模板串里的
 *   `import("./x.js")` 也当成真说明符 ⇒ 门禁在正常站点上就会误红；
 *   反过来，一个**过度屏蔽**的扫描器（把所有 import 都当假的）会**漏掉真 broken**。
 *   JT15 用「假说明符指向不存在的文件」+「真说明符指向存在的文件」两头夹逼：
 *   前者被误当成真的就红，后者被漏掉就红 —— 只有两头都对才判绿。
 *
 * ⚠️ JT10–JT14 为什么必须单独有：
 *   只断言「注入能变红」不够 —— 那只说明门禁**有反应**，不说明红因来自**那一条判据**。
 *   把 `const JSn_ON = true;` 改成 false 之后，对应的注入必须**转绿**，
 *   才能证明红因确实是这一条判据判出来的，而不是别的判据顺带撞上的。
 *
 * 用法：node scripts/test-site-js.cjs
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-site-js.cjs");
const REAL_SITE = path.join(ROOT, "_site");
const REAL_PKG = path.join(ROOT, "package.json");

if (!fs.existsSync(REAL_SITE)) {
  console.error(
    `站点 JS 自测失败：找不到产物目录 ${REAL_SITE} —— ` +
      `夹具站的基线要靠它，先跑一次 npm run build。`
  );
  process.exit(1);
}

/* ---------- 夹具站 ---------- */

/** 只复制 .html 与 .js —— 门禁的视野只在这两类文件上。 */
function copyRelevant(fromDir, toDir) {
  fs.mkdirSync(toDir, { recursive: true });
  for (const e of fs.readdirSync(fromDir, { withFileTypes: true })) {
    const p = path.join(fromDir, e.name);
    const rel = path.relative(fromDir, p);
    if (e.name.startsWith("._")) continue;
    if (e.isDirectory()) {
      copyRelevant(p, path.join(toDir, e.name));
    } else if (e.isFile() && (e.name.endsWith(".html") || e.name.endsWith(".js"))) {
      fs.copyFileSync(p, path.join(toDir, e.name));
    }
  }
}

/**
 * 造一条**静态 import 语句**（夹具数据）。
 *
 * ⚠️ 为什么用拼接而不是直接写字面量（本轮实测踩到的坑）：
 *   `check-tracked-refs`（TR1）会扫**每一个已被 git 跟踪的代码文件**里的
 *   静态 require / import **字面量**，并要求目标在磁盘上存在。
 *   而这里造的是**夹具数据** —— 要被写进临时目录里那些**假 JS 文件**的
 *   「静态 import 一个同目录相对路径」这类语句；在 `scripts/` 下
 *   `fixture-missing.js` / `extra.js` **本来就不存在**
 *   ⇒ 直接写字面量，TR1 会把**夹具数据当成真引用** ⇒
 *   **提交后 build 直接红**（实测：文件**未跟踪**时 TR1 扫不到它、build 绿；
 *   一旦纳入跟踪，TR1 扫到了，build 就红 ⇒ 「提交前绿」不等于「提交后的树绿」）。
 *   ⇒ 所以夹具里的 import 语句由这里**拼接生成**：源码里不出现
 *   「静态本地引用」字面量，而**真引用仍然是字面量**、照旧被 TR1 扫到。
 */
function importStmt(spec) {
  return "import " + JSON.stringify(spec) + ";";
}

function buildFixture(id) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `mh-js-${id}-`));
  copyRelevant(REAL_SITE, path.join(root, "_site"));
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  const gate = path.join(root, "scripts", "check-site-js.cjs");
  fs.copyFileSync(GATE, gate);
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify(
      {
        name: "mh-fixture",
        private: true,
        scripts: {
          build: "npm run check:site-js",
          "check:site-js": "node scripts/check-site-js.cjs",
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

/** 在门禁副本里把某条判据卸掉（`const JSn_ON = true;` → false）。 */
function patchGate(fx, name) {
  const needle = `const ${name}_ON = true;`;
  const before = fs.readFileSync(fx.gate, "utf8");
  if (!before.includes(needle)) throw new Error(`门禁副本里找不到 ${needle}`);
  fs.writeFileSync(fx.gate, before.replace(needle, `const ${name}_ON = false;`));
}

/* ---------- 注入动作（可复用：负对照档要再注入一次） ---------- */

const INJECT = {
  /* JS1：产物 JS 文件里注入语法错 */
  jsSyntax: (fx) => {
    const file = path.join(fx.site, "assets", "js", "theme.js");
    const ok = mutate(file, (t) => `\nconst __broken = ;\n${t}`);
    if (!ok) throw new Error("没找到 theme.js");
  },
  /* JS2：模块说明符指向不存在的文件 */
  missingSpec: (fx) => {
    const file = path.join(fx.site, "assets", "js", "theme.js");
    const ok = mutate(file, (t) => importStmt("./nope-does-not-exist.js") + "\n" + t);
    if (!ok) throw new Error("没找到 theme.js");
  },
  /* JS2：裸说明符 */
  bareSpec: (fx) => {
    const file = path.join(fx.site, "assets", "js", "theme.js");
    const ok = mutate(file, (t) => `import "lodash";\n${t}`);
    if (!ok) throw new Error("没找到 theme.js");
  },
  /* JS4：内联 module 的说明符指向不存在的文件 */
  inlineMissingSpec: (fx) => {
    const file = path.join(fx.site, "index.html");
    const ok = mutate(file, (t) =>
      t.replace('import("./assets/js/home-chart.js")', 'import("./assets/js/nope.js")')
    );
    if (!ok) throw new Error("没找到首页内联 module 的 import");
  },
  /* JS4：D10 原样 —— 首页内联 module 的说明符写成裸的 */
  inlineBareSpec: (fx) => {
    const file = path.join(fx.site, "index.html");
    const ok = mutate(file, (t) =>
      t.replace('import("./assets/js/home-chart.js")', 'import("assets/js/home-chart.js")')
    );
    if (!ok) throw new Error("没找到首页内联 module 的 import");
  },
  /* JS3：内联脚本注入语法错 */
  inlineSyntax: (fx) => {
    const file = path.join(fx.site, "index.html");
    const ok = mutate(file, (t) =>
      t.replace(/(<script>)([\s\S]*?)(<\/script>)/, (m, a, body, b) => `${a}\nconst __broken = ;\n${body}${b}`)
    );
    if (!ok) throw new Error("没找到首页的经典内联脚本");
  },
  /* JS5：<script src> 指向不存在的文件 */
  srcMissing: (fx) => {
    const file = path.join(fx.site, "index.html");
    const ok = mutate(file, (t) =>
      t.replace('src="assets/js/main.js"', 'src="assets/js/nope.js"')
    );
    if (!ok) throw new Error("没找到首页的 <script src>");
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
    id: "JT0",
    expect: "green",
    desc: "基线：完全健康的产物",
    apply: () => {},
  },
  {
    id: "JT1",
    expect: "red",
    subs: ["theme.js", "语法错误"],
    desc: "产物 JS 文件里注入语法错（JS1）",
    apply: (fx) => INJECT.jsSyntax(fx),
  },
  {
    id: "JT2",
    expect: "red",
    subs: ["模块说明符", "没有这个文件"],
    desc: "模块说明符指向不存在的文件（JS2）",
    apply: (fx) => INJECT.missingSpec(fx),
  },
  {
    id: "JT3",
    expect: "red",
    subs: ["裸说明符"],
    desc: "裸说明符 import \"lodash\"（JS2）",
    apply: (fx) => INJECT.bareSpec(fx),
  },
  {
    id: "JT4",
    expect: "red",
    subs: ["内联 module", "没有这个文件"],
    desc: "内联 module 的说明符指向不存在的文件（JS4）",
    apply: (fx) => INJECT.inlineMissingSpec(fx),
  },
  {
    id: "JT5",
    expect: "red",
    subs: ["内联", "语法错误"],
    desc: "内联脚本注入语法错（JS3）",
    apply: (fx) => INJECT.inlineSyntax(fx),
  },
  {
    id: "JT6",
    expect: "red",
    subs: ["<script src=", "没有这个文件"],
    desc: "<script src> 指向不存在的文件（JS5）",
    apply: (fx) => INJECT.srcMissing(fx),
  },
  {
    id: "JT7",
    expect: "green",
    desc: "负对照：把 import 指向一个真实存在的新文件（门禁守存在性、不守固定清单）",
    apply: (fx) => {
      fs.writeFileSync(
        path.join(fx.site, "assets", "js", "extra.js"),
        "export const extra = 1;\n"
      );
      const file = path.join(fx.site, "assets", "js", "main.js");
      const ok = mutate(file, (t) =>
        t.replace(importStmt("./theme.js"), importStmt("./extra.js"))
      );
      if (!ok) throw new Error("没找到 main.js 的 theme.js 导入行");
    },
  },
  {
    id: "JT8",
    expect: "red",
    subs: ["一处都没比过"],
    desc: "负对照：抽掉产物里全部 JS 与 script 标签（JS6 覆盖度自证）",
    apply: (fx) => {
      for (const f of fx.htmlFiles) {
        mutate(f, (t) => t.replace(/<script\b[\s\S]*?<\/script>/g, ""));
      }
      const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) walk(p);
          else if (e.name.endsWith(".js")) fs.rmSync(p);
        }
      };
      walk(path.join(fx.site, "assets"));
    },
  },
  {
    id: "JT9",
    expect: "red",
    subs: ["门禁自己被卸掉了"],
    desc: "负对照：package.json 里把本门禁摘掉（JS6）",
    apply: (fx) => {
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
  },
  {
    id: "JT10",
    expect: "green",
    desc: "负对照：卸掉 JS1 判定 ⇒ JT1 的注入转绿",
    apply: (fx) => {
      patchGate(fx, "JS1");
      INJECT.jsSyntax(fx);
    },
  },
  {
    id: "JT11",
    expect: "green",
    desc: "负对照：卸掉 JS2 判定 ⇒ JT2 的注入转绿",
    apply: (fx) => {
      patchGate(fx, "JS2");
      INJECT.missingSpec(fx);
    },
  },
  {
    id: "JT12",
    expect: "green",
    desc: "负对照：卸掉 JS2 判定 ⇒ JT3（裸说明符）的注入转绿",
    apply: (fx) => {
      patchGate(fx, "JS2");
      INJECT.bareSpec(fx);
    },
  },
  {
    id: "JT13",
    expect: "green",
    desc: "负对照：卸掉 JS3 判定 ⇒ JT5 的注入转绿",
    apply: (fx) => {
      patchGate(fx, "JS3");
      INJECT.inlineSyntax(fx);
    },
  },
  {
    id: "JT14",
    expect: "green",
    desc: "负对照：卸掉 JS4 判定 ⇒ JT4 的注入转绿",
    apply: (fx) => {
      patchGate(fx, "JS4");
      INJECT.inlineMissingSpec(fx);
    },
  },
  {
    id: "JT15",
    expect: "green",
    desc: "负对照：卸掉 JS5 判定 ⇒ JT6 的注入转绿",
    apply: (fx) => {
      patchGate(fx, "JS5");
      INJECT.srcMissing(fx);
    },
  },
  {
    id: "JT16",
    expect: "green",
    desc: "扫描器 tricky 档：注释/字符串/模板串/正则里的假 import 不算说明符",
    apply: (fx) => {
      fs.writeFileSync(
        path.join(fx.site, "assets", "js", "tricky.js"),
        [
          '// import("./missing-comment.js")',
          '/* import("./missing-block.js") */',
          "const s = 'import(\"./missing-string.js\")';",
          "const t = `import(\"./missing-template.js\")`;",
          "const re = /import\\(\"\\.\\/missing-regex\\.js\"\\)/;",
          "const u = import.meta.url;",
          importStmt("./theme.js"),
          "",
        ].join("\n")
      );
    },
  },
  {
    id: "JT17",
    expect: "red",
    subs: ["裸说明符", "Failed to resolve module specifier"],
    desc: "D10 原样复刻：首页内联 module 的说明符写成裸的（JS4）",
    apply: (fx) => INJECT.inlineBareSpec(fx),
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
    continue;
  }
  const { code, out } = runGate(fx);
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
    if (!out.includes("站点 JS 门禁通过")) {
      failed++;
      lines.push(`✗ ${c.id}（${c.desc}）：判绿，但没打出通过语\n${out.trim()}`);
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
  console.error("站点 JS 门禁自测未通过：\n");
  lines.forEach((l) => console.error(`  ${l}`));
  console.error(`\n  ${failed} 档未通过。\n`);
  process.exit(1);
}

console.log(`站点 JS 门禁自测通过：${CASES.length} 档（JT0–JT17）注入矩阵全部符合预期。`);
lines.forEach((l) => console.log(`  ${l}`));
