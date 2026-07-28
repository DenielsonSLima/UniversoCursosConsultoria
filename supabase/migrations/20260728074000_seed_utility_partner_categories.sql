BEGIN;

INSERT INTO public.categorias (nome, tipo, descricao, status)
SELECT seed.nome, 'pj', seed.descricao, 'ativo'
FROM (
  VALUES
    ('ENERGIA', 'Empresas de geração, distribuição ou fornecimento de energia'),
    ('ÁGUA', 'Empresas de abastecimento, saneamento ou fornecimento de água')
) AS seed(nome, descricao)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.categorias existente
  WHERE existente.tipo = 'pj'
    AND lower(btrim(existente.nome)) = lower(btrim(seed.nome))
);

UPDATE public.categorias
SET status = 'ativo'
WHERE tipo = 'pj'
  AND lower(btrim(nome)) IN (lower('Energia'), lower('Água'));

UPDATE public.parceiros parceiro
SET categoria_id = (
  SELECT categoria.id
  FROM public.categorias categoria
  WHERE categoria.tipo = 'pj'
    AND lower(btrim(categoria.nome)) = lower('Energia')
  ORDER BY categoria.updated_at DESC NULLS LAST, categoria.id
  LIMIT 1
)
WHERE regexp_replace(coalesce(parceiro.cpf_cnpj, ''), '\D', '', 'g') = '13017462000163';

UPDATE public.parceiros parceiro
SET categoria_id = (
  SELECT categoria.id
  FROM public.categorias categoria
  WHERE categoria.tipo = 'pj'
    AND lower(btrim(categoria.nome)) = lower('Água')
  ORDER BY categoria.updated_at DESC NULLS LAST, categoria.id
  LIMIT 1
)
WHERE regexp_replace(coalesce(parceiro.cpf_cnpj, ''), '\D', '', 'g') = '58070452000120';

COMMIT;
