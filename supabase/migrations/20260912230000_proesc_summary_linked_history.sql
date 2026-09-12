begin;

-- Keep the existing summary's authorization, polo/search filters and distinction
-- between due dates and payment dates. Include the same linked source history
-- that migration 76 already made visible in groups and individual rows.
do $proesc_summary_history$
declare
  v_signature text := 'public.get_receivables_modality_summary_v3_secure(text,uuid,uuid,text,date,date)';
  v_definition text;
  v_before text := 'AND cr.categoria = ''MENSALIDADE''';
  v_after text := $predicate$AND (cr.categoria = 'MENSALIDADE' OR (
        cr.categoria = 'OUTROS_CREDITOS' AND cr.origem_pagamento = 'SISTEMA_ANTERIOR'
        AND EXISTS (
          SELECT 1 FROM internal_proesc.obligation_links proesc_link
          JOIN internal_proesc.class_scopes proesc_scope ON proesc_scope.turma_id = proesc_link.turma_id
            AND proesc_scope.source_unit_id = proesc_link.source_unit_id
            AND proesc_scope.source_class_id = proesc_link.source_class_id
            AND proesc_scope.phase = 'CONFIRMED'
          WHERE proesc_link.receivable_id = cr.id AND proesc_link.matricula_id = cr.matricula_id
            AND proesc_link.turma_id = cr.turma_id AND proesc_scope.polo_id = cr.polo_id
        )
      ))$predicate$;
begin
  v_definition := pg_get_functiondef(v_signature::regprocedure);
  if md5(v_definition) <> '8a101b0c83985c3578895ffd4b1c834c' then
    raise exception 'Receivables summary changed; rebase the linked-history filter.';
  end if;
  if (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before) <> 1 then
    raise exception 'Receivables summary category predicate changed; review required.';
  end if;
  execute replace(v_definition,v_before,v_after);
end;
$proesc_summary_history$;
notify pgrst,'reload schema';
commit;
