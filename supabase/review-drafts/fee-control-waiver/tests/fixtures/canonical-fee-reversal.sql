-- Read-only canonical catalog snapshot, 2026-10-07.

-- Local synthetic fixture only. Function bodies and trigger definitions are canonical.

CREATE OR REPLACE FUNCTION internal_academic.guard_local_manual_cycle_reversal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (old.regra_financeira_tecnica_snapshot->>'destinoCobranca'='LOCAL'
      or new.regra_financeira_tecnica_snapshot->>'destinoCobranca'='LOCAL'
      or internal_academic.manual_cycle_has_local_intent(old))
    and ((old.status='PAGO' and new.status is distinct from 'PAGO')
      or (new.manual_settlement_reversed_at is not null
        and new.manual_settlement_reversed_at is distinct from old.manual_settlement_reversed_at))
    and not internal_academic.local_manual_reversal_authorized(old,new) then
    raise exception 'O estorno da matrícula local exige a operação auditada. Atualize a tela.' using errcode='42501';
  end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION internal_academic.local_manual_reversal_authorized(p_old contas_receber, p_new contas_receber)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_changed text[]:=array['status','conta_bancaria_id','valor_pago','data_pagamento',
  'manual_settlement_reversed_at','forma_pagamento','origem_pagamento','updated_at'];
begin
  if auth.role() is distinct from 'authenticated' or auth.uid() is null
    or p_old.status is distinct from 'PAGO' or p_old.origem_pagamento is distinct from 'PRESENCIAL'
    or p_old.manual_settlement_reversed_at is not null
    or p_new.status is distinct from 'PENDENTE'
    or not internal_academic.manual_cycle_has_local_intent(p_old)
    or internal_academic.manual_cycle_has_bank_fields(p_old)
    or internal_academic.manual_cycle_has_bank_fields(p_new)
    or (to_jsonb(p_old)-v_changed) is distinct from (to_jsonb(p_new)-v_changed)
    or not coalesce(internal_academic.manual_cycle_local_reversed_receivable_complete(p_new),false)
  then return false; end if;
  perform internal_academic.assert_manual_cycle_reviewed_receivable(p_new);
  return exists(select 1 from public.receivable_manual_settlements s
    join public.receivable_manual_settlement_events e on e.settlement_id=s.id
    join public.usuarios_sistema u on u.id=e.actor_id and u.auth_user_id=auth.uid()
    where s.id=p_old.manual_settlement_id and s.receivable_id=p_old.id
      and s.account_id is not distinct from p_old.conta_bancaria_id
      and s.payment_method is not distinct from p_old.forma_pagamento
      and s.payment_date=p_old.data_pagamento
      and s.received_cents=round(p_old.valor_pago*100)::bigint
      and public.is_active_status(u.status) and lower(btrim(u.perfil)) in ('gestor','financeiro')
      and public.gestor_has_module('financeiro') and public.is_gestor_for_polo(p_old.polo_id)
      and e.event_type='LOCAL_SETTLEMENT_REVERSED'
      and e.details->>'operation'='LOCAL_ENROLLMENT_REVERSAL'
      and e.details->>'databaseTxid'=pg_catalog.txid_current()::text
      and e.details->>'authUserId'=auth.uid()::text
      and e.details->>'receivableId'=p_old.id::text
      and (e.details->>'reversedAt')::timestamptz=p_new.manual_settlement_reversed_at);
exception when others then return false;
end;
$function$;


CREATE OR REPLACE FUNCTION public.prevent_receivable_manual_settlement_event_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  raise exception using
    errcode = '55000',
    message = 'Eventos de baixa manual são imutáveis.';
end;
$function$;


CREATE OR REPLACE FUNCTION public.protect_paid_financial_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_SCHEMA='public' AND TG_TABLE_NAME='contas_receber' AND TG_OP='UPDATE' THEN
    IF OLD.status='PAGO' AND NEW.status='PENDENTE'
      AND OLD.regra_financeira_tecnica_snapshot->>'destinoCobranca'='LOCAL' THEN
      IF internal_academic.local_manual_reversal_authorized(OLD,NEW) THEN
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' AND OLD.status = 'PAGO' THEN
    RAISE EXCEPTION
      'Um lançamento pago não pode ser excluído. Use o fluxo auditável de estorno.';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.status = 'PAGO'
     AND (
       NEW.status IS DISTINCT FROM OLD.status
       OR NEW.polo_id IS DISTINCT FROM OLD.polo_id
       OR NEW.valor IS DISTINCT FROM OLD.valor
       OR NEW.valor_pago IS DISTINCT FROM OLD.valor_pago
       OR NEW.conta_bancaria_id IS DISTINCT FROM OLD.conta_bancaria_id
       OR NEW.data_pagamento IS DISTINCT FROM OLD.data_pagamento
     ) THEN
    RAISE EXCEPTION
      'Dados contábeis de um lançamento pago só podem mudar pelo fluxo auditável de estorno.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;


CREATE OR REPLACE FUNCTION public.protect_receivable_manual_settlement_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_trusted_writer boolean :=
    coalesce(auth.role(), '') = 'service_role';
begin
  if v_trusted_writer then
    return new;
  end if;
  if old.status='PAGO' and new.status='PENDENTE'
    and old.regra_financeira_tecnica_snapshot->>'destinoCobranca'='LOCAL' then
    if internal_academic.local_manual_reversal_authorized(old,new) then
      return new;
    end if;
  end if;

  if row(
    new.manual_settlement_id,
    new.manual_settlement_principal_cents,
    new.manual_settlement_interest_cents,
    new.manual_settlement_penalty_cents,
    new.manual_settlement_addition_cents,
    new.manual_settlement_discount_cents,
    new.manual_settlement_received_cents,
    new.manual_settlement_reversed_at
  ) is distinct from row(
    old.manual_settlement_id,
    old.manual_settlement_principal_cents,
    old.manual_settlement_interest_cents,
    old.manual_settlement_penalty_cents,
    old.manual_settlement_addition_cents,
    old.manual_settlement_discount_cents,
    old.manual_settlement_received_cents,
    old.manual_settlement_reversed_at
  ) then
    raise exception using
      errcode = '42501',
      message = 'Campos de baixa manual somente podem ser alterados pelo servidor.';
  end if;

  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION internal_academic.manual_cycle_local_reversed_receivable_complete(p_receivable contas_receber)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p_receivable.status in ('PENDENTE','VENCIDO')
    and p_receivable.origem_pagamento='LOCAL'
    and p_receivable.data_pagamento is null and p_receivable.valor_pago is null
    and p_receivable.conta_bancaria_id is null and p_receivable.forma_pagamento is null
    and p_receivable.manual_settlement_reversed_at is not null
    and exists(select 1 from public.receivable_manual_settlements s
      where s.id=p_receivable.manual_settlement_id and s.receivable_id=p_receivable.id
        and s.state='REVERSED' and not s.requires_remote_cancellation
        and s.provider_code is null and s.remote_payment_id is null and s.remote_payment_link_id is null
        and s.polo_id is not distinct from p_receivable.polo_id
        and s.completed_at is not null and s.reversed_at>=s.completed_at
        and s.reversed_at=p_receivable.manual_settlement_reversed_at
        and s.principal_cents=round(p_receivable.valor*100)::bigint
        and s.principal_cents=p_receivable.manual_settlement_principal_cents
        and s.interest_cents=p_receivable.manual_settlement_interest_cents
        and s.penalty_cents=p_receivable.manual_settlement_penalty_cents
        and s.addition_cents=p_receivable.manual_settlement_addition_cents
        and s.discount_cents=p_receivable.manual_settlement_discount_cents
        and s.received_cents=p_receivable.manual_settlement_received_cents
        and exists(select 1 from public.receivable_manual_settlement_events e
          where e.settlement_id=s.id and e.event_type='LOCAL_SETTLEMENT_REVERSED'
            and e.details->>'operation'='LOCAL_ENROLLMENT_REVERSAL'
            and e.details->>'receivableId'=p_receivable.id::text
            and (e.details->>'reversedAt')::timestamptz=s.reversed_at));
$function$;


CREATE TRIGGER guard_local_manual_cycle_reversal BEFORE UPDATE ON public.contas_receber FOR EACH ROW EXECUTE FUNCTION internal_academic.guard_local_manual_cycle_reversal();

CREATE TRIGGER prevent_receivable_manual_settlement_event_mutation BEFORE DELETE OR UPDATE ON public.receivable_manual_settlement_events FOR EACH ROW EXECUTE FUNCTION prevent_receivable_manual_settlement_event_mutation();

CREATE TRIGGER protect_paid_contas_receber_trigger BEFORE DELETE OR UPDATE ON public.contas_receber FOR EACH ROW EXECUTE FUNCTION protect_paid_financial_history();

CREATE TRIGGER protect_receivable_manual_settlement_fields BEFORE UPDATE ON public.contas_receber FOR EACH ROW EXECUTE FUNCTION protect_receivable_manual_settlement_fields();

revoke all on function internal_academic.guard_local_manual_cycle_reversal() from public,anon,authenticated,service_role;


revoke all on function internal_academic.local_manual_reversal_authorized(public.contas_receber,public.contas_receber) from public,anon,authenticated,service_role;


revoke all on function public.prevent_receivable_manual_settlement_event_mutation() from public,anon,authenticated,service_role;
grant execute on function public.prevent_receivable_manual_settlement_event_mutation() to service_role;

revoke all on function public.protect_paid_financial_history() from public,anon,authenticated,service_role;
grant execute on function public.protect_paid_financial_history() to service_role;

revoke all on function public.protect_receivable_manual_settlement_fields() from public,anon,authenticated,service_role;
grant execute on function public.protect_receivable_manual_settlement_fields() to service_role;

revoke all on function internal_academic.manual_cycle_local_reversed_receivable_complete(public.contas_receber) from public,anon,authenticated,service_role;
