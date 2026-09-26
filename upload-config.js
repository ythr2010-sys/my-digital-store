// DigiVault v15 - upload service configuration
// بعد نشر Worker، ضع رابطه هنا. لا تضع أي مفاتيح Cloudflare في هذا الملف.
export const DIGIVAULT_UPLOAD_WORKER = "https://YOUR-DIGIVAULT-UPLOAD-WORKER.workers.dev";

export const DIGIVAULT_UPLOAD_ENABLED =
  /^https:\/\/(?!YOUR-DIGIVAULT-UPLOAD-WORKER)/i.test(DIGIVAULT_UPLOAD_WORKER);

export const DIGIVAULT_UPLOAD_MAX_BYTES = 5 * 1024 * 1024 * 1024 * 1024; // 5 TiB (حد R2 النظري)
export const DIGIVAULT_SINGLE_UPLOAD_LIMIT = 5 * 1024 * 1024 * 1024; // 5 GiB
export const DIGIVAULT_MULTIPART_PART_SIZE = 50 * 1024 * 1024; // 50 MiB
export const DIGIVAULT_MULTIPART_CONCURRENCY = 2;
