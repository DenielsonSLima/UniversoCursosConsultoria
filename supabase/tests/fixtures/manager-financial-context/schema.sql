CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA internal_academic;
CREATE SCHEMA internal_proesc;
CREATE TABLE public.contas_receber (
  id uuid PRIMARY KEY, matricula_id uuid, tipo_lancamento text, status text,
  regra_financeira_tecnica_snapshot jsonb, gateway_payment_id text,
  gateway_boleto_issued_at timestamptz, gateway_provider text, gateway_environment text,
  gateway_boleto_nosso_numero text, gateway_creation_token uuid, valor numeric,
  gateway_submission_channel text, gateway_submission_status text
);
CREATE TABLE public.payment_gateway_transactions (
  id uuid PRIMARY KEY, receivable_id uuid, provider_code text, environment text,
  payment_method text, remote_payment_id text, bank_slip_our_number text,
  amount numeric, raw_payload jsonb
);
CREATE TABLE internal_academic.technical_manual_cycle_runs (
  matricula_id uuid, cycle_number integer, state text, completed_at timestamptz,
  request_id uuid, receivable_ids uuid[], item_count integer
);
CREATE TABLE internal_academic.technical_imported_cycle_facts (
  matricula_id uuid, cycle_number integer, administration_origin text, confirmed_at timestamptz
);
CREATE TABLE internal_proesc.obligation_links (
  id uuid, receivable_id uuid, matricula_id uuid, source_key text, confirmed_at timestamptz, kind text default 'ORIGINAL'
);
CREATE TABLE internal_proesc.obligation_imports (link_id uuid, source_cycle text, source_fingerprint text);
CREATE TABLE internal_proesc.financial_snapshots (link_id uuid, source_fingerprint text);
CREATE FUNCTION internal_academic.technical_imported_cycle_has_confirmed(uuid,integer)
RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION internal_academic.technical_imported_cycle_has_conflict(uuid)
RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION internal_academic.manual_cycle_local_receivable_complete(public.contas_receber)
RETURNS boolean LANGUAGE sql AS $$
  SELECT coalesce($1.regra_financeira_tecnica_snapshot->>'localSemBoletoComprovado'='true',false)
$$;
