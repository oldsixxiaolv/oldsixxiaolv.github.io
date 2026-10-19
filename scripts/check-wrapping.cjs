#!/usr/bin/env node
/**
 * 长串断行兜底门禁 —— 守住"一条长 DOI / 长 URL 不能把窄屏页面撑破"这件事。
 *
 * 为什么要有这个门禁：
 *   `overflow-wrap` 有两个值，差别不是"好不好看"，是"能不能挡住"：
 *     · break-word：只在放不下时断行，但**不参与 min-content 宽度计算**；
 *     · anywhere  ：同样只在放不下时断，但**会**把软断行机会算进 min-content。
 *   差这一点，在 flex/grid 里就是天壤之别——flex/grid 轨道的下限取自子项的
 *   min-content，break-word 的那条长串**照样**把轨道撑宽。
 *   本站几乎所有"并排排版"的区域都是 flex/grid（topbar / 页脚 / 论文头 /
 *   首页引言 / 论文卡片 …），所以兜底必须是 anywhere。
 *
 *   实测（390px 视口，逐个注入一条长 DOI 串，看整页 scrollWidth）：
 *     break-word → 全站 132 个元素**单点**就能把整页撑破；
 *     anywhere   → 降到 30 个（剩下的 3 类都是 white-space:nowrap 的短标签，
 *                  nav 链接 / 按钮 / 右对齐联系链接——那里本来就该 nowrap）。
 *
 * 为什么这个门禁不能省：
 *   `break-word` 写成 `anywhere` 之后，**页面完全看不出差别**——现有内容里
 *   没有一条长到会触发的串（实测未注入时六页 scrollWidth 都 = 390）。
 *   也就是说：这是一条"改对了没人看得见、改错了要很久才爆"的规则。
 *   门禁就是把这个"看不见"变成"每次 build 都查一遍"。
 *
 * 三条判据：
 *   W1 覆盖 —— 全局兜底规则必须覆盖全部"承载文字的元素类型"，且用 anywhere；
 *   W2 不退化 —— 站内**会进产物的**样式里都不许再出现 `overflow-wrap: break-word`；
 *   W3 门禁自己没被卸掉 —— 本脚本必须真的在 build 链上。
 *
 * W2 说的"站内"有多大？样式进产物有三条路，三条都要扫 ——
 * 少扫一条，汇总里那句"站内无 break-word"就是一句空话，而坏样式已经进了产物：
 *   ① src/assets/css/ 下的 .css 文件（多数走 <link>，部分走 inlineCss）；
 *   ② 模板里直接写的内联 <style> 块（本站 src/about.njk 就有一整块，295 行）；
 *   ③ 模板里的 style="..." 内联样式属性。
 *   另外 eleventy 的 {% inlineCss %} 短码能把**任意路径**的 CSS 以 <style>
 *   塞进产物，所以它引用的文件也必须落在 ① 的范围内，否则就是一个门禁永远
 *   看不见的盲区（这条也归在 W2 下：它直接决定"站内"这个范围划得对不对）。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CSS_DIR = path.join(ROOT, "src/assets/css");
const SRC_DIR = path.join(ROOT, "src");
const PKG = path.join(ROOT, "package.json");

/* 承载文字、且会出现在 flex/grid 容器里的元素类型。
   少一个类型 = 那一类元素完全不受兜底保护（页脚的裸 span 就是这么漏掉的）。 */
const REQUIRED_TAGS = [
  "p", "li", "dd", "dt", "td", "th",
  "figcaption", "blockquote", "pre", "code", "a", "span",
];

/* 允许的兜底值。break-word 不在其中——它挡不住 flex/grid 里的长串。 */
const OK_VALUES = ["anywhere", "break-all"];

const problems = [];
const note = (msg) => problems.push(msg);

/* ---------- 收集所有 CSS 文件（跳过 exFAT 的 ._* 资源叉） ---------- */
function cssFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith("._")) continue; // AppleDouble 资源叉
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...cssFiles(p));
    else if (e.name.endsWith(".css")) out.push(p);
  }
  return out;
}

/* ---------- 收集模板文件（.njk / .html） ---------- */
function templateFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith("._")) continue; // AppleDouble 资源叉
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...templateFiles(p));
    else if (/\.(njk|html)$/.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * 把一段 CSS 拆成 (选择器, 声明块) 对。
 * 只做本门禁需要的浅解析：够用即可，不追求完整 CSS 解析器。
 */
function rules(css) {
  const out = [];
  // 去掉注释，避免注释里的 "overflow-wrap: xxx" 被当成真规则
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(stripped)) !== null) {
    out.push({ selector: m[1].trim(), body: m[2] });
  }
  return out;
}

/** 复合选择器里的标签名：`.a p:hover` → "p"；`.a .b` → null；`p.foo` → "p" */
function tagOf(compound) {
  const m = compound.trim().match(/^([a-zA-Z][a-zA-Z0-9-]*)/);
  return m ? m[1].toLowerCase() : null;
}

/**
 * 一段 CSS 里所有 overflow-wrap 声明。
 * W1（全局覆盖）与 W2（禁 break-word）共用这一份判读 ——
 * 同一套判据只写一遍，两边不会各自漂移。
 */
function wrapDecls(css) {
  const out = [];
  for (const rule of rules(css)) {
    const decl = rule.body
      .split(";")
      .map((d) => d.trim())
      .find((d) => /^overflow-wrap\s*:/i.test(d));
    if (!decl) continue;
    out.push({
      selector: rule.selector.replace(/\s+/g, " "),
      value: decl.slice(decl.indexOf(":") + 1).trim().toLowerCase(),
    });
  }
  return out;
}

/* ---------- 样式来源清单：三类都要进扫描范围 ---------- */
function styleSources() {
  const sources = [];
  const templates = templateFiles(SRC_DIR);

  /* ① CSS 文件 */
  for (const f of cssFiles(CSS_DIR)) {
    sources.push({
      rel: path.relative(ROOT, f),
      kind: "CSS 文件",
      css: fs.readFileSync(f, "utf8"),
    });
  }

  /* ②③ 模板：内联 <style> 块 + style 属性 */
  for (const f of templates) {
    // Nunjucks 注释 {# ... #} 不渲染，先剥掉，免得注释里的字样被当成真样式
    const text = fs
      .readFileSync(f, "utf8")
      .replace(/\{#[\s\S]*?#\}/g, (m) => m.replace(/[^\n]/g, " "));
    const rel = path.relative(ROOT, f);

    const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let m;
    while ((m = styleRe.exec(text)) !== null) {
      sources.push({ rel, kind: "模板内联 <style>", css: m[1] });
    }

    // style="..." 属性的值本身是一段声明列表，补一对花括号塞回同一个解析器
    const attrRe = /(?<![\w-])style\s*=\s*(["'])([\s\S]*?)\1/gi;
    while ((m = attrRe.exec(text)) !== null) {
      const v = m[2];
      if (/\{\{|\$\{/.test(v)) continue; // 动态值：判不了就不猜
      sources.push({ rel, kind: "style 属性", css: `[style]{${v}}` });
    }
  }
  return { sources, templates };
}

/* ---------- W1 / W2 ---------- */
const { sources, templates } = styleSources();

/* 全部来源里的 overflow-wrap 声明（带出处） */
const decls = [];
for (const src of sources) {
  for (const d of wrapDecls(src.css)) {
    decls.push({ ...d, rel: src.rel, kind: src.kind, inCssFile: src.kind === "CSS 文件" });
  }
}

/* —— W2 的第一半：扫描范围不能有盲区 ——
   eleventy 的 {% inlineCss %} 短码把指定文件以 <style> 塞进产物；引用一个
   src/assets/css/ 之外的文件，那份文件里的 overflow-wrap 门禁就永远看不见，
   而 W2 汇总里那句"站内无 break-word"就成了一句空话。 */
for (const f of templates) {
  const text = fs
    .readFileSync(f, "utf8")
    .replace(/\{#[\s\S]*?#\}/g, (m) => m.replace(/[^\n]/g, " "));
  const re = /\{%\s*inlineCss\s+["']([^"']+)["']\s*%\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const relFromCssDir = path.relative(CSS_DIR, path.resolve(ROOT, m[1]));
    if (relFromCssDir.startsWith("..") || path.isAbsolute(relFromCssDir)) {
      note(
        `${path.relative(ROOT, f)}: inlineCss 引用了 ${m[1]}，它不在 src/assets/css/ 下 ——` +
          `这个文件里的 overflow-wrap 门禁扫不到，等于开了一个盲区。` +
          `把它放进 src/assets/css/，或改走 <link>。`
      );
    }
  }
}

/* —— W2 的第二半：所有来源里都不许有 break-word —— */
for (const d of decls) {
  if (d.value === "break-word") {
    note(
      `${d.rel}（${d.kind}）: 选择器「${d.selector}」用了 overflow-wrap: break-word —— ` +
        `它不参与 min-content 宽度计算，在 flex/grid 容器里挡不住长串` +
        `（实测：390px 视口下全站有 132 处单点注入就能把页面撑破）。改成 anywhere。`
    );
  } else if (!OK_VALUES.includes(d.value)) {
    note(
      `${d.rel}（${d.kind}）: 选择器「${d.selector}」的 overflow-wrap: ${d.value} ` +
        `不是受支持的兜底值（应为 ${OK_VALUES.join(" / ")}）。`
    );
  }
}

/* —— W1：全局兜底规则 ——
   只认 CSS 文件：全局兜底必须对全站生效，模板内联 <style> 是页面级的，
   拿它顶替会让别的页面失去保护、而门禁还绿着。 */
let globalRule = null;

for (const d of decls) {
  if (!d.inCssFile) continue;
  if (!OK_VALUES.includes(d.value)) continue; // break-word / 非法值已在 W2 报过

  // 找出这条规则覆盖的标签类型
  const tags = new Set();
  for (const compound of d.selector.split(",")) {
    // 只取**最后一个**简单选择器上的标签（`a p` 里标签在后者）
    const parts = compound.trim().split(/\s+/);
    const t = tagOf(parts[parts.length - 1]);
    if (t) tags.add(t);
  }

  const hit = REQUIRED_TAGS.filter((t) => tags.has(t));
  if (hit.length > REQUIRED_TAGS.length / 2 && (!globalRule || hit.length > globalRule.hit.length)) {
    globalRule = { rel: d.rel, selector: d.selector, value: d.value, hit, tags };
  }
}

if (!globalRule) {
  note(
    `src/assets/css 下找不到"全局长串兜底"规则——` +
      `需要一条选择器覆盖 ${REQUIRED_TAGS.join(" / ")} 的 overflow-wrap: anywhere。` +
      `（全局兜底必须放在 src/assets/css/ 下：模板内联 <style> 是页面级的，` +
      `顶替不了全站兜底。）`
  );
} else {
  const missing = REQUIRED_TAGS.filter((t) => !globalRule.tags.has(t));
  if (missing.length) {
    note(
      `${globalRule.rel}: 全局兜底规则「${globalRule.selector}」没有覆盖 ` +
        `${missing.join(" / ")}——这些元素类型落在 flex/grid 容器里时完全没有断行兜底。`
    );
  }
  if (globalRule.value !== "anywhere") {
    note(
      `${globalRule.rel}: 全局兜底规则用的是 overflow-wrap: ${globalRule.value}，` +
        `应当是 anywhere（break-word 不参与 min-content 计算，挡不住 flex/grid 里的长串）。`
    );
  }
}

/* ---------- W3：门禁自己没被卸掉 ----------
   "门禁自己被卸掉"和"门禁没生效"在结果上长得一模一样（build 照过、门禁全绿），
   所以凡是靠"某处存在某样东西"做判据的门禁，都必须有这一条兜底。 */
if (!fs.existsSync(PKG)) {
  note(`找不到 package.json，无法确认本门禁是否接在 build 上。`);
} else {
  const pkg = JSON.parse(fs.readFileSync(PKG, "utf8"));
  const build = (pkg.scripts && pkg.scripts.build) || "";
  const wired =
    build.includes("check:wrap") &&
    (pkg.scripts["check:wrap"] || "").includes("check-wrapping.cjs");
  if (!wired) {
    note(
      `门禁自己被卸掉了：package.json 的 build 链里没有 check:wrap，` +
        `或 check:wrap 没有指向 scripts/check-wrapping.cjs。`
    );
  }
}

/* ---------- 汇总 ---------- */
if (problems.length) {
  console.error("长串断行门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

const countOf = (kind) => sources.filter((s) => s.kind === kind).length;

console.log(
  `长串断行门禁通过：全局兜底 = overflow-wrap: ${globalRule.value}，` +
    `覆盖 ${globalRule.tags.size} 个标签类型（要求 ${REQUIRED_TAGS.length} 个）；` +
    `已扫 ${countOf("CSS 文件")} 个 CSS 文件 + ` +
    `${countOf("模板内联 <style>")} 个模板内联 <style> 块 + ` +
    `${countOf("style 属性")} 处 style 属性，其中无 overflow-wrap: break-word。`
);
