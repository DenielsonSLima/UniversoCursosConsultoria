-- Índices de cobertura para os vínculos e consultas operacionais da outbox.

create index if not exists banese_cancellation_outbox_matricula_state_idx
  on public.banese_cancellation_outbox(matricula_id, state);

create index if not exists banese_cancellation_outbox_movement_id_idx
  on public.banese_cancellation_outbox(movement_id)
  where movement_id is not null;
