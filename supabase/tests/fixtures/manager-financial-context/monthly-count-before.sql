-- READ-ONLY reference fetched 2026-10-27 11:44-11:45 UTC. Not a migration.
CREATE OR REPLACE FUNCTION internal_academic.technical_manual_monthly_count(p_matricula_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select count(*)::integer from public.contas_receber r
  where r.matricula_id = p_matricula_id and r.tipo_lancamento = 'PARCELA'
    and r.status <> 'CANCELADO'
    and not exists (
      select 1 from internal_academic.technical_manual_cycle_runs run
      where run.matricula_id = p_matricula_id and run.cycle_number = 2
        and run.state = 'GENERATING' and run.completed_at is null
        and run.request_id is not null
        and coalesce(run.xmin = pg_catalog.pg_current_xact_id_if_assigned()::xid, false)
        and r.regra_financeira_tecnica_snapshot#>>'{cicloManual,requestId}' = run.request_id::text
    );
$function$

