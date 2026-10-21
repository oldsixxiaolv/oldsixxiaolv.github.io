#!/usr/bin/env node
/**
 * 门禁 GA1–GA6（scripts/check-target-blank-rel.cjs）的本地夹具自测
 *
 * 这个自测要证明两件事，缺一不可：
 *   ① 门禁**能变红** —— 每条判据各有一档注入，让它真的报出来。
 *   ② 门禁**红得准** —— 只断言「注入能变红」不够，那只说明门禁**有反应**，
 *      不说明红因来自**那一条判据**。所以对每条判据再补一档**负对照**：
 *      把门禁副本里的 `const GAn_ON = true;` 改成 false 之后，
 *      对应的注入必须**转绿**，才能证明红因确实是这一条判据判出来的。
 *
 * 另有五档是「必须判绿」的边界负对照：
 *   · rel 里**多带**别的 token（`me`）⇒ 必须判绿（守的是「有没有那两个
 *     token」，不是「rel 只能有那两个 token」）；
 *   · rel 的 token **大写** ⇒ 必须判绿（HTML 规范里 rel 关键字大小写不敏感）；
 *   · 坏链接只出现在 **HTML 注释**里 ⇒ 必须判绿；
 *   · 坏链接只出现在 **Nunjucks 注释**里 ⇒ 必须判绿；
 *   · 普通**站内链接**（没有 target、也没有 rel）⇒ 必须判绿
 *     （门禁守的是「会开新上下文的链接」，不是「所有链接」）。
 *
 * 夹具站是**真实产物 + 真实模板的副本**：
 *   · 模板（src 目录下全部 .njk）必须一起进夹具 —— GA1 / GA3 判的就是这一层，
 *     只给产物那 GA1 / GA3 就没有判断对象；
 *   · 门禁副本放在夹具的 scripts/ 下 ⇒ 门禁自己的 ROOT 落到夹具根，
 *     它读到的产物、模板、package.json 全部是夹具自己的东西。
 *
 * 用法：node scripts/test-target-blank-rel.cjs
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-target-blank-rel.cjs");
const REAL_SITE = path.join(ROOT, "_site");
const REAL_SRC = path.join(ROOT, "src");

if (!fs.existsSync(REAL_SITE)) {
  console.error(
    `新标签页链接 rel 门禁自测失败：找不到产物目录 ${REAL_SITE} —— ` +
      `夹具站的基线要靠它，先跑一次 npm run build。`
  );
  process.exit(1);
}

/* ---------- 夹具站 ---------- */

function copyRelevant(fromDir, toDir, keep) {
  fs.mkdirSync(toDir, { recursive: true });
  for (const e of fs.readdirSync(fromDir, { withFileTypes: true })) {
    if (e.name.startsWith("._")) continue; // exFAT 上的 AppleDouble 资源叉
    const p = path.join(fromDir, e.name);
    if (e.isDirectory()) {
      copyRelevant(p, path.join(toDir, e.name), keep);
    } else if (e.isFile() && keep(path.extname(e.name).toLowerCase())) {
      fs.copyFileSync(p, path.join(toDir, e.name));
    }
  }
}

function buildFixture(id) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `mh-tbrel-${id.toLowerCase()}-`));
  const site = path.join(root, "_site");
  copyRelevant(REAL_SITE, site, (ext) => ext === ".html");

  /* 模板层：.njk 全部带上（GA1 / GA3 扫的就是这一层）。 */
  copyRelevant(REAL_SRC, path.join(root, "src"), (ext) => ext === ".njk");

  /* 门禁副本：门禁里的 ROOT = 父目录 ⇒ 产物、模板、package.json 都按
     夹具站的布局摆好，门禁在夹具里读到的就是夹具自己的东西。 */
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  const gate = path.join(root, "scripts", "check-target-blank-rel.cjs");
  fs.copyFileSync(GATE, gate);

  const pkg = path.join(root, "package.json");
  fs.writeFileSync(
    pkg,
    JSON.stringify(
      {
        name: "mh-fixture",
        private: true,
        scripts: {
          build: "npm run check:target-blank-rel",
          "check:target-blank-rel": "node scripts/check-target-blank-rel.cjs",
        },
      },
      null,
      2
    )
  );

  const htmlFiles = [];
  const walkHtml = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walkHtml(p);
      else if (e.name.endsWith(".html")) htmlFiles.push(p);
    }
  };
  walkHtml(site);

  return {
    root,
    gate,
    site,
    htmlFiles,
    pkg,
    index: path.join(site, "index.html"),
    tmplIndex: path.join(root, "src", "index.njk"),
  };
}

/* ---------- 改文件的小工具 ---------- */

/** 改一个文件：fn 收到原文，返回新原文。 */
function mutate(file, fn) {
  const before = fs.readFileSync(file, "utf8");
  const after = fn(before);
  if (after === before) return false;
  fs.writeFileSync(file, after);
  return true;
}

/** 在门禁副本里把某条判据卸掉（`const GAn_ON = true;` → false）。 */
function patchGate(fx, name) {
  const needle = `const ${name}_ON = true;`;
  const before = fs.readFileSync(fx.gate, "utf8");
  if (!before.includes(needle)) throw new Error(`门禁副本里找不到 ${needle}`);
  fs.writeFileSync(fx.gate, before.replace(needle, `const ${name}_ON = false;`));
}

/**
 * 把门禁副本里的「读 rel 的 token」这一步弄坏：**永远**返回两个必需的 token。
 * ⇒ 后果：① GA1 / GA2 眼里所有链接都合规（判绿）；
 *   ② GA5 的扫描器自证里那条「少一个 token 必须判红」的样例**判不出来** ⇒ GA5 判红。
 * 这正是自证要抓的那类「判定被悄悄废掉」。
 *
 * ⚠️ 必须是**返回数组**（原函数返回的是数组）：若把返回值改成字符串，
 *    `missingTokens` 里的 `new Set(字符串)` 会退化成「按字符切」，
 *    GA1 / GA2 会连带判红 ⇒ 那就分不清「GA5 被卸掉」与「判定被弄坏」两件事了。
 */
function breakRelTokens(fx) {
  const needle = "function relTokens(value) {";
  const before = fs.readFileSync(fx.gate, "utf8");
  if (!before.includes(needle)) throw new Error(`门禁副本里找不到 ${needle}`);
  fs.writeFileSync(
    fx.gate,
    before.replace(needle, 'function relTokens(value) { return ["noopener", "noreferrer"];')
  );
}

/* ---------- 自带的标签扫描器（注入要精确改到某一个标签） ---------- */

function scanTags(html) {
  const out = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) break;
    const m = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(lt, lt + 32));
    if (!m) {
      i = lt + 1;
      continue;
    }
    let j = lt + m[0].length;
    let quote = null;
    while (j < html.length) {
      const ch = html[j];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === ">") break;
      j++;
    }
    out.push({ tag: m[1].toLowerCase(), attrSrc: html.slice(lt + m[0].length, j), start: lt, end: j + 1 });
    i = j + 1;
  }
  return out;
}

/** 找第一个带 target="_blank" 的 <a> 标签（返回它在文本里的区间）。 */
function firstBlankLink(html) {
  for (const t of scanTags(html)) {
    if (t.tag !== "a") continue;
    if (!/\btarget\s*=\s*"_blank"/i.test(t.attrSrc)) continue;
    return t;
  }
  return null;
}

/** 改第一个 target="_blank" 链接的 rel：mode = remove | set（set 用 newValue）。 */
function rewriteFirstBlankRel(file, mode, newValue) {
  const html = fs.readFileSync(file, "utf8");
  const t = firstBlankLink(html);
  if (!t) throw new Error(`没找到 target="_blank" 的链接（${file}）`);
  const tagText = html.slice(t.start, t.end);
  let newTag;
  if (mode === "remove") {
    newTag = tagText.replace(/\s+rel\s*=\s*"[^"]*"/i, "");
  } else {
    newTag = tagText.replace(/(\s+rel\s*=\s*")([^"]*)(")/i, (m, a, v, b) => `${a}${newValue}${b}`);
  }
  if (newTag === tagText) throw new Error(`第一个 target="_blank" 链接上没找到 rel 属性（${file}）`);
  fs.writeFileSync(file, html.slice(0, t.start) + newTag + html.slice(t.end));
}

/** 在 </body> 之前插一段内容（插到页面末尾的真实位置）。 */
function insertBeforeBody(file, snippet) {
  const html = fs.readFileSync(file, "utf8");
  const at = html.lastIndexOf("</body>");
  if (at < 0) throw new Error(`没找到 </body>（${file}）`);
  fs.writeFileSync(file, html.slice(0, at) + snippet + html.slice(at));
}

/* ---------- 注入动作 ---------- */

const INJECT = {
  /* GA2：产物里一个 target=_blank 链接**整个去掉 rel 属性** */
  prodRemoveRel: (fx) => rewriteFirstBlankRel(fx.index, "remove"),
  /* GA2：rel 写成一个与保护无关的 token */
  prodRelExternal: (fx) => rewriteFirstBlankRel(fx.index, "set", "external"),
  /* GA2：token 写成子串（noopenerx 不算 noopener） */
  prodRelSubstring: (fx) => rewriteFirstBlankRel(fx.index, "set", "noopenerx noreferrer"),
  /* GA2：rel 只剩一个无关 token */
  prodRelMeOnly: (fx) => rewriteFirstBlankRel(fx.index, "set", "me"),
  /* GA1：模板里一个 target=_blank 链接去掉 rel */
  tmplRemoveRel: (fx) => rewriteFirstBlankRel(fx.tmplIndex, "remove"),
  /* GA1：模板里 rel 少一个 token */
  tmplRelMissingToken: (fx) => rewriteFirstBlankRel(fx.tmplIndex, "set", "noopener"),
  /* GA1：模板里 rel 是模板变量（静态判不出） */
  tmplRelDynamic: (fx) => rewriteFirstBlankRel(fx.tmplIndex, "set", "{{ site.extRel }}"),
  /* GA6：产物里出现 <base target> */
  prodBaseTarget: (fx) =>
    insertBeforeBody(fx.index, `<base href="https://example.com/" target="_blank">\n`),
  /* GA6：模板里出现 <base target> */
  tmplBaseTarget: (fx) =>
    fs.appendFileSync(fx.tmplIndex, `\n<base href="https://example.com/" target="_blank">\n`),
  /* GA3：产物里一处会开新上下文的链接都不剩（覆盖度自证） */
  prodNoBlankTargets: (fx) => {
    for (const f of fx.htmlFiles) {
      mutate(f, (t) => t.split('target="_blank"').join('target="_self"'));
    }
  },
  /* 必须判绿：rel 多带一个无关 token */
  prodExtraToken: (fx) =>
    insertBeforeBody(
      fx.index,
      `<a href="https://example.com/" target="_blank" rel="noopener noreferrer me">x</a>\n`
    ),
  /* 必须判绿：rel 的 token 大写 */
  prodUpperCase: (fx) =>
    insertBeforeBody(
      fx.index,
      `<a href="https://example.com/" target="_blank" rel="NOOPENER NOREFERRER">x</a>\n`
    ),
  /* 必须判绿：坏链接只出现在 HTML 注释里 */
  prodCommentDecoy: (fx) =>
    insertBeforeBody(
      fx.index,
      `<!-- <a href="https://example.com/" target="_blank" rel="opener">x</a> -->\n`
    ),
  /* 必须判绿：坏链接只出现在 Nunjucks 注释里 */
  tmplCommentDecoy: (fx) =>
    fs.appendFileSync(
      fx.tmplIndex,
      `\n{# <a href="https://example.com/" target="_blank" rel="opener">x</a> #}\n`
    ),
  /* 必须判绿：普通站内链接（没有 target、也没有 rel） */
  prodPlainLink: (fx) => insertBeforeBody(fx.index, `<a href="/about/">About</a>\n`),
  /* GA4：package.json 里把本门禁摘掉 */
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
    id: "GB0",
    expect: "green",
    desc: "基线：模板与产物里所有会开新上下文的链接都带 rel",
    apply: () => {},
  },
  {
    id: "GB1",
    expect: "red",
    subs: ["GA2：", "没有 rel 属性"],
    desc: "产物里一个 target=_blank 链接整个去掉 rel（GA2）",
    apply: (fx) => INJECT.prodRemoveRel(fx),
  },
  {
    id: "GB2",
    expect: "red",
    subs: ["GA2：", "缺少 noopener"],
    desc: "产物里 rel 写成与保护无关的 token（GA2）",
    apply: (fx) => INJECT.prodRelExternal(fx),
  },
  {
    id: "GB3",
    expect: "red",
    subs: ["GA2：", "缺少 noopener"],
    desc: "产物里 token 写成子串 noopenerx（GA2 必须精确匹配 token）",
    apply: (fx) => INJECT.prodRelSubstring(fx),
  },
  {
    id: "GB4",
    expect: "red",
    subs: ["GA2：", "缺少 noopener"],
    desc: "产物里 rel 只剩一个无关 token（GA2）",
    apply: (fx) => INJECT.prodRelMeOnly(fx),
  },
  {
    id: "GB5",
    expect: "red",
    subs: ["GA1：", "没有 rel 属性"],
    desc: "模板里一个 target=_blank 链接去掉 rel（GA1）",
    apply: (fx) => INJECT.tmplRemoveRel(fx),
  },
  {
    id: "GB6",
    expect: "red",
    subs: ["GA1：", "缺少 noreferrer"],
    desc: "模板里 rel 少一个 token（GA1）",
    apply: (fx) => INJECT.tmplRelMissingToken(fx),
  },
  {
    id: "GB7",
    expect: "red",
    subs: ["GA1：", "模板变量"],
    desc: "模板里 rel 是模板变量、静态判不出（GA1）",
    apply: (fx) => INJECT.tmplRelDynamic(fx),
  },
  {
    id: "GB8",
    expect: "red",
    subs: ["GA6：", "<base>"],
    desc: "产物里出现 <base target>（GA6）",
    apply: (fx) => INJECT.prodBaseTarget(fx),
  },
  {
    id: "GB9",
    expect: "red",
    subs: ["GA6：", "<base>"],
    desc: "模板里出现 <base target>（GA6）",
    apply: (fx) => INJECT.tmplBaseTarget(fx),
  },
  {
    id: "GB10",
    expect: "red",
    subs: ["GA3：", "一处「会开新上下文」的链接都没找到"],
    desc: "产物里一处会开新上下文的链接都不剩（GA3 覆盖度自证）",
    apply: (fx) => INJECT.prodNoBlankTargets(fx),
  },
  {
    id: "GB11",
    expect: "green",
    desc: "负对照：rel 多带一个无关 token（必须判绿）",
    apply: (fx) => INJECT.prodExtraToken(fx),
  },
  {
    id: "GB12",
    expect: "green",
    desc: "负对照：rel 的 token 大写（必须判绿）",
    apply: (fx) => INJECT.prodUpperCase(fx),
  },
  {
    id: "GB13",
    expect: "green",
    desc: "负对照：坏链接只出现在 HTML 注释里（必须判绿）",
    apply: (fx) => INJECT.prodCommentDecoy(fx),
  },
  {
    id: "GB14",
    expect: "green",
    desc: "负对照：坏链接只出现在 Nunjucks 注释里（必须判绿）",
    apply: (fx) => INJECT.tmplCommentDecoy(fx),
  },
  {
    id: "GB15",
    expect: "green",
    desc: "负对照：普通站内链接没有 rel（必须判绿）",
    apply: (fx) => INJECT.prodPlainLink(fx),
  },
  {
    id: "GB16",
    expect: "green",
    desc: "负对照：卸掉 GA1 判定 ⇒ GB5 的注入转绿",
    apply: (fx) => {
      patchGate(fx, "GA1");
      INJECT.tmplRemoveRel(fx);
    },
  },
  {
    id: "GB17",
    expect: "green",
    desc: "负对照：卸掉 GA2 判定 ⇒ GB1 的注入转绿",
    apply: (fx) => {
      patchGate(fx, "GA2");
      INJECT.prodRemoveRel(fx);
    },
  },
  {
    id: "GB18",
    expect: "green",
    desc: "负对照：卸掉 GA3 判定 ⇒ GB10 的注入转绿",
    apply: (fx) => {
      patchGate(fx, "GA3");
      INJECT.prodNoBlankTargets(fx);
    },
  },
  {
    id: "GB19",
    expect: "green",
    desc: "负对照：卸掉 GA4 判定 ⇒ 门禁被摘掉的注入转绿",
    apply: (fx) => {
      patchGate(fx, "GA4");
      INJECT.unwireGate(fx);
    },
  },
  {
    id: "GB20",
    expect: "green",
    desc: "负对照：卸掉 GA5 判定 ⇒ 判定被弄坏的注入转绿",
    apply: (fx) => {
      patchGate(fx, "GA5");
      breakRelTokens(fx);
    },
  },
  {
    id: "GB21",
    expect: "green",
    desc: "负对照：卸掉 GA6 判定 ⇒ GB8 的注入转绿",
    apply: (fx) => {
      patchGate(fx, "GA6");
      INJECT.prodBaseTarget(fx);
    },
  },
  {
    id: "GB22",
    expect: "red",
    subs: ["GA5：", "扫描器自证失败"],
    desc: "判定被弄坏（rel 的 token 永远解析成合规）（GA5 扫描器自证）",
    apply: (fx) => breakRelTokens(fx),
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
const beforeSrc = fingerprint(REAL_SRC);
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
  if (c.expect === "green") {
    if (!out.includes("新标签页链接 rel 门禁通过")) {
      failed++;
      lines.push(`✗ ${c.id}（${c.desc}）：判绿，但没打出通过语\n${out.trim()}`);
      fs.rmSync(fx.root, { recursive: true, force: true });
      continue;
    }
    lines.push(`✓ ${c.id}  ${c.desc} → 判绿（负对照通过）`);
  } else {
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
  }
  fs.rmSync(fx.root, { recursive: true, force: true });
}

/* ---------- 自证：真目录与门禁原件一个字节都没变 ---------- */
const afterSite = fingerprint(REAL_SITE);
const afterSrc = fingerprint(REAL_SRC);
const afterGate = crypto.createHash("sha256").update(fs.readFileSync(GATE)).digest("hex");
if (beforeSite !== afterSite) {
  failed++;
  lines.push("✗ 自测动了仓库里的 _site/ —— 夹具站必须与真目录彻底分开。");
}
if (beforeSrc !== afterSrc) {
  failed++;
  lines.push("✗ 自测动了仓库里的 src/ —— 夹具站必须与真目录彻底分开。");
}
if (beforeGate !== afterGate) {
  failed++;
  lines.push("✗ 自测动了仓库里的门禁原件 —— 负对照必须打在副本上。");
}

if (failed) {
  console.error("新标签页链接 rel 门禁自测未通过：\n");
  lines.forEach((l) => console.error(`  ${l}`));
  console.error(`\n  ${failed} 档未通过。\n`);
  process.exit(1);
}

console.log(`新标签页链接 rel 门禁自测通过：${CASES.length} 档（GB0–GB22）注入矩阵全部符合预期。`);
lines.forEach((l) => console.log(`  ${l}`));
