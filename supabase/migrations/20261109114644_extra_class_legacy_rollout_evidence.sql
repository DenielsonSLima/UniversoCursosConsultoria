begin;

-- A legacy rollout timestamp is not an academic admission date. Recognize only
-- explicit rollout activation plus an individual dated roll-call in this offer.
-- No enrollment, movement, grade, attendance or signed snapshot is rewritten.
create or replace function internal_academic.diario_extra_classe_credito(
  p_turma_id uuid, p_disciplina_id uuid
)
returns jsonb language sql stable security definer set search_path = '' as $function$
  with atividades as materialized (
    select a.id, a.titulo, a.carga_horaria_compensacao as horas,
      coalesce(a.prazo_entrega,
        pg_catalog.timezone('America/Maceio', a.created_at)::date) as data_atividade
    from public.atividades_extra_classe a
    where a.turma_id = p_turma_id and a.disciplina_id = p_disciplina_id
      and a.status = 'PUBLICADA' and a.carga_horaria_compensacao > 0
      and (a.prazo_entrega is null or a.prazo_entrega <=
        pg_catalog.timezone('America/Maceio', now())::date)
      and coalesce(a.prazo_entrega,
        pg_catalog.timezone('America/Maceio', a.created_at)::date) <=
        pg_catalog.timezone('America/Maceio', now())::date
  ), alunos as materialized (
    select e.matricula_id, e.aluno_id
    from internal_academic.p2_diario_matriculas_elegiveis_20260725(
      p_turma_id, p_disciplina_id) e
    where internal_academic.is_student_in_diary_roster(
      p_turma_id, p_disciplina_id, e.matricula_id, e.aluno_id)
    union
    select h.matricula_id, h.aluno_id
    from internal_academic.diario_resultados_importados h
    join public.matriculas m on m.id = h.matricula_id
      and m.turma_id = h.turma_id and m.aluno_id = h.aluno_id
    where h.ativo and h.turma_id = p_turma_id and h.disciplina_id = p_disciplina_id
  ), elegibilidade as (
    select aluno.aluno_id, atividade.id, atividade.data_atividade,
      case when coalesce(ingresso.data_ingresso,
        pg_catalog.timezone('America/Maceio', m.data_matricula)::date) > atividade.data_atividade
        and not retroativo.comprovado
      then false when exists (
        select 1 from internal_academic.diario_resultados_importados h
        where h.ativo and h.matricula_id = aluno.matricula_id
          and h.turma_id = p_turma_id and h.disciplina_id = p_disciplina_id
      ) then false else
        coalesce(antes.status_novo, depois.status_anterior, m.status)
          in ('ATIVO', 'CONCLUIDO', 'REPROVADO', 'EM_DEPENDENCIA')
        or (coalesce(antes.status_novo, depois.status_anterior, m.status) = 'PENDENTE'
          and internal_academic.is_student_released_for_diary(p_turma_id, aluno.aluno_id)
          and (not retroativo.comprovado or exists (
            select 1 from public.matricula_liberacoes_diario liberacao
            where liberacao.matricula_id = m.id and liberacao.revogado_em is null
          )))
      end as elegivel
    from alunos aluno
    join public.matriculas m on m.id = aluno.matricula_id
    cross join atividades atividade
    left join lateral (
      select min(mov.data_movimentacao) as data_ingresso
      from public.matricula_movimentacoes mov
      where mov.matricula_id = m.id
        and mov.tipo in ('MATRICULA', 'TRANSFERENCIA_EXTERNA_RECEBIDA')
    ) ingresso on true
    left join lateral (
      select mov.id
      from public.matricula_movimentacoes mov
      where mov.matricula_id = m.id and m.turma_id = p_turma_id
        and mov.tipo = 'MATRICULA'
        and mov.metadados ->> 'origem' = 'IMPLANTACAO_LEGADA'
        and upper(mov.status_anterior) = 'PENDENTE'
        and upper(mov.status_novo) = 'ATIVO'
        and mov.data_movimentacao >= coalesce(ingresso.data_ingresso,
          pg_catalog.timezone('America/Maceio', m.data_matricula)::date)
      order by mov.data_movimentacao, mov.created_at, mov.id limit 1
    ) implantacao on true
    left join lateral (
      select min(a.data_aula) as primeira_chamada
      from public.diario_frequencia f
      join public.aulas_turma a on a.id = f.aula_id
        and a.turma_id = f.turma_id and a.disciplina_id = f.disciplina_id
      where f.turma_id = p_turma_id and f.disciplina_id = p_disciplina_id
        and f.aluno_id = aluno.aluno_id
    ) evidencia on implantacao.id is not null
    cross join lateral (
      select coalesce(
        implantacao.id is not null
        and atividade.data_atividade < coalesce(ingresso.data_ingresso,
          pg_catalog.timezone('America/Maceio', m.data_matricula)::date)
        and evidencia.primeira_chamada <= atividade.data_atividade
        and not exists (
          select 1 from public.matricula_movimentacoes entrada_real
          where entrada_real.matricula_id = m.id
            and entrada_real.tipo = 'TRANSFERENCIA_EXTERNA_RECEBIDA'
        ), false
      ) as comprovado
    ) retroativo
    left join lateral (
      select upper(mov.status_novo) as status_novo
      from public.matricula_movimentacoes mov
      where mov.matricula_id = m.id and mov.data_movimentacao <= atividade.data_atividade
        and nullif(btrim(mov.status_novo), '') is not null
      order by mov.data_movimentacao desc, mov.created_at desc, mov.id desc limit 1
    ) antes on true
    left join lateral (
      select upper(mov.status_anterior) as status_anterior
      from public.matricula_movimentacoes mov
      where mov.matricula_id = m.id and mov.data_movimentacao > atividade.data_atividade
        and nullif(btrim(mov.status_anterior), '') is not null
        -- Only this explicit PENDENTE -> ATIVO rollout transition is technical.
        -- Real pending/leave/exit/readmission events retain their temporal effect.
        and (not retroativo.comprovado or mov.id is distinct from implantacao.id)
      order by mov.data_movimentacao, mov.created_at, mov.id limit 1
    ) depois on true
  )
  select jsonb_build_object(
    'schemaVersion', 1,
    'activities', coalesce((select jsonb_agg(jsonb_build_object(
      'id', a.id, 'titulo', a.titulo, 'cargaHoraria', a.horas,
      'dataSource', a.data_atividade) order by a.data_atividade, a.id)
      from atividades a), '[]'::jsonb),
    'eligibleActivityIdsByStudent', coalesce((select jsonb_object_agg(
      a.aluno_id::text, coalesce((select jsonb_agg(e.id order by e.data_atividade, e.id)
        from elegibilidade e where e.aluno_id = a.aluno_id and e.elegivel), '[]'::jsonb))
      from alunos a), '{}'::jsonb)
  );
$function$;

-- CREATE OR REPLACE preserves the existing private helper's OID, owner and ACL.
commit;

