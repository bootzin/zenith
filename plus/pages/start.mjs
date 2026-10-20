// about:zenith-start: a clock, a search box (Peek's engine) that also
// filters your bookmarks as you type, and the bookmarks themselves: 1–9
// open one while the box is empty, arrows and Enter pick one, Shift+Enter
// opens in a new tab. With the weather on, a line from wttr.in for where
// you are (then, optionally, the places you looked up in Peek lately); and
// optionally your most visited sites, as tiles. Each part has its switch
// (Zenith › Pages › Start page).

const win = window.browsingContext.topChromeWindow;
const { Services } = win;
const { PlacesUtils } = ChromeUtils.importESModule("resource://gre/modules/PlacesUtils.sys.mjs");
const $ = id => document.getElementById(id);
const MAX = 9;
const P = Services.prefs;
const want = (pref, fallback) => P.getBoolPref(`zenith.plus.startpage-${pref}`, fallback);

function make(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  node.append(...kids.filter(k => k != null));
  return node;
}

// The window's accent and ink, worked out there (its colours are in its
// own variables).
function colours() {
  const probe = win.document.createElement("div");
  probe.hidden = true;
  probe.style.color = "var(--zth-accent, AccentColor)";
  win.document.documentElement.append(probe);
  document.documentElement.style.setProperty("--accent", win.getComputedStyle(probe).color);
  probe.style.color = "var(--zth-ink, CanvasText)";
  document.documentElement.style.setProperty("--ink", win.getComputedStyle(probe).color);
  probe.remove();
}

function clock() {
  const now = new Date();
  $("clock").textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const h = now.getHours();
  const part = h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  $("greeting").textContent = `${part} · ${now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}`;
  setTimeout(clock, (60 - now.getSeconds()) * 1000 + 50);
}

// Where you are (wttr.in's guess from your connection, as Peek's "wt"),
// then (with its switch) the places you looked up lately, as many as Peek's
// weather history keeps; a place only once. Peek does the asking
// (zenith-peek.uc.mjs).
async function weather() {
  const peek = win.ZenithPeek;
  if (!want("weather", false) || !peek?.weather) return;
  const places = ["", ...(want("weather-history", true) ? (peek.weatherPlaces?.() ?? []) : [])];
  const lines = await Promise.all(places.map(p => peek.weather(p).catch(() => null)));
  const seen = new Set();
  const shown = lines.filter(l => {
    const key = (l?.place ?? l?.text?.split(":")[0] ?? "").trim().toLowerCase();
    if (!l || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!shown.length) return;
  $("weather").replaceChildren(...shown.map((l, i) => make("div", { class: i ? "other" : null }, l.text)));
  $("weather").hidden = false;
}

// Bookmarks (with their switch): the toolbar's first, then the menu's and
// the rest.
let all = [], top = [];
async function bookmarks() {
  if (!want("bookmarks", true)) {
    all = [];
    return show();
  }
  const order = [PlacesUtils.bookmarks.toolbarGuid, PlacesUtils.bookmarks.menuGuid, PlacesUtils.bookmarks.unfiledGuid];
  const out = [];
  const walk = node => {
    if (node.uri && /^(https?|file|about|moz-extension):/.test(node.uri)) out.push({ title: node.title || node.uri, url: node.uri });
    for (const c of node.children ?? []) walk(c);
  };
  for (const guid of order) {
    try {
      walk(await PlacesUtils.promiseBookmarksTree(guid));
    } catch {}
  }
  all = out;
  show();
}

// Most visited (with its switch): Firefox's own top sites, by frecency
// (how often and how lately you've been), one per site.
async function topSites() {
  if (!want("top", false)) return;
  try {
    const { NewTabUtils } = ChromeUtils.importESModule("resource://gre/modules/NewTabUtils.sys.mjs");
    const links = await NewTabUtils.activityStreamLinks.getTopSites({ numItems: 12, onePerDomain: true, includeFavicon: false });
    // This space's essentials first (a click goes to the tab), then the
    // most visited, none of them twice.
    const mine = essentials();
    const hosts = new Set(mine.map(e => host(e.url)));
    top = [...mine, ...links.filter(l => /^https?:/.test(l.url) && !hosts.has(host(l.url)) && hosts.add(host(l.url)))
      .slice(0, 8).map(l => ({ title: l.title || host(l.url), url: l.url }))];
  } catch (e) {
    console.error("[Zenith start page] most visited", e);
    top = [];
  }
  $("top").replaceChildren(...top.map(s => make("a", { href: s.url, title: s.title, class: s.tab ? "essential" : null,
    onclick: e => (e.preventDefault(), s.tab?.isConnected && !e.shiftKey ? (s.tab.ownerGlobal.gBrowser.selectedTab = s.tab) : open(s.url, e.shiftKey || e.button === 1)) },
    make("img", { src: `page-icon:${s.url}`, alt: "", onerror: e => (e.target.style.visibility = "hidden") }),
    make("span", {}, host(s.url)))));
  $("top").hidden = !top.length;
  show();
}

// The essentials of the space this page is in (each space's own, when Zen
// keeps them apart by container).
function essentials() {
  const win = window.browsingContext?.topChromeWindow, W = win?.gZenWorkspaces;
  if (!win?.gBrowser) return [];
  const space = W?.getWorkspaces?.()?.find(w => w.uuid === W.activeWorkspace);
  const separate = W?.containerSpecificEssentials ?? Services.prefs.getBoolPref("zen.workspaces.separate-essentials", false);
  return win.gBrowser.tabs.filter(t => t.hasAttribute("zen-essential") && !t.closing &&
      (!separate || parseInt(t.getAttribute("usercontextid") || "0", 10) === (space?.containerTabId || 0)))
    .map(t => {
      let url = t.linkedBrowser?.currentURI?.spec ?? "";
      if (!/^https?:/.test(url)) {
        try {
          url = win.SessionStore.getLazyTabValue(t, "url") || url;
        } catch {}
      }
      return { title: t.label, url, tab: t };
    })
    .filter(e => /^https?:/.test(e.url));
}

let shown = [], picked = -1;
function host(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function show() {
  const words = $("q").value.toLowerCase().split(/\s+/).filter(Boolean);
  // Typing finds most visited sites too (after the bookmarks); with no
  // bookmarks shown, the number keys open the most visited.
  const pool = words.length ? [...all, ...top.filter(s => !all.some(b => b.url === s.url))] : all.length ? all : top;
  shown = (words.length ? pool.filter(b => words.every(w => b.title.toLowerCase().includes(w) || b.url.toLowerCase().includes(w))) : all).slice(0, MAX);
  if (!words.length && !all.length) shown = top.slice(0, MAX);
  $("marks").hidden = !words.length && !all.length;
  picked = words.length && shown.length ? 0 : -1;
  $("marks").replaceChildren(...shown.map((b, i) => make("li", { selected: i === picked, onclick: e => open(b.url, e.shiftKey || e.button === 1) },
    make("span", { class: "n" }, words.length ? "" : String(i + 1)),
    make("img", { src: `page-icon:${b.url}`, alt: "", onerror: e => (e.target.style.visibility = "hidden") }),
    make("span", { class: "title" }, b.title),
    make("span", { class: "host" }, host(b.url)))));
  const what = all.length ? "bookmark" : "site";
  $("hint").textContent = words.length
    ? (shown.length ? `Enter opens the highlighted ${what} · Alt+Enter searches instead` : "Enter searches")
    : (shown.length ? `1–9 open a ${what} · type to find one, or to search` : "Type to search");
}

function pick(i) {
  picked = shown.length ? (i + shown.length) % shown.length : -1;
  [...$("marks").children].forEach((li, k) => li.toggleAttribute("selected", k === picked));
}

function open(url, newTab = false) {
  win.openTrustedLinkIn(url, newTab ? "tab" : "current");
}

// What the box holds: an address to go to, or something to search for.
function go(text, newTab) {
  const t = text.trim();
  if (!t) return;
  if (/^[a-z][\w+.-]*:\/\//i.test(t) || /^about:/.test(t) || (!/\s/.test(t) && /\.[a-z]{2,}(\/|:|$)/i.test(t)) || /^localhost(:\d+)?(\/|$)/.test(t)) {
    try {
      const { preferredURI } = Services.uriFixup.getFixupURIInfo(t, Services.uriFixup.FIXUP_FLAG_FIX_SCHEME_TYPOS);
      return open(preferredURI.spec, newTab);
    } catch {}
  }
  const engine = win.ZenithPeek?.engine?.()?.[1];
  if (engine) return open(engine.replace("%s", encodeURIComponent(t)), newTab);
  Services.search.getDefault().then(e => open(e.getSubmission(t).uri.spec, newTab));
}

$("q").addEventListener("input", show);
$("q").addEventListener("keydown", e => {
  const empty = !$("q").value;
  if (empty && /^[1-9]$/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
    const b = shown[+e.key - 1];
    if (b) {
      e.preventDefault();
      open(b.url, e.shiftKey);
    }
  } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    pick(picked + (e.key === "ArrowDown" ? 1 : -1));
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (picked >= 0 && !e.altKey) open(shown[picked].url, e.shiftKey);
    else go($("q").value, e.shiftKey);
  } else if (e.key === "Escape") {
    $("q").value = "";
    show();
  }
});

colours();
clock();
bookmarks();
topSites();
weather();
$("q").focus();
