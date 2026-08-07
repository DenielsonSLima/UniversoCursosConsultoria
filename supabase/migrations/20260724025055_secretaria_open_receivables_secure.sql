BEGIN;

CREATE OR REPLACE FUNCTION public.get_secretaria_open_receivables_secure(
  p_polo_id uuid DEFAULT NULL,
  p_aluno_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 1000
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT (
       (
         (p_polo_id IS NULL AND public.is_gestor_global())
         OR (p_polo_id IS NOT NULL AND public.is_gestor_for_polo(p_polo_id))
       )
       AND (
         public.gestor_has_tab('secretaria', 'recebimentos')
         OR public.gestor_has_financeiro_tab('receber')
       )
     ) THEN
    RAISE EXCEPTION 'Acesso aos recebimentos da secretaria nao autorizado.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', receivable.id,
        'polo_id', receivable.polo_id,
        'descricao', receivable.descricao,
        'valor', receivable.valor,
        'data_vencimento', receivable.data_vencimento,
        'data_pagamento', receivable.data_pagamento,
        'valor_pago', receivable.valor_pago,
        'status', receivable.status,
        'categoria', receivable.categoria,
        'cliente_id', receivable.cliente_id,
        'matricula_id', receivable.matricula_id,
        'turma_id', receivable.turma_id,
        'forma_pagamento', receivable.forma_pagamento,
        'origem_pagamento', receivable.origem_pagamento,
        'tipo_lancamento', receivable.tipo_lancamento,
        'parcela_numero', receivable.parcela_numero,
        'asaas_payment_id', receivable.asaas_payment_id,
        'asaas_invoice_url', receivable.asaas_invoice_url,
        'asaas_bank_slip_url', receivable.asaas_bank_slip_url,
        'asaas_installment_id', receivable.asaas_installment_id,
        'asaas_transaction_receipt_url', receivable.asaas_transaction_receipt_url,
        'asaas_status', receivable.asaas_status,
        'parceiros', jsonb_build_object(
          'nome', student.nome,
          'cpf_cnpj', student.cpf_cnpj,
          'email', student.email,
          'telefone', student.telefone
        ),
        'matriculas', CASE
          WHEN enrollment.id IS NULL THEN NULL
          ELSE jsonb_build_object(
            'id', enrollment.id,
            'data_matricula', enrollment.data_matricula,
            'status', enrollment.status
          )
        END,
        'turmas', CASE
          WHEN class.id IS NULL THEN NULL
          ELSE jsonb_build_object(
            'id', class.id,
            'nome', class.nome,
            'codigo', class.codigo,
            'polo_id', class.polo_id,
            'cursos', CASE
              WHEN course.id IS NULL THEN NULL
              ELSE jsonb_build_object(
                'id', course.id,
                'nome', course.nome,
                'modalidade', course.modalidade
              )
            END,
            'polos', CASE
              WHEN class_polo.id IS NULL THEN NULL
              ELSE jsonb_build_object(
                'nome', class_polo.nome,
                'cnpj', class_polo.cnpj,
                'cidade', class_polo.cidade,
                'estado', class_polo.estado
              )
            END
          )
        END,
        'polos', CASE
          WHEN receivable_polo.id IS NULL THEN NULL
          ELSE jsonb_build_object(
            'nome', receivable_polo.nome,
            'cnpj', receivable_polo.cnpj,
            'cidade', receivable_polo.cidade,
            'estado', receivable_polo.estado
          )
        END
      )
      ORDER BY receivable.data_vencimento, receivable.id
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT scoped_receivable.*
    FROM public.contas_receber AS scoped_receivable
    WHERE scoped_receivable.status IN ('PENDENTE', 'VENCIDO')
      AND (p_polo_id IS NULL OR scoped_receivable.polo_id = p_polo_id)
      AND (p_aluno_id IS NULL OR scoped_receivable.cliente_id = p_aluno_id)
    ORDER BY scoped_receivable.data_vencimento, scoped_receivable.id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 2000)
  ) AS receivable
  LEFT JOIN public.parceiros AS student ON student.id = receivable.cliente_id
  LEFT JOIN public.matriculas AS enrollment ON enrollment.id = receivable.matricula_id
  LEFT JOIN public.turmas AS class ON class.id = receivable.turma_id
  LEFT JOIN public.cursos AS course ON course.id = class.curso_id
  LEFT JOIN public.polos AS class_polo ON class_polo.id = class.polo_id
  LEFT JOIN public.polos AS receivable_polo ON receivable_polo.id = receivable.polo_id;

  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.get_secretaria_open_receivables_secure(
  uuid, uuid, integer
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_secretaria_open_receivables_secure(
  uuid, uuid, integer
) TO authenticated, service_role;

COMMIT;
