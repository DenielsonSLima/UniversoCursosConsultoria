-- Indexed lookup for WhatsApp student matching by normalized phone.

CREATE INDEX IF NOT EXISTS idx_parceiros_aluno_whatsapp_phone_digits
  ON public.parceiros (
    (
      CASE
        WHEN length(regexp_replace(coalesce(telefone, ''), '\D', '', 'g')) BETWEEN 10 AND 15
          THEN CASE
            WHEN regexp_replace(coalesce(telefone, ''), '\D', '', 'g') LIKE '55%'
              THEN regexp_replace(coalesce(telefone, ''), '\D', '', 'g')
            ELSE '55' || regexp_replace(coalesce(telefone, ''), '\D', '', 'g')
          END
        ELSE NULL
      END
    )
  )
  WHERE tipo = 'Aluno';

CREATE OR REPLACE FUNCTION public.whatsapp_find_aluno_by_phone(p_phone TEXT)
RETURNS TABLE (
  id UUID,
  nome TEXT,
  telefone TEXT,
  cpf_cnpj TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH normalized AS (
    SELECT CASE
      WHEN length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) BETWEEN 10 AND 15
        THEN CASE
          WHEN regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') LIKE '55%'
            THEN regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
          ELSE '55' || regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
        END
      ELSE NULL
    END AS phone
  )
  SELECT p.id, p.nome, p.telefone, p.cpf_cnpj
  FROM public.parceiros p
  CROSS JOIN normalized n
  WHERE p.tipo = 'Aluno'
    AND n.phone IS NOT NULL
    AND (
      CASE
        WHEN length(regexp_replace(coalesce(p.telefone, ''), '\D', '', 'g')) BETWEEN 10 AND 15
          THEN CASE
            WHEN regexp_replace(coalesce(p.telefone, ''), '\D', '', 'g') LIKE '55%'
              THEN regexp_replace(coalesce(p.telefone, ''), '\D', '', 'g')
            ELSE '55' || regexp_replace(coalesce(p.telefone, ''), '\D', '', 'g')
          END
        ELSE NULL
      END
    ) = n.phone
  ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC NULLS LAST
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_find_aluno_by_phone(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_find_aluno_by_phone(TEXT) TO service_role;
