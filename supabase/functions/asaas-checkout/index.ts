import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildOnlinePaymentPayload,
  mapBillingType,
  resolveOnlineCharge,
} from "./checkout-rules.ts";
import { isValidCpf, missingStudentBillingFields, onlyDigits } from "../asaas/core/customer.ts";
import { paymentDate } from "../asaas/core/status.ts";
import { findExistingCourseCheckout } from "./course-enrollment-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ONLINE_MODALIDADES = ["EAD", "LIVRE", "ESPECIALIZACAO", "TECNICO"];
const PENDENTE_INSCRICAO_STATUS = "AGUARDANDO_PAGAMENTO";
const BLOCKING_ENROLLMENT_STATUSES = new Set([
  "ATIVO",
  "CONCLUIDO",
  "PENDENTE",
  "AGUARDANDO_PAGAMENTO",
  "AGUARDANDO_CONFIRMACAO",
]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const dueDateInDays = (days: number) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();
const isActiveStatus = (status: unknown) =>
  ["ativo", "active"].includes(normalize(status));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUnsafeCallbackHost = (hostname: string) => {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "0.0.0.0" || host === "::1" || host.endsWith(".local")) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  const private172 = host.match(/^172\.(\d+)\./);
  return Boolean(private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31);
};

const resolvePublicBaseUrl = () => {
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

const alunoPortalUrl = (courseId?: string | null) => {
  const publicBaseUrl = resolvePublicBaseUrl() || "https://universocc.com.br";
  const url = new URL("/aluno", publicBaseUrl);
  if (courseId) url.searchParams.set("courseId", courseId);
  url.searchParams.set("asaas", "already-paid");
  return url.toString();
};

const normalizeErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message || "Erro interno.";
  if (typeof error === "string") return error;

  const typedError = error as Record<string, unknown>;
  if (typedError && typeof typedError === "object") {
    const message =
      (typedError.message && String(typedError.message))
      || (typedError.error_description && String(typedError.error_description))
      || (typedError.error && String(typedError.error));
    const detail =
      (typedError.details && String(typedError.details))
      || (typedError.hint && String(typedError.hint))
      || (typedError.code && `Código: ${String(typedError.code)}`);

    if (message && detail) return `${message} (${detail})`;
    if (message) return message;
    if (detail) return detail;
  }

  return "Erro interno.";
};

const toDateString = (value: unknown) => {
  if (!value) return null;
  const valueAsString = String(value);
  return valueAsString.length >= 10 ? valueAsString.slice(0, 10) : null;
};

const currentIsoDate = () => new Date().toISOString().slice(0, 10);

const isPaidPayment = (payment: any) =>
  ["RECEIVED", "CONFIRMED"].includes(String(payment?.status || "").toUpperCase());

const formatDatePtBr = (value: unknown) => {
  const date = toDateString(value);
  if (!date) return "";
  return new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR");
};

const getMatriculasTotal = (turma: any) => {
  const matriculas = turma?.matriculas;
  if (!Array.isArray(matriculas)) return 0;
  return matriculas.filter((matricula: any) =>
    BLOCKING_ENROLLMENT_STATUSES.has(String(matricula?.status || "").toUpperCase())
  ).length;
};

const getTurmaUnavailabilityReason = (turma: any, requireOnlinePermission = true) => {
  const today = currentIsoDate();
  const alunosMatriculados = getMatriculasTotal(turma);
  const vagasTotais = Number(turma?.vagas_totais || 0);
  const vagasMinima = Number(turma?.qtd_vagas_minima || 0);
  const bloquearMatriculasAposCompletarVagas = turma?.bloquear_matriculas_apos_completar_vagas !== false;

  const inicioInscricao = toDateString(turma?.data_inicio_inscricao);
  const fimInscricao = toDateString(turma?.data_fim_inscricao);

  if (requireOnlinePermission && turma?.permitir_inscricoes_online !== true) {
    return "Inscrições online não liberadas para esta turma.";
  }

  if (inicioInscricao && today < inicioInscricao) {
    return `As inscrições ainda não abriram. Abertura prevista para ${formatDatePtBr(inicioInscricao)}.`;
  }

  if (fimInscricao && today > fimInscricao) {
    return `As inscrições foram encerradas em ${formatDatePtBr(fimInscricao)}. Novas inscrições só estarão disponíveis quando uma nova turma for aberta.`;
  }

  if (bloquearMatriculasAposCompletarVagas) {
    if (vagasMinima > 0 && alunosMatriculados >= vagasMinima) {
      return `A turma atingiu o limite configurado de ${vagasMinima} alunos e não está aceitando novos alunos.`;
    }

    if (vagasTotais > 0 && alunosMatriculados >= vagasTotais) {
      return "A turma está com vagas completas. Novas inscrições só estarão disponíveis quando uma nova turma for aberta.";
    }
  }

  return null;
};

const getAvailableTurmaForEnrollment = (turmas: any[], requireOnlinePermission = true) => {
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
    reason: evaluated[0]?.reason || "Não há turma aberta para este curso para receber inscrições.",
  };
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let checkoutMatriculaId: string | null = null;
  let checkoutReceivableId: string | null = null;
  let paymentCreated = false;

  try {
    const { courseId, alunoId: requestedAlunoId, turmaId } = await req.json();
    if (!courseId) throw new Error("Curso não informado.");

    const authorization = req.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!token) throw new Error("Entre como aluno antes de comprar o curso.");

    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const authEmail = authData?.user?.email ? String(authData.user.email).trim().toLowerCase() : "";
    if (authError || !authEmail) throw new Error("Sessão inválida para checkout.");

    const { data: usuarioSistema, error: usuarioError } = await admin
      .from("usuarios_sistema")
      .select("id, perfil, status, context")
      .ilike("email", authEmail)
      .maybeSingle();
    if (usuarioError) throw usuarioError;
    const gestorContext = usuarioSistema?.context ? String(usuarioSistema.context).trim() : null;
    let gestorPoloId = UUID_RE.test(gestorContext || "") ? gestorContext : null;
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
      usuarioSistema
      && normalize(usuarioSistema.perfil) === "gestor"
      && isActiveStatus(usuarioSistema.status)
    );
    if (requestedAlunoId && isGestorAtivo && !gestorGlobal && !gestorPoloId) {
      throw new Error("Gestor sem polo definido não pode gerar checkout para outro aluno.");
    }

    const { data: course, error } = await admin
      .from("cursos")
      .select("id, nome, modalidade, valor, publicar_site, status, financeiro_config")
      .eq("id", courseId)
      .single();
    if (error) throw error;
    if (!course.publicar_site || course.status !== "ativo") throw new Error("Curso indisponível para matrícula.");
    if (!ONLINE_MODALIDADES.includes(course.modalidade)) throw new Error("Modalidade sem checkout online.");

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
    if (!aluno) throw new Error("Comprador não encontrado. Faça seu cadastro antes de comprar.");
    if (!isGestorAtivo && requestedAlunoId && requestedAlunoId !== aluno.id) {
      throw new Error("Você só pode gerar checkout para o seu próprio cadastro.");
    }
    if (isGestorAtivo && requestedAlunoId && !gestorGlobal) {
      const alunoPoloIds = Array.isArray(aluno.polo_ids) ? aluno.polo_ids.map(String) : [];
      const alunoNoPolo = aluno.polo_id === gestorPoloId || alunoPoloIds.includes(String(gestorPoloId));
      if (!alunoNoPolo) {
        throw new Error("Gestor sem permissão para gerar checkout deste aluno.");
      }
    }

    const cpfCnpj = onlyDigits(aluno.cpf_cnpj);
    if (!cpfCnpj) throw new Error("O aluno precisa ter CPF cadastrado para comprar pelo Asaas.");
    if (cpfCnpj.length === 11 && !isValidCpf(cpfCnpj)) {
      throw new Error("CPF inválido para cobrança. Atualize o cadastro do aluno antes de comprar.");
    }
    const missingBillingFields = missingStudentBillingFields(aluno);
    if (missingBillingFields.length > 0) {
      throw new Error(`Atualize o cadastro do aluno antes de comprar pelo Asaas. Campos obrigatórios: ${missingBillingFields.join(", ")}.`);
    }

    const existingCourseCheckout = await findExistingCourseCheckout(admin, aluno.id, course.id);
    if (existingCourseCheckout?.state === "paid") {
      const existingStatus = normalize(existingCourseCheckout.matricula?.status);
      if (!["ativo", "concluido", "trancado"].includes(existingStatus)) {
        await admin
          .from("matriculas")
          .update({ status: "ATIVO" })
          .eq("id", existingCourseCheckout.matricula.id);
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
      throw new Error("Este aluno já possui uma matrícula aguardando pagamento para este curso. Atualize a tela ou procure a secretaria antes de gerar uma nova cobrança.");
    }

    const requireOnlinePermission = course.modalidade !== "EAD";
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
        matriculas(status)
      `)
      .eq("curso_id", course.id)
      .eq("status", "EM_ANDAMENTO");
    if (turmaId) {
      turmasQuery = turmasQuery.eq("id", turmaId);
    }
    if (isGestorAtivo && requestedAlunoId && !gestorGlobal) {
      turmasQuery = turmasQuery.eq("polo_id", gestorPoloId);
    }
    if (requireOnlinePermission) {
      turmasQuery = turmasQuery.eq("permitir_inscricoes_online", true);
    }
    const { data: turmas, error: turmasError } = await turmasQuery.order("data_inicio", { ascending: true });
    if (turmasError) throw turmasError;
    if (turmaId && (!turmas || turmas.length === 0)) {
      throw new Error("A turma escolhida não está aberta para matrícula online.");
    }
    const availableSelection = getAvailableTurmaForEnrollment(turmas || [], requireOnlinePermission);
    if (!availableSelection.turma) throw new Error(availableSelection.reason || "Não há turma aberta para este curso.");
    const turma = availableSelection.turma;
    const gerarCobrancaFutura = course.modalidade === "EAD"
      ? false
      : turma.gerar_cobrancas_futuras === true;

    const { data: matricula, error: matriculaError } = await admin.rpc("asaas_checkout_upsert_matricula", {
      p_aluno_id: aluno.id,
      p_turma_id: turma.id,
      p_gerar_cobranca_futura: gerarCobrancaFutura,
    });
    if (matriculaError) throw matriculaError;
    if (!matricula?.id) throw new Error("Não foi possível registrar a matrícula para o checkout.");
    checkoutMatriculaId = matricula.id;

    const { data: config, error: configError } = await admin
      .from("asaas_config")
      .select("environment, notifications_enabled, notification_whatsapp_enabled, notification_email_enabled, notification_sms_enabled")
      .maybeSingle();
    if (configError) throw configError;
    const environment = config?.environment === "production" ? "production" : "sandbox";
    const notificationsEnabled = config?.notifications_enabled === true
      || config?.notification_whatsapp_enabled === true
      || config?.notification_email_enabled === true
      || config?.notification_sms_enabled === true;

    const { data: apiKey, error: secretError } = await admin.rpc("asaas_get_secret", {
      p_secret_name: environment === "production" ? "asaas_production_api_key" : "asaas_sandbox_api_key",
    });
    if (secretError) throw secretError;
    if (!apiKey) throw new Error("Integração Asaas ainda não configurada.");

    const baseUrl = environment === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
    const callAsaas = async (path: string, init: RequestInit = {}) => {
      const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Universo-Cursos-Aluno",
          access_token: apiKey,
          ...(init.headers || {}),
        },
      });
      const payload = response.status === 204 ? null : await response.json().catch(() => null);
      if (!response.ok) {
        const message = payload?.errors?.map((item: any) => item.description).join(" ")
          || payload?.message
          || `Erro ${response.status} na API do Asaas.`;
        const error = new Error(message) as Error & { status?: number };
        error.status = response.status;
        throw error;
      }
      return payload;
    };

    const recoverPaymentByReceivableId = async (receivableId: string) => {
      const response = await callAsaas(
        `/payments?externalReference=${encodeURIComponent(receivableId)}&limit=10`,
      ).catch(() => null);
      const recoveredPayment = (response?.data || []).find((item: any) =>
        String(item.externalReference || "") === receivableId
        && !["DELETED", "REFUNDED"].includes(String(item.status || "").toUpperCase())
      );
      if (!recoveredPayment?.id) return null;

      const { data: recoveredReceivable, error: recoveredError } = await admin
        .from("contas_receber")
        .update({
          asaas_payment_id: recoveredPayment.id,
          asaas_payment_link_id: null,
          nosso_numero_asaas: recoveredPayment.id,
          asaas_invoice_url: recoveredPayment.invoiceUrl || null,
          asaas_bank_slip_url: recoveredPayment.bankSlipUrl || null,
          asaas_installment_id: recoveredPayment.installment || recoveredPayment.installmentId || null,
          asaas_transaction_receipt_url: recoveredPayment.transactionReceiptUrl || null,
          asaas_status: recoveredPayment.status || null,
          asaas_synced_at: new Date().toISOString(),
          asaas_last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", receivableId)
        .select()
        .single();
      if (recoveredError) throw recoveredError;
      return {
        receivable: recoveredReceivable,
        payment: recoveredPayment,
      };
    };

    const persistCustomerId = async (customerId: string) => {
      await admin.from("parceiros")
        .update({ asaas_customer_id: customerId, updated_at: new Date().toISOString() })
        .eq("id", aluno.id);
      aluno.asaas_customer_id = customerId;
      return customerId;
    };

    const findOrCreateCustomerByCpf = async () => {
      const found = await callAsaas(`/customers?cpfCnpj=${encodeURIComponent(cpfCnpj)}&limit=1`);
      let customer = found?.data?.[0];
      if (!customer) {
        customer = await callAsaas("/customers", {
          method: "POST",
          body: JSON.stringify({
            name: aluno.nome,
            cpfCnpj,
            email: aluno.email || undefined,
            mobilePhone: aluno.telefone || undefined,
            postalCode: onlyDigits(aluno.cep) || undefined,
            address: aluno.endereco || undefined,
            addressNumber: aluno.numero || undefined,
            complement: aluno.complemento || undefined,
            province: aluno.bairro || undefined,
            externalReference: aluno.id,
            notificationDisabled: !notificationsEnabled,
            groupName: "Alunos Universo",
          }),
        });
      }

      await callAsaas(`/customers/${customer.id}`, {
        method: "PUT",
        body: JSON.stringify({ notificationDisabled: !notificationsEnabled, externalReference: aluno.id }),
      }).catch((updateError) => {
        console.warn("Não foi possível atualizar preferência de notificações do cliente no Asaas:", updateError);
      });

      return persistCustomerId(customer.id);
    };

    const ensureCustomer = async () => {
      if (aluno.asaas_customer_id) {
        try {
          const updatedCustomer = await callAsaas(`/customers/${aluno.asaas_customer_id}`, {
            method: "PUT",
            body: JSON.stringify({
              name: aluno.nome,
              cpfCnpj,
              email: aluno.email || undefined,
              mobilePhone: aluno.telefone || undefined,
              postalCode: onlyDigits(aluno.cep) || undefined,
              address: aluno.endereco || undefined,
              addressNumber: aluno.numero || undefined,
              complement: aluno.complemento || undefined,
              province: aluno.bairro || undefined,
              externalReference: aluno.id,
              notificationDisabled: !notificationsEnabled,
            }),
          });
          if (updatedCustomer?.cpfCnpj && onlyDigits(updatedCustomer.cpfCnpj) !== cpfCnpj) {
            console.warn("Cliente Asaas vinculado possui CPF/CNPJ diferente; será feita busca pelo CPF do aluno.");
            return findOrCreateCustomerByCpf();
          }
          return aluno.asaas_customer_id as string;
        } catch (updateError) {
          console.warn("Não foi possível atualizar cliente Asaas já vinculado; será feita busca por CPF.", updateError);
          return findOrCreateCustomerByCpf();
        }
      }

      return findOrCreateCustomerByCpf();
    };

    let existingReceivable: any = null;

    const clearLocalAsaasPayment = async (receivableId: string, reason: string) => {
      const { data, error } = await admin
        .from("contas_receber")
        .update({
          asaas_payment_id: null,
          asaas_payment_link_id: null,
          nosso_numero_asaas: null,
          asaas_invoice_url: null,
          asaas_bank_slip_url: null,
          asaas_installment_id: null,
          asaas_transaction_receipt_url: null,
          asaas_status: null,
          asaas_synced_at: null,
          asaas_last_error: reason,
          updated_at: new Date().toISOString(),
        })
        .eq("id", receivableId)
        .neq("status", "PAGO")
        .select()
        .single();
      if (error) throw error;
      return data;
    };

    const getReusableExistingPaymentUrl = async (currentReceivable: any) => {
      if (!currentReceivable?.asaas_payment_id) return null;
      const localAsaasStatus = String(currentReceivable.asaas_status || "").toUpperCase();
      if (["DELETED", "REFUNDED", "CANCELLED", "CANCELED"].includes(localAsaasStatus)) {
        existingReceivable = await clearLocalAsaasPayment(currentReceivable.id, "Cobrança Asaas local estava cancelada/deletada; será gerado novo checkout.");
        return null;
      }

      try {
        const remotePayment = await callAsaas(`/payments/${currentReceivable.asaas_payment_id}`);
        const remoteStatus = String(remotePayment?.status || "").toUpperCase();
        if (["DELETED", "REFUNDED", "CANCELLED", "CANCELED"].includes(remoteStatus)) {
          existingReceivable = await clearLocalAsaasPayment(currentReceivable.id, "Cobrança Asaas remota estava cancelada/deletada; será gerado novo checkout.");
          return null;
        }

        const paid = isPaidPayment(remotePayment);
        const { data: refreshedReceivable, error: refreshError } = await admin
          .from("contas_receber")
          .update({
            asaas_payment_id: remotePayment.id || currentReceivable.asaas_payment_id,
            nosso_numero_asaas: remotePayment.id || currentReceivable.nosso_numero_asaas,
            asaas_invoice_url: remotePayment.invoiceUrl || currentReceivable.asaas_invoice_url || null,
            asaas_bank_slip_url: remotePayment.bankSlipUrl || currentReceivable.asaas_bank_slip_url || null,
            asaas_installment_id: remotePayment.installment || remotePayment.installmentId || currentReceivable.asaas_installment_id || null,
            asaas_transaction_receipt_url: remotePayment.transactionReceiptUrl || currentReceivable.asaas_transaction_receipt_url || null,
            asaas_status: remotePayment.status || currentReceivable.asaas_status || null,
            status: paid ? "PAGO" : currentReceivable.status,
            valor_pago: paid ? Number(remotePayment.value || currentReceivable.valor) : currentReceivable.valor_pago,
            data_pagamento: paid ? paymentDate(remotePayment) : currentReceivable.data_pagamento,
            forma_pagamento: paid ? mapBillingType(remotePayment.billingType) : currentReceivable.forma_pagamento,
            origem_pagamento: paid ? "ASAAS" : currentReceivable.origem_pagamento,
            asaas_synced_at: new Date().toISOString(),
            asaas_last_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", currentReceivable.id)
          .select()
          .single();
        if (refreshError) throw refreshError;
        existingReceivable = refreshedReceivable;
        if (paid) {
          await admin.from("matriculas").update({ status: "ATIVO" }).eq("id", matricula.id);
        }
        return refreshedReceivable.asaas_invoice_url || refreshedReceivable.asaas_bank_slip_url || null;
      } catch (paymentLookupError) {
        if ((paymentLookupError as Error & { status?: number })?.status === 404) {
          existingReceivable = await clearLocalAsaasPayment(currentReceivable.id, "Cobrança Asaas não localizada; será gerado novo checkout.");
          return null;
        }
        throw paymentLookupError;
      }
    };

    const { data: existingReceivables, error: existingReceivableError } = await admin
      .from("contas_receber")
      .select("*")
      .eq("matricula_id", matricula.id)
      .eq("categoria", "MENSALIDADE")
      .eq("tipo_lancamento", "MATRICULA")
      .order("created_at", { ascending: false })
      .limit(1);
    if (existingReceivableError) throw existingReceivableError;
    existingReceivable = existingReceivables?.[0] || null;

    if (existingReceivable?.status === "PAGO") {
      await admin.from("matriculas").update({ status: "ATIVO" }).eq("id", matricula.id);
      return json({ url: existingReceivable.asaas_invoice_url || existingReceivable.asaas_bank_slip_url, alreadyPaid: true });
    }

    if (existingReceivable?.asaas_payment_id) {
      const reusableUrl = await getReusableExistingPaymentUrl(existingReceivable);
      if (reusableUrl) return json({ url: reusableUrl });
    }

    if (existingReceivable?.asaas_payment_link_id && !existingReceivable?.asaas_payment_id) {
      const search = await callAsaas(`/payments?externalReference=${encodeURIComponent(existingReceivable.id)}&limit=20`);
      const matchedPayment = (search?.data || []).find(isPaidPayment) || search?.data?.[0] || null;
      if (matchedPayment?.id) {
        const paid = isPaidPayment(matchedPayment);
        const updates = {
          asaas_payment_id: matchedPayment.id,
          asaas_payment_link_id: matchedPayment.paymentLink || existingReceivable.asaas_payment_link_id,
          nosso_numero_asaas: matchedPayment.id,
          asaas_invoice_url: matchedPayment.invoiceUrl || existingReceivable.asaas_invoice_url || null,
          asaas_bank_slip_url: matchedPayment.bankSlipUrl || null,
          asaas_installment_id: matchedPayment.installment || matchedPayment.installmentId || null,
          asaas_transaction_receipt_url: matchedPayment.transactionReceiptUrl || existingReceivable.asaas_transaction_receipt_url || null,
          asaas_status: matchedPayment.status || null,
          status: paid ? "PAGO" : existingReceivable.status,
          valor_pago: paid ? Number(matchedPayment.value || existingReceivable.valor) : existingReceivable.valor_pago,
          data_pagamento: paid ? paymentDate(matchedPayment) : existingReceivable.data_pagamento,
          forma_pagamento: paid ? mapBillingType(matchedPayment.billingType) : existingReceivable.forma_pagamento,
          origem_pagamento: paid ? "ASAAS" : existingReceivable.origem_pagamento,
          asaas_synced_at: new Date().toISOString(),
          asaas_last_error: null,
          updated_at: new Date().toISOString(),
        };
        const { data: reconciledReceivable, error: reconcileError } = await admin
          .from("contas_receber")
          .update(updates)
          .eq("id", existingReceivable.id)
          .select()
          .single();
        if (reconcileError) throw reconcileError;

        const inscriptionPayload = {
          curso_id: course.id,
          turma_id: turma.id,
          aluno_id: aluno.id,
          matricula_id: matricula.id,
          asaas_payment_id: matchedPayment.id,
          asaas_customer_id: matchedPayment.customer || aluno.asaas_customer_id || null,
          asaas_payment_link_id: matchedPayment.paymentLink || existingReceivable.asaas_payment_link_id,
          nome: aluno.nome,
          cpf_cnpj: cpfCnpj || null,
          email: aluno.email || null,
          telefone: aluno.telefone || null,
          valor: Number(matchedPayment.value || course.valor || 0),
          status: paid ? "PAGO" : PENDENTE_INSCRICAO_STATUS,
          pago_em: paid ? new Date().toISOString() : null,
          confirmado_em: paid ? new Date().toISOString() : null,
          forma_pagamento: matchedPayment.billingType || null,
          erro: null,
          updated_at: new Date().toISOString(),
        };
        const { data: pendingInscricoes, error: pendingInscricaoError } = await admin
          .from("inscricoes_online")
          .select("id")
          .eq("matricula_id", matricula.id)
          .order("created_at", { ascending: false })
          .limit(1);
        if (pendingInscricaoError) throw pendingInscricaoError;
        const inscriptionQuery = pendingInscricoes?.[0]
          ? admin.from("inscricoes_online").update(inscriptionPayload).eq("id", pendingInscricoes[0].id)
          : admin.from("inscricoes_online").insert(inscriptionPayload);
        const { error: inscriptionError } = await inscriptionQuery;
        if (inscriptionError) throw inscriptionError;

        if (paid) {
          await admin.from("matriculas").update({ status: "ATIVO" }).eq("id", matricula.id);
          return json({ url: reconciledReceivable.asaas_invoice_url || reconciledReceivable.asaas_bank_slip_url, alreadyPaid: true });
        }

        if (reconciledReceivable.asaas_invoice_url) {
          return json({ url: reconciledReceivable.asaas_invoice_url });
        }
      }
    }

    const dataVencimento = dueDateInDays(7);
    const charge = resolveOnlineCharge(course, turma, dataVencimento);
    const receivablePayload = {
      polo_id: turma.polo_id,
      descricao: charge.description,
      valor: charge.value,
      data_vencimento: dataVencimento,
      status: "PENDENTE",
      cliente_id: aluno.id,
      matricula_id: matricula.id,
      turma_id: turma.id,
      categoria: "MENSALIDADE",
      tipo_lancamento: "MATRICULA",
      origem_cronograma_id: "matricula",
      origem_pagamento: "ASAAS_ONLINE",
      updated_at: new Date().toISOString(),
    };

    const existingIsCreatingWithoutPayment = existingReceivable
      && !existingReceivable.asaas_payment_id
      && String(existingReceivable.asaas_status || "").toUpperCase() === "CREATING";

    let receivable = existingReceivable
      ? existingIsCreatingWithoutPayment
        ? existingReceivable
        : (await admin
          .from("contas_receber")
          .update(receivablePayload)
          .eq("id", existingReceivable.id)
          .neq("status", "PAGO")
          .select()
          .maybeSingle()).data || existingReceivable
      : null;

    if (!receivable) {
      const { data: insertedReceivable, error: insertReceivableError } = await admin
        .from("contas_receber")
        .insert(receivablePayload)
        .select()
        .single();

      if (insertReceivableError) {
        const { data: duplicatedReceivable, error: duplicatedReceivableError } = await admin
          .from("contas_receber")
          .select("*")
          .eq("matricula_id", matricula.id)
          .eq("categoria", "MENSALIDADE")
          .eq("tipo_lancamento", "MATRICULA")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (duplicatedReceivableError || !duplicatedReceivable) throw insertReceivableError;
        receivable = duplicatedReceivable;
      } else {
        receivable = insertedReceivable;
      }
    }
    checkoutReceivableId = receivable?.id || null;

    if (!receivable) throw new Error("Não foi possível registrar a cobrança interna.");
    if (receivable.status === "PAGO") {
      await admin.from("matriculas").update({ status: "ATIVO" }).eq("id", matricula.id);
      return json({ url: receivable.asaas_invoice_url || receivable.asaas_bank_slip_url, alreadyPaid: true });
    }

    const customerId = await ensureCustomer();
    const publicBaseUrl = resolvePublicBaseUrl();
    const successUrl = publicBaseUrl ? `${publicBaseUrl}/aluno?asaas=success` : null;
    const staleCreatingBefore = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: lockedReceivable, error: lockReceivableError } = await admin
      .from("contas_receber")
      .update({
        asaas_status: "CREATING",
        asaas_last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", receivable.id)
      .is("asaas_payment_id", null)
      .or(`asaas_status.is.null,asaas_status.neq.CREATING,updated_at.lt.${staleCreatingBefore}`)
      .select()
      .maybeSingle();
    if (lockReceivableError) throw lockReceivableError;
    if (!lockedReceivable) {
      const { data: inProgressReceivable } = await admin
        .from("contas_receber")
        .select("*")
        .eq("id", receivable.id)
        .maybeSingle();
      if (inProgressReceivable?.asaas_invoice_url) {
        return json({ url: inProgressReceivable.asaas_invoice_url });
      }
      if (String(inProgressReceivable?.asaas_status || "").toUpperCase() === "CREATING") {
        const recovered = await recoverPaymentByReceivableId(receivable.id);
        if (recovered?.receivable?.asaas_invoice_url || recovered?.payment?.invoiceUrl) {
          return json({ url: recovered.receivable.asaas_invoice_url || recovered.payment.invoiceUrl });
        }
      }
      throw new Error("A cobrança já está sendo preparada. Aguarde alguns instantes e tente novamente.");
    }
    receivable = lockedReceivable;

    let payment: any;
    try {
      const recovered = await recoverPaymentByReceivableId(receivable.id);
      if (recovered?.receivable?.asaas_invoice_url || recovered?.payment?.invoiceUrl) {
        return json({ url: recovered.receivable.asaas_invoice_url || recovered.payment.invoiceUrl });
      }

      payment = await callAsaas("/payments", {
        method: "POST",
        body: JSON.stringify(buildOnlinePaymentPayload(customerId, receivable.id, charge, successUrl)),
      });
      paymentCreated = true;
    } catch (paymentError) {
      await admin
        .from("contas_receber")
        .update({
          asaas_status: null,
          asaas_last_error: normalizeErrorMessage(paymentError),
          updated_at: new Date().toISOString(),
        })
        .eq("id", receivable.id);
      throw paymentError;
    }

    const { data: updatedReceivable, error: updateReceivableError } = await admin
      .from("contas_receber")
      .update({
        asaas_payment_id: payment.id,
        asaas_payment_link_id: null,
        nosso_numero_asaas: payment.id,
        asaas_invoice_url: payment.invoiceUrl || null,
        asaas_bank_slip_url: payment.bankSlipUrl || null,
        asaas_installment_id: payment.installment || payment.installmentId || null,
        asaas_transaction_receipt_url: payment.transactionReceiptUrl || null,
        asaas_status: payment.status || null,
        asaas_synced_at: new Date().toISOString(),
        asaas_last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", receivable.id)
      .select()
      .single();
    if (updateReceivableError) throw updateReceivableError;

    const inscricaoPayload = {
      curso_id: course.id,
      turma_id: turma.id,
      aluno_id: aluno.id,
      matricula_id: matricula.id,
      asaas_payment_id: payment.id,
      asaas_customer_id: customerId,
      asaas_payment_link_id: null,
      nome: aluno.nome,
      cpf_cnpj: cpfCnpj || null,
      email: aluno.email || null,
      telefone: aluno.telefone || null,
      valor: charge.value,
      status: PENDENTE_INSCRICAO_STATUS,
      forma_pagamento: mapBillingType(payment.billingType),
      erro: null,
      updated_at: new Date().toISOString(),
    };

    const { data: pendingInscricoes, error: pendingInscricaoError } = await admin
      .from("inscricoes_online")
      .select("id")
      .eq("matricula_id", matricula.id)
      .order("created_at", { ascending: false })
      .limit(1);
    if (pendingInscricaoError) throw pendingInscricaoError;

    if (pendingInscricoes?.[0]) {
      const { error } = await admin
        .from("inscricoes_online")
        .update(inscricaoPayload)
        .eq("id", pendingInscricoes[0].id);
      if (error) throw error;
    } else {
      const { error } = await admin.from("inscricoes_online").insert(inscricaoPayload);
      if (error) throw error;
    }

    return json({ url: updatedReceivable.asaas_invoice_url || payment.invoiceUrl });
  } catch (error) {
    const errorMessage = normalizeErrorMessage(error);
    console.error("Erro ao gerar checkout público:", error);
    if (!paymentCreated && checkoutReceivableId) {
      try {
        await admin
          .from("contas_receber")
          .delete()
          .eq("id", checkoutReceivableId)
          .is("asaas_payment_id", null)
          .is("asaas_invoice_url", null)
          .is("asaas_payment_link_id", null)
          .neq("status", "PAGO");
      } catch (cleanupError) {
        console.warn("Não foi possível limpar cobrança local falha:", cleanupError);
      }
    }
    if (!paymentCreated && checkoutMatriculaId) {
      try {
        await admin
          .from("matriculas")
          .update({ status: "CANCELADO" })
          .eq("id", checkoutMatriculaId)
          .in("status", ["PENDENTE", "AGUARDANDO_PAGAMENTO", "AGUARDANDO_CONFIRMACAO"]);
      } catch (cleanupError) {
        console.warn("Não foi possível cancelar matrícula local falha:", cleanupError);
      }
      try {
        await admin
          .from("inscricoes_online")
          .update({
            status: "CANCELADO",
            erro: "Checkout cancelado automaticamente por falha antes da criação da cobrança Asaas.",
            updated_at: new Date().toISOString(),
          })
          .eq("matricula_id", checkoutMatriculaId)
          .eq("status", PENDENTE_INSCRICAO_STATUS)
          .is("asaas_payment_id", null);
      } catch (cleanupError) {
        console.warn("Não foi possível cancelar inscrição online local falha:", cleanupError);
      }
    }
    return json({ error: errorMessage }, 400);
  }
});
