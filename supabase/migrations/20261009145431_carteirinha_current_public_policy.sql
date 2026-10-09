-- A consulta da CIE usa a seleção atual sem reemitir ou reescrever o documento.
CREATE OR REPLACE FUNCTION public.dados_publicos_carteirinha_atual(
  p_emissao public.documentos_validacao
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_source record;
  v_raw jsonb;
  v_masked jsonb;
BEGIN
  IF p_emissao.documento <> 'carteirinha' THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT
    enrollment.status AS enrollment_status,
    enrollment.data_matricula AS enrollment_date,
    student.nome AS student_name,
    student.cpf_cnpj AS student_cpf,
    student.data_nascimento AS student_birth_date,
    student.nome_mae AS mother_name,
    student.foto_url AS student_photo_url,
    class.nome AS class_name,
    class.codigo AS class_code,
    course.nome AS course_name,
    unit.nome AS unit_name,
    unit.cnpj AS unit_cnpj,
    company.razao_social AS company_legal_name,
    company.nome_fantasia AS company_trade_name,
    company.cnpj AS company_cnpj
  INTO v_source
  FROM public.matriculas enrollment
  LEFT JOIN public.parceiros student ON student.id = enrollment.aluno_id
  LEFT JOIN public.turmas class ON class.id = enrollment.turma_id
  LEFT JOIN public.cursos course ON course.id = class.curso_id
  LEFT JOIN public.polos unit ON unit.id = coalesce(p_emissao.polo_id, class.polo_id)
  LEFT JOIN public.empresas company ON company.id = unit.company_id
  WHERE enrollment.id = p_emissao.matricula_id;

  IF NOT FOUND THEN
    RETURN coalesce(p_emissao.dados_publicos_snapshot, '{}'::jsonb);
  END IF;

  -- O cadastro só complementa chaves nunca congeladas. JSON null não é ausência.
  v_raw := jsonb_build_object(
    'studentName', v_source.student_name,
    'studentPhotoUrl', v_source.student_photo_url,
    'studentCpf', v_source.student_cpf,
    'studentBirthDate', v_source.student_birth_date,
    'motherName', v_source.mother_name,
    'maskedEnrollmentNumber', public.formatar_matricula_validacao(
      p_emissao.matricula_id, v_source.enrollment_date, p_emissao.polo_id
    ),
    'courseName', v_source.course_name,
    'className', coalesce(v_source.class_name, v_source.class_code),
    'institutionName', coalesce(v_source.company_legal_name,
      v_source.company_trade_name, v_source.unit_name, 'Universo Cursos e Consultoria'),
    'institutionCnpj', coalesce(nullif(v_source.unit_cnpj, ''), v_source.company_cnpj),
    'unitName', v_source.unit_name,
    'enrollmentStatus', upper(coalesce(v_source.enrollment_status, '')),
    'enrollmentDate', v_source.enrollment_date
  ) || coalesce(p_emissao.dados_emissao, '{}'::jsonb);

  v_masked := jsonb_build_object(
    'studentName', public.mascarar_nome_validacao_publica(v_raw ->> 'studentName'),
    'studentPhotoUrl', v_raw -> 'studentPhotoUrl',
    'studentCpf', public.mascarar_cpf_validacao_publica(v_raw ->> 'studentCpf'),
    'studentBirthDate', public.mascarar_nascimento_validacao_publica(v_raw ->> 'studentBirthDate'),
    'maskedMotherName', public.mascarar_nome_validacao_publica(
      CASE WHEN v_raw ? 'maskedMotherName' THEN v_raw ->> 'maskedMotherName'
        ELSE v_raw ->> 'motherName' END
    ),
    'maskedEnrollmentNumber', public.mascarar_matricula_validacao_publica(v_raw ->> 'maskedEnrollmentNumber'),
    'courseName', v_raw -> 'courseName',
    'className', v_raw -> 'className',
    'institutionName', v_raw -> 'institutionName',
    'institutionCnpj', public.formatar_cnpj_validacao_publica(v_raw ->> 'institutionCnpj'),
    'unitName', v_raw -> 'unitName',
    'enrollmentStatus', v_raw -> 'enrollmentStatus',
    'enrollmentDate', v_raw -> 'enrollmentDate',
    'issuedAt', p_emissao.emitido_em,
    'lastIssuedAt', p_emissao.ultima_emissao_em,
    'expiresAt', p_emissao.validade_ate,
    'referencePeriod', p_emissao.periodo_referencia,
    'issueCount', p_emissao.quantidade_emissoes
  );

  -- O snapshot público já foi mascarado pelo trigger e permanece prioritário,
  -- inclusive para valores explicitamente vazios. A RPC filtra a política atual.
  RETURN v_masked || coalesce(p_emissao.dados_publicos_snapshot, '{}'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.dados_publicos_carteirinha_atual(public.documentos_validacao)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dados_publicos_carteirinha_atual(public.documentos_validacao)
  TO service_role;

CREATE OR REPLACE FUNCTION public.validar_documento_por_codigo(p_codigo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_resultado jsonb;
  v_codigo text := upper(
    pg_catalog.regexp_replace(btrim(coalesce(p_codigo, '')), '\s+', '', 'g')
  );
BEGIN
  with candidate as (
    select
      validation.documento,
      validation.codigo,
      validation.status,
      validation.validacao_publica,
      case when validation.documento = 'carteirinha'
        then policy.versao else validation.politica_versao_emissao end as politica_versao_emissao,
      case when validation.documento = 'carteirinha'
        then policy.campos_publicos else validation.campos_publicos_emissao end as campos_publicos_emissao,
      case when validation.documento = 'carteirinha'
        then public.dados_publicos_carteirinha_atual(validation)
        else validation.dados_publicos_snapshot end as dados_publicos_snapshot,
      policy.campos_publicos as campos_publicos_atuais,
      policy.consulta_publica_ativa,
      policy.exige_vinculo_ativo,
      upper(coalesce(enrollment.status, '')) as enrollment_status,
      true as subject_active,
      public.documento_validade_efetiva(
        validation.documento,
        validation.validade_ate,
        class.data_previsao_termino
      ) as validade_efetiva
    from public.documentos_validacao validation
    join public.documentos_validacao_politicas policy
      on policy.documento = validation.documento
    left join public.matriculas enrollment
      on enrollment.id = validation.matricula_id
    left join public.turmas class on class.id = enrollment.turma_id
    where upper(btrim(validation.codigo)) = v_codigo
      and validation.validacao_publica
      and policy.consulta_publica_ativa

    union all

    select
      'carteirinha_preceptor'::text as documento,
      credential.codigo,
      credential.status,
      credential.validacao_publica,
      credential.politica_versao_emissao,
      credential.campos_publicos_emissao,
      credential.dados_publicos_snapshot,
      policy.campos_publicos as campos_publicos_atuais,
      policy.consulta_publica_ativa,
      false as exige_vinculo_ativo,
      null::text as enrollment_status,
      upper(coalesce(preceptor.status, '')) = 'ATIVO' as subject_active,
      credential.validade_ate as validade_efetiva
    from public.documentos_validacao_preceptores credential
    join public.documentos_validacao_politicas policy
      on policy.documento = 'carteirinha_preceptor'
    join public.parceiros preceptor on preceptor.id = credential.professor_id
    where upper(btrim(credential.codigo)) = v_codigo
      and credential.validacao_publica
      and policy.consulta_publica_ativa
  ),
  visible as (
    select
      candidate.*,
      coalesce(
        array(
          select emission_field.field
          from unnest(candidate.campos_publicos_emissao) as emission_field(field)
          where emission_field.field = any(candidate.campos_publicos_atuais)
          order by emission_field.field
        ),
        array[]::text[]
      ) as visible_fields
    from candidate
  )
  select
    jsonb_build_object(
      'type', visible.documento,
      'status', case
        when visible.status = 'REVOGADO' then 'REVOKED'
        when not visible.subject_active then 'REVOKED'
        when visible.validade_efetiva is not null and visible.validade_efetiva < now() then 'EXPIRED'
        when visible.exige_vinculo_ativo and visible.enrollment_status <> 'ATIVO' then 'REVOKED'
        else 'ACTIVE'
      end,
      'code', visible.codigo
    )
    || public.filtrar_dados_publicos_validacao(
      visible.dados_publicos_snapshot,
      visible.visible_fields
    )
    || case
      when 'expiresAt' = any(visible.visible_fields)
        then jsonb_build_object('expiresAt', visible.validade_efetiva)
      else '{}'::jsonb
    end
    || jsonb_build_object(
      'visibleFields', visible.visible_fields,
      'schemaVersion', visible.politica_versao_emissao
    )
  into v_resultado
  from visible
  limit 1;

  IF v_resultado IS NOT NULL THEN
    RETURN v_resultado;
  END IF;

  IF v_codigo !~ '^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$' THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'type', 'diario_classe',
    'status', CASE
      WHEN envelope.status = 'SUBSTITUIDO' THEN 'REVOKED'
      ELSE 'ACTIVE'
    END,
    'code', upper(envelope.id::text),
    'institutionName', envelope.documento_snapshot
      #>> '{institutionalIdentity,institution,name}',
    'issuedAt', envelope.finalizado_em,
    'visibleFields', jsonb_build_array('institutionName', 'issuedAt'),
    'schemaVersion', 2
  )
  INTO v_resultado
  FROM public.assinatura_eletronica_envelopes AS envelope
  JOIN public.documentos_validacao_politicas AS diary_policy
    ON diary_policy.documento = 'diario_classe'
   AND diary_policy.consulta_publica_ativa
  JOIN public.assinatura_eletronica_artefatos AS artefato_final
    ON artefato_final.envelope_id = envelope.id
   AND artefato_final.classe = 'DOCUMENTO_FINAL'
   AND artefato_final.sha256 = envelope.documento_final_sha256
  JOIN storage.objects AS objeto_final
    ON objeto_final.bucket_id = artefato_final.bucket_id
   AND objeto_final.name = artefato_final.storage_path
  WHERE envelope.id::text = lower(v_codigo)
    AND envelope.documento = 'diario_classe'
    AND envelope.origem_tipo = 'DIARIO'
    AND envelope.status IN ('ASSINADO', 'SUBSTITUIDO')
    AND envelope.finalizado_em IS NOT NULL
    AND envelope.documento_final_sha256 ~ '^[0-9a-f]{64}$'
    AND upper(envelope.documento_snapshot ->> 'validationCode')
      = upper(envelope.id::text)
  LIMIT 1;

  RETURN v_resultado;
END;
$function$;
