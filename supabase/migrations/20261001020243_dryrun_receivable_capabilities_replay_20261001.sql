-- Exceção auditada: entrada criada pelo MCP apesar do ROLLBACK integral.
-- Ensaio 2026-10-01: 023000 + definição canônica de 023050 (ramo de
-- reconstrução exercitado) + receivable_source_capabilities.rollback.sql.
-- Todas as asserções passaram; funções, trigger e tentativas foram revertidos.
-- Nenhuma baixa, emissão, cancelamento bancário ou alteração financeira persistiu.
-- Este marcador preserva o ledger remoto sem reaplicar o ensaio transitório.
do $audit$ begin null; end; $audit$;
