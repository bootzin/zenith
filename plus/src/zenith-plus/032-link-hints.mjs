/* --- Link hints (Alt+;, one of the Shell's keys) ----------------------------------
   Vim-style: a few letters on every link, button and field you can see in
   the page; type them to follow it. Alt+Shift+J opens the link in a new tab
   in the background. The labels are drawn by plus/pages/link-hints.sys.mjs,
   a window actor that runs where the page runs; this registers it the first
   time it's used and sends it the accent colour. */
const LinkHints = {
  PREF: "zenith.plus.link-hints",

  init() {
    const commandset = document.createXULElement("commandset");
    for (const [id, newTab] of [["zenith-hints", false], ["zenith-hints-tab", true]]) {
      const command = document.createXULElement("command");
      command.id = `${id}-command`;
      command.addEventListener("command", () => this.show(newTab).catch(e => console.error("[Zenith] link hints", e)));
      commandset.append(command);
    }
    root.append(commandset);
    window.ZenithHints = this; // for tools/checks
  },

  // (Safe in a web page's process: it only draws labels and clicks what
  // you pick; it takes nothing from the page to the browser.)
  register() {
    return PageActors.register("ZenithHints", "link-hints.sys.mjs");
  },

  async show(newTab) {
    if (!Services.prefs.getBoolPref(this.PREF, true)) return;
    const browser = gBrowser.selectedBrowser;
    await this.register();
    const page = browser.browsingContext?.currentWindowGlobal;
    if (!page) return;
    this.probe ??= root.appendChild(el("div", { hidden: "true", style: "color: var(--zth-accent, AccentColor)" }));
    const accent = getComputedStyle(this.probe).color;
    const [r, g, b] = (accent.match(/[\d.]+/g) ?? [0, 0, 0]).map(Number);
    const ink = 0.2126 * r + 0.7152 * g + 0.0722 * b > 150 ? "#111" : "#fff";
    browser.focus();
    page.getActor("ZenithHints").sendAsyncMessage("show", { newTab, accent, ink });
  },
};

