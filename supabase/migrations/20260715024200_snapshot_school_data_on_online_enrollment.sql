BEGIN;

-- Fotografia histórica da escolaridade no momento em que a cobrança é criada.
-- O aluno pode atualizar o perfil depois, sem alterar a regra aplicada àquela
-- inscrição específica.
ALTER TABLE public.inscricoes_online
  ADD COLUMN IF NOT EXISTS situacao_ensino_medio text,
  ADD COLUMN IF NOT EXISTS serie_ensino_medio_atual smallint,
  ADD COLUMN IF NOT EXISTS escola_ensino_medio text,
  ADD COLUMN IF NOT EXISTS ano_conclusao_ensino_medio smallint,
  ADD COLUMN IF NOT EXISTS ano_previsto_conclusao_ensino_medio smallint;

ALTER TABLE public.inscricoes_online
  DROP CONSTRAINT IF EXISTS inscricoes_online_situacao_ensino_medio_check,
  DROP CONSTRAINT IF EXISTS inscricoes_online_serie_ensino_medio_check;

ALTER TABLE public.inscricoes_online
  ADD CONSTRAINT inscricoes_online_situacao_ensino_medio_check CHECK (
    situacao_ensino_medio IS NULL
    OR situacao_ensino_medio IN ('CURSANDO', 'CONCLUIDO')
  ),
  ADD CONSTRAINT inscricoes_online_serie_ensino_medio_check CHECK (
    serie_ensino_medio_atual IS NULL
    OR serie_ensino_medio_atual BETWEEN 2 AND 3
  );

COMMIT;
