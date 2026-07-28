-- Ledger remoto: 20260728074216
-- Índices de suporte às FKs do registro canônico do Diário.
--
-- A chave única (turma_id, disciplina_id) já cobre turma_id. Estes índices
-- isolados evitam varreduras ao validar exclusões/referências por disciplina
-- ou polo e removem os avisos do advisor de performance do PostgreSQL.

create index if not exists diarios_validacao_disciplina_idx
  on public.diarios_validacao (disciplina_id);

create index if not exists diarios_validacao_polo_idx
  on public.diarios_validacao (polo_id);
