# DigiVault Storage Worker — Backblaze B2

This Worker keeps the Backblaze B2 Application Key server-side and exposes authenticated multipart upload operations to the DigiVault frontend.

## Environment

Set these Wrangler vars:
- `FIREBASE_WEB_API_KEY`
- `B2_ENDPOINT=https://s3.eu-central-003.backblazeb2.com`
- `B2_BUCKET_NAME=digivault-files-2026`
- `B2_REGION=eu-central-003`
- `PART_SIZE_BYTES=52428800`

Set these as Worker secrets:
- `B2_KEY_ID`
- `B2_APPLICATION_KEY`

Never commit either secret to GitHub.

## Deploy

```bash
npm install
npx wrangler secret put B2_KEY_ID
npx wrangler secret put B2_APPLICATION_KEY
npx wrangler deploy
```

The frontend only needs the public Worker URL in `upload-config.js`.

The B2 bucket should remain Private. Product images are served through `/media` using short-lived server-side signed access. Product files are not exposed as public B2 URLs.
