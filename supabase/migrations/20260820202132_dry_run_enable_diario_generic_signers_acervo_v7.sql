-- ---------------------------------------------------------------------------
-- Marcador do dry-run remoto da assinatura eletrônica de Diário v7.
--
-- O provedor registrou esta versão no ledger mesmo com a transação de ensaio
-- encerrada por ROLLBACK. A alteração efetiva está na migration seguinte
-- 20260820202142_enable_diario_generic_signers_acervo_v7.sql. Este arquivo é
-- intencionalmente sem efeito para manter a cadeia reconstruível sem executar
-- rollback ou reaplicar o patch v7 em um banco novo.
-- ---------------------------------------------------------------------------

BEGIN;
COMMIT;
