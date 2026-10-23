// SPDX-License-Identifier: GPL-3.0-or-later
// The overview (Alt+O, the hot corner, the bar's overview button): every tab
// as a picture, to go to one, close it, or drag it to another space. After
// niri's and GNOME's: the window zooms out to it, and back.
// Three looks (Shell › The overview shows):
//   space   this space's tabs as a grid, every space in a strip above it
//           (a click on one shows its tabs; the wheel over the strip, the
//           next or previous)
//   all     every space as a row of its tabs
//   tiles   as "space", with a split's tiles together in one picture, laid
//           out as they are
// Typing finds a tab (in every space); arrows move, Enter goes, Delete
// closes, Esc (or Alt+O) leaves. Pictures are taken as the overview opens,
// small, only of tabs that are awake and on screen in it, and kept a little
// while; a sleeping tab shows its icon and title. Nothing of it is kept
// when it's closed.

const HTML = "http://www.w3.org/1999/xhtml";
const P = Services.prefs;

function node(tag, attrs = {}, text = "") {
  const n = document.createElementNS(HTML, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) n.setAttribute(k, v === true ? "" : v);
  if (text) n.textContent = text;
  return n;
}

const W = () => window.gZenWorkspaces;
const S = () => window.gZenViewSplitter;

/* --- Pictures ------------------------------------------------------------------------ */
// Each awake tab, drawn small (kept 30 s; the tab you're on always again).
const Pictures = {
  cache: new Map(), // tab → { url, at }

  async take(tab, width = 360) {
    if (!tab?.linkedPanel || tab.hasAttribute("pending") || tab.closing) return null;
    const had = this.cache.get(tab);
    if (had && !tab.selected && Date.now() - had.at < 30000) return had.url;
    const b = tab.linkedBrowser, ref = gBrowser.selectedBrowser;
    const w = Math.round(b.clientWidth || ref.clientWidth), h = Math.round(b.clientHeight || ref.clientHeight);
    if (!b || w < 50 || h < 50) return null;
    try {
      const bmp = await b.drawSnapshot(0, 0, w, h, Math.min(1, width / w), "white");
      const c = document.createElementNS(HTML, "canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(bmp, 0, 0);
      bmp.close?.();
      // (A tab in the background may not be painted yet, in part or at all: its
      // icon card instead; the picture comes when you've been on it.)
      let black = 0;
      for (let y = 1; y < 5; y++) {
        for (let x = 1; x < 5; x++) {
          const [r, gr, b, a] = g.getImageData(Math.floor((c.width * x) / 5), Math.floor((c.height * y) / 5), 1, 1).data;
          if (a < 50 || r + gr + b < 6) black++;
        }
      }
      if (black > 2 && !tab.selected) return had?.url ?? null;
      const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.82));
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      if (had) URL.revokeObjectURL(had.url);
      this.cache.set(tab, { url, at: Date.now() });
      return url;
    } catch {
      return null;
    }
  },

  forget() {
    for (const [tab, { url, at }] of this.cache) {
      if (!tab.isConnected || Date.now() - at > 120000) {
        URL.revokeObjectURL(url);
        this.cache.delete(tab);
      }
    }
  },
};

// Once the overview has been used: the tab you go to, pictured a moment
// after it's drawn (small, when the browser is idle), so its picture is
// ready next time.
window.gBrowser?.tabContainer.addEventListener("TabSelect", () => {
  clearTimeout(Pictures.soon);
  Pictures.soon = setTimeout(() => {
    const tab = gBrowser.selectedTab;
    window.requestIdleCallback(() => tab.selected && Pictures.take(tab), { timeout: 2000 });
  }, 900);
});

/* --- What's where ------------------------------------------------------------------------ */
const real = t => t.isConnected && !t.closing && !t.hasAttribute("zen-empty-tab") && !t.hasAttribute("zen-glance-tab") && !t.hasAttribute("zen-essential");

function spaces() {
  return W()?.getWorkspaces?.() ?? [];
}

function tabsOf(uuid) {
  const all = [...new Set(W()?.allStoredTabs ?? gBrowser.tabs)].filter(real);
  return uuid ? all.filter(t => t.getAttribute("zen-workspace-id") === uuid) : all;
}

function splitOf(tab) {
  return S()?._data?.find(d => d.tabs.includes(tab)) ?? null;
}

async function go(tab) {
  const uuid = tab.getAttribute("zen-workspace-id");
  if (uuid && uuid !== W()?.activeWorkspace) await W().changeWorkspaceWithID(uuid);
  gBrowser.selectedTab = tab;
}

function sendTo(tab, uuid) {
  if (!uuid || tab.getAttribute("zen-workspace-id") === uuid) return;
  if (splitOf(tab)) S().removeTabFromGroup(tab);
  W()?.moveTabToWorkspace?.(tab, uuid);
}

/* --- The overview ----------------------------------------------------------------------- */
const Overview = {
  open() {
    if (this.host) return;
    this.look = P.getStringPref("zenith.overview.look", "") || "space";
    this.showing = W()?.activeWorkspace ?? null; // the space shown ("space" and "tiles")
    const host = (this.host = node("div", { id: "zenith-overview", look: this.look, role: "dialog", "aria-label": "Overview" }));
    const top = node("div", { class: "zo-top" });
    this.find = node("input", { class: "zo-find", type: "text", spellcheck: "false", placeholder: "Find a tab (in every space)" });
    this.strip = node("div", { class: "zo-spaces" });
    top.append(this.find, this.strip);
    this.body = node("div", { class: "zo-body" });
    host.append(top, this.body);
    (document.getElementById("zen-main-app-wrapper") ?? document.body).append(host);
    this.seen = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) this.picture(e.target);
    }, { root: this.body });
    this.find.addEventListener("input", () => this.draw());
    host.addEventListener("keydown", e => this.key(e));
    host.addEventListener("mousedown", e => e.target === host && this.close());
    this.strip.addEventListener("wheel", e => {
      if (this.look === "all" || Math.abs(e.deltaY) < 1) return;
      const list = spaces(), i = list.findIndex(s => s.uuid === this.showing);
      const next = list[i + (e.deltaY > 0 ? 1 : -1)];
      if (next) this.show(next.uuid);
    }, { passive: true });
    this.draw();
    requestAnimationFrame(() => host.setAttribute("open", "true"));
    this.find.focus();
  },

  close(then) {
    const host = this.host;
    if (!host) return;
    this.host = null;
    this.seen?.disconnect();
    host.removeAttribute("open");
    host.setAttribute("closing", "true");
    setTimeout(() => {
      host.remove();
      Pictures.forget();
    }, 150);
    if (then) then();
    else gBrowser.selectedBrowser.focus();
  },

  toggle() {
    if (this.host) this.close();
    else this.open();
  },

  show(uuid) {
    this.showing = uuid;
    this.draw();
  },

  // A tab's card: its picture (taken when it comes into view), icon, title.
  card(tab) {
    const c = node("div", { class: "zo-card", tabindex: "-1", draggable: "true", title: tab.label });
    c.zoTab = tab;
    const pic = node("div", { class: "zo-pic" });
    const name = node("div", { class: "zo-name" });
    const img = node("img", { alt: "" });
    const src = tab.getAttribute("image");
    if (src) img.src = src;
    name.append(img, node("span", {}, tab.label));
    const x = node("button", { type: "button", class: "zo-x", title: "Close this tab" }, "✕");
    c.append(pic, name, x);
    c.toggleAttribute("current", tab.selected);
    c.toggleAttribute("asleep", tab.hasAttribute("pending"));
    if (tab.hasAttribute("pending") || !tab.linkedPanel) {
      const icon = node("img", { class: "zo-icon", alt: "" });
      if (src) icon.src = src;
      pic.append(icon);
    }
    c.addEventListener("click", e => {
      if (e.target === x) return;
      this.close(() => go(tab));
    });
    c.addEventListener("auxclick", e => e.button === 1 && this.closeTab(tab));
    x.addEventListener("click", () => this.closeTab(tab));
    c.addEventListener("dragstart", e => {
      e.dataTransfer.setData("text/plain", tab.label);
      e.dataTransfer.effectAllowed = "move";
      this.dragged = tab;
    });
    c.addEventListener("dragend", () => (this.dragged = null));
    if (!tab.hasAttribute("pending") && tab.linkedPanel) this.seen.observe(c);
    return c;
  },

  // A split as one card: its tiles where they are ("tiles").
  splitCard(data) {
    const order = [];
    const walk = n => (n.tab ? order.push(n) : n.children?.forEach(walk));
    walk(data.layoutTree);
    const first = data.tabs.find(t => t.selected) ?? order[0]?.tab;
    const c = this.card(first);
    c.classList.add("zo-split");
    const pic = c.querySelector(".zo-pic");
    pic.replaceChildren();
    for (const leaf of order) {
      const p = leaf.positionToRoot ?? { top: 0, right: 0, bottom: 0, left: 0 };
      const tile = node("div", { class: "zo-tile" });
      tile.style.inset = `${p.top}% ${p.right}% ${p.bottom}% ${p.left}%`;
      tile.zoTab = leaf.tab;
      tile.title = leaf.tab.label;
      tile.addEventListener("click", e => {
        e.stopPropagation();
        this.close(() => go(leaf.tab));
      });
      pic.append(tile);
    }
    put(c.querySelector(".zo-name span"), `${order.length} tiles · ${first?.label ?? ""}`);
    return c;
  },

  async picture(card) {
    this.seen?.unobserve(card);
    if (card.classList.contains("zo-split")) {
      for (const tile of card.querySelectorAll(".zo-tile")) {
        const url = await Pictures.take(tile.zoTab, 260);
        if (url && this.host) tile.style.backgroundImage = `url("${url}")`;
      }
      return;
    }
    const url = await Pictures.take(card.zoTab), pic = card.querySelector(".zo-pic");
    if (!this.host) return;
    if (url) pic.style.backgroundImage = `url("${url}")`;
    else if (!pic.querySelector(".zo-icon")) {
      // (Not drawn yet: its icon, as a sleeping tab's.)
      const icon = node("img", { class: "zo-icon", alt: "" }), src = card.zoTab.getAttribute("image");
      if (src) icon.src = src;
      pic.append(icon);
    }
  },

  closeTab(tab) {
    gBrowser.removeTab(tab, { animate: false });
    setTimeout(() => this.host && this.draw(), 60);
  },

  // A space's chip: its icon and name, how many tabs; a tab dropped on it moves there.
  chip(s, i) {
    const c = node("button", { type: "button", class: "zo-space" });
    c.toggleAttribute("current", s.uuid === this.showing);
    c.toggleAttribute("here", s.uuid === W()?.activeWorkspace);
    const n = tabsOf(s.uuid).length;
    c.append(node("span", { class: "zo-space-icon" }, s.icon && !s.icon.includes("/") ? s.icon : `${i + 1}`),
             node("span", { class: "zo-space-name" }, s.name || `Space ${i + 1}`), node("span", { class: "zo-count" }, `${n}`));
    c.addEventListener("click", () => this.show(s.uuid));
    this.dropTarget(c, s.uuid);
    return c;
  },

  dropTarget(el, uuid) {
    el.addEventListener("dragover", e => {
      if (!this.dragged) return;
      e.preventDefault();
      el.setAttribute("dropping", "true");
    });
    el.addEventListener("dragleave", () => el.removeAttribute("dropping"));
    el.addEventListener("drop", e => {
      e.preventDefault();
      el.removeAttribute("dropping");
      if (this.dragged) sendTo(this.dragged, uuid);
      this.dragged = null;
      setTimeout(() => this.host && this.draw(), 80);
    });
  },

  draw() {
    if (!this.host) return;
    const words = this.find.value.toLowerCase().split(/\s+/).filter(Boolean);
    const match = t => words.every(w => `${t.label} ${t.linkedBrowser?.currentURI?.spec ?? ""}`.toLowerCase().includes(w));
    const list = spaces();
    this.strip.replaceChildren(...(this.look === "all" ? [] : list.map((s, i) => this.chip(s, i))));
    this.seen.disconnect();
    // Finding: every space's tabs that match, in one grid.
    if (words.length) {
      const grid = node("div", { class: "zo-grid" });
      grid.append(...tabsOf(null).filter(match).map(t => this.card(t)));
      this.body.replaceChildren(grid.children.length ? grid : node("div", { class: "zo-empty" }, "No tab matches."));
      return;
    }
    if (this.look === "all") {
      this.body.replaceChildren(...list.map((s, i) => {
        const row = node("section", { class: "zo-row" });
        row.toggleAttribute("here", s.uuid === W()?.activeWorkspace);
        const head = node("div", { class: "zo-row-head" });
        head.append(node("span", { class: "zo-space-icon" }, s.icon && !s.icon.includes("/") ? s.icon : `${i + 1}`), node("span", {}, s.name || `Space ${i + 1}`));
        const cards = node("div", { class: "zo-row-cards" });
        const tabs = tabsOf(s.uuid);
        cards.append(...(tabs.length ? tabs.map(t => this.card(t)) : [node("div", { class: "zo-empty" }, "No tabs")]));
        row.append(head, cards);
        this.dropTarget(row, s.uuid);
        return row;
      }));
      return;
    }
    const grid = node("div", { class: "zo-grid" }), tabs = tabsOf(this.showing), done = new Set();
    for (const t of tabs) {
      if (done.has(t)) continue;
      const data = this.look === "tiles" ? splitOf(t) : null;
      if (data && data.tabs.length > 1) {
        data.tabs.forEach(x => done.add(x));
        grid.append(this.splitCard(data));
      } else grid.append(this.card(t));
    }
    this.body.replaceChildren(grid.children.length ? grid : node("div", { class: "zo-empty" }, "No tabs in this space."));
  },

  key(e) {
    // (Alt+O again is the Shell's key: it closes it.)
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      return this.close();
    }
    const cards = [...this.body.querySelectorAll(".zo-card")];
    if (!cards.length) return;
    const at = cards.indexOf(document.activeElement);
    const step = d => {
      e.preventDefault();
      cards[Math.max(0, Math.min(cards.length - 1, (at < 0 ? -1 : at) + d))]?.focus();
    };
    // (Columns: how many cards share the first one's row.)
    const across = cards.filter(c => Math.abs(c.offsetTop - cards[0].offsetTop) < 4).length || 1;
    if (e.key === "ArrowRight") step(1);
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowDown") step(at < 0 ? 1 : across);
    else if (e.key === "ArrowUp") step(-across);
    else if (e.key === "Enter") {
      e.preventDefault();
      const c = at >= 0 ? cards[at] : cards[0];
      this.close(() => go(c.zoTab));
    } else if (e.key === "Delete" && at >= 0) {
      e.preventDefault();
      this.closeTab(cards[at].zoTab);
    }
  },
};

function put(n, text) {
  if (n && n.textContent !== text) n.textContent = text;
}

export function toggle() {
  Overview.toggle();
  return Overview;
}

export function isOpen() {
  return !!Overview.host;
}
