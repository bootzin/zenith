/* --- What's playing, one answer for everything (docs/reference.md §3) ----
   Every tab with media, in every space: the bar, its hover player, the Dash
   and Media art read this, never their own guess. Ranked: playing and
   audible first (the newest to start), then playing but muted, then paused
   (the latest touched). A sound under a second never takes over; a muted
   or paused source never displaces an audible one. "Keep the one I chose"
   (Bars › Which source the bar shows) holds the source you last played,
   paused or picked while it still has media. */
const MediaHub = {
  sources: new Map(), // tab → { started, touched }
  picked: null,

  init() {
    window.ZenithMedia = this;
    const changed = e => {
      const c = e.detail?.changed ?? [];
      if (!c.includes("soundplaying") && !c.includes("muted")) return;
      const s = this.add(e.target);
      if (s && c.includes("soundplaying") && e.target.hasAttribute("soundplaying")) s.started = Date.now();
      this.soon(c.includes("soundplaying") ? 1100 : 0);
    };
    const gone = e => {
      this.sources.delete(e.target);
      if (this.picked === e.target) this.picked = null;
      this.soon();
    };
    // (On the window, not the tab strip: tabs of other spaces and the
    // essentials send theirs too, as Zen's own media cards rely on.)
    window.addEventListener("TabAttrModified", changed);
    window.addEventListener("TabClose", gone);
    window.addEventListener("TabBrowserDiscarded", gone);
    onUnload(() => {
      window.removeEventListener("TabAttrModified", changed);
      window.removeEventListener("TabClose", gone);
      window.removeEventListener("TabBrowserDiscarded", gone);
    });
    // Media already playing (or paused) in any space when Zen starts.
    for (const t of new Set(window.gZenWorkspaces?.allStoredTabs ?? gBrowser.tabs)) if (this.ctrl(t)?.isActive || t.hasAttribute("soundplaying")) this.add(t);
    this.soon();
  },

  ctrl(tab) {
    try {
      return tab?.linkedBrowser?.browsingContext?.mediaController ?? null;
    } catch {
      return null;
    }
  },

  add(tab) {
    if (!tab?.isConnected) return null;
    let s = this.sources.get(tab);
    if (!s) {
      s = { started: tab.hasAttribute("soundplaying") ? Date.now() - 2000 : 0, touched: 0 };
      this.sources.set(tab, s);
      const c = this.ctrl(tab);
      for (const t of ["playbackstatechange", "metadatachange", "deactivated", "activated"]) c?.addEventListener(t, () => this.soon());
    }
    return s;
  },

  state(tab) {
    const c = this.ctrl(tab), sound = tab.hasAttribute("soundplaying");
    const playing = !!c?.isPlaying || sound;
    if (playing && sound && !tab.hasAttribute("muted")) return "playing";
    if (playing) return tab.hasAttribute("muted") ? "muted" : "playing";
    return c?.isActive ? "paused" : null;
  },

  // Every source, best first.
  list() {
    const now = Date.now(), out = [];
    for (const [tab, s] of this.sources) {
      if (!tab.isConnected) {
        this.sources.delete(tab);
        continue;
      }
      const state = this.state(tab);
      if (!state) continue;
      // (Playing for under a second: below everything playing, so a ping
      // never takes the bar.)
      const settled = state !== "playing" || now - s.started >= 1000;
      const rank = state === "playing" ? (settled ? 0 : 2) : state === "muted" ? 1 : 3;
      out.push({ tab, state, rank, at: state === "paused" ? s.touched || s.started : s.started });
    }
    return out.sort((a, b) => a.rank - b.rank || b.at - a.at);
  },

  // The source the bar shows.
  get current() {
    const all = this.list();
    if (this.picked && Services.prefs.getStringPref("zenith.bar.media-pick", "") === "kept") {
      const kept = all.find(s => s.tab === this.picked);
      if (kept && (kept.state !== "paused" || !all.some(s => s.rank === 0 && s.tab !== this.picked))) return kept;
    }
    return all[0] ?? null;
  },

  // You played, paused or chose it: it stays (with "Keep the one I chose").
  touch(tab) {
    const s = this.add(tab);
    if (s) s.touched = Date.now();
    this.picked = tab;
    this.soon();
  },

  // The next source after the shown one (a wheel with Shift, a key).
  cycle() {
    const all = this.list(), i = all.findIndex(s => s.tab === this.current?.tab);
    if (all.length > 1) this.touch(all[(i + 1) % all.length].tab);
  },

  soon(ms = 0) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => window.dispatchEvent(new CustomEvent("ZenithMedia")), ms);
    if (ms) setTimeout(() => window.dispatchEvent(new CustomEvent("ZenithMedia")), 0);
  },
};

