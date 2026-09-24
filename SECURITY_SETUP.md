# DigiVault — خطوات تأمين Firebase

## 1) مفتاح Firebase
مفتاح Web API الخاص بـ Firebase ليس كلمة مرور. Firebase توضح أن مفاتيح Firebase مخصصة للظهور في كود الويب، بينما الحماية الحقيقية تأتي من Security Rules وApp Check.

مع ذلك، يجب تقييد المفتاح من Google Cloud Console على:
- HTTP referrers: نطاق موقعك (مثلاً `https://your-domain.example/*`).
- APIs: خدمات Firebase التي يستخدمها المشروع فقط.

إذا كان المفتاح مستخدماً في Google APIs أخرى، أنشئ مفتاحاً منفصلاً ومقيّداً لها.

## 2) Firestore
انشر `firestore.rules` من Firebase Console → Firestore Database → Rules، أو عبر Firebase CLI.

القواعد تمنع المستخدم العادي من:
- تعديل حالة منتجات الآخرين.
- إنشاء إشعارات لنفسه.
- قراءة طلبات الآخرين.
- تعديل دور حسابه إلى admin.

## 3) Storage
انشر `storage.rules` من Firebase Console → Storage → Rules.
- صور المنتجات: PNG/JPEG/WebP/GIF فقط، وبحد 5MB.
- ملفات المنتجات: بحد 100MB.
- الملف لا يصبح قابلاً للقراءة العامة إلا بعد قبول المنتج، أو للبائع/الإدارة.

## 4) App Check
فعّل Firebase App Check للتطبيقات التي يدعمها مشروعك بعد اختبار الموقع، لتقليل إساءة استخدام خدمات Firebase.

## 5) GitHub Secret Scanning
إذا كان التنبيه القديم يشير إلى مفتاح Firebase Web API فقط، فوجوده في JavaScript لا يعني أنه سرّ. لا تحاول إخفاءه داخل HTML؛ المتصفح يحتاج إلى إعداد Firebase.

لكن إذا استُخدم نفس المفتاح في API غير تابع لـ Firebase، فقم بإلغائه وإنشاء مفتاح منفصل لذلك الاستخدام.

بعد التأكد من القيود والقواعد وسجل الاستخدام، يمكنك معالجة تنبيه GitHub وفق حالة المفتاح الفعلية من Google Cloud Console.
