CREATE OR REPLACE FUNCTION public.formatar_matricula_validacao(
  p_matricula_id UUID,
  p_data_matricula TIMESTAMPTZ,
  p_polo_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config JSONB;
  v_prefixo TEXT;
  v_digitos INTEGER;
  v_formato_ano TEXT;
  v_usar_polo BOOLEAN;
  v_ano TEXT;
  v_polo TEXT;
  v_hex TEXT;
  v_sequencia BIGINT;
BEGIN
  SELECT conteudo
  INTO v_config
  FROM public.documentos_templates
  WHERE id = 'academicos_config';

  v_config := COALESCE(v_config, '{}'::JSONB);
  v_prefixo := COALESCE(v_config ->> 'matriculaPrefix', 'UNIV-');
  v_digitos := LEAST(10, GREATEST(1, COALESCE((v_config ->> 'matriculaDigits')::INTEGER, 4)));
  v_formato_ano := COALESCE(v_config ->> 'yearFormat', 'yy');
  v_usar_polo := COALESCE((v_config ->> 'usePoloCode')::BOOLEAN, FALSE);

  v_ano := CASE v_formato_ano
    WHEN 'none' THEN ''
    WHEN 'yyyy' THEN TO_CHAR(COALESCE(p_data_matricula, now()), 'YYYY')
    ELSE TO_CHAR(COALESCE(p_data_matricula, now()), 'YY')
  END;

  v_polo := CASE
    WHEN NOT v_usar_polo THEN ''
    WHEN p_polo_id = '55555555-5555-5555-5555-555555555555'::UUID THEN '02'
    ELSE '01'
  END;

  v_hex := RIGHT(REGEXP_REPLACE(p_matricula_id::TEXT, '[^0-9a-f]', '', 'g'), 4);
  v_sequencia := (('x' || LPAD(v_hex, 4, '0'))::BIT(16)::INTEGER)
    % CAST(POWER(10::NUMERIC, v_digitos) AS BIGINT);

  RETURN UPPER(
    v_prefixo ||
    v_ano ||
    v_polo ||
    LPAD(v_sequencia::TEXT, v_digitos, '0')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.formatar_matricula_validacao(UUID, TIMESTAMPTZ, UUID)
  FROM PUBLIC, anon, authenticated;

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
      WHEN pol.exige_vinculo_ativo
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
      SPLIT_PART(COALESCE(aluno.nome, dv.dados_emissao ->> 'studentName', ''), ' ', 1) ||
      CASE
        WHEN POSITION(' ' IN COALESCE(aluno.nome, dv.dados_emissao ->> 'studentName', '')) > 0
          THEN ' ' || LEFT(
            SPLIT_PART(COALESCE(aluno.nome, dv.dados_emissao ->> 'studentName', ''), ' ', 2),
            1
          ) || '***'
        ELSE ''
      END,
    'studentCpf',
      '***.***.***-' || RIGHT(
        REGEXP_REPLACE(
          COALESCE(aluno.cpf_cnpj, dv.dados_emissao ->> 'studentCpf', ''),
          '\D',
          '',
          'g'
        ),
        2
      ),
    'studentBirthDate',
      '**/**/' || LEFT(
        COALESCE(aluno.data_nascimento::TEXT, dv.dados_emissao ->> 'studentBirthDate', ''),
        4
      ),
    'maskedMotherName',
      CASE
        WHEN NULLIF(BTRIM(aluno.nome_mae), '') IS NULL THEN 'Não informado'
        ELSE SPLIT_PART(BTRIM(aluno.nome_mae), ' ', 1) ||
          CASE
            WHEN POSITION(' ' IN BTRIM(aluno.nome_mae)) > 0
              THEN ' ' || LEFT(SPLIT_PART(BTRIM(aluno.nome_mae), ' ', 2), 1) || '***'
            ELSE ''
          END
      END,
    'maskedEnrollmentNumber',
      LEFT(
        public.formatar_matricula_validacao(
          dv.matricula_id,
          m.data_matricula,
          COALESCE(dv.polo_id, turma.polo_id)
        ),
        GREATEST(
          2,
          LENGTH(public.formatar_matricula_validacao(
            dv.matricula_id,
            m.data_matricula,
            COALESCE(dv.polo_id, turma.polo_id)
          )) - 6
        )
      ) || '****' || RIGHT(
        public.formatar_matricula_validacao(
          dv.matricula_id,
          m.data_matricula,
          COALESCE(dv.polo_id, turma.polo_id)
        ),
        2
      ),
    'studentPhotoUrl', COALESCE(aluno.foto_url, dv.dados_emissao ->> 'studentPhotoUrl'),
    'courseName', COALESCE(curso.nome, dv.dados_emissao ->> 'courseName'),
    'className', COALESCE(turma.nome, turma.codigo, dv.dados_emissao ->> 'className'),
    'institutionName', COALESCE(
      empresa.razao_social,
      empresa.nome_fantasia,
      polo.nome,
      dv.dados_emissao ->> 'institutionName'
    ),
    'institutionCnpj', COALESCE(NULLIF(polo.cnpj, ''), empresa.cnpj, 'Não informado'),
    'unitName', COALESCE(polo.nome, dv.dados_emissao ->> 'unitName'),
    'enrollmentStatus', UPPER(COALESCE(m.status, dv.dados_emissao ->> 'enrollmentStatus')),
    'enrollmentDate', COALESCE(m.data_matricula::TEXT, dv.dados_emissao ->> 'enrollmentDate')
  )
  FROM public.documentos_validacao dv
  LEFT JOIN public.matriculas m ON m.id = dv.matricula_id
  LEFT JOIN public.parceiros aluno ON aluno.id = dv.aluno_id
  LEFT JOIN public.turmas turma ON turma.id = m.turma_id
  LEFT JOIN public.cursos curso ON curso.id = turma.curso_id
  LEFT JOIN public.polos polo ON polo.id = COALESCE(dv.polo_id, turma.polo_id)
  LEFT JOIN public.empresas empresa ON empresa.id = polo.company_id
  JOIN public.documentos_validacao_politicas pol ON pol.documento = dv.documento
  WHERE UPPER(dv.codigo) = UPPER(BTRIM(p_codigo))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.validar_documento_por_codigo(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validar_documento_por_codigo(TEXT)
  TO anon, authenticated;
