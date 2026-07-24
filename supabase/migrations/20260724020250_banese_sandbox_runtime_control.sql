-- Estado canônico da integração bancária. Nesta etapa de homologação, somente
-- o boleto Banese para EAD pode gerar novas cobranças e o ambiente é sandbox.

create table if not exists public.payment_gateway_runtime_config (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  active_environment text not null default 'sandbox'
    check (active_environment in ('sandbox', 'production')),
  updated_by uuid null references public.usuarios_sistema(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.payment_gateway_runtime_config is
  'Controle canônico global das novas cobranças: liga/desliga e ambiente ativo.';

alter table public.payment_gateway_runtime_config enable row level security;
revoke all on table public.payment_gateway_runtime_config from anon, authenticated;
grant all on table public.payment_gateway_runtime_config to service_role;

insert into public.payment_gateway_runtime_config (
  id,
  enabled,
  active_environment
)
values (true, true, 'sandbox')
on conflict (id) do update
set enabled = excluded.enabled,
    active_environment = excluded.active_environment,
    updated_at = now();

update public.payment_gateway_credentials
set metadata = metadata
  || jsonb_build_object(
    'baneseConvenio', case when environment = 'production' then '15261' else '15528' end,
    'baneseBoletoConvenio', case when environment = 'production' then '15261' else '15528' end,
    'banesePixConvenio', case when environment = 'production' then '15261' else '15528' end,
    'banesePixHomologacaoDisponivel', false,
    'bolepixBankManaged', true,
    'reconciliationPrimaryMethod', 'polling'
  ),
  updated_at = now()
where provider_code = 'banese_card';

update public.payment_gateway_routes
set enabled = false,
    updated_at = now(),
    notes = trim(both ' |' from concat_ws(
      ' | ',
      nullif(notes, ''),
      'ETAPA_HOMOLOGACAO_20260724: somente EAD + boleto Banese no sandbox'
    ));

update public.payment_gateway_routes route
set provider_code = 'banese_card',
    credential_id = credential.id,
    enabled = true,
    updated_at = now(),
    notes = 'ETAPA_HOMOLOGACAO_20260724: boleto Banese EAD autorizado para teste no sandbox'
from public.payment_gateway_credentials credential
where route.modalidade = 'EAD'
  and route.payment_method = 'BOLETO'
  and route.environment = 'sandbox'
  and credential.provider_code = 'banese_card'
  and credential.environment = 'sandbox'
  and credential.configured = true;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'payment_gateway_runtime_config'
  ) then
    alter publication supabase_realtime
      add table public.payment_gateway_runtime_config;
  end if;
end
$$;
