-- Prova individual, verificável e sem PII bruta para cada assinatura do Diário.
-- O hash público identifica exatamente um evento ASSINATURA_CONCLUIDA; o QR
-- individual aponta para SIG-<eventId>, sem reutilizar o código do documento.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. SQL e compositor compartilham o mesmo mínimo geométrico do carimbo.
-- ---------------------------------------------------------------------------

-- Envelopes congelam política e geometria. Alterá-los seria quebrar a prova;
-- portanto qualquer envelope anterior precisa ser recriado antes deste lote.
DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM public.assinatura_eletronica_envelopes) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_ENVELOPE_GEOMETRIA_LEGADA',
      HINT = 'Recrie os envelopes antes de aplicar o contrato de carimbo individual.';
  END IF;
END;
$migration$;

ALTER FUNCTION public.assinatura_eletronica_editor_padrao()
  RENAME TO assinatura_eletronica_editor_padrao_v3_legacy;
ALTER FUNCTION public.assinatura_eletronica_normalizar_editor(jsonb)
  RENAME TO assinatura_eletronica_normalizar_editor_v3_legacy;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_expandir_editor_carimbo_individual(
  p_editor jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  v_editor jsonb := public.assinatura_eletronica_normalizar_editor_v3_legacy(
    p_editor
  );
  v_slot jsonb;
  v_index integer;
  v_x integer;
  v_y integer;
  v_width integer;
  v_height integer;
BEGIN
  FOR v_index IN 0..1 LOOP
    v_slot := v_editor #> ARRAY[
      'signatureStamp', 'slots', v_index::text
    ];
    v_width := greatest((v_slot ->> 'widthBp')::integer, 38000);
    v_height := greatest((v_slot ->> 'heightBp')::integer, 14000);
    v_x := least((v_slot ->> 'xBp')::integer, 100000 - v_width);
    v_y := least((v_slot ->> 'yBp')::integer, 100000 - v_height);
    v_slot := v_slot || jsonb_build_object(
      'xBp', v_x,
      'yBp', v_y,
      'widthBp', v_width,
      'heightBp', v_height
    );
    v_editor := pg_catalog.jsonb_set(
      v_editor,
      ARRAY['signatureStamp', 'slots', v_index::text],
      v_slot,
      false
    );
  END LOOP;

  -- Repassa pelo contrato v3 completo para rejeitar colisão/shape inesperado.
  RETURN public.assinatura_eletronica_normalizar_editor_v3_legacy(v_editor);
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_editor_padrao()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT public.assinatura_eletronica_expandir_editor_carimbo_individual(
    public.assinatura_eletronica_editor_padrao_v3_legacy()
  );
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_normalizar_editor(
  p_editor jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  v_schema integer;
  v_editor jsonb;
  v_slot jsonb;
  v_index integer;
BEGIN
  IF p_editor IS NULL THEN
    RETURN public.assinatura_eletronica_editor_padrao();
  END IF;

  -- A autoridade v3 anterior continua validando allowlists, tipos, limites
  -- máximos, coordenadas e colisão. Schemas 1/2 recebem o novo default.
  v_editor := public.assinatura_eletronica_normalizar_editor_v3_legacy(
    p_editor
  );
  v_schema := (p_editor ->> 'schemaVersion')::integer;
  IF v_schema IN (1, 2) THEN
    RETURN public.assinatura_eletronica_expandir_editor_carimbo_individual(
      p_editor
    );
  END IF;

  FOR v_index IN 0..1 LOOP
    v_slot := v_editor #> ARRAY[
      'signatureStamp', 'slots', v_index::text
    ];
    IF (v_slot ->> 'widthBp')::integer < 38000
       OR (v_slot ->> 'heightBp')::integer < 14000
    THEN
      RAISE EXCEPTION
        'O carimbo individual exige ao menos 38000 x 14000 unidades.'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;
  RETURN v_editor;
END;
$function$;

-- Políticas são configuração versionada, não identidade/evidência. Elas podem
-- receber o aumento mecânico; x/y/página/papel são preservados e clampados.
UPDATE public.assinatura_eletronica_politicas AS politica
SET politica = pg_catalog.jsonb_set(
  politica.politica,
  '{editor}',
  public.assinatura_eletronica_expandir_editor_carimbo_individual(
    politica.politica -> 'editor'
  ),
  false
)
WHERE politica.documento = 'diario_classe'
  AND jsonb_typeof(politica.politica -> 'editor') = 'object';

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.assinatura_eletronica_politicas AS politica
    WHERE politica.documento = 'diario_classe'
      AND (
        jsonb_typeof(politica.politica -> 'editor') IS DISTINCT FROM 'object'
        OR public.assinatura_eletronica_normalizar_editor(
          politica.politica -> 'editor'
        ) IS DISTINCT FROM politica.politica -> 'editor'
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_POLITICA_GEOMETRIA_INVALIDA';
  END IF;
END;
$migration$;

REVOKE ALL ON FUNCTION public.assinatura_eletronica_editor_padrao_v3_legacy()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_normalizar_editor_v3_legacy(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_expandir_editor_carimbo_individual(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_editor_padrao()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_normalizar_editor(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Snapshot imutável recebe somente a máscara mínima do CPF na criação.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_congelar_cpf_participante()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_cpf_original text;
  v_cpf_digitos text;
  v_cpf_mascarado text;
BEGIN
  IF NEW.papel NOT IN ('PROFESSOR', 'COORDENADOR') THEN
    RETURN NEW;
  END IF;

  IF NEW.parceiro_id IS NULL
     OR jsonb_typeof(NEW.identidade_snapshot) <> 'object'
     OR NEW.identidade_snapshot - ARRAY[
       'schemaVersion', 'partnerId', 'authUserId', 'name', 'role', 'cpfMasked'
     ]::text[] <> '{}'::jsonb
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ASSINATURA_IDENTIDADE_SNAPSHOT_CPF_INVALIDO';
  END IF;

  SELECT
    parceiro.cpf_cnpj,
    pg_catalog.regexp_replace(
      coalesce(parceiro.cpf_cnpj, ''),
      '[^0-9]',
      '',
      'g'
    )
  INTO v_cpf_original, v_cpf_digitos
  FROM public.parceiros AS parceiro
  WHERE parceiro.id = NEW.parceiro_id
  FOR KEY SHARE;

  IF NOT FOUND
     OR pg_catalog.length(v_cpf_digitos) <> 11
     OR NOT coalesce(public.is_valid_cpf(v_cpf_original), false)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ASSINATURA_SIGNATARIO_SEM_CPF_VALIDO';
  END IF;

  v_cpf_mascarado := '***.***.***-' || pg_catalog.right(v_cpf_digitos, 2);
  IF NEW.identidade_snapshot ? 'cpfMasked'
     AND NEW.identidade_snapshot ->> 'cpfMasked' IS DISTINCT FROM v_cpf_mascarado
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ASSINATURA_IDENTIDADE_SNAPSHOT_CPF_DIVERGENTE';
  END IF;

  NEW.identidade_snapshot := NEW.identidade_snapshot
    || jsonb_build_object('cpfMasked', v_cpf_mascarado);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS assinatura_eletronica_participantes_cpf_before_insert
  ON public.assinatura_eletronica_participantes;
CREATE TRIGGER assinatura_eletronica_participantes_cpf_before_insert
  BEFORE INSERT ON public.assinatura_eletronica_participantes
  FOR EACH ROW
  EXECUTE FUNCTION public.assinatura_eletronica_congelar_cpf_participante();

-- A identidade já congelada é imutável: não é seguro reconstruí-la depois.
-- O ambiente elegível precisa estar sem envelopes legados; se houver algum,
-- a migration inteira aborta e o envelope deve ser recriado pelo fluxo atual.
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.assinatura_eletronica_participantes AS participante
    WHERE participante.papel IN ('PROFESSOR', 'COORDENADOR')
      AND coalesce(
        participante.identidade_snapshot ->> 'cpfMasked',
        ''
      ) !~ '^[*]{3}[.][*]{3}[.][*]{3}-[0-9]{2}$'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_PARTICIPANTE_LEGADO_SEM_CPF_MASCARADO',
      HINT = 'Recrie os envelopes legados; snapshots de identidade não recebem backfill.';
  END IF;
END;
$migration$;

ALTER TABLE public.assinatura_eletronica_participantes
  ADD CONSTRAINT assinatura_eletronica_participantes_cpf_mascarado_check
  CHECK (
    papel NOT IN ('PROFESSOR', 'COORDENADOR')
    OR (
      identidade_snapshot ? 'cpfMasked'
      AND jsonb_typeof(identidade_snapshot -> 'cpfMasked') = 'string'
      AND coalesce(
        identidade_snapshot ->> 'cpfMasked'
          ~ '^[*]{3}[.][*]{3}[.][*]{3}-[0-9]{2}$',
        false
      )
    )
  ) NOT VALID;

ALTER TABLE public.assinatura_eletronica_participantes
  VALIDATE CONSTRAINT assinatura_eletronica_participantes_cpf_mascarado_check;

REVOKE ALL ON FUNCTION public.assinatura_eletronica_congelar_cpf_participante()
  FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. A cadeia inteira precisa continuar canônica antes de expor qualquer ato.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_cadeia_eventos_valida(
  p_envelope_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH ordenados AS (
    SELECT
      evento.*,
      pg_catalog.lag(evento.hash_evento) OVER (
        PARTITION BY evento.envelope_id
        ORDER BY evento.sequencia
      ) AS hash_anterior_calculado
    FROM public.assinatura_eletronica_eventos AS evento
    WHERE evento.envelope_id = p_envelope_id
  ), validados AS (
    SELECT
      sequencia,
      hash_evento = public.assinatura_eletronica_sha256_json(
        jsonb_build_object(
          'eventId', id,
          'envelopeId', envelope_id,
          'participantId', participante_id,
          'sequence', sequencia,
          'type', tipo,
          'actorAuthUserId', ator_auth_user_id,
          'occurredAt', ocorrido_em,
          'data', dados,
          'previousHash', hash_anterior
        )
      )
      AND hash_anterior IS NOT DISTINCT FROM hash_anterior_calculado AS valido
    FROM ordenados
  )
  SELECT coalesce(
    pg_catalog.count(*) > 0
    AND pg_catalog.min(sequencia) = 1
    AND pg_catalog.max(sequencia) = pg_catalog.count(*)
    AND pg_catalog.bool_and(valido),
    false
  )
  FROM validados;
$function$;

REVOKE ALL ON FUNCTION public.assinatura_eletronica_cadeia_eventos_valida(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Preflight da Edge recebe duas provas individuais já validadas no banco.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_provas_individuais_diario(
  p_envelope_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_eventos_validados jsonb;
  v_provas jsonb;
  v_total_valido integer;
BEGIN
  IF NOT public.assinatura_eletronica_cadeia_eventos_valida(p_envelope_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CADEIA_EVENTOS_INVALIDA';
  END IF;

  -- Reusa a autoridade existente de ator, sessão, desafio consumido e instante.
  v_eventos_validados :=
    public.assinatura_eletronica_eventos_assinatura_diario_validados(
      p_envelope_id
    );
  IF jsonb_array_length(v_eventos_validados) <> 2 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_PROVAS_INDIVIDUAIS_INVALIDAS';
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_total_valido
  FROM public.assinatura_eletronica_participantes AS participante
  JOIN public.assinatura_eletronica_eventos AS evento
    ON evento.envelope_id = participante.envelope_id
   AND evento.participante_id = participante.id
   AND evento.tipo = 'ASSINATURA_CONCLUIDA'
  WHERE participante.envelope_id = p_envelope_id
    AND participante.status = 'ASSINADO'
    AND participante.papel IN ('PROFESSOR', 'COORDENADOR')
    AND participante.ordem IN (1, 2)
    AND nullif(btrim(participante.identidade_snapshot ->> 'name'), '') IS NOT NULL
    AND participante.identidade_snapshot ->> 'cpfMasked'
      ~ '^[*]{3}[.][*]{3}[.][*]{3}-[0-9]{2}$'
    AND evento.ator_auth_user_id = participante.assinado_por_auth_user_id
    AND evento.dados ->> 'role' = participante.papel
    AND (evento.dados ->> 'order')::integer = participante.ordem
    AND (evento.dados ->> 'signedAt')::timestamptz = participante.assinado_em
    AND evento.dados -> 'authSessionBound' = 'true'::jsonb
    AND evento.dados ->> 'termId' = participante.aceitou_versao_termo
    AND evento.dados ->> 'termSha256' = participante.aceite_termo_sha256
    AND participante.aceite_termo_em = participante.assinado_em;

  IF v_total_valido <> 2 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_PROVAS_INDIVIDUAIS_INVALIDAS';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'participantId', participante.id,
    'role', participante.papel,
    'roleLabel', public.assinatura_eletronica_papel_label(participante.papel),
    'order', participante.ordem,
    'status', participante.status,
    'statusLabel', public.assinatura_eletronica_participante_status_label(
      participante.status
    ),
    'contextId', participante.contexto_id,
    'canAct', false,
    'signerName', participante.identidade_snapshot ->> 'name',
    'signerCpfMasked', participante.identidade_snapshot ->> 'cpfMasked',
    'signedAt', participante.assinado_em,
    'signatureEventId', evento.id,
    'signatureHash', evento.hash_evento,
    'verificationCode', 'SIG-' || pg_catalog.upper(evento.id::text),
    'verificationPath', '/validador?code=SIG-'
      || pg_catalog.upper(evento.id::text)
  ) ORDER BY participante.ordem)
  INTO v_provas
  FROM public.assinatura_eletronica_participantes AS participante
  JOIN public.assinatura_eletronica_eventos AS evento
    ON evento.envelope_id = participante.envelope_id
   AND evento.participante_id = participante.id
   AND evento.tipo = 'ASSINATURA_CONCLUIDA'
  WHERE participante.envelope_id = p_envelope_id;

  RETURN v_provas;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'ASSINATURA_PROVAS_INDIVIDUAIS_INVALIDAS';
END;
$function$;

REVOKE ALL ON FUNCTION public.assinatura_eletronica_provas_individuais_diario(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Wrapper estável chamado pela Edge: preserva o ledger/idempotência já
-- aplicado e substitui somente os participantes pelo contrato enriquecido.
CREATE OR REPLACE FUNCTION public.assinatura_eletronica_rpc_iniciar_finalizacao_diario(
  p_envelope_id uuid,
  p_actor_auth_user_id uuid,
  p_auth_session_id uuid,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_resultado jsonb;
  v_provas jsonb;
  v_eventos jsonb;
BEGIN
  v_resultado :=
    public.assinatura_eletronica_internal_iniciar_finalizacao_diario_segur(
      p_envelope_id => p_envelope_id,
      p_actor_auth_user_id => p_actor_auth_user_id,
      p_auth_session_id => p_auth_session_id,
      p_request_id => p_request_id
    );
  v_provas := public.assinatura_eletronica_provas_individuais_diario(
    p_envelope_id
  );
  SELECT jsonb_agg(jsonb_build_object(
    'type', 'ASSINATURA_CONCLUIDA',
    'occurredAt', prova -> 'signedAt',
    'participantId', prova -> 'participantId',
    'method', 'SENHA_REAUTENTICADA',
    'eventId', prova -> 'signatureEventId',
    'signatureHash', prova -> 'signatureHash'
  ) ORDER BY ordinalidade)
  INTO v_eventos
  FROM jsonb_array_elements(v_provas)
    WITH ORDINALITY AS item(prova, ordinalidade);

  v_resultado := pg_catalog.jsonb_set(
    v_resultado,
    '{participants}',
    v_provas,
    false
  );
  RETURN pg_catalog.jsonb_set(
    v_resultado,
    '{signatureEvents}',
    v_eventos,
    false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.assinatura_eletronica_rpc_iniciar_finalizacao_diario(
  uuid, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_rpc_iniciar_finalizacao_diario(
  uuid, uuid, uuid, uuid
) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Validador público dedicado ao ato; retorno fechado e sem PII bruta.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validar_assinatura_eletronica_por_codigo(
  p_codigo text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_codigo text := pg_catalog.upper(
    pg_catalog.regexp_replace(btrim(coalesce(p_codigo, '')), '[[:space:]]+', '', 'g')
  );
  v_evento_id uuid;
  v_resultado jsonb;
BEGIN
  IF v_codigo !~ '^SIG-[0-9A-F]{8}-[0-9A-F]{4}-[1-5][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$' THEN
    RETURN NULL;
  END IF;
  v_evento_id := pg_catalog.substr(v_codigo, 5)::uuid;

  SELECT jsonb_build_object(
    'type', 'assinatura_eletronica',
    'proofKind', 'SIGNATURE_EVENT',
    'status', CASE
      WHEN envelope.status = 'SUBSTITUIDO' THEN 'REVOKED'
      ELSE 'ACTIVE'
    END,
    'code', 'SIG-' || pg_catalog.upper(evento.id::text),
    'document', jsonb_build_object(
      'type', 'diario_classe',
      'code', pg_catalog.upper(envelope.id::text),
      'finalSha256', envelope.documento_final_sha256
    ),
    'signature', jsonb_build_object(
      'eventId', evento.id,
      'signerNameMasked', nome.nome_mascarado,
      'signerCpfMasked', participante.identidade_snapshot ->> 'cpfMasked',
      'role', participante.papel,
      'roleLabel', public.assinatura_eletronica_papel_label(participante.papel),
      'signedAt', participante.assinado_em,
      'hash', evento.hash_evento
    ),
    'institution', jsonb_build_object(
      'name', coalesce(
        nullif(btrim(envelope.documento_snapshot
          #>> '{institutionalIdentity,institution,name}'), ''),
        'Universo Cursos e Consultoria'
      )
    ),
    'schemaVersion', 1
  )
  INTO v_resultado
  FROM public.assinatura_eletronica_eventos AS evento
  JOIN public.assinatura_eletronica_envelopes AS envelope
    ON envelope.id = evento.envelope_id
  JOIN public.assinatura_eletronica_participantes AS participante
    ON participante.id = evento.participante_id
   AND participante.envelope_id = evento.envelope_id
  JOIN public.assinatura_eletronica_desafios AS desafio
    ON desafio.id::text = evento.dados ->> 'challengeId'
   AND desafio.envelope_id = evento.envelope_id
   AND desafio.participante_id = evento.participante_id
  JOIN public.assinatura_eletronica_artefatos AS artefato_final
    ON artefato_final.envelope_id = envelope.id
   AND artefato_final.classe = 'DOCUMENTO_FINAL'
   AND artefato_final.sha256 = envelope.documento_final_sha256
   AND artefato_final.bucket_id = 'documentos-assinatura-eletronica'
   AND artefato_final.storage_path = 'envelopes/' || envelope.id::text
     || '/documento-final.pdf'
   AND artefato_final.mime_type = 'application/pdf'
  JOIN storage.objects AS objeto_final
    ON objeto_final.bucket_id = artefato_final.bucket_id
   AND objeto_final.name = artefato_final.storage_path
  CROSS JOIN LATERAL (
    SELECT pg_catalog.regexp_replace(
      btrim(participante.identidade_snapshot ->> 'name'),
      '[[:space:]]+',
      ' ',
      'g'
    ) AS nome_normalizado
  ) AS normalizado
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN pg_catalog.strpos(normalizado.nome_normalizado, ' ') > 0
        THEN pg_catalog.split_part(normalizado.nome_normalizado, ' ', 1)
          || ' '
          || pg_catalog.left(
            pg_catalog.split_part(normalizado.nome_normalizado, ' ', 2),
            1
          )
          || '***'
      ELSE pg_catalog.left(normalizado.nome_normalizado, 1) || '***'
    END AS nome_mascarado
  ) AS nome
  WHERE evento.id = v_evento_id
    AND evento.tipo = 'ASSINATURA_CONCLUIDA'
    AND evento.hash_evento ~ '^[0-9a-f]{64}$'
    AND public.assinatura_eletronica_cadeia_eventos_valida(envelope.id)
    AND envelope.documento = 'diario_classe'
    AND envelope.origem_tipo = 'DIARIO'
    AND envelope.status IN ('ASSINADO', 'SUBSTITUIDO')
    AND envelope.finalizado_em IS NOT NULL
    AND envelope.documento_final_sha256 ~ '^[0-9a-f]{64}$'
    AND pg_catalog.upper(envelope.documento_snapshot ->> 'validationCode')
      = pg_catalog.upper(envelope.id::text)
    AND participante.status = 'ASSINADO'
    AND participante.papel IN ('PROFESSOR', 'COORDENADOR')
    AND (
      (participante.papel = 'PROFESSOR' AND participante.ordem = 1)
      OR (participante.papel = 'COORDENADOR' AND participante.ordem = 2)
    )
    AND nullif(normalizado.nome_normalizado, '') IS NOT NULL
    AND participante.identidade_snapshot ->> 'cpfMasked'
      ~ '^[*]{3}[.][*]{3}[.][*]{3}-[0-9]{2}$'
    AND evento.ator_auth_user_id IS NOT NULL
    AND evento.ator_auth_user_id = participante.assinado_por_auth_user_id
    AND evento.dados ->> 'role' = participante.papel
    AND (evento.dados ->> 'order')::integer = participante.ordem
    AND (evento.dados ->> 'signedAt')::timestamptz = participante.assinado_em
    AND evento.dados -> 'authSessionBound' = 'true'::jsonb
    AND evento.dados ->> 'termId' = participante.aceitou_versao_termo
    AND evento.dados ->> 'termSha256' = participante.aceite_termo_sha256
    AND participante.aceite_termo_em = participante.assinado_em
    AND desafio.metodo = 'SENHA_REAUTENTICADA'
    AND desafio.estado = 'CONSUMIDO'
    AND desafio.consumido_em = participante.assinado_em
    AND desafio.actor_auth_user_id = evento.ator_auth_user_id
    AND desafio.auth_session_id IS NOT NULL
    AND desafio.perfil = participante.papel
    AND desafio.contexto_id = participante.contexto_id
    AND desafio.evidencia_hash = public.assinatura_eletronica_sha256_json(
      desafio.evidencia_snapshot
    )
    AND desafio.evidencia_snapshot -> 'consent' -> 'accepted' = 'true'::jsonb
    AND desafio.evidencia_snapshot -> 'consent' ->> 'termId'
      = participante.aceitou_versao_termo
    AND desafio.evidencia_snapshot -> 'consent' ->> 'sha256'
      = participante.aceite_termo_sha256
    AND (
      SELECT pg_catalog.count(*)
      FROM public.assinatura_eletronica_participantes AS total_participante
      WHERE total_participante.envelope_id = envelope.id
        AND total_participante.status = 'ASSINADO'
    ) = 2
    AND (
      SELECT pg_catalog.count(*)
      FROM public.assinatura_eletronica_eventos AS total_evento
      WHERE total_evento.envelope_id = envelope.id
        AND total_evento.tipo = 'ASSINATURA_CONCLUIDA'
    ) = 2
  LIMIT 1;

  RETURN v_resultado;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.validar_assinatura_eletronica_por_codigo(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validar_assinatura_eletronica_por_codigo(text)
  TO anon, authenticated;

COMMIT;
