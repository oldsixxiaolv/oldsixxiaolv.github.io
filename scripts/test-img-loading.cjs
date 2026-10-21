#!/usr/bin/env node
/**
 * 门禁 IL1–IL6（scripts/check-img-loading.cjs）的本地夹具自测
 *
 * 这个自测要证明两件事，缺一不可：
 *   ① 门禁**能变红** —— 每条判据各有一档注入，让它真的报出来。
 *   ② 门禁**红得准** —— 只断言「注入能变红」不够，那只说明门禁**有反应**，
 *      不说明红因来自**那一条判据**。所以每档红都同时断言两件事：
 *      · 该条判据的编号**必须出现在失败条目里**（「· ILn：」）；
 *      · **其它**判据的编号**必须不出现**（否则就是同源缺陷，红因不纯）。
 *      再给每条判据补一档**负对照**：把门禁副本里的 `const ILn_ON = true;`
 *      改成 false 之后，对应的注入必须**转绿**，才能证明红因确实是这一条
 *      判据判出来的。
 *
 * 另有两档是「必须判绿」的边界负对照：
 *   · `loading="lazy"` + `fetchpriority="low"` —— lazy 图配低优先级是**合法**
 *     组合，门禁守的是「声明得对不对」，不是「所有图都要 high」；
 *   · 扫描器 tricky 档：注释 / `<script>` 原始文本 / 别人的属性值里写的
 *     假 `<img>` **都不算数**（它们连 loading 都没写，被误当成真图就会红）。
 *
 * 夹具站只用真实产物里的 **HTML**（本门禁只读 `<img>` 的属性，不需要图片
 * 文件本身）⇒ 夹具很轻，17 档跑得快。
 *
 * 用法：node scripts/test-img-loading.cjs
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-img-loading.cjs");
const REAL_SITE = path.join(ROOT, "_site");

/* 夹具站只需要 HTML —— 本门禁不查图片文件是否存在。 */
const KEEP_EXT = new Set([".html"]);

if (!fs.existsSync(REAL_SITE)) {
  console.error(
    `图片加载策略门禁自测失败：找不到产物目录 ${REAL_SITE} —— ` +
      `夹具站的基线要靠它，先跑一次 npm run build。`
  );
  process.exit(1);
}

/* ---------- 夹具站 ---------- */

function copyHtml(fromDir, toDir) {
  fs.mkdirSync(toDir, { recursive: true });
  for (const e of fs.readdirSync(fromDir, { withFileTypes: true })) {
    if (e.name.startsWith("._")) continue; // exFAT 上的 AppleDouble 资源叉
    const p = path.join(fromDir, e.name);
    if (e.isDirectory()) {
      copyHtml(p, path.join(toDir, e.name));
    } else if (e.isFile() && KEEP_EXT.has(path.extname(e.name).toLowerCase())) {
      fs.copyFileSync(p, path.join(toDir, e.name));
    }
  }
}

function buildFixture(id) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `mh-imgload-${id}-`));
  copyHtml(REAL_SITE, path.join(root, "_site"));
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  const gate = path.join(root, "scripts", "check-img-loading.cjs");
  fs.copyFileSync(GATE, gate);
  const pkg = path.join(root, "package.json");
  fs.writeFileSync(
    pkg,
    JSON.stringify(
      {
        name: "mh-fixture",
        private: true,
        scripts: {
          build: "npm run check:img-loading",
          "check:img-loading": "node scripts/check-img-loading.cjs",
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
  return { root, gate, site: path.join(root, "_site"), htmlFiles, pkg };
}

/* ---------- HTML 标签工具（自带，不 import 被检查方代码） ---------- */

/** 找出所有真实 `<img>` 标签的位置（引号感知的扫描，属性值里的 '>' 不算结束）。 */
function findImgTags(html) {
  const out = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) break;
    if (!/^<img\b/i.test(html.slice(lt, lt + 5))) {
      i = lt + 1;
      continue;
    }
    let j = lt + 4;
    let quote = null;
    while (j < html.length) {
      const ch = html[j];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === ">") break;
      j++;
    }
    out.push({ start: lt, end: j + 1, text: html.slice(lt, j + 1) });
    i = j + 1;
  }
  return out;
}

/** 改一个文件：fn 收到原文，返回新原文；返回是否真的改动了。 */
function mutate(file, fn) {
  const before = fs.readFileSync(file, "utf8");
  const after = fn(before);
  if (after === before) return false;
  fs.writeFileSync(file, after);
  return true;
}

/** 找到指定 class 的 `<img>`，把标签文本交给 fn 改；找不到返回 null。 */
function editImgByClass(html, className, fn) {
  const tags = findImgTags(html);
  const t = tags.find((x) => x.text.includes(`class="${className}"`));
  if (!t) return null;
  return html.slice(0, t.start) + fn(t.text) + html.slice(t.end);
}

/** 设置（或替换）标签上的一个属性。 */
function setAttr(tag, name, value) {
  const re = new RegExp(`\\s${name}="[^"]*"`);
  if (re.test(tag)) return tag.replace(re, ` ${name}="${value}"`);
  const selfClosing = /\s*\/>$/.test(tag);
  const body = tag.replace(/\s*\/?>$/, "");
  return body + ` ${name}="${value}"` + (selfClosing ? " />" : ">");
}

/** 删掉标签上的一个属性。 */
function dropAttr(tag, name) {
  return tag.replace(new RegExp(`\\s${name}="[^"]*"`), "");
}

/** 在门禁副本里把某条判据卸掉（`const ILn_ON = true;` → false）。 */
function patchGate(fx, name) {
  const needle = `const ${name}_ON = true;`;
  const before = fs.readFileSync(fx.gate, "utf8");
  if (!before.includes(needle)) throw new Error(`门禁副本里找不到 ${needle}`);
  fs.writeFileSync(fx.gate, before.replace(needle, `const ${name}_ON = false;`));
}

/* ---------- 注入动作 ---------- */

const ABOUT = "about/index.html";
const INDEX = "index.html";
const PAPERS = "papers/index.html";

const INJECT = {
  /* IL1：关于页肖像两个属性都缺（= 本轮修掉的缺陷形态） */
  dropLoading: (fx) => {
    const file = path.join(fx.site, ABOUT);
    const ok = mutate(file, (t) =>
      editImgByClass(t, "about-hero__photo", (tag) =>
        dropAttr(dropAttr(tag, "loading"), "fetchpriority")
      )
    );
    if (!ok) throw new Error("没找到关于页肖像的 <img>");
  },
  /* IL1：loading 写成了非法取值 */
  badLoadingValue: (fx) => {
    const file = path.join(fx.site, ABOUT);
    const ok = mutate(file, (t) =>
      editImgByClass(t, "about-hero__photo", (tag) =>
        dropAttr(setAttr(tag, "loading", "auto"), "fetchpriority")
      )
    );
    if (!ok) throw new Error("没找到关于页肖像的 <img>");
  },
  /* IL2：eager 却没写 fetchpriority */
  eagerWithoutPriority: (fx) => {
    const file = path.join(fx.site, INDEX);
    const ok = mutate(file, (t) =>
      editImgByClass(t, "home-portrait__img", (tag) => dropAttr(tag, "fetchpriority"))
    );
    if (!ok) throw new Error("没找到首页人像的 <img>");
  },
  /* IL3：lazy 却写了 fetchpriority="high"（两个属性自相矛盾） */
  lazyWithHighPriority: (fx) => {
    const file = path.join(fx.site, PAPERS);
    const ok = mutate(file, (t) =>
      editImgByClass(t, "home-pub__figure-img", (tag) => setAttr(tag, "fetchpriority", "high"))
    );
    if (!ok) throw new Error("没找到论文列表配图的 <img>");
  },
  /* IL4：fetchpriority 拼错 */
  typoPriority: (fx) => {
    const file = path.join(fx.site, PAPERS);
    const ok = mutate(file, (t) =>
      editImgByClass(t, "home-pub__figure-img", (tag) => setAttr(tag, "fetchpriority", "hign"))
    );
    if (!ok) throw new Error("没找到论文列表配图的 <img>");
  },
  /* IL5：抽掉产物里全部 <img>（覆盖度自证） */
  stripAllImgs: (fx) => {
    for (const f of fx.htmlFiles) {
      mutate(f, (t) => {
        const tags = findImgTags(t);
        if (!tags.length) return t;
        let out = "";
        let last = 0;
        for (const tag of tags) {
          out += t.slice(last, tag.start);
          last = tag.end;
        }
        return out + t.slice(last);
      });
    }
  },
  /* IL6：package.json 里把本门禁摘掉 */
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
  /* 必须判绿：lazy + fetchpriority="low" 是合法组合 */
  lazyWithLowPriority: (fx) => {
    const file = path.join(fx.site, PAPERS);
    const ok = mutate(file, (t) =>
      editImgByClass(t, "home-pub__figure-img", (tag) => setAttr(tag, "fetchpriority", "low"))
    );
    if (!ok) throw new Error("没找到论文列表配图的 <img>");
  },
  /* 必须判绿：注释 / <script> 原始文本 / 别人的属性值里的假 <img> 不算数
     （它们连 loading 都没写，被误当成真图就会红） */
  trickyNoise: (fx) => {
    const file = path.join(fx.site, INDEX);
    const ok = mutate(file, (t) =>
      t.replace(
        "</body>",
        [
          '<!-- <img src="assets/img/author/mh-d48-noise-comment.jpg" alt=""> -->',
          "<script>var s = '<img src=\"assets/img/author/mh-d48-noise-script.jpg\">';</script>",
          "<div data-x=\"<img src='assets/img/author/mh-d48-noise-attr.jpg'>\"></div>",
          "</body>",
        ].join("\n")
      )
    );
    if (!ok) throw new Error("没找到 </body>");
  },
  /* 必须判绿：新增一张完全合法的 lazy 图（门禁守的是声明，不是固定清单） */
  addValidLazyImg: (fx) => {
    const file = path.join(fx.site, INDEX);
    const ok = mutate(file, (t) =>
      t.replace(
        "</body>",
        '<img class="mh-d48-extra" src="assets/img/author/mh-d48-extra.jpg" alt="Extra" ' +
          'width="100" height="100" loading="lazy" decoding="async">\n</body>'
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

/* 失败条目在门禁输出里长这样：「  · IL3：……」 —— 只认这一种，不认通过行。 */
function failBullet(out, id) {
  return out.includes("· " + id + "：");
}

/** 输出里出现了哪些判据编号的失败条目。 */
function bulletsFound(out) {
  const ids = new Set();
  const re = /· (IL\d)：/g;
  let m;
  while ((m = re.exec(out)) !== null) ids.add(m[1]);
  return ids;
}

/* ---------- 注入矩阵 ---------- */
const CASES = [
  {
    id: "IS0",
    expect: "green",
    desc: "基线：真实产物（首页人像与关于页肖像都 eager + high，配图都 lazy）",
    apply: () => {},
  },
  {
    id: "IS1",
    expect: "red",
    must: ["IL1"],
    forbid: ["IL2", "IL3", "IL4", "IL5", "IL6"],
    desc: "关于页肖像不声明 loading（= 本轮修掉的缺陷形态，IL1）",
    apply: (fx) => INJECT.dropLoading(fx),
  },
  {
    id: "IS2",
    expect: "red",
    must: ["IL1"],
    forbid: ["IL2", "IL3", "IL4", "IL5", "IL6"],
    desc: "loading 写成非法取值 auto（IL1）",
    apply: (fx) => INJECT.badLoadingValue(fx),
  },
  {
    id: "IS3",
    expect: "red",
    must: ["IL2"],
    forbid: ["IL1", "IL3", "IL4", "IL5", "IL6"],
    desc: "eager 却没写 fetchpriority（IL2）",
    apply: (fx) => INJECT.eagerWithoutPriority(fx),
  },
  {
    id: "IS4",
    expect: "red",
    must: ["IL3"],
    forbid: ["IL1", "IL2", "IL4", "IL5", "IL6"],
    desc: "lazy 却写了 fetchpriority=high（IL3）",
    apply: (fx) => INJECT.lazyWithHighPriority(fx),
  },
  {
    id: "IS5",
    expect: "red",
    must: ["IL4"],
    forbid: ["IL1", "IL2", "IL3", "IL5", "IL6"],
    desc: "fetchpriority 拼错成 hign（IL4）",
    apply: (fx) => INJECT.typoPriority(fx),
  },
  {
    id: "IS6",
    expect: "red",
    must: ["IL5"],
    forbid: ["IL1", "IL2", "IL3", "IL4", "IL6"],
    desc: "负对照：抽掉产物里全部 <img>（IL5 覆盖度自证）",
    apply: (fx) => INJECT.stripAllImgs(fx),
  },
  {
    id: "IS7",
    expect: "red",
    must: ["IL6"],
    forbid: ["IL1", "IL2", "IL3", "IL4", "IL5"],
    desc: "负对照：package.json 里把本门禁摘掉（IL6）",
    apply: (fx) => INJECT.unwireGate(fx),
  },
  {
    id: "IS8",
    expect: "green",
    desc: "负对照：卸掉 IL1 判定 ⇒ IS1 的注入转绿",
    apply: (fx) => {
      patchGate(fx, "IL1");
      INJECT.dropLoading(fx);
    },
  },
  {
    id: "IS9",
    expect: "green",
    desc: "负对照：卸掉 IL2 判定 ⇒ IS3 的注入转绿",
    apply: (fx) => {
      patchGate(fx, "IL2");
      INJECT.eagerWithoutPriority(fx);
    },
  },
  {
    id: "IS10",
    expect: "green",
    desc: "负对照：卸掉 IL3 判定 ⇒ IS4 的注入转绿",
    apply: (fx) => {
      patchGate(fx, "IL3");
      INJECT.lazyWithHighPriority(fx);
    },
  },
  {
    id: "IS11",
    expect: "green",
    desc: "负对照：卸掉 IL4 判定 ⇒ IS5 的注入转绿",
    apply: (fx) => {
      patchGate(fx, "IL4");
      INJECT.typoPriority(fx);
    },
  },
  {
    id: "IS12",
    expect: "green",
    desc: "负对照：卸掉 IL5 判定 ⇒ IS6 的注入转绿",
    apply: (fx) => {
      patchGate(fx, "IL5");
      INJECT.stripAllImgs(fx);
    },
  },
  {
    id: "IS13",
    expect: "green",
    desc: "负对照：卸掉 IL6 判定 ⇒ IS7 的注入转绿",
    apply: (fx) => {
      patchGate(fx, "IL6");
      INJECT.unwireGate(fx);
    },
  },
  {
    id: "IS14",
    expect: "green",
    desc: "必须判绿：lazy + fetchpriority=low 是合法组合（门禁不要求所有图都 high）",
    apply: (fx) => INJECT.lazyWithLowPriority(fx),
  },
  {
    id: "IS15",
    expect: "green",
    desc: "扫描器 tricky 档：注释 / <script> 原始文本 / 别人的属性值里的假 <img> 不算数",
    apply: (fx) => INJECT.trickyNoise(fx),
  },
  {
    id: "IS16",
    expect: "green",
    desc: "必须判绿：新增一张完全合法的 lazy 图（门禁守声明，不守固定清单）",
    apply: (fx) => INJECT.addValidLazyImg(fx),
  },
];

/* ---------- 真目录的指纹（跑完自证没被动过） ---------- */
function fingerprintHtml(dir) {
  const hash = crypto.createHash("sha256");
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1
    )) {
      const p = path.join(d, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        walk(p, r);
      } else if (e.name.endsWith(".html")) {
        hash.update(r);
        hash.update(fs.readFileSync(p));
      }
    }
  };
  walk(dir, "");
  return hash.digest("hex");
}

const beforeSite = fingerprintHtml(REAL_SITE);
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
    const missing = (c.must || []).filter((id) => !failBullet(out, id));
    if (missing.length) {
      failed++;
      lines.push(
        `✗ ${c.id}（${c.desc}）：判红了，但红因里**看不到**「${missing.join(" / ")}」\n${out.trim()}`
      );
      fs.rmSync(fx.root, { recursive: true, force: true });
      continue;
    }
    /* 红因必须**纯**：同源缺陷（一条注入同时触发两条判据）会让「红因归属」不可判定。 */
    const found = bulletsFound(out);
    const impure = (c.forbid || []).filter((id) => found.has(id));
    if (impure.length) {
      failed++;
      lines.push(
        `✗ ${c.id}（${c.desc}）：红因里混进了不该有的判据「${impure.join(" / ")}」—— ` +
          `这一档只该由一条判据判红\n${out.trim()}`
      );
      fs.rmSync(fx.root, { recursive: true, force: true });
      continue;
    }
    lines.push(`✓ ${c.id}  ${c.desc} → 判红，红因点名到位且不串味`);
  } else {
    if (!out.includes("图片加载策略门禁通过")) {
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
const afterSite = fingerprintHtml(REAL_SITE);
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
  console.error("图片加载策略门禁自测未通过：\n");
  lines.forEach((l) => console.error(`  ${l}`));
  console.error(`\n  ${failed} 档未通过。\n`);
  process.exit(1);
}

console.log(`图片加载策略门禁自测通过：${CASES.length} 档（IS0–IS16）注入矩阵全部符合预期。`);
lines.forEach((l) => console.log(`  ${l}`));
