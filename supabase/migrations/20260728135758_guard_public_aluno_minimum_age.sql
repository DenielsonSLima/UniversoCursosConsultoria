-- Versao registrada pelo MCP Supabase: 20260728135758.
begin;

-- A interface e o servico validam primeiro para dar retorno imediato, mas a
-- criacao do perfil publico tambem precisa rejeitar tentativas fora do cliente.
create or replace function public.guard_public_aluno_minimum_age()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.tipo = 'Aluno'
    and coalesce(new.observacao, '') like 'Cadastro publico criado%'
    and (
      new.data_nascimento is null
      or new.data_nascimento >= (current_date - interval '10 years')::date
    )
  then
    raise exception 'O cadastro e permitido somente para alunos com mais de 10 anos de idade.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_public_aluno_minimum_age on public.parceiros;
create trigger trg_guard_public_aluno_minimum_age
before insert on public.parceiros
for each row
execute function public.guard_public_aluno_minimum_age();

revoke all on function public.guard_public_aluno_minimum_age()
  from public, anon, authenticated;
grant execute on function public.guard_public_aluno_minimum_age()
  to service_role;

commit;
