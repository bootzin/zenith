/* --- Glass light: liquid glass lights up under the pointer -----------------
   With Glass edge on Liquid, a tab, an essential, the media card, the Peek
   prompt, a notice or a card in the live panel glows softly under the
   pointer while you hover it, and brighter while you press it: the light
   follows the pointer, rises quickly and fades after you leave or let go
   (inspired by Zia). Zenith Core draws it from --zth-press (0 to 1); this
   sets it each frame, because a mod stylesheet can't register the property
   that a CSS animation of it would need. */
const GlassLight = {
  // [what the pointer is over, the part that's painted (null: itself)]
  SURFACES: [[".tabbrowser-tab", ".tab-background"], [".zen-media-card", null], ["#zenith-peek-box", null],
             [".zenith-toast", null], ["#zenith-live .zp-card", null], ["#zenith-live .zp-chip", null]],
  HOVER: 0.45, // hover strength; a press is 1
  RISE: 90,    // ms from nothing to full
  FADE: 320,   // ms from full to nothing
  HOLD: 140,   // ms a press stays full at least, for a quick click

  init() {
    this.lights = new Map(); // glass -> { level, x, y }
    const watch = () => (this.on = Services.prefs.getStringPref("zenith.core.glass-edge", "") === "liquid");
    watch();
    Services.prefs.addObserver("zenith.core.glass-edge", watch);
    const handlers = {
      pointermove: e => this.move(e),
      pointerdown: e => this.press(e),
      pointerup: () => this.release(),
      pointercancel: () => this.release(),
    };
    for (const [type, fn] of Object.entries(handlers)) window.addEventListener(type, fn, true);
    const leave = e => { if (!e.relatedTarget) this.point(null); };
    const blur = () => { this.release(); this.point(null); };
    document.addEventListener("mouseout", leave);
    window.addEventListener("blur", blur);
    onUnload(() => {
      Services.prefs.removeObserver("zenith.core.glass-edge", watch);
      for (const [type, fn] of Object.entries(handlers)) window.removeEventListener(type, fn, true);
      document.removeEventListener("mouseout", leave);
      window.removeEventListener("blur", blur);
      for (const glass of this.lights.keys()) this.clear(glass);
    });
  },

  surface(target) {
    for (const [hit, part] of this.SURFACES) {
      const host = target?.closest?.(hit);
      if (host) return part ? host.querySelector(part) : host;
    }
    return null;
  },

  // The surface under the pointer (or none), and where on it.
  point(glass, e) {
    if (glass !== this.hovered) this.hovered = glass;
    if (glass && e) {
      const box = glass.getBoundingClientRect();
      glass.style.setProperty("--zth-press-x", `${Math.round(e.clientX - box.left)}px`);
      glass.style.setProperty("--zth-press-y", `${Math.round(e.clientY - box.top)}px`);
      if (!this.lights.has(glass)) {
        this.lights.set(glass, { level: 0 });
        glass.setAttribute("zenith-press", "true");
      }
    }
    this.run();
  },

  move(e) {
    if (!this.on && !this.lights.size) return;
    this.point(this.on ? this.surface(e.target) : null, e);
  },

  press(e) {
    if (!this.on || e.button !== 0) return;
    const glass = this.surface(e.target);
    if (!glass) return;
    this.pressed = glass;
    this.held = true;
    this.until = performance.now() + this.HOLD;
    this.point(glass, e);
  },

  release() {
    this.held = false;
  },

  // Where each light is heading: full while pressed (and for a moment
  // after), the hover strength under the pointer, otherwise nothing.
  target(glass, now) {
    if (glass === this.pressed && (this.held || now < this.until)) return 1;
    if (glass === this.pressed && !this.held && now >= this.until) this.pressed = null;
    return glass === this.hovered ? this.HOVER : 0;
  },

  run() {
    if (this.frame) return;
    let last = performance.now();
    const step = now => {
      this.frame = null;
      const dt = now - last;
      last = now;
      for (const [glass, light] of this.lights) {
        if (!glass.isConnected) {
          this.clear(glass);
          continue;
        }
        const goal = this.target(glass, now);
        if (light.level < goal) light.level = Math.min(goal, light.level + dt / this.RISE);
        else if (light.level > goal) light.level = Math.max(goal, light.level - dt / this.FADE);
        if (light.level <= 0 && goal === 0) {
          this.clear(glass);
          continue;
        }
        // An eased curve, so it starts and ends softly.
        glass.style.setProperty("--zth-press", (light.level * light.level * (3 - 2 * light.level)).toFixed(3));
      }
      if (this.lights.size) this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  },

  clear(glass) {
    glass.removeAttribute("zenith-press");
    for (const p of ["--zth-press", "--zth-press-x", "--zth-press-y"]) glass.style.removeProperty(p);
    this.lights.delete(glass);
    if (this.hovered === glass) this.hovered = null;
    if (this.pressed === glass) this.pressed = null;
  },
};

