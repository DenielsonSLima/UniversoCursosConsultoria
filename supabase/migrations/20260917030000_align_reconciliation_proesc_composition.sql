begin;

-- Conciliação já usa o mesmo resolver do Caixa, mas ocultava suas saídas
-- explícitas/parciais e calculadas. Publica o resultado e a proveniência
-- canônicos somente na hidratação da página, sem recalcular valores.
-- Campos sem prova continuam NULL; forma, conta e horário não são inferidos.
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
  if (length(v_definition)-length(replace(v_definition,v_old_disclosure,'')))/length(v_old_disclosure) <> 1
     or (length(v_definition)-length(replace(v_definition,v_old_provenance,'')))/length(v_old_provenance) <> 1 then
    raise exception 'Projeção da composição da conciliação mudou; revisar antes de aplicar.';
  end if;
  execute replace(replace(v_definition,v_old_disclosure,v_new_disclosure),v_old_provenance,v_new_provenance);
end;
$$;

notify pgrst, 'reload schema';
commit;
