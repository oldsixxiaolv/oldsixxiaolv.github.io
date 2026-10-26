---
pubKey: trmm-stages
date: 2026-06-01
description: "Stage-dependent relationships between lightning and radar echo structure in TRMM thunderstorms over tropical Africa."
# summary：给列表页卡片用的一句话摘要，**与上面的 description 不是一回事**。
# description 是 SEO 用的 meta description，写的其实就是标题的改写（"Stage-dependent
# relationships between…"），所以它一旦出现在标题正下方就是**复读标题**——读者看到
# 的是同一句话说两遍。summary 反过来：只写标题里**没有**的信息（怎么做的、样本多大、
# 结论是什么），一句话让人不点进去也知道这篇在做什么。
# 内容取自本文自己的 "What this paper does" / "How the stage classification works"
# 两节，不是从别处借的。摘要放在论文页的 front matter 而不是 site.js，是因为它
# 描述的是**这篇论文**、跟着正文一起改才不会走样；列表页靠 pubKey 关联取它。
summary: "A K-means classifier on radar echo structure splits 16 years of TRMM storms into Pre-Mature, Mature and Post-Mature; the lightning-intensity relation turns out to be stage-specific rather than one pooled trend."
# 封面图的 **src / 宽 / 高 / alt 都不在这里写**。
# 唯一真源是 site.js 的 publications[].figure（figure.src / figure.width /
# figure.height / figure.alt）；base.njk 与 paper.njk 都从那里取，
# 页面上的 <img> / og:image / twitter:image / JSON-LD image 四个出口同源。
#
# 此前这里另存过一份 cover / coverWidth / coverHeight：正文 <img> 读
# site.js、分享图（og / twitter / JSON-LD）读 front-matter，
# 两边可以各说各的 —— 改了真源则正文图变了而分享卡还是旧图（反之亦然）。
# D30 起这份副本删除：一张图只留一处真源。
#
# 此前这里另写了一份 coverAlt，写的是"复合雷达回波剖面 / echo coverage
# percentage"——与图不符：图里是各阶段的结构分布小提琴图（按 20/30/40 dBZ
# 分层）与闪电率、40 dBZ 闪密度的累积分布曲线。图只有一张，alt 却有两套。
---

<h2 id="p-what-this-paper-does">What this paper does</h2>

<p id="p-trmm-snapshot">
TRMM gives you radar and lightning <em>at the same time</em>, which is the reason the
platform is still worth mining two decades after launch. But it is an
instantaneous snapshot, so it cannot show a storm evolving — every pass sees
one frozen moment of a life cycle that actually takes tens of minutes.
</p>

<p id="p-missing-piece">
This paper builds the missing piece: a way to say <em>where in its life cycle a
snapshot storm is</em>, so that lightning–structure relationships can be asked as
a function of storm stage rather than pooled across all of them.
</p>

<h2 id="p-how-the-stage-classification-works">How the stage classification works</h2>

<p id="p-kmeans-approach">
The approach is a machine-learning K-means clustering on radar echo structure,
applied to 16 years of TRMM observations over tropical Africa — the global
hotspot for lightning and thunderstorms. The clustering first separates
storms by echo structure, and the compact storms are then grouped into three
clusters that reproduce the known life-cycle sequence. They are therefore
named Pre-Mature, Mature and Post-Mature.
</p>

<p id="p-key-result">
The key result is that the stage assignment is what makes the later analysis
meaningful. Pooled across stages, a lightning–intensity relationship looks
like a single trend. Resolved by stage, the <em>correlation coefficients turn
out to be similar</em> while the <em>linear fits differ</em> — which is the signal for
stage-specific electrification mechanisms rather than one universal one.
</p>

<h2 id="p-why-stage-dependence-matters-for-the-field">Why stage-dependence matters for the field</h2>

<p id="p-two-findings">
Two findings are worth pulling out, because they are the ones that carry
consequence beyond this paper:
</p>

- **Pre-Mature storms are smaller but electrically denser.** They show less
  horizontal scale yet higher lightning density per unit area, despite
  comparable lightning flash rates.
- **Post-Mature storms are the reverse.** Larger scale, lower lightning
  density.

<p id="p-mature-strongest">
Mature-stage storms are, unsurprisingly, the strongest. The trade-off the
paper isolates is therefore not simply “more convection means more lightning”
— it is <em>how</em> convection intensity and horizontal scale trade off at
different points of the life cycle, and how the electrification responds.
</p>

<p id="p-parameterisation">
That matters downstream: lightning parameterisation schemes are usually
written against stage-agnostic relationships. If the relationship is
genuinely stage-dependent, a single set of coefficients will fit well in
aggregate and badly in any individual storm.
</p>

<h2 id="p-the-data-and-the-code">The data and the code</h2>

<p id="p-reproducibility">
Everything needed to reproduce the analysis is published and separately
citable — the dataset, the code, and a packaged capsule that runs the
analysis with its environment intact. The section below lists each with its
DOI, version and licence. The paper's own reference list cites the dataset
entry, so the DOI resolves to the same record from either direction.
</p>
