-- Run after the individual admission migrations. Only synthetic temporary
-- objects are written; the production functions run against fixture relations.
begin;
create temporary table individual_enrollment (like public.matriculas) on commit drop;
create temporary table individual_class (like public.turmas) on commit drop;
create temporary table individual_course (like public.cursos) on commit drop;
create temporary table individual_config (like public.matriculas_tecnicas_financeiro_config) on commit drop;
create temporary table individual_run (like internal_academic.technical_manual_cycle_runs) on commit drop;
create temporary table individual_policy (like internal_academic.technical_manual_cycle_policies) on commit drop;
create temporary table individual_receivable (like public.contas_receber) on commit drop;
create temporary table individual_scope (turma_id uuid,phase text) on commit drop;
create temporary table individual_source (matricula_id uuid) on commit drop;
create temporary table individual_link (matricula_id uuid) on commit drop;
create temporary table individual_evidence (matricula_id uuid) on commit drop;
create temporary table individual_coverage (matricula_id uuid) on commit drop;
create temporary table individual_fallback(state jsonb) on commit drop;
insert into individual_fallback values('{"habilitado":false,"estado":"NAO_HABILITADO"}');

do $fixture_nullable$
declare v_column record;
begin
  for v_column in select c.relname,a.attname from pg_class c
    join pg_attribute a on a.attrelid=c.oid
    where c.relnamespace=pg_my_temp_schema() and c.relname like 'individual_%'
      and a.attnum>0 and a.attnotnull
  loop
    execute format('alter table pg_temp.%I alter column %I drop not null',
      v_column.relname,v_column.attname);
  end loop;
end;
$fixture_nullable$;

create function pg_temp.individual_policy_projection(p_id uuid) returns jsonb
language sql as $$ select '{"habilitado":false,"fingerprint":null}'::jsonb $$;
create function pg_temp.individual_rule(p_id uuid) returns jsonb
language sql as $$ select '{"cobranca":{"mensalidade":{"quantidade":12}}}'::jsonb $$;
create function pg_temp.individual_old_state(p_id uuid) returns jsonb
language sql as $$ select state from pg_temp.individual_fallback $$;
create function pg_temp.individual_local_fee_summary(p_id uuid) returns jsonb
language sql as $$ select null::jsonb $$;
create function pg_temp.individual_local_fee_complete(p_row pg_temp.individual_receivable) returns boolean
language sql as $$ select false $$;

do $copy_functions$
declare v_name text; v_source_name text; v_definition text; v_pair text[];
begin
  foreach v_name in array array[
    'internal_academic.is_manual_technical_enrollment(uuid)',
    'internal_academic.technical_cycle_history_outside_enrollment(uuid)',
    'internal_academic.technical_local_cycle_eligible(uuid)',
    'internal_academic.technical_manual_cycle_state_before_external_history(uuid)',
    'internal_academic.technical_manual_cycle_state_before_local_fee(uuid)',
    'internal_academic.technical_manual_cycle_state(uuid)'
  ] loop
    -- Entry/continuity wrappers are covered by their own transactional tests.
    -- Keep this fixture focused on the live individual-admission implementation.
    v_source_name:=v_name;
    if v_name='internal_academic.technical_local_cycle_eligible(uuid)'
      and to_regprocedure('internal_academic.technical_local_cycle_eligible_before_internal_transfer(uuid)') is not null then
      v_source_name:='internal_academic.technical_local_cycle_eligible_before_internal_transfer(uuid)';
    elsif v_name='internal_academic.technical_manual_cycle_state(uuid)'
      and to_regprocedure('internal_academic.technical_manual_cycle_state_before_transfer_entry(uuid)') is not null then
      v_source_name:='internal_academic.technical_manual_cycle_state_before_transfer_entry(uuid)';
    end if;
    v_definition:=pg_get_functiondef(v_source_name::regprocedure);
    v_definition:=replace(v_definition,split_part(v_source_name,'(',1),split_part(v_name,'(',1));
    foreach v_pair slice 1 in array array[
      ['internal_academic.technical_manual_cycle_state_before_external_history','pg_temp.individual_base_state'],
      ['internal_academic.technical_manual_cycle_state_before_individual_admission','pg_temp.individual_old_state'],
      ['internal_academic.technical_manual_cycle_state_before_local_fee','pg_temp.individual_state_before_local_fee'],
      ['internal_academic.technical_manual_cycle_state','pg_temp.individual_state'],
      ['internal_academic.manual_cycle_local_fee_summary','pg_temp.individual_local_fee_summary'],
      ['internal_academic.manual_cycle_local_receivable_complete','pg_temp.individual_local_fee_complete'],
      ['internal_academic.technical_manual_cycle_policy_projection','pg_temp.individual_policy_projection'],
      ['internal_academic.technical_financial_effective_rule','pg_temp.individual_rule'],
      ['internal_academic.is_manual_technical_enrollment','pg_temp.individual_is_technical'],
      ['internal_academic.technical_cycle_history_outside_enrollment','pg_temp.individual_history_elsewhere'],
      ['internal_academic.technical_local_cycle_eligible','pg_temp.individual_eligible'],
      ['internal_academic.technical_manual_cycle_policies','pg_temp.individual_policy'],
      ['internal_academic.technical_manual_cycle_runs','pg_temp.individual_run'],
      ['internal_academic.technical_external_cycle_coverage','pg_temp.individual_coverage'],
      ['internal_proesc.enrollment_cycle_evidence','pg_temp.individual_evidence'],
      ['internal_proesc.enrollment_sources','pg_temp.individual_source'],
      ['internal_proesc.obligation_links','pg_temp.individual_link'],
      ['internal_proesc.class_scopes','pg_temp.individual_scope'],
      ['public.matriculas_tecnicas_financeiro_config','pg_temp.individual_config'],
      ['public.contas_receber','pg_temp.individual_receivable'],
      ['public.matriculas','pg_temp.individual_enrollment'],
      ['public.turmas','pg_temp.individual_class'],
      ['public.cursos','pg_temp.individual_course']
    ] loop
      v_definition:=replace(v_definition,v_pair[1],v_pair[2]);
    end loop;
    execute v_definition;
  end loop;
end;
$copy_functions$;

do $individual_contract$
declare
  v_person uuid:='a0000000-0000-0000-0000-000000000001';
  v_enrollment uuid:='a0000000-0000-0000-0000-000000000002';
  v_origin uuid:='a0000000-0000-0000-0000-000000000003';
  v_class uuid:='a0000000-0000-0000-0000-000000000004';
  v_course uuid:='a0000000-0000-0000-0000-000000000005';
  v_receivable uuid:='a0000000-0000-0000-0000-000000000006';
  v_request uuid:='a0000000-0000-0000-0000-000000000007';
  v_state jsonb;
begin
  -- Drop mandatory fixture columns not used by the functions, preserving their
  -- actual types without injecting personal data or triggering production work.
  insert into pg_temp.individual_course(id,nome,modalidade) values(v_course,'SYNTHETIC','TECNICO');
  insert into pg_temp.individual_class(id,codigo,nome,curso_id,polo_id,status)
    values(v_class,'SYNTHETIC','SYNTHETIC',v_course,v_class,'EM_ANDAMENTO');
  insert into pg_temp.individual_enrollment(id,aluno_id,turma_id,status,data_matricula)
    values(v_enrollment,v_person,v_class,'PENDENTE',now());
  insert into pg_temp.individual_config(matricula_id,turma_id,aluno_id,status_financeiro,
    regra_revisao,regra_fingerprint,tentativas,created_at,updated_at)
    values(v_enrollment,v_class,v_person,'PENDENTE',1,repeat('a',64),0,now(),now());
  assert pg_temp.individual_eligible(v_enrollment),'A new student in an ongoing class must qualify';
  v_state:=pg_temp.individual_state(v_enrollment);
  assert v_state->>'estado'='ELEGIVEL' and v_state->>'proximoCicloNumero'='1'
    and v_state->>'cicloBaseHistorico'='0','No class baseline may skip the first individual cycle';
  assert v_state#>>'{politica,fingerprint}' ~ '^[0-9a-f]{64}$','A virtual policy requires a CAS fingerprint';
  assert v_state->>'criterioElegibilidade'='MANUAL_APOS_EMISSAO';
  update pg_temp.individual_enrollment set status='ATIVO';
  assert pg_temp.individual_state(v_enrollment)->>'estado'='ELEGIVEL';
  update pg_temp.individual_enrollment set status='CANCELADO';
  assert pg_temp.individual_state(v_enrollment)#>>'{bloqueio,codigo}'='STATUS_ACADEMICO';
  update pg_temp.individual_enrollment set status='PENDENTE';

  insert into pg_temp.individual_scope values(v_class,'CONFIRMED');
  assert pg_temp.individual_eligible(v_enrollment),'Class scope alone is not an individual import';
  update pg_temp.individual_scope set phase='STAGED';
  assert not pg_temp.individual_eligible(v_enrollment),'An incomplete import scope fails closed';
  update pg_temp.individual_scope set phase='CONFIRMED';
  insert into pg_temp.individual_source values(v_enrollment);
  assert not pg_temp.individual_eligible(v_enrollment),'Imported academic provenance requires external review';
  update pg_temp.individual_fallback set state=
    '{"habilitado":true,"estado":"ELEGIVEL","podeGerar":true,"proximoCicloNumero":2}';
  assert pg_temp.individual_state(v_enrollment)->>'podeGerar'='true',
    'The preexisting verified continuation of this enrollment must retain its own guards';
  update pg_temp.individual_fallback set state=
    '{"habilitado":true,"estado":"ELEGIVEL","podeGerar":true,"proximoCicloNumero":1}';
  assert pg_temp.individual_state(v_enrollment)->>'podeGerar'='false',
    'An enabled class policy must not recreate an imported first cycle';
  delete from pg_temp.individual_source;
  insert into pg_temp.individual_link values(v_enrollment);
  assert not pg_temp.individual_eligible(v_enrollment),'A linked Proesc obligation can never become a new cycle';
  delete from pg_temp.individual_link;
  insert into pg_temp.individual_coverage values(v_enrollment);
  assert not pg_temp.individual_eligible(v_enrollment),'External coverage remains protected';
  delete from pg_temp.individual_coverage;

  insert into pg_temp.individual_enrollment(id,aluno_id,turma_id,status,data_matricula)
    values(v_origin,v_person,v_class,'TRANSFERIDO',now());
  update pg_temp.individual_enrollment set origem_matricula_id=v_origin where id=v_enrollment;
  assert pg_temp.individual_eligible(v_enrollment),'Transfer with no financial history starts its own first cycle';
  insert into pg_temp.individual_source values(v_origin);
  assert not pg_temp.individual_eligible(v_enrollment),'Transfer cannot discard original Proesc provenance';
  assert pg_temp.individual_state(v_enrollment)->>'podeGerar'='false',
    'A preexisting manual policy cannot bypass the transfer history guard';
  delete from pg_temp.individual_source;

  insert into pg_temp.individual_receivable(id,polo_id,descricao,valor,data_vencimento,status,
    categoria,cliente_id,matricula_id,turma_id,tipo_lancamento,parcela_numero,created_at)
    values(v_receivable,v_class,'SYNTHETIC',100,current_date+30,'PAGO','MENSALIDADE',
      v_person,v_origin,v_class,'PARCELA',1,now());
  assert not pg_temp.individual_eligible(v_enrollment),'A paid obligation at the origin still prevents duplicate cycles';
  update pg_temp.individual_receivable set status='CANCELADO',matricula_id=null;
  assert not pg_temp.individual_eligible(v_enrollment),'Detached/cancelled personal debt must not disappear from the check';
  update pg_temp.individual_fallback set state=
    '{"habilitado":true,"estado":"ELEGIVEL","podeGerar":true,"proximoCicloNumero":2}';
  v_state:=pg_temp.individual_state(v_enrollment);
  assert v_state->>'estado'='PROTEGIDO_EXISTENTE' and v_state->>'habilitado'='true',
    'Existing history cannot fall back to the legacy new-charge interface';

  insert into pg_temp.individual_run(matricula_id,turma_id,cycle_number,state,request_id,
    item_count,expected_installment_count,total_amount,receivable_ids,created_at,completed_at)
    values(v_enrollment,v_class,1,'LOCAL_CREATED',v_request,1,1,100,array[v_receivable],now(),now());
  update pg_temp.individual_receivable set matricula_id=v_enrollment,status='PENDENTE',
    regra_financeira_tecnica_snapshot=jsonb_build_object('cicloManual',jsonb_build_object(
      'requestId',v_request,'cicloNumero',1)),gateway_submission_status='API_AMBIGUOUS';
  assert pg_temp.individual_eligible(v_enrollment),'Own canonical first-cycle rows retain the local lane';
  v_state:=pg_temp.individual_state(v_enrollment);
  assert v_state#>>'{bloqueio,codigo}'='CICLO_ANTERIOR_EMISSAO_PENDENTE',
    'Ambiguous first-cycle issuance must prevent cycle two';
  update pg_temp.individual_receivable set gateway_submission_status='API_REVIEW';
  assert pg_temp.individual_state(v_enrollment)->>'podeGerar'='false';
  update pg_temp.individual_receivable set gateway_submission_status='API_REGISTERED';
  v_state:=pg_temp.individual_state(v_enrollment);
  assert v_state->>'podeGerar'='true' and v_state->>'proximoCicloNumero'='2',
    'A fully issued local cycle permits explicit cycle two without payment inference';
  update pg_temp.individual_receivable set status='CANCELADO';
  assert pg_temp.individual_state(v_enrollment)->>'podeGerar'='false',
    'A cancelled first-cycle obligation must be reviewed before cycle two';
  update pg_temp.individual_receivable set status='PENDENTE';
  update pg_temp.individual_receivable set regra_financeira_tecnica_snapshot='{}';
  assert not pg_temp.individual_eligible(v_enrollment),'Run membership alone cannot bless a foreign receipt';

  update pg_temp.individual_course set modalidade='EAD';
  assert not pg_temp.individual_is_technical(v_enrollment) and not pg_temp.individual_eligible(v_enrollment);
  update pg_temp.individual_course set modalidade='LIVRE';
  assert not pg_temp.individual_is_technical(v_enrollment) and not pg_temp.individual_eligible(v_enrollment);
end;
$individual_contract$;
rollback;
