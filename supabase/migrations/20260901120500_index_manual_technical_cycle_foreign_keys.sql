begin;

create index technical_manual_cycle_policies_created_by_idx
  on internal_academic.technical_manual_cycle_policies(created_by)
  where created_by is not null;

create index technical_manual_cycle_runs_created_by_idx
  on internal_academic.technical_manual_cycle_runs(created_by)
  where created_by is not null;

create index technical_manual_receivable_authorizations_run_idx
  on internal_academic.technical_manual_receivable_issuance_authorizations(
    matricula_id, cycle_number
  );

create index technical_manual_receivable_authorizations_actor_idx
  on internal_academic.technical_manual_receivable_issuance_authorizations(
    authorized_by
  );

commit;
