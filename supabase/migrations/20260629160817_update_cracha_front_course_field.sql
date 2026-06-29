UPDATE public.documentos_templates AS dt
SET conteudo = jsonb_set(
    dt.conteudo,
    '{fields}',
    (
      SELECT jsonb_agg(
        CASE
          WHEN field->>'id' = 'polo' THEN
            field
            || jsonb_build_object('id', 'curso', 'value', 'CURSO: {{ALUNO_CURSO}}')
            || jsonb_build_object(
              'style',
              coalesce(field->'style', '{}'::jsonb) || jsonb_build_object('fontWeight', 'bold')
            )
          ELSE field
        END
        ORDER BY ord
      )
      FROM jsonb_array_elements(dt.conteudo->'fields') WITH ORDINALITY AS t(field, ord)
    ),
    true
  ),
  updated_at = now()
WHERE dt.id = 'cracha'
  AND jsonb_typeof(dt.conteudo->'fields') = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(dt.conteudo->'fields') AS t(field)
    WHERE field->>'id' = 'polo'
  );
