-- MCP-only proof of resuming a paid canonical title; no bank/Edge calls.
-- Uses an already issued row, changes only transaction-local evidence and reverts all.
begin;
set local statement_timeout='30s';
set local lock_timeout='3s';
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);

do $test$
declare
  v_row public.contas_receber%rowtype; v_paid public.contas_receber%rowtype;
  v_changed public.contas_receber%rowtype; v_transaction public.payment_gateway_transactions%rowtype;
  v_run internal_academic.technical_manual_cycle_runs%rowtype;
  v_before jsonb; v_after jsonb; v_item jsonb; v_patch jsonb;
  v_payload jsonb; v_actor uuid; v_candidate uuid; v_denied boolean;
begin
  select r.* into strict v_row from public.contas_receber r
    join public.matriculas m on m.id=r.matricula_id
    where internal_academic.technical_manual_banese_receivable_complete(r)
      and upper(m.status) in ('ATIVO','PENDENTE')
    order by r.data_vencimento,r.id limit 1;
  select * into strict v_run from internal_academic.technical_manual_cycle_runs
    where v_row.id=any(receivable_ids) and state='LOCAL_CREATED';
  select * into strict v_transaction from public.payment_gateway_transactions where receivable_id=v_row.id;
  v_before:=public.obter_emissao_ciclo_financeiro_tecnico_manual_service(v_run.matricula_id,v_run.cycle_number);

  v_payload:=v_transaction.raw_payload || jsonb_build_object(
    'payments',jsonb_build_array(jsonb_build_object(
      'BancoRecebedor','047','DataPagamento',current_date::text,'ValorPago',v_row.valor)),
    'settlementMethod','NAO_IDENTIFICADO');
  update public.payment_gateway_transactions set remote_status='PAID',raw_payload=v_payload where id=v_transaction.id;
  update public.contas_receber set status='PAGO',gateway_status='PAID',
    data_pagamento=current_date,valor_pago=valor,origem_pagamento='BANESE',
    gateway_settlement_channel='NAO_IDENTIFICADO',gateway_settlement_source='API',
    gateway_settlement_recorded_at=clock_timestamp(),
    gateway_settlement_evidence=jsonb_build_object('classification','NAO_IDENTIFICADO',
      'paymentCount',1,'documentedFields',jsonb_build_array('BancoRecebedor','DataPagamento','ValorPago'))
    where id=v_row.id returning * into v_paid;
  if internal_academic.technical_manual_banese_receivable_complete(v_paid)
    or not internal_academic.technical_manual_banese_receivable_paid_issued(v_paid) then
    raise exception 'Historical issuance and payable completion were not separated';
  end if;
  v_after:=public.obter_emissao_ciclo_financeiro_tecnico_manual_service(v_run.matricula_id,v_run.cycle_number);
  select i into strict v_item from jsonb_array_elements(v_after#>'{ciclo,recebiveis}') i
    where i->>'id'=v_row.id::text;
  if v_item->>'status'<>'PAGO' or v_item->>'emissaoBanese'<>'EMITIDO'
    or v_item->'emissaoHistoricaComprovada' is distinct from 'true'::jsonb
    or v_before#>'{ciclo,emitidosBanese}' is distinct from v_after#>'{ciclo,emitidosBanese}'
    or v_before#>'{ciclo,emRevisao}' is distinct from v_after#>'{ciclo,emRevisao}'
    or v_before#>'{cicloManual,cicloGerado,emitidosBanese}' is null
    or v_before#>'{cicloManual,cicloGerado,emitidosBanese}'
      is distinct from v_after#>'{cicloManual,cicloGerado,emitidosBanese}'
    or v_before#>'{cicloManual,cicloGerado,emRevisao}'
      is distinct from v_after#>'{cicloManual,cicloGerado,emRevisao}'
    or v_before#>'{cicloManual,cicloGerado,pendentesEmissao}'
      is distinct from v_after#>'{cicloManual,cicloGerado,pendentesEmissao}' then
    raise exception 'Paid canonical title lost its historical issuance projection';
  end if;
  if v_before#>'{cicloManual,podeGerar}'='true'::jsonb and (
    v_after#>'{cicloManual,podeGerar}' is distinct from 'true'::jsonb
    or v_before#>'{cicloManual,estado}' is distinct from v_after#>'{cicloManual,estado}'
    or v_before#>'{cicloManual,proximoCicloNumero}'
      is distinct from v_after#>'{cicloManual,proximoCicloNumero}'
  ) then
    raise exception 'Bank settlement incorrectly revoked next-cycle eligibility';
  end if;

  for v_patch in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('status','CANCELADO'),
    jsonb_build_object('gateway_status','CANCELED'),
    jsonb_build_object('manual_settlement_id',gen_random_uuid()),
    jsonb_build_object('manual_settlement_received_cents',1),
    jsonb_build_object('gateway_settlement_source','CNAB240'),
    jsonb_build_object('gateway_settlement_evidence',null),
    jsonb_build_object('gateway_settlement_evidence',jsonb_set(v_paid.gateway_settlement_evidence,'{paymentCount}','"invalid"'::jsonb)),
    jsonb_build_object('gateway_settlement_evidence',jsonb_set(v_paid.gateway_settlement_evidence,'{paymentCount}','2'::jsonb)),
    jsonb_build_object('valor_pago',v_paid.valor_pago+1),
    jsonb_build_object('data_pagamento',v_paid.data_pagamento+1),
    jsonb_build_object('gateway_financial_terms',null),
    jsonb_build_object('gateway_pix_encoded_image',null),
    jsonb_build_object('gateway_payment_id','000000000'),
    jsonb_build_object('gateway_creation_token',gen_random_uuid())
  )) loop
    v_changed:=jsonb_populate_record(v_paid,v_patch);
    if internal_academic.technical_manual_banese_receivable_paid_issued(v_changed) then
      raise exception 'Historical issuance accepted missing or conflicting bank evidence';
    end if;
  end loop;

  -- Reconciliation may prove Pix as the settlement method of the same BOLETO.
  v_changed:=jsonb_populate_record(v_paid,jsonb_build_object('forma_pagamento','PIX',
    'gateway_settlement_channel','PIX','gateway_settlement_evidence',
    jsonb_set(v_paid.gateway_settlement_evidence,'{classification}','"PIX"'::jsonb)));
  update public.payment_gateway_transactions set raw_payload=jsonb_set(v_payload,'{settlementMethod}','"PIX"'::jsonb)
    where id=v_transaction.id;
  if not internal_academic.technical_manual_banese_receivable_paid_issued(v_changed) then
    raise exception 'Official Pix settlement lost BOLETO issuance proof';
  end if;
  update public.payment_gateway_transactions set raw_payload=v_payload where id=v_transaction.id;

  -- A copied marker or detached authorization cannot become proof of issuance.
  for v_patch in select value from jsonb_array_elements(jsonb_build_array(
    v_payload-'manualCycleIssuance',
    jsonb_set(v_payload,'{manualCycleIssuance,cycleRequestId}',to_jsonb(gen_random_uuid()::text)),
    jsonb_set(v_payload,'{manualCycleIssuance,authorizationRequestId}',to_jsonb(gen_random_uuid()::text)),
    jsonb_set(v_payload,'{payments}','[]'::jsonb),
    jsonb_set(v_payload,'{payments,0,ValorPago}','0'::jsonb)
  )) loop
    update public.payment_gateway_transactions set raw_payload=v_patch where id=v_transaction.id;
    if internal_academic.technical_manual_banese_receivable_paid_issued(v_paid) then
      raise exception 'Detached transaction evidence accepted';
    end if;
  end loop;
  update public.payment_gateway_transactions set raw_payload=v_payload where id=v_transaction.id;

  if exists(select 1 from public.contas_receber r
    where r.gateway_provider='banese_card' and r.status='PAGO'
      and not exists(select 1 from internal_academic.technical_manual_cycle_runs run where r.id=any(run.receivable_ids))
      and internal_academic.technical_manual_banese_receivable_paid_issued(r)) then
    raise exception 'Imported paid title acquired manual issuance proof';
  end if;

  for v_candidate in select distinct u.auth_user_id from public.usuarios_sistema u
    join internal_academic.technical_manual_receivable_issuance_authorizations a on a.authorized_by=u.auth_user_id
    where public.is_active_status(u.status)
  loop
    perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_candidate)::text,true);
    perform set_config('request.jwt.claim.role','authenticated',true);
    if public.gestor_has_financeiro_tab('receber') and public.is_gestor_for_polo(v_paid.polo_id) then
      v_actor:=v_candidate; exit;
    end if;
  end loop;
  if v_actor is null then raise exception 'Financial actor fixture unavailable'; end if;
  v_denied:=false;
  begin
    perform public.authorize_technical_manual_receivable_issuance_secure(v_paid.id,gen_random_uuid());
  exception when raise_exception then
    if sqlerrm='O recebível não está disponível para emissão.' then v_denied:=true; else raise; end if;
  end;
  if not v_denied then raise exception 'Paid historical title became eligible for a new bank POST'; end if;

  if exists(select 1 from public.contas_receber r where r.id=v_paid.id
    and (r.status<>'PAGO' or r.gateway_payment_id is distinct from v_row.gateway_payment_id
      or r.gateway_creation_token is not null or r.data_vencimento is distinct from v_row.data_vencimento)) then
    raise exception 'Resumption altered bank identity or reopened the paid title';
  end if;
end;
$test$;
rollback;
