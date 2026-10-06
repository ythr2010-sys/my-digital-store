// DigiVault Worker v2 — secure upload + entitlement-checked download for Backblaze B2.
// Secrets (wrangler secret put): B2_KEY_ID, B2_APPLICATION_KEY. Nothing secret lives in the repo.
const encoder = new TextEncoder();

// ---------- helpers ----------
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha256 = async v => hex(await crypto.subtle.digest('SHA-256', typeof v === 'string' ? encoder.encode(v) : v));
const hmac = (key, data) => crypto.subtle.sign('HMAC', key, typeof data === 'string' ? encoder.encode(data) : data);
const hmacKey = raw => crypto.subtle.importKey('raw', typeof raw === 'string' ? encoder.encode(raw) : raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
async function signingKey(secret, date, region) {
  let k = await hmacKey('AWS4' + secret);
  for (const part of [date, region, 's3', 'aws4_request']) k = await hmacKey(await hmac(k, part));
  return k;
}
const amzDate = (d = new Date()) => { const iso = d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'); return { full: iso, short: iso.slice(0, 8) }; };
const rfc3986 = value => encodeURIComponent(String(value)).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const encPath = p => String(p).split('/').map(rfc3986).join('/');
const canonicalQuery = params => [...params.entries()]
  .map(([k, v]) => [rfc3986(k), rfc3986(v)])
  .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))
  .map(([k, v]) => `${k}=${v}`).join('&');
const objectPath = (env, key) => `/${encodeURIComponent(env.B2_BUCKET_NAME)}/${encPath(key)}`;

// ---------- CORS (strict allow-list; never reflects arbitrary origins) ----------
function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
}
function corsFor(req, env) {
  const origin = req.headers.get('Origin') || '';
  const ok = allowedOrigins(env).includes(origin);
  const h = {
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Expose-Headers': 'ETag, Content-Length, Content-Type',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin'
  };
  if (ok) h['Access-Control-Allow-Origin'] = origin;
  return { headers: h, originAllowed: ok || !origin };
}
const json = (body, status, cors) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...cors }
});

// ---------- B2 / S3 signing ----------
async function signedRequest(env, method, path, query = '', payloadHash = '', extraHeaders = {}) {
  const endpoint = new URL(env.B2_ENDPOINT);
  const host = endpoint.host;
  const now = amzDate();
  const region = String(env.B2_REGION);
  const ph = payloadHash || await sha256('');
  const headersObj = {
    host,
    ...Object.fromEntries(Object.entries(extraHeaders).map(([k, v]) => [k.toLowerCase(), String(v)])),
    'x-amz-content-sha256': ph,
    'x-amz-date': now.full
  };
  const keys = Object.keys(headersObj).sort();
  const canonicalHeaders = keys.map(k => `${k}:${String(headersObj[k]).trim()}\n`).join('');
  const signedHeaders = keys.join(';');
  const canonical = `${method}\n${path}\n${query}\n${canonicalHeaders}\n${signedHeaders}\n${ph}`;
  const scope = `${now.short}/${region}/s3/aws4_request`;
  const sts = `AWS4-HMAC-SHA256\n${now.full}\n${scope}\n${await sha256(canonical)}`;
  const sig = hex(await hmac(await signingKey(env.B2_APPLICATION_KEY, now.short, region), sts));
  return {
    url: `${endpoint.origin}${path}${query ? `?${query}` : ''}`,
    headers: {
      ...headersObj,
      Authorization: `AWS4-HMAC-SHA256 Credential=${env.B2_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${sig}`
    }
  };
}
async function presign(env, method, key, queryParams = {}, expires = 300) {
  const host = new URL(env.B2_ENDPOINT).host, now = amzDate(), region = env.B2_REGION;
  const scope = `${now.short}/${region}/s3/aws4_request`;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(queryParams)) q.set(k, String(v));
  q.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
  q.set('X-Amz-Credential', `${env.B2_KEY_ID}/${scope}`);
  q.set('X-Amz-Date', now.full);
  q.set('X-Amz-Expires', String(expires));
  q.set('X-Amz-SignedHeaders', 'host');
  const path = objectPath(env, key);
  const canonical = `${method}\n${path}\n${canonicalQuery(q)}\nhost:${host}\n\nhost\nUNSIGNED-PAYLOAD`;
  const sts = `AWS4-HMAC-SHA256\n${now.full}\n${scope}\n${await sha256(canonical)}`;
  q.set('X-Amz-Signature', hex(await hmac(await signingKey(env.B2_APPLICATION_KEY, now.short, region), sts)));
  return `${env.B2_ENDPOINT}${path}?${canonicalQuery(q)}`;
}

// ---------- Firebase ID token verification (RS256, Google public keys; no secret needed) ----------
let jwksCache = { keys: null, exp: 0 };
const b64uToBytes = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), c => c.charCodeAt(0));
const b64uJson = s => JSON.parse(new TextDecoder().decode(b64uToBytes(s)));
async function getJwks() {
  if (jwksCache.keys && Date.now() < jwksCache.exp) return jwksCache.keys;
  const r = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  if (!r.ok) throw new Error('JWKS unavailable');
  const body = await r.json();
  const m = /max-age=(\d+)/.exec(r.headers.get('Cache-Control') || '');
  jwksCache = { keys: body.keys, exp: Date.now() + Math.min(Number(m?.[1] || 3600), 3600) * 1000 };
  return body.keys;
}
export async function verifyFirebaseToken(token, env) {
  try {
    const [h, p, s] = String(token).split('.');
    if (!h || !p || !s) return null;
    const header = b64uJson(h), claims = b64uJson(p), now = Math.floor(Date.now() / 1000);
    if (header.alg !== 'RS256' || !header.kid) return null;
    if (claims.aud !== env.FIREBASE_PROJECT_ID || claims.iss !== `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`) return null;
    if (!claims.sub || claims.exp <= now || claims.iat > now + 300 || claims.auth_time > now + 300) return null;
    const jwk = (await getJwks()).find(k => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64uToBytes(s), encoder.encode(`${h}.${p}`));
    return ok ? { uid: claims.sub, email: (claims.email || '').toLowerCase(), emailVerified: claims.email_verified === true } : null;
  } catch { return null; }
}

// ---------- Firestore REST using the CALLER's token (security rules decide access) ----------
async function fsGet(env, token, path) {
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 404 || r.status === 403) return null;
  if (!r.ok) throw new Error(`Firestore ${r.status}`);
  const doc = await r.json();
  const out = {};
  for (const [k, v] of Object.entries(doc.fields || {})) out[k] = v.stringValue ?? v.integerValue ?? v.doubleValue ?? v.booleanValue ?? v.timestampValue ?? null;
  return out;
}
async function fsCreate(env, token, collection, id, fields) {
  const enc = {};
  for (const [k, v] of Object.entries(fields)) enc[k] = typeof v === 'number' ? { integerValue: String(v) } : v === 'SERVER_TIME' ? { timestampValue: new Date().toISOString() } : { stringValue: String(v) };
  await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}?documentId=${encodeURIComponent(id)}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: enc })
  }).catch(() => {});
}

// ---------- upload validation ----------
const DEFAULT_EXT = 'zip,rar,7z,pdf,epub,mobi,txt,csv,doc,docx,xls,xlsx,ppt,pptx,key,pages,numbers,psd,ai,eps,indd,fig,sketch,xd,svg,ttf,otf,woff,woff2,mp3,wav,flac,aac,ogg,mp4,mov,webm,mkv,blend,fbx,obj,glb,gltf,stl,dmg,apk,json,notion,xlsm';
const IMAGE_TYPES = { 'image/jpeg': ['jpg', 'jpeg'], 'image/png': ['png'], 'image/webp': ['webp'], 'image/gif': ['gif'] };
const ext = name => (String(name).toLowerCase().match(/\.([a-z0-9]{1,8})$/) || [])[1] || '';
const safeName = name => String(name || 'file').normalize('NFKC').replace(/[^\p{L}\p{N}._ -]/gu, '_').replace(/\.{2,}/g, '.').slice(0, 180) || 'file';
const makeKey = (uid, name, kind) => `uploads/${uid}/${kind}/${crypto.randomUUID()}-${safeName(name)}`;
const xmlEscape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const keyOwnedBy = (uid, key) => typeof key === 'string' && key.length < 1024 && key.startsWith(`uploads/${uid}/`) && !key.includes('..');
const isImageKey = key => typeof key === 'string' && key.length < 1024 && /^uploads\/[A-Za-z0-9_-]+\/images\/[0-9a-f-]{36}-[^/]+$/.test(key);
const isProductKey = key => typeof key === 'string' && key.length < 1024 && /^uploads\/[A-Za-z0-9_-]+\/products\/[0-9a-f-]{36}-[^/]+$/.test(key);
export function validateUpload(env, data) {
  const size = Number(data.size);
  if (!Number.isFinite(size) || size <= 0) return 'Invalid file size';
  const e = ext(data.fileName);
  if (data.kind === 'image') {
    const max = Number(env.MAX_IMAGE_BYTES || 10 * 1024 ** 2);
    if (size > max) return `Image exceeds ${Math.round(max / 1024 ** 2)} MB`;
    const exts = IMAGE_TYPES[String(data.contentType).toLowerCase()];
    if (!exts || !exts.includes(e)) return 'Only JPG, PNG, WebP or GIF images are allowed';
    return null;
  }
  const max = Number(env.MAX_FILE_BYTES || 5 * 1024 ** 3);
  if (size > max) return `File exceeds ${Math.round(max / 1024 ** 3)} GB`;
  const allowed = String(env.ALLOWED_FILE_EXTENSIONS || DEFAULT_EXT).split(',').map(s => s.trim().toLowerCase());
  if (!allowed.includes(e)) return `File type .${e || '?'} is not allowed`;
  return null;
}

// ---------- best-effort rate limit (per isolate; add a Cloudflare Rate Limiting rule for hard limits) ----------
const hits = new Map();
function limited(id, max, windowMs) {
  const now = Date.now(), arr = (hits.get(id) || []).filter(t => now - t < windowMs);
  arr.push(now); hits.set(id, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < windowMs)) hits.delete(k);
  return arr.length > max;
}

// ---------- entitlement: may this caller download this product's file? ----------
export async function entitlement(env, token, user, productId) {
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(productId)) return null;
  const file = await fsGet(env, token, `product_files/${productId}`);   // rules: owner/admin/free/purchaser only
  const externalOk = !file?.storageKey && typeof file?.downloadUrl === 'string' && /^https:\/\//.test(file.downloadUrl);
  if (!file || (!externalOk && !isProductKey(file.storageKey))) return null;
  const product = await fsGet(env, token, `products/${productId}`);
  if (!product) return null;
  const owner = product.sellerEmail && user.emailVerified && String(product.sellerEmail).toLowerCase() === user.email;
  if (owner) return { file, reason: 'owner' };
  const purchase = await fsGet(env, token, `purchases/${user.uid}_${productId}`);
  if (purchase && purchase.productId === productId && purchase.buyerUid === user.uid) return { file, reason: 'purchase' };
  if (product.status === 'approved') {
    const free = await fsGet(env, token, `free_purchases/${user.uid}_${productId}`);
    if (free && free.productId === productId) return { file, reason: 'free' };
  }
  const admin = user.emailVerified && await fsGet(env, token, `admins/${user.email}`);
  if (admin) return { file, reason: 'admin' };
  return null;
}

// ---------- main handler ----------
export default {
  async fetch(req, env) {
    const { headers: cors, originAllowed } = corsFor(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: originAllowed ? 204 : 403, headers: cors });
    if (!originAllowed) return json({ error: 'Origin not allowed' }, 403, cors);
    const url = new URL(req.url);
    if (req.method === 'GET' && url.pathname === '/health') return json({ ok: true, service: 'my-digital-store', version: 'v3' }, 200, cors);
    for (const k of ['B2_KEY_ID', 'B2_APPLICATION_KEY', 'B2_ENDPOINT', 'B2_BUCKET_NAME', 'B2_REGION', 'FIREBASE_PROJECT_ID'])
      if (!env[k]) return json({ error: `Worker is not configured (${k} missing)` }, 503, cors);
    // Public image proxy — images only, strict key shape, forced image content-type.
    if (req.method === 'GET' && url.pathname === '/media') {
      const key = url.searchParams.get('key') || '';
      if (!isImageKey(key)) return json({ error: 'Invalid image key' }, 400, cors);
      const rr = await fetch(await presign(env, 'GET', key, {}, 120));
      const type = (rr.headers.get('Content-Type') || '').toLowerCase();
      if (!rr.ok || !Object.keys(IMAGE_TYPES).includes(type)) return new Response('Not found', { status: 404, headers: cors });
      return new Response(rr.body, { status: 200, headers: { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'", 'Cache-Control': 'public, max-age=3600', ...cors } });
    }
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);

    const auth = req.headers.get('Authorization') || '', token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) return json({ error: 'Authentication required' }, 401, cors);
    const user = await verifyFirebaseToken(token, env);
    if (!user) return json({ error: 'Invalid or expired session' }, 401, cors);
    if (limited(`${user.uid}:${url.pathname}`, url.pathname === '/multipart/sign-part' ? 600 : 30, 60_000)) return json({ error: 'Too many requests' }, 429, cors);
    const data = await req.json().catch(() => null);
    if (!data || typeof data !== 'object') return json({ error: 'Invalid JSON' }, 400, cors);
    const partSize = Number(env.PART_SIZE_BYTES || 52428800);

    try {
      if (url.pathname === '/multipart/initiate') {
        const err = validateUpload(env, data);
        if (err) return json({ error: err }, 400, cors);
        if (limited(`${user.uid}:init`, Number(env.MAX_UPLOADS_PER_HOUR || 40), 3_600_000)) return json({ error: 'Upload limit reached, try again later' }, 429, cors);
        const key = makeKey(user.uid, data.fileName, data.kind === 'image' ? 'images' : 'products');
        const r = await signedRequest(env, 'POST', objectPath(env, key), 'uploads=', await sha256(''), { 'content-type': String(data.contentType || 'application/octet-stream') });
        const rr = await fetch(r.url, { method: 'POST', headers: r.headers }), text = await rr.text();
        if (!rr.ok) return json({ error: 'Storage rejected the upload request' }, 502, cors);
        const uploadId = (text.match(/<UploadId>([^<]+)<\/UploadId>/) || [])[1];
        if (!uploadId) return json({ error: 'Storage did not return an upload id' }, 502, cors);
        return json({ key, uploadId, partSize }, 200, cors);
      }
      if (url.pathname === '/multipart/sign-part') {
        if (!keyOwnedBy(user.uid, data.key)) return json({ error: 'Invalid object key' }, 403, cors);
        const part = Number(data.partNumber);
        if (!Number.isInteger(part) || part < 1 || part > 10000 || !data.uploadId) return json({ error: 'Invalid part' }, 400, cors);
        return json({ url: await presign(env, 'PUT', data.key, { partNumber: String(part), uploadId: String(data.uploadId) }, 900) }, 200, cors);
      }
      if (url.pathname === '/multipart/complete') {
        if (!keyOwnedBy(user.uid, data.key)) return json({ error: 'Invalid object key' }, 403, cors);
        if (!Array.isArray(data.parts) || !data.parts.length || data.parts.length > 10000) return json({ error: 'Invalid completion data' }, 400, cors);
        const parts = data.parts.map(p => ({ n: Number(p.partNumber), etag: String(p.etag || '').replace(/[^A-Za-z0-9"-]/g, '') })).sort((a, b) => a.n - b.n);
        if (parts.some(p => !Number.isInteger(p.n) || p.n < 1 || p.n > 10000 || !p.etag)) return json({ error: 'Invalid part list' }, 400, cors);
        const xml = `<CompleteMultipartUpload>${parts.map(p => `<Part><PartNumber>${p.n}</PartNumber><ETag>${xmlEscape(p.etag)}</ETag></Part>`).join('')}</CompleteMultipartUpload>`;
        const r = await signedRequest(env, 'POST', objectPath(env, data.key), `uploadId=${encodeURIComponent(data.uploadId)}`, await sha256(xml), { 'content-type': 'application/xml' });
        const rr = await fetch(r.url, { method: 'POST', headers: r.headers, body: xml });
        if (!rr.ok) return json({ error: 'Storage could not finish the upload' }, 502, cors);
        // Product files are NEVER given a long-lived URL; the client stores only storageKey.
        const image = isImageKey(data.key);
        return json({ ok: true, storageKey: data.key, deliveryType: 'b2-worker', ...(image ? { downloadUrl: `${url.origin}/media?key=${encodeURIComponent(data.key)}` } : {}) }, 200, cors);
      }
      if (url.pathname === '/multipart/abort') {
        if (!keyOwnedBy(user.uid, data.key) || !data.uploadId) return json({ error: 'Invalid object key' }, 403, cors);
        const r = await signedRequest(env, 'DELETE', objectPath(env, data.key), `uploadId=${encodeURIComponent(data.uploadId)}`);
        await fetch(r.url, { method: 'DELETE', headers: r.headers });
        return json({ ok: true }, 200, cors);
      }
      if (url.pathname === '/download' || url.pathname === '/signed-download') {
        // Entitlement is decided from Firestore (via the caller's own token + security rules), never from the client.
        const grant = await entitlement(env, token, user, String(data.productId || ''));
        if (!grant) return json({ error: 'You do not have access to this file' }, 403, cors);
        if (limited(`${user.uid}:dl`, 30, 3_600_000)) return json({ error: 'Download limit reached, try again later' }, 429, cors);
        const fileName = safeName(grant.file.fileName || 'download');
        const external = !grant.file.storageKey;
        const signed = external ? grant.file.downloadUrl : await presign(env, 'GET', grant.file.storageKey, { 'response-content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}` }, 300);
        await fsCreate(env, token, 'download_logs', crypto.randomUUID(), { uid: user.uid, productId: String(data.productId), reason: grant.reason, createdAt: 'SERVER_TIME' });
        return json({ url: signed, expiresIn: external ? null : 300, fileName }, 200, cors);
      }
      return json({ error: 'Unknown endpoint' }, 404, cors);
    } catch (e) {
      console.error(e);
      return json({ error: 'Server error' }, 500, cors);
    }
  }
};
