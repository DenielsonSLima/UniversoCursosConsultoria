-- Number 00 is an explicitly authorized provisional marker, NOT a verified address.
create table if not exists private.student_address_number_backfill (
 batch text not null,
 parceiro_id uuid not null,
 previous_numero text,
 replacement_numero text not null,
 row_version_after text,
 changed_at timestamptz not null default now(),
 primary key(batch, parceiro_id)
);
alter table private.student_address_number_backfill enable row level security;
revoke all on private.student_address_number_backfill from public, anon, authenticated;
comment on table private.student_address_number_backfill is 'Restricted rollback audit: user-authorized provisional address number, never a verified address.';
create or replace function public.require_student_address_number()
returns trigger language plpgsql set search_path = '' as $$
begin
 if new.tipo = 'Aluno' and (nullif(btrim(new.numero), '') is null or char_length(btrim(new.numero)) > 60) then
  raise exception 'Informe o número do endereço do aluno (até 60 caracteres); use S/N apenas quando o endereço não possuir número.' using errcode = '23514';
 end if;
 return new;
end;
$$;
revoke all on function public.require_student_address_number() from public, anon, authenticated;
drop trigger if exists require_student_address_number on public.parceiros;
create trigger require_student_address_number before insert or update of numero,tipo on public.parceiros
 for each row execute function public.require_student_address_number();
