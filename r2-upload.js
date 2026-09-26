// DigiVault v15 - browser-side R2 uploader
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";
import {
  DIGIVAULT_UPLOAD_WORKER,
  DIGIVAULT_UPLOAD_ENABLED,
  DIGIVAULT_MULTIPART_PART_SIZE,
  DIGIVAULT_MULTIPART_CONCURRENCY
} from "./upload-config.js";

const DEFAULT_TYPE = "application/octet-stream";

function encodePath(key) {
  return String(key).split("/").map(encodeURIComponent).join("/");
}

function r2ObjectUrl(accountId, bucket, key) {
  return `https://${accountId}.r2.cloudflarestorage.com/${encodeURIComponent(bucket)}/${encodePath(key)}`;
}

function xmlEscape(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function parseXmlText(text, tag) {
  const match = String(text).match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? match[1] : "";
}

function parseError(text) {
  const code = parseXmlText(text, "Code");
  const message = parseXmlText(text, "Message");
  return code ? `${code}${message ? `: ${message}` : ""}` : `HTTP ${text}`;
}

async function getCredentials(user, file) {
  if (!DIGIVAULT_UPLOAD_ENABLED) {
    throw new Error("خدمة الرفع غير مفعّلة بعد. انشر Upload Worker ثم ضع رابطه في upload-config.js.");
  }
  const token = await user.getIdToken();
  const response = await fetch(`${DIGIVAULT_UPLOAD_WORKER.replace(/\/$/, "")}/credentials`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type || DEFAULT_TYPE
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "تعذر الحصول على صلاحية رفع آمنة.");
  return data;
}

function makeClient(creds) {
  return new AwsClient({
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    sessionToken: creds.sessionToken,
    service: "s3",
    region: "auto",
    retries: 3
  });
}

async function request(client, url, init = {}) {
  const response = await client.fetch(url, init);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(parseError(body || String(response.status)));
  }
  return response;
}

async function multipartUpload({ client, objectUrl, file, contentType, onProgress }) {
  const createUrl = `${objectUrl}?uploads`;
  const createResponse = await request(client, createUrl, {
    method: "POST",
    headers: { "Content-Type": contentType }
  });
  const createXml = await createResponse.text();
  const uploadId = parseXmlText(createXml, "UploadId");
  if (!uploadId) throw new Error("تعذر إنشاء جلسة رفع متعددة الأجزاء.");

  const partSize = Math.max(5 * 1024 * 1024, DIGIVAULT_MULTIPART_PART_SIZE);
  const partCount = Math.ceil(file.size / partSize);
  if (partCount > 10000) throw new Error("الملف كبير جداً لهذا الإعداد. زد حجم الجزء في upload-config.js.");

  const parts = new Array(partCount);
  let nextPart = 1;
  let completed = 0;

  const worker = async () => {
    while (true) {
      const partNumber = nextPart++;
      if (partNumber > partCount) return;
      const start = (partNumber - 1) * partSize;
      const end = Math.min(start + partSize, file.size);
      const chunk = file.slice(start, end);
      // aws4fetch signs ArrayBuffer bodies; only the current part is materialized in memory.
      const chunkBuffer = await chunk.arrayBuffer();
      const partUrl = `${objectUrl}?partNumber=${partNumber}&uploadId=${encodeURIComponent(uploadId)}`;
      const response = await request(client, partUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: chunkBuffer
      });
      const etag = response.headers.get("ETag") || response.headers.get("etag");
      if (!etag) throw new Error(`لم يرجع التخزين ETag للجزء ${partNumber}.`);
      parts[partNumber - 1] = { partNumber, etag };
      completed++;
      onProgress?.(Math.round((completed / partCount) * 100));
    }
  };

  try {
    const concurrency = Math.min(DIGIVAULT_MULTIPART_CONCURRENCY, partCount);
    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    const completeXml = `<CompleteMultipartUpload>${parts.map(part =>
      `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${xmlEscape(part.etag)}</ETag></Part>`
    ).join("")}</CompleteMultipartUpload>`;

    await request(client, `${objectUrl}?uploadId=${encodeURIComponent(uploadId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/xml" },
      body: completeXml
    });
    onProgress?.(100);
  } catch (error) {
    try {
      await client.fetch(`${objectUrl}?uploadId=${encodeURIComponent(uploadId)}`, { method: "DELETE" });
    } catch {}
    throw error;
  }
}

export async function uploadProductFile({ user, file, onProgress }) {
  if (!user || !file) throw new Error("يجب تسجيل الدخول واختيار ملف.");
  if (file.size <= 0) throw new Error("الملف فارغ.");
  if (file.size > 5 * 1024 * 1024 * 1024 * 1024) throw new Error("الحد الأقصى النظري لملف R2 هو 5 TiB.");

  const creds = await getCredentials(user, file);
  const client = makeClient(creds);
  const objectUrl = r2ObjectUrl(creds.accountId, creds.bucket, creds.key);
  const contentType = file.type || DEFAULT_TYPE;

  onProgress?.(0);
  // v15 uses multipart upload for product files so the browser never has to
  // materialize the entire file. This is the reliable path for large files.
  await multipartUpload({ client, objectUrl, file, contentType, onProgress });

  return {
    key: creds.key,
    fileName: file.name,
    contentType,
    size: file.size,
    // The bucket should use a production custom domain for buyer downloads.
    downloadUrl: creds.publicBaseUrl
      ? `${String(creds.publicBaseUrl).replace(/\/$/, "")}/${encodePath(creds.key)}`
      : ""
  };
}
