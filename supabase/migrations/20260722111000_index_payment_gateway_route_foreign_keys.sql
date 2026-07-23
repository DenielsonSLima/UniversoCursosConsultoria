begin;

create index if not exists payment_gateway_routes_provider_code_idx
  on public.payment_gateway_routes (provider_code);

create index if not exists payment_gateway_routes_credential_id_idx
  on public.payment_gateway_routes (credential_id)
  where credential_id is not null;

comment on index public.payment_gateway_routes_provider_code_idx is
  'Apoia validacao da FK e consultas das rotas por provedor financeiro.';

comment on index public.payment_gateway_routes_credential_id_idx is
  'Apoia validacao da FK das credenciais associadas as rotas financeiras.';

commit;
