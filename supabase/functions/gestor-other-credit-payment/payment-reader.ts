import {
  authorizationErrorHttpStatus,
  requireGestorAtivo,
  requireGestorForPolo,
  requireGestorTab,
} from "../_shared/authz.ts";
import { assertBaneseDueDateFactor } from "../banese/internal/bank-fields.ts";
import {
  assertBaneseReceivableTitleCompatible,
  validateBaneseRecoveredBankNumbers,
} from "../gateways/api/banese-reconciliation-contract.ts";
import {
  normalizeBanesePixPayload,
  normalizeBanesePixQrImage,
} from "../banese/internal/pix-validation.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCAL_STATUSES = new Set([
  "PENDENTE",
  "VENCIDO",
  "AGUARDANDO_CONFIRMACAO",
  "PAGO",
  "CANCELADO",
  "ESTORNADO",
  "DEVOLVIDO",
  "SUSPENSO",
]);
const BANK_STATUSES = new Set([
  "2",
  "PENDING",
  "OPEN",
  "REGISTERED",
  "CREATED",
  "REGISTERING",
  "PROCESSING",
  "CREATING",
  "PAID",
  "RECEIVED",
  "CONFIRMED",
  "CANCELED",
  "CANCELLED",
  "CANCELED_BY_BANK",
  "DELETED",
  "REFUNDED",
  "SUSPENDED",
  "REJECTED",
  "REJECTED_TIMEOUT",
  "EXPIRED",
  "PROTESTED",
  "API_AMBIGUOUS",
  "API_REVIEW",
]);
const PAYABLE_LOCAL = new Set([
  "PENDENTE",
  "VENCIDO",
  "AGUARDANDO_CONFIRMACAO",
]);
const PAYABLE_BANK = new Set([
  "",
  "2",
  "PENDING",
  "OPEN",
  "REGISTERED",
  "CREATED",
]);
const REVIEW_STATES = new Set(["API_AMBIGUOUS", "API_REVIEW", "CREATING"]);

// Explicit projection: no raw bank response, document, address, secret or URL.
export const OTHER_CREDIT_PAYMENT_SELECT = [
  "id",
  "polo_id",
  "cliente_id",
  "matricula_id",
  "turma_id",
  "categoria",
  "tipo_lancamento",
  "origem_pagamento",
  "descricao",
  "valor",
  "valor_pago",
  "data_vencimento",
  "data_pagamento",
  "status",
  "gateway_provider",
  "gateway_environment",
  "gateway_payment_method",
  "gateway_payment_id",
  "gateway_invoice_url",
  "gateway_status",
  "gateway_submission_status",
  "gateway_last_error",
  "asaas_last_error",
  "gateway_pix_payload",
  "gateway_pix_encoded_image",
  "gateway_boleto_linha_digitavel",
  "gateway_boleto_codigo_barras",
  "gateway_boleto_nosso_numero",
  "parceiros!cliente_id(nome)",
].join(",");

export type OtherCreditRow = Record<string, unknown> & { id: string };

export class PaymentReadError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

const upper = (value: unknown) => String(value ?? "").trim().toUpperCase();
const safeText = (value: unknown, fallback: string, maxLength: number) => {
  const text = Array.from(String(value ?? "")).map((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? " " : character;
  }).join("").trim();
  return (text || fallback)
    .replace(/https?:\/\/\S+|\bwww\.\S+/gi, "[link protegido]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[documento protegido]")
    .replace(
      /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g,
      "[documento protegido]",
    )
    .slice(0, maxLength);
};
const civilDate = (value: unknown) => {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === text
    ? text
    : null;
};
const money = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 && amount <= 999_999_999.99
    ? Math.round(amount * 100) / 100
    : null;
};

export const safeOtherCreditInvoiceUrl = (
  value: unknown,
  receivableId: string,
) => {
  if (typeof value !== "string" || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" || url.username || url.password || url.hash ||
      (url.port && url.port !== "443") ||
      !["universocc.com.br", "www.universocc.com.br"].includes(url.hostname) ||
      url.pathname !== "/aluno" ||
      url.searchParams.getAll("banesePayment").length !== 1 ||
      url.searchParams.get("banesePayment") !== receivableId ||
      url.searchParams.getAll("module").length !== 1 ||
      url.searchParams.get("module") !== "financeiro" ||
      [...url.searchParams.keys()].some((key) =>
        !["module", "banesePayment"].includes(key)
      )
    ) return null;
    return url.href;
  } catch {
    return null;
  }
};

export const parseOtherCreditRequest = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PaymentReadError(400, "Requisição inválida.");
  }
  const body = value as Record<string, unknown>;
  const id = String(body.receivableId ?? "").trim();
  if (body.action !== "get" || !UUID_RE.test(id)) {
    throw new PaymentReadError(400, "Consulta de cobrança inválida.");
  }
  return id;
};

export const assertOtherCreditScope = (row: OtherCreditRow) => {
  // A linked Proesc obligation must retain its enrollment/class and historical
  // origin; this endpoint only accepts independent, local Banese credits.
  if (
    !UUID_RE.test(row.id) || !UUID_RE.test(String(row.polo_id ?? "")) ||
    upper(row.categoria) !== "OUTROS_CREDITOS" ||
    upper(row.gateway_provider) !== "BANESE_CARD" ||
    upper(row.gateway_payment_method) !== "BOLETO" ||
    row.matricula_id != null || row.turma_id != null ||
    /PROESC|SISTEMA_ANTERIOR/.test(upper(row.origem_pagamento))
  ) {
    throw new PaymentReadError(
      404,
      "Cobrança de Outros Créditos não encontrada.",
    );
  }
};

export const buildOtherCreditPaymentDto = (row: OtherCreditRow) => {
  assertOtherCreditScope(row);
  const amount = money(row.valor);
  const dueDate = civilDate(row.data_vencimento);
  if (amount === null || amount <= 0 || !dueDate) {
    throw new PaymentReadError(
      409,
      "Dados da cobrança precisam de conferência.",
    );
  }
  const status = LOCAL_STATUSES.has(upper(row.status))
    ? upper(row.status)
    : "INDEFINIDO";
  const bankStatus = BANK_STATUSES.has(upper(row.gateway_status))
    ? upper(row.gateway_status)
    : upper(row.gateway_status)
    ? "UNKNOWN"
    : "";
  const rawEnvironment = String(row.gateway_environment ?? "").trim()
    .toLowerCase();
  const environment = rawEnvironment === "production"
    ? "production"
    : "sandbox";
  const quarantined = [row.gateway_last_error, row.asaas_last_error].some((
    value,
  ) => String(value ?? "").trim().startsWith("BANESE_IDENTITY_QUARANTINED:"));
  const ambiguous = REVIEW_STATES.has(upper(row.gateway_submission_status)) ||
    REVIEW_STATES.has(bankStatus);
  const blocked = quarantined || ambiguous ||
    !["production", "sandbox"].includes(rawEnvironment);
  let needsReview = blocked;
  let ourNumber: string | null = null;
  try {
    ourNumber = assertBaneseReceivableTitleCompatible(row);
  } catch {
    needsReview ||= Boolean(
      row.gateway_payment_id || row.gateway_boleto_nosso_numero,
    );
  }
  let boleto:
    | { digitableLine: string; barcode: string; ourNumber: string }
    | null = null;
  const anyBoleto = [
    row.gateway_boleto_linha_digitavel,
    row.gateway_boleto_codigo_barras,
    row.gateway_boleto_nosso_numero,
  ].some((value) => Boolean(value));
  if (!blocked && PAYABLE_LOCAL.has(status) && PAYABLE_BANK.has(bankStatus)) {
    try {
      if (!ourNumber) throw new Error("Identidade bancária incompleta.");
      const bank = validateBaneseRecoveredBankNumbers(
        {
          NumeroLinhaDigitavel: row.gateway_boleto_linha_digitavel,
          NumeroCodigoBarras: row.gateway_boleto_codigo_barras,
        },
        { expectedOurNumber: ourNumber },
      );
      if (!bank) throw new Error("Números bancários incompletos.");
      assertBaneseDueDateFactor(bank.barcode, dueDate);
      if (Number(bank.barcode.slice(9, 19)) !== Math.round(amount * 100)) {
        throw new Error("Valor bancário divergente.");
      }
      boleto = {
        digitableLine: bank.digitableLine,
        barcode: bank.barcode,
        ourNumber,
      };
    } catch {
      needsReview ||= anyBoleto;
    }
  }
  let payload: string | null = null;
  let image: string | null = null;
  let pixState: "available" | "pending" | "sandbox-unavailable" =
    environment === "sandbox" ? "sandbox-unavailable" : "pending";
  if (boleto && environment === "production") {
    try {
      const validPayload =
        normalizeBanesePixPayload(row.gateway_pix_payload, amount).payload;
      const validImage = normalizeBanesePixQrImage(
        row.gateway_pix_encoded_image,
      );
      if (validImage.length > 250_000) {
        throw new Error("Imagem excede o limite de consulta.");
      }
      payload = validPayload;
      image = validImage;
      pixState = "available";
    } catch {
      needsReview ||= Boolean(
        row.gateway_pix_payload || row.gateway_pix_encoded_image,
      );
    }
  }
  const relation = Array.isArray(row.parceiros)
    ? row.parceiros[0]
    : row.parceiros;
  const payer = relation && typeof relation === "object"
    ? relation as Record<string, unknown>
    : {};
  const customerName = safeText(payer.nome, "Cliente", 120);
  return {
    payment: {
      id: row.id,
      descricao: safeText(row.descricao, "Outros Créditos", 160),
      categoria: "OUTROS_CREDITOS",
      valor: amount,
      valor_pago: money(row.valor_pago),
      data_vencimento: dueDate,
      data_pagamento: civilDate(row.data_pagamento),
      status,
      gateway_provider: "banese_card",
      gateway_environment: environment,
      gateway_payment_method: "BOLETO",
      gateway_status: bankStatus,
      gateway_invoice_url: boleto
        ? safeOtherCreditInvoiceUrl(row.gateway_invoice_url, row.id)
        : null,
      gateway_boleto_linha_digitavel: boleto?.digitableLine ?? null,
      gateway_boleto_codigo_barras: boleto?.barcode ?? null,
      gateway_boleto_nosso_numero: boleto?.ourNumber ?? null,
      gateway_pix_payload: payload,
      gateway_pix_encoded_image: image,
      parceiros: { nome: customerName },
    },
    customerName,
    canPay: Boolean(boleto),
    canRefresh: Boolean(ourNumber) && PAYABLE_LOCAL.has(status) &&
      ![
        "PAID",
        "RECEIVED",
        "CONFIRMED",
        "CANCELED",
        "CANCELLED",
        "CANCELED_BY_BANK",
        "DELETED",
        "REFUNDED",
      ].includes(bankStatus),
    boletoAvailable: Boolean(boleto),
    pixState,
    needsReview,
  };
};

// Only SELECTs after shared JWT/profile/schedule/tab authorization. No bank
// adapter, gateway synchronization, payment mutation or automatic recovery.
export const readOtherCreditPayment = async (
  req: Request,
  admin: any,
  receivableId: string,
) => {
  if (!UUID_RE.test(receivableId)) {
    throw new PaymentReadError(400, "Cobrança inválida.");
  }
  let gestor;
  try {
    gestor = await requireGestorAtivo(req, admin);
  } catch (error) {
    const status = authorizationErrorHttpStatus(
      error instanceof Error ? error.message : "",
    );
    throw new PaymentReadError(
      status ?? 503,
      status === 401
        ? "Autenticação obrigatória para consultar a cobrança."
        : status === 403
        ? "Acesso à cobrança não autorizado."
        : "Não foi possível validar o acesso à cobrança.",
    );
  }
  try {
    requireGestorTab(gestor, "financeiro", "outros-creditos");
  } catch {
    throw new PaymentReadError(403, "Acesso a Outros Créditos não autorizado.");
  }
  const { data: row, error } = await admin.from("contas_receber")
    .select(OTHER_CREDIT_PAYMENT_SELECT).eq("id", receivableId).maybeSingle();
  if (error) {
    throw new PaymentReadError(503, "Não foi possível consultar a cobrança.");
  }
  if (!row || row.id !== receivableId) {
    throw new PaymentReadError(404, "Cobrança não encontrada.");
  }
  try {
    requireGestorForPolo(gestor, row.polo_id);
  } catch {
    throw new PaymentReadError(
      403,
      "Acesso à cobrança deste polo não autorizado.",
    );
  }
  assertOtherCreditScope(row);
  // Mirrors the Outros Créditos list: financing credits belong to Empréstimos.
  const loan = await admin.from("emprestimos_financeiros").select("id")
    .eq("conta_receber_id", receivableId).limit(1).maybeSingle();
  if (loan.error) {
    throw new PaymentReadError(503, "Não foi possível validar a cobrança.");
  }
  if (loan.data) {
    throw new PaymentReadError(
      404,
      "Cobrança de Outros Créditos não encontrada.",
    );
  }
  const dto = buildOtherCreditPaymentDto(row);
  return {
    ...dto,
    canRefresh: dto.canRefresh && ["gestor", "financeiro"].includes(
      String(gestor.perfil ?? "").trim().toLowerCase(),
    ),
  };
};
