-- Contrato estrutural do piloto de assinatura eletrônica do Diário de Classe.
--
-- Esta migration mantém o documento juridicamente BLOQUEADO. Ela prepara a
-- persistência, a ordem Professor -> Coordenador, a trilha imutável e as RPCs
-- usadas pelos serviços confiáveis. Nenhuma política é habilitada por este seed.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Envelope versionado e hashes independentes do original e do PDF final.
-- ---------------------------------------------------------------------------

ALTER TABLE public.assinatura_eletronica_envelopes
  RENAME COLUMN conteudo_sha256 TO documento_original_sha256;

ALTER TABLE public.assinatura_eletronica_envelopes
  ALTER COLUMN documento_original_sha256 DROP NOT NULL,
  ADD COLUMN origem_tipo text NOT NULL DEFAULT 'DIARIO',
  ADD COLUMN turma_id uuid NOT NULL,
  ADD COLUMN disciplina_id uuid NOT NULL,
  ADD COLUMN origem_versao integer NOT NULL DEFAULT 1,
  ADD COLUMN documento_snapshot jsonb NOT NULL,
  ADD COLUMN academico_snapshot_sha256 text NOT NULL,
  ADD COLUMN geometria_snapshot jsonb NOT NULL,
  ADD COLUMN pdf_semantic_manifest_snapshot jsonb,
  ADD COLUMN pdf_signature_target_snapshot jsonb,
  ADD COLUMN documento_final_sha256 text,
  ADD COLUMN original_congelado_em timestamptz,
  ADD COLUMN publicado_em timestamptz,
  ADD COLUMN criado_contexto_tipo text NOT NULL DEFAULT 'GESTOR',
  ADD COLUMN criado_contexto_id uuid NOT NULL,
  ADD COLUMN origem_chave text GENERATED ALWAYS AS (
    'diario:' || turma_id::text || ':' || disciplina_id::text
  ) STORED;

ALTER TABLE public.assinatura_eletronica_envelopes
  ALTER COLUMN origem_tipo DROP DEFAULT,
  ALTER COLUMN origem_versao DROP DEFAULT,
  ALTER COLUMN criado_contexto_tipo DROP DEFAULT,
  DROP CONSTRAINT IF EXISTS assinatura_eletronica_envelopes_conteudo_sha256_check,
  DROP CONSTRAINT IF EXISTS assinatura_eletronica_envelopes_status_check,
  ADD CONSTRAINT assinatura_eletronica_envelopes_original_sha256_check
    CHECK (
      documento_original_sha256 IS NULL
      OR documento_original_sha256 ~ '^[0-9a-f]{64}$'
    ),
  ADD CONSTRAINT assinatura_eletronica_envelopes_final_sha256_check
    CHECK (
      documento_final_sha256 IS NULL
      OR documento_final_sha256 ~ '^[0-9a-f]{64}$'
    ),
  ADD CONSTRAINT assinatura_eletronica_envelopes_origem_check
    CHECK (
      documento = 'diario_classe'
      AND origem_tipo = 'DIARIO'
      AND origem_versao > 0
      AND matricula_id IS NULL
      AND aluno_id IS NULL
      AND documento_validacao_id IS NULL
    ),
  ADD CONSTRAINT assinatura_eletronica_envelopes_snapshot_diario_check
    CHECK (
      jsonb_typeof(documento_snapshot) = 'object'
      AND documento_snapshot ->> 'schemaVersion' = '2'
      AND documento_snapshot ->> 'composerSchemaVersion' = '1'
      AND documento_snapshot ->> 'documentType' = 'diario_classe'
      AND documento_snapshot -> 'source' ->> 'type' = 'DIARIO'
      AND documento_snapshot -> 'source' ->> 'turmaId' = turma_id::text
      AND documento_snapshot -> 'source' ->> 'disciplinaId' = disciplina_id::text
      AND jsonb_typeof(geometria_snapshot) = 'object'
      AND geometria_snapshot ->> 'schemaVersion' = '1'
      AND geometria_snapshot ->> 'coordinateSpace' = 'PAGE_TOP_LEFT_BP_V1'
      AND jsonb_typeof(geometria_snapshot -> 'slots') = 'array'
      AND jsonb_array_length(geometria_snapshot -> 'slots') = 2
      AND academico_snapshot_sha256 ~ '^[0-9a-f]{64}$'
    ),
  ADD CONSTRAINT assinatura_eletronica_envelopes_original_shape
    CHECK (
      (
        documento_original_sha256 IS NULL
        AND original_congelado_em IS NULL
        AND publicado_em IS NULL
        AND pdf_semantic_manifest_snapshot IS NULL
        AND pdf_signature_target_snapshot IS NULL
      )
      OR
      (
        documento_original_sha256 IS NOT NULL
        AND original_congelado_em IS NOT NULL
        AND publicado_em IS NOT NULL
        AND pdf_semantic_manifest_snapshot IS NOT NULL
        AND pdf_signature_target_snapshot IS NOT NULL
      )
    ),
  ADD CONSTRAINT assinatura_eletronica_envelopes_final_hash_shape
    CHECK (
      (status IN ('ASSINADO', 'SUBSTITUIDO') AND documento_final_sha256 IS NOT NULL)
      OR
      (status NOT IN ('ASSINADO', 'SUBSTITUIDO') AND documento_final_sha256 IS NULL)
    ),
  ADD CONSTRAINT assinatura_eletronica_envelopes_status_check
    CHECK (status IN (
      'RASCUNHO',
      'PENDENTE',
      'EM_ASSINATURA',
      'FINALIZANDO',
      'ASSINADO',
      'RECUSADO',
      'CANCELADO',
      'EXPIRADO',
      'SUBSTITUIDO'
    )),
  ADD CONSTRAINT assinatura_eletronica_envelopes_turma_disciplina_fkey
    FOREIGN KEY (turma_id, disciplina_id)
    REFERENCES public.turmas_disciplinas(turma_id, disciplina_id)
    ON DELETE RESTRICT;

ALTER TABLE public.assinatura_eletronica_envelopes
  DROP CONSTRAINT IF EXISTS assinatura_eletronica_envelopes_finalization_shape,
  ADD CONSTRAINT assinatura_eletronica_envelopes_finalization_shape
    CHECK (
      (status IN ('ASSINADO', 'SUBSTITUIDO')) = (finalizado_em IS NOT NULL)
    );

DROP INDEX IF EXISTS public.assinatura_eletronica_envelopes_request_id_key;

CREATE UNIQUE INDEX assinatura_eletronica_envelopes_creator_request_key
  ON public.assinatura_eletronica_envelopes (criado_por, request_id)
  WHERE criado_por IS NOT NULL AND request_id IS NOT NULL;

CREATE UNIQUE INDEX assinatura_eletronica_envelopes_origem_versao_key
  ON public.assinatura_eletronica_envelopes
    (origem_tipo, turma_id, disciplina_id, origem_versao);

CREATE UNIQUE INDEX assinatura_eletronica_envelopes_origem_viva_key
  ON public.assinatura_eletronica_envelopes
    (origem_tipo, turma_id, disciplina_id)
  WHERE status IN ('RASCUNHO', 'PENDENTE', 'EM_ASSINATURA', 'FINALIZANDO');

CREATE INDEX assinatura_eletronica_envelopes_diario_caixa_idx
  ON public.assinatura_eletronica_envelopes
    (turma_id, disciplina_id, status, updated_at DESC, id DESC);

-- ---------------------------------------------------------------------------
-- 2. Participantes com contexto e snapshots explícitos.
-- ---------------------------------------------------------------------------

ALTER TABLE public.assinatura_eletronica_participantes
  DROP CONSTRAINT IF EXISTS assinatura_eletronica_participantes_papel_check,
  DROP CONSTRAINT IF EXISTS assinatura_eletronica_participantes_status_check,
  DROP CONSTRAINT IF EXISTS assinatura_eletronica_participantes_unique_role_order,
  DROP CONSTRAINT IF EXISTS assinatura_eletronica_participantes_responsavel_pending_safe,
  ADD COLUMN contexto_tipo text NOT NULL,
  ADD COLUMN contexto_id uuid NOT NULL,
  ADD COLUMN responsavel_legal_id uuid
    REFERENCES public.responsaveis_legais(id) ON DELETE RESTRICT,
  ADD COLUMN responsavel_aluno_vinculo_id uuid
    REFERENCES public.responsaveis_legais_alunos(id) ON DELETE RESTRICT,
  ADD COLUMN coordenacao_id uuid
    REFERENCES public.professores_coordenacoes(id) ON DELETE RESTRICT,
  ADD COLUMN identidade_snapshot jsonb NOT NULL,
  ADD COLUMN vinculo_snapshot jsonb NOT NULL,
  ADD COLUMN assinado_por_auth_user_id uuid
    REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT assinatura_eletronica_participantes_papel_check
    CHECK (papel IN (
      'ALUNO',
      'RESPONSAVEL_LEGAL',
      'INSTITUICAO',
      'PROFESSOR',
      'COORDENADOR',
      'CONCEDENTE',
      'SUPERVISOR',
      'TESTEMUNHA'
    )),
  ADD CONSTRAINT assinatura_eletronica_participantes_status_check
    CHECK (status IN (
      'AGUARDANDO_ORDEM',
      'AGUARDANDO_VINCULO',
      'PENDENTE',
      'DESAFIO_PENDENTE',
      'ASSINADO',
      'RECUSADO',
      'CANCELADO'
    )),
  ADD CONSTRAINT assinatura_eletronica_participantes_unique_order
    UNIQUE (envelope_id, ordem),
  ADD CONSTRAINT assinatura_eletronica_participantes_contexto_check
    CHECK (
      contexto_tipo = papel
      AND jsonb_typeof(identidade_snapshot) = 'object'
      AND jsonb_typeof(vinculo_snapshot) = 'object'
      AND identidade_snapshot ->> 'schemaVersion' = '1'
      AND vinculo_snapshot ->> 'schemaVersion' = '1'
    ),
  ADD CONSTRAINT assinatura_eletronica_participantes_role_shape
    CHECK (
      (
        papel = 'PROFESSOR'
        AND parceiro_id IS NOT NULL
        AND contexto_id = parceiro_id
        AND coordenacao_id IS NULL
        AND responsavel_legal_id IS NULL
        AND responsavel_aluno_vinculo_id IS NULL
      )
      OR
      (
        papel = 'COORDENADOR'
        AND parceiro_id IS NOT NULL
        AND contexto_id = parceiro_id
        AND coordenacao_id IS NOT NULL
        AND responsavel_legal_id IS NULL
        AND responsavel_aluno_vinculo_id IS NULL
      )
      OR
      (
        papel = 'RESPONSAVEL_LEGAL'
        AND parceiro_id IS NULL
        AND contexto_id = responsavel_legal_id
        AND coordenacao_id IS NULL
        AND responsavel_legal_id IS NOT NULL
        AND responsavel_aluno_vinculo_id IS NOT NULL
      )
      OR papel IN ('ALUNO', 'INSTITUICAO', 'CONCEDENTE', 'SUPERVISOR', 'TESTEMUNHA')
    ),
  ADD CONSTRAINT assinatura_eletronica_participantes_signer_shape
    CHECK (
      (status = 'ASSINADO' AND assinado_por_auth_user_id IS NOT NULL)
      OR
      (status <> 'ASSINADO' AND assinado_por_auth_user_id IS NULL)
    );

CREATE INDEX assinatura_eletronica_participantes_contexto_caixa_idx
  ON public.assinatura_eletronica_participantes
    (contexto_tipo, contexto_id, status, updated_at DESC, id DESC);

CREATE INDEX assinatura_eletronica_participantes_responsavel_idx
  ON public.assinatura_eletronica_participantes (responsavel_legal_id)
  WHERE responsavel_legal_id IS NOT NULL;

CREATE INDEX assinatura_eletronica_participantes_vinculo_responsavel_idx
  ON public.assinatura_eletronica_participantes (responsavel_aluno_vinculo_id)
  WHERE responsavel_aluno_vinculo_id IS NOT NULL;

CREATE INDEX assinatura_eletronica_participantes_coordenacao_idx
  ON public.assinatura_eletronica_participantes (coordenacao_id)
  WHERE coordenacao_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Desafios de senha, artefatos e idempotência.
-- ---------------------------------------------------------------------------

ALTER TABLE public.assinatura_eletronica_desafios
  DROP CONSTRAINT IF EXISTS assinatura_eletronica_desafios_metodo_check,
  DROP CONSTRAINT IF EXISTS assinatura_eletronica_desafios_estado_check,
  DROP CONSTRAINT IF EXISTS assinatura_eletronica_desafios_verified_shape,
  ADD COLUMN actor_auth_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN auth_session_id uuid,
  ADD COLUMN perfil text,
  ADD COLUMN contexto_id uuid,
  ADD COLUMN request_id uuid,
  ADD COLUMN evidencia_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN consumido_em timestamptz,
  ADD CONSTRAINT assinatura_eletronica_desafios_metodo_check
    CHECK (metodo IN (
      'OTP',
      'PROVEDOR_EXTERNO',
      'ASSINATURA_QUALIFICADA',
      'SENHA_REAUTENTICADA'
    )),
  ADD CONSTRAINT assinatura_eletronica_desafios_estado_check
    CHECK (estado IN (
      'PENDENTE',
      'ENVIADO',
      'VERIFICADO',
      'CONSUMIDO',
      'EXPIRADO',
      'CANCELADO'
    )),
  ADD CONSTRAINT assinatura_eletronica_desafios_verified_shape
    CHECK (
      (estado IN ('VERIFICADO', 'CONSUMIDO')) = (verificado_em IS NOT NULL)
    ),
  ADD CONSTRAINT assinatura_eletronica_desafios_consumed_shape
    CHECK ((estado = 'CONSUMIDO') = (consumido_em IS NOT NULL)),
  ADD CONSTRAINT assinatura_eletronica_desafios_reauth_shape
    CHECK (
      metodo <> 'SENHA_REAUTENTICADA'
      OR (
        actor_auth_user_id IS NOT NULL
        AND auth_session_id IS NOT NULL
        AND perfil IN ('PROFESSOR', 'COORDENADOR', 'RESPONSAVEL_LEGAL')
        AND contexto_id IS NOT NULL
        AND request_id IS NOT NULL
        AND segredo_hash IS NOT NULL
        AND evidencia_hash IS NOT NULL
        AND jsonb_typeof(evidencia_snapshot) = 'object'
      )
    );

CREATE UNIQUE INDEX assinatura_eletronica_desafios_actor_request_key
  ON public.assinatura_eletronica_desafios (actor_auth_user_id, request_id)
  WHERE metodo = 'SENHA_REAUTENTICADA' AND request_id IS NOT NULL;

ALTER TABLE public.assinatura_eletronica_artefatos
  DROP CONSTRAINT IF EXISTS assinatura_eletronica_artefatos_classe_check,
  ADD CONSTRAINT assinatura_eletronica_artefatos_classe_check
    CHECK (classe IN (
      'DOCUMENTO_ORIGINAL',
      'DOCUMENTO_FINAL',
      'COMPROVANTE_EVIDENCIA'
    ));

CREATE TABLE public.assinatura_eletronica_operacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_scope text NOT NULL,
  actor_auth_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  operacao text NOT NULL CHECK (operacao IN (
    'SOLICITAR_ENVELOPE_DIARIO',
    'PREPARAR_ORIGINAL_DIARIO',
    'REGISTRAR_ORIGINAL_PUBLICAR',
    'PREPARAR_REAUTENTICACAO',
    'REGISTRAR_REAUTENTICACAO',
    'CONSUMIR_TICKET_REAUTENTICACAO',
    'INICIAR_FINALIZACAO',
    'REGISTRAR_ARTEFATO_FINALIZAR'
  )),
  request_id uuid NOT NULL,
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  resultado jsonb NOT NULL CHECK (jsonb_typeof(resultado) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assinatura_eletronica_operacoes_actor_scope_not_blank
    CHECK (btrim(actor_scope) <> ''),
  CONSTRAINT assinatura_eletronica_operacoes_unique_request
    UNIQUE (actor_scope, operacao, request_id)
);

CREATE INDEX assinatura_eletronica_operacoes_created_idx
  ON public.assinatura_eletronica_operacoes (created_at DESC, id DESC);

CREATE TABLE public.assinatura_eletronica_reauth_tentativas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  auth_session_id uuid NOT NULL,
  envelope_id uuid NOT NULL
    REFERENCES public.assinatura_eletronica_envelopes(id) ON DELETE RESTRICT,
  participante_id uuid NOT NULL
    REFERENCES public.assinatura_eletronica_participantes(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assinatura_eletronica_reauth_tentativas_request_key
    UNIQUE (actor_auth_user_id, request_id)
);

CREATE INDEX assinatura_eletronica_reauth_tentativas_window_idx
  ON public.assinatura_eletronica_reauth_tentativas
    (actor_auth_user_id, created_at DESC);

ALTER TABLE public.assinatura_eletronica_operacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinatura_eletronica_reauth_tentativas ENABLE ROW LEVEL SECURITY;

CREATE POLICY assinatura_eletronica_operacoes_client_deny
  ON public.assinatura_eletronica_operacoes
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY assinatura_eletronica_reauth_tentativas_client_deny
  ON public.assinatura_eletronica_reauth_tentativas
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.assinatura_eletronica_operacoes
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.assinatura_eletronica_reauth_tentativas
  FROM PUBLIC, anon, authenticated, service_role;

-- Mantém o bucket privado e restringe somente este bucket, sem modificar as
-- políticas permissivas ou os objetos dos demais buckets.
UPDATE storage.buckets
SET public = false,
    file_size_limit = 52428800,
    allowed_mime_types = ARRAY['application/pdf']::text[]
WHERE id = 'documentos-assinatura-eletronica';

DROP POLICY IF EXISTS assinatura_eletronica_storage_client_deny
  ON storage.objects;
CREATE POLICY assinatura_eletronica_storage_client_deny
  ON storage.objects
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (bucket_id <> 'documentos-assinatura-eletronica')
  WITH CHECK (bucket_id <> 'documentos-assinatura-eletronica');

-- Política canônica do piloto. O seed é deliberadamente incapaz de publicar
-- ou assinar: habilitada=false e jurídico pendente em todos os polos atuais.
INSERT INTO public.assinatura_eletronica_politicas (
  company_id,
  polo_id,
  documento,
  versao,
  habilitada,
  status_juridico,
  certificado,
  politica
)
SELECT
  polo.company_id,
  polo.id,
  'diario_classe',
  1,
  false,
  'PENDENTE_MATRIZ_JURIDICA',
  jsonb_build_object(
    'metodo', 'BLOQUEADO',
    'cadeiaEvidencias', false,
    'statusLabel', 'Aguardando parecer jurídico'
  ),
  jsonb_build_object(
    'documentType', 'diario_classe',
    'name', 'Diário de Classe',
    'versionLabel', 'Versão 1',
    'signatarios', jsonb_build_array(
      jsonb_build_object('role', 'PROFESSOR', 'order', 1, 'required', true),
      jsonb_build_object('role', 'COORDENADOR', 'order', 2, 'required', true)
    ),
    'editor', public.assinatura_eletronica_editor_padrao()
  )
FROM public.polos AS polo
WHERE polo.company_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.assinatura_eletronica_politicas AS politica
    WHERE politica.polo_id = polo.id
      AND politica.documento = 'diario_classe'
      AND politica.arquivada_em IS NULL
  );

-- O piloto é o único documento que poderá ser habilitado por uma decisão
-- posterior. Os demais documentos continuam aceitos somente como rascunhos
-- jurídicos desabilitados.
ALTER TABLE public.assinatura_eletronica_politicas
  DROP CONSTRAINT IF EXISTS assinatura_eletronica_politicas_documentos_bloqueados_na_fundacao,
  ADD CONSTRAINT assinatura_eletronica_politicas_documentos_habilitaveis_v1
    CHECK (
      documento = 'MODELO_PADRAO'
      OR documento = 'diario_classe'
      OR (
        habilitada IS FALSE
        AND status_juridico = 'PENDENTE_MATRIZ_JURIDICA'
      )
    ),
  ADD CONSTRAINT assinatura_eletronica_politicas_diario_signatarios_v1
    CHECK (
      documento <> 'diario_classe'
      OR politica -> 'signatarios' = jsonb_build_array(
        jsonb_build_object('role', 'PROFESSOR', 'order', 1, 'required', true),
        jsonb_build_object('role', 'COORDENADOR', 'order', 2, 'required', true)
      )
    );

ALTER TABLE public.assinatura_eletronica_eventos
  DROP CONSTRAINT IF EXISTS assinatura_eletronica_eventos_tipo_check,
  ADD CONSTRAINT assinatura_eletronica_eventos_tipo_check
    CHECK (tipo IN (
      'ENVELOPE_CRIADO',
      'PARTICIPANTE_ADICIONADO',
      'AGUARDANDO_VINCULO_SEGURO',
      'DOCUMENTO_ORIGINAL_CONGELADO',
      'ENVELOPE_PUBLICADO',
      'PARTICIPANTE_LIBERADO',
      'REAUTENTICACAO_PREPARADA',
      'DESAFIO_CRIADO',
      'DESAFIO_VERIFICADO',
      'ASSINATURA_CONCLUIDA',
      'FINALIZACAO_INICIADA',
      'DOCUMENTO_FINAL_REGISTRADO',
      'COMPROVANTE_REGISTRADO',
      'ENVELOPE_ASSINADO',
      'ASSINATURA_BLOQUEADA_FUNDACAO',
      'ENVELOPE_CANCELADO',
      'ENVELOPE_EXPIRADO',
      'ENVELOPE_SUBSTITUIDO'
    ));

-- ---------------------------------------------------------------------------
-- 4. Funções internas comuns. Nenhuma delas é executável pela API.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_sha256_json(p_payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $function$
  SELECT pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(p_payload::text, 'UTF8'), 'sha256'),
    'hex'
  );
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_snapshot_academico_diario_valido(
  p_snapshot jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $function$
DECLARE
  v_aula jsonb;
  v_sessao jsonb;
  v_aluno jsonb;
  v_campo_capa jsonb;
  v_presencas jsonb;
  v_resultado jsonb;
  v_aluno_id text;
  v_aula_id text;
  v_sessao_id text;
  v_grade_key text;
  v_student_ids text[] := ARRAY[]::text[];
  v_lesson_ids text[] := ARRAY[]::text[];
  v_session_ids text[] := ARRAY[]::text[];
  v_periodos text[];
  v_total_sessoes integer := 0;
  v_session_hours numeric;
  v_total_hours numeric := 0;
  v_faltas integer;
  v_horas_falta numeric;
  v_frequencia_esperada numeric;
  v_data_aula date;
  v_data_anterior date;
  v_ordem_periodo integer;
  v_ordem_periodo_anterior integer;
BEGIN
  IF jsonb_typeof(p_snapshot) <> 'object'
     OR pg_catalog.octet_length(p_snapshot::text) > 4194304
     OR NOT (p_snapshot ?& ARRAY[
       'schemaVersion', 'composerSchemaVersion', 'documentType', 'source',
       'template', 'templateSource', 'turma', 'disciplina', 'moduloNome',
       'students', 'aulas', 'attendanceMap', 'gradesMap', 'praticasMap',
       'observacoes', 'activeInstruments', 'exportMode', 'validationCode',
       'validationPreview', 'institutionalIdentity', 'assetSources', 'closure', 'generatedAt'
     ]::text[])
     OR p_snapshot - ARRAY[
       'schemaVersion', 'composerSchemaVersion', 'documentType', 'source',
       'template', 'templateSource', 'turma', 'disciplina', 'moduloNome',
       'students', 'aulas', 'attendanceMap', 'gradesMap', 'praticasMap',
       'observacoes', 'activeInstruments', 'exportMode', 'validationCode',
       'validationPreview', 'institutionalIdentity', 'assetSources', 'closure', 'generatedAt'
     ]::text[] <> '{}'::jsonb
     OR jsonb_typeof(p_snapshot -> 'schemaVersion') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_snapshot -> 'composerSchemaVersion') IS DISTINCT FROM 'number'
     OR p_snapshot ->> 'schemaVersion' <> '2'
     OR p_snapshot ->> 'composerSchemaVersion' <> '1'
     OR p_snapshot ->> 'documentType' <> 'diario_classe'
     OR p_snapshot ->> 'exportMode' <> 'PREENCHIDO'
     OR p_snapshot -> 'validationPreview' <> 'false'::jsonb
     OR jsonb_typeof(p_snapshot -> 'source') IS DISTINCT FROM 'object'
     OR NOT (p_snapshot -> 'source' ?& ARRAY[
       'type', 'turmaId', 'disciplinaId', 'originVersion', 'courseId',
       'poloId', 'companyId', 'academicRevisionSha256'
     ]::text[])
     OR (p_snapshot -> 'source') - ARRAY[
       'type', 'turmaId', 'disciplinaId', 'originVersion', 'courseId',
       'poloId', 'companyId', 'academicRevisionSha256'
     ]::text[] <> '{}'::jsonb
     OR p_snapshot -> 'source' ->> 'type' <> 'DIARIO'
     OR EXISTS (
       SELECT 1
       FROM jsonb_each(p_snapshot -> 'source') AS source_field(key, value)
       WHERE source_field.key IN ('turmaId', 'disciplinaId', 'courseId', 'poloId', 'companyId')
         AND (
           jsonb_typeof(source_field.value) IS DISTINCT FROM 'string'
           OR source_field.value #>> '{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         )
     )
     OR jsonb_typeof(p_snapshot -> 'source' -> 'originVersion') IS DISTINCT FROM 'number'
     OR p_snapshot -> 'source' ->> 'originVersion' !~ '^[0-9]+$'
     OR (p_snapshot -> 'source' ->> 'originVersion')::integer NOT BETWEEN 1 AND 1000000
     OR coalesce(p_snapshot -> 'source' ->> 'academicRevisionSha256', '') !~ '^[0-9a-f]{64}$'
     OR p_snapshot -> 'source' ->> 'academicRevisionSha256' IS DISTINCT FROM
       public.assinatura_eletronica_sha256_json(jsonb_build_object(
         'students', p_snapshot -> 'students',
         'aulas', p_snapshot -> 'aulas',
         'attendanceMap', p_snapshot -> 'attendanceMap',
         'gradesMap', p_snapshot -> 'gradesMap',
         'praticasMap', p_snapshot -> 'praticasMap',
         'observacoes', p_snapshot -> 'observacoes',
         'activeInstruments', p_snapshot -> 'activeInstruments',
         'closure', p_snapshot -> 'closure'
       ))
     OR jsonb_typeof(p_snapshot -> 'template') IS DISTINCT FROM 'object'
     OR NOT (p_snapshot -> 'template' ?& ARRAY[
       'capaUrl', 'contracapaUrl', 'cabecalhoLogoUrl', 'rodape',
       'imprimirInstrucoes', 'capaCampos', 'imprimirValidacaoContracapa',
       'mensagemValidacao', 'qrCodeSize'
     ]::text[])
     OR (p_snapshot -> 'template') - ARRAY[
       'capaUrl', 'contracapaUrl', 'cabecalhoLogoUrl', 'rodape',
       'imprimirInstrucoes', 'capaCampos', 'imprimirValidacaoContracapa',
       'mensagemValidacao', 'qrCodeSize'
     ]::text[] <> '{}'::jsonb
     OR jsonb_typeof(p_snapshot -> 'template' -> 'rodape') IS DISTINCT FROM 'string'
     OR btrim(p_snapshot -> 'template' ->> 'rodape') = ''
     OR char_length(p_snapshot -> 'template' ->> 'rodape') > 300
     OR jsonb_typeof(p_snapshot -> 'template' -> 'imprimirInstrucoes') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(p_snapshot -> 'template' -> 'imprimirValidacaoContracapa') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(p_snapshot -> 'template' -> 'mensagemValidacao') IS DISTINCT FROM 'string'
     OR btrim(p_snapshot -> 'template' ->> 'mensagemValidacao') = ''
     OR char_length(p_snapshot -> 'template' ->> 'mensagemValidacao') > 2000
     OR jsonb_typeof(p_snapshot -> 'template' -> 'qrCodeSize') IS DISTINCT FROM 'number'
     OR (p_snapshot -> 'template' ->> 'qrCodeSize')::numeric NOT BETWEEN 16 AND 50
     OR jsonb_typeof(p_snapshot -> 'templateSource') IS DISTINCT FROM 'object'
     OR NOT (p_snapshot -> 'templateSource' ?& ARRAY[
       'id', 'updatedAt', 'version', 'raw', 'sha256'
     ]::text[])
     OR (p_snapshot -> 'templateSource') - ARRAY[
       'id', 'updatedAt', 'version', 'raw', 'sha256'
     ]::text[] <> '{}'::jsonb
     OR jsonb_typeof(p_snapshot -> 'templateSource' -> 'updatedAt') IS DISTINCT FROM 'string'
     OR coalesce(p_snapshot -> 'templateSource' ->> 'updatedAt', '')
       !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
     OR (p_snapshot -> 'templateSource' ->> 'updatedAt')::timestamptz IS NULL
     OR jsonb_typeof(p_snapshot -> 'templateSource' -> 'version') IS DISTINCT FROM 'number'
     OR p_snapshot -> 'templateSource' ->> 'version' !~ '^[0-9]+$'
     OR (p_snapshot -> 'templateSource' ->> 'version')::integer NOT BETWEEN 1 AND 1000000
     OR coalesce(p_snapshot -> 'templateSource' ->> 'sha256', '') !~ '^[0-9a-f]{64}$'
     OR p_snapshot -> 'templateSource' ->> 'sha256' IS DISTINCT FROM
       public.assinatura_eletronica_sha256_json(p_snapshot -> 'templateSource' -> 'raw')
     OR jsonb_typeof(p_snapshot -> 'turma') IS DISTINCT FROM 'object'
     OR NOT ((p_snapshot -> 'turma') ?& ARRAY['id', 'cursoNome', 'nome', 'codigo']::text[])
     OR (p_snapshot -> 'turma') - ARRAY['id', 'cursoNome', 'nome', 'codigo']::text[] <> '{}'::jsonb
     OR p_snapshot -> 'turma' ->> 'id' IS DISTINCT FROM p_snapshot -> 'source' ->> 'turmaId'
     OR EXISTS (
       SELECT 1
       FROM jsonb_each(p_snapshot -> 'turma') AS turma_field(key, value)
       WHERE jsonb_typeof(turma_field.value) IS DISTINCT FROM 'string'
         OR btrim(turma_field.value #>> '{}') = ''
         OR char_length(turma_field.value #>> '{}') > 300
     )
     OR jsonb_typeof(p_snapshot -> 'disciplina') IS DISTINCT FROM 'object'
     OR NOT ((p_snapshot -> 'disciplina') ?& ARRAY['id', 'nome', 'professor', 'cargaHoraria']::text[])
     OR (p_snapshot -> 'disciplina') - ARRAY['id', 'nome', 'professor', 'cargaHoraria']::text[] <> '{}'::jsonb
     OR p_snapshot -> 'disciplina' ->> 'id' IS DISTINCT FROM p_snapshot -> 'source' ->> 'disciplinaId'
     OR p_snapshot -> 'disciplina' ->> 'id'
       !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR jsonb_typeof(p_snapshot -> 'disciplina' -> 'nome') IS DISTINCT FROM 'string'
     OR btrim(p_snapshot -> 'disciplina' ->> 'nome') = ''
     OR char_length(p_snapshot -> 'disciplina' ->> 'nome') > 300
     OR jsonb_typeof(p_snapshot -> 'disciplina' -> 'professor') IS DISTINCT FROM 'string'
     OR btrim(p_snapshot -> 'disciplina' ->> 'professor') = ''
     OR char_length(p_snapshot -> 'disciplina' ->> 'professor') > 300
     OR jsonb_typeof(p_snapshot -> 'disciplina' -> 'cargaHoraria') IS DISTINCT FROM 'number'
     OR (p_snapshot -> 'disciplina' ->> 'cargaHoraria')::numeric NOT BETWEEN 0.01 AND 100000
     OR jsonb_typeof(p_snapshot -> 'moduloNome') IS DISTINCT FROM 'string'
     OR btrim(p_snapshot ->> 'moduloNome') = ''
     OR char_length(p_snapshot ->> 'moduloNome') > 240
     OR jsonb_typeof(p_snapshot -> 'observacoes') IS DISTINCT FROM 'string'
     OR char_length(p_snapshot ->> 'observacoes') > 20000
     OR jsonb_typeof(p_snapshot -> 'generatedAt') IS DISTINCT FROM 'string'
     OR coalesce(p_snapshot ->> 'generatedAt', '')
       !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
     OR (p_snapshot ->> 'generatedAt')::timestamptz IS NULL
     OR jsonb_typeof(p_snapshot -> 'students') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_snapshot -> 'students') = 0
     OR jsonb_array_length(p_snapshot -> 'students') > 2000
     OR jsonb_typeof(p_snapshot -> 'aulas') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_snapshot -> 'aulas') = 0
     OR jsonb_array_length(p_snapshot -> 'aulas') > 1000
     OR jsonb_typeof(p_snapshot -> 'attendanceMap') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_snapshot -> 'gradesMap') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_snapshot -> 'praticasMap') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_snapshot -> 'activeInstruments') IS DISTINCT FROM 'object'
     OR (p_snapshot -> 'activeInstruments') - ARRAY['p', 'ti', 'tg', 's', 'cq', 'o']::text[] <> '{}'::jsonb
     OR NOT ((p_snapshot -> 'activeInstruments') ?& ARRAY['p', 'ti', 'tg', 's', 'cq', 'o']::text[])
     OR EXISTS (
       SELECT 1 FROM jsonb_each(p_snapshot -> 'activeInstruments') AS instrumento
       WHERE jsonb_typeof(instrumento.value) IS DISTINCT FROM 'boolean'
     )
     OR jsonb_typeof(p_snapshot -> 'institutionalIdentity') IS DISTINCT FROM 'object'
     OR (p_snapshot -> 'institutionalIdentity') - ARRAY[
       'institution', 'logoUrl', 'watermarkUrl'
     ]::text[] <> '{}'::jsonb
     OR NOT (p_snapshot -> 'institutionalIdentity' ?& ARRAY[
       'institution', 'logoUrl', 'watermarkUrl'
     ]::text[])
     OR jsonb_typeof(p_snapshot -> 'institutionalIdentity' -> 'institution') IS DISTINCT FROM 'object'
     OR (p_snapshot -> 'institutionalIdentity' -> 'institution') - ARRAY[
       'name', 'legalName', 'cnpj', 'address', 'number', 'complement',
       'neighborhood', 'city', 'state', 'postalCode', 'phone', 'email',
       'isHeadquarters'
     ]::text[] <> '{}'::jsonb
     OR NOT (p_snapshot -> 'institutionalIdentity' -> 'institution' ?& ARRAY[
       'name', 'legalName', 'cnpj', 'address', 'number', 'complement',
       'neighborhood', 'city', 'state', 'postalCode', 'phone', 'email',
       'isHeadquarters'
     ]::text[])
     OR EXISTS (
       SELECT 1
       FROM jsonb_each(p_snapshot -> 'institutionalIdentity' -> 'institution') AS institution_field(key, value)
       WHERE institution_field.key <> 'isHeadquarters'
         AND (
           jsonb_typeof(institution_field.value) IS DISTINCT FROM 'string'
           OR char_length(institution_field.value #>> '{}') > 300
           OR (
             institution_field.key NOT IN ('legalName', 'complement')
             AND btrim(institution_field.value #>> '{}') = ''
           )
         )
     )
     OR jsonb_typeof(p_snapshot -> 'institutionalIdentity' -> 'institution' -> 'isHeadquarters')
       IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(p_snapshot -> 'assetSources') IS DISTINCT FROM 'object'
     OR NOT (p_snapshot -> 'assetSources' ?& ARRAY[
       'coverUrl', 'backCoverUrl', 'headerLogoUrl', 'watermarkUrl'
     ]::text[])
     OR (p_snapshot -> 'assetSources') - ARRAY[
       'coverUrl', 'backCoverUrl', 'headerLogoUrl', 'watermarkUrl'
     ]::text[] <> '{}'::jsonb
     OR jsonb_typeof(p_snapshot -> 'closure') IS DISTINCT FROM 'object'
     OR NOT (p_snapshot -> 'closure' ?& ARRAY[
       'lock', 'hoursCompleted', 'requiredHours', 'snapshotAt'
     ]::text[])
     OR (p_snapshot -> 'closure') - ARRAY[
       'lock', 'hoursCompleted', 'requiredHours', 'snapshotAt'
     ]::text[] <> '{}'::jsonb
     OR p_snapshot -> 'closure' ->> 'lock' <> 'PROFESSOR'
     OR jsonb_typeof(p_snapshot -> 'closure' -> 'hoursCompleted') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_snapshot -> 'closure' -> 'requiredHours') IS DISTINCT FROM 'number'
     OR (p_snapshot -> 'closure' ->> 'hoursCompleted')::numeric NOT BETWEEN 0 AND 100000
     OR (p_snapshot -> 'closure' ->> 'requiredHours')::numeric NOT BETWEEN 0.01 AND 100000
     OR (p_snapshot -> 'closure' ->> 'hoursCompleted')::numeric
       < (p_snapshot -> 'closure' ->> 'requiredHours')::numeric
     OR (p_snapshot -> 'disciplina' ->> 'cargaHoraria')::numeric
       <> (p_snapshot -> 'closure' ->> 'requiredHours')::numeric
     OR jsonb_typeof(p_snapshot -> 'closure' -> 'snapshotAt') IS DISTINCT FROM 'string'
     OR coalesce(p_snapshot -> 'closure' ->> 'snapshotAt', '')
       !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
     OR (p_snapshot -> 'closure' ->> 'snapshotAt')::timestamptz
       IS DISTINCT FROM (p_snapshot ->> 'generatedAt')::timestamptz
     OR p_snapshot -> 'closure' ->> 'snapshotAt' IS DISTINCT FROM p_snapshot ->> 'generatedAt'
     OR jsonb_typeof(p_snapshot -> 'templateSource' -> 'raw') IS DISTINCT FROM 'object'
     OR pg_catalog.octet_length((p_snapshot -> 'templateSource' -> 'raw')::text) > 262144
     OR jsonb_typeof(p_snapshot -> 'templateSource' -> 'id') IS DISTINCT FROM 'string'
     OR btrim(p_snapshot -> 'templateSource' ->> 'id') = ''
     OR char_length(p_snapshot -> 'templateSource' ->> 'id') > 200
     OR jsonb_typeof(p_snapshot -> 'validationCode') IS DISTINCT FROM 'string'
     OR coalesce(p_snapshot ->> 'validationCode', '') !~ '^[A-Z0-9][A-Z0-9-]{7,127}$'
     OR (
       p_snapshot -> 'assetSources' -> 'coverUrl' IS DISTINCT FROM 'null'::jsonb
       AND (
         jsonb_typeof(p_snapshot -> 'assetSources' -> 'coverUrl') IS DISTINCT FROM 'string'
         OR p_snapshot -> 'assetSources' ->> 'coverUrl' !~ '^https://[^/?#@]+(/[^?#]*)?$'
       )
     )
     OR jsonb_typeof(p_snapshot -> 'assetSources' -> 'headerLogoUrl') IS DISTINCT FROM 'string'
     OR p_snapshot -> 'assetSources' ->> 'headerLogoUrl' !~ '^https://[^/?#@]+(/[^?#]*)?$'
     OR (
       p_snapshot -> 'assetSources' -> 'backCoverUrl' IS DISTINCT FROM 'null'::jsonb
       AND (
         jsonb_typeof(p_snapshot -> 'assetSources' -> 'backCoverUrl') IS DISTINCT FROM 'string'
         OR p_snapshot -> 'assetSources' ->> 'backCoverUrl' !~ '^https://[^/?#@]+(/[^?#]*)?$'
       )
     )
     OR (
       p_snapshot -> 'assetSources' -> 'watermarkUrl' IS DISTINCT FROM 'null'::jsonb
       AND (
         jsonb_typeof(p_snapshot -> 'assetSources' -> 'watermarkUrl') IS DISTINCT FROM 'string'
         OR p_snapshot -> 'assetSources' ->> 'watermarkUrl' !~ '^https://[^/?#@]+(/[^?#]*)?$'
       )
     )
     OR p_snapshot -> 'assetSources' -> 'coverUrl'
       IS DISTINCT FROM p_snapshot -> 'template' -> 'capaUrl'
     OR p_snapshot -> 'assetSources' -> 'backCoverUrl'
       IS DISTINCT FROM p_snapshot -> 'template' -> 'contracapaUrl'
     OR p_snapshot -> 'assetSources' -> 'headerLogoUrl'
       IS DISTINCT FROM p_snapshot -> 'institutionalIdentity' -> 'logoUrl'
     OR p_snapshot -> 'assetSources' -> 'watermarkUrl'
       IS DISTINCT FROM p_snapshot -> 'institutionalIdentity' -> 'watermarkUrl'
     OR p_snapshot -> 'template' -> 'cabecalhoLogoUrl'
       IS DISTINCT FROM p_snapshot -> 'institutionalIdentity' -> 'logoUrl'
     OR p_snapshot::text ~* '(data:image/|[?&](token|signature|x-amz-signature|x-goog-signature)=|/object/sign/)'
  THEN
    RETURN false;
  END IF;

  IF jsonb_typeof(p_snapshot -> 'template' -> 'capaCampos') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_snapshot -> 'template' -> 'capaCampos') <> 6
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(p_snapshot -> 'template' -> 'capaCampos') AS campo
       WHERE jsonb_typeof(campo) IS DISTINCT FROM 'object'
          OR NOT (campo ?& ARRAY[
            'id', 'label', 'x', 'y', 'width', 'fontSize', 'visible', 'color', 'bold'
          ]::text[])
          OR campo - ARRAY[
            'id', 'label', 'x', 'y', 'width', 'fontSize', 'visible', 'color',
            'bold', 'borderTop', 'align'
          ]::text[] <> '{}'::jsonb
          OR campo ->> 'id' NOT IN ('curso', 'modulo', 'areaTematica', 'disciplina', 'turma', 'professor')
          OR jsonb_typeof(campo -> 'label') IS DISTINCT FROM 'string'
          OR char_length(campo ->> 'label') > 100
          OR jsonb_typeof(campo -> 'x') IS DISTINCT FROM 'number'
          OR (campo ->> 'x')::numeric NOT BETWEEN 0 AND 100
          OR jsonb_typeof(campo -> 'y') IS DISTINCT FROM 'number'
          OR (campo ->> 'y')::numeric NOT BETWEEN 0 AND 100
          OR jsonb_typeof(campo -> 'width') IS DISTINCT FROM 'number'
          OR (campo ->> 'width')::numeric NOT BETWEEN 1 AND 100
          OR jsonb_typeof(campo -> 'fontSize') IS DISTINCT FROM 'number'
          OR (campo ->> 'fontSize')::numeric NOT BETWEEN 4 AND 24
          OR jsonb_typeof(campo -> 'visible') IS DISTINCT FROM 'boolean'
          OR jsonb_typeof(campo -> 'bold') IS DISTINCT FROM 'boolean'
          OR jsonb_typeof(campo -> 'color') IS DISTINCT FROM 'string'
          OR campo ->> 'color' !~* '^#[0-9a-f]{6}$'
          OR (campo ? 'borderTop' AND jsonb_typeof(campo -> 'borderTop') IS DISTINCT FROM 'boolean')
          OR (
            campo ? 'align'
            AND (
              jsonb_typeof(campo -> 'align') IS DISTINCT FROM 'string'
              OR campo ->> 'align' NOT IN ('left', 'center', 'right')
            )
          )
     )
     OR (
       SELECT count(DISTINCT campo ->> 'id')
       FROM jsonb_array_elements(p_snapshot -> 'template' -> 'capaCampos') AS campo
     ) <> 6
  THEN
    RETURN false;
  END IF;

  FOR v_aluno IN SELECT value FROM jsonb_array_elements(p_snapshot -> 'students') LOOP
    IF jsonb_typeof(v_aluno) IS DISTINCT FROM 'object'
       OR v_aluno - ARRAY['id', 'nome', 'matricula']::text[] <> '{}'::jsonb
       OR NOT (v_aluno ?& ARRAY['id', 'nome', 'matricula']::text[])
       OR jsonb_typeof(v_aluno -> 'id') IS DISTINCT FROM 'string'
       OR v_aluno ->> 'id'
         !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR jsonb_typeof(v_aluno -> 'nome') IS DISTINCT FROM 'string'
       OR btrim(v_aluno ->> 'nome') = ''
       OR char_length(v_aluno ->> 'nome') > 300
       OR jsonb_typeof(v_aluno -> 'matricula') IS DISTINCT FROM 'string'
       OR btrim(v_aluno ->> 'matricula') = ''
       OR char_length(v_aluno ->> 'matricula') > 100
    THEN
      RETURN false;
    END IF;
    v_aluno_id := v_aluno ->> 'id';
    IF v_aluno_id = ANY(v_student_ids) THEN
      RETURN false;
    END IF;
    v_student_ids := array_append(v_student_ids, v_aluno_id);
  END LOOP;

  FOR v_aula IN SELECT value FROM jsonb_array_elements(p_snapshot -> 'aulas') LOOP
    IF jsonb_typeof(v_aula) IS DISTINCT FROM 'object'
       OR v_aula - ARRAY['id', 'titulo', 'cargaHoraria', 'dataSource', 'sessoes']::text[] <> '{}'::jsonb
       OR NOT (v_aula ?& ARRAY['id', 'titulo', 'cargaHoraria', 'dataSource', 'sessoes']::text[])
       OR jsonb_typeof(v_aula -> 'id') IS DISTINCT FROM 'string'
       OR v_aula ->> 'id'
         !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR jsonb_typeof(v_aula -> 'titulo') IS DISTINCT FROM 'string'
       OR btrim(v_aula ->> 'titulo') = ''
       OR char_length(v_aula ->> 'titulo') > 2000
       OR jsonb_typeof(v_aula -> 'cargaHoraria') IS DISTINCT FROM 'number'
       OR (v_aula ->> 'cargaHoraria')::numeric NOT BETWEEN 0.01 AND 1000
       OR jsonb_typeof(v_aula -> 'dataSource') IS DISTINCT FROM 'string'
       OR coalesce(v_aula ->> 'dataSource', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       OR jsonb_typeof(v_aula -> 'sessoes') IS DISTINCT FROM 'array'
       OR jsonb_array_length(v_aula -> 'sessoes') = 0
       OR jsonb_array_length(v_aula -> 'sessoes') > 8
    THEN
      RETURN false;
    END IF;

    v_aula_id := v_aula ->> 'id';
    v_data_aula := (v_aula ->> 'dataSource')::date;
    IF v_data_aula::text IS DISTINCT FROM v_aula ->> 'dataSource'
       OR (v_data_anterior IS NOT NULL AND v_data_aula <= v_data_anterior)
       OR v_aula_id = ANY(v_lesson_ids)
    THEN
      RETURN false;
    END IF;
    v_data_anterior := v_data_aula;
    v_lesson_ids := array_append(v_lesson_ids, v_aula_id);
    v_session_hours := 0;
    v_periodos := ARRAY[]::text[];
    v_ordem_periodo_anterior := 0;

    FOR v_sessao IN SELECT value FROM jsonb_array_elements(v_aula -> 'sessoes') LOOP
      IF jsonb_typeof(v_sessao) IS DISTINCT FROM 'object'
         OR v_sessao - ARRAY['id', 'periodo', 'cargaHoraria']::text[] <> '{}'::jsonb
         OR NOT (v_sessao ?& ARRAY['id', 'periodo', 'cargaHoraria']::text[])
         OR jsonb_typeof(v_sessao -> 'id') IS DISTINCT FROM 'string'
         OR v_sessao ->> 'id'
           !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR jsonb_typeof(v_sessao -> 'periodo') IS DISTINCT FROM 'string'
         OR v_sessao ->> 'periodo' NOT IN ('M', 'T', 'N', 'U')
         OR jsonb_typeof(v_sessao -> 'cargaHoraria') IS DISTINCT FROM 'number'
         OR (v_sessao ->> 'cargaHoraria')::numeric NOT BETWEEN 0.01 AND 1000
      THEN
        RETURN false;
      END IF;
      v_sessao_id := v_sessao ->> 'id';
      v_ordem_periodo := CASE v_sessao ->> 'periodo'
        WHEN 'M' THEN 1 WHEN 'T' THEN 2 WHEN 'N' THEN 3 WHEN 'U' THEN 4
      END;
      IF v_sessao_id = ANY(v_session_ids)
         OR v_sessao ->> 'periodo' = ANY(v_periodos)
         OR v_ordem_periodo < v_ordem_periodo_anterior
         OR (
           jsonb_array_length(v_aula -> 'sessoes') > 1
           AND v_sessao ->> 'periodo' = 'U'
         )
      THEN
        RETURN false;
      END IF;
      v_session_ids := array_append(v_session_ids, v_sessao_id);
      v_periodos := array_append(v_periodos, v_sessao ->> 'periodo');
      v_ordem_periodo_anterior := v_ordem_periodo;
      v_session_hours := v_session_hours + (v_sessao ->> 'cargaHoraria')::numeric;
    END LOOP;

    IF v_session_hours IS DISTINCT FROM (v_aula ->> 'cargaHoraria')::numeric THEN
      RETURN false;
    END IF;
    v_total_sessoes := v_total_sessoes + jsonb_array_length(v_aula -> 'sessoes');
    v_total_hours := v_total_hours + v_session_hours;
  END LOOP;

  IF v_total_sessoes > 5000 OR v_total_hours <= 0
     OR (SELECT count(*) FROM jsonb_object_keys(p_snapshot -> 'attendanceMap')) <> cardinality(v_student_ids)
     OR (SELECT count(*) FROM jsonb_object_keys(p_snapshot -> 'gradesMap')) <> cardinality(v_student_ids)
     OR (SELECT count(*) FROM jsonb_object_keys(p_snapshot -> 'praticasMap')) <> cardinality(v_lesson_ids)
  THEN
    RETURN false;
  END IF;

  FOREACH v_aula_id IN ARRAY v_lesson_ids LOOP
    IF NOT ((p_snapshot -> 'praticasMap') ? v_aula_id)
       OR jsonb_typeof(p_snapshot -> 'praticasMap' -> v_aula_id) IS DISTINCT FROM 'string'
       OR btrim(p_snapshot -> 'praticasMap' ->> v_aula_id) = ''
       OR char_length(p_snapshot -> 'praticasMap' ->> v_aula_id) > 10000
    THEN
      RETURN false;
    END IF;
  END LOOP;

  FOREACH v_aluno_id IN ARRAY v_student_ids LOOP
    IF NOT ((p_snapshot -> 'attendanceMap') ? v_aluno_id)
       OR NOT ((p_snapshot -> 'gradesMap') ? v_aluno_id)
       OR jsonb_typeof(p_snapshot -> 'attendanceMap' -> v_aluno_id) IS DISTINCT FROM 'object'
       OR jsonb_typeof(p_snapshot -> 'gradesMap' -> v_aluno_id) IS DISTINCT FROM 'object'
    THEN
      RETURN false;
    END IF;
    v_presencas := p_snapshot -> 'attendanceMap' -> v_aluno_id;
    v_resultado := p_snapshot -> 'gradesMap' -> v_aluno_id;
    IF (SELECT count(*) FROM jsonb_object_keys(v_presencas)) <> cardinality(v_session_ids)
       OR EXISTS (
         SELECT 1 FROM jsonb_each(v_presencas) AS presenca(key, value)
         WHERE NOT (presenca.key = ANY(v_session_ids))
            OR jsonb_typeof(presenca.value) IS DISTINCT FROM 'string'
            OR presenca.value #>> '{}' NOT IN ('P', 'F', 'J')
       )
       OR NOT (v_resultado ?& ARRAY[
         'p', 'ti', 'tg', 's', 'cq', 'o', 'rec', 'total_aulas', 'total_faltas',
         'frequencia_percent', 'media_parcial', 'media_final', 'resultado_final'
       ]::text[])
       OR v_resultado - ARRAY[
         'p', 'ti', 'tg', 's', 'cq', 'o', 'rec', 'total_aulas', 'total_faltas',
         'frequencia_percent', 'media_parcial', 'media_final', 'resultado_final'
       ]::text[] <> '{}'::jsonb
       OR jsonb_typeof(v_resultado -> 'total_aulas') IS DISTINCT FROM 'number'
       OR v_resultado ->> 'total_aulas' !~ '^[0-9]+$'
       OR (v_resultado ->> 'total_aulas')::integer <> cardinality(v_session_ids)
       OR jsonb_typeof(v_resultado -> 'total_faltas') IS DISTINCT FROM 'number'
       OR v_resultado ->> 'total_faltas' !~ '^[0-9]+$'
       OR (v_resultado ->> 'total_faltas')::integer NOT BETWEEN 0 AND 5000
       OR jsonb_typeof(v_resultado -> 'frequencia_percent') IS DISTINCT FROM 'number'
       OR (v_resultado ->> 'frequencia_percent')::numeric NOT BETWEEN 0 AND 100
       OR jsonb_typeof(v_resultado -> 'resultado_final') IS DISTINCT FROM 'string'
       OR v_resultado ->> 'resultado_final' NOT IN (
         'APROVEITADO', 'SEM_LANCAMENTO', 'FREQUENCIA_PENDENTE',
         'REPROVADO_FREQUENCIA', 'APROVADO', 'EM_RECUPERACAO', 'REPROVADO'
       )
    THEN
      RETURN false;
    END IF;

    FOREACH v_grade_key IN ARRAY ARRAY[
      'p', 'ti', 'tg', 's', 'cq', 'o', 'rec', 'media_parcial', 'media_final'
    ]::text[] LOOP
      IF jsonb_typeof(v_resultado -> v_grade_key) NOT IN ('number', 'null')
         OR (
           jsonb_typeof(v_resultado -> v_grade_key) = 'number'
           AND (v_resultado ->> v_grade_key)::numeric NOT BETWEEN 0 AND 10
         )
      THEN
        RETURN false;
      END IF;
    END LOOP;

    IF v_resultado ->> 'resultado_final' <> 'APROVEITADO' THEN
      FOREACH v_grade_key IN ARRAY ARRAY['p', 'ti', 'tg', 's', 'cq', 'o']::text[] LOOP
        IF (
          (p_snapshot -> 'activeInstruments' ->> v_grade_key)::boolean
          AND v_resultado -> v_grade_key = 'null'::jsonb
        ) OR (
          NOT (p_snapshot -> 'activeInstruments' ->> v_grade_key)::boolean
          AND v_resultado -> v_grade_key <> 'null'::jsonb
        ) THEN
          RETURN false;
        END IF;
      END LOOP;
    END IF;

    SELECT
      count(*) FILTER (WHERE v_presencas ->> (sessao ->> 'id') = 'F'),
      coalesce(sum(
        CASE WHEN v_presencas ->> (sessao ->> 'id') = 'F'
          THEN (sessao ->> 'cargaHoraria')::numeric ELSE 0 END
      ), 0)
    INTO v_faltas, v_horas_falta
    FROM jsonb_array_elements(p_snapshot -> 'aulas') AS aula
    CROSS JOIN LATERAL jsonb_array_elements(aula -> 'sessoes') AS sessao;
    v_frequencia_esperada := round(((v_total_hours - v_horas_falta) / v_total_hours) * 100, 2);
    IF (v_resultado ->> 'total_faltas')::integer <> v_faltas
       OR abs((v_resultado ->> 'frequencia_percent')::numeric - v_frequencia_esperada) > 0.011
    THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
EXCEPTION WHEN others THEN
  RETURN false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_manifesto_diario_valido(
  p_manifest jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $function$
DECLARE
  v_page_count integer;
  v_target_page_index integer;
  v_instructions_page_index integer;
BEGIN
  IF jsonb_typeof(p_manifest) <> 'object'
     OR NOT (p_manifest ?& ARRAY[
       'schemaVersion', 'source', 'semanticTarget', 'pageCount',
       'targetPageIndex', 'instructionsPageIndex'
     ]::text[])
     OR p_manifest - ARRAY[
       'schemaVersion', 'source', 'semanticTarget', 'pageCount',
       'targetPageIndex', 'instructionsPageIndex'
     ]::text[] <> '{}'::jsonb
     OR p_manifest ->> 'schemaVersion' <> '1'
     OR p_manifest ->> 'source' <> 'UNIVERSO_DIARIO_PDF_V1'
     OR p_manifest ->> 'semanticTarget' <> 'DIARIO_LAST_CONTENT_PAGE'
     OR jsonb_typeof(p_manifest -> 'pageCount') <> 'number'
     OR p_manifest ->> 'pageCount' !~ '^[0-9]+$'
     OR jsonb_typeof(p_manifest -> 'targetPageIndex') <> 'number'
     OR p_manifest ->> 'targetPageIndex' !~ '^[0-9]+$'
     OR jsonb_typeof(coalesce(p_manifest -> 'instructionsPageIndex', 'null'::jsonb)) NOT IN ('number', 'null')
     OR (
       p_manifest -> 'instructionsPageIndex' <> 'null'::jsonb
       AND p_manifest ->> 'instructionsPageIndex' !~ '^[0-9]+$'
     )
  THEN
    RETURN false;
  END IF;

  v_page_count := (p_manifest ->> 'pageCount')::integer;
  v_target_page_index := (p_manifest ->> 'targetPageIndex')::integer;
  v_instructions_page_index := CASE
    WHEN p_manifest -> 'instructionsPageIndex' = 'null'::jsonb THEN NULL
    ELSE (p_manifest ->> 'instructionsPageIndex')::integer
  END;

  RETURN v_page_count BETWEEN 1 AND 500
    AND v_target_page_index BETWEEN 0 AND v_page_count - 1
    AND (
      (v_instructions_page_index IS NULL AND v_target_page_index = v_page_count - 1)
      OR
      (v_instructions_page_index = v_page_count - 1 AND v_target_page_index = v_page_count - 2)
    );
EXCEPTION WHEN others THEN
  RETURN false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_target_diario_valido(
  p_target jsonb,
  p_manifest jsonb,
  p_original_sha256 text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $function$
DECLARE
  v_target_page jsonb;
  v_media_box jsonb;
  v_crop_box jsonb;
BEGIN
  IF NOT public.assinatura_eletronica_manifesto_diario_valido(p_manifest)
     OR jsonb_typeof(p_target) <> 'object'
     OR NOT (p_target ?& ARRAY[
       'originalSha256', 'pageCount', 'semanticTarget', 'manifest',
       'targetPageIndex', 'targetPage'
     ]::text[])
     OR p_target - ARRAY[
       'originalSha256', 'pageCount', 'semanticTarget', 'manifest',
       'targetPageIndex', 'targetPage'
     ]::text[] <> '{}'::jsonb
     OR p_target ->> 'originalSha256' IS DISTINCT FROM p_original_sha256
     OR p_target ->> 'originalSha256' !~ '^[0-9a-f]{64}$'
     OR p_target ->> 'semanticTarget' <> 'DIARIO_LAST_CONTENT_PAGE'
     OR p_target -> 'manifest' IS DISTINCT FROM p_manifest
     OR jsonb_typeof(p_target -> 'pageCount') IS DISTINCT FROM 'number'
     OR p_target ->> 'pageCount' !~ '^[0-9]+$'
     OR jsonb_typeof(p_target -> 'targetPageIndex') IS DISTINCT FROM 'number'
     OR p_target ->> 'targetPageIndex' !~ '^[0-9]+$'
     OR p_target ->> 'pageCount' IS DISTINCT FROM p_manifest ->> 'pageCount'
     OR p_target ->> 'targetPageIndex' IS DISTINCT FROM p_manifest ->> 'targetPageIndex'
     OR jsonb_typeof(p_target -> 'targetPage') <> 'object'
  THEN
    RETURN false;
  END IF;

  v_target_page := p_target -> 'targetPage';
  IF NOT (v_target_page ?& ARRAY[
       'pageIndex', 'pageNumber', 'mediaBox', 'cropBox', 'rotationDegrees',
       'visibleWidth', 'visibleHeight'
     ]::text[])
     OR v_target_page - ARRAY[
       'pageIndex', 'pageNumber', 'mediaBox', 'cropBox', 'rotationDegrees',
       'visibleWidth', 'visibleHeight'
     ]::text[] <> '{}'::jsonb
     OR jsonb_typeof(v_target_page -> 'pageIndex') IS DISTINCT FROM 'number'
     OR v_target_page ->> 'pageIndex' !~ '^[0-9]+$'
     OR jsonb_typeof(v_target_page -> 'pageNumber') IS DISTINCT FROM 'number'
     OR v_target_page ->> 'pageNumber' !~ '^[0-9]+$'
     OR jsonb_typeof(v_target_page -> 'rotationDegrees') IS DISTINCT FROM 'number'
     OR v_target_page ->> 'rotationDegrees' !~ '^[0-9]+$'
     OR jsonb_typeof(v_target_page -> 'visibleWidth') IS DISTINCT FROM 'number'
     OR jsonb_typeof(v_target_page -> 'visibleHeight') IS DISTINCT FROM 'number'
     OR (v_target_page ->> 'pageIndex')::integer <> (p_manifest ->> 'targetPageIndex')::integer
     OR (v_target_page ->> 'pageNumber')::integer <> (p_manifest ->> 'targetPageIndex')::integer + 1
     OR (v_target_page ->> 'rotationDegrees')::integer NOT IN (0, 90, 180, 270)
     OR (v_target_page ->> 'visibleWidth')::numeric NOT BETWEEN 1 AND 20000
     OR (v_target_page ->> 'visibleHeight')::numeric NOT BETWEEN 1 AND 20000
     OR jsonb_typeof(v_target_page -> 'mediaBox') <> 'object'
     OR jsonb_typeof(v_target_page -> 'cropBox') <> 'object'
  THEN
    RETURN false;
  END IF;

  v_media_box := v_target_page -> 'mediaBox';
  v_crop_box := v_target_page -> 'cropBox';
  IF NOT (v_media_box ?& ARRAY['x', 'y', 'width', 'height']::text[])
     OR v_media_box - ARRAY['x', 'y', 'width', 'height']::text[] <> '{}'::jsonb
     OR NOT (v_crop_box ?& ARRAY['x', 'y', 'width', 'height']::text[])
     OR v_crop_box - ARRAY['x', 'y', 'width', 'height']::text[] <> '{}'::jsonb
     OR EXISTS (
       SELECT 1 FROM jsonb_each(v_media_box) AS coordinate
       WHERE jsonb_typeof(coordinate.value) IS DISTINCT FROM 'number'
     )
     OR EXISTS (
       SELECT 1 FROM jsonb_each(v_crop_box) AS coordinate
       WHERE jsonb_typeof(coordinate.value) IS DISTINCT FROM 'number'
     )
     OR (v_media_box ->> 'width')::numeric NOT BETWEEN 1 AND 20000
     OR (v_media_box ->> 'height')::numeric NOT BETWEEN 1 AND 20000
     OR (v_crop_box ->> 'width')::numeric NOT BETWEEN 1 AND 20000
     OR (v_crop_box ->> 'height')::numeric NOT BETWEEN 1 AND 20000
     OR (
       (v_target_page ->> 'rotationDegrees')::integer IN (0, 180)
       AND (
         (v_target_page ->> 'visibleWidth')::numeric
           IS DISTINCT FROM (v_crop_box ->> 'width')::numeric
         OR (v_target_page ->> 'visibleHeight')::numeric
           IS DISTINCT FROM (v_crop_box ->> 'height')::numeric
       )
     )
     OR (
       (v_target_page ->> 'rotationDegrees')::integer IN (90, 270)
       AND (
         (v_target_page ->> 'visibleWidth')::numeric
           IS DISTINCT FROM (v_crop_box ->> 'height')::numeric
         OR (v_target_page ->> 'visibleHeight')::numeric
           IS DISTINCT FROM (v_crop_box ->> 'width')::numeric
       )
     )
  THEN
    RETURN false;
  END IF;

  RETURN true;
EXCEPTION WHEN others THEN
  RETURN false;
END;
$function$;

ALTER TABLE public.assinatura_eletronica_envelopes
  DROP CONSTRAINT assinatura_eletronica_envelopes_snapshot_diario_check,
  ADD CONSTRAINT assinatura_eletronica_envelopes_snapshot_diario_check
    CHECK (
      public.assinatura_eletronica_snapshot_academico_diario_valido(documento_snapshot)
      AND academico_snapshot_sha256 = public.assinatura_eletronica_sha256_json(documento_snapshot)
      AND documento_snapshot -> 'source' ->> 'turmaId' = turma_id::text
      AND documento_snapshot -> 'source' ->> 'disciplinaId' = disciplina_id::text
      AND jsonb_typeof(geometria_snapshot) = 'object'
      AND geometria_snapshot ->> 'schemaVersion' = '1'
      AND geometria_snapshot ->> 'coordinateSpace' = 'PAGE_TOP_LEFT_BP_V1'
      AND jsonb_typeof(geometria_snapshot -> 'slots') = 'array'
      AND jsonb_array_length(geometria_snapshot -> 'slots') = 2
    ),
  ADD CONSTRAINT assinatura_eletronica_envelopes_pdf_semantica_check
    CHECK (
      pdf_semantic_manifest_snapshot IS NULL
      OR (
        public.assinatura_eletronica_manifesto_diario_valido(pdf_semantic_manifest_snapshot)
        AND public.assinatura_eletronica_target_diario_valido(
          pdf_signature_target_snapshot,
          pdf_semantic_manifest_snapshot,
          documento_original_sha256
        )
      )
    );

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_papel_label(p_papel text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $function$
  SELECT CASE p_papel
    WHEN 'PROFESSOR' THEN 'Professor(a)'
    WHEN 'COORDENADOR' THEN 'Coordenador(a) de curso'
    WHEN 'RESPONSAVEL_LEGAL' THEN 'Responsável legal'
    WHEN 'ALUNO' THEN 'Aluno(a)'
    WHEN 'INSTITUICAO' THEN 'Instituição'
    WHEN 'CONCEDENTE' THEN 'Concedente'
    WHEN 'SUPERVISOR' THEN 'Supervisor(a)'
    WHEN 'TESTEMUNHA' THEN 'Testemunha'
    ELSE p_papel
  END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_participante_status_label(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $function$
  SELECT CASE p_status
    WHEN 'AGUARDANDO_ORDEM' THEN 'Aguardando assinatura anterior'
    WHEN 'PENDENTE' THEN 'Pendente'
    WHEN 'DESAFIO_PENDENTE' THEN 'Confirmação pendente'
    WHEN 'ASSINADO' THEN 'Assinado'
    WHEN 'RECUSADO' THEN 'Recusado'
    WHEN 'CANCELADO' THEN 'Cancelado'
    WHEN 'AGUARDANDO_VINCULO' THEN 'Aguardando vínculo'
    ELSE p_status
  END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_envelope_status_label(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $function$
  SELECT CASE p_status
    WHEN 'RASCUNHO' THEN 'Rascunho'
    WHEN 'PENDENTE' THEN 'Pendente'
    WHEN 'EM_ASSINATURA' THEN 'Em assinatura'
    WHEN 'FINALIZANDO' THEN 'Finalizando documento'
    WHEN 'ASSINADO' THEN 'Assinado'
    WHEN 'RECUSADO' THEN 'Recusado'
    WHEN 'CANCELADO' THEN 'Cancelado'
    WHEN 'EXPIRADO' THEN 'Expirado'
    WHEN 'SUBSTITUIDO' THEN 'Substituído'
    ELSE p_status
  END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_exigir_service_role()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF coalesce((SELECT auth.jwt() ->> 'role'), '') <> 'service_role' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ASSINATURA_SERVICE_ROLE_OBRIGATORIA';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_exigir_sessao_ativa(
  p_actor_auth_user_id uuid,
  p_auth_session_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_actor_auth_user_id IS NULL OR p_auth_session_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM auth.sessions AS sessao
    WHERE sessao.id = p_auth_session_id
      AND sessao.user_id = p_actor_auth_user_id
      AND (sessao.not_after IS NULL OR sessao.not_after > statement_timestamp())
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ASSINATURA_SESSAO_INVALIDA_OU_REVOGADA';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_perfil_contexto_valido(
  p_actor_auth_user_id uuid,
  p_perfil text,
  p_context_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT CASE upper(btrim(coalesce(p_perfil, '')))
    WHEN 'GESTOR' THEN EXISTS (
      SELECT 1
      FROM public.usuarios_sistema AS gestor
      WHERE gestor.id = p_context_id
        AND gestor.auth_user_id = p_actor_auth_user_id
        AND public.is_active_status(gestor.status)
    )
    WHEN 'PROFESSOR' THEN EXISTS (
      SELECT 1
      FROM public.parceiros AS professor
      WHERE professor.id = p_context_id
        AND professor.auth_user_id = p_actor_auth_user_id
        AND upper(professor.tipo) = 'PROFESSOR'
        AND public.is_active_status(professor.status)
    )
    WHEN 'COORDENADOR' THEN EXISTS (
      SELECT 1
      FROM public.parceiros AS professor
      JOIN public.professores_coordenacoes AS coordenacao
        ON coordenacao.professor_id = professor.id
      WHERE professor.id = p_context_id
        AND professor.auth_user_id = p_actor_auth_user_id
        AND upper(professor.tipo) = 'PROFESSOR'
        AND public.is_active_status(professor.status)
        AND coordenacao.status = 'ATIVA'
        AND coordenacao.vigente_de <= statement_timestamp()
        AND (coordenacao.vigente_ate IS NULL OR coordenacao.vigente_ate > statement_timestamp())
    )
    WHEN 'RESPONSAVEL_LEGAL' THEN EXISTS (
      SELECT 1
      FROM public.responsaveis_legais AS responsavel
      WHERE responsavel.id = p_context_id
        AND responsavel.auth_user_id = p_actor_auth_user_id
        AND responsavel.status = 'ATIVO'
    )
    WHEN 'ALUNO' THEN EXISTS (
      SELECT 1
      FROM public.parceiros AS aluno
      WHERE aluno.id = p_context_id
        AND aluno.auth_user_id = p_actor_auth_user_id
        AND upper(aluno.tipo) = 'ALUNO'
        AND public.is_active_status(aluno.status)
    )
    ELSE false
  END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_gestor_pode_gerir_diario(
  p_actor_auth_user_id uuid,
  p_context_id uuid,
  p_turma_id uuid,
  p_polo_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT public.assinatura_eletronica_perfil_contexto_valido(
    p_actor_auth_user_id,
    'GESTOR',
    p_context_id
  ) AND (
    public.can_operate_turma_academics(p_turma_id)
    OR (
      public.gestor_has_tab('secretaria', 'assinatura-eletronica')
      AND public.is_gestor_for_polo(p_polo_id)
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_adicionar_evento(
  p_envelope_id uuid,
  p_participante_id uuid,
  p_tipo text,
  p_ator_auth_user_id uuid,
  p_dados jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_id uuid := gen_random_uuid();
  v_sequencia integer;
  v_hash_anterior text;
  v_ocorrido_em timestamptz := statement_timestamp();
  v_hash_evento text;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('assinatura-eletronica-evento:' || p_envelope_id::text, 0)
  );

  SELECT evento.sequencia + 1, evento.hash_evento
  INTO v_sequencia, v_hash_anterior
  FROM public.assinatura_eletronica_eventos AS evento
  WHERE evento.envelope_id = p_envelope_id
  ORDER BY evento.sequencia DESC
  LIMIT 1;

  IF NOT FOUND THEN
    v_sequencia := 1;
    v_hash_anterior := NULL;
  END IF;

  v_hash_evento := public.assinatura_eletronica_sha256_json(
    jsonb_build_object(
      'eventId', v_id,
      'envelopeId', p_envelope_id,
      'participantId', p_participante_id,
      'sequence', v_sequencia,
      'type', p_tipo,
      'actorAuthUserId', p_ator_auth_user_id,
      'occurredAt', v_ocorrido_em,
      'data', coalesce(p_dados, '{}'::jsonb),
      'previousHash', v_hash_anterior
    )
  );

  INSERT INTO public.assinatura_eletronica_eventos (
    id,
    envelope_id,
    participante_id,
    sequencia,
    tipo,
    ator_auth_user_id,
    ocorrido_em,
    dados,
    hash_anterior,
    hash_evento
  ) VALUES (
    v_id,
    p_envelope_id,
    p_participante_id,
    v_sequencia,
    p_tipo,
    p_ator_auth_user_id,
    v_ocorrido_em,
    coalesce(p_dados, '{}'::jsonb),
    v_hash_anterior,
    v_hash_evento
  );

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_ticket_hmac_secret()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_secret text;
BEGIN
  SELECT nullif(segredo.decrypted_secret, '')
  INTO v_secret
  FROM vault.decrypted_secrets AS segredo
  WHERE segredo.name = 'assinatura_reauth_ticket_hmac_secret'
  LIMIT 1;

  IF v_secret IS NULL OR pg_catalog.octet_length(v_secret) < 32 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_REAUTH_SECRET_INDISPONIVEL';
  END IF;

  RETURN v_secret;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_codificar_ticket(p_claims jsonb)
RETURNS text
LANGUAGE plpgsql
STABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_payload text := p_claims::text;
  v_secret text := public.assinatura_eletronica_ticket_hmac_secret();
  v_envelope text;
BEGIN
  v_envelope := jsonb_build_object(
    'payload', pg_catalog.replace(
      pg_catalog.encode(pg_catalog.convert_to(v_payload, 'UTF8'), 'base64'),
      E'\n',
      ''
    ),
    'signature', pg_catalog.encode(
      extensions.hmac(
        pg_catalog.convert_to(v_payload, 'UTF8'),
        pg_catalog.convert_to(v_secret, 'UTF8'),
        'sha256'
      ),
      'hex'
    )
  )::text;

  RETURN pg_catalog.replace(
    pg_catalog.encode(pg_catalog.convert_to(v_envelope, 'UTF8'), 'base64'),
    E'\n',
    ''
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_decodificar_ticket(p_ticket text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_envelope jsonb;
  v_payload text;
  v_signature bytea;
  v_expected bytea;
  v_claims jsonb;
BEGIN
  IF char_length(p_ticket) NOT BETWEEN 32 AND 4096 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_REAUTH_TICKET_INVALIDO';
  END IF;

  v_envelope := pg_catalog.convert_from(pg_catalog.decode(p_ticket, 'base64'), 'UTF8')::jsonb;
  IF jsonb_typeof(v_envelope) <> 'object'
     OR nullif(v_envelope ->> 'payload', '') IS NULL
     OR nullif(v_envelope ->> 'signature', '') IS NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_REAUTH_TICKET_INVALIDO';
  END IF;

  v_payload := pg_catalog.convert_from(
    pg_catalog.decode(v_envelope ->> 'payload', 'base64'),
    'UTF8'
  );
  v_signature := pg_catalog.decode(v_envelope ->> 'signature', 'hex');
  v_expected := extensions.hmac(
    pg_catalog.convert_to(v_payload, 'UTF8'),
    pg_catalog.convert_to(public.assinatura_eletronica_ticket_hmac_secret(), 'UTF8'),
    'sha256'
  );

  IF v_signature IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_REAUTH_TICKET_INVALIDO';
  END IF;

  v_claims := v_payload::jsonb;
  IF jsonb_typeof(v_claims) <> 'object'
     OR (SELECT array_agg(chave ORDER BY chave) FROM jsonb_object_keys(v_claims) AS chaves(chave))
        IS DISTINCT FROM ARRAY[
          'actorAuthUserId', 'authSessionId', 'challengeId', 'contextId',
          'envelopeId', 'expiresAt', 'issuedAt', 'participantId',
          'participantOrder', 'participantRole', 'profile', 'requestId'
        ]::text[]
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_REAUTH_TICKET_INVALIDO';
  END IF;

  RETURN v_claims;
EXCEPTION
  WHEN SQLSTATE '55000' THEN RAISE;
  WHEN OTHERS THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_REAUTH_TICKET_INVALIDO';
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Guardas de imutabilidade adaptadas ao piloto.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_validar_escopo_envelope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
BEGIN
  NEW.documento := lower(btrim(NEW.documento));
  NEW.documento_original_sha256 := lower(btrim(NEW.documento_original_sha256));
  NEW.documento_final_sha256 := lower(btrim(NEW.documento_final_sha256));

  IF TG_OP = 'INSERT' AND NEW.status <> 'RASCUNHO' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_ENVELOPE_DEVE_INICIAR_RASCUNHO';
  END IF;
  IF NEW.documento <> 'diario_classe' OR NEW.origem_tipo <> 'DIARIO' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASSINATURA_ORIGEM_NAO_AUTORIZADA';
  END IF;

  SELECT polo.company_id INTO v_company_id
  FROM public.polos AS polo
  WHERE polo.id = NEW.polo_id;

  IF v_company_id IS NULL OR NEW.company_id IS DISTINCT FROM v_company_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASSINATURA_ESCOPO_EMPRESA_POLO_INVALIDO';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_validar_vinculos_envelope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_politica public.assinatura_eletronica_politicas%ROWTYPE;
  v_company_id uuid;
  v_polo_id uuid;
BEGIN
  SELECT politica.* INTO v_politica
  FROM public.assinatura_eletronica_politicas AS politica
  WHERE politica.id = NEW.politica_id
  FOR SHARE;

  IF NOT FOUND
     OR v_politica.arquivada_em IS NOT NULL
     OR NEW.company_id IS DISTINCT FROM v_politica.company_id
     OR NEW.polo_id IS DISTINCT FROM v_politica.polo_id
     OR NEW.documento IS DISTINCT FROM v_politica.documento
     OR NEW.politica_versao IS DISTINCT FROM v_politica.versao
     OR NEW.politica_snapshot IS DISTINCT FROM v_politica.politica
     OR NEW.certificado_snapshot IS DISTINCT FROM v_politica.certificado
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASSINATURA_POLITICA_SNAPSHOT_INVALIDO';
  END IF;

  SELECT polo.company_id, turma.polo_id
  INTO v_company_id, v_polo_id
  FROM public.turmas AS turma
  JOIN public.polos AS polo ON polo.id = turma.polo_id
  JOIN public.turmas_disciplinas AS vinculo
    ON vinculo.turma_id = turma.id
   AND vinculo.disciplina_id = NEW.disciplina_id
  WHERE turma.id = NEW.turma_id;

  IF v_polo_id IS NULL
     OR NEW.polo_id IS DISTINCT FROM v_polo_id
     OR NEW.company_id IS DISTINCT FROM v_company_id
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASSINATURA_DIARIO_ESCOPO_INVALIDO';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_validar_artefato()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_original_sha256 text;
  v_final_sha256 text;
  v_path_esperado text;
BEGIN
  NEW.sha256 := lower(btrim(NEW.sha256));
  v_path_esperado := 'envelopes/' || NEW.envelope_id::text || '/' || CASE NEW.classe
    WHEN 'DOCUMENTO_ORIGINAL' THEN 'documento-original.pdf'
    WHEN 'DOCUMENTO_FINAL' THEN 'documento-final.pdf'
    WHEN 'COMPROVANTE_EVIDENCIA' THEN 'comprovante-evidencia.pdf'
  END;

  IF NEW.bucket_id <> 'documentos-assinatura-eletronica'
     OR NEW.storage_path IS DISTINCT FROM v_path_esperado
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASSINATURA_ARTEFATO_CAMINHO_INVALIDO';
  END IF;

  SELECT envelope.documento_original_sha256, envelope.documento_final_sha256
  INTO v_original_sha256, v_final_sha256
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = NEW.envelope_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'ASSINATURA_ENVELOPE_NAO_ENCONTRADO';
  END IF;
  IF NEW.classe = 'DOCUMENTO_ORIGINAL' AND NEW.sha256 IS DISTINCT FROM v_original_sha256 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASSINATURA_HASH_ORIGINAL_DIVERGENTE';
  END IF;
  IF NEW.classe = 'DOCUMENTO_FINAL' AND NEW.sha256 IS DISTINCT FROM v_final_sha256 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASSINATURA_HASH_FINAL_DIVERGENTE';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_proteger_envelope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.polo_id IS DISTINCT FROM OLD.polo_id
     OR NEW.documento IS DISTINCT FROM OLD.documento
     OR NEW.titulo IS DISTINCT FROM OLD.titulo
     OR NEW.revisao_rotulo IS DISTINCT FROM OLD.revisao_rotulo
     OR NEW.politica_id IS DISTINCT FROM OLD.politica_id
     OR NEW.politica_versao IS DISTINCT FROM OLD.politica_versao
     OR NEW.politica_snapshot IS DISTINCT FROM OLD.politica_snapshot
     OR NEW.certificado_snapshot IS DISTINCT FROM OLD.certificado_snapshot
     OR NEW.matricula_id IS DISTINCT FROM OLD.matricula_id
     OR NEW.aluno_id IS DISTINCT FROM OLD.aluno_id
     OR NEW.documento_validacao_id IS DISTINCT FROM OLD.documento_validacao_id
     OR NEW.prazo_em IS DISTINCT FROM OLD.prazo_em
     OR NEW.request_id IS DISTINCT FROM OLD.request_id
     OR NEW.criado_por IS DISTINCT FROM OLD.criado_por
     OR NEW.substitui_envelope_id IS DISTINCT FROM OLD.substitui_envelope_id
     OR NEW.origem_tipo IS DISTINCT FROM OLD.origem_tipo
     OR NEW.turma_id IS DISTINCT FROM OLD.turma_id
     OR NEW.disciplina_id IS DISTINCT FROM OLD.disciplina_id
     OR NEW.origem_versao IS DISTINCT FROM OLD.origem_versao
     OR NEW.documento_snapshot IS DISTINCT FROM OLD.documento_snapshot
     OR NEW.academico_snapshot_sha256 IS DISTINCT FROM OLD.academico_snapshot_sha256
     OR NEW.geometria_snapshot IS DISTINCT FROM OLD.geometria_snapshot
     OR NEW.criado_contexto_tipo IS DISTINCT FROM OLD.criado_contexto_tipo
     OR NEW.criado_contexto_id IS DISTINCT FROM OLD.criado_contexto_id
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_ENVELOPE_ESCOPO_IMUTAVEL';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'RASCUNHO' AND NEW.status IN ('PENDENTE', 'CANCELADO'))
    OR (OLD.status = 'PENDENTE' AND NEW.status IN ('EM_ASSINATURA', 'RECUSADO', 'CANCELADO', 'EXPIRADO'))
    OR (OLD.status = 'EM_ASSINATURA' AND NEW.status IN ('FINALIZANDO', 'RECUSADO', 'CANCELADO', 'EXPIRADO'))
    OR (OLD.status = 'FINALIZANDO' AND NEW.status IN ('ASSINADO', 'CANCELADO'))
    OR (OLD.status = 'ASSINADO' AND NEW.status = 'SUBSTITUIDO')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_TRANSICAO_ENVELOPE_INVALIDA';
  END IF;

  IF NEW.documento_original_sha256 IS DISTINCT FROM OLD.documento_original_sha256
     OR NEW.original_congelado_em IS DISTINCT FROM OLD.original_congelado_em
     OR NEW.publicado_em IS DISTINCT FROM OLD.publicado_em
     OR NEW.pdf_semantic_manifest_snapshot IS DISTINCT FROM OLD.pdf_semantic_manifest_snapshot
     OR NEW.pdf_signature_target_snapshot IS DISTINCT FROM OLD.pdf_signature_target_snapshot
  THEN
    IF OLD.status <> 'RASCUNHO' OR NEW.status <> 'PENDENTE'
       OR OLD.documento_original_sha256 IS NOT NULL
       OR OLD.pdf_semantic_manifest_snapshot IS NOT NULL
       OR OLD.pdf_signature_target_snapshot IS NOT NULL
       OR NEW.documento_original_sha256 IS NULL
       OR NEW.original_congelado_em IS NULL
       OR NEW.publicado_em IS NULL
       OR NEW.pdf_semantic_manifest_snapshot IS NULL
       OR NEW.pdf_signature_target_snapshot IS NULL
       OR NOT public.assinatura_eletronica_manifesto_diario_valido(NEW.pdf_semantic_manifest_snapshot)
       OR NOT public.assinatura_eletronica_target_diario_valido(
         NEW.pdf_signature_target_snapshot,
         NEW.pdf_semantic_manifest_snapshot,
         NEW.documento_original_sha256
       )
    THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_ORIGINAL_IMUTAVEL';
    END IF;
  END IF;

  IF NEW.documento_final_sha256 IS DISTINCT FROM OLD.documento_final_sha256
     OR NEW.finalizado_em IS DISTINCT FROM OLD.finalizado_em
  THEN
    IF OLD.status <> 'FINALIZANDO' OR NEW.status <> 'ASSINADO'
       OR OLD.documento_final_sha256 IS NOT NULL
       OR NEW.documento_final_sha256 IS NULL
       OR NEW.finalizado_em IS NULL
    THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_FINAL_IMUTAVEL';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_proteger_participante()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.envelope_id IS DISTINCT FROM OLD.envelope_id
     OR NEW.papel IS DISTINCT FROM OLD.papel
     OR NEW.ordem IS DISTINCT FROM OLD.ordem
     OR NEW.obrigatorio IS DISTINCT FROM OLD.obrigatorio
     OR NEW.parceiro_id IS DISTINCT FROM OLD.parceiro_id
     OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
     OR NEW.vinculo_verificado_em IS DISTINCT FROM OLD.vinculo_verificado_em
     OR NEW.contexto_tipo IS DISTINCT FROM OLD.contexto_tipo
     OR NEW.contexto_id IS DISTINCT FROM OLD.contexto_id
     OR NEW.responsavel_legal_id IS DISTINCT FROM OLD.responsavel_legal_id
     OR NEW.responsavel_aluno_vinculo_id IS DISTINCT FROM OLD.responsavel_aluno_vinculo_id
     OR NEW.coordenacao_id IS DISTINCT FROM OLD.coordenacao_id
     OR NEW.identidade_snapshot IS DISTINCT FROM OLD.identidade_snapshot
     OR NEW.vinculo_snapshot IS DISTINCT FROM OLD.vinculo_snapshot
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_PARTICIPANTE_IDENTIDADE_IMUTAVEL';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'AGUARDANDO_ORDEM' AND NEW.status IN ('PENDENTE', 'CANCELADO'))
    OR (OLD.status = 'PENDENTE' AND NEW.status IN ('DESAFIO_PENDENTE', 'RECUSADO', 'CANCELADO'))
    OR (OLD.status = 'DESAFIO_PENDENTE' AND NEW.status IN ('PENDENTE', 'ASSINADO', 'RECUSADO', 'CANCELADO'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_TRANSICAO_PARTICIPANTE_INVALIDA';
  END IF;

  IF NEW.assinado_em IS DISTINCT FROM OLD.assinado_em
     OR NEW.assinado_por_auth_user_id IS DISTINCT FROM OLD.assinado_por_auth_user_id
     OR NEW.aceitou_versao_termo IS DISTINCT FROM OLD.aceitou_versao_termo
  THEN
    IF OLD.status <> 'DESAFIO_PENDENTE' OR NEW.status <> 'ASSINADO'
       OR NEW.assinado_em IS NULL
       OR NEW.assinado_por_auth_user_id IS NULL
       OR nullif(btrim(NEW.aceitou_versao_termo), '') IS NULL
    THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_ACEITE_PARTICIPANTE_INVALIDO';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_validar_participante_fundacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_envelope public.assinatura_eletronica_envelopes%ROWTYPE;
  v_turma_curso_id uuid;
  v_professor_id uuid;
BEGIN
  SELECT envelope.*
  INTO v_envelope
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = NEW.envelope_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'ASSINATURA_ENVELOPE_NAO_ENCONTRADO';
  END IF;
  SELECT turma.curso_id INTO v_turma_curso_id
  FROM public.turmas AS turma
  WHERE turma.id = v_envelope.turma_id;
  IF TG_OP = 'INSERT' AND (v_envelope.status <> 'RASCUNHO' OR NEW.status <> 'AGUARDANDO_ORDEM') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_PARTICIPANTE_ESTADO_INICIAL_INVALIDO';
  END IF;
  IF (NEW.papel = 'PROFESSOR' AND NEW.ordem <> 1)
     OR (NEW.papel = 'COORDENADOR' AND NEW.ordem <> 2)
     OR NEW.papel NOT IN ('PROFESSOR', 'COORDENADOR')
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASSINATURA_PARTICIPANTES_DIARIO_INVALIDOS';
  END IF;

  IF NEW.identidade_snapshot ->> 'partnerId' IS DISTINCT FROM NEW.parceiro_id::text
     OR NEW.identidade_snapshot ->> 'authUserId' IS DISTINCT FROM NEW.auth_user_id::text
     OR NEW.vinculo_snapshot ->> 'turmaId' IS DISTINCT FROM v_envelope.turma_id::text
     OR NEW.vinculo_snapshot ->> 'disciplinaId' IS DISTINCT FROM v_envelope.disciplina_id::text
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASSINATURA_PARTICIPANTE_SNAPSHOT_INVALIDO';
  END IF;

  IF NEW.papel = 'PROFESSOR' THEN
    SELECT vinculo.professor_id INTO v_professor_id
    FROM public.turmas_disciplinas AS vinculo
    WHERE vinculo.turma_id = v_envelope.turma_id
      AND vinculo.disciplina_id = v_envelope.disciplina_id;

    IF v_professor_id IS DISTINCT FROM NEW.parceiro_id OR NOT EXISTS (
      SELECT 1 FROM public.parceiros AS professor
      WHERE professor.id = NEW.parceiro_id
        AND professor.auth_user_id = NEW.auth_user_id
        AND upper(professor.tipo) = 'PROFESSOR'
        AND public.is_active_status(professor.status)
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASSINATURA_PROFESSOR_VINCULO_INVALIDO';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1
      FROM public.professores_coordenacoes AS coordenacao
      JOIN public.parceiros AS professor ON professor.id = coordenacao.professor_id
      WHERE coordenacao.id = NEW.coordenacao_id
        AND coordenacao.professor_id = NEW.parceiro_id
        AND coordenacao.curso_id = v_turma_curso_id
        AND coordenacao.polo_id = v_envelope.polo_id
        AND coordenacao.status = 'ATIVA'
        AND coordenacao.vigente_de <= statement_timestamp()
        AND (coordenacao.vigente_ate IS NULL OR coordenacao.vigente_ate > statement_timestamp())
        AND professor.auth_user_id = NEW.auth_user_id
        AND upper(professor.tipo) = 'PROFESSOR'
        AND public.is_active_status(professor.status)
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASSINATURA_COORDENADOR_VINCULO_INVALIDO';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_validar_desafio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.assinatura_eletronica_participantes AS participante
    WHERE participante.id = NEW.participante_id
      AND participante.envelope_id = NEW.envelope_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASSINATURA_DESAFIO_PARTICIPANTE_INVALIDO';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.envelope_id IS DISTINCT FROM OLD.envelope_id
       OR NEW.participante_id IS DISTINCT FROM OLD.participante_id
       OR NEW.metodo IS DISTINCT FROM OLD.metodo
       OR NEW.segredo_hash IS DISTINCT FROM OLD.segredo_hash
       OR NEW.correlacao_provedor IS DISTINCT FROM OLD.correlacao_provedor
       OR NEW.max_tentativas IS DISTINCT FROM OLD.max_tentativas
       OR NEW.expira_em IS DISTINCT FROM OLD.expira_em
       OR NEW.verificado_em IS DISTINCT FROM OLD.verificado_em
       OR NEW.evidencia_hash IS DISTINCT FROM OLD.evidencia_hash
       OR NEW.actor_auth_user_id IS DISTINCT FROM OLD.actor_auth_user_id
       OR NEW.auth_session_id IS DISTINCT FROM OLD.auth_session_id
       OR NEW.perfil IS DISTINCT FROM OLD.perfil
       OR NEW.contexto_id IS DISTINCT FROM OLD.contexto_id
       OR NEW.request_id IS DISTINCT FROM OLD.request_id
       OR NEW.evidencia_snapshot IS DISTINCT FROM OLD.evidencia_snapshot
    THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_DESAFIO_IMUTAVEL';
    END IF;
    IF NEW.estado IS DISTINCT FROM OLD.estado
       AND NOT (OLD.estado = 'VERIFICADO' AND NEW.estado = 'CONSUMIDO')
    THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_TRANSICAO_DESAFIO_INVALIDA';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6. RPCs externas: criação gerencial e leitura por perfil/contexto.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_solicitar_envelope_diario(
  p_turma_id uuid,
  p_disciplina_id uuid,
  p_perfil text,
  p_context_id uuid,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_payload_sha256 text;
  v_replay public.assinatura_eletronica_operacoes%ROWTYPE;
  v_turma public.turmas%ROWTYPE;
  v_disciplina public.disciplinas%ROWTYPE;
  v_polo public.polos%ROWTYPE;
  v_empresa public.empresas%ROWTYPE;
  v_curso public.cursos%ROWTYPE;
  v_modulo public.modulos%ROWTYPE;
  v_vinculo public.turmas_disciplinas%ROWTYPE;
  v_template public.documentos_templates%ROWTYPE;
  v_professor public.parceiros%ROWTYPE;
  v_coordenador public.parceiros%ROWTYPE;
  v_coordenacao public.professores_coordenacoes%ROWTYPE;
  v_politica public.assinatura_eletronica_politicas%ROWTYPE;
  v_bloqueio text;
  v_realizadas numeric;
  v_origem_versao integer;
  v_envelope_id uuid := gen_random_uuid();
  v_professor_participante_id uuid := gen_random_uuid();
  v_coordenador_participante_id uuid := gen_random_uuid();
  v_documento_snapshot jsonb;
  v_academico_snapshot_sha256 text;
  v_academic_revision_sha256 text;
  v_geometria_snapshot jsonb;
  v_students jsonb;
  v_aulas jsonb;
  v_attendance_map jsonb;
  v_grades_map jsonb;
  v_praticas_map jsonb;
  v_observacoes text;
  v_active_instruments jsonb;
  v_capa_campos jsonb;
  v_template_normalizado jsonb;
  v_identity jsonb;
  v_asset_sources jsonb;
  v_closure_snapshot jsonb;
  v_session_count integer;
  v_grade_count integer;
  v_resultado jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTENTICACAO_OBRIGATORIA';
  END IF;
  IF p_turma_id IS NULL OR p_disciplina_id IS NULL OR p_context_id IS NULL OR p_request_id IS NULL
     OR upper(btrim(coalesce(p_perfil, ''))) <> 'GESTOR'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_SOLICITACAO_INVALIDA';
  END IF;

  SELECT turma.*
  INTO v_turma
  FROM public.turmas AS turma
  JOIN public.turmas_disciplinas AS vinculo ON vinculo.turma_id = turma.id
  WHERE turma.id = p_turma_id
    AND vinculo.disciplina_id = p_disciplina_id
  FOR SHARE OF turma, vinculo;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ASSINATURA_DIARIO_NAO_ENCONTRADO';
  END IF;
  SELECT polo.* INTO v_polo
  FROM public.polos AS polo
  WHERE polo.id = v_turma.polo_id
  FOR SHARE;
  SELECT curso.* INTO v_curso
  FROM public.cursos AS curso
  WHERE curso.id = v_turma.curso_id
  FOR SHARE;
  SELECT disciplina.* INTO v_disciplina
  FROM public.disciplinas AS disciplina
  WHERE disciplina.id = p_disciplina_id
  FOR SHARE;
  SELECT vinculo.bloqueio_diario INTO v_bloqueio
  FROM public.turmas_disciplinas AS vinculo
  WHERE vinculo.turma_id = p_turma_id
    AND vinculo.disciplina_id = p_disciplina_id
  FOR SHARE;
  IF NOT public.assinatura_eletronica_gestor_pode_gerir_diario(
    v_actor, p_context_id, p_turma_id, v_turma.polo_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ASSINATURA_DIARIO_GESTAO_NAO_AUTORIZADA';
  END IF;

  -- A autorização e o escopo são revalidados antes de qualquer replay.
  v_payload_sha256 := public.assinatura_eletronica_sha256_json(jsonb_build_object(
    'turmaId', p_turma_id,
    'disciplinaId', p_disciplina_id,
    'profile', 'GESTOR',
    'contextId', p_context_id
  ));
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('assinatura:solicitar:' || v_actor::text || ':' || p_request_id::text, 0)
  );
  SELECT operacao.* INTO v_replay
  FROM public.assinatura_eletronica_operacoes AS operacao
  WHERE operacao.actor_scope = 'user:' || v_actor::text
    AND operacao.operacao = 'SOLICITAR_ENVELOPE_DIARIO'
    AND operacao.request_id = p_request_id;
  IF FOUND THEN
    IF v_replay.payload_sha256 IS DISTINCT FROM v_payload_sha256 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_IDEMPOTENCIA_DIVERGENTE';
    END IF;
    RETURN v_replay.resultado;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('assinatura:diario:' || p_turma_id::text || ':' || p_disciplina_id::text, 0)
  );
  LOCK TABLE
    public.turmas_disciplinas,
    public.matriculas,
    public.parceiros,
    public.aulas_turma,
    public.diario_frequencia,
    public.diario_notas,
    public.diario_praticas,
    public.diario_observacoes,
    public.documentos_templates
  IN SHARE MODE;

  -- Toda a matéria acadêmica usada pelo compositor é relida sob o mesmo
  -- lock e congelada na própria transação que cria o envelope.
  SELECT turma.* INTO v_turma
  FROM public.turmas AS turma
  WHERE turma.id = p_turma_id
  FOR SHARE;
  SELECT vinculo.* INTO v_vinculo
  FROM public.turmas_disciplinas AS vinculo
  WHERE vinculo.turma_id = p_turma_id
    AND vinculo.disciplina_id = p_disciplina_id
  FOR SHARE;
  IF v_turma.id IS NULL OR v_vinculo.turma_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ASSINATURA_DIARIO_NAO_ENCONTRADO';
  END IF;
  v_bloqueio := v_vinculo.bloqueio_diario;
  SELECT polo.* INTO v_polo
  FROM public.polos AS polo
  WHERE polo.id = v_turma.polo_id
  FOR SHARE;
  SELECT empresa.* INTO v_empresa
  FROM public.empresas AS empresa
  WHERE empresa.id = v_polo.company_id
  FOR SHARE;
  SELECT curso.* INTO v_curso
  FROM public.cursos AS curso
  WHERE curso.id = v_turma.curso_id
  FOR SHARE;
  SELECT disciplina.* INTO v_disciplina
  FROM public.disciplinas AS disciplina
  WHERE disciplina.id = p_disciplina_id
  FOR SHARE;
  SELECT modulo.* INTO v_modulo
  FROM public.modulos AS modulo
  WHERE modulo.id = v_disciplina.modulo_id
  FOR SHARE;
  SELECT template.* INTO v_template
  FROM public.documentos_templates AS template
  WHERE template.id = 'diario_' || upper(v_curso.modalidade)
  FOR SHARE;
  IF v_polo.id IS NULL OR v_empresa.id IS NULL OR v_curso.id IS NULL
     OR v_disciplina.id IS NULL OR v_modulo.id IS NULL OR v_template.id IS NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_DIARIO_FONTE_CANONICA_INCOMPLETA';
  END IF;

  IF v_bloqueio IS DISTINCT FROM 'PROFESSOR' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_DIARIO_AINDA_NAO_ENVIADO_PARA_REVISAO';
  END IF;

  SELECT
    coalesce(sum(aula.carga_horaria), 0)
    + coalesce((
      SELECT sum(extra.carga_horaria_compensacao)
      FROM public.atividades_extra_classe AS extra
      WHERE extra.turma_id = p_turma_id
        AND extra.disciplina_id = p_disciplina_id
        AND extra.status = 'PUBLICADA'
        AND (
          extra.prazo_entrega IS NULL
          OR extra.prazo_entrega <= pg_catalog.timezone('America/Maceio', statement_timestamp())::date
        )
    ), 0)
  INTO v_realizadas
  FROM public.aulas_turma AS aula
  WHERE aula.turma_id = p_turma_id
    AND aula.disciplina_id = p_disciplina_id;

  IF coalesce(v_realizadas, 0) < coalesce(v_disciplina.carga_horaria, 0) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_DIARIO_CARGA_HORARIA_INCOMPLETA';
  END IF;

  SELECT professor.* INTO v_professor
  FROM public.turmas_disciplinas AS vinculo
  JOIN public.parceiros AS professor ON professor.id = vinculo.professor_id
  WHERE vinculo.turma_id = p_turma_id
    AND vinculo.disciplina_id = p_disciplina_id
    AND upper(professor.tipo) = 'PROFESSOR'
    AND public.is_active_status(professor.status)
    AND professor.auth_user_id IS NOT NULL
  FOR SHARE OF professor;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_PROFESSOR_SEM_IDENTIDADE_ATIVA';
  END IF;

  SELECT coordenacao.*
  INTO v_coordenacao
  FROM public.professores_coordenacoes AS coordenacao
  JOIN public.parceiros AS coordenador ON coordenador.id = coordenacao.professor_id
  WHERE coordenacao.curso_id = v_turma.curso_id
    AND coordenacao.polo_id = v_turma.polo_id
    AND coordenacao.status = 'ATIVA'
    AND coordenacao.vigente_de <= statement_timestamp()
    AND (coordenacao.vigente_ate IS NULL OR coordenacao.vigente_ate > statement_timestamp())
    AND upper(coordenador.tipo) = 'PROFESSOR'
    AND public.is_active_status(coordenador.status)
    AND coordenador.auth_user_id IS NOT NULL
  ORDER BY coordenacao.vigente_de DESC, coordenacao.id
  LIMIT 1
  FOR SHARE OF coordenacao, coordenador;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_COORDENADOR_SEM_VINCULO_ATIVO';
  END IF;
  SELECT coordenador.* INTO v_coordenador
  FROM public.parceiros AS coordenador
  WHERE coordenador.id = v_coordenacao.professor_id
  FOR SHARE;

  SELECT politica.* INTO v_politica
  FROM public.assinatura_eletronica_politicas AS politica
  WHERE politica.polo_id = v_turma.polo_id
    AND politica.documento = 'diario_classe'
    AND politica.arquivada_em IS NULL
  ORDER BY politica.versao DESC
  LIMIT 1
  FOR SHARE;
  IF NOT FOUND
     OR NOT v_politica.habilitada
     OR v_politica.status_juridico <> 'APROVADA'
     OR coalesce((v_politica.certificado ->> 'cadeiaEvidencias')::boolean, false) IS NOT TRUE
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_POLITICA_NAO_HABILITADA';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.assinatura_eletronica_envelopes AS envelope
    WHERE envelope.origem_tipo = 'DIARIO'
      AND envelope.turma_id = p_turma_id
      AND envelope.disciplina_id = p_disciplina_id
      AND envelope.status IN ('RASCUNHO', 'PENDENTE', 'EM_ASSINATURA', 'FINALIZANDO')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'ASSINATURA_DIARIO_JA_POSSUI_ENVELOPE_ATIVO';
  END IF;

  SELECT coalesce(max(envelope.origem_versao), 0) + 1
  INTO v_origem_versao
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.origem_tipo = 'DIARIO'
    AND envelope.turma_id = p_turma_id
    AND envelope.disciplina_id = p_disciplina_id;

  v_capa_campos := CASE
    WHEN jsonb_typeof(v_template.conteudo -> 'capaCampos') = 'array'
      AND jsonb_array_length(v_template.conteudo -> 'capaCampos') > 0
      THEN v_template.conteudo -> 'capaCampos'
    ELSE jsonb_build_array(
      jsonb_build_object(
        'id', 'curso', 'label', 'CURSO: ', 'x', 29.6, 'y', 52.8,
        'width', 50.5, 'fontSize', 11, 'visible', true,
        'color', '#071a33', 'bold', true, 'align', 'left'
      ),
      jsonb_build_object(
        'id', 'modulo', 'label', 'MÓDULO: ', 'x', 29.6, 'y', 58.8,
        'width', 50.5, 'fontSize', 11, 'visible', true,
        'color', '#071a33', 'bold', true, 'align', 'left'
      ),
      jsonb_build_object(
        'id', 'areaTematica', 'label', 'ÁREA TEMÁTICA: ', 'x', 29.6, 'y', 64.8,
        'width', 50.5, 'fontSize', 11, 'visible', true,
        'color', '#071a33', 'bold', true, 'align', 'left'
      ),
      jsonb_build_object(
        'id', 'disciplina', 'label', 'UNIDADE EDUCACIONAL: ', 'x', 29.6, 'y', 70.8,
        'width', 50.5, 'fontSize', 11, 'visible', true,
        'color', '#071a33', 'bold', true, 'align', 'left'
      ),
      jsonb_build_object(
        'id', 'turma', 'label', 'TURMA: ', 'x', 29.6, 'y', 76.8,
        'width', 50.5, 'fontSize', 11, 'visible', true,
        'color', '#071a33', 'bold', true, 'align', 'left'
      ),
      jsonb_build_object(
        'id', 'professor', 'label', '', 'x', 66.3, 'y', 83.5,
        'width', 23.5, 'fontSize', 10, 'visible', true,
        'color', '#071a33', 'bold', false, 'borderTop', true, 'align', 'center'
      )
    )
  END;
  SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', campo -> 'id',
    'label', campo -> 'label',
    'x', campo -> 'x',
    'y', campo -> 'y',
    'width', campo -> 'width',
    'fontSize', campo -> 'fontSize',
    'visible', campo -> 'visible',
    'color', campo -> 'color',
    'bold', campo -> 'bold',
    'borderTop', campo -> 'borderTop',
    'align', campo -> 'align'
  )) ORDER BY ordinalidade), '[]'::jsonb)
  INTO v_capa_campos
  FROM jsonb_array_elements(v_capa_campos) WITH ORDINALITY AS item(campo, ordinalidade);

  v_template_normalizado := jsonb_build_object(
    'capaUrl', nullif(btrim(v_template.conteudo ->> 'capaUrl'), ''),
    'contracapaUrl', nullif(btrim(v_template.conteudo ->> 'contracapaUrl'), ''),
    'cabecalhoLogoUrl', coalesce(
      nullif(btrim(v_empresa.logo_url), ''),
      nullif(btrim(v_polo.logo_url), '')
    ),
    'rodape', coalesce(
      nullif(btrim(v_template.conteudo ->> 'rodape'), ''),
      'Documento Oficial — Diário de Classe emitido eletronicamente'
    ),
    'imprimirInstrucoes', CASE
      WHEN jsonb_typeof(v_template.conteudo -> 'imprimirInstrucoes') = 'boolean'
        THEN (v_template.conteudo ->> 'imprimirInstrucoes')::boolean
      ELSE true
    END,
    'capaCampos', v_capa_campos,
    'imprimirValidacaoContracapa', CASE
      WHEN jsonb_typeof(v_template.conteudo -> 'imprimirValidacaoContracapa') = 'boolean'
        THEN (v_template.conteudo ->> 'imprimirValidacaoContracapa')::boolean
      ELSE true
    END,
    'mensagemValidacao', coalesce(
      nullif(btrim(v_template.conteudo ->> 'mensagemValidacao'), ''),
      'Este diário de classe eletrônico foi gerado e assinado digitalmente.'
    ),
    'qrCodeSize', CASE
      WHEN jsonb_typeof(v_template.conteudo -> 'qrCodeSize') = 'number'
        THEN least(50, greatest(16, (v_template.conteudo ->> 'qrCodeSize')::integer))
      ELSE 28
    END
  );
  v_identity := jsonb_build_object(
    'institution', jsonb_build_object(
      'name', coalesce(nullif(btrim(v_empresa.nome_fantasia), ''), nullif(btrim(v_polo.nome), ''), ''),
      'legalName', coalesce(nullif(btrim(v_empresa.razao_social), ''), nullif(btrim(v_polo.nome), ''), ''),
      'cnpj', coalesce(nullif(btrim(v_empresa.cnpj), ''), nullif(btrim(v_polo.cnpj), ''), ''),
      'address', coalesce(nullif(btrim(v_empresa.endereco), ''), nullif(btrim(v_polo.endereco), ''), ''),
      'number', coalesce(nullif(btrim(v_empresa.numero), ''), nullif(btrim(v_polo.numero), ''), ''),
      'complement', coalesce(nullif(btrim(v_empresa.complemento), ''), ''),
      'neighborhood', coalesce(nullif(btrim(v_empresa.bairro), ''), nullif(btrim(v_polo.bairro), ''), ''),
      'city', coalesce(nullif(btrim(v_empresa.cidade), ''), nullif(btrim(v_polo.cidade), ''), ''),
      'state', coalesce(nullif(btrim(v_empresa.uf), ''), nullif(btrim(v_polo.estado), ''), ''),
      'postalCode', coalesce(nullif(btrim(v_empresa.cep), ''), nullif(btrim(v_polo.cep), ''), ''),
      'phone', coalesce(nullif(btrim(v_empresa.telefone), ''), nullif(btrim(v_polo.telefone), ''), ''),
      'email', coalesce(nullif(btrim(v_empresa.email), ''), nullif(btrim(v_polo.email), ''), ''),
      'isHeadquarters', coalesce(v_polo.is_matriz, false)
        OR coalesce(v_empresa.tipo = 'Matriz', false)
    ),
    'logoUrl', coalesce(
      nullif(btrim(v_empresa.logo_url), ''),
      nullif(btrim(v_polo.logo_url), '')
    ),
    'watermarkUrl', coalesce(
      nullif(btrim(v_polo.watermark_url), ''),
      nullif(btrim(v_empresa.watermark_url), '')
    )
  );
  v_asset_sources := jsonb_build_object(
    'coverUrl', v_template_normalizado -> 'capaUrl',
    'backCoverUrl', v_template_normalizado -> 'contracapaUrl',
    'headerLogoUrl', v_identity -> 'logoUrl',
    'watermarkUrl', v_identity -> 'watermarkUrl'
  );
  IF coalesce(v_asset_sources ->> 'headerLogoUrl', '') !~ '^https://[^/?#@]+(/[^?#]*)?$'
     OR (
       v_asset_sources ->> 'coverUrl' IS NOT NULL
       AND v_asset_sources ->> 'coverUrl' !~ '^https://[^/?#@]+(/[^?#]*)?$'
     )
     OR (
       v_asset_sources ->> 'backCoverUrl' IS NOT NULL
       AND v_asset_sources ->> 'backCoverUrl' !~ '^https://[^/?#@]+(/[^?#]*)?$'
     )
     OR (
       v_asset_sources ->> 'watermarkUrl' IS NOT NULL
       AND v_asset_sources ->> 'watermarkUrl' !~ '^https://[^/?#@]+(/[^?#]*)?$'
     )
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_DIARIO_ASSET_CANONICO_INDISPONIVEL';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', aluno.aluno_id,
    'nome', aluno.nome,
    'matricula', public.formatar_matricula_validacao(
      aluno.matricula_id, aluno.data_matricula, v_polo.id
    )
  ) ORDER BY lower(aluno.nome), aluno.aluno_id), '[]'::jsonb)
  INTO v_students
  FROM public.get_diario_alunos(p_turma_id, p_disciplina_id) AS aluno;
  IF jsonb_array_length(v_students) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_DIARIO_ALUNOS_AUSENTES';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.aulas_turma AS aula
    WHERE aula.turma_id = p_turma_id
      AND aula.disciplina_id = p_disciplina_id
      AND aula.data_aula IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_DIARIO_DATA_AULA_AUSENTE';
  END IF;

  WITH aulas_ordenadas AS (
    SELECT
      aula.*,
      aula.data_aula::text AS encontro_chave,
      row_number() OVER (
        ORDER BY aula.data_aula, aula.created_at, aula.id
      ) AS ordem
    FROM public.aulas_turma AS aula
    WHERE aula.turma_id = p_turma_id
      AND aula.disciplina_id = p_disciplina_id
  ), encontros AS (
    SELECT
      encontro_chave,
      min(ordem) AS ordem,
      (array_agg(id ORDER BY data_aula, created_at, id))[1] AS id,
      (array_agg(titulo ORDER BY data_aula, created_at, id))[1] AS titulo,
      sum(carga_horaria) AS carga_horaria,
      min(data_aula)::text AS data_source,
      jsonb_agg(jsonb_build_object(
        'id', id,
        'periodo', coalesce(sessao::text, 'U'),
        'cargaHoraria', carga_horaria
      ) ORDER BY CASE coalesce(sessao::text, 'U')
        WHEN 'M' THEN 1 WHEN 'T' THEN 2 WHEN 'N' THEN 3 WHEN 'U' THEN 4 ELSE 9 END, id) AS sessoes
    FROM aulas_ordenadas
    GROUP BY encontro_chave
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'titulo', titulo,
    'cargaHoraria', carga_horaria,
    'dataSource', data_source,
    'sessoes', sessoes
  ) ORDER BY data_source, ordem), '[]'::jsonb)
  INTO v_aulas
  FROM encontros;
  SELECT count(*) INTO v_session_count
  FROM public.aulas_turma AS aula
  WHERE aula.turma_id = p_turma_id
    AND aula.disciplina_id = p_disciplina_id;
  IF v_session_count = 0 OR jsonb_array_length(v_aulas) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_DIARIO_AULAS_AUSENTES';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_students) AS aluno
    CROSS JOIN public.aulas_turma AS aula
    LEFT JOIN public.diario_frequencia AS frequencia
      ON frequencia.turma_id = p_turma_id
     AND frequencia.disciplina_id = p_disciplina_id
     AND frequencia.aluno_id = (aluno ->> 'id')::uuid
     AND frequencia.aula_id = aula.id
    WHERE aula.turma_id = p_turma_id
      AND aula.disciplina_id = p_disciplina_id
      AND (frequencia.aula_id IS NULL OR frequencia.status::text NOT IN ('P', 'F', 'J'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_DIARIO_FREQUENCIA_AUSENTE';
  END IF;
  SELECT coalesce(jsonb_object_agg(
    aluno ->> 'id',
    (
      SELECT jsonb_object_agg(aula.id::text, frequencia.status::text ORDER BY aula.id)
      FROM public.aulas_turma AS aula
      JOIN public.diario_frequencia AS frequencia
        ON frequencia.turma_id = p_turma_id
       AND frequencia.disciplina_id = p_disciplina_id
       AND frequencia.aluno_id = (aluno ->> 'id')::uuid
       AND frequencia.aula_id = aula.id
      WHERE aula.turma_id = p_turma_id
        AND aula.disciplina_id = p_disciplina_id
    ) ORDER BY aluno ->> 'id'
  ), '{}'::jsonb)
  INTO v_attendance_map
  FROM jsonb_array_elements(v_students) AS aluno;

  SELECT count(*) INTO v_grade_count
  FROM public.get_diario_resultados(p_turma_id, p_disciplina_id) AS resultado;
  IF v_grade_count <> jsonb_array_length(v_students) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_DIARIO_RESULTADO_AUSENTE';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.get_diario_resultados(p_turma_id, p_disciplina_id) AS resultado
    WHERE resultado.total_aulas <> v_session_count
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_DIARIO_RESULTADO_INCOERENTE';
  END IF;
  SELECT jsonb_object_agg(resultado.aluno_id::text, jsonb_build_object(
    'p', resultado.nota_p,
    'ti', resultado.nota_ti,
    'tg', resultado.nota_tg,
    's', resultado.nota_s,
    'cq', resultado.nota_cq,
    'o', resultado.nota_o,
    'rec', resultado.nota_rec,
    'total_aulas', resultado.total_aulas,
    'total_faltas', resultado.total_faltas,
    'frequencia_percent', resultado.frequencia_percent,
    'media_parcial', resultado.media_parcial,
    'media_final', resultado.media_final,
    'resultado_final', resultado.resultado_final
  ) ORDER BY resultado.aluno_id)
  INTO v_grades_map
  FROM public.get_diario_resultados(p_turma_id, p_disciplina_id) AS resultado;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_aulas) AS aula
    CROSS JOIN LATERAL jsonb_array_elements(aula -> 'sessoes') AS sessao
    LEFT JOIN public.diario_praticas AS pratica
      ON pratica.aula_id = (sessao ->> 'id')::uuid
     AND pratica.turma_id = p_turma_id
     AND pratica.disciplina_id = p_disciplina_id
    WHERE pratica.aula_id IS NULL
       OR btrim(coalesce(pratica.pratica_pedagogica, '')) = ''
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_DIARIO_PRATICA_AUSENTE';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_aulas) AS aula
    CROSS JOIN LATERAL jsonb_array_elements(aula -> 'sessoes') AS sessao
    JOIN public.diario_praticas AS pratica
      ON pratica.aula_id = (sessao ->> 'id')::uuid
     AND pratica.turma_id = p_turma_id
     AND pratica.disciplina_id = p_disciplina_id
    GROUP BY aula ->> 'id'
    HAVING count(DISTINCT btrim(pratica.pratica_pedagogica)) <> 1
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_DIARIO_PRATICA_INCOERENTE';
  END IF;
  SELECT coalesce(jsonb_object_agg(
    aula ->> 'id',
    (
      SELECT min(btrim(pratica.pratica_pedagogica))
      FROM jsonb_array_elements(aula -> 'sessoes') AS sessao
      JOIN public.diario_praticas AS pratica
        ON pratica.aula_id = (sessao ->> 'id')::uuid
       AND pratica.turma_id = p_turma_id
       AND pratica.disciplina_id = p_disciplina_id
    )
    ORDER BY aula ->> 'id'
  ), '{}'::jsonb)
  INTO v_praticas_map
  FROM jsonb_array_elements(v_aulas) AS aula;
  SELECT coalesce(observacao.observacoes, '') INTO v_observacoes
  FROM public.diario_observacoes AS observacao
  WHERE observacao.turma_id = p_turma_id
    AND observacao.disciplina_id = p_disciplina_id;
  v_observacoes := coalesce(v_observacoes, '');
  v_active_instruments := coalesce(
    v_vinculo.instrumentos_avaliativos,
    jsonb_build_object('p', true, 'ti', true, 'tg', true, 's', true, 'cq', true, 'o', true)
  );
  v_closure_snapshot := jsonb_build_object(
    'lock', 'PROFESSOR',
    'hoursCompleted', v_realizadas,
    'requiredHours', v_disciplina.carga_horaria,
    'snapshotAt', statement_timestamp()
  );
  v_academic_revision_sha256 := public.assinatura_eletronica_sha256_json(jsonb_build_object(
    'students', v_students,
    'aulas', v_aulas,
    'attendanceMap', v_attendance_map,
    'gradesMap', v_grades_map,
    'praticasMap', v_praticas_map,
    'observacoes', v_observacoes,
    'activeInstruments', v_active_instruments,
    'closure', v_closure_snapshot
  ));

  v_documento_snapshot := jsonb_build_object(
    'schemaVersion', 2,
    'composerSchemaVersion', 1,
    'documentType', 'diario_classe',
    'source', jsonb_build_object(
      'type', 'DIARIO',
      'turmaId', v_turma.id,
      'disciplinaId', v_disciplina.id,
      'originVersion', v_origem_versao,
      'courseId', v_curso.id,
      'poloId', v_polo.id,
      'companyId', v_empresa.id,
      'academicRevisionSha256', v_academic_revision_sha256
    ),
    'template', v_template_normalizado,
    'templateSource', jsonb_build_object(
      'id', v_template.id,
      'updatedAt', v_template.updated_at,
      'version', coalesce((v_template.conteudo ->> 'versao')::integer, 1),
      'raw', v_template.conteudo,
      'sha256', public.assinatura_eletronica_sha256_json(v_template.conteudo)
    ),
    'turma', jsonb_build_object(
      'id', v_turma.id,
      'cursoNome', v_curso.nome,
      'nome', v_turma.nome,
      'codigo', v_turma.codigo
    ),
    'disciplina', jsonb_build_object(
      'id', v_disciplina.id,
      'nome', v_disciplina.nome,
      'professor', v_professor.nome,
      'cargaHoraria', v_disciplina.carga_horaria
    ),
    'moduloNome', v_modulo.nome,
    'students', v_students,
    'aulas', v_aulas,
    'attendanceMap', v_attendance_map,
    'gradesMap', v_grades_map,
    'praticasMap', v_praticas_map,
    'observacoes', v_observacoes,
    'activeInstruments', v_active_instruments,
    'exportMode', 'PREENCHIDO',
    'validationCode', upper(v_envelope_id::text),
    'validationPreview', false,
    'institutionalIdentity', v_identity,
    'assetSources', v_asset_sources,
    'closure', v_closure_snapshot,
    'generatedAt', statement_timestamp()
  );
  IF NOT public.assinatura_eletronica_snapshot_academico_diario_valido(v_documento_snapshot) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASSINATURA_DIARIO_SNAPSHOT_INVALIDO';
  END IF;
  v_academico_snapshot_sha256 := public.assinatura_eletronica_sha256_json(v_documento_snapshot);
  v_geometria_snapshot := jsonb_build_object(
    'schemaVersion', 1,
    'coordinateSpace', 'PAGE_TOP_LEFT_BP_V1',
    'assetId', v_politica.politica -> 'editor' -> 'signatureStamp' -> 'assetId',
    'assetSnapshot', coalesce(v_politica.politica -> 'signatureStampAssetSnapshot', 'null'::jsonb),
    'layout', v_politica.politica -> 'editor' -> 'signatureStamp' -> 'layout',
    'slots', v_politica.politica -> 'editor' -> 'signatureStamp' -> 'slots'
  );

  INSERT INTO public.assinatura_eletronica_envelopes (
    id, company_id, polo_id, documento, titulo, revisao_rotulo,
    politica_id, politica_versao, politica_snapshot, certificado_snapshot,
    status, request_id, criado_por, origem_tipo, turma_id, disciplina_id,
    origem_versao, documento_snapshot, academico_snapshot_sha256, geometria_snapshot,
    criado_contexto_tipo, criado_contexto_id
  ) VALUES (
    v_envelope_id, v_polo.company_id, v_polo.id, 'diario_classe',
    'Diário de Classe · ' || v_turma.nome || ' · ' || v_disciplina.nome,
    'Versão ' || v_origem_versao,
    v_politica.id, v_politica.versao, v_politica.politica, v_politica.certificado,
    'RASCUNHO', p_request_id, v_actor, 'DIARIO', v_turma.id, v_disciplina.id,
    v_origem_versao, v_documento_snapshot, v_academico_snapshot_sha256, v_geometria_snapshot,
    'GESTOR', p_context_id
  );

  INSERT INTO public.assinatura_eletronica_participantes (
    id, envelope_id, papel, ordem, obrigatorio, parceiro_id, auth_user_id,
    vinculo_verificado_em, status, contexto_tipo, contexto_id,
    coordenacao_id, identidade_snapshot, vinculo_snapshot
  ) VALUES
  (
    v_professor_participante_id, v_envelope_id, 'PROFESSOR', 1, true,
    v_professor.id, v_professor.auth_user_id, statement_timestamp(),
    'AGUARDANDO_ORDEM', 'PROFESSOR', v_professor.id, NULL,
    jsonb_build_object(
      'schemaVersion', 1, 'partnerId', v_professor.id,
      'authUserId', v_professor.auth_user_id, 'name', v_professor.nome,
      'role', 'PROFESSOR'
    ),
    jsonb_build_object(
      'schemaVersion', 1, 'type', 'TURMA_DISCIPLINA',
      'turmaId', v_turma.id, 'disciplinaId', v_disciplina.id,
      'professorId', v_professor.id
    )
  ),
  (
    v_coordenador_participante_id, v_envelope_id, 'COORDENADOR', 2, true,
    v_coordenador.id, v_coordenador.auth_user_id, statement_timestamp(),
    'AGUARDANDO_ORDEM', 'COORDENADOR', v_coordenador.id, v_coordenacao.id,
    jsonb_build_object(
      'schemaVersion', 1, 'partnerId', v_coordenador.id,
      'authUserId', v_coordenador.auth_user_id, 'name', v_coordenador.nome,
      'role', 'COORDENADOR'
    ),
    jsonb_build_object(
      'schemaVersion', 1, 'type', 'COORDENACAO_CURSO',
      'turmaId', v_turma.id, 'disciplinaId', v_disciplina.id,
      'cursoId', v_curso.id, 'poloId', v_polo.id,
      'coordenacaoId', v_coordenacao.id
    )
  );

  PERFORM public.assinatura_eletronica_adicionar_evento(
    v_envelope_id, NULL, 'ENVELOPE_CRIADO', v_actor,
    jsonb_build_object('requestId', p_request_id, 'originVersion', v_origem_versao)
  );
  PERFORM public.assinatura_eletronica_adicionar_evento(
    v_envelope_id, v_professor_participante_id, 'PARTICIPANTE_ADICIONADO', v_actor,
    jsonb_build_object('role', 'PROFESSOR', 'order', 1)
  );
  PERFORM public.assinatura_eletronica_adicionar_evento(
    v_envelope_id, v_coordenador_participante_id, 'PARTICIPANTE_ADICIONADO', v_actor,
    jsonb_build_object('role', 'COORDENADOR', 'order', 2)
  );

  v_resultado := jsonb_build_object(
    'envelopeId', v_envelope_id,
    'documentType', 'diario_classe',
    'originType', 'DIARIO',
    'originVersion', v_origem_versao,
    'composerSchemaVersion', 1,
    'academicSnapshotSha256', v_academico_snapshot_sha256,
    'status', 'RASCUNHO',
    'statusLabel', public.assinatura_eletronica_envelope_status_label('RASCUNHO'),
    'participants', jsonb_build_array(
      jsonb_build_object(
        'participantId', v_professor_participante_id,
        'role', 'PROFESSOR',
        'roleLabel', public.assinatura_eletronica_papel_label('PROFESSOR'),
        'order', 1,
        'status', 'AGUARDANDO_ORDEM',
        'statusLabel', public.assinatura_eletronica_participante_status_label('AGUARDANDO_ORDEM'),
        'contextId', v_professor.id,
        'canAct', false,
        'signedAt', NULL
      ),
      jsonb_build_object(
        'participantId', v_coordenador_participante_id,
        'role', 'COORDENADOR',
        'roleLabel', public.assinatura_eletronica_papel_label('COORDENADOR'),
        'order', 2,
        'status', 'AGUARDANDO_ORDEM',
        'statusLabel', public.assinatura_eletronica_participante_status_label('AGUARDANDO_ORDEM'),
        'contextId', v_coordenador.id,
        'canAct', false,
        'signedAt', NULL
      )
    )
  );

  INSERT INTO public.assinatura_eletronica_operacoes (
    actor_scope, actor_auth_user_id, operacao, request_id, payload_sha256, resultado
  ) VALUES (
    'user:' || v_actor::text, v_actor, 'SOLICITAR_ENVELOPE_DIARIO',
    p_request_id, v_payload_sha256, v_resultado
  );

  RETURN v_resultado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_obter_envelope(
  p_envelope_id uuid,
  p_perfil text,
  p_context_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_perfil text := upper(btrim(coalesce(p_perfil, '')));
  v_envelope public.assinatura_eletronica_envelopes%ROWTYPE;
  v_participante public.assinatura_eletronica_participantes%ROWTYPE;
  v_can_manage boolean := false;
  v_participantes jsonb;
  v_artefatos jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTENTICACAO_OBRIGATORIA';
  END IF;
  IF p_envelope_id IS NULL OR p_context_id IS NULL
     OR NOT public.assinatura_eletronica_perfil_contexto_valido(v_actor, v_perfil, p_context_id)
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ASSINATURA_PERFIL_CONTEXTO_NAO_AUTORIZADO';
  END IF;

  SELECT envelope.* INTO v_envelope
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = p_envelope_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ASSINATURA_ENVELOPE_NAO_ENCONTRADO';
  END IF;

  IF v_perfil = 'GESTOR' THEN
    v_can_manage := public.assinatura_eletronica_gestor_pode_gerir_diario(
      v_actor, p_context_id, v_envelope.turma_id, v_envelope.polo_id
    );
  ELSE
    SELECT participante.* INTO v_participante
    FROM public.assinatura_eletronica_participantes AS participante
    WHERE participante.envelope_id = v_envelope.id
      AND participante.papel = v_perfil
      AND participante.contexto_tipo = v_perfil
      AND participante.contexto_id = p_context_id
      AND participante.auth_user_id = v_actor
    LIMIT 1;
  END IF;

  IF NOT v_can_manage AND v_participante.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ASSINATURA_ENVELOPE_NAO_AUTORIZADO';
  END IF;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'participantId', participante.id,
      'role', participante.papel,
      'roleLabel', public.assinatura_eletronica_papel_label(participante.papel),
      'order', participante.ordem,
      'status', participante.status,
      'statusLabel', public.assinatura_eletronica_participante_status_label(participante.status),
      'contextId', participante.contexto_id,
      'canAct', participante.auth_user_id = v_actor
        AND participante.contexto_id = p_context_id
        AND participante.papel = v_perfil
        AND participante.status IN ('PENDENTE', 'DESAFIO_PENDENTE')
        AND v_envelope.status IN ('PENDENTE', 'EM_ASSINATURA')
        AND NOT EXISTS (
          SELECT 1
          FROM public.assinatura_eletronica_participantes AS anterior
          WHERE anterior.envelope_id = participante.envelope_id
            AND anterior.ordem < participante.ordem
            AND anterior.status <> 'ASSINADO'
        ),
      'signedAt', participante.assinado_em
    ) ORDER BY participante.ordem), '[]'::jsonb)
  INTO v_participantes
  FROM public.assinatura_eletronica_participantes AS participante
  WHERE participante.envelope_id = v_envelope.id;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'artifactId', artefato.id,
      'class', artefato.classe,
      'bucketId', artefato.bucket_id,
      'storagePath', artefato.storage_path,
      'mimeType', artefato.mime_type,
      'byteSize', artefato.tamanho_bytes,
      'sha256', artefato.sha256,
      'immutableAt', artefato.imutavel_em
    ) ORDER BY artefato.created_at, artefato.id), '[]'::jsonb)
  INTO v_artefatos
  FROM public.assinatura_eletronica_artefatos AS artefato
  WHERE artefato.envelope_id = v_envelope.id;

  RETURN jsonb_build_object(
    'envelope', jsonb_build_object(
      'envelopeId', v_envelope.id,
      'documentType', v_envelope.documento,
      'title', v_envelope.titulo,
      'revisionLabel', v_envelope.revisao_rotulo,
      'originType', v_envelope.origem_tipo,
      'originVersion', v_envelope.origem_versao,
      'status', v_envelope.status,
      'statusLabel', public.assinatura_eletronica_envelope_status_label(v_envelope.status),
      'deadlineAt', v_envelope.prazo_em,
      'createdAt', v_envelope.created_at,
      'updatedAt', v_envelope.updated_at,
      'policyVersion', v_envelope.politica_versao,
      'documentSnapshot', v_envelope.documento_snapshot,
      'academicSnapshotSha256', v_envelope.academico_snapshot_sha256,
      'geometrySnapshot', v_envelope.geometria_snapshot,
      'semanticManifestSnapshot', v_envelope.pdf_semantic_manifest_snapshot,
      'frozenSignatureTargetSnapshot', v_envelope.pdf_signature_target_snapshot,
      'original', jsonb_build_object(
        'ready', v_envelope.documento_original_sha256 IS NOT NULL,
        'sha256', v_envelope.documento_original_sha256,
        'immutableAt', v_envelope.original_congelado_em
      ),
      'final', jsonb_build_object(
        'ready', v_envelope.documento_final_sha256 IS NOT NULL,
        'sha256', v_envelope.documento_final_sha256,
        'finalizedAt', v_envelope.finalizado_em
      ),
      'artifacts', v_artefatos
    ),
    'participant', CASE WHEN v_participante.id IS NULL THEN NULL ELSE jsonb_build_object(
      'participantId', v_participante.id,
      'role', v_participante.papel,
      'roleLabel', public.assinatura_eletronica_papel_label(v_participante.papel),
      'order', v_participante.ordem,
      'status', v_participante.status,
      'statusLabel', public.assinatura_eletronica_participante_status_label(v_participante.status),
      'contextId', v_participante.contexto_id,
      'canAct', v_participante.status IN ('PENDENTE', 'DESAFIO_PENDENTE')
        AND v_envelope.status IN ('PENDENTE', 'EM_ASSINATURA')
        AND NOT EXISTS (
          SELECT 1
          FROM public.assinatura_eletronica_participantes AS anterior
          WHERE anterior.envelope_id = v_participante.envelope_id
            AND anterior.ordem < v_participante.ordem
            AND anterior.status <> 'ASSINADO'
        ),
      'signedAt', v_participante.assinado_em
    ) END,
    'participants', v_participantes,
    'canManage', v_can_manage
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_listar_caixa_contexto(
  p_perfil text,
  p_context_id uuid,
  p_status text DEFAULT 'PENDENTES',
  p_polo_id uuid DEFAULT NULL,
  p_limite integer DEFAULT 50,
  p_cursor_updated_at timestamptz DEFAULT NULL,
  p_cursor_envelope_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_perfil text := upper(btrim(coalesce(p_perfil, '')));
  v_status text := upper(btrim(coalesce(p_status, 'PENDENTES')));
  v_items jsonb;
  v_next jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTENTICACAO_OBRIGATORIA';
  END IF;
  IF p_context_id IS NULL
     OR NOT public.assinatura_eletronica_perfil_contexto_valido(v_actor, v_perfil, p_context_id)
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ASSINATURA_PERFIL_CONTEXTO_NAO_AUTORIZADO';
  END IF;
  IF v_status NOT IN ('PENDENTES', 'ASSINADOS', 'TODOS')
     OR p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 100
     OR ((p_cursor_updated_at IS NULL) <> (p_cursor_envelope_id IS NULL))
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_FILTRO_CAIXA_INVALIDO';
  END IF;

  WITH base AS (
    SELECT
      envelope.*,
      participante.id AS participante_id,
      participante.papel AS participante_papel,
      participante.ordem AS participante_ordem,
      participante.status AS participante_status,
      participante.assinado_em AS participante_assinado_em,
      CASE
        WHEN envelope.status = 'FINALIZANDO' THEN 'FINALIZATION_IN_PROGRESS'
        WHEN participante.status = 'AGUARDANDO_ORDEM' THEN 'WAITING_PREVIOUS_SIGNER'
        WHEN participante.status IN ('PENDENTE', 'DESAFIO_PENDENTE')
          AND envelope.status IN ('PENDENTE', 'EM_ASSINATURA')
          AND NOT EXISTS (
            SELECT 1 FROM public.assinatura_eletronica_participantes AS anterior
            WHERE anterior.envelope_id = envelope.id
              AND anterior.ordem < participante.ordem
              AND anterior.status <> 'ASSINADO'
          ) THEN 'SIGN'
        ELSE 'VIEW'
      END AS primary_action
    FROM public.assinatura_eletronica_envelopes AS envelope
    LEFT JOIN public.assinatura_eletronica_participantes AS participante
      ON participante.envelope_id = envelope.id
     AND participante.papel = v_perfil
     AND participante.contexto_tipo = v_perfil
     AND participante.contexto_id = p_context_id
     AND participante.auth_user_id = v_actor
    WHERE (p_polo_id IS NULL OR envelope.polo_id = p_polo_id)
      AND (
        (v_perfil = 'GESTOR' AND public.assinatura_eletronica_gestor_pode_gerir_diario(
          v_actor, p_context_id, envelope.turma_id, envelope.polo_id
        ))
        OR participante.id IS NOT NULL
      )
      AND (
        v_status = 'TODOS'
        OR (v_status = 'PENDENTES' AND envelope.status IN ('RASCUNHO', 'PENDENTE', 'EM_ASSINATURA', 'FINALIZANDO'))
        OR (v_status = 'ASSINADOS' AND envelope.status = 'ASSINADO')
      )
      AND (
        p_cursor_updated_at IS NULL
        OR (envelope.updated_at, envelope.id) < (p_cursor_updated_at, p_cursor_envelope_id)
      )
    ORDER BY envelope.updated_at DESC, envelope.id DESC
    LIMIT p_limite + 1
  ), page AS (
    SELECT * FROM base
    ORDER BY updated_at DESC, id DESC
    LIMIT p_limite
  )
  SELECT
    coalesce(jsonb_agg(jsonb_build_object(
      'envelopeId', page.id,
      'participantId', page.participante_id,
      'title', page.titulo,
      'documentType', page.documento,
      'originType', page.origem_tipo,
      'originVersion', page.origem_versao,
      'revisionLabel', page.revisao_rotulo,
      'participantRole', page.participante_papel,
      'participantRoleLabel', CASE WHEN page.participante_papel IS NULL THEN NULL
        ELSE public.assinatura_eletronica_papel_label(page.participante_papel) END,
      'participantOrder', page.participante_ordem,
      'participantStatus', page.participante_status,
      'participantStatusLabel', CASE WHEN page.participante_status IS NULL THEN NULL
        ELSE public.assinatura_eletronica_participante_status_label(page.participante_status) END,
      'status', page.status,
      'statusLabel', public.assinatura_eletronica_envelope_status_label(page.status),
      'deadlineAt', page.prazo_em,
      'updatedAt', page.updated_at,
      'primaryAction', CASE WHEN v_perfil = 'GESTOR' AND page.primary_action <> 'FINALIZATION_IN_PROGRESS'
        THEN 'VIEW' ELSE page.primary_action END,
      'primaryActionLabel', CASE
        WHEN page.primary_action = 'SIGN' THEN 'Assinar'
        WHEN page.primary_action = 'WAITING_PREVIOUS_SIGNER' THEN 'Aguardando assinatura anterior'
        WHEN page.primary_action = 'FINALIZATION_IN_PROGRESS' THEN 'Finalização em andamento'
        ELSE 'Visualizar'
      END,
      'canAct', v_perfil <> 'GESTOR' AND page.primary_action = 'SIGN',
      'message', CASE
        WHEN page.primary_action = 'WAITING_PREVIOUS_SIGNER' THEN 'A assinatura anterior ainda não foi concluída.'
        WHEN page.primary_action = 'FINALIZATION_IN_PROGRESS' THEN 'As assinaturas foram concluídas e o PDF final está sendo preparado.'
        ELSE NULL
      END
    ) ORDER BY page.updated_at DESC, page.id DESC), '[]'::jsonb),
    CASE WHEN EXISTS (SELECT 1 FROM base OFFSET p_limite) THEN (
      SELECT jsonb_build_object('updatedAt', page_cursor.updated_at, 'envelopeId', page_cursor.id)
      FROM page AS page_cursor
      ORDER BY page_cursor.updated_at ASC, page_cursor.id ASC
      LIMIT 1
    ) ELSE NULL END
  INTO v_items, v_next
  FROM page;

  RETURN jsonb_build_object('items', v_items, 'nextCursor', v_next);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7. RPCs service_role: publicação do original e reautenticação por senha.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_validar_escopo_reauth(
  p_envelope_id uuid,
  p_participante_id uuid,
  p_perfil text,
  p_context_id uuid,
  p_actor_auth_user_id uuid,
  p_fase text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_envelope public.assinatura_eletronica_envelopes%ROWTYPE;
  v_participante public.assinatura_eletronica_participantes%ROWTYPE;
  v_perfil text := upper(btrim(coalesce(p_perfil, '')));
  v_fase text := upper(btrim(coalesce(p_fase, '')));
  v_email text;
  v_password_enabled boolean;
BEGIN
  IF v_perfil NOT IN ('PROFESSOR', 'COORDENADOR')
     OR v_fase NOT IN ('PREPARAR', 'REGISTRAR', 'CONSUMIR')
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_REAUTH_ESCOPO_INVALIDO';
  END IF;

  SELECT envelope.* INTO v_envelope
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = p_envelope_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ASSINATURA_ENVELOPE_NAO_ENCONTRADO';
  END IF;

  SELECT participante.* INTO v_participante
  FROM public.assinatura_eletronica_participantes AS participante
  WHERE participante.id = p_participante_id
    AND participante.envelope_id = p_envelope_id
  FOR UPDATE;
  IF NOT FOUND
     OR v_participante.papel <> v_perfil
     OR v_participante.contexto_tipo <> v_perfil
     OR v_participante.contexto_id IS DISTINCT FROM p_context_id
     OR v_participante.auth_user_id IS DISTINCT FROM p_actor_auth_user_id
     OR NOT public.assinatura_eletronica_perfil_contexto_valido(
       p_actor_auth_user_id, v_perfil, p_context_id
     )
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ASSINATURA_REAUTH_PARTICIPANTE_NAO_AUTORIZADO';
  END IF;

  IF (v_perfil = 'PROFESSOR' AND v_participante.ordem <> 1)
     OR (v_perfil = 'COORDENADOR' AND v_participante.ordem <> 2)
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASSINATURA_REAUTH_ORDEM_INVALIDA';
  END IF;

  IF v_fase IN ('PREPARAR', 'REGISTRAR') THEN
    IF v_envelope.status NOT IN ('PENDENTE', 'EM_ASSINATURA')
       OR v_participante.status NOT IN ('PENDENTE', 'DESAFIO_PENDENTE')
       OR EXISTS (
         SELECT 1
         FROM public.assinatura_eletronica_participantes AS anterior
         WHERE anterior.envelope_id = v_envelope.id
           AND anterior.ordem < v_participante.ordem
           AND anterior.status <> 'ASSINADO'
       )
    THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_REAUTH_ORDEM_OU_ESTADO_INVALIDO';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.assinatura_eletronica_politicas AS politica
      WHERE politica.id = v_envelope.politica_id
        AND politica.arquivada_em IS NULL
        AND politica.habilitada
        AND politica.status_juridico = 'APROVADA'
        AND politica.versao = v_envelope.politica_versao
        AND politica.politica = v_envelope.politica_snapshot
        AND politica.certificado = v_envelope.certificado_snapshot
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_POLITICA_NAO_HABILITADA';
    END IF;

    IF v_perfil = 'PROFESSOR' AND NOT EXISTS (
      SELECT 1
      FROM public.turmas_disciplinas AS vinculo
      WHERE vinculo.turma_id = v_envelope.turma_id
        AND vinculo.disciplina_id = v_envelope.disciplina_id
        AND vinculo.professor_id = v_participante.parceiro_id
        AND vinculo.bloqueio_diario = 'PROFESSOR'
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ASSINATURA_PROFESSOR_VINCULO_REVOGADO';
    END IF;
    IF v_perfil = 'COORDENADOR' AND NOT EXISTS (
      SELECT 1
      FROM public.professores_coordenacoes AS coordenacao
      JOIN public.turmas AS turma ON turma.id = v_envelope.turma_id
      WHERE coordenacao.id = v_participante.coordenacao_id
        AND coordenacao.professor_id = v_participante.parceiro_id
        AND coordenacao.curso_id = turma.curso_id
        AND coordenacao.polo_id = v_envelope.polo_id
        AND coordenacao.status = 'ATIVA'
        AND coordenacao.vigente_de <= statement_timestamp()
        AND (coordenacao.vigente_ate IS NULL OR coordenacao.vigente_ate > statement_timestamp())
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ASSINATURA_COORDENADOR_VINCULO_REVOGADO';
    END IF;
  ELSIF v_participante.status NOT IN ('DESAFIO_PENDENTE', 'ASSINADO')
        OR v_envelope.status NOT IN ('PENDENTE', 'EM_ASSINATURA', 'FINALIZANDO', 'ASSINADO')
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_REAUTH_CONSUMO_ESTADO_INVALIDO';
  END IF;

  -- O consumo também revalida autorização corrente antes de qualquer replay.
  -- Assim, um ticket não sobrevive à revogação da política ou do vínculo.
  IF v_fase = 'CONSUMIR' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.assinatura_eletronica_politicas AS politica
      WHERE politica.id = v_envelope.politica_id
        AND politica.arquivada_em IS NULL
        AND politica.habilitada
        AND politica.status_juridico = 'APROVADA'
        AND politica.versao = v_envelope.politica_versao
        AND politica.politica = v_envelope.politica_snapshot
        AND politica.certificado = v_envelope.certificado_snapshot
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_POLITICA_NAO_HABILITADA';
    END IF;

    IF v_perfil = 'PROFESSOR' AND NOT EXISTS (
      SELECT 1
      FROM public.turmas_disciplinas AS vinculo
      WHERE vinculo.turma_id = v_envelope.turma_id
        AND vinculo.disciplina_id = v_envelope.disciplina_id
        AND vinculo.professor_id = v_participante.parceiro_id
        AND vinculo.bloqueio_diario = 'PROFESSOR'
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ASSINATURA_PROFESSOR_VINCULO_REVOGADO';
    END IF;
    IF v_perfil = 'COORDENADOR' AND NOT EXISTS (
      SELECT 1
      FROM public.professores_coordenacoes AS coordenacao
      JOIN public.turmas AS turma ON turma.id = v_envelope.turma_id
      WHERE coordenacao.id = v_participante.coordenacao_id
        AND coordenacao.professor_id = v_participante.parceiro_id
        AND coordenacao.curso_id = turma.curso_id
        AND coordenacao.polo_id = v_envelope.polo_id
        AND coordenacao.status = 'ATIVA'
        AND coordenacao.vigente_de <= statement_timestamp()
        AND (coordenacao.vigente_ate IS NULL OR coordenacao.vigente_ate > statement_timestamp())
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ASSINATURA_COORDENADOR_VINCULO_REVOGADO';
    END IF;
  END IF;

  SELECT auth_user.email,
         nullif(btrim(coalesce(auth_user.encrypted_password, '')), '') IS NOT NULL
  INTO v_email, v_password_enabled
  FROM auth.users AS auth_user
  WHERE auth_user.id = p_actor_auth_user_id;
  IF v_email IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ASSINATURA_REAUTH_USUARIO_INVALIDO';
  END IF;

  RETURN jsonb_build_object(
    'email', v_email,
    'passwordEnabled', coalesce(v_password_enabled, false),
    'envelopeId', v_envelope.id,
    'envelopeStatus', v_envelope.status,
    'participantId', v_participante.id,
    'participantRole', v_participante.papel,
    'participantOrder', v_participante.ordem,
    'participantStatus', v_participante.status,
    'profile', v_perfil,
    'contextId', v_participante.contexto_id,
    'policyVersion', v_envelope.politica_versao
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_internal_preparar_original_diario(
  p_envelope_id uuid,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_envelope public.assinatura_eletronica_envelopes%ROWTYPE;
  v_payload_sha256 text;
  v_replay public.assinatura_eletronica_operacoes%ROWTYPE;
  v_participantes jsonb;
  v_resultado jsonb;
BEGIN
  PERFORM public.assinatura_eletronica_exigir_service_role();
  IF p_envelope_id IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_PREPARAR_ORIGINAL_PAYLOAD_INVALIDO';
  END IF;

  SELECT envelope.* INTO v_envelope
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = p_envelope_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ASSINATURA_ENVELOPE_NAO_ENCONTRADO';
  END IF;
  IF v_envelope.documento <> 'diario_classe'
     OR v_envelope.origem_tipo <> 'DIARIO'
     OR v_envelope.status <> 'RASCUNHO'
     OR v_envelope.documento_original_sha256 IS NOT NULL
     OR v_envelope.pdf_semantic_manifest_snapshot IS NOT NULL
     OR v_envelope.pdf_signature_target_snapshot IS NOT NULL
     OR NOT public.assinatura_eletronica_snapshot_academico_diario_valido(v_envelope.documento_snapshot)
     OR v_envelope.academico_snapshot_sha256 IS DISTINCT FROM
       public.assinatura_eletronica_sha256_json(v_envelope.documento_snapshot)
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_PREPARAR_ORIGINAL_ESTADO_INVALIDO';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.assinatura_eletronica_politicas AS politica
    WHERE politica.id = v_envelope.politica_id
      AND politica.arquivada_em IS NULL
      AND politica.habilitada
      AND politica.status_juridico = 'APROVADA'
      AND politica.versao = v_envelope.politica_versao
      AND politica.politica = v_envelope.politica_snapshot
      AND politica.certificado = v_envelope.certificado_snapshot
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_POLITICA_NAO_HABILITADA';
  END IF;
  IF (SELECT count(*) FROM public.assinatura_eletronica_participantes AS participante
      WHERE participante.envelope_id = v_envelope.id) <> 2
     OR NOT EXISTS (
       SELECT 1 FROM public.assinatura_eletronica_participantes AS participante
       WHERE participante.envelope_id = v_envelope.id
         AND participante.papel = 'PROFESSOR' AND participante.ordem = 1
         AND participante.obrigatorio AND participante.status = 'AGUARDANDO_ORDEM'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.assinatura_eletronica_participantes AS participante
       WHERE participante.envelope_id = v_envelope.id
         AND participante.papel = 'COORDENADOR' AND participante.ordem = 2
         AND participante.obrigatorio AND participante.status = 'AGUARDANDO_ORDEM'
     )
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASSINATURA_PARTICIPANTES_DIARIO_INVALIDOS';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'participantId', participante.id,
    'role', participante.papel,
    'order', participante.ordem,
    'identitySnapshot', participante.identidade_snapshot,
    'linkSnapshot', participante.vinculo_snapshot
  ) ORDER BY participante.ordem)
  INTO v_participantes
  FROM public.assinatura_eletronica_participantes AS participante
  WHERE participante.envelope_id = v_envelope.id;

  v_payload_sha256 := public.assinatura_eletronica_sha256_json(jsonb_build_object(
    'envelopeId', v_envelope.id,
    'academicSnapshotSha256', v_envelope.academico_snapshot_sha256,
    'geometrySnapshot', v_envelope.geometria_snapshot,
    'policyVersion', v_envelope.politica_versao
  ));
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('assinatura:original:preparar:' || p_request_id::text, 0)
  );
  SELECT operacao.* INTO v_replay
  FROM public.assinatura_eletronica_operacoes AS operacao
  WHERE operacao.actor_scope = 'service:system'
    AND operacao.operacao = 'PREPARAR_ORIGINAL_DIARIO'
    AND operacao.request_id = p_request_id;
  IF FOUND THEN
    IF v_replay.payload_sha256 IS DISTINCT FROM v_payload_sha256 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_IDEMPOTENCIA_DIVERGENTE';
    END IF;
    RETURN v_replay.resultado;
  END IF;

  v_resultado := jsonb_build_object(
    'envelopeId', v_envelope.id,
    'documentType', v_envelope.documento,
    'originVersion', v_envelope.origem_versao,
    'status', v_envelope.status,
    'composerSchemaVersion', (v_envelope.documento_snapshot ->> 'composerSchemaVersion')::integer,
    'academicSnapshot', v_envelope.documento_snapshot,
    'academicSnapshotSha256', v_envelope.academico_snapshot_sha256,
    'geometrySnapshot', v_envelope.geometria_snapshot,
    'policyVersion', v_envelope.politica_versao,
    'policySnapshot', v_envelope.politica_snapshot,
    'certificateSnapshot', v_envelope.certificado_snapshot,
    'participants', v_participantes,
    'originalDestination', jsonb_build_object(
      'bucketId', 'documentos-assinatura-eletronica',
      'storagePath', 'envelopes/' || v_envelope.id::text || '/documento-original.pdf'
    ),
    'verification', jsonb_build_object(
      'code', v_envelope.documento_snapshot ->> 'validationCode',
      'path', '/verificar-assinatura/' || (v_envelope.documento_snapshot ->> 'validationCode')
    )
  );
  INSERT INTO public.assinatura_eletronica_operacoes (
    actor_scope, operacao, request_id, payload_sha256, resultado
  ) VALUES (
    'service:system', 'PREPARAR_ORIGINAL_DIARIO', p_request_id,
    v_payload_sha256, v_resultado
  );
  RETURN v_resultado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_internal_registrar_original_publicar(
  p_envelope_id uuid,
  p_bucket_id text,
  p_storage_path text,
  p_tamanho_bytes bigint,
  p_sha256 text,
  p_academic_snapshot_sha256 text,
  p_semantic_manifest jsonb,
  p_frozen_signature_target jsonb,
  p_geometry_snapshot jsonb,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_envelope public.assinatura_eletronica_envelopes%ROWTYPE;
  v_payload_sha256 text;
  v_replay public.assinatura_eletronica_operacoes%ROWTYPE;
  v_professor_id uuid;
  v_resultado jsonb;
  v_sha256 text := lower(btrim(coalesce(p_sha256, '')));
  v_academic_snapshot_sha256 text := lower(btrim(coalesce(p_academic_snapshot_sha256, '')));
BEGIN
  PERFORM public.assinatura_eletronica_exigir_service_role();
  IF p_envelope_id IS NULL OR p_request_id IS NULL
     OR p_bucket_id <> 'documentos-assinatura-eletronica'
     OR p_storage_path IS DISTINCT FROM 'envelopes/' || p_envelope_id::text || '/documento-original.pdf'
     OR p_tamanho_bytes IS NULL OR p_tamanho_bytes NOT BETWEEN 1 AND 52428800
     OR v_sha256 !~ '^[0-9a-f]{64}$'
     OR v_academic_snapshot_sha256 !~ '^[0-9a-f]{64}$'
     OR NOT public.assinatura_eletronica_manifesto_diario_valido(p_semantic_manifest)
     OR NOT public.assinatura_eletronica_target_diario_valido(
       p_frozen_signature_target, p_semantic_manifest, v_sha256
     )
     OR jsonb_typeof(p_geometry_snapshot) <> 'object'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_ORIGINAL_PAYLOAD_INVALIDO';
  END IF;

  SELECT envelope.* INTO v_envelope
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = p_envelope_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ASSINATURA_ENVELOPE_NAO_ENCONTRADO';
  END IF;
  IF p_geometry_snapshot IS DISTINCT FROM v_envelope.geometria_snapshot THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASSINATURA_GEOMETRIA_SNAPSHOT_DIVERGENTE';
  END IF;
  IF v_academic_snapshot_sha256 IS DISTINCT FROM v_envelope.academico_snapshot_sha256
     OR v_envelope.academico_snapshot_sha256 IS DISTINCT FROM
       public.assinatura_eletronica_sha256_json(v_envelope.documento_snapshot)
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASSINATURA_ACADEMICO_SNAPSHOT_DIVERGENTE';
  END IF;
  v_payload_sha256 := public.assinatura_eletronica_sha256_json(jsonb_build_object(
    'envelopeId', p_envelope_id, 'bucketId', p_bucket_id,
    'storagePath', p_storage_path, 'byteSize', p_tamanho_bytes,
    'sha256', v_sha256,
    'academicSnapshotSha256', v_academic_snapshot_sha256,
    'semanticManifest', p_semantic_manifest,
    'frozenSignatureTarget', p_frozen_signature_target,
    'geometrySnapshot', p_geometry_snapshot
  ));
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('assinatura:original:' || p_request_id::text, 0)
  );
  SELECT operacao.* INTO v_replay
  FROM public.assinatura_eletronica_operacoes AS operacao
  WHERE operacao.actor_scope = 'service:system'
    AND operacao.operacao = 'REGISTRAR_ORIGINAL_PUBLICAR'
    AND operacao.request_id = p_request_id;
  IF FOUND THEN
    IF v_replay.payload_sha256 IS DISTINCT FROM v_payload_sha256 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_IDEMPOTENCIA_DIVERGENTE';
    END IF;
    RETURN v_replay.resultado;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.assinatura_eletronica_politicas AS politica
    WHERE politica.id = v_envelope.politica_id
      AND politica.arquivada_em IS NULL
      AND politica.habilitada
      AND politica.status_juridico = 'APROVADA'
      AND politica.politica = v_envelope.politica_snapshot
      AND politica.certificado = v_envelope.certificado_snapshot
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_POLITICA_NAO_HABILITADA';
  END IF;
  IF (SELECT count(*) FROM public.assinatura_eletronica_participantes AS participante
      WHERE participante.envelope_id = v_envelope.id) <> 2
     OR NOT EXISTS (
       SELECT 1 FROM public.assinatura_eletronica_participantes AS participante
       WHERE participante.envelope_id = v_envelope.id
         AND participante.papel = 'PROFESSOR' AND participante.ordem = 1
         AND participante.obrigatorio AND participante.status = 'AGUARDANDO_ORDEM'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.assinatura_eletronica_participantes AS participante
       WHERE participante.envelope_id = v_envelope.id
         AND participante.papel = 'COORDENADOR' AND participante.ordem = 2
         AND participante.obrigatorio AND participante.status = 'AGUARDANDO_ORDEM'
     )
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASSINATURA_PARTICIPANTES_DIARIO_INVALIDOS';
  END IF;

  IF v_envelope.status <> 'RASCUNHO'
     OR v_envelope.documento_original_sha256 IS NOT NULL
     OR v_envelope.pdf_semantic_manifest_snapshot IS NOT NULL
     OR v_envelope.pdf_signature_target_snapshot IS NOT NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_ORIGINAL_ESTADO_INVALIDO';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects AS objeto
    WHERE objeto.bucket_id = p_bucket_id AND objeto.name = p_storage_path
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_ORIGINAL_STORAGE_AUSENTE';
  END IF;

  UPDATE public.assinatura_eletronica_envelopes AS envelope
  SET documento_original_sha256 = v_sha256,
      pdf_semantic_manifest_snapshot = p_semantic_manifest,
      pdf_signature_target_snapshot = p_frozen_signature_target,
      original_congelado_em = statement_timestamp(),
      publicado_em = statement_timestamp(),
      status = 'PENDENTE'
  WHERE envelope.id = v_envelope.id;

  INSERT INTO public.assinatura_eletronica_artefatos (
    envelope_id, classe, bucket_id, storage_path, tamanho_bytes, sha256
  ) VALUES (
    v_envelope.id, 'DOCUMENTO_ORIGINAL', p_bucket_id, p_storage_path,
    p_tamanho_bytes, v_sha256
  );

  UPDATE public.assinatura_eletronica_participantes AS participante
  SET status = 'PENDENTE'
  WHERE participante.envelope_id = v_envelope.id
    AND participante.papel = 'PROFESSOR'
    AND participante.ordem = 1
    AND participante.status = 'AGUARDANDO_ORDEM'
  RETURNING participante.id INTO v_professor_id;

  PERFORM public.assinatura_eletronica_adicionar_evento(
    v_envelope.id, NULL, 'DOCUMENTO_ORIGINAL_CONGELADO', NULL,
    jsonb_build_object(
      'sha256', v_sha256,
      'byteSize', p_tamanho_bytes,
      'academicSnapshotSha256', v_academic_snapshot_sha256,
      'semanticManifest', p_semantic_manifest,
      'frozenSignatureTarget', p_frozen_signature_target
    )
  );
  PERFORM public.assinatura_eletronica_adicionar_evento(
    v_envelope.id, NULL, 'ENVELOPE_PUBLICADO', NULL,
    jsonb_build_object('requestId', p_request_id)
  );
  PERFORM public.assinatura_eletronica_adicionar_evento(
    v_envelope.id, v_professor_id, 'PARTICIPANTE_LIBERADO', NULL,
    jsonb_build_object('role', 'PROFESSOR', 'order', 1)
  );

  v_resultado := jsonb_build_object(
    'envelopeId', v_envelope.id,
    'status', 'PENDENTE',
    'statusLabel', public.assinatura_eletronica_envelope_status_label('PENDENTE'),
    'original', jsonb_build_object(
      'bucketId', p_bucket_id, 'storagePath', p_storage_path,
      'byteSize', p_tamanho_bytes, 'sha256', v_sha256,
      'immutableAt', statement_timestamp()
    ),
    'academicSnapshotSha256', v_academic_snapshot_sha256,
    'semanticManifestSnapshot', p_semantic_manifest,
    'frozenSignatureTargetSnapshot', p_frozen_signature_target,
    'firstParticipantId', v_professor_id,
    'firstParticipantRole', 'PROFESSOR'
  );
  INSERT INTO public.assinatura_eletronica_operacoes (
    actor_scope, operacao, request_id, payload_sha256, resultado
  ) VALUES (
    'service:system', 'REGISTRAR_ORIGINAL_PUBLICAR', p_request_id,
    v_payload_sha256, v_resultado
  );
  RETURN v_resultado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_internal_preparar_reautenticacao(
  p_envelope_id uuid,
  p_participante_id uuid,
  p_perfil text,
  p_context_id uuid,
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
  v_scope jsonb;
  v_actor_scope text;
  v_payload_sha256 text;
  v_replay public.assinatura_eletronica_operacoes%ROWTYPE;
  v_count integer;
  v_retry_after integer;
  v_resultado jsonb;
BEGIN
  PERFORM public.assinatura_eletronica_exigir_service_role();
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_REAUTH_REQUEST_ID_OBRIGATORIO';
  END IF;
  PERFORM public.assinatura_eletronica_exigir_sessao_ativa(p_actor_auth_user_id, p_auth_session_id);
  v_scope := public.assinatura_eletronica_validar_escopo_reauth(
    p_envelope_id, p_participante_id, p_perfil, p_context_id,
    p_actor_auth_user_id, 'PREPARAR'
  );
  v_actor_scope := 'service:user:' || p_actor_auth_user_id::text || ':session:' || p_auth_session_id::text;
  v_payload_sha256 := public.assinatura_eletronica_sha256_json(jsonb_build_object(
    'envelopeId', p_envelope_id, 'participantId', p_participante_id,
    'profile', upper(btrim(p_perfil)), 'contextId', p_context_id,
    'actorAuthUserId', p_actor_auth_user_id, 'authSessionId', p_auth_session_id
  ));
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('assinatura:reauth:preparar:' || p_actor_auth_user_id::text || ':' || p_request_id::text, 0)
  );

  -- Replay somente após sessão, perfil, participante, ordem e política atuais.
  SELECT operacao.* INTO v_replay
  FROM public.assinatura_eletronica_operacoes AS operacao
  WHERE operacao.actor_scope = v_actor_scope
    AND operacao.operacao = 'PREPARAR_REAUTENTICACAO'
    AND operacao.request_id = p_request_id;
  IF FOUND THEN
    IF v_replay.payload_sha256 IS DISTINCT FROM v_payload_sha256 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_IDEMPOTENCIA_DIVERGENTE';
    END IF;
    RETURN v_replay.resultado;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.assinatura_eletronica_reauth_tentativas AS tentativa
  WHERE tentativa.actor_auth_user_id = p_actor_auth_user_id
    AND tentativa.created_at > statement_timestamp() - interval '15 minutes';
  IF v_count >= 5 THEN
    SELECT greatest(1, ceil(extract(epoch FROM (
      min(tentativa.created_at) + interval '15 minutes' - statement_timestamp()
    )))::integer)
    INTO v_retry_after
    FROM public.assinatura_eletronica_reauth_tentativas AS tentativa
    WHERE tentativa.actor_auth_user_id = p_actor_auth_user_id
      AND tentativa.created_at > statement_timestamp() - interval '15 minutes';
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_REAUTH_RATE_LIMITED',
      DETAIL = jsonb_build_object('retryAfterSeconds', coalesce(v_retry_after, 900))::text;
  END IF;

  INSERT INTO public.assinatura_eletronica_reauth_tentativas (
    actor_auth_user_id, auth_session_id, envelope_id, participante_id, request_id
  ) VALUES (
    p_actor_auth_user_id, p_auth_session_id, p_envelope_id, p_participante_id, p_request_id
  );

  v_resultado := jsonb_build_object(
    'email', v_scope ->> 'email',
    'passwordEnabled', (v_scope ->> 'passwordEnabled')::boolean,
    'rateLimit', jsonb_build_object(
      'remaining', greatest(0, 4 - v_count),
      'resetAt', statement_timestamp() + interval '15 minutes'
    )
  );
  INSERT INTO public.assinatura_eletronica_operacoes (
    actor_scope, actor_auth_user_id, operacao, request_id, payload_sha256, resultado
  ) VALUES (
    v_actor_scope, p_actor_auth_user_id, 'PREPARAR_REAUTENTICACAO',
    p_request_id, v_payload_sha256, v_resultado
  );
  PERFORM public.assinatura_eletronica_adicionar_evento(
    p_envelope_id, p_participante_id, 'REAUTENTICACAO_PREPARADA', p_actor_auth_user_id,
    jsonb_build_object('requestId', p_request_id, 'sessionBound', true)
  );
  RETURN v_resultado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_internal_registrar_reautenticacao(
  p_envelope_id uuid,
  p_participante_id uuid,
  p_perfil text,
  p_context_id uuid,
  p_actor_auth_user_id uuid,
  p_auth_session_id uuid,
  p_reautenticado_em timestamptz,
  p_evidencia jsonb,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_scope jsonb;
  v_actor_scope text;
  v_payload_sha256 text;
  v_replay public.assinatura_eletronica_operacoes%ROWTYPE;
  v_challenge_id uuid := gen_random_uuid();
  v_issued_at timestamptz := statement_timestamp();
  v_expires_at timestamptz := statement_timestamp() + interval '120 seconds';
  v_claims jsonb;
  v_ticket text;
  v_ticket_hmac text;
  v_resultado jsonb;
  v_chaves_invalidas text;
  v_authenticated_at timestamptz;
  v_preflight_payload_sha256 text;
BEGIN
  PERFORM public.assinatura_eletronica_exigir_service_role();
  IF p_request_id IS NULL OR p_reautenticado_em IS NULL
     OR p_evidencia IS NULL OR jsonb_typeof(p_evidencia) <> 'object'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_REAUTH_EVIDENCIA_INVALIDA';
  END IF;
  PERFORM public.assinatura_eletronica_exigir_sessao_ativa(p_actor_auth_user_id, p_auth_session_id);
  v_scope := public.assinatura_eletronica_validar_escopo_reauth(
    p_envelope_id, p_participante_id, p_perfil, p_context_id,
    p_actor_auth_user_id, 'REGISTRAR'
  );
  v_actor_scope := 'service:user:' || p_actor_auth_user_id::text || ':session:' || p_auth_session_id::text;

  SELECT string_agg(chave, ', ' ORDER BY chave) INTO v_chaves_invalidas
  FROM jsonb_object_keys(p_evidencia) AS chaves(chave)
  WHERE chave NOT IN ('provider', 'authenticatedAt', 'ipHash', 'userAgentHash');
  BEGIN
    v_authenticated_at := nullif(p_evidencia ->> 'authenticatedAt', '')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_REAUTH_EVIDENCIA_INVALIDA';
  END;
  IF v_chaves_invalidas IS NOT NULL
     OR jsonb_typeof(p_evidencia -> 'provider') <> 'string'
     OR p_evidencia ->> 'provider' <> 'SUPABASE_PASSWORD'
     OR jsonb_typeof(p_evidencia -> 'authenticatedAt') <> 'string'
     OR v_authenticated_at IS NULL
     OR v_authenticated_at IS DISTINCT FROM p_reautenticado_em
     OR p_reautenticado_em < statement_timestamp() - interval '120 seconds'
     OR p_reautenticado_em > statement_timestamp() + interval '30 seconds'
     OR (
       coalesce(p_evidencia -> 'ipHash', 'null'::jsonb) <> 'null'::jsonb
       AND (
         jsonb_typeof(p_evidencia -> 'ipHash') <> 'string'
         OR p_evidencia ->> 'ipHash' !~ '^[0-9a-f]{64}$'
       )
     )
     OR (
       coalesce(p_evidencia -> 'userAgentHash', 'null'::jsonb) <> 'null'::jsonb
       AND (
         jsonb_typeof(p_evidencia -> 'userAgentHash') <> 'string'
         OR p_evidencia ->> 'userAgentHash' !~ '^[0-9a-f]{64}$'
       )
     )
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_REAUTH_EVIDENCIA_INVALIDA';
  END IF;
  v_preflight_payload_sha256 := public.assinatura_eletronica_sha256_json(jsonb_build_object(
    'envelopeId', p_envelope_id, 'participantId', p_participante_id,
    'profile', upper(btrim(p_perfil)), 'contextId', p_context_id,
    'actorAuthUserId', p_actor_auth_user_id, 'authSessionId', p_auth_session_id
  ));
  IF NOT EXISTS (
    SELECT 1 FROM public.assinatura_eletronica_operacoes AS operacao
    WHERE operacao.actor_scope = v_actor_scope
      AND operacao.operacao = 'PREPARAR_REAUTENTICACAO'
      AND operacao.request_id = p_request_id
      AND operacao.payload_sha256 = v_preflight_payload_sha256
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_REAUTH_PREFLIGHT_OBRIGATORIO';
  END IF;

  v_payload_sha256 := public.assinatura_eletronica_sha256_json(jsonb_build_object(
    'envelopeId', p_envelope_id, 'participantId', p_participante_id,
    'profile', upper(btrim(p_perfil)), 'contextId', p_context_id,
    'actorAuthUserId', p_actor_auth_user_id, 'authSessionId', p_auth_session_id,
    'reauthenticatedAt', p_reautenticado_em, 'evidence', p_evidencia
  ));
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('assinatura:reauth:registrar:' || p_actor_auth_user_id::text || ':' || p_request_id::text, 0)
  );
  SELECT operacao.* INTO v_replay
  FROM public.assinatura_eletronica_operacoes AS operacao
  WHERE operacao.actor_scope = v_actor_scope
    AND operacao.operacao = 'REGISTRAR_REAUTENTICACAO'
    AND operacao.request_id = p_request_id;
  IF FOUND THEN
    IF v_replay.payload_sha256 IS DISTINCT FROM v_payload_sha256 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_IDEMPOTENCIA_DIVERGENTE';
    END IF;
    RETURN v_replay.resultado;
  END IF;

  v_claims := jsonb_build_object(
    'actorAuthUserId', p_actor_auth_user_id,
    'authSessionId', p_auth_session_id,
    'challengeId', v_challenge_id,
    'contextId', p_context_id,
    'envelopeId', p_envelope_id,
    'expiresAt', v_expires_at,
    'issuedAt', v_issued_at,
    'participantId', p_participante_id,
    'participantOrder', (v_scope ->> 'participantOrder')::integer,
    'participantRole', v_scope ->> 'participantRole',
    'profile', upper(btrim(p_perfil)),
    'requestId', p_request_id
  );
  v_ticket_hmac := pg_catalog.encode(
    extensions.hmac(
      pg_catalog.convert_to(v_claims::text, 'UTF8'),
      pg_catalog.convert_to(public.assinatura_eletronica_ticket_hmac_secret(), 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  v_ticket := public.assinatura_eletronica_codificar_ticket(v_claims);

  INSERT INTO public.assinatura_eletronica_desafios (
    id, envelope_id, participante_id, metodo, estado, segredo_hash,
    correlacao_provedor, tentativas, max_tentativas, expira_em, verificado_em,
    evidencia_hash, actor_auth_user_id, auth_session_id, perfil, contexto_id,
    request_id, evidencia_snapshot
  ) VALUES (
    v_challenge_id, p_envelope_id, p_participante_id, 'SENHA_REAUTENTICADA',
    'VERIFICADO', v_ticket_hmac, 'reauth:' || v_challenge_id::text,
    1, 1, v_expires_at, v_issued_at,
    public.assinatura_eletronica_sha256_json(p_evidencia),
    p_actor_auth_user_id, p_auth_session_id, upper(btrim(p_perfil)), p_context_id,
    p_request_id, p_evidencia
  );
  UPDATE public.assinatura_eletronica_participantes AS participante
  SET status = 'DESAFIO_PENDENTE'
  WHERE participante.id = p_participante_id
    AND participante.status = 'PENDENTE';

  PERFORM public.assinatura_eletronica_adicionar_evento(
    p_envelope_id, p_participante_id, 'DESAFIO_VERIFICADO', p_actor_auth_user_id,
    jsonb_build_object(
      'challengeId', v_challenge_id, 'method', 'SENHA_REAUTENTICADA',
      'requestId', p_request_id, 'expiresAt', v_expires_at
    )
  );

  v_resultado := jsonb_build_object(
    'ticket', v_ticket,
    'challengeId', v_challenge_id,
    'envelopeId', p_envelope_id,
    'participantId', p_participante_id,
    'participantRole', v_scope ->> 'participantRole',
    'participantOrder', (v_scope ->> 'participantOrder')::integer,
    'profile', upper(btrim(p_perfil)),
    'contextId', p_context_id,
    'issuedAt', v_issued_at,
    'expiresAt', v_expires_at
  );
  INSERT INTO public.assinatura_eletronica_operacoes (
    actor_scope, actor_auth_user_id, operacao, request_id, payload_sha256, resultado
  ) VALUES (
    v_actor_scope, p_actor_auth_user_id, 'REGISTRAR_REAUTENTICACAO',
    p_request_id, v_payload_sha256, v_resultado
  );
  RETURN v_resultado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_internal_consumir_ticket_reautenticacao(
  p_ticket text,
  p_request_id uuid,
  p_actor_auth_user_id uuid,
  p_auth_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_claims jsonb;
  v_scope jsonb;
  v_actor_scope text;
  v_payload_sha256 text;
  v_replay public.assinatura_eletronica_operacoes%ROWTYPE;
  v_desafio public.assinatura_eletronica_desafios%ROWTYPE;
  v_envelope public.assinatura_eletronica_envelopes%ROWTYPE;
  v_participante public.assinatura_eletronica_participantes%ROWTYPE;
  v_ticket_hmac text;
  v_signed_at timestamptz := statement_timestamp();
  v_next_participant_id uuid;
  v_next_participant_role text;
  v_requires_finalization boolean;
  v_resultado jsonb;
BEGIN
  PERFORM public.assinatura_eletronica_exigir_service_role();
  IF p_request_id IS NULL OR p_actor_auth_user_id IS NULL OR p_auth_session_id IS NULL
     OR nullif(btrim(coalesce(p_ticket, '')), '') IS NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_REAUTH_CONSUMO_INVALIDO';
  END IF;

  v_claims := public.assinatura_eletronica_decodificar_ticket(p_ticket);
  IF (v_claims ->> 'actorAuthUserId')::uuid IS DISTINCT FROM p_actor_auth_user_id
     OR (v_claims ->> 'authSessionId')::uuid IS DISTINCT FROM p_auth_session_id
     OR (v_claims ->> 'requestId')::uuid IS DISTINCT FROM p_request_id
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ASSINATURA_REAUTH_TICKET_NAO_PERTENCE_A_SESSAO';
  END IF;

  -- A sessão, o perfil, o contexto, o participante e a ordem são checados
  -- antes de consultar o ledger de replay.
  PERFORM public.assinatura_eletronica_exigir_sessao_ativa(p_actor_auth_user_id, p_auth_session_id);
  v_scope := public.assinatura_eletronica_validar_escopo_reauth(
    (v_claims ->> 'envelopeId')::uuid,
    (v_claims ->> 'participantId')::uuid,
    v_claims ->> 'profile',
    (v_claims ->> 'contextId')::uuid,
    p_actor_auth_user_id,
    'CONSUMIR'
  );
  v_actor_scope := 'service:user:' || p_actor_auth_user_id::text || ':session:' || p_auth_session_id::text;
  v_payload_sha256 := public.assinatura_eletronica_sha256_json(jsonb_build_object(
    'ticketSha256', public.assinatura_eletronica_sha256_json(jsonb_build_object('ticket', p_ticket)),
    'actorAuthUserId', p_actor_auth_user_id,
    'authSessionId', p_auth_session_id
  ));
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('assinatura:reauth:consumir:' || p_actor_auth_user_id::text || ':' || p_request_id::text, 0)
  );

  SELECT desafio.* INTO v_desafio
  FROM public.assinatura_eletronica_desafios AS desafio
  WHERE desafio.id = (v_claims ->> 'challengeId')::uuid
  FOR UPDATE;
  IF NOT FOUND
     OR v_desafio.envelope_id IS DISTINCT FROM (v_claims ->> 'envelopeId')::uuid
     OR v_desafio.participante_id IS DISTINCT FROM (v_claims ->> 'participantId')::uuid
     OR v_desafio.actor_auth_user_id IS DISTINCT FROM p_actor_auth_user_id
     OR v_desafio.auth_session_id IS DISTINCT FROM p_auth_session_id
     OR v_desafio.perfil IS DISTINCT FROM v_claims ->> 'profile'
     OR v_desafio.contexto_id IS DISTINCT FROM (v_claims ->> 'contextId')::uuid
     OR v_desafio.request_id IS DISTINCT FROM p_request_id
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ASSINATURA_REAUTH_DESAFIO_NAO_AUTORIZADO';
  END IF;

  v_ticket_hmac := pg_catalog.encode(
    extensions.hmac(
      pg_catalog.convert_to(v_claims::text, 'UTF8'),
      pg_catalog.convert_to(public.assinatura_eletronica_ticket_hmac_secret(), 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  IF v_desafio.segredo_hash IS DISTINCT FROM v_ticket_hmac
     OR (v_claims ->> 'participantRole') IS DISTINCT FROM v_scope ->> 'participantRole'
     OR (v_claims ->> 'participantOrder')::integer IS DISTINCT FROM (v_scope ->> 'participantOrder')::integer
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ASSINATURA_REAUTH_TICKET_INVALIDO';
  END IF;

  SELECT operacao.* INTO v_replay
  FROM public.assinatura_eletronica_operacoes AS operacao
  WHERE operacao.actor_scope = v_actor_scope
    AND operacao.operacao = 'CONSUMIR_TICKET_REAUTENTICACAO'
    AND operacao.request_id = p_request_id;
  IF FOUND THEN
    IF v_replay.payload_sha256 IS DISTINCT FROM v_payload_sha256 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_IDEMPOTENCIA_DIVERGENTE';
    END IF;
    RETURN v_replay.resultado;
  END IF;

  IF v_desafio.estado = 'CONSUMIDO' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_REAUTH_TICKET_CONSUMIDO';
  END IF;
  IF v_desafio.estado <> 'VERIFICADO' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_REAUTH_TICKET_INVALIDO';
  END IF;
  IF v_desafio.expira_em <= statement_timestamp()
     OR (v_claims ->> 'expiresAt')::timestamptz <= statement_timestamp()
     OR (v_claims ->> 'issuedAt')::timestamptz > statement_timestamp() + interval '30 seconds'
     OR (v_claims ->> 'expiresAt')::timestamptz
        IS DISTINCT FROM (v_claims ->> 'issuedAt')::timestamptz + interval '120 seconds'
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_REAUTH_TICKET_EXPIRADO';
  END IF;

  SELECT envelope.* INTO v_envelope
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = v_desafio.envelope_id
  FOR UPDATE;
  SELECT participante.* INTO v_participante
  FROM public.assinatura_eletronica_participantes AS participante
  WHERE participante.id = v_desafio.participante_id
  FOR UPDATE;

  IF v_participante.status <> 'DESAFIO_PENDENTE'
     OR (v_participante.ordem = 1 AND v_envelope.status <> 'PENDENTE')
     OR (v_participante.ordem = 2 AND v_envelope.status <> 'EM_ASSINATURA')
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_REAUTH_CONSUMO_ESTADO_INVALIDO';
  END IF;

  UPDATE public.assinatura_eletronica_desafios AS desafio
  SET estado = 'CONSUMIDO', consumido_em = v_signed_at
  WHERE desafio.id = v_desafio.id;

  UPDATE public.assinatura_eletronica_participantes AS participante
  SET status = 'ASSINADO',
      assinado_em = v_signed_at,
      assinado_por_auth_user_id = p_actor_auth_user_id,
      aceitou_versao_termo = 'diario_classe:v' || v_envelope.politica_versao::text
  WHERE participante.id = v_participante.id;

  IF v_participante.ordem = 1 THEN
    UPDATE public.assinatura_eletronica_participantes AS participante
    SET status = 'PENDENTE'
    WHERE participante.envelope_id = v_envelope.id
      AND participante.ordem = 2
      AND participante.papel = 'COORDENADOR'
      AND participante.status = 'AGUARDANDO_ORDEM'
    RETURNING participante.id, participante.papel
    INTO v_next_participant_id, v_next_participant_role;

    IF v_next_participant_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_PROXIMO_PARTICIPANTE_INDISPONIVEL';
    END IF;
    UPDATE public.assinatura_eletronica_envelopes AS envelope
    SET status = 'EM_ASSINATURA'
    WHERE envelope.id = v_envelope.id;
    v_requires_finalization := false;
  ELSE
    UPDATE public.assinatura_eletronica_envelopes AS envelope
    SET status = 'FINALIZANDO'
    WHERE envelope.id = v_envelope.id;
    v_next_participant_id := NULL;
    v_next_participant_role := NULL;
    v_requires_finalization := true;
  END IF;

  PERFORM public.assinatura_eletronica_adicionar_evento(
    v_envelope.id, v_participante.id, 'ASSINATURA_CONCLUIDA', p_actor_auth_user_id,
    jsonb_build_object(
      'challengeId', v_desafio.id,
      'requestId', p_request_id,
      'role', v_participante.papel,
      'order', v_participante.ordem,
      'signedAt', v_signed_at,
      'authSessionBound', true
    )
  );
  IF v_next_participant_id IS NOT NULL THEN
    PERFORM public.assinatura_eletronica_adicionar_evento(
      v_envelope.id, v_next_participant_id, 'PARTICIPANTE_LIBERADO', p_actor_auth_user_id,
      jsonb_build_object('role', v_next_participant_role, 'order', 2)
    );
  END IF;

  v_resultado := jsonb_build_object(
    'envelopeId', v_envelope.id,
    'envelopeStatus', CASE WHEN v_requires_finalization THEN 'FINALIZANDO' ELSE 'EM_ASSINATURA' END,
    'participantId', v_participante.id,
    'participantRole', v_participante.papel,
    'participantOrder', v_participante.ordem,
    'participantStatus', 'ASSINADO',
    'signedAt', v_signed_at,
    'nextParticipantId', v_next_participant_id,
    'nextParticipantRole', v_next_participant_role,
    'requiresFinalization', v_requires_finalization
  );
  INSERT INTO public.assinatura_eletronica_operacoes (
    actor_scope, actor_auth_user_id, operacao, request_id, payload_sha256, resultado
  ) VALUES (
    v_actor_scope, p_actor_auth_user_id, 'CONSUMIR_TICKET_REAUTENTICACAO',
    p_request_id, v_payload_sha256, v_resultado
  );
  RETURN v_resultado;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 8. RPCs service_role: composição e fechamento dos artefatos finais.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_internal_iniciar_finalizacao(
  p_envelope_id uuid,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_envelope public.assinatura_eletronica_envelopes%ROWTYPE;
  v_original public.assinatura_eletronica_artefatos%ROWTYPE;
  v_payload_sha256 text;
  v_replay public.assinatura_eletronica_operacoes%ROWTYPE;
  v_participantes jsonb;
  v_eventos_assinatura jsonb;
  v_receipt_participantes jsonb;
  v_receipt_payload jsonb;
  v_receipt_asset_references jsonb;
  v_watermark_asset_references jsonb;
  v_stamp_link public.assinatura_eletronica_politica_carimbo_assets%ROWTYPE;
  v_stamp_asset public.assinatura_eletronica_modelo_assets%ROWTYPE;
  v_stamp_asset_payload jsonb;
  v_resultado jsonb;
BEGIN
  PERFORM public.assinatura_eletronica_exigir_service_role();
  IF p_envelope_id IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_FINALIZACAO_PAYLOAD_INVALIDO';
  END IF;

  SELECT envelope.* INTO v_envelope
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = p_envelope_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ASSINATURA_ENVELOPE_NAO_ENCONTRADO';
  END IF;
  IF v_envelope.status NOT IN ('FINALIZANDO', 'ASSINADO')
     OR (SELECT count(*) FROM public.assinatura_eletronica_participantes AS participante
         WHERE participante.envelope_id = v_envelope.id AND participante.status = 'ASSINADO') <> 2
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_FINALIZACAO_ESTADO_INVALIDO';
  END IF;
  SELECT artefato.* INTO v_original
  FROM public.assinatura_eletronica_artefatos AS artefato
  WHERE artefato.envelope_id = v_envelope.id
    AND artefato.classe = 'DOCUMENTO_ORIGINAL';
  IF NOT FOUND OR v_original.sha256 IS DISTINCT FROM v_envelope.documento_original_sha256 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_ORIGINAL_CONGELADO_INDISPONIVEL';
  END IF;
  IF NOT public.assinatura_eletronica_manifesto_diario_valido(
       v_envelope.pdf_semantic_manifest_snapshot
     )
     OR NOT public.assinatura_eletronica_target_diario_valido(
       v_envelope.pdf_signature_target_snapshot,
       v_envelope.pdf_semantic_manifest_snapshot,
       v_envelope.documento_original_sha256
     )
     OR v_envelope.academico_snapshot_sha256 IS DISTINCT FROM
       public.assinatura_eletronica_sha256_json(v_envelope.documento_snapshot)
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_ORIGINAL_CONTRATO_SEMANTICO_INVALIDO';
  END IF;

  SELECT carimbo.* INTO v_stamp_link
  FROM public.assinatura_eletronica_politica_carimbo_assets AS carimbo
  WHERE carimbo.politica_id = v_envelope.politica_id
  FOR SHARE;
  IF NOT FOUND
     OR v_envelope.geometria_snapshot ->> 'assetId' IS DISTINCT FROM v_stamp_link.asset_id::text
     OR v_envelope.geometria_snapshot -> 'assetSnapshot' IS DISTINCT FROM v_stamp_link.asset_snapshot
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_CARIMBO_SNAPSHOT_INDISPONIVEL';
  END IF;
  SELECT asset.* INTO v_stamp_asset
  FROM public.assinatura_eletronica_modelo_assets AS asset
  WHERE asset.id = v_stamp_link.asset_id
    AND asset.status = 'PRONTO'
  FOR SHARE;
  IF NOT FOUND
     OR v_stamp_asset.sha256 IS DISTINCT FROM v_stamp_link.asset_sha256
     OR v_stamp_asset.sha256 IS DISTINCT FROM v_stamp_link.asset_snapshot ->> 'sha256'
     OR v_stamp_asset.mime_type IS DISTINCT FROM v_stamp_link.asset_snapshot ->> 'mimeType'
     OR v_stamp_asset.tamanho_bytes IS DISTINCT FROM (v_stamp_link.asset_snapshot ->> 'sizeBytes')::integer
     OR v_stamp_asset.largura IS DISTINCT FROM (v_stamp_link.asset_snapshot ->> 'width')::integer
     OR v_stamp_asset.altura IS DISTINCT FROM (v_stamp_link.asset_snapshot ->> 'height')::integer
     OR NOT EXISTS (
       SELECT 1 FROM storage.objects AS objeto
       WHERE objeto.bucket_id = v_stamp_asset.bucket_id
         AND objeto.name = v_stamp_asset.storage_path
     )
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_CARIMBO_ASSET_DIVERGENTE';
  END IF;
  v_stamp_asset_payload := jsonb_build_object(
    'assetId', v_stamp_asset.id,
    'bucketId', v_stamp_asset.bucket_id,
    'storagePath', v_stamp_asset.storage_path,
    'mimeType', v_stamp_asset.mime_type,
    'byteSize', v_stamp_asset.tamanho_bytes,
    'width', v_stamp_asset.largura,
    'height', v_stamp_asset.altura,
    'sha256', v_stamp_asset.sha256
  );

  IF EXISTS (
    SELECT 1
    FROM public.assinatura_eletronica_politica_assets AS vinculo
    LEFT JOIN public.assinatura_eletronica_modelo_assets AS asset
      ON asset.id = vinculo.asset_id
     AND asset.status = 'PRONTO'
    LEFT JOIN storage.objects AS objeto
      ON objeto.bucket_id = asset.bucket_id
     AND objeto.name = asset.storage_path
    WHERE vinculo.politica_id = v_envelope.politica_id
      AND (
        asset.id IS NULL
        OR objeto.id IS NULL
        OR vinculo.asset_sha256 IS DISTINCT FROM asset.sha256
        OR vinculo.asset_snapshot ->> 'assetId' IS DISTINCT FROM asset.id::text
        OR vinculo.asset_snapshot ->> 'sha256' IS DISTINCT FROM asset.sha256
        OR vinculo.asset_snapshot ->> 'mimeType' IS DISTINCT FROM asset.mime_type
        OR (vinculo.asset_snapshot ->> 'sizeBytes')::integer IS DISTINCT FROM asset.tamanho_bytes
        OR (vinculo.asset_snapshot ->> 'width')::integer IS DISTINCT FROM asset.largura
        OR (vinculo.asset_snapshot ->> 'height')::integer IS DISTINCT FROM asset.altura
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_MARCA_DAGUA_ASSET_DIVERGENTE';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'page', vinculo.pagina,
    'assetId', asset.id,
    'bucketId', asset.bucket_id,
    'storagePath', asset.storage_path,
    'mimeType', asset.mime_type,
    'byteSize', asset.tamanho_bytes,
    'width', asset.largura,
    'height', asset.altura,
    'sha256', asset.sha256
  ) ORDER BY vinculo.pagina), '[]'::jsonb)
  INTO v_watermark_asset_references
  FROM public.assinatura_eletronica_politica_assets AS vinculo
  JOIN public.assinatura_eletronica_modelo_assets AS asset ON asset.id = vinculo.asset_id
  WHERE vinculo.politica_id = v_envelope.politica_id;

  v_payload_sha256 := public.assinatura_eletronica_sha256_json(jsonb_build_object(
    'envelopeId', p_envelope_id,
    'originalSha256', v_envelope.documento_original_sha256,
    'geometrySnapshot', v_envelope.geometria_snapshot,
    'semanticManifestSnapshot', v_envelope.pdf_semantic_manifest_snapshot,
    'frozenSignatureTargetSnapshot', v_envelope.pdf_signature_target_snapshot,
    'stampAsset', v_stamp_asset_payload
  ));
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('assinatura:finalizar:iniciar:' || p_request_id::text, 0)
  );
  SELECT operacao.* INTO v_replay
  FROM public.assinatura_eletronica_operacoes AS operacao
  WHERE operacao.actor_scope = 'service:system'
    AND operacao.operacao = 'INICIAR_FINALIZACAO'
    AND operacao.request_id = p_request_id;
  IF FOUND THEN
    IF v_replay.payload_sha256 IS DISTINCT FROM v_payload_sha256 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_IDEMPOTENCIA_DIVERGENTE';
    END IF;
    RETURN v_replay.resultado;
  END IF;
  IF v_envelope.status <> 'FINALIZANDO' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_FINALIZACAO_ESTADO_INVALIDO';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'participantId', participante.id,
    'role', participante.papel,
    'roleLabel', public.assinatura_eletronica_papel_label(participante.papel),
    'order', participante.ordem,
    'status', participante.status,
    'statusLabel', public.assinatura_eletronica_participante_status_label(participante.status),
    'contextId', participante.contexto_id,
    'canAct', false,
    'signerName', participante.identidade_snapshot ->> 'name',
    'signedAt', participante.assinado_em
  ) ORDER BY participante.ordem)
  INTO v_participantes
  FROM public.assinatura_eletronica_participantes AS participante
  WHERE participante.envelope_id = v_envelope.id;

  IF EXISTS (
    SELECT 1
    FROM public.assinatura_eletronica_participantes AS participante
    WHERE participante.envelope_id = v_envelope.id
      AND (
        participante.assinado_em IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM public.assinatura_eletronica_eventos AS evento
          WHERE evento.envelope_id = v_envelope.id
            AND evento.participante_id = participante.id
            AND evento.tipo = 'ASSINATURA_CONCLUIDA'
            AND (evento.dados ->> 'signedAt')::timestamptz = participante.assinado_em
        )
      )
  ) OR (
    SELECT count(*)
    FROM public.assinatura_eletronica_eventos AS evento
    WHERE evento.envelope_id = v_envelope.id
      AND evento.tipo = 'ASSINATURA_CONCLUIDA'
  ) <> 2 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_EVENTOS_CONCLUSAO_INCOMPLETOS';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'type', 'ASSINATURA_CONCLUIDA',
    'occurredAt', evento.ocorrido_em,
    'participantId', evento.participante_id,
    'method', 'CONTA_E_PIN'
  ) ORDER BY evento.sequencia)
  INTO v_eventos_assinatura
  FROM public.assinatura_eletronica_eventos AS evento
  WHERE evento.envelope_id = v_envelope.id
    AND evento.tipo = 'ASSINATURA_CONCLUIDA';
  SELECT jsonb_agg(jsonb_build_object(
    'id', participante.id,
    'name', participante.identidade_snapshot ->> 'name',
    'role', CASE participante.papel
      WHEN 'PROFESSOR' THEN 'Professor'
      WHEN 'COORDENADOR' THEN 'Coordenador de curso'
    END
  ) ORDER BY participante.ordem)
  INTO v_receipt_participantes
  FROM public.assinatura_eletronica_participantes AS participante
  WHERE participante.envelope_id = v_envelope.id;

  v_receipt_payload := jsonb_build_object(
    'institution', v_envelope.documento_snapshot -> 'institutionalIdentity' -> 'institution',
    'logo', NULL,
    'watermarkAssets', '{}'::jsonb,
    'presentation', jsonb_build_object(
      'policyName', coalesce(v_envelope.politica_snapshot ->> 'name', 'Diário de Classe'),
      'policyVersionLabel', coalesce(
        v_envelope.politica_snapshot ->> 'versionLabel',
        'Versão ' || v_envelope.politica_versao::text
      ),
      'confirmationMessage', coalesce(
        v_envelope.politica_snapshot ->> 'confirmationMessage',
        'A assinatura foi confirmada mediante reautenticação da conta institucional.'
      ),
      'receiptTitle', coalesce(
        v_envelope.politica_snapshot ->> 'receiptTitle',
        'Comprovante de Assinatura Eletrônica'
      ),
      'receiptMessage', coalesce(
        v_envelope.politica_snapshot ->> 'receiptMessage',
        'A autenticidade deve ser conferida pelo código de validação.'
      ),
      'editor', v_envelope.politica_snapshot -> 'editor'
    ),
    'document', jsonb_build_object(
      'type', 'Diário de Classe',
      'reference', v_envelope.id::text,
      'version', v_envelope.revisao_rotulo
    ),
    'status', 'ASSINADO',
    'participants', v_receipt_participantes,
    'events', v_eventos_assinatura,
    'validation', jsonb_build_object(
      'code', v_envelope.documento_snapshot ->> 'validationCode'
    )
  );
  v_receipt_asset_references := jsonb_build_object(
    'logo', jsonb_build_object(
      'sourceUrl', v_envelope.documento_snapshot -> 'institutionalIdentity' -> 'logoUrl'
    ),
    'institutionalWatermark', jsonb_build_object(
      'sourceUrl', v_envelope.documento_snapshot -> 'institutionalIdentity' -> 'watermarkUrl'
    ),
    'customWatermarks', v_watermark_asset_references
  );

  v_resultado := jsonb_build_object(
    'envelopeId', v_envelope.id,
    'status', 'FINALIZANDO',
    'documentType', v_envelope.documento,
    'documentSnapshot', v_envelope.documento_snapshot,
    'academicSnapshotSha256', v_envelope.academico_snapshot_sha256,
    'geometrySnapshot', v_envelope.geometria_snapshot,
    'semanticManifestSnapshot', v_envelope.pdf_semantic_manifest_snapshot,
    'frozenSignatureTargetSnapshot', v_envelope.pdf_signature_target_snapshot,
    'policyVersion', v_envelope.politica_versao,
    'identitySnapshot', v_envelope.documento_snapshot -> 'institutionalIdentity',
    'policySnapshot', v_envelope.politica_snapshot,
    'certificateSnapshot', v_envelope.certificado_snapshot,
    'templateSnapshot', jsonb_build_object(
      'template', v_envelope.documento_snapshot -> 'template',
      'templateSource', v_envelope.documento_snapshot -> 'templateSource'
    ),
    'originalArtifact', jsonb_build_object(
      'artifactId', v_original.id,
      'bucketId', v_original.bucket_id,
      'storagePath', v_original.storage_path,
      'byteSize', v_original.tamanho_bytes,
      'sha256', v_original.sha256
    ),
    'participants', v_participantes,
    'signatureEvents', v_eventos_assinatura,
    'receiptPayload', v_receipt_payload,
    'receiptAssetReferences', v_receipt_asset_references,
    'stampAsset', v_stamp_asset_payload,
    'verification', jsonb_build_object(
      'code', v_envelope.documento_snapshot ->> 'validationCode',
      'path', '/verificar-assinatura/' || (v_envelope.documento_snapshot ->> 'validationCode')
    ),
    'verificationPath', '/verificar-assinatura/' || (v_envelope.documento_snapshot ->> 'validationCode')
  );
  INSERT INTO public.assinatura_eletronica_operacoes (
    actor_scope, operacao, request_id, payload_sha256, resultado
  ) VALUES (
    'service:system', 'INICIAR_FINALIZACAO', p_request_id,
    v_payload_sha256, v_resultado
  );
  PERFORM public.assinatura_eletronica_adicionar_evento(
    v_envelope.id, NULL, 'FINALIZACAO_INICIADA', NULL,
    jsonb_build_object('requestId', p_request_id, 'originalSha256', v_original.sha256)
  );
  RETURN v_resultado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_internal_registrar_artefato_finalizar(
  p_envelope_id uuid,
  p_final_bucket_id text,
  p_final_storage_path text,
  p_final_tamanho_bytes bigint,
  p_final_sha256 text,
  p_receipt_bucket_id text,
  p_receipt_storage_path text,
  p_receipt_tamanho_bytes bigint,
  p_receipt_sha256 text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_envelope public.assinatura_eletronica_envelopes%ROWTYPE;
  v_final_sha256 text := lower(btrim(coalesce(p_final_sha256, '')));
  v_receipt_sha256 text := lower(btrim(coalesce(p_receipt_sha256, '')));
  v_payload_sha256 text;
  v_replay public.assinatura_eletronica_operacoes%ROWTYPE;
  v_final_artifact_id uuid := gen_random_uuid();
  v_receipt_artifact_id uuid := gen_random_uuid();
  v_finalized_at timestamptz := statement_timestamp();
  v_resultado jsonb;
BEGIN
  PERFORM public.assinatura_eletronica_exigir_service_role();
  IF p_envelope_id IS NULL OR p_request_id IS NULL
     OR p_final_bucket_id <> 'documentos-assinatura-eletronica'
     OR p_receipt_bucket_id <> 'documentos-assinatura-eletronica'
     OR p_final_storage_path IS DISTINCT FROM 'envelopes/' || p_envelope_id::text || '/documento-final.pdf'
     OR p_receipt_storage_path IS DISTINCT FROM 'envelopes/' || p_envelope_id::text || '/comprovante-evidencia.pdf'
     OR p_final_tamanho_bytes IS NULL OR p_final_tamanho_bytes NOT BETWEEN 1 AND 52428800
     OR p_receipt_tamanho_bytes IS NULL OR p_receipt_tamanho_bytes NOT BETWEEN 1 AND 52428800
     OR v_final_sha256 !~ '^[0-9a-f]{64}$'
     OR v_receipt_sha256 !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_ARTEFATOS_FINAIS_PAYLOAD_INVALIDO';
  END IF;

  SELECT envelope.* INTO v_envelope
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = p_envelope_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ASSINATURA_ENVELOPE_NAO_ENCONTRADO';
  END IF;
  v_payload_sha256 := public.assinatura_eletronica_sha256_json(jsonb_build_object(
    'envelopeId', p_envelope_id,
    'final', jsonb_build_object(
      'bucketId', p_final_bucket_id, 'storagePath', p_final_storage_path,
      'byteSize', p_final_tamanho_bytes, 'sha256', v_final_sha256
    ),
    'receipt', jsonb_build_object(
      'bucketId', p_receipt_bucket_id, 'storagePath', p_receipt_storage_path,
      'byteSize', p_receipt_tamanho_bytes, 'sha256', v_receipt_sha256
    )
  ));
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('assinatura:finalizar:registrar:' || p_request_id::text, 0)
  );
  SELECT operacao.* INTO v_replay
  FROM public.assinatura_eletronica_operacoes AS operacao
  WHERE operacao.actor_scope = 'service:system'
    AND operacao.operacao = 'REGISTRAR_ARTEFATO_FINALIZAR'
    AND operacao.request_id = p_request_id;
  IF FOUND THEN
    IF v_replay.payload_sha256 IS DISTINCT FROM v_payload_sha256 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_IDEMPOTENCIA_DIVERGENTE';
    END IF;
    RETURN v_replay.resultado;
  END IF;

  IF v_envelope.status <> 'FINALIZANDO'
     OR v_envelope.documento_original_sha256 IS NULL
     OR v_final_sha256 = v_envelope.documento_original_sha256
     OR (SELECT count(*) FROM public.assinatura_eletronica_participantes AS participante
         WHERE participante.envelope_id = v_envelope.id AND participante.status = 'ASSINADO') <> 2
     OR EXISTS (
       SELECT 1 FROM public.assinatura_eletronica_artefatos AS artefato
       WHERE artefato.envelope_id = v_envelope.id
         AND artefato.classe IN ('DOCUMENTO_FINAL', 'COMPROVANTE_EVIDENCIA')
     )
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_FINALIZACAO_ESTADO_INVALIDO';
  END IF;
  IF NOT EXISTS (
       SELECT 1 FROM storage.objects AS objeto
       WHERE objeto.bucket_id = p_final_bucket_id AND objeto.name = p_final_storage_path
     ) OR NOT EXISTS (
       SELECT 1 FROM storage.objects AS objeto
       WHERE objeto.bucket_id = p_receipt_bucket_id AND objeto.name = p_receipt_storage_path
     )
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_ARTEFATOS_FINAIS_STORAGE_AUSENTE';
  END IF;

  UPDATE public.assinatura_eletronica_envelopes AS envelope
  SET documento_final_sha256 = v_final_sha256,
      finalizado_em = v_finalized_at,
      status = 'ASSINADO'
  WHERE envelope.id = v_envelope.id;

  INSERT INTO public.assinatura_eletronica_artefatos (
    id, envelope_id, classe, bucket_id, storage_path, tamanho_bytes, sha256, imutavel_em
  ) VALUES
  (
    v_final_artifact_id, v_envelope.id, 'DOCUMENTO_FINAL', p_final_bucket_id,
    p_final_storage_path, p_final_tamanho_bytes, v_final_sha256, v_finalized_at
  ),
  (
    v_receipt_artifact_id, v_envelope.id, 'COMPROVANTE_EVIDENCIA', p_receipt_bucket_id,
    p_receipt_storage_path, p_receipt_tamanho_bytes, v_receipt_sha256, v_finalized_at
  );

  PERFORM public.assinatura_eletronica_adicionar_evento(
    v_envelope.id, NULL, 'DOCUMENTO_FINAL_REGISTRADO', NULL,
    jsonb_build_object('artifactId', v_final_artifact_id, 'sha256', v_final_sha256)
  );
  PERFORM public.assinatura_eletronica_adicionar_evento(
    v_envelope.id, NULL, 'COMPROVANTE_REGISTRADO', NULL,
    jsonb_build_object('artifactId', v_receipt_artifact_id, 'sha256', v_receipt_sha256)
  );
  PERFORM public.assinatura_eletronica_adicionar_evento(
    v_envelope.id, NULL, 'ENVELOPE_ASSINADO', NULL,
    jsonb_build_object('requestId', p_request_id, 'finalizedAt', v_finalized_at)
  );

  v_resultado := jsonb_build_object(
    'envelopeId', v_envelope.id,
    'status', 'ASSINADO',
    'statusLabel', public.assinatura_eletronica_envelope_status_label('ASSINADO'),
    'finalizedAt', v_finalized_at,
    'originalSha256', v_envelope.documento_original_sha256,
    'finalSha256', v_final_sha256,
    'artifacts', jsonb_build_array(
      jsonb_build_object(
        'artifactId', v_final_artifact_id, 'class', 'DOCUMENTO_FINAL',
        'bucketId', p_final_bucket_id, 'storagePath', p_final_storage_path,
        'byteSize', p_final_tamanho_bytes, 'sha256', v_final_sha256,
        'immutableAt', v_finalized_at
      ),
      jsonb_build_object(
        'artifactId', v_receipt_artifact_id, 'class', 'COMPROVANTE_EVIDENCIA',
        'bucketId', p_receipt_bucket_id, 'storagePath', p_receipt_storage_path,
        'byteSize', p_receipt_tamanho_bytes, 'sha256', v_receipt_sha256,
        'immutableAt', v_finalized_at
      )
    )
  );
  INSERT INTO public.assinatura_eletronica_operacoes (
    actor_scope, operacao, request_id, payload_sha256, resultado
  ) VALUES (
    'service:system', 'REGISTRAR_ARTEFATO_FINALIZAR', p_request_id,
    v_payload_sha256, v_resultado
  );
  RETURN v_resultado;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 9. Privilégios: tabelas fechadas, três RPCs externas e sete internas.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.assinatura_eletronica_sha256_json(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_snapshot_academico_diario_valido(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_manifesto_diario_valido(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_target_diario_valido(jsonb, jsonb, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_papel_label(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_participante_status_label(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_envelope_status_label(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_exigir_service_role()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_exigir_sessao_ativa(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_perfil_contexto_valido(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_gestor_pode_gerir_diario(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_adicionar_evento(uuid, uuid, text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_ticket_hmac_secret()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_codificar_ticket(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_decodificar_ticket(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_validar_escopo_reauth(uuid, uuid, text, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.assinatura_eletronica_solicitar_envelope_diario(uuid, uuid, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_obter_envelope(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_listar_caixa_contexto(text, uuid, text, uuid, integer, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_solicitar_envelope_diario(uuid, uuid, text, uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_obter_envelope(uuid, text, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_listar_caixa_contexto(text, uuid, text, uuid, integer, timestamptz, uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_preparar_original_diario(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_registrar_original_publicar(uuid, text, text, bigint, text, text, jsonb, jsonb, jsonb, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_preparar_reautenticacao(uuid, uuid, text, uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_registrar_reautenticacao(uuid, uuid, text, uuid, uuid, uuid, timestamptz, jsonb, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_consumir_ticket_reautenticacao(text, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_iniciar_finalizacao(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_registrar_artefato_finalizar(uuid, text, text, bigint, text, text, text, bigint, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_internal_preparar_original_diario(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_internal_registrar_original_publicar(uuid, text, text, bigint, text, text, jsonb, jsonb, jsonb, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_internal_preparar_reautenticacao(uuid, uuid, text, uuid, uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_internal_registrar_reautenticacao(uuid, uuid, text, uuid, uuid, uuid, timestamptz, jsonb, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_internal_consumir_ticket_reautenticacao(text, uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_internal_iniciar_finalizacao(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_internal_registrar_artefato_finalizar(uuid, text, text, bigint, text, text, text, bigint, text, uuid)
  TO service_role;

-- Retira a listagem antiga, cuja semântica era apenas de fundação e permitia
-- que o cliente inferisse elegibilidade. Configuração permanece inalterada.
REVOKE ALL ON FUNCTION public.assinatura_eletronica_listar_caixa(text, uuid, integer, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
