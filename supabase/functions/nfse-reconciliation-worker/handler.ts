import { safeEqual } from '../banese-reconciliation-worker/request-guards.ts';
async function readSmallBody(req: Request): Promise<string> {
 const reader = req.body?.getReader();
 if (!reader) return '';
 let bytes = 0; let text = ''; const decoder = new TextDecoder();
 try {
  while (true) {
   const chunk = await reader.read();
   if (chunk.done) return text + decoder.decode();
   bytes += chunk.value.byteLength;
   if (bytes > 200) { await reader.cancel(); throw new Error('BODY_TOO_LARGE'); }
   text += decoder.decode(chunk.value, {stream:true});
  }
 } finally { reader.releaseLock(); }
}
export function createReconciliationWorkerHandler(deps:{secret:()=>Promise<string>;run:()=>Promise<unknown>}) {
 return async(req:Request)=>{
  const respond=(body:unknown,status:number)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
  if(req.method!=='POST')return respond({error:'METHOD_NOT_ALLOWED'},405);
  const supplied=req.headers.get('X-Nfse-Worker-Token')??'';
  if(supplied.length<32||supplied.length>256)return respond({error:'UNAUTHORIZED'},401);
  let expected:string;
  try{expected=await deps.secret();}catch{return respond({error:'WORKER_UNAVAILABLE'},503);}
  if(!/^[a-f0-9]{64,128}$/i.test(expected)||!safeEqual(supplied,expected))return respond({error:'UNAUTHORIZED'},401);
  // Only a bounded scheduler delay is accepted; never an actor, credential, path or target.
  try {
   const body = await readSmallBody(req);
   if (body.length > 200) return respond({error:'INVALID_REQUEST'},400);
   const input = body ? JSON.parse(body) : {};
   if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => key !== 'delaySeconds')) return respond({error:'INVALID_REQUEST'},400);
   const delay = input.delaySeconds;
   if (delay !== undefined && (!Number.isInteger(delay) || delay < 0 || delay > 10)) return respond({error:'INVALID_REQUEST'},400);
   if (Number.isInteger(delay) && delay > 0 && delay <= 10) await new Promise(resolve => setTimeout(resolve,delay*1000));
  } catch { return respond({error:'INVALID_REQUEST'},400); }
  try{return respond(await deps.run(),200);}catch{return respond({error:'WORKER_UNAVAILABLE'},503);}
 };
}
