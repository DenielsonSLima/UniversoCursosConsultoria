-- No bank calls, no real obligation changes. A Proesc attempt must fail before
-- insertion; all remaining checks are pure projections of records/fixtures.
begin;
set local statement_timeout='30s';
set local lock_timeout='3s';
set local plpgsql.check_asserts='on';
do $test$
declare
  v_row public.contas_receber%rowtype;
  v_cap jsonb;
  v_before bigint;
  v_count integer := 0;
begin
  for v_row in select cr.* from public.contas_receber cr
    join internal_proesc.obligation_links link on link.receivable_id=cr.id
    where cr.gateway_provider is null limit 3
  loop
    v_cap:=internal_academic.receivable_operation_capabilities(v_row);
    assert v_cap->>'sourceSystem'='PROESC';
    assert v_cap->>'canSettle'='false' and v_cap->>'canCancel'='false'
      and v_cap->>'canEmit'='false' and v_cap->>'canOpenExisting'='false';
    select count(*) into v_before from public.receivable_manual_settlements
      where receivable_id=v_row.id;
    begin
      insert into public.receivable_manual_settlements(receivable_id) values(v_row.id);
      raise exception 'A Proesc settlement attempt was accepted';
    exception when insufficient_privilege then
      assert sqlerrm like 'Histórico Proesc é somente consulta.%';
    end;
    assert v_before=(select count(*) from public.receivable_manual_settlements where receivable_id=v_row.id);
    v_count:=v_count+1;
  end loop;
  assert v_count>0,'Proesc evidence fixture unavailable';

  v_row:=jsonb_populate_record(null::public.contas_receber,jsonb_build_object(
    'id','00000000-0000-4000-8000-000000000001','status','PENDENTE',
    'valor',200,'regra_financeira_tecnica_snapshot',jsonb_build_object('destinoCobranca','LOCAL')));
  v_cap:=internal_academic.receivable_operation_capabilities(v_row);
  assert v_cap->>'sourceSystem'='LOCAL' and v_cap->>'canSettle'='true';
  assert v_cap->>'canEmit'='false','LOCAL enrollment never authorizes bank issuance';
  v_row.status:='CANCELADO';
  v_cap:=internal_academic.receivable_operation_capabilities(v_row);
  assert v_cap->>'canSettle'='false' and v_cap->>'canEmit'='false';
  v_row.status:='PENDENTE'; v_row.valor_pago:=1;
  assert internal_academic.receivable_operation_capabilities(v_row)->>'canSettle'='false',
    'Partial payment must not be replaced by a fresh manual settlement';
  v_row.valor_pago:=0; v_row.gateway_provider:='unknown_provider';
  v_cap:=internal_academic.receivable_operation_capabilities(v_row);
  assert v_cap->>'canSettle'='false' and v_cap->>'canEmit'='false'
    and v_cap->>'readOnlyReason' is not null,'Unknown provider must fail closed';
  v_row.gateway_provider:='asaas';
  assert internal_academic.receivable_operation_capabilities(v_row)->>'canSettle'='true',
    'Supported historical Asaas route is preserved';

  assert not has_function_privilege('anon',
    'internal_academic.receivable_operation_capabilities(public.contas_receber)','EXECUTE');
  assert not has_function_privilege('authenticated',
    'internal_academic.receivable_operation_capabilities(public.contas_receber)','EXECUTE');
end;
$test$;
rollback;
