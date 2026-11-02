"""Zenith Plus's main script, from its parts.

plus/src/zenith-plus/ holds the script one feature to a file (NN-name.mjs, in
the order they run); plus/scripts/zenith-plus.uc.mjs, the file Sine loads, is
those parts one after another. They share one scope, as they always did: a
part uses another's names as before, nothing to import.

    python tools/build_plus.py [root]          the parts → the script
    python tools/build_plus.py [root] --split  the script → the parts (once,
                                               or to start again from it)

build_prefs.py and bump_version.py write into the parts, then build this.
"""
import re
import sys
from pathlib import Path

HEAD = "// (Built by tools/build_plus.py from plus/src/zenith-plus/: edit the parts there.)\n"


def parts_dir(root):
    return root / "plus" / "src" / "zenith-plus"


def target(root):
    return root / "plus" / "scripts" / "zenith-plus.uc.mjs"


def slug(title):
    s = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    return "-".join(s.split("-")[:5]) or "part"


def split(root):
    text = target(root).read_text(encoding="utf-8").replace(HEAD, "", 1)
    lines = text.splitlines(keepends=True)
    cuts = [i for i, l in enumerate(lines) if l.startswith("/* --- ")]
    # The start() calls at the end are a part of their own.
    tail = len(lines)
    while tail > 0 and (lines[tail - 1].startswith("start(") or lines[tail - 1].strip() in ("", "});", "})();") or
                        lines[tail - 1].startswith("  ") or lines[tail - 1].startswith("}")):
        tail -= 1
    first_start = next((i for i in range(tail, len(lines)) if lines[i].startswith("start(")), len(lines))
    out = parts_dir(root)
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.mjs"):
        old.unlink()
    bounds = [0, *cuts, first_start, len(lines)]
    names = ["header", *[slug(lines[c][7:].split("(")[0].split(":")[0]) for c in cuts], "start"]
    width = len(str(len(names)))
    for k, (a, b) in enumerate(zip(bounds, bounds[1:])):
        if a >= b:
            continue
        (out / f"{k:0{width + 1}d}-{names[k]}.mjs").write_text("".join(lines[a:b]), encoding="utf-8")
    print(f"{len(list(out.glob('*.mjs')))} parts in {out}")


def build(root):
    parts = sorted(parts_dir(root).glob("*.mjs"))
    if not parts:
        sys.exit("no parts: run with --split first")
    body = "".join(p.read_text(encoding="utf-8") for p in parts)
    # (The header keeps its first lines first: Sine reads the // @ lines.)
    first_code = body.index("\n\n") + 2 if body.startswith("//") else 0
    target(root).write_text(body[:first_code] + HEAD + body[first_code:], encoding="utf-8")
    print(f"{target(root)}: {len(parts)} parts")


if __name__ == "__main__":
    root = Path(next((a for a in sys.argv[1:] if not a.startswith("--")), "."))
    split(root) if "--split" in sys.argv else build(root)
