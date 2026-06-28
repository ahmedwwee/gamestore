// ══════════════════════════════════════════
//  إعدادات
// ══════════════════════════════════════════
const POSTS_JSON_URL   = "posts.json";
const GALLERY_JSON_URL = "gallery.json";
const BOT_USERNAME     = "kkn5bot";
const WORKER_URL        = "https://gamestore.ahmedx.workers.dev/";

// كلمة مرور الأدمن — غيّرها لكلمة من اختيارك
const ADMIN_PASSWORD = "ahmed2026";

// ══════════════════════════════════════════
//  Telegram Mini App init
// ══════════════════════════════════════════
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }
function haptic(style = "light") {
  try { tg?.HapticFeedback?.impactOccurred(style); } catch (e) {}
}

// ══════════════════════════════════════════
//  حالة التطبيق (محلية فقط، بدون أي خادم)
// ══════════════════════════════════════════
let allPosts      = [];
let currentFilter = "all";
let searchQuery   = "";
let viewMode      = localStorage.getItem("gs_view") || "grid";
let isAdmin       = sessionStorage.getItem("gs_admin") === "1";

let cart   = JSON.parse(localStorage.getItem("gs_cart")   || "[]");
let pinned = JSON.parse(localStorage.getItem("gs_pinned") || "[]"); // [key,...]
let hidden = JSON.parse(localStorage.getItem("gs_hidden") || "[]"); // [key,...]
let renamed= JSON.parse(localStorage.getItem("gs_renamed")|| "{}"); // {key: newTitle}

if (isAdmin) document.body.classList.add("admin-mode");

// ══════════════════════════════════════════
//  جلب البيانات: posts.json + gallery.json
// ══════════════════════════════════════════
async function loadPosts() {
  try {
    const [postsRes, galleryRes] = await Promise.all([
      fetch(POSTS_JSON_URL + "?t=" + Date.now()),
      fetch(GALLERY_JSON_URL + "?t=" + Date.now()).catch(() => null),
    ]);

    const postsData = await postsRes.json();
    const posts = postsData.posts || {};

    let galleryMap = {};
    if (galleryRes && galleryRes.ok) {
      const galleryData = await galleryRes.json();
      galleryMap = galleryData.gallery || {};
    }

    allPosts = Object.entries(posts).map(([key, p]) => {
      const title = renamed[key] || p.title || "لعبة";

      // مطابقة الصورة: أولاً عبر source_msg_id/source_chat_id (منشورات جديدة)
      // ثانياً عبر مطابقة العنوان مع gallery.json (منشورات قديمة)
      const galleryMatch = galleryMap[title] || galleryMap[p.title] || null;

      return {
        key,
        title,
        deep_link:      p.deep_link      || `https://t.me/${BOT_USERNAME}?start=${key}`,
        downloads:      p.downloads      || 0,
        created_at:     p.created_at     || "",
        source_msg_id:  p.source_msg_id  || (galleryMatch ? galleryMatch.msg_id  : null),
        source_chat_id: p.source_chat_id || (galleryMatch ? galleryMatch.chat_id : null),
        thumb: null,
      };
    }).filter(p => !hidden.includes(p.key));

    animateStats();
    buildTicker();
    render();
    loadThumbnails();
  } catch (e) {
    document.getElementById("gamesGrid").innerHTML = `
      <div class="empty">
        <div class="empty-icon">⚠️</div>
        <h3>تعذّر تحميل البيانات</h3>
        <p>تأكد أن ملفات posts.json و gallery.json موجودة</p>
      </div>`;
  }
}

// ══════════════════════════════════════════
//  جلب الصور من Worker تدريجياً
// ══════════════════════════════════════════
async function loadThumbnails() {
  const targets = allPosts.filter(p => p.source_msg_id && p.source_chat_id && !p.thumb);
  for (const post of targets) {
    try {
      const res = await fetch(`${WORKER_URL}?chat_id=${post.source_chat_id}&msg_id=${post.source_msg_id}`);
      const data = await res.json();
      if (data.url) {
        post.thumb = data.url;
        updateCardImage(post.key, data.url);
      }
    } catch (e) { /* تخطي الصور الفاشلة */ }
  }
}

function updateCardImage(key, imgUrl) {
  document.querySelectorAll(`.card[data-key="${key}"] .card-img`).forEach(card => {
    if (card.querySelector("img")) return;
    const img = document.createElement("img");
    img.src = imgUrl; img.alt = ""; img.loading = "lazy";
    img.style.opacity = "0"; img.style.transition = "opacity .3s ease";
    const badges = card.querySelectorAll(".badge-new,.badge-rank,.badge-pin,.hot-flame");
    card.innerHTML = ""; badges.forEach(b => card.appendChild(b));
    card.appendChild(img);
    requestAnimationFrame(() => { img.style.opacity = "1"; });
  });
}

function reapplyKnownThumbs() {
  allPosts.filter(p => p.thumb).forEach(p => updateCardImage(p.key, p.thumb));
}

// ══════════════════════════════════════════
//  إحصائيات + عداد متحرك
// ══════════════════════════════════════════
function animateCounter(el, target, duration = 900) {
  const startTime = performance.now();
  function tick(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(target * eased);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function animateStats() {
  const total   = allPosts.length;
  const totalDl = allPosts.reduce((s, p) => s + p.downloads, 0);
  animateCounter(document.getElementById("statGames"), total);
  animateCounter(document.getElementById("statDownloads"), totalDl);
  document.getElementById("totalCount").textContent = total;
  document.getElementById("botLink").href = `https://t.me/${BOT_USERNAME}`;
}

// ══════════════════════════════════════════
//  شريط الأكثر شعبية
// ══════════════════════════════════════════
function buildTicker() {
  const top5 = [...allPosts].sort((a,b) => b.downloads - a.downloads).slice(0, 5);
  const wrap  = document.getElementById("tickerWrap");
  const track = document.getElementById("tickerTrack");
  if (!top5.length) { wrap.style.display = "none"; return; }
  const itemsHtml = top5.map((p, i) => `
    <span class="ticker-item"><span class="rank">#${i+1}</span> 🔥 ${escHtml(p.title)} — ${p.downloads} تحميل</span>
  `).join("");
  track.innerHTML = itemsHtml + itemsHtml;
  wrap.style.display = "block";
}

// ══════════════════════════════════════════
//  فلترة + ترتيب (مع التثبيت دائماً بالأعلى)
// ══════════════════════════════════════════
function getFiltered() {
  let list = [...allPosts];

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(p => p.title.toLowerCase().includes(q));
  }

  if (currentFilter === "new")      list.sort((a, b) => b.created_at.localeCompare(a.created_at));
  else if (currentFilter === "top") list.sort((a, b) => b.downloads - a.downloads);
  else                               list.sort((a, b) => b.created_at.localeCompare(a.created_at));

  // المثبتة تطفو للأعلى دوماً (إلا أثناء البحث، لتبقى نتائج البحث منطقية)
  if (!searchQuery && pinned.length) {
    list.sort((a, b) => {
      const aPin = pinned.includes(a.key) ? 1 : 0;
      const bPin = pinned.includes(b.key) ? 1 : 0;
      return bPin - aPin;
    });
  }

  return list;
}

function isNew(createdAt) {
  if (!createdAt) return false;
  try {
    const created = new Date(createdAt.replace("T"," ") + "Z").getTime();
    return (Date.now() - created) < 24 * 60 * 60 * 1000;
  } catch { return false; }
}

// أعلى 3 تحميلاً على الإطلاق (لتأثير اللهب) — يُحسب من القائمة الكاملة دوماً
function getTop3Keys() {
  return [...allPosts].sort((a,b) => b.downloads - a.downloads).slice(0,3).map(p => p.key);
}

// ══════════════════════════════════════════
//  رسم الكروت
// ══════════════════════════════════════════
function render() {
  const grid = document.getElementById("gamesGrid");
  const list = getFiltered();
  const top3 = getTop3Keys();

  grid.className = "games-grid" + (viewMode === "list" ? " list-mode" : "");

  const labels = { all: "جميع الألعاب", new: "الأحدث إضافةً", top: "الأكثر تحميلاً" };
  document.getElementById("sectionTitle").textContent =
    searchQuery ? `نتائج البحث عن "${searchQuery}"` : labels[currentFilter];

  if (!list.length) {
    grid.innerHTML = `<div class="empty"><div class="empty-icon">🔍</div><h3>لا توجد نتائج</h3><p>جرّب كلمة بحث مختلفة</p></div>`;
    return;
  }

  const showRank = currentFilter === "top" && !searchQuery;

  grid.innerHTML = list.map((p, i) => {
    const isHot   = top3.includes(p.key);
    const isPinned= pinned.includes(p.key);
    const inCart  = cart.includes(p.key);

    return `
    <div class="card ${isHot ? 'is-hot' : ''}" data-key="${p.key}" style="animation-delay:${Math.min(i * 0.04, 0.4)}s">
      <div class="card-img">
        ${isPinned ? `<span class="badge-pin">📌 مثبت</span>` : (showRank ? `<span class="badge-rank">${i+1}</span>` : "")}
        ${isNew(p.created_at) && !isPinned ? `<span class="badge-new">🆕 جديد</span>` : ""}
        ${isHot ? `<span class="hot-flame">🔥</span>` : ""}
        ${p.thumb ? `<img src="${p.thumb}" alt="${escHtml(p.title)}" loading="lazy">` : `🎮`}
      </div>
      <div class="card-body">
        <div class="card-title">${escHtml(p.title)}</div>
        <div class="card-meta">
          <span class="dl-count">⬇️ ${p.downloads}</span>
          <span>${formatDate(p.created_at)}</span>
        </div>
      </div>
      <div class="card-actions">
        <a class="card-btn" href="${p.deep_link}" target="_blank">تحميل عبر البوت</a>
        <button class="cart-btn ${inCart ? 'in-cart' : ''}" data-action="cart" data-key="${p.key}" title="إضافة للسلة">${inCart ? '✓' : '🛒'}</button>
      </div>
      <div class="admin-controls">
        <span class="admin-chip" data-action="pin" data-key="${p.key}">${isPinned ? '📌 إلغاء التثبيت' : '📌 تثبيت'}</span>
        <span class="admin-chip" data-action="rename" data-key="${p.key}">✏️ تعديل الاسم</span>
        <span class="admin-chip" data-action="hide" data-key="${p.key}">🙈 إخفاء</span>
        <span class="admin-chip danger" data-action="delete" data-key="${p.key}">🗑 حذف</span>
      </div>
    </div>`;
  }).join("");

  // أحداث الكروت
  grid.querySelectorAll(".card").forEach(card => {
    card.addEventListener("click", (e) => {
      if (e.target.closest("a") || e.target.closest("button") || e.target.closest(".admin-chip")) return;
      haptic("light");
      const key = card.dataset.key;
      const post = allPosts.find(p => p.key === key);
      if (post) window.open(post.deep_link, "_blank");
    });
  });

  grid.querySelectorAll('[data-action="cart"]').forEach(btn => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); toggleCart(btn.dataset.key); });
  });
  grid.querySelectorAll('[data-action="pin"]').forEach(el => {
    el.addEventListener("click", (e) => { e.stopPropagation(); togglePin(el.dataset.key); });
  });
  grid.querySelectorAll('[data-action="rename"]').forEach(el => {
    el.addEventListener("click", (e) => { e.stopPropagation(); renamePost(el.dataset.key); });
  });
  grid.querySelectorAll('[data-action="hide"]').forEach(el => {
    el.addEventListener("click", (e) => { e.stopPropagation(); hidePost(el.dataset.key); });
  });
  grid.querySelectorAll('[data-action="delete"]').forEach(el => {
    el.addEventListener("click", (e) => { e.stopPropagation(); deletePost(el.dataset.key); });
  });

  reapplyKnownThumbs();
}

function escHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function formatDate(ts) {
  if (!ts) return "";
  try {
    const d = new Date(ts.replace("T"," ") + "Z");
    return d.toLocaleDateString("ar-IQ", { day:"numeric", month:"short" });
  } catch { return ""; }
}

// ══════════════════════════════════════════
//  السلة (تحميل لاحقاً) — محلي بالكامل
// ══════════════════════════════════════════
function saveCart() { localStorage.setItem("gs_cart", JSON.stringify(cart)); updateCartBadge(); }

function toggleCart(key) {
  haptic("light");
  if (cart.includes(key)) cart = cart.filter(k => k !== key);
  else cart.push(key);
  saveCart();
  render();
}

function updateCartBadge() {
  const badge = document.getElementById("cartBadge");
  if (cart.length) { badge.style.display = "flex"; badge.textContent = cart.length; }
  else badge.style.display = "none";
}

function renderDrawer() {
  const body = document.getElementById("drawerBody");
  if (!cart.length) {
    body.innerHTML = `<div class="drawer-empty">السلة فارغة<br>أضف ألعاباً لتحميلها لاحقاً 🛒</div>`;
    return;
  }
  body.innerHTML = cart.map(key => {
    const p = allPosts.find(p => p.key === key);
    if (!p) return "";
    return `
      <div class="drawer-item">
        <img src="${p.thumb || ''}" alt="" onerror="this.style.display='none'">
        <div class="drawer-item-info">
          <div class="drawer-item-title">${escHtml(p.title)}</div>
        </div>
        <button class="drawer-item-remove" data-key="${key}">✕</button>
      </div>`;
  }).join("");

  body.querySelectorAll(".drawer-item-remove").forEach(btn => {
    btn.addEventListener("click", () => { toggleCart(btn.dataset.key); renderDrawer(); });
  });
}

document.getElementById("cartToggle").addEventListener("click", () => {
  renderDrawer();
  document.getElementById("cartDrawer").classList.add("open");
  document.getElementById("drawerOverlay").classList.add("open");
});
function closeDrawer() {
  document.getElementById("cartDrawer").classList.remove("open");
  document.getElementById("drawerOverlay").classList.remove("open");
}
document.getElementById("drawerClose").addEventListener("click", closeDrawer);
document.getElementById("drawerOverlay").addEventListener("click", closeDrawer);

document.getElementById("openAllBtn").addEventListener("click", () => {
  cart.forEach(key => {
    const p = allPosts.find(p => p.key === key);
    if (p) window.open(p.deep_link, "_blank");
  });
});

// ══════════════════════════════════════════
//  وضع الأدمن: تثبيت / تعديل / إخفاء / حذف
// ══════════════════════════════════════════
function togglePin(key) {
  haptic("medium");
  if (pinned.includes(key)) pinned = pinned.filter(k => k !== key);
  else pinned.push(key);
  localStorage.setItem("gs_pinned", JSON.stringify(pinned));
  render();
}

function renamePost(key) {
  const post = allPosts.find(p => p.key === key);
  if (!post) return;
  const newTitle = prompt("الاسم الجديد:", post.title);
  if (newTitle && newTitle.trim()) {
    renamed[key] = newTitle.trim();
    localStorage.setItem("gs_renamed", JSON.stringify(renamed));
    post.title = newTitle.trim();
    render();
  }
}

function hidePost(key) {
  if (!confirm("إخفاء هذه اللعبة من العرض؟ يمكن إظهارها لاحقاً من إعدادات الأدمن.")) return;
  hidden.push(key);
  localStorage.setItem("gs_hidden", JSON.stringify(hidden));
  allPosts = allPosts.filter(p => p.key !== key);
  render();
  animateStats();
}

function deletePost(key) {
  if (!confirm("حذف هذه اللعبة نهائياً من العرض؟ (لا يحذفها من البوت نفسه)")) return;
  hidden.push(key); // نفس آلية الإخفاء، فقط تسمية مختلفة للمستخدم
  localStorage.setItem("gs_hidden", JSON.stringify(hidden));
  allPosts = allPosts.filter(p => p.key !== key);
  render();
  animateStats();
}

// ══════════════════════════════════════════
//  تسجيل دخول الأدمن
// ══════════════════════════════════════════
const adminModal = document.getElementById("adminModal");

document.getElementById("adminFab").addEventListener("click", () => {
  if (isAdmin) {
    isAdmin = false;
    sessionStorage.removeItem("gs_admin");
    document.body.classList.remove("admin-mode");
    render();
  } else {
    adminModal.classList.add("open");
    document.getElementById("adminPassword").value = "";
    document.getElementById("adminError").textContent = "";
    document.getElementById("adminPassword").focus();
  }
});

document.getElementById("adminCancelBtn").addEventListener("click", () => adminModal.classList.remove("open"));

document.getElementById("adminLoginBtn").addEventListener("click", () => {
  const pass = document.getElementById("adminPassword").value;
  if (pass === ADMIN_PASSWORD) {
    isAdmin = true;
    sessionStorage.setItem("gs_admin", "1");
    document.body.classList.add("admin-mode");
    adminModal.classList.remove("open");
    render();
  } else {
    document.getElementById("adminError").textContent = "كلمة المرور غير صحيحة";
  }
});

document.getElementById("adminPassword").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("adminLoginBtn").click();
});

// ══════════════════════════════════════════
//  بحث / فلاتر / عرض شبكة-قائمة / لون التمييز
// ══════════════════════════════════════════
document.getElementById("searchToggle").addEventListener("click", () => {
  const wrap = document.getElementById("searchWrap");
  wrap.classList.toggle("open");
  if (wrap.classList.contains("open")) document.getElementById("searchInput").focus();
});

document.getElementById("searchInput").addEventListener("input", e => {
  searchQuery = e.target.value.trim();
  render();
});

document.querySelectorAll(".filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    haptic("light");
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    render();
  });
});

document.getElementById("viewGrid").addEventListener("click", () => setView("grid"));
document.getElementById("viewList").addEventListener("click", () => setView("list"));
function setView(mode) {
  viewMode = mode;
  localStorage.setItem("gs_view", mode);
  document.getElementById("viewGrid").classList.toggle("active", mode === "grid");
  document.getElementById("viewList").classList.toggle("active", mode === "list");
  render();
}
setView(viewMode);

document.querySelectorAll(".accent-dot").forEach(dot => {
  dot.addEventListener("click", () => {
    const [c1, c2] = dot.dataset.accent.split(",");
    document.documentElement.style.setProperty("--accent", "#" + c1);
    document.documentElement.style.setProperty("--accent2", "#" + c2);
    document.querySelectorAll(".accent-dot").forEach(d => d.classList.remove("active"));
    dot.classList.add("active");
    localStorage.setItem("gs_accent", dot.dataset.accent);
  });
});
// استرجاع لون محفوظ
const savedAccent = localStorage.getItem("gs_accent");
if (savedAccent) {
  const [c1, c2] = savedAccent.split(",");
  document.documentElement.style.setProperty("--accent", "#" + c1);
  document.documentElement.style.setProperty("--accent2", "#" + c2);
  document.querySelectorAll(".accent-dot").forEach(d => {
    d.classList.toggle("active", d.dataset.accent === savedAccent);
  });
}

// ══════════════════════════════════════════
//  تحميل عند البدء
// ══════════════════════════════════════════
loadPosts();
setInterval(loadPosts, 5 * 60 * 1000);

// تسجيل Service Worker لدعم PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
