alter table public.empresas
  add column if not exists complemento text;

alter table public.polos
  add column if not exists complemento text;

comment on column public.empresas.complemento is
  'Complemento do endereco institucional cadastrado para a empresa.';

comment on column public.polos.complemento is
  'Complemento do endereco publico e operacional do polo.';

update public.polos
set complemento = 'EDIF VITORIA APT 1204'
where regexp_replace(cnpj, '[^0-9]', '', 'g') = '13278137000405'
  and nullif(btrim(complemento), '') is null;

create or replace function public.list_public_units()
returns table (
  id uuid,
  name text,
  city text,
  state text,
  address text,
  number text,
  complement text,
  district text,
  postal_code text,
  phone text,
  email text,
  logo_url text,
  is_matrix boolean,
  support_hours jsonb
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    p.id,
    coalesce(nullif(btrim(p.nome), ''), nullif(btrim(e.nome_fantasia), ''), 'Unidade') as name,
    coalesce(nullif(btrim(p.cidade), ''), case when p.is_matriz then nullif(btrim(e.cidade), '') end) as city,
    coalesce(nullif(btrim(p.estado), ''), case when p.is_matriz then nullif(btrim(e.uf), '') end) as state,
    coalesce(nullif(btrim(p.endereco), ''), case when p.is_matriz then nullif(btrim(e.endereco), '') end) as address,
    coalesce(nullif(btrim(p.numero), ''), case when p.is_matriz then nullif(btrim(e.numero), '') end) as number,
    coalesce(nullif(btrim(p.complemento), ''), case when p.is_matriz then nullif(btrim(e.complemento), '') end) as complement,
    coalesce(nullif(btrim(p.bairro), ''), case when p.is_matriz then nullif(btrim(e.bairro), '') end) as district,
    coalesce(nullif(btrim(p.cep), ''), case when p.is_matriz then nullif(btrim(e.cep), '') end) as postal_code,
    coalesce(nullif(btrim(p.telefone), ''), nullif(btrim(e.telefone), '')) as phone,
    coalesce(nullif(btrim(p.email), ''), nullif(btrim(e.email), '')) as email,
    coalesce(nullif(btrim(p.logo_url), ''), nullif(btrim(e.logo_url), '')) as logo_url,
    coalesce(p.is_matriz, false) as is_matrix,
    atendimento.horarios as support_hours
  from public.polos p
  join public.empresas e
    on e.id = p.company_id
   and e.ativo = true
  left join public.comunicacao_atendimento_config atendimento
    on atendimento.polo_id = p.id
  where lower(coalesce(p.status, 'ativo')) = 'ativo'
  order by
    coalesce(p.is_matriz, false) desc,
    p.cidade asc nulls last,
    p.nome asc;
$function$;

revoke all on function public.list_public_units() from public;
grant execute on function public.list_public_units() to anon, authenticated, service_role;
