# DigiVault deployment notes

## Cloudflare Worker
1. From the repository root, run `npm install`.
2. Add B2 secrets in Cloudflare: `npx wrangler secret put B2_KEY_ID` and `npx wrangler secret put B2_APPLICATION_KEY`.
3. Deploy with `npx wrangler deploy`.
4. Check `GET https://my-digital-store.ythr2010.workers.dev/health` returns JSON with `ok: true`.

## Backblaze B2 CORS
Apply `b2-cors.json` to the `digivault-files-2026` bucket in Backblaze settings. The file alone does not apply settings. The allowed origin is the GitHub Pages origin without the repository path.

## Security and testing
- Never commit or share B2 credentials.
- Test with a small image and a small product file before large uploads.
- Verify upload and download end-to-end before production use.
