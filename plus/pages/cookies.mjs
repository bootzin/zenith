// SPDX-License-Identifier: GPL-3.0-or-later
// about:zenith-cookies: your cookie choices at the top (banners, the
// policy, how long cookies are kept), the site you came from, what the
// banner answerer did lately, and every site with cookies: its rule
// (Allow, Until you close Zen, Block, or as the policy says), its banners
// (answered or left alone) and a Delete for its cookies and data. The work
// is done in the window (ZenithCookies in zenith-plus.uc.mjs) and by
// Firefox; this only shows it.

const win = window.browsingContext.topChromeWindow;
const C = win.ZenithCookies;
const { Services } = win;
const P = Services.prefs;
const $ = id => document.getElementById(id);
const here = new URLSearchParams(location.search).get("site") || "";

function make(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  node.append(...kids.flat(Infinity).filter(k => k != null && k !== false));
  return node;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// The window's colours (as the tab manager does).
function paint() {
  const probe = win.document.createElement("div");
  probe.hidden = true;
  win.document.documentElement.append(probe);
  for (const [v, css] of [["--accent", "var(--zth-accent, AccentColor)"], ["--ink", "var(--zth-ink, CanvasText)"]]) {
    probe.style.color = css;
    document.documentElement.style.setProperty(v, win.getComputedStyle(probe).color);
  }
  probe.remove();
}

function say(text) {
  const note = $("note");
  note.textContent = text;
  note.hidden = false;
  clearTimeout(say.timer);
  say.timer = setTimeout(() => (note.hidden = true), 2600);
}

// A choice as a row of buttons, written straight to its setting.
function choice(pref, title, why, options) {
  const def = options[0][0], value = P.getStringPref(pref, "") || def;
  return make("div", { class: "choice" },
    make("div", { class: "what" }, make("b", {}, title), make("small", {}, why)),
    make("div", { class: "segments", role: "radiogroup" }, options.map(([v, label, tip]) => make("button", {
      type: "button", role: "radio", "aria-checked": String(value === v), title: tip,
      onclick: () => {
        if (v === def) P.clearUserPref(pref);
        else P.setStringPref(pref, v);
        render();
      },
    }, label))));
}

function renderChoices() {
  $("choices").replaceChildren(make("h2", {}, "Your choices"),
    choice(C.BANNERS, "Cookie banners", "Answered for you: Reject pressed (or Only necessary). Nothing is ever accepted.", [
      ["reject-hide", "Reject, else hide", "Reject; a banner with no way to refuse is hidden"],
      ["reject", "Reject only", "Reject; banners with no way to refuse stay"],
      ["hide", "Hide, answer nothing", "Banners are hidden without an answer"],
      ["off", "Leave them", "Banners as sites show them"]]),
    choice(C.POLICY, "Which cookies sites may set", "Firefox's own setting; the sites you allow below always may.", [
      ["firefox", "Firefox's own", "Total Cookie Protection: each site's cookies kept apart"],
      ["cross", "No cross-site", "Cookies only from the site you're on"],
      ["trackers", "No trackers", "Cross-site cookies from known trackers blocked"],
      ["all", "Only sites you allow", "Every cookie blocked except sites you allow (logins break elsewhere)"]]),
    choice(C.KEEP, "How long they're kept", "Until you close Zen: cookies and site data go when Zen closes, except sites you allow. History, downloads and the rest stay.", [
      ["expire", "Until they expire", "As sites ask"],
      ["session", "Until you close Zen", "Except the sites you allow"]]));
}

const RULES = [["", "As above"], ["allow", "Allow"], ["session", "Until you close Zen"], ["block", "Block"]];

function siteRow(e, big = false) {
  const rule = make("select", { title: "This site's cookies" }, RULES.map(([v, label]) => make("option", { value: v, selected: e.rule === v }, label)));
  rule.addEventListener("change", () => {
    C.setRule(e.site, rule.value);
    say(rule.value ? `${e.site}: ${RULES.find(r => r[0] === rule.value)[1]}` : `${e.site}: as your choices say`);
    render();
  });
  const left = C.bannersLeftAlone(e.site);
  const banners = make("button", { type: "button", class: "quiet", "aria-pressed": String(!left), title: left ? "Its banners are left alone" : "Its banners are answered for you",
    onclick: () => { C.setBannersLeftAlone(e.site, !left); render(); } }, left ? "Banners left alone" : "Banners answered");
  const del = make("button", { type: "button", class: "danger", title: "Delete its cookies and the data it keeps (you'll be signed out)",
    onclick: async () => { await C.remove(e.site); say(`Deleted ${e.site}'s cookies and data`); render(); } }, "Delete");
  return make("div", { class: `site${big ? " big" : ""}`, "data-site": e.site },
    make("img", { src: `page-icon:https://${e.site}/`, alt: "", onerror: ev => (ev.target.style.visibility = "hidden") }),
    make("span", { class: "name" }, e.site), make("small", { class: "count" }, e.count ? plural(e.count, "cookie") : "no cookies"),
    rule, banners, e.count ? del : null);
}

async function render() {
  paint();
  const sites = C.sites();
  const total = sites.reduce((n, e) => n + e.count, 0);
  $("summary").textContent = `${plural(sites.filter(e => e.count).length, "site")} · ${plural(total, "cookie")}`;
  renderChoices();
  const mine = here && (sites.find(e => e.site === here) ?? { site: here, count: 0, rule: C.rules().get(here) ?? "" });
  $("here").replaceChildren(...(mine ? [make("h2", {}, "The site you came from"), siteRow(mine, true)] : []));
  const lately = (await C.lately()).slice(0, 6);
  $("lately").replaceChildren(...(lately.length ? [make("h2", {}, "Banners lately"),
    make("div", { class: "lately" }, lately.map(l => make("div", {}, make("b", {}, l.host), ` · ${l.how === "rejected" ? "rejected" : "hidden"}${l.tool && l.tool !== "banner" ? ` (${l.tool})` : ""}`)))] : []));
  const q = $("search").value.trim().toLowerCase();
  const shown = sites.filter(e => !q || e.site.includes(q));
  $("sites").replaceChildren(
    shown.length ? make("div", { class: "list" }, shown.map(e => siteRow(e))) : make("p", { class: "empty" }, q ? "No site matches." : "No cookies."));
}

$("search").addEventListener("input", () => render());
$("close").addEventListener("click", () => {
  const tab = win.gBrowser.getTabForBrowser(window.browsingContext.embedderElement);
  if (tab) win.gBrowser.removeTab(tab);
});
// Settings changed elsewhere (Zenith's page, another window).
const prefs = [C.BANNERS, C.POLICY, C.KEEP, C.SKIP];
const watch = () => render();
for (const p of prefs) P.addObserver(p, watch);
window.addEventListener("unload", () => prefs.forEach(p => P.removeObserver(p, watch)), { once: true });
render();
window.ZenithCookiesPage = { render }; // for tools/checks
