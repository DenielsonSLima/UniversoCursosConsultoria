begin;
set local lock_timeout = '5s';

alter table public.contas_receber
  drop constraint if exists contas_receber_gateway_submission_status_check,
  drop constraint if exists contas_receber_gateway_submission_state_check;

alter table public.contas_receber
  add constraint contas_receber_gateway_submission_status_check
    check (
      gateway_submission_status is null
      or gateway_submission_status in (
        'API_AMBIGUOUS', 'API_REGISTERED', 'API_REVIEW',
        'CNAB_GENERATED', 'CNAB_SENT', 'CNAB_REGISTERED', 'CNAB_REJECTED'
      )
    ) not valid,
  add constraint contas_receber_gateway_submission_state_check
    check (
      coalesce(
        (
          gateway_submission_channel is null
          and gateway_submission_status is null
          and gateway_cnab_file_id is null
        ) or (
          gateway_submission_channel = 'API'
          and gateway_submission_status in (
            'API_AMBIGUOUS', 'API_REGISTERED', 'API_REVIEW'
          )
          and gateway_cnab_file_id is null
        ) or (
          gateway_submission_channel = 'CNAB'
          and gateway_submission_status in (
            'CNAB_GENERATED', 'CNAB_SENT', 'CNAB_REGISTERED', 'CNAB_REJECTED'
          )
          and gateway_cnab_file_id is not null
          and gateway_provider is not null
          and gateway_environment is not null
          and gateway_boleto_convenio is not null
          and jsonb_typeof(gateway_financial_terms) = 'object'
          and gateway_financial_terms_confirmed_at is not null
        ), false
      )
    ) not valid;

alter table public.contas_receber
  validate constraint contas_receber_gateway_submission_status_check;
alter table public.contas_receber
  validate constraint contas_receber_gateway_submission_state_check;

create or replace function public.enforce_receivable_gateway_submission_fence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if public.banese_ead_replacement_bypass_valid(old.id)
    and new.gateway_payment_id is null
    and new.gateway_payment_link_id is null
    and new.gateway_submission_channel is null
    and new.gateway_submission_status is null
    and new.gateway_cnab_file_id is null
    and new.gateway_financial_terms is null
    and new.gateway_financial_terms_confirmed_at is null
    and new.gateway_boleto_issued_at is null
    and new.gateway_boleto_linha_digitavel is null
    and new.gateway_boleto_codigo_barras is null
    and new.gateway_invoice_url is null and new.gateway_bank_slip_url is null
  then
    return new;
  end if;
  if old.gateway_submission_channel is null
    and new.gateway_submission_channel is null
    and old.gateway_submission_status is null
    and new.gateway_submission_status is null
    and new.gateway_cnab_file_id is null
    and new.gateway_provider = 'banese_card'
    and (new.gateway_boleto_issued_at is not null
      or new.gateway_payment_id is not null
      or new.gateway_payment_link_id is not null
      or new.gateway_boleto_linha_digitavel is not null
      or new.gateway_boleto_codigo_barras is not null
      or new.gateway_invoice_url is not null
      or new.gateway_bank_slip_url is not null)
  then
    new.gateway_submission_channel := 'API';
    new.gateway_submission_status := 'API_REGISTERED';
  end if;
  if old.gateway_submission_channel is not null
    and new.gateway_submission_channel is distinct from
      old.gateway_submission_channel
  then
    raise exception
      'O canal de registro externo do titulo nao pode ser trocado depois do claim.'
      using errcode = '23514';
  end if;
  if old.gateway_cnab_file_id is not null
    and new.gateway_cnab_file_id is distinct from old.gateway_cnab_file_id
  then
    raise exception 'A remessa CNAB vinculada ao titulo e imutavel.'
      using errcode = '23514';
  end if;
  if old.gateway_submission_channel = 'CNAB' and (
    new.gateway_financial_terms is distinct from old.gateway_financial_terms
    or new.gateway_financial_terms_confirmed_at is distinct from
      old.gateway_financial_terms_confirmed_at
  ) then
    raise exception 'O snapshot financeiro da remessa CNAB e imutavel.'
      using errcode = '23514';
  end if;
  if old.gateway_submission_status is not null
    and new.gateway_submission_status is distinct from
      old.gateway_submission_status
    and not coalesce(case old.gateway_submission_status
      when 'API_AMBIGUOUS' then new.gateway_submission_status in
        ('API_REGISTERED', 'API_REVIEW')
      when 'API_REGISTERED' then false
      when 'API_REVIEW' then false
      when 'CNAB_GENERATED' then new.gateway_submission_status in
        ('CNAB_SENT', 'CNAB_REGISTERED', 'CNAB_REJECTED')
      when 'CNAB_SENT' then new.gateway_submission_status in
        ('CNAB_REGISTERED', 'CNAB_REJECTED')
      when 'CNAB_REGISTERED' then new.gateway_submission_status =
        'CNAB_REJECTED'
      when 'CNAB_REJECTED' then new.gateway_submission_status =
        'CNAB_REGISTERED'
      else false end, false)
  then
    raise exception
      'Transicao invalida no fencing de registro externo do titulo.'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

revoke all on function public.enforce_receivable_gateway_submission_fence()
  from public, anon, authenticated;
grant execute on function public.enforce_receivable_gateway_submission_fence()
  to service_role;

comment on constraint contas_receber_gateway_submission_status_check
  on public.contas_receber is
  'API_REVIEW é terminal e somente sucede API_AMBIGUOUS sem liberar novo POST.';

commit;
