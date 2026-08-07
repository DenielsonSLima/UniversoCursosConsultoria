import {
  assertStoredProviderAdapterReady,
  normalizeProviderCode,
  type PaymentMethod as GatewayPaymentMethod,
  type ProviderCode,
} from "../../gateways/api/config.ts";
import type { Environment } from "./shared.ts";

export type OtherCreditMode = "LOCAL_PAGO" | "LOCAL_RECEBER" | "GATEWAY";
export type OtherCreditPaymentMethod =
  | "PIX"
  | "BOLETO"
  | "CARTAO"
  | "DINHEIRO";

export type OtherCreditInput = {
  idempotencyKey: string;
  poloId: string;
  description: string;
  value: number;
  dueDate: string;
  clientId: string | null;
  categoryId: string | null;
  accountId: string | null;
  mode: OtherCreditMode;
  paymentMethod: OtherCreditPaymentMethod | null;
};

export type OtherCreditRoute = {
  providerCode: ProviderCode;
  environment: Environment;
  paymentMethod: GatewayPaymentMethod;
};

type OtherCreditAttemptDependencies = {
  findById: (id: string) => Promise<any | null>;
  insert: (payload: Record<string, unknown>) => Promise<any>;
  validateReferences: (input: OtherCreditInput) => Promise<void>;
  resolveRoute: (
    input: OtherCreditInput,
  ) => Promise<OtherCreditRoute | null>;
  syncGateway: (receivable: any) => Promise<any>;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_DESCRIPTION_LENGTH = 500;

const optionalUuid = (value: unknown, label: string) => {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  if (!UUID_RE.test(normalized)) throw new Error(`${label} invalido.`);
  return normalized;
};

const isCivilDate = (value: string) => {
  if (!DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const normalizeMode = (value: unknown): OtherCreditMode => {
  const mode = String(value || "").trim().toUpperCase();
  if (
    mode === "LOCAL_PAGO" || mode === "LOCAL_RECEBER" || mode === "GATEWAY"
  ) {
    return mode;
  }
  throw new Error("Modo de lancamento de Outros Creditos invalido.");
};

const normalizePaymentMethod = (
  value: unknown,
): OtherCreditPaymentMethod | null => {
  const method = String(value || "").trim().toUpperCase();
  if (!method) return null;
  if (method === "CARTÃO" || method === "CREDIT_CARD") return "CARTAO";
  if (
    method === "PIX" || method === "BOLETO" || method === "CARTAO" ||
    method === "DINHEIRO"
  ) {
    return method;
  }
  throw new Error("Forma de pagamento de Outros Creditos invalida.");
};

export const normalizeOtherCreditRequest = (
  body: Record<string, unknown>,
): OtherCreditInput => {
  const idempotencyKey = String(body.idempotencyKey || "").trim();
  if (!UUID_RE.test(idempotencyKey)) {
    throw new Error("Chave idempotente invalida para Outros Creditos.");
  }

  const poloId = String(body.poloId || "").trim();
  if (!UUID_RE.test(poloId)) throw new Error("Polo invalido.");

  const description = String(body.descricao || "").trim().replace(/\s+/g, " ");
  if (!description) throw new Error("Descricao obrigatoria.");
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(
      `Descricao deve ter no maximo ${MAX_DESCRIPTION_LENGTH} caracteres.`,
    );
  }

  const rawValue = Number(body.valor);
  const value = Math.round(rawValue * 100) / 100;
  if (!Number.isFinite(value) || value <= 0 || value > 999_999_999.99) {
    throw new Error("Valor invalido para Outros Creditos.");
  }

  const dueDate = String(body.dataVencimento || "").trim();
  if (!isCivilDate(dueDate)) throw new Error("Data de vencimento invalida.");

  const mode = normalizeMode(body.mode);
  const paymentMethod = normalizePaymentMethod(body.formaPagamento);
  const clientId = optionalUuid(body.clienteId, "Parceiro");
  const categoryId = optionalUuid(
    body.categoriaFinanceiraId,
    "Categoria financeira",
  );
  const accountId = optionalUuid(body.contaBancariaId, "Conta bancaria");

  if (mode === "LOCAL_PAGO") {
    if (!accountId) {
      throw new Error("Conta bancaria obrigatoria para receber agora.");
    }
    if (!paymentMethod) {
      throw new Error("Forma de pagamento obrigatoria para receber agora.");
    }
  } else if (accountId) {
    throw new Error(
      "Conta bancaria so pode ser informada no recebimento local imediato.",
    );
  }

  if (mode === "GATEWAY") {
    if (!clientId) {
      throw new Error(
        "Parceiro obrigatorio para emitir cobranca BolePix pelo Banese.",
      );
    }
    if (paymentMethod !== "BOLETO") {
      throw new Error(
        "Link bancario de Outros Creditos aceita somente BolePix do Banese.",
      );
    }
  }

  if (mode === "LOCAL_RECEBER" && paymentMethod) {
    throw new Error(
      "Conta local pendente nao deve antecipar uma forma de pagamento.",
    );
  }

  return {
    idempotencyKey,
    poloId,
    description,
    value,
    dueDate,
    clientId,
    categoryId,
    accountId,
    mode,
    paymentMethod,
  };
};

export const gatewayMethodForOtherCredit = (
  method: OtherCreditPaymentMethod | null,
): GatewayPaymentMethod => {
  if (method === "CARTAO") return "CREDIT_CARD";
  if (method === "PIX" || method === "BOLETO") return method;
  throw new Error("Forma de pagamento nao pode ser enviada ao gateway.");
};

export const paymentOriginForProvider = (providerCode: ProviderCode) => {
  if (providerCode === "asaas") return "ASAAS";
  if (providerCode === "mercado_pago") return "MERCADO_PAGO";
  if (providerCode === "banco_inter") return "BANCO_INTER";
  return "BANESE";
};

export const buildOtherCreditPayload = (
  input: OtherCreditInput,
  route: OtherCreditRoute | null,
) => {
  const isPaid = input.mode === "LOCAL_PAGO";
  const isGateway = input.mode === "GATEWAY";
  if (isGateway !== Boolean(route)) {
    throw new Error("Rota bancaria de Outros Creditos nao foi confirmada.");
  }
  if (
    route && route.paymentMethod !==
      gatewayMethodForOtherCredit(input.paymentMethod)
  ) {
    throw new Error(
      "A forma de pagamento diverge da rota bancaria de Outros Creditos.",
    );
  }
  if (route && route.providerCode !== "banese_card") {
    throw new Error(
      "Novas cobrancas de Outros Creditos por link usam somente o Banese.",
    );
  }

  return {
    id: input.idempotencyKey,
    polo_id: input.poloId,
    descricao: input.description,
    valor: input.value,
    data_vencimento: input.dueDate,
    status: isPaid ? "PAGO" : "PENDENTE",
    categoria: "OUTROS_CREDITOS",
    categoria_financeira_id: input.categoryId,
    cliente_id: input.clientId,
    forma_pagamento: input.paymentMethod,
    conta_bancaria_id: isPaid ? input.accountId : null,
    valor_pago: isPaid ? input.value : null,
    data_pagamento: isPaid ? input.dueDate : null,
    origem_pagamento: isPaid
      ? "PRESENCIAL"
      : route
      ? paymentOriginForProvider(route.providerCode)
      : "LOCAL",
    gateway_provider: route?.providerCode || null,
    gateway_environment: route?.environment || null,
    gateway_payment_method: route?.paymentMethod || null,
  };
};

const sameMoney = (left: unknown, right: unknown) =>
  Math.round(Number(left || 0) * 100) === Math.round(Number(right || 0) * 100);

const hasPersistedGatewayState = (existing: Record<string, unknown>) =>
  Object.entries(existing).some(([key, value]) =>
    (key.startsWith("gateway_") || key.startsWith("asaas_") ||
      key === "nosso_numero_asaas") &&
    value !== null && value !== undefined &&
    value !== ""
  );

const gatewayOriginMatches = (
  providerCode: ProviderCode,
  origin: unknown,
) => {
  const normalized = String(origin || "").trim().toUpperCase();
  if (providerCode === "banese_card") {
    return normalized === "BANESE" || normalized === "BANESE_CNAB240";
  }
  return normalized === paymentOriginForProvider(providerCode);
};

export const assertOtherCreditReplayMatches = (
  existing: Record<string, unknown>,
  input: OtherCreditInput,
  route: OtherCreditRoute | null,
) => {
  const expected = buildOtherCreditPayload(input, route);
  const baseMatches = existing.id === expected.id &&
    existing.polo_id === expected.polo_id &&
    String(existing.categoria || "").toUpperCase() === "OUTROS_CREDITOS" &&
    String(existing.descricao || "").trim().replace(/\s+/g, " ") ===
      expected.descricao &&
    sameMoney(existing.valor, expected.valor) &&
    String(existing.data_vencimento || "").slice(0, 10) ===
      expected.data_vencimento &&
    (existing.categoria_financeira_id || null) ===
      expected.categoria_financeira_id &&
    (existing.cliente_id || null) === expected.cliente_id;

  const status = String(existing.status || "").trim().toUpperCase();
  const existingPaymentMethod = String(existing.forma_pagamento || "")
    .trim().toUpperCase();
  const expectedPaymentMethod = String(expected.forma_pagamento || "")
    .trim().toUpperCase();
  const existingOrigin = String(existing.origem_pagamento || "").trim()
    .toUpperCase();
  const hasGatewayState = hasPersistedGatewayState(existing);

  let modeMatches = false;
  if (input.mode === "LOCAL_RECEBER") {
    modeMatches = !route && !hasGatewayState &&
      existing.conta_bancaria_id == null && !existingPaymentMethod &&
      existingOrigin === "LOCAL" &&
      ["PENDENTE", "VENCIDO"].includes(status) &&
      existing.valor_pago == null && existing.data_pagamento == null;
  } else if (input.mode === "LOCAL_PAGO") {
    modeMatches = !route && !hasGatewayState && status === "PAGO" &&
      existing.conta_bancaria_id === expected.conta_bancaria_id &&
      existingPaymentMethod === expectedPaymentMethod &&
      existingOrigin === "PRESENCIAL" &&
      sameMoney(existing.valor_pago, expected.valor_pago) &&
      String(existing.data_pagamento || "").slice(0, 10) ===
        expected.data_pagamento;
  } else if (route) {
    modeMatches = existing.gateway_provider === route.providerCode &&
      existing.gateway_environment === route.environment &&
      existing.gateway_payment_method === route.paymentMethod &&
      existingPaymentMethod === expectedPaymentMethod &&
      existing.conta_bancaria_id == null &&
      gatewayOriginMatches(route.providerCode, existing.origem_pagamento);
  }

  if (!baseMatches || !modeMatches) {
    throw new Error(
      "A chave desta tentativa ja pertence a outro credito. Feche o formulario e inicie um novo lancamento para alterar os dados.",
    );
  }
};

const isUniqueViolation = (error: unknown) =>
  Boolean(
    error && typeof error === "object" &&
      String((error as Record<string, unknown>).code || "") === "23505",
  );

export const createOtherCreditAttempt = async (
  input: OtherCreditInput,
  dependencies: OtherCreditAttemptDependencies,
) => {
  const route = await dependencies.resolveRoute(input);
  let receivable = await dependencies.findById(input.idempotencyKey);
  let reused = Boolean(receivable);

  if (receivable) {
    assertOtherCreditReplayMatches(receivable, input, route);
  } else {
    await dependencies.validateReferences(input);
    const payload = buildOtherCreditPayload(input, route);
    try {
      receivable = await dependencies.insert(payload);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      receivable = await dependencies.findById(input.idempotencyKey);
      if (!receivable) throw error;
      assertOtherCreditReplayMatches(receivable, input, route);
      reused = true;
    }
  }

  if (!receivable) {
    throw new Error("Nao foi possivel confirmar o lancamento financeiro.");
  }

  if (route) {
    // O recebivel local nunca e removido quando o gateway falha. Uma nova
    // chamada usa o mesmo UUID e entrega o mesmo registro ao sincronizador,
    // que recupera a identidade remota ou bloqueia uma nova emissao ambigua.
    receivable = await dependencies.syncGateway(receivable);
  }

  return { receivable, reused };
};

export const resolveOtherCreditRoute = async (
  admin: any,
  environment: Environment,
  input: OtherCreditInput,
): Promise<OtherCreditRoute | null> => {
  if (input.mode !== "GATEWAY") return null;
  const paymentMethod = gatewayMethodForOtherCredit(input.paymentMethod);
  const { data, error } = await admin
    .from("payment_gateway_routes")
    .select("provider_code, enabled")
    .eq("modalidade", "OUTROS_CREDITOS")
    .eq("payment_method", paymentMethod)
    .eq("environment", environment)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.enabled === false) {
    throw new Error(
      `Rota ${paymentMethod} de Outros Creditos nao esta ativa em ${environment}.`,
    );
  }

  const providerCode = normalizeProviderCode(data.provider_code);
  if (providerCode !== "banese_card") {
    throw new Error(
      "A rota de Outros Creditos deve usar o Banese para emitir BolePix.",
    );
  }
  assertStoredProviderAdapterReady(providerCode, paymentMethod, environment);
  return { providerCode, environment, paymentMethod };
};

const selectOne = async (query: any, message: string) => {
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(message);
  return data;
};

export const validateOtherCreditReferences = async (
  admin: any,
  input: OtherCreditInput,
) => {
  const polo = await selectOne(
    admin.from("polos").select("id, status").eq("id", input.poloId),
    "Polo nao encontrado.",
  );
  if (
    ["inativo", "inactive"].includes(String(polo.status || "").toLowerCase())
  ) {
    throw new Error("Polo inativo nao pode receber novos creditos.");
  }

  if (input.clientId) {
    const partner = await selectOne(
      admin.from("parceiros").select("id, status, polo_id, polo_ids")
        .eq("id", input.clientId),
      "Parceiro nao encontrado.",
    );
    if (
      !["ativo", "active"].includes(
        String(partner.status || "").trim().toLowerCase(),
      )
    ) {
      throw new Error("Parceiro inativo nao pode receber nova cobranca.");
    }
    const partnerPoloIds = Array.isArray(partner.polo_ids)
      ? partner.polo_ids.map(String).filter(Boolean)
      : [];
    const hasExplicitScope = Boolean(partner.polo_id) ||
      partnerPoloIds.length > 0;
    if (
      hasExplicitScope && partner.polo_id !== input.poloId &&
      !partnerPoloIds.includes(input.poloId)
    ) {
      throw new Error("Parceiro nao pertence ao polo deste credito.");
    }
  }

  if (input.categoryId) {
    const category = await selectOne(
      admin.from("categorias_financeiras").select("id, tipo, status")
        .eq("id", input.categoryId),
      "Categoria financeira nao encontrada.",
    );
    if (
      String(category.status || "").trim().toLowerCase() !== "ativo" ||
      String(category.tipo || "").trim().toUpperCase() !== "OUTRO_CREDITO"
    ) {
      throw new Error(
        "A categoria deve estar ativa e pertencer a Outros Creditos.",
      );
    }
  }

  if (input.mode === "LOCAL_PAGO" && input.accountId) {
    const account = await selectOne(
      admin.from("contas_bancarias").select("id, polo_id, ativo")
        .eq("id", input.accountId),
      "Conta bancaria nao encontrada.",
    );
    if (account.ativo === false || account.polo_id !== input.poloId) {
      throw new Error(
        "A conta bancaria deve estar ativa e pertencer ao polo do credito.",
      );
    }
  }
};

export const createOtherCreditServerSide = async (input: {
  admin: any;
  environment: Environment;
  request: OtherCreditInput;
  syncGateway: (receivable: any) => Promise<any>;
}) =>
  createOtherCreditAttempt(input.request, {
    findById: async (id) => {
      const { data, error } = await input.admin.from("contas_receber")
        .select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data || null;
    },
    insert: async (payload) => {
      const { data, error } = await input.admin.from("contas_receber")
        .insert(payload).select("*").single();
      if (error) throw error;
      return data;
    },
    validateReferences: (request) =>
      validateOtherCreditReferences(input.admin, request),
    resolveRoute: (request) =>
      resolveOtherCreditRoute(input.admin, input.environment, request),
    syncGateway: input.syncGateway,
  });
