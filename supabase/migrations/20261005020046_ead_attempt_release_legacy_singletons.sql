begin;

-- Apply only after all published inscription writers use receipt identity/CAS.
-- Expiration readiness/configuration remain false throughout that rollout.
drop index public.contas_receber_matricula_matricula_uidx;
alter table public.inscricoes_online drop constraint inscricoes_online_matricula_id_key;

commit;
