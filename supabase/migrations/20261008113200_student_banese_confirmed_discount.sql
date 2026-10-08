BEGIN;

-- Pure projection of the confirmed bank snapshot. No table reads and no
-- fallback to today's class/enrollment rules for an already issued title.
CREATE OR REPLACE FUNCTION portal_private.banese_confirmed_student_discount(
  p_nominal numeric,
  p_due_date date,
  p_provider text,
  p_method text,
  p_nosso_numero text,
  p_terms jsonb,
  p_confirmed_at timestamptz,
  p_last_error text,
  p_today date
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_discount numeric;
  v_valid_until date;
  v_discount_type text;
BEGIN
  IF p_nominal IS NULL OR p_nominal <= 0
    OR p_due_date IS NULL OR p_today IS NULL
    OR p_confirmed_at IS NULL
    OR lower(btrim(coalesce(p_provider, ''))) NOT IN ('banese', 'banese_card')
    OR upper(btrim(coalesce(p_method, ''))) <> 'BOLETO'
    OR btrim(coalesce(p_nosso_numero, '')) !~ '^[0-9]{9}$'
    OR btrim(coalesce(p_last_error, '')) LIKE 'BANESE_IDENTITY_QUARANTINED:%'
    OR jsonb_typeof(p_terms) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_terms->'nominalAmount') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_terms->'discount') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_terms #> '{discount,value}') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_terms #> '{discount,validUntil}') IS DISTINCT FROM 'string'
  THEN
    RETURN 0;
  END IF;

  IF round((p_terms->>'nominalAmount')::numeric, 2) <> round(p_nominal, 2)
    OR (p_terms->>'dueDate') IS DISTINCT FROM to_char(p_due_date, 'YYYY-MM-DD')
    OR (p_terms #>> '{discount,validUntil}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  THEN
    RETURN 0;
  END IF;

  -- A malformed confirmed snapshot must not make the whole financial list fail.
  BEGIN
    v_valid_until := (p_terms #>> '{discount,validUntil}')::date;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RETURN 0;
  END;
  IF v_valid_until > p_due_date OR p_today > v_valid_until OR p_today > p_due_date THEN
    RETURN 0;
  END IF;

  v_discount_type := lower(p_terms #>> '{discount,type}');
  v_discount := (p_terms #>> '{discount,value}')::numeric;
  IF v_discount_type = 'percentage' THEN
    IF v_discount >= 100 THEN RETURN 0; END IF;
    v_discount := p_nominal * v_discount / 100;
  ELSIF v_discount_type IS DISTINCT FROM 'fixed' THEN
    RETURN 0;
  END IF;

  v_discount := round(v_discount, 2);
  IF v_discount < 0.01 OR v_discount > round(p_nominal - 0.01, 2) THEN
    RETURN 0;
  END IF;
  RETURN v_discount;
END;
$function$;

REVOKE ALL ON FUNCTION portal_private.banese_confirmed_student_discount(
  numeric, date, text, text, text, jsonb, timestamptz, text, date
) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION portal_private.banese_confirmed_student_discount(
  numeric, date, text, text, text, jsonb, timestamptz, text, date
) IS 'Projects only a valid confirmed Banese discount; the caller supplies the America/Maceio civil date.';

COMMIT;
