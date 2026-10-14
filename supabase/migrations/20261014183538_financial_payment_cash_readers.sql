BEGIN;
-- Rewire only these reviewed read functions, preserving authorization and ACLs.
-- A changed production definition aborts the transaction rather than guessing.
DO $rewire$
DECLARE target record; definition text; original text; relation_name text;
  replacement text; expected integer; observed integer; slot integer;
BEGIN
  FOR target IN SELECT * FROM (VALUES
    ('internal_contas.caixa_monthly_delinquency(uuid, date, date)','882c3ae93be622be3f1acba21ac66fea',1,0,0,0),
    ('internal_contas.caixa_open_receivables(uuid)','2e653067c1e4f3af546b52641b5f848c',1,0,0,0),
    ('internal_contas.caixa_receivables_position_rows(uuid, date, date)','6eeeb9fdbd88c72818fa44e2c2a3f930',1,0,0,0),
    ('internal_contas.get_caixa_workspace_v2_company_core(uuid, uuid, date, integer)','dd0f6f1de81347a4401a7c96b794d12e',0,1,2,1),
    ('internal_contas.get_caixa_workspace_v2_core(uuid, date, integer)','1a824c4f2e42932f0f4af5291007c52d',0,1,2,1),
    ('public.get_caixa_contas_pagar_resumo_secure(uuid, date)','70290c5e8f4452c3684b0f26e447ac1f',0,1,2,1),
    ('public.get_caixa_custos_operacionais_secure(uuid, date)','712ae198a6a70c8dc9712f1464f1caf6',0,1,2,1),
    ('public.get_caixa_dashboard_secure(uuid)','4501059d42ab35c104b41219cc1c7281',2,2,2,0),
    ('public.get_caixa_linha_corte_secure(uuid, date)','097496ae6d9d0910a447f950666534a6',2,2,4,2),
    ('public.get_caixa_posicao_total_resumo_secure(uuid, date)','ff93f25b2344b2799022b70578d5d904',2,2,2,0),
    ('public.get_caixa_prestacao_mensal_secure(uuid, date, integer)','0d5f12f7080897da1f46dc9f5e0d74b0',2,2,0,0),
    ('public.get_caixa_prestacao_mensal_secure_raw(uuid, date, integer)','462c8e5bc530dcd13f66d0387ff46af8',2,2,2,0),
    ('public.get_caixa_prestacao_mensal_v2_core(uuid, date, integer)','5c7fb5822c71c8a8141e0fa553432ed7',4,4,4,0),
    ('public.get_caixa_relatorio_carteira_recorrente_core(uuid, date, date)','55f569efcf626dd3ae744bbac813ed11',1,0,0,0),
    ('public.get_caixa_relatorio_despesas_core(uuid, date, date)','7e2654158e1aa11f562b3d4419bcc329',0,1,1,0),
    ('public.get_caixa_relatorio_mensal_detalhado_v1_core(uuid, date)','d96e64ee62520ff9c65a54390ae889c9',1,0,0,0),
    ('public.get_caixa_relatorio_recebimentos_core(uuid, date, date)','9fa30984ecb2e44a9e8cb685e331ad5a',1,0,0,0),
    ('public.get_caixa_relatorio_resumo_turmas_core(uuid, date, date)','a82a7c3a5366f7831e767deb6aa664a9',1,0,0,0),
    ('public.get_contas_bancarias_posicoes_polos_secure()','92dc4f0eed911a7436c9a6f8d98c5cc5',1,1,1,0),
    ('public.get_contas_bancarias_saldos()','18c57d44dad8b1f06ee71cf76c6abf70',1,1,1,0),
    ('public.list_caixa_workspace_v2_contas_pagar_secure(uuid, uuid, date, text, integer, integer, text)','fa13fc28add5e00ace765f84843ecfbd',0,1,2,1)
  ) AS allowed(signature,definition_hash,receipts,payables,expenses,rateios) LOOP
    definition:=pg_get_functiondef(target.signature::regprocedure);
    IF md5(definition)<>target.definition_hash THEN
      RAISE EXCEPTION 'Cash reader changed; review before applying: %',target.signature;
    END IF;
    original:=definition;
    FOR slot IN 1..4 LOOP
      relation_name:=(ARRAY['contas_receber','contas_pagar','despesas_lancamentos','despesas_lancamentos_rateios'])[slot];
      replacement:=(ARRAY['cash_receivables','cash_payables','cash_expenses','cash_expense_allocations'])[slot];
      expected:=(ARRAY[target.receipts,target.payables,target.expenses,target.rateios])[slot];
      SELECT count(*) INTO observed FROM regexp_matches(definition,
        '\m(FROM|JOIN)\s+public\.'||relation_name||'\M','gi');
      IF observed<>expected THEN RAISE EXCEPTION 'Cash source mismatch: % / %',target.signature,relation_name; END IF;
      definition:=regexp_replace(definition,
        '\m(FROM|JOIN)\s+public\.'||relation_name||'\M',
        '\1 internal_financial_payments.'||replacement||'()','gi');
    END LOOP;
    -- Monetary movement IDs are distinct, while title metrics retain identity.
    IF target.signature LIKE '%workspace_v2%core(%'
      OR target.signature LIKE '%get_caixa_contas_pagar_resumo_secure(%' THEN
      definition:=replace(definition,'''CONTA_PAGAR:'' || conta.id::text','''CONTA_PAGAR:'' || internal_financial_payments.cash_source_id(conta.id)::text');
      definition:=replace(definition,'''DESPESA:'' || despesa.id::text','''DESPESA:'' || internal_financial_payments.cash_source_id(despesa.id)::text');
    END IF;
    IF target.signature LIKE '%list_caixa_workspace_v2_contas_pagar_secure(%' THEN
      definition:=replace(definition,'''RATEIO:'' || rateio.id::text','''RATEIO:'' || rateio.id::text || '':'' || rateio.despesa_lancamento_id::text');
    END IF;
    definition:=replace(definition,'SET search_path TO public',$empty$SET search_path TO ''$empty$);
    IF definition=original THEN RAISE EXCEPTION 'Cash reader not changed: %',target.signature; END IF;
    EXECUTE definition;
  END LOOP;
END;
$rewire$;
NOTIFY pgrst,'reload schema';
COMMIT;
