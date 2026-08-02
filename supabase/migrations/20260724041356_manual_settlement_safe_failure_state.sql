begin;

alter table public.receivable_manual_settlements
  drop constraint if exists receivable_manual_settlements_state_check;

alter table public.receivable_manual_settlements
  add constraint receivable_manual_settlements_state_check
  check (state in (
    'STARTED',
    'REMOTE_CANCELED_LOCAL_PENDING',
    'FAILED_SAFE',
    'REVIEW_REQUIRED',
    'COMPLETED',
    'REVERSED'
  ));

alter table public.receivable_manual_settlement_events
  drop constraint if exists receivable_manual_settlement_events_type_check;

alter table public.receivable_manual_settlement_events
  add constraint receivable_manual_settlement_events_type_check
  check (event_type in (
    'STARTED',
    'REMOTE_CANCELED',
    'REMOTE_CANCELLATION_FAILED',
    'REMOTE_CANCELLATION_PREFLIGHT_FAILED',
    'LOCAL_SETTLEMENT_FAILED',
    'LOCAL_SETTLEMENT_COMPLETED',
    'LOCAL_SETTLEMENT_REPLAYED',
    'LOCAL_SETTLEMENT_REVERSED'
  ));

comment on column public.receivable_manual_settlements.state is
  'FAILED_SAFE indica falha comprovadamente anterior a qualquer chamada mutável ao provedor; não bloqueia nova tentativa. REVIEW_REQUIRED permanece reservado para resultado remoto ou local ambíguo.';

commit;
