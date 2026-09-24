DigiVault Pro Final

الإصلاحات:
- استعادة firebase-init.js وstyle.css وsite-enhance.js التي كانت مفقودة من الحزمة السابقة.
- تحسين تسجيل Google مع popup/redirect ورسائل أخطاء واضحة.
- حفظ جلسة Firebase محلياً.
- إصلاح ظهور نموذج إضافة المنتج بعد تسجيل الدخول.
- جرس إشعارات عام + عداد غير المقروء.
- لوحة الإدارة: قبول/رفض/تعديل/حذف المنتجات، الطلبات والتسليم، الرد على الرسائل، الإيرادات، المستخدمون، الزيارات، والإشعارات.
- تسجيل زيارة واحدة لكل جلسة متصفح في مجموعة visits.
- إزالة base target=_blank للملاحة الداخلية.
- تحسين التفاعل ورسائل الخطأ.

مهم لإكمال Google:
1) Firebase Console > Authentication > Sign-in method > فعّل Google.
2) Authentication > Settings > Authorized domains > أضف نطاق موقعك.
3) شغّل الموقع عبر HTTP/HTTPS وليس file://.
4) صلاحيات Firestore/Storage يجب أن تسمح بالعمليات المطلوبة؛ الواجهة لا تتجاوز قواعد الأمان.
