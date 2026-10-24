// SPDX-License-Identifier: GPL-3.0-or-later
// Link hints (Zenith Plus, Alt+J): a few letters on every link, button and
// field you can see in the page; type a label to follow it (or, with
// Alt+Shift+J, to open a link in a new tab in the background), Backspace
// to take a letter back, Esc or any other key to stop. Scrolling, clicking
// or leaving the page stops it too (switching to another app doesn't).
//
// A window actor: this file runs inside the page's process (the child),
// where the links are. The labels sit in a closed shadow root over the
// page, out of the page's own styles and scripts.

export class ZenithHintsParent extends JSWindowActorParent {}

// Home-row letters first, so the shortest labels are the easiest to type.
const CHARS = "sadfjklewcmpgh";
const TARGETS = [
  "a[href]", "area[href]", "button", "input:not([type=hidden])", "select", "textarea", "summary", "label[for]",
  "[role=button]", "[role=link]", "[role=tab]", "[role=menuitem]", "[role=checkbox]", "[role=switch]", "[role=option]",
  "[onclick]", "[contenteditable=''], [contenteditable=true]", "[tabindex]:not([tabindex='-1'])",
].join(", ");
const TYPING = "input:not([type=button], [type=submit], [type=reset], [type=checkbox], [type=radio], [type=image], [type=file], [type=color], [type=range]), textarea, select, [contenteditable=''], [contenteditable=true]";

export class ZenithHintsChild extends JSWindowActorChild {
  receiveMessage(msg) {
    if (msg.name === "scroll") return void this.scroll(msg.data);
    if (msg.name === "show") this.show(msg.data);
    else if (msg.name === "hide") this.hide();
    // (What's showing, for tools/checks.)
    else if (msg.name === "state") return this.state ? { labels: this.state.items.map(i => i.code), typed: this.state.typed } : { last: this.last ?? null };
    return null;
  }

  didDestroy() {
    this.hide();
  }

  // Ctrl+Alt+H/J/K/L: what scrolls under the middle of the page (a box
  // that scrolls that way), else the page.
  scroll({ x = 0, y = 0, smooth = true } = {}) {
    const win = this.contentWindow, doc = this.document;
    if (!win || !doc) return;
    const can = el => {
      if (!el || el === doc.documentElement || el === doc.body) return false;
      const cs = win.getComputedStyle(el), over = y ? cs.overflowY : cs.overflowX;
      return /auto|scroll|overlay/.test(over) && (y ? el.scrollHeight > el.clientHeight + 4 : el.scrollWidth > el.clientWidth + 4);
    };
    let el = doc.elementFromPoint(win.innerWidth / 2, win.innerHeight / 2);
    while (el && !can(el)) el = el.parentElement;
    const target = el ?? doc.scrollingElement ?? doc.documentElement;
    target.scrollBy({ left: x, top: y, behavior: smooth ? "smooth" : "instant" });
  }

  // What can be followed and is on screen (and not covered by something).
  targets() {
    const doc = this.document, win = this.contentWindow;
    const W = win.innerWidth, H = win.innerHeight;
    const found = [];
    for (const el of doc.querySelectorAll(TARGETS)) {
      if (el.disabled || el.closest("[inert], [aria-hidden=true]")) continue;
      const r = [...el.getClientRects()].find(b => b.width >= 3 && b.height >= 3 && b.bottom > 0 && b.right > 0 && b.top < H && b.left < W);
      if (!r || !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      const x = Math.min(Math.max(r.left + Math.min(r.width / 2, 14), 0), W - 1);
      const y = Math.min(Math.max(r.top + r.height / 2, 0), H - 1);
      const top = doc.elementFromPoint(x, y);
      if (top && top !== el && !el.contains(top) && !top.contains(el) && top.closest?.(TARGETS) !== el) continue;
      found.push({ el, r });
      if (found.length >= 500) break;
    }
    // One label per thing: a target inside another target at the same spot
    // (a span with a click handler inside a link) gives way to the outer one.
    return found.filter(({ el, r }) => !found.some(o => o.el !== el && o.el.contains(el) &&
      Math.abs(o.r.left - r.left) < 4 && Math.abs(o.r.top - r.top) < 4));
  }

  // n labels, all the same length.
  codes(n) {
    let len = 1;
    while (CHARS.length ** len < n) len++;
    const out = [];
    for (let i = 0; i < n; i++) {
      let s = "", k = i;
      for (let j = 0; j < len; j++) {
        s = CHARS[k % CHARS.length] + s;
        k = Math.floor(k / CHARS.length);
      }
      out.push(s);
    }
    return out;
  }

  show({ newTab, accent, ink }) {
    this.hide();
    this.last = { shown: true };
    const doc = this.document, win = this.contentWindow;
    const items = this.targets();
    if (!items.length) {
      this.last = { shown: false, why: "nothing to label" };
      this.sendAsyncMessage("none");
      return;
    }
    const codes = this.codes(items.length);
    const host = doc.createElement("zenith-hints");
    host.setAttribute("style", "all: initial !important; position: fixed !important; inset: 0 !important; z-index: 2147483647 !important; pointer-events: none !important;");
    const shadow = host.attachShadow({ mode: "closed" });
    const style = doc.createElement("style");
    style.textContent = `
      .h { position: fixed; padding: 1px 4px; border-radius: 4px; background: ${accent}; color: ${ink};
           font: 700 11px/1.3 ui-monospace, "Cascadia Mono", Consolas, monospace; letter-spacing: 0.04em;
           text-transform: uppercase; box-shadow: 0 1px 4px rgb(0 0 0 / 0.35), 0 0 0 1px rgb(0 0 0 / 0.15);
           white-space: nowrap; }
      .h[off] { display: none; }
      .h b { font-weight: 700; opacity: 0.45; }`;
    shadow.append(style);
    items.forEach((it, i) => {
      const label = doc.createElement("span");
      label.className = "h";
      label.textContent = codes[i];
      label.style.left = `${Math.max(0, it.r.left - 2)}px`;
      label.style.top = `${Math.max(0, it.r.top - 2)}px`;
      it.code = codes[i];
      it.label = label;
      shadow.append(label);
    });
    doc.documentElement.append(host);
    const stop = () => this.hide();
    const key = e => this.key(e);
    win.addEventListener("keydown", key, true);
    for (const type of ["scroll", "resize", "pagehide", "mousedown"]) win.addEventListener(type, stop, { capture: true, passive: true });
    this.state = {
      host, items, typed: "", newTab,
      off: () => {
        win.removeEventListener("keydown", key, true);
        for (const type of ["scroll", "resize", "pagehide", "mousedown"]) win.removeEventListener(type, stop, { capture: true });
      },
    };
  }

  hide() {
    if (!this.state) return;
    this.state.off();
    this.state.host.remove();
    this.state = null;
  }

  key(e) {
    const s = this.state;
    // (Modifiers and lock keys on their own don't count.)
    if (["Shift", "Control", "Alt", "AltGraph", "Meta", "OS", "Fn", "FnLock", "CapsLock", "NumLock", "ScrollLock", "Dead", "Unidentified"].includes(e.key)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.last = { key: e.key };
    if (e.key === "Backspace") s.typed = s.typed.slice(0, -1);
    else if (/^[a-z]$/i.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) s.typed += e.key.toLowerCase();
    else return this.hide();
    const matching = s.items.filter(it => it.code.startsWith(s.typed));
    if (!matching.length) return this.hide();
    if (matching.length === 1 && matching[0].code === s.typed) {
      const { el } = matching[0];
      const newTab = s.newTab || e.shiftKey;
      this.hide();
      this.follow(el, newTab);
      return;
    }
    for (const it of s.items) {
      const on = it.code.startsWith(s.typed);
      it.label.toggleAttribute("off", !on);
      if (on) {
        const done = this.document.createElement("b");
        done.textContent = it.code.slice(0, s.typed.length);
        it.label.replaceChildren(done, it.code.slice(s.typed.length));
      }
    }
  }

  // A field gets the cursor; a link in a new tab is a Ctrl+click (the
  // browser opens it, in the background as usual); anything else a click.
  follow(el, newTab) {
    this.last = { followed: el.outerHTML.slice(0, 80), newTab };
    if (el.matches(TYPING)) {
      el.focus();
      return;
    }
    const link = el.closest("a[href], area[href]");
    if (newTab && link) {
      const mac = Services.appinfo.OS === "Darwin";
      link.dispatchEvent(new this.contentWindow.MouseEvent("click", {
        bubbles: true, cancelable: true, view: this.contentWindow, button: 0, ctrlKey: !mac, metaKey: mac,
      }));
      return;
    }
    el.focus?.({ preventScroll: true });
    el.click();
  }
}
