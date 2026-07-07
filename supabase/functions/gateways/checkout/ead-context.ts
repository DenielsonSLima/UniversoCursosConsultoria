import type {
  CheckoutBody,
  CheckoutRoute,
  CheckoutRuntime,
  EadCheckoutContext,
  GatewayEnvironment,
  GatewayPaymentMethod,
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

    const fallback = await admin.rpc("asaas_checkout_upsert_matricula", rpcArgs);
    if (fallback.error) throw fallback.error;
    return fallback.data;
  } catch (error) {
    if (!looksLikeRpcNotFound(error)) throw error;
    const fallback = await admin.rpc("asaas_checkout_upsert_matricula", rpcArgs);
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

  if (environment) query = query.eq("environment", environment);

  const { data, error } = await query.order("environment", { ascending: true });
  if (error) {
    console.error("Nao foi possivel consultar rota bancaria do checkout:", error);
    throw new Error(
      "Nao foi possivel validar a rota bancaria antes de gerar a cobranca.",
    );
  }

  return data || [];
};

export const resolvePaymentGatewayRoute = async (
  admin: any,
  modalidade: string,
  paymentMethod: GatewayPaymentMethod,
  environment?: GatewayEnvironment,
): Promise<{ route: CheckoutRoute; environment: GatewayEnvironment }> => {
  const normalizeLabel = (environment: string) =>
    environment === "production" ? "producao" : "sandbox";

  const configuredEnvironment = environment || await resolveGatewayEnvironment(admin);
  const configuredRoutes = await fetchGatewayRoutes(
    admin,
    modalidade,
    paymentMethod,
    configuredEnvironment,
  );

  if (configuredRoutes.length > 1) {
    throw new Error(
      `Configuracao duplicada para ${paymentMethod} de ${modalidade} em ${normalizeLabel(configuredEnvironment)}. Corrija para manter apenas uma rota ativa por ambiente.`,
    );
  }

  if (configuredRoutes.length === 0) {
    const fallbackRoutes = await fetchGatewayRoutes(admin, modalidade, paymentMethod);
    if (fallbackRoutes.length > 1) {
      const availableEnvironments = [...new Set(
        (fallbackRoutes || []).map((route: any) => String(route?.environment || ""))
          .filter(Boolean),
      )]
        .map((item) => normalizeLabel(String(item)));
      throw new Error(
        `Rota ${paymentMethod} de ${modalidade} nao esta ativa em ${normalizeLabel(
          configuredEnvironment,
        )}. Existem rotas ativas em: ${availableEnvironments.join(", ")}. Confirme o ambiente ativo em configuracoes gerais.`,
      );
    }

    if (fallbackRoutes.length === 1) {
      const onlyRoute = fallbackRoutes[0];
      const onlyRouteEnvironment = onlyRoute.environment === "production"
        ? "production" as GatewayEnvironment
        : "sandbox" as GatewayEnvironment;
      if (onlyRouteEnvironment !== configuredEnvironment) {
        throw new Error(
          `Rota ${paymentMethod} de ${modalidade} esta ativa apenas em ${normalizeLabel(onlyRouteEnvironment)}. Ajuste o ambiente ativo para ${normalizeLabel(onlyRouteEnvironment)} ou ative a rota no ambiente ${normalizeLabel(configuredEnvironment)}.`,
        );
      }
    }

    throw new Error(
      `Rota ${paymentMethod} de ${modalidade} em ${normalizeLabel(configuredEnvironment)} nao esta ativa.`,
    );
  }

  const configuredRoute = configuredRoutes[0];
  if (configuredRoute?.enabled === false) {
    throw new Error(
      `Nenhuma rota ativa encontrada para ${paymentMethod} de ${modalidade}.`,
    );
  }

  const route = configuredRoute;
  const providerCode = normalizeProviderCode(route?.provider_code);
  if (!providerCode) {
    throw new Error(
      `Provedor bancario invalido para a rota ${paymentMethod} de ${modalidade} em ${normalizeLabel(String(route?.environment || configuredEnvironment))}.`,
    );
  }

  return {
    environment: route.environment === "production" ? "production" : "sandbox",
    route: {
      providerCode,
      credentialId: route.credential_id || null,
      enabled: route.enabled !== false,
    },
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
  const { environment, route } = await resolvePaymentGatewayRoute(
    runtime.admin,
    "EAD",
    charge.method,
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

  const matricula = await upsertEadMatricula(runtime.admin, aluno.id, turma.id);
  if (!matricula?.id) {
    throw new Error("Nao foi possivel registrar a matricula EAD.");
  }

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
