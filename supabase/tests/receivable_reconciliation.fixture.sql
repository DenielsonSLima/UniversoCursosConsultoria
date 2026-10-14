ALTER TABLE public.banese_reconciliation_queue
 ADD COLUMN environment text DEFAULT 'production', ADD COLUMN modality text DEFAULT 'EAD',
 ADD COLUMN priority integer DEFAULT 1, ADD COLUMN issued_at timestamptz DEFAULT now();
CREATE TABLE public.payment_gateway_runtime_config(active_environment text,enabled boolean);
CREATE TABLE public.payment_gateway_routes(provider_code text,environment text,payment_method text,enabled boolean);
CREATE TABLE public.banese_reconciliation_config(
 environment text PRIMARY KEY,mode text,state text,effective_profile_id int,selected_profile_id int,
 last_stable_profile_id int,test_expires_at timestamptz,stable_since timestamptz,cooldown_until timestamptz,
 version int,updated_at timestamptz,oauth_reuse_enabled boolean,oauth_refresh_margin_seconds int
);
CREATE TABLE public.banese_reconciliation_profiles(
 id int PRIMARY KEY,selectable boolean,automatic_selectable boolean,titles_per_minute int,
 max_concurrency int,queue_strategy text
);
CREATE TABLE public.banese_reconciliation_runs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),environment text,status text DEFAULT 'RUNNING',
 origin text DEFAULT 'WORKER',mode text,profile_id int,target_titles int,claimed int,config_version int,
 started_at timestamptz DEFAULT now(),finished_at timestamptz,decision text
);
CREATE TABLE public.banese_reconciliation_transitions(
 environment text,transition_type text,from_profile_id int,to_profile_id int,from_mode text,to_mode text,reason text
);
INSERT INTO public.payment_gateway_runtime_config VALUES('production',true);
INSERT INTO public.payment_gateway_routes VALUES('banese_card','production','BOLETO',true);
INSERT INTO public.banese_reconciliation_profiles VALUES(3,true,true,1,1,'GENERAL');
INSERT INTO public.banese_reconciliation_config(environment,mode,state,effective_profile_id,version)
 VALUES('production','AUTOMATIC','OBSERVING',3,1);
