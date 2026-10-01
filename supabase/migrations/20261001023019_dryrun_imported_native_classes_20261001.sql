-- Registro auditável da validação transacional via MCP em 2026-10-01.
-- Fatos importados, fluxo C1 Banese -> C2 e toda T42 passaram em ROLLBACK.
-- A T46 manteve exatamente o fingerprint pré-DDL: 6 matrículas, 4 C1 e 2 C2.
-- Nenhuma cobrança, emissão, fato ou alteração de schema persistiu.
-- A ferramenta registrou apenas esta entrada no ledger de migrations.
do $$ begin null; end $$;
