"""What the Zenith settings page shows (Zenith Plus, Zen's Settings > Zenith):
sections, groups, a one-line description for every setting, which settings
draw small pictures, and what each preset sets.

tools/build_prefs.py turns this and the settings themselves into the page's
SCHEMA (inside plus/scripts/zenith-settings-page.uc.mjs) and checks that
every setting appears exactly once.
"""

# A preset writes these values into the settings it covers; settings it
# doesn't list keep their own value. The values match what Zenith's CSS
# does when a setting is left at "Follow preset".
PRESETS = {
    "zenith.edges.preset": {
        "default": "full",
        "values": {
            "off": {"label": "Off", "blurb": "No edges at all"},
            "quiet": {"label": "Quiet", "blurb": "Loading, sharing, private and not-secure only"},
            "full": {"label": "Full", "blurb": "Every edge, including downloads and containers"},
        },
        "sets": {
            "zenith.edges.load": {"off": "off", "quiet": "on", "full": "on"},
            "zenith.edges.download": {"off": "off", "quiet": "off", "full": "on"},
            "zenith.edges.container": {"off": "off", "quiet": "off", "full": "on"},
            "zenith.edges.sharing": {"off": "off", "quiet": "on", "full": "on"},
            "zenith.edges.private": {"off": "off", "quiet": "on", "full": "on"},
            "zenith.edges.insecure": {"off": "off", "quiet": "on", "full": "on"},
            "zenith.edges.unfocused": {"off": "off", "quiet": "off", "full": "on"},
            "zenith.edges.muted": {"off": "off", "quiet": "off", "full": "off"},
            "zenith.edges.focus-border": {"off": "off", "quiet": "off", "full": "off"},
        },
    },
    "zenith.tabs.preset": {
        "default": "informative",
        "values": {
            "plain": {"label": "Plain", "blurb": "Density and sleeping tabs, nothing else"},
            "informative": {"label": "Informative", "blurb": "Dots, stripes, the audio wave and the slim player"},
            "everything": {"label": "Everything", "blurb": "All of that, plus every extra"},
        },
        "sets": {
            "zenith.tabs.attention": {"plain": "off", "informative": "on", "everything": "on"},
            "zenith.tabs.folder-activity": {"plain": "off", "informative": "on", "everything": "on"},
            "zenith.tabs.container": {"plain": "off", "informative": "subtle", "everything": "subtle"},
            "zenith.tabs.split-vertical": {"plain": "off", "informative": "on", "everything": "on"},
            "zenith.tabs.audio-wave": {"plain": "off", "informative": "on", "everything": "on"},
            "zenith.tabs.mini-player": {"plain": "off", "informative": "on", "everything": "on"},
            "zenith.tabs.hover-mute": {"plain": "off", "informative": "off", "everything": "on"},
            "zenith.tabs.pinned-drift": {"plain": "off", "informative": "off", "everything": "on"},
            "zenith.tabs.numbers": {"plain": "off", "informative": "off", "everything": "on"},
            "zenith.tabs.lowercase": {"plain": "off", "informative": "off", "everything": "on"},
        },
    },
    "zenith.urlbar.preset": {
        "default": "spotlight",
        "values": {
            "zen": {"label": "Zen default", "blurb": "Zen's own URL bar"},
            "spotlight": {"label": "Spotlight", "blurb": "Floating in the middle of the window"},
            "top": {"label": "Top", "blurb": "Floating just below the top edge"},
        },
        "sets": {
            "zenith.urlbar.results": {"zen": "list", "spotlight": "dense", "top": "dense"},
            "zenith.urlbar.mono": {"zen": "off", "spotlight": "off", "top": "off"},
        },
    },
    "zenith.panels.preset": {
        "default": "zenith",
        "values": {
            "zen": {"label": "Zen default", "blurb": "Zen's own find bar, Library, menus and notices"},
            "zenith": {"label": "Zenith", "blurb": "Floating, glass and quiet"},
            "compact": {"label": "Zenith, compact menus", "blurb": "The same, with tighter menus"},
        },
        "sets": {
            "zenith.panels.findbar": {"zen": "off", "zenith": "bottom", "compact": "bottom"},
            "zenith.panels.history": {"zen": "off", "zenith": "card", "compact": "card"},
            "zenith.panels.split": {"zen": "zen", "zenith": "gaps", "compact": "gaps"},
            "zenith.panels.notifications": {"zen": "zen", "zenith": "dunst", "compact": "dunst"},
            "zenith.panels.compact-menus": {"zen": "off", "zenith": "off", "compact": "on"},
            "zenith.panels.glance": {"zen": "off", "zenith": "off", "compact": "off"},
        },
    },
    "zenith.motion.preset": {
        "default": "quick",
        "values": {
            "off": {"label": "Off", "blurb": "Everything moves instantly"},
            "quick": {"label": "Quick", "blurb": "Short, light motion"},
            "smooth": {"label": "Smooth", "blurb": "Softer, springier motion"},
        },
        "sets": {
            "zenith.motion.swipe": {"off": "off", "quick": "on", "smooth": "on"},
            "zenith.motion.swipe-round": {"off": "off", "quick": "off", "smooth": "off"},
        },
    },
}

# Settings shown as small pictures instead of a list (the page draws them).
PICTURES = {
    "zenith.core.window-transparency", "zenith.core.page", "zenith.core.floating-sidebar", "zenith.core.corners",
    "zenith.plus.material-windows", "zenith.edges.preset", "zenith.edges.container-style", "zenith.tabs.preset",
    "zenith.urlbar.preset", "zenith.urlbar.results", "zenith.panels.preset", "zenith.panels.findbar",
    "zenith.panels.split", "zenith.panels.notifications", "zenith.motion.preset",
}

# Settings drawn under another one, slightly indented (they only matter
# while it's on; the page also greys them out then, saying why).
PARENTS = {
    "zenith.edges.container-style": "zenith.edges.container",
    "zenith.edges.private-colour": "zenith.edges.private",
    "zenith.tabs.reveal-delay": "zenith.tabs.reveal",
    "zenith.panels.gap": "zenith.panels.split",
    "zenith.motion.swipe-round": "zenith.motion.swipe",
    "zenith.peek.engine": "zenith.peek.enabled",
    "zenith.peek.custom-engine": "zenith.peek.enabled",
    "zenith.peek.instant": "zenith.peek.enabled",
    "zenith.peek.web-cards": "zenith.peek.enabled",
    "zenith.peek.units": "zenith.peek.web-cards",
    "zenith.peek.weather-history": "zenith.peek.web-cards",
    "zenith.peek.pomodoro": "zenith.peek.enabled",
}

SECTIONS = [
    {
        "id": "look", "title": "Look", "icon": "palette",
        "blurb": "Size, colour, glass and the window around the page.",
        "groups": [
            ("Size", ["zenith.core.density", "zenith.core.scale"]),
            ("Colour and shape", ["zenith.core.accent", "zenith.core.corners", "zenith.core.pills"]),
            ("Glass", ["zenith.core.window-transparency", "zenith.core.glass", "zenith.core.glass-shine",
                       "zenith.core.floating-sidebar", "zenith.plus.material-windows", "zenith.plus.material-macos",
                       "zenith.plus.material-linux"]),
            ("Window", ["zenith.core.page", "zen.view.hide-window-controls"]),
        ],
    },
    {
        "id": "edges", "title": "Edges", "icon": "border",
        "blurb": "Hairlines on the page's edges that say what's going on, then get out of the way.",
        "preset": "zenith.edges.preset",
        "groups": [
            ("Lines", ["zenith.edges.load", "zenith.edges.download", "zenith.edges.insecure", "zenith.edges.container",
                       "zenith.edges.container-style", "zenith.edges.sharing", "zenith.edges.private",
                       "zenith.edges.private-colour"]),
            ("How they look", ["zenith.edges.thickness", "zenith.edges.unfocused"]),
            ("Extras", ["zenith.edges.muted", "zenith.edges.focus-border"]),
        ],
    },
    {
        "id": "tabs", "title": "Tabs", "icon": "tabs",
        "blurb": "The sidebar: how it appears, and the small signals on each tab.",
        "preset": "zenith.tabs.preset",
        "groups": [
            ("The sidebar", ["zenith.tabs.reveal", "zenith.tabs.reveal-delay", "zenith.tabs.close-hover",
                             "zen.tabs.open-pinned-in-new-tab", "zenith.plus.minimap"]),
            ("Signals", ["zenith.tabs.unloaded", "zenith.tabs.attention", "zenith.tabs.folder-activity",
                         "zenith.tabs.container", "zenith.tabs.audio-wave", "zenith.tabs.split-vertical"]),
            ("Media", ["zenith.tabs.mini-player", "zenith.plus.media-art"]),
            ("Numbers", ["zenith.tabs.numbers"]),
            ("Extras", ["zenith.tabs.hover-mute", "zenith.tabs.pinned-drift", "zenith.tabs.lowercase"]),
        ],
    },
    {
        "id": "urlbar", "title": "URL bar", "icon": "search",
        "blurb": "Where the URL bar floats and how its results read.",
        "preset": "zenith.urlbar.preset",
        "groups": [
            ("Results", ["zenith.urlbar.results", "zenith.urlbar.mono"]),
        ],
    },
    {
        "id": "panels", "title": "Panels", "icon": "panels",
        "blurb": "Everything that floats over the page: find bar, Library, notices, split view, menus.",
        "preset": "zenith.panels.preset",
        "groups": [
            ("Find and history", ["zenith.panels.findbar", "zenith.panels.history"]),
            ("Split view", ["zenith.panels.split", "zenith.panels.gap"]),
            ("Notices and links", ["zenith.panels.notifications", "zenith.panels.status-delay"]),
            ("Media", ["zenith.panels.pip"]),
            ("Menus", ["zenith.panels.compact-menus"]),
            ("Extras", ["zenith.panels.glance"]),
        ],
    },
    {
        "id": "motion", "title": "Motion", "icon": "motion",
        "blurb": "How things move.",
        "preset": "zenith.motion.preset",
        "groups": [
            ("Movement", ["zenith.motion.tab-switch", "zenith.motion.swipe", "zenith.motion.swipe-round"]),
            ("Less motion", ["zenith.motion.reduced", "zenith.plus.animate-zen"]),
        ],
    },
    {
        "id": "peek", "title": "Peek", "icon": "peek",
        "blurb": "Quick lookups with Alt+Q: answers in the prompt, pages in a floating window, timers.",
        "groups": [
            ("Peek", ["zenith.peek.enabled", "zenith.peek.engine", "zenith.peek.custom-engine"]),
            ("Answers", ["zenith.peek.instant", "zenith.peek.web-cards", "zenith.peek.units",
                         "zenith.peek.weather-history"]),
            ("Timers", ["zenith.peek.pomodoro"]),
        ],
    },
    {
        "id": "pages", "title": "Pages", "icon": "page",
        "blurb": "Small touches inside web pages, and this settings page.",
        "groups": [
            ("In web pages", ["zenith.page.selection", "zenith.page.thin-scrollbars", "zenith.plus.zoom-pill"]),
            ("Settings", ["zenith.plus.sine-mods-first"]),
        ],
    },
]

DESCRIPTIONS = {
    # Look
    "zenith.core.density": "How tall sidebar tabs and URL bar results are.",
    "zenith.core.scale": "Sizes follow the window's width; pick one to fix them.",
    "zenith.core.accent": "The colour of hairlines, highlights and selection. Workspace colour follows each space.",
    "zenith.core.corners": "How rounded panels, tabs and cards are.",
    "zenith.core.pills": "Small badges like the zoom pill and number chips.",
    "zenith.core.window-transparency": "How much of what's behind shows through the window, sidebar and panels.",
    "zenith.core.glass": "How strongly see-through surfaces blur what's behind them.",
    "zenith.core.glass-shine": "A fine highlight along the top edge of glass surfaces.",
    "zenith.core.floating-sidebar": "See-through like the URL bar, always solid, or Zen's own darker floating sidebar.",
    "zenith.plus.material-windows": "What Windows draws behind Zen. Acrylic blurs the windows behind; Mica and Mica Alt "
                                    "tint with your wallpaper. Windows only shows it while Zen is the active window.",
    "zenith.plus.material-macos": "The macOS material behind Zen's window.",
    "zenith.plus.material-linux": "Lets the desktop show through Zen. Blur comes from your desktop: "
                                  "KDE's Better Blur or GNOME's Blur My Shell.",
    "zenith.core.page": "The page flush against the window, rounded with a small gap, or Zen's own frame.",
    "zen.view.hide-window-controls": "Minimise, maximise and close appear only when you hover the top edge.",
    # Edges
    "zenith.edges.load": "A line across the top grows as the page loads.",
    "zenith.edges.download": "A line along the bottom fills as downloads progress.",
    "zenith.edges.insecure": "An amber line on top for pages without HTTPS; hover it for a note.",
    "zenith.edges.container": "A line in the container's colour down the left edge.",
    "zenith.edges.container-style": "Straight, curling round the page's corners, or a short rounded bar.",
    "zenith.edges.sharing": "Red edges while the camera, microphone or screen is shared.",
    "zenith.edges.private": "A frame around private windows.",
    "zenith.edges.private-colour": "The private frame's colour.",
    "zenith.edges.thickness": "How thick the lines are.",
    "zenith.edges.unfocused": "Lines fade while the window is in the background.",
    "zenith.edges.muted": "A short mark in the top-left corner while the tab is muted.",
    "zenith.edges.focus-border": "A thin accent frame while the window is focused.",
    # Tabs
    "zenith.tabs.reveal": "When the hidden sidebar slides out: over the page, or dimming it.",
    "zenith.tabs.reveal-delay": "A short wait before the sidebar slides out on hover.",
    "zenith.tabs.close-hover": "Close buttons show only on the tab under the mouse.",
    "zen.tabs.open-pinned-in-new-tab": "Zen's own setting. Off: a pinned tab goes to the other site itself.",
    "zenith.plus.minimap": "Small ticks at the edge for tabs that are loading, playing or want attention.",
    "zenith.tabs.unloaded": "How sleeping tabs look.",
    "zenith.tabs.attention": "A dot on tabs that want attention.",
    "zenith.tabs.folder-activity": "A dot on closed folders when a tab inside is playing or wants attention.",
    "zenith.tabs.container": "A coloured stripe on tabs in a container.",
    "zenith.tabs.audio-wave": "A moving equaliser behind tabs that play sound.",
    "zenith.tabs.split-vertical": "Tabs in a split view stay together as a group.",
    "zenith.tabs.mini-player": "Zen's media controls as a slim card.",
    "zenith.plus.media-art": "The playing site's cover art behind the media card, blurred as much as Frost says.",
    "zenith.tabs.numbers": "Numbers 1–9 on the tabs Ctrl+1–9 jump to: always, or while you hold Ctrl.",
    "zenith.tabs.hover-mute": "Hover a playing tab's icon to mute it.",
    "zenith.tabs.pinned-drift": "Marks pinned tabs that have wandered off their page.",
    "zenith.tabs.lowercase": "Tab titles in lowercase.",
    # URL bar
    "zenith.urlbar.results": "Dense rows, Zen's list, or tiles for your top sites.",
    "zenith.urlbar.mono": "Web addresses in a monospace font.",
    # Panels
    "zenith.panels.findbar": "Where the find bar floats.",
    "zenith.panels.history": "The Library (Ctrl+H) as a floating card.",
    "zenith.panels.split": "Thin dividers, i3-style gaps, or Zen's own split view.",
    "zenith.panels.gap": "The size of the gaps between split panes.",
    "zenith.panels.notifications": "Zen's notices, small toasts, or dunst-style cards.",
    "zenith.panels.status-delay": "How long a link waits before its address shows at the bottom.",
    "zenith.panels.pip": "Glass controls on picture-in-picture, or Firefox's own.",
    "zenith.panels.compact-menus": "Tighter right-click and app menus.",
    "zenith.panels.glance": "Glance as a lifted, rounded card.",
    # Motion
    "zenith.motion.tab-switch": "Switch tabs instantly, or with a quick crossfade.",
    "zenith.motion.swipe": "The page follows your fingers when you swipe back and forward.",
    "zenith.motion.swipe-round": "The page rounds and lifts a little while you swipe.",
    "zenith.motion.reduced": "When your system asks for less motion: keep Zenith's, or stop it.",
    "zenith.plus.animate-zen": "Keep Zen's own animations too, whatever the system says.",
    # Peek
    "zenith.peek.enabled": "Alt+Q looks up the selected text or opens the Peek prompt; Shift+Enter in the URL bar peeks.",
    "zenith.peek.engine": "Where searches go.",
    "zenith.peek.custom-engine": "Your own search address, with %s where the search goes. Used instead of the engine.",
    "zenith.peek.instant": "Maths, units and time zones answered in the prompt, offline.",
    "zenith.peek.web-cards": "Currency ($), definitions (d) and weather (wt) answered in the prompt.",
    "zenith.peek.units": "Celsius or Fahrenheit for weather; automatic follows your country.",
    "zenith.peek.weather-history": "How many recent places wt shows under the weather near you.",
    "zenith.peek.pomodoro": "What pomo starts; pomo 15 10 4 sets one for that run.",
    # Pages
    "zenith.page.selection": "Selected text in web pages takes the accent colour.",
    "zenith.page.thin-scrollbars": "Thin scrollbars in the accent colour in web pages.",
    "zenith.plus.zoom-pill": "A small pill on zoomed pages; click it to reset.",
    "zenith.plus.sine-mods-first": "In Sine's mods page, your mods come first and the marketplace folds away.",
}

# Shorter names for the page, where each setting's description carries the
# rest (Sine's and Zen's lists keep the longer labels, which need it).
LABELS = {
    "zenith.core.corners": "Corners",
    "zenith.core.glass": "Frost",
    "zenith.plus.material-windows": "Window material",
    "zenith.plus.material-macos": "Window material",
    "zenith.plus.material-linux": "See-through window",
    "zen.view.hide-window-controls": "Window buttons on hover",
    "zenith.edges.load": "Load line",
    "zenith.edges.download": "Download line",
    "zenith.edges.insecure": "Not-secure warning",
    "zenith.edges.container": "Container line",
    "zenith.edges.container-style": "Line style",
    "zenith.edges.sharing": "Sharing alarm",
    "zenith.edges.private": "Private frame",
    "zenith.edges.private-colour": "Frame colour",
    "zenith.edges.thickness": "Thickness",
    "zenith.edges.unfocused": "Fade in the background",
    "zenith.edges.muted": "Muted marker",
    "zenith.edges.focus-border": "Focus frame",
    "zenith.tabs.reveal-delay": "Reveal delay",
    "zenith.tabs.close-hover": "Close buttons on hover",
    "zen.tabs.open-pinned-in-new-tab": "Pinned tabs open sites in new tabs",
    "zenith.plus.minimap": "Minimap",
    "zenith.tabs.audio-wave": "Audio wave",
    "zenith.tabs.split-vertical": "Split-view groups",
    "zenith.tabs.mini-player": "Slim media card",
    "zenith.plus.media-art": "Cover art",
    "zenith.tabs.hover-mute": "Hover to mute",
    "zenith.tabs.pinned-drift": "Pinned drift marker",
    "zenith.tabs.lowercase": "Lowercase titles",
    "zenith.urlbar.mono": "Monospace addresses",
    "zenith.panels.history": "Library",
    "zenith.panels.status-delay": "Link address delay",
    "zenith.panels.glance": "Glance card",
    "zenith.motion.swipe": "Swipe animation",
    "zenith.motion.swipe-round": "Round and lift while swiping",
    "zenith.plus.animate-zen": "Keep Zen's animations",
    "zenith.peek.enabled": "Peek",
    "zenith.peek.engine": "Search engine",
    "zenith.peek.custom-engine": "Custom search address",
    "zenith.peek.instant": "Instant answers",
    "zenith.peek.web-cards": "Answers from the web",
    "zenith.peek.units": "Weather units",
    "zenith.peek.weather-history": "Weather history",
    "zenith.peek.pomodoro": "Pomodoro",
    "zenith.page.selection": "Accent text selection",
    "zenith.page.thin-scrollbars": "Thin accent scrollbars",
    "zenith.plus.zoom-pill": "Zoom pill",
    "zenith.plus.sine-mods-first": "Tidy Sine's mods page",
}
