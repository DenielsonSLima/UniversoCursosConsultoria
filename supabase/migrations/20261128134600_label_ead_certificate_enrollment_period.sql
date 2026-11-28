BEGIN;

DO $migration$
DECLARE
  saved_templates jsonb;
  updated_templates jsonb;
  previous_period constant text := 'Período de realização · {{periodo}}.';
  scheduled_period constant text := 'Período previsto do curso · {{periodo_previsto_ead}}.';
BEGIN
  SELECT conteudo INTO saved_templates
  FROM public.documentos_templates
  WHERE id = 'diplomas'
  FOR UPDATE;
  IF jsonb_typeof(saved_templates) IS DISTINCT FROM 'array' THEN RETURN; END IF;

  SELECT jsonb_agg(
    CASE WHEN model ->> 'id' = 'certificado_ead'
      THEN model
        || CASE WHEN strpos(model ->> 'textoFrente', previous_period) > 0
          THEN jsonb_build_object('textoFrente', replace(model ->> 'textoFrente', previous_period, scheduled_period))
          ELSE '{}'::jsonb END
        || CASE WHEN jsonb_typeof(model -> 'blocks') = 'array' THEN jsonb_build_object('blocks', (
          SELECT coalesce(jsonb_agg(
            CASE WHEN block ->> 'id' = 'texto' AND block ->> 'type' = 'text'
              AND strpos(block ->> 'content', previous_period) > 0
              THEN jsonb_set(block, '{content}', to_jsonb(replace(block ->> 'content', previous_period, scheduled_period)))
              ELSE block END ORDER BY block_position
          ), '[]'::jsonb)
          FROM jsonb_array_elements(model -> 'blocks') WITH ORDINALITY AS blocks(block, block_position)
        )) ELSE '{}'::jsonb END
      ELSE model END ORDER BY model_position
  ) INTO updated_templates
  FROM jsonb_array_elements(saved_templates) WITH ORDINALITY AS models(model, model_position);

  IF updated_templates IS NOT NULL AND updated_templates IS DISTINCT FROM saved_templates THEN
    UPDATE public.documentos_templates SET conteudo = updated_templates WHERE id = 'diplomas';
  END IF;
END $migration$;

COMMIT;
