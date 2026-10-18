// Focus mode's page tidy (Zenith Plus, Alt+Z with Focus mode › Pages on
// "Reader view for articles, tidy the rest"). Articles go to Firefox's own
// Reader view; this does the rest, for pages that are mostly reading
// (enough running text): the things annoyance lists and reader extensions
// take away go (cookie and consent banners, newsletter boxes, share bars,
// comment sections, "related" and sponsored blocks, ads, side columns),
// and so do bars stuck to the top or bottom of the window and full-window
// overlays. Leaving focus mode puts everything back.
//
// A window actor: this file runs inside the page's process, where the page
// is. It changes only how the page looks (a style sheet and inline display
// values it remembers), and takes nothing from the page to the browser.

export class ZenithFocusParent extends JSWindowActorParent {}

const HIDE = [
  // cookie and consent
  "#onetrust-consent-sdk", "#CybotCookiebotDialog", ".qc-cmp2-container", "#usercentrics-root", "#didomi-host", ".fc-consent-root",
  "[id*='cookie-banner' i]", "[class*='cookie-banner' i]", "[id*='cookie-consent' i]", "[class*='cookie-consent' i]",
  "[id*='cookie-notice' i]", "[class*='cookie-notice' i]", "[class*='consent-banner' i]", "[id*='gdpr' i]", "[class*='gdpr' i]",
  // newsletters and sign-up boxes
  "[class*='newsletter' i]", "[id*='newsletter' i]", "[class*='signup-box' i]", "[class*='subscribe-box' i]",
  // share and social
  "[class*='share-bar' i]", "[class*='sharebar' i]", "[class*='social-share' i]", "[class*='share-buttons' i]", "[class*='sharing-buttons' i]",
  // comments
  "#comments", ".comments", "#disqus_thread", "[id*='disqus' i]", "[class*='comments-section' i]", "[class*='comment-section' i]",
  // related, recommended, sponsored
  "[class*='related-posts' i]", "[class*='related-articles' i]", "[class*='recommended' i]", "[class*='outbrain' i]", "[id*='outbrain' i]",
  "[class*='taboola' i]", "[id*='taboola' i]", "[class*='sponsored' i]",
  // ads
  "ins.adsbygoogle", "[id^='google_ads']", "[id^='div-gpt-ad']", "[class*='ad-slot' i]", "[id*='ad-slot' i]", "[class*='advert' i]",
  "iframe[src*='doubleclick']", "iframe[src*='googlesyndication']",
  // side columns
  "aside", "[role='complementary']",
];
const SHEET = "data:text/css," + encodeURIComponent(`${HIDE.join(",\n")} { display: none !important; }`);

export class ZenithFocusChild extends JSWindowActorChild {
  receiveMessage(msg) {
    if (msg.name === "tidy") return this.tidy(true);
    if (msg.name === "untidy") return this.tidy(false);
    if (msg.name === "state") return { on: !!this.on, hidden: this.hidden?.length ?? 0, reading: this.reading() };
    return null;
  }

  didDestroy() {
    this.hidden = null;
  }

  // Mostly reading: a good amount of running text in paragraphs.
  reading() {
    const doc = this.document;
    if (!doc?.body || doc.contentType !== "text/html") return false;
    let text = 0;
    for (const p of doc.querySelectorAll("p")) {
      text += p.textContent.trim().length;
      if (text > 1500) return true;
    }
    return false;
  }

  tidy(on) {
    const utils = this.contentWindow?.windowUtils;
    if (!utils) return false;
    if (on && !this.on) {
      if (!this.reading()) return false;
      try {
        utils.loadSheetUsingURIString(SHEET, utils.AUTHOR_SHEET);
      } catch {}
      this.on = true;
      this.unstick();
    } else if (!on && this.on) {
      try {
        utils.removeSheetUsingURIString(SHEET, utils.AUTHOR_SHEET);
      } catch {}
      this.on = false;
      for (const [el, value, priority] of this.hidden ?? []) {
        if (value) el.style.setProperty("display", value, priority);
        else el.style.removeProperty("display");
      }
      this.hidden = null;
    }
    return !!this.on;
  }

  // Bars stuck to the top or bottom of the window (headers, banners, chat
  // bubbles) and overlays over most of it.
  unstick() {
    const doc = this.document, win = this.contentWindow;
    const H = win.innerHeight, Wd = win.innerWidth;
    this.hidden = [];
    const walker = doc.createTreeWalker(doc.body, win.NodeFilter.SHOW_ELEMENT);
    let n = 0;
    for (let el = walker.nextNode(); el && n < 6000; el = walker.nextNode(), n++) {
      const cs = win.getComputedStyle(el);
      if (cs.position !== "fixed" && cs.position !== "sticky") continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const bar = r.height < H * 0.3 && (cs.position === "sticky" || r.top <= 2 || r.bottom >= H - 2);
      const overlay = cs.position === "fixed" && r.width > Wd * 0.6 && r.height > H * 0.6;
      if (!bar && !overlay) continue;
      this.hidden.push([el, el.style.getPropertyValue("display"), el.style.getPropertyPriority("display")]);
      el.style.setProperty("display", "none", "important");
    }
  }
}
