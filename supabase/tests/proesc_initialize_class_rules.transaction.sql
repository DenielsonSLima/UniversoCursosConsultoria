-- Via MCP only. Replace each marker below with migration 20260913191100,
-- removing its outer BEGIN/COMMIT. This harness always ends with ROLLBACK.
-- No fixture contains student identity or payment-provider credentials.
begin;
set local request.jwt.claim.role = 'service_role';
set local app.proesc_test_rollback = 'on';

create temporary table proesc_rule_test_baseline (
  section text primary key,
  digest text not null
) on commit drop;

create temporary table proesc_rule_test_targets on commit drop as
select class.id as turma_id from public.turmas class
join internal_proesc.class_scopes scope on scope.turma_id = class.id
where class.codigo in ('ENF-T35-INT-MAT','ENF-T37-SEM-PDF','ENF-T38-INT-MAT',
  'ENF-T39-SEM-PDF','ENF-T40-INT-MAT','ENF-T41-SEM-AQB','ENF-T43-INT-MAT',
  'ENF-T44-SEM-AQB','ENF-T45-SEM-PDF')
  and scope.batch_id is not null and scope.phase = 'CONFIRMED'
  and scope.financial_mode = 'INDIVIDUAL_REVIEW';

insert into proesc_rule_test_baseline(section, digest)
select 'receivables', md5(coalesce(string_agg(to_jsonb(item)::text, '' order by item.id), ''))
from public.contas_receber item join public.turmas class on class.id = item.turma_id
where class.codigo in ('ENF-T35-INT-MAT','ENF-T37-SEM-PDF','ENF-T38-INT-MAT',
  'ENF-T39-SEM-PDF','ENF-T40-INT-MAT','ENF-T41-SEM-AQB','ENF-T43-INT-MAT',
  'ENF-T44-SEM-AQB','ENF-T45-SEM-PDF','ENF-T42-INT-MAT','2026.1-RAD-INT-JAP')
union all
select 'control_classes', md5(coalesce(string_agg(to_jsonb(class)::text, '' order by class.id), ''))
from public.turmas class where class.codigo in ('ENF-T42-INT-MAT','2026.1-RAD-INT-JAP');

-- __INITIALIZE_CONFIRMED_RULES__

do $verify_rules$
declare
  v_count integer := 0;
  v_class record;
  v_workspace jsonb;
  v_rule jsonb;
  v_total numeric;
  v_received numeric;
  v_overdue numeric;
  v_digest text;
begin
  assert current_setting('app.proesc_test_rollback', true) = 'on';
  for v_class in
    select class.* from public.turmas class
    join proesc_rule_test_targets target on target.turma_id = class.id
    order by class.codigo
  loop
    v_count := v_count + 1;
    v_workspace := public.obter_financeiro_matricula_tecnica_workspace_secure(v_class.id, null);
    v_rule := v_workspace->'regra';
    assert v_class.regra_financeira_revisao = 1, 'Rule was not initialized once';
    assert v_rule#>>'{cobranca,matricula,valor}' = '200.00';
    assert v_rule#>>'{cobranca,rematricula,valor}' = '100.00';
    assert v_rule#>>'{cobranca,mensalidade,valor}' = '279.90';
    assert v_rule#>>'{cobranca,mensalidade,quantidade}' = '12';
    assert v_rule#>>'{encargos,descontoPontualidade}' = '19.90';
    assert (v_rule#>>'{encargos,jurosAtrasoPercentual}')::numeric = 2;
    assert (v_rule#>>'{encargos,multaAtrasoPercentual}')::numeric = 2;
    assert v_rule#>>'{aplicacao,matricula,desconto}' = 'false';
    assert v_rule#>>'{aplicacao,rematricula,desconto}' = 'false';
    assert v_rule#>>'{aplicacao,mensalidade,desconto}' = 'true';
    assert v_rule#>>'{aplicacao,matricula,multaJuros}' = 'true';
    assert v_rule#>>'{aplicacao,mensalidade,multaJuros}' = 'true';
    assert v_rule#>>'{aplicacao,rematricula,multaJuros}' = 'true';
    assert jsonb_array_length(v_rule->'cronogramaCiclo') = 14;
    assert (select count(*) = 12 from jsonb_array_elements(v_rule->'cronogramaCiclo') item
      where item->>'tipo' = 'MENSALIDADE'
        and item#>>'{simulacao,valorComDesconto}' = '260.00'
        and item#>>'{simulacao,multa}' = '5.60'
        and item#>>'{simulacao,jurosValorDia}' = '0.19');
    assert v_workspace#>>'{turma,cicloFinanceiroTecnico,habilitado}' = 'false',
      'Conditions initialization must not grant permission to issue a cycle';
    select coalesce(sum(item.valor), 0),
      coalesce(sum(coalesce(item.valor_pago, item.valor)) filter (where item.status = 'PAGO'), 0),
      coalesce(sum(item.valor) filter (where item.status = 'VENCIDO'
        or (item.status = 'PENDENTE' and item.data_vencimento <
          (pg_catalog.timezone('America/Maceio', now()))::date)), 0)
    into v_total, v_received, v_overdue from public.contas_receber item
    where item.turma_id = v_class.id;
    assert (v_workspace#>>'{resumo,total}')::numeric = v_total;
    assert (v_workspace#>>'{resumo,recebido}')::numeric = v_received;
    assert (v_workspace#>>'{resumo,inadimplencia}')::numeric = v_overdue;
  end loop;
  assert v_count = 9, 'Exactly nine imported classes must load their real workspace';
  select md5(coalesce(string_agg(to_jsonb(item)::text, '' order by item.id), '')) into v_digest
  from public.contas_receber item join public.turmas class on class.id = item.turma_id
  where class.codigo in ('ENF-T35-INT-MAT','ENF-T37-SEM-PDF','ENF-T38-INT-MAT',
    'ENF-T39-SEM-PDF','ENF-T40-INT-MAT','ENF-T41-SEM-AQB','ENF-T43-INT-MAT',
    'ENF-T44-SEM-AQB','ENF-T45-SEM-PDF','ENF-T42-INT-MAT','2026.1-RAD-INT-JAP');
  assert v_digest = (select digest from proesc_rule_test_baseline where section = 'receivables'),
    'Existing payments, amounts or gateway identities changed';
  select md5(coalesce(string_agg(to_jsonb(class)::text, '' order by class.id), '')) into v_digest
  from public.turmas class where class.codigo in ('ENF-T42-INT-MAT','2026.1-RAD-INT-JAP');
  assert v_digest = (select digest from proesc_rule_test_baseline where section = 'control_classes'),
    'T42 or Radiology changed';
end;
$verify_rules$;

insert into proesc_rule_test_baseline(section, digest)
select 'initialized_rules', md5(string_agg(to_jsonb(class)::text, '' order by class.id))
from public.turmas class join proesc_rule_test_targets target on target.turma_id = class.id;

-- __INITIALIZE_CONFIRMED_RULES__

do $verify_replay$
declare v_digest text;
begin
  select md5(string_agg(to_jsonb(class)::text, '' order by class.id)) into v_digest
  from public.turmas class join proesc_rule_test_targets target on target.turma_id = class.id;
  assert v_digest = (select digest from proesc_rule_test_baseline where section = 'initialized_rules'),
    'Reapplying identical initialization changed the rules';
end;
$verify_replay$;

select 'Nine workspaces, unchanged receivables and idempotent replay verified; rolling back.' as result;
rollback;
