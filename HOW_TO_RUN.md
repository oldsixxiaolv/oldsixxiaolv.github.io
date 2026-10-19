# MeteoHub · 如何运行

## 启动开发服务器（带热更新）

```bash
npm run serve
```

默认监听 **http://127.0.0.1:8080/** 。站点部署在 `github.lvyihang.xyz` 的**根目录**，没有路径前缀——dev server 与生产构建的 URL 结构一致。修改 `src/` 下任意 `.njk` / `.md` / `.css` / `.js` 文件后浏览器会自动刷新 —— 但 `src/assets/css/components/_*.css` 除外（见下节「components.css 的两种生成方式」），改这几个 partial 需要重启 dev server。

如需在本地预演一个子路径部署（一般用不到），可运行 `PATH_PREFIX=/子路径 npm run serve`。

如果 8080 端口被占用，先 `lsof -i :8080` 找到 PID，`kill <PID>` 后重试。端口在两处配置，改哪个都行：`package.json` 的 `serve` 脚本 `--port=8080`，以及 `eleventy.config.js → setServerOptions({ port: 8080 })`。

## 构建生产产物

```bash
npm run build
```

输出在 `_site/` 目录。把整个 `_site/` 上传到任意静态托管即可（GitHub Pages / Vercel / Nginx / Cloudflare Pages 都支持）。

## components.css 的两种生成方式

构建产物里的 `_site/assets/css/components.css` **不是手写源文件**（源码树里没有这个文件），它由 `eleventy.config.js` 的 `eleventy.after` 钩子在每次 build 后生成。要改组件样式，请改 `src/assets/css/components/` 下的 7 个 partial（`_nav` / `_button` / `_badge` / `_card` / `_list` / `_paper` / `_misc`）。生成结果取决于 `NODE_ENV`：

| 模式 | `NODE_ENV` | `_site/assets/css/components.css` 内容 |
| --- | --- | --- |
| dev | 不等于 `production`（含裸跑 `npm run build`） | 约 654 B 的 `@import` hub，逐个 `@import` 那 7 个 partial |
| prod | `production` | 约 35 KB 单文件，按固定顺序 concat 7 个 partial |

拼接顺序由 `eleventy.config.js` 里的 `order` 数组决定，必须与 `src/assets/css/components/index.css` 的 `@import` 声明保持一致（`_nav → _button → _badge → _card → _list → _paper → _misc`）。partial 自身通过 passthrough 单独拷到 `_site/assets/css/components/`，这样 dev 模式的 `@import` 才命中。

要拿生产形态的单文件做本地验证：

```bash
NODE_ENV=production npm run build
```

> 注意：目前 `package.json` 的 `build` 脚本和 `.github/workflows/deploy.yml` 都**没有**设置 `NODE_ENV=production`，所以线上 `_site/` 里的 `components.css` 实际是 dev hub 形态（7 次额外请求），而不是 concat 单文件。需要真正启用 prod 形态时，得在 build 命令或 workflow 里补 `NODE_ENV=production`。

## 站点结构

```
src/
├── _data/
│   └── site.js              ← 全局站点元信息（标题 / 导航 / 作者 / site.url 等）
├── _includes/
│   ├── layouts/             ← 模板布局（都用 11ty front-matter 的 layout: 继承，不走 Nunjucks extends）
│   │   ├── base.njk         ← HTML 骨架：head + CSS 串接 + 主题早期脚本 + skip-link + header + footer + Person JSON-LD
│   │   ├── index.njk        ← 首页外层（包 content 槽）
│   │   ├── page.njk         ← 通用页面（about）
│   │   ├── detail.njk       ← 详情页（blog / portfolio，含 prev/next pager）
│   │   └── paper.njk        ← 论文精读页（ScholarlyArticle JSON-LD + inline paper-reader.css + 动态 import paper-reader/main.js）
│   └── partials/
│       ├── header.njk       ← 顶栏（nav + 主题切换）
│       ├── footer.njk       ← footer
│       └── theme-toggle.njk ← 主题切换按钮
├── assets/
│   ├── css/
│   │   ├── tokens.css       ← 设计 tokens（颜色 / 字体 / 间距，可执行事实源）
│   │   ├── base.css         ← reset + 元素基础样式
│   │   ├── components/      ← 组件源码（index.css 入口 + 7 个 partial），见上节
│   │   ├── layout.css       ← 布局（wrap / section 等）
│   │   ├── pages.css        ← 页面专用（portfolio / blog / papers 等）
│   │   ├── a11y.css         ← 无障碍专用样式（reduced-motion / prefers-contrast / forced-colors）
│   │   └── paper-reader.css ← 论文精读页专用，paper.njk 里 inline 进 <style>
│   ├── fonts/               ← 预留的自托管字体目录，当前为空（走 Google Fonts）
│   ├── img/og/              ← og:image 三尺寸（SVG 源 + PNG 导出）
│   ├── favicon.svg
│   └── js/
│       ├── main.js          ← 入口：import theme + nav
│       ├── theme.js         ← light/dark 切换 + localStorage 持久化
│       ├── nav.js           ← 移动端 drawer 切换
│       └── paper-reader/    ← 论文精读 ESM 模块（main / toc / annotations / reading-progress / highlight / theme）
├── content/
│   ├── about.md             ← 关于页正文（被 11ty ignores，只经 aboutHtml 全局数据喂给 about.njk）
│   ├── blog/                ← 博客文章，每篇一个目录，内含 index.md
│   ├── papers/              ← 论文精读，每篇一个目录，内含 paper.md + annotations.json + cover.svg
│   └── portfolio/           ← 作品集，每篇一个目录，内含 index.md
├── eleventy-helpers.cjs     ← 共享工具（目前导出 getSlugFromData，被 3 个 *.11tydata.cjs 消费）
├── index.njk                ← 首页正文（被 layouts/index.njk 包）
├── about.njk                ← 关于页（layout: page.njk）
├── blog.njk / portfolio.njk / papers.njk   ← 三个列表页
├── feed.njk / sitemap.njk / robots.njk / 404.njk
```

## 编写内容

三类内容都是**每篇一个目录**，但正文文件名和配套文件不同：

| 类型 | 目录 | 正文文件 | 配套 |
| --- | --- | --- | --- |
| 博客 | `src/content/blog/<yyyy-mm-dd-slug>/` | `index.md` | `cover.png` / `cover.svg`（可选） |
| 作品集 | `src/content/portfolio/<slug>/` | `index.md` | `cover.png` / `cover.svg`（可选） |
| 论文 | `src/content/papers/<slug>/` | **`paper.md`** | `annotations.json`（必需）、`cover.svg`、`index.md`（可选入口页） |

每个内容子目录根下有一个 `<dirname>.11tydata.cjs`，统一管 layout 与 permalink，所以**新文章不用自己写 `layout` 和 `permalink`**：

- `blog.11tydata.cjs` → `layouts/detail.njk`，permalink `/blog/<slug>/`，注入 `prev` / `next`
- `portfolio.11tydata.cjs` → `layouts/detail.njk`，permalink `/portfolio/<slug>/`，注入 `prev` / `next`
- `papers.11tydata.cjs` → `layouts/paper.njk`，permalink `/papers/<slug>/`，并把 `slug` 暴露给 layout

slug 的提取规则见 `src/eleventy-helpers.cjs`：文件名是 `index.md` 时取目录名，`paper.md` 这类非 index 文件取 filePathStem 倒数第二段。

### 新增一篇博客

在 `src/content/blog/` 下新建目录 `YYYY-MM-DD-slug/`，里面放 `index.md`：

```markdown
---
title: 文章标题
slug: 2026-09-12-era5-reanalysis-intro
date: 2026-09-12
author: Yihang Lv
tags: [reanalysis, era5]
cover: cover.png
excerpt: 一句话简介
readingTime: 8
status: published
---

正文 Markdown…
```

首页 / 列表页会自动列出。首页 `src/index.njk` 直接取 `collections.blog | head(3)` 和 `collections.papers | head(3)`；列表页走 `collections`，按 `date` 倒序。

### 新增一个项目

`src/content/portfolio/<slug>/index.md`，front-matter 参考现有条目：

```markdown
---
title: 项目标题
slug: <slug>
type: tool
year: 2024
role: Solo
stack: [Python, xarray]
cover: cover.png
repo: https://github.com/...
demo: https://...
status: shipped
---
```

### 新增一篇论文

`src/content/papers/<slug>/` 下至少两个文件：

1. **`paper.md`** —— 正文。**YAML frontmatter 必须在文件第 1 行**（11ty v3 不解析放在 HTML 注释后的 frontmatter）。布局与 permalink 由 `papers.11tydata.cjs` 注入，不用自己写。三篇现有论文的字段并不完全一致，按需取用：

   ```markdown
   ---
   title: "论文标题"
   slug: <slug>
   authors: [作者1, 作者2]
   affiliation: "单位"
   journal: "期刊"
   year: 2026
   doi: "10.xxxx/xxxxx"
   doi_url: "https://doi.org/10.xxxx/xxxxx"   # 可选
   pdf: https://...                          # 可选
   abstract: "..."                           # 或 summary:，二选一
   description: "..."                        # SEO 描述
   cover: "cover.svg"                         # 可选，og:image override
   readingStatus: finished                    # finished | reading | queued
   totalAnnotations: 14                       # 可选
   status: reading                            # 首页 / 列表页的状态徽章会读它
   tags: ["TRMM", "lightning"]
   ---
   ```

2. **`annotations.json`** —— 批注数据，字段规范见 `docs/papers-interaction.md`。`anchor.value` 必须能命中 `paper.md` 里的段落 id。

3. `cover.svg`（1500×600 学术封面）与可选的 `index.md` 入口页。

段落 id 用 `<h2 id="p-XXX">` 或 `<a id="p-XXX"></a>`，批注 `anchor.value` 必须能命中。

> `src/content/papers/*/index.md` 会被 `eleventyConfig.ignores` 排除，不参与渲染。放不放都行；放了能当本地入口预览，但**不要**指望它出现在 `_site/` 里。

## 修改视觉

设计 token 全部集中在 `src/assets/css/tokens.css`，改 token 后整个站点的色 / 字 / 距会同步更新。规范说明见 `docs/design-system.md` v1.0 —— 两者的关系是：**`tokens.css` 是可执行事实源，`design-system.md` 是规范源**；两者冲突时以 `tokens.css` 为准（历史上为过 WCAG AA 对比度调过几档色值，规范文档可能滞后）。

如新增组件类，放 `src/assets/css/components/_misc.css`（跨页面复用）或 `pages.css`（页面专用），不要在 `tokens.css` 里塞实现。7 个 partial 的职责划分见 `docs/design-system.md` §6.0，新增组件优先考虑归入 `_misc.css`。

## 部署前 checklist

- [ ] `npm run build` 成功（无 11ty 错误）
- [ ] `grep -rE 'href="/assets/|src="/assets/' _site/*.html` 期望 0 命中（资产路径必须走 `{{ '/path' | relUrl }}` 渲染成相对路径，不能硬编码根绝对路径）
- [ ] `_site/` 不在版本控制里（已在 `.gitignore`）
- [ ] Google Fonts 域名是否在境内可达；如不可达，把 `base.njk` 里的 `<link>` 换成 `fonts.loli.net` 或自托管到 `assets/fonts/`（该目录已存在但当前为空，passthrough glob `src/assets/fonts/**/*` 已配好，丢字体文件进去即可）
- [ ] 如果部署到子路径，确认 `src/_data/site.js` 的 `site.url` 与实际部署路径一致 —— `pathPrefix` 从它自动派生
