import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

export const migrationSource = (name) => readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8');
const functionSource = (source, name) => {
  const start = source.search(new RegExp(`create or replace function public\\.${name}\\s*\\(`, 'i'));
  assert.ok(start >= 0, name);
  const text = source.slice(start);
  const tag = text.match(/\bas\s+(\$[a-z_]*\$)/i)[1];
  return text.slice(0, text.indexOf(`${tag};`, text.indexOf(tag) + tag.length) + tag.length + 1);
};
const blocks = (source) => [...source.matchAll(/do\s+(\$[a-z_]+\$)[\s\S]*?\1;/gi)].map((m) => m[0]);
const blockFor = (name, signature) => {
  const found = blocks(migrationSource(name)).filter((b) => b.includes(`'public.${signature}'::regprocedure`));
  assert.equal(found.length, 1, `${name}: unique function patch`);
  return found[0];
};

// Reconstruct the exact installed function definitions from versioned migrations.
// Fixtures are synthetic; no production row, token, URL or external API is used.
export async function installFixture(db) {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT '00000000-0000-4000-8000-000000000099'::uuid$$;
    CREATE FUNCTION public.is_gestor_global() RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
    CREATE FUNCTION public.gestor_has_module(text) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
    CREATE TABLE public.contas_receber(
      id uuid PRIMARY KEY,polo_id uuid,categoria text DEFAULT 'OUTROS_CREDITOS',
      gateway_provider text DEFAULT 'banese_card',gateway_payment_method text DEFAULT 'BOLETO',
      gateway_environment text DEFAULT 'production',matricula_id uuid,turma_id uuid,origem_cronograma_id uuid,
      tipo_lancamento text,origem_pagamento text,status text DEFAULT 'PENDENTE',valor_pago numeric,
      data_pagamento date,data_vencimento date DEFAULT current_date,
      gateway_submission_channel text DEFAULT 'API',gateway_submission_status text DEFAULT 'API_REGISTERED',
      gateway_boleto_nosso_numero text DEFAULT '123456789',gateway_financial_terms jsonb DEFAULT '{}',
      gateway_financial_terms_confirmed_at timestamptz DEFAULT now(),gateway_last_error text,asaas_last_error text,
      gateway_boleto_linha_digitavel text DEFAULT 'synthetic-line',gateway_boleto_codigo_barras text DEFAULT 'synthetic-barcode');
    CREATE TABLE public.emprestimos_financeiros(conta_receber_id uuid);
    CREATE TABLE public.banese_pdv_cancellation_jobs(receivable_id uuid,state text);
    CREATE TABLE public.payment_gateway_runtime_config(enabled boolean,active_environment text);
    INSERT INTO public.payment_gateway_runtime_config VALUES(true,'production');
    CREATE TABLE public.payment_gateway_routes(enabled boolean,provider_code text,payment_method text,modalidade text,environment text);
    INSERT INTO public.payment_gateway_routes VALUES(true,'banese_card','BOLETO','OUTROS_CREDITOS','production');
    CREATE TABLE public.payment_gateway_transactions(receivable_id uuid,provider_code text,environment text,
      payment_method text,remote_payment_id text,bank_slip_our_number text,bank_slip_digitable_line text,bank_slip_barcode text,raw_payload jsonb);
  `);
  const initial = migrationSource('20260727044535_banese_reconciliation_control_center');
  for (const table of initial.matchAll(/create table if not exists public\.banese_reconciliation_[a-z_]+ \([\s\S]*?\n\);/g)) {
    await db.exec(table[0]);
  }
  await db.exec(`
    ALTER TABLE public.banese_reconciliation_profiles ADD COLUMN automatic_selectable boolean DEFAULT true,
      ADD COLUMN queue_strategy text DEFAULT 'GENERAL',ADD COLUMN max_concurrency integer DEFAULT 2,
      ADD COLUMN fallback_profile_id smallint DEFAULT 3;
    ALTER TABLE public.banese_reconciliation_config ADD COLUMN test_expires_at timestamptz;
    ALTER TABLE public.banese_reconciliation_runs ADD COLUMN config_version bigint;
    ALTER TABLE public.banese_reconciliation_runs DROP CONSTRAINT banese_reconciliation_runs_target_titles_check;
    ALTER TABLE public.banese_reconciliation_queue DROP CONSTRAINT banese_reconciliation_queue_state_check;
    CREATE UNIQUE INDEX banese_reconciliation_one_running_per_environment_idx
      ON public.banese_reconciliation_runs(environment) WHERE status='RUNNING';
    INSERT INTO public.banese_reconciliation_profiles(id,name,titles_per_minute,estimated_requests_per_minute,group_name,selectable,source_note)
      VALUES(3,'fixture P3',40,80,'CONSERVATIVE',true,'synthetic'),(4,'fixture P4',80,160,'CONSERVATIVE',true,'synthetic'),
      (6,'fixture P6',180,360,'CONSERVATIVE',true,'synthetic');
    INSERT INTO public.banese_reconciliation_config(environment,effective_profile_id,last_stable_profile_id)
      VALUES('production',3,3);
  `);
  const prepare = 'prepare_banese_reconciliation_batch_v3()';
  const finish = 'finish_banese_reconciliation_run(uuid,integer,boolean,integer)';
  const progress = 'get_banese_reconciliation_autopilot_progress()';
  await db.exec(functionSource(migrationSource('20260813034453_prepare_banese_reconciliation_batch_atomically'), prepare.split('(')[0]));
  await db.exec(functionSource(migrationSource('20260727062857_rollback_banese_profile_on_auth_failure'), finish.split('(')[0]));
  await db.exec(functionSource(migrationSource('20260727061428_harden_banese_autopilot_p10_and_worker_fencing'), progress.split('(')[0]));
  for (const signature of [prepare, finish, progress]) {
    await db.exec(blockFor('20260827005500_define_banese_automatic_p3_p9_policy', signature));
  }
  for (const name of ['20260827224500_persist_banese_recovered_pix_atomically',
    '20260829194500_exclude_legacy_banese_imports_from_automatic_reconciliation',
    '20260829203000_restore_verified_banese_imports_to_reconciliation']) {
    await db.exec(blockFor(name, prepare));
  }
  // The original maintenance block also requeues specific historical data. Only
  // its function replacement is relevant to these synthetic fixtures.
  let normalization = blockFor('20260829234500_requeue_banese_quarantine_after_normalized_recheck', prepare);
  normalization = normalization.slice(0, normalization.indexOf('  select count(*) into v_radiology_count')) + 'end;\n$migration$;';
  await db.exec(normalization);
  await db.exec(blockFor('20260830154500_cap_banese_automatic_profile_at_p6', progress));
  await db.exec(`ALTER FUNCTION public.${progress} SET search_path='';`);
  for (const signature of [prepare, finish]) {
    await db.exec(blockFor('20260830154500_cap_banese_automatic_profile_at_p6', signature));
    await db.exec(`ALTER FUNCTION public.${signature} SET search_path='';
      ALTER FUNCTION public.${signature} SET lock_timeout='2s';
      ALTER FUNCTION public.${signature} SET statement_timeout='7s';
      REVOKE ALL ON FUNCTION public.${signature} FROM public,anon,authenticated;
      GRANT EXECUTE ON FUNCTION public.${signature} TO service_role;`);
  }
  await db.exec(`ALTER FUNCTION public.${prepare} SECURITY INVOKER;`);
}
