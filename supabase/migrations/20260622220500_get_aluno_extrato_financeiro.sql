CREATE OR REPLACE FUNCTION public.get_aluno_extrato_financeiro(p_matricula_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH matricula_base AS (
  SELECT
    m.id,
    m.status,
    m.data_matricula,
    p.nome AS aluno_nome,
    p.cpf_cnpj AS aluno_cpf,
    t.nome AS turma_nome,
    t.codigo AS turma_codigo,
    t.polo_id,
    c.nome AS curso_nome,
    po.nome AS polo_nome
  FROM public.matriculas m
  LEFT JOIN public.parceiros p ON p.id = m.aluno_id
  LEFT JOIN public.turmas t ON t.id = m.turma_id
  LEFT JOIN public.cursos c ON c.id = t.curso_id
  LEFT JOIN public.polos po ON po.id = t.polo_id
  WHERE m.id = p_matricula_id
), recebiveis AS (
  SELECT
    cr.id,
    cr.descricao,
    cr.valor,
    cr.valor_pago,
    cr.data_vencimento,
    cr.data_pagamento,
    cr.status,
    cr.forma_pagamento,
    cr.origem_pagamento,
    cr.tipo_lancamento,
    cr.parcela_numero,
    cr.asaas_status,
    cr.asaas_invoice_url,
    cr.asaas_payment_id,
    cr.created_at
  FROM public.contas_receber cr
  WHERE cr.matricula_id = p_matricula_id
  ORDER BY cr.data_vencimento ASC, cr.created_at ASC
), totais AS (
  SELECT
    COALESCE(SUM(valor), 0)::numeric AS total,
    COALESCE(SUM(CASE WHEN status = 'PAGO' THEN COALESCE(valor_pago, valor) ELSE 0 END), 0)::numeric AS recebido,
    COALESCE(SUM(CASE WHEN status IN ('PENDENTE', 'VENCIDO') THEN valor ELSE 0 END), 0)::numeric AS pendente,
    COALESCE(SUM(CASE WHEN status = 'VENCIDO' THEN valor ELSE 0 END), 0)::numeric AS vencido,
    COUNT(*) FILTER (WHERE status = 'PAGO')::integer AS pagos,
    COUNT(*) FILTER (WHERE status IN ('PENDENTE', 'VENCIDO'))::integer AS pendentes
  FROM recebiveis
)
SELECT jsonb_build_object(
  'matriculaId', mb.id,
  'dataMatricula', mb.data_matricula,
  'poloId', mb.polo_id,
  'alunoNome', COALESCE(mb.aluno_nome, 'Aluno'),
  'alunoCpf', COALESCE(mb.aluno_cpf, ''),
  'turmaNome', COALESCE(mb.turma_nome, mb.turma_codigo, ''),
  'cursoNome', COALESCE(mb.curso_nome, ''),
  'poloNome', COALESCE(mb.polo_nome, ''),
  'statusMatricula', mb.status,
  'total', t.total,
  'recebido', t.recebido,
  'pendente', t.pendente,
  'vencido', t.vencido,
  'pagos', t.pagos,
  'pendentes', t.pendentes,
  'recebiveis', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM recebiveis r), '[]'::jsonb)
)
FROM matricula_base mb
CROSS JOIN totais t;
$$;

GRANT EXECUTE ON FUNCTION public.get_aluno_extrato_financeiro(uuid) TO authenticated, anon;
