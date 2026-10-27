begin;
set local lock_timeout = '5s';

create function internal_academic.enrollment_receivable_source(p_receivable public.contas_receber)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_proesc boolean;
  v_residual boolean;
  v_external_known boolean;
  v_imported boolean;
  v_native boolean;
  v_bank_identity boolean;
  v_local boolean := coalesce(internal_academic.manual_cycle_local_receivable_complete(p_receivable),false);
  v_bank_attempt boolean := p_receivable.gateway_creation_token is not null
    or p_receivable.gateway_payment_id is not null or p_receivable.gateway_submission_status is not null;
  v_cycle integer;
  v_origin text;
  v_provider text := nullif(lower(btrim(p_receivable.gateway_provider)), '');
  v_run internal_academic.technical_manual_cycle_runs%rowtype;
  v_run_count integer;
begin
  select exists(select 1 from internal_proesc.obligation_links l
    where l.receivable_id = p_receivable.id) into v_proesc;
  select exists(select 1 from internal_proesc.obligation_links l
    where l.receivable_id=p_receivable.id and l.kind='RESIDUAL') into v_residual;
  select exists(select 1 from internal_proesc.obligation_links l
    where l.receivable_id=p_receivable.id and l.matricula_id=p_receivable.matricula_id
      and l.confirmed_at is not null and nullif(l.source_key,'') is not null
      and (exists(select 1 from internal_proesc.obligation_imports i
        where i.link_id=l.id and nullif(i.source_fingerprint,'') is not null)
        or exists(select 1 from internal_proesc.financial_snapshots s
          where s.link_id=l.id and nullif(s.source_fingerprint,'') is not null))) into v_external_known;
  select count(*) into v_run_count from internal_academic.technical_manual_cycle_runs r
    where p_receivable.id=any(r.receivable_ids);
  select * into v_run from internal_academic.technical_manual_cycle_runs r
    where r.matricula_id = p_receivable.matricula_id
      and p_receivable.id = any(r.receivable_ids) order by r.cycle_number desc limit 1;
  select coalesce(bool_or(t.raw_payload->>'importSource' = 'BANESE_API_LEGACY_DISCOVERY'), false),
    count(*) = 1 and coalesce(bool_and(
      lower(t.provider_code) in ('banese','banese_card')
      and t.environment = p_receivable.gateway_environment
      and t.payment_method = 'BOLETO'
      and nullif(t.remote_payment_id,'') = nullif(p_receivable.gateway_payment_id,'')
      and nullif(t.bank_slip_our_number,'') = nullif(p_receivable.gateway_boleto_nosso_numero,'')
      and t.amount = p_receivable.valor), false)
  into v_imported, v_bank_identity from public.payment_gateway_transactions t
  where t.receivable_id = p_receivable.id;
  v_imported := v_imported or coalesce(v_run.state = 'PROTECTED_EXISTING', false);
  v_native := coalesce(v_run.state = 'LOCAL_CREATED', false)
    or p_receivable.gateway_creation_token is not null;
  v_origin := case
    when v_run_count>1 or (v_proesc and (v_provider is not null or v_imported or v_native)) then 'CONFLICT'
    when v_proesc then 'PROESC_HISTORY'
    when v_imported then 'BANESE_LEGACY_IMPORTED'
    when v_native then 'UNIVERSO_NATIVE'
    when p_receivable.regra_financeira_tecnica_snapshot->>'destinoCobranca' = 'LOCAL' then 'LOCAL'
    else 'UNKNOWN' end;
  v_cycle := v_run.cycle_number;
  if v_cycle is null and p_receivable.regra_financeira_tecnica_snapshot#>>'{cicloManual,cicloNumero}' in ('1','2') then
    v_cycle := (p_receivable.regra_financeira_tecnica_snapshot#>>'{cicloManual,cicloNumero}')::integer;
  end if;
  if v_cycle is null then
    select case i.source_cycle when 'FIRST' then 1 when 'SECOND' then 2 end into v_cycle
      from internal_proesc.obligation_links l join internal_proesc.obligation_imports i on i.link_id=l.id
      where l.receivable_id=p_receivable.id limit 1;
  end if;
  return jsonb_build_object('origem',v_origin,'provedor',v_provider,
    'canal',p_receivable.gateway_submission_channel,'cicloNumero',v_cycle,
    'destino',case when v_local then 'LOCAL'
      when v_origin='PROESC_HISTORY' then 'EXTERNO'
      when v_imported or v_native then 'BANESE' else null end,
    'mensalidade',p_receivable.tipo_lancamento='PARCELA' and not v_residual,'ajusteResidual',v_residual,
    'cancelada',p_receivable.status='CANCELADO','paga',p_receivable.status='PAGO',
    'externaConhecida',v_origin='PROESC_HISTORY' and v_external_known,
    'emitidaBanco',coalesce(v_origin in ('BANESE_LEGACY_IMPORTED','UNIVERSO_NATIVE')
      and v_provider in ('banese','banese_card') and v_bank_identity
      and coalesce(p_receivable.gateway_submission_status not in ('API_AMBIGUOUS','API_REVIEW'),true)
      and (v_imported or p_receivable.gateway_boleto_issued_at is not null),false),
    'emRevisao',coalesce(v_origin in ('UNKNOWN','CONFLICT')
      or (v_origin='PROESC_HISTORY' and not v_external_known)
      or (not v_local and (v_imported or v_bank_attempt) and not v_bank_identity)
      or (p_receivable.regra_financeira_tecnica_snapshot->>'destinoCobranca'='LOCAL' and not v_local)
      or coalesce(p_receivable.gateway_submission_status in ('API_AMBIGUOUS','API_REVIEW'),false),false));
end;
$function$;

create function internal_academic.enrollment_financial_context(p_matricula_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $function$
  with titles as materialized (
    select r.id,r.tipo_lancamento,r.status,internal_academic.enrollment_receivable_source(r) as source
    from public.contas_receber r where r.matricula_id=p_matricula_id
  ), sources as (
    select source->>'origem' as origin,source->>'provedor' as provider,source->>'canal' as channel,
      count(*) as quantity from titles group by 1,2,3
  ), counts as (
    select count(*) filter(where source->>'mensalidade'='true') as launched,
      count(*) filter(where source->>'mensalidade'='true' and status<>'CANCELADO'
        and source->>'emitidaBanco'='true') as bank_issued,
      count(*) filter(where source->>'mensalidade'='true' and status<>'CANCELADO'
        and source->>'externaConhecida'='true') as external_known,
      count(*) filter(where source->>'mensalidade'='true' and status='CANCELADO') as canceled,
      count(*) filter(where source->>'mensalidade'='true' and status='PAGO') as paid,
      count(*) filter(where source->>'mensalidade'='true' and source->>'emRevisao'='true') as review,
      count(*) filter(where tipo_lancamento in ('MATRICULA','REMATRICULA')) as fees,
      count(*) filter(where source->>'ajusteResidual'='true') as residuals
    from titles
  )
  select jsonb_build_object('versao',1,'matriculaId',p_matricula_id,
    'fontes',coalesce((select jsonb_agg(jsonb_build_object('origem',origin,'provedor',provider,
      'canal',channel,'quantidade',quantity) order by origin,provider,channel) from sources),'[]'::jsonb),
    'mensalidades',jsonb_build_object('lancadas',launched,'emitidas',bank_issued+external_known,
      'bancariasEmitidas',bank_issued,'externasConhecidas',external_known,'canceladas',canceled,
      'pagas',paid,'emRevisao',review),
    'taxas',fees,'ajustesResiduais',residuals,'ciclosComprovados',coalesce((select jsonb_agg(jsonb_build_object(
      'numero',f.cycle_number,'origem',f.administration_origin,'confirmadoEm',f.confirmed_at,
      'identidadeConfirmada',internal_academic.technical_imported_cycle_has_confirmed(f.matricula_id,f.cycle_number),
      'emRevisao',internal_academic.technical_imported_cycle_has_conflict(f.matricula_id))
      order by f.cycle_number) from internal_academic.technical_imported_cycle_facts f
      where f.matricula_id=p_matricula_id),'[]'::jsonb),
    'operacoes',coalesce((select jsonb_agg(jsonb_build_object('cicloNumero',r.cycle_number,
      'estado',r.state,'requestId',r.request_id,'quantidadeItens',r.item_count)
      order by r.cycle_number) from internal_academic.technical_manual_cycle_runs r
      where r.matricula_id=p_matricula_id),'[]'::jsonb)) from counts;
$function$;

revoke all on function internal_academic.enrollment_receivable_source(public.contas_receber),
  internal_academic.enrollment_financial_context(uuid) from public,anon,authenticated,service_role;
commit;
