alter table public.modulos
  add column if not exists ordem integer;

alter table public.disciplinas
  add column if not exists ordem integer;

with ranked_modules as (
  select
    id,
    row_number() over (
      partition by curso_id
      order by created_at, ctid
    )::integer as ordem
  from public.modulos
)
update public.modulos as target
set ordem = ranked.ordem
from ranked_modules as ranked
where target.id = ranked.id
  and target.ordem is null;

with ranked_disciplines as (
  select
    id,
    row_number() over (
      partition by modulo_id
      order by created_at, ctid
    )::integer as ordem
  from public.disciplinas
)
update public.disciplinas as target
set ordem = ranked.ordem
from ranked_disciplines as ranked
where target.id = ranked.id
  and target.ordem is null;

create index if not exists modulos_curso_ordem_idx
  on public.modulos (curso_id, ordem);

create index if not exists disciplinas_modulo_ordem_idx
  on public.disciplinas (modulo_id, ordem);

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
      (count(*) filter (where coalesce(td.concluida, false)) over (partition by mo.id))::numeric
      / nullif(count(*) over (partition by mo.id), 0) * 100
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
