# DigiVault — خطة النشر

## Cloudflare Worker
1. من مجلد المشروع شغّل `npm install`.
2. أضف أسرار B2 في Cloudflare باستخدام `npx wrangler secret put B2_KEY_ID` و`npx wrangler secret put B2_APPLICATION_KEY`.
3. انشر باستخدام `npx wrangler deploy`.
4. افتح `/health` على رابط Worker للتحقق من الاستجابة.

## Firebase
1. انشر `firestore.rules`.
2. أضف `ythr2010-sys.github.io` إلى Firebase Authentication > Authorized domains.

## Backblaze B2
طبّق قاعدة CORS الموجودة في `b2-cors.json` على bucket `digivault-files-2026`.

## GitHub Pages
انشر ملفات الموقع الثابتة من المستودع، ثم اختبر التسجيل، إضافة منتج، رفع صورة صغيرة، والتنزيل.

## أمان
لا تضع مفاتيح B2 السرية في GitHub أو ملفات الواجهة. اختبر الملفات الصغيرة قبل الملفات الكبيرة.
