CREATE OR REPLACE FUNCTION internal_academic.technical_manual_banese_reissue_bypass_valid(p_receivable_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from internal_academic.technical_manual_banese_reissue_jobs job
    join internal_academic.technical_manual_banese_reissue_archive archive
      on archive.job_id = job.id
    join public.contas_receber receivable
      on receivable.id = job.receivable_id
    join internal_academic.technical_manual_cycle_runs run
      on run.matricula_id = job.matricula_id
      and run.cycle_number = job.cycle_number
    join internal_academic.technical_manual_receivable_issuance_authorizations authz
      on authz.receivable_id = job.receivable_id
      and authz.request_id = job.recovery_request_id
    where (
        coalesce(auth.role(), '') = 'service_role'
        or session_user in ('postgres', 'supabase_admin', 'service_role'))
      and job.id::text = current_setting(
        'app.technical_manual_banese_reissue_job_id', true)
      and job.recovery_request_id::text = current_setting(
        'app.technical_manual_banese_reissue_request_id', true)
      and job.lease_token::text = current_setting(
        'app.technical_manual_banese_reissue_lease_token', true)
      and job.lease_valid_until > clock_timestamp()
      and job.receivable_id = p_receivable_id
      and job.status = 'CANCEL_CONFIRMED'
      and job.expected_receivable_updated_at = receivable.updated_at
      and job.receivable_fingerprint =
        internal_academic.technical_manual_receivable_issuance_fingerprint(
          receivable)
      and archive.receivable_id = job.receivable_id
      and archive.recovery_request_id = job.recovery_request_id
      and archive.canceled_nosso_numero = job.canceled_nosso_numero
      and archive.remote_cancel_situation_code = 5
      and internal_academic.technical_manual_banese_review_cancel_candidate(
        receivable, run, authz, job.recovery_request_id));
$function$

