ALTER TABLE public.mensageria_config
  ADD COLUMN IF NOT EXISTS wa_embedded_signup_config_id TEXT,
  ALTER COLUMN wa_graph_version SET DEFAULT 'v25.0';
