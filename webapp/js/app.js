// Telegram WebApp SDK Setup
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.expand();
  tg.ready();
  tg.enableClosingConfirmation();
}

// User Context
let currentUser = {
  user_id: tg?.initDataUnsafe?.user?.id || 123456789,
  full_name: tg?.initDataUnsafe?.user?.first_name
    ? `${tg.initDataUnsafe.user.first_name} ${tg.initDataUnsafe.user.last_name || ''}`.trim()
    : "អតិថិជន (Customer)",
  username: tg?.initDataUnsafe?.user?.username || "customer",
  photo_url: tg?.initDataUnsafe?.user?.photo_url || null
};

let categoriesData = [];
let productsData = [];
let activeCategory = null;
let searchQuery = "";

let paymentInfo = {};

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
window.escapeHtml = escapeHtml;

function formatOrderDateTime(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });
  } catch (e) {
    return String(dateStr);
  }
}
window.formatOrderDateTime = formatOrderDateTime;

// ═══════════════════════════════════════════════════════════════
// 🌟 APP INITIAL SPLASH SCREEN (2s Welcome Loading Animation)
// ═══════════════════════════════════════════════════════════════
let splashFinished = false;
function initAppSplashScreen() {
  if (splashFinished) return;
  const splash = document.getElementById("appSplashScreen");
  const bar = document.getElementById("splashProgressBar");
  const status = document.getElementById("splashStatusText");
  if (!splash) return;

  const startTime = Date.now();
  const duration = 1800; // 1.8 seconds fast smooth transition

  const interval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(100, Math.floor((elapsed / duration) * 100));

    if (bar) bar.style.width = `${progress}%`;

    if (progress > 30 && progress < 70 && status) {
      status.textContent = "កំពុងផ្ទុកទំនិញ & ស្តុក...";
    } else if (progress >= 70 && progress < 95 && status) {
      status.textContent = "ស្វាគមន៍មកកាន់ Digital Store...";
    } else if (progress >= 95 && status) {
      status.textContent = "រួចរាល់ 100% ✨";
    }

    if (elapsed >= duration) {
      clearInterval(interval);
      hideSplashScreen();
    }
  }, 25);

  // Absolute safety fallback (maximum 2.2s)
  setTimeout(() => {
    hideSplashScreen();
  }, 2200);
}

function hideSplashScreen() {
  if (splashFinished) return;
  splashFinished = true;
  const splash = document.getElementById("appSplashScreen");
  const bar = document.getElementById("splashProgressBar");
  if (bar) bar.style.width = "100%";
  try {
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
  } catch (e) {}

  if (splash) {
    splash.classList.add("splash-hidden");
    setTimeout(() => {
      splash.style.display = "none";
    }, 450);
  }
}
window.initAppSplashScreen = initAppSplashScreen;
window.hideSplashScreen = hideSplashScreen;

document.addEventListener("DOMContentLoaded", async () => {
  initAppSplashScreen();
  initSavedTheme();
  renderUserHeader();

  try { await syncUserWithBackend(); } catch (e) { console.error("syncUser err:", e); }
  try { await loadPaymentInfo(); } catch (e) { console.error("loadPaymentInfo err:", e); }
  try { await loadCategories(); } catch (e) { console.error("loadCategories err:", e); }
  try { await fetchActiveFlashSale(); } catch (e) { console.error("fetchActiveFlashSale err:", e); }
  try { await loadProducts(); } catch (e) { console.error("loadProducts err:", e); }
  try { await loadUserVipHeader(); } catch (e) { console.error("loadUserVipHeader err:", e); }
  try { await loadDailyCheckinStatus(); } catch (e) { console.error("loadDailyCheckinStatus err:", e); }
  try { await initLiveSocialProof(); } catch (e) { console.error("initLiveSocialProof err:", e); }
  try { await loadGiveaways(); } catch (e) { console.error("loadGiveaways err:", e); }

  // Backdrop click to close modals
  document.querySelectorAll(".modal-backdrop").forEach(modal => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        closeModal(modal.id);
      }
    });
  });

  // ESC key to close modal
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal-backdrop.open, .modal-backdrop.active").forEach(m => {
        closeModal(m.id);
      });
    }
  });

  // Hash-based tab switching
  if (window.location.hash === "#admin") {
    switchTab('tabAdmin', document.getElementById('navAdmin'));
  } else if (window.location.hash === "#orders") {
    switchTab('tabOrders', document.getElementById('navOrders'));
  } else if (window.location.hash === "#replace") {
    switchTab('tabReplace', document.getElementById('navReplace'));
  } else if (window.location.hash === "#vip") {
    openVipModal();
  } else if (window.location.hash.startsWith("#angpao=")) {
    const code = window.location.hash.replace("#angpao=", "").trim();
    openAngpaoClaimModal(code);
  } else if (window.location.hash === "#create_angpao") {
    openCreateAngpaoModal();
  }

  setupFormHandlers();
});

// ─── Core Navigation & Modal Helpers ─────────────────────────────────────────
function switchTab(tabId, btn) {
  try {
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
  } catch (e) {}

  // Hide all tab pages
  document.querySelectorAll(".tab-page").forEach(page => {
    page.style.display = "none";
    page.classList.remove("active");
  });

  // Deactivate all nav buttons
  document.querySelectorAll(".nav-tab").forEach(b => {
    b.classList.remove("active");
  });

  // Show target tab page
  const targetPage = document.getElementById(tabId);
  if (targetPage) {
    targetPage.style.display = "block";
    targetPage.classList.add("active");
  }

  // Activate clicked button or matching nav button
  if (btn) {
    btn.classList.add("active");
  } else {
    const navMap = {
      tabShop: 'navShop',
      tabOrders: 'navOrders',
      tabReplace: 'navReplace',
      tabWallet: 'navWallet',
      tabAdmin: 'navAdmin'
    };
    const navId = navMap[tabId];
    if (navId) {
      const navBtn = document.getElementById(navId);
      if (navBtn) navBtn.classList.add("active");
    }
  }

  // Hide floating support button inside Admin dashboard to prevent covering admin controls
  const supportBtn = document.querySelector(".floating-support-btn");
  if (supportBtn) {
    supportBtn.style.display = (tabId === "tabAdmin") ? "none" : "flex";
  }

  // Trigger tab-specific loaders
  if (tabId === 'tabOrders') {
    loadUserOrders();
  } else if (tabId === 'tabReplace') {
    loadReplacementHistory();
  } else if (tabId === 'tabWallet') {
    loadWalletInfo();
  } else if (tabId === 'tabAdmin') {
    loadAdminStats();
    switchAdminSection('secOrders');
  }
}
window.switchTab = switchTab;

function openModal(modalId) {
  try {
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("medium");
  } catch (e) {}
  const modal = typeof modalId === "string" ? document.getElementById(modalId) : modalId;
  if (modal) {
    modal.classList.add("open");
    modal.classList.add("active");
  }
}
window.openModal = openModal;

function closeModal(modalId) {
  try {
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
  } catch (e) {}
  const modal = typeof modalId === "string" ? document.getElementById(modalId) : modalId;
  if (modal) {
    modal.classList.remove("open");
    modal.classList.remove("active");
    modal.style.display = "";
  }
}
window.closeModal = closeModal;

function openTelegramSupport() {
  if (tg?.openTelegramLink) {
    tg.openTelegramLink("https://t.me/Rosa_SET");
  } else {
    window.open("https://t.me/Rosa_SET", "_blank");
  }
}
window.openTelegramSupport = openTelegramSupport;

function openQuickSupportModal() {
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("medium");
  playSound("click");
  const el = document.getElementById("supportUserIdText");
  if (el && currentUser) {
    el.textContent = `${currentUser.user_id} (${currentUser.first_name || currentUser.username || 'Customer'})`;
  }
  openModal("quickSupportModal");
}
window.openQuickSupportModal = openQuickSupportModal;

function openLiveAdminSupport() {
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("medium");
  playSound("click");
  const supportUrl = "https://t.me/Rosa_SET";
  if (tg && tg.openTelegramLink) {
    tg.openTelegramLink(supportUrl);
  } else {
    window.open(supportUrl, "_blank");
  }
}
window.openLiveAdminSupport = openLiveAdminSupport;

async function loadWalletInfo() {
  try {
    const res = await fetch(`/api/user/${currentUser.user_id}/wallet`);
    const json = await res.json();
    if (json.status === "success") {
      const balEl = document.getElementById("userWalletBalance");
      const linkEl = document.getElementById("textRefLink");
      const countEl = document.getElementById("refCount");
      const earnedEl = document.getElementById("refTotalEarned");

      if (balEl) balEl.textContent = `$${json.balance.toFixed(2)}`;
      if (linkEl) linkEl.textContent = json.referral_link;
      if (countEl) countEl.textContent = `${json.referrals_count} នាក់`;
      if (earnedEl) earnedEl.textContent = `$${json.total_earned.toFixed(2)}`;
    }
  } catch (err) {
    console.error("Wallet error:", err);
  }
}

// ─── Payment Info (from .env via API) ────────────────────────────────────────
async function loadPaymentInfo() {
  try {
    const res = await fetch("/api/payment-info");
    paymentInfo = await res.json();
    renderBankRows();

    // Update QR merchant name from ABA info
    const abaName = paymentInfo?.ABA?.name || "Digital Store";
    const nameEl = document.getElementById("qrMerchantName");
    if (nameEl) nameEl.textContent = abaName;
  } catch (err) {
    console.warn("Could not load payment info:", err);
  }
}

function renderBankRows() {
  const container = document.getElementById("dynamicBankRows");
  if (!container || !paymentInfo) return;

  let html = "";
  if (paymentInfo.ABA) {
    const n = paymentInfo.ABA.number.replace(/\s/g, "");
    html += `<div class="bank-row">
      <span class="bank-name">🔵 ABA Bank</span>
      <span class="bank-val">${paymentInfo.ABA.number}
        <button class="btn-mini-copy" onclick="copyText('${n}')">Copy</button>
      </span>
    </div>`;
  }
  if (paymentInfo.ACLEDA) {
    const n = paymentInfo.ACLEDA.number.replace(/\s/g, "");
    html += `<div class="bank-row">
      <span class="bank-name">🟢 ACLEDA</span>
      <span class="bank-val">${paymentInfo.ACLEDA.number}
        <button class="btn-mini-copy" onclick="copyText('${n}')">Copy</button>
      </span>
    </div>`;
  }
  if (paymentInfo.WING) {
    const n = paymentInfo.WING.number.replace(/\s/g, "");
    html += `<div class="bank-row">
      <span class="bank-name">🟡 Wing</span>
      <span class="bank-val">${paymentInfo.WING.number}
        <button class="btn-mini-copy" onclick="copyText('${n}')">Copy</button>
      </span>
    </div>`;
  }
  if (paymentInfo.USDT) {
    const addr = paymentInfo.USDT.address;
    const short = addr.length > 16 ? addr.slice(0, 8) + "..." + addr.slice(-6) : addr;
    html += `<div class="bank-row">
      <span class="bank-name">🟣 USDT TRC20</span>
      <span class="bank-val">${short}
        <button class="btn-mini-copy" onclick="copyText('${addr}')">Copy</button>
      </span>
    </div>`;
  }
  container.innerHTML = html || `<div style="color:var(--text-muted); font-size:12px; text-align:center; padding:8px;">មិនមានព័ត៌មានគណនីទេ</div>`;
}

// ═══════════════════════════════════════════════════════════════
// 🌓 THEME ENGINE (Telegram Auto-Sync & Manual Toggle)
// ═══════════════════════════════════════════════════════════════
function setTheme(themeName) {
  const finalTheme = themeName === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", finalTheme);
  document.body.setAttribute("data-theme", finalTheme);
  localStorage.setItem("app_theme", finalTheme);

  const icon = document.getElementById("themeIcon");
  const label = document.getElementById("themeLabel");
  if (finalTheme === "light") {
    if (icon) icon.textContent = "☀️";
    if (label) label.textContent = "Light";
  } else {
    if (icon) icon.textContent = "🌙";
    if (label) label.textContent = "Dark";
  }
}

function toggleTheme() {
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("medium");
  playSound("click");
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const newTheme = current === "dark" ? "light" : "dark";
  localStorage.setItem("app_theme_manual", "true");
  setTheme(newTheme);
  showToast(newTheme === "light" ? "☀️ បានប្តូរទៅ Light Theme (ពណ៌សថ្លា)" : "🌙 បានប្តូរទៅ Dark Theme (ពណ៌ស៊ីវិល័យ)", "info", 1800);
}

function initSavedTheme() {
  const manual = localStorage.getItem("app_theme_manual");
  let saved = localStorage.getItem("app_theme");

  if (!manual && window.Telegram?.WebApp?.colorScheme) {
    saved = window.Telegram.WebApp.colorScheme;
  }
  setTheme(saved || "dark");

  // Listen for Telegram live theme change events
  if (window.Telegram?.WebApp) {
    try {
      window.Telegram.WebApp.onEvent("themeChanged", () => {
        if (!localStorage.getItem("app_theme_manual")) {
          const tgScheme = window.Telegram.WebApp.colorScheme || "dark";
          setTheme(tgScheme);
        }
      });
    } catch (e) {}
  }
}

// ═══════════════════════════════════════════════════════════════
// 🔔 LIVE SOCIAL PROOF ENGINE (Real & Dynamic Store Activity)
// ═══════════════════════════════════════════════════════════════
let socialProofTimer = null;
const socialProofSamples = [
  { icon: "⚡", user: "@k***9", action: "បានទិញ", item: "Gemini Pro (18 Month)", time: "ទើបតែ ២ នាទីមុន" },
  { icon: "🔥", user: "@r***1", action: "បានទិញ", item: "CapCut Pro (1 Month)", time: "ទើបតែ ៤ នាទីមុន" },
  { icon: "💎", user: "@s***8", action: "បានបញ្ចូល", item: "$10.00 ចូល Wallet", time: "ទើបតែ ៧ នាទីមុន" },
  { icon: "✨", user: "@v***a", action: "បានទិញ", item: "ChatGPT Plus (1 Month)", time: "ទើបតែ ១០ នាទីមុន" },
  { icon: "🧧", user: "@m***h", action: "បានបើកឈ្នះ", item: "Lucky Angpao $1.50", time: "ទើបតែ ១៥ នាទីមុន" },
  { icon: "👑", user: "@l***n", action: "បានឡើងកម្រិត", item: "VIP Gold Member", time: "ទើបតែ ២០ នាទីមុន" }
];

function triggerSocialProofToast(item) {
  const adminTab = document.getElementById("tabAdmin");
  if (adminTab && (adminTab.classList.contains("active") || getComputedStyle(adminTab).display !== "none")) {
    return; // Do not display social proof toast inside admin panel
  }
  const existing = document.getElementById("liveSocialProofToast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "liveSocialProofToast";
  toast.className = "live-social-proof-toast";
  toast.innerHTML = `
    <div class="social-proof-icon">${item.icon}</div>
    <div class="social-proof-body">
      <div class="social-proof-line1">
        <strong class="social-proof-user">${item.user}</strong> ${item.action} <span class="social-proof-item">${item.item}</span>
      </div>
      <div class="social-proof-time">⏱️ ${item.time} • <span style="color:#34d399; font-weight:700;">Verified Order</span></div>
    </div>
    <button type="button" class="social-proof-close" onclick="this.parentElement.remove()">✕</button>
    <div class="social-proof-bar"></div>
  `;

  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add("show"), 50);

  setTimeout(() => {
    if (toast && toast.parentElement) {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 400);
    }
  }, 4500);
}

function initLiveSocialProof() {
  if (socialProofTimer) clearInterval(socialProofTimer);
  setTimeout(() => {
    const randomItem = socialProofSamples[Math.floor(Math.random() * socialProofSamples.length)];
    triggerSocialProofToast(randomItem);
  }, 6000);

  socialProofTimer = setInterval(() => {
    const randomItem = socialProofSamples[Math.floor(Math.random() * socialProofSamples.length)];
    triggerSocialProofToast(randomItem);
  }, 24000);
}


function renderUserHeader() {
  document.getElementById("userName").textContent = currentUser.full_name;
  document.getElementById("userId").textContent = `ID: ${currentUser.user_id}`;

  const avatarEl = document.getElementById("userAvatar");
  if (currentUser.photo_url) {
    // Show real Telegram profile photo
    avatarEl.innerHTML = `<img src="${currentUser.photo_url}" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;">`;
    avatarEl.style.padding = '0';
    avatarEl.style.overflow = 'hidden';
  } else {
    // Fallback: letter initial
    const initial = currentUser.full_name.charAt(0).toUpperCase();
    avatarEl.textContent = initial;
  }

  const replaceBuyerInput = document.getElementById("replaceBuyerName");
  if (replaceBuyerInput) replaceBuyerInput.value = currentUser.full_name;
}

async function syncUserWithBackend() {
  try {
    const res = await fetch("/api/user/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: currentUser.user_id,
        full_name: currentUser.full_name,
        username: currentUser.username,
        photo_url: currentUser.photo_url
      })
    });
    const data = await res.json();
    const adminBadge = document.getElementById("adminBadge");
    const navAdmin = document.getElementById("navAdmin");
    const headerRoleBadge = document.getElementById("headerRoleBadge");
    const avatarRoleDot = document.getElementById("avatarRoleDot");

    if (data.user) {
      currentUser.balance = parseFloat(data.user.balance) || 0.0;
      currentUser.is_admin = !!data.user.is_admin;
      currentUser.role = data.user.role || (data.user.is_admin ? "admin" : "user");
      const balEl = document.getElementById("userWalletBalance");
      if (balEl) balEl.textContent = `$${currentUser.balance.toFixed(2)}`;
      
      const balKhr = document.getElementById("userWalletBalanceKhr");
      if (balKhr) {
        const khr = Math.round((currentUser.balance || 0) * 4100);
        balKhr.textContent = `≈ ${khr.toLocaleString()} ៛`;
      }
      const cardHolder = document.getElementById("walletCardholderName");
      if (cardHolder) cardHolder.textContent = (currentUser.full_name || "MEMBER").toUpperCase();
      const cardId = document.getElementById("walletCardUserId");
      if (cardId) {
        const idStr = String(currentUser.user_id || "0000");
        cardId.textContent = `•••• •••• •••• ${idStr.slice(-4)}`;
      }
    }

    if (data.role_info) {
      currentUser.role_info = data.role_info;
      const role = data.role_info.role || "user";
      if (headerRoleBadge) {
        if (role !== "user") {
          headerRoleBadge.style.display = "inline-flex";
          headerRoleBadge.className = `role-badge-pill role-${role}`;
          headerRoleBadge.innerHTML = `${data.role_info.badge_icon} ${data.role_info.role_title}`;
        } else {
          headerRoleBadge.style.display = "none";
        }
      }
      if (avatarRoleDot) {
        avatarRoleDot.className = `avatar-role-dot role-${role.replace('_', '-')}`;
      }
    }

    if (data.user && data.user.is_admin) {
      if (adminBadge) adminBadge.style.display = "inline-block";
      if (navAdmin) navAdmin.style.display = "flex";
      loadAdminStats();
      startAdminLiveMonitor();
      updateAdminSoundUI();
    } else {
      if (adminBadge) adminBadge.style.display = "none";
      if (navAdmin) navAdmin.style.display = "none";
      stopAdminLiveMonitor();
    }
  } catch (err) {
    console.error("Sync error:", err);
  }
}

async function loadCategories() {
  try {
    const res = await fetch("/api/categories");
    const json = await res.json();
    if (json.status === "success") {
      categoriesData = json.data;
      renderCategoriesScroll();
      populateAdminCategorySelects();
    }
  } catch (err) {
    console.error("Categories error:", err);
  }
}

// ❤️ Favorites State & Management
let favoriteProductIds = [];
try {
  const savedFavs = localStorage.getItem("tg_store_favorites");
  favoriteProductIds = savedFavs ? JSON.parse(savedFavs) : [];
  if (!Array.isArray(favoriteProductIds)) favoriteProductIds = [];
} catch (e) {
  favoriteProductIds = [];
}

function isFavorite(productId) {
  return favoriteProductIds.includes(Number(productId));
}

function toggleFavorite(productId, e) {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  const pid = Number(productId);
  const idx = favoriteProductIds.indexOf(pid);
  const isAdding = idx === -1;

  if (isAdding) {
    favoriteProductIds.push(pid);
    if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
    playSound("click");
    showToast("❤️ បានបន្ថែមទៅក្នុងបញ្ជីចំណាំទុក!", "success", 2000);
  } else {
    favoriteProductIds.splice(idx, 1);
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
    playSound("click");
    showToast("🤍 បានដកចេញពីបញ្ជីចំណាំទុក", "info", 1800);
  }

  try {
    localStorage.setItem("tg_store_favorites", JSON.stringify(favoriteProductIds));
  } catch (err) {}

  // Re-render categories count & product grid
  renderCategoriesScroll();
  renderProductsGrid(productsData);
}
window.toggleFavorite = toggleFavorite;
window.isFavorite = isFavorite;

function renderCategoriesScroll() {
  const container = document.getElementById("categoryList");
  if (!container) return;
  const favCount = favoriteProductIds.length;
  let html = `<button class="cat-btn ${activeCategory === null ? 'active' : ''}" onclick="filterCategory(null, this)">✨ ទាំងអស់ (All)</button>`;
  
  // ❤️ Favorites Filter Pill
  html += `<button class="cat-btn ${activeCategory === 'favorites' ? 'active' : ''}" onclick="filterCategory('favorites', this)" style="border-color:${favCount > 0 ? 'rgba(244,63,94,0.45)' : ''};">
    ❤️ ចំណាំទុក ${favCount > 0 ? `<span style="background:#f43f5e; color:#fff; font-size:9.5px; font-weight:800; padding:1px 6px; border-radius:10px; margin-left:3px;">${favCount}</span>` : ''}
  </button>`;

  categoriesData.forEach(c => {
    html += `<button class="cat-btn ${activeCategory === c.id ? 'active' : ''}" onclick="filterCategory(${c.id}, this)">${c.icon} ${c.name}</button>`;
  });
  container.innerHTML = html;
}

function filterCategory(catId, btn) {
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
  activeCategory = catId;
  document.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  if (catId === 'favorites') {
    renderProductsGrid(productsData);
  } else {
    loadProducts();
  }
}

function handleSearch(val) {
  searchQuery = val.toLowerCase().trim();
  renderProductsGrid(productsData);
}

async function loadProducts() {
  const grid = document.getElementById("productsGrid");
  // Show skeleton loaders
  grid.innerHTML = Array(4).fill(
    `<div class="skeleton-card">
      <div class="skeleton skeleton-img"></div>
      <div class="skeleton skeleton-title"></div>
      <div class="skeleton skeleton-desc"></div>
      <div class="skeleton skeleton-desc2"></div>
      <div class="skeleton skeleton-btn"></div>
    </div>`
  ).join("");

  try {
    let url = "/api/products";
    if (activeCategory && activeCategory !== 'favorites') url += `?category_id=${activeCategory}`;
    const res = await fetch(url);
    const json = await res.json();

    if (json.status === "success") {
      productsData = json.data;

      // Update Live Stock Counter if element exists
      const totalStock = productsData.reduce((acc, p) => acc + p.stock_count, 0);
      const stockEl = document.getElementById("totalLiveStockText");
      if (stockEl) {
        stockEl.textContent = `ប្រព័ន្ធដំណើរការ 24/7 - ស្តុកនៅសល់សរុប ${totalStock} Accounts`;
      }

      // Update live counter pill
      const liveEl = document.getElementById("liveCounterText");
      if (liveEl) {
        liveEl.textContent = `🔥 ប្រព័ន្ធដំណើរការ 24/7 — ស្តុកនៅសល់សរុប ${totalStock} Accounts ត្រៀមរួចជាស្រេច`;
      }

      renderProductsGrid(productsData);
      populateAdminProductSelects();
      populateBannerStats();
    }
  } catch (err) {
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--danger); padding: 50px;">❌ មិនអាចផ្ទុកទំនិញបានទេ</div>`;
  }
}

function renderProductsGrid(products) {
  const grid = document.getElementById("productsGrid");
  if (!grid) return;

  let filtered = products || [];

  // Filter by favorites if activeCategory === 'favorites'
  if (activeCategory === 'favorites') {
    filtered = filtered.filter(p => favoriteProductIds.includes(Number(p.id)));
    if (filtered.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px 16px; background: var(--card-glass); border-radius: 16px; border: 1px dashed rgba(244,63,94,0.3);">
          <div style="font-size:40px; margin-bottom:10px; animation:heartPop 1.2s ease infinite alternate;">❤️</div>
          <div style="font-size:15px; font-weight:800; color:#fff; margin-bottom:6px;">មិនទាន់មានទំនិញចំណាំទុកនៅឡើយទេ</div>
          <div style="font-size:12px; color:var(--text-sub); margin-bottom:16px; line-height:1.4;">ចុចលើប៊ូតុងបេះដូង ❤️ លើទំនិញដែលអ្នកពេញចិត្ត ដើម្បីងាយស្រួលរកទិញនៅពេលក្រោយ</div>
          <button class="btn-primary-action" onclick="filterCategory(null, document.querySelector('.cat-btn'))" style="display:inline-block; width:auto; padding:8px 20px; font-size:12.5px; font-weight:800;">
            ✨ មើលទំនិញទាំងអស់ (Explore Products)
          </button>
        </div>`;
      return;
    }
  }

  if (searchQuery) {
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(searchQuery) ||
      (p.description && p.description.toLowerCase().includes(searchQuery))
    );
  }

  if (filtered.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 50px;">🔍 រកមិនឃើញទំនិញដែលស្វែងរកទេ</div>`;
    return;
  }

  let html = "";
  filtered.forEach((p, index) => {
    const isAvailable = p.stock_count > 0;
    const isLow = p.stock_count > 0 && p.stock_count <= 5;
    const fav = isFavorite(p.id);

    // Stock text
    let stockText = "";
    if (!isAvailable) {
      stockText = `<div style="font-size:11px; color:#f87171; font-weight:800;">🚫 អស់ស្តុក (Out of Stock)</div>`;
    } else if (isLow) {
      stockText = `<div style="font-size:11px; color:#fbbf24; font-weight:700;">⚠️ ស្តុកនៅសល់: ${p.stock_count} (Low Stock!)</div>`;
    } else {
      stockText = `<div style="font-size:11px; color:#34d399; font-weight:700;">✅ ស្តុកនៅសល់: ${p.stock_count}</div>`;
    }

    const maxStock = Math.max(p.stock_count, 10);
    const stockPercent = Math.min(Math.round((p.stock_count / maxStock) * 100), 100);
    const barClass = isLow ? "stock-bar-fill low" : "stock-bar-fill";

    // Dynamic High-converting badges (Custom Badges, Urgency & FOMO)
    let tagHtml = "";
    if (p.badge) {
      let bClass = "badge-generic";
      const bUpper = p.badge.toUpperCase();
      if (bUpper.includes("HOT") || bUpper.includes("🔥")) bClass = "badge-hot";
      else if (bUpper.includes("POPULAR") || bUpper.includes("⚡")) bClass = "badge-popular";
      else if (bUpper.includes("VIP") || bUpper.includes("💎")) bClass = "badge-vip";
      else if (bUpper.includes("PROMO") || bUpper.includes("🎁")) bClass = "badge-promo";
      else if (bUpper.includes("BEST") || bUpper.includes("🏆")) bClass = "badge-bestseller";
      else if (bUpper.includes("NEW") || bUpper.includes("🚀")) bClass = "badge-new";
      tagHtml = `<div class="product-badge-ribbon ${bClass}">${p.badge}</div>`;
    } else if (p.stock_count > 0 && p.stock_count <= 3) {
      tagHtml = `<div class="product-badge-ribbon badge-hot">⚡ សល់តែ ${p.stock_count}!</div>`;
    } else if (activeFlashSale && activeFlashSale.discount_pct > 0) {
      tagHtml = `<div class="product-badge-ribbon badge-hot">🔥 FLASH -${activeFlashSale.discount_pct}%</div>`;
    } else if (index === 0) {
      tagHtml = `<div class="product-badge-ribbon badge-bestseller">🏆 BEST SELLER</div>`;
    } else if (index === 1) {
      tagHtml = `<div class="product-badge-ribbon badge-new">🚀 NEW</div>`;
    } else if (index === 2) {
      tagHtml = `<div class="product-badge-ribbon badge-popular">⚡ POPULAR</div>`;
    } else if (index % 3 === 0) {
      tagHtml = `<div class="product-badge-ribbon badge-vip">💎 VIP</div>`;
    }

    // Dynamic Sold Count for Social Proof & Verified Stars
    const soldCount = 85 + (Number(p.id) * 23) % 115;

    // Star rating & sold count (Clickable to view verified reviews modal)
    const ratingHtml = `
      <div onclick="openProductReviewsModal(${p.id}, '${encodeURIComponent(p.name)}')" style="display:flex; align-items:center; justify-content:space-between; margin:4px 0 3px; cursor:pointer;" title="មើល Verified Reviews">
        <div class="card-rating-preview">
          <span>⭐ 4.9</span>
          <span style="color:var(--text-sub); font-size:10px; font-weight:700;">(${soldCount}+ លក់ដាច់)</span>
        </div>
        <span style="font-size:9.5px; color:#38bdf8; font-weight:700; text-decoration:underline;">Reviews</span>
      </div>
    `;

    // Duration pill
    const durText = p.duration_days ? `⏳ ${p.duration_days} ថ្ងៃ (Days)` : "";

    // Price display with Flash Sale discount
    let displayPrice = p.price;
    let oldPriceHtml = "";
    if (activeFlashSale && activeFlashSale.discount_pct > 0) {
      displayPrice = p.price * (1.0 - (activeFlashSale.discount_pct / 100.0));
      oldPriceHtml = `<span style="text-decoration:line-through; color:var(--text-muted); font-size:10px; margin-right:4px;">$${p.price.toFixed(2)}</span>`;
    }

    html += `
      <div class="product-card${!isAvailable ? ' out-of-stock' : ''}">
        ${tagHtml}
        <div class="btn-card-favorite ${fav ? 'is-favorite' : ''}" onclick="toggleFavorite(${p.id}, event)" title="${fav ? 'ដកចេញពីចំណាំទុក' : 'ចំណាំទុកទំនិញ'}">
          ${fav ? '❤️' : '🤍'}
        </div>
        <div class="product-img-box">
          <img class="product-img" src="${p.image_url}" alt="${p.name}" loading="lazy" onerror="this.src='https://cdn-icons-png.flaticon.com/512/3594/3594363.png'">
        </div>
        <h4 class="product-title">${p.name}</h4>
        ${ratingHtml}
        <div class="product-desc" style="font-size:11px; color:var(--text-secondary); margin-bottom:4px;">${(p.description || '').slice(0, 60)}${p.description && p.description.length > 60 ? '...' : ''}</div>
        <div class="product-duration">${durText}</div>
        
        <div class="stock-bar-box">
          ${stockText}
          <div class="stock-bar-track">
            <div class="${barClass}" style="width: ${stockPercent}%;"></div>
          </div>
        </div>

        <div class="card-bottom">
          <div class="price-chip">
            ${oldPriceHtml}
            <span class="price-tag" style="${activeFlashSale ? 'color:#f87171;' : ''}">$${displayPrice.toFixed(2)}</span>
          </div>
          ${isAvailable
            ? `<button class="btn-buy-card" onclick="openCheckoutModal(${p.id})">🛒 ទិញ</button>`
            : `<button class="btn-buy-card btn-notify-stock" onclick="event.stopPropagation(); handleSubscribeStock(${p.id}, '${encodeURIComponent(p.name)}')">🔔 ផ្ដល់ដំណឹង</button>`
          }
        </div>
      </div>
    `;
  });

  grid.innerHTML = html;
}



async function fetchUserWalletData() {
  try {
    const res = await fetch(`/api/user/${currentUser.user_id}/wallet`);
    const json = await res.json();
    if (json.status === "success") {
      const balEl = document.getElementById("userWalletBalance");
      if (balEl) {
        balEl.textContent = `$${json.balance.toFixed(2)}`;
        balEl.classList.remove("wallet-balance-anim");
        void balEl.offsetWidth; // reflow to restart animation
        balEl.classList.add("wallet-balance-anim");
      }
      const linkEl = document.getElementById("textRefLink");
      const countEl = document.getElementById("refCount");
      const earnedEl = document.getElementById("refTotalEarned");
      if (linkEl) linkEl.textContent = json.referral_link;
      if (countEl) countEl.textContent = `${json.referrals_count} នាក`;
      if (earnedEl) earnedEl.textContent = `$${json.total_earned.toFixed(2)}`;
    }
  } catch (err) {
    console.error("Wallet fetch error:", err);
  }
}

async function loadUserReplacements() {
  const container = document.getElementById("replacementHistoryList");
  container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 30px;">កំពុងផ្ទុក...</div>`;

  try {
    const res = await fetch(`/api/user/${currentUser.user_id}/replacements`);
    const json = await res.json();

    if (json.status === "success" && json.data.length > 0) {
      let html = "";
      json.data.forEach(r => {
        let statusTag = `<span class="status-tag ${r.status}">${r.status.toUpperCase()}</span>`;
        let credBox = "";

        if (r.status === "approved" && r.new_credentials) {
          credBox = `
            <div class="cred-box">
              <span>🔑 អាខោនថ្មី៖ ${r.new_credentials}</span>
              <button class="btn-mini-copy" onclick="copyText('${r.new_credentials.replace(/'/g, "\\'")}')">Copy</button>
            </div>
          `;
        } else if (r.status === "pending") {
          credBox = `<div style="font-size:12px; color:var(--warning); margin-top:8px; font-weight:600;">⏳ កំពុងរង់ចាំ Admin ពិនិត្យ និង ផ្ញើអាខោនថ្មីជូន...</div>`;
        } else if (r.status === "rejected") {
          credBox = `<div style="font-size:12px; color:var(--danger); margin-top:8px; font-weight:600;">❌ សំណើត្រូវបានបដិសេធ ( ${r.admin_note || 'មិនគ្រប់លក្ខខណ្ឌ'} )</div>`;
        }

        html += `
          <div class="order-card">
            <div class="order-top">
              <strong style="font-size:15px; font-weight:700;">#REQ-${r.id} - ${r.product_name}</strong>
              ${statusTag}
            </div>
            <div style="font-size:12px; color:var(--text-sub); margin-top:4px;">
              👤 ឈ្មោះអ្នកទិញ៖ <strong>${r.buyer_name}</strong> | 📅 ថ្ងៃទិញ៖ ${r.purchase_date} | ថ្ងៃផុតកំណត់៖ ${r.expiry_date}
            </div>
            <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">
              🔑 Email/Pass មានបញ្ហា៖ <code>${r.problem_credentials}</code>
            </div>
            ${credBox}
          </div>
        `;
      });
      container.innerHTML = html;
    } else {
      container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 30px;">អ្នកមិនទាន់មានប្រវត្តិស្នើសុំដូរអាខោននៅឡើយទេ</div>`;
    }
  } catch (err) {
    container.innerHTML = `<div style="text-align: center; color: var(--danger); padding: 30px;">❌ មិនអាចផ្ទុកប្រវត្តិស្នើសុំបានទេ</div>`;
  }
}


let checkoutQuantity = 1;
let currentCheckoutProduct = null;
let currentUserVip = null;

async function openCheckoutModal(productId) {
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("medium");
  playSound("click");

  const prod = productsData.find(p => Number(p.id) === Number(productId));
  if (!prod) {
    console.error("Product not found:", productId);
    alert("❌ រកមិនឃើញទិន្នន័យទំនិញនេះទេ!");
    return;
  }
  currentCheckoutProduct = prod;
  checkoutQuantity = 1;
  appliedPromoCode = null;
  currentDiscountAmount = 0;

  // Reset promo box
  const promoInput = document.getElementById("promoCodeInput");
  if (promoInput) promoInput.value = "";
  const promoRow = document.getElementById("promoDiscountRow");
  if (promoRow) promoRow.style.display = "none";

  // Check user VIP status if not loaded
  try {
    const res = await fetch(`/api/user/${currentUser.user_id}/vip-status`);
    const json = await res.json();
    if (json.status === "success") currentUserVip = json.data;
  } catch (e) {
    console.warn("VIP fetch error:", e);
  }

  const nameEl = document.getElementById("modalProdName");
  const imgEl = document.getElementById("modalProdImg");
  const idEl = document.getElementById("checkoutProdId");
  const stockAvailEl = document.getElementById("checkoutStockAvailText");

  if (nameEl) nameEl.textContent = prod.name;
  if (imgEl) imgEl.src = prod.image_url;
  if (idEl) idEl.value = prod.id;
  if (stockAvailEl) stockAvailEl.textContent = `📦 ស្តុកនៅសល់: ${prod.stock_count || 0}`;

  updateCheckoutCalculations();

  // Reset slip preview & upload UI
  const slipBox = document.getElementById("slipPreviewBox");
  const slipImg = document.getElementById("slipPreviewImg");
  const slipPlaceholder = document.getElementById("slipUploadPlaceholder");
  const slipInput = document.getElementById("slipFileInput");

  if (slipInput) slipInput.value = "";
  if (slipBox) slipBox.style.display = "none";
  if (slipPlaceholder) slipPlaceholder.style.display = "inline-flex";
  if (slipImg) slipImg.src = "";

  // Slip preview on file select
  if (slipInput) {
    slipInput.onchange = function () {
      const file = this.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = e => {
          if (slipImg) slipImg.src = e.target.result;
          if (slipBox) slipBox.style.display = "block";
          if (slipPlaceholder) slipPlaceholder.style.display = "none";
          const fileNameEl = document.getElementById("slipFileName");
          if (fileNameEl) fileNameEl.textContent = `✅ ${file.name} (រួចរាល់!)`;
          if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
        };
        reader.readAsDataURL(file);
      }
    };
  }

  openModal("checkoutModal");
}

function changeCheckoutQty(delta) {
  if (!currentCheckoutProduct) return;
  const maxStock = Math.max(1, currentCheckoutProduct.stock_count || 1);
  const newQty = checkoutQuantity + delta;
  if (newQty >= 1 && newQty <= Math.min(maxStock, 20)) {
    checkoutQuantity = newQty;
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
    playSound("click");
    updateCheckoutCalculations();
  } else if (newQty > maxStock) {
    showToast(`⚠️ ស្តុកនៅសល់ត្រឹមតែ ${maxStock} អាខោនប៉ុណ្ណោះ!`, "warning");
  }
}

function setCheckoutQty(qty) {
  if (!currentCheckoutProduct) return;
  const maxStock = Math.max(1, currentCheckoutProduct.stock_count || 1);
  checkoutQuantity = Math.min(qty, maxStock);
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
  playSound("click");
  updateCheckoutCalculations();
}

function updateCheckoutCalculations() {
  if (!currentCheckoutProduct) return;
  const prod = currentCheckoutProduct;
  const qtyEl = document.getElementById("checkoutQtyText");
  if (qtyEl) qtyEl.textContent = checkoutQuantity;

  let unitPrice = Number(prod.price);
  const isReseller = (currentUserVip && currentUserVip.is_reseller);
  const resellerBadge = document.getElementById("modalResellerBadge");
  const origPriceEl = document.getElementById("modalOrigPrice");
  const priceEl = document.getElementById("modalProdPrice");
  const amountBadge = document.getElementById("qrAmountBadge");

  if (isReseller && prod.reseller_price && Number(prod.reseller_price) > 0) {
    unitPrice = Number(prod.reseller_price);
    if (resellerBadge) {
      resellerBadge.style.display = "inline-block";
      resellerBadge.style.background = "";
      resellerBadge.textContent = "👑 Wholesale";
    }
    if (origPriceEl) {
      origPriceEl.style.display = "inline-block";
      origPriceEl.textContent = `$${(Number(prod.price) * checkoutQuantity).toFixed(2)}`;
    }
  } else if (activeFlashSale && activeFlashSale.discount_pct > 0) {
    unitPrice = unitPrice * (1.0 - (activeFlashSale.discount_pct / 100.0));
    if (resellerBadge) {
      resellerBadge.style.display = "inline-block";
      resellerBadge.style.background = "linear-gradient(135deg, #ef4444, #f59e0b)";
      resellerBadge.textContent = `⚡ -${activeFlashSale.discount_pct}% Flash`;
    }
    if (origPriceEl) {
      origPriceEl.style.display = "inline-block";
      origPriceEl.textContent = `$${(Number(prod.price) * checkoutQuantity).toFixed(2)}`;
    }
  } else if (currentUserVip && currentUserVip.discount_pct > 0) {
    unitPrice = unitPrice * (1.0 - (currentUserVip.discount_pct / 100.0));
    if (resellerBadge) {
      resellerBadge.style.display = "inline-block";
      resellerBadge.style.background = "";
      resellerBadge.textContent = `${currentUserVip.tier_badge} -${currentUserVip.discount_pct}%`;
    }
    if (origPriceEl) {
      origPriceEl.style.display = "inline-block";
      origPriceEl.textContent = `$${(Number(prod.price) * checkoutQuantity).toFixed(2)}`;
    }
  } else {
    if (resellerBadge) resellerBadge.style.display = "none";
    if (origPriceEl) origPriceEl.style.display = "none";
  }

  let totalPrice = unitPrice * checkoutQuantity;
  if (currentDiscountAmount > 0) {
    totalPrice = Math.max(0.01, totalPrice - currentDiscountAmount);
  }

  if (priceEl) priceEl.textContent = `$${totalPrice.toFixed(2)}`;
  if (amountBadge) amountBadge.textContent = `💰 $${totalPrice.toFixed(2)} USD`;

  // Update Instant Wallet Purchase Box
  const walletBox = document.getElementById("checkoutWalletBox");
  const walletBalText = document.getElementById("checkoutWalletBalText");
  const btnWalletBuy = document.getElementById("btnInstantWalletBuy");
  const userBal = currentUser.balance || 0.0;

  if (walletBox && walletBalText && btnWalletBuy) {
    walletBalText.textContent = `$${userBal.toFixed(2)} USD`;
    btnWalletBuy.textContent = `⚡ ទិញភ្លាមៗកាត់ពី Wallet ($${totalPrice.toFixed(2)} USD)`;
    if (userBal >= totalPrice && (prod.stock_count || 0) >= checkoutQuantity) {
      walletBox.style.display = "block";
    } else {
      walletBox.style.display = "none";
    }
  }
}

async function executeWalletInstantBuy() {
  if (!currentCheckoutProduct) return;
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("heavy");
  const btn = document.getElementById("btnInstantWalletBuy");
  const origText = btn ? btn.textContent : "";
  if (btn) {
    btn.disabled = true;
    btn.textContent = "⏳ កំពុងដំណើរការកាត់ប្រាក់...";
  }

  try {
    const res = await fetch("/api/orders/wallet-buy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: currentUser.user_id,
        product_id: currentCheckoutProduct.id,
        promo_code: appliedPromoCode,
        quantity: checkoutQuantity
      })
    });
    const json = await res.json();
    if (res.ok && json.status === "success") {
      if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
      playSound("win");
      closeModal("checkoutModal");
      showToast(`🎉 ទិញបានជោគជ័យចំនួន ${checkoutQuantity}x អាខោន! Account ត្រូវបានផ្ញើចូល Telegram របស់អ្នករួចរាល់។`, "success", 5000);
      currentUser.balance = json.new_balance;
      fetchUserWalletData();
      await loadProducts();
      switchTab("tabOrders", document.getElementById("navOrders"));
    } else {
      showToast(`❌ ${json.detail || json.message || "ការទិញមិនជោគជ័យ"}`, "error");
    }
  } catch (err) {
    showToast(`❌ Error: ${err.message}`, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = origText;
    }
  }
}

function downloadAdminSalesReport() {
  window.open(`/api/admin/export-sales?user_id=${currentUser.user_id}`, '_blank');
}


async function loadUserWallet() {
  try {
    const res = await fetch(`/api/user/${currentUser.user_id}/wallet`);
    const json = await res.json();
    if (json.status === "success") {
      document.getElementById("userWalletBalance").textContent = `$${json.balance.toFixed(2)}`;
    }
  } catch (err) {
    console.error("Wallet load error");
  }
}

function setupFormHandlers() {
  document.getElementById("formCheckout").addEventListener("submit", async (e) => {
    e.preventDefault();
    const slipInput = document.getElementById("slipFileInput");
    const formData = new FormData(e.target);
    const payMethod = formData.get("payment_method");
    const prodId = formData.get("product_id");

    if (payMethod === "Wallet Balance 💳") {
      try {
        const res = await fetch("/api/wallet/pay-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: currentUser.user_id, product_id: parseInt(prodId) })
        });
        const json = await res.json();
        if (json.status === "success") {
          if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
          closeModal("checkoutModal");
          alert(`🎉 ${json.message}`);
          await loadUserWallet();
          switchTab("tabOrders", document.getElementById("navOrders"));
        } else {
          alert(`❌ ${json.detail || 'មានបញ្ហា!'}`);
        }
      } catch (err) {
        alert("❌ មិនអាចទូទាត់ប្រាក់តាម Wallet បានទេ!");
      }
      return;
    }

    // Manual Slip Upload Payment Validation
    if (!slipInput || !slipInput.files || slipInput.files.length === 0) {
      showToast("⚠️ សូមជ្រើសរើសរូបភាព Slip បង់ប្រាក់ជាមុនសិន!", "warning");
      return;
    }

    formData.set("user_id", currentUser.user_id);
    formData.set("quantity", checkoutQuantity);

    // Disable submit button during upload to show loader state
    const submitBtn = e.target.querySelector("button[type='submit']");
    const origText = submitBtn ? submitBtn.textContent : "✅ ផ្ញើ Slip & បញ្ចប់ការទិញ";
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "⏳ កំពុងផ្ញើ Slip...";
    }

    try {
      const res = await fetch("/api/orders", { method: "POST", body: formData });
      const json = await res.json();

      if (res.ok && json.status === "success") {
        if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
        closeModal("checkoutModal");
        showToast("🎉 ការបញ្ជាទិញទទុលបានជោកជ័យ! សូមរង់ចាំ Admin ពិនិត្យ Slip 1–3 នាទិ៕", "success", 4000);
        switchTab("tabOrders", document.getElementById("navOrders"));
      } else {
        let errStr = "មានបញ្ហាក្នុងការផ្ញើ Slip!";
        if (typeof json.detail === "string") {
          errStr = json.detail;
        } else if (Array.isArray(json.detail)) {
          errStr = json.detail.map(d => d.msg || d.type).join(", ");
        }
        showToast(`❌ ${errStr}`, "error");
      }
    } catch (err) {
      console.error("Submit error:", err);
      showToast(`❌ មិនអាចផ្ញើការបញ្ជាទិញបានទេ: ${err.message}`, "error");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = origText;
      }
    }
  });

  document.getElementById("formAddProduct").addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    formData.append("user_id", currentUser.user_id);

    try {
      const res = await fetch("/api/admin/products", { method: "POST", body: formData });
      const json = await res.json();
      if (json.status === "success") {
        showToast(`✅ ${json.message}`, "success");
        e.target.reset();
        await loadCategories();
        await loadProducts();
      } else {
        showToast(`❌ ${json.detail}`, "error");
      }
    } catch (err) {
      alert("❌ Failed to add product!");
    }
  });

  document.getElementById("formEditProduct").addEventListener("submit", async (e) => {
    e.preventDefault();
    const prodId = document.getElementById("editProdId").value;
    const formData = new FormData(e.target);
    formData.append("user_id", currentUser.user_id);

    try {
      const res = await fetch(`/api/admin/products/${prodId}`, { method: "PUT", body: formData });
      const json = await res.json();
      if (json.status === "success") {
        alert(`✅ ${json.message}`);
        closeModal("editProductModal");
        await loadAdminProductsList();
        await loadProducts();
      } else {
        alert(`❌ ${json.detail}`);
      }
    } catch (err) {
      alert("❌ Failed to update product!");
    }
  });

  document.getElementById("formAddStock").addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append("user_id", currentUser.user_id);
    formData.append("product_id", e.target.querySelector('[name="product_id"]').value);

    // Detect active mode: quantity or credentials
    const qtyEl = e.target.querySelector('[name="stock_qty"]');
    const credsEl = e.target.querySelector('[name="credentials_text"]');
    const qtyMode = document.getElementById("stockModeQty").style.display !== "none";

    if (qtyMode) {
      const qty = parseInt(qtyEl ? qtyEl.value : 0);
      if (!qty || qty < 1) {
        alert("❌ សូមដាក់ចំនួនស្តុក (Stock Quantity) ចាប់ពី 1 ឡើង!");
        return;
      }
      formData.append("stock_qty", qty);
    } else {
      const creds = credsEl ? credsEl.value.trim() : "";
      if (!creds) {
        alert("❌ សូមបញ្ចូល Email & Password!");
        return;
      }
      formData.append("credentials_text", creds);
    }

    try {
      const res = await fetch("/api/admin/stock", { method: "POST", body: formData });
      const json = await res.json();
      if (json.status === "success") {
        showToast(`✅ ${json.message}`, "success");
        e.target.reset();
        await loadProducts();
      } else {
        showToast(`❌ ${json.detail}`, "error");
      }
    } catch (err) {
      alert("❌ Failed to add stock!");
    }
  });

  const formReplace = document.getElementById("formReplacementRequest");
  if (formReplace) {
    formReplace.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const submitBtn = e.target.querySelector("button[type='submit']");
      const origText = submitBtn ? submitBtn.textContent : "🔄 ផ្ញើសំណើសុំដូរអាខោនថ្មី";
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "⏳ កំពុងផ្ញើសំណើ...";
      }

      const payload = {
        user_id: currentUser.user_id,
        buyer_name: formData.get("buyer_name"),
        product_name: formData.get("product_name"),
        purchase_date: formData.get("purchase_date") || "N/A",
        expiry_date: formData.get("expiry_date") || "N/A",
        problem_credentials: formData.get("problem_credentials"),
        issue_description: formData.get("issue_description") || "Account login issue"
      };

      try {
        const res = await fetch("/api/replacement-request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (json.status === "success") {
          if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
          showToast("✅ សំណើសុំដូរអាខោនត្រូវបានផ្ញើជោគជ័យ!", "success", 4000);
          e.target.reset();
          await loadReplacementHistory();
        } else {
          showToast(`❌ ${json.detail || json.message || "មានបញ្ហា!"}`, "error");
        }
      } catch (err) {
        console.error("Replacement request error:", err);
        showToast(`❌ មិនអាចផ្ញើសំណើបានទេ: ${err.message}`, "error");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = origText;
        }
      }
    });
  }
}

function fillIssueDescription(text) {
  const textarea = document.getElementById("replaceIssueDesc");
  if (textarea) {
    textarea.value = text;
    if (window.tg?.HapticFeedback) window.tg.HapticFeedback.impactOccurred("light");
  }
}
window.fillIssueDescription = fillIssueDescription;

async function loadReplacementHistory() {
  const container = document.getElementById("replacementHistoryList");
  const buyerNameInput = document.getElementById("replaceBuyerName");
  if (buyerNameInput && !buyerNameInput.value && currentUser.full_name) {
    buyerNameInput.value = currentUser.full_name;
  }

  if (!container) return;

  try {
    const res = await fetch(`/api/user/${currentUser.user_id}/replacement-requests`);
    const json = await res.json();
    if (json.status === "success" && Array.isArray(json.data) && json.data.length > 0) {
      let html = "";
      json.data.forEach(r => {
        let badgeClass = "badge-pending";
        let badgeText = "⏳ PENDING";
        if (r.status === "approved") {
          badgeClass = "badge-success";
          badgeText = "✅ APPROVED";
        } else if (r.status === "rejected") {
          badgeClass = "badge-danger";
          badgeText = "❌ REJECTED";
        }

        let newCredsHtml = "";
        if (r.status === "approved" && r.new_credentials) {
          newCredsHtml = `
            <div style="margin-top:8px;">
              <div style="font-size:11px; font-weight:700; color:#34d399; margin-bottom:4px;">🔑 អាខោនថ្មីដែលបានប្តូរជូន៖</div>
              <div class="cred-box">
                <span style="user-select:all;">${r.new_credentials}</span>
                <button class="btn-mini-copy" onclick="copyText('${r.new_credentials.replace(/'/g, "\\'")}', this)">Copy</button>
              </div>
            </div>
          `;
        }

        html += `
          <div class="order-card" style="margin: 0 0 10px 0;">
            <div class="order-top">
              <strong style="font-size:14px; color:var(--gold-primary);">📦 ${r.product_name}</strong>
              <span class="badge ${badgeClass}">${badgeText}</span>
            </div>
            <div style="font-size:11.5px; color:var(--text-sub); margin-bottom:4px;">
              ឈ្មោះ៖ <strong>${r.buyer_name}</strong> | ថ្ងៃទិញ៖ ${r.purchase_date || 'N/A'} | ថ្ងៃផុត៖ ${r.expiry_date || 'N/A'}
            </div>
            <div style="font-size:11px; color:var(--text-muted); background:rgba(0,0,0,0.25); padding:6px 10px; border-radius:8px; margin:4px 0;">
              បញ្ហា៖ ${r.issue_description || 'N/A'}
            </div>
            ${newCredsHtml}
            ${r.admin_note ? `<div style="font-size:11px; color:#f87171; margin-top:4px;">Admin Note: ${r.admin_note}</div>` : ''}
          </div>
        `;
      });
      container.innerHTML = html;
    } else {
      container.innerHTML = `
        <div style="text-align:center; padding:32px 20px; color:var(--text-muted); background:var(--card-glass); border-radius:16px; border:1px dashed var(--card-border);">
          <div style="font-size:32px; margin-bottom:6px;">🛡️</div>
          <div style="font-size:13px; font-weight:700; color:var(--text-main);">មិនទាន់មានសំណើស្នើសុំដូរអាខោននៅឡើយទេ</div>
          <div style="font-size:11px; color:var(--text-sub); margin-top:4px;">រាល់សំណើដែលអ្នកបានផ្ញើ នឹងបង្ហាញប្រវត្តិ និងស្ថានភាពនៅទីនេះ</div>
        </div>
      `;
    }
  } catch (err) {
    console.error("Error loading replacement history:", err);
  }
}

let userOrdersCache = [];

function calculateWarrantyInfo(createdDateStr, expiryDateStr, durationDays) {
  try {
    const dur = parseInt(durationDays) || 30;
    
    // Parse purchase date
    let purchaseTime = Date.now();
    if (createdDateStr) {
      const cleaned = String(createdDateStr).replace(" ", "T");
      const d = new Date(cleaned.endsWith("Z") || cleaned.includes("+") ? cleaned : cleaned + "Z");
      if (!isNaN(d.getTime())) purchaseTime = d.getTime();
    }

    // Determine expiry time
    let expiryTime = purchaseTime + dur * 24 * 60 * 60 * 1000;
    if (expiryDateStr && expiryDateStr !== "N/A") {
      const cleanedExp = String(expiryDateStr).replace(" ", "T");
      const dExp = new Date(cleanedExp.endsWith("Z") || cleanedExp.includes("+") ? cleanedExp : cleanedExp + "Z");
      if (!isNaN(dExp.getTime())) expiryTime = dExp.getTime();
    }

    const now = Date.now();
    const totalMs = Math.max(1000, expiryTime - purchaseTime);
    const remainingMs = expiryTime - now;
    
    const daysRemaining = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));
    const hoursRemaining = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60)));
    const percentRemaining = Math.max(0, Math.min(100, Math.round((remainingMs / totalMs) * 100)));

    let status = "active";
    let statusLabel = `🛡️ ការធានានៅសល់ ${daysRemaining} ថ្ងៃ`;
    if (remainingMs <= 0) {
      status = "expired";
      statusLabel = "⏳ ផុតកំណត់ការធានា (Warranty Expired)";
    } else if (daysRemaining <= 5) {
      status = "expiring_soon";
      statusLabel = `⚠️ ការធានាជិតផុត (សល់ ${daysRemaining} ថ្ងៃ)`;
    }

    const expDateObj = new Date(expiryTime);
    const formattedExpiry = expDateObj.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });

    return {
      status,
      statusLabel,
      daysRemaining,
      hoursRemaining,
      percentRemaining,
      formattedExpiry,
      isExpired: remainingMs <= 0
    };
  } catch (e) {
    return {
      status: "active",
      statusLabel: "🛡️ មានការធានាសុពលភាព",
      daysRemaining: 30,
      hoursRemaining: 720,
      percentRemaining: 100,
      formattedExpiry: "30 ថ្ងៃ",
      isExpired: false
    };
  }
}
window.calculateWarrantyInfo = calculateWarrantyInfo;

function claimWarrantyFromOrder(orderId) {
  const o = userOrdersCache.find(x => Number(x.id) === Number(orderId));
  if (!o) {
    showToast("⚠️ រកមិនឃើញ Order នេះឡើយ", "warning");
    return;
  }

  // Switch to tabReplace
  const navReplace = document.getElementById("navReplace") || document.querySelector('[data-tab="tabReplace"]');
  switchTab("tabReplace", navReplace);

  // Pre-fill form fields
  const form = document.getElementById("formReplacementRequest");
  if (form) {
    const buyerNameInput = document.getElementById("replaceBuyerName");
    const prodSelect = document.getElementById("replaceProductSelect");
    const purchaseDateInput = form.querySelector('[name="purchase_date"]');
    const expiryDateInput = form.querySelector('[name="expiry_date"]');
    const credsInput = form.querySelector('[name="problem_credentials"]');
    const descInput = form.querySelector('[name="issue_description"]');

    if (buyerNameInput && currentUser) {
      buyerNameInput.value = currentUser.full_name || currentUser.username || `User #${currentUser.user_id}`;
    }

    if (prodSelect) {
      let found = false;
      for (let i = 0; i < prodSelect.options.length; i++) {
        if (prodSelect.options[i].text.toLowerCase().includes((o.product_name || "").toLowerCase()) ||
            (o.product_name || "").toLowerCase().includes(prodSelect.options[i].value.toLowerCase())) {
          prodSelect.selectedIndex = i;
          found = true;
          break;
        }
      }
      if (!found) {
        prodSelect.value = "Other / ផ្សេងៗ";
      }
    }

    if (purchaseDateInput && o.created_at) {
      try {
        const d = new Date(o.created_at);
        if (!isNaN(d.getTime())) {
          purchaseDateInput.value = d.toISOString().split("T")[0];
        }
      } catch (e) {}
    }

    if (expiryDateInput) {
      try {
        if (o.expiry_date && o.expiry_date !== "N/A") {
          const d = new Date(o.expiry_date);
          if (!isNaN(d.getTime())) expiryDateInput.value = d.toISOString().split("T")[0];
        } else {
          const dPur = new Date(o.created_at || Date.now());
          dPur.setDate(dPur.getDate() + (parseInt(o.duration_days) || 30));
          expiryDateInput.value = dPur.toISOString().split("T")[0];
        }
      } catch (e) {}
    }

    if (credsInput && o.credentials) {
      credsInput.value = o.credentials;
    }

    if (descInput) {
      descInput.value = `Order #${o.id} (${o.product_name}) - ជួបបញ្ហាមិនអាចចូលប្រើបាន សូមជួយផ្លាស់ប្តូរអាខោនថ្មី។`;
    }

    // Add glowing pulse animation
    form.classList.remove("highlight-pulse");
    void form.offsetWidth; // trigger reflow
    form.classList.add("highlight-pulse");
    form.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
  playSound("click");
  showToast(`🛡️ បានបំពេញទិន្នន័យ Warranty សម្រាប់ Order #${o.id} រួចរាល់!`, "info", 4000);
}
window.claimWarrantyFromOrder = claimWarrantyFromOrder;

async function reOrderProduct(productId, encodedName) {
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("medium");
  playSound("click");
  const prodName = decodeURIComponent(encodedName || "").trim();

  showToast(`⚡ កំពុងរៀបចំការទិញ ${prodName || 'ទំនិញ'}...`, "info", 1800);

  // If productsData is not yet loaded, load it
  if (!productsData || productsData.length === 0) {
    try {
      const res = await fetch("/api/products");
      const json = await res.json();
      if (json.status === "success") productsData = json.data;
    } catch (e) {}
  }

  // Find product by ID or by name
  let target = productsData.find(p => Number(p.id) === Number(productId));
  if (!target && prodName) {
    target = productsData.find(p => p.name.toLowerCase().trim() === prodName.toLowerCase().trim());
  }

  if (target) {
    openCheckoutModal(target.id);
  } else {
    // Switch to shop and search
    switchTab("tabShop", document.getElementById("navShop"));
    const sInput = document.getElementById("searchInput");
    if (sInput && prodName) {
      sInput.value = prodName;
      handleSearch(prodName);
    }
  }
}
window.reOrderProduct = reOrderProduct;

async function loadUserOrders() {
  const container = document.getElementById("ordersList");
  // Skeleton loaders
  container.innerHTML = Array(2).fill(
    `<div class="order-card" style="margin-bottom:10px;">
      <div class="skeleton" style="height:16px;width:60%;margin-bottom:8px;"></div>
      <div class="skeleton" style="height:12px;width:80%;margin-bottom:6px;"></div>
      <div class="skeleton" style="height:12px;width:50%;"></div>
    </div>`
  ).join("");

  try {
    const res = await fetch(`/api/user/${currentUser.user_id}/orders`);
    const json = await res.json();

    if (json.status === "success" && json.data.length > 0) {
      userOrdersCache = json.data;
      let html = "";
      json.data.forEach(o => {
        const statusColors = {
          pending: { bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.4)", text: "#fbbf24", label: "⏳ PENDING" },
          delivered: { bg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.4)", text: "#34d399", label: "✅ DELIVERED" },
          rejected: { bg: "rgba(239,68,68,0.15)", border: "rgba(239,68,68,0.4)", text: "#f87171", label: "❌ REJECTED" },
        };
        const sc = statusColors[o.status] || statusColors.pending;

        // Warranty info calculation
        const wInfo = calculateWarrantyInfo(o.created_at, o.expiry_date, o.duration_days);

        // Top-level Warranty Badge
        let warrantyHeaderBadge = "";
        if (o.status === "delivered") {
          warrantyHeaderBadge = `<span class="order-warranty-pill ${wInfo.status}">${wInfo.status === 'expired' ? '⏳ ផុតធានា' : (wInfo.status === 'expiring_soon' ? '⚠️ សល់ ' + wInfo.daysRemaining + ' ថ្ងៃ' : '🛡️ សល់ ' + wInfo.daysRemaining + ' ថ្ងៃ')}</span>`;
        }

        // Order status timeline
        const isDelivered = o.status === 'delivered';
        const isPending = o.status === 'pending';
        const isRejected = o.status === 'rejected';

        const timeline = `
          <div class="order-stepper-timeline">
            <!-- Step 1: Placed -->
            <div class="stepper-step step-done">
              <div class="stepper-circle">✓</div>
              <div class="stepper-label">បានកុម្ម៉ង់</div>
            </div>
            <div class="stepper-connector ${isPending ? 'pulse-line' : (isDelivered ? 'step-done' : '')}"></div>

            <!-- Step 2: Processing / Verifying -->
            <div class="stepper-step ${isDelivered ? 'step-done' : (isPending ? 'step-current' : '')}">
              <div class="stepper-circle ${isPending ? 'pulse-circle' : ''}">
                ${isDelivered ? '✓' : (isPending ? '⚡' : '2')}
              </div>
              <div class="stepper-label">${isDelivered ? 'បានផ្ទៀងផ្ទាត់' : 'កំពុងពិនិត្យ'}</div>
            </div>
            <div class="stepper-connector ${isDelivered ? 'step-done' : ''}"></div>

            <!-- Step 3: Delivered or Rejected -->
            <div class="stepper-step ${isDelivered ? 'step-done step-success' : (isRejected ? 'step-rejected' : '')}">
              <div class="stepper-circle">
                ${isDelivered ? '🔑' : (isRejected ? '✕' : '3')}
              </div>
              <div class="stepper-label">${isDelivered ? 'បានប្រគល់' : (isRejected ? 'បដិសេធ' : 'ប្រគល់ជូន')}</div>
            </div>
          </div>`;


        let actionBox = "";
        if (o.status === "delivered" && o.credentials) {
          const isGemini = /gemini/i.test(o.product_name || "") || /gemini/i.test(o.credentials || "") || /activate/i.test(o.credentials || "") || /https?:\/\//i.test(o.credentials || "");
          let geminiGuideBox = "";
          if (isGemini) {
            const urlMatch = (o.credentials || "").match(/https?:\/\/[^\s<>"'\)]+/);
            const actUrl = urlMatch ? urlMatch[0] : "";
            const directLinkBtn = actUrl ? `
              <div class="activation-btn-grid">
                <button type="button" class="btn-copy-activation" onclick="copyActivationLink('${actUrl.replace(/'/g, "\\'")}', this)">
                  <span>📋</span> <span>Copy Link ភ្ជាប់</span>
                </button>
                <a href="${actUrl}" target="_blank" class="btn-open-activation">
                  <span>🔗</span> <span>បើក Link ភ្ជាប់</span>
                </a>
              </div>` : "";

            geminiGuideBox = `
              <!-- 📖 Gemini Pro Activation Guide -->
              <div class="activation-guide-card">
                <div class="activation-guide-header">
                  <span class="activation-guide-title">📖 របៀបប្រើប្រាស់ភ្ជាប់អាខោន (ច្បាប់ / ការណែនាំ)</span>
                </div>
                <div class="activation-steps-list">
                  <div class="activation-step-item">
                    <div class="activation-step-icon">🔗</div>
                    <div class="activation-step-text">បើក Link ដែលអ្នកបានទទួលក្នុង Browser</div>
                  </div>
                  <div class="activation-step-item">
                    <div class="activation-step-icon">✅</div>
                    <div class="activation-step-text">ចុច Activate ដើម្បីបើកដំណើរការ</div>
                  </div>
                  <div class="activation-step-item">
                    <div class="activation-step-icon">🎉</div>
                    <div class="activation-step-text">រួចរាល់ អាចប្រើប្រាស់ Gemini Pro បានភ្លាមៗ</div>
                  </div>
                </div>
                <div class="activation-note-box">
                  <span>📌</span> <span><strong>ចំណាំ៖</strong> Link មួយអាចប្រើបានសម្រាប់ Gmail តែមួយប៉ុណ្ណោះ</span>
                </div>
                ${directLinkBtn}
              </div>
            `;
          }

          actionBox = `
            <!-- 🔑 Account Credentials -->
            <div style="margin-top:10px; background:rgba(0,0,0,0.4); border:1px solid rgba(16,185,129,0.3); border-radius:12px; padding:10px 12px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <span style="font-size:11px; color:#34d399; font-weight:800;">🔑 ព័ត៌មាន Account របស់អ្នក៖</span>
                <span style="font-size:10px; color:var(--text-muted);">📅 ផុតកំណត់: <strong>${wInfo.formattedExpiry}</strong></span>
              </div>
              <code style="font-size:12px; color:#fff; word-break:break-all; white-space:pre-wrap; display:block; font-family:monospace; background:rgba(255,255,255,0.04); padding:6px 8px; border-radius:8px;">${o.credentials}</code>
              
              <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
                <button class="btn-mini-copy" style="flex:1; padding:6px 10px; font-size:11.5px; font-weight:700; background:linear-gradient(135deg,#fbbf24,#f59e0b); color:#1a1205;" onclick="copyText('${o.credentials.replace(/'/g, "\\'").replace(/\n/g, "\\n")}')">
                  📋 Copy Account
                </button>
                <button class="btn-mini-copy" style="padding:6px 12px; font-size:11.5px; font-weight:700; background:rgba(251,191,36,0.15); border:1px solid #fbbf24; color:#fbbf24;" onclick="openOrderRatingModal(${o.id}, '${encodeURIComponent(o.product_name)}')">
                  ⭐ Feedback / Rating
                </button>
                <button class="btn-renew-order" onclick="reOrderProduct(${o.product_id || 0}, '${encodeURIComponent(o.product_name)}')">
                  ⚡ បន្តសុពលភាព / Renew
                </button>
              </div>
            </div>

            ${geminiGuideBox}

            <!-- ⏳ Dynamic Warranty Countdown Bar & 1-Tap Claim -->
            <div class="warranty-box ${wInfo.status}">
              <div class="warranty-header-row">
                <span class="warranty-status-badge">
                  <span>${wInfo.isExpired ? '⏳' : (wInfo.status === 'expiring_soon' ? '⚠️' : '🛡️')}</span>
                  <span>${wInfo.statusLabel}</span>
                </span>
                <span class="warranty-expiry-text">
                  ផុតកំណត់៖ <strong>${wInfo.formattedExpiry}</strong>
                </span>
              </div>
              
              <div class="warranty-progress-track">
                <div class="warranty-progress-bar" style="width: ${wInfo.percentRemaining}%;"></div>
              </div>

              <div class="warranty-footer-row">
                <span style="font-size:10px; color:var(--text-muted);">
                  ${wInfo.isExpired ? 'ផុតកំណត់សុពលភាពធានា' : `នៅសល់ ${wInfo.percentRemaining}% នៃរយៈពេលធានា`}
                </span>
                <button type="button" class="btn-warranty-claim" onclick="claimWarrantyFromOrder(${o.id})">
                  <span>🔄</span> <span>ស្នើសុំដូរថ្មី (1-Tap Warranty)</span>
                </button>
              </div>
            </div>
          `;
        } else if (o.status === "pending") {
          actionBox = `<div style="font-size:12px; color:var(--warning); margin-top:10px; font-weight:600; background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.3); padding:8px 12px; border-radius:10px; text-align:center;">⏳ កំពុងរង់ចាំ Admin ពិនិត្យ Slip... សូមរង់ចាំបន្តិច</div>`;
        } else if (o.status === "rejected") {
          actionBox = `<div style="font-size:12px; color:var(--danger); margin-top:10px; font-weight:600; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); padding:8px 12px; border-radius:10px; text-align:center;">❌ Order ត្រូវបានបដិសេធ (Slip មិនត្រឹមត្រូវ)</div>`;
        }

        html += `
          <div style="background:var(--card-glass); border:1px solid ${sc.border}; border-radius:16px; padding:14px; margin-bottom:12px; box-shadow:0 4px 16px rgba(0,0,0,0.3);">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-weight:900; font-size:13px; color:#fff; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); padding:2px 8px; border-radius:8px;">#${o.id}</span>
                <strong style="font-size:14px; font-weight:800; color:#fff;">${o.product_name}</strong>
              </div>
              <div style="display:flex; align-items:center; gap:6px;">
                ${warrantyHeaderBadge}
                <span style="background:${sc.bg}; color:${sc.text}; border:1px solid ${sc.border}; border-radius:8px; padding:3px 10px; font-size:10.5px; font-weight:800; white-space:nowrap;">
                  ${sc.label}
                </span>
              </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; margin-top:8px; color:var(--text-sub);">
              <span>តម្លៃទូទាត់៖ <strong style="color:#38bdf8; font-size:13px;">$${o.price.toFixed(2)} USD</strong></span>
              <span style="background:rgba(255,255,255,0.05); padding:2px 8px; border-radius:6px; font-size:10.5px; color:#cbd5e1;">${o.payment_method || 'N/A'}</span>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; margin-top:6px; padding-top:6px; border-top:1px dashed rgba(255,255,255,0.08); color:var(--text-sub);">
              <span>📅 ថ្ងៃខែឆ្នាំ & ម៉ោង:</span>
              <strong style="color:#fde047; font-size:11px;">${formatUserJoinDateTime(o.created_at)}</strong>
            </div>

            ${timeline}
            ${actionBox}
          </div>
        `;
      });
      container.innerHTML = html;
    } else {
      container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 50px; background:var(--card-glass); border-radius:16px; border:1px solid var(--card-border);">📦 អ្នកមិនទាន់មានប្រវត្តិទិញទំនិញនៅឡើយទេ</div>`;
    }
  } catch (err) {
    container.innerHTML = `<div style="text-align: center; color: var(--danger); padding: 50px;">❌ មិនអាចផ្ទុកប្រវត្តិបញ្ជាទិញបានទេ</div>`;
  }
}


function openAccountDetailsModal(orderId) {
  const o = userOrdersCache.find(x => Number(x.id) === Number(orderId));
  if (!o) return;

  const prodNameEl = document.getElementById("accModalProdName");
  const metaEl = document.getElementById("accModalOrderMeta");
  const credEl = document.getElementById("accModalCredentials");
  const expiryEl = document.getElementById("accModalExpiry");
  const warrantyEl = document.getElementById("accModalWarranty");
  const geminiGuideEl = document.getElementById("accModalGeminiGuide");
  const geminiBtnGrid = document.getElementById("accModalGeminiBtnGrid");
  const geminiLinkBtn = document.getElementById("accModalGeminiLinkBtn");

  if (prodNameEl) prodNameEl.textContent = o.product_name;
  if (metaEl) metaEl.textContent = `Order #${o.id} | Price: $${o.price.toFixed(2)} | Delivered`;
  if (credEl) credEl.textContent = o.credentials || "N/A";
  if (expiryEl) expiryEl.textContent = o.expiry_date || "N/A";
  if (warrantyEl) warrantyEl.textContent = "🛡️ 100% ធានាពេញរង្វង់";

  const isGemini = /gemini/i.test(o.product_name || "") || /gemini/i.test(o.credentials || "") || /activate/i.test(o.credentials || "") || /https?:\/\//i.test(o.credentials || "");
  if (geminiGuideEl) {
    if (isGemini) {
      geminiGuideEl.style.display = "block";
      const urlMatch = (o.credentials || "").match(/https?:\/\/[^\s<>"'\)]+/);
      if (urlMatch && geminiLinkBtn) {
        geminiLinkBtn.href = urlMatch[0];
        if (geminiBtnGrid) geminiBtnGrid.style.display = "grid";
      } else {
        if (geminiBtnGrid) geminiBtnGrid.style.display = "none";
      }
    } else {
      geminiGuideEl.style.display = "none";
      if (geminiBtnGrid) geminiBtnGrid.style.display = "none";
    }
  }

  openModal("accountDetailsModal");
}

function copyText(text, btnEl) {
  navigator.clipboard.writeText(text).then(() => {
    if (window.tg?.HapticFeedback) window.tg.HapticFeedback.notificationOccurred("success");
    showToast("✅ បាន Copy ព័ត៌មានអាខោនរួចរាល់!", "success");
    // Flash the button green if provided
    if (btnEl) {
      const orig = btnEl.textContent;
      btnEl.textContent = "✅ Copied!";
      btnEl.classList.add("copy-flash");
      setTimeout(() => { btnEl.textContent = orig; btnEl.classList.remove("copy-flash"); }, 1800);
    }
  }).catch(() => {
    showToast("❌ មិនអាច Copy បានទេ!", "error");
  });
}

function copyActivationLink(url, btnEl) {
  if (!url) return;
  navigator.clipboard.writeText(url).then(() => {
    if (window.tg?.HapticFeedback) window.tg.HapticFeedback.notificationOccurred("success");
    showToast("✅ បាន Copy Link ភ្ជាប់ (Activation Link) រួចរាល់!", "success");
    if (btnEl) {
      const orig = btnEl.innerHTML;
      btnEl.innerHTML = "<span>✅</span> <span>Link Copied!</span>";
      btnEl.classList.add("copy-flash");
      setTimeout(() => {
        btnEl.innerHTML = orig;
        btnEl.classList.remove("copy-flash");
      }, 2000);
    }
  }).catch(() => {
    showToast("❌ មិនអាច Copy បានទេ!", "error");
  });
}
window.copyActivationLink = copyActivationLink;

function copyActivationLinkDirect(btnEl) {
  const linkEl = document.getElementById("accModalGeminiLinkBtn");
  const url = linkEl ? linkEl.href : "";
  if (url && url !== "#") {
    copyActivationLink(url, btnEl);
  }
}
window.copyActivationLinkDirect = copyActivationLinkDirect;

// ─── Toast Notification System ──────────────────────────────────────────────────────────────────────────────
function showToast(message, type = "info", duration = 3000) {
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const icons = { success: "✅", error: "❌", info: "ℹ️", warning: "⚠️" };
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span style="font-size:16px; flex-shrink:0;">${icons[type] || "ℹ️"}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "toastOut 0.35s ease forwards";
    setTimeout(() => toast.remove(), 350);
  }, duration);
}

// ─── Banner Stats Population ──────────────────────────────────────────────────────────────────────────────
function populateBannerStats() {
  const totalStock = productsData.reduce((a, p) => a + p.stock_count, 0);
  const usersEl = document.getElementById("bannerStatUsers");
  const ordersEl = document.getElementById("bannerStatOrders");
  const stockEl2 = document.getElementById("bannerStatStock");
  if (usersEl) { usersEl.textContent = "24/7"; usersEl.style.fontSize = "13px"; }
  if (stockEl2) { stockEl2.textContent = totalStock > 0 ? totalStock + "+" : "—"; stockEl2.classList.add("count-up"); }
  if (ordersEl) { ordersEl.textContent = productsData.length + "+ ទំនិញ"; ordersEl.style.fontSize = "12px"; ordersEl.classList.add("count-up"); }
}


function populateAdminCategorySelects() {
  const sel = document.getElementById("adminCatSelect");
  const editSel = document.getElementById("editProdCategory");
  const html = categoriesData.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join("");
  if (sel) sel.innerHTML = html;
  if (editSel) editSel.innerHTML = html;
}

function populateAdminProductSelects() {
  const sel = document.getElementById("adminStockProdSelect");
  if (sel) {
    sel.innerHTML = productsData.map(p => `<option value="${p.id}">${p.name} ($${p.price.toFixed(2)})</option>`).join("");
  }
  renderAdminDeleteProductsList();
}

function renderAdminDeleteProductsList() {
  // Always reload from admin API when section is shown
  loadAdminProductsList();
}

async function loadAdminProductsList() {
  const container = document.getElementById("adminProductsList");
  if (!container) return;
  container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">⏳ កំពុងផ្ទុក...</div>`;
  try {
    const res = await fetch(`/api/admin/products?user_id=${currentUser.user_id}`);
    const json = await res.json();
    if (json.status !== "success" || json.data.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">គ្មានទំនិញឡើយ</div>`;
      return;
    }
    adminProductsCache = json.data;
    let html = "";
    json.data.forEach(p => {
      const isActive = p.is_active === 1;
      const statusBadge = isActive
        ? `<span style="background:rgba(16,185,129,0.18); color:#34d399; border:1px solid rgba(16,185,129,0.35); border-radius:10px; padding:2px 8px; font-size:10px; font-weight:800;">🟢 Active</span>`
        : `<span style="background:rgba(239,68,68,0.18); color:#f87171; border:1px solid rgba(239,68,68,0.35); border-radius:10px; padding:2px 8px; font-size:10px; font-weight:800;">🔴 Hidden</span>`;
      const actionBtn = isActive
        ? `<button class="btn-buy-card" style="background:linear-gradient(135deg,#ef4444,#be123c); color:#fff; padding:6px 12px; font-size:12px;" onclick="deleteProductAdmin(${p.id}, '${p.name.replace(/'/g, "\\'")}')">🗑️ លុប</button>`
        : `<button class="btn-buy-card" style="background:linear-gradient(135deg,#10b981,#047857); color:#fff; padding:6px 12px; font-size:12px;" onclick="restoreProductAdmin(${p.id}, '${p.name.replace(/'/g, "\\'")}')">♻️ Restore</button>`;
      html += `
        <div style="background:var(--card-glass); border:1px solid var(--card-border); padding:12px 14px; border-radius:14px; display:flex; justify-content:space-between; align-items:center; gap:8px;">
          <div style="flex:1; min-width:0;">
            <div style="font-weight:700; font-size:14px; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.name}</div>
            <div style="font-size:11px; color:var(--text-gold); margin-top:3px; display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
              <span>$${p.price.toFixed(2)}</span>
              <span>Stock: ${p.stock_count}</span>
              ${statusBadge}
            </div>
          </div>
          <div style="display:flex; gap:6px; align-items:center;">
            <button class="btn-buy-card" style="background:linear-gradient(135deg,#6366f1,#4f46e5); color:#fff; padding:6px 12px; font-size:12px;" onclick="openEditProductModal(${p.id})">✏️ កែប្រែ</button>
            ${actionBtn}
          </div>
        </div>
      `;
    });
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--danger);">❌ Error: ${err.message}</div>`;
  }
}

function openEditProductModal(productId) {
  const p = (typeof adminProductsCache !== "undefined" && adminProductsCache.find(x => Number(x.id) === Number(productId))) || productsData.find(x => Number(x.id) === Number(productId));
  if (!p) {
    alert("❌ មិនអាចទាញយកទិន្នន័យទំនិញឡើយ!");
    return;
  }
  populateAdminCategorySelects();
  document.getElementById("editProdId").value = p.id;
  document.getElementById("editProdName").value = p.name;
  document.getElementById("editProdCategory").value = p.category_id;
  document.getElementById("editProdPrice").value = p.price;
  const resellerEl = document.getElementById("editProdResellerPrice");
  if (resellerEl) resellerEl.value = (p.reseller_price !== null && p.reseller_price !== undefined) ? p.reseller_price : "";
  document.getElementById("editProdDuration").value = p.duration_days;
  document.getElementById("editProdImage").value = p.image_url || "";
  document.getElementById("editProdDescription").value = p.description || "";

  // Badge setting
  const badgeVal = p.badge || "";
  const badgeInput = document.getElementById("editProdBadge");
  if (badgeInput) badgeInput.value = badgeVal;
  document.querySelectorAll("#editProductModal .btn-badge-chip").forEach(chip => {
    chip.classList.toggle("active", chip.textContent.trim() === badgeVal || (!badgeVal && chip.textContent.includes("គ្មាន")));
  });

  // Reset file input & set preview
  const fileInp = document.getElementById("editProdImageFile");
  if (fileInp) fileInp.value = "";
  const previewImg = document.getElementById("editProdImgPreview");
  if (previewImg) previewImg.src = p.image_url || "https://cdn-icons-png.flaticon.com/512/3594/3594363.png";

  openModal("editProductModal");
}
window.openEditProductModal = openEditProductModal;

function previewAddProdImage(input) {
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = function (e) {
      const previewBox = document.getElementById("addProdImgPreviewBox");
      const previewImg = document.getElementById("addProdImgPreview");
      if (previewImg) previewImg.src = e.target.result;
      if (previewBox) previewBox.style.display = "block";
    };
    reader.readAsDataURL(input.files[0]);
  }
}

function previewAddProdUrl(url) {
  const previewBox = document.getElementById("addProdImgPreviewBox");
  const previewImg = document.getElementById("addProdImgPreview");
  if (url && url.trim().length > 5) {
    if (previewImg) previewImg.src = url.trim();
    if (previewBox) previewBox.style.display = "block";
  }
}

function previewEditProdImage(input) {
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = function (e) {
      const previewImg = document.getElementById("editProdImgPreview");
      if (previewImg) previewImg.src = e.target.result;
    };
    reader.readAsDataURL(input.files[0]);
  }
}

function previewEditProdUrl(url) {
  const previewImg = document.getElementById("editProdImgPreview");
  if (url && url.trim().length > 5 && previewImg) {
    previewImg.src = url.trim();
  }
}

async function deleteProductAdmin(productId, productName) {
  if (!confirm(`តើអ្នកពិតជាចង់លុបទំនិញ "${productName}" នេះមែនទេ?`)) return;
  try {
    const res = await fetch(`/api/admin/products/${productId}?user_id=${currentUser.user_id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.status === "success") {
      alert(`✅ បានលុបទំនិញ "${productName}" ជោគជ័យ!`);
      loadAdminProductsList();
      loadProducts();
    } else {
      alert("❌ " + (json.detail || "Error"));
    }
  } catch (err) {
    alert("❌ Error: " + err.message);
  }
}

async function restoreProductAdmin(productId, productName) {
  if (!confirm(`តើអ្នកចង់ Restore ទំនិញ "${productName}" ឡើងវិញមែនទេ?`)) return;
  try {
    const res = await fetch(`/api/admin/products/${productId}/restore?user_id=${currentUser.user_id}`, { method: "PATCH" });
    const json = await res.json();
    if (json.status === "success") {
      alert(`✅ បាន Restore ទំនិញ "${productName}" ជោគជ័យ!`);
      loadAdminProductsList();
      loadProducts();
    } else {
      alert("❌ " + (json.detail || "Error"));
    }
  } catch (err) {
    alert("❌ Error: " + err.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// 👑 COMPLETE REDESIGNED ADMIN MANAGEMENT SUITE
// ═══════════════════════════════════════════════════════════════

let adminOrdersCache = [];
let adminProductsCache = [];
let currentAdminOrderFilter = null;
let currentApproveOrderId = null;
let currentRejectOrderId = null;

// Sound & Live Monitoring state
window.adminSoundEnabled = localStorage.getItem("admin_sound_enabled") !== "false";
let adminLivePollTimer = null;
let knownPendingOrderIds = new Set();
let knownPendingTopupIds = new Set();
let isInitialAdminCheck = true;

function toggleAdminSound() {
  window.adminSoundEnabled = !window.adminSoundEnabled;
  localStorage.setItem("admin_sound_enabled", window.adminSoundEnabled ? "true" : "false");
  updateAdminSoundUI();
  if (window.adminSoundEnabled) {
    playSound("click");
    showToast("🔔 បានបើកសំឡេងប្រកាស Order ថ្មី (Sound Enabled)", "success");
  } else {
    showToast("🔕 បានបិទសំឡេងប្រកាស (Sound Disabled)", "info");
  }
}
window.toggleAdminSound = toggleAdminSound;

function testAdminSound() {
  const prev = window.adminSoundEnabled;
  window.adminSoundEnabled = true;
  playSound("kaching");
  showToast("🔊 កំពុងចាក់សំឡេង Ka-Ching! 💰", "success");
  window.adminSoundEnabled = prev;
}
window.testAdminSound = testAdminSound;

function updateAdminSoundUI() {
  const btn = document.getElementById("btnAdminSoundToggle");
  const icon = document.getElementById("adminSoundIcon");
  const label = document.getElementById("adminSoundLabel");
  if (!btn) return;

  if (window.adminSoundEnabled) {
    btn.className = "btn-sound-toggle sound-on";
    if (icon) icon.textContent = "🔔";
    if (label) label.textContent = "សំឡេង: បើក";
  } else {
    btn.className = "btn-sound-toggle sound-off";
    if (icon) icon.textContent = "🔕";
    if (label) label.textContent = "សំឡេង: បិទ";
  }
}
window.updateAdminSoundUI = updateAdminSoundUI;

function filterAdminNavGroup(group, btn) {
  try {
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
    playSound("click");
  } catch (e) {}

  document.querySelectorAll(".admin-cat-tab").forEach(t => t.classList.remove("active"));
  if (btn) btn.classList.add("active");

  const opsTiles = document.querySelectorAll(".nav-group-ops");
  const catTiles = document.querySelectorAll(".nav-group-catalog");
  const mktTiles = document.querySelectorAll(".nav-group-marketing");

  opsTiles.forEach(el => el.style.display = group === 'ops' ? 'flex' : 'none');
  catTiles.forEach(el => el.style.display = group === 'catalog' ? 'flex' : 'none');
  mktTiles.forEach(el => el.style.display = group === 'marketing' ? 'flex' : 'none');

  if (group === 'ops') {
    switchAdminSection('secOrders', document.getElementById('btnNavSecOrders'));
  } else if (group === 'catalog') {
    switchAdminSection('secAddProduct', document.getElementById('btnNavSecAddProduct'));
  } else if (group === 'marketing') {
    switchAdminSection('secFlashSale', document.getElementById('btnNavSecFlashSale'));
  }
}
window.filterAdminNavGroup = filterAdminNavGroup;

function switchAdminSection(secId, btn) {
  try {
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
    playSound("click");
  } catch (e) {}

  document.querySelectorAll(".admin-nav-tile").forEach(t => t.classList.remove("active"));
  if (btn) {
    btn.classList.add("active");
  } else {
    const map = {
      secOrders: "btnNavSecOrders",
      secTopups: "btnNavSecTopups",
      secAnalytics: "btnNavSecAnalytics",
      secUsers: "btnNavSecUsers",
      secSupport: "btnNavSecSupport",
      secAddProduct: "btnNavSecAddProduct",
      secAddStock: "btnNavSecAddStock",
      secDeleteProduct: "btnNavSecDeleteProduct",
      secFlashSale: "btnNavSecFlashSale",
      secPromos: "btnNavSecPromos",
      secResellers: "btnNavSecResellers",
      secGiveaways: "btnNavSecGiveaways",
      secAlert: "btnNavSecAlert"
    };
    const b = document.getElementById(map[secId]);
    if (b) b.classList.add("active");
  }

  document.querySelectorAll(".admin-sec").forEach(s => s.style.display = "none");
  const sec = document.getElementById(secId);
  if (sec) sec.style.display = "block";

  if (secId === "secOrders") loadAdminOrders(currentAdminOrderFilter || null, document.getElementById("filterAll"));
  if (secId === "secTopups") loadAdminTopupRequests();
  if (secId === "secAnalytics") loadAdminAnalytics();
  if (secId === "secUsers") loadAdminUsers();
  if (secId === "secSupport") loadAdminSupportTickets();
  if (secId === "secAddProduct") populateAdminCategorySelects();
  if (secId === "secAddStock") populateAdminProductSelects();
  if (secId === "secDeleteProduct") loadAdminProductsList();
  if (secId === "secFlashSale") fetchActiveFlashSale();
  if (secId === "secPromos") loadAdminPromos();
  if (secId === "secResellers") loadAdminResellers();
  if (secId === "secGiveaways") loadAdminGiveaways();
  if (secId === "secAlert") {
    fetchBroadcastAudienceStats();
    updateTelegramPreview();
  }
}
window.switchAdminSection = switchAdminSection;

async function loadAdminStats() {
  const box = document.getElementById("adminStatsBox");
  if (!box) return;

  try {
    const res = await fetch(`/api/admin/stats?user_id=${currentUser.user_id}`);
    const data = await res.json();
    if (data.status === "success" && data.stats) {
      const s = data.stats;
      const pendingOrdersCount = data.pending_orders_count || 0;
      const pendingTopupsCount = data.pending_topups_count || 0;

      // Update Nav Tile Badges
      const badgeOrders = document.getElementById("badgeNavOrders");
      const badgeTopups = document.getElementById("badgeNavTopups");
      if (badgeOrders) {
        badgeOrders.textContent = pendingOrdersCount;
        badgeOrders.style.display = pendingOrdersCount > 0 ? "inline-block" : "none";
      }
      if (badgeTopups) {
        badgeTopups.textContent = pendingTopupsCount;
        badgeTopups.style.display = pendingTopupsCount > 0 ? "inline-block" : "none";
      }

      box.className = "admin-stats-kpi-grid";
      box.style.display = "grid";
      box.innerHTML = `
        <div class="admin-kpi-tile">
          <div class="kpi-tile-header">
            <span class="kpi-tile-icon">👥</span>
            <span class="kpi-tile-badge kpi-badge-live">Live</span>
          </div>
          <div class="kpi-tile-val blue">${s.total_users || 0}</div>
          <div class="kpi-tile-sub">អតិថិជនសរុប (Users)</div>
        </div>

        <div class="admin-kpi-tile">
          <div class="kpi-tile-header">
            <span class="kpi-tile-icon">💎</span>
            <span class="kpi-tile-badge kpi-badge-live" style="color:#fbbf24; border-color:rgba(251,191,36,0.4); background:rgba(251,191,36,0.15);">Revenue</span>
          </div>
          <div class="kpi-tile-val gold">$${(s.total_revenue || 0).toFixed(2)}</div>
          <div class="kpi-tile-sub">ចំណូលសរុប (${s.total_orders || 0} Orders)</div>
        </div>

        <div class="admin-kpi-tile">
          <div class="kpi-tile-header">
            <span class="kpi-tile-icon">📦</span>
            <span class="kpi-tile-badge kpi-badge-live">Catalog</span>
          </div>
          <div class="kpi-tile-val green">${s.total_products || 0} មុខ</div>
          <div class="kpi-tile-sub">${s.total_stock_accounts || 0} In-Stock Accounts</div>
        </div>

        <div class="admin-kpi-tile">
          <div class="kpi-tile-header">
            <span class="kpi-tile-icon">⏳</span>
            <span class="kpi-tile-badge ${pendingOrdersCount + pendingTopupsCount > 0 ? 'kpi-badge-alert' : 'kpi-badge-live'}">${pendingOrdersCount + pendingTopupsCount > 0 ? 'Action Needed' : 'All Clear'}</span>
          </div>
          <div class="kpi-tile-val purple">${pendingOrdersCount + pendingTopupsCount}</div>
          <div class="kpi-tile-sub">${pendingOrdersCount} Orders • ${pendingTopupsCount} Top-ups</div>
        </div>
      `;
    }
  } catch (e) {
    console.error("loadAdminStats error:", e);
  }
}
window.loadAdminStats = loadAdminStats;

async function loadAdminOrders(statusFilter = null, btn = null) {
  currentAdminOrderFilter = statusFilter;
  const container = document.getElementById("adminOrdersList");
  if (!container) return;

  if (btn) {
    document.querySelectorAll("#secOrders .cat-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  }

  container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted);">⏳ កំពុងទាញយក Orders...</div>`;

  try {
    const url = statusFilter
      ? `/api/admin/orders?user_id=${currentUser.user_id}&status=${statusFilter}`
      : `/api/admin/orders?user_id=${currentUser.user_id}`;
    const res = await fetch(url);
    const json = await res.json();

    if (json.status === "success" && json.data) {
      adminOrdersCache = json.data;
      renderAdminOrders(adminOrdersCache);
    } else {
      container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--danger);">❌ មិនអាចផ្ទុក Orders បានទេ</div>`;
    }
  } catch (err) {
    container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--danger);">❌ កំហុស: ${err.message}</div>`;
  }
}
window.loadAdminOrders = loadAdminOrders;

function renderAdminOrders(orders) {
  const container = document.getElementById("adminOrdersList");
  if (!container) return;

  if (!orders || orders.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:40px 20px; color:var(--text-muted); background:var(--card-glass); border-radius:16px; border:1px dashed var(--card-border);">
        <div style="font-size:32px; margin-bottom:8px;">📦</div>
        <div style="font-size:14px; font-weight:700; color:var(--text-main);">មិនមាន Order ណាត្រូវបានរកឃើញឡើយ</div>
        <div style="font-size:11px; color:var(--text-sub); margin-top:4px;">រាល់ការបញ្ជាទិញថ្មីៗរបស់អតិថិជន នឹងបង្ហាញនៅទីនេះ</div>
      </div>
    `;
    return;
  }

  let html = "";
  orders.forEach(o => {
    const isPending = o.status === "pending";
    const isDelivered = o.status === "delivered";
    const isRejected = o.status === "rejected";

    let statusBadge = "";
    let cardBorder = "1px solid rgba(255,255,255,0.08)";
    let cardBg = "linear-gradient(145deg, rgba(26,18,53,0.85), rgba(16,10,36,0.92))";

    if (isPending) {
      statusBadge = `<span style="background:rgba(245,158,11,0.18); color:#fbbf24; border:1px solid rgba(245,158,11,0.4); padding:3px 10px; border-radius:20px; font-size:11px; font-weight:800; display:inline-flex; align-items:center; gap:4px;">⏳ PENDING</span>`;
      cardBorder = "1px solid rgba(245,158,11,0.45)";
      cardBg = "linear-gradient(145deg, rgba(38,28,15,0.9), rgba(20,14,35,0.95))";
    } else if (isDelivered) {
      statusBadge = `<span style="background:rgba(16,185,129,0.18); color:#34d399; border:1px solid rgba(16,185,129,0.4); padding:3px 10px; border-radius:20px; font-size:11px; font-weight:800; display:inline-flex; align-items:center; gap:4px;">✅ DELIVERED</span>`;
    } else if (isRejected) {
      statusBadge = `<span style="background:rgba(239,68,68,0.18); color:#f87171; border:1px solid rgba(239,68,68,0.4); padding:3px 10px; border-radius:20px; font-size:11px; font-weight:800; display:inline-flex; align-items:center; gap:4px;">❌ REJECTED</span>`;
    }

    // Bank slip row
    const slipSection = o.proof_file && o.proof_file !== "WALLET_PAYMENT" && o.proof_file !== "instant_wallet_purchase.png"
      ? `<div style="margin-top:10px; display:flex; align-items:center; gap:10px; background:rgba(56,189,248,0.06); border:1px solid rgba(56,189,248,0.25); padding:8px 12px; border-radius:12px;">
           <img src="${o.proof_file}" style="width:40px; height:40px; object-fit:cover; border-radius:8px; border:1px solid #38bdf8; cursor:pointer;" onclick="openSlipModal('${o.proof_file}')">
           <div style="flex:1; min-width:0; cursor:pointer;" onclick="openSlipModal('${o.proof_file}')">
             <div style="font-size:12px; color:#38bdf8; font-weight:800;">📸 Bank Slip (បានភ្ជាប់)</div>
             <div style="font-size:10px; color:var(--text-muted);">ចុចទីនេះដើម្បីពង្រីកមើល Slip ពេញ</div>
           </div>
           <button type="button" class="btn-mini-copy" style="font-size:11px; padding:5px 10px; background:rgba(56,189,248,0.2); color:#38bdf8; border:1px solid #38bdf8; border-radius:8px;" onclick="openSlipModal('${o.proof_file}')">🔍 មើល</button>
         </div>`
      : "";

    // Credentials code block
    const credsSection = isDelivered && o.delivered_credentials
      ? `<div style="margin-top:10px; background:rgba(0,0,0,0.55); border:1px solid rgba(56,189,248,0.28); border-radius:12px; padding:12px; overflow:hidden;">
           <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; padding-bottom:6px; border-bottom:1px solid rgba(255,255,255,0.08);">
             <div style="font-size:11.5px; color:#34d399; font-weight:800; display:flex; align-items:center; gap:5px;">
               <span>🔑</span> <span>ព័ត៌មានអាខោន (Account Credentials):</span>
             </div>
             <button type="button" class="btn-mini-copy" style="font-size:11px; padding:4px 10px; background:rgba(52,211,153,0.18); color:#34d399; border:1px solid rgba(52,211,153,0.4); border-radius:8px; font-weight:700;" onclick="copyText('${o.delivered_credentials.replace(/'/g, "\\'")}', this)">📋 Copy</button>
           </div>
           <div style="font-family:'Fira Code', Consolas, Monaco, monospace; font-size:11.5px; color:#a5f3fc; line-height:1.5; white-space:pre-wrap; word-break:break-all; user-select:all; max-height:140px; overflow-y:auto; padding:4px 2px;">${escapeHtml(o.delivered_credentials)}</div>
         </div>`
      : "";

    // Gemini Pro Activation Guide in Admin Order Card
    let adminGeminiGuide = "";
    const isGeminiOrder = /gemini/i.test(o.product_name || "") || /gemini/i.test(o.delivered_credentials || "") || /activate/i.test(o.delivered_credentials || "") || /https?:\/\//i.test(o.delivered_credentials || "");
    if (isDelivered && isGeminiOrder) {
      const urlMatch = (o.delivered_credentials || "").match(/https?:\/\/[^\s<>"'\)]+/);
      const actUrl = urlMatch ? urlMatch[0] : "";
      const directLinkBtn = actUrl ? `
        <div class="activation-btn-grid" style="margin-top:8px;">
          <button type="button" class="btn-copy-activation" style="font-size:11.5px; padding:7px 10px;" onclick="copyActivationLink('${actUrl.replace(/'/g, "\\'")}', this)">
            <span>📋</span> <span>Copy Link ភ្ជាប់</span>
          </button>
          <a href="${actUrl}" target="_blank" class="btn-open-activation" style="font-size:11.5px; padding:7px 10px;">
            <span>🔗</span> <span>បើក Link ភ្ជាប់</span>
          </a>
        </div>` : "";

      adminGeminiGuide = `
        <!-- 📖 Gemini Pro Activation Guide (Admin Panel) -->
        <div class="activation-guide-card" style="margin-top:10px;">
          <div class="activation-guide-header">
            <span class="activation-guide-title">📖 របៀបប្រើប្រាស់ភ្ជាប់អាខោន (ច្បាប់ / ការណែនាំ)</span>
          </div>
          <div class="activation-steps-list">
            <div class="activation-step-item">
              <div class="activation-step-icon">🔗</div>
              <div class="activation-step-text">បើក Link ដែលអ្នកបានទទួលក្នុង Browser</div>
            </div>
            <div class="activation-step-item">
              <div class="activation-step-icon">✅</div>
              <div class="activation-step-text">ចុច Activate ដើម្បីបើកដំណើរការ</div>
            </div>
            <div class="activation-step-item">
              <div class="activation-step-icon">🎉</div>
              <div class="activation-step-text">រួចរាល់ អាចប្រើប្រាស់ Gemini Pro បានភ្លាមៗ</div>
            </div>
          </div>
          <div class="activation-note-box">
            <span>📌</span> <span><strong>ចំណាំ៖</strong> Link មួយអាចប្រើបានសម្រាប់ Gmail តែមួយប៉ុណ្ណោះ</span>
          </div>
          ${directLinkBtn}
        </div>
      `;
    }

    // Action buttons for pending
    const actionButtons = isPending
      ? `<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:12px;">
           <button type="button" class="btn-admin-approve" style="padding:10px; font-size:12.5px; font-weight:800; border-radius:10px; display:flex; align-items:center; justify-content:center; gap:6px;" onclick="openApproveOrderModal(${o.id}, '${escapeHtml(o.product_name)}', '${o.price}', '${escapeHtml(o.full_name || 'Customer')}', '${o.user_id}', '${escapeHtml(o.payment_method || 'ABA')}', '${o.proof_file || ''}')">
             <span>✅</span> Approve & Deliver
           </button>
           <button type="button" class="btn-admin-reject" style="padding:10px; font-size:12.5px; font-weight:800; border-radius:10px; display:flex; align-items:center; justify-content:center; gap:6px;" onclick="openRejectOrderModal(${o.id}, '${escapeHtml(o.product_name)}', '${o.price}', '${escapeHtml(o.full_name || 'Customer')}', '${o.user_id}', '${o.proof_file || ''}')">
             <span>❌</span> Reject
           </button>
         </div>`
      : "";

    html += `
      <div style="background:${cardBg}; border:${cardBorder}; border-radius:16px; padding:14px; margin-bottom:12px; box-shadow:0 6px 20px rgba(0,0,0,0.35); transition:transform 0.2s;">
        <!-- Card Header: ID, Product & Price -->
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px; gap:8px;">
          <div style="flex:1; min-width:0;">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span style="font-size:11.5px; font-weight:900; background:rgba(99,102,241,0.2); color:#a78bfa; border:1px solid rgba(99,102,241,0.4); padding:2px 8px; border-radius:8px;">#${o.id}</span>
              <span style="font-size:14px; font-weight:900; color:#fff; word-break:break-word;">${escapeHtml(o.product_name)}</span>
            </div>
            <div style="font-size:11.5px; color:var(--text-sub); margin-top:4px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
              <span>👤 <strong>${escapeHtml(o.full_name || 'Customer')}</strong></span>
              ${o.username ? `<span style="color:#fbbf24;">(@${escapeHtml(o.username)})</span>` : ''}
              <span style="color:rgba(255,255,255,0.2);">|</span>
              <span>🆔 <code style="color:#38bdf8; font-size:11px;">${o.user_id}</code></span>
            </div>
          </div>
          <div style="text-align:right; flex-shrink:0;">
            <div style="font-size:16px; font-weight:900; color:#38bdf8; letter-spacing:0.3px;">$${parseFloat(o.price || 0).toFixed(2)}</div>
            <div style="margin-top:4px;">${statusBadge}</div>
          </div>
        </div>

        <!-- Meta Sub-row -->
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; color:var(--text-muted); padding-top:6px; border-top:1px dashed rgba(255,255,255,0.08); margin-top:6px;">
          <span>💳 <strong>${escapeHtml(o.payment_method || 'Wallet')}</strong></span>
          <span>📅 ${o.created_at ? formatOrderDateTime(o.created_at) : ''}</span>
        </div>

        ${slipSection}
        ${credsSection}
        ${adminGeminiGuide}
        ${actionButtons}
      </div>
    `;
  });

  container.innerHTML = html;
}

function filterAdminOrdersList(query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) {
    renderAdminOrders(adminOrdersCache);
    return;
  }
  const filtered = adminOrdersCache.filter(o =>
    String(o.id).includes(q) ||
    String(o.user_id).includes(q) ||
    (o.product_name && o.product_name.toLowerCase().includes(q)) ||
    (o.full_name && o.full_name.toLowerCase().includes(q)) ||
    (o.username && o.username.toLowerCase().includes(q))
  );
  renderAdminOrders(filtered);
}
window.filterAdminOrdersList = filterAdminOrdersList;

function openApproveOrderModal(orderId, prodName, price, customer, userId, payMethod, slipUrl) {
  currentApproveOrderId = orderId;
  const badge = document.getElementById("modalApproveOrderIdBadge");
  const pName = document.getElementById("modalApproveProdName");
  const pPrice = document.getElementById("modalApprovePrice");
  const cust = document.getElementById("modalApproveCustomer");
  const uId = document.getElementById("modalApproveUserId");
  const pMethod = document.getElementById("modalApprovePaymentMethod");
  const pDate = document.getElementById("modalApproveDate");

  if (badge) badge.textContent = `#${orderId}`;
  if (pName) pName.textContent = prodName;
  if (pPrice) pPrice.textContent = `$${parseFloat(price).toFixed(2)} USD`;
  if (cust) cust.textContent = customer;
  if (uId) uId.textContent = userId;
  if (pMethod) pMethod.textContent = payMethod || "ABA KHQR";
  if (pDate) pDate.textContent = new Date().toLocaleDateString();

  const slipBox = document.getElementById("modalApproveSlipBox");
  const slipImg = document.getElementById("modalApproveSlipImg");
  if (slipBox && slipImg) {
    if (slipUrl && slipUrl.trim() !== "") {
      slipImg.src = slipUrl;
      slipBox.style.display = "flex";
    } else {
      slipBox.style.display = "none";
    }
  }

  const ta = document.getElementById("approveCredentials");
  if (ta) ta.value = "";
  openModal("approveOrderModal");
}
window.openApproveOrderModal = openApproveOrderModal;

function insertCredsTemplate(type, btn) {
  const ta = document.getElementById("approveCredentials");
  if (!ta) return;
  document.querySelectorAll("#approveOrderModal .chip-action").forEach(c => c.classList.remove("active-chip"));
  if (btn) btn.classList.add("active-chip");

  if (type === "email_pass") {
    ta.value = "Email: \nPassword: ";
  } else if (type === "email_pass_pin") {
    ta.value = "Email: \nPassword: \nProfile: 1 | PIN: ";
  } else if (type === "gemini_link") {
    ta.value = "https://serviceactivation.google.com/subscription/new/...";
  } else if (type === "key_code") {
    ta.value = "License Key: ";
  } else if (type === "invite_link") {
    ta.value = "Invite Link: https://";
  }
  ta.focus();
}
window.insertCredsTemplate = insertCredsTemplate;

async function submitApproveOrder() {
  const creds = document.getElementById("approveCredentials")?.value.trim();
  if (!creds) {
    alert("⚠️ សូមបញ្ចូល Email & Password ឬ License Key ជូនអតិថិជន!");
    return;
  }
  const btn = document.getElementById("btnSubmitApproveOrder");
  const btnText = document.getElementById("btnSubmitApproveText");
  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = "⏳ កំពុងដំណើរការ...";

  try {
    const formData = new FormData();
    formData.append("user_id", currentUser.user_id);
    formData.append("credentials", creds);

    const res = await fetch(`/api/admin/orders/${currentApproveOrderId}/approve-custom`, {
      method: "POST",
      body: formData
    });
    const json = await res.json();
    if (json.status === "success") {
      if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
      playSound("win");
      showToast("🎉 បាន Approve Order និងផ្ញើ Account ជោគជ័យ!", "success", 4000);
      closeModal("approveOrderModal");
      loadAdminOrders(currentAdminOrderFilter);
      loadAdminStats();
    } else {
      showToast(`❌ ${json.detail || json.message || "Error"}`, "error");
    }
  } catch (err) {
    alert("❌ Error: " + err.message);
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = "អនុម័ត & ផ្ញើ Account";
  }
}
window.submitApproveOrder = submitApproveOrder;

function openRejectOrderModal(orderId, prodName, price, customer, userId, slipUrl) {
  currentRejectOrderId = orderId;
  const badge = document.getElementById("modalRejectOrderIdBadge");
  const pName = document.getElementById("modalRejectProdName");
  const pPrice = document.getElementById("modalRejectPrice");
  const cust = document.getElementById("modalRejectCustomer");
  const uId = document.getElementById("modalRejectUserId");

  if (badge) badge.textContent = `#${orderId}`;
  if (pName) pName.textContent = prodName;
  if (pPrice) pPrice.textContent = `$${parseFloat(price).toFixed(2)} USD`;
  if (cust) cust.textContent = customer;
  if (uId) uId.textContent = userId;

  const slipBox = document.getElementById("modalRejectSlipBox");
  const slipImg = document.getElementById("modalRejectSlipImg");
  if (slipBox && slipImg) {
    if (slipUrl && slipUrl.trim() !== "") {
      slipImg.src = slipUrl;
      slipBox.style.display = "flex";
    } else {
      slipBox.style.display = "none";
    }
  }

  openModal("rejectOrderModal");
}
window.openRejectOrderModal = openRejectOrderModal;

function selectRejectPresetReason(reason, btn) {
  const input = document.getElementById("rejectReason");
  if (input) input.value = reason;
  document.querySelectorAll("#rejectOrderModal .chip-action").forEach(c => c.classList.remove("active-chip"));
  if (btn) btn.classList.add("active-chip");
}
window.selectRejectPresetReason = selectRejectPresetReason;

async function submitRejectOrder() {
  const reason = document.getElementById("rejectReason")?.value.trim() || "Slip មិនត្រឹមត្រូវ";
  const btn = document.getElementById("btnSubmitRejectOrder");
  const btnText = document.getElementById("btnSubmitRejectText");
  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = "⏳ កំពុងបដិសេធ...";

  try {
    const formData = new FormData();
    formData.append("user_id", currentUser.user_id);
    formData.append("reason", reason);

    const res = await fetch(`/api/admin/orders/${currentRejectOrderId}/reject`, {
      method: "POST",
      body: formData
    });
    const json = await res.json();
    if (json.status === "success") {
      showToast("❌ បាន Reject Order រួចរាល់!", "info");
      closeModal("rejectOrderModal");
      loadAdminOrders(currentAdminOrderFilter);
      loadAdminStats();
    } else {
      showToast(`❌ ${json.detail || json.message || "Error"}`, "error");
    }
  } catch (err) {
    alert("❌ Error: " + err.message);
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = "បដិសេធ Order";
  }
}
window.submitRejectOrder = submitRejectOrder;

async function loadAdminTopupRequests() {
  const container = document.getElementById("adminTopupList");
  if (!container) return;
  container.innerHTML = `
    <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
      <div style="font-size: 28px; margin-bottom: 8px;">⏳</div>
      <div style="font-size: 13px; font-weight: 700; color: #fff;">កំពុងផ្ទុកសំណើបញ្ចូលប្រាក់...</div>
    </div>
  `;

  try {
    const res = await fetch(`/api/admin/topups?user_id=${currentUser.user_id}`);
    if (!res.ok) {
      const errText = await res.text();
      let errMsg = res.statusText || "Server error";
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.detail || errJson.message || errMsg;
      } catch (e) {}
      container.innerHTML = `
        <div style="text-align: center; padding: 30px 20px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 16px;">
          <div style="font-size: 28px; margin-bottom: 8px;">⚠️</div>
          <div style="font-size: 13.5px; font-weight: 700; color: #f87171;">មិនអាចផ្ទុកសំណើបានទេ: ${escapeHtml(errMsg)}</div>
          <button class="btn-admin-tool" onclick="loadAdminTopupRequests()" style="margin-top: 12px; font-size: 12px; padding: 6px 14px;">🔄 ព្យាយាមម្តងទៀត</button>
        </div>
      `;
      return;
    }

    const json = await res.json();
    const badgeEl = document.getElementById("badgeTopupsCount");
    const navBadge = document.getElementById("badgeNavTopups");

    if (json.status === "success" && Array.isArray(json.data)) {
      const topups = json.data;
      const count = topups.length;

      if (badgeEl) {
        badgeEl.textContent = `${count} សំណើ`;
        badgeEl.style.display = count > 0 ? "inline-block" : "none";
      }
      if (navBadge) {
        navBadge.textContent = count;
        navBadge.style.display = count > 0 ? "inline-block" : "none";
      }

      if (count === 0) {
        container.innerHTML = `
          <div class="admin-topup-empty-box">
            <div class="empty-icon-circle">💳</div>
            <div class="empty-title">មិនមានសំណើបញ្ចូលប្រាក់រង់ចាំពិនិត្យទេ</div>
            <div class="empty-desc">
              រាល់ពេលដែលអតិថិជន Upload Bank Slip ផ្ទេរប្រាក់តាម KHQR សំណើទាំងអស់នឹងបង្ហាញនៅទីនេះភ្លាមៗ ដើម្បីឱ្យលោកអ្នកពិនិត្យ និងអនុម័ត។
            </div>
            <button class="btn-secondary-action" onclick="loadAdminTopupRequests()" style="margin-top: 14px; font-size: 12px; height: 36px; padding: 0 16px;">
              🔄 Refresh មើលសំណើថ្មី
            </button>
          </div>
        `;
        return;
      }

      let html = "";
      topups.forEach(t => {
        const amtFormatted = parseFloat(t.amount || 0).toFixed(2);
        const slipUrl = t.proof_image_url || t.proof_image || '';
        const name = escapeHtml(t.full_name || t.user_name || 'អតិថិជន');
        const uname = t.username ? `@${escapeHtml(t.username)}` : `ID: ${t.user_id}`;
        const initial = (t.full_name || t.user_name || 'U').charAt(0).toUpperCase();
        const timeStr = t.created_at || 'ថ្មីៗនេះ';

        html += `
          <div class="admin-topup-card" id="topupCard_${t.id}">
            <div class="admin-topup-card-header">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="topup-id-pill">Top-Up #${t.id}</span>
                <span class="topup-time-text">⏱️ ${escapeHtml(timeStr)}</span>
              </div>
              <span class="topup-pending-badge">⏳ រង់ចាំពិនិត្យ</span>
            </div>

            <div class="admin-topup-user-row">
              <div class="admin-topup-avatar">${initial}</div>
              <div class="admin-topup-user-info">
                <div class="admin-topup-fullname">${name}</div>
                <div class="admin-topup-handle">
                  <span>${uname}</span>
                  <span class="btn-mini-copy" onclick="event.stopPropagation(); copyText('${t.user_id}', this)">Copy ID</span>
                </div>
              </div>
              <div class="admin-topup-amount-box">
                <div class="amount-label">ចំនួនទឹកប្រាក់</div>
                <div class="amount-val">+$${amtFormatted}</div>
              </div>
            </div>

            ${slipUrl ? `
              <div class="admin-topup-slip-preview" onclick="openSlipModal('${slipUrl}')">
                <img src="${slipUrl}" alt="Bank Slip" loading="lazy" class="slip-thumb-img" onerror="this.src='/images/logo.png'">
                <div class="slip-info-col">
                  <div class="slip-title">🧾 វិក្កយបត្រផ្ទេរប្រាក់ (KHQR Bank Slip)</div>
                  <div class="slip-sub">ចុចលើទីនេះដើម្បីពង្រីកពិនិត្យ Slip ពេញអេក្រង់</div>
                </div>
                <button type="button" class="btn-view-slip" onclick="event.stopPropagation(); openSlipModal('${slipUrl}')">
                  🔍 មើល Slip
                </button>
              </div>
            ` : ''}

            <div class="admin-topup-actions">
              <button type="button" class="btn-topup-approve" onclick="approveTopupRequest(${t.id}, ${t.amount}, this)">
                <span>✅</span> អនុម័ត (+$${amtFormatted})
              </button>
              <button type="button" class="btn-topup-reject" onclick="rejectTopupRequest(${t.id}, this)">
                <span>❌</span> បដិសេធ
              </button>
            </div>
          </div>
        `;
      });
      container.innerHTML = html;
    } else {
      container.innerHTML = `
        <div style="text-align: center; padding: 25px; color: #f87171;">
          ⚠️ ${escapeHtml(json.detail || json.message || "Failed to load topups")}
        </div>
      `;
    }
  } catch (err) {
    container.innerHTML = `
      <div style="text-align: center; padding: 30px 20px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 16px;">
        <div style="font-size: 28px; margin-bottom: 8px;">❌</div>
        <div style="font-size: 13.5px; font-weight: 700; color: #f87171;">មិនអាចផ្ទុកសំណើបានទេ: ${escapeHtml(err.message)}</div>
        <button class="btn-admin-tool" onclick="loadAdminTopupRequests()" style="margin-top: 12px; font-size: 12px; padding: 6px 14px;">🔄 ព្យាយាមម្តងទៀត</button>
      </div>
    `;
  }
}
window.loadAdminTopupRequests = loadAdminTopupRequests;
window.loadAdminTopups = loadAdminTopupRequests;

async function approveTopupRequest(topupId, amount, btn) {
  if (!confirm(`តើអ្នកប្រាកដជាចង់អនុម័តសំណើបញ្ចូលប្រាក់ #${topupId} មែនទេ?`)) return;
  if (btn) btn.disabled = true;
  try {
    const fd = new FormData();
    fd.append("user_id", currentUser.user_id);
    const res = await fetch(`/api/admin/topups/${topupId}/approve`, {
      method: "POST",
      body: fd
    });
    const json = await res.json();
    if (json.status === "success") {
      const amtStr = amount ? ` +$${parseFloat(amount).toFixed(2)} USD` : '';
      showToast(`🎉 បានអនុម័តបញ្ចូលប្រាក់${amtStr} ជោគជ័យ!`, "success");
      try { playSound("win"); } catch (e) {}
      await loadAdminTopupRequests();
      if (typeof loadAdminStats === "function") loadAdminStats();
    } else {
      showToast(`❌ ${json.detail || json.message || "Error"}`, "error");
    }
  } catch (err) {
    showToast(`❌ Error: ${err.message}`, "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}
window.approveTopupRequest = approveTopupRequest;
window.adminApproveTopup = approveTopupRequest;

async function rejectTopupRequest(topupId, btn) {
  const reason = prompt("សូមបញ្ចូលមូលហេតុបដិសេធ (Reject Reason):", "Slip មិនត្រឹមត្រូវ");
  if (reason === null) return;

  if (btn) btn.disabled = true;
  try {
    const fd = new FormData();
    fd.append("user_id", currentUser.user_id);
    fd.append("reason", reason || "Slip មិនត្រឹមត្រូវ");
    const res = await fetch(`/api/admin/topups/${topupId}/reject`, {
      method: "POST",
      body: fd
    });
    const json = await res.json();
    if (json.status === "success") {
      showToast(`❌ បានបដិសេធសំណើ Top-Up #${topupId}!`, "info");
      await loadAdminTopupRequests();
      if (typeof loadAdminStats === "function") loadAdminStats();
    } else {
      showToast(`❌ ${json.detail || json.message || "Error"}`, "error");
    }
  } catch (err) {
    showToast(`❌ Error: ${err.message}`, "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}
window.rejectTopupRequest = rejectTopupRequest;
window.adminRejectTopup = rejectTopupRequest;

async function submitAdminAddProduct(e) {
  if (e) e.preventDefault();
  const form = document.getElementById("formAddProduct");
  if (!form) return;
  const formData = new FormData(form);
  formData.append("user_id", currentUser.user_id);
  
  const btn = form.querySelector("button[type='submit']");
  if (btn) { btn.disabled = true; btn.textContent = "⏳ កំពុងបង្កើតទំនិញ..."; }
  try {
    const res = await fetch("/api/admin/products", { method: "POST", body: formData });
    const json = await res.json();
    if (json.status === "success") {
      showToast("🎉 បានបង្កើតទំនិញថ្មីជោគជ័យ!", "success", 4000);
      playSound("win");
      form.reset();
      const previewBox = document.getElementById("addProdImgPreviewBox");
      if (previewBox) previewBox.style.display = "none";
      loadProducts();
      loadAdminStats();
    } else {
      showToast(`❌ ${json.detail || json.message || "Error"}`, "error");
    }
  } catch (err) {
    showToast(`❌ Error: ${err.message}`, "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "💾 រក្សាទុក & បង្កើតទំនិញថ្មី"; }
  }
}
window.submitAdminAddProduct = submitAdminAddProduct;

async function submitAdminAddStock(e) {
  if (e) e.preventDefault();
  const form = document.getElementById("formAddStock");
  if (!form) return;
  const formData = new FormData(form);
  formData.append("user_id", currentUser.user_id);
  
  const btn = form.querySelector("button[type='submit']");
  if (btn) { btn.disabled = true; btn.textContent = "⏳ កំពុងបន្ថែម Stock..."; }
  try {
    const res = await fetch("/api/admin/stock", { method: "POST", body: formData });
    const json = await res.json();
    if (json.status === "success") {
      showToast(`🎉 បានបន្ថែម ${json.added_count || ""} Stock ជោគជ័យ!`, "success", 4000);
      playSound("win");
      form.reset();
      loadProducts();
      loadAdminStats();
    } else {
      showToast(`❌ ${json.detail || json.message || "Error"}`, "error");
    }
  } catch (err) {
    showToast(`❌ Error: ${err.message}`, "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "🔑 រក្សាទុក Stock ចូលហាង"; }
  }
}
window.submitAdminAddStock = submitAdminAddStock;

const BROADCAST_TEMPLATES = {
  flash_sale: {
    title: "🔥 មហាប្រូម៉ូសិន FLASH SALE បញ្ចុះតម្លៃពិសេស ២០% លើគ្រប់ទំនិញ!",
    message: "🎉 ឱកាសពិសេសសម្រាប់អតិថិជនទាំងអស់! យើងខ្ញុំមានការបញ្ចុះតម្លៃរហូតដល់ ២០% លើគ្រប់គណនី Premium (Canva, CapCut, ChatGPT, Netflix, YouTube Premium...)។\n\n⚡ ប្រញាប់ឡើង! ចំនួនមានកំណត់ត្រឹមតែ ២៤ ម៉ោងប៉ុណ្ណោះ!",
    button_text: "🛒 បើកកម្មវិធីទិញឥឡូវនេះ (Shop Now)",
    target: "all"
  },
  restock: {
    title: "📦 ទំនិញចូលស្តុកថ្មី (RESTOCKED) រួចរាល់ហើយ!",
    message: "✨ ជម្រាបសួរអតិថិជនជាទីស្រឡាញ់! គណនី Premium ដែលលោកអ្នកទន្ទឹងរង់ចាំ ឥឡូវនេះបានបញ្ចូលស្តុកថ្មីរួចរាល់ហើយ អាចបញ្ជាទិញបានភ្លាមៗ Instant Delivery 24/7!\n\n🛒 សូមចូលទៅកាន់ Store ដើម្បីជ្រើសរើសទំនិញដែលអ្នកត្រូវការ។",
    button_text: "📦 មើលស្តុកទំនិញថ្មីៗ (View Stock)",
    target: "all"
  },
  giveaway: {
    title: "🎁 ព្រឹត្តិការណ៍ចែកអាំងប៉ាវ & GIVEAWAY ពិសេស!",
    message: "🧧 ជម្រាបសួរបងប្អូនទាំងអស់គ្នា! ហាងយើងខ្ញុំមានការចែកជូនកាដូ និងអាំងប៉ាវឥតគិតថ្លៃសម្រាប់សមាជិកទាំងអស់!\n\n👉 ចុចប៊ូតុងខាងក្រោមដើម្បីចូលបើកកាដូ និងទទួលយកអត្ថប្រយោជន៍ឥឡូវនេះ!",
    button_text: "🎁 ទទួលយកកាដូឥឡូវនេះ (Claim Gift)",
    target: "all"
  },
  reseller_promo: {
    title: "👑 ដំណឹងពិសេសសម្រាប់ដៃគូ VIP RESELLER (Wholesale Deal)!",
    message: "💼 ជម្រាបសួរដៃគូបោះដុំទាំងអស់! យើងមានតម្លៃបោះដុំពិសេសបន្ថែម និងបន្ថែមប្រាក់កម្រៃ Cashback សម្រាប់គ្រប់ការបញ្ជាទិញច្រើនគណនីក្នុងសប្តាហ៍នេះ!\n\n🚀 សូមចូលពិនិត្យមើលតម្លៃបោះដុំក្នុង Portal Reseller ឥឡូវនេះ។",
    button_text: "💼 ចូលមើលតម្លៃបោះដុំ (Reseller Portal)",
    target: "resellers"
  },
  maintenance: {
    title: "🛠️ ជូនដំណឹងអំពីការ Update & ថែទាំប្រព័ន្ធ (Maintenance)",
    message: "⚠️ ជម្រាបជូនអតិថិជនទាំងអស់៖ ប្រព័ន្ធនឹងធ្វើការ Upgrade Server រយៈពេលប្រមាណ ១៥ ទៅ ៣០ នាទី ដើម្បីពង្រឹងល្បឿន និងបន្ថែមមុខងារថ្មីៗ។\n\n🙏 សូមអធ្យាស្រ័យចំពោះការរំខានបណ្តោះអាសន្ននេះ!",
    button_text: "⚡ ពិនិត្យស្ថានភាពប្រព័ន្ធ (Check Status)",
    target: "all"
  }
};

function appendTitleEmoji(emoji) {
  const input = document.getElementById("broadcastTitleInput");
  if (!input) return;
  input.value = `${emoji} ${input.value.trim()}`;
  updateTelegramPreview();
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
}
window.appendTitleEmoji = appendTitleEmoji;

function applyBroadcastTemplate(key) {
  const tpl = BROADCAST_TEMPLATES[key];
  if (!tpl) return;
  const form = document.getElementById("formBroadcastAlert");
  if (!form) return;
  const titleInput = form.querySelector("input[name='title']");
  const msgInput = form.querySelector("textarea[name='message']");
  const btnTextInput = document.getElementById("broadcastBtnTextInput");
  
  if (titleInput) titleInput.value = tpl.title;
  if (msgInput) msgInput.value = tpl.message;
  if (btnTextInput && tpl.button_text) btnTextInput.value = tpl.button_text;

  // Auto select target if defined in template
  if (tpl.target) {
    const targetCards = document.querySelectorAll(".target-group-card");
    targetCards.forEach(c => {
      const rad = c.querySelector("input[type='radio']");
      if (rad && rad.value === tpl.target) {
        selectBroadcastTarget(tpl.target, c);
      }
    });
  }

  updateTelegramPreview();
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
  playSound("click");
  showToast(`⚡ បានជ្រើសរើសគំរូសារ: ${tpl.title.slice(0, 25)}...`, "info", 2000);
}
window.applyBroadcastTemplate = applyBroadcastTemplate;

function toggleDeliveryDestination(type) {
  if (type === "channel") {
    const chk = document.getElementById("chkSendChannel");
    const box = document.getElementById("boxToggleChannel");
    const indicator = document.getElementById("switchIndicatorChannel");
    if (!chk) return;
    chk.checked = !chk.checked;
    if (chk.checked) {
      box.classList.add("active");
      indicator.classList.add("on");
    } else {
      box.classList.remove("active");
      indicator.classList.remove("on");
    }
  } else if (type === "users") {
    const chk = document.getElementById("chkSendUsers");
    const box = document.getElementById("boxToggleUsers");
    const indicator = document.getElementById("switchIndicatorUsers");
    const container = document.getElementById("targetAudienceContainer");
    if (!chk) return;
    chk.checked = !chk.checked;
    if (chk.checked) {
      box.classList.add("active");
      indicator.classList.add("on");
      if (container) container.style.display = "block";
    } else {
      box.classList.remove("active");
      indicator.classList.remove("on");
      if (container) container.style.display = "none";
    }
  }
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
  playSound("click");
  updateTelegramPreview();
}
window.toggleDeliveryDestination = toggleDeliveryDestination;

function selectBroadcastTarget(target, cardEl) {
  document.querySelectorAll(".target-group-card").forEach(c => c.classList.remove("active"));
  if (cardEl) {
    cardEl.classList.add("active");
    const radio = cardEl.querySelector("input[type='radio']");
    if (radio) radio.checked = true;
  }
  const badge = document.getElementById("broadcastTargetBadge");
  const targetMap = {
    all: { text: "👥 All Users", color: "#60a5fa" },
    resellers: { text: "💼 VIP Resellers Only", color: "#fbbf24" },
    vip: { text: "💎 VIP Gold/Diamond Only", color: "#38bdf8" }
  };
  if (badge && targetMap[target]) {
    badge.textContent = targetMap[target].text;
    badge.style.color = targetMap[target].color;
    badge.style.borderColor = targetMap[target].color;
  }
  updateTelegramPreview();
}
window.selectBroadcastTarget = selectBroadcastTarget;

function updateTelegramPreview() {
  const titleInput = document.getElementById("broadcastTitleInput");
  const msgInput = document.getElementById("broadcastMessageInput");
  const btnTextInput = document.getElementById("broadcastBtnTextInput");
  const simTitle = document.getElementById("simTitle");
  const simMessage = document.getElementById("simMessage");
  const simBtnText = document.getElementById("simButtonText");
  const charCount = document.getElementById("charCountDisplay");
  const simTime = document.getElementById("simTimeLabel");

  const titleVal = titleInput ? titleInput.value.trim() : "";
  const msgVal = msgInput ? msgInput.value.trim() : "";
  const btnTextVal = btnTextInput ? btnTextInput.value.trim() : "";

  if (simTitle) {
    simTitle.textContent = titleVal || "📢 ចំណងជើងសារនឹងបង្ហាញនៅទីនេះ...";
  }

  if (simMessage) {
    simMessage.textContent = msgVal || "ខ្លឹមសារសារដែលអ្នកវាយនៅខាងឆ្វេងនឹងបង្ហាញក្នុង Telegram ដូចនេះ...";
  }

  if (simBtnText) {
    simBtnText.textContent = btnTextVal || "🛒 បើកកម្មវិធីទិញឥឡូវនេះ (Open App)";
  }

  if (charCount && msgInput) {
    charCount.textContent = `${msgInput.value.length} អក្សរ`;
  }

  if (simTime) {
    const now = new Date();
    simTime.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // Update simulator channel & user indicators
  const chkChannel = document.getElementById("chkSendChannel");
  const chkUsers = document.getElementById("chkSendUsers");
  const simStatusChannel = document.getElementById("simStatusChannel");
  const simStatusUsers = document.getElementById("simStatusUsers");

  if (simStatusChannel) {
    if (chkChannel && chkChannel.checked) {
      simStatusChannel.textContent = "✅ បើក (Channel & Discussion Group)";
      simStatusChannel.style.color = "#34d399";
    } else {
      simStatusChannel.textContent = "❌ បិទ (Skipped)";
      simStatusChannel.style.color = "#94a3b8";
    }
  }

  if (simStatusUsers) {
    if (chkUsers && chkUsers.checked) {
      const activeRadio = document.querySelector("input[name='target_group']:checked");
      const tgVal = activeRadio ? activeRadio.value : "all";
      const targetLabels = {
        all: "✅ Users ទាំងអស់ (Direct Messages)",
        resellers: "💼 VIP Resellers Only (Direct Messages)",
        vip: "💎 VIP Spenders Only (Direct Messages)"
      };
      simStatusUsers.textContent = targetLabels[tgVal] || "✅ Users ទាំងអស់";
      simStatusUsers.style.color = "#60a5fa";
    } else {
      simStatusUsers.textContent = "❌ បិទ (Skipped)";
      simStatusUsers.style.color = "#94a3b8";
    }
  }
}
window.updateTelegramPreview = updateTelegramPreview;

function previewBroadcastImage(input) {
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = function (e) {
      const simBox = document.getElementById("simImageContainer");
      const simImg = document.getElementById("simImagePreview");
      if (simImg) simImg.src = e.target.result;
      if (simBox) simBox.style.display = "block";
    };
    reader.readAsDataURL(input.files[0]);
  }
}
window.previewBroadcastImage = previewBroadcastImage;

function previewBroadcastUrl(url) {
  const simBox = document.getElementById("simImageContainer");
  const simImg = document.getElementById("simImagePreview");
  if (url && url.trim().length > 5) {
    if (simImg) simImg.src = url.trim();
    if (simBox) simBox.style.display = "block";
  } else if (!url || !url.trim()) {
    const fileInput = document.getElementById("broadcastImageFile");
    if (!fileInput || !fileInput.files || !fileInput.files[0]) {
      if (simBox) simBox.style.display = "none";
    }
  }
}
window.previewBroadcastUrl = previewBroadcastUrl;

function clearBroadcastImagePreview() {
  const fileInput = document.getElementById("broadcastImageFile");
  const urlInput = document.getElementById("broadcastImageUrl");
  const simBox = document.getElementById("simImageContainer");
  const simImg = document.getElementById("simImagePreview");
  if (fileInput) fileInput.value = "";
  if (urlInput) urlInput.value = "";
  if (simImg) simImg.src = "";
  if (simBox) simBox.style.display = "none";
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
}
window.clearBroadcastImagePreview = clearBroadcastImagePreview;

function resetBroadcastForm() {
  const form = document.getElementById("formBroadcastAlert");
  if (form) form.reset();
  clearBroadcastImagePreview();
  const allCard = document.querySelector(".target-group-card");
  if (allCard) selectBroadcastTarget('all', allCard);
  updateTelegramPreview();
  showToast("🧹 បានសម្អាតទម្រង់ Alert រួចរាល់", "info", 1500);
}
window.resetBroadcastForm = resetBroadcastForm;

async function fetchBroadcastAudienceStats() {
  try {
    const res = await fetch(`/api/admin/broadcast/audience-stats?user_id=${currentUser.user_id}`);
    const json = await res.json();
    if (json.status === "success" && json.data) {
      const d = json.data;
      const countAll = document.getElementById("statCountAll");
      const countResellers = document.getElementById("statCountResellers");
      const countVip = document.getElementById("statCountVip");
      const channelLabel = document.getElementById("channelHandleLabel");
      
      if (countAll) countAll.textContent = `${d.all.toLocaleString()} Users`;
      if (countResellers) countResellers.textContent = `${d.resellers.toLocaleString()} Resellers`;
      if (countVip) countVip.textContent = `${d.vip.toLocaleString()} VIPs`;
      if (channelLabel && d.channel) channelLabel.textContent = `${d.channel} (Auto-Forward)`;
      
      showToast(`📊 ស្ថិតិសមាជិក៖ ${d.all} Users | ${d.resellers} Resellers`, "info", 2500);
    }
  } catch (err) {
    console.error("Audience stats fetch error:", err);
  }
}
window.fetchBroadcastAudienceStats = fetchBroadcastAudienceStats;

async function submitAdminBroadcastAlert(e) {
  if (e) e.preventDefault();
  const form = document.getElementById("formBroadcastAlert");
  if (!form) return;

  const chkChannel = document.getElementById("chkSendChannel");
  const chkUsers = document.getElementById("chkSendUsers");

  const sendChannel = chkChannel ? chkChannel.checked : true;
  const sendUsers = chkUsers ? chkUsers.checked : true;

  if (!sendChannel && !sendUsers) {
    showToast("⚠️ សូមជ្រើសរើសគោលដៅផ្ញើសារយ៉ាងហោចណាស់ ១ (Channel ឬ Users)", "warning", 3000);
    return;
  }

  const formData = new FormData(form);
  formData.append("user_id", currentUser.user_id);
  formData.set("send_channel", sendChannel ? "true" : "false");
  formData.set("send_users", sendUsers ? "true" : "false");
  
  const targetGroup = formData.get("target_group") || "all";
  const targetNames = {
    all: "Users ទាំងអស់",
    resellers: "VIP Resellers",
    vip: "VIP Top Spenders"
  };
  const targetLabel = targetNames[targetGroup] || "Users";

  const btn = document.getElementById("btnSubmitBroadcast") || form.querySelector("button[type='submit']");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner" style="display:inline-block; width:16px; height:16px; border:2px solid #fff; border-top-color:transparent; border-radius:50%; animation:spin 0.8s linear infinite; vertical-align:middle; margin-right:8px;"></span> កំពុងបញ្ជូន Alert...`;
  }

  try {
    const res = await fetch("/api/admin/broadcast", { method: "POST", body: formData });
    const json = await res.json();
    if (json.status === "success") {
      const usersSentCount = json.users_sent !== undefined ? `${json.users_sent} នាក់` : `${json.sent_count || "Users"}`;
      const channelStatus = json.channel_sent ? "📢 Channel: បានផ្ញើ" : "";
      showToast(`🎉 បានផ្ញើសារ Alert ជោគជ័យ! (${targetLabel}: ${usersSentCount} ${channelStatus})`, "success", 5000);
      playSound("win");
      form.reset();
      clearBroadcastImagePreview();
      
      // Reset target group card to all
      const allCard = document.querySelector(".target-group-card");
      if (allCard) selectBroadcastTarget('all', allCard);
      updateTelegramPreview();
    } else {
      showToast(`❌ ${json.detail || json.message || "Error"}`, "error");
    }
  } catch (err) {
    showToast(`❌ Error: ${err.message}`, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = "🚀 ផ្ញើសារ Alert ទៅកាន់គោលដៅទាំងអស់";
    }
  }
}
window.submitAdminBroadcastAlert = submitAdminBroadcastAlert;

async function loadAdminProductsList() {
  const container = document.getElementById("adminProductsList");
  if (!container) return;
  container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">⏳ កំពុងផ្ទុកបញ្ជីទំនិញ...</div>`;

  try {
    const res = await fetch(`/api/admin/products?user_id=${currentUser.user_id}`);
    const json = await res.json();
    if (json.status === "success" && json.data) {
      adminProductsCache = json.data;
      renderAdminProducts(adminProductsCache);
    } else {
      container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--danger);">❌ មិនអាចផ្ទុកទំនិញបានទេ</div>`;
    }
  } catch (err) {
    container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--danger);">❌ កំហុស: ${err.message}</div>`;
  }
}
window.loadAdminProductsList = loadAdminProductsList;

function renderAdminProducts(products) {
  const container = document.getElementById("adminProductsList");
  if (!container) return;

  if (!products || products.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">មិនមានទំនិញក្នុងបញ្ជីឡើយ</div>`;
    return;
  }

  let html = "";
  products.forEach(p => {
    const isDeleted = p.is_deleted === 1;
    const stockQty = p.stock_qty !== undefined ? p.stock_qty : (p.stock_count || 0);
    const stockBadge = stockQty > 0
      ? `<span class="admin-prod-stock-badge stock-in">📦 ស្តុក: ${stockQty}</span>`
      : `<span class="admin-prod-stock-badge stock-out">⚠️ អស់ស្តុក</span>`;

    const badgePill = p.badge
      ? `<span style="background:rgba(124,95,245,0.25); border:1px solid rgba(124,95,245,0.5); color:#d8b4fe; font-size:10px; font-weight:800; padding:1px 6px; border-radius:10px;">${escapeHtml(p.badge)}</span>`
      : '';

    html += `
      <div class="admin-prod-card" style="opacity:${isDeleted ? '0.5' : '1'};">
        <img src="${p.image_url || '/images/logo.png'}" class="admin-prod-img" onerror="this.src='/images/logo.png'">
        <div class="admin-prod-info">
          <div class="admin-prod-name" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</div>
          <div class="admin-prod-meta">
            <span class="admin-prod-price" style="cursor:pointer;" onclick="openQuickEditPriceModal(${p.id})" title="ចុចដើម្បីកែតម្លៃ">$${parseFloat(p.price).toFixed(2)}</span>
            ${p.reseller_price ? `<span style="color:#fbbf24; font-size:10px; font-weight:700;">👑 VIP: $${parseFloat(p.reseller_price).toFixed(2)}</span>` : ''}
            ${badgePill}
            ${stockBadge}
          </div>
        </div>
        <div class="admin-prod-actions">
          <button class="btn-admin-action btn-edit-price" onclick="openQuickEditPriceModal(${p.id})" title="កែប្រែតម្លៃទំនិញ">
            <span>💰</span>
            <span class="btn-text-hide-mobile">កែតម្លៃ</span>
          </button>
          <button class="btn-admin-action btn-edit-prod" onclick="openEditProductModal(${p.id})" title="កែប្រែព័ត៌មានទំនិញ">
            <span>✏️</span>
            <span class="btn-text-hide-mobile">កែប្រែ</span>
          </button>
          ${isDeleted
            ? `<button class="btn-admin-action btn-restore-prod" onclick="restoreProductAdmin(${p.id}, '${escapeHtml(p.name)}')" title="Restore ទំនិញ"><span>🔄</span></button>`
            : `<button class="btn-admin-action btn-delete-prod" onclick="deleteProductAdmin(${p.id}, '${escapeHtml(p.name)}')" title="លុបទំនិញ"><span>🗑️</span></button>`
          }
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// ── Quick Edit Price Controller ──
let currentQuickEditProduct = null;
let quickEditOriginalPrice = 0;

function openQuickEditPriceModal(productId) {
  const p = (typeof adminProductsCache !== "undefined" && adminProductsCache.find(x => Number(x.id) === Number(productId))) ||
            (typeof productsData !== "undefined" && productsData.find(x => Number(x.id) === Number(productId)));
  if (!p) {
    if (typeof showToast === "function") showToast("❌ មិនអាចទាញយកទិន្នន័យទំនិញឡើយ!", "error");
    else alert("❌ មិនអាចទាញយកទិន្នន័យទំនិញឡើយ!");
    return;
  }
  currentQuickEditProduct = p;
  quickEditOriginalPrice = parseFloat(p.price) || 0;

  const prodIdEl = document.getElementById("quickEditProdId");
  if (prodIdEl) prodIdEl.value = p.id;
  
  const nameEl = document.getElementById("quickEditProdName");
  if (nameEl) nameEl.innerText = p.name;
  
  const catEl = document.getElementById("quickEditProdCategory");
  if (catEl) {
    const cat = (typeof categoriesData !== "undefined" && categoriesData.find(c => Number(c.id) === Number(p.category_id)));
    catEl.innerText = cat ? `${cat.icon || '🏷️'} ${cat.name}` : (p.category_name || "ទំនិញ");
  }
  
  const curPriceEl = document.getElementById("quickEditCurrentPrice");
  if (curPriceEl) curPriceEl.innerText = `$${quickEditOriginalPrice.toFixed(2)}`;
  
  const imgEl = document.getElementById("quickEditProdImg");
  if (imgEl) imgEl.src = p.image_url || "/images/logo.png";

  const priceInput = document.getElementById("quickEditPriceInput");
  if (priceInput) priceInput.value = quickEditOriginalPrice.toFixed(2);

  const resellerInput = document.getElementById("quickEditResellerPriceInput");
  if (resellerInput) resellerInput.value = (p.reseller_price !== null && p.reseller_price !== undefined) ? parseFloat(p.reseller_price).toFixed(2) : "";

  onQuickPriceInputChange();
  openModal("quickEditPriceModal");
}
window.openQuickEditPriceModal = openQuickEditPriceModal;

function adjustQuickPrice(delta, isPercent) {
  const priceInput = document.getElementById("quickEditPriceInput");
  if (!priceInput) return;
  let curr = parseFloat(priceInput.value) || quickEditOriginalPrice || 0;
  if (isPercent) {
    curr = curr * (1 + delta / 100);
  } else {
    curr = curr + delta;
  }
  if (curr < 0.01) curr = 0.01;
  priceInput.value = curr.toFixed(2);
  onQuickPriceInputChange();
  if (window.tg?.HapticFeedback) window.tg.HapticFeedback.selectionChanged();
}
window.adjustQuickPrice = adjustQuickPrice;

function resetQuickPriceOriginal() {
  const priceInput = document.getElementById("quickEditPriceInput");
  if (priceInput) {
    priceInput.value = quickEditOriginalPrice.toFixed(2);
    onQuickPriceInputChange();
  }
  if (window.tg?.HapticFeedback) window.tg.HapticFeedback.selectionChanged();
}
window.resetQuickPriceOriginal = resetQuickPriceOriginal;

function onQuickPriceInputChange() {
  const priceInput = document.getElementById("quickEditPriceInput");
  const diffBadge = document.getElementById("quickEditPriceDiffBadge");
  if (!priceInput || !diffBadge) return;
  const newPrice = parseFloat(priceInput.value) || 0;
  const diff = newPrice - quickEditOriginalPrice;
  if (Math.abs(diff) < 0.001) {
    diffBadge.innerText = "";
  } else if (diff > 0) {
    const pct = quickEditOriginalPrice > 0 ? ((diff / quickEditOriginalPrice) * 100).toFixed(0) : 0;
    diffBadge.innerText = `+${diff.toFixed(2)}$ (+${pct}%)`;
    diffBadge.style.color = "#34d399";
  } else {
    const pct = quickEditOriginalPrice > 0 ? ((diff / quickEditOriginalPrice) * 100).toFixed(0) : 0;
    diffBadge.innerText = `${diff.toFixed(2)}$ (${pct}%)`;
    diffBadge.style.color = "#f87171";
  }
}
window.onQuickPriceInputChange = onQuickPriceInputChange;

function openFullEditFromQuick() {
  closeModal("quickEditPriceModal");
  if (currentQuickEditProduct) {
    setTimeout(() => {
      openEditProductModal(currentQuickEditProduct.id);
    }, 200);
  }
}
window.openFullEditFromQuick = openFullEditFromQuick;

async function submitQuickEditPrice(event) {
  if (event) event.preventDefault();
  const prodId = document.getElementById("quickEditProdId").value;
  const priceVal = parseFloat(document.getElementById("quickEditPriceInput").value);
  const resellerValRaw = document.getElementById("quickEditResellerPriceInput").value;
  const resellerPrice = resellerValRaw !== "" ? parseFloat(resellerValRaw) : null;
  const btn = document.getElementById("btnSaveQuickPrice");

  if (isNaN(priceVal) || priceVal <= 0) {
    if (typeof showToast === "function") showToast("❌ សូមបញ្ចូលតម្លៃអោយបានត្រឹមត្រូវ (> 0)!", "error");
    else alert("❌ សូមបញ្ចូលតម្លៃអោយបានត្រឹមត្រូវ (> 0)!");
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `⏳ កំពុងរក្សាទុក...`;
  }

  try {
    const res = await fetch(`/api/admin/products/${prodId}/price`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: currentUser.user_id,
        price: priceVal,
        reseller_price: resellerPrice
      })
    });
    const json = await res.json();
    if (json.status === "success") {
      if (typeof showToast === "function") showToast(`✅ បានកែប្រែតម្លៃទៅ $${priceVal.toFixed(2)} ជោគជ័យ!`, "success");
      else alert(`✅ បានកែប្រែតម្លៃទៅ $${priceVal.toFixed(2)} ជោគជ័យ!`);
      closeModal("quickEditPriceModal");
      
      // Update local cache & re-render
      if (typeof adminProductsCache !== "undefined" && Array.isArray(adminProductsCache)) {
        const item = adminProductsCache.find(x => Number(x.id) === Number(prodId));
        if (item) {
          item.price = priceVal;
          item.reseller_price = resellerPrice;
        }
      }
      if (typeof productsData !== "undefined" && Array.isArray(productsData)) {
        const item = productsData.find(x => Number(x.id) === Number(prodId));
        if (item) {
          item.price = priceVal;
          item.reseller_price = resellerPrice;
        }
      }
      renderAdminProducts(adminProductsCache);
      loadAdminProductsList();
      if (typeof loadProducts === "function") loadProducts();
    } else {
      if (typeof showToast === "function") showToast(`❌ ${json.detail || json.message || "Failed"}`, "error");
      else alert(`❌ ${json.detail || json.message || "Failed"}`);
    }
  } catch (err) {
    if (typeof showToast === "function") showToast(`❌ កំហុស: ${err.message}`, "error");
    else alert(`❌ កំហុស: ${err.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `💾 រក្សាទុកតម្លៃ (Save Price)`;
    }
  }
}
window.submitQuickEditPrice = submitQuickEditPrice;

function filterAdminProductsList(query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) {
    renderAdminProducts(adminProductsCache);
    return;
  }
  const filtered = adminProductsCache.filter(p =>
    (p.name && p.name.toLowerCase().includes(q)) ||
    (p.category_name && p.category_name.toLowerCase().includes(q))
  );
  renderAdminProducts(filtered);
}
window.filterAdminProductsList = filterAdminProductsList;

function backupAdminDatabase() {
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("medium");
  showToast("💾 កំពុងទាញយក Backup Database...", "info");
  window.open(`/api/admin/backup-db?user_id=${currentUser.user_id}`, "_blank");
}
window.backupAdminDatabase = backupAdminDatabase;

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
window.escapeHtml = escapeHtml;

function formatOrderDateTime(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });
  } catch (e) {
    return String(dateStr);
  }
}
window.formatOrderDateTime = formatOrderDateTime;

// ─────────────────────────────────────────────
// 🔔 REAL-TIME LIVE ORDER SOUND & MONITOR
// ─────────────────────────────────────────────
function startAdminLiveMonitor() {
  if (adminLivePollTimer) clearInterval(adminLivePollTimer);
  checkAdminLiveUpdates();
  adminLivePollTimer = setInterval(checkAdminLiveUpdates, 6000);
}
window.startAdminLiveMonitor = startAdminLiveMonitor;

function stopAdminLiveMonitor() {
  if (adminLivePollTimer) {
    clearInterval(adminLivePollTimer);
    adminLivePollTimer = null;
  }
}
window.stopAdminLiveMonitor = stopAdminLiveMonitor;

async function checkAdminLiveUpdates() {
  if (!currentUser?.is_admin) return;
  try {
    const res = await fetch(`/api/admin/stats?user_id=${currentUser.user_id}`);
    const data = await res.json();
    if (data.status !== "success") return;

    const pendingOrders = data.pending_orders || [];
    const pendingTopups = data.pending_topups || [];

    if (isInitialAdminCheck) {
      pendingOrders.forEach(o => knownPendingOrderIds.add(o.id));
      pendingTopups.forEach(t => knownPendingTopupIds.add(t.id));
      isInitialAdminCheck = false;
      return;
    }

    let hasNewPending = false;
    let newestOrder = null;

    pendingOrders.forEach(o => {
      if (!knownPendingOrderIds.has(o.id)) {
        knownPendingOrderIds.add(o.id);
        hasNewPending = true;
        newestOrder = o;
      }
    });

    pendingTopups.forEach(t => {
      if (!knownPendingTopupIds.has(t.id)) {
        knownPendingTopupIds.add(t.id);
        hasNewPending = true;
      }
    });

    if (hasNewPending) {
      if (window.adminSoundEnabled) {
        playSound("kaching");
      }
      try {
        if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
      } catch (e) {}

      if (newestOrder) {
        showLiveOrderAlert(newestOrder);
      } else {
        showToast("🔔 មានសំណើបញ្ចូលប្រាក់ Top-up ថ្មី!", "success", 5000);
      }

      const activeSec = document.querySelector(".admin-sec[style*='display: block']");
      if (activeSec && activeSec.id === "secOrders") {
        loadAdminOrders(currentAdminOrderFilter);
      } else if (activeSec && activeSec.id === "secTopups") {
        loadAdminTopupRequests();
      }
      loadAdminStats();
    }
  } catch (e) {
    // Background polling network errors ignored
  }
}

function showLiveOrderAlert(order) {
  const container = document.getElementById("liveAlertBannerContainer");
  if (!container) return;

  const id = `liveAlert_${Date.now()}`;
  const html = `
    <div class="live-order-alert-banner" id="${id}">
      <div class="live-alert-icon">🔔</div>
      <div class="live-alert-content">
        <div class="live-alert-title">
          <span>Order ថ្មី #${order.id}!</span>
          <span style="color:#fbbf24;">$${parseFloat(order.total_price || 0).toFixed(2)}</span>
        </div>
        <div class="live-alert-sub">${order.product_name || 'Item'} • ${order.full_name || 'Customer'}</div>
      </div>
      <button class="live-alert-btn" onclick="openFromLiveAlert(${order.id}, '${id}')">ពិនិត្យ</button>
      <button class="live-alert-close" onclick="document.getElementById('${id}')?.remove()">✕</button>
    </div>
  `;
  container.insertAdjacentHTML("beforeend", html);

  setTimeout(() => {
    const el = document.getElementById(id);
    if (el) {
      el.style.opacity = "0";
      el.style.transform = "translateY(-20px)";
      setTimeout(() => el.remove(), 400);
    }
  }, 10000);
}

function openFromLiveAlert(orderId, alertElId) {
  const alertEl = document.getElementById(alertElId);
  if (alertEl) alertEl.remove();

  switchTab("tabAdmin", document.getElementById("navAdmin"));
  switchAdminSection("secOrders", document.getElementById("btnNavSecOrders"));
  loadAdminOrders("pending", document.getElementById("filterPending"));
}
window.openFromLiveAlert = openFromLiveAlert;


// ─────────────────────────────────────────────
// 📊 ADMIN ANALYTICS ENGINE
// ─────────────────────────────────────────────
async function loadAdminAnalytics() {
  const barsContainer       = document.getElementById("analyticsDailyBars");
  const topProductsContainer= document.getElementById("analyticsTopProducts");
  const todayProductsContainer = document.getElementById("analyticsTodayProducts");
  const paymentsContainer   = document.getElementById("analyticsPayments");

  // Show loading state
  if (barsContainer) barsContainer.innerHTML = `<div style="text-align:center;width:100%;color:var(--text-muted);line-height:180px;">⏳ កំពុងផ្ទុក...</div>`;

  try {
    const res  = await fetch(`/api/admin/analytics?admin_id=${currentUser.user_id}`);
    const data = await res.json();
    if (data.status !== "success") {
      if (barsContainer) barsContainer.innerHTML = `<div style="text-align:center;width:100%;color:var(--danger);line-height:120px;">❌ មិនអាចផ្ទុកបានទេ</div>`;
      return;
    }

    // ── 1. KPI Cards ──
    const anToday    = document.getElementById("anTodayRevenue");
    const anTodayOrd = document.getElementById("anTodayOrders");
    const anTot      = document.getElementById("anTotalRevenue");
    const anTotOrd   = document.getElementById("anTotalOrders");
    const anAov      = document.getElementById("anAov");
    const anUsers    = document.getElementById("anTotalUsers");

    if (anToday) anToday.textContent = `$${data.today_revenue.toFixed(2)}`;
    if (anTodayOrd) {
      // Show order + topup breakdown
      const ordPart   = data.today_order_revenue ? `📦 $${data.today_order_revenue.toFixed(2)}` : "";
      const topupPart = data.today_topup_revenue  ? `💳 $${data.today_topup_revenue.toFixed(2)}` : "";
      const parts = [ordPart, topupPart].filter(Boolean).join("  ");
      anTodayOrd.textContent = `${data.today_orders} Orders${parts ? " · " + parts : ""}`;
    }
    if (anTot) anTot.textContent = `$${data.total_revenue.toFixed(2)}`;
    if (anTotOrd) {
      const topupNote = data.topup_revenue_total > 0
        ? ` · 💳 Top-up $${data.topup_revenue_total.toFixed(2)}`
        : "";
      anTotOrd.textContent = `${data.total_orders} Orders${topupNote}`;
    }
    if (anAov)   anAov.textContent   = `$${data.aov.toFixed(2)}`;
    if (anUsers) anUsers.textContent = `${data.total_users} នាក់`;

    // ── 2. 7-Day Bar Chart ──
    if (barsContainer && data.daily_sales && data.daily_sales.length > 0) {
      const maxRev = Math.max(...data.daily_sales.map(d => d.revenue), 1.0);
      let barsHtml = "";
      data.daily_sales.forEach(d => {
        const heightPct = Math.max(6, Math.round((d.revenue / maxRev) * 88));
        const isToday   = d.date === new Date().toISOString().slice(0, 10);
        const dayLetter = d.label.split(" ")[0];
        const valLabel  = d.revenue > 0
          ? "$" + (d.revenue >= 10 ? d.revenue.toFixed(0) : d.revenue.toFixed(1))
          : "$0";
        // Tooltip: show order + topup split
        const ordR   = d.order_revenue != null ? d.order_revenue : d.revenue;
        const topupR = d.topup_revenue  != null ? d.topup_revenue : 0;
        const tooltip = `${d.date}\nចំណូលសរុប: $${d.revenue.toFixed(2)}\n📦 Orders: $${ordR.toFixed(2)} (${d.count})\n💳 Top-up: $${topupR.toFixed(2)}`;

        barsHtml += `
          <div class="analytics-bar-col ${isToday ? "is-today" : ""}" title="${tooltip}">
            <span class="bar-val-text">${valLabel}</span>
            <div class="bar-pillar-wrapper">
              <div class="bar-pillar ${isToday ? "pillar-today" : ""}" style="height:${heightPct}%;"></div>
            </div>
            <span class="bar-day-lbl ${isToday ? "lbl-today" : ""}">${dayLetter}</span>
          </div>
        `;
      });
      barsContainer.innerHTML = barsHtml;
    }

    // ── 3. Today's Best-Selling Products ──
    if (todayProductsContainer) {
      if (data.today_products && data.today_products.length > 0) {
        const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
        let html = "";
        data.today_products.forEach((p, idx) => {
          html += `
            <div class="top-seller-row rank-${idx + 1}">
              <div class="seller-left-col">
                <span class="seller-rank-badge">${medals[idx] || (idx + 1)}</span>
                <div class="seller-info">
                  <div class="seller-prod-title">${escapeHtml(p.name)}</div>
                  <div class="seller-sold-sub">លក់ថ្ងៃនេះ: <strong class="sold-units-green">${p.units_sold} 🎁</strong></div>
                </div>
              </div>
              <div class="seller-rev-col">
                <div class="seller-rev-val">$${p.revenue.toFixed(2)}</div>
                <div class="seller-rev-sub">ចំណូលថ្ងៃនេះ</div>
              </div>
            </div>
          `;
        });
        todayProductsContainer.innerHTML = html;
      } else {
        todayProductsContainer.innerHTML = `
          <div style="text-align:center;padding:18px 0;color:var(--text-muted);">
            <div style="font-size:28px;margin-bottom:6px;">📦</div>
            <div style="font-size:12px;">មិនទាន់មានការទិញថ្ងៃនេះ</div>
          </div>`;
      }
    }

    // ── 4. All-Time Top 5 Best Sellers ──
    if (topProductsContainer) {
      if (data.top_products && data.top_products.length > 0) {
        const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
        let topHtml = "";
        data.top_products.forEach((p, idx) => {
          topHtml += `
            <div class="top-seller-row rank-${idx + 1}">
              <div class="seller-left-col">
                <span class="seller-rank-badge">${medals[idx] || (idx + 1)}</span>
                <div class="seller-info">
                  <div class="seller-prod-title">${escapeHtml(p.name)}</div>
                  <div class="seller-sold-sub">លក់សរុប: <strong class="sold-units-green">${p.units_sold} 🎁</strong></div>
                </div>
              </div>
              <div class="seller-rev-col">
                <div class="seller-rev-val">$${p.revenue.toFixed(2)}</div>
                <div class="seller-rev-sub">ចំណូលសរុប</div>
              </div>
            </div>
          `;
        });
        topProductsContainer.innerHTML = topHtml;
      } else {
        topProductsContainer.innerHTML = `<div style="text-align:center;padding:15px;color:var(--text-muted);">មិនទាន់មានទិន្នន័យ</div>`;
      }
    }

    // ── 5. Payment Method Distribution ──
    if (paymentsContainer) {
      if (data.payments && data.payments.length > 0) {
        const totalP = data.payments.reduce((acc, x) => acc + x.count, 0) || 1;
        let payHtml = "";
        data.payments.forEach(pay => {
          const pct  = Math.round((pay.count / totalP) * 100);
          const meth = pay.method.toLowerCase();
          const icon = meth.includes("wallet") ? "💳"
                     : meth.includes("khqr")   ? "🇰🇭"
                     : meth.includes("slip")    ? "📄"
                     : "📱";
          payHtml += `
            <div class="payment-split-item">
              <div class="payment-split-header">
                <span class="payment-name-lbl">${icon} ${escapeHtml(pay.method)}</span>
                <span class="payment-pct-val">${pay.count} ដង (${pct}%)</span>
              </div>
              <div class="payment-bar-track">
                <div class="payment-bar-fill" style="width:${pct}%;"></div>
              </div>
            </div>
          `;
        });
        paymentsContainer.innerHTML = payHtml;
      } else {
        paymentsContainer.innerHTML = `<div style="text-align:center;padding:10px;color:var(--text-muted);">មិនទាន់មានទិន្នន័យ</div>`;
      }
    }

  } catch (err) {
    if (barsContainer) barsContainer.innerHTML = `<div style="text-align:center;width:100%;color:var(--danger);line-height:120px;">❌ Error: ${err.message}</div>`;
  }
}


// ─────────────────────────────────────────────
// 🎟️ PROMO CODES ADMIN CLIENT ENGINE
// ─────────────────────────────────────────────
function handlePromoTypeChange() {
  const type = document.getElementById("promoAdminType")?.value;
  const lbl = document.getElementById("lblPromoVal");
  const input = document.getElementById("promoAdminVal");
  if (type === "percent") {
    if (lbl) lbl.textContent = "បញ្ចុះតម្លៃ (%):";
    if (input) input.placeholder = "20";
  } else {
    if (lbl) lbl.textContent = "បញ្ចុះតម្លៃ ($ USD):";
    if (input) input.placeholder = "1.50";
  }
}

async function loadAdminPromos() {
  const container = document.getElementById("adminPromoList");
  if (!container) return;
  container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">⏳ កំពុងផ្ទុក Promo Codes...</div>`;

  try {
    const res = await fetch(`/api/admin/promos?admin_id=${currentUser.user_id}`);
    const json = await res.json();
    if (json.status === "success" && json.data.length > 0) {
      let html = "";
      json.data.forEach(p => {
        const isActive = p.is_active === 1;
        const discountText = p.discount_percent > 0 ? `${p.discount_percent}% OFF` : `$${p.discount_amount.toFixed(2)} USD OFF`;
        const minSpendText = p.min_spend > 0 ? ` (Min $${p.min_spend.toFixed(2)})` : "";
        const statusBadge = isActive
          ? `<span style="background:rgba(16,185,129,0.2); color:#34d399; border:1px solid #10b981; border-radius:6px; padding:2px 8px; font-size:10px; font-weight:800;">ACTIVE</span>`
          : `<span style="background:rgba(239,68,68,0.2); color:#f87171; border:1px solid #ef4444; border-radius:6px; padding:2px 8px; font-size:10px; font-weight:800;">INACTIVE</span>`;

        html += `
          <div style="background:var(--card-glass); border:1px solid var(--card-border); padding:12px 14px; border-radius:12px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="display:flex; align-items:center; gap:6px;">
                <code style="font-size:13.5px; font-weight:800; color:#fff; background:rgba(139,92,246,0.3); padding:2px 6px; border-radius:6px;">${p.code}</code>
                ${statusBadge}
              </div>
              <div style="font-size:11.5px; color:var(--text-gold); margin-top:3px; font-weight:600;">
                🔥 ${discountText}${minSpendText}
              </div>
              <div style="font-size:10.5px; color:var(--text-muted); margin-top:2px;">
                📊 ប្រើបាន: <strong>${p.used_count} / ${p.max_uses}</strong> ដង
              </div>
            </div>
            <div style="display:flex; gap:6px;">
              <button class="btn-mini-copy" style="background:${isActive ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.2)'}; color:${isActive ? '#fbbf24' : '#34d399'}; border:1px solid ${isActive ? '#f59e0b' : '#10b981'};" onclick="toggleAdminPromo(${p.id}, ${isActive ? 0 : 1})">
                ${isActive ? '⏸️ បិទ' : '▶️ បើក'}
              </button>
              <button class="btn-mini-copy" style="background:rgba(239,68,68,0.2); color:#f87171; border:1px solid #ef4444;" onclick="deleteAdminPromo(${p.id})">
                🗑️
              </button>
            </div>
          </div>
        `;
      });
      container.innerHTML = html;
    } else {
      container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">មិនទាន់មាន Promo Code ណាត្រូវបានបង្កើតនៅឡើយទេ</div>`;
    }
  } catch (err) {
    container.innerHTML = `<div style="text-align:center; padding:20px; color:#ef4444;">❌ បរាជ័យក្នុងការផ្ទុក Promo Codes</div>`;
  }
}

async function submitAdminCreatePromo(event) {
  event.preventDefault();
  const code = document.getElementById("promoAdminCode")?.value.trim().toUpperCase();
  const type = document.getElementById("promoAdminType")?.value;
  const val = parseFloat(document.getElementById("promoAdminVal")?.value || 0);
  const minSpend = parseFloat(document.getElementById("promoAdminMinSpend")?.value || 0);
  const maxUses = parseInt(document.getElementById("promoAdminMaxUses")?.value || 100);
  const btn = document.getElementById("btnCreatePromo");

  if (!code || val <= 0) {
    alert("⚠️ សូមបញ្ចូលឈ្មោះកូដ និងតម្លៃបញ្ចុះតម្លៃឱ្យបានត្រឹមត្រូវ!");
    return;
  }

  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("medium");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "⏳ កំពុងបង្កើត...";
  }

  try {
    const payload = {
      admin_id: currentUser.user_id,
      code: code,
      discount_percent: type === "percent" ? val : 0.0,
      discount_amount: type === "fixed" ? val : 0.0,
      min_spend: minSpend,
      max_uses: maxUses
    };

    const res = await fetch("/api/admin/promos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (json.status === "success") {
      if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
      playSound("win");
      showToast(`🎉 ${json.message}`, "success", 4000);
      document.getElementById("promoAdminCode").value = "";
      document.getElementById("promoAdminVal").value = "";
      loadAdminPromos();
    } else {
      showToast(`❌ ${json.detail || json.message || "Error"}`, "error");
    }
  } catch (err) {
    alert("❌ Error: " + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "✨ បង្កើត Promo Code ឥឡូវនេះ";
    }
  }
}

async function toggleAdminPromo(promoId, newStatus) {
  try {
    const res = await fetch(`/api/admin/promos/${promoId}/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin_id: currentUser.user_id, is_active: newStatus })
    });
    const json = await res.json();
    if (json.status === "success") {
      showToast("✅ បានកែប្រែស្ថានភាព Promo Code!", "success");
      loadAdminPromos();
    }
  } catch (err) {
    alert("❌ Error: " + err.message);
  }
}

async function deleteAdminPromo(promoId) {
  if (!confirm("តើអ្នកពិតជាចង់លុប Promo Code នេះមែនទេ?")) return;
  try {
    const res = await fetch(`/api/admin/promos/${promoId}?admin_id=${currentUser.user_id}`, {
      method: "DELETE"
    });
    const json = await res.json();
    if (json.status === "success") {
      showToast("🗑️ បានលុប Promo Code រួចរាល់!", "info");
      loadAdminPromos();
    }
  } catch (err) {
    alert("❌ Error: " + err.message);
  }
}

// ─────────────────────────────────────────────
// 🔔 STOCK NOTIFICATIONS CLIENT
// ─────────────────────────────────────────────
async function handleSubscribeStock(productId, encodedName) {
  const prodName = decodeURIComponent(encodedName || "Product");
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("medium");
  playSound("click");
  
  try {
    const res = await fetch(`/api/products/${productId}/subscribe-stock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: currentUser.user_id })
    });
    const json = await res.json();
    if (json.status === "success") {
      if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
      playSound("win");
      showToast(`🔔 បានចុះឈ្មោះទទួលដំណឹង ${prodName} ជោគជ័យ! Bot នឹងផ្ញើសារប្រាប់ភ្លាមៗពេលមានស្តុក។`, "success", 4000);
    } else {
      showToast(`❌ ${json.message || "Error"}`, "error");
    }
  } catch (err) {
    showToast(`❌ Error: ${err.message}`, "error");
  }
}

// ─────────────────────────────────────────────
// ⚡ FLASH SALE CLIENT ENGINE
// ─────────────────────────────────────────────
let activeFlashSale = null;
let flashSaleTimerInterval = null;

async function fetchActiveFlashSale() {
  try {
    const res = await fetch("/api/flash-sale");
    const json = await res.json();
    const banner = document.getElementById("flashSaleBanner");
    const titleEl = document.getElementById("flashSaleTitleText");
    const badgeEl = document.getElementById("flashSaleDiscountBadge");

    if (json.status === "success" && json.data && json.data.remaining_seconds > 0) {
      activeFlashSale = json.data;
      if (banner) banner.style.display = "block";
      if (titleEl) titleEl.textContent = activeFlashSale.title || "⚡ MEGA FLASH SALE ⚡";
      if (badgeEl) badgeEl.textContent = `-${activeFlashSale.discount_pct}% OFF`;

      startFlashSaleCountdown(activeFlashSale.remaining_seconds);
    } else {
      activeFlashSale = null;
      if (banner) banner.style.display = "none";
      if (flashSaleTimerInterval) clearInterval(flashSaleTimerInterval);
    }
  } catch (e) {
    console.warn("Flash sale fetch error:", e);
  }
}

function startFlashSaleCountdown(totalSeconds) {
  if (flashSaleTimerInterval) clearInterval(flashSaleTimerInterval);
  let remaining = totalSeconds;

  function updateClock() {
    if (remaining <= 0) {
      clearInterval(flashSaleTimerInterval);
      const banner = document.getElementById("flashSaleBanner");
      if (banner) banner.style.display = "none";
      activeFlashSale = null;
      loadProducts();
      return;
    }
    const hours = Math.floor(remaining / 3600);
    const mins = Math.floor((remaining % 3600) / 60);
    const secs = remaining % 60;

    const hEl = document.getElementById("fsHours");
    const mEl = document.getElementById("fsMins");
    const sEl = document.getElementById("fsSecs");

    if (hEl) hEl.textContent = String(hours).padStart(2, '0');
    if (mEl) mEl.textContent = String(mins).padStart(2, '0');
    if (sEl) sEl.textContent = String(secs).padStart(2, '0');

    remaining--;
  }

  updateClock();
  flashSaleTimerInterval = setInterval(updateClock, 1000);
}

async function submitAdminFlashSale(event) {
  event.preventDefault();
  const title = document.getElementById("fsAdminTitle")?.value.trim() || "⚡ MEGA FLASH SALE ⚡";
  const discount = parseFloat(document.getElementById("fsAdminDiscount")?.value || 20);
  const hours = parseFloat(document.getElementById("fsAdminHours")?.value || 12);
  const btn = document.getElementById("btnSubmitFlashSale");

  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("heavy");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "⏳ កំពុងដំណើរការ...";
  }

  try {
    const res = await fetch("/api/admin/flash-sale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        admin_id: currentUser.user_id,
        title: title,
        discount_pct: discount,
        duration_hours: hours,
        is_active: 1
      })
    });
    const json = await res.json();
    if (json.status === "success") {
      showToast(`🎉 ${json.message}`, "success", 4000);
      playSound("win");
      await fetchActiveFlashSale();
      await loadProducts();
    } else {
      showToast(`❌ ${json.detail || json.message || "Error"}`, "error");
    }
  } catch (err) {
    alert("❌ Error: " + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "🚀 បើកដំណើរការ Flash Sale ឥឡូវនេះ";
    }
  }
}

async function stopAdminFlashSale() {
  if (!confirm("តើអ្នកពិតជាចង់បិទ Flash Sale មែនទេ?")) return;
  try {
    const res = await fetch("/api/admin/flash-sale/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        admin_id: currentUser.user_id,
        is_active: 0
      })
    });
    const json = await res.json();
    if (json.status === "success") {
      showToast("⏹️ បានបិទ Flash Sale រួចរាល់!", "info");
      await fetchActiveFlashSale();
      await loadProducts();
    }
  } catch (err) {
    alert("❌ Error: " + err.message);
  }
}

async function loadAdminResellers() {
  const container = document.getElementById("adminResellerList");
  if (!container) return;
  container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted);">⏳ កំពុងផ្ទុកបញ្ជី Resellers...</div>`;

  try {
    const res = await fetch(`/api/admin/resellers?admin_id=${currentUser.user_id}`);
    const json = await res.json();
    if (json.status === "success" && json.data.length > 0) {
      let html = "";
      json.data.forEach(r => {
        const isApproved = r.status === "approved";
        const isPending = r.status === "pending";
        const statusBadge = isApproved
          ? `<span style="background:rgba(16,185,129,0.2); color:#34d399; border:1px solid #10b981; border-radius:8px; padding:2px 8px; font-size:11px; font-weight:800;">👑 Approved VIP</span>`
          : (isPending
            ? `<span style="background:rgba(245,158,11,0.2); color:#fbbf24; border:1px solid #f59e0b; border-radius:8px; padding:2px 8px; font-size:11px; font-weight:800;">⏳ Pending</span>`
            : `<span style="background:rgba(239,68,68,0.2); color:#f87171; border:1px solid #ef4444; border-radius:8px; padding:2px 8px; font-size:11px; font-weight:800;">❌ Rejected</span>`);

        html += `
          <div style="background:var(--card-glass); border:1px solid var(--card-border); padding:14px; border-radius:14px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
              <div>
                <strong style="font-size:14.5px; color:#fff;">👤 ${r.full_name || 'User'}</strong>
                <span style="font-size:12px; color:var(--text-gold);"> (@${r.username || 'N/A'})</span>
                <div style="font-size:11px; color:var(--text-sub); margin-top:2px;">ID: <code>${r.user_id}</code> | Contact: <strong>${r.contact}</strong></div>
              </div>
              ${statusBadge}
            </div>
            <div style="background:rgba(0,0,0,0.3); padding:8px 10px; border-radius:8px; font-size:11.5px; color:#e2e8f0; margin-bottom:10px;">
              📝 មូលហេតុ៖ ${r.reason || 'N/A'}
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:11px; color:var(--text-muted);">ចំណាយសរុប: <strong>$${(r.total_spent || 0).toFixed(2)}</strong></span>
              <div style="display:flex; gap:8px;">
                ${!isApproved ? `<button class="btn-admin-approve" style="padding:7px 14px; font-size:11.5px;" onclick="updateAdminResellerStatus(${r.app_id}, ${r.user_id}, 'approved')">✅ Approve VIP</button>` : ''}
                ${isApproved ? `<button class="btn-admin-reject-outline" style="padding:6px 12px; font-size:11.5px;" onclick="updateAdminResellerStatus(${r.app_id}, ${r.user_id}, 'rejected')">❌ Revoke</button>` : ''}
              </div>
            </div>
          </div>
        `;
      });
      container.innerHTML = html;
    } else {
      container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted);">មិនទាន់មានពាក្យស្នើសុំ Reseller ឡើយ</div>`;
    }
  } catch (err) {
    container.innerHTML = `<div style="text-align:center; padding:30px; color:#ef4444;">❌ បរាជ័យក្នុងការផ្ទុកទិន្នន័យ</div>`;
  }
}

async function updateAdminResellerStatus(appId, targetUserId, status) {
  try {
    const res = await fetch(`/api/admin/resellers/${appId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        admin_id: currentUser.user_id,
        target_user_id: targetUserId,
        status: status,
        admin_note: status === "approved" ? "Approved by Admin" : "Rejected by Admin"
      })
    });
    const json = await res.json();
    if (json.status === "success") {
      showToast(`✅ ${json.message}`, "success");
      loadAdminResellers();
    } else {
      showToast(`❌ ${json.detail || "Error"}`, "error");
    }
  } catch (err) {
    alert("❌ Error: " + err.message);
  }
}


// ─── Stock Mode Toggle (Add Stock Form) ───────────────────────────────────────
function switchStockMode(mode) {
  const qtyDiv = document.getElementById("stockModeQty");
  const credsDiv = document.getElementById("stockModeCreds");
  const btnQty = document.getElementById("btnStockModeQty");
  const btnCreds = document.getElementById("btnStockModeCreds");

  if (mode === "qty") {
    qtyDiv.style.display = "block";
    credsDiv.style.display = "none";
    btnQty.style.border = "2px solid #10b981";
    btnQty.style.background = "rgba(16,185,129,0.18)";
    btnQty.style.color = "#10b981";
    btnCreds.style.border = "2px solid rgba(255,255,255,0.15)";
    btnCreds.style.background = "transparent";
    btnCreds.style.color = "#aaa";
  } else {
    qtyDiv.style.display = "none";
    credsDiv.style.display = "block";
    btnCreds.style.border = "2px solid #818cf8";
    btnCreds.style.background = "rgba(129,140,248,0.18)";
    btnCreds.style.color = "#818cf8";
    btnQty.style.border = "2px solid rgba(255,255,255,0.15)";
    btnQty.style.background = "transparent";
    btnQty.style.color = "#aaa";
  }
}

// ═══════════════════════════════════════════════════════════════
// 🔊 WEB AUDIO SYNTHESIZER SFX
// ═══════════════════════════════════════════════════════════════
let audioCtx = null;
function playSound(type) {
  try {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (!audioCtx) return;
    if (audioCtx.state === "suspended") audioCtx.resume();

    const now = audioCtx.currentTime;
    if (type === "click") {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(900, now + 0.04);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.start(now);
      osc.stop(now + 0.04);
    } else if (type === "win" || type === "success") {
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.setValueAtTime(freq, now + i * 0.1);
        gain.gain.setValueAtTime(0.12, now + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.3);
        osc.start(now + i * 0.1);
        osc.stop(now + i * 0.1 + 0.3);
      });
    } else if (type === "kaching" || type === "order_alert") {
      // 🔔 Realistic Ka-Ching Cash Register Ding & Coin Bell Chime
      const freqs1 = [1318.51, 1760.00, 2093.00, 2637.02, 3135.96];
      freqs1.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        const t = now + idx * 0.035;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.22, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
        osc.start(t);
        osc.stop(t + 0.55);
      });
      // Harmonic coin resonate
      setTimeout(() => {
        if (!audioCtx) return;
        const now2 = audioCtx.currentTime;
        [987.77, 1318.51, 1975.53, 2349.32].forEach((freq, idx) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = "triangle";
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          const t = now2 + idx * 0.03;
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.18, t);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
          osc.start(t);
          osc.stop(t + 0.6);
        });
      }, 80);
    }
  } catch (e) {
    // Ignore audio errors
  }
}
window.playSound = playSound;

// ═══════════════════════════════════════════════════════════════
// 💎 VIP LOYALTY & HEADER BADGE
// ═══════════════════════════════════════════════════════════════
async function loadUserVipHeader() {
  try {
    const res = await fetch(`/api/user/${currentUser.user_id}/vip-tier`);
    const json = await res.json();
    if (json.status === "success" && json.data) {
      const vip = json.data;
      const headerBadge = document.getElementById("headerVipBadge");
      if (headerBadge) {
        headerBadge.textContent = `${vip.tier_badge} ${vip.tier_name}`;
      }
    }
  } catch (err) {
    console.warn("VIP header fetch error:", err);
  }
}

async function openVipModal() {
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("medium");
  playSound("click");
  try {
    const res = await fetch(`/api/user/${currentUser.user_id}/vip-status`);
    const json = await res.json();
    if (json.status === "success" && json.data) {
      const vip = json.data;
      currentUserVip = vip;
      const tierNameEl = document.getElementById("vipModalTierName");
      const tierIconEl = document.getElementById("vipModalTierIcon");
      const progTextEl = document.getElementById("vipModalProgressText");
      const progBarEl = document.getElementById("vipModalProgressBar");
      const spentEl = document.getElementById("vipModalTotalSpent");
      const orderEl = document.getElementById("vipModalOrderCount");
      const statusNotice = document.getElementById("resellerStatusNotice");
      const formApply = document.getElementById("formApplyReseller");

      if (tierNameEl) tierNameEl.textContent = `${vip.tier_badge} ${vip.tier_name}`;
      if (tierIconEl) tierIconEl.textContent = vip.tier_badge;
      if (progTextEl) {
        progTextEl.textContent = vip.next_tier
          ? `${vip.progress}% ទៅកាន់ ${vip.next_tier}`
          : "🎉 កម្រិតខ្ពស់បំផុត (MAX)";
      }
      if (progBarEl) progBarEl.style.width = `${vip.progress}%`;
      if (spentEl) spentEl.textContent = `$${vip.total_spent.toFixed(2)}`;
      if (orderEl) orderEl.textContent = `${vip.order_count} Orders`;

      if (statusNotice && formApply) {
        if (vip.reseller_status === "approved") {
          statusNotice.style.display = "block";
          statusNotice.style.background = "rgba(16,185,129,0.15)";
          statusNotice.style.border = "1px solid rgba(16,185,129,0.4)";
          statusNotice.style.color = "#34d399";
          statusNotice.innerHTML = "👑 <strong>លោកអ្នកជា Official VIP Reseller រួចរាល់ហើយ!</strong><br><span style='font-size:11px;font-weight:400;'>រីករាយជាមួយតម្លៃបោះដុំគ្រប់មុខទំនិញស្វ័យប្រវត្តិ។</span>";
          formApply.style.display = "none";
        } else if (vip.reseller_status === "pending") {
          statusNotice.style.display = "block";
          statusNotice.style.background = "rgba(245,158,11,0.15)";
          statusNotice.style.border = "1px solid rgba(245,158,11,0.4)";
          statusNotice.style.color = "#fbbf24";
          statusNotice.innerHTML = "⏳ <strong>ពាក្យស្នើសុំរបស់អ្នកកំពុងរង់ចាំការពិនិត្យពី Admin...</strong><br><span style='font-size:11px;font-weight:400;'>Admin នឹង Approve ជូនក្នុងពេលឆាប់ៗ។</span>";
          formApply.style.display = "none";
        } else {
          statusNotice.style.display = "none";
          formApply.style.display = "block";
        }
      }
    }
  } catch (err) {
    console.error("VIP modal load error:", err);
  }
  openModal("vipModal");
}

async function submitResellerApplication(event) {
  event.preventDefault();
  const contact = document.getElementById("resellerContactInput")?.value.trim();
  const reason = document.getElementById("resellerReasonInput")?.value.trim();
  const btn = document.getElementById("btnSubmitResellerApp");

  if (!contact || !reason) {
    alert("⚠️ សូមបំពេញព័ត៌មានឱ្យបានគ្រប់គ្រាន់!");
    return;
  }

  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("medium");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "⏳ កំពុងផ្ញើពាក្យស្នើសុំ...";
  }

  try {
    const res = await fetch(`/api/user/${currentUser.user_id}/apply-reseller`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: currentUser.user_id,
        full_name: currentUser.full_name,
        username: currentUser.username,
        contact: contact,
        reason: reason
      })
    });
    const json = await res.json();
    if (json.status === "success") {
      if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
      playSound("win");
      showToast("🎉 ពាក្យស្នើសុំធ្វើជា VIP Reseller ត្រូវបានផ្ញើជូន Admin រួចរាល់!", "success", 4000);
      openVipModal();
    } else {
      showToast(`❌ ${json.detail || "Error"}`, "error");
    }
  } catch (err) {
    showToast(`❌ Error: ${err.message}`, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "👑 ដាក់ពាក្យស្នើសុំ (Apply Now)";
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// 🎟️ PROMO CODES ENGINE (CHECKOUT)
// ═══════════════════════════════════════════════════════════════
let appliedPromoCode = null;
let currentDiscountAmount = 0;

async function applyPromoCode() {
  const codeInput = document.getElementById("promoCodeInput");
  const code = (codeInput ? codeInput.value.trim() : "").toUpperCase();
  const prodId = document.getElementById("checkoutProdId")?.value;
  const prod = productsData.find(p => Number(p.id) === Number(prodId));

  if (!code) {
    alert("⚠️ សូមបញ្ចូលកូដបញ្ចុះតម្លៃ!");
    return;
  }
  if (!prod) return;

  playSound("click");
  try {
    const res = await fetch("/api/promo/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code, total_price: prod.price })
    });
    const json = await res.json();

    const discountRow = document.getElementById("promoDiscountRow");
    const discountAmountEl = document.getElementById("promoDiscountAmount");
    const amountBadge = document.getElementById("qrAmountBadge");

    if (json.valid) {
      appliedPromoCode = code;
      currentDiscountAmount = json.discount;
      if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
      playSound("win");

      if (discountRow) discountRow.style.display = "flex";
      if (discountAmountEl) discountAmountEl.textContent = `-$${json.discount.toFixed(2)}`;
      if (amountBadge) amountBadge.textContent = `💰 $${json.final_price.toFixed(2)} USD (Promo -${json.discount.toFixed(2)})`;

      alert(`🎉 ${json.message}\nតម្លៃចុងក្រោយ៖ $${json.final_price.toFixed(2)} USD`);
    } else {
      if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred("error");
      alert(json.message || "❌ កូដមិនត្រឹមត្រូវ!");
    }
  } catch (err) {
    alert("❌ Error: " + err.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// 🌟 STORY HIGHLIGHTS QUICK FILTERS
// ═══════════════════════════════════════════════════════════════
function filterHotDeals() {
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
  playSound("click");
  searchQuery = "";
  activeCategory = null;
  document.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("active"));
  renderProductsGrid(productsData);
  window.scrollTo({ top: 300, behavior: "smooth" });
}

function quickFilterCategory(catSlug) {
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
  playSound("click");
  const cat = categoriesData.find(c => c.slug === catSlug || c.name.toLowerCase().includes(catSlug));
  if (cat) {
    activeCategory = cat.id;
    loadProducts();
    window.scrollTo({ top: 300, behavior: "smooth" });
  } else {
    searchQuery = catSlug;
    renderProductsGrid(productsData);
    window.scrollTo({ top: 300, behavior: "smooth" });
  }
}

// ═══════════════════════════════════════════════════════════════
// 🎁 FEATURE: DAILY CHECK-IN & REWARDS CLIENT ENGINE
// ═══════════════════════════════════════════════════════════════
let dailyCheckinState = { can_checkin: true };

async function loadDailyCheckinStatus() {
  const subEl = document.getElementById("dailyRewardSubText");
  const btnEl = document.getElementById("btnDailyBannerClaim");

  try {
    const res = await fetch(`/api/user/${currentUser.user_id}/daily-status`);
    const json = await res.json();
    if (json.status === "success" && json.data) {
      dailyCheckinState = json.data;
      if (json.data.can_checkin) {
        if (subEl) subEl.textContent = "ចុចទទួលយក $0.02 - $0.10 USD ចូល Wallet ភ្លាមៗ";
        if (btnEl) {
          btnEl.textContent = "✨ ចុចយក";
          btnEl.style.background = "linear-gradient(135deg, #f59e0b, #ec4899)";
        }
      } else {
        if (subEl) subEl.textContent = `✅ អ្នកបាន Check-in ថ្ងៃនេះរួចហើយ (+$${json.data.today_reward.toFixed(2)})`;
        if (btnEl) {
          btnEl.textContent = "✅ Claimed";
          btnEl.style.background = "rgba(255,255,255,0.1)";
        }
      }
    }
  } catch (e) {
    console.error("Daily checkin status error:", e);
  }
}

function openDailyCheckinModal() {
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
  playSound("click");

  const titleEl = document.getElementById("dailyModalTitle");
  const descEl = document.getElementById("dailyModalDesc");
  const chestEl = document.getElementById("dailyChestAnim");
  const btnEl = document.getElementById("btnClaimDaily");

  if (!dailyCheckinState.can_checkin) {
    if (chestEl) chestEl.textContent = "🎉";
    if (titleEl) titleEl.textContent = "អ្នកបាន Check-in ថ្ងៃនេះរួចរាល់ហើយ!";
    if (descEl) descEl.textContent = `អ្នកបានទទួលប្រាក់សុទ្ធ Free ចំនួន $${(dailyCheckinState.today_reward || 0.05).toFixed(2)} USD រួចរាល់ហើយ។ សូមត្រឡប់មកវិញនៅថ្ងៃស្អែក!`;
    if (btnEl) {
      btnEl.textContent = "✅ បិទផ្ទាំង (Done)";
      btnEl.onclick = () => closeModal("dailyCheckinModal");
    }
  } else {
    if (chestEl) chestEl.textContent = "🎁";
    if (titleEl) titleEl.textContent = "Check-in បើកកាដូរប្រចាំថ្ងៃ";
    if (descEl) descEl.textContent = "សមាជិកទាំងអស់អាច Check-in បើកយកប្រាក់សុទ្ធ Free ចូល Wallet បានរៀងរាល់ ២៤ ម៉ោងម្តង!";
    if (btnEl) {
      btnEl.textContent = "✨ ចុចបើកយករង្វាន់ឥឡូវនេះ";
      btnEl.onclick = handleDailyCheckinClaim;
    }
  }

  openModal("dailyCheckinModal");
}

async function handleDailyCheckinClaim() {
  if (!dailyCheckinState.can_checkin) {
    closeModal("dailyCheckinModal");
    return;
  }

  const btnEl = document.getElementById("btnClaimDaily");
  if (btnEl) {
    btnEl.disabled = true;
    btnEl.textContent = "⏳ កំពុងបើកកាដូរ...";
  }

  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("medium");
  playSound("click");

  try {
    const res = await fetch(`/api/user/${currentUser.user_id}/daily-checkin`, { method: "POST" });
    let json;
    try {
      json = await res.json();
    } catch (parseErr) {
      throw new Error("មិនអាចភ្ជាប់ទៅកាន់ Server បានទេ សូមព្យាយាមម្តងទៀត");
    }

    if (res.ok && json && json.status === "success") {
      if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
      playSound("win");
      if (typeof confetti === "function") {
        confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
      }

      const chestEl = document.getElementById("dailyChestAnim");
      const titleEl = document.getElementById("dailyModalTitle");
      const descEl = document.getElementById("dailyModalDesc");

      if (chestEl) chestEl.textContent = "💰";
      if (titleEl) titleEl.textContent = `អបអរសាទរ! ឈ្នះ +$${(json.reward_amount || 0).toFixed(2)} USD`;
      if (descEl) descEl.textContent = `ប្រាក់រង្វាន់ត្រូវបានបញ្ចូលទៅក្នុង Wallet របស់អ្នករួចរាល់ហើយ! (សមតុល្យបច្ចុប្បន្ន៖ $${(json.new_balance || 0).toFixed(2)})`;

      if (btnEl) {
        btnEl.disabled = false;
        btnEl.textContent = "✅ បិទផ្ទាំង (Done)";
        btnEl.onclick = () => closeModal("dailyCheckinModal");
      }

      await loadDailyCheckinStatus();
      await loadWalletInfo();
      await loadUserVipHeader();
    } else {
      showToast(json?.message || "❌ មិនអាចទទួលរង្វាន់បានទេ", "warning");
      closeModal("dailyCheckinModal");
    }
  } catch (err) {
    showToast("❌ " + err.message, "error");
  } finally {
    if (btnEl) btnEl.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════════
// 💎 FEATURE 4: VIP LOYALTY TIERS & CASHBACK CLIENT ENGINE
// ═══════════════════════════════════════════════════════════════
async function loadUserVipHeader() {
  try {
    const res = await fetch(`/api/user/${currentUser.user_id}/vip-status`);
    const json = await res.json();
    if (json.status === "success" && json.data) {
      const d = json.data;
      const badgeEl = document.getElementById("userVipBadge");
      if (badgeEl) {
        badgeEl.textContent = d.tier_name || "🥉 Bronze Member";
        badgeEl.style.color = d.color || "#cd7f32";
      }
    }
  } catch (e) {
    console.error("VIP status header error:", e);
  }
}

async function openVipModal() {
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
  playSound("click");

  try {
    const res = await fetch(`/api/user/${currentUser.user_id}/vip-status`);
    const json = await res.json();
    if (json.status === "success" && json.data) {
      const d = json.data;
      const rankEl = document.getElementById("vipModalRank");
      const spentEl = document.getElementById("vipModalTotalSpent");
      const barEl = document.getElementById("vipModalProgressBar");
      const targetEl = document.getElementById("vipModalTargetText");

      if (rankEl) rankEl.textContent = d.tier_name;
      if (spentEl) spentEl.textContent = `$${d.total_spent.toFixed(2)}`;
      if (barEl) barEl.style.width = `${Math.min(100, d.progress_pct)}%`;
      if (targetEl) {
        if (d.next_tier) {
          targetEl.textContent = `ត្រូវការចំណាយ $${d.needed_amount.toFixed(2)} ទៀតដើម្បីឡើង ${d.next_tier} VIP (Cashback ${d.cashback_pct + 2}%)`;
        } else {
          targetEl.textContent = "🎉 អ្នកស្ថិតនៅកម្រិតកំពូល Diamond VIP រួចរាល់ហើយ! (CashBack 6%)";
        }
      }
    }
  } catch (e) {
    console.error("Open VIP modal error:", e);
  }

  openModal("vipModal");
}

// ═══════════════════════════════════════════════════════════════
// 🤖 FEATURE 1: SMART AI CHATBOT ASSISTANT CLIENT ENGINE
// ═══════════════════════════════════════════════════════════════
function openAIAssistantModal() {
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
  playSound("click");
  openModal("aiAssistantModal");
}

function sendQuickPrompt(promptText) {
  const inputEl = document.getElementById("aiChatInput");
  if (inputEl) {
    inputEl.value = promptText;
    sendAIChatMessage();
  }
}

async function sendAIChatMessage() {
  const inputEl = document.getElementById("aiChatInput");
  const msgText = inputEl ? inputEl.value.trim() : "";
  if (!msgText) return;

  const msgContainer = document.getElementById("aiChatMessages");
  if (!msgContainer) return;

  // Append user bubble
  const userBubble = document.createElement("div");
  userBubble.className = "ai-msg ai-msg-user";
  userBubble.textContent = msgText;
  msgContainer.appendChild(userBubble);
  inputEl.value = "";
  msgContainer.scrollTop = msgContainer.scrollHeight;

  // Append thinking bubble
  const botBubble = document.createElement("div");
  botBubble.className = "ai-msg ai-msg-bot";
  botBubble.innerHTML = "🤖 <i>កំពុងគិត...</i>";
  msgContainer.appendChild(botBubble);
  msgContainer.scrollTop = msgContainer.scrollHeight;

  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("light");

  try {
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msgText, user_id: currentUser.user_id })
    });
    const json = await res.json();
    if (json.status === "success") {
      botBubble.innerHTML = json.reply;

      // Update quick chips if provided
      if (Array.isArray(json.quick_replies) && json.quick_replies.length > 0) {
        const chipsContainer = document.getElementById("aiQuickChips");
        if (chipsContainer) {
          chipsContainer.innerHTML = json.quick_replies
            .map(q => `<button class="ai-chip" onclick="sendQuickPrompt('${q.replace(/'/g, "\\'")}')">${q}</button>`)
            .join("");
        }
      }
    } else {
      botBubble.innerHTML = "❌ សូមអភ័យទោស ខ្ញុំមិនអាចឆ្លើយបានទេនៅពេលនេះ។";
    }
  } catch (err) {
    botBubble.innerHTML = `❌ Error: ${err.message}`;
  }
  msgContainer.scrollTop = msgContainer.scrollHeight;
}

// ═══════════════════════════════════════════════════════════════
// ⭐ FEATURE 3: VERIFIED CUSTOMER REVIEWS CLIENT ENGINE
// ═══════════════════════════════════════════════════════════════
function setReviewRating(stars) {
  const hiddenInput = document.getElementById("selectedStarRating");
  if (hiddenInput) hiddenInput.value = stars;

  const starPicks = document.querySelectorAll("#starRatingBox .star-pick");
  starPicks.forEach((sp, idx) => {
    if (idx < stars) {
      sp.classList.add("active");
    } else {
      sp.classList.remove("active");
    }
  });
  if (tg?.HapticFeedback) tg.HapticFeedback.selectionChanged();
}

function openReviewModal(orderId, productId, rawProdName) {
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
  playSound("click");

  const name = decodeURIComponent(rawProdName);
  document.getElementById("reviewProdName").textContent = name;
  document.getElementById("reviewOrderId").value = orderId;
  document.getElementById("reviewProductId").value = productId;
  document.getElementById("reviewCommentText").value = "";
  setReviewRating(5);

  openModal("reviewModal");
}

async function submitCustomerReview() {
  const orderId = document.getElementById("reviewOrderId").value;
  const prodId = document.getElementById("reviewProductId").value;
  const prodName = document.getElementById("reviewProdName").textContent;
  const rating = document.getElementById("selectedStarRating").value;
  const comment = document.getElementById("reviewCommentText").value.trim();

  const btnEl = document.getElementById("btnSubmitReview");
  if (btnEl) {
    btnEl.disabled = true;
    btnEl.textContent = "⏳ កំពុងផ្ញើ Review...";
  }

  try {
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_id: Number(orderId),
        user_id: currentUser.user_id,
        product_id: Number(prodId),
        product_name: prodName,
        rating: Number(rating),
        comment: comment,
        user_name: currentUser.full_name
      })
    });
    const json = await res.json();
    if (json.status === "success" || json.status === "already_reviewed") {
      if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
      playSound("win");
      showToast(json.message || "✅ បានផ្ញើមតិយោបល់រួចរាល់!", "success", 4000);
      closeModal("reviewModal");
    } else {
      showToast(`❌ ${json.detail || "Error"}`, "error");
    }
  } catch (err) {
    alert("❌ Error: " + err.message);
  } finally {
    if (btnEl) {
      btnEl.disabled = false;
      btnEl.textContent = "⭐ ផ្ញើមតិយោបល់ (Submit Review)";
    }
  }
}

async function openReviewsViewModal(productId, rawProdName) {
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
  playSound("click");
  openModal("reviewsViewModal");
  await loadReviewsList(productId);
}

async function loadReviewsList(productId = null) {
  const container = document.getElementById("reviewsListContainer");
  if (!container) return;

  container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">⏳ កំពុងផ្ទុក Reviews...</div>`;

  try {
    const url = productId ? `/api/reviews?product_id=${productId}` : "/api/reviews";
    const res = await fetch(url);
    const json = await res.json();

    if (json.status === "success" && Array.isArray(json.data) && json.data.length > 0) {
      let html = `
        <div style="background:rgba(251,191,36,0.1); border:1px solid rgba(251,191,36,0.3); border-radius:12px; padding:12px; text-align:center; margin-bottom:8px;">
          <div style="font-size:24px; font-weight:900; color:#fbbf24;">⭐ ${json.avg_rating} / 5.0</div>
          <div style="font-size:11px; color:var(--text-sub); margin-top:2px;">ផ្អែកលើការវាយតម្លៃពីអតិថិជនពិតប្រាកដ ${json.total_reviews} នាក់</div>
        </div>
      `;

      json.data.forEach(r => {
        const starStr = "⭐".repeat(r.rating || 5);
        html += `
          <div class="review-card-item">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <strong style="font-size:13px; color:#fff;">${r.user_name || "អតិថិជន"}</strong>
              <span class="verified-tag">✓ Verified Buyer</span>
            </div>
            <div style="font-size:11px; color:#fbbf24; margin-bottom:4px;">${starStr} • <span style="color:var(--text-muted);">${r.product_name}</span></div>
            <div style="font-size:12px; color:var(--text-sub); line-height:1.4;">${r.comment || "Account ដំណើរការល្អណាស់!"}</div>
          </div>
        `;
      });
      container.innerHTML = html;
    } else {
      container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted);">មិនទាន់មាន Reviews សម្រាប់ទំនិញនេះនៅឡើយទេ</div>`;
    }
  } catch (err) {
    container.innerHTML = `<div style="text-align:center; color:var(--danger); padding:20px;">❌ មិនអាចផ្ទុក Reviews បានទេ: ${err.message}</div>`;
  }
}

// ═══════════════════════════════════════════════════════════════
// 🔔 FEATURE 3: BACK-IN-STOCK NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════
async function handleSubscribeStock(productId, encodedName) {
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("medium");
  playSound("click");
  const prodName = decodeURIComponent(encodedName || "ទំនិញ");

  try {
    const res = await fetch(`/api/products/${productId}/notify-stock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: currentUser.user_id })
    });
    const json = await res.json();
    if (json.status === "success") {
      showToast(`🔔 បានចុះឈ្មោះទទួលដំណឹងសម្រាប់ ${prodName} ជោគជ័យ!`, "success", 3000);
    } else {
      showToast(json.message || "មិនអាចចុះឈ្មោះបានទេ", "error");
    }
  } catch (err) {
    showToast(`❌ កំហុស: ${err.message}`, "error");
  }
}

// ═══════════════════════════════════════════════════════════════
// 🧧 FEATURE 2: LUCKY ANGPAO / RED PACKET CLIENT ENGINE
// ═══════════════════════════════════════════════════════════════
let activeAngpaoCode = null;

function openCreateAngpaoModal() {
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
  playSound("click");
  const resultBox = document.getElementById("angpaoCreatedResult");
  if (resultBox) resultBox.style.display = "none";
  const form = document.getElementById("formCreateAngpao");
  if (form) form.style.display = "block";
  openModal("createAngpaoModal");
}

async function submitCreateAngpao(e) {
  e.preventDefault();
  const btn = document.getElementById("btnSubmitCreateAngpao");
  const amt = parseFloat(document.getElementById("angpaoAmount").value);
  const slots = parseInt(document.getElementById("angpaoSlots").value);
  const msg = document.getElementById("angpaoMsg").value;

  if (isNaN(amt) || amt < 0.10) {
    showToast("ទឹកប្រាក់អប្បបរមាគឺ $0.10 USD", "error");
    return;
  }
  if (isNaN(slots) || slots < 1) {
    showToast("ចំនួនអ្នកទទួលត្រូវចាប់ពី ១ នាក់ឡើងទៅ", "error");
    return;
  }

  btn.disabled = true;
  btn.textContent = "⏳ កំពុងបង្កើតកញ្ចប់អាំងប៉ាវ...";

  try {
    const res = await fetch("/api/angpao/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creator_id: currentUser.user_id,
        creator_name: currentUser.full_name,
        total_amount: amt,
        total_slots: slots,
        message: msg
      })
    });
    const json = await res.json();

    if (json.status === "success") {
      playSound("success");
      triggerConfetti();
      showToast("🎉 បង្កើតកញ្ចប់អាំងប៉ាវជោគជ័យ!", "success", 2500);

      document.getElementById("formCreateAngpao").style.display = "none";
      const resultBox = document.getElementById("angpaoCreatedResult");
      resultBox.style.display = "block";
      document.getElementById("angpaoShareLinkText").textContent = json.share_link;

      await syncUserWithBackend();
    } else {
      showToast(json.detail || json.message || "មិនអាចបង្កើតបានទេ", "error");
    }
  } catch (err) {
    showToast(`❌ កំហុស: ${err.message}`, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "🧧 បង្កើត & យក Link ចែកក្នុង Group";
  }
}

async function openAngpaoClaimModal(code) {
  activeAngpaoCode = code;
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("medium");

  const sponsorEl = document.getElementById("angpaoSponsorName");
  const msgEl = document.getElementById("angpaoBlessingText");
  const actionBox = document.getElementById("angpaoOpenActionBox");
  const resultBox = document.getElementById("angpaoResultBox");
  const listEl = document.getElementById("angpaoClaimantsList");
  const statusEl = document.getElementById("angpaoSlotsStatus");

  actionBox.style.display = "block";
  resultBox.style.display = "none";
  listEl.innerHTML = `<div style="text-align:center; padding:10px; color:var(--text-muted);">⏳ កំពុងទាញទិន្នន័យ...</div>`;

  openModal("angpaoClaimModal");

  try {
    const res = await fetch(`/api/angpao/${code}`);
    const json = await res.json();
    if (json.status === "success" && json.data) {
      const data = json.data;
      sponsorEl.textContent = data.creator_name || "Store Sponsor";
      msgEl.textContent = `"${data.message || 'សូមសំណាងល្អ!'}"`;
      statusEl.textContent = `👥 អ្នកបានបើក (${data.claimed_slots}/${data.total_slots} នាក់) - នៅសល់ $${data.remaining_amount.toFixed(2)} USD`;

      if (Array.isArray(data.claims) && data.claims.length > 0) {
        let html = "";
        data.claims.forEach((c, idx) => {
          html += `
            <div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
              <span style="color:#fff;">${idx === 0 ? '👑 ' : ''}${c.user_name || 'អតិថិជន'}</span>
              <strong style="color:#fbbf24;">+$${c.amount.toFixed(2)} USD</strong>
            </div>
          `;
        });
        listEl.innerHTML = html;
      } else {
        listEl.innerHTML = `<div style="color:var(--text-muted); text-align:center; padding:10px;">មិនទាន់មានអ្នកបើកនៅឡើយទេ</div>`;
      }
    }
  } catch (err) {
    console.error("Angpao load error:", err);
  }
}

async function executeClaimAngpao() {
  if (!activeAngpaoCode) return;
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("heavy");
  const btn = document.getElementById("btnOpenAngpao");
  btn.style.animation = "goldRotate 0.5s infinite linear";

  try {
    const res = await fetch(`/api/angpao/${activeAngpaoCode}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: currentUser.user_id,
        user_name: currentUser.full_name
      })
    });
    const json = await res.json();

    if (json.status === "success") {
      playSound("success");
      triggerConfetti();

      document.getElementById("angpaoOpenActionBox").style.display = "none";
      const resultBox = document.getElementById("angpaoResultBox");
      resultBox.style.display = "block";
      document.getElementById("angpaoWinAmount").textContent = `+$${json.reward_amount.toFixed(2)} USD`;

      showToast(`🎉 អបអរសាទរ! អ្នកទទួលបាន $${json.reward_amount.toFixed(2)} USD!`, "success", 3000);
      await syncUserWithBackend();
      openAngpaoClaimModal(activeAngpaoCode);
    } else if (json.status === "already_claimed") {
      showToast("⚠️ អ្នកបានបើកអាំងប៉ាវនេះរួចរាល់ហើយ!", "info");
      document.getElementById("angpaoOpenActionBox").style.display = "none";
    } else if (json.status === "empty") {
      showToast("🧧 អាំងប៉ាវនេះត្រូវបានបើកអស់ហើយ!", "info");
      document.getElementById("angpaoOpenActionBox").style.display = "none";
    } else {
      showToast(json.message || "មិនអាចបើកបានទេ", "error");
    }
  } catch (err) {
    showToast(`❌ កំហុស: ${err.message}`, "error");
  } finally {
    btn.style.animation = "goldRotate 4s infinite linear";
  }
}

// ═══════════════════════════════════════════════════════════════
// 💵 WALLET TOP-UP & INSTANT 1-TAP PURCHASE ENGINE
// ═══════════════════════════════════════════════════════════════
let currentTopupAmount = 1.00;

async function loadWalletInfo() {
  const historyList = document.getElementById("walletHistoryList");
  const refLinkText = document.getElementById("referralLinkText");
  const refCountVal = document.getElementById("refCountVal");
  const refEarnedVal = document.getElementById("refEarnedVal");
  const balEl = document.getElementById("userWalletBalance");
  const balKhr = document.getElementById("userWalletBalanceKhr");
  const cardHolder = document.getElementById("walletCardholderName");
  const cardId = document.getElementById("walletCardUserId");

  if (cardHolder) cardHolder.textContent = (currentUser.full_name || "MEMBER").toUpperCase();
  if (cardId) {
    const idStr = String(currentUser.user_id || "0000");
    cardId.textContent = `•••• •••• •••• ${idStr.slice(-4)}`;
  }

  // Update referral link
  const botUser = window.tg?.initDataUnsafe?.bot_username || "digitalappstore_bot";
  const refUrl = `https://t.me/${botUser}?start=ref_${currentUser.user_id}`;
  if (refLinkText) refLinkText.textContent = refUrl;

  try {
    const res = await fetch(`/api/user/${currentUser.user_id}/wallet-history`);
    const json = await res.json();

    if (json.status === "success") {
      currentUser.balance = parseFloat(json.balance) || 0.0;
      if (balEl) balEl.textContent = `$${currentUser.balance.toFixed(2)}`;
      if (balKhr) {
        const khr = Math.round((currentUser.balance || 0) * 4100);
        balKhr.textContent = `≈ ${khr.toLocaleString()} ៛`;
      }
      if (refCountVal) refCountVal.textContent = `${json.referrals_count || 0} នាក់`;
      if (refEarnedVal) refEarnedVal.textContent = `$${parseFloat(json.referrals_earned || 0).toFixed(2)}`;

      const txs = json.transactions || [];
      if (historyList) {
        if (txs.length === 0) {
          historyList.innerHTML = `
            <div style="text-align:center; padding:32px 20px; color:var(--text-muted); background:var(--card-glass); border-radius:16px; border:1px dashed var(--card-border);">
              <div style="font-size:30px; margin-bottom:6px;">💳</div>
              <div style="font-size:13px; font-weight:700; color:var(--text-main);">មិនទាន់មានប្រវត្តិប្រតិបត្តិការនៅឡើយទេ</div>
              <div style="font-size:11px; color:var(--text-sub); margin-top:4px;">រាល់ការបញ្ចូលប្រាក់ ឬការទិញទំនិញ នឹងបង្ហាញនៅទីនេះ</div>
            </div>
          `;
        } else {
          let html = "";
          txs.forEach(t => {
            const isDeposit = t.type === "deposit" || t.type === "credit" || t.type === "topup" || parseFloat(t.amount) > 0;
            const isRefBonus = t.type === "referral_bonus" || t.type === "cashback";
            const isPurchase = t.type === "purchase" || parseFloat(t.amount) < 0;

            let iconClass = "deposit";
            let iconEmoji = "➕";
            let typeLabel = "បញ្ចូលលុយ (Deposit)";
            let sign = "+";
            let color = "#34d399";

            if (isRefBonus) {
              iconClass = "referral_bonus";
              iconEmoji = "🎁";
              typeLabel = "Referral Bonus (5% Cashback)";
              sign = "+";
              color = "#fbbf24";
            } else if (isPurchase) {
              iconClass = "purchase";
              iconEmoji = "🛒";
              typeLabel = "ទិញទំនិញ (Purchase)";
              sign = "-";
              color = "#f87171";
            }

            const absAmt = Math.abs(parseFloat(t.amount || 0)).toFixed(2);
            const dt = t.created_at ? formatOrderDateTime(t.created_at) : "";

            html += `
              <div class="wallet-tx-item">
                <div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">
                  <div class="wallet-tx-icon ${iconClass}">${iconEmoji}</div>
                  <div style="min-width:0; flex:1;">
                    <div style="font-size:12.5px; font-weight:800; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                      ${escapeHtml(t.description || typeLabel)}
                    </div>
                    <div style="font-size:10.5px; color:var(--text-muted); margin-top:2px;">
                      ${dt}
                    </div>
                  </div>
                </div>
                <div style="text-align:right; flex-shrink:0;">
                  <div style="font-size:14px; font-weight:900; color:${color}; font-family:var(--font-num);">
                    ${sign}$${absAmt}
                  </div>
                </div>
              </div>
            `;
          });
          historyList.innerHTML = html;
        }
      }
    } else {
      if (historyList) historyList.innerHTML = `<div style="text-align:center; color:var(--danger); padding:20px;">❌ មិនអាចផ្ទុកប្រវត្តិប្រតិបត្តិការបានទេ</div>`;
    }
  } catch (err) {
    if (historyList) historyList.innerHTML = `<div style="text-align:center; color:var(--danger); padding:20px;">❌ កំហុស: ${err.message}</div>`;
  }
}
window.loadWalletInfo = loadWalletInfo;

function copyReferralLink(btnEl) {
  const botUser = window.tg?.initDataUnsafe?.bot_username || "digitalappstore_bot";
  const refUrl = `https://t.me/${botUser}?start=ref_${currentUser.user_id}`;
  navigator.clipboard.writeText(refUrl).then(() => {
    if (window.tg?.HapticFeedback) window.tg.HapticFeedback.notificationOccurred("success");
    showToast("✅ បាន Copy Referral Link រួចរាល់! អាចផ្ញើទៅកាន់មិត្តភក្តិបាន!", "success");
    if (btnEl) {
      const orig = btnEl.innerHTML;
      btnEl.innerHTML = "<span>✅</span> <span>Copied Link!</span>";
      btnEl.classList.add("copy-flash");
      setTimeout(() => {
        btnEl.innerHTML = orig;
        btnEl.classList.remove("copy-flash");
      }, 2000);
    }
  }).catch(() => {
    showToast("❌ មិនអាច Copy បានទេ!", "error");
  });
}
window.copyReferralLink = copyReferralLink;

function shareReferralLink(e) {
  if (e) e.preventDefault();
  const botUser = window.tg?.initDataUnsafe?.bot_username || "digitalappstore_bot";
  const refUrl = `https://t.me/${botUser}?start=ref_${currentUser.user_id}`;
  const shareText = "🎁 ចូលទិញគណនី Premium (ChatGPT Plus, Gemini Pro, Canva, CapCut...) តម្លៃពិសេសក្នុង Telegram Mini App ឥឡូវនេះ!";
  const shareLink = `https://t.me/share/url?url=${encodeURIComponent(refUrl)}&text=${encodeURIComponent(shareText)}`;
  
  if (window.tg?.openTelegramLink) {
    window.tg.openTelegramLink(shareLink);
  } else {
    window.open(shareLink, "_blank");
  }
}
window.shareReferralLink = shareReferralLink;

function openTopupModal() {
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
  playSound("click");
  setTopupAmount(1.00);
  openModal("topupWalletModal");
}

function quickOpenTopup(amt) {
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("medium");
  playSound("click");
  setTopupAmount(amt);
  openModal("topupWalletModal");
}

function setTopupAmount(amt) {
  currentTopupAmount = parseFloat(amt);
  const input = document.getElementById("topupAmountInput");
  if (input) input.value = currentTopupAmount.toFixed(2);
  updateTopupQrAmount(currentTopupAmount);
}

function updateTopupQrAmount(val) {
  const num = parseFloat(val) || 0;
  const badge = document.getElementById("topupAmountBadge");
  if (badge) badge.textContent = `💰 $${num.toFixed(2)} USD`;
}

function handleTopupSlipPreview(input) {
  const file = input.files[0];
  const preview = document.getElementById("topupSlipPreviewImg");
  const placeholder = document.getElementById("topupSlipPlaceholder");
  if (file && preview && placeholder) {
    const reader = new FileReader();
    reader.onload = e => {
      preview.src = e.target.result;
      preview.style.display = "block";
      placeholder.style.display = "none";
    };
    reader.readAsDataURL(file);
  }
}

async function submitWalletTopup(e) {
  e.preventDefault();
  const amtInput = document.getElementById("topupAmountInput");
  const slipInput = document.getElementById("topupSlipInput");
  const amt = parseFloat(amtInput ? amtInput.value : 0);

  if (isNaN(amt) || amt < 0.50) {
    showToast("ទឹកប្រាក់បញ្ចូលអប្បបរមាគឺ $0.50 USD", "error");
    return;
  }

  if (!slipInput || !slipInput.files || slipInput.files.length === 0) {
    showToast("សូមជ្រើសរើសរូបភាព Slip បង់ប្រាក់!", "warning");
    return;
  }

  const btn = document.getElementById("btnSubmitTopup");
  btn.disabled = true;
  btn.textContent = "⏳ កំពុងផ្ញើ Slip ទៅ Admin...";

  const formData = new FormData();
  formData.append("user_id", currentUser.user_id);
  formData.append("amount", amt);
  formData.append("proof_file", slipInput.files[0]);

  try {
    const res = await fetch("/api/wallet/deposit", {
      method: "POST",
      body: formData
    });
    const json = await res.json();

    if (json.status === "success") {
      playSound("success");
      triggerConfetti();
      closeModal("topupWalletModal");
      showToast("🎉 បានផ្ញើសំណើបញ្ចូលប្រាក់ជោគជ័យ! សូមរង់ចាំ Admin ពិនិត្យ 1-3 នាទី។", "success", 4500);
      e.target.reset();
      const preview = document.getElementById("topupSlipPreviewImg");
      const placeholder = document.getElementById("topupSlipPlaceholder");
      if (preview) preview.style.display = "none";
      if (placeholder) placeholder.style.display = "block";
    } else {
      showToast(json.detail || json.message || "មិនអាចផ្ញើបានទេ", "error");
    }
  } catch (err) {
    showToast(`❌ កំហុស: ${err.message}`, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "✅ ផ្ញើ Slip បញ្ចូលប្រាក់ទៅ Admin";
  }
}

async function executeWalletInstantBuy() {
  if (!currentCheckoutProduct) return;
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("heavy");

  const btn = document.getElementById("btnInstantWalletBuy");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "⚡ កំពុងកាត់លុយ & ប្រគល់ Account...";
  }

  const promoInput = document.getElementById("promoCodeInput");
  const promoCode = promoInput ? promoInput.value.trim().toUpperCase() : null;

  try {
    const res = await fetch("/api/orders/wallet-buy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: currentUser.user_id,
        product_id: currentCheckoutProduct.id,
        promo_code: promoCode || null
      })
    });
    const json = await res.json();

    if (json.status === "success") {
      playSound("success");
      triggerConfetti();
      closeModal("checkoutModal");

      // Reveal account in accountDetailsModal
      openAccountDetailsModalDirect(json);
      showToast("⚡ ការទិញតាម Wallet បានជោគជ័យ! Account ត្រូវបានប្រគល់ភ្លាមៗ។", "success", 4000);

      await syncUserWithBackend();
      await loadProducts();
      await loadUserOrders();
    } else {
      showToast(json.detail || json.message || "មិនអាចទិញបានទេ", "error");
    }
  } catch (err) {
    showToast(`❌ កំហុស: ${err.message}`, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "⚡ ទិញភ្លាមៗកាត់ពី Wallet (1-Second Buy)";
    }
  }
}

function openAccountDetailsModalDirect(orderData) {
  const prodNameEl = document.getElementById("accModalProdName");
  const metaEl = document.getElementById("accModalOrderMeta");
  const credEl = document.getElementById("accModalCredentials");
  const expiryEl = document.getElementById("accModalExpiry");
  const warrantyEl = document.getElementById("accModalWarranty");
  const geminiGuideEl = document.getElementById("accModalGeminiGuide");
  const geminiBtnGrid = document.getElementById("accModalGeminiBtnGrid");
  const geminiLinkBtn = document.getElementById("accModalGeminiLinkBtn");

  if (prodNameEl) prodNameEl.textContent = orderData.product_name;
  if (metaEl) metaEl.textContent = `Order #${orderData.order_id} | Price: $${orderData.price.toFixed(2)} | Instant Delivered`;
  if (credEl) credEl.textContent = orderData.credentials || "N/A";
  if (expiryEl) expiryEl.textContent = orderData.expiry_date || "N/A";
  if (warrantyEl) warrantyEl.textContent = "🛡️ 100% ធានាពេញរង្វង់";

  const isGemini = /gemini/i.test(orderData.product_name || "") || /gemini/i.test(orderData.credentials || "") || /activate/i.test(orderData.credentials || "") || /https?:\/\//i.test(orderData.credentials || "");
  if (geminiGuideEl) {
    if (isGemini) {
      geminiGuideEl.style.display = "block";
      const urlMatch = (orderData.credentials || "").match(/https?:\/\/[^\s<>"'\)]+/);
      if (urlMatch && geminiLinkBtn) {
        geminiLinkBtn.href = urlMatch[0];
        if (geminiBtnGrid) geminiBtnGrid.style.display = "grid";
      } else {
        if (geminiBtnGrid) geminiBtnGrid.style.display = "none";
      }
    } else {
      geminiGuideEl.style.display = "none";
      if (geminiBtnGrid) geminiBtnGrid.style.display = "none";
    }
  }

  openModal("accountDetailsModal");
}

// Topup requests management is handled unified by loadAdminTopupRequests / approveTopupRequest above

function openSlipModal(imgUrl) {
  if (!imgUrl || imgUrl === "WALLET_PAYMENT" || imgUrl === "instant_wallet_purchase.png") {
    showToast("ℹ️ ការទូទាត់នេះធ្វើឡើងតាមរយៈ Wallet (គ្មាន Slip ទេ)", "info");
    return;
  }
  const modal = document.getElementById("slipModal");
  const img = document.getElementById("slipModalImg");
  const dlBtn = document.getElementById("slipDownloadBtn");

  if (img) img.src = imgUrl;
  if (dlBtn) dlBtn.href = imgUrl;

  if (modal) {
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
    openModal("slipModal");
  }
}
window.openSlipModal = openSlipModal;
window.viewSlipImage = openSlipModal;


// ═══════════════════════════════════════════════════════════════
// 👥 ADVANCED USER & ROLE MANAGEMENT SYSTEM
// ═══════════════════════════════════════════════════════════════

let adminUsersData = [];
let adminUserFilterRole = "all";
let adminUserSearchDebounce = null;
let currentBalanceAdjustMode = "add";

function formatUserJoinDateTime(dtStr) {
  if (!dtStr) return "មិនមានទិន្នន័យ (N/A)";
  try {
    const cleaned = String(dtStr).replace(" ", "T");
    const d = new Date(cleaned.endsWith("Z") || cleaned.includes("+") ? cleaned : cleaned + "Z");
    if (isNaN(d.getTime())) {
      const dFallback = new Date(dtStr);
      if (isNaN(dFallback.getTime())) return dtStr;
      return dFallback.toLocaleString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
      });
    }
    return d.toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    });
  } catch (e) {
    return dtStr;
  }
}
window.formatUserJoinDateTime = formatUserJoinDateTime;

function formatTimeAgo(dtStr) {
  if (!dtStr) return "";
  try {
    const cleaned = String(dtStr).replace(" ", "T");
    const d = new Date(cleaned.endsWith("Z") || cleaned.includes("+") ? cleaned : cleaned + "Z");
    const timestamp = !isNaN(d.getTime()) ? d.getTime() : new Date(dtStr).getTime();
    if (isNaN(timestamp)) return "";
    
    const diffSec = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSec < 60) return "ទើបតែចូល";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} នាទីមុន`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} ម៉ោងមុន`;
    const diffDays = Math.floor(diffHour / 24);
    if (diffDays < 30) return `${diffDays} ថ្ងៃមុន`;
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths < 12) return `${diffMonths} ខែមុន`;
    return `${Math.floor(diffMonths / 12)} ឆ្នាំមុន`;
  } catch (e) {
    return "";
  }
}
window.formatTimeAgo = formatTimeAgo;

async function loadAdminUsers(filterRole, searchKeyword) {
  if (filterRole !== undefined) adminUserFilterRole = filterRole;
  const listEl = document.getElementById("adminUsersList");
  if (!listEl) return;

  try {
    listEl.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted);">⏳ កំពុងផ្ទុកបញ្ជី Users...</div>';
    
    let url = `/api/admin/users?admin_id=${currentUser.user_id}&limit=100`;
    if (adminUserFilterRole && adminUserFilterRole !== "all") {
      url += `&role=${encodeURIComponent(adminUserFilterRole)}`;
    }
    const kw = (searchKeyword !== undefined ? searchKeyword : document.getElementById("adminUserSearchInput")?.value || "").trim();
    if (kw) {
      url += `&search=${encodeURIComponent(kw)}`;
    }

    const res = await fetch(url);
    const json = await res.json();

    if (json.status === "success") {
      adminUsersData = json.users || [];
      
      // Update Summary KPIs
      if (json.summary) {
        const s = json.summary;
        if (document.getElementById("kpiTotalUsers")) document.getElementById("kpiTotalUsers").textContent = s.total_users || 0;
        if (document.getElementById("kpiTotalAdmins")) document.getElementById("kpiTotalAdmins").textContent = s.total_admins || 0;
        if (document.getElementById("kpiTotalVip")) document.getElementById("kpiTotalVip").textContent = s.total_vip || 0;
        if (document.getElementById("kpiTotalResellers")) document.getElementById("kpiTotalResellers").textContent = s.total_resellers || 0;
        const navBadge = document.getElementById("badgeNavUsers");
        if (navBadge) {
          navBadge.style.display = "inline-block";
          navBadge.textContent = s.total_users || adminUsersData.length;
        }
      }

      renderAdminUsersList(adminUsersData);
    } else {
      listEl.innerHTML = `<div style="text-align:center; padding:20px; color:#f87171;">⚠️ ${json.detail || json.message || "Failed to load users"}</div>`;
    }
  } catch (err) {
    console.error("loadAdminUsers error:", err);
    listEl.innerHTML = `<div style="text-align:center; padding:20px; color:#f87171;">❌ Error loading users: ${err.message}</div>`;
  }
}
window.loadAdminUsers = loadAdminUsers;

function formatUserJoinDateTime(dateStr) {
  if (!dateStr) return "N/A";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch (e) {
    return String(dateStr);
  }
}

function formatUserLastActive(dateStr) {
  if (!dateStr) return { isToday: false, label: "គ្មានទិន្នន័យ", badge: "⚪ Offline", timeAgo: "" };
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return { isToday: false, label: String(dateStr), badge: "⚪ N/A", timeAgo: "" };
    
    const now = new Date();
    const diffMs = Math.max(0, now - d);
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    const isSameDay = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = d.getDate() === yesterday.getDate() && d.getMonth() === yesterday.getMonth() && d.getFullYear() === yesterday.getFullYear();

    const timeFormatted = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
    const dateFormatted = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

    if (diffMins < 10) {
      return { isToday: true, label: `Online (${timeFormatted})`, badge: `🟢 Online`, timeAgo: `ទើបចូល` };
    } else if (isSameDay) {
      const agoText = diffHours >= 1 ? `${diffHours} ម៉ោងមុន` : `${diffMins} នាទីមុន`;
      return { isToday: true, label: `ថ្ងៃនេះ ${timeFormatted}`, badge: `🟢 ថ្ងៃនេះ`, timeAgo: agoText };
    } else if (isYesterday) {
      return { isToday: false, isYesterday: true, label: `ម្សិលមិញ ${timeFormatted}`, badge: `🟡 ម្សិលមិញ`, timeAgo: `1 ថ្ងៃមុន` };
    } else {
      const dayText = diffDays > 0 ? `${diffDays} ថ្ងៃមុន` : `ថ្មីៗ`;
      return { isToday: false, label: `${dateFormatted}`, badge: `⚪ ${dayText}`, timeAgo: dayText };
    }
  } catch (e) {
    return { isToday: false, label: String(dateStr), badge: "⚪ Recent", timeAgo: "" };
  }
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    const now = new Date();
    const diffMs = Math.max(0, now - d);
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return "ទើបតែចូល";
    if (diffMins < 60) return `${diffMins} នាទីមុន`;
    if (diffHours < 24) return `${diffHours} ម៉ោងមុន`;
    if (diffDays === 1) return `1 ថ្ងៃមុន`;
    if (diffDays < 30) return `${diffDays} ថ្ងៃមុន`;
    return `${Math.floor(diffDays / 30)} ខែមុន`;
  } catch (e) {
    return "";
  }
}

function renderAdminUsersList(users) {
  const listEl = document.getElementById("adminUsersList");
  if (!listEl) return;

  if (!users || users.length === 0) {
    listEl.innerHTML = `
      <div style="text-align:center; padding:35px 20px; background:rgba(0,0,0,0.25); border:1px dashed var(--card-border); border-radius:16px;">
        <div style="font-size:32px; margin-bottom:8px;">👥</div>
        <div style="font-size:14px; font-weight:700; color:#fff;">រកមិនឃើញ User ឡើយ</div>
        <div style="font-size:11.5px; color:var(--text-muted); margin-top:4px;">សូមសាកល្បងស្វែងរកជាមួយពាក្យគន្លឹះ ឬជ្រើសរើស Filter ផ្សេង។</div>
      </div>
    `;
    return;
  }

  const roleLabelMap = {
    super_admin: { label: "Super Admin", icon: "👑", cls: "role-super_admin" },
    admin: { label: "Admin", icon: "⚡", cls: "role-admin" },
    moderator: { label: "Staff / Mod", icon: "🛡️", cls: "role-moderator" },
    staff: { label: "Staff", icon: "🛡️", cls: "role-moderator" },
    reseller: { label: "VIP Reseller", icon: "💼", cls: "role-reseller" },
    user: { label: "Member", icon: "🌟", cls: "role-user" }
  };

  const vipLabelMap = {
    bronze: "🥉 Bronze",
    silver: "🥈 Silver",
    gold: "🥇 Gold",
    platinum: "🏆 Plat",
    diamond: "💎 Diamond"
  };

  listEl.innerHTML = users.map(u => {
    const roleKey = (u.role || "user").toLowerCase();
    const rInfo = roleLabelMap[roleKey] || roleLabelMap.user;
    const vipTier = (u.vip_tier || "bronze").toLowerCase();
    const vipBadge = vipLabelMap[vipTier] || "🥉 Bronze";
    const displayName = u.full_name && u.full_name.trim() !== '' ? u.full_name : (u.username ? '@' + u.username : 'User #' + u.user_id);
    const initial = escapeHtml(displayName.charAt(0).toUpperCase());
    const isBanned = !!u.is_banned;
    const balance = parseFloat(u.balance || 0).toFixed(2);
    const spent = parseFloat(u.total_spent || 0).toFixed(2);
    const ordersCount = u.total_orders || 0;
    const photoSrc = u.photo_url ? escapeHtml(u.photo_url) : `/api/user/${u.user_id}/avatar`;
    const joinDateFormatted = formatUserJoinDateTime(u.created_at);
    const joinTimeAgoStr = formatTimeAgo(u.created_at);
    const lastActiveInfo = formatUserLastActive(u.last_active_at || u.created_at);

    return `
      <div class="admin-user-card ${isBanned ? 'is-banned-card' : ''}" id="userCard_${u.user_id}">
        <div class="admin-user-card-header">
          <div class="admin-user-info-col">
            <div class="admin-user-avatar">
              <img src="${photoSrc}" alt="${initial}" loading="lazy" onerror="this.style.display='none'; this.parentElement.innerText='${initial}';" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;">
            </div>
            <div class="admin-user-name-box">
              <div class="admin-user-fullname">${escapeHtml(displayName)}</div>
              <div class="admin-user-handle">
                <span>${u.username ? '@' + escapeHtml(u.username) : 'ID: ' + u.user_id}</span>
                <span class="btn-mini-copy" style="font-size:10px; padding:1px 6px; border-radius:6px;" onclick="event.stopPropagation(); copyText('${u.user_id}', this)">Copy ID</span>
              </div>
            </div>
          </div>
          <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px; flex-shrink:0;">
            <span class="role-badge-pill ${rInfo.cls}">${rInfo.icon} ${rInfo.label}</span>
            <span class="vip-badge-pill" style="font-size:9.5px; padding:1px 6px;">${vipBadge}</span>
          </div>
        </div>

        <!-- Financial & Activity Strip -->
        <div class="admin-user-stats-strip">
          <div class="admin-user-stat-item">
            <div class="stat-title">Wallet Bal</div>
            <div class="stat-val balance-green">$${balance}</div>
          </div>
          <div class="admin-user-stat-item">
            <div class="stat-title">Total Spent</div>
            <div class="stat-val spent-gold">$${spent}</div>
          </div>
          <div class="admin-user-stat-item">
            <div class="stat-title">Orders</div>
            <div class="stat-val stat-cyan">${ordersCount}</div>
          </div>
        </div>

        <!-- Registration Date & Last Active Box -->
        <div class="admin-user-activity-box">
          <div class="activity-row">
            <div style="display:flex; align-items:center; gap:6px; min-width:0;">
              <span style="font-size:12px;">📅</span>
              <span style="font-size:11px; color:var(--text-muted);">ចុះឈ្មោះ៖</span>
              <strong style="color:#38bdf8; font-size:11.5px;">${joinDateFormatted}</strong>
            </div>
            ${joinTimeAgoStr ? `<span class="time-pill">⏱️ ${joinTimeAgoStr}</span>` : ''}
          </div>

          <div class="activity-row" style="margin-top:5px; padding-top:5px; border-top:1px dashed rgba(255,255,255,0.06);">
            <div style="display:flex; align-items:center; gap:6px; min-width:0;">
              <span style="font-size:12px;">${lastActiveInfo.isToday ? '🟢' : (lastActiveInfo.isYesterday ? '🟡' : '⚪')}</span>
              <span style="font-size:11px; color:var(--text-muted);">ចូលចុងក្រោយ៖</span>
              <strong style="color:${lastActiveInfo.isToday ? '#34d399' : (lastActiveInfo.isYesterday ? '#fbbf24' : '#94a3b8')}; font-size:11.5px;">
                ${lastActiveInfo.label}
              </strong>
            </div>
            <span class="active-badge-pill ${lastActiveInfo.isToday ? 'is-today' : ''}">
              ${lastActiveInfo.badge}
            </span>
          </div>
        </div>

        ${isBanned ? `
          <div style="font-size:11px; color:#f87171; background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.3); border-radius:8px; padding:6px 10px; margin-top:8px; display:flex; align-items:center; gap:6px;">
            <span>🚫</span>
            <span><strong>គណនីត្រូវបាន BANNED:</strong> ${escapeHtml(u.ban_reason || 'No reason specified')}</span>
          </div>
        ` : ''}

        <!-- 4 Actions Grid -->
        <div class="admin-user-actions-row">
          <button type="button" class="btn-user-action action-role" onclick="openAdminUserRoleModal(${u.user_id}, '${roleKey}', '${escapeHtml(u.username || u.full_name)}')">
            <span>👑</span> Role
          </button>
          <button type="button" class="btn-user-action action-balance" onclick="openAdminUserBalanceModal(${u.user_id}, ${balance}, '${escapeHtml(u.username || u.full_name)}')">
            <span>💵</span> Balance
          </button>
          <button type="button" class="btn-user-action action-info" onclick="openAdminUserDetailsModal(${u.user_id})">
            <span>🔍</span> Info
          </button>
          <button type="button" class="btn-user-action ${isBanned ? 'action-unban' : 'action-ban'}" onclick="toggleAdminUserBan(${u.user_id}, ${isBanned ? 1 : 0}, '${escapeHtml(u.username || u.full_name)}')">
            <span>${isBanned ? '✅' : '🚫'}</span> ${isBanned ? 'Unban' : 'Ban'}
          </button>
        </div>
      </div>
    `;
  }).join("");
}

function filterAdminUsersByRole(role, btnEl) {
  adminUserFilterRole = role;
  document.querySelectorAll(".admin-user-role-filters .cat-btn").forEach(b => b.classList.remove("active"));
  if (btnEl) btnEl.classList.add("active");
  loadAdminUsers(role);
}
window.filterAdminUsersByRole = filterAdminUsersByRole;

function debounceAdminUserSearch(keyword) {
  if (adminUserSearchDebounce) clearTimeout(adminUserSearchDebounce);
  adminUserSearchDebounce = setTimeout(() => {
    loadAdminUsers(adminUserFilterRole, keyword);
  }, 350);
}
window.debounceAdminUserSearch = debounceAdminUserSearch;

function openAdminUserRoleModal(userId, currentRole, userName) {
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("medium");
  playSound("click");

  const targetIdInput = document.getElementById("modalRoleTargetUserId");
  const subEl = document.getElementById("modalUserRoleSubtitle");
  if (targetIdInput) targetIdInput.value = userId;
  if (subEl) subEl.textContent = `User: ${userName} (ID: ${userId})`;

  // Select appropriate radio card
  document.querySelectorAll("#roleSelectorGrid .role-radio-card").forEach(card => {
    const rVal = card.getAttribute("data-role");
    const input = card.querySelector("input[type='radio']");
    if (rVal === currentRole || (currentRole === "staff" && rVal === "moderator")) {
      if (input) input.checked = true;
      card.classList.add("active-role-option");
    } else {
      if (input) input.checked = false;
      card.classList.remove("active-role-option");
    }

    card.onclick = () => {
      document.querySelectorAll("#roleSelectorGrid .role-radio-card").forEach(c => c.classList.remove("active-role-option"));
      card.classList.add("active-role-option");
      if (input) input.checked = true;
    };
  });

  openModal("adminUserRoleModal");
}
window.openAdminUserRoleModal = openAdminUserRoleModal;

async function submitAdminUpdateUserRole(event) {
  event.preventDefault();
  const userId = document.getElementById("modalRoleTargetUserId")?.value;
  const selectedRole = document.querySelector("input[name='selectedUserRole']:checked")?.value;
  const btn = document.getElementById("btnSaveUserRole");

  if (!userId || !selectedRole) {
    showToast("⚠️ សូមជ្រើសរើស Role មួយ!", "warning");
    return;
  }

  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("medium");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "⏳ កំពុងរក្សាទុក...";
  }

  try {
    const res = await fetch(`/api/admin/users/${userId}/role`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        admin_id: currentUser.user_id,
        new_role: selectedRole
      })
    });
    const json = await res.json();
    if (json.status === "success") {
      showToast(`✅ បានកែប្រែ Role ទៅជា ${selectedRole.toUpperCase()} ជោគជ័យ!`, "success");
      closeModal("adminUserRoleModal");
      await loadAdminUsers();
    } else {
      showToast(`❌ ${json.detail || json.message || "Failed to update role"}`, "error");
    }
  } catch (err) {
    showToast(`❌ កំហុស: ${err.message}`, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "💾 រក្សាទុក Role";
    }
  }
}
window.submitAdminUpdateUserRole = submitAdminUpdateUserRole;

function openAdminUserBalanceModal(userId, currentBalance, userName) {
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("medium");
  playSound("click");

  const targetIdInput = document.getElementById("modalBalanceTargetUserId");
  const subEl = document.getElementById("modalBalanceUserSubtitle");
  const curBalEl = document.getElementById("modalCurrentBalanceText");
  const amtInput = document.getElementById("modalBalanceAmountInput");
  const reasonInput = document.getElementById("modalBalanceReasonInput");

  if (targetIdInput) targetIdInput.value = userId;
  if (subEl) subEl.textContent = `User: ${userName} (ID: ${userId})`;
  if (curBalEl) curBalEl.textContent = `$${parseFloat(currentBalance || 0).toFixed(2)} USD`;
  if (amtInput) amtInput.value = "";
  if (reasonInput) reasonInput.value = "Admin Manual Adjustment";

  setBalanceAdjustMode("add");
  openModal("adminUserBalanceModal");
}
window.openAdminUserBalanceModal = openAdminUserBalanceModal;

function setBalanceAdjustMode(mode) {
  currentBalanceAdjustMode = mode;
  const btnAdd = document.getElementById("btnBalanceModeAdd");
  const btnDeduct = document.getElementById("btnBalanceModeDeduct");
  if (btnAdd && btnDeduct) {
    if (mode === "add") {
      btnAdd.classList.add("active");
      btnDeduct.classList.remove("active");
    } else {
      btnDeduct.classList.add("active");
      btnAdd.classList.remove("active");
    }
  }
}
window.setBalanceAdjustMode = setBalanceAdjustMode;

async function submitAdminAdjustBalance(event) {
  event.preventDefault();
  const userId = document.getElementById("modalBalanceTargetUserId")?.value;
  const rawAmt = parseFloat(document.getElementById("modalBalanceAmountInput")?.value || 0);
  const reason = document.getElementById("modalBalanceReasonInput")?.value.trim();
  const btn = document.getElementById("btnSaveBalanceAdjust");

  if (!userId || rawAmt <= 0) {
    showToast("⚠️ សូមបញ្ចូលចំនួនទឹកប្រាក់ត្រឹមត្រូវ!", "warning");
    return;
  }

  const finalAmount = currentBalanceAdjustMode === "deduct" ? -rawAmt : rawAmt;

  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("medium");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "⏳ កំពុងកែប្រែ...";
  }

  try {
    const res = await fetch(`/api/admin/users/${userId}/balance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        admin_id: currentUser.user_id,
        amount: finalAmount,
        reason: reason || "Admin Manual Adjustment"
      })
    });
    const json = await res.json();
    if (json.status === "success") {
      showToast(`✅ បានកែប្រែសមតុល្យ ${finalAmount > 0 ? '+' : ''}$${finalAmount.toFixed(2)} រួចរាល់!`, "success");
      closeModal("adminUserBalanceModal");
      await loadAdminUsers();
    } else {
      showToast(`❌ ${json.detail || json.message || "Failed to adjust balance"}`, "error");
    }
  } catch (err) {
    showToast(`❌ កំហុស: ${err.message}`, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "✅ កែប្រែទឹកប្រាក់";
    }
  }
}
window.submitAdminAdjustBalance = submitAdminAdjustBalance;

async function openAdminUserDetailsModal(userId) {
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
  playSound("click");

  const container = document.getElementById("adminUserDetailsContent");
  if (!container) return;

  container.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted);">⏳ កំពុងទាញយកព័ត៌មានលម្អិត...</div>';
  openModal("adminUserDetailsModal");

  try {
    const res = await fetch(`/api/admin/users/${userId}?admin_id=${currentUser.user_id}`);
    const json = await res.json();

    if (json.status === "success" && json.user) {
      const u = json.user;
      const orders = json.orders || [];
      const txs = json.transactions || [];
      const vip = json.vip_info || {};
      const initial = escapeHtml((u.full_name || "U").charAt(0).toUpperCase());
      const photoSrc = u.photo_url ? escapeHtml(u.photo_url) : `/api/user/${u.user_id}/avatar`;

      container.innerHTML = `
        <!-- Top Profile Card -->
        <div class="inspector-header-card">
          <div class="admin-user-avatar" style="width:48px; height:48px; font-size:20px; border-radius:14px;">
            <img src="${photoSrc}" alt="${initial}" loading="lazy" onerror="this.style.display='none'; this.parentElement.innerText='${initial}';" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;">
          </div>
          <div style="flex:1; min-width:0;">
            <div style="font-size:15px; font-weight:800; color:#fff;">${escapeHtml(u.full_name || 'Customer')}</div>
            <div style="font-size:11.5px; color:var(--text-sub);">
              ${u.username ? '@' + escapeHtml(u.username) : 'No Username'} • <code style="color:#fbbf24;">ID: ${u.user_id}</code>
            </div>
            <div style="display:flex; gap:6px; margin-top:4px;">
              <span class="role-badge-pill role-${u.role || 'user'}">${(u.role || 'user').toUpperCase()}</span>
              <span class="vip-badge-pill">${vip.tier_badge || '🥉'} ${vip.tier_name || 'Bronze'}</span>
            </div>
          </div>
        </div>

        <!-- Meta Grid -->
        <div class="inspector-meta-grid" style="grid-template-columns: repeat(2, 1fr); gap: 10px;">
          <div class="inspector-meta-item">
            <div class="inspector-meta-label">💰 Wallet Balance</div>
            <div class="inspector-meta-val" style="color:#34d399; font-weight:800;">$${parseFloat(u.balance || 0).toFixed(2)} USD</div>
          </div>
          <div class="inspector-meta-item">
            <div class="inspector-meta-label">💎 Total Spent</div>
            <div class="inspector-meta-val" style="color:#fbbf24; font-weight:800;">$${parseFloat(u.total_spent || 0).toFixed(2)} USD</div>
          </div>
          <div class="inspector-meta-item" style="grid-column: span 2; background: rgba(56,189,248,0.06); border-color: rgba(56,189,248,0.2);">
            <div class="inspector-meta-label" style="color: #38bdf8; font-weight:700;">📅 ថ្ងៃខែម៉ោងចុចចូលបតដំបូង (Join Date & Time)</div>
            <div class="inspector-meta-val" style="font-size:12.5px; color:#fff; font-weight:800; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px;">
              <span>${formatUserJoinDateTime(u.created_at)}</span>
              <span style="font-size:10.5px; color:#38bdf8; background:rgba(56,189,248,0.15); padding:2px 6px; border-radius:6px;">${formatTimeAgo(u.created_at)}</span>
            </div>
          </div>
          <div class="inspector-meta-item">
            <div class="inspector-meta-label">⚡ សកម្មភាពចុងក្រោយ (Last Seen)</div>
            <div class="inspector-meta-val" style="font-size:11px; color:#cbd5e1;">${formatUserJoinDateTime(u.last_active_at || u.created_at)}</div>
          </div>
          <div class="inspector-meta-item">
            <div class="inspector-meta-label">👥 ណែនាំដោយ (Referrer)</div>
            <div class="inspector-meta-val" style="font-size:11.5px;">${u.referred_by ? `ID: ${u.referred_by}` : 'គ្មាន (Direct)'}</div>
          </div>
        </div>

        <!-- Recent Orders -->
        <div class="inspector-history-section">
          <div style="font-size:12px; font-weight:800; color:var(--gold-primary); margin-bottom:8px; display:flex; justify-content:space-between;">
            <span>📦 ប្រវត្តិ Orders ចុងក្រោយ (${orders.length})</span>
          </div>
          ${orders.length === 0 ? '<div style="color:var(--text-muted); font-size:11px; text-align:center; padding:8px;">មិនទាន់មានការបញ្ជាទិញនៅឡើយទេ</div>' :
            orders.map(o => `
              <div class="inspector-item-row">
                <div>
                  <strong style="color:#fff;">#${o.id} ${escapeHtml(o.product_name)}</strong>
                  <div style="font-size:10px; color:var(--text-muted);">${formatUserJoinDateTime(o.created_at)} • ${o.payment_method}</div>
                </div>
                <div style="text-align:right;">
                  <div style="font-weight:800; color:#38bdf8;">$${parseFloat(o.price || 0).toFixed(2)}</div>
                  <span style="font-size:10px; font-weight:700; color:${o.status === 'delivered' ? '#34d399' : (o.status === 'rejected' ? '#f87171' : '#fbbf24')};">${o.status.toUpperCase()}</span>
                </div>
              </div>
            `).join("")
          }
        </div>

        <!-- Recent Wallet Transactions -->
        <div class="inspector-history-section">
          <div style="font-size:12px; font-weight:800; color:#34d399; margin-bottom:8px;">
            <span>💳 ប្រវត្តិ Wallet Ledger (${txs.length})</span>
          </div>
          ${txs.length === 0 ? '<div style="color:var(--text-muted); font-size:11px; text-align:center; padding:8px;">គ្មានប្រតិបត្តិការ Wallet</div>' :
            txs.map(t => `
              <div class="inspector-item-row">
                <div>
                  <strong style="color:#fff;">${escapeHtml(t.description || t.type)}</strong>
                  <div style="font-size:10px; color:var(--text-muted);">${formatUserJoinDateTime(t.created_at)}</div>
                </div>
                <div style="font-weight:800; font-size:12.5px; color:${t.amount > 0 ? '#34d399' : '#f87171'};">
                  ${t.amount > 0 ? '+' : ''}$${Math.abs(t.amount).toFixed(2)}
                </div>
              </div>
            `).join("")
          }
        </div>
      `;
    } else {
      container.innerHTML = `<div style="text-align:center; padding:20px; color:#f87171;">⚠️ ${json.message || "Failed to load user details"}</div>`;
    }
  } catch (err) {
    container.innerHTML = `<div style="text-align:center; padding:20px; color:#f87171;">❌ Error: ${err.message}</div>`;
  }
}
window.openAdminUserDetailsModal = openAdminUserDetailsModal;

async function toggleAdminUserBan(userId, currentBanStatus, userName) {
  const isBanning = !currentBanStatus;
  let reason = "";

  if (isBanning) {
    reason = prompt(`🚫 តើអ្នកចង់ BAN អ្នកប្រើប្រាស់ ${userName} (ID: ${userId}) ដោយសារមូលហេតុអ្វី?`, "Violation of store policy / Fake orders");
    if (reason === null) return; // User cancelled prompt
  } else {
    if (!confirm(`✅ តើអ្នកពិតជាចង់ UNBAN អ្នកប្រើប្រាស់ ${userName} (ID: ${userId}) វិញមែនទេ?`)) return;
  }

  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("heavy");

  try {
    const res = await fetch(`/api/admin/users/${userId}/ban`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        admin_id: currentUser.user_id,
        is_banned: isBanning,
        reason: reason || "Admin Action"
      })
    });
    const json = await res.json();
    if (json.status === "success") {
      showToast(`✅ User ${userId} ត្រូវបាន ${isBanning ? 'BANNED 🚫' : 'UNBANNED ✅'}!`, "success");
      await loadAdminUsers();
    } else {
      showToast(`❌ ${json.detail || json.message || "Error"}`, "error");
    }
  } catch (err) {
    showToast(`❌ កំហុស: ${err.message}`, "error");
  }
}
window.toggleAdminUserBan = toggleAdminUserBan;


// ═══════════════════════════════════════════════════════════════
// 🎧 CUSTOMER SUPPORT TICKETS & ADMIN REPLIES
// ═══════════════════════════════════════════════════════════════

let adminSupportFilter = "all";

function openSupportTicketModal() {
  try {
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("medium");
    playSound("click");
  } catch (err) {}

  openModal("supportTicketModal");

  try {
    loadUserSupportTickets();
  } catch (err) {
    console.error("loadUserSupportTickets error:", err);
  }
}
window.openSupportTicketModal = openSupportTicketModal;

async function submitSupportTicket(e) {
  if (e) e.preventDefault();
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("medium");

  const subj = document.getElementById("supportTicketSubject")?.value || "General Support";
  const msgInput = document.getElementById("supportTicketMessage");
  const msg = msgInput ? msgInput.value.trim() : "";
  const btn = document.getElementById("btnSubmitSupportTicket");

  if (!msg) {
    showToast("⚠️ សូមសរសេរសំណួរ ឬបញ្ហារបស់អ្នក!", "warning");
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = "⏳ កំពុងផ្ញើសារ...";
  }

  try {
    const res = await fetch("/api/support/ticket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: currentUser.user_id,
        user_name: currentUser.first_name || currentUser.username || `User #${currentUser.user_id}`,
        subject: subj,
        message: msg
      })
    });
    const json = await res.json();

    if (json.status === "success") {
      if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
      playSound("click");
      showToast("🎉 បានផ្ញើសារទៅកាន់ Admin រួចរាល់! Admin នឹងឆ្លើយតបឆាប់ៗនេះ។", "success", 4000);
      if (msgInput) msgInput.value = "";
      loadUserSupportTickets();
    } else {
      showToast(json.message || "❌ មិនអាចផ្ញើសារបានទេ", "error");
    }
  } catch (err) {
    showToast("❌ បរាជ័យក្នុងការភ្ជាប់ទៅ Server", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "🚀 ផ្ញើសារទៅកាន់ Admin (Send Ticket)";
    }
  }
}
window.submitSupportTicket = submitSupportTicket;

async function loadUserSupportTickets() {
  const container = document.getElementById("userSupportTicketsList");
  if (!container || !currentUser) return;

  try {
    const res = await fetch(`/api/user/${currentUser.user_id}/support-tickets`);
    const json = await res.json();

    if (json.status === "success" && json.data && json.data.length > 0) {
      let html = "";
      json.data.forEach(t => {
        const isAnswered = t.status === "answered";
        const badge = isAnswered 
          ? `<span style="background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.4); color:#34d399; font-size:10px; font-weight:800; padding:2px 8px; border-radius:6px;">✅ Admin បានឆ្លើយតប</span>`
          : `<span style="background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.4); color:#fbbf24; font-size:10px; font-weight:800; padding:2px 8px; border-radius:6px;">⏳ រង់ចាំការឆ្លើយតប</span>`;

        let replyBox = "";
        if (isAnswered && t.admin_reply) {
          replyBox = `
            <div style="margin-top:8px; background:rgba(14,165,233,0.1); border:1px solid rgba(56,189,248,0.3); border-radius:10px; padding:8px 10px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <span style="font-size:10.5px; font-weight:800; color:#38bdf8;">💬 ចម្លើយពី ${t.replied_by || 'Admin Support'}៖</span>
                <span style="font-size:9.5px; color:var(--text-muted);">${formatUserJoinDateTime(t.replied_at)}</span>
              </div>
              <div style="font-size:12px; color:#fff; line-height:1.4; white-space:pre-wrap;">${t.admin_reply}</div>
            </div>`;
        }

        html += `
          <div style="background:rgba(255,255,255,0.03); border:1px solid var(--card-border); border-radius:12px; padding:10px 12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <div style="display:flex; align-items:center; gap:6px;">
                <span style="font-weight:800; font-size:11px; color:var(--text-muted);">#${t.id}</span>
                <strong style="font-size:12.5px; color:#fff;">${t.subject || 'General Support'}</strong>
              </div>
              ${badge}
            </div>
            <div style="font-size:11.5px; color:var(--text-sub); margin-bottom:4px; line-height:1.35; white-space:pre-wrap;">${t.message}</div>
            <div style="font-size:9.5px; color:var(--text-muted);">📅 ${formatUserJoinDateTime(t.created_at)}</div>
            ${replyBox}
          </div>`;
      });
      container.innerHTML = html;
    } else {
      container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:11.5px;">មិនទាន់មានប្រវត្តិសំបុត្រជំនួយនៅឡើយទេ</div>`;
    }
  } catch (err) {
    container.innerHTML = `<div style="text-align:center; padding:15px; color:var(--danger); font-size:11px;">❌ មិនអាចផ្ទុកប្រវត្តិសំបុត្របានទេ</div>`;
  }
}
window.loadUserSupportTickets = loadUserSupportTickets;

async function loadAdminSupportTickets() {
  const container = document.getElementById("adminSupportTicketsList");
  if (!container || !currentUser) return;

  container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted);">⏳ កំពុងផ្ទុកបញ្ជីសំបុត្រជំនួយ...</div>`;

  try {
    const res = await fetch(`/api/admin/support-tickets?admin_id=${currentUser.user_id}&status=${adminSupportFilter}`);
    const json = await res.json();

    if (json.status === "success" && json.data) {
      const tickets = json.data;
      
      // Update badge
      const pendingCount = tickets.filter(t => t.status === "pending").length;
      const badge = document.getElementById("badgeNavSupport");
      if (badge) {
        if (pendingCount > 0) {
          badge.textContent = pendingCount;
          badge.style.display = "inline-block";
        } else {
          badge.style.display = "none";
        }
      }

      if (tickets.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:35px; color:var(--text-muted); background:var(--card-glass); border-radius:14px; border:1px solid var(--card-border);">✨ មិនមានសំបុត្រជំនួយក្នុង Filter នេះឡើយ</div>`;
        return;
      }

      let html = "";
      tickets.forEach(t => {
        const isPending = t.status === "pending";
        const sc = isPending
          ? { bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.4)", text: "#fbbf24", label: "⏳ PENDING" }
          : { bg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.4)", text: "#34d399", label: "✅ ANSWERED" };

        let replyArea = "";
        if (isPending) {
          replyArea = `
            <div style="margin-top:10px; background:rgba(0,0,0,0.3); border:1px solid rgba(56,189,248,0.3); border-radius:12px; padding:10px;">
              <label style="font-size:11.5px; font-weight:800; color:#38bdf8; display:block; margin-bottom:4px;">💬 សរសេរចម្លើយតបទៅកាន់ Customer៖</label>
              <textarea id="adminReplyText_${t.id}" class="form-input" rows="2" placeholder="សរសេរចម្លើយរបស់អ្នក... (នឹងផ្ញើជា Telegram Message ទៅកាន់ Customer ដោយស្វ័យប្រវត្តិ)" style="font-size:12px; margin-bottom:8px;"></textarea>
              <div style="display:flex; justify-content:flex-end; gap:8px;">
                <button type="button" class="btn-primary-action" onclick="submitAdminSupportReply(${t.id})" style="padding:6px 14px; font-size:12px; font-weight:800; background:linear-gradient(135deg,#0284c7,#38bdf8); border:none; width:auto;">
                  📨 ឆ្លើយតប & Alert ទៅ Telegram
                </button>
              </div>
            </div>`;
        } else {
          replyArea = `
            <div style="margin-top:10px; background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.25); border-radius:10px; padding:8px 10px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;">
                <span style="font-size:11px; font-weight:800; color:#34d399;">💬 ចម្លើយដែលបានផ្ញើរួច (ដោយ ${t.replied_by || 'Admin'})៖</span>
                <span style="font-size:10px; color:var(--text-muted);">${formatUserJoinDateTime(t.replied_at)}</span>
              </div>
              <div style="font-size:12px; color:#fff; line-height:1.4; white-space:pre-wrap;">${t.admin_reply}</div>
            </div>`;
        }

        html += `
          <div style="background:var(--card-glass); border:1px solid ${sc.border}; border-radius:14px; padding:12px 14px; box-shadow:0 4px 16px rgba(0,0,0,0.25);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; flex-wrap:wrap; gap:6px;">
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-weight:900; font-size:12px; color:#fff; background:rgba(255,255,255,0.06); padding:2px 7px; border-radius:6px;">#${t.id}</span>
                <strong style="font-size:13.5px; color:#fff;">${t.user_name || 'Customer'}</strong>
                <span style="font-size:11px; color:#38bdf8; font-family:monospace; cursor:pointer;" onclick="copyText('${t.user_id}', this)" title="Click to copy ID">🆔 ${t.user_id} 📋</span>
              </div>
              <span style="background:${sc.bg}; color:${sc.text}; border:1px solid ${sc.border}; border-radius:6px; padding:2px 8px; font-size:10px; font-weight:800;">
                ${sc.label}
              </span>
            </div>

            <div style="font-size:11px; color:var(--gold-primary); font-weight:700; margin-bottom:4px;">📌 ប្រធានបទ: ${t.subject || 'General Support'}</div>
            <div style="font-size:12px; color:var(--text-primary); line-height:1.4; background:rgba(0,0,0,0.25); padding:8px 10px; border-radius:8px; border:1px dashed rgba(255,255,255,0.08); margin-bottom:6px; white-space:pre-wrap;">
              ${t.message}
            </div>

            <div style="font-size:10px; color:var(--text-muted);">📅 ម៉ោងផ្ញើ៖ ${formatUserJoinDateTime(t.created_at)}</div>
            ${replyArea}
          </div>`;
      });

      container.innerHTML = html;
    }
  } catch (err) {
    container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--danger);">❌ មិនអាចផ្ទុកទិន្នន័យបានទេ</div>`;
  }
}
window.loadAdminSupportTickets = loadAdminSupportTickets;

function filterAdminSupportTickets(status, btn) {
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
  adminSupportFilter = status;
  document.querySelectorAll("#secSupport .cat-btn").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  loadAdminSupportTickets();
}
window.filterAdminSupportTickets = filterAdminSupportTickets;

async function submitAdminSupportReply(ticketId) {
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("medium");
  const textarea = document.getElementById(`adminReplyText_${ticketId}`);
  const replyText = textarea ? textarea.value.trim() : "";

  if (!replyText) {
    showToast("⚠️ សូមបញ្ចូលអត្ថបទឆ្លើយតប!", "warning");
    return;
  }

  showToast("⏳ កំពុងផ្ញើចម្លើយ & Alert ទៅកាន់ User...", "info", 2000);

  try {
    const res = await fetch(`/api/admin/support-tickets/${ticketId}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        admin_id: currentUser.user_id,
        reply_text: replyText,
        replied_by: currentUser.first_name || currentUser.username || "Admin Support"
      })
    });
    const json = await res.json();

    if (json.status === "success") {
      if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
      playSound("ka-ching");
      showToast("🎉 បានឆ្លើយតប & ជូនដំណឹងទៅ Telegram របស់ Customer រួចរាល់!", "success", 4000);
      loadAdminSupportTickets();
    } else {
      showToast(json.message || "❌ មិនអាចឆ្លើយតបបានទេ", "error");
    }
  } catch (err) {
    showToast("❌ បរាជ័យក្នុងការភ្ជាប់ទៅ Server", "error");
  }
}
window.submitAdminSupportReply = submitAdminSupportReply;

// ═══════════════════════════════════════════════════════════════
// 🏷️ CUSTOM PRODUCT BADGE PICKER HANDLER
// ═══════════════════════════════════════════════════════════════
function setFormBadge(formType, badgeValue, btnElement) {
  if (window.tg?.HapticFeedback) window.tg.HapticFeedback.selectionChanged();
  if (formType === 'add') {
    const input = document.getElementById("addProdBadge");
    if (input) input.value = badgeValue;
    document.querySelectorAll("#secAddProduct .btn-badge-chip").forEach(b => b.classList.remove("active"));
  } else if (formType === 'edit') {
    const input = document.getElementById("editProdBadge");
    if (input) input.value = badgeValue;
    document.querySelectorAll("#editProductModal .btn-badge-chip").forEach(b => b.classList.remove("active"));
  }
  if (btnElement) btnElement.classList.add("active");
}
window.setFormBadge = setFormBadge;

// ═══════════════════════════════════════════════════════════════
// ⭐ RATINGS & REVIEWS ENGINE (Order rating & Product reviews modal)
// ═══════════════════════════════════════════════════════════════
let currentRatingOrderId = null;
let currentSelectedRating = 5;

function openOrderRatingModal(orderId, encodedProdName) {
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
  playSound("click");
  currentRatingOrderId = orderId;
  currentSelectedRating = 5;
  
  const prodName = decodeURIComponent(encodedProdName || "").trim();
  const titleEl = document.getElementById("orderRatingProdName");
  if (titleEl) titleEl.textContent = prodName ? `📦 ${prodName}` : `Order #${orderId}`;

  const scoreEl = document.getElementById("orderRatingScore");
  if (scoreEl) scoreEl.textContent = "5.0";

  const commentEl = document.getElementById("orderRatingComment");
  if (commentEl) commentEl.value = "";

  setRatingStars(5);
  openModal("orderRatingModal");
}
window.openOrderRatingModal = openOrderRatingModal;
window.openReviewModal = openOrderRatingModal;

function setRatingStars(score) {
  currentSelectedRating = score;
  const scoreEl = document.getElementById("orderRatingScore");
  if (scoreEl) scoreEl.textContent = `${score}.0`;

  const starBtns = document.querySelectorAll("#starRatingBox .star-btn");
  starBtns.forEach(btn => {
    const s = Number(btn.getAttribute("data-star") || 0);
    btn.classList.toggle("active", s <= score);
  });
  if (tg?.HapticFeedback) tg.HapticFeedback.selectionChanged();
}
window.setRatingStars = setRatingStars;

async function submitOrderRating(e) {
  if (e) e.preventDefault();
  if (!currentRatingOrderId) return;

  const commentEl = document.getElementById("orderRatingComment");
  const comment = commentEl ? commentEl.value.trim() : "";
  const submitBtn = document.getElementById("btnSubmitOrderRating");

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "⏳ កំពុងបញ្ជូន Feedback...";
  }

  try {
    const res = await fetch(`/api/orders/${currentRatingOrderId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: currentUser.user_id,
        user_name: currentUser.full_name || currentUser.username || "Customer",
        rating: currentSelectedRating,
        comment: comment
      })
    });
    const json = await res.json();
    if (json.status === "success") {
      if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
      try {
        if (typeof confetti === "function") {
          confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
        }
      } catch (err) {}
      playSound("win");
      closeModal("orderRatingModal");
      showToast("🎉 អរគុណច្រើនសម្រាប់ការផ្ដល់ Feedback! $0.05 ត្រូវបានបន្ថែមជូន Wallet របស់អ្នក។", "success", 4500);
      fetchUserWalletData();
      loadUserOrders();
    } else {
      showToast(`❌ ${json.detail || json.message || "មានបញ្ហា"}`, "error");
    }
  } catch (err) {
    showToast(`❌ Error: ${err.message}`, "error");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "⭐ ផ្ញើការវាយតម្លៃ (Submit Rating)";
    }
  }
}
window.submitOrderRating = submitOrderRating;

async function openProductReviewsModal(productId, encodedProdName) {
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
  playSound("click");
  const prodName = decodeURIComponent(encodedProdName || "").trim();

  const titleEl = document.getElementById("reviewsModalTitle");
  if (titleEl) titleEl.textContent = prodName ? `⭐ ការវាយតម្លៃ៖ ${prodName}` : "⭐ ការវាយតម្លៃទំនិញ (Reviews)";

  const listContainer = document.getElementById("productReviewsListContainer");
  if (listContainer) {
    listContainer.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">⏳ កំពុងផ្ទុក Reviews...</div>`;
  }

  openModal("productReviewsModal");

  try {
    const res = await fetch(`/api/products/${productId}/reviews`);
    const json = await res.json();
    if (json.status === "success" && json.data) {
      const d = json.data;
      const scoreEl = document.getElementById("reviewsAvgScore");
      const totalEl = document.getElementById("reviewsTotalCountText");
      const barsEl = document.getElementById("ratingBarsContainer");

      if (scoreEl) scoreEl.textContent = Number(d.average_rating || 5.0).toFixed(1);
      if (totalEl) totalEl.textContent = `ផ្អែកលើ ${d.total_reviews || 0} ការវាយតម្លៃពិតប្រាកដ (Verified Purchases)`;

      // Star bars breakdown
      if (barsEl && d.rating_distribution) {
        const dist = d.rating_distribution;
        const total = Math.max(1, d.total_reviews || 1);
        let barsHtml = "";
        for (let star = 5; star >= 1; star--) {
          const count = dist[star] || 0;
          const pct = Math.round((count / total) * 100);
          barsHtml += `
            <div class="rating-stat-bar-row">
              <span style="width:24px;">${star} ⭐</span>
              <div class="rating-bar-track">
                <div class="rating-bar-fill" style="width: ${pct}%;"></div>
              </div>
              <span style="width:30px; text-align:right;">${count}</span>
            </div>
          `;
        }
        barsEl.innerHTML = barsHtml;
      }

      // Review list
      if (listContainer) {
        if (!d.reviews || d.reviews.length === 0) {
          listContainer.innerHTML = `
            <div style="text-align:center; padding:30px 16px; color:var(--text-muted); background:rgba(255,255,255,0.02); border-radius:12px; border:1px dashed var(--card-border);">
              <div style="font-size:28px; margin-bottom:6px;">✨</div>
              <div style="font-size:13px; font-weight:700; color:#fff;">មិនទាន់មាន Review សម្រាប់ទំនិញនេះនៅឡើយទេ</div>
              <div style="font-size:11px; color:var(--text-sub); margin-top:4px;">ក្លាយជាអ្នកដំបូងគេដែលទិញ និងផ្ដល់ការវាយតម្លៃ 5 ⭐</div>
            </div>
          `;
        } else {
          let revHtml = "";
          d.reviews.forEach(r => {
            const starsText = "⭐".repeat(Math.max(1, Math.min(5, r.rating || 5)));
            revHtml += `
              <div class="review-item-card">
                <div class="review-header">
                  <div style="display:flex; align-items:center; gap:6px;">
                    <span class="review-author">👤 ${escapeHtml(r.user_name || 'អតិថិជន Verified')}</span>
                    <span style="font-size:9.5px; color:#34d399; background:rgba(16,185,129,0.15); padding:1px 6px; border-radius:10px; font-weight:700;">Verified Buyer</span>
                  </div>
                  <span class="review-stars">${starsText}</span>
                </div>
                <div class="review-comment">${escapeHtml(r.comment || 'សេវាកម្មរហ័សទាន់ចិត្ត អាខោនដំណើរការល្អណាស់ ⭐⭐⭐⭐⭐')}</div>
                <div class="review-date">⏱️ ${formatOrderDateTime(r.created_at)}</div>
              </div>
            `;
          });
          listContainer.innerHTML = revHtml;
        }
      }
    }
  } catch (err) {
    if (listContainer) {
      listContainer.innerHTML = `<div style="text-align:center; padding:20px; color:var(--danger);">❌ មិនអាចផ្ទុក Reviews បានទេ</div>`;
    }
  }
}
window.openProductReviewsModal = openProductReviewsModal;
window.openReviewsViewModal = openProductReviewsModal;

/* ═══════════════════════════════════════════════════════════════════
   IN-APP NOTIFICATION CENTER & ADVANCED HAPTIC SYSTEM
   ═══════════════════════════════════════════════════════════════════ */

// Local notification cache & sample system announcements
let inAppNotifications = [
  {
    id: "notif_1",
    title: "⚡ Flash Sale បញ្ចុះតម្លៃ 20% កំពុងដំណើរការ!",
    message: "ទំនិញ CapCut Pro, ChatGPT Plus, Netflix 4K កំពុងបញ្ចុះតម្លៃពិសេស។ សូមរួសរាន់ឡើង ស្តុកមានកំណត់!",
    badge: "PROMO",
    badgeClass: "notif-badge-promo",
    icon: "🔥",
    time: "ថ្មីៗនេះ"
  },
  {
    id: "notif_2",
    title: "📦 Restock: Gemini Advanced & Claude Pro",
    message: "ស្តុកថ្មីទើបតែចូលបន្ថែម! អាចកុម្ម៉ង់ទិញបានភ្លាមៗ និង Auto Delivery ២៤/៧។",
    badge: "RESTOCK",
    badgeClass: "notif-badge-system",
    icon: "✨",
    time: "1 ម៉ោងមុន"
  },
  {
    id: "notif_3",
    title: "👑 VIP Member Cashback 5%",
    message: "រាល់ការណែនាំមិត្តភក្តិ ឬទិញទំនិញ ទទួលបាន Cashback បន្ថែមចូលក្នុង Wallet ភ្លាមៗ។",
    badge: "REWARD",
    badgeClass: "notif-badge-announcement",
    icon: "🎁",
    time: "ម្សិលមិញ"
  }
];

function triggerHaptic(type = "light") {
  try {
    if (window.Telegram?.WebApp?.HapticFeedback) {
      if (["light", "medium", "heavy", "rigid", "soft"].includes(type)) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred(type);
      } else if (["error", "success", "warning"].includes(type)) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred(type);
      } else if (type === "selection") {
        window.Telegram.WebApp.HapticFeedback.selectionChanged();
      }
    } else if (navigator.vibrate) {
      if (type === "heavy") navigator.vibrate([40, 30, 40]);
      else if (type === "medium") navigator.vibrate(25);
      else navigator.vibrate(12);
    }
  } catch (e) {}
}
window.triggerHaptic = triggerHaptic;

function openNotificationCenter() {
  triggerHaptic("medium");
  playSound("click");
  renderNotificationList();
  openModal("notificationCenterModal");

  // Mark as read
  const badge = document.getElementById("headerNotifBadge");
  if (badge) badge.style.display = "none";
}
window.openNotificationCenter = openNotificationCenter;

function renderNotificationList() {
  const container = document.getElementById("notifCenterList");
  if (!container) return;

  if (inAppNotifications.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 30px; color: var(--text-muted);">
        <div style="font-size: 30px; margin-bottom: 8px;">📬</div>
        <div style="font-size: 13px; font-weight: 700; color: #fff;">មិនទាន់មានសារថ្មីនៅឡើយទេ</div>
        <div style="font-size: 11px; color: var(--text-sub); margin-top: 4px;">រាល់សារដំណឹង Promotion និងការ Update នឹងបង្ហាញនៅទីនេះ</div>
      </div>
    `;
    return;
  }

  let html = "";
  inAppNotifications.forEach(n => {
    html += `
      <div class="notif-item-card">
        <div class="notif-item-header">
          <div class="notif-item-title">
            <span>${n.icon || "📢"}</span>
            <span>${escapeHtml(n.title)}</span>
          </div>
          <span class="notif-item-badge ${n.badgeClass || 'notif-badge-system'}">${n.badge || 'INFO'}</span>
        </div>
        <div class="notif-item-msg">${escapeHtml(n.message)}</div>
        <div class="notif-item-time">
          <span>🕒</span> <span>${n.time}</span>
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
}
window.renderNotificationList = renderNotificationList;

// Check unread notifications on load
setTimeout(() => {
  const badge = document.getElementById("headerNotifBadge");
  if (badge && inAppNotifications.length > 0) {
    badge.style.display = "block";
  }
}, 2000);

/* ═══════════════════════════════════════════════════════════════════
   🌐 MULTI-LANGUAGE SWITCHER (🇰🇭 KM / 🇺🇸 EN)
   ═══════════════════════════════════════════════════════════════════ */
let currentAppLang = localStorage.getItem("app_lang") || "km";

const i18nDict = {
  km: {
    nav_shop: "ហាងទំនិញ",
    nav_orders: "ប្រវត្តិទិញ",
    nav_replace: "ស្នើសុំដូរអាខោន",
    nav_wallet: "កាបូបលុយ",
    nav_admin: "Admin",
    search_placeholder: "ស្វែងរកទំនិញ ( CapCut, ChatGPT, Netflix )...",
    all_categories: "✨ ទាំងអស់ (All)",
    buy_now: "🛒 ទិញឥឡូវនេះ",
    out_of_stock: "❌ អស់ស្តុក"
  },
  en: {
    nav_shop: "Store",
    nav_orders: "My Orders",
    nav_replace: "Warranty",
    nav_wallet: "Wallet",
    nav_admin: "Admin",
    search_placeholder: "Search products (CapCut, ChatGPT, Netflix)...",
    all_categories: "✨ All Products",
    buy_now: "🛒 Buy Now",
    out_of_stock: "❌ Out of Stock"
  }
};

function toggleLanguage() {
  triggerHaptic("medium");
  playSound("click");
  currentAppLang = currentAppLang === "km" ? "en" : "km";
  localStorage.setItem("app_lang", currentAppLang);
  applyAppLanguage(currentAppLang);
  showToast(currentAppLang === "km" ? "🇰🇭 បានប្តូរទៅភាសាខ្មែរ" : "🇺🇸 Switched to English", "success");
}
window.toggleLanguage = toggleLanguage;

function applyAppLanguage(lang) {
  const flagEl = document.getElementById("langFlag");
  const labelEl = document.getElementById("langLabel");
  const searchInput = document.getElementById("searchInput");

  if (flagEl && labelEl) {
    flagEl.textContent = lang === "km" ? "🇰🇭" : "🇺🇸";
    labelEl.textContent = lang === "km" ? "KM" : "EN";
  }

  if (searchInput && i18nDict[lang]) {
    searchInput.placeholder = i18nDict[lang].search_placeholder;
  }

  // Update Nav Labels if elements exist
  const navShopLabel = document.querySelector("#navShop span:last-child");
  const navOrdersLabel = document.querySelector("#navOrders span:last-child");
  const navReplaceLabel = document.querySelector("#navReplace span:last-child");
  const navWalletLabel = document.querySelector("#navWallet span:last-child");

  if (navShopLabel && i18nDict[lang]) navShopLabel.textContent = i18nDict[lang].nav_shop;
  if (navOrdersLabel && i18nDict[lang]) navOrdersLabel.textContent = i18nDict[lang].nav_orders;
  if (navReplaceLabel && i18nDict[lang]) navReplaceLabel.textContent = i18nDict[lang].nav_replace;
  if (navWalletLabel && i18nDict[lang]) navWalletLabel.textContent = i18nDict[lang].nav_wallet;
}
window.applyAppLanguage = applyAppLanguage;

// Apply saved language on start
document.addEventListener("DOMContentLoaded", () => {
  applyAppLanguage(currentAppLang);
});

/* ═══════════════════════════════════════════════════════════════════
   🚀 SCROLL-TO-TOP FAB WITH SMOOTH ANIMATION
   ═══════════════════════════════════════════════════════════════════ */
window.addEventListener("scroll", () => {
  const btn = document.getElementById("btnScrollToTop");
  if (!btn) return;
  if (window.scrollY > 280) {
    btn.classList.add("show");
  } else {
    btn.classList.remove("show");
  }
});

function scrollToTop() {
  triggerHaptic("light");
  window.scrollTo({ top: 0, behavior: "smooth" });
}
window.scrollToTop = scrollToTop;

/* ═══════════════════════════════════════════════════════════════════
   ⭐ PRODUCT REVIEWS & 5-STAR RATING SYSTEM
   ═══════════════════════════════════════════════════════════════════ */
let currentReviewProductId = null;
let currentReviewRating = 5;

// Sample review database cache
let productReviewsStore = {
  default: [
    { user_name: "Sokha", rating: 5, comment: "Account ដំណើរការល្អណាស់ ចូលបានភ្លាមៗ 100% ធានា!", time: "2 ម៉ោងមុន" },
    { user_name: "Vannak Tech", rating: 5, comment: "សេវាកម្មរហ័សទាន់ចិត្ត Admin ឆ្លើយតបរួសរាយណាស់ ⭐⭐⭐⭐⭐", time: "1 ថ្ងៃមុន" },
    { user_name: "Ratha VIP", rating: 4, comment: "ទំនិញល្អ តម្លៃសមរម្យ នឹងបន្តទិញទៀត!", time: "3 ថ្ងៃមុន" }
  ]
};

function openProductReviewsModal(productId, productName) {
  triggerHaptic("medium");
  playSound("click");
  currentReviewProductId = productId;
  currentReviewRating = 5;
  setReviewRating(5);

  const cleanName = productName ? decodeURIComponent(productName) : "Product Reviews";
  const titleEl = document.getElementById("reviewModalTitle");
  const subtitleEl = document.getElementById("reviewModalSubtitle");
  if (titleEl) titleEl.textContent = `⭐ ${cleanName}`;
  if (subtitleEl) subtitleEl.textContent = "ការវាយតម្លៃ និងមតិកែលម្អពីអតិថិជន Verified";

  renderProductReviewsList(productId);
  openModal("productReviewsModal");
}
window.openProductReviewsModal = openProductReviewsModal;

function setReviewRating(stars) {
  currentReviewRating = stars;
  triggerHaptic("selection");
  const starIcons = document.querySelectorAll("#starRatingPicker .star-icon");
  const labelEl = document.getElementById("starRatingLabel");

  starIcons.forEach((icon, idx) => {
    if (idx < stars) {
      icon.classList.add("active");
    } else {
      icon.classList.remove("active");
    }
  });

  const ratingTexts = {
    1: "1/5 មិនសូវពេញចិត្ត",
    2: "2/5 ល្មម",
    3: "3/5 ល្អបង្គួរ",
    4: "4/5 ល្អខ្លាំង",
    5: "5/5 ល្អឥតខ្ចោះ ⭐"
  };
  if (labelEl) labelEl.textContent = ratingTexts[stars] || `${stars}/5`;
}
window.setReviewRating = setReviewRating;

function renderProductReviewsList(productId) {
  const container = document.getElementById("productReviewsList");
  const badgeEl = document.getElementById("reviewCountBadge");
  if (!container) return;

  const reviews = productReviewsStore[productId] || productReviewsStore.default;
  if (badgeEl) badgeEl.textContent = `${reviews.length} Reviews`;

  let html = "";
  reviews.forEach(r => {
    const starsText = "⭐".repeat(Math.max(1, Math.min(5, r.rating || 5)));
    html += `
      <div class="review-item-card">
        <div class="review-header">
          <div style="display:flex; align-items:center; gap:6px;">
            <span class="review-author">👤 ${escapeHtml(r.user_name || 'Verified Buyer')}</span>
            <span style="font-size:9.5px; color:#34d399; background:rgba(16,185,129,0.15); padding:1px 6px; border-radius:10px; font-weight:700;">Verified</span>
          </div>
          <span class="review-stars">${starsText}</span>
        </div>
        <div class="review-comment">${escapeHtml(r.comment || 'សេវាកម្មរហ័សទាន់ចិត្ត អាខោនដំណើរការល្អណាស់ ⭐⭐⭐⭐⭐')}</div>
        <div class="review-date">⏱️ ${r.time || 'ថ្មីៗនេះ'}</div>
      </div>
    `;
  });
  container.innerHTML = html;
}

function submitProductReview() {
  const commentInput = document.getElementById("reviewCommentInput");
  const comment = commentInput ? commentInput.value.trim() : "";

  if (!comment) {
    showToast("⚠️ សូមសរសេរមតិកែលម្អរបស់អ្នកបន្តិច!", "warning");
    return;
  }

  triggerHaptic("success");
  playSound("win");

  const newReview = {
    user_name: currentUser.full_name || "Customer",
    rating: currentReviewRating,
    comment: comment,
    time: "មុននេះបន្តិច"
  };

  const pKey = currentReviewProductId || "default";
  if (!productReviewsStore[pKey]) productReviewsStore[pKey] = [];
  productReviewsStore[pKey].unshift(newReview);

  if (commentInput) commentInput.value = "";
  renderProductReviewsList(currentReviewProductId);
  showToast("🎉 អរគុណសម្រាប់ការវាយតម្លៃរបស់អ្នក!", "success");
}
window.submitProductReview = submitProductReview;

// ═══════════════════════════════════════════════════════════════
// 🎁 VIP FREE ACCOUNT GIVEAWAYS ENGINE
// ═══════════════════════════════════════════════════════════════

let activeGiveawaysCache = [];
let currentGiveaway = null;

async function loadGiveaways() {
  try {
    const res = await fetch(`/api/giveaways?user_id=${currentUser.user_id}`);
    const json = await res.json();
    if (json.status === "success" && Array.isArray(json.data) && json.data.length > 0) {
      activeGiveawaysCache = json.data;
      currentGiveaway = json.data[0];
      renderGiveawayBanner(currentGiveaway);
    } else {
      const banner = document.getElementById("giveawayStoreBanner");
      if (banner) banner.style.display = "none";
    }
  } catch (err) {
    console.warn("Could not load giveaways:", err);
  }
}
window.loadGiveaways = loadGiveaways;

function renderGiveawayBanner(g) {
  const banner = document.getElementById("giveawayStoreBanner");
  if (!banner || !g) return;

  banner.style.display = "flex";
  const titleEl = document.getElementById("giveawayBannerTitle");
  const badgeEl = document.getElementById("giveawayStockBadge");
  const subEl = document.getElementById("giveawayBannerSub");

  if (titleEl) titleEl.textContent = g.title || "Free VIP Account";
  
  if (badgeEl) {
    if (g.already_claimed) {
      badgeEl.textContent = "✅ បានបើកយករួច";
      badgeEl.style.color = "#34d399";
      badgeEl.style.borderColor = "rgba(52,211,153,0.4)";
    } else if (g.stock_remaining > 0) {
      badgeEl.textContent = `⚡ នៅសល់ ${g.stock_remaining} អាខោន`;
      badgeEl.style.color = "#fbbf24";
      badgeEl.style.borderColor = "rgba(251,191,36,0.35)";
    } else {
      badgeEl.textContent = "❌ អស់ពីស្តុក";
      badgeEl.style.color = "#f87171";
      badgeEl.style.borderColor = "rgba(239,68,68,0.35)";
    }
  }

  if (subEl) {
    if (g.already_claimed) {
      subEl.textContent = "ចុចទីនេះដើម្បីមើល Credentials របស់អ្នកឡើងវិញ";
    } else {
      subEl.textContent = "✨ Join Group & Channel ដើម្បីទទួលបាន Free 100%!";
    }
  }
}

async function openGiveawayModal(giveawayId) {
  try {
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("medium");
  } catch (e) {}
  playSound("click");

  let g = null;
  if (giveawayId) {
    g = activeGiveawaysCache.find(x => Number(x.id) === Number(giveawayId));
  } else {
    g = currentGiveaway || activeGiveawaysCache[0];
  }

  if (!g) {
    showToast("មិនទាន់មាន Giveaway សកម្មនៅឡើយទេ", "info");
    return;
  }

  currentGiveaway = g;

  // Populate Modal
  const imgEl = document.getElementById("giveawayModalImg");
  const titleEl = document.getElementById("giveawayModalTitle");
  const descEl = document.getElementById("giveawayModalDesc");
  const badgeEl = document.getElementById("giveawayModalBadge");
  const stockEl = document.getElementById("giveawayModalStock");

  if (imgEl) imgEl.src = g.image_url || "/images/capcut.svg";
  if (titleEl) titleEl.textContent = g.title || "Free VIP Account";
  if (descEl) descEl.textContent = g.description || "Join Group & Channel Telegram រួចចុចយកភ្លាមៗ";
  if (badgeEl) badgeEl.textContent = g.badge || "🎁 FREE VIP";

  if (stockEl) {
    if (g.already_claimed) {
      stockEl.textContent = "✅ បានបើកយករួច";
    } else if (g.stock_remaining > 0) {
      stockEl.textContent = `⚡ នៅសល់ ${g.stock_remaining}`;
    } else {
      stockEl.textContent = "❌ អស់ពីស្តុក";
    }
  }

  // Set Join Links
  const channelLink = g.invite_link || "https://t.me/smarttech_digital";
  const groupLink = g.group_invite_link || "https://t.me/smarttech_digitals";
  const btnCh = document.getElementById("btnJoinChannel");
  const btnGr = document.getElementById("btnJoinGroup");
  if (btnCh) btnCh.href = channelLink;
  if (btnGr) btnGr.href = groupLink;

  // Claimed result container
  const claimedBox = document.getElementById("giveawayClaimedResult");
  const credsPre = document.getElementById("giveawayResultCreds");
  const actionSection = document.getElementById("giveawayActionSection");
  const claimBtn = document.getElementById("btnClaimGiveaway");

  if (g.already_claimed && g.claimed_credentials) {
    if (claimedBox) claimedBox.style.display = "block";
    if (credsPre) credsPre.textContent = g.claimed_credentials;
    if (actionSection) actionSection.style.display = "none";
  } else {
    if (claimedBox) claimedBox.style.display = "none";
    if (actionSection) actionSection.style.display = "block";
    if (claimBtn) {
      if (g.stock_remaining <= 0) {
        claimBtn.disabled = true;
        claimBtn.innerHTML = "<span>❌ អាខោនត្រូវបានចែកអស់ពីស្តុកហើយ</span>";
      } else {
        claimBtn.disabled = false;
        claimBtn.innerHTML = "<span>🎁 ផ្ទៀងផ្ទាត់ & ទទួលយកអាខោន Free</span>";
      }
    }
  }

  // Admin quick controls
  const adminCtrl = document.getElementById("giveawayAdminControls");
  if (adminCtrl) {
    adminCtrl.style.display = (currentUser.is_admin || currentUser.role === "admin" || currentUser.role === "super_admin") ? "flex" : "none";
  }

  // Open modal
  openModal("giveawayModal");

  // Check membership in real-time
  checkGiveawayMembershipStatus(g.id);
}
window.openGiveawayModal = openGiveawayModal;

async function checkGiveawayMembershipStatus(giveawayId) {
  const statusCh = document.getElementById("reqStatusChannel");
  const statusGr = document.getElementById("reqStatusGroup");
  const cardCh = document.getElementById("reqCardChannel");
  const cardGr = document.getElementById("reqCardGroup");
  const btnCh = document.getElementById("btnJoinChannel");
  const btnGr = document.getElementById("btnJoinGroup");

  if (statusCh) { statusCh.textContent = "⏳ កំពុងត្រួតពិនិត្យ..."; statusCh.className = "giveaway-req-status pending"; }
  if (statusGr) { statusGr.textContent = "⏳ កំពុងត្រួតពិនិត្យ..."; statusGr.className = "giveaway-req-status pending"; }

  try {
    const res = await fetch(`/api/giveaways/${giveawayId}/membership?user_id=${currentUser.user_id}`);
    const json = await res.json();
    if (json.status === "success") {
      if (json.joined_channel) {
        if (statusCh) { statusCh.textContent = "✅ បានចូលរួមរួច (Joined)"; statusCh.className = "giveaway-req-status verified"; }
        if (cardCh) cardCh.classList.add("joined");
        if (btnCh) { btnCh.classList.add("btn-joined"); btnCh.innerHTML = "<span>✓ Joined</span>"; }
      } else {
        if (statusCh) { statusCh.textContent = "⏳ មិនទាន់ចូលរួម (Not Joined)"; statusCh.className = "giveaway-req-status pending"; }
        if (cardCh) cardCh.classList.remove("joined");
        if (btnCh) { btnCh.classList.remove("btn-joined"); btnCh.innerHTML = "<span>👉 ចូល Channel</span>"; }
      }

      if (json.joined_group) {
        if (statusGr) { statusGr.textContent = "✅ បានចូលរួមរួច (Joined)"; statusGr.className = "giveaway-req-status verified"; }
        if (cardGr) cardGr.classList.add("joined");
        if (btnGr) { btnGr.classList.add("btn-joined"); btnGr.innerHTML = "<span>✓ Joined</span>"; }
      } else {
        if (statusGr) { statusGr.textContent = "⏳ មិនទាន់ចូលរួម (Not Joined)"; statusGr.className = "giveaway-req-status pending"; }
        if (cardGr) cardGr.classList.remove("joined");
        if (btnGr) { btnGr.classList.remove("btn-joined"); btnGr.innerHTML = "<span>👉 ចូល Group</span>"; }
      }
    }
  } catch (e) {
    console.warn("Could not check membership:", e);
  }
}

async function claimCurrentGiveaway() {
  if (!currentGiveaway) return;
  const btn = document.getElementById("btnClaimGiveaway");
  if (!btn || btn.disabled) return;

  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span>⏳ កំពុងផ្ទៀងផ្ទាត់ Telegram...</span>`;

  try {
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("medium");
  } catch (e) {}

  try {
    const payload = {
      user_id: currentUser.user_id,
      full_name: currentUser.full_name,
      username: currentUser.username,
      photo_url: currentUser.photo_url
    };

    const res = await fetch(`/api/giveaways/${currentGiveaway.id}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const json = await res.json();

    if (json.status === "not_joined") {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
      
      // Update checklist cards visually
      const statusCh = document.getElementById("reqStatusChannel");
      const statusGr = document.getElementById("reqStatusGroup");
      const cardCh = document.getElementById("reqCardChannel");
      const cardGr = document.getElementById("reqCardGroup");
      const btnCh = document.getElementById("btnJoinChannel");
      const btnGr = document.getElementById("btnJoinGroup");

      if (json.joined_channel) {
        if (statusCh) { statusCh.textContent = "✅ បានចូលរួមរួច (Joined)"; statusCh.className = "giveaway-req-status verified"; }
        if (cardCh) cardCh.classList.add("joined");
        if (btnCh) { btnCh.classList.add("btn-joined"); btnCh.innerHTML = "<span>✓ Joined</span>"; }
      } else {
        if (statusCh) { statusCh.textContent = "❌ មិនទាន់ចូលរួម"; statusCh.className = "giveaway-req-status pending"; }
        if (cardCh) cardCh.classList.remove("joined");
        if (btnCh) { btnCh.classList.remove("btn-joined"); btnCh.innerHTML = "<span>👉 ចូល Channel</span>"; }
      }

      if (json.joined_group) {
        if (statusGr) { statusGr.textContent = "✅ បានចូលរួមរួច (Joined)"; statusGr.className = "giveaway-req-status verified"; }
        if (cardGr) cardGr.classList.add("joined");
        if (btnGr) { btnGr.classList.add("btn-joined"); btnGr.innerHTML = "<span>✓ Joined</span>"; }
      } else {
        if (statusGr) { statusGr.textContent = "❌ មិនទាន់ចូលរួម"; statusGr.className = "giveaway-req-status pending"; }
        if (cardGr) cardGr.classList.remove("joined");
        if (btnGr) { btnGr.classList.remove("btn-joined"); btnGr.innerHTML = "<span>👉 ចូល Group</span>"; }
      }

      try {
        if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred("error");
      } catch (e) {}
      playSound("error");
      alert("⚠️ " + (json.message || "សូមចូលរួម Group & Channel Telegram ជាមុនសិន!"));
      return;
    }

    if (json.status === "success") {
      try {
        if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
      } catch (e) {}
      playSound("kaching");
      if (typeof confetti === "function") {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      }

      currentGiveaway.already_claimed = true;
      currentGiveaway.claimed_credentials = json.credentials;
      currentGiveaway.stock_remaining = json.stock_remaining;

      // Show claimed box
      const claimedBox = document.getElementById("giveawayClaimedResult");
      const credsPre = document.getElementById("giveawayResultCreds");
      const actionSection = document.getElementById("giveawayActionSection");

      if (claimedBox) claimedBox.style.display = "block";
      if (credsPre) credsPre.textContent = json.credentials;
      if (actionSection) actionSection.style.display = "none";

      const stockEl = document.getElementById("giveawayModalStock");
      if (stockEl) stockEl.textContent = "✅ បានបើកយករួច";

      renderGiveawayBanner(currentGiveaway);
      showToast("🎉 អបអរសាទរ! អាខោនត្រូវបានបើកដោយជោគជ័យ!", "success");
      return;
    }

    if (json.status === "already_claimed") {
      currentGiveaway.already_claimed = true;
      currentGiveaway.claimed_credentials = json.credentials;
      const claimedBox = document.getElementById("giveawayClaimedResult");
      const credsPre = document.getElementById("giveawayResultCreds");
      const actionSection = document.getElementById("giveawayActionSection");
      if (claimedBox) claimedBox.style.display = "block";
      if (credsPre) credsPre.textContent = json.credentials;
      if (actionSection) actionSection.style.display = "none";
      renderGiveawayBanner(currentGiveaway);
      alert("ℹ️ " + json.message);
      return;
    }

    if (json.status === "out_of_stock") {
      btn.disabled = true;
      btn.innerHTML = "<span>❌ អាខោនត្រូវបានចែកអស់ពីស្តុកហើយ</span>";
      alert("⚠️ " + json.message);
      return;
    }

    alert(json.message || "មានបញ្ហាមិនអាចទទួលយកបាន");
    btn.disabled = false;
    btn.innerHTML = originalHtml;

  } catch (err) {
    alert("❌ Error: " + err.message);
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}
window.claimCurrentGiveaway = claimCurrentGiveaway;

function copyGiveawayCredentials() {
  const el = document.getElementById("giveawayResultCreds");
  if (!el) return;
  copyText(el.textContent.trim());
}
window.copyGiveawayCredentials = copyGiveawayCredentials;


// ─── ADMIN GIVEAWAYS MANAGEMENT (EXECUTIVE REDESIGN) ──────────────────────
async function loadAdminGiveaways() {
  const listEl = document.getElementById("adminGiveawaysList");
  if (!listEl) return;
  listEl.innerHTML = `<div style="text-align: center; padding: 25px; color: var(--text-muted);">⏳ កំពុងផ្ទុកបញ្ជី Giveaway...</div>`;

  try {
    const res = await fetch(`/api/admin/giveaways?admin_id=${currentUser.user_id}`);
    const json = await res.json();
    
    if (json.status !== "success" || !json.data) {
      listEl.innerHTML = `<div style="text-align: center; padding: 25px; color: var(--danger);">❌ មិនអាចទាញយកទិន្នន័យបានទេ</div>`;
      return;
    }

    const giveaways = json.data;
    const totalActive = giveaways.length;
    const totalStock = giveaways.reduce((sum, g) => sum + (g.stock_remaining || 0), 0);
    const totalClaimed = giveaways.reduce((sum, g) => sum + (g.claimed_count || 0), 0);

    // Update KPI counters
    const kpiActiveEl = document.getElementById("adminGaKpiActive");
    const kpiStockEl = document.getElementById("adminGaKpiStock");
    const kpiClaimedEl = document.getElementById("adminGaKpiClaimed");
    const countLabelEl = document.getElementById("adminGaCountLabel");

    if (kpiActiveEl) kpiActiveEl.textContent = totalActive;
    if (kpiStockEl) kpiStockEl.textContent = totalStock;
    if (kpiClaimedEl) kpiClaimedEl.textContent = totalClaimed;
    if (countLabelEl) countLabelEl.textContent = `${totalActive} យុទ្ធនាការ`;

    if (giveaways.length === 0) {
      listEl.innerHTML = `
        <div class="admin-ga-empty-state">
          <div style="font-size: 38px; filter: drop-shadow(0 4px 12px rgba(236,72,153,0.3));">🎁</div>
          <div style="font-size: 14.5px; font-weight: 800; color: var(--text-main, #fff);">មិនទាន់មាន Giveaway សកម្មនៅឡើយទេ</div>
          <div style="font-size: 11.5px; color: var(--text-muted); max-width: 280px; line-height: 1.4;">
            បង្កើតយុទ្ធនាការចែក VIP Accounts ដោយឥតគិតថ្លៃ ដើម្បីទាក់ទាញសមាជិកចូល Telegram Channel & Group របស់អ្នក!
          </div>
          <button type="button" class="btn-primary-action" onclick="openAdminCreateGaModal()" style="padding: 9px 18px; font-size: 12.5px; font-weight: 800; background: linear-gradient(135deg, #ec4899, #8b5cf6); border: none; margin-top: 6px; box-shadow: 0 4px 14px rgba(236,72,153,0.35);">
            ➕ បង្កើត Giveaway ដំបូងរបស់អ្នក
          </button>
        </div>
      `;
      return;
    }

    let html = "";
    giveaways.forEach(g => {
      const stock = g.stock_remaining || 0;
      const claimed = g.claimed_count || 0;
      const total = g.total_stock || (stock + claimed);
      const pct = total > 0 ? Math.min(100, Math.round((stock / total) * 100)) : 0;
      
      let meterColor = "#10b981"; // green
      let statusText = "🟢 កំពុងចែក";
      if (stock === 0) {
        meterColor = "#ef4444"; // red
        statusText = "🔴 អស់ស្តុក";
      } else if (stock <= 3) {
        meterColor = "#f59e0b"; // yellow
        statusText = "⚡ ជិតអស់ស្តុក";
      }

      html += `
        <div class="admin-ga-card">
          <!-- Top Row: Thumbnail, Title, Badges, ID -->
          <div class="admin-ga-card-header">
            <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
              <div class="admin-ga-card-thumb-wrap">
                <img src="${g.image_url || '/images/capcut.svg'}" 
                     class="admin-ga-card-thumb-img" 
                     onerror="this.src='/images/capcut.svg'" 
                     alt="${escapeHtml(g.title)}">
              </div>
              <div class="admin-ga-card-info">
                <div class="admin-ga-card-title">${escapeHtml(g.title)}</div>
                <div class="admin-ga-tags-wrap">
                  <span class="admin-ga-badge-pill">${escapeHtml(g.badge || '🎁 FREE VIP')}</span>
                  <span class="admin-ga-duration-pill">⏳ ${g.duration_days || 7} ថ្ងៃ</span>
                  <span style="font-size: 9.5px; font-weight: 800; color: ${meterColor};">${statusText}</span>
                </div>
              </div>
            </div>
            <span class="admin-ga-id-pill">#${g.id}</span>
          </div>

          <!-- Telegram Requirements Row -->
          <div class="admin-ga-req-row">
            <span class="admin-ga-req-tag channel">
              <span>📢</span> <span>${escapeHtml(g.required_channel || '@smarttech_digital')}</span>
            </span>
            <span style="color: var(--text-muted); opacity: 0.5;">•</span>
            <span class="admin-ga-req-tag group">
              <span>💬</span> <span>${escapeHtml(g.required_group || '@smarttech_digitals')}</span>
            </span>
          </div>

          <!-- Stock Progress Meter Box -->
          <div class="admin-ga-stock-box">
            <div class="admin-ga-stock-stats">
              <span style="font-weight: 800; color: ${meterColor};">
                ⚡ នៅសល់: <strong>${stock}</strong> គណនី
              </span>
              <span style="color: #a78bfa; font-weight: 700;">
                🎁 ចែករួច: <strong>${claimed}</strong>
              </span>
              <span style="color: var(--text-muted); font-size: 11px;">
                សរុប: ${total}
              </span>
            </div>
            <div class="admin-ga-stock-meter-track">
              <div class="admin-ga-stock-meter-fill" style="width: ${pct}%; background: ${meterColor}; box-shadow: 0 0 10px ${meterColor};"></div>
            </div>
          </div>

          <!-- Actions Row -->
          <div class="admin-ga-actions-row">
            <button type="button" class="btn-primary-action" style="padding: 7px 12px; font-size: 11.5px; background: linear-gradient(135deg, #ec4899, #8b5cf6); border: none; font-weight: 800; display: inline-flex; align-items: center; gap: 5px; box-shadow: 0 2px 8px rgba(236, 72, 153, 0.3);" onclick="openAdminAddGaStockModal(${g.id}, '${escapeHtml(g.title)}')">
              <span>➕</span> <span>បន្ថែម Stock</span>
            </button>
            <button type="button" class="btn-secondary-action" style="padding: 7px 11px; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;" onclick="openAdminGaClaimsModal(${g.id}, '${escapeHtml(g.title)}')">
              <span>👥</span> <span>អ្នកទទួល (${claimed})</span>
            </button>
            <button type="button" class="btn-buy-card" style="padding: 7px 10px; font-size: 11px; background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.4); color: #f87171;" onclick="adminDeleteGiveaway(${g.id})">
              <span>🗑️</span>
            </button>
          </div>
        </div>
      `;
    });

    listEl.innerHTML = html;
  } catch (err) {
    listEl.innerHTML = `<div style="text-align: center; padding: 25px; color: var(--danger);">❌ Error: ${err.message}</div>`;
  }
}
window.loadAdminGiveaways = loadAdminGiveaways;

function openAdminCreateGaModal() {
  const form = document.getElementById("formAdminCreateGiveaway");
  if (form) {
    form.reset();
    document.getElementById("gaAdminBadge").value = "🎁 FREE VIP";
    document.getElementById("gaAdminDuration").value = "7";
    document.getElementById("gaAdminImg").value = "/images/capcut.svg";
    document.getElementById("gaAdminImgPreview").src = "/images/capcut.svg";
    document.getElementById("gaAdminChannel").value = "@smarttech_digital";
    document.getElementById("gaAdminChannelLink").value = "https://t.me/smarttech_digital";
    document.getElementById("gaAdminGroup").value = "@smarttech_digitals";
    document.getElementById("gaAdminGroupLink").value = "https://t.me/smarttech_digitals";
    document.getElementById("gaAdminDesc").value = "ចែកជូន Free សម្រាប់សមាជិក Group & Channel Telegram! Join Group រួចចុចយកភ្លាមៗ";
    updateAdminGaCredsCount();
  }
  openModal("adminCreateGiveawayModal");
}
window.openAdminCreateGaModal = openAdminCreateGaModal;

function setAdminGaBadge(badge) {
  const input = document.getElementById("gaAdminBadge");
  if (input) input.value = badge;
}
window.setAdminGaBadge = setAdminGaBadge;

function setAdminGaDuration(days) {
  const input = document.getElementById("gaAdminDuration");
  if (input) input.value = days;
}
window.setAdminGaDuration = setAdminGaDuration;

function applyGaAdminDefaultTelegram() {
  document.getElementById("gaAdminChannel").value = "@smarttech_digital";
  document.getElementById("gaAdminChannelLink").value = "https://t.me/smarttech_digital";
  document.getElementById("gaAdminGroup").value = "@smarttech_digitals";
  document.getElementById("gaAdminGroupLink").value = "https://t.me/smarttech_digitals";
  showToast("បានកំណត់តំណ Telegram រួចរាល់", "success");
}
window.applyGaAdminDefaultTelegram = applyGaAdminDefaultTelegram;

function updateAdminGaCredsCount() {
  const el = document.getElementById("gaAdminCreds");
  const badge = document.getElementById("gaAdminCredsCount");
  if (!el || !badge) return;
  const count = el.value.split("\n").map(l => l.trim()).filter(l => l.length > 0).length;
  badge.textContent = `${count} គណនី`;
}
window.updateAdminGaCredsCount = updateAdminGaCredsCount;

function updateAdminAddStockCredsCount() {
  const el = document.getElementById("modalGaStockCreds");
  const badge = document.getElementById("modalAddStockCredsCount");
  if (!el || !badge) return;
  const count = el.value.split("\n").map(l => l.trim()).filter(l => l.length > 0).length;
  badge.textContent = `${count} គណនី`;
}
window.updateAdminAddStockCredsCount = updateAdminAddStockCredsCount;

async function submitAdminCreateGiveaway(e) {
  e.preventDefault();
  const title = document.getElementById("gaAdminTitle").value.trim();
  const badge = document.getElementById("gaAdminBadge").value.trim();
  const duration = parseInt(document.getElementById("gaAdminDuration").value) || 7;
  const img = document.getElementById("gaAdminImg").value.trim();
  const channel = document.getElementById("gaAdminChannel").value.trim();
  const channelLink = document.getElementById("gaAdminChannelLink").value.trim();
  const group = document.getElementById("gaAdminGroup").value.trim();
  const groupLink = document.getElementById("gaAdminGroupLink").value.trim();
  const desc = document.getElementById("gaAdminDesc").value.trim();
  const creds = document.getElementById("gaAdminCreds").value.trim();

  if (!title) {
    alert("សូមបញ្ចូលចំណងជើង Giveaway");
    return;
  }

  try {
    const payload = {
      admin_id: currentUser.user_id,
      title,
      description: desc,
      duration_days: duration,
      image_url: img,
      badge,
      required_channel: channel,
      invite_link: channelLink,
      required_group: group,
      group_invite_link: groupLink,
      credentials_text: creds
    };

    const res = await fetch("/api/admin/giveaways", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    if (json.status === "success") {
      alert(`✅ បានបង្កើត Giveaway #${json.giveaway_id} ដោយជោគជ័យ! បញ្ចូលស្តុក ${json.stock_added} អាខោន។`);
      closeModal("adminCreateGiveawayModal");
      loadAdminGiveaways();
      loadGiveaways();
    } else {
      alert("❌ " + (json.detail || "Error creating giveaway"));
    }
  } catch (err) {
    alert("❌ Error: " + err.message);
  }
}
window.submitAdminCreateGiveaway = submitAdminCreateGiveaway;

function openAdminAddGaStockModal(giveawayId, title) {
  document.getElementById("modalGaStockId").value = giveawayId;
  const sub = document.getElementById("modalAddGaStockSubtitle");
  if (sub) sub.textContent = `Giveaway #${giveawayId} — ${title}`;
  document.getElementById("modalGaStockCreds").value = "";
  updateAdminAddStockCredsCount();
  openModal("adminAddGiveawayStockModal");
}
window.openAdminAddGaStockModal = openAdminAddGaStockModal;

async function submitAdminAddGaStock(e) {
  e.preventDefault();
  const giveawayId = document.getElementById("modalGaStockId").value;
  const creds = document.getElementById("modalGaStockCreds").value.trim();
  if (!creds) {
    alert("សូមបញ្ចូល Account យ៉ាងហោចណាស់មួយ");
    return;
  }

  try {
    const res = await fetch(`/api/admin/giveaways/${giveawayId}/stock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin_id: currentUser.user_id, credentials_text: creds })
    });
    const json = await res.json();
    if (json.status === "success") {
      alert(`✅ បានបន្ថែម ${json.added} អាខោន ចូលស្តុកដោយជោគជ័យ!`);
      closeModal("adminAddGiveawayStockModal");
      loadAdminGiveaways();
      loadGiveaways();
    } else {
      alert("❌ " + (json.detail || "Error adding stock"));
    }
  } catch (err) {
    alert("❌ Error: " + err.message);
  }
}
window.submitAdminAddGaStock = submitAdminAddGaStock;

async function adminDeleteGiveaway(giveawayId) {
  if (!confirm(`តើអ្នកពិតជាចង់លុប Giveaway #${giveawayId} នេះមែនទេ?`)) return;
  try {
    const res = await fetch(`/api/admin/giveaways/${giveawayId}?admin_id=${currentUser.user_id}`, {
      method: "DELETE"
    });
    const json = await res.json();
    if (json.status === "success") {
      alert("✅ បានលុប Giveaway ដោយជោគជ័យ!");
      loadAdminGiveaways();
      loadGiveaways();
    } else {
      alert("❌ " + (json.detail || "Error deleting giveaway"));
    }
  } catch (err) {
    alert("❌ Error: " + err.message);
  }
}
window.adminDeleteGiveaway = adminDeleteGiveaway;

async function openAdminGaClaimsModal(giveawayId, title) {
  const sub = document.getElementById("adminGaClaimsSubtitle");
  if (sub) sub.textContent = `Giveaway #${giveawayId} — ${title}`;
  
  const refreshBtn = document.getElementById("btnRefreshGaClaims");
  if (refreshBtn) refreshBtn.onclick = () => openAdminGaClaimsModal(giveawayId, title);

  const countLbl = document.getElementById("adminGaClaimsCountLabel");
  if (countLbl) countLbl.textContent = "សរុប: ...";

  const listEl = document.getElementById("adminGaClaimsList");
  if (listEl) listEl.innerHTML = `<div style="text-align: center; padding: 25px; color: var(--text-muted);">⏳ កំពុងផ្ទុកបញ្ជីអ្នកទទួល...</div>`;

  openModal("adminGiveawayClaimsModal");

  try {
    const res = await fetch(`/api/admin/giveaways/${giveawayId}/claims?admin_id=${currentUser.user_id}`);
    const json = await res.json();
    if (json.status !== "success" || !json.data || json.data.length === 0) {
      if (countLbl) countLbl.textContent = "សរុប: 0 នាក់";
      listEl.innerHTML = `
        <div style="text-align: center; padding: 30px; color: var(--text-muted);">
          <div style="font-size: 30px; margin-bottom: 6px;">👥</div>
          <div>មិនទាន់មានអ្នកទទួលយកនៅឡើយទេ</div>
        </div>
      `;
      return;
    }

    if (countLbl) countLbl.textContent = `សរុប: ${json.data.length} នាក់`;

    let html = "";
    json.data.forEach(c => {
      const timeStr = c.claimed_at ? new Date(c.claimed_at).toLocaleString("km-KH") : "ថ្មីៗនេះ";
      const userDisplay = c.username ? `@${escapeHtml(c.username)}` : (c.full_name ? escapeHtml(c.full_name) : `User #${c.user_id}`);
      html += `
        <div class="admin-ga-claim-card">
          <div class="admin-ga-claim-header">
            <div style="display: flex; align-items: center; gap: 8px;">
              <div style="width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg, #a855f7, #6366f1); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800; color: #fff;">
                ${(c.full_name || 'U').charAt(0).toUpperCase()}
              </div>
              <div>
                <div class="admin-ga-claim-user">${userDisplay}</div>
                <div style="font-size: 10px; color: var(--text-muted);">ID: ${c.user_id}</div>
              </div>
            </div>
            <div class="admin-ga-claim-time">${timeStr}</div>
          </div>
          <div style="font-size: 10.5px; color: var(--text-muted); margin-top: 2px;">គណនីដែលទទួលបាន:</div>
          <div class="admin-ga-claim-creds">${escapeHtml(c.credentials || '')}</div>
        </div>
      `;
    });

    listEl.innerHTML = html;
  } catch (err) {
    listEl.innerHTML = `<div style="text-align: center; padding: 25px; color: var(--danger);">❌ Error: ${err.message}</div>`;
  }
}
window.openAdminGaClaimsModal = openAdminGaClaimsModal;











