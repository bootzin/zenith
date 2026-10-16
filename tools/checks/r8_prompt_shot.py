import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene
out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
with Scene() as z:
    z.js("document.documentElement.removeAttribute('zen-no-acrylic'); zth.open(arguments[0] + '/page'); await zth.sleep(1000); return 1", z.base)
    z.cmd("WebDriver:PerformActions", {"actions": [{"type": "key", "id": "kb", "actions": [
        {"type": "keyDown", "value": "\ue00a"}, {"type": "keyDown", "value": "q"}, {"type": "keyUp", "value": "q"}, {"type": "keyUp", "value": "\ue00a"}]}]})
    z.js("await zth.sleep(400); const i = document.getElementById('zenith-peek-input'); i.value = '12 usd * 3 + 4'; i.dispatchEvent(new Event('input')); await zth.sleep(300); return 1")
    z.screenshot(str(out / "prompt-answer.png"))
    z.js("const i = document.getElementById('zenith-peek-input'); i.value = 'w Kurt Gödel'; i.dispatchEvent(new Event('input')); await zth.sleep(300); return 1")
    z.screenshot(str(out / "prompt-prefix.png"))
