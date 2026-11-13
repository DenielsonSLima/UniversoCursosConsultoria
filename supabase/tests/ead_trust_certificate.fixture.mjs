import {readFile} from 'node:fs/promises';
import {database as revisionDatabase,applyRevisions,submit,progress,state,alumno,other,course,enrollment,turma,unit}
  from './ead_assessment_revision.harness.mjs';

export {submit,progress,state,alumno,other,course,enrollment,turma,unit};
export const id=n=>`aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12,'0')}`;
export const source=name=>readFile(new URL('../migrations/'+name,import.meta.url),'utf8');
export const migrationNames=[
 '20261112225450_ead_trust_full_course_rollout_gate.sql',
 '20261112225500_ead_trust_quiz_completion.sql',
 '20261112225600_ead_trust_quiz_guard.sql',
 '20261112225650_ead_trust_quiz_read.sql',
 '20261112225700_ead_trust_payment_eligibility.sql',
 '20261112225800_ead_trust_certificate_ledger.sql',
 '20261112225810_ead_trust_certificate_issuance.sql',
 '20261112225820_ead_trust_certificate_public_delivery.sql',
 '20261112225850_ead_trust_certificate_reconciliation.sql',
 '20261112225900_ead_trust_certificate_callbacks.sql',
 '20261112225925_ead_trust_manual_payment_projection.sql',
];
const functionSource=(sql,name)=>{
 const start=sql.search(new RegExp(`create(?: or replace)? function ${name.replaceAll('.','\\.')}\\(`,'i'));
 if(start<0)throw new Error('Missing canonical function '+name);
 const tail=sql.slice(start),tag=tail.match(/\bas\s+(\$[a-z_]*\$)/i)[1];
 return tail.slice(0,tail.indexOf(tag+';')+tag.length+1);
};
export async function newTrustCertificateDatabase({database,activate=true}={}){
 const db=await revisionDatabase({database});
 await applyRevisions(db);
 await db.exec(await readFile(new URL('./fixtures/ead-trust-certificate-financial-schema.sql',import.meta.url),'utf8'));
 for(const name of ['20261112141935_ead_temporary_trust_access.sql',
  '20261112141950_trust_ead_get_aluno_progress_core_20260822.sql','20261112141956_trust_ead_update_aluno_progress.sql',
  '20261028185541_student_ead_certificate_model.sql'])await db.exec(await source(name));
 const legacy=functionSource(await source('20260901000800_preserve_paid_ead_receivable_on_inscription_projection.sql'),
  'public.ead_activate_matricula_on_paid_inscricao').replace('FUNCTION public.ead_activate_matricula_on_paid_inscricao(',
   'FUNCTION public.ead_activate_matricula_on_paid_inscricao_legacy_20261004(')
   .replace('function public.ead_activate_matricula_on_paid_inscricao(','function public.ead_activate_matricula_on_paid_inscricao_legacy_20261004(');
 await db.exec(legacy);
 await db.exec(functionSource(await source('20261005015539_ead_checkout_attempt_projection.sql'),
  'public.ead_activate_matricula_on_paid_inscricao'));
 await db.exec(`CREATE TRIGGER fixture_legacy_academic_projection AFTER INSERT OR UPDATE OF status ON public.inscricoes_online
  FOR EACH ROW WHEN(NEW.ead_checkout_attempt_id IS NULL) EXECUTE FUNCTION public.ead_activate_matricula_on_paid_inscricao_legacy_20261004();
  CREATE TRIGGER fixture_managed_academic_projection AFTER INSERT OR UPDATE OF status ON public.inscricoes_online
  FOR EACH ROW WHEN(NEW.ead_checkout_attempt_id IS NOT NULL) EXECUTE FUNCTION public.ead_activate_matricula_on_paid_inscricao();`);
 for(const name of migrationNames)await db.exec(await source(name));
 if(activate)await db.exec(await source('20261112225950_enable_ead_trust_certificate_lifecycle.sql'));
 await db.exec(`SET test.gestor='true';SET test.actor='${other}';UPDATE public.matriculas SET status='PENDENTE' WHERE id='${enrollment}'`);
 return db;
}
export const scalar=async(db,sql,args=[])=>(await db.query(sql,args)).rows[0].value;
export const grant=db=>scalar(db,'SELECT public.ead_liberar_por_confianca($1) value',[enrollment]);
export const delivery=(db,certificateId)=>scalar(db,'SELECT public.ead_get_certificate_delivery_state($1) value',[certificateId]);
export const validate=(db,code)=>scalar(db,'SELECT public.validar_documento_por_codigo($1) value',[code]);
export async function seedFinancial(db,{managed=false}={}){
 await db.query(`INSERT INTO public.contas_receber(id,matricula_id,cliente_id,turma_id,polo_id,tipo_lancamento,valor,
  gateway_provider,gateway_environment,gateway_payment_id,asaas_payment_id,gateway_status,gateway_boleto_nosso_numero,data_vencimento)
  VALUES($1,$2,$3,$4,$5,'MATRICULA',100,$6,'PRODUCAO','NN-SYNTHETIC','NN-SYNTHETIC','PENDING','NN-SYNTHETIC',CURRENT_DATE)`,
  [id(1),enrollment,alumno,turma,unit,managed?'banese_card':'asaas']);
 await db.query(`INSERT INTO public.inscricoes_online(id,matricula_id,aluno_id,turma_id,curso_id,receivable_id,valor,
  gateway_environment,gateway_payment_id,asaas_payment_id) VALUES($1,$2,$3,$4,$5,$6,100,'PRODUCAO','NN-SYNTHETIC','NN-SYNTHETIC')`,
  [id(2),enrollment,alumno,turma,course,id(1)]);
 await db.query(`INSERT INTO public.payment_gateway_transactions(id,receivable_id,inscricao_online_id,provider_code,
  environment,remote_payment_id,bank_slip_our_number,amount,payment_method,remote_status)
  VALUES($1,$2,$3,$4,'PRODUCAO','NN-SYNTHETIC','NN-SYNTHETIC',100,'BOLETO','PENDING')`,[id(3),id(1),id(2),managed?'banese_card':'asaas']);
 if(managed){
  await db.query(`INSERT INTO public.ead_checkout_attempts(id,matricula_id,aluno_id,turma_id,curso_id,
   receivable_id,inscription_id,transaction_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[id(4),enrollment,alumno,turma,course,id(1),id(2),id(3)]);
  await db.query('UPDATE public.contas_receber SET ead_checkout_attempt_id=$1 WHERE id=$2',[id(4),id(1)]);
  await db.query('UPDATE public.inscricoes_online SET ead_checkout_attempt_id=$1 WHERE id=$2',[id(4),id(2)]);
 }
}
export async function pay(db,{managed=false,backdated=false}={}){
 await db.exec('BEGIN');
 try{
  await db.query('UPDATE public.payment_gateway_transactions SET remote_status=$2 WHERE id=$1',[id(3),managed?'PAID':'RECEIVED']);
  // The Asaas webhook persists provider proof on the title (receivable-integrity.ts),
  // then its legacy academic trigger projects PAGO. It does not manufacture that proof.
  if(!managed)await db.query("UPDATE public.contas_receber SET gateway_status='RECEIVED',asaas_status='RECEIVED' WHERE id=$1",[id(1)]);
  if(managed)await db.query(`UPDATE public.contas_receber SET status='PAGO',valor_pago=100,data_pagamento=CURRENT_DATE,
   gateway_status='PAID',origem_pagamento='BANESE',gateway_settlement_source='API',gateway_settlement_evidence='{"paymentCount":1}' WHERE id=$1`,[id(1)]);
  await db.query(`UPDATE public.inscricoes_online SET status='PAGO',pago_em=CASE WHEN $2 THEN now()-interval '3 days' ELSE now() END
   WHERE id=$1`,[id(2),backdated]);
  await db.exec('COMMIT');
 }catch(error){await db.exec('ROLLBACK');throw error;}
}
