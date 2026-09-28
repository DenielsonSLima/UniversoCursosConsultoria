-- Restaura o contrato público versionado, sobrescrito pela inclusão do diário.
-- Campos históricos continuam limitados ao snapshot da emissão e ao perfil atual.
CREATE OR REPLACE FUNCTION public.validar_documento_por_codigo(p_codigo text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
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
      validation.politica_versao_emissao,
      validation.campos_publicos_emissao,
      validation.dados_publicos_snapshot,
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

REVOKE ALL ON FUNCTION public.validar_documento_por_codigo(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validar_documento_por_codigo(text)
  TO anon, authenticated;

COMMENT ON FUNCTION public.validar_documento_por_codigo(text) IS
  'Consulta pública com snapshot e interseção dos campos permitidos na emissão e no perfil vigente; preserva validação do diário assinado.';
