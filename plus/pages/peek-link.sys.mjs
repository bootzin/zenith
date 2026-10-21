// Peek a link by clicking it with a few keys (Keys › Peek › Peek a link by
// clicking it with), as Zen's Glance does with Alt+click: the page asks
// its window to Peek it. Alt means instead of Glance: this sees the click
// first, and Glance leaves a click already taken alone. (Alt+Shift and
// Ctrl+Alt never reach Glance: it only takes one key.)

const SHARED = "zenith-peek-click"; // { mode: zenith.plus.peek-click, on: zenith.peek.enabled }

const KEYS = {
  "alt-shift": e => e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey,
  "ctrl-alt": e => e.ctrlKey && e.altKey && !e.shiftKey && !e.metaKey,
  alt: e => e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey,
};

export class ZenithPeekLinkChild extends JSWindowActorChild {
  handleEvent(e) {
    if (e.type === "mousedown") {
      this.down = [e.clientX, e.clientY];
      return;
    }
    if (e.button !== 0 || e.defaultPrevented || !e.isTrusted) return;
    // (Pages don't see Zenith's settings: the window shares these.)
    const conf = Services.cpmm.sharedData.get(SHARED);
    if (conf?.on === false || !KEYS[conf?.mode || "alt-shift"]?.(e)) return;
    // (A drag to select a link's text isn't a click.)
    if (this.down && Math.hypot(e.clientX - this.down[0], e.clientY - this.down[1]) > 4) return;
    let node = e.originalTarget ?? e.target;
    if (node?.nodeType === 3) node = node.parentElement;
    const url = node?.closest?.("a[href], area[href]")?.href;
    if (!url || !/^https?:/i.test(url)) return;
    e.preventDefault();
    e.stopPropagation();
    this.sendAsyncMessage("peek", { url, x: e.screenX, y: e.screenY });
  }
}

export class ZenithPeekLinkParent extends JSWindowActorParent {
  receiveMessage(msg) {
    const { url, x, y } = msg.data ?? {};
    if (msg.name !== "peek" || !/^https?:/i.test(url ?? "")) return;
    const win = this.browsingContext.topChromeWindow;
    win?.ZenithPeek?.open?.(url, { x: x - win.mozInnerScreenX, y: y - win.mozInnerScreenY });
  }
}
