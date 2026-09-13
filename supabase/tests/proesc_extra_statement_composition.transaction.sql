-- Read-through projections must preserve authorization and every historical value.
-- Via MCP: replace the marker with migration 20260913194000 without BEGIN/COMMIT.
begin;
set local request.jwt.claim.role = 'service_role';
set local statement_timeout = '60s';
create temporary table extra_composition_baseline on commit drop as
select 'credits'::text kind, null::uuid enrollment_id,
  public.listar_outros_creditos_secure(null) payload
union all
select 'statement', picked.id, public.get_aluno_extrato_financeiro(picked.id)
from (
  select m.id from public.matriculas m
  join internal_proesc.enrollment_sources s on s.matricula_id=m.id
  where exists (select 1 from public.contas_receber c where c.matricula_id=m.id and c.status='PAGO')
  order by m.id limit 1
) picked;

-- __EXTRA_COMPOSITION_PROJECTIONS__

do $check$
declare
  v_before record;
  v_after jsonb;
  v_rows jsonb;
  v_normalized jsonb;
  v_receipt record;
  v_composition record;
  v_fields text[] := array['juros_aplicados','multa_aplicada','desconto_aplicado',
    'acrescimo_aplicado','diferenca_nao_discriminada','composicao_status','composicao_proveniencia'];
begin
  for v_before in select * from extra_composition_baseline loop
    v_after := case when v_before.kind='credits' then public.listar_outros_creditos_secure(null)
      else public.get_aluno_extrato_financeiro(v_before.enrollment_id) end;
    v_rows := case when v_before.kind='credits' then v_after else v_after->'recebiveis' end;
    select coalesce(jsonb_agg(item-v_fields order by ordinal),'[]'::jsonb)
      into v_normalized from jsonb_array_elements(v_rows) with ordinality t(item,ordinal);
    if v_before.kind='credits' then
      assert v_normalized=v_before.payload, 'Other-credit history, amount, fee or visibility changed';
    else
      assert v_after-'recebiveis'=v_before.payload-'recebiveis', 'Statement identity or totals changed';
      assert v_normalized=v_before.payload->'recebiveis', 'Statement history or received amount changed';
    end if;
    assert not exists(select 1 from jsonb_array_elements(v_rows) r where not r ?& v_fields),
      'Composition fields missing from projection';
    for v_receipt in
      select c.*, r.item from jsonb_array_elements(v_rows) r(item)
      join public.contas_receber c on c.id=(r.item->>'id')::uuid
      where c.status='PAGO' order by c.id limit 12
    loop
      select * into strict v_composition from public.resolve_integrated_receivable_financial_composition(
        v_receipt.id,v_receipt.valor,v_receipt.valor_pago,v_receipt.data_vencimento,
        v_receipt.data_pagamento,v_receipt.gateway_financial_terms,v_receipt.manual_settlement_id,
        v_receipt.manual_settlement_reversed_at,v_receipt.manual_settlement_principal_cents,
        v_receipt.manual_settlement_interest_cents,v_receipt.manual_settlement_penalty_cents,
        v_receipt.manual_settlement_addition_cents,v_receipt.manual_settlement_discount_cents,
        v_receipt.manual_settlement_received_cents);
      assert (v_receipt.item->>'juros_aplicados')::numeric is not distinct from v_composition.juros;
      assert (v_receipt.item->>'multa_aplicada')::numeric is not distinct from v_composition.multa;
      assert (v_receipt.item->>'desconto_aplicado')::numeric is not distinct from v_composition.desconto;
      assert (v_receipt.item->>'acrescimo_aplicado')::numeric is not distinct from v_composition.acrescimo;
      assert (v_receipt.item->>'diferenca_nao_discriminada')::numeric is not distinct from v_composition.diferenca_nao_discriminada;
      assert v_receipt.item->>'composicao_status' is not distinct from v_composition.composicao_status;
    end loop;
  end loop;
  perform set_config('request.jwt.claim.role','anon',true);
  perform set_config('request.jwt.claim.sub','',true);
  assert public.get_aluno_extrato_financeiro((select enrollment_id from extra_composition_baseline
    where kind='statement')) is null, 'Anonymous statement access';
  begin
    perform public.listar_outros_creditos_secure(null);
    raise exception 'Anonymous other-credit access';
  exception when insufficient_privilege then null; end;
end;
$check$;
select 'EXTRA_STATEMENT_COMPOSITION_OK' result;
rollback;
