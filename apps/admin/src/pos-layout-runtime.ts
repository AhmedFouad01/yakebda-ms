const POS_PATH_PREFIX = "/pos";

let scheduled = false;

function scheduleSync() {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(() => {
    scheduled = false;
    syncPosLayout();
  });
}

function syncPosLayout() {
  if (!window.location.pathname.startsWith(POS_PATH_PREFIX)) return;

  const pos = document.querySelector<HTMLElement>(".app2-pos .posx");
  if (!pos) return;

  const shellSlot = document.getElementById("pos-appshell-controls");
  const toolbar = pos.querySelector<HTMLElement>(".posx-menu-tools");

  if (shellSlot && toolbar) {
    let operationControls = shellSlot.querySelector<HTMLElement>(".posx-shell-operation-controls");
    if (!operationControls) {
      operationControls = document.createElement("div");
      operationControls.className = "posx-shell-operation-controls";
      operationControls.setAttribute("aria-label", "أدوات تشغيل نقطة البيع");
      shellSlot.appendChild(operationControls);
    }

    const shift = toolbar.querySelector<HTMLElement>(".posx-shift");
    const search = toolbar.querySelector<HTMLInputElement>(".posx-search");
    const history = toolbar.querySelector<HTMLButtonElement>(".posx-history-btn");

    [shift, search, history].forEach((control) => {
      if (control && control.parentElement !== operationControls) {
        operationControls.appendChild(control);
      }
    });
  }

  const cartOptions = pos.querySelector<HTMLElement>(".posx-opts");
  const orderControls = document.querySelector<HTMLElement>(
    ".app2-pos .posx-shell-order-controls, .app2-pos .posx-order-context"
  );

  if (cartOptions && orderControls) {
    orderControls.classList.remove("posx-shell-order-controls");
    orderControls.classList.add("posx-order-context");

    orderControls
      .querySelector<HTMLElement>(".posx-shell-source")
      ?.classList.add("posx-source-field");

    if (orderControls.parentElement !== cartOptions) {
      cartOptions.insertBefore(orderControls, cartOptions.firstChild);
    }
  }

  // The quick-cash/change experiment was cancelled. Remove it if an older
  // mounted POS render still contains it.
  pos.querySelectorAll<HTMLElement>(".posx-change-panel").forEach((panel) => panel.remove());
}

const observer = new MutationObserver(scheduleSync);
observer.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener("popstate", scheduleSync);
window.addEventListener("hashchange", scheduleSync);
window.addEventListener("DOMContentLoaded", scheduleSync, { once: true });
scheduleSync();
