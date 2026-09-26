import { createRemoteJWKSet, jwtVerify } from "jose";

const json = (data, status = 200, origin = "*") => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "Authorization,Content-Type",
    "access-control-max-age": "86400",
    "vary": "Origin"
  }
});

function originFor(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  return allowed.includes(origin) ? origin : "";
}

function corsResponse(response, origin) {
  const headers = new Headers(response.headers);
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Authorization,Content-Type");
    headers.set("Access-Control-Max-Age", "86400");
    headers.set("Vary", "Origin");
  }
  return new Response(response.body, { status: response.status, headers });
}

const jwksCache = new Map();
function getFirebaseJwks(projectId) {
  let set = jwksCache.get(projectId);
  if (!set) {
    set = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));
    jwksCache.set(projectId, set);
  }
  return set;
}

async function verifyFirebaseUser(request, env) {
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) throw new Error("AUTH_REQUIRED");
  const token = header.slice(7).trim();
  if (!token) throw new Error("AUTH_REQUIRED");

  const projectId = String(env.FIREBASE_PROJECT_ID || "").trim();
  if (!projectId) throw new Error("SERVER_MISCONFIGURED");

  const { payload } = await jwtVerify(token, getFirebaseJwks(projectId), {
    algorithms: ["RS256"],
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`
  });

  if (!payload.sub || typeof payload.sub !== "string") throw new Error("INVALID_TOKEN");
  if (typeof payload.auth_time === "number" && payload.auth_time > Math.floor(Date.now() / 1000) + 30) {
    throw new Error("INVALID_TOKEN");
  }
  return payload;
}

function base64Url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function utf8Base64Url(value) {
  return base64Url(new TextEncoder().encode(value));
}

async function hmacSha256(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

async function sha256Hex(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function createTemporaryR2Credentials(env, uid) {
  const accountId = String(env.R2_ACCOUNT_ID || "").trim();
  const bucket = String(env.R2_BUCKET_NAME || "").trim();
  const accessKeyId = String(env.R2_PARENT_ACCESS_KEY_ID || "").trim();
  const secret = String(env.R2_PARENT_SECRET_ACCESS_KEY || "").trim();
  if (!accountId || !bucket || !accessKeyId || !secret) throw new Error("SERVER_MISCONFIGURED");

  const ttlSeconds = 3600;
  const now = Math.floor(Date.now() / 1000);
  const header = utf8Base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = utf8Base64Url(JSON.stringify({
    bucket,
    actions: [
      "PutObject",
      "DeleteObject",
      "CreateMultipartUpload",
      "UploadPart",
      "CompleteMultipartUpload",
      "AbortMultipartUpload",
      "ListParts"
    ],
    paths: { prefixPaths: [`uploads/${uid}/`] },
    sub: accountId,
    iss: accessKeyId,
    aud: `${accountId}.r2.cloudflarestorage.com`,
    iat: now,
    exp: now + ttlSeconds
  }));
  const signingInput = `${header}.${payload}`;
  const signature = base64Url(await hmacSha256(secret, signingInput));
  const jwt = `${signingInput}.${signature}`;
  const tempSecret = await sha256Hex(jwt);

  return {
    accessKeyId,
    secretAccessKey: tempSecret,
    sessionToken: btoa(`jwt/${jwt}`),
    accountId,
    bucket,
    expiresAt: (now + ttlSeconds) * 1000,
    publicBaseUrl: String(env.R2_PUBLIC_BASE_URL || "").trim()
  };
}

function safeName(name) {
  const cleaned = String(name || "file.bin")
    .replace(/[\\/\0\x00-\x1f\x7f]+/g, "-")
    .replace(/\.\.+/g, ".")
    .trim();
  return cleaned.slice(0, 180) || "file.bin";
}

async function handleCredentials(request, env, origin) {
  const user = await verifyFirebaseUser(request, env);
  const body = await request.json().catch(() => ({}));
  const fileName = safeName(body.fileName);
  const contentType = String(body.contentType || "application/octet-stream").slice(0, 180);
  const uid = user.sub;
  const key = `uploads/${uid}/${crypto.randomUUID()}-${fileName}`;
  const creds = await createTemporaryR2Credentials(env, uid);
  return json({ ...creds, key, contentType }, 200, origin || "*");
}

export default {
  async fetch(request, env) {
    const origin = originFor(request, env);
    if (request.method === "OPTIONS") {
      if (!origin) return new Response("Forbidden", { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": origin,
          "access-control-allow-methods": "GET,POST,OPTIONS",
          "access-control-allow-headers": "Authorization,Content-Type",
          "access-control-max-age": "86400",
          "vary": "Origin"
        }
      });
    }
    if (!origin) return new Response("Forbidden", { status: 403 });

    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, service: "digivault-upload-worker", version: "v15" }, 200, origin);
      }
      if (request.method === "POST" && url.pathname === "/credentials") {
        return await handleCredentials(request, env, origin);
      }
      return json({ error: "NOT_FOUND" }, 404, origin);
    } catch (error) {
      console.error("Upload worker error", error);
      const status = ["AUTH_REQUIRED", "INVALID_TOKEN"].includes(error?.message) ? 401 : 500;
      return json({ error: status === 401 ? "AUTH_REQUIRED" : "UPLOAD_SERVICE_ERROR" }, status, origin);
    }
  }
};
