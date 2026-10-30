const { getSlugFromData } = require("../../eleventy-helpers.cjs");
const { draftGuards } = require("../../eleventy-draft.cjs");

module.exports = {
  layout: "layouts/detail.njk",
  // ⚠️ 草稿抑制：Eleventy 3 **完全不认识 `draft`**（上游源码零命中）⇒
  //   写 `draft: true` 原本会被照常发布（页面 + 正文进产物 + sitemap + feed + 列表页）。
  //   这里接上上游推荐的两件套：permalink 侧不写盘 ＋ 集合侧不进任何集合。
  //   ⚠️ 只接一件是半拉子抑制（详见 src/eleventy-draft.cjs 文件头）。
  // ⚠️ **路径模板必须与 `permalink:` 同一行**：信息架构门禁（IAC1 / IAC13）
  //   用正则从本文件里提取 permalink 的**家族前缀**（`/blog/`），而那条正则
  //   里的 `[^\n]*?` 不跨行 ⇒ 一旦折行，前缀就提不出来 ⇒ IAC 会把
  //   「/blog/{slug}/ 解析不到真实的集合与 layout」判红（本轮实测踩到）。
  permalink: (data) => draftGuards.permalink(`/blog/${getSlugFromData(data)}/`, data),
  tags: ["blog"],
  // 这一族页面在结构化数据里**自称什么作品**（2026-10-24；缺陷清单 D94）。
  // 论文页用 front matter 的 `pubKey` 指向 site.js 里那一条论文，博客这边
  // 没有可指向的外部登记条目，于是用**集合级**的裸键标出实体类型。
  //   · 裸键（不是 site.*）—— 模板读的就是裸键，判据也按数据层的三条路径回源
  //     （front matter 顶层 / eleventyComputed / 目录数据文件）。
  //   · 放**目录数据文件**而不是文章 front matter —— 写作契约（front matter
  //     字段表）不因此变动：这一族页面的实体类型是**站点的事**，不是每篇文章
  //     要各写一遍的事；写进 front matter 只会让作者多一个必填字段。
  //   · 值是 schema.org 的实体类型名，与论文页的 ScholarlyArticle 同一套词表。
  structuredType: "BlogPosting",
  eleventyComputed: {
    // 草稿不进任何集合（⇒ sitemap / feed / 列表页都看不到它）。
    eleventyExcludeFromCollections: (data) =>
      draftGuards.excludeFromCollections(data),
    prev: (data) => {
      const all = (data.collections && data.collections.blog) || [];
      const idx = all.findIndex((it) => (it.url || "") === (data.page.url || ""));
      return idx > 0 ? all[idx - 1] : null;
    },
    next: (data) => {
      const all = (data.collections && data.collections.blog) || [];
      const idx = all.findIndex((it) => (it.url || "") === (data.page.url || ""));
      return idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null;
    },
  },
};