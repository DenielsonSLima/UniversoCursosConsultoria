import { assertBaneseDueDateFactor } from "../banese/internal/bank-fields.ts";
import {
  assertBaneseReceivableTitleCompatible,
  validateBaneseRecoveredBankNumbers,
} from "../gateways/api/banese-reconciliation-contract.ts";
import {
  assertOtherCreditPlanConfirmedTerms,
  buildOtherCreditPlanBaneseFinancialTerms,
} from "../gateways/api/banese-other-credit-financial-terms.ts";
import type { BaneseCarnetReceivableRow } from "../banese-carnet-document/document-policy.ts";
import { buildBaneseCarnetDocumentInputs } from "../banese-carnet-document/document-input.ts";
import { assertBaneseFinancialTermsEqual } from "../banese/internal/financial-terms-response.ts";
import type { BaneseFinancialTermsInput } from "../banese/internal/financial-terms.ts";
import {
  normalizeBanesePixPayload,
  normalizeBanesePixQrImage,
} from "../banese/internal/pix-validation.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAYABLE = new Set(["PENDENTE", "VENCIDO", "AGUARDANDO_CONFIRMACAO"]);
const CLOSED = new Set([
  "PAGO",
  "CANCELADO",
  "ESTORNADO",
  "DEVOLVIDO",
  "SUSPENSO",
]);
const BANK_PAYABLE = new Set([
  "",
  "2",
  "PENDING",
  "OPEN",
  "REGISTERED",
  "CREATED",
]);
const text = (value: unknown) => String(value ?? "").trim();
const upper = (value: unknown) => text(value).toUpperCase();
const digits = (value: unknown) => text(value).replace(/\D/g, "");

export const OTHER_CREDIT_CARNET_MAX_ITEMS = 62;
export type OtherCreditPlanDocument = {
  id: string;
  polo_id: string;
  cliente_id: string;
  preview: {
    versao: number;
    quantidadeParcelas: number;
    parcelas: Array<{
      papel: string;
      numero: number;
      valor: number;
      dataVencimento: string;
      financialTerms: BaneseFinancialTermsInput;
    }>;
  };
};
export type OtherCreditCarnetRow =
  & BaneseCarnetReceivableRow
  & Record<string, unknown>
  & {
    outros_creditos_plano_id: string;
    outros_creditos_papel: "PARCELA" | "MATRICULA" | "REMATRICULA";
    regra_financeira_outros_creditos_snapshot: {
      numero: number;
      quantidadeParcelas: number;
    } & Record<string, unknown>;
  };
export class OtherCreditDocumentError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export const parseOtherCreditPlanDocumentRequest = (body: unknown) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new OtherCreditDocumentError(
      400,
      "Plano de Outros Créditos inválido.",
    );
  }
  const record = body as Record<string, unknown>;
  if (Object.keys(record).length !== 1 || !UUID_RE.test(text(record.planId))) {
    throw new OtherCreditDocumentError(
      400,
      "Informe somente o identificador do plano.",
    );
  }
  return text(record.planId);
};

const assertPlanRow = (
  plan: OtherCreditPlanDocument,
  row: OtherCreditCarnetRow,
) => {
  if (
    !UUID_RE.test(plan.id) || !UUID_RE.test(plan.polo_id) ||
    !UUID_RE.test(plan.cliente_id) ||
    !UUID_RE.test(row.id) || row.outros_creditos_plano_id !== plan.id ||
    row.polo_id !== plan.polo_id || row.cliente_id !== plan.cliente_id ||
    upper(row.categoria) !== "OUTROS_CREDITOS" ||
    upper(row.tipo_lancamento) !== "OUTRO_CREDITO" ||
    row.matricula_id != null || row.turma_id != null ||
    row.origem_cronograma_id != null
  ) {
    throw new OtherCreditDocumentError(
      409,
      "O carnê contém um lançamento fora do plano autorizado.",
    );
  }
};

const bankScope = (row: OtherCreditCarnetRow) =>
  [
    row.gateway_environment,
    row.gateway_issuer_polo_id,
    digits(row.gateway_boleto_convenio),
    digits(row.gateway_boleto_agencia).padStart(3, "0"),
  ].join("|");

const assertRegistered = (row: OtherCreditCarnetRow) => {
  if (
    row.gateway_provider !== "banese_card" ||
    upper(row.gateway_payment_method) !== "BOLETO" ||
    !["sandbox", "production"].includes(text(row.gateway_environment)) ||
    !BANK_PAYABLE.has(upper(row.gateway_status)) ||
    ["API_AMBIGUOUS", "API_REVIEW", "CREATING"].includes(
      upper(row.gateway_submission_status),
    ) ||
    !UUID_RE.test(text(row.gateway_issuer_polo_id)) ||
    !digits(row.gateway_boleto_convenio) ||
    !/^\d{3}$/.test(digits(row.gateway_boleto_agencia).padStart(3, "0")) ||
    Number(row.gateway_boleto_agencia) === 0 ||
    [row.gateway_last_error, row.asaas_last_error].some((value) =>
      text(value).startsWith("BANESE_IDENTITY_QUARANTINED:")
    )
  ) throw new Error("Registro Banese incompleto ou em revisão.");
  const terms = buildOtherCreditPlanBaneseFinancialTerms(row);
  if (!terms) throw new Error("Snapshot canônico ausente.");
  assertOtherCreditPlanConfirmedTerms(row, terms);
  const number = assertBaneseReceivableTitleCompatible(row);
  const bank = validateBaneseRecoveredBankNumbers({
    NumeroLinhaDigitavel: row.gateway_boleto_linha_digitavel,
    NumeroCodigoBarras: row.gateway_boleto_codigo_barras,
  }, { expectedOurNumber: number });
  if (!bank) throw new Error("Dados bancários ausentes.");
  assertBaneseDueDateFactor(bank.barcode, terms.dueDate);
  if (
    Number(bank.barcode.slice(9, 19)) !== Math.round(terms.nominalAmount * 100)
  ) {
    throw new Error("Valor bancário divergente.");
  }
  const issueDate = text(row.gateway_boleto_issued_at).slice(0, 10);
  const timestamp = Date.parse(`${issueDate}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(issueDate) || Number.isNaN(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== issueDate
  ) {
    throw new Error("Data de emissão incompatível.");
  }
  if (
    Boolean(row.gateway_pix_payload) !== Boolean(row.gateway_pix_encoded_image)
  ) {
    throw new Error("Retorno Pix incompleto.");
  }
  if (row.gateway_environment === "production" && row.gateway_pix_payload) {
    normalizeBanesePixPayload(row.gateway_pix_payload, terms.nominalAmount);
    normalizeBanesePixQrImage(row.gateway_pix_encoded_image);
  }
};

export const selectOtherCreditCarnetDocumentRows = (
  plan: OtherCreditPlanDocument,
  candidates: OtherCreditCarnetRow[],
) => {
  if (
    !Array.isArray(candidates) || !candidates.length ||
    candidates.length > OTHER_CREDIT_CARNET_MAX_ITEMS
  ) {
    throw new OtherCreditDocumentError(
      409,
      "O carnê deve ter entre 1 e 62 títulos do mesmo plano.",
    );
  }
  const canonical = plan.preview?.parcelas;
  if (
    plan.preview?.versao !== 1 || !Array.isArray(canonical) ||
    canonical.length !== candidates.length
  ) {
    throw new OtherCreditDocumentError(
      409,
      "O plano não possui todas as parcelas e taxas canônicas para o carnê.",
    );
  }
  const slots = new Map(
    canonical.map((item) => [`${item.papel}:${item.numero}`, item]),
  );
  if (
    slots.size !== canonical.length ||
    !Number.isInteger(plan.preview.quantidadeParcelas) ||
    canonical.filter((item) => item.papel === "PARCELA").length !==
      plan.preview.quantidadeParcelas
  ) {
    throw new OtherCreditDocumentError(
      409,
      "A composição original do carnê precisa de conferência.",
    );
  }
  const visited = new Set<string>();
  const rows = candidates.filter((row) => {
    assertPlanRow(plan, row);
    try {
      const expected = buildOtherCreditPlanBaneseFinancialTerms(row);
      const snapshot = row.regra_financeira_outros_creditos_snapshot;
      const slot = `${row.outros_creditos_papel}:${snapshot.numero}`;
      const item = slots.get(slot);
      if (
        !expected || !item || visited.has(slot) ||
        snapshot.quantidadeParcelas !== plan.preview.quantidadeParcelas ||
        Number(row.valor) !== item.valor ||
        row.data_vencimento !== item.dataVencimento
      ) {
        throw new Error("Slot canônico divergente.");
      }
      assertBaneseFinancialTermsEqual(item.financialTerms, expected);
      visited.add(slot);
    } catch {
      throw new OtherCreditDocumentError(
        409,
        "Os lançamentos divergem do plano financeiro original.",
      );
    }
    if (!PAYABLE.has(upper(row.status)) && !CLOSED.has(upper(row.status))) {
      throw new OtherCreditDocumentError(
        409,
        "Há lançamentos com situação indefinida neste carnê.",
      );
    }
    return PAYABLE.has(upper(row.status));
  });
  if (!rows.length) {
    throw new OtherCreditDocumentError(
      409,
      "Este plano não possui boletos em aberto para o carnê.",
    );
  }
  try {
    rows.forEach(assertRegistered);
  } catch {
    throw new OtherCreditDocumentError(
      409,
      "Conclua ou confira a emissão de todas as parcelas em aberto antes de baixar o carnê.",
    );
  }
  const uniqueFields = [
    "id",
    "gateway_boleto_nosso_numero",
    "gateway_boleto_linha_digitavel",
    "gateway_boleto_codigo_barras",
  ];
  if (
    new Set(rows.map(bankScope)).size !== 1 ||
    uniqueFields.some((field) =>
      new Set(rows.map((row) => text(row[field]))).size !== rows.length
    )
  ) {
    throw new OtherCreditDocumentError(
      409,
      "Os títulos do carnê não possuem uma identidade bancária exclusiva e compatível.",
    );
  }
  const roleOrder = { MATRICULA: 0, REMATRICULA: 1, PARCELA: 2 };
  return rows.sort((left, right) =>
    roleOrder[left.outros_creditos_papel] -
      roleOrder[right.outros_creditos_papel] ||
    left.regra_financeira_outros_creditos_snapshot.numero -
      right.regra_financeira_outros_creditos_snapshot.numero ||
    text(left.data_vencimento).localeCompare(text(right.data_vencimento)) ||
    left.id.localeCompare(right.id)
  );
};

export const buildOtherCreditCarnetDocumentInputs = (
  rows: OtherCreditCarnetRow[],
  payer: Record<string, unknown>,
  issuer: Record<string, unknown>,
  metadata: unknown,
) =>
  buildBaneseCarnetDocumentInputs(rows, payer, issuer, metadata).map(
    (input, index) => {
      const row = rows[index];
      const snapshot = row.regra_financeira_outros_creditos_snapshot;
      return {
        ...input,
        documentNumber: row.outros_creditos_papel === "PARCELA"
          ? `PARC-${String(snapshot.numero).padStart(2, "0")}`
          : row.outros_creditos_papel,
        installment: row.outros_creditos_papel === "PARCELA"
          ? { current: snapshot.numero, total: snapshot.quantidadeParcelas }
          : null,
      };
    },
  );
