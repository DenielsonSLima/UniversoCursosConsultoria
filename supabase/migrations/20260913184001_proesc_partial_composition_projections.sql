begin;

-- Preserve the current authorization, pagination and bank/manual projections.
-- Only admit the new partial Proesc state from the canonical resolver.
do $projections$
declare
  v_definition text;
  v_before text;
  v_after text;
  v_function regprocedure;
begin
  v_function := 'public.list_financial_receipts_secure(uuid,uuid,date,date,text,text,text,integer,integer)'::regprocedure;
  v_definition := pg_get_functiondef(v_function);
  if md5(v_definition) <> '72eb3539de49e40e49d065e08e80a155' then
    raise exception 'Receipts projection changed; rebase before applying.';
  end if;
  v_before := 'composition.composicao_status IS DISTINCT FROM ''CONCILIADO_POR_CONFERENCIA_PROESC''';
  v_after := '(composition.composicao_status IS DISTINCT FROM ''CONCILIADO_POR_CONFERENCIA_PROESC''
          AND composition.composicao_status IS DISTINCT FROM ''PARCIAL_POR_API_PROESC''
          AND composition.composicao_status IS DISTINCT FROM ''CALCULADO_REGRA_INFORMADA_PROESC''
          AND composition.composicao_status IS DISTINCT FROM ''API_E_REGRA_INFORMADA_PROESC'')';
  if (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before) <> 6 then
    raise exception 'Unexpected historical receipt guards.';
  end if;
  v_definition := replace(v_definition,v_before,v_after);
  v_before := 'WHEN receipt.origem = ''HISTORICO_MIGRADO'' THEN ''HISTORICO_SEM_DETALHAMENTO''';
  v_after := 'WHEN composition.composicao_status = ''PARCIAL_POR_API_PROESC'' THEN ''API_PROESC_COMPONENTES_EXPLICITOS''
        WHEN composition.composicao_status = ''CALCULADO_REGRA_INFORMADA_PROESC'' THEN ''REGRA_INFORMADA_USUARIO''
        WHEN composition.composicao_status = ''API_E_REGRA_INFORMADA_PROESC'' THEN ''API_E_REGRA_INFORMADA_USUARIO''
        WHEN receipt.origem = ''HISTORICO_MIGRADO'' THEN ''HISTORICO_SEM_DETALHAMENTO''';
  if strpos(v_definition,v_before)=0 then raise exception 'Missing receipt provenance guard.'; end if;
  execute replace(v_definition,v_before,v_after);

  v_function := 'public.get_receivables_modality_page_v3_secure(text,uuid,uuid,text,date,date,text,text,text,integer,integer)'::regprocedure;
  v_definition := pg_get_functiondef(v_function);
  if md5(v_definition) <> '0ed9326f9ab7a1fd9783581609aaef29' then
    raise exception 'Modality projection changed; rebase before applying.';
  end if;
  v_before := 'composition.composicao_status = ''CONCILIADO_POR_CONFERENCIA_PROESC''';
  v_after := 'composition.composicao_status IN (''CONCILIADO_POR_CONFERENCIA_PROESC'', ''PARCIAL_POR_API_PROESC'',
          ''CALCULADO_REGRA_INFORMADA_PROESC'', ''API_E_REGRA_INFORMADA_PROESC'')';
  if (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before) <> 3 then
    raise exception 'Unexpected modality component guards.';
  end if;
  v_definition := replace(v_definition,v_before,v_after);
  v_before := 'END AS multa_aplicada,';
  v_after := 'END AS multa_aplicada,
      composition.composicao_status,
      CASE composition.composicao_status
        WHEN ''CALCULADO_REGRA_INFORMADA_PROESC'' THEN ''REGRA_INFORMADA_USUARIO''
        WHEN ''API_E_REGRA_INFORMADA_PROESC'' THEN ''API_E_REGRA_INFORMADA_USUARIO''
        WHEN ''PARCIAL_POR_API_PROESC'' THEN ''API_PROESC_COMPONENTES_EXPLICITOS''
        WHEN ''CONCILIADO_POR_CONFERENCIA_PROESC'' THEN ''CONFERENCIA_PROESC''
        ELSE NULL END AS composicao_proveniencia,
      composition.acrescimo AS acrescimo_aplicado,
      composition.diferenca_nao_discriminada,';
  if (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before) <> 1 then
    raise exception 'Unexpected modality composition projection.';
  end if;
  execute replace(v_definition,v_before,v_after);

  v_function := 'public.get_caixa_relatorio_mensal_detalhado_v1_core(uuid,date)'::regprocedure;
  v_definition := pg_get_functiondef(v_function);
  if md5(v_definition) <> 'eb4bc23b63e57b9b6970a9bbe8adb483' then
    raise exception 'Monthly report changed; rebase before applying.';
  end if;
  v_before := 'recebimento.composicao_status = ''NAO_DISCRIMINADA_PELO_GATEWAY''';
  v_after := 'recebimento.composicao_status IN (
          ''NAO_DISCRIMINADA_PELO_GATEWAY'', ''NAO_DISCRIMINADA'', ''PARCIAL_POR_API_PROESC''
        ) OR (recebimento.composicao_status IN (
          ''CALCULADO_REGRA_INFORMADA_PROESC'', ''API_E_REGRA_INFORMADA_PROESC''
        ) AND recebimento.diferenca_nao_discriminada<>0)';
  if (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before) <> 1 then
    raise exception 'Unexpected monthly composition coverage guard.';
  end if;
  execute replace(v_definition,v_before,v_after);
end;
$projections$;

commit;
