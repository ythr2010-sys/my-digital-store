# DigiVault v16 — Backblaze B2 setup

## Already completed
- Bucket: `digivault-files-2026`
- Region: `eu-central-003`
- Endpoint: `https://s3.eu-central-003.backblazeb2.com`
- Bucket access: Private
- Default encryption: Enabled
- Application key: non-master, bucket-scoped, Read and Write

## Worker variables
In `upload-worker/wrangler.toml` set the Firebase Web API key and keep the B2 endpoint/bucket values as shown.

## Worker secrets
From the `upload-worker` directory:

```bash
npm install
npx wrangler secret put B2_KEY_ID
npx wrangler secret put B2_APPLICATION_KEY
npx wrangler deploy
```

When prompted, paste the values from Backblaze. These values are secrets and must never be committed to GitHub or sent in chat.

## Frontend
After deployment, copy the Worker URL into `upload-config.js` as `UPLOAD_WORKER_URL`.

## Important
The B2 bucket remains private. Images are served through the Worker with short-lived access, while product files use temporary signed download URLs. A future payment-gate Worker endpoint should issue fresh download URLs only after verifying a completed paid order; this is the remaining production security step for paid delivery.
