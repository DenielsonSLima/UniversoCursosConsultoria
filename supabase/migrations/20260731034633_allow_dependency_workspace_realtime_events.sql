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
      or (
        select public.gestor_has_tab(
          'secretaria',
          'dependencias-academicas'
        )
      )
      or (
        select public.gestor_has_tab(
          'secretaria',
          'solicitacoes'
        )
      )
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
  'Expõe eventos acadêmicos do polo à Gestão, Relatórios e ao workspace autorizado de Dependências Acadêmicas.';
