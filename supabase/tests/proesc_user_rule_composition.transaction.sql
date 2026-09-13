-- Run inside the migration rehearsal and ROLLBACK afterwards.
-- The inner exception also rolls all snapshot fixtures back.
do $user_rule$
declare
  v_receipt public.contas_receber%rowtype;
  v_link internal_proesc.obligation_links%rowtype;
  v_result record;
  v_expected record;
  v_snapshot uuid;
  v_lines jsonb;
  v_original jsonb;
  v_after jsonb;
  v_auth uuid;
  v_page jsonb;
  v_item jsonb;
begin
  begin
    select r.* into strict v_receipt from public.contas_receber r
    join internal_proesc.obligation_links l on l.receivable_id=r.id
    join public.turmas t on t.id=r.turma_id
    where r.status='PAGO' and r.origem_pagamento='SISTEMA_ANTERIOR'
      and r.valor=279.90 and r.valor_pago>0 and r.gateway_provider is null
      and r.gateway_payment_id is null and r.manual_settlement_id is null
      and r.gateway_financial_terms is null and l.source_unit_id='3145'
      and t.codigo='ENF-T38-INT-MAT'
      and not exists(select 1 from public.matriculas_tecnicas_financeiro_config c
        where c.matricula_id=r.matricula_id and c.override_ativo)
    order by r.id limit 1;
    select * into strict v_link from internal_proesc.obligation_links where receivable_id=v_receipt.id;
    select auth_user_id into strict v_auth from public.usuarios_sistema where id=v_link.confirmed_by;
    perform set_config('request.jwt.claim.sub',v_auth::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_auth,'role','authenticated')::text,true);
    v_original := to_jsonb(v_receipt);
    delete from internal_proesc.financial_snapshots where link_id=v_link.id and evidence_kind='PORTAL_CONFIRMED';
    v_lines := jsonb_build_array(
      jsonb_build_object('blockCode','1','amountCents',27990,'paymentDate',null,'cancelled',false,'renegotiation',false),
      jsonb_build_object('blockCode','2','amountCents',round(v_receipt.valor_pago*100),
        'paymentDate',v_receipt.data_pagamento,'cancelled',false,'renegotiation',false),
      jsonb_build_object('blockCode','7','amountCents',250,
        'paymentDate',v_receipt.data_pagamento,'cancelled',false,'renegotiation',false)
    );
    insert into internal_proesc.financial_snapshots(link_id,observed_at,source_fingerprint,
      principal_cents,received_cents,payment_date,source_status,verification,evidence_kind,
      components,accounting_lines,review_reasons,recorded_by)
    values(v_link.id,now()+interval '1 minute',repeat('d',64),27990,round(v_receipt.valor_pago*100),
      v_receipt.data_pagamento,'PAID','VERIFIED','API_PAYMENT_TOTAL',
      '{"interestCents":null,"penaltyCents":null,"additionCents":null,"discountCents":null}',
      v_lines,'[]',v_link.confirmed_by) returning id into v_snapshot;
    select * into strict v_expected from internal_proesc.calculate_confirmed_payment_rule(
      v_receipt.valor,v_receipt.data_vencimento,v_receipt.data_pagamento);
    select * into strict v_result from public.resolve_integrated_receivable_financial_composition(
      v_receipt.id,v_receipt.valor,v_receipt.valor_pago,v_receipt.data_vencimento,
      v_receipt.data_pagamento,null,null,null,null,null,null,null,null,null);
    assert v_result.composicao_status='CALCULADO_REGRA_INFORMADA_PROESC';
    assert v_result.juros=v_expected.juros and v_result.multa=v_expected.multa
      and v_result.desconto=v_expected.desconto and v_result.acrescimo=0;
    assert v_result.valor_recebido=v_receipt.valor_pago, 'Rule changed actual received amount';
    assert v_result.diferenca_nao_discriminada=v_receipt.valor_pago-v_receipt.valor
      -v_expected.juros-v_expected.multa+v_expected.desconto, 'Residual was hidden';
    v_page := public.get_receivables_modality_page_v3_secure(
      p_modality=>'TECNICO',p_polo_id=>v_receipt.polo_id,p_turma_id=>v_receipt.turma_id,
      p_due_start=>v_receipt.data_pagamento,p_due_end=>v_receipt.data_pagamento,
      p_status_scope=>'received',p_page_size=>500);
    select item into strict v_item from jsonb_array_elements(v_page->'rows') item where item->>'id'=v_receipt.id::text;
    assert v_item->>'composicao_status'='CALCULADO_REGRA_INFORMADA_PROESC';
    assert v_item->>'composicao_proveniencia'='REGRA_INFORMADA_USUARIO';
    assert (v_item->>'desconto_aplicado')::numeric=v_result.desconto
      and (v_item->>'acrescimo_aplicado')::numeric=v_result.acrescimo
      and (v_item->>'diferenca_nao_discriminada')::numeric=v_result.diferenca_nao_discriminada,
      'Modality projection lost the canonical calculated components';
    v_page := public.list_financial_receipts_secure(p_polo_id=>v_receipt.polo_id,
      p_payment_start=>v_receipt.data_pagamento,p_payment_end=>v_receipt.data_pagamento,
      p_origin=>'HISTORICO_MIGRADO',p_page_size=>100);
    select item into strict v_item from jsonb_array_elements(v_page->'items') item where item->>'id'=v_receipt.id::text;
    assert v_item->>'composicao_status'='CALCULADO_REGRA_INFORMADA_PROESC'
      and v_item->>'composicao_proveniencia'='REGRA_INFORMADA_USUARIO',
      'Receipt feed lost the calculated provenance';

    update internal_proesc.financial_snapshots set accounting_lines=v_lines || jsonb_build_array(
      jsonb_build_object('blockCode','3','amountCents',7,'paymentDate',v_receipt.data_pagamento,'cancelled',false,'renegotiation',false),
      jsonb_build_object('blockCode','4','amountCents',11,'paymentDate',v_receipt.data_pagamento,'cancelled',false,'renegotiation',false),
      jsonb_build_object('blockCode','10482','amountCents',13,'paymentDate',v_receipt.data_pagamento,'cancelled',false,'renegotiation',false)
    ) where id=v_snapshot;
    select * into strict v_result from public.resolve_integrated_receivable_financial_composition(
      v_receipt.id,v_receipt.valor,v_receipt.valor_pago,v_receipt.data_vencimento,
      v_receipt.data_pagamento,null,null,null,null,null,null,null,null,null);
    assert v_result.composicao_status='API_E_REGRA_INFORMADA_PROESC';
    assert v_result.juros=0.07 and v_result.multa=0.11 and v_result.desconto=0.13,
      'Calculation overwrote explicit source values';
    assert v_result.valor_recebido=v_receipt.valor_pago and v_result.acrescimo=0,
      'Tariff was added to the received amount';

    update internal_proesc.financial_snapshots set accounting_lines=v_lines || jsonb_build_array(
      jsonb_build_object('blockCode','999','amountCents',1,'paymentDate',v_receipt.data_pagamento,'cancelled',false,'renegotiation',false)
    ) where id=v_snapshot;
    select * into strict v_result from public.resolve_integrated_receivable_financial_composition(
      v_receipt.id,v_receipt.valor,v_receipt.valor_pago,v_receipt.data_vencimento,
      v_receipt.data_pagamento,null,null,null,null,null,null,null,null,null);
    assert v_result.composicao_status='NAO_DISCRIMINADA' and v_result.desconto is null,
      'Unrecognized source component accepted the default rule';

    update internal_proesc.financial_snapshots set accounting_lines=jsonb_set(v_lines,'{1,renegotiation}','true') where id=v_snapshot;
    select * into strict v_result from public.resolve_integrated_receivable_financial_composition(
      v_receipt.id,v_receipt.valor,v_receipt.valor_pago,v_receipt.data_vencimento,
      v_receipt.data_pagamento,null,null,null,null,null,null,null,null,null);
    assert v_result.composicao_status='NAO_DISCRIMINADA' and v_result.desconto is null,
      'Renegotiated source accepted the default rule';
    select to_jsonb(r) into strict v_after from public.contas_receber r where id=v_receipt.id;
    assert v_original=v_after, 'Report changed the receivable';
    raise exception using errcode='PZ002',message='fixture rollback';
  exception when sqlstate 'PZ002' then null; end;
end;
$user_rule$;
