/* Progressive UX, Luxury Micro-interactions, and Accessibility for Telegram Mini App */
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
        if (style === "success" || style === "warning" || style === "error") {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred(style);
        } else {
          window.Telegram.WebApp.HapticFeedback.impactOccurred(style);
        }
      }
    } catch (e) {}
  }
  window.triggerHaptic = triggerHaptic;

  // ─── 1. Ripple Effect on Click / Tap ───
  function createRipple(event) {
    const btn = event.currentTarget;
    const circle = document.createElement("span");
    const diameter = Math.max(btn.clientWidth, btn.clientHeight);
    const radius = diameter / 2;
    const rect = btn.getBoundingClientRect();

    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${event.clientX - rect.left - radius}px`;
    circle.style.top = `${event.clientY - rect.top - radius}px`;
    circle.classList.add("ux-ripple-effect");

    const existing = btn.querySelector(".ux-ripple-effect");
    if (existing) existing.remove();

    btn.appendChild(circle);
    setTimeout(() => circle.remove(), 600);
  }

  function enhanceButtons() {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-buy-card, .btn-primary-action, .btn-secondary-action, .btn-topup-primary, .topup-chip-btn, .cat-btn, .pm-tab-btn, .btn-wallet-buy, .btn-spin-wheel, .btn-submit-checkout");
      if (btn) {
        triggerHaptic("light");
        if (btn.classList.contains("btn-buy-card") || btn.classList.contains("btn-primary-action") || btn.classList.contains("btn-wallet-buy")) {
          createRipple(e);
        }
      }
    });
  }

  // ─── 2. Floating Bottom Navigation Dock ───
  function enhanceNavigation() {
    const nav = $(".bottom-nav");
    if (!nav) return;
    const sync = () => $$(".nav-tab", nav).forEach((button) => {
      button.type = "button";
      button.setAttribute("aria-current", button.classList.contains("active") ? "page" : "false");
    });
    sync();

    nav.addEventListener("click", (e) => {
      const tab = e.target.closest(".nav-tab");
      if (tab) {
        triggerHaptic("medium");
        tab.style.transform = "scale(0.92)";
        setTimeout(() => { tab.style.transform = ""; }, 180);
      }
    });

    new MutationObserver(sync).observe(nav, { subtree: true, attributes: true, attributeFilter: ["class"] });
  }

  // ─── 3. Modal Sheets Smooth Touch Dismiss & Accessibility ───
  function enhanceModals() {
    $$(".modal-backdrop").forEach((modal) => {
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");

      // Backdrop click dismiss
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

  // ─── 4. Card Glare on Pointer Move ───
  function enhanceCardTilt() {
    document.addEventListener("pointermove", (e) => {
      const card = e.target.closest(".product-card, .virtual-debit-card, .binance-card-container");
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty("--mouse-x", `${x}px`);
      card.style.setProperty("--mouse-y", `${y}px`);
    });
  }

  // ─── 5. Form Input Enhancements ───
  function enhanceForms() {
    $$("input, select, textarea").forEach((control) => {
      control.addEventListener("invalid", () => control.setAttribute("aria-invalid", "true"));
      control.addEventListener("input", () => control.removeAttribute("aria-invalid"));
      control.addEventListener("focus", () => triggerHaptic("selection"));
    });
    $$("button:not([type])").forEach((button) => { button.type = "button"; });
  }

  // ─── 6. Category Auto-Scroll into View on Click ───
  function enhanceCategories() {
    document.addEventListener("click", (e) => {
      const catBtn = e.target.closest(".cat-btn, .category-chip");
      if (!catBtn) return;
      catBtn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.body.classList.add("ux-ready");
    enhanceNavigation();
    enhanceButtons();
    enhanceModals();
    enhanceCardTilt();
    enhanceForms();
    enhanceCategories();
    updateThemeChrome();
    new MutationObserver(updateThemeChrome).observe(document.documentElement, {
      attributes: true, attributeFilter: ["data-theme"]
    });
  });
})();
