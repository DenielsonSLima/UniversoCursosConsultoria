-- Keep the WhatsApp phone lookup RPC internal to service-role Edge Functions.

REVOKE EXECUTE ON FUNCTION public.whatsapp_find_aluno_by_phone(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.whatsapp_find_aluno_by_phone(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.whatsapp_find_aluno_by_phone(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_find_aluno_by_phone(TEXT) TO service_role;
