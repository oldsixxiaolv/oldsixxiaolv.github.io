#!/usr/bin/env node
/**
 * 404 页路径深度门禁 —— 守住「404 页在任意缺失路径下都还能正常显示」这条线。
 *
 * 为什么要有这道门禁（一次具体的实测，不是假想）：
 *   GitHub Pages 对**任何**未匹配的路径都返回 `/404.html` 的内容，
 *   但**浏览器地址栏仍停在请求的 URL 上**（不会跳到 /404.html）。
 *   404 页原本用的是**相对 URL**（"assets/css/components.css"、"blog/"），
 *   于是一个请求 `/papers/does-not-exist/`，浏览器就按
 *   `/papers/does-not-exist/` 这个基址去解析它们：
 *     "assets/css/components.css" → /papers/does-not-exist/assets/css/components.css
 *     "blog/"                      → /papers/does-not-exist/blog/
 *   ⇒ 4 个 preload 换装的样式表**全部加载失败**（连 noscript 兜底也没用，
 *     因为兜底那三张表用的也是相对路径）、6 条站内链接**全部 404**；
 *     页面只剩内联 critical CSS ⇒ 版式全失、导航全断。
 *   （2026-10-20 用真实 Chrome + CDP 实测坐实，不是推测。）
 *
 *   根因：**相对路径在 404 场景下没有正确解** —— 请求路径的深度不可知，
 *   相对 URL 必然被解析到"请求路径"下面。所以 404 页的站内 URL
 *   必须一律**根绝对**（"/assets/..."、"/blog/"）。
 *
 * 判据：
 *   E1 404 页的站内 URL 一律根绝对 —— 不得出现任何相对站内 URL。
 *   E2 覆盖度自证 —— 404 页至少要检出 N 个站内 URL（防止"改空了就通过"：
 *      把 404 页的链接全删光，E1 自然没话可说，但那是页面更坏了，不是修好了）。
 *   E3 边界锁 —— **其余页面仍然是相对 URL**。
 *      这条锁的是"只修 404 页"这个范围：如果把 relUrl 改成全站根绝对，
 *      404 页是好了，但"整个文件夹扔到哪都能跑"的原则被推翻了
 *      （挂到子路径下时全站资源都会 404）—— 那是更大的回归，不该被顺手做掉。
 *
 * ⚠️ 这道门禁**只判路径形态**，不判"文件是否存在"：
 *    站内链接指向的文件存不存在，由 scripts/verify-site.cjs 的门禁 1 负责。
 *    两道门禁各管一件事，不重复。
 *
 * 环境变量（供 scripts/test-404-depth.cjs 的注入矩阵用）：
 *   SITE_DIR —— 覆盖产物目录（默认 _site）。注入必须在副本上做，
 *              不动仓库里的 _site（会和并发的 build 抢同一个目录）。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
/* 产物目录。默认是仓库里的 _site；SITE_DIR 只是给"故障注入"用的——
   改产物做注入测试时如果直接改 _site，会和并发的 build 抢同一个目录。 */
const SITE = process.env.SITE_DIR
  ? path.resolve(process.env.SITE_DIR)
  : path.join(ROOT, "_site");
/* 404 产物。GitHub Pages 约定：错误页固定叫 404.html，且放在站点根。 */
const PAGE_404 = path.join(SITE, "404.html");
/** E2 的覆盖度下限：404 页至少要有这么多个站内 URL 被检查到。 */
const MIN_INTERNAL_URLS = 8;

const problems = [];
const fail = (m) => problems.push(m);

/* ---------------- 工具 ---------------- */

/**
 * 从 HTML 里抽出所有 URL 形态的取值。
 * 取 href / src / srcset 三个属性：站内资源引用就落在这三个里。
 * （srcset 的取值是 "url 300w, url 600w" 这种逗号分隔 + 描述符的组合。）
 */
function extractUrls(html) {
  const out = [];
  for (const m of html.matchAll(/(?:href|src|srcset)\s*=\s*"([^"]*)"/g)) {
    const raw = m[1].trim();
    if (!raw) continue;
    if (raw.includes(",")) {
      // srcset：逗号分隔，每段的第一段才是 URL
      for (const part of raw.split(",")) {
        const u = part.trim().split(/\s+/)[0];
        if (u) out.push(u);
      }
    } else {
      out.push(raw);
    }
  }
  return out;
}

/**
 * 判断一个 URL 是不是"站内 URL"（也就是这条门禁要管的对象）。
 * 站外的、带协议的、纯锚点、纯查询串 —— 一律不管：
 *   · 外部地址（http/https/mailto/tel）由别的门禁管；
 *   · 纯锚点（"#main"）是**页内跳转**，不涉及路径解析，不是本门禁的对象；
 *   · 协议相对（"//"）是外站。
 */
function isInternal(url) {
  if (!url) return false;
  if (url.startsWith("#")) return false; // 页内锚点
  if (url.startsWith("?")) return false; // 纯查询串
  if (url.startsWith("//")) return false; // 协议相对 = 外站
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return false; // 带协议（http/mailto/tel…）
  return true;
}

/** 站内 URL 是不是根绝对（以 "/" 开头）。 */
function isRootAbsolute(url) {
  return url.startsWith("/");
}

/** 递归列出产物里的 HTML 文件（相对站点根的路径）。 */
function htmlFiles(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) htmlFiles(full, base, out);
    else if (e.name.endsWith(".html")) out.push(path.relative(base, full));
  }
  return out;
}

/* ---------------- E1 / E2：404 页 ---------------- */

if (!fs.existsSync(PAGE_404)) {
  fail(
    `找不到 404 产物 ${path.relative(ROOT, PAGE_404) || PAGE_404} —— ` +
      `GitHub Pages 靠它兜住所有未匹配路径；产物里没有它，缺失路径会直接显示` +
      `GitHub 的默认错误页，站点自己的样式与导航全丢。`
  );
} else {
  const html = fs.readFileSync(PAGE_404, "utf8");
  const internal = extractUrls(html).filter(isInternal);
  const relativeOnes = internal.filter((u) => !isRootAbsolute(u));

  // E1：站内 URL 一律根绝对
  for (const u of relativeOnes) {
    fail(
      `E1 404 页里出现了相对站内 URL「${u}」 —— ` +
        `GitHub Pages 把 /404.html 的内容送到**任意**未匹配路径下，` +
        `但浏览器地址栏仍停在请求路径 ⇒ 相对 URL 会被解析到请求路径下面` +
        `（如 /papers/does-not-exist/ 下的 "assets/css/components.css"` +
        `会去请求 /papers/does-not-exist/assets/css/components.css）` +
        `⇒ 样式表全部加载失败、站内链接全部 404。` +
        `404 页的站内 URL 必须根绝对（"/${u}"）。`
    );
  }

  // E2：覆盖度自证 —— 不能靠"把链接删光"来过门禁
  if (internal.length < MIN_INTERNAL_URLS) {
    fail(
      `E2 404 页只检出 ${internal.length} 个站内 URL（要求至少 ${MIN_INTERNAL_URLS} 个）—— ` +
        `这道门禁必须真的在检查一批 URL 才能算数；` +
        `数量这么少，多半是 404 页的链接被删光了（那是更坏，不是修好了）。`
    );
  }
}

/* ---------------- E3：其余页面仍然是相对 URL ---------------- */

if (fs.existsSync(SITE)) {
  const pages = htmlFiles(SITE).filter((p) => p !== "404.html");
  for (const rel of pages) {
    const html = fs.readFileSync(path.join(SITE, rel), "utf8");
    for (const u of extractUrls(html).filter(isInternal)) {
      if (isRootAbsolute(u)) {
        fail(
          `E3 非 404 页面「${rel}」里出现了根绝对站内 URL「${u}」 —— ` +
            `本次只该修 404 页；把全站改成根绝对会推翻「整个文件夹扔到哪都能跑」` +
            `（挂到子路径下时全站资源一起 404），那是更大的回归，不该顺手做掉。` +
            `其余页面请保持相对 URL。`
        );
      }
    }
  }
}

/* ---------------- 汇总 ---------------- */
if (problems.length) {
  console.error("404 页路径深度门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  console.error(
    `  判据出处：docs/DEFECT-BACKLOG.md D17（GitHub Pages 的 404 语义 × 相对 URL）。`
  );
  console.error("");
  process.exit(1);
}

const html404 = fs.existsSync(PAGE_404) ? fs.readFileSync(PAGE_404, "utf8") : "";
const n404 = extractUrls(html404).filter(isInternal).length;
console.log(
  `404 页路径深度门禁通过：404.html 的 ${n404} 个站内 URL 全部根绝对` +
    `（≥${MIN_INTERNAL_URLS}），其余页面仍保持相对 URL。`
);
console.log(
  `  · 相对 URL 在 404 场景下没有正确解（请求路径深度不可知）⇒ 根绝对是唯一解。`
);
