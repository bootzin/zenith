# Zenith Plus

Version 0.11.0

The part of Zenith that needs scripts. Zenith's six mods work without it; Plus adds what CSS alone can't do. It needs a script loader: Sine, or fx-autoconfig installed by hand.

**Peek**: quick lookups that leave nothing behind.

- **Alt+Q** looks up the text you've selected. With nothing selected, it opens a small prompt.
- **Shift+Enter** in the URL bar peeks what you typed instead of going there.
- **Escape** closes a Peek. **Ctrl+Enter** keeps it as a normal tab.
- Peeks are a floating page, not a tab, and they stay out of your history.
- **Prefixes**: `m` maps, `w` Wikipedia, `d` define, `t` translate, `wt` weather, `y` YouTube, `ai` Google AI Mode, `$` currency, `gh` GitHub, `r` Reddit. Type `?` in Peek to see them all. Edit, add or remove prefixes right there.
- **Instant answers**: maths, units and time zones show right in the prompt, worked out offline by Firefox itself. Enter copies the answer.
- **Answers from the web**: `$ 100 usd eur` (or just `100 usd to eur`) converts currency, `d word` shows a definition, `wt city` the weather (`wt` alone: the weather near you, with the places you looked up lately underneath), all in the prompt. Weather units follow your country, or the "Peek weather units" setting. Enter copies a conversion or opens the full page. Switch these off in settings if you'd rather nothing is looked up as you type.
- **Timers**: `timer 10m tea` starts a countdown, `pomo` a pomodoro (`pomo 15 10 4`, or `pomo focus 10, 5 break, 3 rounds`, for your own pattern), and `timer` lists them (Delete cancels). A running timer drains down the left edge of the page, and a small card in the corner says when it ends.

**Switcher**: **Alt+W** opens a list over the page. Type a few letters of a tab's title or site (in any space), a folder or a space (in any order, with gaps: `gh zen`), and Enter goes there, switching space if it has to. With nothing typed, the tabs you used last come first. Start with `:` for commands: `:focus`, `:compact`, `:settings`, `:tabs`, `:set frost`, `:timer 10m tea`, `:pomo`, `:peek something`, `:colours` (`:colours wallpaper`, `:colours undo`), `:routing`.

**Tab manager**: **Alt+Shift+T** (or `:tabs`) shows each space with its tab and awake counts, then what could be tidied: duplicates (the one you used last stays), tabs you haven't used for 3, 7, 14 or 30 days, tabs that are awake besides yours, and sites with four or more loose tabs (into a folder). Everything is listed and ticked first; untick what you want to keep, then press the button. Closing has Undo, and essentials and pinned tabs are never closed.

**Focus mode**: **Alt+Z** hides the sidebar (compact mode, if it wasn't on), the edges, the minimap, pills and the link address. The sharing alarm still shows. Alt+Z again brings everything back.

**Also**

- Ctrl+Tab like Alt+Tab (Keys › Ctrl+Tab): hold Ctrl and press Tab to step back through the tabs you used last, with pictures; let go to land
- Bookmarks bar as its own strip above the page, or over the page when the pointer reaches the top
- Links from other apps: optionally a card asking which space they open in, with "always open this site there"
- Colours from an image or from your wallpaper for the current space, and optionally the glass taking the page's colour
- Extension buttons that show only in one space (right-click a pinned one)
- Workspace dots at the top of the page when you switch space (or always), and the top edge lighting up in the new space's colour
- Push: with Revealed sidebar on Push the page, the page moves aside by exactly the sidebar's width
- Rare right-click menu items in a More submenu, and optional icons on the ones you use most
- Scroll feel for the mouse wheel and keys: Zen's own, instant, quick, smooth or macOS-like
- Extras: in compact mode, the sidebar shows briefly when you switch tabs by keyboard; a pulse on the page's edge when a background tab has loaded
- Real progress on the load and download edges
- A minimap of the hidden compact sidebar
- Zoom pills on zoomed pages (click to reset)
- A label when you hover the not-secure edge
- Numbered tabs while you hold Ctrl (Zenith Tabs › Numbered tabs › While holding Ctrl)
- The cover art of what's playing, blurred behind the media card
- Text selection and scrollbars in web pages, in the workspace colour
- The same workspace colour on the docked and floating sidebar
- Zen's own animations, even when the system asks for less motion

**Settings**: Plus adds a **Zenith** page to Zen's Settings: every option with a sentence on what it does, switches, small pictures for looks, and presets that fill in the settings they cover (it says "Custom" once you change one). Press **Alt+Shift+Z** for the same settings as a live panel over the page you're on, or type `set` and a few words in Peek (`set frost`): Tab changes the setting there and then, Enter opens it in the live panel, and the last row searches Zen's own settings. Options that another setting makes irrelevant are greyed out, with the reason; in Sine's mods page your installed mods come first and the marketplace folds behind a button (searching opens it).

**Window**: the window material behind Zen (Windows: Acrylic, Mica, Mica Alt; macOS: its materials; Linux: see-through), with Wallpaper as the default on Windows: your desktop wallpaper drawn behind the window by Zenith, each screen's own, so Frost and Window transparency apply to the docked sidebar too. See-through Zen pages (off by default) lets Settings, Add-ons and Zen's other own pages show that glass too; web pages stay as they are. With Glass edge on Liquid, glass lights up softly under the pointer as you hover, and brighter as you press (tabs, essentials, the media card, Peek, notices).

**What it touches:** the scripts run inside the browser with full access, like any Zen script mod. They collect nothing and send nothing about you. The network requests they cause:

- the pages you choose to Peek;
- web answers in Peek, once you've typed a `$`, `d` or `wt` lookup (or `100 usd to eur`): the currencies go to Frankfurter (European Central Bank rates), the word to Wiktionary, the place to wttr.in (for `wt` alone, wttr.in works out roughly where you are from your connection, as any website can; your recent places are kept on your computer and refreshed when you open `wt`);
- the cover art of what's playing, fetched from the site that's playing it, without cookies.
