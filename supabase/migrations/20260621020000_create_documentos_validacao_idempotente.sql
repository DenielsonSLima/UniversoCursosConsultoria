CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- A tabela já existe no ambiente atual e guarda os modelos. A declaração
-- abaixo torna a cadeia de migrations reproduzível em bancos novos.
CREATE TABLE IF NOT EXISTS public.documentos_templates (
  id TEXT PRIMARY KEY,
  conteudo JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.documentos_validacao_politicas (
  documento TEXT PRIMARY KEY,
  prefixo TEXT NOT NULL,
  escopo_identidade TEXT NOT NULL
    CHECK (escopo_identidade IN ('MATRICULA', 'ANUAL', 'PROCESSO')),
  validade_dias INTEGER CHECK (validade_dias IS NULL OR validade_dias > 0),
  exige_vinculo_ativo BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.documentos_validacao_politicas (
  documento,
  prefixo,
  escopo_identidade,
  validade_dias,
  exige_vinculo_ativo
)
VALUES
  ('carteirinha', 'CIE', 'MATRICULA', 365, TRUE),
  ('cracha_estagio', 'CRA-EST', 'MATRICULA', 365, TRUE),
  ('declaracao_matricula', 'DEC-MAT', 'MATRICULA', 30, TRUE),
  ('declaracao_frequencia', 'DEC-FRE', 'MATRICULA', 30, TRUE),
  ('declaracao_irpf', 'IRPF', 'ANUAL', 365, FALSE),
  ('boletim', 'BOL', 'ANUAL', 30, FALSE),
  ('historico_escolar', 'HIS', 'MATRICULA', NULL, FALSE),
  ('transferencia', 'TRA', 'PROCESSO', 30, FALSE),
  ('rematricula', 'REM', 'MATRICULA', 30, TRUE),
  ('termo_estagio', 'TER-EST', 'PROCESSO', 90, FALSE)
ON CONFLICT (documento) DO NOTHING;

ALTER TABLE public.documentos_validacao_politicas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.documentos_validacao_politicas FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.documentos_validacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identidade TEXT NOT NULL UNIQUE,
  codigo TEXT NOT NULL UNIQUE,
  documento TEXT NOT NULL CHECK (
    documento IN (
      'carteirinha',
      'cracha_estagio',
      'declaracao_matricula',
      'declaracao_frequencia',
      'declaracao_irpf',
      'boletim',
      'historico_escolar',
      'transferencia',
      'rematricula',
      'termo_estagio'
    )
  ),
  matricula_id UUID NOT NULL REFERENCES public.matriculas(id) ON DELETE RESTRICT,
  aluno_id UUID NOT NULL REFERENCES public.parceiros(id) ON DELETE RESTRICT,
  polo_id UUID REFERENCES public.polos(id) ON DELETE RESTRICT,
  periodo_referencia TEXT,
  referencia_externa TEXT,
  status TEXT NOT NULL DEFAULT 'ATIVO'
    CHECK (status IN ('ATIVO', 'REVOGADO')),
  emitido_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultima_emissao_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  validade_ate TIMESTAMPTZ,
  revogado_em TIMESTAMPTZ,
  emitido_por UUID,
  quantidade_emissoes INTEGER NOT NULL DEFAULT 1 CHECK (quantidade_emissoes > 0),
  dados_emissao JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documentos_validacao_codigo_idx
  ON public.documentos_validacao (codigo);

CREATE INDEX IF NOT EXISTS documentos_validacao_matricula_idx
  ON public.documentos_validacao (matricula_id, documento, periodo_referencia);

CREATE INDEX IF NOT EXISTS documentos_validacao_aluno_idx
  ON public.documentos_validacao (aluno_id, ultima_emissao_em DESC);

CREATE INDEX IF NOT EXISTS documentos_validacao_polo_idx
  ON public.documentos_validacao (polo_id);

ALTER TABLE public.documentos_validacao ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.documentos_validacao FROM anon, authenticated;

WITH registros_legados AS (
  SELECT
    dt.id,
    dt.conteudo,
    dt.updated_at,
    dt.conteudo ->> 'type' AS documento,
    dt.conteudo ->> 'enrollmentId' AS matricula_id_texto,
    CASE
      WHEN dt.conteudo ->> 'type' = 'declaracao_irpf' THEN
        (
          EXTRACT(
            YEAR FROM COALESCE(
              NULLIF(dt.conteudo ->> 'issuedAt', '')::TIMESTAMPTZ,
              dt.updated_at,
              now()
            )
          )::INTEGER - 1
        )::TEXT
      WHEN dt.conteudo ->> 'type' = 'boletim' THEN
        EXTRACT(
          YEAR FROM COALESCE(
            NULLIF(dt.conteudo ->> 'issuedAt', '')::TIMESTAMPTZ,
            dt.updated_at,
            now()
          )
        )::INTEGER::TEXT
      ELSE NULL
    END AS periodo_referencia,
    CASE
      WHEN dt.conteudo ->> 'type' = 'termo_estagio'
        THEN COALESCE(dt.conteudo ->> 'referenceId', 'legacy-principal')
      ELSE NULL
    END AS referencia_externa
  FROM public.documentos_templates dt
  WHERE dt.id LIKE 'validation\_%' ESCAPE '\'
    AND dt.id NOT LIKE 'validation\_source\_%' ESCAPE '\'
    AND dt.conteudo ->> 'type' IN (
      'carteirinha',
      'cracha_estagio',
      'declaracao_matricula',
      'declaracao_frequencia',
      'declaracao_irpf',
      'boletim',
      'historico_escolar',
      'rematricula',
      'termo_estagio'
    )
    AND dt.conteudo ->> 'enrollmentId'
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
),
legados_identificados AS (
  SELECT
    rl.*,
    CONCAT_WS(
      ':',
      rl.documento,
      rl.matricula_id_texto,
      COALESCE(rl.periodo_referencia, '-'),
      COALESCE(rl.referencia_externa, '-')
    ) AS identidade
  FROM registros_legados rl
),
legados_unicos AS (
  SELECT DISTINCT ON (identidade) *
  FROM legados_identificados
  ORDER BY identidade, updated_at DESC NULLS LAST
)
INSERT INTO public.documentos_validacao (
  identidade,
  codigo,
  documento,
  matricula_id,
  aluno_id,
  polo_id,
  periodo_referencia,
  referencia_externa,
  status,
  emitido_em,
  ultima_emissao_em,
  validade_ate,
  emitido_por,
  dados_emissao,
  created_at,
  updated_at
)
SELECT
  lu.identidade,
  REGEXP_REPLACE(lu.id, '^validation_', ''),
  lu.documento,
  m.id,
  m.aluno_id,
  t.polo_id,
  lu.periodo_referencia,
  lu.referencia_externa,
  CASE
    WHEN lu.conteudo ->> 'status' IN ('REVOKED', 'CANCELADO') THEN 'REVOGADO'
    ELSE 'ATIVO'
  END,
  COALESCE(NULLIF(lu.conteudo ->> 'issuedAt', '')::TIMESTAMPTZ, lu.updated_at, now()),
  COALESCE(lu.updated_at, now()),
  NULLIF(lu.conteudo ->> 'expiresAt', '')::TIMESTAMPTZ,
  CASE
    WHEN lu.conteudo ->> 'issuedBy'
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN (lu.conteudo ->> 'issuedBy')::UUID
    ELSE NULL
  END,
  lu.conteudo,
  COALESCE(NULLIF(lu.conteudo ->> 'issuedAt', '')::TIMESTAMPTZ, lu.updated_at, now()),
  COALESCE(lu.updated_at, now())
FROM legados_unicos lu
JOIN public.matriculas m ON m.id = lu.matricula_id_texto::UUID
LEFT JOIN public.turmas t ON t.id = m.turma_id
ON CONFLICT (identidade) DO NOTHING;

CREATE OR REPLACE FUNCTION public.emitir_documento_validacao(
  p_documento TEXT,
  p_matricula_id UUID,
  p_periodo_referencia TEXT DEFAULT NULL,
  p_referencia_externa TEXT DEFAULT NULL,
  p_validade_ate TIMESTAMPTZ DEFAULT NULL,
  p_emitido_por UUID DEFAULT NULL,
  p_registrar_reemissao BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  codigo TEXT,
  documento TEXT,
  emitido_em TIMESTAMPTZ,
  ultima_emissao_em TIMESTAMPTZ,
  validade_ate TIMESTAMPTZ,
  status TEXT,
  quantidade_emissoes INTEGER,
  reutilizado BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matricula RECORD;
  v_periodo TEXT;
  v_referencia TEXT;
  v_identidade TEXT;
  v_prefixo TEXT;
  v_validade TIMESTAMPTZ;
  v_codigo TEXT;
  v_existia BOOLEAN;
  v_politica RECORD;
BEGIN
  SELECT *
  INTO v_politica
  FROM public.documentos_validacao_politicas pol
  WHERE pol.documento = p_documento;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tipo de documento não permitido: %', p_documento;
  END IF;

  SELECT
    m.id,
    m.aluno_id,
    m.status AS matricula_status,
    m.data_matricula,
    t.polo_id AS polo_id,
    p.nome AS aluno_nome,
    p.cpf_cnpj AS aluno_cpf,
    p.data_nascimento AS aluno_nascimento,
    p.foto_url AS aluno_foto_url,
    t.nome AS turma_nome,
    t.codigo AS turma_codigo,
    c.nome AS curso_nome,
    po.nome AS polo_nome
  INTO v_matricula
  FROM public.matriculas m
  JOIN public.parceiros p ON p.id = m.aluno_id
  LEFT JOIN public.turmas t ON t.id = m.turma_id
  LEFT JOIN public.cursos c ON c.id = t.curso_id
  LEFT JOIN public.polos po ON po.id = t.polo_id
  WHERE m.id = p_matricula_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Matrícula não encontrada.';
  END IF;

  v_periodo := NULLIF(BTRIM(p_periodo_referencia), '');
  v_referencia := NULLIF(BTRIM(p_referencia_externa), '');

  IF v_politica.escopo_identidade = 'ANUAL'
     AND p_documento = 'declaracao_irpf'
     AND v_periodo IS NULL THEN
    v_periodo := (EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER - 1)::TEXT;
  ELSIF v_politica.escopo_identidade = 'ANUAL' AND v_periodo IS NULL THEN
    v_periodo := (EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER)::TEXT;
  END IF;

  IF v_politica.escopo_identidade = 'PROCESSO' AND v_referencia IS NULL THEN
    RAISE EXCEPTION 'Este documento exige uma referência de processo ou contrato.';
  END IF;

  v_identidade := CONCAT_WS(
    ':',
    p_documento,
    p_matricula_id::TEXT,
    COALESCE(v_periodo, '-'),
    COALESCE(v_referencia, '-')
  );

  IF NOT p_registrar_reemissao THEN
    SELECT
      dv.codigo,
      dv.documento,
      dv.emitido_em,
      dv.ultima_emissao_em,
      dv.validade_ate,
      dv.status,
      dv.quantidade_emissoes
    INTO
      codigo,
      documento,
      emitido_em,
      ultima_emissao_em,
      validade_ate,
      status,
      quantidade_emissoes
    FROM public.documentos_validacao dv
    WHERE dv.identidade = v_identidade;

    IF FOUND THEN
      reutilizado := TRUE;
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  v_prefixo := v_politica.prefixo;

  v_validade := COALESCE(
    p_validade_ate,
    CASE
      WHEN v_politica.validade_dias IS NULL THEN NULL
      ELSE now() + make_interval(days => v_politica.validade_dias)
    END
  );

  SELECT EXISTS (
    SELECT 1
    FROM public.documentos_validacao dv
    WHERE dv.identidade = v_identidade
  ) INTO v_existia;

  LOOP
    v_codigo := v_prefixo || '-' ||
      UPPER(SUBSTRING(ENCODE(extensions.gen_random_bytes(9), 'hex') FROM 1 FOR 4)) || '-' ||
      UPPER(SUBSTRING(ENCODE(extensions.gen_random_bytes(9), 'hex') FROM 1 FOR 4)) || '-' ||
      UPPER(SUBSTRING(ENCODE(extensions.gen_random_bytes(9), 'hex') FROM 1 FOR 4));

    BEGIN
      INSERT INTO public.documentos_validacao (
        identidade,
        codigo,
        documento,
        matricula_id,
        aluno_id,
        polo_id,
        periodo_referencia,
        referencia_externa,
        validade_ate,
        emitido_por,
        dados_emissao
      )
      VALUES (
        v_identidade,
        v_codigo,
        p_documento,
        p_matricula_id,
        v_matricula.aluno_id,
        v_matricula.polo_id,
        v_periodo,
        v_referencia,
        v_validade,
        p_emitido_por,
        jsonb_build_object(
          'studentName', v_matricula.aluno_nome,
          'studentCpf', v_matricula.aluno_cpf,
          'studentBirthDate', v_matricula.aluno_nascimento,
          'studentPhotoUrl', v_matricula.aluno_foto_url,
          'courseName', v_matricula.curso_nome,
          'className', COALESCE(v_matricula.turma_nome, v_matricula.turma_codigo),
          'unitName', v_matricula.polo_nome,
          'enrollmentStatus', UPPER(COALESCE(v_matricula.matricula_status, '')),
          'enrollmentDate', v_matricula.data_matricula,
          'institutionName', 'Universo Cursos e Consultoria'
        )
      )
      ON CONFLICT (identidade) DO UPDATE SET
        ultima_emissao_em = CASE
          WHEN p_registrar_reemissao THEN now()
          ELSE documentos_validacao.ultima_emissao_em
        END,
        validade_ate = CASE
          WHEN p_registrar_reemissao THEN EXCLUDED.validade_ate
          ELSE documentos_validacao.validade_ate
        END,
        emitido_por = COALESCE(EXCLUDED.emitido_por, documentos_validacao.emitido_por),
        quantidade_emissoes = documentos_validacao.quantidade_emissoes +
          CASE WHEN p_registrar_reemissao THEN 1 ELSE 0 END,
        dados_emissao = EXCLUDED.dados_emissao,
        updated_at = now()
      RETURNING
        documentos_validacao.codigo,
        documentos_validacao.documento,
        documentos_validacao.emitido_em,
        documentos_validacao.ultima_emissao_em,
        documentos_validacao.validade_ate,
        documentos_validacao.status,
        documentos_validacao.quantidade_emissoes
      INTO
        codigo,
        documento,
        emitido_em,
        ultima_emissao_em,
        validade_ate,
        status,
        quantidade_emissoes;

      reutilizado := v_existia OR codigo <> v_codigo;
      RETURN NEXT;
      RETURN;
    EXCEPTION
      WHEN unique_violation THEN
        -- Colisão extremamente improvável do código. Repete somente quando a
        -- identidade ainda não existe; concorrência na identidade usa o UPSERT.
        IF EXISTS (
          SELECT 1 FROM public.documentos_validacao WHERE identidade = v_identidade
        ) THEN
          CONTINUE;
        END IF;
    END;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_documento_por_codigo(p_codigo TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'type', dv.documento,
    'status', CASE
      WHEN dv.status = 'REVOGADO' THEN 'REVOKED'
      WHEN dv.validade_ate IS NOT NULL AND dv.validade_ate < now() THEN 'EXPIRED'
      WHEN p.exige_vinculo_ativo
        AND UPPER(COALESCE(m.status, '')) <> 'ATIVO' THEN 'REVOKED'
      ELSE 'ACTIVE'
    END,
    'code', dv.codigo,
    'issuedAt', dv.emitido_em,
    'lastIssuedAt', dv.ultima_emissao_em,
    'expiresAt', dv.validade_ate,
    'referencePeriod', dv.periodo_referencia,
    'issueCount', dv.quantidade_emissoes,
    'enrollmentId', dv.matricula_id,
    'studentName',
      SPLIT_PART(dv.dados_emissao ->> 'studentName', ' ', 1) ||
      CASE
        WHEN POSITION(' ' IN COALESCE(dv.dados_emissao ->> 'studentName', '')) > 0
          THEN ' ' || LEFT(
            SPLIT_PART(dv.dados_emissao ->> 'studentName', ' ', 2),
            1
          ) || '***'
        ELSE ''
      END,
    'studentCpf',
      '***.***.***-' || RIGHT(
        REGEXP_REPLACE(COALESCE(dv.dados_emissao ->> 'studentCpf', ''), '\D', '', 'g'),
        2
      ),
    'studentBirthDate',
      '**/**/' || LEFT(COALESCE(dv.dados_emissao ->> 'studentBirthDate', ''), 4),
    'studentPhotoUrl', dv.dados_emissao ->> 'studentPhotoUrl',
    'courseName', dv.dados_emissao ->> 'courseName',
    'className', dv.dados_emissao ->> 'className',
    'institutionName', dv.dados_emissao ->> 'institutionName',
    'unitName', dv.dados_emissao ->> 'unitName',
    'enrollmentStatus', UPPER(COALESCE(m.status, dv.dados_emissao ->> 'enrollmentStatus')),
    'enrollmentDate', dv.dados_emissao ->> 'enrollmentDate'
  )
  FROM public.documentos_validacao dv
  LEFT JOIN public.matriculas m ON m.id = dv.matricula_id
  JOIN public.documentos_validacao_politicas p ON p.documento = dv.documento
  WHERE UPPER(dv.codigo) = UPPER(BTRIM(p_codigo))
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.revogar_documento_validacao(p_codigo TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.documentos_validacao
  SET
    status = 'REVOGADO',
    revogado_em = now(),
    updated_at = now()
  WHERE UPPER(codigo) = UPPER(BTRIM(p_codigo));

  RETURN FOUND;
END;
$$;

GRANT SELECT ON public.documentos_validacao TO authenticated;

DROP POLICY IF EXISTS "Equipe autenticada consulta documentos validacao"
  ON public.documentos_validacao;
CREATE POLICY "Equipe autenticada consulta documentos validacao"
  ON public.documentos_validacao
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL ON FUNCTION public.emitir_documento_validacao(
  TEXT, UUID, TEXT, TEXT, TIMESTAMPTZ, UUID, BOOLEAN
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validar_documento_por_codigo(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revogar_documento_validacao(TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.emitir_documento_validacao(
  TEXT, UUID, TEXT, TEXT, TIMESTAMPTZ, UUID, BOOLEAN
) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.validar_documento_por_codigo(TEXT)
  TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.revogar_documento_validacao(TEXT)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.revogar_documento_validacao(TEXT)
  FROM anon;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.documentos_validacao;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
