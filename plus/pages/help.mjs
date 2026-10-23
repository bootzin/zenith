// SPDX-License-Identifier: GPL-3.0-or-later
// about:zenith-help: what Zenith can do, and how. The words are in
// help.html; this fills in what depends on your settings (every key as it's
// set now, what each link click does), makes "Try it" do it, finds things
// as you type, and tiles the page beside the one you came from.

const win = window.browsingContext.topChromeWindow;
const $ = id => document.getElementById(id);

function make(tag, attrs = {}, text = "") {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text) node.textContent = text;
  return node;
}

/* --- Colours: the window's Zenith colours, on this page ---------------------------- */

const VARS = ["--zth-glass-color", "--zth-accent", "--zth-ink", "--zth-ink-dim", "--zth-hairline", "--zth-radius", "--zth-pill-radius", "--zth-font"];

function paint() {
  const cs = win.getComputedStyle(win.document.documentElement);
  for (const v of VARS) {
    const value = cs.getPropertyValue(v).trim();
    if (value) document.documentElement.style.setProperty(v, value);
  }
  const dark = win.document.documentElement.getAttribute("zen-should-be-dark-mode");
  document.documentElement.style.colorScheme = dark === "true" ? "dark" : dark === "false" ? "light" : "light dark";
}

/* --- Try it ----------------------------------------------------------------------- */

const TRY = {
  switcher: () => win.ZenithSwitcher?.show("", "tabs"),
  launcher: () => win.ZenithSwitcher?.show("", "open"),
  commands: () => win.ZenithSwitcher?.show(":"),
  spaces: () => win.ZenithSwitcher?.show("", "spaces"),
  timer: () => win.ZenithSwitcher?.show(":timer "),
  keys: () => win.ZenithShell?.sheet.toggle(),
  "new-tile": () => win.ZenithShell?.keys.run("new-tile"),
  peek: () => win.ZenithPeek?.prompt(""),
  dash: () => win.ZenithDash?.toggle(),
  overview: () => win.ZenithOverview?.toggle(),
  fetch: () => win.ZenithFetch?.open(),
  focus: () => win.ZenithFocus?.toggle(),
  tabs: () => win.ZenithTabs?.show(),
  settings: () => win.ZenithLive?.toggle(),
  "bar-settings": () => win.ZenithLive?.open({ kind: "preset", section: { id: "bar" } }),
  "palette-settings": () => win.ZenithLive?.open({ s: { property: "zenith.palette" } }),
};

document.addEventListener("click", e => {
  const b = e.target.closest("[data-try]");
  if (!b) return;
  try {
    TRY[b.dataset.try]?.();
  } catch (err) {
    console.error("[Zenith help]", b.dataset.try, err);
  }
});

/* --- What depends on your settings ---------------------------------------------------- */

const COMBO = { alt: "Alt+click", "alt-shift": "Alt+Shift+click", "ctrl-alt": "Ctrl+Alt+click", "ctrl-shift": "Ctrl+Shift+click" };
const DOES = { glance: "A link in Zen's Glance", peek: "A link in a Peek", tile: "A link as a new tile beside this one" };

function links() {
  const set = win.ZenithHelp?.links?.() ?? {};
  const list = $("link-combos");
  list.replaceChildren();
  for (const [combo, v] of Object.entries(set)) {
    if (DOES[v]) list.append(make("dt", {}, COMBO[combo]), make("dd", {}, DOES[v]));
  }
  // (In Tiles: the click that makes a tile, or nothing if none does.)
  const tile = Object.entries(set).find(([, v]) => v === "tile")?.[0];
  for (const n of document.querySelectorAll('[data-link="tile"]')) {
    n.hidden = !tile;
    if (tile && n.localName === "dt") n.textContent = COMBO[tile];
  }
}

function keys() {
  const box = $("key-groups");
  const groups = win.ZenithHelp?.groups?.();
  if (!groups) {
    $("keys-note").textContent = "The keys show here with Zenith Plus running.";
    return;
  }
  box.replaceChildren();
  for (const [group, rows] of groups) {
    const g = make("div", { class: "group" });
    g.append(make("h3", {}, group));
    for (const [combo, label] of rows) {
      const row = make("div", { class: "key" });
      row.append(make("kbd", {}, combo), make("span", {}, label));
      g.append(row);
    }
    box.append(g);
  }
}

/* --- Finding ------------------------------------------------------------------------ */

const sections = [...document.querySelectorAll("main > section")];
const toc = new Map([...document.querySelectorAll("#toc a")].map(a => [a.hash.slice(1), a]));

function find(text) {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  let any = false;
  for (const s of sections) {
    const hay = `${s.dataset.words ?? ""} ${s.textContent}`.toLowerCase();
    const show = words.every(w => hay.includes(w));
    s.hidden = !show;
    toc.get(s.id)?.toggleAttribute("hidden", !show);
    any ||= show;
  }
  $("nothing").hidden = any;
}

$("search").addEventListener("input", e => find(e.target.value));
$("search").addEventListener("keydown", e => {
  if (e.key === "Escape" && e.target.value) {
    e.target.value = "";
    find("");
  } else if (e.key === "Enter") {
    sections.find(s => !s.hidden)?.scrollIntoView({ block: "start" });
  }
});

// :help tiles, :help palette: the part whose name or words have it.
function go() {
  const topic = decodeURIComponent(location.hash.slice(1)).toLowerCase();
  if (!topic) return;
  const s = sections.find(x => x.id === topic) ?? sections.find(x => (x.dataset.words ?? "").split(" ").some(w => w.startsWith(topic)));
  if (s) s.scrollIntoView({ block: "start" });
  else {
    $("search").value = topic;
    find(topic);
  }
}
window.addEventListener("hashchange", go);

// The part you're reading, lit in the list.
const seen = new IntersectionObserver(entries => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    for (const a of toc.values()) a.removeAttribute("current");
    toc.get(e.target.id)?.setAttribute("current", "");
  }
}, { rootMargin: "-80px 0px -70% 0px" });
for (const s of sections) seen.observe(s);

/* --- Beside --------------------------------------------------------------------------- */

const tab = () => win.gBrowser?.getTabForBrowser(window.browsingContext.top.embedderElement);

function beside() {
  const t = tab();
  $("beside").hidden = !t || !win.ZenithHelp || !!t.splitView;
}

$("beside").addEventListener("click", () => {
  win.ZenithHelp?.beside(tab());
  setTimeout(beside, 300);
});

/* --- Start ---------------------------------------------------------------------------- */

paint();
links();
keys();
beside();
go();
document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  paint();
  links();
  keys();
  beside();
});
