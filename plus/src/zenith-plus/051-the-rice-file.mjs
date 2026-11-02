/* --- The rice file (plus/pages/rice.mjs): ~/.config/zenith/zenith.conf ---------------
   Read as Zen starts when there's one (one look at whether it's there
   otherwise), on Alt+Shift+C, and when the window comes back to the front
   after another app saved it. A setting it holds, changed on the settings
   page, is changed in the file too (or, Tiling and keys › The rice file, locked). */
const RiceLoader = {
  init() {
    window.ZenithRice = this; // the Shell's Alt+Shift+C, the settings page, tools/checks
    const commandset = document.createXULElement("commandset");
    for (const [id, run] of [["zenith-rice-export-command", () => this.export()], ["zenith-rice-reload-command", () => this.reload(true)],
                             ["zenith-rice-open-command", () => this.open()]]) {
      const c = document.createXULElement("command");
      c.id = id;
      c.addEventListener("command", run);
      commandset.append(c);
    }
    root.append(commandset);
    // (The first window reads it; the settings are shared.)
    const first = [...Services.wm.getEnumerator("navigator:browser")].length <= 1;
    const front = () => Services.wm.getMostRecentWindow("navigator:browser") === window;
    const back = async () => front() && this.m && (await this.m.Rice.changed()) && this.reload(true);
    const changed = (s, t, name) => front() && this.m?.Rice.written(name);
    window.addEventListener("activate", back);
    Services.prefs.addObserver("zenith.", changed);
    onUnload(() => {
      window.removeEventListener("activate", back);
      Services.prefs.removeObserver("zenith.", changed);
      commandset.remove();
    });
    IOUtils.exists(this.path).then(there => there && first && this.reload(false)).catch(() => {});
  },

  get path() {
    const home = Services.prefs.getStringPref("zenith.internal.rice.home", "") || Services.dirsvc.get("Home", Ci.nsIFile).path;
    return PathUtils.join(home, ".config", "zenith", "zenith.conf");
  },

  async mod() {
    return (this.m ??= await import(await BarLoader.page("rice.mjs")));
  },

  async reload(tell = false) {
    try {
      await (await this.mod()).Rice.load(tell);
    } catch (e) {
      console.error("[Zenith] zenith.conf", e);
    }
  },

  // The settings page: is this setting the file's, and locked?
  holds(name) {
    try {
      const held = JSON.parse(Services.prefs.getStringPref("zenith.internal.rice.held", "") || "[]");
      if (!held.includes(name)) return null;
      return Services.prefs.getStringPref("zenith.rice.mode", "") === "locked" ? "locked" : "written";
    } catch {
      return null;
    }
  },

  async export() {
    try {
      const m = await this.mod();
      if (await IOUtils.exists(this.path)) {
        const copy = `${this.path}.${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.bak`;
        await IOUtils.copy(this.path, copy);
      }
      await m.exportFile(this.path);
      await this.reload(false);
      hint(`Your setup is in ${this.path}`);
    } catch (e) {
      console.error("[Zenith] zenith.conf: writing", e);
    }
  },

  async open() {
    if (!(await IOUtils.exists(this.path))) return this.export();
    const { FileUtils } = ChromeUtils.importESModule("resource://gre/modules/FileUtils.sys.mjs");
    try {
      new FileUtils.File(this.path).launch();
    } catch {
      new FileUtils.File(this.path).reveal();
    }
  },
};

