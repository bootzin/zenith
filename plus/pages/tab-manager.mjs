// about:zenith-tabs: every space's tabs, tidying up, and rules.
// The page asks the window it's in (zenith-tabs.uc.mjs: window.ZenithTabs)
// to do everything; it only shows and picks. Nothing happens until you
// press something here, or set a rule on the Rules page.

const win = window.browsingContext.topChromeWindow;
const Z = win.ZenithTabs;
const { gBrowser, Services } = win;
const W = () => win.gZenWorkspaces;
const PAGE = "about:zenith-tabs";
const DAY = 24 * 60 * 60 * 1000;
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
  return Look.tabs().filter(t => t.linkedBrowser?.currentURI?.spec !== PAGE);
}

function spaceColour(space) {
  const c = space?.theme?.gradientColors?.find(x => x?.isPrimary)?.c ?? space?.theme?.gradientColors?.[0]?.c;
  return Array.isArray(c) ? `rgb(${c.slice(0, 3).join(" ")})` : "";
}

function matches(tab) {
  const q = state.query.toLowerCase();
  return !q || (tab.label || "").toLowerCase().includes(q) || Look.site(tab).toLowerCase().includes(q);
}

/* --- State ----------------------------------------------------------------------- */

const state = {
  view: "overview",
  query: "",
  picked: new Set(),
  last: null, // the last tab clicked, for Shift
  open: new Set(), // folders shown open
  days: Services.prefs.getIntPref("zenith.internal.tabs.days", 7),
};

/* --- Drawing ------------------------------------------------------------------------- */

const rows = new WeakMap(); // row element → tab
let order = []; // tabs in the order shown, for Shift ranges

function render() {
  paint();
  for (const t of state.picked) if (!t.isConnected || t.closing) state.picked.delete(t);
  const all = tabs();
  const awake = all.filter(t => Look.awake(t)).length;
  $("summary").textContent = `${plural(spaces().length, "space")} · ${plural(all.length, "tab")} · ${awake} awake`;
  for (const b of $("views").children) b.setAttribute("aria-selected", String(b.dataset.view === state.view));
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
  const icon = make("span", { class: "icon" });
  const image = tab.getAttribute("image");
  if (image) {
    const img = make("img", { src: image, alt: "" });
    img.addEventListener("error", () => img.remove(), { once: true });
    icon.append(img);
  }
  const asleep = !Look.awake(tab);
  const act = (title, icon, fn) => make("button", { type: "button", title, onclick: e => (e.stopPropagation(), fn()) },
                                        (() => { const s = make("span"); s.style.setProperty("--icon", `url("${icon}")`); return s; })());
  const row = make("div", { class: "tab", draggable: "true", picked: state.picked.has(tab), current: tab.selected, asleep },
    icon,
    make("span", { class: "text" }, make("span", { class: "title" }, tab.label || Look.site(tab)), make("span", { class: "host" }, Look.site(tab))),
    tab.hasAttribute("soundplaying") ? make("span", { class: "badge", title: "Playing" }, "♪") : null,
    make("span", { class: "acts" },
      act("Go to it", "chrome://global/skin/icons/arrow-right.svg", () => Z.Act.go(tab)),
      asleep ? act("Wake it", "chrome://browser/skin/zen-icons/reload.svg", () => (Z.Act.wake([tab]), soon()))
             : act("Put to sleep", "chrome://browser/skin/zen-icons/moon-stars.svg", () => (Z.Act.sleep([tab]), soon())),
      act("Close (Undo comes up)", "chrome://global/skin/icons/close.svg", () => closeTabs([tab]))));
  rows.set(row, tab);
  order.push(tab);
  row.title = `${tab.label}\n${tab.linkedBrowser?.currentURI?.spec ?? ""}`;
  return row;
}

function folderBlock(group, items) {
  const open = state.open.has(group.id) || !!state.query;
  const isGroup = !group.isZenFolder;
  const mark = make("span", { class: `mark${isGroup ? " group" : ""}` });
  if (isGroup) mark.style.setProperty("--group", `var(--tab-group-color-${group.color ?? "blue"}, ${GROUP_COLOURS[group.color] ?? "var(--accent)"})`);
  const head = make("div", { class: "head", title: isGroup ? "A group (its tabs aren't pinned)" : "A folder" },
    make("span", { class: "chev" }), mark, make("span", { class: "name" }, group.label || (isGroup ? "Group" : "Folder")),
    make("span", { class: "count" }, String(items.length)));
  head.addEventListener("click", () => {
    if (state.open.has(group.id)) state.open.delete(group.id);
    else state.open.add(group.id);
    render();
  });
  dropOn(head, moving => Z.Act.into(moving, { folder: group }));
  return make("div", { class: "folder", open }, head, make("div", { class: "tabs" }, items.map(tabRow)));
}

const GROUP_COLOURS = { blue: "#4a90e2", purple: "#a56ee8", cyan: "#3fb8c9", orange: "#f08a3c", yellow: "#e6c229",
                        pink: "#e8669c", green: "#47b26b", gray: "#8a8a8a", red: "#e05656" };

function renderBoard(all) {
  order = [];
  const ess = all.filter(t => t.hasAttribute("zen-essential") && matches(t));
  const strip = $("essentials");
  strip.hidden = !ess.length;
  strip.replaceChildren(make("span", { class: "label" }, "Essentials"), ...ess.map(tabRow));
  const folders = Z.Act.folders();
  const columns = spaces().map(space => {
    const here = all.filter(t => !t.hasAttribute("zen-essential") && (Look.space(t) || "") === space.uuid);
    const shown = here.filter(matches);
    const loose = (pinned) => shown.filter(t => !!t.pinned === pinned && !t.group);
    const groups = (pinned) => folders.filter(f => (f.getAttribute("zen-workspace-id") || "") === space.uuid && !!f.isZenFolder === pinned)
      .map(f => [f, (f.tabs ?? []).filter(t => shown.includes(t))]).filter(([, items]) => items.length || !state.query);
    const pinnedPart = [...groups(true).map(([f, items]) => folderBlock(f, items)), ...loose(true).map(tabRow)];
    const tabsPart = [...groups(false).map(([f, items]) => folderBlock(f, items)), ...loose(false).map(tabRow)];
    const awake = here.filter(t => Look.awake(t)).length;
    const head = make("header", {},
      make("span", { class: "name", title: "Go to this space" }, `${space.icon && !/^[a-z]+:/i.test(space.icon) ? `${space.icon}  ` : ""}${space.name || "Space"}`),
      space.uuid && space.uuid === W()?.activeWorkspace ? make("span", { class: "here" }, "HERE") : null,
      make("span", { class: "count" }, `${here.length} · ${awake} awake`));
    head.style.setProperty("--space", spaceColour(space));
    head.querySelector(".name").addEventListener("click", () => space.uuid && W()?.changeWorkspaceWithID(space.uuid));
    const list = make("div", { class: "list" },
      pinnedPart.length ? [make("div", { class: "part" }, "Pinned"), pinnedPart] : null,
      tabsPart.length ? [make("div", { class: "part" }, "Tabs"), tabsPart] : null,
      !pinnedPart.length && !tabsPart.length ? make("div", { class: "empty" }, state.query ? "Nothing matches" : "No tabs") : null);
    const column = make("section", { class: "space" }, head, list);
    if (space.uuid) dropOn(column, moving => Z.Act.move(moving, space.uuid));
    return column;
  });
  $("board").replaceChildren(...columns);
}

/* --- Picking -------------------------------------------------------------------------- */

document.addEventListener("click", e => {
  const row = e.target.closest?.(".tab");
  if (!row || e.target.closest("button")) return;
  const tab = rows.get(row);
  if (!tab) return;
  if (e.shiftKey && state.last) {
    const a = order.indexOf(state.last), b = order.indexOf(tab);
    if (a >= 0 && b >= 0) for (const t of order.slice(Math.min(a, b), Math.max(a, b) + 1)) state.picked.add(t);
  } else if (e.ctrlKey || e.metaKey) {
    if (state.picked.has(tab)) state.picked.delete(tab);
    else state.picked.add(tab);
  } else if (state.picked.size === 1 && state.picked.has(tab)) {
    state.picked.clear();
  } else {
    state.picked = new Set([tab]);
  }
  state.last = tab;
  render();
});

document.addEventListener("dblclick", e => {
  const tab = rows.get(e.target.closest?.(".tab"));
  if (tab) Z.Act.go(tab);
});

// Dragging picked tabs (or the one under the pointer) onto a space or folder.
let dragging = [];
document.addEventListener("dragstart", e => {
  const tab = rows.get(e.target.closest?.(".tab"));
  if (!tab) return;
  dragging = state.picked.has(tab) ? [...state.picked] : [tab];
  e.dataTransfer.setData("application/x-zenith-tabs", String(dragging.length));
  e.dataTransfer.effectAllowed = "move";
});
document.addEventListener("dragend", () => (dragging = []));

function dropOn(node, fn) {
  node.addEventListener("dragover", e => {
    if (!dragging.length) return;
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
    if (dragging.length) fn(dragging);
    dragging = [];
    soon();
  });
}

/* --- Acting on what's picked --------------------------------------------------------------- */

function closeTabs(list) {
  const n = Z.Act.closePicked(list);
  for (const t of list) state.picked.delete(t);
  if (n) say(`Closed ${plural(n, "tab")}`, () => {
    const back = Z.Act.undo();
    say(`Reopened ${plural(back, "tab")}`);
  });
  soon();
}

function renderBar() {
  const bar = $("bar");
  const picked = [...state.picked];
  bar.hidden = !picked.length || state.view !== "overview";
  if (bar.hidden) return;
  const asleep = picked.filter(t => !Look.awake(t)).length;
  bar.replaceChildren(...[
    make("span", { class: "count" }, `${picked.length} picked`),
    make("button", { type: "button", onclick: e => menu(e.currentTarget, spaceItems(picked)) }, "Move to…"),
    make("button", { type: "button", onclick: e => menu(e.currentTarget, folderItems(picked)) }, "Into a folder…"),
    picked.length > asleep ? make("button", { type: "button", onclick: () => (Z.Act.sleep(picked), soon()) }, "Sleep") : null,
    asleep ? make("button", { type: "button", onclick: () => (Z.Act.wake(picked), soon()) }, "Wake") : null,
    make("button", { type: "button", onclick: () => closeTabs(picked) }, "Close"),
    make("button", { type: "button", class: "quiet", title: "Pick nothing (Esc)", onclick: () => (state.picked.clear(), render()) }, "✕"),
  ].filter(Boolean));
}

function spaceItems(picked) {
  return spaces().filter(s => s.uuid).map(s => ({ label: `${s.icon && !/^[a-z]+:/i.test(s.icon) ? `${s.icon}  ` : ""}${s.name}`,
                                                  note: s.uuid === W()?.activeWorkspace ? "here" : "",
                                                  run: () => Z.Act.move(picked, s.uuid) }));
}

function folderItems(picked) {
  const groupsOn = Services.prefs.getBoolPref("browser.tabs.groups.enabled", false);
  const items = [{ label: "New folder…", run: () => ask("Folder name", name => Z.Act.into(picked, { name })) }];
  if (groupsOn) items.push({ label: "New group (tabs stay unpinned)…", run: () => ask("Group name", name => Z.Act.into(picked, { name, group: true })) });
  const folders = Z.Act.folders();
  if (folders.length) items.push({ sep: true });
  for (const f of folders) {
    items.push({ label: `${f.isZenFolder ? "📁" : "▢"}  ${f.label || "Folder"}`, note: Look.spaceName(f.getAttribute("zen-workspace-id") || ""),
                 run: () => Z.Act.into(picked, { folder: f }) });
  }
  return items;
}

// A small list under a button.
function menu(anchor, items) {
  const box = $("menu");
  box.replaceChildren(...items.map(i => i.sep ? make("div", { class: "sep" })
    : make("button", { type: "button", class: "item", onclick: () => { box.hidden = true; i.run(); soon(); } },
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
  const done = () => {
    const name = input.value.trim();
    if (name) {
      fn(name);
      state.picked.clear();
    }
    soon();
  };
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") done();
    else if (e.key === "Escape") render();
  });
  bar.replaceChildren(make("span", { class: "count" }, `${state.picked.size} picked`), input,
                      make("button", { type: "button", class: "primary", onclick: done }, "Make it"),
                      make("button", { type: "button", class: "quiet", onclick: () => render() }, "Cancel"));
  input.focus();
}

function say(text, undo = null) {
  const note = $("note");
  note.replaceChildren(...[make("span", {}, text), undo && make("button", { type: "button", onclick: () => undo() }, "Undo")].filter(Boolean));
  note.hidden = false;
  clearTimeout(say.timer);
  say.timer = setTimeout(() => (note.hidden = true), undo ? 8000 : 3000);
}

/* --- Tidying up -------------------------------------------------------------------------- */

function renderTidy() {
  const r = Look.report(state.days);
  const own = t => t.linkedBrowser?.currentURI?.spec !== PAGE;
  const dupes = r.duplicates.filter(own), stale = r.stale.filter(own), awake = r.awake.filter(own);
  const pick = list => () => {
    state.picked = new Set(list);
    render();
  };
  const card = (title, n, why, ...buttons) => make("div", { class: "card" },
    make("div", { class: "card-head" }, make("h3", {}, title), make("span", { class: "n" }, String(n))),
    make("p", {}, why), n ? make("div", { class: "row" }, buttons) : null);
  const chips = make("div", { class: "chips" }, [3, 7, 14, 30].map(d => make("button", {
    type: "button", "aria-pressed": String(d === state.days),
    onclick: () => { state.days = d; Services.prefs.setIntPref("zenith.internal.tabs.days", d); render(); },
  }, `${d}d`)));
  const busy = make("div", { class: "card" },
    make("div", { class: "card-head" }, make("h3", {}, "Busy sites"), make("span", { class: "n" }, String(r.busy.length))),
    make("p", {}, "One site with several loose tabs in a space: a folder (or a group) keeps them together."),
    r.busy.map(b => make("div", { class: "site" },
      make("span", {}, b.site), make("small", {}, `${b.tabs.length}${Look.spaceName(b.space) ? ` · ${Look.spaceName(b.space)}` : ""}`),
      make("button", { type: "button", onclick: pick(b.tabs) }, "Pick"),
      make("button", { type: "button", onclick: () => { Z.Act.folder(b.site, b.space, b.tabs); soon(); } }, "Folder"))));
  $("tidy").replaceChildren(
    make("h2", {}, "Tidy up"),
    card("Duplicates", dupes.length, "The same page open more than once; the one you used last isn't picked.",
         make("button", { type: "button", onclick: pick(dupes) }, "Pick them"),
         make("button", { type: "button", class: "primary", onclick: () => closeTabs(dupes) }, "Close them")),
    (() => {
      const c = card(`Not used in ${state.days} days`, stale.length, "Loose tabs you haven't been to for a while.",
                     make("button", { type: "button", onclick: pick(stale) }, "Pick them"),
                     make("button", { type: "button", onclick: () => (Z.Act.sleep(stale), soon()) }, "Sleep"),
                     make("button", { type: "button", class: "primary", onclick: () => closeTabs(stale) }, "Close them"));
      c.querySelector(".card-head").append(chips);
      return c;
    })(),
    card("Awake", awake.length, "Loaded and using memory, besides the tab you're on (playing tabs stay awake).",
         make("button", { type: "button", onclick: pick(awake) }, "Pick them"),
         make("button", { type: "button", class: "primary", onclick: () => (Z.Act.sleep(awake), soon()) }, "Sleep them")),
    busy);
}

/* --- Rules ---------------------------------------------------------------------------------- */

function renderRules() {
  const rules = Z.Rules.list;
  const save = () => Z.Rules.save(rules);
  const groupsOn = Services.prefs.getBoolPref("browser.tabs.groups.enabled", false);
  const folders = Z.Act.folders().filter(f => f.isZenFolder);
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
    const targets = [["new", rule.kind === "group" ? "an unpinned group named" : "a folder named"],
                     ...(rule.kind === "group" ? [] : folders.map(f => [f.id, `📁 ${f.label || "Folder"} (${Look.spaceName(f.getAttribute("zen-workspace-id") || "")})`]))];
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
      groupsOn ? select(rule.kind ?? "folder", [["folder", "a folder"], ["group", "a group"]], v => { rule.kind = v; rule.folder = ""; save(); render(); }) : null,
      select(rule.folder || "new", targets, v => { rule.folder = v === "new" ? "" : v; save(); render(); }),
      name,
      make("button", { type: "button", class: "quiet remove", title: "Remove this rule", onclick: () => { rules.splice(i, 1); save(); render(); } }, "Remove"));
  };
  const add = () => {
    rules.push({ id: crypto.randomUUID(), on: true, match: "site", value: "", space: "", kind: "folder", folder: "", name: "" });
    save();
    render();
  };
  const sleepPref = "zenith.plus.tabs-auto-sleep", closePref = "zenith.plus.tabs-auto-close";
  const prefSelect = (pref, options) => select(Services.prefs.getStringPref(pref, "").replace("off", ""), options, v => {
    if (v) Services.prefs.setStringPref(pref, v);
    else Services.prefs.clearUserPref(pref);
    render();
  });
  const closedList = Z.Auto.closedList;
  $("rules").replaceChildren(
    make("section", {},
      make("h2", {}, "Grouping"),
      make("p", {}, "Tabs that arrive at a matching page go into a folder: one you link the rule to (wherever it is), or one with the rule's name in the tab's space, made when needed." +
                    (groupsOn ? " A group keeps them unpinned." : " (Turn on Groups for unpinned tabs in Zenith › Tabs to use groups too.)") +
                    " Tabs already in a folder or group are left alone."),
      rules.map(ruleRow),
      make("div", { class: "row" },
        make("button", { type: "button", class: "primary", onclick: add }, "Add a rule"),
        rules.length ? make("button", { type: "button", onclick: () => say(`Grouped ${plural(Z.Rules.applyAll(), "tab")}`) }, "Apply to open tabs now") : null)),
    make("section", {},
      make("h2", {}, "On their own"),
      make("p", {}, "Off until you choose. The tab you're on, playing tabs and tabs sharing your camera or screen are never touched."),
      make("div", { class: "setting" },
        make("div", { class: "what" }, make("span", {}, "Put tabs to sleep"), make("small", {}, "Tabs you haven't been to for this long are unloaded; they come back when you open them.")),
        prefSelect(sleepPref, [["", "Never"], ["15", "After 15 minutes"], ["30", "After 30 minutes"], ["60", "After an hour"], ["120", "After 2 hours"], ["240", "After 4 hours"]])),
      make("div", { class: "setting" },
        make("div", { class: "what" }, make("span", {}, "Close loose tabs"), make("small", {}, "Not pinned, not essentials, not in a folder or group, and not used for this long. Listed below to bring back.")),
        prefSelect(closePref, [["", "Never"], ["1", "After a day"], ["3", "After 3 days"], ["7", "After a week"], ["14", "After 2 weeks"], ["30", "After a month"]]))),
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

const EVENTS = ["TabOpen", "TabClose", "TabMove", "TabSelect", "TabAttrModified", "TabPinned", "TabUnpinned", "TabGrouped",
                "TabUngrouped", "TabGroupCreate", "TabGroupRemoved", "TabGroupCollapse", "TabGroupExpand"];
for (const e of EVENTS) gBrowser.tabContainer.addEventListener(e, soon);
win.addEventListener("ZenWorkspacesUIUpdate", soon);
const prefs = ["zenith.internal.tabs.rules", "zenith.plus.tabs-auto-sleep", "zenith.plus.tabs-auto-close", "zenith.internal.tabs.auto-closed",
               "browser.tabs.groups.enabled"];
for (const p of prefs) Services.prefs.addObserver(p, soon);
window.addEventListener("unload", () => {
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
$("search").addEventListener("input", e => {
  state.query = e.target.value.trim();
  render();
});
document.addEventListener("keydown", e => {
  if (e.target.matches("input, select")) {
    if (e.key === "Escape" && e.target.id === "search") {
      e.target.value = "";
      state.query = "";
      render();
    }
    return;
  }
  if (e.key === "Escape") {
    $("menu").hidden = true;
    state.picked.clear();
    render();
  } else if (e.key === "Delete" && state.picked.size) {
    closeTabs([...state.picked]);
  } else if ((e.ctrlKey || e.metaKey) && e.key === "a" && state.view === "overview") {
    e.preventDefault();
    state.picked = new Set(order);
    render();
  } else if (e.key === "/" || ((e.ctrlKey || e.metaKey) && e.key === "f")) {
    e.preventDefault();
    $("search").focus();
  }
});

window.ZenithTabsPage = { state, render }; // for tools/checks
render();
