CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA internal_finance; CREATE SCHEMA internal_proesc;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.uid',true),'')::uuid;
$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('role',current_setting('test.role',true));
$$;
CREATE FUNCTION public.portal_identidade_institucional_acesso_liberado(uuid,text)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT current_setting('test.identity',true)='true'; $$;
CREATE FUNCTION public.is_active_status(text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(btrim($1)) IN ('ativo','active');
$$;
CREATE FUNCTION public.is_financeiro_for_polo(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT auth.uid() IS NOT NULL AND $1::text=current_setting('test.polo',true);
$$;
CREATE FUNCTION public.gestor_has_effective_financeiro_tab(text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT $1='outros-creditos' AND current_setting('test.tab',true)='true';
$$;
CREATE TABLE public.polos(id uuid PRIMARY KEY,status text NOT NULL DEFAULT 'ativo');
CREATE TABLE public.parceiros(id uuid PRIMARY KEY,cpf_cnpj text);
CREATE TABLE public.perfis_acesso(id uuid PRIMARY KEY,permissoes jsonb,restricao_horario jsonb);
CREATE TABLE public.usuarios_sistema(
  auth_user_id uuid PRIMARY KEY,perfil text,status text,perfil_acesso_id uuid,
  personalizar_permissoes boolean,permissoes jsonb,polo_ids uuid[],context text,restricao_horario jsonb
);
CREATE TABLE public.contas_receber(
  id uuid PRIMARY KEY,polo_id uuid,cliente_id uuid,descricao text,valor numeric,valor_pago numeric,
  data_vencimento date,data_pagamento date,status text,categoria text,tipo_lancamento text,
  origem_pagamento text,matricula_id uuid,turma_id uuid,origem_cronograma_id text,
  renegotiation_agreement_id uuid,ead_checkout_attempt_id uuid,forma_pagamento text,
  manual_settlement_id uuid,manual_settlement_reversed_at timestamptz,
  manual_settlement_received_cents bigint,manual_settlement_principal_cents bigint,
  manual_settlement_interest_cents bigint,manual_settlement_penalty_cents bigint,
  manual_settlement_addition_cents bigint,manual_settlement_discount_cents bigint,
  gateway_provider text,gateway_environment text,gateway_payment_method text,gateway_status text,
  gateway_payment_id text,gateway_issuer_polo_id uuid,gateway_creation_token uuid,gateway_cnab_file_id uuid,
  gateway_boleto_nosso_numero text,gateway_boleto_convenio text,gateway_boleto_agencia text,
  gateway_boleto_linha_digitavel text,gateway_boleto_codigo_barras text,gateway_boleto_issued_at timestamptz,
  gateway_submission_channel text,gateway_submission_status text,gateway_financial_terms jsonb,
  gateway_financial_terms_confirmed_at timestamptz,gateway_invoice_url text,gateway_bank_slip_url text,
  gateway_pix_payload text,gateway_transaction_receipt_url text,gateway_settlement_recorded_at timestamptz,
  gateway_settlement_evidence jsonb,gateway_settlement_source text,gateway_settlement_channel text,
  gateway_synced_at timestamptz,gateway_last_error text,
  asaas_payment_id text,nosso_numero_asaas text,asaas_invoice_url text,asaas_bank_slip_url text,
  asaas_synced_at timestamptz,asaas_last_error text,
  outros_creditos_plano_id uuid,outros_creditos_papel text,regra_financeira_outros_creditos_snapshot jsonb,
  regra_financeira_tecnica_snapshot jsonb,regra_financeira_plano_unico_snapshot jsonb,
  regra_financeira_dependencia_snapshot jsonb,regra_financeira_renegociacao_snapshot jsonb,
  created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.payment_gateway_transactions(
  id uuid PRIMARY KEY,receivable_id uuid,provider_code text,environment text,payment_method text,
  amount numeric,origin_polo_id uuid,issuer_polo_id uuid,remote_payment_id text,remote_status text,
  bank_slip_our_number text,bank_slip_digitable_line text,bank_slip_barcode text,
  transaction_receipt_url text,updated_at timestamptz,synced_at timestamptz,last_error text,raw_payload jsonb
);
CREATE TABLE public.banese_reconciliation_queue(
  receivable_id uuid PRIMARY KEY,state text,lease_run_id uuid,lease_until timestamptz,
  next_check_at timestamptz,last_result text,updated_at timestamptz
);
CREATE TABLE public.receivable_manual_settlements(receivable_id uuid);
CREATE TABLE internal_proesc.obligation_links(receivable_id uuid);
CREATE TABLE public.inscricoes_online(receivable_id uuid);
CREATE TABLE public.matricula_dependencia_cobrancas(conta_receber_id uuid);
CREATE TABLE public.convenios_financeiros_creditos(conta_receber_id uuid);
CREATE TABLE public.emprestimos_financeiros(conta_receber_id uuid);
CREATE TABLE public.receivable_renegotiation_source_items(receivable_id uuid,released_at timestamptz);
CREATE TABLE public.banese_cancellation_outbox(receivable_id uuid);
CREATE FUNCTION public.listar_outros_creditos_sem_convenios_core(p_polo_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.is_financeiro_for_polo(p_polo_id)
    OR NOT public.gestor_has_effective_financeiro_tab('outros-creditos') THEN
    RAISE EXCEPTION 'LIST_SCOPE_DENIED' USING ERRCODE='42501';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM public.contas_receber r
    WHERE polo_id=p_polo_id AND categoria='OUTROS_CREDITOS'),'[]'::jsonb);
END $$;
