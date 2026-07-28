begin;

drop policy if exists gestao_realtime_events_select
  on public.gestao_realtime_events;

create policy gestao_realtime_events_select
  on public.gestao_realtime_events
  for select
  to authenticated
  using (
    (
      (select public.gestor_has_module('gestao'))
      or (select public.gestor_has_module('relatorios'))
    )
    and (
      (select public.is_gestor_global())
      or (
        polo_id is not null
        and (select public.is_gestor_for_polo(polo_id))
      )
    )
  );

comment on policy gestao_realtime_events_select
  on public.gestao_realtime_events is
  'Permite eventos acadêmicos leves aos módulos Gestão e Relatórios, sempre limitados ao escopo de polo do gestor.';

commit;
