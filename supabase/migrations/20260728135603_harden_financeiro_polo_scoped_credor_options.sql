-- Restringe a lista de credores às abas que efetivamente consomem o seletor.

CREATE OR REPLACE FUNCTION public.get_financeiro_credores_por_polo_secure(
  p_polo_id uuid
)
RETURNS TABLE (
  id uuid,
  nome text,
  tipo text,
  cpf_cnpj text,
  email text,
  telefone text,
  foto_url text,
  polo_id uuid,
  polo_ids uuid[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_polo_id IS NULL
     OR (
       auth.role() <> 'service_role'
       AND NOT (
         public.is_financeiro_for_polo(p_polo_id)
         AND (
           public.gestor_has_financeiro_tab('despesas')
           OR public.gestor_has_financeiro_tab('outros-debitos')
           OR public.gestor_has_financeiro_tab('outros-creditos')
         )
       )
     )
  THEN
    RAISE EXCEPTION 'Acesso aos credores fora do escopo autorizado.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    parceiro.id,
    parceiro.nome,
    parceiro.tipo,
    parceiro.cpf_cnpj,
    parceiro.email,
    parceiro.telefone,
    parceiro.foto_url,
    parceiro.polo_id,
    parceiro.polo_ids
  FROM public.parceiros AS parceiro
  WHERE parceiro.status = 'ATIVO'
    AND parceiro.tipo IN ('Aluno', 'Professor', 'PJ', 'PF')
    AND (
      (
        parceiro.polo_id IS NULL
        AND coalesce(cardinality(parceiro.polo_ids), 0) = 0
      )
      OR parceiro.polo_id = p_polo_id
      OR parceiro.polo_ids @> ARRAY[p_polo_id]::uuid[]
    )
  ORDER BY parceiro.nome, parceiro.id;
END;
$$;

REVOKE ALL
  ON FUNCTION public.get_financeiro_credores_por_polo_secure(uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE
  ON FUNCTION public.get_financeiro_credores_por_polo_secure(uuid)
  TO authenticated, service_role;
