begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Corrige a data informada provisoriamente na criação da turma, preservando
-- os IDs, vínculos e estados dos quatro períodos já materializados.
do $$
declare
  v_turma_id constant uuid := 'a4b64394-bc0d-4518-bba5-af00465ae43d';
  v_activity_count bigint;
begin
  perform 1
  from public.turmas turma
  where turma.id = v_turma_id
    and turma.status = 'EM_ANDAMENTO'
    and turma.data_inicio = date '2026-01-01'
    and turma.data_previsao_termino = date '2028-01-01'
  for update;

  if not found then
    raise exception
      'A turma de Radiologia Japoatã mudou; correção de datas cancelada.';
  end if;

  if (select count(*) from public.periodos_letivos periodo
      where periodo.turma_id = v_turma_id) <> 4
    or (select count(*) from public.periodos_letivos periodo
        where periodo.turma_id = v_turma_id
          and periodo.status = 'ABERTO') <> 1 then
    raise exception
      'A estrutura dos períodos mudou; correção de datas cancelada.';
  end if;

  select
      (select count(*) from public.aulas_turma aula
       where aula.turma_id = v_turma_id)
    + (select count(*) from public.diario_frequencia frequencia
       where frequencia.turma_id = v_turma_id)
    + (select count(*) from public.diario_notas nota
       where nota.turma_id = v_turma_id)
    + (select count(*) from public.diario_praticas pratica
       where pratica.turma_id = v_turma_id)
    + (select count(*) from public.diario_observacoes observacao
       where observacao.turma_id = v_turma_id)
    + (select count(*) from public.diario_fechamento_historico fechamento
       where fechamento.turma_id = v_turma_id)
    + (select count(*) from public.diarios_validacao validacao
       where validacao.turma_id = v_turma_id)
    + (select count(*) from public.matricula_disciplina_tentativas tentativa
       where tentativa.turma_id = v_turma_id
          or tentativa.turma_origem_id = v_turma_id)
  into v_activity_count;

  if v_activity_count <> 0 then
    raise exception
      'A turma possui atividade acadêmica; correção de datas cancelada.';
  end if;
end;
$$;

alter table public.turmas
  disable trigger validate_technical_class_dates_trigger;
alter table public.turmas
  disable trigger sincronizar_periodos_turma_tecnica_trigger;
alter table public.periodos_letivos
  disable trigger protect_technical_period_structure_trigger;
alter table public.periodos_letivos
  disable trigger validate_technical_period_dates_trigger;

update public.turmas
set data_inicio = date '2026-06-01',
    data_previsao_termino = date '2028-06-01'
where id = 'a4b64394-bc0d-4518-bba5-af00465ae43d'::uuid;

with ordered_periods as (
  select
    periodo.id,
    turma.data_inicio,
    (turma.data_previsao_termino - turma.data_inicio + 1)::integer
      as total_days,
    row_number() over (
      partition by periodo.turma_id
      order by periodo.ordem, periodo.id
    )::integer as position,
    count(*) over (partition by periodo.turma_id)::integer as total_periods
  from public.periodos_letivos periodo
  join public.turmas turma on turma.id = periodo.turma_id
  where turma.id = 'a4b64394-bc0d-4518-bba5-af00465ae43d'::uuid
)
update public.periodos_letivos periodo
set data_inicio = ordered.data_inicio
      + floor(
          ordered.total_days::numeric
          * (ordered.position - 1)
          / ordered.total_periods
        )::integer,
    data_fim = ordered.data_inicio
      + floor(
          ordered.total_days::numeric
          * ordered.position
          / ordered.total_periods
        )::integer
      - 1,
    updated_at = now()
from ordered_periods ordered
where periodo.id = ordered.id;

alter table public.periodos_letivos
  enable trigger validate_technical_period_dates_trigger;
alter table public.periodos_letivos
  enable trigger protect_technical_period_structure_trigger;
alter table public.turmas
  enable trigger sincronizar_periodos_turma_tecnica_trigger;
alter table public.turmas
  enable trigger validate_technical_class_dates_trigger;

do $$
declare
  v_turma_id constant uuid := 'a4b64394-bc0d-4518-bba5-af00465ae43d';
begin
  if not exists (
    select 1
    from public.turmas turma
    where turma.id = v_turma_id
      and turma.status = 'EM_ANDAMENTO'
      and turma.data_inicio = date '2026-06-01'
      and turma.data_previsao_termino = date '2028-06-01'
  ) then
    raise exception 'A correção final das datas da turma falhou.';
  end if;

  if (select min(periodo.data_inicio)
      from public.periodos_letivos periodo
      where periodo.turma_id = v_turma_id) <> date '2026-06-01'
    or (select max(periodo.data_fim)
        from public.periodos_letivos periodo
        where periodo.turma_id = v_turma_id) <> date '2028-06-01'
    or exists (
      select 1
      from (
        select
          periodo.data_inicio,
          lag(periodo.data_fim) over (order by periodo.ordem) as previous_end
        from public.periodos_letivos periodo
        where periodo.turma_id = v_turma_id
      ) schedule
      where schedule.previous_end is not null
        and schedule.data_inicio <> schedule.previous_end + 1
    ) then
    raise exception 'A redistribuição final dos períodos falhou.';
  end if;

  if exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgname in (
      'validate_technical_class_dates_trigger',
      'sincronizar_periodos_turma_tecnica_trigger',
      'protect_technical_period_structure_trigger',
      'validate_technical_period_dates_trigger'
    )
      and trigger_row.tgrelid in (
        'public.turmas'::regclass,
        'public.periodos_letivos'::regclass
      )
      and trigger_row.tgenabled <> 'O'
  ) then
    raise exception 'Uma guarda acadêmica não foi reativada.';
  end if;
end;
$$;

commit;
