import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href : '@electric-sql/pglite');
const db=new PGlite();
const source=name=>readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8');
const fn=(text,name)=>{
  const start=text.search(new RegExp(`create(?: or replace)? function ${name.replaceAll('.','\\.')}\\(`,'i'));
  assert.ok(start>=0,name); const tail=text.slice(start),d=tail.match(/\bas\s+(\$[a-z_]*\$)/i)[1];
  return tail.slice(0,tail.indexOf(`${d};`)+d.length+1);
};
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(100),matric=id(101),turma=id(102),polo=id(103),person=id(104),bank=id(105);
const scalar=async(sql,args=[])=>(await db.query(sql,args)).rows[0].value;
const call=(req,payload,who=actor)=>scalar('select internal_proesc.confirm_portal_payment($1,$2,$3) value',[who,id(req),payload]);
const payload=async(n)=>({linkId:id(n),observationId:id(n),portalStatus:'PAGA',portalInvoiceId:String(n),
  portalDueDate:'2026-09-15',principalCents:27990,paidCents:n===1?28684:28630,paymentDate:n===1?'2026-09-30':'2026-09-24',
  evidenceReference:'CONVERSATION_SCREENSHOT_TEST',approvalReference:'USER_CORRECTION_REQUEST_TEST',evidenceSha256:'d'.repeat(64),
  latestSnapshotId:id(n),latestSnapshotHash:await scalar('select md5(to_jsonb(s)::text) value from internal_proesc.financial_snapshots s where id=$1',[id(n)]),
  expectedBefore:await scalar('select internal_proesc.receivable_fingerprint(c) value from public.contas_receber c where id=$1',[id(n)]),
  observationHash:await scalar('select md5(to_jsonb(o)::text) value from internal_proesc.v2_invoice_observations o where id=$1',[id(n)])});
try {
  await db.exec(`
    create role anon;create role authenticated;create role service_role;
    create schema internal_proesc;create schema internal_academic;create schema internal_contas;create schema extensions;
    -- Digest implementation is a deterministic fixture, not a cryptography test.
    create function extensions.digest(text,text) returns bytea language sql immutable as $$select decode(md5($1)||md5($1),'hex')$$;
    create table public.usuarios_sistema(id uuid primary key,status text,perfil text,perfil_acesso_id uuid,
      personalizar_permissoes boolean,permissoes jsonb,polo_ids uuid[],context text);
    create table public.perfis_acesso(id uuid primary key,permissoes jsonb);
    insert into public.usuarios_sistema values('${actor}','ativo','gestor',null,true,'{"allPolos":true,"modules":["configuracoes"]}','{}',null);
    create table public.contas_receber(id uuid primary key,polo_id uuid,matricula_id uuid,turma_id uuid,cliente_id uuid,
      status text,valor numeric,valor_pago numeric,data_vencimento date,data_pagamento date,conta_bancaria_id uuid,
      updated_at timestamptz default '2026-09-01',origem_cronograma_id text,origem_pagamento text,tipo_lancamento text,
      regra_financeira_tecnica_snapshot jsonb,gateway_provider text,gateway_payment_id text,gateway_creation_token text,
      gateway_submission_channel text,gateway_submission_status text,gateway_boleto_nosso_numero text,
      gateway_boleto_linha_digitavel text,gateway_boleto_codigo_barras text,gateway_pix_payload text,gateway_pix_encoded_image text,
      asaas_payment_id text,nosso_numero_asaas text,manual_settlement_id uuid);
    create table public.matriculas(id uuid primary key,aluno_id uuid,turma_id uuid);
    create table public.turmas(id uuid primary key,polo_id uuid);
    create table public.payment_gateway_transactions(receivable_id uuid);
    create table internal_academic.technical_manual_cycle_runs(receivable_ids uuid[]);
    create table internal_proesc.class_scopes(turma_id uuid,polo_id uuid,source_unit_id text,source_class_id text,phase text);
    create table internal_proesc.obligation_links(id uuid primary key,receivable_id uuid,archived_receivable_id uuid,
      matricula_id uuid,turma_id uuid,source_unit_id text,source_class_id text,source_key text,auto_enabled boolean default true);
    create table internal_proesc.financial_snapshots(id uuid primary key default gen_random_uuid(),link_id uuid,
      observed_at timestamptz,recorded_at timestamptz default now(),source_fingerprint text,principal_cents bigint,
      received_cents bigint,payment_date date,source_status text,verification text,evidence_kind text,
      components jsonb,accounting_lines jsonb,review_reasons jsonb,recorded_by uuid,collector_review_reasons jsonb);
    create table internal_proesc.v2_enrollment_links(matricula_id uuid,unit_id text,source_class_id text,
      source_person_id text,source_enrollment_id text,person_hash text);
    create table internal_proesc.v2_invoice_observations(id uuid primary key,unit_id text,invoice_id text,link_id uuid,
      snapshot_id uuid,source_status text,normalized jsonb,result text,reason text,observed_at timestamptz,recorded_at timestamptz);
    create table internal_proesc.reconciliation_requests(request_id uuid primary key,action text,actor_id uuid,
      payload_hash text,response jsonb,completed_at timestamptz);
    create table internal_proesc.reconciliation_events(request_id uuid,link_id uuid,snapshot_id uuid,
      mode text,result text,before_state jsonb,after_state jsonb);
    create table internal_proesc.mutation_claims(request_id uuid,transaction_id bigint,receivable_id uuid,
      kind text,expected_new jsonb,completed boolean default false);
    create table internal_proesc.archived_receipt_requests(request_id uuid);
    create table internal_proesc.administrative_archive_requests(request_id uuid);
    create table internal_contas.proesc_operational_openings(account_id uuid,polo_id uuid,opening_date date);
    insert into internal_contas.proesc_operational_openings values('${bank}','${polo}','2026-10-01');
    create function internal_proesc.receivable_fingerprint(public.contas_receber) returns text language sql as $$select md5(to_jsonb($1)::text)||md5(to_jsonb($1)::text)$$;
    create function internal_proesc.person_document_hash(uuid) returns text language sql as $$select repeat('a',64)$$;
    create function internal_proesc.shared_account(uuid) returns uuid language sql as $$select '${bank}'::uuid$$;
    create function internal_proesc.authorize_financial_operator(uuid) returns void language plpgsql as $$begin end$$;
    insert into public.turmas values('${turma}','${polo}');
    insert into public.matriculas values('${matric}','${person}','${turma}');
    insert into internal_proesc.class_scopes values('${turma}','${polo}','3145','123','CONFIRMED');
    insert into internal_proesc.v2_enrollment_links values('${matric}','3145','123','555','666',repeat('a',64));
    create table internal_proesc.v2_runs(id uuid,mode text,status text,created_at timestamptz,finished_at timestamptz);
    alter table internal_proesc.v2_invoice_observations add column run_id uuid;
    create table internal_proesc.v2_people_observations(run_id uuid,unit_id text,person_id text,person_hash text,enrollments jsonb);
    insert into internal_proesc.v2_runs values('${id(106)}','FULL','COMPLETE','2026-10-01','2026-10-01');
    insert into internal_proesc.v2_people_observations values('${id(106)}','3145','555',repeat('a',64),
      '[{"sourceEnrollmentId":"666","sourceClassId":"123"}]');
  `);
  await db.exec(fn(source('20260912220030_proesc_financial_scope_contract.sql'),'internal_proesc.assert_historical_receivable'));
  const payment=source('20260912200020_apply_verified_proesc_payments.sql');
  await db.exec(fn(payment,'internal_proesc.has_exact_payment_claim'));
  await db.exec(fn(payment,'internal_proesc.guard_linked_financial_identity'));
  await db.exec(fn(source('20261002010200_proesc_v2_financial_projection.sql'),'internal_proesc.v2_apply_invoice'));
  await db.exec(fn(source('20260913010000_caixa_monthly_delinquency.sql'),'internal_contas.caixa_monthly_receivable_state'));
  await db.exec(fn(source('20261002010700_proesc_opening_cutover.sql'),'internal_contas.proesc_operational_movement_included'));
  await db.exec(`create trigger guard_proesc_linked_financial_identity before update on public.contas_receber
    for each row execute function internal_proesc.guard_linked_financial_identity();`);
  for(let n=1;n<=14;n++){
    const due=n<=2?'2026-09-15':`2026-${n%2?'10':'11'}-15`,paid=n===1?28684:28630,date=n===1?'2026-09-30':'2026-09-24';
    await db.query(`insert into public.contas_receber(id,polo_id,matricula_id,turma_id,cliente_id,status,valor,valor_pago,
      data_vencimento,origem_pagamento,tipo_lancamento) values($1,$2,$3,$4,$5,'PENDENTE',279.9,0,$6,'SISTEMA_ANTERIOR','PARCELA')`,[id(n),polo,matric,turma,person,due]);
    await db.query(`insert into internal_proesc.obligation_links(id,receivable_id,matricula_id,turma_id,source_unit_id,
      source_class_id,source_key) values($1,$1,$2,$3,'3145','123',$4)`,[id(n),matric,turma,String(n)]);
    await db.query(`insert into internal_proesc.financial_snapshots(id,link_id,observed_at,source_status,verification,
      principal_cents,received_cents,payment_date,evidence_kind,components,accounting_lines)
      values($1,$1,'2026-10-01','UNKNOWN','REVIEW',27990,$2,$3,'API_V2_INVOICE_REVIEW','{}','[]')`,[id(n),paid,date]);
    await db.query(`insert into internal_proesc.v2_invoice_observations values($1,'3145',$2,$1,$1,'PAGAMENTO PARCIAL',$3,'REVIEW',
      'PROVIDER_PAYMENT_STATUS_REQUIRES_REVIEW','2026-10-01','2026-10-01','${id(106)}')`,[id(n),String(n),{
      invoiceId:String(n),sourceClassId:'123',personId:'555',sourceEnrollmentId:'666',personHash:'a'.repeat(64),
      sourceStatus:'PAGAMENTO PARCIAL',principalCents:27990,paidCents:paid,dueDate:due,paymentDate:date,reviewReasons:['PARTIAL_PAYMENT_REQUIRES_REVIEW']}]);
  }
  await db.query(`insert into public.contas_receber(id,polo_id,status,valor,valor_pago,data_vencimento,data_pagamento,conta_bancaria_id)
    values($1,$2,'PAGO',279.9,260,'2026-10-05','2026-10-01',$3)`,[id(1000),polo,bank]);
  const openingPosition=()=>scalar(`select coalesce(sum(valor_pago),0)::text value from public.contas_receber
    where status='PAGO' and internal_contas.proesc_operational_movement_included(conta_bancaria_id,polo_id,data_pagamento,'2026-10-02')`);
  const openingBefore=await openingPosition();
  const observationBefore=await scalar('select md5(jsonb_agg(to_jsonb(o) order by id)::text) value from internal_proesc.v2_invoice_observations o');
  const futureBefore=await scalar(`select md5(jsonb_agg(to_jsonb(c) order by id)::text) value from public.contas_receber c where data_vencimento>'2026-09-30'`);
  await db.exec(source('20261002011800_proesc_portal_payment_confirmation.sql'));
  const p=await payload(1),q=await payload(2);
  for(const [key,value] of [['portalStatus','PARCIAL'],['evidenceSha256',''],['expectedBefore','0'.repeat(64)],
    ['paidCents',28685],['paymentDate','2026-10-01'],['portalInvoiceId','999'],['portalDueDate','2026-09-16'],['principalCents',27991],
    ['latestSnapshotId',id(999)],['latestSnapshotHash','0'.repeat(32)]]){
    await assert.rejects(()=>call(200,{...p,[key]:value}),e=>['22023','40001'].includes(e.code));
  }
  for(const mutation of [
    `update internal_proesc.v2_enrollment_links set source_person_id='999'`,
    `update internal_proesc.financial_snapshots set source_status='CANCELED' where id='${id(1)}'`,
    `update internal_proesc.financial_snapshots set accounting_lines='[{"cancelled":true}]' where id='${id(1)}'`,
    `update internal_proesc.class_scopes set phase='REVIEW'`,
    `delete from internal_proesc.v2_people_observations`,
    `update internal_proesc.v2_people_observations set person_id='different-single-person'`,
    `update internal_proesc.v2_people_observations set enrollments='[{"sourceClassId":"123","sourceEnrollmentId":"other"}]'`,
    `update internal_proesc.financial_snapshots set accounting_lines='[{"renegotiation":true}]' where id='${id(1)}'`,
  ]){await db.exec('begin;'+mutation);await assert.rejects(()=>call(200,p),e=>['40001','42501'].includes(e.code));await db.exec('rollback;');}
  await assert.rejects(()=>call(200,p,id(999)),e=>e.code==='42501');
  const a=await call(200,p),b=await call(201,q);
  assert.equal(a.result,'APPLIED');assert.equal(b.result,'APPLIED');
  assert.equal((await call(200,p)).replayed,true);
  await assert.rejects(()=>call(200,{...p,evidenceReference:'DIFFERENT_REFERENCE'}),e=>e.code==='40001');
  assert.equal(await scalar(`select sum(valor_pago)::text value from public.contas_receber where status='PAGO' and data_pagamento<'2026-10-01'`),'573.1400000000000000');
  assert.equal(await scalar(`select sum(valor_pago)::text value from public.contas_receber where data_pagamento>='2026-10-01'`),'260');
  assert.equal(await openingPosition(),openingBefore,'September backfill does not change zero opening or October position');
  for(const date of ['2026-09-24','2026-09-30']){
    assert.equal(await scalar(`select internal_contas.proesc_operational_movement_included($1,$2,$3,'2026-10-01') value`,[bank,polo,date]),false);
    assert.equal(await scalar(`select internal_contas.proesc_operational_movement_included($1,$2,$3,'2026-09-30') value`,[bank,polo,date]),true);
  }
  assert.equal(await scalar(`select md5(jsonb_agg(to_jsonb(c) order by id)::text) value from public.contas_receber c where data_vencimento>'2026-09-30'`),futureBefore);
  assert.equal(await scalar('select md5(jsonb_agg(to_jsonb(o) order by id)::text) value from internal_proesc.v2_invoice_observations o'),observationBefore);
  assert.equal(await scalar(`select count(*)::int value from internal_proesc.financial_snapshots where evidence_kind='PORTAL_CONFIRMED'
    and source_status='PAID' and verification='VERIFIED' and components='{"interestCents":null,"penaltyCents":null,"discountCents":null,"additionCents":null}' and accounting_lines='[]'`),2);
  assert.equal(await scalar(`select count(*)::int value from internal_proesc.mutation_claims where completed and kind='IMPORT'`),2);
  assert.equal(await scalar(`select count(*)::int value from internal_proesc.reconciliation_events where result='APPLIED'`),2);
  for(const n of [1,2]){
    await db.query(`insert into internal_proesc.v2_invoice_observations select $1,unit_id,invoice_id,link_id,snapshot_id,
      source_status,normalized,'STAGED',null,clock_timestamp(),clock_timestamp(),run_id from internal_proesc.v2_invoice_observations where id=$2`,[id(800+n),id(n)]);
    assert.equal(await scalar('select internal_proesc.v2_apply_invoice($1,$2) value',[actor,id(800+n)]),'PRESERVED');
  }
  for(const role of ['anon','authenticated','service_role']){
    assert.equal(await scalar(`select has_function_privilege($1,'internal_proesc.confirm_portal_payment(uuid,uuid,jsonb)','execute') value`,[role]),false);
    assert.equal(await scalar(`select has_table_privilege($1,'internal_proesc.portal_payment_confirmations','select') value`,[role]),false);
  }
  console.log('PASS portal payment: exact proof, real financial claim/identity guard, September-only receipts, 12 future records unchanged, API evidence unchanged, idempotence, private ACL');
}catch(e){console.error(e.message,e.code,e.where??'');process.exitCode=1;}finally{await db.close();}
