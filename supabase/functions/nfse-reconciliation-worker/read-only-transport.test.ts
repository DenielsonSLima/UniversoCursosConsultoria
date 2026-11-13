import assert from 'node:assert/strict';
import { fiscalReadOnlyTransport } from './read-only-transport.ts';
Deno.test('worker transport denies all fiscal mutations and unrelated identities', async () => {
  const calls: string[] = [], dps = `DPS${'1'.repeat(42)}`, key = '2'.repeat(50);
  const transport = fiscalReadOnlyTransport({ request: async (method,path) => { calls.push(`${method} ${path}`); return {status:404,body:new Uint8Array()}; } }, dps,key);
  for (const path of ['/nfse',`/nfse/${key}/eventos`,`/dps/${dps}`]) await assert.rejects(transport.request('POST',path,'{}'));
  for (const path of [`/dps/DPS${'3'.repeat(42)}`,`/nfse/${'3'.repeat(50)}`,`/nfse/${key}/eventos/101102/001`,'https://evil.test','/nfse/../']) await assert.rejects(transport.request('GET',path));
  assert.equal(calls.length,0);
  await transport.request('GET',`/dps/${dps}`);await transport.request('GET',`/nfse/${key}/eventos/101101/1`);
  assert.equal(calls.length,2);
  await assert.rejects(()=>transport.request('GET',`/nfse/${'3'.repeat(50)}`));
});
Deno.test('worker transport binds only matching DPS response and honors throttling as uncertainty',async()=>{
 const dps=`DPS${'1'.repeat(42)}`;let calls=0;
 const response=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value));
 const transport=fiscalReadOnlyTransport({request:async()=>{calls++;return {status:200,body:response({tipoAmbiente:1,idDps:'WRONG',chaveAcesso:'2'.repeat(50)})};}},dps);
 await assert.rejects(transport.request('GET',`/dps/${dps}`));
 await assert.rejects(transport.request('GET',`/nfse/${'2'.repeat(50)}`));assert.equal(calls,1);
 const throttled=fiscalReadOnlyTransport({request:async()=>({status:429,body:new Uint8Array()})},dps);
 await assert.rejects(throttled.request('GET',`/dps/${dps}`),error=>(error as {code:string}).code==='WORKER_RATE_LIMITED');
});
Deno.test('worker resolves the exact NFS alias but refuses conflicting aliases before granting any note route',async()=>{
 const dps=`DPS${'1'.repeat(42)}`,key='2'.repeat(50),other='3'.repeat(50);
 for(const ids of [{idDps:`NFS${other}`},{idDPS:null},{idDps:`NFS${key}`,idDPS:`NFS${other}`}]){
  const calls:string[]=[];
  const transport=fiscalReadOnlyTransport({request:async(method,path)=>{
   calls.push(`${method} ${path}`);return {status:200,body:new TextEncoder().encode(JSON.stringify({tipoAmbiente:1,chaveAcesso:key,...ids}))};
  }},dps);
  await assert.rejects(transport.request('GET',`/dps/${dps}`),error=>(error as {code:string}).code==='WORKER_DPS_MISMATCH');
  await assert.rejects(transport.request('GET',`/nfse/${key}`));
  assert.deepEqual(calls,[`GET /dps/${dps}`]);
 }
 const calls:string[]=[];
 const transport=fiscalReadOnlyTransport({request:async(method,path)=>{
  calls.push(`${method} ${path}`);return {status:200,body:new TextEncoder().encode(JSON.stringify({tipoAmbiente:1,idDps:`NFS${key}`,chaveAcesso:key}))};
 }},dps);
 await transport.request('GET',`/dps/${dps}`);await transport.request('GET',`/nfse/${key}`);
 await assert.rejects(transport.request('GET',`/nfse/${other}`));
 await assert.rejects(transport.request('POST',`/nfse/${key}/eventos`,'{}'));
 assert.deepEqual(calls,[`GET /dps/${dps}`,`GET /nfse/${key}`]);
});
