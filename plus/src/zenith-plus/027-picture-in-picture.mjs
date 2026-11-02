/* --- Picture-in-picture: resize, edges, tucking ---------------------------------
   For Firefox's picture-in-picture window:
     - the mouse wheel over it makes it bigger or smaller (the same shape,
       growing away from the screen edge it's nearest);
     - let go of it near a screen edge and it settles against that edge (or
       corner), a small gap away;
     - drop it more than halfway past the left or right edge and it tucks
       away: only a sliver with an arrow stays on screen, the video keeps
       playing. Rest the pointer on the sliver for half a second (or click
       it) and it comes out, its controls working; it goes back once you
       click anywhere else. Drag it away from the edge to keep it out.
   Nothing moves while the pointer merely passes by: the window only moves
   on a rest, a click or a drag. The window has no "moved" event, so its
   place is checked a few times a second while it's open (and only then).
   The front browser window looks after each picture-in-picture window. */
const PiPWindows = {
  PREF: "zenith.plus.pip-extras",
  GAP: 12,
  NEAR: 56,
  SLIVER: 40, // (the outer 14px are the window's resize edge, which the pointer can't hover)
  REST: 300,
  AWAY: 2500, // out for a visit, the pointer away this long: back it goes
  WITHIN: "zenith.plus.pip-within", // "" the screen · zen: inside the Zen window

  init() {
    this.listener = {
      onOpenWindow: xulWin => {
        const win = xulWin.docShell.domWindow;
        win.addEventListener("load", () => this.attach(win), { once: true });
      },
      onCloseWindow() {},
    };
    Services.wm.addListener(this.listener);
    for (const win of Services.wm.getEnumerator("Toolkit:PictureInPicture")) this.attach(win);
    // A click in any Zen window is a click elsewhere: a picture-in-picture
    // that came out for a visit goes back.
    const elsewhere = () => {
      for (const win of Services.wm.getEnumerator("Toolkit:PictureInPicture")) win.zenithPiP?.owner.tuckBack(win);
    };
    window.addEventListener("mousedown", elsewhere, true);
    // The pointer over this window: away from any picture-in-picture that's
    // out for a visit (it goes back after a while).
    const over = e => {
      if (this.lastOver && e.timeStamp - this.lastOver < 250) return;
      this.lastOver = e.timeStamp;
      for (const win of Services.wm.getEnumerator("Toolkit:PictureInPicture")) win.zenithPiP?.away?.(e);
    };
    window.addEventListener("mousemove", over, true);
    onUnload(() => {
      Services.wm.removeListener(this.listener);
      window.removeEventListener("mousedown", elsewhere, true);
      window.removeEventListener("mousemove", over, true);
    });
    window.ZenithPiP = this; // for tools/checks
    window.ZenithWin32 = Win32; // for tools/checks
  },

  on() {
    return Services.prefs.getBoolPref(this.PREF, true);
  },

  attach(win) {
    if (win.document.documentElement.getAttribute("windowtype") !== "Toolkit:PictureInPicture" || win.zenithPiP) return;
    if (Services.wm.getMostRecentWindow("navigator:browser") !== window) return;
    const state = (win.zenithPiP = { owner: this, at: [win.screenX, win.screenY], still: 0, tucked: null, visiting: null, calmUntil: 0 });
    // Its window's corners as Theme › Size and shape › Corners says (Windows 11); inside Zen,
    // above this Zen window only (not other apps) and kept inside it.
    if (Services.prefs.getStringPref(this.WITHIN, "") === "zen") {
      // (Once the window is up: Firefox sets it on top of everything as it
      // shows it.)
      const inside = () => {
        state.inside = (state.inside ?? 0) + 1;
        state.ticks ??= 0;
        try {
          win.docShell.treeOwner.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIAppWindow).zLevel = Ci.nsIAppWindow.normalZ;
          Win32.own(win, window);
        } catch (e) {
          console.error("[Zenith] picture-in-picture: inside Zen", e);
        }
      };
      for (const ms of [300, 1200]) win.setTimeout(inside, ms);
      win.setTimeout(() => this.settle(win, true), 400);
    }
    try {
      Win32.corners(win, Services.prefs.getStringPref("zenith.core.corners", "") || "soft");
    } catch (e) {
      console.error("[Zenith] picture-in-picture: corners", e);
    }
    const wheel = e => this.on() && !state.tucked && this.resize(win, e);
    // Tucked, the pointer over the video would be the page's (another
    // process): a clear cover in the controls' layer catches it.
    const doc = win.document;
    const cover = (state.cover = doc.createElementNS("http://www.w3.org/1999/xhtml", "div"));
    cover.id = "zenith-pip-cover";
    cover.hidden = true;
    (doc.getElementById("controls") ?? doc.body ?? doc.documentElement).append(cover);
    const cancel = () => {
      win.clearTimeout(state.restTimer);
      state.restTimer = null;
    };
    cover.addEventListener("mousedown", e => {
      if (!state.tucked || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      cancel();
      this.visit(win);
    });
    // A rest: the pointer moved onto the sliver and stayed on it. (Right
    // after tucking, a pointer already there doesn't count until it moves.)
    const rest = () => {
      if (!state.tucked || state.animating || state.restTimer || Date.now() < state.calmUntil) return;
      state.restTimer = win.setTimeout(() => {
        state.restTimer = null;
        if (state.tucked && !state.animating) this.visit(win);
      }, this.REST);
    };
    cover.addEventListener("mousemove", rest);
    cover.addEventListener("mouseenter", rest);
    cover.addEventListener("mouseleave", cancel);
    // Out for a visit: clicking anywhere else puts it back (another app
    // included, once the window has had the focus), and so does the
    // pointer staying away a while. (Away means outside the window: the
    // system reports a leave when the window moves under a still pointer.)
    win.addEventListener("deactivate", () => this.tuckBack(win));
    const layer = doc.getElementById("controls") ?? doc.documentElement;
    const stay = () => {
      win.clearTimeout(state.awayTimer);
      state.awayTimer = null;
    };
    layer.addEventListener("mousemove", stay);
    layer.addEventListener("mouseenter", stay);
    state.away = e => {
      const inside = e.screenX >= win.screenX && e.screenX < win.screenX + win.outerWidth && e.screenY >= win.screenY && e.screenY < win.screenY + win.outerHeight;
      if (!state.visiting || inside || state.awayTimer) return;
      state.awayTimer = win.setTimeout(() => {
        state.awayTimer = null;
        this.tuckBack(win);
      }, this.AWAY);
    };
    layer.addEventListener("mouseleave", state.away);
    win.addEventListener("mouseout", e => !e.relatedTarget && state.away(e));
    win.addEventListener("wheel", wheel, { passive: false });
    const watch = win.setInterval(() => this.watch(win), 150);
    win.addEventListener("unload", () => win.clearInterval(watch), { once: true });
  },

  // Where it lives: the screen, or (Panels › Media › Within) the Zen
  // window it came from, like a float.
  screen(win) {
    if (Services.prefs.getStringPref(this.WITHIN, "") === "zen" && !window.closed && window.windowState !== window.STATE_MINIMIZED) {
      return { L: window.screenX, T: window.screenY, R: window.screenX + window.outerWidth, B: window.screenY + window.outerHeight };
    }
    const s = win.screen;
    return { L: s.availLeft, T: s.availTop, R: s.availLeft + s.availWidth, B: s.availTop + s.availHeight };
  },

  // The window moved and then stayed put for a moment: it was let go (and
  // a visit became its place).
  watch(win) {
    const state = win.zenithPiP;
    // Fullscreen: its own business (moving it would undo it).
    if (this.full(win)) {
      state.at = [win.screenX, win.screenY];
      state.moved = false;
      state.visiting = null;
      state.awaySince = null;
      return;
    }
    if (state.visiting) this.away(win);
    if (state.inside && ++state.ticks % 7 === 0) {
      try {
        Win32.own(win, window);
      } catch {}
    }
    // Inside the Zen window: when the window moves or changes size, it
    // keeps to it.
    if (Services.prefs.getStringPref(this.WITHIN, "") === "zen" && !state.animating) {
      const box = [window.screenX, window.screenY, window.outerWidth, window.outerHeight].join();
      if (state.box && state.box !== box) {
        state.box = box;
        if (state.tucked) this.tuck(win, state.tucked.side);
        else this.settle(win, true);
        return;
      }
      state.box = box;
    }
    const at = [win.screenX, win.screenY];
    if (at[0] !== state.at[0] || at[1] !== state.at[1]) {
      state.at = at;
      state.still = 0;
      state.moved = !state.animating;
      return;
    }
    if (!state.moved || ++state.still < 2) return;
    state.moved = false;
    state.visiting = null;
    if (this.on() && !state.tucked) this.settle(win);
  },

  // Near an edge: against it. Mostly past a side edge: tucked. (Inside
  // the Zen window, never past its edges.)
  settle(win, keep = false) {
    const { L, T, R, B } = this.screen(win);
    const x = win.screenX, y = win.screenY, w = win.outerWidth, h = win.outerHeight;
    if (!keep && x + w / 2 < L) return this.tuck(win, "left");
    if (!keep && x + w / 2 > R) return this.tuck(win, "right");
    let nx = x, ny = y;
    if (x - L < this.NEAR) nx = L + this.GAP;
    else if (R - (x + w) < this.NEAR) nx = R - w - this.GAP;
    if (y - T < this.NEAR) ny = T + this.GAP;
    else if (B - (y + h) < this.NEAR) ny = B - h - this.GAP;
    ny = Math.min(Math.max(ny, T), B - h);
    if (Services.prefs.getStringPref(this.WITHIN, "") === "zen") nx = Math.min(Math.max(nx, L + this.GAP), R - w - this.GAP);
    if (nx !== x || ny !== y) this.glide(win, nx, ny);
  },

  tuck(win, side) {
    const state = win.zenithPiP;
    const { L, T, R, B } = this.screen(win);
    const w = win.outerWidth, h = win.outerHeight;
    const y = Math.min(Math.max(win.screenY, T + this.GAP), B - h - this.GAP);
    state.tucked = { side, y };
    state.visiting = null;
    state.awaySince = null;
    win.clearTimeout(state.awayTimer);
    state.awayTimer = null;
    state.cover.hidden = false;
    win.document.documentElement.setAttribute("zenith-pip-tucked", side);
    this.glide(win, side === "left" ? L - w + this.SLIVER : R - this.SLIVER, y, () => (state.calmUntil = Date.now() + 400));
  },

  // Out for a visit: the whole window by its edge, its controls working
  // (the cover goes), and the focus, so a click elsewhere is noticed.
  visit(win) {
    const state = win.zenithPiP, { side, y } = state.tucked;
    const { L, R } = this.screen(win);
    state.visiting = state.tucked;
    state.tucked = null;
    state.cover.hidden = true;
    win.document.documentElement.removeAttribute("zenith-pip-tucked");
    this.glide(win, side === "left" ? L + this.GAP : R - win.outerWidth - this.GAP, y);
    try {
      win.focus();
    } catch {}
  },

  // Out for a visit: the pointer away from it a while, or a click anywhere
  // else (another app included), puts it back. Read from the system, as
  // the window gets no word of a pointer or a click elsewhere.
  away(win) {
    const state = win.zenithPiP, p = Win32.pointer();
    if (!p || state.animating) return;
    const k = win.devicePixelRatio || 1;
    const inside = p.x >= win.screenX * k && p.x < (win.screenX + win.outerWidth) * k && p.y >= win.screenY * k && p.y < (win.screenY + win.outerHeight) * k;
    if (inside) {
      state.awaySince = null;
      return;
    }
    if (p.down) return this.tuckBack(win);
    state.awaySince ??= Date.now();
    if (Date.now() - state.awaySince > this.AWAY) this.tuckBack(win);
  },

  full(win) {
    return !!(win.document.fullscreenElement || win.windowState === win.STATE_FULLSCREEN || win.fullScreen);
  },

  tuckBack(win) {
    const state = win.zenithPiP;
    // (Going fullscreen takes the focus away for a moment: not a click
    // elsewhere.)
    if (!state?.visiting || state.animating || !this.on() || this.full(win)) return;
    this.tuck(win, state.visiting.side);
  },

  // A short slide to a place (a few steps; the window can't be animated).
  glide(win, x, y, done = null) {
    const state = win.zenithPiP;
    const [x0, y0] = [win.screenX, win.screenY], steps = 6;
    state.animating = true;
    let i = 0;
    const step = () => {
      i++;
      const k = 1 - (1 - i / steps) ** 3;
      win.moveTo(Math.round(x0 + (x - x0) * k), Math.round(y0 + (y - y0) * k));
      if (i < steps) win.setTimeout(step, 16);
      else win.setTimeout(() => {
        state.at = [win.screenX, win.screenY];
        state.animating = false;
        state.moved = false;
        done?.();
      }, 200);
    };
    step();
  },

  // A wheel notch: 8% bigger or smaller, the same shape, growing away from
  // the nearest screen edges.
  resize(win, e) {
    e.preventDefault();
    const { L, T, R, B } = this.screen(win);
    const w = win.outerWidth, h = win.outerHeight, x = win.screenX, y = win.screenY;
    const k = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    const nw = Math.round(Math.min(Math.max(w * k, 180), (R - L) * 0.9));
    const nh = Math.round((nw * h) / w);
    const right = x + w / 2 > (L + R) / 2, bottom = y + h / 2 > (T + B) / 2;
    const nx = right ? x + w - nw : x, ny = bottom ? y + h - nh : y;
    win.zenithPiP.animating = true;
    win.resizeTo(nw, nh);
    win.moveTo(Math.min(Math.max(nx, L), R - nw), Math.min(Math.max(ny, T), B - nh));
    win.setTimeout(() => {
      win.zenithPiP.at = [win.screenX, win.screenY];
      win.zenithPiP.animating = false;
    }, 120);
  },
};

