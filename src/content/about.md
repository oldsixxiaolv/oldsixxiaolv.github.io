---
title: About
updated: 2026-10-16
---

<!--
  ⚠️ 本文件由 eleventy.config.js 里的 markdown-it 直接渲染，不过 Nunjucks
     （aboutHtml 走 md.render），所以模板语法在这里无效，写 {# #} 会被当正文显示。
  编写约定：
     ① 身份词（PhD Student / 博士生）与姓名一律不写死，由 about.njk 从 site.js
        渲染；
     ② 事实性清单（关键词 / 单位 / 技能 / 论文 / 链接）全部交给模板，两处不打架；
     ③ 这里只留"为什么有��站"和"怎么找我"这类可核实的话。
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
- **Code** — the stage-identification tool for thunderstorms is archived on
  [Zenodo](https://doi.org/10.5281/zenodo.18041880) so it gets a DOI and stays
  citable; the analysis pipeline for the TRMM work is on GitHub.
- **Technical notes** — the writing that exists so far (Python for atmospheric
  science, xarray, Fortran, WRF) is on
  [CSDN](https://blog.csdn.net/lvyihang200411).

## Corrections

If something here is wrong, open an issue or send an email — the address is on
the profile page. Direct correction beats polite disagreement on social media.
