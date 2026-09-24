import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, query, where, getDocs, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const BELL_ID = "dvNotificationBell";
const BADGE_ID = "dvNotificationBadge";

function ensureBell() {
  if (document.getElementById(BELL_ID)) return;
  const style = document.createElement("style");
  style.textContent = `
    #${BELL_ID}{position:fixed;top:18px;right:18px;z-index:99999;width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(12,18,32,.94);border:1px solid rgba(0,210,255,.35);color:#fff;text-decoration:none;box-shadow:0 8px 25px rgba(0,0,0,.28);transition:.2s;backdrop-filter:blur(10px)}
    #${BELL_ID}:hover{transform:translateY(-2px);border-color:#00d2ff}
    #${BELL_ID} .dv-bell-icon{font-size:21px}
    #${BADGE_ID}{position:absolute;top:-4px;left:-4px;min-width:19px;height:19px;padding:0 5px;border-radius:999px;background:#ff4757;color:#fff;font:700 11px/19px Arial;text-align:center;border:2px solid #0c1220}
    #${BADGE_ID}.hidden{display:none}
    .dv-page-toast{position:fixed;bottom:22px;left:22px;z-index:100000;max-width:min(380px,calc(100vw - 44px));padding:13px 16px;border-radius:12px;background:#141424;color:#fff;border:1px solid rgba(0,210,255,.35);box-shadow:0 12px 35px rgba(0,0,0,.35);font-family:inherit;opacity:0;transform:translateY(10px);transition:.25s}
    .dv-page-toast.show{opacity:1;transform:translateY(0)}
    @media(max-width:600px){#${BELL_ID}{top:10px;right:10px;width:42px;height:42px}}
  `;
  document.head.appendChild(style);
  const a = document.createElement("a");
  a.id = BELL_ID; a.href = "notifications.html"; a.title = "الإشعارات"; a.setAttribute("aria-label","الإشعارات");
  a.innerHTML = `<span class="dv-bell-icon">🔔</span><span id="${BADGE_ID}" class="hidden">0</span>`;
  document.body.appendChild(a);
}

async function updateNotificationBadge(user) {
  const badge = document.getElementById(BADGE_ID);
  if (!badge) return;
  if (!user?.email) { badge.classList.add("hidden"); return; }
  try {
    const snap = await getDocs(query(collection(db,"notifications"),where("userEmail","==",user.email)));
    let unread = 0;
    snap.forEach(d => { if (d.data().read !== true) unread++; });
    if (unread) { badge.textContent = unread > 99 ? "99+" : unread; badge.classList.remove("hidden"); }
    else badge.classList.add("hidden");
  } catch { badge.classList.add("hidden"); }
}

async function trackVisit(user) {
  if (sessionStorage.getItem("dvVisitLogged")) return;
  sessionStorage.setItem("dvVisitLogged","1");
  try {
    await addDoc(collection(db,"visits"), {
      path: location.pathname.split("/").pop() || "index.html",
      userEmail: user?.email || null,
      createdAt: serverTimestamp()
    });
  } catch {}
}

function init() {
  ensureBell();
  onAuthStateChanged(auth, user => { updateNotificationBadge(user); trackVisit(user); });
  window.addEventListener("dv:notifications-refresh", () => updateNotificationBadge(auth.currentUser));
  window.dvToast = msg => {
    let t = document.querySelector(".dv-page-toast");
    if (!t) { t=document.createElement("div"); t.className="dv-page-toast"; document.body.appendChild(t); }
    t.textContent=msg; requestAnimationFrame(()=>t.classList.add("show"));
    clearTimeout(window.__dvToastTimer);
    window.__dvToastTimer=setTimeout(()=>t.classList.remove("show"),3200);
  };
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",init,{once:true}); else init();
