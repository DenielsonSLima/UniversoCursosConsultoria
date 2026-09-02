begin;
set local lock_timeout = '5s';

create or replace function
internal_academic.guard_manual_technical_banese_atomic_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_context text;
  v_transaction_count integer;
begin
  if new.gateway_submission_status is not distinct from
      old.gateway_submission_status
    or new.gateway_submission_status is distinct from 'API_REGISTERED'
    or not exists (
      select 1
      from internal_academic.technical_manual_cycle_runs run
      where new.id = any(run.receivable_ids)
        and run.matricula_id = new.matricula_id
        and run.turma_id = new.turma_id
        and run.state = 'LOCAL_CREATED'
    )
  then
    return new;
  end if;

  v_context := nullif(current_setting(
    'app.technical_manual_cycle_atomic_receivable_id', true
  ), '');
  if v_context is distinct from new.id::text
    or new.gateway_provider <> 'banese_card'
    or new.gateway_environment <> 'production'
    or new.gateway_payment_method <> 'BOLETO'
    or new.forma_pagamento <> 'BOLETO'
    or new.gateway_boleto_issued_at is null
    or new.gateway_financial_terms is null
    or new.gateway_financial_terms_confirmed_at is null
    or coalesce(new.gateway_payment_id, '') !~ '^[0-9]{9}$'
    or coalesce(new.gateway_boleto_nosso_numero, '') !~ '^[0-9]{9}$'
    or coalesce(new.gateway_boleto_linha_digitavel, '') !~ '^[0-9]{47}$'
    or coalesce(new.gateway_boleto_codigo_barras, '') !~ '^[0-9]{44}$'
    or length(btrim(coalesce(new.gateway_pix_payload, '')))
      not between 30 and 600
    or length(btrim(coalesce(new.gateway_pix_encoded_image, '')))
      not between 32 and 1500022
  then
    raise exception 'Conclusão BolePix do ciclo manual está incompleta.'
      using errcode = '23514';
  end if;

  select count(*)::integer into v_transaction_count
  from public.payment_gateway_transactions transaction
  where transaction.receivable_id = new.id
    and transaction.provider_code = 'banese_card'
    and transaction.environment = 'production'
    and transaction.payment_method = 'BOLETO'
    and transaction.remote_payment_id = new.gateway_payment_id
    and transaction.bank_slip_our_number = new.gateway_boleto_nosso_numero
    and transaction.bank_slip_digitable_line =
      new.gateway_boleto_linha_digitavel
    and transaction.bank_slip_barcode = new.gateway_boleto_codigo_barras
    and transaction.pix_payload = new.gateway_pix_payload
    and transaction.pix_encoded_image = new.gateway_pix_encoded_image;
  if v_transaction_count <> 1 then
    raise exception 'Conclusão BolePix exige exatamente uma transação canônica.'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

revoke all on function
  internal_academic.guard_manual_technical_banese_atomic_completion()
  from public, anon, authenticated, service_role;

comment on function
  internal_academic.guard_manual_technical_banese_atomic_completion()
  is 'Valida somente transições para API_REGISTERED; reset autenticado para NULL segue pelas guardas específicas de reemissão.';

commit;
