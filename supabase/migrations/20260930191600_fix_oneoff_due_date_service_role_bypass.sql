begin;
set local lock_timeout = '5s';

do $guard$
declare v_definition text := pg_get_functiondef(
  'internal_academic.technical_manual_due_date_correction_bypass_valid(uuid)'::regprocedure);
begin
  if md5(v_definition) <> '071c678b7380d5fd477464534e903ad8'
    or position(
      'technical_manual_banese_due_date_overlay' in v_definition) = 0
    or position('remote_cancel_situation_code = 5' in v_definition) = 0
    or position('to_jsonb(receivable) = overlay.receivable_pre_snapshot' in
      v_definition) = 0
  then
    raise exception 'Bypass one-off de vencimento divergiu; migration abortada.';
  end if;
end;
$guard$;

-- PostgREST/Supabase expõe o papel pelo claim consolidado lido por auth.role().
-- O GUC legado request.jwt.claim.role pode ficar vazio mesmo com a chamada
-- autenticada pela service role e bloqueava o reset depois da baixa confirmada.
create or replace function
internal_academic.technical_manual_due_date_correction_bypass_valid(
  p_receivable_id uuid
)
returns boolean language sql stable security definer set search_path = '' as $function$
  select (
    coalesce((select auth.role()), '') = 'service_role'
    or session_user in ('postgres', 'supabase_admin', 'service_role')
  ) and exists (
    select 1
    from internal_academic.technical_manual_banese_due_date_overlay overlay
    join internal_academic.technical_manual_banese_reissue_jobs job
      on job.receivable_id = overlay.receivable_id
     and job.recovery_request_id = overlay.authorization_request_id
     and job.cycle_request_id = overlay.cycle_request_id
    join internal_academic.technical_manual_banese_reissue_archive archive
      on archive.job_id = job.id
     and archive.receivable_id = overlay.receivable_id
     and archive.recovery_request_id = overlay.authorization_request_id
    join public.contas_receber receivable
      on receivable.id = overlay.receivable_id
    where overlay.receivable_id = p_receivable_id
      and overlay.correction_request_id::text = current_setting(
        'app.technical_manual_due_date_correction_id', true)
      and job.id::text = current_setting(
        'app.technical_manual_banese_reissue_job_id', true)
      and job.recovery_request_id::text = current_setting(
        'app.technical_manual_banese_reissue_request_id', true)
      and job.lease_token::text = current_setting(
        'app.technical_manual_banese_reissue_lease_token', true)
      and job.status = 'CANCEL_CONFIRMED'
      and job.lease_valid_until > clock_timestamp()
      and archive.remote_cancel_situation_code = 5
      and to_jsonb(receivable) = overlay.receivable_pre_snapshot
  );
$function$;

revoke all on function
  internal_academic.technical_manual_due_date_correction_bypass_valid(uuid)
  from public, anon, authenticated, service_role;

commit;
