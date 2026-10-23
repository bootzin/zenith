// SPDX-License-Identifier: GPL-3.0-or-later
// Zenith Shell's bar (Settings › Bar): a status bar across the top or the
// bottom of the window, as polybar and waybar are, instead of browser chrome.
// Imported by zenith-plus.uc.mjs (BarLoader) only while the bar is on, into
// the window that shows it.
//
// Performance first (DESIGN.md, "Zenith Shell", the contract):
//   - one timer for the whole bar, on wall-clock boundaries: the clock wakes
//     once a minute (once a second only if its format shows seconds, or
//     while a timer runs); nothing runs while the window is hidden or
//     minimised, and everything catches up as it comes back;
//   - the rest is events: spaces, tabs, media, downloads, timers;
//   - text is written only when it changes, and nothing reads layout (the
//     taskbar learns its width from a ResizeObserver);
//   - each module is boxed off (contain), so a ticking clock restyles one
//     node, never the bar.

const P = Services.prefs;
const HTML = "http://www.w3.org/1999/xhtml";

function node(tag, attrs = {}, text = "") {
  const n = document.createElementNS(HTML, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text) n.textContent = text;
  return n;
}

// Text only when it differs (no read of the page's layout: the last value is kept).
function put(n, text) {
  if (n.zbText === text) return;
  n.zbText = text;
  n.textContent = text;
}

const pref = (name, def = "") => P.getStringPref(name, "") || def;
const KEPT = "zenith.internal.bar.compact-before"; // compact mode as it was before tabs left the sidebar
const bool = (name, def) => P.getBoolPref(name, def);

/* --- One timer ------------------------------------------------------------- */
const Tick = {
  subs: new Set(),

  // fn runs each time a new `every`-second slot of the clock starts.
  add(every, fn) {
    const sub = { every, fn, slot: -1 };
    this.subs.add(sub);
    this.plan();
    return () => {
      this.subs.delete(sub);
      this.plan();
    };
  },

  plan() {
    clearTimeout(this.timer);
    if (!this.subs.size || document.hidden) return;
    const ms = Math.min(...[...this.subs].map(s => s.every)) * 1000;
    this.timer = setTimeout(() => this.run(), ms - (Date.now() % ms) + 15);
  },

  run(all = false) {
    const now = Date.now() / 1000;
    for (const s of this.subs) {
      const slot = Math.floor(now / s.every);
      if (!all && slot === s.slot) continue;
      s.slot = slot;
      try {
        s.fn();
      } catch (e) {
        console.error("[Zenith] bar", e);
      }
    }
    this.plan();
  },

  init() {
    this.onVisible = () => (document.hidden ? clearTimeout(this.timer) : this.run(true));
    document.addEventListener("visibilitychange", this.onVisible);
  },

  stop() {
    clearTimeout(this.timer);
    this.subs.clear();
    document.removeEventListener("visibilitychange", this.onVisible);
  },
};

// Things to undo as the bar goes.
const Undo = {
  list: [],
  add(fn) {
    this.list.push(fn);
  },
  on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this.add(() => target.removeEventListener(type, fn, opts));
  },
  pref(name, fn) {
    P.addObserver(name, fn);
    this.add(() => P.removeObserver(name, fn));
  },
  run() {
    for (const fn of this.list.splice(0).reverse()) {
      try {
        fn();
      } catch (e) {
        console.error("[Zenith] bar", e);
      }
    }
  },
};

// Once per frame at most, however many events ask.
function soon(fn) {
  let queued = false;
  return () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      fn();
    });
  };
}

/* --- Icons: Zenith's own (drawn by CSS), Nerd Font glyphs, or text ------------ */
const GLYPHS = {
  nerd: { launcher: "", play: "", pause: "", download: "", done: "", timer: "", tray: "", clock: "" },
  text: { launcher: "≡", play: "▶", pause: "⏸", download: "↓", done: "✓", timer: "⧗", tray: "+", clock: "" },
};

function icon(name) {
  const look = pref("zenith.bar.icons", "svg");
  if (look === "svg") return node("span", { class: "zb-i", icon: name, "aria-hidden": "true" });
  const glyph = GLYPHS[look]?.[name] ?? "";
  return glyph ? node("span", { class: "zb-g", "aria-hidden": "true" }, glyph) : node("span", { hidden: "true" });
}

function setIcon(span, name) {
  if (span.classList.contains("zb-i")) span.setAttribute("icon", name);
  else put(span, GLYPHS[pref("zenith.bar.icons", "svg")]?.[name] ?? "");
}

// A module whose text ticks keeps the width it has (measured once, as its
// format changes, not each tick), so a tick lays out that module only.
function fixWidth(m) {
  m.style.width = "";
  m.style.contain = "";
  const w = m.getBoundingClientRect().width;
  if (!w) return;
  m.style.width = `${Math.ceil(w)}px`;
  m.style.contain = "strict";
  m.setAttribute("fixed", "true");
}

function mod(id, tag = "div") {
  return node(tag, { class: "zb-mod", mod: id, ...(tag === "button" ? { type: "button" } : {}) });
}

/* --- The modules ----------------------------------------------------------- */

// The switcher (Alt+W), as a launcher button.
function launcher(box) {
  const b = mod("launcher", "button");
  b.title = "Switcher (Alt+W)";
  b.append(icon("launcher"));
  b.addEventListener("click", () => window.ZenithSwitcher?.toggle?.());
  box.append(b);
}

// Spaces as workspaces: the one you're in, the ones with tabs, and one
// asking for attention (a tab in it is); a click goes there, the wheel walks them.
function spaces(box) {
  const W = window.gZenWorkspaces;
  if (!W) return;
  const wrap = mod("spaces");
  box.append(wrap);
  const KANJI = "一二三四五六七八九十";
  const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  let ids = "";
  const draw = soon(() => {
    const list = W.getWorkspaces?.() ?? [], look = pref("zenith.bar.spaces", "numbers"), active = W.activeWorkspace;
    const key = list.map(s => `${s.uuid}:${s.name}:${s.icon}`).join("|") + look;
    if (key !== ids) {
      ids = key;
      wrap.setAttribute("look", look);
      wrap.replaceChildren(...list.map((s, i) => {
        const b = node("button", { type: "button", class: "zb-space", title: s.name || `Space ${i + 1}` });
        b.zbSpace = s.uuid;
        const label = look === "names" ? s.name || `${i + 1}` : look === "kanji" ? KANJI[i] ?? `${i + 1}`
                    : look === "roman" ? ROMAN[i] ?? `${i + 1}` : look === "dots" ? "" : look === "icons" ? "" : `${i + 1}`;
        if (look === "icons" && s.icon) {
          if (/^(chrome|data|moz-|https?|resource|page-icon):/.test(s.icon)) b.append(node("img", { src: s.icon, alt: "" }));
          else b.textContent = s.icon;
        } else b.textContent = label || (look === "icons" ? `${i + 1}` : "");
        return b;
      }));
    }
    const busy = new Map(), loud = new Set();
    const attention = P.getStringPref("zenith.tabs.attention-for", "") !== "alerts";
    for (const t of gBrowser.tabs) {
      const id = t.getAttribute("zen-workspace-id");
      if (!id || t.hasAttribute("zen-empty-tab")) continue;
      busy.set(id, true);
      if (t.hasAttribute("attention") || (attention && t.hasAttribute("titlechanged"))) loud.add(id);
    }
    for (const b of wrap.children) {
      b.toggleAttribute("current", b.zbSpace === active);
      b.toggleAttribute("busy", busy.has(b.zbSpace));
      b.toggleAttribute("urgent", loud.has(b.zbSpace) && b.zbSpace !== active);
    }
  });
  wrap.addEventListener("click", e => {
    const id = e.target.closest(".zb-space")?.zbSpace;
    if (id && id !== W.activeWorkspace) W.changeWorkspaceWithID(id);
  });
  let sum = 0, at = 0;
  wrap.addEventListener("wheel", e => {
    const now = performance.now();
    if (now - at > 400) sum = 0;
    at = now;
    sum += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
    if (Math.abs(sum) < 40) return;
    W.changeWorkspaceShortcut?.(sum > 0 ? 1 : -1);
    sum = 0;
  }, { passive: true });
  W.addChangeListeners?.(draw);
  Undo.add(() => W.removeChangeListeners?.(draw));
  for (const t of ["ZenWorkspaceDataChanged", "ZenWorkspacesUIUpdate"]) Undo.on(window, t, draw);
  for (const t of ["TabOpen", "TabClose", "TabSelect"]) Undo.on(gBrowser.tabContainer, t, draw);
  Undo.on(gBrowser.tabContainer, "TabAttrModified", e => {
    if (e.detail?.changed?.some(a => a === "attention" || a === "titlechanged")) draw();
  });
  Undo.pref("zenith.bar.spaces", draw);
  draw();
}

// The binding mode (resize, passthrough), as i3bar shows it.
function modeSlot(box) {
  const m = mod("mode");
  m.hidden = true;
  box.append(m);
  Bar.modeNode = m;
}

// The tab you're on: its title, or the site and its title.
function title(box) {
  const m = mod("title"), text = node("span", { class: "zb-title-text" });
  m.append(text);
  box.append(m);
  const draw = soon(() => {
    const t = gBrowser.selectedTab, look = pref("zenith.bar.title", "title");
    let host = "";
    try {
      host = gBrowser.currentURI?.host?.replace(/^www\./, "") ?? "";
    } catch {}
    put(text, look === "site" && host ? `${host} · ${t.label}` : t.label);
    m.title = t.label;
  });
  Undo.on(gBrowser.tabContainer, "TabSelect", draw);
  Undo.on(gBrowser.tabContainer, "TabAttrModified", e => {
    if (e.target === gBrowser.selectedTab && e.detail?.changed?.includes("label")) draw();
  });
  Undo.pref("zenith.bar.title", draw);
  draw();
}

// Tabs in the bar (Bar › Tabs: in the bar), as waybar's taskbar: this
// space's tabs as icons, and titles as the look and the room allow.
function tasks(box) {
  const m = mod("tasks");
  box.append(m);
  const items = new Map(); // tab → button
  const WIDE = { icons: 30, current: 30, titles: 158 };
  let room = 0;
  const look = () => {
    const want = pref("zenith.bar.tab-look", "current");
    if (want !== "fit") return want;
    const n = m.children.length;
    if (n * WIDE.titles <= room) return "titles";
    if ((n - 1) * WIDE.current + 200 <= room) return "current";
    return "icons";
  };
  const draw = soon(() => {
    const tabs = gBrowser.visibleTabs.filter(t => !t.closing && !t.hasAttribute("zen-empty-tab") && !t.hasAttribute("zen-glance-tab"));
    const keep = new Set(tabs);
    for (const [t, b] of items) {
      if (!keep.has(t)) {
        b.remove();
        items.delete(t);
      }
    }
    tabs.forEach((t, i) => {
      let b = items.get(t);
      if (!b) {
        b = node("button", { type: "button", class: "zb-task" });
        b.zbTab = t;
        b.append(node("img", { alt: "" }), node("span", { class: "zb-task-label" }), node("span", { class: "zb-task-n" }));
        items.set(t, b);
      }
      if (m.children[i] !== b) m.insertBefore(b, m.children[i] ?? null);
      const img = b.firstChild, src = t.getAttribute("image") || "";
      if (img.getAttribute("src") !== src) {
        if (src) img.setAttribute("src", src);
        else img.removeAttribute("src");
      }
      put(b.children[1], t.label);
      put(b.children[2], `${i + 1}`);
      b.title = t.label;
      b.toggleAttribute("current", t.selected);
      b.toggleAttribute("asleep", t.hasAttribute("pending"));
      b.toggleAttribute("loud", t.hasAttribute("soundplaying"));
      b.toggleAttribute("split", !!t.splitView);
    });
    m.setAttribute("look", look());
  });
  m.addEventListener("click", e => {
    const t = e.target.closest(".zb-task")?.zbTab;
    if (t?.isConnected) gBrowser.selectedTab = t;
  });
  m.addEventListener("auxclick", e => {
    const t = e.button === 1 && e.target.closest(".zb-task")?.zbTab;
    if (t?.isConnected) gBrowser.removeTab(t, { animate: true });
  });
  m.addEventListener("wheel", e => {
    if (Math.abs(e.deltaY) < 1) return;
    gBrowser.tabContainer.advanceSelectedTab(e.deltaY > 0 ? 1 : -1, true);
  }, { passive: true });
  const ro = new ResizeObserver(entries => {
    room = entries.at(-1).contentRect.width;
    if (pref("zenith.bar.tab-look", "current") === "fit") draw();
  });
  ro.observe(m);
  Undo.add(() => ro.disconnect());
  for (const t of ["TabOpen", "TabClose", "TabMove", "TabSelect", "TabShow", "TabHide"]) Undo.on(gBrowser.tabContainer, t, draw);
  Undo.on(gBrowser.tabContainer, "TabAttrModified", e => {
    if (e.detail?.changed?.some(a => a === "label" || a === "image" || a === "pending" || a === "soundplaying")) draw();
  });
  window.gZenWorkspaces?.addChangeListeners?.(draw);
  Undo.add(() => window.gZenWorkspaces?.removeChangeListeners?.(draw));
  Undo.pref("zenith.bar.tab-look", draw);
  draw();
}

// What's playing (Firefox's media controls of the tab): ▶/⏸ and its
// title and artist; the icon plays or pauses, the title goes to its tab,
// the wheel skips.
function media(box) {
  const m = mod("media");
  const btn = node("button", { type: "button", class: "zb-media-play", title: "Play or pause" });
  const ic = icon("play"), text = node("span", { class: "zb-media-text" });
  btn.append(ic);
  m.append(btn, text);
  m.hidden = true;
  box.append(m);
  let tab = null, ctrl = null;
  const watch = c => {
    if (ctrl === c) return;
    for (const t of ["metadatachange", "playbackstatechange", "deactivated"]) {
      ctrl?.removeEventListener(t, draw);
      c?.addEventListener(t, draw);
    }
    ctrl = c;
  };
  const draw = soon(() => {
    if (tab && (!tab.isConnected || !ctrl?.isActive)) {
      tab = null;
      watch(null);
    }
    m.hidden = !tab;
    if (!tab) return;
    let meta = null;
    try {
      meta = ctrl.getMetadata();
    } catch {}
    put(text, [meta?.title || tab.label, meta?.artist].filter(Boolean).join(" · "));
    text.title = text.textContent;
    setIcon(ic, ctrl.isPlaying ? "pause" : "play");
    m.toggleAttribute("playing", !!ctrl.isPlaying);
  });
  const follow = e => {
    if (!e.detail?.changed?.includes("soundplaying")) return;
    const t = e.target;
    if (t.hasAttribute("soundplaying")) {
      tab = t;
      watch(t.linkedBrowser?.browsingContext?.mediaController ?? null);
    }
    draw();
  };
  Undo.on(gBrowser.tabContainer, "TabAttrModified", follow);
  Undo.add(() => watch(null));
  btn.addEventListener("click", () => {
    if (!ctrl) return;
    if (ctrl.isPlaying) ctrl.pause();
    else ctrl.play();
  });
  text.addEventListener("click", () => tab?.isConnected && (gBrowser.selectedTab = tab));
  m.addEventListener("wheel", e => {
    if (!ctrl || Math.abs(e.deltaY) < 1) return;
    if (e.deltaY > 0) ctrl.nextTrack();
    else ctrl.prevTrack();
  }, { passive: true });
  const playing = gBrowser.tabs.find(t => t.hasAttribute("soundplaying"));
  if (playing) follow({ target: playing, detail: { changed: ["soundplaying"] } });
}

// Downloads under way: how many and how far; a tick for a moment once
// they're done. A click opens Firefox's downloads.
function downloads(box) {
  const m = mod("downloads", "button");
  const ic = icon("download"), text = node("span");
  m.append(ic, text);
  m.hidden = true;
  m.title = "Downloads";
  box.append(m);
  m.addEventListener("click", () => (window.DownloadsPanel?.showPanel ? DownloadsPanel.showPanel() : BrowserCommands.downloadsUI?.()));
  const all = new Set();
  let doneTimer = null;
  const draw = soon(() => {
    const going = [...all].filter(d => !d.stopped);
    if (going.length) {
      clearTimeout(doneTimer);
      doneTimer = null;
      const sized = going.filter(d => d.hasProgress && d.totalBytes > 0);
      const pc = sized.length ? Math.floor((100 * sized.reduce((a, d) => a + d.currentBytes, 0)) / sized.reduce((a, d) => a + d.totalBytes, 0)) : null;
      put(text, `${going.length > 1 ? `${going.length} · ` : ""}${pc === null ? "…" : `${pc}%`}`);
      setIcon(ic, "download");
      m.hidden = false;
    } else if (!m.hidden && !doneTimer) {
      put(text, "");
      setIcon(ic, "done");
      doneTimer = setTimeout(() => {
        doneTimer = null;
        m.hidden = true;
      }, 4000);
    }
  });
  const view = {
    onDownloadAdded: d => {
      all.add(d);
      draw();
    },
    onDownloadChanged: draw,
    onDownloadRemoved: d => {
      all.delete(d);
      draw();
    },
  };
  const { Downloads } = ChromeUtils.importESModule("resource://gre/modules/Downloads.sys.mjs");
  let list = null;
  Downloads.getList(Downloads.ALL).then(l => {
    if (Bar.gone) return;
    list = l;
    l.addView(view);
  });
  Undo.add(() => {
    clearTimeout(doneTimer);
    list?.removeView(view);
  });
}

// Zenith's timers and pomodoros (Peek: timer 10m tea): the next to end,
// ticking each second while one runs.
function timers(box) {
  const m = mod("timers", "button");
  const ic = icon("timer"), text = node("span");
  m.append(ic, text);
  m.hidden = true;
  box.append(m);
  m.addEventListener("click", () => window.ZenithSwitcher?.toggle?.());
  let stopTick = null;
  const read = () => {
    try {
      const list = JSON.parse(P.getStringPref("zenith.internal.timers", "[]"));
      return Array.isArray(list) ? list.filter(t => t && t.end > Date.now()) : [];
    } catch {
      return [];
    }
  };
  const draw = () => {
    const list = read().sort((a, b) => a.end - b.end), next = list[0];
    m.hidden = !next;
    if (!next) {
      m.style.width = "";
      stopTick?.();
      stopTick = null;
      return;
    }
    const s = Math.max(0, Math.ceil((next.end - Date.now()) / 1000));
    const h = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = `${s % 60}`.padStart(2, "0");
    const was = text.zbText?.length;
    put(text, `${next.label ? `${next.label} ` : ""}${h ? `${h}:${`${mm}`.padStart(2, "0")}` : mm}:${ss}${list.length > 1 ? ` +${list.length - 1}` : ""}`);
    // (Measured once it's in the window, and again as its length changes.)
    if (text.zbText.length !== was || !m.style.width) requestAnimationFrame(() => fixWidth(m));
    m.title = "Timers (Alt+W, then :timer)";
    stopTick ??= Tick.add(1, draw);
  };
  Undo.pref("zenith.internal.timers", draw);
  Undo.add(() => stopTick?.());
  draw();
}

// Extensions: Firefox's extensions panel, as a tray.
function tray(box) {
  const m = mod("tray", "button");
  m.title = "Extensions";
  m.append(icon("tray"));
  m.addEventListener("click", e => window.gUnifiedExtensions?.togglePanel?.(e));
  box.append(m);
}

// The clock, in your format; a click shows the date instead, and back.
function clock(box) {
  const m = mod("clock", "button");
  const text = node("span");
  m.append(text);
  box.append(m);
  let alt = false, stop = null;
  const FORMATS = {
    hm: { hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
    dhm: { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
    iso: null,
    hms: { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" },
    "12h": { hour: "numeric", minute: "2-digit", hour12: true },
  };
  const DATE = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  let fmt = null, look = "";
  const draw = () => {
    const now = new Date();
    if (alt) put(text, DATE.format(now));
    else if (look === "iso") {
      const p = n => `${n}`.padStart(2, "0");
      put(text, `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`);
    } else put(text, fmt.format(now));
    m.title = DATE.format(now);
  };
  const setup = () => {
    look = pref("zenith.bar.clock", "hm");
    m.hidden = look === "off";
    stop?.();
    stop = null;
    if (look === "off") return;
    fmt = new Intl.DateTimeFormat(undefined, FORMATS[look] ?? FORMATS.hm);
    stop = Tick.add(look === "hms" ? 1 : 60, draw);
    draw();
    requestAnimationFrame(() => fixWidth(m));
  };
  m.addEventListener("click", () => {
    alt = !alt;
    draw();
    fixWidth(m);
  });
  Undo.pref("zenith.bar.clock", setup);
  Undo.add(() => stop?.());
  setup();
}

// The window's own buttons (minimise, maximise, close), moved into the bar
// at the top so it's the title bar; back where they were as the bar goes.
function buttons(box) {
  const m = mod("buttons");
  box.append(m);
  const take = () => {
    const b = document.querySelector(".titlebar-buttonbox-container");
    if (!b || b.parentNode === m) return;
    Bar.buttonsHome ??= { parent: b.parentNode, next: b.nextSibling };
    m.append(b);
  };
  take();
  // (Zen may put them back as it rearranges its toolbars: taken again.)
  const mo = new MutationObserver(() => !m.querySelector(".titlebar-buttonbox-container") && take());
  mo.observe(document.getElementById("zen-main-app-wrapper") ?? document.body, { childList: true, subtree: true });
  Undo.add(() => {
    mo.disconnect();
    const b = m.querySelector(".titlebar-buttonbox-container"), home = Bar.buttonsHome;
    if (b && home?.parent?.isConnected) home.parent.insertBefore(b, home.next?.parentNode === home.parent ? home.next : null);
    Bar.buttonsHome = null;
  });
}

/* --- The bar itself ------------------------------------------------------------ */
const Bar = {
  build(where, parts) {
    const bar = node("div", { id: where === "bottom-tabs" ? "zenith-bar-bottom" : "zenith-bar", role: "toolbar", "aria-label": "Zenith bar" });
    const left = node("div", { class: "zb-left" }), centre = node("div", { class: "zb-centre" }), right = node("div", { class: "zb-right" });
    bar.append(left, centre, right);
    for (const [side, fn] of parts) fn({ left, centre, right }[side]);
    if (parts.some(([, fn]) => fn === tasks)) bar.setAttribute("tasks", "true");
    return bar;
  },

  look() {
    for (const bar of this.bars) {
      bar.setAttribute("look", pref("zenith.bar.style", "islands"));
      bar.setAttribute("size", pref("zenith.bar.size", "30"));
      bar.setAttribute("font", pref("zenith.bar.font", "mono"));
    }
    // (Another look, size or font: the fixed-width modules measured again.)
    requestAnimationFrame(() => {
      for (const bar of this.bars) for (const m of bar.querySelectorAll(".zb-mod[fixed]")) fixWidth(m);
    });
  },

  start(api) {
    const t0 = performance.now();
    this.api = api;
    this.gone = false;
    Tick.init();
    const where = pref("zenith.bar.position", "off"), tabsIn = pref("zenith.bar.tabs", "sidebar");
    const on = name => bool(`zenith.bar.${name}`, true);
    const status = [
      on("launcher") && ["left", launcher], ["left", spaces], ["left", modeSlot],
      on("media") && ["right", media], on("downloads") && ["right", downloads], on("timers") && ["right", timers],
      on("tray") && ["right", tray], ["right", clock],
    ].filter(Boolean);
    const centre = tabsIn === "bar" && where !== "both" ? ["centre", tasks] : pref("zenith.bar.title", "title") !== "off" && ["centre", title];
    const app = document.getElementById("zen-main-app-wrapper");
    this.bars = [];
    if (where === "bottom") {
      const bar = this.build("bottom", [...status, centre].filter(Boolean));
      bar.setAttribute("position", "bottom");
      app.append(bar);
      this.bars.push(bar);
    } else {
      const bar = this.build("top", [...status, centre, ["right", buttons]].filter(Boolean));
      bar.setAttribute("position", "top");
      app.prepend(bar);
      this.bars.push(bar);
      if (where === "both") {
        const low = this.build("bottom-tabs", [["centre", tasks]]);
        low.setAttribute("position", "bottom");
        app.append(low);
        this.bars.push(low);
      }
    }
    document.documentElement.setAttribute("zenith-bar", where);
    this.look();
    for (const p of ["zenith.bar.style", "zenith.bar.size", "zenith.bar.font"]) Undo.pref(p, () => this.look());
    this.tabs(tabsIn);
    (window.zenithStartup ??= []).push({ script: "bar", name: "bar", at: Math.round(t0), ms: +(performance.now() - t0).toFixed(1) });
  },

  // Where tabs live while the bar is on: the sidebar as it is; the
  // sidebar only on hover (Zen's compact mode); or in the bar, with no
  // sidebar (compact mode, and its edge hover off: the address bar and
  // Ctrl+Alt+S still bring it).
  tabs(where) {
    if (where === "sidebar") return this.tabsBack(this.api.Bridge);
    document.documentElement.setAttribute("zenith-bar-tabs", where);
    const C = window.gZenCompactModeManager;
    this.api.Bridge.apply("bar-tabs", { "zen.view.compact.show-sidebar-and-toolbar-on-hover": where === "bar" ? false : null });
    if (!C) return;
    if (!P.prefHasUserValue(KEPT)) P.setStringPref(KEPT, String(C.preference));
    if (!C.preference) C.preference = true;
  },

  // The sidebar as it was: compact mode back as you had it.
  tabsBack(Bridge) {
    document.documentElement.removeAttribute("zenith-bar-tabs");
    Bridge.apply("bar-tabs", { "zen.view.compact.show-sidebar-and-toolbar-on-hover": null });
    const C = window.gZenCompactModeManager;
    if (!C || !P.prefHasUserValue(KEPT)) return;
    const was = P.getStringPref(KEPT, "") === "true";
    P.clearUserPref(KEPT);
    if (C.preference !== was) C.preference = was;
  },

  mode(text) {
    if (!this.modeNode) return false;
    put(this.modeNode, text ?? "");
    this.modeNode.hidden = !text;
    return true;
  },

  // keepTabs: the bar is only being rebuilt (or the window closing), so
  // where tabs are stays as it is.
  stop({ keepTabs = false } = {}) {
    this.gone = true;
    Tick.stop();
    Undo.run();
    for (const bar of this.bars ?? []) bar.remove();
    this.bars = [];
    this.modeNode = null;
    document.documentElement.removeAttribute("zenith-bar");
    if (!keepTabs) this.tabsBack(this.api.Bridge);
  },
};

export function start(api) {
  Bar.start(api);
  return Bar;
}
