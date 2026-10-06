-- Calendário técnico cronológico da turma. A exportação por módulo existente
-- conserva suas assinaturas e o comportamento anterior.
create or replace function public.preparar_calendario_aulas_cronologico_secure(
  p_polo_id uuid,
  p_modalidade text,
  p_turma_id uuid,
  p_modulo_ids uuid[] default null,
  p_data_inicio date default null,
  p_data_fim date default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_base jsonb;
  v_documento jsonb;
  v_modulo_ids uuid[];
  v_modulos_resumo text;
  v_modulos_selecionados jsonb;
  v_linhas jsonb;
  v_primeira_aula date;
  v_ultima_aula date;
  v_data_inicio date;
  v_data_fim date;
  v_alcance text;
  v_subtitulo text;
  v_status text;
  v_mensagem text;
  v_sufixo_arquivo text;
begin
  if not public.can_manage_calendario_aulas(p_polo_id) then
    raise exception 'Acesso ao calendário do polo não autorizado.'
      using errcode = '42501';
  end if;

  if upper(btrim(coalesce(p_modalidade, ''))) <> 'TECNICO' then
    raise exception 'O calendário cronológico por módulos exige curso Técnico.'
      using errcode = '22023';
  end if;

  if p_modulo_ids is not null and (
    cardinality(p_modulo_ids) = 0
    or array_position(p_modulo_ids, null::uuid) is not null
  ) then
    raise exception 'Selecione módulos válidos ou todos os módulos da turma.'
      using errcode = '22023';
  end if;

  if (p_data_inicio is null) <> (p_data_fim is null)
    or (p_data_inicio is not null and p_data_inicio > p_data_fim) then
    raise exception 'Informe as duas datas do período em ordem válida.'
      using errcode = '22023';
  end if;

  -- Usa o documento canônico para conservar modelo, cabeçalho, marca e revisão.
  -- As linhas mensais retornadas pela assinatura legada são descartadas aqui.
  v_base := public.preparar_calendario_aulas_exportacao_secure(
    p_polo_id,
    'TECNICO',
    p_turma_id,
    date_trunc('month', current_date)::date,
    null::uuid
  );

  select
    array_agg(selected.id order by selected.ordem nulls last, selected.nome, selected.id),
    nullif(string_agg(selected.nome, ' • '
      order by selected.ordem nulls last, selected.nome, selected.id), '')
  into v_modulo_ids, v_modulos_resumo
  from (
    select distinct modulo.id, btrim(modulo.nome) as nome, modulo.ordem
    from public.turmas_disciplinas grade
    join public.disciplinas disciplina on disciplina.id = grade.disciplina_id
    join public.modulos modulo on modulo.id = disciplina.modulo_id
    where grade.turma_id = p_turma_id
  ) selected
  where p_modulo_ids is null or selected.id = any(p_modulo_ids);

  if p_modulo_ids is not null and exists (
    select 1
    from unnest(p_modulo_ids) as requested(id)
    where not (requested.id = any(coalesce(v_modulo_ids, '{}'::uuid[])))
  ) then
    raise exception 'Módulo não pertence à grade desta turma.'
      using errcode = '22023';
  end if;

  -- Uma linha representa as sessões da mesma disciplina no mesmo dia.
  -- IDs impedem que componentes homônimos de módulos distintos se fundam.
  with encontros as (
    select
      min(aula.id::text)::uuid as encontro_id,
      aula.disciplina_id,
      aula.data_aula,
      disciplina.nome as componente_curricular,
      disciplina.ordem as disciplina_ordem,
      modulo.id as modulo_id,
      btrim(modulo.nome) as modulo_nome,
      modulo.ordem as modulo_ordem,
      min(aula.hora_inicio) as hora_inicio,
      max(aula.hora_fim) as hora_fim,
      bool_and(aula.hora_inicio is not null and aula.hora_fim is not null)
        as tem_horario,
      coalesce(
        nullif(btrim(professor.nome), ''),
        nullif(btrim(grade.professor_nome), ''),
        'Professor não informado'
      ) as professor_nome
    from public.aulas_turma aula
    join public.turmas_disciplinas grade
      on grade.turma_id = aula.turma_id
      and grade.disciplina_id = aula.disciplina_id
    join public.disciplinas disciplina on disciplina.id = aula.disciplina_id
    join public.modulos modulo on modulo.id = disciplina.modulo_id
    left join public.parceiros professor on professor.id = grade.professor_id
    where aula.turma_id = p_turma_id
      and aula.data_aula is not null
      and modulo.id = any(v_modulo_ids)
      and (p_data_inicio is null or aula.data_aula >= p_data_inicio)
      and (p_data_fim is null or aula.data_aula <= p_data_fim)
    group by
      aula.turma_id, aula.disciplina_id, aula.data_aula,
      disciplina.nome, disciplina.ordem,
      modulo.id, modulo.nome, modulo.ordem,
      professor.nome, grade.professor_nome
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'encontro_id', encontro.encontro_id,
      'disciplina_id', encontro.disciplina_id,
      'modulo_id', encontro.modulo_id,
      'modulo_nome', encontro.modulo_nome,
      'modulo_rotulo', coalesce(
        nullif(substring(encontro.modulo_nome from
          '(?i)^m[oó]dulo[[:space:]]+[ivxlcdm0-9]+\M'), ''),
        encontro.modulo_nome
      ),
      'data_iso', to_char(encontro.data_aula, 'YYYY-MM-DD'),
      'hora_inicio', case when encontro.tem_horario
        then to_char(encontro.hora_inicio, 'HH24:MI') else null end,
      'componente_curricular', encontro.componente_curricular,
      'data_exibicao', to_char(encontro.data_aula, 'DD/MM/YYYY'),
      'horario_exibicao', case when encontro.tem_horario then
        to_char(encontro.hora_inicio, 'HH24:MI') || ' – '
          || to_char(encontro.hora_fim, 'HH24:MI')
        else coalesce(
          nullif(v_base #>> '{documento,template,observacaoSemHorario}', ''),
          'Horário não informado'
        ) end,
      'professores_observacao', encontro.professor_nome
    ) order by
      encontro.data_aula,
      (case when encontro.tem_horario then encontro.hora_inicio end) nulls last,
      encontro.modulo_ordem nulls last,
      encontro.disciplina_ordem nulls last,
      encontro.disciplina_id,
      encontro.encontro_id), '[]'::jsonb),
    min(encontro.data_aula),
    max(encontro.data_aula)
  into v_linhas, v_primeira_aula, v_ultima_aula
  from encontros encontro;

  select coalesce(jsonb_agg(jsonb_build_object(
    'modulo_id', selected.id,
    'modulo_nome', selected.nome,
    'modulo_rotulo', coalesce(
      nullif(substring(selected.nome from
        '(?i)^m[oó]dulo[[:space:]]+[ivxlcdm0-9]+\M'), ''),
      selected.nome
    ),
    'modulo_ordem', selected.ordem,
    'total_aulas', (
      select count(*)::integer
      from jsonb_array_elements(v_linhas) linha
      where linha ->> 'modulo_id' = selected.id::text
    )
  ) order by selected.ordem nulls last, selected.nome, selected.id), '[]'::jsonb)
  into v_modulos_selecionados
  from (
    select distinct modulo.id, btrim(modulo.nome) as nome, modulo.ordem
    from public.turmas_disciplinas grade
    join public.disciplinas disciplina on disciplina.id = grade.disciplina_id
    join public.modulos modulo on modulo.id = disciplina.modulo_id
    where grade.turma_id = p_turma_id
      and modulo.id = any(v_modulo_ids)
  ) selected;

  v_data_inicio := coalesce(p_data_inicio, v_primeira_aula);
  v_data_fim := coalesce(p_data_fim, v_ultima_aula);
  if p_data_inicio is null then
    v_alcance := 'Todas as aulas programadas';
    if v_primeira_aula is not null then
      v_alcance := v_alcance || ' · '
        || to_char(v_primeira_aula, 'DD/MM/YYYY') || ' a '
        || to_char(v_ultima_aula, 'DD/MM/YYYY');
    end if;
  else
    v_alcance := 'Período de ' || to_char(p_data_inicio, 'DD/MM/YYYY')
      || ' a ' || to_char(p_data_fim, 'DD/MM/YYYY');
  end if;

  v_subtitulo := replace(replace(replace(
    coalesce(nullif(v_base #>> '{documento,template,subtitulo}', ''),
      '{{CURSO}} · {{TURMA}}'),
    '{{CURSO}}', coalesce(v_base #>> '{documento,curso}', '')),
    '{{TURMA}}', coalesce(v_base #>> '{documento,turma}', '')),
    '{{MODULO}}', coalesce(v_modulos_resumo, ''));

  v_sufixo_arquivo := case when p_data_inicio is null then 'completo'
    else to_char(p_data_inicio, 'YYYYMMDD') || '-'
      || to_char(p_data_fim, 'YYYYMMDD') end;
  v_documento := (v_base -> 'documento') || jsonb_build_object(
    'modo_exportacao', 'CRONOLOGICO',
    'alcance', v_alcance,
    'data_inicio', v_data_inicio,
    'data_fim', v_data_fim,
    'modulos_selecionados', v_modulos_selecionados,
    'modulo', v_modulos_resumo,
    'subtitulo', v_subtitulo,
    'arquivo_nome', lower(regexp_replace(
      'calendario-cronologico-'
        || coalesce(nullif(v_base #>> '{documento,turma}', ''), 'turma')
        || '-' || v_sufixo_arquivo,
      '[^a-zA-Z0-9]+', '-', 'g'
    )) || '.pdf'
  );

  if jsonb_array_length(v_linhas) > 0 then
    v_status := 'PRONTO';
    v_mensagem := null;
  else
    v_status := 'SEM_GRADE';
    v_mensagem := case when coalesce(cardinality(v_modulo_ids), 0) = 0
      then 'Esta turma não possui módulos vinculados à grade.'
      else 'Não há aulas programadas para os módulos e o período selecionados.'
    end;
  end if;

  return jsonb_build_object(
    'status', v_status,
    'mensagem', v_mensagem,
    'documento', v_documento,
    'linhas', v_linhas
  );
end;
$function$;

revoke all on function public.preparar_calendario_aulas_cronologico_secure(
  uuid, text, uuid, uuid[], date, date
) from public, anon;
grant execute on function public.preparar_calendario_aulas_cronologico_secure(
  uuid, text, uuid, uuid[], date, date
) to authenticated, service_role;
