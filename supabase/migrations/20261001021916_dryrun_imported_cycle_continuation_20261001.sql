-- Marcador auditado do ledger MCP; o ensaio terminou em ROLLBACK integral.
-- 010100..010250 + contratos sintéticos + fixture real C1 Banese/C2 local:
-- C1 protegido, C2 ELEGIVEL, INSERT C2 permitido na transação autorizada,
-- first-claim C1 bloqueada, C2 exige autorização própria e duplicidade negada.
-- Turma, aluno, matrícula, cobranças, fatos e autorização sintéticos revertidos.
-- Nenhuma Edge Function ou chamada bancária foi executada.
do $audit$ begin null; end; $audit$;
