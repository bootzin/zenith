// SPDX-License-Identifier: GPL-3.0-or-later
// about:zenith-tabs: every tab, what it costs, and tidying up.
// The page asks the window it's in (zenith-tabs.uc.mjs: window.ZenithTabs)
// to do everything; it only shows and picks. Nothing happens until you
// press something here, or set a rule on the Rules page.
//   All tabs   what's using memory and CPU (by site, by space, idle tabs,
//              busy tabs), then every tab in a table you can sort and pick
//   Spaces     each space as a column, as its sidebar has it
//   Tidy up    duplicates, tabs you haven't used for days, busy sites, and
//              (with Zenith's local AI) loose tabs sorted by topic
//   Rules      grouping rules, and sleeping or closing on their own
// Memory and CPU come from Firefox's processes: each site runs in its own,
// so a site's total is exact and a tab's figure is its share of its site's.

const win = window.browsingContext.topChromeWindow;
const Z = win.ZenithTabs;
const { gBrowser, Services } = win;
const W = () => win.gZenWorkspaces;
const G = () => win.ZenithGroups;
const PAGE = "about:zenith-tabs";
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const $ = id => document.getElementById(id);

function make(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  return fill(node, kids, true);
}

// Children, flattened, without the empty ones (null for "nothing here").
function fill(node, kids, append = false) {
  const list = [kids].flat(Infinity).filter(k => k != null && k !== false);
  if (append) node.append(...list);
  else node.replaceChildren(...list);
  return node;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const mb = bytes => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`);
const pct = cpu => (cpu >= 0.005 ? `${Math.round(cpu * 100)}%` : "–");
const sum = (list, fn) => list.reduce((n, x) => n + (fn(x) || 0), 0);

function ago(at) {
  if (!at) return "";
  const d = Date.now() - at;
  return d < 60e3 ? "now" : d < HOUR ? `${Math.round(d / 60e3)}m` : d < DAY ? `${Math.round(d / HOUR)}h` : `${Math.round(d / DAY)}d`;
}

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
const isThis = t => !!t.linkedBrowser?.currentURI?.spec?.startsWith(PAGE) && t.linkedBrowser === window.browsingContext.embedderElement;

function spaces() {
  return Look.spaces().length ? Look.spaces() : [{ uuid: "", name: "Tabs" }];
}

function tabs() {
  return Look.tabs();
}

function spaceColour(space) {
  const c = space?.theme?.gradientColors?.find(x => x?.isPrimary)?.c ?? space?.theme?.gradientColors?.[0]?.c;
  return Array.isArray(c) ? `rgb(${c.slice(0, 3).join(" ")})` : "";
}

const spaceOf = uuid => spaces().find(s => s.uuid === uuid);
const spaceLabel = s => `${s.icon && !/^[a-z]+:/i.test(s.icon) ? `${s.icon}  ` : ""}${s.name || "Space"}`;
const here = () => W()?.activeWorkspace ?? "";

function matches(tab) {
  const q = state.query.toLowerCase();
  return !q || (tab.label || "").toLowerCase().includes(q) || Look.site(tab).toLowerCase().includes(q);
}

// A folder whose tabs act unpinned (a "group" here).
const loose = g => g.hasAttribute("zenith-unpinned");
const realTabs = f => [...(f.tabs ?? [])].filter(t => !t.hasAttribute("zen-empty-tab"));
const mem = t => state.usage.get(t)?.memory ?? 0;
const cpu = t => state.usage.get(t)?.cpu ?? 0;
// CPU swings a lot from one moment to the next: each tab's last minute or
// so (a measure every 3 seconds) gives its average too.
const cpuHist = new WeakMap();
function recordCpu() {
  for (const [t, u] of state.usage) {
    const h = cpuHist.get(t) ?? [];
    h.push(u.cpu ?? 0);
    if (h.length > 20) h.shift();
    cpuHist.set(t, h);
  }
}
const avg = t => {
  const h = cpuHist.get(t);
  return h?.length ? h.reduce((a, b) => a + b, 0) / h.length : 0;
};
const playing = t => t.hasAttribute("soundplaying") || t.hasAttribute("sharing");
const idle = t => Look.awake(t) && !t.selected && !playing(t) && t.lastAccessed && Date.now() - t.lastAccessed > HOUR;

/* --- State ----------------------------------------------------------------------- */

const state = {
  view: "tabs",
  query: "",
  picked: new Set(),
  last: null, // the last tab clicked, for Shift
  open: new Set(), // folders shown open on the board
  tidy: new Map(), // tidy card → unticked tabs
  days: Services.prefs.getIntPref("zenith.internal.tabs.days", 7),
  usage: new Map(),
  sort: { key: "memory", dir: -1 },
  filter: "all",
  editing: false, // a name being typed in the bar: no redrawing under it
  dirty: false,
  done: [], // what Tidy up did lately: { text, entry, folder }
};

/* --- Drawing ------------------------------------------------------------------------- */

const rows = new WeakMap(); // row element → tab
let order = []; // tabs in the order shown, for Shift ranges

// Whatever scrolled stays where it was.
function keepScroll(fn) {
  const saved = [...document.querySelectorAll("[data-scroll]")].map(n => [n.dataset.scroll, n.scrollTop, n.scrollLeft]);
  fn();
  for (const [k, top, left] of saved) {
    const n = document.querySelector(`[data-scroll="${CSS.escape(k)}"]`);
    if (n) {
      n.scrollTop = top;
      n.scrollLeft = left;
    }
  }
}

function render() {
  // Not under a name being typed or an open list.
  if (state.editing || !$("menu").hidden) {
    state.dirty = true;
    return;
  }
  state.dirty = false;
  paint();
  for (const t of state.picked) if (!t.isConnected || t.closing) state.picked.delete(t);
  const all = tabs();
  keepScroll(() => {
    summary(all);
    for (const b of $("views").children) b.setAttribute("aria-selected", String(b.dataset.view === state.view));
    for (const v of document.querySelectorAll("main.view")) v.hidden = v.id !== state.view;
    $("undo").hidden = !Z.Act.history.length;
    $("undo").title = Z.Act.history.at(-1)?.label ? `Undo: ${Z.Act.history.at(-1).label}` : "Undo";
    order = [];
    if (state.view === "tabs") renderTabs(all);
    else if (state.view === "spaces") renderBoard(all);
    else if (state.view === "tidy") renderTidy();
    else renderRules();
    renderBar();
  });
}

function summary(all) {
  const awake = all.filter(t => Look.awake(t));
  const memory = sum(awake, mem);
  $("summary").textContent = [plural(spaces().length, "space"), plural(all.length, "tab"), `${awake.length} awake`,
                              memory ? `${mb(memory)} in tabs` : ""].filter(Boolean).join(" · ");
}

/* --- All tabs: what's costing what, then the table ------------------------------------- */

function renderTabs(all) {
  renderInsights(all);
  const filters = [
    ["all", "All", all],
    ["awake", "Awake", all.filter(t => Look.awake(t))],
    ["asleep", "Asleep", all.filter(t => !Look.awake(t))],
    ["here", "This space", all.filter(t => Look.space(t) === here() || t.hasAttribute("zen-essential"))],
    ["idle", "Idle an hour+", all.filter(idle)],
    ["playing", "Playing", all.filter(playing)],
    ["picked", "Picked", all.filter(t => state.picked.has(t))],
  ];
  const chosen = filters.find(f => f[0] === state.filter) ?? filters[0];
  $("filters").replaceChildren(...filters.filter(([k, , list]) => list.length || k === state.filter || k === "all").map(([k, label, list]) =>
    make("button", { type: "button", class: "chip", "aria-pressed": String(k === chosen[0]), onclick: () => { state.filter = state.filter === k ? "all" : k; render(); } },
         `${label} `, make("span", { class: "n" }, String(list.length)))));
  const shown = chosen[2].filter(matches);
  const by = { title: t => (t.label || "").toLowerCase(), space: t => spaceName(t).toLowerCase(), memory: mem, cpu, avg,
               used: t => (t.selected ? Date.now() : t.lastAccessed || 0), state: t => stateOf(t)[1], picked: t => (state.picked.has(t) ? 1 : 0) };
  // (No column chosen: the sidebar's order.)
  const key = by[state.sort.key];
  if (key) shown.sort((a, b) => {
    const x = key(a), y = key(b);
    return (x < y ? -1 : x > y ? 1 : 0) * state.sort.dir || (a.label || "").localeCompare(b.label || "");
  });
  const top = Math.max(1, ...shown.map(mem));
  // A column's heading: sorted one way, the other way, then not at all.
  const cycle = (k, first) => {
    const s = state.sort;
    state.sort = s.key !== k ? { key: k, dir: first } : s.dir === first ? { key: k, dir: -first } : { key: null, dir: 0 };
    render();
  };
  const sortedAs = k => (state.sort.key === k ? (state.sort.dir > 0 ? "ascending" : "descending") : null);
  const head = (k, label, cls = "") => make("button", { type: "button", class: `th ${cls}`, "aria-sort": sortedAs(k),
    title: "Sort (again: the other way; a third time: as in the sidebar)",
    onclick: () => cycle(k, k === "title" || k === "space" ? 1 : -1) }, label);
  const allBox = make("input", { type: "checkbox", class: "pick", title: "Pick all shown" });
  allBox.checked = shown.length > 0 && shown.every(t => state.picked.has(t));
  allBox.addEventListener("click", e => {
    e.stopPropagation();
    for (const t of shown) (allBox.checked ? state.picked.add(t) : state.picked.delete(t));
    render();
  });
  fill($("table"), [
    make("div", { class: "tr thead" },
         make("span", { class: "td pickcell", title: "Click beside the box: picked tabs first", "aria-sort": sortedAs("picked"),
                        onclick: e => { if (e.target === allBox) return; cycle("picked", -1); } }, allBox),
         head("title", "Tab", "wide"), head("space", "Space"),
         make("span", { class: "th plain" }, "Where"), head("state", "State"), head("memory", "Memory", "num"), head("cpu", "CPU now", "num"),
         head("avg", "CPU avg", "num"), head("used", "Used", "num"), make("span", { class: "th plain" })),
    shown.length ? shown.map(t => tableRow(t, top)) : make("div", { class: "empty" }, state.query ? "Nothing matches" : "No tabs here")]);
}

function spaceName(t) {
  if (t.hasAttribute("zen-essential")) {
    const s = Look.essentialSpaces?.(t) ?? [];
    return s.length ? `Essential · ${s.map(x => x.name).join(", ")}` : "Essential";
  }
  return spaceOf(Look.space(t) || "")?.name ?? "";
}

// [label, sort rank]
function stateOf(t) {
  if (isThis(t)) return ["This page", 5];
  if (t.selected) return ["Open now", 4];
  if (t.hasAttribute("sharing")) return ["Sharing", 3];
  if (t.hasAttribute("soundplaying")) return ["Playing", 3];
  return Look.awake(t) ? ["Awake", 2] : ["Asleep", 1];
}

function whereOf(t) {
  if (t.hasAttribute("zen-essential")) return make("span", { class: "where" }, icon("essential", "Essential"), "Essential");
  const g = Look.ownGroup(t);
  if (g) return make("span", { class: "where", title: loose(g) ? "A folder whose tabs act unpinned" : "A folder (its tabs pinned)" },
                     make("span", { class: `mark ${loose(g) ? "group" : "folder"}` }), g.label || "Folder");
  if (Look.splitOf(t)) return make("span", { class: "where" }, icon("split", "In a split view"), "Split view");
  return t.pinned ? make("span", { class: "where" }, icon("pin", "Pinned"), "Pinned") : make("span", { class: "where dim" }, "Loose");
}

function favicon(tab) {
  const ico = make("span", { class: "icon" });
  const image = tab.getAttribute("image");
  if (image) {
    const img = make("img", { src: image, alt: "" });
    img.addEventListener("error", () => img.remove(), { once: true });
    ico.append(img);
  }
  return ico;
}

const act = (title, glyph, fn) => make("button", { type: "button", title, onclick: e => (e.stopPropagation(), fn()) }, icon(glyph));

function rowActions(tab) {
  const asleep = !Look.awake(tab);
  return make("span", { class: "acts" },
    isThis(tab) ? null : act("Go to it", "arrow-right", () => Z.Act.go(tab)),
    isThis(tab) ? null : asleep ? act("Wake it", "reload", () => doing(() => Z.Act.wake([tab], true))) : act("Put to sleep", "moon-stars", () => doing(() => Z.Act.sleep([tab], true))),
    act("Close (Undo comes up)", "close", () => closeTabs([tab])));
}

function tableRow(tab, top) {
  const box = make("input", { type: "checkbox", class: "pick", title: "Pick" });
  box.checked = state.picked.has(tab);
  const [label] = stateOf(tab);
  const use = state.usage.get(tab);
  const space = spaceOf(Look.space(tab) || "");
  const dot = make("span", { class: "dot" });
  if (space) dot.style.setProperty("--space", spaceColour(space));
  const bar = make("span", { class: "meter" });
  bar.style.setProperty("--share", String(Math.min(1, mem(tab) / top)));
  const row = make("div", { class: "tr tab", draggable: "true", picked: state.picked.has(tab), current: tab.selected, asleep: !Look.awake(tab), "data-k": String(idOf(tab)) },
    make("span", { class: "td pickcell" }, box),
    make("span", { class: "td wide" }, favicon(tab), make("span", { class: "text" }, make("span", { class: "title" }, tab.label || Look.site(tab)),
                                                     make("span", { class: "host" }, Look.site(tab)))),
    make("span", { class: "td space-cell" }, tab.hasAttribute("zen-essential") ? null : dot, make("span", { class: "clip" }, spaceName(tab))),
    make("span", { class: "td" }, whereOf(tab)),
    make("span", { class: `td state ${label.toLowerCase().replace(/\s+/g, "-")}` }, label),
    make("span", { class: "td num mem", title: use?.shared ? "Its share of its site's memory (tabs of one site share a process)" : "Memory" },
         make("span", { class: "v" }, use ? mb(use.memory) : "–"), bar),
    make("span", { class: "td num cpu" }, use ? pct(use.cpu ?? 0) : "–"),
    make("span", { class: "td num avg", title: "Its average over the last minute or so" }, use ? pct(avg(tab)) : "–"),
    make("span", { class: "td num used", title: tab.lastAccessed ? new Date(tab.lastAccessed).toLocaleString() : "" }, tab.selected ? "now" : ago(tab.lastAccessed)),
    make("span", { class: "td" }, rowActions(tab)));
  rows.set(row, tab);
  order.push(tab);
  row.title = `${tab.label}\n${tab.linkedBrowser?.currentURI?.spec ?? ""}`;
  return row;
}

const ids = new WeakMap();
let nextId = 1;
function idOf(t) {
  if (!ids.has(t)) ids.set(t, nextId++);
  return ids.get(t);
}

// Where the memory and CPU go, with a button for the obvious fix.
function renderInsights(all) {
  const awake = all.filter(t => Look.awake(t));
  const asleep = all.length - awake.length;
  const total = sum(awake, mem), cpuNow = sum(awake, cpu), cpuAvg = sum(awake, avg);
  const measured = state.usage.size > 0;
  const card = (title, ...body) => make("div", { class: "insight" }, make("h3", {}, title), body);
  const line = (main, value, ...buttons) => make("div", { class: "line" }, make("span", { class: "what" }, main), make("span", { class: "value" }, value), buttons);
  const btn = (label, fn, title) => make("button", { type: "button", title, onclick: () => doing(fn) }, label);

  const others = awake.filter(t => !t.hasAttribute("zen-essential") && Look.space(t) !== here() && !playing(t));
  const cpuLine = x => (x >= 0.005 ? `${pct(x)} of one core` : "next to nothing");
  const zen = state.usage.all;
  const memCard = card("Memory and CPU",
    make("div", { class: "big" }, measured ? mb(total) : "…"),
    make("div", { class: "sub" }, `in ${plural(awake.length, "awake tab")} · ${asleep} asleep (asleep tabs use next to nothing)`),
    zen ? make("div", { class: "sub", title: "Every process of Zen's: its window, graphics, network and tabs, as the system counts them (on Windows, what Task Manager shows)" },
               `Zen in all: ${mb(zen)} (with its window, graphics and network)`) : null,
    make("div", { class: "sub" }, !measured ? "Measuring…" : `CPU now: ${cpuLine(cpuNow)} · last minute: ${cpuLine(cpuAvg)}`),
    others.length ? make("div", { class: "buttons" }, btn(`Sleep other spaces (${mb(sum(others, mem))})`, () => Z.Act.sleep(others, true))) : null);

  const sites = new Map();
  for (const t of awake) {
    const s = Look.site(t) || "other";
    const e = sites.get(s) ?? { site: s, tabs: [], mem: 0, cpu: 0 };
    e.tabs.push(t);
    e.mem += mem(t);
    e.cpu += cpu(t);
    sites.set(s, e);
  }
  const heavy = [...sites.values()].sort((a, b) => b.mem - a.mem).slice(0, 4);
  const sitesCard = card("Heaviest sites",
    heavy.length ? heavy.map(e => line(make("span", {}, e.site, make("small", {}, ` · ${plural(e.tabs.length, "tab")}`)),
                                       `${mb(e.mem)}${e.cpu >= 0.01 ? ` · ${pct(e.cpu)}` : ""}`,
                                       e.tabs.some(t => !t.selected && !playing(t)) ? btn("Sleep", () => Z.Act.sleep(e.tabs.filter(t => !playing(t)), true), `Put ${e.site}'s tabs to sleep`) : null))
                 : make("div", { class: "sub" }, "Nothing awake."));

  const essentials = awake.filter(t => t.hasAttribute("zen-essential"));
  const essentialRow = essentials.length ? line(make("span", {}, "Essentials", make("small", {}, ` · ${essentials.length} awake`)), mb(sum(essentials, mem))) : null;
  const spaceRows = spaces().filter(s => s.uuid).map(s => {
    const list = all.filter(t => !t.hasAttribute("zen-essential") && Look.space(t) === s.uuid);
    const up = list.filter(t => Look.awake(t));
    const dot = make("span", { class: "dot" });
    dot.style.setProperty("--space", spaceColour(s));
    return line(make("span", {}, dot, spaceLabel(s), make("small", {}, ` · ${up.length}/${list.length} awake`)), mb(sum(up, mem)),
                up.some(t => !t.selected) ? btn("Sleep", () => Z.Act.sleep(up, true), "Put this space's tabs to sleep") : null,
                up.length < list.length ? btn("Wake", () => Z.Act.wake(list, true), "Wake this space's tabs") : null);
  });
  const spacesCard = card("Spaces", spaceRows.length ? [essentialRow, spaceRows] : [essentialRow, make("div", { class: "sub" }, "One space.")]);

  const lazy = all.filter(idle).sort((a, b) => mem(b) - mem(a));
  const idleCard = card("Idle but awake",
    make("div", { class: "sub" }, lazy.length ? `${plural(lazy.length, "tab")} not opened for an hour or more, holding ${mb(sum(lazy, mem))}.` : "Every awake tab was used in the last hour."),
    lazy.length ? make("div", { class: "buttons" }, btn("Sleep them", () => Z.Act.sleep(lazy, true)),
                       make("button", { type: "button", onclick: () => { state.filter = "idle"; render(); } }, "Show them")) : null);

  // (By their average: a moment's spike isn't working hard.)
  const busy = awake.filter(t => Math.max(avg(t), cpu(t) / 3) >= 0.03).sort((a, b) => avg(b) - avg(a)).slice(0, 3);
  const busyCard = card("Working hard",
    busy.length ? busy.map(t => line(make("span", { class: "clip" }, t.label || Look.site(t)), `${pct(avg(t))} avg · ${pct(cpu(t))} now`,
                                     isThis(t) ? null : make("button", { type: "button", onclick: () => Z.Act.go(t) }, "Go"),
                                     !t.selected && !playing(t) ? btn("Sleep", () => Z.Act.sleep([t], true)) : null))
                : make("div", { class: "sub" }, measured ? "Nothing is using much CPU." : "Measuring…"));

  const dupes = Look.report(state.days).duplicates;
  const extra = dupes.length ? card("Duplicates", make("div", { class: "sub" }, `${plural(dupes.length, "tab")} open more than once.`),
    make("div", { class: "buttons" }, make("button", { type: "button", onclick: () => { state.view = "tidy"; render(); } }, "Review"))) : null;
  fill($("insights"), [memCard, sitesCard, spacesCard, idleCard, busyCard, extra]);
}

// Memory and CPU without redrawing: the numbers and bars change in place.
function updateUsage() {
  if (state.view !== "tabs") return;
  const shownTabs = [...document.querySelectorAll("#table .tr.tab")].map(r => rows.get(r)).filter(Boolean);
  const top = Math.max(1, ...shownTabs.map(mem));
  for (const row of document.querySelectorAll("#table .tr.tab")) {
    const t = rows.get(row);
    const use = t && state.usage.get(t);
    if (!t) continue;
    row.querySelector(".mem .v").textContent = use ? mb(use.memory) : "–";
    row.querySelector(".meter").style.setProperty("--share", String(Math.min(1, mem(t) / top)));
    row.querySelector(".cpu").textContent = use ? pct(use.cpu ?? 0) : "–";
    row.querySelector(".avg").textContent = use ? pct(avg(t)) : "–";
  }
  if (!state.editing && $("menu").hidden) keepScroll(() => renderInsights(tabs()));
  summary(tabs());
}

/* --- Spaces: each space as its sidebar has it ------------------------------------------- */

function tabRow(tab) {
  const box = make("input", { type: "checkbox", class: "pick", title: "Pick" });
  box.checked = state.picked.has(tab);
  const use = state.usage.get(tab);
  const asleep = !Look.awake(tab);
  const row = make("div", { class: "tab", draggable: "true", picked: state.picked.has(tab), current: tab.selected, asleep },
    box, favicon(tab),
    make("span", { class: "text" }, make("span", { class: "title" }, tab.label || Look.site(tab)), make("span", { class: "host" }, Look.site(tab))),
    Look.splitOf(tab) ? icon("split", "In a split view") : null,
    tab.hasAttribute("soundplaying") ? make("span", { class: "badge", title: "Playing" }, "♪") : null,
    asleep ? icon("moon-stars", "Asleep") : null,
    use ? make("span", { class: "use", title: use.shared ? "Its share of its site's memory" : "Memory" },
               [mb(use.memory), use.cpu >= 0.01 ? ` · ${pct(use.cpu)}` : ""].join("")) : null,
    rowActions(tab));
  rows.set(row, tab);
  order.push(tab);
  row.title = `${tab.label}\n${tab.linkedBrowser?.currentURI?.spec ?? ""}`;
  return row;
}

function folderBlock(group, items, nested = []) {
  const open = state.open.has(group.id) || !!state.query;
  const kind = loose(group) ? "group" : "folder";
  const all = realTabs(group);
  const box = make("input", { type: "checkbox", class: "pick", title: "Pick all its tabs" });
  box.checked = all.length > 0 && all.every(t => state.picked.has(t));
  box.addEventListener("click", e => {
    e.stopPropagation();
    for (const t of all) (box.checked ? state.picked.add(t) : state.picked.delete(t));
    render();
  });
  const head = make("div", { class: "head", draggable: "true", title: kind === "folder" ? "A folder: its tabs are pinned" : "A folder whose tabs act unpinned" },
    box, make("span", { class: "chev" }), make("span", { class: `mark ${kind}` }), make("span", { class: "name" }, group.label || "Folder"),
    kind === "folder" ? icon("pin", "Pinned") : make("span", { class: "kind" }, "unpinned"),
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

// A space's tabs as its sidebar has them: its essentials, folders (folders
// in folders) and pinned tabs, then folders that don't pin and loose tabs.
function spaceParts(space, all, folders) {
  const mine = all.filter(t => !t.hasAttribute("zen-essential") && (Look.space(t) || "") === space.uuid);
  const shown = mine.filter(matches);
  const ess = all.filter(t => t.hasAttribute("zen-essential") && matches(t) &&
                              (!Look.essentialSpaces?.(t)?.length || Look.essentialSpaces(t).some(s => s.uuid === space.uuid)));
  const inSpace = folders.filter(f => (f.getAttribute("zen-workspace-id") || "") === space.uuid);
  const block = f => {
    const children = inSpace.filter(c => c.group === f).map(block).filter(Boolean);
    const items = shown.filter(t => Look.ownGroup(t) === f);
    if (!items.length && !children.length && state.query) return null;
    return folderBlock(f, items, children);
  };
  const top = inSpace.filter(f => !f.group || !inSpace.includes(f.group));
  const looseTabs = pinned => shown.filter(t => !!t.pinned === pinned && !Look.ownGroup(t));
  const pinnedPart = [...top.filter(f => !loose(f)).map(block), ...looseTabs(true).map(tabRow)].filter(Boolean);
  const tabsPart = [...top.filter(f => loose(f)).map(block), ...looseTabs(false).map(tabRow)].filter(Boolean);
  return { mine, ess, pinnedPart, tabsPart };
}

function renderBoard(all) {
  const folders = Z.Act.folders();
  const columns = spaces().map(space => {
    const { mine, ess, pinnedPart, tabsPart } = spaceParts(space, all, folders);
    const up = mine.filter(t => Look.awake(t));
    const memory = sum(up, mem);
    const button = (label, fn, title) => make("button", { type: "button", class: "quiet small", title, onclick: e => { e.stopPropagation(); doing(fn); } }, label);
    const head = make("header", {},
      make("span", { class: "name", title: "Go to this space", onclick: () => space.uuid && W()?.changeWorkspaceWithID(space.uuid) }, spaceLabel(space)),
      space.uuid && space.uuid === here() ? make("span", { class: "here" }, "here") : null,
      make("span", { class: "count" }, [`${mine.length} · ${up.length} awake`, memory ? mb(memory) : ""].filter(Boolean).join(" · ")),
      up.some(t => !t.selected) ? button("Sleep", () => Z.Act.sleep(up, true), "Put this space's tabs to sleep") : null,
      up.length < mine.length ? button("Wake", () => Z.Act.wake(mine, true), "Wake this space's tabs") : null);
    head.style.setProperty("--space", spaceColour(space));
    const list = make("div", { class: "list", "data-scroll": `space-${space.uuid}` },
      ess.length ? [make("div", { class: "part" }, "Essentials"), ess.map(tabRow)] : null,
      pinnedPart.length ? [make("div", { class: "part" }, "Pinned"), pinnedPart] : null,
      tabsPart.length ? [make("div", { class: "part" }, "Tabs"), tabsPart] : null,
      !pinnedPart.length && !tabsPart.length && !ess.length ? make("div", { class: "empty" }, state.query ? "Nothing matches" : "No tabs") : null);
    const column = make("section", { class: "space" }, head, list);
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
  if (tab && !isThis(tab)) Z.Act.go(tab);
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
    const moving = dragging;
    dragging = null;
    if (moving) doing(() => fn(moving), true);
  });
}

/* --- Acting --------------------------------------------------------------------------------- */

// Anything that changes tabs: done, then a note (with Undo when it can be
// undone, and an offer to delete any folder it left empty), then a redraw.
function doing(fn, undoable = true) {
  const before = Z.Act.folders().filter(f => realTabs(f).length);
  Z.Act.note = "";
  const done = fn();
  const note = Z.Act.note;
  setTimeout(() => {
    const emptied = before.filter(f => f.isConnected && !realTabs(f).length);
    const last = undoable && done ? Z.Act.history.at(-1) : null;
    const buttons = [];
    if (last) buttons.push({ label: "Undo", run: () => undoSay(Z.Act.history.includes(last) ? Z.Act.undoTo(Z.Act.history.indexOf(last)) : []) });
    for (const f of emptied) buttons.push({ label: `Delete “${f.label || "Folder"}”`, run: () => { f.delete?.(); say("Folder deleted"); } });
    const text = [last?.label ?? (typeof done === "number" && done ? plural(done, "tab") : ""), emptied.length ? `${plural(emptied.length, "folder")} left empty` : "", note]
      .filter(Boolean).join(" · ");
    if (text || buttons.length) say(text || "Done", buttons);
    soon();
  }, 120);
  return done;
}

function closeTabs(list) {
  doing(() => {
    const n = Z.Act.closePicked(list);
    for (const t of list) state.picked.delete(t);
    return n;
  });
}

function renderBar() {
  const bar = $("bar");
  const picked = [...state.picked];
  bar.hidden = !picked.length || state.view === "rules" || state.editing;
  if (bar.hidden) return;
  const asleep = picked.filter(t => !Look.awake(t)).length;
  const grouped = picked.filter(t => Look.ownGroup(t)).length;
  bar.replaceChildren(...[
    make("span", { class: "count" }, `${picked.length} picked`),
    make("button", { type: "button", onclick: e => menu(e.currentTarget, spaceItems(picked)) }, "Move to…"),
    make("button", { type: "button", onclick: e => menu(e.currentTarget, folderItems(picked)) }, "Into…"),
    grouped ? make("button", { type: "button", title: "Out of their folder, as ordinary tabs", onclick: () => doing(() => Z.Act.takeOut(picked)) }, "Take out") : null,
    picked.length > asleep ? make("button", { type: "button", onclick: () => doing(() => Z.Act.sleep(picked, true)) }, "Sleep") : null,
    asleep ? make("button", { type: "button", onclick: () => doing(() => Z.Act.wake(picked, true)) }, "Wake") : null,
    make("button", { type: "button", onclick: () => closeTabs(picked) }, "Close"),
    make("button", { type: "button", class: "quiet", title: "Pick nothing (Esc)", onclick: () => (state.picked.clear(), render()) }, "✕"),
  ].filter(Boolean));
}

// The spaces to move to: not the one they're all in already (worked out
// each time the list opens, so it follows the tabs).
function spaceItems(picked) {
  const from = new Set(picked.filter(t => !t.hasAttribute("zen-essential")).map(t => Look.space(t) || ""));
  const only = from.size === 1 ? [...from][0] : null;
  const list = spaces().filter(s => s.uuid && s.uuid !== only);
  if (!list.length) return [{ label: "No other space", run: () => 0 }];
  return list.map(s => ({ label: spaceLabel(s), note: s.uuid === here() ? "here" : "", run: () => Z.Act.move(picked, s.uuid) }));
}

function folderItems(picked) {
  const items = [{ label: "New folder…", note: "pins its tabs", run: () => ask("Folder name", name => Z.Act.into(picked, { name, kind: "folder" })) }];
  if ((G()?.mode ?? "off") !== "off") {
    items.push({ label: "New unpinned folder…", note: "tabs stay unpinned", run: () => ask("Folder name", name => Z.Act.into(picked, { name, kind: "group" })) });
  }
  const folders = Z.Act.folders();
  if (folders.length) items.push({ sep: true });
  for (const f of folders) {
    items.push({ label: `${loose(f) ? "▢" : "📁"}  ${f.label || "Folder"}`, note: Look.spaceName(f.getAttribute("zen-workspace-id") || ""),
                 run: () => Z.Act.into(picked, { folder: f }) });
  }
  return items;
}

// A small list under a button. (Items that ask for a name keep the bar.)
function menu(anchor, items, plain = false) {
  const box = $("menu");
  box.replaceChildren(...items.map(i => i.sep ? make("div", { class: "sep" })
    : make("button", { type: "button", class: "item", onclick: () => {
        box.hidden = true;
        if (plain || i.label.endsWith("…")) i.run();
        else doing(i.run);
        if (state.dirty && !state.editing) render();
      } },
      make("span", {}, i.label), i.note ? make("small", {}, i.note) : null)));
  box.hidden = false;
  const r = anchor.getBoundingClientRect(), h = box.getBoundingClientRect().height;
  box.style.left = `${Math.max(8, Math.min(r.left, innerWidth - box.offsetWidth - 8))}px`;
  box.style.top = `${r.top - h - 6 > 8 ? r.top - h - 6 : r.bottom + 6}px`;
}

document.addEventListener("mousedown", e => {
  if (!e.target.closest("#menu") && !e.target.closest("#bar button") && !$("menu").hidden) {
    $("menu").hidden = true;
    if (state.dirty) render();
  }
});

// A name asked for in the bar itself; nothing redraws until it's done.
function ask(placeholder, fn) {
  const bar = $("bar");
  const input = make("input", { type: "text", placeholder });
  state.editing = true;
  const finish = () => {
    state.editing = false;
    render();
  };
  const go = () => {
    const name = input.value.trim();
    if (!name) return input.focus();
    state.editing = false;
    doing(() => {
      const n = fn(name);
      if (n) state.picked.clear();
      return n;
    });
    render();
  };
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") go();
    else if (e.key === "Escape") {
      e.stopPropagation();
      finish();
    }
  });
  bar.hidden = false;
  bar.replaceChildren(make("span", { class: "count" }, `${state.picked.size} picked`), input,
                      make("button", { type: "button", class: "primary", onclick: go }, "Make it"),
                      make("button", { type: "button", class: "quiet", onclick: finish }, "Cancel"));
  input.focus();
  return 0;
}

// A note in the corner, with buttons ({ label, run }).
function say(text, buttons = []) {
  const note = $("note");
  note.replaceChildren(make("span", {}, text), ...buttons.map(b => make("button", { type: "button", onclick: () => { note.hidden = true; b.run(); soon(); } }, b.label)));
  note.hidden = false;
  clearTimeout(say.timer);
  say.timer = setTimeout(() => (note.hidden = true), buttons.length ? 9000 : 3000);
}

/* --- Tidying up -------------------------------------------------------------------------- */

// Each suggestion lists its tabs, ticked; untick what to keep, then press
// a button.
function tidyCard(key, title, why, list, actions, extra = null, where = null) {
  const unticked = state.tidy.get(key) ?? new Set();
  state.tidy.set(key, unticked);
  const chosen = () => list.filter(t => !unticked.has(t));
  const head = make("div", { class: "card-head" }, make("h3", {}, title), make("span", { class: "n" }, String(list.length)), extra);
  const rowsBox = list.length ? make("div", { class: "ticks" }, list.slice(0, 60).map(t => {
    const box = make("input", { type: "checkbox" });
    box.checked = !unticked.has(t);
    box.addEventListener("change", () => {
      if (box.checked) unticked.delete(t);
      else unticked.add(t);
      render();
    });
    const use = state.usage.get(t);
    return make("label", { class: "tick" }, box, make("span", { class: "title" }, t.label || Look.site(t)),
      make("small", {}, [Look.site(t), Look.space(t) !== here() ? Look.spaceName(Look.space(t)) : "",
                         key === "stale" ? ago(t.lastAccessed) : "", use ? mb(use.memory) : ""].filter(Boolean).join(" · ")));
  })) : null;
  const n = chosen().length;
  return make("div", { class: "card", empty: !list.length },
    head, make("p", {}, why), rowsBox, list.length ? where : null,
    list.length ? make("div", { class: "row" }, actions.map(([label, fn, primary, undoable = true]) =>
      make("button", { type: "button", class: primary ? "primary" : null, disabled: !n, onclick: () => doing(() => fn(chosen()), undoable) },
           `${label}${n !== list.length ? ` (${n})` : ""}`))) : null);
}

// Where a tidy card's tabs go, shown before anything moves: a new folder
// (its name yours to change) or, when this space already has a folder of
// that name, that folder (they join it).
const nameFor = (key, fallback) => state.names?.get(key) ?? fallback;
const folderNamed = (name, space) => Z.Act.folders().find(f => (f.label || "") === name && (f.getAttribute("zen-workspace-id") || "") === (space || ""));

function destination(key, fallback, space) {
  const name = nameFor(key, fallback), existing = folderNamed(name, space);
  const input = make("input", { type: "text", value: name, spellcheck: "false", title: "The folder's name" });
  // (Nothing redraws while you type; the card follows when you're done.)
  input.addEventListener("focus", () => (state.editing = true));
  input.addEventListener("input", () => (state.names ??= new Map()).set(key, input.value.trim() || fallback));
  input.addEventListener("blur", () => {
    state.editing = false;
    render();
  });
  input.addEventListener("keydown", e => e.key === "Enter" && input.blur());
  const where = Look.spaceName(space) ? ` in ${Look.spaceName(space)}` : "";
  return make("div", { class: "where" }, make("span", { class: "to" }, "Goes into"), input,
    make("small", {}, existing ? `your folder${where} (${plural(realTabs(existing).length, "tab")}): they join it` : `a new folder${where}`));
}

function intoActions(key, fallback, space, groupsOn) {
  const run = kind => list => {
    const name = nameFor(key, fallback), existing = folderNamed(name, space);
    const n = existing ? Z.Act.into(list, { folder: existing }) : Z.Act.into(list, { name, kind, space });
    if (n) {
      const where = Look.spaceName(space) ? ` in ${Look.spaceName(space)}` : "";
      state.done.unshift({ text: `${plural(n, "tab")} into “${name}”${where}`, entry: Z.Act.history.at(-1), name, space, at: Date.now() });
      state.done.length = Math.min(state.done.length, 5);
    }
    return n;
  };
  const existing = folderNamed(nameFor(key, fallback), space);
  if (existing) return [[`Into “${existing.label || "Folder"}”`, run("folder"), true]];
  return [["Into a folder", run("folder"), true], ...(groupsOn ? [["Into an unpinned folder", run("group")]] : [])];
}

// What Tidy up just did, to check it and take it back.
function justDone() {
  state.done = state.done.filter(d => Z.Act.history.includes(d.entry));
  const done = state.done.filter(d => Date.now() - d.at < HOUR);
  if (!done.length) return null;
  return make("div", { class: "card done" },
    make("div", { class: "card-head" }, make("h3", {}, "Just done")),
    done.map(d => {
      const folder = folderNamed(d.name, d.space);
      const undoable = Z.Act.history.includes(d.entry);
      return make("div", { class: "line" }, make("span", { class: "what" }, d.text, make("small", {}, ` · ${ago(d.at)}`)),
        folder ? make("button", { type: "button", title: "Show it in the Spaces view", onclick: () => show(folder) }, "Show") : null,
        undoable ? make("button", { type: "button", onclick: () => { undoSay(Z.Act.undoTo(Z.Act.history.indexOf(d.entry))); state.done = state.done.filter(x => x !== d); } }, "Undo") : null);
    }));
}

// A folder, open and in view in the Spaces view.
function show(folder) {
  state.view = "spaces";
  state.open.add(folder.id);
  render();
  requestAnimationFrame(() => {
    const head = [...document.querySelectorAll("#board .folder .head .name")].find(n => n.textContent === (folder.label || "Folder"))?.closest(".folder");
    head?.scrollIntoView({ block: "center", behavior: "smooth" });
    head?.setAttribute("flash", "");
    setTimeout(() => head?.removeAttribute("flash"), 1600);
  });
}

function renderTidy() {
  const r = Look.report(state.days);
  const mine = t => !isThis(t);
  const dupes = r.duplicates.filter(mine), stale = r.stale.filter(mine);
  // Awake tabs, heaviest first.
  const awake = r.awake.filter(mine).sort((a, b) => mem(b) - mem(a));
  const chips = make("div", { class: "chips" }, [3, 7, 14, 30].map(d => make("button", {
    type: "button", "aria-pressed": String(d === state.days),
    onclick: e => { e.stopPropagation(); state.days = d; Services.prefs.setIntPref("zenith.internal.tabs.days", d); render(); },
  }, `${d}d`)));
  const groupsOn = (G()?.mode ?? "off") !== "off";
  const busy = r.busy.map(b => {
    const key = `busy-${b.space}-${b.site}`;
    return tidyCard(key, b.site, `${b.tabs.length} loose tabs${Look.spaceName(b.space) ? ` in ${Look.spaceName(b.space)}` : ""}: keep them together.`,
      b.tabs, intoActions(key, b.site, b.space, groupsOn), null, destination(key, b.site, b.space));
  });
  $("tidy").replaceChildren(
    make("div", { class: "column" },
      justDone(),
      tidyCard("dupes", "Duplicates", "The same page open more than once; the one you used last isn't listed.", dupes,
               [["Close", list => Z.Act.closePicked(list), true]]),
      tidyCard("stale", `Not used in ${state.days} days`, "Loose tabs you haven't been to for a while.", stale,
               [["Sleep", list => Z.Act.sleep(list, true)], ["Close", list => Z.Act.closePicked(list), true]], chips),
      tidyCard("awake", "Awake", "Loaded and using memory, heaviest first (not the tab you're on, nor playing tabs).", awake,
               [["Sleep", list => Z.Act.sleep(list, true), true]])),
    make("div", { class: "column" }, busy.length ? [make("h2", {}, "Busy sites"), busy] : make("h2", {}, "No busy sites"), topicCards()));
}

// By topic (with Zenith's local AI on): loose tabs, in this space or each
// space, sorted into groups by what they're about and named for it (the
// words their titles share, else the AI's own name for the topic). The
// groups show first, each a ticked list; nothing moves until you press a
// button, and each goes into a folder in its own space.
const STOP = new Set(("the a an and or of to in on for with from by at as is are be this that it its your you our how what why when " +
  "new home page site official online free best top vs com www http https login sign log welcome de da do das dos e o os a as em no na " +
  "um uma para por com que el la los las y en del al un una").split(" "));

function topicName(label, tabs) {
  const counts = new Map();
  for (const t of tabs) {
    const site = Look.site(t).toLowerCase().split(".");
    const words = new Set((t.label || "").toLowerCase().split(/[^\p{L}\p{N}]+/u)
      .filter(w => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w) && !site.includes(w)));
    for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const shared = [...counts].filter(([, n]) => n >= Math.max(2, Math.ceil(tabs.length / 2))).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w]) => w);
  const title = w => w.charAt(0).toUpperCase() + w.slice(1);
  if (shared.length) return shared.map(title).join(" ");
  if (label) return label;
  const sites = new Set(tabs.map(t => Look.site(t)));
  return sites.size === 1 ? [...sites][0] : "Together";
}

function topicCards() {
  const AI = win.ZenithAI;
  if (!AI?.on) return [make("h2", {}, "By topic"), make("div", { class: "card" }, make("p", {}, "Sorting loose tabs by topic needs Zenith's local AI (Zenith › Speed and AI › Local AI)."))];
  if (!Services.prefs.getBoolPref("zenith.plus.ai-topics", true)) return [make("h2", {}, "By topic"), make("div", { class: "card" }, make("p", {}, "Sorting by topic is off (Zenith › Speed and AI › Local AI › Tabs by topic)."))];
  const all = state.topicScope === "all";
  const looseIn = space => Look.tabs().filter(t => Look.space(t) === space && !Look.kept(t) && !t.group && !t.hasAttribute("zen-empty-tab") && !isThis(t));
  const scopes = all ? spaces().filter(s => s.uuid).map(s => s.uuid) : [here()];
  const looseCount = scopes.reduce((n, sp) => n + looseIn(sp).length, 0);
  const key = `${state.topicScope ?? "here"}:${here()}`;
  const run = async () => {
    state.topics = { key, status: "Sorting…" };
    render();
    try {
      const groups = [];
      for (const space of scopes) {
        const list = looseIn(space);
        if (list.length < 3) continue;
        for (const g of await AI.topics(list, p => {
          state.topics.status = `Getting the models: ${p}% (once, about 60 MB)`;
          render();
        })) groups.push({ ...g, space });
      }
      state.topics = { key, groups };
    } catch (e) {
      console.error("[Zenith Tab manager] topics", e);
      state.topics = { key, status: "Couldn't sort them: " + (e.message || e) };
    }
    render();
  };
  const t = state.topics?.key === key ? state.topics : null;
  const groups = (t?.groups ?? []).map(g => ({ ...g, tabs: g.tabs.filter(x => x.isConnected && !x.group && !Look.kept(x)) }))
    .filter(g => g.tabs.length > 1);
  const chips = make("div", { class: "chips" }, [["here", "This space"], ["all", "All spaces"]].map(([k, label]) => make("button", {
    type: "button", "aria-pressed": String((state.topicScope ?? "here") === k),
    onclick: e => { e.stopPropagation(); state.topicScope = k; render(); },
  }, label)));
  const intro = make("div", { class: "card" },
    make("div", { class: "card-head" }, make("h3", {}, all ? "Loose tabs in every space" : "Loose tabs in this space"), make("span", { class: "n" }, String(looseCount)), chips),
    make("p", {}, t?.status ?? (t?.groups ? (groups.length ? "Here's what goes together. Untick what to leave out, then put each group away." : "Nothing that clearly belongs together.")
                                            : `Sorts them by what they're about, on this computer, and shows you the groups first${all ? " (each space on its own: folders stay in their space)" : ""}.`)),
    make("div", { class: "row" }, make("button", { type: "button", class: t?.groups ? null : "primary", disabled: looseCount < 3 || t?.status === "Sorting…", onclick: run },
                                       t?.groups ? "Sort again" : "Sort by topic")));
  const groupsOn = (G()?.mode ?? "off") !== "off";
  return [make("h2", {}, "By topic"), intro,
    ...groups.map((g, i) => {
      const name = topicName(g.label, g.tabs), cardKey = `topic-${g.space}-${i}-${name}`;
      const where = all && Look.spaceName(g.space) ? ` in ${Look.spaceName(g.space)}` : "";
      return tidyCard(cardKey, name, `${plural(g.tabs.length, "tab")} about the same thing${where}.`, g.tabs,
        intoActions(cardKey, name, g.space, groupsOn), null, destination(cardKey, name, g.space));
    })];
}

/* --- Rules ---------------------------------------------------------------------------------- */

function renderRules() {
  const rules = Z.Rules.list;
  const save = () => Z.Rules.save(rules);
  const groupsOn = (G()?.mode ?? "off") !== "off";
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
    const targets = [["new", kind === "group" ? "an unpinned folder named" : "a folder named"],
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
      select(kind, [["folder", "a folder (pins)"], ...(groupsOn ? [["group", "an unpinned folder"]] : [])], v => { rule.kind = v; rule.folder = ""; save(); render(); }),
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
      make("p", {}, "Tabs that arrive at a matching page go into a folder: one you link the rule to, wherever it is, or one with the rule's name in the tab's space (made when the first tab arrives, and again if you delete it). Later tabs join it." +
                    (groupsOn ? "" : " (Folders that don't pin are off in Zenith › Tabs.)") + " Tabs already in a folder are left alone."),
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
        make("div", { class: "what" }, make("span", {}, "Close loose tabs"), make("small", {}, "Not pinned, not essentials, not in a folder, and not used for this long. Listed below to bring back.")),
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
  }, 150);
}

// Memory and CPU, every few seconds while the page is in view (in place).
async function measure() {
  if (document.hidden) return;
  try {
    const first = !state.usage.size;
    state.usage = await Look.usage();
    recordCpu();
    if (first) soon();
    else updateUsage();
  } catch (e) {
    console.error("[Zenith Tab manager] usage", e);
  }
}
const measuring = setInterval(measure, 3000);

const EVENTS = ["TabOpen", "TabClose", "TabMove", "TabSelect", "TabPinned", "TabUnpinned", "TabGrouped",
                "TabUngrouped", "TabGroupCreate", "TabGroupRemoved", "TabGroupCollapse", "TabGroupExpand"];
// A tab's title, sound or sleep changing: not every attribute (loading
// progress changes many times a second).
const SHOWN = new Set(["label", "image", "soundplaying", "muted", "sharing", "pending", "discarded", "busy", "pinned"]);
const changed = e => (e.detail?.changed ?? []).some(a => SHOWN.has(a)) && soon();
for (const e of EVENTS) gBrowser.tabContainer.addEventListener(e, soon);
gBrowser.tabContainer.addEventListener("TabAttrModified", changed);
win.addEventListener("ZenWorkspacesUIUpdate", soon);
const prefs = ["zenith.internal.tabs.rules", "zenith.plus.tabs-auto-sleep", "zenith.plus.tabs-auto-close", "zenith.internal.tabs.auto-closed",
               "zenith.plus.unpinned-groups", "zenith.internal.unpinned-folders", "zenith.plus.local-ai"];
for (const p of prefs) Services.prefs.addObserver(p, soon);
window.addEventListener("unload", () => {
  clearInterval(measuring);
  for (const e of EVENTS) gBrowser.tabContainer.removeEventListener(e, soon);
  gBrowser.tabContainer.removeEventListener("TabAttrModified", changed);
  win.removeEventListener("ZenWorkspacesUIUpdate", soon);
  for (const p of prefs) Services.prefs.removeObserver(p, soon);
});

$("views").addEventListener("click", e => {
  const view = e.target.closest("button")?.dataset.view;
  if (!view) return;
  state.view = view;
  render();
});
// What Undo did, said plainly: put back, or already as it was.
function undoSay(done) {
  if (!done.length) return say("Nothing to undo");
  const back = done.filter(d => d?.n), same = done.filter(d => d && !d.n);
  say([back.length ? `Put back: ${back.map(d => d.label).join(", ")}` : "",
       same.length ? `Already as it was: ${same.map(d => d.label).join(", ")}` : ""].filter(Boolean).join(" · "));
  soon();
}

// Undo: the last change, or (from its list) back to any recent one.
function undoMenu(anchor) {
  const h = Z.Act.history;
  if (h.length < 2) return undoSay(h.length ? [Z.Act.undoLast()] : []);
  const items = [...h].map((entry, i) => ({ entry, i })).reverse().map(({ entry, i }, k) => ({
    label: k ? `Back to before: ${entry.label}` : `Undo: ${entry.label}`,
    note: ago(entry.at),
    run: () => undoSay(Z.Act.undoTo(i)),
  }));
  menu(anchor, items, true);
}
$("undo").addEventListener("click", e => undoMenu(e.currentTarget));
// This page's own tab.
$("close").addEventListener("click", () => {
  const tab = gBrowser.getTabForBrowser(window.browsingContext.embedderElement);
  if (tab) gBrowser.removeTab(tab);
});
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
    render();
  } else if (e.key === "Delete" && state.picked.size) {
    closeTabs([...state.picked]);
  } else if ((e.ctrlKey || e.metaKey) && e.key === "z") {
    e.preventDefault();
    undoSay(Z.Act.history.length ? [Z.Act.undoLast()] : []);
  } else if ((e.ctrlKey || e.metaKey) && e.key === "a" && (state.view === "tabs" || state.view === "spaces")) {
    e.preventDefault();
    state.picked = new Set(order);
    render();
  } else if (e.key === "/" || ((e.ctrlKey || e.metaKey) && e.key === "f")) {
    e.preventDefault();
    $("search").focus();
  }
});

window.ZenithTabsPage = { state, render, measure, ask, doing, topicName }; // for tools/checks
render();
measure();
