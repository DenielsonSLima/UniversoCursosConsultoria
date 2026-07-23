begin;

-- Mantém o mesmo critério de precedência usado pela autorização da Edge:
-- tabs.financeiro, quando presente, é o escopo efetivo; caso contrário,
-- financeiroTabs é o contrato legado. Somente perfis que já possuíam o
-- módulo Financeiro e a aba Contas a Receber recebem a nova aba.
with eligible_profiles as (
  select
    id,
    jsonb_typeof(permissoes -> 'tabs' -> 'financeiro') = 'array' as uses_scoped_tabs
  from public.perfis_acesso
  where jsonb_typeof(permissoes) = 'object'
    and jsonb_typeof(permissoes -> 'modules') = 'array'
    and (permissoes -> 'modules') ? 'financeiro'
    and case
      when jsonb_typeof(permissoes -> 'tabs' -> 'financeiro') = 'array'
        then (permissoes -> 'tabs' -> 'financeiro') ? 'receber'
      when jsonb_typeof(permissoes -> 'financeiroTabs') = 'array'
        then (permissoes -> 'financeiroTabs') ? 'receber'
      else false
    end
),
profiles_to_update as (
  select eligible.id, eligible.uses_scoped_tabs
  from eligible_profiles eligible
  join public.perfis_acesso profile on profile.id = eligible.id
  where case
    when eligible.uses_scoped_tabs
      then not ((profile.permissoes -> 'tabs' -> 'financeiro') ? 'conciliacao-bancaria')
    else not ((profile.permissoes -> 'financeiroTabs') ? 'conciliacao-bancaria')
  end
)
update public.perfis_acesso profile
set permissoes = case
  when target.uses_scoped_tabs then jsonb_set(
    profile.permissoes,
    '{tabs,financeiro}',
    (profile.permissoes -> 'tabs' -> 'financeiro') || to_jsonb('conciliacao-bancaria'::text),
    false
  )
  else jsonb_set(
    profile.permissoes,
    '{financeiroTabs}',
    (profile.permissoes -> 'financeiroTabs') || to_jsonb('conciliacao-bancaria'::text),
    false
  )
end
from profiles_to_update target
where profile.id = target.id;

-- Perfis sem Financeiro, sem Contas a Receber ou usuários com permissões
-- personalizadas não são alterados por este backfill de menor privilégio.

commit;
