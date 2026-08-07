create or replace function public.get_professor_disciplinas_portal(p_polo_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_professor_id uuid := public.current_professor_id();
  v_today date := (pg_catalog.timezone('America/Maceio', now()))::date;
  v_result jsonb;
begin
  if v_professor_id is null or p_polo_id is null then
    return '[]'::jsonb;
  end if;

  with assigned as (
    select
      td.turma_id,
      td.disciplina_id,
      td.professor_nome,
      td.concluida,
      td.periodo_letivo_id,
      coalesce(td.bloqueio_diario, 'ABERTO') as bloqueio_diario,
      t.codigo as turma_codigo,
      t.nome as turma_nome,
      t.curso_id,
      t.polo_id,
      t.data_inicio,
      t.data_previsao_termino,
      t.turno,
      coalesce(t.status, 'STATUS_INDEFINIDO') as turma_status,
      t.vagas_totais,
      t.valor_matricula,
      t.valor_rematricula,
      t.qtd_parcelas,
      t.valor_parcela,
      t.desconto_pontualidade,
      t.juros_atraso,
      t.multa_atraso,
      c.nome as curso_nome,
      upper(coalesce(c.modalidade, 'TECNICO')) as modalidade,
      d.nome as disciplina_nome,
      coalesce(d.carga_horaria, 0)::numeric as carga_horaria,
      coalesce(d.carga_horaria_estagio, 0)::numeric as carga_horaria_estagio,
      m.nome as modulo_nome,
      coalesce(pl.status, 'STATUS_INDEFINIDO') as periodo_status,
      po.nome as polo_nome
    from public.turmas_disciplinas td
    join public.turmas t
      on t.id = td.turma_id
     and t.polo_id = p_polo_id
    join public.cursos c
      on c.id = t.curso_id
     and upper(coalesce(c.modalidade, '')) = 'TECNICO'
    join public.disciplinas d
      on d.id = td.disciplina_id
    left join public.modulos m on m.id = d.modulo_id
    left join public.periodos_letivos pl on pl.id = td.periodo_letivo_id
    left join public.polos po on po.id = t.polo_id
    where td.professor_id = v_professor_id
  ),
  aulas_resumo as (
    -- Regra temporal canônica do portal: a carga "até hoje" considera
    -- somente encontros cadastrados cuja data já ocorreu em Maceió.
    select
      a.turma_id,
      a.disciplina_id,
      count(distinct a.data_aula) filter (where a.data_aula is not null)::integer as total_aulas,
      count(distinct a.data_aula) filter (
        where a.data_aula is not null
          and a.data_aula <= v_today
      )::integer as total_aulas_dadas,
      coalesce(sum(a.carga_horaria) filter (
        where a.data_aula is not null
          and a.data_aula <= v_today
      ), 0)::numeric as carga_horaria_dada,
      coalesce(sum(a.carga_horaria), 0)::numeric as horas_aulas_programadas,
      min(a.data_aula) as primeira_aula,
      max(a.data_aula) as ultima_aula
    from public.aulas_turma a
    join assigned ass
      on ass.turma_id = a.turma_id
     and ass.disciplina_id = a.disciplina_id
    group by a.turma_id, a.disciplina_id
  ),
  atividades_resumo as (
    select
      ae.turma_id,
      ae.disciplina_id,
      count(*)::integer as total_atividades,
      coalesce(sum(ae.carga_horaria_compensacao) filter (
        where ae.prazo_entrega is null
           or ae.prazo_entrega <= v_today
      ), 0)::numeric as horas_atividades
    from public.atividades_extra_classe ae
    join assigned ass
      on ass.turma_id = ae.turma_id
     and ass.disciplina_id = ae.disciplina_id
    where ae.status = 'PUBLICADA'
    group by ae.turma_id, ae.disciplina_id
  ),
  canonical as (
    select
      ass.*,
      coalesce(ar.total_aulas, 0) as total_aulas,
      coalesce(ar.total_aulas_dadas, 0) as total_aulas_dadas,
      coalesce(ar.carga_horaria_dada, 0) as carga_horaria_dada,
      coalesce(ar.horas_aulas_programadas, 0)
        + coalesce(aer.horas_atividades, 0) as horas_lancadas,
      coalesce(aer.total_atividades, 0) as total_atividades,
      ar.primeira_aula,
      ar.ultima_aula,
      (
        ass.turma_status = 'EM_ANDAMENTO'
        and ass.periodo_status in ('ABERTO', 'EM_FECHAMENTO')
        and ass.bloqueio_diario = 'ABERTO'
      ) as can_edit
    from assigned ass
    left join aulas_resumo ar
      on ar.turma_id = ass.turma_id
     and ar.disciplina_id = ass.disciplina_id
    left join atividades_resumo aer
      on aer.turma_id = ass.turma_id
     and aer.disciplina_id = ass.disciplina_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.turma_id::text || '-' || c.disciplina_id::text,
        'turmaId', c.turma_id,
        'disciplinaId', c.disciplina_id,
        'turmaNome', coalesce(c.turma_nome, 'Turma sem nome'),
        'turmaCodigo', coalesce(c.turma_codigo, ''),
        'cursoNome', coalesce(c.curso_nome, 'Curso não informado'),
        'cursoId', c.curso_id,
        'modalidade', c.modalidade,
        'turno', coalesce(c.turno, 'Geral'),
        'status', c.turma_status,
        'disciplinaNome', coalesce(c.disciplina_nome, 'Disciplina'),
        'cargaHoraria', c.carga_horaria,
        'cargaHorariaEstagio', c.carga_horaria_estagio,
        'totalAulas', c.total_aulas,
        'totalAulasDadas', c.total_aulas_dadas,
        'totalAtividades', c.total_atividades,
        'cargaHorariaDada', c.carga_horaria_dada,
        'cargaDadaPercent', case
          when c.carga_horaria > 0 then least(
            100,
            round((c.carga_horaria_dada / c.carga_horaria) * 100, 1)
          )
          else 0
        end,
        'horasLancadas', c.horas_lancadas,
        'progressoPercent', case
          when c.carga_horaria > 0 then least(
            100,
            round((c.horas_lancadas / c.carga_horaria) * 100, 1)
          )
          else 0
        end,
        'primeiraAula', c.primeira_aula,
        'ultimaAula', c.ultima_aula,
        'isEstagio', c.carga_horaria_estagio > 0,
        'canEdit', c.can_edit,
        'accessLabel', case
          when c.can_edit then 'Lançamentos liberados'
          when c.bloqueio_diario = 'PROFESSOR' then 'Em revisão'
          when c.bloqueio_diario = 'TOTAL' then 'Diário fechado'
          when c.turma_status = 'FINALIZADA' then 'Turma encerrada'
          when c.turma_status <> 'EM_ANDAMENTO' then 'Aguardando início'
          when c.periodo_status = 'PLANEJADO' then 'Período planejado'
          when c.periodo_status = 'FECHADO' then 'Período fechado'
          else 'Lançamentos bloqueados'
        end,
        'accessMessage', case
          when c.can_edit then ''
          when c.bloqueio_diario = 'PROFESSOR' then
            'Este diário foi enviado para revisão e está disponível apenas para consulta.'
          when c.bloqueio_diario = 'TOTAL' then
            'Este diário foi fechado pela Gestão e está disponível apenas para consulta.'
          when c.turma_status = 'FINALIZADA' then
            'Esta turma foi encerrada. Os registros acadêmicos estão disponíveis apenas para consulta.'
          when c.turma_status <> 'EM_ANDAMENTO' then
            'A turma ainda não está em andamento. Os lançamentos serão liberados pela coordenação quando o ciclo acadêmico começar.'
          when c.periodo_status = 'PLANEJADO' then
            'Este período ainda não começou. O diário está disponível apenas para consulta até a coordenação abrir o período.'
          when c.periodo_status = 'FECHADO' then
            'Este período foi fechado. Os lançamentos ficam bloqueados até a coordenação reabri-lo com justificativa.'
          else
            'Não foi possível confirmar uma etapa acadêmica aberta. Os registros ficaram bloqueados por segurança.'
        end,
        'raw', jsonb_build_object(
          'modulo_nome', c.modulo_nome,
          'periodo_letivo_id', c.periodo_letivo_id,
          'periodo_status', c.periodo_status,
          'bloqueio_diario', c.bloqueio_diario
        ),
        'turmaForDiario', jsonb_build_object(
          'id', c.turma_id,
          'codigo', coalesce(c.turma_codigo, ''),
          'nome', coalesce(c.turma_nome, 'Turma sem nome'),
          'cursoId', c.curso_id,
          'cursoNome', coalesce(c.curso_nome, 'Curso não informado'),
          'modalidade', c.modalidade,
          'poloId', c.polo_id,
          'poloNome', coalesce(c.polo_nome, ''),
          'dataInicio', c.data_inicio,
          'dataPrevisaoTermino', c.data_previsao_termino,
          'turno', coalesce(c.turno, 'Geral'),
          'status', c.turma_status,
          'alunosMatriculados', 0,
          'vagasTotais', coalesce(c.vagas_totais, 0),
          'valorMatricula', coalesce(c.valor_matricula, 0),
          'valorRematricula', coalesce(c.valor_rematricula, 0),
          'qtdParcelas', coalesce(c.qtd_parcelas, 0),
          'valorParcela', coalesce(c.valor_parcela, 0),
          'descontoPontualidade', coalesce(c.desconto_pontualidade, 0),
          'jurosAtraso', coalesce(c.juros_atraso, 0),
          'multaAtraso', coalesce(c.multa_atraso, 0)
        ),
        'disciplinaForDiario', jsonb_build_object(
          'id', c.disciplina_id,
          'nome', coalesce(c.disciplina_nome, 'Disciplina'),
          'professor', coalesce(c.professor_nome, 'Professor'),
          'horasRealizadas', c.horas_lancadas,
          'cargaHoraria', c.carga_horaria,
          'progressoPercent', case
            when c.carga_horaria > 0 then least(
              100,
              round((c.horas_lancadas / c.carga_horaria) * 100, 1)
            )
            else 0
          end,
          'periodoStatus', c.periodo_status,
          'concluida', coalesce(c.concluida, false),
          'cargaHorariaEstagio', c.carga_horaria_estagio
        )
      )
      order by c.disciplina_nome, c.turma_nome
    ),
    '[]'::jsonb
  )
  into v_result
  from canonical c;

  return v_result;
end;
$function$;

revoke all on function public.get_professor_disciplinas_portal(uuid) from public, anon;
grant execute on function public.get_professor_disciplinas_portal(uuid)
to authenticated, service_role;
