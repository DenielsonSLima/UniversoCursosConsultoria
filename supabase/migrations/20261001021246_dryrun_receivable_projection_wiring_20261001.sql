-- Entrada auditada criada pelo MCP apesar do ROLLBACK integral do ensaio.
-- As duas RPCs foram reconstruídas no formato anterior à projeção canônica;
-- 023075 restaurou ambas e confirmou hashes idênticos aos de produção.
-- Nenhum schema, dado, recebimento, emissão ou cancelamento persistiu.
-- Marcador sem efeito: não reaplica o DDL transitório do teste.
do $audit$ begin null; end; $audit$;
