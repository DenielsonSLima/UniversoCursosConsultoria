-- A emissão interna continua disponível para fluxos autoritativos. O navegador
-- usa wrappers que validam o ator, a matrícula, o polo e o tipo documental.

REVOKE ALL ON FUNCTION public.emitir_documento_validacao(
  text, uuid, text, text, timestamptz, uuid, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emitir_documento_validacao(
  text, uuid, text, text, timestamptz, uuid, boolean
) TO service_role;

REVOKE ALL ON FUNCTION public.revogar_documento_validacao(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revogar_documento_validacao(text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.emitir_documento_validacao_portal(
  p_documento text,
  p_matricula_id uuid,
  p_periodo_referencia text DEFAULT NULL,
  p_referencia_externa text DEFAULT NULL,
  p_validade_ate timestamptz DEFAULT NULL,
  p_emitido_por uuid DEFAULT NULL,
  p_registrar_reemissao boolean DEFAULT false
)
RETURNS TABLE (
  codigo text,
  documento text,
  emitido_em timestamptz,
  ultima_emissao_em timestamptz,
  validade_ate timestamptz,
  status text,
  quantidade_emissoes integer,
  reutilizado boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enrollment record;
  v_is_owner boolean := false;
  v_can_manage boolean := false;
  v_responsavel uuid;
  v_periodo text := p_periodo_referencia;
  v_referencia text := p_referencia_externa;
  v_validade timestamptz := p_validade_ate;
  v_registrar_reemissao boolean := p_registrar_reemissao;
BEGIN
  SELECT
    m.aluno_id,
    upper(coalesce(m.status, '')) AS matricula_status,
    upper(coalesce(t.status, '')) AS turma_status,
    upper(coalesce(c.modalidade, '')) AS modalidade,
    t.polo_id
  INTO v_enrollment
  FROM public.matriculas m
  JOIN public.turmas t ON t.id = m.turma_id
  JOIN public.cursos c ON c.id = t.curso_id
  WHERE m.id = p_matricula_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Matrícula não encontrada.';
  END IF;

  v_is_owner := public.current_aluno_id() = v_enrollment.aluno_id;
  v_can_manage := CASE
    WHEN v_enrollment.polo_id IS NULL THEN public.is_gestor_global()
    ELSE public.is_gestor_for_polo(v_enrollment.polo_id)
  END;

  IF coalesce(auth.role(), '') = 'service_role' THEN
    v_responsavel := internal_academic.resolve_responsavel(p_emitido_por);
  ELSIF v_can_manage THEN
    IF p_documento LIKE 'certificado\_%' ESCAPE '\' THEN
      RAISE EXCEPTION 'Certificados são emitidos somente pela fila da Secretaria.'
        USING ERRCODE = '42501';
    END IF;
    v_responsavel := internal_academic.resolve_responsavel(NULL);
  ELSIF v_is_owner THEN
    IF p_documento NOT IN (
      'carteirinha',
      'cracha_estagio',
      'declaracao_matricula',
      'declaracao_irpf'
    ) THEN
      RAISE EXCEPTION 'Este documento não está disponível para emissão direta pelo aluno.'
        USING ERRCODE = '42501';
    END IF;

    IF p_documento IN ('carteirinha', 'cracha_estagio') AND NOT (
      v_enrollment.matricula_status = 'ATIVO'
      AND v_enrollment.turma_status = 'EM_ANDAMENTO'
      AND v_enrollment.modalidade = 'TECNICO'
    ) THEN
      RAISE EXCEPTION 'Carteirinha e crachá exigem matrícula técnica ativa em turma em andamento.'
        USING ERRCODE = '42501';
    END IF;

    IF p_documento = 'declaracao_matricula'
      AND v_enrollment.matricula_status <> 'ATIVO'
    THEN
      RAISE EXCEPTION 'A declaração de matrícula exige vínculo ativo.'
        USING ERRCODE = '42501';
    END IF;

    IF p_documento = 'declaracao_irpf' AND NOT (
      v_enrollment.modalidade = 'TECNICO'
      AND v_enrollment.matricula_status IN (
        'ATIVO', 'CONCLUIDO', 'CANCELADO', 'TRANCADO',
        'DESISTENTE', 'TRANSFERIDO'
      )
    ) THEN
      RAISE EXCEPTION 'A declaração de IRPF exige vínculo técnico válido.'
        USING ERRCODE = '42501';
    END IF;

    -- O aluno não define identidade, validade nem reemissão. No documento anual,
    -- o único parâmetro aceito é um ano civil dentro de uma janela finita.
    v_referencia := NULL;
    v_validade := NULL;
    v_registrar_reemissao := false;
    IF p_documento = 'declaracao_irpf' THEN
      v_periodo := nullif(btrim(coalesce(p_periodo_referencia, '')), '');
      IF v_periodo IS NOT NULL THEN
        IF v_periodo !~ '^\d{4}$' THEN
          RAISE EXCEPTION 'Ano de referência do IRPF inválido.'
            USING ERRCODE = '22007';
        END IF;
        IF v_periodo::integer < 2000
          OR v_periodo::integer > extract(year FROM current_date)::integer
        THEN
          RAISE EXCEPTION 'Ano de referência do IRPF inválido.'
            USING ERRCODE = '22007';
        END IF;
      END IF;
    ELSE
      v_periodo := NULL;
    END IF;

    v_responsavel := NULL;
  ELSE
    RAISE EXCEPTION 'Sem permissão para emitir documento desta matrícula.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.emitir_documento_validacao(
    p_documento,
    p_matricula_id,
    v_periodo,
    v_referencia,
    v_validade,
    v_responsavel,
    v_registrar_reemissao
  );
END;
$$;

REVOKE ALL ON FUNCTION public.emitir_documento_validacao_portal(
  text, uuid, text, text, timestamptz, uuid, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emitir_documento_validacao_portal(
  text, uuid, text, text, timestamptz, uuid, boolean
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.revogar_documento_validacao_portal(p_codigo text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_document record;
  v_can_manage boolean;
BEGIN
  SELECT dv.documento, dv.polo_id
  INTO v_document
  FROM public.documentos_validacao dv
  WHERE upper(dv.codigo) = upper(btrim(p_codigo))
  FOR UPDATE;

  IF NOT FOUND THEN RETURN false; END IF;

  IF v_document.documento LIKE 'certificado\_%' ESCAPE '\' THEN
    RAISE EXCEPTION 'Revogue certificados pelo fluxo acadêmico coordenado.'
      USING ERRCODE = '42501';
  END IF;

  v_can_manage := CASE
    WHEN v_document.polo_id IS NULL THEN public.is_gestor_global()
    ELSE public.is_gestor_for_polo(v_document.polo_id)
  END;

  IF coalesce(auth.role(), '') <> 'service_role' AND NOT v_can_manage THEN
    RAISE EXCEPTION 'Sem permissão para revogar documento deste polo.'
      USING ERRCODE = '42501';
  END IF;

  RETURN public.revogar_documento_validacao(p_codigo);
END;
$$;

REVOKE ALL ON FUNCTION public.revogar_documento_validacao_portal(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revogar_documento_validacao_portal(text)
  TO authenticated, service_role;

DROP POLICY IF EXISTS "Equipe autenticada consulta documentos validacao"
  ON public.documentos_validacao;
DROP POLICY IF EXISTS "Acesso consulta documentos validacao"
  ON public.documentos_validacao;
DROP POLICY IF EXISTS "portal_documentos_validacao_select"
  ON public.documentos_validacao;
DROP POLICY IF EXISTS "portal_documentos_validacao_write_gestor"
  ON public.documentos_validacao;
DROP POLICY IF EXISTS "portal_documentos_validacao_insert_gestor"
  ON public.documentos_validacao;
DROP POLICY IF EXISTS "portal_documentos_validacao_update_gestor"
  ON public.documentos_validacao;
DROP POLICY IF EXISTS "portal_documentos_validacao_delete_gestor"
  ON public.documentos_validacao;

CREATE POLICY "portal_documentos_validacao_select"
  ON public.documentos_validacao
  FOR SELECT
  TO authenticated
  USING (
    aluno_id = public.current_aluno_id()
    OR (polo_id IS NOT NULL AND public.is_gestor_for_polo(polo_id))
    OR (polo_id IS NULL AND public.is_gestor_global())
  );

REVOKE ALL ON TABLE public.documentos_validacao FROM anon, authenticated;
GRANT SELECT ON TABLE public.documentos_validacao TO authenticated;
