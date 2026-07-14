create or replace function public.preserve_aluno_identity_on_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if upper(coalesce(nullif(btrim(new.tipo), ''), old.tipo, '')) = 'ALUNO' then
    if nullif(btrim(new.email), '') is null
      and nullif(btrim(old.email), '') is not null then
      new.email := old.email;
    end if;

    if nullif(btrim(new.cpf_cnpj), '') is null
      and nullif(btrim(old.cpf_cnpj), '') is not null then
      new.cpf_cnpj := old.cpf_cnpj;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_preserve_aluno_identity_on_update on public.parceiros;

create trigger trg_preserve_aluno_identity_on_update
before update of email, cpf_cnpj, tipo on public.parceiros
for each row
execute function public.preserve_aluno_identity_on_update();
