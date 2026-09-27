BEGIN;

-- Perfis que já possuíam todas as abas financeiras anteriores ao lançamento
-- mantêm o acesso completo. Perfis parciais continuam sem Convênios.
UPDATE public.perfis_acesso perfil
SET permissoes = jsonb_set(
  coalesce(perfil.permissoes, '{}'::jsonb),
  '{financeiroTabs}',
  coalesce(perfil.permissoes -> 'financeiroTabs', '[]'::jsonb)
    || jsonb_build_array('convenios'),
  true
)
WHERE coalesce(perfil.permissoes -> 'modules', '[]'::jsonb) ? 'financeiro'
  AND NOT coalesce(perfil.permissoes -> 'financeiroTabs', '[]'::jsonb) ? 'convenios'
  AND (
    jsonb_typeof(perfil.permissoes -> 'tabs' -> 'financeiro') <> 'array'
    OR jsonb_array_length(
      coalesce(perfil.permissoes -> 'tabs' -> 'financeiro', '[]'::jsonb)
    ) = 0
  )
  AND coalesce(perfil.permissoes -> 'financeiroTabs', '[]'::jsonb) ?& array[
    'resumo', 'receber', 'despesas', 'emprestimos', 'transferencias',
    'conciliacao-bancaria', 'outros-debitos', 'outros-creditos'
  ];

UPDATE public.perfis_acesso perfil
SET permissoes = jsonb_set(
  coalesce(perfil.permissoes, '{}'::jsonb),
  '{tabs,financeiro}',
  (perfil.permissoes -> 'tabs' -> 'financeiro')
    || jsonb_build_array('convenios'),
  true
)
WHERE coalesce(perfil.permissoes -> 'modules', '[]'::jsonb) ? 'financeiro'
  AND jsonb_typeof(perfil.permissoes -> 'tabs' -> 'financeiro') = 'array'
  AND jsonb_array_length(perfil.permissoes -> 'tabs' -> 'financeiro') > 0
  AND NOT (perfil.permissoes -> 'tabs' -> 'financeiro') ? 'convenios'
  AND (perfil.permissoes -> 'tabs' -> 'financeiro') ?& array[
    'resumo', 'receber', 'despesas', 'emprestimos', 'transferencias',
    'conciliacao-bancaria', 'outros-debitos', 'outros-creditos'
  ];

-- Usuários sem perfil herdado, ou com personalização ativa, usam o JSON
-- próprio como fonte efetiva e recebem a mesma compatibilidade controlada.
UPDATE public.usuarios_sistema usuario
SET permissoes = jsonb_set(
  coalesce(usuario.permissoes, '{}'::jsonb),
  '{financeiroTabs}',
  coalesce(usuario.permissoes -> 'financeiroTabs', '[]'::jsonb)
    || jsonb_build_array('convenios'),
  true
)
WHERE (
    usuario.perfil_acesso_id IS NULL
    OR coalesce(usuario.personalizar_permissoes, false)
    OR NOT EXISTS (
      SELECT 1 FROM public.perfis_acesso perfil
      WHERE perfil.id = usuario.perfil_acesso_id
    )
  )
  AND coalesce(usuario.permissoes -> 'modules', '[]'::jsonb) ? 'financeiro'
  AND NOT coalesce(usuario.permissoes -> 'financeiroTabs', '[]'::jsonb) ? 'convenios'
  AND (
    jsonb_typeof(usuario.permissoes -> 'tabs' -> 'financeiro') <> 'array'
    OR jsonb_array_length(
      coalesce(usuario.permissoes -> 'tabs' -> 'financeiro', '[]'::jsonb)
    ) = 0
  )
  AND coalesce(usuario.permissoes -> 'financeiroTabs', '[]'::jsonb) ?& array[
    'resumo', 'receber', 'despesas', 'emprestimos', 'transferencias',
    'conciliacao-bancaria', 'outros-debitos', 'outros-creditos'
  ];

UPDATE public.usuarios_sistema usuario
SET permissoes = jsonb_set(
  coalesce(usuario.permissoes, '{}'::jsonb),
  '{tabs,financeiro}',
  (usuario.permissoes -> 'tabs' -> 'financeiro')
    || jsonb_build_array('convenios'),
  true
)
WHERE (
    usuario.perfil_acesso_id IS NULL
    OR coalesce(usuario.personalizar_permissoes, false)
    OR NOT EXISTS (
      SELECT 1 FROM public.perfis_acesso perfil
      WHERE perfil.id = usuario.perfil_acesso_id
    )
  )
  AND coalesce(usuario.permissoes -> 'modules', '[]'::jsonb) ? 'financeiro'
  AND jsonb_typeof(usuario.permissoes -> 'tabs' -> 'financeiro') = 'array'
  AND jsonb_array_length(usuario.permissoes -> 'tabs' -> 'financeiro') > 0
  AND NOT (usuario.permissoes -> 'tabs' -> 'financeiro') ? 'convenios'
  AND (usuario.permissoes -> 'tabs' -> 'financeiro') ?& array[
    'resumo', 'receber', 'despesas', 'emprestimos', 'transferencias',
    'conciliacao-bancaria', 'outros-debitos', 'outros-creditos'
  ];

COMMIT;
