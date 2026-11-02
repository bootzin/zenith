/* --- Media art: the cover of what's playing, behind its media card -------
   Most music and video sites give the browser cover art (Media Session
   metadata); Firefox uses it for the system's media controls. Zen's media
   cards at the foot of the sidebar show only the title and buttons, so the
   art is read from the playing tab and set as --zth-media-art on its card,
   with its average colour as --zth-media-tint. Cards don't say which tab
   they belong to, so a card is matched by the title and artist it shows.
   The image is fetched without cookies and shown from a local copy. */
const MediaArt = {
  PREF: "zenith.plus.media-art",
  copies: new Map(), // art address -> Promise<{ url, tint }>

  init() {
    window.ZenithMediaArt = this; // the Dash's media card: copy(src)
    const bar = document.getElementById("zen-media-controls-toolbar");
    if (!bar) return;
    const schedule = () => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.update(bar), 250);
    };
    const mo = new MutationObserver(schedule);
    mo.observe(bar, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["value"] });
    Services.prefs.addObserver(this.PREF, schedule);
    onUnload(() => {
      mo.disconnect();
      Services.prefs.removeObserver(this.PREF, schedule);
      for (const copy of this.copies.values()) copy.then(c => c && URL.revokeObjectURL(c.url));
    });
    schedule();
  },

  async update(bar) {
    const on = Services.prefs.getBoolPref(this.PREF, true);
    for (const card of bar.querySelectorAll(".zen-media-card")) {
      // (In another space the card can't always be matched to its tab: the
      // art it had for the same title stays.)
      const title = this.text(card, ".zen-media-title");
      let src = on ? this.artFor(card) : null;
      if (on && !src && title && this.lastArt?.title === title) src = this.lastArt.src;
      if (src) this.lastArt = { title, src };
      if (src === card.zenithArtSrc) continue;
      card.zenithArtSrc = src;
      const copy = src ? await this.copy(src) : null;
      if (card.zenithArtSrc !== src) continue; // changed while loading
      if (copy) {
        card.style.setProperty("--zth-media-art", `url("${copy.url}")`);
        if (copy.tint) card.style.setProperty("--zth-media-tint", copy.tint);
        card.setAttribute("zenith-art", "true");
      } else {
        card.removeAttribute("zenith-art");
        card.style.removeProperty("--zth-media-art");
        card.style.removeProperty("--zth-media-tint");
      }
    }
  },

  text(card, cls) {
    const label = card.querySelector(cls);
    return (label?.value || label?.textContent || "").trim();
  },

  // The biggest artwork of the playing tab whose title and artist the card shows.
  artFor(card) {
    const title = this.text(card, ".zen-media-title");
    const artist = this.text(card, ".zen-media-artist");
    if (!title) return null;
    const area = a => a.sizes?.split(/\s+/).map(s => s.split("x").reduce((x, y) => x * y, 1)).reduce((x, y) => Math.max(x, y), 0) || 0;
    for (const tab of gBrowser.tabs) {
      const controller = tab.linkedBrowser?.browsingContext?.mediaController;
      if (!controller?.isActive) continue;
      let meta;
      try {
        meta = controller.getMetadata();
      } catch {
        continue; // no metadata
      }
      if (meta.title !== title || (artist && meta.artist !== artist)) continue;
      const art = [...(meta.artwork ?? [])].filter(a => /^(https?|data|blob):/.test(a.src ?? "")).sort((a, b) => area(b) - area(a))[0];
      return art?.src ?? null;
    }
    return null;
  },

  copy(src) {
    if (!this.copies.has(src)) {
      this.copies.set(src, (async () => {
        try {
          const res = await fetch(src, { credentials: "omit" });
          if (!res.ok) return null;
          const blob = await res.blob();
          if (!blob.type.startsWith("image/")) return null;
          const url = URL.createObjectURL(blob);
          return { url, tint: await this.tint(url) };
        } catch (e) {
          console.warn("[Zenith] media art", e);
          return null;
        }
      })());
    }
    return this.copies.get(src);
  },

  // The image's average colour (ignoring transparent pixels).
  tint(url) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = el("canvas");
          canvas.width = canvas.height = 6;
          const g = canvas.getContext("2d");
          g.drawImage(img, 0, 0, 6, 6);
          const d = g.getImageData(0, 0, 6, 6).data;
          let r = 0, gr = 0, b = 0, n = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 128) continue;
            r += d[i];
            gr += d[i + 1];
            b += d[i + 2];
            n++;
          }
          resolve(n ? `rgb(${Math.round(r / n)} ${Math.round(gr / n)} ${Math.round(b / n)})` : null);
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  },
};

