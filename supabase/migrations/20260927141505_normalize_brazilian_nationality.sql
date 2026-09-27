-- Normaliza somente variações brasileiras determinísticas já observadas.
-- Naturalidades e demais nacionalidades continuam livres para evitar inferência incorreta.

UPDATE public.parceiros
SET
  nacionalidade = 'BRASILEIRA',
  nacionalidade_codigo_iso3 = 'BRA'
WHERE pg_catalog.upper(pg_catalog.regexp_replace(
  pg_catalog.btrim(COALESCE(nacionalidade, '')),
  '\s+',
  ' ',
  'g'
)) IN ('BRASILEIRA', 'BRASILEIRO(A)', 'BRASILEIRO (A)')
AND (
  nacionalidade IS DISTINCT FROM 'BRASILEIRA'
  OR nacionalidade_codigo_iso3 IS DISTINCT FROM 'BRA'
);
