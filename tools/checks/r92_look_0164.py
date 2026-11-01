"""0.16.4, inside Zen: the rice picker (Alt+Shift+P) opens in the
middle and is what's drawn there; a theme applies at once; Revert puts
everything back; the font list; one font for the browser. Screenshots in
argv[1]."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
res = {}


def say(name, value):
    res[name] = value
    print(json.dumps({name: value}, ensure_ascii=False), flush=True)


with Scene(headless=False) as z:
    z.js("window.resizeTo(1366, 740); window.moveTo(0, 0); Services.prefs.setStringPref('zenith.bar.top', 'on'); return 1")
    z.js(r"""const wu = window.windowUtils; await new Promise(r => { const t = setTimeout(r, 400); wu.sendNativeKeyEvent(0x409, 0x50, 0x1000 | 0x0100, 'p', 'P', { observe() { clearTimeout(t); r(); } }); }); await zth.sleep(1500); return 1""")
    say("opens with Alt+Shift+P, on top", z.js(r"""const byKey = !!document.getElementById('zenith-rice'); if (!byKey) { await window.ZenithLooks.toggle(); await zth.sleep(1500); } const h = document.getElementById('zenith-rice'); if (!h) return 'not open'; const p = h.querySelector('.zr-panel').getBoundingClientRect();
      const at = document.elementFromPoint(p.left + p.width / 2, p.top + p.height / 2); return { 'by key': byKey, panel: [p.left, p.top, p.width, p.height].map(Math.round), 'on top': h.contains(at), themes: h.querySelectorAll('.zr-card[theme]').length };"""))
    z.screenshot(str(OUT / "a-themes.png"))
    say("a theme applies; Revert", z.js(r"""const P = Services.prefs, h = document.getElementById('zenith-rice'); h.querySelector('.zr-card[theme="Hypr floating"]').click(); await zth.sleep(1200);
      const out = { after: [P.getStringPref('zenith.palette', ''), P.getStringPref('zenith.bar.style', ''), document.querySelector('.zenith-bar')?.getAttribute('look')], lit: h.querySelector('.zr-card[current]')?.getAttribute('theme') };
      [...h.querySelectorAll('.zr-foot button')].find(b => b.textContent === 'Revert').click(); await zth.sleep(800);
      out.reverted = [P.getStringPref('zenith.palette', '(as it comes)'), P.getStringPref('zenith.bar.style', '(as it comes)')]; h.querySelector('.zr-card[theme="Hypr floating"]').click(); await zth.sleep(1200); return out;"""))
    z.screenshot(str(OUT / "b-floating.png"))
    say("bars and fonts", z.js(r"""const h = document.getElementById('zenith-rice'); h.querySelector('.zr-nav [cat="bars"]').click(); await zth.sleep(500); const out = { 'bar choices': h.querySelectorAll('.zr-card[value]').length };
      h.querySelector('.zr-nav [cat="font"]').click(); await zth.sleep(2500); out.fonts = h.querySelectorAll('.zr-font').length; const f = [...h.querySelectorAll('.zr-font')].find(b => /Georgia|Consolas|Arial/.test(b.value)); f?.click(); await zth.sleep(600);
      out.chosen = Services.prefs.getStringPref('zenith.core.font', ''); out['sidebar font'] = getComputedStyle(gNavToolbox).fontFamily; return out;"""))
    z.screenshot(str(OUT / "c-fonts.png"))
    z.js("Services.prefs.clearUserPref('zenith.core.font'); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await zth.sleep(400); return 1")
    say("closed by Esc", z.js("return !document.getElementById('zenith-rice')"))
    z.screenshot(str(OUT / "d-after.png"))
    z.js("for (const p of Services.prefs.getChildList('zenith.')) if (/^zenith\\.(palette|bar\\.|core\\.|internal\\.theme)/.test(p)) Services.prefs.clearUserPref(p); return 1")

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
