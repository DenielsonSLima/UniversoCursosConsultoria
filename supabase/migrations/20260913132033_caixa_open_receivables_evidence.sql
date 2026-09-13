begin;

-- An imported holding status is not proof of a collectible open obligation.
create function internal_contas.caixa_proesc_open_receivable_verified(
  p_receivable public.contas_receber,
  p_snapshot internal_proesc.financial_snapshots
) returns boolean language sql immutable set search_path = '' as $proof$
  select coalesce(
    p_receivable.status in ('PENDENTE', 'VENCIDO')
    and coalesce(p_receivable.valor_pago, 0) = 0 and p_receivable.data_pagamento is null
    and p_snapshot.verification = 'VERIFIED' and p_snapshot.source_status = 'OPEN'
    and p_snapshot.principal_cents = round(p_receivable.valor * 100)::bigint
    and p_snapshot.received_cents is null and p_snapshot.payment_date is null,
    false
  );
$proof$;

create function internal_contas.caixa_open_receivables(p_polo_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $aggregate$
  with positioned as materialized (
    select c.valor,case
      when l.id is null and coalesce(c.origem_cronograma_id, '') not like 'PROESC-V1:%'
        then true
      when l.id is null or internal_proesc.reconciliation_source_system(c) <> 'PROESC'
        then false
      else internal_contas.caixa_proesc_open_receivable_verified(c, f.snapshot)
      end as eligible
    from public.contas_receber c
    left join internal_proesc.obligation_links l on l.receivable_id = c.id
    left join lateral (
      select s as snapshot from internal_proesc.financial_snapshots s where s.link_id = l.id
      order by s.observed_at desc, s.recorded_at desc, s.id desc limit 1
    ) f on true
    where c.status in ('PENDENTE', 'VENCIDO')
      and (p_polo_id is null or c.polo_id = p_polo_id)
  ), totals as (
    select coalesce(sum(valor) filter(where eligible), 0) as confirmed,
      count(*) filter(where eligible) as eligible_count,
      count(*) filter(where not eligible) as review_count,
      coalesce(sum(valor) filter(where not eligible), 0) as review_principal
    from positioned
  )
  select jsonb_build_object('a_receber', confirmed,
    'receitas_futuras', jsonb_build_object(
      'valor_confirmado', confirmed,
      'quantidade_elegiveis', eligible_count,
      'quantidade_em_conferencia', review_count,
      'valor_nominal_em_conferencia', review_principal,
      'completo', review_count = 0,
      'criterio', 'OBRIGACOES_ABERTAS_COMPROVADAS_POSICAO_ATUAL'
    ))
  from totals;
$aggregate$;
revoke all on function
  internal_contas.caixa_proesc_open_receivable_verified(public.contas_receber,internal_proesc.financial_snapshots),
  internal_contas.caixa_open_receivables(uuid)
  from public, anon, authenticated, service_role;

-- Patch only the public wrapper after its existing authorization and monthly KPIs.
do $wrapper$
declare
  v_definition text := pg_get_functiondef('public.get_caixa_prestacao_mensal_secure(uuid,date,integer)'::regprocedure);
  v_old text := $old$coalesce(v_payload->'compromissos','{}'::jsonb) || internal_contas.caixa_monthly_delinquency(
      p_polo_id,p_competencia,(now() at time zone 'America/Maceio')::date),true);$old$;
  v_new text := $new$coalesce(v_payload->'compromissos','{}'::jsonb) || internal_contas.caixa_monthly_delinquency(
      p_polo_id,p_competencia,(now() at time zone 'America/Maceio')::date)
      || internal_contas.caixa_open_receivables(p_polo_id),true);$new$;
begin
  if md5(v_definition) <> 'dbdedde3bcaf46b2e25aee205c5ec079' then
    raise exception 'Caixa wrapper changed; rebase the open-receivables patch.';
  end if;
  if (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'Caixa commitments return is not unique.';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$wrapper$;

notify pgrst, 'reload schema';
-- Transactional contract assertions: failure rolls back this migration.
-- Fixtures exercise the actual proof function without inserting financial data.
do $proof_cases$
declare
  v_case record;
  v_receivable public.contas_receber;
  v_snapshot internal_proesc.financial_snapshots;
begin
  for v_case in select * from (values
    ('open', '{}'::jsonb, '{}'::jsonb, true),
    ('overdue', '{"status":"VENCIDO"}', '{}', true),
    ('holding review', '{}', '{"verification":"REVIEW"}', false),
    ('unknown', '{}', '{"source_status":"UNKNOWN"}', false),
    ('paid source', '{}', '{"source_status":"PAID"}', false),
    ('principal drift', '{}', '{"principal_cents":9000}', false),
    ('source receipt', '{}', '{"received_cents":1}', false),
    ('source payment date', '{}', '{"payment_date":"2026-09-01"}', false),
    ('local receipt', '{"valor_pago":1}', '{}', false),
    ('local payment date', '{"data_pagamento":"2026-09-01"}', '{}', false),
    ('local paid', '{"status":"PAGO"}', '{}', false),
    ('local canceled', '{"status":"CANCELADO"}', '{}', false),
    ('missing proof', '{}', '{"verification":null,"source_status":null}', false)
  ) cases(label, receivable_patch, snapshot_patch, expected) loop
    v_receivable := jsonb_populate_record(null::public.contas_receber,
      '{"status":"PENDENTE","valor":100,"valor_pago":0}'::jsonb || v_case.receivable_patch);
    v_snapshot := jsonb_populate_record(null::internal_proesc.financial_snapshots,
      '{"verification":"VERIFIED","source_status":"OPEN","principal_cents":10000}'::jsonb
      || v_case.snapshot_patch);
    assert internal_contas.caixa_proesc_open_receivable_verified(v_receivable, v_snapshot)
      is not distinct from v_case.expected, 'Open proof failed: ' || v_case.label;
  end loop;
end;
$proof_cases$;

do $all_polos$
declare
  v_polo record;
  v_result jsonb;
  v_before numeric;
  v_before_count bigint;
  v_local numeric;
begin
  for v_polo in select id from public.polos loop
    v_result := internal_contas.caixa_open_receivables(v_polo.id);
    select coalesce(sum(c.valor), 0), count(*) into v_before, v_before_count
    from public.contas_receber c where c.polo_id = v_polo.id and c.status in ('PENDENTE','VENCIDO');
    select coalesce(sum(c.valor), 0) into v_local from public.contas_receber c
    where c.polo_id = v_polo.id and c.status in ('PENDENTE','VENCIDO')
      and coalesce(c.origem_cronograma_id, '') not like 'PROESC-V1:%'
      and not exists(select 1 from internal_proesc.obligation_links l where l.receivable_id = c.id);
    assert (v_result->>'a_receber')::numeric >= v_local, 'Ordinary local receivables were lost';
    assert (v_result->>'a_receber')::numeric
      + (v_result#>>'{receitas_futuras,valor_nominal_em_conferencia}')::numeric = v_before,
      'Confirmed and review values must preserve the original nominal total';
    assert (v_result#>>'{receitas_futuras,quantidade_elegiveis}')::bigint
      + (v_result#>>'{receitas_futuras,quantidade_em_conferencia}')::bigint = v_before_count,
      'Receivables were duplicated or omitted';
    assert (v_result#>>'{receitas_futuras,completo}')::boolean =
      ((v_result#>>'{receitas_futuras,quantidade_em_conferencia}')::bigint = 0),
      'Completeness must follow the review count';
  end loop;
  v_result := internal_contas.caixa_open_receivables(null);
  select coalesce(sum(valor), 0) into v_before from public.contas_receber
    where status in ('PENDENTE','VENCIDO');
  assert (v_result->>'a_receber')::numeric
    + (v_result#>>'{receitas_futuras,valor_nominal_em_conferencia}')::numeric = v_before,
    'Global scope must also preserve any unassigned receivables';
  assert not has_function_privilege('anon','internal_contas.caixa_open_receivables(uuid)','execute'),
    'Unrestricted financial aggregate exposed to anon';
  assert not has_function_privilege('authenticated','internal_contas.caixa_open_receivables(uuid)','execute'),
    'Unrestricted financial aggregate exposed to authenticated';
end;
$all_polos$;

commit;
