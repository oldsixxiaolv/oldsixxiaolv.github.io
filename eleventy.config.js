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
const { execFileSync } = require("child_process");
// git 失败的分类与"降级 or 抛"的决定 —— 与 scripts/verify-site.cjs 共用同一份
// （见 scripts/lib/git-error.cjs 顶部的说明：抄两份会漂移，漂移会静默漏报）。
const { classifyGitError, degradeOrThrow } = require("./scripts/lib/git-error.cjs");

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

  /* ---------- lastCommitTime：该页源文件最后一次 git 提交的时间（sitemap lastmod） ----------

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

     改成"该页源文件最后一次 git 提交时间"：内容什么时候真的改过，就是
     什么时候。附带好处是每页的 lastmod 各不相同（此前全站一个值），
     搜索引擎才能拿它做抓取优先级判断。

     三个刻意的设计（少一个就会给出假时间戳）：
       1. **浅克隆一律不给**。浅克隆（CI 默认 depth=1）的历史被截断，
          "这个文件最后一次被改动"查不全，`git log -1 -- <file>` 只能查到
          HEAD 那一次 —— 查出来的值**看起来像**提交时间、其实是 checkout
          时间，比现在还糟。所以先用 `git rev-parse --is-shallow-repository`
          判定，浅克隆直接不给。配套硬前提：deploy.yml 的 checkout 改成
          `fetch-depth: 0`（否则 CI 永远走这条"不给"的分支）。
       2. **不在 git 仓库里 / git 不可用 → 也不给**。
       3. **文件还没被提交过（历史里查不到）→ 也不给**。
     sitemap 规范里 lastmod 是**可选**字段，宁可没有，也不要一个假的。 */
  let gitRootCache;
// git 失败的分类在 scripts/lib/git-error.cjs —— 与 scripts/verify-site.cjs
// **共用同一份**（原来两边各抄一份判据，"改一处忘一处"就会让两侧行为不一致，
// 而这两边恰恰必须一致：它们一起决定"门禁到底有没有真的核对过 lastmod"）。
// 四类里只有「git 不在 PATH」「git 说这里没有提交历史」可以降级成"没有 git 历史"；
// 「git 判定不出来」（被信号杀 / 不可执行）与编程错误都必须抛。
  function gitRoot() {
    if (gitRootCache !== undefined) return gitRootCache;
    try {
      gitRootCache = execFileSync("git", ["rev-parse", "--show-toplevel"], {
        cwd: __dirname,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch (e) {
      // 可降级时返回 null（= 不在 git 仓库里 / 没有 git 历史）；
      // 不可降级时抛（见 scripts/lib/git-error.cjs）。
      gitRootCache = degradeOrThrow(e);
    }
    return gitRootCache;
  }

  let gitShallowCache;
  function gitIsShallow() {
    if (gitShallowCache !== undefined) return gitShallowCache;
    try {
      gitShallowCache =
        execFileSync("git", ["rev-parse", "--is-shallow-repository"], {
          cwd: __dirname,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        }).trim() === "true";
    } catch (e) {
      // ⚠️ 这里原来是**裸 catch**（`catch {`）—— 它把编程错误（TypeError /
      //   ReferenceError）也一起吞掉：门禁会以为只是"浅克隆 / 不可信"，
      //   而实际是代码写错了。现在与另两处用同一套判据：
      //   · 「git 用不了」→ 按"不可信"处理（原来的行为，保留）；
      //   · 「git 判定不出来」/ 编程错误 → 必须抛，不能悄悄降级。
      const kind = classifyGitError(e);
      if (kind === "unavailable" || kind === "no-history") {
        gitShallowCache = true; // 判不出来就按"不可信"处理
      } else {
        degradeOrThrow(e); // "unknown" → 抛一句人话；"program-error" → 原样抛
      }
    }
    return gitShallowCache;
  }

  eleventyConfig.addFilter("lastCommitTime", (inputPath) => {
    if (!inputPath) return "";
    const root = gitRoot();
    if (!root || gitIsShallow()) return "";
    const rel = path.relative(root, inputPath);
    if (!rel || rel.startsWith("..")) return "";
    try {
      // %cI = 严格 ISO-8601（含时区偏移），如 2026-10-19T11:10:56-07:00
      const out = execFileSync("git", ["log", "-1", "--format=%cI", "--", rel], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (!out) return "";
      const d = new Date(out);
      if (isNaN(d.getTime())) return "";
      // 统一成 UTC 的 Z 形式，与站点其它时间戳（dateToIso）格式一致
      return d.toISOString();
    } catch (e) {
      // 同上：编程错误不能被伪装成"查不到提交时间"（那会让 lastmod 静默变空）；
      // 「git 判定不出来」同样不能伪装（降级 = 门禁以为验过了，其实没验）。
      degradeOrThrow(e);
      return "";
    }
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

     注意这里用 git root（不是 Eleventy 项目根）做基准，与门禁脚本里
     `git log -- <相对路径>` 的 cwd 保持一致。 */
  eleventyConfig.addFilter("repoRelPath", (inputPath) => {
    if (!inputPath) return "";
    const root = gitRoot();
    if (!root) return "";
    const rel = path.relative(root, inputPath);
    if (!rel || rel.startsWith("..")) return "";
    return rel.split(path.sep).join("/");
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
    // T2 = 刊名（Zotero / EndNote 的 RIS 导出都用 T2 表示 publication title）
    lines.push(risLine("T2", pub.shortJournal || pub.journal));
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
  eleventyConfig.addFilter("jsonLdItemList", (pubs, siteUrl) => {
    if (!Array.isArray(pubs) || !pubs.length) return null;
    const list = pubs.filter((p) => p && p.slug);
    if (!list.length) return null;
    return {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "@id": `${siteUrl || ""}/papers/#list`,
      name: "Publications",
      numberOfItems: list.length,
      itemListElement: list.map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: p.title || "",
        // item 指向论文页那个 ScholarlyArticle 的 @id —— 消费方据此把
        // "列表项"与"论文实体"**合并成同一个节点**，而不是当成两件东西。
        item: { "@id": `${siteUrl || ""}/papers/${p.slug}/` },
      })),
    };
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
