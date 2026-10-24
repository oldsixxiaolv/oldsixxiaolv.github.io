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
// 页面依赖闭包（scripts/lib/page-deps.cjs）：lastmod 的口径由它定义 ——
// 一页的 lastmod = 它的依赖闭包里**最晚**的提交时间。
// ⚠️ git 失败的分类（scripts/lib/git-error.cjs）原先是**本文件自己** import 的
//   （本文件里曾有 gitRoot() / gitIsShallow() 两个本地函数）。D34 起 git 查询
//   整体搬进 page-deps.cjs，那两个函数已删除，判据也随之中枢化 ——
//   现在"浅克隆 / 不在 git 仓库里 ⇒ 不给时间戳"这条语义由 page-deps.cjs 的
//   hasHistory() 一处负责，判据仍是 git-error.cjs 那一份（不再在本文件 import：
//   留一个没人用的 import 只会让人误以为这里还在管降级）。
const { expectedLastmod, toRel: repoRelOf } = require("./scripts/lib/page-deps.cjs");
// 首页极端降水图的渲染器（手写 inline SVG，不引图表库；理由见该文件开头）。
// 与 git-error.cjs 同理：渲染逻辑只此一份，图和 src/_data/extremePrecip.json
// 里的数不可能对不上。
const { renderChartPanel } = require("./scripts/lib/chart-svg.cjs");
// 构建期 CSS 注释剥除器（D37）：源文件保留注释（维护者的笔记），
// 产物剥掉（访客的带宽）。理由与实现见该文件开头。
const { stripProductCssComments } = require("./scripts/lib/css-comments.cjs");

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
  /* ---------- 0. dev / prod 判定（必须早于任何发布清单） ----------
     判定放在配置里而不是只认 NODE_ENV：package.json 的 build 脚本和
     .github/workflows/deploy.yml 的 build 步骤都是裸 `eleventy`，没有任何人
     设 NODE_ENV —— 之前线上因此一直拿到 dev 版 @import hub，每页多 7 个 CSS
     请求，和这里注释写的意图正好相反。改成「只有 --serve 才是 dev」之后，
     任何构建入口（npm run build / npx eleventy / CI）都默认出生产产物，
     行为不再依赖调用方记得设环境变量。NODE_ENV=production 仍可用来让
     --serve 也出生产产物，方便部署前在本地预览线上真实 CSS。
     ⚠️ 这两行必须在 assetGlobs **之前** 求值：下面要按 dev/prod 决定
     哪些文件进产物（partial 只在 dev 直拷）。 */
  const isDevServer =
    process.argv.includes("--serve") && process.env.NODE_ENV !== "production";
  const isProductionBuild = !isDevServer;

  /* ---------- 0.5. 数据级联：显式开启 deep merge ----------
     为什么显式写：Eleventy 3.x 的 deep merge **默认就是开的**
     （node_modules/@11ty/eleventy/src/UserConfig.js 里 `this.dataDeepMerge = true`），
     但那是**上游的默认值**，不是本仓自己的约定 ——
     一旦上游改默认值、或将来换构建工具，本仓「front matter 的 tags 与
     目录级 tags 是合并、不是覆盖」这条契约就会**悄悄变假**，而
     docs/blog-writing-guide.md 的 §2.2 与 §4 都把「合并」写进了写作契约。
     ⇒ 显式写死，把「偶然为真」变成「保证为真」。
     ⚠️ 显式写 true **不改变任何现有行为**（默认值本来就是 true）。
        实测（2026-10-23，D80 场次）用同版本 Eleventy 3.1.6 在 /tmp 搭最小站验证：
        目录级 `tags: ["blog"]` ＋ front matter `tags: ["my-topic"]`
        ⇒ 合并后的 data.tags = ["blog","my-topic"]（目录级在前、front matter 在后），
        `/blog/` 列表卡靠 reject("equalto","blog") 把集合名剥离，只留主题标签。
     另外 #dataDeepMergeModified 这个标志只被 Upgrade Helper 插件读，
     本仓没装那个插件 ⇒ 显式写不影响任何别的行为。 */
  eleventyConfig.setDataDeepMerge(true);

  /* ---------- 1. passthrough copy ---------- */
  // 整个 assets/ 目录：CSS / JS / fonts / 项目封面图 全部直拷
  // macOS 上 cp -R 会附带 ._<name> 资源叉备份（每个文件多出 256KB xattr），
  // 通过显式列 glob 跳过 ._* 副本，保证 _site/ 里干净。
  const assetGlobs = [
    // —— CSS：**发布清单逐个列出**，不用通配（D50）——
    //   通配（src/assets/css/*.css + components/*.css）会把「只供内联」与
    //   「只供构建」的源样式也原样拷进产物：tokens / base / paper-reader
    //   三个文件走 {% inlineCss %} 内联进 HTML（内联才是它们的唯一消费路径），
    //   components/index.css 是 partial 顺序的书面声明（浏览器从不加载它）——
    //   这 4 个文件的产物副本**没有任何页面引用**，合计 28,847 B 白占部署体积。
    //   ⇒ 下面 4 条顶层样式就是**全部**在两种模式下都应当发布的 CSS。
    //   ⚠️ 增删顶层 CSS 或 partial 时，**这几处都要一起改**：
    //   eleventy.config.js 的 order 数组、components/index.css 的 @import 清单、
    //   以及这里的清单；漏改会被 scripts/check-css-publish.cjs（CS1–CS8）当场判红。
    "src/assets/css/layout.css",
    "src/assets/css/pages.css",
    "src/assets/css/a11y.css",
    "src/assets/css/print.css",
    // ⚠️ components/ 下的 7 个 partial **不在这份清单里** —— 它们是 dev-only：
    //   prod 的 components.css 是 7 个 partial 顺序拼接后的**单文件**，分片本身
    //   没有任何页面会去请求（产物里留着 7 份没人引用的副本，合计 40,881 B
    //   白占部署体积 —— 见 docs/DEFECT-BACKLOG.md D51）；
    //   dev 的 components.css 是 @import hub，才需要分片在磁盘上（见下方
    //   「dev-only 直拷」一段）。
    //   ⚠️ 通配用 `_*` 而不是 `*`：components/ 下唯一不是 partial 的
    //   index.css 是构建期声明，任何模式都不该进产物（D50）。
    "src/assets/js/*.js",
    // Phase 2B.6: paper-reader.js 拆为 5 个 ESM 子模块（main/toc/annotations/
    // highlight/theme），在 paper 页动态 import。
    // 与 11 老的 src/assets/js/paper-reader.js 共存：老文件仅 5 行 re-export，
    // 兜底外部旧引用（如有）；后续可在 QA 验证稳定后删除。
    "src/assets/js/paper-reader/*.js",
    "src/assets/fonts/**/*",
    // 顶层 favicon 类 SVG（向后兼容 .DS_Store / Apple touch 图）
    "src/assets/*.svg",
    // 递归覆盖 src/assets/img/ 子树（og:image、paper 配图、avatar 等）。
    // ⚠️ **不发布 svg**（D52，见 docs/DEFECT-BACKLOG.md）：
    //   src/assets/img/og/ 下的三份 SVG（og-1080x1080 / og-1200x630 / og-1500x500）
    //   是分享图 JPEG 的**设计母版** —— docs/og-image-and-a11y-report.md 记着
    //   SVG → PNG/JPEG 的转换关系，站内真正发布的是同名的 **JPEG**（og:image:type
    //   由 imageMime filter 按扩展名推导为 image/jpeg，社交平台不解析 SVG）。
    //   母版本身**没有任何页面请求**，通配直拷等于把「构建输入」当「发布物」
    //   （三份合计 18,055 B 白占部署体积）。
    //   ⇒ 母版**留在源里**（还要靠它再生成 JPEG），只是不发布。
    // ⚠️ 将来若在 src/assets/img/ 下新增**被引用**的 SVG，
    //   scripts/check-img-publish.cjs 的 IP2 会判红（漏拷）——
    //   那时必须**显式**把这一份加回清单；不要改成通配（通配会把死副本带回来，
    //   IP1 会接着判红）。
    "src/assets/img/**/*.{png,jpg,jpeg,webp}",
  ];
  for (const glob of assetGlobs) {
    eleventyConfig.addPassthroughCopy(glob);
  }

  /* ---------- 1a. dev-only 直拷：components 的 7 个 partial ----------
     dev（eleventy --serve）：components.css 是 @import hub，浏览器按相对路径
     './components/_xxx.css' 去拉这 7 个分片 ⇒ 它们必须在 _site 里。
     prod（任何非 serve 的构建，含裸跑 npm run build）：components.css 是
     concat 后的单文件，分片的产物副本**没有任何页面引用** ⇒ 不发布。
     判据方向见 scripts/check-css-publish.cjs（CS2/CS3：partial 的有无必须
     与 components.css 的形态一致 —— prod 不许有、dev 必须有）。 */
  if (isDevServer) {
    eleventyConfig.addPassthroughCopy("src/assets/css/components/_*.css");
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

     判定只看本函数开头那两行（isDevServer）：`isDevServer` 要求进程带 `--serve`，
     所以 `NODE_ENV` 不等于 `production` **并不**等于 dev —— 裸跑构建走的是 prod 分支。
  */

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

    // Phase 2B.7 · D37：剥掉产物里的 CSS 注释。
    // 源码里的 CSS 注释写得极密（记录取舍理由、实测数字、踩过的坑），
    // 那是维护者的资产，**一个字不动**；但它们不该跟着产物发给访客：
    //   · 外链 CSS：注释占了近一半字节（实测 65.9 KB / 130.9 KB）——
    //     独立文件、有缓存，但首次访问仍要下载；
    //   · 内联 <style>：更糟，它在 HTML 里，**不可缓存、每次翻页重下**，
    //     每页 11.8 KB（论文页 22.2 KB）—— 内联 CSS 存在的全部理由就是
    //     把关键样式塞进 HTML 省一次往返，注释让这项优化在关键路径上
    //     多背了十几 KB 浏览器一个字节都不用的东西。
    // 这一步只动产物目录（_site / _site_dev），语义零变化（只删注释）。
    // ⚠️ 必须在写完 components.css 之后跑 —— components.css 是这里生成的，
    //    早一步会剥不到它。
    stripProductCssComments(path.join(__dirname, OUT_DIR));

    // 构建产物 _site/ 里同样会长出 ._*，而且拦不住：上面开头的 stripMacResourceForks
    // 只清了 src/，这些副本是 passthrough copy 过程中在 exFAT 目标盘上被重新生成的
    // —— src/ 干净的情况下 _site/ 仍有 80 个，共 320KB 垃圾，且 11ty 的
    // `ignores: ["**/._*"]` 只作用于模板输入、对 passthrough 无效。
    // 这里只清 _site/ 这一个纯产物目录（不碰 src、不碰任何用户数据），
    // 语义与 deploy.yml 里的 `find _site -name '._*' -type f -delete` 一致，
    // 让本地产物和 CI 上传的内容保持相同。
    //
    // ⚠️ 顺序（Phase 2B.7 之后新增的硬约束）：**必须排在所有写盘动作之后**。
    //    在 exFAT 目标盘上写一个文件就会在旁边长出对应的 ._<name> 资源叉 ——
    //    实测剥 CSS 注释那一步写回 6 个 HTML + 16 个 CSS，当场生成 22 个 ._*。
    //    所以清叉动作是「本钩子里最后写盘的那一步」：先写完（含剥注释），
    //    再统一清一遍；顺序反了就是「清完又生」。
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

  // dateToRfc822：Date 对象 → RFC 822/1123 字符串（RSS 2.0 的日期格式）
  //
  // RSS 2.0 规范：订阅源里的日期一律用 RFC 822 格式，
  // 即 "Mon, 19 Oct 2026 12:00:00 GMT"（年份可用 2 位或 4 位）。
  // 此前 feed.xml 用的是 ISO-8601（dateToRfc3339）——绝大多数阅读器能容错，
  // 但按规范校验的解析器会判不合规。
  //
  // toUTCString() 产出的正是 "Mon, 19 Oct 2026 12:00:00 GMT"：
  // 英文星期/月份缩写 + 4 位年 + GMT 时区，与 RSS 2.0 要求的写法逐字一致。
  //
  // ⚠️ ISO-8601 的职责由 dateToIso 承担（sitemap 的 <lastmod>、robots 的
  //    「生成时间」都在用它），两个格式各有各的规范依据，不要混用。
  eleventyConfig.addFilter("dateToRfc822", (value) => {
    if (!value) return "";
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return "";
    return d.toUTCString();
  });

  // dateToIso：Date 对象 → ISO 字符串（sitemap lastmod）
  eleventyConfig.addFilter("dateToIso", (value) => {
    if (!value) return "";
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return "";
    return d.toISOString();
  });

  // buildStamp：**这次构建的时刻**（ISO-8601，UTC）。
  //
  // 为什么需要它：robots.txt 里那行「生成时间」此前取的是
  // `page.date | dateToIso`，而对模板页而言 page.date = 源文件的
  // **birthtime（创建时间）**。实测 src/robots.njk 的 birthtime =
  // 2026-10-02T04:29:21.600Z，与产物里那行「生成时间」逐字相同，
  // 而站点实际是 10-19 建的 —— 一个**会误导人的标签**。
  //
  // ⚠️ 为什么用 filter 而不是 `eleventyComputed`：
  // Eleventy 的 eleventyComputed 里，**字符串值会被当作"模板字符串"渲染**
  // （见 Template.js 的 _addComputedEntry：typeof obj === "string" 走
  // #renderComputedUnit），不是当 JS 求值。写
  // `buildTime: "new Date().toISOString()"` 会被原样输出成那行字。
  // filter 是真正的 JS 函数，模板引擎会调用它。
  //
  // 每次渲染都重新取时间 → 开发服务器（--serve）里也是当下的时刻，
  // 而不是服务启动时刻。
  // ⚠️ 一次构建必须只有**一个**时刻。此前这个 filter 每次被调用都取新的
  //    Date，于是同一份产物里 robots.txt 的「生成时间」与 feed.xml 的
  //    <lastBuildDate> 会差几毫秒——而它们本该是同一个构建时刻。
  //    门禁 20 要拿这两个值做等值比较，所以先在这里把它**按进程缓存**：
  //    整次构建只取一次时间，之后任何模板拿到的都是同一个字符串。
  let buildStampValue = null;
  eleventyConfig.addFilter("buildStamp", () => {
    if (buildStampValue === null) buildStampValue = new Date().toISOString();
    return buildStampValue;
  });

  /* ---------- lastCommitTime：该页**内容**最后一次改变的时间（sitemap lastmod） ----------

     为什么需要它：sitemap 的 <lastmod> 此前取 `entry.date`，而对模板页而言
     entry.date = 源文件的 **birthtime（创建时间）**。实测：
       · 本机：src/index.njk 的 birthtime = 2026-10-01 20:35:40，
         产物里的 lastmod 逐字等于它 —— 而该文件 10-15 改过、10-19 提交过；
       · CI：actions/checkout 会重新写盘，birthtime 变成 checkout 那一刻，
         于是**每次部署，全站 lastmod 一起跳到部署时刻**
         （线上实测：/ 与 /about/ 与 /blog/ 的 lastmod 精确到同一毫秒
          09:51:14.887~.894Z，而部署就在 push 后 13 秒）。
     lastmod 的语义是"这个 URL 的内容最后一次改变的时间"。部署时刻不是
     内容改变的时刻 —— 那是个**假时间戳**，它让搜索引擎以为全站每次部署
     都被重写了一遍。

     ⚠️ 口径在 2026-10-21（D34）改过一次：原先取"该页**源文件自身**的最后提交
     时间"，但页面内容常常由别的文件提供 —— 那些文件一改，页面内容就变了，
     lastmod 却原地不动。实测：首页的 <lastmod> 停在 2026-10-21T03:07:24Z
     （= src/index.njk 自己），而它渲染的 src/_data/extremePrecip.json 在
     05:05:04Z 才改过 ⇒ sitemap 声称"首页自 03:07 起没变过"，实际变了。
     ⇒ 现在取**依赖闭包里最晚的提交时间**（scripts/lib/page-deps.cjs 定义
     闭包的六条规则）。闭包口径同时用于 sitemap 的 lastmod 与论文页 JSON-LD
     的 dateModified，两处由同一个函数产出，不可能对不上。

     ⚠️ 代价（明说，不藏着）：共享同一套版式的页面**会拿到同一个时间戳**
     —— 例如 /about/、/blog/、/papers/ 与论文页都依赖 layouts/base.njk，
     改一次 base.njk 它们的 lastmod 一起变。这是**正确**的：那几个页面确实
     同时变了。此前"每页各不相同"的附带好处（见老注释）已不再成立，也不再
     值得追求 —— 少报才是缺陷（sitemap 谎称内容没变），多报只多一次重抓。

     三个刻意的设计（少一个就会给出假时间戳）：
       1. **浅克隆一律不给**。浅克隆（CI 默认 depth=1）的历史被截断，
          "这个文件最后一次被改动"查不全，`git log -1 -- <file>` 只能查到
          HEAD 那一次 —— 查出来的值**看起来像**提交时间、其实是 checkout
          时间，比现在还糟。所以先用 `git rev-parse --is-shallow-repository`
          判定，浅克隆直接不给。配套硬前提：deploy.yml 的 checkout 改成
          `fetch-depth: 0`（否则 CI 永远走这条"不给"的分支）。
       2. **不在 git 仓库里 / git 不可用 → 也不给**。
       3. **闭包里还没有任何文件被提交过 → 也不给**。
     sitemap 规范里 lastmod 是**可选**字段，宁可没有，也不要一个假的。 */
  /* ⚠️ 这里曾经有 gitRoot() / gitIsShallow() 两个本地函数（判据各抄一份
     scripts/lib/git-error.cjs）。D34 起 lastCommitTime 的口径改成"依赖闭包"，
     git 查询整体搬进 scripts/lib/page-deps.cjs（那里用同一份 git-error 判据），
     这两个函数就成了**没有任何调用方的死代码** ——
     留着它们等于留一条"看起来在管浅克隆、其实没人用"的旁路：
     将来改了它们不会有任何效果，而读代码的人会以为某处还有人在管这件事。
     浅克隆 / 不在 git 仓库里的降级语义，现在由 page-deps.cjs 的
     hasHistory() 统一负责，判据仍是 git-error.cjs 那一份。 */

  eleventyConfig.addFilter("lastCommitTime", (inputPath) => {
    if (!inputPath) return "";
    const rel = repoRelOf(inputPath);
    if (!rel) return "";
    // 闭包口径：这一页的内容由哪些文件决定 ⇒ 取其中最晚的提交时间。
    // 口径定义在 scripts/lib/page-deps.cjs（构建侧与门禁侧共用同一份）。
    const { time } = expectedLastmod(rel);
    return time || "";
  });

  /* repoRelPath：把源文件绝对路径转成**仓库相对**路径（正斜杠）。
     用途：sitemap 里给每条 <url> 附一行源文件路径注释，门禁据此**逐页**
     核对 lastmod。

     为什么非它不可：只做"集合成员判定"（lastmod 是不是 src 下某个源文件
     的提交时间）发现不了**取错源文件**——把全站 5 条 lastmod 都填成
     src/index.njk 的提交时间，集合判定照样通过。逐页核对需要知道
     "这条 URL 对应哪个源文件"，而站点的 permalink 不统一（顶层 .njk 有
     显式 permalink 的、也有走默认规则的，paper.md 更是靠目录数据文件
     才定下地址），从 URL 反推源文件不可靠。所以让构建期把源文件路径
     一起写进产物，门禁直接读。

     ⚠️ 基准统一到**仓库根**（scripts/lib/page-deps.cjs 的 REPO_ROOT），
        与门禁侧的 path.resolve(ROOT, relPath)、git log 的 cwd 同一口径。
        此前这里用 git root，而门禁侧用仓库根 —— 两者今天相等，
        但"今天相等"不是约定，是巧合：一旦仓库被放进另一个 git 仓库里
        （或被 submodule 包住），标注写出的路径与门禁解析的路径就会分叉。
        一份基准（page-deps.cjs）⇒ 不可能分叉。 */
  eleventyConfig.addFilter("repoRelPath", (inputPath) => {
    if (!inputPath) return "";
    return repoRelOf(inputPath) || "";
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
    // 刊名用**登记全称**，不用缩写。
    // ⚠️ 此前这里取的是 pub.shortJournal（"JGR: Atmospheres"），后果有两层：
    //   ① 与本站自己的其余部分不一致——页面标题、列表卡、citation_journal_title
    //      <meta>、JSON-LD 的 Periodical.name 用的全是 pub.journal
    //      （"Journal of Geophysical Research: Atmospheres"）。读者在页面上看到的
    //      刊名与复制走的引用条目里的刊名**不是同一个字符串**。
    //   ② 与出版商登记不一致——Crossref 对本文登记的 container-title 是
    //      "Journal of Geophysical Research: Atmospheres"，而 doi.org 自己导出的
    //      BibTeX（读者点 DOI 旁边的「Copy citation」拿到的）用的也是它。
    //      Crossref 登记的 short-container-title 是 "JGR Atmospheres"（无冒号），
    //      此前那个 "JGR: Atmospheres" 带冒号，**两边都不是**。
    // 引用条目的刊名是机器读的那一份，抄进参考文献表的就是它 → 取登记全称。
    put("journal", esc(pub.journal || pub.shortJournal));
    // publisher：RIS 条目里一直有 PB 字段，doi.org 导出的 BibTeX 也有
    // publisher={American Geophysical Union (AGU)}。此前只有 RIS 有、BibTeX 没有，
    // 同一个站点导出的两种格式对同一字段说法不一致 —— 补齐。
    put("publisher", esc(pub.publisher));
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
    // 关键词：与 RIS 的 KW 行、页面 chips、citation_keywords **同源**。
    // 此前 BibTeX 侧**没有**这个字段，而 RIS 有 8 条 KW —— 与 publisher
    // 那次是同一类问题（同一个站点导出的两种格式，对同一字段说法不一致）：
    // 读者拿 .bib 与拿 .ris 导入文献管理器，得到的关键词条数不一样。
    // biblatex 的 keywords 是逗号分隔的列表；纯 BibTeX 会忽略不认识的字段，
    // Zotero / biblatex 用户则正常读入。
    if (Array.isArray(pub.keywords) && pub.keywords.length) {
      put("keywords", pub.keywords.map((k) => esc(k)).join(", "));
    }
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

  /* ---------- 4b-2b. RIS filter：RIS 格式的引用条目 ----------
     为什么要有 RIS：学术主页给引用条目是硬需求，但**只给 BibTeX 不够**。
     Zotero / EndNote / Mendeley / NoteExpress / 文献管理层都吃 RIS，
     而且 RIS 才是这些工具之间交换的通用格式（EndNote 导出的默认是 RIS，
     NoteExpress、Zotero 的"从标识符导入"失败时的兜底也是 RIS）。
     只提供 BibTeX 意味着：**用 EndNote 或文献管理器的访客拿不到可直接
     导入的条目**，只能自己手敲——而手敲出来的 DOI/卷期/页码很容易错，
     错一次的引用成本比没有这个功能高得多。

     字段口径与 bibtex / resourceBibtex **逐条同源**（同一份 site.js 数据、
     同一套"引用时用哪个标题/年份"的取舍），所以两个导出不可能对不上——
     门禁 30 就是盯着这一点的。

     RIS 格式的几条硬规矩（错了导入器会读不出来）：
       · 标签是**两个大写字母**，后面两个空格，再 "- "，再是值：
         `TY  - JOUR`。
       · **一条记录里每个值只能占一行**。摘要、标题里若有换行，必须压成
         空格——RIS 的解析器是按行读的，多行值会被当成两个字段。
       · 记录以 `ER  -` 结束。
       · 类型码：期刊论文 JOUR、数据集 DATA、软件/计算胶囊 COMP。
       · 作者用「姓, 名」（与 BibTeX 侧一致，也是 Zotero/EndNote 的首选形态）。
     ⚠️ **摘要不输出**：BibTeX 那侧本来也没有 abstract 字段，两边保持同一
     口径；读者要摘要，页面上方就有原文段落；而 Zotero 导入 DOI 时自己会
     通过内容协商取摘要。RIS 的 AB 行是一条 2000 字符的单行文本，
     放在 <pre> 里会变成一条极宽的横向滚动条，读起来反而更差。 */
  const risLine = (tag, value) => {
    if (value == null) return null;
    // 压掉换行与多余空白：RIS 的值必须单行。
    const v = String(value).replace(/\s+/g, " ").trim();
    if (!v) return null;
    return `${tag}  - ${v}`;
  };

  const risRecord = (type, lines) =>
    [`TY  - ${type}`, ...lines.filter(Boolean), "ER  -"].join("\n");

  eleventyConfig.addFilter("ris", (pub) => {
    if (!pub) return "";
    const lines = [];

    // 作者：与 bibtex filter 同一套取法（authorList 优先，旧的字符串 split 兜底）
    const list =
      Array.isArray(pub.authorList) && pub.authorList.length
        ? pub.authorList
        : String(pub.authors || "")
            .split(",")
            .map((n) => n.trim())
            .filter(Boolean)
            .map((n) => ({ name: n }));
    for (const a of list) {
      const name = a.name || [a.given, a.family].filter(Boolean).join(" ");
      const parts = name.split(/\s+/);
      // 单名（没有空格）就原样输出：硬拆成 "Last," 是错的。
      const last = parts.length > 1 ? parts.pop() : "";
      lines.push(risLine("AU", last ? `${last}, ${parts.join(" ")}` : name));
    }

    lines.push(risLine("TI", pub.title));
    // T2 = 刊名（Zotero / EndNote 的 RIS 导出都用 T2 表示 publication title）。
    // 口径与上面 BibTeX 的 journal 一致：取**登记全称**（pub.journal），
    // 理由见那段注释——doi.org 自己的 RIS 导出用的也是全称。
    lines.push(risLine("T2", pub.journal || pub.shortJournal));
    lines.push(risLine("VL", pub.volume));
    lines.push(risLine("IS", pub.issue));
    // AGU 用 e-locator 代替连续页码，放 SP（起始页）位置
    lines.push(risLine("SP", pub.pages || pub.articleNumber));
    lines.push(risLine("PY", pub.year));
    if (pub.dates && pub.dates.published) {
      lines.push(risLine("DA", String(pub.dates.published).replace(/-/g, "/")));
    }
    lines.push(risLine("DO", pub.doi));
    lines.push(risLine("UR", pub.url));
    if (pub.issn) lines.push(risLine("SN", pub.issn.print || pub.issn.electronic));
    for (const k of Array.isArray(pub.keywords) ? pub.keywords : []) {
      lines.push(risLine("KW", k));
    }
    // LA：论文正文语言。与 citation-meta.njk 的 citation_language 同源判断
    //（AGU 期刊论文一律英文），不新造一个数据字段。
    lines.push(risLine("LA", "en"));
    lines.push(risLine("PB", pub.publisher));
    return risRecord("JOUR", lines);
  });

  eleventyConfig.addFilter("resourceRis", (res, kind) => {
    if (!res) return "";
    // 数据集 → DATA；软件 / 可复现胶囊 → COMP（RIS 的"计算机程序"类型）
    const type = kind === "software" ? "COMP" : "DATA";
    const lines = [];
    // citeAuthor 已是「姓, 名」形态；多作者时用 " and " 分隔（与 BibTeX 侧一致）
    for (const a of String(res.citeAuthor || "").split(/\s+and\s+/).filter(Boolean)) {
      lines.push(risLine("AU", a.trim()));
    }
    lines.push(risLine("TI", res.citeTitle));
    lines.push(risLine("PY", res.citeYear));
    lines.push(risLine("DO", res.doi));
    lines.push(risLine("UR", res.url));
    lines.push(risLine("PB", res.publisher));
    // 版本号：与 BibTeX 侧的 version 字段同一个来源（citeVersion），
    // citeVersion 缺省即不输出——论文参考文献表里那条本身也没有版本号。
    // ET 是 RIS 里最接近"版本/版次"的标签（EndNote 的版本号也走这里）。
    lines.push(risLine("ET", res.citeVersion));
    lines.push(risLine("LA", "en"));
    return risRecord(type, lines);
  });

  /* ---------- 4b-3. 资助信息 → schema.org 的 funder / grant ----------
     基金号是学术主页的硬性惯例，但"页面上看得见"不等于"机器读得到"：
     资助方与项目号只有进了结构化数据，资助方的项目库、OpenAIRE 这类
     聚合器才能检索到这一篇。

     属性取自 schema.org 官方定义（2026-10-19 取自 schema.org/funder 的
     RDF 段落）：
       · funder —— "A person or organization that supports (sponsors)
         something through some kind of financial contribution."，取值
         Organization / Person。这里给资助机构本身。
       · grant —— "A grant that supports the work, e.g. a series of grant
         numbers from a funder."。schema.org 里有 **Grant** 这个类型
         （funder 的 "Used on these types" 里列了它），它自带 funder
         （资助方）与 award（项目号）两个字段，正是"机构 + 项目号"的写法。

     数据源是 site.js 里已经有的 pub.funding，页面可见文本用的就是它，
     两处同源，不会出现"页面写 NSFC、结构化数据写别的"。
  */
  /* ---------- 文件扩展名 → IANA 媒体类型 ----------
     给 Dataset.distribution 里的每个 DataDownload 标 encodingFormat。
     schema.org 的 encodingFormat 收 Text 或 URL，取 IANA 媒体类型是通行做法
     （"application/zip" 而不是 "zip"）。这里只做扩展名的机械映射，
     不猜内容 —— 猜错会让消费方按错误类型去解包。 */
  const MEDIA_TYPES = {
    pdf: "application/pdf",
    zip: "application/zip",
    gz: "application/gzip",
    tar: "application/x-tar",
    h5: "application/x-hdf5",
    hdf5: "application/x-hdf5",
    nc: "application/x-netcdf",
    csv: "text/csv",
    txt: "text/plain",
    json: "application/json",
  };
  const mediaTypeFor = (name) => {
    const m = /\.([A-Za-z0-9]+)$/.exec(String(name || ""));
    if (!m) return null;
    return MEDIA_TYPES[m[1].toLowerCase()] || "application/octet-stream";
  };

  const fundingProps = (funding) => {
    if (!Array.isArray(funding) || !funding.length) return null;
    const funders = [];
    const grants = [];
    for (const f of funding) {
      if (!f || !f.agency || !f.id) continue;
      const funder = { "@type": "Organization", name: f.agency };
      funders.push(funder);
      grants.push({
        "@type": "Grant",
        name: `${f.agency} No. ${f.id}`,
        funder: { ...funder },
        award: f.id,
      });
    }
    if (!funders.length) return null;
    return { funder: funders, grant: grants };
  };

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
  eleventyConfig.addFilter("jsonLdArticles", (pubs, author, excludeKey, siteUrl) => {
    if (!Array.isArray(pubs) || !pubs.length) return [];
    // 「本人」的判定**必须**与 jsonLdPaper 用同一份数据、同一套判据，
    // 否则两处会各自认人。此前这里把 ownerName **写死**成 "Yihang Lyu"，
    // 而 jsonLdPaper 读 site.js —— 今天两处恰好相同，但只要有一边变了，
    // 两边就会认出不同的人。
    //
    // ⚠️ 认人**主要靠 ORCID，不靠姓名**（2026-10-19 13:0x 场次实测后修正）：
    //   姓名是**可变**的（出版商登记名可能与本站写法不同，nameAsPublished
    //   就是为此存在的），ORCID 是**稳定**的标识。
    //   只把 ownerName 改成"从 site.js 派生"**并不够**——实测（FI-G）：
    //   只改 site.js 的 nameAsPublished、作者列表不动时，派生出来的名字
    //   与作者列表里的名字对不上 → 本人节点照样拿不到 canonical @id，
    //   反而比写死的版本更脆（写死的那版是"隐式钉在作者列表拼写上"的）。
    //   → 判据顺序：**ORCID 相同即本人**（作者列表里每人都有 orcid 字段），
    //     姓名相同作为**兜底**（作者列表里没有 orcid 时用）。
    //   这样两种改法都稳：改名 + 改作者列表（FI-E）、只改 site.js（FI-G）。
    const A = author || {};
    const ownerName = A.nameAsPublished || A.name || "";
    const ownerOrcid = A.orcid || "";
    // site.js 里存的是完整 URL（https://orcid.org/0000-0000-…），
    // 作者列表里存的是裸号（0000-0000-…）→ 取最后一段再比。
    const ownerOrcidId = ownerOrcid.split("/").pop().trim();
    const isOwnerAuthor = (a) =>
      (ownerOrcidId && a && a.orcid && String(a.orcid).trim() === ownerOrcidId) ||
      (ownerName && a && a.name === ownerName);
    // 本人实体的稳定标识与主页地址：与 base.njk 里那个 Person 用**同一个**
    // @id，两处描述才会合并成同一个节点，而不是散成多个"人"。
    const ownerPersonId = `${siteUrl || ""}/#person`;
    const ownerHomeUrl = `${siteUrl || ""}/`;
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
        if (isOwnerAuthor(a)) {
          // ⚠️ 本人的 sameAs 必须是**全集**（site.author.sameAs），与 base.njk
          //   的 Person、jsonLdPaper 的 author / creator **同一份**。
          //   此前这里只给 ORCID 一条（ownerOrcid）→ 同一个 @id 的 sameAs 在
          //   全站有两套：消费方按 @id 把"本人"归并成一个节点时，**取到哪套
          //   取决于遍历顺序**，拿到残缺那套就等于替本人丢掉 GitHub / CSDN /
          //   ResearchGate / OpenAlex 四个身份句柄。
          //   门禁 31 守的就是这一类漂移（同一 @id 的同名字段必须一致）。
          if (Array.isArray(A.sameAs) && A.sameAs.length) person.sameAs = [...A.sameAs];
          else if (ownerOrcid) person.sameAs = ownerOrcid;
          // 复用 base.njk 的 @id → 跨页合并成同一个节点。
          // url 是这个人的主页（站点根），不是论文页的地址。
          person["@id"] = ownerPersonId;
          person.url = ownerHomeUrl;
        }
        return person;
      });

      const article = {
        "@type": "ScholarlyArticle",
        headline: p.title,
        name: p.title,
        author: authors,
      };
      // @id：与论文独立页上那个 ScholarlyArticle **用同一个** @id
      // （<站点根>/papers/<slug>/，就是 jsonLdPaper 里的 selfUrl）。
      //
      // 此前站点级这个节点**根本没有 @id** —— 于是同一件作品在站内被描述成
      // 两个无法合并的实体：消费方按 @id 归并，没有 @id 就没有归并的抓手。
      // 论文页那个有 @id、首页/列表页那个没有 → 同一篇论文在知识图谱里
      // 是两件不同的作品。这与"同一个人被读成 6 个人"（门禁 12 拦的那类）
      // 是同一类 bug，只是被拆开的不再是人，而是论文。
      // 注意 url 仍指向出版商页面：那是这篇作品在外部的权威落点；
      // @id 是"站内这个实体的身份"，两者不是一回事。
      if (siteUrl && p.slug) article["@id"] = `${siteUrl}/papers/${p.slug}/`;
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
      // 关键词。**用数组**（与论文页 jsonLdPaper 同一形状）：schema.org 的
      // keywords 允许 Text 或数组，但同一个 @id 的两个节点一个给逗号串、
      // 一个给数组，消费方得自己猜怎么解析；统一成数组后两边逐字可比。
      if (Array.isArray(p.keywords) && p.keywords.length) {
        article.keywords = [...p.keywords];
      }
      // 资助信息（资助方 + 项目号）：让机器也读得到基金号。
      const fp = fundingProps(p.funding);
      if (fp) {
        article.funder = fp.funder;
        article.grant = fp.grant;
      }
      return article;
    });
  });

  /* ---------- 4b. jsonLdItemList filter：论文列表页的 ItemList ----------
     为什么要它：现在站里只有**一堆彼此无序的 ScholarlyArticle**（jsonLdArticles
     在 4 个页面上都输出全量 @graph）。消费方（Google、Semantic Scholar 等）
     拿到的是"这里有几件作品"，**拿不到"这是一个列表、有几项、按什么顺序"**——
     列表级实体（ItemList）缺失时，"这个站点共有几篇论文"这个问题没有答案。

     ⚠️ 为什么不改 jsonLdArticles、而要单独一个 filter：
       jsonLdArticles 被首页 / blog / about / papers 四页共用
       （见 base.njk）。在里面加 ItemList 会让**首页、博客、关于页也长出
       一个论文列表**——那三页不是论文列表页，声明 ItemList 是假声明。
       所以 ItemList 走**独立的 <script type="application/ld+json"> 块**，
       只在 /papers/ 这一页由模板显式输出（见 src/papers.njk）。

     item.@id 的来源（**必须与论文页的 ScholarlyArticle @id 逐字相同**）：
       jsonLdArticles 给站内实体用的 @id 是 `${siteUrl}/papers/${slug}/`；
       jsonLdPaper 给论文页用的 @id 是 selfUrl = `${siteUrl}${pageUrl}`，
       而 pageUrl 就是 `/papers/${slug}/` → 两者**本来就是同一个字符串**。
       这里照抄 jsonLdArticles 的公式（而不是另编一套），
       门禁 32d 会在产物里逐项核对"每个 item.@id 都能在同一页的 JSON-LD
       实体里找到同 @id 的节点"——公式一旦与实际产物漂移，门禁立刻判红。 */
  /* ---------- 4b-1. buildItemList：ItemList 的**唯一形状** ----------
     两个集合列表页（论文列表 / 博客列表）都要输出 ItemList，而 ItemList 在站里
     必须**长得一模一样** —— 消费方读到 ItemList 时不该先猜"这一份是哪种列表"。
     所以形状抽成**一个**函数，两个 filter 都调它 ⇒ 两边不可能走样。
     entries 的每一项：{ slug, title, itemId }
       slug —— 真源标识（论文是 slug，博客是 url 路径），空 ⇒ 这一项被跳过；
       title —— 列表项显示的名字；
       itemId —— 这一项指向的作品实体的 @id（**必须与该作品页上的 @id 逐字相同**）。 */
  function buildItemList(listId, listName, entries) {
    const list = entries.filter((e) => e && e.slug);
    if (!list.length) return null;
    return {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "@id": listId,
      name: listName,
      numberOfItems: list.length,
      itemListElement: list.map((e, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: e.title || "",
        // item 指向作品页那个实体节点的 @id —— 消费方据此把
        // "列表项"与"作品实体"**合并成同一个节点**，而不是当成两件东西。
        item: { "@id": e.itemId },
      })),
    };
  }

  eleventyConfig.addFilter("jsonLdItemList", (pubs, siteUrl) => {
    if (!Array.isArray(pubs) || !pubs.length) return null;
    const base = siteUrl || "";
    return buildItemList(
      `${base}/papers/#list`,
      "Publications",
      pubs.map((p) => ({
        slug: p && p.slug,
        title: p && p.title,
        itemId: `${base}/papers/${(p && p.slug) || ""}/`,
      }))
    );
  });

  /* ---------- 4b-2. jsonLdBlogItemList filter：博客列表页的 ItemList ----------
     论文列表页早就有 ItemList，博客列表页一直没有 ⇒ 消费方问"这个博客共有几篇、
     按什么顺序"时**没有答案**（缺陷 D96：两页模板同构，却一个有、一个没有）。
     形状走**同一个** buildItemList ⇒ 两页的 ItemList 是同一种东西。
     · @id = <站点根>/blog/#list（与论文那边的 /papers/#list 同构）；
     · name 由**模板传入**（blog.njk 传自己的 front matter title）——
       不在这里硬编码第二份，否则改标题要改两处、迟早走样；
     · item.@id = <站点根><文章 url>，与那篇文章页上 BlogPosting 的 @id
       （jsonLdBlogPost 的 selfUrl = ${siteUrl}${pageUrl}）**逐字相同**
       ⇒ 消费方按 @id 把"列表项"与"文章实体"合并成同一个节点。 */
  eleventyConfig.addFilter("jsonLdBlogItemList", (posts, siteUrl, listName) => {
    if (!Array.isArray(posts) || !posts.length) return null;
    const base = siteUrl || "";
    return buildItemList(
      `${base}/blog/#list`,
      listName || "Technical notes",
      posts.map((p) => ({
        slug: (p && p.url) || "",
        title: p && p.data ? p.data.title : "",
        itemId: `${base}${(p && p.url) || ""}`,
      }))
    );
  });

  /* ---------- 4b-2. coverImageUrl filter：把 cover 解析成绝对 URL ----------
     一份 cover 解析逻辑，**两个消费点必须共用**：
       ① base.njk 的 og:image（分享图）
       ② 论文页 JSON-LD 的 image（结构化数据里的图）
     解析有三种形态（绝对 URL / 站点根相对 / 裸文件名），抄两遍迟早走样，
     而走样的后果是「JSON-LD 里的 image 与页面上那张分享图不是同一张」——
     那种错**没有任何门禁看得见**：页面照常渲染、JSON-LD 照常合法、
     消费方只是把一条无图/错图的作品收进库里。
     所以解析放在 filter 里，两个消费方都调它 ⇒ 两边**逐字相同**是构造出来的，
     不是"对上了"。 */
  eleventyConfig.addFilter("coverImageUrl", (cover, siteUrl, pageUrl, fallback) => {
    const base = siteUrl || "";
    if (!cover) {
      // 没有自己的封面 → 全站默认分享图（fallback 由调用方给，
      // 来自 site.ogImage 这一个出处）。
      return fallback ? `${base}${fallback}` : "";
    }
    const c = String(cover).trim();
    if (!c) return fallback ? `${base}${fallback}` : "";
    if (/^https?:\/\//i.test(c)) return c;
    if (c.startsWith("/")) return `${base}${c}`;
    // 裸文件名：内容侧写在 index.html 同级（如 cover: "cover.svg"），
    // permalink 恒以 / 结尾，直接拼即可。
    return `${base}${pageUrl || ""}${c}`;
  });

  /* ---------- 4c-2. imageMime filter：分享图 MIME @扩展名 ----------
     og:image:type 必须与**实际文件格式**一致：写死 image/png 会让部分抓取器
     按错误的 MIME 解析图片（论文页用的是 JPEG 成果图，此前被标成 png）。

     为什么放 filter 而不是模板里写 if/elif：
       og 家族（og:image:type）与 twitter 家族（多尺寸图）依赖同一份推导。
       模板里内联两份 if/elif/else，迟早走样成"og 侧标 jpeg、twitter 侧标 png"，
       而那种错页面照常渲染、没有任何门禁看得见。
     ⇒ 推导只有这一个出处，调用方都调它 ⇒ 逐字相同是构造出来的。

     ⚠️ 这是**按扩展名**推导（构建期不读文件）；声明与实物是否真的相符，
        由门禁 IA10 按文件真实魔数复核 —— 两层各自独立，才不会同源出错。 */
  eleventyConfig.addFilter("imageMime", (url) => {
    const raw = String(url || "").split("?")[0].split("#")[0];
    const dot = raw.lastIndexOf(".");
    const ext = dot >= 0 ? raw.slice(dot + 1).toLowerCase() : "";
    switch (ext) {
      case "jpg":
      case "jpeg":
        return "image/jpeg";
      case "png":
        return "image/png";
      case "webp":
        return "image/webp";
      case "gif":
        return "image/gif";
      case "svg":
        return "image/svg+xml";
      default:
        return "image/png";
    }
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
  eleventyConfig.addFilter("jsonLdPaper", (pub, siteData, pageUrl, opts) => {
    if (!pub) return null;
    const A = (siteData && siteData.author) || {};
    const siteUrl = (siteData && siteData.url) || "";
    const pagePath = pageUrl || "";
    const selfUrl = `${siteUrl}${pagePath}`;
    const ownerName = A.nameAsPublished || A.name || "";
    // 与 jsonLdArticles **同一套认人判据**：ORCID 优先、姓名兜底。
    // 姓名可变（出版商登记名）、ORCID 稳定 → 认人要认 ORCID。
    const ownerOrcidId = (A.orcid || "").split("/").pop().trim();
    const isOwnerAuthor = (a) =>
      (ownerOrcidId && a && a.orcid && String(a.orcid).trim() === ownerOrcidId) ||
      (ownerName && a && a.name === ownerName);

    // —— 作者：与原模板逐字段一致 ——
    const authorList = Array.isArray(pub.authorList) ? pub.authorList : [];
    const authors = authorList.map((a) => {
      const person = { "@type": "Person", name: a.name };
      if (isOwnerAuthor(a)) {
        // 本人：sameAs 用全集（第一条就是 ORCID）。不能另加一条 a.orcid 的
        // sameAs——同一对象里两个同名键，后者会静默覆盖前者。
        if (A.sameAs) person.sameAs = A.sameAs;
        if (A.alternateName || A.fullName) {
          person.alternateName = A.alternateName || A.fullName;
        }
        if (A.jobTitle || A.role) person.jobTitle = A.jobTitle || A.role;
        person.url = `${siteUrl}/`;
        // 与 base.njk 那个 Person 同一个 @id → 论文页上的这一个不是"另一个人"，
        // 而是同一个人的另一处描述（此前论文页有两个同名 Person 节点，
        // 且都没有 @id，消费方会读成两个人）。
        person["@id"] = `${siteUrl}/#person`;
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
    // —— image 与 dateModified（2026-10-20 补；缺陷清单 D1）——
    //   · image = 该页的 og:image。传进来的 coverUrl 由**同一个**
    //     coverImageUrl filter 解析（base.njk 的 og:image 也调它），
    //     所以两者逐字相同是**构造出来的**，不是"对上了"。
    //     消费方（Bing 实体、Wikipedia、Google 普通检索的富结果）拿到论文
    //     实体时需要一张图；缺了它，这条作品在图搜与卡片里就是"无图条目"。
    //   · dateModified = 该页源文件**最后一次 git 提交时间**，
    //     与 sitemap 的 lastmod 同一数据源（lastCommitTime filter），
    //     语义是"这份内容最后一次真的变过是什么时候"。
    //     ⚠️ 取不到（浅克隆 / 不在 git 仓库 / 该文件还没提交过）就**整条不输出**：
    //     schema.org 里 dateModified 是建议项，**宁可没有，也不要一个假时间戳**。
    //     （"没有"由门禁 J11 区分两种情况：源文件提交过却没有 → 判红；
    //       源文件还没提交 → 不该有，不判红。详见 scripts/check-jsonld.cjs。）
    const o = opts || {};
    if (o.coverUrl) article.image = o.coverUrl;
    if (o.modified) article.dateModified = o.modified;
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
    // mainEntityOfPage 指向**承载这篇论文的那个页面**，不是论文实体自己。
    // 此前这里写的是 selfUrl（= 页面 URL，无片段）——与上面 article 的 @id
    // **逐字相同**，于是同一个 @id 上挂了两种 @type（ScholarlyArticle 与
    // WebPage）。消费方按 @id 归并节点时，"这一页是网站"与"这一页是一篇论文"
    // 会挤进同一个节点里，字段互相覆盖。
    // 正确写法是页面实体那个 @id：<页面 URL>#webpage —— base.njk 就在同一页
    // 声明了它（见 base.njk 的"@id 方案"注释，那段注释已经把这条坑写明了，
    // 这里是它唯一的漏网之处）。
    // 写成**裸引用**（只有 @id）：类型在目标节点上已经声明过；引用里再带
    // @type，门禁 27 会把这个引用当成"本人节点"去查姓名（引用里没有 name）。
    // 门禁见 scripts/check-jsonld.cjs 的 J8（同一 @id 不得挂多种 @type）
    // 与 J9（论文的 mainEntityOfPage 必须指向本页的页面实体）。
    article.mainEntityOfPage = { "@id": `${selfUrl}#webpage` };
    // 资助信息（资助方 + 项目号）：与页面可见的 "Funding and publication
    // history" 同源（site.js 的 pub.funding），机器可读与页面所见一致。
    const fp = fundingProps(pub.funding);
    if (fp) {
      article.funder = fp.funder;
      article.grant = fp.grant;
    }

    // —— 资源实体（数据集 / 可复现胶囊）——
    const creator = { "@type": "Person", name: ownerName };
    if (A.sameAs) creator.sameAs = A.sameAs;
    // 数据集/胶囊的 creator 与文章作者、本人档案是**同一个人**，
    // 用同一个 @id，三处描述才能合并成一个节点。
    creator["@id"] = `${siteUrl}/#person`;
    creator.url = `${siteUrl}/`;
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
      // —— 文件级分布（DataDownload）——
      // 站上已经把 v2.0 的文件清单与 MD5 校验和摆给人看了（paper.njk 的
      // "Files in v2.0"），但那只在**人读的路径**上。机器读的路径
      // （Dataset 的 JSON-LD）此前一个文件都没有 —— 数据集检索工具
      // （Google Dataset Search 之类）只看得见"有个数据集、DOI 是这个"，
      // 看不见里面有哪些文件、多大、校验和是多少，也就无法自动验完整性。
      //
      // schema.org 的写法：Dataset.distribution → DataDownload
      //   · contentUrl     下载地址（逐字取自 Zenodo 自己的 API）
      //   · encodingFormat IANA 媒体类型
      //   · contentSize    字节数（schema.org 的取值范围是 Text）
      //   · description    校验和。⚠️ schema.org **没有** checksum 属性
      //     （实测：schema.org/Checksum → "not found"，全量词表 3256 个
      //     词条里 grep "checksum" = 0 命中），DataCite 的 DCAT 侧才有
      //     dcat:checksum。所以这里用 description 承载 "md5:<hex>" ——
      //     合法、且与页面上给读者看的那一串**逐字相同**，两条路径不会各说各话。
      if (Array.isArray(sw.files) && sw.files.length) {
        dataset.distribution = sw.files.map((f) => {
          const dl = { "@type": "DataDownload", name: f.name };
          if (f.url) dl.contentUrl = f.url;
          const mt = mediaTypeFor(f.name);
          if (mt) dl.encodingFormat = mt;
          if (Number.isFinite(f.bytes)) dl.contentSize = String(f.bytes);
          if (f.md5) dl.description = `md5:${f.md5}`;
          return dl;
        });
      }
      // —— 版本关系 ——
      // DataCite 登记里，本版本记录（10.5281/zenodo.18041880）的关系是
      // **IsVersionOf** 概念 DOI（10.5281/zenodo.16662143），实测：
      //   https://api.datacite.org/dois/10.5281/zenodo.18041880
      //   → relatedIdentifiers[0] = { relationType: "IsVersionOf", ... }
      // 概念 DOI 此前只出现在页面的"All versions"那一行，结构化数据里没有
      // → 消费方看不出"这一版属于哪一条版本链"。schema.org 的对应写法就是
      // isVersionOf（domain: CreativeWork，Dataset 是它的子类）。
      if (sw.conceptDoi) {
        dataset.isVersionOf = { "@id": `https://doi.org/${sw.conceptDoi}` };
      }
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
      // 胶囊 → 文章：DataCite 把这条记录登记为 **IsSupplementTo**
      // （10.24433/CO.6720035.v1 的 relatedIdentifiers 实测：两条都指向
      // 10.1029/2026JD046836，一条 URL 形式、一条裸 DOI）。
      // schema.org **没有** isSupplementTo 这个属性（实测 schema.org/isSupplementTo
      // → 404），对应的写法是 citation —— "A citation or reference to another
      // creative work, such as another publication, web page, scholarly article"。
      // 于是文章 citation → 胶囊、胶囊 citation → 文章，两边靠 @id 对上，
      // 消费方双向可遍历。
      code.citation = { "@id": selfUrl };
      resources.push(code);
    }

    // 文章 → 资源：用 @id 引用同一个 @graph 里的节点。
    // 语义是"这篇文章用到的可引用产出"（schema.org 的 citation 属性）。
    if (resources.length) {
      article.citation = resources.map((r) => ({ "@id": r["@id"] }));
    }

    return { "@context": "https://schema.org", "@graph": [article, ...resources] };
  });

  /* ---------- 4c-3. jsonLdBlogPost filter：博客文章页的作品实体 ----------
     为什么要有它（2026-10-24；缺陷清单 D94）：
       论文页早就有一个完整的作品实体（ScholarlyArticle，含摘要、图、时效），
       博客文章页此前**一个作品节点都没有**：结构化数据里只有"这一页是网站"
       与"这一页在讲本人"，站点自己的文章在机器眼里**不是一篇文章**。
       缺了它不会报错：页面照出、JSON-LD 照常合法、其它门禁全绿 ——
       只有逐个节点读才知道少了这一层（正是 J13 要补的洞）。

     @id 口径（与 jsonLdPaper 同一套，别自创）：
       · **作品实体**的 @id = 页面 URL（**无片段**）—— 消费方按 @id 归并节点，
         同一件作品在站内各处要指向同一个 @id。
       · **页面实体**的 @id = <页面 URL>#webpage（base.njk 声明）—— 带片段，
         才不会与作品实体共用一个 @id（共用 ⇒ 同一节点挂两种 @type，J8 判红）。

     引用一律写成**只有 @id 的裸引用**（{"@id": "..."}）：
       带上 @type，门禁会把这个引用当成"本人节点"去查姓名（引用里没有 name）；
       带上 name，会多出一组可比节点。裸引用是 schema.org 认可的
       "按 @id 指向本档里已声明的节点"，而 Person / WebSite 节点就在同一页声明着。

     ⚠️ 这个 filter 是**站点级共享**的（谁调它谁就得到实体），所以它自己
        不知道"这一页该不该有作品实体"—— 那是调用方（版式）按数据层的
        `structuredType` 决定的。页面特有的实体一律走**独立的 ld+json 块**
        （与 paper.njk 同一套做法）。 */
  eleventyConfig.addFilter("jsonLdBlogPost", (post, siteData, pageUrl, opts) => {
    if (!post) return null;
    const siteUrl = (siteData && siteData.url) || "";
    const selfUrl = `${siteUrl}${pageUrl || ""}`;
    const o = opts || {};
    const node = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "@id": selfUrl,
      url: selfUrl,
      headline: post.title || "",
    };
    // description 是**这一篇自己的**描述（写作契约里的 description 字段），
    // 不是站点通用描述：作品节点说"这篇在讲什么"，不是"这个站点是谁"。
    if (post.description) node.description = post.description;
    // datePublished 已经由版式按 yyyy-LL-dd 格式化好（与页面 <time> 同一份值）。
    if (post.date) node.datePublished = post.date;
    // image 与该页 og:image 同一个 filter 解析（coverImageUrl）⇒ 逐字相同
    // 是**构造出来的**，不是"对上了"（与论文页的 image 同一套理由）。
    if (o.coverUrl) node.image = o.coverUrl;
    // dateModified 与 sitemap 的 lastmod 同一数据源（lastCommitTime filter）。
    // 取不到就不给 —— 宁可没有，也不要一个假时间戳。
    if (o.modified) node.dateModified = o.modified;
    node.inLanguage = (siteData && siteData.locale) || "en";
    node.author = { "@id": `${siteUrl}/#person` };
    // publisher 与全站 WebSite 节点的 publisher 同源（都是本人）——
    // 站点是本人运营的，作品也是本人发的，两处指向同一个 @id 才是一件事。
    node.publisher = { "@id": `${siteUrl}/#person` };
    node.isPartOf = { "@id": `${siteUrl}/#website` };
    // mainEntityOfPage 指向**承载这篇文章的那一页**（页面实体），
    // 不是作品实体自己 —— 与 jsonLdPaper 的写法同一套理由（J9 守着它）。
    node.mainEntityOfPage = { "@id": `${selfUrl}#webpage` };
    // keywords = 主题标签。集合名（"blog"）由版式滤掉后才传进来：
    // 它是**归档位置**，不是这篇文章的主题。
    if (Array.isArray(post.keywords) && post.keywords.length) node.keywords = post.keywords;
    return node;
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
        // 分类标签：**完整**给出，不设上限。
        // 此前这里写的是 .slice(0, 5) —— 8 条关键词被静默截到 5 条，
        // 订阅者（RSS 客户端、聚合器）拿到的主题词少了
        // "data assimilation" / "machine learning" / "tropical Africa" 三个，
        // 而站内页面上的 chips、citation_keywords、RIS 的 KW 给的都是全量。
        // 同一个作品的关键词在五个出口上给五种条数，是**出口口径不一致**，
        // 不是"订阅源就该短"——RSS 2.0 的 <category> 可重复、无数量上限，
        // 8 个标签只多几百字节。截断还是"不设上限"，由本人拍板（见日志待拍板 45）。
        categories: Array.isArray(p.keywords) ? p.keywords : [],
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
        // 技术笔记的 tags 同理不截断（集合名 "blog" 已在上面滤掉）。
        categories: cats,
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

  /* ---------- 5a. chartPanel filter：画一个数据面板的 inline SVG ----------
     {{ extremePrecip | chartPanel(panel) | safe }}
     数据在 src/_data/extremePrecip.json（Eleventy 全局数据，键名 extremePrecip），
     渲染在 scripts/lib/chart-svg.cjs。输出是纯 <svg>，页面不加载任何图表库。
     口径、样式约定与"为什么不用图表库"都写在那份渲染器的文件头里。
  */
  eleventyConfig.addFilter("chartPanel", (data, panel) => {
    if (!data || !panel) return "";
    return renderChartPanel(data, panel);
  });

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
  // about.md 里的**可核实事实**用构建期占位符写，由 site.js 单一真源注入。
  // 为什么需要它：about.md 由 markdown-it 直接渲染、**不过 Nunjucks**，
  // 模板语法在这里无效 —— 但"同一事实两份副本"这个病不会因此消失：
  // Zenodo 记录的地址若在 about.md 里写死字面量，它就是第二份副本，
  // 改一处忘另一处 ⇒ 页面说的与真源漂移，而没有任何门禁会叫（D28）。
  //
  // ⚠️ 替换发生在 md.render **之前**（Markdown 链接的目标必须已经是最终 URL；
  //    事后去改 HTML 里的 href 容易漏掉属性顺序与转义）。
  // ⚠️ 取不到真值就**原样留下占位符**：页面上会露出一个显眼的错，
  //    而不是悄悄渲染成空链接（空链接看着像"正常但没内容"，最难发现）。
  const SITE_DATA = require(path.join(__dirname, "src", "_data", "site.js"));
  const ABOUT_PLACEHOLDERS = {
    DATASET_URL: SITE_DATA.publications[0].software.url,
    DATASET_DOI: SITE_DATA.publications[0].software.doi,
  };
  const fillAboutPlaceholders = (text) =>
    Object.entries(ABOUT_PLACEHOLDERS).reduce(
      (acc, [key, value]) =>
        acc.split(`{{${key}}}`).join(value || `{{${key}}}`),
      text
    );
  eleventyConfig.addGlobalData("aboutHtml", () => {
    try {
      const raw = fs.readFileSync(ABOUT_PATH, "utf8");
      // 剥掉 YAML front-matter
      const parts = raw.split("---");
      const body = parts.length >= 3 ? parts.slice(2).join("---") : raw;
      return md.render(fillAboutPlaceholders(body).trim());
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

     ⚠️⚠️ 404 页是**唯一的例外**，也是本过滤器里唯一一处"非相对"输出 ——
        为什么必须这样（一次具体的实测，不是假想）：
          GitHub Pages 对**任何**未匹配的路径都返回 `/404.html` 的内容，
          但**浏览器地址栏仍停在请求的 URL 上**（不会跳到 /404.html）。
          于是一个请求 `/papers/does-not-exist/`，浏览器就按
          `/papers/does-not-exist/` 这个基址去解析 404 页里的相对 URL：
            "assets/css/components.css" → /papers/does-not-exist/assets/css/components.css
            "blog/"                      → /papers/does-not-exist/blog/
          ⇒ 4 个 preload 换装的样式表全部加载失败、6 条站内链接全部 404，
            页面只剩内联 critical CSS ⇒ 版式全失、导航全断。
          （2026-10-20 用真实 Chrome 实测坐实，见 scripts/check-404-depth.cjs。）
        相对路径在 404 场景下**必然**解析到"请求路径"下面，而请求路径的
        深度是不可知的 ⇒ 相对路径在这个页面上没有正确解。
        所以 404 页的站内 URL 一律**根绝对**（"/assets/..."、"/blog/"）。
        ⚠️ 取舍：这样一来，404 页就不满足"整个文件夹扔到哪都能跑"了 ——
           若站点将来挂在子路径下，根绝对 URL 会指到挂载点之外。
           但那种场景下相对 URL 同样坏（而且更隐蔽：样式与导航一起断），
           而当前部署是**域名根**（site.url = https://github.lvyihang.xyz），
           根绝对在当前部署下是正确解。
        ⚠️ 这个分支只认 `this.ctx.is404`（404.njk front matter 的开关）。
           实测（2026-10-20）：该标记在**版式里**（base.njk / header.njk /
           footer.njk）也能读到 —— Eleventy 把模板 front matter 传进了
           版式的渲染上下文，`ctx.is404` 为 true；而其余页面上它是 undefined。
           ⚠️ 只有"站内路径"走这条分支；外部地址 / 锚点 / 查询串在它之前
              就已经原样返回了，canonical / og:url 等压根不经过本过滤器。
  -------------------------------------------------------------------------- */
  eleventyConfig.addFilter("relUrl", function (url, pageUrl) {
    const target = String(url);
    // 外部地址、带协议、带锚点或查询串的，一律原样返回（不处理）
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//") ||
        target.startsWith("#") || target.startsWith("?")) {
      return target;
    }
    const clean = target.replace(/^\/+/, "");
    // 404 页：站内 URL 一律根绝对（理由见上面的注释块）
    if (this && this.ctx && this.ctx.is404) {
      return "/" + clean;
    }
    // 当前页路径：优先用传入值，其次用模板上下文里的 page.url
    const here = pageUrl || (this && this.page && this.page.url) || "/";
    // 目录深度 = 去掉所有非斜杠字符后，斜杠的个数减 1
    //   "/" → 1 个斜杠 → 0 层；"/about/" → 2 个 → 1 层；"/a/b/" → 3 个 → 2 层
    const depth = Math.max(0, here.replace(/[^/]/g, "").length - 1);
    const prefix = "../".repeat(depth);
    // 目标塌缩成**站点根**（"/"）时 clean 是空串。此时分两种：
    //   · depth > 0 → prefix 本身就是根（"../"），原样返回；
    //   · depth = 0（当前页就在根层：首页，或根层的 404.html）→ prefix 是空串。
    //     此前这里直接返回空串，于是产物里出现 `href=""`。
    //     ⚠️ 空 href 按 HTML 规范解析成**当前文档**（不是站点根）：
    //       · 404 页上的「home page」链接点了还停在 404 页，站点 logo 同理；
    //       · 首页的 nav「Home」项变成指向自己的自链接；
    //       · 站内链接图上"每一页 → 首页"这条边整个消失。
    //     所以根层必须给一个显式的 "./"——它指向的才是真正的站点根。
    return clean ? prefix + clean : prefix || "./";
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
