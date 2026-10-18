"""Generate each Zenith mod's preferences.json from one readable table.

Zen shows these in Settings > Zen Mods > (mod) > gear, in this order.
Conventions (see DESIGN.md, "How the settings work"):
  - The first entry of each area is its preset.
  - tri() is an override dropdown whose blank state means "Follow preset".
  - Labels starting with "Extra:" are optional ideas that start off.
  - Dropdowns have no defaultValue, so a blank pref means "use the default";
    the placeholder says what that default is.

Usage: python build_prefs.py <zenith root>
"""
import json
import sys
from pathlib import Path


def dropdown(prop, label, default_label, *options):
    return {
        "property": prop,
        "label": label,
        "type": "dropdown",
        "placeholder": f"Default ({default_label})",
        "options": [{"label": l, "value": v} for l, v in options],
    }


def tri(prop, label):
    return {
        "property": prop,
        "label": label,
        "type": "dropdown",
        "placeholder": "Follow preset",
        "options": [{"label": "On", "value": "on"}, {"label": "Off", "value": "off"}],
    }


def text(prop, label, placeholder):
    return {"property": prop, "label": label, "type": "string", "placeholder": placeholder}


def checkbox(prop, label, default=None):
    entry = {"property": prop, "label": label, "type": "checkbox"}
    if default is not None:
        entry["defaultValue"] = default
    return entry


# --- Dependencies ------------------------------------------------------------
# when() marks a setting that only matters while others have certain values.
# It's written in Sine's own "conditions" format, so Sine hides the setting
# when it doesn't apply; Zen ignores the extra fields, and Zenith Plus's
# settings helper greys the setting out there instead, with the reason.
# (Sine reads unset dropdowns as "" and unset tick boxes as false.)

def IF(prop, value):
    return {"if": {"property": prop, "value": value}}


def NOT(prop, value):
    return {"not": {"property": prop, "value": value}}


def ANY(*conds):
    return {"conditions": list(conds), "operator": "OR"}


def ALL(*conds):
    return {"conditions": list(conds), "operator": "AND"}


def when(entry, why, *conds):
    entry["conditions"] = list(conds)
    entry["operator"] = "AND"
    entry["zenithWhy"] = why
    return entry


PEEK_ON = IF("zenith.peek.enabled", True)
MOTION_ON = NOT("zenith.motion.preset", "off")


def only_on(entry, os, why):
    """A setting for one platform (Services.appinfo.OS: WINNT, Darwin, Linux);
    the settings helper greys it out elsewhere, saying why."""
    entry["zenithPlatform"] = os
    entry["zenithWhy"] = why
    return entry


def script(entry):
    # Read by the Zenith Plus scripts (and maybe its CSS).
    entry["usedBy"] = "zenith-plus"
    return entry


MODS = {
    "core": [
        dropdown("zenith.core.density", "Density", "Tight",
                 ("Tight", "tight"), ("Compact", "compact"),
                 ("Cozy", "cozy")),
        dropdown("zenith.core.scale", "Screen scale", "Auto by window width",
                 ("Auto by window width", "auto"), ("Small screen", "small"),
                 ("Medium screen", "medium"), ("Large screen", "large")),
        dropdown("zenith.core.accent", "Accent colour", "Workspace colour",
                 ("Workspace colour", "workspace"), ("Lavender", "lavender"), ("Blue", "blue"),
                 ("Teal", "teal"), ("Green", "green"), ("Amber", "amber"), ("Orange", "orange"),
                 ("Red", "red"), ("Pink", "pink"), ("Grey", "grey")),
        dropdown("zenith.core.corners", "Corners on panels and tabs", "Soft",
                 ("Square", "square"), ("Soft", "soft"), ("Round", "round")),
        dropdown("zenith.core.pills", "Pills and badges", "Round",
                 ("Round", "round"), ("Match the corner setting", "match")),
        dropdown("zenith.core.glass", "Frost: how much see-through panels blur what is behind", "Subtle",
                 ("Off", "off"), ("Subtle", "subtle"), ("Strong", "strong")),
        dropdown("zenith.core.glass-edge", "Glass edge", "None",
                 ("None", "off"), ("Shine", "shine"), ("Liquid", "liquid")),
        dropdown("zenith.core.window-transparency", "Window transparency", "Airy",
                 ("Solid", "solid"), ("Dense", "dense"), ("Balanced", "balanced"),
                 ("Airy", "airy"), ("Sheer", "sheer"), ("Glass", "glass")),
        dropdown("zenith.core.floating-sidebar", "Sidebar", "See-through",
                 ("See-through", "glass"), ("Solid", "solid"),
                 ("Zen's own", "zen")),
        dropdown("zenith.core.page", "Page frame", "Flush and square",
                 ("Flush and square", "flush"), ("Rounded with a slim gap", "flush-round"), ("Zen default", "zen")),
        checkbox("zen.view.hide-window-controls", "Window buttons only when hovering the top edge (Zen setting)"),
    ],
    "edges": [
        dropdown("zenith.edges.preset", "Preset", "Full",
                 ("Off", "off"), ("Quiet", "quiet"), ("Full", "full")),
        dropdown("zenith.edges.thickness", "Edge thickness", "Auto",
                 ("Auto", "auto"), ("1px", "1"), ("2px", "2"), ("3px", "3")),
        tri("zenith.edges.load", "Load edge (top)"),
        tri("zenith.edges.download", "Download progress (bottom)"),
        tri("zenith.edges.container", "Container colour (left)"),
        when(dropdown("zenith.edges.container-style", "Container line style", "Straight",
                      ("Straight", "straight"), ("Wrap the corners", "wrap"),
                      ("Short bar", "inset")),
             "Container colour is off",
             ANY(IF("zenith.edges.container", "on"),
                 ALL(IF("zenith.edges.container", ""),
                     ANY(IF("zenith.edges.preset", ""), IF("zenith.edges.preset", "full"))))),
        tri("zenith.edges.sharing", "Red edges while camera, mic or screen is shared"),
        tri("zenith.edges.private", "Private window frame"),
        when(dropdown("zenith.edges.private-colour", "Private frame colour", "Purple",
                      ("Purple", "purple"), ("Accent", "accent"), ("Blue", "blue"), ("Teal", "teal"),
                      ("Green", "green"), ("Orange", "orange"), ("Red", "red"), ("Pink", "pink")),
             "Private window frame is off",
             ANY(IF("zenith.edges.private", "on"),
                 ALL(IF("zenith.edges.private", ""), NOT("zenith.edges.preset", "off")))),
        tri("zenith.edges.unfocused", "Fade edges when the window is in the background"),
        tri("zenith.edges.muted", "Extra: muted marker"),
        tri("zenith.edges.insecure", "Amber top edge on not-secure (HTTP) pages"),
        tri("zenith.edges.focus-border", "Extra: accent frame while the window is focused"),
    ],
    "tabs": [
        dropdown("zenith.tabs.preset", "Preset", "Informative",
                 ("Plain", "plain"), ("Informative", "informative"), ("Everything", "everything")),
        dropdown("zenith.tabs.reveal", "Revealed sidebar", "Overlay",
                 ("Overlay", "overlay"), ("Push the page", "push"), ("Dim", "dim")),
        tri("zenith.tabs.close-hover", "Close button only on hover"),
        dropdown("zenith.tabs.unloaded", "Sleeping tabs", "Grey and dim",
                 ("Grey and dim", "grey"), ("Italic title", "italic"), ("Hide favicon", "nofavicon"),
                 ("No change", "off")),
        tri("zenith.tabs.attention", "Attention dots"),
        tri("zenith.tabs.pin-mark", "Pin mark on pinned tabs"),
        tri("zenith.tabs.folder-activity", "Folder activity dot"),
        dropdown("zenith.tabs.container", "Container stripe", "Subtle",
                 ("Off", "off"), ("Subtle", "subtle"), ("Strong", "strong")),
        tri("zenith.tabs.split-vertical", "Vertical split-view groups"),
        checkbox("zen.tabs.open-pinned-in-new-tab", "Pinned tabs open other sites in a new tab"),
        tri("zenith.tabs.audio-wave", "Audio wave behind playing tabs"),
        tri("zenith.tabs.mini-player", "Slim media controls"),
        dropdown("zenith.tabs.reveal-delay", "Extra: sidebar reveal delay", "No delay",
                 ("No delay", "0"), ("100ms", "100"), ("200ms", "200"), ("300ms", "300"), ("500ms", "500")),
        tri("zenith.tabs.hover-mute", "Extra: hover a playing tab's icon to mute"),
        tri("zenith.tabs.pinned-drift", "Extra: mark pinned tabs that left their page"),
        {"property": "zenith.tabs.numbers", "label": "Numbered tabs", "type": "dropdown",
         "placeholder": "Follow preset (Always with Everything, otherwise Off)",
         "options": [{"label": "Off", "value": "off"}, {"label": "Always", "value": "on"},
                     {"label": "While holding Ctrl (needs Zenith Plus)", "value": "ctrl"}]},
        tri("zenith.tabs.lowercase", "Extra: lowercase mode"),
        tri("zenith.tabs.badge-only", "Extra: extension buttons only when they show a badge"),
    ],
    "urlbar": [
        dropdown("zenith.urlbar.preset", "Preset", "Spotlight",
                 ("Zen default", "zen"), ("Spotlight", "spotlight"), ("Top", "top")),
        when(dropdown("zenith.urlbar.results", "Results layout", "Dense list",
                      ("Dense list", "dense"), ("Zen list", "list"), ("Tiles for top sites", "tiles")),
             "The URL bar preset is Zen default",
             NOT("zenith.urlbar.preset", "zen")),
        tri("zenith.urlbar.mono", "Extra: monospace URLs"),
    ],
    "panels": [
        dropdown("zenith.panels.preset", "Preset", "Zenith",
                 ("Zen default", "zen"), ("Zenith", "zenith"), ("Zenith with compact menus", "compact")),
        dropdown("zenith.panels.findbar", "Find bar", "Bottom",
                 ("Zen default", "off"), ("Bottom", "bottom"), ("Top", "top")),
        dropdown("zenith.panels.history", "Library panel (Ctrl+H)", "Floating card",
                 ("Zen default", "off"), ("Floating card", "card")),
        dropdown("zenith.panels.pip", "Picture-in-picture controls", "Glass",
                 ("Glass", "zenith"), ("Firefox default", "firefox")),
        dropdown("zenith.panels.status-delay", "Link URL pill delay", "300ms",
                 ("Instant", "0"), ("150ms", "150"), ("300ms", "300"), ("500ms", "500"), ("800ms", "800")),
        tri("zenith.panels.glance", "Extra: Glance as a lifted card"),
        dropdown("zenith.panels.split", "Split view", "Tiling gaps",
                 ("Hairlines", "hairlines"), ("Tiling gaps", "gaps"), ("Zen default", "zen")),
        when(dropdown("zenith.panels.gap", "Tiling gap size", "6px",
                      ("2px", "2"), ("4px", "4"), ("6px", "6"), ("8px", "8"), ("12px", "12"),
                      ("16px", "16"), ("24px", "24")),
             "Only with Split view: Tiling gaps",
             ANY(IF("zenith.panels.split", "gaps"),
                 ALL(IF("zenith.panels.split", ""), NOT("zenith.panels.preset", "zen")))),
        dropdown("zenith.panels.notifications", "Notifications", "dunst cards",
                 ("Zen default", "zen"), ("Small toasts", "small"), ("dunst cards", "dunst")),
        tri("zenith.panels.compact-menus", "Compact menus"),
        tri("zenith.panels.menu-icons", "Extra: icons on the most used menu items"),
        dropdown("zenith.panels.tab-preview", "Tab previews (Firefox's card when you rest on a tab)", "Zenith",
                 ("Zenith", "zenith"), ("Firefox's own", "firefox")),
    ],
    "motion": [
        dropdown("zenith.motion.preset", "Preset", "Quick",
                 ("Off", "off"), ("Quick", "quick"), ("Smooth", "smooth")),
        when(dropdown("zenith.motion.reduced", "When the system asks for less motion", "Keep Zenith's motion",
                      ("Keep Zenith's motion", "zenith"), ("Follow the system", "follow")),
             "Zenith Plus keeps everything animated",
             NOT("zenith.plus.animate-zen", True)),
        when(dropdown("zenith.motion.tab-switch", "Tab switch", "Instant",
                      ("Instant", "instant"), ("Crossfade", "fade")),
             "Motion is off", MOTION_ON),
        when(tri("zenith.motion.swipe", "Swipe back/forward animation"), "Motion is off", MOTION_ON),
        when(tri("zenith.motion.swipe-round", "Extra: round and lift the page while swiping"),
             "Swipe animation is off", MOTION_ON, NOT("zenith.motion.swipe", "off")),
    ],
    # Zenith Plus: settings for the features that need the Zenith Plus scripts.
    # Each one makes sense on its own; the settings page greys out options
    # that another setting makes irrelevant (plus/scripts/zenith-settings).
    "plus": [
        script(checkbox("zenith.peek.enabled", "Peek: Alt+Q, or Shift+Enter in the URL bar (type ? in Peek to edit prefixes)", True)),
        when(script(dropdown("zenith.peek.engine", "Peek search engine", "Google",
                             ("Google", "google"), ("Google AI Mode", "google-ai"),
                             ("Google web results", "google-web"), ("DuckDuckGo", "duckduckgo"),
                             ("Kagi", "kagi"), ("Bing", "bing"))),
             "Peek is off, or your custom search URL is used instead",
             PEEK_ON, IF("zenith.peek.custom-engine", "")),
        when(script(text("zenith.peek.custom-engine", "Peek custom search URL, used instead of the engine",
                         "https://example.com/search?q=%s")),
             "Peek is off", PEEK_ON),
        when(script(checkbox("zenith.peek.instant", "Peek instant answers: maths, units and time zones", True)),
             "Peek is off", PEEK_ON),
        when(script(checkbox("zenith.peek.web-cards",
                             "Peek answers from the web: currency ($), definitions (d), weather (wt)", True)),
             "Peek is off", PEEK_ON),
        when(script(dropdown("zenith.peek.units", "Peek weather units", "Automatic",
                             ("Automatic", "auto"), ("Metric", "metric"),
                             ("Imperial", "imperial"))),
             "Peek or its answers from the web are off", PEEK_ON, IF("zenith.peek.web-cards", True)),
        when(script(dropdown("zenith.peek.weather-history", "Peek weather history (wt on its own)", "3 recent places",
                             ("Off", "0"), ("1 recent place", "1"), ("2 recent places", "2"), ("3 recent places", "3"),
                             ("4 recent places", "4"), ("5 recent places", "5"))),
             "Peek or its answers from the web are off", PEEK_ON, IF("zenith.peek.web-cards", True)),
        when(script(dropdown("zenith.peek.pomodoro", "Peek pomodoro (type pomo)", "25 min focus, 5 min break, 4 rounds",
                             ("25 min focus, 5 min break, 4 rounds", "25-5-4"),
                             ("50 min focus, 10 min break, 3 rounds", "50-10-3"),
                             ("15 min focus, 3 min break, 4 rounds", "15-3-4"))),
             "Peek is off", PEEK_ON),
        only_on(script(dropdown("zenith.plus.material-windows", "Windows: window material", "Wallpaper",
                                ("Acrylic", "acrylic"), ("Mica", "mica"), ("Mica Alt", "mica-alt"),
                                ("Automatic", "auto"), ("Zen's own", "zen"), ("None", "off"))),
                "WINNT", "Only on Windows"),
        only_on(script(dropdown("zenith.plus.material-macos", "macOS: window material", "HUD",
                                ("Full-screen UI", "fullscreen"), ("Popover", "popover"),
                                ("Menu", "menu"), ("Tooltip", "tooltip"), ("Header", "header"),
                                ("Under the window", "under"), ("None", "off"))),
                "Darwin", "Only on macOS"),
        only_on(script(dropdown("zenith.plus.material-linux", "Linux: see-through window (restart Zen)", "Off",
                                ("On", "on"))),
                "Linux", "Only on Linux"),
        script(checkbox("zenith.plus.see-through-pages",
                        "See-through Zen pages: Settings, Add-ons and other about: pages show the glass behind", False)),
        script(dropdown("zenith.plus.scroll", "Scroll feel (mouse wheel and keys)", "Zen's own",
                        ("Instant", "instant"), ("Quick", "quick"), ("Smooth", "smooth"), ("macOS-like", "glide"))),
        script(checkbox("zenith.plus.switcher", "Switcher: Alt+W jumps to any tab, folder or space; : runs commands", True)),
        when(script(dropdown("zenith.plus.switcher-scope", "Switcher finds tabs in", "Every space",
                             ("Every space", "all"), ("This space only", "here"))),
             "The switcher is off", IF("zenith.plus.switcher", True)),
        script(dropdown("zenith.plus.external-links", "Links from other apps", "Where Zen's Space routing sends them",
                        ("Where Zen's Space routing sends them", "zen"), ("Ask when no Space routing rule matches", "ask"))),
        script(dropdown("zenith.plus.blend", "Extra: blend with the page (the glass takes the page's colour)", "Off",
                        ("Off", "off"), ("On", "on"))),
        script(checkbox("zenith.plus.tab-manager", "Tab manager on Alt+Shift+T: every space's tabs, tidying up, rules", True)),
        script(dropdown("zenith.plus.tabs-auto-sleep", "Put tabs to sleep on their own", "Never",
                        ("Never", "off"), ("After 15 minutes", "15"), ("After 30 minutes", "30"), ("After an hour", "60"),
                        ("After 2 hours", "120"), ("After 4 hours", "240"))),
        script(dropdown("zenith.plus.tabs-auto-close", "Close loose tabs on their own", "Never",
                        ("Never", "off"), ("After a day", "1"), ("After 3 days", "3"), ("After a week", "7"),
                        ("After 2 weeks", "14"), ("After a month", "30"))),
        script(dropdown("zenith.plus.palette-sync", "Palette sync: the spaces take your desktop palette's colours", "Off",
                        ("Off", "off"), ("pywal or winwal (~/.cache/wal/colors.json)", "pywal"),
                        ("wallust (~/.cache/wallust/colors.json)", "wallust"))),
        when(script(dropdown("zenith.plus.palette-spaces", "Palette sync colours", "Every space",
                             ("Every space", "all"), ("The space you're in", "current"))),
             "Palette sync is off", ANY(IF("zenith.plus.palette-sync", "pywal"), IF("zenith.plus.palette-sync", "wallust"))),
        script(dropdown("zenith.plus.space-colour", "Space colour in the glass", "Its gradient",
                        ("Its gradient", "gradient"), ("One tint", "tint"))),
        script(dropdown("zenith.plus.colour-strength", "Space colour strength", "Medium",
                        ("Zen's own (the space's opacity)", "zen"), ("Medium", "medium"), ("Strong", "strong"))),
        script(dropdown("zenith.plus.unpinned-groups", "Groups that don't pin", "Zen's folders, set per folder",
                        ("Zen's folders, set per folder", "folders"), ("Off", "off"))),
        script(dropdown("zenith.plus.ctrl-tab", "Ctrl+Tab", "In order",
                        ("In order", "order"), ("In order, with pictures", "pictures"),
                        ("Recently used, with pictures (like Alt+Tab)", "recent"))),
        script(dropdown("zenith.plus.bookmarks-bar", "Bookmarks bar (when it's on)", "Zen's own, with the window buttons",
                        ("Zen's own, with the window buttons", "zen"), ("Above the page", "above"),
                        ("Over the page, on hover", "hover"))),
        script(dropdown("zenith.plus.bookmarks-import", "Import bookmarks button on the bar", "Hidden",
                        ("Hidden", "hidden"), ("Shown", "shown"))),
        script(dropdown("zenith.plus.bookmarks-look", "Bookmarks (Ctrl+B)", "Like the tab list",
                        ("Like the tab list", "list"), ("Tiles", "tiles"), ("Firefox's tree, restyled", "firefox"))),
        script(dropdown("zenith.plus.bookmarks-place", "Where Ctrl+B opens them", "Right, over the page",
                        ("Right, over the page", "float"), ("Right, the page makes room", "right"),
                        ("Left, beside the tabs", "left"))),
        script(checkbox("zenith.plus.bookmarks-space-first", "This space's bookmarks first", True)),
        script(checkbox("zenith.plus.bookmarks-library", "Bookmarks in Zen's Library", True)),
        script(dropdown("zenith.plus.startpage", "Start page: a clock, search and your bookmarks", "Off",
                        ("Off", "off"), ("As the home page", "on"), ("Home page and new tabs", "newtab"))),
        when(script(checkbox("zenith.plus.startpage-weather", "The weather on the start page", False)),
             "The start page is off", ANY(IF("zenith.plus.startpage", "on"), IF("zenith.plus.startpage", "newtab"))),
        script(checkbox("zenith.plus.float-tab", "Float a tab on Alt+Shift+Space: it pops out into a small window that stays on top", True)),
        script(checkbox("zenith.plus.link-hints", "Link hints on Alt+J: letters on every link, type them to follow it (Alt+Shift+J: in a new tab)", True)),
        script(dropdown("zenith.plus.focus-pages", "Focus mode and the page", "Reader view for articles, tidy the rest",
                        ("Reader view for articles, tidy the rest", "tidy"), ("Reader view for articles", "reader"),
                        ("Leave pages alone", "off"))),
        script(checkbox("zenith.plus.focus-key", "Focus mode on Alt+Z: puts everything away but the page", True)),
        script(dropdown("zenith.plus.workspace-dots", "Workspace dots", "On switch",
                        ("Off", "off"), ("On switch", "switch"), ("Always", "always"))),
        script(checkbox("zenith.plus.workspace-flash", "Workspace flash: the top edge shows the new space's colour", True)),
        script(checkbox("zenith.plus.more-menu", "Rare right-click menu items in a More submenu", True)),
        script(checkbox("zenith.plus.key-switch-flash", "Extra: in compact mode, the sidebar shows briefly when you switch tabs by keyboard", False)),
        script(checkbox("zenith.plus.ready-pulse", "Extra: a pulse on the page's edge when a background tab has loaded", False)),
        script(checkbox("zenith.plus.minimap", "Sidebar minimap while the sidebar is hidden", True)),
        script(checkbox("zenith.plus.zoom-pill", "Zoom pill on zoomed pages", True)),
        script(checkbox("zenith.plus.pip-extras", "Picture-in-picture: the wheel resizes it, edges hold it, past a side edge it tucks away", True)),
        script(checkbox("zenith.plus.media-art", "Cover art of what's playing behind the media card", True)),
        script(checkbox("zenith.plus.animate-zen", "Let Zen and Zenith animate even when the system asks for less motion", True)),
        script(checkbox("zenith.page.selection", "Text selection in web pages in the workspace colour", True)),
        script(checkbox("zenith.page.thin-scrollbars", "Thin scrollbars in web pages in the workspace colour", False)),
        script(checkbox("zenith.plus.sine-mods-first", "Sine's mods page: your mods first, marketplace folded away", True)),
        script(checkbox("zenith.plus.fast-start", "Fast start: the page you were on first, the rest of Zenith Plus right after", False)),
        script(checkbox("zenith.plus.local-ai", "Local AI: Firefox's own, on this computer (fetches its models once)", False)),
        when(script(dropdown("zenith.plus.ai-download-names", "Download names that say nothing (IMG_0931.jpg)", "Rename at once, with Undo",
                             ("Rename at once, with Undo", "rename"), ("Offer a clearer one", "suggest"), ("Leave them", "off"))),
             "Local AI is off", IF("zenith.plus.local-ai", True)),
    ],
}


def write_helper_rules(root):
    """Copy the dependencies into the settings helper, between its markers."""
    rules = {e["property"]: {"why": e["zenithWhy"], "conditions": e.get("conditions", []),
                             **({"platform": e["zenithPlatform"]} if "zenithPlatform" in e else {})}
             for prefs in MODS.values() for e in prefs if "conditions" in e or "zenithPlatform" in e}
    helper = root / "plus" / "scripts" / "zenith-settings.uc.mjs"
    text = helper.read_text(encoding="utf-8")
    start, end = "// --- rules: generated by tools/build_prefs.py ---", "// --- end of generated rules ---"
    a, b = text.index(start), text.index(end)
    body = "const RULES = " + json.dumps(rules, indent=2) + ";\n"
    helper.write_text(text[:a] + start + "\n" + body + text[b:], encoding="utf-8")


MOD_NAMES = {"core": "Zenith Core", "edges": "Zenith Edges", "tabs": "Zenith Tabs", "urlbar": "Zenith URL bar",
             "panels": "Zenith Panels", "motion": "Zenith Motion", "plus": "Zenith Plus"}
# Settings whose default is "leave it to Zen" (a choice that clears them).
ZEN_DEFAULTS = {"zenith.plus.material-windows", "zenith.plus.material-macos", "zenith.plus.material-linux",
                "zenith.plus.scroll"}
# "Follow preset" settings that no preset covers: what Zenith's CSS does
# when they're left blank.
FOLLOW_DEFAULTS = {"zenith.tabs.close-hover": "on"}


def page_schema():
    """The settings page's SCHEMA (see tools/settings_ui.py), checked
    against the settings: each appears once, with a description."""
    import settings_ui as ui
    entries = {e["property"]: (mod, e) for mod, prefs in MODS.items() for e in prefs if e["type"] != "separator"}
    # Buttons on the page that open something of Zen's (no setting behind them).
    entries.update({prop: ("action", {"property": prop, "type": "action", "label": a["label"]})
                    for prop, a in ui.ACTIONS.items()})
    placed = [p for s in ui.SECTIONS for _, props in s["groups"] for p in props] + \
             [s["preset"] for s in ui.SECTIONS if s.get("preset")]
    problems = [f"not on the page: {p}" for p in entries if p not in placed]
    problems += [f"on the page twice: {p}" for p in set(placed) if placed.count(p) > 1]
    problems += [f"not a setting: {p}" for p in placed if p not in entries]
    problems += [f"no description: {p}" for p in entries
                 if p not in ui.DESCRIPTIONS and not p.endswith(".preset") and p not in ui.ACTIONS]
    for preset, info in ui.PRESETS.items():
        for prop, by_preset in info["sets"].items():
            options = {o["value"] for o in entries[prop][1].get("options", [])}
            problems += [f"{preset} sets {prop} to unknown {v!r}" for v in by_preset.values() if v not in options]
    if problems:
        raise SystemExit("settings page:\n  " + "\n  ".join(problems))

    def setting(prop):
        mod, e = entries[prop]
        if mod == "action":
            a = ui.ACTIONS[prop]
            return {"property": prop, "label": a["label"], "type": "action", "extra": False, "desc": a["desc"],
                    "button": a["button"], "command": a["command"], "host": "Zen"}
        label = ui.LABELS.get(prop) or e["label"].removeprefix("Extra: ")
        out = {"property": prop, "label": label[:1].upper() + label[1:], "type": e["type"],
               "extra": e["label"].startswith("Extra: "), "desc": ui.DESCRIPTIONS.get(prop, ""),
               "host": MOD_NAMES[mod]}
        if e["type"] == "dropdown":
            # The page only exists with Plus, so "(needs Zenith Plus)" goes.
            options = [{**o, "label": o["label"].replace(" (needs Zenith Plus)", "")} for o in e["options"]]
            default = None
            placeholder = e.get("placeholder", "")
            if placeholder.startswith("Default (") and placeholder.endswith(")"):
                name = placeholder[len("Default ("):-1]
                match = next((o for o in options if o["label"] == name), None)
                if match:
                    default = match["value"]
                elif prop in ZEN_DEFAULTS:  # "Acrylic" = Zen's own choice: leaves the setting blank
                    options.insert(0, {"label": name, "value": ""})
                    default = ""
                else:
                    raise SystemExit(f"settings page: {prop}'s default {name!r} isn't one of its options")
            out["options"] = options
            out["default"] = FOLLOW_DEFAULTS.get(prop, default)
        elif e["type"] == "checkbox":
            out["default"] = e.get("defaultValue")  # None: a Zen setting, read its own default
        else:
            out["placeholder"] = e.get("placeholder", "")
        if prop in ui.PARENTS:
            out["parent"] = ui.PARENTS[prop]
        if prop in ui.PICTURES:
            out["picture"] = True
        if "zenithWhy" in e:
            out["rule"] = {"why": e["zenithWhy"], "conditions": e.get("conditions", []),
                           **({"platform": e["zenithPlatform"]} if "zenithPlatform" in e else {})}
        return out

    sections = []
    for s in ui.SECTIONS:
        section = {k: s[k] for k in ("id", "title", "icon", "blurb")}
        if s.get("preset"):
            info = ui.PRESETS[s["preset"]]
            section["preset"] = {"property": s["preset"], "host": MOD_NAMES[entries[s["preset"]][0]],
                                 "default": info["default"], "sets": info["sets"],
                                 "values": [{"value": v, **d} for v, d in info["values"].items()]}
        section["groups"] = [{"title": title, "settings": [setting(p) for p in props]} for title, props in s["groups"]]
        sections.append(section)
    return sections


def write_generated(path, start, end, body):
    text = path.read_text(encoding="utf-8")
    a, b = text.index(start), text.index(end)
    path.write_text(text[:a] + start + "\n" + body + text[b:], encoding="utf-8")


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    write_helper_rules(root)
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    sections = page_schema()
    write_generated(root / "plus" / "scripts" / "zenith-settings-page.uc.mjs",
                    "// --- schema: generated by tools/build_prefs.py ---", "// --- end of generated schema ---",
                    "const SCHEMA = " + json.dumps(sections, indent=1, ensure_ascii=False) + ";\n")
    # Plus mirrors every dropdown onto the page's settings element, so a
    # change shows at once whichever loader (Zen or Sine) is in charge.
    dropdowns = {e["property"]: MOD_NAMES[mod] for mod, prefs in MODS.items() for e in prefs
                 if e["type"] == "dropdown" and not e.get("usedBy")}
    write_generated(root / "plus" / "scripts" / "zenith-plus.uc.mjs",
                    "// --- dropdowns: generated by tools/build_prefs.py ---", "// --- end of generated dropdowns ---",
                    "const DROPDOWNS = " + json.dumps(dropdowns, indent=1) + ";\n")
    for name, prefs in MODS.items():
        out = root / name / "preferences.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(prefs, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"{out}: {len(prefs)} settings")


if __name__ == "__main__":
    main()
