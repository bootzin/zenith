/* --- Wallpaper (Windows): the desktop behind the window, drawn by Zenith ----
   Around the page (the docked sidebar, the gap round a rounded page) the
   desktop shows through, and Windows blurs it at one fixed strength. With
   Window material on Wallpaper (the default), Zenith draws your desktop
   wallpaper there itself, exactly where it sits on the screen, and Core
   blurs it by Frost and tints it like every other glass surface: so the
   docked sidebar looks like the floating one. Windows behind Zen don't show
   through; the wallpaper does (as with Mica, which is Windows' own blurred
   wallpaper).
   Every screen's own wallpaper comes from Windows' wallpaper service
   (IDesktopWallpaper, through js-ctypes), with where each screen is: all of
   them are drawn into one picture of the whole desktop, so a window on any
   screen, or across two, shows what's behind it. Without that service, the
   one picture in the registry is drawn for the window's screen. Pictures
   are fitted as Windows fits them (fill, fit, stretch, centre, tile, span),
   kept as one JPEG, and drawn again when a wallpaper (its file or its
   date), the screens or their scale change. */
const Desktop = {
  open() {
    if (this.lib !== undefined) return this.lib;
    this.lib = null;
    try {
      const { ctypes } = ChromeUtils.importESModule("resource://gre/modules/ctypes.sys.mjs");
      const ole32 = ctypes.open("ole32.dll");
      const user32 = ctypes.open("user32.dll");
      const P = ctypes.voidptr_t, HR = ctypes.int32_t, U32 = ctypes.uint32_t, WSTR = ctypes.char16_t.ptr;
      const GUID = new ctypes.StructType("GUID", [{ a: U32 }, { b: ctypes.uint16_t }, { c: ctypes.uint16_t }, { d: ctypes.uint8_t.array(8) }]);
      const RECT = new ctypes.StructType("RECT", [{ left: ctypes.int32_t }, { top: ctypes.int32_t }, { right: ctypes.int32_t }, { bottom: ctypes.int32_t }]);
      const INFO = new ctypes.StructType("MONITORINFO", [{ cbSize: U32 }, { monitor: RECT }, { work: RECT }, { flags: U32 }]);
      const guid = text => {
        const h = text.replace(/-/g, "");
        const g = new GUID();
        g.a = parseInt(h.slice(0, 8), 16);
        g.b = parseInt(h.slice(8, 12), 16);
        g.c = parseInt(h.slice(12, 16), 16);
        for (let i = 0; i < 8; i++) g.d[i] = parseInt(h.slice(16 + 2 * i, 18 + 2 * i), 16);
        return g;
      };
      this.lib = {
        ctypes, P, RECT, INFO,
        clsid: guid("C2CF3110-460E-4fc1-B9D0-8A1C0C9CC4BD"),
        iid: guid("B92B56A9-8B55-4E14-9A89-0199BBB6F93B"),
        create: ole32.declare("CoCreateInstance", ctypes.winapi_abi, HR, GUID.ptr, P, U32, GUID.ptr, P.ptr),
        free: ole32.declare("CoTaskMemFree", ctypes.winapi_abi, ctypes.void_t, P),
        monitorOf: user32.declare("MonitorFromWindow", ctypes.winapi_abi, P, P, U32),
        info: user32.declare("GetMonitorInfoW", ctypes.winapi_abi, ctypes.int32_t, P, INFO.ptr),
        // IDesktopWallpaper's methods: [place in its table, result, arguments].
        methods: {
          release: [2, U32, []],
          wallpaper: [4, HR, [WSTR, WSTR.ptr]],
          monitorAt: [5, HR, [U32, WSTR.ptr]],
          count: [6, HR, [U32.ptr]],
          rect: [7, HR, [WSTR, RECT.ptr]],
          colour: [9, HR, [U32.ptr]],
          position: [11, HR, [ctypes.int32_t.ptr]],
        },
      };
      onUnload(() => {
        ole32.close();
        user32.close();
      });
    } catch (e) {
      console.warn("[Zenith] wallpaper: Windows' wallpaper service isn't available", e);
    }
    return this.lib;
  },

  // Every attached screen: its wallpaper and where it is (device pixels).
  screens() {
    const L = this.open();
    if (!L) return null;
    const { ctypes } = L;
    const obj = L.P();
    if (L.create(L.clsid.address(), null, 0x17, L.iid.address(), obj.address()) < 0 || obj.isNull()) return null;
    const table = ctypes.cast(ctypes.cast(obj, L.P.ptr).contents, L.P.array(20).ptr).contents;
    const call = (name, ...args) => {
      const [slot, result, params] = L.methods[name];
      return ctypes.cast(table[slot], ctypes.FunctionType(ctypes.winapi_abi, result, [L.P, ...params]).ptr)(obj, ...args);
    };
    const text = out => {
      if (out.isNull()) return "";
      const s = out.readString();
      L.free(out);
      return s;
    };
    try {
      const count = ctypes.uint32_t(0);
      if (call("count", count.address()) < 0) return null;
      const list = [];
      for (let i = 0; i < count.value; i++) {
        const idOut = ctypes.char16_t.ptr();
        if (call("monitorAt", i, idOut.address()) < 0) continue;
        const id = text(idOut);
        const r = new L.RECT();
        if (call("rect", id, r.address()) !== 0) continue; // not attached
        const fileOut = ctypes.char16_t.ptr();
        const file = call("wallpaper", id, fileOut.address()) < 0 ? "" : text(fileOut);
        list.push({ file, rect: [r.left, r.top, r.right, r.bottom] });
      }
      const position = ctypes.int32_t(4), colour = ctypes.uint32_t(0);
      call("position", position.address());
      call("colour", colour.address());
      const c = colour.value;
      return {
        list,
        fit: ["center", "tile", "stretch", "fit", "fill", "span"][position.value] ?? "fill",
        colour: `${c & 255} ${(c >> 8) & 255} ${(c >> 16) & 255}`,
      };
    } finally {
      call("release");
    }
  },

  // The screen a window is on (device pixels).
  screenOf(win) {
    const L = this.open();
    if (!L) return null;
    try {
      const handle = win.docShell.treeOwner.QueryInterface(Ci.nsIBaseWindow).nativeHandle;
      const monitor = L.monitorOf(L.P(L.ctypes.UInt64(handle)), 2 /* nearest */);
      const info = new L.INFO();
      info.cbSize = L.INFO.size;
      if (!L.info(monitor, info.address())) return null;
      const m = info.monitor;
      return [m.left, m.top, m.right, m.bottom];
    } catch {
      return null;
    }
  },
};

const Wallpaper = {
  PREF: "zenith.plus.material-windows",
  DESKTOP: "Control Panel\\Desktop",
  MAX_PIXELS: 24e6, // a bigger desktop is drawn smaller (it's blurred anyway)
  // The last drawing, kept in the profile: shown at once when Zen starts,
  // and checked against the desktop a moment later (redrawn only if the
  // wallpaper changed).
  CACHE: "zenith.internal.wallpaper.cache",
  get file() {
    return PathUtils.join(PathUtils.profileDir, "zenith-wallpaper.jpg");
  },

  // A picture of your own instead (Settings › Window material › Wallpaper:
  // a picture of your own): copied into the profile, it covers the window,
  // not the desktop's place behind it.
  OWN: "zenith.plus.wallpaper-source", // "" Windows' wallpaper · "own"
  get ownFile() {
    return PathUtils.join(PathUtils.profileDir, "zenith-wallpaper-own");
  },

  init() {
    if (Services.appinfo.OS !== "WINNT") return;
    const refresh = () => this.refresh();
    Services.prefs.addObserver(this.PREF, refresh);
    Services.prefs.addObserver(this.OWN, refresh);
    window.addEventListener("focus", refresh);
    window.ZenithWallpaper = this; // for tools/checks
    // Settings' "Choose a picture…".
    const commandset = document.createXULElement("commandset"), command = document.createXULElement("command");
    command.id = "zenith-wallpaper-pick-command";
    command.addEventListener("command", () => this.pick());
    commandset.append(command);
    root.append(commandset);
    onUnload(() => {
      Services.prefs.removeObserver(this.PREF, refresh);
      Services.prefs.removeObserver(this.OWN, refresh);
      window.removeEventListener("focus", refresh);
      this.off();
    });
    this.fromCache().then(shown => {
      if (!shown) return this.refresh();
      // Shown from the cache: look at the desktop once Zen has settled.
      return new Promise(r => setTimeout(r, 1500)).then(() => window.requestIdleCallback(() => this.refresh(), { timeout: 3000 }));
    });
  },

  async fromCache() {
    if (Services.prefs.getStringPref(this.PREF, "") !== "" || Services.prefs.getStringPref(this.OWN, "") === "own") return false;
    try {
      const cache = JSON.parse(Services.prefs.getStringPref(this.CACHE, "") || "null");
      if (!cache?.sig) return false;
      const bytes = await IOUtils.read(this.file);
      const url = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
      this.url = url;
      this.sig = cache.sig;
      this.area = cache.area;
      this.anchor = cache.anchor;
      root.style.setProperty("--zth-wall", `url("${url}")`);
      root.setAttribute("zenith-wallpaper", "true");
      this.place(true);
      this.watching(true);
      return true;
    } catch {
      return false;
    }
  },

  async keep(blob, sig, area, anchor) {
    try {
      await IOUtils.write(this.file, new Uint8Array(await blob.arrayBuffer()));
      Services.prefs.setStringPref(this.CACHE, JSON.stringify({ sig, area, anchor }));
    } catch (e) {
      console.error("[Zenith] wallpaper cache", e);
    }
  },

  read(path, name) {
    const key = Cc["@mozilla.org/windows-registry-key;1"].createInstance(Ci.nsIWindowsRegKey);
    try {
      key.open(key.ROOT_KEY_CURRENT_USER, path, key.ACCESS_READ);
      try {
        return key.hasValue(name) ? key.readStringValue(name) : "";
      } finally {
        key.close();
      }
    } catch {
      return "";
    }
  },

  // Each screen's wallpaper from Windows' service (null without it).
  desktop() {
    return Desktop.screens();
  },

  // The screen this window is on, in device pixels.
  current() {
    return Desktop.screenOf(window);
  },

  // What to draw: every screen's picture and place, how pictures are fitted,
  // the colour around them, and the whole desktop's bounds (device pixels).
  async source() {
    const themes = PathUtils.join(Services.dirsvc.get("AppData", Ci.nsIFile).path, "Microsoft", "Windows", "Themes");
    const found = async (...files) => {
      for (const file of files) {
        if (!file) continue;
        try {
          const info = await IOUtils.stat(file);
          if (info.type === "regular") return { file, time: info.lastModified };
        } catch {}
      }
      return { file: null, time: 0 };
    };
    const shared = PathUtils.join(themes, "TranscodedWallpaper");
    const desk = this.desktop();
    if (desk?.list.length) {
      const screens = [];
      for (const [i, s] of desk.list.entries()) {
        const own = PathUtils.join(themes, `Transcoded_${String(i).padStart(3, "0")}`);
        screens.push({ ...(await found(s.file, own, shared)), rect: s.rect });
      }
      const area = screens.reduce((a, s) => [Math.min(a[0], s.rect[0]), Math.min(a[1], s.rect[1]),
                                             Math.max(a[2], s.rect[2]), Math.max(a[3], s.rect[3])],
                                  [Infinity, Infinity, -Infinity, -Infinity]);
      return { screens, area, fit: desk.fit, colour: desk.colour, scale: devicePixelRatio };
    }
    // The registry's one picture, for the window's screen.
    const W = Math.round(screen.width * devicePixelRatio), H = Math.round(screen.height * devicePixelRatio);
    const fit = this.read(this.DESKTOP, "TileWallpaper") === "1" ? "tile"
      : { 0: "center", 2: "stretch", 6: "fit", 10: "fill", 22: "span" }[this.read(this.DESKTOP, "WallpaperStyle")] ?? "fill";
    return {
      screens: [{ ...(await found(this.read(this.DESKTOP, "WallPaper"), shared)), rect: [0, 0, W, H] }],
      area: [0, 0, W, H], fit, colour: this.read("Control Panel\\Colors", "Background") || "0 0 0",
      scale: devicePixelRatio, single: true,
    };
  },

  async refresh() {
    if (Services.prefs.getStringPref(this.PREF, "") !== "") return this.off();
    if (Services.prefs.getStringPref(this.OWN, "") === "own" && (await IOUtils.exists(this.ownFile))) return this.showOwn();
    if (this.ownSize) this.off(); // (back from a picture of your own)
    if (this.busy) return;
    this.busy = true;
    try {
      const t0 = performance.now();
      const src = await this.source();
      const sig = JSON.stringify(src);
      const t1 = performance.now();
      let drawn = null;
      if (sig !== this.sig) {
        drawn = await this.render(src);
        (window.zenithStartup ??= []).push({ script: "plus", name: "wallpaper: read, drew", at: Math.round(t0),
                                             ms: +(t1 - t0).toFixed(1), drew: +(performance.now() - t1).toFixed(1) });
        if (this.url) URL.revokeObjectURL(this.url);
        this.url = URL.createObjectURL(drawn);
        this.sig = sig;
        root.style.setProperty("--zth-wall", `url("${this.url}")`);
        root.setAttribute("zenith-wallpaper", "true");
        window.dispatchEvent(new CustomEvent("ZenithWallpaperDrawn"));
      }
      this.area = src.area;
      // The window's screen: where the drawing is anchored.
      const cur = src.single ? null : this.current();
      this.anchor = (cur && src.screens.find(s => s.rect.join() === cur.join())?.rect) ?? src.screens[0].rect;
      this.place(true);
      this.watching(true);
      if (drawn) this.keep(drawn, sig, this.area, this.anchor);
    } catch (e) {
      console.error("[Zenith] wallpaper", e);
      this.off();
    } finally {
      this.busy = false;
    }
  },

  // The whole desktop as one JPEG (smaller if it's very big), as a blob.
  async render(src) {
    const [L, T, R, B] = src.area;
    // Each picture file read once (IOUtils reads away from the window).
    const files = new Map();
    for (const s of src.screens) {
      if (s.file && !files.has(s.file)) files.set(s.file, await IOUtils.read(s.file));
    }
    const job = {
      area: src.area,
      k: Math.min(1, Math.sqrt(this.MAX_PIXELS / ((R - L) * (B - T)))),
      colour: `rgb(${src.colour.trim().split(/\s+/).join(" ")})`,
      fit: src.fit,
      screens: src.screens.map(s => ({ rect: s.rect, bytes: s.file ? files.get(s.file) : null })),
    };
    try {
      return await this.paintAway(job, [...files.values()].map(b => b.buffer));
    } catch (e) {
      console.warn("[Zenith] wallpaper: drawing in the window instead of a worker", e);
      return (await import(await this.painter())).paint(job);
    }
  },

  // plus/pages/wallpaper.mjs (JS/zenith-pages with the manual install).
  async painter() {
    if (this.painterUrl) return this.painterUrl;
    for (const d of ["../pages/", "zenith-pages/"]) {
      const url = new URL(`${d}wallpaper.mjs`, import.meta.url).href;
      if (await fetch(url).then(r => r.ok, () => false)) return (this.painterUrl = url);
    }
    throw new Error("plus/pages/wallpaper.mjs isn't there");
  },

  // The drawing, done by a worker on its own thread.
  async paintAway(job, transfer) {
    if (!this.worker) {
      this.worker = new Worker(await this.painter(), { type: "module" });
      this.waiting = new Map();
      this.worker.onmessage = ({ data }) => {
        const done = this.waiting.get(data.id);
        this.waiting.delete(data.id);
        if (data.error) done?.reject(new Error(data.error));
        else done?.resolve(data.blob);
      };
      this.worker.onerror = e => {
        e.preventDefault?.();
        for (const done of this.waiting.values()) done.reject(new Error(e.message || "the worker failed"));
        this.waiting.clear();
        this.worker.terminate();
        this.worker = null;
      };
      onUnload(() => this.worker?.terminate());
    }
    const id = (this.jobs = (this.jobs ?? 0) + 1);
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      this.worker.postMessage({ ...job, id }, transfer);
    });
  },


  // Where the desktop's top-left corner is, from the window's, in CSS
  // pixels: the window's screen is where screen.left/top say, and the rest
  // of the desktop is placed around it.
  place(force = false) {
    if (!this.url) return;
    const dpr = devicePixelRatio;
    const here = [screen.left, screen.top, screen.width, screen.height, dpr].join();
    // Another screen (or scale): which screen, and maybe the drawing, again.
    if (this.here && here !== this.here) {
      this.here = here;
      this.refresh();
      return;
    }
    this.here = here;
    const [L, T, R, B] = this.area, a = this.anchor;
    const at = [screen.left - mozInnerScreenX + (L - a[0]) / dpr, screen.top - mozInnerScreenY + (T - a[1]) / dpr,
                (R - L) / dpr, (B - T) / dpr].map(v => Math.round(v * 100) / 100);
    const key = at.join();
    if (!force && key === this.at) return;
    this.at = key;
    ["x", "y", "w", "h"].forEach((n, i) => root.style.setProperty(`--zth-wall-${n}`, `${at[i]}px`));
  },

  // The window has no "moved" event: while a wallpaper is shown, its place
  // is checked a few times a second (cheap; not while it's minimised). A
  // new wallpaper shows when Zen comes back to the front, or within 15
  // seconds (a slideshow).
  watching(on) {
    if (on === !!this.timers) return;
    if (on) {
      this.timers = [setInterval(() => document.hidden || this.place(), 250),
                     setInterval(() => document.hidden || this.refresh(), 15000)];
    } else {
      this.timers.forEach(clearInterval);
      this.timers = null;
    }
  },

  // Your picture, covering the window (centred, cropped to fit).
  async showOwn() {
    try {
      const stat = await IOUtils.stat(this.ownFile);
      const sig = `own:${stat.lastModified}:${stat.size}`;
      if (sig !== this.sig) {
        const blob = new Blob([await IOUtils.read(this.ownFile)]);
        const bitmap = await createImageBitmap(blob);
        this.ownSize = [bitmap.width, bitmap.height];
        bitmap.close();
        if (this.url) URL.revokeObjectURL(this.url);
        this.url = URL.createObjectURL(blob);
        this.sig = sig;
        root.style.setProperty("--zth-wall", `url("${this.url}")`);
        root.setAttribute("zenith-wallpaper", "true");
        window.dispatchEvent(new CustomEvent("ZenithWallpaperDrawn"));
      }
      this.watching(false);
      this.cover();
      if (!this.onResize) {
        this.onResize = () => this.cover();
        window.addEventListener("resize", this.onResize);
      }
    } catch (e) {
      console.error("[Zenith] your wallpaper", e);
      this.off();
    }
  },

  cover() {
    const [iw, ih] = this.ownSize ?? [1, 1], W = window.innerWidth, H = window.innerHeight, k = Math.max(W / iw, H / ih);
    const w = Math.round(iw * k), h = Math.round(ih * k);
    const at = [Math.round((W - w) / 2), Math.round((H - h) / 2), w, h];
    this.at = at.join();
    ["x", "y", "w", "h"].forEach((n, i) => root.style.setProperty(`--zth-wall-${n}`, `${at[i]}px`));
  },

  // Choose a picture: it's copied into the profile (the original can move).
  async pick() {
    const fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
    fp.init(window.browsingContext, "A picture behind Zen", Ci.nsIFilePicker.modeOpen);
    fp.appendFilters(Ci.nsIFilePicker.filterImages);
    const result = await new Promise(resolve => fp.open(resolve));
    if (result !== Ci.nsIFilePicker.returnOK || !fp.file) return;
    try {
      await IOUtils.copy(fp.file.path, this.ownFile);
      this.sig = null;
      // (Window material › Wallpaper, which draws it.)
      Services.prefs.clearUserPref(this.PREF);
      if (Services.prefs.getStringPref(this.OWN, "") === "own") this.refresh();
      else Services.prefs.setStringPref(this.OWN, "own");
    } catch (e) {
      console.error("[Zenith] your wallpaper", e);
      hint("That picture couldn't be copied");
    }
  },

  off() {
    if (this.onResize) window.removeEventListener("resize", this.onResize);
    this.onResize = this.ownSize = null;
    this.watching(false);
    root.removeAttribute("zenith-wallpaper");
    for (const n of ["", "-x", "-y", "-w", "-h"]) root.style.removeProperty(`--zth-wall${n}`);
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = this.sig = this.at = this.here = null;
  },
};

