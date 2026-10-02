import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href : '@electric-sql/pglite');
const db = new PGlite();
const source = (name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const sqlFunction = (text, name) => {
  const start = text.search(new RegExp(`create(?: or replace)? function ${name.replaceAll('.', '\\.')}\\(`, 'i'));
  assert.ok(start >= 0, name);
  const tail = text.slice(start), delimiter = tail.match(/\bas\s+(\$[a-z_]*\$)/i)[1];
  return tail.slice(0, tail.indexOf(`${delimiter};`) + delimiter.length + 1);
};
const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0].value;
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const matricula = id(100), turma = id(101), aluno = id(102), polo = id(103), run = id(104);
const archive = (request, payload) => scalar('select internal_proesc.archive_unconfirmed_receivables($1,$2) value', [id(request),payload]);
const restore = (request, payload) => scalar('select internal_proesc.restore_archived_receivable($1,$2) value', [id(request),payload]);
const manifest = async (numbers) => ({ matriculaId:matricula, fullRunId:run, expectedCount:numbers.length,
  approvalReference:'EXPLICIT_TEST_APPROVAL', reason:'Explicit administrative removal of disputed historical imports.',
  targets:await scalar(`select jsonb_agg(jsonb_build_object('receivableId',c.id,'linkId',l.id,'snapshotId',s.id,
    'receiptHash',md5(to_jsonb(c)::text),'linkHash',md5((to_jsonb(l)-'archived_receivable_id')::text),
    'snapshotHash',md5(to_jsonb(s)::text)) order by c.id) value
    from public.contas_receber c join internal_proesc.obligation_links l on l.receivable_id=c.id
    join lateral(select * from internal_proesc.financial_snapshots where link_id=l.id
      order by observed_at desc,recorded_at desc,id desc limit 1) s on true where c.id=any($1::uuid[])`, [numbers.map(id)]) });

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema internal_proesc; create schema internal_academic;
    create table public.contas_receber(id uuid primary key,polo_id uuid,matricula_id uuid,turma_id uuid,cliente_id uuid,
      status text not null,valor numeric,valor_pago numeric,data_vencimento date not null,data_pagamento date,
      origem_cronograma_id text,origem_pagamento text,regra_financeira_tecnica_snapshot jsonb,tipo_lancamento text default 'PARCELA',
      gateway_payment_id text,gateway_boleto_nosso_numero text,gateway_provider text,gateway_creation_token text,
      asaas_payment_id text,gateway_submission_status text,gateway_submission_channel text,nosso_numero_asaas text,
      manual_settlement_id uuid,gateway_boleto_linha_digitavel text,gateway_boleto_codigo_barras text,
      gateway_pix_payload text,gateway_pix_encoded_image text);
    create table public.matriculas(id uuid primary key,aluno_id uuid,turma_id uuid);
    create table public.turmas(id uuid primary key,polo_id uuid);
    create table public.payment_gateway_transactions(receivable_id uuid references public.contas_receber on delete cascade);
    create table public.optional_dependency(receivable_id uuid references public.contas_receber on delete set null);
    create table public.payment_gateway_cnab_records(receivable_id uuid,provider_code text,status text);
    create table public.push_notification_jobs(source_type text,source_id uuid,status text);
    create table internal_academic.technical_manual_cycle_runs(receivable_ids uuid[]);
    create table internal_proesc.class_scopes(turma_id uuid,polo_id uuid,source_unit_id text,source_class_id text,phase text,batch_id uuid);
    create table internal_proesc.obligation_links(id uuid primary key,receivable_id uuid not null unique
      references public.contas_receber,matricula_id uuid,turma_id uuid,source_unit_id text,source_class_id text,
      source_key text,kind text,parent_link_id uuid,auto_enabled boolean not null default true,
      unique(source_unit_id,source_class_id,source_key));
    create table internal_proesc.financial_snapshots(id uuid primary key,link_id uuid references internal_proesc.obligation_links,
      observed_at timestamptz,recorded_at timestamptz,verification text,source_status text);
    create table internal_proesc.v2_enrollment_links(matricula_id uuid,unit_id text,source_class_id text);
    create table internal_proesc.v2_runs(id uuid primary key,mode text,status text);
    create table internal_proesc.v2_tasks(run_id uuid,resource text,unit_id text,status text,source_year integer,
      source_month integer,records_seen integer,expected_total integer,next_page integer,last_page integer);
    create table internal_proesc.v2_invoice_observations(id uuid primary key,unit_id text,invoice_id text,
      source_status text,normalized jsonb,result text,reason text,link_id uuid);
    create table internal_proesc.reconciliation_requests(request_id uuid,action text,response jsonb);
    create table internal_proesc.mutation_claims(request_id uuid,transaction_id bigint,receivable_id uuid,
      kind text,completed boolean,expected_new jsonb);
    create function internal_academic.is_authorized_external_history_insert_before_original(public.contas_receber)
      returns boolean language sql as $$select false$$;
    create function internal_proesc.authorize_financial_operator(uuid) returns void language plpgsql as $$begin end$$;
    insert into public.turmas values('${turma}','${polo}');
    insert into public.matriculas values('${matricula}','${aluno}','${turma}');
    insert into internal_proesc.class_scopes values('${turma}','${polo}','3145','123','CONFIRMED','${id(105)}');
    insert into internal_proesc.v2_enrollment_links values('${matricula}','3145','123');
    insert into internal_proesc.v2_runs values('${run}','FULL','COMPLETE');
    insert into internal_proesc.v2_tasks values('${run}','invoices','3145','COMPLETE',2026,9,0,0,2,1);
  `);
  const contract = source('20260912220030_proesc_financial_scope_contract.sql');
  await db.exec(sqlFunction(contract,'internal_proesc.assert_historical_receivable'));
  await db.exec(sqlFunction(contract,'internal_academic.is_authorized_external_history_insert'));
  await db.exec(sqlFunction(source('20260913000000_reconciliation_source_projection.sql'),'internal_proesc.reconciliation_source_system'));
  await db.exec(sqlFunction(source('20261002010200_proesc_v2_financial_projection.sql'),'internal_proesc.v2_apply_invoice'));
  await db.exec(sqlFunction(source('20260924150350_freeze_reviewed_manual_cycle_snapshot.sql'),
    'internal_academic.guard_technical_receivable_policy_snapshot'));
  await db.exec(sqlFunction(source('20260912220050_proesc_scoped_financial_generation_guards.sql'),
    'internal_academic.guard_technical_manual_cycle_insert'));
  await db.exec(sqlFunction(source('20260913201000_proesc_cycle_persistent_state_and_fresh_generation.sql'),
    'internal_proesc.guard_fresh_cycle_generation_insert'));
  for (let n=1;n<=12;n++) {
    await db.query(`insert into public.contas_receber(id,polo_id,matricula_id,turma_id,cliente_id,status,valor,
      valor_pago,data_vencimento,origem_pagamento) values($1,$2,$3,$4,$5,'PENDENTE',279.90,0,'2026-09-16','SISTEMA_ANTERIOR')`,
    [id(n),polo,matricula,turma,aluno]);
    await db.query(`insert into internal_proesc.obligation_links(id,receivable_id,matricula_id,turma_id,
      source_unit_id,source_class_id,source_key,kind) values($1,$1,$2,$3,'3145','123',$4,'ORIGINAL')`,[id(n),matricula,turma,String(n)]);
    await db.query(`insert into internal_proesc.financial_snapshots values($1,$1,'2026-10-01','2026-10-01','REVIEW','UNKNOWN')`,[id(n)]);
  }
  const facts = await scalar(`select md5(jsonb_agg(to_jsonb(c) order by id)::text) value from public.contas_receber c`);
  const evidence = await scalar(`select md5(jsonb_agg(to_jsonb(s) order by id)::text) value from internal_proesc.financial_snapshots s`);
  await db.exec(source('20261002011600_proesc_administrative_receivable_archive.sql'));
  await db.exec(source('20261002011700_proesc_administrative_archive_operations.sql'));
  assert.equal(await scalar(`select md5(jsonb_agg(to_jsonb(c) order by id)::text) value from public.contas_receber c`),facts);
  await db.exec(`create function public.test_restore_guard() returns trigger language plpgsql as $$begin
    if not internal_academic.is_authorized_external_history_insert(new) then raise exception 'Historical insert denied'; end if;
    return new; end$$;
    create trigger test_restore_guard before insert on public.contas_receber for each row execute function public.test_restore_guard();`);
  await db.exec(`create trigger guard_technical_receivable_policy_snapshot before insert on public.contas_receber
    for each row execute function internal_academic.guard_technical_receivable_policy_snapshot();
    create trigger guard_technical_manual_cycle_insert before insert on public.contas_receber
    for each row execute function internal_academic.guard_technical_manual_cycle_insert();
    create trigger guard_proesc_fresh_cycle_generation before insert on public.contas_receber
    for each row execute function internal_proesc.guard_fresh_cycle_generation_insert();`);
  const rejects = async (n, mutation, code='40001') => {
    const payload=await manifest([n]);
    await db.exec('begin;'+mutation);
    await assert.rejects(()=>archive(200+n,payload),e=>e.code===code);
    await db.exec('rollback;');
    assert.equal(await scalar('select count(*)::int value from internal_proesc.administrative_archive_requests'),0);
  };
  await rejects(1,`update public.contas_receber set valor=280 where id='${id(1)}'`);
  await rejects(1,`update public.contas_receber set status='PAGO',valor_pago=260,data_pagamento='2026-10-01' where id='${id(1)}'`);
  await rejects(1,`update internal_proesc.financial_snapshots set source_status='OPEN',verification='VERIFIED' where id='${id(1)}'`);
  await rejects(1,`update internal_proesc.financial_snapshots set verification=null where id='${id(1)}'`);
  await rejects(1,`insert into public.payment_gateway_transactions values('${id(1)}')`,'42501');
  await rejects(1,`insert into public.optional_dependency values('${id(1)}')`,'55000');
  await rejects(1,`insert into public.push_notification_jobs values('financial','${id(1)}','pending')`,'55000');
  await rejects(1,`update internal_proesc.v2_tasks set records_seen=1`);
  await rejects(1,`update internal_proesc.v2_runs set mode='RECENT'`);
  await rejects(1,`update internal_proesc.v2_enrollment_links set source_class_id='other'`);
  await rejects(1,`insert into internal_proesc.v2_invoice_observations(id,unit_id,invoice_id) values('${id(900)}','3145','1')`);
  await rejects(1,`insert into internal_academic.technical_manual_cycle_runs values(array['${id(1)}'::uuid])`,'42501');
  const p=await manifest([1,2]);
  await assert.rejects(()=>archive(300,{...p,expectedCount:1}),e=>e.code==='22023');
  await assert.rejects(()=>archive(300,{...p,targets:[p.targets[0],p.targets[0]]}),e=>e.code==='22023');
  const invalid={...p,targets:[p.targets[0],{...p.targets[1],snapshotHash:'0'.repeat(32)}]};
  await assert.rejects(()=>archive(300,invalid),e=>e.code==='40001');
  assert.equal(await scalar('select count(*)::int value from public.contas_receber'),12,'atomic rollback after first target');
  const result=await archive(300,p);
  assert.deepEqual(result,{result:'ARCHIVED',count:2,requestId:id(300),financialSettlement:false,providerCancellation:false,recoverable:true});
  assert.deepEqual(await archive(300,p),result);
  await assert.rejects(()=>archive(300,{...p,reason:'A different authorization reason.'}),e=>e.code==='40001');
  assert.equal(await scalar('select count(*)::int value from public.contas_receber'),10);
  assert.equal(await scalar('select count(*)::int value from internal_proesc.obligation_links'),12);
  assert.equal(await scalar(`select count(*)::int value from internal_proesc.obligation_links where receivable_id is null and archived_receivable_id is not null and not auto_enabled`),2);
  await assert.rejects(()=>db.exec(`insert into internal_proesc.obligation_links(id,receivable_id,source_unit_id,source_class_id,source_key)
    values('${id(998)}','${id(12)}','3145','123','2')`),e=>e.code==='23505');
  assert.equal(await scalar(`select md5(jsonb_agg(to_jsonb(s) order by id)::text) value from internal_proesc.financial_snapshots s`),evidence);
  await assert.rejects(()=>db.exec(`update internal_proesc.obligation_links set archived_receivable_id=null where id='${id(1)}'`),e=>e.code==='23514');
  const rp={receivableId:id(1),receiptHash:p.targets[0].receiptHash,approvalReference:'EXPLICIT_RECOVERY_TEST',reason:'Explicit recovery of archived historical receipt.'};
  assert.equal((await restore(301,rp)).result,'RESTORED');
  assert.equal((await restore(301,rp)).result,'RESTORED');
  assert.equal(await scalar(`select md5(to_jsonb(c)::text) value from public.contas_receber c where id='${id(1)}'`),rp.receiptHash);
  await assert.rejects(()=>restore(302,rp),e=>e.code==='40001');
  for (const [offset,status] of [[0,'PAGA'],[1,'VENCIDO'],[2,'PAGAMENTO PARCIAL']]) {
    await db.query(`insert into internal_proesc.v2_invoice_observations(id,unit_id,invoice_id,source_status,normalized,result)
      values($1,'3145','2',$2,'{}','STAGED')`,[id(950+offset),status]);
    assert.equal(await scalar('select internal_proesc.v2_apply_invoice($1,$2) value',[id(999),id(950+offset)]),'REVIEW');
    assert.equal(await scalar('select internal_proesc.v2_apply_invoice($1,$2) value',[id(999),id(950+offset)]),'REVIEW');
  }
  assert.equal(await scalar(`select count(*)::int value from public.contas_receber where id='${id(2)}'`),0);
  await assert.rejects(()=>restore(303,{...rp,receivableId:id(2),receiptHash:p.targets[1].receiptHash}),e=>e.code==='40001');
  for (const role of ['anon','authenticated','service_role']) {
    assert.equal(await scalar(`select has_function_privilege($1,'internal_proesc.archive_unconfirmed_receivables(uuid,jsonb)','execute') value`,[role]),false);
    assert.equal(await scalar(`select has_table_privilege($1,'internal_proesc.administrative_receivable_archive','select') value`,[role]),false);
  }
  await db.exec(`begin; grant usage on schema internal_proesc to authenticated;
    grant execute on function internal_proesc.require_archive_database_operator() to authenticated; set local role authenticated;`);
  await assert.rejects(()=>db.exec('select internal_proesc.require_archive_database_operator()'),e=>e.code==='42501');
  await db.exec('rollback;');
  assert.equal(await scalar(`select bool_and(executed_by='postgres' and database_session='postgres') value from internal_proesc.administrative_archive_requests`),true);
  console.log('PASS administrative archive: exact targets, atomic replay, safety guards, private ACL, preserved evidence, real-trigger exact recovery, future V2 no resurrection');
} catch(error) {
  console.error(error.message, error.code, error.where ?? '', error.stack?.split('\n').slice(1,3).join('\n'));
  process.exitCode=1;
} finally { await db.close(); }
