begin;

create function public.transferir_matricula_com_revisao_financeira(
  p_request_id uuid,p_expected_fingerprint text,p_matricula_id uuid,p_tipo text,p_motivo text,
  p_data_transferencia date,p_turma_destino_id uuid default null,
  p_instituicao_destino text default null,p_observacao text default null
)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $function$
declare v_actor uuid:=auth.uid(); v_turma uuid; v_preview jsonb; v_payload jsonb; v_result jsonb;
  v_operation internal_academic.transfer_financial_operations%rowtype;
begin
  perform internal_academic.assert_transfer_financial_access(p_matricula_id,p_turma_destino_id);
  select turma_id into v_turma from public.matriculas where id=p_matricula_id;
  if v_actor is null or not coalesce(public.can_operate_turma_academics(v_turma),false)
    or (p_turma_destino_id is not null and not coalesce(public.can_operate_turma_academics(p_turma_destino_id),false)) then
    raise exception 'Sem permissão nas turmas da transferência.' using errcode='42501';
  end if;
  if p_request_id is null or coalesce(p_expected_fingerprint,'')!~'^[a-f0-9]{64}$'
    or nullif(btrim(p_motivo),'') is null or length(p_motivo)>1000 or length(p_observacao)>4000 then
    raise exception 'Confirme uma prévia válida e o motivo da transferência.' using errcode='22023';
  end if;
  v_payload:=jsonb_build_object('matriculaId',p_matricula_id,'tipo',p_tipo,'motivo',btrim(p_motivo),
    'data',p_data_transferencia,'destino',p_turma_destino_id,
    'instituicao',nullif(btrim(p_instituicao_destino),''),'observacao',nullif(btrim(p_observacao),''),
    'fingerprint',p_expected_fingerprint);
  perform pg_advisory_xact_lock(hashtextextended('academic-transfer:'||p_request_id::text,0));
  select * into v_operation from internal_academic.transfer_financial_operations where request_id=p_request_id;
  if found then
    if v_operation.actor_id<>v_actor or v_operation.payload is distinct from v_payload or v_operation.result is null then
      raise exception 'A operação não corresponde à transferência original.' using errcode='40001';
    end if;
    return v_operation.result||jsonb_build_object('replayed',true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('technical-manual-cycle-person:'||
    (select aluno_id::text from public.matriculas where id=p_matricula_id),0));
  perform 1 from public.matriculas where id=any(array_prepend(p_matricula_id,
    internal_academic.transfer_financial_origin_chain(p_matricula_id))) order by id for update;
  perform 1 from public.contas_receber where matricula_id=any(array_prepend(p_matricula_id,
    internal_academic.transfer_financial_origin_chain(p_matricula_id))) order by id for update;
  v_preview:=internal_academic.transfer_financial_preview(p_matricula_id,p_tipo,p_data_transferencia,p_turma_destino_id);
  if v_preview->>'fingerprint' is distinct from p_expected_fingerprint then
    raise exception 'As cobranças mudaram. Recarregue e confira a prévia da transferência.' using errcode='40001';
  end if;
  insert into internal_academic.transfer_financial_operations(
    request_id,actor_id,source_enrollment_id,payload,preview)
    values(p_request_id,v_actor,p_matricula_id,v_payload,v_preview);
  v_result:=public.transferir_matricula_academica(p_matricula_id,p_tipo,p_motivo,p_turma_destino_id,
    p_instituicao_destino,p_observacao,p_data_transferencia,null);
  v_result:=v_result||jsonb_build_object('requestId',p_request_id,'replayed',false,
    'academicoConcluido',true,'financeiro',v_preview->'resumo');
  update internal_academic.transfer_financial_operations
    set transfer_id=(v_result->>'transferenciaId')::uuid,result=v_result where request_id=p_request_id;
  return v_result;
end;
$function$;

create function public.get_transferencias_financeiras_turma(p_turma_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare v_result jsonb;
begin
  if auth.uid() is null or not coalesce(public.can_operate_turma_academics(p_turma_id),false)
    or not coalesce(public.gestor_has_tab('gestao','financeiro'),false)
    or not coalesce(public.gestor_has_financeiro_tab('receber'),false)
    or not exists(select 1 from public.turmas where id=p_turma_id and public.is_gestor_for_polo(polo_id)) then
    raise exception 'Sem permissão na turma.' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(item order by effective_date desc,transfer_id),'[]'::jsonb) into v_result
  from (
    select tr.id transfer_id,tr.data_transferencia effective_date,jsonb_build_object(
      'transferenciaId',tr.id,'tipo',tr.tipo,'data',tr.data_transferencia,'alunoNome',p.nome,
      'matriculaOrigemId',tr.matricula_origem_id,'matriculaDestinoId',tr.matricula_destino_id,
      'itens',coalesce((select jsonb_agg(jsonb_build_object(
        'id',r.id,'descricao',r.descricao,'origem',internal_academic.transfer_receivable_origin(r),
        'valor',r.valor,'vencimento',r.data_vencimento,'status',r.status,
        'situacao',case
          when r.status='PAGO' or r.data_pagamento is not null then 'PAGAMENTO_PRESERVADO'
          when tr.tipo<>'EXTERNA_ENVIADA' then 'CONTINUIDADE_ORIGEM'
          when r.data_vencimento<=tr.data_transferencia then 'PRESERVADO_PELO_CORTE'
          when q.state='DONE' and q.remote_status='CANCELED' and r.status='CANCELADO' then 'CANCELADO_BANESE'
          when q.state='REVIEW_REQUIRED' then 'REVISAO_BANESE'
          when q.state in ('PENDING','RETRY','PROCESSING') then 'AGUARDANDO_BANESE'
          when review.receivable_id is not null then 'REVISAO_EXTERNA'
          when r.status='CANCELADO' and internal_academic.transfer_receivable_origin(r)='LOCAL' then 'CANCELADO_LOCAL'
          else 'PRESERVADO' end,
        'referencia',coalesce((select l.source_unit_id||':'||l.source_key from internal_proesc.obligation_links l
          where l.receivable_id=r.id),r.gateway_boleto_nosso_numero,r.asaas_payment_id))
        order by r.data_vencimento,r.id)
        from public.contas_receber r
        left join public.banese_cancellation_outbox q on q.receivable_id=r.id
          and q.reason='TRANSFERENCIA_EXTERNA_ENVIADA'
        left join internal_academic.transfer_financial_reviews review on review.receivable_id=r.id
          and review.movement_id in(select mm.id from public.matricula_movimentacoes mm
            where mm.metadados->>'transferencia_id'=tr.id::text)
        where r.matricula_id=any(array_prepend(tr.matricula_origem_id,
          internal_academic.transfer_financial_origin_chain(tr.matricula_origem_id)))
          and exists(select 1 from public.turmas scope where scope.id=r.turma_id
            and public.is_gestor_for_polo(scope.polo_id))),'[]'::jsonb)) item
    from public.transferencias_academicas tr join public.parceiros p on p.id=tr.aluno_id
    where (tr.turma_origem_id=p_turma_id or tr.turma_destino_id=p_turma_id)
      and tr.tipo in ('INTERNA_TURMA','INTERNA_POLO','EXTERNA_ENVIADA')
      and exists(select 1 from public.turmas origin where origin.id=tr.turma_origem_id
        and public.is_gestor_for_polo(origin.polo_id))
    order by tr.data_transferencia desc,tr.id limit 50
  ) entries;
  return v_result;
end;
$function$;
revoke all on function public.transferir_matricula_com_revisao_financeira(uuid,text,uuid,text,text,date,uuid,text,text),
  public.get_transferencias_financeiras_turma(uuid) from public,anon,authenticated,service_role;
grant execute on function public.transferir_matricula_com_revisao_financeira(uuid,text,uuid,text,text,date,uuid,text,text),
  public.get_transferencias_financeiras_turma(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
