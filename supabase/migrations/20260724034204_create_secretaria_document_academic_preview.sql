create or replace function public.get_secretaria_documento_academico(
  p_matricula_id uuid,
  p_documento text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_payload jsonb;
  v_polo_id uuid;
begin
  if p_documento not in (
    'boletim',
    'atestado_conclusao_tecnico',
    'declaracao_frequencia',
    'historico_escolar',
    'transferencia'
  ) then
    raise exception 'Tipo de documento acadêmico não suportado.'
      using errcode = '22023';
  end if;

  select t.polo_id
    into v_polo_id
  from public.matriculas m
  join public.turmas t on t.id = m.turma_id
  where m.id = p_matricula_id;

  if v_polo_id is null then
    raise exception 'Matrícula acadêmica não localizada.'
      using errcode = 'P0002';
  end if;

  if coalesce((select auth.role()), '') <> 'service_role'
    and (
      (select auth.uid()) is null
      or not public.can_manage_secretaria_document(p_documento, v_polo_id)
    ) then
    raise exception 'Acesso ao documento acadêmico não autorizado.'
      using errcode = '42501';
  end if;

  with matricula_base as (
    select
      m.id,
      m.status,
      m.data_matricula,
      t.data_inicio,
      t.data_previsao_termino,
      c.carga_horaria as carga_horaria_curso
    from public.matriculas m
    join public.turmas t on t.id = m.turma_id
    join public.cursos c on c.id = t.curso_id
    where m.id = p_matricula_id
  ),
  resultados as (
    select r.*
    from internal_academic.get_enrollment_results(p_matricula_id) r
  ),
  componentes as (
    select
      mo.nome as modulo_nome,
      mo.created_at as modulo_ordem,
      d.nome as disciplina_nome,
      coalesce(d.carga_horaria, 0) as carga_horaria,
      r.media_final as nota,
      r.frequencia_percent as frequencia,
      r.resultado_final,
      case r.resultado_final
        when 'APROVEITADO' then 'Aproveitado'
        when 'SEM_LANCAMENTO' then 'Sem lançamento'
        when 'FREQUENCIA_PENDENTE' then 'Frequência pendente'
        when 'REPROVADO_FREQUENCIA' then 'Reprovado por frequência'
        when 'APROVADO' then 'Aprovado'
        when 'EM_RECUPERACAO' then 'Recuperação'
        when 'REPROVADO' then 'Reprovado'
        else 'Sem lançamento'
      end as situacao
    from matricula_base mb
    join public.matriculas m on m.id = mb.id
    join public.turmas_disciplinas td on td.turma_id = m.turma_id
    join public.disciplinas d on d.id = td.disciplina_id
    left join public.modulos mo on mo.id = d.modulo_id
    left join resultados r on r.disciplina_id = td.disciplina_id
  ),
  resumo as (
    select
      coalesce(sum(c.carga_horaria), 0)::integer as carga_componentes,
      round(avg(c.nota) filter (where c.nota is not null), 2) as media_geral,
      round(
        sum(c.frequencia * greatest(c.carga_horaria, 1))
          filter (where c.frequencia is not null)
        / nullif(
          sum(greatest(c.carga_horaria, 1))
            filter (where c.frequencia is not null),
          0
        ),
        2
      ) as frequencia_geral,
      coalesce(
        sum(c.carga_horaria) filter (
          where c.resultado_final in ('APROVADO', 'APROVEITADO')
        ),
        0
      )::integer as carga_cumprida,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'moduleName', coalesce(c.modulo_nome, 'Módulo'),
            'moduleOrder', coalesce(extract(epoch from c.modulo_ordem) * 1000, 0),
            'discipline', c.disciplina_nome,
            'cargaHoraria', c.carga_horaria,
            'nota', c.nota,
            'frequencia', c.frequencia,
            'situacao', c.situacao
          )
          order by c.modulo_ordem nulls first, c.disciplina_nome
        ),
        '[]'::jsonb
      ) as componentes
    from componentes c
  )
  select jsonb_build_object(
    'componentes', r.componentes,
    'mediaGeral', r.media_geral,
    'frequenciaGeral', r.frequencia_geral,
    'cargaHorariaCumprida', r.carga_cumprida,
    'cargaHorariaTotal', case
      when coalesce(mb.carga_horaria_curso, 0) > 0
        then mb.carga_horaria_curso
      else r.carga_componentes
    end,
    'inicioCurso', coalesce(mb.data_matricula, mb.data_inicio),
    'fimCurso', mb.data_previsao_termino,
    'situacaoAcademica', case
      when upper(coalesce(mb.status, '')) like '%CONCLU%' then 'Concluído(a)'
      when upper(coalesce(mb.status, '')) like '%TRANC%' then 'Trancado(a)'
      when upper(coalesce(mb.status, '')) like '%SUSP%' then 'Suspenso(a)'
      when upper(coalesce(mb.status, '')) like '%INATIV%' then 'Inativo(a)'
      when upper(coalesce(mb.status, '')) like '%ATIV%' then 'Ativo(a)'
      when upper(coalesce(mb.status, '')) like '%EXCL%'
        or upper(coalesce(mb.status, '')) like '%CANCEL%' then 'Cancelado(a)'
      else coalesce(nullif(mb.status, ''), 'Em análise')
    end
  )
    into v_payload
  from matricula_base mb
  cross join resumo r;

  return v_payload;
end;
$function$;

revoke all on function public.get_secretaria_documento_academico(uuid, text)
  from public, anon;
grant execute on function public.get_secretaria_documento_academico(uuid, text)
  to authenticated, service_role;
