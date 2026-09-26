const encoder = new TextEncoder();
const decoder = new TextDecoder();

const XML = text => String(text || '');
function cors(origin='*') { return {'Access-Control-Allow-Origin':origin, 'Access-Control-Allow-Headers':'Authorization, Content-Type', 'Access-Control-Allow-Methods':'POST, OPTIONS', 'Access-Control-Expose-Headers':'ETag', 'Vary':'Origin'}; }
function response(body,status=200,origin='*'){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json',...cors(origin)}})}
function fail(message,status=400,origin='*'){return response({error:message},status,origin)}
function hex(buf){return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function sha256(value){return hex(await crypto.subtle.digest('SHA-256', typeof value==='string'?encoder.encode(value):value))}
async function hmac(key,data){return crypto.subtle.sign('HMAC',{name:'HMAC',hash:'SHA-256'},key,typeof data==='string'?encoder.encode(data):data)}
async function hmacKey(raw){return crypto.subtle.importKey('raw',typeof raw==='string'?encoder.encode(raw):raw,{name:'HMAC',hash:'SHA-256'},false,['sign'])}
async function signingKey(secret,date,region='auto',service='s3'){
  const kDate=await hmacKey('AWS4'+secret); const d=await hmac(kDate,date);
  const kRegion=await hmacKey(d); const r=await hmac(kRegion,region);
  const kService=await hmacKey(r); const s=await hmac(kService,service);
  return hmacKey(await hmac(s,'aws4_request'));
}
function amzDate(d=new Date()){const iso=d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');return {full:iso,short:iso.slice(0,8)};}
function encPath(path){return path.split('/').map(encodeURIComponent).join('/')}
function canonicalQuery(params){return [...params.entries()].sort((a,b)=>a[0].localeCompare(b[0])||a[1].localeCompare(b[1])).map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')}
async function presign({env,key,uploadId,partNumber,expires=900}){
  const host=`${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const path=`/${env.R2_BUCKET_NAME}/${encPath(key)}`;
  const now=amzDate(); const credential=`${env.R2_ACCESS_KEY_ID}/${now.short}/auto/s3/aws4_request`;
  const q=new URLSearchParams({'X-Amz-Algorithm':'AWS4-HMAC-SHA256','X-Amz-Credential':credential,'X-Amz-Date':now.full,'X-Amz-Expires':String(expires),'X-Amz-SignedHeaders':'host',partNumber:String(partNumber),uploadId:String(uploadId)});
  const canonical=`PUT\n${path}\n${canonicalQuery(q)}\nhost:${host}\n\nhost\nUNSIGNED-PAYLOAD`;
  const scope=`${now.short}/auto/s3/aws4_request`; const stringToSign=`AWS4-HMAC-SHA256\n${now.full}\n${scope}\n${await sha256(canonical)}`;
  const keyObj=await signingKey(env.R2_SECRET_ACCESS_KEY,now.short); const sig=hex(await hmac(keyObj,stringToSign)); q.set('X-Amz-Signature',sig);
  return `https://${host}${path}?${canonicalQuery(q)}`;
}
async function signedRequest(env,method,path,query=''){
  const host=`${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`; const now=amzDate();
  const scope=`${now.short}/auto/s3/aws4_request`; const credential=`${env.R2_ACCESS_KEY_ID}/${scope}`;
  const headers=`host:${host}\n`; const signedHeaders='host'; const payloadHash=await sha256('');
  const canonical=`${method}\n${path}\n${query}\n${headers}\n${signedHeaders}\n${payloadHash}`;
  const sts=`AWS4-HMAC-SHA256\n${now.full}\n${scope}\n${await sha256(canonical)}`; const sk=await signingKey(env.R2_SECRET_ACCESS_KEY,now.short);
  const sig=hex(await hmac(sk,sts));
  return {url:`https://${host}${path}${query?`?${query}`:''}`,headers:{Host:host,Authorization:`AWS4-HMAC-SHA256 Credential=${credential}, SignedHeaders=${signedHeaders}, Signature=${sig}`,'x-amz-date':now.full,'x-amz-content-sha256':payloadHash}};
}
async function firebaseUid(token,env){
  const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token})});
  if(!r.ok) return null; const j=await r.json(); return j.users?.[0]?.localId || null;
}
function safeName(name){return String(name||'file').normalize('NFKC').replace(/[^\p{L}\p{N}._ -]/gu,'_').slice(0,180) || 'file'}
function makeKey(uid,name,kind){return `uploads/${uid}/${kind}/${crypto.randomUUID()}-${safeName(name)}`}
function checkKey(uid,key){return key.startsWith(`uploads/${uid}/`) && key.length<1024}
async function bodyJson(req){try{return await req.json()}catch{return null}}

export default {async fetch(req,env){
  const origin=req.headers.get('Origin') || '*'; if(req.method==='OPTIONS') return new Response(null,{status:204,headers:cors(origin)});
  if(req.method!=='POST') return fail('Method not allowed',405,origin);
  const auth=req.headers.get('Authorization')||''; const token=auth.startsWith('Bearer ')?auth.slice(7):''; if(!token)return fail('Authentication required',401,origin);
  const uid=await firebaseUid(token,env); if(!uid)return fail('Invalid Firebase ID token',401,origin);
  const url=new URL(req.url); const data=await bodyJson(req); if(!data)return fail('Invalid JSON',400,origin);
  const partSize=Number(env.PART_SIZE_BYTES||52428800);
  try {
    if(url.pathname==='/multipart/initiate'){
      const size=Number(data.size); if(!Number.isFinite(size)||size<=0)return fail('Invalid file size',400,origin);
      const kind=data.kind==='image'?'images':'products'; const key=makeKey(uid,data.fileName,kind);
      const path=`/${env.R2_BUCKET_NAME}/${encPath(key)}`; const req2=await signedRequest(env,'POST',path,'uploads=');
      const rr=await fetch(req2.url,{method:'POST',headers:req2.headers}); const text=XML(await rr.text()); if(!rr.ok)return fail('R2 initiate failed',502,origin);
      const uploadId=(text.match(/<UploadId>([^<]+)<\/UploadId>/)||[])[1]; if(!uploadId)return fail('R2 did not return UploadId',502,origin);
      return response({key,uploadId,partSize},200,origin);
    }
    if(url.pathname==='/multipart/sign-part'){
      if(!checkKey(uid,data.key))return fail('Invalid object key',403,origin); const part=Number(data.partNumber); if(!Number.isInteger(part)||part<1||part>10000)return fail('Invalid part number',400,origin);
      return response({url:await presign({env,key:data.key,uploadId:data.uploadId,partNumber:part})},200,origin);
    }
    if(url.pathname==='/multipart/complete'){
      if(!checkKey(uid,data.key)||!Array.isArray(data.parts)||!data.parts.length)return fail('Invalid completion data',400,origin);
      const path=`/${env.R2_BUCKET_NAME}/${encPath(data.key)}`; const q=`uploadId=${encodeURIComponent(data.uploadId)}`; const xml=`<CompleteMultipartUpload>${data.parts.sort((a,b)=>a.partNumber-b.partNumber).map(p=>`<Part><PartNumber>${Number(p.partNumber)}</PartNumber><ETag>${String(p.etag).replace(/[<>]/g,'')}</ETag></Part>`).join('')}</CompleteMultipartUpload>`;
      const now=amzDate(); const host=`${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`; const scope=`${now.short}/auto/s3/aws4_request`; const cred=`${env.R2_ACCESS_KEY_ID}/${scope}`; const ph=await sha256(xml); const can=`POST\n${path}\n${q}\nhost:${host}\n\nhost\n${ph}`; const sts=`AWS4-HMAC-SHA256\n${now.full}\n${scope}\n${await sha256(can)}`; const sig=hex(await hmac(await signingKey(env.R2_SECRET_ACCESS_KEY,now.short),sts));
      const rr=await fetch(`https://${host}${path}?${q}`,{method:'POST',headers:{Host:host,Authorization:`AWS4-HMAC-SHA256 Credential=${cred}, SignedHeaders=host, Signature=${sig}`,'x-amz-date':now.full,'x-amz-content-sha256':ph,'Content-Type':'application/xml'},body:xml}); if(!rr.ok)return fail('R2 complete failed',502,origin);
      return response({ok:true,downloadUrl:`${String(env.R2_PUBLIC_BASE_URL).replace(/\/$/,'')}/${data.key.split('/').map(encodeURIComponent).join('/')}`},200,origin);
    }
    if(url.pathname==='/multipart/abort'){
      if(!checkKey(uid,data.key))return fail('Invalid object key',403,origin); const path=`/${env.R2_BUCKET_NAME}/${encPath(data.key)}`; const q=`uploadId=${encodeURIComponent(data.uploadId)}`; const req2=await signedRequest(env,'DELETE',path,q); await fetch(req2.url,{method:'DELETE',headers:req2.headers}); return response({ok:true},200,origin);
    }
    return fail('Unknown endpoint',404,origin);
  } catch(e){ console.error(e); return fail(e?.message||'Server error',500,origin); }
}};
