const TARGET_PAYABLE_STATUSES = new Set(["PENDENTE", "VENCIDO"]);

const targetedReceivableUnavailable = () =>
  new Error(
    "A cobranca EAD selecionada nao esta mais disponivel para pagamento.",
  );

export type GatewayReceivableExpectation = {
  alunoId: string;
  turmaId: string;
  value: number;
  dueDate: string;
  description: string;
};

const matchesGatewayReceivableExpectation = (
  receivable: any,
  expectation: GatewayReceivableExpectation,
) =>
  receivable?.cliente_id === expectation.alunoId &&
  receivable?.turma_id === expectation.turmaId &&
  Math.round(Number(receivable?.valor || 0) * 100) ===
    Math.round(Number(expectation.value || 0) * 100) &&
  String(receivable?.data_vencimento || "").slice(0, 10) ===
    String(expectation.dueDate || "").slice(0, 10) &&
  String(receivable?.descricao || "").trim() ===
    String(expectation.description || "").trim();

export const isGatewayReceivableLocallyPayable = (receivable: any) => {
  const status = String(receivable?.status || "").trim().toUpperCase();
  return receivable?.data_pagamento === null &&
    TARGET_PAYABLE_STATUSES.has(status);
};

export const loadGatewayCheckoutReceivable = async (input: {
  admin: any;
  matriculaId: string;
  receivableId?: string | null;
  expectation?: GatewayReceivableExpectation;
}) => {
  let query = input.admin
    .from("contas_receber")
    .select("*")
    .eq("matricula_id", input.matriculaId)
    .eq("tipo_lancamento", "MATRICULA");
  if (input.receivableId) {
    query = query.eq("id", input.receivableId);
    if (!input.expectation) throw targetedReceivableUnavailable();
    query = query
      .eq("cliente_id", input.expectation.alunoId)
      .eq("turma_id", input.expectation.turmaId);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const receivable = data?.[0] || null;

  if (input.receivableId) {
    if (
      !receivable || receivable.id !== input.receivableId ||
      !isGatewayReceivableLocallyPayable(receivable) ||
      !input.expectation ||
      !matchesGatewayReceivableExpectation(receivable, input.expectation)
    ) {
      throw targetedReceivableUnavailable();
    }
  }

  return receivable;
};

export const revalidateGatewayCheckoutReceivable = async (input: {
  admin: any;
  matriculaId: string;
  receivableId: string;
  expectation: GatewayReceivableExpectation;
  canReuse: (receivable: any) => boolean;
}) => {
  const receivable = await loadGatewayCheckoutReceivable(input);
  if (!input.canReuse(receivable)) throw targetedReceivableUnavailable();
  return receivable;
};
