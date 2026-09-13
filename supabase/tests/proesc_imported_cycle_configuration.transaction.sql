-- Root rehearsal composes commercial initialization + continuation + config
-- at the marker, then rolls the whole transaction back. Never run COMMIT here.
begin;
set local request.jwt.claims = '{"role":"service_role"}';

/* __IMPORTED_CYCLE_CONFIGURATION_MIGRATIONS__ */

do $configuration_contract$
declare
  v_row record;
  v_config jsonb;
  v_rule jsonb;
  v_state jsonb;
  v_count integer := 0;
begin
  assert (select count(*)=392 from public.matriculas_tecnicas_financeiro_config c
    join internal_proesc.class_scopes s on s.turma_id=c.turma_id
    where s.batch_id is not null and c.status_financeiro='PENDENTE'
      and c.primeiro_vencimento is null and c.ativar_em is null
      and c.titulo_matricula_id is null and not c.override_ativo
      and c.regra_efetiva_fingerprint ~ '^[0-9a-f]{64}$'),
    'All reviewed imported enrollments must receive pending future configuration';
  for v_row in
    select distinct on (s.class_code) m.id from public.matriculas m
    join internal_proesc.class_scopes s on s.turma_id=m.turma_id
    where s.batch_id is not null and s.phase='CONFIRMED'
      and s.class_code in ('ENF-T35-INT-MAT','ENF-T37-SEM-PDF','ENF-T38-INT-MAT',
        'ENF-T39-SEM-PDF','ENF-T40-INT-MAT','ENF-T41-SEM-AQB',
        'ENF-T43-INT-MAT','ENF-T44-SEM-AQB','ENF-T45-SEM-PDF')
    order by s.class_code,m.id
  loop
    v_count:=v_count+1;
    select to_jsonb(c) into strict v_config from public.matriculas_tecnicas_financeiro_config c
    where c.matricula_id=v_row.id;
    assert v_config->>'status_financeiro'='PENDENTE','Configuration must not activate billing';
    assert v_config->'primeiro_vencimento'='null'::jsonb and v_config->'ativar_em'='null'::jsonb
      and v_config->'titulo_matricula_id'='null'::jsonb,'Configuration invented a due date or title';
    assert v_config->'override_ativo'='false'::jsonb,'Historical rows invented an individual override';
    v_rule:=internal_academic.technical_financial_effective_rule(v_row.id);
    assert v_rule#>>'{cobranca,matricula,valor}'='200.00','Historical enrollment reference changed';
    assert v_rule#>>'{cobranca,rematricula,valor}'='100.00','Renewal fee differs from the user rule';
    assert v_rule#>>'{cobranca,mensalidade,valor}'='279.90'
      and (v_rule#>>'{cobranca,mensalidade,quantidade}')::integer=12,'Monthly rule mismatch';
    assert v_config->>'regra_efetiva_fingerprint'=v_rule#>>'{identidade,efetivaFingerprint}',
      'Individual configuration must bind the effective rule snapshot';
    assert not internal_academic.ensure_imported_technical_cycle_config(v_row.id),
      'Repeated setup must not recreate or reset configuration';
    assert (select to_jsonb(c)=v_config from public.matriculas_tecnicas_financeiro_config c
      where c.matricula_id=v_row.id),'Repeated setup changed configuration';
    v_state:=internal_academic.technical_manual_cycle_state(v_row.id);
    assert v_state->'habilitado'='true'::jsonb,'Imported class policy is missing';
    assert not coalesce((v_state->>'podeGerar')::boolean,false),
      'Configuring prices must not falsely confirm the individual Proesc cycle';
    begin
      perform internal_academic.technical_manual_cycle_preview(v_row.id,1,current_date+30);
      raise exception 'First cycle must never be generated for imported history';
    exception when invalid_parameter_value then null; end;
    begin
      perform internal_academic.technical_manual_cycle_preview(v_row.id,3,current_date+30);
      raise exception 'Third cycle must never be generated';
    exception when invalid_parameter_value then null; end;
    begin
      update public.matriculas_tecnicas_financeiro_config
      set status_financeiro='AGENDADA',ativar_em=now()+interval '1 day'
      where matricula_id=v_row.id;
      raise exception 'Imported configuration accepted automatic activation';
    exception when insufficient_privilege then null; end;
  end loop;
  assert v_count=9,'Every reviewed class needs one complete contract smoke';
  assert not has_function_privilege('authenticated',
    'internal_academic.ensure_imported_technical_cycle_config(uuid)','EXECUTE'),
    'Internal initializer must not be directly callable by a client';
end;
$configuration_contract$;

rollback;
