begin;
-- Preserve the published 4.8.47 compositions and authorization filters.
do $linked_history_visibility$
declare v_definition text;
begin
  v_definition := pg_get_functiondef('public.get_receivables_modality_groups_page_v3_secure(text,uuid,uuid,text,date,date,text,text,integer,integer)'::regprocedure);
  if md5(v_definition) <> 'e117bcd10c02469dad4f74a839d3a9d7' then
    raise exception 'Published list changed: get_receivables_modality_groups_page_v3_secure; rebase required.'; end if;
  execute replace(v_definition,$old$AND cr.categoria = 'MENSALIDADE'$old$,$new$AND (cr.categoria = 'MENSALIDADE' OR (
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
      ))$new$);
  v_definition := pg_get_functiondef('public.get_receivables_modality_page_v3_secure(text,uuid,uuid,text,date,date,text,text,text,integer,integer)'::regprocedure);
  if md5(v_definition) <> '568ef7c4c37aa5499142e5470bd55d25' then
    raise exception 'Published list changed: get_receivables_modality_page_v3_secure; rebase required.'; end if;
  if (length(v_definition)-length(replace(v_definition,'pg_catalog.to_jsonb(p)','')))
    / length('pg_catalog.to_jsonb(p)') <> 1 then
    raise exception 'Published page serialization changed; rebase required.'; end if;
  v_definition := replace(v_definition,$rowold$pg_catalog.to_jsonb(p)$rowold$,$rownew$(
    pg_catalog.to_jsonb(p) || pg_catalog.jsonb_build_object('proesc_evidence',(
      SELECT pg_catalog.jsonb_build_object(
        'sourceStatus',COALESCE(latest.source_status,'UNKNOWN'),
        'verification',COALESCE(latest.verification,'REVIEW'),
        'observedAt',latest.observed_at
      )
      FROM internal_proesc.obligation_links evidence_link
      LEFT JOIN LATERAL (
        SELECT source_status,verification,observed_at
        FROM internal_proesc.financial_snapshots evidence_snapshot
        WHERE evidence_snapshot.link_id=evidence_link.id
        ORDER BY observed_at DESC,recorded_at DESC,id DESC LIMIT 1
      ) latest ON true
      WHERE evidence_link.receivable_id=p.id AND evidence_link.matricula_id=p.matricula_id
        AND evidence_link.turma_id=p.turma_id AND p.origem_pagamento='SISTEMA_ANTERIOR'
        AND p.gateway_provider IS NULL
      LIMIT 1
    ))
  )$rownew$);
  execute replace(v_definition,$old$AND cr.categoria = 'MENSALIDADE'$old$,$new$AND (cr.categoria = 'MENSALIDADE' OR (
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
      ))$new$);
end;
$linked_history_visibility$;
notify pgrst,'reload schema';
commit;
