---
title: About
updated: 2026-10-16
---

<!--
  ⚠️ 本文件由 eleventy.config.js 里的 markdown-it 直接渲染，不过 Nunjucks
     （aboutHtml 走 md.render），所以 Nunjucks 语法在这里无效，写 {# #} 会被当正文显示。
     但"同一事实两份副本"这个病不因为不过模板就消失：可核实事实（Zenodo 记录地址等）
     若在这里写死字面量，它就是第二份副本 ⇒ 改一处忘另一处，页面说的与真源就漂了。
     做法：用**构建期占位符**（形如双花括号包住一个占位符名），由 eleventy.config.js
     的 aboutHtml 渲染处在 md.render 之前替换成 src/_data/site.js 里的真值。
     可用占位符见 eleventy.config.js 里 ABOUT_PLACEHOLDERS。
     ⚠️ 占位符取不到真值时**原样留下**（让页面上露出一个显眼的错，而不是悄悄渲染成空）。
  编写约定：
     ① 身份词（PhD Student / 博士生）与姓名一律不写死，由 about.njk 从 site.js
        渲染；
     ② 事实性清单（关键词 / 单位 / 技能 / 论文 / 链接）全部交给模板，两处不打架；
     ③ 这里只留"为什么有本站"和"怎么找我"这类可核实的话。
  上一版这一整节写的是东亚季风 / QBO / 平流层-对流层耦合的人设，并且断言
  "博士：北京，中国科学院大气物理研究所"——与 site.js 的 affiliations（兰大 →
  现中科院大气所）直接冲突。学术主页上自相矛盾的履历比留空糟得多，所以整段清掉。
-->

## About this site

This is a plain static site — [Eleventy](https://www.11ty.dev/), Markdown and
JSON, no front-end framework and no tracking. Source lives in
[github.com/oldsixxiaolv/oldsixxiaolv.github.io](https://github.com/oldsixxiaolv/oldsixxiaolv.github.io).

Everything on the profile page above is rendered from a single data file
(`src/_data/site.js`). If a number is not verifiable it is left out entirely
rather than shown as zero or as a placeholder — there is deliberately no
citation count or h-index on this site yet.

## Where to find the work

- **Papers** — the selected output section links to the publisher and the DOI.
- **Data** — the stage-identification dataset for thunderstorms is archived on
  [Zenodo]({{DATASET_URL}}) so it gets a DOI and stays citable; the analysis
  code for the TRMM work is on GitHub.
- **Technical notes** — the writing that exists so far (Python for atmospheric
  science, xarray, Fortran, WRF) is on
  [CSDN](https://blog.csdn.net/lvyihang200411).

## Corrections

If something here is wrong, open an issue or send an email — the address is on
the profile page. Direct correction beats polite disagreement on social media.
