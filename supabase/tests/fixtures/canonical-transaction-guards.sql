CREATE OR REPLACE FUNCTION internal_academic.guard_technical_due_date_overlay_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_overlay internal_academic.technical_manual_banese_due_date_overlay%rowtype;
  v_job internal_academic.technical_manual_banese_reissue_jobs%rowtype;
begin
  select overlay.* into v_overlay
  from internal_academic.technical_manual_banese_due_date_overlay overlay
  where overlay.source_transaction_id = old.id;
  if not found then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Transação arquivada no overlay one-off é imutável.'
      using errcode = '55000';
  end if;
  select job.* into strict v_job
  from internal_academic.technical_manual_banese_reissue_jobs job
  where job.receivable_id = v_overlay.receivable_id
    and job.recovery_request_id = v_overlay.authorization_request_id;
  if coalesce(auth.role(), '') <> 'service_role'
      and session_user not in ('postgres', 'supabase_admin', 'service_role')
    or v_overlay.correction_request_id::text is distinct from current_setting(
      'app.technical_manual_due_date_correction_id', true)
    or v_job.id::text is distinct from current_setting(
      'app.technical_manual_banese_reissue_job_id', true)
    or v_job.lease_token::text is distinct from current_setting(
      'app.technical_manual_banese_reissue_lease_token', true)
    or v_job.status <> 'CANCEL_CONFIRMED'
    or v_job.lease_valid_until <= clock_timestamp()
    or to_jsonb(old) is distinct from v_overlay.transaction_pre_snapshot
    or new.receivable_id is not null
    or new.remote_status is distinct from 'CANCELED'
    or new.last_error is not null
    or new.synced_at is null or new.updated_at is null
    or new.synced_at is distinct from new.updated_at
    or new.updated_at <= old.updated_at
    or to_jsonb(new) - array[
      'receivable_id', 'remote_status', 'last_error', 'synced_at', 'updated_at'
    ] is distinct from to_jsonb(old) - array[
      'receivable_id', 'remote_status', 'last_error', 'synced_at', 'updated_at'
    ]
  then
    raise exception 'Transação bloqueada pelo overlay one-off.'
      using errcode = 'PT409';
  end if;
  return new;
end;
$function$
;
CREATE TRIGGER a0_guard_technical_due_date_overlay_transaction BEFORE DELETE OR UPDATE ON public.payment_gateway_transactions FOR EACH ROW EXECUTE FUNCTION internal_academic.guard_technical_due_date_overlay_transaction();
CREATE OR REPLACE FUNCTION public.fill_payment_gateway_transaction_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_origin_polo_id UUID;
  v_issuer_polo_id UUID;
BEGIN
  IF NEW.receivable_id IS NOT NULL THEN
    SELECT receivable.polo_id, receivable.gateway_issuer_polo_id
      INTO v_origin_polo_id, v_issuer_polo_id
    FROM public.contas_receber AS receivable
    WHERE receivable.id = NEW.receivable_id;
  ELSIF NEW.inscricao_online_id IS NOT NULL THEN
    SELECT turma.polo_id, enrollment.gateway_issuer_polo_id
      INTO v_origin_polo_id, v_issuer_polo_id
    FROM public.inscricoes_online AS enrollment
    LEFT JOIN public.turmas AS turma ON turma.id = enrollment.turma_id
    WHERE enrollment.id = NEW.inscricao_online_id;
  END IF;

  NEW.origin_polo_id := coalesce(NEW.origin_polo_id, v_origin_polo_id);
  NEW.issuer_polo_id := coalesce(NEW.issuer_polo_id, v_issuer_polo_id);

  IF NEW.issuer_polo_id IS NULL THEN
    SELECT config.issuer_polo_id
      INTO NEW.issuer_polo_id
    FROM public.payment_gateway_issuer_config AS config
    WHERE config.id = 1
      AND config.active IS TRUE;
  END IF;

  IF NEW.issuer_polo_id IS NULL THEN
    RAISE EXCEPTION 'O emissor financeiro global nao esta configurado.';
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER fill_payment_gateway_transaction_scope_trigger BEFORE INSERT OR UPDATE OF receivable_id, inscricao_online_id, origin_polo_id, issuer_polo_id ON public.payment_gateway_transactions FOR EACH ROW EXECUTE FUNCTION fill_payment_gateway_transaction_scope();
CREATE OR REPLACE FUNCTION internal_academic.guard_local_manual_cycle_gateway_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if exists(select 1 from public.contas_receber r where r.id=new.receivable_id
    and (r.regra_financeira_tecnica_snapshot->>'destinoCobranca'='LOCAL'
      or internal_academic.manual_cycle_has_local_intent(r))) then
    raise exception 'Matrícula registrada sem boleto não permite transação bancária.' using errcode='23514';
  end if;
  return new;
end;
$function$
;
CREATE TRIGGER guard_local_manual_cycle_gateway_transaction BEFORE INSERT OR UPDATE ON public.payment_gateway_transactions FOR EACH ROW EXECUTE FUNCTION internal_academic.guard_local_manual_cycle_gateway_transaction();
CREATE OR REPLACE FUNCTION public.prevent_gateway_transaction_amount_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.amount is distinct from old.amount then
    raise exception using
      errcode = '55000',
      message = 'O valor da transação de gateway é imutável.';
  end if;
  return new;
end;
$function$
;
CREATE TRIGGER prevent_gateway_transaction_amount_change BEFORE UPDATE ON public.payment_gateway_transactions FOR EACH ROW EXECUTE FUNCTION prevent_gateway_transaction_amount_change();
