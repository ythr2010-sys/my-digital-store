// DigiVault v16 storage client.
// The filename is kept for compatibility with v15 imports, but storage is now Backblaze B2 via the Worker.
import { UPLOAD_WORKER_URL, UPLOAD_LIMITS } from './upload-config.js';

function assertConfigured() {
  if (!UPLOAD_WORKER_URL || UPLOAD_WORKER_URL.includes('YOUR-DIGIVAULT-UPLOAD-WORKER')) {
    throw new Error('لم يتم إعداد رابط Storage Worker بعد. عدّل upload-config.js.');
  }
}

async function workerJson(path, body, user) {
  const token = await user.getIdToken();
  const res = await fetch(`${UPLOAD_WORKER_URL.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Storage Worker error (${res.status})`);
  return data;
}
function partCount(size, partSize) { return Math.ceil(size / partSize); }
async function uploadPart(url, blob, retries = 3) {
  let last;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, { method: 'PUT', body: blob });
      if (!res.ok) throw new Error(`فشل رفع جزء الملف (${res.status})`);
      const etag = res.headers.get('ETag') || res.headers.get('etag');
      return etag ? etag.replace(/^"|"$/g, '') : null;
    } catch (e) {
      last = e;
      await new Promise(r => setTimeout(r, 700 * (attempt + 1)));
    }
  }
  throw last || new Error('فشل رفع جزء من الملف.');
}

export async function uploadToR2({ user, file, kind = 'product', onProgress = () => {} }) {
  assertConfigured();
  if (!file) throw new Error('لم يتم اختيار ملف.');
  const isImage = kind === 'image';
  const max = isImage ? UPLOAD_LIMITS.imageMaxBytes : UPLOAD_LIMITS.productFileMaxBytes;
  if (file.size > max) throw new Error(isImage ? 'حجم الصورة أكبر من الحد المسموح (10 MB).' : 'حجم الملف يتجاوز الحد المسموح.');
  if (isImage && !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) throw new Error('الصور المسموحة: JPG أو PNG أو WebP أو GIF فقط.');

  const init = await workerJson('/multipart/initiate', {
    fileName: file.name,
    contentType: file.type || 'application/octet-stream',
    size: file.size,
    kind
  }, user);
  const partSize = Number(init.partSize || UPLOAD_LIMITS.partSizeBytes);
  const count = partCount(file.size, partSize);
  if (count > 10000) throw new Error('الملف يحتاج أكثر من 10,000 جزء.');
  const parts = [];
  let completed = 0;
  const queue = Array.from({ length: count }, (_, i) => i + 1);
  const worker = async () => {
    while (queue.length) {
      const partNumber = queue.shift();
      const start = (partNumber - 1) * partSize;
      const end = Math.min(file.size, start + partSize);
      const signed = await workerJson('/multipart/sign-part', { key: init.key, uploadId: init.uploadId, partNumber }, user);
      const etag = await uploadPart(signed.url, file.slice(start, end));
      if (!etag) throw new Error('لم يعد خادم التخزين ETag للجزء المرفوع.');
      parts.push({ partNumber, etag });
      completed++;
      onProgress(Math.round(completed / count * 100));
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(UPLOAD_LIMITS.concurrency, count) }, worker));
    parts.sort((a, b) => a.partNumber - b.partNumber);
    const done = await workerJson('/multipart/complete', { key: init.key, uploadId: init.uploadId, parts, kind }, user);
    return {
      key: init.key,
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      size: file.size,
      downloadUrl: done.downloadUrl || '',   // images only; product files are delivered via getProductDownloadUrl()
      deliveryType: 'b2-worker'
    };
  } catch (e) {
    try { await workerJson('/multipart/abort', { key: init.key, uploadId: init.uploadId }, user); } catch {}
    throw e;
  }
}
export const uploadProductFile = opts => uploadToR2({ ...opts, kind: 'product' });
export const uploadProductImage = opts => uploadToR2({ ...opts, kind: 'image' });

// Asks the Worker for a fresh, short-lived link. The Worker re-checks the purchase/ownership server-side.
export async function getProductDownloadUrl({ user, productId }) {
  assertConfigured();
  if (!productId) throw new Error('معرّف المنتج غير موجود.');
  const data = await workerJson('/download', { productId }, user);
  if (!data.url) throw new Error('تعذر إنشاء رابط تنزيل.');
  return data;
}
export async function downloadProduct({ user, productId }) {
  const { url } = await getProductDownloadUrl({ user, productId });
  window.location.assign(url);
}
