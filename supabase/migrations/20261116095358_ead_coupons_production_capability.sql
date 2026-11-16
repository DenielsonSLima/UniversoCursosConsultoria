begin;

-- Production capability is separate from installation and starts disabled.
-- The final release migration activates it after Edge/frontend deployment.
alter table internal_contas.ead_coupon_runtime
  add column allow_production boolean not null default false,
  add column released_at timestamptz,
  add column release_reference text,
  add constraint ead_coupon_production_release_audit check(not allow_production
    or (released_at is not null and nullif(btrim(release_reference),'') is not null));

create or replace function public.ead_coupons_available()
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and auth.role()='authenticated'
    and coalesce((select enabled from internal_contas.ead_coupon_runtime where singleton),false)
    and (exists(select 1 from public.parceiros p where p.auth_user_id=auth.uid()
      and upper(p.tipo)='ALUNO' and upper(p.status)='ATIVO')
    or (coalesce(public.gestor_has_module('secretaria'),false)
      and coalesce(public.gestor_has_module('financeiro'),false)
      and exists(select 1 from public.usuarios_sistema u where u.auth_user_id=auth.uid()
        and public.is_active_status(u.status))))
$$;
revoke all on function public.ead_coupons_available() from public,anon,authenticated,service_role;
grant execute on function public.ead_coupons_available() to authenticated;

create function internal_contas.ead_coupon_assert_checkout_configuration(p_environment text)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_capability internal_contas.ead_coupon_runtime%rowtype;
  v_runtime public.payment_gateway_runtime_config%rowtype;
  v_route public.payment_gateway_routes%rowtype;
  v_credential public.payment_gateway_credentials%rowtype;
begin
  select * into strict v_capability from internal_contas.ead_coupon_runtime where singleton for share;
  if not v_capability.enabled or p_environment not in ('sandbox','production')
    or p_environment is null or (p_environment='production' and not v_capability.allow_production) then
    raise exception 'Cupons indisponíveis neste ambiente de cobrança.' using errcode='42501';
  end if;
  -- Preserve the project's canonical bank environment. No request flag may
  -- change the active route, credential, issuer or payment product.
  select * into v_runtime from public.payment_gateway_runtime_config where id for share;
  if v_runtime.id is null or not v_runtime.enabled or v_runtime.active_environment is distinct from p_environment then
    raise exception 'Configuração bancária indisponível para o cupom.' using errcode='55000';
  end if;
  if (select count(*) from public.payment_gateway_routes where modalidade='EAD' and payment_method='BOLETO'
    and environment=p_environment and enabled is true)<>1 then
    raise exception 'Rota única de boleto EAD obrigatória para o cupom.' using errcode='55000';
  end if;
  select * into strict v_route from public.payment_gateway_routes where modalidade='EAD' and payment_method='BOLETO'
    and environment=p_environment and enabled is true for share;
  if v_route.provider_code is distinct from 'banese_card' or v_route.credential_id is null then
    raise exception 'O cupom exige a rota BolePix Banese homologada.' using errcode='55000';
  end if;
  select * into v_credential from public.payment_gateway_credentials where id=v_route.credential_id for share;
  if v_credential.id is null or v_credential.provider_code is distinct from 'banese_card'
    or v_credential.environment is distinct from p_environment or v_credential.configured is not true
    or v_credential.client_id_configured is not true or v_credential.client_secret_configured is not true then
    raise exception 'Credencial bancária do cupom indisponível.' using errcode='55000';
  end if;
end; $$;
revoke all on function internal_contas.ead_coupon_assert_checkout_configuration(text)
  from public,anon,authenticated,service_role;

commit;
