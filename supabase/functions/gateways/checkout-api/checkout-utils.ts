import { normalizeCourseFinanceiroConfig } from "./checkout-rules.ts";
import { normalizeCourseModality } from "../../asaas/core/modality.ts";
import {
  type GatewayEnvironment,
  type GatewayPaymentMethod,
  gatewayPrimaryUrl,
} from "../router.ts";
import {
  normalizeEnvironment,
  normalizeProviderCode,
} from "../checkout/utils.ts";
import { assertStoredProviderAdapterReady } from "../api/config.ts";

export const PENDENTE_INSCRICAO_STATUS = "AGUARDANDO_PAGAMENTO";
export const BLOCKING_ENROLLMENT_STATUSES = new Set([
  "ATIVO",
  "CONCLUIDO",
  "PENDENTE",
  "AGUARDANDO_PAGAMENTO",
  "AGUARDANDO_CONFIRMACAO",
]);

export const dueDateInDays = (days: number) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

export const normalize = (value: unknown) =>
  String(value || "").trim().toLowerCase();
export const isActiveStatus = (status: unknown) =>
  ["ativo", "active"].includes(normalize(status));
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUnsafeCallbackHost = (hostname: string) => {
  const host = hostname.toLowerCase();
  if (
    host === "localhost" || host === "0.0.0.0" || host === "::1" ||
    host.endsWith(".local")
  ) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) {
    return true;
  }
  const private172 = host.match(/^172\.(\d+)\./);
  return Boolean(
    private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31,
  );
};

export const resolvePublicBaseUrl = () => {
  const candidates = [
    Deno.env.get("PUBLIC_SITE_URL"),
    Deno.env.get("SITE_URL"),
    Deno.env.get("APP_URL"),
    Deno.env.get("VITE_PUBLIC_SITE_URL"),
    "https://universocc.com.br",
  ];
  for (const candidate of candidates) {
    try {
      const url = new URL(String(candidate || ""));
      if (url.protocol === "https:" && !isUnsafeCallbackHost(url.hostname)) {
        return url.origin.replace(/\/+$/, "");
      }
    } catch {
      // Try the next configured source.
    }
  }
  return null;
};

export const alunoPortalUrl = (courseId?: string | null) => {
  const publicBaseUrl = resolvePublicBaseUrl() || "https://universocc.com.br";
  const url = new URL("/aluno", publicBaseUrl);
  if (courseId) url.searchParams.set("courseId", courseId);
  url.searchParams.set("module", "perfil");
  url.searchParams.set("tab", "documentos");
  url.searchParams.set("technicalEnrollment", "1");
  url.searchParams.set("checkout", "already-paid");
  return url.toString();
};

export const normalizeErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message || "Erro interno.";
  if (typeof error === "string") return error;

  const typedError = error as Record<string, unknown>;
  if (typedError && typeof typedError === "object") {
    const message = (typedError.message && String(typedError.message)) ||
      (typedError.error_description && String(typedError.error_description)) ||
      (typedError.error && String(typedError.error));
    const detail = (typedError.details && String(typedError.details)) ||
      (typedError.hint && String(typedError.hint)) ||
      (typedError.code && `Código: ${String(typedError.code)}`);

    if (message && detail) return `${message} (${detail})`;
    if (message) return message;
    if (detail) return detail;
  }

  return "Erro interno.";
};

export const resolveCheckoutUrl = (receivable: any) =>
  gatewayPrimaryUrl(receivable) || null;

export const toDateString = (value: unknown) => {
  if (!value) return null;
  const valueAsString = String(value);
  return valueAsString.length >= 10 ? valueAsString.slice(0, 10) : null;
};

export const currentMaceioDate = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Maceio",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
};

export const isPaidPayment = (payment: any) =>
  ["RECEIVED", "CONFIRMED"].includes(
    String(payment?.status || "").toUpperCase(),
  );

export const normalizeGatewayPaymentMethod = (value: unknown) => {
  const method = String(value || "").trim().toUpperCase();
  if (method === "PIX" || method === "BOLETO" || method === "CREDIT_CARD") {
    return method;
  }
  if (method === "CARTAO" || method === "CARTÃO") return "CREDIT_CARD";
  return "CREDIT_CARD";
};

export const tryNormalizeGatewayPaymentMethod = (
  value: unknown,
): GatewayPaymentMethod | null => {
  const method = String(value || "").trim().toUpperCase();
  if (method === "PIX" || method === "BOLETO" || method === "CREDIT_CARD") {
    return method;
  }
  if (method === "CARTAO" || method === "CARTÃO" || method === "CARD") {
    return "CREDIT_CARD";
  }
  return null;
};

export const activePaymentMethodsForCourse = (course: any) => {
  const financeiroConfig = normalizeCourseFinanceiroConfig(
    course?.financeiro_config || {},
  );
  const methods: string[] = [];
  if (financeiroConfig.metodosRecebimento.pix) methods.push("PIX");
  if (financeiroConfig.metodosRecebimento.boleto) methods.push("BOLETO");
  if (
    financeiroConfig.metodosRecebimento.cartao &&
    financeiroConfig.cartao.aceitar
  ) {
    methods.push("CREDIT_CARD");
  }
  return methods;
};

export const assertRequestedPaymentMethodMatchesCourse = (
  course: any,
  rawMethod: unknown,
) => {
  const requestedMethod = tryNormalizeGatewayPaymentMethod(rawMethod);
  if (rawMethod && !requestedMethod) {
    throw new Error("Forma de pagamento invalida para este curso.");
  }

  const activeMethods = activePaymentMethodsForCourse(course);
  if (activeMethods.length === 0) {
    throw new Error(
      "Nenhuma forma de recebimento configurada para este curso.",
    );
  }
  if (activeMethods.length > 1 && !requestedMethod) {
    throw new Error(
      "Escolha Pix, boleto ou cartao antes de iniciar o checkout do curso.",
    );
  }
  if (requestedMethod && !activeMethods.includes(requestedMethod)) {
    throw new Error("Este curso nao permite a forma de pagamento escolhida.");
  }

  return requestedMethod;
};

export const providerLabelFor = (providerCode: string) => {
  if (providerCode === "mercado_pago") return "Mercado Pago";
  if (providerCode === "banese_card") return "Banese";
  return "Asaas";
};

export const asaasApiSecretName = (environment: string) =>
  environment === "production"
    ? "asaas_production_api_key"
    : "asaas_sandbox_api_key";

export const asaasBaseUrl = (environment: string) =>
  environment === "production"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";

export const tryCancelLegacyAsaasPayment = async (
  admin: any,
  environment: string,
  receivable: any,
) => {
  const paymentId = receivable?.asaas_payment_id ||
    (receivable?.gateway_provider === "asaas"
      ? receivable?.gateway_payment_id
      : null);
  const paymentLinkId = receivable?.asaas_payment_link_id ||
    (receivable?.gateway_provider === "asaas"
      ? receivable?.gateway_payment_link_id
      : null);
  if (!paymentId && !paymentLinkId) return;

  const { data: apiKey, error } = await admin.rpc("asaas_get_secret", {
    p_secret_name: asaasApiSecretName(environment),
  });
  if (error || !apiKey) {
    throw new Error(
      "Nao foi possivel autenticar no Asaas para cancelar a cobranca anterior. Nenhum novo titulo foi criado.",
    );
  }

  if (paymentId) {
    const paymentUrl = `${asaasBaseUrl(environment)}/payments/${paymentId}`;
    const currentResponse = await fetch(paymentUrl, {
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Universo-Cursos-Aluno",
        access_token: apiKey,
      },
    });
    const current = currentResponse.status === 404
      ? null
      : await currentResponse.json().catch(() => null);
    if (!currentResponse.ok && currentResponse.status !== 404) {
      throw new Error(
        `Nao foi possivel consultar a cobranca anterior no Asaas (${currentResponse.status}). Nenhum novo titulo foi criado.`,
      );
    }
    const currentStatus = String(current?.status || "").toUpperCase();
    if (["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(currentStatus)) {
      throw new Error(
        "O Asaas ja confirmou o pagamento da cobranca anterior. Atualize a conciliacao antes de tentar novo checkout.",
      );
    }
    if (currentResponse.status !== 404 && currentStatus !== "DELETED") {
      const response = await fetch(paymentUrl, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Universo-Cursos-Aluno",
          access_token: apiKey,
        },
      });
      if (!response.ok && response.status !== 404) {
        throw new Error(
          `Nao foi possivel cancelar a cobranca anterior no Asaas (${response.status}). Nenhum novo titulo foi criado.`,
        );
      }
    }
    const confirmation = await fetch(paymentUrl, {
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Universo-Cursos-Aluno",
        access_token: apiKey,
      },
    });
    const confirmationPayload = confirmation.status === 404
      ? null
      : await confirmation.json().catch(() => null);
    if (
      confirmation.status !== 404 &&
      (!confirmation.ok ||
        String(confirmationPayload?.status || "").toUpperCase() !== "DELETED")
    ) {
      throw new Error(
        "O Asaas nao confirmou o cancelamento da cobranca anterior. Nenhum novo titulo foi criado.",
      );
    }
  }

  if (paymentLinkId) {
    const response = await fetch(
      `${asaasBaseUrl(environment)}/paymentLinks/${paymentLinkId}`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Universo-Cursos-Aluno",
          access_token: apiKey,
        },
      },
    );
    if (!response.ok && response.status !== 404) {
      throw new Error(
        `Nao foi possivel cancelar o link anterior no Asaas (${response.status}). Nenhum novo titulo foi criado.`,
      );
    }
  }
};

export const checkoutRouteModalidade = (value: unknown) => {
  const modalidade = normalizeCourseModality(value);
  return ["EAD", "TECNICO", "LIVRE", "ESPECIALIZACAO"].includes(modalidade)
    ? modalidade
    : null;
};

const normalizeGatewayEnvironmentLabel = (environment: GatewayEnvironment) =>
  environment === "production" ? "producao" : "sandbox";

export const resolvePaymentGatewayRoute = async (
  admin: any,
  modalidade: string,
  paymentMethod: GatewayPaymentMethod,
  environment?: GatewayEnvironment,
) => {
  const configuredEnvironment: GatewayEnvironment = environment === "production"
    ? "production"
    : "sandbox";
  const { data, error } = await admin
    .from("payment_gateway_routes")
    .select("provider_code, credential_id, enabled, environment")
    .eq("modalidade", modalidade)
    .eq("payment_method", paymentMethod)
    .eq("environment", configuredEnvironment)
    .neq("enabled", false);

  if (error) {
    console.error(
      "Nao foi possivel consultar a rota bancaria do checkout:",
      error,
    );
    throw new Error(
      "Nao foi possivel validar a rota bancaria antes de gerar a cobranca.",
    );
  }

  const availableRoutes = (data || []).map((route: any) => ({
    ...route,
    environment: normalizeEnvironment(route?.environment),
  }));
  const availableEnvironments: GatewayEnvironment[] = [
    ...new Set(
      availableRoutes.map((route: any) => String(route?.environment || "").trim())
        .filter(Boolean),
    ),
  ].map((value) => normalizeEnvironment(value));

  if (availableRoutes.length > 1) {
    throw new Error(
      `Configuracao duplicada para ${paymentMethod} de ${modalidade} em ${
        normalizeGatewayEnvironmentLabel(configuredEnvironment)
      }. Corrija para manter apenas uma rota ativa por ambiente.`,
    );
  }
  if (availableRoutes.length === 1) {
    const route = availableRoutes[0];
    assertStoredProviderAdapterReady(
      route.provider_code,
      paymentMethod,
      configuredEnvironment,
    );
    const providerCode = normalizeProviderCode(route.provider_code);
    if (!providerCode) {
      throw new Error(
        `Provedor bancario invalido para a rota ${paymentMethod} de ${modalidade} em ${
          normalizeGatewayEnvironmentLabel(configuredEnvironment)
        }.`,
      );
    }
    return {
      providerCode,
      credentialId: route.credential_id || null,
      enabled: route.enabled !== false,
      environment: configuredEnvironment,
    };
  }

  if (availableRoutes.length === 0) {
    throw new Error(
      `Rota ${paymentMethod} de ${modalidade} em ${
        normalizeGatewayEnvironmentLabel(configuredEnvironment)
      } nao esta ativa.`,
    );
  }

  throw new Error(
    `Rota ${paymentMethod} de ${modalidade} nao esta ativa nos ambientes suportados. ${
      availableEnvironments.length
        ? `Existen rotas ativas em: ${
          availableEnvironments.map(normalizeGatewayEnvironmentLabel).join(", ")
        }.`
        : ""
    }`.trim(),
  );
};

export const formatDatePtBr = (value: unknown) => {
  const date = toDateString(value);
  if (!date) return "";
  return new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR");
};

export const getMatriculasTotal = (turma: any) => {
  const matriculas = turma?.matriculas;
  if (!Array.isArray(matriculas)) return 0;
  return matriculas.filter((matricula: any) =>
    BLOCKING_ENROLLMENT_STATUSES.has(
      String(matricula?.status || "").toUpperCase(),
    )
  ).length;
};

export const getTurmaUnavailabilityReason = (
  turma: any,
  requireOnlinePermission = true,
) => {
  const today = currentMaceioDate();
  const alunosMatriculados = getMatriculasTotal(turma);
  const vagasTotais = Number(turma?.vagas_totais || 0);
  const bloquearMatriculasAposCompletarVagas =
    turma?.bloquear_matriculas_apos_completar_vagas !== false;

  const inicioInscricao = toDateString(turma?.data_inicio_inscricao);
  const fimInscricao = toDateString(turma?.data_fim_inscricao);

  if (requireOnlinePermission && turma?.permitir_inscricoes_online !== true) {
    return "Inscrições online não liberadas para esta turma.";
  }

  if (inicioInscricao && today < inicioInscricao) {
    return `As inscrições ainda não abriram. Abertura prevista para ${
      formatDatePtBr(inicioInscricao)
    }.`;
  }

  if (fimInscricao && today > fimInscricao) {
    return `As inscrições foram encerradas em ${
      formatDatePtBr(fimInscricao)
    }. Novas inscrições só estarão disponíveis quando uma nova turma for aberta.`;
  }

  if (bloquearMatriculasAposCompletarVagas) {
    if (vagasTotais > 0 && alunosMatriculados >= vagasTotais) {
      return "A turma está com vagas completas. Novas inscrições só estarão disponíveis quando uma nova turma for aberta.";
    }
  }

  return null;
};

export const getAvailableTurmaForEnrollment = (
  turmas: any[],
  requireOnlinePermission = true,
) => {
  const evaluated = (turmas || []).map((turma) => {
    return {
      turma,
      reason: getTurmaUnavailabilityReason(turma, requireOnlinePermission),
    };
  });

  const available = evaluated.find((row) => !row.reason);
  if (available) {
    return {
      turma: available.turma,
      reason: null,
    };
  }

  return {
    turma: null,
    reason: evaluated[0]?.reason ||
      "Não há turma aberta para este curso para receber inscrições.",
  };
};

export const missingTechnicalEnrollmentFields = (student: any, turma: any) => {
  const missing: string[] = [];
  const hasText = (value: unknown) => String(value || "").trim().length > 0;

  const situacao = String(student?.situacao_ensino_medio || "").trim()
    .toUpperCase();
  const serie = Number(student?.serie_ensino_medio_atual || 0);
  const serieMinima = Math.max(
    1,
    Number(turma?.serie_minima_ensino_medio || 2),
  );

  if (!hasText(student?.escola_ensino_medio)) {
    missing.push("escola do Ensino Médio");
  }

  if (situacao === "CURSANDO") {
    if (turma?.aceita_concomitante === false) {
      missing.push(
        "Ensino Médio concluído (esta turma não aceita matrícula concomitante)",
      );
    }
    if (![2, 3].includes(serie) || serie < serieMinima) {
      missing.push(`série atual do Ensino Médio (mínimo: ${serieMinima}º ano)`);
    }
    if (
      !/^\d{4}$/.test(
        String(student?.ano_previsto_conclusao_ensino_medio || "").trim(),
      )
    ) {
      missing.push("ano previsto de conclusão do Ensino Médio");
    }
  } else if (situacao === "CONCLUIDO") {
    if (turma?.aceita_subsequente === false) {
      missing.push(
        "Ensino Médio em andamento (esta turma é apenas concomitante)",
      );
    }
    if (
      !/^\d{4}$/.test(String(student?.ano_conclusao_ensino_medio || "").trim())
    ) {
      missing.push("ano de conclusão do Ensino Médio");
    }
  } else {
    missing.push("situação do Ensino Médio");
  }

  return missing;
};
