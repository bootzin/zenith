"""Sanity-check Zenith's CSS and preferences.json files.

Catches the mistakes that make Firefox silently drop rules: unbalanced
braces/parens/quotes, unclosed comments, the removed -moz-bool-pref syntax,
:has() nested inside :has(), and dropdown/string prefs referenced in CSS
that preferences.json doesn't define (or the other way round).

Usage: python check_css.py <zenith root>
"""
import json
import re
import sys
from pathlib import Path

PAIRS = {"{": "}", "(": ")", "[": "]"}
CLOSERS = {v: k for k, v in PAIRS.items()}


def strip_comments(text, path, problems):
    out, i, line = [], 0, 1
    while i < len(text):
        if text.startswith("/*", i):
            end = text.find("*/", i + 2)
            if end == -1:
                problems.append(f"{path}:{line}: unclosed comment")
                return "".join(out)
            chunk = text[i:end + 2]
            # Keep newlines so line numbers stay right.
            out.append("\n" * chunk.count("\n"))
            line += chunk.count("\n")
            i = end + 2
            continue
        if text[i] == "\n":
            line += 1
        out.append(text[i])
        i += 1
    return "".join(out)


def check_balance(text, path, problems):
    stack, line, quote = [], 1, None
    for ch in text:
        if ch == "\n":
            line += 1
            if quote:
                problems.append(f"{path}:{line - 1}: unterminated string")
                quote = None
            continue
        if quote:
            if ch == quote:
                quote = None
            continue
        if ch in "\"'":
            quote = ch
        elif ch in PAIRS:
            stack.append((ch, line))
        elif ch in CLOSERS:
            if not stack or stack[-1][0] != CLOSERS[ch]:
                problems.append(f"{path}:{line}: unexpected '{ch}'")
            else:
                stack.pop()
    for ch, ln in stack:
        problems.append(f"{path}:{ln}: '{ch}' never closed")


def check_has_nesting(text, path, problems):
    for m in re.finditer(r":has\(", text):
        depth, i = 1, m.end()
        while i < len(text) and depth:
            if text.startswith(":has(", i):
                ln = text.count("\n", 0, i) + 1
                problems.append(f"{path}:{ln}: :has() nested inside :has()")
                break
            depth += {"(": 1, ")": -1}.get(text[i], 0)
            i += 1


def load_defined(mod_dir):
    prefs_path = mod_dir / "preferences.json"
    prefs = json.loads(prefs_path.read_text(encoding="utf-8")) if prefs_path.exists() else []
    defined = {}
    for p in prefs:
        if p.get("type") == "dropdown":
            defined[p["property"].replace(".", "-")] = ("dropdown", {o["value"] for o in p.get("options", [])}, p["property"])
        elif p.get("type") == "string":
            defined["--" + p["property"].replace(".", "-")] = ("string", None, p["property"])
        elif p.get("type") == "checkbox":
            defined[p["property"]] = ("checkbox", None, p["property"])
    return defined


def drawing_lines(raw):
    """Lines between /* @drawing */ and /* @end-drawing */: small pictures
    of a choice (the rice picker's), drawn with fixed sizes on purpose."""
    out, inside = set(), False
    for n, line in enumerate(raw.split("\n"), 1):
        if "@drawing" in line:
            inside = True
        if inside:
            out.add(n)
        if "@end-drawing" in line:
            inside = False
    return out


DECL = re.compile(r"^\s*(transition|animation|transition-duration|animation-duration|transition-timing-function|"
                  r"animation-timing-function|border(?:-[a-z]+)*-radius|backdrop-filter)\s*:(.*)$")
VARS = re.compile(r"var\([^()]*(?:\([^()]*\))*[^()]*\)")
PX = re.compile(r"(?<![\w.])(\d*\.?\d+)px")
CURVE = re.compile(r"(?<![\w-])(ease|ease-in|ease-out|ease-in-out)(?![\w-])|cubic-bezier\(")
TIME = re.compile(r"(?<![\w.*(-])(\d*\.?\d+)(ms|s)\b")
SPEED = re.compile(r"calc\([^()]*var\(--zth-speed\)\)")


def top_level(value):
    """A list's items (commas outside parentheses)."""
    out, depth, cur = [], 0, ""
    for ch in value:
        depth += (ch == "(") - (ch == ")")
        if ch == "," and depth == 0:
            out.append(cur)
            cur = ""
        else:
            cur += ch
    return out + [cur]


def check_tokens(raw, css, path, problems):
    """The design tokens (core/chrome.css, docs/reference.md §11): every
    rounded thing uses a radius token, every glass surface the glass's
    filter and its edge, every transition and animation the motion tokens,
    so Theme › Corners, Window transparency, Frost, Glass edge and Motion
    reach everything, now and whatever is added later."""
    skip = drawing_lines(raw)
    lines = css.split("\n")
    i = 0
    while i < len(lines):
        m = DECL.match(lines[i])
        if not m or (i + 1) in skip:
            i += 1
            continue
        start, prop, value = i, m.group(1), m.group(2)
        while not value.rstrip().endswith((";", "{", "}")) and i + 1 < len(lines):
            i += 1
            value += " " + lines[i].strip()
        where = f"{path}:{start + 1}"
        bare = VARS.sub("", value)  # (what's outside var())
        if prop.endswith("radius"):
            if any(float(x) >= 2 for x in PX.findall(bare)):
                problems.append(f"{where}: a fixed radius; use --zth-radius-xs, -s, --zth-radius, -l, "
                                "--zth-tab-radius or --zth-pill-radius")
        elif prop == "backdrop-filter":
            if not re.match(r"\s*(var\(--zth-(panel|glass)-filter\)|none)\s*(!important)?\s*;", value):
                problems.append(f"{where}: a backdrop filter of its own; use var(--zth-panel-filter) or var(--zth-glass-filter)")
        else:
            raw_line = raw.split("\n")[start]
            for item in top_level(value.rstrip(";")):
                if "infinite" in item or "@loop" in raw_line:
                    continue  # (a loop showing something going on keeps its pace)
                if CURVE.search(VARS.sub("", item)):
                    problems.append(f"{where}: a timing curve of its own; use var(--zth-ease) or var(--zth-ease-in)")
                if SPEED.search(item) or "var(--zth-dur" in item:
                    continue  # (a duration from the tokens; a time after it is a delay)
                times = TIME.findall(VARS.sub("", item))
                if prop in ("transition", "animation", "transition-duration", "animation-duration") and times and float(times[0][0]) != 0:
                    problems.append(f"{where}: a fixed duration; use var(--zth-dur), var(--zth-dur-fast) "
                                    "or calc(<time> * var(--zth-speed))")
        i += 1
    # A glass surface has the glass's edge in its shadow (a bar: in its own).
    for m in re.finditer(r"\{([^{}]*backdrop-filter:\s*var\(--zth-(?:panel|glass)-filter\)[^{}]*)\}", css):
        ln = css.count("\n", 0, m.start()) + 1
        selector = css[css.rfind("\n", 0, m.start()) + 1:m.start()]
        if "--zth-glass-shine" not in m.group(1) and not re.search(r"\.zenith-bar|::backdrop", selector) and ln not in skip:
            problems.append(f"{path}:{ln}: a glass surface without the glass edge; add var(--zth-glass-shine) to its box-shadow")


def check_mod(mod_dir, problems, all_defined):
    css_path = mod_dir / "chrome.css"
    data = css_path.read_bytes()
    for m in re.finditer(rb"[\x00-\x08\x0b\x0e-\x1f]", data):
        ln = data.count(b"\n", 0, m.start()) + 1
        problems.append(f"{css_path}:{ln}: stray control character {m.group()!r} (a broken escape?)")
    raw = data.decode("utf-8")
    css = strip_comments(raw, css_path, problems)
    # Zen doesn't read the combined stylesheet as UTF-8, so text shown on
    # screen must spell non-ASCII characters as CSS escapes (\00b7, \2014).
    for m in re.finditer(r'content:\s*"([^"]*)"', css):
        if any(ord(ch) > 126 for ch in m.group(1)):
            ln = css.count("\n", 0, m.start()) + 1
            problems.append(f"{css_path}:{ln}: non-ASCII text in content; use a CSS escape")
    check_balance(css, css_path, problems)
    check_has_nesting(css, css_path, problems)
    check_tokens(raw, css, css_path, problems)
    if "-moz-bool-pref" in css:
        problems.append(f"{css_path}: uses removed -moz-bool-pref syntax")

    prefs_path = mod_dir / "preferences.json"
    prefs = json.loads(prefs_path.read_text(encoding="utf-8")) if prefs_path.exists() else []
    defined = {}
    for p in prefs:
        for key in ("property", "label", "type"):
            if key not in p:
                problems.append(f"{prefs_path}: entry missing '{key}': {p}")
        if p.get("type") == "dropdown":
            values = [o["value"] for o in p.get("options", [])]
            if "none" in values:
                problems.append(f"{prefs_path}: {p['property']} uses reserved value 'none'")
            defined[p["property"].replace(".", "-")] = ("dropdown", set(values), p["property"])
        elif p.get("type") == "string":
            defined["--" + p["property"].replace(".", "-")] = ("string", None, p["property"])
        elif p.get("type") == "checkbox":
            defined[p["property"]] = ("checkbox", None, p["property"])

    # Dropdown attributes used in CSS must exist, with a valid value.
    # (Attributes the Zenith script sets on the window are not settings.)
    script_attrs = {"zenith-script", "zenith-downloading", "zenith-download-done", "zenith-timer", "zenith-press",
                    "zenith-bookmarks", "zenith-other-space", "zenith-blend", "zenith-bm-place", "zenith-bm-side", "zenith-bar", "zenith-bar-buttons", "zenith-bar-hides", "zenith-bar-tabs", "zenith-palette", "zenith-ink", "zenith-bm-look",
                    "zenith-container", "zenith-pip-tucked", "zenith-glance-buttons"}
    # (A mod may read another mod's settings, so look them up in all mods.)
    for attr, value in re.findall(r"\[(zenith-[a-z0-9-]+)=\"([^\"]*)\"\]", css):
        if attr in script_attrs:
            continue
        if attr not in all_defined:
            problems.append(f"{css_path}: [{attr}] not defined in any preferences.json")
        elif all_defined[attr][0] == "dropdown" and value not in all_defined[attr][1]:
            problems.append(f"{css_path}: [{attr}=\"{value}\"] is not one of its options")
    for var in set(re.findall(r"var\((--zenith-[a-z0-9-]+)", css)):
        problems.append(f"{css_path}: {var} reads a text setting; Sine sets empty ones to an empty "
                        "value (the fallback never applies), so use a dropdown")
    for pref in set(re.findall(r"-moz-pref\(\"([^\"]+)\"", css)):
        if pref.startswith("zenith.") and pref not in all_defined:
            problems.append(f"{css_path}: checkbox pref {pref} not in preferences.json")

    # Every setting should be used by the CSS (or be documented as script-only).
    script_only = {p["property"] for p in prefs if p.get("scriptOnly") or p.get("usedBy")}
    for key, (kind, _, prop) in defined.items():
        if kind == "checkbox":
            used = f'"{key}"' in css
        elif kind == "string":
            used = key in css
        else:
            used = f"[{key}" in css
        if not used and prop not in script_only and not prop.startswith(("zen.", "browser.")):
            problems.append(f"{prefs_path}: setting {key} is never used by chrome.css")


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    problems = []
    mods = [root / key for key in ("core", "edges", "tabs", "urlbar", "panels", "motion", "plus")]
    all_defined = {}
    for mod in mods:
        all_defined.update(load_defined(mod))
    for mod in mods:
        check_mod(mod, problems, all_defined)
    for extra in root.glob("*.css"):
        css = strip_comments(extra.read_text(encoding="utf-8"), extra, problems)
        check_balance(css, extra, problems)
    print(f"checked {len(mods)} mods")
    for p in problems:
        print("PROBLEM", p)
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
