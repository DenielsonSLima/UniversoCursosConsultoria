-- Run after the migrations and a confirmed link, inside an outer rollback rehearsal.
-- Every synthetic observation/payment below is also rolled back by this DO block.
-- No student identifiers or production values are embedded in the test source.
do $proesc_contract$
declare
  v_actor uuid;
  v_link internal_proesc.obligation_links%rowtype;
  v_row public.contas_receber%rowtype;
  v_original jsonb;
  v_payload jsonb;
  v_lines jsonb;
  v_result jsonb;
  v_snapshot uuid;
  v_request uuid;
  v_hash text;
  v_cents bigint;
  v_jobs bigint;
  v_events bigint;
  v_claims text := current_setting('request.jwt.claims', true);
begin
  begin
    select u.id into strict v_actor from public.usuarios_sistema u
    left join public.perfis_acesso profile on profile.id = u.perfil_acesso_id
    where lower(u.status) in ('ativo','active') and lower(u.perfil) = 'gestor'
      and (case when profile.id is not null and not coalesce(u.personalizar_permissoes,false)
        then profile.permissoes else u.permissoes end) @> '{"allPolos":true,"modules":["configuracoes"]}'::jsonb
      and coalesce(to_jsonb(u) -> 'polo_ids','[]'::jsonb) in ('[]'::jsonb,'null'::jsonb)
      and btrim(coalesce(to_jsonb(u) ->> 'context',''))
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    order by u.id limit 1;
    perform set_config('request.jwt.claims',jsonb_build_object('role','service_role','sub',v_actor)::text,true);
    select link.* into strict v_link from internal_proesc.obligation_links link
    join public.contas_receber receipt on receipt.id = link.receivable_id
    where receipt.status <> 'CANCELADO' and receipt.valor >= 1 order by link.id limit 1;
    select * into strict v_row from public.contas_receber where id = v_link.receivable_id;
    v_original := to_jsonb(v_row);
    v_cents := round(v_row.valor * 100)::bigint;
    select count(*) into v_jobs from public.push_notification_jobs;
    select count(*) into v_events from internal_proesc.reconciliation_events;
    select jsonb_agg(jsonb_build_object('blockCode','2',
      'amountCents',case when n = 10 then v_cents - (v_cents / 10) * 9 else v_cents / 10 end,
      'paymentDate',(timezone('America/Maceio',now()))::date,'cancelled',false,
      'renegotiation',false,'paymentMethod','Cartão','sourceMonth',extract(month from now())::int,
      'sourceYear',extract(year from now())::int) order by n)
    into v_lines from generate_series(1,10) n;
    v_lines := jsonb_build_array(jsonb_build_object('blockCode','1','amountCents',v_cents,
      'paymentDate',null,'cancelled',false)) || v_lines;
    v_payload := jsonb_build_object('linkId',v_link.id,'observedAt',now()+interval '2 minutes',
      'principalCents',v_cents,'receivedCents',v_cents,'paymentDate',(timezone('America/Maceio',now()))::date,
      'sourceStatus','PAID','verification','VERIFIED','evidenceKind','API_PAYMENT_TOTAL',
      'sourceFingerprint',encode(extensions.digest(v_lines::text,'sha256'),'hex'),'lines',v_lines);
    v_request := gen_random_uuid();
    v_result := public.proesc_record_financial_snapshot_service(v_actor,v_request,v_payload);
    assert v_result ->> 'verification' = 'VERIFIED', 'Ten block-2 installments must verify by their total';
    v_snapshot := (v_result ->> 'snapshotId')::uuid;
    assert (select jsonb_array_length(accounting_lines) = 11 and components -> 'discountCents' = 'null'::jsonb
      from internal_proesc.financial_snapshots where id = v_snapshot), 'Preserve repetitions; never manufacture discount';
    v_result := public.proesc_record_financial_snapshot_service(v_actor,v_request,v_payload);
    assert v_result -> 'replayed' = 'true'::jsonb, 'Identical request must replay';
    begin
      perform public.proesc_record_financial_snapshot_service(v_actor,v_request,
        v_payload || jsonb_build_object('receivedCents',v_cents-1));
      raise exception 'Changed requestId payload was accepted';
    exception when sqlstate '22023' then null; end;
    perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
    begin
      perform public.proesc_record_financial_snapshot_service(v_actor,v_request,v_payload);
      raise exception 'Replay bypassed authorization';
    exception when sqlstate '42501' then null; end;
    perform set_config('request.jwt.claims',jsonb_build_object('role','service_role','sub',v_actor)::text,true);
    v_hash := internal_proesc.receivable_fingerprint(v_row);
    begin
      perform public.proesc_apply_financial_snapshot_service(v_actor,gen_random_uuid(),jsonb_build_object(
        'snapshotId',v_snapshot,'expectedBefore',v_hash,'mode','AUTO'));
      raise exception 'AUTO without a valid runtime lease was accepted';
    exception when sqlstate '42501' then null; end;
    begin
      perform public.proesc_apply_financial_snapshot_service(v_actor,gen_random_uuid(),jsonb_build_object(
        'snapshotId',v_snapshot,'expectedBefore',repeat('0',64),'mode','IMPORT'));
      raise exception 'Stale CAS was accepted';
    exception when sqlstate '40001' then null; end;
    v_request := gen_random_uuid();
    v_result := public.proesc_apply_financial_snapshot_service(v_actor,v_request,jsonb_build_object(
      'snapshotId',v_snapshot,'expectedBefore',v_hash,'mode','IMPORT'));
    assert v_result ->> 'result' in ('APPLIED','UNCHANGED'), 'Verified source payment must supersede stale local status';
    select * into strict v_row from public.contas_receber where id = v_link.receivable_id;
    assert v_row.status = 'PAGO' and v_row.valor_pago = v_cents::numeric/100, 'Canonical paid amount mismatch';
    assert (to_jsonb(v_row)-array['status','valor_pago','data_pagamento','conta_bancaria_id','updated_at'])
      = (v_original-array['status','valor_pago','data_pagamento','conta_bancaria_id','updated_at']), 'Unexpected receipt mutation';
    assert (select count(*) = v_jobs from public.push_notification_jobs), 'Historical import emitted a push';
    assert (select count(*) = v_events + 1 from internal_proesc.reconciliation_events), 'Apply audit missing';
    v_result := public.proesc_apply_financial_snapshot_service(v_actor,v_request,jsonb_build_object(
      'snapshotId',v_snapshot,'expectedBefore',v_hash,'mode','IMPORT'));
    assert v_result -> 'replayed' = 'true'::jsonb, 'Apply must replay despite its stale original CAS';
    begin
      update public.contas_receber set valor_pago = valor_pago + 1 where id = v_link.receivable_id;
      raise exception 'Unclaimed direct payment update was accepted';
    exception when sqlstate '42501' then null; end;
    begin
      update public.contas_receber set valor = valor + 1 where id = v_link.receivable_id;
      raise exception 'Linked principal mutation was accepted';
    exception when sqlstate '42501' then null; end;
    -- A newer API total may correct an already-paid amount without rewriting gross principal.
    v_lines := jsonb_build_array(jsonb_build_object('blockCode','1','amountCents',v_cents,'cancelled',false),
      jsonb_build_object('blockCode','2','amountCents',50,'cancelled',false,
        'paymentDate',(timezone('America/Maceio',now()))::date));
    v_payload := v_payload || jsonb_build_object('observedAt',now()+interval '3 minutes',
      'receivedCents',50,'lines',v_lines,'sourceFingerprint',encode(extensions.digest(v_lines::text,'sha256'),'hex'));
    v_result := public.proesc_record_financial_snapshot_service(v_actor,gen_random_uuid(),v_payload);
    assert v_result ->> 'verification' = 'VERIFIED', 'API partial receipt must retain its actual amount';
    v_snapshot := (v_result ->> 'snapshotId')::uuid;
    v_result := public.proesc_apply_financial_snapshot_service(v_actor,gen_random_uuid(),jsonb_build_object(
      'snapshotId',v_snapshot,'expectedBefore',internal_proesc.receivable_fingerprint(v_row),'mode','CORRECTION'));
    assert v_result ->> 'result' = 'APPLIED', 'Newer verified API must correct stale paid amount';
    select * into strict v_row from public.contas_receber where id = v_link.receivable_id;
    assert v_row.valor_pago = 0.50 and v_row.valor = v_cents::numeric/100, 'Gross must differ from actual partial receipt';
    -- Multiplicity is valid; divergent payment dates, totals and cancellation remain reviewable.
    v_payload := v_payload || jsonb_build_object('observedAt',now()+interval '4 minutes',
      'receivedCents',51,'sourceFingerprint',repeat('a',64));
    v_result := public.proesc_record_financial_snapshot_service(v_actor,gen_random_uuid(),v_payload);
    assert v_result ->> 'verification' = 'REVIEW', 'Mismatched block-2 sum must not verify';
    v_payload := v_payload || jsonb_build_object('sourceFingerprint',repeat('b',64),'receivedCents',50,
      'lines',jsonb_set(v_lines,'{1,renegotiation}','true'::jsonb));
    v_result := public.proesc_record_financial_snapshot_service(v_actor,gen_random_uuid(),v_payload);
    assert v_result ->> 'verification' = 'REVIEW', 'Renegotiation requires review';
    v_payload := v_payload || jsonb_build_object('sourceFingerprint',repeat('c',64),
      'lines',jsonb_set(v_lines,'{1,paymentDate}',to_jsonb((timezone('America/Maceio',now()))::date - 1)));
    v_result := public.proesc_record_financial_snapshot_service(v_actor,gen_random_uuid(),v_payload);
    assert v_result ->> 'verification' = 'REVIEW', 'Divergent payment date must not verify';
    v_payload := v_payload || jsonb_build_object('sourceFingerprint',repeat('d',64),
      'sourceStatus','OPEN','receivedCents',null,'paymentDate',null,'lines','[]'::jsonb,
      'evidenceKind','PORTAL_CONFIRMED');
    v_result := public.proesc_record_financial_snapshot_service(v_actor,gen_random_uuid(),v_payload);
    v_result := public.proesc_apply_financial_snapshot_service(v_actor,gen_random_uuid(),jsonb_build_object(
      'snapshotId',v_result ->> 'snapshotId','expectedBefore',internal_proesc.receivable_fingerprint(v_row),'mode','IMPORT'));
    assert v_result ->> 'result' = 'REVIEW' and v_result ->> 'reviewReason' = 'AUSENCIA_NAO_REVERTE_PAGAMENTO',
      'Absence of a payment in one observation month must never reopen a paid receipt';
    raise exception 'rollback successful Proesc assertions' using errcode = 'PT999';
  exception when sqlstate 'PT999' then null;
  end;
  assert (select to_jsonb(receipt) = v_original from public.contas_receber receipt where id = v_link.receivable_id),
    'The rehearsal did not restore the original receipt';
  perform set_config('request.jwt.claims',coalesce(v_claims,''),true);
  raise notice 'Proesc contract: multiset payment total, canonical correction, CAS, authorization, lease and rollback passed';
end;
$proesc_contract$;
