#!/usr/bin/env node
/**
 * 门禁 SX1–SX6：响应式图片声明（srcset / imagesrcset）的候选资源必须真的存在
 *
 * 为什么要有这个门禁（一次实测坐实的看护缺口，不是假想）：
 *   本站有 **2 处响应式图片声明**（产物实测：首页与关于页的作者肖像各一处
 *   `<img srcset>`，共 **4 个候选 URL**）。浏览器会**按视口宽 / 设备像素比**
 *   从候选里挑一张去请求 ⇒ **候选断链 = 那个宽度下直接断图**。
 *   而本站这两张肖像带 `loading="eager"` + `fetchpriority="high"`
 *   ⇒ 它们就是 **LCP 元素** ⇒ 候选断链 = LCP 直接失败。
 *
 *   而 **srcset 里的候选 URL 从来没被任何一道门禁核过**。实测（全仓门禁逐条看过）：
 *     · `scripts/verify-site.cjs` 的通用引用正则
 *       `/(?:href|src)\s*=\s*"([^"]*)"/gi` —— **匹配不到 `srcset`**：
 *       `srcset` 里 `src` 后面跟的是 `set=` 而不是 `=`，正则要求属性名后紧跟 `=`
 *       ⇒ 整条声明在它眼里**根本不存在**。
 *     · `scripts/check-404-depth.cjs` 确实读了 `href|src|srcset` 三个属性，
 *       但它**只判路径形态**（404 页必须根绝对 / 其余页面必须相对），**不判存在性**。
 *     · `scripts/check-third-party.cjs` 确实扫 `img[src|srcset]`，
 *       但它**只判外域**（TD1）；站内断链不归它管。
 *     · `scripts/check-image-assets.cjs` 只管 og:image / twitter:image
 *       装在 `content` 属性里的**分享图**（IA1–IA7），**不看 `<img>` 的 srcset**。
 *
 *   ⇒ **实测坐实**（本轮做的）：把首页肖像的 600w 候选改成
 *     `assets/img/author/mh-d43-missing.jpg`（副本里确实不存在），
 *     对该副本跑 **14 道产物侧门禁**（verify-site / check-image-assets /
 *     check-404-depth / check-a11y / check-third-party / check-site-js /
 *     check-block-language / check-site-language / check-lang / check-jsonld /
 *     check-home-chart / check-figure-cover / check-tool-routes / check-copy-export）
 *     ⇒ **14 道全部 exit 0**，没有任何一道报告这件事。
 *
 *   ⇒ 这不是「产物现在有违规」，而是**看护缺口**。实测改动前产物现状：
 *     · 2 处 srcset 声明、4 个候选 URL **全部**落到真实存在的产物文件；
 *     · 描述符**合法**，且没有混用宽度（`w`）与密度（`x`）；
 *     · 两处 `<img>` 都带了 `src` 兜底；
 *     ⇒ 现状**满足**，缺的只是**看守**。所以本轮改的是门禁，不是构造层 ——
 *       站内一个字都不改，产物零变化。
 *
 * 六条判据（编号用独立字母体系 SX*，**不与既有前缀冲突**：
 *   其余各族 check-site-js 的 JS*、check-image-assets 的 IA*、
 *   check-blog-frontmatter 的 F*、check-about-dataset 的 AP*、
 *   check-navigation-contract 的 NA*、check-third-party 的 TD*、
 *   check-home-chart 的 HC*、check-page-deps 的 LM*、check-gates-wired 的 GW*、
 *   check-readme 的 RD*、check-doc-snapshot 的 DS*、check-site-language 的 … 均不同名；
 *   注意 docs/lighthouse/*.json 里已有 Lighthouse 审计 id SJ0/SJ1/SJ3/SJ5/SJ8/SJ9，
 *   那是**另一种东西**，本门禁刻意避开 SJ* 以免同形混淆）：
 *   SX1 `srcset` / `imagesrcset` 的**每个候选 URL** 必须落到**真实存在的产物文件**
 *      —— 按**页面 URL 口径**解析（`srcset` 的 URL 相对**文档**解析，与 `src` 同口径）。
 *      外域候选不判：外域由 check-third-party 的 TD1 判红，本门禁不重复判。
 *   SX2 带 `srcset` 的 `<img>` 必须同时有**非空的 `src`** ——
 *      `src` 是 `<img>` 的规范兜底属性（HTML 校验器报 `missing required attribute src`）；
 *      `srcset` 是在它之上的**增强**，不能替代它。
 *   SX3 `srcset` 声明**不得为空** —— 空的候选列表会被浏览器整条忽略，等于没写。
 *   SX4 **描述符**必须合法，且同一候选列表里**不得混用宽度（`w`）与密度（`x`）** ——
 *      按 HTML 规范，混用会让**整条声明被忽略**（不是只忽略那一个候选）。
 *   SX5 **覆盖度自证** —— 产物里一处 `srcset` 声明都没有 ⇒ 说明枚举器坏了，
 *      不是「没问题」；同时报出 img / source / link 三类来源各有多少处。
 *   SX6 **门禁自己没被卸掉** —— package.json 的 build 链里必须真的有本门禁。
 *
 * ⚠️ 门禁**守不了什么**（写清楚，不藏）：
 *   · 只判**存在性与声明合法性** —— **不判渲染**。图片会不会被裁坏、
 *     宽高比对不对，属于「交互类/视觉类要不要配常驻浏览器门禁」的范围，
 *     是**待拍板 42** 的事，本门禁不代拍。
 *   · **不判外域候选**：外域 srcset 由 check-third-party 的 TD1 判红。
 *   · **含 `data:` URI 的声明整条跳过**（只计数并出提示）：
 *     `data:` URI 自身含逗号，按逗号切分候选会把它切碎 ⇒ 切出来的「候选」
 *     根本不是浏览器会请求的 URL ⇒ 判存在性必然误报。
 *   · **只看静态 HTML**：JS 运行时写出来的 `srcset` 判不了（本站没有这种用法）。
 *   · **候选是否被浏览器真正选中**（比如视口宽度落在哪一档）不判 ——
 *     本门禁只保证「**每个**候选都存在」，不管选哪个。
 *
 * ⚠️ 为什么**只判产物**（_site）而不是源码：
 *   浏览器加载的是**产物**。产物的路径（相对/绝对、根相对）由 Eleventy 的 relUrl
 *   过滤器在渲染时改写，源码里的写法与访客实际请求的 URL 不是一回事。
 *   ⇒ 判产物 = 判访客真正经历的那件事，也免去源↔产物路径映射的维护负担。
 *
 * 环境变量（自测要在**副本**上注入缺陷，不能改仓库里的真文件）：
 *   SITE_DIR  —— 产物目录（默认 _site）
 *   PKG_PATH  —— package.json 的路径（默认仓库根的 package.json）——
 *                自测用它证明 SX6「门禁自己被卸掉」那条判据真的在起作用。
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITE = process.env.SITE_DIR ? path.resolve(process.env.SITE_DIR) : path.join(ROOT, "_site");
const PKG = process.env.PKG_PATH ? path.resolve(process.env.PKG_PATH) : path.join(ROOT, "package.json");
const SELF = path.basename(__filename);

/* 判据开关：存在的唯一理由是自测的负对照要把某一条判据**单独**卸掉，
   证明「那一档的红确实来自这一条判据本身」。默认值恒为 true。 */
const SX1_ON = true;
const SX2_ON = true;
const SX3_ON = true;
const SX4_ON = true;
const SX5_ON = true;
const SX6_ON = true;

/* SX5 的覆盖度下限（只要产物里有响应式图片就该成立；
   低于这个数说明枚举逻辑坏了，不是「没问题」）。 */
const MIN_SRCSET_ATTRS = 1;

const problems = [];
/** 记一条判红。 */
function fail(msg) {
  problems.push(msg);
}
/** 打印全部判红并退出。 */
function report() {
  console.error("响应式图片门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

/* ================= 工具：产物枚举 ================= */

function walk(dir, acc) {
  acc = acc || [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (e.name.startsWith("._")) continue; // exFAT 上的 AppleDouble 资源叉
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

function lineOf(text, index) {
  let n = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === "\n") n++;
  return n;
}

/* ================= 工具：HTML 标签扫描（自带，不 import 被检查方代码） ================= */

/** 把一段文本里的换行留下、其余换成空格 ⇒ 长度与行号都不变。 */
function blankOut(s) {
  return s.replace(/[^\n]/g, " ");
}

/**
 * 先把三类「里面不该出现标签」的噪声抹掉，**保持长度不变**（行号不漂）：
 *   · HTML 注释 `<!-- ... -->`
 *   · `<script>` / `<style>` 的原始文本内容（里面的 `<` 不是标签）
 */
function stripNoise(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, blankOut)
    .replace(/<script\b[\s\S]*?<\/script>/gi, blankOut)
    .replace(/<style\b[\s\S]*?<\/style>/gi, blankOut);
}

/**
 * 顺序扫标签：**跳过整个标签区域**（含引号内的内容），
 * ⇒ 属性值里出现的 `<img ...>` 不会被误当成真标签。
 */
function scanTags(html, wanted) {
  const out = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) break;
    const m = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(lt, lt + 32));
    if (!m) {
      i = lt + 1;
      continue;
    }
    let j = lt + m[0].length;
    let quote = null;
    while (j < html.length) {
      const ch = html[j];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === ">") break;
      j++;
    }
    const tag = m[1].toLowerCase();
    if (wanted.has(tag)) {
      out.push({ tag, attrSrc: html.slice(lt + m[0].length, j), start: lt });
    }
    i = j + 1; // 关键：跨过整个标签，别把属性值里的 '<' 当成新标签
  }
  return out;
}

/** 解析标签的属性区。引号值整体被吃掉，值里的 '=' 不会拆散属性。 */
function parseAttrs(attrSrc) {
  const attrs = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(attrSrc)) !== null) {
    const name = m[1].toLowerCase();
    if (attrs[name] !== undefined) continue; // 重复属性取第一个
    if (m[2] !== undefined) attrs[name] = m[2];
    else if (m[3] !== undefined) attrs[name] = m[3];
    else if (m[4] !== undefined) attrs[name] = m[4];
    else attrs[name] = "";
  }
  return attrs;
}

/* ================= 工具：srcset 候选解析 ================= */

const WIDTH_RE = /^(\d+)w$/;
const DENSITY_RE = /^(\d+(?:\.\d+)?|\.\d+)x$/;

/**
 * 把一条 srcset 的取值拆成候选。
 * srcset 的每一项是「URL + 可选描述符」，项之间用逗号分隔。
 * 返回 [{url, desc}]
 */
function parseSrcset(value) {
  const items = [];
  for (const part of String(value).split(",")) {
    const seg = part.trim();
    if (!seg) continue;
    const sp = seg.indexOf(" ");
    if (sp < 0) items.push({ url: seg, desc: "" });
    else items.push({ url: seg.slice(0, sp), desc: seg.slice(sp + 1).trim() });
  }
  return items;
}

/* ================= 工具：URL 解析 ================= */

const EXTERNAL_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const SELF_CONTAINED_RE = /^(?:data|blob|about):/i;

/**
 * 把一个候选 URL 解析成产物里的文件。
 * 返回 {kind, file} —— kind: "file" / "external" / "selfcontained" / "bad"
 *   · file          —— 站内路径，file 是解析后的绝对路径（可能不存在）
 *   · external      —— 外域（交给 check-third-party）
 *   · selfcontained —— data:/blob:/about:，自包含
 *   · bad           —— 空 URL
 */
function resolveCandidate(pageFile, raw) {
  let clean = String(raw).trim();
  if (!clean) return { kind: "bad" };
  clean = clean.split("#")[0].split("?")[0].trim();
  if (!clean) return { kind: "bad" };
  if (SELF_CONTAINED_RE.test(clean)) return { kind: "selfcontained" };
  if (EXTERNAL_RE.test(clean)) return { kind: "external" };

  const base = path.dirname(pageFile);
  const target = clean.startsWith("/")
    ? path.join(SITE, clean.slice(1))
    : path.resolve(base, clean);
  return { kind: "file", file: target };
}

/* ================= 产物清单 ================= */

if (!fs.existsSync(SITE)) {
  console.error("响应式图片门禁未通过：\n");
  console.error(`  ✗ 找不到产物目录 ${SITE} —— 先跑 npm run build 再跑本门禁。`);
  console.error("");
  process.exit(1);
}

const allFiles = walk(SITE);
const htmlFiles = allFiles
  .filter((f) => path.extname(f).toLowerCase() === ".html")
  .sort();

/* 取值来源：img[srcset] / source[srcset] / link[imagesrcset] */
const SOURCE_ATTR = {
  img: "srcset",
  source: "srcset",
  link: "imagesrcset",
};
const WANTED_TAGS = new Set(Object.keys(SOURCE_ATTR));

/* 计数（覆盖度自证用，SX5） */
let countAttrs = 0;
let countCandidates = 0;
let countDataUri = 0;
const countByKind = { img: 0, source: 0, link: 0 };

/* ================= 扫 HTML：收集响应式图片声明 ================= */

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf8");
  const clean = stripNoise(html);
  const pageRel = path.relative(SITE, file).split(path.sep).join("/");

  for (const t of scanTags(clean, WANTED_TAGS)) {
    const attrs = parseAttrs(t.attrSrc);
    const attrName = SOURCE_ATTR[t.tag];
    const raw = attrs[attrName];
    if (raw === undefined) continue;

    countAttrs++;
    countByKind[t.tag]++;
    const line = lineOf(html, t.start);

    /* SX3：空声明 */
    const candidates = parseSrcset(raw);
    if (!candidates.length) {
      if (SX3_ON) {
        fail(
          `${pageRel}:${line}：<${t.tag} ${attrName}="${raw}"> 的候选列表是**空的** —— ` +
            `浏览器会整条忽略这条声明，等于没写。`
        );
      }
      continue;
    }

    /* data: URI：整条跳过（切分会碎，只计数并提示） */
    if (/\bdata:/i.test(raw)) {
      countDataUri++;
      continue;
    }

    /* SX2：<img> 必须有 src 兜底 */
    if (t.tag === "img" && SX2_ON) {
      const src = attrs.src;
      if (src === undefined || !src.trim()) {
        fail(
          `${pageRel}:${line}：<img> 带了 ${attrName} 却没有**非空的 src** —— ` +
            `src 是 <img> 的规范兜底属性（HTML 校验器报 missing required attribute src），` +
            `srcset 只是在它之上的增强，不能替代它。`
        );
      }
    }

    /* SX4：描述符合法 + 不得混用 w 与 x */
    if (SX4_ON) {
      let hasW = false;
      let hasX = false;
      for (const c of candidates) {
        if (!c.desc) continue;
        if (WIDTH_RE.test(c.desc)) {
          hasW = true;
        } else if (DENSITY_RE.test(c.desc)) {
          hasX = true;
        } else {
          fail(
            `${pageRel}:${line}：<${t.tag} ${attrName}> 里的描述符「${c.desc}」不合法 —— ` +
              `只能是「<宽度>w」（如 300w）、「<密度>x」（如 2x）或不写描述符。`
          );
        }
      }
      if (hasW && hasX) {
        fail(
          `${pageRel}:${line}：<${t.tag} ${attrName}> 的候选列表里**同时**用了宽度描述符（w）` +
            `与密度描述符（x）—— 按 HTML 规范，混用会让**整条声明被浏览器忽略**。`
        );
      }
    }

    /* SX1：每个候选都必须落到真实存在的产物文件 */
    for (const c of candidates) {
      countCandidates++;
      const r = resolveCandidate(file, c.url);
      if (r.kind === "external") continue; // 外域归 check-third-party 的 TD1
      if (r.kind === "selfcontained") continue;
      if (r.kind === "bad") {
        if (SX1_ON) {
          fail(
            `${pageRel}:${line}：<${t.tag} ${attrName}> 里有**空 URL** 的候选 —— ` +
              `浏览器会跳过它，但这条声明已经写坏了。`
          );
        }
        continue;
      }
      if (!fs.existsSync(r.file) || !fs.statSync(r.file).isFile()) {
        if (SX1_ON) {
          fail(
            `${pageRel}:${line}：<${t.tag} ${attrName}> 里的候选「${c.url}」解析成 ` +
              `${path.relative(SITE, r.file).split(path.sep).join("/")}，` +
              `但产物里**没有这个文件** —— 浏览器按视口宽 / 设备像素比挑中它时直接断图` +
              `（本站这两张肖像带 loading="eager" + fetchpriority="high"，就是 LCP 元素）。`
          );
        }
      }
    }
  }
}

/* ================= SX5：覆盖度自证 ================= */

if (SX5_ON && countAttrs < MIN_SRCSET_ATTRS) {
  fail(
    `本门禁一处都没比过（产物里 ${countAttrs} 处 srcset / imagesrcset 声明）—— ` +
      `判据没有落到任何东西上，直接判红。`
  );
}

/* ================= SX6：门禁自己没被卸掉 ================= */

if (SX6_ON) {
  let pkg = null;
  try {
    pkg = JSON.parse(fs.readFileSync(PKG, "utf8"));
  } catch (e) {
    fail(`读不到 package.json（${e.message}）—— 无法确认本门禁接在 build 链上。`);
  }
  if (pkg) {
    const SCRIPTS = pkg.scripts || {};
    const NPM_RUN_RE = /\bnpm\s+run\s+([A-Za-z0-9:_-]+)/g;
    const seen = new Set();
    const queue = ["build"];
    while (queue.length) {
      const name = queue.shift();
      if (seen.has(name)) continue;
      seen.add(name);
      const cmd = SCRIPTS[name] || "";
      NPM_RUN_RE.lastIndex = 0;
      let m;
      while ((m = NPM_RUN_RE.exec(cmd)) !== null) {
        if (SCRIPTS[m[1]] !== undefined) queue.push(m[1]);
      }
    }
    const wired = Object.keys(SCRIPTS).filter(
      (n) => seen.has(n) && (SCRIPTS[n] || "").includes(SELF)
    );
    if (!wired.length) {
      fail(`门禁自己被卸掉了：package.json 的 build 链里没有指向 scripts/${SELF} 的 script。`);
    }
  }
}

/* ================= 汇总 ================= */

if (problems.length) report();

const dataNote = countDataUri ? `，另有 ${countDataUri} 处含 data: URI 的声明（无法可靠切分，未判存在性）` : "";
console.log(
  `响应式图片门禁通过：产物 ${htmlFiles.length} 个页面里 ${countAttrs} 处响应式图片声明` +
    `（img ${countByKind.img} / source ${countByKind.source} / link ${countByKind.link}）、` +
    `${countCandidates} 个候选 URL 全部落到真实存在的产物文件；` +
    `描述符合法（未混用宽度与密度）${dataNote}；本门禁接在 build 链上。`
);
