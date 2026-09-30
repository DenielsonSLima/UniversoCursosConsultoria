begin;
set local lock_timeout = '5s';

do $guard$
declare v_definition text := pg_get_functiondef(
  'public.enforce_receivable_gateway_submission_fence()'::regprocedure);
begin
  if md5(v_definition) <> '87090839a344c05ff7bde2c33c15cb3a'
    or position(
      'technical_manual_banese_reissue_bypass_valid(old.id)' in
      v_definition) = 0
    or position('banese_ead_replacement_bypass_valid(old.id)' in
      v_definition) = 0
    or position('when ''API_REVIEW'' then' in v_definition) = 0
  then
    raise exception 'Canonical gateway submission fence drifted; one-off aborted.';
  end if;
end;
$guard$;

create or replace function public.enforce_receivable_gateway_submission_fence()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_reset_fields text[] := array[
    'gateway_payment_id', 'gateway_customer_id', 'gateway_payment_link_id',
    'gateway_installment_id', 'gateway_status', 'gateway_invoice_url',
    'gateway_bank_slip_url', 'gateway_pix_payload',
    'gateway_pix_encoded_image', 'gateway_transaction_receipt_url',
    'gateway_fee_value', 'gateway_net_value', 'gateway_synced_at',
    'gateway_last_error', 'gateway_boleto_linha_digitavel',
    'gateway_boleto_codigo_barras', 'gateway_boleto_nosso_numero',
    'gateway_boleto_issued_at', 'gateway_financial_terms_confirmed_at',
    'gateway_creation_token', 'gateway_submission_channel',
    'gateway_submission_status', 'gateway_cnab_file_id'
  ];
begin
  if internal_academic.technical_manual_due_date_correction_bypass_valid(old.id)
    and old.gateway_submission_channel = 'API'
    and old.gateway_submission_status = 'API_REGISTERED'
    and old.data_vencimento = date '2027-10-15'
    and new.data_vencimento = date '2026-10-15'
    and new.gateway_submission_channel is null
    and new.gateway_submission_status is null
    and new.gateway_cnab_file_id is null
    and new.gateway_creation_token is null
    and new.gateway_status is null
    and new.gateway_payment_id is null
    and new.gateway_customer_id is null
    and new.gateway_payment_link_id is null
    and new.gateway_installment_id is null
    and new.gateway_invoice_url is null
    and new.gateway_bank_slip_url is null
    and new.gateway_transaction_receipt_url is null
    and new.gateway_fee_value is null
    and new.gateway_net_value is null
    and new.gateway_synced_at is null
    and new.gateway_last_error is null
    and new.gateway_boleto_nosso_numero is null
    and new.gateway_boleto_issued_at is null
    and new.gateway_boleto_linha_digitavel is null
    and new.gateway_boleto_codigo_barras is null
    and new.gateway_pix_payload is null
    and new.gateway_pix_encoded_image is null
    and new.gateway_financial_terms_confirmed_at is null
    and new.gateway_financial_terms =
      internal_academic.technical_manual_banese_expected_terms(new)
    and new.updated_at > old.updated_at
    and to_jsonb(new) - (
      v_reset_fields || array[
        'updated_at', 'data_vencimento', 'gateway_financial_terms'
      ]) is not distinct from to_jsonb(old) - (
      v_reset_fields || array[
        'updated_at', 'data_vencimento', 'gateway_financial_terms'
      ])
  then
    return new;
  end if;
  if internal_academic.technical_manual_banese_reissue_bypass_valid(old.id)
    and old.gateway_submission_channel = 'API'
    and old.gateway_submission_status = 'API_REVIEW'
    and new.gateway_submission_channel is null
    and new.gateway_submission_status is null
    and new.gateway_cnab_file_id is null
    and new.gateway_creation_token is null
    and new.gateway_status is null
    and new.gateway_payment_id is null
    and new.gateway_customer_id is null
    and new.gateway_payment_link_id is null
    and new.gateway_installment_id is null
    and new.gateway_invoice_url is null
    and new.gateway_bank_slip_url is null
    and new.gateway_transaction_receipt_url is null
    and new.gateway_fee_value is null
    and new.gateway_net_value is null
    and new.gateway_synced_at is null
    and new.gateway_last_error is null
    and new.gateway_boleto_nosso_numero is null
    and new.gateway_boleto_issued_at is null
    and new.gateway_boleto_linha_digitavel is null
    and new.gateway_boleto_codigo_barras is null
    and new.gateway_pix_payload is null
    and new.gateway_pix_encoded_image is null
    and new.gateway_financial_terms_confirmed_at is null
    and new.gateway_financial_terms is not distinct from old.gateway_financial_terms
    and new.updated_at > old.updated_at
    and to_jsonb(new) - (v_reset_fields || array['updated_at'])
      is not distinct from
      to_jsonb(old) - (v_reset_fields || array['updated_at'])
  then
    return new;
  end if;
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
      old.gateway_financial_terms_confirmed_at)
  then
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
      when 'API_REVIEW' then
        (
          coalesce(auth.role(), '') = 'service_role'
          or session_user in ('postgres', 'supabase_admin', 'service_role')
        )
        and new.gateway_submission_status = 'API_AMBIGUOUS'
        and current_setting(
          'app.technical_manual_cycle_review_reopen_receivable_id', true
        ) = old.id::text
        and old.gateway_submission_channel = 'API'
        and new.gateway_submission_channel = 'API'
        and new.gateway_creation_token is not distinct from
          old.gateway_creation_token
        and new.gateway_boleto_nosso_numero is not distinct from
          old.gateway_boleto_nosso_numero
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

commit;
