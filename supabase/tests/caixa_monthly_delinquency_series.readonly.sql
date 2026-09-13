-- Pure SVG-coordinate fixtures, without creating or changing financial rows.
do $chart_domain$
declare
  v_source jsonb:='[{"entradas":100,"saidas":150,"resultado":-50,"inadimplencia":200,"inadimplencia_completo":false},{"entradas":0,"saidas":0,"resultado":0,"inadimplencia":0,"inadimplencia_completo":true}]';
  v_result jsonb;
  v_coordinate_keys text[]:=array['entradas_escala_percentual','saidas_escala_percentual',
    'inadimplencia_escala_percentual','resultado_posicao_percentual',
    'inadimplencia_posicao_percentual','grafico_zero_posicao_percentual'];
begin
  v_result:=internal_contas.caixa_monthly_chart_series(v_source);
  assert (v_result#>>'{0,grafico_zero_posicao_percentual}')::numeric=80,'Negative-result domain lost shared baseline';
  assert (v_result#>>'{0,resultado_posicao_percentual}')::numeric=100,'Negative result left chart domain';
  assert (v_result#>>'{0,inadimplencia_posicao_percentual}')::numeric=0,'Maximum arrears not at top';
  assert (v_result#>>'{0,entradas_escala_percentual}')::numeric=40,'Incoming bars use a different scale';
  assert (v_result#>>'{0,saidas_escala_percentual}')::numeric=60,'Outgoing bars use a different scale';
  assert (v_result#>>'{0,inadimplencia_escala_percentual}')::numeric=80,'Arrears height uses a different scale';
  assert (v_result->0)-v_coordinate_keys=v_source->0,'Projection changed original monetary values or evidence';
  assert (v_result->1)-v_coordinate_keys=v_source->1,'Zero point lost original values';
  v_result:=internal_contas.caixa_monthly_chart_series('[{"entradas":0,"saidas":0,"resultado":0,"inadimplencia":0}]');
  assert (v_result#>>'{0,grafico_zero_posicao_percentual}')::numeric=100,'Zero-domain baseline changed';
  assert (v_result#>>'{0,resultado_posicao_percentual}')::numeric=100,'Zero-domain result is not on baseline';
  assert (v_result#>>'{0,inadimplencia_posicao_percentual}')::numeric=100,'Zero-domain arrears is not on baseline';
  assert (v_result#>>'{0,entradas_escala_percentual}')::numeric=0,'Zero-domain bar is not empty';
  assert internal_contas.caixa_monthly_chart_series('[]')='[]'::jsonb,'Empty series manufactured points';
  assert not has_function_privilege('authenticated','internal_contas.caixa_monthly_chart_series(jsonb)','execute'),
    'Private graph helper exposed';
end;
$chart_domain$;

do $chart_monthly_rpc$
declare
  v_claims text:=current_setting('request.jwt.claims',true);
  v_role text:=current_setting('request.jwt.claim.role',true);
  v_sub text:=current_setting('request.jwt.claim.sub',true);
  v_actor uuid;
  v_email text;
  v_polo uuid;
  v_statement jsonb;
  v_point jsonb;
  v_month jsonb;
  v_report jsonb;
  v_key text;
  v_started timestamptz:=clock_timestamp();
  v_expected_date date:='2026-07-01';
begin
  select a.id,a.email into strict v_actor,v_email from internal_proesc.connection c
  join public.usuarios_sistema u on u.id=c.updated_by
  join auth.users a on lower(btrim(a.email))=lower(btrim(u.email))
  where lower(u.status)='ativo' limit 1;
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_actor,'email',v_email)::text,true);
  select p.id into strict v_polo from public.polos p
    where p.id=any(public.gestor_allowed_polo_ids()) and upper(p.cidade)='JAPOATÃ' limit 1;
  v_statement:=public.get_caixa_prestacao_mensal_secure(v_polo,'2026-09-01',3);
  assert jsonb_array_length(v_statement->'serie_mensal')=3,'Requested three-month series has wrong size';
  for v_point in select value from jsonb_array_elements(v_statement->'serie_mensal') loop
    assert (v_point->>'competencia')::date=v_expected_date,'Monthly series is not chronologically ordered';
    v_expected_date:=(v_expected_date+interval '1 month')::date;
    v_month:=internal_contas.caixa_monthly_delinquency(v_polo,(v_point->>'competencia')::date,
      (now() at time zone 'America/Maceio')::date);
    assert v_point->'inadimplencia'=v_month->'receber_vencido','Graph disagrees with monthly KPI';
    assert v_point->'inadimplencia_quantidade_em_conferencia'=v_month#>'{inadimplencia_mensal,quantidade_em_conferencia}',
      'Graph lost unverified-source count';
    assert v_point->'inadimplencia_completo'=v_month#>'{inadimplencia_mensal,completo}',
      'Graph reported incomplete evidence as complete';
    assert (v_point->>'resultado')::numeric=(v_point->>'entradas')::numeric-(v_point->>'saidas')::numeric,
      'Operational result changed';
    foreach v_key in array array['entradas_escala_percentual','saidas_escala_percentual','inadimplencia_escala_percentual',
      'resultado_posicao_percentual','inadimplencia_posicao_percentual','grafico_zero_posicao_percentual'] loop
      assert (v_point->>v_key)::numeric between 0 and 100,'Coordinate outside chart: '||v_key;
    end loop;
  end loop;
  assert v_statement#>'{serie_mensal,2,inadimplencia}'=v_statement#>'{compromissos,receber_vencido}',
    'Selected month graph and selected KPI disagree';
  v_report:=public.get_caixa_relatorio_mensal_detalhado_secure(v_polo,'2026-09-01');
  assert exists(select 1 from jsonb_array_elements(v_report#>'{resumo,serie_mensal}') p
    where p->>'competencia'='2026-09-01' and p->'inadimplencia'=v_statement#>'{compromissos,receber_vencido}'),
    'Report lost canonical graph evidence';
  perform set_config('request.jwt.claims',coalesce(v_claims,''),true);
  perform set_config('request.jwt.claim.role',coalesce(v_role,''),true);
  perform set_config('request.jwt.claim.sub',coalesce(v_sub,''),true);
  raise notice 'Monthly graph, negative domain, zero domain, evidence and PDF parity passed in % ms',
    round(extract(epoch from clock_timestamp()-v_started)*1000);
end;
$chart_monthly_rpc$;
