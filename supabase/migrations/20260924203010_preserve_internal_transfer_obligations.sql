-- Academic continuity never changes the owner, terms or identity of a debt.
begin;

create or replace function public.processar_continuidade_transferencia()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
  if new.tipo not in ('INTERNA_TURMA','INTERNA_POLO') then return new; end if;
  if auth.uid() is null or new.matricula_origem_id is null or new.matricula_destino_id is null
    or not exists(select 1 from public.matriculas source join public.matriculas target
      on target.id=new.matricula_destino_id and target.aluno_id=source.aluno_id
      where source.id=new.matricula_origem_id and source.aluno_id=new.aluno_id
        and source.turma_id=new.turma_origem_id and target.turma_id=new.turma_destino_id
        and source.status='TRANSFERIDO'
        and (target.origem_matricula_id is null or target.origem_matricula_id=source.id)) then
    raise exception 'A continuidade exige as matrículas canônicas da mesma pessoa.' using errcode='23514';
  end if;
  update public.matriculas set origem_matricula_id=new.matricula_origem_id,
    continuidade_tipo='TRANSFERENCIA_INTERNA' where id=new.matricula_destino_id;
  insert into internal_academic.transfer_financial_continuity(
    transferencia_id,source_enrollment_id,target_enrollment_id,effective_date,actor_id)
    values(new.id,new.matricula_origem_id,new.matricula_destino_id,new.data_transferencia,auth.uid());
  perform internal_academic.copy_enrollment_credits(new.matricula_origem_id,new.matricula_destino_id,
    'Aproveitamento automático por transferência interna.');
  return new;
end;
$function$;

create function internal_academic.transfer_financial_origin(p_matricula_id uuid)
returns uuid language sql stable security definer set search_path='' as $function$
  select source.id from internal_academic.transfer_financial_continuity bridge
  join public.transferencias_academicas transfer on transfer.id=bridge.transferencia_id
  join public.matriculas target on target.id=bridge.target_enrollment_id
  join public.matriculas source on source.id=bridge.source_enrollment_id
  where target.id=p_matricula_id and source.status='TRANSFERIDO'
    and target.origem_matricula_id=source.id and target.continuidade_tipo='TRANSFERENCIA_INTERNA'
    and source.aluno_id=target.aluno_id and transfer.aluno_id=source.aluno_id
    and transfer.tipo in ('INTERNA_TURMA','INTERNA_POLO')
    and transfer.matricula_origem_id=source.id and transfer.matricula_destino_id=target.id
    and transfer.turma_origem_id=source.turma_id and transfer.turma_destino_id=target.turma_id
    and transfer.data_transferencia=bridge.effective_date;
$function$;

create function internal_academic.transfer_source_cycle_one_complete(p_matricula_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $function$
declare v_source uuid:=internal_academic.transfer_financial_origin(p_matricula_id);
  v_run internal_academic.technical_manual_cycle_runs%rowtype;
  v_row public.contas_receber%rowtype; v_count integer:=0; v_person uuid;
begin
  if v_source is null then return false; end if;
  select aluno_id into v_person from public.matriculas where id=v_source;
  select * into v_run from internal_academic.technical_manual_cycle_runs
    where matricula_id=v_source and cycle_number=1 and state='LOCAL_CREATED';
  if not found or v_run.item_count<1 or cardinality(v_run.receivable_ids)<>v_run.item_count
    or exists(select 1 from internal_academic.technical_manual_cycle_runs
      where matricula_id=v_source and cycle_number<>1)
    or exists(select 1 from public.matriculas m join internal_proesc.enrollment_sources s on s.matricula_id=m.id
      where m.aluno_id=v_person)
    or exists(select 1 from public.matriculas m join internal_proesc.obligation_links l on l.matricula_id=m.id
      where m.aluno_id=v_person)
    or exists(select 1 from public.matriculas m join internal_academic.technical_external_cycle_coverage c
      on c.matricula_id=m.id where m.aluno_id=v_person) then return false; end if;
  for v_row in select * from public.contas_receber where id=any(v_run.receivable_ids) loop
    if v_row.matricula_id<>v_source or v_row.turma_id<>v_run.turma_id or v_row.cliente_id<>v_person
      or v_row.regra_financeira_tecnica_snapshot#>>'{cicloManual,requestId}' is distinct from v_run.request_id::text
      or not (coalesce(internal_academic.technical_manual_banese_receivable_complete(v_row),false)
        or coalesce(internal_academic.technical_manual_banese_receivable_paid_issued(v_row),false)
        or coalesce(internal_academic.manual_cycle_local_receivable_complete(v_row),false)) then
      return false;
    end if;
    v_count:=v_count+1;
  end loop;
  return v_count=v_run.item_count;
exception when others then return false;
end;
$function$;

-- Preserve existing admission/status guards; issue a narrow new-admission claim
-- before INSERT so an imported class is not confused with an imported person.
create or replace function internal_academic.legacy_transferir_matricula_academica(
  p_matricula_id uuid,p_tipo text,p_motivo text,p_turma_destino_id uuid default null,
  p_instituicao_destino text default null,p_observacao text default null,
  p_data_transferencia date default current_date,p_responsavel_id uuid default null
)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_source public.matriculas%rowtype; v_target public.matriculas%rowtype;
  v_type text:=upper(btrim(p_tipo)); v_transfer uuid; v_actor uuid; v_new_id uuid;
begin
  if not exists(select 1 from internal_academic.transfer_financial_operations op
    where op.source_enrollment_id=p_matricula_id and op.actor_id=auth.uid()
      and op.database_txid=txid_current() and op.transfer_id is null and op.result is null
      and op.payload->>'tipo'=p_tipo and op.payload->>'data'=p_data_transferencia::text
      and op.payload->>'destino' is not distinct from p_turma_destino_id::text) then
    raise exception 'A transferência exige prévia financeira confirmada. Atualize a tela.' using errcode='42501';
  end if;
  select * into v_source from public.matriculas where id=p_matricula_id for update;
  if not found then raise exception 'Matrícula de origem não encontrada.'; end if;
  if v_source.status<>'ATIVO' then raise exception 'Somente matrículas ativas podem ser transferidas.'; end if;
  if nullif(btrim(p_motivo),'') is null then raise exception 'Informe o motivo da transferência.'; end if;
  select id into v_actor from public.usuarios_sistema where auth_user_id=auth.uid()
    and public.is_active_status(status) limit 1;
  if v_actor is null then raise exception 'Responsável autenticado não encontrado.' using errcode='42501'; end if;
  update public.matriculas set status='TRANSFERIDO' where id=v_source.id;
  if v_type in ('INTERNA_TURMA','INTERNA_POLO') then
    if p_turma_destino_id is null or p_turma_destino_id=v_source.turma_id then
      raise exception 'Selecione uma turma de destino diferente.';
    end if;
    select * into v_target from public.matriculas
      where aluno_id=v_source.aluno_id and turma_id=p_turma_destino_id for update;
    if found then
      if v_target.status<>'PENDENTE' or v_target.origem_matricula_id is not null
        or exists(select 1 from public.contas_receber where matricula_id=v_target.id)
        or exists(select 1 from internal_proesc.enrollment_sources where matricula_id=v_target.id)
        or exists(select 1 from internal_academic.technical_manual_cycle_runs where matricula_id=v_target.id) then
        raise exception 'O destino já possui matrícula ou histórico. Revise o vínculo antes da transferência.';
      end if;
      update public.matriculas set status='ATIVO' where id=v_target.id returning * into v_target;
    else
      v_new_id:=gen_random_uuid();
      perform internal_academic.authorize_regular_technical_admission(
        v_new_id,v_source.aluno_id,p_turma_destino_id,'ATIVO');
      insert into public.matriculas(id,aluno_id,turma_id,status,data_matricula,fluxo_operacional,
        financeiro_herdado,gerar_cobranca_inicial,gerar_cobranca_futura,sincronizar_asaas)
        values(v_new_id,v_source.aluno_id,p_turma_destino_id,'ATIVO',p_data_transferencia::timestamptz,
          'REGULAR',false,false,false,false) returning * into v_target;
    end if;
  elsif v_type='EXTERNA_ENVIADA' then
    if nullif(btrim(p_instituicao_destino),'') is null then raise exception 'Informe a instituição de destino.'; end if;
  else raise exception 'Tipo de transferência inválido.'; end if;
  insert into public.transferencias_academicas(aluno_id,matricula_origem_id,matricula_destino_id,
    tipo,turma_origem_id,turma_destino_id,instituicao_destino,motivo,observacao,data_transferencia,responsavel_id)
    values(v_source.aluno_id,v_source.id,v_target.id,v_type,v_source.turma_id,p_turma_destino_id,
      nullif(btrim(p_instituicao_destino),''),btrim(p_motivo),nullif(btrim(p_observacao),''),
      p_data_transferencia,v_actor) returning id into v_transfer;
  insert into public.matricula_movimentacoes(matricula_id,aluno_id,tipo,status_anterior,status_novo,
    turma_origem_id,turma_destino_id,motivo,observacao,data_movimentacao,responsavel_id,metadados,created_at)
    values(v_source.id,v_source.aluno_id,case when v_type='EXTERNA_ENVIADA'
      then 'TRANSFERENCIA_EXTERNA_ENVIADA' else 'TRANSFERENCIA_INTERNA' end,'ATIVO','TRANSFERIDO',
      v_source.turma_id,p_turma_destino_id,btrim(p_motivo),nullif(btrim(p_observacao),''),p_data_transferencia,
      v_actor,jsonb_build_object('transferencia_id',v_transfer,'nova_matricula_id',v_target.id),clock_timestamp());
  if v_target.id is not null then
    insert into public.matricula_movimentacoes(matricula_id,aluno_id,tipo,status_anterior,status_novo,
      turma_origem_id,turma_destino_id,motivo,data_movimentacao,responsavel_id,created_at)
      values(v_target.id,v_source.aluno_id,'TRANSFERENCIA_INTERNA',null,'ATIVO',v_source.turma_id,
        v_target.turma_id,btrim(p_motivo),p_data_transferencia,v_actor,clock_timestamp());
  end if;
  return jsonb_build_object('transferenciaId',v_transfer,'matriculaOrigemId',v_source.id,
    'matriculaDestinoId',v_target.id);
end;
$function$;
revoke all on function internal_academic.transfer_financial_origin(uuid),
  internal_academic.transfer_source_cycle_one_complete(uuid),
  internal_academic.legacy_transferir_matricula_academica(uuid,text,text,uuid,text,text,date,uuid)
  from public,anon,authenticated,service_role;
commit;
