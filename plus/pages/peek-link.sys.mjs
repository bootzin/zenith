// SPDX-License-Identifier: GPL-3.0-or-later
// Clicking a link with keys (Shell › Mouse in Zenith's settings): each key
// combo does one thing, Zen's Glance, Peek, a tile beside this one, or
// nothing of Zenith's, and the window says which (zenith-plus.uc.mjs,
// LinkClicks). This sees the click before Zen or Firefox: Firefox's
// Ctrl+click would open a tab, and Zen's Glance only answers one or three
// keys held. AltGr (the right Alt on layouts that have one) is Ctrl+Alt.
// An Alt+press is the window's too (Alt+drag moves a tile), so the page
// starts no selection or drag from it; the click still comes.

const SHARED = "zenith-link-clicks"; // { combos: { alt, "alt-shift", "ctrl-alt", "ctrl-shift" }: "glance" | "peek" | "tile" | "nothing", press }

function combo(e) {
  if (e.metaKey) return null;
  if ((e.ctrlKey && e.altKey) || e.getModifierState?.("AltGraph")) return e.shiftKey ? null : "ctrl-alt";
  if (e.altKey) return e.shiftKey ? "alt-shift" : "alt";
  return e.ctrlKey && e.shiftKey ? "ctrl-shift" : null;
}

export class ZenithPeekLinkChild extends JSWindowActorChild {
  handleEvent(e) {
    // (Pages don't see Zenith's settings: the window shares these.)
    const conf = Services.cpmm.sharedData.get(SHARED);
    if (e.type === "mousedown") {
      this.down = [e.clientX, e.clientY];
      if (conf?.press && e.isTrusted && (e.button === 0 || e.button === 2) && combo(e) === "alt") e.preventDefault();
      return;
    }
    if (e.button !== 0 || e.defaultPrevented || !e.isTrusted) return;
    const keys = combo(e), what = keys && conf?.combos?.[keys];
    if (!what || what === "nothing") return;
    // (A drag to select a link's text isn't a click.)
    if (this.down && Math.hypot(e.clientX - this.down[0], e.clientY - this.down[1]) > 4) return;
    let node = e.originalTarget ?? e.target;
    if (node?.nodeType === 3) node = node.parentElement;
    const url = node?.closest?.("a[href], area[href]")?.href;
    if (!url || !/^https?:/i.test(url)) return;
    e.preventDefault();
    e.stopPropagation();
    // (Where the link is, for Glance to grow out of, as Zen's own sends it.)
    const r = node.closest("a[href], area[href]").getBoundingClientRect(), zoom = this.browsingContext.fullZoom;
    const rect = { clientX: r.left * zoom, clientY: r.top * zoom, width: r.width * zoom, height: r.height * zoom };
    this.sendAsyncMessage(what, { url, x: e.screenX, y: e.screenY, rect, principal: node.ownerDocument?.nodePrincipal ?? null });
  }
}

export class ZenithPeekLinkParent extends JSWindowActorParent {
  receiveMessage(msg) {
    const { url, x, y, rect, principal } = msg.data ?? {};
    if (!/^https?:/i.test(url ?? "")) return;
    const win = this.browsingContext.topChromeWindow;
    if (msg.name === "tile") return void win?.ZenithShell?.tiler?.link(url, principal, this.browsingContext.top.embedderElement);
    if (msg.name === "glance") return void win?.gZenGlanceManager?.openGlance({ url, triggeringPrincipal: principal, ...(rect ?? {}) });
    if (msg.name !== "peek") return;
    win?.ZenithPeek?.open?.(url, { x: x - win.mozInnerScreenX, y: y - win.mozInnerScreenY });
  }
}
