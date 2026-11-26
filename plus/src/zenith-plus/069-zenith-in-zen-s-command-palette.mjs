/* --- Zenith in Zen's command palette ------------------------------------------
   Zen's address bar runs an action by its name ("Toggle Compact Mode",
   "Open Library"). Zenith's join them as "Zenith: …", so typing "overview"
   or "rice" finds them; the switcher's ":" commands stay. Zen's list is one
   module for every window: added once, each action run in the window it was
   picked in (and offered only where that window has it). */
const PaletteActions = {
  ICON: name => `chrome://browser/skin/zen-icons/${name}.svg`,

  // label · icon · what it needs in the window · what it does there
  LIST: [
    ["Overview: every tab as a picture", "grid-2x2", w => w.ZenithOverview, w => w.ZenithOverview.toggle()],
    ["Looks: the rice picker", "palette", w => w.ZenithShell, w => w.ZenithShell.keys.run("rice")],
    ["The Dash", "sliders", w => w.ZenithShell, w => w.ZenithShell.keys.run("dash")],
    ["Launcher", "rocket", w => w.ZenithSwitcher, w => w.ZenithShell?.keys.run("launcher")],
    ["Switcher", "squares", w => w.document.getElementById("zenith-switcher-command"), w => w.document.getElementById("zenith-switcher-command").doCommand()],
    ["Tab manager", "tab", w => w.ZenithTabs, w => w.ZenithTabs.show()],
    ["Bookmarks", "bookmark", w => w.document.getElementById("zenith-bookmarks-toggle"), w => w.document.getElementById("zenith-bookmarks-toggle").doCommand()],
    ["Cookies", "cookies-fill", w => w.document.getElementById("zenith-cookies-command"), w => w.document.getElementById("zenith-cookies-command").doCommand()],
    ["Fetch: your setup at a glance", "terminal", w => w.ZenithFetch, w => w.ZenithFetch.open()],
    ["Focus mode", "eye", w => w.ZenithFocus, w => w.ZenithFocus.toggle()],
    ["Settings over the page", "settings", w => w.ZenithLive, w => w.ZenithLive.toggle()],
    ["Next layout", "layers", w => w.ZenithLayouts, w => w.ZenithLayouts.cycle()],
    ["Layout: Dwindle", "split", w => w.ZenithLayouts, w => w.ZenithLayouts.set("dwindle")],
    ["Layout: Master and stack", "split", w => w.ZenithLayouts, w => w.ZenithLayouts.set("master")],
    ["Layout: Scroller", "split", w => w.ZenithLayouts, w => w.ZenithLayouts.set("scroller")],
    ["Layout: Monocle", "split", w => w.ZenithLayouts, w => w.ZenithLayouts.set("monocle")],
    ["Link hints", "link", w => w.ZenithShell, w => w.ZenithShell.keys.run("hints")],
    ["Scratchpad", "inbox", w => w.ZenithShell, w => w.ZenithShell.keys.run("scratchpad")],
    ["Float this tab", "popup", w => w.document.getElementById("zenith-float-command"), w => w.document.getElementById("zenith-float-command").doCommand()],
    ["Put this tab to sleep", "bed", w => w.ZenithShell, w => w.ZenithShell.keys.run("sleep")],
    ["Put the space's other tabs to sleep", "bed", w => w.ZenithShell, w => w.ZenithShell.keys.run("sleep-others")],
    ["Pages dark or light", "moon", w => w.ZenithAppearance, w => w.ZenithAppearance.toggle()],
    ["Keys", "key", w => w.ZenithShell, w => w.ZenithShell.keys.run("keys")],
    ["Read zenith.conf again", "reload", w => w.ZenithRice, w => w.ZenithRice.reload(true)],
    ["Help", "help", w => w.ZenithHelp, w => w.ZenithHelp.open()],
  ],

  init() {
    let actions;
    try {
      ({ globalActions: actions } = ChromeUtils.importESModule("resource:///modules/ZenUBGlobalActions.sys.mjs"));
    } catch {
      return;
    }
    if (!Array.isArray(actions) || actions.some(a => a.commandId?.startsWith("zenith:"))) return;
    for (const [label, icon, has, run] of this.LIST) {
      const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      actions.push({
        l10nId: `zenith-action-${id}`,
        commandId: `zenith:${id}`,
        label: `Zenith: ${label}`,
        icon: this.ICON(icon),
        extraPayload: {},
        isAvailable: w => {
          try {
            return !!has(w);
          } catch {
            return false;
          }
        },
        command: w => {
          try {
            run(w);
          } catch (e) {
            console.error(`[Zenith] the command palette: ${label}`, e);
          }
        },
      });
    }
  },
};

