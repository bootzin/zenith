# Zenith

A quiet, minimal look for [Zen Browser](https://zen-browser.app). Things appear when you need them and stay out of the way otherwise. Nothing is removed, only tucked away. Inspired by minimalist Linux rice setups.

Zenith comes in two parts.

**Zenith** is six CSS mods. Use the ones you like.

| Mod | What it does |
|---|---|
| Core | Shared colours, sizes, transparency and the page frame. The other mods need it. |
| Edges | Hairline status edges: loading, downloads, containers, sharing, private windows and not-secure pages. |
| Tabs | A tight sidebar with only the signals that matter: sleeping tabs, an audio equaliser, folder activity and numbered tabs. |
| URL bar | A floating URL bar with dense results. |
| Panels | The find bar, the Library card, the link pill, Glance, split view, notifications and menus. |
| Motion | Quick or Smooth motion, a crossfade between tabs, and swipe animation. |

**Zenith Plus** adds what CSS alone can't do. It needs scripts.

- **Peek:** quick lookups in a floating page that leaves nothing behind, with Alt+Q and instant answers.
- **Live edges:** real load and download progress.
- **Peek extras:** currency, definitions and weather in the prompt, plus timers and pomodoros.
- **Sidebar extras:** a minimap of the hidden sidebar, numbered tabs while you hold Ctrl, and the cover art of what's playing behind the media card.
- **Pages:** zoom pills, plus text selection in the workspace colour.
- **Settings:** a helper that greys out options that don't apply, and puts your mods ahead of the marketplace in Sine's page.

## Install

Zenith is built and tested on Windows 11 with Zen. It's plain CSS and standard Firefox features, so it should work on macOS and Linux too, but that hasn't been tested yet.

- **Zenith:** from Zen's mod store (Settings › Zen Mods).
- **Zenith with Plus:** with [Sine](https://github.com/CosmoCreeper/Sine). In Sine's settings, install from GitHub with `bootzin/zenith/tree/master`. Sine lists it as one mod, **Zenith**, with all six areas and Plus; its settings are grouped by area. Until Zenith is in Sine's store, Sine only runs Plus's scripts with **Allow JS from unofficial sources** on.
  - Installed the separate Zenith mods from `.../tree/master/plus` before 0.7.2? Remove all seven in Settings › Sine Mods (your settings stay), then install `bootzin/zenith/tree/master` and restart Zen.
- **Manual (fallback, Windows):**
  1. Download `zenith-<version>-manual.zip` from [Releases](../../releases).
  2. Follow `INSTALL.txt`. This uses fx-autoconfig as the script loader.
  3. To undo it: `tools\install.ps1 -Restore`.

## What Zenith Plus can access

Zen scripts run inside the browser with full access, like every script mod. Zenith Plus collects nothing and sends nothing about you. It loads no remote code, and the source is plain, readable JavaScript in [`plus/scripts`](plus/scripts).

The network requests it causes:

- **Peek:** the pages you choose to open in it.
- **Peek's web answers** (switch off with "Peek answers from the web"): after you type a `$`, `d` or `wt` lookup, the currencies go to [Frankfurter](https://frankfurter.dev) (European Central Bank rates), the word to Wiktionary, and the place to [wttr.in](https://wttr.in). For `wt` alone, wttr.in works out roughly where you are from your connection, as any website can; no location permission is used. Your recent places (up to five) stay on your computer, and `wt` refreshes them from wttr.in.
- **Cover art** behind the media card: fetched from the site that's playing, without cookies.

Specific things it changes:

- `ui.prefersReducedMotion`: set to 0, so Zen animates, while "Let Zen and Zenith animate" is on. It's cleared when you switch that off.

## Development

- **Layout:** one folder per mod at the top (`core/`, `edges/`, `tabs/`, `urlbar/`, `panels/`, `motion/`), `plus/` holds Zenith Plus, and `tools/` holds the build, check and install scripts.
- **Generated:** `chrome.css`, `preferences.json` and `theme.json` at the top are the one Sine mod, built from the folders by `python tools/package.py . --owner bootzin`. Don't edit them by hand; run that before every push.

## Credits

- [fx-autoconfig](https://github.com/MrOtherGuy/fx-autoconfig) by MrOtherGuy (MPL-2.0), vendored in `vendor/fx-autoconfig`.
- [Sine](https://github.com/CosmoCreeper/Sine) (MPL-2.0), vendored in `vendor/sine` for testing.
- Several ideas come from mods Zenith replaces: Trackpad Animation, Load Bar, Better Unloaded Tabs, Audio Indicator, Floating Status Bar, Private Mode Highlighting, Container Halo, Better Find Bar, Floating History and Vertical Split Tab Groups.
- Made with the help of AI.
