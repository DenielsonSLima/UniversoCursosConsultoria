begin;

create or replace function public.persist_banese_recovered_pix_v2(
  p_receivable_id uuid,
  p_environment text,
  p_nosso_numero text,
  p_pix_payload text,
  p_pix_encoded_image text,
  p_remote_digitable_line text,
  p_remote_barcode text,
  p_expected_amount numeric,
  p_expected_due_date date,
  p_expected_convenio text,
  p_replace_invalid_digitable_line boolean,
  p_reconciliation jsonb,
  p_expected_updated_at timestamptz,
  p_expected_status text,
  p_expected_gateway_status text,
  p_expected_gateway_last_error text,
  p_expected_financial_terms jsonb,
  p_expected_financial_terms_confirmed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
set statement_timeout = '45s'
as $function$
declare
  v_receivable public.contas_receber%rowtype;
  v_transaction public.payment_gateway_transactions%rowtype;
  v_transaction_count integer;
  v_transaction_our_number text;
begin
  if coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
      ''
    ) <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin', 'service_role')
  then
    raise exception 'Acesso negado a persistencia Pix-only Banese.'
      using errcode = '42501';
  end if;
  if p_expected_updated_at is null
    or coalesce(p_expected_status, '') not in (
      'PENDENTE', 'VENCIDO', 'AGUARDANDO_CONFIRMACAO'
    )
    or p_expected_financial_terms is null
    or jsonb_typeof(p_expected_financial_terms) <> 'object'
    or p_expected_financial_terms_confirmed_at is null
  then
    raise exception 'Snapshot esperado invalido para persistencia Pix-only Banese.';
  end if;

  select receivable.*
  into v_receivable
  from public.contas_receber as receivable
  where receivable.id = p_receivable_id
    and receivable.gateway_provider = 'banese_card'
    and receivable.gateway_environment = p_environment
    and receivable.gateway_payment_method = 'BOLETO'
  for update;

  if not found then
    raise exception 'Titulo Banese nao encontrado para persistencia Pix-only.';
  end if;
  if v_receivable.updated_at is distinct from p_expected_updated_at
    or v_receivable.status is distinct from p_expected_status
    or upper(coalesce(v_receivable.status, '')) not in (
      'PENDENTE', 'VENCIDO', 'AGUARDANDO_CONFIRMACAO'
    )
    or v_receivable.data_pagamento is not null
    or v_receivable.gateway_status is distinct from p_expected_gateway_status
    or upper(coalesce(v_receivable.gateway_status, '')) not in (
      '', '2', 'PENDING', 'OPEN', 'REGISTERED', 'CREATED',
      'REGISTERING', 'PROCESSING'
    )
    or v_receivable.gateway_last_error is distinct from
      p_expected_gateway_last_error
    or v_receivable.gateway_financial_terms is distinct from
      p_expected_financial_terms
    or v_receivable.gateway_financial_terms_confirmed_at is distinct from
      p_expected_financial_terms_confirmed_at
  then
    raise exception 'Titulo Banese mudou durante a consulta Pix-only.'
      using errcode = 'PT409';
  end if;

  select count(*)::integer
  into v_transaction_count
  from public.payment_gateway_transactions as transaction
  where transaction.receivable_id = p_receivable_id
    and transaction.provider_code = 'banese_card'
    and transaction.environment = p_environment
    and transaction.payment_method = 'BOLETO';
  if v_transaction_count <> 1 then
    raise exception 'Titulo Banese nao possui transacao canonica unica para Pix-only.';
  end if;

  select transaction.*
  into v_transaction
  from public.payment_gateway_transactions as transaction
  where transaction.receivable_id = p_receivable_id
    and transaction.provider_code = 'banese_card'
    and transaction.environment = p_environment
    and transaction.payment_method = 'BOLETO'
  for update;
  v_transaction_our_number := lpad(
    regexp_replace(
      coalesce(
        nullif(v_transaction.bank_slip_our_number, ''),
        v_transaction.remote_payment_id
      ),
      '\D',
      '',
      'g'
    ),
    9,
    '0'
  );
  if v_transaction_our_number is distinct from p_nosso_numero
    or round(v_transaction.amount::numeric, 2) is distinct from
      round(p_expected_amount, 2)
  then
    raise exception 'Transacao canonica Banese divergiu durante o Pix-only.'
      using errcode = 'PT409';
  end if;

  return public.persist_banese_recovered_pix(
    p_receivable_id,
    p_environment,
    p_nosso_numero,
    p_pix_payload,
    p_pix_encoded_image,
    p_remote_digitable_line,
    p_remote_barcode,
    p_expected_amount,
    p_expected_due_date,
    p_expected_convenio,
    p_replace_invalid_digitable_line,
    p_reconciliation
  );
end;
$function$;

revoke all on function public.persist_banese_recovered_pix_v2(
  uuid, text, text, text, text, text, text, numeric, date, text, boolean,
  jsonb, timestamptz, text, text, text, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.persist_banese_recovered_pix_v2(
  uuid, text, text, text, text, text, text, numeric, date, text, boolean,
  jsonb, timestamptz, text, text, text, jsonb, timestamptz
) to service_role;

comment on function public.persist_banese_recovered_pix_v2(
  uuid, text, text, text, text, text, text, numeric, date, text, boolean,
  jsonb, timestamptz, text, text, text, jsonb, timestamptz
) is
  'Persiste BolePix oficial somente se o recebivel continuar aberto e o snapshot financeiro permanecer identico sob lock.';

commit;
