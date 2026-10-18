# Zenith Plus

Version 0.11.2

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

**Tab manager**: **Alt+Shift+T** (or `:tabs`) opens `about:zenith-tabs`. Each space is a column of its tabs as its sidebar has them: folders (a pin) and groups (they don't pin), folders in folders, then loose tabs; essentials across the top (with the spaces they show in, when Zen keeps them per container). Each awake tab shows its memory (and CPU when busy); the header adds them up. Tick tabs (a click ticks, Shift ticks a range, Ctrl+A all, double-click goes to one) or a folder's box for all its tabs, and the bar at the bottom moves them to a space (a pinned tab stays pinned, a tab leaves its folder, a split view moves whole), puts them in a new folder, a new group or an existing one, takes them out of their folder, puts them to sleep, wakes them or closes them. Every change can be undone (the note that comes up, the Undo button, Ctrl+Z), and reopening closed tabs keeps you on the page. Drag tabs onto a space or a folder, or a folder onto another space. On the right, tidying up: duplicates, tabs you haven't used for 3, 7, 14 or 30 days, awake tabs heaviest first, busy sites: each lists its tabs ticked; untick what to keep, then press its button. **Rules** groups tabs as they arrive (a site, an address or a title, in any space or one, into a folder or a group: one you link it to, or one it makes), and can put tabs to sleep or close loose ones after a while; nothing acts on its own until you set it. Keys › Tab manager › Opens as: the page, or the same page, compact, in a card over the page (one list by space, tidying folded away).

**Bookmarks**: **Ctrl+B** (or `:bookmarks`) opens them in Zenith's look instead of Firefox's sidebar: floating over the right of the page (default), docked on the right so the page makes room, or on the left beside the tabs; drag its inner edge to resize. Rows like the tab list (folders open in place) or tiles (folders you step into), with search. Your bookmarks toolbar comes first, then Bookmarks Menu and Other Bookmarks. "This space first" shows a section for the space you're in: its own folder (made when you first drop something there) and the bookmarks Zen's edit dialog gives to that space; ones given only to other spaces are left out, as in Zen's menus. Drop a tab or link on it to bookmark it (on a folder to put it there), drag bookmarks onto folders to move them, right-click to edit, keep with this space or delete. The same view is a section of Zen's Library, and Firefox's Library window (Manage bookmarks) takes Zenith's colours. "Firefox's tree, restyled" keeps Firefox's own sidebar instead, in Zenith's colours, on the side you chose.

**Focus mode**: **Alt+Z** hides the sidebar (compact mode, if it wasn't on), the edges, the minimap, pills and the link address. The sharing alarm still shows. Alt+Z again brings everything back.

**Also**

- Ctrl+Tab with pictures (Keys › Ctrl+Tab): in the sidebar's order, or recently used like Alt+Tab; hold Ctrl and press Tab to step through, let go to land
- Bookmarks bar where Zen puts it, as its own strip above the page, or over the page when the pointer reaches the top; Firefox's "Import bookmarks" button hidden
- Links from other apps: optionally a card asking which space they open in, with "always open this site there"; in Zen's Space routing dialog, "Ask me each time" for any rule and for the default
- Space colour (Look): the glass shows a space's whole gradient (or one tint), at Zen's strength or a medium or strong one
- Colours from an image or from your wallpaper for the current space (one, two or three colours, found the way wallust and pywal do), with "Undo colours" on the settings page, and optionally the glass taking the page's colour
- Extension buttons pinned in the spaces you tick (right-click one › Pinned in spaces); the extension keeps running everywhere, and Zen's extensions panel lists the ones pinned elsewhere with "Pin here"
- Groups that don't pin: right-click a Zen folder › Tabs act unpinned (Ctrl+W closes them, they keep their page); or Firefox's tab groups instead, with split views kept whole in them
- Pin marks on pinned tabs and folders; notices over everything, Zen's own included
- Workspace dots at the top of the page when you switch space (or always), and the top edge lighting up in the space's container colour (or the space's own)
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
