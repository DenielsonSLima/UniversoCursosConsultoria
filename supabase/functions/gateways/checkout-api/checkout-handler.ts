import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveOnlineCharge } from "./checkout-rules.ts";
import {
  isValidCpf,
  missingStudentBillingFields,
  onlyDigits,
} from "../../asaas/core/customer.ts";
import {
  isEadCourseModality,
  isOnlineCourseModality,
  isTecnicoCourseModality,
} from "../../asaas/core/modality.ts";
import { findExistingCourseCheckout } from "./course-enrollment-guard.ts";
import {
  buildCorsHeaders,
  getClientIp,
  isRateLimitExceeded,
  json as sendJson,
} from "../../_shared/http.ts";
import type { CheckoutContext } from "./checkout-context.ts";
import { handleProviderGatewayCheckout } from "./provider-checkout.ts";
import { cleanupFailedCheckout } from "./checkout-cleanup.ts";
import type { GatewayEnvironment } from "../router.ts";
import {
  AUTOMATIC_ENROLLMENT_ACTIVATION_SOURCE_STATUSES,
  isEnrollmentStatusEligibleForAutomaticActivation,
} from "../webhook/domain/ead-enrollment.ts";
import {
  alunoPortalUrl,
  assertRequestedPaymentMethodMatchesCourse,
  checkoutRouteModalidade,
  dueDateInDays,
  getAvailableTurmaForEnrollment,
  isActiveStatus,
  missingTechnicalEnrollmentFields,
  normalize,
  normalizeErrorMessage,
  resolvePaymentGatewayRoute,
  tryNormalizeGatewayPaymentMethod,
  UUID_RE,
} from "./checkout-utils.ts";
import { getGatewayRuntimeConfig } from "../runtime-config.ts";

export const handlePaymentCheckout = async (req: Request) => {
  const corsHeadersForRequest = buildCorsHeaders(req);
  const json = (body: unknown, status = 200) => sendJson(body, status, req);

  if (isRateLimitExceeded(`checkout-api:${getClientIp(req)}`, 30, 60000)) {
    return json({
      error:
        "Muitas tentativas de checkout em curto intervalo. Tente novamente em alguns segundos.",
    }, 429);
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeadersForRequest });
  }
  if (req.method !== "POST") {
    return json({ error: "Método não permitido." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(
    supabaseUrl,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const state = {
    checkoutMatriculaId: null as string | null,
    checkoutReceivableId: null as string | null,
    paymentCreated: false,
  };

  try {
    const requestBody = await req.json();
    const { courseId, alunoId: requestedAlunoId, turmaId } = requestBody;
    const requestedPaymentMethod = requestBody?.eadPaymentMethod ??
      requestBody?.paymentMethod ??
      requestBody?.method ??
      requestBody?.billingType;
    const requestedInstallments = requestBody?.eadInstallments ??
      requestBody?.installments;
    if (!courseId) throw new Error("Curso não informado.");

    const authorization = req.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!token) throw new Error("Entre como aluno antes de comprar o curso.");

    const { data: authData, error: authError } = await admin.auth.getUser(
      token,
    );
    const authEmail = authData?.user?.email
      ? String(authData.user.email).trim().toLowerCase()
      : "";
    if (authError || !authEmail) {
      throw new Error("Sessão inválida para checkout.");
    }

    const { data: usuarioSistema, error: usuarioError } = await admin
      .from("usuarios_sistema")
      .select("id, perfil, status, context")
      .ilike("email", authEmail)
      .maybeSingle();
    if (usuarioError) throw usuarioError;
    const gestorContext = usuarioSistema?.context
      ? String(usuarioSistema.context).trim()
      : null;
    const gestorPoloId = UUID_RE.test(gestorContext || "")
      ? gestorContext
      : null;
    let gestorGlobal = normalize(gestorContext) === "global";
    if (gestorPoloId) {
      const { data: polo, error: poloError } = await admin
        .from("polos")
        .select("is_matriz")
        .eq("id", gestorPoloId)
        .maybeSingle();
      if (poloError) throw poloError;
      if (polo?.is_matriz === true) gestorGlobal = true;
    }
    const isGestorAtivo = Boolean(
      usuarioSistema &&
        normalize(usuarioSistema.perfil) === "gestor" &&
        isActiveStatus(usuarioSistema.status),
    );
    if (requestedAlunoId && isGestorAtivo && !gestorGlobal && !gestorPoloId) {
      throw new Error(
        "Gestor sem polo definido não pode gerar checkout para outro aluno.",
      );
    }

    const { data: course, error } = await admin
      .from("cursos")
      .select(
        "id, nome, modalidade, valor, publicar_site, status, financeiro_config",
      )
      .eq("id", courseId)
      .single();
    if (error) throw error;
    if (!course.publicar_site || course.status !== "ativo") {
      throw new Error("Curso indisponível para matrícula.");
    }
    if (!isOnlineCourseModality(course.modalidade)) {
      throw new Error("Modalidade sem checkout online.");
    }
    const isEadCheckout = isEadCourseModality(course.modalidade);
    const keepTechnicalDocumentationPending = isTecnicoCourseModality(
      course.modalidade,
    );
    const hasExplicitPaymentSelection = Boolean(
      String(requestedPaymentMethod || "").trim(),
    );
    let alunoQuery = admin
      .from("parceiros")
      .select("*")
      .in("tipo", ["Aluno", "Professor"]);
    if (isGestorAtivo && requestedAlunoId) {
      alunoQuery = alunoQuery.eq("id", requestedAlunoId);
    } else {
      alunoQuery = alunoQuery.ilike("email", authEmail);
    }
    const { data: aluno, error: alunoError } = await alunoQuery
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (alunoError) throw alunoError;
    if (!aluno) {
      throw new Error(
        "Comprador não encontrado. Faça seu cadastro antes de comprar.",
      );
    }
    if (!isGestorAtivo && requestedAlunoId && requestedAlunoId !== aluno.id) {
      throw new Error(
        "Você só pode gerar checkout para o seu próprio cadastro.",
      );
    }
    if (isGestorAtivo && requestedAlunoId && !gestorGlobal) {
      const alunoPoloIds = Array.isArray(aluno.polo_ids)
        ? aluno.polo_ids.map(String)
        : [];
      const alunoNoPolo = aluno.polo_id === gestorPoloId ||
        alunoPoloIds.includes(String(gestorPoloId));
      if (!alunoNoPolo) {
        throw new Error(
          "Gestor sem permissão para gerar checkout deste aluno.",
        );
      }
    }

    const cpfCnpj = onlyDigits(aluno.cpf_cnpj);
    const hasValidCpfCnpjForGateway = !cpfCnpj
      ? false
      : cpfCnpj.length === 11
      ? isValidCpf(cpfCnpj)
      : true;
    const gatewayDocument = hasValidCpfCnpjForGateway ? cpfCnpj : "";
    const existingCourseCheckout = await findExistingCourseCheckout(
      admin,
      aluno.id,
      course.id,
      {
        ignorePending: hasExplicitPaymentSelection,
      },
    );
    if (existingCourseCheckout?.state === "paid") {
      const existingStatus = normalize(
        existingCourseCheckout.matricula?.status,
      );
      if (
        !keepTechnicalDocumentationPending &&
        isEnrollmentStatusEligibleForAutomaticActivation(existingStatus)
      ) {
        await admin
          .from("matriculas")
          .update({ status: "ATIVO" })
          .eq("id", existingCourseCheckout.matricula.id)
          .in("status", [
            ...AUTOMATIC_ENROLLMENT_ACTIVATION_SOURCE_STATUSES,
          ]);
      }
      return json({
        url: existingCourseCheckout.url || alunoPortalUrl(course.id),
        alreadyPaid: true,
        matriculaId: existingCourseCheckout.matricula.id,
      });
    }
    if (existingCourseCheckout?.state === "pending") {
      if (existingCourseCheckout.url) {
        return json({
          url: existingCourseCheckout.url,
          alreadyPending: true,
          matriculaId: existingCourseCheckout.matricula.id,
        });
      }
      throw new Error(
        "Este aluno já possui uma matrícula aguardando pagamento para este curso. Atualize a tela ou procure a secretaria antes de gerar uma nova cobrança.",
      );
    }

    assertRequestedPaymentMethodMatchesCourse(course, requestedPaymentMethod);

    const requireOnlinePermission = !isEadCheckout;
    let turmasQuery = admin
      .from("turmas")
      .select(`
        id,
        nome,
        polo_id,
        vagas_totais,
        permitir_inscricoes_online,
        qtd_vagas_minima,
        bloquear_matriculas_apos_completar_vagas,
        data_inicio_inscricao,
        data_fim_inscricao,
        valor_matricula,
        valor_parcela,
        qtd_parcelas,
        desconto_pontualidade,
        juros_atraso,
        multa_atraso,
        aplicar_desconto_matricula,
        aplicar_multa_juros_matricula,
        gerar_cobrancas_futuras,
        aceita_concomitante,
        aceita_subsequente,
        serie_minima_ensino_medio,
        matriculas(status)
      `)
      .eq("curso_id", course.id)
      .in(
        "status",
        isEadCheckout
          ? ["EM_ANDAMENTO"]
          : ["INSCRICOES_ABERTAS", "EM_ANDAMENTO"],
      );
    if (turmaId) {
      turmasQuery = turmasQuery.eq("id", turmaId);
    }
    if (isGestorAtivo && requestedAlunoId && !gestorGlobal) {
      turmasQuery = turmasQuery.eq("polo_id", gestorPoloId);
    }
    if (requireOnlinePermission) {
      turmasQuery = turmasQuery.eq("permitir_inscricoes_online", true);
    }
    const { data: turmas, error: turmasError } = await turmasQuery.order(
      "data_inicio",
      { ascending: true },
    );
    if (turmasError) throw turmasError;
    if (turmaId && (!turmas || turmas.length === 0)) {
      throw new Error(
        "A turma escolhida não está aberta para matrícula online.",
      );
    }
    const availableSelection = getAvailableTurmaForEnrollment(
      turmas || [],
      requireOnlinePermission,
    );
    if (!availableSelection.turma) {
      throw new Error(
        availableSelection.reason || "Não há turma aberta para este curso.",
      );
    }
    const turma = availableSelection.turma;
    if (isTecnicoCourseModality(course.modalidade)) {
      const missingTechnicalFields = missingTechnicalEnrollmentFields(
        aluno,
        turma,
      );
      if (missingTechnicalFields.length > 0) {
        throw new Error(
          `Antes do pagamento da matrícula técnica, informe: ${
            missingTechnicalFields.join(", ")
          }.`,
        );
      }
    }
    const technicalSchoolSnapshot = isTecnicoCourseModality(course.modalidade)
      ? {
        situacao_ensino_medio: aluno.situacao_ensino_medio || null,
        serie_ensino_medio_atual: aluno.serie_ensino_medio_atual || null,
        escola_ensino_medio: aluno.escola_ensino_medio || null,
        ano_conclusao_ensino_medio: aluno.ano_conclusao_ensino_medio
          ? Number(aluno.ano_conclusao_ensino_medio)
          : null,
        ano_previsto_conclusao_ensino_medio:
          aluno.ano_previsto_conclusao_ensino_medio || null,
      }
      : {};
    const { data: pricingMatriculas, error: pricingMatriculaError } =
      isEadCheckout ? { data: [], error: null } : await admin
        .from("matriculas")
        .select(
          "id, valor_matricula_individual, desconto_pontualidade_individual, juros_atraso_individual, multa_atraso_individual, data_matricula",
        )
        .eq("aluno_id", aluno.id)
        .eq("turma_id", turma.id)
        .order("data_matricula", { ascending: false })
        .limit(1);
    if (pricingMatriculaError) throw pricingMatriculaError;
    const pricingMatricula = pricingMatriculas?.[0] || null;
    const gerarCobrancaFutura = isEadCheckout
      ? false
      : turma.gerar_cobrancas_futuras === true;

    const [{ data: config, error: configError }, runtimeConfig] = await Promise.all([
      admin
      .from("asaas_config")
      .select(
        "notifications_enabled, notification_whatsapp_enabled, notification_email_enabled, notification_sms_enabled",
      )
      .maybeSingle(),
      getGatewayRuntimeConfig(admin),
    ]);
    if (configError) throw configError;
    if (!runtimeConfig.enabled) {
      throw new Error(
        "As cobrancas online estao temporariamente desativadas nas configuracoes bancarias.",
      );
    }
    const environment: GatewayEnvironment = runtimeConfig.activeEnvironment;
    const notificationsEnabled = config?.notifications_enabled === true ||
      config?.notification_whatsapp_enabled === true ||
      config?.notification_email_enabled === true ||
      config?.notification_sms_enabled === true;

    const dataVencimento = dueDateInDays(7);
    const charge = resolveOnlineCharge(course, turma, dataVencimento, {
      eadPayment: isEadCheckout
        ? {
          method: requestedPaymentMethod,
          installments: requestedInstallments,
        }
        : undefined,
      payment: !isEadCheckout
        ? {
          method: requestedPaymentMethod,
          installments: requestedInstallments,
        }
        : undefined,
      matricula: pricingMatricula,
    });
    const receivableFeeFields = isEadCheckout
      ? {
        asaas_fee_value: typeof (charge as any).feeValue === "number" &&
            Number.isFinite((charge as any).feeValue)
          ? (charge as any).feeValue
          : null,
        asaas_net_value: typeof (charge as any).netValue === "number" &&
            Number.isFinite((charge as any).netValue)
          ? (charge as any).netValue
          : null,
      }
      : {};
    const gatewayPaymentMethodForCharge = tryNormalizeGatewayPaymentMethod(
      charge.billingType,
    );
    if (!gatewayPaymentMethodForCharge) {
      throw new Error(
        "Forma de pagamento do checkout nao foi definida para este curso.",
      );
    }
    const routeModalidade = checkoutRouteModalidade(course.modalidade);
    let gatewayRoute: {
      providerCode: string;
      credentialId: string | null;
      enabled: boolean;
      environment: GatewayEnvironment;
    } = {
      providerCode: "asaas",
      credentialId: null,
      enabled: true,
      environment,
    };
    if (routeModalidade) {
      gatewayRoute = await resolvePaymentGatewayRoute(
        admin,
        routeModalidade,
        gatewayPaymentMethodForCharge,
        environment,
      );
    }

    if (gatewayRoute.providerCode === "asaas") {
      if (!cpfCnpj) {
        throw new Error(
          "O aluno precisa ter CPF cadastrado para gerar a cobrança no Asaas.",
        );
      }
      if (cpfCnpj.length === 11 && !isValidCpf(cpfCnpj)) {
        throw new Error(
          "CPF inválido para cobrança. Atualize o cadastro do aluno antes de comprar.",
        );
      }
      const missingBillingFields = missingStudentBillingFields(aluno);
      if (missingBillingFields.length > 0) {
        throw new Error(
          `Atualize o cadastro do aluno antes de gerar a cobrança no Asaas. Campos obrigatórios: ${
            missingBillingFields.join(", ")
          }.`,
        );
      }
    } else if (cpfCnpj && !hasValidCpfCnpjForGateway) {
      console.warn(
        "CPF/CNPJ do aluno invalido; checkout bancario seguira sem documento de identificacao do pagador.",
      );
    }

    // Somente reserva/reactiva a matricula depois de validar metodo, ambiente,
    // rota e requisitos do provedor. Assim erro de configuracao nao deixa uma
    // matricula pendente sem sequer ter iniciado o checkout bancario.
    const { data: matricula, error: matriculaError } = await admin.rpc(
      "asaas_checkout_upsert_matricula",
      {
        p_aluno_id: aluno.id,
        p_turma_id: turma.id,
        p_gerar_cobranca_futura: gerarCobrancaFutura,
      },
    );
    if (matriculaError) throw matriculaError;
    if (!matricula?.id) {
      throw new Error(
        "Não foi possível registrar a matrícula para o checkout.",
      );
    }
    if (pricingMatricula?.id && pricingMatricula.id !== matricula.id) {
      throw new Error(
        "A matrícula mudou durante o cálculo financeiro. Atualize a tela antes de tentar novamente.",
      );
    }
    state.checkoutMatriculaId = matricula.id;

    const context: CheckoutContext = {
      admin,
      supabaseUrl,
      json,
      state,
      course,
      aluno,
      turma,
      matricula,
      environment: gatewayRoute.environment || environment,
      notificationsEnabled,
      isEadCheckout,
      keepTechnicalDocumentationPending,
      hasExplicitPaymentSelection,
      cpfCnpj,
      gatewayDocument,
      dataVencimento,
      charge,
      receivableFeeFields,
      gatewayPaymentMethodForCharge,
      gatewayRoute,
      technicalSchoolSnapshot,
    };

    return await handleProviderGatewayCheckout(context);
  } catch (error) {
    const errorMessage = normalizeErrorMessage(error);
    const remotePaymentMayExist = Boolean(
      error && typeof error === "object" &&
        (error as Record<string, unknown>).remotePaymentCreated === true,
    );
    console.error("Erro ao gerar checkout público:", error);
    await cleanupFailedCheckout(admin, state, remotePaymentMayExist);
    return json({ error: errorMessage }, 400);
  }
};
