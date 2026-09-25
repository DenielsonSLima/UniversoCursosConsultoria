-- LOCAL reversal is authenticated and atomic. Existing bank reversal stays separate.
begin;

create function public.estornar_matricula_local_sem_boleto_secure(
  p_receivable_id uuid,p_expected_settlement_id uuid,p_reason text default null
)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $function$
declare
  v_actor uuid; v_row public.contas_receber%rowtype;
  v_settlement public.receivable_manual_settlements%rowtype;
  v_reason text:=coalesce(btrim(p_reason),''); v_time timestamptz; v_replayed boolean:=false;
begin
  if auth.role() is distinct from 'authenticated' or auth.uid() is null then
    raise exception 'Autenticação obrigatória para estornar a matrícula local.' using errcode='42501';
  end if;
  select u.id into v_actor from public.usuarios_sistema u
    where u.auth_user_id=auth.uid() and public.is_active_status(u.status)
      and lower(btrim(u.perfil)) in ('gestor','financeiro') limit 1;
  if v_actor is null or not coalesce(public.gestor_has_module('financeiro'),false) then
    raise exception 'Sem permissão para movimentação financeira.' using errcode='42501';
  end if;
  select * into v_row from public.contas_receber where id=p_receivable_id;
  if not found or not coalesce(public.is_gestor_for_polo(v_row.polo_id),false) then
    raise exception 'Cobrança fora do escopo financeiro autorizado.' using errcode='42501';
  end if;
  if coalesce(v_row.regra_financeira_tecnica_snapshot->>'destinoCobranca','')<>'LOCAL'
    and not internal_academic.manual_cycle_has_local_intent(v_row) then
    return jsonb_build_object('handled',false);
  end if;
  if p_expected_settlement_id is null or length(v_reason)>500 then
    raise exception 'Baixa esperada ou motivo de estorno inválido. Atualize a tela.' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'local-enrollment-reversal:'||p_receivable_id::text,0));
  -- Match the existing finalizer's ledger-before-receivable lock order.
  select * into v_settlement from public.receivable_manual_settlements
    where id=p_expected_settlement_id and receivable_id=p_receivable_id for update;
  if not found then raise exception 'A baixa mudou. Atualize a tela.' using errcode='40001'; end if;
  select * into strict v_row from public.contas_receber where id=p_receivable_id for update;
  if not coalesce(public.is_gestor_for_polo(v_row.polo_id),false) then
    raise exception 'Cobrança fora do escopo financeiro autorizado.' using errcode='42501';
  end if;
  if v_row.manual_settlement_id is distinct from p_expected_settlement_id
    or not coalesce(internal_academic.manual_cycle_local_receivable_complete(v_row),false) then
    raise exception 'A baixa ou a matrícula local mudou. Atualize a tela.' using errcode='40001';
  end if;
  if v_settlement.state='REVERSED' then
    if not coalesce(internal_academic.manual_cycle_local_reversed_receivable_complete(v_row),false)
      or not exists(select 1 from public.receivable_manual_settlement_events e
        where e.settlement_id=v_settlement.id and e.actor_id=v_actor
          and e.event_type='LOCAL_SETTLEMENT_REVERSED'
          and e.details->>'operation'='LOCAL_ENROLLMENT_REVERSAL'
          and e.details->>'authUserId'=auth.uid()::text
          and e.details->>'receivableId'=v_row.id::text
          and (e.details->>'reversedAt')::timestamptz=v_row.manual_settlement_reversed_at
          and e.details->>'reason'=v_reason) then
      raise exception 'Este estorno não corresponde à operação original.' using errcode='40001';
    end if;
    v_replayed:=true;
  else
    if v_settlement.state is distinct from 'COMPLETED' or v_settlement.reversed_at is not null
      or v_row.status is distinct from 'PAGO' then
      raise exception 'Somente uma baixa local comprovada pode ser estornada.' using errcode='40001';
    end if;
    v_time:=clock_timestamp();
    update public.receivable_manual_settlements set state='REVERSED',reversed_at=v_time
      where id=v_settlement.id and state='COMPLETED' and reversed_at is null;
    if not found then raise exception 'A baixa mudou durante o estorno.' using errcode='40001'; end if;
    insert into public.receivable_manual_settlement_events(settlement_id,actor_id,event_type,details)
      values(v_settlement.id,v_actor,'LOCAL_SETTLEMENT_REVERSED',jsonb_build_object(
        'operation','LOCAL_ENROLLMENT_REVERSAL','databaseTxid',pg_catalog.txid_current()::text,
        'authUserId',auth.uid(),'receivableId',v_row.id,'reversedAt',v_time::text,'reason',v_reason));
    update public.contas_receber set status='PENDENTE',conta_bancaria_id=null,valor_pago=null,
      data_pagamento=null,forma_pagamento=null,origem_pagamento='LOCAL',
      manual_settlement_reversed_at=v_time,updated_at=v_time
      where id=v_row.id and status='PAGO' and manual_settlement_id=v_settlement.id
        and manual_settlement_reversed_at is null returning * into v_row;
    if not found or not coalesce(internal_academic.manual_cycle_local_receivable_complete(v_row),false) then
      raise exception 'O estorno não preservou o registro local canônico.' using errcode='23514';
    end if;
  end if;
  return jsonb_build_object('handled',true,'success',true,'replayed',v_replayed,
    'settlementId',v_settlement.id,'receivable',to_jsonb(v_row),
    'asaasRecreated',false,'baneseRecreated',false,'gatewayRecreated',false,
    'gatewayProvider',null,'requiresDependencyCheckout',false);
end;
$function$;
revoke all on function public.estornar_matricula_local_sem_boleto_secure(uuid,uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.estornar_matricula_local_sem_boleto_secure(uuid,uuid,text) to authenticated;

-- Only the exact event-backed LOCAL transition can bypass the generic guards.
-- No service-role impersonation and no writable session marker is involved.
do $guards$
declare v_definition text; v_from text;
begin
  v_definition:=pg_get_functiondef('public.protect_paid_financial_history()'::regprocedure);
  if md5(v_definition)<>'3f14fa89d82cd9405894d9d7208ffd18' then
    raise exception 'Paid financial history guard changed.';
  end if;
  v_from:=$old$BEGIN
  IF auth.role() = 'service_role' THEN$old$;
  execute replace(v_definition,v_from,$new$BEGIN
  IF TG_TABLE_SCHEMA='public' AND TG_TABLE_NAME='contas_receber' AND TG_OP='UPDATE' THEN
    IF OLD.status='PAGO' AND NEW.status='PENDENTE'
      AND OLD.regra_financeira_tecnica_snapshot->>'destinoCobranca'='LOCAL'
      AND internal_academic.local_manual_reversal_authorized(OLD,NEW) THEN RETURN NEW; END IF;
  END IF;
  IF auth.role() = 'service_role' THEN$new$);
  v_definition:=pg_get_functiondef('public.protect_receivable_manual_settlement_fields()'::regprocedure);
  if md5(v_definition)<>'b8e9ef4f7f966d043ff0d5c7527d5ee5' then
    raise exception 'Manual settlement history guard changed.';
  end if;
  v_from:=$old$begin
  if v_trusted_writer then$old$;
  execute replace(v_definition,v_from,$new$begin
  if old.status='PAGO' and new.status='PENDENTE'
    and old.regra_financeira_tecnica_snapshot->>'destinoCobranca'='LOCAL'
    and internal_academic.local_manual_reversal_authorized(old,new) then return new; end if;
  if v_trusted_writer then$new$);
end;
$guards$;
notify pgrst,'reload schema';
commit;
