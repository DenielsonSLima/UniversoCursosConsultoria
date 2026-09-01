begin;

create table if not exists public.banese_ead_ambiguous_recovery_targets (
  receivable_id uuid primary key references public.contas_receber(id),
  expected_provider text not null check (expected_provider = 'banese_card'),
  expected_environment text not null check (expected_environment = 'production'),
  expected_payment_method text not null check (expected_payment_method = 'BOLETO'),
  expected_convenio text not null check (expected_convenio ~ '^[0-9]+$'),
  expected_agencia text not null check (
    expected_agencia ~ '^[0-9]{3}$' and expected_agencia <> '000'
  ),
  expected_nosso_numero text not null check (
    expected_nosso_numero ~ '^[0-9]{9}$'
  ),
  expected_amount numeric not null check (expected_amount > 0),
  expected_due_date date not null,
  expected_creation_token uuid not null,
  state text not null default 'READY' check (
    state in ('READY', 'CLAIMED', 'DONE', 'FAILED_FINAL')
  ),
  attempts integer not null default 0 check (attempts between 0 and 1),
  claim_token uuid,
  claimed_at timestamptz,
  completed_at timestamptz,
  failure_code text,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  check (
    (receivable_id = 'f47cbf46-fe94-4c81-b845-dd7a265c7734'::uuid
      and expected_nosso_numero = '000097299')
    or (receivable_id = '1f2a1a90-9cff-4e81-b94e-2138953924e5'::uuid
      and expected_nosso_numero = '000097302')
  ),
  check (
    (state = 'READY' and attempts = 0 and claim_token is null and claimed_at is null
      and completed_at is null and failure_code is null)
    or (state = 'CLAIMED' and attempts = 1 and claim_token is not null
      and claimed_at is not null
      and completed_at is null and failure_code is null)
    or (state = 'DONE' and claim_token is null
      and completed_at is not null and failure_code is null)
    or (state = 'FAILED_FINAL' and claim_token is null
      and completed_at is not null
      and failure_code is not null)
  )
);

alter table public.banese_ead_ambiguous_recovery_targets enable row level security;
revoke all on public.banese_ead_ambiguous_recovery_targets
  from public, anon, authenticated;
grant select on public.banese_ead_ambiguous_recovery_targets to service_role;

with expected(receivable_id, nosso_numero) as (
  values
    ('f47cbf46-fe94-4c81-b845-dd7a265c7734'::uuid, '000097299'::text),
    ('1f2a1a90-9cff-4e81-b94e-2138953924e5'::uuid, '000097302'::text)
)
insert into public.banese_ead_ambiguous_recovery_targets (
  receivable_id, expected_provider, expected_environment,
  expected_payment_method, expected_convenio, expected_agencia,
  expected_nosso_numero, expected_amount, expected_due_date,
  expected_creation_token
)
select
  receivable.id, 'banese_card', 'production', 'BOLETO',
  receivable.gateway_boleto_convenio,
  receivable.gateway_boleto_agencia,
  receivable.gateway_boleto_nosso_numero,
  receivable.valor,
  receivable.data_vencimento,
  receivable.gateway_creation_token
from expected
join public.contas_receber as receivable
  on receivable.id = expected.receivable_id
where receivable.gateway_provider = 'banese_card'
  and receivable.gateway_environment = 'production'
  and receivable.gateway_payment_method = 'BOLETO'
  and receivable.gateway_boleto_convenio = '15261'
  and receivable.gateway_boleto_agencia = '033'
  and receivable.gateway_boleto_nosso_numero = expected.nosso_numero
  and receivable.gateway_creation_token is not null
  and receivable.gateway_status = 'CREATING'
  and receivable.gateway_submission_channel = 'API'
  and receivable.gateway_submission_status = 'API_AMBIGUOUS'
  and receivable.gateway_financial_terms is not null
  and receivable.gateway_financial_terms_confirmed_at is null
  and receivable.gateway_payment_id is null
  and receivable.gateway_payment_link_id is null
  and receivable.gateway_boleto_linha_digitavel is null
  and receivable.gateway_boleto_codigo_barras is null
  and receivable.gateway_boleto_issued_at is null
  and receivable.gateway_cnab_file_id is null
  and nullif(btrim(coalesce(receivable.gateway_pix_payload, '')), '') is null
  and nullif(btrim(coalesce(receivable.gateway_pix_encoded_image, '')), '') is null
  and receivable.status in ('PENDENTE', 'VENCIDO')
  and receivable.data_pagamento is null
  and receivable.valor_pago is null
  and not exists (
    select 1 from public.payment_gateway_transactions as transaction
    where transaction.receivable_id = receivable.id
  )
on conflict (receivable_id) do nothing;

do $seed_guard$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.banese_ead_ambiguous_recovery_targets as target
  join public.contas_receber as receivable
    on receivable.id = target.receivable_id
  where (target.receivable_id, target.expected_nosso_numero) in (
    ('f47cbf46-fe94-4c81-b845-dd7a265c7734'::uuid, '000097299'),
    ('1f2a1a90-9cff-4e81-b94e-2138953924e5'::uuid, '000097302')
  ) and target.state = 'READY' and target.attempts = 0
    and target.expected_amount = receivable.valor
    and target.expected_due_date = receivable.data_vencimento
    and target.expected_creation_token = receivable.gateway_creation_token
    and receivable.gateway_status = 'CREATING'
    and receivable.gateway_submission_channel = 'API'
    and receivable.gateway_submission_status = 'API_AMBIGUOUS';

  if v_count <> 2 then
    raise exception 'Os dois titulos EAD ambiguos nao passaram nas guardas.';
  end if;
end;
$seed_guard$;

create or replace function public.claim_banese_ead_ambiguous_recovery_target()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_target public.banese_ead_ambiguous_recovery_targets%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_ready boolean;
  v_claim_token uuid;
begin
  select * into v_target
  from public.banese_ead_ambiguous_recovery_targets as target
  where target.state = 'CLAIMED' and target.attempts = 1
    and target.claimed_at <= v_now - interval '5 minutes'
  order by target.claimed_at, target.receivable_id
  limit 1
  for update skip locked;

  if found then
    select exists (
      select 1
      from public.contas_receber as receivable
      where receivable.id = v_target.receivable_id
        and receivable.gateway_provider = v_target.expected_provider
        and receivable.gateway_environment = v_target.expected_environment
        and receivable.gateway_payment_method = v_target.expected_payment_method
        and receivable.gateway_boleto_convenio = v_target.expected_convenio
        and receivable.gateway_boleto_agencia = v_target.expected_agencia
        and receivable.gateway_boleto_nosso_numero = v_target.expected_nosso_numero
        and receivable.gateway_submission_channel = 'API'
        and receivable.gateway_submission_status = 'API_REGISTERED'
        and receivable.gateway_creation_token is null
        and coalesce(receivable.gateway_status, '') not in ('', 'CREATING')
        and receivable.gateway_payment_id = v_target.expected_nosso_numero
        and receivable.gateway_boleto_linha_digitavel ~ '^[0-9]{47}$'
        and receivable.gateway_boleto_codigo_barras ~ '^[0-9]{44}$'
        and receivable.gateway_boleto_issued_at is not null
        and receivable.gateway_financial_terms_confirmed_at is not null
        and receivable.gateway_cnab_file_id is null
        and receivable.status in ('PENDENTE', 'VENCIDO', 'PAGO')
        and (select count(*) from public.payment_gateway_transactions as transaction
          where transaction.receivable_id = receivable.id) = 1
        and exists (
          select 1
          from public.payment_gateway_transactions as transaction
          where transaction.receivable_id = receivable.id
            and transaction.provider_code = v_target.expected_provider
            and transaction.environment = v_target.expected_environment
            and transaction.payment_method = v_target.expected_payment_method
            and transaction.remote_payment_id = v_target.expected_nosso_numero
            and transaction.bank_slip_our_number = v_target.expected_nosso_numero
            and transaction.bank_slip_digitable_line =
              receivable.gateway_boleto_linha_digitavel
            and transaction.bank_slip_barcode =
              receivable.gateway_boleto_codigo_barras
            and round(transaction.amount::numeric, 2) =
              round(v_target.expected_amount, 2)
        )
    ) into v_ready;

    update public.banese_ead_ambiguous_recovery_targets
    set state = case when v_ready then 'DONE' else 'FAILED_FINAL' end,
        claim_token = null,
        completed_at = v_now,
        failure_code = case when v_ready then null else 'INTERRUPTED' end,
        updated_at = v_now
    where receivable_id = v_target.receivable_id and state = 'CLAIMED';

    if not v_ready then
      update public.contas_receber as receivable
      set gateway_last_error =
          'BANESE_EAD_AMBIGUOUS_REVIEW: consulta interrompida; nao reemitir.',
          updated_at = v_now
      where receivable.id = v_target.receivable_id
        and receivable.gateway_creation_token = v_target.expected_creation_token
        and receivable.gateway_status = 'CREATING'
        and receivable.gateway_submission_channel = 'API'
        and receivable.gateway_submission_status = 'API_AMBIGUOUS';
      update public.banese_reconciliation_queue
      set state = 'QUARANTINED', next_check_at = null,
          lease_run_id = null, lease_until = null,
          last_checked_at = v_now, last_result = 'ERROR',
          last_error_class = 'EAD_AMBIGUOUS_FINAL_REVIEW', updated_at = v_now
      where receivable_id = v_target.receivable_id
        and environment = v_target.expected_environment;
    end if;
  end if;

  select * into v_target
  from public.banese_ead_ambiguous_recovery_targets as target
  where target.state = 'READY' and target.attempts = 0
  order by target.receivable_id
  limit 1
  for update skip locked;
  if not found then return null; end if;

  select exists (
    select 1
    from public.contas_receber as receivable
    where receivable.id = v_target.receivable_id
      and receivable.gateway_provider = v_target.expected_provider
      and receivable.gateway_environment = v_target.expected_environment
      and receivable.gateway_payment_method = v_target.expected_payment_method
      and receivable.gateway_boleto_convenio = v_target.expected_convenio
      and receivable.gateway_boleto_agencia = v_target.expected_agencia
      and receivable.gateway_boleto_nosso_numero = v_target.expected_nosso_numero
      and round(receivable.valor::numeric, 2) = round(v_target.expected_amount, 2)
      and receivable.data_vencimento = v_target.expected_due_date
      and receivable.gateway_creation_token = v_target.expected_creation_token
      and receivable.gateway_status = 'CREATING'
      and receivable.gateway_submission_channel = 'API'
      and receivable.gateway_submission_status = 'API_AMBIGUOUS'
      and receivable.gateway_financial_terms is not null
      and receivable.gateway_financial_terms_confirmed_at is null
      and receivable.gateway_payment_id is null
      and receivable.gateway_payment_link_id is null
      and receivable.gateway_boleto_linha_digitavel is null
      and receivable.gateway_boleto_codigo_barras is null
      and receivable.gateway_boleto_issued_at is null
      and receivable.gateway_cnab_file_id is null
      and nullif(btrim(coalesce(receivable.gateway_pix_payload, '')), '') is null
      and nullif(btrim(coalesce(receivable.gateway_pix_encoded_image, '')), '') is null
      and receivable.status in ('PENDENTE', 'VENCIDO')
      and receivable.data_pagamento is null
      and receivable.valor_pago is null
      and not exists (
        select 1 from public.payment_gateway_transactions as transaction
        where transaction.receivable_id = receivable.id
      )
  ) into v_ready;

  if not v_ready then
    update public.banese_ead_ambiguous_recovery_targets
    set state = 'FAILED_FINAL', completed_at = v_now,
        failure_code = 'STATE_DIVERGED', updated_at = v_now
    where receivable_id = v_target.receivable_id and state = 'READY';
    update public.banese_reconciliation_queue
    set state = 'QUARANTINED', next_check_at = null,
        lease_run_id = null, lease_until = null,
        last_checked_at = v_now, last_result = 'ERROR',
        last_error_class = 'EAD_AMBIGUOUS_FINAL_REVIEW', updated_at = v_now
    where receivable_id = v_target.receivable_id
      and environment = v_target.expected_environment;
    return jsonb_build_object('finalized', true);
  end if;

  v_claim_token := extensions.gen_random_uuid();
  update public.banese_ead_ambiguous_recovery_targets
  set state = 'CLAIMED', attempts = 1, claim_token = v_claim_token,
      claimed_at = v_now, updated_at = v_now
  where receivable_id = v_target.receivable_id and state = 'READY' and attempts = 0;

  return jsonb_build_object(
    'receivableId', v_target.receivable_id,
    'nossoNumero', v_target.expected_nosso_numero,
    'claimToken', v_claim_token
  );
end;
$function$;

create or replace function public.complete_banese_ead_ambiguous_recovery_target(
  p_receivable_id uuid,
  p_claim_token uuid,
  p_success boolean,
  p_failure_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_target public.banese_ead_ambiguous_recovery_targets%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_ready boolean;
  v_failure_code text;
begin
  select * into v_target
  from public.banese_ead_ambiguous_recovery_targets as target
  where target.receivable_id = p_receivable_id
  for update;
  if not found then raise exception 'Alvo EAD Banese inexistente.'; end if;
  if v_target.state = 'DONE' then return true; end if;
  if v_target.state = 'FAILED_FINAL' then return false; end if;
  if v_target.state <> 'CLAIMED' or v_target.attempts <> 1
    or p_claim_token is null or v_target.claim_token <> p_claim_token
  then
    raise exception 'Alvo EAD Banese nao esta sob claim.';
  end if;

  select exists (
    select 1
    from public.contas_receber as receivable
    where receivable.id = v_target.receivable_id
      and receivable.gateway_provider = v_target.expected_provider
      and receivable.gateway_environment = v_target.expected_environment
      and receivable.gateway_payment_method = v_target.expected_payment_method
      and receivable.gateway_boleto_convenio = v_target.expected_convenio
      and receivable.gateway_boleto_agencia = v_target.expected_agencia
      and receivable.gateway_boleto_nosso_numero = v_target.expected_nosso_numero
      and round(receivable.valor::numeric, 2) = round(v_target.expected_amount, 2)
      and receivable.data_vencimento = v_target.expected_due_date
      and receivable.gateway_submission_channel = 'API'
      and receivable.gateway_submission_status = 'API_REGISTERED'
      and receivable.gateway_creation_token is null
      and coalesce(receivable.gateway_status, '') not in ('', 'CREATING')
      and receivable.gateway_payment_id = v_target.expected_nosso_numero
      and receivable.gateway_boleto_linha_digitavel ~ '^[0-9]{47}$'
      and receivable.gateway_boleto_codigo_barras ~ '^[0-9]{44}$'
      and receivable.gateway_boleto_issued_at is not null
      and receivable.gateway_financial_terms_confirmed_at is not null
      and receivable.gateway_cnab_file_id is null
      and receivable.status in ('PENDENTE', 'VENCIDO', 'PAGO')
      and (select count(*) from public.payment_gateway_transactions as transaction
        where transaction.receivable_id = receivable.id) = 1
      and exists (
        select 1
        from public.payment_gateway_transactions as transaction
        where transaction.receivable_id = receivable.id
          and transaction.provider_code = v_target.expected_provider
          and transaction.environment = v_target.expected_environment
          and transaction.payment_method = v_target.expected_payment_method
          and transaction.remote_payment_id = v_target.expected_nosso_numero
          and transaction.bank_slip_our_number = v_target.expected_nosso_numero
          and transaction.bank_slip_digitable_line =
            receivable.gateway_boleto_linha_digitavel
          and transaction.bank_slip_barcode =
            receivable.gateway_boleto_codigo_barras
          and round(transaction.amount::numeric, 2) =
            round(v_target.expected_amount, 2)
      )
  ) into v_ready;

  if v_ready then
    update public.banese_ead_ambiguous_recovery_targets
    set state = 'DONE', claim_token = null,
        completed_at = v_now, failure_code = null,
        updated_at = v_now
    where receivable_id = p_receivable_id and state = 'CLAIMED';
    return true;
  end if;

  v_failure_code := case
    when p_success then 'SUCCESS_STATE_INCOMPLETE'
    when coalesce(btrim(p_failure_code), '') ~ '^[A-Z0-9_]{1,64}$'
      then btrim(p_failure_code)
    else 'GET_RECONCILIATION_FAILED'
  end;
  update public.banese_ead_ambiguous_recovery_targets
  set state = 'FAILED_FINAL', claim_token = null, completed_at = v_now,
      failure_code = v_failure_code, updated_at = v_now
  where receivable_id = p_receivable_id and state = 'CLAIMED';

  update public.contas_receber as receivable
  set gateway_last_error =
      'BANESE_EAD_AMBIGUOUS_REVIEW: consulta nao confirmou; nao reemitir.',
      updated_at = v_now
  where receivable.id = v_target.receivable_id
    and receivable.gateway_provider = v_target.expected_provider
    and receivable.gateway_environment = v_target.expected_environment
    and receivable.gateway_payment_method = v_target.expected_payment_method
    and receivable.gateway_boleto_nosso_numero = v_target.expected_nosso_numero
    and receivable.gateway_creation_token = v_target.expected_creation_token
    and receivable.gateway_status = 'CREATING'
    and receivable.gateway_submission_channel = 'API'
    and receivable.gateway_submission_status = 'API_AMBIGUOUS';
  update public.banese_reconciliation_queue
  set state = 'QUARANTINED', next_check_at = null,
      lease_run_id = null, lease_until = null,
      last_checked_at = v_now, last_result = 'ERROR',
      last_error_class = 'EAD_AMBIGUOUS_FINAL_REVIEW', updated_at = v_now
  where receivable_id = v_target.receivable_id
    and environment = v_target.expected_environment;
  return false;
end;
$function$;

revoke all on function public.claim_banese_ead_ambiguous_recovery_target()
  from public, anon, authenticated;
grant execute on function public.claim_banese_ead_ambiguous_recovery_target()
  to service_role;
revoke all on function public.complete_banese_ead_ambiguous_recovery_target(
  uuid, uuid, boolean, text
) from public, anon, authenticated;
grant execute on function public.complete_banese_ead_ambiguous_recovery_target(
  uuid, uuid, boolean, text
) to service_role;

comment on table public.banese_ead_ambiguous_recovery_targets is
  'Lote fechado e sem retry para consultar dois titulos EAD ambiguos por GET.';

commit;
