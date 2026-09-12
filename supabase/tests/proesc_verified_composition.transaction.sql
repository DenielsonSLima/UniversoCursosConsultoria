-- Rehearsal only. Apply the composition migrations inside BEGIN before this
-- script and ROLLBACK afterwards. The inner subtransaction also rolls fixtures back.
-- Include the later preserve_unknown_proesc_components migration in the rehearsal.
do $composition_contract$
declare
  v_receipt public.contas_receber%rowtype;
  v_link internal_proesc.obligation_links%rowtype;
  v_result record;
  v_other record;
  v_snapshot uuid;
  v_conflicting_snapshot uuid;
  v_conflict text;
  v_page jsonb;
  v_row jsonb;
  v_modality text;
  v_original jsonb;
  v_after jsonb;
  v_auth_user uuid;
  v_function regprocedure := 'public.resolve_integrated_receivable_financial_composition(uuid,numeric,numeric,date,date,jsonb,uuid,timestamptz,bigint,bigint,bigint,bigint,bigint,bigint)'::regprocedure;
begin
  assert not has_function_privilege('anon',v_function,'EXECUTE'), 'Anonymous access granted';
  assert not has_function_privilege('authenticated',v_function,'EXECUTE'), 'Direct public lookup granted';
  assert has_function_privilege('service_role',v_function,'EXECUTE'), 'Service access missing';
  begin
    select r.* into strict v_receipt from public.contas_receber r
    join internal_proesc.obligation_links l on l.receivable_id=r.id
    where r.status='PAGO' and r.origem_pagamento='SISTEMA_ANTERIOR'
      and r.categoria='MENSALIDADE'
      and r.manual_settlement_id is null and r.gateway_provider is null
      and r.gateway_payment_id is null and r.valor > r.valor_pago and r.valor_pago > 0
    order by r.id limit 1;
    select * into strict v_link from internal_proesc.obligation_links where receivable_id=v_receipt.id;
    select auth_user_id into strict v_auth_user from public.usuarios_sistema where id=v_link.confirmed_by;
    perform set_config('request.jwt.claim.sub',v_auth_user::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object(
      'sub',v_auth_user,'role','authenticated')::text,true);
    select c.modalidade into strict v_modality from public.turmas t
      join public.cursos c on c.id=t.curso_id where t.id=v_receipt.turma_id;
    v_original := to_jsonb(v_receipt);

    -- Force absence of a confirmed composition in the rollback fixture.
    delete from internal_proesc.financial_snapshots
      where link_id=v_link.id and evidence_kind='PORTAL_CONFIRMED';
    select * into v_result from public.resolve_integrated_receivable_financial_composition(
      v_receipt.id,v_receipt.valor,v_receipt.valor_pago,v_receipt.data_vencimento,
      v_receipt.data_pagamento,null,null,null,null,null,null,null,null,null);
    assert v_result.desconto is null
      and v_result.diferenca_nao_discriminada=v_receipt.valor_pago-v_receipt.valor,
      'Difference alone was incorrectly classified as a discount';

    insert into internal_proesc.financial_snapshots(link_id,observed_at,source_fingerprint,
      principal_cents,received_cents,payment_date,source_status,verification,evidence_kind,
      components,accounting_lines,review_reasons,recorded_by)
    values(v_link.id,now(),repeat('a',64),round(v_receipt.valor*100)::bigint,
      round(v_receipt.valor_pago*100)::bigint,v_receipt.data_pagamento,'PAID','VERIFIED','PORTAL_CONFIRMED',
      jsonb_build_object('interestCents',0,'penaltyCents',0,'additionCents',0,
        'discountCents',round((v_receipt.valor-v_receipt.valor_pago)*100)::bigint),
      '[]','[]',v_link.confirmed_by) returning id into v_snapshot;
    select * into v_result from public.resolve_integrated_receivable_financial_composition(
      v_receipt.id,v_receipt.valor,v_receipt.valor_pago,v_receipt.data_vencimento,
      v_receipt.data_pagamento,null,null,null,null,null,null,null,null,null);
    assert v_result.composicao_status='CONCILIADO_POR_CONFERENCIA_PROESC'
      and v_result.desconto=v_receipt.valor-v_receipt.valor_pago
      and v_result.juros=0 and v_result.multa=0 and v_result.diferenca_nao_discriminada=0,
      'Confirmed composition was not used';
    select * into strict v_other from public.get_caixa_relatorio_recebimentos_core(
      v_receipt.polo_id,v_receipt.data_pagamento,v_receipt.data_pagamento+1)
      where id=v_receipt.id;
    assert v_other.desconto is not distinct from v_result.desconto
      and v_other.valor_recebido is not distinct from v_receipt.valor_pago
      and v_other.composicao_status is not distinct from v_result.composicao_status,
      'Caixa report and composition resolver disagree';
    v_page := public.list_financial_receipts_secure(
      p_polo_id=>v_receipt.polo_id,p_payment_start=>v_receipt.data_pagamento,
      p_payment_end=>v_receipt.data_pagamento,p_search=>v_receipt.descricao,
      p_origin=>'HISTORICO_MIGRADO',p_page_size=>100);
    select item into strict v_row from jsonb_array_elements(v_page->'items') item
      where item->>'id'=v_receipt.id::text;
    assert v_row->>'composicao_status' is not distinct from 'CONCILIADO_POR_CONFERENCIA_PROESC'
      and (v_row->>'desconto_aplicado')::numeric is not distinct from v_result.desconto,
      'Receipts feed omitted the proven composition';
    v_page := public.get_receivables_modality_page_v3_secure(
      p_modality=>v_modality,p_polo_id=>v_receipt.polo_id,p_turma_id=>v_receipt.turma_id,
      p_search=>v_receipt.descricao,p_due_start=>v_receipt.data_pagamento,
      p_due_end=>v_receipt.data_pagamento,p_status_scope=>'received',p_page_size=>500);
    select item into strict v_row from jsonb_array_elements(v_page->'rows') item
      where item->>'id'=v_receipt.id::text;
    assert (v_row->>'desconto_aplicado')::numeric is not distinct from v_result.desconto
      and (v_row->>'juros_aplicados')::numeric is not distinct from 0::numeric
      and (v_row->>'multa_aplicada')::numeric is not distinct from 0::numeric,
      'Modality page omitted the proven Proesc components';

    -- A later API observation with omitted components must preserve matching proof.
    insert into internal_proesc.financial_snapshots(link_id,observed_at,source_fingerprint,
      principal_cents,received_cents,payment_date,source_status,verification,evidence_kind,
      components,accounting_lines,review_reasons,recorded_by)
    values(v_link.id,now()+interval '1 second',repeat('b',64),round(v_receipt.valor*100)::bigint,
      round(v_receipt.valor_pago*100)::bigint,v_receipt.data_pagamento,'PAID','VERIFIED','API_PAYMENT_TOTAL',
      '{"interestCents":null,"penaltyCents":null,"additionCents":null,"discountCents":null}',
      '[]','[]',v_link.confirmed_by);
    select * into v_result from public.resolve_integrated_receivable_financial_composition(
      v_receipt.id,v_receipt.valor,v_receipt.valor_pago,v_receipt.data_vencimento,
      v_receipt.data_pagamento,null,null,null,null,null,null,null,null,null);
    assert v_result.composicao_status='CONCILIADO_POR_CONFERENCIA_PROESC', 'Later nulls erased proven composition';

    -- Old valid proof must not reappear after an explicit newer conflict.
    foreach v_conflict in array array['PORTAL_INCOMPLETE','API_CANCELED','API_CANCELED_STATUS','API_RENEGOTIATED','API_PAYMENT_CHANGED']
    loop
      insert into internal_proesc.financial_snapshots(link_id,observed_at,source_fingerprint,
        principal_cents,received_cents,payment_date,source_status,verification,evidence_kind,
        components,accounting_lines,review_reasons,recorded_by)
      select link_id,now()+interval '2 seconds',repeat('c',64),principal_cents,
        received_cents+case when v_conflict='API_PAYMENT_CHANGED' then 1 else 0 end,
        payment_date,case when v_conflict='API_CANCELED_STATUS' then 'CANCELED' else source_status end,verification,
        case when v_conflict='PORTAL_INCOMPLETE' then 'PORTAL_CONFIRMED' else 'API_PAYMENT_TOTAL' end,
        jsonb_set(components,'{interestCents}','null'),
        case when v_conflict='API_CANCELED' then '[{"cancelled":true}]'::jsonb
          when v_conflict='API_RENEGOTIATED' then '[{"renegotiation":true}]'::jsonb
          else '[]'::jsonb end,review_reasons,recorded_by
      from internal_proesc.financial_snapshots where id=v_snapshot
      returning id into v_conflicting_snapshot;
      select * into strict v_result from public.resolve_integrated_receivable_financial_composition(
        v_receipt.id,v_receipt.valor,v_receipt.valor_pago,v_receipt.data_vencimento,
        v_receipt.data_pagamento,null,null,null,null,null,null,null,null,null);
      assert v_result.composicao_status is distinct from 'CONCILIADO_POR_CONFERENCIA_PROESC',
        'An explicit newer conflict resurrected old proof';
      delete from internal_proesc.financial_snapshots where id=v_conflicting_snapshot;
    end loop;

    -- Mismatched payment date and an incomplete/canceled proof must not be accepted.
    select * into v_result from public.resolve_integrated_receivable_financial_composition(
      v_receipt.id,v_receipt.valor,v_receipt.valor_pago,v_receipt.data_vencimento,
      v_receipt.data_pagamento+1,null,null,null,null,null,null,null,null,null);
    assert v_result.desconto is null, 'Stale payment date accepted';
    update internal_proesc.financial_snapshots
      set components=jsonb_set(components,'{interestCents}','null') where id=v_snapshot;
    select * into v_result from public.resolve_integrated_receivable_financial_composition(
      v_receipt.id,v_receipt.valor,v_receipt.valor_pago,v_receipt.data_vencimento,
      v_receipt.data_pagamento,null,null,null,null,null,null,null,null,null);
    assert v_result.desconto is null, 'Incomplete composition accepted';
    update internal_proesc.financial_snapshots set components=jsonb_set(components,'{interestCents}','0'),
      accounting_lines='[{"blockCode":1,"amountCents":1,"cancelled":true}]' where id=v_snapshot;
    select * into v_result from public.resolve_integrated_receivable_financial_composition(
      v_receipt.id,v_receipt.valor,v_receipt.valor_pago,v_receipt.data_vencimento,
      v_receipt.data_pagamento,null,null,null,null,null,null,null,null,null);
    assert v_result.desconto is null, 'Canceled proof accepted';
    v_page := public.list_financial_receipts_secure(
      p_polo_id=>v_receipt.polo_id,p_payment_start=>v_receipt.data_pagamento,
      p_payment_end=>v_receipt.data_pagamento,p_search=>v_receipt.descricao,
      p_origin=>'HISTORICO_MIGRADO',p_page_size=>100);
    select item into strict v_row from jsonb_array_elements(v_page->'items') item
      where item->>'id'=v_receipt.id::text;
    assert v_row->>'composicao_status' is not distinct from 'HISTORICO_SEM_COMPOSICAO'
      and v_row->>'desconto_aplicado' is null and v_row->>'juros_aplicados' is null
      and v_row->>'multa_aplicada' is null and v_row->>'acrescimo_aplicado' is null,
      'Unproven historical components leaked into the feed';
    select to_jsonb(r) into v_after from public.contas_receber r where id=v_receipt.id;
    assert v_original=v_after, 'Reporting changed the actual receivable';
    raise exception using errcode='PZ001',message='fixture rollback';
  exception when sqlstate 'PZ001' then null; end;

  -- Current bank/manual receipts must use exactly the existing contract.
  for v_receipt in select * from public.contas_receber where status='PAGO'
      and (gateway_provider is not null or manual_settlement_id is not null)
  loop
    select * into v_result from public.resolve_integrated_receivable_financial_composition(
      v_receipt.id,v_receipt.valor,v_receipt.valor_pago,v_receipt.data_vencimento,v_receipt.data_pagamento,
      v_receipt.gateway_financial_terms,v_receipt.manual_settlement_id,v_receipt.manual_settlement_reversed_at,
      v_receipt.manual_settlement_principal_cents,v_receipt.manual_settlement_interest_cents,
      v_receipt.manual_settlement_penalty_cents,v_receipt.manual_settlement_addition_cents,
      v_receipt.manual_settlement_discount_cents,v_receipt.manual_settlement_received_cents);
    select * into v_other from public.resolve_receivable_financial_composition(
      v_receipt.valor,v_receipt.valor_pago,v_receipt.data_vencimento,v_receipt.data_pagamento,
      v_receipt.gateway_financial_terms,v_receipt.manual_settlement_id,v_receipt.manual_settlement_reversed_at,
      v_receipt.manual_settlement_principal_cents,v_receipt.manual_settlement_interest_cents,
      v_receipt.manual_settlement_penalty_cents,v_receipt.manual_settlement_addition_cents,
      v_receipt.manual_settlement_discount_cents,v_receipt.manual_settlement_received_cents);
    assert to_jsonb(v_result)=to_jsonb(v_other), 'Bank/manual composition changed';
  end loop;
end;
$composition_contract$;

do $zero_net_difference$
declare
  v_receipt public.contas_receber%rowtype;
  v_composition record;
begin
  select r.* into strict v_receipt from public.contas_receber r
  join internal_proesc.obligation_links l on l.receivable_id=r.id
  where r.status='PAGO' and r.valor=r.valor_pago
    and r.gateway_provider is null and r.manual_settlement_id is null
    and not exists (select 1 from internal_proesc.financial_snapshots s
      where s.link_id=l.id and s.evidence_kind='PORTAL_CONFIRMED'
        and s.components->>'discountCents' is not null)
  order by r.id limit 1;
  select * into v_composition from public.resolve_integrated_receivable_financial_composition(
    v_receipt.id,v_receipt.valor,v_receipt.valor_pago,v_receipt.data_vencimento,
    v_receipt.data_pagamento,null,null,null,null,null,null,null,null,null);
  assert v_composition.juros is null and v_composition.multa is null
    and v_composition.desconto is null and v_composition.acrescimo is null
    and v_composition.diferenca_nao_discriminada=0
    and v_composition.composicao_status='NAO_DISCRIMINADA',
    'Zero net difference was incorrectly treated as proof of individual components';
end;
$zero_net_difference$;
