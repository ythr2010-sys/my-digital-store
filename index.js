const encoder = new TextEncoder();
const XML = text => String(text || '');
function cors(origin='*') { return {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Expose-Headers':'ETag, Content-Length, Content-Type','Vary':'Origin'}; }
function response(body,status=200,origin='*'){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json',...cors(origin)}})}
function fail(message,status=400,origin='*'){return response({error:message},status,origin)}
function hex(buf){return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function sha256(value){return hex(await crypto.subtle.digest('SHA-256',typeof value==='string'?encoder.encode(value):value))}
async function hmac(key,data){return crypto.subtle.sign('HMAC',{name:'HMAC',hash:'SHA-256'},key,typeof data==='string'?encoder.encode(data):data)}
async function hmacKey(raw){return crypto.subtle.importKey('raw',typeof raw==='string'?encoder.encode(raw):raw,{name:'HMAC',hash:'SHA-256'},false,['sign'])}
async function signingKey(secret,date,region,service='s3'){const kDate=await hmacKey('AWS4'+secret);const d=await hmac(kDate,date);const kRegion=await hmacKey(d);const r=await hmac(kRegion,region);const kService=await hmacKey(r);const s=await hmac(kService,service);return hmacKey(await hmac(s,'aws4_request'))}
function amzDate(d=new Date()){const iso=d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');return {full:iso,short:iso.slice(0,8)}}
function encPath(path){return String(path).split('/').map(encodeURIComponent).join('/')}
function canonicalQuery(params){return [...params.entries()].sort((a,b)=>a[0].localeCompare(b[0])||a[1].localeCompare(b[1])).map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')}
function host(env){return new URL(env.B2_ENDPOINT).host}
function objectPath(env,key){return `/${encodeURIComponent(env.B2_BUCKET_NAME)}/${encPath(key)}`}
async function signedRequest(env,method,path,query='',payloadHash='',extraHeaders={}){
  const h=host(env), now=amzDate(), region=env.B2_REGION;
  const scope=`${now.short}/${region}/s3/aws4_request`, credential=`${env.B2_KEY_ID}/${scope}`;
  const headersObj={host:h,...extraHeaders};
  const keys=Object.keys(headersObj).map(x=>x.toLowerCase()).sort();
  const canonicalHeaders=keys.map(k=>`${k}:${String(headersObj[k]).trim()}\n`).join('');
  const signedHeaders=keys.join(';');
  const canonical=`${method}\n${path}\n${query}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash||await sha256('')}`;
  const sts=`AWS4-HMAC-SHA256\n${now.full}\n${scope}\n${await sha256(canonical)}`;
  const sig=hex(await hmac(await signingKey(env.B2_APPLICATION_KEY,now.short,region),sts));
  return {url:`${env.B2_ENDPOINT}${path}${query?`?${query}`:''}`,headers:{...headersObj,Authorization:`AWS4-HMAC-SHA256 Credential=${credential}, SignedHeaders=${signedHeaders}, Signature=${sig}`,'x-amz-date':now.full,'x-amz-content-sha256':payloadHash||await sha256('')}};
}
async function presign(env,method,key,queryParams={},expires=900){
  const h=host(env), now=amzDate(), region=env.B2_REGION, scope=`${now.short}/${region}/s3/aws4_request`, credential=`${env.B2_KEY_ID}/${scope}`;
  const q=new URLSearchParams({...queryParams,'X-Amz-Algorithm':'AWS4-HMAC-SHA256','X-Amz-Credential':credential,'X-Amz-Date':now.full,'X-Amz-Expires':String(expires),'X-Amz-SignedHeaders':'host'});
  const path=objectPath(env,key), canonical=`${method}\n${path}\n${canonicalQuery(q)}\nhost:${h}\n\nhost\nUNSIGNED-PAYLOAD`;
  const sts=`AWS4-HMAC-SHA256\n${now.full}\n${scope}\n${await sha256(canonical)}`;
  q.set('X-Amz-Signature',hex(await hmac(await signingKey(env.B2_APPLICATION_KEY,now.short,region),sts)));
  return `${env.B2_ENDPOINT}${path}?${canonicalQuery(q)}`;
}
async function firebaseUid(token,env){
  const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token})});
  if(!r.ok)return null; const j=await r.json(); return j.users?.[0]?.localId||null;
}
function safeName(name){return String(name||'file').normalize('NFKC').replace(/[^\p{L}\p{N}._ -]/gu,'_').slice(0,180)||'file'}
function makeKey(uid,name,kind){return `uploads/${uid}/${kind}/${crypto.randomUUID()}-${safeName(name)}`}
function checkKey(uid,key){return typeof key==='string'&&key.startsWith(`uploads/${uid}/`)&&key.length<1024}
function isImageKey(key){return typeof key==='string'&&key.includes('/images/')}
async function bodyJson(req){try{return await req.json()}catch{return null}}

export default {async fetch(req,env){
  const origin=req.headers.get('Origin')||'*';
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)});
  const url=new URL(req.url);

  // Public image proxy for product thumbnails. The bucket itself remains private.
  if(req.method==='GET'&&url.pathname==='/media'){
    const key=url.searchParams.get('key')||'';
    if(!isImageKey(key)||key.length>1024)return fail('Invalid image key',400,origin);
    try{
      const signed=await presign(env,'GET',key,{},300);
      const rr=await fetch(signed,{method:'GET'});
      if(!rr.ok)return new Response('Not found',{status:404,headers:cors(origin)});
      const headers=new Headers(rr.headers); headers.set('Cache-Control','public, max-age=300');
      return new Response(rr.body,{status:200,headers:{...Object.fromEntries(headers),...cors(origin)}});
    }catch(e){return fail(e?.message||'Media error',500,origin)}
  }

  if(req.method!=='POST')return fail('Method not allowed',405,origin);
  const auth=req.headers.get('Authorization')||''; const token=auth.startsWith('Bearer ')?auth.slice(7):'';
  if(!token)return fail('Authentication required',401,origin);
  const uid=await firebaseUid(token,env); if(!uid)return fail('Invalid Firebase ID token',401,origin);
  const data=await bodyJson(req); if(!data)return fail('Invalid JSON',400,origin);
  const partSize=Number(env.PART_SIZE_BYTES||52428800);
  try{
    if(url.pathname==='/multipart/initiate'){
      const size=Number(data.size); if(!Number.isFinite(size)||size<=0)return fail('Invalid file size',400,origin);
      const kind=data.kind==='image'?'images':'products'; const key=makeKey(uid,data.fileName,kind);
      const path=objectPath(env,key), req2=await signedRequest(env,'POST',path,'uploads=',await sha256(''),{'content-type':data.contentType||'application/octet-stream'});
      const rr=await fetch(req2.url,{method:'POST',headers:req2.headers}); const text=XML(await rr.text());
      if(!rr.ok)return fail(`B2 initiate failed: ${text.slice(0,300)}`,502,origin);
      const uploadId=(text.match(/<UploadId>([^<]+)<\/UploadId>/)||[])[1]; if(!uploadId)return fail('B2 did not return UploadId',502,origin);
      return response({key,uploadId,partSize},200,origin);
    }
    if(url.pathname==='/multipart/sign-part'){
      if(!checkKey(uid,data.key))return fail('Invalid object key',403,origin);
      const part=Number(data.partNumber); if(!Number.isInteger(part)||part<1||part>10000)return fail('Invalid part number',400,origin);
      return response({url:await presign(env,'PUT',data.key,{partNumber:String(part),uploadId:String(data.uploadId)},900)},200,origin);
    }
    if(url.pathname==='/multipart/complete'){
      if(!checkKey(uid,data.key)||!Array.isArray(data.parts)||!data.parts.length)return fail('Invalid completion data',400,origin);
      const clean=data.parts.map(p=>({partNumber:Number(p.partNumber),etag:String(p.etag||'').replace(/[<>]/g,'')})).sort((a,b)=>a.partNumber-b.partNumber);
      if(clean.some(p=>!Number.isInteger(p.partNumber)||p.partNumber<1||p.partNumber>10000||!p.etag))return fail('Invalid part list',400,origin);
      const xml=`<CompleteMultipartUpload>${clean.map(p=>`<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${p.etag}</ETag></Part>`).join('')}</CompleteMultipartUpload>`;
      const ph=await sha256(xml), path=objectPath(env,data.key), q=`uploadId=${encodeURIComponent(data.uploadId)}`;
      const req2=await signedRequest(env,'POST',path,q,ph,{'content-type':'application/xml'});
      const rr=await fetch(req2.url,{method:'POST',headers:req2.headers,body:xml}); const text=await rr.text();
      if(!rr.ok)return fail(`B2 complete failed: ${text.slice(0,300)}`,502,origin);
      const isImage=data.kind==='image'||isImageKey(data.key);
      const downloadUrl=isImage?`${url.origin}/media?key=${encodeURIComponent(data.key)}`:await presign(env,'GET',data.key,{},3600);
      return response({ok:true,downloadUrl,storageKey:data.key,deliveryType:'b2-worker'},200,origin);
    }
    if(url.pathname==='/multipart/abort'){
      if(!checkKey(uid,data.key))return fail('Invalid object key',403,origin);
      const req2=await signedRequest(env,'DELETE',objectPath(env,data.key),`uploadId=${encodeURIComponent(data.uploadId)}`); await fetch(req2.url,{method:'DELETE',headers:req2.headers});
      return response({ok:true},200,origin);
    }
    if(url.pathname==='/signed-download'){
      if(!checkKey(uid,data.key)||isImageKey(data.key))return fail('Invalid download request',403,origin);
      return response({url:await presign(env,'GET',data.key,{},600)},200,origin);
    }
    return fail('Unknown endpoint',404,origin);
  }catch(e){console.error(e);return fail(e?.message||'Server error',500,origin)}
}};
