-- Via MCP: configure app.test.receivable_ids (array UUID) com recebíveis pagos
-- revisados. Nenhuma identidade real pertence a este arquivo versionado.
-- Clones pg_temp usam o resolver real; fixtures de saída testam apenas projeção.
begin isolation level repeatable read;
set local statement_timeout = '20s';
set local lock_timeout = '2s';
create temporary table reconciliation_composition_test_results (scenario text, passed boolean);
do $$
declare
  v_definition text := pg_get_functiondef('internal_proesc.reconciliation_item(uuid,text,text)'::regprocedure);
  v_old_disclosure text := $old$or coalesce(composition.composicao_status='CONCILIADO_POR_CONFERENCIA_PROESC',false) disclose$old$;
  v_new_disclosure text := $new$or coalesce(composition.composicao_status in (
      'CONCILIADO_POR_CONFERENCIA_PROESC', 'PARCIAL_POR_API_PROESC',
      'API_E_REGRA_INFORMADA_PROESC', 'CALCULADO_REGRA_INFORMADA_PROESC'
    ),false) disclose$new$;
  v_old_provenance text := $old$when composition.composicao_status='CONCILIADO_POR_CONFERENCIA_PROESC' then 'CONFERENCIA_PROESC'$old$;
  v_new_provenance text := $new$when composition.composicao_status='CONCILIADO_POR_CONFERENCIA_PROESC' then 'CONFERENCIA_PROESC'
      when composition.composicao_status='PARCIAL_POR_API_PROESC' then 'API_PROESC_COMPONENTES_EXPLICITOS'
      when composition.composicao_status='API_E_REGRA_INFORMADA_PROESC' then 'API_E_REGRA_INFORMADA_USUARIO'
      when composition.composicao_status='CALCULADO_REGRA_INFORMADA_PROESC' then 'REGRA_INFORMADA_USUARIO'$new$;
begin
  -- Reutilizável antes e depois da publicação, com contrato exato.
  if position(v_new_disclosure in v_definition)>0 then
    v_definition := replace(replace(v_definition,v_new_disclosure,v_old_disclosure),v_new_provenance,v_old_provenance);
  end if;
  if (length(v_definition)-length(replace(v_definition,v_old_disclosure,'')))/length(v_old_disclosure) <> 1
     or (length(v_definition)-length(replace(v_definition,v_old_provenance,'')))/length(v_old_provenance) <> 1 then
    raise exception 'Projeção mudou; revisar fixture.';
  end if;
  execute replace(v_definition,'internal_proesc.reconciliation_item(', 'pg_temp.reconciliation_before(');
  v_definition := replace(replace(v_definition,v_old_disclosure,v_new_disclosure),v_old_provenance,v_new_provenance);
  execute replace(v_definition,'internal_proesc.reconciliation_item(', 'pg_temp.reconciliation_after(');
end;
$$;
do $$
declare
  v_receivable public.contas_receber%rowtype;
  v_composition record;
  v_before jsonb;
  v_after jsonb;
  v_id uuid;
  v_changed_fields text[] := array['juros_aplicados','multa_aplicada','acrescimo_aplicado','desconto_aplicado',
    'diferenca_nao_discriminada','composicao_status','composicao_proveniencia'];
begin
  foreach v_id in array current_setting('app.test.receivable_ids')::uuid[] loop
    select * into strict v_receivable from public.contas_receber where id=v_id;
    if v_receivable.status<>'PAGO' or internal_proesc.reconciliation_source_system(v_receivable)<>'PROESC' then
      raise exception 'Fixture precisa ser recebível Proesc pago comprovado.';
    end if;
    select * into strict v_composition from public.resolve_integrated_receivable_financial_composition(
      v_receivable.id,v_receivable.valor,v_receivable.valor_pago,v_receivable.data_vencimento,
      v_receivable.data_pagamento,v_receivable.gateway_financial_terms,v_receivable.manual_settlement_id,
      v_receivable.manual_settlement_reversed_at,v_receivable.manual_settlement_principal_cents,
      v_receivable.manual_settlement_interest_cents,v_receivable.manual_settlement_penalty_cents,
      v_receivable.manual_settlement_addition_cents,v_receivable.manual_settlement_discount_cents,
      v_receivable.manual_settlement_received_cents);
    v_before := pg_temp.reconciliation_before(v_id,'PROESC','PROESC');
    v_after := pg_temp.reconciliation_after(v_id,'PROESC','PROESC');
    if (v_before-v_changed_fields) is distinct from (v_after-v_changed_fields)
       or (v_after->>'juros_aplicados')::numeric is distinct from v_composition.juros
       or (v_after->>'multa_aplicada')::numeric is distinct from v_composition.multa
       or (v_after->>'acrescimo_aplicado')::numeric is distinct from v_composition.acrescimo
       or (v_after->>'desconto_aplicado')::numeric is distinct from v_composition.desconto
       or (v_after->>'diferenca_nao_discriminada')::numeric is distinct from v_composition.diferenca_nao_discriminada
       or v_after->>'composicao_status' is distinct from v_composition.composicao_status then
      raise exception 'Conciliação divergiu do Caixa ou alterou outros campos.';
    end if;
    insert into reconciliation_composition_test_results values ('real_'||v_composition.composicao_status,true);
  end loop;
end;
$$;

-- Resposta sintética do resolver: prova NULL versus zero e todas as origens
-- sem alterar contratos ou dados financeiros reais.
create function pg_temp.composition_fixture(uuid,numeric,numeric,date,date,jsonb,uuid,timestamptz,
  bigint,bigint,bigint,bigint,bigint,bigint)
returns table(valor_base numeric,juros numeric,multa numeric,acrescimo numeric,desconto numeric,
  diferenca_nao_discriminada numeric,composicao_status text,valor_recebido numeric)
language sql as $$
  select 100::numeric, null::numeric, 0::numeric, null::numeric, 19.9::numeric,
    1::numeric,current_setting('app.test.composition_status'),null::numeric;
$$;
do $$
declare
  v_definition text := pg_get_functiondef('pg_temp.reconciliation_after(uuid,text,text)'::regprocedure);
begin
  execute replace(regexp_replace(v_definition,'FUNCTION [^[:space:](]+[.]reconciliation_after[(]',
    'FUNCTION pg_temp.reconciliation_fixture('),
    'public.resolve_integrated_receivable_financial_composition(', 'pg_temp.composition_fixture(');
end;
$$;
do $$
declare
  v_id uuid := (current_setting('app.test.receivable_ids')::uuid[])[1];
  v_case record;
  v_item jsonb;
  v_original jsonb := pg_temp.reconciliation_before(v_id,'PROESC','PROESC');
begin
  for v_case in select * from (values
    ('CONCILIADO_POR_CONFERENCIA_PROESC','PROESC','CONFERENCIA_PROESC',true),
    ('PARCIAL_POR_API_PROESC','PROESC','API_PROESC_COMPONENTES_EXPLICITOS',true),
    ('API_E_REGRA_INFORMADA_PROESC','PROESC','API_E_REGRA_INFORMADA_USUARIO',true),
    ('CALCULADO_REGRA_INFORMADA_PROESC','PROESC','REGRA_INFORMADA_USUARIO',true),
    ('NAO_DISCRIMINADA','PROESC','HISTORICO_SEM_DETALHAMENTO',false),
    ('COMPOSICAO_EXPLICITA','MANUAL','BAIXA_MANUAL_EXPLICITA',true),
    ('CONCILIADO_POR_FORMULA_BANESE','AUTOMATICA_BANESE','FORMULA_CONTRATUAL_BANESE',true),
    ('NAO_DISCRIMINADA','HISTORICO_MIGRADO','HISTORICO_SEM_DETALHAMENTO',false)
  ) cases(status,origin,provenance,disclose) loop
    perform set_config('app.test.composition_status',v_case.status,true);
    v_item := pg_temp.reconciliation_fixture(v_id,'PROESC',v_case.origin);
    if v_item->>'composicao_proveniencia' is distinct from v_case.provenance
       or v_item->>'juros_aplicados' is not null
       or v_item->>'acrescimo_aplicado' is not null
       or (v_item->>'multa_aplicada')::numeric is distinct from (case when v_case.disclose then 0::numeric end)
       or (v_item->>'desconto_aplicado')::numeric is distinct from (case when v_case.disclose then 19.9::numeric end)
       or (v_item->>'diferenca_nao_discriminada')::numeric is distinct from
         (case when v_case.disclose then 1::numeric
           else (v_original->>'valor_pago')::numeric-(v_original->>'valor_nominal')::numeric end)
       or v_item->>'composicao_status' is distinct from (case when v_case.disclose then v_case.status else 'HISTORICO_SEM_COMPOSICAO' end) then
      raise exception 'Falha de projeção canônica/null/proveniência: %',v_case.status;
    end if;
    insert into reconciliation_composition_test_results values ('projection_'||v_case.origin||'_'||v_case.status,true);
  end loop;
end;
$$;
-- Não pagos reais continuam sem composição/recebimento, inclusive quando a
-- saída sintética tenta oferecer componentes conhecidos.
do $$
declare
  v_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_key text;
begin
  select c.id into strict v_id from public.contas_receber c
  where c.status in ('PENDENTE','VENCIDO') and coalesce(c.valor_pago,0)=0
    and exists(select 1 from internal_proesc.obligation_links l where l.receivable_id=c.id)
  limit 1;
  perform set_config('app.test.composition_status','CALCULADO_REGRA_INFORMADA_PROESC',true);
  v_before := pg_temp.reconciliation_before(v_id,'PROESC','PROESC');
  v_after := pg_temp.reconciliation_fixture(v_id,'PROESC','PROESC');
  if v_before is distinct from v_after or v_after->>'composicao_status'<>'SEM_PAGAMENTO_CONFIRMADO' then
    raise exception 'Recebível não pago recebeu composição indevida.';
  end if;
  foreach v_key in array array['juros_aplicados','multa_aplicada','acrescimo_aplicado',
    'desconto_aplicado','diferenca_nao_discriminada'] loop
    if v_after->>v_key is not null then raise exception 'Componente não pago não é NULL.'; end if;
  end loop;
  insert into reconciliation_composition_test_results values ('unpaid_real_stays_without_payment_components',true);
end;
$$;
select * from reconciliation_composition_test_results order by scenario;
rollback;
