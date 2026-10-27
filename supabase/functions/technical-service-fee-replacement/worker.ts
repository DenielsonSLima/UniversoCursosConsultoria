import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { cancelBaneseBoleto, queryBaneseBoleto } from '../banese/core/adapter.ts';
import { reserveBaneseNossoNumero } from '../banese/core/adapter/auth.ts';
import { assertBaneseFinancialTermsEqual } from '../banese/internal/financial-terms-response.ts';
import type { BaneseFinancialTermsInput } from '../banese/internal/financial-terms.ts';
import { createGatewayCharge, type GatewayChargeResult } from '../gateways/router.ts';
import { documentForGateway } from '../gateways/checkout/utils.ts';
import { validateBaneseGatewayResult } from '../technical-manual-cycle-issuance/contract.ts';
import { loadServiceFeeIssuanceScope } from '../technical-manual-cycle-issuance/dependencies.ts';
import { loadReceivable, payerForGateway } from '../technical-manual-cycle-issuance/receivable-issuance.ts';
import { resolveCanonicalManualCycleBaneseTerms } from '../technical-manual-cycle-issuance/financial-terms.ts';

export const REPLACEMENT_ACTION = 'replace_approved_service_fee';
const record = (v: unknown): Record<string,unknown> => v && typeof v==='object' && !Array.isArray(v) ? v as Record<string,unknown> : {};
const uuid = (v: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v));
const hash = async (v: unknown) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode(JSON.stringify(v)))),v=>v.toString(16).padStart(2,'0')).join('');

export const replacementDependencies = {
  scope: loadServiceFeeIssuanceScope,load: loadReceivable,reserve: reserveBaneseNossoNumero,
  cancel: cancelBaneseBoleto,query: queryBaneseBoleto,create: createGatewayCharge,
  validate: validateBaneseGatewayResult,terms: resolveCanonicalManualCycleBaneseTerms,
};

export const runServiceFeeReplacement = async (
  admin: SupabaseClient,supabaseUrl: string,body: unknown,deps=replacementDependencies,
) => {
  const request=record(body);
  if(Object.keys(request).sort().join()!=='action,manifestHash,operationId' || request.action!==REPLACEMENT_ACTION ||
    !uuid(request.operationId) || !/^[a-f0-9]{64}$/.test(String(request.manifestHash))) throw new Error('FEE_REPLACEMENT_INVALID_REQUEST');
  const args={p_operation_id:request.operationId,p_manifest_hash:request.manifestHash};
  const rpc=async(name: string,extra: Record<string,unknown>={})=>{
    const r=await admin.rpc(name,{...args,...extra});
    if(r.error) throw new Error('FEE_REPLACEMENT_RPC_'+name.toUpperCase());
    return record(r.data);
  };
  const claim=await rpc('claim_service_fee_replacement_service');
  if(claim.completed===true) return {completed:true,replayed:true};
  if(!uuid(claim.leaseToken) || !uuid(claim.receivableId) || !uuid(claim.matriculaId) || !uuid(claim.requestId) ||
    typeof claim.recoveryOnly!=='boolean') throw new Error('FEE_REPLACEMENT_INVALID_CLAIM');
  const lease={p_lease_token:claim.leaseToken};
  const receipt=String(claim.receivableId);
  let stage='SCOPE';
  try {
    const scope=await deps.scope(admin,String(claim.matriculaId));
    let loaded=await deps.load(admin,receipt);
    let r=loaded.receivable;
    if(r.matricula_id!==scope.matriculaId || r.turma_id!==scope.turmaId || r.polo_id!==scope.poloId ||
      r.gateway_issuer_polo_id!==scope.issuerPoloId || r.gateway_creation_token!==claim.requestId ||
      r.tipo_lancamento!=='REMATRICULA' || Number(r.valor)!==100 || String(r.data_vencimento).slice(0,10)!=='2026-10-30' ||
      loaded.transactions.length!==0) throw new Error('FEE_REPLACEMENT_SCOPE_CHANGED');
    const credential=await admin.from('payment_gateway_credentials').select('metadata').eq('id',scope.credentialId)
      .eq('provider_code','banese_card').eq('environment','production').maybeSingle();
    if(credential.error) throw new Error('FEE_REPLACEMENT_CONFIG_UNAVAILABLE');
    const metadata=record(credential.data?.metadata);
    const bankIdentity=()=>({
      convenio:r.gateway_boleto_convenio,nossoNumero:r.gateway_boleto_nosso_numero,
      expectedAmount:r.valor,expectedDueDate:String(r.data_vencimento).slice(0,10),
      expectedAgency:r.gateway_boleto_agencia || metadata.baneseAgencia,
      expectedAccount:metadata.baneseConta || metadata.baneseContaDisplay,
      expectedDocumentNumber:receipt.slice(0,15),expectedCompanyTitleId:receipt.slice(0,25),
      expectedPayerDocument:documentForGateway(loaded.payer.cpf_cnpj),
      expectedFinancialTerms:r.gateway_financial_terms as BaneseFinancialTermsInput,
      strictEffectivePayments:true,
    });
    const gatewayResult=(raw: Record<string,unknown>,pixPayload: string,pixEncodedImage: string,terms: BaneseFinancialTermsInput): GatewayChargeResult=>({
      providerCode:'banese_card',remotePaymentId:String(r.gateway_boleto_nosso_numero),remoteCustomerId:null,remotePaymentLinkId:null,
      remoteStatus:'PENDING',invoiceUrl:null,bankSlipUrl:null,pixPayload,pixEncodedImage,
      bankSlipDigitableLine:String(raw.NumeroLinhaDigitavel || raw.numeroLinhaDigitavel || ''),
      bankSlipBarcode:String(raw.NumeroCodigoBarras || raw.numeroCodigoBarras || ''),
      bankSlipOurNumber:String(r.gateway_boleto_nosso_numero),issuerPoloId:scope.issuerPoloId,financialTerms:terms,
      rawPayload:{request:{receivableId:receipt,nossoNumero:r.gateway_boleto_nosso_numero},response:raw,recoveryMode:'SERVICE_FEE_REPLACEMENT'},
    });
    const persist=async(result: GatewayChargeResult)=>{
      const saved=await rpc('persist_rejected_fee_service_issuance',{...lease,p_result:result});
      if(saved.success!==true) throw new Error('FEE_REPLACEMENT_PERSISTENCE_UNCONFIRMED');
      const finished=await rpc('finish_service_fee_replacement_service',lease);
      if(finished.completed!==true) throw new Error('FEE_REPLACEMENT_FINISH_UNCONFIRMED');
      return {completed:true,replayed:false,issued:true};
    };
    let newPostAllowed=false;
    if(['APPROVED','CANCEL_INTENT'].includes(String(claim.state))) {
      stage='CANCEL';
      const canceled=await deps.cancel(admin as never,'production',{
        ...bankIdentity(),stopWhenPixAvailable:true,signal:AbortSignal.timeout(45_000),
        onMutationStart:async()=>{
          const intent=await rpc('mark_service_fee_cancel_intent_service',lease);
          if(intent.intent!==true) throw new Error('FEE_REPLACEMENT_CANCEL_INTENT_UNCONFIRMED');
        },
      });
      if(canceled.pixAvailable && canceled.pixPayload && canceled.pixEncodedImage) {
        stage='PERSIST_RECOVERED';
        return await persist(deps.validate(gatewayResult(record(canceled.raw),canceled.pixPayload,canceled.pixEncodedImage,
          r.gateway_financial_terms as BaneseFinancialTermsInput),r));
      }
      if(canceled.situationCode!==5 || canceled.remoteStatus!=='CANCELED' || canceled.nossoNumero!==claim.oldNumber) {
        throw new Error('FEE_REPLACEMENT_CANCEL_UNCONFIRMED');
      }
      stage='RESET';
      const prepared=await rpc('confirm_service_fee_canceled_service',{...lease,p_evidence:{
        method:'GET_AFTER_CANCEL',oldNumber:canceled.nossoNumero,convenio:canceled.convenio,
        remoteStatus:canceled.remoteStatus,situationCode:canceled.situationCode,paid:false,paymentCount:0,
        checkedAt:new Date().toISOString(),responseHash:await hash(canceled.raw),
        alreadyCanceled:canceled.alreadyCanceled,mutationAttempted:canceled.mutationAttempted,
      }});
      if(prepared.ready!==true || prepared.newPostAllowed!==true) throw new Error('FEE_REPLACEMENT_RESET_UNCONFIRMED');
      newPostAllowed=true;
      loaded=await deps.load(admin,receipt); r=loaded.receivable;
    }
    let result: GatewayChargeResult;
    if(newPostAllowed && claim.recoveryOnly===false) {
      stage='RESERVE';
      const reservation=await deps.reserve(admin as never,{receivableId:receipt,environment:'production',
        convenio:String(r.gateway_boleto_convenio),agencia:String(r.gateway_boleto_agencia),expectedCreationToken:String(claim.requestId)});
      if(reservation.recoveryPending || reservation.nossoNumero===claim.oldNumber) throw new Error('FEE_REPLACEMENT_RESERVATION_UNCONFIRMED');
      loaded=await deps.load(admin,receipt); r=loaded.receivable;
      stage='CREATE';
      result=await deps.create({admin,supabaseUrl,providerCode:'banese_card',credentialId:scope.credentialId,
        environment:'production',paymentMethod:'BOLETO',receivable:r,payer:payerForGateway(loaded.payer),amount:Number(r.valor),
        description:String(r.descricao || 'Rematrícula técnica'),dueDate:String(r.data_vencimento).slice(0,10),installments:1,
        successUrl:null,failureUrl:null,pendingUrl:null,financialTerms:await deps.terms(admin,r),allowPendingBolePix:false});
      result=deps.validate(result,r);
      // Store the first official POST result before any subsequent GET can omit
      // its Pix or a failed canonical projection can lose the response.
      stage='STAGE_POST';
      const stored=await rpc('stage_service_fee_replacement_result_service',{...lease,p_result:result});
      if(stored.stored!==true) throw new Error('FEE_REPLACEMENT_POST_NOT_STORED');
    } else {
      stage='RECOVER';
      if(claim.recoveryOnly!==true || !r.gateway_boleto_nosso_numero || r.gateway_boleto_nosso_numero===claim.oldNumber) {
        throw new Error('FEE_REPLACEMENT_GET_ONLY_REVIEW');
      }
      const snapshot=await deps.query(admin as never,'production',{
        ...bankIdentity(),validateTitleIdentity:true,recoverPix:true,signal:AbortSignal.timeout(8_000),
      });
      if(snapshot.paid || snapshot.payments.length || snapshot.paymentsError || snapshot.financialTermsError ||
        !snapshot.financialTerms || snapshot.situationCode!==2 || snapshot.remoteStatus!=='PENDING') {
        throw new Error('FEE_REPLACEMENT_REMOTE_REVIEW');
      }
      assertBaneseFinancialTermsEqual(r.gateway_financial_terms as BaneseFinancialTermsInput,snapshot.financialTerms);
      const stored=Object.keys(record(claim.officialResult)).length
        ? deps.validate(claim.officialResult as GatewayChargeResult,r) : null;
      const pix=snapshot.pixPayload || stored?.pixPayload;
      const image=snapshot.pixEncodedImage || stored?.pixEncodedImage;
      if(!pix || !image) throw new Error('FEE_REPLACEMENT_OFFICIAL_PIX_PENDING');
      result=deps.validate(gatewayResult(record(snapshot.raw),pix,image,snapshot.financialTerms),r);
    }
    stage='PERSIST';
    return await persist(result);
  } catch {
    try { await rpc('fail_service_fee_replacement_service',lease); } catch { /* Never expose bank data. */ }
    throw new Error('FEE_REPLACEMENT_REVIEW_STAGE_'+stage);
  }
};
