// site-enhance.js - تحسينات مشتركة لكل الصفحات:
// 1) جرس الإشعارات مع عداد غير المقروء
// 2) انتقالات سلسة بين الصفحات (fade)
// أضفه في أي صفحة: <script type="module" src="./site-enhance.js"></script>
import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, query, where, onSnapshot, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ===== 1) انتقال سلس بين الصفحات =====
const style = document.createElement('style');
style.textContent = `
    body { animation: dvPageFade .35s ease; }
    @keyframes dvPageFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    html { scroll-behavior: smooth; }

    /* جرس الإشعارات */
    #dvBellWrap { position: fixed; top: 18px; left: 18px; z-index: 99999; }
    #dvBellBtn { width: 46px; height: 46px; border-radius: 50%; background: #141424;
        border: 1px solid rgba(255,255,255,.12); color: #fff; font-size: 20px; cursor: pointer;
        display: flex; align-items: center; justify-content: center; position: relative;
        box-shadow: 0 4px 15px rgba(0,0,0,.4); transition: .2s; }
    #dvBellBtn:hover { border-color: #00d2ff; transform: scale(1.05); }
    #dvBellCount { position: absolute; top: -4px; right: -4px; background: #ff4757; color: #fff;
        font-size: 11px; font-weight: 800; min-width: 19px; height: 19px; border-radius: 10px;
        display: none; align-items: center; justify-content: center; padding: 0 4px; }
    #dvBellDropdown { position: absolute; top: 56px; left: 0; width: 340px; max-height: 420px;
        overflow-y: auto; background: #141424; border: 1px solid rgba(255,255,255,.1);
        border-radius: 14px; box-shadow: 0 15px 40px rgba(0,0,0,.6); display: none; }
    #dvBellDropdown.open { display: block; }
    .dv-notif-head { padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,.08);
        display: flex; justify-content: space-between; align-items: center; font-weight: 800; }
    .dv-notif-head a { color: #00d2ff; text-decoration: none; font-size: 12px; font-weight: 600; }
    .dv-notif-item { padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,.05);
        font-size: 13px; color: #d5d5e8; }
    .dv-notif-item.unread { background: rgba(0,210,255,.06); border-right: 3px solid #00d2ff; }
    .dv-notif-item .t { font-weight: 800; color: #fff; margin-bottom: 3px; font-size: 13.5px; }
    .dv-notif-item .time { color: #8b8ba5; font-size: 11px; margin-top: 4px; }
    .dv-notif-empty { padding: 30px; text-align: center; color: #8b8ba5; font-size: 13px; }
    .dv-markall { background: none; border: none; color: #00d2ff; cursor: pointer;
        font-size: 12px; font-family: inherit; padding: 0; }
    @media (max-width: 480px) { #dvBellDropdown { width: calc(100vw - 36px); } }
`;
document.head.appendChild(style);

// ===== 2) جرس الإشعارات =====
const wrap = document.createElement('div');
wrap.id = 'dvBellWrap';
wrap.innerHTML = `
    <button id="dvBellBtn" title="الإشعارات">🔔<span id="dvBellCount">0</span></button>
    <div id="dvBellDropdown">
        <div class="dv-notif-head">
            <span>🔔 الإشعارات</span>
            <span><button class="dv-markall" id="dvMarkAll">تحديد الكل كمقروء</button>
            <a href="notifications.html">عرض الكل</a></span>
        </div>
        <div id="dvNotifList"><div class="dv-notif-empty">لا توجد إشعارات.</div></div>
    </div>`;
document.body.appendChild(wrap);

const bellBtn = document.getElementById('dvBellBtn');
const dropdown = document.getElementById('dvBellDropdown');
const notifList = document.getElementById('dvNotifList');
const bellCount = document.getElementById('dvBellCount');

bellBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
});
document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) dropdown.classList.remove('open');
});

function timeAgo(ts) {
    if (!ts || !ts.toDate) return '';
    const diff = (Date.now() - ts.toDate().getTime()) / 1000;
    if (diff < 60) return 'الآن';
    if (diff < 3600) return `قبل ${Math.floor(diff / 60)} دقيقة`;
    if (diff < 86400) return `قبل ${Math.floor(diff / 3600)} ساعة`;
    return `قبل ${Math.floor(diff / 86400)} يوم`;
}

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
        ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

let notifs = [];

async function markRead(id) {
    try { await updateDoc(doc(db, "notifications", id), { read: true }); } catch (e) {}
}

document.getElementById('dvMarkAll').addEventListener('click', async () => {
    const unread = notifs.filter(n => !n.read);
    for (const n of unread) await markRead(n.id);
});

onAuthStateChanged(auth, (user) => {
    if (!user || !user.email) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'block';

    const q = query(collection(db, "notifications"), where("userEmail", "==", user.email));
    onSnapshot(q, (snap) => {
        notifs = [];
        snap.forEach(d => notifs.push({ id: d.id, ...d.data() }));
        notifs.sort((a, b) => {
            const ta = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
            const tb = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
            return tb - ta;
        });

        const unreadCount = notifs.filter(n => !n.read).length;
        bellCount.style.display = unreadCount > 0 ? 'flex' : 'none';
        bellCount.textContent = unreadCount;

        if (notifs.length === 0) {
            notifList.innerHTML = '<div class="dv-notif-empty">لا توجد إشعارات.</div>';
            return;
        }
        notifList.innerHTML = notifs.slice(0, 15).map(n => `
            <div class="dv-notif-item ${n.read ? '' : 'unread'}" data-id="${n.id}">
                <div class="t">${esc(n.title)}</div>
                <div>${esc(n.message)}</div>
                <div class="time">${timeAgo(n.createdAt)}</div>
            </div>`).join('');

        notifList.querySelectorAll('.dv-notif-item').forEach(item => {
            item.addEventListener('click', () => markRead(item.dataset.id));
        });
    }, (err) => console.error("خطأ في الإشعارات:", err));
});
