begin;

-- Preserve classroom calls, grades, authorization and credit overrides.
create or replace function internal_academic.p1_get_diario_resultados_20260719(
  p_turma_id uuid,
  p_disciplina_id uuid
)
returns table(
  turma_id uuid,
  disciplina_id uuid,
  aluno_id uuid,
  nota_p numeric,
  nota_ti numeric,
  nota_tg numeric,
  nota_s numeric,
  nota_cq numeric,
  nota_o numeric,
  nota_rec numeric,
  total_aulas bigint,
  total_faltas bigint,
  frequencia_percent numeric,
  media_parcial numeric,
  media_final numeric,
  resultado_final text
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_aluno_id uuid := public.current_aluno_id();
  v_full_access boolean := false;
  v_student_access boolean := false;
begin
  select
    coalesce((select auth.role()), '') = 'service_role'
    or public.is_gestor_for_polo(t.polo_id)
    or public.is_professor_assigned_disciplina(p_turma_id, p_disciplina_id)
  into v_full_access
  from public.turmas t
  where t.id = p_turma_id;

  v_full_access := coalesce(v_full_access, false);

  if not v_full_access and v_aluno_id is not null then
    select exists (
      select 1
      from public.matriculas m
      join public.turmas t on t.id = m.turma_id
      join public.cursos c on c.id = t.curso_id
      where m.turma_id = p_turma_id
        and m.aluno_id = v_aluno_id
        and upper(coalesce(c.modalidade, '')) in ('TECNICO', 'TÉCNICO')
        and (
          (
            upper(coalesce(t.status, '')) = 'EM_ANDAMENTO'
            and upper(coalesce(m.status, '')) = 'ATIVO'
          )
          or (
            upper(coalesce(t.status, '')) = 'FINALIZADA'
            and upper(coalesce(m.status, '')) in ('CONCLUIDO', 'REPROVADO')
          )
        )
    ) into v_student_access;
  end if;

  if not v_full_access and not v_student_access then
    raise exception 'Acesso acadêmico não autorizado.' using errcode = '42501';
  end if;

  return query
  with credito_extra as materialized (
    select internal_academic.diario_extra_classe_credito(p_turma_id, p_disciplina_id) as dados
  ), regras as (
    select t.frequencia_minima_percent, t.media_minima
    from public.turmas t
    where t.id = p_turma_id
  ),
  configuracao as (
    select (
      select td.instrumentos_avaliativos
      from public.turmas_disciplinas td
      where td.turma_id = p_turma_id
        and td.disciplina_id = p_disciplina_id
      limit 1
    ) as instrumentos_avaliativos
  ),
  alunos as (
    select elegivel.matricula_id, elegivel.aluno_id, elegivel.data_saida
    from internal_academic.p2_diario_matriculas_elegiveis_20260725(
      p_turma_id,
      p_disciplina_id
    ) elegivel
    where v_full_access or elegivel.aluno_id = v_aluno_id
  ),
  base as (
    select
      aluno.matricula_id,
      aluno.aluno_id,
      n.nota_p,
      n.nota_ti,
      n.nota_tg,
      n.nota_s,
      n.nota_cq,
      n.nota_o,
      n.nota_rec,
      aulas.total as aulas,
      coalesce(frequencias.faltas, 0) as faltas,
      case
        when ap.id is not null then ap.frequencia_percent
        when coalesce(aulas.horas, 0) + extras.horas > 0
          and coalesce(frequencias.lancamentos, 0) = aulas.total
          then round(
            (
              (
                coalesce(aulas.horas, 0) + extras.horas
                - coalesce(frequencias.horas_falta, 0)
              ) / (coalesce(aulas.horas, 0) + extras.horas)
            ) * 100,
            2
          )
        else null
      end as frequencia,
      case
        when ap.id is not null then ap.media_final
        else internal_academic.calculate_diario_partial(
          cfg.instrumentos_avaliativos,
          n.nota_p,
          n.nota_ti,
          n.nota_tg,
          n.nota_s,
          n.nota_cq,
          n.nota_o
        )
      end as parcial,
      ap.id as aproveitamento_id,
      r.frequencia_minima_percent,
      r.media_minima
    from alunos aluno
    cross join credito_extra credito
    cross join lateral (select internal_academic.diario_extra_classe_horas(
      credito.dados, aluno.aluno_id) as horas) extras
    cross join regras r
    cross join configuracao cfg
    left join lateral (
      select
        count(*) as total,
        sum(
          case when a.carga_horaria > 0 then a.carga_horaria else 1 end
        ) as horas
      from public.aulas_turma a
      where a.turma_id = p_turma_id
        and a.disciplina_id = p_disciplina_id
        and (
          aluno.data_saida is null
          or (
            a.data_aula is not null
            and a.data_aula <= aluno.data_saida
          )
          or exists (
            select 1
            from public.diario_frequencia registro
            where registro.aula_id = a.id
              and registro.aluno_id = aluno.aluno_id
          )
        )
    ) aulas on true
    left join lateral (
      select
        count(*) filter (where f.status = 'F') as faltas,
        count(*) as lancamentos,
        sum(
          case when f.status = 'F'
            then case when a.carga_horaria > 0 then a.carga_horaria else 1 end
            else 0
          end
        ) as horas_falta
      from public.diario_frequencia f
      join public.aulas_turma a on a.id = f.aula_id
      where f.turma_id = p_turma_id
        and f.disciplina_id = p_disciplina_id
        and f.aluno_id = aluno.aluno_id
    ) frequencias on true
    left join public.diario_notas n
      on n.turma_id = p_turma_id
     and n.disciplina_id = p_disciplina_id
     and n.aluno_id = aluno.aluno_id
    left join public.matricula_aproveitamentos ap
      on ap.matricula_id = aluno.matricula_id
     and ap.disciplina_id = p_disciplina_id
  ),
  finais as (
    select
      b.*,
      case
        when b.parcial is null then null
        when b.nota_rec is not null and b.nota_rec > b.parcial then b.nota_rec
        else b.parcial
      end as final
    from base b
  )
  select
    p_turma_id,
    p_disciplina_id,
    f.aluno_id,
    f.nota_p,
    f.nota_ti,
    f.nota_tg,
    f.nota_s,
    f.nota_cq,
    f.nota_o,
    f.nota_rec,
    f.aulas,
    f.faltas,
    f.frequencia,
    f.parcial,
    f.final,
    case
      when f.aproveitamento_id is not null then 'APROVEITADO'
      when f.parcial is null then 'SEM_LANCAMENTO'
      when f.frequencia is null then 'FREQUENCIA_PENDENTE'
      when f.frequencia < f.frequencia_minima_percent then 'REPROVADO_FREQUENCIA'
      when f.final >= f.media_minima then 'APROVADO'
      when f.nota_rec is null then 'EM_RECUPERACAO'
      else 'REPROVADO'
    end
  from finais f;
end;
$function$;

commit;
