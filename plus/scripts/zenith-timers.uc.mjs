// ==UserScript==
// @name           Zenith Timers
// @description    Zenith Plus: countdown timers and pomodoros, started from Peek.
// @include        main
// @version        0.12.19
// ==/UserScript==

// Timers are started from the Peek prompt (Alt+Q):
//   timer 10m tea      a countdown ("90s", "1h30m", "25" = minutes)
//   pomo               a pomodoro, in the pattern from Zenith Plus's settings
//   pomo 15 10 4       a pomodoro of 15 min focus, 10 min break, 4 rounds
//                      (also "pomo focus 10, 5 break, 3 rounds")
//   timer              lists running timers, where Delete cancels one
// A running timer is a hairline down the left edge of the page (the right
// one has the page's scrollbar) that drains as time passes. When it ends, a small card appears in the top right
// corner (and a system notification if Zen isn't the active window).
// Timers are kept in a hidden setting, so they survive a restart and every
// window shows the same ones; only the frontmost window announces endings.
// Styles: plus/chrome.css.

const HTML_NS = "http://www.w3.org/1999/xhtml";
const PREF = "zenith.internal.timers";
const PATTERN_PREF = "zenith.peek.pomodoro";
const MAX_MS = 24 * 3600e3;

function make(tag, attrs = {}, text = "") {
  const node = document.createElementNS(HTML_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text) node.textContent = text;
  return node;
}

// "10m", "1h30m", "90s", "1:30" (minutes:seconds), "25" (minutes), "2 hours"
// -> milliseconds, with whatever follows as the label.
function parseDuration(text) {
  const t = text.trim();
  const clock = t.match(/^(\d{1,3}):([0-5]\d)(?:\s+(.*))?$/);
  if (clock) return { ms: (+clock[1] * 60 + +clock[2]) * 1000, label: clock[3]?.trim() ?? "" };
  const unit = { h: 3600e3, m: 60e3, s: 1e3 };
  const re = /^(\d+(?:\.\d+)?)\s*(h|hrs?|hours?|m|mins?|minutes?|s|secs?|seconds?)?(?![a-z])\s*/i;
  let rest = t;
  let ms = 0;
  let parts = 0;
  for (let m; (m = rest.match(re)); rest = rest.slice(m[0].length)) {
    ms += +m[1] * unit[(m[2] || "m")[0].toLowerCase()];
    parts++;
    if (!m[2]) {
      rest = rest.slice(m[0].length);
      break;
    }
  }
  if (!parts || ms <= 0 || ms > MAX_MS) return null;
  return { ms: Math.round(ms), label: rest.trim() };
}

function format(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

function minutes(ms) {
  const m = Math.round(ms / 60e3);
  return ms < 60e3 ? `${Math.round(ms / 1000)} s` : m >= 60 && m % 60 === 0 ? `${m / 60} h` : `${m} min`;
}

// "25-5-4" -> 25 min focus, 5 min break, 4 rounds
function pattern() {
  const [focus, rest, rounds] = (Services.prefs.getStringPref(PATTERN_PREF, "") || "25-5-4").split("-").map(Number);
  return focus && rest && rounds ? { focus, rest, rounds } : { focus: 25, rest: 5, rounds: 4 };
}

const Timers = {
  list() {
    try {
      const list = JSON.parse(Services.prefs.getStringPref(PREF, "[]"));
      return Array.isArray(list) ? list.filter(t => t && t.end > 0) : [];
    } catch {
      return [];
    }
  },

  save(list) {
    if (list.length) Services.prefs.setStringPref(PREF, JSON.stringify(list));
    else Services.prefs.clearUserPref(PREF);
  },

  parse: parseDuration,
  format,
  minutes,
  pattern,

  start(ms, label = "") {
    const now = Date.now();
    this.save([...this.list(), { id: `${now}`, kind: "timer", label, start: now, end: now + ms }]);
  },

  // "15 10 4", "15/10", "focus 10, 5 break, 3 rounds", "4 rounds of 50" ->
  // { focus, rest, rounds }; anything not given comes from the settings.
  // Bare numbers fill focus, break, rounds in that order.
  parsePattern(text) {
    const p = { ...pattern() };
    const given = {};
    const words = { focus: "focus", work: "focus", break: "rest", rest: "rest", round: "rounds", rounds: "rounds", x: "rounds" };
    const re = /(focus|work|break|rest|rounds?|x)\s*(?:of\s*)?(\d+)|(\d+)\s*(?:min(?:utes?|s)?|m)?\s*(focus|work|break|rest|rounds?|x)?/gi;
    const bare = [];
    for (const m of text.matchAll(re)) {
      if (m[1]) given[words[m[1].toLowerCase()]] ??= +m[2];
      else if (m[4]) given[words[m[4].toLowerCase()]] ??= +m[3];
      else bare.push(+m[3]);
    }
    for (const key of ["focus", "rest", "rounds"]) {
      if (given[key] == null && bare.length) given[key] = bare.shift();
    }
    if (!Object.keys(given).length) return null;
    Object.assign(p, given);
    if (!(p.focus >= 1 && p.focus <= 180 && p.rest >= 1 && p.rest <= 60 && p.rounds >= 1 && p.rounds <= 12)) return null;
    return p;
  },

  startPomodoro(p = pattern()) {
    const now = Date.now();
    const others = this.list().filter(t => t.kind === "timer");
    this.save([...others, { id: `${now}`, kind: "focus", label: "Focus", round: 1, rounds: p.rounds, focus: p.focus, rest: p.rest,
                            start: now, end: now + p.focus * 60e3 }]);
  },

  cancel(id) {
    this.save(this.list().filter(t => t.id !== id));
  },

  // What a timer is called in lists and notices.
  describe(t) {
    if (t.kind === "focus") return `Pomodoro ${t.round}/${t.rounds}: focus`;
    if (t.kind === "break") return `Pomodoro ${t.round}/${t.rounds}: break`;
    return t.label || `Timer, ${minutes(t.end - t.start)}`;
  },

  /* --- This window: the edge, the clock and the notices -------------------- */

  init() {
    this.edge = make("div", { id: "zenith-timer-edge" });
    document.getElementById("zen-tabbox-wrapper")?.append(this.edge);
    this.toasts = document.getElementById("zenith-toasts");
    if (!this.toasts) {
      this.toasts = make("div", { id: "zenith-toasts" });
      (document.getElementById("zen-main-app-wrapper") ?? document.body).append(this.toasts);
    }
    // The clock runs only while there are timers.
    const observer = () => {
      this.render();
      this.ticking();
    };
    Services.prefs.addObserver(PREF, observer);
    window.addEventListener("unload", () => {
      Services.prefs.removeObserver(PREF, observer);
      clearInterval(this.clock);
    }, { once: true });
    this.render();
    this.ticking();
    this.tick();
  },

  // The edge shows the timer that ends soonest.
  render() {
    const next = this.list().sort((a, b) => a.end - b.end)[0];
    const root = document.documentElement;
    if (!next) {
      root.removeAttribute("zenith-timer");
      return;
    }
    root.setAttribute("zenith-timer", next.kind);
    const left = Math.max(0, next.end - Date.now());
    root.style.setProperty("--zth-timer-left", (left / (next.end - next.start)).toFixed(4));
    this.edge.title = `${this.describe(next)}: ${format(left)} left`;
  },

  ticking() {
    const any = this.list().length > 0;
    if (any && !this.clock) this.clock = setInterval(() => this.tick(), 1000);
    if (!any && this.clock) this.clock = clearInterval(this.clock);
  },

  tick() {
    const list = this.list();
    if (!list.length) return this.ticking();
    this.render();
    // Only the frontmost window moves timers on, so each ending is
    // announced once.
    if (Services.wm.getMostRecentWindow("navigator:browser") !== window) return;
    const now = Date.now();
    const due = list.filter(t => t.end <= now);
    if (!due.length) return;
    let next = list.filter(t => t.end > now);
    for (const t of due) {
      if (t.kind === "timer") {
        this.notify("Time's up", t.label ? `${t.label} · ${minutes(t.end - t.start)}` : `${minutes(t.end - t.start)} timer`);
      } else if (t.kind === "focus" && t.round < t.rounds) {
        this.notify("Break", `${t.rest} min · round ${t.round} of ${t.rounds} done`);
        next.push({ ...t, kind: "break", label: "Break", start: now, end: now + t.rest * 60e3 });
      } else if (t.kind === "break") {
        this.notify("Focus", `${t.focus} min · round ${t.round + 1} of ${t.rounds}`);
        next.push({ ...t, kind: "focus", label: "Focus", round: t.round + 1, start: now, end: now + t.focus * 60e3 });
      } else {
        this.notify("Pomodoro done", `${t.rounds} rounds of ${t.focus} min`);
      }
    }
    this.save(next);
  },

  // A dunst-style card in the top right corner, plus a system notification
  // when Zen isn't the active window.
  notify(title, body) {
    const card = make("div", { class: "zenith-toast" });
    card.append(make("div", { class: "zenith-toast-title" }, title), make("div", { class: "zenith-toast-body" }, body));
    const dismiss = () => {
      card.setAttribute("leaving", "true");
      setTimeout(() => card.remove(), 300);
    };
    card.addEventListener("click", dismiss);
    setTimeout(dismiss, 30e3);
    this.toasts.append(card);
    if (!document.hasFocus()) {
      try {
        const alert = Cc["@mozilla.org/alert-notification;1"].createInstance(Ci.nsIAlertNotification);
        alert.init("zenith-timer", "", `Zenith: ${title}`, body);
        Cc["@mozilla.org/alerts-service;1"].getService(Ci.nsIAlertsService).showAlert(alert);
      } catch (e) {
        console.warn("[Zenith Timers] no system notification", e);
      }
    }
  },
};

// Start once per window, even if two copies of Zenith are installed for a
// moment (say the old seven Sine mods and the new one, while moving over).
if (!window.ZenithTimers) {
  window.ZenithTimers = Timers;
  try {
    Timers.init();
  } catch (e) {
    console.error("[Zenith Timers] failed to start", e);
  }
}
