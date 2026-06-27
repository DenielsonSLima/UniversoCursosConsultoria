-- Permite que a mesma pessoa tenha perfis separados em parceiros
-- Ex.: Professor + Aluno com o mesmo CPF para comprar cursos como aluno.

ALTER TABLE public.parceiros
DROP CONSTRAINT IF EXISTS parceiros_cpf_cnpj_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_parceiros_cpf_cnpj_tipo_unique
ON public.parceiros ((regexp_replace(coalesce(cpf_cnpj, ''), '\D', '', 'g')), tipo)
WHERE nullif(regexp_replace(coalesce(cpf_cnpj, ''), '\D', '', 'g'), '') IS NOT NULL;
