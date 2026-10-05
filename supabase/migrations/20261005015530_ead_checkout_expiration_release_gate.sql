begin;

-- Classification can ship independently. No new cancellation may start until
-- repurchase and late-settlement recovery have their own executable contracts.
-- This is code readiness, not an operator flag: enabled=true cannot bypass it.
create function internal_contas.ead_expiration_release_ready()
returns boolean language sql immutable set search_path='' as $ready$
  select false;
$ready$;
revoke all on function internal_contas.ead_expiration_release_ready()
  from public,anon,authenticated,service_role;
comment on function internal_contas.ead_expiration_release_ready() is
  'False until separately implemented and validated EAD repurchase, late-payment recovery and visible scoped review contracts. Existing remote intents remain recoverable by GET.';

-- Preserve the original implementations and their ACLs. Fail atomically when
-- an expected anchor has drifted; never silently publish an ungated function.
do $gate$
declare
  v_definition text;
  v_anchor text;
  v_replacement text;
begin
  v_definition:=pg_get_functiondef('public.claim_banese_ead_checkout_expiration(text)'::regprocedure);
  v_anchor:=E'where p_lane=\'ACTION\' and internal_contas.ead_expiration_eligible(c.id)';
  v_replacement:=E'where p_lane=\'ACTION\' and internal_contas.ead_expiration_release_ready()'
    ||E'\n    and internal_contas.ead_expiration_eligible(c.id)';
  if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor)<>1 then
    raise exception 'EAD expiration release gate: new-job anchor drift.';
  end if;
  v_definition:=replace(v_definition,v_anchor,v_replacement);

  v_anchor:='on cfg.environment=j.environment and cfg.enabled';
  v_replacement:='on cfg.environment=j.environment and ('
    ||E'\n        (cfg.enabled and internal_contas.ead_expiration_release_ready())'
    ||E'\n        or j.remote_mutation_started_at is not null or j.canceled_at is not null'
    ||E'\n        or internal_contas.ead_expiration_settlement_is_canonical(j.receivable_id,j.transaction_id))';
  if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor)<>1 then
    raise exception 'EAD expiration release gate: recovery-claim anchor drift.';
  end if;
  v_definition:=replace(v_definition,v_anchor,v_replacement);
  execute v_definition;

  v_definition:=pg_get_functiondef(
    'public.start_banese_ead_checkout_expiration_mutation(uuid,uuid,date,text)'::regprocedure);
  v_anchor:='if internal_contas.ead_expiration_identity(v_c.id) is distinct from v_job.snapshot';
  v_replacement:='if not internal_contas.ead_expiration_release_ready()'
    ||E'\n    or internal_contas.ead_expiration_identity(v_c.id) is distinct from v_job.snapshot';
  if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor)<>1 then
    raise exception 'EAD expiration release gate: remote-intent anchor drift.';
  end if;
  execute replace(v_definition,v_anchor,v_replacement);

  v_definition:=pg_get_functiondef(
    'public.finish_banese_ead_checkout_expiration(uuid,uuid,text,text,integer,integer,text,text,date)'::regprocedure);
  v_anchor:=E'elsif p_result=\'CANCELED\' then\n';
  v_replacement:=E'elsif p_result=\'CANCELED\' then\n'
    ||E'    if not internal_contas.ead_expiration_release_ready()\n'
    ||E'      and v_job.remote_mutation_started_at is null then\n'
    ||E'      raise exception \'Expiração EAD aguarda contratos de recompra e recuperação.\' using errcode=\'PT409\';\n'
    ||E'    end if;\n';
  if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor)<>1 then
    raise exception 'EAD expiration release gate: local-cancellation anchor drift.';
  end if;
  execute replace(v_definition,v_anchor,v_replacement);
end;
$gate$;

commit;
