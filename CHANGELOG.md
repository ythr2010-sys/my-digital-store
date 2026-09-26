# DigiVault — Changelog

## V9 — Marketplace readiness and launch hardening
- Enhanced seller dashboard with sales summary.
- Added shop sorting and free/paid filtering.
- Added automatic image optimization for larger raster images.
- Added admin file accessibility check with CORS-aware fallback.
- Kept large product files on Cloud Storage/external delivery; Firestore stores metadata and links.
- Consolidated release notes under `docs/`.

## Publishing
Use `PUBLISH_TO_FIREBASE.md` and `SECURITY_SETUP.md` before public launch.

## V10 — تحسين تجربة البائع والسرعة
- إظهار رابط لوحة البائع في التنقل العام.
- تحسين اختيار صور متعددة: اختيار على دفعات، سحب وإفلات، معاينة وحذف قبل الرفع.
- إصلاح خطأ في صفحة تعديل المنتج كان يستخدم متغيرًا غير معرّف.
- إصلاح حد التخزين المضمن للصور ليبقى آمنًا ضمن حد مستند Firestore؛ الملفات/الصور الأكبر تستخدم Storage أو رابطًا خارجيًا.
- إضافة preconnect للخطوط لتقليل زمن بدء التحميل.

- V11: إصلاح حذف صور البائع، تعدد الصور على دفعات، إصلاح تدفق المنتجات المجانية، وتحسين التعامل مع الملفات الكبيرة عند غياب Storage.
