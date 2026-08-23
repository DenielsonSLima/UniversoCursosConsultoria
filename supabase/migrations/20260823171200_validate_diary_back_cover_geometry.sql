-- A migration 1711 ja foi aplicada e permanece imutavel. Este incremento
-- fecha a geometria aceita pelo snapshot com as mesmas guardas do editor.

BEGIN;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_modelo_diario_completo_v1(
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
  v_raw jsonb := p_snapshot #> '{templateSource,raw}';
  v_cover jsonb;
  v_cover_ids text[];
  v_back_ids text[];
  v_qr jsonb;
  v_professor_slot jsonb;
  v_coordinator_slot jsonb;
BEGIN
  IF jsonb_typeof(v_raw) <> 'object'
     OR NOT (v_raw ?& ARRAY[
       'capaUrl', 'contracapaUrl', 'rodape', 'imprimirInstrucoes',
       'capaCampos', 'imprimirValidacaoContracapa', 'mensagemValidacao',
       'qrCodeSize', 'contracapaCampos'
     ]::text[])
     OR jsonb_typeof(v_raw -> 'capaCampos') <> 'array'
     OR jsonb_array_length(v_raw -> 'capaCampos') <> 6
     OR jsonb_typeof(v_raw -> 'contracapaCampos') <> 'array'
     OR jsonb_array_length(v_raw -> 'contracapaCampos') < 11
     OR v_raw -> 'imprimirValidacaoContracapa' <> 'true'::jsonb
     OR jsonb_typeof(v_raw -> 'imprimirInstrucoes') <> 'boolean'
     OR jsonb_typeof(v_raw -> 'rodape') <> 'string'
     OR btrim(v_raw ->> 'rodape') = ''
     OR jsonb_typeof(v_raw -> 'mensagemValidacao') <> 'string'
     OR btrim(v_raw ->> 'mensagemValidacao') = ''
     OR jsonb_typeof(v_raw -> 'qrCodeSize') <> 'number'
     OR v_raw ->> 'qrCodeSize' !~ '^[0-9]+$'
     OR (v_raw ->> 'qrCodeSize')::integer NOT BETWEEN 16 AND 70
  THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_raw -> 'capaCampos') AS item(field)
    WHERE jsonb_typeof(field) <> 'object'
       OR jsonb_typeof(field -> 'id') <> 'string'
       OR jsonb_typeof(field -> 'label') <> 'string'
       OR jsonb_typeof(field -> 'x') <> 'number'
       OR jsonb_typeof(field -> 'y') <> 'number'
       OR jsonb_typeof(field -> 'width') <> 'number'
       OR jsonb_typeof(field -> 'fontSize') <> 'number'
       OR jsonb_typeof(field -> 'visible') <> 'boolean'
       OR jsonb_typeof(field -> 'color') <> 'string'
       OR jsonb_typeof(field -> 'bold') <> 'boolean'
  ) THEN
    RETURN false;
  END IF;
  SELECT array_agg(field ->> 'id' ORDER BY field ->> 'id')
  INTO v_cover_ids
  FROM jsonb_array_elements(v_raw -> 'capaCampos') AS item(field);
  IF v_cover_ids IS DISTINCT FROM ARRAY[
    'areaTematica', 'curso', 'disciplina', 'modulo', 'professor', 'turma'
  ]::text[] THEN
    RETURN false;
  END IF;

  SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', field -> 'id', 'label', field -> 'label',
    'x', field -> 'x', 'y', field -> 'y', 'width', field -> 'width',
    'fontSize', field -> 'fontSize', 'visible', field -> 'visible',
    'color', field -> 'color', 'bold', field -> 'bold',
    'borderTop', field -> 'borderTop', 'align', field -> 'align'
  )) ORDER BY ordinality)
  INTO v_cover
  FROM jsonb_array_elements(v_raw -> 'capaCampos') WITH ORDINALITY
    AS item(field, ordinality);

  IF v_cover IS DISTINCT FROM p_snapshot #> '{template,capaCampos}'
     OR coalesce(
       to_jsonb(nullif(btrim(v_raw ->> 'capaUrl'), '')),
       'null'::jsonb
     ) IS DISTINCT FROM p_snapshot #> '{template,capaUrl}'
     OR coalesce(
       to_jsonb(nullif(btrim(v_raw ->> 'contracapaUrl'), '')),
       'null'::jsonb
     ) IS DISTINCT FROM p_snapshot #> '{template,contracapaUrl}'
     OR v_raw -> 'rodape' IS DISTINCT FROM p_snapshot #> '{template,rodape}'
     OR v_raw -> 'imprimirInstrucoes'
        IS DISTINCT FROM p_snapshot #> '{template,imprimirInstrucoes}'
     OR v_raw -> 'imprimirValidacaoContracapa'
        IS DISTINCT FROM p_snapshot #> '{template,imprimirValidacaoContracapa}'
     OR v_raw -> 'mensagemValidacao'
        IS DISTINCT FROM p_snapshot #> '{template,mensagemValidacao}'
     OR to_jsonb(least(50, greatest(16, (v_raw ->> 'qrCodeSize')::integer)))
        IS DISTINCT FROM p_snapshot #> '{template,qrCodeSize}'
     OR p_snapshot #> '{assetSources,coverUrl}'
        IS DISTINCT FROM p_snapshot #> '{template,capaUrl}'
     OR p_snapshot #> '{assetSources,backCoverUrl}'
        IS DISTINCT FROM p_snapshot #> '{template,contracapaUrl}'
  THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_raw -> 'contracapaCampos') AS item(field)
    WHERE jsonb_typeof(field) <> 'object'
       OR jsonb_typeof(field -> 'id') <> 'string'
       OR btrim(field ->> 'id') = ''
       OR jsonb_typeof(field -> 'x') <> 'number'
       OR (field ->> 'x')::numeric NOT BETWEEN 0 AND 100
       OR jsonb_typeof(field -> 'y') <> 'number'
       OR (field ->> 'y')::numeric NOT BETWEEN 0 AND 100
       OR jsonb_typeof(field -> 'width') <> 'number'
       OR (field ->> 'width')::numeric NOT BETWEEN 1 AND 100
       OR (field ->> 'x')::numeric + (field ->> 'width')::numeric > 100
       OR jsonb_typeof(field -> 'fontSize') <> 'number'
       OR (field ->> 'fontSize')::numeric NOT BETWEEN 4 AND 24
       OR jsonb_typeof(field -> 'visible') <> 'boolean'
       OR (
         coalesce(field -> 'isImage', 'false'::jsonb) <> 'true'::jsonb
         AND field ->> 'id' NOT IN (
           'contracapaQrCode',
           'contracapaAssinaturaProfessor',
           'contracapaAssinaturaCoordenador'
         )
         AND (field ->> 'y')::numeric
           + (field ->> 'fontSize')::numeric * 0.3528 * 100 / 210 > 100
       )
  ) THEN
    RETURN false;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_raw -> 'contracapaCampos') AS item(field)
    GROUP BY field ->> 'id'
    HAVING count(*) > 1
  ) THEN
    RETURN false;
  END IF;

  SELECT array_agg(field ->> 'id' ORDER BY field ->> 'id')
  INTO v_back_ids
  FROM jsonb_array_elements(v_raw -> 'contracapaCampos') AS item(field);
  IF NOT (v_back_ids @> ARRAY[
    'contracapaTitulo', 'contracapaCurso', 'contracapaTurma',
    'contracapaDisciplina', 'contracapaModulo', 'contracapaProfessor',
    'contracapaRegulamento', 'contracapaAutenticacao', 'contracapaQrCode',
    'contracapaAssinaturaProfessor', 'contracapaAssinaturaCoordenador'
  ]::text[]) OR EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'contracapaTitulo', 'contracapaCurso', 'contracapaTurma',
      'contracapaDisciplina', 'contracapaModulo', 'contracapaProfessor',
      'contracapaRegulamento', 'contracapaAutenticacao', 'contracapaQrCode',
      'contracapaAssinaturaProfessor', 'contracapaAssinaturaCoordenador'
    ]::text[]) AS required_id(id)
    WHERE (
      SELECT count(*)
      FROM jsonb_array_elements(v_raw -> 'contracapaCampos') AS item(field)
      WHERE field ->> 'id' = required_id.id
        AND field -> 'visible' = 'true'::jsonb
    ) <> 1
  ) THEN
    RETURN false;
  END IF;

  SELECT field INTO v_qr
  FROM jsonb_array_elements(v_raw -> 'contracapaCampos') AS item(field)
  WHERE field ->> 'id' = 'contracapaQrCode';
  IF (v_qr ->> 'width')::numeric * 297 / 100 NOT BETWEEN 20 AND 70
     OR (v_qr ->> 'y')::numeric
       + (v_qr ->> 'width')::numeric * 297 / 210
       + ((v_qr ->> 'fontSize')::numeric * 0.3528 + 1) * 100 / 210 > 100
  THEN
    RETURN false;
  END IF;

  SELECT field INTO v_professor_slot
  FROM jsonb_array_elements(v_raw -> 'contracapaCampos') AS item(field)
  WHERE field ->> 'id' = 'contracapaAssinaturaProfessor';
  SELECT field INTO v_coordinator_slot
  FROM jsonb_array_elements(v_raw -> 'contracapaCampos') AS item(field)
  WHERE field ->> 'id' = 'contracapaAssinaturaCoordenador';
  IF (v_professor_slot ->> 'width')::numeric NOT BETWEEN 38 AND 90
     OR (v_coordinator_slot ->> 'width')::numeric NOT BETWEEN 38 AND 90
     OR (v_professor_slot ->> 'y')::numeric + 14 > 100
     OR (v_coordinator_slot ->> 'y')::numeric + 14 > 100
  THEN
    RETURN false;
  END IF;
  IF (v_professor_slot ->> 'x')::numeric
       < (v_coordinator_slot ->> 'x')::numeric
         + (v_coordinator_slot ->> 'width')::numeric
     AND (v_professor_slot ->> 'x')::numeric
         + (v_professor_slot ->> 'width')::numeric
       > (v_coordinator_slot ->> 'x')::numeric
     AND (v_professor_slot ->> 'y')::numeric
       < (v_coordinator_slot ->> 'y')::numeric + 14
     AND (v_professor_slot ->> 'y')::numeric + 14
       > (v_coordinator_slot ->> 'y')::numeric
  THEN
    RETURN false;
  END IF;
  RETURN true;
EXCEPTION WHEN others THEN
  RETURN false;
END;
$function$;

REVOKE ALL ON FUNCTION public.assinatura_eletronica_modelo_diario_completo_v1(jsonb)
  FROM PUBLIC, anon, authenticated;

COMMIT;
