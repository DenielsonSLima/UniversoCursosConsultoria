import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const actor = id(1), enrollment = id(2), classId = id(3), person = id(4), revision = id(5), runId = id(6);
const personHash = 'a'.repeat(64);
const migrationNames = [
  '20261002010000_proesc_v2_ingestion_schema.sql',
  '20261002010100_proesc_v2_observation_validation.sql',
  '20261002010200_proesc_v2_financial_projection.sql',
  '20261002010300_proesc_v2_persistent_runtime.sql',
  '20261002010400_proesc_v2_worker_and_cycle_readers.sql',
  '20261002010500_proesc_v2_monitor_runtime.sql',
];


const source = (name) => readFileSync(new URL(`../../migrations/${name}`, import.meta.url), 'utf8');
function functionSource(text, name) {
  const start = text.indexOf(`create function ${name}(`);
  assert.ok(start >= 0, name);
  const tail = text.slice(start);
  return tail.slice(0, tail.indexOf('\n$$;') + 4);
}

export async function createFixture(options = {}) {
  const db = options.db ?? new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA internal_proesc; CREATE SCHEMA internal_academic; CREATE SCHEMA extensions;
    CREATE SCHEMA vault; CREATE SCHEMA cron;
    ${options.nativePgcrypto
      ? 'CREATE EXTENSION pgcrypto WITH SCHEMA extensions;'
      : `CREATE FUNCTION extensions.digest(text,text) RETURNS bytea LANGUAGE plpgsql IMMUTABLE AS $$
      BEGIN IF $2<>'sha256' THEN RAISE EXCEPTION 'Unsupported fixture digest'; END IF;
      RETURN sha256(convert_to($1,'UTF8')); END $$;
    CREATE FUNCTION extensions.digest(bytea,text) RETURNS bytea LANGUAGE plpgsql IMMUTABLE AS $$
      BEGIN IF $2<>'sha256' THEN RAISE EXCEPTION 'Unsupported fixture digest'; END IF;
      RETURN sha256($1); END $$;
`}
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
  await db.exec('ALTER TABLE internal_proesc.obligation_links ADD COLUMN archived_receivable_id uuid');

  await db.exec(`
    ALTER TABLE public.contas_receber ADD COLUMN tipo_lancamento text,
      ADD COLUMN gateway_payment_id text,ADD COLUMN manual_settlement_id uuid,
      ADD COLUMN gateway_financial_terms jsonb,ADD COLUMN regra_financeira_tecnica_snapshot jsonb,
      ADD COLUMN gateway_creation_token uuid,ADD COLUMN gateway_submission_channel text,
      ADD COLUMN gateway_submission_status text,ADD COLUMN gateway_boleto_nosso_numero text,
      ADD COLUMN asaas_payment_id text,ADD COLUMN nosso_numero_asaas text;
    ALTER TABLE public.turmas ADD COLUMN codigo text,ADD COLUMN polo_id uuid;
    ALTER TABLE internal_proesc.obligation_links ADD COLUMN parent_link_id uuid;
    ALTER TABLE internal_proesc.class_scopes ADD COLUMN class_code text,ADD COLUMN polo_id uuid;
    ALTER TABLE internal_academic.technical_manual_cycle_runs ADD COLUMN receivable_ids uuid[];
    CREATE TABLE public.matriculas_tecnicas_financeiro_config(matricula_id uuid,override_ativo boolean);
    CREATE TABLE public.payment_gateway_transactions(receivable_id uuid);
    CREATE TABLE internal_proesc.portal_payment_confirmations(request_id uuid PRIMARY KEY,actor_id uuid,
      link_id uuid,observation_id uuid REFERENCES internal_proesc.v2_invoice_observations(id),snapshot_id uuid,
      payload jsonb,payload_hash text,evidence_reference text,approval_reference text,executed_by text,
      database_session text,transaction_id bigint,response jsonb,created_at timestamptz DEFAULT now());
  `);
  for (const name of ['v2_apply_invoice','v2_calculated_composition_candidate',
    'v2_net_discount_candidate','confirm_portal_payment']) {
    const sql = readFileSync(new URL(`./proesc-v2-growth/fixture_${name}.sql`, import.meta.url), 'utf8');
    await db.exec(sql.replace(/create function/i,'CREATE OR REPLACE FUNCTION'));
  }
  await db.exec(`REVOKE ALL ON FUNCTION internal_proesc.v2_calculated_composition_candidate(uuid,uuid),
    internal_proesc.v2_net_discount_candidate(uuid,uuid),internal_proesc.confirm_portal_payment(uuid,uuid,jsonb)
    FROM PUBLIC,anon,authenticated,service_role;`);
  return { db, id, actor, enrollment, classId, person, revision, runId, personHash };
}
