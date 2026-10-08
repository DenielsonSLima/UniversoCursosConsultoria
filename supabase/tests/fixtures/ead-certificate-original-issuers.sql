-- Definições canônicas do banco antes da correção EAD; fixture sem dados pessoais.
CREATE OR REPLACE FUNCTION public.emitir_documento_validacao_interno(p_documento text, p_matricula_id uuid, p_periodo_referencia text DEFAULT NULL::text, p_referencia_externa text DEFAULT NULL::text, p_validade_ate timestamp with time zone DEFAULT NULL::timestamp with time zone, p_emitido_por uuid DEFAULT NULL::uuid, p_registrar_reemissao boolean DEFAULT false)
 RETURNS TABLE(codigo text, documento text, emitido_em timestamp with time zone, ultima_emissao_em timestamp with time zone, validade_ate timestamp with time zone, status text, quantidade_emissoes integer, reutilizado boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_matricula record;
  v_periodo text;
  v_referencia text;
  v_identidade text;
  v_prefixo text;
  v_validade timestamptz;
  v_codigo text;
  v_existia boolean;
  v_politica public.documentos_validacao_politicas%rowtype;
  v_status_existente text;
  v_operation_at timestamptz;
begin
  if p_documento = 'diario_classe' then
    raise exception
      'O Diário de Classe usa a emissão canônica por turma e disciplina.'
      using errcode = '22023';
  end if;

  if p_registrar_reemissao
    and coalesce(
      current_setting('app.document_reissue_authorized', true),
      ''
    ) <> 'on'
  then
    raise exception
      'Reemissão exige a RPC idempotente com chave explícita.'
      using errcode = '22023';
  end if;

  begin
    v_operation_at := nullif(
      current_setting('app.document_reissue_at', true),
      ''
    )::timestamptz;
  exception
    when invalid_datetime_format then
      raise exception 'Timestamp interno de reemissão inválido.'
        using errcode = '22007';
  end;
  v_operation_at := coalesce(v_operation_at, now());

  select policy.*
  into v_politica
  from public.documentos_validacao_politicas policy
  where policy.documento = p_documento
  for share;

  if not found then
    raise exception 'Tipo de documento não permitido: %', p_documento
      using errcode = '22023';
  end if;

  select
    enrollment.id,
    enrollment.aluno_id,
    enrollment.status as matricula_status,
    enrollment.data_matricula,
    class.polo_id,
    student.nome as aluno_nome,
    student.cpf_cnpj as aluno_cpf,
    student.tipo_documento as aluno_tipo_documento,
    student.rg as aluno_rg,
    student.data_nascimento as aluno_nascimento,
    student.foto_url as aluno_foto_url,
    class.nome as turma_nome,
    class.codigo as turma_codigo,
    course.nome as curso_nome,
    unit.nome as polo_nome
  into v_matricula
  from public.matriculas enrollment
  join public.parceiros student on student.id = enrollment.aluno_id
  left join public.turmas class on class.id = enrollment.turma_id
  left join public.cursos course on course.id = class.curso_id
  left join public.polos unit on unit.id = class.polo_id
  where enrollment.id = p_matricula_id;

  if not found then
    raise exception 'Matrícula não encontrada.'
      using errcode = '22023';
  end if;

  v_periodo := nullif(btrim(p_periodo_referencia), '');
  v_referencia := nullif(btrim(p_referencia_externa), '');

  if v_politica.escopo_identidade = 'ANUAL'
    and p_documento = 'declaracao_irpf'
    and v_periodo is null
  then
    v_periodo := (extract(year from current_date)::integer - 1)::text;
  elsif v_politica.escopo_identidade = 'ANUAL' and v_periodo is null then
    v_periodo := extract(year from current_date)::integer::text;
  end if;

  if v_politica.escopo_identidade = 'PROCESSO' and v_referencia is null then
    raise exception 'Este documento exige uma referência de processo ou contrato.'
      using errcode = '22023';
  end if;

  v_identidade := concat_ws(
    ':',
    p_documento,
    p_matricula_id::text,
    coalesce(v_periodo, '-'),
    coalesce(v_referencia, '-')
  );

  if not p_registrar_reemissao then
    select
      validation.codigo,
      validation.documento,
      validation.emitido_em,
      validation.ultima_emissao_em,
      validation.validade_ate,
      validation.status,
      validation.quantidade_emissoes
    into
      codigo,
      documento,
      emitido_em,
      ultima_emissao_em,
      validade_ate,
      status,
      quantidade_emissoes
    from public.documentos_validacao validation
    where validation.identidade = v_identidade;

    if found then
      if status = 'REVOGADO' then
        raise exception
          'Documento revogado não pode ser reutilizado ou reemitido.'
          using errcode = '55000';
      end if;

      if validade_ate is not null and validade_ate < now() then
        raise exception
          'Documento expirado exige uma reemissão administrativa explícita.'
          using errcode = '55000';
      end if;

      reutilizado := true;
      return next;
      return;
    end if;
  else
    select validation.status
    into v_status_existente
    from public.documentos_validacao validation
    where validation.identidade = v_identidade
    for update;

    if found and v_status_existente = 'REVOGADO' then
      raise exception
        'Documento revogado não pode ser reutilizado ou reemitido.'
        using errcode = '55000';
    end if;
  end if;

  v_prefixo := v_politica.prefixo;
  -- Validade informada pelo navegador continua ignorada. Na reemissão comum,
  -- o prazo é renovado pela política vigente. O trigger da carteirinha
  -- substitui esta data pelo término acadêmico da turma.
  v_validade := case
    when v_politica.validade_dias is null then null
    else v_operation_at + make_interval(days => v_politica.validade_dias)
  end;

  select exists (
    select 1
    from public.documentos_validacao validation
    where validation.identidade = v_identidade
  ) into v_existia;

  loop
    v_codigo := v_prefixo
      || '-' || upper(substring(encode(extensions.gen_random_bytes(9), 'hex') from 1 for 4))
      || '-' || upper(substring(encode(extensions.gen_random_bytes(9), 'hex') from 1 for 4))
      || '-' || upper(substring(encode(extensions.gen_random_bytes(9), 'hex') from 1 for 4));

    begin
      codigo := null;

      insert into public.documentos_validacao (
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
        validacao_publica,
        dados_emissao
      )
      values (
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
        v_politica.validacao_publica,
        jsonb_build_object(
          'studentName', v_matricula.aluno_nome,
          'studentCpf', v_matricula.aluno_cpf,
          'studentBirthDate', v_matricula.aluno_nascimento,
          'studentPhotoUrl', v_matricula.aluno_foto_url,
          'courseName', v_matricula.curso_nome,
          'className', coalesce(v_matricula.turma_nome, v_matricula.turma_codigo),
          'unitName', v_matricula.polo_nome,
          'enrollmentStatus', upper(coalesce(v_matricula.matricula_status, '')),
          'enrollmentDate', v_matricula.data_matricula,
          'institutionName', 'Universo Cursos e Consultoria',
          'validationPublic', v_politica.validacao_publica,
          'validityDays', v_politica.validade_dias
        ) || case when p_documento = 'carteirinha' then
          internal_academic.student_card_identity_snapshot(
            v_matricula.aluno_tipo_documento, v_matricula.aluno_rg, v_matricula.aluno_cpf
          )
          else '{}'::jsonb
        end
      )
      on conflict (identidade) do update
      set
        ultima_emissao_em = case
          when p_registrar_reemissao then v_operation_at
          else documentos_validacao.ultima_emissao_em
        end,
        validade_ate = case
          when p_registrar_reemissao then excluded.validade_ate
          else documentos_validacao.validade_ate
        end,
        validacao_publica = case
          when p_registrar_reemissao then excluded.validacao_publica
          else documentos_validacao.validacao_publica
        end,
        emitido_por = coalesce(
          excluded.emitido_por,
          documentos_validacao.emitido_por
        ),
        quantidade_emissoes = documentos_validacao.quantidade_emissoes
          + case when p_registrar_reemissao then 1 else 0 end,
        dados_emissao = case
          when p_registrar_reemissao then
            documentos_validacao.dados_emissao
            || jsonb_build_object(
              'validationPublic', v_politica.validacao_publica,
              'validityDays', v_politica.validade_dias
            )
          else
            (case when p_documento = 'carteirinha' then
              documentos_validacao.dados_emissao
            else documentos_validacao.dados_emissao
              || jsonb_strip_nulls(excluded.dados_emissao)
            end)
            || jsonb_build_object(
              'validationPublic', documentos_validacao.validacao_publica,
              'validityDays', case
                when documentos_validacao.validade_ate is null then null
                else greatest(
                  1,
                  ceil(extract(epoch from (
                    documentos_validacao.validade_ate
                    - documentos_validacao.emitido_em
                  )) / 86400)::integer
                )
              end
            )
        end,
        updated_at = now()
      where not p_registrar_reemissao
        or documentos_validacao.status <> 'REVOGADO'
      returning
        documentos_validacao.codigo,
        documentos_validacao.documento,
        documentos_validacao.emitido_em,
        documentos_validacao.ultima_emissao_em,
        documentos_validacao.validade_ate,
        documentos_validacao.status,
        documentos_validacao.quantidade_emissoes
      into
        codigo,
        documento,
        emitido_em,
        ultima_emissao_em,
        validade_ate,
        status,
        quantidade_emissoes;

      if codigo is null then
        raise exception
          'Documento revogado não pode ser reutilizado ou reemitido.'
          using errcode = '55000';
      end if;

      reutilizado := v_existia or codigo <> v_codigo;
      return next;
      return;
    exception
      when unique_violation then
        if exists (
          select 1
          from public.documentos_validacao validation
          where validation.identidade = v_identidade
        ) then
          continue;
        end if;
    end;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION internal_academic.p1_finalizar_certificado_academico_20260719(p_certificado_id uuid, p_certificado_numero text DEFAULT NULL::text, p_pagina_livro text DEFAULT NULL::text, p_livro_registro text DEFAULT NULL::text, p_validacao_sistec text DEFAULT NULL::text, p_ensino_medio_estabelecimento text DEFAULT NULL::text, p_ensino_medio_localidade_uf text DEFAULT NULL::text, p_ensino_medio_ano_conclusao text DEFAULT NULL::text, p_emitido_por uuid DEFAULT NULL::uuid)
 RETURNS certificados_academicos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  IF NOT FOUND THEN RAISE EXCEPTION 'Certificado não encontrado.'; END IF;

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
  FROM public.emitir_documento_validacao_interno(
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
$function$;
