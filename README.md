# MeteoHub · 个人学术站点

一个为大气科学研究者打造的个人学术站点：**作品集 + 博客 + 论文精读**。
Eleventy 11ty 从 Markdown 源构建出纯静态站点，零后端、零数据库。

## 模块

| 模块 | 路径 | 说明 |
| --- | --- | --- |
| 首页 | `/` | 自介 bio + Manuscript_Lvyh inline link + 近期博客/作品集/精读入口（Stage 8 起为自介版） |
| 作品集 | `/portfolio/` | 研究项目，按年份倒序，每个项目有详情页 |
| 博客 | `/blog/` | 学习笔记与长文思考，按发布日期倒序 |
| 论文精读 | `/papers/` | 左侧原文 + 右侧批注，六种 kind 配色 + 双向联动 |
| 关于 | `/about/` | 我是谁 / 研究方向 / 教育背景 / 联系方式 |

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

需要 Node ≥ 18。

```bash
npm install      # 一次性
npm run serve    # http://localhost:8080（带热更新）
npm run build    # 产出 _site/
```

`npm run build` 出的 `_site/` 是纯静态产物，可托管到 GitHub Pages、Vercel、
Cloudflare Pages、Nginx 等任意静态服务。详细运行 / 调试见 `HOW_TO_RUN.md`。

### 部署到 GitHub Pages 项目页（如 `oldsixxiaolv.github.io/MeteoHub/`）

本项目部署到 project site 子路径（仓 `oldsixxiaolv/MeteoHub`，仓名 ≠ 用户名），需要走 **pathPrefix** 方案：

1. `src/_data/site.js` 的 `url` 必须设为完整部署 URL（含子路径）：`https://oldsixxiaolv.github.io/MeteoHub`。
2. `eleventy.config.js` 在返回的 config 对象里设 `pathPrefix`（11ty v3 API）—— 它从 `url` 自动派生，不用手写。
3. **不要**硬编码 `/assets/...`，全部用 `{{ '/assets/css/tokens.css' | url }}` 模板语法 —— 11ty 的 url filter 在 pathPrefix 设置下自动加 `/MeteoHub` 前缀。
4. dev server 验证：`npm run serve` 下 `--serve` 会把 pathPrefix 降级为 `/`，所以直接开 `http://127.0.0.1:8080/` 即可，不用加前缀；想复现线上前缀就 `PATH_PREFIX=/MeteoHub npm run serve`。

详细方案、代码示例、验证步骤见 **`docs/DEPLOY.md`「项目页路径前缀方案（Stage 8.3）」**节。

## 添加内容

- **博客**：在 `src/content/blog/YYYY-MM-DD-slug/index.md` 加 frontmatter
  （`title / slug / date / author / tags / excerpt / cover / readingTime / status`）。
- **作品集**：在 `src/content/portfolio/<slug>/index.md` 加
  （`title / slug / type / year / role / stack / cover / repo / demo / status`）。
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
├── package.json
├── scripts/               # 本地 QA 工具（screenshot / lighthouse / slow3g / contrast check）
├── HOW_TO_RUN.md          # 详细运行 / 调试 / 部署前 checklist
├── README.md
├── CNAME.example          # 自定义域名占位示例（本项目站不需要，见 docs/DEPLOY.md）
├── LICENSE                 # Apache License 2.0
├── _archive/               # 旧平台归档（不回溯，不参与构建）
├── docs/                   # 设计 / 信息架构 / 论文交互 / 部署 / 验收报告
├── src/
│   ├── _data/site.js       # 全局元信息（标题 / nav / 作者 / site.url）
│   ├── _includes/
│   │   ├── layouts/        # base / index / page / detail / paper
│   │   └── partials/       # header / footer / theme-toggle
│   ├── assets/
│   │   ├── css/            # tokens / base / components(7 partial) / layout / pages / a11y / paper-reader
│   │   ├── js/             # main / nav / theme + paper-reader/ 6 个 ESM 模块
│   │   ├── img/og/         # og:image 三尺寸
│   │   └── favicon.svg
│   ├── eleventy-helpers.cjs
│   └── content/
│       ├── about.md
│       ├── blog/<slug>/index.md
│       ├── papers/<slug>/paper.md + annotations.json + cover.svg
│       └── portfolio/<slug>/index.md
└── .github/workflows/deploy.yml   # GH Pages 自动部署
```

## 部署

GitHub Pages 部署步骤（Actions 工作流 + Settings 配置 + 自定义域名 +
故障排查）见 **`docs/DEPLOY.md`**。

## 贡献与许可

源码采用 Apache License 2.0（见 `LICENSE`）。博客正文 / 论文批注等内容采用
CC BY-NC-SA 4.0。提交 PR / Issue 前请本地跑一遍 `npm run build` 确认无 11ty 错误。

## 相关链接

- 论文手稿仓：[oldsixxiaolv/Manuscript_Lvyh](https://github.com/oldsixxiaolv/Manuscript_Lvyh) —— 与本站仓（MeteoHub）分开，专门存放合作论文的批注版与配套数据管线（TRMM 2026 论文 + Zenodo doi: 10.5281/zenodo.18041880）
- 详细运行 / 调试：`HOW_TO_RUN.md`
- 信息架构：`docs/information-architecture.md`（设计规划稿，含尚未实现的 `/tags/` `/search/` `/cv/`）
- 设计规范：`docs/design-system.md`
- 论文精读交互：`docs/papers-interaction.md`
- 部署说明：`docs/DEPLOY.md`
- 工程取舍记录：`docs/implementation-notes.md`

> `docs/` 下的验收 / 性能类报告（`acceptance-report.md`、`lighthouse-include.md`、`og-image-and-a11y-report.md`、`lighthouse/*.json`、`fa-data/`）是**历史快照**，只反映各自标注日期的实测状态，不随代码更新，需要现状请重跑 `scripts/` 里对应的工具。