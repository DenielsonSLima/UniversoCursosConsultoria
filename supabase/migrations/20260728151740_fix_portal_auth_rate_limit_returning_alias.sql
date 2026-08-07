-- Versão registrada pelo MCP Supabase: 20260728151740.
begin;

create or replace function public.consume_portal_auth_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean, retry_after_seconds integer)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window interval;
begin
  if p_bucket_key is null
    or length(p_bucket_key) < 16
    or length(p_bucket_key) > 200
    or p_limit < 1
    or p_limit > 1000
    or p_window_seconds < 1
    or p_window_seconds > 86400 then
    raise exception 'Parâmetros de limitação inválidos.';
  end if;

  v_window := make_interval(secs => p_window_seconds);

  if random() < 0.01 then
    delete from public.portal_auth_rate_limits
    where updated_at < v_now - interval '7 days';
  end if;

  return query
  insert into public.portal_auth_rate_limits as limits (
    bucket_key,
    window_started_at,
    attempt_count,
    updated_at
  )
  values (p_bucket_key, v_now, 1, v_now)
  on conflict (bucket_key) do update
  set window_started_at = case
        when limits.window_started_at <= v_now - v_window then v_now
        else limits.window_started_at
      end,
      attempt_count = case
        when limits.window_started_at <= v_now - v_window then 1
        else limits.attempt_count + 1
      end,
      updated_at = v_now
  returning
    limits.attempt_count <= p_limit,
    greatest(
      0,
      ceil(extract(epoch from (
        limits.window_started_at + v_window - v_now
      )))::integer
    );
end;
$$;

revoke all on function public.consume_portal_auth_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_portal_auth_rate_limit(text, integer, integer)
  to service_role;

commit;
