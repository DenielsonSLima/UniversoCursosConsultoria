alter table public.polos
  add column is_matriz boolean not null default false,
  add column cnpj text,
  add column cidade text,
  add column estado text;
update public.polos set is_matriz = true;

alter table public.parceiros add column cpf_cnpj text;
update public.parceiros set cpf_cnpj = '12345678901';

alter table public.contas_receber
  add column categoria text,
  add column forma_pagamento text,
  add column origem_pagamento text,
  add column origem_cronograma_id text,
  add column gateway_provider text,
  add column gateway_environment text,
  add column gateway_payment_method text,
  add column gateway_payment_id text,
  add column gateway_customer_id text,
  add column gateway_payment_link_id text,
  add column gateway_installment_id text,
  add column gateway_invoice_url text,
  add column gateway_bank_slip_url text,
  add column gateway_pix_payload text,
  add column gateway_pix_encoded_image text,
  add column gateway_transaction_receipt_url text,
  add column gateway_fee_value numeric(14,2),
  add column gateway_net_value numeric(14,2),
  add column gateway_synced_at timestamptz,
  add column gateway_last_error text,
  add column gateway_installments integer,
  add column gateway_issuer_polo_id uuid references public.polos(id),
  add column gateway_boleto_linha_digitavel text,
  add column gateway_boleto_codigo_barras text,
  add column gateway_boleto_nosso_numero text,
  add column gateway_boleto_convenio text,
  add column gateway_boleto_agencia text,
  add column gateway_financial_terms jsonb,
  add column gateway_financial_terms_confirmed_at timestamptz,
  add column gateway_boleto_issued_at timestamptz,
  add column gateway_creation_token uuid,
  add column gateway_submission_channel text,
  add column gateway_cnab_file_id uuid,
  add column manual_settlement_id uuid,
  add column manual_settlement_principal_cents bigint,
  add column manual_settlement_interest_cents bigint,
  add column manual_settlement_penalty_cents bigint,
  add column manual_settlement_addition_cents bigint,
  add column manual_settlement_discount_cents bigint,
  add column manual_settlement_received_cents bigint,
  add column manual_settlement_reversed_at timestamptz,
  add column gateway_settlement_channel text,
  add column gateway_settlement_source text,
  add column gateway_settlement_evidence jsonb,
  add column gateway_settlement_recorded_at timestamptz;

alter table public.contas_receber add constraint contas_receber_tipo_lancamento_check
  check (tipo_lancamento is null or tipo_lancamento in (
    'MATRICULA', 'PARCELA', 'REMATRICULA', 'DEPENDENCIA'
  ));
create unique index contas_receber_matricula_cronograma_uidx on
  public.contas_receber(matricula_id, origem_cronograma_id)
  where matricula_id is not null and origem_cronograma_id is not null;

create table public.payment_gateway_providers (
  code text primary key
);
insert into public.payment_gateway_providers values ('banese_card');
create table public.payment_gateway_credentials (
  id uuid primary key,
  provider_code text not null references public.payment_gateway_providers(code),
  environment text not null,
  metadata jsonb not null
);
create table public.payment_gateway_routes (
  id uuid primary key,
  modalidade text not null,
  payment_method text not null,
  environment text not null,
  provider_code text not null references public.payment_gateway_providers(code),
  credential_id uuid references public.payment_gateway_credentials(id),
  enabled boolean not null
);
create table public.payment_gateway_issuer_config (
  id integer primary key,
  issuer_polo_id uuid not null references public.polos(id),
  active boolean not null,
  applies_to_all_polos boolean not null
);
create table public.payment_gateway_transactions (
  id uuid primary key default gen_random_uuid(),
  receivable_id uuid references public.contas_receber(id) on delete cascade,
  provider_code text not null references public.payment_gateway_providers(code),
  environment text not null,
  payment_method text not null,
  remote_payment_id text,
  remote_customer_id text,
  remote_payment_link_id text,
  remote_installment_id text,
  remote_status text,
  amount numeric(14,2),
  fee_value numeric(14,2),
  net_value numeric(14,2),
  invoice_url text,
  bank_slip_url text,
  pix_payload text,
  pix_encoded_image text,
  transaction_receipt_url text,
  raw_payload jsonb not null default '{}'::jsonb,
  last_error text,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  origin_polo_id uuid references public.polos(id),
  issuer_polo_id uuid references public.polos(id),
  installments integer,
  bank_slip_digitable_line text,
  bank_slip_barcode text,
  bank_slip_our_number text
);
create unique index payment_gateway_transactions_banese_receivable_uidx on
  public.payment_gateway_transactions(receivable_id)
  where provider_code = 'banese_card';

insert into public.payment_gateway_credentials(
  id, provider_code, environment, metadata
) values (
  '00000000-0000-0000-0000-000000000801', 'banese_card', 'production',
  '{"baneseBoletoConvenio":"12345","baneseAgencia":"123","baneseConta":"123456789"}'
);
insert into public.payment_gateway_routes(
  id, modalidade, payment_method, environment, provider_code,
  credential_id, enabled
) values (
  '00000000-0000-0000-0000-000000000802', 'TECNICO', 'BOLETO',
  'production', 'banese_card',
  '00000000-0000-0000-0000-000000000801', true
);
insert into public.payment_gateway_issuer_config values (
  1, '00000000-0000-0000-0000-000000000010', true, true
);

create or replace function internal_academic.receivable_operation_capabilities(
  p_receivable public.contas_receber
) returns jsonb language sql stable as $function$
  select case when p_receivable.gateway_provider = 'banese_card'
    then jsonb_build_object(
      'sourceSystem', 'BANESE', 'canCancel', true,
      'provenanceKind', 'NATIVE_ISSUED'
    )
    else jsonb_build_object(
      'sourceSystem', case when p_receivable.gateway_submission_status = 'TEST_CONFLICT'
        then 'CONFLICT' else 'LOCAL' end,
      'canCancel', false, 'provenanceKind', 'LOCAL'
    ) end;
$function$;

update public.contas_receber set categoria = 'MENSALIDADE'
where categoria is null;

insert into public.contas_receber (
  id, polo_id, cliente_id, matricula_id, turma_id, valor, data_vencimento,
  status, descricao, parcela_numero, tipo_lancamento, categoria,
  regra_financeira_tecnica_snapshot
) values (
  '00000000-0000-0000-0000-000000000405',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000100',
  '00000000-0000-0000-0000-000000000300',
  '00000000-0000-0000-0000-000000000200', 150.00,
  (now() at time zone 'America/Maceio')::date + 75, 'PENDENTE',
  'Mensalidade sintetica para aprovacao', 5, 'PARCELA', 'MENSALIDADE',
  jsonb_build_object(
    'tipoLancamento', 'MENSALIDADE', 'origem', 'TURMA', 'valorBase', '150.00',
    'descontoPontualidade', '5.00', 'jurosAtrasoPercentual', '1.00',
    'multaAtrasoValor', '10.00', 'aplicarMultaJuros', true
  )
);

create or replace function public.is_gestor()
returns boolean language sql stable as $function$
  select auth.uid() is not null and coalesce(nullif(current_setting(
    'app.test_gestor_access', true), ''), 'true')::boolean;
$function$;
create or replace function public.gestor_has_any_module_for_polo(
  p_modules text[], p_polo_id uuid
) returns boolean language sql stable as $function$
  select auth.uid() is not null
    and coalesce(nullif(current_setting('app.test_module', true), ''),
      'financeiro') = any(coalesce(p_modules, array[]::text[]))
    and p_polo_id = coalesce(nullif(current_setting(
      'app.test_allowed_polo', true), '')::uuid,
      '00000000-0000-0000-0000-000000000010'::uuid);
$function$;
create or replace function public.gestor_has_any_global_module(p_modules text[])
returns boolean language sql stable as $function$ select false; $function$;
create or replace function public.gestor_has_effective_financeiro_tab(p_tab text)
returns boolean language sql stable as $function$
  select p_tab = 'receber' and coalesce(nullif(current_setting(
    'app.test_receber_tab', true), ''), 'true')::boolean;
$function$;
create or replace function public.is_financeiro_for_polo(p_polo_id uuid)
returns boolean language sql stable as $function$
  select public.is_gestor()
    and coalesce(nullif(current_setting('app.test_module', true), ''),
      'financeiro') = 'financeiro'
    and p_polo_id = coalesce(nullif(current_setting(
      'app.test_allowed_polo', true), '')::uuid,
      '00000000-0000-0000-0000-000000000010'::uuid);
$function$;
