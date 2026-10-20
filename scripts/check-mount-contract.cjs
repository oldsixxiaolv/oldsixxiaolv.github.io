#!/usr/bin/env node
/**
 * 挂载无关契约门禁 —— 守住「文档承诺与代码行为一致」这条线。
 *
 * 为什么要有这道门禁（一次具体的实测，不是假想）：
 *   本项目有一条**挂载无关契约**：除 404 页外，产物里的站内引用一律相对路径，
 *   于是 `_site/` 整个文件夹扔到任何挂载点都能跑（commit dcbd1db 立的那条）。
 *   2026-10-20 的 D17 把 404 页改成了根绝对路径（GitHub Pages 的 404 语义决定
 *   相对 URL 在那里没有正确解：请求路径深度不可知）——
 *   **契约没变，是加进来一个例外**。
 *   但从那一刻起，**写给人看的活文档**（README、部署文档、给 agent 读的计划书）
 *   还在**无条件**承诺"整个文件夹扔到哪都能跑" ⇒ 文档与行为对不上。
 *   这类漂移的特点是：**不会让站点变坏，只会让后来的人（包括 agent）按错的前提做决定**。
 *   所以它需要一道门禁，而且这道门禁还得能证明自己**不是空跑**。
 *
 * 判据：
 *   MC1 承诺带限定 —— 凡是出现"挂载无关承诺"（扔到哪都能跑 / 挂载点无关 / 挂载无关）
 *      的那一行，必须在**同一行**里带上限定词（404 页 / 除外 / 例外 / 普通页面 / 其余页面）。
 *      判到"行"而不是"段落"：本仓 markdown 多是单行长段落，限定词跨行等于没限定。
 *   MC2 README 把例外讲清楚 —— README.md 里必须有一行同时含：挂载无关承诺、
 *      「404」、「根绝对」、「GitHub Pages」。README 是新读者唯一会先看的文档，
 *      它不能只说"相对路径与挂载点无关"就收尾，必须说清**为什么**要开这个例外。
 *   MC3 源码级证据 —— eleventy.config.js 的 relUrl 过滤器里确有 404 特判（ctx.is404）。
 *      文档说例外、代码得真的兑现，否则 MC1/MC2 只是在给一句空话盖章。
 *   MC4 覆盖度自证 —— 扫到的 md 文件数 ≥ MIN_MD_FILES，且至少检出 1 处挂载无关承诺。
 *      防"改空了就通过"：把文档里的承诺全删光，MC1 自然没话可说，但那是没在检查。
 *
 * ⚠️ 为什么排除 docs/IMPROVEMENT-LOG.md（**必须排除**，否则这道门禁一建就红）：
 *   那是**历史记录** —— 每一场次当时的口径都按当时的真相写在里面，
 *   包括 D17 之前那些"全站零个根绝对路径"的旧结论。
 *   改写历史记录就是伪造历史，所以只能按**文件名**排除它，而不是去改它里面的句子。
 *   代价：这份文件里的旧承诺不再受 MC1 约束 —— 这是刻意的取舍，
 *   因为它是**过去时**的记录，不是**现在时**的契约。
 *   （真正承载"现在时"契约的活文档 —— README.md、docs/DEPLOY.md、docs/ROADMAP.md、
 *     docs/DEFECT-BACKLOG.md、docs/ui-ux-pro-max-improvement-plan.md —— 都在扫描范围内。）
 *
 * ⚠️ 为什么只扫 markdown、不扫源码注释：
 *   eleventy.config.js 里 relUrl 过滤器上方的注释块本身就把 404 例外讲清楚了
 *   （"404 页是**唯一的例外**"），源码由 MC3 负责判，不在这里重复判。
 *
 * 环境变量（供 scripts/test-mount-contract.cjs 的注入矩阵用）：
 *   MCC_DOC_DIRS —— 覆盖扫描目录（用 path.delimiter 分隔）。
 *                  注入必须在副本上做，不动仓库里的文件。
 *   MCC_CONFIG  —— 覆盖 eleventy.config.js 的路径。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
/* 扫描目录。默认是仓库根 + docs/（都不递归：_archive/、src/content/ 不是契约文档面）。 */
const DOC_DIRS = (
  process.env.MCC_DOC_DIRS || [ROOT, path.join(ROOT, "docs")].join(path.delimiter)
)
  .split(path.delimiter)
  .filter(Boolean)
  .map((p) => path.resolve(p));
const CONFIG = process.env.MCC_CONFIG
  ? path.resolve(process.env.MCC_CONFIG)
  : path.join(ROOT, "eleventy.config.js");

/** MC4 的覆盖度下限：至少要扫到这么多个 md 文件，这道门禁才算真在检查。 */
const MIN_MD_FILES = 10;
/** MC4 的覆盖度下限：至少要检出这么多处挂载无关承诺。 */
const MIN_PROMISES = 1;

/** 挂载无关承诺的特征词。命中即认为"这一行在承诺挂载无关"。 */
const PROMISE_MARKERS = ["扔到哪都能跑", "任何挂载点都能跑", "挂载点无关", "挂载无关"];
/** 限定词：承诺若要成立，必须在同一行里说明"哪些情况除外"。 */
const QUALIFIERS = [/404\s*页/, /除外/, /例外/, /普通页面/, /其余页面/];
/** 按文件名排除的文件（历史记录，不改写）。 */
const EXCLUDED_BASENAMES = new Set(["IMPROVEMENT-LOG.md"]);

const problems = [];
const fail = (m) => problems.push(m);

/* ---------------- 工具 ---------------- */

const hasPromise = (line) => PROMISE_MARKERS.some((m) => line.includes(m));
const hasQualifier = (line) => QUALIFIERS.some((re) => re.test(line));

/** 列出目录下的 markdown 文件（不递归；排除 AppleDouble `._*` 与历史记录文件）。 */
function listMd(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => e.name)
    .filter((name) => !name.startsWith("._") && !EXCLUDED_BASENAMES.has(name))
    .sort()
    .map((name) => ({ name, path: path.join(dir, name), dir }));
}

/** 取出 relUrl 过滤器的函数体（从 addFilter("relUrl" 到下一个同级 addFilter / return {）。 */
function relUrlBlock(src) {
  const i = src.indexOf('addFilter("relUrl"');
  if (i < 0) return null;
  const rest = src.slice(i);
  const m = rest.match(/\n {2}(?:eleventyConfig\.addFilter|return\s*\{)/);
  return m ? rest.slice(0, m.index) : rest;
}

/* ---------------- 扫描 ---------------- */

const files = [];
for (const dir of DOC_DIRS) files.push(...listMd(dir));
/** 同名文件只留一份（目录有重叠时不重复判）。 */
const seen = new Set();
const scanned = files.filter((f) => {
  if (seen.has(f.path)) return false;
  seen.add(f.path);
  return true;
});

/** 扫到的所有挂载无关承诺（用于 MC4 的覆盖度自证）。 */
const promises = [];
for (const f of scanned) {
  const lines = fs.readFileSync(f.path, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (hasPromise(line)) {
      promises.push({ file: f, lineNo: i + 1, line, qualified: hasQualifier(line) });
    }
  });
}

/* ---------------- MC1：承诺必须带限定 ---------------- */

for (const p of promises) {
  if (p.qualified) continue;
  const rel = path.relative(ROOT, p.file.path);
  /* 扫描范围在仓库外时（自测的副本），相对路径会变成一串 ".."，不如直接给绝对路径。 */
  const where = `${rel.startsWith("..") ? p.file.path : rel}:${p.lineNo}`;
  fail(
    `MC1 ${where} 有一行挂载无关承诺，却没在同一行里说明例外 —— ` +
      `自 D17 起 404 页走根绝对路径（GitHub Pages 把 /404.html 送到任意未匹配路径，` +
      `相对 URL 在那里没有正确解），"整个文件夹扔到哪都能跑"**只对普通页面成立**。` +
      `请在同一行里补上限定（如"404 页除外"、"普通页面不受影响"）。\n` +
      `      该行：${p.line.trim().slice(0, 160)}`
  );
}

/* ---------------- MC2：README 必须把例外讲清楚 ---------------- */

const readme = scanned.find((f) => f.name === "README.md");
if (!readme) {
  fail(
    `MC2 扫描范围里没有 README.md —— 这道门禁要盯的就是 README 里那条承诺，` +
      `读不到它就等于没盯。`
  );
} else {
  const lines = fs.readFileSync(readme.path, "utf8").split("\n");
  const hit = lines.some(
    (line) =>
      hasPromise(line) &&
      line.includes("404") &&
      line.includes("根绝对") &&
      line.includes("GitHub Pages")
  );
  if (!hit) {
    fail(
      `MC2 README.md 里没有一行同时含「挂载无关承诺 + 404 + 根绝对 + GitHub Pages」—— ` +
        `README 是新读者唯一会先看的文档，那条承诺必须**在原地**把例外讲清楚：` +
        `例外是 404 页、它的站内 URL 改走根绝对、原因是 GitHub Pages 的 404 语义。` +
        `（命令表里那句解释不算数 —— 它不在承诺那一行上。）`
    );
  }
}

/* ---------------- MC3：源码里确有 404 特判 ---------------- */

if (!fs.existsSync(CONFIG)) {
  fail(`MC3 找不到 ${path.relative(ROOT, CONFIG) || CONFIG} —— 读不到源码就没法验证例外是否兑现。`);
} else {
  const src = fs.readFileSync(CONFIG, "utf8");
  const block = relUrlBlock(src);
  if (!block) {
    fail(
      `MC3 ${path.relative(ROOT, CONFIG) || CONFIG} 里找不到 addFilter("relUrl") —— ` +
        `relUrl 是本项目自定义的过滤器（不是 Eleventy 自带），找不到它就没法验证 404 特判。`
    );
  } else if (!/ctx\s*\.\s*is404\b/.test(block)) {
    fail(
      `MC3 relUrl 过滤器里没有 ctx.is404 的 404 特判 —— ` +
        `文档承诺的例外必须由代码兑现：404 页的站内 URL 要走根绝对（"/" + clean），` +
        `其余页面仍走相对路径。`
    );
  }
}

/* ---------------- MC4：覆盖度自证（防空跑） ---------------- */

if (scanned.length < MIN_MD_FILES) {
  fail(
    `MC4 只扫到 ${scanned.length} 个 markdown 文件（要求至少 ${MIN_MD_FILES} 个）—— ` +
      `扫描范围被收窄了，这道门禁已经看不到大部分活文档，等于没在检查。`
  );
}
if (promises.length < MIN_PROMISES) {
  fail(
    `MC4 一处挂载无关承诺都没检出（要求至少 ${MIN_PROMISES} 处）—— ` +
      `要么承诺的措辞变了（门禁要跟着更新），要么文档里的承诺被删光了；` +
      `删光不是"修好了"，是"不再检查了"。`
  );
}

/* ---------------- 汇总 ---------------- */
if (problems.length) {
  console.error("挂载无关契约门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  console.error(
    `  判据出处：docs/DEFECT-BACKLOG.md D18（D17 改了 404 页的路径形态，活文档的承诺没跟上）。`
  );
  console.error("");
  process.exit(1);
}

console.log(
  `挂载无关契约门禁通过：${scanned.length} 个 markdown 文件里 ${promises.length} 处挂载无关承诺` +
    `全部带限定，README 的例外说明完整，relUrl 过滤器的 ctx.is404 特判在位。`
);
console.log(`  · 契约本身没变：除 404 页外仍是相对路径，"整个文件夹扔到哪都能跑"对普通页面成立。`);
