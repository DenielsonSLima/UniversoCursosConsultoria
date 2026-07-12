-- Normalize WhatsApp financial automation templates to the student-facing placeholder.

UPDATE public.mensageria_config
SET wa_default_overdue_template = REPLACE(
  wa_default_overdue_template,
  '{{nome_parceiro}}',
  '{{nome_aluno}}'
)
WHERE tipo = 'whatsapp'
  AND wa_default_overdue_template LIKE '%{{nome_parceiro}}%';
