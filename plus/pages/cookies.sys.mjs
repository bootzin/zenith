// SPDX-License-Identifier: GPL-3.0-or-later
// Cookie banners (Zenith Plus › Cookies). Zen has no banner rejecter of its
// own (Firefox's isn't in it), so this answers them: in each page and its
// frames, a consent tool's banner gets its "Reject" (or "Only necessary")
// pressed, and, if you choose, a banner with no way to refuse is hidden
// and the page can scroll again. Known consent tools by their own buttons;
// any other banner (a box stuck to the window that talks about cookies or
// privacy) by a button that says no, in a few languages, and nothing else.
// It never presses anything that accepts.
//
// What it does (Cookies › Banners, zenith.plus.cookie-banners):
//   "" / "reject"  press Reject; with "", a banner with no Reject is hidden
//   "hide"         hide banners, answer nothing
//   "off"          leave them
// Sites left alone: zenith.plus.cookie-banners-skip (comma-separated).
//
// A window actor: this runs inside the page's process, where the page is.
// It only clicks buttons in consent banners and hides banners; it takes
// nothing from the page, and tells the browser only what it did (for the
// cookies page's "lately").

const { setTimeout, clearTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");

// Consent tools: [name, the banner, its refuse buttons (in order of
// preference; the first one shown is pressed), steps to reach a refusal
// when it's behind "settings"].
const TOOLS = [
  ["OneTrust", "#onetrust-consent-sdk, #onetrust-banner-sdk", ["#onetrust-reject-all-handler", ".ot-pc-refuse-all-handler", "#onetrust-pc-sdk .ot-pc-refuse-all-handler"]],
  ["Cookiebot", "#CybotCookiebotDialog", ["#CybotCookiebotDialogBodyButtonDecline", "#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll", "[data-cookiebanner='reject_button']"]],
  ["Didomi", "#didomi-host, #didomi-popup, #didomi-notice", ["#didomi-notice-disagree-button", ".didomi-continue-without-agreeing", "button[aria-label*='Disagree' i]"]],
  ["Quantcast", ".qc-cmp2-container", [".qc-cmp2-summary-buttons button[mode='secondary']", "button[mode='secondary'][size='large']"]],
  ["Usercentrics", "#usercentrics-root, #usercentrics-cmp-ui", ["button[data-testid='uc-deny-all-button']", "button[data-action-type='deny']"]],
  ["TrustArc", "#truste-consent-track, #truste-consent-content, .truste_box_overlay", ["#truste-consent-required", ".truste-consent-required"]],
  ["Sourcepoint", "[id^='sp_message_container'], .message-container, .sp_message_container", ["button.sp_choice_type_REJECT_ALL", "button.sp_choice_type_13", "button[title='Reject All' i]", "button[aria-label='Reject All' i]"]],
  ["Funding Choices", ".fc-consent-root", [".fc-cta-do-not-consent", "button.fc-button.fc-cta-do-not-consent"]],
  ["Klaro", ".klaro, .cookie-modal, .cookie-notice", [".cm-btn-decline", ".cn-decline"]],
  ["Osano", ".osano-cm-window, .osano-cm-dialog", [".osano-cm-denyAll", ".osano-cm-button--type_denyAll"]],
  ["CookieYes", ".cky-consent-container, .cky-modal", [".cky-btn-reject"]],
  ["Complianz", "#cmplz-cookiebanner-container, .cmplz-cookiebanner", [".cmplz-deny", ".cmplz-btn.cmplz-deny"]],
  ["Termly", "[data-tid='banner'], #termly-code-snippet-support", ["[data-tid='banner-decline']"]],
  ["iubenda", "#iubenda-cs-banner", [".iubenda-cs-reject-btn"]],
  ["Borlabs", "#BorlabsCookieBox, #BorlabsCookieWidget", ["[data-cookie-refuse]", "a._brlbs-refuse-btn", "._brlbs-refuse"]],
  ["consentmanager", "#cmpbox, #cmpwrapper", [".cmpboxbtnno", "a.cmpboxbtnno"]],
  ["Civic", "#ccc, #ccc-notify", [".ccc-reject-button", "#ccc-reject-settings"]],
  ["CookieConsent", ".cc-window, .cc-banner, #cc-main", [".cc-deny", ".cc-dismiss[aria-label*='deny' i]", "button[data-role='necessary']", "[data-cc='accept-necessary']"]],
  ["Axeptio", "#axeptio_overlay", ["#axeptio_btn_dismiss"]],
  ["Shopify", ".shopify-pc__banner", [".shopify-pc__banner__btn-decline"]],
];

// A refusing button, by what it says (the whole label, trimmed).
const REFUSE = new RegExp("^(" + [
  "reject", "reject all", "reject all cookies", "reject cookies", "reject non-essential( cookies)?", "reject optional( cookies)?", "reject additional cookies",
  "decline", "decline all", "decline cookies", "decline optional( cookies)?", "deny", "deny all", "refuse", "refuse all", "refuse cookies",
  "(use |accept |allow )?(only )?(strictly )?(necessary|essential|required)( cookies)?( only)?", "(use |accept |allow )?necessary cookies only",
  "continue without (accepting|agreeing|consent)", "disagree", "disagree and close", "i (do not|don't) (accept|agree)", "no,? thanks", "not now",
  // pt, es, fr, de, it, nl, pl, sv, da
  "rejeitar", "rejeitar tudo", "rejeitar todos", "recusar", "recusar tudo", "recusar todos", "apenas (os )?necessários", "continuar sem aceitar",
  "rechazar", "rechazar todo", "rechazar todas", "solo necesarias", "continuar sin aceptar",
  "refuser", "tout refuser", "refuser tout", "continuer sans accepter", "nécessaires uniquement",
  "ablehnen", "alle ablehnen", "nur notwendige", "nur notwendige cookies", "nur erforderliche( cookies)?",
  "rifiuta", "rifiuta tutto", "rifiuta tutti", "solo necessari", "continua senza accettare",
  "weigeren", "alles weigeren", "alleen noodzakelijk(e cookies)?", "odrzuć( wszystkie)?", "avvisa( alla)?", "afvis( alle)?",
].join("|") + ")$", "i");

const CONSENT = /(cookie|consent|your\s+privacy|partner.{0,200}vendors|personal\s+data|datenschutz|privacidade|confidentialit|privacy)/i;
const SHEET = "data:text/css," + encodeURIComponent(
  "[zenith-cookie-hidden] { display: none !important; }\n" +
  "html[zenith-cookie-unlocked], html[zenith-cookie-unlocked] > body { overflow: auto !important; }");

// What pages did lately (this run of Zen, never private windows), for the
// cookies page; and what Zenith already told you about this run (a site
// and what was done: told once).
const log = [];
export function lately() {
  return log.slice();
}
export const told = new Set();

// (Zenith's settings aren't passed into web page processes: the page asks
// the browser for what applies to it.)
const sites = list => list.split(/[\s,]+/).map(s => s.trim().toLowerCase().replace(/^www\./, "")).filter(Boolean);
const covers = (list, host) => {
  host = (host || "").toLowerCase().replace(/^www\./, "");
  return !!host && list.some(s => host === s || host.endsWith(`.${s}`));
};

export class ZenithCookiesParent extends JSWindowActorParent {
  receiveMessage(msg) {
    if (msg.name === "did") {
      const priv = (this.browsingContext.originAttributes?.privateBrowsingId ?? 0) > 0;
      if (!priv) {
        log.unshift({ ...msg.data, at: Date.now() });
        log.length = Math.min(log.length, 50);
      }
      // The window whose tab it is says so, with Undo. (Found by its tab:
      // the browser's own global isn't always that window in Zen.)
      const browser = this.browsingContext.top.embedderElement;
      try {
        const wins = [...Services.wm.getEnumerator("navigator:browser")];
        const win = wins.find(w => w.gBrowser?.getTabForBrowser?.(browser)) ?? Services.wm.getMostRecentWindow("navigator:browser");
        win?.ZenithCookies?.acted(browser, msg.data, this);
      } catch (e) {
        console.error("[Zenith] cookie banners: telling", e);
      }
      return null;
    }
    if (msg.name === "settings") {
      const P = Services.prefs, skip = sites(P.getStringPref("zenith.plus.cookie-banners-skip", ""));
      let top = "";
      try {
        top = this.browsingContext.top.currentWindowGlobal?.documentURI?.host ?? "";
      } catch {}
      const mode = P.getStringPref("zenith.plus.cookie-banners", "") || "reject-hide";
      return { mode: covers(skip, msg.data?.host) || covers(skip, top) ? "off" : mode };
    }
    return null;
  }
}

export class ZenithCookiesChild extends JSWindowActorChild {
  // (From the browser, at the start: see ZenithCookiesParent.)
  mode = "off";

  handleEvent(e) {
    if (e.type === "DOMContentLoaded" || (e.type === "pageshow" && !this.watching)) this.start();
  }

  // Undo (from the notice): what was hidden shows again, and nothing more
  // is done on this page.
  undo() {
    this.mode = "off";
    this.stop();
    for (const el of this.hidden ?? []) el.removeAttribute("zenith-cookie-hidden");
    this.hidden = [];
    this.document?.documentElement?.removeAttribute("zenith-cookie-unlocked");
    return true;
  }

  receiveMessage(msg) {
    if (msg.name === "state") return { done: this.done ?? null, hidden: this.hidden?.length ?? 0 };
    if (msg.name === "run") return this.sweep(true);
    if (msg.name === "undo") return this.undo();
    return null;
  }

  didDestroy() {
    this.stop();
  }

  async start() {
    const doc = this.document, win = this.contentWindow;
    if (!doc || !win || this.watching || !/^https?:$/.test(doc.location?.protocol ?? "")) return;
    this.watching = true;
    try {
      this.mode = (await this.sendQuery("settings", { host: doc.location.hostname }))?.mode ?? "off";
    } catch {
      this.mode = "off";
    }
    if (this.mode === "off" || !this.contentWindow) {
      this.watching = false;
      return;
    }
    this.sweep();
    // Banners load late: watch for a while.
    this.observer = new win.MutationObserver(() => {
      if (this.timer) return;
      this.timer = setTimeout(() => {
        this.timer = null;
        this.sweep();
      }, 250);
    });
    this.observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });
    this.stopTimer = setTimeout(() => this.stop(), 20000);
  }

  stop() {
    this.observer?.disconnect();
    this.observer = null;
    clearTimeout(this.timer);
    clearTimeout(this.stopTimer);
    this.timer = null;
    this.watching = false;
  }

  visible(el) {
    if (!el?.isConnected) return false;
    const win = this.contentWindow, cs = win.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  }

  // Elements matching a selector, in the page and in the open shadow roots
  // consent tools draw in (they sit at the top of the page).
  find(selector) {
    const doc = this.document, out = [...doc.querySelectorAll(selector)];
    for (const host of doc.querySelectorAll("body > *, html > *:not(body), #usercentrics-root, #usercentrics-cmp-ui")) {
      if (host.shadowRoot) out.push(...host.shadowRoot.querySelectorAll(selector));
    }
    return out;
  }

  // A refusing button in a box, by what it says.
  refuser(box) {
    return [...box.querySelectorAll("button, a, [role='button'], input[type='button'], input[type='submit']")]
      .find(b => this.visible(b) && REFUSE.test((b.textContent || b.value || b.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim()));
  }

  press(button, tool, box = null) {
    try {
      button.click();
    } catch {
      return false;
    }
    this.done = { how: "rejected", tool, host: this.document.location.hostname };
    this.sendAsyncMessage("did", this.done);
    // (Still there a moment later, as some ask again: hidden, if allowed.)
    if (box && this.mode === "reject-hide") setTimeout(() => this.visible(box) && this.hide(box, tool), 1500);
    return true;
  }

  hide(el, tool) {
    if (el.hasAttribute("zenith-cookie-hidden")) return;
    const win = this.contentWindow;
    if (!this.sheet) {
      try {
        win.windowUtils.loadSheetUsingURIString(SHEET, win.windowUtils.USER_SHEET);
        this.sheet = true;
      } catch {}
    }
    el.setAttribute("zenith-cookie-hidden", "");
    // (A banner that stopped the page scrolling: it scrolls again.)
    this.document.documentElement.setAttribute("zenith-cookie-unlocked", "");
    (this.hidden ??= []).push(el);
    if (!this.done) {
      this.done = { how: "hidden", tool, host: this.document.location.hostname };
      this.sendAsyncMessage("did", this.done);
    }
  }

  // A box that's a consent banner: stuck to the window or a dialog, and it
  // talks about cookies or privacy.
  bannerish(el) {
    const win = this.contentWindow, cs = win.getComputedStyle(el);
    const floating = cs.position === "fixed" || cs.position === "sticky" || el.getAttribute("role") === "dialog" || el.localName === "dialog" || el.getAttribute("aria-modal") === "true";
    return floating && CONSENT.test((el.textContent || "").slice(0, 4000));
  }

  sweep(again = false) {
    const mode = this.mode, doc = this.document;
    if (!doc?.documentElement || mode === "off" || (this.done && !again)) return this.done ?? null;
    // Known consent tools.
    for (const [tool, banner, buttons] of TOOLS) {
      const boxes = this.find(banner).filter(b => this.visible(b));
      if (!boxes.length) continue;
      if (mode !== "hide") {
        for (const sel of buttons) {
          const button = this.find(sel).find(b => this.visible(b));
          if (button && this.press(button, tool, boxes[0])) return this.done;
        }
        // (Not the usual button: one that says no.)
        for (const b of boxes) {
          const button = this.refuser(b);
          if (button && this.press(button, tool, b)) return this.done;
        }
      }
      if (mode === "hide" || mode === "reject-hide") {
        for (const b of boxes) this.hide(b, tool);
        return this.done;
      }
    }
    // Any other banner: a box stuck to the window about cookies, with a
    // button that refuses.
    // (Only where banners live: the page's top level, dialogs, and boxes
    // named for cookies or consent; not the whole page, every time.)
    const candidates = [];
    const where = "body > *, html > *:not(body), [role='dialog'], [role='alertdialog'], dialog, [aria-modal='true'], " +
                  "[id*='cookie' i], [class*='cookie' i], [id*='consent' i], [class*='consent' i], [id*='gdpr' i], [class*='gdpr' i], " +
                  "[id*='privacy' i], [class*='privacy' i], [id*='cmp' i], [class*='cmp-' i]";
    const main = doc.querySelector("main, article, h1");
    for (const el of doc.querySelectorAll(where)) {
      if (candidates.length > 12) break;
      if (el === doc.body || el.hasAttribute("zenith-cookie-hidden") || candidates.some(c => c.contains(el)) || !this.visible(el) || (main && el.contains(main))) continue;
      if (this.bannerish(el)) candidates.push(el);
    }
    for (const box of candidates) {
      if (mode !== "hide") {
        const button = this.refuser(box);
        if (button && this.press(button, "banner", box)) return this.done;
      }
      if (mode === "hide" || mode === "reject-hide") this.hide(box, "banner");
    }
    return this.done ?? null;
  }
}
