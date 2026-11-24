begin;

set local lock_timeout = '3s';

-- Serialize with claims and finalizers while checking the saved dates.
lock table public.banese_ead_checkout_expiration_jobs in share mode;

do $calendar$
declare
  v_config public.banese_ead_checkout_expiration_config%rowtype;
  v_polos constant uuid[] := array['44444444-4444-4444-4444-444444444444'::uuid];
  v_previous constant date[] := array[
    '2026-02-18', '2026-06-24', '2026-06-29', '2026-07-08',
    '2026-10-28', '2026-11-23', '2026-11-25'
  ]::date[];
  v_corrected constant date[] := array[
    '2026-02-18', '2026-06-24', '2026-06-29', '2026-07-08',
    '2026-10-28', '2026-11-21', '2026-11-23'
  ]::date[];
begin
  select * into strict v_config from public.banese_ead_checkout_expiration_config
  where environment = 'production' for update;

  if not v_config.enabled and v_config.verified_local_holidays is null
    and v_config.verified_polo_ids is null then return; end if;

  if v_config.verified_polo_ids is distinct from v_polos then
    raise exception 'A configuração de expiração EAD deve estar restrita à Matriz de Japoatã.';
  end if;
  if v_config.verified_local_holidays = v_corrected then return; end if;
  if v_config.verified_local_holidays is distinct from v_previous then
    raise exception 'O calendário de expiração EAD da Matriz diverge da configuração conferida.';
  end if;

  -- Preserve any job that can still send its first PUT. Intent, processing
  -- payment and canceled history already resume through read-only modes.
  if exists (
    select 1 from public.banese_ead_checkout_expiration_jobs j
    where j.environment = v_config.environment and j.snapshot->>'poloId' = v_polos[1]::text
      and j.state in ('RETRY', 'PROCESSING')
      and j.cancel_reason = 'EXPIRED_OPTIONAL'
      and j.remote_mutation_started_at is null and j.processing_payment_detected_at is null
      and j.canceled_at is null
      and internal_contas.ead_expiration_first_day((j.snapshot->>'dueDate')::date, v_previous)
        is distinct from internal_contas.ead_expiration_first_day((j.snapshot->>'dueDate')::date, v_corrected)
  ) then
    raise exception 'A correção do calendário conflita com uma baixa EAD em preparação.';
  end if;

  update public.banese_ead_checkout_expiration_config
  set verified_local_holidays = v_corrected, updated_at = clock_timestamp()
  where environment = v_config.environment;
end;
$calendar$;

commit;
