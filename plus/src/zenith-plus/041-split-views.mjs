/* --- Split views: drag a tab, or the whole split --------------------------------
   In the sidebar, dragging one of a split view's tabs moves only that tab:
   onto another tab of the same split, the two swap places (in the split
   too); onto another split's tab, it joins that split; onto a loose tab
   (not in a folder), it leaves its split and goes before or after it.
   What letting go would do shows as you drag (the tab or split outlined,
   or a line). Escape cancels. A loose tab dragged onto a split's tab
   joins the split (anywhere on it). Pressing on a split's left edge (it
   lights up on hover) drags the whole split, before or after a loose tab
   or another split.
   The tab is moved with the pointer here, not with the browser's
   drag-and-drop: Zen's own drag would take the whole split, and nothing
   of Zen's sidebar is touched. */
const SplitReorder = {
  TYPE: "application/x-moz-tabbrowser-tab",
  EDGE: 10,

  init() {
    const tabOf = n => (n?.nodeType === Node.TEXT_NODE ? n.parentElement : n)?.closest?.("tab.tabbrowser-tab") ?? null;
    const down = e => {
      this.press = null;
      if (e.button !== 0 || e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) return;
      const group = this.split(e.target?.closest?.("tab-group")), tab = tabOf(e.target) ?? group?.tabs[0];
      if (!group || !gBrowser.tabContainer.contains(group)) return;
      const whole = e.clientX - group.getBoundingClientRect().left < this.EDGE;
      this.press = { tab, group, whole, x: e.screenX, y: e.screenY };
    };
    const move = e => {
      const p = this.press;
      if (!p) return;
      if (!(e.buttons & 1)) return this.endDrag();
      if (!this.drag) {
        if (Math.hypot(e.screenX - p.x, e.screenY - p.y) < 6) return;
        this.drag = { tab: p.tab, group: p.group, whole: p.whole, node: p.whole ? p.group : p.tab };
        root.setAttribute("zenith-split-dragging", "true");
        this.drag.node.setAttribute("zenith-split-moving", "true");
      }
      const at = document.elementFromPoint(e.clientX, e.clientY);
      this.mark(this.drag.whole ? this.whatWhole(this.drag.group, at, e) : this.whatDrop(this.drag.tab, this.targetOf(at), e, true));
      root.toggleAttribute("zenith-split-nowhere", !this.marked);
      this.ghost(e);
    };
    const up = e => {
      this.press = null;
      if (!this.drag) return;
      const what = this.marked;
      this.endDrag();
      // (The click this release makes goes nowhere.)
      window.addEventListener("click", c => (c.preventDefault(), c.stopPropagation()), { capture: true, once: true });
      if (what) this.apply(what);
    };
    const key = e => e.key === "Escape" && this.drag && (e.preventDefault(), this.endDrag());
    // The browser's drag of a split's tab (and so Zen's of the whole split)
    // doesn't start: the pointer moves it here.
    const start = e => {
      if (!this.press) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    // Zen's drag of a loose tab, over a split's tab: it joins the split.
    const over = e => {
      if (this.drag) return;
      const dragged = e.dataTransfer?.mozGetDataAt?.(this.TYPE, 0);
      if (!dragged?.isConnected || !(dragged instanceof XULElement)) return this.mark(null);
      const what = this.whatDrop(dragged, this.targetOf(e.target), e, false);
      this.mark(what);
      if (!what) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    };
    const drop = e => {
      if (this.drag || !this.marked) return;
      const what = this.marked;
      this.mark(null);
      e.preventDefault();
      e.stopImmediatePropagation();
      this.apply(what);
    };
    const end = () => !this.drag && this.mark(null);
    const listeners = [["mousedown", down], ["mousemove", move], ["mouseup", up], ["keydown", key], ["dragstart", start],
                       ["dragover", over], ["drop", drop], ["dragend", end]];
    for (const [type, fn] of listeners) window.addEventListener(type, fn, true);
    onUnload(() => {
      for (const [type, fn] of listeners) window.removeEventListener(type, fn, true);
    });
    window.ZenithSplitReorder = this; // for tools/checks
  },

  split(group) {
    return group?.hasAttribute?.("split-view-group") ? group : null;
  },

  // What's on the move, under the pointer: the tab (its icon and title) or
  // the split's tabs, as Zen shows a tab it drags.
  ghost(e) {
    if (!this.ghostNode) {
      const g = (this.ghostNode = el("div", { id: "zenith-split-ghost" }));
      g.toggleAttribute("whole", !!this.drag.whole);
      for (const t of this.drag.whole ? this.drag.group.tabs : [this.drag.tab]) {
        const chip = el("div", { class: "chip" });
        const icon = el("img", { class: "icon", alt: "" });
        const src = t.getAttribute("image") || t.querySelector(".tab-icon-image")?.src;
        if (src) icon.src = src;
        else icon.setAttribute("blank", "true");
        const label = el("span", { class: "label" });
        label.textContent = t.label;
        chip.append(icon, label);
        g.append(chip);
      }
      (document.getElementById("zen-main-app-wrapper") ?? document.body).append(g);
    }
    this.ghostNode.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 10}px)`;
  },

  // The tab under the pointer; between a split's tabs, its first one.
  targetOf(node) {
    if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
    return node?.closest?.("tab.tabbrowser-tab") ?? this.split(node?.closest?.("tab-group"))?.tabs[0] ?? null;
  },

  // The whole split: before or after a loose tab or another split (as
  // pinned as it is; not among the essentials or in a folder).
  whatWhole(group, node, e) {
    const tab = this.targetOf(node);
    if (!tab || group.contains(tab) || tab.hasAttribute("zen-essential") || tab.hasAttribute("zen-glance-tab") ||
        tab.hasAttribute("zen-empty-tab") || tab.pinned !== group.tabs[0]?.pinned) return null;
    const target = this.split(tab.group) ?? (tab.group ? null : tab);
    if (!target) return null;
    const r = target.getBoundingClientRect();
    return { kind: e.clientY < r.top + r.height / 2 ? "before" : "after", whole: true, tab: group, target, node: target };
  },

  endDrag() {
    this.mark(null);
    this.drag?.node.removeAttribute("zenith-split-moving");
    root.removeAttribute("zenith-split-dragging");
    root.removeAttribute("zenith-split-nowhere");
    this.ghostNode?.remove();
    this.ghostNode = null;
    this.drag = null;
    this.press = null;
  },

  // What letting go here would do: swap (same split), join (another
  // split; a loose tab only, or one of a split), or place it before/after
  // a loose tab (leaving its split); null: nothing.
  whatDrop(tab, target, e, ours) {
    if (!target || target === tab || target.hasAttribute("zen-glance-tab") || target.hasAttribute("zen-empty-tab")) return null;
    const mine = this.split(tab.group), theirs = this.split(target.group);
    if (mine && mine === theirs) return { kind: "swap", tab, target, node: target };
    if (theirs) {
      const full = theirs.tabs.length >= (window.gZenViewSplitter?.MAX_TABS ?? 4);
      const movable = mine || (!tab.group && !tab.hasAttribute("zen-essential") && tab.pinned === target.pinned);
      return full || !movable ? null : { kind: "join", tab, target, node: theirs };
    }
    if (!ours || target.group || target.hasAttribute("zen-essential")) return null;
    const r = target.getBoundingClientRect();
    return { kind: e.clientY < r.top + r.height / 2 ? "before" : "after", tab, target, node: target };
  },

  mark(what) {
    if (this.marked?.node === what?.node && this.marked?.kind === what?.kind) return;
    this.marked?.node.removeAttribute(`zenith-split-${this.marked.kind}`);
    this.marked = what;
    what?.node.setAttribute(`zenith-split-${what.kind}`, "true");
  },

  apply({ kind, tab, target, whole }) {
    const S = window.gZenViewSplitter;
    if (!S) return;
    try {
      if (whole) {
        if (kind === "before") gBrowser.moveTabBefore(tab, target);
        else gBrowser.moveTabAfter(tab, target);
        return;
      }
      if (kind === "swap") return this.swap(tab, target);
      if (this.split(tab.group)) S.removeTabFromGroup(tab);
      if (kind === "join") {
        S.splitTabs([target, tab], undefined, -1, { activate: false });
        // (Zen adds it to the layout but only draws it when the split is
        // shown again: drawn now, or the panes overlap.)
        NewTabBelow.redraw(target);
        return;
      }
      // Beside a loose tab, as it is: pinned or not.
      if (target.pinned && !tab.pinned) gBrowser.pinTab(tab);
      else if (!target.pinned && tab.pinned) gBrowser.unpinTab(tab);
      if (kind === "before") gBrowser.moveTabBefore(tab, target);
      else gBrowser.moveTabAfter(tab, target);
      gBrowser.selectedTab = tab;
    } catch (e) {
      console.error("[Zenith] split view: moving a tab", e);
    }
  },

  swap(a, b) {
    const S = window.gZenViewSplitter;
    const data = S?._data?.find(d => d.tabs.includes(a) && d.tabs.includes(b));
    const na = S?.getSplitNodeFromTab?.(a), nb = S?.getSplitNodeFromTab?.(b);
    if (!data || !na || !nb) return false;
    S.swapNodes(na, nb);
    const i = data.tabs.indexOf(a), j = data.tabs.indexOf(b);
    [data.tabs[i], data.tabs[j]] = [data.tabs[j], data.tabs[i]];
    S.applyGridLayout(data.layoutTree);
    const marker = document.createXULElement("box");
    a.before(marker);
    b.before(a);
    marker.replaceWith(b);
    gBrowser.tabContainer._invalidateCachedTabs?.();
    // (Zen saves split views with the session.)
    try {
      S.saveState?.();
    } catch {}
    return true;
  },
};

