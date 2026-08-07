create or replace function internal_academic.p1_get_pendencias_fechamento_periodo_20260719(
  p_periodo_letivo_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  with periodo as (
    select p.*, t.frequencia_minima_percent, t.media_minima
    from public.periodos_letivos p
    join public.turmas t on t.id = p.turma_id
    where p.id = p_periodo_letivo_id
      and (
        coalesce((select auth.role()), '') = 'service_role'
        or public.can_write_turma(p.turma_id)
      )
  ),
  disciplinas_periodo as (
    select
      td.turma_id,
      td.disciplina_id,
      td.instrumentos_avaliativos,
      coalesce(td.concluida, false) as concluida,
      coalesce(d.carga_horaria_estagio, 0) as carga_horaria_estagio
    from public.turmas_disciplinas td
    join public.disciplinas d on d.id = td.disciplina_id
    join periodo p on p.id = td.periodo_letivo_id
  ),
  alunos_ativos as (
    select m.aluno_id
    from public.matriculas m
    join periodo p on p.turma_id = m.turma_id
    where m.status = 'ATIVO'
  ),
  aulas_periodo as (
    select a.id as aula_id, a.turma_id, a.disciplina_id
    from public.aulas_turma a
    join disciplinas_periodo dp
      on dp.turma_id = a.turma_id
     and dp.disciplina_id = a.disciplina_id
  ),
  sem_aula as (
    select dp.disciplina_id
    from disciplinas_periodo dp
    where not exists (
      select 1
      from aulas_periodo ap
      where ap.turma_id = dp.turma_id
        and ap.disciplina_id = dp.disciplina_id
    )
  ),
  sem_nota as (
    select aa.aluno_id, dp.disciplina_id
    from alunos_ativos aa
    cross join disciplinas_periodo dp
    where not exists (
      select 1
      from public.diario_notas dn
      where dn.turma_id = dp.turma_id
        and dn.aluno_id = aa.aluno_id
        and dn.disciplina_id = dp.disciplina_id
        and (
          not coalesce(
            (dp.instrumentos_avaliativos ->> 'p')::boolean,
            true
          )
          or dn.nota_p is not null
        )
        and (
          not coalesce(
            (dp.instrumentos_avaliativos ->> 'ti')::boolean,
            true
          )
          or dn.nota_ti is not null
        )
        and (
          not coalesce(
            (dp.instrumentos_avaliativos ->> 'tg')::boolean,
            true
          )
          or dn.nota_tg is not null
        )
        and (
          not coalesce(
            (dp.instrumentos_avaliativos ->> 's')::boolean,
            true
          )
          or dn.nota_s is not null
        )
        and (
          not coalesce(
            (dp.instrumentos_avaliativos ->> 'cq')::boolean,
            true
          )
          or dn.nota_cq is not null
        )
        and (
          not coalesce(
            (dp.instrumentos_avaliativos ->> 'o')::boolean,
            true
          )
          or dn.nota_o is not null
        )
    )
  ),
  frequencia_pendente as (
    select aa.aluno_id, ap.disciplina_id, ap.aula_id
    from alunos_ativos aa
    cross join aulas_periodo ap
    where not exists (
      select 1
      from public.diario_frequencia df
      where df.turma_id = ap.turma_id
        and df.disciplina_id = ap.disciplina_id
        and df.aula_id = ap.aula_id
        and df.aluno_id = aa.aluno_id
        and df.status in ('P', 'F')
    )
  ),
  recuperacao_pendente as (
    select r.aluno_id, r.disciplina_id
    from disciplinas_periodo dp
    cross join lateral public.get_diario_resultados(
      dp.turma_id,
      dp.disciplina_id
    ) r
    join alunos_ativos aa on aa.aluno_id = r.aluno_id
    where r.resultado_final = 'EM_RECUPERACAO'
  ),
  estagio_pendente as (
    select aa.aluno_id, dp.disciplina_id
    from alunos_ativos aa
    cross join disciplinas_periodo dp
    where dp.carga_horaria_estagio > 0
      and not exists (
        select 1
        from public.matriculas_estagios me
        where me.turma_id = dp.turma_id
          and me.disciplina_id = dp.disciplina_id
          and me.aluno_id = aa.aluno_id
          and me.nota_final is not null
          and me.frequencia_estagio is not null
      )
  ),
  estagio_reprovado as (
    select me.aluno_id, me.disciplina_id
    from disciplinas_periodo dp
    join public.matriculas_estagios me
      on me.turma_id = dp.turma_id
     and me.disciplina_id = dp.disciplina_id
    join alunos_ativos aa on aa.aluno_id = me.aluno_id
    cross join periodo p
    where dp.carga_horaria_estagio > 0
      and (
        me.nota_final < p.media_minima
        or me.frequencia_estagio < p.frequencia_minima_percent
      )
  )
  select jsonb_build_object(
    'disciplinasNaoConcluidas',
      (select count(*) from disciplinas_periodo where concluida = false),
    'disciplinasSemAula', (select count(*) from sem_aula),
    'lancamentosDeNotaPendentes', (select count(*) from sem_nota),
    'frequenciasPendentes', (select count(*) from frequencia_pendente),
    'recuperacoesPendentes', (select count(*) from recuperacao_pendente),
    'avaliacoesEstagioPendentes', (select count(*) from estagio_pendente),
    'estagiosReprovados', (select count(*) from estagio_reprovado),
    'podeFechar',
      (select count(*) from disciplinas_periodo) > 0
      and (select count(*) from disciplinas_periodo where concluida = false) = 0
      and (select count(*) from sem_aula) = 0
      and (select count(*) from sem_nota) = 0
      and (select count(*) from frequencia_pendente) = 0
      and (select count(*) from recuperacao_pendente) = 0
      and (select count(*) from estagio_pendente) = 0
  );
$function$;
