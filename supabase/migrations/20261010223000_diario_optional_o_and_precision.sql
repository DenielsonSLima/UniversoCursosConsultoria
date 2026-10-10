begin;

-- O is optional per student. Missing required active instruments stay pending.
-- Preserve NULL notes; sum only active values that were actually entered.
create or replace function internal_academic.calculate_diario_partial(
  p_config jsonb,
  p_nota_p numeric,
  p_nota_ti numeric,
  p_nota_tg numeric,
  p_nota_s numeric,
  p_nota_cq numeric,
  p_nota_o numeric
)
returns numeric
language sql
immutable
set search_path to ''
as $function$
  with instrumentos(chave, ativo, nota) as (
    values
      ('p', coalesce((p_config ->> 'p')::boolean, true), p_nota_p),
      ('ti', coalesce((p_config ->> 'ti')::boolean, true), p_nota_ti),
      ('tg', coalesce((p_config ->> 'tg')::boolean, true), p_nota_tg),
      ('s', coalesce((p_config ->> 's')::boolean, true), p_nota_s),
      ('cq', coalesce((p_config ->> 'cq')::boolean, true), p_nota_cq),
      ('o', coalesce((p_config ->> 'o')::boolean, true), p_nota_o)
  )
  select case
    when exists (
      select 1 from instrumentos where ativo and chave <> 'o' and nota is null
    ) or not exists (
      select 1 from instrumentos where ativo and nota is not null
    ) then null::numeric
    else least(10.00, round((
      select sum(nota) from instrumentos where ativo and nota is not null
    ), 2))
  end;
$function$;
-- CREATE OR REPLACE preserves the existing owner and function ACL.

-- Period closing uses the same completeness decision, retaining credits and all other guards.
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
    select m.id as matricula_id, m.aluno_id
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
      select 1 from public.matricula_aproveitamentos credit
      where credit.matricula_id = aa.matricula_id
        and credit.disciplina_id = dp.disciplina_id
    )
      and not exists (
      select 1
      from public.diario_notas dn
      where dn.turma_id = dp.turma_id
        and dn.aluno_id = aa.aluno_id
        and dn.disciplina_id = dp.disciplina_id
        and internal_academic.calculate_diario_partial(
          dp.instrumentos_avaliativos, dn.nota_p, dn.nota_ti, dn.nota_tg,
          dn.nota_s, dn.nota_cq, dn.nota_o
        ) is not null
    )
  ),
  frequencia_pendente as (
    select aa.aluno_id, ap.disciplina_id, ap.aula_id
    from alunos_ativos aa
    cross join aulas_periodo ap
    where not exists (
      select 1 from public.matricula_aproveitamentos credit
      where credit.matricula_id = aa.matricula_id
        and credit.disciplina_id = ap.disciplina_id
    )
      and not exists (
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
        select 1 from public.matricula_aproveitamentos credit
        where credit.matricula_id = aa.matricula_id
          and credit.disciplina_id = dp.disciplina_id
      )
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
      and not exists (
        select 1 from public.matricula_aproveitamentos credit
        where credit.matricula_id = aa.matricula_id
          and credit.disciplina_id = dp.disciplina_id
      )
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

-- Keep the invoker view, documentary overlay and recovery precision consistent.
create or replace view public.v_diario_notas_resultados
with (security_invoker = true) as
with aulas as (
  select a.turma_id, a.disciplina_id,
    count(distinct a.data_aula) as total_aulas,
    sum(case when a.carga_horaria > 0 then a.carga_horaria else 1 end) as total_horas
  from public.aulas_turma a group by a.turma_id, a.disciplina_id
), frequencias as (
  select f.turma_id, f.disciplina_id, f.aluno_id, count(*) as lancamentos,
    count(*) filter (where f.status = 'F') as total_faltas,
    sum(case when f.status = 'F'
      then case when a.carga_horaria > 0 then a.carga_horaria else 1 end
      else 0 end) as horas_falta
  from public.diario_frequencia f join public.aulas_turma a on a.id = f.aula_id
  group by f.turma_id, f.disciplina_id, f.aluno_id
), base as (
  select n.turma_id, n.disciplina_id, n.aluno_id,
    n.nota_p, n.nota_ti, n.nota_tg, n.nota_s, n.nota_cq, n.nota_o, n.nota_rec,
    coalesce(a.total_aulas, 0::bigint) as total_aulas,
    coalesce(f.total_faltas, 0::bigint) as total_faltas,
    case when coalesce(a.total_horas, 0) > 0
      and coalesce(f.lancamentos, 0) = (
        select count(*) from public.aulas_turma sessoes
        where sessoes.turma_id = n.turma_id and sessoes.disciplina_id = n.disciplina_id
      ) then round((a.total_horas - coalesce(f.horas_falta, 0)) / a.total_horas * 100, 2)
      else null::numeric end as frequencia_percent,
    internal_academic.calculate_diario_partial(
      td.instrumentos_avaliativos, n.nota_p, n.nota_ti, n.nota_tg,
      n.nota_s, n.nota_cq, n.nota_o
    ) as media_parcial
  from public.diario_notas n
  left join aulas a on a.turma_id = n.turma_id and a.disciplina_id = n.disciplina_id
  left join frequencias f on f.turma_id = n.turma_id
    and f.disciplina_id = n.disciplina_id and f.aluno_id = n.aluno_id
  left join public.turmas_disciplinas td on td.turma_id = n.turma_id
    and td.disciplina_id = n.disciplina_id
), finais as (
  select b.*,
    case when b.media_parcial is null then null::numeric
      when b.nota_rec is not null and b.nota_rec > b.media_parcial
        then least(10.00, round(b.nota_rec::numeric, 2))
      else b.media_parcial end as media_final
  from base b
), regular as (
  select f.turma_id, f.disciplina_id, f.aluno_id,
    f.nota_p, f.nota_ti, f.nota_tg, f.nota_s, f.nota_cq, f.nota_o, f.nota_rec,
    f.total_aulas, f.total_faltas, f.frequencia_percent, f.media_parcial, f.media_final,
    case when f.media_parcial is null then 'SEM_LANCAMENTO'
      when f.frequencia_percent is null then 'FREQUENCIA_PENDENTE'
      when f.media_final >= 6.0 and f.frequencia_percent >= 75 then 'APROVADO'
      when f.frequencia_percent < 75 then 'REPROVADO_POR_FALTA'
      when f.nota_rec is null and f.media_parcial < 6.0 then 'EM_RECUPERACAO'
      else 'REPROVADO' end as resultado_final
  from finais f
), historico as materialized (
  select resultado.* from internal_academic.get_diario_historical_snapshot_rows() resultado
), combinado as (
  select r.* from regular r where not exists (
    select 1 from historico h where h.turma_id = r.turma_id
      and h.disciplina_id = r.disciplina_id and h.aluno_id = r.aluno_id
  )
  union all
  select h.* from historico h
)
select c.turma_id, c.disciplina_id, c.aluno_id,
  c.nota_p::numeric(4,2), c.nota_ti::numeric(4,2), c.nota_tg::numeric(4,2),
  c.nota_s::numeric(4,2), c.nota_cq::numeric(4,2), c.nota_o::numeric(4,2),
  c.nota_rec::numeric(4,2), c.total_aulas, c.total_faltas,
  c.frequencia_percent, c.media_parcial, c.media_final, c.resultado_final
from combinado c;

commit;
