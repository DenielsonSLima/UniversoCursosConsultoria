-- A bank job belongs to its transfer movement, even when the title was reused in history.
begin;
create or replace function public.get_transferencias_financeiras_turma(p_turma_id uuid)
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
          and exists(select 1 from public.matricula_movimentacoes job_movement
            where job_movement.id=q.movement_id
              and job_movement.matricula_id=tr.matricula_origem_id
              and job_movement.tipo='TRANSFERENCIA_EXTERNA_ENVIADA'
              and job_movement.data_movimentacao=tr.data_transferencia
              and job_movement.metadados->>'transferencia_id'=tr.id::text)
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
revoke all on function public.get_transferencias_financeiras_turma(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_transferencias_financeiras_turma(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
