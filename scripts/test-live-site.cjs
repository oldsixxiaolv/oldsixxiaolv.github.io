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

/* ---------- 夹具用的极小静态服务器 ---------- */
function startStaticServer(rootDir) {
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
        file.endsWith(".html")
          ? "text/html; charset=utf-8"
          : file.endsWith(".xml")
            ? "application/xml; charset=utf-8"
            : "application/octet-stream"
      );
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

async function main() {
  if (!fs.existsSync(SITE)) {
    console.error("注入矩阵失败：找不到 _site/，请先运行 npm run build。");
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
   * 起一个夹具站，注入缺陷，跑一遍判据。
   * 顺序：复制 → 起服务（拿到自己的 origin）→ localize → 注入 → 跑判据。
   * 服务器逐请求读盘，所以起服务之后再改文件也照样生效。
   */
  const serve = async (mutateFn, label) => {
    const dir = path.join(tmp, label);
    copyTree(SITE, dir);
    const server = await startStaticServer(dir);
    const origin = `http://127.0.0.1:${server.address().port}`;
    localize(dir, origin, prodOrigin);
    mutateFn(dir, origin);
    const r = await runChecks(origin, SITE);
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

  console.log("线上核查门禁 · 本地注入矩阵：\n");
  let bad = 0;
  for (const [label, ok, detail] of cases) {
    console.log(`  ${ok ? "✓" : "✗"} ${label}`);
    if (!ok) {
      bad++;
      console.log(`      → 期望触发，未触发。红因：${detail}`);
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  if (bad) {
    console.error(`\n注入矩阵失败：${bad} 档没有按预期触发。\n`);
    process.exit(1);
  }
  console.log(`\n注入矩阵通过：${cases.length} 档全部按预期触发。\n`);
}

main();
