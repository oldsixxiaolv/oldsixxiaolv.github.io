#!/usr/bin/env node
/**
 * 自测 TX0–TX6：给 scripts/check-site-language.cjs 的每条判据找一次「它会红」的证据
 *
 * 为什么要有这个自测（2026-10-20 的 D35）：
 *   这道门禁守的是「站内文字一律英文」这条硬约束在**对外出口**上的落实。
 *   而「门禁是绿的」有两种可能：① 它真的没问题；② 它的判据从来没被真正执行过。
 *   这两件事长得一模一样。所以每条判据都要有一档**注入**证明它会红，
 *   再有一档**负对照**证明「卸掉它之后确实就绿了」—— 否则红可能来自别处。
 *
 * 做法（全在临时目录的副本上，仓库里的原件一个字节都不动）：
 *   · 把 _site 复制成 <tmp>/_site；
 *   · 把门禁与语言门禁复制成 <tmp>/scripts/ 下的一对 —— 门禁的 ROOT 是
 *     「它自己所在目录的上一级」，所以副本里的它**天然**指向副本里的 _site
 *     与副本里的 check-lang.cjs，不需要任何环境变量；
 *   · 把语言门禁豁免清单涉及到的路径也复制过去（src/_data、og 目录、
 *     src/robots.njk），否则 TX3 会因为「路径下没有文件」而假红。
 *
 * 档位：
 *   TX0 基线绿
 *   TX1 往产物 robots.txt 里塞一行中文 ⇒ TX1 判红
 *   TX2 把产物 robots.txt 的 generated-at 行删掉 ⇒ TX2 判红
 *   TX3 把语言门禁的 robots.njk 加回豁免清单 ⇒ TX3 判红（它成了暗门）
 *   TX4 把产物 feed.xml 的 lastBuildDate 改掉 ⇒ TX2 判红（两个出口不同刻）
 *   TX5 负对照：把门禁副本的 CJK 判定卸掉 ⇒ TX1 注入必须转绿
 *   TX6 负对照：把门禁副本 TX3 里「剥掉注释后再判」这一步卸掉 ⇒ TX3 注入必须转绿
 *      （这一档专门证明 TX3 的判据确实是「剥注释后仍含中文」，
 *        而不是「文件里有中文就算」—— 后者会把「中文只在注释里」也放过去）
 *
 * 收尾：按 SHA-256 校验仓库里的门禁与语言门禁原件都没被动过。
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const GATE = path.join(ROOT, "scripts", "check-site-language.cjs");
const LANG_GATE = path.join(ROOT, "scripts", "check-lang.cjs");
const SITE = path.join(ROOT, "_site");

/** 要复制的源码路径（语言门禁的豁免清单会用到它们）。 */
const SRC_COPY = [
  path.join("src", "_data"),
  path.join("src", "assets", "img", "og"),
  path.join("src", "robots.njk"),
];

function sha256(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

/* 原件指纹：**自测开始时**记下来，收尾时比对 ——
   证明这一整轮注入全在副本上，仓库里的原件一个字节都没动。 */
const GATE_SHA_AT_START = sha256(GATE);
const LANG_SHA_AT_START = sha256(LANG_GATE);

/** 把一个目录/文件复制到 dest（dest 可以是目录或文件）。 */
function copyInto(src, dest) {
  fs.cpSync(src, dest, { recursive: true });
}

/**
 * 造一个临时副本区：<tmp>/_site、<tmp>/scripts/{门禁,check-lang.cjs}、<tmp>/src/...
 * 返回 { dir, run(), readGate(), readLangGate() }。
 */
function makeSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mh-site-lang-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  copyInto(SITE, path.join(dir, "_site"));
  copyInto(GATE, path.join(dir, "scripts", "check-site-language.cjs"));
  copyInto(LANG_GATE, path.join(dir, "scripts", "check-lang.cjs"));
  for (const rel of SRC_COPY) {
    const from = path.join(ROOT, rel);
    if (!fs.existsSync(from)) continue;
    const to = path.join(dir, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    copyInto(from, to);
  }
  return dir;
}

/** 跑副本里的门禁，返回 { code, out }。 */
function runGate(dir) {
  try {
    const out = execFileSync(
      process.execPath,
      [path.join(dir, "scripts", "check-site-language.cjs")],
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

const results = [];
function record(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${id}${detail ? " —— " + detail : ""}`);
}

/* ---------------- TX0：基线 ---------------- */
{
  const dir = makeSandbox();
  const r = runGate(dir);
  record(
    "TX0 基线（副本上）",
    r.code === 0,
    r.code === 0 ? "门禁绿" : `门禁不该红，却 exit ${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- TX1：产物里塞中文 ⇒ 判红 ---------------- */
{
  const dir = makeSandbox();
  const robots = path.join(dir, "_site", "robots.txt");
  fs.appendFileSync(robots, "\n# 站点注释：中文进来了\n");
  const r = runGate(dir);
  const hit = r.code === 1 && /TX1/.test(r.out) && /robots\.txt/.test(r.out);
  record(
    "TX1 产物 robots.txt 混入中文 ⇒ 判红",
    hit,
    hit ? "红了，红因点名 TX1 与 robots.txt" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- TX2：删掉结构化构建时刻标记 ⇒ 判红 ---------------- */
{
  const dir = makeSandbox();
  const robots = path.join(dir, "_site", "robots.txt");
  const before = fs.readFileSync(robots, "utf8");
  const after = before.replace(/^#\s*generated-at:.*$/m, "");
  if (before === after) throw new Error("注入点不存在：robots.txt 里没有 generated-at 行");
  fs.writeFileSync(robots, after);
  const r = runGate(dir);
  const hit = r.code === 1 && /TX2/.test(r.out);
  record(
    "TX2 产物 robots.txt 缺 generated-at ⇒ 判红",
    hit,
    hit ? "红了，红因点名 TX2" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- TX3：把 robots.njk 加回语言门禁的豁免 ⇒ 判红 ---------------- */
{
  const dir = makeSandbox();
  const lang = path.join(dir, "scripts", "check-lang.cjs");
  patch(
    lang,
    "const SOURCE_EXCLUDE_FILES = [];",
    'const SOURCE_EXCLUDE_FILES = [\n  path.join(SRC, "robots.njk"),\n];'
  );
  const r = runGate(dir);
  const hit = r.code === 1 && /TX3/.test(r.out) && /robots\.njk/.test(r.out);
  record(
    "TX3 语言门禁把 robots.njk 加回豁免 ⇒ 判红（豁免成了暗门）",
    hit,
    hit ? "红了，红因点名 TX3 与 robots.njk" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- TX4：feed 的 lastBuildDate 与 robots 不同刻 ⇒ 判红 ---------------- */
{
  const dir = makeSandbox();
  const feed = path.join(dir, "_site", "feed.xml");
  const before = fs.readFileSync(feed, "utf8");
  const after = before.replace(
    /<lastBuildDate>([^<]*)<\/lastBuildDate>/,
    "<lastBuildDate>Mon, 01 Jan 2001 00:00:00 GMT</lastBuildDate>"
  );
  if (before === after) throw new Error("注入点不存在：feed.xml 里没有 lastBuildDate");
  fs.writeFileSync(feed, after);
  const r = runGate(dir);
  const hit = r.code === 1 && /TX2/.test(r.out) && /lastBuildDate/.test(r.out);
  record(
    "TX4 feed.xml 的 lastBuildDate 与 robots 不同刻 ⇒ 判红",
    hit,
    hit ? "红了，红因点名 lastBuildDate 对表" : `code=${r.code}\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- TX5（负对照）：卸掉 CJK 判定 ⇒ TX1 注入转绿 ---------------- */
{
  const dir = makeSandbox();
  const gate = path.join(dir, "scripts", "check-site-language.cjs");
  patch(
    gate,
    "const CJK = /[\\u3000-\\u303f\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uac00-\\ud7af\\uff00-\\uffef]/;",
    "const CJK = /(?!)a/;"
  );
  const robots = path.join(dir, "_site", "robots.txt");
  fs.appendFileSync(robots, "\n# 站点注释：中文进来了\n");
  const r = runGate(dir);
  const hit = r.code === 0;
  record(
    "TX5 负对照：卸掉 CJK 判定后，TX1 的注入转绿",
    hit,
    hit
      ? "转绿了 ⇒ 证明 TX1 那档的红确实来自 CJK 判定本身"
      : `仍然红（code=${r.code}）⇒ 说明红因不止一处，负对照不成立\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- TX6（负对照）：卸掉「剥注释后再判」⇒ TX3 注入转绿 ---------------- */
{
  const dir = makeSandbox();
  const gate = path.join(dir, "scripts", "check-site-language.cjs");
  patch(
    gate,
    "if (CJK.test(stripComments(raw, ext))) rendersCjk = true;",
    "if (CJK.test(raw)) rendersCjk = true;"
  );
  const lang = path.join(dir, "scripts", "check-lang.cjs");
  patch(
    lang,
    "const SOURCE_EXCLUDE_FILES = [];",
    'const SOURCE_EXCLUDE_FILES = [\n  path.join(SRC, "robots.njk"),\n];'
  );
  const r = runGate(dir);
  const hit = r.code === 0;
  record(
    "TX6 负对照：卸掉「剥注释后再判」后，TX3 的注入转绿",
    hit,
    hit
      ? "转绿了 ⇒ 证明 TX3 的判据确实是「剥掉注释后仍含中文」，而不是「文件里有中文就算」"
      : `仍然红（code=${r.code}）⇒ 说明 TX3 的红因不止「剥注释」这一步\n${r.out}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- 收尾：仓库原件没被动过 ---------------- */

const gateSha = sha256(GATE);
const langSha = sha256(LANG_GATE);
const problems = [];
if (gateSha !== GATE_SHA_AT_START || langSha !== LANG_SHA_AT_START) {
  problems.push("仓库里的门禁原件在自测期间被改动了 —— 自测必须只在副本上注入。");
}

if (problems.length) {
  console.error("\n对外出口语言门禁自测未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

const bad = results.filter((r) => !r.ok);
console.log(
  `\n注入矩阵通过：${results.length} 档全部按预期触发（TX5 / TX6 是负对照）。`
);
console.log("  · 原件校验：门禁与语言门禁的 SHA-256 与自测开始时一致。");
process.exit(bad.length ? 1 : 0);
