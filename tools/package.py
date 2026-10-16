"""Build the release folders for the three ways Zenith reaches people.

    dist/zen-store/<mod>/      the six Zenith mods, for Zen's mod store
    dist/sine/zenith-plus/     Zenith Plus as a Sine mod (a preview; Sine
                               installs it straight from the repository's
                               plus/ folder)
    dist/zenith-<version>-manual.zip
                               the fallback: everything for a manual install
                               with fx-autoconfig (tools/install.ps1)

Usage: python package.py <zenith root> --owner <github-user> [--branch <name>] [--author <name>]
The owner is the GitHub account the repository lives under, and the branch
is the one people install from (master); both go into the homepage, readme
and install links. It also writes the theme.json manifests
into the repository itself (<mod>/theme.json, plus/theme.json), which
Sine reads when it installs from GitHub. Nothing is uploaded.
"""
import argparse
import json
import re
import shutil
import zipfile
from datetime import date, datetime, timezone
from pathlib import Path

MODS = {
    "core": ("5a0e7c11-2e1b-4c7d-9f3a-0c0de0000001", "Zenith Core"),
    "edges": ("5a0e7c11-2e1b-4c7d-9f3a-0c0de0000002", "Zenith Edges"),
    "tabs": ("5a0e7c11-2e1b-4c7d-9f3a-0c0de0000003", "Zenith Tabs"),
    "urlbar": ("5a0e7c11-2e1b-4c7d-9f3a-0c0de0000004", "Zenith URL bar"),
    "panels": ("5a0e7c11-2e1b-4c7d-9f3a-0c0de0000005", "Zenith Panels"),
    "motion": ("5a0e7c11-2e1b-4c7d-9f3a-0c0de0000006", "Zenith Motion"),
}
PLUS_ID = "5a0e7c11-2e1b-4c7d-9f3a-0c0de0000007"

# Sine installs a mod's "modules" all at once, and (2.3.3, still on its main
# branch) those parallel installs share one temporary folder and each save
# the mod list from its own stale copy: from one repository, only one mod
# survives and the parent is lost. So each mod names just the next one, and
# Sine installs them one after another: Plus, Motion, Panels, URL bar, Tabs,
# Edges, then Core, which every mod needs and so always comes along.
SINE_CHAIN = {"plus": "motion", "motion": "panels", "panels": "urlbar", "urlbar": "tabs",
              "tabs": "edges", "edges": "core"}

# Where each Plus script runs (Sine reads this from theme.json; fx-autoconfig
# reads the same thing from the @include lines in each script's header).
PLUS_SCRIPTS = {
    "zenith-plus.uc.mjs": ("Zenith Plus", "Live edges, minimap, zoom pills, page colours, sidebar colour, motion, Ctrl numbers.",
                           ["chrome://browser/content/browser.xhtml"]),
    "zenith-peek.uc.mjs": ("Peek", "Quick, disposable lookups in a floating Glance.",
                           ["chrome://browser/content/browser.xhtml"]),
    "zenith-timers.uc.mjs": ("Timers", "Countdowns and pomodoros started from Peek, on the page edge.",
                             ["chrome://browser/content/browser.xhtml"]),
    "zenith-settings.uc.mjs": ("Settings helper", "Greys out Zenith settings that don't apply, and says why.",
                               ["about:preferences*", "about:settings*"]),
}


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def first_paragraph(readme):
    lines = [l for l in readme.read_text(encoding="utf-8").splitlines() if l.strip() and not l.startswith(("#", "Version "))]
    return lines[0] if lines else ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("root")
    ap.add_argument("--owner", required=True, help="GitHub account the repositories live under")
    ap.add_argument("--branch", default="master", help="the repository branch people install from")
    ap.add_argument("--author", default=None)
    args = ap.parse_args()
    repo = f"{args.owner}/zenith/tree/{args.branch}"
    root = Path(args.root)
    author = args.author or args.owner
    version = (root / "VERSION").read_text().strip()
    today = date.today().isoformat()
    dist = root / "dist"
    if dist.exists():
        shutil.rmtree(dist)

    # Sine updates a mod when the updatedAt in its homepage's theme.json is
    # later than the installed one, so it carries the time, not just the date
    # (two releases on one day). createdAt stays what it first was.
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    def created(path):
        try:
            return json.loads(path.read_text(encoding="utf-8")).get("createdAt") or today
        except (OSError, ValueError):
            return today

    # --- Zen's mod store: one folder per mod --------------------------------
    # Each mod's homepage is its own folder: Sine fetches theme.json from the
    # homepage to check for updates (the repository root would mean another
    # branch and no theme.json). The folders sit at the top of the
    # repository: Sine's update (2.3.3, still on its main branch) joins the
    # folder path as one piece, which fails on Windows for "mods/core" and
    # leaves the mod half-replaced.
    raw = f"https://raw.githubusercontent.com/{args.owner}/zenith/{args.branch}"
    home = {key: f"https://github.com/{repo}/{key}" for key in MODS}
    for key, (mod_id, name) in MODS.items():
        src, out = root / key, dist / "zen-store" / key
        out.mkdir(parents=True)
        for f in ("chrome.css", "preferences.json", "readme.md"):
            shutil.copy2(src / f, out / f)
        manifest = {
            "id": mod_id,
            "name": name,
            "description": first_paragraph(src / "readme.md"),
            "homepage": home[key],
            "style": f"{raw}/{key}/chrome.css",
            "readme": f"{raw}/{key}/readme.md",
            "preferences": f"{raw}/{key}/preferences.json",
            "image": "",
            "author": author,
            "version": version,
            "tags": ["minimal", "zenith"],
            "createdAt": created(src / "theme.json"),
            "updatedAt": today,
        }
        write_json(out / "theme.json", manifest)
        # The repository's copy is what Sine reads; it chains to the next mod
        # (see SINE_CHAIN) and carries the full time.
        manifest = {**manifest, "updatedAt": now}
        if key in SINE_CHAIN:
            manifest["modules"] = [home[SINE_CHAIN[key]]]
        write_json(src / "theme.json", manifest)

    # --- Sine: Zenith Plus as a repository root -------------------------------
    plus, out = root / "plus", dist / "sine" / "zenith-plus"
    (out / "scripts").mkdir(parents=True)
    shutil.copy2(plus / "chrome.css", out / "chrome.css")
    shutil.copy2(plus / "preferences.json", out / "preferences.json")
    shutil.copy2(plus / "readme.md", out / "README.md")
    for f in sorted((plus / "scripts").glob("*.uc.mjs")):
        shutil.copy2(f, out / "scripts" / f.name)
    missing = {f.name for f in (plus / "scripts").glob("*.uc.mjs")} ^ set(PLUS_SCRIPTS)
    if missing:
        raise SystemExit(f"PLUS_SCRIPTS is out of date: {sorted(missing)}")
    plus_manifest = {
        # The same id the manual install uses, so moving from a local copy
        # to Sine's GitHub install replaces it instead of adding a second one.
        "id": PLUS_ID,
        "name": "Zenith Plus",
        "description": "Peek, real load and download progress, a sidebar minimap, zoom pills and more for Zenith.",
        "homepage": f"https://github.com/{repo}/plus",
        "author": author,
        "version": version,
        "style": {"chrome": "chrome.css"},
        "preferences": "preferences.json",
        "scripts": {
            f"scripts/{file}": {"name": title, "description": desc, "include": include}
            for file, (title, desc, include) in PLUS_SCRIPTS.items()
        },
        "readme": f"{raw}/plus/readme.md",
        "image": "",
        "tags": ["chrome", "minimal", "utility"],
        "fork": ["zen"],
        # Sine asks whether a mod was made with AI. Zenith was written with
        # an AI assistant (Claude), so it says so.
        "ai": "yes",
        "createdAt": created(plus / "theme.json"),
        "updatedAt": now,
        # Installing Plus from Sine also installs Zenith's six mods, through
        # the chain that starts here.
        "modules": [home[SINE_CHAIN["plus"]]],
    }
    write_json(out / "theme.json", plus_manifest)
    write_json(plus / "theme.json", plus_manifest)

    # The README's install path names the account and branch too.
    readme = root / "README.md"
    text = re.sub(r"[\w-]+/zenith/tree/[\w.-]+/", f"{repo}/", readme.read_text(encoding="utf-8"))
    readme.write_text(text.replace("OWNER/zenith", f"{args.owner}/zenith"), encoding="utf-8")

    # --- Manual install (the fallback) ---------------------------------------
    zip_path = dist / f"zenith-{version}-manual.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for folder in (*MODS, "plus", "vendor"):
            for f in sorted((root / folder).rglob("*")):
                if f.is_file():
                    z.write(f, f"zenith/{f.relative_to(root).as_posix()}")
        for f in ("VERSION", "tools/install.ps1"):
            z.write(root / f, f"zenith/{f}")
        z.writestr("zenith/INSTALL.txt", MANUAL_STEPS.format(version=version))

    print(f"Zenith {version}: {dist}")
    for p in sorted(dist.rglob("theme.json")):
        print("  ", p.relative_to(dist))
    print("  ", zip_path.name)


MANUAL_STEPS = """Zenith {version}: manual install (Windows)

Zenith's six mods are also in Zen's mod store, and Zenith Plus is on Sine;
use this only if you'd rather install everything yourself.

1. Close every Zen window.
2. Zenith Plus needs fx-autoconfig's two program files in Zen's install
   folder (admin rights). Copy the contents of vendor\\fx-autoconfig\\program
   into "C:\\Program Files\\Zen Browser\\". Skip this for Zenith without Plus.
3. In this folder, run:
     powershell -ExecutionPolicy Bypass -File tools\\install.ps1
   (or add -WithoutPlus for the six CSS mods only).
4. Start Zen.

To undo everything: tools\\install.ps1 -Restore
"""

if __name__ == "__main__":
    main()
