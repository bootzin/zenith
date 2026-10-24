// SPDX-License-Identifier: GPL-3.0-or-later
// The rice file: ~/.config/zenith/zenith.conf (C:\Users\you\.config\zenith on
// Windows), your whole setup in Hyprland's config language (hyprlang), to
// keep in your dotfiles and share. Read at start, on Alt+Shift+C, and when
// the window comes back to the front after the file changed.
//
//   # comments; ## is a #
//   $mod = ALT                      variables, used as $mod
//   palette = catppuccin-mocha      zenith.palette
//   sidebar = hover                 zenith.sidebar
//   bar {                           zenith.bar.*: style, size, font, clock…
//       style = islands
//       tab_look = fit              (_ for -: zenith.bar.tab-look)
//       top {                       a bar on the top edge
//           modules = launcher spaces mode | title | media clock buttons
//           hide = false
//       }
//   }
//   shell:layout = scroller         a:b:c = … is the same as a { b { c = … } }
//   bind = $mod SHIFT, H, move-left the Shell's keys (an action of Alt+Shift+/'s list)
//   unbind = hints                  that action without a key
//   source = ~/.config/zenith/keys.conf   another file, read there
//
// Any of Zenith's settings is `section { name = value }` for zenith.section.name
// (Settings › Speed and AI lists the names in each setting's tooltip). On
// and off settings take true or false.
//
// What the settings page does with a setting the file holds (Settings ›
// Zenith › The rice file): changes it in the file too, keeping the rest of
// the line and its comments (as it comes), or shows it locked.

const P = Services.prefs;
// (zenith.internal.rice.home: another home folder, for tools/checks.)
const HOME = () => Services.prefs.getStringPref("zenith.internal.rice.home", "") || Services.dirsvc.get("Home", Ci.nsIFile).path;
export const PATH = () => PathUtils.join(HOME(), ".config", "zenith", "zenith.conf");
const HELD = "zenith.internal.rice.held"; // the settings the file held last time: [name…]

/* --- Reading ------------------------------------------------------------------------ */
// Every `name = value` line of a file (and the files it sources), with where
// it is, so a value can be written back in place.
async function parse(path, vars = new Map(), out = [], depth = 0) {
  if (depth > 8 || !(await IOUtils.exists(path))) return out;
  const text = await IOUtils.readUTF8(path), lines = text.split(/\r?\n/), stack = [];
  lines.forEach((raw, n) => {
    // (A comment starts at an unpaired #; ## is a # in a value.)
    let line = "", i = 0;
    for (; i < raw.length; i++) {
      if (raw[i] === "#") {
        if (raw[i + 1] === "#") {
          line += "#";
          i++;
          continue;
        }
        break;
      }
      line += raw[i];
    }
    const t = line.trim();
    if (!t) return;
    if (t === "}") return void stack.pop();
    const inline = t.match(/^([\w.:-]+)\s*\{(.*)\}$/);
    if (inline) {
      for (const part of inline[2].split(";")) {
        const m = part.trim().match(/^([\w.:-]+)\s*=\s*(.*)$/);
        if (m) out.push({ path: [...stack, inline[1], ...m[1].split(":")], value: m[2].trim().replace(/\$\w+/g, v => vars.get(v) ?? v), at: { path, line: n, used: true } });
      }
      return;
    }
    const open = t.match(/^([\w.:-]+)\s*\{$/);
    if (open) return void stack.push(open[1]);
    const m = t.match(/^(\$?[\w.:-]+)\s*=\s*(.*)$/);
    if (!m) return void out.push({ error: `${PathUtils.filename(path)}:${n + 1}: ${t}` });
    let [, key, value] = m;
    value = value.trim();
    if (key.startsWith("$")) return void vars.set(key, value);
    const used = /\$\w+/.test(value);
    value = value.replace(/\$\w+/g, v => vars.get(v) ?? v);
    const at = { path, line: n, start: raw.indexOf("=") + 1, end: i, used };
    out.push({ path: [...stack, ...key.split(":")], value, at });
  });
  // (source = …, relative to the file it's in.)
  for (const e of [...out]) {
    if (e.path?.length === 1 && e.path[0] === "source" && e.at.path === path) {
      let to = e.value.replace(/^~(?=[\\/])/, HOME());
      if (!/^([a-zA-Z]:)?[\\/]/.test(to)) to = PathUtils.join(PathUtils.parent(path), ...to.split(/[\\/]/));
      await parse(to, vars, out, depth + 1);
    }
  }
  return out;
}

const BOOL = { true: true, yes: true, false: false, no: false };
const EDGES = ["top", "bottom", "left", "right"];

// The setting a line is for, and its value; or null.
function setting(path, value) {
  const p = path.map(x => x.replace(/_/g, "-"));
  if (p[0] === "source" || p[0] === "bind" || p[0] === "unbind") return null;
  if (p.length === 1 && (p[0] === "palette" || p[0] === "sidebar")) return [`zenith.${p[0]}`, value];
  // bar { top { modules = … ; hide = … } }
  if (p[0] === "bar" && EDGES.includes(p[1]) && p.length === 3) {
    if (p[2] === "modules") return [`zenith.bar.${p[1]}.modules`, value.split("|").map(x => x.trim().split(/[\s,]+/).filter(Boolean).join(",")).join("|")];
    if (p[2] === "hide") return [`zenith.bar.hide-${p[1]}`, value];
    if (p[2] === "show") return [`zenith.bar.${p[1]}`, BOOL[value.toLowerCase()] === false ? "off" : "on"];
  }
  return [`zenith.${p.join(".")}`, value];
}

// A key as the Shell writes it: "ALT SHIFT, H" → "Alt+Shift+KeyH".
const KEYS = { return: "Enter", enter: "Enter", space: "Space", tab: "Tab", minus: "Minus", equal: "Equal", semicolon: "Semicolon", slash: "Slash",
               grave: "Backquote", backquote: "Backquote", comma: "Comma", period: "Period", left: "ArrowLeft", right: "ArrowRight", up: "ArrowUp", down: "ArrowDown" };
function combo(mods, key) {
  const m = mods.toUpperCase().split(/[\s+_]+/).filter(Boolean);
  const names = { ALT: "Alt", SHIFT: "Shift", CTRL: "Ctrl", CONTROL: "Ctrl", SUPER: "Meta", WIN: "Meta", META: "Meta" };
  const parts = ["Ctrl", "Alt", "Shift", "Meta"].filter(x => m.some(y => names[y] === x));
  const k = key.trim(), low = k.toLowerCase();
  const code = /^[a-z]$/i.test(k) ? `Key${k.toUpperCase()}` : /^\d$/.test(k) ? `Digit${k}` : /^f\d{1,2}$/i.test(k) ? k.toUpperCase() : KEYS[low] ?? k;
  return [...parts, code].join("+");
}

/* --- The rice -------------------------------------------------------------------------- */
export const Rice = {
  lines: [], // what the file holds: { name, value, at }
  errors: [],

  get mode() {
    return P.getStringPref("zenith.rice.mode", "") === "locked" ? "locked" : "write";
  },

  held() {
    try {
      return new Set(JSON.parse(P.getStringPref(HELD, "") || "[]"));
    } catch {
      return new Set();
    }
  },

  // The file read and its settings set; true if there's a file.
  async load(tell = false) {
    const path = PATH();
    if (!(await IOUtils.exists(path))) {
      this.lines = [];
      P.clearUserPref(HELD);
      if (tell) window.ZenithHint?.(`No ${path} yet: Settings › Shell › The rice file writes one`);
      return false;
    }
    this.stamp = (await IOUtils.stat(path)).lastModified;
    const entries = await parse(path);
    this.errors = entries.filter(e => e.error).map(e => e.error);
    const lines = [], binds = new Map();
    for (const e of entries) {
      if (e.error || !e.path) continue;
      const head = e.path[0];
      if (head === "bind" && e.path.length === 1) {
        const [mods = "", key = "", action = ""] = e.value.split(",").map(x => x.trim());
        if (action) binds.set(action, key ? combo(mods, key) : "");
        continue;
      }
      if (head === "unbind" && e.path.length === 1) {
        binds.set(e.value.trim(), "");
        continue;
      }
      const s = setting(e.path, e.value);
      if (s) lines.push({ name: s[0], value: s[1], at: e.at });
    }
    // A bar with any of its lines is on (unless it says show = false).
    for (const edge of EDGES) {
      if (lines.some(l => l.name === `zenith.bar.${edge}.modules` || l.name === `zenith.bar.hide-${edge}`) && !lines.some(l => l.name === `zenith.bar.${edge}`)) {
        lines.push({ name: `zenith.bar.${edge}`, value: "on", at: null });
      }
    }
    if (binds.size) lines.push({ name: "zenith.shell.bindings", value: [...binds].map(([a, c]) => `${a}=${c}`).join(", "), at: null });
    this.lines = lines;
    this.applying = true;
    try {
      for (const l of lines) this.set(l.name, l.value);
      // Settings the file held before and doesn't now: back as they come.
      const now = new Set(lines.map(l => l.name));
      for (const name of this.held()) if (!now.has(name)) P.clearUserPref(name);
      if (now.size) P.setStringPref(HELD, JSON.stringify([...now]));
      else P.clearUserPref(HELD);
    } finally {
      this.applying = false;
    }
    if (tell) {
      window.ZenithHint?.(this.errors.length ? `zenith.conf read, but ${this.errors.length} line(s) aren't name = value: ${this.errors[0]}` : `zenith.conf read: ${lines.length} settings`);
    }
    return true;
  },

  set(name, value) {
    if (!name.startsWith("zenith.")) return;
    const type = P.getPrefType(name), low = String(value).toLowerCase();
    try {
      if (type === P.PREF_BOOL || (type === P.PREF_INVALID && low in BOOL)) {
        if (P.getPrefType(name) !== P.PREF_BOOL || P.getBoolPref(name) !== BOOL[low]) P.setBoolPref(name, !!BOOL[low]);
      } else if (type === P.PREF_INT) {
        if (P.getIntPref(name) !== parseInt(value, 10)) P.setIntPref(name, parseInt(value, 10) || 0);
      } else if (P.getStringPref(name, "\u0000") !== String(value)) P.setStringPref(name, String(value));
    } catch (e) {
      console.error(`[Zenith] zenith.conf: ${name}`, e);
    }
  },

  // A setting changed on the settings page: the same change in the file, in
  // its line (a value that came from a $variable is left to you).
  async written(name) {
    if (this.applying || this.mode !== "write") return;
    const line = this.lines.find(l => l.name === name);
    if (!line?.at || line.at.used) return;
    const type = P.getPrefType(name);
    let value = type === P.PREF_BOOL ? String(P.getBoolPref(name)) : type === P.PREF_INT ? String(P.getIntPref(name)) : P.getStringPref(name, "");
    if (!P.prefHasUserValue(name) && type !== P.PREF_BOOL) value = "";
    if (name.endsWith(".modules")) value = value.split("|").map(x => x.split(",").filter(Boolean).join(" ")).join(" | ");
    if (value === line.value) return;
    try {
      const text = await IOUtils.readUTF8(line.at.path), rows = text.split(/(\r?\n)/);
      const r = line.at.line * 2, old = rows[r];
      if (old === undefined) return;
      rows[r] = `${old.slice(0, line.at.start)} ${value}${old.slice(line.at.end).replace(/^\s*(?=#)/, " ")}`.replace(/\s+$/, "");
      await IOUtils.writeUTF8(line.at.path, rows.join(""));
      line.value = value;
      this.stamp = (await IOUtils.stat(PATH())).lastModified;
    } catch (e) {
      console.error("[Zenith] zenith.conf: writing back", e);
    }
  },

  // Changed since it was read (another app saved it)?
  async changed() {
    try {
      return (await IOUtils.stat(PATH())).lastModified !== this.stamp;
    } catch {
      return false;
    }
  },
};

/* --- Writing a whole setup ------------------------------------------------------------- */
// Every Zenith setting you've changed, as a zenith.conf: sections by name,
// bars as blocks, the Shell's keys as binds.
export async function exportFile(path = PATH()) {
  const D = P.getDefaultBranch("");
  const value = n => (P.getPrefType(n) === P.PREF_BOOL ? String(P.getBoolPref(n)) : P.getPrefType(n) === P.PREF_INT ? String(P.getIntPref(n)) : P.getStringPref(n, ""));
  const asItComes = n => {
    const type = P.getPrefType(n);
    try {
      if (type === P.PREF_BOOL) return D.getPrefType(n) === P.PREF_BOOL ? D.getBoolPref(n) === P.getBoolPref(n) : P.getBoolPref(n) === false;
      if (type === P.PREF_INT) return D.getPrefType(n) === P.PREF_INT && D.getIntPref(n) === P.getIntPref(n);
      return P.getStringPref(n, "") === (D.getPrefType(n) === P.PREF_STRING ? D.getStringPref(n) : "");
    } catch {
      return false;
    }
  };
  const names = P.getChildList("zenith.").filter(n => !n.startsWith("zenith.internal.") && n !== "zenith.rice.mode" && P.prefHasUserValue(n) && !asItComes(n));
  let version = "";
  try {
    version = window.ZenithVersion ?? "";
  } catch {}
  const out = ["# Zenith's rice file: hyprlang (Hyprland's config language). Alt+Shift+C reads it again.",
               `# Written by Zenith ${version} on ${new Date().toISOString().slice(0, 10)}.`, "", "$mod = ALT", ""];
  const top = ["zenith.palette", "zenith.sidebar"];
  for (const n of top) if (names.includes(n)) out.push(`${n.slice(7)} = ${value(n)}`);
  // Bars
  const bar = names.filter(n => n.startsWith("zenith.bar.") && !EDGES.some(e => n === `zenith.bar.${e}` || n === `zenith.bar.${e}.modules` || n === `zenith.bar.hide-${e}`));
  const edges = EDGES.filter(e => names.includes(`zenith.bar.${e}`) || names.includes(`zenith.bar.${e}.modules`));
  if (bar.length || edges.length) {
    out.push("", "bar {");
    for (const n of bar) out.push(`    ${n.slice(11).replace(/-/g, "_")} = ${value(n)}`);
    for (const e of edges) {
      const on = (P.getStringPref(`zenith.bar.${e}`, "") || "off") !== "off";
      out.push(`    ${e} {`, `        show = ${on}`);
      const list = P.getStringPref(`zenith.bar.${e}.modules`, "");
      if (list) out.push(`        modules = ${list.split("|").map(x => x.split(",").filter(Boolean).join(" ")).join(" | ")}`);
      if (P.prefHasUserValue(`zenith.bar.hide-${e}`)) out.push(`        hide = ${P.getBoolPref(`zenith.bar.hide-${e}`, false)}`);
      out.push("    }");
    }
    out.push("}");
  }
  // Every other section
  const rest = names.filter(n => !top.includes(n) && !n.startsWith("zenith.bar.") && n !== "zenith.shell.bindings");
  const groups = new Map();
  for (const n of rest) {
    const [, section, ...name] = n.split(".");
    if (!name.length) continue;
    if (!groups.has(section)) groups.set(section, []);
    groups.get(section).push([name.join(".").replace(/-/g, "_"), value(n)]);
  }
  for (const [section, list] of groups) {
    out.push("", `${section} {`);
    for (const [name, v] of list) out.push(`    ${name} = ${v.replace(/#/g, "##")}`);
    out.push("}");
  }
  // Keys you changed
  const binds = P.getStringPref("zenith.shell.bindings", "").split(",").map(x => x.trim()).filter(x => x.includes("="));
  if (binds.length) {
    out.push("", "# The Shell's keys you changed (Alt+Shift+/ lists them all)");
    for (const b of binds) {
      const [action, c] = b.split("=");
      if (!c) out.push(`unbind = ${action}`);
      else {
        const parts = c.split("+"), key = parts.pop().replace(/^Key|^Digit/, "");
        out.push(`bind = ${parts.map(x => x.toUpperCase().replace("META", "SUPER")).join(" ")}, ${key}, ${action}`);
      }
    }
  }
  await IOUtils.makeDirectory(PathUtils.parent(path), { createAncestors: true });
  await IOUtils.writeUTF8(path, out.join("\n") + "\n");
  return path;
}
