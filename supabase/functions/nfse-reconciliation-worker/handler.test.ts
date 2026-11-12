import assert from 'node:assert/strict';
import {createReconciliationWorkerHandler} from './handler.ts';
Deno.test('worker rejects browser/user JWT and wrong token before claiming any target',async()=>{
 let runs=0;const handler=createReconciliationWorkerHandler({secret:async()=>'a'.repeat(64),run:async()=>{runs++;return {ok:true};}});
 for(const headers of [{authorization:'Bearer userjwt'},{'X-Nfse-Worker-Token':'b'.repeat(64)}] as Record<string,string>[]) assert.equal((await handler(new Request('https://worker.test',{method:'POST',headers}))).status,401);
 assert.equal(runs,0);assert.equal((await handler(new Request('https://worker.test',{method:'POST',headers:{'X-Nfse-Worker-Token':'a'.repeat(64)},body:'{}'}))).status,200);assert.equal(runs,1);
});

Deno.test('worker rejects arbitrary targets, invalid delay and oversized authenticated bodies',async()=>{
 let runs=0;const handler=createReconciliationWorkerHandler({secret:async()=>'a'.repeat(64),run:async()=>{runs++;}});
 for (const body of ['[]','null','{"actor":"other"}','{"delaySeconds":11}','x'.repeat(201)]) {
  const response=await handler(new Request('https://worker.test',{method:'POST',headers:{'X-Nfse-Worker-Token':'a'.repeat(64)},body}));
  assert.equal(response.status,400);
 }
 assert.equal(runs,0);
});
