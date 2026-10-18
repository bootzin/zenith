"""0.12.0 on a real screen:
- link hints with real keys: Alt+J then a label follows a link in this tab;
  Alt+Shift+J then a label opens one in a new background tab; Esc stops;
- local AI (downloads Firefox's models into the test profile the first
  time, a few hundred MB from Mozilla): Local AI on turns Firefox's AI on;
  a download called IMG_20240812_093112.png from a page called "Douro
  valley hike, day 2 - Photos" gets a clearer name offered (and, set to rename, renamed
  with Undo); the tab manager's topic sort groups tabs by subject.
Captures in %TEMP%/claude/r52."""
import json, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from screen_kit import Screen

res = {}
with Screen("r52", mine=True) as s:
    z = s.z
    # --- Link hints ---------------------------------------------------------
    z.js("""const links = Array.from({ length: 5 }, (_, i) => `<p><a href="${arguments[0]}/page?n=link${i}">Link number ${i}</a></p>`).join('');
      zth.open('data:text/html,' + encodeURIComponent('<!doctype html><title>Links</title><body style="font:22px sans-serif;margin:40px">' + links));
      await zth.sleep(1500); gBrowser.selectedBrowser.focus(); return 1""", z.base)
    state = lambda: z.js("""return await gBrowser.selectedBrowser.browsingContext.currentWindowGlobal.getActor('ZenithHints').sendQuery('state')""")
    s.keys("%j")
    time.sleep(0.8)
    shown = state()
    s.capture("hints", 0, 0, 900, 420)
    res["Alt+J labels"] = shown and shown["labels"]
    # The third link's label.
    s.keys(shown["labels"][2] if shown else "d")
    time.sleep(1.5)
    res["followed in this tab"] = z.js("return gBrowser.selectedBrowser.currentURI.spec.split('?')[1]")
    z.js("gBrowser.goBack(); await zth.sleep(1200); gBrowser.selectedBrowser.focus(); return 1")
    n = z.js("return gBrowser.tabs.length")
    s.keys("+%j")
    time.sleep(0.8)
    shown = state()
    s.keys(shown["labels"][4] if shown else "j")
    time.sleep(1.5)
    res["Alt+Shift+J: new tab in the background"] = z.js("""return [gBrowser.tabs.length - arguments[0], gBrowser.selectedBrowser.currentURI.spec.slice(0, 15),
      gBrowser.tabs.some(t => t.linkedBrowser.currentURI.spec.endsWith('n=link4')) ? 'opened' : 'missing']""", n)
    s.keys("%j")
    time.sleep(0.6)
    s.keys("{ESC}")
    time.sleep(0.4)
    res["Esc stops"] = "labels" not in (state() or {})

    # --- Local AI -------------------------------------------------------------
    res["firefox AI before, with Local AI on"] = z.js("""const before = Services.prefs.getBoolPref('browser.ml.enable', false);
      Services.prefs.setBoolPref('zenith.plus.local-ai', true); await zth.sleep(300);
      return [before, Services.prefs.getBoolPref('browser.ml.enable', false), !!window.ZenithAI?.on]""")
    t0 = time.time()
    res["download name offered"] = z.js("""
      Services.prefs.setStringPref('zenith.plus.ai-download-names', 'suggest');
      zth.open(arguments[0] + '/photos'); await zth.sleep(1500);
      gBrowser.selectedBrowser.focus();
      // The page's download link, followed with a link hint (real keys
      // below), so the download comes from the page as a click would.
      await window.ZenithHints.show(false); await zth.sleep(500);
      const st = await gBrowser.selectedBrowser.browsingContext.currentWindowGlobal.getActor('ZenithHints').sendQuery('state');
      return { labels: st?.labels };""", z.base)
    s.keys(res["download name offered"]["labels"][0])
    res["download name offered"]["notice"] = z.js("""
      const stack = () => [...(document.getElementById('zenith-toasts')?.children ?? [])].map(c => c.textContent);
      for (let i = 0; i < 1200 && !stack().some(t => /clearer name/i.test(t)); i++) await zth.sleep(500);
      return stack().filter(t => /clearer name|AI model/i.test(t));""")
    res["download name offered"]["seconds (first time includes the model download)"] = round(time.time() - t0)
    s.capture("name-offered", 900, 0, 466, 300)
    res["rename and undo"] = z.js("""
      const card = [...document.getElementById('zenith-toasts').children].find(c => /clearer name/i.test(c.textContent));
      const d = window.ZenithAI.names.last.download;
      const before = PathUtils.filename(d.target.path);
      card.querySelector('.zenith-toast-button').click(); await zth.sleep(800);
      const renamed = PathUtils.filename(d.target.path);
      const onDisk = await IOUtils.exists(d.target.path);
      await window.ZenithAI.names.rename(d, before); await zth.sleep(300);
      return { before, renamed, 'renamed file there': onDisk, 'undo': PathUtils.filename(d.target.path), 'old name back on disk': await IOUtils.exists(d.target.path) };""")
    t0 = time.time()
    res["topics"] = z.js("""
      const titles = ['Pasta carbonara recipe', 'Easy risotto recipe - Kitchen', 'Best pizza dough recipe',
                      'Python list comprehension tutorial', 'JavaScript promises explained', 'Rust ownership guide',
                      'Lisbon travel guide', 'Things to do in Porto'];
      const tabs = [];
      for (const t of titles) { tabs.push(zth.open('data:text/html,' + encodeURIComponent('<title>' + t + '</title>'), { background: true })); await zth.sleep(150); }
      await zth.sleep(1500);
      const groups = await window.ZenithAI.topics(tabs);
      return groups.map(g => [g.label, g.tabs.map(t => t.label)]);""")
    res["topics seconds (first time includes the models)"] = round(time.time() - t0)
    z.js("Services.prefs.setBoolPref('zenith.plus.local-ai', false); await zth.sleep(300); return 1")
    res["firefox AI given back"] = z.js("return Services.prefs.getBoolPref('browser.ml.enable', false)")
    res["css errors"] = z.console_errors()
print(json.dumps(res, indent=1, ensure_ascii=False))
