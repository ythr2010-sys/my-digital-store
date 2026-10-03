# DigiVault — Setup, deployment and migration (Round 1)

## 0. Before you publish the new rules (avoid locking yourself out)
Admin access now requires a **verified** email. Sign in once with Google using `ythr2010@gmail.com`, or verify that address via the email link, *before* deploying `firestore.rules`. Any additional admins (`admins/{email}` documents) must also be verified.

## 1. Worker (Cloudflare)
```bash
npm install
npx wrangler secret put B2_KEY_ID
npx wrangler secret put B2_APPLICATION_KEY
```
Edit `wrangler.toml` → `ALLOWED_ORIGINS` to the exact origin(s) of your site (e.g. `https://yourdomain.com,https://yourproject.pages.dev`). Then `npx wrangler deploy`.
Use a B2 application key limited to the one bucket. Add a Cloudflare **Rate Limiting rule** on the Worker route for hard limits (the in-code limiter is per-isolate, best-effort).

| Variable | Kind | Purpose |
|---|---|---|
| `B2_KEY_ID`, `B2_APPLICATION_KEY` | **secret** | Backblaze S3-compatible credentials |
| `FIREBASE_PROJECT_ID` | public | token audience check |
| `ALLOWED_ORIGINS` | public | CORS allow-list |
| `B2_ENDPOINT`, `B2_BUCKET_NAME`, `B2_REGION` | public | storage target |
| `MAX_FILE_BYTES`, `MAX_IMAGE_BYTES`, `MAX_UPLOADS_PER_HOUR`, `PART_SIZE_BYTES` | public | limits |
| `ALLOWED_FILE_EXTENSIONS` | public, optional | override the default allow-list (executables are excluded by default) |

## 2. Firestore
```bash
firebase deploy --only firestore:rules
```
Rules were reviewed but **not emulator-tested**. Before going live, with the emulator or a staging project, confirm: (a) a normal user cannot write `purchases`, `settings`, `audit_logs`; (b) a review is rejected without a `purchases/{uid}_{pid}` or `free_purchases/{uid}_{pid}` doc; (c) a seller cannot set `status:'approved'`; (d) an unverified-email account is not treated as admin.

## 3. One-time migration (after deploying rules + Worker + site)
1. Open **admin.html → Payment settings**, enter your real RIP/CCP/account name, tick *enable*, save. Until then checkout shows a setup warning (by design).
2. Click **"ترحيل الطلبات المكتملة القديمة"** once: it creates download entitlements for orders completed before this update (old orders had stored links that expired).
3. Existing `product_files` documents keep working: those with `storageKey` are served from B2; those with only an admin-entered external link are served through the same entitlement check.

## 4. Behaviour changes users will notice
- Email/password users receive a verification email; until verified they can browse/buy/review but not see email-keyed notifications or use seller features.
- Product files are no longer reachable by stored links; the Download button requests a fresh 5-minute link.
- Uploads: allowed file types/sizes are enforced (default max 5 GB, images 10 MB JPG/PNG/WebP/GIF).

## 5. Integrations needing your credentials
| Integration | Status |
|---|---|
| Backblaze B2 | Implemented; needs secrets above |
| Firebase Auth/Firestore | Implemented; config unchanged |
| Payment provider (Chargily/other) | **Not implemented yet** — current flow is manual transfer + admin confirmation |
| Transactional email | Not implemented (Firebase sends only verification mail) |
| Newsletter | Not implemented |

## 6. Tests
`npm test` runs the Worker suite (mocked Google/Firestore/B2).
