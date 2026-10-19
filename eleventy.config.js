/* ============================================================================
 * MeteoHub · Eleventy (v3) 配置文件
 * ----------------------------------------------------------------------------
 *   - 输入根目录：src/
 *   - 输出根目录：
 *       生产构建          → _site/
 *       eleventy --serve  → _site_dev/
 *     ⚠️ 两者必须分开，原因见下面 OUT_DIR 的注释。
 *   - passthrough copy：src/assets/ → /assets/
 *   - collections：portfolio / blog / papers
 *   - filters：date / readingTime / excerpt / year / tagList / status / head
 *   - 默认模板语言：njk + md（11ty 自带 Markdown 引擎，无需 marked）
 * ========================================================================== */

const { DateTime } = require("luxon");
const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// 输出目录：dev server 与生产构建必须写不同的目录
// ---------------------------------------------------------------------------
// 问题：serve 模式与生产构建的 pathPrefix 可能不同（serve 强制为 "/"，
// 生产可用 PATH_PREFIX 覆盖）。两者产出的 HTML 里的资源路径会不一样。
//
// 如果它们写同一个目录，就会出现：dev server 正在 8080 上跑着，你随手
// 执行一次 `npm run build`，_site/ 被生产版覆盖，而 dev server 仍然按
// 根路径提供文件 → 页面上**所有**图片与 CSS 一起 404，整站看起来像坏了。
// 这个坑在开发期间已经踩了 4 次，每次都要重新排查一轮。
//
// 拆成两个目录后两种模式的产物互不干扰，build 与 serve 可以同时运行。
// 判定只看 `--serve`，不看 NODE_ENV：NODE_ENV=production + --serve 仍然
// 需要根路径预览（只是 CSS 用生产版），产物同样不能进 _site/。
const IS_SERVE_MODE = process.argv.includes("--serve");
const OUT_DIR = IS_SERVE_MODE ? "_site_dev" : "_site";

// macOS Finder 会在 patch/write 时自动产生 ._<name> 资源叉备份，
// 11ty 会把它当成模板加载并 SyntaxError。
// 这里在 build 启动时主动清掉所有 src/ 下的 ._* 临时副本（不影响真实文件）。
function stripMacResourceForks(rootDir) {
  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    for (const ent of entries) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        stack.push(p);
      } else if (ent.name.startsWith("._")) {
        try {
          fs.unlinkSync(p);
        } catch (_) {}
      }
    }
  }
}
stripMacResourceForks(path.join(__dirname, "src"));

/**
 * 构建前清空输出目录。
 * Eleventy **不会**删除输出目录里的旧文件——只覆盖本次会写出的那部分。
 * 于是上一版残留的东西会一直躺在 _site/ 里：被删掉的版块留下的空目录、
 * 改名前的图片、旧的 sitemap……本地预览时看不出问题，但一旦把整个目录
 * 当作产物上传（手动部署、或本地 http-server 验证），垃圾文件就一起发了出去。
 * 产物目录是纯可再生的，删干净最省心。
 */
function cleanOutputDir(dirName) {
  const dir = path.join(__dirname, dirName);
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    fs.rmSync(path.join(dir, entry.name), { recursive: true, force: true });
  }
}
cleanOutputDir(OUT_DIR);

module.exports = function (eleventyConfig) {
  /* ---------- 1. passthrough copy ---------- */
  // 整个 assets/ 目录：CSS / JS / fonts / 项目封面图 全部直拷
  // macOS 上 cp -R 会附带 ._<name> 资源叉备份（每个文件多出 256KB xattr），
  // 通过显式列 glob 跳过 ._* 副本，保证 _site/ 里干净。
  const assetGlobs = [
    "src/assets/css/*.css",
    // Phase 2B.5：components 拆分后，partial 文件需要单独直拷到 _site，
    // 让 dev mode 下 index.css 的 @import 能命中。components.css 本身
    // 由下方 eleventy.after 钩子按 dev/prod 双模生成（dev: @import hub,
    // prod: concat），不通过 passthroughCopy。
    "src/assets/css/components/*.css",
    "src/assets/js/*.js",
    // Phase 2B.6: paper-reader.js 拆为 6 个 ESM 子模块（main/toc/annotations/
    // reading-progress/highlight/theme），在 paper 页动态 import。
    // 与 11 老的 src/assets/js/paper-reader.js 共存：老文件仅 5 行 re-export，
    // 兜底外部旧引用（如有）；后续可在 QA 验证稳定后删除。
    "src/assets/js/paper-reader/*.js",
    "src/assets/fonts/**/*",
    // 顶层 favicon 类 SVG（向后兼容 .DS_Store / Apple touch 图）
    "src/assets/*.svg",
    // 递归覆盖 src/assets/img/ 子树（og:image、paper 配图、avatar 等）。
    // Phase 1.3 起 src/assets/img/og/ 下有三组 SVG + PNG 双格式。
    "src/assets/img/**/*.{svg,png,jpg,jpeg,webp}",
  ];
  for (const glob of assetGlobs) {
    eleventyConfig.addPassthroughCopy(glob);
  }

  // 论文批注 / 论文正文里的附图（如 cover.svg / cover.png）原样拷贝到 _site/，
  // 让 paper-reader.js 在客户端能 fetch 到 annotations.json。
  eleventyConfig.addPassthroughCopy("src/content/papers/**/annotations.json");
  // Paper 封面图（og:image / twitter:image override 的素材）。Phase 2B.1 起 paper 页
  // front-matter 可指定 cover。src/content/ 是 11ty 模板输入区，但 11ty v3.1 passthrough
  // 对 src/content/ 子目录的 pass 有缺陷（assetGlobs 不递归 substring），用 eleventy.after
  // 钩子在 build 后手工 cp 到 _site，避免 11ty passthrough 的 path prefix 解析问题。
  const copyCovers = () => {
    // 三个 section 的 permalink 都是 /<section>/<slug>/，slug 就是内容目录名
    // （getSlugFromData 取的也是目录名），所以按 section 各自映射就能让封面图
    // 落在与 index.html 同级的位置，模板用相对文件名引用即可命中。
    // 早先这里只处理 papers，blog / portfolio 的封面永远进不了 _site。
    for (const section of ["papers", "blog", "portfolio"]) {
      const srcRoot = path.join(__dirname, "src/content", section);
      const destRoot = path.join(__dirname, OUT_DIR, section);
      if (!fs.existsSync(srcRoot)) continue;
      for (const slug of fs.readdirSync(srcRoot)) {
        const contentDir = path.join(srcRoot, slug);
        if (!fs.statSync(contentDir).isDirectory()) continue;
        for (const ext of ["svg", "png", "jpg", "jpeg", "webp"]) {
          const src = path.join(contentDir, `cover.${ext}`);
          const dest = path.join(destRoot, slug, `cover.${ext}`);
          if (fs.existsSync(src)) {
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.copyFileSync(src, dest);
          }
        }
      }
    }
  };

  // 顶层 favicon（可选，避免 404）
  eleventyConfig.addPassthroughCopy("src/favicon.ico");

  /* ---------- 1b. Phase 2B.5：components 拆分 → dev/prod 双模生成 ----------
     dev 模式（eleventy --serve）：
       <OUT_DIR>/assets/css/components.css = @import hub，浏览器按需拉取 7 个 partial
       每个 partial 独立缓存，IDE 跳转精准，修改某个组件无需重载整个文件。
     prod 模式（任何非 serve 的构建）：
       <OUT_DIR>/assets/css/components.css = 7 个 partial 按顺序 concat 后的单文件
       减少 HTTP 请求数（prod 单文件让浏览器一次请求拿全部内容）；
       线上 GitHub Pages 走的就是这条。

     判定放在配置里而不是只认 NODE_ENV：package.json 的 build 脚本和
     .github/workflows/deploy.yml 的 build 步骤都是裸 `eleventy`，没有任何人
     设 NODE_ENV —— 之前线上因此一直拿到 dev 版 @import hub，每页多 7 个 CSS
     请求，和这里注释写的意图正好相反。改成「只有 --serve 才是 dev」之后，
     任何构建入口（npm run build / npx eleventy / CI）都默认出生产产物，
     行为不再依赖调用方记得设环境变量。NODE_ENV=production 仍可用来让
     --serve 也出生产产物，方便部署前在本地预览线上真实 CSS。
  */
  const isDevServer =
    process.argv.includes("--serve") && process.env.NODE_ENV !== "production";
  const isProductionBuild = !isDevServer;

  eleventyConfig.on("eleventy.after", () => {
    const compDir = path.join(__dirname, "src/assets/css/components");
    const outFile = path.join(__dirname, OUT_DIR, "assets/css/components.css");
    const order = ["_nav", "_button", "_badge", "_card", "_list", "_paper", "_misc"];

    let body;
    if (isProductionBuild) {
      // prod：直接拼接 7 个 partial，每个之间加空行便于阅读 + 让 minifier
      // 在源头就保留分块（如果未来加 csso / clean-css 还能按块合并）。
      const parts = order.map((name) => {
        const p = path.join(compDir, `${name}.css`);
        const c = fs.readFileSync(p, "utf8").trim();
        return `/* ---- ${name}.css ---- */\n${c}`;
      });
      body = `/* ===========================================================================
   MeteoHub · Components · bundled (production)
   由 eleventy.after 钩子按 src/assets/css/components/index.css 顺序拼接。
   请编辑 partial 文件而非本文件 —— 下次 build 会被覆盖。
   ========================================================================= */

` + parts.join("\n\n") + "\n";
    } else {
      // dev：@import hub。相对路径 './components/_xxx.css' 相对于
      // _site/assets/css/components.css 解析，对应 partial 直拷后的位置。
      body =
        `/* ===========================================================================
   MeteoHub · Components · dev hub
   由 eleventy.after 钩子按 src/assets/css/components/index.css 顺序生成。
   修改 partial 文件后请重启 dev server（11ty 不会监听 fs.readFileSync 调用）。
   ========================================================================= */

` +
        order.map((name) => `@import url("./components/${name}.css");`).join("\n") +
        "\n";
    }

    // 确保 _site/assets/css/ 目录存在（首次构建时 _site 可能未生成）
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, body, "utf8");

    // Phase 2B.1 paper og:image override 依赖 cover.{svg,png,...} 复制到 _site。
    // 11ty v3.1 passthrough 对 src/content/ 子目录的图像处理有缺陷（pathPrefix 不会
    // 重新映射子目录），所以这里在 build 后手工 cp，保证 og:image / twitter:image 引用可达。
    copyCovers();

    // 构建产物 _site/ 里同样会长出 ._*，而且拦不住：上面开头的 stripMacResourceForks
    // 只清了 src/，这些副本是 passthrough copy 过程中在 exFAT 目标盘上被重新生成的
    // —— src/ 干净的情况下 _site/ 仍有 80 个，共 320KB 垃圾，且 11ty 的
    // `ignores: ["**/._*"]` 只作用于模板输入、对 passthrough 无效。
    // 这里只清 _site/ 这一个纯产物目录（不碰 src、不碰任何用户数据），
    // 语义与 deploy.yml 里的 `find _site -name '._*' -type f -delete` 一致，
    // 让本地产物和 CI 上传的内容保持相同。
    stripMacResourceForks(path.join(__dirname, OUT_DIR));
  });

  /* ---------- 2. 监视：build 后页面刷新 ---------- */
  eleventyConfig.setServerOptions({
    port: 8080,
    showAllErrors: true,
  });

  /* ---------- 3. 集合（collections）——
     见 §7 的最终定义（同时加入排序 + 维持对 .11tydata.cjs 默认 permalink/layout 的支持）。
  */

  /* ---------- 4. filters ---------- */
  // date：ISO 串 → "2026-09-12"
  // zone 必须钉在 UTC：YAML front-matter 里 `date: 2026-09-12` 被解析成
  // 2026-09-12T00:00:00Z，而 fromJSDate 默认换算到本地时区，在 UTC 以西的机器上
  // 会退回前一天（显示 2026-09-11）。日期是内容作者写的日历日，不该随时区漂移。
  eleventyConfig.addFilter("date", (value, fmt = "yyyy-LL-dd") => {
    if (!value) return "";
    const d = value instanceof Date
      ? DateTime.fromJSDate(value, { zone: "utc" })
      : DateTime.fromISO(String(value), { zone: "utc" });
    return d.isValid ? d.toFormat(fmt) : String(value);
  });

  // readingTime：默认 200 字/分钟，向上取整
  eleventyConfig.addFilter("readingTime", (content, wordsPerMin = 200) => {
    if (!content) return 1;
    // 中英文混合：粗略按字数（1 个汉字 = 1 word）
    const len = String(content).length;
    return Math.max(1, Math.ceil(len / wordsPerMin));
  });

  // excerpt：从正文抽前 N 字作为摘要
  eleventyConfig.addFilter("excerpt", (content, n = 80) => {
    if (!content) return "";
    const text = String(content)
      .replace(/```[\s\S]*?```/g, " ")   // 去代码块
      .replace(/[#>*_\-\[\]\(\)`>]/g, " ") // 去 Markdown 符号
      .replace(/\s+/g, " ")
      .trim();
    return text.length > n ? text.slice(0, n) + "…" : text;
  });

  // year：取 date 的年份
  eleventyConfig.addFilter("year", (value) => {
    if (!value) return new Date().getFullYear();
    const d = value instanceof Date ? value : new Date(value);
    return d.getFullYear();
  });

  // readingStatus 中文标签
  eleventyConfig.addFilter("statusLabel", (s) => {
    return { finished: "已完成", reading: "精读中", queued: "待整理" }[s] || s || "";
  });

  // dateToRfc3339：Date 对象 → RFC3339 字符串（RSS pubDate / lastBuildDate）
  eleventyConfig.addFilter("dateToRfc3339", (value) => {
    if (!value) return "";
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return "";
    return d.toISOString();
  });

  // dateToIso：Date 对象 → ISO 字符串（sitemap lastmod）
  eleventyConfig.addFilter("dateToIso", (value) => {
    if (!value) return "";
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return "";
    return d.toISOString();
  });

  // head(n)：取前 n 项（默认 3）
  eleventyConfig.addFilter("head", (arr, n = 3) => {
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, n);
  });

  /* ---------- 4b. bibtex filter：BibTeX 条目生成 ----------
     输入 site.publications 里的一个 publication 对象，输出一条完整的 BibTeX
     @article 记录。给 /publications.bib 用（见 src/publications.bib.njk）。

     为什么需要它：学术主页提供 BibTeX 是硬需求——引用我的人不该手敲条目。
     Zotero / Mendeley / EndNote 都能直接导入 .bib。

     几个容易做错的地方，这里都处理了：
       · 作者名 "Xueke Wu" → "Wu, Xueke"。BibTeX 用「姓, 名」，
         直接把 "First Last" 塞进去，文献管理软件会把它当姓在前，列表全乱。
       · 引用键必须唯一且稳定。这里用「第一作者姓 + 年份 + 标题首个实词」，
         同一篇每次构建生成同一个键（确定性），不同篇不会撞。
       · 花括号在 BibTeX 里是结构符号（用来保护大小写），**不能转义**；
         真正需要转义的是 & % $ # _ 这几个，它们在 LaTeX 里有特殊含义。
       · 字段一律判空再输出。缺 DOI 就不写 doi 字段，而不是写一条空的
         ——空字段在某些管理器里会变成 "doi: null"。
  */
  const BIB_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun",
                      "jul", "aug", "sep", "oct", "nov", "dec"];

  /* ---------- 4b-1. 论文数据访问的三个小 filter ----------
     论文元数据现在有两处消费方：列表页卡片（partials/publications.njk）、
     论文独立页（content/papers/<key>/paper.md → layouts/paper.njk），
     再加上 BibTeX 导出和 JSON-LD。四处都从**同一份** authorList 取作者，
     不要再各自 split 字符串——那正是此前"两处走样"的根源。

     · pubByKey(pubs, key)  按 key 取一条论文（论文页 front-matter 用 pubKey 指回来）
     · authorNames(pub)     → ["Xueke Wu", "Yihang Lyu", ...]（显示用）
     · authorBibtex(pub)    → "Wu, Xueke and Lyu, Yihang and ..."（BibTeX 用）
  */
  eleventyConfig.addFilter("pubByKey", (pubs, key) => {
    if (!Array.isArray(pubs) || !key) return null;
    return pubs.find((p) => p && p.key === key) || null;
  });

  eleventyConfig.addFilter("authorNames", (pub) => {
    const list = (pub && pub.authorList) || [];
    return list.map((a) => a.name || [a.given, a.family].filter(Boolean).join(" ")).filter(Boolean);
  });

  eleventyConfig.addFilter("authorBibtex", (pub) => {
    const list = (pub && pub.authorList) || [];
    return list
      .map((a) => {
        const name = a.name || [a.given, a.family].filter(Boolean).join(" ");
        const parts = name.split(/\s+/);
        if (parts.length < 2) return name;
        const last = parts.pop();
        return `${last}, ${parts.join(" ")}`;
      })
      .join(" and ");
  });

  eleventyConfig.addFilter("bibtex", (pub) => {
    if (!pub) return "";
    const esc = (v) =>
      v == null ? "" : String(v).replace(/[&%$#_]/g, (c) => "\\" + c);

    // 作者：优先用结构化 authorList（"Wu, Xueke and Lyu, Yihang"）；
    // 没有 authorList 的旧条目退回字符串 split，两种写法都吃。
    let authors = "";
    if (Array.isArray(pub.authorList) && pub.authorList.length) {
      authors = pub.authorList
        .map((a) => {
          const name = a.name || [a.given, a.family].filter(Boolean).join(" ");
          const parts = name.split(/\s+/);
          if (parts.length < 2) return name;
          const last = parts.pop();
          return `${last}, ${parts.join(" ")}`;
        })
        .join(" and ");
    } else {
      authors = String(pub.authors || "")
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean)
        .map((n) => {
          const parts = n.split(/\s+/);
          if (parts.length < 2) return n;
          const last = parts.pop();
          return `${last}, ${parts.join(" ")}`;
        })
        .join(" and ");
    }

    // 引用键：第一作者姓 + 年份 + 标题里第一个有意义的实词
    const firstAuthor = (Array.isArray(pub.authorList) && pub.authorList.length
      ? pub.authorList[0].name
      : String(pub.authors || "").split(",")[0].trim()) || "";
    const surname = (firstAuthor.split(/\s+/).pop() || "anon");
    const STOP = new Set(["the", "and", "for", "from", "with", "into", "over", "a", "an", "new"]);
    const word = String(pub.title || "")
      .split(/\s+/)
      .map((w) => w.replace(/[^A-Za-z0-9]/g, ""))
      .find((w) => w.length > 2 && !STOP.has(w.toLowerCase())) || "untitled";
    const key = `${surname}${pub.year || "nd"}${word}`.replace(/[^A-Za-z0-9]/g, "");

    const f = [];
    const put = (name, value) => {
      if (value == null || value === "") return;
      f.push(`  ${name.padEnd(8)} = {${value}},`);
    };
    put("author", authors);
    put("title", esc(pub.title));
    put("journal", esc(pub.shortJournal || pub.journal));
    put("year", pub.year);
    if (pub.month) {
      const m = BIB_MONTHS[Number(pub.month) - 1];
      if (m) put("month", m);
    }
    put("volume", pub.volume);
    put("number", pub.issue);
    // AGU 用 e-locator（e2026JD046836）代替页码，放 pages 字段是社区惯例
    put("pages", pub.pages || pub.articleNumber);
    put("doi", pub.doi);
    put("url", pub.url);
    // ISSN：AGU 同时有 print / electronic 两个，Zotero 等管理器认 issn 字段
    if (pub.issn) put("issn", pub.issn.print || pub.issn.electronic);
    // ORCID：只有**每一位**作者都有 ORCID 时才整体输出。
    // 部分作者有、部分没有时输出会错配（Zotero 按位置配对），宁可不给。
    if (Array.isArray(pub.authorList) && pub.authorList.length &&
        pub.authorList.every((a) => a && a.orcid)) {
      put("orcid", pub.authorList.map((a) => a.orcid).join(" "));
    }
    return `@article{${key},\n${f.join("\n")}\n}`;
  });

  /* ---------- 4b-2. resourceBibtex filter：数据 / 胶囊的引用条目 ----------
     论文页的 "Data and code availability" 区块要给出**可复制的引用条目**。
     理由很直接：读者的下一动作往往不是"点开下载"，而是"在我的论文里
     引用这份数据"。只给一个链接，读者还得自己回 Zenodo 拼字段。

     为什么不用 @article：数据/软件不是期刊文章。DataCite 的注册类型是
     Dataset / Software，BibTeX 里对应 @dataset / @software（ biblatex
     的类型；纯 BibTeX 用户也能正常解析，字段名是通用的）。

     字段一律判空：缺就是缺，不写空串——空字段会让引用管理器存下一个
     带空标题的条目，比没有更糟。
  */
  eleventyConfig.addFilter("resourceBibtex", (res, kind) => {
    if (!res) return "";
    const esc = (v) =>
      v == null ? "" : String(v).replace(/[&%$#_]/g, (c) => "\\" + c);

    const type = kind === "software" ? "@software" : "@dataset";
    // 引用键：姓 + 年 + 标题首个实词，和论文条目的键规则保持一致
    const surname = String(res.citeAuthor || "anon").split(",")[0].trim().split(/\s+/).pop();
    // 停用词：这些词做引用键毫无区分度。
    // "new" 尤其要排掉——胶囊标题以 "New Insights from TRMM Legacy…" 开头，
    // 不排的话键会变成 lyu2026new，谁也看不出指的是什么。
    const STOP = new Set(["the", "and", "for", "from", "with", "into", "over", "a", "an", "of", "new"]);
    const word = String(res.citeTitle || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .find((w) => w && !STOP.has(w)) || "data";
    const key = `${String(surname || "anon").toLowerCase()}${res.citeYear || ""}${word}`;

    const f = [];
    const put = (k, v) => {
      if (v == null || v === "") return;
      f.push(`  ${k.padEnd(9)} = {${esc(v)}},`);
    };
    put("author", res.citeAuthor);
    put("title", res.citeTitle);
    put("year", res.citeYear);
    put("publisher", res.publisher);
    // version 字段：**只取 citeVersion**，不取 res.version。
    //
    // 为什么不能直接用 res.version：Zenodo 那条数据的版本号（2.0）指的是
    // **DOI 指向的那一版**，而它的标题（沿用论文参考文献表）写的是 **v1.0
    // 时期的名字**。若把 version=2.0 和 v1.0 的标题、v2.0 的 DOI 放在一起，
    // 生成的引用条目就自相矛盾了——读者一查 Zenodo 就会发现标题对不上。
    //
    // citeVersion 缺省即不输出该字段：论文参考文献表里那条本身也没有版本号，
    // 省掉它既与原文一致，也消掉了上面那个矛盾。
    put("version", res.citeVersion);
    put("doi", res.doi);
    put("url", res.url);
    put("license", res.license);
    put("keywords", res.keywords);
    return `${type}{${key},\n${f.join("\n")}\n}`;
  });

  /* ---------- 4c. jsonLdArticles filter：ScholarlyArticle 结构化数据 ----------
     输出 schema.org 的 ScholarlyArticle 数组，给 base.njk 的 <script
     type="application/ld+json"> 用。

     ⚠️ **重要更正**：此前这段注释写着"Google Scholar 读的就是这个类型——
     研究者主页上'论文列表'这一块能不能被检索到，靠它"。**这是错的。**
     Google Scholar **不读 JSON-LD**，它只认 Highwire Press 的
     `citation_*` <meta> 标签（见 partials/citation-meta.njk）。
     JSON-LD 是给通用 schema.org 消费方（Bing 实体、Wikipedia、Google
     的普通检索富结果）用的；两套都得有，缺一不可，但不是同一套。
     真正让论文进 Google Scholar 的是 citation-meta.njk 里的 meta 标签。

     和 Person 那一段（base.njk 里）配合：Person 描述"我是谁"，
     ScholarlyArticle 描述"我产出过什么"，两边用同一个 ORCID 串起来，
     搜索引擎才能把论文和作者识别成同一实体。

     几个细节：
       · 作者从结构化 authorList 取，每人一个 Person 对象；带 ORCID 的
         额外挂 sameAs → 这是把论文和本人绑定的关键。
       · 没有 DOI 的条目照样输出，只是少 identifier 字段——schema.org
         允许缺字段，但不允许字段值为空字符串。
       · datePublished 用 "YYYY-MM" 的粒度：AGU 论文的日期粒度就到月，
         写成天反而是编造。
       · isAccessibleForFree 取数据里的 openAccess，**不再写死 true**：
         对付费墙内的论文写 true 是假声明。
  */
  eleventyConfig.addFilter("jsonLdArticles", (pubs, ownerOrcid, excludeKey) => {
    if (!Array.isArray(pubs) || !pubs.length) return [];
    const ownerName = "Yihang Lyu"; // 与 site.author.nameAsPublished 一致
    // excludeKey：当前页自己就是某篇论文时（/papers/<slug>/），那篇由
    // paper.njk 输出更完整的 ScholarlyArticle，这里必须**排除掉**。
    // 否则同一页上会出现同一篇论文的两个实体描述（url 一个指向出版商、
    // 一个指向本页），消费方容易当成两件不同的工作。
    // ⚠️ 少写这个参数会让排除静默失效——base.njk 传的第三个实参会被
    //   JS 直接丢弃，不报错，页面照出，只有实体重复。
    const list = excludeKey ? pubs.filter((p) => p && p.key !== excludeKey) : pubs;
    return list.map((p) => {
      const authorList = Array.isArray(p.authorList) && p.authorList.length
        ? p.authorList
        : String(p.authors || "")
            .split(",")
            .map((n) => n.trim())
            .filter(Boolean)
            .map((n) => ({ name: n, orcid: null }));

      const authors = authorList.map((a) => {
        const person = { "@type": "Person", name: a.name };
        if (a.orcid) person.sameAs = `https://orcid.org/${a.orcid}`;
        if (a.name === ownerName && ownerOrcid) person.sameAs = ownerOrcid;
        return person;
      });

      const article = {
        "@type": "ScholarlyArticle",
        headline: p.title,
        name: p.title,
        author: authors,
      };
      // url：优先用出版商页面，没有 DOI 时退回 doi.org 解析地址；
      // 两者都没有就整个字段不出现（Nunjucks 的 dump 走 JSON.stringify，
      // undefined 的属性会被自动丢掉，不会漏出 "url": undefined）。
      if (p.url) article.url = p.url;
      else if (p.doi) article.url = `https://doi.org/${p.doi}`;

      if (p.journal) {
        article.isPartOf = {
          "@type": "Periodical",
          name: p.journal,
        };
      }
      if (p.year) {
        article.datePublished = p.month
          ? `${p.year}-${String(p.month).padStart(2, "0")}`
          : String(p.year);
      }
      if (p.volume) article.volume = p.volume;
      if (p.issue) article.issue = p.issue;
      if (p.pages || p.articleNumber) article.pageStart = p.pages || p.articleNumber;
      if (p.doi) {
        article.identifier = `https://doi.org/${p.doi}`;
        article.sameAs = `https://doi.org/${p.doi}`;
      }
      if (p.pdf) article.encoding = {
        "@type": "MediaObject",
        contentUrl: p.pdf,
        encodingFormat: "application/pdf",
      };
      // 摘要：有就写。ScholarlyArticle 的 abstract 字段是摘要的规范落点，
      // 缺失时搜索引擎会用 og:description 顶替（那句是站点自我介绍，不是摘要）。
      if (p.abstract) article.abstract = p.abstract;
      // 开放获取状态：数据驱动。见 openAccess 字段的注释。
      if (p.openAccess !== undefined) article.isAccessibleForFree = !!p.openAccess;
      // ISSN：print / electronic 都登记，schema.org 用 issn 数组。
      if (p.issn) {
        const issn = [p.issn.print, p.issn.electronic].filter(Boolean);
        if (issn.length) article.issn = issn;
      }
      // 出版方：AGU 是出版方本人，标出来读者才知道该往哪投稿/找编辑。
      if (p.publisher) {
        article.publisher = { "@type": "Organization", name: p.publisher };
      }
      // 关键词。
      if (Array.isArray(p.keywords) && p.keywords.length) {
        article.keywords = p.keywords.join(", ");
      }
      return article;
    });
  });

  /* ---------- 4c. jsonLdPaper filter：论文页的完整 JSON-LD @graph ----------
     输出一整个对象：{ "@context": ..., "@graph": [文章, 数据集, 胶囊] }。

     为什么要从模板搬进 filter：
       ① 模板里手写 JSON 字符串，转义全靠 `| dump | safe` 逐字段拼；
          字段一多，逗号和引号很容易写错，而且错了 JSON.parse 才报。
       ② 现在要给同一页加**两个新实体**（数据集 + 可复现胶囊），
          它们要靠 @id 与文章互相引用（文章的 citation 指向数据集，
          数据集的 isPartOf 指回文章）。手写 JSON 写这种交叉引用极易错位。
       ③ filter 走 JSON.stringify，undefined 的字段自动消失，
          不会出现 "url": undefined 这种脏输出。

     实体类型**不是自己另立的**，而是沿用 DataCite 自己对这两条记录的
     schema.org 映射（2026-10-19 用 api.datacite.org 实测）：
       10.5281/zenodo.18041880 → types.schemaOrg = "Dataset"
       10.24433/CO.6720035.v1  → types.schemaOrg = "SoftwareSourceCode"
     DataCite 是 DOI 注册机构，它给的映射就是权威口径。
  */
  eleventyConfig.addFilter("jsonLdPaper", (pub, siteData, pageUrl) => {
    if (!pub) return null;
    const A = (siteData && siteData.author) || {};
    const siteUrl = (siteData && siteData.url) || "";
    const pagePath = pageUrl || "";
    const selfUrl = `${siteUrl}${pagePath}`;
    const ownerName = A.nameAsPublished || A.name || "";

    // —— 作者：与原模板逐字段一致 ——
    const authorList = Array.isArray(pub.authorList) ? pub.authorList : [];
    const authors = authorList.map((a) => {
      const person = { "@type": "Person", name: a.name };
      if (a.name === ownerName) {
        // 本人：sameAs 用全集（第一条就是 ORCID）。不能另加一条 a.orcid 的
        // sameAs——同一对象里两个同名键，后者会静默覆盖前者。
        if (A.sameAs) person.sameAs = A.sameAs;
        if (A.alternateName || A.fullName) {
          person.alternateName = A.alternateName || A.fullName;
        }
        if (A.jobTitle || A.role) person.jobTitle = A.jobTitle || A.role;
        person.url = `${siteUrl}/`;
      } else if (a.orcid) {
        // 其他作者只给自己的那一条 ORCID，没有就不给（不编造）。
        person.sameAs = `https://orcid.org/${a.orcid}`;
      }
      return person;
    });

    const article = {
      "@type": "ScholarlyArticle",
      // @id 用页面的绝对地址。数据集的 isPartOf 指回它，两边就能对上。
      "@id": selfUrl,
      headline: pub.title,
      name: pub.title,
      url: selfUrl,
    };
    if (pub.year) {
      article.datePublished =
        pub.dates && pub.dates.published ? pub.dates.published : `${pub.year}-01-01`;
    }
    article.inLanguage = "en";
    // 开放获取状态取数据，不写死（付费墙内的论文写 true 是假声明）。
    if (pub.openAccess !== undefined) article.isAccessibleForFree = !!pub.openAccess;
    if (authors.length) article.author = authors;
    if (pub.journal) {
      const periodical = { "@type": "Periodical", name: pub.journal };
      if (pub.issn) {
        const issn = [pub.issn.print, pub.issn.electronic].filter(Boolean);
        if (issn.length) periodical.issn = issn;
      }
      article.isPartOf = periodical;
    }
    if (pub.publisher) {
      article.publisher = { "@type": "Organization", name: pub.publisher };
    }
    if (pub.volume) article.volume = pub.volume;
    if (pub.issue) article.issue = pub.issue;
    if (pub.pages || pub.articleNumber) {
      article.pageStart = pub.pages || pub.articleNumber;
    }
    if (pub.doi) {
      article.identifier = `https://doi.org/${pub.doi}`;
      article.sameAs = `https://doi.org/${pub.doi}`;
    }
    if (pub.pdf) {
      article.encoding = {
        "@type": "MediaObject",
        contentUrl: pub.pdf,
        encodingFormat: "application/pdf",
      };
    }
    if (pub.abstract) article.abstract = pub.abstract;
    if (Array.isArray(pub.keywords) && pub.keywords.length) article.keywords = pub.keywords;
    article.mainEntityOfPage = { "@type": "WebPage", "@id": selfUrl };

    // —— 资源实体（数据集 / 可复现胶囊）——
    const creator = { "@type": "Person", name: ownerName };
    if (A.sameAs) creator.sameAs = A.sameAs;
    const resources = [];

    const sw = pub.software;
    if (sw && sw.doi && sw.url) {
      const dataset = {
        "@type": "Dataset",
        // @id 就是 DOI 解析地址——这条数据集的身份 IRI。文章的 citation
        // 引用它时用同一个 IRI，两边自动对上。
        "@id": `https://doi.org/${sw.doi}`,
        // name 用**这一版在 DataCite 登记的标题**：读者点开 DOI 看到的就是它，
        // 登记名与页面显示名不一致才是真问题。citeTitle（论文参考文献表里
        // 那条的标题）是另一回事，页面上两个标题都摆出来并说明差异。
        name: sw.registeredTitle || sw.citeTitle || sw.label,
        url: sw.url,
        identifier: `https://doi.org/${sw.doi}`,
        sameAs: `https://doi.org/${sw.doi}`,
        creator: { ...creator },
        isPartOf: { "@id": selfUrl },
      };
      if (sw.version) dataset.version = sw.version;
      if (sw.publisher) {
        dataset.publisher = { "@type": "Organization", name: sw.publisher };
      }
      if (sw.licenseUrl || sw.license) dataset.license = sw.licenseUrl || sw.license;
      if (Array.isArray(pub.keywords) && pub.keywords.length) dataset.keywords = pub.keywords;
      resources.push(dataset);
    }

    const cap = pub.capsule;
    if (cap && cap.doi && cap.url) {
      const code = {
        "@type": "SoftwareSourceCode",
        "@id": `https://doi.org/${cap.doi}`,
        name: cap.citeTitle || cap.label,
        url: cap.url,
        identifier: `https://doi.org/${cap.doi}`,
        sameAs: `https://doi.org/${cap.doi}`,
        codeRepository: cap.url,
        creator: { ...creator },
        runtimePlatform: cap.publisher || "Code Ocean",
      };
      if (cap.version) code.version = cap.version;
      if (cap.publisher) {
        code.publisher = { "@type": "Organization", name: cap.publisher };
      }
      if (cap.licenseUrl || cap.license) code.license = cap.licenseUrl || cap.license;
      // 胶囊里打包的就是这份数据（代码 + 数据 + 运行环境），
      // 所以它基于该数据集；数据集没有就跳过这条关系。
      if (sw && sw.doi) code.isBasedOn = { "@id": `https://doi.org/${sw.doi}` };
      resources.push(code);
    }

    // 文章 → 资源：用 @id 引用同一个 @graph 里的节点。
    // 语义是"这篇文章用到的可引用产出"（schema.org 的 citation 属性）。
    if (resources.length) {
      article.citation = resources.map((r) => ({ "@id": r["@id"] }));
    }

    return { "@context": "https://schema.org", "@graph": [article, ...resources] };
  });

  /* ---------- 4d. feedItems filter：RSS 条目列表 ----------
     输入 publications 与 blog 集合，输出**按日期倒序**的 feed 条目数组。

     背景（2026-10-19 第五轮）：/feed.xml 此前只有 blog 集合这一个数据源，
     而 collections.blog 是空的（技术笔记都发在 CSDN 上），于是
     **feed 里一条 item 都没有**——页脚却实实在在挂着一个 RSS 入口。
     一个点开永远是空白的订阅源，比没有订阅源更糟。
     改法：把论文也放进 feed。学术访客订阅这个站，真正想收到的就是
     "有新论文了"，而不是"有人在 CSDN 上写了 Python 笔记"。

     论文条目的链接指向论文独立页（/papers/<slug>/），不是出版商页面——
     站内页面才带摘要、关键词、数据与代码可用性、引用块。
  */
  const toMs = (value) => {
    if (!value) return 0;
    const d = value instanceof Date ? value : new Date(value);
    const t = d.getTime();
    return isNaN(t) ? 0 : t;
  };

  eleventyConfig.addFilter("feedItems", (pubs, posts, ownerName) => {
    const items = [];
    for (const p of Array.isArray(pubs) ? pubs : []) {
      if (!p || !p.title) continue;
      items.push({
        kind: "paper",
        title: p.title,
        path: p.slug ? `/papers/${p.slug}/` : "/papers/",
        // 出版日期取 DataCite/Crossref 登记的发表日，不是建站日。
        date: (p.dates && p.dates.published) || p.date || null,
        description: p.abstract || "",
        creators: (Array.isArray(p.authorList) ? p.authorList : [])
          .map((a) => a && a.name)
          .filter(Boolean),
        categories: (Array.isArray(p.keywords) ? p.keywords : []).slice(0, 5),
        doi: p.doi || "",
      });
    }
    for (const post of Array.isArray(posts) ? posts : []) {
      const d = (post && post.data) || {};
      // tags 里混着集合名（"blog"），那是内部标记，不该出现在订阅源里。
      const cats = (Array.isArray(d.tags) ? d.tags : []).filter(
        (t) => t && t !== "blog"
      );
      items.push({
        kind: "note",
        title: d.title || "",
        path: (post && post.url) || "",
        date: (post && post.date) || null,
        description: d.excerpt || "",
        creators: ownerName ? [ownerName] : [],
        categories: cats.slice(0, 5),
        doi: "",
      });
    }
    // 新的在前。日期缺失的条目排到最后（toMs 返回 0）。
    return items.sort((a, b) => toMs(b.date) - toMs(a.date));
  });

  /* ---------- 5. markdown filter（11ty v3 默认 Markdown 模板引擎已内置，
                          这里额外注册一个 filter，便于在 Nunjucks 字符串上调用）*/
  const MarkdownIt = require("markdown-it");
  const md = new MarkdownIt({ html: true, linkify: true, typographer: true });
  eleventyConfig.addFilter("md", (value) => (value ? md.render(String(value)) : ""));

  /* ---------- 5b. 内联 CSS shortcode ----------
     {% inlineCss "src/assets/css/tokens.css" %}
     在构建期读取 CSS 文件并以 <style> 包裹直接嵌入 HTML（critical CSS 优化）。
     src/assets/css/ 下任何文件改动需要 dev server 重启才会触发 rebuild（因
     shortcode 通过 fs.readFileSync 读取，11ty 不会监听）。
  */
  eleventyConfig.addShortcode("inlineCss", function (filename) {
    const filePath = path.join(__dirname, filename);
    try {
      const content = fs.readFileSync(filePath, "utf8");
      // 不缩进（缩进会进入 <style> 标签），不替换 <（CSS 无 HTML 标签风险）
      return `<style>${content}</style>`;
    } catch (e) {
      console.warn(`[inlineCss] cannot read ${filename}: ${e.message}`);
      return `<!-- inlineCss: missing ${filename} -->`;
    }
  });

  /* ---------- 6. 全局数据 ---------- */
  eleventyConfig.addGlobalData("buildYear", () => new Date().getFullYear());

  // 把 src/content/about.md 渲染成 HTML 后注入到全局数据，
  // 由 src/about.njk 通过 {{ aboutHtml | safe }} 直接消费。
  // 这样避免 Nunjucks {% include %} 在 11ty 模板上下文里找不到 .md 模板的问题。
  const fs = require("fs");
  const path = require("path");
  const ABOUT_PATH = path.join(__dirname, "src", "content", "about.md");
  eleventyConfig.addGlobalData("aboutHtml", () => {
    try {
      const raw = fs.readFileSync(ABOUT_PATH, "utf8");
      // 剥掉 YAML front-matter
      const parts = raw.split("---");
      const body = parts.length >= 3 ? parts.slice(2).join("---") : raw;
      return md.render(body.trim());
    } catch (e) {
      return "";
    }
  });

  /* ---------- 7. 内容文件 permalink / layout 默认值 ----------
     src/content/{portfolio,blog,papers}/.11tydata.cjs 给各自子目录模板注入默认值；
     这里保留 collection 以便 homepage 等模板用，但不去手动改 item.data.permalink
     （11ty 的 permalink 流程不读 collection item.data.permalink，避免误改）。
  */
  eleventyConfig.addCollection("portfolio", (api) => {
    return api
      .getFilteredByGlob("src/content/portfolio/*/index.md")
      .sort((a, b) => {
        const ya = a.data.year || 0;
        const yb = b.data.year || 0;
        if (yb !== ya) return yb - ya;
        return (a.data.title || "").localeCompare(b.data.title || "");
      });
  });

  eleventyConfig.addCollection("blog", (api) => {
    return api
      .getFilteredByGlob("src/content/blog/*/index.md")
      .sort((a, b) => (b.data.date || 0) - (a.data.date || 0));
  });

  eleventyConfig.addCollection("papers", (api) => {
    return api.getFilteredByGlob("src/content/papers/*/paper.md");
  });

  /* ---------- 8. ignores 配置 ----------
     src/content/about.md 已经在 src/about.njk 通过 aboutHtml 全局数据渲染，
     这里忽略掉避免 11ty 再把它当模板处理成 /content/about/。
     src/content/papers/*\/index.md 也是索引页角色（不是正文模板），
     正文在 paper.md；放两个会被 permalink 冲突。
  */
  eleventyConfig.ignores.add("src/content/about.md");
  eleventyConfig.ignores.add("src/content/papers/*/index.md");
  /* ---------- 路径：全部相对，不绑死挂载点 ----------
     目标：`_site/` 这个文件夹**扔到哪都能跑** —— 自定义域的根
     （github.lvyihang.xyz）、项目站子路径、Netlify / Vercel / nginx，
     甚至直接双击本地文件打开。为此：
       pathPrefix  = "/"           模板里的 {{ '/assets/...' | url }} 先产出
                                      /assets/... 这种根相对写法
       htmlBaseUrl = "relative"    11ty 的 transform 随后按**每页自身所在目录**
                                      把它改写成 ../../assets/... 这种真正相对
                                      的路径（首页是 assets/...，/about/ 页是
                                      ../assets/...）

     之前靠 pathPrefix 硬编码挂载点，产物只在挂在那个路径时可用，换任何托管
     方式都会整站 404 —— 这正是「文件夹不对」的根本原因。
     相对路径与挂载点无关，是可移植静态站的标准做法。

     ⚠️ htmlBaseUrl 只改写 HTML 的 href / src 属性，**不动**
        <link rel="canonical">、og:url、og:image、JSON-LD 的 url ——
        那些必须是完整绝对地址，搜索引擎靠它们定位页面。
        site.url 仍由 src/_data/site.js 提供，不受相对化影响。
     ⚠️ 仍可用 PATH_PREFIX 环境变量强制覆盖（确实要产出带前缀的版本时）。
        默认不给前缀。
  -------------------------------------------------------------------------- */
  const _configuredPrefix = process.env.PATH_PREFIX;

  /* ---------- relUrl：把站内路径渲染成「相对于当前页面」的路径 ----------
     为什么不用 Eleventy 自带的路子：
       · pathPrefix 硬编码  —— 产物只在挂在那个路径时可用，换托管方式就整站
         404，且和「换个域名根目录部署」直接冲突。
       · HtmlBasePlugin —— Eleventy 3 已把顶层 htmlBaseUrl 键废弃，
         插件内部在 baseHref === "/" 时**整体禁用**（源码：
         enabled: () => Boolean(context.baseHref) || opts.baseHref !== "/"），
         所以设 htmlBaseUrl: "relative" 什么都不会发生。

     这个过滤器做最朴素也最可控的事：数出当前 page.url 有几层目录，
     就在前面补几个 ../。
        page.url = "/"        → ""          → assets/css/x.css
        page.url = "/about/"  → "../"       → ../assets/css/x.css
        page.url = "/a/b/"    → "../../"    → ../../assets/css/x.css

     结果：`_site/` 整个文件夹扔到任何挂载点都能跑。

     ⚠️ 只用于**页面内的 href / src**。canonical / og:url / og:image /
        JSON-LD 里的 url 必须保持完整绝对地址（搜索引擎靠它们定位页面），
        那些位置继续用 {{ site.url }} 直接拼，不经过这个过滤器。
  -------------------------------------------------------------------------- */
  eleventyConfig.addFilter("relUrl", function (url, pageUrl) {
    const target = String(url);
    // 外部地址、带协议、带锚点或查询串的，一律原样返回（不处理）
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//") ||
        target.startsWith("#") || target.startsWith("?")) {
      return target;
    }
    // 当前页路径：优先用传入值，其次用模板上下文里的 page.url
    const here = pageUrl || (this && this.page && this.page.url) || "/";
    // 目录深度 = 去掉所有非斜杠字符后，斜杠的个数减 1
    //   "/" → 1 个斜杠 → 0 层；"/about/" → 2 个 → 1 层；"/a/b/" → 3 个 → 2 层
    const depth = Math.max(0, here.replace(/[^/]/g, "").length - 1);
    const clean = target.replace(/^\/+/, "");
    return "../".repeat(depth) + clean;
  });

  return {
    dir: {
      input: "src",
      output: OUT_DIR,
      includes: "_includes",
      data: "_data",
    },
    // 加入 txt 让 robots.txt 也能用 11ty 输出
    templateFormats: ["njk", "md", "html", "11ty.js", "xml", "txt"],
    // markdown 文件 → markdown 引擎（不经过 nunjucks 模板解析，避免 {#anchor} 误判）
    markdownTemplateEngine: false,
    // html / xml / 11ty.js 文件 → njk 模板引擎
    htmlTemplateEngine: "njk",
    pathPrefix: _configuredPrefix || "/",
    // 忽略 macOS Finder 创建的 ._* 资源叉备份（避免被当成模板加载）
    ignores: ["**/._*", "**/_archive/**"],
  };
};
