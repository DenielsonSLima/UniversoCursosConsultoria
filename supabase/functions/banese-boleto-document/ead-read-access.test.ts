import assert from 'node:assert/strict';
import test from 'node:test';
import { hasScopedEadBoletoReadAccess, isIssuedPayableEadBoleto } from './ead-read-access.ts';

test('EAD access only accepts canonical true and exact receipt identity', async () => {
  const calls: unknown[]=[];
  assert.equal(await hasScopedEadBoletoReadAccess({rpc: async (...args) => {calls.push(args); return {data:true,error:null};}}, 'receipt'),true);
  assert.deepEqual(calls,[['parceiro_aluno_ead_boleto_can_read',{p_receivable_id:'receipt'}]]);
  for (const data of [null,false,'true',{},[]]) {
    assert.equal(await hasScopedEadBoletoReadAccess({rpc:async()=>({data,error:null})},'x'),false);
  }
  assert.equal(await hasScopedEadBoletoReadAccess({rpc:async()=>({data:true,error:new Error()})},'x'),false);
  assert.equal(await hasScopedEadBoletoReadAccess({rpc:async()=>{throw new Error();}},'x'),false);
});
test('new exception only opens existing payable production documents',()=>{
  const row={status:'PENDENTE',gateway_environment:'production',gateway_boleto_issued_at:'2026-11-12',gateway_boleto_codigo_barras:'123',gateway_boleto_linha_digitavel:'123'};
  assert.equal(isIssuedPayableEadBoleto(row),true);
  assert.equal(isIssuedPayableEadBoleto({...row,status:'VENCIDO'}),true);
  for(const status of ['CANCELADO','PAGO','SUSPENSO','PARCIAL','']) assert.equal(isIssuedPayableEadBoleto({...row,status}),false);
  for(const key of ['gateway_boleto_issued_at','gateway_boleto_codigo_barras','gateway_boleto_linha_digitavel']) assert.equal(isIssuedPayableEadBoleto({...row,[key]:null}),false);
  assert.equal(isIssuedPayableEadBoleto({...row,gateway_environment:'sandbox'}),false);
});
