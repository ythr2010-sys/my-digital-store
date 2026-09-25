// DigiVault - Firebase shared configuration
// ملاحظة: Firebase Web API keys ليست أسراراً بحد ذاتها، لكن يجب تقييدها من Google Cloud.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, getDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyClXL28rqPQr--pUu3N_Y-X3ihXEAKOyg8",
  authDomain: "digivault-4c3a3.firebaseapp.com",
  projectId: "digivault-4c3a3",
  storageBucket: "digivault-4c3a3.firebasestorage.app",
  messagingSenderId: "578335534171",
  appId: "1:578335534171:web:1b108a849c0543f998a37e"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const SUPER_ADMIN = "ythr2010@gmail.com";
export const CART_KEY = "digivaultCart";

setPersistence(auth, browserLocalPersistence).catch(() => {});

export async function checkIsAdmin(user) {
  if (!user?.email) return false;
  const email = user.email.toLowerCase();
  if (email === SUPER_ADMIN.toLowerCase()) return true;
  try {
    const snap = await getDoc(doc(db, "admins", email));
    return snap.exists();
  } catch {
    return false;
  }
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

export function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
  catch { return []; }
}
export function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

window.__dvLoaded = true;
