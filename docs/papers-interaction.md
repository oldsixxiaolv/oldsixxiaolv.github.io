# 论文精读页 · 交互方案（Papers with Annotations）

> 适用模块：`/papers/{slug}/`  
> 目标：在**不依赖任何后端**的前提下，提供类 Hypothes.is / Scholarcy 的精读体验  
> 版本：v1.0 · 2026-09-24
>
> **📐 设计规范 + 落地记录混合稿**。第一至十节是设计规范（部分条目如移动端三 Tab、批注编辑器尚未全部实现）；附录 C / D 是实际落地时的取舍记录。**批注 kind 的实际配色以 `src/assets/css/components/_paper.css` 为准** —— 附录 C.1 是 v1.1 提案，与代码存在一处未收敛的分歧，见该表下方说明。

---

## 一、设计原则

1. **静态优先**：批注数据存在 `annotations.json`，随仓库 commit 即更新。
2. **零数据库**：作者自己读自己的笔记，所以无需多人协作后台。
3. **可移植 / 可迁移**：今天写在 `annotations.json`，明天能 import 进 Obsidian 或 Notion。
4. **性能可控**：单页 1k–10k 段正文，批注 50–300 条，原生 JS 完全扛得住。
5. **可分享**：每个批注可定位、跳转 URL（如 `?a=14`）。

---

## 二、布局总览

### 2.1 桌面端（≥ 1024px）

```
┌──────────────────────────────────────────────────────────────┐
│  Topbar                                                       │
├──────────────────────────────────────────────────────────────┤
│  Paper Header（元信息 + 状态徽章 + PDF 按钮）                  │
├──────────┬──────────────────────────────┬────────────────────┤
│  Sidebar │  正文 (左侧 8/12)            │ 批注 (右侧 4/12)  │
│  (TOC)   │                              │                    │
│  2/12    │  h2 / h3 / paragraph /       │  - Anchor list    │
│          │  blockquote / figure /       │  - Filter chips    │
│          │  annotation marker           │  - Item            │
│          │                              │                    │
├──────────┴──────────────────────────────┴────────────────────┤
│  Footer                                                       │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 平板（768–1023px）

- 批注侧栏折叠为右侧抽屉，点击「批注 14」按钮弹出

### 2.3 移动端（< 768px）

- 单栏堆叠，TOC、批注各为可折叠的 `<details>`
- 顶部工具条提供三个 Tab：**正文 / TOC / 批注**
- 批注项内联嵌入正文对应段底部

> **落地现状（2026-10-20 更新，与本节原文有出入，以附录 D.9 为准）**
>
> 本节写的是**设计稿**，三 Tab 与 `<details>` 折叠**至今未实现**。实际落地：
> - **≤1024px 单栏堆叠** —— 正文占满整宽（此前正文被挤成 200px 窄带，见 D.9）。
> - **目录** —— 正文上方的**静态块**（不是 `<details>`，也不是 Tab）：链接排两列，
>   触控高 ≥ 24px。本篇目录只有 6 条，折叠省不下多少高度。
> - **批注** —— 整层不可达（无 `annotations.json`），本节的批注条目暂不适用（见 D12）。
> - 三 Tab（§7.1）、段下手风琴（§7.2）仍未实现。

---

## 三、批注数据格式（annotations.json）

### 3.1 选用 JSON 而非 YAML 的理由

- 浏览器原生 `JSON.parse`，零依赖
- 字段顺序可读
- Markdown front matter 用 YAML，批注用 JSON，各取其长

### 3.2 顶层结构

```jsonc
{
  "paperSlug": "holton-rollin-1987",
  "schemaVersion": "1.0",
  "lastUpdated": "2026-09-24T10:30:00+08:00",
  "annotations": [
    {
      "id": "a001",
      "anchor": {
        // —— 三选一定位策略 —— //
        "type": "text",       // 字符串精确匹配
        "value": "QBO",
        "occurrence": 1       // 第几次出现
      },
      "kind": "question",     // question | insight | critique | link | figure | typo
      "title": "为什么是 Kelvin 波？",
      "body": "Plumb (1977) 给出了另一种解释，这里可以对比看一下。",
      "tags": ["qbo", "theory"],
      "createdAt": "2026-09-01",
      "links": [
        {"label": "Plumb 1977", "url": "#"}
      ]
    },
    /* … */
  ]
}
```

### 3.3 锚点类型（anchor.type）

| 类型 | 字段 | 说明 | 鲁棒性 |
|---|---|---|---|
| `text` | `value: string`<br>`occurrence: number` | 匹配原文文本第 N 次出现 | ★★★★ |
| `section` | `value: string`（h2/h3 标题文字） | 定位到最近该标题下方 | ★★★ |
| `paragraph` | `paragraphId: string`<br>（编辑器写入 `<p id="p-12">`） | DOM id 定位，最稳 | ★★★★★ |
| `selector` | `value: string`（CSS 路径） | 兜底，几乎不用 | ★★ |

> **推荐**：正文 Markdown 在构建期注入稳定 `id`（如 `p-001`、`p-002` ...），批注 `anchor.type = "paragraph"` 优先；旧批注保留 `text` 类型，构建时做一次错位检查脚本。

### 3.4 批注类型（kind）

| kind | edge token | ink token | 用途 |
|---|---|---|---|
| `question` | `--kind-question-edge` | `--kind-question-ink` | 没想通，准备继续查 |
| `insight` | `--kind-insight-edge` | `--kind-insight-ink` | 心得、灵感 |
| `critique` | `--kind-critique-edge` | `--kind-critique-ink` | 方法学质疑 |
| `link` | `--kind-link-edge` | `--kind-link-ink` | 外链补充阅读 |
| `figure` | `--kind-figure-edge` | `--kind-figure-ink` | 配合插图说明 |
| `typo` | `--kind-typo-edge` | `--kind-typo-ink` | 待勘误 |

> **色值不在这里写**：这 12 个 token（每 kind 一条 edge + 一条 ink）的定义在
> `src/assets/css/components/_paper.css` 的「kind 调色板（6 种批注类型的唯一真源）」段 ——
> 那是**唯一真源**。本表只列 token 名：取值变了改那一处即可，文档不必跟改
> （`scripts/check-paper-interaction.cjs` 的 PI4 守着这条：表里出现色值 token 即判红）。
>
> - **edge** = 状态边条 / 计数徽章（non-text 图形，AA 需 ≥3:1）；
>   **ink** = kind 标签文字 / 筛选激活态文字（正文级小字，AA 需 ≥4.5:1）。
>   两者的具体取值（含为凑对比度做的压暗混色）都在真源那一段里。
> - **图标**：每 kind 一枚**内联 SVG**，路径写在
>   `src/assets/js/paper-reader/annotations.js` 的 `KIND_ICONS` 里 ——
>   站上没有图标字体，别去 CSS 里找图标类名。
> - **kind → 颜色的接线**共三处，都消费上面那 12 个 token：
>   批注卡 `.annot-card[data-kind="…"]`、筛选 chip `.annot-filter[data-kind="…"]`、
>   段落锚点 `.paper-anchor--{kind}`。详见 §5.2。

---

## 四、锚点高亮机制（双向联动）

### 4.1 数据准备（构建期）

- Eleventy 渲染时给正文每个语义元素加 `data-anchor-id`：

```html
<p data-anchor-id="p-001">
  全球大气准两年振荡（QBO）是平流层...
</p>
```

- 同时将**所有**锚点对应的段落包一层 `<mark data-annotation-ids="a001 a014">…</mark>`（同一段被多次批注就累积）。
- 批注侧栏每条 `<li>` 带 `data-annotation-id="a001"`。

### 4.2 单击批注 → 高亮原文（实现伪代码）

```js
document.querySelectorAll('[data-annotation-id]').forEach(li => {
  li.addEventListener('click', e => {
    e.preventDefault();
    const id = li.dataset.annotationId;

    // 1. 移除旧高亮
    document.querySelectorAll('.annotating')
      .forEach(el => el.classList.remove('annotating'));

    // 2. 高亮所有 match 段落
    document.querySelectorAll(`[data-annotation-ids~="${id}"]`)
      .forEach(el => el.classList.add('annotating'));

    // 3. 滚到第一处
    const target = document.querySelector(`[data-annotation-ids~="${id}"]`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // 4. 更新 URL（可分享）
    const url = new URL(location.href);
    url.searchParams.set('a', id);
    history.replaceState(null, '', url);
  });
});
```

```css
.annotating {
  background: linear-gradient(transparent 60%, var(--color-brand-100) 0);
  border-inline-start: 3px solid var(--color-brand-400);
  padding-inline-start: 8px;
  transition: background-color var(--dur-base) var(--ease-out);
}
.annotating.is-active { /* 当前激活 */
  background: linear-gradient(transparent 0%, var(--color-brand-100) 0);
}
```

### 4.3 反向：点击原文 → 激活批注

```js
// 正文段被点击
document.querySelectorAll('[data-anchor-id]').forEach(p => {
  p.addEventListener('click', () => {
    const ids = (p.dataset.annotationIds || '').split(/\s+/).filter(Boolean);
    if (!ids.length) return;
    const firstId = ids[0];

    document.querySelectorAll('.annotating, .is-active')
      .forEach(el => el.classList.remove('annotating', 'is-active'));

    p.classList.add('is-active');

    document.querySelector(`[data-annotation-id="${firstId}"]`)
      ?.classList.add('is-active');

    // 移动端：自动滚动到批注
    if (window.matchMedia('(max-width: 768px)').matches) {
      document.querySelector(`[data-annotation-id="${firstId}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});
```

### 4.4 浏览器后退 / 直链分享

页面加载时读取 `?a=14`，自动激活；用户在浏览器按 Back 返回清除参数。  
（基于 `history.replaceState`，不污染历史栈。）

---

## 五、批注侧栏结构（DOM 与样式）

### 5.1 DOM 草图

```html
<aside class="annot-pane" aria-label="批注侧栏">
  <header class="annot-pane__head">
    <h2>批注 <span class="badge">{N}</span></h2>
    <input type="search" placeholder="筛选…" aria-label="筛选批注">
  </header>

  <nav class="annot-filter" aria-label="批注类型过滤">
    <button class="chip is-active" data-kind="all">全部</button>
    <button class="chip" data-kind="question">疑问</button>
    <button class="chip" data-kind="insight">洞见</button>
    <button class="chip" data-kind="critique">质疑</button>
    <button class="chip" data-kind="link">外链</button>
  </nav>

  <ol class="annot-list">
    <li class="annot-item" data-annotation-id="a001">
      <div class="annot-meta">
        <span class="annot-kind annot-kind--question">疑问</span>
        <time>2026-09-01</time>
      </div>
      <h3 class="annot-title">为什么是 Kelvin 波？</h3>
      <p class="annot-body">Plumb (1977) 给出了另一种解释…</p>
      <ul class="annot-links">
        <li><a href="#">Plumb 1977 →</a></li>
      </ul>
    </li>
    <!-- …… -->
  </ol>

  <footer class="annot-pane__foot">
    <a href="annotations.json" download>下载原始 JSON</a>
  </footer>
</aside>
```

### 5.2 关键样式（与 `design-system.md` 联动）

```css
/* 侧栏容器（完整取值见 paper-reader.css 的 .annot-pane） */
.annot-pane {
  position: sticky;
  top: 88px;
  align-self: start;
  width: 100%;
  overflow-y: auto;
}

/* kind → 颜色的三处接线：批注卡与筛选 chip 由 data-kind 属性驱动，
   段落锚点由 class 驱动（类名形如 .paper-anchor--<kind>，在 paper-reader.css 里接线）。
   三者消费同一批 --kind-* token（取值见 _paper.css 的 kind 调色板段）。 */
.annot-card[data-kind="question"] {
  --kind-edge: var(--kind-question-edge);
  --kind-ink: var(--kind-question-ink);
}
.annot-filter[data-kind="question"] {
  --kind-edge: var(--kind-question-edge);
  --kind-ink: var(--kind-question-ink);
}

/* 批注卡头部的 kind 边条：粗细、线型、颜色都来自 --kind-*，
   勘误（typo）因此拿到一条虚线边条（颜色之外的第二条冗余通道）。 */
.annot-card__head {
  border-inline-start: 2px var(--kind-edge-style, solid) var(--kind-edge);
}

/* .annot-item 是批注卡头部的内层 <button>：
   它只是 JS 契约类（highlight.js 用 .annot-item.is-active 清掉上一个激活卡），
   外观一律在 .annot-card / .annot-card__head 上，这里只留通用行为。 */
.annot-item {
  position: relative;
  background: transparent;
  cursor: pointer;
  transition: background-color var(--dur-base) var(--ease-out);
}
```

> ⚠️ **`.annot-item[data-kind="…"]` 那 6 条从来没匹配上** —— `annotations.js` 把 `data-kind`
> 写在 `<article class="annot-card">` 上，带 `annot-item` 的是内层 `<button>`，
> 它只有 `data-annotation-id`。照旧写法加规则会静默失效
> （`scripts/check-paper-interaction.cjs` 的 PI6 守着这条：带 `data-kind` 的选择器
> 只能用真正承载该属性的类）。
>
> 上面这段只写**接线形状**（谁消费哪个 token），不复制色值与像素值；
> 完整取值在 `src/assets/css/components/_paper.css` 与 `src/assets/css/paper-reader.css`。

---

## 六、过滤 / 搜索 / 排序

| 操作 | 行为 |
|---|---|
| 输入框 | 实时 `title + body + tags` 模糊匹配（`String.includes`，可换 Fuse.js） |
| 类型 chip | 单选；URL 参数 `?kind=question` 持久化 |
| 排序 | v1.0 固定「按 anchor 在正文中出现顺序」 |
| 计数 | 顶部徽章显示「12 / 14」：当前可见 / 总数 |

### 6.1 排序实现

```js
const items = [...document.querySelectorAll('.annot-item')];
items.sort((a, b) => {
  return +a.dataset.position - +b.dataset.position;
});
```

构建期给每个 `annot-item` 注入 `data-position`（其在正文中出现的先后顺序）。

---

## 七、移动端折叠策略

### 7.1 DOM 切换

桌面端 3 栏；移动端改为 **Tab Bar + 单栏**：

```html
<nav class="paper-tabs" role="tablist">
  <button role="tab" aria-controls="tab-text"  aria-selected="true">正文</button>
  <button role="tab" aria-controls="tab-toc"   aria-selected="false">目录</button>
  <button role="tab" aria-controls="tab-annot" aria-selected="false">批注 {N}</button>
</nav>
<section id="tab-text">…</section>
<section id="tab-toc" hidden>…</section>
<section id="tab-annot" hidden>…</section>
```

- 任一时刻只一个 Tab 显示
- 默认进入正文；批注 Tab 上的徽章提示用户
- 批注点击后自动切回正文 Tab，并滚动到 anchor

### 7.2 折叠后的批注体验

- 移动端不暴露「点击批注高亮原文」的网页交互（点击会切走上下文）
- 改为：**点击原文段 → 在段下方展示该段全部批注（手风琴展开）**

```html
<p data-anchor-id="p-001">…</p>
<details class="annot-inline" data-anchor-id="p-001">
  <summary>本段 2 条批注</summary>
  <ol>…</ol>
</details>
```

构建期把批注按 anchor 分组、嵌入对应段后即可。

---

## 八、可访问性

- Tab Bar 用 ARIA `role="tablist"`，键盘 ← → 切换
- 批注项 `<li role="button">`，`Enter` / `Space` 触发高亮
- 屏幕阅读器朗读：批注标题 + 类型 + 锚点文本片段
- 高亮态伴随 `aria-live="polite"` 区域提示「已定位到正文第 X 段」
- `prefers-reduced-motion` 关闭滚动动画

---

## 九、批注编辑工作流

> 这是给作者本人的，不是给读者。

### 9.1 推荐工具栈

| 用途 | 工具 |
|---|---|
| 写作 / 添加批注 | Obsidian（带 Dataview） + 自定义模板 |
| 或：纯手写 | `paper.md` 同目录 `annotations.json`，手动维护 |
| 校验锚点 | **尚未实现** —— 计划中的 `scripts/check-anchors.js` 不存在。目前靠人工核对 `anchor.value` 与 paper.md 的段落 id |

### 9.2 编辑流程（未来可做自动化）

```
[草稿 Markdown] → [本地构建] → [浏览器预览] 
        ↓
   在预览中点击「新增批注」按钮 → 弹出微表单
   选中文字 → 自动生成 anchor
   提交后写入 paper-name.notes.json（与源码分离，方便回滚）
```

> v1.0 不做 UI 端的批注编辑器。先约定 JSON Schema，作者在 Obsidian / VSCode 写。

---

## 十、性能与边界

- 单论文正文字数 ≤ 30k 字，annotations ≤ 500 条时，浏览器无压力
- 大量批注（> 500）时，加 IntersectionObserver 做滚动虚拟化
- 图片公式走 `<img loading="lazy" decoding="async">`
- Mermaid 图按需懒加载：`import()` 动态引入

---

## 十一、验收清单

- [ ] 桌面端正向 / 反向高亮均可用
- [ ] 移动端三 Tab 可达，单击批注能跳正文
- [ ] 键盘 ← → 切换 Tab
- [ ] 直链 `?a=14` 进入即激活
- [ ] 刷新页面后筛选状态从 URL 恢复
- [ ] 反向链接到 PDF 与 DOI 正常打开
- [ ] `annotations.json` 可直接下载
- [ ] 单篇 Lighthouse Performance ≥ 90
- [ ] 屏幕阅读器 NVDA 朗读无障碍

---

## 附录 A：完整示例 `annotations.json`

```json
{
  "paperSlug": "holton-rollin-1987",
  "schemaVersion": "1.0",
  "lastUpdated": "2026-09-24T10:30:00+08:00",
  "annotations": [
    {
      "id": "a001",
      "anchor": {
        "type": "paragraph",
        "value": "p-007"
      },
      "kind": "question",
      "title": "为什么是 Kelvin 波？",
      "body": "Holton 选了赤道 Kelvin 波，但 Plumb (1977) 用 Rossby 波也能解释。两者在解释 QBO 下传相速度上谁更优？",
      "tags": ["qbo", "kelvin-wave"],
      "createdAt": "2026-08-30",
      "links": [
        { "label": "Plumb 1977", "url": "https://doi.org/10.1175/1520-0469(1977)034<1840>2.0.CO;2" }
      ]
    },
    {
      "id": "a002",
      "anchor": {
        "type": "text",
        "value": "vertical advection of the mean zonal wind",
        "occurrence": 1
      },
      "kind": "insight",
      "title": "动量下沉",
      "body": "这里用 ω·∂u/∂p 表征了波动对平均流的动量输送，是个非常干净的处理。",
      "tags": ["momentum-deposition"],
      "createdAt": "2026-09-02",
      "links": []
    }
  ]
}
```

## 附录 B：CSS 类一览

> 下面列的是**当前真实存在**的类（可在 `src/assets/css/` 与
> `src/assets/js/paper-reader/` 里查到）。移动端 Tab Bar 三件套
> （`.paper-tabs` / `.tab` / `.tab-panel`）在 D54 场次已作为死类删除，
> **不在此列** —— 它是 §7 的规划，不是现状。

| 类 | 作用 |
|---|---|
| `.annot-pane` | 整个侧栏容器 |
| `.annot-pane__head` | 标题 + 搜索 |
| `.annot-pane__filter` | 侧栏内的筛选条容器 |
| `.annot-filter` | 类型筛选 chip（带 `data-kind`） |
| `.annot-list` | 列表容器 |
| `.annot-item-wrap` | 单条批注的外层包裹 |
| `.annot-card` | **单条批注**（`annotations.js` 生成，带 `data-kind`） |
| `.annot-card--{kind}` | 单条批注的 kind 变体 |
| `.annot-card__head` | 批注卡头部（内层 `<button>`；kind 边条在这里） |
| `.annot-card__body` | 批注卡展开区 |
| `.annot-item` | 批注卡头部的**内层按钮**（JS 契约类，外观在 `.annot-card__head` 上） |
| `.annot-item.is-active` | 当前选中态 |
| `.annot-meta` / `.annot-title` / `.annot-body` / `.annot-links` | 批注内部元素 |
| `.annot-kind` / `.annot-kind--{kind}` | 类型标签 |
| `.annot-filters` / `.annot-tag` / `.annot-tags` | 筛选与标签 |
| `.annotating` | 正文中被批注的段（背景高亮） |
| `.annot-inline` | 移动端段落下方内联手风琴 |
| `.paper-anchor` / `.paper-anchor--{kind}` | 正文里的段落锚点（class 驱动） |

---

## 附录 C：v1.1 kind→color 增补条款（Stage 1 · 2026-09-24）—— **历史提案，从未落地**

> ⚠️ **本附录是历史记录，不是当前契约**。2026-09-24 提出的 v1.1 配色条款**从未落地**，
> 后来被 `src/assets/css/components/_paper.css` 的 kind 调色板整体取代。
> 当前契约见 **§3.4**（只列 token 名，指向真源）。
>
> 下面 C.1 / C.2 / C.3 原样保留提案内容，供追溯「历史上走过这一段」；
> 凡与现状不一致之处，均已在原文之后就地标注（标注日期 2026-10-23）。

### C.1 历史提案的 kind→token 表（未落地）

| kind | light token | light 实测 HEX | dark token | dark 实测 HEX | 语义 | 图标 |
|---|---|---|---|---|---|---|
| `question` | `--color-brand-400` | `#3a86ff` | `--color-brand-400` | `#4d97ff` | 疑问 / 待查 | help-circle |
| `insight` | `--color-accent-400` | `#ff7e33` | `--color-accent-400` | `#ff8e4d` | 心得 / 灵感 | lightbulb |
| `critique` | `--color-warning` | `#d99a2b` | `--color-warning` | `#e5b257` | 方法学质疑 | alert-triangle |
| `figure` | `--color-brand-300` | `#66a4ff` | `--color-brand-300` | `#24528f`（dark 提亮后） | 配合插图说明 | image |
| `link` | `--color-sage-500` | `#6f9e6f` | `--color-sage-500` | `#a4c8a4`（dark 提亮后） | 外链补充阅读 | link |
| `typo` | `--color-danger` | `#c84a3a` | `--color-danger` | `#e06757`（dark 提亮后） | 待勘误 | edit-3 |

> 实测 HEX 取自 `src/assets/css/tokens.css` 的 `:root` 块 + `@media (prefers-color-scheme: dark)` 块。
> dark 模式未单独覆盖 brand-300/sage-500/danger 时，会自动跟随 tokens.css 中已有的 `body` 文本提亮规则；
> 因次级色阶在 dark 下仍可用 `color-mix` 与 bg-subtle 拉开对比。
>
> **与现状的差异（2026-10-23 实测订正）**：上表**六行里有四行**与当前实现不同 ——
> 现在的 `critique` 是砖红（danger 系）、`figure` 是鼠尾草绿（sage 系）、`link` 是中性灰
> （neutral 系，**刻意**的：外链是结构性引用、不是观点，不该抢注意力）、`typo` 是琥珀
> （warning 系）＋**虚线**边条（颜色之外的第二条冗余通道）。
> 表里的「图标」列写的是 Feather 图标名，但站上从来没有图标字体 —— 现在每 kind 一枚内联 SVG，
> 路径在 `annotations.js` 的 `KIND_ICONS` 里。
>
> **本提案既没有落地，也没有留在待拍板清单里**（2026-10-23 实测：中央台账里查无此项）——
> 它的**存在理由已经消失**，理由见 C.2 的订正。**若日后要让 `figure` 脱离 sage 族**，
> 唯一的改动点是 `src/assets/css/components/_paper.css` 里的 `--kind-figure-edge` 与
> `--kind-figure-ink` 两条 token（其余文件一律消费 `var(--kind-*)`，改这两处即全站生效）。
> 本条**不代拍**，只是把改动点写清楚。

### C.2 为何 `figure` 由 sage-700 改为 brand-300（**前提已失效**）

- v1.0 用 sage-700 在视觉上和 `link`（sage-500）太接近，肉眼分辨困难；
- figure 的语义是「配合插图说明」，用浅一档的流场蓝（brand-300）能与 question
  （brand-400）拉开层次，又不脱离「蓝色族」；
- 旧 `.annot-item[data-kind="figure"]` 的 sage-700 规则保留兼容，但 **v1.1+ 新组件**
  必须按本附录用 brand-300。

> **订正（2026-10-23）**：本条提案的**存在理由已经消失** —— 它要解决的是
> 「figure 与 link 区分度不足」，而现在的 `link` 是**中性灰**（不再与 figure 同族），
> 那个问题早就不存在了。取而代之的是一次按**语义族**重做的整体分配
> （配图 = 鼠尾草绿 = 数据/观测），理由写在 `_paper.css` 的 kind 调色板注释里。
> 换句话说：不是「figure 还没改成 brand-300」，而是**这一版提案整体已被另一套方案取代**。

### C.3 typo 的引入（**落地了，但配色不是提案里那一套**）

- 旧 schema 没有 typo，作者在长期精读中会遇到「原文编辑错漏」想标注但不归入 critique；
- 用 danger 红与所有其他 kind（蓝/橙/黄/绿）形成最大色距；
- 仅用于「我读了觉得是错字」这种编辑级批注，不替代 critique（critique 仍指方法学质疑）。

> **订正（2026-10-23）**：typo 这一类**落地了**，但**不是按本条提案的配色** ——
> 现在 typo 是**琥珀（warning 系）+ 虚线边条**，而 danger 红归了 `critique`。
> 理由写在 `_paper.css` 的注释里：暖色族里琥珀与橙/红只差 15~17°，
> 所以给勘误补一条**虚线**作为颜色之外的第二条冗余通道（色觉障碍与灰度打印下也能分辨）。
> 本条「用 danger 红与其他 kind 形成最大色距」的推理，在 danger 红归 critique 之后已不成立。

---

## 附录 D：Implementation Notes（Stage 1 · paper-reader.js 取舍记录）

> 2026-09-24 落地实现时记录的取舍。Stage 2 接入如需修改，请先看这里。

### D.1 IntersectionObserver vs scroll 事件

- **采用** IntersectionObserver（`rootMargin: "-20% 0px -60% 0px"`），让「当前段」是
  视口上部 20%–40% 区域内的最近命中。
- 拒绝 scroll 事件的原因：scroll 触发频率太高，配合 `requestAnimationFrame` 仍会在低端
  设备上掉帧；且「视口中部 = 当前段」的语义在 scroll handler 里很难精确表达。
- 副作用：滚动时**只**给当前段对应的批注卡加 `.is-active`，不滚侧栏到该卡（避免循环抖动）。
  只有 IntersectionObserver 命中段被点击时才滚侧栏。

### D.2 sticky vs absolute 侧栏定位

- **采用** `position: sticky; top: 88px`（顶部 topbar 64px + 24px 间距）。
- 拒绝 `position: absolute` 或 fixed：absolute 不能跟随正文滚动，fixed 又会脱离布局流；
  sticky 在桌面端是最佳折中，长正文+长侧栏时用户既能看到段又能看到卡的对应关系。
- 副作用：侧栏最大高度 `calc(100vh - 104px)`，超出滚动；不阻挡左侧正文 hover 事件。

### D.3 figure 用 brand-300 而非 sage-700

见 **附录 C.2**。

> **订正（2026-10-23）**：本条记录的是 v1.1 提案里的一个**决定**，而该提案**从未落地**，
> 也已被后来的 kind 调色板整体取代 —— 现在 `figure` 是鼠尾草绿（sage 系）。
> 详见附录 C 的历史声明与 C.2 的订正。

### D.4 闪烁动画时长（1.4s）

- 用 `@keyframes paper-reader-flash`（背景透明 → `--bg-subtle` → 透明），
  持续 1400ms，与 `var(--dur-slow)`（320ms）的 4× 叠加，让用户在滚动后还能
  看到「就是这条」的余晖。
- `prefers-reduced-motion: reduce` 直接关闭动画。
- 闪烁**同时**作用于段落和批注卡（双向联动都触发），避免「点了但没看到反馈」的疑惑。

### D.5 段落反向触发：cursor: pointer + role=button

- 给所有 `paper-anchor` 段（h2 / p / li）加 `cursor: pointer` + `role="button"` + `tabindex="0"`，
  让段**视觉上**也是「可点击」的按钮。
- 副作用：屏幕阅读器会把段落读成「按钮」而非普通段落。Stage 2 接入前请确认作者
  是否介意——若介意可改为「只在 hover 时 cursor: pointer，role 保持 link」。

### D.6 过滤（filter）实时性

- 输入框过滤只对当前可见批注做 `hidden` 切换，**不**重新排序；这样过滤时 URL 直链
  （`?a=xxx`）和 IntersectionObserver 的 `.is-active` 状态不会被打断。
- 过滤计数显示「N / M」格式（M 是总数）。

### D.7 直链 ?a=id 触发时机

- 在 `initPaperReader` 内部 `fetch + render` 完成后，用 `setTimeout(..., 60)` 推迟到
  浏览器绘制完一帧后再触发对应卡的 `click()`。直接同步触发会被滚动动画打断。

### D.8 已知限制

- 段落 `id` 必须是显式 HTML id（markdown-it 默认不解析 `{#id}`）；paper.md 已经手工
  改写为 `<h2 id="p-XXX">` 或 `<a id="p-XXX"></a>` 形式。Stage 2 接入新论文时必须
  沿用这一约定。
- `text` 类型 anchor（按文本第 N 次匹配）目前用 TreeWalker 实现，单篇 30k 字以内性能
  OK；超过此量级应改用预编译索引。
- 移动端（≤768px）侧栏退化为单栏折叠态，**未**实现 Tab Bar 切换（论文 v1.0 章节 §7
  描述的方案）。⚠️ 本条原文写的是「用 `<details>` 折叠代替」，**与实际不符**：Stage 1
  既没有 `<details>` 也没有 Tab Bar —— 目录在 ≤1024px 是被直接 `display: none` 掉的。
  实际情况与现落地见 **D.9**。

### D.9 ≤1024px 单栏与目录可达（2026-10-20 10:30–11:00 场次落地）

- **单栏**：`§2.3` 要「≤1024px 单栏堆叠」，但 `.paper-reader-wrap:not(:has(.annot-pane))`
  那条的特异度是 (0,2,0)，高于媒体查询里 `.paper-reader-wrap` 的 (0,1,0)，而**特异度压过
  来源顺序** ⇒ 那条媒体查询一直压不住它，≤1024px 始终是两栏。修法：媒体查询里把
  `.paper-reader-wrap` 与 `.paper-reader-wrap:not(:has(.annot-pane))` **两个选择器都写上**。
- **连锁条件**：目录在 ≤1024px 曾是 `display: none`（不生成网格项），正文因此掉进第一列
  `minmax(200px, 1fr)`。**两个条件必须一起看**，只修其一都不够。
  修完实测正文宽度 360 → 328px、390 → 358px、640 → 589px、768 → 707px、820 → 754px、
  1024 → 942px（原来一律 200~203px），页面总高 −37%。
- **目录**：≤1024px 从 `display: none` 改成正文上方的**静态块**（`position: static`、
  链接两列、触控高 ≥ 24px）。选静态块而不是 `<details>`：本篇目录 6 条，折叠省不下多少
  高度，而 `<details>` 方案要动 `toc.js` 的 DOM 结构（桌面侧栏得跟着变），代价大于收益。
  ⚠️ 这与 §2.3 原文的「`<details>` 折叠」不一致 —— **以本条为准**。
- **顺带记一条**：§9.1 写的批注写作工作流**实际不生效** —— `hasAnnotations` 全仓未定义、
  `annotations.json` 全仓不存在 ⇒ 524 行批注代码永不加载。见 DEFECT-BACKLOG 的 D12。

