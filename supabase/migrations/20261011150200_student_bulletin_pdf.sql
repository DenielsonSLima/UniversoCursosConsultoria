-- Own-student bulletin emission. The generic privileged issuer stays private.
CREATE OR REPLACE FUNCTION public.obter_boletim_aluno_pdf(
  p_matricula_id uuid,
  p_modulo_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_aluno_id uuid;
  v_enrollment record;
  v_template jsonb;
  v_polo jsonb;
  v_watermark jsonb;
  v_academic jsonb;
  v_issue record;
  v_emission jsonb;
  v_snapshot jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_matricula_id IS NULL OR p_modulo_id IS NULL THEN
    RAISE EXCEPTION 'Acesso ao boletim do aluno não autorizado.' USING ERRCODE = '42501';
  END IF;
  v_aluno_id := public.current_aluno_id();
  IF v_aluno_id IS NULL THEN
    RAISE EXCEPTION 'Acesso ao boletim do aluno não autorizado.' USING ERRCODE = '42501';
  END IF;

  -- Keep ownership and academic eligibility stable until the emission commits.
  SELECT enrollment.id, enrollment.turma_id, class.polo_id,
    jsonb_build_object('id', enrollment.id, 'status', enrollment.status,
      'turma', jsonb_build_object('id', class.id, 'nome', class.nome, 'codigo', class.codigo)) AS matricula,
    jsonb_build_object('id', student.id, 'nome', student.nome,
      'cpf_cnpj', student.cpf_cnpj, 'rg', student.rg, 'tipo_documento', student.tipo_documento,
      'orgao_emissor', student.orgao_emissor, 'rg_uf_emissao', student.rg_uf_emissao,
      'rg_data_emissao', student.rg_data_emissao, 'data_nascimento', student.data_nascimento) AS aluno
  INTO v_enrollment
  FROM public.matriculas enrollment
  JOIN public.turmas class ON class.id = enrollment.turma_id
  JOIN public.cursos course ON course.id = class.curso_id
  JOIN public.parceiros student ON student.id = enrollment.aluno_id
  WHERE enrollment.id = p_matricula_id AND enrollment.aluno_id = v_aluno_id
    AND upper(coalesce(course.modalidade, '')) IN ('TECNICO', 'TÉCNICO')
    AND ((upper(coalesce(enrollment.status, '')) = 'ATIVO'
      AND upper(coalesce(class.status, '')) = 'EM_ANDAMENTO')
      OR (upper(coalesce(enrollment.status, '')) = 'EM_DEPENDENCIA'
        AND upper(coalesce(class.status, '')) = 'FINALIZADA'))
  FOR SHARE OF enrollment, class, course, student NOWAIT;
  IF NOT FOUND OR v_enrollment.polo_id IS NULL
    OR public.current_aluno_id() IS DISTINCT FROM v_aluno_id
  THEN
    RAISE EXCEPTION 'O boletim exige matrícula técnica elegível do próprio aluno.' USING ERRCODE = '42501';
  END IF;

  -- A module must be offered in this class and have a started academic period.
  PERFORM period.id
  FROM public.turmas_disciplinas offered
  JOIN public.periodos_letivos period ON period.id = offered.periodo_letivo_id
  JOIN public.disciplinas discipline ON discipline.id = offered.disciplina_id
  WHERE offered.turma_id = v_enrollment.turma_id
    AND period.turma_id = v_enrollment.turma_id
    AND period.modulo_id = p_modulo_id AND discipline.modulo_id = p_modulo_id
    AND period.status IN ('ABERTO', 'EM_FECHAMENTO', 'FECHADO')
  FOR SHARE OF offered, period, discipline NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O módulo selecionado não está iniciado nesta turma.' USING ERRCODE = '42501';
  END IF;

  -- Canonical policy controls validity/QR and stable identity includes the selected module.
  SELECT issued.* INTO v_issue FROM public.emitir_documento_validacao_interno(
    'boletim', p_matricula_id, p_modulo_id::text, NULL, NULL, NULL, false
  ) issued;

  select jsonb_build_object(
      'id', validation.id,
      'identidade', validation.identidade,
      'codigo', validation.codigo,
      'documento', validation.documento,
      'matricula_id', validation.matricula_id,
      'aluno_id', validation.aluno_id,
      'polo_id', validation.polo_id,
      'periodo_referencia', validation.periodo_referencia,
      'referencia_externa', validation.referencia_externa,
      'status', validation.status,
      'emitido_em', validation.emitido_em,
      'ultima_emissao_em', validation.ultima_emissao_em,
      'validade_ate', validation.validade_ate,
      'validacao_publica', validation.validacao_publica,
      'revogado_em', validation.revogado_em,
      'emitido_por', validation.emitido_por,
      'quantidade_emissoes', validation.quantidade_emissoes,
      'dados_emissao', validation.dados_emissao,
      'aluno', v_enrollment.aluno,
      'matricula', v_enrollment.matricula
    )
  into v_emission
  from public.documentos_validacao as validation
  where validation.codigo = v_issue.codigo
    and validation.documento = 'boletim'
    and validation.periodo_referencia = p_modulo_id::text
    and validation.matricula_id = p_matricula_id
    and validation.aluno_id = v_aluno_id
    and validation.polo_id = v_enrollment.polo_id
    and validation.status = 'ATIVO';


  IF v_emission IS NULL THEN
    RAISE EXCEPTION 'A emissão oficial do boletim não foi localizada.' USING ERRCODE = '55000';
  END IF;
  v_snapshot := v_emission -> 'dados_emissao';
  IF v_snapshot ? 'academicDataSnapshot' THEN
    v_academic := v_snapshot -> 'academicDataSnapshot';
  ELSE
    v_academic := internal_academic.get_document_payload(p_matricula_id, 'boletim', p_modulo_id);
  END IF;
  IF v_snapshot ? 'documentTemplateSnapshot' THEN
    v_template := v_snapshot -> 'documentTemplateSnapshot';
  ELSE
    v_template := internal_academic.get_bulletin_template();
  END IF;
  IF jsonb_typeof(v_template) IS DISTINCT FROM 'object'
    OR jsonb_typeof(v_template -> 'textContent') IS DISTINCT FROM 'string'
    OR nullif(btrim(v_template ->> 'textContent'), '') IS NULL
    OR (v_template ? 'absoluteFields'
      AND jsonb_typeof(v_template -> 'absoluteFields') IS DISTINCT FROM 'array')
  THEN
    RAISE EXCEPTION 'O snapshot do modelo oficial do boletim está inválido.' USING ERRCODE = '55000';
  END IF;
  IF NOT (v_snapshot ? 'institutionSnapshot' AND v_snapshot ? 'watermarkSnapshot') THEN
  -- Keep the same header fallbacks as polosService.getById. Return only PDF fields.
  select jsonb_build_object(
      'id', unit.id,
      'nome', unit.nome,
      'nomeFantasia', unit.nome,
      'cnpj', unit.cnpj,
      'cidade', unit.cidade,
      'estado', unit.estado,
      'uf', unit.estado,
      'is_matriz', unit.is_matriz,
      'logoUrl', coalesce(nullif(unit.logo_url, ''), nullif(company.logo_url, ''),
        nullif(principal.logo_url, ''), ''),
      'endereco', coalesce(nullif(unit.endereco, ''), company.endereco, ''),
      'numero', coalesce(nullif(unit.numero, ''), company.numero, ''),
      'complemento', coalesce(nullif(unit.complemento, ''), company.complemento, ''),
      'bairro', coalesce(nullif(unit.bairro, ''), company.bairro, ''),
      'cep', coalesce(nullif(unit.cep, ''), company.cep, ''),
      'telefone', coalesce(nullif(unit.telefone, ''), company.telefone, ''),
      'email', coalesce(nullif(unit.email, ''), company.email, '')
    ),
    jsonb_build_object(
      'id', unit.id,
      'nomeFantasia', unit.nome,
      'cidade', unit.cidade,
      'uf', unit.estado,
      'watermarkUrl', unit.watermark_url,
      'watermarkOpacity', coalesce(unit.watermark_opacity, 0.1),
      'watermarkScale', coalesce(unit.watermark_scale, 50),
      'watermarkRotate', unit.watermark_rotate is distinct from false
    )
  into v_polo, v_watermark
  from public.polos as unit
  left join public.empresas as company on company.id = unit.company_id
  left join lateral (
    select enterprise.logo_url
    from public.empresas as enterprise
    order by enterprise.id
    limit 1
  ) as principal on true
  where unit.id = v_enrollment.polo_id;

    if v_polo is null then
      raise exception 'A instituição da matrícula não foi localizada.'
        using errcode = '55000';
    end if;
  END IF;


  IF v_snapshot ? 'institutionSnapshot' THEN
    v_polo := v_snapshot -> 'institutionSnapshot';
  END IF;
  IF jsonb_typeof(v_polo) IS DISTINCT FROM 'object'
    OR coalesce(nullif(btrim(v_polo ->> 'nomeFantasia'), ''), nullif(btrim(v_polo ->> 'nome'), '')) IS NULL
  THEN
    RAISE EXCEPTION 'O snapshot institucional do boletim está inválido.' USING ERRCODE = '55000';
  END IF;

  -- Presence matters: malformed/null frozen content must fail, never become live data.
  IF jsonb_typeof(v_academic) IS DISTINCT FROM 'object'
    OR jsonb_typeof(v_academic -> 'componentes') IS DISTINCT FROM 'array'
    OR jsonb_array_length(v_academic -> 'componentes') = 0
  THEN
    RAISE EXCEPTION 'O snapshot acadêmico do boletim está inválido.' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_academic -> 'componentes') component
    WHERE component ->> 'moduleId' IS DISTINCT FROM p_modulo_id::text)
  THEN
    RAISE EXCEPTION 'O snapshot do boletim pertence a outro módulo.' USING ERRCODE = '55000';
  END IF;
  -- Never overwrite a previously issued manager/student document on replay.
  IF NOT v_issue.reutilizado THEN
    UPDATE public.documentos_validacao validation
    SET dados_emissao = validation.dados_emissao || jsonb_build_object(
      'studentMatricula', v_academic -> 'studentMatricula',
      'studentDocumentType', v_academic -> 'studentDocumentType',
      'studentCpf', v_academic -> 'studentCpf', 'studentRg', v_academic -> 'studentRg',
      'studentRgIssuer', v_enrollment.aluno -> 'orgao_emissor',
      'studentRgState', v_enrollment.aluno -> 'rg_uf_emissao',
      'studentRgIssueDate', v_enrollment.aluno -> 'rg_data_emissao',
      'documentTemplateSnapshot', v_template, 'institutionSnapshot', v_polo,
      'watermarkSnapshot', v_watermark, 'academicDataSnapshot', v_academic)
    WHERE validation.codigo = v_issue.codigo AND validation.documento = 'boletim'
      AND validation.matricula_id = p_matricula_id AND validation.aluno_id = v_aluno_id
      AND validation.periodo_referencia = p_modulo_id::text AND validation.status = 'ATIVO'
    RETURNING validation.dados_emissao INTO v_snapshot;
    v_emission := jsonb_set(v_emission, '{dados_emissao}', v_snapshot);
  END IF;
  RETURN jsonb_build_object('emission', v_emission, 'preview', jsonb_build_object(
    'template', CASE WHEN v_snapshot ? 'documentTemplateSnapshot'
      THEN v_snapshot -> 'documentTemplateSnapshot' ELSE v_template END,
    'polo', CASE WHEN v_snapshot ? 'institutionSnapshot'
      THEN v_snapshot -> 'institutionSnapshot' ELSE v_polo END,
    'watermark', CASE WHEN v_snapshot ? 'watermarkSnapshot'
      THEN v_snapshot -> 'watermarkSnapshot' ELSE v_watermark END,
    'academicData', v_academic, 'certificate', NULL));
END;
$function$;
REVOKE ALL ON FUNCTION public.obter_boletim_aluno_pdf(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obter_boletim_aluno_pdf(uuid, uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.obter_boletim_aluno_pdf(uuid, uuid) IS
  'Boletim canônico imediato do próprio aluno, por módulo iniciado, com snapshots integrais e código estável.';
