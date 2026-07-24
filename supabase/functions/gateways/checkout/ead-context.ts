import type {
  CheckoutBody,
  CheckoutRoute,
  CheckoutRuntime,
  EadCheckoutContext,
  GatewayEnvironment,
  GatewayPaymentMethod,
} from "./types.ts";
import { resolveEadCharge } from "./ead-finance.ts";
import { assertStoredProviderAdapterReady } from "../api/config.ts";
import {
  type GestorAutorizado,
  requireFinanceWriteAccess,
  requireGestorAtivo,
  requireGestorForPolo,
} from "../../_shared/authz.ts";
import {
  normalizeEnvironment,
  normalizePaymentMethod,
  normalizeProviderCode,
  UUID_RE,
} from "./utils.ts";
import { getGatewayRuntimeConfig } from "../runtime-config.ts";

const BLOCKING_ENROLLMENT_STATUSES = new Set([
  "ATIVO",
  "CONCLUIDO",
  "PENDENTE",
  "AGUARDANDO_PAGAMENTO",
  "AGUARDANDO_CONFIRMACAO",
]);

const toDateString = (value: unknown) => {
  const date = String(value || "");
  return date.length >= 10 ? date.slice(0, 10) : null;
};

const currentIsoDate = () => new Date().toISOString().slice(0, 10);

const getAvailableTurma = (turmas: any[]) => {
  const today = currentIsoDate();

  for (const turma of turmas || []) {
    const inicio = toDateString(turma?.data_inicio_inscricao);
    const fim = toDateString(turma?.data_fim_inscricao);
    if (inicio && today < inicio) continue;
    if (fim && today > fim) continue;

    const matriculas = Array.isArray(turma?.matriculas) ? turma.matriculas : [];
    const matriculados = matriculas.filter((matricula: any) =>
      BLOCKING_ENROLLMENT_STATUSES.has(
        String(matricula?.status || "").toUpperCase(),
      )
    ).length;

    const max = Number(turma?.vagas_totais || 0);
    const shouldBlock =
      turma?.bloquear_matriculas_apos_completar_vagas !== false;
    if (shouldBlock && max > 0 && matriculados >= max) {
      continue;
    }

    return turma;
  }

  return null;
};

const checkoutRouteModalidade = (value: unknown) => {
  const modalidade = String(value || "").trim().toUpperCase();
  if (["EAD", "TECNICO", "LIVRE", "ESPECIALIZACAO"].includes(modalidade)) {
    return modalidade;
  }
  return null;
};

export const resolveGatewayEnvironment = async (
  admin: any,
): Promise<GatewayEnvironment> => {
  const runtimeConfig = await getGatewayRuntimeConfig(admin);
  if (!runtimeConfig.enabled) {
    throw new Error(
      "As cobrancas online estao temporariamente desativadas nas configuracoes bancarias.",
    );
  }
  return normalizeEnvironment(runtimeConfig.activeEnvironment);
};

const looksLikeRpcNotFound = (error: any) => {
  const errorMessage = String(error?.message || "").toLowerCase();
  const details = String(error?.details || "").toLowerCase();
  const hint = String(error?.hint || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  const haystack = `${errorMessage} ${details} ${hint}`;
  return haystack.includes("does not exist") && haystack.includes(
        "payment_checkout_upsert_matricula",
      ) || code === "42883";
};

const upsertEadMatricula = async (
  admin: any,
  alunoId: string,
  turmaId: string,
) => {
  const rpcArgs = {
    p_aluno_id: alunoId,
    p_turma_id: turmaId,
    p_gerar_cobranca_futura: false,
  };

  try {
    const { data, error } = await admin.rpc(
      "payment_checkout_upsert_matricula",
      rpcArgs,
    );
    if (!error) return data;

    if (!looksLikeRpcNotFound(error)) throw error;

    const fallback = await admin.rpc(
      "asaas_checkout_upsert_matricula",
      rpcArgs,
    );
    if (fallback.error) throw fallback.error;
    return fallback.data;
  } catch (error) {
    if (!looksLikeRpcNotFound(error)) throw error;
    const fallback = await admin.rpc(
      "asaas_checkout_upsert_matricula",
      rpcArgs,
    );
    if (fallback.error) throw fallback.error;
    return fallback.data;
  }
};

const fetchGatewayRoutes = async (
  admin: any,
  modalidade: string,
  paymentMethod: GatewayPaymentMethod,
  environment?: GatewayEnvironment,
) => {
  let query = admin
    .from("payment_gateway_routes")
    .select("provider_code, credential_id, enabled, environment")
    .eq("modalidade", modalidade)
    .eq("payment_method", paymentMethod)
    .neq("enabled", false);

  const { data, error } = await query.order("environment", { ascending: true });
  if (error) {
    console.error(
      "Nao foi possivel consultar rota bancaria do checkout:",
      error,
    );
    throw new Error(
      "Nao foi possivel validar a rota bancaria antes de gerar a cobranca.",
    );
  }

  const normalizedEnvironment = environment
    ? normalizeEnvironment(environment)
    : null;

  const normalizedRoutes = (data || []).map((route: any) => ({
    ...route,
    environment: normalizeEnvironment(route?.environment),
  }));

  if (!normalizedEnvironment) return normalizedRoutes;

  return normalizedRoutes.filter((route: any) =>
    route?.environment === normalizedEnvironment
  );
};

const normalizedEnvironmentLabel = (environment: GatewayEnvironment) =>
  environment === "production" ? "producao" : "sandbox";

const paymentMethodPreferredEnvironment = (
  paymentMethod: GatewayPaymentMethod,
): GatewayEnvironment[] =>
  paymentMethod === "CREDIT_CARD"
    ? ["sandbox", "production"]
    : ["production", "sandbox"];

export const resolvePaymentGatewayRoute = async (
  admin: any,
  modalidade: string,
  paymentMethod: GatewayPaymentMethod,
  environment?: GatewayEnvironment,
): Promise<{ route: CheckoutRoute; environment: GatewayEnvironment }> => {
  const configuredEnvironment = environment || await resolveGatewayEnvironment(admin);
  const availableRoutes = await fetchGatewayRoutes(
    admin,
    modalidade,
    paymentMethod,
    configuredEnvironment,
  );
  const availableEnvironments: GatewayEnvironment[] = [
    ...new Set(
      availableRoutes
        .map((route: any) => String(route?.environment || ""))
        .filter(Boolean),
    ),
  ].map((value) => normalizeEnvironment(value));

  for (const routeEnvironment of paymentMethodPreferredEnvironment(paymentMethod)) {
    const environmentRoutes = (availableRoutes || []).filter((route: any) =>
      String(route?.environment || "sandbox") === routeEnvironment
    );

    if (environmentRoutes.length === 0) continue;
    if (environmentRoutes.length > 1) {
      throw new Error(
        `Configuracao duplicada para ${paymentMethod} de ${modalidade} em ${
          normalizedEnvironmentLabel(routeEnvironment)
        }. Corrija para manter apenas uma rota ativa por ambiente.`,
      );
    }

    const route = environmentRoutes[0];
    if (route?.enabled === false) continue;

    assertStoredProviderAdapterReady(
      route?.provider_code,
      paymentMethod,
      route?.environment || routeEnvironment,
    );

    const providerCode = normalizeProviderCode(route?.provider_code);
    if (!providerCode) {
      throw new Error(
        `Provedor bancario invalido para a rota ${paymentMethod} de ${modalidade} em ${
          normalizedEnvironmentLabel(routeEnvironment)
        }.`,
      );
    }

    return {
      environment: route.environment === "production"
        ? "production"
        : "sandbox",
      route: {
        providerCode,
        credentialId: route.credential_id || null,
        enabled: route.enabled !== false,
      },
    };
  }

  if (availableRoutes.length === 0) {
    throw new Error(
      `Rota ${paymentMethod} de ${modalidade} em ${
        normalizedEnvironmentLabel(configuredEnvironment)
      } nao esta ativa.`,
    );
  }

  throw new Error(
    `Rota ${paymentMethod} de ${modalidade} nao esta ativa nos ambientes suportados. ${
      availableEnvironments.length
        ? `Existem rotas ativas em: ${
          availableEnvironments.map(normalizedEnvironmentLabel).join(", ")
        }.`
        : ""
    }`.trim(),
  );
};

export const resolveRequestedMethod = (body: CheckoutBody) =>
  normalizePaymentMethod(
    body.eadPaymentMethod ??
      body.paymentMethod ??
      body.method ??
      body.billingType,
  );

const configuredMethodsForCourse = (course: any): GatewayPaymentMethod[] => {
  const config = course?.financeiro_config || {};
  const metodos = config?.metodosRecebimento || {};
  const cartao = config?.cartao || {};
  const methods: GatewayPaymentMethod[] = [];
  if (metodos.pix !== false) methods.push("PIX");
  if (metodos.boleto !== false) methods.push("BOLETO");
  if (metodos.cartao !== false && cartao.aceitar !== false) {
    methods.push("CREDIT_CARD");
  }
  return methods;
};

export const assertNonEadCheckoutRequestIsRoutable = async (
  admin: any,
  course: any,
  body: CheckoutBody,
  environment: GatewayEnvironment,
) => {
  const modalidade = checkoutRouteModalidade(course?.modalidade);
  if (!modalidade) return;

  const configuredMethods = configuredMethodsForCourse(course);
  if (configuredMethods.length === 0) {
    throw new Error(
      `Nenhuma forma de recebimento configurada para ${modalidade}.`,
    );
  }

  const requestedMethod = resolveRequestedMethod(body);
  if (body.paymentMethod || body.method || body.billingType) {
    if (!requestedMethod) {
      throw new Error("Forma de pagamento invalida para este curso.");
    }
  }
  if (requestedMethod && !configuredMethods.includes(requestedMethod)) {
    throw new Error(
      `Este curso ${modalidade} nao permite a forma de pagamento escolhida.`,
    );
  }
  if (!requestedMethod && configuredMethods.length > 1) {
    throw new Error(
      `Escolha Pix, boleto ou cartao antes de iniciar o checkout ${modalidade}.`,
    );
  }

  if (requestedMethod) {
    await resolvePaymentGatewayRoute(
      admin,
      modalidade,
      requestedMethod,
      environment,
    );
    return;
  }

  if (configuredMethods.length === 1) {
    await resolvePaymentGatewayRoute(
      admin,
      modalidade,
      configuredMethods[0],
      environment,
    );
  }
};

export const buildEadCheckoutContext = async (
  runtime: CheckoutRuntime,
): Promise<EadCheckoutContext | null> => {
  const body = runtime.body;
  const courseId = String(body.courseId || "");
  const requestedAlunoId = body.alunoId ? String(body.alunoId) : "";
  const turmaId = body.turmaId ? String(body.turmaId) : null;

  if (!UUID_RE.test(courseId)) throw new Error("Curso invalido.");
  if (requestedAlunoId && !UUID_RE.test(requestedAlunoId)) {
    throw new Error("Aluno invalido para pagamento.");
  }
  if (turmaId && !UUID_RE.test(turmaId)) {
    throw new Error("Turma invalida para pagamento.");
  }

  const { data: course, error: courseError } = await runtime.admin
    .from("cursos")
    .select(
      "id, nome, modalidade, valor, publicar_site, status, financeiro_config",
    )
    .eq("id", courseId)
    .maybeSingle();
  if (courseError) throw courseError;
  if (!course) throw new Error("Curso nao localizado.");

  if (String(course.modalidade || "").toUpperCase() !== "EAD") {
    await assertNonEadCheckoutRequestIsRoutable(
      runtime.admin,
      course,
      body,
      await resolveGatewayEnvironment(runtime.admin),
    );
    return null;
  }

  if (
    course.publicar_site !== true ||
    String(course.status || "").toLowerCase() !== "ativo"
  ) {
    throw new Error("Curso EAD indisponivel para matricula online.");
  }

  const charge = resolveEadCharge(course, {
    method: body.eadPaymentMethod ?? body.paymentMethod ?? body.method ??
      body.billingType,
    installments: body.eadInstallments ?? body.installments,
  });
  const gatewayEnvironment = await resolveGatewayEnvironment(runtime.admin);
  const { route } = await resolvePaymentGatewayRoute(
    runtime.admin,
    "EAD",
    charge.method,
    gatewayEnvironment,
  );

  const token = String(runtime.req.headers.get("Authorization") || "").replace(
    /^Bearer\s+/i,
    "",
  ).trim();
  if (!token) throw new Error("Entre como aluno antes de comprar o curso EAD.");

  const { data: authData, error: authError } = await runtime.admin.auth.getUser(
    token,
  );
  const authEmail = String(authData?.user?.email || "").trim().toLowerCase();
  if (authError || !authEmail) {
    throw new Error("Sessao invalida para pagamento EAD.");
  }

  const { data: authenticatedAluno, error: authenticatedAlunoError } =
    await runtime.admin
      .from("parceiros")
      .select("*")
      .eq("tipo", "Aluno")
      .ilike("email", authEmail)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  if (authenticatedAlunoError) throw authenticatedAlunoError;

  let gestor: GestorAutorizado | null = null;
  let aluno = authenticatedAluno;
  if (requestedAlunoId && requestedAlunoId !== authenticatedAluno?.id) {
    gestor = await requireGestorAtivo(runtime.req, runtime.admin);
    requireFinanceWriteAccess(gestor);
    const { data: requestedAluno, error: requestedAlunoError } = await runtime
      .admin
      .from("parceiros")
      .select("*")
      .eq("tipo", "Aluno")
      .eq("id", requestedAlunoId)
      .maybeSingle();
    if (requestedAlunoError) throw requestedAlunoError;
    aluno = requestedAluno;
  }
  if (!aluno || String(aluno.tipo || "").toUpperCase() !== "ALUNO") {
    throw new Error("Cadastro de aluno nao localizado para pagamento EAD.");
  }

  let turmasQuery = runtime.admin
    .from("turmas")
    .select(`
      id,
      nome,
      polo_id,
      vagas_totais,
      qtd_vagas_minima,
      bloquear_matriculas_apos_completar_vagas,
      data_inicio_inscricao,
      data_fim_inscricao,
      matriculas(status)
    `)
    .eq("curso_id", course.id)
    .eq("status", "EM_ANDAMENTO");
  if (turmaId) turmasQuery = turmasQuery.eq("id", turmaId);
  const { data: turmas, error: turmasError } = await turmasQuery.order(
    "data_inicio",
    { ascending: true },
  );
  if (turmasError) throw turmasError;
  const turma = getAvailableTurma(turmas || []);
  if (!turma) {
    throw new Error("Nao ha turma EAD aberta para este curso no momento.");
  }
  if (gestor) requireGestorForPolo(gestor, turma.polo_id);

  const matricula = await upsertEadMatricula(runtime.admin, aluno.id, turma.id);
  if (!matricula?.id) {
    throw new Error("Nao foi possivel registrar a matricula EAD.");
  }

  return {
    ...runtime,
    environment: gatewayEnvironment,
    course,
    aluno,
    turma,
    matricula,
    charge,
    route,
  };
};
