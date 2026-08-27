BEGIN;

CREATE OR REPLACE FUNCTION public.search_financeiro_aluno_receivables_secure(
  p_search text,
  p_polo_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_jwt_role text := COALESCE((SELECT auth.jwt() ->> 'role'), '');
  v_search text := public.financeiro_normalize_search_text(
    btrim(COALESCE(p_search, ''))
  );
  v_rows jsonb;
BEGIN
  IF length(v_search) < 2 THEN
    RETURN '[]'::jsonb;
  END IF;

  IF v_jwt_role <> 'service_role'
     AND (
       v_actor_id IS NULL
       OR NOT (
         (
           (p_polo_id IS NULL AND public.is_gestor_global())
           OR (p_polo_id IS NOT NULL AND public.is_gestor_for_polo(p_polo_id))
         )
         AND (
           public.gestor_has_effective_financeiro_tab('resumo')
           OR public.gestor_has_effective_financeiro_tab('receber')
         )
       )
     )
  THEN
    RAISE EXCEPTION 'Acesso financeiro fora do escopo autorizado.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(to_jsonb(result_row) ORDER BY result_row.data_vencimento, result_row.id),
    '[]'::jsonb
  )
    INTO v_rows
  FROM (
    SELECT
      receivable.id,
      receivable.descricao,
      receivable.valor,
      receivable.data_vencimento,
      receivable.data_pagamento,
      receivable.status,
      receivable.categoria,
      receivable.forma_pagamento,
      receivable.cliente_id,
      receivable.polo_id,
      receivable.matricula_id,
      receivable.turma_id,
      receivable.tipo_lancamento,
      receivable.gateway_provider,
      (
        receivable.gateway_provider IS NOT NULL
        OR receivable.gateway_payment_id IS NOT NULL
        OR receivable.gateway_payment_link_id IS NOT NULL
        OR receivable.asaas_payment_id IS NOT NULL
        OR receivable.asaas_payment_link_id IS NOT NULL
      ) AS has_remote_charge,
      student.nome AS cliente_nome,
      student.cpf_cnpj AS cliente_cpf,
      polo.nome AS polo_nome
    FROM public.contas_receber AS receivable
    JOIN public.parceiros AS student ON student.id = receivable.cliente_id
    LEFT JOIN public.polos AS polo ON polo.id = receivable.polo_id
    WHERE receivable.categoria = 'MENSALIDADE'
      AND receivable.status IN ('PENDENTE', 'VENCIDO')
      AND student.tipo = 'Aluno'
      AND (p_polo_id IS NULL OR receivable.polo_id = p_polo_id)
      AND (
        public.financeiro_normalize_search_text(student.nome) LIKE '%' || v_search || '%'
        OR public.financeiro_normalize_search_text(student.cpf_cnpj) LIKE '%' || v_search || '%'
        OR public.financeiro_normalize_search_text(receivable.descricao) LIKE '%' || v_search || '%'
      )
    ORDER BY receivable.data_vencimento, receivable.id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 50)
  ) AS result_row;

  RETURN v_rows;
END;
$function$;

REVOKE ALL ON FUNCTION public.search_financeiro_aluno_receivables_secure(text, uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_financeiro_aluno_receivables_secure(text, uuid, integer)
  TO authenticated, service_role;

COMMIT;
