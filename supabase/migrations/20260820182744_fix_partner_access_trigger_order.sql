-- O bloqueio de campos sensíveis precisa observar exatamente o payload do
-- navegador, antes de a identidade automática do aluno preencher os campos
-- internos de acesso. Triggers BEFORE executam em ordem alfabética.

BEGIN;

DROP TRIGGER IF EXISTS trg_00_protect_student_access_insert ON public.parceiros;
DROP TRIGGER IF EXISTS a00_protect_student_access_insert ON public.parceiros;

CREATE TRIGGER a00_protect_student_access_insert
BEFORE INSERT ON public.parceiros
FOR EACH ROW
EXECUTE FUNCTION public.protect_student_access_control_fields();

COMMIT;
