BEGIN;

-- Manutenção privilegiada e explícita: completa somente a tabela v2 ausente.
-- Não chama emissor, não aumenta contador e não reconstitui curso alterado.
CREATE FUNCTION internal_academic.ead_complementar_tabela_certificado(p_certificado_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_matricula record;
  v_course record;
  v_cert public.certificados_academicos%ROWTYPE;
  v_document public.documentos_validacao%ROWTYPE;
  v_after_cert public.certificados_academicos%ROWTYPE;
  v_after_document public.documentos_validacao%ROWTYPE;
  v_payload jsonb;
  v_original jsonb;
  v_progress jsonb;
  v_keys text[] := ARRAY['eadCurriculumTable'];
BEGIN
  SELECT m.id, m.aluno_id, m.turma_id, m.status, t.curso_id, t.polo_id
  INTO v_matricula
  FROM public.certificados_academicos ca
  JOIN public.matriculas m ON m.id = ca.matricula_id
  JOIN public.turmas t ON t.id = m.turma_id
  WHERE ca.id = p_certificado_id
  FOR UPDATE OF m;
  IF NOT FOUND OR v_matricula.status <> 'CONCLUIDO' THEN
    RAISE EXCEPTION 'O complemento exige matrícula EAD concluída.' USING ERRCODE = '23514';
  END IF;

  SELECT ep.progress INTO v_progress FROM public.ead_aluno_progresso ep
  WHERE ep.aluno_id = v_matricula.aluno_id AND ep.curso_id = v_matricula.curso_id
  FOR UPDATE;
  SELECT c.ead_config, c.carga_horaria, c.updated_at INTO v_course
  FROM public.cursos c WHERE c.id = v_matricula.curso_id AND c.modalidade = 'EAD'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O complemento é exclusivo de curso EAD.' USING ERRCODE = '23514';
  END IF;

  SELECT ca.* INTO v_cert FROM public.certificados_academicos ca
  WHERE ca.id = p_certificado_id FOR UPDATE;
  IF NOT FOUND OR v_cert.modalidade <> 'EAD' OR v_cert.status <> 'FINALIZADO'
    OR v_cert.codigo_validacao IS NULL OR v_cert.emitido_em IS NULL
    OR v_cert.matricula_id IS DISTINCT FROM v_matricula.id
    OR v_cert.aluno_id IS DISTINCT FROM v_matricula.aluno_id
    OR v_cert.turma_id IS DISTINCT FROM v_matricula.turma_id
    OR v_cert.curso_id IS DISTINCT FROM v_matricula.curso_id
    OR v_cert.polo_id IS DISTINCT FROM v_matricula.polo_id THEN
    RAISE EXCEPTION 'Somente certificado EAD finalizado e coerente pode receber conteúdo.'
      USING ERRCODE = '23514';
  END IF;

  SELECT dv.* INTO v_document FROM public.documentos_validacao dv
  WHERE dv.codigo = v_cert.codigo_validacao
    AND dv.documento = 'certificado_ead'
    AND dv.matricula_id = v_cert.matricula_id AND dv.aluno_id = v_cert.aluno_id
    AND dv.polo_id IS NOT DISTINCT FROM v_cert.polo_id
    AND dv.identidade = 'certificado_ead:' || v_cert.matricula_id::text || ':-:-'
  FOR UPDATE;
  IF NOT FOUND OR v_document.status <> 'ATIVO'
    OR (v_document.validade_ate IS NOT NULL AND v_document.validade_ate < now())
    OR v_document.emitido_em IS DISTINCT FROM v_cert.emitido_em
    OR v_document.dados_emissao ->> 'certificateId' IS DISTINCT FROM v_cert.id::text
    OR v_document.dados_emissao ->> 'completionDate' IS DISTINCT FROM v_cert.data_conclusao::text
    OR (v_document.dados_emissao ->> 'finalGrade')::numeric IS DISTINCT FROM v_cert.nota_final THEN
    RAISE EXCEPTION 'O complemento exige validação EAD ativa e snapshot coerente.'
      USING ERRCODE = '23514';
  END IF;

  IF jsonb_typeof(v_cert.metadados) IS DISTINCT FROM 'object'
    OR jsonb_typeof(v_document.dados_emissao) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'O snapshot EAD exige revisão administrativa.' USING ERRCODE = '55000';
  END IF;
  v_original := internal_academic.ead_certificate_curriculum_from_snapshot(v_document.dados_emissao);
  IF internal_academic.ead_certificate_curriculum_from_snapshot(v_cert.metadados) IS DISTINCT FROM v_original THEN
    RAISE EXCEPTION 'O currículo v1 do certificado diverge da validação EAD.' USING ERRCODE = '55000';
  END IF;
  IF v_cert.metadados ?| v_keys OR v_document.dados_emissao ?| v_keys THEN
    IF v_cert.metadados ?& v_keys AND v_document.dados_emissao ?& v_keys
      AND v_cert.metadados -> 'eadCurriculumTable' = v_document.dados_emissao -> 'eadCurriculumTable' THEN
      PERFORM internal_academic.ead_certificate_table_from_snapshot(v_document.dados_emissao);
      RETURN jsonb_build_object('changed', false, 'certificateId', v_cert.id);
    END IF;
    RAISE EXCEPTION 'Tabela EAD existente ou divergente exige revisão administrativa.' USING ERRCODE = '55000';
  END IF;
  IF v_course.updated_at IS NULL OR v_course.updated_at > v_cert.emitido_em THEN
    RAISE EXCEPTION 'O curso foi alterado após a emissão; não é possível recompor a grade histórica automaticamente.'
      USING ERRCODE = '55000';
  END IF;

  v_payload := internal_academic.ead_certificate_table_snapshot(
    v_course.ead_config, v_course.carga_horaria, v_progress, v_original
  );
  UPDATE public.documentos_validacao SET dados_emissao = dados_emissao || v_payload
  WHERE id = v_document.id RETURNING * INTO v_after_document;
  UPDATE public.certificados_academicos SET metadados = metadados || v_payload
  WHERE id = v_cert.id RETURNING * INTO v_after_cert;

  -- Também protege contra triggers que tentem alterar dados históricos.
  IF (to_jsonb(v_after_document) - 'dados_emissao') IS DISTINCT FROM (to_jsonb(v_document) - 'dados_emissao')
    OR v_after_document.dados_emissao IS DISTINCT FROM (v_document.dados_emissao || v_payload)
    OR (to_jsonb(v_after_cert) - 'metadados') IS DISTINCT FROM (to_jsonb(v_cert) - 'metadados')
    OR v_after_cert.metadados IS DISTINCT FROM (v_cert.metadados || v_payload) THEN
    RAISE EXCEPTION 'O complemento tentou alterar dados fora do conteúdo programático.'
      USING ERRCODE = '55000';
  END IF;
  RETURN jsonb_build_object('changed', true, 'certificateId', v_cert.id);
END;
$function$;

REVOKE ALL ON FUNCTION internal_academic.ead_complementar_tabela_certificado(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION internal_academic.ead_complementar_tabela_certificado(uuid) IS
  'Manutenção EAD explícita: adiciona só a tabela v2 ausente, preservando currículo v1, código, datas e contador.';

COMMIT;
