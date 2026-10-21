/**
 * CSS 注释剥除器 —— 构建期用（产物层），源码层一个字不动。
 *
 * 为什么需要它（2026-10-20 的 D37）：
 *   本站的 CSS 注释写得极密 —— 记录取舍理由、实测数字、踩过的坑。
 *   这些注释对**维护者是资产**，但它们不该**跟着产物发给访客**：
 *   实测产物里 CSS 的注释占了将近一半的字节（外链 CSS 65.9 KB / 130.9 KB），
 *   而**内联**在 `<style>` 里的那一部分更糟 —— 它在 HTML 里，
 *   **不可缓存、每次翻页都要重下**，每页 11.8 KB（论文页 22.2 KB）。
 *   内联 CSS 存在的全部理由就是把关键样式塞进 HTML 省一次往返，
 *   注释让这项优化在关键路径上多背了十几 KB 浏览器一个字节都不用的东西。
 *
 *   所以：**源文件保留注释（那是维护者的笔记），产物剥掉（那是访客的带宽）**。
 *
 * 剥除规则（与 CSS 语义一致）：
 *   · 只剥**块注释**（斜杠 + 星号 … 星号 + 斜杠）；行注释不是 CSS 语法，不处理。
 *   · **字符串字面量里的内容一律原样保留** —— 诸如
 *     `content:` 的值里写着「斜杠 + 星号 … 星号 + 斜杠」这种写法是合法 CSS，
 *     把它当注释剥掉会**改掉渲染结果**。这是本文件唯一真正危险的地方。
 *   · 注释里的**换行保留**（只丢非换行字符）⇒ 产物的行号与源文件基本对齐，
 *     出问题时还能对着源码看；代价只是几个字节的换行符。
 *
 * 为什么放在 scripts/lib/ 而不是就地写在 eleventy.config.js 里：
 *   门禁与自测都要读同一份行为（自测要断言「产物里的内联块 == 源文件剥注释后」，
 *   而这个断言必须用**同一套**剥除规则，否则两边的空格与换行差异会让它恒假）。
 *   ⚠️ 但**门禁本身不 import 这个文件** —— 门禁要自己独立实现一遍判据
 *   （不能靠被检查方自己的函数来判定自己），那是本仓一贯的做法。
 */
"use strict";

/**
 * 剥掉 CSS 里的块注释。
 *
 * @param {string} css  CSS 文本
 * @returns {string} 剥掉块注释后的 CSS（字符串字面量原样保留，换行保留）
 */
function stripCssComments(css) {
  if (typeof css !== "string" || css.indexOf("/") === -1) return css;
  let out = "";
  let i = 0;
  const n = css.length;
  while (i < n) {
    const c = css[i];
    // 块注释开始（不在字符串里 —— 字符串分支会先把它整段吃掉）
    if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      // 只保留换行，其余丢掉
      out += css.slice(i, stop).replace(/[^\n]/g, "");
      i = stop;
      continue;
    }
    // 字符串字面量：整段原样拷贝（含转义）
    if (c === '"' || c === "'") {
      const quote = c;
      out += c;
      i++;
      while (i < n) {
        if (css[i] === "\\") {
          out += css.slice(i, i + 2);
          i += 2;
          continue;
        }
        out += css[i];
        i++;
        if (css[i - 1] === quote) break;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * 剥掉 HTML 里内联 <style> 块中的 CSS 注释（只动 style 块的内容，别的字节不动）。
 *
 * @param {string} html HTML 文本
 * @returns {string} 处理后的 HTML
 */
function stripInlineStyleComments(html) {
  if (typeof html !== "string") return html;
  return html.replace(
    /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_m, open, css, close) => open + stripCssComments(css) + close
  );
}

/**
 * 走一遍产物目录：把 CSS 文件里的注释、以及 HTML 里内联 <style> 的注释剥掉。
 *
 * 只动**产物**目录（_site / _site_dev），不碰 src/、不碰任何用户数据。
 * 只在内容真的变了时才写回（省一次 IO，也避免无谓地改文件 mtime）。
 *
 * @param {string} outDir 产物目录（绝对路径）
 * @returns {{cssFiles:number, htmlFiles:number, bytesBefore:number, bytesAfter:number}}
 */
function stripProductCssComments(outDir) {
  const fs = require("fs");
  const path = require("path");
  const stats = { cssFiles: 0, htmlFiles: 0, bytesBefore: 0, bytesAfter: 0 };

  const writeIfChanged = (file, next) => {
    const before = fs.readFileSync(file);
    const after = Buffer.from(next, "utf8");
    stats.bytesBefore += before.length;
    if (before.equals(after)) {
      stats.bytesAfter += before.length;
      return false;
    }
    fs.writeFileSync(file, after);
    stats.bytesAfter += after.length;
    return true;
  };

  const walk = (dir, accept) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return [];
    }
    const out = [];
    for (const e of entries) {
      if (e.name.startsWith("._")) continue; // macOS 资源叉
      const p = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...walk(p, accept));
      else if (e.isFile() && accept(e.name, p)) out.push(p);
    }
    return out;
  };

  // 1) 外链 CSS 文件
  const cssDir = path.join(outDir, "assets", "css");
  for (const f of walk(cssDir, (name) => name.toLowerCase().endsWith(".css"))) {
    const src = fs.readFileSync(f, "utf8");
    const next = stripCssComments(src);
    if (next !== src) {
      writeIfChanged(f, next);
      stats.cssFiles++;
    } else {
      stats.bytesBefore += Buffer.byteLength(src, "utf8");
      stats.bytesAfter += Buffer.byteLength(src, "utf8");
    }
  }

  // 2) 页面里内联的 <style>
  for (const f of walk(outDir, (name) => name.toLowerCase().endsWith(".html"))) {
    const src = fs.readFileSync(f, "utf8");
    const next = stripInlineStyleComments(src);
    if (next !== src) {
      writeIfChanged(f, next);
      stats.htmlFiles++;
    } else {
      stats.bytesBefore += Buffer.byteLength(src, "utf8");
      stats.bytesAfter += Buffer.byteLength(src, "utf8");
    }
  }

  return stats;
}

module.exports = { stripCssComments, stripInlineStyleComments, stripProductCssComments };
