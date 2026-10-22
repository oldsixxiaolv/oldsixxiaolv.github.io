#!/usr/bin/env node
/**
 * 图片资产门禁 —— 守住"页面里声明的图，和产物里真实存在的图，是同一张图"。
 *
 * 为什么要有这道门禁（2026-10-19 实测出来的缺口，不是假想）：
 *   现有门禁每一条都成立，但拼在一起漏了整整一类问题：
 *   **分享卡片图"声明"与"实物"对不上**。
 *   实测（隔离克隆里把 og 图文件名改成不存在的那个）：
 *     整条 `npm run build` 依然 **exit 0、全部门禁全绿**，
 *     而产物里每个页面的 og:image 都指向一个 404 —— 线上每张分享卡片
 *     （微信 / Twitter / Facebook / LinkedIn）拿到的都是死链，
 *     站点自己**看不出来**：build 通过、页面照常渲染、门禁全绿。
 *   缺口在哪：
 *     · 门禁 1 查的是 href / src 指向的**文件**能不能找到，而 og:image 装在
 *       <meta content="…"> 里，**不在门禁 1 的扫描面里**；
 *     · 门禁 26 查 <img> 有没有 width / height **属性**，不查属性值对不对；
 *     · 门禁 22 只在 og 与 twitter 两边都出现 alt 时才比对，两边都缺 alt 时
 *       它没有可比对象 → 判绿；
 *     · 没有任何门禁读图片**字节** → og:image:width / height 写错、
 *       或图换了尺寸但声明没换，都没有人拦。
 *
 * 编号体系：**独立编号 IA1–IA8**，不与既有编号续接
 *   （scripts/verify-site.cjs 用 1–32、check-a11y.cjs 用 A1–A7、
 *    check-wrapping.cjs 用 W1–W3、check-gates-wired.cjs 用 GW1–GW3）。
 *   也**不写死**对方的编号区间——那个区间会随对方加门禁而过期，
 *   写死就是一句会变假的话。
 *
 * ⚠️ **不重复已有的门禁**（同一个事实两处判，改一处就会与另一处说法打架）：
 *   · <img> 的 alt **存在性** → 门禁 25；alt 的**跨出口一致性** → 门禁 15 / 22；
 *   · <img> 的 width / height 属性**存在性** → 门禁 26；
 *   · href / src 指向的文件能不能找到 → 门禁 1；
 *   · og 与 twitter 的 alt 是否一致 → 门禁 22。
 *   本门禁只查上面那些门禁**看不到**的东西：文件**在不在**、
 *   **字节里的真实像素**与**声明值**是否一致。
 *
 * 判据：
 *   IA1 分享图必须真的存在：og:image / og:image:secure_url / twitter:image
 *        指向的站内文件必须在产物里存在（外站图不查，但**要计数报出来**，
 *        不许悄悄跳过）。附带：og:image 与 og:image:secure_url 必须指向同一个文件。
 *        ⚠️ **twitter:image 逐条验**（一张页面可以给多张 twitter:image）：
 *          D2 修完之后，正方形与横幅这两张分享图**只挂在 twitter:image 上**
 *          （og 那边只留一张）⇒ 若只验第一条，这两张就没人验了。
 *   IA2 og 声明的尺寸必须等于真实像素：og:image:width / og:image:height 必须存在，
 *        且与该文件的真实像素**逐字相等**（平台按这两个数取尺寸，写错就是错卡）。
 *   IA3 分享图必须有非空 alt：og:image:alt / twitter:image:alt 缺一个都不行
 *        （twitter 侧同样**逐条**）。
 *   IA4 <img> 声明的比例必须与真实像素一致：width / height 属性与真实像素**等比**
 *        （容差 1%）。属性值写错 → 预留了错的比例 → 布局照样跳。
 *        ⚠️ 已知边界（D40 登记，**待拍板 50**）：被"裁切槽"承载的图
 *        （CSS `aspect-ratio` + `object-fit: cover`），HTML 里声明的是**槽位**比例、
 *        不是**素材**比例 —— 两者可以合法地不相等（博客卡片槽 16:9 vs 2.5:1 的封面）。
 *        本门禁分不出"槽位"与"素材"，所以这类图会判红（对位图与 SVG 一视同仁）。
 *   IA5 图片格式必须能读出真实尺寸：**内容里的 <img>** 支持 PNG / JPEG / SVG；
 *        **分享图（og / twitter）必须仍是位图**（社交平台不解析 SVG）；
 *        别的格式 → 判红（"本门禁还验不了这个格式"），
 *        **不许静默跳过**——跳过就等于把这类图塞进"无人看守"的那一类。
 *        ⚠️ 2026-10-21 扩展 SVG 的原因（实测，不是假想）：站内契约
 *        （docs/blog-writing-guide.md §2.3）明写「封面一律用 .svg 扩展名 + SVG 文本」，
 *        而旧版 IA5 **只读得出 PNG / JPEG** ⇒ **照契约写封面，build 必红**
 *        （IA5 判红 + IA6 覆盖度自证判红，实测输出见缺陷清单 D40）。
 *        门禁必须能处理契约推荐的东西 —— 否则契约与门禁互相矛盾，
 *        守约的人反而被拦下。SVG 的"真实尺寸"取 <svg> 的 width / height，
 *        没有就取 viewBox 的后两个数。
 *   IA6 自证覆盖量：本门禁必须真的把**每一张**该验的图都验了一遍
 *        （应验数 == 实验数，且 ≥ 1），否则判红。
 *        （本仓库反复修的那族病：判据依赖可被截断的输入时会**静默空跑**，
 *          空跑的门禁等于没有门禁。）
 *   IA7 分享图声明**必须存在**（逐页）：每个页面至少一条 og:image、
 *        至少一条 twitter:image，缺一条就判红。
 *        为什么 IA1–IA6 抓不到这一形态：**它们只在"声明了但对不上"时才说话**，
 *        而"声明本身消失"这一形态，它们一句都不会说 ——
 *        它们的"应验集"是**从产物里找到的引用**算出来的（expectedFiles），
 *        引用没了，"应验集"也跟着空，IA6 甚至会因为"验不到图"而判红，
 *        但那说的是"没有图可验"，不是"分享图没声明"。
 *        实测（隔离克隆里删掉 base.njk 中全部 og:image / twitter:image 声明）：
 *          整条 `npm run build` **exit 0、全部门禁全绿**，
 *          门禁照样打印"✓ 图片资产自检通过（门禁 IA1–IA6）"，
 *          而产物里分享图声明为 **0** —— 分享出去全是无图卡片。
 *        这条与 IA1–IA6 互补：IA1–IA6 管"声明了的那条对不对"，
 *        IA7 管"声明在不在"。
 *   IA8 og:image **不得多于一条**（逐页）：抓取器只取**第一张** og:image，
 *        多出来的既不会被选中，又让"这一页的 og:image 到底是哪张"变得不确定
 *        （结构化数据里的 image 引用的也是第一张 ⇒ 两者必须一致）。
 *        为什么 IA1–IA7 抓不到这一形态：**它们逐条验的是"已经声明出来的那几条"，
 *        声明了三条、三条各自都对 ⇒ 全部判绿**，而多出来的那两条是纯多余。
 *        实测（修 D2 之前）：除论文页外每个页面都声明了 **3 条** og:image
 *        （1200×630 / 1080×1080 / 1500×500），理由写的是"社交平台按 slot 尺寸
 *        自动选图" —— 但那条理由只对 twitter:image 成立。
 *        ⚠️ 与 IA7 的分工（**同一处缺陷只许红一条**，红因归属才可判定）：
 *          **0 条**归 IA7（"没有声明 og:image"），
 *          **多于 1 条**归 IA8（本条）；合起来 = 恰好 1 条。
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
/* 产物目录。默认是仓库里的 _site；SITE_DIR 只是给"故障注入"用的——
   改产物做注入测试时如果直接改 _site，会和并发的 build 抢同一个目录。 */
const SITE = process.env.SITE_DIR
  ? path.resolve(process.env.SITE_DIR)
  : path.join(ROOT, "_site");

const problems = [];
const notes = [];
const fail = (m) => problems.push(m);
const note = (m) => notes.push(m);

/* IA8 的判定开关。**覆盖度计数不在这个开关之内**（覆盖度自证要是能被
   一起卸掉，那道判据就没有"自己被卸掉"的能力了）。
   负对照用：把它改成 false，同一处注入必须转绿 —— 证明红确实来自 IA8 自己。 */
const IA8_ON = true;

/* 站点公开地址（site.url）。绝对 URL 口径的唯一基准。 */
let SITE_URL = "";
try {
  SITE_URL = (require(path.join(ROOT, "src", "_data", "site.js")).url || "").replace(/\/+$/, "");
} catch {
  /* 读不到就当没有站点地址：所有绝对 URL 都会被算成"外站图"，
     并在输出里报出来（不静默）。 */
}

/* ---------------- 工具 ---------------- */

/** 递归列出产物里的 HTML 文件。 */
function htmlFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) htmlFiles(p, out);
    else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}

/** 把页面里的 <style> 块与 HTML 注释剔掉，再取出**真实**的 <img> 标签。
    这两处是"看起来像图、其实不是图"的两个来源（与 verify-site.cjs 的
    realImgTags 同一套剔除规则，理由见那边的注释）：
      · <style> 里的 CSS 注释 —— src/about.njk 里有一句字面 "<img> 上的
        width/height 属性…"（实测产物里也在）；
      · HTML 注释 —— 模板注释里说明写法时也可能写到 <img>。 */
function realImgTags(html) {
  const stripped = html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  return [...stripped.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
}

/** 取标签上的某个属性值；没有这个属性返回 null（**空值与没有是两回事**）。 */
function attrOf(tag, name) {
  const re = new RegExp(`(?<![\\w:-])${name}\\s*=\\s*"([^"]*)"`, "i");
  const m = tag.match(re);
  if (m) return m[1];
  const re2 = new RegExp(`(?<![\\w:-])${name}\\s*=\\s*'([^']*)'`, "i");
  const m2 = tag.match(re2);
  return m2 ? m2[1] : null;
}

/** 按出现顺序取出页面里所有 <meta> 的 (key, content)。 */
function metaList(html) {
  const out = [];
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = (tag.match(/\b(?:property|name)="([^"]*)"/i) || [])[1];
    if (!key) continue;
    const content = (tag.match(/\bcontent="([^"]*)"/i) || [])[1] || "";
    out.push({ key, content });
  }
  return out;
}

/** 把 og:image / og:image:secure_url / og:image:width / og:image:height /
    og:image:alt 按出现顺序配成一组一组（同组里紧跟在 image 后面的那些属性属于它）。
    配对规则：每个属性只配给**最近一个还没配过这个属性**的组。 */
function pairOgImages(html) {
  const pairs = [];
  for (const { key, content } of metaList(html)) {
    if (!key.startsWith("og:image")) continue;
    const suffix = key.slice("og:image".length);
    if (suffix === "") {
      pairs.push({ image: content, secure_url: null, width: null, height: null, alt: null });
      continue;
    }
    if (!pairs.length) continue;
    const p = pairs[pairs.length - 1];
    const field = suffix === ":secure_url" ? "secure_url"
      : suffix === ":width" ? "width"
      : suffix === ":height" ? "height"
      : suffix === ":alt" ? "alt"
      : null;
    if (field && p[field] === null) p[field] = content;
  }
  return pairs;
}

/** twitter:image / twitter:image:alt 的配对（**逐条**）。
    一张页面可以给多张 twitter:image（X / Twitter 按槽位比例自己挑），
    配对规则与 og 侧同源：**每个 alt 配给最近一个还没配过 alt 的 image**
    （即 alt 必须紧跟自己的 image）。 */
function pairTwitterImages(html) {
  const pairs = [];
  for (const { key, content } of metaList(html)) {
    if (key === "twitter:image") {
      pairs.push({ image: content, alt: null });
    } else if (key === "twitter:image:alt" && pairs.length) {
      const p = pairs[pairs.length - 1];
      if (p.alt === null) p.alt = content;
    }
  }
  return pairs;
}

/* ---------------- 读图片的真实像素 ---------------- */

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** 读 PNG 的真实像素（IHDR 里的宽高）。 */
function pngSize(buf) {
  if (buf.length < 24) return null;
  for (let i = 0; i < PNG_SIG.length; i++) if (buf[i] !== PNG_SIG[i]) return null;
  if (buf.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), format: "PNG" };
}

/** 读 JPEG 的真实像素（SOF 段里的宽高）。 */
function jpegSize(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let off = 2;
  while (off < buf.length - 1) {
    if (buf[off] !== 0xff) { off++; continue; }
    const marker = buf[off + 1];
    if (marker === 0xff) { off++; continue; }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { off += 2; continue; }
    if (marker === 0xd9) break;
    if (off + 4 > buf.length) break;
    const len = buf.readUInt16BE(off + 2);
    const isSOF =
      marker >= 0xc0 && marker <= 0xcf &&
      marker !== 0xc4 /* DHT */ && marker !== 0xc8 /* JPG */ && marker !== 0xcc /* DAC */;
    if (isSOF) {
      if (off + 9 > buf.length) return null;
      return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7), format: "JPEG" };
    }
    off += 2 + len;
  }
  return null;
}

/** 读 SVG 的**固有尺寸**（SVG 没有"像素"，它的尺寸来自 <svg> 标签）：
    先看 width / height 属性，都没有再看 viewBox 的后两个数。
    返回 null = 这个文件不是 SVG（交给调用方按别的格式处理）。 */
function svgSize(buf) {
  const text = buf.toString("utf8", 0, Math.min(buf.length, 64 * 1024));
  const m = text.match(/<svg\b[^>]*>/i);
  if (!m) return null;
  const tag = m[0];
  /** 取属性值。用 (?<![\w:-]) 挡住 stroke-width / stroke-height 这类同尾属性。 */
  const pick = (name) => {
    const dq = tag.match(new RegExp(`(?<![\\w:-])${name}\\s*=\\s*"([^"]*)"`, "i"));
    if (dq) return dq[1];
    const sq = tag.match(new RegExp(`(?<![\\w:-])${name}\\s*=\\s*'([^']*)'`, "i"));
    return sq ? sq[1] : null;
  };
  /** 像素尺寸：纯数字或带 px 后缀都算；百分比 / 其它单位读不出。 */
  const num = (raw) => {
    if (raw === null || raw === undefined) return null;
    const t = String(raw).trim().replace(/px$/i, "");
    if (!/^\d+(?:\.\d+)?$/.test(t)) return null;
    const v = Number(t);
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  const w = num(pick("width"));
  const h = num(pick("height"));
  if (w && h) return { width: w, height: h, format: "SVG" };
  const vb = pick("viewBox");
  if (vb !== null) {
    const parts = String(vb).trim().split(/[\s,]+/).map(Number);
    if (
      parts.length === 4 &&
      parts.every((n) => Number.isFinite(n)) &&
      parts[2] > 0 &&
      parts[3] > 0
    ) {
      return { width: parts[2], height: parts[3], format: "SVG" };
    }
  }
  /* 是 SVG，但读不出尺寸 —— 不能当成"跳过"（跳过 = 塞进无人看守的那一类）。 */
  return { unsupported: "SVG（读不出固有尺寸：既没有 width / height，也没有 viewBox）" };
}

/** 读图片真实尺寸。支持 PNG / JPEG / SVG；别的格式返回 { unsupported: 名称 }，
    由调用方判红（**不许静默跳过**）。 */
function readImageSize(file) {
  let buf;
  try {
    const fd = fs.openSync(file, "r");
    try {
      buf = Buffer.alloc(Math.min(64 * 1024, fs.fstatSync(fd).size));
      fs.readSync(fd, buf, 0, buf.length, 0);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return { unreadable: true };
  }
  const png = pngSize(buf);
  if (png) return png;
  const jpg = jpegSize(buf);
  if (jpg) return jpg;
  const svg = svgSize(buf);
  if (svg) return svg;
  const head = buf.toString("latin1", 0, 16);
  if (head.startsWith("GIF8")) return { unsupported: "GIF" };
  if (head.startsWith("RIFF") && head.slice(8, 12) === "WEBP") return { unsupported: "WebP" };
  if (/^\s*(<\?xml|<!DOCTYPE svg|<svg)/i.test(head)) return { unsupported: "SVG" };
  return { unsupported: "未知格式" };
}

/* ---------------- 主流程 ---------------- */

if (!fs.existsSync(SITE)) {
  console.error("图片资产门禁未通过：\n");
  console.error(`  ✗ 找不到产物目录 ${SITE}（先跑一次 build）。`);
  process.exit(1);
}

const rel = (f) => path.relative(SITE, f).split(path.sep).join("/");

/** 把页面里的一个 URL 解析成产物里的绝对路径；null = 不是本站的图。 */
function localFileOf(url, pageFile) {
  if (!url) return null;
  let s = String(url).split("#")[0].split("?")[0].trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) {
    if (!SITE_URL) return null;
    const root = SITE_URL.toLowerCase();
    const low = s.toLowerCase();
    if (low === root) s = "/";
    else if (low.startsWith(root + "/")) s = s.slice(SITE_URL.length);
    else return null; // 外站图
  } else if (!s.startsWith("/")) {
    s = path.posix.join(path.posix.dirname(rel(pageFile)), s);
  }
  return path.join(SITE, s.replace(/^\/+/, ""));
}

/* 收集所有被引用的图。 */
const pages = htmlFiles(SITE).sort();
/* 每张"应验的图" = 一个站内文件路径（同一张图被引用多次只算一次，
   但每一次引用各自要过 IA2 / IA3 那些逐引用的判据）。 */
const expectedFiles = new Set();
const missingFiles = new Set();   // 站内但文件不存在（<img> 的由门禁 1 负责）
const externalRefs = [];         // 外站图：验不了，但必须报出来
const sizeCache = new Map();     // 文件 → 真实像素（读一次）
let ogRefCount = 0;
let imgRefCount = 0;

function sizeOf(file) {
  if (!sizeCache.has(file)) sizeCache.set(file, readImageSize(file));
  return sizeCache.get(file);
}

/** 登记一次引用；返回该引用的文件路径（null = 外站图）。 */
function register(kind, url, pageFile) {
  const file = localFileOf(url, pageFile);
  if (!file) {
    externalRefs.push({ kind, url, page: rel(pageFile) });
    return null;
  }
  expectedFiles.add(file);
  return file;
}

for (const pageFile of pages) {
  const html = fs.readFileSync(pageFile, "utf8");
  const pageRel = rel(pageFile);

  /* --- 分享卡片图：og:image 家族 + twitter:image --- */
  const ogPairs = pairOgImages(html);
  const twPairs = pairTwitterImages(html);

  /* IA7：分享图声明**必须存在**（逐页）。见文件头 IA7 那段：
     声明消失这一形态 IA1–IA6 抓不到（它们的应验集是从产物里的引用算出来的，
     引用没了应验集跟着空）→ 整条 build 链会 exit 0 全绿。 */
  const missingShare = [];
  if (ogPairs.length === 0) missingShare.push("og:image");
  if (twPairs.length === 0) missingShare.push("twitter:image");
  if (missingShare.length) {
    fail(
      `门禁 IA7：${pageRel} 没有声明 ${missingShare.join(" 与 ")} —— ` +
        `分享到社交平台时没有预览图（分享出去是无图卡片，站点自己看不出来）`
    );
  }

  /* IA8：og:image **不得多于一条**（逐页）。见文件头 IA8 那段：
     多出来的 og:image 是纯多余（抓取器只取第一张），而 IA1–IA7 逐条验的是
     "已经声明出来的那几条" ⇒ 三条各自都对时它们一句都不说。
     ⚠️ 与 IA7 的分工：**0 条**归 IA7、**多于 1 条**归 IA8 ⇒ 同一处缺陷只红一条。 */
  if (IA8_ON && ogPairs.length > 1) {
    fail(
      `门禁 IA8：${pageRel} 声明了 ${ogPairs.length} 条 og:image（` +
        `${ogPairs.map((p) => p.image).join("、")}）—— ` +
        `一个页面只应有一张 og:image：抓取器只取第一张，多出来的既不会被选中，` +
        `也只会让"这一页的 og:image 是哪张"变得不确定（结构化数据引用的也是第一张）。` +
        `多尺寸分享图请挂 twitter:image（X / Twitter 会按比例挑）。`
    );
  }

  for (const p of ogPairs) {
    ogRefCount++;
    const file = register("og:image", p.image, pageFile);
    if (!file) continue;

    /* IA1：文件必须在产物里存在。 */
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      fail(
        `门禁 IA1：${pageRel} 的 og:image 指向 ${p.image} —— ` +
          `产物里没有这个文件（分享卡片会拿到 404，站点自己看不出来）`
      );
      continue;
    }

    /* IA1 附带：og:image 与 og:image:secure_url 必须指向同一个文件。 */
    if (p.secure_url !== null) {
      const secureFile = localFileOf(p.secure_url, pageFile);
      if (secureFile && path.resolve(secureFile) !== path.resolve(file)) {
        fail(
          `门禁 IA1：${pageRel} 的 og:image 与 og:image:secure_url 指向不同的文件 —— ` +
            `${p.image} vs ${p.secure_url}（抓取器按 secure_url 取图，取到的是另一张）`
        );
      }
    }

    /* IA5：分享图必须是**位图**。
       ⚠️ 内容里的 <img> 允许 SVG（2026-10-21 扩展，见文件头 IA5），
       但分享图不行 —— 社交平台（微信 / Twitter / Facebook / LinkedIn）
       不解析 SVG，拿到的是一张空白卡片。 */
    const size = sizeOf(file);
    if (size.format === "SVG") {
      fail(
        `门禁 IA5：${pageRel} 的 og:image ${p.image} 是 SVG —— ` +
          `分享卡片图必须是位图（PNG / JPEG）：社交平台不解析 SVG，这张卡片会没有预览图`
      );
      continue;
    }
    if (size.unsupported) {
      fail(
        `门禁 IA5：${pageRel} 的 og:image ${p.image} 是 ${size.unsupported} —— ` +
          `本门禁只读得出 PNG / JPEG 的真实像素，请扩展本门禁或改用 PNG / JPEG`
      );
      continue;
    }
    if (size.unreadable) {
      fail(`门禁 IA5：${pageRel} 的 og:image ${p.image} 读不出来（文件不可读）`);
      continue;
    }

    /* IA2：声明的宽高必须存在，且与真实像素逐字相等。 */
    if (p.width === null || p.height === null) {
      fail(
        `门禁 IA2：${pageRel} 的 og:image ${p.image} 缺少 ` +
          `${p.width === null ? "og:image:width" : "og:image:height"} —— ` +
          `平台按这两个数取尺寸，缺一个就取不准`
      );
    } else {
      const w = Number(p.width);
      const h = Number(p.height);
      if (!Number.isFinite(w) || !Number.isFinite(h)) {
        fail(
          `门禁 IA2：${pageRel} 的 og:image ${p.image} 的声明尺寸不是数字 —— ` +
            `og:image:width="${p.width}" og:image:height="${p.height}"`
        );
      } else if (w !== size.width || h !== size.height) {
        fail(
          `门禁 IA2：${pageRel} 的 og:image ${p.image} 声明 ${w}×${h}，` +
            `而文件真实像素是 ${size.width}×${size.height} —— ` +
            `平台按声明的尺寸取图，尺寸对不上就是一张错卡`
        );
      }
    }

    /* IA3：og:image:alt 必须存在且非空。 */
    if (p.alt === null || String(p.alt).trim() === "") {
      fail(
        `门禁 IA3：${pageRel} 的 og:image ${p.image} 没有非空的 og:image:alt —— ` +
          `分享卡片没有替代文字`
      );
    }
  }

  /* twitter 侧**逐条**验（IA1 文件存在 / IA3 alt 非空）。
     逐条是必须的：D2 修完之后，正方形与横幅这两张分享图**只挂在 twitter 侧**
     （og 那边只留一张）⇒ 只验第一条的话，这两张就没人验了。 */
  for (const t of twPairs) {
    ogRefCount++;
    const file = register("twitter:image", t.image, pageFile);
    if (!file) continue;
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      fail(
        `门禁 IA1：${pageRel} 的 twitter:image 指向 ${t.image} —— ` +
          `产物里没有这个文件（分享卡片会拿到 404）`
      );
    }
    /* IA3：twitter:image:alt 必须存在且非空。 */
    if (t.alt === null || String(t.alt).trim() === "") {
      fail(
        `门禁 IA3：${pageRel} 的 twitter:image ${t.image} 没有非空的 twitter:image:alt`
      );
    }
  }

  /* --- 页面里的 <img> --- */
  for (const tag of realImgTags(html)) {
    const src = attrOf(tag, "src");
    if (!src) continue;
    imgRefCount++;
    const file = register("<img>", src, pageFile);
    if (!file) continue;
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      /* href/src 能不能找到文件是门禁 1 的活（og 那边不在它的扫描面里，
         所以 IA1 自己查）。这里不重复判红，只记下来。 */
      missingFiles.add(file);
      continue;
    }
    const size = sizeOf(file);
    if (size.unsupported) {
      fail(
        `门禁 IA5：${pageRel} 的 <img src="${src}"> 是 ${size.unsupported} —— ` +
          `本门禁只读得出 PNG / JPEG / SVG 的真实尺寸，请扩展本门禁或改用这三种格式`
      );
      continue;
    }
    if (size.unreadable) {
      fail(`门禁 IA5：${pageRel} 的 <img src="${src}"> 读不出来（文件不可读）`);
      continue;
    }
    /* IA4：width / height 属性与真实像素必须等比。 */
    const dw = attrOf(tag, "width");
    const dh = attrOf(tag, "height");
    if (dw === null || dh === null) {
      /* 属性**存在性**是门禁 26 的活，这里不重复判红。 */
      continue;
    }
    const w = Number(dw);
    const h = Number(dh);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
      fail(
        `门禁 IA4：${pageRel} 的 <img src="${src}"> 的 width/height 不是正数 —— ` +
          `width="${dw}" height="${dh}"`
      );
      continue;
    }
    /* 交叉相乘比比例，容差 1%（浮点与四舍五入余量）。 */
    const lhs = w * size.height;
    const rhs = h * size.width;
    if (Math.abs(lhs - rhs) / Math.max(lhs, rhs) > 0.01) {
      const realSize =
        size.format === "SVG"
          ? `而文件的固有尺寸（width / height 或 viewBox）是 ${size.width}×${size.height}`
          : `而文件真实像素是 ${size.width}×${size.height}`;
      fail(
        `门禁 IA4：${pageRel} 的 <img src="${src}"> 声明 ${w}×${h}，` +
          `${realSize} —— ` +
          `预留的比例是错的，布局照样会跳`
      );
    }
  }
}

/* ---------------- IA6：自证覆盖量 ---------------- */
/* 应验 = 站内被引用且文件存在的图；实测 = 本门禁真的读出了真实像素的图。
   两者必须相等且不为 0 —— 否则本门禁在"什么都没验"的情况下判绿，
   那就是**空跑**，空跑的门禁等于没有门禁。 */
const verifiable = [...expectedFiles].filter(
  (f) => fs.existsSync(f) && fs.statSync(f).isFile()
);
let verified = 0;
for (const f of verifiable) {
  const s = sizeOf(f);
  if (s.width && s.height) verified++;
}
if (verifiable.length === 0) {
  fail(
    "门禁 IA6：产物里一张被引用的站内图都没找到 —— " +
      "本门禁在这种情况下等于**空跑**，空跑的门禁等于没有门禁，所以判红"
  );
} else if (verified !== verifiable.length) {
  const unread = verifiable.filter((f) => {
    const s = sizeOf(f);
    return !(s.width && s.height);
  });
  fail(
    `门禁 IA6：应验 ${verifiable.length} 张图，只验出 ${verified} 张 —— ` +
      `本门禁等于**空跑**，空跑的门禁等于没有门禁，所以判红。` +
      `没验出来的：${unread.map((f) => rel(f)).join("、")}`
  );
}

/* ---------------- 汇总 ---------------- */
if (externalRefs.length) {
  note(
    `门禁 IA1：外站图 ${externalRefs.length} 处（本地无法验像素，已跳过）：` +
      externalRefs.map((r) => `${r.page} ${r.kind} ${r.url}`).join("；")
  );
}
if (missingFiles.size) {
  note(
    `门禁 IA1：${missingFiles.size} 张 <img> 引用的文件在产物里不存在` +
      `（由门禁 1 负责判红，这里只记一笔）：` +
      [...missingFiles].map((f) => rel(f)).join("、")
  );
}
if (!problems.length) {
  note(
    `门禁 IA1–IA8：共验 ${verifiable.length} 张图` +
      `（分享图引用 ${ogRefCount} 处、页面图引用 ${imgRefCount} 处；` +
      `同一张图被引用多次只读一次字节；每页 og:image 恰好 1 条 —— ` +
      `IA7 管不少于 1 条、IA8 管不多于 1 条）`
  );
}

if (notes.length) {
  console.log("—");
  notes.forEach((n) => console.log(`  · ${n}`));
}
if (problems.length) {
  console.error(`\n✗ 图片资产自检未通过，共 ${problems.length} 个问题：`);
  problems.forEach((p) => console.error("  " + p));
  process.exit(1);
}
console.log("✓ 图片资产自检通过（门禁 IA1–IA8：分享图与页面图的声明 ↔ 实物一致，每页 og:image 恰好 1 条）");
