// ==UserScript==
// @name           Zenith local AI
// @description    Zenith Plus: Firefox's own on-device AI for clearer download names and tab groups by topic. Nothing leaves your computer.
// @include        main
// @version        0.14.0
// ==/UserScript==
// SPDX-License-Identifier: GPL-3.0-or-later

// Zenith's local AI uses the AI built into Firefox (Zen turns it off; with
// Local AI on, Zenith turns it on and gives it back when you turn it off).
// The models run in a process of their own, on this computer: nothing you
// download or open is sent anywhere. Each is fetched from Mozilla once,
// the first time it's needed.
//   - Download names: a finished download with a name like IMG_20241012_
//     0931.jpg or 8f3a2c1e.pdf gets a clearer one from where it came from
//     (the page's title and address): offered on a notice, or given at once
//     with Undo. A small language model (SmolLM2, about 380 MB).
//   - Topic groups: the tab manager can sort a space's loose tabs into groups
//     by what they're about, named for it (Firefox's smart tab groups
//     models, about 60 MB). Nothing moves until you say so.
// Settings: Zenith › Speed and AI. Styles: plus/chrome.css (the notices).

const HTML_NS = "http://www.w3.org/1999/xhtml";
const AI_PREF = "zenith.plus.local-ai";
const NAMES_PREF = "zenith.plus.ai-download-names";

const FIRST = !window.zenithAIStarted;
window.zenithAIStarted = true;

// Fast start (zenith.plus.fast-start): parts not needed for the first
// picture wait until the page you're on has loaded (2.5 seconds at most),
// then start one at a time while the browser is idle, so the page comes
// first. Anything that needs one of them sooner calls zenithLater.now().
const Later = (window.zenithLater ??= (() => {
  const queue = [];
  let open = false;
  const fast = Services.prefs.getBoolPref("zenith.plus.fast-start", false);
  const step = () => {
    const job = queue.shift();
    if (job) job();
    if (queue.length) window.requestIdleCallback(step, { timeout: 300 });
  };
  const later = {
    fast,
    add(job) {
      if (!fast || open) return job();
      queue.push(job);
    },
    // Start what's waiting, a part per idle moment.
    open() {
      if (open) return;
      open = true;
      later.openedAt ??= performance.now();
      window.requestIdleCallback(step, { timeout: 300 });
    },
    // Start everything now (a feature was asked for before its turn).
    now() {
      open = true;
      later.openedAt ??= performance.now();
      while (queue.length) queue.shift()();
    },
  };
  if (fast) {
    setTimeout(() => later.open(), 2500);
    const waitForPage = async () => {
      await window.delayedStartupPromise;
      for (let i = 0; i < 25 && gBrowser.selectedBrowser?.webProgress?.isLoadingDocument; i++) {
        await new Promise(r => setTimeout(r, 100));
      }
      later.open();
    };
    waitForPage();
  }
  return later;
})());

function start(name, fn, now = false) {
  if (!FIRST) return;
  if (!now) return Later.add(() => start(name, fn, true));
  const t0 = performance.now();
  try {
    fn();
  } catch (e) {
    console.error(`[Zenith AI] ${name} failed to start`, e);
  }
  // How long each part took to start, for tools/bench_startup.py.
  (window.zenithStartup ??= []).push({ script: "ai", name, at: Math.round(t0), ms: +(performance.now() - t0).toFixed(1) });
}

function make(tag, attrs = {}, text = "") {
  const node = document.createElementNS(HTML_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text) node.textContent = text;
  return node;
}

const on = () => Services.prefs.getBoolPref(AI_PREF, false);

/* --- Firefox's AI, on while Local AI is ------------------------------------ */

const FirefoxAI = {
  // Through Plus's bridge, so your own value of the setting comes back.
  sync() {
    const bridge = window.ZenithBridge;
    if (!bridge) return;
    bridge.apply("ai", { "browser.ml.enable": on() ? true : null });
  },

  get ready() {
    return on() && Services.prefs.getBoolPref("browser.ml.enable", false);
  },
};

/* --- Notices with buttons -------------------------------------------------- */

// The same cards as Zenith's other notices (top right), with buttons; a
// card leaves on its own after `ms`, unless the pointer is on it.
function notice({ title, body, actions = [], ms = 12000 }) {
  let stack = document.getElementById("zenith-toasts");
  if (!stack) {
    stack = make("div", { id: "zenith-toasts" });
    (document.getElementById("zen-main-app-wrapper") ?? document.body).append(stack);
  }
  const card = make("div", { class: "zenith-toast zenith-ai-notice" });
  const close = () => card.remove();
  card.append(make("div", { class: "zenith-toast-title" }, title));
  const text = make("div", { class: "zenith-toast-body" }, body);
  card.append(text);
  if (actions.length) {
    const row = make("div", { class: "zenith-toast-actions" });
    for (const a of actions) {
      const b = make("button", { class: "zenith-toast-button" }, a.label);
      b.addEventListener("click", e => {
        e.stopPropagation();
        close();
        a.run();
      });
      row.append(b);
    }
    card.append(row);
  }
  card.addEventListener("click", close);
  let timer = setTimeout(close, ms);
  card.addEventListener("mouseenter", () => clearTimeout(timer));
  card.addEventListener("mouseleave", () => (timer = setTimeout(close, 4000)));
  stack.append(card);
  return {
    set(t, b) {
      card.firstChild.textContent = t;
      text.textContent = b;
    },
    close,
  };
}

/* --- A small language model --------------------------------------------------
   SmolLM2 360M through llama.cpp, the model and settings Firefox's own link
   previews use. Kept warm for two minutes after its last answer. */

const Model = {
  IDLE_MS: 120000,

  async engine(onProgress) {
    if (!FirefoxAI.ready) throw new Error("Local AI is off");
    clearTimeout(this.idle);
    if (!this.pending) {
      const { createEngine } = ChromeUtils.importESModule("chrome://global/content/ml/EngineProcess.sys.mjs");
      const { Progress } = ChromeUtils.importESModule("chrome://global/content/ml/Utils.sys.mjs");
      this.pending = createEngine(
        {
          backend: "llama.cpp",
          engineId: "zenith-ai-names",
          featureId: "link-preview",
          modelHubRootUrl: "https://model-hub.mozilla.org",
          modelId: "HuggingFaceTB/SmolLM2-360M-Instruct-GGUF",
          modelFile: "smollm2-360m-instruct-q8_0.gguf",
          modelRevision: "main",
          numContext: 1024,
          taskName: "llama-text-generation",
          timeoutMS: -1,
          useMlock: false,
          useMmap: false,
        },
        data => {
          if (data.type === Progress.ProgressType.DOWNLOAD && data.total) onProgress?.(Math.round((100 * data.totalLoaded) / data.total));
        }
      ).catch(e => {
        this.pending = null;
        throw e;
      });
    }
    return this.pending;
  },

  // One short answer to a conversation: [{ role, content }], usually an
  // instruction, a few worked examples, and the question. (The answer is
  // left to finish: an engine whose answer was cut off refuses the next.)
  async ask(messages, { nPredict = 24, onProgress } = {}) {
    const engine = await this.engine(onProgress);
    let text = "";
    try {
      for await (const chunk of engine.runWithGenerator({ nPredict, prompt: messages })) text += chunk.text ?? "";
    } finally {
      this.idle = setTimeout(() => this.close(), this.IDLE_MS);
    }
    return text;
  },

  async close() {
    const pending = this.pending;
    this.pending = null;
    try {
      await (await pending)?.terminate();
    } catch {}
  },
};

/* --- Download names ------------------------------------------------------------
   "suggest" offers the clearer name on a notice; "rename" renames the file
   straight away and offers Undo. Only names that say nothing are touched:
   camera and scanner names, long numbers and codes, "download (3)". */

const DownloadNames = {
  // An instruction and worked examples, as turns of a conversation (a
  // small model follows those far better than a description).
  PROMPT: [
    { role: "system", content: "You name downloaded files. Answer with a short, clear file name of 2 to 6 words that says what the file is, " +
                               "taken from the page it came from. No file extension, no quotes, no web address." },
    { role: "user", content: "Page title: Lisbon trip day 3 - Google Photos\nFile: IMG_20240812_093112.jpg" },
    { role: "assistant", content: "Lisbon trip day 3" },
    { role: "user", content: "Page title: Invoice #4821 - Acme Billing\nFile: 9f86d081884c7d65.pdf" },
    { role: "assistant", content: "Acme invoice 4821" },
    { role: "user", content: "Page title: Inter font family - rsms\nFile: download (2).zip" },
    { role: "assistant", content: "Inter font family" },
  ],

  init() {
    this.mode = () => (on() ? Services.prefs.getStringPref(NAMES_PREF, "") || "rename" : "off");
    this.started = Date.now();
    this.queue = Promise.resolve();
    const { Downloads } = ChromeUtils.importESModule("resource://gre/modules/Downloads.sys.mjs");
    this.view = {
      onDownloadAdded: d => this.seen(d),
      onDownloadChanged: d => this.changed(d),
    };
    Downloads.getList(Downloads.ALL).then(list => {
      this.list = list;
      list.addView(this.view);
    });
    window.addEventListener("unload", () => this.list?.removeView(this.view));
    (window.ZenithAI ??= {}).names = this;
  },

  // Only downloads that finish while Zen is open, and each once in all the
  // windows (the first to see it finish takes it).
  seen(d) {
    if (!d.succeeded && !d.zenithAISeen) d.zenithAISeen = true;
  },

  changed(d) {
    if (!d.succeeded || !d.zenithAISeen || d.zenithAITaken || d.canceled || d.error) return;
    if (Services.wm.getMostRecentWindow("navigator:browser") !== window) return;
    d.zenithAITaken = true;
    const mode = this.mode();
    if (mode === "off" || d.launchWhenSucceeded || !d.target?.path) return;
    this.queue = this.queue.then(() => this.handle(d, mode)).catch(e => console.error("[Zenith AI] download name", e));
  },

  // [name, .extension] of a path or a bare file name.
  split(path) {
    const name = /[\\/]/.test(path) ? PathUtils.filename(path) : path;
    const dot = name.lastIndexOf(".");
    return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  },

  // A name that says nothing about the file.
  // A name that says nothing: a camera's or a generic word ("images",
  // "download (3)"), long numbers, codes, random-looking letters, or a
  // string of short bits between dashes.
  GENERIC: /^(img|image|images|pic|pics|picture|pictures|photo|photos|dsc|dscn|pxl|vid|video|videos|mvimg|clip|audio|media|scan|scans|screenshot|screen shot|capture|snapshot|recording|download|downloads|file|files|document|documents|doc|docs|attachment|attachments|untitled|unnamed|unknown|export|output|data|new|temp|tmp|default|blob)(?=[\s_.\-\d(]|$)/i,

  vague(base) {
    const b = base.replace(/\s*\(\d+\)$/, "").replace(/\s*-?\s*copy$/i, "").trim();
    if (b.length < 4 || this.GENERIC.test(b)) return true;
    if (/^[0-9a-f-]{8,}$/i.test(b) || /\d{6,}/.test(b)) return true;
    const letters = (b.match(/\p{L}/gu) ?? []).length;
    if (letters < b.length * 0.5) return true;
    const bits = b.split(/[\s_.\-]+/).filter(Boolean);
    // Many short bits between dashes or underscores (a-b-c-d-e).
    if ((b.match(/[-_]/g) ?? []).length >= 4 && bits.reduce((n, x) => n + x.length, 0) / bits.length <= 5) return true;
    // Random-looking: letters and digits mixed, case flipping inside a
    // word, or hardly any vowels in a long run of letters.
    const random = x => x.length >= 6 && (/\d/.test(x) && /\p{L}/u.test(x) ||
      /\p{Ll}\p{Lu}.*\p{Ll}\p{Lu}/u.test(x) || (x.match(/[aeiouy]/gi) ?? []).length < x.length * 0.2);
    return bits.filter(random).length * 2 >= bits.length;
  },

  // What the download came from: the page's title if it's open in a tab.
  // (The page it came from: the tab showing the referring page, or else
  // the tab you're on if it's the same site, or any tab of that site. Its
  // own title, as the tab's label can lag behind.)
  context(d) {
    const url = d.source?.url ?? "";
    const referrer = d.source?.referrerInfo?.originalReferrer?.spec ?? d.source?.referrerInfo?.computedReferrerSpec ?? d.source?.referrer ?? "";
    const host = s => {
      try {
        return new URL(s).hostname.replace(/^www\./, "");
      } catch {
        return "";
      }
    };
    const site = host(referrer) || host(url);
    const tabs = [...Services.wm.getEnumerator("navigator:browser")].flatMap(w => w.gBrowser.tabs);
    const spec = t => t.linkedBrowser?.currentURI?.spec ?? "";
    const tab = tabs.find(t => referrer && spec(t) === referrer) ??
      (host(spec(gBrowser.selectedTab)) === site ? gBrowser.selectedTab : null) ??
      tabs.find(t => site && host(spec(t)) === site && spec(t) !== url);
    const title = (tab && (tab.linkedBrowser?.contentTitle || tab.label)) || "";
    return { title, from: site, path: (() => {
      try {
        return decodeURIComponent(new URL(url).pathname).slice(0, 120);
      } catch {
        return "";
      }
    })() };
  },

  // The model's answer as a file name.
  clean(text, ext) {
    let s = text.split("\n").map(l => l.trim()).find(Boolean) ?? "";
    s = s.replace(/^(name|file ?name)\s*:\s*/i, "").replace(/^["'`]+|["'`.]+$/g, "");
    if (ext && s.toLowerCase().endsWith(ext.toLowerCase())) s = s.slice(0, -ext.length);
    s = s.replace(/\b(?:https?:\/\/)?(?:[\w-]+\.)+[a-z]{2,}(?::\d+)?\S*|\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\S*/gi, " ");
    s = s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60).trim();
    return (s.match(/\p{L}/gu) ?? []).length >= 3 ? s : "";
  },

  async handle(d, mode) {
    const path = d.target.path;
    const [base, ext] = this.split(path);
    // (What happened to the last one, for tools/checks.)
    const trace = (this.trace = { file: base + ext, vague: this.vague(base) });
    if (!trace.vague || !(await IOUtils.exists(path))) return;
    const c = (trace.context = this.context(d));
    if (!c.title && !c.from) return;
    let progress = null;
    const about = c.title ? `Page title: ${c.title}` : `Site: ${c.from}${c.path}`;
    const answer = await Model.ask([...this.PROMPT, { role: "user", content: `${about}\nFile: ${base}${ext}` }], {
      onProgress: p => {
        progress ??= notice({ title: "Getting the AI model", body: "", ms: 600000 });
        progress.set("Getting the AI model", `${p}% · once, about 380 MB, kept on this computer`);
        if (p >= 100) progress.close();
      },
    });
    progress?.close();
    // A small model sometimes borrows words from its examples: every real
    // word of its answer has to come from the page's title, the file's name
    // or the address. Otherwise (or with no answer) the page's own title,
    // without the site's name after it, does nearly as well.
    const sources = `${c.title} ${base} ${c.from} ${c.path}`.toLowerCase();
    const grounded = s => (s.toLowerCase().match(/\p{L}{4,}/gu) ?? []).every(w => sources.includes(w));
    const said = this.clean(answer, ext);
    const name = (said && grounded(said) ? said : "") || this.clean(c.title.replace(/\s+[-|·–—:]\s+[^-|·–—:]*$/, ""), ext);
    Object.assign(trace, { answer, name });
    if (!name || name.toLowerCase() === base.toLowerCase()) return;
    this.last = { download: d, name }; // (for tools/checks)
    if (mode === "rename") {
      const to = await this.rename(d, name + ext);
      notice({
        title: "Download renamed",
        body: `${base}${ext} → ${PathUtils.filename(to)}`,
        actions: [{ label: "Undo", run: () => this.rename(d, base + ext).catch(e => console.error("[Zenith AI] undo", e)) }],
      });
    } else {
      notice({
        title: "A clearer name for your download",
        body: `${base}${ext} → ${name}${ext}`,
        actions: [
          { label: "Rename", run: () => this.rename(d, name + ext).catch(e => console.error("[Zenith AI] rename", e)) },
          { label: "Keep", run: () => {} },
        ],
      });
    }
  },

  // Renames the file beside where it is (never over another file), and
  // tells Firefox's downloads list and history where it went.
  async rename(d, filename) {
    const from = d.target.path;
    const dir = PathUtils.parent(from);
    const [base, ext] = this.split(filename);
    let to = PathUtils.join(dir, filename);
    for (let n = 2; to !== from && (await IOUtils.exists(to)); n++) to = PathUtils.join(dir, `${base} (${n})${ext}`);
    if (to === from) return to;
    await IOUtils.move(from, to, { noOverwrite: true });
    d.target.path = to;
    try {
      await d.refresh?.();
      d._notifyChange?.();
      const { DownloadHistory } = ChromeUtils.importESModule("resource://gre/modules/DownloadHistory.sys.mjs");
      await DownloadHistory.updateMetaData?.(d);
      if (!d.source?.isPrivate && d.source?.url) {
        const { PlacesUtils } = ChromeUtils.importESModule("resource://gre/modules/PlacesUtils.sys.mjs");
        if (PlacesUtils.history.canAddURI(PlacesUtils.toURI(d.source.url)) && (await PlacesUtils.history.fetch(d.source.url))) {
          await PlacesUtils.history.update({
            url: d.source.url,
            annotations: new Map([["downloads/destinationFileURI", PathUtils.toFileURI(to)]]),
          });
        }
      }
    } catch (e) {
      console.warn("[Zenith AI] the downloads list may show the old name until Zen restarts", e);
    }
    return to;
  },
};

/* --- Topic groups (for the tab manager) ------------------------------------------
   Firefox's smart tab groups models: tabs that are about the same thing end
   up together, and each group is named for what it's about. */

const Topics = {
  async manager(onProgress) {
    if (!FirefoxAI.ready) throw new Error("Local AI is off");
    if (!this.pending) {
      const { SmartTabGroupingManager } = ChromeUtils.importESModule("moz-src:///browser/components/tabbrowser/SmartTabGrouping.sys.mjs");
      const m = new SmartTabGroupingManager();
      this.pending = m.preloadAllModels(p => onProgress?.(Math.round(p.percentage))).then(() => m, e => {
        this.pending = null;
        throw e;
      });
    }
    clearTimeout(this.idle);
    return this.pending;
  },

  // [{ label, tabs }], groups of two or more, the closest-knit first.
  async group(tabs, onProgress) {
    const m = await this.manager(onProgress);
    try {
      const result = await m.generateClusters(tabs);
      await m.generateGroupLabels(result);
      return result.clusterRepresentations
        .filter(r => r.tabs.length > 1)
        .sort((a, b) => (b.cohesion ?? 0) - (a.cohesion ?? 0))
        .map(r => ({ label: r.predictedTopicLabel || "", tabs: r.tabs }));
    } finally {
      this.idle = setTimeout(() => this.close(), 120000);
    }
  },

  async close() {
    const pending = this.pending;
    this.pending = null;
    try {
      (await pending)?.terminateProcess?.();
    } catch {}
  },
};

function init() {
  FirefoxAI.sync();
  const sync = () => {
    FirefoxAI.sync();
    if (!on()) {
      Model.close();
      Topics.close();
    }
  };
  Services.prefs.addObserver(AI_PREF, sync);
  window.addEventListener("unload", () => {
    Services.prefs.removeObserver(AI_PREF, sync);
    Model.close();
    Topics.close();
  });
  // For the tab manager (and tools/checks).
  const api = (window.ZenithAI ??= {});
  Object.defineProperty(api, "on", { get: () => FirefoxAI.ready, configurable: true, enumerable: true });
  api.topics = (tabs, onProgress) => Topics.group(tabs, onProgress);
  api.ask = (messages, opts) => Model.ask(messages, opts);
}

start("local AI", init);
start("download names", () => DownloadNames.init());
