export const DEPENDENCY_BILLING_ORIGIN = "DEPENDENCIA";

export const DEPENDENCY_BILLING_INSTRUCTION =
  "SR.(A) CAIXA: NÃO RECEBER ESTE TÍTULO APÓS 60 (SESSENTA) DIAS DO VENCIMENTO.";

export const DEPENDENCY_BILLING_DAYS_TO_WRITE_OFF = 60;

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

export const isDependencyReceivable = (receivable: unknown) => {
  const row = asRecord(receivable);
  return String(row?.tipo_lancamento ?? "").trim().toUpperCase() ===
    DEPENDENCY_BILLING_ORIGIN;
};

/**
 * A cobrança de uma disciplina refeita nunca consulta a turma de destino ou a
 * matrícula para formar seus encargos. Este snapshot é escrito pelo banco no
 * mesmo INSERT do recebível e passa a ser a única fonte de termos do título.
 */
export const dependencyBillingSnapshotFrom = (value: unknown) => {
  const snapshot = asRecord(value);
  return String(snapshot?.origem ?? "").trim().toUpperCase() ===
      DEPENDENCY_BILLING_ORIGIN
    ? snapshot
    : null;
};
