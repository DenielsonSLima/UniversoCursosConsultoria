begin;

-- Read-side only. Both readers use the same positioned rows and reason codes.
-- MONTHLY deliberately preserves the existing delinquency classifier; the
-- whole portfolio additionally retains the stronger open-obligation proof.
create function internal_contas.caixa_receivables_position_rows(
  p_polo_id uuid,p_competencia date,p_today date
) returns table(
  id uuid,polo_id uuid,due_date date,principal numeric,in_month boolean,
  monthly_position text,portfolio_position text,source_system text,
  source_key text,snapshot_id uuid,observed_at timestamptz,reason_code text
) language sql stable security invoker set search_path='' as $rows$
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
$rows$;

create function internal_contas.caixa_assert_receivables_scope(p_polo_id uuid)
returns void language plpgsql stable security invoker set search_path='' as $scope$
declare v_allowed boolean;
begin
  if coalesce(auth.jwt()->>'role','')='service_role' then return; end if;
  if auth.uid() is null or not coalesce(public.is_gestor(),false) then
    raise exception 'Identidade gestora válida é obrigatória.' using errcode='42501'; end if;
  v_allowed:=case when p_polo_id is null then
    coalesce(public.gestor_has_any_global_module(array['caixa']),false)
    or (coalesce(public.gestor_has_any_global_module(array['financeiro']),false)
      and coalesce(public.gestor_has_effective_financeiro_tab('receber'),false))
  else coalesce(public.gestor_has_any_module_for_polo(array['caixa'],p_polo_id),false)
    or (coalesce(public.gestor_has_any_module_for_polo(array['financeiro'],p_polo_id),false)
      and coalesce(public.gestor_has_effective_financeiro_tab('receber'),false)) end;
  if not v_allowed then
    raise exception 'Módulo, aba ou polo fora do escopo autorizado do Caixa.' using errcode='42501'; end if;
end;
$scope$;

create function public.get_caixa_review_pending_page_secure(
  p_polo_id uuid,p_competencia date,p_context text,
  p_page integer default 1,p_page_size integer default 20
) returns jsonb language plpgsql stable security definer set search_path='' as $page$
declare
  v_today date:=(now() at time zone 'America/Maceio')::date;
  v_start date:=date_trunc('month',p_competencia)::date;
  v_end date:=(date_trunc('month',p_competencia)+interval '1 month')::date;
  v_result jsonb;
begin
  perform internal_contas.caixa_assert_receivables_scope(p_polo_id);
  if p_competencia is null or not isfinite(p_competencia)
    or v_start>date_trunc('month',v_today)::date
    or p_context is null or p_context not in ('MONTHLY','FUTURE')
    or p_page is null or p_page<1 or p_page>1000000
    or p_page_size is null or p_page_size<1 or p_page_size>100 then
    raise exception 'Filtro ou paginação inválida.' using errcode='22023'; end if;
  with pending as materialized (
    select r.* from internal_contas.caixa_receivables_position_rows(p_polo_id,p_competencia,v_today) r
    where case p_context when 'MONTHLY' then r.in_month and r.monthly_position='REVIEW'
      else r.portfolio_position='REVIEW' end
  ), totals as (
    select count(*) total,coalesce(sum(principal),0)::numeric(20,2) nominal from pending
  ), page_rows as materialized (
    select * from pending order by due_date,id
    limit p_page_size offset ((p_page::bigint-1)*p_page_size)
  ), hydrated as (
    select r.due_date,r.id,jsonb_build_object(
      'id',r.id,'alunoNome',student.nome,'turmaNome',t.nome,'turmaCodigo',t.codigo,
      'matriculaCodigo',student.matricula_acesso,'proescRef',r.source_key,
      'vencimento',r.due_date,'valorNominal',r.principal::numeric(20,2)::text,
      'fonte',r.source_system,'observadoEm',r.observed_at,
      'motivos',jsonb_build_array(jsonb_build_object('codigo',reason.code,'descricao',case reason.code
        when 'PROESC_LINK_MISSING' then 'Cobrança importada sem vínculo de origem validado.'
        when 'SOURCE_IDENTITY_CONFLICT' then 'A identidade ou a origem da cobrança precisa ser conferida.'
        when 'SOURCE_EVIDENCE_MISSING' then 'Não há evidência financeira suficiente para confirmar esta cobrança.'
        when 'SOURCE_STATE_REVIEW' then 'Há indicação histórica de cancelamento ou renegociação, sem confirmação financeira suficiente no corte. A cobrança não foi tratada como cancelada.'
        when 'V2_PARTIAL_PAYMENT_REVIEW' then 'A Proesc V2 informa pagamento parcial. O valor recebido não comprova quitação integral nem permite presumir saldo pela diferença.'
        when 'V2_SUPERIOR_PAYMENT_REVIEW' then 'A Proesc V2 informa pagamento superior. Falta conciliar a quitação com a obrigação local; não foi presumido saldo.'
        when 'V2_PAYMENT_STATUS_REVIEW' then 'O estado de pagamento informado pela Proesc V2 exige conciliação antes de confirmar quitação ou saldo.'
        when 'SOURCE_NO_PAYMENT_CONFIRMATION' then 'As consultas históricas não confirmaram pagamento nem abertura da cobrança. Ausência na V2 não comprova cancelamento.'
        when 'SOURCE_UNVERIFIED' then 'A evidência da origem ainda não confirma quitação nem saldo em aberto.'
        when 'PAYMENT_DATE_MISSING' then 'Pagamento registrado sem data suficiente para posicionar a cobrança no corte.'
        when 'PAYMENT_REQUIRES_REVIEW' then 'Há valor recebido sem quitação confirmada; não foi presumido saldo residual.'
        when 'PAYMENT_EVIDENCE_CONFLICT' then 'Dados do pagamento local e da evidência da origem precisam ser conciliados.'
        when 'OPEN_EVIDENCE_CONFLICT' then 'A evidência não confirma o valor nominal integral em aberto.'
        else 'A situação financeira precisa ser conferida antes de entrar no indicador.' end))) item
    from page_rows r join public.contas_receber c on c.id=r.id
    left join public.matriculas m on m.id=c.matricula_id
    left join public.parceiros student on student.id=coalesce(m.aluno_id,c.cliente_id)
    left join public.turmas t on t.id=coalesce(c.turma_id,m.turma_id)
    left join lateral (
      select o.source_status from internal_proesc.v2_invoice_observations o
      where r.reason_code='V2_PAYMENT_STATUS_REVIEW' and o.snapshot_id=r.snapshot_id
        and o.invoice_id=r.source_key
      order by o.observed_at desc,o.recorded_at desc,o.id desc limit 1
    ) observation on true
    cross join lateral (select case
      when r.reason_code='V2_PAYMENT_STATUS_REVIEW' and observation.source_status='PAGAMENTO PARCIAL'
        then 'V2_PARTIAL_PAYMENT_REVIEW'
      when r.reason_code='V2_PAYMENT_STATUS_REVIEW' and observation.source_status='PAGAMENTO SUPERIOR'
        then 'V2_SUPERIOR_PAYMENT_REVIEW'
      else r.reason_code end code) reason
  )
  select jsonb_build_object('success',true,'data',jsonb_build_object(
    'poloId',p_polo_id,'context',p_context,'competencia',v_start,
    'dataCorte',least(v_today,v_end-1),'geradoEm',now(),
    'page',p_page,'pageSize',p_page_size,'totalPages',greatest(1,ceil(t.total::numeric/p_page_size)::integer),
    'totalCount',t.total,'totalNominal',t.nominal::text,
    'items',coalesce((select jsonb_agg(item order by due_date,id) from hydrated),'[]'::jsonb)))
  into v_result from totals t;
  return v_result;
end;
$page$;

revoke all on function internal_contas.caixa_receivables_position_rows(uuid,date,date),
  internal_contas.caixa_assert_receivables_scope(uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_caixa_review_pending_page_secure(uuid,date,text,integer,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.get_caixa_review_pending_page_secure(uuid,date,text,integer,integer)
  to authenticated,service_role;
notify pgrst,'reload schema';
commit;
