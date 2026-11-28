BEGIN;

-- Add the academic period to the existing editable text slot. Coordinates,
-- custom wording, styling, signatures and images stay in the saved model.
DO $migration$
DECLARE
  saved_templates jsonb;
  updated_templates jsonb;
  period_line constant text := '<br />Período de realização · {{periodo}}.';
BEGIN
  SELECT conteudo INTO saved_templates
  FROM public.documentos_templates
  WHERE id = 'diplomas'
  FOR UPDATE;
  IF jsonb_typeof(saved_templates) IS DISTINCT FROM 'array' THEN RETURN; END IF;

  SELECT jsonb_agg(
    CASE WHEN model ->> 'id' = 'certificado_ead'
      THEN model
        || CASE WHEN nullif(btrim(model ->> 'textoFrente'), '') IS NOT NULL
          AND position('{{periodo}}' in model ->> 'textoFrente') = 0
          AND (position('{{data_inicio}}' in model ->> 'textoFrente') = 0
            OR position('{{data_fim}}' in model ->> 'textoFrente') = 0)
          THEN jsonb_build_object('textoFrente', (model ->> 'textoFrente') || period_line)
          ELSE '{}'::jsonb END
        || CASE WHEN jsonb_typeof(model -> 'blocks') = 'array' THEN jsonb_build_object('blocks', (
          SELECT coalesce(jsonb_agg(
            CASE
              WHEN block ->> 'id' = 'texto' AND block ->> 'type' = 'text'
                AND block ->> 'visible' IS DISTINCT FROM 'false'
                AND nullif(btrim(block ->> 'content'), '') IS NOT NULL
                AND position('{{periodo}}' in block ->> 'content') = 0
                AND (position('{{data_inicio}}' in block ->> 'content') = 0
                  OR position('{{data_fim}}' in block ->> 'content') = 0)
                THEN block || jsonb_build_object('content', (block ->> 'content') || period_line)
              WHEN block ->> 'id' = 'cidadeData'
                AND block ->> 'content' = '{{cidade_uf}}, {{data_conclusao}}'
                THEN block || jsonb_build_object('content', '{{cidade_uf}}, {{data_emissao}}',
                  'eadLegacyDateContent', block -> 'content')
              WHEN block ->> 'id' = 'versoDataTexto'
                AND block ->> 'content' = '{{cidade_uf}}, {{data_conclusao_extenso}}.'
                THEN block || jsonb_build_object('content', '{{cidade_uf}}, {{data_emissao_extenso}}.',
                  'eadLegacyDateContent', block -> 'content')
              ELSE block
            END ORDER BY block_position
          ), '[]'::jsonb)
          FROM jsonb_array_elements(model -> 'blocks') WITH ORDINALITY AS blocks(block, block_position)
        )) ELSE '{}'::jsonb END
      ELSE model
    END ORDER BY model_position
  ) INTO updated_templates
  FROM jsonb_array_elements(saved_templates) WITH ORDINALITY AS models(model, model_position);

  IF updated_templates IS NOT NULL AND updated_templates IS DISTINCT FROM saved_templates THEN
    UPDATE public.documentos_templates SET conteudo = updated_templates WHERE id = 'diplomas';
  END IF;
END $migration$;

COMMIT;
