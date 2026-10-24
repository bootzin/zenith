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

- **Zenith Shell:** the browser as a tiling window manager. i3's keys with Alt (**Alt+H/J/K/L** between tiles, **Alt+Shift+Enter** a new tile, **Alt+1…0** spaces, **Alt+R** resize, **Alt+-** the scratchpad, **Alt+P** passthrough; **Alt+Shift+/** lists them all), a link click per key combo (Alt+click Zen's Glance, **Alt+Shift+click** a tile, **Ctrl+Alt+click** Peek, each changeable), **Alt+drag** to move a tile and **Alt+right-drag** to resize it, **Alt+wheel** for the next space. Keys are matched by where they are, so they're the same on any layout, and you can change each on Zenith's page.
- **Layouts and the overview:** each space its own layout (**Alt+Y**): dwindle, master and stack (dwm's or centred), niri's scroller, monocle; **Alt+O** (or the top-left corner) shows every tab as a picture, in three looks, to go to one, close it or drag it to another space.
- **A rice file:** `~/.config/zenith/zenith.conf` in Hyprland's config language holds your setup (palette, bars, layouts, keys) to keep in dotfiles and share; the settings page writes back into it (or shows its settings locked); **Alt+Shift+C** reads it again. `:fetch` shows your setup as fastfetch would.
- **The bar:** status bars on any edge, as polybar and waybar, each with its own modules (start, middle, end, as waybar's lists, edited on Zenith's page or from a right-click on the bar): spaces, the tab you're on or all of the space's tabs (where they sit, what the wheel does), what's playing (three looks), downloads, timers, weather, memory, extensions, a clock and the window's buttons or a power menu, in four looks (islands, strip, minimal, powerline). Each bar can hide until you reach it; side bars are a rail or wide; a layout sets it all at once, and the sidebar can stay, show on hover (beside a bar on its side) or go. Off by default; nothing of it runs while it's off.
- **The Dash** (Alt+N, or the bar's clock): in one place (top middle, or where you choose): the time and the weather, a calendar, what's playing, timers, your downloads (optional), quick toggles (pages dark or light, mute all, sleep the rest, focus, compact, screenshot, palette) and what the browser uses. The bar's timers, downloads, trackers and extensions open popups in place.
- **The launcher** (Alt+D, or Alt+W for tabs; centred, dmenu-style or a grid): modes as rofi's, tabs, open (a site, a search, a bookmark), spaces, commands, calc and emoji; Ctrl+Tab steps through them. `:help` opens a help page with Try it buttons and every key.
- **Pages dark or light** at a click (the bar, the Dash, `:appearance`), your choice everywhere and a space's own; automatic follows the browser or Windows, as you choose. Pages that don't follow are inverted, automatic too (a site can be left alone) (as Dark Reader's filter mode), or drawn in your palette's colours.
- **Palettes:** one for the whole browser, as a rice's: Catppuccin, Tokyo Night, Gruvbox, Nord, Rosé Pine, Everforest, Kanagawa, Dracula, or made from your wallpaper, pywal or wallust (followed when they change). The bar, the accent, every space, and Zen light or dark to match. Your own colours come back when you pick none.
- **Peek:** quick lookups in a floating page that leaves nothing behind, with Alt+Q and instant answers.
- **Live edges:** real load and download progress.
- **Peek extras:** currency, definitions and weather in the prompt, timers and pomodoros, and `set` to find a setting, change it, or open it in the live panel.
- **Switcher:** **Alt+W** jumps to any tab (in any space), folder or space by typing a few letters; `:` runs commands (`:focus`, `:tabs`, `:bookmarks`, `:cookies`, `:timer 10m tea`, `:set frost`, `:colours`).
- **Tab manager:** **Alt+Shift+T** opens `about:zenith-tabs`: every tab in a table you can sort by memory, CPU now or its average, last use, space, title or picked first, and filter (awake, asleep, this space, idle, playing, picked), under cards that say where the memory and CPU go (heaviest sites, each space with Sleep and Wake, tabs idle for an hour, tabs working hard, duplicates); every space's tabs in columns, essentials included; tidying up (duplicates, old tabs, awake tabs, busy sites, and by topic with the local AI), each a ticked list; and rules that put tabs into folders, or to sleep, or close them after a while, only once you set them. Move, put into folders, take out, sleep (Zen's own pages too), wake or close, each with Undo (and a list of recent changes to go back to); Tidy up shows where tabs will go and what it did.
- **Bookmarks:** **Ctrl+B** opens your bookmarks in Zenith's look, floating over the right of the page (or docked on either side): rows like the tab list or tiles, this space's bookmarks first, drop a tab on it to bookmark it. Also a section in Zen's Library; Firefox's Library window in Zenith's colours.
- **Ctrl+Tab with pictures** (optional): in the sidebar's order or recently used, like Alt+Tab; Ctrl+Shift+Tab goes back.
- **Folders that don't pin:** a Zen folder can be set so its tabs act unpinned (Ctrl+W closes them, they keep the page they're on); it sits below the pinned tabs' line.
- **Focus mode:** **Alt+Z** puts everything away but the page (the sidebar, edges, pills, the bookmarks bar, and whatever's open, which opens again as you leave): a video site becomes a place to watch rather than a feed (on YouTube: the home page is just the logo and search (past searches only on request), no recommendations, Shorts (a Short opens as a plain video), end screens, autoplay, channel or like buttons; the video gets the room, and search, the description, your playlist, comments or subscriptions stay as you choose), an article gets a calm reading view over the page, and other pages that are mostly reading are tidied (cookie banners, side columns, share bars, comments, stuck headers). Nothing reloads as you leave; sites can be left alone.
- **Your keys:** Zenith's own keys are listed in Zen's Keyboard shortcuts settings, to change or clear; the Shell's are on Zenith's page (Shell › Keys).
- **Link hints:** **Alt+;** (the key right of L) puts a few letters on every link, button and field you can see; type them to follow it (**Alt+Shift+;** opens a link in a new tab in the background).
- **Float a tab:** **Alt+Shift+F** (or the tab's right-click menu) moves the tab you're on into a small window without reloading it, above your Zen window only (or above every app, a setting); Alt+Shift+F there puts it back. Zen's own pages and essentials float too. Its bar (pinned, or sliding down when the pointer comes in) has the title (click it, or Ctrl+L, to type an address), back into the window, minimise (above every app) and close (Ctrl+Shift+T brings it back floating). It floats again after Zen closes and starts.
- **Start page:** `about:zenith-start` on the window's glass: a clock, a search box that also finds your bookmarks, and your bookmarks on number keys; optionally the weather where you are (and your recent places) and your most visited sites. The home page, and optionally new tabs too.
- **Picture-in-picture:** the mouse wheel resizes it, screen edges hold it, and past a side edge it tucks away with a sliver left: rest the pointer on it (or click it) and it comes out, and it goes back when you click anywhere else or the pointer stays away a few seconds. It can live inside the Zen window instead of the screen.
- **Downloads:** a bin beside "Show in folder" in the sidebar's downloads, Zen's Library and Firefox's Library window deletes the file (one click, or two if you like).
- **Cookies:** cookie banners answered for you (Reject pressed on the common consent tools and on any banner with a button that says no; nothing is ever accepted; a banner with no Reject can be hidden), which cookies sites may set, keeping cookies only until you close Zen, and a page (`about:zenith-cookies`, `:cookies`) for each site's rule (Allow, Until you close Zen, Block), its banners, and deleting its cookies and data. The first time Zenith refuses or hides a banner on a site, or blocks cookies there beyond Firefox's own blocking, a notice says so with Undo (the site is left alone), so no site stays broken.
- **Local AI** (optional, Firefox's own, on your computer): clearer names for downloads called things like `IMG_20241012_0931.jpg` (offered, or given with Undo), and the tab manager sorts loose tabs into named groups by topic.
- **Speed:** Zenith's settings are read straight from their preferences, so its styles cost the browser almost nothing at start and on every change; nothing in Zenith runs when its feature isn't on screen. As Zen starts, a picture of the page you were on shows until that page has loaded. Optional Fast start puts the page you were on first and the rest of Zenith Plus a moment later.
- **Sidebar extras:** the page pushed aside by exactly the sidebar's width (Revealed sidebar › Push the page), workspace dots and a flash in the new space's colour, extension buttons pinned in some spaces only, and extensions that run only in some spaces (a work password manager in your work spaces), with experimental copies of an extension for other spaces (another account in the same one), a minimap of the hidden sidebar, numbered tabs while you hold Ctrl, and the cover art of what's playing behind the media card.
- **Menus:** rare right-click items (view source, send to device and so on) in a More submenu, nothing removed; optional icons on the items you use most; Firefox's tab previews in Zenith's look.
- **Bookmarks bar:** where Zen puts it, or its own slim strip above the page, or over the page when you reach the top; Firefox's "Import bookmarks" button hidden.
- **Links from other apps:** optionally ask which space (and container) each one opens in, and remember the answer as a Space routing rule; Zen's Space routing dialog gets "Ask me each time" for any rule and for the default.
- **Colours:** the glass shows a space's whole gradient at a strength you choose; a space's colours from an image or your wallpaper (with Undo); palette sync with pywal, wallust or your wallpaper (every space, or the one you're in, follows your desktop's palette or wallpaper as it changes); optionally, the glass takes the colour of the page you're on.
- **Scrolling:** one setting for how the mouse wheel and keys scroll: Zen's own, instant, quick, smooth or macOS-like.
- **Pages:** zoom pills, plus text selection in the workspace colour.
- **Settings:** a Zenith page in Zen's Settings with every option explained, presets that fill in what they cover, and pictures for looks, with a bar of sections that stays at the top and marks where you are; the same settings as a live panel over the page (**Alt+Shift+Z**). Also greys out options that don't apply, and puts your mods ahead of the marketplace in Sine's page.
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
- **Local AI** (off by default): the first time you use it, Firefox downloads its models from Mozilla's model hub (about 380 MB for download names, 60 MB for topic groups) and keeps them on your computer. The models then run on your computer, in a process of their own: nothing you download or open is sent anywhere.
- **Start page weather** (only with its switch on): requests to [wttr.in](https://wttr.in) when the page opens: one for where you are (wttr.in works it out from your connection), and one for each place you looked up in Peek lately (as many as Peek's weather history keeps).

Specific things it changes:

- `ui.prefersReducedMotion`: set to 0, so Zen animates, while "Let Zen and Zenith animate" is on. It's cleared when you switch that off.
- Window material, Scroll feel and Ctrl+Tab write Zen's and Firefox's own settings for them (`widget.windows.mica…`, `general.smoothScroll…`, `browser.ctrlTab.sortByRecentlyUsed`). Your earlier values are kept and put back when you choose "Zen's own" (or "In order") again.
- Colours from an image changes the current space's colours, as Zen's theme picker would; `:colours undo` in the switcher puts them back.
- "Always open … there" on the link card adds a rule to Zen's Space routing, which you can edit or remove there. "Ask me each time" in Zen's Space routing dialog is saved in Zen's own rules (Zen without Zenith reads it as "where you are").
- A folder set to act unpinned is listed in `zenith.internal.unpinned-folders`; its tabs' pinned page follows where they go. (0.11.2's Firefox tab groups are gone: Firefox's `browser.tabs.groups.enabled` gets your own value back.)
- Zenith's keys are added once to Zen's own list of keyboard shortcuts, under Other; change or clear them there (Zen keeps your changes). 0.13.0 takes link hints out of that list (they're the Shell's keys now).
- While Zenith answers link clicks (Shell › Clicking a link with keys), Zen's own Glance key (`zen.glance.activation-method`) is set to ⊞ (the Windows key), and given back if every combo is set to nothing.
- The bar moves the window's own buttons into itself and back. With tabs in the bar or the sidebar on hover it turns Zen's compact mode on (and its edge hover off for tabs in the bar, `zen.view.compact.show-sidebar-and-toolbar-on-hover`), and gives both back as they were.
- Pages dark or light writes Firefox's own Website appearance (`layout.css.prefers-color-scheme.content-override`); automatic clears it.
- The bar's weather and the Dash's ask [wttr.in](https://wttr.in) (near you, which it works out from your connection, or Peek's last place) at most every half hour; the bar's weather is off unless you turn it on.
- Readable sidebar text takes a small picture of the sidebar as it's drawn, in memory, to see how bright it is; nothing is kept or sent.
- A picture of your own as the wallpaper is copied into your profile folder (`zenith-wallpaper-own`).
- A palette changes every space's colours, as Zen's theme picker would; the colours you had are kept (`zenith.internal.palette.own-spaces`) and given back with Your own colours.
- Zenith Shell sets Firefox's `mousewheel.with_alt.action` to 0 (nothing) while Alt+wheel switches spaces, and gives your value back when you turn that off. Its page helper (the one Peek's link clicks use) stops an Alt+press from selecting text or starting a drag in the page, and tells the browser which link you Alt+Shift+clicked; it reads nothing else. The scratchpad is a floating tab whose window is moved off the screen (or minimised) while it's put away.
- Extensions per space › Runs in spaces turns an extension off (as Add-ons does) in the spaces you untick and on again in the others; only what Zenith turned off is turned back on. While any extension has spaces, Firefox Sync's `services.sync.addons.ignoreUserEnabledChanges` is on, so your other devices don't follow; your value comes back after. An extension starts afresh each time it comes back (a password manager asks to be unlocked).
- Zen's own toasts ("Copied") are moved up beside Zenith's notices, so they show over Zenith's panels.
- Bookmarks: dropping a tab on the panel adds a bookmark; "this space" bookmarks go in a folder per space under Other Bookmarks › Spaces, made the first time you use it.
- The tab manager's rules and its automatic sleeping and closing act only after you set them up; what auto-close closes is listed on its page to bring back.
- `about:zenith-tabs` and `about:zenith-cookies` are pages from the mod's own folder, registered while Zen runs.
- On Windows, Wallpaper reads your wallpaper's file and position through Windows' wallpaper service; it never changes it. The last drawing is kept in your profile (`zenith-wallpaper.jpg`) so it shows at once when Zen starts.
- Local AI turns on Firefox's `browser.ml.enable` (Zen turns it off) while it's on, and gives your value back when you turn it off. A download it renames is renamed beside where it is (never over another file), and Firefox's downloads list and history are told the new name; Undo puts the old one back.
- Start page sets Firefox's home page (`browser.startup.homepage`) to `about:zenith-start` while it's on; with new tabs too, Firefox's new tab page is `about:zenith-start` and Zen's `zen.urlbar.replace-newtab` is off. Your own values come back with Off. `about:zenith-start` is a page from the mod's own folder, like `about:zenith-tabs`.
- A palette from pywal or wallust reads `~/.cache/wal/colors.json` (or wallust's `~/.cache/wallust/colors.json`) and follows it when it changes. A palette sets Zen's own window scheme (`zen.view.window.scheme`) light or dark; yours comes back with no palette.
- `about:zenith-help` is a page from the mod's own folder, like `about:zenith-tabs`.
- The delete button in the downloads lists deletes the file and its line in the list, as Firefox's own Delete does (and the page it came from leaves your history only if Firefox's `browser.download.clearHistoryOnDelete` says so).
- As Zen starts, Zenith opens the connection to the site of the page you were on (as Firefox does for a link you're about to click), so it loads sooner. Nothing is loaded or sent.
- Link hints add a small helper to web pages that draws the labels and clicks what you pick; it reads nothing from the page for Zenith.
- Focus mode's pages: a helper in the page draws the reading view (Firefox's own article parser), quiets a video site or hides clutter, and puts it all back; it reads nothing from the page for Zenith. Sites left alone are in `zenith.plus.focus-skip`.
- Cookie banners: a helper in every page and its frames presses a banner's Reject (or hides it), and tells the browser only which site and what it did, for the cookies page's "lately" (kept while Zen runs). The policy writes Firefox's own `network.cookie.cookieBehavior`; "Until you close Zen" turns on Firefox's clearing on closing for cookies and site data only (`privacy.sanitize.sanitizeOnShutdown` with history, downloads, form data, the cache and site settings explicitly kept); your values come back with "Firefox's own" and "Until they expire". Site rules are Firefox's own cookie exceptions.
- 0.12.2's picture of the last page is gone: 0.12.3 deletes `zenith-last-page.jpg` from your profile folder.
- Cookie notices are kept only while Zen runs, and nothing from private windows is kept at all.
- Extension copies (experimental, off by default) copy an extension's files into your profile folder (`zenith-extension-copies`) with another ID and name and no update address, and load them as temporary add-ons at each start; nothing in about:config changes.

## Development

- **Layout:** one folder per mod at the top (`core/`, `edges/`, `tabs/`, `urlbar/`, `panels/`, `motion/`), `plus/` holds Zenith Plus, and `tools/` holds the build, check and install scripts.
- **Generated:** `chrome.css`, `preferences.json` and `theme.json` at the top are the one Sine mod, built from the folders by `python tools/package.py . --owner bootzin`. Don't edit them by hand; run that before every push.

## Licence

Zenith is free software: you can share and change it under the GNU General Public License, version 3 or (at your option) any later version ([LICENSE](LICENSE)). It comes with no warranty. The vendored fx-autoconfig and Sine keep their own licence (MPL-2.0, in their folders).

## Credits

- [fx-autoconfig](https://github.com/MrOtherGuy/fx-autoconfig) by MrOtherGuy (MPL-2.0), vendored in `vendor/fx-autoconfig`.
- [Sine](https://github.com/CosmoCreeper/Sine) (MPL-2.0), vendored in `vendor/sine` for testing.
- [Zen-Site-Appearance-Toggle](https://github.com/ravenothere/Zen-Site-Appearance-Toggle) (MIT) by ravenothere inspired pages dark or light; no code was copied.
- [Zia](https://github.com/z1n-k/zia) (MIT) inspired the liquid glass edge; [Natsumi](https://github.com/greeeen-dev/natsumi-browser) the window material choice, the picture-in-picture controls, the miniplayer art and the settings page; [Zen-Nebula](https://github.com/JustAdumbPrsn/Zen-Nebula) the per-platform transparency notes. No code was copied from Natsumi or Zen-Nebula.
- Several ideas come from mods Zenith replaces: Trackpad Animation, Load Bar, Better Unloaded Tabs, Audio Indicator, Floating Status Bar, Private Mode Highlighting, Container Halo, Better Find Bar, Floating History and Vertical Split Tab Groups.
- Made with the help of AI.
