BEGIN;

-- The trust panel has its own minimum read contract. The existing student and
-- financial management RPC is deliberately not replaced or invoked here.
CREATE FUNCTION public.ead_get_turma_trust_access(p_turma_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET statement_timeout='8s' AS $$
DECLARE v_turma uuid;v_result jsonb;
BEGIN
 IF auth.uid() IS NULL OR auth.role() IS DISTINCT FROM 'authenticated'
  OR NOT coalesce(public.gestor_has_module('gestao'),false) THEN
  RAISE EXCEPTION 'Acesso à confiança EAD indisponível neste escopo.' USING ERRCODE='42501'; END IF;
 SELECT t.id INTO v_turma FROM public.turmas t JOIN public.cursos c ON c.id=t.curso_id
  WHERE t.id=p_turma_id AND c.modalidade='EAD';
 IF NOT FOUND OR NOT coalesce(public.can_write_turma(v_turma),false) THEN
  RAISE EXCEPTION 'Acesso à confiança EAD indisponível neste escopo.' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'matriculaId',m.id,'nome',p.nome,'status',m.status,
  'acessoTemporarioAte',m.acesso_temporario_ate,
  'acessoTemporarioAtivo',internal_academic.ead_has_trust_access(m.id))
  ORDER BY m.data_matricula DESC NULLS LAST,m.id),'[]'::jsonb)
 INTO v_result FROM public.matriculas m JOIN public.parceiros p ON p.id=m.aluno_id
 WHERE m.turma_id=v_turma;
 RETURN v_result;
END$$;
REVOKE ALL ON FUNCTION public.ead_get_turma_trust_access(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.ead_get_turma_trust_access(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';

COMMIT;
