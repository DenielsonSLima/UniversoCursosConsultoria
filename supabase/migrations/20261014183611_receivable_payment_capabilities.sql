BEGIN;
-- The original bank title stays canceled while the local balance remains collectible.
create or replace function internal_academic.receivable_operation_capabilities(
  p_receivable public.contas_receber
) returns jsonb language plpgsql stable set search_path = '' as $function$
declare
  v_proesc boolean;
  v_banese boolean;
  v_identity boolean := false;
  v_imported boolean := false;
  v_native boolean := false;
  v_open boolean;
  v_local boolean;
  v_source text;
  v_provenance text;
  v_reason text;
  v_provider text;
  v_summary jsonb;
begin
  if exists(select 1 from public.financial_payment_events where source_kind='RECEIVABLE' and source_id=p_receivable.id) then
    v_summary:=internal_financial_payments.summary('RECEIVABLE',p_receivable.id,to_jsonb(p_receivable));
    v_open:=p_receivable.status in ('PENDENTE','VENCIDO')
      and internal_financial_payments.cents(v_summary->'remainingBefore')>0
      and coalesce(p_receivable.gateway_provider,'') in ('','local','banese_card')
      and not exists(select 1 from internal_proesc.obligation_links where receivable_id=p_receivable.id)
      and not exists(select 1 from public.banese_cancellation_outbox where receivable_id=p_receivable.id);
    return jsonb_build_object('sourceSystem',case when p_receivable.gateway_provider='banese_card' then 'BANESE' else 'LOCAL' end,
      'provenanceKind','MANUAL_PAYMENT_LEDGER','canSettle',v_open,'canCancel',false,'canEmit',false,
      'canOpenExisting',false,'canReconcile',false,
      'readOnlyReason',case when v_open then null else 'Consulte o histórico dos pagamentos desta cobrança.' end);
  end if;
  select exists(select 1 from internal_proesc.obligation_links link
    where link.receivable_id=p_receivable.id) into v_proesc;
  v_provider := lower(btrim(coalesce(p_receivable.gateway_provider,'')));
  if v_provider = 'banese' then v_provider := 'banese_card'; end if;
  if v_provider = '' and (p_receivable.asaas_payment_id is not null
      or p_receivable.asaas_payment_link_id is not null) then v_provider := 'asaas'; end if;
  v_banese := v_provider = 'banese_card';
  v_local := p_receivable.regra_financeira_tecnica_snapshot->>'destinoCobranca'='LOCAL';
  v_open := p_receivable.status in ('PENDENTE','VENCIDO')
    and p_receivable.data_pagamento is null and coalesce(p_receivable.valor_pago,0)=0
    and not exists(select 1 from public.banese_cancellation_outbox job
      where job.receivable_id=p_receivable.id
        and job.state in ('PENDING','RETRY','PROCESSING','REVIEW_REQUIRED'));
  if v_banese then
    select count(*)=1 and coalesce(bool_and(
      lower(btrim(tx.provider_code)) in ('banese','banese_card')
      and tx.environment=p_receivable.gateway_environment
      and tx.payment_method='BOLETO'
      and nullif(tx.bank_slip_our_number,'')=nullif(p_receivable.gateway_boleto_nosso_numero,'')
      and tx.remote_payment_id=p_receivable.gateway_payment_id
      and tx.amount=p_receivable.valor),false),
      coalesce(bool_or(tx.raw_payload->>'importSource'='BANESE_API_LEGACY_DISCOVERY'),false)
    into v_identity,v_imported from public.payment_gateway_transactions tx
    where tx.receivable_id=p_receivable.id;
    select exists(select 1 from internal_academic.technical_manual_cycle_runs run
      where run.state='LOCAL_CREATED' and p_receivable.id=any(run.receivable_ids)) into v_native;
    v_imported := v_imported or exists(
      select 1 from internal_academic.technical_manual_cycle_runs run
      where run.state='PROTECTED_EXISTING' and p_receivable.id=any(run.receivable_ids));
  end if;
  if v_proesc and v_provider <> '' then
    v_source:='CONFLICT'; v_provenance:='CONFLICT';
    v_reason:='Origem financeira conflitante. Revisão obrigatória.';
  elsif v_proesc then
    v_source:='PROESC'; v_provenance:='PROESC_HISTORY';
    v_reason:='Histórico Proesc somente para consulta; nenhuma operação financeira local.';
  elsif v_banese then
    v_source:='BANESE';
    v_provenance:=case when v_imported then 'BANESE_LEGACY_IMPORTED'
      when v_native or p_receivable.gateway_creation_token is not null then 'NATIVE_ISSUED'
      else 'OTHER' end;
    if not v_identity then v_reason:='Identidade bancária em revisão.'; end if;
  else
    v_source:=case when v_provider = '' then 'LOCAL' else 'OTHER' end;
    v_provenance:=v_source;
    if v_provider not in ('','asaas') then
      v_reason:='Provedor financeiro não reconhecido para operação local.';
    end if;
  end if;
  return jsonb_build_object(
    'sourceSystem',v_source,'provenanceKind',v_provenance,
    'canSettle',v_open and v_reason is null,
    'canCancel',v_open and v_banese and v_identity and not v_proesc,
    'canEmit',v_open and v_source='LOCAL' and not coalesce(v_local,false)
      and p_receivable.origem_pagamento is distinct from 'SISTEMA_ANTERIOR',
    'canOpenExisting',v_banese and v_identity and not v_proesc,
    'canReconcile',v_banese and v_identity and not v_proesc,
    'readOnlyReason',v_reason);
end;
$function$;
revoke all on function internal_academic.receivable_operation_capabilities(public.contas_receber)
  from public, anon, authenticated;

COMMIT;
