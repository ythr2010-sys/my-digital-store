import { UPLOAD_WORKER_URL, R2_PUBLIC_BASE_URL, UPLOAD_LIMITS } from './upload-config.js';

function cleanBaseUrl() { return String(R2_PUBLIC_BASE_URL || '').replace(/\/$/, ''); }
function publicUrl(key) { return `${cleanBaseUrl()}/${String(key).split('/').map(encodeURIComponent).join('/')}`; }
function assertConfigured() {
  if (!UPLOAD_WORKER_URL || UPLOAD_WORKER_URL.includes('YOUR-DIGIVAULT')) throw new Error('لم يتم إعداد رابط Upload Worker بعد. عدّل upload-config.js.');
  if (!R2_PUBLIC_BASE_URL || R2_PUBLIC_BASE_URL.includes('YOUR-R2-PUBLIC-DOMAIN')) throw new Error('لم يتم إعداد نطاق R2 العام بعد. عدّل upload-config.js.');
}
async function workerJson(path, body, user) {
  const token = await user.getIdToken();
  const res = await fetch(`${UPLOAD_WORKER_URL.replace(/\/$/, '')}${path}`, {
    method: 'POST', headers: {'Content-Type':'application/json', Authorization:`Bearer ${token}`}, body: JSON.stringify(body)
  });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.error || `Upload Worker error (${res.status})`);
  return data;
}
function partCount(size, partSize) { return Math.ceil(size / partSize); }
async function uploadPart(url, blob, retries=3) {
  let last;
  for (let attempt=0; attempt<retries; attempt++) {
    try {
      const res = await fetch(url, {method:'PUT', body:blob});
      if (!res.ok) throw new Error(`فشل رفع جزء الملف (${res.status})`);
      const etag = res.headers.get('ETag') || res.headers.get('etag');
      return etag ? etag.replace(/^"|"$/g,'') : null;
    } catch(e) { last=e; await new Promise(r=>setTimeout(r, 700*(attempt+1))); }
  }
  throw last || new Error('فشل رفع جزء من الملف.');
}

export async function uploadToR2({user, file, kind='product', onProgress=()=>{}}) {
  assertConfigured();
  if (!file) throw new Error('لم يتم اختيار ملف.');
  const isImage = kind === 'image';
  const max = isImage ? UPLOAD_LIMITS.imageMaxBytes : UPLOAD_LIMITS.productFileMaxBytes;
  if (file.size > max) throw new Error(isImage ? 'حجم الصورة أكبر من الحد المسموح (10 MB).' : 'حجم الملف يتجاوز حد R2 المعلن.');
  if (isImage && !String(file.type || '').startsWith('image/')) throw new Error('الملف المختار ليس صورة.');

  const init = await workerJson('/multipart/initiate', {
    fileName:file.name, contentType:file.type || 'application/octet-stream', size:file.size, kind
  }, user);
  const partSize = init.partSize || UPLOAD_LIMITS.partSizeBytes;
  const count = partCount(file.size, partSize);
  if (count > 10000) throw new Error('الملف يحتاج أكثر من 10,000 جزء. استخدم ملفاً أصغر أو ارفع partSize في Worker.');
  const parts = [];
  let completed = 0;
  const queue = Array.from({length:count}, (_,i)=>i+1);
  const worker = async () => {
    while(queue.length) {
      const partNumber = queue.shift();
      const start = (partNumber-1)*partSize;
      const end = Math.min(file.size, start+partSize);
      const signed = await workerJson('/multipart/sign-part', {key:init.key, uploadId:init.uploadId, partNumber}, user);
      const etag = await uploadPart(signed.url, file.slice(start,end));
      if (!etag) throw new Error('خادم R2 لم يعُد ETag للجزء المرفوع. تأكد من إعداد CORS.');
      parts.push({partNumber, etag});
      completed++;
      onProgress(Math.round(completed/count*100));
    }
  };
  try {
    await Promise.all(Array.from({length:Math.min(UPLOAD_LIMITS.concurrency,count)}, worker));
    parts.sort((a,b)=>a.partNumber-b.partNumber);
    const done = await workerJson('/multipart/complete', {key:init.key, uploadId:init.uploadId, parts}, user);
    return { key:init.key, fileName:file.name, contentType:file.type || 'application/octet-stream', size:file.size, downloadUrl:done.downloadUrl || publicUrl(init.key) };
  } catch (e) {
    try { await workerJson('/multipart/abort', {key:init.key, uploadId:init.uploadId}, user); } catch {}
    throw e;
  }
}

export const uploadProductFile = opts => uploadToR2({...opts, kind:'product'});
export const uploadProductImage = opts => uploadToR2({...opts, kind:'image'});
