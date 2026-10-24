// SPDX-License-Identifier: GPL-3.0-or-later
// about:zenith-fetch (:fetch): your browser setup as fastfetch and neofetch
// print a system's, for screenshots: a logo, a list (Zen and Zenith,
// the OS, uptime, spaces and tabs, memory, layout, bars, palette, keys, the
// rice file) and the palette's colours. "Copy as text" gives the same as
// plain text for a post.

const win = window.browsingContext.topChromeWindow;
const { Services, gBrowser } = win;
const $ = id => document.getElementById(id);

// A Z made of blocks, as fetch tools draw their logos.
const LOGO = String.raw`
 ███████████████
 ███████████████
          ████▀
        ████▀
      ████▀
    ████▀
  ████▀
 ███████████████
 ███████████████
`.replace(/^\n/, "");

function make(tag, text = "") {
  const n = document.createElement(tag);
  if (text) n.textContent = text;
  return n;
}

function colours() {
  const cs = win.getComputedStyle(win.document.documentElement);
  for (const v of ["--zth-accent", ...["base", "mantle", "surface", "overlay", "text", "accent", "second", "red", "green", "yellow"].map(k => `--zth-pal-${k}`)]) {
    const value = cs.getPropertyValue(v).trim();
    if (value) document.documentElement.style.setProperty(v, value);
  }
  const dark = win.document.documentElement.getAttribute("zen-should-be-dark-mode");
  document.documentElement.style.colorScheme = dark === "true" ? "dark" : dark === "false" ? "light" : "light dark";
}


// Windows 11 24H2 (26200), from the registry; elsewhere what the platform says.
function os() {
  if (Services.appinfo.OS === "WINNT") {
    try {
      const key = Cc["@mozilla.org/windows-registry-key;1"].createInstance(Ci.nsIWindowsRegKey);
      key.open(key.ROOT_KEY_LOCAL_MACHINE, "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion", key.ACCESS_READ);
      try {
        const build = parseInt(key.readStringValue("CurrentBuild"), 10);
        const shown = key.hasValue("DisplayVersion") ? key.readStringValue("DisplayVersion") : "";
        return `Windows ${build >= 22000 ? 11 : 10}${shown ? ` ${shown}` : ""} (${build})`;
      } finally {
        key.close();
      }
    } catch {}
  }
  return win.navigator.oscpu ?? Services.appinfo.OS;
}

function since(ms) {
  const min = Math.floor(ms / 60000), h = Math.floor(min / 60), d = Math.floor(h / 24);
  const part = (n, w) => (n ? `${n} ${w}${n === 1 ? "" : "s"}` : "");
  return [part(d, "day"), part(h % 24, "hour"), part(min % 60, "min")].filter(Boolean).join(", ") || "just now";
}

function lines() {
  const P = Services.prefs, out = [];
  const W = win.gZenWorkspaces, tabs = [...new Set(W?.allStoredTabs ?? gBrowser.tabs)].filter(t => !t.hasAttribute("zen-empty-tab") && !t.hasAttribute("zen-glance-tab"));
  const asleep = tabs.filter(t => t.hasAttribute("pending") || !t.linkedPanel).length;
  const app = Services.appinfo;
  out.push(["Browser", `${app.name} ${app.version} (Firefox ${app.platformVersion.split(".")[0]})`]);
  out.push(["Zenith", `${win.ZenithVersion ?? "?"}${win.ZenithBar ? " + Plus" : ""}`]);
  out.push(["OS", os()]);
  try {
    out.push(["Uptime", since(Date.now() - Services.startup.getStartupInfo().process.getTime())]);
  } catch {}
  out.push(["Spaces", `${W?.getWorkspaces?.().length ?? 1}`]);
  out.push(["Tabs", `${tabs.length - asleep} awake, ${asleep} asleep`]);
  out.push(["Memory", "…"]);
  const L = win.ZenithLayouts;
  if (L) out.push(["Layout", `${L.NAMES[L.of()]} (this space)`]);
  const bars = ["top", "bottom", "left", "right"].filter(e => (P.getStringPref(`zenith.bar.${e}`, "") || "off") !== "off");
  out.push(["Bar", bars.length ? `${bars.join(", ")} · ${P.getStringPref("zenith.bar.style", "") || "islands"}` : "none"]);
  out.push(["Sidebar", P.getStringPref("zenith.sidebar", "") || "shown"]);
  const pal = P.getStringPref("zenith.palette", "");
  out.push(["Palette", pal && pal !== "own" ? pal : "your own colours"]);
  out.push(["Scheme", win.document.documentElement.getAttribute("zen-should-be-dark-mode") === "true" ? "dark" : "light"]);
  const font = win.getComputedStyle(win.document.querySelector(".zenith-bar") ?? win.document.documentElement).fontFamily.split(",")[0].replace(/"/g, "");
  out.push(["Font", font]);
  out.push(["Display", `${win.screen.width}×${win.screen.height} @ ${win.devicePixelRatio}x`]);
  const K = win.ZenithShell?.keys;
  if (K) out.push(["Shell keys", `${K.LIST.length} (${P.getStringPref("zenith.shell.bindings", "").split(",").filter(x => x.includes("=")).length} changed)`]);
  const rice = win.ZenithRice;
  if (rice) {
    let held = 0;
    try {
      held = JSON.parse(P.getStringPref("zenith.internal.rice.held", "") || "[]").length;
    } catch {}
    out.push(["Rice", held ? `~/.config/zenith/zenith.conf (${held} settings)` : "none (Settings › Shell › The rice file)"]);
  }
  return out;
}

function draw() {
  colours();
  $("logo").textContent = LOGO;
  const user = Services.env.get("USERNAME") || Services.env.get("USER") || "you";
  const who = $("who");
  who.append(make("b", user), "@", make("b", "zenith"));
  $("rule").textContent = "-".repeat(user.length + 7);
  const list = lines(), dl = $("lines");
  for (const [k, v] of list) dl.append(make("dt", k), make("dd", v));
  // (Memory: measured after the card is up.)
  const at = list.findIndex(([k]) => k === "Memory");
  // (Counted as the bar's memory module does: Windows' private working set
  // where Zenith can read it, Firefox's own figure otherwise.)
  win.ChromeUtils.requestProcInfo().then(info => {
    const all = [info, ...info.children], own = win.ZenithTabs?.Look?.privateSet?.();
    const s = { memory: all.reduce((a, p) => a + ((own && own(p.pid)) ?? p.memory ?? 0), 0), processes: all.length };
    const text = `${Math.round(s.memory / 1048576)} MB in ${s.processes} processes`;
    list[at][1] = text;
    dl.querySelectorAll("dd")[at].textContent = text;
  }).catch(() => {});
  // The palette's colours, as the two rows of a terminal's.
  const cs = getComputedStyle(document.documentElement), sw = $("swatches");
  const keys = ["base", "red", "green", "yellow", "accent", "second", "overlay", "text", "mantle", "surface"];
  const have = keys.map(k => cs.getPropertyValue(`--zth-pal-${k}`).trim()).filter(Boolean);
  const row = have.length ? have : ["#1e1e2e", "#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa", "#cba6f7", "#94e2d5", "#cdd6f4"];
  for (const c of [...row, ...row.map(c => `color-mix(in srgb, ${c} 70%, white)`)].slice(0, 16)) {
    const s = make("span");
    s.style.background = c;
    sw.append(s);
  }
  $("copy").addEventListener("click", () => {
    const text = [`${user}@zenith`, "-".repeat(user.length + 7), ...list.map(([k, v]) => `${k}: ${v}`)].join("\n");
    const logo = LOGO.split("\n"), body = text.split("\n"), n = Math.max(logo.length, body.length);
    const both = Array.from({ length: n }, (_, i) => `${(logo[i] ?? "").padEnd(18)}  ${body[i] ?? ""}`).join("\n");
    Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString(both);
    $("note").textContent = "Copied.";
  });
}

draw();
