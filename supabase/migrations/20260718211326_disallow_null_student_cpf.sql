-- CHECK aceita resultado NULL; exige true explicitamente para impedir aluno sem CPF.
ALTER TABLE public.parceiros
  DROP CONSTRAINT IF EXISTS parceiros_aluno_cpf_required;

ALTER TABLE public.parceiros
  ADD CONSTRAINT parceiros_aluno_cpf_required
  CHECK (
    upper(coalesce(tipo, '')) <> 'ALUNO'
    OR coalesce(public.is_valid_cpf(cpf_cnpj), false)
  ) NOT VALID;

ALTER TABLE public.parceiros
  VALIDATE CONSTRAINT parceiros_aluno_cpf_required;
