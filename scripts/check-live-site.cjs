#!/usr/bin/env node
/**
 * 线上部署核查门禁 —— 守住"**发出去的**站点"和"**建出来的**产物"是同一个东西。
 *
 * 为什么要有这条（本仓库反复吃过的那个病的最后一块）：
 *   本仓库已有的 15 道门禁**全部只查本地产物**（_site/）。
 *   于是"本地是对的"和"线上是对的"之间有一段**没人看守**的距离：
 *     · 部署没发生 → 线上跑的是上一次部署（实测 2026-10-19：线上仍是 10-16 那版，
 *       /papers/ /publications.bib /publications.ris /feed.xml 四条 404，
 *       canonical 与 sitemap 还带着已下线的 /MeteoHub/ 前缀）；
 *     · 部署了但口径变了（site.url 写错）→ 本地门禁全绿，线上 canonical 指向别处。
 *   这两种情况在日志里被**十几个场次各自手工 curl 发现过一遍**，
 *   而"每个场次重新发现一次"本身说明：**缺的是自动告警，不是缺发现能力**。
 *
 *   本门禁把这段距离变成一道可重复的检查：
 *     · 本地跑（npm run check:live）→ 巡检时一条命令出结论；
 *     · 部署后跑（CI 的 verify-live job）→ 部署完立刻知道线上对不对。
 *
 * 六条判据：
 *   L1 线上每个产物路由都返回 200（路由集**由本地 _site 推导**，不是手写清单）
 *   L2 线上 HTML 的 canonical / og:url 与本地**同路径**、且**指向本次部署的 origin**
 *   L3 线上 sitemap 里的每个 <loc> 都可达（抓"sitemap 指向 404 / 指向别的站"）
 *   L4 线上 sitemap 的 <loc> **路径集合**与本地一致（抓"sitemap 是旧版"）
 *   L5 线上 HTML 的 JSON-LD 块都能被 JSON.parse 解析（抓"发出去的是坏的"）
 *   L6 线上 feed.xml 至少有一个 <item>，且每个 item 的 <link> 都可达
 *
 * ⚠️ **为什么 L2/L3/L4/L6 比的是"路径"而不是整串 URL**：
 *   整串比较把两种**不同的故障**混成一条红因：
 *     ① 路径不一致 → 发出去的口径漂了（旧的 /MeteoHub/ 子路径前缀没去掉）；
 *     ② origin 不对 → 线上页面在对外声明一个别人家的地址。
 *   而且整串比较在本机夹具自测下**必然假红**（线上 origin 是 127.0.0.1，
 *   本地期望是 site.url）。拆成两段判，两种故障都判得准，自测也不会假红。
 *
 * ⚠️ 本门禁**不接进 build 链**（联网的检查放进离线构建里，构建就不复现了；
 *   而且 build 跑在 deploy **之前**，那时线上还是上一次部署）。
 *   它在 scripts/check-gates-wired.cjs 的 EXEMPT 里显式登记了理由 ——
 *   那里的机制说明写得很清楚："必须联网、必须人工介入"的门禁走登记。
 *   ⚠️ 登记豁免的代价是"没人跑 = 没人知道"，所以本门禁**必须**至少有一处
 *   自动调用点：.github/workflows/deploy.yml 的 verify-live job（部署后必跑）。
 *
 * ⚠️ **本门禁自己能不能触发，由另一个文件证明**：scripts/test-live-site.cjs
 *   （注入矩阵，test- 前缀 → 不匹配接线门禁的 GATE_FILE_RE）接在 build 链上，
 *   每次构建都会验证这六条判据**结构上**还能判红。门禁自己也要自证。
 *
 * 用法：
 *   node scripts/check-live-site.cjs                 # 查线上（地址取 site.url）
 *   node scripts/check-live-site.cjs --base URL      # 查别的地址（自测用）
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITE = process.env.SITE_DIR
  ? path.resolve(process.env.SITE_DIR)
  : path.join(ROOT, "_site");

/* 线上地址：唯一来源是 site.url（绝对 URL 口径的基准），不另设配置。 */
let SITE_URL = "";
try {
  SITE_URL = (require(path.join(ROOT, "src/_data/site.js")).url || "").replace(/\/+$/, "");
} catch {
  /* 读不到就靠 --base 传入 */
}

/* 部署生效有延迟 → L1 对失败路由重试。间隔可调（自测时置 0，不必干等）。 */
let retryDelayMs = Number(process.env.LIVE_CHECK_RETRY_DELAY_MS ?? 8000);
const RETRY_ROUNDS = 2;

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : "";
};

/* ---------- 小工具 ---------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const attrMap = (tag) => {
  const out = {};
  const re = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m;
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  return out;
};
const canonicalOf = (html) => {
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    const a = attrMap(tag);
    if ((a.rel || "").toLowerCase().split(/\s+/).includes("canonical")) return a.href || "";
  }
  return "";
};
const ogUrlOf = (html) => {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const a = attrMap(tag);
    if ((a.property || "").toLowerCase() === "og:url") return a.content || "";
  }
  return "";
};
const jsonLdBlocks = (html) =>
  (html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || []).map(
    (b) => b.replace(/^[\s\S]*?>/, "").replace(/<\/script>[\s\S]*$/, "")
  );
const routeOf = (rel) =>
  rel === "index.html" ? "/" : rel.endsWith("/index.html") ? "/" + rel.slice(0, -"index.html".length) : "/" + rel;

/* ---------- URL 拆分：路径与 origin 分开判 ---------- */
const parseUrl = (u) => {
  try {
    return new URL(u);
  } catch {
    return null;
  }
};
const originOf = (u) => (parseUrl(u) || {}).origin || "";
const pathOf = (u) => (parseUrl(u) || {}).pathname || "";

/* ---------- 收集本地产物 → 期望值 ---------- */
function collectLocal(dir) {
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (!e.name.startsWith("._")) files.push(p);
    }
  })(dir);
  return files.map((f) => {
    const rel = path.relative(dir, f).split(path.sep).join("/");
    const body = fs.readFileSync(f);
    const isHtml = rel.endsWith(".html");
    const isXml = rel.endsWith(".xml");
    const item = { rel, route: routeOf(rel), isHtml, isXml, body };
    if (isHtml) {
      const html = body.toString("utf8");
      item.canonical = canonicalOf(html);
      item.ogUrl = ogUrlOf(html);
      item.jsonLdCount = jsonLdBlocks(html).length;
    }
    if (isXml) item.text = body.toString("utf8");
    return item;
  });
}

/* ---------- 抓线上 ---------- */
async function grab(url, binary) {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(25000),
    headers: { "user-agent": "MeteoHub-live-check/1.0" },
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, text: binary ? "" : buf.toString("utf8"), buf };
}

async function grabAll(base, items) {
  const out = new Map();
  const CONC = 8;
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const it = items[i++];
      const url = base + it.route;
      try {
        const r = await grab(url, !it.isHtml && !it.isXml);
        out.set(it.rel, { ...r, url, error: null });
      } catch (e) {
        out.set(it.rel, { status: 0, text: "", buf: null, url, error: e.message });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONC, items.length) }, worker));
  return out;
}

/* ---------- 判据用的两个比较器 ---------- */
/**
 * 比较"本地期望的 URL"与"线上实际的 URL"，返回红因数组。
 *
 * 两个维度分开判，因为它们是**两种不同的故障**：
 *   ① 路径不一致 → 发出去的口径漂了（典型：旧的 /MeteoHub/ 子路径前缀没去掉）；
 *   ② 线上 origin ≠ 本次部署的 origin → 线上页面在对外声明一个别人家的地址。
 * 整串比较会把这两件事混成一条红因；本机夹具自测下（线上 origin 是 127.0.0.1，
 * 本地期望是 site.url）整串比较还必然假红。
 */
function urlDiff({ route, what, local, live, baseOrigin }) {
  const out = [];
  if (!local || !live) return out;
  const lp = pathOf(local);
  const gp = pathOf(live);
  if (lp !== gp) {
    out.push(
      `L2 线上 ${route} 的 ${what} 路径与本地不一致：线上「${gp}」/ 本地「${lp}」—— ` +
        `发出去的口径漂了（典型：旧的 /MeteoHub/ 子路径前缀没去掉），线上跑的不是当前代码。`
    );
  }
  const go = originOf(live);
  if (go && go !== baseOrigin) {
    out.push(
      `L2 线上 ${route} 的 ${what} 指向的不是本次部署的站：线上「${go}」/ 本次部署「${baseOrigin}」—— ` +
        `站点在对外声明一个别人家的地址。`
    );
  }
  return out;
}

/**
 * 检查一个外链是否可达。
 * 只对**本次部署自己的 origin** 下的地址发请求：指向别的站的 <loc>/<link>
 * 本身就是要报的错，没必要（也不该）去请求第三方。
 */
async function reachable(url, baseOrigin, label) {
  const go = originOf(url);
  if (go && go !== baseOrigin) {
    return [`${label} 指向的不是本次部署的站：线上「${go}」/ 本次部署「${baseOrigin}」。`];
  }
  try {
    const res = await grab(url, true);
    if (res.status !== 200) return [`${label} 返回 ${res.status} —— 它指向的地址不可达。`];
  } catch (e) {
    return [`${label} 连不上（${e.message}）。`];
  }
  return [];
}

/**
 * 多重集差集：返回 **b 里有、a 里没有**的元素（按出现次数配对，不按集合）。
 * 名字里写清方向，是因为"方向写反"会让红因把两栏内容对调 ——
 * 那样红因是**假话**，比不报还坏。
 */
const extraIn = (a, b) => {
  const m = new Map();
  for (const x of a) m.set(x, (m.get(x) || 0) + 1);
  const out = [];
  for (const x of b) {
    const c = m.get(x) || 0;
    if (c > 0) m.set(x, c - 1);
    else out.push(x);
  }
  return out;
};

/* ---------- 六条判据 ---------- */
/**
 * 跑一遍全部判据。
 * @param {string} base 线上地址（本地夹具自测时指向 127.0.0.1）
 * @param {string} expectedDir 期望值来源目录（本地 _site）
 */
async function runChecks(base, expectedDir) {
  const problems = [];
  const notes = [];
  const local = collectLocal(expectedDir);
  const baseOrigin = originOf(base);

  const htmlLocal = local.filter((f) => f.isHtml);
  const xmlLocal = local.filter((f) => f.isXml);

  /* L1：线上每个产物路由都返回 200 */
  const live = await grabAll(base, local);
  const failed = local.filter((f) => (live.get(f.rel) || {}).status !== 200);
  if (failed.length) {
    /* 部署后 Pages 生效有延迟 → 对失败的路由重试再定论 */
    for (let round = 0; round < RETRY_ROUNDS && failed.length; round++) {
      if (retryDelayMs > 0) await sleep(retryDelayMs);
      const retry = await grabAll(base, failed);
      for (const f of failed) {
        const r = retry.get(f.rel);
        if (r && r.status === 200) live.set(f.rel, r);
      }
    }
    const still = local.filter((f) => (live.get(f.rel) || {}).status !== 200);
    for (const f of still) {
      const r = live.get(f.rel) || {};
      problems.push(
        `L1 线上路由 ${f.route} 返回 ${r.status || "连不上"}${r.error ? `（${r.error}）` : ""}，` +
          `本地 ${f.rel} 是存在的 —— 线上这次部署**没发全**（或被 CDN 缓存了旧版）。`
      );
    }
    if (still.length < failed.length) {
      notes.push(`L1 有 ${failed.length - still.length} 条路由在重试后恢复（部署生效延迟）。`);
    }
  }

  /* L2：线上 canonical / og:url —— 路径与本地一致、origin 是本次部署的 */
  for (const f of htmlLocal) {
    const r = live.get(f.rel);
    if (!r || r.status !== 200) continue;
    const html = r.text;
    const gc = canonicalOf(html);
    const go = ogUrlOf(html);
    if (f.canonical && !gc) {
      problems.push(
        `L2 线上 ${f.route} 少了 canonical（本地有：${f.canonical}）—— 发出去的是旧版或被改坏了。`
      );
    } else {
      problems.push(
        ...urlDiff({ route: f.route, what: "canonical", local: f.canonical, live: gc, baseOrigin })
      );
    }
    if (f.ogUrl && !go) {
      problems.push(
        `L2 线上 ${f.route} 少了 og:url（本地有：${f.ogUrl}）—— 发出去的是旧版或被改坏了。`
      );
    } else {
      problems.push(
        ...urlDiff({ route: f.route, what: "og:url", local: f.ogUrl, live: go, baseOrigin })
      );
    }
  }

  /* L3 + L4：线上 sitemap */
  const sitemapLocal = xmlLocal.find((f) => f.rel === "sitemap.xml");
  const sitemapLive = local.find((f) => f.rel === "sitemap.xml");
  if (sitemapLocal) {
    const r = live.get("sitemap.xml");
    if (r && r.status === 200) {
      const locs = (r.text.match(/<loc>[^<]*<\/loc>/g) || []).map((s) =>
        s.replace(/<\/?loc>/g, "").trim()
      );
      if (!locs.length) {
        problems.push("L3 线上 sitemap.xml 里一条 <loc> 都没有 —— 线上发出去的是空 sitemap。");
      }
      for (const loc of locs) {
        problems.push(...(await reachable(loc, baseOrigin, `L3 线上 sitemap 里的 ${loc}`)));
      }
      const localLocs = (sitemapLocal.text.match(/<loc>[^<]*<\/loc>/g) || []).map((s) =>
        s.replace(/<\/?loc>/g, "").trim()
      );
      const localOnly = extraIn(locs.map(pathOf), localLocs.map(pathOf));
      const liveOnly = extraIn(localLocs.map(pathOf), locs.map(pathOf));
      if (localOnly.length || liveOnly.length) {
        problems.push(
          `L4 线上 sitemap 与本地不是同一份：本地有、线上没有 ${localOnly.length} 条` +
            `${localOnly.length ? "（" + localOnly.slice(0, 3).join(", ") + "）" : ""}；` +
            `线上有、本地没有 ${liveOnly.length} 条` +
            `${liveOnly.length ? "（" + liveOnly.slice(0, 3).join(", ") + "）" : ""}。` +
            `这说明线上 sitemap 是旧版（或发出去的 site.url 变了）。`
        );
      }
    }
  } else if (sitemapLive) {
    problems.push("L4 本地没有 sitemap.xml，但线上有 —— 本地产物与线上的不是同一份。");
  }

  /* L5：线上 HTML 的 JSON-LD 块能解析 */
  for (const f of htmlLocal) {
    const r = live.get(f.rel);
    if (!r || r.status !== 200) continue;
    const blocks = jsonLdBlocks(r.text);
    if (!blocks.length) {
      problems.push(`L5 线上 ${f.route} 一块 JSON-LD 都没有（本地有 ${f.jsonLdCount} 块）。`);
      continue;
    }
    for (let i = 0; i < blocks.length; i++) {
      try {
        JSON.parse(blocks[i]);
      } catch (e) {
        problems.push(
          `L5 线上 ${f.route} 的第 ${i + 1} 块 JSON-LD 解析失败：${e.message} —— ` +
            `发出去的结构化数据是坏的。`
        );
      }
    }
  }

  /* L6：线上 feed.xml 至少一个 item，且 item 链接可达 */
  const feedLocal = local.find((f) => f.rel === "feed.xml");
  if (feedLocal) {
    const r = live.get("feed.xml");
    if (r && r.status === 200) {
      const items = (r.text.match(/<item>/g) || []).length;
      if (!items) {
        problems.push(
          "L6 线上 feed.xml 一个 <item> 都没有（本地有）—— 订阅源在读者手里是空的。"
        );
      }
      const links = (r.text.match(/<link>([^<]*)<\/link>/g) || [])
        .map((s) => s.replace(/<\/?link>/g, "").trim())
        .filter((u) => /^https?:\/\//.test(u));
      for (const u of links.slice(0, 20)) {
        problems.push(...(await reachable(u, baseOrigin, `L6 线上 feed.xml 里的条目链接 ${u}`)));
      }
    }
  }

  return { problems, notes, counts: { routes: local.length, html: htmlLocal.length } };
}

/* ---------- 导出（供注入矩阵复用） ---------- */
module.exports = { runChecks, collectLocal, originOf, pathOf };

/* ---------- 入口 ---------- */
if (require.main === module) {
  const base = (opt("--base") || SITE_URL).replace(/\/+$/, "");
  if (!base) {
    console.error("线上核查门禁未通过：\n");
    console.error("  ✗ 拿不到要检查的地址：site.url 读不到，也没给 --base。");
    process.exit(1);
  }
  if (!fs.existsSync(SITE)) {
    console.error("线上核查门禁未通过：\n");
    console.error(`  ✗ 找不到产物目录 ${SITE}，请先运行 npm run build`);
    process.exit(1);
  }
  runChecks(base, SITE).then(({ problems, notes, counts }) => {
    if (problems.length) {
      console.error("线上核查门禁未通过：\n");
      problems.forEach((p) => console.error(`  ✗ ${p}`));
      notes.forEach((n) => console.error(`  · ${n}`));
      console.error("");
      process.exit(1);
    }
    console.log(
      `线上核查门禁通过：${base} 上 ${counts.routes} 个产物路由全部 200；` +
        `canonical / og:url 的路径与本地一致且指向本次部署的 origin；` +
        `sitemap 与本地同一份且每条可达；JSON-LD 全部可解析；feed 条目链接可达。`
    );
    notes.forEach((n) => console.log(`  · ${n}`));
  });
}
