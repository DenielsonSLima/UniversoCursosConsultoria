-- Impede promoção a partir de execução sem resultado válido e mantém o card
-- "última hora" restrito à mesma janela usada pelo contador.

do $migration$
declare
  v_definition text;
  v_old text := $old$
  elsif v_config.mode = 'AUTOMATIC'
    and now() - v_config.stable_since >= interval '1 hour'
    and v_from_profile < least(v_config.selected_profile_id, 8)
  then
$old$;
  v_new text := $new$
  elsif v_config.mode = 'AUTOMATIC' and v_status <> 'SUCCESS' then
    update public.banese_reconciliation_config
    set state = 'OBSERVING',
        stable_since = now(),
        suspended_reason = null,
        updated_at = now()
    where environment = v_run.environment;
    v_decision := 'Execução sem resultado válido: perfil mantido e contagem de estabilidade reiniciada.';
  elsif v_config.mode = 'AUTOMATIC'
    and v_status = 'SUCCESS'
    and v_checked > 0
    and v_failed = 0
    and v_throttled = 0
    and now() - v_config.stable_since >= interval '1 hour'
    and v_from_profile < least(v_config.selected_profile_id, 8)
  then
$new$;
begin
  select pg_get_functiondef(
    'public.finish_banese_reconciliation_run(uuid,integer,boolean,integer)'::regprocedure
  )
  into v_definition;

  if position(v_old in v_definition) = 0 then
    raise exception 'Não foi possível localizar a regra de promoção Banese esperada.';
  end if;

  execute replace(v_definition, v_old, v_new);
end;
$migration$;

create or replace function public.get_banese_reconciliation_error_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
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

  select active_environment
  into v_environment
  from public.payment_gateway_runtime_config
  limit 1;
  v_environment := coalesce(v_environment, 'sandbox');

  select jsonb_build_object(
    'attemptsLastHour', count(*),
    'throttledLastHour', count(*) filter (where attempt.result = 'THROTTLED'),
    'authLastHour', count(*) filter (where attempt.error_class = 'AUTH'),
    'lastErrorAt', max(attempt.created_at),
    'lastErrors', (
      select coalesce(jsonb_agg(to_jsonb(recent) order by recent.created_at desc), '[]'::jsonb)
      from (
        select id, modality, result, error_class, http_status, created_at
        from public.banese_reconciliation_attempts
        where environment = v_environment
          and result in ('ERROR', 'THROTTLED')
          and created_at >= now() - interval '1 hour'
        order by created_at desc
        limit 5
      ) recent
    )
  )
  into v_result
  from public.banese_reconciliation_attempts attempt
  where attempt.environment = v_environment
    and attempt.result in ('ERROR', 'THROTTLED')
    and attempt.created_at >= now() - interval '1 hour';

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

comment on function public.finish_banese_reconciliation_run(uuid, integer, boolean, integer) is
  'Finaliza a consulta Banese; promoção exige execução válida, amostra real e uma hora sem erros.';
comment on function public.get_banese_reconciliation_error_summary() is
  'Resumo sanitizado restrito aos erros Banese da última hora.';
