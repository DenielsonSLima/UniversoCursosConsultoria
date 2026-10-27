-- REVIEW DRAFT ONLY. Requires approved deployment; no operation is seeded/enabled.
begin;
-- Service capability is bounded by approved immutable operation + exact item/CAS.
-- No private schema/table/prepare/approve/dispatch grants are added.
grant execute on function public.load_inclusion_cancellation_service(uuid) to service_role;
grant execute on function public.claim_inclusion_cancellation_service(uuid,uuid,text) to service_role;
grant execute on function public.start_inclusion_cancellation_service(uuid,uuid,text,uuid) to service_role;
grant execute on function public.complete_inclusion_cancellation_service(uuid,uuid,text,uuid,jsonb) to service_role;
grant execute on function public.review_inclusion_cancellation_service(uuid,uuid,text,uuid,text) to service_role;
commit;
