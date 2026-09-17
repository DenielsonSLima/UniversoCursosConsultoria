begin;

alter table public.receivable_manual_settlements
  drop constraint receivable_manual_settlements_state_check;
alter table public.receivable_manual_settlements
  add constraint receivable_manual_settlements_state_check
  check (state in (
    'STARTED', 'REMOTE_CANCELED_LOCAL_PENDING', 'FAILED_SAFE',
    'REVIEW_REQUIRED', 'COMPLETED', 'REVERSED', 'CANCELED_AFTER_REVIEW'
  ));

alter table public.receivable_manual_settlement_events
  drop constraint receivable_manual_settlement_events_type_check;
alter table public.receivable_manual_settlement_events
  add constraint receivable_manual_settlement_events_type_check
  check (event_type in (
    'STARTED', 'REMOTE_CANCELED', 'REMOTE_CANCELLATION_FAILED',
    'REMOTE_CANCELLATION_PREFLIGHT_FAILED', 'LOCAL_SETTLEMENT_FAILED',
    'LOCAL_SETTLEMENT_COMPLETED', 'LOCAL_SETTLEMENT_REPLAYED',
    'LOCAL_SETTLEMENT_REVERSED', 'REVIEW_CANCELED'
  ));

comment on column public.receivable_manual_settlements.state is
  'FAILED_SAFE: falha anterior à chamada mutável ao provedor. REVIEW_REQUIRED: resultado ambíguo. CANCELED_AFTER_REVIEW: tentativa não liquidada encerrada por revisão explícita e auditada; chave, composição e conta originais permanecem imutáveis. Uma nova baixa exige nova chave e nova consulta bancária.';

commit;
