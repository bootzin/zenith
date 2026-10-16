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
- **Sidebar extras:** a minimap of the hidden sidebar, and numbered tabs while you hold Ctrl.
- **Pages:** zoom pills, plus text selection in the workspace colour.
- **Settings:** a helper that greys out options that don't apply, and puts your mods ahead of the marketplace in Sine's page.

## Install

- **Zenith:** from Zen's mod store (Settings › Zen Mods).
- **Zenith Plus:** with [Sine](https://github.com/CosmoCreeper/Sine). In Sine's settings, install from GitHub with `bootzin/zenith/tree/main/plus`. That also installs Zenith's six mods. Until Zenith Plus is in Sine's store, Sine only runs its scripts with **Allow JS from unofficial sources** on.
- **Manual (fallback, Windows):**
  1. Download `zenith-<version>-manual.zip` from [Releases](../../releases).
  2. Follow `INSTALL.txt`. This uses fx-autoconfig as the script loader.
  3. To undo it: `tools\install.ps1 -Restore`.

## What Zenith Plus can access

Zen scripts run inside the browser with full access, like every script mod. Zenith Plus doesn't collect or send anything. The only network requests it causes are the pages you choose to Peek. It loads no remote code, and the source is plain, readable JavaScript in [`plus/scripts`](plus/scripts).

Specific things it changes:

- `ui.prefersReducedMotion`: set to 0, so Zen animates, while "Let Zen and Zenith animate" is on. It's cleared when you switch that off.

## Development

- **Layout:** `mods/` holds Zenith, `plus/` holds Zenith Plus, `tools/` holds the build, check and install scripts.

## Credits

- [fx-autoconfig](https://github.com/MrOtherGuy/fx-autoconfig) by MrOtherGuy (MPL-2.0), vendored in `vendor/fx-autoconfig`.
- [Sine](https://github.com/CosmoCreeper/Sine) (MPL-2.0), vendored in `vendor/sine` for testing.
- Several ideas come from mods Zenith replaces: Trackpad Animation, Load Bar, Better Unloaded Tabs, Audio Indicator, Floating Status Bar, Private Mode Highlighting, Container Halo, Better Find Bar, Floating History and Vertical Split Tab Groups.
- Made with the help of AI.
