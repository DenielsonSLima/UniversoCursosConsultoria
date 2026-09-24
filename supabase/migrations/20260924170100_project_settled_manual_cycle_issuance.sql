-- Recognize a previously issued canonical BolePix after bank settlement.
-- No receivable, payment, identity or imported title is changed.
begin;
set local lock_timeout = '5s';

-- This predicate reads settlement evidence; it never authorizes a bank POST.
create function internal_academic.manual_cycle_paid_settlement_matches(
  p_receivable public.contas_receber,p_transaction_payload jsonb
)
returns boolean language plpgsql stable security definer set search_path='' as $function$
declare v_payment jsonb; v_total numeric:=0; v_date date; v_latest date;
begin
  if jsonb_typeof(p_transaction_payload->'payments') is distinct from 'array'
    or jsonb_array_length(p_transaction_payload->'payments')=0
    or jsonb_array_length(p_transaction_payload->'payments') is distinct from
      (p_receivable.gateway_settlement_evidence->>'paymentCount')::integer
    or p_transaction_payload->>'settlementMethod'
      is distinct from p_receivable.gateway_settlement_channel
  then return false; end if;
  for v_payment in select value from jsonb_array_elements(p_transaction_payload->'payments') loop
    if jsonb_typeof(v_payment) is distinct from 'object'
      or coalesce(v_payment->>'ValorPago','') !~ '^[0-9]+([.][0-9]+)?$'
      or coalesce(left(v_payment->>'DataPagamento',10),'')
        !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    then return false; end if;
    v_total:=v_total+(v_payment->>'ValorPago')::numeric;
    v_date:=left(v_payment->>'DataPagamento',10)::date;
    v_latest:=greatest(v_latest,v_date);
  end loop;
  return round(v_total,2)=round(p_receivable.valor_pago,2)
    and v_latest=p_receivable.data_pagamento;
exception when others then return false;
end;
$function$;

CREATE FUNCTION internal_academic.technical_manual_banese_receivable_paid_issued(p_receivable public.contas_receber)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_expected_terms jsonb;
  v_total integer;
  v_matching integer;
begin
  begin
    v_expected_terms :=
      internal_academic.technical_manual_banese_expected_terms(p_receivable);
  exception when others then
    return false;
  end;
  if p_receivable.gateway_provider is distinct from 'banese_card'
    or p_receivable.gateway_environment is distinct from 'production'
    or p_receivable.gateway_payment_method is distinct from 'BOLETO'
    or coalesce(p_receivable.forma_pagamento,'') not in ('BOLETO','PIX')
    or p_receivable.gateway_submission_channel is distinct from 'API'
    or p_receivable.gateway_submission_status is distinct from 'API_REGISTERED'
    or upper(coalesce(p_receivable.status, '')) <> 'PAGO'
    or p_receivable.data_pagamento is null
    or coalesce(p_receivable.valor_pago,0)<=0
    or p_receivable.origem_pagamento is distinct from 'BANESE'
    or p_receivable.manual_settlement_id is not null
    or p_receivable.manual_settlement_principal_cents is not null
    or p_receivable.manual_settlement_interest_cents is not null
    or p_receivable.manual_settlement_penalty_cents is not null
    or p_receivable.manual_settlement_addition_cents is not null
    or p_receivable.manual_settlement_discount_cents is not null
    or p_receivable.manual_settlement_received_cents is not null
    or p_receivable.manual_settlement_reversed_at is not null
    or coalesce(p_receivable.gateway_settlement_channel,'') not in
      ('PIX','BOLETO','NAO_IDENTIFICADO','MISTO')
    or p_receivable.gateway_settlement_source is distinct from 'API'
    or jsonb_typeof(p_receivable.gateway_settlement_evidence) is distinct from 'object'
    or p_receivable.gateway_settlement_evidence->>'classification'
      is distinct from p_receivable.gateway_settlement_channel
    or coalesce(p_receivable.gateway_settlement_evidence->>'paymentCount','')
      !~ '^[1-9][0-9]*$'
    or p_receivable.gateway_settlement_evidence->'documentedFields'
      is distinct from '["BancoRecebedor","DataPagamento","ValorPago"]'::jsonb
    or p_receivable.gateway_settlement_recorded_at is null
    or (p_receivable.gateway_settlement_channel='PIX'
      and p_receivable.forma_pagamento is distinct from 'PIX')
    or (p_receivable.gateway_settlement_channel<>'PIX'
      and p_receivable.forma_pagamento is distinct from 'BOLETO')
    or p_receivable.gateway_creation_token is not null
    or p_receivable.gateway_payment_link_id is not null
    or p_receivable.gateway_cnab_file_id is not null
    or upper(coalesce(p_receivable.gateway_status, '')) <> 'PAID'
    or p_receivable.gateway_boleto_issued_at is null
    or p_receivable.gateway_financial_terms_confirmed_at is null
    or p_receivable.gateway_financial_terms is distinct from v_expected_terms
    or p_receivable.gateway_payment_id is distinct from
      p_receivable.gateway_boleto_nosso_numero
    or coalesce(p_receivable.gateway_payment_id, '') !~ '^[0-9]{9}$'
    or coalesce(p_receivable.gateway_boleto_linha_digitavel, '')
      !~ '^0479[0-9]{43}$'
    or coalesce(p_receivable.gateway_boleto_codigo_barras, '')
      !~ '^0479[0-9]{40}$'
    or substring(p_receivable.gateway_boleto_codigo_barras from 31 for 9)
      <> p_receivable.gateway_payment_id
    or concat(
      substring(p_receivable.gateway_boleto_linha_digitavel from 1 for 4),
      substring(p_receivable.gateway_boleto_linha_digitavel from 33 for 1),
      substring(p_receivable.gateway_boleto_linha_digitavel from 34 for 14),
      substring(p_receivable.gateway_boleto_linha_digitavel from 5 for 5),
      substring(p_receivable.gateway_boleto_linha_digitavel from 11 for 10),
      substring(p_receivable.gateway_boleto_linha_digitavel from 22 for 10)
    ) <> p_receivable.gateway_boleto_codigo_barras
    or coalesce(p_receivable.gateway_pix_payload, '') !~*
      '^000201.*BR[.]GOV[.]BCB[.]PIX.*5303986.*5802BR.*6304[0-9A-Fa-f]{4}$'
    or coalesce(p_receivable.gateway_pix_encoded_image, '') !~
      '^data:image/(png|jpeg);base64,(iVBORw0KGgo|/9j/)[A-Za-z0-9+/=]+$'
    or exists (
      select 1
      from internal_academic.technical_manual_cycle_runs run
      join public.contas_receber sibling
        on sibling.id = any(run.receivable_ids)
       and sibling.id <> p_receivable.id
      where p_receivable.id = any(run.receivable_ids)
        and run.state = 'LOCAL_CREATED'
        and (
          sibling.gateway_boleto_nosso_numero =
            p_receivable.gateway_boleto_nosso_numero
          or sibling.gateway_boleto_linha_digitavel =
            p_receivable.gateway_boleto_linha_digitavel
          or sibling.gateway_boleto_codigo_barras =
            p_receivable.gateway_boleto_codigo_barras
          or sibling.gateway_pix_payload = p_receivable.gateway_pix_payload
        )
    )
  then
    return false;
  end if;
  select count(*)::integer,
    count(*) filter (where
      transaction.provider_code = 'banese_card'
      and transaction.environment = 'production'
      and transaction.payment_method = 'BOLETO'
      and transaction.remote_payment_id = p_receivable.gateway_payment_id
      and transaction.remote_status = p_receivable.gateway_status
      and round(transaction.amount, 2) = round(p_receivable.valor, 2)
      and transaction.origin_polo_id = p_receivable.polo_id
      and transaction.issuer_polo_id = p_receivable.gateway_issuer_polo_id
      and transaction.bank_slip_our_number =
        p_receivable.gateway_boleto_nosso_numero
      and transaction.bank_slip_digitable_line =
        p_receivable.gateway_boleto_linha_digitavel
      and transaction.bank_slip_barcode =
        p_receivable.gateway_boleto_codigo_barras
      and transaction.pix_payload = p_receivable.gateway_pix_payload
      and transaction.pix_encoded_image = p_receivable.gateway_pix_encoded_image
      and jsonb_typeof(transaction.raw_payload -> 'manualCycleIssuance') = 'object'
      and transaction.raw_payload#>>'{manualCycleIssuance,cycleRequestId}'
        = p_receivable.regra_financeira_tecnica_snapshot#>>'{cicloManual,requestId}'
      and transaction.raw_payload#>>'{manualCycleIssuance,cycleNumber}'
        = p_receivable.regra_financeira_tecnica_snapshot#>>'{cicloManual,cicloNumero}'
      and exists(select 1
        from internal_academic.technical_manual_receivable_issuance_authorizations authz
        where authz.receivable_id=p_receivable.id
          and authz.request_id::text
            =transaction.raw_payload#>>'{manualCycleIssuance,authorizationRequestId}'
          and authz.first_claimed_at is not null and authz.claim_count>0)
      and internal_academic.manual_cycle_paid_settlement_matches(
        p_receivable,transaction.raw_payload)
    )::integer
  into v_total, v_matching
  from public.payment_gateway_transactions transaction
  where transaction.receivable_id = p_receivable.id;
  return v_total = 1 and v_matching = 1;
end;
$function$;
revoke all on function
  internal_academic.manual_cycle_paid_settlement_matches(public.contas_receber,jsonb),
  internal_academic.technical_manual_banese_receivable_paid_issued(public.contas_receber)
  from public,anon,authenticated,service_role;

-- Only the resumption projection may consume historical proof. The payable
-- completion predicate, authorization, claim and POST persistence stay strict.
do $patch$
declare v_definition text; v_from text; v_to text;
begin
  v_definition:=pg_get_functiondef(
    'public.obter_emissao_ciclo_financeiro_tecnico_manual_service(uuid,integer)'::regprocedure);
  if md5(v_definition)<>'368b996cdac456d70c9938accf0d1823' then
    raise exception 'Unexpected manual cycle progress contract; review before applying.';
  end if;
  v_from:=$old$  v_complete boolean;$old$;
  v_to:=$new$  v_complete boolean;
  v_paid_issued boolean;$new$;
  if position(v_from in v_definition)=0 then raise exception 'Progress declaration missing.'; end if;
  v_definition:=replace(v_definition,v_from,v_to);
  v_from:=$old$    if v_complete then$old$;
  v_to:=$new$    v_paid_issued:=
      internal_academic.technical_manual_banese_receivable_paid_issued(v_receivable);
    if v_complete or v_paid_issued then$new$;
  if position(v_from in v_definition)=0 then raise exception 'Progress completion boundary missing.'; end if;
  v_definition:=replace(v_definition,v_from,v_to);
  v_from:=$old$      'emissaoBanese', v_item_state$old$;
  v_to:=$new$      'emissaoBanese', v_item_state,
      'emissaoHistoricaComprovada', v_paid_issued$new$;
  if position(v_from in v_definition)=0 then raise exception 'Progress item projection missing.'; end if;
  execute replace(v_definition,v_from,v_to);
end;
$patch$;

commit;
