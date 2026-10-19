# MeteoHub · 部署说明

站点是**纯静态站**：Eleventy 3 把 `src/` 编译成 `_site/`（HTML + CSS + JS + 图片，无后端、无数据库、无服务端代码）。产物可以直接托管在 GitHub Pages 上。

- 仓库：`oldsixxiaolv/oldsixxiaolv.github.io`（**用户站仓库**，内容铺在域名根 `/`）
- 线上地址：**<https://github.lvyihang.xyz/>**
- 发布方式：GitHub Actions（push 到 `main` 自动触发）

---

## 一、一次性设置（只需做一次）

### 1. 仓库必须是 public（除非你开的是 GitHub Pro）

官方文档写明：

> GitHub Pages is available in **public repositories** with GitHub Free and GitHub Free for
> organizations, and in public and private repositories with GitHub Pro, GitHub Team,
> GitHub Enterprise Cloud, and GitHub Enterprise Server.

**GitHub Free 的个人账号只能给公开仓库开 Pages。** 私有库 + Free 账号，`deploy-pages`
会直接失败，报 `Get Pages site failed` 或 403。这是新手最容易卡住的一条。

两条路二选一：

- **把仓库改成 public**（免费）。站点本来就是公开的学术主页，仓库里也没有密钥——
  `data/`、`secret.key`、`_site/`、QA 产物都已在 `.gitignore` 里。
- **升级 GitHub Pro**（保留私有库）。

> 本仓库本身就是用户站仓库 `oldsixxiaolv.github.io`，受这条限制同样适用。

### 2. 开启 GitHub Pages

仓库 **Settings → Pages → Build and deployment → Source → 选 `GitHub Actions`** → Save。

> **这一步没法用代码代替。** `.github/workflows/deploy.yml` 里没有、也不该有 `enablement: true`
> ——官方 `actions/configure-pages@v5` 的 action.yml 明确写着该选项
> "requires a token other than `GITHUB_TOKEN`"，用默认 token 无效。
> 要让它自动开启就得额外配一个 PAT secret，为了省一次鼠标点击去管理密钥不划算。

### 3. Actions 权限（**不用动**）

`deploy.yml` 顶部已经声明了自己的权限：

```yaml
permissions:
  contents: read
  pages: write
  id-token: write
```

工作流里显式声明的 `permissions:` **会覆盖仓库级的默认值**，所以不需要去
Settings → Actions → General 把 "Read and write permissions" 打开。
`id-token: write` 是 `deploy-pages` 换取 OIDC token 的前提，也已经在了。

### 4. 自定义域名（本仓库 Settings 里配）

- DNS：`github.lvyihang.xyz` CNAME → `oldsixxiaolv.github.io`（已生效，实测可解析）
- 本仓库 **Settings → Pages → Custom domain** 填 `github.lvyihang.xyz` → Save
- Enforce HTTPS：保持勾选
- 证书：等 TLS 签发，最长 24 小时

**站点在域名根 `/`，没有 `/MeteoHub/` 这一层。** 本仓库是 `oldsixxiaolv.github.io`
这个**用户站仓库**，GitHub 把它的内容直接铺在域名根上——用户站仓库没有"项目站挂
子路径"这回事。

**不需要 CNAME 文件。** 而且**产物里带 CNAME 反而会让部署失败**：一个自定义域名只能
属于一个站点，官方文档写明冲突时报域名被占用：

> If you get an error about a custom domain being taken, you may need to remove the custom domain
> from another repository.
>
> — [Managing a custom domain for your GitHub Pages site](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)

因此仓库根的 `CNAME` 已删除，`deploy.yml` 里也加了一道断言：产物里只要出现
`_site/CNAME` 就让构建直接失败，避免以后不小心把线上域名搞挂。

---

## 二、日常发布

```bash
git push oldsixxiaolv main
```

然后看仓库 **Actions** 标签页 → `Deploy MeteoHub to GitHub Pages` → 绿勾即成功。
绿色后等 1–3 分钟让 CDN 生效（首次部署可能更久）。

---

## 三、路径前缀（pathPrefix）

站点在域名根，**没有路径前缀**。`src/_data/site.js` 的 `url` 是全站唯一绝对地址来源：

```js
url: "https://github.lvyihang.xyz"     // canonical / og:url / sitemap 全由它派生
```

`url` 只影响**元数据**（canonical、og、sitemap、JSON-LD），不影响页面里的资源引用——
后者走 `relUrl` 过滤器渲染成 `../assets/...` 这种**相对路径**，与挂载点无关。

⚠️ **改错的后果很隐蔽**：页面照样正常渲染（相对路径照样工作），但 canonical 和
sitemap 会指向 404 的地址，爬虫和分享卡片拿到的都是死链。改 `url` 后务必重新构建
并核对产物里的 `<link rel="canonical">`。

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
# 打开 http://127.0.0.1:8081/
```

因为资源走相对路径，**本地直接用根路径打开即可**，和线上结构一致，不需要再套一层
symlink 模拟子路径。

或者用 Eleventy 自带的 serve（它会自动降级到根路径，产物写到 `_site_dev/`）：

```bash
npm run serve
```

---

## 五、验证清单

部署后逐条确认：

- [ ] <https://github.lvyihang.xyz/> 返回 200，且能看到人像照片
- [ ] `/about/`、`/blog/` 返回 200
- [ ] `curl -s https://github.lvyihang.xyz/ | grep canonical` 显示的地址**不带** `/MeteoHub/`
- [ ] `curl -s https://github.lvyihang.xyz/sitemap.xml` 里每条 `<loc>` 都返回 200
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

`deploy.yml` 已自带 `permissions: { pages: write, id-token: write }`，正常不会发生。
若真出现，检查是不是有第二个 workflow 在抢同一个 `github-pages` 环境，或仓库级
Workflow permissions 被设成了异常的只读值。见上文「一次性设置 · 3」。

### C. Configure Pages 报 Get Pages site failed

Pages 没开启，或 Source 不是 `GitHub Actions`。见上文「一次性设置 · 2」。

### D. 页面能开但图片/CSS 全 404

资源引用必须走**相对路径**（`../assets/...`），不能硬编码根绝对路径。检查产物：

```bash
# 应当 0 命中：任何根绝对路径引用都会在非根挂载点失效
grep -cE 'href="/assets/|src="/assets/' _site/index.html   # 期望 0

# 应当能命中：相对路径引用
grep -c 'assets/css/' _site/index.html                      # 期望 ≥ 3
```

若产物里出现 `/assets/...`，说明模板绕过 `relUrl` 过滤器直接写了绝对路径。

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
