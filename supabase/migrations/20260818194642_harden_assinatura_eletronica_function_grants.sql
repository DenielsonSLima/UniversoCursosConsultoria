-- Fecha privilégios padrão do Supabase nas funções internas da fundação.
-- A única fronteira executável pela API permanece nas três RPCs públicas.

BEGIN;

REVOKE ALL ON FUNCTION public.assinatura_eletronica_touch_updated_at() FROM service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_validar_escopo_politica() FROM service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_validar_escopo_envelope() FROM service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_validar_vinculos_envelope() FROM service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_validar_artefato() FROM service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_proteger_envelope() FROM service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_proteger_participante() FROM service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_validar_participante_fundacao() FROM service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_validar_evento() FROM service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_validar_desafio() FROM service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_eventos_append_only() FROM service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_artefatos_append_only() FROM service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_autoriza_configuracao(uuid) FROM service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_status_juridico_label(text) FROM service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_apresentar_configuracao(public.assinatura_eletronica_politicas) FROM service_role;

REVOKE ALL ON FUNCTION public.assinatura_eletronica_obter_configuracao(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_salvar_configuracao(uuid, text, jsonb, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_listar_caixa(text, uuid, integer, timestamptz) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_obter_configuracao(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_salvar_configuracao(uuid, text, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_listar_caixa(text, uuid, integer, timestamptz) TO authenticated, service_role;

COMMIT;
