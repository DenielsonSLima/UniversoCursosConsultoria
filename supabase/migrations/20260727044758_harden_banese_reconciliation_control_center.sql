-- Correções encontradas pelos advisors após a instalação do centro Banese.

revoke all on function public.banese_reconciliation_queue_receivable()
  from public, anon, authenticated;

create index if not exists banese_reconciliation_attempts_receivable_idx
  on public.banese_reconciliation_attempts(receivable_id);

create index if not exists banese_reconciliation_queue_lease_run_idx
  on public.banese_reconciliation_queue(lease_run_id)
  where lease_run_id is not null;

create index if not exists banese_reconciliation_runs_profile_idx
  on public.banese_reconciliation_runs(profile_id);

create index if not exists banese_reconciliation_transitions_run_idx
  on public.banese_reconciliation_transitions(run_id)
  where run_id is not null;

comment on function public.get_banese_reconciliation_dashboard() is
  'RPC SECURITY DEFINER intencional: exige auth.uid(), gestor global e módulo configurações antes de retornar dados sanitizados.';

comment on function public.update_banese_reconciliation_config(text, integer, bigint, text) is
  'RPC SECURITY DEFINER intencional: exige auth.uid(), gestor global, módulo configurações, versão otimista e perfil P1-P6.';
