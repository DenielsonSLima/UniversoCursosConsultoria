-- Active PDV checks share the existing run/lease and rolling title budget.
-- No title is queried, issued, canceled or settled by this migration.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '8s';

do $guard$
begin
  if md5(pg_get_functiondef('public.prepare_banese_reconciliation_batch_v3()'::regprocedure))
      <> '559873bc106261e02931357ee894e58f'
    or md5(pg_get_functiondef('public.finish_banese_reconciliation_run(uuid,integer,boolean,integer)'::regprocedure))
      <> '2ba7a2913334d39c2518c1a4d6dc377a'
    or md5(pg_get_functiondef('public.get_banese_reconciliation_autopilot_progress()'::regprocedure))
      <> '36e168a73c04484f73f9d8eb2fade7c5' then
    raise exception 'Banese PDV source drift; no change applied.';
  end if;
end;
$guard$;

alter table public.banese_reconciliation_runs
  add column origin text not null default 'CRON'
    check (origin in ('CRON', 'PDV'));
comment on column public.banese_reconciliation_runs.origin is
  'PDV reserves 3 title credits in the shared 60-second budget and never promotes the automatic profile.';

do $patch$
declare
  v_sql text;
  v_old text;
  v_new text;
begin
  v_sql := pg_get_functiondef('public.prepare_banese_reconciliation_batch_v3()'::regprocedure);
  v_sql := replace(v_sql, '  v_claimed integer := 0;',
    '  v_claimed integer := 0;' || chr(10) || '  v_available integer;');
  v_old := '  WITH eligible AS (';
  v_new := $replacement$  -- The environment advisory lock serializes reservations with active PDV.
  -- Failed/abandoned reservations count too: never refund uncertain bank calls.
  SELECT greatest(0, v_profile.titles_per_minute - coalesce(sum(
    run.claimed * CASE WHEN run.origin = 'PDV' THEN 3 ELSE 1 END
  ), 0))::integer INTO v_available
  FROM public.banese_reconciliation_runs run
  WHERE run.environment = v_environment
    AND run.started_at > now() - interval '60 seconds';
  IF v_available = 0 THEN
    RETURN jsonb_build_object('enabled', false, 'reason', 'SHARED_BUDGET');
  END IF;

  WITH eligible AS ($replacement$;
  if (length(v_sql)-length(replace(v_sql,v_old,'')))/length(v_old) <> 1 then
    raise exception 'Banese PDV prepare anchor drift.';
  end if;
  v_sql := replace(v_sql, v_old, v_new);
  v_sql := replace(v_sql, '    LIMIT v_profile.titles_per_minute', '    LIMIT v_available');
  execute v_sql;

  v_sql := pg_get_functiondef('public.finish_banese_reconciliation_run(uuid,integer,boolean,integer)'::regprocedure);
  v_sql := replace(v_sql,
    '  elsif v_config.mode = ''AUTOMATIC'' and v_run.mode = ''AUTOMATIC''',
    '  elsif v_run.origin = ''PDV'' then' || chr(10) ||
    '    v_decision := ''Consulta PDV concluída; não altera o perfil automático.'';' || chr(10) ||
    '  elsif v_config.mode = ''AUTOMATIC'' and v_run.mode = ''AUTOMATIC''');
  v_sql := replace(v_sql, '      and run.profile_id = v_from_profile',
    '      and run.profile_id = v_from_profile' || chr(10) || '      and run.origin = ''CRON''');
  execute v_sql;

  v_sql := pg_get_functiondef('public.get_banese_reconciliation_autopilot_progress()'::regprocedure);
  v_sql := replace(v_sql, '    and run.profile_id = v_config.effective_profile_id',
    '    and run.profile_id = v_config.effective_profile_id' || chr(10) || '    and run.origin = ''CRON''');
  execute v_sql;
end;
$patch$;

create function public.claim_banese_pdv_confirmation(p_receivable_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '5s'
as $function$
declare
  v_row public.contas_receber%rowtype;
  v_queue public.banese_reconciliation_queue%rowtype;
  v_config public.banese_reconciliation_config%rowtype;
  v_profile public.banese_reconciliation_profiles%rowtype;
  v_run_id uuid;
  v_used integer;
  v_next timestamptz;
  v_reason text;
  v_now timestamptz := now();
begin
  -- Service-only RPC. The Edge validates JWT, active profile, tab and polo first.
  -- The database rechecks scope/provenance, so no body can select an academic title.
  select * into v_row from public.contas_receber where id = p_receivable_id;
  if v_row.id is null or v_row.categoria is distinct from 'OUTROS_CREDITOS'
    or v_row.gateway_provider is distinct from 'banese_card'
    or v_row.gateway_payment_method is distinct from 'BOLETO'
    or v_row.gateway_environment not in ('production', 'sandbox')
    or v_row.gateway_environment is null
    or v_row.matricula_id is not null or v_row.turma_id is not null
    or v_row.origem_cronograma_id is not null
    or upper(coalesce(v_row.tipo_lancamento,'')) in ('MATRICULA','PARCELA','REMATRICULA','DEPENDENCIA')
    or upper(coalesce(v_row.origem_pagamento,'')) ~ 'PROESC|SISTEMA_ANTERIOR'
    or exists(select 1 from public.emprestimos_financeiros where conta_receber_id = v_row.id)
    or v_row.status not in ('PENDENTE','VENCIDO','AGUARDANDO_CONFIRMACAO')
    or v_row.status is null or coalesce(v_row.valor_pago,0) <> 0
    or v_row.data_pagamento is not null
    or v_row.gateway_submission_channel is distinct from 'API'
    or v_row.gateway_submission_status is distinct from 'API_REGISTERED'
    or coalesce(v_row.gateway_boleto_nosso_numero,'') !~ '^[0-9]{9}$'
    or v_row.gateway_financial_terms is null
    or v_row.gateway_financial_terms_confirmed_at is null
    or coalesce(v_row.gateway_last_error,'') like 'BANESE_DISCOUNT_REMOVAL_PENDING%'
    or coalesce(v_row.gateway_last_error,'') like 'BANESE_IDENTITY_QUARANTINED:%'
    or coalesce(v_row.asaas_last_error,'') like 'BANESE_IDENTITY_QUARANTINED:%'
    or not exists(select 1 from public.payment_gateway_runtime_config
      where enabled and active_environment = v_row.gateway_environment)
    or not exists(select 1 from public.payment_gateway_routes
      where enabled and provider_code = 'banese_card' and payment_method = 'BOLETO'
        and modalidade = 'OUTROS_CREDITOS' and environment = v_row.gateway_environment)
    or not exists(select 1 from public.payment_gateway_transactions t
      where t.receivable_id = v_row.id and t.provider_code = 'banese_card'
        and t.environment = v_row.gateway_environment and t.payment_method = 'BOLETO'
        and coalesce(t.remote_payment_id,'') ~ '^[0-9]{1,9}$'
        and lpad(t.remote_payment_id,9,'0') = v_row.gateway_boleto_nosso_numero
        and coalesce(t.bank_slip_our_number,'') ~ '^[0-9]{1,9}$'
        and lpad(t.bank_slip_our_number,9,'0') = v_row.gateway_boleto_nosso_numero
        and t.bank_slip_digitable_line = v_row.gateway_boleto_linha_digitavel
        and t.bank_slip_barcode = v_row.gateway_boleto_codigo_barras)
  then
    return jsonb_build_object('enabled',false,'reason','INELIGIBLE');
  end if;

  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtext('banese-reconciliation-' || v_row.gateway_environment)) then
    return jsonb_build_object('enabled',false,'reason','BUSY','retryAfterMs',15000);
  end if;
  -- Same unique RUNNING/environment lease as the cron. No overlapping bank lot.
  if exists(select 1 from public.banese_reconciliation_runs
    where environment = v_row.gateway_environment and status = 'RUNNING') then
    return jsonb_build_object('enabled',false,'reason','BUSY','retryAfterMs',15000);
  end if;
  select * into v_config from public.banese_reconciliation_config
    where environment = v_row.gateway_environment for update;
  if v_config.environment is null then
    return jsonb_build_object('enabled',false,'reason','INELIGIBLE');
  end if;
  if v_config.mode = 'PAUSED' then v_reason := 'PAUSED';
  elsif v_config.state = 'SUSPENDED' then v_reason := 'SUSPENDED';
  elsif v_config.cooldown_until > v_now then
    v_reason := 'COOLDOWN'; v_next := v_config.cooldown_until;
  elsif v_config.mode = 'MANUAL' and v_config.test_expires_at <= v_now then
    -- Let the established cron restore P3/P6; never prolong an expired test.
    v_reason := 'COOLDOWN'; v_next := v_now + interval '60 seconds';
  end if;
  if v_reason is not null then
    return jsonb_build_object('enabled',false,'reason',v_reason,'nextCheckAt',v_next,
      'retryAfterMs',case when v_next is null then null
        else greatest(15000,ceil(extract(epoch from v_next-v_now)*1000)::integer) end);
  end if;
  select * into v_profile from public.banese_reconciliation_profiles
    where id = v_config.effective_profile_id and selectable
      and (v_config.mode <> 'AUTOMATIC' or automatic_selectable);
  if v_profile.id is null then
    return jsonb_build_object('enabled',false,'reason','INELIGIBLE');
  end if;

  select * into v_queue from public.banese_reconciliation_queue
    where receivable_id = v_row.id for update;
  if v_queue.receivable_id is null or v_queue.environment <> v_row.gateway_environment
    or v_queue.state not in ('READY','LEASED')
    or exists(select 1 from public.banese_pdv_cancellation_jobs
      where receivable_id = v_row.id and state in ('AUTHORIZED','FENCED')) then
    return jsonb_build_object('enabled',false,'reason','INELIGIBLE');
  end if;
  if v_queue.state = 'LEASED' and v_queue.lease_until > v_now then
    v_reason := 'BUSY'; v_next := v_queue.lease_until;
  elsif v_queue.last_result in ('ERROR','THROTTLED') and v_queue.next_check_at > v_now then
    v_reason := 'COOLDOWN'; v_next := v_queue.next_check_at;
  elsif v_queue.last_checked_at > v_now - interval '15 seconds' then
    v_reason := 'INTERVAL'; v_next := v_queue.last_checked_at + interval '15 seconds';
  end if;
  if v_reason is not null then
    return jsonb_build_object('enabled',false,'reason',v_reason,
      'checkedAt',v_queue.last_checked_at,'nextCheckAt',v_next,
      'retryAfterMs',greatest(1,ceil(extract(epoch from v_next-v_now)*1000)::integer));
  end if;

  select coalesce(sum(claimed * case when origin='PDV' then 3 else 1 end),0)::integer,
    min(started_at) + interval '60 seconds'
  into v_used,v_next from public.banese_reconciliation_runs
  where environment = v_row.gateway_environment and started_at > v_now-interval '60 seconds';
  if v_used + 3 > v_profile.titles_per_minute then
    return jsonb_build_object('enabled',false,'reason','BUDGET','nextCheckAt',v_next,
      'retryAfterMs',greatest(1000,ceil(extract(epoch from v_next-v_now)*1000)::integer));
  end if;

  insert into public.banese_reconciliation_runs(
    environment,mode,profile_id,target_titles,claimed,config_version,origin)
  values(v_row.gateway_environment,v_config.mode,v_profile.id,1,1,v_config.version,'PDV')
  returning id into v_run_id;
  update public.banese_reconciliation_queue set state='LEASED',lease_run_id=v_run_id,
    lease_until=v_now+interval '90 seconds',updated_at=v_now where receivable_id=v_row.id;
  return jsonb_build_object('enabled',true,'runId',v_run_id,
    'environment',v_row.gateway_environment,'checkedAt',v_queue.last_checked_at,
    'oauthRefreshMarginSeconds',v_config.oauth_refresh_margin_seconds);
end;
$function$;
alter function public.claim_banese_pdv_confirmation(uuid) owner to postgres;
revoke all on function public.claim_banese_pdv_confirmation(uuid) from public, anon, authenticated;
grant execute on function public.claim_banese_pdv_confirmation(uuid) to service_role;
commit;
