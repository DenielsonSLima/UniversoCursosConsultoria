CREATE TABLE IF NOT EXISTS public.certificados_academicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matricula_id UUID NOT NULL UNIQUE REFERENCES public.matriculas(id) ON DELETE RESTRICT,
  aluno_id UUID NOT NULL REFERENCES public.parceiros(id) ON DELETE RESTRICT,
  turma_id UUID NOT NULL REFERENCES public.turmas(id) ON DELETE RESTRICT,
  curso_id UUID NOT NULL REFERENCES public.cursos(id) ON DELETE RESTRICT,
  polo_id UUID REFERENCES public.polos(id) ON DELETE RESTRICT,
  modalidade TEXT NOT NULL CHECK (modalidade IN ('TECNICO', 'LIVRE', 'EAD', 'ESPECIALIZACAO')),
  status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'FINALIZADO', 'CANCELADO')),
  data_inscricao TIMESTAMPTZ,
  data_conclusao DATE NOT NULL DEFAULT CURRENT_DATE,
  nota_final NUMERIC(5,2),
  certificado_numero TEXT,
  pagina_livro TEXT,
  livro_registro TEXT,
  validacao_sistec TEXT,
  ensino_medio_estabelecimento TEXT,
  ensino_medio_localidade_uf TEXT,
  ensino_medio_ano_conclusao TEXT,
  codigo_validacao TEXT UNIQUE,
  emitido_em TIMESTAMPTZ,
  emitido_por UUID,
  metadados JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS certificados_academicos_fila_idx
  ON public.certificados_academicos (polo_id, modalidade, status, data_conclusao DESC);
CREATE INDEX IF NOT EXISTS certificados_academicos_turma_idx
  ON public.certificados_academicos (turma_id, status);
CREATE INDEX IF NOT EXISTS certificados_academicos_aluno_idx
  ON public.certificados_academicos (aluno_id, created_at DESC);

ALTER TABLE public.certificados_academicos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso certificados secretaria" ON public.certificados_academicos;
CREATE POLICY "Acesso certificados secretaria"
  ON public.certificados_academicos FOR ALL
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.sincronizar_certificado_matricula()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_turma public.turmas%ROWTYPE;
  v_curso public.cursos%ROWTYPE;
  v_aluno public.parceiros%ROWTYPE;
  v_conclusao DATE;
  v_media NUMERIC;
  v_reprovacoes INTEGER;
BEGIN
  IF UPPER(COALESCE(NEW.status, '')) <> 'CONCLUIDO' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_turma FROM public.turmas WHERE id = NEW.turma_id;
  SELECT * INTO v_curso FROM public.cursos WHERE id = v_turma.curso_id;
  SELECT * INTO v_aluno FROM public.parceiros WHERE id = NEW.aluno_id;

  IF v_curso.modalidade NOT IN ('TECNICO', 'LIVRE', 'EAD', 'ESPECIALIZACAO') THEN
    RETURN NEW;
  END IF;

  IF v_curso.modalidade = 'TECNICO' THEN
    SELECT
      AVG(media_final),
      COUNT(*) FILTER (WHERE resultado_final <> 'APROVADO')
    INTO v_media, v_reprovacoes
    FROM public.v_diario_notas_resultados
    WHERE turma_id = NEW.turma_id AND aluno_id = NEW.aluno_id;

    IF COALESCE(v_reprovacoes, 0) > 0 THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT COALESCE(MAX(data_movimentacao), CURRENT_DATE)
  INTO v_conclusao
  FROM public.matricula_movimentacoes
  WHERE matricula_id = NEW.id AND tipo = 'CONCLUSAO';

  INSERT INTO public.certificados_academicos (
    matricula_id, aluno_id, turma_id, curso_id, polo_id, modalidade,
    data_inscricao, data_conclusao, nota_final,
    ensino_medio_estabelecimento, ensino_medio_localidade_uf,
    ensino_medio_ano_conclusao
  )
  VALUES (
    NEW.id, NEW.aluno_id, NEW.turma_id, v_curso.id, v_turma.polo_id, v_curso.modalidade,
    NEW.data_matricula, v_conclusao, v_media,
    v_aluno.instituicao_origem,
    COALESCE(v_aluno.cidade, '') ||
      CASE WHEN v_aluno.uf IS NOT NULL THEN ' - ' || v_aluno.uf ELSE '' END,
    v_aluno.ano_conclusao_ensino_medio
  )
  ON CONFLICT (matricula_id) DO UPDATE SET
    nota_final = EXCLUDED.nota_final,
    data_conclusao = EXCLUDED.data_conclusao,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sincronizar_certificado_matricula ON public.matriculas;
CREATE TRIGGER trigger_sincronizar_certificado_matricula
AFTER INSERT OR UPDATE OF status ON public.matriculas
FOR EACH ROW EXECUTE FUNCTION public.sincronizar_certificado_matricula();

INSERT INTO public.certificados_academicos (
  matricula_id, aluno_id, turma_id, curso_id, polo_id, modalidade,
  data_inscricao, data_conclusao, nota_final,
  ensino_medio_estabelecimento, ensino_medio_localidade_uf,
  ensino_medio_ano_conclusao
)
SELECT
  m.id, m.aluno_id, m.turma_id, c.id, t.polo_id, c.modalidade,
  m.data_matricula,
  COALESCE((
    SELECT MAX(mm.data_movimentacao)
    FROM public.matricula_movimentacoes mm
    WHERE mm.matricula_id = m.id AND mm.tipo = 'CONCLUSAO'
  ), CURRENT_DATE),
  CASE WHEN c.modalidade = 'TECNICO' THEN (
    SELECT AVG(v.media_final)
    FROM public.v_diario_notas_resultados v
    WHERE v.turma_id = m.turma_id AND v.aluno_id = m.aluno_id
  ) ELSE NULL END,
  a.instituicao_origem,
  COALESCE(a.cidade, '') || CASE WHEN a.uf IS NOT NULL THEN ' - ' || a.uf ELSE '' END,
  a.ano_conclusao_ensino_medio
FROM public.matriculas m
JOIN public.turmas t ON t.id = m.turma_id
JOIN public.cursos c ON c.id = t.curso_id
JOIN public.parceiros a ON a.id = m.aluno_id
WHERE UPPER(m.status) = 'CONCLUIDO'
  AND c.modalidade IN ('TECNICO', 'LIVRE', 'EAD', 'ESPECIALIZACAO')
  AND (
    c.modalidade <> 'TECNICO'
    OR NOT EXISTS (
      SELECT 1 FROM public.v_diario_notas_resultados v
      WHERE v.turma_id = m.turma_id
        AND v.aluno_id = m.aluno_id
        AND v.resultado_final <> 'APROVADO'
    )
  )
ON CONFLICT (matricula_id) DO NOTHING;

ALTER TABLE public.documentos_validacao DROP CONSTRAINT IF EXISTS documentos_validacao_documento_check;
ALTER TABLE public.documentos_validacao ADD CONSTRAINT documentos_validacao_documento_check
  CHECK (documento IN (
    'carteirinha', 'cracha_estagio', 'declaracao_matricula',
    'declaracao_frequencia', 'declaracao_irpf', 'boletim',
    'historico_escolar', 'transferencia', 'rematricula', 'termo_estagio',
    'certificado_tecnico', 'certificado_livre', 'certificado_ead',
    'certificado_especializacao'
  ));

INSERT INTO public.documentos_validacao_politicas
  (documento, prefixo, escopo_identidade, validade_dias, exige_vinculo_ativo)
VALUES
  ('certificado_tecnico', 'CERT-TEC', 'MATRICULA', NULL, FALSE),
  ('certificado_livre', 'CERT-LIV', 'MATRICULA', NULL, FALSE),
  ('certificado_ead', 'CERT-EAD', 'MATRICULA', NULL, FALSE),
  ('certificado_especializacao', 'CERT-ESP', 'MATRICULA', NULL, FALSE)
ON CONFLICT (documento) DO NOTHING;

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

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.certificados_academicos;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
