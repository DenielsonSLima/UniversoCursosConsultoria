const approvalReasonLabels: Readonly<Record<string, string>> = {
  COMMERCIAL_DISCOUNT: 'Desconto comercial aplicado ao total do acordo.',
  WAIVED_INTEREST: 'Juros apurados parcialmente ou totalmente perdoados.',
  WAIVED_PENALTY: 'Multa apurada parcialmente ou totalmente perdoada.',
  POLICY_PUNCTUAL_DISCOUNT_CHANGED: 'Desconto de pontualidade das novas parcelas alterado.',
  POLICY_MONTHLY_INTEREST_CHANGED: 'Juros mensais das novas parcelas alterados.',
  POLICY_PENALTY_CHANGED: 'Multa das novas parcelas alterada.',
  CUSTOM_SCHEDULE: 'Cronograma personalizado: valores ou vencimentos das parcelas foram alterados.',
};

export const approvalReasonLabel = (reason: string): string =>
  Object.prototype.hasOwnProperty.call(approvalReasonLabels, reason)
    ? approvalReasonLabels[reason]
    : 'Condição personalizada que exige análise e aprovação.';
