BEGIN;

-- Preserve the deployed public visibility profiles and all unrelated document branches.
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
    IF v_resultado->>'type'='certificado_ead' AND EXISTS (
      SELECT 1 FROM public.documentos_validacao document
      WHERE upper(btrim(document.codigo))=v_codigo
        AND internal_academic.ead_trust_document_is_revoked(document.id)
    ) THEN
      v_resultado:=v_resultado||jsonb_build_object('status','REVOKED');
    END IF;
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
$function$
;

-- Preserve the configured institutional model; deny new delivery after trust closes.
CREATE OR REPLACE FUNCTION internal_academic.get_aluno_ead_certificate_model(p_certificado_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_aluno_id uuid;
  v_configured_id text;
  v_templates jsonb;
  v_model jsonb;
begin
  if auth.uid() is null then
    raise exception 'Acesso ao modelo do certificado não autorizado.' using errcode = '42501';
  end if;
  v_aluno_id := public.current_aluno_id();
  if v_aluno_id is null then
    raise exception 'Acesso ao modelo do certificado não autorizado.' using errcode = '42501';
  end if;

  select nullif(btrim(course.ead_config #>> '{certificacao,modeloDocumento}'), '')
    into v_configured_id
  from public.certificados_academicos certificate
  join public.cursos course on course.id = certificate.curso_id
  where certificate.id = p_certificado_id
    and certificate.aluno_id = v_aluno_id
    and certificate.modalidade = 'EAD'
    and certificate.status = 'FINALIZADO'
    and nullif(btrim(certificate.codigo_validacao), '') is not null
    and internal_academic.ead_certificate_is_deliverable(certificate.id);

  if not found then
    -- Do not reveal whether an inaccessible certificate exists.
    raise exception 'Acesso ao modelo do certificado não autorizado.' using errcode = '42501';
  end if;

  select template.conteudo into v_templates
  from public.documentos_templates template
  where template.id = 'diplomas';

  if jsonb_typeof(v_templates) is distinct from 'array' then
    raise exception 'O modelo de certificado EAD não está disponível.' using errcode = 'P0002';
  end if;

  select item.model into v_model
  from jsonb_array_elements(v_templates) with ordinality item(model, position)
  where jsonb_typeof(item.model) = 'object'
    and (v_configured_id is null or item.model ->> 'id' = v_configured_id)
    and (
      upper(coalesce(item.model ->> 'modalidade', '')) = 'EAD'
      or coalesce(item.model ->> 'tipoCurso', '') ~* '(^|[^a-z])ead([^a-z]|$)'
    )
  order by item.position
  limit 1;

  if v_model is null then
    raise exception 'O modelo de certificado EAD não está disponível.' using errcode = 'P0002';
  end if;
  return v_model;
end;
$function$
;

COMMIT;
