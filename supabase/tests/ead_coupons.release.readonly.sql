-- Read-only release probe. No identity, coupon, enrollment, title or bank
-- request is created. Run after installation and again after final activation.
select jsonb_build_object(
  'runtime',(select jsonb_build_object('enabled',enabled,'allowProduction',allow_production,
    'releaseRecorded',released_at is not null,'releaseReference',release_reference)
    from internal_contas.ead_coupon_runtime where singleton),
  'couponCount',(select count(*) from public.ead_coupons),
  'redemptionCount',(select count(*) from public.ead_coupon_redemptions),
  'rowSecurity',(select jsonb_object_agg(c.relname,c.relrowsecurity)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('ead_coupons','ead_coupon_redemptions','ead_coupon_events')),
  'functionsHardened',(select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','internal_contas') and p.proname like 'ead_coupon%'),
  'anonymousRedeemDenied',not has_function_privilege('anon','public.ead_coupon_redeem_free(text,uuid,uuid)','EXECUTE'),
  'browserPaidPrepareDenied',not has_function_privilege('authenticated',
    'public.ead_coupon_prepare_checkout(text,uuid,uuid,uuid,text,text,text,date,text)','EXECUTE'),
  'servicePaidPrepareAllowed',has_function_privilege('service_role',
    'public.ead_coupon_prepare_checkout(text,uuid,uuid,uuid,text,text,text,date,text)','EXECUTE'),
  'browserDirectCouponWritesDenied',not has_table_privilege('authenticated','public.ead_coupons','INSERT,UPDATE,DELETE'),
  'browserDirectRedemptionWritesDenied',not has_table_privilege('authenticated','public.ead_coupon_redemptions','INSERT,UPDATE,DELETE'),
  'browserRuntimeAccessDenied',not has_table_privilege('authenticated','internal_contas.ead_coupon_runtime','SELECT,INSERT,UPDATE,DELETE'),
  'bankConfiguration',(select jsonb_build_object('enabled',runtime.enabled,'environment',runtime.active_environment,
    'eadBoletoRoutes',(select count(*) from public.payment_gateway_routes r
      where r.modalidade='EAD' and r.payment_method='BOLETO' and r.environment=runtime.active_environment and r.enabled),
    'configuredBaneseBoleto',(select count(*)=1 from public.payment_gateway_routes r
      join public.payment_gateway_credentials c on c.id=r.credential_id
      where r.modalidade='EAD' and r.payment_method='BOLETO' and r.environment=runtime.active_environment and r.enabled
        and r.provider_code='banese_card' and c.provider_code=r.provider_code and c.environment=r.environment
        and c.configured and c.client_id_configured and c.client_secret_configured))
    from public.payment_gateway_runtime_config runtime where runtime.id)
) as ead_coupons_release_probe;
