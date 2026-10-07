CREATE OR REPLACE FUNCTION internal_academic.guard_manual_technical_banese_atomic_completion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;
CREATE TRIGGER guard_manual_technical_banese_atomic_completion BEFORE UPDATE OF gateway_submission_status ON public.contas_receber FOR EACH ROW EXECUTE FUNCTION internal_academic.guard_manual_technical_banese_atomic_completion();
CREATE OR REPLACE FUNCTION public.banese_reconciliation_queue_receivable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_modality text;
  v_post_settlement_pending boolean;
  v_eligible boolean;
begin
  v_post_settlement_pending := upper(coalesce(new.status, '')) = 'PAGO'
    and left(coalesce(new.gateway_last_error, ''),
      char_length('BANESE_POST_SETTLEMENT_PENDING:')) =
      'BANESE_POST_SETTLEMENT_PENDING:';
  v_eligible := new.gateway_provider = 'banese_card'
    and new.gateway_payment_method = 'BOLETO'
    and new.gateway_environment in ('sandbox', 'production')
    and coalesce(new.gateway_submission_channel, '') = 'API'
    and new.gateway_cnab_file_id is null
    and coalesce(new.gateway_submission_status, '')
      in ('API_REGISTERED', 'API_AMBIGUOUS')
    and (
      new.gateway_submission_status <> 'API_AMBIGUOUS'
      or (
        new.gateway_creation_token is not null
        and upper(coalesce(new.gateway_status, '')) = 'CREATING'
      )
    )
    and coalesce(new.gateway_boleto_nosso_numero, '') ~ '^[0-9]{9}$'
    and (
      v_post_settlement_pending
      or (
        new.status in ('PENDENTE', 'VENCIDO', 'AGUARDANDO_CONFIRMACAO')
        and coalesce(new.gateway_status, '') not in (
          'PAID', 'RECEIVED', 'CONFIRMED', 'CANCELED', 'CANCELED_BY_BANK',
          'EXPIRED', 'REFUNDED', 'REJECTED', 'REJECTED_TIMEOUT', 'PROTESTED'
        )
      )
    );

  if not v_eligible then
    update public.banese_reconciliation_queue
    set state = case
          when state = 'LEASED' and lease_until > now() then 'LEASED'
          else 'DONE'
        end,
        next_check_at = null,
        lease_run_id = case
          when state = 'LEASED' and lease_until > now() then lease_run_id
          else null
        end,
        lease_until = case
          when state = 'LEASED' and lease_until > now() then lease_until
          else null
        end,
        last_result = coalesce(new.status, new.gateway_status, 'TERMINAL'),
        updated_at = now()
    where receivable_id = new.id;
    return new;
  end if;

  v_modality := public.banese_reconciliation_resolve_modality(
    new.id, new.turma_id, new.matricula_id
  );
  insert into public.banese_reconciliation_queue (
    receivable_id, environment, modality, priority, state,
    next_check_at, issued_at
  ) values (
    new.id, new.gateway_environment, v_modality,
    case
      when v_modality = 'EAD' then 10
      when v_modality in ('LIVRE', 'ESPECIALIZACAO') then 20
      when new.status = 'VENCIDO' then 35
      else 50
    end,
    'READY', now(), coalesce(new.gateway_boleto_issued_at, new.created_at, now())
  )
  on conflict (receivable_id) do update
  set environment = excluded.environment,
      modality = excluded.modality,
      priority = excluded.priority,
      state = case
        when public.banese_reconciliation_queue.state = 'LEASED'
          and public.banese_reconciliation_queue.lease_until > now()
          then 'LEASED'
        else 'READY'
      end,
      next_check_at = case
        when public.banese_reconciliation_queue.state = 'LEASED'
          and public.banese_reconciliation_queue.lease_until > now()
          then public.banese_reconciliation_queue.next_check_at
        else least(
          coalesce(public.banese_reconciliation_queue.next_check_at, now()),
          now()
        )
      end,
      updated_at = now();
  return new;
end;
$function$
;
CREATE TRIGGER trg_banese_reconciliation_queue_receivable AFTER INSERT OR UPDATE OF gateway_provider, gateway_payment_method, gateway_environment, gateway_boleto_nosso_numero, gateway_status, gateway_submission_channel, gateway_submission_status, gateway_cnab_file_id, gateway_creation_token, gateway_last_error, status, turma_id, matricula_id ON public.contas_receber FOR EACH ROW EXECUTE FUNCTION banese_reconciliation_queue_receivable();
