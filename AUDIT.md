# DigiVault — Audit & Hardening Report (Round 1)

Scope read: every file in `DigiVault_Fixed_Clean.zip` (14 HTML pages, 5 JS files, Worker, rules, configs, notes; ~4,500 lines).
Existing architecture preserved: static HTML/JS → Firebase Auth + Firestore → Cloudflare Worker → Backblaze B2 (multipart upload).

## Existing inventory
Pages: index, shop, product, cart, checkout, profile (purchases), notifications, login, signup, contact, add-product, edit-product, my-products (seller dashboard), admin, privacy, terms, payment-methods.
Collections in use: products, product_files, orders, free_purchases, reviews, comments, notifications, users, admins, contact_messages, visits.
Payment today: **manual** BaridiMob/CCP transfer + transaction number, admin confirms by hand. No payment provider.
Not present at all: categories collection, seller profiles/onboarding, coupons, refunds, wishlist, search beyond client filtering, SEO files, dark/light theme, i18n, audit logs.

## Findings and status

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | Critical | **Checkout was broken**: `user` was undefined in `checkout.html` (ReferenceError) so paid orders could not be created and free items in the cart silently fell through to payment. | Fixed |
| 2 | Critical | **Stored XSS → admin takeover**: admin "view file" used `document.write` into an `about:blank` window (same origin as admin) with seller-controlled `contentType`/`deliveryType`/URL unescaped. | Fixed (removed; uses a short-lived link) |
| 3 | Critical | **No buyer download path existed.** Worker only signed keys under the *uploader's* uid; buyers got a 1-hour pre-signed URL that was stored in Firestore (`product_files.downloadUrl`, copied into `orders.deliveryLinks`). Links expired after 1 h (downloads silently broke) and were long-lived secrets in documents. | Fixed: Worker `POST /download` checks entitlement server-side and mints a 5-min link; no URLs stored |
| 4 | Critical | **Fake "verified purchase" reviews**: rules let any signed-in user create unlimited reviews with any rating for any product; purchase check was frontend-only. | Fixed (entitlement doc + deterministic id + rating 1–5 enforced in rules) |
| 5 | Critical | **Placeholder bank numbers shown to real customers** (`0079999…`, `12345678 Clé 99`) plus account number leaked to a third-party QR service. | Fixed: numbers come from admin-edited `settings/payment`; checkout is disabled with a setup warning until configured; QR removed |
| 6 | High | Admin identity trusted email without `email_verified`; no verification flow existed. | Fixed in rules + verification email/banner added |
| 7 | High | Worker CORS reflected any `Origin`; `ALLOWED_ORIGIN` var was never used. | Fixed (strict allow-list) |
| 8 | High | Worker accepted any size/type from any signed-in user (up to a declared 500 GB), no throttling → storage-cost abuse; any file served as "image" from the Worker origin. | Fixed (size/extension/MIME allow-lists, per-user throttles, image-only proxy with `nosniff`/CSP). Seller gating is Round 2 |
| 9 | High | Orders trusted client-side prices from `localStorage`; seller could write arbitrary product fields (e.g. rating/featured). | Partly fixed: checkout re-reads live prices, rules allow-list fields, admin completion compares to live prices. Full server-side order creation arrives with the payment provider |
| 10 | High | Comments: product seller could rewrite *any field* of any buyer's comment. | Fixed (seller may only set `reply`) |
| 11 | Medium | `contact_messages` and `visits` were `create: if true` with no validation → spam/cost abuse. | Fixed (field allow-list, size limits) |
| 12 | Medium | Admin approve/reject/delete/complete left no trail. | Fixed: `audit_logs` (create-only) |
| 13 | Medium | Token verification relied on a network call per request. | Replaced by local RS256 verification against Google keys |
| 14 | Medium | `storage.rules` referenced Firebase Storage, which the app does not use. | Moved to `legacy/` |
| 15 | Medium | Seller **email is stored on the public product document** (anyone can read it). | **Open** — needs `sellerUid` + public seller profile (Round 2) |
| 16 | Medium | Admin delete removes Firestore docs but not the B2 object (orphaned paid files). | **Open** (Round 2) |
| 17 | Medium | Notifications are keyed by email (and written from the client). | Reads now require a verified email; move to uid-keyed server-written notifications in Round 2 |
| 18 | Low | Every page duplicates 100+ lines of CSS; `site-enhance.js` injects floating buttons that overlap content; Arabic-only; no SEO files. | **Open** — design system / i18n / SEO rounds |

## Verified vs. not verified
- **Verified by automated tests** (`npm test`, 14 passing): Worker CORS, token forgery/expiry/audience, entitlement matrix for `/download`, upload validation, key-ownership checks, image proxy, throttling.
- **Syntax-checked**: every inline module script in every page.
- **NOT verified**: `firestore.rules` have not been run in the Firebase emulator (it cannot be downloaded in this environment). Treat them as reviewed but untested until you run the checklist in `SETUP.md`. Nothing was tested against your live Firebase/B2 accounts.

## Roadmap (remaining phases)
Round 2: seller onboarding + public seller profiles (`sellerUid`), categories collection + admin CRUD, uid-keyed notifications, B2 cleanup on delete, seller dashboard stats from real data.
Round 3: payment provider (Algeria: Chargily Pay is the leading option — webhook-verified, needs Worker service-account access to Firestore), coupons, refunds, support tickets.
Round 4: design system (shared CSS, light/dark, RTL+LTR i18n), homepage sections, product page, search/filters.
Round 5: SEO (sitemap, robots, meta, JSON-LD), accessibility pass, performance.
