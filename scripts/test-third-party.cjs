#!/usr/bin/env node
/**
 * 自测 TD0–TD4n / TDW1–TDW2：给 scripts/check-third-party.cjs 的每条判据找一次「它会红」的证据
 *
 * 为什么要有这个自测（2026-10-21 的 D37）：
 *   这道门禁守的是「零第三方前端运行时依赖」这条硬约束
 *   （docs/ROADMAP.md 第 63–64 行）。而「门禁是绿的」有两种可能：
 *   ① 它真的没问题；② 它的判据从来没被真正执行过。
 *   这两件事长得一模一样。所以每条判据都要有一档**注入**证明它会红，
 *   再有一档**负对照**证明「卸掉那一步之后确实就绿了」——否则红可能来自别处。
 *
 * 做法（全在临时目录的副本上，仓库里的原件一个字节都不动）：
 *   · 把 _site 复制成 <tmp>/_site；
 *   · 把门禁复制成 <tmp>/scripts/check-third-party.cjs —— 门禁的 ROOT 是
 *     「它自己所在目录的上一级」，所以副本里的它**天然**指向副本里的 _site，
 *     不需要任何环境变量（与 D36 的沙箱同一套做法）。
 *
 * 档位：
 *   TD0   基线绿
 *   TD1a  注入外域 <script src> ⇒ TD1 判红（**这一档就是原缺陷形态**：
 *         「有人加了一行 CDN 脚本，build 照过、没有任何人报告」）
 *   TD1b  注入外域 <img src> ⇒ TD1 判红
 *   TD1c  注入**协议相对**外域 <script src="//cdn..."> ⇒ TD1 判红
 *   TD2a  注入外域 <link rel=stylesheet> ⇒ TD2 判红
 *   TD2b  注入外域 <link rel=preconnect> ⇒ TD2 判红
 *   TD2c  注入外域 <link rel=icon> ⇒ TD2 判红
 *   TD3a  往外链 CSS 注入外域 @import ⇒ TD3 判红
 *   TD3b  往内联 <style> 注入外域 url() ⇒ TD3 判红
 *   TD4a  往产物 JS 注入硬编码外域 fetch ⇒ TD4 判红
 *   TD4b  往产物 JS 注入外域 import 说明符 ⇒ TD4 判红
 *   TD4c  往内联 <script> 注入外域 WebSocket ⇒ TD4 判红
 *   TD4d  往产物 JS 注入 XMLHttpRequest.open 的外域目标 ⇒ TD4 判红
 *   TD5a  抽掉全部本地 <script src> ⇒ TD5 判红（覆盖度自证）
 *   TD5b  删掉全部外链 CSS 文件 ⇒ TD5 判红（覆盖度自证）
 *   TD1n  （负对照）卸掉门禁副本的 TD1 判定 ⇒ TD1a / TD1b 的注入必须转绿
 *   TD2n  （负对照）卸掉门禁副本的 TD2 判定 ⇒ TD2a 的注入必须转绿
 *   TD3n  （负对照）卸掉门禁副本的 TD3 判定 ⇒ TD3a 的注入必须转绿
 *   TD4n  （负对照）卸掉门禁副本的 TD4 判定 ⇒ TD4a 的注入必须转绿
 *   TDW1  白名单是「（域，上下文）」粒度：把 fonts.googleapis.com 的登记上下文
 *         收窄成只剩 stylesheet ⇒ 真产物里那条 preload / preconnect 立刻判红
 *         （证明白名单不是按域一刀切）
 *   TDW2  白名单条目用不上时**只提示不判红**：塞一条永不使用的假条目 ⇒ 门禁仍绿
 *
 * 收尾：按 SHA-256 校验仓库里的门禁原件没被动过。
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const GATE = path.join(ROOT, "scripts", "check-third-party.cjs");
const SITE = path.join(ROOT, "_site");

function sha256(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

/* 原件指纹：**自测开始时**记下来，收尾时比对 ——
   证明这一整轮注入全在副本上，仓库里的原件一个字节都没动。 */
const GATE_SHA_AT_START = sha256(GATE);

/**
 * 造一个临时副本区：<tmp>/_site、<tmp>/scripts/<门禁>。
 */
function makeSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mh-third-party-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.cpSync(SITE, path.join(dir, "_site"), { recursive: true });
  fs.copyFileSync(GATE, path.join(dir, "scripts", "check-third-party.cjs"));
  return dir;
}

/** 副本里的门禁路径。 */
function gateOf(dir) {
  return path.join(dir, "scripts", "check-third-party.cjs");
}

/** 副本里的首页产物路径。 */
function indexOf(dir) {
  return path.join(dir, "_site", "index.html");
}

/** 副本里的产物 JS 路径。 */
function jsOf(dir) {
  return path.join(dir, "_site", "assets", "js", "main.js");
}

/** 副本里的产物 CSS 路径。 */
function cssOf(dir) {
  return path.join(dir, "_site", "assets", "css", "pages.css");
}

/** 跑副本里的门禁，返回 { code, out }。 */
function runGate(dir) {
  try {
    const out = execFileSync(
      process.execPath,
      [gateOf(dir)],
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

/** 往 HTML 的 <head> 末尾（</head> 之前）插一段。 */
function injectIntoHead(html, snippet) {
  if (!html.includes("</head>")) throw new Error("注入点不存在：产物里没有 </head>");
  return html.replace("</head>", `${snippet}\n</head>`);
}

/** 往 HTML 的 <body> 末尾（</body> 之前）插一段。 */
function injectIntoBody(html, snippet) {
  if (!html.includes("</body>")) throw new Error("注入点不存在：产物里没有 </body>");
  return html.replace("</body>", `${snippet}\n</body>`);
}

/** 往第一个 <style> 块的内容末尾追加一段。 */
function appendIntoFirstStyle(html, snippet) {
  const re = /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/i;
  const m = re.exec(html);
  if (!m) throw new Error("注入点不存在：产物里没有 <style>");
  const at = m.index + m[0].length - m[3].length;
  return html.slice(0, at) + snippet + html.slice(at);
}

const results = [];
function record(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${id}${detail ? " —— " + detail : ""}`);
}

/* ---------------- TD0：基线 ---------------- */
{
  const dir = makeSandbox();
  const r = runGate(dir);
  record(
    "TD0 基线（副本上）",
    r.code === 0,
    r.code === 0 ? "门禁绿" : `门禁不该红，却 exit ${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- TD1a：外域 <script src> ⇒ 判红（原缺陷形态） ---------------- */
{
  const dir = makeSandbox();
  const f = indexOf(dir);
  const html = fs.readFileSync(f, "utf8");
  fs.writeFileSync(
    f,
    injectIntoHead(html, '<script src="https://cdn.example.com/analytics.js"></script>')
  );
  const r = runGate(dir);
  const hit = r.code === 1 && /TD1/.test(r.out);
  record(
    "TD1a 注入外域 <script src> ⇒ TD1 判红（原缺陷形态）",
    hit,
    hit ? "红了，红因点名 TD1" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- TD1b：外域 <img src> ⇒ 判红 ---------------- */
{
  const dir = makeSandbox();
  const f = indexOf(dir);
  const html = fs.readFileSync(f, "utf8");
  fs.writeFileSync(
    f,
    injectIntoBody(html, '<img src="https://cdn.example.com/pic.png" alt="x" />')
  );
  const r = runGate(dir);
  const hit = r.code === 1 && /TD1/.test(r.out);
  record(
    "TD1b 注入外域 <img src> ⇒ TD1 判红",
    hit,
    hit ? "红了，红因点名 TD1" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- TD1c：协议相对 URL ⇒ 判红 ---------------- */
{
  const dir = makeSandbox();
  const f = indexOf(dir);
  const html = fs.readFileSync(f, "utf8");
  fs.writeFileSync(
    f,
    injectIntoHead(html, '<script src="//cdn.example.com/analytics.js"></script>')
  );
  const r = runGate(dir);
  const hit = r.code === 1 && /TD1/.test(r.out);
  record(
    "TD1c 注入协议相对外域 <script src=\"//cdn...\"> ⇒ TD1 判红",
    hit,
    hit ? "红了，红因点名 TD1" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- TD2a：外域 stylesheet ⇒ 判红 ---------------- */
{
  const dir = makeSandbox();
  const f = indexOf(dir);
  const html = fs.readFileSync(f, "utf8");
  fs.writeFileSync(
    f,
    injectIntoHead(html, '<link rel="stylesheet" href="https://cdn.example.com/a.css" />')
  );
  const r = runGate(dir);
  const hit = r.code === 1 && /TD2/.test(r.out);
  record(
    "TD2a 注入外域 <link rel=stylesheet> ⇒ TD2 判红",
    hit,
    hit ? "红了，红因点名 TD2" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- TD2b：外域 preconnect ⇒ 判红 ---------------- */
{
  const dir = makeSandbox();
  const f = indexOf(dir);
  const html = fs.readFileSync(f, "utf8");
  fs.writeFileSync(
    f,
    injectIntoHead(html, '<link rel="preconnect" href="https://analytics.example.com" />')
  );
  const r = runGate(dir);
  const hit = r.code === 1 && /TD2/.test(r.out);
  record(
    "TD2b 注入外域 <link rel=preconnect> ⇒ TD2 判红",
    hit,
    hit ? "红了，红因点名 TD2" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- TD2c：外域 icon ⇒ 判红 ---------------- */
{
  const dir = makeSandbox();
  const f = indexOf(dir);
  const html = fs.readFileSync(f, "utf8");
  fs.writeFileSync(
    f,
    injectIntoHead(html, '<link rel="icon" href="https://cdn.example.com/favicon.ico" />')
  );
  const r = runGate(dir);
  const hit = r.code === 1 && /TD2/.test(r.out);
  record(
    "TD2c 注入外域 <link rel=icon> ⇒ TD2 判红",
    hit,
    hit ? "红了，红因点名 TD2" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- TD3a：外链 CSS 里的外域 @import ⇒ 判红 ---------------- */
{
  const dir = makeSandbox();
  const f = cssOf(dir);
  fs.writeFileSync(f, '@import url("https://cdn.example.com/a.css");\n' + fs.readFileSync(f, "utf8"));
  const r = runGate(dir);
  const hit = r.code === 1 && /TD3/.test(r.out);
  record(
    "TD3a 外链 CSS 注入外域 @import ⇒ TD3 判红",
    hit,
    hit ? "红了，红因点名 TD3" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- TD3b：内联 <style> 里的外域 url() ⇒ 判红 ---------------- */
{
  const dir = makeSandbox();
  const f = indexOf(dir);
  const html = fs.readFileSync(f, "utf8");
  fs.writeFileSync(
    f,
    appendIntoFirstStyle(html, '\n.x{background:url("https://cdn.example.com/p.png")}\n')
  );
  const r = runGate(dir);
  const hit = r.code === 1 && /TD3/.test(r.out);
  record(
    "TD3b 内联 <style> 注入外域 url() ⇒ TD3 判红",
    hit,
    hit ? "红了，红因点名 TD3" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- TD4a：产物 JS 里的硬编码外域 fetch ⇒ 判红 ---------------- */
{
  const dir = makeSandbox();
  const f = jsOf(dir);
  fs.writeFileSync(
    f,
    fs.readFileSync(f, "utf8") + '\nfetch("https://api.example.com/data.json");\n'
  );
  const r = runGate(dir);
  const hit = r.code === 1 && /TD4/.test(r.out);
  record(
    "TD4a 产物 JS 注入硬编码外域 fetch ⇒ TD4 判红",
    hit,
    hit ? "红了，红因点名 TD4" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- TD4b：产物 JS 里的外域 import 说明符 ⇒ 判红 ---------------- */
{
  const dir = makeSandbox();
  const f = jsOf(dir);
  fs.writeFileSync(
    f,
    fs.readFileSync(f, "utf8") + '\nimport "https://cdn.example.com/lib.js";\n'
  );
  const r = runGate(dir);
  const hit = r.code === 1 && /TD4/.test(r.out);
  record(
    "TD4b 产物 JS 注入外域 import 说明符 ⇒ TD4 判红",
    hit,
    hit ? "红了，红因点名 TD4" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- TD4c：内联 <script> 里的外域 WebSocket ⇒ 判红 ---------------- */
{
  const dir = makeSandbox();
  const f = indexOf(dir);
  const html = fs.readFileSync(f, "utf8");
  fs.writeFileSync(
    f,
    injectIntoBody(html, '<script>new WebSocket("https://ws.example.com/socket");</script>')
  );
  const r = runGate(dir);
  const hit = r.code === 1 && /TD4/.test(r.out);
  record(
    "TD4c 内联 <script> 注入外域 WebSocket ⇒ TD4 判红",
    hit,
    hit ? "红了，红因点名 TD4" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- TD4d：XMLHttpRequest.open 的外域目标 ⇒ 判红 ---------------- */
{
  const dir = makeSandbox();
  const f = jsOf(dir);
  fs.writeFileSync(
    f,
    fs.readFileSync(f, "utf8") +
      '\nvar xhr = new XMLHttpRequest(); xhr.open("GET", "https://api.example.com/data");\n'
  );
  const r = runGate(dir);
  const hit = r.code === 1 && /TD4/.test(r.out);
  record(
    "TD4d 产物 JS 注入 XMLHttpRequest.open 的外域目标 ⇒ TD4 判红",
    hit,
    hit ? "红了，红因点名 TD4" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- TD5a：抽掉全部本地 <script src> ⇒ 判红（覆盖度自证） ---------------- */
{
  const dir = makeSandbox();
  const siteDir = path.join(dir, "_site");
  const pages = [];
  (function scan(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith("._")) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) scan(p);
      else if (e.name.endsWith(".html")) pages.push(p);
    }
  })(siteDir);
  for (const p of pages) {
    const html = fs.readFileSync(p, "utf8");
    fs.writeFileSync(p, html.replace(/\s+src\s*=\s*"[^"]*main\.js"/g, ""));
  }
  const r = runGate(dir);
  const hit = r.code === 1 && /TD5/.test(r.out);
  record(
    "TD5a 抽掉全部本地 <script src> ⇒ TD5 判红（覆盖度自证）",
    hit,
    hit ? "红了，红因点名 TD5" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- TD5b：删掉全部外链 CSS 文件 ⇒ 判红（覆盖度自证） ---------------- */
{
  const dir = makeSandbox();
  fs.rmSync(path.join(dir, "_site", "assets", "css"), { recursive: true, force: true });
  const r = runGate(dir);
  const hit = r.code === 1 && /TD5/.test(r.out);
  record(
    "TD5b 删掉全部外链 CSS 文件 ⇒ TD5 判红（覆盖度自证）",
    hit,
    hit ? "红了，红因点名 TD5" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- TD1n（负对照）：卸掉 TD1 判定 ⇒ TD1a / TD1b 转绿 ---------------- */
{
  const dir = makeSandbox();
  patch(gateOf(dir), "const TD1_ON = true;", "const TD1_ON = false;");
  const f = indexOf(dir);
  const html = fs.readFileSync(f, "utf8");
  fs.writeFileSync(
    f,
    injectIntoHead(html, '<script src="https://cdn.example.com/analytics.js"></script>')
  );
  const r = runGate(dir);
  const hit = r.code === 0;
  record(
    "TD1n 负对照：卸掉 TD1 判定后，TD1a 的注入转绿",
    hit,
    hit
      ? "转绿了 ⇒ 证明 TD1a 那档的红确实来自 TD1 判定本身"
      : `仍然红（code=${r.code}）⇒ 说明红因不止一处，负对照不成立\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- TD2n（负对照）：卸掉 TD2 判定 ⇒ TD2a 转绿 ---------------- */
{
  const dir = makeSandbox();
  patch(gateOf(dir), "const TD2_ON = true;", "const TD2_ON = false;");
  const f = indexOf(dir);
  const html = fs.readFileSync(f, "utf8");
  fs.writeFileSync(
    f,
    injectIntoHead(html, '<link rel="stylesheet" href="https://cdn.example.com/a.css" />')
  );
  const r = runGate(dir);
  const hit = r.code === 0;
  record(
    "TD2n 负对照：卸掉 TD2 判定后，TD2a 的注入转绿",
    hit,
    hit
      ? "转绿了 ⇒ 证明 TD2a 那档的红确实来自 TD2 判定本身"
      : `仍然红（code=${r.code}）⇒ 说明红因不止一处，负对照不成立\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- TD3n（负对照）：卸掉 TD3 判定 ⇒ TD3a 转绿 ---------------- */
{
  const dir = makeSandbox();
  patch(gateOf(dir), "const TD3_ON = true;", "const TD3_ON = false;");
  const f = cssOf(dir);
  fs.writeFileSync(f, '@import url("https://cdn.example.com/a.css");\n' + fs.readFileSync(f, "utf8"));
  const r = runGate(dir);
  const hit = r.code === 0;
  record(
    "TD3n 负对照：卸掉 TD3 判定后，TD3a 的注入转绿",
    hit,
    hit
      ? "转绿了 ⇒ 证明 TD3a 那档的红确实来自 TD3 判定本身"
      : `仍然红（code=${r.code}）⇒ 说明红因不止一处，负对照不成立\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- TD4n（负对照）：卸掉 TD4 判定 ⇒ TD4a 转绿 ---------------- */
{
  const dir = makeSandbox();
  patch(gateOf(dir), "const TD4_ON = true;", "const TD4_ON = false;");
  const f = jsOf(dir);
  fs.writeFileSync(
    f,
    fs.readFileSync(f, "utf8") + '\nfetch("https://api.example.com/data.json");\n'
  );
  const r = runGate(dir);
  const hit = r.code === 0;
  record(
    "TD4n 负对照：卸掉 TD4 判定后，TD4a 的注入转绿",
    hit,
    hit
      ? "转绿了 ⇒ 证明 TD4a 那档的红确实来自 TD4 判定本身"
      : `仍然红（code=${r.code}）⇒ 说明红因不止一处，负对照不成立\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- TDW1：白名单是（域，上下文）粒度 ---------------- */
{
  const dir = makeSandbox();
  patch(
    gateOf(dir),
    'contexts: ["link:stylesheet", "link:preload", "link:preconnect"],',
    'contexts: ["link:stylesheet"],'
  );
  const r = runGate(dir);
  const hit = r.code === 1 && /TD2/.test(r.out);
  record(
    "TDW1 白名单收窄上下文后，真产物里那条 preload/preconnect 立刻判红",
    hit,
    hit
      ? "红了 ⇒ 白名单是按（域，上下文）粒度登记的，不是按域一刀切"
      : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- TDW2：白名单条目用不上只提示、不判红 ---------------- */
{
  const dir = makeSandbox();
  patch(
    gateOf(dir),
    'const ALLOWLIST = {\n  "fonts.googleapis.com": {',
    'const ALLOWLIST = {\n  "example.invalid": {\n    contexts: ["link:stylesheet"],\n    reason: "自测用的假条目（永不使用）",\n  },\n  "fonts.googleapis.com": {'
  );
  const r = runGate(dir);
  const hit = r.code === 0 && /example\.invalid/.test(r.out);
  record(
    "TDW2 白名单里塞一条永不使用的假条目 ⇒ 门禁仍绿（只提示不判红）",
    hit,
    hit
      ? "仍绿且提示了该条目没被用到 ⇒ 门禁不会惩罚「把外部依赖撤掉」这种改进"
      : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- 收尾：仓库原件没被动过 ---------------- */

const problems = [];
if (sha256(GATE) !== GATE_SHA_AT_START) {
  problems.push("仓库里的门禁原件在自测期间被改动了 —— 自测必须只在副本上注入。");
}

if (problems.length) {
  console.error("\n第三方依赖门禁自测未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

const bad = results.filter((r) => !r.ok);
console.log(
  `\n注入矩阵：${results.length} 档里 ${results.length - bad.length} 档按预期触发` +
    `${bad.length ? `，${bad.length} 档未通过` : ""}` +
    `（TD1n / TD2n / TD3n / TD4n 是负对照）。`
);
if (bad.length) bad.forEach((b) => console.log(`  · 未通过：${b.id}`));
console.log("  · 原件校验：门禁的 SHA-256 与自测开始时一致。");
process.exit(bad.length ? 1 : 0);
