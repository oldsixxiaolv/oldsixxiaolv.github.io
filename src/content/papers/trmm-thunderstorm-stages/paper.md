---
pubKey: trmm-stages
date: 2026-06-01
description: "Stage-dependent relationships between lightning and radar echo structure in TRMM thunderstorms over tropical Africa."
cover: "/assets/img/publications/trmm-fig10.jpg"
coverWidth: 1400
coverHeight: 745
# 分享图的 alt **不在这里写**。
# 封面图与它的 alt 都在 site.js 的 publications[].figure 里（figure.src /
# figure.alt），base.njk 从那里取，页面上 <img alt> / og:image:alt /
# twitter:image:alt 三处同源，不会各说各话。
# 此前这里另写了一份 coverAlt，写的是"复合雷达回波剖面 / echo coverage
# percentage"——与图不符：图里是各阶段的结构分布小提琴图（按 20/30/40 dBZ
# 分层）与闪电率、40 dBZ 闪密度的累积分布曲线。图只有一张，alt 却有两套。
---

## What this paper does

TRMM gives you radar and lightning *at the same time*, which is the reason the
platform is still worth mining two decades after launch. But it is an
instantaneous snapshot, so it cannot show a storm evolving — every pass sees
one frozen moment of a life cycle that actually takes tens of minutes.

This paper builds the missing piece: a way to say *where in its life cycle a
snapshot storm is*, so that lightning–structure relationships can be asked as
a function of storm stage rather than pooled across all of them.

## How the stage classification works

The approach is a machine-learning K-means clustering on radar echo structure,
applied to 16 years of TRMM observations over tropical Africa — the global
hotspot for lightning and thunderstorms. The clustering first separates
storms by echo structure, and the compact storms are then grouped into three
clusters that reproduce the known life-cycle sequence. They are therefore
named Pre-Mature, Mature and Post-Mature.

The key result is that the stage assignment is what makes the later analysis
meaningful. Pooled across stages, a lightning–intensity relationship looks
like a single trend. Resolved by stage, the *correlation coefficients turn
out to be similar* while the *linear fits differ* — which is the signal for
stage-specific electrification mechanisms rather than one universal one.

## Why stage-dependence matters for the field

Two findings are worth pulling out, because they are the ones that carry
consequence beyond this paper:

- **Pre-Mature storms are smaller but electrically denser.** They show less
  horizontal scale yet higher lightning density per unit area, despite
  comparable lightning flash rates.
- **Post-Mature storms are the reverse.** Larger scale, lower lightning
  density.

Mature-stage storms are, unsurprisingly, the strongest. The trade-off the
paper isolates is therefore not simply "more convection means more lightning"
— it is *how* convection intensity and horizontal scale trade off at
different points of the life cycle, and how the electrification responds.

That matters downstream: lightning parameterisation schemes are usually
written against stage-agnostic relationships. If the relationship is
genuinely stage-dependent, a single set of coefficients will fit well in
aggregate and badly in any individual storm.

## The data and the code

Everything needed to reproduce the analysis is published and separately
citable — the dataset, the code, and a packaged capsule that runs the
analysis with its environment intact. The section below lists each with its
DOI, version and licence. The paper's own reference list cites the dataset
entry, so the DOI resolves to the same record from either direction.
