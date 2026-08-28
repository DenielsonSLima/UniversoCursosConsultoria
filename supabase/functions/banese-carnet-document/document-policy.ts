import {
  assertBaneseBankNumbers,
  assertBaneseDueDateFactor,
} from "../banese/internal/bank-fields.ts";
import { normalizeBaneseFinancialTerms } from "../banese/internal/financial-terms.ts";

export const BANESE_CARNET_MAX_ITEMS = 30;
export const BANESE_CARNET_ALLOWED_LAUNCH_TYPES = [
  "PARCELA",
  "REMATRICULA",
] as const;
export const BANESE_DOCUMENT_PAYABLE_LOCAL_STATUSES = [
  "PENDENTE",
  "VENCIDO",
  "AGUARDANDO_CONFIRMACAO",
] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PAYABLE_LOCAL_STATUSES = new Set<string>(
  BANESE_DOCUMENT_PAYABLE_LOCAL_STATUSES,
);
const ALLOWED_LAUNCH_TYPES = new Set<string>(
  BANESE_CARNET_ALLOWED_LAUNCH_TYPES,
);
const PAYABLE_BANK_STATUSES = new Set([
  "",
  "2",
  "PENDING",
  "OPEN",
  "REGISTERED",
  "CREATED",
]);

export type BaneseCarnetReceivableRow = {
  id: string;
  cliente_id: string | null;
  matricula_id: string | null;
  turma_id: string | null;
  polo_id: string | null;
  descricao: string | null;
  tipo_lancamento: string | null;
  parcela_numero: number | string | null;
  valor: number | string | null;
  data_vencimento: string | null;
  status: string | null;
  gateway_provider: string | null;
  gateway_environment: string | null;
  gateway_payment_method: string | null;
  gateway_status: string | null;
  gateway_pix_payload: string | null;
  gateway_pix_encoded_image: string | null;
  gateway_boleto_issued_at: string | null;
  gateway_boleto_linha_digitavel: string | null;
  gateway_boleto_codigo_barras: string | null;
  gateway_boleto_nosso_numero: string | null;
  gateway_boleto_convenio: string | null;
  gateway_boleto_agencia: string | null;
  gateway_issuer_polo_id: string | null;
  gateway_financial_terms: Record<string, unknown> | null;
  gateway_financial_terms_confirmed_at: string | null;
};

export type BaneseCarnetScope = {
  clientId: string;
  enrollmentId: string;
  poloId: string | null;
  environment: "sandbox" | "production";
  issuerId: string;
  agreement: string;
  agency: string;
};

export class BaneseCarnetPolicyError extends Error {}

const text = (value: unknown) => String(value ?? "").trim();
const digits = (value: unknown) => text(value).replace(/\D/g, "");
const upper = (value: unknown) => text(value).toUpperCase();

export const isAllowedBaneseLogoUrl = (
  rawUrl: unknown,
  projectHost: string,
) => {
  let url: URL;
  try {
    url = new URL(text(rawUrl));
  } catch {
    return false;
  }
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    return false;
  }
  const pathSegments = decodedPath.split("/");
  const hasSafePath = !decodedPath.includes("\\") &&
    !pathSegments.includes("..");
  const hasSafePort = url.port === "" || url.port === "443";
  const hasNoCredentials = !url.username && !url.password;
  const isProjectStorage = url.hostname === projectHost &&
    decodedPath.startsWith("/storage/v1/object/");
  const isUniversoLogo = url.hostname === "universocc.com.br" &&
    decodedPath.startsWith("/logos/");
  return url.protocol === "https:" && hasSafePort && hasNoCredentials &&
    hasSafePath && (isProjectStorage || isUniversoLogo);
};

const environmentOf = (value: unknown) => {
  const normalized = text(value).toLowerCase();
  if (normalized !== "sandbox" && normalized !== "production") {
    throw new BaneseCarnetPolicyError(
      "O ambiente bancário do carnê Banese é inválido.",
    );
  }
  return normalized;
};

const isPayable = (row: BaneseCarnetReceivableRow) =>
  PAYABLE_LOCAL_STATUSES.has(upper(row.status)) &&
  PAYABLE_BANK_STATUSES.has(upper(row.gateway_status));

const isoDate = (value: unknown, field: string) => {
  const date = text(value).slice(0, 10);
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== date
  ) {
    throw new BaneseCarnetPolicyError(`${field} do carnê Banese é inválida.`);
  }
  return date;
};

const confirmedAt = (value: unknown) => {
  const timestamp = text(value);
  if (!timestamp || Number.isNaN(Date.parse(timestamp))) {
    throw new BaneseCarnetPolicyError(
      "As condições financeiras de todas as parcelas precisam estar confirmadas pelo Banese.",
    );
  }
};

export const readBaneseCarnetScope = (
  selected: BaneseCarnetReceivableRow,
): BaneseCarnetScope => {
  if (!ALLOWED_LAUNCH_TYPES.has(upper(selected.tipo_lancamento))) {
    throw new BaneseCarnetPolicyError(
      "Somente rematrícula e parcelas mensais podem compor um carnê Banese.",
    );
  }
  if (
    text(selected.gateway_provider).toLowerCase() !== "banese_card" ||
    upper(selected.gateway_payment_method) !== "BOLETO"
  ) {
    throw new BaneseCarnetPolicyError(
      "A cobrança selecionada não é um boleto Banese.",
    );
  }
  if (!isPayable(selected)) {
    throw new BaneseCarnetPolicyError(
      "Uma cobrança encerrada ou indisponível não pode originar um carnê Banese.",
    );
  }

  const clientId = text(selected.cliente_id);
  const enrollmentId = text(selected.matricula_id);
  const issuerId = text(selected.gateway_issuer_polo_id);
  const agreement = digits(selected.gateway_boleto_convenio);
  const agency = digits(selected.gateway_boleto_agencia).padStart(3, "0");
  if (
    !UUID_RE.test(selected.id) || !UUID_RE.test(clientId) ||
    !UUID_RE.test(enrollmentId) || !UUID_RE.test(issuerId) || !agreement ||
    agency.length !== 3 || agency === "000"
  ) {
    throw new BaneseCarnetPolicyError(
      "A cobrança não possui o vínculo bancário necessário para o carnê.",
    );
  }

  return {
    clientId,
    enrollmentId,
    poloId: text(selected.polo_id) || null,
    environment: environmentOf(selected.gateway_environment),
    issuerId,
    agreement,
    agency,
  };
};

const matchesScope = (
  row: BaneseCarnetReceivableRow,
  scope: BaneseCarnetScope,
) =>
  row.cliente_id === scope.clientId &&
  row.matricula_id === scope.enrollmentId &&
  (text(row.polo_id) || null) === scope.poloId &&
  text(row.gateway_provider).toLowerCase() === "banese_card" &&
  upper(row.gateway_payment_method) === "BOLETO" &&
  ALLOWED_LAUNCH_TYPES.has(upper(row.tipo_lancamento)) &&
  text(row.gateway_environment).toLowerCase() === scope.environment &&
  text(row.gateway_issuer_polo_id) === scope.issuerId &&
  digits(row.gateway_boleto_convenio) === scope.agreement &&
  digits(row.gateway_boleto_agencia).padStart(3, "0") === scope.agency;

const assertRegisteredAndConfirmed = (row: BaneseCarnetReceivableRow) => {
  const amount = Number(row.valor);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new BaneseCarnetPolicyError(
      "Uma parcela do carnê possui valor nominal inválido.",
    );
  }
  const dueDate = isoDate(row.data_vencimento, "A data de vencimento");
  const issuedAt = isoDate(row.gateway_boleto_issued_at, "A data de emissão");
  if (issuedAt > dueDate) {
    throw new BaneseCarnetPolicyError(
      "Uma parcela possui emissão posterior ao vencimento.",
    );
  }
  const bank = assertBaneseBankNumbers(
    row.gateway_boleto_linha_digitavel,
    row.gateway_boleto_codigo_barras,
  );
  assertBaneseDueDateFactor(bank.barcode, dueDate);
  const encodedAmount = Number(bank.barcode.slice(9, 19)) / 100;
  if (Math.abs(encodedAmount - amount) > 0.001) {
    throw new BaneseCarnetPolicyError(
      "O valor de uma parcela diverge do boleto registrado no Banese.",
    );
  }
  if (digits(row.gateway_boleto_nosso_numero).length !== 9) {
    throw new BaneseCarnetPolicyError(
      "Uma parcela não possui Nosso Número Banese válido.",
    );
  }
  confirmedAt(row.gateway_financial_terms_confirmed_at);
  if (
    !row.gateway_financial_terms ||
    typeof row.gateway_financial_terms !== "object" ||
    Array.isArray(row.gateway_financial_terms)
  ) {
    throw new BaneseCarnetPolicyError(
      "Uma parcela não possui snapshot financeiro confirmado.",
    );
  }
  normalizeBaneseFinancialTerms({
    ...row.gateway_financial_terms,
    nominalAmount: amount,
    dueDate,
  });
};

export const isRegisteredBaneseDocumentRow = (
  row: BaneseCarnetReceivableRow,
) => {
  try {
    readBaneseCarnetScope(row);
    assertRegisteredAndConfirmed(row);
    return true;
  } catch {
    return false;
  }
};

export const takeRegisteredBaneseCarnetCandidateRows = (
  candidates: BaneseCarnetReceivableRow[],
) =>
  candidates
    .filter(isRegisteredBaneseDocumentRow)
    .slice(0, BANESE_CARNET_MAX_ITEMS + 1);

const installmentOrder = (row: BaneseCarnetReceivableRow) => {
  if (upper(row.tipo_lancamento) === "REMATRICULA") return 0;
  const value = Number(row.parcela_numero);
  return Number.isInteger(value) && value > 0 ? value : Number.MAX_SAFE_INTEGER;
};

const selectScopeRows = (
  selected: BaneseCarnetReceivableRow,
  candidates: BaneseCarnetReceivableRow[],
) => {
  const scope = readBaneseCarnetScope(selected);
  return candidates.filter((row) => isPayable(row) && matchesScope(row, scope))
    .sort((left, right) =>
      installmentOrder(left) - installmentOrder(right) ||
      text(left.data_vencimento).localeCompare(text(right.data_vencimento)) ||
      left.id.localeCompare(right.id)
    );
};

const assertSelectedAndUniqueBankTitles = (
  selected: BaneseCarnetReceivableRow,
  rows: BaneseCarnetReceivableRow[],
) => {
  if (!rows.some((row) => row.id === selected.id)) {
    throw new BaneseCarnetPolicyError(
      "A parcela selecionada não pertence ao grupo seguro do carnê.",
    );
  }
  const uniqueGroups = [
    rows.map((row) => row.id),
    rows.map((row) => digits(row.gateway_boleto_nosso_numero)),
    rows.map((row) => digits(row.gateway_boleto_linha_digitavel)),
    rows.map((row) => digits(row.gateway_boleto_codigo_barras)),
  ];
  if (uniqueGroups.some((values) => new Set(values).size !== rows.length)) {
    throw new BaneseCarnetPolicyError(
      "As parcelas do carnê precisam possuir títulos bancários exclusivos.",
    );
  }
};

/**
 * Seleciona um grupo documental Banese válido com uma ou mais parcelas.
 * O limite de 3..30 continua exclusivo do compositor de carnê.
 */
export const selectBaneseDocumentGroupRows = (
  selected: BaneseCarnetReceivableRow,
  candidates: BaneseCarnetReceivableRow[],
) => {
  const rows = selectScopeRows(selected, candidates);
  if (!rows.length) {
    throw new BaneseCarnetPolicyError(
      "Nenhuma parcela registrada pertence ao grupo documental Banese.",
    );
  }
  rows.forEach(assertRegisteredAndConfirmed);
  assertSelectedAndUniqueBankTitles(selected, rows);
  return rows;
};

export const selectBaneseCarnetDocumentRows = (
  selected: BaneseCarnetReceivableRow,
  candidates: BaneseCarnetReceivableRow[],
) => {
  const rows = selectScopeRows(selected, candidates);

  if (!rows.some((row) => row.id === selected.id)) {
    throw new BaneseCarnetPolicyError(
      "A parcela selecionada não pertence ao grupo seguro do carnê.",
    );
  }
  if (rows.length < 3) {
    throw new BaneseCarnetPolicyError(
      "O carnê Banese exige ao menos 3 parcelas registradas.",
    );
  }
  if (rows.length > BANESE_CARNET_MAX_ITEMS) {
    throw new BaneseCarnetPolicyError(
      `O carnê Banese aceita no máximo ${BANESE_CARNET_MAX_ITEMS} parcelas.`,
    );
  }

  rows.forEach(assertRegisteredAndConfirmed);
  assertSelectedAndUniqueBankTitles(selected, rows);
  return rows;
};
