# نشر DigiVault

1. ارفع ملفات الموقع إلى الاستضافة.
2. انشر `firestore.rules` من Firebase Console.
3. إذا أردت رفع ملفات كبيرة وإنشاء روابط تنزيل تلقائية من جهاز البائع، فعّل Cloud Storage في مشروع Firebase (يتطلب Blaze).
4. انشر `storage.rules` بعد تفعيل Storage.
5. إذا بقي المشروع على Spark، استخدم الروابط الخارجية أو الملفات الصغيرة المدعومة داخل Firestore.

## لماذا ملفات PATCH_NOTES؟
ملفات `PATCH_NOTES_V3.md` و`PATCH_NOTES_V4.md` و`PATCH_NOTES_V5.md` و`PATCH_NOTES_V6.md` هي ملاحظات إصدار فقط، وليست مطلوبة لتشغيل الموقع. تم وضعها داخل مجلد `docs/` في النسخة الجاهزة.

## v7
بعد النشر تأكد من نشر `firestore.rules`. صفحة منتجاتي تستخدم query على sellerEmail، لذلك يجب أن تطابق القاعدة نفس شرط الملكية؛ هذا يتوافق مع طريقة تقييم Firestore للاستعلامات.
