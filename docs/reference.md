# Zenith design reference

What Zenith follows when it changes how things look or behave. Each rule says where it comes from. When this document and the code disagree, the code is wrong or this document needs a dated change.

## 1. Principles

- **One rule, one helper.** Any concept used by more than one surface gets a single helper, and every surface reads it. Examples: what counts as this space's tabs, what's playing, a tab's state marks. The essentials bugs (0.16.2 and 0.16.3) came from four separate copies of "this space".
- **Zen's model first.** Where Zen has a rule (essentials, folders, split groups, Glance), Zenith reads Zen's state or calls Zen's API. It never keeps a parallel guess. Zen's sources are in omni.ja (`modules/zen/ZenSpaceManager.mjs`, `zen-components/ZenViewSplitter.mjs`, `ZenGlanceManager.mjs`, `ZenPinnedTabManager.mjs`, `modules/zen/media/ZenMediaController.sys.mjs`).
- **Options as settings.** Each alternative becomes a value of one setting, with a default. Ambiguous behaviour is asked about before it is built.
- **Checks look at what's drawn.** A check that only reads state can pass while the user sees nothing (the Peek prompt bug in 0.16.1). Every UI check asserts visibility with `elementFromPoint` or a screenshot, and is run with the user's own prefs as well.
- **Fast by default.** No hover previews that rewrite many settings, no animation on keyboard-driven overlays, and work is built ahead at idle.

## 2. Tabs and spaces

**Invariants for essentials.** Source: Zen's `_shouldShowTab`, `getEssentialsSection`, `switchTabIfNeeded`; `zen.workspaces.separate-essentials` (true by default).

1. An essential belongs to the spaces of its container. A space with no container shows the essentials of containers that no space has.
2. `gBrowser.tabs` holds only the active space and its essentials. Code that needs every space uses `gZenWorkspaces.allStoredTabs`, filtered with `ZenithSpaceTabs.shows(tab, space)`.
3. Going to a tab always goes through `ZenithSpaceTabs.go(tab)`, which calls `switchTabIfNeeded`. It never sets `gBrowser.selectedTab` directly.
4. Every surface that lists a space's tabs shows that space's essentials, first and marked: the bar, its list, the overview, the switcher, the Dash counts, the tab manager and the start page.
5. Splitting an essential makes a copy of it (Zen's `splitTabs`). Splitting without a copy crashes in Zen's own code, so the copy stays (§8).

**Tab state marks.** The sidebar and the bars use one vocabulary, read from the tab:

| State | Read from | Mark |
|---|---|---|
| essential | `zen-essential` | the essentials group first, a small diamond |
| pinned | `pinned` without `zen-essential` | pin group, a dot |
| folder | `tab.group` (Zen folder), `group.collapsed` | a bracket or line spanning the folder's tabs; a collapsed folder shows as one chip |
| split | `gZenViewSplitter._data` | the split's tabs joined |
| playing / muted / paused | `soundplaying`, `muted`, the media hub | the same icons as the sidebar |
| sleeping | `pending` | dimmed (78%) |
| attention / loading | `attention`/`titlechanged`, `busy` | a dot, a spinner |
| container | `identity-color-*` | the container hint setting |

## 3. Media (one hub)

**Sources:** Firefox's MediaController and AudioFocusManager; Zen's ZenMediaController (one card per browser, newest first, a 1 s guard); playerctld (most recent wins); Chrome Global Media Controls and GNOME (a list); KDE's multiplexer (keeps the current source). No reference limits media to a workspace.

- **One `MediaHub` per window**, read by the bar, the hover player, the Dash, Media art, the tab marks and the space marks. It tracks every tab in every space (`allStoredTabs`), the Peek's browser, and float or scratchpad windows.
- **Default rank:**
  1. Audible and playing, the newest start first.
  2. Playing but muted.
  3. Paused, the latest activity first.
- A muted or paused source never displaces an audible one. A sound under 1 s never counts.
- Clicking a source goes to it with `ZenithSpaceTabs.go`.
- When the shown source stops or closes, the hub falls back to the next source by rank. It never hides while something still plays.
- Playback controls follow `supportedKeys`. An autoplay-blocked source shows as waiting, and play calls `resumeDelayedMedia()`.

## 4. Peek (a fast Glance)

**Sources:** Zen's Glance (Alt+click; Esc closes it; it can be expanded to a tab or split), Arc's Peek (Esc or Ctrl+W closes it; Ctrl+Enter or "open" promotes it to a tab), Safari's Quick Look.

The contract:

- **Opening:** a link combo, Alt+Q or a lookup. The page is visible in ≤ 100 ms, with no animation when opened by key. A browser is prewarmed at idle.
- **Keys act on the Peek** while it is open: Ctrl+W and Esc close it, Ctrl+L and F4 edit its address, Ctrl+F finds in it, F5 and Ctrl+R reload it, Alt+Left and Alt+Right (and the mouse's side buttons) go back and forward, zoom keys zoom it, Ctrl+Enter promotes it to a tab, and Alt+Shift+Enter promotes it to a tile.
- **Links inside** stay in the Peek, whatever keys are held, including middle clicks and links to new windows (§8).
- The tab beneath is never affected by keys while a Peek has focus.

Done in 0.16.3: Ctrl+W, F5, Ctrl+R, Ctrl+Shift+R, the zoom keys and links inside (Esc, Ctrl+L, F4, Alt+Left, Alt+Right and Ctrl+Enter were done before). 0.18.0: every Firefox command a key runs acts on the Peek (print, save, view source, bookmark…), Ctrl+F/F3/Ctrl+G a find bar of its own. Not done yet: opening in ≤ 100 ms (about 355 ms now), Alt+Shift+Enter, DevTools (it needs a tab).

## 5. Split views and layouts

**Sources:**
- Hyprland dwindle: a new window splits the focused one along its longer side; `preserve_split`; closing a window gives its space to its sibling.
- Hyprland master: a new window goes to the stack, or becomes the master with `new_status`.
- i3: a new window goes next to the focused one in its container.
- niri: a new window becomes a new column right of the focused column; closing scrolls the strip to keep the focus in view.

Rules:

1. When the focused tab is in a split, a new tab (Ctrl+T, a link to a new tab, `window.open`, or Zenith's new tab) becomes a tile of that split, placed by the space's layout, up to the split's tile limit. Past the limit it opens as a normal tab next to the split. Background-opened links (Ctrl+click, middle-click) become tiles too, or normal tabs as a setting (Tiling and keys › Links opened in the background from a split).
2. Closing a tile hands its space to the layout. Dwindle gives it to the sibling, master promotes the stack's first tile when the master closes, the scroller removes the column and slides the strip, and monocle shows the next tile.
3. Layout code works on Zen's `layoutTree` and calls `applyGridLayout`. It never leaves a tab outside a split that the layout believes holds it.
4. An essential in a split: the decision in §8.

**niri strip (scroller v2), 0.17.0.** Every non-pinned tab of a space is a column on one horizontal strip, not limited by Zen's split. Built on Zen's split (one split holds the space's tabs, its tile limit lifted for that space), so Zen still draws, saves and restores it; another layout gives the tabs back. Columns out of sight are hidden and their pages asleep (but loaded: entering a strip loads the space's tabs). Not done yet: the overview drawing the strip's widths; the wheel over the gap (Alt with a sideways wheel instead). Column widths come from presets (⅓, ½, ⅔, full). The focused column is kept in view, or kept centred as a setting. A new tab is inserted right of the focused column. Alt+H and Alt+L walk the strip, the wheel or a two-finger swipe over the gap scrolls it, and the overview shows the strip.

## 6. Bars (Hyprland-style tokens)

**Sources:** waybar `style.css` rices on r/unixporn, HyprPanel, end-4's illogical-impulse, caelestia, ML4W, HyDE.

These rices differ along a small set of tokens:

| Token | Values |
|---|---|
| background | solid / translucent (0–100 %) / none (modules float on the page or wallpaper) |
| shape | full strip / floating strip (margins) / islands (one pill per group) / pills (one per module) / powerline |
| thickness | px slider (was 24, 30 or 36) |
| length | full / fit content / % of the edge, with alignment start, centre or end |
| margin | px from the window's edges (a floating bar) |
| radius | bar, groups and modules, separately |
| spacing | between modules and between groups |
| separators | none / line / dot / arrow / round / slant |
| border | width, colour (accent or ink), opacity |
| workspaces | numbers / dots / a stretching pill / icons / kanji / roman |
| icons | Zenith's / Nerd Font / text |
| font | any installed font (see §7) |

**Floating needs company (0.17.0).** A bar only looks afloat when what's around it floats too, as Hyprland's windows and bar share gaps on the wallpaper: with Floating or Bare the page floats as well (8px gaps, 12px corners, one shadow), unless Theme › Page frame is Zen's. Islands are one island per group (start, end), not a bordered box per module.

Done in 0.16.4: the looks Islands, Floating, Bare, Strip, Minimal and Powerline, each a starting point the Bars › Look and size and Fine-tuning the shape settings override: thickness (20–48px), length (whole edge, fit, 80%, 60%), margin, the bar's corners, background opacity (to none), module corners, spacing, border (none, hairline, accent) and separators (none, line, dot). Not done yet: alignment of a shorter bar, separate group corners, the arrow, round and slant separators, workspace and icon styles.

**Powerline.** One segment per group, and the arrow joins segments of different colours, without gaps or overlaps at any thickness. Nothing rounded sits inside it. On side bars the segments are plain rows with no arrows (a rail is too narrow for them). The current tab is its own segment.

**Bar tabs** show the marks in §2. Done in 0.16.4: essentials and pinned tabs first, after a hairline; a folder's tabs on one shared tile; a dot for sound or attention; a pulse while loading. Not done yet: splits as joined chips, a collapsed folder as one chip.

## 7. Look (Theme)

**Sources:** Vivaldi's theme editor (named bundles with export), KDE Global Themes (look apart from layout), HyDE and wallbash and matugen (wallpaper → palette with variants), Windows Personalization (few top-level dials).

- **One Theme section** with:
  - theme cards (built-ins plus yours; Save as, Export, Import);
  - six dials: colours, wallpaper, transparency, corners and spacing, fonts, bar look;
  - collapsed Details.
- **A theme changes look settings only.** Layout is applied only when you opt in.
- **Themes are files** in `~/.config/zenith/themes/<name>.conf` (rice syntax). The rice file says `theme = <name>` plus your overrides.
- **One "from wallpaper" path.** Its variants are vivid, pastel, muted and mono; its scope is every space or this space. Zen's per-space picker remains available as the "each space's own" source.
- **Transparency** is one master step, plus a per-surface offset for the sidebar, bars, panels and URL bar.
- **Fonts** have three roles: UI, Bar and Monospace. Each is any installed font, picked from a searchable list drawn in its own face (`fontenumerator.EnumerateAllFontsAsync`) and applied with `!important`.

Done in 0.16.4: the rice picker and the one optional font (below). Not done yet: themes as files (saved themes are kept in a setting for now), Export and Import, wallpaper variants, per-surface transparency, Bar and Monospace fonts.

**The rice picker.** The main way to change the look is a large centred popup, as Linux rice switchers do (HyDE's theme selector, ML4W's settings app, end-4's illogical-impulse settings, caelestia's launcher pickers, nwg-look). It opens from a key, the Dash or settings.
- **Left side:** categories (Themes, Colours, Glass, Bars, Shape, Font; Wallpaper is planned).
- **Right side:** a grid of choices, each a picture.
- Every click applies at once, so you see the result live. Esc closes the picker and keeps the result; "Revert" undoes all changes since it opened.
- The Theme section in settings holds the same controls and the details.

**Fonts.** The browser UI uses one font, Windows' system font (Segoe UI). Zen sets no font of its own, and Zenith's bars use monospace. There is one optional setting, "Font": system default, or any installed font, picked from a searchable list. The bars follow it, unless the bar keeps a monospace look.

## 8. Decisions log

2026-11-02, for 0.18.0:
- Essential split: refused with a notice as it comes; Zen's copy as a setting. Zen's split keeps its tabs in a tab group, which an essential can't join.
- Bars: a display mode per bar (takes its room, over the page, hides); in full screen, hidden until reached as it comes.
- Glance's and Peek's buttons placed (no hiding), with a reload button.
- Code: Zenith Plus in parts built into one script (not separate ES modules: the parts share one scope, so nothing changes at run time).
- Inspiration code may be copied and adapted (the user's word), keeping its licence and notice; Vitreus (MIT) has none that runs in Zen.

2026-11-01, the user's review of 0.16.4 (bars, picker and settings disliked):
- Floating didn't look afloat: the page now floats with it. Islands grouped, no borders. Rails show icons only.
- The picker: Glass and Shape were empty (Core's settings weren't read); previews are tiny windows in each theme's palette and look; words are segmented rows, not cards; the category you're on in full ink with an accent bar.
- Settings: too many settings with no way to tell them apart, the bar split in two, Bars 9th. Now 12 sections in order of use (Theme, Bars, Sidebar and tabs, Tiling and keys, Tools, Peek, Pages and privacy, Edges, Panels, URL bar, Motion, Speed and AI), each group a short line saying what it's for, fine-tuning groups closed until opened (search opens them).

2026-11-01:
- Essential split: both behaviours were to be a setting. Tested: "no copy" crashes in Zen's own code (its unfinished path for essentials in splits), so Zen's copy stays.
- Audio: by default the newest audible source wins and every source keeps playing. "Keep the one I chose" is a setting; "One at a time, resume" is not built yet.
- Peek: clicks inside a Peek always stay inside it, including Ctrl+click and middle-click.
- Split: every new tab opens as a new tile. A setting lets background links (Ctrl+click, middle-click) stay normal tabs.
- niri: a real strip, not limited by Zen's split (its own milestone).
- Look: the rice picker popup above, plus the Theme section in settings.
- Bars: tokens, with presets.
- Fonts: one optional font setting, kept simple.

## 9. Coverage: every request → where it's done

M1 shipped in 0.16.3, M2 and M3 in 0.16.4; M4, and a rework of M2 and M3 after the user's review, in 0.17.0.

| # | Request | Milestone | Done when | Status |
|---|---|---|---|---|
| 1 | Split on an essential duplicates it | M1 | A setting: no copy (default) or Zen's copy; the check counts tabs after a split | Not possible: Zen crashes without the copy (§8) |
| 2 | The player misses music in another space | M1 | The media hub; the check plays music in space B and looks at the bar in space A, after a rebuild too | 0.16.3 |
| 3 | Several audio sources | M1 | Rank, list, dots or count, switching; "one at a time" as a setting | 0.16.3, without "one at a time" |
| 4 | The overview leaves out essentials | M1 | Each space's row starts with its essentials | 0.16.3 |
| 12 | Peek: fast, nothing broken | M1 | Every key in §4 checked visibly; ≤ 100 ms to the page, measured | Partly, in 0.16.3 (§4) |
| 14 | Split: new tabs outside, broken layout, closing | M1 | §5 rules 1–3, for each layout, checked | Rule 1 in 0.16.3; rules 2–3 not checked per layout yet |
| 13 | Bar tabs marked like the sidebar | M2 | The §2 marks table, on top, bottom and side bars | 0.16.4, without joined splits |
| 7 | Hyprland-style bars | M2 | The §6 tokens, plus presets that reproduce 6 named rice styles from screenshots | 0.16.4: 6 looks, 7 themes in the picker (§6 lists what's left) |
| 8 | Powerline gaps, overlaps, roundness | M2 | Screenshots at every thickness and on every edge show no gaps or overlaps | 0.16.4 |
| 9 | Bar width and height | M2 | Thickness and length sliders | 0.16.4 (as choices) |
| 10 | Sidebar and bar settings together | M2 | One "Tabs" section for the sidebar and bars (looks, marks, containers, previews), one "What's playing" section | 0.17.0: Bars holds everything about bars (their tabs and player too), Sidebar and tabs the sidebar |
| 5 | Look in one place | M3 | The rice picker popup, the Theme section, themes as files | 0.16.4, themes kept in a setting |
| 11 | Font | M3 | One font setting with a picker | 0.16.4 |
| 6 | niri scrollable tabs | M4 | The §5 strip: all of a space's tabs as columns, checked with 20 tabs | 0.17.0 (checked with 11; the overview doesn't draw column widths yet) |

## 10. References

Tiling and the strip:
- niri, scrollable tiling, and its layout configuration: https://github.com/YaLTeR/niri and https://github.com/YaLTeR/niri/wiki/Configuration:-Layout
- PaperWM (the GNOME original of scrollable tiling): https://github.com/paperwm/PaperWM
- Hyprland's dwindle and master layouts: https://wiki.hyprland.org/Configuring/Dwindle-Layout/ and https://wiki.hyprland.org/Configuring/Master-Layout/
- i3 user's guide (containers, where new windows go): https://i3wm.org/docs/userguide.html
- Zen's split view and Glance: Zen's own code in omni.ja (ZenViewSplitter.mjs, ZenGlanceManager.mjs) and https://docs.zen-browser.app

Bars:
- Waybar configuration and styling: https://github.com/Alexays/Waybar/wiki/Configuration and https://github.com/Alexays/Waybar/wiki/Styling
- Waybar's MPRIS module: https://github.com/Alexays/Waybar/wiki/Module:-MPRIS
- HyprPanel: https://hyprpanel.com
- end-4's illogical-impulse: https://github.com/end-4/dots-hyprland
- caelestia shell: https://github.com/caelestia-dots/shell
- ML4W dotfiles: https://github.com/mylinuxforwork/dotfiles
- HyDE: https://github.com/HyDE-Project/HyDE
- Rices: https://www.reddit.com/r/unixporn/ (search "hyprland waybar"). The user named r/unixporn as a primary reference.
- end4-pC (the user's pick; end-4's illogical-impulse adapted): https://github.com/pctrade/end4-pC
- https://github.com/avtzis/awesome-linux-ricing

Look and themes:
- Vivaldi themes: https://help.vivaldi.com/article/browser-themes/
- KDE Global Themes: https://docs.kde.org/stable_kf6/en/plasma-workspace/kcontrol/lookandfeel/
- HyDE wallbash: https://hydeproject.pages.dev/en/theming/wallbash-and-dcol
- matugen: https://github.com/InioX/matugen
- pywal16: https://github.com/eylles/pywal16
- the ML4W settings app: https://github.com/mylinuxforwork/dotfiles/wiki/ML4W-Dotfiles-Settings-App
- end-4's settings: https://ii.clsty.link/en/ii-qs/03config/

Media:
- Firefox's media control service: https://searchfox.org/mozilla-central/source/dom/media/mediacontrol/MediaControlService.h
- Chromium Global Media Controls: https://chromium.googlesource.com/chromium/src/+/main/components/global_media_controls/
- playerctl and playerctld: https://github.com/altdesktop/playerctl
- KDE's MPRIS multiplexer: https://invent.kde.org/plasma/plasma-workspace/-/raw/master/libkmpris/multiplexer.cpp
- GNOME Shell's mpris.js: https://gitlab.gnome.org/GNOME/gnome-shell/-/raw/main/js/ui/mpris.js
- Windows media sessions (GSMTC): https://learn.microsoft.com/en-us/uwp/api/windows.media.control.globalsystemmediatransportcontrolssessionmanager

Peek:
- Arc's Peek and Little Arc: https://resources.arc.net (its help centre; the exact articles are still to be fetched)
- Zen Glance: the source above, and Zen's GitHub issues tagged glance: https://github.com/zen-browser/desktop/issues?q=glance
