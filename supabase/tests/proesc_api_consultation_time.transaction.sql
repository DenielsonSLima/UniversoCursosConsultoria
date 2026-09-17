-- Via MCP: app.test.receivable_ids recebe array UUID dos casos revisados.
-- Cria somente clones pg_temp e reverte a transação, sem alterar recebimentos.
begin isolation level repeatable read;
set local statement_timeout = '20s';
set local lock_timeout = '2s';
create temporary table api_consultation_test_results (scenario text, passed boolean);
do $$
declare
  v_definition text := pg_get_functiondef('internal_proesc.reconciliation_item(uuid,text,text)'::regprocedure);
  v_old_json text := $old$'observedAt',evidence.observed_at,$old$;
  v_new_json text := $new$'observedAt',evidence.observed_at,
      'apiConsultedAt',case when evidence.evidence_kind in ('API_SINGLE_PAYMENT','API_PAYMENT_TOTAL')
        then evidence.observed_at end,$new$;
  v_old_columns text := 'f.source_status,f.verification,f.observed_at';
  v_new_columns text := 'f.source_status,f.verification,f.observed_at,f.evidence_kind';
begin
  if position(v_new_json in v_definition)>0 then
    v_definition := replace(replace(v_definition,v_new_json,v_old_json),v_new_columns,v_old_columns);
  end if;
  if (length(v_definition)-length(replace(v_definition,v_old_json,'')))/length(v_old_json) <> 1
     or (length(v_definition)-length(replace(v_definition,v_old_columns,'')))/length(v_old_columns) <> 2 then
    raise exception 'Projeção mudou; revisar fixture.';
  end if;
  execute replace(v_definition,'internal_proesc.reconciliation_item(', 'pg_temp.consultation_before(');
  v_definition := replace(replace(v_definition,v_old_json,v_new_json),v_old_columns,v_new_columns);
  execute replace(v_definition,'internal_proesc.reconciliation_item(', 'pg_temp.consultation_after(');
  -- A fixture altera só o tipo/estado da evidência retornada pela lateral.
  -- Nenhuma informação financeira do recebível ou resolver é alterada.
  v_definition := replace(v_definition,v_new_columns,$fixture$f.source_status,
      current_setting('app.test.verification') as verification,
      case when current_setting('app.test.no_observation')='true' then null::timestamptz
        else f.observed_at end as observed_at,
      current_setting('app.test.evidence_kind') as evidence_kind$fixture$);
  execute replace(v_definition,'internal_proesc.reconciliation_item(', 'pg_temp.consultation_fixture(');
end;
$$;
do $$
declare
  v_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_expected timestamptz;
  v_kind text;
  v_case record;
begin
  foreach v_id in array current_setting('app.test.receivable_ids')::uuid[] loop
    v_before := pg_temp.consultation_before(v_id,'PROESC','PROESC');
    v_after := pg_temp.consultation_after(v_id,'PROESC','PROESC');
    select f.evidence_kind,f.observed_at into strict v_kind,v_expected
    from internal_proesc.obligation_links l join internal_proesc.financial_snapshots f on f.link_id=l.id
    where l.receivable_id=v_id order by f.observed_at desc,f.recorded_at desc,f.id desc limit 1;
    if (v_after#-'{proesc_evidence,apiConsultedAt}') is distinct from v_before
       or (v_after#>>'{proesc_evidence,apiConsultedAt}')::timestamptz is distinct from
         (case when v_kind in ('API_SINGLE_PAYMENT','API_PAYMENT_TOTAL') then v_expected end) then
      raise exception 'Campo de consulta divergiu da evidência ou alterou outro dado.';
    end if;
    insert into api_consultation_test_results values('real_'||v_kind,true);
  end loop;
  v_id := (current_setting('app.test.receivable_ids')::uuid[])[1];
  for v_case in select * from (values
    ('API_SINGLE_PAYMENT','VERIFIED','false',true),
    ('API_PAYMENT_TOTAL','VERIFIED','false',true),
    ('API_SINGLE_PAYMENT','REVIEW','false',true),
    ('API_PAYMENT_TOTAL','REVIEW','false',true),
    ('PORTAL_CONFIRMED','VERIFIED','false',false),
    ('UNRESOLVED','REVIEW','false',false),
    ('UNKNOWN','VERIFIED','false',false),
    ('API_PAYMENT_TOTAL','VERIFIED','true',false)
  ) cases(kind,verification,no_observation,disclose) loop
    perform set_config('app.test.evidence_kind',v_case.kind,true);
    perform set_config('app.test.verification',v_case.verification,true);
    perform set_config('app.test.no_observation',v_case.no_observation,true);
    v_before := pg_temp.consultation_before(v_id,'PROESC','PROESC');
    v_after := pg_temp.consultation_fixture(v_id,'PROESC','PROESC');
    if (v_after-array['proesc_evidence','source_verification']) is distinct from
       (v_before-array['proesc_evidence','source_verification'])
       or v_after->>'source_verification' is distinct from v_case.verification
       or (v_after#>>'{proesc_evidence,apiConsultedAt}' is not null) is distinct from v_case.disclose
       or (v_case.disclose and v_after#>>'{proesc_evidence,apiConsultedAt}' is distinct from
           v_after#>>'{proesc_evidence,observedAt}') then
      raise exception 'Consulta API/baixa/composição foi inferida incorretamente: %',v_case.kind;
    end if;
    insert into api_consultation_test_results values('projection_'||v_case.kind||'_'||v_case.verification||'_'||v_case.no_observation,true);
  end loop;
  -- Outras origens continuam sem evidência Proesc ou consulta sintetizada.
  v_after := pg_temp.consultation_after(v_id,'OTHER','HISTORICO_MIGRADO');
  if v_after->>'proesc_evidence' is not null then raise exception 'Evidência Proesc vazou para outra origem.'; end if;
  insert into api_consultation_test_results values('other_source_no_proesc_consultation',true);
end;
$$;
select * from api_consultation_test_results order by scenario;
rollback;
