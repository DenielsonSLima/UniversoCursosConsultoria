-- O acervo legado possui UUIDs Postgres canônicos criados antes da adoção
-- dos bits RFC de versão/variante. O snapshot é produzido exclusivamente de
-- colunas uuid canônicas, mas o validador v1 rejeitava curso, polo e empresa
-- apenas pelo formato desses bits. A cópia normalizada existe somente durante
-- a validação; o snapshot e seus hashes persistidos permanecem byte-idênticos.

BEGIN;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_normalizar_source_uuids_legados(
  p_snapshot jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
STRICT
SET search_path = ''
AS $function$
DECLARE
  v_result jsonb := p_snapshot;
  v_field text;
  v_value text;
  v_normalized text;
BEGIN
  IF jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_snapshot -> 'source') IS DISTINCT FROM 'object'
  THEN
    RETURN p_snapshot;
  END IF;

  FOREACH v_field IN ARRAY ARRAY['courseId', 'poloId', 'companyId']::text[]
  LOOP
    v_value := lower(p_snapshot #>> ARRAY['source', v_field]);
    IF v_value ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       AND v_value !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN
      v_normalized := overlay(v_value PLACING '4' FROM 15 FOR 1);
      v_normalized := overlay(v_normalized PLACING '8' FROM 20 FOR 1);
      v_result := jsonb_set(
        v_result,
        ARRAY['source', v_field],
        to_jsonb(v_normalized),
        false
      );
    END IF;
  END LOOP;

  RETURN v_result;
EXCEPTION WHEN others THEN
  RETURN p_snapshot;
END;
$function$;

REVOKE ALL ON FUNCTION
  public.assinatura_eletronica_normalizar_source_uuids_legados(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION
  public.assinatura_eletronica_normalizar_source_uuids_legados(jsonb)
IS
  'Normaliza somente na cópia de validação os bits RFC de courseId, poloId e companyId legados; não altera o snapshot persistido.';

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_snapshot_academico_diario_valido(
  p_snapshot jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
STRICT
SET search_path = ''
AS $function$
DECLARE
  v_identity jsonb;
  v_watermark jsonb;
  v_normalized jsonb :=
    public.assinatura_eletronica_normalizar_source_uuids_legados(p_snapshot);
BEGIN
  v_identity := v_normalized -> 'institutionalIdentity';
  IF jsonb_typeof(v_identity) IS DISTINCT FROM 'object' THEN
    RETURN false;
  END IF;

  v_watermark := v_identity -> 'watermark';
  IF v_watermark IS NULL THEN
    RETURN public.assinatura_eletronica_snapshot_academico_diario_valido_v2_inline_watermark(
      v_normalized
    );
  END IF;

  IF NOT public.assinatura_eletronica_marca_landscape_apresentacao_valida(
       v_watermark
     )
     OR v_watermark ->> 'url' IS DISTINCT FROM
       v_normalized #>> '{institutionalIdentity,watermarkUrl}'
     OR v_watermark ->> 'url' IS DISTINCT FROM
       v_normalized #>> '{assetSources,watermarkUrl}'
  THEN
    RETURN false;
  END IF;

  v_normalized := jsonb_set(
    v_normalized,
    ARRAY['institutionalIdentity'],
    v_identity - 'watermark',
    false
  );
  RETURN public.assinatura_eletronica_snapshot_academico_diario_valido_v2_inline_watermark(
    v_normalized
  );
EXCEPTION WHEN others THEN
  RETURN false;
END;
$function$;

COMMENT ON FUNCTION
  public.assinatura_eletronica_snapshot_academico_diario_valido(jsonb)
IS
  'Valida o snapshot acadêmico preservando IDs legados canônicos de curso, polo e empresa somente na cópia interna de validação.';

-- O CHECK anterior estava preso por OID ao helper v2 interno e, por isso,
-- ignorava tanto a compatibilidade legada quanto o watermark acrescentado
-- pelo BEFORE trigger. O contrato integral é preservado e passa a delegar à
-- função canônica, que continua fechando todas as demais validações.
ALTER TABLE public.assinatura_eletronica_envelopes
  DROP CONSTRAINT assinatura_eletronica_envelopes_snapshot_diario_check;

ALTER TABLE public.assinatura_eletronica_envelopes
  ADD CONSTRAINT assinatura_eletronica_envelopes_snapshot_diario_check
  CHECK (
    public.assinatura_eletronica_snapshot_academico_diario_valido(
      documento_snapshot
    )
    AND academico_snapshot_sha256 =
      public.assinatura_eletronica_sha256_json(documento_snapshot)
    AND documento_snapshot #>> '{source,turmaId}' = turma_id::text
    AND documento_snapshot #>> '{source,disciplinaId}' = disciplina_id::text
    AND documento_snapshot #> '{template,imprimirValidacaoContracapa}' =
      'true'::jsonb
    AND public.assinatura_eletronica_geometria_snapshot_valida(
      geometria_snapshot
    )
  ) NOT VALID;

ALTER TABLE public.assinatura_eletronica_envelopes
  VALIDATE CONSTRAINT assinatura_eletronica_envelopes_snapshot_diario_check;

COMMIT;
