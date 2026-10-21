#!/usr/bin/env python3
"""
WCAG 2.1 contrast ratio checker for MeteoHub design tokens.
Outputs AA / AAA pass/fail for every text-on-background pair the site actually uses.
"""

def hex_to_rgb(h):
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c*2 for c in h)
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def rel_lum(rgb):
    """WCAG relative luminance (sRGB → linear → weighted sum)."""
    def channel(c):
        c /= 255.0
        return c/12.92 if c <= 0.03928 else ((c + 0.055)/1.055) ** 2.4
    r, g, b = rgb
    return 0.2126*channel(r) + 0.7152*channel(g) + 0.0722*channel(b)

def contrast(c1, c2):
    L1, L2 = rel_lum(hex_to_rgb(c1)), rel_lum(hex_to_rgb(c2))
    if L1 < L2: L1, L2 = L2, L1
    return (L1 + 0.05) / (L2 + 0.05)

# Tokens pulled directly from src/assets/css/tokens.css (LIGHT and DARK variants)
T = {
    # LIGHT  (Phase 1.4 retuned · 2026-10-01)
    ("LIGHT", "neutral-900"): "#0f0d0a",
    ("LIGHT", "neutral-700"): "#38332d",
    ("LIGHT", "neutral-600"): "#575049",
    ("LIGHT", "neutral-500"): "#6b665d",   # P1.4 · was #7d776d
    ("LIGHT", "neutral-100"): "#f2efea",   # bg-muted light
    ("LIGHT", "neutral-50"):  "#faf8f5",
    ("LIGHT", "neutral-0"):   "#ffffff",
    ("LIGHT", "brand-500"):   "#1f5ec8",   # P1.4 · was #256ef0
    ("LIGHT", "brand-400"):   "#3a86ff",
    ("LIGHT", "brand-700"):   "#143e93",
    ("LIGHT", "button-primary-bg"): "#1453d8",   # P1.4 · new token (was brand-400 #3a86ff)
    ("LIGHT", "text-on-brand"): "#ffffff",        # hardcoded — never redefined in dark
    ("LIGHT", "accent-50"):   "#fff3eb",
    ("LIGHT", "accent-500"):  "#e85f15",
    ("LIGHT", "accent-600"):  "#b14810",
    # DARK
    ("DARK",  "neutral-900"): "#f5f2ea",
    ("DARK",  "neutral-700"): "#d2cfc6",
    ("DARK",  "neutral-600"): "#a8a498",
    ("DARK",  "neutral-500"): "#928d83",   # P1.4 · was #807c72
    ("DARK",  "neutral-100"): "#1c1a18",   # bg-muted dark (approx)
    ("DARK",  "neutral-50"):  "#161513",
    ("DARK",  "neutral-0"):   "#0f0e0c",
    ("DARK",  "brand-400"):   "#4d97ff",
    ("DARK",  "brand-300"):   "#24528f",
    ("DARK",  "button-primary-bg"): "#2563eb",   # P1.4 · dark-mode button-primary (white text 5.17:1)
    ("DARK",  "text-on-brand"): "#ffffff",        # hardcoded — same in both modes
    ("DARK",  "accent-50"):   "#0e1a35",
    ("DARK",  "accent-500"):  "#ffa874",
    ("DARK",  "accent-600"):  "#cc6020",
    ("DARK",  "accent-400"):  "#ff8e4d",
}

def get(mode, token):
    return T[(mode, token)]

# Pairs to verify: (label, mode, foreground token, background token, font-px, bold?)
PAIRS = [
    # Body text on page background
    ("body / primary text",              "LIGHT", "neutral-900", "neutral-50", 16, False),
    ("body / secondary text",            "LIGHT", "neutral-600", "neutral-50", 16, False),
    ("body / muted text",                "LIGHT", "neutral-500", "neutral-50", 14, False),
    ("link / default",                   "LIGHT", "brand-500",   "neutral-50", 16, False),
    ("link / hover",                     "LIGHT", "brand-700",   "neutral-50", 16, False),
    # Accent usages on the actual site (post-P1.4)
    ("home-intro__label (11px accent)",  "LIGHT", "accent-600",  "neutral-50",  11, True),  # P1.4
    ("accent-600 on accent-50",            "LIGHT", "accent-600","accent-50",   12, True),  # P1.4 · token pair guardrail (A1)
    ("annot-kind--insight (chip v1.1)",  "LIGHT", "accent-600",  "neutral-100", 11, True),  # P1.4 · bg-muted
    ("annot-filter--insight.is-active",  "LIGHT", "accent-600",  "neutral-100", 12, True),  # P1.4
    ("paper-anchor__count (insight)",    "LIGHT", "accent-600",  "neutral-50",  11, True),  # P1.4
    # Dark mode
    ("body / primary text (dark)",       "DARK",  "neutral-900", "neutral-50", 16, False),
    ("body / secondary text (dark)",     "DARK",  "neutral-600", "neutral-50", 16, False),
    ("body / muted text (dark)",         "DARK",  "neutral-500", "neutral-50", 14, False),
    ("link / default (dark)",            "DARK",  "brand-400",   "neutral-50", 16, False),
    ("accent on page (dark)",            "DARK",  "accent-500",  "neutral-50", 11, True),
    ("accent-500 on accent-50 (dark)",   "DARK",  "accent-500",  "accent-50",  12, True),
    # Surface (cards) on page
    ("text on surface card (light)",     "LIGHT", "neutral-900", "neutral-0",  16, False),
    ("text on surface card (dark)",      "DARK",  "neutral-900", "neutral-0",  16, False),
    # Headings (≥18pt → only 3:1 needed)
    ("h1 / display heading (light)",     "LIGHT", "neutral-900", "neutral-50", 48, True),
    ("h1 / display heading (dark)",      "DARK",  "neutral-900", "neutral-50", 48, True),
    # Buttons (text-on-button-primary)
    ("button on --button-primary-bg (light)", "LIGHT", "text-on-brand", "button-primary-bg", 14, False),  # P1.4
    ("button on --button-primary-bg (dark)",  "DARK",  "text-on-brand", "button-primary-bg", 14, False),  # P1.4
    ("skip-link (light)",                    "LIGHT", "text-on-brand", "button-primary-bg", 14, False),  # P1.4
    ("skip-link (dark)",                     "DARK",  "text-on-brand", "button-primary-bg", 14, False),  # P1.4
]

# Thresholds: WCAG AA
def verdict(ratio, large):
    aa = 3.0 if large else 4.5
    aaa = 4.5 if large else 7.0
    aa_p = "PASS" if ratio >= aa else "FAIL"
    aaa_p = "PASS" if ratio >= aaa else "FAIL"
    return f"AA={aa_p} AAA={aaa_p}"

print(f"{'pair':<38}{'mode':<8}{'fg':<10}{'bg':<12}{'ratio':<10}{'verdict'}")
print("-" * 90)
fails = []
for label, mode, fg_t, bg_t, px, bold in PAIRS:
    fg = get(mode, fg_t)
    bg = get(mode, bg_t)
    # "large text" per WCAG: ≥18pt (≈24px) OR ≥14pt bold (≈18.67px bold)
    is_large = px >= 24 or (px >= 18.67 and bold)
    r = contrast(fg, bg)
    print(f"{label:<38}{mode:<8}{fg_t:<10}{bg_t:<12}{r:>6.2f}:1  {verdict(r, is_large)}")
    if r < (3.0 if is_large else 4.5):
        fails.append((label, mode, fg, bg, r))

print()
if fails:
    print(f"❌ {len(fails)} pair(s) fail WCAG AA:")
    for f in fails:
        print("   ", f)
else:
    print("✅ All checked pairs meet WCAG AA.")
