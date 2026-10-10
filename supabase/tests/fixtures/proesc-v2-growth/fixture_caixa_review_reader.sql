CREATE OR REPLACE FUNCTION public.get_caixa_review_pending_page_secure(p_polo_id uuid, p_competencia date, p_context text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 20)
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
$function$

