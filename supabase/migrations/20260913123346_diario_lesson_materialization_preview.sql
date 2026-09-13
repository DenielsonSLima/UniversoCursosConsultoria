-- Dates follow the source contents table as explicitly selected by the user.
-- Hours are distributed proportionally in cents of an hour; no clock times or
-- additional encounters are inferred. Internship hours remain outside this plan.
create function public.preview_aulas_diario_importado_secure(p_importacao_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_source internal_academic.diario_importacoes;
  v_target numeric;
  v_stage numeric;
  v_total numeric;
  v_count integer;
  v_lessons jsonb;
  v_plan jsonb;
  v_period uuid;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Materialização restrita ao serviço autorizado.' using errcode='42501';
  end if;
  select * into v_source from internal_academic.diario_importacoes where id=p_importacao_id;
  if not found then raise exception 'Fonte de diário inexistente.' using errcode='22023'; end if;
  select coalesce(d.carga_horaria_teoria,0)+coalesce(d.carga_horaria_pratica,0),
    coalesce(d.carga_horaria_estagio,0),td.periodo_letivo_id
    into v_target,v_stage,v_period
  from public.turmas t join public.cursos c on c.id=t.curso_id
  join public.modulos m on m.curso_id=c.id
  join public.disciplinas d on d.modulo_id=m.id
  join public.turmas_disciplinas td on td.turma_id=t.id and td.disciplina_id=d.id
  join public.periodos_letivos pl on pl.id=td.periodo_letivo_id
    and pl.turma_id=t.id and pl.modulo_id=m.id
  where t.id=v_source.turma_id and d.id=v_source.disciplina_id
    and td.professor_id=v_source.professor_id and c.modalidade='TECNICO'
    and t.status='EM_ANDAMENTO' and pl.status in ('PLANEJADO','ABERTO')
    and coalesce(td.bloqueio_diario,'ABERTO')='ABERTO';
  if not found or v_target<=0 or v_target<>round(v_target,2) then
    raise exception 'Grade, docente, período ou carga oficial não permitem materialização.' using errcode='23514';
  end if;
  if exists(select 1 from public.planos_curso p where p.turma_id=v_source.turma_id
      and p.disciplina_id=v_source.disciplina_id and p.status='CONCLUIDO') then
    raise exception 'Plano de Curso concluído impede alterar aulas.' using errcode='55000';
  end if;
  select count(*),sum(carga_horaria) into v_count,v_total
    from internal_academic.diario_aulas_importadas where importacao_id=p_importacao_id;
  if v_count=0 or v_count>200 or v_total is null or v_total<=0
    or exists(select 1 from internal_academic.diario_aulas_importadas a
      where a.importacao_id=p_importacao_id and (a.carga_horaria is null or a.carga_horaria<=0
        or coalesce(a.fonte#>>'{date,value}','') !~ '^\d{4}-\d{2}-\d{2}$'
        or nullif(btrim(a.conteudo),'') is null or length(a.conteudo)>1000)) then
    raise exception 'Aulas de origem incompletas; datas, conteúdo e durações são obrigatórios.' using errcode='23514';
  end if;
  if (select count(distinct (a.fonte#>>'{date,value}')::date)
      from internal_academic.diario_aulas_importadas a where a.importacao_id=p_importacao_id)<>v_count then
    raise exception 'Datas repetidas exigem resolução documental, sem criação de sessões presumidas.' using errcode='23514';
  end if;

  with weights as (
    select a.*, v_target*100*a.carga_horaria/v_total as quota
    from internal_academic.diario_aulas_importadas a where a.importacao_id=p_importacao_id
  ), residuals as (
    select w.*,floor(quota) as cents,
      row_number() over(order by quota-floor(quota) desc,ordem,source_key) as remainder_order,
      v_target*100-sum(floor(quota)) over() as remaining_cents
    from weights w
  )
  select jsonb_agg(jsonb_build_object(
    'aulaHistoricaId',id,'sourceKey',source_key,'ordem',ordem,
    'data',(fonte#>>'{date,value}')::date,
    'dataChamadaOriginal',fonte#>'{attendanceDateHeader}',
    'cargaDocumental',carga_horaria,
    'cargaAjustada',(cents+case when remainder_order<=remaining_cents then 1 else 0 end)/100,
    'titulo',conteudo,'pratica',pratica,'sessao','U','horaInicio',null,'horaFim',null
  ) order by ordem,source_key) into v_lessons from residuals;
  if exists(select 1 from jsonb_array_elements(v_lessons) l
      where (l->>'cargaAjustada')::numeric<=0 or (l->>'cargaAjustada')::numeric>999.99)
    or (select sum((l->>'cargaAjustada')::numeric) from jsonb_array_elements(v_lessons) l)<>v_target then
    raise exception 'Distribuição proporcional não pode ser representada no contrato das aulas.' using errcode='23514';
  end if;
  v_plan := jsonb_build_object('contractVersion',1,'importacaoId',p_importacao_id,
    'turmaId',v_source.turma_id,'disciplinaId',v_source.disciplina_id,
    'professorId',v_source.professor_id,'periodoId',v_period,
    'sourceSha256',v_source.source_sha256,'payloadSha256',v_source.payload_sha256,
    'manifestSha256',v_source.manifest_sha256,'cargaDocumental',v_total,
    'cargaOficialTP',v_target,'cargaEstagioSeparada',v_stage,
    'regraDatas','QUADRO_CONTEUDOS_DOCX','regraHoras','PROPORCIONAL_MAIOR_RESTO_0_01H',
    'quantidadeAulas',v_count,'aulas',v_lessons);
  return jsonb_build_object('previewSha256',encode(extensions.digest(v_plan::text,'sha256'),'hex'),
    'plano',v_plan);
end;
$$;
revoke all on function public.preview_aulas_diario_importado_secure(uuid) from public,anon,authenticated;
grant execute on function public.preview_aulas_diario_importado_secure(uuid) to service_role;
