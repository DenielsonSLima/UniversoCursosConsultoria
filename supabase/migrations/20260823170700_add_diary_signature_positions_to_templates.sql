-- Torna as linhas de assinatura do Diário parte do modelo configurável.
-- A migration é aditiva e preserva posições já salvas pelo usuário.

WITH signature_fields AS (
  SELECT jsonb_build_array(
    jsonb_build_object(
      'id', 'contracapaAssinaturaProfessor',
      'label', 'ASSINATURA DO PROFESSOR',
      'valuePlaceholder', '',
      'x', 10,
      'y', 84,
      'width', 38,
      'fontSize', 6.5,
      'visible', true,
      'color', '#64748b',
      'bold', true,
      'borderTop', true,
      'align', 'center'
    ),
    jsonb_build_object(
      'id', 'contracapaAssinaturaCoordenador',
      'label', 'ASSINATURA DO COORDENADOR DO CURSO',
      'valuePlaceholder', '',
      'x', 52,
      'y', 84,
      'width', 38,
      'fontSize', 6.5,
      'visible', true,
      'color', '#64748b',
      'bold', true,
      'borderTop', true,
      'align', 'center'
    )
  ) AS fields
), missing_fields AS (
  SELECT
    template.id,
    COALESCE(template.conteudo -> 'contracapaCampos', '[]'::jsonb) AS current_fields,
    COALESCE(
      (
        SELECT jsonb_agg(field)
        FROM signature_fields,
        LATERAL jsonb_array_elements(signature_fields.fields) AS field
        WHERE NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            COALESCE(template.conteudo -> 'contracapaCampos', '[]'::jsonb)
          ) AS current_field
          WHERE current_field ->> 'id' = field ->> 'id'
        )
      ),
      '[]'::jsonb
    ) AS additions
  FROM public.documentos_templates AS template
  WHERE template.id IN ('diario_TECNICO', 'diario_LIVRE', 'diario_ESPECIALIZACAO')
), next_templates AS (
  SELECT
    template.id,
    jsonb_set(
      jsonb_set(
        COALESCE(template.conteudo, '{}'::jsonb),
        '{contracapaCampos}',
        missing.current_fields || missing.additions,
        true
      ),
      '{versao}',
      to_jsonb(COALESCE((template.conteudo ->> 'versao')::integer, 1) + 1),
      true
    ) AS conteudo
  FROM public.documentos_templates AS template
  JOIN missing_fields AS missing ON missing.id = template.id
  WHERE jsonb_array_length(missing.additions) > 0
)
UPDATE public.documentos_templates AS template
SET
  conteudo = next_templates.conteudo,
  updated_at = pg_catalog.now()
FROM next_templates
WHERE template.id = next_templates.id;
