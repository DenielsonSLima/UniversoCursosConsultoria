import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { fixture, id } from './bounded-correction.fixture.mjs';
const mocks = {
  '../_shared/authz.ts': 'export const requireGestorForPolo=()=>{};export const requireGestorTab=()=>{};',
  '../gateways/api/config.ts': 'export const assertStoredProviderAdapterReady=()=>{};',
  '../gateways/api/credentials.ts': `export const getCredential=async()=>({id:'${id(7)}'});export const isCredentialConfiguredForRoute=async()=>true;`,
  '../gateways/runtime-config.ts': "export const getGatewayRuntimeConfig=async()=>({enabled:true,activeEnvironment:'production'});",
  '../gateways/router-adapter-runtime.ts': `export const resolveGatewayIssuer=async()=>({id:'${id(8)}'});`,
  './receivable-issuance.ts': 'export const createReceivableIssuer=()=>async()=>{globalThis.issued++;};',
};
await build({ entryPoints: ['supabase/functions/technical-manual-cycle-issuance/dependencies.ts'], outfile: 'tmp/correction-dependencies.mjs',
  bundle: true, format: 'esm', platform: 'node', plugins: [{ name: 'mock-io', setup(b) {
    b.onResolve({ filter: /.*/ }, (args) => mocks[args.path] ? { path: args.path, namespace: 'mock' } : undefined);
    b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: mocks[args.path] }));
  } }] });
const { createManualCycleIssuanceDependencies } = await import(pathToFileURL(resolve('tmp/correction-dependencies.mjs')));
let adminCalls = [], userCalls = [], preview = fixture(); globalThis.issued = 0;
const admin = { from(table) {
  const data = { matriculas: { id: id(2), turma_id: id(5), aluno_id: id(9), status: 'ATIVO' },
    turmas: { id: id(5), polo_id: id(6), curso_id: id(12) }, cursos: { modalidade: 'TECNICO' },
    payment_gateway_routes: [{ provider_code: 'banese_card', credential_id: id(7), enabled: true, environment: 'production' }] }[table];
  const query = { select() { return this; }, eq() { return this; }, maybeSingle() { return Promise.resolve({data,error:null}); },
    then(resolve) { return Promise.resolve({data,error:null}).then(resolve); } };
  return query;
}, rpc: async (...args) => { adminCalls.push(args); return {data:preview.cycleContext,error:null}; } };
const userClient = { rpc: async (...args) => { userCalls.push(args); return {data:structuredClone(preview),error:null}; } };
const deps = createManualCycleIssuanceDependencies({ admin, userClient, gestor: {}, supabaseUrl: 'https://example.test' });
const request = { action: 'resume', matriculaId: id(2), cicloNumero: 1, correctionOperationId: id(1) };
await deps.preflight(request);
const context = await deps.resume(request); await deps.reload(request);
assert.equal(context.requestId, id(4)); assert.equal(adminCalls.length, 0); assert.equal(userCalls.length, 2);
assert.equal(userCalls[0][0], 'preview_bounded_financial_correction_secure');
assert.deepEqual(userCalls[0][1], { p_operation_id:id(1), p_matricula_id:id(2) });
assert.equal(globalThis.issued, 0, 'preview/resume context must not auto-issue');
preview.consent.consented = false;
await assert.rejects(() => deps.resume(request)); assert.equal(globalThis.issued, 0);
await assert.rejects(() => deps.preflight({...request,action:'generate'}));
const recovery = createManualCycleIssuanceDependencies({ admin, userClient, supabaseUrl:'https://example.test',
  internalRecovery: {expectedMatriculaId:id(2),expectedCycleNumber:1,expectedCycleRequestId:id(4),expectedItemCount:12} });
await assert.rejects(() => recovery.preflight(request));
preview = fixture(); await deps.resume({...request,correctionOperationId:undefined});
assert.equal(adminCalls.length, 1); assert.equal(adminCalls[0][0], 'obter_emissao_ciclo_financeiro_tecnico_manual_service');
console.log('PASS: authenticated preview on resume/reload, no service progress or automatic issuance for correction, no internal recovery, ordinary path unchanged');
