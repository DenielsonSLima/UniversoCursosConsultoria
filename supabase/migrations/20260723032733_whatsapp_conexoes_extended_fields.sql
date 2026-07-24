-- Espelho local da migration aplicada pelo MCP em 2026-07-23.
ALTER TABLE public.whatsapp_conexoes
  ADD COLUMN IF NOT EXISTS connection_mode TEXT DEFAULT 'cloud_api',
  ADD COLUMN IF NOT EXISTS graph_version TEXT DEFAULT 'v25.0',
  ADD COLUMN IF NOT EXISTS app_id TEXT,
  ADD COLUMN IF NOT EXISTS app_secret TEXT,
  ADD COLUMN IF NOT EXISTS verify_token TEXT,
  ADD COLUMN IF NOT EXISTS token_configured BOOLEAN DEFAULT false;
