// about:zenith-tabs: every space's tabs, tidying up, and rules.
// The page asks the window it's in (zenith-tabs.uc.mjs: window.ZenithTabs)
// to do everything; it only shows and picks. Nothing happens until you
// press something here, or set a rule on the Rules page.
// about:zenith-tabs?compact is the same page for the card over the page:
// one list by space, tidying folded away.

const win = window.browsingContext.topChromeWindow;
const Z = win.ZenithTabs;
const { gBrowser, Services } = win;
const W = () => win.gZenWorkspaces;
const G = () => win.ZenithGroups;
const PAGE = "about:zenith-tabs";
const DAY = 24 * 60 * 60 * 1000;
const COMPACT = new URLSearchParams(location.search).has("compact");
const $ = id => document.getElementById(id);

function make(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  node.append(...kids.flat(Infinity).filter(k => k != null && k !== false));
  return node;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const mb = bytes => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`);

function icon(name, title) {
  const s = make("span", { class: "glyph", title });
  s.style.setProperty("--icon", `url("chrome://browser/skin/zen-icons/${name}.svg")`);
  return s;
}

/* --- Colours: the window's Zenith colours, on this page ---------------------------- */

const VARS = ["--zth-glass-color", "--zth-accent", "--zth-accent-soft", "--zth-ink", "--zth-ink-dim", "--zth-hairline",
              "--zth-radius", "--zth-pill-radius", "--zth-font", "--zth-row", "--zth-shadow"];

function paint() {
  const cs = win.getComputedStyle(win.document.documentElement);
  for (const v of VARS) {
    const value = cs.getPropertyValue(v).trim();
    if (value) document.documentElement.style.setProperty(v, value);
  }
  const dark = win.document.documentElement.getAttribute("zen-should-be-dark-mode");
  document.documentElement.style.colorScheme = dark === "true" ? "dark" : dark === "false" ? "light" : "light dark";
}

/* --- What's there ------------------------------------------------------------------- */

const Look = Z.Look;

function spaces() {
  return Look.spaces().length ? Look.spaces() : [{ uuid: "", name: "Tabs" }];
}

function tabs() {
  return Look.tabs().filter(t => !t.linkedBrowser?.currentURI?.spec?.startsWith(PAGE));
}

function spaceColour(space) {
  const c = space?.theme?.gradientColors?.find(x => x?.isPrimary)?.c ?? space?.theme?.gradientColors?.[0]?.c;
  return Array.isArray(c) ? `rgb(${c.slice(0, 3).join(" ")})` : "";
}

const spaceLabel = s => `${s.icon && !/^[a-z]+:/i.test(s.icon) ? `${s.icon}  ` : ""}${s.name || "Space"}`;

function matches(tab) {
  const q = state.query.toLowerCase();
  return !q || (tab.label || "").toLowerCase().includes(q) || Look.site(tab).toLowerCase().includes(q);
}

// A folder or group that doesn't pin its tabs: Firefox's, or Zen's set to.
const loose = g => !g.isZenFolder || g.hasAttribute("zenith-unpinned");

/* --- State ----------------------------------------------------------------------- */

const state = {
  view: "overview",
  query: "",
  picked: new Set(),
  last: null, // the last tab clicked, for Shift
  open: new Set(), // folders shown open
  shut: new Set(), // spaces folded (compact)
  tidy: new Map(), // tidy card → unticked tabs
  days: Services.prefs.getIntPref("zenith.internal.tabs.days", 7),
  usage: new Map(),
};

/* --- Drawing ------------------------------------------------------------------------- */

const rows = new WeakMap(); // row element → tab
let order = []; // tabs in the order shown, for Shift ranges

function render() {
  paint();
  document.body.classList.toggle("compact", COMPACT);
  for (const t of state.picked) if (!t.isConnected || t.closing) state.picked.delete(t);
  const all = tabs();
  const awake = all.filter(t => Look.awake(t));
  const memory = [...state.usage.values()].reduce((n, u) => n + u.memory, 0);
  $("summary").textContent = [plural(spaces().length, "space"), plural(all.length, "tab"), `${awake.length} awake`,
                              memory ? `${mb(memory)} in tabs` : ""].filter(Boolean).join(" · ");
  for (const b of $("views").children) b.setAttribute("aria-selected", String(b.dataset.view === state.view));
  $("undo").hidden = !Z.Act.history.length;
  $("undo").title = Z.Act.history.at(-1)?.label ? `Undo: ${Z.Act.history.at(-1).label}` : "Undo";
  $("overview").hidden = state.view !== "overview";
  $("rules").hidden = state.view !== "rules";
  if (state.view === "overview") {
    renderBoard(all);
    renderTidy();
  } else {
    renderRules();
  }
  renderBar();
}

function tabRow(tab) {
  const ico = make("span", { class: "icon" });
  const image = tab.getAttribute("image");
  if (image) {
    const img = make("img", { src: image, alt: "" });
    img.addEventListener("error", () => img.remove(), { once: true });
    ico.append(img);
  }
  const asleep = !Look.awake(tab);
  const use = state.usage.get(tab);
  const act = (title, glyph, fn) => make("button", { type: "button", title, onclick: e => (e.stopPropagation(), fn()) }, icon(glyph));
  const box = make("input", { type: "checkbox", class: "pick", title: "Pick" });
  box.checked = state.picked.has(tab);
  const row = make("div", { class: "tab", draggable: "true", picked: state.picked.has(tab), current: tab.selected, asleep },
    box, ico,
    make("span", { class: "text" }, make("span", { class: "title" }, tab.label || Look.site(tab)), make("span", { class: "host" }, Look.site(tab))),
    Look.splitOf(tab) ? icon("split", "In a split view") : null,
    tab.hasAttribute("soundplaying") ? make("span", { class: "badge", title: "Playing" }, "♪") : null,
    asleep ? icon("moon-stars", "Asleep") : null,
    use ? make("span", { class: "use", title: use.shared ? "Shared with other tabs of the site" : "Memory" },
               [mb(use.memory), use.cpu > 0.01 ? ` · ${Math.round(use.cpu * 100)}%` : ""].join("")) : null,
    make("span", { class: "acts" },
      act("Go to it", "arrow-right", () => Z.Act.go(tab)),
      asleep ? act("Wake it", "reload", () => (Z.Act.wake([tab]), soon())) : act("Put to sleep", "moon-stars", () => (Z.Act.sleep([tab]), soon())),
      act("Close (Undo comes up)", "close", () => closeTabs([tab]))));
  rows.set(row, tab);
  order.push(tab);
  row.title = `${tab.label}\n${tab.linkedBrowser?.currentURI?.spec ?? ""}`;
  return row;
}

function folderBlock(group, items, nested = []) {
  const open = state.open.has(group.id) || !!state.query;
  const kind = loose(group) ? "group" : "folder";
  const all = [...(group.tabs ?? [])].filter(t => !t.hasAttribute("zen-empty-tab"));
  const box = make("input", { type: "checkbox", class: "pick", title: "Pick all its tabs" });
  box.checked = all.length > 0 && all.every(t => state.picked.has(t));
  box.addEventListener("click", e => {
    e.stopPropagation();
    for (const t of all) (box.checked ? state.picked.add(t) : state.picked.delete(t));
    render();
  });
  const mark = make("span", { class: `mark ${kind}` });
  if (!group.isZenFolder) mark.style.setProperty("--group", GROUP_COLOURS[group.color] ?? "var(--accent)");
  const head = make("div", { class: "head", draggable: "true", title: kind === "folder" ? "A folder: its tabs are pinned" : "A group: its tabs aren't pinned" },
    box, make("span", { class: "chev" }), mark, make("span", { class: "name" }, group.label || (kind === "group" ? "Group" : "Folder")),
    kind === "folder" ? icon("pin", "Pinned") : make("span", { class: "kind" }, "group"),
    make("span", { class: "count" }, String(all.length)));
  head.addEventListener("click", () => {
    if (state.open.has(group.id)) state.open.delete(group.id);
    else state.open.add(group.id);
    render();
  });
  head.addEventListener("dragstart", e => {
    dragging = { folder: group };
    e.dataTransfer.setData("application/x-zenith-tabs", "folder");
    e.dataTransfer.effectAllowed = "move";
  });
  dropOn(head, moving => moving.tabs && Z.Act.into(moving.tabs, { folder: group }));
  return make("div", { class: "folder", open }, head, make("div", { class: "tabs" }, nested, items.map(tabRow)));
}

const GROUP_COLOURS = { blue: "#4a90e2", purple: "#a56ee8", cyan: "#3fb8c9", orange: "#f08a3c", yellow: "#e6c229",
                        pink: "#e8669c", green: "#47b26b", gray: "#8a8a8a", red: "#e05656" };

// A space's tabs as its sidebar has them: folders and groups (folders in
// folders), then loose tabs; pinned first.
function spaceParts(space, all, folders) {
  const here = all.filter(t => !t.hasAttribute("zen-essential") && (Look.space(t) || "") === space.uuid);
  const shown = here.filter(matches);
  const inSpace = folders.filter(f => (f.getAttribute("zen-workspace-id") || "") === space.uuid);
  const block = f => {
    const children = inSpace.filter(c => c.group === f).map(block).filter(Boolean);
    const items = shown.filter(t => Look.ownGroup(t) === f);
    if (!items.length && !children.length && state.query) return null;
    return folderBlock(f, items, children);
  };
  const top = inSpace.filter(f => !f.group || !inSpace.includes(f.group));
  const looseTabs = pinned => shown.filter(t => !!t.pinned === pinned && !Look.ownGroup(t));
  const pinnedPart = [...top.filter(f => f.pinned || f.isZenFolder).map(block), ...looseTabs(true).map(tabRow)].filter(Boolean);
  const tabsPart = [...top.filter(f => !(f.pinned || f.isZenFolder)).map(block), ...looseTabs(false).map(tabRow)].filter(Boolean);
  return { here, pinnedPart, tabsPart };
}

function renderBoard(all) {
  order = [];
  const ess = all.filter(t => t.hasAttribute("zen-essential") && matches(t));
  const strip = $("essentials");
  strip.hidden = !ess.length;
  const perSpace = Services.prefs.getBoolPref("zen.workspaces.container-specific-essentials-enabled", false);
  strip.replaceChildren(make("span", { class: "label" }, perSpace ? "Essentials" : "Essentials · in every space"),
    ...ess.map(t => {
      const row = tabRow(t);
      if (perSpace) row.querySelector(".host").textContent = Look.essentialSpaces(t).map(s => s.name).join(", ") || "no space";
      return row;
    }));
  const folders = Z.Act.folders();
  const usage = state.usage;
  const columns = spaces().map(space => {
    const { here, pinnedPart, tabsPart } = spaceParts(space, all, folders);
    const awake = here.filter(t => Look.awake(t)).length;
    const mem = here.reduce((n, t) => n + (usage.get(t)?.memory ?? 0), 0);
    const folded = COMPACT && state.shut.has(space.uuid);
    const head = make("header", { title: COMPACT ? "Fold or unfold" : "Go to this space" },
      COMPACT ? make("span", { class: "chev" }) : null,
      make("span", { class: "name" }, spaceLabel(space)),
      space.uuid && space.uuid === W()?.activeWorkspace ? make("span", { class: "here" }, "here") : null,
      make("span", { class: "count" }, [`${here.length} · ${awake} awake`, mem ? mb(mem) : ""].filter(Boolean).join(" · ")));
    head.style.setProperty("--space", spaceColour(space));
    // In the card a space folds; on the page its name goes there.
    head.addEventListener("click", () => {
      if (COMPACT) {
        if (state.shut.has(space.uuid)) state.shut.delete(space.uuid);
        else state.shut.add(space.uuid);
        render();
      } else if (space.uuid) W()?.changeWorkspaceWithID(space.uuid);
    });
    const list = make("div", { class: "list" },
      pinnedPart.length ? [make("div", { class: "part" }, "Pinned"), pinnedPart] : null,
      tabsPart.length ? [make("div", { class: "part" }, "Tabs"), tabsPart] : null,
      !pinnedPart.length && !tabsPart.length ? make("div", { class: "empty" }, state.query ? "Nothing matches" : "No tabs") : null);
    const column = make("section", { class: "space", folded }, head, list);
    if (space.uuid) dropOn(column, moving => (moving.folder ? Z.Act.moveFolder(moving.folder, space.uuid) : Z.Act.move(moving.tabs, space.uuid)));
    return column;
  });
  $("board").replaceChildren(...columns);
}

/* --- Picking -------------------------------------------------------------------------- */

// A click picks or unpicks (Shift: everything between); double-click goes.
document.addEventListener("click", e => {
  const row = e.target.closest?.(".tab");
  if (!row || (e.target.closest("button") && !e.target.closest("input"))) return;
  const tab = rows.get(row);
  if (!tab) return;
  if (e.shiftKey && state.last) {
    const a = order.indexOf(state.last), b = order.indexOf(tab);
    if (a >= 0 && b >= 0) for (const t of order.slice(Math.min(a, b), Math.max(a, b) + 1)) state.picked.add(t);
  } else if (state.picked.has(tab)) {
    state.picked.delete(tab);
  } else {
    state.picked.add(tab);
  }
  state.last = tab;
  render();
});

document.addEventListener("dblclick", e => {
  const tab = rows.get(e.target.closest?.(".tab"));
  if (tab) Z.Act.go(tab);
});

// Dragging picked tabs (or the one under the pointer), or a folder, onto a
// space or a folder.
let dragging = null;
document.addEventListener("dragstart", e => {
  const tab = rows.get(e.target.closest?.(".tab"));
  if (!tab) return;
  dragging = { tabs: state.picked.has(tab) ? [...state.picked] : [tab] };
  e.dataTransfer.setData("application/x-zenith-tabs", String(dragging.tabs.length));
  e.dataTransfer.effectAllowed = "move";
});
document.addEventListener("dragend", () => (dragging = null));

function dropOn(node, fn) {
  node.addEventListener("dragover", e => {
    if (!dragging) return;
    e.preventDefault();
    e.stopPropagation();
    for (const n of document.querySelectorAll("[drop]")) if (n !== node) n.removeAttribute("drop");
    node.setAttribute("drop", "");
  });
  node.addEventListener("dragleave", e => {
    if (!node.contains(e.relatedTarget)) node.removeAttribute("drop");
  });
  node.addEventListener("drop", e => {
    e.preventDefault();
    e.stopPropagation();
    node.removeAttribute("drop");
    if (dragging && fn(dragging)) offerUndo();
    dragging = null;
    soon();
  });
}

/* --- Acting on what's picked --------------------------------------------------------------- */

function closeTabs(list) {
  const n = Z.Act.closePicked(list);
  for (const t of list) state.picked.delete(t);
  if (n) offerUndo();
  soon();
}

// After anything that changed tabs: a note with Undo.
function offerUndo() {
  const last = Z.Act.history.at(-1);
  if (last) say(last.label, () => say(Z.Act.undoLast() ? "Put back" : "Nothing to undo"));
}

function renderBar() {
  const bar = $("bar");
  const picked = [...state.picked];
  bar.hidden = !picked.length || state.view !== "overview";
  if (bar.hidden) return;
  const asleep = picked.filter(t => !Look.awake(t)).length;
  const grouped = picked.filter(t => Look.ownGroup(t)).length;
  const done = fn => () => {
    if (fn()) offerUndo();
    soon();
  };
  bar.replaceChildren(...[
    make("span", { class: "count" }, `${picked.length} picked`),
    make("button", { type: "button", onclick: e => menu(e.currentTarget, spaceItems(picked)) }, "Move to…"),
    make("button", { type: "button", onclick: e => menu(e.currentTarget, folderItems(picked)) }, "Into…"),
    grouped ? make("button", { type: "button", title: "Out of their folder or group, as ordinary tabs", onclick: done(() => Z.Act.takeOut(picked)) }, "Take out") : null,
    picked.length > asleep ? make("button", { type: "button", onclick: () => (Z.Act.sleep(picked), soon()) }, "Sleep") : null,
    asleep ? make("button", { type: "button", onclick: () => (Z.Act.wake(picked), soon()) }, "Wake") : null,
    make("button", { type: "button", onclick: () => closeTabs(picked) }, "Close"),
    make("button", { type: "button", class: "quiet", title: "Pick nothing (Esc)", onclick: () => (state.picked.clear(), render()) }, "✕"),
  ].filter(Boolean));
}

function spaceItems(picked) {
  return spaces().filter(s => s.uuid).map(s => ({ label: spaceLabel(s), note: s.uuid === W()?.activeWorkspace ? "here" : "",
                                                  run: () => Z.Act.move(picked, s.uuid) }));
}

function folderItems(picked) {
  const mode = G()?.mode ?? "off";
  const items = [{ label: "New folder…", note: "pins its tabs", run: () => ask("Folder name", name => Z.Act.into(picked, { name, kind: "folder" })) }];
  if (mode !== "off") {
    items.push({ label: "New group…", note: "tabs stay unpinned", run: () => ask("Group name", name => Z.Act.into(picked, { name, kind: "group" })) });
  }
  const folders = Z.Act.folders();
  if (folders.length) items.push({ sep: true });
  for (const f of folders) {
    items.push({ label: `${loose(f) ? "▢" : "📁"}  ${f.label || "Folder"}`, note: Look.spaceName(f.getAttribute("zen-workspace-id") || ""),
                 run: () => Z.Act.into(picked, { folder: f }) });
  }
  return items;
}

// A small list under a button.
function menu(anchor, items) {
  const box = $("menu");
  box.replaceChildren(...items.map(i => i.sep ? make("div", { class: "sep" })
    : make("button", { type: "button", class: "item", onclick: () => { box.hidden = true; if (i.run()) offerUndo(); soon(); } },
           make("span", {}, i.label), i.note ? make("small", {}, i.note) : null)));
  box.hidden = false;
  const r = anchor.getBoundingClientRect(), h = box.getBoundingClientRect().height;
  box.style.left = `${Math.max(8, Math.min(r.left, innerWidth - box.offsetWidth - 8))}px`;
  box.style.top = `${r.top - h - 6 > 8 ? r.top - h - 6 : r.bottom + 6}px`;
}

document.addEventListener("mousedown", e => {
  if (!e.target.closest("#menu") && !e.target.closest("#bar button")) $("menu").hidden = true;
});

// A name asked for in the bar itself.
function ask(placeholder, fn) {
  const bar = $("bar");
  const input = make("input", { type: "text", placeholder });
  const go = () => {
    const name = input.value.trim();
    if (name && fn(name)) {
      state.picked.clear();
      offerUndo();
    }
    soon();
  };
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") go();
    else if (e.key === "Escape") render();
  });
  bar.replaceChildren(make("span", { class: "count" }, `${state.picked.size} picked`), input,
                      make("button", { type: "button", class: "primary", onclick: go }, "Make it"),
                      make("button", { type: "button", class: "quiet", onclick: () => render() }, "Cancel"));
  input.focus();
  return false;
}

function say(text, undo = null) {
  const note = $("note");
  note.replaceChildren(...[make("span", {}, text), undo && make("button", { type: "button", onclick: () => { undo(); soon(); } }, "Undo")].filter(Boolean));
  note.hidden = false;
  clearTimeout(say.timer);
  say.timer = setTimeout(() => (note.hidden = true), undo ? 8000 : 3000);
}

/* --- Tidying up -------------------------------------------------------------------------- */

// Each suggestion lists its tabs, ticked; untick what to keep, then press
// a button. (Folded in the card until you open one.)
function tidyCard(key, title, why, list, actions, extra = null) {
  const unticked = state.tidy.get(key) ?? new Set();
  state.tidy.set(key, unticked);
  const chosen = () => list.filter(t => !unticked.has(t));
  const openKey = `tidy-${key}`;
  const open = !COMPACT || state.open.has(openKey);
  const head = make("div", { class: "card-head" }, make("h3", {}, title), make("span", { class: "n" }, String(list.length)), extra);
  if (COMPACT) head.addEventListener("click", e => {
    if (e.target.closest("button")) return;
    if (state.open.has(openKey)) state.open.delete(openKey);
    else state.open.add(openKey);
    render();
  });
  const rowsBox = open && list.length ? make("div", { class: "ticks" }, list.slice(0, 60).map(t => {
    const box = make("input", { type: "checkbox" });
    box.checked = !unticked.has(t);
    box.addEventListener("change", () => {
      if (box.checked) unticked.delete(t);
      else unticked.add(t);
      render();
    });
    const use = state.usage.get(t);
    return make("label", { class: "tick" }, box, make("span", { class: "title" }, t.label || Look.site(t)),
      make("small", {}, [Look.site(t), Look.space(t) !== W()?.activeWorkspace ? Look.spaceName(Look.space(t)) : "",
                         key === "stale" ? `${Math.floor((Date.now() - t.lastAccessed) / DAY)}d` : "", use ? mb(use.memory) : ""].filter(Boolean).join(" · ")));
  })) : null;
  const n = chosen().length;
  return make("div", { class: "card", open, empty: !list.length },
    head,
    open ? make("p", {}, why) : null,
    rowsBox,
    open && list.length ? make("div", { class: "row" }, actions.map(([label, fn, primary]) =>
      make("button", { type: "button", class: primary ? "primary" : null, disabled: !n, onclick: () => { if (fn(chosen())) offerUndo(); soon(); } },
           `${label}${n !== list.length ? ` (${n})` : ""}`))) : null);
}

function renderTidy() {
  const r = Look.report(state.days);
  const own = t => !t.linkedBrowser?.currentURI?.spec?.startsWith(PAGE);
  const dupes = r.duplicates.filter(own), stale = r.stale.filter(own);
  // Awake tabs, heaviest first.
  const awake = r.awake.filter(own).sort((a, b) => (state.usage.get(b)?.memory ?? 0) - (state.usage.get(a)?.memory ?? 0));
  const chips = make("div", { class: "chips" }, [3, 7, 14, 30].map(d => make("button", {
    type: "button", "aria-pressed": String(d === state.days),
    onclick: e => { e.stopPropagation(); state.days = d; Services.prefs.setIntPref("zenith.internal.tabs.days", d); render(); },
  }, `${d}d`)));
  const busy = r.busy.map(b => tidyCard(`busy-${b.space}-${b.site}`, b.site, `${b.tabs.length} loose tabs${Look.spaceName(b.space) ? ` in ${Look.spaceName(b.space)}` : ""}: keep them together.`,
    b.tabs, [["Into a folder", list => Z.Act.into(list, { name: b.site, kind: "folder", space: b.space }), true],
             ...((G()?.mode ?? "off") !== "off" ? [["Into a group", list => Z.Act.into(list, { name: b.site, kind: "group", space: b.space })]] : [])]));
  $("tidy").replaceChildren(...[
    make("h2", {}, "Tidy up"),
    tidyCard("dupes", "Duplicates", "The same page open more than once; the one you used last isn't listed.", dupes,
             [["Close", list => Z.Act.closePicked(list), true]]),
    tidyCard("stale", `Not used in ${state.days} days`, "Loose tabs you haven't been to for a while.", stale,
             [["Sleep", list => (Z.Act.sleep(list), false)], ["Close", list => Z.Act.closePicked(list), true]], chips),
    tidyCard("awake", "Awake", "Loaded and using memory, heaviest first (not the tab you're on, nor playing tabs).", awake,
             [["Sleep", list => (Z.Act.sleep(list), false), true]]),
    busy.length ? make("h2", {}, "Busy sites") : null,
    ...busy,
    ...topicCards(),
  ].filter(Boolean));
}

// By topic (with Zenith's local AI on): this space's loose tabs, sorted
// into groups by what they're about and named for it, to put into folders
// or groups. Nothing moves until you press a button.
function topicCards() {
  const AI = win.ZenithAI;
  if (!AI?.on) return [];
  const space = W()?.activeWorkspace;
  const loose = Look.tabs().filter(t => Look.space(t) === space && !Look.kept(t) && !t.group && !t.hasAttribute("zen-empty-tab") &&
                                       !t.linkedBrowser?.currentURI?.spec?.startsWith(PAGE));
  const run = async () => {
    state.topics = { space, status: "Sorting…" };
    render();
    try {
      const groups = await AI.topics(loose, p => {
        state.topics.status = `Getting the models: ${p}% (once, about 60 MB)`;
        render();
      });
      state.topics = { space, groups };
    } catch (e) {
      console.error("[Zenith Tab manager] topics", e);
      state.topics = { space, status: "Couldn't sort them: " + (e.message || e) };
    }
    render();
  };
  const t = state.topics?.space === space ? state.topics : null;
  const groups = (t?.groups ?? []).map(g => ({ ...g, tabs: g.tabs.filter(x => x.isConnected && !x.group && !Look.kept(x)) }))
    .filter(g => g.tabs.length > 1);
  const head = make("div", { class: "card", open: true },
    make("div", { class: "card-head" }, make("h3", {}, "Loose tabs in this space"), make("span", { class: "n" }, String(loose.length))),
    make("p", {}, t?.status ?? (t?.groups ? (groups.length ? "Untick what to leave out, then put each group away." : "Nothing that belongs together.")
                                            : "Sorted by what they're about, on this computer.")),
    make("div", { class: "row" }, make("button", { type: "button", class: t?.groups ? null : "primary", disabled: loose.length < 3 || t?.status === "Sorting…", onclick: run },
                                       t?.groups ? "Sort again" : "Sort by topic")));
  const into = (g, kind) => list => Z.Act.into(list, { name: g.label || "Topic", kind, space });
  return [make("h2", {}, "By topic"), head,
    ...groups.map((g, i) => tidyCard(`topic-${i}-${g.label}`, g.label || "Together", `${g.tabs.length} tabs about the same thing.`, g.tabs,
      [["Into a folder", into(g, "folder"), true], ...((G()?.mode ?? "off") !== "off" ? [["Into a group", into(g, "group")]] : [])]))];
}

/* --- Rules ---------------------------------------------------------------------------------- */

function renderRules() {
  const rules = Z.Rules.list;
  const save = () => Z.Rules.save(rules);
  const mode = G()?.mode ?? "off";
  const folders = Z.Act.folders();
  const select = (value, options, onchange) => {
    const s = make("select", { onchange: e => onchange(e.target.value) }, options.map(([v, label]) => make("option", { value: v }, label)));
    s.value = value;
    return s;
  };
  const ruleRow = (rule, i) => {
    const on = make("input", { type: "checkbox", class: "switch", title: "On or off" });
    on.checked = !!rule.on;
    on.addEventListener("change", () => { rule.on = on.checked; save(); render(); });
    const value = make("input", { type: "text", placeholder: rule.match === "site" ? "github.com" : "what to look for", value: rule.value ?? "" });
    value.addEventListener("change", () => { rule.value = value.value.trim(); save(); });
    const kind = rule.kind === "group" ? "group" : "folder";
    const fits = f => (kind === "group" ? loose(f) : !loose(f));
    const targets = [["new", kind === "group" ? "a new group named" : "a new folder named"],
                     ...folders.filter(fits).map(f => [f.id, `${kind === "group" ? "▢" : "📁"} ${f.label || "Folder"} (${Look.spaceName(f.getAttribute("zen-workspace-id") || "")})`])];
    const name = make("input", { type: "text", placeholder: "Name", value: rule.name ?? "" });
    name.addEventListener("change", () => { rule.name = name.value.trim(); save(); });
    name.hidden = !!rule.folder;
    return make("div", { class: "rule", off: !rule.on },
      on, make("span", { class: "word" }, "When a tab's"),
      select(rule.match ?? "site", [["site", "site is"], ["url", "address contains"], ["title", "title contains"]], v => { rule.match = v; save(); render(); }),
      value,
      make("span", { class: "word" }, "in"),
      select(rule.space ?? "", [["", "any space"], ...spaces().filter(s => s.uuid).map(s => [s.uuid, s.name])], v => { rule.space = v; save(); }),
      make("span", { class: "word" }, "put it in"),
      select(kind, [["folder", "a folder (pins)"], ...(mode !== "off" ? [["group", "a group (doesn't pin)"]] : [])], v => { rule.kind = v; rule.folder = ""; save(); render(); }),
      select(rule.folder || "new", targets, v => { rule.folder = v === "new" ? "" : v; save(); render(); }),
      name,
      make("button", { type: "button", class: "quiet remove", title: "Remove this rule", onclick: () => { rules.splice(i, 1); save(); render(); } }, "Remove"));
  };
  const add = () => {
    rules.push({ id: crypto.randomUUID(), on: true, match: "site", value: "", space: "", kind: "folder", folder: "", name: "" });
    save();
    render();
  };
  const prefSelect = (pref, options) => select(Services.prefs.getStringPref(pref, "").replace("off", ""), options, v => {
    if (v) Services.prefs.setStringPref(pref, v);
    else Services.prefs.clearUserPref(pref);
    render();
  });
  const closedList = Z.Auto.closedList;
  $("rules").replaceChildren(
    make("section", {},
      make("h2", {}, "Grouping"),
      make("p", {}, "Tabs that arrive at a matching page go into a folder (its tabs pinned) or a group (they stay unpinned): one you link the rule to, wherever it is, or one with the rule's name in the tab's space, made when needed." +
                    (mode === "off" ? " (Groups that don't pin are off in Zenith › Tabs.)" : "") + " Tabs already in a folder or group are left alone."),
      rules.map(ruleRow),
      make("div", { class: "row" },
        make("button", { type: "button", class: "primary", onclick: add }, "Add a rule"),
        rules.length ? make("button", { type: "button", onclick: () => say(`Grouped ${plural(Z.Rules.applyAll(), "tab")}`) }, "Apply to open tabs now") : null)),
    make("section", {},
      make("h2", {}, "On their own"),
      make("p", {}, "Off until you choose. The tab you're on, playing tabs and tabs sharing your camera or screen are never touched."),
      make("div", { class: "setting" },
        make("div", { class: "what" }, make("span", {}, "Put tabs to sleep"), make("small", {}, "Tabs you haven't been to for this long are unloaded; they come back when you open them.")),
        prefSelect("zenith.plus.tabs-auto-sleep", [["", "Never"], ["15", "After 15 minutes"], ["30", "After 30 minutes"], ["60", "After an hour"], ["120", "After 2 hours"], ["240", "After 4 hours"]])),
      make("div", { class: "setting" },
        make("div", { class: "what" }, make("span", {}, "Close loose tabs"), make("small", {}, "Not pinned, not essentials, not in a folder or group, and not used for this long. Listed below to bring back.")),
        prefSelect("zenith.plus.tabs-auto-close", [["", "Never"], ["1", "After a day"], ["3", "After 3 days"], ["7", "After a week"], ["14", "After 2 weeks"], ["30", "After a month"]]))),
    make("section", {},
      make("h2", {}, "Closed on their own"),
      closedList.length ? null : make("p", {}, "Nothing yet."),
      closedList.map(item => make("div", { class: "closed" },
        make("span", {}, item.title || item.url), make("small", {}, `${Math.max(0, Math.round((Date.now() - item.at) / DAY))}d ago`),
        make("button", { type: "button", onclick: () => { Z.Auto.reopen(item); render(); } }, "Reopen"))),
      closedList.length ? make("button", { type: "button", class: "quiet", onclick: () => { Services.prefs.clearUserPref("zenith.internal.tabs.auto-closed"); render(); } }, "Clear the list") : null));
}

/* --- Keeping up with the window ------------------------------------------------------------------ */

let timer = null;
function soon() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    // (Don't redraw the rules under someone typing in them.)
    if (state.view === "rules" && document.activeElement?.matches?.("#rules input[type=text]")) return;
    render();
  }, 120);
}

// Memory and CPU, every few seconds while the page is in view.
async function measure() {
  if (document.hidden) return;
  try {
    state.usage = await Look.usage();
    if (state.view === "overview") soon();
  } catch (e) {
    console.error("[Zenith Tab manager] usage", e);
  }
}
const measuring = setInterval(measure, 3000);

const EVENTS = ["TabOpen", "TabClose", "TabMove", "TabSelect", "TabAttrModified", "TabPinned", "TabUnpinned", "TabGrouped",
                "TabUngrouped", "TabGroupCreate", "TabGroupRemoved", "TabGroupCollapse", "TabGroupExpand"];
for (const e of EVENTS) gBrowser.tabContainer.addEventListener(e, soon);
win.addEventListener("ZenWorkspacesUIUpdate", soon);
const prefs = ["zenith.internal.tabs.rules", "zenith.plus.tabs-auto-sleep", "zenith.plus.tabs-auto-close", "zenith.internal.tabs.auto-closed",
               "browser.tabs.groups.enabled", "zenith.plus.unpinned-groups", "zenith.internal.unpinned-folders"];
for (const p of prefs) Services.prefs.addObserver(p, soon);
window.addEventListener("unload", () => {
  clearInterval(measuring);
  for (const e of EVENTS) gBrowser.tabContainer.removeEventListener(e, soon);
  win.removeEventListener("ZenWorkspacesUIUpdate", soon);
  for (const p of prefs) Services.prefs.removeObserver(p, soon);
});

$("views").addEventListener("click", e => {
  const view = e.target.closest("button")?.dataset.view;
  if (!view) return;
  state.view = view;
  render();
});
$("undo").addEventListener("click", () => {
  const label = Z.Act.undoLast();
  say(label ? `Put back: ${label}` : "Nothing to undo");
  soon();
});
$("close").addEventListener("click", () => Z.hide());
$("search").addEventListener("input", e => {
  state.query = e.target.value.trim();
  render();
});
document.addEventListener("keydown", e => {
  if (e.target.matches?.("input[type=text], input[type=search], select")) {
    if (e.key === "Escape" && e.target.id === "search" && e.target.value) {
      e.target.value = "";
      state.query = "";
      render();
      return;
    }
    if (e.key !== "Escape") return;
  }
  if (e.key === "Escape") {
    if (!$("menu").hidden) $("menu").hidden = true;
    else if (state.picked.size) state.picked.clear();
    else if (COMPACT) return Z.hide();
    render();
  } else if (e.key === "Delete" && state.picked.size) {
    closeTabs([...state.picked]);
  } else if ((e.ctrlKey || e.metaKey) && e.key === "z") {
    e.preventDefault();
    $("undo").click();
  } else if ((e.ctrlKey || e.metaKey) && e.key === "a" && state.view === "overview") {
    e.preventDefault();
    state.picked = new Set(order);
    render();
  } else if (e.key === "/" || ((e.ctrlKey || e.metaKey) && e.key === "f")) {
    e.preventDefault();
    $("search").focus();
  }
});

window.ZenithTabsPage = { state, render, measure }; // for tools/checks
render();
measure();
if (COMPACT) $("search").focus();
