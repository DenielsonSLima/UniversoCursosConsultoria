begin;
set local lock_timeout='5s';
do $drift$ begin
 if md5(pg_get_functiondef('internal_academic.enrollment_receivable_source(public.contas_receber)'::regprocedure))<>'3d0f3a31e204dacdf17ce5a597dcd788'
 or md5(pg_get_functiondef('internal_academic.technical_manual_monthly_count(uuid)'::regprocedure))<>'f3e5b9c1c0fe99012a5d52f52c4db59f'
 or md5(pg_get_functiondef('internal_academic.manager_second_cycle_permitted(uuid)'::regprocedure))<>'8391f84fb4b06539e6d62016779a7c84'
 then raise exception 'Classificação canônica mudou; revisar otimização.'; end if;
end $drift$;

CREATE OR REPLACE FUNCTION internal_academic.enrollment_receivable_source(p_receivable contas_receber)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_proesc boolean;
  v_residual boolean;
  v_external_known boolean;
  v_imported boolean;
  v_native boolean;
  v_bank_identity boolean;
  v_local boolean := case when p_receivable.tipo_lancamento='MATRICULA'
    then coalesce(internal_academic.manual_cycle_local_receivable_complete(p_receivable),false) else false end;
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
$function$
;

create or replace function internal_academic.technical_manual_monthly_count(p_matricula_id uuid)
returns integer language sql stable security definer set search_path='' as $function$
 with titles as materialized (
  select internal_academic.enrollment_receivable_source(r) as source
  from public.contas_receber r where r.matricula_id=p_matricula_id
   and r.tipo_lancamento='PARCELA' and r.status<>'CANCELADO'
 ) select count(*)::integer from titles where source->>'mensalidade'='true'
   and (source->>'emitidaBanco'='true' or source->>'externaConhecida'='true');
$function$;

CREATE OR REPLACE FUNCTION internal_academic.manager_second_cycle_permitted(p_matricula_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  begin
  if exists(select 1 from internal_academic.technical_manual_cycle_runs run
    where run.matricula_id=p_matricula_id and run.cycle_number=2
      and not (run.state='GENERATING' and run.completed_at is null
        and run.request_id is not null
        and coalesce(run.xmin=pg_current_xact_id_if_assigned()::xid,false))) then return false; end if;
  return (select exists (
    select 1 from public.matriculas m
    join public.turmas t on t.id = m.turma_id
    join public.cursos c on c.id = t.curso_id
    where m.id = p_matricula_id and upper(m.status) in ('ATIVO', 'PENDENTE')
      and upper(c.modalidade) in ('TECNICO', 'TÉCNICO')
      and exists (select 1 from public.matriculas_tecnicas_financeiro_config cfg
        where cfg.matricula_id = m.id)
      and internal_academic.technical_manual_monthly_count(m.id) < 24
      and not internal_academic.technical_imported_cycle_has_conflict(m.id)
      and not internal_academic.technical_imported_cycle_exists(m.id, 2)
      and not internal_academic.technical_cycle_history_outside_enrollment(m.id)
      and (
        exists (select 1 from internal_academic.technical_manual_cycle_policies p
          where p.turma_id = m.turma_id and p.active and p.generation_mode = 'MANUAL'
            and p.baseline_cycle = 1 and p.max_cycle = 2)
        or exists (select 1 from internal_academic.technical_manual_cycle_runs run
          where run.matricula_id = m.id and run.cycle_number = 1
            and run.state in ('LOCAL_CREATED', 'PROTECTED_EXISTING'))
      )
      and not exists (select 1 from internal_academic.technical_manual_cycle_runs run
        where run.matricula_id = m.id and run.cycle_number = 2
          and not (run.state = 'GENERATING' and run.completed_at is null
            and run.request_id is not null
            and coalesce(run.xmin = pg_catalog.pg_current_xact_id_if_assigned()::xid, false)))
      and not exists (select 1 from public.contas_receber r
        where r.matricula_id = m.id and r.status <> 'CANCELADO'
          and (r.tipo_lancamento = 'REMATRICULA'
            or r.regra_financeira_tecnica_snapshot#>>'{cicloManual,cicloNumero}' = '2'
            or r.origem_cronograma_id = 'ciclo-1-rematricula'
            or r.origem_cronograma_id like 'ciclo-2-parc-%')
          and not exists (select 1 from internal_academic.technical_manual_cycle_runs run
            where run.matricula_id = m.id and run.cycle_number = 2
              and run.state = 'GENERATING' and run.completed_at is null
              and run.request_id is not null
              and coalesce(run.xmin = pg_catalog.pg_current_xact_id_if_assigned()::xid, false)
              and r.regra_financeira_tecnica_snapshot#>>'{cicloManual,requestId}' = run.request_id::text))
      and not exists (select 1 from internal_academic.technical_external_cycle_coverage cov
        where cov.matricula_id = m.id)
      and not exists (select 1 from internal_proesc.enrollment_cycle_evidence e
        where e.matricula_id = m.id and e.verification = 'CONFIRMED'
          and e.has_external_cycle2 is true)
      and not exists (select 1 from internal_proesc.obligation_links l
        join internal_proesc.obligation_imports i on i.link_id = l.id
        where l.matricula_id = m.id and i.source_cycle in ('SECOND', 'FULL_CONTRACT'))
  ));
end;
$function$

;
commit;
