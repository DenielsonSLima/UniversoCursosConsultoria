ALTER TABLE public.mensageria_config
  ALTER COLUMN wa_multiple_overdue_template SET DEFAULT 'Olá, {{nome_aluno}}!

Identificamos parcelas pendentes em seu cadastro.

*Quantidade:* {{quantidade_parcelas}}
*Valor total:* {{valor_total_atrasado}}
*Curso:* {{nome_curso}}
*Turma:* {{nome_turma}}
*CPF final:* {{cpf_final}}

Para regularizar sua situação, responda a esta mensagem. Nossa equipe verificará as opções disponíveis.

Caso o pagamento já tenha sido realizado, desconsidere este aviso.

Equipe Universo Cursos e Consultoria.';

UPDATE public.mensageria_config
SET wa_multiple_overdue_template = 'Olá, {{nome_aluno}}!

Identificamos parcelas pendentes em seu cadastro.

*Quantidade:* {{quantidade_parcelas}}
*Valor total:* {{valor_total_atrasado}}
*Curso:* {{nome_curso}}
*Turma:* {{nome_turma}}
*CPF final:* {{cpf_final}}

Para regularizar sua situação, responda a esta mensagem. Nossa equipe verificará as opções disponíveis.

Caso o pagamento já tenha sido realizado, desconsidere este aviso.

Equipe Universo Cursos e Consultoria.'
WHERE tipo = 'whatsapp';
