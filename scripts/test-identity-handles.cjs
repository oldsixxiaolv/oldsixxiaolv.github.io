#!/usr/bin/env node
/**
 * 身份句柄完整性门禁的**自测**（注入矩阵）—— 证明 I0–I8 每一条都**能变红**。
 *
 * 为什么要有这个自测（缺陷 D59 的第十四批，2026-10-22 D61 场次）：
 *   一条**永远不会红**的判据，给出的是"看起来很确定的绿"——它比没有判据更坏，
 *   因为它把"盲区"包装成"已核过"。而"判据能不能变红"这件事，**只有注入能证明**：
 *   读源码看不出 `isIdentityProfile()` 在真实数据上还认不认得出该认的形态、
 *   `anchorTrustworthy` 翻转后那四条判定会不会真的被跳过、
 *   I8 的"逐产物"口径会不会被"全站合计有一处就行"顶掉 —— 这些**只有跑起来才知道**。
 *   本仓已经吃过这一族亏：D51 查出三处 JS 空转、D52 查出死 CSS 门禁只守一张样式表、
 *   D56 给 IA8 加判据时也只能靠当场的 `/tmp` 注入矩阵证明它会红 ——
 *   **矩阵跑完即弃，仓库里没有任何东西保证它下次还在**。
 *   ⇒ 本脚本把那套矩阵**固化进仓库**，接在 build 链上。
 *
 * ⚠️ **本批与前 12 批的一处偏差（必须如实写明）**：
 *   前 12 道门禁的判据都带**编号**（如 IA1 / MD3），所以自测断言的是
 *   「红因**编号**集合完全相等」，负对照也靠把 `const <ID>_ON = true;` 改成 false。
 *   **本门禁的判据没有编号**（红因是散文式文案），且门禁本体此刻**正被另一个
 *   并发场次占用**（`scripts/check-identity-handles.cjs` 有未提交改动），
 *   本轮**不得触碰**那个文件 ⇒ 无法给它补编号、也无法加可卸开关。
 *   ⇒ 本自测用两个**等价替代**：
 *     ① 「红因**文案片段**集合完全相等」代替「编号集合完全相等」：
 *        每条判据在 `CAUSES` 表里登记一个**唯一**的红因文案片段，
 *        断言「命中的判据集合恰为期望集合」；并且**每一条红因行都必须能被归类**
 *        （归不了类 ⇒ 判红：那是出现了本自测不知道的新红因，归属就不纯了）。
 *     ② 「在**门禁副本**里卸判据」代替「把可卸开关置 false」：
 *        把副本里那条判据的**守卫条件**改成永假（同行替换，行数不变），
 *        再注入同一份坏数据 ⇒ 该判据的红因必须消失。
 *        ⚠️ 副本与原件必须**只差那一行**（逐行比对断言），否则负对照动的不止判据。
 *   门禁本体留待那个并发场次释放后另行编号化；届时本自测可原地升级为编号口径。
 *
 * 做法：在**自造的最小夹具站**上逐档注入缺陷，用环境变量 `SITE_DIR` 把门禁
 *   指向夹具产物，断言门禁**报出的红因判据集合与预期完全相等**。
 *   ⚠️ 全程**不动仓库里的任何文件** —— 注入只在临时目录的副本上做。
 *     （这正是门禁里留 SITE_DIR 这个开关的原因：没有它，自测就只能去改 _site，
 *       改坏了就是事故，也会和并发的 build 抢同一个目录。）
 *   ⚠️ **不 require 被测门禁的代码**：门禁以**子进程**方式运行，
 *     本脚本只看它的**行为**（exit code + stderr 上的红因）。
 *
 * ⚠️ 夹具的**真源全部在运行期从仓内取**（site.js / identity.cjs / 门禁源码里的
 *   ORACLE_SAMEAS 与 SCOPE_KEYS），**源码里不写死任何真实身份句柄或真实字段名** ——
 *   写死就等于自测自己有了一份"期望集的期望集"，哪天真源变了，自测会安静地绿。
 *
 * 用法：node scripts/test-identity-handles.cjs
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-identity-handles.cjs");
const REAL_SITE_JS = path.join(ROOT, "src", "_data", "site.js");
const REAL_IDENTITY = path.join(ROOT, "scripts", "lib", "identity.cjs");
const REAL_FOOTER = path.join(ROOT, "src", "_includes", "partials", "footer.njk");

const gateBefore = fs.readFileSync(GATE, "utf8");

/* ---------------- 运行期取真源（源码里不写死真实句柄 / 真实字段名） ---------------- */

function bail(msg) {
  console.error(`身份句柄门禁自测失败：${msg}`);
  process.exit(1);
}

const identityModule = require(REAL_IDENTITY);
const HANDLES = (identityModule.IDENTITY_SAMEAS || []).slice();
const realSite = require(REAL_SITE_JS);
const SITE_URL = String((realSite && realSite.url) || "");
const OWNER_ID = SITE_URL + "/#person";
if (!SITE_URL) bail("真源 src/_data/site.js 里没有 url —— 门禁判「本人节点」没有基准。");
if (!HANDLES.length) bail("真源 scripts/lib/identity.cjs 里没有身份清单 —— 夹具无法自建。");

/* 门禁自己的**独立期望集**与**判据范围**：从门禁源码里读出来，不在本脚本里抄一份。 */
const oracleBlock = gateBefore.match(/const ORACLE_SAMEAS = \[([\s\S]*?)\];/);
if (!oracleBlock) bail("门禁源码里找不到 ORACLE_SAMEAS —— 夹具无法对齐门据的期望集。");
const ORACLE = [...oracleBlock[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
if (!ORACLE.length) bail("门禁源码里的 ORACLE_SAMEAS 解析不出条目 —— 门禁形态变了。");

const scopeBlock = gateBefore.match(/const SCOPE_KEYS = \[([^\]]*)\]/);
if (!scopeBlock) bail("门禁源码里找不到 SCOPE_KEYS —— 夹具无法对齐门禁的判据范围。");
const SCOPE_KEYS = scopeBlock[1]
  .split(",")
  .map((s) => s.trim().replace(/^["']|["']$/g, ""))
  .filter(Boolean);
if (!SCOPE_KEYS.length) bail("门禁源码里的 SCOPE_KEYS 解析不出条目 —— 门禁形态变了。");

const SCOPE_URLS = SCOPE_KEYS.map((k) => (realSite.author || {})[k]).filter(Boolean);
if (SCOPE_URLS.length !== SCOPE_KEYS.length) {
  bail(`真源 site.author 里缺了判据范围内的字段（${SCOPE_KEYS.join(" / ")}）——夹具与门禁对不齐。`);
}

/* 「值在登记清单里、但不在判据范围内」的字段：页脚渲染了它就会触发 I8 的交叉核对。 */
const NON_SCOPE_KEYS = Object.keys(realSite.author || {}).filter(
  (k) => SCOPE_KEYS.indexOf(k) === -1 && HANDLES.indexOf(realSite.author[k]) !== -1
);
if (!NON_SCOPE_KEYS.length) bail("真源里找不到「登记在册但不在判据范围内」的字段 —— 夹具无法构造 I8 交叉核对那一档。");
const NON_SCOPE_KEY = NON_SCOPE_KEYS[0];

/* 判据范围里那个 ORCID 字段（I8 的可见性判定与 I6 的产物侧扫描都指着它）。 */
const ORCID_SCOPE_KEY = SCOPE_KEYS.find((k) => /orcid\.org/i.test(String((realSite.author || {})[k] || "")));
if (!ORCID_SCOPE_KEY) bail("判据范围里找不到 ORCID 字段 —— 夹具无法构造 I6 产物侧空扫那一档。");
const ORCID_SCOPE_URL = (realSite.author || {})[ORCID_SCOPE_KEY];

/* 假数据一律用 RFC 2606 保留域 / 明显无效的形态，绝不碰真实主机与真实标识。 */
const FAKE_HOST = "example.invalid";
const FAKE_HANDLE = `https://${FAKE_HOST}/someone`;
const FAKE_ORCID = ["0000", "0000", "0000", "0000"].join("-");
const FAKE_ORCID_URL = `https://orcid.org/${FAKE_ORCID}`;
const EXTRA_AUTHOR_KEY = "fixtureProfile"; /* 假字段名，不是站点真实字段 */
const FAKE_ORCID_TEXT = "not-an-orcid";

/* ---------------- 红因判据表：每条判据一个唯一文案片段 ----------------
   片段必须**互不包含**（否则一条红因会同时落进两个判据 ⇒ 归属不纯），
   这一条在下面 CAUSE_TABLE_SELF_CHECK 里当场验。 */
const CAUSES = {
  I0条数锚: "形态规则自证的夹具条数对不上",
  I0哈希锚: "形态规则自证的夹具内容哈希对不上",
  I0逐条: "形态规则自证失败：",
  I0没跑起来: "形态规则自证没有跑起来",
  I1缺: "的 sameAs 缺",
  I1多: "条 sameAs 不在登记清单里",
  I2a: "独立期望集有",
  I2b: "独立期望集里没有本人 ORCID",
  I2c: "独立期望集的哈希锚对不上",
  I2d: "共享模块 scripts/lib/identity.cjs 的清单与本判据的独立期望集不一致",
  I5缺: "site.author 里**数据源侧**的身份主页形态链接缺",
  I5多: "site.author 里**数据源侧**的身份主页形态链接多出",
  I5空: "的链接都没识别出来",
  I6白名单条数: "ORCID 白名单有",
  I6白名单哈希: "ORCID 白名单的哈希锚对不上",
  I6形态非法: "的值不是合法 ORCID 形态",
  I6产物未登记: "产物里出现**未登记**的 ORCID",
  I6数据源未登记: "作者列表数据源里出现**未登记**的 ORCID",
  I6产物空扫: "产物里一处 ORCID 链接都没扫到",
  I6数据源空扫: "作者列表数据源里一个 ORCID 值都没扫到",
  I6覆盖: "在**作者列表数据源**里一处都没出现",
  I6没跑起来: "ORCID 值域判定（I6）没有跑起来",
  I7多: "产物里出现**未登记**的身份主页形态链接",
  I7空: "的可见链接都没识别出来",
  I8页脚读不到: "读不到全站页脚模板",
  I8范围空: "判据范围（SCOPE_KEYS =",
  I8越界: "但它不在本条的判据范围里",
  I8缺: "份产物里**一处可见的 <a href> 都找不到**",
  I8没跑起来: "可见性一致性判定（I8）没有跑起来",
  I4节点数: "个带本人 @id",
  I4没比上: "本人节点组里一处 sameAs 都没比上",
  产物空: "产物目录里一个 HTML 都没有",
  JSONLD坏: "有一块 JSON-LD 解析失败",
  lib读不到: "读不到 scripts/lib/identity.cjs",
  site读不到: "读不到 src/_data/site.js",
};

/* 门禁自己的判据清单（**静态登记**，不动态生成）：
   动态登记的话，门禁新加一条判据时它连同自己的比较点一起消失 ⇒ 覆盖度自证反而判绿。 */
const CRITERIA = ["I0", "I1", "I2a", "I2b", "I2c", "I2d", "I3", "I4", "I5", "I6", "I7", "I8"];

/* ---------------- 工具 ---------------- */

/** 同行替换：必须**恰好命中一次**（命中 0 次 = 破坏没打上；>1 次 = 改的不止一处）。 */
function once(src, from, to, what) {
  const count = src.split(from).length - 1;
  if (count !== 1) {
    bail(`注入「${what}」命中 ${count} 次（应当恰好 1 次）—— 门禁源码形态变了，这一档会假绿。`);
  }
  return src.split(from).join(to);
}

/** 夹具的可见身份字段：真源里**值在登记清单里**的那几个（键名与取值都在运行期取）。 */
function baseAuthor() {
  const author = {};
  for (const [k, v] of Object.entries(realSite.author || {})) {
    if (typeof v === "string" && HANDLES.indexOf(v) !== -1) author[k] = v;
  }
  author.name = (realSite.author || {}).name;
  author.sameAs = HANDLES.slice();
  return author;
}

function baseAuthorList() {
  return (realSite.publications || []).map((p) => ({
    slug: p.slug,
    authorList: (p.authorList || []).map((a) => ({ name: a.name, orcid: a.orcid })),
  }));
}

/** 生成夹具用的 site.js（**不 require 共享模块**：夹具必须能独立地制造"读不到模块"那一档）。 */
function writeSiteJs(file, opts) {
  const author = opts.mutateAuthor ? opts.mutateAuthor(baseAuthor()) : baseAuthor();
  const publications = baseAuthorList();
  if (opts.mutateAuthorList) opts.mutateAuthorList(publications);
  fs.writeFileSync(
    file,
    "module.exports = " +
      JSON.stringify({ url: SITE_URL, author, publications }, null, 2) +
      "\n"
  );
}

/** 生成夹具用的共享模块（清单条数可被注入改掉）。 */
function writeIdentityModule(file, handles) {
  const body = handles.map((h) => "  " + JSON.stringify(h) + ",").join("\n");
  fs.writeFileSync(
    file,
    `const OWNER_ORCID = ${JSON.stringify(handles[0])};\n\n` +
      `const IDENTITY_SAMEAS = [\n${body}\n];\n\n` +
      `module.exports = { OWNER_ORCID, IDENTITY_SAMEAS };\n`
  );
}

function renderProduct(p) {
  const hrefs = [...p.hrefs, ...p.extraHrefs]
    .map((u) => `<a href="${u}">fixture link</a>`)
    .join("\n");
  let ld = "";
  if (p.ld) {
    const obj = {
      "@context": "https://schema.org",
      "@type": "Person",
      "@id": OWNER_ID,
      name: "Fixture",
    };
    if (p.sameAs !== null && p.sameAs !== undefined) obj.sameAs = p.sameAs;
    const body = p.broken ? "{ this is not json" : JSON.stringify(obj);
    ld = `<script type="application/ld+json">\n${body}\n</script>`;
  }
  const text = p.text ? `<p>${p.text}</p>` : "";
  return (
    "<!doctype html>\n" +
    '<html lang="en">\n<head><meta charset="utf-8" /><title>Fixture</title></head>\n' +
    `<body>\n${ld}\n${hrefs}\n${text}\n</body>\n</html>\n`
  );
}

function newFx() {
  return {
    products: [
      {
        rel: "index.html",
        sameAs: ORACLE.slice(),
        hrefs: SCOPE_URLS.slice(),
        extraHrefs: [],
        text: "",
        ld: true,
        broken: false,
      },
      {
        rel: path.join("blog", "index.html"),
        sameAs: ORACLE.slice(),
        hrefs: SCOPE_URLS.slice(),
        extraHrefs: [],
        text: "",
        ld: true,
        broken: false,
      },
    ],
    site: {},
    identityHandles: HANDLES.slice(),
    footerExtra: "",
    gate: null,
    noFooter: false,
    noIdentity: false,
    noSite: false,
    noProducts: false,
  };
}

/** 把夹具落成一个沙箱目录（门禁副本 + 共享模块副本 + 数据源 + 页脚 + 产物）。 */
function buildSandbox(dir, fx) {
  fs.mkdirSync(path.join(dir, "scripts", "lib"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src", "_data"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src", "_includes", "partials"), { recursive: true });
  fs.mkdirSync(path.join(dir, "_site"), { recursive: true });

  let gateSrc = fx.gate ? fx.gate(gateBefore) : gateBefore;
  if (gateSrc === gateBefore && fx.gate) bail("注入没有改动门禁副本 —— 注入本身失效了。");
  fs.writeFileSync(path.join(dir, "scripts", "check-identity-handles.cjs"), gateSrc);

  if (!fx.noIdentity) {
    writeIdentityModule(path.join(dir, "scripts", "lib", "identity.cjs"), fx.identityHandles);
  }
  if (!fx.noSite) {
    writeSiteJs(path.join(dir, "src", "_data", "site.js"), fx.site);
  }
  if (!fx.noFooter) {
    fs.writeFileSync(
      path.join(dir, "src", "_includes", "partials", "footer.njk"),
      fs.readFileSync(REAL_FOOTER, "utf8") + fx.footerExtra
    );
  }
  if (!fx.noProducts) {
    for (const p of fx.products) {
      const target = path.join(dir, "_site", p.rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, renderProduct(p));
    }
  }
}

/* ---------------- 跑门禁 + 归类红因 ---------------- */

function runGate(dir) {
  const r = spawnSync(process.execPath, [path.join(dir, "scripts", "check-identity-handles.cjs")], {
    env: { ...process.env, SITE_DIR: path.join(dir, "_site") },
    encoding: "utf8",
  });
  const err = r.stderr || "";
  const redLines = [];
  for (const line of err.split("\n")) {
    const m = line.match(/^\s*✗\s(.*)$/);
    if (m) redLines.push(m[1]);
  }
  /* 归类：每条红因行必须**恰好**落进一个判据。
     落不进 ⇒ 出现了本自测不知道的新红因（归属不纯）；落进两个 ⇒ 判据表有歧义。 */
  const causes = new Set();
  const unknown = [];
  for (const line of redLines) {
    const hits = Object.keys(CAUSES).filter((k) => line.indexOf(CAUSES[k]) !== -1);
    if (hits.length === 1) causes.add(hits[0]);
    else unknown.push(`${hits.length ? "归属有歧义" : "无法归类"}：${line}`);
  }
  return {
    code: r.status,
    out: r.stdout || "",
    err,
    redLines,
    causes: [...causes].sort(),
    unknown,
    crashed:
      /SyntaxError|ReferenceError|TypeError|Node\.js v/.test(err) ||
      /SyntaxError|ReferenceError|TypeError|Node\.js v/.test(r.stdout || ""),
  };
}

function runFx(fx) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mh-ih-"));
  try {
    const dir = path.join(tmp, "repo");
    buildSandbox(dir, fx);
    return runGate(dir);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/* ---------------- 注入档 ---------------- */

const CASES = [
  { id: "IH0", label: "基线（原样）", expect: "green", criterion: null },

  { id: "IH1", label: "产物的 sameAs 少一条", expect: "red", causes: ["I1缺"], criterion: "I1",
    apply: (fx) => { fx.products[0].sameAs = ORACLE.slice(0, -1); } },
  { id: "IH2", label: "产物的 sameAs 多一条（未登记句柄）", expect: "red", causes: ["I1多"], criterion: "I1",
    apply: (fx) => { fx.products[0].sameAs = ORACLE.concat([FAKE_HANDLE]); } },

  { id: "IH3", label: "期望集条数锚被改坏", expect: "red", causes: ["I2a"], criterion: "I2a",
    apply: (fx) => { fx.gate = (s) => once(s, /const EXPECTED_COUNT = \d+;/, "const EXPECTED_COUNT = 999;", "期望集条数锚"); } },
  { id: "IH4", label: "期望集里没有本人 ORCID（锚被改坏）", expect: "red", causes: ["I2b"], criterion: "I2b",
    apply: (fx) => { fx.gate = (s) => once(s, /const ANCHOR_ORCID = "[^"]*";/, `const ANCHOR_ORCID = "${FAKE_ORCID_URL}";`, "期望集 ORCID 锚"); } },
  { id: "IH5", label: "期望集哈希锚被改坏", expect: "red", causes: ["I2c"], criterion: "I2c",
    apply: (fx) => { fx.gate = (s) => once(s, /const ORACLE_SET_SHA256 =\s*"[0-9a-f]+";/, `const ORACLE_SET_SHA256 = "${"0".repeat(64)}";`, "期望集哈希锚"); } },
  { id: "IH6", label: "共享模块与独立期望集漂移", expect: "red", causes: ["I2d"], criterion: "I2d",
    apply: (fx) => { fx.identityHandles = HANDLES.slice(0, -1); } },

  { id: "IH7", label: "site.author 数据源少一条可见身份链接", expect: "red", causes: ["I5缺"], criterion: "I5",
    apply: (fx) => { fx.site.mutateAuthor = (a) => { delete a[NON_SCOPE_KEY]; return a; }; } },
  { id: "IH8", label: "site.author 数据源多一条未登记的可见身份链接", expect: "red", causes: ["I5多"], criterion: "I5",
    apply: (fx) => { fx.site.mutateAuthor = (a) => { a[EXTRA_AUTHOR_KEY] = FAKE_HANDLE; return a; }; } },
  { id: "IH9", label: "site.author 里一个身份主页形态链接都没识别出来", expect: "red", causes: ["I5缺", "I5空", "I8范围空"], criterion: "I5",
    apply: (fx) => { fx.site.mutateAuthor = (a) => {
      Object.keys(a).forEach((k) => { if (typeof a[k] === "string" && HANDLES.indexOf(a[k]) !== -1) delete a[k]; });
      return a;
    }; } },

  { id: "IH10", label: "ORCID 白名单条数锚被改坏", expect: "red", causes: ["I6白名单条数"], criterion: "I6",
    apply: (fx) => { fx.gate = (s) => once(s, /const ORCID_ALLOWLIST_COUNT = \d+;/, "const ORCID_ALLOWLIST_COUNT = 999;", "白名单条数锚"); } },
  { id: "IH11", label: "ORCID 白名单哈希锚被改坏", expect: "red", causes: ["I6白名单哈希"], criterion: "I6",
    apply: (fx) => { fx.gate = (s) => once(s, /const ORCID_ALLOWLIST_SHA256 =\s*"[0-9a-f]+";/, `const ORCID_ALLOWLIST_SHA256 = "${"0".repeat(64)}";`, "白名单哈希锚"); } },
  { id: "IH12", label: "产物里出现未登记的 ORCID", expect: "red", causes: ["I6产物未登记"], criterion: "I6",
    apply: (fx) => { fx.products[0].text = FAKE_ORCID; } },
  { id: "IH13", label: "作者列表数据源里出现未登记的 ORCID", expect: "red", causes: ["I6数据源未登记"], criterion: "I6",
    apply: (fx) => { fx.site.mutateAuthorList = (pubs) => {
      let done = false;
      for (const p of pubs) for (const a of p.authorList) {
        if (!done && !a.orcid) { a.orcid = FAKE_ORCID; done = true; }
      }
      if (!done) bail("真源里找不到 orcid 为空的作者条目 —— 夹具无法构造这一档。");
    }; } },
  { id: "IH14", label: "登记在册的 ORCID 在作者列表数据源里消失了", expect: "red", causes: ["I6覆盖"], criterion: "I6",
    apply: (fx) => { fx.site.mutateAuthorList = (pubs) => {
      let done = false;
      for (const p of pubs) for (const a of p.authorList) {
        if (!done && a.orcid) { a.orcid = null; done = true; }
      }
      if (!done) bail("真源里找不到带 orcid 的作者条目 —— 夹具无法构造这一档。");
    }; } },
  { id: "IH15", label: "作者列表数据源里一个 ORCID 值都没扫到", expect: "red", causes: ["I6数据源空扫", "I6覆盖"], criterion: "I6",
    apply: (fx) => { fx.site.mutateAuthorList = (pubs) => {
      for (const p of pubs) for (const a of p.authorList) a.orcid = null;
    }; } },
  { id: "IH16", label: "产物里一处 ORCID 都没扫到", expect: "red", causes: ["I1缺", "I6产物空扫", "I8缺"], criterion: "I6",
    apply: (fx) => {
      const withoutOrcid = ORACLE.filter((u) => u !== ORCID_SCOPE_URL);
      for (const p of fx.products) {
        p.sameAs = withoutOrcid.slice();
        p.hrefs = p.hrefs.filter((u) => u !== ORCID_SCOPE_URL);
      }
    } },
  { id: "IH35", label: "作者列表里的 orcid 值不是合法 ORCID 形态", expect: "red", causes: ["I6形态非法"], criterion: "I6",
    apply: (fx) => { fx.site.mutateAuthorList = (pubs) => {
      let done = false;
      for (const p of pubs) for (const a of p.authorList) {
        if (!done && !a.orcid) { a.orcid = FAKE_ORCID_TEXT; done = true; }
      }
      if (!done) bail("真源里找不到 orcid 为空的作者条目 —— 夹具无法构造这一档。");
    }; } },
  { id: "IH29", label: "ORCID 值域判定没跑起来（结构性兜底）", expect: "red", causes: ["I6没跑起来"], criterion: "I6",
    apply: (fx) => { fx.gate = (s) => once(s, "orcidReached = true;", "orcidReached = false;", "I6 结构性兜底"); } },

  { id: "IH17", label: "产物里出现未登记的身份主页形态链接", expect: "red", causes: ["I7多"], criterion: "I7",
    apply: (fx) => { fx.products[0].extraHrefs = [FAKE_HANDLE]; } },
  { id: "IH18", label: "产物里一处身份主页形态可见链接都没识别出来", expect: "red", causes: ["I7空", "I8缺"], criterion: "I7",
    apply: (fx) => { for (const p of fx.products) p.hrefs = []; } },

  { id: "IH19", label: "读不到全站页脚模板", expect: "red", causes: ["I8页脚读不到"], criterion: "I8",
    apply: (fx) => { fx.noFooter = true; } },
  { id: "IH20", label: "判据范围里的身份链接字段一条 URL 都取不到", expect: "red", causes: ["I8范围空", "I5缺"], criterion: "I8",
    apply: (fx) => { fx.site.mutateAuthor = (a) => {
      for (const k of SCOPE_KEYS) a[k] = "not-a-url";
      return a;
    }; } },
  { id: "IH21", label: "页脚渲染了判据范围外的登记句柄", expect: "red", causes: ["I8越界"], criterion: "I8",
    apply: (fx) => { fx.footerExtra = `\n<a href="{{ site.author.${NON_SCOPE_KEY} }}">extra</a>\n`; } },
  { id: "IH22", label: "某一份产物上判据范围内的可见身份链接渲染不出来", expect: "red", causes: ["I8缺"], criterion: "I8",
    apply: (fx) => {
      const k = SCOPE_KEYS[0];
      const url = (realSite.author || {})[k];
      fx.products[1].hrefs = fx.products[1].hrefs.filter((u) => u !== url);
    } },
  { id: "IH30", label: "可见性一致性判定没跑起来（结构性兜底）", expect: "red", causes: ["I8没跑起来"], criterion: "I8",
    apply: (fx) => { fx.gate = (s) => once(s, "visibilityReached = true;", "visibilityReached = false;", "I8 结构性兜底"); } },

  { id: "IH23", label: "全站只找到 1 个带本人 @id 的 Person 节点", expect: "red", causes: ["I4节点数"], criterion: "I4",
    apply: (fx) => { fx.products[1].ld = false; } },
  { id: "IH24", label: "本人节点组里一处 sameAs 都没比上", expect: "red", causes: ["I4没比上"], criterion: "I4",
    apply: (fx) => { for (const p of fx.products) p.sameAs = null; } },

  { id: "IH25", label: "形态规则自证的夹具条数锚被改坏", expect: "red", causes: ["I0条数锚"], criterion: "I0",
    apply: (fx) => { fx.gate = (s) => once(s, /const SHAPE_SELF_CHECK_EXPECTED_COUNT = \d+;/, "const SHAPE_SELF_CHECK_EXPECTED_COUNT = 999;", "形态自证条数锚"); } },
  { id: "IH26", label: "形态规则自证的夹具内容哈希锚被改坏", expect: "red", causes: ["I0哈希锚"], criterion: "I0",
    apply: (fx) => { fx.gate = (s) => once(s, /const SHAPE_SELF_CHECK_SHA256 =\s*"[0-9a-f]+";/, `const SHAPE_SELF_CHECK_SHA256 = "${"0".repeat(64)}";`, "形态自证哈希锚"); } },
  { id: "IH27", label: "形态规则退化（角色词表少一个词）", expect: "red", causes: ["I0逐条", "I5缺"], criterion: "I0",
    apply: (fx) => { fx.gate = (s) => once(s, '"profile", ', "", "形态规则角色词表"); } },
  { id: "IH28", label: "形态规则自证没跑起来（结果没被记为通过）", expect: "red", causes: ["I0没跑起来"], criterion: "I0",
    apply: (fx) => { fx.gate = (s) => once(s, "shapeSelfCheckPassed = true;", "shapeSelfCheckPassed = false;", "形态自证结果标志"); } },

  { id: "IH36", label: "I3 口径：某个产物节点没有 sameAs 字段（**必须仍判绿**）", expect: "green", criterion: "I3",
    apply: (fx) => { fx.products[1].sameAs = null; } },

  { id: "IH31", label: "产物目录里一个 HTML 都没有", expect: "red", causes: ["产物空", "I4节点数", "I4没比上", "I6产物空扫", "I7空"], criterion: null,
    apply: (fx) => { fx.noProducts = true; } },
  { id: "IH32", label: "有一块 JSON-LD 解析失败", expect: "red", causes: ["JSONLD坏"], criterion: null,
    apply: (fx) => { fx.products.push({ rel: "broken.html", sameAs: ORACLE.slice(), hrefs: SCOPE_URLS.slice(), extraHrefs: [], text: "", ld: true, broken: true }); } },
  { id: "IH33", label: "读不到共享模块 scripts/lib/identity.cjs", expect: "red", causes: ["lib读不到"], criterion: null,
    apply: (fx) => { fx.noIdentity = true; } },
  { id: "IH34", label: "读不到 src/_data/site.js", expect: "red", causes: ["site读不到"], criterion: null,
    apply: (fx) => { fx.noSite = true; } },
];

/* ---------------- 判据级负对照：在**门禁副本**里卸掉那条判据 ----------------
   每条判据一档：注入同一份坏数据 + 门禁副本里把该判据的守卫条件改成永假
   ⇒ 该判据的红因必须消失（其余红因照旧）。
   ⚠️ 副本与原件必须**只差那一行**（逐行比对断言）——否则负对照动的不止判据。 */
const NEUTERS = [
  { id: "NC1", label: "卸掉 I1 的「缺」判定", base: "IH1", drop: "I1缺", from: "if (!missing.length) continue;", to: "if (true) continue;" },
  { id: "NC2", label: "卸掉 I1 的「多」判定", base: "IH2", drop: "I1多", from: "if (extraHandles.size) {", to: "if (false) {" },
  { id: "NC3", label: "卸掉 I2a 条数锚判定", base: "IH3", drop: "I2a", from: "if (expectedSet.size !== EXPECTED_COUNT)", to: "if (false)" },
  { id: "NC4", label: "卸掉 I2b ORCID 锚判定", base: "IH4", drop: "I2b", from: "if (!expectedSet.has(ANCHOR_ORCID))", to: "if (false)" },
  { id: "NC5", label: "卸掉 I2c 哈希锚判定", base: "IH5", drop: "I2c", from: "if (computedOracleHash !== ORACLE_SET_SHA256)", to: "if (false)" },
  { id: "NC6", label: "卸掉 I2d 漂移核对判定", base: "IH6", drop: "I2d", from: "if (extra.length || missing.length)", to: "if (false)" },
  { id: "NC7", label: "卸掉 I5 的「缺」判定", base: "IH7", drop: "I5缺", from: "if (missingVisible.length) {", to: "if (false) {" },
  { id: "NC8", label: "卸掉 I5 的「多」判定", base: "IH8", drop: "I5多", from: "if (extraVisible.length) {", to: "if (false) {" },
  { id: "NC9", label: "卸掉 I5 的「空跑」判定", base: "IH9", drop: "I5空", from: "if (!visible.size) {", to: "if (false) {" },
  { id: "NC10", label: "卸掉 I6 白名单条数锚判定", base: "IH10", drop: "I6白名单条数", from: "if (allow.size !== ORCID_ALLOWLIST_COUNT) {", to: "if (false) {" },
  { id: "NC11", label: "卸掉 I6 白名单哈希锚判定", base: "IH11", drop: "I6白名单哈希", from: "if (allowHash !== ORCID_ALLOWLIST_SHA256) {", to: "if (false) {" },
  { id: "NC12", label: "卸掉 I6 的产物侧值域判定", base: "IH12", drop: "I6产物未登记", from: "for (const [id, rels] of inSite) {", to: "for (const [id, rels] of new Map()) {" },
  { id: "NC13", label: "卸掉 I6 的数据源侧值域判定", base: "IH13", drop: "I6数据源未登记", from: "for (const [id, locs] of inSource) {", to: "for (const [id, locs] of new Map()) {" },
  { id: "NC14", label: "卸掉 I6 的白名单覆盖判定", base: "IH14", drop: "I6覆盖", from: "for (const id of allow) {", to: "for (const id of new Set()) {" },
  { id: "NC15", label: "卸掉 I6 的产物侧空跑判定", base: "IH16", drop: "I6产物空扫", from: "if (!inSite.size) {", to: "if (false) {" },
  { id: "NC16", label: "卸掉 I6 的数据源侧空跑判定", base: "IH15", drop: "I6数据源空扫", from: "if (!inSource.size) {", to: "if (false) {" },
  { id: "NC17", label: "卸掉 I6 的结构性兜底", base: "IH29", drop: "I6没跑起来", from: "if (!orcidReached) {", to: "if (false) {" },
  { id: "NC18", label: "卸掉 I7 的「多出」判定", base: "IH17", drop: "I7多", from: "for (const [href, rels] of extra) {", to: "for (const [href, rels] of new Map()) {" },
  { id: "NC19", label: "卸掉 I7 的「空跑」判定", base: "IH18", drop: "I7空", from: "if (!seenKeys.size) {", to: "if (false) {" },
  { id: "NC20", label: "卸掉 I8 的页脚可读判定", base: "IH19", drop: "I8页脚读不到", from: "if (!footerRead) {", to: "if (false) {" },
  { id: "NC21", label: "卸掉 I8 的范围空跑判定", base: "IH20", drop: "I8范围空", from: "if (!declared.size) {", to: "if (false) {" },
  { id: "NC22", label: "卸掉 I8 的页脚越界判定", base: "IH21", drop: "I8越界", from: "if (!t || !registered.has(t)) continue;", to: "if (true) continue;" },
  { id: "NC23", label: "卸掉 I8 的逐产物可见性判定", base: "IH22", drop: "I8缺", from: "if (missingIn.length) silent.push({ url: u, field, missingIn });", to: "if (false) silent.push({ url: u, field, missingIn });" },
  { id: "NC24", label: "卸掉 I8 的结构性兜底", base: "IH30", drop: "I8没跑起来", from: "if (!visibilityReached) {", to: "if (false) {" },
  { id: "NC25", label: "卸掉 I4 的节点数判定", base: "IH23", drop: "I4节点数", from: "if (group.length < 2) {", to: "if (false) {" },
  { id: "NC26", label: "卸掉 I4 的空跑判定", base: "IH24", drop: "I4没比上", from: "if (!compared) {", to: "if (false) {" },
  { id: "NC27", label: "卸掉 I0 的条数锚判定", base: "IH25", drop: "I0条数锚", from: "if (SHAPE_SELF_CHECK_CASES.length !== SHAPE_SELF_CHECK_EXPECTED_COUNT) {", to: "if (false) {" },
  { id: "NC28", label: "卸掉 I0 的哈希锚判定", base: "IH26", drop: "I0哈希锚", from: "if (shapeDigest !== SHAPE_SELF_CHECK_SHA256) {", to: "if (false) {" },
  { id: "NC29", label: "卸掉 I0 的逐条对答案判定", base: "IH27", drop: "I0逐条", from: "if (got !== c.want) {", to: "if (false) {" },
  { id: "NC30", label: "卸掉 I0 的结构性兜底", base: "IH28", drop: "I0没跑起来", from: "if (!shapeSelfCheckPassed) {", to: "if (false) {" },
];

/* ---------------- 跑全部档位 ---------------- */

let pass = 0;
let failCount = 0;
const failures = [];

function keyOf(set) {
  return set.length ? set.join(" + ") : "（无红因）";
}

console.log("身份句柄完整性门禁 · 自测（注入矩阵）\n");

for (const c of CASES) {
  const fx = newFx();
  if (c.apply) c.apply(fx);
  const r = runFx(fx);
  if (r.crashed) {
    failCount++;
    failures.push(`${c.id} ${c.label}：门禁崩了（不是判红，是脚本炸了）\n${r.err.trim()}`);
    console.log(`  ✗ ${c.id} ${c.label} → 门禁崩溃`);
    continue;
  }
  if (r.unknown.length) {
    failCount++;
    failures.push(
      `${c.id} ${c.label}：红因归属不纯（有一条红因落不进任何判据）\n${r.unknown.join("\n")}\n${r.err.trim()}`
    );
    console.log(`  ✗ ${c.id} ${c.label} → 红因归属不纯`);
    continue;
  }
  if (c.expect === "green") {
    if (r.code !== 0 || r.redLines.length) {
      failCount++;
      failures.push(`${c.id} ${c.label}：期望判绿，实际 exit ${r.code}\n${r.err.trim()}`);
      console.log(`  ✗ ${c.id} ${c.label} → 实际判红（不符合预期）`);
      continue;
    }
  } else {
    const want = (c.causes || []).slice().sort();
    const got = r.causes;
    if (r.code !== 1) {
      failCount++;
      failures.push(`${c.id} ${c.label}：期望 exit 1，实际 exit ${r.code}\n${r.err.trim()}`);
      console.log(`  ✗ ${c.id} ${c.label} → 未按预期判红（exit ${r.code}）`);
      continue;
    }
    if (keyOf(want) !== keyOf(got)) {
      failCount++;
      failures.push(
        `${c.id} ${c.label}：红因判据集合应为 ${keyOf(want)}，实际 ${keyOf(got)}\n${r.err.trim()}`
      );
      console.log(`  ✗ ${c.id} ${c.label} → 红因集合不符`);
      continue;
    }
  }
  pass++;
  const detail = c.expect === "green" ? "判绿" : `判红且红因集合恰为 ${keyOf(c.causes)}`;
  console.log(`  ✓ ${c.id} ${c.label} → ${detail}（符合预期）`);
}

for (const nc of NEUTERS) {
  const base = CASES.find((x) => x.id === nc.base);
  if (!base) bail(`负对照 ${nc.id} 引用的基线档 ${nc.base} 不存在。`);
  const fx = newFx();
  if (base.apply) base.apply(fx);
  const baseGate = fx.gate ? fx.gate(gateBefore) : gateBefore;
  let copy = baseGate;
  const count = baseGate.split(nc.from).length - 1;
  if (count !== 1) {
    bail(`负对照 ${nc.id} 的替换目标命中 ${count} 次（应当恰好 1 次）——门禁源码形态变了。`);
  }
  copy = baseGate.split(nc.from).join(nc.to);
  /* 副本与基线副本必须**只差那一行**（行数也要一样）——否则负对照动的不止判据。 */
  const a = baseGate.split("\n");
  const b = copy.split("\n");
  const diff = a.filter((line, i) => line !== b[i]).length;
  if (diff !== 1 || a.length !== b.length) {
    bail(`负对照 ${nc.id}：门禁副本与基线副本差了 ${diff} 行 / 行数 ${a.length}→${b.length}（应当恰好 1 行且行数不变）。`);
  }
  fx.gate = null;
  fx.gateOverride = copy;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mh-ih-nc-"));
  let r;
  try {
    const dir = path.join(tmp, "repo");
    buildSandbox(dir, Object.assign({}, fx, { gate: () => copy }));
    r = runGate(dir);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const want = (base.causes || []).filter((x) => x !== nc.drop).sort();
  const got = r.causes;
  if (r.crashed || r.unknown.length) {
    failCount++;
    failures.push(`${nc.id} ${nc.label}：门禁崩了或红因归属不纯\n${r.err.trim()}`);
    console.log(`  ✗ ${nc.id} ${nc.label} → 门禁崩溃 / 归属不纯`);
    continue;
  }
  if (keyOf(want) !== keyOf(got)) {
    failCount++;
    failures.push(
      `${nc.id} ${nc.label}：卸掉「${nc.drop}」后红因集合应为 ${keyOf(want)}，实际 ${keyOf(got)}\n${r.err.trim()}`
    );
    console.log(`  ✗ ${nc.id} ${nc.label} → 卸判据后红因集合不符`);
    continue;
  }
  if (!want.length && r.code !== 0) {
    failCount++;
    failures.push(`${nc.id} ${nc.label}：卸掉「${nc.drop}」后应判绿，实际 exit ${r.code}\n${r.err.trim()}`);
    console.log(`  ✗ ${nc.id} ${nc.label} → 卸判据后未转绿`);
    continue;
  }
  pass++;
  console.log(
    `  ✓ ${nc.id} ${nc.label} → 卸掉该判据后「${nc.drop}」的红因消失，其余 ${keyOf(want)}（符合预期）`
  );
}

/* ---------------- 红因表自证 ----------------
   ① 每个判据片段必须**真的**出现在门禁源码里（门禁改了文案 ⇒ 本表要跟着改）；
   ② 片段之间**互不包含**（否则一条红因会落进两个判据 ⇒ 归属不纯）。 */
for (const [k, frag] of Object.entries(CAUSES)) {
  if (gateBefore.indexOf(frag) === -1) {
    failCount++;
    failures.push(`红因表自证：判据 ${k} 的文案片段在门禁源码里找不到 ⇒ 门禁文案变了，本表要同步。`);
    console.log(`  ✗ 红因表自证：${k} 的片段在门禁源码里找不到`);
  }
}
const causeKeys = Object.keys(CAUSES);
for (let i = 0; i < causeKeys.length; i++) {
  for (let j = i + 1; j < causeKeys.length; j++) {
    const a = CAUSES[causeKeys[i]];
    const b = CAUSES[causeKeys[j]];
    if (a.indexOf(b) !== -1 || b.indexOf(a) !== -1) {
      failCount++;
      failures.push(
        `红因表自证：判据 ${causeKeys[i]} 与 ${causeKeys[j]} 的文案片段互相包含 ⇒ 一条红因会落进两个判据，归属不纯。`
      );
      console.log(`  ✗ 红因表自证：${causeKeys[i]} 与 ${causeKeys[j]} 的片段互相包含`);
    }
  }
}

/* ---------------- 覆盖度自证 ----------------
   门禁每加一条判据，本自测就必须补一档 —— 否则新判据的「能不能变红」没人证明。
   判据清单是**静态登记**的（不动态生成）：动态登记的话，门禁新加一条判据时
   它连同自己的比较点一起消失 ⇒ 覆盖度自证反而判绿。 */
const covered = new Set();
for (const c of CASES) if (c.criterion) covered.add(c.criterion);
const missing = CRITERIA.filter((id) => !covered.has(id));
if (missing.length) {
  failCount++;
  failures.push(
    `覆盖度自证：门禁判据 ${missing.join("、")} 没有对应的注入档 —— ` +
      `门禁新加了判据，本自测必须补一档（否则新判据「能不能变红」没人证明）。`
  );
  console.log(`  ✗ 覆盖度自证：${missing.join("、")} 没有对应的注入档`);
}
/* 静态清单里的每一条判据都必须**真的存在于门禁源码里**（否则本自测在守一个不存在的东西）。 */
for (const id of CRITERIA) {
  if (gateBefore.indexOf(id) === -1) {
    failCount++;
    failures.push(`覆盖度自证：静态清单里的判据 ${id} 在门禁源码里找不到 —— 清单与门禁对不齐。`);
    console.log(`  ✗ 覆盖度自证：判据 ${id} 在门禁源码里找不到`);
  }
}

/* 门禁原件必须逐字节未变（注入与负对照改的都是副本）。 */
if (fs.readFileSync(GATE, "utf8") !== gateBefore) {
  failCount++;
  failures.push("门禁原件被改了 —— 自测只许改副本，原件必须逐字节未变。");
  console.log("  ✗ 门禁原件被改了");
}

console.log("");
if (failCount) {
  console.error(`身份句柄完整性门禁自测未通过：${pass} 档符合预期，${failCount} 档不符合。\n`);
  failures.forEach((f) => console.error(`  ✗ ${f}\n`));
  process.exit(1);
}
const greens = CASES.filter((c) => c.expect === "green").map((c) => c.id);
console.log(
  `身份句柄完整性门禁自测通过：${pass} 档全部符合预期` +
    `（${greens.join(" / ")} 判绿 · 其余注入档判红且红因判据集合完全相等 · ` +
    `${NEUTERS.length} 档判据级负对照全部转绿或只剩其余红因），` +
    `覆盖门禁全部 ${CRITERIA.length} 条判据（${CRITERIA.join("、")}）。`
);
