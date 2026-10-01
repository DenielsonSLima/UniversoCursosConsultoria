-- Registro auditável do dry-run via MCP em 2026-10-01, integralmente revertido.
-- Validou trancamento real, claim/start/complete simulado, reativação e terminal;
-- capacidades por origem, proteção Proesc e RPCs reais page_v4/groups_v3.
-- Não chamou HTTP/worker nem cancelou/gerou títulos reais. Schema restaurado
-- e zero títulos sintéticos confirmados após ROLLBACK. Apenas ledger persistiu.
do $$ begin null; end $$;
