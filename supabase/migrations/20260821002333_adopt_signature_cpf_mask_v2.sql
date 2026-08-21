-- Adota a máscara probatória v2 para novas assinaturas sem reescrever provas
-- históricas. Snapshots antigos continuam válidos exatamente como congelados.

BEGIN;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_cpf_mascarado_prova_valido_v2(
  p_cpf_mascarado text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $function$
  SELECT p_cpf_mascarado ~ (
    '^('
    || '[0-9]{2}[*][.][*]{3}[.][*]{2}[0-9]-[0-9]{2}'
    || '|[*]{3}[.][*]{3}[.][*]{3}-[0-9]{2}'
    || ')$'
  );
$function$;

REVOKE ALL ON FUNCTION public.assinatura_eletronica_cpf_mascarado_prova_valido_v2(text)
  FROM PUBLIC, anon, authenticated, service_role;

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

  -- 12345678901 -> 12*.***.**9-01. A prova revela somente os dois
  -- primeiros e os três últimos dígitos; o CPF integral nunca é congelado.
  v_cpf_mascarado := pg_catalog.left(v_cpf_digitos, 2)
    || '*.***.**'
    || pg_catalog.substr(v_cpf_digitos, 9, 1)
    || '-'
    || pg_catalog.right(v_cpf_digitos, 2);

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

REVOKE ALL ON FUNCTION public.assinatura_eletronica_congelar_cpf_participante()
  FROM PUBLIC, anon, authenticated, service_role;

DO $migration$
DECLARE
  v_constraint_definition text;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_row.oid)
  INTO v_constraint_definition
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid =
      'public.assinatura_eletronica_participantes'::regclass
    AND constraint_row.conname =
      'assinatura_eletronica_participantes_cpf_mascarado_check';

  IF v_constraint_definition IS NULL
     OR pg_catalog.strpos(
       v_constraint_definition,
       '^[*]{3}[.][*]{3}[.][*]{3}-[0-9]{2}$'
     ) = 0
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CPF_MASK_V2_CONSTRAINT_ORIGEM_INESPERADA';
  END IF;
END;
$migration$;

ALTER TABLE public.assinatura_eletronica_participantes
  DROP CONSTRAINT assinatura_eletronica_participantes_cpf_mascarado_check;

ALTER TABLE public.assinatura_eletronica_participantes
  ADD CONSTRAINT assinatura_eletronica_participantes_cpf_mascarado_check
  CHECK (
    papel NOT IN ('PROFESSOR', 'COORDENADOR')
    OR (
      identidade_snapshot ? 'cpfMasked'
      AND jsonb_typeof(identidade_snapshot -> 'cpfMasked') = 'string'
      AND coalesce(
        identidade_snapshot ->> 'cpfMasked' ~ (
          '^('
          || '[0-9]{2}[*][.][*]{3}[.][*]{2}[0-9]-[0-9]{2}'
          || '|[*]{3}[.][*]{3}[.][*]{3}-[0-9]{2}'
          || ')$'
        ),
        false
      )
    )
  ) NOT VALID;

ALTER TABLE public.assinatura_eletronica_participantes
  VALIDATE CONSTRAINT assinatura_eletronica_participantes_cpf_mascarado_check;

-- As funções abaixo são atuais e ainda continham o regex histórico embutido.
-- O patch exige exatamente um sentinela em cada definição; qualquer drift
-- aborta a migration inteira antes de alterar parcialmente o contrato.
DO $migration$
DECLARE
  v_target regprocedure;
  v_targets regprocedure[] := ARRAY[
    'public.assinatura_eletronica_provas_individuais_diario(uuid)'::regprocedure,
    'public.validar_assinatura_eletronica_por_codigo(text)'::regprocedure,
    'public.assinatura_eletronica_eventos_assinatura_diario_v5_validados(uuid)'::regprocedure
  ];
  v_definition text;
  v_patched_definition text;
  v_occurrences integer;
  v_old text := E'participante.identidade_snapshot ->> ''cpfMasked''\n      ~ ''^[*]{3}[.][*]{3}[.][*]{3}-[0-9]{2}$''';
  v_new text := E'public.assinatura_eletronica_cpf_mascarado_prova_valido_v2(\n      participante.identidade_snapshot ->> ''cpfMasked''\n    )';
BEGIN
  FOREACH v_target IN ARRAY v_targets LOOP
    SELECT pg_catalog.pg_get_functiondef(v_target::oid)
    INTO v_definition;

    v_patched_definition := pg_catalog.replace(v_definition, v_old, v_new);
    v_occurrences := (
      pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(v_definition, v_old, ''))
    ) / pg_catalog.length(v_old);

    IF v_occurrences <> 1
       OR v_patched_definition IS NOT DISTINCT FROM v_definition
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'ASSINATURA_CPF_MASK_V2_PATCH_INSEGURO',
        DETAIL = v_target::text || ': sentinelas=' || v_occurrences::text;
    END IF;

    EXECUTE v_patched_definition;
  END LOOP;
END;
$migration$;

COMMIT;
