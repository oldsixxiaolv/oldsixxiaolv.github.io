#!/usr/bin/env node
/**
 * 图片资产门禁的**自测**（注入矩阵）—— 证明 IA1–IA8 每一条都**能变红**。
 *
 * 为什么要有这个自测（缺陷 D59 的第一批，2026-10-21 D57 场次）：
 *   一条**永远不会红**的判据，给出的是"看起来很确定的绿"——它比没有判据更坏，
 *   因为它把"盲区"包装成"已核过"。而"判据能不能变红"这件事，**只有注入能证明**：
 *   读源码看不出 `ogPairs.length > 1` 这个条件在真实产物上会不会触发、
 *   `pairTwitterImages()` 会不会把 alt 配错、`localFileOf()` 会不会把站内图
 *   误判成外站图 —— 这些**只有跑起来才知道**。
 *   本仓已经吃过这一族亏：D51 查出三处 JS 空转、D52 查出死 CSS 门禁只守一张样式表、
 *   D56 给 IA8 加判据时也只能靠当场的 `/tmp` 注入矩阵证明它会红 ——
 *   **矩阵跑完即弃，仓库里没有任何东西保证它下次还在**。
 *   ⇒ 本脚本把那套矩阵**固化进仓库**，接在 build 链上。
 *
 * 做法：在**自造的最小夹具站**（两个页面 + 一张自造 PNG + 一个自造 SVG）上逐档注入缺陷，
 *   用环境变量把门禁指向夹具产物，断言门禁**报出的红因编号集合与预期完全相等**。
 *   ⚠️ 全程**不动仓库里的任何文件** —— 注入只在临时目录的副本上做。
 *     （这正是门禁里留 SITE_DIR 这个开关的原因：没有它，自测就只能去改 _site，
 *       改坏了就是事故，也会和并发的 build 抢同一个目录。）
 *   ⚠️ **不 require 被测门禁的代码**：门禁以**子进程**方式运行，
 *     本脚本只看它的**行为**（exit code + stderr 上的红因编号）。
 *
 * 二十档：
 *   IM0  基线（原样）                     → 必须**全绿**（证明这套判据不是空跑）
 *   IM1  og:image 指向不存在的文件         → IA1
 *   IM2  第二条 twitter:image 指向不存在的文件 → IA1（**逐条**验 twitter 的证据）
 *   IM3  og:image:width 写错              → IA2
 *   IM4  og:image:alt 清空                → IA3
 *   IM5  第二条 twitter:image 的 alt 清空   → IA3（**逐条**验 twitter 的证据）
 *   IM6  <img> 声明的比例与真实像素不等比   → IA4
 *   IM7  og:image 指向 SVG                 → IA5
 *   IM8  站内图引用全改成外站（可验集为空） → IA6（**覆盖度自证**：门禁自己空跑必须红）
 *        ⚠️ 两页都要改（门禁的应验集是全站算出来的）
 *   IM9  删掉 og:image 声明                → IA7
 *   IM10 注入一条**完全合法**的第二条 og:image → IA8
 *   IM11 同样的注入放在**另一个页面**       → IA8（证明**逐页**生效，并指名那个页面）
 *   IM12 **故意判绿**：<style> 块与 HTML 注释里的假 <img> 指向真实存在但比例错的图
 *        → 必须仍然判绿（证明门禁剔除了这两处"看起来是图、其实不是图"的来源）
 *   IM13 **判据级负对照**：门禁**副本**把 IA8 判定卸掉 + IM10 的注入 → 必须**转绿**
 *   IM14 分享图**超过 200 KB 上限**        → IA9（体积判据）
 *   IM15 og:image:type 与真实格式不符      → IA10（PNG 却声明 image/jpeg）
 *   IM16 og:image:type **整个缺失**         → IA10（缺声明也判红）
 *   IM17 **空跑防护**：站内分享图引用全变成外站 → IA9 + IA10
 *        （门禁在"什么都没量到"时必须自己判红，而不是安静地给一个假绿）
 *   IM18 **判据级负对照**：门禁副本把 IA9 判定卸掉 + IM14 的注入 → 必须**转绿**
 *   IM19 **判据级负对照**：门禁副本把 IA10 判定卸掉 + IM15 的注入 → 必须**转绿**
 *
 * 两处必须说清的诚实边界（写在这里，别当成漏网）：
 *   ① **IM10 / IM11 的注入是完全合法的**（第二条 og:image 指向真实存在、尺寸与
 *      真实像素一致、alt 非空）—— 它之所以该红，**只**因为"一个页面只应有一张
 *      og:image"这条**数量**判据。若哪天有人认为多张 og:image 是合法的，
 *      IM10 / IM11 会先红，那时该改的是门禁的判据，不是本自测。
 *   ② **IM8 的红因集合必然是 `{IA6, IA9, IA10}`**，不只是 `{IA6}`。
 *      IA6 的另一个分支（"应验 N 张、只验出 M 张"）**无法单独触发** ——
 *      能让一张图"存在但读不出尺寸"的文件形态，IA5 一定同时红
 *      （IA5 对"格式不支持"和"读不出来"都判红）⇒ 那两档的预期红因集合必然是
 *      `{IA5, IA6}`。
 *      而 IA6 这一支（"一张可验的图都没有"）要求**全站**本地图引用都断掉 ——
 *      og / twitter 的引用断了 ⇒ **一张分享图都没量到**（IA9 的空跑防护）
 *      ⇒ **一条 og:image:type 都没比对过**（IA10 的空跑防护）⇒ 三条必然一起红。
 *      这是**门禁判据之间的结构性依赖**，不是本自测偷懒。
 *      ⚠️ 本自测**不**把这条依赖藏起来：IM8 的期望集合就写成 `{IA6, IA9, IA10}`，
 *        并在这里说明它为什么必然这么长。
 *      ⇒ 单独证明 IA9 / IA10 空跑防护的那一档是 **IM17**：它只把 og / twitter
 *        改成外站、页面正文里的 <img> 仍指向站内 PNG ⇒ IA6 保持绿，
 *        只剩 `{IA9, IA10}`。
 *
 * 用法：node scripts/test-image-assets.cjs
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-image-assets.cjs");
const SITE_JS = path.join(ROOT, "src", "_data", "site.js");
const IDENTITY = path.join(ROOT, "scripts", "lib", "identity.cjs");

/* 站点地址取自真源（不写死）：门禁判定"站内 / 外站"就是拿它当基准，
   写死就会在换域名那天**静默失效**。 */
const siteData = require(SITE_JS);
const SITE_URL = String((siteData && siteData.url) || "").replace(/\/+$/, "");
if (!SITE_URL) {
  console.error("图片资产门禁自测失败：真源 src/_data/site.js 里没有 url —— 门禁判「站内 / 外站」没有基准。");
  process.exit(1);
}

/* 夹具里用的路径与尺寸（与真实站点一致：1200×630 的分享图） */
const PNG_W = 1200;
const PNG_H = 630;
const OG_PNG = "/assets/img/og/og-1200x630.png";
const OG_SVG = "/assets/img/og/og-square.svg";
const MISSING = "/assets/img/og/og-missing.png";
const EXTERNAL = "https://example.com/not-ours.png";

/* ---------------- 工具 ---------------- */

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

/** 把像素数据组装成一张**真实可读**的 PNG。 */
function pngFromRaw(raw, width, height) {
  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  }
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * 自造一张**真实可读**的 PNG（门禁要读 IHDR 里的真实像素）。
 * 为什么自造而不是抄 _site 里的真图：
 *   ① 自测于是**不依赖 build 产物** —— 没跑过 build 也能单独跑；
 *   ② 夹具站因此是**自足的最小站**，任何一档的失败都只可能来自被测判据。
 * ⚠️ 自造的 PNG 一旦坏了，**每一档都会以看不懂的方式失败** ⇒ 写完当场回读校验。
 */
function makePng(width, height) {
  const row = Buffer.alloc(1 + width * 3); // filter byte 0 + RGB
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return pngFromRaw(raw, width, height);
}

/**
 * 自造一张**真的很大**的 PNG（IA9 的体积上限那档要用）。
 * ⚠️ 为什么不能用零像素凑大小：deflate 会把重复行压回几 KB ⇒ 那样造出来的
 *   "大文件"是假的（真实字节数根本没超上限）⇒ 那一档会变成"注入没生效"。
 *   真实的大图之所以大，就是因为像素**不可压缩** —— 这里用确定性伪随机像素
 *   （固定 LCG 种子 ⇒ 每次跑出来都一样，可复现）。
 */
function makeBigPng(width, height) {
  const rowBytes = 1 + width * 3;
  const raw = Buffer.alloc(height * rowBytes);
  let seed = 0x2f6e2b1 >>> 0;
  for (let y = 0; y < height; y++) {
    const off = y * rowBytes;
    for (let i = 1; i < rowBytes; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      raw[off + i] = (seed >>> 24) & 0xff;
    }
  }
  return pngFromRaw(raw, width, height);
}

/** 自造 SVG（1080×1080）—— IA5 那档要它当"分享图不是位图"的证据。 */
const SVG_TEXT =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" ' +
  'viewBox="0 0 1080 1080"><rect width="1080" height="1080" fill="#ff8e4d"/></svg>\n';

/**
 * 夹具页面。
 * ⚠️ 两处**故意放的假 <img>**：
 *   <style> 块里与 HTML 注释里各有一个 —— 门禁必须把这两处剔掉，
 *   否则它们会被当成真的 <img> 去验（IM12 那档专门盯这件事）。
 * ⚠️ og / twitter 块用**标记注释**圈起来：注入要能**只动其中一块**，
 *   否则"把 og 换成坏地址"会连 twitter 一起换掉 ⇒ twitter 那张真图也没了 ⇒
 *   可验集清空 ⇒ IA6 跟着一起红 ⇒ 红因归属就不纯了。
 */
function fixturePage(fakeSrc) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Fixture</title>
<!--OG-->
<meta property="og:image" content="${SITE_URL}${OG_PNG}" />
<meta property="og:image:secure_url" content="${SITE_URL}${OG_PNG}" />
<meta property="og:image:type" content="image/png" />
<meta property="og:image:width" content="${PNG_W}" />
<meta property="og:image:height" content="${PNG_H}" />
<meta property="og:image:alt" content="Fixture share card" />
<!--/OG-->
<!--TW-->
<meta name="twitter:image" content="${SITE_URL}${OG_PNG}" />
<meta name="twitter:image:alt" content="Fixture share card" />
<!--/TW-->
<style>/* 假 img（门禁必须剔掉 <style> 块）：<img src="${fakeSrc}" width="1" height="1"> */</style>
<!-- 假 img（门禁必须剔掉 HTML 注释）：<img src="${fakeSrc}" width="1" height="1"> -->
</head>
<body>
<h1>Fixture</h1>
<img src="${OG_PNG}" width="${PNG_W}" height="${PNG_H}" alt="Fixture page image" />
</body>
</html>
`;
}

/** 在 `<!--NAME-->` 与 `<!--/NAME-->` 之间做替换；**注入没生效就直接失败**。 */
function inBlock(text, name, fn) {
  const re = new RegExp(`(<!--${name}-->)([\\s\\S]*?)(<!--/${name}-->)`);
  const m = text.match(re);
  if (!m) {
    console.error(`图片资产门禁自测失败：夹具里找不到 ${name} 块（夹具形态变了）。`);
    process.exit(1);
  }
  const out = fn(m[2]);
  if (out === m[2]) {
    console.error(`图片资产门禁自测失败：对 ${name} 块的注入没有产生任何变化（注入本身失效了）。`);
    process.exit(1);
  }
  return text.replace(re, (all, a, body, b) => a + out + b);
}

/** 改一个文件；**改动为空就是注入失效**，直接失败（不让它变成"假绿"）。 */
function editText(file, fn) {
  const before = fs.readFileSync(file, "utf8");
  const after = fn(before);
  if (after === before) {
    console.error(`图片资产门禁自测失败：注入没有改动 ${file}（注入本身失效了）。`);
    process.exit(1);
  }
  fs.writeFileSync(file, after);
}

/**
 * 把夹具里的分享图换成一张**真的很大**的 PNG（超过 IA9 的体积上限）。
 * ⚠️ 写完当场回读字节数：没变大、或变大后仍没超过上限，都直接失败 ——
 *   注入没生效时那一档会变成"假绿"。
 */
function makeOversized(fx) {
  const before = fs.statSync(fx.ogPng).size;
  fs.writeFileSync(fx.ogPng, makeBigPng(PNG_W, PNG_H));
  const after = fs.statSync(fx.ogPng).size;
  if (after <= before || after <= 200 * 1024) {
    console.error(
      `图片资产门禁自测失败：注入没有把分享图写到 200 KB 以上（${before} → ${after} B）。`
    );
    process.exit(1);
  }
}

/* ---------------- 夹具站 ---------------- */

function buildFixture(dir, { fakeSrc = MISSING } = {}) {
  fs.mkdirSync(path.join(dir, "assets", "img", "og"), { recursive: true });
  fs.mkdirSync(path.join(dir, "blog"), { recursive: true });
  fs.writeFileSync(path.join(dir, "assets", "img", "og", "og-1200x630.png"), makePng(PNG_W, PNG_H));
  fs.writeFileSync(path.join(dir, "assets", "img", "og", "og-square.svg"), SVG_TEXT);
  fs.writeFileSync(path.join(dir, "index.html"), fixturePage(fakeSrc));
  fs.writeFileSync(path.join(dir, "blog", "index.html"), fixturePage(fakeSrc));

  /* 夹具自证：自造的 PNG 必须**真的**是 1200×630 —— 否则 IA2 那档测的是一个
     坏夹具，而不是被测判据。 */
  const png = fs.readFileSync(path.join(dir, "assets", "img", "og", "og-1200x630.png"));
  const w = png.readUInt32BE(16);
  const h = png.readUInt32BE(20);
  if (w !== PNG_W || h !== PNG_H) {
    console.error(`图片资产门禁自测失败：自造的 PNG 真实像素是 ${w}×${h}，不是 ${PNG_W}×${PNG_H}（夹具坏了）。`);
    process.exit(1);
  }
}

/* ---------------- 门禁副本（负对照用） ---------------- */

/**
 * 复制一份门禁到沙箱里，并把指定的判定开关卸掉。
 * ⚠️ **必须带齐同层依赖**：门禁用 `require(<ROOT>/src/_data/site.js)` 取站点地址，
 *   而 site.js 顶部 require 了 `../../scripts/lib/identity.cjs`
 *   ⇒ 副本要按同样的相对层级摆放（沙箱/scripts/… + 沙箱/src/_data/…）。
 * ⚠️ **卸判定必须自证**：改不到 `const <ID>_ON = true;` 就直接失败 ——
 *   「破坏没打上」与「判据本来就不红」在结果上完全同形。
 * @param {string[]} disable 要卸掉的开关编号（如 ["IA9"]）
 */
function buildGateCopy(dir, { disable = [] }) {
  copyFile(SITE_JS, path.join(dir, "src", "_data", "site.js"));
  copyFile(IDENTITY, path.join(dir, "scripts", "lib", "identity.cjs"));
  const original = fs.readFileSync(GATE, "utf8");
  let copy = original;
  for (const id of disable) {
    const before = copy;
    copy = copy.replace(`const ${id}_ON = true;`, `const ${id}_ON = false;`);
    if (copy === before) {
      console.error(
        `图片资产门禁自测失败：负对照没能改到 ${id} 判定（破坏没打上，这一档会假绿）。`
      );
      process.exit(1);
    }
  }
  if (disable.length) {
    /* 副本与原件必须**只差那些开关行** —— 多差一行就说明负对照动的不止判据。 */
    const a = original.split("\n");
    const b = copy.split("\n");
    const diff = a.filter((line, i) => line !== b[i]).length;
    if (diff !== disable.length || a.length !== b.length) {
      console.error(
        `图片资产门禁自测失败：负对照的门禁副本与原件差了 ${diff} 行` +
          `（应当恰好 ${disable.length} 行）。`
      );
      process.exit(1);
    }
  }
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(dir, "scripts", "check-image-assets.cjs"), copy);
  return path.join(dir, "scripts", "check-image-assets.cjs");
}

/* ---------------- 跑门禁 ---------------- */

function runGate(gatePath, fixtureDir) {
  const r = spawnSync(process.execPath, [gatePath], {
    env: { ...process.env, SITE_DIR: fixtureDir },
    encoding: "utf8",
  });
  return { code: r.status, out: `${r.stdout || ""}`, err: `${r.stderr || ""}` };
}

/**
 * 从**stderr** 里抽出红因编号集合。
 * ⚠️ 只取 stderr：门禁把**问题**写 stderr，把**提示**（外站图计数、缺失的 <img> 记一笔）
 *   写 stdout，而提示里也带「门禁 IA1：」字样 ⇒ 混在一起会把编号集算错。
 */
function causesOf(stderr) {
  const set = new Set();
  const re = /门禁 (IA\d+)/g;
  let m;
  while ((m = re.exec(stderr)) !== null) set.add(m[1]);
  return [...set].sort();
}

/* ---------------- 注入档 ---------------- */

const CASES = [
  {
    id: "IM0",
    label: "基线（原样）",
    expect: "green",
  },
  {
    id: "IM1",
    label: "og:image 指向不存在的文件",
    expect: "red",
    causes: ["IA1"],
    apply: (fx) =>
      editText(fx.index, (s) =>
        inBlock(s, "OG", (b) =>
          b
            .replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${SITE_URL}${MISSING}$2`)
            .replace(/(<meta property="og:image:secure_url" content=")[^"]*(")/, `$1${SITE_URL}${MISSING}$2`)
        )
      ),
  },
  {
    id: "IM2",
    label: "第二条 twitter:image 指向不存在的文件",
    expect: "red",
    causes: ["IA1"],
    apply: (fx) =>
      editText(fx.index, (s) =>
        inBlock(s, "TW", (b) =>
          b + `\n<meta name="twitter:image" content="${SITE_URL}${MISSING}" />\n<meta name="twitter:image:alt" content="missing" />`
        )
      ),
  },
  {
    id: "IM3",
    label: "og:image:width 写错",
    expect: "red",
    causes: ["IA2"],
    apply: (fx) =>
      editText(fx.index, (s) =>
        inBlock(s, "OG", (b) =>
          b.replace(/(<meta property="og:image:width" content=")[^"]*(")/, `$1${PNG_W + 1}$2`)
        )
      ),
  },
  {
    id: "IM4",
    label: "og:image:alt 清空",
    expect: "red",
    causes: ["IA3"],
    apply: (fx) =>
      editText(fx.index, (s) =>
        inBlock(s, "OG", (b) => b.replace(/(<meta property="og:image:alt" content=")[^"]*(")/, "$1$2"))
      ),
  },
  {
    id: "IM5",
    label: "第二条 twitter:image 的 alt 清空",
    expect: "red",
    causes: ["IA3"],
    apply: (fx) =>
      editText(fx.index, (s) =>
        inBlock(s, "TW", (b) =>
          b + `\n<meta name="twitter:image" content="${SITE_URL}${OG_PNG}" />\n<meta name="twitter:image:alt" content="" />`
        )
      ),
  },
  {
    id: "IM6",
    label: "<img> 声明的比例与真实像素不等比",
    expect: "red",
    causes: ["IA4"],
    apply: (fx) =>
      editText(fx.index, (s) =>
        s.replace(
          new RegExp(`(<img src="${OG_PNG}" width=")[^"]*(" height=")[^"]*(")`),
          `$1${PNG_H}$2${PNG_H}$3`
        )
      ),
  },
  {
    id: "IM7",
    label: "og:image 指向 SVG",
    expect: "red",
    causes: ["IA5"],
    apply: (fx) =>
      editText(fx.index, (s) =>
        inBlock(s, "OG", (b) =>
          b
            .replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${SITE_URL}${OG_SVG}$2`)
            .replace(/(<meta property="og:image:secure_url" content=")[^"]*(")/, `$1${SITE_URL}${OG_SVG}$2`)
        )
      ),
  },
  {
    id: "IM8",
    label: "站内图引用全改成外站（可验集为空 → 门禁自己空跑）",
    expect: "red",
    causes: ["IA6", "IA9", "IA10"],
    /* ⚠️ 必须**两页都改**：门禁的"应验集"是**全站**引用算出来的，
       只改 index.html 的话 blog/index.html 仍引用着站内 PNG ⇒ 可验集非空
       ⇒ IA6 不触发（那一档会变成"没按预期判红"）。
       这也是 IA6 自己的口径：它问的是"整站有没有一张该验的图都没验到"。
       ⚠️ 预期集合是 `{IA6, IA9, IA10}` 而**不只是** `{IA6}` ——
          这是**结构性依赖**：IA6 这一支要求全站本地图引用全断，
          而 og / twitter 引用断了 ⇒ 一张分享图都没量到（IA9 空跑防护）
          ⇒ 一条 og:image:type 都没比对过（IA10 空跑防护）⇒ 三条必然一起红。
          单独证明 IA9 / IA10 空跑防护的是 IM17（那档 IA6 保持绿）。 */
    apply: (fx) => {
      const toExternal = (s) =>
        s
          .split(`${SITE_URL}${OG_PNG}`)
          .join(EXTERNAL)
          .replace(new RegExp(`<img src="${OG_PNG}"`), `<img src="${EXTERNAL}"`);
      editText(fx.index, toExternal);
      editText(fx.blog, toExternal);
    },
  },
  {
    id: "IM9",
    label: "删掉 og:image 声明",
    expect: "red",
    causes: ["IA7"],
    apply: (fx) =>
      editText(fx.index, (s) => s.replace(/(<!--OG-->)([\s\S]*?)(<!--\/OG-->)/, "$1$3")),
  },
  {
    id: "IM10",
    label: "注入一条完全合法的第二条 og:image",
    expect: "red",
    causes: ["IA8"],
    apply: (fx) =>
      editText(fx.index, (s) =>
        inBlock(s, "OG", (b) =>
          b +
            `\n<meta property="og:image" content="${SITE_URL}${OG_PNG}" />\n` +
            `<meta property="og:image:secure_url" content="${SITE_URL}${OG_PNG}" />\n` +
            `<meta property="og:image:type" content="image/png" />\n` +
            `<meta property="og:image:width" content="${PNG_W}" />\n` +
            `<meta property="og:image:height" content="${PNG_H}" />\n` +
            `<meta property="og:image:alt" content="Fixture share card" />`
        )
      ),
  },
  {
    id: "IM11",
    label: "同样的注入放在另一个页面（逐页生效）",
    expect: "red",
    causes: ["IA8"],
    expectText: "blog/index.html",
    apply: (fx) =>
      editText(fx.blog, (s) =>
        inBlock(s, "OG", (b) =>
          b +
            `\n<meta property="og:image" content="${SITE_URL}${OG_PNG}" />\n` +
            `<meta property="og:image:secure_url" content="${SITE_URL}${OG_PNG}" />\n` +
            `<meta property="og:image:type" content="image/png" />\n` +
            `<meta property="og:image:width" content="${PNG_W}" />\n` +
            `<meta property="og:image:height" content="${PNG_H}" />\n` +
            `<meta property="og:image:alt" content="Fixture share card" />`
        )
      ),
  },
  {
    id: "IM12",
    label: "故意判绿：<style> 与 HTML 注释里的假 <img> 指向真实但比例错的图",
    expect: "green",
    apply: (fx) =>
      editText(fx.index, (s) =>
        s.split(`<img src="${MISSING}" width="1" height="1">`).join(`<img src="${OG_PNG}" width="1" height="1">`)
      ),
  },
  {
    id: "IM13",
    label: "判据级负对照：门禁副本卸掉 IA8 判定 + IM10 的注入 → 必须转绿",
    expect: "green",
    gateCopy: { disable: ["IA8"] },
    apply: (fx) =>
      editText(fx.index, (s) =>
        inBlock(s, "OG", (b) =>
          b +
            `\n<meta property="og:image" content="${SITE_URL}${OG_PNG}" />\n` +
            `<meta property="og:image:secure_url" content="${SITE_URL}${OG_PNG}" />\n` +
            `<meta property="og:image:type" content="image/png" />\n` +
            `<meta property="og:image:width" content="${PNG_W}" />\n` +
            `<meta property="og:image:height" content="${PNG_H}" />\n` +
            `<meta property="og:image:alt" content="Fixture share card" />`
        )
      ),
  },
  {
    id: "IM14",
    label: "分享图超过 200 KB 上限（真实字节数超限）",
    expect: "red",
    causes: ["IA9"],
    apply: (fx) => makeOversized(fx),
  },
  {
    id: "IM15",
    label: "og:image:type 与真实格式不符（PNG 却声明 image/jpeg）",
    expect: "red",
    causes: ["IA10"],
    apply: (fx) =>
      editText(fx.index, (s) =>
        inBlock(s, "OG", (b) =>
          b.replace(/(<meta property="og:image:type" content=")[^"]*(")/, "$1image/jpeg$2")
        )
      ),
  },
  {
    id: "IM16",
    label: "og:image:type 整个缺失",
    expect: "red",
    causes: ["IA10"],
    apply: (fx) =>
      editText(fx.index, (s) =>
        inBlock(s, "OG", (b) => b.replace(/\s*<meta property="og:image:type"[^>]*>/, ""))
      ),
  },
  {
    id: "IM17",
    label: "空跑防护：站内分享图引用全变成外站（IA9/IA10 都量不到东西）",
    expect: "red",
    causes: ["IA9", "IA10"],
    /* ⚠️ 只改 og / twitter 的引用，页面正文里的 <img> 仍指向站内 PNG ——
       否则 IA6（覆盖度自证）也会跟着红，红因归属就不纯了。
       ⇒ 这一档证明的是：**门禁在"什么都没量到"时会自己判红**，
         而不是安静地给出一个假绿。 */
    apply: (fx) => {
      const toExternal = (s) => s.split(`${SITE_URL}${OG_PNG}`).join(EXTERNAL);
      editText(fx.index, toExternal);
      editText(fx.blog, toExternal);
    },
  },
  {
    id: "IM18",
    label: "判据级负对照：门禁副本卸掉 IA9 判定 + IM14 的注入 → 必须转绿",
    expect: "green",
    gateCopy: { disable: ["IA9"] },
    apply: (fx) => makeOversized(fx),
  },
  {
    id: "IM19",
    label: "判据级负对照：门禁副本卸掉 IA10 判定 + IM15 的注入 → 必须转绿",
    expect: "green",
    gateCopy: { disable: ["IA10"] },
    apply: (fx) =>
      editText(fx.index, (s) =>
        inBlock(s, "OG", (b) =>
          b.replace(/(<meta property="og:image:type" content=")[^"]*(")/, "$1image/jpeg$2")
        )
      ),
  },
];

/* ---------------- 跑 ---------------- */

/* 门禁原件的摘要 —— 跑完要比对：负对照改的是**副本**，原件必须逐字节未变。 */
const gateBefore = fs.readFileSync(GATE, "utf8");

let pass = 0;
let fail = 0;
const failures = [];
const covered = new Set();

for (const c of CASES) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mh-imageassets-"));
  try {
    const fixture = path.join(tmp, "fixture");
    buildFixture(fixture);
    const fx = {
      index: path.join(fixture, "index.html"),
      blog: path.join(fixture, "blog", "index.html"),
      ogPng: path.join(fixture, "assets", "img", "og", "og-1200x630.png"),
    };
    if (c.apply) c.apply(fx);

    let gatePath = GATE;
    if (c.gateCopy) {
      gatePath = buildGateCopy(path.join(tmp, "gate"), c.gateCopy);
    }

    const r = runGate(gatePath, fixture);
    const got = causesOf(r.err);

    if (c.expect === "green") {
      if (r.code === 0) {
        pass++;
        console.log(`  ✓ ${c.id} ${c.label} → 判绿（符合预期）`);
      } else {
        fail++;
        failures.push(`${c.id} ${c.label}：期望判绿，实际 exit ${r.code}\n${r.err.trim()}`);
        console.log(`  ✗ ${c.id} ${c.label} → 实际判红（不符合预期）`);
      }
      continue;
    }

    /* 红：exit 必须是 1，红因编号集合必须**完全相等**（多一条、少一条都算失败 ——
       多一条说明还有别的判据在说话（归属不纯），少一条说明这条判据没抓住）。 */
    const want = [...c.causes].sort();
    const gotKey = JSON.stringify(got);
    const wantKey = JSON.stringify(want);
    if (r.code !== 1) {
      fail++;
      failures.push(`${c.id} ${c.label}：期望 exit 1，实际 exit ${r.code}\n${r.err.trim()}`);
      console.log(`  ✗ ${c.id} ${c.label} → 未按预期判红（exit ${r.code}）`);
      continue;
    }
    if (gotKey !== wantKey) {
      fail++;
      failures.push(
        `${c.id} ${c.label}：红因编号集合应为 ${wantKey}，实际 ${gotKey}\n${r.err.trim()}`
      );
      console.log(`  ✗ ${c.id} ${c.label} → 红因集合不符（应为 ${wantKey}，实际 ${gotKey}）`);
      continue;
    }
    if (c.expectText && !r.err.includes(c.expectText)) {
      fail++;
      failures.push(`${c.id} ${c.label}：红因里没指名「${c.expectText}」\n${r.err.trim()}`);
      console.log(`  ✗ ${c.id} ${c.label} → 红因没指名目标页面`);
      continue;
    }
    want.forEach((k) => covered.add(k));
    pass++;
    console.log(`  ✓ ${c.id} ${c.label} → 判红且红因集合恰为 ${wantKey}（符合预期）`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/* ---------------- 覆盖度自证 ----------------
   门禁每加一条判据，本自测就必须补一档 —— 否则新判据的「能不能变红」没人证明。
   判据编号从**门禁源码里现读**（不写死名单）：新增一条判据、源码里出现它的编号 ⇒
   这里立刻判红，提醒补档。 */
const gateSource = fs.readFileSync(GATE, "utf8");
const gateIds = new Set(
  [...gateSource.matchAll(/\bIA(\d+)\b/g)].map((m) => `IA${m[1]}`)
);
const missing = [...gateIds].filter((id) => !covered.has(id)).sort();
if (missing.length) {
  fail++;
  failures.push(
    `覆盖度自证：门禁里有 ${missing.join("、")}，但本矩阵没有能触发它们的档 —— ` +
      `门禁新加了判据，本自测必须补一档（否则新判据「能不能变红」没人证明）。`
  );
  console.log(`  ✗ 覆盖度自证：${missing.join("、")} 没有对应的注入档`);
}

/* 门禁原件必须逐字节未变（负对照改的是副本）。 */
if (fs.readFileSync(GATE, "utf8") !== gateBefore) {
  fail++;
  failures.push("门禁原件被改了 —— 自测只许改副本，原件必须逐字节未变。");
  console.log("  ✗ 门禁原件被改了");
}

console.log("");
if (fail) {
  console.error(`图片资产门禁自测未通过：${pass} 档符合预期，${fail} 档不符合。\n`);
  failures.forEach((f) => console.error(`  ✗ ${f}\n`));
  process.exit(1);
}
console.log(
  `图片资产门禁自测通过：${pass} 档全部符合预期` +
    `（IM0 / IM12 / IM13 / IM18 / IM19 绿 · IM1–IM11 / IM14–IM17 红且红因集合完全相等），` +
    `覆盖门禁全部 ${[...gateIds].sort().join("、")} 判据。`
);
