// DigiVault v16 - Backblaze B2 upload configuration.
// Public Worker URL only; never place B2 credentials in frontend files.
export const UPLOAD_WORKER_URL = 'https://my-digital-store.ythr2010.workers.dev';

export const UPLOAD_LIMITS = {
  productFileMaxBytes: 500 * 1024 ** 3,
  imageMaxBytes: 10 * 1024 ** 2,
  maxImages: 8,
  partSizeBytes: 50 * 1024 ** 2,
  concurrency: 2
};
