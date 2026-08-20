-- Fundação de assinatura eletrônica.
--
-- Esta migration não converte rubricas visuais em assinatura eletrônica e não
-- habilita assinatura conclusiva. O fluxo conclusivo depende de matriz jurídica,
-- provedor/fator de autenticação e cadeia de evidências entregues em migration
-- posterior. Até lá, a única configuração semeada é MODELO_PADRAO, desabilitada.

BEGIN;

CREATE TABLE public.assinatura_eletronica_politicas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.empresas(id) ON DELETE RESTRICT,
  polo_id uuid REFERENCES public.polos(id) ON DELETE RESTRICT,
  documento text NOT NULL,
  versao integer NOT NULL CHECK (versao > 0),
  habilitada boolean NOT NULL DEFAULT false,
  status_juridico text NOT NULL DEFAULT 'PENDENTE_MATRIZ_JURIDICA'
    CHECK (status_juridico IN (
      'PENDENTE_MATRIZ_JURIDICA',
      'RASCUNHO',
      'EM_REVISAO',
      'APROVADA',
      'BLOQUEADA'
    )),
  certificado jsonb NOT NULL DEFAULT '{"metodo":"BLOQUEADO","cadeiaEvidencias":false}'::jsonb,
  politica jsonb NOT NULL DEFAULT '{"signatarios":[]}'::jsonb,
  request_id uuid,
  criada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  atualizada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  arquivada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  arquivada_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assinatura_eletronica_politicas_documento_not_blank
    CHECK (btrim(documento) <> ''),
  CONSTRAINT assinatura_eletronica_politicas_json_shape
    CHECK (
      jsonb_typeof(certificado) = 'object'
      AND jsonb_typeof(politica) = 'object'
    ),
  CONSTRAINT assinatura_eletronica_politicas_scope_shape
    CHECK (
      (
        documento = 'MODELO_PADRAO'
        AND polo_id IS NULL
        AND company_id IS NULL
      )
      OR (
        documento <> 'MODELO_PADRAO'
        AND polo_id IS NOT NULL
        AND company_id IS NOT NULL
      )
    ),
  CONSTRAINT assinatura_eletronica_politicas_modelo_padrao_disabled
    CHECK (documento <> 'MODELO_PADRAO' OR habilitada IS FALSE),
  CONSTRAINT assinatura_eletronica_politicas_documentos_bloqueados_na_fundacao
    CHECK (
      documento = 'MODELO_PADRAO'
      OR (
        habilitada IS FALSE
        AND status_juridico = 'PENDENTE_MATRIZ_JURIDICA'
      )
    ),
  CONSTRAINT assinatura_eletronica_politicas_enabled_requires_approval
    CHECK (habilitada IS FALSE OR status_juridico = 'APROVADA')
);

CREATE UNIQUE INDEX assinatura_eletronica_politicas_request_id_key
  ON public.assinatura_eletronica_politicas (request_id)
  WHERE request_id IS NOT NULL;

CREATE UNIQUE INDEX assinatura_eletronica_politicas_active_polo_documento_key
  ON public.assinatura_eletronica_politicas (polo_id, documento)
  WHERE polo_id IS NOT NULL AND arquivada_em IS NULL;

CREATE UNIQUE INDEX assinatura_eletronica_politicas_active_global_documento_key
  ON public.assinatura_eletronica_politicas (documento)
  WHERE polo_id IS NULL AND arquivada_em IS NULL;

CREATE INDEX assinatura_eletronica_politicas_scope_lookup_idx
  ON public.assinatura_eletronica_politicas (company_id, polo_id, documento, versao DESC)
  WHERE arquivada_em IS NULL;

CREATE TABLE public.assinatura_eletronica_envelopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  polo_id uuid NOT NULL REFERENCES public.polos(id) ON DELETE RESTRICT,
  documento text NOT NULL,
  titulo text NOT NULL,
  revisao_rotulo text NOT NULL,
  politica_id uuid NOT NULL REFERENCES public.assinatura_eletronica_politicas(id) ON DELETE RESTRICT,
  politica_versao integer NOT NULL CHECK (politica_versao > 0),
  politica_snapshot jsonb NOT NULL,
  certificado_snapshot jsonb NOT NULL,
  matricula_id uuid REFERENCES public.matriculas(id) ON DELETE RESTRICT,
  aluno_id uuid REFERENCES public.parceiros(id) ON DELETE RESTRICT,
  documento_validacao_id uuid REFERENCES public.documentos_validacao(id) ON DELETE RESTRICT,
  conteudo_sha256 text NOT NULL CHECK (conteudo_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'RASCUNHO'
    CHECK (status IN (
      'RASCUNHO',
      'PENDENTE',
      'EM_ASSINATURA',
      'ASSINADO',
      'RECUSADO',
      'CANCELADO',
      'EXPIRADO',
      'SUBSTITUIDO'
    )),
  motivo_status text,
  prazo_em timestamptz,
  request_id uuid,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancelado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancelado_em timestamptz,
  finalizado_em timestamptz,
  substitui_envelope_id uuid REFERENCES public.assinatura_eletronica_envelopes(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assinatura_eletronica_envelopes_documento_not_blank
    CHECK (btrim(documento) <> '' AND documento <> 'MODELO_PADRAO'),
  CONSTRAINT assinatura_eletronica_envelopes_title_not_blank
    CHECK (btrim(titulo) <> '' AND btrim(revisao_rotulo) <> ''),
  CONSTRAINT assinatura_eletronica_envelopes_snapshot_shape
    CHECK (
      jsonb_typeof(politica_snapshot) = 'object'
      AND jsonb_typeof(certificado_snapshot) = 'object'
    ),
  CONSTRAINT assinatura_eletronica_envelopes_finalization_shape
    CHECK (
      (status = 'ASSINADO') = (finalizado_em IS NOT NULL)
    ),
  CONSTRAINT assinatura_eletronica_envelopes_cancellation_shape
    CHECK (
      (status = 'CANCELADO') = (cancelado_em IS NOT NULL)
    )
);

CREATE UNIQUE INDEX assinatura_eletronica_envelopes_request_id_key
  ON public.assinatura_eletronica_envelopes (request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX assinatura_eletronica_envelopes_polo_status_updated_idx
  ON public.assinatura_eletronica_envelopes (polo_id, status, updated_at DESC);

CREATE INDEX assinatura_eletronica_envelopes_matricula_idx
  ON public.assinatura_eletronica_envelopes (matricula_id, updated_at DESC)
  WHERE matricula_id IS NOT NULL;

CREATE INDEX assinatura_eletronica_envelopes_aluno_idx
  ON public.assinatura_eletronica_envelopes (aluno_id, updated_at DESC)
  WHERE aluno_id IS NOT NULL;

CREATE INDEX assinatura_eletronica_envelopes_documento_validacao_idx
  ON public.assinatura_eletronica_envelopes (documento_validacao_id)
  WHERE documento_validacao_id IS NOT NULL;

CREATE TABLE public.assinatura_eletronica_participantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  envelope_id uuid NOT NULL REFERENCES public.assinatura_eletronica_envelopes(id) ON DELETE RESTRICT,
  papel text NOT NULL CHECK (papel IN (
    'ALUNO',
    'RESPONSAVEL_LEGAL',
    'INSTITUICAO',
    'PROFESSOR',
    'CONCEDENTE',
    'SUPERVISOR',
    'TESTEMUNHA'
  )),
  ordem integer NOT NULL DEFAULT 1 CHECK (ordem > 0),
  obrigatorio boolean NOT NULL DEFAULT true,
  parceiro_id uuid REFERENCES public.parceiros(id) ON DELETE RESTRICT,
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  vinculo_verificado_em timestamptz,
  status text NOT NULL DEFAULT 'PENDENTE'
    CHECK (status IN (
      'PENDENTE',
      'AGUARDANDO_VINCULO',
      'DESAFIO_PENDENTE',
      'ASSINADO',
      'RECUSADO',
      'CANCELADO'
    )),
  aceitou_versao_termo text,
  assinado_em timestamptz,
  recusado_em timestamptz,
  motivo_recusa text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assinatura_eletronica_participantes_unique_role_order
    UNIQUE (envelope_id, papel, ordem),
  CONSTRAINT assinatura_eletronica_participantes_signed_shape
    CHECK ((status = 'ASSINADO') = (assinado_em IS NOT NULL)),
  CONSTRAINT assinatura_eletronica_participantes_refused_shape
    CHECK ((status = 'RECUSADO') = (recusado_em IS NOT NULL)),
  CONSTRAINT assinatura_eletronica_participantes_responsavel_pending_safe
    CHECK (
      papel <> 'RESPONSAVEL_LEGAL'
      OR (
        auth_user_id IS NULL
        AND vinculo_verificado_em IS NULL
        AND status = 'AGUARDANDO_VINCULO'
      )
    )
);

CREATE INDEX assinatura_eletronica_participantes_auth_caixa_idx
  ON public.assinatura_eletronica_participantes (auth_user_id, status, updated_at DESC)
  WHERE auth_user_id IS NOT NULL;

CREATE INDEX assinatura_eletronica_participantes_envelope_idx
  ON public.assinatura_eletronica_participantes (envelope_id, ordem, created_at);

CREATE TABLE public.assinatura_eletronica_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  envelope_id uuid NOT NULL REFERENCES public.assinatura_eletronica_envelopes(id) ON DELETE RESTRICT,
  participante_id uuid REFERENCES public.assinatura_eletronica_participantes(id) ON DELETE RESTRICT,
  sequencia integer NOT NULL CHECK (sequencia > 0),
  tipo text NOT NULL CHECK (tipo IN (
    'ENVELOPE_CRIADO',
    'PARTICIPANTE_ADICIONADO',
    'AGUARDANDO_VINCULO_SEGURO',
    'DESAFIO_CRIADO',
    'DESAFIO_VERIFICADO',
    'ASSINATURA_BLOQUEADA_FUNDACAO',
    'ENVELOPE_CANCELADO',
    'ENVELOPE_EXPIRADO',
    'ENVELOPE_SUBSTITUIDO'
  )),
  ator_auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ocorrido_em timestamptz NOT NULL DEFAULT now(),
  dados jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(dados) = 'object'),
  hash_anterior text CHECK (hash_anterior IS NULL OR hash_anterior ~ '^[0-9a-f]{64}$'),
  hash_evento text NOT NULL CHECK (hash_evento ~ '^[0-9a-f]{64}$'),
  CONSTRAINT assinatura_eletronica_eventos_sequence_unique UNIQUE (envelope_id, sequencia)
);

CREATE INDEX assinatura_eletronica_eventos_envelope_sequence_idx
  ON public.assinatura_eletronica_eventos (envelope_id, sequencia);

CREATE TABLE public.assinatura_eletronica_desafios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  envelope_id uuid NOT NULL REFERENCES public.assinatura_eletronica_envelopes(id) ON DELETE RESTRICT,
  participante_id uuid NOT NULL REFERENCES public.assinatura_eletronica_participantes(id) ON DELETE RESTRICT,
  metodo text NOT NULL CHECK (metodo IN ('OTP', 'PROVEDOR_EXTERNO', 'ASSINATURA_QUALIFICADA')),
  estado text NOT NULL DEFAULT 'PENDENTE'
    CHECK (estado IN ('PENDENTE', 'ENVIADO', 'VERIFICADO', 'EXPIRADO', 'CANCELADO')),
  segredo_hash text CHECK (segredo_hash IS NULL OR segredo_hash ~ '^[0-9a-f]{64}$'),
  correlacao_provedor text,
  tentativas integer NOT NULL DEFAULT 0 CHECK (tentativas >= 0),
  max_tentativas integer NOT NULL DEFAULT 5 CHECK (max_tentativas BETWEEN 1 AND 10),
  expira_em timestamptz NOT NULL,
  verificado_em timestamptz,
  evidencia_hash text CHECK (evidencia_hash IS NULL OR evidencia_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assinatura_eletronica_desafios_verified_shape
    CHECK ((estado = 'VERIFICADO') = (verificado_em IS NOT NULL))
);

CREATE INDEX assinatura_eletronica_desafios_participante_estado_idx
  ON public.assinatura_eletronica_desafios (participante_id, estado, expira_em DESC);

CREATE UNIQUE INDEX assinatura_eletronica_desafios_provider_correlation_key
  ON public.assinatura_eletronica_desafios (metodo, correlacao_provedor)
  WHERE correlacao_provedor IS NOT NULL;

CREATE TABLE public.assinatura_eletronica_artefatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  envelope_id uuid NOT NULL REFERENCES public.assinatura_eletronica_envelopes(id) ON DELETE RESTRICT,
  classe text NOT NULL CHECK (classe IN ('DOCUMENTO_FINAL', 'COMPROVANTE_EVIDENCIA')),
  bucket_id text NOT NULL DEFAULT 'documentos-assinatura-eletronica',
  storage_path text NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/pdf' CHECK (mime_type = 'application/pdf'),
  tamanho_bytes bigint NOT NULL CHECK (tamanho_bytes > 0 AND tamanho_bytes <= 52428800),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  imutavel_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assinatura_eletronica_artefatos_path_not_blank
    CHECK (
      btrim(storage_path) <> ''
      AND storage_path !~ '(^|/)\\.\\.?(/|$)'
      AND storage_path LIKE 'envelopes/%'
    ),
  CONSTRAINT assinatura_eletronica_artefatos_unique_class
    UNIQUE (envelope_id, classe),
  CONSTRAINT assinatura_eletronica_artefatos_unique_storage_path
    UNIQUE (bucket_id, storage_path)
);

CREATE INDEX assinatura_eletronica_artefatos_envelope_idx
  ON public.assinatura_eletronica_artefatos (envelope_id, classe);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documentos-assinatura-eletronica',
  'documentos-assinatura-eletronica',
  false,
  52428800,
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_validar_escopo_politica()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
BEGIN
  NEW.documento := CASE
    WHEN upper(btrim(NEW.documento)) = 'MODELO_PADRAO' THEN 'MODELO_PADRAO'
    ELSE btrim(NEW.documento)
  END;

  IF NEW.documento = 'MODELO_PADRAO' THEN
    IF NEW.polo_id IS NOT NULL OR NEW.company_id IS NOT NULL THEN
      RAISE EXCEPTION 'MODELO_PADRAO é global e não aceita polo ou empresa.'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.polo_id IS NULL THEN
    RAISE EXCEPTION 'Política de assinatura por documento exige polo.'
      USING ERRCODE = '23514';
  END IF;

  SELECT polo.company_id
  INTO v_company_id
  FROM public.polos AS polo
  WHERE polo.id = NEW.polo_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Polo de assinatura inválido ou sem empresa.'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.company_id IS NULL THEN
    NEW.company_id := v_company_id;
  ELSIF NEW.company_id IS DISTINCT FROM v_company_id THEN
    RAISE EXCEPTION 'Empresa da política não corresponde ao polo informado.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_validar_escopo_envelope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
BEGIN
  NEW.documento := CASE
    WHEN upper(btrim(NEW.documento)) = 'MODELO_PADRAO' THEN 'MODELO_PADRAO'
    ELSE btrim(NEW.documento)
  END;
  NEW.conteudo_sha256 := lower(btrim(NEW.conteudo_sha256));

  IF TG_OP = 'INSERT' AND NEW.status <> 'RASCUNHO' THEN
    RAISE EXCEPTION 'A fundação só permite criar envelopes em rascunho.'
      USING ERRCODE = '55000';
  END IF;

  SELECT polo.company_id
  INTO v_company_id
  FROM public.polos AS polo
  WHERE polo.id = NEW.polo_id;

  IF v_company_id IS NULL OR NEW.company_id IS DISTINCT FROM v_company_id THEN
    RAISE EXCEPTION 'Escopo empresa/polo inválido para envelope de assinatura.'
      USING ERRCODE = '23514';
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
  v_envelope_substituido public.assinatura_eletronica_envelopes%ROWTYPE;
  v_aluno_id uuid;
  v_polo_matricula_id uuid;
  v_documento_validacao text;
  v_polo_validacao_id uuid;
  v_matricula_validacao_id uuid;
  v_aluno_validacao_id uuid;
  v_status_validacao text;
BEGIN
  SELECT politica.*
  INTO v_politica
  FROM public.assinatura_eletronica_politicas AS politica
  WHERE politica.id = NEW.politica_id
  FOR SHARE;

  IF NOT FOUND OR v_politica.arquivada_em IS NOT NULL THEN
    RAISE EXCEPTION 'Política de assinatura inexistente ou arquivada para o envelope.'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.company_id IS DISTINCT FROM v_politica.company_id
     OR NEW.polo_id IS DISTINCT FROM v_politica.polo_id
     OR NEW.documento IS DISTINCT FROM v_politica.documento
     OR NEW.politica_versao IS DISTINCT FROM v_politica.versao
     OR NEW.politica_snapshot IS DISTINCT FROM v_politica.politica
     OR NEW.certificado_snapshot IS DISTINCT FROM v_politica.certificado
  THEN
    RAISE EXCEPTION 'Política, versão ou snapshots não correspondem ao escopo do envelope.'
      USING ERRCODE = '23514';
  END IF;

  -- MODELO_PADRAO é apenas apresentação e não pode compor envelopes; toda
  -- política por documento continua incapaz de liberar assinatura nesta fase.
  IF v_politica.documento <> 'MODELO_PADRAO'
     OR v_politica.habilitada
     OR v_politica.status_juridico <> 'PENDENTE_MATRIZ_JURIDICA'
  THEN
    RAISE EXCEPTION 'Políticas por documento não podem gerar envelopes nesta fundação.'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.matricula_id IS NOT NULL THEN
    SELECT matricula.aluno_id, turma.polo_id
    INTO v_aluno_id, v_polo_matricula_id
    FROM public.matriculas AS matricula
    JOIN public.turmas AS turma ON turma.id = matricula.turma_id
    WHERE matricula.id = NEW.matricula_id;

    IF v_polo_matricula_id IS NULL THEN
      RAISE EXCEPTION 'Matrícula inválida para o envelope de assinatura.'
        USING ERRCODE = '23503';
    END IF;

    IF NEW.polo_id IS DISTINCT FROM v_polo_matricula_id THEN
      RAISE EXCEPTION 'Matrícula pertence a outro polo.' USING ERRCODE = '23514';
    END IF;

    IF NEW.aluno_id IS NULL THEN
      NEW.aluno_id := v_aluno_id;
    ELSIF NEW.aluno_id IS DISTINCT FROM v_aluno_id THEN
      RAISE EXCEPTION 'Aluno do envelope não corresponde à matrícula.' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.documento_validacao_id IS NOT NULL THEN
    SELECT
      validacao.documento,
      validacao.polo_id,
      validacao.matricula_id,
      validacao.aluno_id,
      validacao.status
    INTO
      v_documento_validacao,
      v_polo_validacao_id,
      v_matricula_validacao_id,
      v_aluno_validacao_id,
      v_status_validacao
    FROM public.documentos_validacao AS validacao
    WHERE validacao.id = NEW.documento_validacao_id;

    IF v_documento_validacao IS NULL
       OR v_status_validacao <> 'ATIVO'
       OR NEW.documento IS DISTINCT FROM v_documento_validacao
       OR NEW.polo_id IS DISTINCT FROM v_polo_validacao_id
       OR (NEW.matricula_id IS NOT NULL AND NEW.matricula_id IS DISTINCT FROM v_matricula_validacao_id)
       OR (NEW.aluno_id IS NOT NULL AND NEW.aluno_id IS DISTINCT FROM v_aluno_validacao_id)
    THEN
      RAISE EXCEPTION 'Documento de validação incompatível com o envelope.'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.matricula_id IS NULL THEN
      NEW.matricula_id := v_matricula_validacao_id;
    END IF;
    IF NEW.aluno_id IS NULL THEN
      NEW.aluno_id := v_aluno_validacao_id;
    END IF;
  END IF;

  IF NEW.substitui_envelope_id IS NOT NULL THEN
    IF NEW.substitui_envelope_id = NEW.id THEN
      RAISE EXCEPTION 'Um envelope não pode substituir a si mesmo.' USING ERRCODE = '23514';
    END IF;

    SELECT envelope.*
    INTO v_envelope_substituido
    FROM public.assinatura_eletronica_envelopes AS envelope
    WHERE envelope.id = NEW.substitui_envelope_id
    FOR KEY SHARE;

    IF NOT FOUND
       OR NEW.company_id IS DISTINCT FROM v_envelope_substituido.company_id
       OR NEW.polo_id IS DISTINCT FROM v_envelope_substituido.polo_id
       OR NEW.documento IS DISTINCT FROM v_envelope_substituido.documento
       OR NEW.matricula_id IS DISTINCT FROM v_envelope_substituido.matricula_id
       OR NEW.aluno_id IS DISTINCT FROM v_envelope_substituido.aluno_id
    THEN
      RAISE EXCEPTION 'Envelope substituído deve pertencer ao mesmo documento, empresa, polo, aluno e matrícula.'
        USING ERRCODE = '23514';
    END IF;
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
  v_conteudo_sha256 text;
  v_path_esperado text;
BEGIN
  NEW.sha256 := lower(btrim(NEW.sha256));
  v_path_esperado := 'envelopes/' || NEW.envelope_id::text || '/' || CASE NEW.classe
    WHEN 'DOCUMENTO_FINAL' THEN 'documento-final.pdf'
    WHEN 'COMPROVANTE_EVIDENCIA' THEN 'comprovante-evidencia.pdf'
  END;

  IF NEW.bucket_id <> 'documentos-assinatura-eletronica'
     OR NEW.storage_path IS DISTINCT FROM v_path_esperado
  THEN
    RAISE EXCEPTION 'Artefato fora do bucket ou caminho imutável autorizado.'
      USING ERRCODE = '23514';
  END IF;

  SELECT envelope.conteudo_sha256
  INTO v_conteudo_sha256
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = NEW.envelope_id;

  IF v_conteudo_sha256 IS NULL THEN
    RAISE EXCEPTION 'Envelope inválido para artefato.' USING ERRCODE = '23503';
  END IF;

  IF NEW.classe = 'DOCUMENTO_FINAL' AND NEW.sha256 IS DISTINCT FROM v_conteudo_sha256 THEN
    RAISE EXCEPTION 'Hash do documento final não corresponde ao envelope.'
      USING ERRCODE = '23514';
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
  IF NEW.status = 'ASSINADO' THEN
    RAISE EXCEPTION 'Assinatura conclusiva permanece bloqueada nesta fundação.'
      USING ERRCODE = '55000';
  END IF;

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
     OR NEW.conteudo_sha256 IS DISTINCT FROM OLD.conteudo_sha256
     OR NEW.prazo_em IS DISTINCT FROM OLD.prazo_em
     OR NEW.request_id IS DISTINCT FROM OLD.request_id
     OR NEW.criado_por IS DISTINCT FROM OLD.criado_por
     OR NEW.substitui_envelope_id IS DISTINCT FROM OLD.substitui_envelope_id
  THEN
    RAISE EXCEPTION 'Conteúdo e escopo do envelope são imutáveis.'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (
       (OLD.status = 'RASCUNHO' AND NEW.status IN ('PENDENTE', 'CANCELADO'))
       OR (OLD.status = 'PENDENTE' AND NEW.status IN ('EM_ASSINATURA', 'ASSINADO', 'RECUSADO', 'CANCELADO', 'EXPIRADO'))
       OR (OLD.status = 'EM_ASSINATURA' AND NEW.status IN ('ASSINADO', 'RECUSADO', 'CANCELADO', 'EXPIRADO'))
       OR (OLD.status = 'ASSINADO' AND NEW.status = 'SUBSTITUIDO')
     )
  THEN
    RAISE EXCEPTION 'Transição de estado do envelope não permitida: % para %.', OLD.status, NEW.status
      USING ERRCODE = '55000';
  END IF;

  IF OLD.status = 'CANCELADO'
     AND (
       NEW.cancelado_em IS DISTINCT FROM OLD.cancelado_em
       OR NEW.cancelado_por IS DISTINCT FROM OLD.cancelado_por
       OR NEW.motivo_status IS DISTINCT FROM OLD.motivo_status
     )
  THEN
    RAISE EXCEPTION 'Dados e motivo de um envelope cancelado são imutáveis.'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.status <> 'CANCELADO'
     AND (NEW.cancelado_em IS DISTINCT FROM OLD.cancelado_em OR NEW.cancelado_por IS DISTINCT FROM OLD.cancelado_por)
  THEN
    RAISE EXCEPTION 'Dados de cancelamento só podem ser definidos no cancelamento.'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.status <> 'ASSINADO' AND NEW.finalizado_em IS DISTINCT FROM OLD.finalizado_em THEN
    RAISE EXCEPTION 'Finalização só pode ser definida na assinatura concluída.'
      USING ERRCODE = '55000';
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
  IF NEW.status = 'ASSINADO' THEN
    RAISE EXCEPTION 'Assinatura conclusiva permanece bloqueada nesta fundação.'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.envelope_id IS DISTINCT FROM OLD.envelope_id
     OR NEW.papel IS DISTINCT FROM OLD.papel
     OR NEW.ordem IS DISTINCT FROM OLD.ordem
     OR NEW.obrigatorio IS DISTINCT FROM OLD.obrigatorio
     OR NEW.parceiro_id IS DISTINCT FROM OLD.parceiro_id
     OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
     OR NEW.vinculo_verificado_em IS DISTINCT FROM OLD.vinculo_verificado_em
  THEN
    RAISE EXCEPTION 'Identidade e papel do participante são imutáveis.'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (
       (OLD.status = 'PENDENTE' AND NEW.status IN ('DESAFIO_PENDENTE', 'ASSINADO', 'RECUSADO', 'CANCELADO'))
       OR (OLD.status = 'DESAFIO_PENDENTE' AND NEW.status IN ('ASSINADO', 'RECUSADO', 'CANCELADO'))
     )
  THEN
    RAISE EXCEPTION 'Transição de estado do participante não permitida.'
      USING ERRCODE = '55000';
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
BEGIN
  IF TG_OP = 'INSERT'
     AND NEW.status NOT IN ('PENDENTE', 'AGUARDANDO_VINCULO')
  THEN
    RAISE EXCEPTION 'A fundação só permite participantes pendentes de vínculo ou assinatura.'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.status = 'ASSINADO' THEN
    RAISE EXCEPTION 'Assinatura conclusiva permanece bloqueada nesta fundação.'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_validar_evento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_ultima_sequencia integer;
  v_ultimo_hash text;
BEGIN
  IF NEW.participante_id IS NOT NULL THEN
    PERFORM 1
    FROM public.assinatura_eletronica_participantes AS participante
    WHERE participante.id = NEW.participante_id
      AND participante.envelope_id = NEW.envelope_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Participante do evento não pertence ao envelope informado.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('assinatura-eletronica-evento:' || NEW.envelope_id::text, 0)
  );

  SELECT evento.sequencia, evento.hash_evento
  INTO v_ultima_sequencia, v_ultimo_hash
  FROM public.assinatura_eletronica_eventos AS evento
  WHERE evento.envelope_id = NEW.envelope_id
  ORDER BY evento.sequencia DESC
  LIMIT 1;

  IF NOT FOUND THEN
    IF NEW.sequencia <> 1 OR NEW.hash_anterior IS NOT NULL THEN
      RAISE EXCEPTION 'O primeiro evento deve ter sequência 1 e não pode ter hash anterior.'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.sequencia <> v_ultima_sequencia + 1
     OR NEW.hash_anterior IS DISTINCT FROM v_ultimo_hash
  THEN
    RAISE EXCEPTION 'Evento deve continuar a sequência e a cadeia de hash do envelope.'
      USING ERRCODE = '23514';
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
  PERFORM 1
  FROM public.assinatura_eletronica_participantes AS participante
  WHERE participante.id = NEW.participante_id
    AND participante.envelope_id = NEW.envelope_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participante do desafio não pertence ao envelope informado.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_eventos_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'Eventos de assinatura eletrônica são imutáveis.'
    USING ERRCODE = '55000';
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_artefatos_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'Artefatos de assinatura eletrônica são imutáveis.'
    USING ERRCODE = '55000';
END;
$function$;

CREATE TRIGGER assinatura_eletronica_politicas_scope_before_write
  BEFORE INSERT OR UPDATE ON public.assinatura_eletronica_politicas
  FOR EACH ROW EXECUTE FUNCTION public.assinatura_eletronica_validar_escopo_politica();

CREATE TRIGGER assinatura_eletronica_politicas_touch_before_update
  BEFORE UPDATE ON public.assinatura_eletronica_politicas
  FOR EACH ROW EXECUTE FUNCTION public.assinatura_eletronica_touch_updated_at();

CREATE TRIGGER assinatura_eletronica_envelopes_a_scope_before_write
  BEFORE INSERT OR UPDATE ON public.assinatura_eletronica_envelopes
  FOR EACH ROW EXECUTE FUNCTION public.assinatura_eletronica_validar_escopo_envelope();

CREATE TRIGGER assinatura_eletronica_envelopes_links_before_write
  BEFORE INSERT OR UPDATE ON public.assinatura_eletronica_envelopes
  FOR EACH ROW EXECUTE FUNCTION public.assinatura_eletronica_validar_vinculos_envelope();

CREATE TRIGGER assinatura_eletronica_envelopes_protect_before_update
  BEFORE UPDATE ON public.assinatura_eletronica_envelopes
  FOR EACH ROW EXECUTE FUNCTION public.assinatura_eletronica_proteger_envelope();

CREATE TRIGGER assinatura_eletronica_envelopes_touch_before_update
  BEFORE UPDATE ON public.assinatura_eletronica_envelopes
  FOR EACH ROW EXECUTE FUNCTION public.assinatura_eletronica_touch_updated_at();

CREATE TRIGGER assinatura_eletronica_participantes_protect_before_update
  BEFORE UPDATE ON public.assinatura_eletronica_participantes
  FOR EACH ROW EXECUTE FUNCTION public.assinatura_eletronica_proteger_participante();

CREATE TRIGGER assinatura_eletronica_participantes_validate_before_write
  BEFORE INSERT OR UPDATE ON public.assinatura_eletronica_participantes
  FOR EACH ROW EXECUTE FUNCTION public.assinatura_eletronica_validar_participante_fundacao();

CREATE TRIGGER assinatura_eletronica_participantes_touch_before_update
  BEFORE UPDATE ON public.assinatura_eletronica_participantes
  FOR EACH ROW EXECUTE FUNCTION public.assinatura_eletronica_touch_updated_at();

CREATE TRIGGER assinatura_eletronica_eventos_validate_before_insert
  BEFORE INSERT ON public.assinatura_eletronica_eventos
  FOR EACH ROW EXECUTE FUNCTION public.assinatura_eletronica_validar_evento();

CREATE TRIGGER assinatura_eletronica_desafios_validate_before_write
  BEFORE INSERT OR UPDATE ON public.assinatura_eletronica_desafios
  FOR EACH ROW EXECUTE FUNCTION public.assinatura_eletronica_validar_desafio();

CREATE TRIGGER assinatura_eletronica_desafios_touch_before_update
  BEFORE UPDATE ON public.assinatura_eletronica_desafios
  FOR EACH ROW EXECUTE FUNCTION public.assinatura_eletronica_touch_updated_at();

CREATE TRIGGER assinatura_eletronica_eventos_no_update
  BEFORE UPDATE OR DELETE ON public.assinatura_eletronica_eventos
  FOR EACH ROW EXECUTE FUNCTION public.assinatura_eletronica_eventos_append_only();

CREATE TRIGGER assinatura_eletronica_artefatos_no_update
  BEFORE UPDATE OR DELETE ON public.assinatura_eletronica_artefatos
  FOR EACH ROW EXECUTE FUNCTION public.assinatura_eletronica_artefatos_append_only();

CREATE TRIGGER assinatura_eletronica_artefatos_validate_before_insert
  BEFORE INSERT ON public.assinatura_eletronica_artefatos
  FOR EACH ROW EXECUTE FUNCTION public.assinatura_eletronica_validar_artefato();

ALTER TABLE public.assinatura_eletronica_politicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinatura_eletronica_envelopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinatura_eletronica_participantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinatura_eletronica_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinatura_eletronica_desafios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinatura_eletronica_artefatos ENABLE ROW LEVEL SECURITY;

CREATE POLICY assinatura_eletronica_politicas_authenticated_deny
  ON public.assinatura_eletronica_politicas
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY assinatura_eletronica_envelopes_authenticated_deny
  ON public.assinatura_eletronica_envelopes
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY assinatura_eletronica_participantes_authenticated_deny
  ON public.assinatura_eletronica_participantes
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY assinatura_eletronica_eventos_authenticated_deny
  ON public.assinatura_eletronica_eventos
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY assinatura_eletronica_desafios_authenticated_deny
  ON public.assinatura_eletronica_desafios
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY assinatura_eletronica_artefatos_authenticated_deny
  ON public.assinatura_eletronica_artefatos
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY assinatura_eletronica_storage_client_deny
  ON storage.objects
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (bucket_id <> 'documentos-assinatura-eletronica')
  WITH CHECK (bucket_id <> 'documentos-assinatura-eletronica');

-- A fronteira de acesso, inclusive para rotinas de backend com service_role,
-- permanece nas RPCs SECURITY DEFINER abaixo. Nenhum papel de API recebe
-- acesso direto às tabelas nem privilégios capazes de truncar ou alterar a
-- trilha de auditoria.
REVOKE ALL ON TABLE public.assinatura_eletronica_politicas FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.assinatura_eletronica_envelopes FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.assinatura_eletronica_participantes FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.assinatura_eletronica_eventos FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.assinatura_eletronica_desafios FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.assinatura_eletronica_artefatos FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_autoriza_configuracao(p_polo_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT coalesce((SELECT auth.jwt() ->> 'role'), '') = 'service_role'
    OR (
      public.gestor_has_module('configuracoes')
      AND CASE
        WHEN p_polo_id IS NULL THEN public.is_gestor_global()
        ELSE public.is_gestor_for_polo(p_polo_id)
      END
    );
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_status_juridico_label(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT CASE p_status
    WHEN 'APROVADA' THEN 'Aprovada juridicamente'
    WHEN 'EM_REVISAO' THEN 'Em revisão jurídica'
    WHEN 'RASCUNHO' THEN 'Rascunho jurídico'
    WHEN 'BLOQUEADA' THEN 'Bloqueada'
    WHEN 'PENDENTE_MATRIZ_JURIDICA' THEN 'Aguardando parecer jurídico'
    ELSE 'Aguardando parecer jurídico'
  END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_apresentar_configuracao(
  p_registro public.assinatura_eletronica_politicas
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'polo_id', (p_registro).polo_id,
    'version', (p_registro).versao,
    'enabled', (p_registro).habilitada,
    'legal_status_label', public.assinatura_eletronica_status_juridico_label((p_registro).status_juridico),
    'certificate', jsonb_build_object(
      'statusLabel', coalesce(
        (p_registro).certificado ->> 'statusLabel',
        public.assinatura_eletronica_status_juridico_label((p_registro).status_juridico)
      ),
      'description', coalesce(
        (p_registro).certificado ->> 'description',
        CASE
          WHEN (p_registro).habilitada THEN
            'A configuração exige cadeia de evidências e autenticação reforçada; a execução conclusiva ainda não está liberada nesta fundação.'
          ELSE
            'Nenhuma assinatura jurídica está habilitada até aprovação da matriz e integração do fator de autenticação.'
        END
      )
    ),
    'policy', jsonb_build_object(
      'documentType', coalesce((p_registro).politica ->> 'documentType', (p_registro).documento),
      'name', coalesce((p_registro).politica ->> 'name', 'Modelo de comprovante de assinatura'),
      'versionLabel', coalesce((p_registro).politica ->> 'versionLabel', 'Versão ' || (p_registro).versao::text),
      'confirmationMessage', coalesce(
        (p_registro).politica ->> 'confirmationMessage',
        'A confirmação jurídica será disponibilizada após a aprovação da política de assinatura.'
      ),
      'receiptTitle', coalesce((p_registro).politica ->> 'receiptTitle', 'Comprovante de Assinatura Eletrônica'),
      'receiptMessage', coalesce(
        (p_registro).politica ->> 'receiptMessage',
        'A autenticidade deve ser conferida pelo QR Code ou pela URL de validação.'
      ),
      'receiptFields', CASE
        WHEN jsonb_typeof((p_registro).politica -> 'receiptFields') = 'array'
          THEN (p_registro).politica -> 'receiptFields'
        ELSE jsonb_build_array(
          jsonb_build_object('id', 'envelope', 'label', 'Envelope', 'description', 'Identificador único do envio.'),
          jsonb_build_object('id', 'document_revision', 'label', 'Revisão', 'description', 'Versão congelada do documento.'),
          jsonb_build_object('id', 'participants', 'label', 'Participantes', 'description', 'Participantes e papéis autorizados.'),
          jsonb_build_object('id', 'events', 'label', 'Eventos', 'description', 'Trilha de evidências do processo.')
        )
      END
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_obter_configuracao(
  p_polo_id uuid DEFAULT NULL,
  p_documento text DEFAULT 'MODELO_PADRAO'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_documento text := upper(btrim(coalesce(p_documento, 'MODELO_PADRAO')));
  v_politica public.assinatura_eletronica_politicas%ROWTYPE;
BEGIN
  IF v_documento = '' THEN
    RAISE EXCEPTION 'Documento de assinatura inválido.' USING ERRCODE = '22023';
  END IF;

  IF NOT public.assinatura_eletronica_autoriza_configuracao(p_polo_id) THEN
    RAISE EXCEPTION 'Acesso não autorizado à configuração de assinatura eletrônica.'
      USING ERRCODE = '42501';
  END IF;

  IF v_documento = 'MODELO_PADRAO' AND p_polo_id IS NOT NULL THEN
    RAISE EXCEPTION 'MODELO_PADRAO é uma configuração global.' USING ERRCODE = '22023';
  END IF;

  IF v_documento <> 'MODELO_PADRAO' THEN
    RAISE EXCEPTION 'Políticas por documento permanecem bloqueadas nesta fundação.'
      USING ERRCODE = '55000';
  END IF;

  SELECT politica.*
  INTO v_politica
  FROM public.assinatura_eletronica_politicas AS politica
  WHERE politica.polo_id IS NOT DISTINCT FROM p_polo_id
    AND politica.documento = v_documento
    AND politica.arquivada_em IS NULL
  ORDER BY politica.versao DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'polo_id', p_polo_id,
      'version', 0,
      'enabled', false,
      'legal_status_label', 'Aguardando parecer jurídico',
      'certificate', jsonb_build_object(
        'statusLabel', 'Aguardando parecer jurídico',
        'description', 'Nenhuma assinatura jurídica está habilitada até aprovação da matriz e integração do fator de autenticação.'
      ),
      'policy', jsonb_build_object(
        'documentType', v_documento,
        'name', 'Modelo de comprovante de assinatura',
        'versionLabel', 'Sem versão',
        'confirmationMessage', 'A confirmação jurídica será disponibilizada após a aprovação da política de assinatura.',
        'receiptTitle', 'Comprovante de Assinatura Eletrônica',
        'receiptMessage', 'A autenticidade deve ser conferida pelo QR Code ou pela URL de validação.',
        'receiptFields', jsonb_build_array(
          jsonb_build_object('id', 'envelope', 'label', 'Envelope', 'description', 'Identificador único do envio.'),
          jsonb_build_object('id', 'document_revision', 'label', 'Revisão', 'description', 'Versão congelada do documento.'),
          jsonb_build_object('id', 'participants', 'label', 'Participantes', 'description', 'Participantes e papéis autorizados.'),
          jsonb_build_object('id', 'events', 'label', 'Eventos', 'description', 'Trilha de evidências do processo.')
        )
      )
    );
  END IF;

  RETURN public.assinatura_eletronica_apresentar_configuracao(v_politica);
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_salvar_configuracao(
  p_polo_id uuid DEFAULT NULL,
  p_documento text DEFAULT 'MODELO_PADRAO',
  p_configuracao jsonb DEFAULT '{}'::jsonb,
  p_request_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_documento text := upper(btrim(coalesce(p_documento, 'MODELO_PADRAO')));
  v_habilitada boolean := false;
  v_status_juridico text;
  v_certificado jsonb;
  v_politica_json jsonb;
  v_company_id uuid;
  v_versao integer;
  v_request_id uuid := coalesce(p_request_id, gen_random_uuid());
  v_replay public.assinatura_eletronica_politicas%ROWTYPE;
  v_resultado public.assinatura_eletronica_politicas%ROWTYPE;
BEGIN
  IF NOT public.assinatura_eletronica_autoriza_configuracao(p_polo_id) THEN
    RAISE EXCEPTION 'Acesso não autorizado para configurar assinatura eletrônica.'
      USING ERRCODE = '42501';
  END IF;

  IF v_documento = '' OR jsonb_typeof(p_configuracao) <> 'object' THEN
    RAISE EXCEPTION 'Configuração de assinatura inválida.' USING ERRCODE = '22023';
  END IF;

  IF v_documento <> 'MODELO_PADRAO' THEN
    RAISE EXCEPTION 'Políticas por documento permanecem bloqueadas nesta fundação.'
      USING ERRCODE = '55000';
  END IF;

  IF p_polo_id IS NOT NULL THEN
    RAISE EXCEPTION 'MODELO_PADRAO é uma configuração global.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(p_configuracao) AS campo(chave)
    WHERE campo.chave NOT IN (
      'name',
      'versionLabel',
      'confirmationMessage',
      'receiptTitle',
      'receiptMessage'
    )
  ) THEN
    RAISE EXCEPTION 'A configuração aceita somente os cinco campos de apresentação do MODELO_PADRAO.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT (p_configuracao ? 'name')
     OR NOT (p_configuracao ? 'versionLabel')
     OR NOT (p_configuracao ? 'confirmationMessage')
     OR NOT (p_configuracao ? 'receiptTitle')
     OR NOT (p_configuracao ? 'receiptMessage')
     OR jsonb_typeof(p_configuracao -> 'name') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_configuracao -> 'versionLabel') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_configuracao -> 'confirmationMessage') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_configuracao -> 'receiptTitle') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_configuracao -> 'receiptMessage') IS DISTINCT FROM 'string'
     OR btrim(p_configuracao ->> 'name') = ''
     OR btrim(p_configuracao ->> 'versionLabel') = ''
     OR btrim(p_configuracao ->> 'confirmationMessage') = ''
     OR btrim(p_configuracao ->> 'receiptTitle') = ''
     OR btrim(p_configuracao ->> 'receiptMessage') = ''
     OR char_length(p_configuracao ->> 'name') > 160
     OR char_length(p_configuracao ->> 'versionLabel') > 80
     OR char_length(p_configuracao ->> 'confirmationMessage') > 1000
     OR char_length(p_configuracao ->> 'receiptTitle') > 160
     OR char_length(p_configuracao ->> 'receiptMessage') > 1000
  THEN
    RAISE EXCEPTION 'Campos de apresentação do MODELO_PADRAO são obrigatórios e excederam o formato permitido.'
      USING ERRCODE = '22023';
  END IF;

  -- O cliente não controla qualquer campo jurídico. A camada de apresentação é
  -- normalizada para um modelo sem força de assinatura até migration posterior.
  v_habilitada := false;
  v_status_juridico := 'PENDENTE_MATRIZ_JURIDICA';
  v_certificado := jsonb_build_object(
    'metodo', 'BLOQUEADO',
    'cadeiaEvidencias', false,
    'statusLabel', 'Aguardando parecer jurídico',
    'description', 'Nenhuma assinatura jurídica está habilitada até aprovação da matriz e integração do fator de autenticação.'
  );
  v_politica_json := jsonb_build_object(
    'documentType', 'MODELO_PADRAO',
    'name', btrim(p_configuracao ->> 'name'),
    'versionLabel', btrim(p_configuracao ->> 'versionLabel'),
    'confirmationMessage', btrim(p_configuracao ->> 'confirmationMessage'),
    'receiptTitle', btrim(p_configuracao ->> 'receiptTitle'),
    'receiptMessage', btrim(p_configuracao ->> 'receiptMessage'),
    'receiptFields', jsonb_build_array(
      jsonb_build_object('id', 'envelope', 'label', 'Envelope', 'description', 'Identificador único do envio.'),
      jsonb_build_object('id', 'document_revision', 'label', 'Revisão', 'description', 'Versão congelada do documento.'),
      jsonb_build_object('id', 'participants', 'label', 'Participantes', 'description', 'Participantes e papéis autorizados.'),
      jsonb_build_object('id', 'events', 'label', 'Eventos', 'description', 'Trilha de evidências do processo.')
    ),
    'signatarios', jsonb_build_array()
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'assinatura-eletronica-config:' || coalesce(p_polo_id::text, 'GLOBAL') || ':' || v_documento,
      0
    )
  );

  SELECT politica.*
  INTO v_replay
  FROM public.assinatura_eletronica_politicas AS politica
  WHERE politica.request_id = v_request_id;

  IF FOUND THEN
    IF v_replay.polo_id IS DISTINCT FROM p_polo_id
       OR v_replay.documento IS DISTINCT FROM v_documento
       OR v_replay.habilitada IS DISTINCT FROM v_habilitada
       OR v_replay.status_juridico IS DISTINCT FROM v_status_juridico
       OR v_replay.certificado IS DISTINCT FROM v_certificado
       OR v_replay.politica IS DISTINCT FROM v_politica_json
    THEN
      RAISE EXCEPTION 'A chave de idempotência já foi usada com dados diferentes.'
        USING ERRCODE = '22023';
    END IF;

    RETURN public.assinatura_eletronica_apresentar_configuracao(v_replay);
  END IF;

  SELECT coalesce(max(politica.versao), 0) + 1
  INTO v_versao
  FROM public.assinatura_eletronica_politicas AS politica
  WHERE politica.polo_id IS NOT DISTINCT FROM p_polo_id
    AND politica.documento = v_documento;

  UPDATE public.assinatura_eletronica_politicas AS politica
  SET arquivada_em = now(),
      arquivada_por = auth.uid(),
      atualizada_por = auth.uid()
  WHERE politica.polo_id IS NOT DISTINCT FROM p_polo_id
    AND politica.documento = v_documento
    AND politica.arquivada_em IS NULL;

  INSERT INTO public.assinatura_eletronica_politicas (
    company_id,
    polo_id,
    documento,
    versao,
    habilitada,
    status_juridico,
    certificado,
    politica,
    request_id,
    criada_por,
    atualizada_por
  ) VALUES (
    v_company_id,
    p_polo_id,
    v_documento,
    v_versao,
    v_habilitada,
    v_status_juridico,
    v_certificado,
    v_politica_json,
    v_request_id,
    auth.uid(),
    auth.uid()
  )
  RETURNING * INTO v_resultado;

  RETURN public.assinatura_eletronica_apresentar_configuracao(v_resultado);
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_listar_caixa(
  p_status text DEFAULT 'PENDENTES',
  p_polo_id uuid DEFAULT NULL,
  p_limite integer DEFAULT 50,
  p_cursor timestamptz DEFAULT NULL
)
RETURNS TABLE(
  "envelopeId" uuid,
  "title" text,
  "revisionLabel" text,
  "participantRoleLabel" text,
  "deadlineLabel" text,
  "updatedAtLabel" text,
  "statusLabel" text,
  "primaryAction" text,
  "primaryActionLabel" text,
  "canAct" boolean,
  "message" text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_status text := upper(btrim(coalesce(p_status, 'PENDENTES')));
BEGIN
  IF coalesce((SELECT auth.jwt() ->> 'role'), '') <> 'service_role' AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória para consultar a caixa de assinatura.'
      USING ERRCODE = '42501';
  END IF;

  IF v_status NOT IN ('PENDENTES', 'ASSINADOS', 'TODOS') THEN
    RAISE EXCEPTION 'Filtro de caixa inválido.' USING ERRCODE = '22023';
  END IF;

  IF p_limite IS NULL OR p_limite < 1 OR p_limite > 100 THEN
    RAISE EXCEPTION 'Limite de caixa deve estar entre 1 e 100.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH caixa AS (
    SELECT
      envelope.id,
      envelope.titulo,
      envelope.revisao_rotulo,
      envelope.status,
      envelope.prazo_em,
      envelope.updated_at,
      participante.papel,
      participante.id AS participante_id,
      (
        coalesce((SELECT auth.jwt() ->> 'role'), '') = 'service_role'
        OR public.can_manage_secretaria_document(envelope.documento, envelope.polo_id)
      ) AS pode_gerir
    FROM public.assinatura_eletronica_envelopes AS envelope
    LEFT JOIN LATERAL (
      SELECT participante_interno.*
      FROM public.assinatura_eletronica_participantes AS participante_interno
      WHERE participante_interno.envelope_id = envelope.id
        AND participante_interno.auth_user_id = auth.uid()
      ORDER BY participante_interno.ordem ASC, participante_interno.created_at ASC
      LIMIT 1
    ) AS participante ON true
    WHERE (p_polo_id IS NULL OR envelope.polo_id = p_polo_id)
      AND (p_cursor IS NULL OR envelope.updated_at < p_cursor)
  )
  SELECT
    caixa.id,
    caixa.titulo,
    caixa.revisao_rotulo,
    CASE
      WHEN caixa.papel IS NULL THEN 'Gestão'
      WHEN caixa.papel = 'ALUNO' THEN 'Aluno(a)'
      WHEN caixa.papel = 'RESPONSAVEL_LEGAL' THEN 'Responsável legal'
      WHEN caixa.papel = 'INSTITUICAO' THEN 'Instituição'
      WHEN caixa.papel = 'PROFESSOR' THEN 'Professor(a)'
      WHEN caixa.papel = 'CONCEDENTE' THEN 'Concedente'
      WHEN caixa.papel = 'SUPERVISOR' THEN 'Supervisor(a)'
      WHEN caixa.papel = 'TESTEMUNHA' THEN 'Testemunha'
      ELSE caixa.papel
    END,
    CASE
      WHEN caixa.prazo_em IS NULL THEN 'Sem prazo definido'
      ELSE to_char(caixa.prazo_em AT TIME ZONE 'America/Maceio', 'DD/MM/YYYY HH24:MI')
    END,
    to_char(caixa.updated_at AT TIME ZONE 'America/Maceio', 'DD/MM/YYYY HH24:MI'),
    CASE caixa.status
      WHEN 'RASCUNHO' THEN 'Rascunho'
      WHEN 'PENDENTE' THEN 'Pendente'
      WHEN 'EM_ASSINATURA' THEN 'Em assinatura'
      WHEN 'ASSINADO' THEN 'Assinado'
      WHEN 'RECUSADO' THEN 'Recusado'
      WHEN 'CANCELADO' THEN 'Cancelado'
      WHEN 'EXPIRADO' THEN 'Expirado'
      WHEN 'SUBSTITUIDO' THEN 'Substituído'
      ELSE caixa.status
    END,
    CASE
      WHEN caixa.status IN ('PENDENTE', 'EM_ASSINATURA') THEN 'AWAITING_AUTHENTICATION_CHAIN'
      ELSE 'VIEW'
    END,
    CASE
      WHEN caixa.status IN ('PENDENTE', 'EM_ASSINATURA') THEN 'Aguardando autenticação e cadeia de evidências'
      ELSE 'Visualizar'
    END,
    false,
    CASE
      WHEN caixa.status IN ('PENDENTE', 'EM_ASSINATURA') THEN
        'Assinatura conclusiva indisponível até a habilitação jurídica, fator de autenticação e cadeia de evidências.'
      WHEN caixa.status = 'RASCUNHO' THEN
        'Envelope em rascunho; ainda não foi disponibilizado para assinatura.'
      ELSE
        'Consulta disponível conforme o escopo autorizado.'
    END
  FROM caixa
  WHERE (
    caixa.participante_id IS NOT NULL
    OR caixa.pode_gerir
  )
  AND (
    v_status = 'TODOS'
    OR (v_status = 'PENDENTES' AND caixa.status IN ('PENDENTE', 'EM_ASSINATURA'))
    OR (v_status = 'ASSINADOS' AND caixa.status = 'ASSINADO')
  )
  ORDER BY caixa.updated_at DESC, caixa.id DESC
  LIMIT p_limite;
END;
$function$;

INSERT INTO public.assinatura_eletronica_politicas (
  documento,
  versao,
  habilitada,
  status_juridico,
  certificado,
  politica
)
SELECT
  'MODELO_PADRAO',
  1,
  false,
  'PENDENTE_MATRIZ_JURIDICA',
  '{"metodo":"BLOQUEADO","cadeiaEvidencias":false,"statusLabel":"Aguardando parecer jurídico","description":"Nenhuma assinatura jurídica está habilitada até aprovação da matriz e integração do fator de autenticação."}'::jsonb,
  '{"documentType":"MODELO_PADRAO","name":"Modelo de comprovante de assinatura","versionLabel":"Versão 1","confirmationMessage":"A confirmação jurídica será disponibilizada após a aprovação da política de assinatura.","receiptTitle":"Comprovante de Assinatura Eletrônica","receiptMessage":"A autenticidade deve ser conferida pelo QR Code ou pela URL de validação.","receiptFields":[{"id":"envelope","label":"Envelope","description":"Identificador único do envio."},{"id":"document_revision","label":"Revisão","description":"Versão congelada do documento."},{"id":"participants","label":"Participantes","description":"Participantes e papéis autorizados."},{"id":"events","label":"Eventos","description":"Trilha de evidências do processo."}],"signatarios":[]}'::jsonb
WHERE NOT EXISTS (
  SELECT 1
  FROM public.assinatura_eletronica_politicas AS politica
  WHERE politica.documento = 'MODELO_PADRAO'
    AND politica.polo_id IS NULL
    AND politica.arquivada_em IS NULL
);

REVOKE ALL ON FUNCTION public.assinatura_eletronica_touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_validar_escopo_politica() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_validar_escopo_envelope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_validar_vinculos_envelope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_validar_artefato() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_proteger_envelope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_proteger_participante() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_validar_participante_fundacao() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_validar_evento() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_validar_desafio() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_eventos_append_only() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_artefatos_append_only() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_autoriza_configuracao(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_status_juridico_label(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_apresentar_configuracao(public.assinatura_eletronica_politicas) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.assinatura_eletronica_obter_configuracao(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_salvar_configuracao(uuid, text, jsonb, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_listar_caixa(text, uuid, integer, timestamptz) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_obter_configuracao(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_salvar_configuracao(uuid, text, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_listar_caixa(text, uuid, integer, timestamptz) TO authenticated, service_role;

COMMIT;
