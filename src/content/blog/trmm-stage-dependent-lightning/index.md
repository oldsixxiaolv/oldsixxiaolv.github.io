---
title: "Reading a stage-dependent lightning-structure relationship in TRMM thunderstorms"
date: 2026-10-23
# description is the SEO meta description of this article: a rewrite of the title
# that says what the article is about, without the headline wording.
# excerpt is a different job - it is the one-line summary shown on the /blog/ card.
# Never let one stand in for the other: with only excerpt, the page falls back to
# the site-wide description and every article ends up with the same snippet.
description: "Pooling snapshot storms hides a stage-dependent lightning-structure relationship in TRMM thunderstorms; a K-means life-cycle classification recovers it."
excerpt: "Pooling snapshot storms hides the lightning-structure relationship: a K-means stage classification over 16 years of TRMM observations recovers a correlation that stays stable and a slope that does not."
readingTime: 6
tags: ["lightning", "TRMM", "radar"]
---

## The problem with a snapshot

TRMM gives you radar and lightning *at the same time*, which is the reason the
platform is still worth mining two decades after launch. But it is an
instantaneous snapshot: every overpass sees one frozen moment of a life cycle
that actually takes tens of minutes, so the satellite cannot watch a storm
evolve.

That matters for statistics. Pooling every snapshot into a single
lightning-intensity relationship mixes three physically different states of the
same phenomenon and averages them into one curve. The pooled curve fits no
storm - it is an average of regimes, and it will look perfectly reasonable
while describing none of them.

## How the stage is recovered

The approach is a machine-learning K-means clustering on radar echo structure,
applied to 16 years of TRMM observations over tropical Africa - the global
hotspot for lightning and thunderstorms. The clustering first separates storms
by echo structure, and the compact storms are then grouped into three clusters
that reproduce the known life-cycle sequence. They are therefore named
Pre-Mature, Mature and Post-Mature.

Compact storms account for 81% of the total thunderstorm population, so the
stage assignment is not a corner case applied to a handful of systems: it is
the classification of the bulk of the sample.

## What the stage changes

Pooled across stages, a lightning-intensity relationship looks like a single
trend. Resolved by stage, the *correlation coefficients turn out to be similar*
while the *linear fits differ*. Same correlation, different slope. That is the
signature of stage-specific electrification mechanisms rather than one
universal relation, and it is why the stage assignment is what makes the later
analysis meaningful rather than decorative.

Two findings carry the most consequence beyond this paper:

- **Pre-Mature storms are smaller but electrically denser.** Less horizontal
  scale, yet higher lightning density per unit area, despite comparable
  lightning flash rates.
- **Post-Mature storms are the reverse.** Larger scale, lower lightning
  density.

Mature-stage storms are, unsurprisingly, the strongest. So the trade-off is not
simply "more convection means more lightning" - it is *how* convective
intensity and horizontal scale trade off at different points of the life
cycle, and how the electrification responds to that trade-off.

## Why it matters downstream

Lightning parameterisation schemes are usually written against stage-agnostic
relationships. If the relationship is genuinely stage-dependent, a single set
of coefficients will fit well in aggregate and badly in any individual storm.
The pooled fit is not merely less informative than the stage-resolved fit; it
is a fit that will behave badly in exactly the situations a parameterisation
scheme is supposed to help with.

The same reasoning applies to snapshot observations from other low-Earth-orbit
precipitation radars. Once a storm can be located in its life cycle from its
echo structure alone, an instantaneous observation stops being a limitation and
becomes a stage label.

## The data and the code

- **Paper** - *New Insights From TRMM Legacy: Stage-Dependent Relationships
  Between Lightning and Convective Structure in Thunderstorms Over Tropical
  Africa*, Journal of Geophysical Research: Atmospheres 131(11), e2026JD046836
  (2026), DOI `10.1029/2026JD046836`. The
  [paper page](../../papers/trmm-thunderstorm-stages/) on this site carries the
  abstract, the keywords and the data-availability section.
- **Dataset** - *Thunderstorms stage identification*, Zenodo v2.0, DOI
  `10.5281/zenodo.18041880` (concept DOI `10.5281/zenodo.16662143` for all
  versions), licensed CC BY 4.0.
- **Code** - the analysis pipeline is on GitHub:
  <https://github.com/oldsixxiaolv/Manuscript_Lvyh>.
- **Author** - affiliations, skills and contact details are on the
  [profile page](../../about/).
