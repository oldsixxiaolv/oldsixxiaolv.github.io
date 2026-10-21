#!/usr/bin/env node
/**
 * 自测 BL0–BL8：给 scripts/check-block-language.cjs 的每条判据找一次「它会红」的证据
 *
 * 为什么要有这个自测（2026-10-20 的 D36）：
 *   这道门禁守的是「站内文字一律英文」这条硬约束在**块级内容**（JSON-LD 结构化
 *   数据 / 内联脚本 / 内联样式）上的落实。而「门禁是绿的」有两种可能：
 *   ① 它真的没问题；② 它的判据从来没被真正执行过。这两件事长得一模一样。
 *   所以每条判据都要有一档**注入**证明它会红，再有一档**负对照**证明
 *   「卸掉那一步之后确实就绿了 / 转红了」—— 否则红可能来自别处。
 *
 * 做法（全在临时目录的副本上，仓库里的原件一个字节都不动）：
 *   · 把 _site 复制成 <tmp>/_site；
 *   · 把门禁复制成 <tmp>/scripts/check-block-language.cjs —— 门禁的 ROOT 是
 *     「它自己所在目录的上一级」，所以副本里的它**天然**指向副本里的 _site，
 *     不需要任何环境变量。
 *
 * 档位：
 *   BL0  基线绿
 *   BL1  把一个 JSON-LD 块弄坏（非法 JSON）⇒ BL1 判红
 *   BL2  把 JSON-LD 的一个值改成中文 ⇒ BL2 判红
 *   BL3a 把门禁副本的豁免字段名改掉 ⇒ BL2 判红
 *        （证明那条豁免**真的在挡**；红因必须点名 alternateName）
 *   BL3b 把豁免字段的值改成英文 ⇒ 门禁**判绿**且出一条「豁免一次都没用上」的提示
 *        （证明「把中文改成英文」这种好事不会把 build 打红）
 *   BL4  往内联 <script> 里塞一行中文 ⇒ BL4 判红
 *   BL5a 往内联 <style> 的**注释**里塞中文 ⇒ 门禁**判绿**
 *        （CSS 注释不渲染 ⇒ 不算站内文字）
 *   BL5b 往内联 <style> 的**值**里塞中文（content: "首页"）⇒ BL5 判红
 *   BL6 （负对照）卸掉门禁副本的 CJK 判定 ⇒ BL2 的注入必须转绿
 *   BL7 （负对照）卸掉门禁副本「剥 CSS 注释」这一步 ⇒ BL5a 的注入必须转红
 *        （专门证明 BL5 的判据确实是「剥掉注释后仍含中文」，
 *          而不是「CSS 里有中文就算」—— 后者会把「中文只在注释里」也放过去。
 *          这一档要先把产物自带的中文 CSS 注释清成 ASCII，否则红因会来自别处。）
 *   BL8a 删掉产物里全部 JSON-LD 块 ⇒ BL6 判红（覆盖度自证）
 *   BL8b 删掉产物里全部内联 <style> 块 ⇒ BL6 判红（覆盖度自证）
 *
 * 收尾：按 SHA-256 校验仓库里的门禁原件没被动过。
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const GATE = path.join(ROOT, "scripts", "check-block-language.cjs");
const SITE = path.join(ROOT, "_site");

function sha256(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

/* 原件指纹：**自测开始时**记下来，收尾时比对 ——
   证明这一整轮注入全在副本上，仓库里的原件一个字节都没动。 */
const GATE_SHA_AT_START = sha256(GATE);

/**
 * 造一个临时副本区：<tmp>/_site、<tmp>/scripts/<门禁>。
 * 返回 { dir, run(), gatePath(), page(name) }。
 */
function makeSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mh-block-lang-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.cpSync(SITE, path.join(dir, "_site"), { recursive: true });
  fs.copyFileSync(GATE, path.join(dir, "scripts", "check-block-language.cjs"));
  return dir;
}

/** 跑副本里的门禁，返回 { code, out }。 */
function runGate(dir) {
  try {
    const out = execFileSync(
      process.execPath,
      [path.join(dir, "scripts", "check-block-language.cjs")],
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

/** 产物里第一个 JSON-LD 块的定位（属性串 / 主体 / 收尾三段）。 */
function firstLdJson(html) {
  const m = /(<script\b[^>]*application\/ld\+json[^>]*>)([\s\S]*?)(<\/script>)/i.exec(html);
  if (!m) throw new Error("注入点不存在：产物里没有 application/ld+json 块");
  return { start: m.index, open: m[1], body: m[2], close: m[3], end: m.index + m[0].length };
}

/** 把第一个 JSON-LD 块整个换掉（body 由调用方给）。 */
function replaceFirstLdJson(html, newBody) {
  const b = firstLdJson(html);
  return html.slice(0, b.start) + b.open + newBody + b.close + html.slice(b.end);
}

/** 把第一个 JSON-LD 块解析、改字段、再写回（保持合法 JSON）。 */
function mutateFirstLdJson(html, mutate) {
  const b = firstLdJson(html);
  const obj = JSON.parse(b.body);
  mutate(obj);
  return replaceFirstLdJson(html, JSON.stringify(obj, null, 2));
}

/** 往第一个 <style> 块的开头插一段内容。 */
function injectIntoFirstStyle(html, snippet) {
  const re = /(<style\b[^>]*>)/i;
  const m = re.exec(html);
  if (!m) throw new Error("注入点不存在：产物里没有 <style>");
  const at = m.index + m[0].length;
  return html.slice(0, at) + snippet + html.slice(at);
}

/** 往第一个内联 <script>（非 ld+json、无 src）的开头插一段内容。 */
function injectIntoFirstInlineScript(html, snippet) {
  const re = /(<script\b(?![^>]*\bsrc=)(?![^>]*ld\+json)[^>]*>)/i;
  const m = re.exec(html);
  if (!m) throw new Error("注入点不存在：产物里没有内联 <script>");
  const at = m.index + m[0].length;
  return html.slice(0, at) + snippet + html.slice(at);
}

/** 把产物里所有 CSS 注释里的中日韩字符换成 ASCII（BL7 负对照的前置动作）。 */
function neutralizeCjkInCssComments(html) {
  return html.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
    comment.replace(/[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uff00-\uffef]/g, "X")
  );
}

/** 中日韩字符（与门禁同款 Unicode 范围）。 */
const CJK = /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uff00-\uffef]/;

/** 副本里所有产物页面。 */
function walkHtml(dir) {
  const out = [];
  (function scan(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith("._")) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) scan(p);
      else if (e.name.endsWith(".html")) out.push(p);
    }
  })(dir);
  return out;
}

/** 把所有页面里所有 ld+json 块中**含中文的** alternateName 值改成英文。 */
function englishifyAlternateNames(dir) {
  for (const f of walkHtml(path.join(dir, "_site"))) {
    const html = fs.readFileSync(f, "utf8");
    const next = html.replace(
      /(<script\b[^>]*application\/ld\+json[^>]*>)([\s\S]*?)(<\/script>)/gi,
      (m, open, body, close) => {
        let obj;
        try {
          obj = JSON.parse(body);
        } catch (_) {
          return m;
        }
        let touched = false;
        (function scan(n) {
          if (Array.isArray(n)) {
            n.forEach(scan);
            return;
          }
          if (!n || typeof n !== "object") return;
          for (const [k, v] of Object.entries(n)) {
            if (k === "alternateName" && typeof v === "string" && CJK.test(v)) {
              n[k] = "Yihang Lyu";
              touched = true;
            } else scan(v);
          }
        })(obj);
        return touched ? open + JSON.stringify(obj, null, 2) + close : m;
      }
    );
    fs.writeFileSync(f, next);
  }
}

/** 从所有产物页面里删掉某类块（覆盖度自证那两档用）。 */
function stripBlocksFromAllPages(dir, re) {
  for (const f of walkHtml(path.join(dir, "_site"))) {
    fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace(re, ""));
  }
}

const results = [];
function record(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${id}${detail ? " —— " + detail : ""}`);
}

/** 副本里的首页产物路径。 */
function indexOf(dir) {
  return path.join(dir, "_site", "index.html");
}

/* ---------------- BL0：基线 ---------------- */
{
  const dir = makeSandbox();
  const r = runGate(dir);
  record(
    "BL0 基线（副本上）",
    r.code === 0,
    r.code === 0 ? "门禁绿" : `门禁不该红，却 exit ${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- BL1：JSON-LD 块坏了 ⇒ 判红 ---------------- */
{
  const dir = makeSandbox();
  const f = indexOf(dir);
  const html = fs.readFileSync(f, "utf8");
  fs.writeFileSync(f, replaceFirstLdJson(html, '{ "@type": "Person", '));
  const r = runGate(dir);
  const hit = r.code === 1 && /BL1/.test(r.out);
  record(
    "BL1 JSON-LD 块非法 JSON ⇒ 判红",
    hit,
    hit ? "红了，红因点名 BL1" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- BL2：JSON-LD 的值里塞中文 ⇒ 判红 ---------------- */
{
  const dir = makeSandbox();
  const f = indexOf(dir);
  const html = fs.readFileSync(f, "utf8");
  fs.writeFileSync(
    f,
    mutateFirstLdJson(html, (o) => {
      o.jobTitle = "博士研究生";
    })
  );
  const r = runGate(dir);
  const hit = r.code === 1 && /BL2/.test(r.out) && /jobTitle/.test(r.out);
  record(
    "BL2 JSON-LD 的 jobTitle 换成中文 ⇒ 判红",
    hit,
    hit ? "红了，红因点名 BL2 与 jobTitle" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- BL3a：卸掉豁免的字段名 ⇒ 判红 ---------------- */
{
  const dir = makeSandbox();
  const gate = path.join(dir, "scripts", "check-block-language.cjs");
  patch(gate, 'field: "alternateName",', 'field: "alternateNameX",');
  const r = runGate(dir);
  const hit = r.code === 1 && /BL2/.test(r.out) && /alternateName/.test(r.out);
  record(
    "BL3a 门禁副本的豁免字段名改掉 ⇒ BL2 判红（豁免真的在挡）",
    hit,
    hit
      ? "红了，红因点名 BL2 与 alternateName ⇒ 那条豁免确实在替我挡这一处"
      : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- BL3b：豁免字段改成英文 ⇒ 判绿（好事不判红） ---------------- */
{
  const dir = makeSandbox();
  // 全站口径：豁免是**全站**用的，只改一个页面的话，豁免仍被别的页面用着，
  // 也就出不了「一次都没用上」那条提示 —— 这一档要证明的正是
  // 「整条豁免彻底用不上时，门禁判绿而不是判红」。
  englishifyAlternateNames(dir);
  const r = runGate(dir);
  const hit = r.code === 0 && /一次都没用上/.test(r.out);
  record(
    "BL3b 全站的豁免字段改成英文 ⇒ 判绿且出提示",
    hit,
    hit
      ? "绿了，并提示这条豁免可以删 ⇒「把中文改成英文」不会把 build 打红"
      : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- BL4：内联 <script> 塞中文 ⇒ 判红 ---------------- */
{
  const dir = makeSandbox();
  const f = indexOf(dir);
  const html = fs.readFileSync(f, "utf8");
  fs.writeFileSync(f, injectIntoFirstInlineScript(html, 'document.title = "首页";\n'));
  const r = runGate(dir);
  const hit = r.code === 1 && /BL4/.test(r.out);
  record(
    "BL4 内联 <script> 里塞中文 ⇒ 判红",
    hit,
    hit ? "红了，红因点名 BL4" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- BL5a：内联 <style> 的注释里塞中文 ⇒ 判绿 ---------------- */
{
  const dir = makeSandbox();
  const f = indexOf(dir);
  const html = fs.readFileSync(f, "utf8");
  fs.writeFileSync(f, injectIntoFirstStyle(html, "/* 中文注释 */"));
  const r = runGate(dir);
  const hit = r.code === 0 && !/BL5/.test(r.out);
  record(
    "BL5a 内联 <style> 的注释里塞中文 ⇒ 判绿（注释不渲染）",
    hit,
    hit
      ? "绿了 ⇒ BL5 判的是「剥掉注释后仍含中文」，注释里的中文不算站内文字"
      : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- BL5b：内联 <style> 的值里塞中文 ⇒ 判红 ---------------- */
{
  const dir = makeSandbox();
  const f = indexOf(dir);
  const html = fs.readFileSync(f, "utf8");
  fs.writeFileSync(f, injectIntoFirstStyle(html, '.zh::after{content:"首页"}'));
  const r = runGate(dir);
  const hit = r.code === 1 && /BL5/.test(r.out);
  record(
    "BL5b 内联 <style> 的值里塞中文 ⇒ 判红",
    hit,
    hit ? "红了，红因点名 BL5" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- BL6（负对照）：卸掉 CJK 判定 ⇒ BL2 注入转绿 ---------------- */
{
  const dir = makeSandbox();
  const gate = path.join(dir, "scripts", "check-block-language.cjs");
  patch(
    gate,
    "const CJK = /[\\u3000-\\u303f\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uac00-\\ud7af\\uff00-\\uffef]/;",
    "const CJK = /(?!)a/;"
  );
  const f = indexOf(dir);
  const html = fs.readFileSync(f, "utf8");
  fs.writeFileSync(
    f,
    mutateFirstLdJson(html, (o) => {
      o.jobTitle = "博士研究生";
    })
  );
  const r = runGate(dir);
  const hit = r.code === 0;
  record(
    "BL6 负对照：卸掉 CJK 判定后，BL2 的注入转绿",
    hit,
    hit
      ? "转绿了 ⇒ 证明 BL2 那档的红确实来自 CJK 判定本身"
      : `仍然红（code=${r.code}）⇒ 说明红因不止一处，负对照不成立\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- BL7（负对照）：卸掉剥 CSS 注释 ⇒ BL5a 注入转红 ---------------- */
{
  const dir = makeSandbox();
  const f = indexOf(dir);
  // 前置：把产物自带的中文 CSS 注释先清成 ASCII，
  // 否则负对照的红会来自产物自带的注释，而不是这一档注入的那一处。
  const html = neutralizeCjkInCssComments(fs.readFileSync(f, "utf8"));
  fs.writeFileSync(f, injectIntoFirstStyle(html, "/* 中文注释 */"));
  const gate = path.join(dir, "scripts", "check-block-language.cjs");
  patch(gate, "return text.replace(/\\/\\*[\\s\\S]*?\\*\\//g, blank);", "return text;");
  const r = runGate(dir);
  const hit = r.code === 1 && /BL5/.test(r.out);
  record(
    "BL7 负对照：卸掉「剥 CSS 注释」后，BL5a 的注入转红",
    hit,
    hit
      ? "转红了 ⇒ 证明 BL5 的判据确实是「剥掉注释后仍含中文」，而不是「CSS 里有中文就算」"
      : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- BL8a：删掉全部 JSON-LD 块 ⇒ 覆盖度判红 ---------------- */
{
  const dir = makeSandbox();
  stripBlocksFromAllPages(
    dir,
    /<script\b[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi
  );
  const r = runGate(dir);
  const hit = r.code === 1 && /BL6/.test(r.out) && /JSON-LD/.test(r.out);
  record(
    "BL8a 产物里删掉全部 JSON-LD 块 ⇒ BL6 判红（覆盖度自证）",
    hit,
    hit ? "红了，红因点名 BL6 与 JSON-LD" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- BL8b：删掉全部内联 <style> 块 ⇒ 覆盖度判红 ---------------- */
{
  const dir = makeSandbox();
  stripBlocksFromAllPages(dir, /<style\b[^>]*>[\s\S]*?<\/style>/gi);
  const r = runGate(dir);
  const hit = r.code === 1 && /BL6/.test(r.out) && /<style>/.test(r.out);
  record(
    "BL8b 产物里删掉全部内联 <style> 块 ⇒ BL6 判红（覆盖度自证）",
    hit,
    hit ? "红了，红因点名 BL6 与内联 <style>" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- 收尾：仓库原件没被动过 ---------------- */

const gateSha = sha256(GATE);
const problems = [];
if (gateSha !== GATE_SHA_AT_START) {
  problems.push("仓库里的门禁原件在自测期间被改动了 —— 自测必须只在副本上注入。");
}

if (problems.length) {
  console.error("\n块级内容语言门禁自测未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

const bad = results.filter((r) => !r.ok);
console.log(
  `\n注入矩阵：${results.length} 档里 ${results.length - bad.length} 档按预期触发` +
    `${bad.length ? `，${bad.length} 档未通过` : ""}（BL6 / BL7 是负对照）。`
);
if (bad.length) bad.forEach((b) => console.log(`  · 未通过：${b.id}`));
console.log("  · 原件校验：门禁的 SHA-256 与自测开始时一致。");
process.exit(bad.length ? 1 : 0);
