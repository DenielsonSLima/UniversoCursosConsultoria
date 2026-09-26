import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { cancelAuthorizedPdvTitle } from './service.ts';
const id='11111111-1111-4111-8111-111111111111';
function fixture(state='FENCED') {
  const calls: Array<{ name: string; args: any }> = [];
  const r={ id,cliente_id:id,valor:0.5,data_vencimento:'2026-09-26',
    gateway_boleto_convenio:'123',gateway_boleto_agencia:'033',gateway_boleto_nosso_numero:'000000001',
    gateway_financial_terms:{ nominalAmount:0.5,dueDate:'2026-09-26',discount:null,penalty:null,interest:null } };
  const admin={
    rpc: async (name:string,args:any) => {
      calls.push({name,args});
      return {data: name==='claim_banese_pdv_cancellation' ? {state,leaseToken:id,receivable:r} : {state:'CANCELED'},error:null};
    },
    from: (table:string) => {
      const chain:any={select:()=>chain,eq:()=>chain,single:async()=>({error:null,data:table==='parceiros'
        ? {cpf_cnpj:'00000000000'} : {metadata:{baneseBoletoConvenio:'123',baneseAgencia:'033',baneseConta:'000000001'}}})};
      return chain;
    },
  };
  return {admin,calls};
}
Deno.test('cancelamento consulta contrato e grava intenção antes da baixa; confirma antes do registro local', async()=>{
  const {admin,calls}=fixture();
  await cancelAuthorizedPdvTitle(admin,id,async (_a,_e,input)=>{
    assertEquals(input.stopWhenPixAvailable,true);
    assertEquals(input.expectedAmount,0.5);
    assertEquals(input.expectedPayerDocument,'00000000000');
    assertEquals(input.expectedFinancialTerms?.penalty,null);
    await input.onMutationStart?.();
    assertEquals(calls.at(-1)?.name,'mark_banese_pdv_cancel_intent');
    return {convenio:'123',nossoNumero:'000000001',remoteStatus:'CANCELED',situationCode:5,
      alreadyCanceled:false,mutationAttempted:true,pixAvailable:false,pixPayload:null,pixEncodedImage:null,raw:{}};
  });
  assertEquals(calls.at(-1)?.name,'finish_banese_pdv_cancellation');
  assertEquals(calls.at(-1)?.args.p_evidence_sha256.length,64);
});
Deno.test('Pix retornado pelo GET é persistido sem cancelar nem emitir',async()=>{
  const {admin,calls}=fixture();
  await cancelAuthorizedPdvTitle(admin,id,async()=>({convenio:'123',nossoNumero:'000000001',remoteStatus:'PENDING',situationCode:2,
    alreadyCanceled:false,mutationAttempted:false,pixAvailable:true,pixPayload:'official-validated-by-adapter',pixEncodedImage:'official-image',raw:{}}));
  assertEquals(calls.some(c=>c.name==='mark_banese_pdv_cancel_intent'),false);
  assertEquals(calls.at(-1)?.args.p_remote_status,'PENDING');
});
Deno.test('falha no banco não cancela localmente nem gera substituto',async()=>{
  const {admin,calls}=fixture();
  await assertRejects(()=>cancelAuthorizedPdvTitle(admin,id,async()=>{throw new Error('timeout');}));
  assertEquals(calls.some(c=>c.name==='finish_banese_pdv_cancellation'),false);
});
Deno.test('replay de título já cancelado não repete banco',async()=>{
  const {admin,calls}=fixture('CANCELED');
  const out=await cancelAuthorizedPdvTitle(admin,id,async()=>{throw new Error('must not call');});
  assertEquals(out.state,'CANCELED'); assertEquals(calls.length,1);
});
