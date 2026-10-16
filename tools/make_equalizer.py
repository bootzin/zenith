"""Generate the animated equalizer used behind playing tabs.

Prints a CSS url("data:...") value: an SVG of rounded bars that each bounce
on their own rhythm (SMIL), drawn with `context-fill` so CSS can colour it
via -moz-context-properties. Seeded, so the output is stable.

Usage: python make_equalizer.py > equalizer.txt
"""
import random
import urllib.parse

random.seed(7)
BARS, PITCH, WIDTH, HEIGHT = 24, 5, 3, 20


def heights(n):
    # Smooth-ish random walk between 3 and 18 so the motion feels organic.
    h, out = random.uniform(6, 14), []
    for _ in range(n):
        h = min(18, max(3, h + random.uniform(-6, 6)))
        out.append(round(h, 1))
    return out + [out[0]]  # loop seamlessly


parts = [f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {BARS * PITCH} {HEIGHT}' preserveAspectRatio='none'>"]
for i in range(BARS):
    hs = heights(random.randint(5, 8))
    dur = round(random.uniform(1.1, 2.3), 2)
    values = ";".join(str(v) for v in hs)
    parts.append(
        f"<g transform='translate({i * PITCH + 1} {HEIGHT}) scale(1 -1)'>"
        f"<rect width='{WIDTH}' height='{hs[0]}' rx='1.5' fill='context-fill'>"
        f"<animate attributeName='height' values='{values}' dur='{dur}s' repeatCount='indefinite' calcMode='spline' "
        f"keySplines='{';'.join(['0.45 0 0.55 1'] * (len(hs) - 1))}'/>"
        f"</rect></g>"
    )
parts.append("</svg>")
svg = "".join(parts)
print('url("data:image/svg+xml,' + urllib.parse.quote(svg, safe=" '=/:;,.") + '")')
