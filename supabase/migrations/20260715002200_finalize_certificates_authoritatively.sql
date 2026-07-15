-- Certificados EAD emitidos automaticamente pelo fluxo antigo, sem registro,
-- retornam à fila da Secretaria. A emissão antiga é revogada antes de limpar o código.
WITH antigos AS (
  SELECT id, codigo_validacao
  FROM public.certificados_academicos
  WHERE modalidade = 'EAD'
    AND status = 'FINALIZADO'
    AND (
      nullif(btrim(certificado_numero), '') IS NULL
      OR nullif(btrim(pagina_livro), '') IS NULL
      OR nullif(btrim(livro_registro), '') IS NULL
    )
), revogados AS (
  UPDATE public.documentos_validacao dv
  SET
    identidade = dv.identidade || ':REVOGADO:' || dv.id::text,
    status = 'REVOGADO',
    revogado_em = coalesce(revogado_em, now()),
    updated_at = now()
  FROM antigos
  WHERE dv.codigo = antigos.codigo_validacao
  RETURNING antigos.id
)
UPDATE public.certificados_academicos ca
SET
  status = 'PENDENTE',
  codigo_validacao = NULL,
  emitido_em = NULL,
  emitido_por = NULL,
  metadados = coalesce(ca.metadados, '{}'::jsonb) || jsonb_build_object(
    'retornadoParaSecretariaEm', now(),
    'motivo', 'Registro de número, livro e página pendente.'
  ),
  updated_at = now()
WHERE ca.id IN (SELECT id FROM antigos);

UPDATE public.ead_aluno_progresso ep
SET progress = coalesce(ep.progress, '{}'::jsonb) - 'certificateId'
WHERE EXISTS (
  SELECT 1
  FROM public.certificados_academicos ca
  WHERE ca.aluno_id = ep.aluno_id
    AND ca.curso_id = ep.curso_id
    AND ca.modalidade = 'EAD'
    AND ca.status = 'PENDENTE'
);

CREATE OR REPLACE FUNCTION public.finalizar_certificado_academico(
  p_certificado_id uuid,
  p_certificado_numero text DEFAULT NULL,
  p_pagina_livro text DEFAULT NULL,
  p_livro_registro text DEFAULT NULL,
  p_validacao_sistec text DEFAULT NULL,
  p_ensino_medio_estabelecimento text DEFAULT NULL,
  p_ensino_medio_localidade_uf text DEFAULT NULL,
  p_ensino_medio_ano_conclusao text DEFAULT NULL,
  p_emitido_por uuid DEFAULT NULL
)
RETURNS public.certificados_academicos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cert public.certificados_academicos%ROWTYPE;
  v_doc text;
  v_emissao record;
  v_responsavel uuid;
  v_ead_config jsonb;
  v_ead_progress jsonb;
  v_enrollment_valid boolean;
BEGIN
  SELECT * INTO v_cert
  FROM public.certificados_academicos
  WHERE id = p_certificado_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Certificado não encontrado.';
  END IF;

  IF coalesce(auth.role(), '') <> 'service_role' THEN
    IF v_cert.polo_id IS NULL AND NOT public.is_gestor_global() THEN
      RAISE EXCEPTION 'Somente gestor global pode emitir certificado sem polo.'
        USING ERRCODE = '42501';
    END IF;
    IF v_cert.polo_id IS NOT NULL AND NOT public.is_gestor_for_polo(v_cert.polo_id) THEN
      RAISE EXCEPTION 'Sem permissão para emitir certificado deste polo.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_responsavel := internal_academic.resolve_responsavel(p_emitido_por);

  IF v_cert.status = 'FINALIZADO' AND v_cert.codigo_validacao IS NOT NULL THEN
    RETURN v_cert;
  END IF;
  IF v_cert.status <> 'PENDENTE' THEN
    RAISE EXCEPTION 'Somente certificado pendente pode ser emitido.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.matriculas m
    JOIN public.turmas t ON t.id = m.turma_id
    JOIN public.cursos c ON c.id = t.curso_id
    WHERE m.id = v_cert.matricula_id
      AND m.aluno_id = v_cert.aluno_id
      AND m.turma_id = v_cert.turma_id
      AND t.curso_id = v_cert.curso_id
      AND t.polo_id IS NOT DISTINCT FROM v_cert.polo_id
      AND c.modalidade = v_cert.modalidade
      AND upper(coalesce(m.status, '')) = 'CONCLUIDO'
  ) INTO v_enrollment_valid;

  IF NOT v_enrollment_valid THEN
    RAISE EXCEPTION 'Certificado incoerente com a matrícula concluída, turma, curso ou polo.';
  END IF;

  IF v_cert.modalidade IN ('TECNICO', 'EAD') AND (
    nullif(btrim(coalesce(p_certificado_numero, '')), '') IS NULL
    OR nullif(btrim(coalesce(p_pagina_livro, '')), '') IS NULL
    OR nullif(btrim(coalesce(p_livro_registro, '')), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'Preencha número do certificado, página e livro antes da emissão.';
  END IF;

  IF v_cert.modalidade = 'EAD' THEN
    SELECT c.ead_config, ep.progress
    INTO v_ead_config, v_ead_progress
    FROM public.cursos c
    LEFT JOIN public.ead_aluno_progresso ep
      ON ep.curso_id = c.id AND ep.aluno_id = v_cert.aluno_id
    WHERE c.id = v_cert.curso_id;

    IF NOT coalesce(public.ead_progress_meets_completion(v_ead_progress, v_ead_config), false) THEN
      RAISE EXCEPTION 'A conclusão acadêmica EAD não atende aos critérios do curso.';
    END IF;
  END IF;

  v_doc := CASE v_cert.modalidade
    WHEN 'TECNICO' THEN 'certificado_tecnico'
    WHEN 'LIVRE' THEN 'certificado_livre'
    WHEN 'EAD' THEN 'certificado_ead'
    ELSE 'certificado_especializacao'
  END;

  SELECT * INTO v_emissao
  FROM public.emitir_documento_validacao(
    v_doc, v_cert.matricula_id, NULL, NULL, NULL, v_responsavel, false
  );

  IF v_emissao.codigo IS NULL OR v_emissao.status <> 'ATIVO' THEN
    RAISE EXCEPTION 'Não foi possível obter uma validação documental ativa para o certificado.';
  END IF;

  UPDATE public.certificados_academicos
  SET
    status = 'FINALIZADO',
    certificado_numero = nullif(btrim(p_certificado_numero), ''),
    pagina_livro = nullif(btrim(p_pagina_livro), ''),
    livro_registro = nullif(btrim(p_livro_registro), ''),
    validacao_sistec = nullif(btrim(p_validacao_sistec), ''),
    ensino_medio_estabelecimento = coalesce(
      nullif(btrim(p_ensino_medio_estabelecimento), ''), ensino_medio_estabelecimento
    ),
    ensino_medio_localidade_uf = coalesce(
      nullif(btrim(p_ensino_medio_localidade_uf), ''), ensino_medio_localidade_uf
    ),
    ensino_medio_ano_conclusao = coalesce(
      nullif(btrim(p_ensino_medio_ano_conclusao), ''), ensino_medio_ano_conclusao
    ),
    codigo_validacao = v_emissao.codigo,
    emitido_em = now(),
    emitido_por = v_responsavel,
    updated_at = now()
  WHERE id = p_certificado_id
  RETURNING * INTO v_cert;

  UPDATE public.documentos_validacao
  SET dados_emissao = dados_emissao || jsonb_build_object(
    'certificateId', v_cert.id,
    'certificateNumber', v_cert.certificado_numero,
    'registryPage', v_cert.pagina_livro,
    'registryBook', v_cert.livro_registro,
    'sistecValidation', v_cert.validacao_sistec,
    'highSchoolInstitution', v_cert.ensino_medio_estabelecimento,
    'highSchoolLocation', v_cert.ensino_medio_localidade_uf,
    'highSchoolCompletionYear', v_cert.ensino_medio_ano_conclusao,
    'completionDate', v_cert.data_conclusao,
    'finalGrade', v_cert.nota_final
  )
  WHERE codigo = v_cert.codigo_validacao;

  RETURN v_cert;
END;
$$;

REVOKE ALL ON FUNCTION public.finalizar_certificado_academico(
  uuid, text, text, text, text, text, text, text, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalizar_certificado_academico(
  uuid, text, text, text, text, text, text, text, uuid
) TO authenticated, service_role;

DROP POLICY IF EXISTS "portal_certificados_select" ON public.certificados_academicos;
DROP POLICY IF EXISTS "Acesso certificados secretaria" ON public.certificados_academicos;
DROP POLICY IF EXISTS "portal_certificados_write_gestor" ON public.certificados_academicos;
DROP POLICY IF EXISTS "portal_certificados_insert_gestor" ON public.certificados_academicos;
DROP POLICY IF EXISTS "portal_certificados_update_gestor" ON public.certificados_academicos;
DROP POLICY IF EXISTS "portal_certificados_delete_gestor" ON public.certificados_academicos;
CREATE POLICY "portal_certificados_select"
  ON public.certificados_academicos
  FOR SELECT
  TO authenticated
  USING (
    (polo_id IS NOT NULL AND public.is_gestor_for_polo(polo_id))
    OR (polo_id IS NULL AND public.is_gestor_global())
    OR (
      aluno_id = public.current_aluno_id()
      AND status = 'FINALIZADO'
      AND codigo_validacao IS NOT NULL
    )
  );

-- A fila pode ser consultada pelo portal, mas somente funções autoritativas
-- podem criar, alterar, finalizar ou excluir um certificado.
REVOKE ALL ON TABLE public.certificados_academicos FROM anon, authenticated;
GRANT SELECT ON TABLE public.certificados_academicos TO authenticated;
