# DigiVault v15 Upload Worker

هذا الـWorker هو طبقة الأمان بين DigiVault وCloudflare R2.

## الفكرة

1. المستخدم يسجل الدخول في Firebase.
2. DigiVault يرسل Firebase ID token إلى `/credentials`.
3. الـWorker يتحقق من التوكن.
4. الـWorker يصدر Temporary R2 credentials قصيرة العمر ومقيدة بمجلد `uploads/<uid>/` فقط.
5. المتصفح يرفع الملف مباشرة إلى R2 عبر S3 API باستخدام هذه الصلاحيات المؤقتة.
6. الملفات الكبيرة تستخدم multipart upload، فلا يتم وضع الملف في Firestore ولا Base64.

Cloudflare توثق أن Temporary Credentials يمكن تقييدها بمسارات وعمليات S3 محددة، وأنها مناسبة للرفع من العملاء، بينما R2 يدعم multipart للملفات الكبيرة. 

## الإعداد

ثبّت Wrangler:

```bash
npm install
```

ثم عدّل `wrangler.toml`:

- `REPLACE_WITH_YOUR_R2_BUCKET`
- `REPLACE_WITH_CLOUDFLARE_ACCOUNT_ID`
- `REPLACE_WITH_YOUR_R2_BUCKET`
- `REPLACE_WITH_R2_PARENT_ACCESS_KEY_ID`

ضع المفتاح السري كـ Secret ولا تكتبه داخل `wrangler.toml`:

```bash
npx wrangler secret put R2_PARENT_SECRET_ACCESS_KEY
```

ثم:

```bash
npx wrangler deploy
```

بعد ظهور رابط Worker، ضعه في `../upload-config.js`.

## CORS في R2

لأن الرفع يتم من المتصفح إلى R2 عبر S3 API، يجب السماح لنطاق DigiVault بالاتصال بالـbucket. استخدم سياسة CORS مشابهة للآتي، مع استبدال الأصل إذا تغير نطاق الموقع:

```json
[
  {
    "AllowedOrigins": ["https://ythr2010-sys.github.io"],
    "AllowedMethods": ["POST", "PUT", "DELETE"],
    "AllowedHeaders": [
      "authorization",
      "content-type",
      "x-amz-content-sha256",
      "x-amz-date",
      "x-amz-security-token"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

## ملاحظات مهمة

- لا تضع `R2_PARENT_SECRET_ACCESS_KEY` في ملفات الموقع.
- v15 لا تضع بيانات اعتماد R2 طويلة العمر في JavaScript الخاص بالمتصفح.
- Temporary credentials قصيرة العمر ومقيدة بمجلد البائع.
- حدود R2 الحالية تسمح بكائن حتى 5 TiB، والرفع متعدد الأجزاء هو المسار المناسب للملفات الكبيرة. حدود الرفع الدقيقة تعتمد أيضًا على طريقة الاتصال والخدمة المستخدمة.
