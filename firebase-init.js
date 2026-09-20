// ملف موحد لتهيئة Firebase - استورده في كل الصفحات
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, getDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

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
export const storage = getStorage(app);
export const SUPER_ADMIN = "ythr2010@gmail.com";
export const CART_KEY = "digivaultCart";

window.__dvLoaded = true; // علامة تؤكد تحميل الملف بنجاح

export async function checkIsAdmin(user) {
    if (!user || !user.email) return false;
    if (user.email.toLowerCase() === SUPER_ADMIN.toLowerCase()) return true;
    try {
        const snap = await getDoc(doc(db, "admins", user.email.toLowerCase()));
        return snap.exists();
    } catch (e) { return false; }
}

export function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
        ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

export function getCart() { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
export function saveCart(c) { localStorage.setItem(CART_KEY, JSON.stringify(c)); }
