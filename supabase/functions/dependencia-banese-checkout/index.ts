import { createClient } from "npm:@supabase/supabase-js@2";
import {
  authorizationErrorHttpStatus,
  requireGestorForPolo,
} from "../_shared/authz.ts";
import {
  buildCorsHeaders,
  getClientIp,
  isRateLimitExceeded,
  json,
} from "../_shared/http.ts";
import {
  requireGestorAtivo,
  requireReceivablesSettlementAccess,
} from "../asaas/api/authz.ts";
import { assertGatewayCreationFence } from "../asaas/api/gateway-routing-guard.ts";
import { resolveBaneseReceivableFinancialTerms } from "../gateways/api/banese-financial-terms.ts";
import { requireGatewayEnvironment } from "../gateways/api/environment.ts";
import {
  applyCheckoutAttemptSnapshot,
  CHECKOUT_MUTABLE_RECEIVABLE_STATUSES,
  claimExistingGatewayCheckout,
} from "../gateways/checkout/gateway-creation-fence.ts";
import {
  hasAmbiguousGatewaySubmission,
  hasAmbiguousRemoteCreation,
  hasRemoteTitleReference,
  isRemoteTitleNonPayable,
} from "../gateways/checkout/remote-title-guard.ts";
import {
  createGatewayCharge,
  type GatewayChargeResult,
  gatewayReceivableUpdate,
  persistGatewayTransaction,
  repairGatewayTransactionFromReceivable,
} from "../gateways/router.ts";
import {
  documentForGateway,
  normalizeErrorMessage,
} from "../gateways/checkout/utils.ts";
import {
  assertDependencyReceivableContract,
  buildDependencyCheckoutResponse,
  DependencyCheckoutContractError,
  hasCompleteBaneseBoleto,
  normalizeDependencyCheckoutRequest,
  sanitizeDependencyBaneseResult,
} from "./contract.ts";

const PROVIDER = "banese_card" as const;
const PAYMENT_METHOD = "BOLETO" as const;
const MAX_BODY_BYTES = 2_048;

const requireDependencyChargeAccess = (
  gestor: Parameters<typeof requireReceivablesSettlementAccess>[0],
) => {
  try {
    requireReceivablesSettlementAccess(gestor);
    return;
  } catch (settlementError) {
    const secretariaTabs = gestor.tabs?.secretaria || [];
    const canManageDependency = gestor.modules.includes("secretaria") &&
      secretariaTabs.some((tab) =>
        ["solicitacoes", "dependencias-academicas"].includes(tab)
      );
    if (!canManageDependency) throw settlementError;
  }
};

const secureJson = (
  body: unknown,
  status: number,
  req: Request,
) => {
  const response = json(body, status, req);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
};

const parseRequestBody = async (req: Request) => {
  const bodyText = await req.text();
  if (!bodyText || bodyText.length > MAX_BODY_BYTES) {
    throw new DependencyCheckoutContractError(
      400,
      "Requisição inválida.",
    );
  }
  try {
    return normalizeDependencyCheckoutRequest(JSON.parse(bodyText));
  } catch (error) {
    if (error instanceof DependencyCheckoutContractError) throw error;
    throw new DependencyCheckoutContractError(
      400,
      "Requisição inválida.",
    );
  }
};

const maybeSingle = async (
  query: any,
  notFoundMessage: string,
) => {
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new DependencyCheckoutContractError(404, notFoundMessage);
  }
  return data as Record<string, unknown>;
};

const loadDependencyContext = async (
  admin: any,
  receivableId: string,
) => {
  const receivable = await maybeSingle(
    admin
      .from("contas_receber")
      .select("*")
      .eq("id", receivableId),
    "Conta a receber não encontrada.",
  );
  const link = await maybeSingle(
    admin
      .from("matricula_dependencia_cobrancas")
      .select("tentativa_id, conta_receber_id, principal, created_at")
      .eq("conta_receber_id", receivableId)
      .eq("principal", true),
    "A conta não é a cobrança principal da dependência.",
  );
  const attempt = await maybeSingle(
    admin
      .from("matricula_disciplina_tentativas")
      .select(
        "id, componente_id, turma_id, disciplina_id, status, valor_cobrado_snapshot",
      )
      .eq("id", link.tentativa_id),
    "Tentativa acadêmica da dependência não encontrada.",
  );
  const component = await maybeSingle(
    admin
      .from("matricula_componentes")
      .select("id, matricula_id, disciplina_id")
      .eq("id", attempt.componente_id),
    "Componente curricular da dependência não encontrado.",
  );
  const enrollment = await maybeSingle(
    admin
      .from("matriculas")
      .select("id, aluno_id")
      .eq("id", component.matricula_id),
    "Matrícula de origem da dependência não encontrada.",
  );
  const payer = await maybeSingle(
    admin
      .from("parceiros")
      .select(
        "id, nome, email, cpf_cnpj, telefone, endereco, numero, complemento, cep, bairro, cidade, uf, estado, status",
      )
      .eq("id", enrollment.aluno_id),
    "Aluno da dependência não encontrado.",
  );

  assertDependencyReceivableContract({
    receivable,
    link,
    attempt,
    component,
    enrollment,
    payer,
  });
  return { receivable, link, attempt, component, enrollment, payer };
};

const payerForGateway = (payer: Record<string, unknown>) => ({
  id: payer.id,
  name: payer.nome,
  email: payer.email,
  cpfCnpj: documentForGateway(payer.cpf_cnpj),
  phone: payer.telefone,
  address: payer.endereco,
  number: payer.numero,
  complement: payer.complemento,
  postalCode: payer.cep,
  district: payer.bairro,
  city: payer.cidade,
  state: payer.uf ?? payer.estado,
});

const readCurrentReceivable = async (
  admin: any,
  receivableId: string,
) =>
  await maybeSingle(
    admin.from("contas_receber").select("*").eq("id", receivableId),
    "Conta a receber não encontrada.",
  );

const returnExistingBoleto = async (
  admin: any,
  receivable: Record<string, unknown>,
) => {
  if (isRemoteTitleNonPayable(receivable)) {
    throw new DependencyCheckoutContractError(
      409,
      "O título Banese existente não aceita pagamento e precisa ser conciliado.",
    );
  }
  await repairGatewayTransactionFromReceivable(admin, {
    ...receivable,
    gateway_invoice_url: null,
    gateway_bank_slip_url: null,
    gateway_pix_payload: null,
    gateway_pix_encoded_image: null,
  });
  return buildDependencyCheckoutResponse(receivable, true);
};

const markCreationFailure = async (input: {
  admin: any;
  receivable: Record<string, unknown>;
  attemptToken: string;
  environment: "sandbox" | "production";
  error: unknown;
  remotePaymentMayExist: boolean;
}) => {
  const errorMessage = normalizeErrorMessage(input.error).slice(0, 2_000);
  await input.admin
    .from("contas_receber")
    .update({
      gateway_status: input.remotePaymentMayExist ? "CREATING" : null,
      gateway_creation_token: input.remotePaymentMayExist
        ? input.attemptToken
        : null,
      gateway_last_error: errorMessage,
      ...(input.remotePaymentMayExist
        ? {
          gateway_submission_channel: "API",
          gateway_submission_status: "API_AMBIGUOUS",
        }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.receivable.id)
    .eq("gateway_creation_token", input.attemptToken)
    .eq("gateway_provider", PROVIDER)
    .eq("gateway_environment", input.environment)
    .eq("gateway_payment_method", PAYMENT_METHOD)
    .eq("gateway_status", "CREATING")
    .in("status", [...CHECKOUT_MUTABLE_RECEIVABLE_STATUSES])
    .is("gateway_payment_id", null);
};

const releaseUnsubmittedClaim = async (input: {
  admin: any;
  receivableId: string;
  attemptToken: string;
  environment: "sandbox" | "production";
  message: string;
}) => {
  await input.admin
    .from("contas_receber")
    .update({
      gateway_status: null,
      gateway_creation_token: null,
      gateway_last_error: input.message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.receivableId)
    .eq("gateway_creation_token", input.attemptToken)
    .eq("gateway_provider", PROVIDER)
    .eq("gateway_environment", input.environment)
    .eq("gateway_payment_method", PAYMENT_METHOD)
    .eq("gateway_status", "CREATING")
    .in("status", [...CHECKOUT_MUTABLE_RECEIVABLE_STATUSES])
    .is("gateway_payment_id", null)
    .is("gateway_payment_link_id", null);
};

const assertPrincipalLinkStillCurrent = async (input: {
  admin: any;
  receivableId: string;
  attemptId: string;
  attemptToken: string;
  environment: "sandbox" | "production";
}) => {
  const { data, error } = await input.admin
    .from("matricula_dependencia_cobrancas")
    .select("tentativa_id, conta_receber_id, principal")
    .eq("conta_receber_id", input.receivableId)
    .eq("tentativa_id", input.attemptId)
    .eq("principal", true)
    .maybeSingle();
  if (!error && data) return;

  await releaseUnsubmittedClaim({
    admin: input.admin,
    receivableId: input.receivableId,
    attemptToken: input.attemptToken,
    environment: input.environment,
    message: "Vínculo principal da dependência mudou antes da emissão Banese.",
  });
  if (error) throw error;
  throw new DependencyCheckoutContractError(
    409,
    "A conta deixou de ser a cobrança principal da dependência.",
  );
};

const markPostCreateAmbiguous = async (input: {
  admin: any;
  receivableId: string;
  attemptToken: string;
  environment: "sandbox" | "production";
  error: unknown;
}) => {
  await input.admin
    .from("contas_receber")
    .update({
      gateway_submission_channel: "API",
      gateway_submission_status: "API_AMBIGUOUS",
      gateway_last_error: normalizeErrorMessage(input.error).slice(0, 2_000),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.receivableId)
    .eq("gateway_creation_token", input.attemptToken)
    .eq("gateway_provider", PROVIDER)
    .eq("gateway_environment", input.environment)
    .eq("gateway_payment_method", PAYMENT_METHOD)
    .eq("gateway_status", "CREATING")
    .in("status", [...CHECKOUT_MUTABLE_RECEIVABLE_STATUSES])
    .is("gateway_payment_id", null);
};

const createDependencyBoleto = async (input: {
  admin: any;
  supabaseUrl: string;
  receivable: Record<string, unknown>;
  payer: Record<string, unknown>;
  attemptId: string;
}) => {
  const environment = requireGatewayEnvironment(
    input.receivable.gateway_environment,
    "recebível da dependência",
  );
  const attemptToken = crypto.randomUUID();
  const lockedReceivable = await claimExistingGatewayCheckout({
    admin: input.admin,
    receivable: input.receivable,
    providerCode: PROVIDER,
    attemptToken,
    receivablePayload: {
      forma_pagamento: PAYMENT_METHOD,
      gateway_provider: PROVIDER,
      gateway_environment: environment,
      gateway_payment_method: PAYMENT_METHOD,
      gateway_installments: 1,
      gateway_invoice_url: null,
      gateway_bank_slip_url: null,
      gateway_pix_payload: null,
      gateway_pix_encoded_image: null,
      updated_at: new Date().toISOString(),
    },
  });

  if (!lockedReceivable) {
    const current = await readCurrentReceivable(
      input.admin,
      String(input.receivable.id),
    );
    if (hasCompleteBaneseBoleto(current)) {
      return {
        receivable: current,
        response: await returnExistingBoleto(input.admin, current),
      };
    }
    if (hasAmbiguousGatewaySubmission(current)) {
      throw new DependencyCheckoutContractError(
        409,
        "A emissão Banese está ambígua e precisa ser conciliada antes de nova tentativa.",
      );
    }
    if (hasAmbiguousRemoteCreation(current)) {
      throw new DependencyCheckoutContractError(
        409,
        "A cobrança já está sendo preparada. Aguarde e atualize o status.",
      );
    }
    throw new DependencyCheckoutContractError(
      409,
      "A cobrança já está sendo preparada. Aguarde e atualize o status.",
    );
  }

  await assertPrincipalLinkStillCurrent({
    admin: input.admin,
    receivableId: String(lockedReceivable.id),
    attemptId: input.attemptId,
    attemptToken,
    environment,
  });

  // Títulos novos usam exclusivamente o snapshot próprio. O resolvedor só
  // consulta o contrato histórico da turma quando recebe um título legado,
  // criado antes da coluna de isolamento.
  const financialTerms = await resolveBaneseReceivableFinancialTerms(
    input.admin,
    lockedReceivable,
  );
  let gatewayResult: GatewayChargeResult;
  let receivablePersisted = false;
  try {
    const rawGatewayResult = await createGatewayCharge({
      admin: input.admin,
      supabaseUrl: input.supabaseUrl,
      providerCode: PROVIDER,
      environment,
      paymentMethod: PAYMENT_METHOD,
      receivable: lockedReceivable,
      payer: payerForGateway(input.payer),
      amount: Number(lockedReceivable.valor),
      description: String(lockedReceivable.descricao || "Disciplina"),
      dueDate: String(lockedReceivable.data_vencimento).slice(0, 10),
      installments: 1,
      successUrl: null,
      failureUrl: null,
      pendingUrl: null,
      financialTerms,
    });
    gatewayResult = sanitizeDependencyBaneseResult(
      rawGatewayResult as unknown as Record<string, unknown>,
    ) as unknown as GatewayChargeResult;
  } catch (error) {
    const remotePaymentMayExist = Boolean(
      error && typeof error === "object" &&
        (error as Record<string, unknown>).remotePaymentCreated === true,
    );
    await markCreationFailure({
      admin: input.admin,
      receivable: lockedReceivable,
      attemptToken,
      environment,
      error,
      remotePaymentMayExist,
    });
    if (remotePaymentMayExist) {
      throw new DependencyCheckoutContractError(
        409,
        "O Banese pode ter recebido a emissão. A cobrança foi preservada para conciliação, sem gerar outro título.",
      );
    }
    throw new DependencyCheckoutContractError(
      502,
      "Não foi possível emitir o boleto Banese agora. Tente novamente.",
    );
  }

  try {
    const postCreateSnapshot = await readCurrentReceivable(
      input.admin,
      String(lockedReceivable.id),
    );
    assertGatewayCreationFence({
      receivable: postCreateSnapshot,
      providerCode: PROVIDER,
      environment,
      paymentMethod: PAYMENT_METHOD,
      attemptToken,
      expectedBankSlipOurNumber: gatewayResult.bankSlipOurNumber,
    });

    let persistQuery = input.admin
      .from("contas_receber")
      .update({
        ...gatewayReceivableUpdate({
          providerCode: PROVIDER,
          environment,
          paymentMethod: PAYMENT_METHOD,
          installments: 1,
          result: gatewayResult,
        }),
        gateway_creation_token: null,
        gateway_submission_channel: "API",
        gateway_submission_status: "API_REGISTERED",
        gateway_invoice_url: null,
        gateway_bank_slip_url: null,
        gateway_pix_payload: null,
        gateway_pix_encoded_image: null,
      })
      .eq("id", lockedReceivable.id)
      .eq("gateway_provider", PROVIDER)
      .eq("gateway_environment", environment)
      .eq("gateway_payment_method", PAYMENT_METHOD)
      .eq("gateway_status", "CREATING")
      .in("status", [...CHECKOUT_MUTABLE_RECEIVABLE_STATUSES])
      .is("gateway_payment_id", null);
    persistQuery = applyCheckoutAttemptSnapshot(
      persistQuery,
      postCreateSnapshot,
    );
    const { data: updatedReceivable, error: updateError } = await persistQuery
      .select("*")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updatedReceivable) {
      throw new Error(
        "A cobrança mudou antes de persistir o título Banese emitido.",
      );
    }
    receivablePersisted = true;

    await persistGatewayTransaction(input.admin, {
      receivable: updatedReceivable,
      providerCode: PROVIDER,
      environment,
      paymentMethod: PAYMENT_METHOD,
      amount: Number(updatedReceivable.valor),
      installments: 1,
      result: gatewayResult,
    });
    return {
      receivable: updatedReceivable,
      response: buildDependencyCheckoutResponse(updatedReceivable, false),
    };
  } catch (error) {
    if (!receivablePersisted) {
      await markPostCreateAmbiguous({
        admin: input.admin,
        receivableId: String(lockedReceivable.id),
        attemptToken,
        environment,
        error,
      });
    }
    console.error("dependency Banese post-create persistence failed", {
      receivableId: lockedReceivable.id,
      message: normalizeErrorMessage(error),
    });
    throw new DependencyCheckoutContractError(
      409,
      "O título pode ter sido emitido, mas a persistência local precisa ser conciliada antes de nova tentativa.",
    );
  }
};

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req, { methods: "POST, OPTIONS" });
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return secureJson({ error: "Método não permitido." }, 405, req);
  }
  if (
    isRateLimitExceeded(
      `dependencia-banese-checkout:${getClientIp(req)}`,
      20,
      60_000,
    )
  ) {
    return secureJson(
      { error: "Muitas tentativas. Aguarde alguns instantes." },
      429,
      req,
    );
  }

  try {
    const { receivableId } = await parseRequestBody(req);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Configuração Supabase indisponível.");
    }
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const gestor = await requireGestorAtivo(req, admin);
    requireDependencyChargeAccess(gestor);
    const context = await loadDependencyContext(admin, receivableId);
    requireGestorForPolo(
      gestor,
      String(context.receivable.polo_id || "") || null,
    );

    if (hasCompleteBaneseBoleto(context.receivable)) {
      return secureJson(
        await returnExistingBoleto(admin, context.receivable),
        200,
        req,
      );
    }
    if (hasRemoteTitleReference(context.receivable)) {
      throw new DependencyCheckoutContractError(
        409,
        "A cobrança já possui identidade Banese incompleta e precisa ser conciliada.",
      );
    }

    const checkout = await createDependencyBoleto({
      admin,
      supabaseUrl,
      receivable: context.receivable,
      payer: context.payer,
      attemptId: String(context.attempt.id),
    });
    console.info("dependency Banese checkout completed", {
      receivableId,
      attemptId: context.attempt.id,
      reused: checkout.response.reused,
      gatewayStatus: checkout.receivable.gateway_status || null,
    });
    return secureJson(checkout.response, 200, req);
  } catch (error) {
    if (error instanceof DependencyCheckoutContractError) {
      return secureJson({ error: error.message }, error.status, req);
    }
    const authStatus = authorizationErrorHttpStatus(
      error instanceof Error ? error.message : error,
    );
    if (authStatus) {
      return secureJson(
        {
          error: authStatus === 401
            ? "Autenticação obrigatória ou sessão inválida."
            : "Usuário sem acesso para emitir esta cobrança.",
        },
        authStatus,
        req,
      );
    }
    if (
      /permiss[aã]o|polo|m[oó]dulo|aba/i.test(
        error instanceof Error ? error.message : String(error),
      )
    ) {
      return secureJson(
        { error: "Usuário sem acesso para emitir esta cobrança." },
        403,
        req,
      );
    }
    console.error("dependencia-banese-checkout failed", {
      message: normalizeErrorMessage(error),
    });
    return secureJson(
      { error: "Não foi possível emitir a cobrança de dependência." },
      500,
      req,
    );
  }
});
