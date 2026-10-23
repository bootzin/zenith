// SPDX-License-Identifier: GPL-3.0-or-later
// The Dash (Alt+N, or the bar's clock), after Noctalia's control centre and
// Dux's Dash: the time and the weather, a calendar, what's playing, timers,
// what Firefox uses, and quick toggles. Imported the first time it opens
// (zenith-plus.uc.mjs, DashLoader); while it's closed nothing of it runs.
// Open, it reads Firefox's processes every 2 seconds and ticks each second.

import { Popup, Weather, System, Trackers, Timers, node, put, button, ico, bytes, timersCard, downloadsCard, everySecond } from "./shell-ui.mjs";

const P = Services.prefs;

function card(title, cls = "") {
  const c = node("section", { class: `zd-card ${cls}`.trim() });
  if (title) c.append(node("div", { class: "zs-head" }, title));
  return c;
}

/* --- The time, and the weather ---------------------------------------------------- */
function top(box, undo) {
  const head = node("div", { class: "zd-top" });
  const time = node("div", { class: "zd-time" }), date = node("div", { class: "zd-date" });
  const clock = node("div", { class: "zd-clock" });
  clock.append(time, date);
  const sky = node("div", { class: "zd-sky" });
  head.append(clock, sky);
  box.append(head);
  const T = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const D = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" });
  undo.push(everySecond(() => {
    const now = new Date();
    put(time, T.format(now));
    put(date, D.format(now));
  }));
  if (P.getBoolPref("zenith.dash.weather", true)) {
    const DAY = new Intl.DateTimeFormat(undefined, { weekday: "short" });
    const draw = w => {
      if (!w?.now) return void sky.replaceChildren(node("div", { class: "zs-empty" }, "No weather just now."));
      const now = node("div", { class: "zd-now" });
      now.append(ico(w.now.sky), node("span", { class: "zd-temp" }, `${w.now.t}${w.unit}`));
      const what = node("div", { class: "zd-what" });
      what.append(node("div", {}, w.now.text), node("div", { class: "zs-sub" }, `${w.where || "Near you"} · feels ${w.now.feels}${w.unit}`));
      const days = node("div", { class: "zd-days" });
      for (const d of w.days) {
        const day = node("div", { class: "zd-day" });
        day.append(node("span", { class: "zs-sub" }, DAY.format(new Date(`${d.date}T12:00`))), ico(d.sky), node("span", {}, `${d.max}°`), node("span", { class: "zs-sub" }, `${d.min}°`));
        days.append(day);
      }
      sky.replaceChildren(now, what, days);
    };
    draw(Weather.cached());
    Weather.get().then(w => box.isConnected && draw(w));
  }
}

/* --- A month, today marked; ‹ › for the others ---------------------------------------- */
function calendar(box) {
  const c = card("", "zd-cal");
  const head = node("div", { class: "zd-cal-head" }), name = node("span", { class: "zs-grow" });
  const prev = button("‹", "zs-btn", "The month before"), next = button("›", "zs-btn", "The month after");
  head.append(name, prev, next);
  const grid = node("div", { class: "zd-cal-grid" });
  c.append(head, grid);
  box.append(c);
  let first = 1;
  try {
    const loc = new Intl.Locale(Services.locale.regionalPrefsLocales?.[0] ?? "en");
    first = (loc.getWeekInfo?.() ?? loc.weekInfo)?.firstDay ?? 1;
  } catch {}
  const today = new Date();
  let shown = new Date(today.getFullYear(), today.getMonth(), 1);
  const MONTH = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
  const WD = new Intl.DateTimeFormat(undefined, { weekday: "narrow" });
  const draw = () => {
    name.textContent = MONTH.format(shown);
    const cells = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(2024, 0, 1 + ((first - 1 + i) % 7)); // 2024-01-01 was a Monday
      cells.push(node("span", { class: "zd-wd" }, WD.format(d)));
    }
    const lead = (shown.getDay() - (first % 7) + 7) % 7, days = new Date(shown.getFullYear(), shown.getMonth() + 1, 0).getDate();
    for (let i = 0; i < lead; i++) cells.push(node("span"));
    for (let d = 1; d <= days; d++) {
      const cell = node("span", { class: "zd-d" }, `${d}`);
      if (d === today.getDate() && shown.getMonth() === today.getMonth() && shown.getFullYear() === today.getFullYear()) cell.setAttribute("today", "true");
      cells.push(cell);
    }
    grid.replaceChildren(...cells);
  };
  prev.addEventListener("click", () => {
    shown = new Date(shown.getFullYear(), shown.getMonth() - 1, 1);
    draw();
  });
  next.addEventListener("click", () => {
    shown = new Date(shown.getFullYear(), shown.getMonth() + 1, 1);
    draw();
  });
  draw();
}

/* --- What's playing: cover, title, controls ---------------------------------------------- */
function mediaCard(box, undo) {
  const c = card("", "zd-media");
  box.append(c);
  const find = () => {
    const tabs = gBrowser.tabs;
    return tabs.find(t => t.hasAttribute("soundplaying"))
      ?? tabs.find(t => { try { return t.linkedBrowser?.browsingContext?.mediaController?.isActive; } catch { return false; } });
  };
  let ctrl = null;
  const draw = async () => {
    const tab = find(), C = tab?.linkedBrowser?.browsingContext?.mediaController ?? null;
    if (C !== ctrl) {
      for (const t of ["metadatachange", "playbackstatechange", "deactivated"]) {
        ctrl?.removeEventListener(t, draw);
        C?.addEventListener(t, draw);
      }
      ctrl = C;
    }
    if (!tab || !C) return void c.replaceChildren(node("div", { class: "zs-empty" }, "Nothing playing."));
    let meta = null;
    try {
      meta = C.getMetadata();
    } catch {}
    const art = node("div", { class: "zd-art" });
    const src = [...(meta?.artwork ?? [])].sort((a, b) => parseInt(b.sizes) - parseInt(a.sizes))[0]?.src;
    if (src && window.ZenithMediaArt?.copy) {
      window.ZenithMediaArt.copy(src).then(copy => copy?.url && art.style.setProperty("background-image", `url("${copy.url}")`)).catch(() => {});
    }
    const text = node("div", { class: "zs-grow" });
    const title = node("div", { class: "zs-title" }, meta?.title || tab.label);
    title.addEventListener("click", () => {
      Popup.close();
      gBrowser.selectedTab = tab;
    });
    text.append(title, node("div", { class: "zs-sub" }, [meta?.artist, meta?.album].filter(Boolean).join(" · ") || tab.linkedBrowser.currentURI?.host || ""));
    const keys = node("div", { class: "zd-keys" });
    const prev = button("", "zs-btn zs-icon", "Previous"), play = button("", "zs-btn zs-icon zd-play", C.isPlaying ? "Pause" : "Play"), next = button("", "zs-btn zs-icon", "Next");
    prev.append(ico("prev"));
    play.append(ico(C.isPlaying ? "pause" : "play"));
    next.append(ico("next"));
    prev.addEventListener("click", () => C.prevTrack());
    next.addEventListener("click", () => C.nextTrack());
    // (pause() needs who asked; Zen's own media controls say "user".)
    play.addEventListener("click", () => (C.isPlaying ? C.pause("user") : C.play()));
    keys.append(prev, play, next);
    text.append(keys);
    c.replaceChildren(art, text);
  };
  const follow = e => e.detail?.changed?.includes("soundplaying") && draw();
  gBrowser.tabContainer.addEventListener("TabAttrModified", follow);
  undo.push(() => {
    gBrowser.tabContainer.removeEventListener("TabAttrModified", follow);
    for (const t of ["metadatachange", "playbackstatechange", "deactivated"]) ctrl?.removeEventListener(t, draw);
  });
  draw();
}

/* --- What Firefox uses -------------------------------------------------------------------- */
function systemCard(box, undo) {
  const c = card("Browser", "zd-sys");
  const rows = {};
  for (const [k, label, icon] of [["memory", "Memory", "memory"], ["cpu", "Processor", "cpu"], ["tabs", "Tabs", "tabs"], ["trackers", "Trackers here", "shield"]]) {
    const row = node("div", { class: "zs-row" });
    rows[k] = node("span", { class: "zs-big" }, "…");
    row.append(ico(icon), node("span", { class: "zs-grow" }, label), rows[k]);
    c.append(row);
  }
  box.append(c);
  // Tabs: this space's, and (in brackets) every space's; a click opens the tab manager.
  const tabsRow = rows.tabs.parentNode;
  tabsRow.setAttribute("action", "true");
  tabsRow.addEventListener("click", () => {
    Popup.close();
    window.ZenithTabs?.show?.();
  });
  const draw = async () => {
    const s = await System.sample();
    put(rows.memory, bytes(s.memory));
    put(rows.cpu, s.cpu === null ? "…" : `${s.cpu < 10 ? s.cpu.toFixed(1) : Math.round(s.cpu)}%`);
    put(rows.tabs, `${s.here.awake} awake (${s.awake}) · ${s.here.asleep} asleep (${s.asleep})`);
    tabsRow.title = `In this space: ${s.here.awake} awake, ${s.here.asleep} asleep. In every space: ${s.awake} awake, ${s.asleep} asleep. A click opens the tab manager.`;
  };
  Trackers.count().then(t => put(rows.trackers, `${t.total}`));
  System.last = null;
  draw();
  const t = setInterval(() => document.hidden || draw(), 2000);
  undo.push(() => clearInterval(t));
}

/* --- Quick toggles ---------------------------------------------------------------------- */
function toggles(box, undo) {
  const c = card("", "zd-toggles");
  box.append(c);
  // (Firefox's Do Not Disturb, where the system's notifications have one.)
  const alerts = (() => {
    try {
      const a = Cc["@mozilla.org/alerts-service;1"].getService(Ci.nsIAlertsService).QueryInterface(Ci.nsIAlertsDoNotDisturb);
      void a.manualDoNotDisturb;
      return a;
    } catch {
      return null;
    }
  })();
  const A = window.ZenithAppearance, shell = window.ZenithShell;
  const audible = () => gBrowser.tabs.filter(t => t.hasAttribute("soundplaying") && !t.hasAttribute("muted"));
  const PALS = ["own", "catppuccin-mocha", "catppuccin-macchiato", "catppuccin-frappe", "catppuccin-latte", "tokyo-night", "gruvbox-dark",
                "gruvbox-light", "nord", "rose-pine", "rose-pine-dawn", "everforest", "kanagawa", "dracula"];
  const palName = v => (v === "own" ? "Your colours" : v.replace(/-/g, " ").replace(/\b\w/g, m => m.toUpperCase()));
  const TILES = [
    { icon: "bell", label: "Do not disturb", ok: !!alerts, on: () => alerts.manualDoNotDisturb, run: () => (alerts.manualDoNotDisturb = !alerts.manualDoNotDisturb) },
    { icon: () => (A?.isDark() ? "moon" : "sun"), label: () => `Pages: ${A?.forced() ?? "auto"}`, ok: !!A, on: () => !!A.forced(), run: () => A.toggle() },
    { icon: "mute", label: "Mute all", ok: true, on: () => gBrowser.tabs.some(t => t.hasAttribute("muted")) && !audible().length,
      run: () => {
        const loud = audible();
        if (loud.length) for (const t of loud) t.toggleMuteAudio();
        else for (const t of gBrowser.tabs.filter(t => t.hasAttribute("muted"))) t.toggleMuteAudio();
      } },
    { icon: "sleep", label: "Sleep the rest", ok: !!shell?.tabs, run: () => shell.tabs.sleepOthers() },
    { icon: "focus", label: "Focus mode", ok: !!window.ZenithFocus, on: () => !!window.ZenithFocus?.on, run: () => (Popup.close(), window.ZenithFocus.toggle()) },
    { icon: "sidebar", label: "Compact mode", ok: !!window.gZenCompactModeManager, on: () => gZenCompactModeManager.preference,
      run: () => (gZenCompactModeManager.preference = !gZenCompactModeManager.preference) },
    { icon: "camera", label: "Screenshot", ok: !!document.getElementById("Browser:Screenshot"), run: () => (Popup.close(), document.getElementById("Browser:Screenshot").doCommand()) },
    { icon: "pipette", label: "Colour picker", ok: !!document.getElementById("menu_eyedropper"), run: () => (Popup.close(), document.getElementById("menu_eyedropper").doCommand()) },
    { icon: "palette", label: () => palName(P.getStringPref("zenith.palette", "") || "own"), ok: true,
      on: () => !!P.getStringPref("zenith.palette", "") && P.getStringPref("zenith.palette", "") !== "own",
      run: e => {
        const i = Math.max(0, PALS.indexOf(P.getStringPref("zenith.palette", "") || "own")), n = PALS[(i + (e.shiftKey ? -1 : 1) + PALS.length) % PALS.length];
        if (n === "own") P.clearUserPref("zenith.palette");
        else P.setStringPref("zenith.palette", n);
      }, title: "Click: the next palette · Shift+click: the one before" },
  ];
  const tiles = [];
  for (const t of TILES.filter(t => t.ok)) {
    const b = node("button", { type: "button", class: "zd-tile" });
    if (t.title) b.title = t.title;
    const i = ico(typeof t.icon === "function" ? t.icon() : t.icon), l = node("span");
    b.append(i, l);
    const draw = () => {
      try {
        put(l, typeof t.label === "function" ? t.label() : t.label);
        if (typeof t.icon === "function") i.setAttribute("icon", t.icon());
        b.toggleAttribute("on", !!t.on?.());
      } catch (e) {
        console.error("[Zenith] Dash", e);
      }
    };
    b.addEventListener("click", e => {
      try {
        t.run(e);
      } catch (err) {
        console.error("[Zenith] Dash", err);
      }
      setTimeout(() => tiles.forEach(f => f()), 150);
    });
    tiles.push(draw);
    draw();
    c.append(b);
  }
  const all = () => tiles.forEach(f => f());
  for (const p of ["zenith.palette", "layout.css.prefers-color-scheme.content-override"]) P.addObserver(p, all);
  undo.push(() => {
    for (const p of ["zenith.palette", "layout.css.prefers-color-scheme.content-override"]) P.removeObserver(p, all);
  });
}

/* --- The Dash ------------------------------------------------------------------------------ */
function build(box) {
  const undo = [];
  const part = (name, fn) => {
    try {
      fn();
    } catch (e) {
      console.error(`[Zenith] Dash: ${name}`, e);
    }
  };
  part("time and weather", () => top(box, undo));
  const grid = node("div", { class: "zd-grid" });
  const left = node("div", { class: "zd-col" }), right = node("div", { class: "zd-col" });
  grid.append(left, right);
  box.append(grid);
  part("calendar", () => calendar(left));
  part("timers", () => {
    const timers = card("", "zd-timers");
    left.append(timers);
    undo.push(timersCard(timers));
  });
  if (Services.prefs.getBoolPref("zenith.dash.downloads", false)) {
    part("downloads", () => {
      const list = card("", "zd-downloads");
      left.append(list);
      undo.push(downloadsCard(list, { most: 4 }));
    });
  }
  part("media", () => mediaCard(right, undo));
  part("toggles", () => toggles(right, undo));
  part("the browser", () => systemCard(right, undo));
  return () => undo.forEach(fn => {
    try {
      fn();
    } catch (e) {
      console.error("[Zenith] Dash", e);
    }
  });
}

export function toggle({ anchor = null } = {}) {
  const at = Services.prefs.getStringPref("zenith.dash.place", "") || "top-centre";
  Popup.open(anchor, build, { kind: "dash", wide: true, at, keep: '.zenith-bar :is([mod="clock"], [mod="weather"], [mod="resources"])' });
}
