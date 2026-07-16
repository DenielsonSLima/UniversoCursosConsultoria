ALTER TABLE public.mensageria_config
  ALTER COLUMN wa_payment_receipt_template SET DEFAULT 'Olá, {{nome_aluno}}!

Confirmamos o recebimento do pagamento no valor de *{{valor_fatura}}*, correspondente a *{{descricao_fatura}}*.

Agradecemos por manter tudo em dia com a Universo Cursos.

Equipe Universo Cursos e Consultoria.';

UPDATE public.mensageria_config
SET wa_payment_receipt_template = 'Olá, {{nome_aluno}}!

Confirmamos o recebimento do pagamento no valor de *{{valor_fatura}}*, correspondente a *{{descricao_fatura}}*.

Agradecemos por manter tudo em dia com a Universo Cursos.

Equipe Universo Cursos e Consultoria.'
WHERE tipo = 'whatsapp';
