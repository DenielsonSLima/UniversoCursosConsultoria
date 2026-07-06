import type {
  CheckoutBody,
  CheckoutRoute,
  CheckoutRuntime,
  EadCheckoutContext,
  GatewayEnvironment,
  GatewayPaymentMethod,
  GatewayProviderCode,
} from "./types.ts";
import { resolveEadCharge } from "./ead-finance.ts";
import {
  normalizeEnvironment,
  normalizePaymentMethod,
  normalizeProviderCode,
  UUID_RE,
} from "./utils.ts";

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

    const min = Number(turma?.qtd_vagas_minima || 0);
    const max = Number(turma?.vagas_totais || 0);
    const shouldBlock =
      turma?.bloquear_matriculas_apos_completar_vagas !== false;
    if (shouldBlock && min > 0 && matriculados >= min) {
      continue;
    }
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
  const { data, error } = await admin
    .from("asaas_config")
    .select("environment")
    .maybeSingle();
  if (error) throw error;
  return normalizeEnvironment(data?.environment);
};

export const resolvePaymentGatewayRoute = async (
  admin: any,
  modalidade: string,
  paymentMethod: GatewayPaymentMethod,
  environment: GatewayEnvironment,
): Promise<CheckoutRoute> => {
  const { data, error } = await admin
    .from("payment_gateway_routes")
    .select("provider_code, credential_id, enabled")
    .eq("modalidade", modalidade)
    .eq("payment_method", paymentMethod)
    .eq("environment", environment)
    .maybeSingle();

  if (error) {
    console.error(
      "Nao foi possivel consultar rota bancaria do checkout:",
      error,
    );
    throw new Error(
      "Nao foi possivel validar a rota bancaria antes de gerar a cobranca.",
    );
  }

  if (!data || data.enabled === false) {
    throw new Error(
      `Rota ${paymentMethod} de ${modalidade} em ${environment} nao esta ativa.`,
    );
  }

  const providerCode = normalizeProviderCode(data.provider_code);
  if (!providerCode) {
    throw new Error(
      `Provedor bancario invalido para a rota ${paymentMethod} de ${modalidade} em ${environment}.`,
    );
  }

  return {
    providerCode,
    credentialId: data.credential_id || null,
    enabled: data.enabled !== false,
  };
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

const getRoutesForMethods = async (
  admin: any,
  modalidade: string,
  methods: GatewayPaymentMethod[],
  environment: GatewayEnvironment,
) => {
  if (methods.length === 0) return [];
  const { data, error } = await admin
    .from("payment_gateway_routes")
    .select("payment_method, provider_code, enabled")
    .eq("modalidade", modalidade)
    .eq("environment", environment)
    .in("payment_method", methods);
  if (error) throw error;
  return data || [];
};

export const assertNonEadRouteDoesNotUseWrongProvider = async (
  admin: any,
  course: any,
  body: CheckoutBody,
  environment: GatewayEnvironment,
) => {
  const modalidade = checkoutRouteModalidade(course?.modalidade);
  if (!modalidade) return;

  const requestedMethod = resolveRequestedMethod(body);
  if (requestedMethod) {
    const route = await resolvePaymentGatewayRoute(
      admin,
      modalidade,
      requestedMethod,
      environment,
    );
    if (route.providerCode !== "asaas") {
      throw new Error(
        `Checkout ${modalidade} ${requestedMethod} via ${route.providerCode} ainda nao esta implementado nesta entrada. Nenhuma cobranca Asaas foi gerada.`,
      );
    }
    return;
  }

  const routes = await getRoutesForMethods(
    admin,
    modalidade,
    configuredMethodsForCourse(course),
    environment,
  );
  const invalidRoute = routes.find((route: any) =>
    route?.enabled !== false && !normalizeProviderCode(route?.provider_code)
  );
  if (invalidRoute) {
    throw new Error(
      `Rota ${invalidRoute.payment_method} de ${modalidade} esta com provedor bancario invalido; nenhuma cobranca Asaas foi gerada.`,
    );
  }

  const nonAsaasRoute = routes.find((route: any) =>
    route?.enabled !== false && route?.provider_code !== "asaas"
  );
  if (nonAsaasRoute) {
    throw new Error(
      `Escolha a forma de pagamento antes de iniciar o checkout ${modalidade}. Existe rota ${nonAsaasRoute.payment_method} via ${nonAsaasRoute.provider_code}; nenhuma cobranca Asaas foi gerada.`,
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

  const environment = await resolveGatewayEnvironment(runtime.admin);

  if (String(course.modalidade || "").toUpperCase() !== "EAD") {
    await assertNonEadRouteDoesNotUseWrongProvider(
      runtime.admin,
      course,
      body,
      environment,
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

  const { data: usuarioSistema, error: usuarioError } = await runtime.admin
    .from("usuarios_sistema")
    .select("id, perfil, status")
    .ilike("email", authEmail)
    .maybeSingle();
  if (usuarioError) throw usuarioError;
  const isGestorAtivo = Boolean(usuarioSistema) &&
    String(usuarioSistema?.status || "").toUpperCase() !== "INATIVO" &&
    String(usuarioSistema?.status || "").toUpperCase() !== "BLOQUEADO";

  let alunoQuery = runtime.admin
    .from("parceiros")
    .select("*")
    .eq("tipo", "Aluno");
  alunoQuery = isGestorAtivo && requestedAlunoId
    ? alunoQuery.eq("id", requestedAlunoId)
    : alunoQuery.ilike("email", authEmail);

  const { data: aluno, error: alunoError } = await alunoQuery
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (alunoError) throw alunoError;
  if (!aluno || String(aluno.tipo || "").toUpperCase() !== "ALUNO") {
    throw new Error("Cadastro de aluno nao localizado para pagamento EAD.");
  }
  if (!isGestorAtivo && requestedAlunoId && requestedAlunoId !== aluno.id) {
    throw new Error(
      "Voce so pode gerar cobranca EAD para o seu proprio cadastro.",
    );
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

  const { data: matricula, error: matriculaError } = await runtime.admin.rpc(
    "asaas_checkout_upsert_matricula",
    {
      p_aluno_id: aluno.id,
      p_turma_id: turma.id,
      p_gerar_cobranca_futura: false,
    },
  );
  if (matriculaError) throw matriculaError;
  if (!matricula?.id) {
    throw new Error("Nao foi possivel registrar a matricula EAD.");
  }

  const route = await resolvePaymentGatewayRoute(
    runtime.admin,
    "EAD",
    charge.method,
    environment,
  );

  return {
    ...runtime,
    environment,
    course,
    aluno,
    turma,
    matricula,
    charge,
    route,
  };
};
