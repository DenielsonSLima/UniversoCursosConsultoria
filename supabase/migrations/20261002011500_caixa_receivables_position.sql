begin;

-- Additive API: does not change old statement/PDF/cash receipts contracts.
-- Amounts are nominal obligations, never nominal minus a discounted payment.
create function public.get_caixa_receivables_position_secure(p_polo_id uuid,p_competencia date)
returns jsonb language plpgsql stable security definer set search_path='' as $summary$
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
$summary$;

revoke all on function public.get_caixa_receivables_position_secure(uuid,date)
  from public,anon,authenticated,service_role;
grant execute on function public.get_caixa_receivables_position_secure(uuid,date)
  to authenticated,service_role;
notify pgrst,'reload schema';
commit;
