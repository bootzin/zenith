"""Zenith's settings in CSS, made cheap.

Zenith's sources test a setting the way Sine and Zen hand it over: as an
attribute on a hidden element, `:root:has(#theme-Zenith[zenith-tabs-pin-mark="on"])`.
Each of those makes the browser search the window for that element whenever
it works out styles, and every setting Sine writes at startup (85 of them)
starts that search again: 174 ms per start, and a full restyle twice as slow
as without Zenith (tools/profile_startup.py, DESIGN.md "Speed").

The setting is a pref, and Firefox's own `@media -moz-pref("name", "value")`
reads prefs directly, follows them live, and costs nothing per element. This
turns every `:has(#theme-Zenith …)` test into such a media query, so the
sources can keep the readable form while the CSS that runs never searches:

  :root:has(#theme-Zenith[zenith-tabs-pin-mark="on"]) .tab { ... }
  →  @media -moz-pref("zenith.tabs.pin-mark", "on") { :root:not(#zth-s[zth-s]) .tab { ... } }

`:not(#zth-s[zth-s])` matches every element and weighs what the test weighed
(an id and an attribute), so which of Zenith's rules wins stays the same.
Tests inside :not(), :is() and :where() become not/or in the media query; a
selector list whose parts test different settings is split into one rule
per test. Anything else raises, so a new shape is noticed at build time.

    python tools/css_prefs.py [chrome.css]   # report what the bundle becomes
"""
import json, re, sys
from pathlib import Path

KEY = "#theme-Zenith"
PAD_ID, PAD_ATTR = "#zth-s", "[zth-s]"


class Unsupported(Exception):
    pass


# --- Conditions -----------------------------------------------------------

TRUE = ("true",)


def AND(*xs):
    out = []
    for x in xs:
        if x == TRUE:
            continue
        out.extend(x[1] if x[0] == "and" else [x])
    return TRUE if not out else out[0] if len(out) == 1 else ("and", out)


def OR(*xs):
    if any(x == TRUE for x in xs):
        return TRUE
    out = []
    for x in xs:
        out.extend(x[1] if x[0] == "or" else [x])
    return out[0] if len(out) == 1 else ("or", out)


def NOT(x):
    if x[0] == "not":
        return x[1]
    return ("not", x)


def media(cond, prefs):
    """The media condition for a test (prefs: attribute → pref name)."""
    def lit(attr, value):
        if attr not in prefs:
            raise Unsupported(f"no setting for attribute {attr}")
        q = f'-moz-pref("{prefs[attr]}", "{value}")'
        # A number-like value might be kept as a number pref.
        return f'({q} or -moz-pref("{prefs[attr]}", {value}))' if re.fullmatch(r"\d+", value) else q

    def wrap(c):
        return go(c) if c[0] == "lit" else f"({go(c)})"

    def go(c):
        kind = c[0]
        if kind == "lit":
            return lit(c[1], c[2])
        if kind == "not":
            return f"not {wrap(c[1])}"
        if kind == "and":
            return " and ".join(wrap(x) for x in c[1])
        if kind == "or":
            return " or ".join(wrap(x) for x in c[1])
        raise Unsupported(str(c))
    return go(cond)


def theme_cond(inner):
    """The test in `:has(#theme-Zenith <inner>)`: attribute tests, chained
    (all must hold) or in :is() (any)."""
    inner = inner.strip()
    if inner.startswith(":is(") and inner.endswith(")") and balanced_end(inner, 3) == len(inner) - 1:
        return OR(*(theme_cond(a) for a in split_list(inner[4:-1])))
    attrs = re.findall(r'\[\s*([\w-]+)\s*=\s*"([^"]*)"\s*\]', inner)
    if not attrs or re.sub(r'\[\s*[\w-]+\s*=\s*"[^"]*"\s*\]', "", inner).strip():
        raise Unsupported(f"setting test {inner!r}")
    return AND(*(("lit", a, v) for a, v in attrs))


# --- Selector scanning -------------------------------------------------------

def balanced_end(s, open_at):
    """Index of the bracket closing the one at open_at (strings respected)."""
    pairs = {"(": ")", "[": "]", "{": "}"}
    stack, i = [], open_at
    while i < len(s):
        c = s[i]
        if c in "\"'":
            j = i + 1
            while s[j] != c:
                j += 2 if s[j] == "\\" else 1
            i = j
        elif c in pairs:
            stack.append(pairs[c])
        elif stack and c == stack[-1]:
            stack.pop()
            if not stack:
                return i
        i += 1
    raise Unsupported(f"unbalanced: {s[open_at:open_at + 60]!r}")


def split_list(s, sep=","):
    """Split at top-level separators."""
    out, depth, cur, i = [], 0, [], 0
    while i < len(s):
        c = s[i]
        if c in "\"'":
            j = i + 1
            while s[j] != c:
                j += 2 if s[j] == "\\" else 1
            cur.append(s[i:j + 1])
            i = j + 1
            continue
        if c in "([{":
            depth += 1
        elif c in ")]}":
            depth -= 1
        if c == sep and depth == 0:
            out.append("".join(cur))
            cur = []
        else:
            cur.append(c)
        i += 1
    out.append("".join(cur))
    return out


FUNCS = (":has(", ":not(", ":is(", ":where(")


def specificity(sel):
    """(ids, classes/attributes/pseudo-classes, types) of a selector."""
    a = b = c = 0
    i = 0
    while i < len(sel):
        ch = sel[i]
        if ch == "#":
            m = re.match(r"#[\w-]+", sel[i:])
            a += 1
            i += len(m.group(0))
        elif ch == "[":
            b += 1
            i = balanced_end(sel, i) + 1
        elif sel.startswith("::", i):
            m = re.match(r"::[\w-]+", sel[i:])
            c += 1
            i += len(m.group(0))
            if i < len(sel) and sel[i] == "(":
                i = balanced_end(sel, i) + 1
        elif ch == ":":
            m = re.match(r":[\w-]+", sel[i:])
            name = m.group(0)
            i += len(name)
            if i < len(sel) and sel[i] == "(":
                end = balanced_end(sel, i)
                inner = sel[i + 1:end]
                i = end + 1
                if name in (":is", ":not", ":has", ":matches"):
                    best = max((specificity(x) for x in split_list(inner)), default=(0, 0, 0))
                    a, b, c = a + best[0], b + best[1], c + best[2]
                elif name == ":where":
                    pass
                else:
                    b += 1
            else:
                b += 1
        elif ch == ".":
            m = re.match(r"\.[\w-]+", sel[i:])
            b += 1
            i += len(m.group(0))
        elif re.match(r"[a-zA-Z]", ch):
            m = re.match(r"[\w|-]+", sel[i:])
            c += 1
            i += len(m.group(0))
        else:
            i += 1
    return (a, b, c)


def pad(spec):
    """A part that matches every element and weighs `spec`."""
    a, b, c = spec
    if c:
        raise Unsupported("type weight in a setting test")
    if not (a or b):
        return ""
    return f":not({PAD_ID * a}{PAD_ATTR * b})"


def is_pad_only(text):
    return re.fullmatch(r"(?::not\((?:#zth-s)*(?:\[zth-s\])*\))*", text) is not None


def alternatives(sel):
    """[(condition, selector)]: the selector as tests of settings plus what
    is left of it, one pair per alternative (an :is() of tests and other
    things gives more than one)."""
    alts = [(TRUE, "")]
    i, start = 0, 0

    def add_text(text):
        nonlocal alts
        alts = [(c, s + text) for c, s in alts]

    def add_alts(new):
        nonlocal alts
        alts = [(AND(c1, c2), s1 + s2) for c1, s1 in alts for c2, s2 in new]

    while i < len(sel):
        ch = sel[i]
        if ch in "\"'":
            i = _skip_string(sel, i)
            continue
        if ch == "[":
            i = balanced_end(sel, i) + 1
            continue
        fn = next((f for f in FUNCS if sel.startswith(f, i)), None)
        if fn and (i == 0 or sel[i - 1] != ":"):
            add_text(sel[start:i])
            open_at = i + len(fn) - 1
            end = balanced_end(sel, open_at)
            inner = sel[open_at + 1:end]
            add_alts(function_alternatives(fn, inner))
            i = start = end + 1
            continue
        i += 1
    add_text(sel[start:])
    return alts


def _skip_string(s, i):
    q = s[i]
    j = i + 1
    while s[j] != q:
        j += 2 if s[j] == "\\" else 1
    return j + 1


def function_alternatives(fn, inner):
    whole = f"{fn}{inner})"
    if KEY not in inner:
        return [(TRUE, whole)]
    if fn == ":has(":
        stripped = inner.strip()
        if not stripped.startswith(KEY):
            raise Unsupported(f"setting test inside another :has(): {whole[:80]!r}")
        rest = stripped[len(KEY):]
        if rest[:1] not in ("[", ":") or KEY in rest:
            raise Unsupported(f"setting test {whole[:80]!r}")
        return [(theme_cond(rest), pad(specificity(f"{KEY}{rest}")))]
    args = split_list(inner)
    if fn == ":not(":
        kept, conds = [], []
        for arg in args:
            alts = alternatives(arg.strip())
            if all(c == TRUE for c, _ in alts):
                kept.append(arg)
            elif all(is_pad_only(s) for _, s in alts):
                conds.append(OR(*(c for c, _ in alts)))
            else:
                raise Unsupported(f"setting test mixed with an element test in :not(): {whole[:100]!r}")
        weight = specificity(whole)
        if kept:
            text = f":not({', '.join(a.strip() for a in kept)})"
            text += pad(tuple(w - k for w, k in zip(weight, specificity(text))))
        else:
            text = pad(weight)
        return [(AND(*(NOT(c) for c in conds)), text)]
    # :is() / :where(): one alternative per argument (and per alternative
    # inside it), each weighing what the whole :is() weighed.
    weight = (0, 0, 0) if fn == ":where(" else specificity(whole)
    out = []
    for arg in args:
        arg = arg.strip()
        for c, s in alternatives(arg):
            if is_pad_only(s):
                out.append((c, pad(weight)))
                continue
            own = specificity(f"{fn}{s})")
            extra = tuple(w - o for w, o in zip(weight, own))
            if min(extra) < 0:
                raise Unsupported(f"can't keep the weight of {whole[:100]!r}")
            out.append((c, f"{fn}{s})" + pad(extra)))
    return out


# --- Rules -------------------------------------------------------------------

def parse_block(text):
    """Items of a block: ("decl", text) | ("rule", prelude, body) |
    ("at", text) for statements like @import."""
    items, i, n = [], 0, len(text)
    while i < n:
        j = i
        while j < n and text[j] not in "{;}":
            if text[j] in "\"'":
                j = _skip_string(text, j)
                continue
            if text[j] == "(":
                j = balanced_end(text, j) + 1
                continue
            j += 1
        head = text[i:j]
        if j >= n or text[j] == "}":
            if head.strip():
                items.append(("decl", head.strip()))
            break
        if text[j] == ";":
            if head.strip():
                items.append(("at" if head.strip().startswith("@") else "decl", head.strip()))
            i = j + 1
            continue
        end = balanced_end(text, j)
        items.append(("rule", " ".join(head.split()), text[j + 1:end]))
        i = end + 1
    return items


def convert_block(text, prefs, stats):
    out = []
    for item in parse_block(text):
        if item[0] != "rule":
            out.append(item[1] + ";")
            continue
        prelude, body = item[1], item[2]
        if prelude.startswith("@"):
            if re.match(r"@(media|supports|layer|container|document|-moz-document)\b", prelude):
                out.append(f"{prelude} {{\n{convert_block(body, prefs, stats)}\n}}")
            else:
                out.append(f"{prelude} {{{body}}}")
            continue
        new_body = convert_block(body, prefs, stats)
        if KEY not in prelude:
            out.append(f"{prelude} {{\n{new_body}\n}}")
            continue
        # The same selector under different tests: one selector, either test.
        merged = {}
        for sel in split_list(prelude):
            for c, s in alternatives(sel.strip()):
                s = s.strip() or "&"
                merged[s] = OR(merged[s], c) if s in merged else c
        groups = []  # [(cond, [selectors])] in order
        for s, c in merged.items():
            for g in groups:
                if g[0] == c:
                    g[1].append(s)
                    break
            else:
                groups.append((c, [s]))
        if len(groups) > 1 and re.search(r"\{", body) and "&" in body:
            weights = {max(specificity(s) for s in g[1]) for g in groups}
            if len(weights) > 1:
                raise Unsupported(f"split rule with nested rules: {prelude[:100]!r}")
        stats["rules"] += 1
        stats["split"] += len(groups) > 1
        for c, sels in groups:
            rule = f"{', '.join(sels)} {{\n{new_body}\n}}"
            out.append(rule if c == TRUE else f"@media {media(c, prefs)} {{\n{rule}\n}}")
    return "\n".join(out)


def convert(css, prefs):
    """The CSS with every setting test read from prefs. `prefs` maps each
    setting attribute (zenith-tabs-pin-mark) to its pref."""
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    stats = {"rules": 0, "split": 0}
    out = convert_block(css, prefs, stats)
    if KEY in out:
        raise Unsupported("a setting test was left over")
    return out, stats


def setting_prefs(entries):
    return {e["property"].replace(".", "-"): e["property"] for e in entries if e.get("property", "").startswith("zenith.")}


if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "chrome.css"
    prefs = setting_prefs(json.loads((root / "preferences.json").read_text(encoding="utf-8")))
    out, stats = convert(src.read_text(encoding="utf-8"), prefs)
    print(f"{stats['rules']} rules read settings from prefs ({stats['split']} split); "
          f":has( left: {out.count(':has(')}; {len(out)} bytes")
    if len(sys.argv) > 2:
        Path(sys.argv[2]).write_text(out, encoding="utf-8")
