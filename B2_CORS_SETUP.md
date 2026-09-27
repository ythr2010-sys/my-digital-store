# Backblaze B2 CORS for DigiVault

The browser uploads each multipart part directly to B2 using a short-lived presigned URL, so the bucket must allow the exact web origin.

Replace `https://YOUR-DIGIVAULT-DOMAIN.example` with the exact production origin (for example your GitHub Pages origin) and configure the bucket's CORS rules for S3-compatible API access.

Required methods: `GET`, `PUT`, `HEAD`.
Allowed headers: `*`.
Expose: `ETag`, `Content-Length`, `Content-Type`.
Max age: `3600`.

Do not use `*` as the production origin. Backblaze's current documentation confirms that CORS is required for browser uploads using presigned requests. See the official documentation linked in the project notes.
