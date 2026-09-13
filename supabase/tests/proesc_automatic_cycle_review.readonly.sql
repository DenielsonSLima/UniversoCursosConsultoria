-- Run through MCP Supabase after the real worker completes its automatic round.
-- Read-only aggregates: no student identity, token, billing mutation or session forgery.
begin transaction isolation level repeatable read read only;
set local statement_timeout='40s';
with states as materialized (
  select m.id,m.status,c.codigo,
    internal_academic.technical_manual_cycle_state(m.id) cycle_state,
    e.classification,e.evidence_kind,e.source_observed_at,
    exists(select 1 from internal_academic.technical_manual_cycle_runs r
      where r.matricula_id=m.id) as generated_here,
    exists(select 1 from internal_academic.technical_external_cycle_coverage x
      where x.matricula_id=m.id) as existing_coverage,
    coalesce(e.has_external_cycle2,false) as external_cycle2
  from public.matriculas m join public.turmas c on c.id=m.turma_id
  join internal_proesc.class_scopes s on s.turma_id=m.turma_id
  left join internal_proesc.enrollment_cycle_evidence e on e.matricula_id=m.id
  where s.phase='CONFIRMED' and (s.batch_id is not null or s.financial_mode='CICLO1_PROESC')
), per_class as (
  select codigo,count(*) as enrollments,
    count(*) filter(where cycle_state->>'podeGerar'='true') as eligible,
    count(*) filter(where generated_here or existing_coverage or external_cycle2) as protected,
    count(*) filter(where status in('TRANCADO','TRANSFERIDO')) as suspended_or_transferred,
    count(*) filter(where cycle_state->>'podeGerar'='false'
      and not(generated_here or existing_coverage or external_cycle2)
      and status not in('TRANCADO','TRANSFERIDO')) as other_blocked
  from states group by codigo
)
select jsonb_build_object(
  'classes',(select jsonb_agg(to_jsonb(c) order by codigo) from per_class c),
  'enrollments',(select count(*) from states),
  'eligible',(select count(*) from states where cycle_state->>'podeGerar'='true'),
  'protected',(select count(*) from states where generated_here or existing_coverage or external_cycle2),
  'unsafe_inactive_eligible',(select count(*) from states
    where status in('TRANCADO','TRANSFERIDO','CANCELADO','CONCLUIDO')
      and cycle_state->>'podeGerar'='true'),
  'unsafe_existing_eligible',(select count(*) from states
    where (generated_here or existing_coverage or external_cycle2) and cycle_state->>'podeGerar'='true'),
  'eligible_without_confirmed_c1',(select count(*) from states
    where cycle_state->>'podeGerar'='true' and classification is distinct from 'C1'),
  'missing_from_completed_round',(select count(*) from states s
    where not s.id=any(coalesce((select completed_ids from internal_proesc.cycle_review_runtime where id),array[]::uuid[]))),
  'worker',(select jsonb_build_object('enabled',enabled,'round_active',round_active,
    'completed',cardinality(completed_ids),'last_finished_at',last_finished_at,
    'next_due_at',next_due_at,'last_result',last_result)
    from internal_proesc.cycle_review_runtime where id)
) as automatic_cycle_review_audit;
rollback;
