/* ============================================================================
 * MeteoHub · Eleventy (v3) 配置文件
 * ----------------------------------------------------------------------------
 *   - 输入根目录：src/
 *   - 输出根目录：_site/
 *   - passthrough copy：src/assets/ → /assets/
 *   - collections：portfolio / blog / papers
 *   - filters：date / readingTime / excerpt / year / tagList / status / head
 *   - 默认模板语言：njk + md（11ty 自带 Markdown 引擎，无需 marked）
 * ========================================================================== */

const { DateTime } = require("luxon");
const fs = require("fs");
const path = require("path");

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
      const destRoot = path.join(__dirname, "_site", section);
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
       _site/assets/css/components.css  = @import hub，浏览器按需拉取 7 个 partial
       每个 partial 独立缓存，IDE 跳转精准，修改某个组件无需重载整个文件。
     prod 模式（任何非 serve 的构建）：
       _site/assets/css/components.css  = 7 个 partial 按顺序 concat 后的单文件
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
    const outFile = path.join(__dirname, "_site/assets/css/components.css");
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
    stripMacResourceForks(path.join(__dirname, "_site"));
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

  /* ---------- pathPrefix：从 src/_data/site.js 的 url 自动派生 ----------
     部署到 GitHub Pages 项目页（如 oldsixxiaolv.github.io/MeteoHub/）时，
     /assets/... 这种根绝对路径会 404。设了 pathPrefix 后 11ty 会自动把
     模板里所有 /assets/... 重写成 /MeteoHub/assets/...；{{ site.url }}
     已经是 site.js 写死的完整 URL，不受 pathPrefix 影响，两者分工明确。
  -------------------------------------------------------------------------- */
  let _siteUrl = "";
  try { _siteUrl = require("./src/_data/site.js").url || ""; } catch (_) {}
  let _pathPrefix = "/";
  try {
    const _u = new URL(_siteUrl);
    if (_u.pathname && _u.pathname !== "/") {
      _pathPrefix = _u.pathname.replace(/\/$/, "");
    }
  } catch (_) {}
  // Keep local development at the root; production builds retain the Pages prefix.
  const _serveMode = process.argv.includes("--serve");
  const _configuredPrefix = process.env.PATH_PREFIX;
  const _effectivePathPrefix = _configuredPrefix || (_serveMode ? "/" : _pathPrefix);

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    // 加入 txt 让 robots.txt 也能用 11ty 输出
    templateFormats: ["njk", "md", "html", "11ty.js", "xml", "txt"],
    // markdown 文件 → markdown 引擎（不经过 nunjucks 模板解析，避免 {#anchor} 误判）
    markdownTemplateEngine: false,
    // html / xml / 11ty.js 文件 → njk 模板引擎
    htmlTemplateEngine: "njk",
    // 部署到 GitHub Pages 项目页时所有 {{ '/path' | url }} 自动加 /MeteoHub 前缀
    pathPrefix: _effectivePathPrefix,
    // 忽略 macOS Finder 创建的 ._* 资源叉备份（避免被当成模板加载）
    ignores: ["**/._*", "**/_archive/**"],
  };
};