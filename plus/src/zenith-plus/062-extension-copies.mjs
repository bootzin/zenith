/* --- Extension copies (experimental; Sidebar and tabs › Extensions › Extension copies) -------
   A second copy of an extension, with an ID of its own, and so its own
   storage: sign into another account in it (a work and a personal password
   manager from the same maker), and give each its spaces with Runs in
   spaces. Right-click an extension › Copy for other spaces: its files are
   copied into your profile folder (zenith-extension-copies), its ID and
   name changed, and Zenith loads the copy as a temporary add-on at every
   start (so Firefox's signature check isn't involved, and nothing in
   about:config changes). The original then runs in the space you're in,
   the copy in the others.
   The catches, shown before a copy is made: a copy doesn't update itself
   (right-click it › Refresh from the original, offered when the original is
   newer), it loads a moment after Zen starts, an extension's desktop app may
   not talk to a copy, and Firefox lists it as temporary. Copies are kept in
   zenith.internal.extension-copies ([{ id, of }]). */
const ExtensionCopies = {
  PREF: "zenith.plus.extension-copies",
  LIST: "zenith.internal.extension-copies",

  get on() {
    return Services.prefs.getBoolPref(this.PREF, false);
  },

  get list() {
    try {
      return JSON.parse(Services.prefs.getStringPref(this.LIST, "[]"));
    } catch {
      return [];
    }
  },

  save(list) {
    Services.prefs.setStringPref(this.LIST, JSON.stringify(list));
  },

  dir(id) {
    return PathUtils.join(PathUtils.profileDir, "zenith-extension-copies", id.replace(/[^\w.@-]/g, "_"));
  },

  AM() {
    return ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs").AddonManager;
  },

  fileOf(path) {
    const f = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    f.initWithPath(path);
    return f;
  },

  // As Zen starts (once, in the first window): the copies load.
  async init() {
    window.ZenithExtensionCopies = this; // for tools/checks
    const Startup = sessionStartup();
    if (!this.on || !Startup || Startup.zenithCopiesLoaded) return;
    Startup.zenithCopiesLoaded = true;
    for (const c of this.list) {
      try {
        if (await this.AM().getAddonByID(c.id)) continue;
        if (await IOUtils.exists(this.dir(c.id))) await this.AM().installTemporaryAddon(this.fileOf(this.dir(c.id)));
      } catch (e) {
        console.error("[Zenith] loading an extension copy", c.id, e);
      }
    }
  },

  copyOf(id) {
    return this.list.find(c => c.id === id) ?? null;
  },

  // The original's files: its package (an .xpi) or its folder.
  async files(addon, dest) {
    const root = addon.getResourceURI("").spec;
    await IOUtils.remove(dest, { recursive: true, ignoreAbsent: true });
    await IOUtils.makeDirectory(dest, { createAncestors: true });
    if (root.startsWith("jar:")) {
      const xpi = Services.io.newURI(root.slice(4, root.indexOf("!/"))).QueryInterface(Ci.nsIFileURL).file;
      const zip = Cc["@mozilla.org/libjar/zip-reader;1"].createInstance(Ci.nsIZipReader);
      zip.open(xpi);
      try {
        for (const name of zip.findEntries("*")) {
          if (name.endsWith("/") || name.startsWith("META-INF/")) continue;
          const target = PathUtils.join(dest, ...name.split("/"));
          await IOUtils.makeDirectory(PathUtils.parent(target), { createAncestors: true, ignoreExisting: true });
          const stream = zip.getInputStream(name);
          const bin = Cc["@mozilla.org/binaryinputstream;1"].createInstance(Ci.nsIBinaryInputStream);
          bin.setInputStream(stream);
          const bytes = new Uint8Array(bin.readByteArray(bin.available()));
          stream.close();
          await IOUtils.write(target, bytes);
        }
      } finally {
        zip.close();
      }
    } else {
      const src = Services.io.newURI(root).QueryInterface(Ci.nsIFileURL).file.path;
      for (const child of await IOUtils.getChildren(src)) {
        if (PathUtils.filename(child) === "META-INF") continue;
        await IOUtils.copy(child, dest, { recursive: true });
      }
    }
  },

  // Its manifest, made a copy's: its own ID and name, no updates.
  async rename(dest, id, addon) {
    const file = PathUtils.join(dest, "manifest.json");
    const manifest = JSON.parse(await IOUtils.readUTF8(file));
    let name = manifest.name ?? addon.name;
    if (/^__MSG_/.test(name)) name = addon.name;
    manifest.name = `${name} (copy)`;
    if (manifest.short_name) manifest.short_name = `${manifest.short_name} (copy)`.slice(0, 40);
    for (const key of ["browser_specific_settings", "applications"]) {
      if (!manifest[key]?.gecko) continue;
      delete manifest[key].gecko.update_url;
    }
    manifest.browser_specific_settings = { ...(manifest.browser_specific_settings ?? {}), gecko: { ...(manifest.browser_specific_settings?.gecko ?? manifest.applications?.gecko ?? {}), id } };
    delete manifest.applications;
    delete manifest.update_url;
    await IOUtils.writeUTF8(file, JSON.stringify(manifest, null, 2));
  },

  async make(ext) {
    const addon = await this.AM().getAddonByID(ext);
    if (!addon) return null;
    const id = `${ext.replace(/[{}]/g, "").replace(/@/g, "-at-")}-copy@zenith`;
    if (this.copyOf(id) && (await this.AM().getAddonByID(id))) {
      hint(`${addon.name} already has a copy`);
      return id;
    }
    const dest = this.dir(id);
    await this.files(addon, dest);
    await this.rename(dest, id, addon);
    await this.AM().installTemporaryAddon(this.fileOf(dest));
    this.save([...this.list.filter(c => c.id !== id), { id, of: ext, version: addon.version }]);
    // The original in this space, the copy in the others.
    const S = window.ZenithSpaceExtensions, here = window.gZenWorkspaces?.activeWorkspace;
    const all = S?.spaces().map(s => s.uuid) ?? [];
    if (S && here && all.length > 1) {
      const mine = S.runs[ext] ?? [here];
      S.setRuns(ext, mine);
      S.setRuns(id, all.filter(u => !mine.includes(u)));
    }
    hint(`${addon.name} (copy) made: it runs in your other spaces; the original here`);
    return id;
  },

  // The original updated: the copy takes its files again (its storage stays).
  async refresh(id) {
    const c = this.copyOf(id), addon = c && (await this.AM().getAddonByID(c.of));
    if (!addon) return false;
    const dest = this.dir(id);
    await this.files(addon, dest);
    await this.rename(dest, id, addon);
    await this.AM().installTemporaryAddon(this.fileOf(dest));
    this.save(this.list.map(x => (x.id === id ? { ...x, version: addon.version } : x)));
    hint(`${addon.name} (copy) refreshed`);
    return true;
  },

  async remove(id) {
    try {
      await (await this.AM().getAddonByID(id))?.uninstall();
    } catch {}
    await IOUtils.remove(this.dir(id), { recursive: true, ignoreAbsent: true });
    this.save(this.list.filter(c => c.id !== id));
    window.ZenithSpaceExtensions?.setRuns(id, null);
    hint("Copy removed");
  },

  // The right-click items for an extension (or a copy).
  async items(ext) {
    if (!this.on || !ext) return [];
    const c = this.copyOf(ext);
    if (c) {
      const original = await this.AM().getAddonByID(c.of);
      return [
        ...(original && original.version !== c.version ? [["Refresh from the original", () => this.refresh(ext)]] : []),
        ["Remove this copy", () => this.remove(ext)],
      ];
    }
    return [["Copy for other spaces…", () => this.confirm(ext)]];
  },

  async confirm(ext) {
    const addon = await this.AM().getAddonByID(ext);
    if (!addon) return;
    const ok = Services.prompt.confirmEx(window, "Copy for other spaces (experimental)",
      `A second ${addon.name} with its own storage (sign into another account in it), running in your other spaces while the ` +
      "original runs in this one.\n\nThe catches: the copy doesn't update itself (right-click it › Refresh from the original), " +
      "it loads a moment after Zen starts, the extension's desktop app may not talk to it, and Firefox lists it as temporary.",
      Services.prompt.STD_YES_NO_BUTTONS, null, null, null, null, {}) === 0;
    if (ok) this.make(ext).catch(e => {
      console.error("[Zenith] copying an extension", e);
      hint(`Couldn't copy ${addon.name}`);
    });
  },
};

