BEGIN;

-- Idêntico a idx_matriculas_aluno_turma_status; manter ambos apenas aumenta
-- custo de escrita, vacuum e armazenamento sem mudar o plano de consulta.
DROP INDEX IF EXISTS public.idx_whatsapp_irpf_matriculas_aluno_turma;

COMMIT;
