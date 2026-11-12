const missingAcademicReference = /^Recebimento [0-9a-f-]{36}: informe a parcela ou o tipo de taxa no lançamento financeiro\.$/i;

/** Known validation failures are actionable without exposing identifiers or raw SQL. */
export function nfseQueueValidationMessage(message: unknown): string {
  if (typeof message === 'string' && missingAcademicReference.test(message)) {
    return 'Os recebimentos selecionados estão sem identificação de parcela ou tipo de taxa no Financeiro. Confira os lançamentos antes de preparar a nota.';
  }
  return 'Revise o mês, os alunos e o modelo antes de preparar as notas.';
}
