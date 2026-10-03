// DigiVault global UI enhancements
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, sendEmailVerification } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
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
    document.querySelector('.dv-verify')?.remove();
    const sellerBtn = document.querySelector('.dv-seller'); if (sellerBtn) sellerBtn.hidden = !user;
    const needsVerify = user && user.email && !user.emailVerified && user.providerData.some(p => p.providerId === 'password');
    if (needsVerify) {
      const bar = document.createElement('div'); bar.className = 'dv-verify';
      bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:100001;background:#3b3200;color:#ffd84d;padding:8px 14px;text-align:center;font:700 13px Tajawal,Arial';
      bar.append('يرجى تأكيد بريدك الإلكتروني لتفعيل الإشعارات وميزات البائع. ');
      const b = document.createElement('button'); b.type = 'button'; b.textContent = 'إعادة إرسال رسالة التأكيد';
      b.style.cssText = 'margin-inline-start:8px;padding:3px 10px;border-radius:6px;border:0;cursor:pointer;font:inherit';
      b.onclick = async () => { try { await sendEmailVerification(user); b.textContent = 'تم الإرسال ✓'; b.disabled = true; } catch { b.textContent = 'حاول لاحقاً'; } };
      bar.append(b); document.body.appendChild(bar);
    }
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

// DigiVault V11: seller dashboard + wishlist shortcuts
(function(){
  const path=location.pathname.split('/').pop()||'index.html';
  if(!document.querySelector('a[href="my-products.html"]') && !['login.html','signup.html'].includes(path)){
    const nav=document.querySelector('.nav-links,.navbar,.sidebar-menu');
    if(nav){const a=document.createElement('a');a.href='my-products.html';a.textContent='📊 لوحة البائع';a.style.cssText='color:#00d2ff;font-weight:800;text-decoration:none;margin-inline:8px';nav.appendChild(a)}
  }
})();
