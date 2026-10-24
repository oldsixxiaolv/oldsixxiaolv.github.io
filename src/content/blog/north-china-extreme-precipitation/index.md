---
title: "North China's extreme-precipitation share has shifted since 2020"
date: 2026-10-23
# description is the SEO meta description of this article: a rewrite of the title
# that says what the article is about, without the headline wording.
# excerpt is a different job - it is the one-line summary shown on the /blog/ card.
# Never let one stand in for the other: with only excerpt, the page falls back to
# the site-wide description and every article ends up with the same snippet.
description: "Since 2020 a larger share of North China's annual precipitation has fallen on extreme days - a shift the 1960-2019 record alone cannot detect."
excerpt: "A 66-year daily record over 32-50 N, 110-120 E shows the share of annual precipitation falling on extreme days jumping in the last six years, while the same signal is undetectable in 1960-2019 alone."
readingTime: 5
tags: ["precipitation", "North China", "extreme events"]
---

## What the record shows

Over 1960-2025 the region averaged 533.6 mm of precipitation a year, and about
a quarter of it - 25.4% on average - fell on days that were extreme for the
gridpoint that received them. That share barely moved for six decades: 24.55%
in the 1960s, 24.69% in the 1970s, 24.35% in the 1980s, 25.48% in the 1990s,
24.67% in the 2000s, 25.47% in the 2010s. Then it moved: 30.67% in 2020-2025.

Two years break everything before them. 2021 reached 35.4% of the annual total
on extreme days - the highest value anywhere in the 66-year series - and 2024
reached 33.2%. Both of them exceed the largest share in the whole 1960-2019
record, which was 32.5% in 2018.

The significance test is sharper than "it went up". Across the full record the
extreme-day share rises by 0.556 percentage points per decade, with a
Mann-Kendall p-value of 0.0401. Restricted to 1960-2019, the same test gives
p = 0.6099: no detectable trend at all. The signal is not a slow warming of
the whole record, it is concentrated in the six most recent years.

The wettest-day index tells a milder version of the same story. Rx1day averaged
63.91 mm/day in 2020-2025, against 52.42-55.81 mm/day in every earlier decade,
but its full-record trend of +0.768 mm/day per decade does not reach
significance (Mann-Kendall p = 0.1425), and 1960-2019 alone gives p = 0.9086.
So the concentration signal is stronger than the intensity signal, and only
the first of them survives a significance test.

In absolute terms the precipitation falling on extreme days rose from 134.6 mm
in the 1960s to 195.3 mm in 2020-2025. The share and the amount moved the same
way here, which is worth stating explicitly, because a share on its own can
move for reasons that have nothing to do with extremes (see
[How to read a 66-year daily precipitation
record](../reading-a-daily-precipitation-record/)).

## Where the numbers come from

- **Dataset** - CHM_PRE V2.1.1: daily precipitation on a 0.1-degree grid for
  1960-2025, in mm/day, by Jinlong Hu, Chiyuan Miao and Qi Zhang (Beijing
  Normal University). Data DOI `10.5281/zenodo.14632156`. Dataset paper:
  *An upgraded high-precision gridded precipitation dataset for the Chinese
  mainland considering spatial autocorrelation and covariates*, Earth System
  Science Data 17(8), 3987-4004 (2025), DOI `10.5194/essd-17-3987-2025`.
- **Region** - the box 32-50 N, 110-120 E, with 13,896 land gridpoints inside
  it. The dataset's own land mask already excludes Mongolia and the sea, so
  the area is mainland China only.
- **Weighting** - area-weighted by cos(latitude), so a degree of longitude near
  40 N does not carry the same weight as one near 30 N.
- **Extreme day** - a wet day (a day with at least 1 mm of precipitation) above
  that gridpoint's own 95th percentile of its wet-day amounts over 1960-2025.
- **R95p (panel A)** - annual precipitation on those days, averaged over the
  region, shown as a share of the annual total.
- **Rx1day (panel B)** - the regional average of each gridpoint's annual
  maximum 1-day precipitation.
- **Trends** - least-squares slope per decade, with significance from the
  Mann-Kendall test on the annual values.

The same two panels are drawn on the [home page](../../#north-china-precip),
with the yearly series, the decadal means and a keyboard-driven year readout.

## Two cautions before quoting any of this

**The window decides the conclusion.** The trend is significant over
1960-2025 and absent over 1960-2019. Six years out of 66 carry the whole
signal, so the defensible statement is "the last six years look different from
the previous sixty", not "the region is getting wetter". Six years is also
short enough that a shift in the mean is hard to separate from a run of bad
luck.

**The published numbers are rounded.** The yearly values behind the panels are
the public copy of a full-precision series, rounded to three decimals, while
every statistic above was computed on the full-precision series. Rounding also
creates ties that do not exist in the data: Rx1day in 1961 and 2004 are both
published as 52.605 mm/day, and in the underlying series 1961 is the smaller
of the two. Ranking or binning years needs the full-precision values.

## Related

- [How to read a 66-year daily precipitation
  record](../reading-a-daily-precipitation-record/) - what each index measures,
  and where it stops being meaningful.
- [North China precipitation, 1960-2025](../../#north-china-precip) - the chart
  on the home page, with the yearly series behind these numbers.
- CHM_PRE data DOI `10.5281/zenodo.14632156`; dataset paper DOI
  `10.5194/essd-17-3987-2025`.
