begin;

create index if not exists contas_receber_manual_settlement_idx
  on public.contas_receber (manual_settlement_id)
  where manual_settlement_id is not null;

create index if not exists receivable_manual_settlements_account_idx
  on public.receivable_manual_settlements (account_id);

create index if not exists receivable_manual_settlements_polo_idx
  on public.receivable_manual_settlements (polo_id)
  where polo_id is not null;

create index if not exists receivable_manual_settlements_provider_environment_idx
  on public.receivable_manual_settlements (provider_code, environment)
  where provider_code is not null;

create index if not exists receivable_manual_settlement_events_actor_idx
  on public.receivable_manual_settlement_events (actor_id, created_at desc);

comment on index public.contas_receber_manual_settlement_idx is
  'Acelera auditoria e validacao da FK da baixa manual no recebivel.';

comment on index public.receivable_manual_settlements_provider_environment_idx is
  'Apoia auditoria de cancelamentos remotos por provedor e ambiente.';

commit;
