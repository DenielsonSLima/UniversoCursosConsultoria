BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- Scoped tab permissions take precedence; preserve the payer reader and its exact polo classification.

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
       coalesce(auth.role(), '') <> 'service_role'
       AND NOT (
         coalesce(public.is_financeiro_for_polo(p_polo_id), false)
         AND (
           coalesce(public.gestor_has_effective_financeiro_tab('despesas'), false)
           OR coalesce(public.gestor_has_effective_financeiro_tab('outros-debitos'), false)
           OR coalesce(public.gestor_has_effective_financeiro_tab('outros-creditos'), false)
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

NOTIFY pgrst, 'reload schema';
COMMIT;
