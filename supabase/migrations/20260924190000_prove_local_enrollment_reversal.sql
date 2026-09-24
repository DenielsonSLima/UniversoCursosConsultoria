-- Reopened LOCAL fees retain their audited settlement; no bank field is relaxed.
begin;

create function internal_academic.manual_cycle_local_reversed_receivable_complete(
  p_receivable public.contas_receber
)
returns boolean language sql stable security definer set search_path='' as $function$
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

-- An event written by the private transaction is the authorization, not a GUC.
create function internal_academic.local_manual_reversal_authorized(
  p_old public.contas_receber,p_new public.contas_receber
)
returns boolean language plpgsql stable security definer set search_path='' as $function$
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

create function internal_academic.guard_local_manual_cycle_reversal()
returns trigger language plpgsql security definer set search_path='' as $function$
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
create trigger guard_local_manual_cycle_reversal before update on public.contas_receber
  for each row execute function internal_academic.guard_local_manual_cycle_reversal();

do $patch$
declare v_definition text; v_from text;
begin
  v_definition:=pg_get_functiondef('internal_academic.manual_cycle_local_receivable_complete(public.contas_receber)'::regprocedure);
  v_from:=$old$  if p_receivable.status in ('PENDENTE','VENCIDO') then
    return p_receivable.data_pagamento is null and p_receivable.valor_pago is null
      and p_receivable.manual_settlement_id is null;
  end if;$old$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Local fee completion boundary changed.';
  end if;
  execute replace(v_definition,v_from,$new$  if p_receivable.status in ('PENDENTE','VENCIDO') then
    if p_receivable.manual_settlement_id is not null or p_receivable.manual_settlement_reversed_at is not null then
      return coalesce(internal_academic.manual_cycle_local_reversed_receivable_complete(p_receivable),false);
    end if;
    return p_receivable.data_pagamento is null and p_receivable.valor_pago is null;
  end if;$new$);
end;
$patch$;

revoke all on function
  internal_academic.manual_cycle_local_reversed_receivable_complete(public.contas_receber),
  internal_academic.local_manual_reversal_authorized(public.contas_receber,public.contas_receber),
  internal_academic.guard_local_manual_cycle_reversal()
  from public,anon,authenticated,service_role;
commit;
