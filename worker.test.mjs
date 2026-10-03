// Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';

const env = {
  FIREBASE_PROJECT_ID: 'proj', ALLOWED_ORIGINS: 'https://shop.example',
  B2_KEY_ID: 'kid', B2_APPLICATION_KEY: 'secret', B2_ENDPOINT: 'https://s3.eu-central-003.backblazeb2.com',
  B2_BUCKET_NAME: 'bucket', B2_REGION: 'eu-central-003'
};
const b64u = o => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
async function token(over = {}, signer = privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const claims = { aud: 'proj', iss: 'https://securetoken.google.com/proj', sub: 'u1', email: 'buyer@x.com', email_verified: true, iat: now - 10, auth_time: now - 10, exp: now + 3600, ...over };
  const h = b64u({ alg: 'RS256', kid: 'k1', typ: 'JWT' }), p = b64u(claims);
  const sig = Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', signer, new TextEncoder().encode(`${h}.${p}`))).toString('base64url');
  return `${h}.${p}.${sig}`;
}
// ---- fake Firestore + B2 + JWKS ----
let db = {};
const fsDoc = o => ({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { stringValue: String(v) }])) });
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.includes('securetoken@system.gserviceaccount.com')) return new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'Cache-Control': 'max-age=60' } });
  if (url.startsWith('https://firestore.googleapis.com')) {
    if (init.method === 'POST') { db.__logs = (db.__logs || 0) + 1; return new Response('{}'); }
    const path = url.split('/documents/')[1];
    if (!init.headers?.Authorization?.startsWith('Bearer ')) return new Response('', { status: 401 });
    return db[path] ? new Response(JSON.stringify(fsDoc(db[path]))) : new Response('', { status: 404 });
  }
  if (url.includes('backblazeb2.com')) {
    if (url.includes('uploads=')) return new Response('<InitiateMultipartUploadResult><UploadId>UP1</UploadId></InitiateMultipartUploadResult>');
    if (url.includes('/uploads/evil/images/')) return new Response('<script>', { headers: { 'Content-Type': 'text/html' } });
    return new Response('x', { headers: { 'Content-Type': 'image/png' } });
  }
  throw new Error('unexpected fetch ' + url);
};
const call = (path, body, tok, origin = 'https://shop.example') => worker.fetch(new Request('https://w.example' + path, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body)
}), env);
const KEY = 'uploads/seller1/products/123e4567-e89b-12d3-a456-426614174000-book.zip';
const reset = () => { db = {
  'product_files/prod1': { storageKey: KEY, fileName: 'book.zip', sellerEmail: 'seller@x.com' },
  'products/prod1': { sellerEmail: 'seller@x.com', status: 'approved', price: '5' }
}; };

test('CORS: unknown origin refused, allowed origin echoed', async () => {
  reset();
  assert.equal((await call('/download', {}, null, 'https://evil.example')).status, 403);
  const r = await call('/download', { productId: 'prod1' }, null);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://shop.example');
  assert.equal(r.status, 401);
});
test('auth: forged, wrong-audience and expired tokens are rejected', async () => {
  reset();
  const other = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])).privateKey;
  assert.equal((await call('/download', { productId: 'prod1' }, await token({}, other))).status, 401);
  assert.equal((await call('/download', { productId: 'prod1' }, await token({ aud: 'other' }))).status, 401);
  assert.equal((await call('/download', { productId: 'prod1' }, await token({ exp: 1 }))).status, 401);
});
test('download: no purchase => 403 (paid file never leaks)', async () => {
  reset();
  const r = await call('/download', { productId: 'prod1' }, await token());
  assert.equal(r.status, 403);
  assert.ok(!(await r.text()).includes('X-Amz'));
});
test('download: another buyer\'s purchase doc does not grant access', async () => {
  reset(); db['purchases/u1_prod1'] = { productId: 'prod1', buyerUid: 'someone-else' };
  assert.equal((await call('/download', { productId: 'prod1' }, await token())).status, 403);
});
test('download: verified purchase => short-lived signed URL + log', async () => {
  reset(); db['purchases/u1_prod1'] = { productId: 'prod1', buyerUid: 'u1' };
  const r = await call('/download', { productId: 'prod1' }, await token());
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.match(j.url, /X-Amz-Signature=/); assert.match(j.url, /X-Amz-Expires=300/); assert.match(j.url, /response-content-disposition/);
  assert.ok(db.__logs >= 1);
});
test('download: free claim only counts while product is approved & claim exists', async () => {
  reset(); db['free_purchases/u1_prod1'] = { productId: 'prod1', buyerUid: 'u1' };
  assert.equal((await call('/download', { productId: 'prod1' }, await token())).status, 200);
  db['products/prod1'].status = 'rejected';
  assert.equal((await call('/download', { productId: 'prod1' }, await token())).status, 403);
});
test('download: seller needs a VERIFIED email to claim ownership', async () => {
  reset();
  assert.equal((await call('/download', { productId: 'prod1' }, await token({ sub: 's1', email: 'seller@x.com', email_verified: false }))).status, 403);
  assert.equal((await call('/download', { productId: 'prod1' }, await token({ sub: 's1', email: 'seller@x.com' }))).status, 200);
});
test('download: malformed product ids rejected', async () => {
  reset();
  assert.equal((await call('/download', { productId: '../admins/x' }, await token())).status, 403);
});
test('upload validation: types, sizes, MIME', async () => {
  reset(); const t = await token();
  assert.equal((await call('/multipart/initiate', { fileName: 'setup.exe', contentType: 'application/x-msdownload', size: 1000, kind: 'product' }, t)).status, 400);
  assert.equal((await call('/multipart/initiate', { fileName: 'a.html', contentType: 'text/html', size: 10, kind: 'product' }, t)).status, 400);
  assert.equal((await call('/multipart/initiate', { fileName: 'a.png', contentType: 'text/html', size: 10, kind: 'image' }, t)).status, 400);
  assert.equal((await call('/multipart/initiate', { fileName: 'a.png', contentType: 'image/png', size: 99 * 1024 ** 2, kind: 'image' }, t)).status, 400);
  assert.equal((await call('/multipart/initiate', { fileName: 'a.zip', contentType: 'application/zip', size: 6 * 1024 ** 3, kind: 'product' }, t)).status, 400);
  const ok = await call('/multipart/initiate', { fileName: '../../etc/pa ss.zip', contentType: 'application/zip', size: 1000, kind: 'product' }, t);
  assert.equal(ok.status, 200);
  const j = await ok.json(); assert.match(j.key, /^uploads\/u1\/products\/[0-9a-f-]{36}-[^/]+$/); assert.ok(!j.key.includes('..'));
});
test('upload: cannot sign parts / complete for another user\'s key', async () => {
  reset(); const t = await token();
  assert.equal((await call('/multipart/sign-part', { key: 'uploads/other/products/x', uploadId: 'u', partNumber: 1 }, t)).status, 403);
  assert.equal((await call('/multipart/complete', { key: 'uploads/u1/../other/x', uploadId: 'u', parts: [{ partNumber: 1, etag: 'a' }] }, t)).status, 403);
});
test('upload complete never returns a long-lived URL for product files', async () => {
  reset(); const t = await token();
  const key = 'uploads/u1/products/123e4567-e89b-12d3-a456-426614174000-a.zip';
  const r = await call('/multipart/complete', { key, uploadId: 'u', parts: [{ partNumber: 1, etag: '"abc"' }] }, t);
  const j = await r.json(); assert.equal(r.status, 200); assert.equal(j.downloadUrl, undefined); assert.equal(j.storageKey, key);
});
test('/media: only image keys, forced image content-type', async () => {
  reset();
  const get = key => worker.fetch(new Request('https://w.example/media?key=' + encodeURIComponent(key), { headers: { Origin: 'https://shop.example' } }), env);
  assert.equal((await get(KEY)).status, 400);
  assert.equal((await get('uploads/u1/images/../products/x')).status, 400);
  assert.equal((await get('uploads/evil/images/123e4567-e89b-12d3-a456-426614174000-x.png')).status, 404);
  const ok = await get('uploads/u1/images/123e4567-e89b-12d3-a456-426614174000-x.png');
  assert.equal(ok.status, 200); assert.equal(ok.headers.get('X-Content-Type-Options'), 'nosniff');
});
test('rate limit: upload initiations are throttled', async () => {
  reset(); const t = await token({ sub: 'spammer' }); let last;
  for (let i = 0; i < 45; i++) last = await call('/multipart/initiate', { fileName: 'a.zip', contentType: 'application/zip', size: 10, kind: 'product' }, t);
  assert.equal(last.status, 429);
});
test('worker refuses to run without configuration', async () => {
  const r = await worker.fetch(new Request('https://w.example/download', { method: 'POST', headers: { Origin: 'https://shop.example' } }), { ALLOWED_ORIGINS: 'https://shop.example' });
  assert.equal(r.status, 503);
});
