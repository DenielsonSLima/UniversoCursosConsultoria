CREATE OR REPLACE FUNCTION internal_proesc.individual_cycle_policy_fingerprint_before_durable_facts(p_matricula_id uuid, p_base text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT CASE WHEN p_base IS NULL OR p_base !~ '^[0-9a-f]{64}$' THEN p_base ELSE
    coalesce((SELECT encode(extensions.digest(jsonb_build_object(
      'base',p_base,'matriculaId',m.id,'scopeId',s.id,
      'evidenceHash',e.evidence_hash,'revision',e.revision,
      'confirmedManifest',e.obligation_manifest_hash,
      'currentManifest',internal_proesc.enrollment_cycle_manifest_hash(m.id)
    )::text,'sha256'),'hex')
    FROM public.matriculas m JOIN internal_proesc.class_scopes s ON s.turma_id=m.turma_id
    LEFT JOIN internal_proesc.enrollment_cycle_evidence e ON e.matricula_id=m.id AND e.scope_id=s.id
    WHERE m.id=p_matricula_id AND s.batch_id IS NOT NULL AND s.financial_mode='INDIVIDUAL_REVIEW'),p_base)
  END;
$function$
;

