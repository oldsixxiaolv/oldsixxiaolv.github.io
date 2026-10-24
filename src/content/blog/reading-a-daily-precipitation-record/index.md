---
title: "How to read a 66-year daily precipitation record"
date: 2026-10-23
# description is the SEO meta description of this article: a rewrite of the title
# that says what the article is about, without the headline wording.
# excerpt is a different job - it is the one-line summary shown on the /blog/ card.
# Never let one stand in for the other: with only excerpt, the page falls back to
# the site-wide description and every article ends up with the same snippet.
description: "A daily precipitation record answers a different question depending on the index, and the threshold and the window you choose decide what a 66-year series appears to show."
excerpt: "Wet days, a per-gridpoint extreme-day threshold and annual maxima answer three different questions, and two of the choices you make - the threshold and the window - decide what you find."
readingTime: 6
tags: ["precipitation", "methods", "climate"]
---

## Three indices, three questions

A daily gridded record answers a different question depending on which index
you pick, and the indices are not interchangeable:

- **How much precipitation does the region get?** The regional mean of the
  annual total - 533.6 mm per year over 1960-2025 for the box discussed below.
- **What fraction of it arrives on extreme days?** The R95p share: annual
  precipitation on days above a threshold, as a percentage of the annual total.
- **How wet is the worst day of the year?** Rx1day, averaged over the region.

Reporting one of them as "the precipitation trend" is a category error, and the
three can disagree, as they do here.

## The threshold is part of the definition

One number cannot label "extreme" the same way in every part of a box that
spans 18 degrees of latitude. A fixed threshold in mm/day means something
different in the drier northern part of the region than in the wetter southern
part, so a single cutoff would flag most days in one place and almost none in
another - and the regional average of those amounts would not be an average of
like with like.

The alternative used here is a percentile computed **per gridpoint**: each
gridpoint's own 95th percentile of its wet-day amounts over 1960-2025, where a
wet day is a day with at least 1 mm of precipitation. "Extreme" then means
"unusual for this place", and the regional mean of the resulting amounts
compares like with like.

The cost is that the threshold is no longer a number a reader can quote
("extreme" here is not "above 10 mm/day"), and the metric is defined relative
to the base period. Both are worth writing down whenever the numbers are
quoted.

## A share and an amount are not the same evidence

The share (R95p as a percentage of the annual total) and the amount (R95p in
mm) answer different questions, and they can move in opposite directions: if
the annual total grows faster than the extreme-day precipitation, the amount
rises while the share falls.

Here they moved the same way over the recent window - the share rose from
24.55% in the 1960s to 30.67% in 2020-2025, and the amount from 134.6 mm to
195.3 mm - which is a stronger statement than either one alone. A rising share
accompanied by a flat amount would point at a drying background; a rising share
with a rising amount does not.

## Rx1day is an average of maxima, not a maximum

Rx1day here is the regional average of **each gridpoint's** annual maximum
1-day precipitation. It is not the wettest day the region ever saw, and it is
not the maximum of the regional daily mean.

Averaging gridpoint maxima has a clear purpose: it describes a typical
gridpoint's worst day, so the value does not depend on where a single extreme
cell happened to sit. The price is that it cannot be read as an event - there
is no day in the record that produced 63.91 mm/day everywhere at once.

## The window decides the conclusion

Over 1960-2025 the extreme-day share has a statistically significant trend
(least-squares slope 0.556 percentage points per decade, Mann-Kendall
p = 0.0401). Over 1960-2019 the same test on the same data gives
p = 0.6099 - no detectable trend.

Same data, same test, opposite answers. When the signal is concentrated in a
handful of years, the start and end dates do as much work as the statistic,
and six years is short enough that a genuine shift in the mean is hard to
separate from an unlucky run. The honest phrasing is therefore about the
difference between two periods, not about a trend: the last six years look
different from the previous sixty, and the record as a whole is not yet long
enough to say whether that difference persists.

## Rounding is part of the published record

The yearly values are published to three decimals, and every statistic is
computed on the full-precision series before rounding. Rounding still
produces ties that do not exist in the data: Rx1day in 1961 and 2004 are both
published as 52.605 mm/day, and in the underlying series 1961 is the smaller
of the two. Anything that ranks, bins or matches years needs the
full-precision values, not the published copy.

## Related

- [North China's extreme-precipitation share has shifted since
  2020](../north-china-extreme-precipitation/) - what these indices give for
  this region.
- [North China precipitation, 1960-2025](../../#north-china-precip) - the chart
  on the home page.
- Dataset: CHM_PRE V2.1.1, data DOI `10.5281/zenodo.14632156`.
