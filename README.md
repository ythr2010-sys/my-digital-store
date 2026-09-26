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


## DigiVault v4 - بدون Firebase Storage

هذه النسخة لا تعتمد على Cloud Storage. يمكن للبائع اختيار صورة من الكمبيوتر/الهاتف مباشرة (حتى 700KB) وتُحفظ كبيانات داخل Firestore، كما يمكنه رفع ملف منتج صغير من الجهاز حتى 700KB. للملفات الأكبر، يستخدم رابط تحميل خارجي.

لذلك لا تحتاج إلى تفعيل Firebase Storage أو ترقية Blaze حتى تعمل وظائف الصور والمنتجات الأساسية في هذه النسخة. يجب نشر `firestore.rules` من Firebase Console.


## DigiVault v14 — نقطة التحول للنشر العالمي
- إزالة اعتماد الواجهة على Firebase Storage.
- الصور وملفات المنتجات تستخدم روابط خارجية فقط.
- Firestore لا يخزن ملفات Base64 كبيرة.
- إضافة `EXTERNAL_STORAGE_GUIDE.md` و`DEPLOYMENT_GUIDE.md`.
- `firebase.json` ينشر Firestore Rules فقط.
- تنبيه: الدفع الحقيقي يحتاج بوابة دفع آمنة وBackend/Webhook؛ لا تستخدم نماذج البطاقة الحالية للإطلاق التجاري.
