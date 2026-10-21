#!/usr/bin/env node
/**
 * 自测 CW0–CW8 + CQ*：给 scripts/check-css-comment-weight.cjs 的每条判据找一次「它会红」的证据
 *
 * 为什么要有这个自测（2026-10-21 的 D37）：
 *   这道门禁守的是「产物里的 CSS 不带注释字节」这条硬约束。
 *   而「门禁是绿的」有两种可能：① 它真的没问题；② 它的判据从来没被真正执行过。
 *   这两件事长得一模一样。所以每条判据都要有一档**注入**证明它会红，
 *   再有一档**负对照**证明「卸掉那一步之后确实就绿了 / 转红了」——
 *   否则红可能来自别处。
 *
 * 做法（全在临时目录的副本上，仓库里的原件一个字节都不动）：
 *   · 把 _site 复制成 <tmp>/_site；
 *   · 把 src/assets/css 复制成 <tmp>/src/assets/css（CQ1–CQ3 要拿产物与源比对）；
 *   · 把门禁复制成 <tmp>/scripts/check-css-comment-weight.cjs —— 门禁的 ROOT 是
 *     「它自己所在目录的上一级」，所以副本里的它**天然**指向副本里的 _site，
 *     不需要任何环境变量。
 *
 * 档位：
 *   CW0  基线绿
 *   CW1a 往内联 <style> 里塞一段 CSS 注释 ⇒ CW1 判红
 *   CW1b 往内联 <style> 里塞一个 **content 字符串字面量**，字面量里写着
 *        「斜杠 + 星号 … 星号 + 斜杠」这段注释文本 ⇒ 门禁**判绿**
 *        （字符串字面量不是注释 —— 判错了就是把合法 CSS 判成缺陷）
 *   CW2  往外链 CSS 文件里塞一段 CSS 注释 ⇒ CW2 判红
 *   CW3a 把一个内联 <style> 块清空 ⇒ CW3 判红
 *   CW3b 把一个外链 CSS 文件清空 ⇒ CW3 判红
 *        （CW1/CW2 拦不住这两种：没有注释了，但也没样式了）
 *   CW4a 删掉某个页面的全部内联 <style> 块 ⇒ CW4 判红
 *   CW4b 删掉全部外链 CSS 文件 ⇒ CW4 判红（覆盖度自证）
 *   CW5  （负对照）卸掉门禁副本的 CW1 判定 ⇒ CW1a 的注入必须转绿
 *   CW6  （负对照）卸掉门禁副本的「字符串字面量保护」⇒
 *        · 未注入时门禁仍绿（证明真产物里没有「字符串里含注释文本」这种写法）；
 *        · CW1b 的注入必须转红（证明字符串保护确实在挡）
 *   CW7  产物里的每个内联 <style> 块，必须与「源码里对应的那份剥掉注释后」
 *        **逐字相等** —— 证明产物里没有来历不明的字节
 *   CW8  剥除器（scripts/lib/css-comments.cjs）的单元档：tricky fixture
 *
 * CQ* 档（D38 新增，判内容一致性）：
 *   CQ1a 往产物 pages.css 末尾塞一段源里没有的规则 ⇒ CQ1 判红
 *   CQ1b 改坏产物 base.css 里的**中间**某条声明 ⇒ CQ1 判红
 *        （CQ1a/CW1a 是两种不同的形状：追加 vs 就地改）
 *   CQ2a 把产物 components.css 里 _misc 这个 partial 的内容整段删掉 ⇒ CQ2 判红
 *   CQ2b 往产物 components.css 末尾塞一段源里没有的规则 ⇒ CQ2 判红
 *   CQ3a 在沙箱的**源**里多放一个 CSS 文件（产物没有）⇒ CQ3 判红
 *   CQ3b 删掉产物里的一个 CSS 文件（源里还在）⇒ CQ3 判红
 *   CQ3c 在沙箱的源里多放一个 partial（index.css 没声明它）⇒ CQ3 判红
 *   CQ1n （负对照）卸掉 CQ1 判定 ⇒ CQ1a 的注入必须转绿
 *   CQ2n （负对照）卸掉 CQ2 判定 ⇒ CQ2a 的注入必须转绿
 *   CQ3n （负对照）卸掉 CQ3 判定 ⇒ CQ3a 的注入必须转绿
 *
 * 收尾：按 SHA-256 校验仓库里的门禁原件与剥除器原件都没被动过。
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const GATE = path.join(ROOT, "scripts", "check-css-comment-weight.cjs");
const LIB = path.join(ROOT, "scripts", "lib", "css-comments.cjs");
const SITE = path.join(ROOT, "_site");

function sha256(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

/* 原件指纹：**自测开始时**记下来，收尾时比对 ——
   证明这一整轮注入全在副本上，仓库里的原件一个字节都没动。 */
const GATE_SHA_AT_START = sha256(GATE);
const LIB_SHA_AT_START = sha256(LIB);

/**
 * 造一个临时副本区：<tmp>/_site、<tmp>/src/assets/css、<tmp>/scripts/<门禁>。
 */
function makeSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mh-css-comment-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.cpSync(SITE, path.join(dir, "_site"), { recursive: true });
  // CQ1–CQ3 要把产物和**源**逐字比对 ⇒ 源 CSS 也必须进沙箱，
  // 否则副本里的门禁会因为「找不到源」而红，探针就说明不了任何事。
  fs.mkdirSync(path.join(dir, "src", "assets"), { recursive: true });
  fs.cpSync(
    path.join(ROOT, "src", "assets", "css"),
    path.join(dir, "src", "assets", "css"),
    { recursive: true }
  );
  fs.copyFileSync(GATE, path.join(dir, "scripts", "check-css-comment-weight.cjs"));
  return dir;
}

/** 副本里的产物 CSS 路径（相对 assets/css）。 */
function prodCssOf(dir, rel) {
  return path.join(dir, "_site", "assets", "css", rel);
}

/** 副本里的源 CSS 路径（相对 src/assets/css）。 */
function srcCssOf(dir, rel) {
  return path.join(dir, "src", "assets", "css", rel);
}

/** 跑副本里的门禁，返回 { code, out }。 */
function runGate(dir) {
  try {
    const out = execFileSync(
      process.execPath,
      [path.join(dir, "scripts", "check-css-comment-weight.cjs")],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    return { code: 0, out };
  } catch (e) {
    return {
      code: typeof e.status === "number" ? e.status : 1,
      out: `${e.stdout || ""}${e.stderr || ""}`,
    };
  }
}

/** 改副本里的一个文件；注入点找不到就当场抛错（不静默跳过）。 */
function patch(file, from, to) {
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes(from)) {
    throw new Error(
      `注入点不存在，已中止（不静默跳过）：\n  文件：${file}\n  锚点：${from}`
    );
  }
  fs.writeFileSync(file, text.replace(from, to));
}

/** 往第一个 <style> 块的开头插一段内容。 */
function injectIntoFirstStyle(html, snippet) {
  const re = /(<style\b[^>]*>)/i;
  const m = re.exec(html);
  if (!m) throw new Error("注入点不存在：产物里没有 <style>");
  const at = m.index + m[0].length;
  return html.slice(0, at) + snippet + html.slice(at);
}

/** 把第一个 <style> 块的内容清空（留一个空块）。 */
function clearFirstStyle(html) {
  const re = /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/i;
  const m = re.exec(html);
  if (!m) throw new Error("注入点不存在：产物里没有 <style>");
  return html.slice(0, m.index) + m[1] + m[3] + html.slice(m.index + m[0].length);
}

/** 副本里的首页产物路径。 */
function indexOf(dir) {
  return path.join(dir, "_site", "index.html");
}

/** 副本里 about 页的产物路径。 */
function aboutOf(dir) {
  return path.join(dir, "_site", "about", "index.html");
}

const results = [];
function record(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${id}${detail ? " —— " + detail : ""}`);
}

/* ---------------- CW0：基线 ---------------- */
{
  const dir = makeSandbox();
  const r = runGate(dir);
  record(
    "CW0 基线（副本上）",
    r.code === 0,
    r.code === 0 ? "门禁绿" : `门禁不该红，却 exit ${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- CW1a：内联 <style> 塞注释 ⇒ 判红 ---------------- */
{
  const dir = makeSandbox();
  const f = indexOf(dir);
  fs.writeFileSync(f, injectIntoFirstStyle(fs.readFileSync(f, "utf8"), "/* injected note */\n"));
  const r = runGate(dir);
  const hit = r.code === 1 && /CW1/.test(r.out);
  record(
    "CW1a 内联 <style> 塞 CSS 注释 ⇒ 判红",
    hit,
    hit ? "红了，红因点名 CW1" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- CW1b：字符串字面量里写着注释文本 ⇒ 判绿 ---------------- */
{
  const dir = makeSandbox();
  const f = indexOf(dir);
  const snippet = '.zh::after{content:"/* literal text */"}\n';
  fs.writeFileSync(f, injectIntoFirstStyle(fs.readFileSync(f, "utf8"), snippet));
  const r = runGate(dir);
  const hit = r.code === 0;
  record(
    "CW1b 内联 <style> 的 content 字符串里写着注释文本 ⇒ 判绿",
    hit,
    hit
      ? "绿了 ⇒ 字符串字面量没被当成注释（那是合法 CSS，判红就是假红）"
      : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- CW2：外链 CSS 塞注释 ⇒ 判红 ---------------- */
{
  const dir = makeSandbox();
  const f = path.join(dir, "_site", "assets", "css", "base.css");
  fs.writeFileSync(f, "/* injected note */\n" + fs.readFileSync(f, "utf8"));
  const r = runGate(dir);
  const hit = r.code === 1 && /CW2/.test(r.out);
  record(
    "CW2 外链 CSS 文件塞 CSS 注释 ⇒ 判红",
    hit,
    hit ? "红了，红因点名 CW2" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- CW3a：内联块清空 ⇒ 判红 ---------------- */
{
  const dir = makeSandbox();
  const f = indexOf(dir);
  fs.writeFileSync(f, clearFirstStyle(fs.readFileSync(f, "utf8")));
  const r = runGate(dir);
  const hit = r.code === 1 && /CW3/.test(r.out);
  record(
    "CW3a 内联 <style> 块清空 ⇒ 判红",
    hit,
    hit ? "红了，红因点名 CW3" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- CW3b：外链 CSS 清空 ⇒ 判红 ---------------- */
{
  const dir = makeSandbox();
  const f = path.join(dir, "_site", "assets", "css", "base.css");
  fs.writeFileSync(f, "");
  const r = runGate(dir);
  const hit = r.code === 1 && /CW3/.test(r.out);
  record(
    "CW3b 外链 CSS 文件清空 ⇒ 判红",
    hit,
    hit ? "红了，红因点名 CW3" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- CW4a：某页没有内联块 ⇒ 判红 ---------------- */
{
  const dir = makeSandbox();
  const f = aboutOf(dir);
  fs.writeFileSync(
    f,
    fs.readFileSync(f, "utf8").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
  );
  const r = runGate(dir);
  const hit = r.code === 1 && /CW4/.test(r.out);
  record(
    "CW4a 某个页面的内联 <style> 块被删光 ⇒ 判红（覆盖度自证）",
    hit,
    hit ? "红了，红因点名 CW4" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- CW4b：外链 CSS 全删 ⇒ 判红 ---------------- */
{
  const dir = makeSandbox();
  const cssDir = path.join(dir, "_site", "assets", "css");
  const removed = [];
  (function scan(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith("._")) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) scan(p);
      else if (e.name.endsWith(".css")) {
        removed.push(p);
        fs.rmSync(p);
      }
    }
  })(cssDir);
  const r = runGate(dir);
  const hit = r.code === 1 && /CW4/.test(r.out);
  record(
    "CW4b 外链 CSS 文件全被删掉 ⇒ 判红（覆盖度自证）",
    hit,
    hit
      ? `红了，红因点名 CW4（删掉了 ${removed.length} 个文件）`
      : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- CW5（负对照）：卸掉 CW1 判定 ⇒ CW1a 注入转绿 ---------------- */
{
  const dir = makeSandbox();
  const gate = path.join(dir, "scripts", "check-css-comment-weight.cjs");
  patch(gate, "if (inlineCommentCount > 0) {", "if (false) {");
  const f = indexOf(dir);
  fs.writeFileSync(f, injectIntoFirstStyle(fs.readFileSync(f, "utf8"), "/* injected note */\n"));
  const r = runGate(dir);
  const hit = r.code === 0;
  record(
    "CW5 负对照：卸掉 CW1 判定后，CW1a 的注入转绿",
    hit,
    hit
      ? "转绿了 ⇒ 证明 CW1a 那档的红确实来自 CW1 判定本身"
      : `仍然红（code=${r.code}）⇒ 说明红因不止一处，负对照不成立\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- CW6（负对照）：卸掉字符串字面量保护 ---------------- */
{
  const dir = makeSandbox();
  const gate = path.join(dir, "scripts", "check-css-comment-weight.cjs");
  patch(gate, "...CSS_STRING_SOURCES,", "...(false ? CSS_STRING_SOURCES : []),");

  // 前半：真产物在「不保护字符串」的门禁下仍须是绿的 ——
  // 否则红会来自真产物本身，这一档就说明不了问题。
  const clean = runGate(dir);
  const cleanOk = clean.code === 0;

  // 后半：注入「字符串里写着注释文本」后必须转红。
  const f = indexOf(dir);
  const snippet = '.zh::after{content:"/* literal text */"}\n';
  fs.writeFileSync(f, injectIntoFirstStyle(fs.readFileSync(f, "utf8"), snippet));
  const r = runGate(dir);
  const hit = cleanOk && r.code === 1 && /CW1/.test(r.out);
  record(
    "CW6 负对照：卸掉字符串字面量保护后，CW1b 的注入转红",
    hit,
    hit
      ? cleanOk
        ? "转红了（且未注入时真产物仍绿）⇒ 证明字符串保护确实在挡这一处"
        : "转红了，但真产物在未注入时就已红 ⇒ 负对照不成立"
      : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- CW7：产物内联块 == 源剥注释后（逐字） ---------------- */
{
  const { stripCssComments } = require(LIB);

  // 1) 源：模板里 {% inlineCss "..." %} 引用的 CSS 文件
  //    + 模板里手写的 <style> 块
  const srcFiles = [];
  (function scan(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith("._")) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) scan(p);
      else if (e.name.endsWith(".njk")) srcFiles.push(p);
    }
  })(path.join(ROOT, "src"));

  const expected = [];
  for (const f of srcFiles) {
    const text = fs.readFileSync(f, "utf8");
    const re = /\{%\s*inlineCss\s+"([^"]+)"\s*%\}/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      expected.push(stripCssComments(fs.readFileSync(path.join(ROOT, m[1]), "utf8")));
    }
    // 手写的 <style>：先去掉 Nunjucks 注释（它们不是产物的一部分）
    const noNj = text.replace(/\{#[\s\S]*?#\}/g, "");
    const re2 = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
    while ((m = re2.exec(noNj)) !== null) {
      if (/\{[{%#]/.test(m[1])) continue; // 块里有模板语法 ⇒ 不做逐字比对
      expected.push(stripCssComments(m[1]));
    }
  }

  // 2) 产物：所有页面里的内联 <style> 块
  const actual = [];
  (function scan(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith("._")) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) scan(p);
      else if (e.name.endsWith(".html")) {
        const text = fs.readFileSync(p, "utf8");
        const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
        let m;
        while ((m = re.exec(text)) !== null) actual.push(m[1]);
      }
    }
  })(SITE);

  const missing = expected.filter((e) => !actual.includes(e));
  const orphan = actual.filter((a) => !expected.includes(a));
  const hit = expected.length > 0 && actual.length > 0 && missing.length === 0 && orphan.length === 0;
  record(
    "CW7 产物内联块逐字等于源剥注释后",
    hit,
    hit
      ? `相等：${expected.length} 份源 → 产物里 ${actual.length} 个内联块，无来历不明的字节`
      : `源 ${expected.length} 份 / 产物 ${actual.length} 个；` +
        `对不上 ${missing.length} 份、多出来 ${orphan.length} 块`
  );
}

/* ---------------- CW8：剥除器的单元档 ---------------- */
{
  const { stripCssComments } = require(LIB);
  const cases = [
    {
      id: "字符串字面量里的注释文本原样保留",
      css: 'a{content:"/* x */"}',
      want: 'a{content:"/* x */"}',
    },
    {
      id: "字符串字面量里的结束记号原样保留",
      css: 'a{content:"*/"}',
      want: 'a{content:"*/"}',
    },
    { id: "块注释剥掉", css: "/* c */a{b:c}", want: "a{b:c}" },
    {
      id: "多行注释剥掉但换行保留",
      css: "a{/* multi\nline */b:c}",
      want: "a{\nb:c}",
    },
    {
      id: "字符串里的转义引号不误伤后面的注释",
      css: 'a{content:"q\\"z"}/*k*/',
      want: 'a{content:"q\\"z"}',
    },
    { id: "单引号字符串原样保留", css: "a{content:'x'}", want: "a{content:'x'}" },
    { id: "没有注释时原样返回", css: "a{b:c}", want: "a{b:c}" },
    { id: "相邻的两段注释都剥掉", css: "/*a*//*b*/c{d:e}", want: "c{d:e}" },
    {
      id: "未闭合的注释吞掉其后全部",
      css: "a{b:c}/* open",
      want: "a{b:c}",
    },
  ];
  let bad = 0;
  for (const c of cases) {
    const got = stripCssComments(c.css);
    if (got !== c.want) {
      bad++;
      console.log(`    · CW8 不符：${c.id}\n      输入：${JSON.stringify(c.css)}\n      期望：${JSON.stringify(c.want)}\n      实得：${JSON.stringify(got)}`);
    }
  }
  record(
    `CW8 剥除器单元档（${cases.length} 个 fixture）`,
    bad === 0,
    bad === 0 ? "全部符合预期" : `${bad} 个 fixture 不符`
  );
}

/* ---------------- CQ1a：产物 pages.css 末尾塞外来规则 ⇒ 判红 ---------------- */
{
  const dir = makeSandbox();
  const f = prodCssOf(dir, "pages.css");
  fs.writeFileSync(f, fs.readFileSync(f, "utf8") + "\n.injected-from-nowhere{color:red}\n");
  const r = runGate(dir);
  const hit = r.code === 1 && /CQ1/.test(r.out);
  record(
    "CQ1a 产物 pages.css 末尾塞源里没有的规则 ⇒ 判红",
    hit,
    hit ? "红了，红因点名 CQ1" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- CQ1b：就地改坏产物 base.css 的中间某条声明 ⇒ 判红 ---------------- */
{
  const dir = makeSandbox();
  const f = prodCssOf(dir, "base.css");
  const txt = fs.readFileSync(f, "utf8");
  const at = txt.indexOf("{");
  if (at < 0) throw new Error("注入点不存在：base.css 里没有规则块");
  fs.writeFileSync(f, txt.slice(0, at + 1) + "outline:0;" + txt.slice(at + 1));
  const r = runGate(dir);
  const hit = r.code === 1 && /CQ1/.test(r.out);
  record(
    "CQ1b 就地改坏产物 base.css 里的一条声明 ⇒ 判红",
    hit,
    hit ? "红了，红因点名 CQ1（就地改与追加两种形状都拦得住）" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- CQ2a：产物 components.css 里少一个 partial ⇒ 判红 ---------------- */
{
  const { stripCssComments } = require(LIB);
  const dir = makeSandbox();
  const piece = stripCssComments(
    fs.readFileSync(srcCssOf(dir, "components/_misc.css"), "utf8").trim()
  );
  const f = prodCssOf(dir, "components.css");
  const txt = fs.readFileSync(f, "utf8");
  if (!txt.includes(piece)) {
    throw new Error("注入点不存在：产物 components.css 里找不到 _misc 的内容");
  }
  fs.writeFileSync(f, txt.replace(piece, ""));
  const r = runGate(dir);
  const hit = r.code === 1 && /CQ2/.test(r.out);
  record(
    "CQ2a 产物 components.css 里 _misc 这段 partial 被删掉 ⇒ 判红",
    hit,
    hit ? "红了，红因点名 CQ2" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- CQ2b：产物 components.css 里塞外来规则 ⇒ 判红 ---------------- */
{
  const dir = makeSandbox();
  const f = prodCssOf(dir, "components.css");
  fs.writeFileSync(f, fs.readFileSync(f, "utf8") + "\n.injected-from-nowhere{color:red}\n");
  const r = runGate(dir);
  const hit = r.code === 1 && /CQ2/.test(r.out);
  record(
    "CQ2b 产物 components.css 末尾塞源里没有的规则 ⇒ 判红",
    hit,
    hit ? "红了，红因点名 CQ2（partial 都在，但多出来的规则块被抓住）" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- CQ3a：源里多一个 CSS 文件（产物没有）⇒ 判红 ---------------- */
{
  const dir = makeSandbox();
  fs.writeFileSync(srcCssOf(dir, "extra.css"), ".extra{color:red}\n");
  const r = runGate(dir);
  const hit = r.code === 1 && /CQ3/.test(r.out);
  record(
    "CQ3a 源里多一个 CSS 文件、产物里没有 ⇒ 判红",
    hit,
    hit ? "红了，红因点名 CQ3" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- CQ3b：产物里少一个 CSS 文件（源里还在）⇒ 判红 ---------------- */
{
  const dir = makeSandbox();
  fs.rmSync(prodCssOf(dir, "print.css"));
  const r = runGate(dir);
  const hit = r.code === 1 && /CQ3/.test(r.out);
  record(
    "CQ3b 产物里的一个 CSS 文件被删掉、源里还在 ⇒ 判红",
    hit,
    hit ? "红了，红因点名 CQ3" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- CQ3c：源里多一个 partial（index.css 没声明）⇒ 判红 ---------------- */
{
  const dir = makeSandbox();
  fs.writeFileSync(srcCssOf(dir, "components/_new.css"), ".new{color:red}\n");
  const r = runGate(dir);
  const hit = r.code === 1 && /CQ3/.test(r.out);
  record(
    "CQ3c 源里多一个 partial、index.css 没声明 ⇒ 判红",
    hit,
    hit ? "红了，红因点名 CQ3（partial 名单与声明不一致会被抓住）" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- CQ1n（负对照）：卸掉 CQ1 判定 ⇒ CQ1a 转绿 ---------------- */
{
  const dir = makeSandbox();
  const gate = path.join(dir, "scripts", "check-css-comment-weight.cjs");
  patch(gate, "const CQ1_ON = true;", "const CQ1_ON = false;");
  const f = prodCssOf(dir, "pages.css");
  fs.writeFileSync(f, fs.readFileSync(f, "utf8") + "\n.injected-from-nowhere{color:red}\n");
  const r = runGate(dir);
  const hit = r.code === 0;
  record(
    "CQ1n 负对照：卸掉 CQ1 判定后，CQ1a 的注入转绿",
    hit,
    hit
      ? "转绿了 ⇒ 证明 CQ1a 那档的红确实来自 CQ1 判定本身"
      : `仍然红（code=${r.code}）⇒ 说明红因不止一处，负对照不成立\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- CQ2n（负对照）：卸掉 CQ2 判定 ⇒ CQ2a 转绿 ---------------- */
{
  const { stripCssComments } = require(LIB);
  const dir = makeSandbox();
  const gate = path.join(dir, "scripts", "check-css-comment-weight.cjs");
  patch(gate, "const CQ2_ON = true;", "const CQ2_ON = false;");
  const piece = stripCssComments(
    fs.readFileSync(srcCssOf(dir, "components/_misc.css"), "utf8").trim()
  );
  const f = prodCssOf(dir, "components.css");
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace(piece, ""));
  const r = runGate(dir);
  const hit = r.code === 0;
  record(
    "CQ2n 负对照：卸掉 CQ2 判定后，CQ2a 的注入转绿",
    hit,
    hit
      ? "转绿了 ⇒ 证明 CQ2a 那档的红确实来自 CQ2 判定本身"
      : `仍然红（code=${r.code}）⇒ 说明红因不止一处，负对照不成立\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- CQ3n（负对照）：卸掉 CQ3 判定 ⇒ CQ3a 转绿 ---------------- */
{
  const dir = makeSandbox();
  const gate = path.join(dir, "scripts", "check-css-comment-weight.cjs");
  patch(gate, "const CQ3_ON = true;", "const CQ3_ON = false;");
  fs.writeFileSync(srcCssOf(dir, "extra.css"), ".extra{color:red}\n");
  const r = runGate(dir);
  const hit = r.code === 0;
  record(
    "CQ3n 负对照：卸掉 CQ3 判定后，CQ3a 的注入转绿",
    hit,
    hit
      ? "转绿了 ⇒ 证明 CQ3a 那档的红确实来自 CQ3 判定本身"
      : `仍然红（code=${r.code}）⇒ 说明红因不止一处，负对照不成立\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- 收尾：仓库原件没被动过 ---------------- */

const problems = [];
if (sha256(GATE) !== GATE_SHA_AT_START) {
  problems.push("仓库里的门禁原件在自测期间被改动了 —— 自测必须只在副本上注入。");
}
if (sha256(LIB) !== LIB_SHA_AT_START) {
  problems.push("仓库里的剥除器原件在自测期间被改动了 —— 自测必须只在副本上注入。");
}

if (problems.length) {
  console.error("\n产物 CSS 注释门禁自测未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

const bad = results.filter((r) => !r.ok);
console.log(
  `\n注入矩阵：${results.length} 档里 ${results.length - bad.length} 档按预期触发` +
    `${bad.length ? `，${bad.length} 档未通过` : ""}` +
    `（CW5 / CW6 / CQ1n / CQ2n / CQ3n 是负对照）。`
);
if (bad.length) bad.forEach((b) => console.log(`  · 未通过：${b.id}`));
console.log("  · 原件校验：门禁与剥除器的 SHA-256 与自测开始时一致。");
process.exit(bad.length ? 1 : 0);
