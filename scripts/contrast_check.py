#!/usr/bin/env python3
"""
WCAG 2.1 contrast checker for MeteoHub design tokens.

Token values are read from src/assets/css/tokens.css **at runtime** — this file
holds no colour snapshot at all, so editing a token in the stylesheet can never
leave this script reporting stale numbers.

Themes read from the stylesheet:
  LIGHT      the top-level `:root { ... }` block
  DARK       `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ... } }`
             merged over `:root` — a token the dark block does not redefine keeps
             its light value, exactly the way the browser resolves it
  DARK-ATTR  the `[data-theme="dark"] { ... }` block, compared item by item
             against the media block; any drift is a hard error

Exit status:
  0  every pair meets WCAG AA
  1  the stylesheet was read fine, but at least one pair falls below AA
  2  the stylesheet could not be read as described above (missing block, missing
     token, unresolvable value, or drift between the two dark blocks) — this
     means the checker itself is looking at something it does not understand,
     not that the stylesheet is wrong

Usage:
    python3 scripts/contrast_check.py [path/to/tokens.css]
"""

import os
import re
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_CSS = os.path.join(REPO_ROOT, "src", "assets", "css", "tokens.css")

RE_COMMENT = re.compile(r"/\*[\s\S]*?\*/")
RE_TOKEN = re.compile(r"--([a-z0-9-]+)\s*:\s*([^;]+);")
RE_HEX = re.compile(r"^#([0-9a-fA-F]{3,8})$")
RE_VAR = re.compile(r"^var\(\s*--([a-z0-9-]+)\s*(?:,\s*([^)]*))?\)$")
RE_DARK_MEDIA = re.compile(r"@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{")
RE_DARK_ROOT = re.compile(r":root:not\(\[data-theme\s*=\s*[\"']light[\"']\]\)\s*\{")
RE_LIGHT_ROOT = re.compile(r":root\s*\{")
RE_DARK_ATTR = re.compile(r"\[data-theme\s*=\s*[\"']dark[\"']\]\s*\{")


class CheckError(Exception):
    """Hard failure: the stylesheet could not be read as the contract requires."""


# --------------------------------------------------------------------------- #
# CSS parsing
# --------------------------------------------------------------------------- #

def strip_comments(css):
    """Comments may contain braces and would break the pairing below."""
    return RE_COMMENT.sub("", css)


def find_block(css, pattern):
    """Return (content, start, end) of the first {...} block opened by `pattern`.

    The block end is found by brace pairing — never by "the next }" — because a
    nested rule inside the block would end the search early.
    """
    m = re.search(pattern, css)
    if not m:
        return None
    brace = m.end() - 1
    depth = 0
    for i in range(brace, len(css)):
        ch = css[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return css[brace + 1:i], m.start(), i + 1
    return None


def parse_tokens(block):
    """Collect the --token: value declarations of one block."""
    out = {}
    for m in RE_TOKEN.finditer(block):
        out["--" + m.group(1)] = m.group(2).strip()
    return out


def load_themes(css_path):
    """Read the three theme blocks out of the stylesheet."""
    try:
        with open(css_path, "r", encoding="utf-8") as fh:
            raw = fh.read()
    except OSError as exc:
        raise CheckError("读不到 tokens.css（%s）：%s" % (css_path, exc))

    css = strip_comments(raw)

    media = find_block(css, RE_DARK_MEDIA)
    if media is None:
        raise CheckError("tokens.css 里找不到 @media (prefers-color-scheme: dark) 块")
    media_body, media_start, media_end = media

    inner = find_block(media_body, RE_DARK_ROOT)
    if inner is None:
        raise CheckError('暗色 media 块里找不到 :root:not([data-theme="light"]) 块')
    dark_media = parse_tokens(inner[0])

    # The light `:root` block and the `[data-theme="dark"]` block both live
    # outside the media query, so the media block is cut out before looking
    # for them — otherwise the dark `:root:not(...)` rule would be mistaken
    # for the light one.
    rest = css[:media_start] + css[media_end:]

    light_blk = find_block(rest, RE_LIGHT_ROOT)
    if light_blk is None:
        raise CheckError("tokens.css 里找不到顶层 :root 块（浅色主题）")
    light = parse_tokens(light_blk[0])

    attr_blk = find_block(rest, RE_DARK_ATTR)
    if attr_blk is None:
        raise CheckError('tokens.css 里找不到 [data-theme="dark"] 块')
    dark_attr = parse_tokens(attr_blk[0])

    return light, dark_media, dark_attr


def drift(a, b):
    """Token names whose value differs between two token maps."""
    names = sorted(set(a) | set(b))
    return [(n, a.get(n), b.get(n)) for n in names if a.get(n) != b.get(n)]


def css_var_name(short, lookup):
    """Short name → CSS custom property: `--color-<name>` first, then `--<name>`."""
    if short.startswith("--"):
        return short
    for cand in ("--color-" + short, "--" + short):
        if cand in lookup:
            return cand
    return None


# --------------------------------------------------------------------------- #
# Colour maths
# --------------------------------------------------------------------------- #

def parse_color(value):
    """'#abc' / '#abcd' / '#aabbcc' / '#aabbccdd' → (r, g, b, a); None if not hex."""
    m = RE_HEX.match(value.strip())
    if not m:
        return None
    h = m.group(1)
    if len(h) in (3, 4):
        h = "".join(c * 2 for c in h)
    if len(h) == 6:
        r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
        a = 1.0
    elif len(h) == 8:
        r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
        a = int(h[6:8], 16) / 255.0
    else:
        return None
    return (r, g, b, a)


def resolve(tokens, var_name, depth=0):
    """Follow the var() chain of one custom property down to a concrete colour."""
    if depth > 12:
        raise CheckError("%s 的 var() 链超过 12 层，疑似循环引用" % var_name)
    raw = tokens.get(var_name)
    if raw is None:
        raise CheckError("%s 没有定义" % var_name)
    value = raw.strip()
    m = RE_VAR.match(value)
    if m:
        ref = "--" + m.group(1)
        try:
            return resolve(tokens, ref, depth + 1)
        except CheckError:
            fallback = parse_color(m.group(2) or "")
            if fallback:
                return fallback
            raise
    color = parse_color(value)
    if color is None:
        raise CheckError("%s 的值 %r 不是可直接计算的颜色" % (var_name, value))
    return color


def composite(top, bottom):
    """Paint translucent `top` over opaque `bottom`."""
    r, g, b, a = top
    return (r * a + bottom[0] * (1 - a),
            g * a + bottom[1] * (1 - a),
            b * a + bottom[2] * (1 - a),
            1.0)


def rel_lum(rgb):
    """WCAG relative luminance (sRGB → linear → weighted sum)."""
    def channel(c):
        c /= 255.0
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = rgb
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)


def contrast(c1, c2):
    l1, l2 = rel_lum(c1), rel_lum(c2)
    if l1 < l2:
        l1, l2 = l2, l1
    return (l1 + 0.05) / (l2 + 0.05)


def hex_of(color):
    r, g, b, a = color
    base = "%02x%02x%02x" % (round(r), round(g), round(b))
    if a >= 1.0:
        return "#" + base
    return "#" + base + "%02x" % round(a * 255)


def verdict(ratio, large):
    """WCAG AA thresholds; AAA is reported for information only."""
    aa = 3.0 if large else 4.5
    aaa = 4.5 if large else 7.0
    aa_p = "PASS" if ratio >= aa else "FAIL"
    aaa_p = "PASS" if ratio >= aaa else "FAIL"
    tag = " (large)" if large else ""
    return "AA=%s%s AAA=%s" % (aa_p, tag, aaa_p)


# --------------------------------------------------------------------------- #
# What has to be checked
# --------------------------------------------------------------------------- #

# Every token below must resolve in BOTH themes. The list keeps the coverage of
# the old hand-written snapshot (so a renamed or deleted token cannot slip
# through unnoticed) and adds the semantic tokens the pairs are built on.
REQUIRED_TOKENS = [
    "neutral-0", "neutral-50", "neutral-100", "neutral-500", "neutral-600",
    "neutral-700", "neutral-900",
    "brand-300", "brand-400", "brand-500", "brand-700",
    "accent-50", "accent-400", "accent-500", "accent-600",
    "text-primary", "text-secondary", "text-muted", "text-accent", "text-on-brand",
    "link-color", "link-hover", "button-primary-bg",
    "bg-page", "bg-surface", "bg-muted",
]

# (label, mode, fg token, bg token, font px, bold, backdrop for a translucent bg)
#
# Notes on the modelling:
#   · `bg-page` / `bg-surface` / `bg-muted` are the semantic background tokens —
#     the dark theme remaps them, the raw neutral ramp does not.
#   · The annotation-layer chip background is a translucent
#     `color-mix(--kind-ink 8%, transparent)`; it is modelled here as
#     `--bg-muted` (solid in light, translucent in dark), which is the darker
#     of the two and therefore the stricter test. The D12 layer is not enabled
#     yet, so these two rows are forward-looking.
#   · `text-on-brand` is the label colour of the primary button and of the
#     skip link; both sit on `--button-primary-bg`.
PAIRS = [
    # ── LIGHT ──────────────────────────────────────────────────────────────
    ("body / primary text",                "LIGHT", "text-primary", "bg-page",  16, False, None),
    ("body / secondary text",              "LIGHT", "text-secondary", "bg-page", 16, False, None),
    ("body / muted text",                  "LIGHT", "text-muted", "bg-page",     14, False, None),
    ("link / default",                     "LIGHT", "link-color", "bg-page",     16, False, None),
    ("link / hover",                       "LIGHT", "link-hover", "bg-page",     16, False, None),
    ("accent label (11px bold)",           "LIGHT", "text-accent", "bg-page",    11, True,  None),
    ("accent guardrail on accent surface", "LIGHT", "accent-600", "accent-50",   12, True,  None),
    ("body text on accent surface",        "LIGHT", "text-primary", "accent-50", 16, False, None),
    ("annotation chip on muted surface",   "LIGHT", "text-accent", "bg-muted",   11, True,  "bg-page"),
    ("text on surface card",               "LIGHT", "text-primary", "bg-surface", 16, False, None),
    ("h1 / display heading",               "LIGHT", "text-primary", "bg-page",    48, True,  None),
    ("button + skip-link label",           "LIGHT", "text-on-brand", "button-primary-bg", 14, False, None),
    # ── DARK ───────────────────────────────────────────────────────────────
    ("body / primary text",                "DARK", "text-primary", "bg-page",     16, False, None),
    ("body / secondary text",              "DARK", "text-secondary", "bg-page",   16, False, None),
    ("body / muted text",                  "DARK", "text-muted", "bg-page",       14, False, None),
    ("link / default",                     "DARK", "link-color", "bg-page",       16, False, None),
    ("link / hover",                       "DARK", "link-hover", "bg-page",       16, False, None),
    ("accent label (11px bold)",           "DARK", "text-accent", "bg-page",      11, True,  None),
    ("accent guardrail on accent surface", "DARK", "text-accent", "accent-50",    12, True,  None),
    ("body text on accent surface",        "DARK", "text-primary", "accent-50",  16, False, None),
    ("annotation chip on muted surface",   "DARK", "text-accent", "bg-muted",     11, True,  "bg-page"),
    ("text on surface card",               "DARK", "text-primary", "bg-surface",  16, False, None),
    ("h1 / display heading",               "DARK", "text-primary", "bg-page",      48, True,  None),
    ("button + skip-link label",           "DARK", "text-on-brand", "button-primary-bg", 14, False, None),
]


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #

def main(argv):
    css_path = argv[1] if len(argv) > 1 else DEFAULT_CSS

    try:
        light, dark_media, dark_attr = load_themes(css_path)
    except CheckError as exc:
        print("✗ %s" % exc, file=sys.stderr)
        return 2

    dark_diff = drift(dark_media, dark_attr)
    if dark_diff:
        print("✗ 暗色两处定义有 %d 项漂移（@media 块 vs [data-theme=\"dark\"] 块）：" % len(dark_diff),
              file=sys.stderr)
        for name, a, b in dark_diff:
            print("    %s: %s ≠ %s" % (name, a, b), file=sys.stderr)
        return 2

    # A token the dark block does not redefine keeps its light value.
    dark = dict(light)
    dark.update(dark_media)
    lookup = dict(dark)

    themes = {"LIGHT": light, "DARK": dark}

    print("MeteoHub · WCAG 2.1 contrast check")
    print("source: %s" % css_path)
    print()
    print("parsed tokens: LIGHT :root %d · DARK media overrides %d · [data-theme=dark] %d (zero drift)"
          % (len(light), len(dark_media), len(dark_attr)))
    print("resolved map:  LIGHT %d · DARK %d (%d inherited + %d overridden)"
          % (len(light), len(dark), len(dark) - len(dark_media), len(dark_media)))

    # --- required tokens: every one must resolve in both themes -------------
    resolved_rows = []
    for short in REQUIRED_TOKENS:
        var_name = css_var_name(short, lookup)
        if var_name is None:
            print("✗ token「%s」在 tokens.css 里找不到（--color-%s / --%s 都没有定义）"
                  % (short, short, short), file=sys.stderr)
            return 2
        row = {"short": short, "var": var_name}
        for mode, tokens in themes.items():
            try:
                row[mode] = resolve(tokens, var_name)
            except CheckError as exc:
                print("✗ %s 主题下 %s" % (mode, exc), file=sys.stderr)
                return 2
        resolved_rows.append(row)
    print("required tokens: %d · all resolvable in LIGHT and DARK" % len(resolved_rows))

    # --- the pairs ----------------------------------------------------------
    header = ("%-40s%-6s%-24s%-24s%8s  %s" % ("pair", "mode", "fg", "bg", "ratio", "verdict"))
    print()
    print(header)
    print("-" * len(header))

    failures = []
    for label, mode, fg_short, bg_short, px, bold, over_short in PAIRS:
        tokens = themes[mode]
        fg_var = css_var_name(fg_short, lookup)
        bg_var = css_var_name(bg_short, lookup)
        if fg_var is None or bg_var is None:
            missing = fg_short if fg_var is None else bg_short
            print("✗ %s 模式下的配对「%s」用到无法解析的 token「%s」" % (mode, label, missing),
                  file=sys.stderr)
            return 2
        try:
            fg = resolve(tokens, fg_var)
            bg = resolve(tokens, bg_var)
            if bg[3] < 1.0:
                if over_short is None:
                    raise CheckError("%s 主题下 %s 是半透明色，却没有给出合成底色" % (mode, bg_var))
                over_var = css_var_name(over_short, lookup)
                if over_var is None:
                    raise CheckError("合成底色 token「%s」找不到" % over_short)
                bg = composite(bg, resolve(tokens, over_var))
            if fg[3] < 1.0:
                fg = composite(fg, bg)
        except CheckError as exc:
            print("✗ %s" % exc, file=sys.stderr)
            return 2

        is_large = px >= 24 or (px >= 18.67 and bold)
        ratio = contrast(fg[:3], bg[:3])
        print("%-40s%-6s%-24s%-24s%8.2f:1  %s"
              % (label, mode,
                 "%s %s" % (fg_short, hex_of(fg)),
                 "%s %s" % (bg_short, hex_of(bg)),
                 ratio, verdict(ratio, is_large)))
        if ratio < (3.0 if is_large else 4.5):
            failures.append((label, mode, fg_short, hex_of(fg), bg_short, hex_of(bg), ratio))

    print()
    if failures:
        print("❌ %d pair(s) fail WCAG AA:" % len(failures))
        for label, mode, fg_short, fg_hex, bg_short, bg_hex, ratio in failures:
            print("    %s · %s · %s %s on %s %s · %.2f:1"
                  % (mode, label, fg_short, fg_hex, bg_short, bg_hex, ratio))
        return 1

    print("✅ All checked pairs meet WCAG AA.")

    # --- the resolved values, so they can be diffed against tokens.css ------
    print()
    print("resolved tokens (LIGHT / DARK)")
    for row in resolved_rows:
        print("  %-28s %-10s %s" % (row["var"], hex_of(row["LIGHT"]), hex_of(row["DARK"])))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
