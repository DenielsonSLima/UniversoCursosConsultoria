import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {fixture,id} from './bounded-correction.fixture.mjs';
const base='modules/gestor/gestao/tecnicos/detalhes/components/financeiro/';
const bundle=async(entry,name)=>{await build({entryPoints:[entry],outfile:`tmp/${name}.mjs`,bundle:true,format:'esm',platform:'node'});return import(pathToFileURL(resolve(`tmp/${name}.mjs`)));};
const edge=await bundle('supabase/functions/technical-manual-cycle-issuance/contract.ts','waiver-contract');
const orchestrator=await bundle('supabase/functions/technical-manual-cycle-issuance/orchestrator.ts','waiver-orchestrator');
const ui=await bundle(base+'matricula-tecnica-ciclo-manual-destination.ts','waiver-ui');
const waived=(n)=>({id:id(100+n),chave:'ciclo-1-matricula',tipo:'MATRICULA',numero:0,descricao:'Matrícula local histórica',
  valor:'200.00',vencimento:'2026-09-15',status:'CANCELADO',emissaoBanese:'NAO_APLICAVEL',
  destinoCobranca:'LOCAL',localSemBoletoComprovado:true,localFeeWaiverProven:true});
const contextFor=(n)=>{const c=fixture().cycleContext;c.matriculaId=id(200+n);c.ciclo.recebiveis.unshift(waived(n));
  c.ciclo.total='3558.80';c.ciclo.activeTotal='3358.80';c.ciclo.quantidadeItens=13;c.ciclo.quantidadeLocal=1;
  c.ciclo.recebiveis.filter(r=>r.tipo==='PARCELA').forEach(r=>{r.emissaoBanese='EMITIDO';});
  c.ciclo.emitidosBanese=12;c.ciclo.pendentesEmissao=0;return c;};
for(let n=0;n<5;n++){
  const c=contextFor(n), parsed=edge.parseCycleContext(c);let calls=0;
  assert.equal(parsed.ciclo.recebiveis[0].localFeeWaiverProven,true);
  assert.equal(ui.isProvenLocalEnrollment(c.ciclo.recebiveis[0]),true);
  assert.equal(ui.isProvenWaivedLocalEnrollment(c.ciclo.recebiveis[0]),true);
  assert.equal(ui.isIssuedCycleReceivable(c.ciclo.recebiveis[0],1),true);
  // The three outside reset have no correctionOperationId and keep the ordinary 13-record context.
  const req={action:'resume',matriculaId:c.matriculaId,cicloNumero:1};
  const result=await orchestrator.runManualCycleIssuance(req,{preflight:async()=>{},resume:async()=>parsed,reload:async()=>parsed,
    prepare:async()=>{throw Error('No new cycle');},issueReceivable:async()=>{calls++;}});
  assert.equal(calls,0);assert.equal(result.ciclo.quantidadeItens,13);assert.equal(result.ciclo.quantidadeBancaria,12);
  assert.equal(result.ciclo.total,'3558.80');assert.equal(result.ciclo.activeTotal,'3358.80');assert.equal(result.ciclo.recebiveis[0].status,'CANCELADO');
}
for(const mutate of [r=>{delete r.localFeeWaiverProven;},r=>{r.localFeeWaiverProven=false;},r=>{r.destinoCobranca='BANESE';},
  r=>{r.tipo='REMATRICULA';},r=>{r.numero=1;},r=>{r.localSemBoletoComprovado=false;},r=>{r.emissaoHistoricaComprovada=true;},
  r=>{r.emissaoBanese='EMITIDO';},r=>{r.status='PAGO';},r=>{r.status='PENDENTE';}]){
  const c=contextFor(0);mutate(c.ciclo.recebiveis[0]);assert.equal(ui.isProvenWaivedLocalEnrollment(c.ciclo.recebiveis[0]),false);
  assert.equal(ui.isProvenLocalEnrollment(c.ciclo.recebiveis[0]),false);assert.throws(()=>edge.parseCycleContext(c));
}
const paid=waived(9);paid.status='PAGO';delete paid.localFeeWaiverProven;
assert.equal(ui.isProvenLocalEnrollment(paid),true);assert.equal(ui.isProvenWaivedLocalEnrollment(paid),false);
const ordinaryPaid=contextFor(9);ordinaryPaid.ciclo.recebiveis[0]=paid;
assert.equal(edge.parseCycleContext(ordinaryPaid).ciclo.recebiveis[0].localFeeWaiverProven,false);
const c2=contextFor(0);c2.ciclo.numero=2;assert.throws(()=>edge.parseCycleContext(c2));
console.log('PASS: five exact LOCAL waiver contexts (including ordinary three outside reset), historical 13 versus bank12, no payment/emission/new-cycle side effects, ten invalid proof variants rejected, paid never waived');
