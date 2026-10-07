begin;
-- PROPOSAL ONLY; not part of runnable migrations. Requires explicit privilege approval.
-- No private prepare/approve/finalize functions receive service/public privileges.
grant execute on function public.load_financial_correction_service(uuid) to service_role;
grant execute on function public.claim_financial_correction_service(uuid,uuid,text) to service_role;
grant execute on function public.start_financial_correction_service(uuid,uuid,text,uuid) to service_role;
grant execute on function public.review_financial_correction_service(uuid,uuid,text,uuid,text) to service_role;
grant execute on function public.complete_financial_correction_service(uuid,uuid,text,uuid,jsonb) to service_role;

-- Explicit real-user review/consent only; no table, worker or private-finalize access.
grant execute on function public.preview_bounded_financial_correction_secure(uuid,uuid) to authenticated;
grant execute on function public.consent_bounded_financial_correction_secure(uuid,uuid,uuid,text) to authenticated;

commit;