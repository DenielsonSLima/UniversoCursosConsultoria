-- Registro de auditoria do dry-run executado pelo MCP Supabase em 2026-10-01.
-- A ferramenta preservou esta entrada no ledger após o ROLLBACK explícito.
-- Foram exercitados, em transação revertida:
--   20261001023000_receivable_source_capabilities.sql
--   supabase/tests/receivable_source_capabilities.rollback.sql
-- Asserções concluídas; nenhum recebimento, boleto ou mudança de schema persistiu.
-- A definição real permanece na migration 20261001023000, aplicada separadamente.
-- Este arquivo é intencionalmente sem efeito para reconstruir o ledger auditado.
do $$ begin null; end $$;
