import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { fixture, id } from './bounded-correction.fixture.mjs';
await build({entryPoints:['supabase/functions/technical-manual-cycle-issuance/orchestrator.ts'],outfile:'tmp/correction-orchestrator.mjs',bundle:true,format:'esm',platform:'node'});
const {runManualCycleIssuance} = await import(pathToFileURL(resolve('tmp/correction-orchestrator.mjs')));
const request = { action:'resume',matriculaId:id(2),cicloNumero:1,correctionOperationId:id(1) };
let context, emitted, prepared;
const reset = () => { context=fixture().cycleContext; emitted=[];prepared=0; };
const deps={ preflight:async()=>{},prepare:async()=>{prepared++;throw new Error('Never generate');},resume:async()=>structuredClone(context),
  reload:async()=>structuredClone(context),issueReceivable:async(_,receivableId)=>{
    emitted.push(receivableId); const r=context.ciclo.recebiveis.find(r=>r.id===receivableId); r.emissaoBanese='EMITIDO';
    context.ciclo.emitidosBanese++; context.ciclo.pendentesEmissao--;
  }};
reset(); const original=structuredClone(context); const result=await runManualCycleIssuance(request,deps);
assert.equal(prepared,0); assert.deepEqual(emitted,original.ciclo.recebiveis.map(r=>r.id)); assert.equal(result.requestId,original.requestId);
assert.equal(result.ciclo.numero,1); assert.equal(result.ciclo.quantidadeBancaria,12); assert.equal(result.ciclo.quantidadeLocal,0);
emitted=[]; await runManualCycleIssuance(request,deps); assert.equal(emitted.length,0,'completed retry does not issue twice');
reset(); context.ciclo.recebiveis[0].status='CANCELADO'; await assert.rejects(()=>runManualCycleIssuance(request,deps)); assert.equal(emitted.length,0);
reset(); let fail=true;const partialDeps={...deps,issueReceivable:async(c,id)=>{if(emitted.length===2&&fail)throw new Error('Mock bank unavailable');return deps.issueReceivable(c,id);}};
await assert.rejects(()=>runManualCycleIssuance(request,partialDeps)); assert.equal(emitted.length,2);fail=false;
await runManualCycleIssuance(request,partialDeps); assert.equal(emitted.length,12);assert.equal(new Set(emitted).size,12);
console.log('PASS: real orchestrator preserves 12 C1 IDs/run, never prepares a new cycle, rejects canceled receipts, retries only remaining items');
