import {readFile} from 'node:fs/promises';
import {createManagerDatabase,seedManagerEnrollment,prepareManager,applyManagerPatch,id,actor,polo} from './manager-cycle-integration-setup.mjs';
export {id,actor,polo};
export const operation=id(96001),oldRequest=id(96002);
const files=['20261027164000_rejected_technical_fee_correction_proofs.sql','20261027164100_rejected_fee_absence_inspection.sql',
 '20261027164200_rejected_fee_preparation_overlay.sql','20261027164300_rejected_fee_manager_consent.sql'];
export const call=async(db,name,args=[])=>(await db.query(`select ${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) value`,args)).rows[0].value;
export async function mockedIssuance(db,receipt,request,n) {
 const nn=String(n).padStart(9,'0');
 await call(db,'public.authorize_technical_manual_receivable_issuance_secure',[receipt,request]);
 await db.query(`update public.contas_receber set gateway_provider='banese_card',gateway_environment='production',gateway_payment_method='BOLETO',
  forma_pagamento='BOLETO',gateway_issuer_polo_id=polo_id,gateway_boleto_agencia='033',gateway_boleto_convenio='12345',
  gateway_creation_token=$2,gateway_submission_channel='API',gateway_submission_status='API_AMBIGUOUS',gateway_status='CREATING',
  gateway_boleto_nosso_numero=$3,gateway_financial_terms=internal_academic.technical_manual_banese_expected_terms(contas_receber) where id=$1`,[receipt,request,nn]);
 const row=(await db.query('select * from public.contas_receber where id=$1',[receipt])).rows[0];
 const barcode='0479'+'0'.repeat(26)+nn+'0'.repeat(5);
 const line=barcode.slice(0,4)+barcode.slice(19,24)+'0'+barcode.slice(24,34)+'0'+barcode.slice(34,44)+'0'+barcode[4]+barcode.slice(5,19);
 const result={providerCode:'banese_card',remotePaymentId:nn,remotePaymentLinkId:null,issuerPoloId:row.polo_id,
 bankSlipOurNumber:nn,bankSlipDigitableLine:line,bankSlipBarcode:barcode,
 pixPayload:`000201BR.GOV.BCB.PIX.SYNTHETIC${nn}53039865802BR6304ABCD`,pixEncodedImage:'data:image/png;base64,iVBORw0KGgoAAAAAAAAAAAAAAAAAAAAA',
 remoteStatus:'PENDING',financialTerms:row.gateway_financial_terms,rawPayload:{request:{synthetic:true},response:{synthetic:true}}};
 await call(db,'public.persist_technical_manual_cycle_banese_issuance',[receipt,request,request,result]);
}
export async function setupRejectedFee() {
 const db=await createManagerDatabase({patch:false});
 try {
 await db.exec('drop function public.registrar_turma_financeiro_auditoria(uuid,text,jsonb,text)');
 await db.exec(await readFile(new URL('./fixtures/rejected-fee-canonical-audit.sql',import.meta.url),'utf8'));
 const {enrollment}=await seedManagerEnrollment(db,960,{implantation:false});
 // Historical synthetic generation only: restore the original date validator before exercising correction.
 const sig='internal_academic.technical_manual_cycle_reviewed_preview_before_transfer_entry(uuid,integer,date,jsonb)';
 const definition=(await db.query('select pg_get_functiondef($1::regprocedure) value',[sig])).rows[0].value;
 const reviewSig='internal_academic.review_manual_cycle_items_with_enrollment_mode(jsonb,jsonb,jsonb,text,text,text)';
 const reviewDefinition=(await db.query('select pg_get_functiondef($1::regprocedure) value',[reviewSig])).rows[0].value;
 await db.exec(reviewDefinition.replace("pg_catalog.timezone('America/Maceio', pg_catalog.now())::date","date '2026-10-17'"));
 await db.exec(definition.replace("v_today date := timezone('America/Maceio', now())::date;","v_today date := date '2026-10-17';"));
 const preview=await call(db,'public.preview_ciclo_financeiro_tecnico_manual_secure',[enrollment,2,'2026-10-18',null]);
 await db.exec('begin');const created=await prepareManager(db,preview,id(96003));await db.exec('commit');
 await db.exec(definition);await db.exec(reviewDefinition);await applyManagerPatch(db);
 for (const file of ['20261027163500_scoped_manual_cycle_progress.sql',
  '20261027163600_financial_projection_read_efficiency.sql']) {
  await db.exec(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));
 }
 const fee=created.ciclo.recebiveis.find(r=>r.tipo==='REMATRICULA').id;
 const monthly=created.ciclo.recebiveis.filter(r=>r.tipo==='PARCELA');
 for(let n=0;n<monthly.length;n++) await mockedIssuance(db,monthly[n].id,id(97000+n),88000+n);
 await call(db,'public.authorize_technical_manual_receivable_issuance_secure',[fee,oldRequest]);
 await db.query(`update public.contas_receber set gateway_provider='banese_card',gateway_environment='production',gateway_payment_method='BOLETO',
  forma_pagamento='BOLETO',gateway_issuer_polo_id=polo_id,gateway_boleto_agencia='033',gateway_boleto_convenio='12345',
  gateway_boleto_nosso_numero='000099001',gateway_creation_token=$2,gateway_submission_channel='API',gateway_submission_status='API_AMBIGUOUS',gateway_status='CREATING',
  gateway_financial_terms=internal_academic.technical_manual_banese_expected_terms(contas_receber) where id=$1`,[fee,oldRequest]);
 await db.query(`update public.contas_receber set gateway_submission_status='API_REVIEW',gateway_last_error=$2 where id=$1`,[fee,
 'CICLO_MANUAL_BANESE_REVISAO_QUERY_ERROR: Banese Card recusou criacao do boleto (400): {"Erros":[{"CodigoErroProcessamento":"82","Descricao":"ERRO_DATA_VENCIMENTO_MENOR_DATA_EMISSAO_DOCUMENTO"}],"LogId":"0"}']);
 for(const file of files) {try{await db.exec(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));}catch(e){throw new Error(file+': '+e.message,{cause:e});}}
 // Freeze only the civil financial date. Lease/TTL/clock_timestamp remain real for expiry tests.
 for(const signature of ['internal_academic.approve_rejected_fee_correction(uuid,uuid,text,text,date,text)',
 'internal_academic.prepare_rejected_fee_correction(uuid,text)',
 'internal_academic.consent_rejected_fee_correction(public.contas_receber,uuid)',
 'public.rejected_fee_bank_policy_service(uuid,uuid)']) {
 const body=(await db.query('select pg_get_functiondef($1::regprocedure) value',[signature])).rows[0].value;
 await db.exec(body.replaceAll("(timezone('America/Maceio',now()))::date","date '2026-10-27'")
  .replaceAll("timezone('America/Maceio',now())::date","date '2026-10-27'"));
 }
 return {db,fee,enrollment,monthly,cycleRequest:id(96003)};
 } catch(e) {await db.close();throw e;}
}
export async function approve(db,fee) {
 const hashes=(await db.query(`select internal_academic.rejected_fee_sha256(to_jsonb(c)::text) source,
 internal_academic.rejected_fee_sha256(to_jsonb(r)::text) run from public.contas_receber c
 join internal_academic.technical_manual_cycle_runs r on c.id=any(r.receivable_ids) where c.id=$1`,[fee])).rows[0];
 return call(db,'internal_academic.approve_rejected_fee_correction',[operation,fee,hashes.source,hashes.run,'2026-10-30','synthetic-explicit-approval']);
}
export async function absence(db,approved) {
 const lease=await call(db,'public.claim_rejected_fee_absence_service',[operation,approved.manifestHash]);
 const evidence={operation:'EXACT_RESERVED_TITLE_ABSENCE',method:'GET',environment:'production',convenio:lease.convenio,
 nossoNumero:lease.nossoNumero,httpStatus:404,errorCode:'ERRO_BOLETO_NAO_ENCONTRADO',responseHash:'a'.repeat(64),checkedAt:new Date().toISOString()};
 await call(db,'public.confirm_rejected_fee_absence_service',[operation,approved.manifestHash,lease.leaseToken,evidence]);return {lease,evidence};
}
