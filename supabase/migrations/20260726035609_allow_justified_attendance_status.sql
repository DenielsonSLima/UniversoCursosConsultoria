alter table public.diario_frequencia
  drop constraint if exists diario_frequencia_status_check;

alter table public.diario_frequencia
  add constraint diario_frequencia_status_check
  check (status in ('P', 'F', 'J'));

comment on column public.diario_frequencia.status is
  'P = presença; F = falta; J = falta justificada/abonada.';
