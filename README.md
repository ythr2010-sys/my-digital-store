# DigiVault Upload Worker

Cloudflare Worker that authenticates Firebase users and signs multipart R2 upload operations. Parent R2 secrets stay server-side.

## Required configuration

Set values in `wrangler.toml`, then store the secret:

```bash
npx wrangler secret put R2_SECRET_ACCESS_KEY
npm install
npx wrangler deploy
```

Set `FIREBASE_WEB_API_KEY`, `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, and `R2_PUBLIC_BASE_URL` in Worker variables. The browser only receives short-lived presigned part URLs.

Use a dedicated R2 token scoped to the DigiVault bucket. Do not commit secrets.
