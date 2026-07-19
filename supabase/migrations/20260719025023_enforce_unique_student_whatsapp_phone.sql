begin;

-- Meta pode devolver celulares brasileiros sem o nono digito. Esta chave
-- mantem um unico identificador para cadastro, lookup e validacao de envio.
create or replace function public.whatsapp_phone_match_key(p_phone text)
returns text
language sql
immutable
set search_path = public
as $$
  with normalized as (
    select public.whatsapp_normalize_phone(p_phone) as phone
  )
  select case
    when phone ~ '^55[1-9][0-9]9[0-9]{8}$'
      then left(phone, 4) || substring(phone from 6)
    else phone
  end
  from normalized;
$$;

create index if not exists idx_parceiros_aluno_whatsapp_phone_match_key
  on public.parceiros ((public.whatsapp_phone_match_key(telefone)))
  where tipo = 'Aluno'
    and public.whatsapp_phone_match_key(telefone) is not null;

create or replace function public.whatsapp_reject_duplicate_student_phone()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_phone_key text;
begin
  if new.tipo is distinct from 'Aluno' then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and new.tipo is not distinct from old.tipo
    and new.telefone is not distinct from old.telefone
  then
    return new;
  end if;

  v_phone_key := public.whatsapp_phone_match_key(new.telefone);
  if v_phone_key is null then
    return new;
  end if;

  -- Serializa cadastros concorrentes do mesmo numero antes da verificacao.
  perform pg_advisory_xact_lock(
    hashtextextended('parceiros:aluno:whatsapp:' || v_phone_key, 0)
  );

  if exists (
    select 1
    from public.parceiros p
    where p.tipo = 'Aluno'
      and p.id is distinct from new.id
      and public.whatsapp_phone_match_key(p.telefone) = v_phone_key
  ) then
    raise exception using
      errcode = '23505',
      message = 'Este telefone/WhatsApp ja esta vinculado a outro aluno.',
      detail = 'Cada telefone principal pode pertencer a somente um cadastro de aluno.',
      hint = 'Remova o telefone do cadastro anterior antes de reutiliza-lo.';
  end if;

  return new;
end;
$$;

revoke all on function public.whatsapp_reject_duplicate_student_phone()
  from public, anon, authenticated;

drop trigger if exists trg_parceiros_unique_student_whatsapp_phone
  on public.parceiros;

create trigger trg_parceiros_unique_student_whatsapp_phone
before insert or update of telefone, tipo on public.parceiros
for each row
execute function public.whatsapp_reject_duplicate_student_phone();

create or replace function public.whatsapp_find_aluno_by_phone(p_phone text)
returns table (
  id uuid,
  nome text,
  telefone text,
  cpf_cnpj text,
  match_source text
)
language sql
stable
security invoker
set search_path = public
as $$
  with normalized as (
    select public.whatsapp_phone_match_key(p_phone) as phone
  ),
  candidates as (
    select p.id, p.nome, p.telefone, p.cpf_cnpj, 'aluno'::text as match_source,
      1 as priority, p.updated_at, p.created_at
    from public.parceiros p, normalized n
    where p.tipo = 'Aluno'
      and n.phone is not null
      and public.whatsapp_phone_match_key(p.telefone) = n.phone

    union all

    select p.id, p.nome, p.telefone, p.cpf_cnpj, 'responsavel_ficha'::text as match_source,
      2 as priority, p.updated_at, p.created_at
    from public.parceiros p, normalized n
    where p.tipo = 'Aluno'
      and n.phone is not null
      and p.responsavel_financeiro is true
      and public.whatsapp_phone_match_key(p.responsavel_telefone) = n.phone
  )
  select c.id, c.nome, c.telefone, c.cpf_cnpj, c.match_source
  from candidates c
  order by c.priority, c.updated_at desc nulls last, c.created_at desc nulls last
  limit 1;
$$;

create or replace function public.whatsapp_find_aluno_by_phone_and_cpf(
  p_phone text,
  p_cpf text
)
returns table (
  id uuid,
  nome text,
  telefone text,
  cpf_cnpj text,
  match_source text
)
language sql
stable
security invoker
set search_path = public
as $$
  with normalized as (
    select
      public.whatsapp_phone_match_key(p_phone) as phone,
      public.whatsapp_digits(p_cpf) as cpf
  ),
  candidates as (
    select p.id, p.nome, p.telefone, p.cpf_cnpj, 'aluno'::text as match_source,
      1 as priority, p.updated_at, p.created_at
    from public.parceiros p, normalized n
    where p.tipo = 'Aluno'
      and n.phone is not null
      and n.cpf is not null
      and public.whatsapp_digits(p.cpf_cnpj) = n.cpf
      and public.whatsapp_phone_match_key(p.telefone) = n.phone

    union all

    select p.id, p.nome, p.telefone, p.cpf_cnpj, 'responsavel_ficha'::text as match_source,
      2 as priority, p.updated_at, p.created_at
    from public.parceiros p, normalized n
    where p.tipo = 'Aluno'
      and n.phone is not null
      and n.cpf is not null
      and p.responsavel_financeiro is true
      and public.whatsapp_digits(p.cpf_cnpj) = n.cpf
      and public.whatsapp_phone_match_key(p.responsavel_telefone) = n.phone
  )
  select c.id, c.nome, c.telefone, c.cpf_cnpj, c.match_source
  from candidates c
  order by c.priority, c.updated_at desc nulls last, c.created_at desc nulls last
  limit 1;
$$;

create or replace function public.whatsapp_phone_belongs_to_aluno(
  p_aluno_id uuid,
  p_phone text
)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  with normalized as (
    select public.whatsapp_phone_match_key(p_phone) as phone
  )
  select exists (
    select 1
    from public.parceiros p, normalized n
    where p.id = p_aluno_id
      and p.tipo = 'Aluno'
      and n.phone is not null
      and (
        public.whatsapp_phone_match_key(p.telefone) = n.phone
        or (
          p.responsavel_financeiro is true
          and public.whatsapp_phone_match_key(p.responsavel_telefone) = n.phone
        )
      )
  );
$$;

revoke all on function public.whatsapp_find_aluno_by_phone(text)
  from public, anon, authenticated;
revoke all on function public.whatsapp_find_aluno_by_phone_and_cpf(text, text)
  from public, anon, authenticated;
revoke all on function public.whatsapp_phone_belongs_to_aluno(uuid, text)
  from public, anon, authenticated;

grant execute on function public.whatsapp_find_aluno_by_phone(text) to service_role;
grant execute on function public.whatsapp_find_aluno_by_phone_and_cpf(text, text) to service_role;
grant execute on function public.whatsapp_phone_belongs_to_aluno(uuid, text) to service_role;

commit;
