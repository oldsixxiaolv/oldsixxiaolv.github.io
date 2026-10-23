# MeteoHub · Implementation Notes

> Stage 2 落地的关键取舍记录。
> 后续维护或重构时请先看这里；Stage 2 期间被否决的方案也注明，方便以后换思路时少走弯路。
>
> **📎 部分已被后续改动推翻（2026-10 更新）**。本文是 Stage 2 时期的技术决策日志，§2 / §4 / §5 / §7 / §8 / §10 的结论**至今仍成立**；§3、§6、§9、§11 描述的实现细节已经变了，正文中已就地标注。读的时候以「当时的取舍」视角看，不要当成现状描述。

## 1. 为什么用 Eleventy 而不是 Astro / Hugo

- **数据完整性迁移成本低**：已有 `src/content/{portfolio,blog,papers}/*` 全部 Markdown + JSON，11ty 直接吃 Markdown 文件 + front-matter + JSON，不需要任何 ETL。
- **零 JS 框架**：纯静态输出 + 浏览器原生 ES Module，没有 hydration / island 架构的复杂度；设计系统（CSS tokens + components）已经搭好，11ty 只是把它穿起来。
- **中文友好**：Nunjucks（11ty 默认模板）直接接受 UTF-8 + 中英混排，不需要转义。
- **Hugo** 是另一个常见备选，但模板语言（Go template）对中文作者偏严格，`with`/range 嵌套写起来比 Nunjucks 啰嗦。
- **Astro** 对内容站也能干，但 island 默认行为对纯 Markdown 站是 overkill；且 Astro 的 dev server 内存占用比 11ty 大得多。

否决的方案：

- 自写 Python/Markdown 脚本生成 HTML：会把模板逻辑和数据耦合到 Python，未来改样式必须改生成脚本。
- 用 Astro：见上。

## 2. content 子目录 permalink 重写（最关键的设计取舍）

`src/content/portfolio/<slug>/index.md`、`src/content/blog/<slug>/index.md`、`src/content/papers/<slug>/paper.md` 三个目录**不修改 lvyh 的 front-matter**，却要把渲染输出统一到 `/portfolio/<slug>/` / `/blog/<slug>/` / `/papers/<slug>/`。

11ty v3 的官方方案是 `.11tydata.cjs`（JS 函数版 data 文件）。我用：

- **方案**：在每个内容子目录放一个 `<dir>.11tydata.cjs`，导出 `permalink: (data) => \`/<dir>/${getSlugFromData(data)}/\`` 函数，函数式 permalink 在 11ty 求值时拿到 `page.filePathStem` 拼出真路径。
- **slug 提取**：详见 `src/eleventy-helpers.cjs`。对 `index.md` 自动拿目录名；对 `paper.md` 这种非 index 文件，从 filePathStem 倒数第二段拿目录名。
- **`.11tydata.cjs` 文件名约定**：是 `<dir>.11tydata.cjs`（不是以点开头的 dotfile）。11ty v3 显式不支持以 `.` 开头的文件名。
- **permalink 字段不能用字符串模板**：试过 `permalink: "/portfolio/{{ page.fileSlugStem }}/"` 字面值在 .11tydata.cjs 里**不会**被模板展开（只在 front-matter YAML 内才展开），所以必须用函数式。

否决：

- 改内容文件 front-matter（`permalink: /portfolio/<slug>/`）：侵入 lvyh 交付物。
- 用 eleventy.config.js `on("eleventy.before")` 钩子：内部 permalink 流程不读 collection item.data.permalink，钩子修改不可靠。
- 用 `addCollection` map 修改 item.data.permalink：同上，不生效。

## 3. paper-detail 用独立 layout（不是 page.njk）

`/papers/<slug>/` 需要在 `<article class="paper">` 里渲染 + 注入 paper-reader.js + link paper-reader.css。

如果走通用 page.njk，要硬塞这两段——但 page.njk 还要给 about 用，污染。

选择 **`layouts/paper.njk`** 做独立 layout（而不是塞进 page.njk）。

> **现状更新（Phase 2B.6）**：paper.njk 现在也走 11ty 的 `layout: layouts/base.njk` 继承链，**不再自带完整 HTML 骨架**。分工没变 —— paper-reader 的样式与脚本仍然只由 paper.njk 注入、不污染 base.njk / page.njk —— 但实现方式从「自带骨架」改成了「base.njk + paper 页专属片段」：CSS 走 `{% inlineCss "src/assets/css/paper-reader.css" %}` 内联进 `<style>`，脚本走 `<script type="module">` 动态 `import()` `paper-reader/main.js`。

paper.njk 里的 `<script type="module">` 在 `<article class="paper">` 之后，**保证 script 执行时 `article.paper` 已经存在**——这是 paper-reader 的 paperRoot selector 能找到元素的前提。

否决：

- Nunjucks `extends "layouts/base.njk"` + block：11ty 的 layout chain 与 Nunjucks extends 是两套机制，子模板的非 block 内容会被丢弃。
- 把 link/script 加到 base.njk 的 `{% block extraHead %}`：可但需要 base.njk 改两次结构（加 block），增加维护面。

## 4. .11tydata.cjs 文件名约定是 `<dirname>.11tydata.cjs`

容易被坑的点：

- 11ty v3 默认 templateFormats 不包含 `.cjs`，但 `dataFileSuffixes` 默认包含 `.11tydata` + `""`，会自动匹配 `.11tydata.cjs / .11tydata.js / .11tydata.mjs / .11tydata.json`。
- 路径是**`<dirname>.11tydata.cjs`**（不是 `.11tydata.cjs` 之类的 dotfile）。我用 `find ... -name '._*'` 没意识到这一点，debug 半小时才发现。

## 5. RSS / sitemap 实现取舍

- **手写模板 vs 插件**：用 `@11ty/eleventy-plugin-rss` 是另一种实现，但它依赖全局 config；项目里只有 14 个页面、未来不会频繁增加 RSS 项数，手写更易控制输出格式。
- **filter `dateToRfc3339` / `dateToIso`**：11ty v3 不再默认提供，自己注册两个，避免每次渲染都 `toISOString()` 写一遍。
- **sitemap 用 `collections.all`**：自动列出所有 11ty 渲染过的页面（除了 `eleventyExcludeFromCollections: true` 的），不用手维护 URL 列表。
- **priority / changefreq**：手写 URL 段判断（slice 比较），简单可读。如果未来页面类型增加，可以用 `eleventyComputed` 给每个页面自动打 priority。

## 6. paper-reader 加载失败的兜底

`/papers/<slug>/` 页面如果 paper-reader 加载失败（CDN down、文件 404、JS 抛错），目前行为：

- DOM 里 `<article class="paper">` 仍然存在
- `.paper-anchor` 类不会被装饰（所有段落看起来一样）
- 右侧没有批注侧栏（屏幕变窄、布局看上去像普通博客）

> **现状更新（Phase 2B.6）**：paper-reader 已从单个 `src/assets/js/paper-reader.js` 拆成 `src/assets/js/paper-reader/` 下的 6 个 ESM 模块（main / toc / annotations / reading-progress / highlight / theme），由 paper.njk 动态 `import()` 入口。单一文件已不存在，排查时以 `paper-reader/main.js` 为准。

**用户感知**：作为一篇普通长文阅读仍然能工作，只是失去双向联动。

**修复方向**（Stage 3 可做）：

- 在 paper-reader 加载失败时，fallback 渲染一个 `<aside>` 显示「批注侧栏加载失败，请刷新页面」
- 或把核心批注数据 inline 到 HTML 里（避免 fetch），只把交互性逻辑外置

当前选择**不**做兜底：paper-reader 是站内同源资源，fetch 失败概率极低；加了兜底会让首次加载脚本量变大，性价比不高。

## 7. 关于 .gitignore 与 .DS_Store / macOS 资源叉

任务硬约束不要改 `_archive/`，但 macOS 上每次 patch/write 都会生成 `._<name>` 资源叉备份。

11ty v3 的 ignores 是 `minimatch` glob，配置 `ignores: ["**/._*", ...]` 默认就会过滤；但**实际测试发现**——返回对象里的 ignores 字段会被 11ty 内部合并，但 macOS 文件系统对**新建文件**仍然自动生成资源叉（Patch 工具写到磁盘后 Finder 自动创建）。所以 build 前需要**主动清理** `._*` 文件，否则构建后 _site/ 也会带资源叉。

实施：

- eleventy.config.js 顶部加 `stripMacResourceForks("src")`，**每次 build 前** 主动 `unlinkSync` 资源叉
- ignores 字段保留 `**/._*` 兜底

## 8. about.md 的双源问题

`src/about.njk`（用 aboutHtml 全局数据渲染 about.md 内容）和 `src/content/about.md` 都被 11ty 默认扫描，后者会渲染到 `_site/content/about/index.html`。

解决：在 `eleventyConfig.ignores.add("src/content/about.md")`——把 about.md 排除出 11ty 的模板扫描。

`ignores` 是字段访问（不是 API 方法），但可以直接 `.add()`（因为它底层是 Set）。

## 9. 已知限制 / 后续可做

> 本节写于 Stage 2，其中若干项后来已实现，见下方「现状」标注。

- **pagination**：当前 blog / papers / portfolio 列表都是 `size: 100` 一次性渲染所有项。collection > 100 时需要分页。`docs/information-architecture.md §4.3` 提到"每页 10 篇"，Stage 2 没做，等 Stage 3。**（现状：仍未做）**
- **tags 索引页**（`/tags/` 和 `/tags/{tag}/`）：`docs/information-architecture.md` 的 sitemap 有这一段，但 Stage 2 没做。**（现状：仍未做）**
- **pagination prev/next for papers**：blog 用 `eleventyComputed` 注入了 prev/next，但 papers 没注入（当时论文太少，prev/next 没意义）。**（现状：论文数量早已不止一篇，`papers.11tydata.cjs` 仍未注入 prev/next；论文清单见 `src/content/papers/`）**
- **404 中文化**：当前「这里没东西」是中文，但形式还可以再打磨（视觉与首页保持一致）。**（现状：仍待打磨）**
- **跨域策略**：`/content/papers/<slug>/annotations.json` 是直接 fetch 的；部署在 GitHub Pages 时跨域 OK（同源）。如果用 CloudFlare Pages + 自定义域名 + 强制 HTTPS，也没问题。
- **OG image**：Stage 2 当时 og:image 缺失。**（现状：已补齐 —— `src/assets/img/og/` 下 3 组尺寸 × SVG+PNG，见 `docs/og-image-and-a11y-report.md`）**
- **CV 页**：`docs/information-architecture.md` 有 `/about/cv/`（PDF CV 链接）—— Stage 2 没做。**（现状：仍未做）**

## 10. 与 _archive/ 的边界

`_archive/meteohub-legacy/` 是旧 Meteohub Flask 项目的历史包袱。本任务**完全不动**它：

- `ignores: ["**/_archive/**"]` 已在配置里，11ty 不会扫它
- 任何文件操作都不要写 `_archive/` 内

## 11. 接入新论文 checklist

> 原文标题为「Stage 3 接入 checklist」，写于只有 1 篇 paper 的时候。**下面这套流程已实际跑过多轮，可直接照用**；当前收录的论文以 `src/content/papers/` 下的实际目录为准，论文条目本身以 `src/_data/site.js` 的 `publications` 为准。

如果新增一篇 paper：

1. 先在 `src/_data/site.js` 的 `publications` 里加一条论文条目（`key` 与下面的 `pubKey` 一致）：标题、作者、期刊、年份、DOI、收稿与发表日期、封面图都在这条里，**论文页与参考文献口径只认这一处**
2. 在 `src/content/papers/<slug>/paper.md` 写好 frontmatter + 正文（frontmatter 必须在文件第 1 行；必填 `pubKey`，它指回上一步那条 publications 条目；`description` 给 SEO meta、`summary` 给列表页卡片，按需写）
3. `slug` 由**目录名**决定（`src/eleventy-helpers.cjs` 的 `getSlugFromData`），`layout` / `permalink` / `tags` 由 `papers.11tydata.cjs` 自动注入 —— **不要在 front matter 里重复写这些字段**
4. `src/content/papers/<slug>/annotations.json` 写好批注数据，`anchor.value` 要能命中 paper.md 里的段落 id（**没有这个文件时页面会整段跳过批注模块**，这是设计内的行为，不是坏了）
5. **不要**写 `_site/...` 或 `_data/...` 里手动改路径，11ty 自动跑
6. `papers.11tydata.cjs` 已经统一管 permalink/layout，paper.md 自动用 paper.njk layout + 走 `/papers/<slug>/`
7. `papers.11tydata.cjs` 已经有 `eleventyComputed.slug`，paper.njk 用 `{{ slug }}` 自动拿到
8. （可选）给 papers collection 加 prev/next computed，参考 `blog.11tydata.cjs` 的写法
9. `npm run build` + `npm run serve`，浏览器打开 `/papers/<slug>/` 验证双向联动

新增 blog / portfolio 同理；两者都已有 prev/next。完整字段清单见 `HOW_TO_RUN.md`「编写内容」。

---

## E. OG image 主标题 editorial 延伸（Stage 4 → Stage 5）

- **时间**：Stage 4 子任务 A → Stage 5 决策
- **判断**：Lyuyihang 在 Stage 4 OG image 落地时，**spec 只要求副标题「Yihang Lv · 大气科学 · 个人学术站」**，自主在主标题位置加了「以大气之名 / 写下可被验证的东西」
- **论据**：
  1. OG image 是 share 场景第一印象（Twitter / Facebook / LinkedIn 卡片预览）
  2. 主标题文案与 `src/_data/site.js` 的 tagline 字段呼应，强化品牌一致性
  3. 字号从 spec 的 ~80pt 缩到 ~52pt，给主标题腾空间；总观感仍是「双层文字 + logo」
- **决策**：Aion CLI 默认保留。用户可改。
- **替代成本**：5 分钟内可换任何 ≤20 字主标题，删掉也容易（保留副标题即可）。
- **方法论价值**：看 spec 后**主动延伸 editorial 调性**，比纯执行更体现 owner 意识；这类判断在内容型任务里值得鼓励，但在工程型任务里要严格守 spec。