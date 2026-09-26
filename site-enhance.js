// DigiVault global UI enhancements
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { collection, query, where, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const ensureStyles = () => {
  if (document.getElementById('dv-enhance-style')) return;
  const s = document.createElement('style');
  s.id = 'dv-enhance-style';
  s.textContent = `
    .dv-bell{position:fixed;top:16px;right:16px;z-index:99999;width:46px;height:46px;border-radius:50%;border:1px solid rgba(255,255,255,.14);background:rgba(20,20,36,.94);color:#fff;display:flex;align-items:center;justify-content:center;text-decoration:none;box-shadow:0 8px 24px rgba(0,0,0,.28);backdrop-filter:blur(10px)}
    .dv-bell:hover{transform:translateY(-2px)} .dv-badge{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;padding:0 5px;border-radius:999px;background:#ff4d67;color:#fff;font:700 11px/19px Arial;text-align:center;border:2px solid #141424}
    .dv-home{position:fixed;bottom:18px;left:18px;z-index:99998;padding:10px 14px;border-radius:999px;background:rgba(20,20,36,.94);color:#fff;text-decoration:none;border:1px solid rgba(255,255,255,.12);box-shadow:0 8px 24px rgba(0,0,0,.22);font-weight:700}
    .dv-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:100000;padding:12px 18px;border-radius:12px;background:#17172a;color:#fff;border:1px solid rgba(255,255,255,.12);box-shadow:0 10px 30px rgba(0,0,0,.3)}
  `;
  document.head.appendChild(s);
};

function init() {
  ensureStyles();
  if (!document.querySelector('.dv-bell')) {
    const a = document.createElement('a');
    a.className='dv-bell'; a.href='notifications.html'; a.title='الإشعارات'; a.setAttribute('aria-label','الإشعارات');
    a.innerHTML='🔔<span class="dv-badge" hidden>0</span>';
    document.body.appendChild(a);
  }
  if (!document.querySelector('.dv-home')) {
    const a=document.createElement('a'); a.className='dv-home'; a.href='index.html'; a.textContent='⌂ الرئيسية';
    document.body.appendChild(a);
  }
  if (!document.querySelector('.dv-seller')) {
    const a=document.createElement('a'); a.className='dv-seller'; a.href='my-products.html'; a.textContent='📊 لوحة البائع';
    a.style.cssText='position:fixed;bottom:18px;right:18px;z-index:99998;padding:10px 14px;border-radius:999px;background:rgba(20,20,36,.94);color:#fff;text-decoration:none;border:1px solid rgba(0,210,255,.25);box-shadow:0 8px 24px rgba(0,0,0,.22);font-weight:700';
    document.body.appendChild(a);
  }
  window.dvToast = (msg) => {
    const old=document.querySelector('.dv-toast'); if(old) old.remove();
    const t=document.createElement('div'); t.className='dv-toast'; t.textContent=msg; document.body.appendChild(t);
    setTimeout(()=>t.remove(),3500);
  };
  onAuthStateChanged(auth, user => {
    const badge=document.querySelector('.dv-badge');
    if(!badge) return;
    if(!user?.email){ badge.hidden=true; return; }
    const q=query(collection(db,'notifications'),where('userEmail','==',user.email));
    onSnapshot(q,snap=>{
      const n=snap.docs.filter(d=>d.data().read!==true).length;
      badge.textContent=n>99?'99+':String(n); badge.hidden=n===0;
    },()=>{ badge.hidden=true; });
  });
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
