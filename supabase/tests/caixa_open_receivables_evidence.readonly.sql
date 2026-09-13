begin read only;

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

rollback;
