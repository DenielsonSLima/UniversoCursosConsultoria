import {readFile} from 'node:fs/promises';
import {loadEadExpirationTestSetup} from './ead_checkout_expiration_test_setup.mjs';
export const trustId=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const trustPolo='00000000-0000-0000-0000-000000000001';
export const trustTurma='00000000-0000-0000-0000-000000000022';
export const migration=name=>readFile(new URL('../migrations/'+name,import.meta.url),'utf8');
export const value=async(db,sql,args=[])=>(await db.query(sql,args)).rows[0].value;
export async function prepareTrustPayment(db){
 await loadEadExpirationTestSetup(db);
 // Extend only read dependencies missing from the existing financial harness.
 // Reservation, attempt projection, cancellation and recovery owners are real.
 await db.exec(`alter table public.receivable_manual_settlements add column receivable_id uuid,add column state text,
   add column polo_id uuid,add column completed_at timestamptz,add column reversed_at timestamptz,add column received_cents bigint,
   add column requires_remote_cancellation boolean default false,add column remote_canceled_at timestamptz;
  create table public.financial_payment_events(id uuid primary key,source_kind text,source_id uuid,polo_id uuid,
   original_cents bigint,principal_cents bigint,discount_cents bigint,payment_cents bigint,reversed_at timestamptz);
  alter table public.cursos add column ead_config jsonb default '{}';
  alter table public.matriculas add column data_matricula timestamptz default now();
  alter table public.parceiros add column email text;
  alter table public.inscricoes_online add column asaas_payment_link_id text,add column created_at timestamptz default now();
  create table public.certificados_academicos(id uuid,matricula_id uuid,status text,certificado_numero text);
  create or replace function public.gestor_has_module(text) returns boolean language sql as $$select true$$;
  create or replace function public.can_write_turma(uuid) returns boolean language sql as $$select true$$;`);
 await db.exec(await migration('20261112141935_ead_temporary_trust_access.sql'));
 await db.exec(await migration('20261112225450_ead_trust_full_course_rollout_gate.sql'));
 await db.exec(await migration('20261112225700_ead_trust_payment_eligibility.sql'));
 await db.exec(await migration('20261112225750_ead_trust_current_access_projection.sql'));
 await db.query("update test_caixa.access_state set role_name='service_role',actor=$1",[trustId(999)]);
}
export async function reserveTrustTitle(db,n){
 await db.query("insert into public.parceiros(id,nome,cpf_cnpj) values($1,'Aluno sintético','00000000000')",[trustId(n)]);
 const a=await value(db,`select public.ead_prepare_checkout_attempt($1,$2,$3,'banese_card','production','BOLETO',
  99.9,'2026-11-30','Compra EAD',null,null) value`,[trustId(n),trustTurma,trustId(n+1000)]);
 return bindTrustTitle(db,a,n);
}
export async function bindTrustTitle(db,a,n){
 const nn=String(n).padStart(9,'0');
 await db.query(`update public.contas_receber set gateway_status='PENDING',gateway_creation_token=null,
  gateway_payment_id=$2,gateway_boleto_nosso_numero=$2,updated_at=now() where id=$1`,[a.receivableId,nn]);
 await db.query("update public.inscricoes_online set gateway_payment_id=$2,gateway_environment='production' where id=$1",[a.inscricaoId,nn]);
 const tx=await value(db,`insert into public.payment_gateway_transactions(receivable_id,inscricao_online_id,provider_code,
  environment,remote_payment_id,remote_status,payment_method,bank_slip_our_number,amount)
  values($1,$2,'banese_card','production',$3,'PENDING','BOLETO',$3,99.9) returning id value`,[a.receivableId,a.inscricaoId,nn]);
 await value(db,'select public.ead_bind_checkout_attempt($1,$2,$3,$4) value',[a.attemptId,a.receivableId,tx,a.inscricaoId]);
 return {...a,transactionId:tx};
}
export async function confirmTrustBankPayment(db,a){
 await db.query(`update public.contas_receber set status='PAGO',valor_pago=99.9,data_pagamento=current_date,
  gateway_status='PAID',origem_pagamento='BANESE',gateway_settlement_source='API',
  gateway_settlement_evidence='{"paymentCount":1}' where id=$1`,[a.receivableId]);
 await db.query("update public.payment_gateway_transactions set remote_status='PAID' where id=$1",[a.transactionId]);
 await db.query("update public.inscricoes_online set status='PAGO',pago_em=now() where id=$1",[a.inscricaoId]);
}
