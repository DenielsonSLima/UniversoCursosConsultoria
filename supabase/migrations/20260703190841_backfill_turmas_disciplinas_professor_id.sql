BEGIN;

UPDATE public.turmas_disciplinas td
SET professor_id = matched.professor_id
FROM (
  SELECT
    lower(trim(nome)) AS normalized_nome,
    (array_agg(id))[1] AS professor_id
  FROM public.parceiros
  WHERE tipo = 'Professor'
    AND public.is_active_status(status)
  GROUP BY lower(trim(nome))
  HAVING count(*) = 1
) matched
WHERE td.professor_id IS NULL
  AND lower(trim(coalesce(td.professor_nome, ''))) = matched.normalized_nome;

COMMIT;
