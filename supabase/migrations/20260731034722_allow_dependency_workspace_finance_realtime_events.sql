drop policy if exists finance_realtime_events_select
  on public.finance_realtime_events;

create policy finance_realtime_events_select
  on public.finance_realtime_events
  for select
  to authenticated
  using (
    (
      aluno_id is not null
      and aluno_id = (select public.current_aluno_id())
    )
    or (
      (
        (
          polo_id is null
          and (select public.is_gestor_global())
        )
        or (
          polo_id is not null
          and (select public.is_gestor_for_polo(polo_id))
        )
      )
      and (
        (select public.gestor_has_module('caixa'))
        or (select public.gestor_has_financeiro_tab('resumo'))
        or (select public.gestor_has_financeiro_tab('receber'))
        or (
          select public.gestor_has_tab(
            'secretaria',
            'recebimentos'
          )
        )
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
    )
  );

comment on policy finance_realtime_events_select
  on public.finance_realtime_events is
  'Expõe eventos financeiros do polo aos módulos financeiros, alunos e ao workspace autorizado de Dependências Acadêmicas.';
