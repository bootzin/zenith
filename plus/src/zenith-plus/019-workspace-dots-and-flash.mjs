/* --- Workspace dots and flash ----------------------------------------------
   Waybar-style dots at the top of the page, one per space, the current one
   long and in its colour, with its name: shown for a moment when you switch
   (or always, dimmed until then). The flash is the top of the page lighting
   up in the new space's colour as you arrive. That colour is the one Zen
   actually paints for the space (the most vivid of its colours, brightened
   enough to read as a light), taken as Zen paints it: a space's saved theme
   doesn't always say. */
const Spaces = {
  DOTS: "zenith.plus.workspace-dots",
  FLASH: "zenith.plus.workspace-flash",

  init() {
    const W = window.gZenWorkspaces;
    if (!W?.addChangeListeners) return;
    const box = document.getElementById("tabbrowser-tabbox");
    this.dots = el("div", { id: "zenith-dots" });
    this.dots.hidden = true;
    this.flash = el("div", { id: "zenith-space-flash" });
    box.append(this.dots, this.flash);
    // Zen tells listeners about a switch once its animation is over; the
    // space's own element is marked active as the switch starts, so that's
    // what's watched (the listener stays for the first drawing).
    this.last = W.activeWorkspace;
    const switched = () => {
      const now = W.activeWorkspace;
      if (!now || now === this.last) return;
      this.last = now;
      this.arrived(W.getWorkspaceFromId(now));
    };
    this.onChange = ({ onInit }) => (onInit ? this.render() : switched());
    W.addChangeListeners(this.onChange);
    const marks = new MutationObserver(switched);
    W.promiseInitialized?.then(() => {
      const strip = W.workspaceElement(W.activeWorkspace)?.parentElement;
      if (strip) marks.observe(strip, { subtree: true, attributeFilter: ["active"] });
    });
    onUnload(() => marks.disconnect());
    const render = () => this.render();
    for (const p of [this.DOTS, this.FLASH]) Services.prefs.addObserver(p, render);
    window.addEventListener("ZenWorkspaceDataChanged", render);
    window.addEventListener("ZenWorkspacesUIUpdate", render);
    onUnload(() => {
      W.removeChangeListeners(this.onChange);
      for (const p of [this.DOTS, this.FLASH]) Services.prefs.removeObserver(p, render);
      window.removeEventListener("ZenWorkspaceDataChanged", render);
      window.removeEventListener("ZenWorkspacesUIUpdate", render);
    });
    W.promiseInitialized?.then(render);
    render();
    window.ZenithSpaces = this; // for tools/checks
  },

  // A space's colour: its container's, when it opens tabs in one (what
  // its tabs are marked with), else its own primary gradient colour.
  colour(space) {
    return this.containerColour(space) ?? this.themeColour(space);
  },

  containerColour(space) {
    const id = space?.containerTabId;
    if (!id) return null;
    try {
      const name = ContextualIdentityService.getPublicIdentityFromId(id)?.color;
      if (!name || name === "toolbar") return null;
      // Firefox's own value for that colour, from its identity-color class.
      this.probe ??= document.documentElement.appendChild(el("span", { id: "zenith-identity-probe", hidden: "true" }));
      this.probe.className = `identity-color-${name}`;
      return getComputedStyle(this.probe).getPropertyValue("--identity-tab-color").trim() || null;
    } catch {
      return null;
    }
  },

  themeColour(space) {
    const colours = space?.theme?.gradientColors ?? [];
    const c = (colours.find(x => x?.isPrimary) ?? colours[0])?.c;
    if (!c) return null;
    return Array.isArray(c) ? `rgb(${c.slice(0, 3).join(" ")})` : String(c);
  },

  get mode() {
    return Services.prefs.getStringPref(this.DOTS, "") || "switch";
  },

  render() {
    const W = window.gZenWorkspaces;
    let spaces = [];
    try {
      spaces = W.getWorkspaces() ?? [];
    } catch {}
    const mode = this.mode;
    this.dots.hidden = mode === "off" || spaces.length < 2 || !W.workspaceEnabled;
    this.dots.setAttribute("mode", mode);
    if (this.dots.hidden) return;
    const active = W.activeWorkspace;
    const row = [];
    for (const space of spaces) {
      const dot = el("span", { class: "zenith-dot" });
      if (space.uuid === active) dot.setAttribute("active", "true");
      const colour = this.colour(space);
      if (colour) dot.style.setProperty("--zth-dot", colour);
      row.push(dot);
    }
    const current = spaces.find(s => s.uuid === active);
    const name = el("span", { class: "zenith-dot-name" });
    name.textContent = current?.name ?? "";
    this.dots.replaceChildren(...row, name);
  },

  arrived(space) {
    this.render();
    if (!this.dots.hidden) {
      this.dots.setAttribute("show", "true");
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.dots.removeAttribute("show"), 1600);
    }
    // A space in a container lights up in the container's colour straight
    // away; otherwise in the colour Zen paints it.
    const container = this.containerColour(space);
    const paint = container ? fn => fn(container) : fn => this.whenPainted(fn, space);
    paint(colour => {
      const active = this.dots.querySelector(".zenith-dot[active]");
      if (colour) active?.style.setProperty("--zth-dot", colour);
      if (!Services.prefs.getBoolPref(this.FLASH, true)) return;
      if (colour) this.flash.style.setProperty("--zth-flash", colour);
      else this.flash.style.removeProperty("--zth-flash");
      this.flash.removeAttribute("go");
      void this.flash.offsetWidth; // play it again
      this.flash.setAttribute("go", "true");
    });
  },

  // The new space's colour once Zen has painted it (it does so a frame or
  // two into the switch), or after a moment if the paint didn't change.
  whenPainted(fn, space) {
    const bg = document.getElementById("zen-browser-background");
    const read = () => this.vivid(WindowPaint.colours(bg?.style.getPropertyValue("--zen-main-browser-background") ?? ""));
    this.painted?.disconnect();
    clearTimeout(this.paintTimer);
    if (!bg) return fn(this.colour(space));
    const before = bg.style.getPropertyValue("--zen-main-browser-background");
    const done = () => {
      this.painted?.disconnect();
      clearTimeout(this.paintTimer);
      fn(read() ?? this.colour(space));
    };
    this.painted = new MutationObserver(() => {
      if (bg.style.getPropertyValue("--zen-main-browser-background") !== before) done();
    });
    this.painted.observe(bg, { attributes: true, attributeFilter: ["style"] });
    this.paintTimer = setTimeout(done, 600);
  },

  // The most colourful of Zen's colours, as a light: its hue, saturated
  // and bright enough to stand out on the page's edge. Greys give nothing.
  vivid(colours) {
    let best = null, chroma = 0;
    for (const [r, g, b] of colours) {
      const c = Math.max(r, g, b) - Math.min(r, g, b);
      if (c > chroma) [best, chroma] = [[r, g, b], c];
    }
    if (!best || chroma < 12) return null;
    const [r, g, b] = best.map(v => v / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    const l = (max + min) / 2, s = d / (1 - Math.abs(2 * l - 1));
    return `hsl(${Math.round((h * 60 + 360) % 360)} ${Math.round(Math.max(s, 0.6) * 100)}% ${Math.round(Math.min(Math.max(l, 0.58), 0.7) * 100)}%)`;
  },
};

