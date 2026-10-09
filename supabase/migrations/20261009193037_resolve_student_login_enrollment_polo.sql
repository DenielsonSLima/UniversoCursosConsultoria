begin;

-- A matrícula principal usa o polo da turma. Preserve os identificadores
-- anteriores do parceiro para não interromper o acesso já distribuído.
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

  -- EXISTS mantém a contagem por pessoa, inclusive sem Auth. Uma colisão
  -- entre qualquer identificador atual ou legado de pessoas distintas falha.
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
        left join public.turmas as turma on turma.id = matricula.turma_id
        where matricula.aluno_id = parceiro.id
          and (
            public.formatar_matricula_validacao(
              matricula.id, matricula.data_matricula, turma.polo_id
            ) = upper(v_identifier)
            or public.formatar_matricula_validacao(
              matricula.id, matricula.data_matricula, parceiro.polo_id
            ) = upper(v_identifier)
          )
      )
    );

  if v_candidate_count <> 1 then
    return null;
  end if;

  return v_login_email;
end;
$$;

comment on function public.resolve_portal_login_identity(text) is
  'Resolve matrícula do vínculo pelo polo da turma, preservando aliases acadêmicos e de acesso legados; ambiguidades são recusadas.';

revoke all on function public.resolve_portal_login_identity(text)
  from public, anon, authenticated;
grant execute on function public.resolve_portal_login_identity(text)
  to service_role;

commit;
