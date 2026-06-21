CREATE OR REPLACE FUNCTION public.get_dados_institucionais_polo(p_polo_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'poloId', p.id,
    'poloNome', p.nome,
    'razaoSocial', COALESCE(e.razao_social, e.nome_fantasia, p.nome),
    'cnpj', COALESCE(NULLIF(p.cnpj, ''), e.cnpj),
    'telefone', COALESCE(NULLIF(p.telefone, ''), e.telefone)
  )
  FROM public.polos p
  LEFT JOIN public.empresas e ON e.id = p.company_id
  WHERE p.id = p_polo_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_dados_institucionais_polo(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dados_institucionais_polo(UUID)
  TO anon, authenticated;
