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


def script(entry):
    # Read by the Zenith Plus scripts (and maybe its CSS).
    entry["usedBy"] = "zenith-plus"
    return entry


MODS = {
    "core": [
        dropdown("zenith.core.density", "Density: row height of sidebar tabs and URL bar results", "Tight",
                 ("Tight: smallest rows", "tight"), ("Compact: rows 4px taller", "compact"),
                 ("Cozy: rows 8px taller", "cozy")),
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
        checkbox("zenith.core.glass-shine", "Glass edge shine", False),
        dropdown("zenith.core.window-transparency", "Window transparency", "Airy",
                 ("Solid", "solid"), ("Dense", "dense"), ("Balanced", "balanced"),
                 ("Airy", "airy"), ("Sheer", "sheer"), ("Glass", "glass")),
        dropdown("zenith.core.floating-sidebar", "Sidebar", "See-through, like the URL bar",
                 ("See-through, like the URL bar", "glass"), ("Solid, docked and floating identical", "solid"),
                 ("Zen's own (floating is darker)", "zen")),
        dropdown("zenith.core.page", "Page frame", "Flush and square",
                 ("Flush and square", "flush"), ("Rounded with a slim gap", "flush-round"), ("Zen default", "zen")),
        checkbox("zen.view.hide-window-controls", "Window buttons only when hovering the top edge (Zen setting)"),
    ],
    "edges": [
        dropdown("zenith.edges.preset", "Preset", "Full",
                 ("Off", "off"), ("Quiet: loading, sharing, private", "quiet"), ("Full", "full")),
        dropdown("zenith.edges.thickness", "Edge thickness", "Auto",
                 ("Auto", "auto"), ("1px", "1"), ("2px", "2"), ("3px", "3")),
        tri("zenith.edges.load", "Load edge (top)"),
        tri("zenith.edges.download", "Download progress (bottom)"),
        tri("zenith.edges.container", "Container colour (left)"),
        when(dropdown("zenith.edges.container-style", "Container line style", "Straight",
                      ("Straight", "straight"), ("Wrap the corners (with a rounded page frame)", "wrap"),
                      ("Rounded bar, inset", "inset")),
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
                 ("Overlay the page", "overlay"), ("Dim the page", "dim")),
        tri("zenith.tabs.close-hover", "Close button only on hover"),
        dropdown("zenith.tabs.unloaded", "Sleeping tabs", "Grey and dim",
                 ("Grey and dim", "grey"), ("Italic title", "italic"), ("Hide favicon", "nofavicon"),
                 ("No change", "off")),
        tri("zenith.tabs.attention", "Attention dots"),
        tri("zenith.tabs.folder-activity", "Folder activity dot"),
        dropdown("zenith.tabs.container", "Container stripe", "Subtle",
                 ("Off", "off"), ("Subtle", "subtle"), ("Strong", "strong")),
        tri("zenith.tabs.split-vertical", "Vertical split-view groups"),
        checkbox("zen.tabs.open-pinned-in-new-tab", "Pinned tabs open other sites in a new tab (Zen setting; untick to stay in the tab)"),
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
    ],
    "urlbar": [
        dropdown("zenith.urlbar.preset", "Preset", "Spotlight",
                 ("Zen default", "zen"), ("Spotlight (centred)", "spotlight"), ("Top", "top")),
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
    ],
    "motion": [
        dropdown("zenith.motion.preset", "Preset", "Quick",
                 ("Off", "off"), ("Quick", "quick"), ("Smooth", "smooth")),
        when(dropdown("zenith.motion.reduced", "When the system asks for less motion", "Keep Zenith's motion",
                      ("Keep Zenith's motion", "zenith"), ("Follow the system: no motion", "follow")),
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
                             ("Google, web results only", "google-web"), ("DuckDuckGo", "duckduckgo"),
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
        when(script(dropdown("zenith.peek.units", "Peek weather units", "Automatic (from your country)",
                             ("Automatic (from your country)", "auto"), ("Metric: °C, km/h", "metric"),
                             ("Imperial: °F, mph", "imperial"))),
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
        script(checkbox("zenith.plus.minimap", "Sidebar minimap while the sidebar is hidden", True)),
        script(checkbox("zenith.plus.zoom-pill", "Zoom pill on zoomed pages", True)),
        script(checkbox("zenith.plus.media-art", "Cover art of what's playing behind the media card", True)),
        script(checkbox("zenith.plus.animate-zen", "Let Zen and Zenith animate even when the system asks for less motion", True)),
        script(checkbox("zenith.page.selection", "Text selection in web pages in the workspace colour", True)),
        script(checkbox("zenith.page.thin-scrollbars", "Thin scrollbars in web pages in the workspace colour", False)),
        script(checkbox("zenith.plus.sine-mods-first", "Sine's mods page: your mods first, marketplace folded away", True)),
    ],
}


def write_helper_rules(root):
    """Copy the dependencies into the settings helper, between its markers."""
    rules = {e["property"]: {"why": e["zenithWhy"], "conditions": e["conditions"]}
             for prefs in MODS.values() for e in prefs if "conditions" in e}
    helper = root / "plus" / "scripts" / "zenith-settings.uc.mjs"
    text = helper.read_text(encoding="utf-8")
    start, end = "// --- rules: generated by tools/build_prefs.py ---", "// --- end of generated rules ---"
    a, b = text.index(start), text.index(end)
    body = "const RULES = " + json.dumps(rules, indent=2) + ";\n"
    helper.write_text(text[:a] + start + "\n" + body + text[b:], encoding="utf-8")


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    write_helper_rules(root)
    for name, prefs in MODS.items():
        out = root / name / "preferences.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(prefs, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"{out}: {len(prefs)} settings")


if __name__ == "__main__":
    main()
