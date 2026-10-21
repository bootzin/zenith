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
            "zenith.tabs.pin-mark": {"plain": "off", "informative": "on", "everything": "on"},
            "zenith.tabs.folder-activity": {"plain": "off", "informative": "on", "everything": "on"},
            "zenith.tabs.container": {"plain": "off", "informative": "subtle", "everything": "subtle"},
            "zenith.tabs.split-vertical": {"plain": "off", "informative": "on", "everything": "on"},
            "zenith.tabs.audio-wave": {"plain": "off", "informative": "on", "everything": "on"},
            "zenith.tabs.mini-player": {"plain": "off", "informative": "on", "everything": "on"},
            "zenith.tabs.hover-mute": {"plain": "off", "informative": "off", "everything": "on"},
            "zenith.tabs.pinned-drift": {"plain": "off", "informative": "off", "everything": "on"},
            "zenith.tabs.numbers": {"plain": "off", "informative": "off", "everything": "on"},
            "zenith.tabs.lowercase": {"plain": "off", "informative": "off", "everything": "on"},
            "zenith.tabs.badge-only": {"plain": "off", "informative": "off", "everything": "on"},
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
            "zenith.panels.menu-icons": {"zen": "off", "zenith": "off", "compact": "off"},
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
    "zenith.core.window-transparency", "zenith.core.page", "zenith.core.glass-edge", "zenith.core.floating-sidebar", "zenith.core.corners",
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
    "zenith.plus.peek-click": "zenith.peek.enabled",
    "zenith.peek.custom-engine": "zenith.peek.enabled",
    "zenith.peek.instant": "zenith.peek.enabled",
    "zenith.peek.web-cards": "zenith.peek.enabled",
    "zenith.peek.units": "zenith.peek.web-cards",
    "zenith.peek.weather-history": "zenith.peek.web-cards",
    "zenith.peek.pomodoro": "zenith.peek.enabled",
    "zenith.plus.switcher-scope": "zenith.plus.switcher",
}

SECTIONS = [
    {
        "id": "look", "title": "Look", "icon": "palette",
        "blurb": "Size, colour, glass and the window around the page.",
        "groups": [
            ("Size", ["zenith.core.density", "zenith.core.scale"]),
            ("Colour and shape", ["zenith.core.accent", "zenith.plus.space-colour", "zenith.plus.colour-strength",
                                  "zenith.action.colours-image", "zenith.action.colours-wallpaper", "zenith.plus.palette-sync", "zenith.plus.palette-spaces",
                                  "zenith.action.colours-undo", "zenith.core.corners", "zenith.core.pills"]),
            ("Glass", ["zenith.core.window-transparency", "zenith.core.glass", "zenith.core.glass-edge",
                       "zenith.core.floating-sidebar", "zenith.plus.material-windows", "zenith.plus.material-macos",
                       "zenith.plus.material-linux", "zenith.plus.see-through-pages", "zenith.plus.blend"]),
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
                             "zen.tabs.open-pinned-in-new-tab", "zenith.plus.unpinned-groups", "zenith.plus.minimap",
                             "zenith.plus.key-switch-flash"]),
            ("Spaces", ["zenith.plus.workspace-dots", "zenith.plus.workspace-flash"]),
            ("Extensions", ["zenith.plus.extension-copies"]),
            ("Links", ["zenith.plus.external-links", "zenith.action.space-routing"]),
            ("Signals", ["zenith.tabs.unloaded", "zenith.tabs.pin-mark", "zenith.tabs.attention", "zenith.tabs.attention-for", "zenith.tabs.folder-activity",
                         "zenith.tabs.container", "zenith.tabs.audio-wave", "zenith.tabs.split-vertical"]),
            ("Media", ["zenith.tabs.mini-player", "zenith.plus.media-art"]),
            ("Numbers", ["zenith.tabs.numbers"]),
            ("Extras", ["zenith.tabs.hover-mute", "zenith.tabs.pinned-drift", "zenith.tabs.lowercase",
                        "zenith.tabs.badge-only", "zenith.plus.ready-pulse"]),
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
            ("Media", ["zenith.panels.pip", "zenith.plus.pip-extras", "zenith.plus.pip-within"]),
            ("Downloads", ["zenith.plus.download-delete"]),
            ("Menus", ["zenith.panels.compact-menus", "zenith.plus.more-menu", "zenith.panels.menu-icons"]),
            ("Tab previews", ["zenith.panels.tab-preview"]),
            ("Bookmarks", ["zenith.plus.bookmarks-look", "zenith.plus.bookmarks-place", "zenith.plus.bookmarks-space-first",
                           "zenith.plus.bookmarks-library", "zenith.plus.bookmarks-bar", "zenith.plus.bookmarks-import"]),
            ("Extras", ["zenith.panels.glance"]),
        ],
    },
    {
        "id": "motion", "title": "Motion", "icon": "motion",
        "blurb": "How things move.",
        "preset": "zenith.motion.preset",
        "groups": [
            ("Movement", ["zenith.motion.tab-switch", "zenith.motion.swipe", "zenith.motion.swipe-round"]),
            ("Scrolling", ["zenith.plus.scroll"]),
            ("Less motion", ["zenith.motion.reduced", "zenith.plus.animate-zen"]),
        ],
    },
    {
        "id": "keys", "title": "Keys", "icon": "keys",
        "blurb": "Jump anywhere with Alt+W, follow links with Alt+J, read without distractions with Alt+Z, tidy your tabs with Alt+Shift+T.",
        "groups": [
            ("Switcher", ["zenith.plus.switcher", "zenith.plus.switcher-scope", "zenith.plus.switcher-peek", "zenith.plus.switcher-colon"]),
            ("Ctrl+Tab", ["zenith.plus.ctrl-tab"]),
            ("Tab manager", ["zenith.plus.tab-manager", "zenith.plus.tabs-auto-sleep",
                             "zenith.plus.tabs-auto-close"]),
            ("Focus mode", ["zenith.plus.focus-key", "zenith.plus.focus-scope", "zenith.plus.focus-pages", "zenith.plus.focus-skip"]),
            ("Focus mode › Video sites", ["zenith.plus.focus-video", "zenith.plus.focus-video-search", "zenith.plus.focus-video-description",
                                          "zenith.plus.focus-video-playlist", "zenith.plus.focus-video-comments",
                                          "zenith.plus.focus-video-subscriptions"]),
            ("Link hints", ["zenith.plus.link-hints"]),
            ("Float a tab", ["zenith.plus.float-tab", "zenith.plus.float-above"]),
        ],
    },
    {
        "id": "peek", "title": "Peek", "icon": "peek",
        "blurb": "Quick lookups with Alt+Q: answers in the prompt, pages in a floating window, timers.",
        "groups": [
            ("Peek", ["zenith.peek.enabled", "zenith.plus.peek-click", "zenith.peek.engine", "zenith.peek.custom-engine"]),
            ("Answers", ["zenith.peek.instant", "zenith.peek.web-cards", "zenith.peek.units",
                         "zenith.peek.weather-history"]),
            ("Timers", ["zenith.peek.pomodoro"]),
        ],
    },
    {
        "id": "pages", "title": "Pages", "icon": "page",
        "blurb": "Small touches inside web pages, a start page, and this settings page.",
        "groups": [
            ("In web pages", ["zenith.page.selection", "zenith.page.thin-scrollbars", "zenith.plus.zoom-pill"]),
            ("Start page", ["zenith.plus.startpage", "zenith.plus.startpage-weather", "zenith.plus.startpage-weather-history",
                            "zenith.plus.startpage-bookmarks", "zenith.plus.startpage-top"]),
            ("Settings", ["zenith.plus.sine-mods-first"]),
        ],
    },
    {
        "id": "cookies", "title": "Cookies", "icon": "cookie",
        "blurb": "Cookie banners answered for you, which cookies sites may set, how long they're kept, and each site's own rule.",
        "groups": [
            ("Banners", ["zenith.plus.cookie-banners", "zenith.plus.cookie-banners-skip"]),
            ("Cookies", ["zenith.plus.cookie-policy", "zenith.plus.cookie-keep", "zenith.plus.cookie-notices", "zenith.action.cookies"]),
        ],
    },
    {
        "id": "speed", "title": "Speed and AI", "icon": "speed",
        "blurb": "How quickly Zen starts, and Firefox's own AI working on this computer.",
        "groups": [
            ("Starting Zen", ["zenith.plus.fast-start"]),
            ("Local AI", ["zenith.plus.local-ai", "zenith.plus.ai-download-names", "zenith.plus.ai-topics"]),
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
    "zenith.core.window-transparency": "How much shows through every see-through surface: the sidebar, docked or "
                                       "floating, and the panels. All of them use the same colour and strength.",
    "zenith.core.glass": "How much see-through surfaces blur what's behind them: the page, or (with Window material "
                         "on Wallpaper) the wallpaper behind the docked sidebar. Acrylic and Mica are blurred by "
                         "Windows, at its own strength.",
    "zenith.core.glass-edge": "The rim of glass surfaces: a fine highlight along the top, or liquid glass that catches "
                              "the light around its edge, on panels, the selected tab and essentials, and lights up "
                              "where you press (with Zenith Plus).",
    "zenith.core.floating-sidebar": "See-through like every panel, always solid, or Zen's own colours and blur.",
    "zenith.plus.material-windows": "What shows behind the docked sidebar and around a rounded page. Wallpaper: "
                                    "your desktop wallpaper, drawn by Zenith where it sits on the screen, so Frost and "
                                    "Window transparency work there as they do over the page. Acrylic: Windows' blur "
                                    "of the windows behind, at one strength, only while Zen is active. Mica and Mica "
                                    "Alt: Windows' wallpaper tint. In compact mode the page fills the window.",
    "zenith.plus.material-macos": "The macOS material behind Zen's window.",
    "zenith.plus.material-linux": "Lets the desktop show through Zen. Blur comes from your desktop: "
                                  "KDE's Better Blur or GNOME's Blur My Shell.",
    "zenith.plus.see-through-pages": "Zen's own pages (Settings, Add-ons, about:config, Downloads) show the window's "
                                     "glass behind them, like the docked sidebar. Web pages stay as they are.",
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
    "zenith.tabs.reveal": "When the hidden sidebar slides out: over the page, pushing the page aside by exactly its "
                          "width, or dimming the page.",
    "zenith.plus.key-switch-flash": "In compact mode, the sidebar shows for a moment when you switch tabs from the "
                                    "keyboard, so you see where you landed.",
    "zenith.plus.workspace-dots": "Waybar-style dots at the top of the page, one per space, with the current one's "
                                  "name: for a moment when you switch, or always.",
    "zenith.plus.workspace-flash": "The page's top edge lights up in the new space's colour as you switch.",
    "zenith.tabs.badge-only": "Pinned extension buttons hide unless they show a badge, like an unread count. "
                              "Hovering the toolbar shows them all.",
    "zenith.plus.ready-pulse": "A tab opened in the background has finished loading: the page's edge glows once.",
    "zenith.plus.more-menu": "Rare items in the right-click menus (view source, send to device, set as desktop "
                             "background and so on) move into a More submenu at the end. Nothing is removed.",
    "zenith.plus.scroll": "How the mouse wheel and the keyboard scroll pages: Zen's own short glide, instant jumps, a "
                          "crisp quick ease, a slower even one, or a macOS-like glide that goes further and bounces at "
                          "the ends. A touchpad follows your fingers and isn't changed.",
    "zenith.plus.switcher-scope": "Every space, so Enter switches space when it has to, or only this space's tabs "
                                  "(and the essentials).",
    "zenith.plus.external-links": "Ask each time: a link from another app that no Space routing rule sends somewhere "
                                  "stops at a small card to pick its space (and so its container), with an option to "
                                  "always send that site there.",
    "zenith.plus.blend": "The glass (sidebar, the frame around the page, panels) takes the colour along the top of the "
                         "page you're on, so the window runs into the page.",
    "zenith.plus.tab-manager": "Alt+Shift+T (or :tabs in the switcher) opens about:zenith-tabs: every tab in a table to sort "
                               "and filter, with where the memory and CPU go; each space's tabs in columns; tidying up "
                               "(duplicates, unused, awake tabs, busy sites, by topic) and rules. Move, sleep, wake, put in "
                               "folders or close, with Undo. Nothing happens until you press a button or set a rule.",
    "zenith.plus.tabs-auto-sleep": "Off unless you choose: tabs you haven't been to for this long are unloaded (not the one "
                                   "you're on, playing tabs or tabs sharing your camera or screen).",
    "zenith.plus.tabs-auto-close": "Off unless you choose: loose tabs (not pinned, not essentials, not in a folder) "
                                   "you haven't been to for this long close. The tab manager's Rules list them to bring back.",
    "zenith.plus.ctrl-tab": "In order, as Zen does (with or without a row of pictures), or recently used like Alt+Tab: "
                            "hold Ctrl and press Tab to step through the tabs, with pictures of them, and let go to land.",
    "zenith.plus.bookmarks-look": "Ctrl+B opens your bookmarks in Zenith's look: rows like the tab list, with folders that "
                                  "open in place, or a grid of tiles. Drop a tab on it to bookmark it. \"Firefox's tree\" "
                                  "keeps Firefox's own sidebar, in Zenith's colours.",
    "zenith.plus.bookmarks-place": "Floating over the right of the page, docked on the right (the page gets narrower), "
                                   "or on the left beside the tabs. Drag its inner edge to make it wider.",
    "zenith.plus.bookmarks-space-first": "A section for the space you're in: its own folder (made when you first drop "
                                         "something there) and the bookmarks Zen's edit dialog gives to this space. "
                                         "Bookmarks given only to other spaces are left out, as in Zen's menus.",
    "zenith.plus.bookmarks-library": "The same bookmarks as a section of Zen's Library, next to History.",
    "zenith.plus.bookmarks-import": "Firefox's \"Import bookmarks…\" button on the bookmarks bar.",
    "zenith.plus.bookmarks-bar": "When the bookmarks bar is on (Ctrl+Shift+B): Zen's own place beside the window "
                                 "buttons, a slim strip above the page, or the same strip over the page that shows "
                                 "when the pointer reaches the top.",
    "zenith.panels.menu-icons": "Small icons on the right-click items you use most (open, copy, paste, save, close, pin) "
                                "and on More, from Zen's own icon set.",
    "zenith.panels.tab-preview": "Firefox's card with a picture of the page when you rest on a tab, in Zenith's "
                                 "corners and colours, or left as Firefox draws it.",
    "zenith.plus.switcher": "Alt+W: type part of a tab's title or site, a folder or a space, and Enter goes there. "
                            "Start with : for commands, like :focus or :timer 10m tea.",
    "zenith.plus.focus-key": "Alt+Z puts everything away but the page, for reading or watching: the sidebar, the top "
                             "toolbar, the edges, the minimap, pills, the bookmarks bar and the link address hide, and "
                             "whatever's open closes (bookmarks, the Library, this panel, the find bar). You can open any "
                             "of them again. The sharing alarm still shows. Alt+Z again brings it all back.",
    "zenith.tabs.reveal-delay": "A short wait before the sidebar slides out on hover.",
    "zenith.tabs.close-hover": "Close buttons show only on the tab under the mouse.",
    "zen.tabs.open-pinned-in-new-tab": "Zen's own setting. Off: a pinned tab goes to the other site itself.",
    "zenith.plus.minimap": "Small ticks at the edge for tabs that are loading, playing or want attention.",
    "zenith.tabs.unloaded": "How sleeping tabs look.",
    "zenith.tabs.attention": "A dot on tabs that want attention.",
    "zenith.plus.space-colour": "How a space's colours show in the glass: its whole gradient (each colour where Zen puts it), "
                                "or one tint, all its colours averaged (0.11.0's look).",
    "zenith.plus.colour-strength": "How much of the space's colours the glass takes: the space's own opacity (Zen's theme "
                                   "picker), or at least a medium or strong share, so colours read even at a low opacity.",
    "zenith.plus.unpinned-groups": "Zen's folders pin the tabs you put in them. Right-click a folder › Tabs act unpinned: "
                                   "Ctrl+W closes its tabs, they keep the page they're on, and the folder sits below the "
                                   "pinned tabs' line, with your other tabs. Off hides the choice.",
    "zenith.tabs.pin-mark": "A small pin on pinned tabs, where the sleeping moon goes (not on essentials or tabs in a folder).",
    "zenith.tabs.folder-activity": "A dot on closed folders when a tab inside is playing or wants attention.",
    "zenith.tabs.container": "A coloured stripe on tabs in a container.",
    "zenith.tabs.audio-wave": "A moving equaliser behind tabs that play sound.",
    "zenith.tabs.split-vertical": "Tabs in a split view stay together as a group.",
    "zenith.tabs.mini-player": "Zen's media controls as a slim card.",
    "zenith.plus.media-art": "The playing site's cover art behind the media card, blurred as much as Frost says.",
    "zenith.tabs.numbers": "Numbers 1–9 on the tabs Ctrl+1–9 jump to: always, or while you hold Ctrl (Cmd on macOS).",
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
    "zenith.plus.peek-click": "A link clicked with these keys opens in Peek, as Alt+click opens Zen's Glance; Alt takes Glance's "
                              "place. Any link's right-click menu has Open Link in Peek.",
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
    "zenith.plus.palette-sync": "For people who theme their whole desktop with pywal (winwal on Windows) or wallust: "
                                "those tools pick colours from your wallpaper and write them to a file your terminal and "
                                "other apps read. With this on, your spaces take that palette's most striking colours "
                                "(one, two or three) the moment it changes. pywal writes ~/.cache/wal/colors.json itself; "
                                "for wallust, add a template that writes the same file to ~/.cache/wallust/colors.json. "
                                "Or Your wallpaper: whenever the wallpaper Zenith draws changes (Window material on "
                                "Wallpaper), the spaces take its colours, no other tool needed. Undo colours puts the "
                                "spaces back.",
    "zenith.plus.palette-spaces": "Every space follows the palette, or only the space you're in when it changes.",
    "zenith.plus.float-tab": "Alt+Shift+F (or right-click a tab › Float this tab) moves the tab you're on into a small "
                             "window of its own, which takes the focus; the page carries on as it was, and Alt+Shift+F "
                             "there puts it back. Its bar: the title (click it, or Ctrl+L, Alt+D or F4, to type an "
                             "address), a pin (the bar stays above the page, or slides down when the pointer comes in), "
                             "back into the window, minimise or roll up, and close (Ctrl+Shift+T brings it back floating). "
                             "A floating tab floats again after Zen restarts.",
    "zenith.plus.float-above": "Its Zen window only: the float stays above that window but not above other apps; it "
                               "closes with the window (Ctrl+Shift+T floats it again; after Zen quits, it floats again at start). Every app: it stays "
                               "on top of everything (a call while you work elsewhere), and can be minimised.",
    "zenith.plus.pip-extras": "The mouse wheel over picture-in-picture makes it bigger or smaller. Let go of it near an "
                              "edge and it settles against it; drop it more than halfway past the left or right edge and "
                              "it tucks away, a sliver with an arrow staying in view while it plays. Rest the pointer on "
                              "the sliver (or click it) and it comes out; a click anywhere else, or the pointer away from "
                              "it for a few seconds, tucks it again. Drag it away from the edge to keep it out.",
    "zenith.plus.pip-within": "The screen: its edges are the screen's, above every app. The Zen window: it stays inside the "
                              "window it came from and moves with it, above that window only (not other apps), minimised "
                              "with it (Windows).",
    "zenith.plus.switcher-peek": "The switcher's last row is Peek: what you typed, looked up without leaving the page; "
                                 "when nothing else matches, it's the first, so Enter peeks.",
    "zenith.plus.switcher-colon": "Pressing : anywhere you aren't typing (a page, the sidebar) opens the switcher with : "
                                  "already there, ready for a command.",
    "zenith.plus.extension-copies": "Right-click an extension › Copy for other spaces: a second copy with its own storage "
                                    "(another account in the same password manager), running in your other spaces while the "
                                    "original runs in this one (Runs in spaces, as with any extension). Zenith loads copies as "
                                    "temporary add-ons at each start, from your profile folder; nothing in about:config "
                                    "changes.",
    "zenith.plus.cookie-banners": "Consent banners answered as they appear, in pages and their frames: Reject (or Only "
                                  "necessary) pressed on the common consent tools (OneTrust, Cookiebot, Didomi, Quantcast, "
                                  "Usercentrics, Sourcepoint, TrustArc and more), and on any other banner a button that "
                                  "says no. Nothing is ever accepted. A banner with no way to refuse can be hidden instead "
                                  "(the page scrolls again).",
    "zenith.plus.cookie-banners-skip": "Sites whose banners stay as they are (a site covers its subdomains). The cookies "
                                       "page's Banners left alone adds to it.",
    "zenith.plus.cookie-policy": "Firefox's own cookie setting (yours comes back with Firefox's own). No cross-site: only "
                                 "the site you're on sets cookies. No trackers: cross-site cookies from known trackers are "
                                 "blocked. Only sites you allow: every cookie is blocked except sites you allow on the "
                                 "cookies page (logins elsewhere stop working).",
    "zenith.plus.cookie-keep": "Until you close Zen: Firefox deletes cookies and site data when Zen closes (you're signed "
                               "out), except sites you allow; history, downloads, the cache and site settings are kept.",
    "zenith.plus.download-delete": "A bin beside Show in folder on each finished download, in the sidebar's downloads, "
                                   "Zen's Library and Firefox's Library window: it deletes the file and takes it off the "
                                   "list. With two clicks, the first turns it red and asks.",
    "zenith.plus.startpage": "about:zenith-start, on the window's glass: a clock, a search box (Peek's engine) that also "
                             "finds your bookmarks as you type, and your bookmarks, 1–9 to open one. It becomes the home "
                             "page (the Home button, and new windows if they open the home page); with new tabs too, "
                             "Ctrl+T opens it instead of Zen's URL bar. Off gives yours back.",
    "zenith.plus.startpage-weather": "A line from wttr.in for where you are (worked out from your connection, as Peek's "
                                     "\"wt\").",
    "zenith.plus.startpage-weather-history": "Below it, the places you looked up in Peek lately, as many as Peek's weather "
                                             "history keeps (each place once).",
    "zenith.plus.startpage-bookmarks": "Your bookmarks under the search box, toolbar first; 1–9 open one while the box is "
                                       "empty, and typing finds them.",
    "zenith.plus.startpage-top": "A row of the sites you visit most (Firefox's own ranking: how often and how lately), "
                                 "one per site. Typing finds them too.",
    "zenith.plus.focus-scope": "Alt+Z focuses the site you're on: its tabs, and pages on it you go to; on another site's tab "
                               "the browser is as it was. Every site: all tabs, until Alt+Z again.",
    "zenith.plus.focus-pages": "Focus mode clears the browser around the page (and closes whatever was open); this is what "
                               "it does to the page. An article gets a calm reading view over the page; other pages that "
                               "are mostly reading lose cookie banners, newsletter boxes, share bars, comments, sponsored "
                               "blocks, ads, side columns and bars stuck to the window's edges. A pill offers Show the "
                               "page and Not on this site. Leaving focus mode puts it all back, without reloading.",
    "zenith.plus.focus-video": "On a video site, focus mode turns a feed into a place to watch: you come for something, and "
                               "the page helps you find it and watch it without offering the next thing. On YouTube the "
                               "home feed, recommendations, Shorts, end screens, autoplay and the bell go, and the video gets "
                               "the room (theatre, everything else under it); what you keep is below. Elsewhere, blocks of "
                               "recommended videos go. Leaving focus mode puts it all back.",
    "zenith.plus.focus-video-search": "The search box stays; the home page is just a search box, with the cursor in it.",
    "zenith.plus.focus-video-description": "The video's description and its chapters stay under the video.",
    "zenith.plus.focus-video-playlist": "A playlist or course you're watching stays, under the video (never beside it).",
    "zenith.plus.focus-video-comments": "Comments stay, folded behind a Show comments button.",
    "zenith.plus.focus-video-subscriptions": "The side menu, with only your channels (and Home and Subscriptions); Shorts still go.",
    "zenith.plus.focus-skip": "Sites focus mode leaves as they are (a site covers its subdomains). The pill's Not on this "
                              "site adds to the list; remove one with its ✕.",
    "zenith.plus.cookie-notices": "The first time Zenith does something on a site (this run of Zen): a banner refused or "
                                  "hidden, or cookies blocked beyond what Firefox blocks on its own (No cross-site cookies, "
                                  "Only sites you allow), a notice says so, with Undo: the site is left alone (its banner "
                                  "back, or its cookies allowed), so no site stays broken by it. Nothing from private "
                                  "windows is kept.",
    "zenith.tabs.attention-for": "Alerts: a tab waiting on a dialog. Changed titles: a background tab whose title changed "
                                 "(a pinned mail or chat tab with something new).",
    "zenith.plus.link-hints": "Alt+J puts a few letters on every link, button and field you can see; type them to "
                              "follow it, Backspace to take a letter back, Esc to stop. Alt+Shift+J opens a link in a "
                              "new tab in the background.",
    "zenith.plus.local-ai": "Turns on the AI built into Firefox (Zen keeps it off) for the two things below. It runs "
                            "on this computer, in a process of its own: nothing you download or open is sent anywhere. "
                            "Each model is fetched from Mozilla once, the first time it's needed (about 380 MB for "
                            "names, 60 MB for topics). Turning it off gives Firefox's setting back.",
    "zenith.plus.ai-download-names": "When a download with a name like IMG_20241012_0931.jpg or 8f3a2c1e.pdf finishes, "
                                     "the page it came from gives it a clearer one: offered on a notice, or given at once "
                                     "with Undo. Names that already say something are left alone.",
    "zenith.plus.ai-topics": "The tab manager's Tidy up › By topic: loose tabs (in this space, or every space) sorted "
                             "into groups by what they're about, named by the words their titles share. Nothing moves "
                             "until you put a group into a folder.",
    "zenith.plus.fast-start": "When Zen starts, the look, the keys and the page you were on come first; the switcher, "
                              "Peek, the tab manager, bookmarks and the other extras start a part at a time right after "
                              "the page has loaded (within a few seconds). Use one early and it starts at once. Takes "
                              "effect the next time Zen starts.",
    "zenith.plus.sine-mods-first": "In Sine's mods page, your mods come first and the marketplace folds away.",
}

# Buttons on the page that open something of Zen's, with no setting behind
# them (property names are only ids).
# A caution shown under a setting, highlighted (something that can surprise
# you later, like a setting overriding another).
WARNINGS = {
    "zenith.plus.blend": "Overrides your theme: while it's on, the glass shows the page's colour instead of your "
                         "space's. If colours aren't what you expect, check this first.",
    "zenith.plus.extension-copies": "Experimental. A copy doesn't update itself (right-click it › Refresh from the "
                                    "original), loads a moment after Zen starts, may not talk to the extension's desktop "
                                    "app, and Firefox lists it as temporary.",
}

ACTIONS = {
    "zenith.action.cookies": {
        "label": "Each site's cookies",
        "desc": "Every site with cookies: allow it, keep its cookies until you close Zen, block it, leave its banners alone, "
                "or delete its cookies and data (:cookies in the switcher).",
        "button": "Cookies by site",
        "command": "zenith-cookies-command",
    },
    "zenith.action.colours-image": {
        "label": "Colours from an image",
        "desc": "Pick a picture: its colours (one, two or three) become this space's colours, as in Zen's theme picker.",
        "button": "Choose an image",
        "command": "zenith-colours-image",
    },
    "zenith.action.colours-wallpaper": {
        "label": "Colours from your wallpaper",
        "desc": "The same, from the wallpaper Zenith draws behind the window (Window material: Wallpaper).",
        "button": "Use the wallpaper",
        "command": "zenith-colours-wallpaper",
    },
    "zenith.action.colours-undo": {
        "label": "Put the colours back",
        "desc": "The space's colours from before the last picture or wallpaper (:colours undo in the switcher).",
        "button": "Undo colours",
        "command": "zenith-colours-undo",
    },
    "zenith.action.space-routing": {
        "label": "Space routing",
        "desc": "Zen's Space routing sends links from other apps (and any site you choose, like a login page) to a "
                "space, and so to that space's container.",
        "button": "Space routing",
        "command": "cmd_zenOpenSpaceRoutingSettings",
    },
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
    "zenith.plus.see-through-pages": "See-through Zen pages",
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
    "zenith.plus.key-switch-flash": "Show the sidebar on key switches",
    "zenith.plus.workspace-dots": "Workspace dots",
    "zenith.plus.workspace-flash": "Workspace flash",
    "zenith.tabs.badge-only": "Extension buttons only with a badge",
    "zenith.tabs.pin-mark": "Pin mark",
    "zenith.plus.space-colour": "Space colour",
    "zenith.plus.palette-sync": "Palette sync",
    "zenith.plus.palette-spaces": "Palette colours",
    "zenith.plus.colour-strength": "Colour strength",
    "zenith.plus.unpinned-groups": "Groups that don't pin",
    "zenith.plus.ready-pulse": "Background tab ready",
    "zenith.plus.more-menu": "More submenu",
    "zenith.plus.scroll": "Scroll feel",
    "zenith.plus.switcher-scope": "Finds tabs in",
    "zenith.plus.ctrl-tab": "Ctrl+Tab",
    "zenith.plus.bookmarks-bar": "Bookmarks bar",
    "zenith.plus.bookmarks-look": "Bookmarks look",
    "zenith.plus.bookmarks-place": "Where they open",
    "zenith.plus.bookmarks-space-first": "This space first",
    "zenith.plus.bookmarks-library": "In Zen's Library",
    "zenith.plus.bookmarks-import": "Import button",
    "zenith.panels.menu-icons": "Menu icons",
    "zenith.panels.tab-preview": "Tab previews",
    "zenith.plus.switcher": "Switcher (Alt+W)",
    "zenith.plus.focus-key": "Focus mode (Alt+Z)",
    "zenith.plus.tab-manager": "Tab manager (Alt+Shift+T)",
    "zenith.plus.tabs-auto-sleep": "Sleep on their own",
    "zenith.plus.tabs-auto-close": "Close on their own",
    "zenith.plus.external-links": "Where they open",
    "zenith.plus.blend": "Blend with the page",
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
    "zenith.plus.fast-start": "Fast start",
    "zenith.plus.link-hints": "Link hints",
    "zenith.plus.focus-pages": "Pages in focus mode",
    "zenith.plus.focus-skip": "Sites left alone",
    "zenith.plus.focus-video": "Video sites",
    "zenith.plus.focus-video-search": "Search",
    "zenith.plus.focus-video-description": "Description and chapters",
    "zenith.plus.focus-video-playlist": "Your playlist",
    "zenith.plus.focus-video-comments": "Comments",
    "zenith.plus.focus-video-subscriptions": "Subscriptions",
    "zenith.plus.cookie-notices": "Notices with Undo",
    "zenith.plus.ai-topics": "Tabs by topic",
    "zenith.tabs.attention-for": "Dots for",
    "zenith.plus.float-above": "Stays above",
    "zenith.plus.startpage": "Start page",
    "zenith.plus.startpage-weather": "Weather",
    "zenith.plus.startpage-weather-history": "Weather history",
    "zenith.plus.startpage-bookmarks": "Bookmarks",
    "zenith.plus.startpage-top": "Most visited",
    "zenith.plus.pip-extras": "Move and tuck",
    "zenith.plus.pip-within": "Within",
    "zenith.plus.switcher-peek": "Peek in the switcher",
    "zenith.plus.switcher-colon": ": opens it",
    "zenith.plus.download-delete": "Delete button",
    "zenith.plus.extension-copies": "Extension copies",
    "zenith.plus.cookie-banners": "Banners",
    "zenith.plus.cookie-banners-skip": "Sites left alone",
    "zenith.plus.cookie-policy": "Which cookies",
    "zenith.plus.cookie-keep": "Kept",
    "zenith.plus.float-tab": "Float a tab",
    "zenith.plus.local-ai": "Local AI",
    "zenith.plus.ai-download-names": "Download names",
}
