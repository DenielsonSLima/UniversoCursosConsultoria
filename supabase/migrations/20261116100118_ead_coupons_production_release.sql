begin;

-- Explicitly authorized release. No bank route, credential, student,
-- enrollment, coupon, title or payment is created or modified here.
update internal_contas.ead_coupon_runtime set enabled=true,allow_production=true,
  released_at=clock_timestamp(),release_reference='2026-11-16-cupons-ead-production'
  where singleton;

notify pgrst,'reload schema';

commit;
