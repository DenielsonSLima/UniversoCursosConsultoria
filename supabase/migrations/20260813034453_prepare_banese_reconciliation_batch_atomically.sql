-- A execução só passa a existir quando a fila já tiver ao menos um título
-- efetivamente reservado. Isso evita histórico financeiro vazio por heartbeat.
CREATE OR REPLACE FUNCTION public.prepare_banese_reconciliation_batch_v3()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_environment text;
  v_config public.banese_reconciliation_config%ROWTYPE;
  v_profile public.banese_reconciliation_profiles%ROWTYPE;
  v_run_id uuid;
  v_expected_claimed integer := 0;
  v_claimed integer := 0;
  v_items jsonb := '[]'::jsonb;
  v_today date := (now() AT TIME ZONE 'America/Maceio')::date;
BEGIN
  SELECT runtime.active_environment
  INTO v_environment
  FROM public.payment_gateway_runtime_config AS runtime
  WHERE runtime.enabled
  LIMIT 1;

  IF v_environment IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.payment_gateway_routes AS route
    WHERE route.provider_code = 'banese_card'
      AND route.environment = v_environment
      AND route.payment_method = 'BOLETO'
      AND route.enabled
  ) THEN
    RETURN jsonb_build_object('enabled', false, 'reason', 'BANESE_NOT_RESPONSIBLE');
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('banese-reconciliation-' || v_environment)
  );

  UPDATE public.banese_reconciliation_runs AS run
  SET status = 'ABANDONED',
      decision = 'Lease da execução expirou.',
      finished_at = now()
  WHERE run.environment = v_environment
    AND run.status = 'RUNNING'
    AND run.started_at < now() - interval '2 minutes';

  IF EXISTS (
    SELECT 1
    FROM public.banese_reconciliation_runs AS run
    WHERE run.environment = v_environment
      AND run.status = 'RUNNING'
  ) THEN
    RETURN jsonb_build_object('enabled', false, 'reason', 'RUN_ALREADY_ACTIVE');
  END IF;

  SELECT *
  INTO v_config
  FROM public.banese_reconciliation_config AS config
  WHERE config.environment = v_environment
  FOR UPDATE;

  IF v_config.mode = 'MANUAL'
    AND v_config.test_expires_at IS NOT NULL
    AND v_config.test_expires_at <= now()
  THEN
    INSERT INTO public.banese_reconciliation_transitions (
      environment,
      transition_type,
      from_profile_id,
      to_profile_id,
      from_mode,
      to_mode,
      reason
    ) VALUES (
      v_environment,
      'TEST_EXPIRED',
      v_config.effective_profile_id,
      8,
      'MANUAL',
      'AUTOMATIC',
      'Teste temporário expirado; retorno ao P8 com teto automático P10.'
    );

    UPDATE public.banese_reconciliation_config AS config
    SET mode = 'AUTOMATIC',
        selected_profile_id = 10,
        effective_profile_id = 8,
        last_stable_profile_id = 8,
        state = 'OBSERVING',
        stable_since = now(),
        test_expires_at = NULL,
        version = version + 1,
        updated_at = now()
    WHERE config.environment = v_environment
    RETURNING * INTO v_config;
  END IF;

  IF v_config.mode = 'PAUSED' THEN
    RETURN jsonb_build_object('enabled', false, 'reason', 'PAUSED');
  END IF;
  IF v_config.state = 'SUSPENDED' THEN
    RETURN jsonb_build_object('enabled', false, 'reason', 'SUSPENDED');
  END IF;
  IF v_config.cooldown_until IS NOT NULL
    AND v_config.cooldown_until > now()
  THEN
    RETURN jsonb_build_object(
      'enabled', false,
      'reason', 'COOLDOWN',
      'cooldownUntil', v_config.cooldown_until
    );
  END IF;
  IF v_config.state = 'COOLDOWN' THEN
    UPDATE public.banese_reconciliation_config AS config
    SET state = 'OBSERVING',
        cooldown_until = NULL,
        stable_since = now(),
        version = version + 1,
        updated_at = now()
    WHERE config.environment = v_environment
    RETURNING * INTO v_config;
  END IF;

  SELECT *
  INTO v_profile
  FROM public.banese_reconciliation_profiles AS profile
  WHERE profile.id = v_config.effective_profile_id
    AND profile.selectable
    AND (
      v_config.mode <> 'AUTOMATIC'
      OR profile.automatic_selectable
    );

  IF v_profile.id IS NULL THEN
    RETURN jsonb_build_object('enabled', false, 'reason', 'PROFILE_BLOCKED');
  END IF;

  WITH eligible AS (
    SELECT
      queue.receivable_id,
      queue.modality,
      queue.environment,
      queue.priority,
      queue.next_check_at,
      queue.issued_at,
      CASE WHEN queue.modality = 'EAD' THEN 0 ELSE 1 END AS family_rank,
      row_number() OVER (
        PARTITION BY CASE WHEN queue.modality = 'EAD' THEN 0 ELSE 1 END
        ORDER BY queue.priority, queue.next_check_at, queue.issued_at, queue.receivable_id
      ) AS family_position
    FROM public.banese_reconciliation_queue AS queue
    JOIN public.contas_receber AS receivable
      ON receivable.id = queue.receivable_id
    WHERE queue.environment = v_environment
      AND (
        (
          queue.state = 'READY'
          AND coalesce(queue.next_check_at, '-infinity'::timestamptz) <= now()
        )
        OR (
          queue.state = 'LEASED'
          AND queue.lease_until <= now()
        )
      )
      AND receivable.gateway_provider = 'banese_card'
      AND receivable.gateway_payment_method = 'BOLETO'
      AND receivable.status IN ('PENDENTE', 'VENCIDO', 'AGUARDANDO_CONFIRMACAO')
      AND coalesce(receivable.gateway_boleto_nosso_numero, '') ~ '^[0-9]{9}$'
      AND (
        v_profile.queue_strategy = 'GENERAL'
        OR queue.modality = 'EAD'
        OR receivable.data_vencimento BETWEEN v_today - 2 AND v_today + 2
      )
  ),
  candidates AS MATERIALIZED (
    SELECT
      eligible.receivable_id,
      eligible.modality,
      eligible.environment,
      eligible.priority,
      eligible.next_check_at,
      eligible.issued_at,
      eligible.family_rank,
      eligible.family_position,
      CASE
        WHEN eligible.family_rank = 0
          AND eligible.family_position <= greatest(
            1,
            ceil(v_profile.titles_per_minute * 0.8)::integer
          )
          THEN 0
        WHEN eligible.family_rank = 1 THEN 1
        ELSE 2
      END AS selection_rank
    FROM eligible
    JOIN public.banese_reconciliation_queue AS locked_queue
      ON locked_queue.receivable_id = eligible.receivable_id
    ORDER BY
      CASE
        WHEN eligible.family_rank = 0
          AND eligible.family_position <= greatest(
            1,
            ceil(v_profile.titles_per_minute * 0.8)::integer
          )
          THEN 0
        WHEN eligible.family_rank = 1 THEN 1
        ELSE 2
      END,
      eligible.priority,
      eligible.next_check_at,
      eligible.issued_at,
      eligible.receivable_id
    LIMIT v_profile.titles_per_minute
    FOR UPDATE OF locked_queue SKIP LOCKED
  ),
  created_run AS (
    INSERT INTO public.banese_reconciliation_runs (
      environment,
      mode,
      profile_id,
      target_titles,
      claimed,
      config_version
    )
    SELECT
      v_environment,
      v_config.mode,
      v_profile.id,
      v_profile.titles_per_minute,
      (SELECT count(*)::integer FROM candidates),
      v_config.version
    WHERE EXISTS (SELECT 1 FROM candidates)
    RETURNING id, claimed
  ),
  leased AS (
    UPDATE public.banese_reconciliation_queue AS queue
    SET state = 'LEASED',
        lease_run_id = created_run.id,
        lease_until = now() + interval '90 seconds',
        updated_at = now()
    FROM candidates
    CROSS JOIN created_run
    WHERE queue.receivable_id = candidates.receivable_id
    RETURNING queue.receivable_id, queue.modality, queue.environment
  )
  SELECT
    (SELECT id FROM created_run),
    coalesce((SELECT claimed FROM created_run), 0),
    count(leased.receivable_id)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'receivableId', leased.receivable_id,
          'modality', leased.modality,
          'environment', leased.environment
        )
        ORDER BY
          candidates.selection_rank,
          candidates.priority,
          candidates.next_check_at,
          candidates.issued_at,
          candidates.receivable_id
      ),
      '[]'::jsonb
    )
  INTO v_run_id, v_expected_claimed, v_claimed, v_items
  FROM leased
  JOIN candidates
    ON candidates.receivable_id = leased.receivable_id;

  IF v_run_id IS NULL THEN
    IF v_expected_claimed <> 0
      OR v_claimed <> 0
      OR jsonb_array_length(v_items) <> 0
    THEN
      RAISE EXCEPTION 'Reserva Banese inconsistente sem execução criada.';
    END IF;

    RETURN jsonb_build_object(
      'enabled', false,
      'skipped', true,
      'reason', 'NO_CLAIMABLE_TITLES'
    );
  END IF;

  IF v_expected_claimed < 1
    OR v_claimed <> v_expected_claimed
    OR jsonb_array_length(v_items) <> v_expected_claimed
  THEN
    RAISE EXCEPTION 'Reserva Banese inconsistente; a transação foi revertida.';
  END IF;

  RETURN jsonb_build_object(
    'enabled', true,
    'runId', v_run_id,
    'environment', v_environment,
    'mode', v_config.mode,
    'profileId', v_profile.id,
    'targetTitles', v_profile.titles_per_minute,
    'claimed', v_claimed,
    'maxConcurrency', v_profile.max_concurrency,
    'queueStrategy', v_profile.queue_strategy,
    'oauthReuseEnabled', v_config.oauth_reuse_enabled,
    'oauthRefreshMarginSeconds', v_config.oauth_refresh_margin_seconds,
    'items', v_items
  );
END;
$function$;

COMMENT ON FUNCTION public.prepare_banese_reconciliation_batch_v3() IS
  'Reserva atomicamente títulos Banese antes de criar a execução; sem título claimable, retorna skipped sem gerar histórico financeiro vazio.';

REVOKE ALL ON FUNCTION public.prepare_banese_reconciliation_batch_v3()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_banese_reconciliation_batch_v3()
  TO service_role;
