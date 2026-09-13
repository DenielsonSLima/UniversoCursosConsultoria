begin;
create index proesc_observations_feed_time_idx on internal_proesc.financial_snapshots(observed_at desc,id desc);
create index proesc_settlement_feed_time_idx on internal_proesc.reconciliation_events(recorded_at desc,id desc)
  where result='APPLIED';
create function public.get_proesc_reconciliation_feed_page(
  p_context text default 'runs',p_polo_id uuid default null,p_run_id uuid default null,
  p_started_from timestamptz default null,p_started_to timestamptz default null,
  p_page integer default 1,p_page_size integer default 20
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_polos uuid[]; v_from timestamptz; v_to timestamptz;
  v_context text:=lower(coalesce(p_context,'runs'));
  v_page integer:=greatest(1,coalesce(p_page,1));
  v_size integer:=greatest(1,least(100,coalesce(p_page_size,20)));
  v_details boolean; v_items jsonb:='[]'; v_total bigint:=0;
begin
  v_polos:=internal_proesc.monitor_scope(p_polo_id);
  select started_from,started_to into v_from,v_to from internal_proesc.monitor_period(p_started_from,p_started_to);
  v_details:=public.gestor_has_module('financeiro') and public.gestor_has_financeiro_tab('receber');
  if v_context not in ('runs','observations','settlements','errors') or v_page>100000 then
    raise exception 'Filtro de consulta inválido.' using errcode='22023'; end if;

  if v_context='runs' then
    with filtered as materialized(
      select r.* from internal_proesc.sync_runs r
      where r.started_at>=v_from and r.started_at<=v_to and (p_run_id is null or r.id=p_run_id)
        and exists(select 1 from internal_proesc.sync_run_items i where i.run_id=r.id and i.polo_id=any(v_polos))
    ), page as materialized(select * from filtered order by started_at desc,id desc limit v_size offset (v_page::bigint-1)*v_size)
    select (select count(*) from filtered),coalesce(jsonb_agg(jsonb_build_object(
      'id',r.id,'startedAt',r.started_at,'finishedAt',r.finished_at,'status',r.status,'durationMs',r.duration_ms,
      'claimed',case when p_polo_id is null then r.claimed else scoped.claimed end,
      'consulted',case when p_polo_id is null then r.consulted else scoped.consulted end,
      'applied',case when p_polo_id is null then r.applied else scoped.applied end,
      'unchanged',case when p_polo_id is null then r.unchanged else scoped.unchanged end,
      'review',case when p_polo_id is null then r.review else scoped.review end,
      'failed',case when p_polo_id is null then r.failed else scoped.failed end,
      'httpRequests',case when p_polo_id is null and (r.telemetry_complete or http.total>0) then http.total end,
      'httpFailed',case when p_polo_id is null and (r.telemetry_complete or http.total>0) then http.failed end,
      'errorCode',r.error_code,'errorMessage',internal_proesc.sync_error_message(r.error_code),'stage',r.stage,
      'telemetryComplete',r.telemetry_complete,'metricsScope',case when p_polo_id is null then 'GLOBAL' else 'POLO_ITEMS_SHARED_EXECUTION' end
    ) order by r.started_at desc,r.id desc),'[]'::jsonb) into v_total,v_items
    from page r
    cross join lateral(select count(*) claimed,count(*) filter(where snapshot_id is not null) consulted,
      count(*) filter(where result='APPLIED') applied,count(*) filter(where result='UNCHANGED') unchanged,
      count(*) filter(where result='REVIEW') review,count(*) filter(where result='FAILED') failed
      from internal_proesc.sync_run_items i where i.run_id=r.id and i.polo_id=any(v_polos)) scoped
    cross join lateral(select count(*) total,count(*) filter(where error_code is not null) failed
      from internal_proesc.sync_run_http h where h.run_id=r.id) http;

  elsif v_context='observations' then
    with links as materialized(select * from internal_proesc.monitor_links(v_polos)),
    filtered as materialized(select s.id,s.link_id,s.observed_at from internal_proesc.financial_snapshots s
      join links l on l.link_id=s.link_id
      where s.observed_at>=v_from and s.observed_at<=v_to
        and (p_run_id is null or exists(select 1 from internal_proesc.sync_run_items i where i.run_id=p_run_id and i.snapshot_id=s.id))),
    page as materialized(select * from filtered order by observed_at desc,id desc limit v_size offset (v_page::bigint-1)*v_size)
    select (select count(*) from filtered),coalesce(jsonb_agg(jsonb_build_object(
      'id',s.id,'observedAt',s.observed_at,'recordedAt',s.recorded_at,
      'runId',(select i.run_id from internal_proesc.sync_run_items i join internal_proesc.sync_runs r on r.id=i.run_id
        where i.snapshot_id=s.id order by r.started_at desc limit 1),
      'classId',t.id,'classCode',t.codigo,'className',t.nome,'poloId',p.id,'poloName',concat_ws(' · ',p.nome,p.cidade),
      'sourceStatus',s.source_status,'verification',s.verification,
      'reviewReasons',(select coalesce(jsonb_agg(reason),'[]'::jsonb) from jsonb_array_elements_text(s.review_reasons) reason
        where reason in ('PRINCIPAL_DIVERGENTE','ESTADO_REQUER_REVISAO','PAGAMENTO_INCOMPLETO',
          'MULTIPLICIDADE_OU_AUSENCIA_PAGAMENTO','PRINCIPAL_NAO_CONFIRMADO','PAGAMENTO_NAO_CONFIRMADO',
          'COMPONENTES_NAO_COMPROVADOS','ABERTO_COM_PAGAMENTO_INCOERENTE','HISTORICO_ABERTO_NAO_COMPROVADO','SEM_CONFIRMACAO'))
    ) || case when v_details then jsonb_build_object('receivableId',l.receivable_id,
      'studentName',student.nome,'description',c.descricao,'externalKey',source_link.source_key,
      'principalAmount',s.principal_cents::numeric/100,
      'receivedAmount',case when s.verification='VERIFIED' then s.received_cents::numeric/100 end,
      'paymentDate',case when s.verification='VERIFIED' then s.payment_date end)
      else '{}'::jsonb end order by s.observed_at desc,s.id desc),'[]'::jsonb) into v_total,v_items
    from page selected join internal_proesc.financial_snapshots s on s.id=selected.id
    join links l on l.link_id=s.link_id join public.turmas t on t.id=l.class_id join public.polos p on p.id=l.polo_id
    join internal_proesc.obligation_links source_link on source_link.id=l.link_id
    join public.contas_receber c on c.id=l.receivable_id
    left join public.matriculas m on m.id=c.matricula_id left join public.parceiros student on student.id=m.aluno_id;

  elsif v_context='settlements' then
    with links as materialized(select * from internal_proesc.monitor_links(v_polos)),
    filtered as materialized(select e.id,e.link_id,e.recorded_at from internal_proesc.reconciliation_events e
      join links l on l.link_id=e.link_id
      where e.result='APPLIED' and e.mode in ('AUTO','IMPORT','CORRECTION')
        and e.after_state->>'status'='PAGO' and exists(select 1 from internal_proesc.financial_snapshots s
          where s.id=e.snapshot_id and s.source_status='PAID' and s.verification='VERIFIED')
        and e.recorded_at>=v_from and e.recorded_at<=v_to
        and (p_run_id is null or exists(select 1 from internal_proesc.sync_run_items i where i.run_id=p_run_id and i.snapshot_id=e.snapshot_id))),
    page as materialized(select * from filtered order by recorded_at desc,id desc limit v_size offset (v_page::bigint-1)*v_size)
    select (select count(*) from filtered),coalesce(jsonb_agg(jsonb_build_object(
      'id',e.id,'recordedAt',e.recorded_at,'mode',e.mode,'result',e.result,
      'classCode',t.codigo,'poloName',concat_ws(' · ',p.nome,p.cidade)
    ) || case when v_details then jsonb_build_object('receivableId',l.receivable_id,
      'studentName',student.nome,'description',c.descricao,'externalKey',source_link.source_key,
      'principalAmount',e.after_state->'valor','receivedAmount',e.after_state->'valor_pago','paymentDate',e.after_state->'data_pagamento')
      else '{}'::jsonb end order by e.recorded_at desc,e.id desc),'[]'::jsonb) into v_total,v_items
    from page selected join internal_proesc.reconciliation_events e on e.id=selected.id
    join links l on l.link_id=e.link_id join public.turmas t on t.id=l.class_id join public.polos p on p.id=l.polo_id
    join internal_proesc.obligation_links source_link on source_link.id=l.link_id
    join public.contas_receber c on c.id=l.receivable_id
    left join public.matriculas m on m.id=c.matricula_id left join public.parceiros student on student.id=m.aluno_id;

  else
    with runs as materialized(select r.* from internal_proesc.sync_runs r
      where (p_run_id is null or r.id=p_run_id)
        and exists(select 1 from internal_proesc.sync_run_items i where i.run_id=r.id and i.polo_id=any(v_polos))),
    errors as materialized(
      select concat(h.run_id,':http:',h.source_unit_id,':',h.source_year,':',h.source_month) id,h.run_id,
        h.recorded_at,'FETCH'::text stage,h.error_code,h.http_status,h.duration_ms,null::uuid class_id,null::uuid polo_id,null::uuid link_id
      from internal_proesc.sync_run_http h join runs r on r.id=h.run_id where h.error_code is not null
      union all
      select concat(i.run_id,':item:',i.link_id),i.run_id,i.recorded_at,i.stage,i.error_code,null::integer,null::integer,i.class_id,i.polo_id,i.link_id
      from internal_proesc.sync_run_items i join runs r on r.id=i.run_id where i.error_code is not null and i.polo_id=any(v_polos)
      union all
      select concat(r.id,':run'),r.id,coalesce(r.finished_at,r.abandoned_at),r.stage,r.error_code,null::integer,r.duration_ms,null::uuid,null::uuid,null::uuid
      from runs r where r.error_code is not null
        and not exists(select 1 from internal_proesc.sync_run_http h where h.run_id=r.id and h.error_code is not null)
        and not exists(select 1 from internal_proesc.sync_run_items i where i.run_id=r.id and i.error_code is not null)
    ), filtered as materialized(select * from errors where recorded_at>=v_from and recorded_at<=v_to),
    page as materialized(select * from filtered order by recorded_at desc,id desc limit v_size offset (v_page::bigint-1)*v_size)
    select (select count(*) from filtered),coalesce(jsonb_agg(jsonb_build_object(
      'id',e.id,'runId',e.run_id,'recordedAt',e.recorded_at,'stage',e.stage,'errorCode',e.error_code,
      'errorMessage',internal_proesc.sync_error_message(e.error_code),'httpStatus',e.http_status,'durationMs',e.duration_ms,
      'classCode',t.codigo,'poloName',case when p.id is not null then concat_ws(' · ',p.nome,p.cidade) end,
      'metricsScope',case when e.polo_id is null then 'GLOBAL_SHARED_WORKER' else 'OBLIGATION' end
    ) || case when v_details and e.link_id is not null then jsonb_build_object(
      'receivableId',source_link.receivable_id,'studentName',student.nome,'description',c.descricao,'externalKey',source_link.source_key)
      else '{}'::jsonb end order by e.recorded_at desc,e.id desc),'[]'::jsonb) into v_total,v_items
    from page e left join public.turmas t on t.id=e.class_id left join public.polos p on p.id=e.polo_id
    left join internal_proesc.obligation_links source_link on source_link.id=e.link_id
    left join public.contas_receber c on c.id=source_link.receivable_id
    left join public.matriculas m on m.id=c.matricula_id left join public.parceiros student on student.id=m.aluno_id;
  end if;
  return jsonb_build_object('items',v_items,'page',v_page,'pageSize',v_size,'totalCount',v_total,
    'totalPages',greatest(1,ceil(v_total::numeric/v_size)::integer),'context',v_context,
    'period',jsonb_build_object('startedFrom',v_from,'startedTo',v_to),'canViewReceivableDetails',v_details);
end;
$$;
revoke all on function public.get_proesc_reconciliation_feed_page(text,uuid,uuid,timestamptz,timestamptz,integer,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.get_proesc_reconciliation_feed_page(text,uuid,uuid,timestamptz,timestamptz,integer,integer) to authenticated;
notify pgrst,'reload schema';
commit;
