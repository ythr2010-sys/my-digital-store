// DigiVault v15 upload configuration.
// Set this to the deployed Cloudflare Worker URL before publishing.
export const UPLOAD_WORKER_URL = 'https://YOUR-DIGIVAULT-UPLOAD-WORKER.workers.dev';

// Must point to the public R2 custom domain (recommended) or r2.dev domain.
// Example: https://files.example.com
export const R2_PUBLIC_BASE_URL = 'https://YOUR-R2-PUBLIC-DOMAIN.example.com';

export const UPLOAD_LIMITS = {
  productFileMaxBytes: 500 * 1024 ** 3, // Current UI limit with 50 MiB parts and max 10,000 parts
  imageMaxBytes: 10 * 1024 ** 2,
  maxImages: 8,
  partSizeBytes: 50 * 1024 ** 2,
  concurrency: 2
};
