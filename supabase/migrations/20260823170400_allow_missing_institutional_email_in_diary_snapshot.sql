-- O compositor canônico permite que empresa e polo não tenham e-mail e grava
-- uma string vazia no snapshot. O validador legado, porém, exigia conteúdo
-- nesse único campo opcional. A normalização ocorre somente na cópia interna
-- de validação; nenhum e-mail fictício é persistido ou exibido no documento.

BEGIN;

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
  IF jsonb_typeof(
       v_normalized #> '{institutionalIdentity,institution,email}'
     ) = 'string'
     AND v_normalized #>> '{institutionalIdentity,institution,email}' = ''
  THEN
    v_normalized := jsonb_set(
      v_normalized,
      ARRAY['institutionalIdentity', 'institution', 'email'],
      to_jsonb('nao-informado'::text),
      false
    );
  END IF;

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
  'Valida o snapshot em cópia compatível com UUIDs legados e e-mail institucional opcional; não altera o documento persistido.';

COMMIT;
