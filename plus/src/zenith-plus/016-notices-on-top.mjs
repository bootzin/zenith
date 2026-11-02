/* --- Notices on top ------------------------------------------------------------
   Zen's toasts ("Copied link") live inside the page's column, under anything
   over the page (Zenith's settings panel); moved beside Zenith's own notices,
   they show over it. */
function noticesOnTop() {
  const toasts = document.getElementById("zen-toast-container");
  const wrapper = document.getElementById("zen-main-app-wrapper");
  if (toasts && wrapper && toasts.parentNode !== wrapper) wrapper.append(toasts);
}

