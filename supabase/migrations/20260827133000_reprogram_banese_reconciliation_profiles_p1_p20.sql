-- Reprograma os perfis P1 ao P20 da conciliação Banese com as novas capacidades
-- de alto desempenho validadas em produção, mantendo a política de subida gradual
-- no piloto automático (P3..P9) e desbloqueando os perfis P17..P20 para seleção manual.
begin;

lock table public.banese_reconciliation_config in exclusive mode;

alter table public.banese_reconciliation_profiles
  drop constraint if exists banese_reconciliation_profiles_family_policy_check;

alter table public.banese_reconciliation_profiles
  drop constraint if exists banese_reconciliation_profiles_concurrency_check;

alter table public.banese_reconciliation_profiles
  add constraint banese_reconciliation_profiles_concurrency_check
  check (max_concurrency between 1 and 25);

-- Atualiza os 20 perfis com os novos limites de vazão e concorrência
update public.banese_reconciliation_profiles
set
  name = v.name,
  titles_per_minute = v.titles_per_minute,
  estimated_requests_per_minute = v.estimated_requests_per_minute,
  group_name = v.group_name,
  selectable = v.selectable,
  automatic_selectable = v.automatic_selectable,
  queue_strategy = v.queue_strategy,
  fallback_profile_id = v.fallback_profile_id,
  max_concurrency = v.max_concurrency,
  test_duration_minutes = v.test_duration_minutes,
  source_note = v.source_note
from (values
  (1::smallint, 'Recuperação Segura', 10, 20, 'CONSERVATIVE', true, false, 'GENERAL', 1::smallint, 1::smallint, null::integer, 'Retomada controlada após indisponibilidade ou falha.'),
  (2::smallint, 'Base Suave', 20, 40, 'CONSERVATIVE', true, false, 'GENERAL', 1::smallint, 1::smallint, null::integer, 'Operação silenciosa e cadenciada para horários noturnos.'),
  (3::smallint, 'Estável Mínimo', 40, 80, 'CONSERVATIVE', true, true, 'GENERAL', 2::smallint, 2::smallint, null::integer, 'Piso do Piloto Automático.'),
  (4::smallint, 'Fluxo Contínuo', 60, 120, 'CONSERVATIVE', true, true, 'GENERAL', 3::smallint, 2::smallint, null::integer, 'Operação regular diária constante.'),
  (5::smallint, 'Equilibrado', 120, 240, 'CONSERVATIVE', true, true, 'GENERAL', 4::smallint, 3::smallint, null::integer, 'Ritmo de cruzeiro ideal para o dia a dia.'),
  (6::smallint, 'Moderado Ágil', 180, 360, 'CONSERVATIVE', true, true, 'GENERAL', 5::smallint, 4::smallint, null::integer, 'Liquidação ágil de turmas e matrículas.'),
  (7::smallint, 'Acelerado', 240, 480, 'CONSERVATIVE', true, true, 'GENERAL', 6::smallint, 4::smallint, null::integer, 'Resolução rápida de filas acumuladas.'),
  (8::smallint, 'EAD Prioritário', 360, 720, 'CONSERVATIVE', true, true, 'GENERAL', 7::smallint, 5::smallint, null::integer, 'Liberação expressa de acessos a cursos EAD.'),
  (9::smallint, 'Alto Desempenho', 480, 960, 'REAL_TEST', true, true, 'GENERAL', 8::smallint, 6::smallint, 30, 'Teto do Piloto Automático em regime de alto rendimento.'),
  (10::smallint, 'Teto Turbo 600', 600, 1200, 'REAL_TEST', true, false, 'GENERAL', 9::smallint, 6::smallint, 30, 'Canário manual de 600 títulos/min; expira após 30 minutos.'),
  (11::smallint, 'Canário 900', 900, 1800, 'REAL_TEST', true, false, 'GENERAL', 9::smallint, 7::smallint, 30, 'Canário manual de 900 títulos/min; expira após 30 minutos.'),
  (12::smallint, 'Canário 1.500', 1500, 3000, 'REAL_TEST', true, false, 'GENERAL', 9::smallint, 8::smallint, 30, 'Canário manual de 1.500 títulos/min; expira após 30 minutos.'),
  (13::smallint, 'Janela D-2 a D+2 (300)', 300, 600, 'PRIORITY_WINDOW', true, false, 'EAD_DUE_WINDOW', 8::smallint, 4::smallint, 30, 'EAD primeiro; janela de vencimento com até 300 títulos/min.'),
  (14::smallint, 'Janela D-2 a D+2 (600)', 600, 1200, 'PRIORITY_WINDOW', true, false, 'EAD_DUE_WINDOW', 8::smallint, 6::smallint, 30, 'EAD primeiro; janela de vencimento com até 600 títulos/min.'),
  (15::smallint, 'Janela D-2 a D+2 (1.200)', 1200, 2400, 'PRIORITY_WINDOW', true, false, 'EAD_DUE_WINDOW', 8::smallint, 8::smallint, 30, 'EAD primeiro; janela de vencimento com até 1.200 títulos/min.'),
  (16::smallint, 'Janela EAD Flash (2.000)', 2000, 4000, 'PRIORITY_WINDOW', true, false, 'EAD_DUE_WINDOW', 8::smallint, 10::smallint, 30, 'EAD prioritário; janela expressa de até 2.000 títulos/min.'),
  (17::smallint, 'Carga em Massa 3.000', 3000, 6000, 'AWAITING_BANESE', true, false, 'GENERAL', 8::smallint, 12::smallint, 30, 'Desbloqueado: conciliação massiva de turmas completas (3.000 títulos/min).'),
  (18::smallint, 'Carga em Massa 4.500', 4500, 9000, 'AWAITING_BANESE', true, false, 'GENERAL', 8::smallint, 15::smallint, 30, 'Desbloqueado: sincronização expressa de carnês (4.500 títulos/min).'),
  (19::smallint, 'Super Carga 6.000', 6000, 12000, 'AWAITING_BANESE', true, false, 'GENERAL', 8::smallint, 20::smallint, 30, 'Desbloqueado: conciliação de semestres inteiros (6.000 títulos/min).'),
  (20::smallint, 'Varredura Total 9.000', 9000, 18000, 'AWAITING_BANESE', true, false, 'GENERAL', 8::smallint, 25::smallint, 30, 'Desbloqueado: varredura histórica completa de alta vazão (9.000 títulos/min).')
) as v(id, name, titles_per_minute, estimated_requests_per_minute, group_name, selectable, automatic_selectable, queue_strategy, fallback_profile_id, max_concurrency, test_duration_minutes, source_note)
where public.banese_reconciliation_profiles.id = v.id;

alter table public.banese_reconciliation_profiles
  add constraint banese_reconciliation_profiles_family_policy_check check (
    (
      id between 1 and 2
      and group_name = 'CONSERVATIVE'
      and selectable
      and not automatic_selectable
      and queue_strategy = 'GENERAL'
      and test_duration_minutes is null
    )
    or (
      id between 3 and 8
      and group_name = 'CONSERVATIVE'
      and selectable
      and automatic_selectable
      and queue_strategy = 'GENERAL'
      and test_duration_minutes is null
    )
    or (
      id = 9
      and group_name = 'REAL_TEST'
      and selectable
      and automatic_selectable
      and queue_strategy = 'GENERAL'
      and test_duration_minutes is not null
    )
    or (
      id between 10 and 12
      and group_name = 'REAL_TEST'
      and selectable
      and not automatic_selectable
      and queue_strategy = 'GENERAL'
      and test_duration_minutes is not null
    )
    or (
      id between 13 and 16
      and group_name = 'PRIORITY_WINDOW'
      and selectable
      and not automatic_selectable
      and queue_strategy = 'EAD_DUE_WINDOW'
      and test_duration_minutes is not null
    )
    or (
      id between 17 and 20
      and group_name = 'AWAITING_BANESE'
      and selectable
      and not automatic_selectable
      and queue_strategy = 'GENERAL'
      and test_duration_minutes is not null
    )
  );

comment on constraint banese_reconciliation_profiles_family_policy_check
  on public.banese_reconciliation_profiles is
  'P3-P9 compõem o automático; P1-P2, P10-P16 e P17-P20 são manuais desbloqueados com fallback seguro.';

commit;
