create function public.materializar_aulas_diario_importado_secure(
  p_request_id uuid,p_importacao_id uuid,p_preview_sha256 text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_source internal_academic.diario_importacoes;
  v_existing internal_academic.diario_aulas_materializacao_requests;
  v_preview jsonb;
  v_plan jsonb;
  v_lesson jsonb;
  v_aula uuid;
  v_response jsonb;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Materialização restrita ao serviço autorizado.' using errcode='42501';
  end if;
  if p_request_id is null or p_importacao_id is null or p_preview_sha256 is null
      or p_preview_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'Pedido ou fingerprint de materialização inválido.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('diario-materialize-request:'||p_request_id,0));
  select * into v_source from internal_academic.diario_importacoes where id=p_importacao_id;
  if not found then raise exception 'Fonte de diário inexistente.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('technical_turma:'||v_source.turma_id,0));
  perform 1 from public.turmas where id=v_source.turma_id for share;
  -- Match the established lesson/closure trigger order before the history lock.
  perform pg_advisory_xact_lock(hashtext(v_source.turma_id::text),hashtext(v_source.disciplina_id::text));
  perform pg_advisory_xact_lock(hashtextextended('diario-history:'||v_source.turma_id||':'||v_source.disciplina_id,0));
  perform pg_advisory_xact_lock(hashtextextended('technical_workload:'||v_source.turma_id||':'||v_source.disciplina_id,0));
  perform 1 from public.turmas_disciplinas td
    join public.periodos_letivos pl on pl.id=td.periodo_letivo_id
    join public.disciplinas d on d.id=td.disciplina_id
    where td.turma_id=v_source.turma_id and td.disciplina_id=v_source.disciplina_id
    for share of td,pl,d;
  v_preview := public.preview_aulas_diario_importado_secure(p_importacao_id);
  v_plan := v_preview->'plano';
  if (v_preview->>'previewSha256') is distinct from p_preview_sha256 then
    raise exception 'A prévia mudou; confira novamente antes de materializar.' using errcode='23514';
  end if;
  select * into v_existing from internal_academic.diario_aulas_materializacao_requests
    where request_id=p_request_id for update;
  if found then
    if v_existing.importacao_id<>p_importacao_id or v_existing.preview_sha256<>p_preview_sha256
        or v_existing.plano<>v_plan or v_existing.status<>'DONE' then
      raise exception 'Pedido reutilizado com fonte ou conteúdo diferente.' using errcode='23505';
    end if;
    if (select count(*) from internal_academic.diario_aulas_materializadas
          where importacao_id=p_importacao_id)<>(v_plan->>'quantidadeAulas')::integer
      or exists(select 1 from jsonb_array_elements(v_plan->'aulas') l
        left join internal_academic.diario_aulas_materializadas m
          on m.aula_historica_id=(l->>'aulaHistoricaId')::uuid and m.importacao_id=p_importacao_id
        left join public.aulas_turma a on a.id=m.aula_id
        left join public.diario_praticas p on p.aula_id=a.id
          and p.turma_id=v_source.turma_id and p.disciplina_id=v_source.disciplina_id
        where a.id is null or a.turma_id<>v_source.turma_id or a.disciplina_id<>v_source.disciplina_id
          or a.data_aula is distinct from (l->>'data')::date
          or a.carga_horaria is distinct from (l->>'cargaAjustada')::numeric
          or a.titulo is distinct from l->>'titulo' or a.sessao<>'U'
          or a.hora_inicio is not null or a.hora_fim is not null
          or p.pratica_pedagogica is distinct from nullif(btrim(l->>'pratica'),'')) then
      raise exception 'As aulas materializadas divergiram da origem; revisão necessária.' using errcode='23514';
    end if;
    return v_existing.response||jsonb_build_object('replay',true);
  end if;
  if exists(select 1 from internal_academic.diario_aulas_materializacao_requests where importacao_id=p_importacao_id)
    or exists(select 1 from public.aulas_turma where turma_id=v_source.turma_id and disciplina_id=v_source.disciplina_id)
    or exists(select 1 from public.diario_praticas where turma_id=v_source.turma_id and disciplina_id=v_source.disciplina_id)
    or exists(select 1 from public.atividades_extra_classe where turma_id=v_source.turma_id
      and disciplina_id=v_source.disciplina_id and status='PUBLICADA' and carga_horaria_compensacao>0) then
    raise exception 'Escopo já contém aulas ou compensações; concilie antes de materializar.' using errcode='23505';
  end if;
  insert into internal_academic.diario_aulas_materializacao_requests
    (request_id,importacao_id,preview_sha256,plano,status)
    values(p_request_id,p_importacao_id,p_preview_sha256,v_plan,'EXECUTING');
  for v_lesson in select value from jsonb_array_elements(v_plan->'aulas') loop
    insert into public.aulas_turma(turma_id,disciplina_id,titulo,carga_horaria,data_aula,sessao,hora_inicio,hora_fim)
    values(v_source.turma_id,v_source.disciplina_id,v_lesson->>'titulo',
      (v_lesson->>'cargaAjustada')::numeric,(v_lesson->>'data')::date,'U',null,null)
      returning id into v_aula;
    insert into internal_academic.diario_aulas_materializadas
      (importacao_id,aula_historica_id,aula_id,request_id,data_documental,carga_documental,carga_ajustada)
    values(p_importacao_id,(v_lesson->>'aulaHistoricaId')::uuid,v_aula,p_request_id,
      (v_lesson->>'data')::date,(v_lesson->>'cargaDocumental')::numeric,(v_lesson->>'cargaAjustada')::numeric);
    if nullif(btrim(v_lesson->>'pratica'),'') is not null then
      insert into public.diario_praticas(turma_id,disciplina_id,aula_id,pratica_pedagogica)
      values(v_source.turma_id,v_source.disciplina_id,v_aula,btrim(v_lesson->>'pratica'));
    end if;
  end loop;
  if (select sum(a.carga_horaria) from public.aulas_turma a
      join internal_academic.diario_aulas_materializadas m on m.aula_id=a.id
      where m.importacao_id=p_importacao_id) is distinct from (v_plan->>'cargaOficialTP')::numeric then
    raise exception 'Carga final difere da prévia oficial.' using errcode='23514';
  end if;
  v_response := jsonb_build_object('requestId',p_request_id,'importacaoId',p_importacao_id,
    'aulasMaterializadas',(v_plan->>'quantidadeAulas')::integer,
    'cargaOficialTP',(v_plan->>'cargaOficialTP')::numeric,'previewSha256',p_preview_sha256,'replay',false);
  update internal_academic.diario_aulas_materializacao_requests
    set status='DONE',response=v_response,completed_at=clock_timestamp() where request_id=p_request_id;
  return v_response;
end;
$$;
revoke all on function public.materializar_aulas_diario_importado_secure(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.materializar_aulas_diario_importado_secure(uuid,uuid,text) to service_role;
