# Zenith Plus

Version 0.8.0

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

**Also**

- Real progress on the load and download edges
- A minimap of the hidden compact sidebar
- Zoom pills on zoomed pages (click to reset)
- A label when you hover the not-secure edge
- Numbered tabs while you hold Ctrl (Zenith Tabs › Numbered tabs › While holding Ctrl)
- The cover art of what's playing, blurred behind the media card
- Text selection and scrollbars in web pages, in the workspace colour
- The same workspace colour on the docked and floating sidebar
- Zen's own animations, even when the system asks for less motion

**Settings**: Plus adds a **Zenith** page to Zen's Settings: every option with a sentence on what it does, switches, small pictures for looks, and presets that fill in the settings they cover (it says "Custom" once you change one). Press **Alt+Shift+Z** for the same settings as a live panel over the page you're on. Options that another setting makes irrelevant are greyed out, with the reason; in Sine's mods page your installed mods come first and the marketplace folds behind a button (searching opens it).

**Window**: the window material behind Zen (Windows: Acrylic, Mica, Mica Alt; macOS: its materials; Linux: see-through), and, with Glass edge on Liquid, glass that lights up where you press it.

**What it touches:** the scripts run inside the browser with full access, like any Zen script mod. They collect nothing and send nothing about you. The network requests they cause:

- the pages you choose to Peek;
- web answers in Peek, once you've typed a `$`, `d` or `wt` lookup (or `100 usd to eur`): the currencies go to Frankfurter (European Central Bank rates), the word to Wiktionary, the place to wttr.in (for `wt` alone, wttr.in works out roughly where you are from your connection, as any website can; your recent places are kept on your computer and refreshed when you open `wt`);
- the cover art of what's playing, fetched from the site that's playing it, without cookies.
