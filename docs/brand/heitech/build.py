# Builds the HeiTech marks: the Pixel H symbol (full and small-size cut) and a constructed
# wordmark whose letters share the symbol's rounded-square language.
import math, os, sys
OUT = sys.argv[1]
INK, ORANGE = "#17171B", "#FA4F00"

def rr(x, y, w, h, r):
    r = min(r, w / 2, h / 2)
    return (f"M{x+r:g} {y:g}H{x+w-r:g}A{r:g} {r:g} 0 0 1 {x+w:g} {y+r:g}V{y+h-r:g}A{r:g} {r:g} 0 0 1 {x+w-r:g} {y+h:g}"
            f"H{x+r:g}A{r:g} {r:g} 0 0 1 {x:g} {y+h-r:g}V{y+r:g}A{r:g} {r:g} 0 0 1 {x+r:g} {y:g}Z")

def ring(cx, cy, ro, ri, a0, a1):
    """An arc band from angle a0 to a1 (degrees, clockwise from +x, y down)."""
    p = lambda r, a: (cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a)))
    large = 1 if (a1 - a0) % 360 > 180 else 0
    x0, y0 = p(ro, a0); x1, y1 = p(ro, a1); x2, y2 = p(ri, a1); x3, y3 = p(ri, a0)
    return (f"M{x0:.2f} {y0:.2f}A{ro:g} {ro:g} 0 {large} 1 {x1:.2f} {y1:.2f}L{x2:.2f} {y2:.2f}"
            f"A{ri:g} {ri:g} 0 {large} 0 {x3:.2f} {y3:.2f}Z")

# --- Symbol: seven panes of a 3x3 grid; the centre pane is the live one.
def symbol(cell, gap, radius, colour=True, origin=None):
    size = 3 * cell + 2 * gap
    o = (256 - size) / 2 if origin is None else origin
    panes, centre = [], None
    for row in range(3):
        for col in range(3):
            if col == 1 and row != 1: continue
            d = rr(o + col * (cell + gap), o + row * (cell + gap), cell, cell, radius)
            if col == 1: centre = d
            else: panes.append(d)
    return panes, centre

def symbol_svg(cell, gap, radius, mode):
    panes, centre = symbol(cell, gap, radius)
    ink = {"colour": INK, "black": "#000", "white": "#fff", "reversed": "#fff"}[mode]
    live = {"colour": ORANGE, "black": "#000", "white": "#fff", "reversed": ORANGE}[mode]
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><title>HeiTech</title>'
            f'<path fill="{ink}" d="{"".join(panes)}"/><path fill="{live}" d="{centre}"/></svg>')

# --- Wordmark "HeiTech": baseline 200, cap height 150, x-height 108, stroke 26.
S, BASE, CAP, XH = 26, 200, 50, 92
def letters():
    x, out = 0.0, []
    def H(x):
        return [rr(x, CAP, S, BASE - CAP, 3), rr(x + 96, CAP, S, BASE - CAP, 3), rr(x + S - 1, 112, 96 - S + 2, S, 0)], 122
    def e(x):
        cx, cy, ro = x + 54, (XH + BASE) / 2, 54
        # The bar's right end follows the bowl's outer curve, so the two meet with no step.
        half = S / 2
        reach = math.sqrt(ro * ro - half * half)
        bar = (f"M{x + 5:g} {cy - half:g}H{cx + reach:.2f}A{ro:g} {ro:g} 0 0 1 {cx + reach:.2f} {cy + half:g}"
               f"H{x + 5:g}Z")
        return [ring(cx, cy, ro, ro - S, 40, 360), bar], 108
    def c(x):
        cx, cy, ro = x + 54, (XH + BASE) / 2, 54
        return [ring(cx, cy, ro, ro - S, 42, 318)], 100
    def i(x):
        return [rr(x, XH, S, BASE - XH, 3), rr(x, CAP + 4, S, S, 5)], S
    def T(x):
        return [rr(x, CAP, 124, S, 3), rr(x + 49, CAP, S, BASE - CAP, 3)], 124
    def h(x):
        cx, cy, ro = x + 54, XH + 54, 54
        return [rr(x, CAP, S, BASE - CAP, 3), ring(cx, cy, ro, ro - S, 180, 360), rr(x + 82, cy - 1, S, BASE - cy + 1, 3)], 108
    plan = [(H, 0), (e, 20), (i, 18), (T, 20), (e, -6), (c, 16), (h, 14)]
    for fn, space in plan:
        x += space
        paths, width = fn(x)
        out += paths
        x += width
    return "".join(out), x

def wordmark_svg(colour):
    d, width = letters()
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 0 {width + 8:g} 256"><title>HeiTech</title>'
            f'<path fill="{colour}" d="{d}"/></svg>')

def horizontal_svg(mode):
    panes, centre = symbol(64, 11, 10, origin=0)
    d, width = letters()
    ink = {"colour": INK, "black": "#000", "reversed": "#fff"}[mode]
    live = {"colour": ORANGE, "black": "#000", "reversed": ORANGE}[mode]
    gap = 52
    total = 214 + gap + width
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total:g} 256"><title>HeiTech</title>'
            f'<g transform="translate(0 21)"><path fill="{ink}" d="{"".join(panes)}"/><path fill="{live}" d="{centre}"/></g>'
            f'<g transform="translate({214 + gap:g} 3)"><path fill="{ink}" d="{d}"/></g></svg>')

def stacked_svg(mode):
    panes, centre = symbol(64, 11, 10, origin=0)
    d, width = letters()
    ink = {"colour": INK, "black": "#000", "reversed": "#fff"}[mode]
    live = {"colour": ORANGE, "black": "#000", "reversed": ORANGE}[mode]
    scale = 0.62
    w = max(214, width * scale)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:g} {214 + 40 + 256 * scale:g}"><title>HeiTech</title>'
            f'<g transform="translate({(w - 214) / 2:g} 0)"><path fill="{ink}" d="{"".join(panes)}"/><path fill="{live}" d="{centre}"/></g>'
            f'<g transform="translate({(w - width * scale) / 2:g} {214 + 40 - CAP * scale + 6:g}) scale({scale})"><path fill="{ink}" d="{d}"/></g></svg>')

files = {
    "heitech-symbol-black.svg": symbol_svg(60, 10, 9, "black"),
    "heitech-symbol.svg": symbol_svg(60, 10, 9, "colour"),
    "heitech-symbol-reversed.svg": symbol_svg(60, 10, 9, "reversed"),
    # Small-size cut (16-32 px): bigger gaps so the panes stay apart.
    "heitech-symbol-small.svg": symbol_svg(62, 18, 7, "colour"),
    "heitech-symbol-small-black.svg": symbol_svg(62, 18, 7, "black"),
    "heitech-wordmark.svg": wordmark_svg(INK),
    "heitech-wordmark-black.svg": wordmark_svg("#000"),
    "heitech-horizontal.svg": horizontal_svg("colour"),
    "heitech-horizontal-black.svg": horizontal_svg("black"),
    "heitech-horizontal-reversed.svg": horizontal_svg("reversed"),
    "heitech-stacked.svg": stacked_svg("colour"),
    "heitech-stacked-reversed.svg": stacked_svg("reversed"),
}
os.makedirs(OUT, exist_ok=True)
for name, svg in files.items():
    open(os.path.join(OUT, name), "w").write(svg)
print("\n".join(files))
