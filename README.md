# DigiVault static site

This folder is the frontend. Deploy it separately from the Worker.

For Cloudflare Pages:

- Root directory: `site`
- Build command: `echo "No build required"`
- Build output directory: `.`
- Preview builds: optional; keep disabled until production is verified.

Set `upload-config.js` `UPLOAD_WORKER_URL` to the deployed Worker URL before testing uploads.
