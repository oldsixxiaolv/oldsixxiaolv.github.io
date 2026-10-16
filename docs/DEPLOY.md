# MeteoHub · 部署说明

站点是**纯静态站**：Eleventy 3 把 `src/` 编译成 `_site/`（HTML + CSS + JS + 图片，无后端、无数据库、无服务端代码）。产物可以直接托管在 GitHub Pages 上。

- 仓库：`oldsixxiaolv/MeteoHub`（project site）
- 线上地址：**<https://github.lvyihang.xyz/MeteoHub/>**
- 发布方式：GitHub Actions（push 到 `main` 自动触发）

---

## 一、一次性设置（只需做一次）

### 1. 开启 GitHub Pages

仓库 **Settings → Pages → Build and deployment → Source → 选 `GitHub Actions`** → Save。

> **这一步没法用代码代替。** `.github/workflows/deploy.yml` 里没有、也不该有 `enablement: true`
> ——官方 `actions/configure-pages@v5` 的 action.yml 明确写着该选项
> "requires a token other than `GITHUB_TOKEN`"，用默认 token 无效。
> 要让它自动开启就得额外配一个 PAT secret，为了省一次鼠标点击去管理密钥不划算。

### 2. Actions 权限

仓库 **Settings → Actions → General → Workflow permissions** 选
**Read and write permissions**。

默认的只读权限会让 `deploy-pages` 报 `403 Resource not accessible by integration`，
这是最常见的部署失败原因。

### 3. 自定义域名（已经配好了，不用再动）

- 用户主页仓库 `oldsixxiaolv.github.io` 的 `CNAME` = `github.lvyihang.xyz`
- DNS：`github.lvyihang.xyz` CNAME → `oldsixxiaolv.github.io`（已生效，实测可解析）
- 证书：`github.lvyihang.xyz` 的 TLS 正常

**MeteoHub 仓库不需要自己的 CNAME。** 按官方文档
[Using a custom domain across multiple repositories](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains-and-github-pages)：

> By default, if you set a custom domain for a **user site**, that same custom domain will be
> used for all project sites owned by the same account. […] the GitHub Pages site for that
> repository will be available at `www.octocat.com/octo-project`.

项目站**自动继承**用户站的域名并挂在 `/MeteoHub/` 下。仓库根的 `CNAME` 文件只是把这件事
写进产物做自文档化，不承担实际作用——官方文档也说明 CNAME 文件本身不会设置域名：

> A `CNAME` file in your repository file does not automatically add or remove a custom domain.

域名分工：`github.lvyihang.xyz/` 根目录放网盘，`/MeteoHub/` 放学术主页。

---

## 二、日常发布

```bash
git push oldsixxiaolv main
```

然后看仓库 **Actions** 标签页 → `Deploy MeteoHub to GitHub Pages` → 绿勾即成功。
绿色后等 1–3 分钟让 CDN 生效（首次部署可能更久）。

---

## 三、路径前缀（pathPrefix）

Eleventy 从 `src/_data/site.js` 的 `url` 自动派生：

```
url: "https://github.lvyihang.xyz/MeteoHub"   →  pathPrefix = "/MeteoHub"
```

- **生产构建**：`pathPrefix = /MeteoHub`，模板里的 `{{ '/assets/...' | url }}` 渲染成 `/MeteoHub/assets/...`
- **dev server**：`pathPrefix = /`，直接开 <http://127.0.0.1:8080/> 即可，不重定向

`dev server` 与生产构建写**不同的输出目录**：

| 模式 | 输出目录 | 触发命令 |
| --- | --- | --- |
| 开发（热更新） | `_site_dev/` | `npm run serve` |
| 生产 | `_site/` | `npm run build` |

> ⚠️ 早期两者都写 `_site/`，导致「dev server 开着时跑一次 build，页面所有图片和 CSS 一起 404」。
> 现在已拆开，两个产物互不覆盖。

---

## 四、本地预演生产构建

```bash
npm ci                    # 注意：package.json 与 package-lock.json 必须同步，否则 npm ci 直接报 EUSAGE
npm run build             # 先跑 CSS 括号检查，再 Eleventy
python3 -m http.server 8081 --directory _site
```

但这样打开 <http://127.0.0.1:8081/> 会因为 `/MeteoHub/` 前缀而 404。要在本地复现线上路径：

```bash
mkdir -p /tmp/preview && ln -sfn "$PWD/_site" /tmp/preview/MeteoHub
cd /tmp/preview && python3 -m http.server 8081
# 打开 http://127.0.0.1:8081/MeteoHub/
```

或者用 Eleventy 自带的 serve（它会自动降级到根路径，产物写到 `_site_dev/`）：

```bash
npm run serve
```

---

## 五、验证清单

部署后逐条确认：

- [ ] <https://github.lvyihang.xyz/MeteoHub/> 返回 200，且能看到人像照片
- [ ] `/MeteoHub/about/`、`/MeteoHub/blog/` 返回 200
- [ ] 浏览器 DevTools → Network 里 `assets/css/pages.css`、`assets/img/author/portrait.jpg` 都是 200
- [ ] 分享链接的预览图是 `Yihang Lyu`（不是旧的 `Yihang Lv`）
- [ ] 页脚 `Edit this page` 指向 GitHub 编辑界面
- [ ] Actions 里这次运行是绿勾

---

## 六、故障排查

### A. `npm ci` 报 EUSAGE

```
`npm ci` can only install packages when your package.json and package-lock.json are in sync.
```

`package.json` 与 `package-lock.json` 不同步。**CI 是干净环境，本地 `node_modules` 是现成的，
所以这个问题只在 CI 暴露，本地 `npm run build` 一直正常。** 修法：

```bash
npm install --package-lock-only   # 只更新 lockfile，不动 node_modules
```

改完依赖后记得提交 `package-lock.json`。

### B. `deploy-pages` 报 403 / Resource not accessible by integration

Actions 的 Workflow permissions 是只读。见上文「一次性设置 · 2」。

### C. Configure Pages 报 Get Pages site failed

Pages 没开启。见上文「一次性设置 · 1」。

### D. 页面能开但图片/CSS 全 404

资源路径缺 `/MeteoHub` 前缀，或反过来。检查产物：

```bash
# 生产产物应全部带前缀
grep -c 'href="/MeteoHub/' _site/index.html          # 期望 ≥ 8
grep -cE 'href="/assets/|src="/assets/' _site/index.html  # 期望 0
```

### E. 首次访问 404，刷新后正常

GitHub Pages 的 CDN 首次请求时节点还没有缓存，会回源取一次。等 1–3 分钟，或清浏览器缓存重试。

### F. 本地改了 CSS 但页面没变

改的是 `src/assets/css/components/_*.css` 这 7 个 partial 之一——它们被拼成
`components.css`，Eleventy 不监听 `fs.readFileSync`。**改这几个文件要重启 dev server。**

---

## 七、构建期自检

`npm run build` 会先跑 `scripts/check-css-braces.cjs`：剥掉注释与字符串后统计花括号是否配平。

**这个检查是有来历的**：本项目已经两次因为漏一个收尾花括号，导致后面整段规则被静默吞掉——
构建不报错、HTTP 全 200、控制台干净，只有肉眼看截图才发现。所以放在构建第一步拦住。

```bash
npm run check:css   # 单独跑
```
