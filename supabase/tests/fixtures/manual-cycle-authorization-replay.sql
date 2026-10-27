-- Isolated PostgreSQL schema: synthetic identities, no external services.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE SCHEMA internal_academic;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.uid', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.role', true), '')
$$;
CREATE FUNCTION public.gestor_has_financeiro_tab(text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.finance', true), '')::boolean
$$;
CREATE FUNCTION public.is_gestor_for_polo(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.polo', true), '')::uuid = $1
$$;
CREATE TABLE public.contas_receber (
  id uuid PRIMARY KEY, matricula_id uuid, turma_id uuid, polo_id uuid, cliente_id uuid,
  tipo_lancamento text, parcela_numero integer, origem_cronograma_id text,
  descricao text, valor numeric, data_vencimento date, status text,
  regra_financeira_tecnica_snapshot jsonb,
  gateway_boleto_issued_at timestamptz, gateway_payment_id text,
  gateway_payment_link_id text, gateway_boleto_linha_digitavel text,
  gateway_boleto_codigo_barras text, gateway_invoice_url text,
  gateway_bank_slip_url text, asaas_payment_id text, asaas_payment_link_id text,
  gateway_creation_token uuid, gateway_cnab_file_id uuid, gateway_submission_channel text,
  gateway_submission_status text, gateway_status text, gateway_boleto_nosso_numero text,
  gateway_provider text, gateway_environment text, gateway_payment_method text
);
CREATE TABLE public.matriculas(id uuid PRIMARY KEY, turma_id uuid, status text);
CREATE TABLE internal_academic.technical_manual_cycle_runs (
  matricula_id uuid, turma_id uuid, cycle_number smallint, state text,
  receivable_ids uuid[], request_id uuid, created_by uuid
);
CREATE TABLE internal_academic.technical_manual_receivable_issuance_authorizations (
  receivable_id uuid PRIMARY KEY, matricula_id uuid, turma_id uuid,
  cycle_number smallint, request_id uuid UNIQUE, receivable_fingerprint text,
  authorized_by uuid, authorized_at timestamptz, first_claimed_at timestamptz,
  last_claimed_at timestamptz, claim_count integer DEFAULT 0
);
CREATE TABLE public.historico_turma_financeira (
  matricula_id uuid, evento text, regra jsonb, descricao text
);
CREATE FUNCTION public.registrar_turma_financeiro_auditoria(uuid,text,jsonb,text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.historico_turma_financeira VALUES ($1,$2,$3,$4)
$$;
CREATE FUNCTION internal_academic.is_technical_manual_cycle_protected(uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('test.protected', true), '')::boolean, false)
$$;
CREATE FUNCTION internal_academic.technical_imported_c1_receivable_is_local_c2(uuid,uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION internal_academic.assert_manual_cycle_reviewed_receivable(public.contas_receber)
RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  IF coalesce(nullif(current_setting('test.reviewed', true), '')::boolean, true) IS NOT TRUE THEN
    RAISE EXCEPTION 'Reviewed snapshot mismatch.' USING ERRCODE='23514';
  END IF;
END $$;
CREATE FUNCTION internal_academic.manual_cycle_has_local_intent(public.contas_receber)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce($1.regra_financeira_tecnica_snapshot->>'destinoCobranca'='LOCAL',false)
$$;
-- Exact canonical fingerprint fields, native PostgreSQL SHA256 instead of pgcrypto.
CREATE FUNCTION internal_academic.technical_manual_receivable_issuance_fingerprint(public.contas_receber)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(jsonb_build_object(
    'versao',1,'receivableId',$1.id,'matriculaId',$1.matricula_id,
    'turmaId',$1.turma_id,'poloId',$1.polo_id,'clienteId',$1.cliente_id,
    'tipo',$1.tipo_lancamento,'parcelaNumero',$1.parcela_numero,
    'origem',$1.origem_cronograma_id,'descricao',$1.descricao,
    'valor',round($1.valor::numeric,2),'vencimento',$1.data_vencimento
  )::text,'UTF8')),'hex')
$$;
ALTER TABLE public.contas_receber ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_academic.technical_manual_receivable_issuance_authorizations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA public, internal_academic FROM PUBLIC, anon, authenticated, service_role;
