# DigiVault V8

- رفع حد ملفات المنتجات في Cloud Storage إلى 5 TiB لكل ملف (الحد الأقصى للـ object).
- إبقاء Firestore كخيار احتياطي صغير فقط، وليس لتخزين الملفات الكبيرة.
- تحديث قواعد Storage لتسمح بملفات المنتجات حتى 5 TiB مع صلاحيات البائع/الإدارة.
- الصور تبقى حتى 5 MB لكل صورة.
- الملفات الكبيرة تحتاج Cloud Storage، وCloud Storage for Firebase يتطلب خطة Blaze.
