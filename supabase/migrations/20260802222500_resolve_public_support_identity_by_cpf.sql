create or replace function public.resolve_public_support_identity_by_cpf(p_cpf text)
returns table (
  identity_kind text,
  partner_id uuid,
  display_name text,
  polo_id uuid
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with input as (
    select regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g') as cpf
  ), candidates as (
    select
      'aluno'::text as identity_kind,
      p.id as partner_id,
      left(btrim(p.nome), 120) as display_name,
      p.polo_id,
      1 as priority
    from public.parceiros p
    cross join input i
    where length(i.cpf) = 11
      and p.tipo = 'Aluno'
      and public.is_active_status(p.status)
      and regexp_replace(coalesce(p.cpf_cnpj, ''), '\D', '', 'g') = i.cpf

    union all

    select
      'gestor'::text as identity_kind,
      null::uuid as partner_id,
      left(btrim(u.nome), 120) as display_name,
      case
        when cardinality(coalesce(u.polo_ids, array[]::uuid[])) > 0 then u.polo_ids[1]
        when coalesce(u.context, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then u.context::uuid
        else null::uuid
      end as polo_id,
      2 as priority
    from public.usuarios_sistema u
    cross join input i
    where length(i.cpf) = 11
      and public.is_active_status(u.status)
      and regexp_replace(coalesce(u.cpf, ''), '\D', '', 'g') = i.cpf
  )
  select c.identity_kind, c.partner_id, c.display_name, c.polo_id
  from candidates c
  order by c.priority
  limit 1;
$$;

revoke all on function public.resolve_public_support_identity_by_cpf(text)
  from public, anon, authenticated;
grant execute on function public.resolve_public_support_identity_by_cpf(text)
  to service_role;

comment on function public.resolve_public_support_identity_by_cpf(text) is
  'Resolve internamente a identidade de atendimento por CPF. Restrita ao service_role e sem exposição ao cliente público.';
