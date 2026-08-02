revoke all on function public.bloquear_edicao_diario_disciplina()
from public, anon, authenticated;

revoke all on function public.proteger_estado_fechamento_diario()
from public, anon, authenticated;

notify pgrst, 'reload schema';
