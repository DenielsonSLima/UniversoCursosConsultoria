CREATE OR REPLACE FUNCTION public.finalizar_certificado_academico(
  p_certificado_id UUID,
  p_certificado_numero TEXT DEFAULT NULL,
  p_pagina_livro TEXT DEFAULT NULL,
  p_livro_registro TEXT DEFAULT NULL,
  p_validacao_sistec TEXT DEFAULT NULL,
  p_ensino_medio_estabelecimento TEXT DEFAULT NULL,
  p_ensino_medio_localidade_uf TEXT DEFAULT NULL,
  p_ensino_medio_ano_conclusao TEXT DEFAULT NULL,
  p_emitido_por UUID DEFAULT NULL
)
RETURNS public.certificados_academicos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cert public.certificados_academicos%ROWTYPE;
  v_doc TEXT;
  v_emissao RECORD;
BEGIN
  SELECT * INTO v_cert FROM public.certificados_academicos
  WHERE id = p_certificado_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Certificado não encontrado.'; END IF;

  v_doc := CASE v_cert.modalidade
    WHEN 'TECNICO' THEN 'certificado_tecnico'
    WHEN 'LIVRE' THEN 'certificado_livre'
    WHEN 'EAD' THEN 'certificado_ead'
    ELSE 'certificado_especializacao'
  END;

  SELECT * INTO v_emissao FROM public.emitir_documento_validacao(
    v_doc, v_cert.matricula_id, NULL, NULL, NULL, p_emitido_por, FALSE
  );

  UPDATE public.certificados_academicos SET
    status = 'FINALIZADO',
    certificado_numero = NULLIF(BTRIM(p_certificado_numero), ''),
    pagina_livro = NULLIF(BTRIM(p_pagina_livro), ''),
    livro_registro = NULLIF(BTRIM(p_livro_registro), ''),
    validacao_sistec = NULLIF(BTRIM(p_validacao_sistec), ''),
    ensino_medio_estabelecimento = COALESCE(NULLIF(BTRIM(p_ensino_medio_estabelecimento), ''), ensino_medio_estabelecimento),
    ensino_medio_localidade_uf = COALESCE(NULLIF(BTRIM(p_ensino_medio_localidade_uf), ''), ensino_medio_localidade_uf),
    ensino_medio_ano_conclusao = COALESCE(NULLIF(BTRIM(p_ensino_medio_ano_conclusao), ''), ensino_medio_ano_conclusao),
    codigo_validacao = v_emissao.codigo,
    emitido_em = now(),
    emitido_por = p_emitido_por,
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
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalizar_certificado_academico(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID
) TO anon, authenticated;
