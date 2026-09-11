/* Progressive UX and accessibility enhancements for the Telegram Mini App. */
(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function updateThemeChrome() {
    const isLight = document.documentElement.dataset.theme === "light";
    $("meta[name='theme-color']")?.setAttribute("content", isLight ? "#f7f8fc" : "#080b14");
  }

  function triggerHaptic(style = "light") {
    try {
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred(style);
      }
    } catch (e) {}
  }

  function enhanceNavigation() {
    const nav = $(".bottom-nav");
    if (!nav) return;
    const sync = () => $$(".nav-tab", nav).forEach((button) => {
      button.type = "button";
      button.setAttribute("aria-current", button.classList.contains("active") ? "page" : "false");
    });
    sync();
    nav.addEventListener("click", (e) => {
      if (e.target.closest(".nav-tab")) triggerHaptic("medium");
    });
    new MutationObserver(sync).observe(nav, { subtree: true, attributes: true, attributeFilter: ["class"] });
  }

  function enhanceButtons() {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-buy-card, .btn-primary-action, .btn-topup-primary, .topup-chip-btn, .cat-btn");
      if (btn) triggerHaptic("light");
    });
  }

  function enhanceModals() {
    $$(".modal-backdrop").forEach((modal) => {
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.addEventListener("click", (event) => {
        if (event.target === modal && typeof window.closeModal === "function") {
          triggerHaptic("light");
          window.closeModal(modal.id);
        }
      });
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const openModal = $$(".modal-backdrop").reverse().find((item) => getComputedStyle(item).display !== "none");
      if (openModal && typeof window.closeModal === "function") {
        triggerHaptic("light");
        window.closeModal(openModal.id);
      }
    });
  }

  function enhanceForms() {
    $$("input, select, textarea").forEach((control) => {
      control.addEventListener("invalid", () => control.setAttribute("aria-invalid", "true"));
      control.addEventListener("input", () => control.removeAttribute("aria-invalid"));
    });
    $$("button:not([type])").forEach((button) => { button.type = "button"; });
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.body.classList.add("ux-ready");
    enhanceNavigation();
    enhanceButtons();
    enhanceModals();
    enhanceForms();
    updateThemeChrome();
    new MutationObserver(updateThemeChrome).observe(document.documentElement, {
      attributes: true, attributeFilter: ["data-theme"]
    });
  });
})();
