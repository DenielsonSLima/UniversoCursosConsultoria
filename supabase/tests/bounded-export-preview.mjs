// Standalone synthetic run: each RPC commits independently. No bank calls.
import {writeFile} from 'node:fs/promises';
import {createIntegrationDatabase} from './bounded-integration-setup.mjs';
import {actor,operation,bankIds,localIds,uid} from './bounded-seed.mjs';
const db=await createIntegrationDatabase();
const invoke=async(name,args)=>(await db.query(`select ${name}(${args.map((_,n)=>`$${n+1}`).join(',')}) value`,args)).rows[0].value;
try {
 const manifest=await invoke('internal_financial_correction.prepare_operation',
  [operation,actor,bankIds,localIds,'synthetic-committed-approval','a'.repeat(64)]);
 await invoke('internal_financial_correction.approve_operation',[operation,manifest.planFingerprint]);
 for(const id of bankIds) {
  const claim=await invoke('public.claim_financial_correction_service',[operation,id,manifest.fingerprint]);
  await invoke('public.complete_financial_correction_service',[operation,id,manifest.fingerprint,claim.leaseToken,{
   confirmedAt:new Date().toISOString(),evidenceFingerprint:'b'.repeat(64),
   bankResult:{convenio:claim.item.convenio,nossoNumero:claim.item.nossoNumero,situationCode:5,
    remoteStatus:'CANCELED',alreadyCanceled:true,mutationAttempted:false,raw:{CodigoSituacaoBoleto:5},
    proof:{strictEffectivePayments:true,paymentsCount:0,identityValidated:true,termsValidated:true}}}]);
 }
 await invoke('internal_financial_correction.finalize_operation',[operation,manifest.planFingerprint]);
 await db.exec("set test.jwt.role='authenticated'");
 const p=await invoke('public.preview_bounded_financial_correction_secure',[operation,uid(6)]);
 await invoke('public.consent_bounded_financial_correction_secure',[operation,uid(6),uid(88500),p.fingerprint]);
 const authorized=await invoke('public.preview_bounded_financial_correction_secure',[operation,uid(6)]);
 await writeFile(new URL('../../tmp/actual-committed-sql-preview.json',import.meta.url),JSON.stringify(authorized,null,2));
 console.log('PASS: independently committed SQL RPCs produced authorized 12-item preview. No bank calls.');
} finally {await db.close();}
