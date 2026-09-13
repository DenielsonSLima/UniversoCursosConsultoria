-- Read-only focused checks; helper fixtures are VALUES, never stored records.
do $monthly_delinquency_dates$
declare
  v_case record;
begin
  for v_case in select * from (values
    ('PAGO','2026-07-31'::date,false,260::numeric,'SETTLED'),
    ('PAGO','2026-08-01'::date,false,260::numeric,'OUTSTANDING'),
    ('PAGO',null::date,false,260::numeric,'REVIEW'),
    ('PAGO','2026-07-12'::date,true,260::numeric,'REVIEW'),
    ('PENDENTE',null::date,true,0::numeric,'REVIEW'),
    ('PENDENTE',null::date,false,0::numeric,'OUTSTANDING'),
    ('VENCIDO',null::date,false,50::numeric,'REVIEW'),
    ('CANCELADO',null::date,true,0::numeric,'EXCLUDED'),
    ('SUSPENSO',null::date,true,0::numeric,'EXCLUDED')
  ) t(status,payment_date,requires_review,received,expected) loop
    assert internal_contas.caixa_monthly_receivable_state(v_case.status,v_case.payment_date,
      '2026-08-01',v_case.requires_review,v_case.received)=v_case.expected,
      'Monthly settlement classification failed: '||v_case.expected;
  end loop;
  assert internal_contas.caixa_monthly_receivable_state('PAGO','2026-09-12','2026-09-13',false,260)='SETTLED',
    'Payment today was incorrectly outstanding';
  assert not has_function_privilege('authenticated',
    'internal_contas.caixa_monthly_delinquency(uuid,date,date)','execute'),'Private unrestricted aggregate exposed';
  assert not has_function_privilege('anon',
    'internal_contas.caixa_monthly_delinquency(uuid,date,date)','execute'),'Private aggregate exposed to anon';
end;
$monthly_delinquency_dates$;

do $monthly_delinquency_scope$
declare
  v_claims text:=current_setting('request.jwt.claims',true);
  v_role text:=current_setting('request.jwt.claim.role',true);
  v_sub text:=current_setting('request.jwt.claim.sub',true);
  v_actor uuid;
  v_email text;
  v_polo uuid;
  v_candidate record;
  v_restricted_tested boolean:=false;
  v_statement jsonb;
  v_report jsonb;
  v_core jsonb;
  v_july jsonb;
  v_august jsonb;
  v_expected_review bigint;
  v_started timestamptz:=clock_timestamp();
begin
  select a.id,a.email into strict v_actor,v_email
  from internal_proesc.connection c
  join public.usuarios_sistema u on u.id=c.updated_by
  join auth.users a on lower(btrim(a.email))=lower(btrim(u.email))
  where lower(u.status)='ativo' limit 1;
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
  begin
    perform public.get_caixa_prestacao_mensal_secure(null,'2026-07-01',1);
    raise exception 'Unidentified session obtained financial statement';
  exception when sqlstate '42501' then null; end;
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_actor,'email',v_email)::text,true);
  select p.id into strict v_polo from public.polos p
    where p.id=any(public.gestor_allowed_polo_ids()) and upper(p.cidade)='JAPOATÃ' limit 1;
  -- A global manager legitimately passes is_gestor_for_polo for any UUID.
  -- Exercise isolation only with an existing, genuinely restricted Auth actor.
  for v_candidate in select distinct a.id,a.email from public.usuarios_sistema u
    join auth.users a on lower(btrim(a.email))=lower(btrim(u.email))
    where lower(u.status)='ativo' and a.id<>v_actor limit 50 loop
    perform set_config('request.jwt.claim.sub',v_candidate.id::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
      'sub',v_candidate.id,'email',v_candidate.email)::text,true);
    if public.is_gestor() and not public.is_gestor_global()
      and public.gestor_has_any_module(array['caixa','financeiro']) then
      begin
        perform public.get_caixa_prestacao_mensal_secure(null,'2026-07-01',1);
        raise exception 'Restricted actor received a global statement';
      exception when sqlstate '42501' then null; end;
      begin
        perform public.get_caixa_prestacao_mensal_secure('00000000-0000-0000-0000-000000000000','2026-07-01',1);
        raise exception 'Restricted actor accessed an unauthorized polo';
      exception when sqlstate '42501' then null; end;
      v_restricted_tested:=true;
      exit;
    end if;
  end loop;
  if not v_restricted_tested then
    raise notice 'Restricted-actor runtime check unavailable: no matching active Auth fixture; identity-negative check passed';
  end if;
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_actor,'email',v_email)::text,true);
  v_statement:=public.get_caixa_prestacao_mensal_secure(v_polo,'2026-07-01',1);
  v_core:=public.get_caixa_prestacao_mensal_v2_core(v_polo,'2026-07-01',1);
  v_july:=v_statement#>'{compromissos,inadimplencia_mensal}';
  assert v_july->>'periodo_inicio'='2026-07-01' and v_july->>'periodo_fim_exclusivo'='2026-08-01',
    'Selected month did not reach indicator';
  assert v_july->>'data_corte'='2026-07-31','Historical cutoff moved with today';
  assert ((v_statement->'compromissos')-array['receber_vencido','margem_inadimplencia','inadimplencia_mensal'])
    =((v_core->'compromissos')-array['receber_vencido','margem_inadimplencia']),
    'Unrequested commitment totals were changed';
  assert v_statement->'saldos_hoje'=v_core->'saldos_hoje','Current cash position changed';
  select count(*) into v_expected_review from public.contas_receber c
  join internal_proesc.obligation_links l on l.receivable_id=c.id
  join lateral(select f.verification,f.source_status from internal_proesc.financial_snapshots f
    where f.link_id=l.id order by f.observed_at desc,f.recorded_at desc,f.id desc limit 1) f on true
  where c.polo_id=v_polo and c.data_vencimento>='2026-07-01' and c.data_vencimento<'2026-08-01'
    and c.status in ('PENDENTE','VENCIDO') and f.verification='REVIEW' and f.source_status='UNKNOWN';
  assert (v_july->>'quantidade_em_conferencia')::bigint>=v_expected_review,'Unknown source amounts were counted as debt';
  if v_expected_review>0 then assert v_july->>'completo'='false','Incomplete source reported as complete'; end if;
  assert (v_statement#>>'{compromissos,receber_vencido}')::numeric<=(v_july->>'base_elegivel')::numeric,
    'Numerator exceeded the monthly cohort';
  v_report:=public.get_caixa_relatorio_mensal_detalhado_secure(v_polo,'2026-07-01');
  assert v_report#>'{resumo,compromissos}'=v_statement->'compromissos',
    'PDF report did not inherit the canonical monthly indicator';
  v_august:=internal_contas.caixa_monthly_delinquency(v_polo,'2026-08-01','2026-09-12');
  assert v_august#>>'{inadimplencia_mensal,data_corte}'='2026-08-31','August cutoff is incorrect';
  assert v_july is distinct from v_august->'inadimplencia_mensal','Month selection reused the same cohort';
  perform set_config('request.jwt.claims',coalesce(v_claims,''),true);
  perform set_config('request.jwt.claim.role',coalesce(v_role,''),true);
  perform set_config('request.jwt.claim.sub',coalesce(v_sub,''),true);
  raise notice 'Monthly scope, cutoff, incomplete evidence, cash preservation and PDF checks passed in % ms',
    round(extract(epoch from clock_timestamp()-v_started)*1000);
end;
$monthly_delinquency_scope$;
