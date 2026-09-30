-- A confirmed imported first cycle is durable local history. Proesc remains a
-- read-only provenance source; it must not be an online dependency for the
-- preview or Banese issuance of the next cycle.
begin;

create or replace function internal_proesc.assert_fresh_cycle_generation(
  p_matricula_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if internal_academic.technical_local_cycle_eligible(p_matricula_id)
    or internal_proesc.has_confirmed_first_cycle_only(p_matricula_id)
  then
    return;
  end if;

  perform internal_proesc.assert_fresh_cycle_generation_before_individual_admission(
    p_matricula_id
  );
end;
$function$;

alter function internal_academic.technical_manual_cycle_state(uuid)
  rename to technical_manual_cycle_state_before_durable_imported_history;

create function internal_academic.technical_manual_cycle_state(
  p_matricula_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_state jsonb;
begin
  v_state := internal_academic
    .technical_manual_cycle_state_before_durable_imported_history(
      p_matricula_id
    );

  if internal_proesc.has_confirmed_first_cycle_only(p_matricula_id) then
    return v_state - 'conferenciaProesc';
  end if;

  return v_state;
end;
$function$;

revoke all on function internal_proesc.assert_fresh_cycle_generation(uuid),
  internal_academic.technical_manual_cycle_state(uuid),
  internal_academic
    .technical_manual_cycle_state_before_durable_imported_history(uuid)
  from public, anon, authenticated, service_role;

comment on function internal_proesc.assert_fresh_cycle_generation(uuid) is
  'Allows a locally confirmed imported C1 to preview and issue its next cycle without an online Proesc refresh; unresolved or external-C2 histories remain protected.';

comment on function internal_academic.technical_manual_cycle_state(uuid) is
  'Hides the obsolete online Proesc review flag after durable local C1 confirmation.';

notify pgrst, 'reload schema';
commit;
