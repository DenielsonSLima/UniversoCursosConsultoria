create or replace function public.preserve_aluno_identity_on_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  jwt_email text := lower(nullif(btrim(auth.jwt() ->> 'email'), ''));
  is_self_service boolean;
begin
  if upper(coalesce(old.tipo, '')) = 'ALUNO' then
    is_self_service := jwt_email is not null
      and jwt_email = lower(nullif(btrim(old.email), ''))
      and not public.is_gestor();

    if is_self_service then
      new.tipo := old.tipo;
      new.email := old.email;
      new.cpf_cnpj := old.cpf_cnpj;
    else
      if nullif(btrim(new.email), '') is null
        and nullif(btrim(old.email), '') is not null then
        new.email := old.email;
      end if;

      if nullif(btrim(new.cpf_cnpj), '') is null
        and nullif(btrim(old.cpf_cnpj), '') is not null then
        new.cpf_cnpj := old.cpf_cnpj;
      end if;
    end if;
  end if;

  return new;
end;
$$;
