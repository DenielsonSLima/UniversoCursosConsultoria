begin;

-- The source import registry owns obligation classification. A technical
-- PARCELA compatibility field alone is not proof that a source fee is tuition.
do $proesc_obligation_labels$
declare
  v_signature text := 'public.get_receivables_modality_page_v3_secure(text,uuid,uuid,text,date,date,text,text,text,integer,integer)';
  v_definition text;
  v_before text := $before$'observedAt',latest.observed_at$before$;
  v_after text := $after$'observedAt',latest.observed_at,
        'obligationLabel',(
          SELECT CASE imported.obligation_kind
            WHEN 'REENROLLMENT_FEE' THEN 'Rematrícula'
            WHEN 'TUITION' THEN CASE WHEN imported.source_ordinal IS NOT NULL
              THEN 'Parcela ' || imported.source_ordinal::text ELSE 'Mensalidade' END
            ELSE 'Obrigação Proesc'
          END
          FROM internal_proesc.obligation_imports imported
          JOIN internal_proesc.class_scopes source_scope ON source_scope.id=imported.scope_id
            AND source_scope.turma_id=evidence_link.turma_id
            AND source_scope.source_unit_id=evidence_link.source_unit_id
            AND source_scope.source_class_id=evidence_link.source_class_id
            AND source_scope.phase='CONFIRMED'
          WHERE imported.link_id=evidence_link.id
        )$after$;
begin
  v_definition := pg_get_functiondef(v_signature::regprocedure);
  if md5(v_definition) <> '35cd30958740b2bc36a45ea926fb2bb2' then
    raise exception 'Receivables evidence projection changed; rebase obligation labels.';
  end if;
  if (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before) <> 1 then
    raise exception 'Receivables evidence projection is not unique; review required.';
  end if;
  execute replace(v_definition,v_before,v_after);
end;
$proesc_obligation_labels$;
notify pgrst,'reload schema';
commit;
