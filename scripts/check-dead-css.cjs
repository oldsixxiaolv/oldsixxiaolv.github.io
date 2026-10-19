#!/usr/bin/env node
/**
 * 死 CSS 检查：CSS 里定义了、但页面上永远不会出现的类。
 *
 * 为什么需要它：死 CSS **不会让构建失败**。它只是让 stylesheet 越滚越大，
 * 并且——这是真正的危害——**让读代码的人以为那些元素还在页面上**。
 * 本项目就吃过这个亏：首页的「ACHIEVEMENTS 成果条」「三处入口」
 * 「Recently collected」三块版块被删掉之后，pages.css 里留下了
 * 18 个零引用的类（.home-achievement* / .home-pillars / .home-pillar* /
 * .home-latest* / .home-index / .home-section-head）。半年后有人要
 * 「把成果条加回来」，会以为只要改改 site.js 的数据就行——实际上
 * 版块、样式、数据三处已经各走各的。
 *
 * 判据：一个类名出现在**受检样式表**的选择器里，而它
 *   ① 在任何模板 / 脚本 / 内容文件里都没有出现过，且
 *   ② 在任何**其他** CSS 文件里也没有出现过
 * → 死类，build 判红。
 * 换句话说：CSS 里定义的东西，必须在页面里（模板/脚本）或别的样式表里
 * 有一个真实的落点。
 *
 * ⚠️ **受检范围为什么只有 pages.css**，不是全站样式表：
 *   全站扫会**误报**，而且是原理性的误报。实测（第一次写成全站时的输出）：
 *   · `.badge--sage` / `.badge--warning` —— publications.njk 里写的是
 *     `class="badge badge--{{ st.tone }}"`，类名**由数据拼出来**，
 *     静态扫模板永远看不到 "badge--sage" 这几个字；
 *   · `.paper-anchor--figure` / `.annotating` / `.nav__link` 等 —— 这些元素
 *     是 paper-reader 的 JS 在运行时**创建**的，模板里根本没有它们。
 *   也就是说：静态扫只能证明"这个类名在源码里出现过"，证明不了
 *   "这个类在页面上活着"。对一个只有静态类名的样式表（pages.css）
 *   这个推论才成立；对动态类名就不成立。
 *   → 所以门禁只盯 pages.css（这个项目里唯一"全部静态类名"的大样式表），
 *     宁可少查，也不要给出一个会误报的判据——误报的门禁会被人习惯性忽略，
 *     那比没有门禁更糟。
 *
 * 为什么不用现成工具：stylelint 有 no-unused-selectors，但它要装依赖、
 * 要配 selector-disallowed-list，而且**不认站点自己的模板与数据**——
 * 本项目改版块时模板和数据是一起动的，工具看不出"这个类是不是真的
 * 还挂在页面上"。几十行脚本够用，且不引入依赖就没有依赖自身的版本问题。
 *
 * 三个容易踩的坑（都已在下面处理）：
 *   1. **注释里的类名不算数**。本项目的注释大量举例 CSS 片段
 *      （`.home-achievement__label` 这种），不剥注释会把它们全算成"在用"，
 *      门禁就永远不响。
 *   2. **url() 里的文件名不算类名**。`@import url("./_nav.css")` 里的
 *      `.css` 会被当成一个类。
 *   3. **AppleDouble 资源叉**（`._paper.css`）：外接 exFAT 盘上 macOS
 *      给每个文件留一份资源叉，它也以 .css 结尾、内容是二进制。
 *      .gitignore 排除了 `._*`，但那只管 git，管不到这个脚本。
 */
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const CSS_DIR = path.join(REPO, "src", "assets", "css");
const SRC_DIR = path.join(REPO, "src");

/** 受检样式表（见文件头"受检范围为什么只有 pages.css"） */
const TARGETS = ["src/assets/css/pages.css"];

/** 剥掉 CSS 注释、字符串字面量、url()——只留下结构与选择器 */
function stripCss(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === "/*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? src.length : end + 2;
      out += " ";
      continue;
    }
    const c = src[i];
    if (c === '"' || c === "'") {
      const quote = c;
      i++;
      while (i < src.length && src[i] !== quote) i += src[i] === "\\" ? 2 : 1;
      i++;
      continue;
    }
    out += c;
    i++;
  }
  // url(...) 里是资源路径，里面的 `.css` / `.png` 不是类名
  return out.replace(/url\([^)]*\)/g, " ");
}

/** 取出一个 CSS 文本里出现过的全部类选择器名 */
function classNames(cssText) {
  const out = new Set();
  const stripped = stripCss(cssText);
  // 以 . 开头的标识符；首字符必须是字母/下划线/连字符，避免把 .5em、
  // .75rem 这类小数点后的数字当成类名。
  for (const m of stripped.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) out.add(m[1]);
  return out;
}

function* walkFiles(dir, accept) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "_site") continue;
      yield* walkFiles(p, accept);
    } else if (accept(entry.name, p)) {
      yield p;
    }
  }
}

const isAppleDouble = (name) => name.startsWith("._");

// —— 1) 收集所有 CSS 文件与受检样式表的类名 ——
const cssFiles = [
  ...walkFiles(CSS_DIR, (name) => name.endsWith(".css") && !isAppleDouble(name)),
];
/** 类名 → 定义它的 CSS 文件（可能有多个文件都提到同一个类） */
const definedIn = new Map();
for (const file of cssFiles) {
  // 只统计**受检**样式表里的类名
  if (!TARGETS.includes(path.relative(REPO, file))) continue;
  for (const cls of classNames(fs.readFileSync(file, "utf-8"))) {
    if (!definedIn.has(cls)) definedIn.set(cls, []);
    definedIn.get(cls).push(file);
  }
}

// —— 2) 收集"页面侧"的落点：模板 / 脚本 / 内容文件 ——
// 范围刻意排除 docs/：改进日志里会逐条写到类名（"清掉了 .home-pillar*"），
// 那不是"这个类在页面上活着"。范围也排除 src/assets/css（单独处理）。
const USAGE_EXT = new Set([
  ".njk",
  ".md",
  ".js",
  ".cjs",
  ".mjs",
  ".svg",
  ".html",
  ".json",
  ".yaml",
  ".yml",
]);
const usageFiles = [
  ...walkFiles(SRC_DIR, (name, full) => {
    if (isAppleDouble(name)) return false;
    if (full.startsWith(CSS_DIR)) return false;
    return USAGE_EXT.has(path.extname(name).toLowerCase());
  }),
  // 站点根部的构建配置也可能直接写出类名
  path.join(REPO, "eleventy.config.js"),
  path.join(REPO, "eleventy-helpers.cjs"),
].filter((f) => fs.existsSync(f));

let usageBlob = "";
for (const file of usageFiles) {
  let text = fs.readFileSync(file, "utf-8");
  // Nunjucks 注释 {# … #} 与 HTML 注释 <!-- … --> 里的类名不算"在用"：
  // 模板注释是给人看的说明，不是页面上真实存在的类。
  text = text.replace(/\{#[\s\S]*?#\}/g, " ").replace(/<!--[\s\S]*?-->/g, " ");
  usageBlob += "\n" + text;
}

// —— 3) 判死类 ——
/** 类名 → 它出现在哪些 CSS 文件里（用于报错时指出落点） */
const cssBlob = new Map();
for (const file of cssFiles) cssBlob.set(file, stripCss(fs.readFileSync(file, "utf-8")));

const dead = [];
for (const [cls, files] of definedIn) {
  if (usageBlob.includes(cls)) continue;
  // 别的 CSS 文件里也提到它 → 它有落点（可能是被另一个样式表选择，
  // 例如 .list__title 定义在 _list.css、被 pages.css 的复合选择器引用）
  let usedElsewhere = false;
  for (const [file, text] of cssBlob) {
    if (files.includes(file)) continue;
    if (text.includes(cls)) {
      usedElsewhere = true;
      break;
    }
  }
  if (!usedElsewhere) dead.push({ cls, files });
}

// —— 4) 汇报 ——
if (dead.length) {
  console.error("");
  for (const { cls, files } of dead) {
    const rels = files.map((f) => path.relative(REPO, f));
    console.error(`  ✗ .${cls}  （只出现在 ${rels.join("、")}）`);
  }
  console.error(
    `\n死 CSS 检查失败：${dead.length} 个类在 CSS 里定义了，但页面上永远不会有。\n` +
      `    → 这类规则不会让构建失败，却会让人以为对应元素还在页面上。\n` +
      `      要么删掉这些规则，要么把元素真的加回模板（并把数据补上）。\n` +
      `    → 如果某个类确实是"留给以后用的钩子"，请在用到它的模板/脚本里\n` +
      `      真正引用它一次（注释不算），否则门禁会一直报它。`
  );
  process.exit(1);
}
console.log(
  `死 CSS 检查通过（${cssFiles.length} 个样式表，${definedIn.size} 个类全部有落点）`
);
