/* --- A short note at the foot of the page (focus mode) -------------------- */

// (Also the launcher's, for "Copied".)
window.ZenithHint = text => hint(text);

function hint(text) {
  let pill = document.getElementById("zenith-hint");
  if (!pill) {
    pill = el("div", { id: "zenith-hint" });
    (document.getElementById("zen-main-app-wrapper") ?? document.body).append(pill);
  }
  pill.textContent = text;
  pill.removeAttribute("show");
  void pill.offsetWidth; // start the fade again
  pill.setAttribute("show", "true");
  clearTimeout(hint.timer);
  hint.timer = setTimeout(() => pill.removeAttribute("show"), 1600);
}

