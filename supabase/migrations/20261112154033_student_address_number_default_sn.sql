-- Explicit owner instruction: missing student numbers use S/N, not invented numeric 00.
create or replace function public.require_student_address_number()
returns trigger language plpgsql set search_path = '' as $$
begin
 if new.tipo = 'Aluno' then
  if nullif(btrim(new.numero), '') is null then new.numero := 'S/N'; end if;
  if char_length(btrim(new.numero)) > 60 then
   raise exception 'O número do endereço do aluno deve ter até 60 caracteres.' using errcode = '23514';
  end if;
 end if;
 return new;
end;
$$;
revoke all on function public.require_student_address_number() from public, anon, authenticated;
