#!/usr/bin/env node
/**
 * 线上核查门禁的**注入矩阵** —— 证明那六条判据**结构上还能触发**。
 *
 * 为什么单独一个文件：
 *   scripts/check-live-site.cjs 本身是**联网**门禁，已在
 *   scripts/check-gates-wired.cjs 的 EXEMPT 里登记豁免（不能进 build 链）。
 *   而接线门禁的 GW2 判据是**按文件**判的："既是豁免项、又被接在 build 链上"
 *   → 状态自相矛盾 → 判红。**同一个文件**没法既豁免又在 build 链上。
 *   所以自测挪到本文件：`test-` 前缀不匹配 GATE_FILE_RE
 *   （/^(check|verify)-.*\.cjs$/），它是自测脚本、不是门禁，
 *   可以（也应该）接进 build 链 —— 每次构建都验证判据还活着。
 *
 *   仓库里已有同族惯例：scripts/test-gates-selfcheck.cjs、scripts/test-dataset-files-gate.cjs。
 *
 * 做法：把本地产物复制一份，用一个极小的静态服务器把它发出去，
 * 然后**逐个注入**各类缺陷，断言对应判据真的报红。
 *
 * 关键细节：副本里那些绝对 URL 指向的是 site.url（生产 origin），
 * 而夹具发在 127.0.0.1 上。真实部署是"发在**自己**的 origin 上"，
 * 所以自测也要复现这一点 → 复制后先把副本里的生产 origin 换成夹具 origin
 * （localize），再注入。少了这一步，基线就会因为"线上 origin 与本地期望
 * 不同"而假红——那正是本门禁最初踩的坑。
 *
 * 每档都断言**红因文案**（不只断言"有红因"）：判据红而不说人话，
 * 或者红因把两栏内容对调，跟没红是一类的坏。
 *
 * 怎么跑：node scripts/test-live-site.cjs
 * （build 链上由 npm run check:live-selftest 调用；需先有 _site/）
 *
 * ⚠️ 矩阵开始时会把产物**快照**一份，之后每档都从快照复制：
 *   产物目录会被**并发构建**清空（eleventy.config.js 在配置加载时就
 *   cleanOutputDir("_site")），"每档都从活的 _site 复制"在中途被清空时会
 *   崩成裸 ENOENT 栈 —— 判据崩了，不是判红了，报的还是个跟判据无关的错误。
 *   详见 main() 里的「快照」那段。
 */
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const { runChecks, originOf } = require("./check-live-site.cjs");

const ROOT = path.resolve(__dirname, "..");
const SITE = process.env.SITE_DIR
  ? path.resolve(process.env.SITE_DIR)
  : path.join(ROOT, "_site");
/* 门禁源码本体 —— 判据级负对照要复制它、改副本。 */
const GATE_FILE = path.join(__dirname, "check-live-site.cjs");

/* ---------- 夹具用的极小静态服务器 ---------- */
/**
 * @param {string} rootDir 站点根
 * @param {object} [opts]
 *   · `opts.hsts` —— 缺省发 `strict-transport-security: max-age=31556952`
 *     （**照抄 GitHub Pages 的真实行为**）；传 `false` ⇒ 不发这个头；
 *     传字符串 ⇒ 发那个值（用来注入"有 HSTS 但 max-age 被降级"）。
 *   · `opts.contentType` —— 覆盖 content-type（用来注入"页面被当成下载"）。
 */
function startStaticServer(rootDir, opts) {
  const o = opts || {};
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
      if (p.endsWith("/")) p += "index.html";
      const file = path.join(rootDir, p);
      if (!file.startsWith(rootDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.statusCode = 404;
        res.end("not found");
        return;
      }
      const body = fs.readFileSync(file);
      res.statusCode = 200;
      res.setHeader(
        "content-type",
        o.contentType ||
          (file.endsWith(".html")
            ? "text/html; charset=utf-8"
            : file.endsWith(".xml")
              ? "application/xml; charset=utf-8"
              : "application/octet-stream")
      );
      /* HSTS：夹具站默认**带上**它（照抄 GitHub Pages 的真实行为）——
         否则基线档会被 L7 判红 ⇒ 注入档就证不了"那条红是 L7 判出来的"。 */
      if (o.hsts !== false) {
        res.setHeader("strict-transport-security", o.hsts || "max-age=31556952");
      }
      res.end(body);
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (e.name.startsWith("._")) continue;
    const s = path.join(from, e.name);
    const d = path.join(to, e.name);
    if (e.isDirectory()) copyTree(s, d);
    else fs.copyFileSync(s, d);
  }
}

function eachFile(dir, fn) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) eachFile(p, fn);
    else fn(p);
  }
}

/** 数一个目录里有几个文件（读不到就返回 -1，不抛）。 */
function countFiles(dir) {
  let n = 0;
  try {
    eachFile(dir, () => n++);
  } catch {
    return -1;
  }
  return n;
}

/** 把副本里的生产 origin 换成夹具自己的 origin（模拟"发在自己的 origin 上"）。 */
function localize(dir, origin, prodOrigin) {
  let n = 0;
  eachFile(dir, (f) => {
    if (!/\.(html|xml|json|txt|md|rb)$/i.test(f)) return;
    const before = fs.readFileSync(f, "utf8");
    if (!before.includes(prodOrigin)) return;
    fs.writeFileSync(f, before.split(prodOrigin).join(origin));
    n++;
  });
  if (!n) throw new Error(`localize 没改到任何文件：副本里找不到生产 origin「${prodOrigin}」`);
  return n;
}

/** 注入必须真的落地：改完断言内容确实变了（否则"门禁没拦住"与"没注入"同形）。 */
function mutate(file, from, to) {
  const before = fs.readFileSync(file, "utf8");
  if (!before.includes(from)) {
    throw new Error(`注入锚点不存在：${file} 里找不到「${from}」`);
  }
  const after = before.replace(from, to);
  if (after === before) throw new Error(`注入没有改变文件：${file}`);
  fs.writeFileSync(file, after);
  /* 打印**被注入的那一行**（不是文件第一行）——"注入没落地"和"门禁没拦住"
     在输出上长得一模一样，不打印出来就分不清。 */
  const line = after.split("\n").find((l) => l.includes(to));
  console.log(`      · 注入：${path.basename(file)} :: ${(line || "").trim().slice(0, 160)}`);
}

/**
 * 把门禁源码复制一份、把某条判据**同行替换**掉，再 require 这份副本。
 *
 * 为什么不给门禁加「可卸开关」：
 *   加了开关就等于在生产环境里留了一个**能悄悄把判据关掉**的入口 ——
 *   那种开关必须真的被 fail() 消费，否则它就是一条旁路。
 *   复制一份源码再改，是「让判据当场不存在」而不是「让判据可被关掉」：
 *   仓库里那份门禁源码一行都没动，改的只是临时副本。
 *   ⇒ 副本上的判据被卸掉时，同一个夹具必须**转绿** ⇒ 证明那条红确实是它判出来的。
 */
function gateCopyDisabled(dir, name, from, to) {
  const src = fs.readFileSync(GATE_FILE, "utf8");
  if (!src.includes(from)) throw new Error(`门禁源码里找不到要卸掉的那一行：${from}`);
  const out = src.replace(from, to);
  if (out === src) throw new Error(`卸判据没有改变门禁源码：${from}`);
  const p = path.join(dir, name);
  fs.writeFileSync(p, out);
  console.log(`      · 卸判据：${name} :: ${from.trim()} → ${to.trim()}`);
  return require(p);
}

async function main() {
  if (!fs.existsSync(SITE)) {
    console.error(`注入矩阵失败：找不到产物目录 ${SITE}，请先运行 npm run build。`);
    process.exit(1);
  }
  let siteUrl = "";
  try {
    siteUrl = (require(path.join(ROOT, "src/_data/site.js")).url || "").replace(/\/+$/, "");
  } catch {
    /* 读不到就由下面的 prodOrigin 检查报出来 */
  }
  const prodOrigin = originOf(siteUrl);
  if (!prodOrigin) {
    console.error("注入矩阵失败：拿不到 site.url 的 origin（src/_data/site.js 读不到？）。");
    process.exit(1);
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mh-live-selftest-"));
  const cases = [];

  /**
   * 快照：整个矩阵只认这一份。
   *
   * 为什么要快照（这是实测出来的，不是预想）：
   *   产物目录会被**并发构建**清空 —— eleventy.config.js 在**配置加载时**就调
   *   cleanOutputDir("_site")（构建开始即清空）。所以"每档都从活的 _site 复制"
   *   在中途被清空时会崩成裸 ENOENT 栈：判据**崩了**，不是判红了，
   *   报的还是一个跟判据毫无关系的错误。
   *   快照一次之后：
   *     ① 中途被清空 / 被重建都不影响矩阵（自测要证明的是"判据还能触发"，
   *        不是"此刻的产物是新的"）；
   *     ② "期望侧"与"发出去的那份"保证是同一份内容，不会自己跟自己错位。
   */
  const snap = path.join(tmp, "snapshot");
  try {
    copyTree(SITE, snap);
  } catch (e) {
    console.error(`注入矩阵失败：读不到产物目录 ${SITE}：${e.message}`);
    process.exit(1);
  }
  /* 矩阵要用的那几份产物必须都在。缺了就说明这份产物是残的
     （并发构建写到一半）——拿残产物跑矩阵，结论没有意义。 */
  const need = ["index.html", "feed.xml", "sitemap.xml", "papers/index.html"];
  const missing = need.filter((f) => !fs.existsSync(path.join(snap, f)));
  if (missing.length) {
    console.error(
      `注入矩阵失败：产物目录不完整，缺 ${missing.join("、")} —— ` +
        `多半是并发构建写到一半；先把一次 npm run build 跑完再跑本自测。`
    );
    process.exit(1);
  }
  const snapFiles = countFiles(snap);

  /**
   * 起一个夹具站，注入缺陷，跑一遍判据。
   * 顺序：从快照复制 → 起服务（拿到自己的 origin）→ localize → 注入 → 跑判据。
   * 服务器逐请求读盘，所以起服务之后再改文件也照样生效。
   * checker 缺省用真门禁；判据级负对照会传入一份「卸掉某条判据」的门禁副本。
   */
  const serve = async (mutateFn, label, checker, serverOpts) => {
    const dir = path.join(tmp, label);
    copyTree(snap, dir);
    const server = await startStaticServer(dir, serverOpts);
    const origin = `http://127.0.0.1:${server.address().port}`;
    localize(dir, origin, prodOrigin);
    mutateFn(dir, origin);
    const r = await (checker || runChecks)(origin, snap);
    await new Promise((res) => server.close(res));
    return r;
  };

  /* 基准：原样发出去 → 应当全绿（证明这套判据不是空跑） */
  const green = await serve(() => {}, "green");
  cases.push(["M0 基线（原样部署）", green.problems.length === 0, green.problems.join(" | ") || "全绿"]);

  const m1 = await serve((d) => {
    fs.rmSync(path.join(d, "papers", "index.html"), { force: true });
    console.log("      · 注入：删掉 papers/index.html（线上少一条路由）");
  }, "m1");
  cases.push([
    "M1 线上缺 /papers/（部署没发全）",
    m1.problems.some((p) => p.startsWith("L1") && p.includes("/papers/")),
    m1.problems.join(" | ") || "（无红因）",
  ]);

  const m2 = await serve((d, o) => {
    mutate(
      path.join(d, "index.html"),
      `<link rel="canonical" href="${o}/" />`,
      `<link rel="canonical" href="${o}/MeteoHub/" />`
    );
  }, "m2");
  cases.push([
    "M2 线上 canonical 指向旧前缀（路径漂移）",
    m2.problems.some((p) => p.startsWith("L2") && p.includes("路径与本地不一致")),
    m2.problems.join(" | ") || "（无红因）",
  ]);

  const m3 = await serve((d, o) => {
    mutate(
      path.join(d, "sitemap.xml"),
      `<loc>${o}/papers/</loc>`,
      `<loc>${o}/papers-does-not-exist/</loc>`
    );
  }, "m3");
  cases.push([
    "M3 线上 sitemap 指向 404（且 L4 的两栏方向不反）",
    m3.problems.some((p) => p.startsWith("L3") && p.includes("papers-does-not-exist")) &&
      m3.problems.some(
        (p) =>
          p.startsWith("L4") &&
          p.includes("本地有、线上没有 1 条（/papers/）") &&
          p.includes("线上有、本地没有 1 条（/papers-does-not-exist/）")
      ),
    m3.problems.join(" | ") || "（无红因）",
  ]);

  const m4 = await serve((d) => {
    const f = path.join(d, "index.html");
    const html = fs.readFileSync(f, "utf8");
    fs.writeFileSync(
      f,
      html.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/, "$1{ broken json,$3")
    );
    if (fs.readFileSync(f, "utf8") === html) throw new Error("JSON-LD 注入没落地");
    console.log("      · 注入：首页第一块 JSON-LD 换成坏 JSON");
  }, "m4");
  cases.push([
    "M4 线上 JSON-LD 坏掉",
    m4.problems.some((p) => p.startsWith("L5")),
    m4.problems.join(" | ") || "（无红因）",
  ]);

  const m5 = await serve((d) => {
    const f = path.join(d, "feed.xml");
    const xml = fs.readFileSync(f, "utf8");
    fs.writeFileSync(f, xml.replace(/<item>[\s\S]*?<\/item>/g, ""));
    if (fs.readFileSync(f, "utf8") === xml) throw new Error("feed 注入没落地");
    console.log("      · 注入：feed.xml 删掉全部 <item>");
  }, "m5");
  cases.push([
    "M5 线上 feed 没有条目",
    m5.problems.some((p) => p.startsWith("L6")),
    m5.problems.join(" | ") || "（无红因）",
  ]);

  const m6 = await serve((d, o) => {
    mutate(
      path.join(d, "index.html"),
      `<link rel="canonical" href="${o}/" />`,
      `<link rel="canonical" href="https://example.com/" />`
    );
  }, "m6");
  cases.push([
    "M6 线上 canonical 指向别的站（origin 维度）",
    m6.problems.some((p) => p.startsWith("L2") && p.includes("指向的不是本次部署的站")),
    m6.problems.join(" | ") || "（无红因）",
  ]);

  /* M7：og:image 漂移（发出去的口径里少了这一类）。
     注入只动 og:image 这一处 ⇒ 红因必须**只**是 og:image 的，
     混进 canonical / og:url / JSON-LD 的红就说明判据串了。 */
  const m7Inject = (d, o) => {
    mutate(
      path.join(d, "index.html"),
      `<meta property="og:image" content="${o}/assets/img/og/og-1200x630.jpg" />`,
      `<meta property="og:image" content="${o}/MeteoHub/assets/img/og/og-1200x630.jpg" />`
    );
  };
  const m7 = await serve(m7Inject, "m7");
  cases.push([
    "M7 线上 og:image 指向旧前缀（发出去的口径漂了）",
    m7.problems.some((p) => p.startsWith("L2") && p.includes("og:image")) &&
      m7.problems.every((p) => !p.includes("canonical") && !p.includes("og:url") && !p.includes("JSON-LD")),
    m7.problems.join(" | ") || "（无红因）",
  ]);

  /* M7b：判据级负对照 —— 把 og:image 那段判据从**门禁副本**里卸掉，
     同一夹具必须转绿 ⇒ 证明 M7 那条红确实是 og:image 判据判出来的。 */
  const noOg = gateCopyDisabled(
    tmp,
    "gate-no-ogimage.cjs",
    "    if (localOgs.length) {",
    "    if (false) {"
  );
  const m7b = await serve(m7Inject, "m7b", noOg.runChecks);
  cases.push([
    "M7b 卸掉 og:image 判据后同一夹具转绿（证明那条红是它判出来的）",
    m7b.problems.length === 0,
    m7b.problems.join(" | ") || "全绿",
  ]);

  /* M8：JSON-LD 里的站内口径漂移（这一类原先完全没人看守）。 */
  const m8Inject = (d, o) => {
    mutate(
      path.join(d, "index.html"),
      `"url": "${o}/"`,
      `"url": "${o}/MeteoHub/"`
    );
  };
  const m8 = await serve(m8Inject, "m8");
  cases.push([
    "M8 线上 JSON-LD 的站内口径漂了（发出去的口径漂了）",
    m8.problems.some((p) => p.startsWith("L2") && p.includes("JSON-LD")) &&
      m8.problems.every((p) => !p.includes("og:image") && !p.includes("canonical") && !p.includes("og:url")),
    m8.problems.join(" | ") || "（无红因）",
  ]);

  /* M8b：判据级负对照 —— 卸掉 JSON-LD 站内口径那段判据 ⇒ 同一夹具转绿。 */
  const noJsonLd = gateCopyDisabled(
    tmp,
    "gate-no-jsonld.cjs",
    "    if (f.jsonLdSite && f.jsonLdSite.length) {",
    "    if (false) {"
  );
  const m8b = await serve(m8Inject, "m8b", noJsonLd.runChecks);
  cases.push([
    "M8b 卸掉 JSON-LD 站内口径判据后同一夹具转绿（证明那条红是它判出来的）",
    m8b.problems.length === 0,
    m8b.problems.join(" | ") || "全绿",
  ]);

  /* ---------- M9 / M10 / M11：线上响应头（L7） ----------
     这三档证明的是「此前每轮**手工 curl** 才能看到的那件事，现在有牙齿了」。
     M9 注入「线上没有 HSTS」（传输安全被降级），
     M10 注入「HSTS 在、但 max-age 被降级到 5 分钟」（"有 HSTS"不等于"有保障"），
     M11 是判据级负对照：卸掉 L7 判据 ⇒ M9 / M10 两份夹具都转绿。 */

  /* M9：线上首页**没有 HSTS** ⇒ L7 判红。 */
  const m9 = await serve(() => {}, "m9", null, { hsts: false });
  cases.push([
    "M9 线上首页没有 HSTS ⇒ L7 判红（传输安全被降级）",
    m9.problems.some((p) => p.startsWith("L7") && p.includes("HSTS")) &&
      m9.problems.every((p) => p.startsWith("L7")),
    m9.problems.join(" | ") || "（无红因）",
  ]);

  /* M10：HSTS 在、但 max-age 只有 5 分钟 ⇒ L7 判红。 */
  const m10 = await serve(() => {}, "m10", null, { hsts: "max-age=300" });
  cases.push([
    "M10 线上 HSTS 的 max-age 低于 1 年 ⇒ L7 判红（有 HSTS ≠ 有保障）",
    m10.problems.some((p) => p.startsWith("L7") && p.includes("max-age")) &&
      m10.problems.every((p) => p.startsWith("L7")),
    m10.problems.join(" | ") || "（无红因）",
  ]);

  /* M11：判据级负对照 —— 卸掉 L7 判据 ⇒ M9 / M10 两份夹具都转绿。 */
  const noL7 = gateCopyDisabled(
    tmp,
    "gate-no-l7.cjs",
    "  if (htmlLocal.length > 0 && live.size > 0) { // L7 起点（自测的负对照替换这一行）",
    "  if (false) { // L7 起点（自测的负对照替换这一行）"
  );
  const m11a = await serve(() => {}, "m11a", noL7.runChecks, { hsts: false });
  const m11b = await serve(() => {}, "m11b", noL7.runChecks, { hsts: "max-age=300" });
  cases.push([
    "M11 卸掉 L7 判据后 M9 / M10 两份夹具都转绿（证明那条红是 L7 判出来的）",
    m11a.problems.length === 0 && m11b.problems.length === 0,
    `无 HSTS：${m11a.problems.join(" | ") || "全绿"}；短 max-age：${m11b.problems.join(" | ") || "全绿"}`,
  ]);

  console.log("线上核查门禁 · 本地注入矩阵：\n");
  let bad = 0;
  for (const [label, ok, detail] of cases) {
    console.log(`  ${ok ? "✓" : "✗"} ${label}`);
    if (!ok) {
      bad++;
      console.log(`      → 期望触发，未触发。红因：${detail}`);
    }
  }
  /* 运行期间产物目录变了（多半是并发的另一次构建清了又写）→ 说清楚：
     本次矩阵的结论只对开始时的那份快照成立，别把它读成"此刻产物是新的"。 */
  const nowFiles = countFiles(SITE);
  if (nowFiles !== snapFiles) {
    console.log(
      `  · 运行期间产物目录 ${SITE} 发生变化（${snapFiles} → ${nowFiles} 个文件）：` +
        `多半是并发的另一次构建。本次矩阵的结论只对开始时的快照成立。`
    );
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  if (bad) {
    console.error(`\n注入矩阵失败：${bad} 档没有按预期触发。\n`);
    process.exit(1);
  }
  console.log(`\n注入矩阵通过：${cases.length} 档全部按预期触发。\n`);
}

main();
