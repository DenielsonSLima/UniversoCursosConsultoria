CREATE TABLE IF NOT EXISTS public.edge_function_bundle_chunks (
  function_name TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  chunk TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (function_name, ordinal),
  CONSTRAINT edge_function_bundle_chunks_ordinal_positive CHECK (ordinal > 0),
  CONSTRAINT edge_function_bundle_chunks_function_name_check CHECK (function_name ~ '^[a-z0-9_-]+$')
);

ALTER TABLE public.edge_function_bundle_chunks ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.edge_function_bundle_chunks IS
  'Internal Edge Function bundle chunks loaded by service-role functions only.';
