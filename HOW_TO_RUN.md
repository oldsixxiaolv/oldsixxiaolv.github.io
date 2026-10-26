# MeteoHub · 如何运行

> 这份文档只回答两件事：**怎么把站点跑起来**、**代码放在哪**。
> 内容怎么写（front matter 字段、目录命名、封面、批注）以 `docs/blog-writing-guide.md`
> 与 `docs/papers-interaction.md` 为**唯一真源**；本文不复制它们的字段表 ——
> 复制就会出现同一份契约的两个副本，其中一个迟早没人看守。
> 仓库里另有一份 `docs/implementation-notes.md`，它记的是**实现取舍**（为什么这么写），
> 不是操作手册。

## 启动开发服务器（带热更新）

```bash
npm run serve
```

默认监听 **http://127.0.0.1:8080/**。站点部署在 `github.lvyihang.xyz` 的**根目录**，
没有路径前缀 —— dev server 与生产构建的 URL 结构一致。改 `src/` 下任意
`.njk` / `.md` / `.css` / `.js` 文件后浏览器会自动刷新；
但 `src/assets/css/components/` 下的 partial 例外（见下节），改它们要重启 dev server。

如需在本地预演一个子路径部署（一般用不到），可运行 `PATH_PREFIX=/子路径 npm run serve`。

端口配置在 `package.json` 的 `serve` 脚本与 `eleventy.config.js` 的 `setServerOptions`，
改哪个都行。端口被占时先 `lsof -i :8080` 找到 PID、`kill` 掉再重试。

## 构建生产产物

```bash
npm run build
```

输出在 `_site/` 目录。把整个 `_site/` 上传到任意静态托管即可
（GitHub Pages / Vercel / Nginx / Cloudflare Pages 都支持）。

`npm run build` 会先跑整条门禁链、再调 Eleventy。门禁红了构建就不会发生，
所以构建失败先看门禁输出，别急着怀疑模板。

## components.css 的两种生成方式

构建产物里的 `_site/assets/css/components.css` **不是手写源文件**（源码树里没有这个文件），
它由 `eleventy.config.js` 的 `eleventy.after` 钩子在每次 build 后生成。
要改组件样式，请改 `src/assets/css/components/` 下的 partial，拼接顺序固定为：

- `src/assets/css/components/_nav.css`
- `src/assets/css/components/_button.css`
- `src/assets/css/components/_badge.css`
- `src/assets/css/components/_card.css`
- `src/assets/css/components/_list.css`
- `src/assets/css/components/_paper.css`
- `src/assets/css/components/_misc.css`

顺序真源是 `eleventy.config.js` 里的 `order` 数组，必须与
`src/assets/css/components/index.css` 的 `@import` 声明保持一致。
partial 自身通过 passthrough 单独拷到 `_site/assets/css/components/`，
这样 dev 形态的 `@import` 才命中。

产物是哪种形态，只看**进程有没有带 `--serve`**：

| 形态 | 触发条件 | 产物 |
| --- | --- | --- |
| dev | 带 `--serve` 且 `NODE_ENV` 不等于 `production` | `@import` hub，浏览器按需拉取各 partial |
| prod | 任何构建（进程不带 `--serve`） | 按上面顺序 concat 成单文件 |

> ⚠️ 常见误解：`NODE_ENV` 不等于 `production` **并不**等于 dev。
> `npm run serve` 得到的是 dev 形态的 `@import` hub；
> 裸跑 `npm run build` 得到的是 **prod** 单文件，线上 GitHub Pages 也是 prod 单文件。
> 想在本地看 prod 单文件，直接 `npm run build` 即可，不必额外设 `NODE_ENV`。

## 站点结构

源码都在 `src/` 下，产物在 `_site/`，门禁与自测脚本在 `scripts/`。

### 数据与模板

- `src/_data/site.js` —— 全站站点元信息（标题 / 导航 / 作者 / `site.url` 等）的唯一真源
- `src/_data/extremePrecip.json` —— 极端降水数据集的展示数据
- `src/_includes/layouts/base.njk` —— HTML 骨架：head + CSS 串接 + 主题早期脚本 + skip-link + header + footer + Person JSON-LD
- `src/_includes/layouts/index.njk` —— 首页外层（包 content 槽）
- `src/_includes/layouts/page.njk` —— 通用页面（about）
- `src/_includes/layouts/detail.njk` —— 详情页（blog / portfolio，含 prev/next pager）
- `src/_includes/layouts/paper.njk` —— 论文精读页（ScholarlyArticle JSON-LD + inline paper-reader.css + 动态 import paper-reader 入口）
- `src/_includes/partials/header.njk` —— 顶栏（nav + 主题切换）
- `src/_includes/partials/footer.njk` —— footer
- `src/_includes/partials/theme-toggle.njk` —— 主题切换按钮
- `src/_includes/partials/hero.njk` —— 首页 hero（人像 + FIELD NOTE 贴纸）
- `src/_includes/partials/publications.njk` —— 首页论文区
- `src/_includes/partials/citation-meta.njk` —— 引文元信息（DOI / BibTeX / RIS 导出）
- `src/_includes/partials/extreme-precip.njk` —— 极端降水数据区块

### 页面模板

- `src/index.njk` —— 首页正文（被 `src/_includes/layouts/index.njk` 包）
- `src/about.njk` —— 关于页
- `src/blog.njk` —— 博客列表页
- `src/papers.njk` —— 论文列表页
- `src/feed.njk` —— RSS
- `src/sitemap.njk` —— sitemap
- `src/robots.njk` —— robots.txt
- `src/404.njk` —— 404 页
- `src/publications.bib.njk` —— BibTeX 导出
- `src/publications.ris.njk` —— RIS 导出

> ⚠️ **作品集没有列表页**：源码树里没有作品集列表模板，
> `src/content/portfolio/` 下也只有目录数据文件、没有条目 ⇒ `/portfolio/` 这条路由现在没有页面。
> `src/_includes/layouts/detail.njk` 里的「Back to Portfolio」只有真有条目时才会被渲染出来。
> 要加作品集列表页，得同时补模板与那条回链的目标。

### 静态资源

- `src/assets/css/tokens.css` —— 设计 tokens（颜色 / 字体 / 间距，可执行事实源）
- `src/assets/css/base.css` —— reset + 元素基础样式
- `src/assets/css/layout.css` —— 布局（wrap / section 等）
- `src/assets/css/pages.css` —— 页面专用样式
- `src/assets/css/a11y.css` —— 无障碍专用样式（reduced-motion / prefers-contrast / forced-colors）
- `src/assets/css/print.css` —— 打印样式
- `src/assets/css/paper-reader.css` —— 论文精读页专用，由 `src/_includes/layouts/paper.njk` inline 进 `<style>`
- `src/assets/css/components/index.css` —— 组件入口（`@import` 全部 partial）
- `src/assets/favicon.svg` —— 站点图标
- `src/assets/fonts/` —— 预留的自托管字体目录，目前只有一个占位文件 `.gitkeep`（git 不跟踪空目录；没有它，干净克隆里就没有这个目录 ⇒ 文档现状门禁 DR6 会判红，见 D100），没有字体文件（走 Google Fonts）
- `src/assets/img/og/og-1200x630.jpg` —— 分享图主尺寸（JPEG 导出，源是同目录下的 SVG）
- `src/assets/img/og/og-1500x500.jpg` —— 分享图宽幅
- `src/assets/img/og/og-1080x1080.jpg` —— 分享图方形

### 脚本

- `src/assets/js/main.js` —— 全站入口（import 主题 + 滚动 reveal + 复制按钮）
- `src/assets/js/theme.js` —— light/dark 切换 + localStorage 持久化
- `src/assets/js/home-chart.js` —— 首页降水图的交互（年份游标 + 读数 + 键盘操作）
- `src/assets/js/paper-reader/main.js` —— 论文精读页模块入口
- `src/assets/js/paper-reader/toc.js` —— 目录
- `src/assets/js/paper-reader/annotations.js` —— 批注侧栏
- `src/assets/js/paper-reader/highlight.js` —— 段落锚点高亮
- `src/assets/js/paper-reader/theme.js` —— 跟随站点主题

### 内容

- `src/content/about.md` —— 关于页正文（被 Eleventy 忽略，只经 `aboutHtml` 全局数据喂给 `src/about.njk`）
- `src/content/blog/` —— 博客文章，每篇一个目录
- `src/content/portfolio/` —— 作品集条目，每篇一个目录（当前没有条目）
- `src/content/papers/` —— 论文精读，每篇一个目录
- `src/content/blog/blog.11tydata.cjs` —— 博客目录级默认 front matter
- `src/content/portfolio/portfolio.11tydata.cjs` —— 作品集目录级默认 front matter
- `src/content/papers/papers.11tydata.cjs` —— 论文目录级默认 front matter

### 工具与门禁

- `src/eleventy-helpers.cjs` —— 共享工具（`getSlugFromData`，被各 `*.11tydata.cjs` 消费）
- `eleventy.config.js` —— Eleventy 配置 + `eleventy.after` 构建钩子
- `scripts/` —— 全部门禁与自测脚本
- `.github/workflows/deploy.yml` —— 部署工作流

## 编写内容

三类内容都是**每篇一个目录**，但正文文件名和配套文件不同：

| 类型 | 目录 | 正文文件 | 配套 |
| --- | --- | --- | --- |
| 博客 | `src/content/blog/<yyyy-mm-dd-slug>/` | `index.md` | 封面（`cover.<ext>`，可选） |
| 作品集 | `src/content/portfolio/<slug>/` | `index.md` | 封面（`cover.<ext>`，可选） |
| 论文 | `src/content/papers/<slug>/` | `paper.md` | 批注文件（见下） |

各个内容子目录根下各有一个与目录同名的 `*.11tydata.cjs`，统一管 layout 与 permalink，
所以**新文章不用自己写 `layout` 和 `permalink`**：

- `src/content/blog/blog.11tydata.cjs` → `src/_includes/layouts/detail.njk`，permalink `/blog/<slug>/`，注入 `prev` / `next`
- `src/content/portfolio/portfolio.11tydata.cjs` → `src/_includes/layouts/detail.njk`，permalink `/portfolio/<slug>/`，注入 `prev` / `next`
- `src/content/papers/papers.11tydata.cjs` → `src/_includes/layouts/paper.njk`，permalink `/papers/<slug>/`，并把 `slug` 暴露给 layout

slug 的提取规则见 `src/eleventy-helpers.cjs` 的 `getSlugFromData`：文件名是 `index.md` 时取目录名，
`paper.md` 这类非 index 文件取 filePathStem 倒数第二段。

### 新增一篇博客

在 `src/content/blog/` 下新建目录 `YYYY-MM-DD-slug/`，里面放 `index.md`。
**front matter 字段以 `docs/blog-writing-guide.md` 的契约表为唯一真源**，本文不复制那份表。
要点：

- 路由由**目录名**决定（`getSlugFromData` 取的是目录名）；front matter 里写 `slug:` 是无效的，别写。
- `layout` / `permalink` / `tags` / `prev` / `next` 由目录数据文件**自动注入**，不要重复写。
- 封面文件名必须叫 `cover.<ext>`，且**真实字节格式要与扩展名一致**；封面目前是**关着的**
  （`src/blog.njk` 里 `useCovers` 取 false），开关何时打开由本人拍板。
- `date` 只写日期，不写时分。

### 新增一个作品集

`src/content/portfolio/<slug>/index.md`。作品集条目没有独立的写作契约文档，
可写的字段以 `src/_includes/layouts/detail.njk` 实际读取的键为准
（`title` / `date` / `readingTime` / `tags` / `year` / `role` / `type` / `stack`）。
封面口径与博客一致。

### 新增一篇论文

`src/content/papers/<slug>/` 下放 `paper.md`：

- **YAML front matter 必须在文件第 1 行**（Eleventy v3 不解析放在 HTML 注释后的 frontmatter）。
- 布局与 permalink 由 `src/content/papers/papers.11tydata.cjs` 注入，不用自己写。
- 论文的**标题 / 作者 / 单位 / 期刊 / 年份 / DOI 的真源是 `src/_data/site.js` 的 `publications` 条目**，
  front matter 只用 `pubKey` 指回那条目；`slug` 由目录名决定，不是 front matter 字段。
- `tags` 由目录数据文件自动注入，不要在 front matter 里重复写。

批注数据（`annotations.json`）的字段规范见 `docs/papers-interaction.md`。
批注开关是**按篇自动判定**的：`src/content/papers/papers.11tydata.cjs` 在构建期检查论文目录下
是否存在 `annotations.json`（算出的 `hasAnnotations` 喂给 `src/_includes/layouts/paper.njk`），
有文件的论文页挂批注侧栏，没有文件的整段跳过批注模块、保持纯阅读模式。
`trmm-thunderstorm-stages` 自 2026-10-25 起带批注。锚点 id 的写法：小节标题用 `<h2 id="p-XXX">`、
段落锚点直接把 id 写在段落元素上（`<p id="p-XXX">`，与 `docs/papers/reader-demo.html` 同形）；
批注 `anchor.value` 必须能命中这些 id，对应规则同见那份文档。

> `src/content/papers/*/index.md` 会被 `eleventyConfig.ignores` 排除，不参与渲染。放不放都行；
> 放了能当本地入口预览，但**不要**指望它出现在 `_site/` 里。

## 修改视觉

设计 token 全部集中在 `src/assets/css/tokens.css`，改 token 后整个站点的色 / 字 / 距会同步更新。
规范说明见 `docs/design-system.md` —— 两者的关系是：**token 文件是可执行事实源，
`docs/design-system.md` 是规范源**；两者冲突时以 token 文件为准
（历史上为过 WCAG AA 对比度调过几档色值，规范文档可能滞后）。

如新增组件类，放 `src/assets/css/components/_misc.css`（跨页面复用）
或 `src/assets/css/pages.css`（页面专用），不要在 `src/assets/css/tokens.css` 里塞实现。
partial 的职责划分见 `docs/design-system.md` 的组件清单。

## 部署前 checklist

- [ ] `npm run build` 成功（门禁全绿、无 Eleventy 错误）
- [ ] `grep -rE 'href="/assets/|src="/assets/' _site/*.html` 期望 0 命中（资产路径必须走 `{{ '/path' | relUrl }}` 渲染成相对路径，不能硬编码根绝对路径）
- [ ] `_site/` 不在版本控制里（已在 `.gitignore`）
- [ ] Google Fonts 域名是否在境内可达；如不可达，把 `src/_includes/layouts/base.njk` 里的 `<link>` 换成 `fonts.loli.net` 或自托管到 `src/assets/fonts/`（该目录已随仓库入库；发布的 passthrough **只认字体扩展名**（woff / woff2 / ttf / otf / eot），丢字体文件进去即可，占位文件不会被发布）
- [ ] 如果部署到子路径，确认 `src/_data/site.js` 的 `site.url` 与实际部署路径一致 —— `pathPrefix` 从它自动派生
- [ ] 部署细节见 `docs/DEPLOY.md`
