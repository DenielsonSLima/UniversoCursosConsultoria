-- Corrige o resumo de erros Banese sem reescrever a migration já aplicada.
-- Tentativas usam bigint e execuções usam uuid; o feed público normaliza ambos
-- como identificadores textuais prefixados antes do UNION ALL.

begin;

create or replace function public.get_banese_reconciliation_error_summary()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_environment text;
  v_result jsonb;
begin
  if auth.uid() is null
    or not public.is_gestor_global()
    or not public.gestor_has_module('configuracoes')
  then
    raise exception 'Acesso negado aos erros da Consulta API Banese.'
      using errcode = '42501';
  end if;

  select runtime.active_environment
  into v_environment
  from public.payment_gateway_runtime_config runtime
  limit 1;

  v_environment := coalesce(v_environment, 'sandbox');

  with errors as (
    select
      ('attempt:' || attempt.id::text) as id,
      attempt.modality,
      attempt.result,
      attempt.error_class,
      attempt.http_status,
      attempt.created_at
    from public.banese_reconciliation_attempts attempt
    where attempt.environment = v_environment
      and attempt.result in ('ERROR', 'THROTTLED')
      and attempt.created_at >= now() - interval '1 hour'
    union all
    select
      ('run:' || run.id::text) as id,
      'SISTEMA'::text,
      run.status,
      'RUN_FAILED'::text,
      null::integer,
      coalesce(run.finished_at, run.started_at)
    from public.banese_reconciliation_runs run
    where run.environment = v_environment
      and run.status in ('FAILED', 'PARTIAL', 'THROTTLED', 'ABANDONED')
      and coalesce(run.finished_at, run.started_at) >= now() - interval '1 hour'
      and not exists (
        select 1
        from public.banese_reconciliation_attempts attempt
        where attempt.run_id = run.id
          and attempt.result in ('ERROR', 'THROTTLED')
      )
  )
  select jsonb_build_object(
    'attemptsLastHour', count(*),
    'throttledLastHour', count(*) filter (where summary_error.result = 'THROTTLED'),
    'authLastHour', count(*) filter (where summary_error.error_class = 'AUTH'),
    'lastErrorAt', max(summary_error.created_at),
    'lastErrors', (
      select coalesce(
        jsonb_agg(to_jsonb(recent) order by recent.created_at desc),
        '[]'::jsonb
      )
      from (
        select
          source.id,
          source.modality,
          source.result,
          source.error_class,
          source.http_status,
          source.created_at
        from errors source
        order by source.created_at desc
        limit 5
      ) recent
    )
  )
  into v_result
  from errors summary_error;

  return coalesce(
    v_result,
    jsonb_build_object(
      'attemptsLastHour', 0,
      'throttledLastHour', 0,
      'authLastHour', 0,
      'lastErrorAt', null,
      'lastErrors', '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.get_banese_reconciliation_error_summary()
  from public, anon;
grant execute on function public.get_banese_reconciliation_error_summary()
  to authenticated, service_role;

comment on function public.get_banese_reconciliation_error_summary() is
  'Resumo sanitizado de erros Banese da última hora com IDs heterogêneos normalizados como texto.';

commit;
