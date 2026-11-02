/* --- Zenith check: Plus needs Zenith Core --------------------------------
   Plus leans on Core's colours, sizes and glass. With Core missing or
   switched off it would just look broken, so it says so once instead (an
   idea from Natsumi, which checks that its styles loaded). */
function notice({ title, body, actions = [], ms = 12000 }) {
  let stack = document.getElementById("zenith-toasts");
  if (!stack) {
    stack = el("div", { id: "zenith-toasts" });
    (document.getElementById("zen-main-app-wrapper") ?? document.body).append(stack);
  }
  const card = el("div", { class: "zenith-toast zenith-ai-notice" });
  const head = el("div", { class: "zenith-toast-title" });
  const text = el("div", { class: "zenith-toast-body" });
  head.textContent = title;
  text.textContent = body;
  card.append(head, text);
  const close = () => card.remove();
  if (actions.length) {
    const row = el("div", { class: "zenith-toast-actions" });
    for (const a of actions) {
      const b = el("button", { class: "zenith-toast-button" });
      b.textContent = a.label;
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
  return card;
}

function toast(title, body) {
  let stack = document.getElementById("zenith-toasts");
  if (!stack) {
    stack = el("div", { id: "zenith-toasts" });
    (document.getElementById("zen-main-app-wrapper") ?? document.body).append(stack);
  }
  const card = el("div", { class: "zenith-toast" });
  const head = el("div", { class: "zenith-toast-title" });
  const text = el("div", { class: "zenith-toast-body" });
  head.textContent = title;
  text.textContent = body;
  card.append(head, text);
  card.addEventListener("click", () => card.remove());
  stack.append(card);
}

function checkCore() {
  // Mod styles arrive a moment after the window opens.
  setTimeout(() => {
    if (getComputedStyle(root).getPropertyValue("--zth-ink").trim()) return;
    if (Services.wm.getMostRecentWindow("navigator:browser") !== window) return;
    toast("Zenith Plus needs Zenith Core", "Zenith Core is missing or switched off. Install it, or switch it on in Settings › Sine Mods.");
  }, 6000);
}

