export interface EadPaymentReview {
  id: string;
  attemptId: string;
  receivableId: string;
  matriculaId: string;
  alunoId: string;
  alunoNome: string;
  cursoNome: string;
  poloId: string;
  poloNome?: string;
  reason: string;
  state: string;
  amount: number;
  amountKind?: 'CONFIRMED' | 'BANK_OBSERVED' | 'EXPECTED';
  paymentDate: string | null;
  createdAt: string;
  resolutionAction?: string | null;
  resolvedAt?: string | null;
}

export const getEadPaymentReviewPresentation = (review: EadPaymentReview) => {
  const amountKind = review.amountKind || (review.reason === 'EXPIRATION_REVIEW' ? 'EXPECTED' : 'CONFIRMED');
  return {
    reasonLabel: review.reason === 'EXPIRATION_REVIEW' ? 'Expiração em análise'
      : review.reason === 'DUPLICATE_PAYMENT' ? 'Pagamento duplicado'
        : review.reason === 'LATE_PAYMENT' ? 'Pagamento tardio' : 'Pagamento para revisão',
    amountLabel: amountKind === 'EXPECTED' ? 'Cobrança'
      : amountKind === 'BANK_OBSERVED' ? 'Informado pelo banco' : 'Recebido',
    paymentDateLabel: amountKind === 'EXPECTED' ? null
      : amountKind === 'BANK_OBSERVED' ? 'Data informada pelo banco' : 'Recebido em',
    canLinkRefund: review.reason === 'DUPLICATE_PAYMENT' && amountKind === 'CONFIRMED',
  };
};

export interface EadRefundCandidate {
  id: string;
  descricao: string;
  valor: number;
  dataPagamento: string;
  comprovanteRef: string | null;
}

export const buildEadRefundResolution = (input: {
  reviewId: string; requestId: string; expenseId: string; evidenceReference: string; note: string;
}) => {
  if (!input.expenseId || !input.evidenceReference.trim()) {
    throw new Error('Selecione uma devolução já paga e informe a referência do comprovante.');
  }
  return {
    p_review_id: input.reviewId,
    p_request_id: input.requestId,
    p_resolution: 'LINK_CONFIRMED_REFUND',
    p_refund_expense_id: input.expenseId,
    p_evidence_reference: input.evidenceReference.trim(),
    p_note: input.note.trim() || null,
  };
};
