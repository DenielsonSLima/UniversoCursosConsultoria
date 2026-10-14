-- Existing position definitions captured before the payment ledger; no production rows.
CREATE OR REPLACE FUNCTION internal_contas.caixa_monthly_delinquency(p_polo_id uuid, p_competencia date, p_today date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with bounds as (
    select date_trunc('month',p_competencia)::date inicio,
      (date_trunc('month',p_competencia)+interval '1 month')::date fim
  ), cutoff as (
    select b.*,least(p_today,b.fim-1) data_corte,
      least(p_today,b.fim) overdue_exclusive,
      least(p_today+1,b.fim) payment_exclusive from bounds b
  ), source_rows as materialized (
    select c.id,c.status,c.valor,c.valor_pago,c.data_vencimento,c.data_pagamento,b.*,
      case when l.id is null then false
        when internal_proesc.reconciliation_source_system(c)<>'PROESC' then true
        when f.verification is distinct from 'VERIFIED' then true
        when c.status='PAGO' then f.source_status is distinct from 'PAID'
          or f.principal_cents is distinct from round(c.valor*100)::bigint
          or f.received_cents is distinct from round(c.valor_pago*100)::bigint
          or f.payment_date is distinct from c.data_pagamento
        else f.source_status is distinct from 'OPEN' end requires_review
    from public.contas_receber c cross join cutoff b
    left join internal_proesc.obligation_links l on l.receivable_id=c.id
    left join lateral(select s.verification,s.source_status,s.principal_cents,s.received_cents,s.payment_date
      from internal_contas.caixa_proesc_effective_snapshot(c,l.id) s) f on true
    where c.data_vencimento>=b.inicio and c.data_vencimento<b.fim
      and (p_polo_id is null or c.polo_id=p_polo_id)
      and c.status in ('PAGO','PENDENTE','VENCIDO','AGUARDANDO_CONFIRMACAO','AGUARDANDO_PAGAMENTO')
      and not internal_contas.ead_checkout_is_optional(c.id)
      and not internal_contas.ead_checkout_paid_after_cutoff(c.id,b.payment_exclusive)
      and not exists(select 1 from public.emprestimos_financeiros e where e.conta_receber_id=c.id)
      -- Never turn a merely prepared manual cycle into an issued obligation.
      and not (c.status<>'PAGO' and c.regra_financeira_tecnica_snapshot->'cicloManual' is not null
        and c.gateway_payment_id is null and c.gateway_boleto_nosso_numero is null
        and not exists(select 1 from public.payment_gateway_cnab_records r where r.receivable_id=c.id
          and r.provider_code in ('banese','banese_card') and r.status in ('RECORDED','ACTIVATION_PENDING','ACTIVATED')))
  ), positioned as materialized (
    select s.*,internal_contas.caixa_monthly_receivable_state(s.status,s.data_pagamento,
      s.payment_exclusive,s.requires_review,s.valor_pago) position from source_rows s
  ), totals as (
    select coalesce(sum(valor) filter(where position in ('SETTLED','OUTSTANDING')),0) base,
      count(*) filter(where position in ('SETTLED','OUTSTANDING')) eligible_count,
      coalesce(sum(valor) filter(where position='OUTSTANDING' and data_vencimento<overdue_exclusive),0) overdue,
      count(*) filter(where position='REVIEW') review_count,
      coalesce(sum(valor) filter(where position='REVIEW'),0) review_principal from positioned
  )
  select jsonb_build_object('receber_vencido',t.overdue,
    'margem_inadimplencia',case when t.base>0 then round(t.overdue/t.base*100,2) else 0 end,
    'inadimplencia_mensal',jsonb_build_object('periodo_inicio',b.inicio,'periodo_fim_exclusivo',b.fim,
      'data_corte',b.data_corte,'base_elegivel',t.base,'quantidade_elegiveis',t.eligible_count,
      'quantidade_em_conferencia',t.review_count,'valor_nominal_em_conferencia',t.review_principal,
      'completo',t.review_count=0,'criterio','VENCIMENTO_MENSAL_POSICAO_NO_CORTE'))
  from totals t cross join cutoff b;
$function$
;
CREATE OR REPLACE FUNCTION internal_contas.caixa_receivables_position_rows(p_polo_id uuid, p_competencia date, p_today date)
 RETURNS TABLE(id uuid, polo_id uuid, due_date date, principal numeric, in_month boolean, monthly_position text, portfolio_position text, source_system text, source_key text, snapshot_id uuid, observed_at timestamp with time zone, reason_code text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with bounds as (
    select date_trunc('month',p_competencia)::date start_date,
      (date_trunc('month',p_competencia)+interval '1 month')::date end_date
  ), evidence as materialized (
    select c.id,c.polo_id,c.data_vencimento,c.valor,c.status,c.valor_pago,c.data_pagamento,
      c.data_vencimento>=b.start_date and c.data_vencimento<b.end_date in_month,
      least(p_today+1,b.end_date) payment_exclusive,
      internal_proesc.reconciliation_source_system(c) source_system,
      l.id link_id,l.source_key,f.id snapshot_id,f.observed_at,f.verification,f.source_status,
      f.evidence_kind,f.collector_review_reasons,
      f.principal_cents,f.received_cents,f.payment_date,
      coalesce(c.origem_cronograma_id,'') like 'PROESC-V1:%' imported_without_link,
      internal_contas.caixa_proesc_open_receivable_verified(c,f) open_verified
    from public.contas_receber c cross join bounds b
    left join internal_proesc.obligation_links l on l.receivable_id=c.id
    left join lateral internal_contas.caixa_proesc_effective_snapshot(c,l.id) f on true
    where (p_polo_id is null or c.polo_id=p_polo_id)
      and c.status in ('PAGO','PENDENTE','VENCIDO','AGUARDANDO_CONFIRMACAO','AGUARDANDO_PAGAMENTO')
      and not internal_contas.ead_checkout_is_optional(c.id)
      and not internal_contas.ead_checkout_paid_after_cutoff(c.id,least(p_today+1,b.end_date))
      and not exists(select 1 from public.emprestimos_financeiros e where e.conta_receber_id=c.id)
      and not (c.status<>'PAGO' and c.regra_financeira_tecnica_snapshot->'cicloManual' is not null
        and c.gateway_payment_id is null and c.gateway_boleto_nosso_numero is null
        and not exists(select 1 from public.payment_gateway_cnab_records r where r.receivable_id=c.id
          and r.provider_code in ('banese','banese_card')
          and r.status in ('RECORDED','ACTIVATION_PENDING','ACTIVATED')))
  ), reviewed as (
    select e.*,
      case when link_id is null then false
        when source_system<>'PROESC' then true
        when verification is distinct from 'VERIFIED' then true
        when status='PAGO' then source_status is distinct from 'PAID'
          or principal_cents is distinct from round(valor*100)::bigint
          or received_cents is distinct from round(valor_pago*100)::bigint
          or payment_date is distinct from data_pagamento
        else source_status is distinct from 'OPEN' end monthly_review,
      case when link_id is null then imported_without_link
        when source_system<>'PROESC' then true
        when status='PAGO' then verification is distinct from 'VERIFIED'
          or source_status is distinct from 'PAID'
          or principal_cents is distinct from round(valor*100)::bigint
          or received_cents is distinct from round(valor_pago*100)::bigint
          or payment_date is distinct from data_pagamento
        else not open_verified end portfolio_review
    from evidence e
  )
  select r.id,r.polo_id,r.data_vencimento,r.valor,r.in_month,
    internal_contas.caixa_monthly_receivable_state(status,data_pagamento,payment_exclusive,monthly_review,valor_pago),
    internal_contas.caixa_monthly_receivable_state(status,data_pagamento,payment_exclusive,portfolio_review,valor_pago),
    source_system,source_key,snapshot_id,observed_at,
    case
      when link_id is null and imported_without_link then 'PROESC_LINK_MISSING'
      when link_id is not null and source_system<>'PROESC' then 'SOURCE_IDENTITY_CONFLICT'
      when link_id is not null and observed_at is null then 'SOURCE_EVIDENCE_MISSING'
      when link_id is not null and source_status in ('CANCELED','RENEGOTIATED') then 'SOURCE_STATE_REVIEW'
      when evidence_kind='API_V2_INVOICE_REVIEW'
        and collector_review_reasons ? 'PROVIDER_PAYMENT_STATUS_REQUIRES_REVIEW' then 'V2_PAYMENT_STATUS_REVIEW'
      when verification='REVIEW' and collector_review_reasons ? 'NO_PAYMENT_IN_OBSERVED_PERIODS'
        then 'SOURCE_NO_PAYMENT_CONFIRMATION'
      when link_id is not null and verification is distinct from 'VERIFIED' then 'SOURCE_UNVERIFIED'
      when status='PAGO' and data_pagamento is null then 'PAYMENT_DATE_MISSING'
      when status<>'PAGO' and coalesce(valor_pago,0)>0 then 'PAYMENT_REQUIRES_REVIEW'
      when link_id is not null and status='PAGO' then 'PAYMENT_EVIDENCE_CONFLICT'
      when link_id is not null and not open_verified then 'OPEN_EVIDENCE_CONFLICT'
      else 'FINANCIAL_REVIEW' end
  from reviewed r;
$function$
;
CREATE OR REPLACE FUNCTION public.get_caixa_receivables_position_secure(p_polo_id uuid, p_competencia date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_today date:=(now() at time zone 'America/Maceio')::date;
  v_start date:=date_trunc('month',p_competencia)::date;
  v_end date:=(date_trunc('month',p_competencia)+interval '1 month')::date;
  v_result jsonb;
begin
  perform internal_contas.caixa_assert_receivables_scope(p_polo_id);
  if p_competencia is null or not isfinite(p_competencia)
    or v_start>date_trunc('month',v_today)::date then
    raise exception 'Competência inválida.' using errcode='22023'; end if;
  with rows as materialized (
    select * from internal_contas.caixa_receivables_position_rows(p_polo_id,p_competencia,v_today)
  ), contexts as (
    select 'monthly' context,principal,due_date,monthly_position position from rows where in_month
    union all
    select 'portfolio',principal,due_date,portfolio_position from rows
  ), totals as (
    select context,
      coalesce(sum(principal) filter(where position='OUTSTANDING'),0)::numeric(20,2) opened,
      coalesce(sum(principal) filter(where position='OUTSTANDING'
        and due_date<least(v_today,v_end)),0)::numeric(20,2) overdue,
      coalesce(sum(principal) filter(where position='OUTSTANDING'
        and due_date>=least(v_today,v_end)),0)::numeric(20,2) to_due,
      count(*) filter(where position='OUTSTANDING') eligible_count,
      count(*) filter(where position='REVIEW') review_count,
      coalesce(sum(principal) filter(where position='REVIEW'),0)::numeric(20,2) review_nominal
    from contexts group by context
  ), payloads as (
    select names.context,jsonb_build_object(
      'openConfirmed',coalesce(t.opened,0)::numeric(20,2)::text,
      'overdue',coalesce(t.overdue,0)::numeric(20,2)::text,
      'toDue',coalesce(t.to_due,0)::numeric(20,2)::text,
      'count',coalesce(t.eligible_count,0),'reviewCount',coalesce(t.review_count,0),
      'reviewNominal',coalesce(t.review_nominal,0)::numeric(20,2)::text) payload
    from (values('monthly'),('portfolio')) names(context)
    left join totals t on t.context=names.context
  )
  select jsonb_build_object('success',true,'data',jsonb_build_object(
    'poloId',p_polo_id,'competencia',v_start,'dataCorte',least(v_today,v_end-1),'geradoEm',now(),
    'monthly',(select payload from payloads where context='monthly'),
    'portfolio',(select payload from payloads where context='portfolio')))
  into v_result;
  return v_result;
end;
$function$

;
