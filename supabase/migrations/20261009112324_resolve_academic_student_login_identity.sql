begin;

-- O cadastro exibe a matrícula acadêmica; o login também mantém o alias de
-- acesso legado. A resolução é exclusiva do backend e não modifica o Auth.
create or replace function public.resolve_portal_login_identity(p_identifier text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_identifier text := lower(btrim(coalesce(p_identifier, '')));
  v_candidate_count bigint;
  v_login_email text;
begin
  if length(v_identifier) = 0 or length(v_identifier) > 254 then
    return null;
  end if;

  if v_identifier like '%@%' then
    return v_identifier;
  end if;

  -- Cada parceiro conta uma vez, ainda que possua várias matrículas iguais.
  -- A função acadêmica existente recebe o ID da matrícula, não o do aluno.
  -- Contam também candidatos sem Auth: nunca escolhemos outra pessoa só por
  -- ela já possuir senha. Colisões entre os dois tipos de matrícula falham.
  select count(*), min(nullif(lower(btrim(parceiro.auth_login_email)), ''))
    into v_candidate_count, v_login_email
  from public.parceiros as parceiro
  where parceiro.tipo = 'Aluno'
    and public.is_active_status(parceiro.status)
    and (
      parceiro.matricula_acesso = upper(v_identifier)
      or exists (
        select 1
        from public.matriculas as matricula
        where matricula.aluno_id = parceiro.id
          and public.formatar_matricula_validacao(
            matricula.id, matricula.data_matricula, parceiro.polo_id
          ) = upper(v_identifier)
      )
    );

  if v_candidate_count <> 1 then
    return null;
  end if;

  return v_login_email;
end;
$$;

comment on function public.resolve_portal_login_identity(text) is
  'Resolve matrícula acadêmica ou matrícula de acesso somente no backend; ambiguidades são recusadas.';

revoke all on function public.resolve_portal_login_identity(text)
  from public, anon, authenticated;
grant execute on function public.resolve_portal_login_identity(text)
  to service_role;

commit;
