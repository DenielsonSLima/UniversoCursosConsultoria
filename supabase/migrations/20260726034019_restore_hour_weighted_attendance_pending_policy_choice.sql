-- Restaura a política vigente de frequência ponderada pela carga horária
-- enquanto a gestão acadêmica valida a possível mudança para peso por encontro.

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
  with regras as (
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
        when aulas.horas > 0
          and coalesce(frequencias.lancamentos, 0) = aulas.total
          then round(
            (
              (
                aulas.horas
                - coalesce(frequencias.horas_falta, 0)
              ) / aulas.horas
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
create or replace function internal_academic.get_enrollment_results(
  p_matricula_id uuid
)
returns table(
  disciplina_id uuid,
  media_final numeric,
  frequencia_percent numeric,
  resultado_final text
)
language sql
stable
security definer
set search_path to ''
as $function$
  with matricula as (
    select
      m.id,
      m.aluno_id,
      m.turma_id,
      t.frequencia_minima_percent,
      t.media_minima
    from public.matriculas m
    join public.turmas t on t.id = m.turma_id
    where m.id = p_matricula_id
  ),
  disciplinas as (
    select td.disciplina_id, td.instrumentos_avaliativos
    from public.turmas_disciplinas td
    join matricula m on m.turma_id = td.turma_id
  ),
  aulas as (
    select
      a.disciplina_id,
      count(*) as total_aulas,
      sum(
        case when a.carga_horaria > 0 then a.carga_horaria else 1 end
      ) as total_horas
    from public.aulas_turma a
    join matricula m on m.turma_id = a.turma_id
    group by a.disciplina_id
  ),
  frequencias as (
    select
      f.disciplina_id,
      count(*) as lancamentos,
      sum(case when f.status = 'F' then 1 else 0 end) as faltas,
      sum(
        case when f.status = 'F'
          then case when a.carga_horaria > 0 then a.carga_horaria else 1 end
          else 0
        end
      ) as horas_falta
    from public.diario_frequencia f
    join public.aulas_turma a on a.id = f.aula_id
    join matricula m
      on m.turma_id = f.turma_id
     and m.aluno_id = f.aluno_id
    group by f.disciplina_id
  ),
  base as (
    select
      d.disciplina_id,
      ap.id as aproveitamento_id,
      ap.media_final as media_aproveitada,
      ap.frequencia_percent as frequencia_aproveitada,
      n.nota_rec,
      internal_academic.calculate_diario_partial(
        d.instrumentos_avaliativos,
        n.nota_p,
        n.nota_ti,
        n.nota_tg,
        n.nota_s,
        n.nota_cq,
        n.nota_o
      ) as media_parcial,
      case
        when ap.id is not null then ap.frequencia_percent
        when a.total_horas > 0
          and coalesce(f.lancamentos, 0) = a.total_aulas
          then round(
            (
              (a.total_horas - coalesce(f.horas_falta, 0))
              / a.total_horas
            ) * 100,
            2
          )
        else null
      end as frequencia,
      m.frequencia_minima_percent,
      m.media_minima
    from disciplinas d
    cross join matricula m
    left join aulas a on a.disciplina_id = d.disciplina_id
    left join frequencias f on f.disciplina_id = d.disciplina_id
    left join public.diario_notas n
      on n.turma_id = m.turma_id
     and n.disciplina_id = d.disciplina_id
     and n.aluno_id = m.aluno_id
    left join public.matricula_aproveitamentos ap
      on ap.matricula_id = m.id
     and ap.disciplina_id = d.disciplina_id
  ),
  finais as (
    select
      b.*,
      case
        when b.aproveitamento_id is not null then b.media_aproveitada
        when b.media_parcial is null then null
        when b.nota_rec is not null and b.nota_rec > b.media_parcial
          then b.nota_rec
        else b.media_parcial
      end as final
    from base b
  )
  select
    f.disciplina_id,
    f.final,
    coalesce(f.frequencia_aproveitada, f.frequencia),
    case
      when f.aproveitamento_id is not null then 'APROVEITADO'
      when f.media_parcial is null then 'SEM_LANCAMENTO'
      when f.frequencia is null then 'FREQUENCIA_PENDENTE'
      when f.frequencia < f.frequencia_minima_percent then 'REPROVADO_FREQUENCIA'
      when f.final >= f.media_minima then 'APROVADO'
      when f.nota_rec is null then 'EM_RECUPERACAO'
      else 'REPROVADO'
    end
  from finais f;
$function$;
create or replace function internal_academic.p1_get_turma_alunos_academico_20260719(
  p_turma_id uuid
)
returns table(
  matricula_id uuid,
  aluno_id uuid,
  nome text,
  cpf text,
  data_nascimento date,
  data_matricula timestamp with time zone,
  status text,
  frequencia_percent numeric,
  tem_lancamentos_academicos boolean,
  pode_remover boolean
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not exists (
    select 1
    from public.turmas t
    where t.id = p_turma_id
      and (
        coalesce((select auth.role()), '') = 'service_role'
        or (
          t.polo_id is not null
          and (select public.is_gestor_for_polo(t.polo_id))
        )
      )
  ) then
    raise exception 'Acesso ao cadastro acadêmico não autorizado.'
      using errcode = '42501';
  end if;

  return query
  select
    m.id,
    p.id,
    p.nome,
    p.cpf_cnpj,
    p.data_nascimento,
    m.data_matricula,
    m.status,
    frequency.frequencia_percent,
    public.matricula_possui_lancamentos_academicos(m.id),
    (
      (t.data_inicio is null or t.data_inicio > current_date)
      and not public.matricula_possui_lancamentos_academicos(m.id)
    )
  from public.matriculas m
  join public.turmas t on t.id = m.turma_id
  join public.parceiros p on p.id = m.aluno_id
  left join lateral (
    select round(
      (
        sum(
          case when f.status = 'P'
            then case when a.carga_horaria > 0 then a.carga_horaria else 1 end
            else 0
          end
        )
        / nullif(
          sum(case when a.carga_horaria > 0 then a.carga_horaria else 1 end),
          0
        )
      ) * 100,
      1
    ) as frequencia_percent
    from public.diario_frequencia f
    join public.aulas_turma a
      on a.id = f.aula_id
     and a.turma_id = f.turma_id
     and a.disciplina_id = f.disciplina_id
    where f.turma_id = m.turma_id
      and f.aluno_id = m.aluno_id
      and f.status in ('P', 'F')
  ) frequency on true
  where m.turma_id = p_turma_id
  order by p.nome;
end;
$function$;
create or replace function public.get_diarios_turma(p_turma_id uuid)
returns table (
  modulo_id uuid,
  modulo_nome text,
  periodo_letivo_id uuid,
  periodo_status text,
  disciplina_id uuid,
  disciplina_nome text,
  professor_nome text,
  carga_horaria numeric,
  horas_realizadas numeric,
  aulas_count bigint,
  progresso_percent numeric,
  horas_status text,
  horas_diferenca numeric,
  concluida boolean,
  modulo_total_disciplinas bigint,
  modulo_progresso_percent numeric,
  primeira_aula date,
  ultima_aula date,
  presenca_geral_percent numeric
)
language sql
stable
security definer
set search_path to ''
as $function$
  with allowed_turma as (
    select t.id
    from public.turmas t
    where t.id = p_turma_id
      and (select public.can_access_atividade_extra_turma(t.id))
  ), aulas_resumo as (
    select
      disciplina_id,
      sum(carga_horaria) as realizadas,
      count(*) as quantidade,
      min(data_aula) as primeira_aula,
      max(data_aula) as ultima_aula
    from public.aulas_turma
    where turma_id = p_turma_id
      and exists (select 1 from allowed_turma)
    group by disciplina_id
  ), horas_atividades as (
    select disciplina_id, sum(carga_horaria_compensacao) as realizadas
    from public.atividades_extra_classe
    where turma_id = p_turma_id
      and exists (select 1 from allowed_turma)
      and status = 'PUBLICADA'
      and (
        prazo_entrega is null
        or prazo_entrega <= (pg_catalog.timezone('America/Maceio', now()))::date
      )
    group by disciplina_id
  ), horas as (
    select
      coalesce(ar.disciplina_id, he.disciplina_id) as disciplina_id,
      coalesce(ar.realizadas, 0) + coalesce(he.realizadas, 0) as realizadas,
      coalesce(ar.quantidade, 0) as quantidade_aulas,
      ar.primeira_aula,
      ar.ultima_aula
    from aulas_resumo ar
    full join horas_atividades he using (disciplina_id)
  ), presenca as (
    select
      f.disciplina_id,
      round(
        sum(
          case when f.status = 'P'
            then case when a.carga_horaria > 0 then a.carga_horaria else 1 end
            else 0
          end
        )::numeric
        / nullif(
          sum(
            case when f.status in ('P', 'F')
              then case when a.carga_horaria > 0 then a.carga_horaria else 1 end
              else 0
            end
          ),
          0
        ) * 100,
        1
      ) as presenca_geral_percent
    from public.diario_frequencia f
    join public.aulas_turma a
      on a.id = f.aula_id
     and a.turma_id = f.turma_id
     and a.disciplina_id = f.disciplina_id
    where f.turma_id = p_turma_id
      and f.status in ('P', 'F')
      and exists (select 1 from allowed_turma)
    group by f.disciplina_id
  )
  select
    mo.id,
    mo.nome,
    pl.id,
    coalesce(pl.status, 'ABERTO'),
    d.id,
    d.nome,
    coalesce(td.professor_nome, 'Não atribuído'),
    d.carga_horaria,
    coalesce(h.realizadas, 0),
    coalesce(h.quantidade_aulas, 0),
    case when d.carga_horaria > 0 then least(
      100,
      round((coalesce(h.realizadas, 0) / d.carga_horaria) * 100, 1)
    ) else 0 end,
    case when coalesce(h.realizadas, 0) = d.carga_horaria then 'EXATA'
      when coalesce(h.realizadas, 0) > d.carga_horaria then 'EXCESSO'
      else 'PENDENTE'
    end,
    abs(d.carga_horaria - coalesce(h.realizadas, 0)),
    coalesce(td.concluida, false),
    count(*) over (partition by mo.id),
    round(
      avg(
        case when d.carga_horaria > 0 then least(
          100,
          (coalesce(h.realizadas, 0) / d.carga_horaria) * 100
        ) else 0 end
      ) over (partition by mo.id)
    ),
    h.primeira_aula,
    h.ultima_aula,
    p.presenca_geral_percent
  from public.turmas t
  join allowed_turma allowed on allowed.id = t.id
  join public.modulos mo on mo.curso_id = t.curso_id
  join public.disciplinas d on d.modulo_id = mo.id
  left join public.turmas_disciplinas td
    on td.turma_id = t.id and td.disciplina_id = d.id
  left join public.periodos_letivos pl on pl.id = td.periodo_letivo_id
  left join horas h on h.disciplina_id = d.id
  left join presenca p on p.disciplina_id = d.id
  where t.id = p_turma_id
  order by
    mo.ordem nulls last,
    mo.created_at,
    d.ordem nulls last,
    d.created_at,
    d.nome;
$function$;

revoke all on function public.get_diarios_turma(uuid) from public;
revoke all on function public.get_diarios_turma(uuid) from anon;
grant execute on function public.get_diarios_turma(uuid) to authenticated;
grant execute on function public.get_diarios_turma(uuid) to service_role;

