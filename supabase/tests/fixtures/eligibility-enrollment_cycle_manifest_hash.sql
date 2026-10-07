CREATE OR REPLACE FUNCTION internal_proesc.enrollment_cycle_manifest_hash(p_matricula_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT encode(extensions.digest(jsonb_build_object(
    'matriculaId',m.id,'turmaId',m.turma_id,'poloId',s.polo_id,'scopeId',s.id,
    'personHash',internal_proesc.person_document_hash(m.aluno_id),
    'unitId',s.source_unit_id,'classId',s.source_class_id,
    'obligations',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',c.id,'matriculaId',c.matricula_id,'turmaId',c.turma_id,'personId',c.cliente_id,
      'poloId',c.polo_id,'principal',c.valor,'due',c.data_vencimento,
      'origin',c.origem_cronograma_id,'kind',c.tipo_lancamento,
      'linkId',l.id,'sourceUnit',l.source_unit_id,'sourceClass',l.source_class_id,
      'sourceKey',l.source_key,'linkKind',l.kind,'parentLink',l.parent_link_id,
      'importScope',i.scope_id,'sourcePerson',i.source_person_hash,
      'sourceFingerprint',i.source_fingerprint,'sourceCycle',i.source_cycle,
      'sourceKind',i.obligation_kind,'sourceOrdinal',i.source_ordinal
    ) ORDER BY c.id) FROM public.contas_receber c
      LEFT JOIN internal_proesc.obligation_links l ON l.receivable_id=c.id
      LEFT JOIN internal_proesc.obligation_imports i ON i.link_id=l.id
      WHERE c.matricula_id=m.id AND (c.origem_pagamento='SISTEMA_ANTERIOR' OR l.id IS NOT NULL)),
      '[]'::jsonb)
  )::text,'sha256'),'hex')
  FROM public.matriculas m JOIN internal_proesc.class_scopes s ON s.turma_id=m.turma_id
  WHERE m.id=p_matricula_id;
$function$
;

