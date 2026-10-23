// SPDX-License-Identifier: GPL-3.0-or-later
// Zenith Shell's shared pieces: the small popups that drop from the bar
// (timers, downloads, extensions, trackers, site appearance) and the cards
// the Dash is made of, and what they show (weather, timers, downloads, what
// Firefox uses, trackers blocked). Imported by plus/pages/bar.mjs and
// plus/pages/dash.mjs, into the window that shows them; nothing here runs
// until one of them asks.

const P = Services.prefs;
const HTML = "http://www.w3.org/1999/xhtml";

export function node(tag, attrs = {}, text = "") {
  const n = document.createElementNS(HTML, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text) n.textContent = text;
  return n;
}

// Text only when it differs.
export function put(n, text) {
  if (n.zbText === text) return;
  n.zbText = text;
  n.textContent = text;
}

export function button(label, cls = "zs-btn", title = "") {
  const b = node("button", { type: "button", class: cls }, label);
  if (title) b.title = title;
  return b;
}

export function ico(name) {
  return node("span", { class: "zs-i", icon: name, "aria-hidden": "true" });
}

export function bytes(n) {
  if (!(n >= 0)) return "";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n < 10 && i ? n.toFixed(1) : Math.round(n)} ${u[i]}`;
}

/* --- A popup under (or above) a bar's module --------------------------------------
   One at a time; it goes on a click elsewhere, Esc, or its module's click
   again. The popup's builder returns what to undo as it goes. */
export const Popup = {
  // (No anchor, as Alt+N with the bar off: at the top, in the middle.)
  // at: "top-centre", "centre", "bottom-right"…: there in the page area,
  // whatever opened it; a click on anything matching `keep` (what opens it)
  // is left to that to close it.
  open(anchor, build, { kind = "", wide = false, at = "", keep = "", hover = false } = {}) {
    const again = !!this.node && this.kind === kind && (this.anchor === anchor || !!at);
    this.close();
    if (again) return;
    const pop = (this.node = node("div", { class: "zs-pop", kind, role: "dialog" }));
    if (wide) pop.setAttribute("wide", "true");
    this.anchor = anchor;
    this.kind = kind;
    this.at = at;
    this.bar = anchor?.closest?.(".zenith-bar") ?? null;
    this.bar?.setAttribute("holding", "true");
    (document.getElementById("zen-main-app-wrapper") ?? document.body).append(pop);
    this.undo = build(pop) ?? null;
    this.place();
    this.away = e => {
      if (e.type === "keydown") {
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopPropagation();
        return this.close();
      }
      if (!pop.contains(e.target) && !anchor?.contains(e.target) && !(keep && e.target.closest?.(keep))) this.close();
    };
    window.addEventListener("mousedown", this.away, true);
    window.addEventListener("keydown", this.away, true);
    window.addEventListener("blur", this.away);
    if (hover) {
      const stay = () => clearTimeout(this.leaving);
      const go = () => {
        clearTimeout(this.leaving);
        this.leaving = setTimeout(() => this.node === pop && this.close(), 300);
      };
      const on = [[pop, "mouseenter", stay], [pop, "mouseleave", go], [anchor, "mouseenter", stay], [anchor, "mouseleave", go]];
      for (const [n, t, f] of on) n?.addEventListener?.(t, f);
      this.unhover = () => {
        clearTimeout(this.leaving);
        for (const [n, t, f] of on) n?.removeEventListener?.(t, f);
      };
    }
  },

  // Under the module (above it for a bar at the bottom, beside it for one on
  // the left or right), its edge with the module's, inside the window. A
  // hidden bar sliding out is placed where it'll be, not where it is.
  place() {
    const pop = this.node;
    if (!pop) return;
    const W = window.innerWidth, H = window.innerHeight, w = pop.offsetWidth, h = pop.offsetHeight;
    if (this.at) {
      // (The page area: beside the sidebar and the bars, 8px in.)
      const r = document.getElementById("tabbrowser-tabbox")?.getBoundingClientRect() ?? { left: 0, top: 0, right: W, bottom: H, width: W, height: H };
      const [v, hz = "centre"] = this.at === "centre" ? ["centre", "centre"] : this.at.split("-");
      const x = hz === "left" ? r.left + 8 : hz === "right" ? r.right - w - 8 : r.left + (r.width - w) / 2;
      const y = v === "top" ? r.top + 8 : v === "bottom" ? r.bottom - h - 8 : r.top + (r.height - h) / 2;
      pop.style.left = `${Math.round(Math.max(8, Math.min(x, W - w - 8)))}px`;
      pop.style.top = `${Math.round(Math.max(8, Math.min(y, H - h - 8)))}px`;
      pop.setAttribute("from", v === "bottom" ? "below" : "above");
      return;
    }
    let a = this.anchor?.getBoundingClientRect() ?? { left: (W - w) / 2, right: (W + w) / 2, width: w, top: 0, bottom: 42, height: 42 };
    const edge = this.bar?.getAttribute("edge");
    if (this.bar?.hasAttribute("collapsible")) {
      const [dx = 0, dy = 0] = (getComputedStyle(this.bar).translate || "").split(" ").map(v => parseFloat(v) || 0);
      a = { left: a.left - dx, right: a.right - dx, top: a.top - dy, bottom: a.bottom - dy, width: a.width, height: a.height };
    }
    const clampX = x => `${Math.max(8, Math.min(x, W - w - 8))}px`, clampY = y => `${Math.max(8, Math.min(y, H - h - 8))}px`;
    if (edge === "left" || edge === "right") {
      pop.style.left = clampX(edge === "left" ? a.right + 6 : a.left - w - 6);
      pop.style.top = clampY(a.top + a.height / 2 > H / 2 ? a.bottom - h : a.top);
      pop.setAttribute("from", edge);
      return;
    }
    const low = edge === "bottom" || (!edge && a.top > H / 2);
    pop.style.left = clampX(a.left + a.width / 2 > W / 2 ? Math.min(a.right, W - 8) - w : Math.max(8, a.left));
    if (low) pop.style.bottom = `${H - a.top + 6}px`;
    else pop.style.top = `${a.bottom + 6}px`;
    pop.setAttribute("from", low ? "below" : "above");
  },

  close() {
    if (!this.node) return;
    window.removeEventListener("mousedown", this.away, true);
    window.removeEventListener("keydown", this.away, true);
    window.removeEventListener("blur", this.away);
    this.unhover?.();
    this.unhover = null;
    try {
      this.undo?.();
    } catch (e) {
      console.error("[Zenith] popup", e);
    }
    this.node.remove();
    this.bar?.removeAttribute("holding");
    this.node = this.anchor = this.undo = this.kind = this.bar = null;
    this.at = "";
  },
};

// A second's tick while a popup or the Dash is open (not the bar's own timer:
// only while it's open).
export function everySecond(fn) {
  fn();
  const t = setInterval(() => document.hidden || fn(), 1000);
  return () => clearInterval(t);
}

/* --- Weather: wttr.in, as Peek and the start page ---------------------------------
   One request for now and three days, kept 30 minutes in a hidden setting
   that every window shares (only one fetches). Where: near you (wttr.in
   works it out from your connection) or Peek's last weather place
   (Settings › Bar › Weather for). Units as Peek's. */
const SKY = [
  [[113], "sun"], [[116], "partly"], [[119, 122], "cloud"], [[143, 248, 260], "fog"],
  [[200, 386, 389, 392, 395], "storm"],
  [[179, 182, 185, 227, 230, 317, 320, 323, 326, 329, 332, 335, 338, 350, 362, 365, 368, 371, 374, 377], "snow"],
];

export const Weather = {
  CACHE: "zenith.internal.weather",
  TTL: 30 * 60e3,

  sky(code) {
    const c = +code;
    return SKY.find(([codes]) => codes.includes(c))?.[1] ?? (c ? "rain" : "cloud");
  },

  place() {
    if (P.getStringPref("zenith.bar.weather-place", "") !== "peek") return "";
    try {
      return window.ZenithPeek?.weatherPlaces?.()?.[0] ?? "";
    } catch {
      return "";
    }
  },

  imperial() {
    const set = P.getStringPref("zenith.peek.units", "");
    if (set && set !== "auto") return set === "imperial";
    try {
      const { Region } = ChromeUtils.importESModule("resource://gre/modules/Region.sys.mjs");
      return ["US", "LR", "MM"].includes((Region.home || Region.current || "").toUpperCase());
    } catch {
      return false;
    }
  },

  cached() {
    try {
      const c = JSON.parse(P.getStringPref(this.CACHE, "") || "null");
      return c && c.place === this.place() ? c : null;
    } catch {
      return null;
    }
  },

  // The weather, fetched again only once it's 30 minutes old.
  async get() {
    const c = this.cached();
    if (c && Date.now() - c.at < this.TTL) return c;
    if (this.busy) return this.busy;
    this.busy = (async () => {
      try {
        const place = this.place(), lang = (Services.locale.appLocaleAsBCP47 || "en").split("-")[0];
        const r = await fetch(`https://wttr.in/${encodeURIComponent(place)}?format=j1${lang === "en" ? "" : `&lang=${lang}`}`,
                              { credentials: "omit", cache: "no-store" });
        const j = await r.json(), now = j?.current_condition?.[0];
        if (!now) return c;
        const F = this.imperial(), area = j.nearest_area?.[0];
        const out = {
          at: Date.now(), place,
          where: area?.areaName?.[0]?.value || place || "",
          unit: F ? "°F" : "°C",
          now: { t: F ? now.temp_F : now.temp_C, feels: F ? now.FeelsLikeF : now.FeelsLikeC, sky: this.sky(now.weatherCode),
                 text: (now[`lang_${lang}`]?.[0]?.value ?? now.weatherDesc?.[0]?.value ?? "").trim() },
          days: (j.weather ?? []).slice(0, 3).map(d => ({
            date: d.date, max: F ? d.maxtempF : d.maxtempC, min: F ? d.mintempF : d.mintempC,
            sky: this.sky(d.hourly?.[4]?.weatherCode ?? d.hourly?.[0]?.weatherCode),
          })),
        };
        P.setStringPref(this.CACHE, JSON.stringify(out));
        return out;
      } catch {
        return c;
      } finally {
        this.busy = null;
      }
    })();
    return this.busy;
  },
};

/* --- Timers (zenith-timers.uc.mjs) ------------------------------------------------- */
export const Timers = {
  api() {
    return window.ZenithTimers ?? null;
  },

  list() {
    return (this.api()?.list() ?? []).filter(t => t.end > Date.now()).sort((a, b) => a.end - b.end);
  },

  left(t) {
    const s = Math.max(0, Math.ceil((t.end - Date.now()) / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = `${s % 60}`.padStart(2, "0");
    return h ? `${h}:${`${m}`.padStart(2, "0")}:${ss}` : `${m}:${ss}`;
  },

  // "10m tea", "25", "1h30m": a timer; "pomo": a pomodoro.
  start(text) {
    const T = this.api();
    if (!T || !text.trim()) return false;
    if (/^pomo\b/i.test(text.trim())) {
      const p = T.parsePattern?.(text.trim().replace(/^pomo\b/i, "").trim());
      T.startPomodoro?.(p || undefined);
      return true;
    }
    const d = T.parse?.(text);
    if (!d) return false;
    T.start(d.ms, d.label);
    return true;
  },
};

// The running timers, ticking, each with ✕; a field starts another.
export function timersCard(box) {
  const list = node("div", { class: "zs-list" });
  const field = node("input", { class: "zs-field", type: "text", spellcheck: "false", placeholder: "Start one: 10m tea · 25 · pomo" });
  box.append(node("div", { class: "zs-head" }, "Timers"), list, field);
  let ids = "";
  const draw = () => {
    const all = Timers.list(), key = all.map(t => `${t.id}:${t.label}`).join("|");
    if (key !== ids) {
      ids = key;
      list.replaceChildren(...(all.length ? all.map(t => {
        const row = node("div", { class: "zs-row" });
        const name = node("span", { class: "zs-grow" }, t.label || (t.pomodoro ? "Pomodoro" : "Timer"));
        const left = node("span", { class: "zs-big" });
        left.zbTimer = t;
        const x = button("✕", "zs-btn zs-x", "Cancel it");
        x.addEventListener("click", () => {
          Timers.api()?.cancel(t.id);
          draw();
        });
        row.append(ico("timer"), name, left, x);
        return row;
      }) : [node("div", { class: "zs-empty" }, "No timers running.")]));
    }
    for (const el of list.querySelectorAll(".zs-big")) put(el, Timers.left(el.zbTimer));
  };
  field.addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (Timers.start(field.value)) {
      field.value = "";
      setTimeout(draw, 50);
    } else field.setAttribute("bad", "true");
  });
  field.addEventListener("input", () => field.removeAttribute("bad"));
  const stop = everySecond(draw);
  P.addObserver("zenith.internal.timers", draw);
  return () => {
    stop();
    P.removeObserver("zenith.internal.timers", draw);
  };
}

// Zen's Library at a section (downloads, history…); Firefox's Library
// window when Zen's is off.
export function openLibrary(section) {
  const Lib = customElements.get("zen-library");
  if (!Lib || !P.getBoolPref("zen.library.enabled", false)) return void window.BrowserCommands?.downloadsUI?.();
  try {
    const open = typeof Lib.isLibraryOpen === "function" ? Lib.isLibraryOpen() : Lib.isLibraryOpen;
    if (!open) Lib.toggle();
    const lib = Lib.getInstance?.() ?? document.querySelector("zen-library");
    if (lib) lib.activeTab = section;
  } catch (e) {
    console.error("[Zenith] Zen's Library", e);
    window.BrowserCommands?.downloadsUI?.();
  }
}

/* --- Downloads: the latest, the ones under way first ---------------------------------- */
export function downloadsCard(box, { most = 8 } = {}) {
  const list = node("div", { class: "zs-list" });
  const all = button("All downloads", "zs-btn zs-link");
  all.addEventListener("click", () => {
    Popup.close();
    openLibrary("downloads");
  });
  box.append(node("div", { class: "zs-head" }, "Downloads"), list, all);
  const { Downloads } = ChromeUtils.importESModule("resource://gre/modules/Downloads.sys.mjs");
  const seen = new Set();
  let queued = false;
  const draw = () => {
    queued = false;
    const items = [...seen].sort((a, b) => (a.stopped - b.stopped) || (b.startTime - a.startTime)).slice(0, most);
    list.replaceChildren(...(items.length ? items.map(d => {
      const row = node("div", { class: "zs-row zs-dl" });
      const name = PathUtils.filename(d.target.path || "") || "Download";
      const info = node("div", { class: "zs-grow" });
      info.append(node("div", { class: "zs-title" }, name));
      const state = d.succeeded ? `Done · ${bytes(d.target.size ?? d.totalBytes)}`
        : d.error ? "Failed" : d.canceled ? "Cancelled"
        : d.hasProgress ? `${d.progress}% · ${bytes(d.currentBytes)} of ${bytes(d.totalBytes)}` : `${bytes(d.currentBytes)}…`;
      info.append(node("div", { class: "zs-sub" }, state));
      if (!d.stopped && d.hasProgress) {
        const bar = node("div", { class: "zs-progress" });
        bar.style.setProperty("--p", `${d.progress}%`);
        info.append(bar);
      }
      row.append(ico(d.succeeded ? "done" : "download"), info);
      if (d.succeeded) {
        // (The row opens it; Folder shows it; Delete deletes the file, as
        // Zenith's delete in Firefox's downloads lists does.)
        row.setAttribute("action", "true");
        row.title = "Open it";
        row.addEventListener("click", e => !e.target.closest("button") && d.launch().catch(() => {}));
        const show = button("", "zs-btn zs-ib", "Show it in its folder");
        show.append(ico("folder"));
        show.addEventListener("click", () => {
          try {
            new FileUtils.File(d.target.path).reveal();
          } catch {}
        });
        row.append(show);
        const mode = P.getStringPref("zenith.plus.download-delete", "");
        if (mode !== "off" && window.DownloadsCommon?.deleteDownloadFiles) {
          const del = button("", "zs-btn zs-ib zs-danger", mode === "confirm" ? "Delete the file (a second click)" : "Delete the file");
          del.append(ico("trash"));
          del.addEventListener("click", async () => {
            if (mode === "confirm" && !del.hasAttribute("asking")) {
              del.setAttribute("asking", "true");
              del.title = "Click again to delete the file";
              setTimeout(() => del.isConnected && (del.removeAttribute("asking"), (del.title = "Delete the file (a second click)")), 3000);
              return;
            }
            try {
              await window.DownloadsCommon.deleteDownloadFiles(d, Math.max(1, P.getIntPref("browser.download.clearHistoryOnDelete", 0)));
            } catch (err) {
              console.error("[Zenith] delete a download", err);
            }
          });
          row.append(del);
        }
      } else if (!d.stopped) {
        const cancel = button("✕", "zs-btn zs-x", "Cancel it");
        cancel.addEventListener("click", () => d.cancel());
        row.append(cancel);
      }
      return row;
    }) : [node("div", { class: "zs-empty" }, "No downloads yet.")]));
  };
  const later = () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(draw);
    }
  };
  const { FileUtils } = ChromeUtils.importESModule("resource://gre/modules/FileUtils.sys.mjs");
  const view = { onDownloadAdded: d => (seen.add(d), later()), onDownloadChanged: later, onDownloadRemoved: d => (seen.delete(d), later()) };
  let listed = null, gone = false;
  Downloads.getList(Downloads.ALL).then(l => {
    if (gone) return;
    listed = l;
    l.addView(view);
  });
  draw();
  return () => {
    gone = true;
    listed?.removeView(view);
  };
}

/* --- What Firefox uses: memory and processor, tabs awake and asleep -------------------- */
export const System = {
  // Every process's memory and (since the last look) its share of the processor.
  async sample() {
    const info = await ChromeUtils.requestProcInfo();
    const all = [info, ...info.children];
    // (Firefox's own figure counts memory the processes share once each:
    // Windows' private working set, as Task Manager and the tab manager.)
    const own = window.ZenithTabs?.Look?.privateSet?.();
    const memory = all.reduce((a, p) => a + ((own && own(p.pid)) ?? p.memory ?? 0), 0), cpu = all.reduce((a, p) => a + (p.cpuTime || 0), 0);
    const now = performance.now();
    let pc = null;
    if (this.last) pc = Math.max(0, (100 * (cpu - this.last.cpu)) / 1e6 / (now - this.last.at) / (navigator.hardwareConcurrency || 1));
    this.last = { cpu, at: now };
    const every = window.gZenWorkspaces?.allStoredTabs ?? gBrowser.tabs;
    const tabs = [...new Set(every)].filter(t => t.isConnected && !t.closing && !t.hasAttribute("zen-empty-tab") && !t.hasAttribute("zen-glance-tab"));
    const sleeping = t => t.hasAttribute("pending") || !t.linkedPanel;
    const asleep = tabs.filter(sleeping).length;
    // (This space: its own tabs and the essentials, as its sidebar shows.)
    const space = window.gZenWorkspaces?.activeWorkspace;
    const here = tabs.filter(t => !space || t.hasAttribute("zen-essential") || t.getAttribute("zen-workspace-id") === space);
    const hereAsleep = here.filter(sleeping).length;
    return { memory, cpu: pc, awake: tabs.length - asleep, asleep, here: { awake: here.length - hereAsleep, asleep: hereAsleep }, processes: all.length };
  },
};

/* --- Trackers blocked on the page you're on (Firefox's own log) ------------------------ */
export const Trackers = {
  KINDS: [
    ["STATE_BLOCKED_TRACKING_CONTENT", "Trackers"],
    ["STATE_BLOCKED_SOCIALTRACKING_CONTENT", "Social trackers"],
    ["STATE_COOKIES_BLOCKED_TRACKER", "Tracking cookies"],
    ["STATE_COOKIES_BLOCKED_SOCIALTRACKER", "Social cookies"],
    ["STATE_BLOCKED_FINGERPRINTING_CONTENT", "Fingerprinters"],
    ["STATE_BLOCKED_CRYPTOMINING_CONTENT", "Cryptominers"],
  ],

  async count(browser = gBrowser.selectedBrowser) {
    const out = { total: 0, kinds: {} };
    let log = {};
    try {
      log = JSON.parse((await browser.getContentBlockingLog()) || "{}");
    } catch {
      return out;
    }
    const W = Ci.nsIWebProgressListener;
    for (const events of Object.values(log)) {
      let counted = false;
      for (const [kind, name] of this.KINDS) {
        if (!events.some(([flags, blocked]) => blocked && flags & W[kind])) continue;
        out.kinds[name] = (out.kinds[name] ?? 0) + 1;
        counted = true;
      }
      if (counted) out.total++;
    }
    return out;
  },
};

export function trackersCard(box) {
  const list = node("div", { class: "zs-list" });
  const dash = button("Protections dashboard", "zs-btn zs-link");
  dash.addEventListener("click", () => {
    Popup.close();
    window.openTrustedLinkIn?.("about:protections", "tab");
  });
  box.append(node("div", { class: "zs-head" }, "Blocked on this page"), list, dash);
  Trackers.count().then(c => {
    list.replaceChildren(...(c.total ? Object.entries(c.kinds).map(([name, n]) => {
      const row = node("div", { class: "zs-row" });
      row.append(ico("shield"), node("span", { class: "zs-grow" }, name), node("span", { class: "zs-big" }, `${n}`));
      return row;
    }) : [node("div", { class: "zs-empty" }, "Nothing blocked here.")]));
  });
}

/* --- Site appearance (zenith-plus.uc.mjs, SiteAppearance) ------------------------------ */
export function appearanceCard(box) {
  const A = window.ZenithAppearance;
  if (!A) return;
  const row = (title, current, set) => {
    const r = node("div", { class: "zs-seg-row" });
    r.append(node("span", { class: "zs-grow" }, title));
    const seg = node("div", { class: "zs-seg" });
    for (const [v, label] of [["auto", "Auto"], ["dark", "Dark"], ["light", "Light"]]) {
      const b = button(label, "zs-btn");
      b.toggleAttribute("on", current() === v);
      b.addEventListener("click", () => {
        set(v);
        for (const x of seg.children) x.toggleAttribute("on", x === b);
      });
      seg.append(b);
    }
    r.append(seg);
    return r;
  };
  const now = node("div", { class: "zs-sub zs-note" });
  const say = () => put(now, A.describe());
  box.append(node("div", { class: "zs-head" }, "How pages look"),
             row("Everywhere", () => A.global(), v => (A.set(v), say())),
             row("In this space", () => A.space(), v => (A.setSpace(v), say())), now);
  say();
}

/* --- Every tab of the space (the bar's "+N" when they don't fit) --------------------- */
export function tabsCard(box) {
  const field = node("input", { class: "zs-field zs-top", type: "text", spellcheck: "false", placeholder: "Find a tab" });
  const list = node("div", { class: "zs-list" });
  box.append(field, list);
  const draw = () => {
    const words = field.value.toLowerCase().split(/\s+/).filter(Boolean);
    const tabs = gBrowser.visibleTabs.filter(t => !t.closing && !t.hasAttribute("zen-empty-tab") && !t.hasAttribute("zen-glance-tab"))
      .filter(t => words.every(w => `${t.label} ${t.linkedBrowser?.currentURI?.host ?? ""}`.toLowerCase().includes(w)));
    list.replaceChildren(...(tabs.length ? tabs.map(t => {
      const row = node("div", { class: "zs-row", action: "true" });
      const img = node("img", { class: "zs-fav", alt: "" });
      const src = t.getAttribute("image");
      if (src) img.src = src;
      row.append(img, node("span", { class: "zs-grow" }, t.label));
      row.toggleAttribute("current", t.selected);
      row.title = t.label;
      row.addEventListener("click", () => {
        gBrowser.selectedTab = t;
        Popup.close();
      });
      row.addEventListener("auxclick", e => {
        if (e.button !== 1) return;
        gBrowser.removeTab(t, { animate: true });
        setTimeout(draw, 50);
      });
      return row;
    }) : [node("div", { class: "zs-empty" }, "No tab matches.")]));
  };
  field.addEventListener("input", draw);
  field.addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    list.querySelector(".zs-row")?.click();
  });
  draw();
  setTimeout(() => field.focus(), 0);
}

/* --- The power button's menu ----------------------------------------------------------- */
export function powerCard(box) {
  const nag = window.ZenithShell?.nag;
  const max = window.windowState === window.STATE_MAXIMIZED;
  const items = [
    ["minimise", "Minimise", () => window.minimize()],
    ["maximise", max ? "Restore" : "Maximise", () => (max ? window.restore() : window.maximize())],
    ["window", "New window", () => window.OpenBrowserWindow?.()],
    ["close", "Close this window", () => (window.BrowserCommands?.tryToCloseWindow ? BrowserCommands.tryToCloseWindow() : window.close())],
    ["restart", "Restart Zen", () => (nag ? nag.ask("restart") : null), !!nag],
    ["quit", "Quit Zen", () => (nag ? nag.ask("quit") : window.goQuitApplication?.())],
  ];
  const list = node("div", { class: "zs-list" });
  for (const [icon, label, run, ok = true] of items) {
    if (!ok) continue;
    const row = node("div", { class: "zs-row", action: "true", role: "menuitem" });
    row.append(ico(icon), node("span", { class: "zs-grow" }, label));
    row.addEventListener("click", () => {
      Popup.close();
      run();
    });
    list.append(row);
  }
  box.append(list);
}

/* --- A bar's menu (a right-click on it) ------------------------------------------------- */
// (The module names the bar's lists use, from those on the page.)
const LISTED = { tasks: "tabs", "tasks-more": "tabs", privacy: "trackers", resources: "memory", tray: "extensions" };

export function barMenu(box, edge, mod) {
  const Bars = window.ZenithBar, live = window.ZenithLive, name = mod ? (LISTED[mod] ?? mod) : null;
  const label = name ? new Map(Bars?.MODULES ?? []).get(name) ?? name : null;
  const listPref = `zenith.bar.${edge}.modules`, hidePref = `zenith.bar.hide-${edge}`;
  const settings = async prop => {
    live?.open({ s: { property: prop } });
    await new Promise(r => setTimeout(r, 120));
    return document.querySelector(`#zenith-live .zp-row[data-prop="${prop}"]`) ?? document.querySelector(`.zp-row[data-prop="${prop}"]`);
  };
  const items = [
    ["edit", `What the ${edge} bar shows…`, async () => (await settings(listPref))?.querySelector(".zp-action")?.click(), !!live],
    ["close", label ? `Take ${label} out of this bar` : null, () => {
      const lists = Bars.lists(edge);
      for (const side of ["left", "centre", "right"]) lists[side] = lists[side].filter(n => n !== name);
      P.setStringPref(listPref, [lists.left, lists.centre, lists.right].map(x => x.join(",")).join("|"));
    }, !!name && !!Bars],
    ["hide", P.getBoolPref(hidePref, false) ? "Keep this bar on screen" : "Hide this bar until reached", () => P.setBoolPref(hidePref, !P.getBoolPref(hidePref, false))],
    ["off", "Turn this bar off", () => P.setStringPref(`zenith.bar.${edge}`, "off")],
    ["settings", "Bar settings…", () => live?.open({ kind: "preset", section: { id: "bar" } }), !!live],
  ];
  const list = node("div", { class: "zs-list" });
  for (const [icon, text, run, ok = true] of items) {
    if (!ok || !text) continue;
    const row = node("div", { class: "zs-row", action: "true", role: "menuitem" });
    row.append(ico(icon), node("span", { class: "zs-grow" }, text));
    row.addEventListener("click", () => {
      Popup.close();
      run();
    });
    list.append(row);
  }
  // Its look, for every bar.
  const look = node("div", { class: "zs-seg-row" });
  look.append(node("span", { class: "zs-grow" }, "Look"));
  const seg = node("div", { class: "zs-seg" });
  const now = P.getStringPref("zenith.bar.style", "") || "islands";
  for (const [v, text] of [["islands", "Islands"], ["strip", "Strip"], ["minimal", "Minimal"], ["powerline", "Powerline"]]) {
    const b = button(text, "zs-btn");
    b.toggleAttribute("on", now === v);
    b.addEventListener("click", () => {
      P.setStringPref("zenith.bar.style", v);
      for (const x of seg.children) x.toggleAttribute("on", x === b);
    });
    seg.append(b);
  }
  look.append(seg);
  box.append(node("div", { class: "zs-head" }, `The ${edge} bar`), list, look);
}
