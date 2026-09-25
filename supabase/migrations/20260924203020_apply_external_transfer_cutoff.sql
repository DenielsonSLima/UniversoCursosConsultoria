-- Only external transfer changes its cutoff. Other terminal reasons keep their policy.
begin;

create function internal_academic.apply_external_transfer_receivable(
  p_receivable_id uuid,p_movement_id uuid
)
returns void language plpgsql security definer set search_path='' as $function$
declare v_row public.contas_receber%rowtype; v_move public.matricula_movimentacoes%rowtype; v_action text;
begin
  select * into v_move from public.matricula_movimentacoes where id=p_movement_id
    and tipo='TRANSFERENCIA_EXTERNA_ENVIADA' and status_novo='TRANSFERIDO';
  if not found or internal_academic.current_external_transfer_movement(v_move.matricula_id)
    is distinct from v_move.id then return; end if;
  select * into v_row from public.contas_receber
    where id=p_receivable_id and matricula_id=any(array_prepend(v_move.matricula_id,
      internal_academic.transfer_financial_origin_chain(v_move.matricula_id))) for update;
  if not found then return; end if;
  v_action:=internal_academic.transfer_receivable_action(v_row,'EXTERNA_ENVIADA',v_move.data_movimentacao);
  if v_row.matricula_id<>v_move.matricula_id and v_action<>'PRESERVAR' then v_action:='REVISAO_EXTERNA'; end if;
  if v_action='CANCELAR_LOCAL' then
    update public.contas_receber set status='CANCELADO',updated_at=now() where id=v_row.id;
  elsif v_action='AGUARDAR_BANESE' then
    perform public.enqueue_banese_cancellation(v_row.id,v_move.id,v_move.data_movimentacao,v_move.tipo);
    if not exists(select 1 from public.banese_cancellation_outbox
      where receivable_id=v_row.id and movement_id=v_move.id
        and state in ('PENDING','RETRY','PROCESSING','DONE','REVIEW_REQUIRED')) then
      v_action:='REVISAO_EXTERNA';
    end if;
  end if;
  if v_action='REVISAO_EXTERNA' then
    insert into internal_academic.transfer_financial_reviews(
      movement_id,receivable_id,origin,reason,effective_date,snapshot)
      values(v_move.id,v_row.id,internal_academic.transfer_receivable_origin(v_row),
        'CANCELAMENTO_EXTERNO_NAO_COMPROVADO',v_move.data_movimentacao,
        jsonb_build_object('status',v_row.status,'valor',v_row.valor,'vencimento',v_row.data_vencimento))
      on conflict(movement_id,receivable_id) do nothing;
  end if;
end;
$function$;

create function internal_academic.apply_external_transfer_finance(p_movement_id uuid)
returns void language plpgsql security definer set search_path='' as $function$
declare v_move public.matricula_movimentacoes%rowtype; v_id uuid;
begin
  select * into v_move from public.matricula_movimentacoes where id=p_movement_id
    and tipo='TRANSFERENCIA_EXTERNA_ENVIADA' and status_novo='TRANSFERIDO';
  if not found or internal_academic.current_external_transfer_movement(v_move.matricula_id)
    is distinct from v_move.id then return; end if;
  perform internal_academic.authorize_matricula_control_update(v_move.matricula_id);
  update public.matriculas set gerar_cobranca_futura=false,sincronizar_asaas=false
    where id=v_move.matricula_id;
  for v_id in select id from public.contas_receber where matricula_id=any(array_prepend(v_move.matricula_id,
    internal_academic.transfer_financial_origin_chain(v_move.matricula_id)))
    order by id for update loop
    perform internal_academic.apply_external_transfer_receivable(v_id,v_move.id);
  end loop;
end;
$function$;

-- Reuse the existing body for trancamento, desistência and cancelamento.
do $patch$
declare v_definition text; v_old text;
begin
  v_definition:=pg_get_functiondef('public.ajustar_financeiro_movimentacao_matricula()'::regprocedure);
  v_old:=$old$begin
  if new.tipo = 'TRANCAMENTO' then$old$;
  if length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) then
    raise exception 'Academic financial movement boundary changed.';
  end if;
  execute replace(v_definition,v_old,$new$begin
  if new.tipo='TRANSFERENCIA_EXTERNA_ENVIADA' then
    perform internal_academic.apply_external_transfer_finance(new.id);
    return new;
  end if;
  if new.tipo = 'TRANCAMENTO' then$new$);

  -- Old late-local trigger must not cancel every TRANSFERIDO enrollment.
  -- The AFTER trigger below applies the explicit external movement/cutoff.
  v_definition:=pg_get_functiondef('public.cancel_late_terminal_local_receivable()'::regprocedure);
  v_old:=$old$begin
  if new.matricula_id is null$old$;
  if length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) then
    raise exception 'Late terminal local boundary changed.';
  end if;
  execute replace(v_definition,v_old,$new$begin
  if exists(select 1 from public.matriculas where id=new.matricula_id and status='TRANSFERIDO') then
    return new;
  end if;
  if new.matricula_id is null$new$);

  -- A post-transfer refund is a separate review, not an implicit reopening.
  v_definition:=pg_get_functiondef('public.estornar_matricula_local_sem_boleto_secure(uuid,uuid,text)'::regprocedure);
  v_old:=$old$    v_time:=clock_timestamp();$old$;
  if length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) then
    raise exception 'Audited local reversal boundary changed.';
  end if;
  execute replace(v_definition,v_old,$new$    if exists(select 1 from public.matriculas m
      join public.matricula_movimentacoes mm on mm.matricula_id=m.id
      where m.id=v_row.matricula_id
        and mm.id=internal_academic.current_external_transfer_movement(m.id)
        and v_row.data_vencimento>mm.data_movimentacao) then
      raise exception 'O estorno de cobrança futura após a saída exige revisão financeira; o recebível foi preservado.'
        using errcode='23514';
    end if;
    v_time:=clock_timestamp();$new$);
end;
$patch$;

create function internal_academic.track_late_transfer_receivable()
returns trigger language plpgsql security definer set search_path='' as $function$
declare v_movement uuid;
begin
  if new.status not in ('PENDENTE','VENCIDO','SUSPENSO') or new.data_pagamento is not null then return new; end if;
  select mm.id into v_movement from public.matricula_movimentacoes mm
    where mm.id=internal_academic.current_external_transfer_movement(new.matricula_id)
      and new.data_vencimento>mm.data_movimentacao;
  if v_movement is not null then
    perform internal_academic.apply_external_transfer_receivable(new.id,v_movement);
  end if;
  return new;
end;
$function$;
create trigger track_late_transfer_receivable after insert or update of status,gateway_submission_status,
  gateway_status,manual_settlement_reversed_at on public.contas_receber
  for each row execute function internal_academic.track_late_transfer_receivable();

-- Service callers cannot bypass source protection or the transfer date.
do $patch$
declare v_definition text; v_old text;
begin
  v_definition:=pg_get_functiondef('public.cancel_terminal_local_receivable(uuid,uuid)'::regprocedure);
  v_old:=$old$  if v_receivable.data_pagamento is not null$old$;
  if length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) then
    raise exception 'Terminal local cancellation boundary changed.';
  end if;
  execute replace(v_definition,v_old,$new$  if exists(select 1 from public.matricula_movimentacoes mm
    where mm.id=p_movement_id and mm.tipo='TRANSFERENCIA_EXTERNA_ENVIADA') then
    if internal_academic.current_external_transfer_movement(v_receivable.matricula_id)
      is distinct from p_movement_id then
      raise exception 'A saída informada não é o movimento atual. Atualize a tela.' using errcode='40001';
    end if;
    if v_receivable.status='CANCELADO' and internal_academic.transfer_receivable_action(
      jsonb_populate_record(v_receivable,'{"status":"PENDENTE"}'::jsonb),'EXTERNA_ENVIADA',
      (select data_movimentacao from public.matricula_movimentacoes where id=p_movement_id))='CANCELAR_LOCAL' then
      return jsonb_build_object('canceled',true,'alreadyCanceled',true);
    end if;
    if internal_academic.transfer_receivable_action(v_receivable,'EXTERNA_ENVIADA',
      (select data_movimentacao from public.matricula_movimentacoes where id=p_movement_id))<>'CANCELAR_LOCAL' then
      raise exception 'Cobrança preservada ou dependente de revisão externa.';
    end if;
    perform internal_academic.apply_external_transfer_receivable(p_receivable_id,p_movement_id);
    select count(*) into v_updated_count from public.contas_receber
      where id=p_receivable_id and status='CANCELADO' and data_pagamento is null;
    if v_updated_count<>1 then raise exception 'O cancelamento local não foi confirmado.' using errcode='40001'; end if;
    return jsonb_build_object('canceled',true,'alreadyCanceled',false);
  end if;
  if v_receivable.data_pagamento is not null$new$);
end;
$patch$;
revoke all on function internal_academic.apply_external_transfer_receivable(uuid,uuid),
  internal_academic.apply_external_transfer_finance(uuid),internal_academic.track_late_transfer_receivable()
  from public,anon,authenticated,service_role;
commit;
