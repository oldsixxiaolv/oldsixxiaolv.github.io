#!/usr/bin/env node
/**
 * CSS 括号平衡检查。
 *
 * 为什么需要它：这个项目已经被"少一个花括号"坑过两次——
 *   1. layout.css 少一个 } → 后面 18 条规则被静默吞掉，页面看着"就是没样式"
 *   2. pages.css 改 .home-hero__title 时同样漏了 } → 整个 hero 之后的
 *      版式（按钮、FIELD NOTE 贴纸、人像卡）全部失效
 * 两次都是**静默**的：构建不报错、控制台无 error、HTTP 全部 200，
 * 只有肉眼看截图才发现。所以必须在构建阶段就拦住。
 *
 * 为什么不能用现成工具：这个项目没装 stylelint/postcss，也不打算为一个
 * 括号计数器引入依赖树。CSS 的花括号配对足够简单，几十行就能覆盖，
 * 而且不引入依赖就不会有依赖自身的版本问题。
 *
 * 计数前先剥掉注释：注释里出现 { 或 }（本项目的注释大量举例 CSS 片段）
 * 会造成假阳性。同时跳过字符串字面量与 url() 里的 data URI。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "src", "assets", "css");

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    // ⚠️ 必须跳过 `._*`：本项目在外接 exFAT 盘上开发，macOS 会给每个文件
    // 留一份 AppleDouble 资源叉（`._paper.css`），它也以 .css 结尾。
    // 资源叉是二进制，头部随机字节里可能含一个未闭合的 `{`，
    // 那样脚本会**失败退出并指向一个用户从没写过的文件**，极具误导性。
    // .gitignore 已排除 `._*`，但那只管 git，管不到这个脚本。
    else if (entry.name.endsWith(".css") && !entry.name.startsWith("._")) yield p;
  }
}

/** 剥掉注释与字符串，只留下结构字符 */
function strip(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === "/*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? src.length : end + 2;
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
  return out;
}

let failed = 0;
let checked = 0;
for (const file of walk(ROOT)) {
  checked++;
  const stripped = strip(fs.readFileSync(file, "utf-8"));
  let depth = 0;
  let minDepth = 0;
  for (const ch of stripped) {
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth < minDepth) minDepth = depth;
    }
  }
  const rel = path.relative(path.join(__dirname, ".."), file);
  if (depth !== 0 || minDepth < 0) {
    console.error(
      `  ✗ ${rel}  未闭合 ${depth > 0 ? depth + " 个 {" : ""}${depth < 0 ? " 多出 " + -depth + " 个 }" : ""}` +
        `${depth === 0 && minDepth < 0 ? "（存在多余的 }）" : ""}\n` +
        `    → 缺失的收尾花括号会让后面的规则被静默吞掉：构建不报错、HTTP 200、\n` +
        `      控制台干净，只有肉眼看截图才发现。`
    );
    failed++;
  }
}

if (failed) {
  console.error(`\nCSS 括号检查失败：${failed}/${checked} 个文件有问题`);
  process.exit(1);
}
console.log(`CSS 括号检查通过（${checked} 个文件）`);
