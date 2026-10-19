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
 *   W2 不退化 —— 站内任何地方都不许再出现 `overflow-wrap: break-word`；
 *   W3 门禁自己没被卸掉 —— 本脚本必须真的在 build 链上。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CSS_DIR = path.join(ROOT, "src/assets/css");
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

/* ---------- W1 / W2 ---------- */
const files = cssFiles(CSS_DIR);
let globalRule = null;

for (const file of files) {
  const css = fs.readFileSync(file, "utf8");
  const rel = path.relative(ROOT, file);

  for (const rule of rules(css)) {
    const decls = rule.body.split(";").map((d) => d.trim());
    const ow = decls.find((d) => /^overflow-wrap\s*:/i.test(d));
    if (!ow) continue;
    const value = ow.split(":")[1].trim().toLowerCase();

    // —— W2：不允许 break-word ——
    if (value === "break-word") {
      note(
        `${rel}: 选择器「${rule.selector.replace(/\s+/g, " ")}」用了 ` +
          `overflow-wrap: break-word —— 它不参与 min-content 宽度计算，` +
          `在 flex/grid 容器里挡不住长串（实测：390px 视口下全站有 132 处` +
          `单点注入就能把页面撑破）。改成 anywhere。`
      );
      continue;
    }

    if (!OK_VALUES.includes(value)) {
      note(
        `${rel}: 选择器「${rule.selector.replace(/\s+/g, " ")}」的 ` +
          `overflow-wrap: ${value} 不是受支持的兜底值（应为 ${OK_VALUES.join(" / ")}）。`
      );
      continue;
    }

    // 找出这条规则覆盖的标签类型
    const tags = new Set();
    for (const compound of rule.selector.split(",")) {
      // 只取**最后一个**简单选择器上的标签（`a p` 里标签在后者）
      const parts = compound.trim().split(/\s+/);
      const t = tagOf(parts[parts.length - 1]);
      if (t) tags.add(t);
    }

    const hit = REQUIRED_TAGS.filter((t) => tags.has(t));
    if (hit.length > REQUIRED_TAGS.length / 2 && (!globalRule || hit.length > globalRule.hit.length)) {
      globalRule = { rel, selector: rule.selector.replace(/\s+/g, " "), value, hit, tags };
    }
  }
}

if (!globalRule) {
  note(
    `src/assets/css 下找不到"全局长串兜底"规则——` +
      `需要一条选择器覆盖 ${REQUIRED_TAGS.join(" / ")} 的 overflow-wrap: anywhere。`
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

console.log(
  `长串断行门禁通过：全局兜底 = overflow-wrap: ${globalRule.value}，` +
    `覆盖 ${globalRule.tags.size} 个标签类型（要求 ${REQUIRED_TAGS.length} 个）；` +
    `站内无 overflow-wrap: break-word。`
);
