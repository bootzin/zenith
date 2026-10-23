// SPDX-License-Identifier: GPL-3.0-or-later
// Peek a link by clicking it with a few keys (Keys › Peek › Peek a link by
// clicking it with), as Zen's Glance does with Alt+click: the page asks
// its window to Peek it. Alt means instead of Glance: this sees the click
// first, and Glance leaves a click already taken alone. (Alt+Shift and
// Ctrl+Alt never reach Glance: it only takes one key.) Swapped: Alt peeks
// and Alt+Shift opens Glance.
// Zenith Shell (zenith-plus.uc.mjs) shares the click too: Alt+Shift+click
// (Shell › Open a link as a tile by clicking it with) opens the link as a
// tile, before Peek's keys are looked at; and an Alt+press is the window's
// (Alt+drag moves a tile), so the page starts no selection or drag from it.
// The click still comes, so Alt+click is still Zen's Glance.

const SHARED = "zenith-peek-click"; // { mode: zenith.plus.peek-click, on: zenith.peek.enabled }
const SHELL = "zenith-shell-click"; // { tile: "alt-shift" | "ctrl-alt" | "", press: Alt+drag is on }

const KEYS = {
  "alt-shift": e => e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey,
  "ctrl-alt": e => e.ctrlKey && e.altKey && !e.shiftKey && !e.metaKey,
  alt: e => e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey,
};
KEYS["alt-swap"] = KEYS.alt;

export class ZenithPeekLinkChild extends JSWindowActorChild {
  handleEvent(e) {
    // (Pages don't see Zenith's settings: the window shares these.)
    const shell = Services.cpmm.sharedData.get(SHELL);
    if (e.type === "mousedown") {
      this.down = [e.clientX, e.clientY];
      if (shell?.press && e.isTrusted && e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey && (e.button === 0 || e.button === 2)) e.preventDefault();
      return;
    }
    if (e.button !== 0 || e.defaultPrevented || !e.isTrusted) return;
    const conf = Services.cpmm.sharedData.get(SHARED), mode = conf?.mode || "alt-shift";
    const what = shell?.tile && KEYS[shell.tile]?.(e) ? "tile"
               : conf?.on === false ? null
               : KEYS[mode]?.(e) ? "peek" : mode === "alt-swap" && KEYS["alt-shift"](e) ? "glance" : null;
    if (!what) return;
    // (A drag to select a link's text isn't a click.)
    if (this.down && Math.hypot(e.clientX - this.down[0], e.clientY - this.down[1]) > 4) return;
    let node = e.originalTarget ?? e.target;
    if (node?.nodeType === 3) node = node.parentElement;
    const url = node?.closest?.("a[href], area[href]")?.href;
    if (!url || !/^https?:/i.test(url)) return;
    e.preventDefault();
    e.stopPropagation();
    this.sendAsyncMessage(what, { url, x: e.screenX, y: e.screenY, principal: node.ownerDocument?.nodePrincipal ?? null });
  }
}

export class ZenithPeekLinkParent extends JSWindowActorParent {
  receiveMessage(msg) {
    const { url, x, y, principal } = msg.data ?? {};
    if (!/^https?:/i.test(url ?? "")) return;
    const win = this.browsingContext.topChromeWindow;
    if (msg.name === "tile") return void win?.ZenithShell?.tiler?.link(url, principal, this.browsingContext.top.embedderElement);
    // (Swapped: Alt+Shift opens Zen's Glance, as its Alt+click would.)
    if (msg.name === "glance") return void win?.gZenGlanceManager?.openGlance({ url, triggeringPrincipal: principal });
    if (msg.name !== "peek") return;
    win?.ZenithPeek?.open?.(url, { x: x - win.mozInnerScreenX, y: y - win.mozInnerScreenY });
  }
}
