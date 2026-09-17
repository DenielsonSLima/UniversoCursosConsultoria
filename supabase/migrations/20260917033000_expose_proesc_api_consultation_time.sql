begin;

-- observedAt é a referência temporal da observação/lote de consulta.
-- API_* comprova sua origem; REVIEW descreve a evidência financeira e não
-- transforma uma consulta HTTP concluída em falha. Não representa hora da baixa.
-- Reutiliza a evidência mais recente já consultada, sem nova leitura por item.
do $$
declare
  v_definition text := pg_get_functiondef('internal_proesc.reconciliation_item(uuid,text,text)'::regprocedure);
  v_old_json text := $old$'observedAt',evidence.observed_at,$old$;
  v_new_json text := $new$'observedAt',evidence.observed_at,
      'apiConsultedAt',case when evidence.evidence_kind in ('API_SINGLE_PAYMENT','API_PAYMENT_TOTAL')
        then evidence.observed_at end,$new$;
  v_old_columns text := 'f.source_status,f.verification,f.observed_at';
  v_new_columns text := 'f.source_status,f.verification,f.observed_at,f.evidence_kind';
begin
  if strpos(v_definition,'''apiConsultedAt''') > 0
     or strpos(v_definition,v_new_columns) > 0
     or (length(v_definition)-length(replace(v_definition,v_old_json,'')))/length(v_old_json) <> 1
     or (length(v_definition)-length(replace(v_definition,v_old_columns,'')))/length(v_old_columns) <> 2 then
    raise exception 'Projeção de evidência Proesc mudou; revisar antes de aplicar.';
  end if;
  execute replace(replace(v_definition,v_old_json,v_new_json),v_old_columns,v_new_columns);
end;
$$;

notify pgrst, 'reload schema';
commit;
