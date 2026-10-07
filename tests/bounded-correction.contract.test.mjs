import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { fixture, id } from './bounded-correction.fixture.mjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const base = 'modules/gestor/gestao/tecnicos/detalhes/components/financeiro/';
const bundle = async (entry, name) => {
  const outfile = resolve(`tmp/${name}.mjs`);
  await build({ entryPoints: [entry], outfile, bundle: true, format: 'esm', platform: 'node' });
  return import(pathToFileURL(outfile));
};
const edge = await bundle('supabase/functions/technical-manual-cycle-issuance/bounded-correction-context.ts', 'correction-edge');
const contract = await bundle('supabase/functions/technical-manual-cycle-issuance/contract.ts', 'correction-contract');
const ui = await bundle(base + 'bounded-correction.ts', 'correction-ui');
const parser = await bundle(base + 'matricula-tecnica-ciclo-manual.parser.ts', 'correction-state');
const request = { action: 'resume', matriculaId: id(2), cicloNumero: 1, correctionOperationId: id(1) };
const scope = { matriculaId: id(2), turmaId: id(5), poloId: id(6) };
const valid = edge.parseBoundedCorrectionContext(fixture(), request, scope);
for (const status of ['LOCAL_CREATED', 'PREPARADO', 'EMITIDO_BANESE']) {
  const p = fixture(); p.cycleContext.ciclo.status = status;
  assert.equal(contract.parseCycleContext(p.cycleContext).ciclo.status, status);
}
assert.equal(valid.requestId, id(4));
assert.equal(valid.ciclo.recebiveis.length, 12);
assert.equal(edge.correctionAuthorizationRequestId(valid, id(10)), id(40));
assert.equal(edge.correctionAuthorizationRequestId({ ...valid, boundedCorrection: undefined }, id(10)), null);
assert.throws(() => edge.correctionAuthorizationRequestId(valid, id(99)));
assert.equal(ui.parseCorrectionPreview(fixture()).installments[11].dueDate, '2027-09-15');
for (const mutate of [
  p => { p.consent.consented = false; }, p => { delete p.consent; },
  p => { p.status = 'WAITING_BANK'; }, p => { p.status = 'WAITING_CONSENT'; },
  p => { p.status = 'REVIEW'; }, p => { p.localFeeDisposition = 'PENDING'; },
  p => { p.operationId = id(99); }, p => { p.matriculaId = id(99); },
  p => { p.cycleContext.turmaId = id(99); }, p => { p.cycleContext.poloId = id(99); },
  p => { p.cycleContext.ciclo.numero = 2; }, p => { p.cycleContext.ciclo.quantidadeLocal = 1; },
  p => { p.installments[0].dueDate = '2026-10-05'; },
  p => { p.installments[0].financialTerms.discount.value = 0; },
  p => { p.installments[0].financialTerms.penalty.value = 0; },
  p => { p.installments[0].financialTerms.interest.value = 0; },
  p => { p.installments[0].financialTerms.discount.validUntil = '2026-10-05'; },
  p => { p.installments[0].id = p.installments[1].id; },
  p => { p.cycleContext.ciclo.recebiveis[0].status = 'CANCELADO'; p.cycleContext.ciclo.recebiveis[0].tipo = 'REMATRICULA'; },
  p => { delete p.authorizationRequestIds[id(10)]; },
  p => { p.authorizationRequestIds[id(10)] = p.authorizationRequestIds[id(11)]; },
  p => { p.authorizationRequestIds[id(99)] = id(98); },
]) { const p = fixture(); mutate(p); assert.throws(() => edge.parseBoundedCorrectionContext(p, request, scope)); }
for (const action of ['generate', 'resume']) for (const cycle of [1, 2, 3]) {
  if (action === 'resume' && cycle === 1) continue;
  assert.throws(() => contract.parseIssuanceRequest({ ...request, action, cicloNumero: cycle }));
}
assert.equal(contract.parseIssuanceRequest(request).correctionOperationId, id(1));
assert.equal(contract.parseIssuanceRequest({ action: 'resume', matriculaId: id(2), cicloNumero: 2 }).correctionOperationId, undefined);
const summary = fixture();
const row = { correcaoEmissao: summary, habilitado: true, modo: 'MANUAL', cicloBaseHistorico: 0, cicloMaximo: 2,
  proximoCicloNumero: null, primeiroVencimentoSugerido: null, criterioElegibilidade: 'MANUAL_APOS_EMISSAO',
  estado: 'BLOQUEADO', podeGerar: false, bloqueio: { codigo: 'CORRECAO', mensagem: 'Revisão' },
  politica: { revisao: 1, fingerprint: 'old' }, cicloGerado: { numero: 2, status: 'CANCELADO', quantidadeItens: 13,
    quantidadeBancaria: 13, quantidadeLocal: 0, total: '3458.80', emitidosBanese: 0, pendentesEmissao: 0, emRevisao: 0 } };
assert.equal(parser.requireMatriculaTecnicaCicloManual(row).cicloGerado.numero, 2);
assert.throws(() => parser.requireMatriculaTecnicaCicloManual({ ...row, podeGerar: true }));
assert.throws(() => parser.requireMatriculaTecnicaCicloManual({ ...row, proximoCicloNumero: 3 }));
console.log('PASS: canonical correction context, 22 tampering fences, C1-only request, original IDs, historical C2 and no generation');
const completedC1 = {...row, correcaoEmissao:{...summary,status:'COMPLETE',historicalCycle2Count:0},
 estado:'ELEGIVEL',podeGerar:true,proximoCicloNumero:2,bloqueio:null,
 cicloGerado:{...row.cicloGerado,numero:1,status:'LOCAL_CREATED',quantidadeBancaria:12,quantidadeLocal:1,
 emitidosBanese:12,pendentesEmissao:0,total:'3558.80',activeTotal:'3358.80'}};
assert.equal(parser.requireMatriculaTecnicaCicloManual(completedC1).proximoCicloNumero,2);
assert.equal(ui.usesCanonicalCycleAfterCorrection(completedC1.correcaoEmissao),true);
for(const change of [{status:'PARTIAL'},{status:'REVIEW'},{historicalCycle2Count:13}]) {
 assert.throws(()=>parser.requireMatriculaTecnicaCicloManual({...completedC1,
  correcaoEmissao:{...completedC1.correcaoEmissao,...change}}));
}
assert.throws(()=>parser.requireMatriculaTecnicaCicloManual({...completedC1,estado:'BLOQUEADO',podeGerar:true}));
console.log('PASS: completed C1-only correction restores only genuinely canonical C2 eligibility');
