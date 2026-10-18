# Zenith

A quiet, minimal look for [Zen Browser](https://zen-browser.app). Things appear when you need them and stay out of the way otherwise. Nothing is removed, only tucked away. Inspired by minimalist Linux rice setups.

Zenith comes in two parts.

**Zenith** is six CSS mods. Use the ones you like.

| Mod | What it does |
|---|---|
| Core | Shared colours, sizes, transparency, the glass edge and the page frame. The other mods need it. |
| Edges | Hairline status edges: loading, downloads, containers, sharing, private windows and not-secure pages. |
| Tabs | A tight sidebar with only the signals that matter: sleeping tabs, an audio equaliser, folder activity and numbered tabs. |
| URL bar | A floating URL bar with dense results. |
| Panels | The find bar, the Library card, the link pill, Glance, split view, notifications and menus. |
| Motion | Quick or Smooth motion, a crossfade between tabs, and swipe animation. |

**Zenith Plus** adds what CSS alone can't do. It needs scripts.

- **Peek:** quick lookups in a floating page that leaves nothing behind, with Alt+Q and instant answers.
- **Live edges:** real load and download progress.
- **Peek extras:** currency, definitions and weather in the prompt, timers and pomodoros, and `set` to find a setting, change it, or open it in the live panel.
- **Switcher:** **Alt+W** jumps to any tab (in any space), folder or space by typing a few letters; `:` runs commands (`:focus`, `:tabs`, `:bookmarks`, `:timer 10m tea`, `:set frost`, `:colours`).
- **Tab manager:** **Alt+Shift+T** opens `about:zenith-tabs`: every space's tabs in columns with tick boxes and the memory each awake tab uses, to move between spaces (whole folders too), put into folders or groups, take out again, sleep, wake or close, each with Undo; tidying up (duplicates, tabs you haven't used for days, awake tabs heaviest first, busy sites), each a ticked list; and rules that group tabs into folders or groups, or put them to sleep or close them after a while, only once you set them. Or the same page, compact, in a card over the page.
- **Bookmarks:** **Ctrl+B** opens your bookmarks in Zenith's look, floating over the right of the page (or docked on either side): rows like the tab list or tiles, this space's bookmarks first, drop a tab on it to bookmark it. Also a section in Zen's Library; Firefox's Library window in Zenith's colours.
- **Ctrl+Tab with pictures** (optional): in the sidebar's order or recently used, like Alt+Tab; Ctrl+Shift+Tab goes back.
- **Groups that don't pin:** a Zen folder can be set so its tabs act unpinned (Ctrl+W closes them, they keep the page they're on); or, instead, Firefox's tab groups under the pinned tabs, with split views kept whole.
- **Focus mode:** **Alt+Z** hides the sidebar, edges and pills for reading or video.
- **Sidebar extras:** the page pushed aside by exactly the sidebar's width (Revealed sidebar › Push the page), workspace dots and a flash in the new space's colour, extension buttons that show only in their space, a minimap of the hidden sidebar, numbered tabs while you hold Ctrl, and the cover art of what's playing behind the media card.
- **Menus:** rare right-click items (view source, send to device and so on) in a More submenu, nothing removed; optional icons on the items you use most; Firefox's tab previews in Zenith's look.
- **Bookmarks bar:** where Zen puts it, or its own slim strip above the page, or over the page when you reach the top; Firefox's "Import bookmarks" button hidden.
- **Links from other apps:** optionally ask which space (and container) each one opens in, and remember the answer as a Space routing rule; Zen's Space routing dialog gets "Ask me each time" for any rule and for the default.
- **Colours:** the glass shows a space's whole gradient at a strength you choose; a space's colours from an image or your wallpaper (with Undo); optionally, the glass takes the colour of the page you're on.
- **Scrolling:** one setting for how the mouse wheel and keys scroll: Zen's own, instant, quick, smooth or macOS-like.
- **Pages:** zoom pills, plus text selection in the workspace colour.
- **Settings:** a Zenith page in Zen's Settings with every option explained, presets that fill in what they cover, and pictures for looks; the same settings as a live panel over the page (**Alt+Shift+Z**). Also greys out options that don't apply, and puts your mods ahead of the marketplace in Sine's page.
- **Window:** the window material (Windows: your wallpaper drawn behind the window so Frost applies there too, each screen's own, or Acrylic, Mica, Mica Alt; macOS: its materials; Linux: see-through), optional see-through Zen pages (Settings, Add-ons, about: pages), and the liquid glass edge that lights up under the pointer.

## Install

Zenith is built and tested on Windows 11 with Zen. It's plain CSS and standard Firefox features, so it should work on macOS and Linux too, but that hasn't been tested yet.

- **Zenith:** from Zen's mod store (Settings › Zen Mods).
- **Zenith with Plus:** with [Sine](https://github.com/CosmoCreeper/Sine). In Sine's settings, install from GitHub with `bootzin/zenith/tree/master`. Sine lists it as one mod, **Zenith**, with all six areas and Plus; its settings are grouped by area. Until Zenith is in Sine's store, Sine only runs Plus's scripts with **Allow JS from unofficial sources** on.
  - Installed the separate Zenith mods from `.../tree/master/plus` before 0.7.2? Remove all seven in Settings › Sine Mods (your settings stay), then install `bootzin/zenith/tree/master` and restart Zen.
- **Manual (fallback, Windows):**
  1. Download `zenith-<version>-manual.zip` from [Releases](../../releases).
  2. Follow `INSTALL.txt`. This uses fx-autoconfig as the script loader.
  3. To undo it: `tools\install.ps1 -Restore`.

## Platforms

Zenith is built and tested on **Windows 11**. It's plain CSS and standard Firefox features, so it should work on **macOS** and **Linux**, but those haven't been tested yet: if something looks off, please open an issue with a screenshot.

**Windows 11**
- Zenith › Look › Window material picks what shows behind the docked sidebar and around a rounded page (in compact mode the page fills the window):
  - **Wallpaper** (the default, with Zenith Plus): your desktop wallpaper, drawn by Zenith exactly where it sits on the screen. Frost and Window transparency work on it as they do over the page, so the docked sidebar matches the floating one. With several screens, each shows its own wallpaper, even with the window across two. A new wallpaper shows within 15 seconds. Windows behind Zen don't show through.
  - **Acrylic:** Windows' blur of the windows behind, at one fixed strength. **Mica** and **Mica Alt:** Windows' wallpaper tint. **Automatic**, **Zen's own** or **None**.
- Nothing to turn on in about:config: Zen's transparency on Windows is on by default.
- Windows only draws Acrylic while Zen is the active window, and flat grey otherwise; Zenith shows your workspace colour then instead.
- Prefer seeing the windows behind Zen, blurred? Pick Acrylic, or use MicaForEveryone (add a rule for the `zen` process, backdrop Acrylic, "blur behind" on) and pick Zen's own. Either way Windows does that blur, at its own strength.

**macOS**
- Window material picks the macOS material behind Zen (HUD is Zen's default) or turns it off.
- Numbered tabs follow **Cmd** (Cmd+1–9 switches tabs on macOS).
- The strip with the window buttons is left as Zen draws it.

**Linux**
- Zenith › Look › See-through window turns on Zen's transparency (`zen.widget.linux.transparency`); restart Zen after changing it. The blur comes from your desktop:
  - **KDE Plasma:** install Better Blur DX (`kwin-effects-better-blur-dx`). In System Settings › Window Management › Desktop Effects, turn off Blur and turn on Better Blur DX, then add `zen` to its **Force blur** list (`zen-browser` for the AUR package).
  - **GNOME:** install the Blur My Shell extension. Under **Applications**, turn on application blur, add `zen` to the list, and turn off **Opaque focused window**.
- The manual install script is Windows-only; on Linux and macOS, install with Sine.

## What Zenith Plus can access

Zen scripts run inside the browser with full access, like every script mod. Zenith Plus collects nothing and sends nothing about you. It loads no remote code, and the source is plain, readable JavaScript in [`plus/scripts`](plus/scripts).

The network requests it causes:

- **Peek:** the pages you choose to open in it.
- **Peek's web answers** (switch off with "Peek answers from the web"): after you type a `$`, `d` or `wt` lookup, the currencies go to [Frankfurter](https://frankfurter.dev) (European Central Bank rates), the word to Wiktionary, and the place to [wttr.in](https://wttr.in). For `wt` alone, wttr.in works out roughly where you are from your connection, as any website can; no location permission is used. Your recent places (up to five) stay on your computer, and `wt` refreshes them from wttr.in.
- **Cover art** behind the media card: fetched from the site that's playing, without cookies.

Specific things it changes:

- `ui.prefersReducedMotion`: set to 0, so Zen animates, while "Let Zen and Zenith animate" is on. It's cleared when you switch that off.
- Window material, Scroll feel and Ctrl+Tab write Zen's and Firefox's own settings for them (`widget.windows.mica…`, `general.smoothScroll…`, `browser.ctrlTab.sortByRecentlyUsed`). Your earlier values are kept and put back when you choose "Zen's own" (or "In order") again.
- Colours from an image changes the current space's colours, as Zen's theme picker would; `:colours undo` in the switcher puts them back.
- "Always open … there" on the link card adds a rule to Zen's Space routing, which you can edit or remove there. "Ask me each time" in Zen's Space routing dialog is saved in Zen's own rules (Zen without Zenith reads it as "where you are").
- Groups that don't pin, set to Firefox's tab groups, turns on Firefox's `browser.tabs.groups.enabled` (Zen turns it off; your earlier value comes back) and adjusts how Zen places split views in those groups while Zen runs. A folder set to act unpinned is listed in `zenith.internal.unpinned-folders`; its tabs' pinned page follows where they go.
- Zen's own toasts ("Copied") are moved up beside Zenith's notices, so they show over Zenith's panels.
- Bookmarks: dropping a tab on the panel adds a bookmark; "this space" bookmarks go in a folder per space under Other Bookmarks › Spaces, made the first time you use it.
- The tab manager's rules and its automatic sleeping and closing act only after you set them up; what auto-close closes is listed on its page to bring back.
- `about:zenith-tabs` is a page from the mod's own folder, registered while Zen runs.
- On Windows, Wallpaper reads your wallpaper's file and position through Windows' wallpaper service; it never changes it.

## Development

- **Layout:** one folder per mod at the top (`core/`, `edges/`, `tabs/`, `urlbar/`, `panels/`, `motion/`), `plus/` holds Zenith Plus, and `tools/` holds the build, check and install scripts.
- **Generated:** `chrome.css`, `preferences.json` and `theme.json` at the top are the one Sine mod, built from the folders by `python tools/package.py . --owner bootzin`. Don't edit them by hand; run that before every push.

## Credits

- [fx-autoconfig](https://github.com/MrOtherGuy/fx-autoconfig) by MrOtherGuy (MPL-2.0), vendored in `vendor/fx-autoconfig`.
- [Sine](https://github.com/CosmoCreeper/Sine) (MPL-2.0), vendored in `vendor/sine` for testing.
- [Zia](https://github.com/z1n-k/zia) (MIT) inspired the liquid glass edge; [Natsumi](https://github.com/greeeen-dev/natsumi-browser) the window material choice, the picture-in-picture controls, the miniplayer art and the settings page; [Zen-Nebula](https://github.com/JustAdumbPrsn/Zen-Nebula) the per-platform transparency notes. No code was copied from Natsumi or Zen-Nebula.
- Several ideas come from mods Zenith replaces: Trackpad Animation, Load Bar, Better Unloaded Tabs, Audio Indicator, Floating Status Bar, Private Mode Highlighting, Container Halo, Better Find Bar, Floating History and Vertical Split Tab Groups.
- Made with the help of AI.
