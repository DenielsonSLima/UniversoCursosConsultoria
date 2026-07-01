-- Anhanguera deve ficar restrita a Matriz, pois cursos de ensino superior
-- nao serao cadastrados/operados pelos demais polos.

WITH matriz AS (
  SELECT id
  FROM public.polos
  WHERE COALESCE(is_matriz, false) = true
  ORDER BY created_at ASC
  LIMIT 1
)
UPDATE public.parceiros p
SET
  polo_id = matriz.id,
  polo_ids = ARRAY[matriz.id]::uuid[],
  updated_at = now()
FROM matriz
WHERE p.tipo = 'PJ'
  AND regexp_replace(COALESCE(p.cpf_cnpj, ''), '[^0-9]', '', 'g') = '04310392000146'
  AND p.nome ILIKE '%ANHANGUERA%';
