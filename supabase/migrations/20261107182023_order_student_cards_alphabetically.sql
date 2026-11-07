-- Ordena somente a apresentação; preserva payload, elegibilidade e matrícula
-- primária (a ordem original desempata nomes iguais e matrículas do aluno).
create or replace function public.get_secretaria_carteirinha_workspace_secure(
  p_polo_id uuid
)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $function$
declare
  v_workspace jsonb;
  v_enrollments jsonb;
begin
  if not public.can_manage_secretaria_document('carteirinha', p_polo_id) then
    raise exception 'Acesso às carteirinhas não autorizado.' using errcode = '42501';
  end if;

  v_workspace := internal_academic.p1_get_secretaria_carteirinha_workspace_20260719(p_polo_id);
  select coalesce(jsonb_agg(e.value order by
    lower(extensions.unaccent(btrim(e.value->>'aluno_nome'))) collate "C",
    e.ordinality
  ), '[]'::jsonb)
  into v_enrollments
  from jsonb_array_elements(v_workspace->'enrollments') with ordinality e(value, ordinality);

  return jsonb_set(v_workspace, '{enrollments}', v_enrollments);
end;
$function$;

revoke all on function public.get_secretaria_carteirinha_workspace_secure(uuid) from public, anon;
grant execute on function public.get_secretaria_carteirinha_workspace_secure(uuid) to authenticated, service_role;
