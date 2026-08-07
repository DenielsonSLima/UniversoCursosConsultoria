-- O Administrador Master usa permissões personalizadas, sem perfil de acesso.
-- Inclui explicitamente a central de automações sem ampliar outros usuários.

update public.usuarios_sistema
set permissoes = jsonb_set(
  coalesce(permissoes, '{}'::jsonb),
  '{tabs,comunicacao}',
  (
    select jsonb_agg(tab order by tab)
    from (
      select distinct value as tab
      from jsonb_array_elements_text(
        coalesce(permissoes #> '{tabs,comunicacao}', '[]'::jsonb)
        || jsonb_build_array('comunicacao-automacoes')
      )
    ) allowed_tabs
  ),
  true
)
where auth_user_id = 'd897ffc3-6bb6-4299-b406-e4ebb015314e'
  and public.is_active_status(status)
  and coalesce(permissoes ->> 'allPolos', 'false') = 'true'
  and not coalesce(permissoes #> '{tabs,comunicacao}', '[]'::jsonb)
    @> jsonb_build_array('comunicacao-automacoes');
