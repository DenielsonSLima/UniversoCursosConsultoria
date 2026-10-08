BEGIN;

-- Emissor privado: os wrappers autorizam o ator antes desta chamada.
-- SECURITY INVOKER evita conceder um novo caminho privilegiado ao navegador.
CREATE OR REPLACE FUNCTION internal_academic.ead_emitir_certificado_automatico(
  p_matricula_id uuid
)
RETURNS public.certificados_academicos
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_matricula record;
  v_progress jsonb;
  v_config jsonb;
  v_cert public.certificados_academicos%ROWTYPE;
  v_document public.documentos_validacao%ROWTYPE;
  v_emissao record;
BEGIN
  -- Mesma ordem do progresso EAD: matrícula -> progresso -> curso -> certificado.
  SELECT m.id, m.aluno_id, m.turma_id, m.status, t.curso_id, t.polo_id
  INTO v_matricula
  FROM public.matriculas m
  JOIN public.turmas t ON t.id = m.turma_id
  JOIN public.cursos c ON c.id = t.curso_id
  WHERE m.id = p_matricula_id AND c.modalidade = 'EAD'
  FOR UPDATE OF m;

  IF NOT FOUND OR upper(coalesce(v_matricula.status, '')) <> 'CONCLUIDO' THEN
    RAISE EXCEPTION 'A emissão automática exige matrícula EAD concluída.'
      USING ERRCODE = '23514';
  END IF;

  SELECT ep.progress INTO v_progress
  FROM public.ead_aluno_progresso ep
  WHERE ep.aluno_id = v_matricula.aluno_id AND ep.curso_id = v_matricula.curso_id
  FOR UPDATE;

  SELECT c.ead_config INTO v_config
  FROM public.cursos c
  WHERE c.id = v_matricula.curso_id AND c.modalidade = 'EAD'
  FOR SHARE;

  SELECT ca.* INTO v_cert
  FROM public.certificados_academicos ca
  WHERE ca.matricula_id = p_matricula_id
  FOR UPDATE;

  IF NOT FOUND OR v_cert.modalidade <> 'EAD'
    OR v_cert.aluno_id IS DISTINCT FROM v_matricula.aluno_id
    OR v_cert.turma_id IS DISTINCT FROM v_matricula.turma_id
    OR v_cert.curso_id IS DISTINCT FROM v_matricula.curso_id
    OR v_cert.polo_id IS DISTINCT FROM v_matricula.polo_id
  THEN
    RAISE EXCEPTION 'Certificado incoerente com a matrícula EAD concluída.'
      USING ERRCODE = '23514';
  END IF;

  IF v_cert.status = 'FINALIZADO' AND v_cert.codigo_validacao IS NOT NULL THEN
    SELECT dv.* INTO v_document
    FROM public.documentos_validacao dv
    WHERE dv.codigo = v_cert.codigo_validacao
      AND dv.documento = 'certificado_ead'
      AND dv.matricula_id = v_cert.matricula_id
      AND dv.aluno_id = v_cert.aluno_id
      AND dv.polo_id IS NOT DISTINCT FROM v_cert.polo_id
      AND dv.identidade = 'certificado_ead:' || v_cert.matricula_id::text || ':-:-'
    FOR SHARE;
    IF NOT FOUND OR v_document.status <> 'ATIVO'
      OR (v_document.validade_ate IS NOT NULL AND v_document.validade_ate < now())
    THEN
      RAISE EXCEPTION 'O certificado EAD não possui validação documental ativa.'
        USING ERRCODE = '55000';
    END IF;
    -- Repetir a conclusão não altera código, data, nota, snapshot ou contador.
    RETURN v_cert;
  END IF;

  IF v_cert.status <> 'PENDENTE' OR v_cert.codigo_validacao IS NOT NULL THEN
    RAISE EXCEPTION 'Somente certificado EAD pendente sem emissão pode ser liberado.'
      USING ERRCODE = '55000';
  END IF;

  IF v_progress IS NULL OR v_config IS NULL
    OR NOT coalesce(public.ead_progress_meets_completion(v_progress, v_config), false)
  THEN
    RAISE EXCEPTION 'A conclusão acadêmica EAD não atende aos critérios do curso.'
      USING ERRCODE = '23514';
  END IF;

  -- Certificados revogados/expirados permanecem protegidos pelo emissor canônico.
  -- NULL identifica emissão automática, sem atribuir o aluno a um gestor fictício.
  SELECT * INTO v_emissao
  FROM public.emitir_documento_validacao_interno(
    'certificado_ead', p_matricula_id, NULL, NULL, NULL, NULL, false
  );

  IF v_emissao.codigo IS NULL OR v_emissao.status <> 'ATIVO' THEN
    RAISE EXCEPTION 'Não foi possível obter validação ativa para o certificado EAD.'
      USING ERRCODE = '55000';
  END IF;

  SELECT dv.* INTO v_document
  FROM public.documentos_validacao dv
  WHERE dv.codigo = v_emissao.codigo
    AND dv.documento = 'certificado_ead'
    AND dv.matricula_id = v_cert.matricula_id
    AND dv.aluno_id = v_cert.aluno_id
    AND dv.polo_id IS NOT DISTINCT FROM v_cert.polo_id
    AND dv.identidade = 'certificado_ead:' || v_cert.matricula_id::text || ':-:-'
  FOR UPDATE;
  IF NOT FOUND OR v_document.status <> 'ATIVO'
    OR (v_document.validade_ate IS NOT NULL AND v_document.validade_ate < now())
    OR (
    v_document.dados_emissao ? 'certificateId'
    AND v_document.dados_emissao ->> 'certificateId' IS DISTINCT FROM v_cert.id::text
  ) THEN
    RAISE EXCEPTION 'A validação documental não corresponde ao certificado EAD.'
      USING ERRCODE = '23514';
  END IF;

  IF v_emissao.reutilizado AND (
    v_document.dados_emissao ->> 'certificateId' IS DISTINCT FROM v_cert.id::text
    OR v_document.dados_emissao ->> 'completionDate' IS DISTINCT FROM v_cert.data_conclusao::text
    OR (v_document.dados_emissao ->> 'finalGrade')::numeric
      IS DISTINCT FROM (v_progress ->> 'quizScore')::numeric
  ) THEN
    RAISE EXCEPTION 'O snapshot EAD existente exige revisão administrativa.'
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.certificados_academicos
  SET status = 'FINALIZADO',
      nota_final = (v_progress ->> 'quizScore')::numeric,
      codigo_validacao = v_emissao.codigo,
      emitido_em = v_emissao.emitido_em,
      emitido_por = NULL,
      metadados = coalesce(metadados, '{}'::jsonb) || jsonb_build_object(
        'emissaoAutomaticaEad', true,
        'emissaoAutomaticaEm', v_emissao.emitido_em
      ),
      updated_at = now()
  WHERE id = v_cert.id
  RETURNING * INTO v_cert;

  -- Somente a primeira emissão completa o snapshot. Documento reutilizado não muda.
  IF NOT v_emissao.reutilizado THEN
    UPDATE public.documentos_validacao
    SET dados_emissao = coalesce(dados_emissao, '{}'::jsonb) || jsonb_build_object(
      'certificateId', v_cert.id,
      'completionDate', v_cert.data_conclusao,
      'finalGrade', v_cert.nota_final,
      'certificateModality', 'EAD'
    )
    WHERE id = v_document.id;
  END IF;

  UPDATE public.ead_aluno_progresso
  SET progress = jsonb_set(progress, '{certificateId}', to_jsonb(v_cert.id::text), true)
  WHERE aluno_id = v_cert.aluno_id AND curso_id = v_cert.curso_id;

  RETURN v_cert;
END;
$function$;

REVOKE ALL ON FUNCTION internal_academic.ead_emitir_certificado_automatico(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION internal_academic.ead_emitir_certificado_automatico(uuid) IS
  'Emissão EAD automática e idempotente, restrita a wrappers autorizados e manutenção privilegiada; não exige registro técnico.';

COMMIT;
