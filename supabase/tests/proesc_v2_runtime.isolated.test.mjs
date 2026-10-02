import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PGLITE_MODULE_PATH;
const moduleURL = modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite';
const { PGlite } = await import(moduleURL);
const { pgcrypto } = await import(modulePath ? new URL('./contrib/pgcrypto.js', moduleURL).href
  : '@electric-sql/pglite/contrib/pgcrypto');
const db = new PGlite({ extensions: { pgcrypto } });
const source = (name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const actor = id(1), enrollment = id(2), classId = id(3), person = id(4), revision = id(5), runId = id(6);
const personHash = 'a'.repeat(64);
const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0].value;
const rpc = (action, payload = {}) => scalar(
  'select public.proesc_v2_runtime_service($1,$2,$3::jsonb) as value', [action, actor, JSON.stringify(payload)]);
const migrationNames = [
  '20261002010000_proesc_v2_ingestion_schema.sql',
  '20261002010100_proesc_v2_observation_validation.sql',
  '20261002010200_proesc_v2_financial_projection.sql',
  '20261002010300_proesc_v2_persistent_runtime.sql',
  '20261002010400_proesc_v2_worker_and_cycle_readers.sql',
  '20261002010500_proesc_v2_monitor_runtime.sql',
];

function functionSource(text, name) {
  const start = text.indexOf(`create function ${name}(`);
  assert.ok(start >= 0, name);
  const tail = text.slice(start);
  return tail.slice(0, tail.indexOf('\n$$;') + 4);
}

try {
  // Scaffolding contains no production rows. Financial apply below is the real
  // existing migration function; authorization/catalog helpers are isolated fixtures.
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA internal_proesc; CREATE SCHEMA internal_academic; CREATE SCHEMA extensions;
    CREATE SCHEMA vault; CREATE SCHEMA cron; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
    CREATE TABLE public.usuarios_sistema(id uuid PRIMARY KEY);
    CREATE TABLE public.matriculas(id uuid PRIMARY KEY,aluno_id uuid,turma_id uuid);
    CREATE TABLE public.turmas(id uuid PRIMARY KEY);
    CREATE TABLE public.contas_receber(id uuid PRIMARY KEY,matricula_id uuid,turma_id uuid,cliente_id uuid,
      valor numeric,valor_pago numeric,data_vencimento date,data_pagamento date,status text,
      conta_bancaria_id uuid,origem_pagamento text,updated_at timestamptz,gateway_provider text);
    CREATE TABLE internal_proesc.class_scopes(id uuid DEFAULT gen_random_uuid(),turma_id uuid,
      source_unit_id text,source_class_id text,phase text);
    CREATE TABLE internal_proesc.obligation_links(id uuid PRIMARY KEY,matricula_id uuid,turma_id uuid,
      receivable_id uuid UNIQUE,source_unit_id text,source_class_id text,source_key text,auto_enabled boolean);
    CREATE TABLE internal_proesc.financial_snapshots(id uuid PRIMARY KEY,link_id uuid,observed_at timestamptz,
      source_fingerprint text,principal_cents bigint CHECK(principal_cents>0),received_cents bigint,
      payment_date date,source_status text,verification text,evidence_kind text,
      components jsonb,accounting_lines jsonb,review_reasons jsonb,recorded_by uuid,
      recorded_at timestamptz DEFAULT now(),open_evidence jsonb,collector_review_reasons jsonb,
      CONSTRAINT financial_snapshots_evidence_kind_check CHECK(evidence_kind IN ('API_PAYMENT_TOTAL')));
    CREATE TABLE internal_proesc.connection_v2(id boolean PRIMARY KEY,revision uuid,updated_by uuid);
    CREATE TABLE internal_proesc.sync_runtime(id boolean PRIMARY KEY,enabled boolean,lease_until timestamptz);
    CREATE TABLE internal_proesc.cycle_review_runtime(id boolean PRIMARY KEY,enabled boolean,lease_until timestamptz);
    CREATE TABLE internal_proesc.reconciliation_requests(request_id uuid PRIMARY KEY,action text,actor_id uuid,
      payload_hash text,response jsonb,completed_at timestamptz);
    CREATE TABLE internal_proesc.mutation_claims(request_id uuid,transaction_id bigint,receivable_id uuid,
      kind text,expected_new jsonb,completed boolean);
    CREATE TABLE internal_proesc.reconciliation_events(request_id uuid,link_id uuid,snapshot_id uuid,
      mode text,result text,before_state jsonb,after_state jsonb,recorded_at timestamptz DEFAULT now());
    CREATE TABLE internal_proesc.enrollment_cycle_evidence(matricula_id uuid,has_external_cycle2 boolean,source_observed_at timestamptz);
    CREATE TABLE internal_academic.technical_manual_cycle_runs(matricula_id uuid);
    CREATE TABLE internal_academic.technical_external_cycle_coverage(matricula_id uuid);
    CREATE TABLE vault.decrypted_secrets(name text,decrypted_secret text);
    CREATE TABLE cron.job(jobname text,schedule text);
    CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
    CREATE FUNCTION internal_proesc.authorize_financial_operator(p_actor uuid) RETURNS void LANGUAGE plpgsql AS $$
      BEGIN IF current_setting('request.jwt.claims',true)::jsonb->>'role' IS DISTINCT FROM 'service_role'
        OR p_actor IS DISTINCT FROM '${actor}'::uuid THEN RAISE EXCEPTION 'Denied' USING ERRCODE='42501'; END IF; END $$;
    CREATE FUNCTION internal_proesc.authorize_cycle_review(uuid,uuid) RETURNS void LANGUAGE sql AS $$
      SELECT internal_proesc.authorize_financial_operator($1) $$;
    CREATE FUNCTION internal_proesc.person_document_hash(uuid) RETURNS text LANGUAGE sql AS $$
      SELECT CASE WHEN $1='${person}'::uuid THEN '${personHash}' END $$;
    CREATE FUNCTION internal_proesc.assert_historical_receivable(r public.contas_receber) RETURNS void LANGUAGE plpgsql AS $$
      BEGIN IF r.gateway_provider IS NOT NULL OR r.origem_pagamento IS DISTINCT FROM 'SISTEMA_ANTERIOR' THEN
        RAISE EXCEPTION 'Protected gateway' USING ERRCODE='42501'; END IF; END $$;
    CREATE FUNCTION internal_proesc.receivable_fingerprint(public.contas_receber) RETURNS text LANGUAGE sql AS $$
      SELECT encode(extensions.digest(to_jsonb($1)::text,'sha256'),'hex') $$;
    CREATE FUNCTION internal_proesc.shared_account(uuid) RETURNS uuid LANGUAGE sql AS $$ SELECT '${id(7)}'::uuid $$;
    ALTER TABLE public.contas_receber ADD COLUMN polo_id uuid;
    CREATE FUNCTION internal_proesc.assert_sync_lease(uuid,uuid) RETURNS void LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'AUTO forbidden' USING ERRCODE='42501'; END $$;
    CREATE FUNCTION internal_proesc.has_confirmed_first_cycle_only(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE FUNCTION internal_academic.technical_manual_cycle_state(uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"podeGerar":false}'::jsonb $$;
    INSERT INTO public.usuarios_sistema VALUES('${actor}');
    INSERT INTO public.turmas VALUES('${classId}');
    INSERT INTO public.matriculas VALUES('${enrollment}','${person}','${classId}');
    INSERT INTO internal_proesc.class_scopes(turma_id,source_unit_id,source_class_id,phase)
      VALUES('${classId}','3145','123','CONFIRMED');
    INSERT INTO internal_proesc.connection_v2 VALUES(true,'${revision}','${actor}');
    INSERT INTO internal_proesc.sync_runtime VALUES(true,true,null);
    INSERT INTO internal_proesc.cycle_review_runtime VALUES(true,true,null);
    SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
  `);
  const ledger = source('20260912200000_create_proesc_reconciliation_records.sql');
  await db.exec(functionSource(ledger, 'internal_proesc.begin_financial_request'));
  await db.exec(functionSource(ledger, 'internal_proesc.finish_financial_request'));
  await db.exec(functionSource(source('20260912200020_apply_verified_proesc_payments.sql'),
    'public.proesc_apply_financial_snapshot_service'));
  for (const name of migrationNames) await db.exec(source(name));
  for (let n = 1; n <= 4; n++) {
    await db.query(`insert into public.contas_receber(id,matricula_id,turma_id,cliente_id,valor,valor_pago,
      data_vencimento,data_pagamento,status,origem_pagamento,updated_at)
      values($1,$2,$3,$4,279.90,$5,'2026-09-15',$6,$7,'SISTEMA_ANTERIOR',now())`,
    [id(10 + n), enrollment, classId, person, n === 3 ? 285.58 : 0, n === 3 ? '2026-09-16' : null, n === 3 ? 'PAGO' : 'PENDENTE']);
    await db.query(`insert into internal_proesc.obligation_links values($1,$2,$3,$4,'3145','123',$5,true)`,
      [id(20 + n), enrollment, classId, id(10 + n), String(100 + n)]);
  }
  await db.query(`insert into internal_proesc.financial_snapshots(id,link_id,observed_at,principal_cents,received_cents,
    payment_date,source_status,verification,evidence_kind,components,accounting_lines)
    values($1,$2,now()-interval '1 day',27990,28558,'2026-09-16','PAID','VERIFIED','API_PAYMENT_TOTAL',
      '{"interestCents":9,"penaltyCents":559}', '[]')`, [id(30), id(23)]);

  const before = await scalar(`select jsonb_agg(to_jsonb(c) order by id) value from public.contas_receber c`);
  const started = await rpc('start', { runId });
  assert.equal(started.mode, 'FULL');
  assert.equal((await rpc('start', { runId })).replayed, true);
  await assert.rejects(rpc('activate', { runId }), /inventário V2 completo/);
  await db.exec(`select set_config('request.jwt.claims','{"role":"authenticated"}',false)`);
  await assert.rejects(rpc('start', { runId }), /Denied/);
  await db.exec(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`);
  const people = await rpc('claim');
  assert.equal(people.resource, 'people');
  assert.equal((await rpc('claim')).claimed, false, 'Lease must serialize workers');
  const peopleCommit = { taskId: people.taskId, leaseId: people.leaseId, credentialRevision: revision,
    page: 1, lastPage: 1, total: 1, observedAt: new Date().toISOString(), records: [
      { personId: '11', personHash, enrollments: [{ sourceEnrollmentId: '22', sourceClassId: '123' }] },
    ] };
  assert.equal((await rpc('commit', peopleCommit)).committed, true);
  assert.equal((await rpc('commit', peopleCommit)).replayed, true);
  await assert.rejects(rpc('commit', { ...peopleCommit, records: [] }), /divergente/);
  const invoice = (n, status, paidCents, paymentDate = null) => ({
    invoiceId: String(100 + n), personId: '11', sourceEnrollmentId: '22', sourceClassId: '123', personHash,
    unitId: '3145', dueDate: '2026-09-15', principalCents: 27990, paidCents, paymentDate, sourceStatus: status,
    groupId: '99', order: 1, groupTotal: 12, financialConfiguration: { fineRate: '2', interestRate: '0.033' },
    reviewReasons: status === 'PAGAMENTO PARCIAL' ? ['PARTIAL_PAYMENT_REQUIRES_REVIEW'] : [],
  });
  const records = [invoice(1, 'PAGA', 26000, '2026-09-15'), invoice(2, 'VENCIDO', 0),
    invoice(3, 'PAGAMENTO PARCIAL', 28558, '2026-09-16'), invoice(4, 'PAGAMENTO PARCIAL', 28600, '2026-09-17')];
  const task = await rpc('claim');
  assert.equal(task.resource, 'invoices');
  const pageOne = { taskId: task.taskId, leaseId: task.leaseId, credentialRevision: revision,
    page: 1, lastPage: 2, total: 4, observedAt: new Date().toISOString(), records: records.slice(0, 2) };
  await assert.rejects(rpc('apply', pageOne), /inventário completo/);
  await rpc('commit', pageOne);
  assert.deepEqual(await scalar(`select jsonb_agg(to_jsonb(c) order by id) value from public.contas_receber c`), before);
  const second = await rpc('claim');
  const pageTwo = { ...pageOne, leaseId: second.leaseId, page: 2, records: records.slice(2) };
  await assert.rejects(rpc('commit', { ...pageTwo, total: 5 }), /fora do contrato/);
  await assert.rejects(rpc('commit', { ...pageTwo, records: [records[0], records[3]] }), /duplicate key/);
  await assert.rejects(rpc('commit', { ...pageTwo, records: [{ ...records[2], studentDocument: '12345678901' }, records[3]] }), /Observação V2 inválida/);
  await assert.rejects(rpc('commit', { ...pageTwo, records: [{ ...records[2], order: { note: 'private' } }, records[3]] }), /Posição ou total/);
  await assert.rejects(rpc('commit', { ...pageTwo, records: [{ ...records[2], sourceStatus: 'ALUNO' }, records[3]] }), /Observação V2 inválida/);
  await rpc('commit', pageTwo);
  const apply = await rpc('claim');
  assert.equal(apply.resource, 'apply');
  const applied = await rpc('apply', { taskId: apply.taskId, leaseId: apply.leaseId, credentialRevision: revision });
  assert.equal(applied.runComplete, true);
  assert.deepEqual(applied.counts, { APPLIED: 1, OPEN_CONFIRMED: 1, PRESERVED: 1, REVIEW: 1 });
  const rows = (await db.query('select status,valor_pago from public.contas_receber order by id')).rows;
  assert.equal(rows[0].status, 'PAGO'); assert.equal(Number(rows[0].valor_pago), 260);
  assert.equal(rows[1].status, 'PENDENTE');
  assert.equal(rows[2].status, 'PAGO'); assert.equal(Number(rows[2].valor_pago), 285.58);
  assert.equal(rows[3].status, 'PENDENTE'); assert.equal(Number(rows[3].valor_pago), 0);
  assert.equal(await scalar(`select count(*)::int value from internal_proesc.reconciliation_events where result='APPLIED'`), 1);
  assert.equal(await scalar(`select count(*)::int value from internal_proesc.mutation_claims where completed`), 1);
  assert.equal(await scalar(`select count(*)::int value from internal_proesc.financial_snapshots
    where evidence_kind like 'API_V2_%' and accounting_lines<>'[]'::jsonb`), 0, 'Never fabricate V1 accounting lines');
  assert.equal(await scalar(`select count(*)::int value from internal_proesc.financial_snapshots where link_id='${id(23)}'`), 1,
    'Existing payment composition must be preserved');
  assert.equal((await rpc('activate', { runId })).activated, true);
  assert.equal(await scalar(`select enabled value from internal_proesc.sync_runtime`), false);
  assert.equal(await scalar(`select enabled value from internal_proesc.cycle_review_runtime`), false);
  assert.equal((await rpc('claim')).claimed, false, 'No immediate repeated full scan');
  assert.equal(await scalar(`select has_function_privilege('authenticated','public.proesc_v2_runtime_service(text,uuid,jsonb)','execute') value`), false);

  const fixture = async (n, status = 'PENDENTE', paid = 0, gateway = null) => {
    await db.query(`insert into public.contas_receber(id,matricula_id,turma_id,cliente_id,valor,valor_pago,
      data_vencimento,data_pagamento,status,origem_pagamento,updated_at,gateway_provider)
      values($1,$2,$3,$4,279.90,$5,'2026-09-15',$6,$7,'SISTEMA_ANTERIOR',now(),$8)`,
    [id(10 + n), enrollment, classId, person, paid, status === 'PAGO' ? '2026-09-15' : null, status, gateway]);
    await db.query(`insert into internal_proesc.obligation_links values($1,$2,$3,$4,'3145','123',$5,true)`,
      [id(20 + n), enrollment, classId, id(10 + n), String(100 + n)]);
  };
  const stage = async (row) => {
    await db.query(`select internal_proesc.v2_stage_invoice(t,$2::jsonb,clock_timestamp())
      from internal_proesc.v2_tasks t where t.id=$1`, [task.taskId, JSON.stringify(row)]);
    return scalar(`select id value from internal_proesc.v2_invoice_observations where run_id=$1 and invoice_id=$2`, [runId, row.invoiceId]);
  };
  const applyOne = (observationId) => scalar(`select internal_proesc.v2_apply_invoice($1,$2) value`, [actor, observationId]);
  await fixture(5);
  await db.exec(`update internal_proesc.obligation_links set auto_enabled=false where id='${id(25)}'`);
  const optOut = await stage(invoice(5, 'PAGA', 26000, '2026-09-15'));
  assert.equal(await applyOne(optOut), 'REVIEW');
  assert.equal(await scalar(`select reason value from internal_proesc.v2_invoice_observations where id=$1`, [optOut]), 'LINK_AUTOMATION_DISABLED');
  assert.equal(await scalar(`select status value from public.contas_receber where id='${id(15)}'`), 'PENDENTE');

  await fixture(6);
  await db.query(`insert into internal_proesc.financial_snapshots(id,link_id,observed_at,principal_cents,
    source_status,verification,evidence_kind,components,accounting_lines) values
    ($1,$3,now()-interval '2 days',27990,'CANCELED','REVIEW','API_PAYMENT_TOTAL','{}','[]'),
    ($2,$3,now()-interval '1 day',27990,'UNKNOWN','REVIEW','API_PAYMENT_TOTAL','{}','[]')`, [id(70), id(71), id(26)]);
  const cancelled = await stage(invoice(6, 'VENCIDO', 0));
  assert.equal(await applyOne(cancelled), 'REVIEW');
  assert.equal(await scalar(`select reason value from internal_proesc.v2_invoice_observations where id=$1`, [cancelled]),
    'HISTORICAL_CANCELLATION_REQUIRES_REVIEW');
  assert.equal(await scalar(`select count(*)::int value from internal_proesc.financial_snapshots where link_id='${id(26)}'`), 2);

  await fixture(7, 'PAGO', 260);
  const corrected = await stage(invoice(7, 'PAGA', 27990, '2026-09-15'));
  assert.equal(await applyOne(corrected), 'REVIEW');
  assert.equal(Number(await scalar(`select valor_pago value from public.contas_receber where id='${id(17)}'`)), 260);
  await fixture(8, 'PENDENTE', 0, 'banese');
  const protectedTitle = await stage(invoice(8, 'PAGA', 27990, '2026-09-15'));
  await assert.rejects(applyOne(protectedTitle), /Protected gateway/);

  await fixture(9);
  const wrongPerson = await stage({ ...invoice(9, 'PAGA', 27990, '2026-09-15'), personHash: 'b'.repeat(64) });
  assert.equal(await applyOne(wrongPerson), 'REVIEW');
  assert.equal(await scalar(`select status value from public.contas_receber where id='${id(19)}'`), 'PENDENTE');
  await fixture(10);
  await db.query(`insert into internal_proesc.v2_people_observations(run_id,task_id,unit_id,person_id,person_hash,
    enrollments,matched,review,observed_at) values($1,$2,'3145','12',$3,
      '[{"sourceEnrollmentId":"23","sourceClassId":"123"}]',0,1,now())`, [runId, people.taskId, personHash]);
  const ambiguous = await stage(invoice(10, 'PAGA', 27990, '2026-09-15'));
  assert.equal(await applyOne(ambiguous), 'REVIEW');
  assert.equal(await scalar(`select reason value from internal_proesc.v2_invoice_observations where id=$1`, [ambiguous]),
    'AMBIGUOUS_REMOTE_ENROLLMENT', 'A later duplicate must also block the initially pinned enrollment');
  await db.query(`delete from internal_proesc.v2_people_observations where run_id=$1 and person_id='12'`, [runId]);
  await fixture(11, 'PAGO', 260);
  const equalUnverified = await stage(invoice(11, 'PAGA', 26000, '2026-09-15'));
  assert.equal(await applyOne(equalUnverified), 'APPLIED', 'PAGA equal to local may confirm missing evidence without replacing any amount');
  assert.equal(Number(await scalar(`select valor_pago value from public.contas_receber where id='${id(21)}'`)), 260);

  await rpc('start', { runId: id(81), mode: 'RECENT' });
  const changedCredential = await rpc('claim');
  await db.query('update internal_proesc.connection_v2 set revision=$1', [id(80)]);
  assert.equal((await rpc('fail', { taskId: changedCredential.taskId, leaseId: changedCredential.leaseId,
    credentialRevision: revision, errorCode: 'CREDENTIAL_CHANGED' })).runFailed, true);
  await db.query('update internal_proesc.connection_v2 set revision=$1', [revision]);
  await rpc('start', { runId: id(82), mode: 'RECENT' });
  for (let attempt = 1; attempt <= 5; attempt++) {
    const abandoned = await rpc('claim');
    assert.equal(abandoned.claimed, true);
    await db.query(`update internal_proesc.v2_tasks set lease_until=now()-interval '1 second' where id=$1`, [abandoned.taskId]);
  }
  assert.equal((await rpc('claim')).runFailed, true, 'Five crashed workers cannot wedge a run forever');
  assert.equal((await rpc('start', { runId: id(83), mode: 'RECENT' })).status, 'RUNNING');
  console.log('PASS: V2 isolated schema, auth/replay, pagination/staging, real audited apply, partial preservation, opt-out, cancellation barrier, ambiguity, gateway protection, lease exhaustion, credential fencing and cutover.');
} finally { await db.close(); }
