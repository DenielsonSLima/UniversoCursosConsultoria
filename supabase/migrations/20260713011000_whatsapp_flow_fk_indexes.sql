-- Cover foreign keys introduced by the WhatsApp billing flow.

CREATE INDEX IF NOT EXISTS idx_whatsapp_flow_sessions_aluno
  ON public.whatsapp_flow_sessions (aluno_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_flow_events_session
  ON public.whatsapp_flow_events (session_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_flow_events_aluno
  ON public.whatsapp_flow_events (aluno_id);
