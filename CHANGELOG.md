# DigiVault v16 changelog

## Storage migration
- Replaced Cloudflare R2 integration with Backblaze B2 S3-compatible storage.
- Bucket remains private with server-side encryption enabled.
- Added Backblaze B2 multipart upload Worker using AWS Signature V4.
- B2 Application Key stays server-side as Worker secrets.
- Product images are served through a Worker media endpoint instead of public bucket URLs.
- Product file links use temporary signed URLs.
- Added B2 CORS setup documentation.

## UX and reliability
- Kept direct image upload from computer/phone.
- Kept large-file multipart upload with retries and progress.
- Kept up to 8 product images and 10 MB per image.
- Kept free products flowing directly to purchases without card payment.
- Added clearer storage configuration errors.

## Remaining production hardening
- Deploy the Worker and set its secrets.
- Configure B2 CORS for the exact production origin.
- Add a server-side payment webhook before accepting real paid orders.
- Add a server-side authorization gate that verifies completed paid orders before issuing each paid-file download URL.

## v2 — Security & delivery foundation
See `docs/AUDIT.md`. Worker rewritten (entitlement-checked `/download`, strict CORS, upload validation, local JWT verification); Firestore rules rewritten; checkout/profile/admin/product/add-product/edit-product patched; email verification added; payment numbers moved to admin settings; audit logs; Worker test suite.
