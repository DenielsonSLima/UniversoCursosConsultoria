-- Índices de suporte às chaves estrangeiras da fundação. As tabelas ainda
-- estão vazias, portanto a criação é imediata e evita scans/locks amplos
-- quando o fluxo operacional for habilitado em etapa posterior.

BEGIN;

-- Estes dois índices eram duplicatas exatas dos índices únicos criados pelas
-- respectivas constraints.
DROP INDEX public.assinatura_eletronica_eventos_envelope_sequence_idx;
DROP INDEX public.assinatura_eletronica_artefatos_envelope_idx;

CREATE INDEX assinatura_eletronica_desafios_envelope_idx
  ON public.assinatura_eletronica_desafios (envelope_id);

CREATE INDEX assinatura_eletronica_envelopes_cancelado_por_idx
  ON public.assinatura_eletronica_envelopes (cancelado_por);

CREATE INDEX assinatura_eletronica_envelopes_company_id_idx
  ON public.assinatura_eletronica_envelopes (company_id);

CREATE INDEX assinatura_eletronica_envelopes_criado_por_idx
  ON public.assinatura_eletronica_envelopes (criado_por);

CREATE INDEX assinatura_eletronica_envelopes_politica_id_idx
  ON public.assinatura_eletronica_envelopes (politica_id);

CREATE INDEX assinatura_eletronica_envelopes_substitui_envelope_id_idx
  ON public.assinatura_eletronica_envelopes (substitui_envelope_id);

CREATE INDEX assinatura_eletronica_eventos_ator_auth_user_id_idx
  ON public.assinatura_eletronica_eventos (ator_auth_user_id);

CREATE INDEX assinatura_eletronica_eventos_participante_id_idx
  ON public.assinatura_eletronica_eventos (participante_id);

CREATE INDEX assinatura_eletronica_participantes_parceiro_id_idx
  ON public.assinatura_eletronica_participantes (parceiro_id);

CREATE INDEX assinatura_eletronica_politicas_arquivada_por_idx
  ON public.assinatura_eletronica_politicas (arquivada_por);

CREATE INDEX assinatura_eletronica_politicas_atualizada_por_idx
  ON public.assinatura_eletronica_politicas (atualizada_por);

CREATE INDEX assinatura_eletronica_politicas_criada_por_idx
  ON public.assinatura_eletronica_politicas (criada_por);

COMMIT;
