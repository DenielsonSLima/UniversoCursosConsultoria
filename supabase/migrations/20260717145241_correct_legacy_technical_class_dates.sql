-- Corrige as datas reais das turmas técnicas legadas e cadastra as ausentes.
-- Os períodos existentes são redistribuídos sem trocar seus IDs, preservando
-- vínculos de disciplinas, matrículas e históricos acadêmicos.

alter table public.turmas
  disable trigger validate_technical_class_dates_trigger;
alter table public.turmas
  disable trigger sincronizar_periodos_turma_tecnica_trigger;
alter table public.periodos_letivos
  disable trigger protect_technical_period_structure_trigger;
alter table public.periodos_letivos
  disable trigger validate_technical_period_dates_trigger;

with corrected(codigo, data_inicio) as (
  values
    ('ENF-T41-SEM-AQU', date '2025-04-08'),
    ('ENF-T39-SEM-POR', date '2025-04-08'),
    ('ENF-T38-INT-MAT', date '2025-02-08'),
    ('ENF-T40-INT-MAT', date '2025-04-12'),
    ('ENF-T42-INT-MAT', date '2025-09-06')
)
update public.turmas t
set data_inicio = c.data_inicio,
    data_previsao_termino = (
      c.data_inicio + interval '24 months' - interval '1 day'
    )::date
from corrected c
where t.codigo = c.codigo;

with ordered_periods as (
  select
    pl.id,
    t.data_inicio,
    (t.data_previsao_termino - t.data_inicio + 1)::integer as total_days,
    row_number() over (
      partition by pl.turma_id order by pl.ordem, pl.id
    )::integer as position,
    count(*) over (partition by pl.turma_id)::integer as total_periods
  from public.periodos_letivos pl
  join public.turmas t on t.id = pl.turma_id
  where t.codigo in (
    'ENF-T41-SEM-AQU',
    'ENF-T39-SEM-POR',
    'ENF-T38-INT-MAT',
    'ENF-T40-INT-MAT',
    'ENF-T42-INT-MAT'
  )
)
update public.periodos_letivos pl
set data_inicio = op.data_inicio
      + floor(op.total_days::numeric * (op.position - 1) / op.total_periods)::integer,
    data_fim = op.data_inicio
      + floor(op.total_days::numeric * op.position / op.total_periods)::integer - 1,
    updated_at = now()
from ordered_periods op
where pl.id = op.id;

alter table public.periodos_letivos
  enable trigger validate_technical_period_dates_trigger;
alter table public.periodos_letivos
  enable trigger protect_technical_period_structure_trigger;
alter table public.turmas
  enable trigger sincronizar_periodos_turma_tecnica_trigger;
alter table public.turmas
  enable trigger validate_technical_class_dates_trigger;

with targets(codigo, nome, curso_nome, cidade, data_inicio, turno) as (
  values
    ('ENF-T44-SEM-AQU', 'ENF T-44 SEM', 'Técnico em Enfermagem', 'AQUIDABA', date '2026-03-03', 'NOTURNO'),
    ('ENF-T37-SEM-POR', 'ENF T-37 SEM', 'Técnico em Enfermagem', 'PORTO DA FOLHA', date '2024-09-03', 'NOTURNO'),
    ('ENF-T45-SEM-POR', 'ENF T-45 SEM', 'Técnico em Enfermagem', 'PORTO DA FOLHA', date '2026-03-03', 'NOTURNO'),
    ('ENF-T35-INT-MAT', 'ENF T-35 INT', 'Técnico em Enfermagem', 'JAPOATA', date '2024-06-01', 'INTEGRAL'),
    ('ENF-T43-INT-MAT', 'ENF T-43 INT', 'Técnico em Enfermagem', 'JAPOATA', date '2026-02-07', 'INTEGRAL'),
    ('RAD-T01-INT-MAT', 'RAD T-01 INT', 'Técnico em Radiologia', 'JAPOATA', date '2026-04-11', 'INTEGRAL')
), resolved as (
  select
    target.codigo,
    target.nome,
    curso.id as curso_id,
    polo.id as polo_id,
    target.data_inicio,
    (
      target.data_inicio + interval '24 months' - interval '1 day'
    )::date as data_previsao_termino,
    target.turno
  from targets target
  join public.cursos curso
    on curso.nome = target.curso_nome
   and curso.modalidade = 'TECNICO'
  join public.polos polo
    on upper(polo.cidade) = target.cidade
)
insert into public.turmas (
  codigo,
  nome,
  curso_id,
  polo_id,
  data_inicio,
  data_previsao_termino,
  turno,
  status,
  vagas_totais
)
select
  codigo,
  nome,
  curso_id,
  polo_id,
  data_inicio,
  data_previsao_termino,
  turno,
  'PLANEJADA',
  40
from resolved
on conflict (codigo) do update
set nome = excluded.nome,
    polo_id = excluded.polo_id,
    data_inicio = excluded.data_inicio,
    data_previsao_termino = excluded.data_previsao_termino,
    turno = excluded.turno;

set local request.jwt.claim.role = 'service_role';

select public.alterar_status_turma_tecnica(t.id, 'EM_ANDAMENTO', null)
from public.turmas t
where t.codigo in (
  'ENF-T44-SEM-AQU',
  'ENF-T37-SEM-POR',
  'ENF-T45-SEM-POR',
  'ENF-T35-INT-MAT',
  'ENF-T43-INT-MAT',
  'RAD-T01-INT-MAT'
)
and t.status = 'PLANEJADA';
