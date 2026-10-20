# MeteoHub · 个人学术站点

一个为大气科学研究者打造的个人学术站点：**自介 + 论文 + 博客 + 论文精读**。
Eleventy 11ty 从 Markdown 源构建出纯静态站点，零后端、零数据库。

## 模块

| 模块 | 路径 | 说明 |
| --- | --- | --- |
| 首页 | `/` | 自介 bio + Manuscript_Lvyh inline link + 近期博客/论文/精读入口 |
| 论文列表 | `/papers/` | 全部同行评议论文：状态角标、作者高亮，外加 DOI / PDF / 胶囊 / 数据集链接 |
| 论文精读 | `/papers/trmm-thunderstorm-stages/` | 单篇论文：左侧原文 + 右侧批注，六种 kind 配色 + 双向联动 |
| 博客 | `/blog/` | 学习笔记与长文思考，按发布日期倒序 |
| 关于 | `/about/` | 我是谁 / 研究方向 / 教育背景 / 联系方式 |

> **作品集模块（`/portfolio/`）目前没有发布**：`src/content/portfolio/` 目录与其
> `portfolio.11tydata.cjs` 还在（加内容时可直接用），但目录下**没有条目**，
> 也没有列表页模板 `src/portfolio.njk`，所以产物里**未发布** `/portfolio/` 路由。
> 保留还是删除见 `docs/IMPROVEMENT-LOG.md` 的待拍板段。

## 论文精读（站点差异化亮点）

论文详情页左半部分渲染论文原文，右半部分是批注侧栏。
每个批注按 `kind` 分类，配色走设计系统的设计 token（不写死 HEX）：

| kind | 颜色 token | 含义 |
| --- | --- | --- |
| `question` | `--color-brand-400` | 疑问 / 待查 |
| `insight` | `--color-accent-400` | 心得 / 灵感 |
| `critique` | `--color-warning` | 方法学质疑 |
| `figure` | `--color-sage-700` | 配合插图说明 |
| `link` | `--color-sage-500` | 外链补充阅读 |
| `typo` | `--color-danger` | 待勘误 |

> 上表与 `src/assets/css/components/_paper.css` 保持一致。`docs/papers-interaction.md` 附录 C 曾提议把 `figure` 改成 `--color-brand-300`，但代码目前仍按 `sage-700` 渲染 —— 要改请同时改两边。

段落和批注卡双向联动：点段落到批注卡闪烁、点批注卡回滚段落并闪烁、
滚动正文时 IntersectionObserver 自动高亮侧栏当前批注卡。键盘 ←/→ 在段间切换，
Esc 取消高亮。完整交互规范见 `docs/papers-interaction.md`。

## 设计语言

「流场蓝 × 暖橙赭石」的冷暖对照：蓝主调（流场蓝 + sage 数据绿）作理性背景，
赭石橙（accent-400）作强调与温度感。字体走 Noto Serif SC + Source Serif 4 + Inter，
长文进 `<article>` 自动切衬线，UI 用无衬线。
完整规范（颜色 token / 字号阶梯 / 间距 / 圆角阴影）见 `docs/design-system.md`。

## 启动

需要 **Node ≥ 22**（`package.json` 的 `engines.node` 就是这个下限，两处必须一致）。

> 为什么不是 18/20：Node 20 已于 2026-04-30 结束支持（EOL），继续用它跑构建等于
> 把发布管线建在不再收安全更新的运行时上；另外 build 链里的窄屏溢出门禁要用
> CDP over WebSocket，Node 20 上必须加 `--experimental-websocket` 旗标，
> Node 22.0.0 起免旗标、22.4.0 起转正。

```bash
npm install      # 一次性
npm run serve    # http://localhost:8080（带热更新）
npm run build    # 产出 _site/，并跑完整门禁链
```

`npm run build` 出的 `_site/` 是纯静态产物，可托管到 GitHub Pages、Vercel、
Cloudflare Pages、Nginx 等任意静态服务。详细运行 / 调试见 `HOW_TO_RUN.md`。

### 命令一览

`npm run build` = 下面这些门禁**按序**跑一遍（门禁全过才算构建成功）。
`npm run serve` 是本地预览。

| 命令 | 查什么 |
| --- | --- |
| `npm run build` | 整链：先跑离线门禁，再 Eleventy 构建，再跑产物门禁 |
| `npm run serve` | 本地 dev server（热更新） |
| `npm run check:gates` | **门禁接线**：每道门禁都必须从 `build` 可达（防止"门禁被摘掉"） |
| `npm run check:tracked-refs` | 已跟踪文件里引用的本地文件必须也已被 git 跟踪 |
| `npm run check:log-sections` | 改进日志的 `##` 节**只增不减**（历史全量核对） |
| `npm run check:decision-ids` | 待拍板编号唯一性：一个编号只能指一件事（台账内外同号必须是同一件事） |
| `npm run check:decision-ids-selftest` | 上面那道门禁的本地夹具自测（13 档注入矩阵，证明它能变红） |
| `npm run check:css` | CSS 大括号平衡 + 死 CSS |
| `npm run check:wrap` | 长 DOI / 长 URL 不能把窄屏页面撑破 |
| `npm run check:tool-routes` | 浏览器工具量到的必须是真页面，不是本站 404 页 |
| `npm run check:site` | 结构化数据与元数据逐项核对（`scripts/verify-site.cjs`） |
| `npm run check:image` | 页面里声明的图与产物里真实存在的图是同一张 |
| `npm run check:lang` | 语言标记统一 + 编码损坏 |
| `npm run check:a11y` | WCAG AA 实测缺陷固化成可重复检查 |
| `npm run check:print-theme` | 打印结果与屏幕主题无关（深色底不会打成白底） |
| `npm run check:copy` | 直接出字节的出口（`.bib` / `.ris`）取值方式正确 |
| `npm run check:overflow` | 窄屏（390px）无横向溢出（真浏览器实测） |
| `npm run check:artifact` | 产物里的 @id / license / 版本 / 地址与 `site.js` 逐字一致 |
| `npm run check:jsonld` | JSON-LD 合法，站点实体与页面实体接得上 |
| `npm run check:identity` | 身份句柄（ORCID / GitHub / CSDN / ResearchGate）登记一致 |
| `npm run check:identity-derivation` | 身份 URL 必须**派生**出来，不许抄成字面量 |
| `npm run check:citation-meta` | 论文页 `citation_*` 标签与 `site.js` 逐字一致 |
| `npm run check:citation-meta-selftest` | 上面那道门禁的本地夹具自测（10 档注入矩阵，证明它能变红） |
| `npm run check:citation-cff` | 仓库根 `CITATION.cff` 与 `site.js` 逐字节一致 |
| `npm run gen:citation-cff` | 按 `site.js` **重写** `CITATION.cff`（改过事实后跑这个） |
| `npm run check:citation-cff-selftest` | 上面那道门禁的本地夹具自测（10 档注入矩阵，证明它能变红） |
| `npm run check:live` | 线上部署核查（**不在 build 链**，部署后跑） |
| `npm run check:live-selftest` | 线上核查门禁的本地夹具自测（7 档注入矩阵） |
| `npm run check:readme` | 本 README 里可机器核对的事实（路由 / Node 下限 / 命令 / 出口）与现状一致 |
| `npm run check:readme-selftest` | 上面那道门禁的本地夹具自测（6 档注入矩阵，证明它能变红） |

> **唯一不在 `build` 链里的门禁**是 `npm run check:live`（线上部署核查）：
> 它要联网，而 build 跑在 deploy **之前**，那时线上还是上一次部署，
> 接进 build 等于每次都对着旧站点判红。它的位置在**部署之后** ——
> `.github/workflows/deploy.yml` 的 `verify-live` job 会在部署完立刻跑它。

### 公开出口

站点对外提供这些可被引用的地址（`site.js` 的 `url` 是全站唯一绝对地址来源）：

| 出口 | 地址 | 说明 |
| --- | --- | --- |
| BibTeX | `/publications.bib` | 作者名已转成 `Last, First`，缺字段不输出 |
| RIS | `/publications.ris` | 引用管理器通用格式 |
| RSS | `/feed.xml` | 博客与论文更新 |
| 站点地图 | `/sitemap.xml` | 路由与 `lastmod`（取源文件最后一次 git 提交时间） |
| robots | `/robots.txt` | |
| 仓库引用元数据 | 仓库根 `CITATION.cff` | CFF 1.2.0；GitHub 的 "Cite this repository" 按钮读它，`preferred-citation` 指向站内那篇 JGR 论文 |

### 部署到 GitHub Pages（`github.lvyihang.xyz` 根目录）

本项目部署在**用户站仓库** `oldsixxiaolv/oldsixxiaolv.github.io`，内容铺在域名根 `/`，没有子路径：

1. `src/_data/site.js` 的 `url` 设为 `https://github.lvyihang.xyz` —— 全站唯一绝对地址来源，canonical / og:url / sitemap 全由它派生。
2. **不要**硬编码 `/assets/...`，全部用 `{{ '/assets/css/tokens.css' | relUrl }}` 过滤器渲染成相对路径（`assets/...` / `../assets/...`）。相对路径与挂载点无关，`_site/` 整个文件夹扔到哪都能跑。
3. 仓库 **Settings → Pages → Source → `GitHub Actions`**，Custom domain 填 `github.lvyihang.xyz`。
4. dev server 验证：`npm run serve`，开 `http://127.0.0.1:8080/`，与线上结构一致。

详细方案、验证步骤见 **`docs/DEPLOY.md`**。

## 添加内容

- **博客**：在 `src/content/blog/YYYY-MM-DD-slug/index.md` 加 frontmatter
  （`title / slug / date / author / tags / excerpt / cover / readingTime / status`）。
- **作品集**：在 `src/content/portfolio/<slug>/index.md` 加
  （`title / slug / type / year / role / stack / cover / repo / demo / status`）。
  ⚠️ 目前**只加文件不会上线**：作品集没有列表页模板（`src/portfolio.njk`），
  目录里也没有条目，所以产物里**未发布** `/portfolio/` 路由 —— 要发布得先补列表页。
  待拍板见 `docs/IMPROVEMENT-LOG.md`。
- **论文**：在 `src/content/papers/<slug>/` 加：
  - `paper.md`（正文，**YAML frontmatter 必须在第 1 行**，11ty v3 不解析放在 HTML 注释后的 frontmatter）—— 必填 `title / slug / authors / journal / year / doi / tags`，其余按需（`doi_url / pdf / abstract` 或 `summary` / description / cover / status / readingStatus / affiliation / layout）。三篇现有论文的字段并不完全一致，写之前先照抄同目录里最接近的一篇。
  - `annotations.json`（批注，至少 `id / kind / title / body / tags / createdAt / anchor` 字段，`anchor.value` 必须能命中 paper.md 的段落 id）。
  - `cover.svg`（1500×600 学术封面）。
  - `index.md`（可选入口页；被 `eleventyConfig.ignores.add("src/content/papers/*/index.md")` 排除，不参与渲染）。

  段落 id 用 `<h2 id="p-XXX">` 或 `<a id="p-XXX"></a>`，批注 `anchor.value` 必须能命中（frontmatter 必须文件第 1 行，否则 11ty 解析不到）。

三类内容的 `layout` 与 `permalink` 都由各自目录下的 `<dirname>.11tydata.cjs` 注入，新文章不用自己写。

加完后 `npm run serve` 自动 rebuild。

## 目录结构

```
.
├── eleventy.config.js     # 11ty 配置（collections / filters / passthrough / pathPrefix / components.css 生成）
├── package.json           # 脚本与门禁入口（engines.node = ">=22"）
├── CITATION.cff           # 仓库引用元数据（CFF 1.2.0）—— 由 npm run gen:citation-cff 从 site.js 生成
├── scripts/               # 21 道门禁（check-*.cjs / verify-site.cjs）+ 本地 QA 工具（screenshot / lighthouse / slow3g）
├── HOW_TO_RUN.md          # 详细运行 / 调试 / 部署前 checklist
├── README.md
├── CNAME.example          # 自定义域名占位示例（本项目站不需要，见 docs/DEPLOY.md）
├── LICENSE                 # Apache License 2.0
├── _archive/               # 旧平台归档（不回溯，不参与构建）
├── docs/                   # 设计 / 信息架构 / 论文交互 / 部署 / 改进日志 / 验收报告
├── src/
│   ├── _data/site.js       # 全局元信息（标题 / nav / 作者 / site.url / 论文 / 身份句柄）
│   ├── _includes/
│   │   ├── layouts/        # base / index / page / detail / paper
│   │   └── partials/       # header / footer / hero / publications / citation-meta / theme-toggle
│   ├── assets/
│   │   ├── css/            # tokens / base / components(7 partial) / layout / pages / a11y / paper-reader / print
│   │   ├── js/             # main / nav / theme + paper-reader/ ESM 模块
│   │   ├── img/            # author / og(三尺寸) / publications
│   │   └── favicon.svg
│   ├── eleventy-helpers.cjs
│   ├── index.njk / about.njk / blog.njk / papers.njk / 404.njk   # 页面模板
│   ├── publications.bib.njk / publications.ris.njk / feed.njk / sitemap.njk / robots.njk   # 对外出口
│   └── content/
│       ├── about.md
│       ├── blog/<slug>/index.md
│       ├── papers/<slug>/paper.md + annotations.json + cover.svg
│       └── portfolio/      # 目录在、条目空 → 当前不发布 /portfolio/ 路由
└── .github/workflows/deploy.yml   # GH Pages 自动部署（build → deploy → verify-live）
```

## 部署

GitHub Pages 部署步骤（Actions 工作流 + Settings 配置 + 自定义域名 +
故障排查）见 **`docs/DEPLOY.md`**。

## 贡献与许可

源码采用 Apache License 2.0（见 `LICENSE`）。博客正文 / 论文批注等内容采用
CC BY-NC-SA 4.0。提交 PR / Issue 前请本地跑一遍 `npm run build` —— 它会跑完整
门禁链，**门禁全过**才算通过（`npm run check:readme` 也在链上：改了路由、
Node 下限、命令或公开出口，README 不同步就会红）。改过 `site.js` 里的事实
（论文 DOI / 作者 / 关键词）后，记得跑 `npm run gen:citation-cff` 重生成
`CITATION.cff`，否则 `npm run check:citation-cff` 会判红。

## 相关链接

- 论文手稿仓：[oldsixxiaolv/Manuscript_Lvyh](https://github.com/oldsixxiaolv/Manuscript_Lvyh) —— 与本站仓（MeteoHub）分开，专门存放合作论文的批注版与配套数据管线（TRMM 2026 论文 + Zenodo doi: 10.5281/zenodo.18041880）
- 详细运行 / 调试：`HOW_TO_RUN.md`
- 信息架构：`docs/information-architecture.md`（设计规划稿，含尚未实现的 `/tags/` `/search/` `/cv/`）
- 设计规范：`docs/design-system.md`
- 论文精读交互：`docs/papers-interaction.md`
- 部署说明：`docs/DEPLOY.md`
- 工程取舍记录：`docs/implementation-notes.md`

> `docs/` 下的验收 / 性能类报告（`acceptance-report.md`、`lighthouse-include.md`、`og-image-and-a11y-report.md`、`lighthouse/*.json`、`fa-data/`）是**历史快照**，只反映各自标注日期的实测状态，不随代码更新，需要现状请重跑 `scripts/` 里对应的工具。