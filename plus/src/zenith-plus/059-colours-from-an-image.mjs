/* --- Colours from an image ---------------------------------------------------
   Pick a picture (or use your wallpaper): Zenith finds its colours and gives
   them to the current space, as Zen's own theme picker would. The space's
   earlier colours are kept for "undo" (":colours undo" in the switcher), and
   Zen's theme picker can change them as usual.
   How the colours are found, much as wallust and pywal find a terminal's:
   the picture is shrunk to 64×64 and its pixels grouped by k-means in OKLab
   (where distances match what the eye sees); shades of one hue are gathered
   together, and each hue is scored by how much of the picture it covers and
   how vivid its most colourful pixels are. One, two or three hues come out:
   another only when it's clearly a different hue and covers enough of the
   picture to matter (a grey picture gives one grey). Then each is made into
   a colour Zen shows well: vivid enough to read as that hue, all at one
   lightness, chosen so Zen keeps your light or dark text. */
const ImageColours = {
  init() {
    const commandset = document.createXULElement("commandset");
    for (const [id, fn] of [["zenith-colours-image", () => this.pickFile()],
                            ["zenith-colours-wallpaper", () => this.fromWallpaper()],
                            ["zenith-colours-undo", () => this.undo()]]) {
      const command = document.createXULElement("command");
      command.id = id;
      command.addEventListener("command", fn);
      commandset.append(command);
    }
    root.append(commandset);
    window.ZenithColours = this; // the switcher's :colours, and tools/checks
  },

  pickFile() {
    const fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
    fp.init(window.browsingContext, "Colours from an image", Ci.nsIFilePicker.modeOpen);
    fp.appendFilters(Ci.nsIFilePicker.filterImages);
    fp.open(result => {
      if (result === Ci.nsIFilePicker.returnOK && fp.file) this.fromFile(fp.file.path);
    });
  },

  async fromFile(path) {
    try {
      const bitmap = await createImageBitmap(new Blob([await IOUtils.read(path)]));
      return this.apply(bitmap, PathUtils.filename(path));
    } catch (e) {
      console.error("[Zenith] colours from an image", e);
      hint("That file isn't a picture Zen can read");
      return null;
    }
  },

  async fromWallpaper() {
    if (!Wallpaper.url) {
      hint("No wallpaper to read: Window material isn't Wallpaper");
      return null;
    }
    const bitmap = await createImageBitmap(await (await fetch(Wallpaper.url)).blob());
    return this.apply(bitmap, "your wallpaper");
  },

  // sRGB (0–255) to OKLab and back (Björn Ottosson's matrices).
  lab([r, g, b]) {
    const lin = v => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const [R, G, B] = [lin(r), lin(g), lin(b)];
    const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
    const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
    const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  },

  // OKLCH to sRGB, with the chroma eased down until it fits.
  rgb(L, C, h) {
    const toRgb = C => {
      const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
      const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
      const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
      const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
      return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
              -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
              -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
    };
    let lin = toRgb(C);
    while (C > 0 && lin.some(v => v < -0.0005 || v > 1.0005)) lin = toRgb((C = Math.max(0, C - 0.004)));
    const enc = v => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)));
    return lin.map(enc);
  },

  // The picture's hues, most striking first: [{L, C, h, share, score}].
  palette(bitmap) {
    const N = 64;
    const canvas = document.createElementNS(HTML_NS, "canvas");
    canvas.width = canvas.height = N;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, N, N);
    const data = ctx.getImageData(0, 0, N, N).data;
    const px = [];
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 128) px.push(this.lab([data[i], data[i + 1], data[i + 2]]));
    if (!px.length) return [];
    // k-means, started from the pixels farthest apart (so a small patch of
    // a clearly different colour gets its own group).
    const K = 8;
    const d2 = (p, c) => (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
    const near = px.map(() => Infinity);
    let centres = [[...px[Math.floor(px.length / 2)]]];
    while (centres.length < K) {
      const c = centres.at(-1);
      let far = 0;
      px.forEach((p, i) => {
        near[i] = Math.min(near[i], d2(p, c));
        if (near[i] > near[far]) far = i;
      });
      if (!near[far]) break; // fewer colours than groups
      centres.push([...px[far]]);
    }
    const owner = new Int32Array(px.length);
    let groups;
    for (let round = 0; round < 12; round++) {
      groups = centres.map(() => []);
      px.forEach((p, i) => {
        let best = 0, dist = Infinity;
        centres.forEach((c, k) => {
          const d = d2(p, c);
          if (d < dist) [best, dist] = [k, d];
        });
        owner[i] = best;
        groups[best].push(p);
      });
      centres = groups.map((g, k) => (g.length ? [0, 1, 2].map(j => g.reduce((n, p) => n + p[j], 0) / g.length) : centres[k]));
    }
    // Each group by its vivid side (the more colourful 40% of its pixels):
    // an average of a whole group is always duller than what you see.
    const found = groups.filter(g => g.length).map(g => {
      const top = g.map(p => [Math.hypot(p[1], p[2]), p]).sort((x, y) => y[0] - x[0])
        .slice(0, Math.max(1, Math.ceil(g.length * 0.4))).map(([, p]) => p);
      const [L, a, b] = [0, 1, 2].map(j => top.reduce((n, p) => n + p[j], 0) / top.length);
      return { L, C: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360, share: g.length / px.length };
    });
    const gap = (x, y) => Math.min(Math.abs(x - y), 360 - Math.abs(x - y));
    // Shades of one hue count together; the most vivid speaks for them.
    const hues = [];
    for (const f of found.filter(f => f.C >= 0.03).sort((x, y) => y.share * y.C - x.share * x.C)) {
      const same = hues.find(h => gap(h.h, f.h) < 24);
      if (!same) hues.push({ ...f });
      else {
        same.share += f.share;
        if (f.C > same.C) Object.assign(same, { L: f.L, C: f.C, h: f.h });
      }
    }
    if (!hues.length) {
      // A grey picture: one grey, as light as most of it.
      const most = found.sort((x, y) => y.share - x.share)[0];
      this.lastHues = [];
      return [{ L: most.L, C: 0, h: 0, share: 1, score: 1 }];
    }
    for (const h of hues) h.score = Math.sqrt(h.share) * (0.2 + h.C / 0.1);
    hues.sort((x, y) => y.score - x.score);
    this.lastHues = hues; // for tools/checks
    const chosen = [hues[0]];
    for (const h of hues.slice(1)) {
      if (chosen.length === 3) break;
      const enough = 0.2 * chosen[0].score;
      if (h.score >= enough && chosen.every(c => gap(c.h, h.h) >= 30)) chosen.push(h);
    }
    return chosen;
  },

  // The hues as colours for Zen: chroma lifted a quarter (0.07–0.2, so even
  // a muted picture gives a clear tint), all at one lightness, as Zen's own
  // picker does. Zen chooses light or dark text from the main colour, so the
  // lightness moves until it keeps yours.
  colours(hues) {
    const picker = window.gZenThemePicker;
    const dark = picker?.isDarkMode ?? true;
    const make = L => hues.map(f => this.rgb(L, f.C ? Math.min(0.2, Math.max(0.07, f.C * 1.25)) : 0, f.h));
    let L = dark ? 0.56 : 0.78, rgb = make(L);
    for (let i = 0; i < 12 && picker?.shouldBeDarkMode && picker.shouldBeDarkMode(rgb[0]) !== dark; i++) rgb = make((L += dark ? -0.03 : 0.03));
    return rgb;
  },

  // This space's colours from a picture (or, from palette sync, every
  // space's, or this one's: `spaces`).
  apply(bitmap, from, spaces = null) {
    const hues = this.palette(bitmap);
    bitmap.close?.();
    const W = window.gZenWorkspaces, picker = window.gZenThemePicker;
    const active = W?.getActiveWorkspace?.();
    spaces ??= active ? [active] : [];
    if (!hues.length || !spaces.length || !picker) {
      hint("Couldn't find colours there");
      return null;
    }
    const colours = this.colours(hues);
    this.previous = spaces.map(s => ({ uuid: s.uuid, theme: structuredClone(s.theme) }));
    const [r, g, b] = colours[0].map(v => v / 255);
    const lightness = Math.round(((Math.max(r, g, b) + Math.min(r, g, b)) / 2) * 100);
    const dots = colours.map((c, i) => ({ c, isCustom: false, isPrimary: i === 0, algorithm: "floating", lightness, type: "explicit-lightness" }));
    for (const space of spaces) {
      const opacity = space.theme?.opacity ?? 0.5, texture = space.theme?.texture ?? 0;
      space.theme = picker.constructor.getTheme?.(structuredClone(dots), opacity, texture) ?? { type: "gradient", gradientColors: structuredClone(dots), opacity, texture };
      W.saveWorkspace(space);
    }
    if (active) picker.onWorkspaceChange(active);
    hint(`${spaces.length > 1 ? "Spaces' colours" : "Space colours"} from ${from}: ${colours.length === 1 ? "one colour" : `${colours.length} colours`}`);
    return colours;
  },

  // (previous: one space, or every space after a palette sync.)
  undo() {
    const W = window.gZenWorkspaces;
    const prev = [this.previous ?? []].flat().map(p => [W?.getWorkspaceFromId(p.uuid), p.theme]).filter(([s]) => s);
    if (!prev.length) return hint("Nothing to undo");
    for (const [space, theme] of prev) {
      space.theme = theme;
      W.saveWorkspace(space);
      if (W.activeWorkspace === space.uuid) gZenThemePicker.onWorkspaceChange(space);
    }
    this.previous = null;
    hint(prev.length > 1 ? "Every space's colours put back" : "Space colours put back");
  },
};

