import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type BillingMethod = "PIX" | "BOLETO";
type Environment = "sandbox" | "production";

const PENDENTE_INSCRICAO_STATUS = "AGUARDANDO_PAGAMENTO";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const rateLimitStore = new Map<string, number[]>();

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });

const buildCorsHeaders = (req: Request) => {
  const origin = req.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
};

const getClientIp = (req: Request) =>
  req.headers.get("cf-connecting-ip")
  || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  || "unknown";

const isRateLimited = (key: string, maxRequests: number, windowMs: number) => {
  const now = Date.now();
  const recent = (rateLimitStore.get(key) || []).filter((timestamp) => now - timestamp < windowMs);
  recent.push(now);
  rateLimitStore.set(key, recent);
  return recent.length > maxRequests;
};

const onlyDigits = (value: unknown) => String(value || "").replace(/\D/g, "");

const normalizeMethod = (value: unknown): BillingMethod => {
  const method = String(value || "").trim().toUpperCase();
  if (method === "PIX" || method === "BOLETO") return method;
  throw new Error("Escolha Pix ou boleto para pagamento EAD dentro da plataforma.");
};

const toDateString = (value: unknown) => {
  const date = String(value || "");
  return date.length >= 10 ? date.slice(0, 10) : null;
};

const dueDateInDays = (days: number) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const normalizeErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message || "Erro interno.";
  if (typeof error === "string") return error;
  const typed = error as Record<string, unknown>;
  const message = typed?.message ? String(typed.message) : "";
  return message || "Erro interno.";
};

const baseUrlFor = (environment: Environment) =>
  environment === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";

const buildDescription = (courseName: string) =>
  `${courseName} - Inscricao Online - Universo Cursos e Consultoria`;

const isPaidAsaasStatus = (status: unknown) =>
  ["RECEIVED", "CONFIRMED"].includes(String(status || "").toUpperCase());

const isCanceledAsaasStatus = (status: unknown) =>
  ["DELETED", "REFUNDED", "CANCELLED", "CANCELED"].includes(String(status || "").toUpperCase());

const getAvailableTurma = (turmas: any[]) => {
  const today = new Date().toISOString().slice(0, 10);

  for (const turma of turmas || []) {
    const inicio = toDateString(turma?.data_inicio_inscricao);
    const fim = toDateString(turma?.data_fim_inscricao);
    if (inicio && today < inicio) continue;
    if (fim && today > fim) continue;

    const matriculas = Array.isArray(turma?.matriculas) ? turma.matriculas : [];
    const blockedStatuses = new Set(["ATIVO", "CONCLUIDO", "PENDENTE", "AGUARDANDO_PAGAMENTO", "AGUARDANDO_CONFIRMACAO"]);
    const matriculados = matriculas.filter((matricula: any) =>
      blockedStatuses.has(String(matricula?.status || "").toUpperCase())
    ).length;

    const min = Number(turma?.qtd_vagas_minima || 0);
    const max = Number(turma?.vagas_totais || 0);
    const shouldBlock = turma?.bloquear_matriculas_apos_completar_vagas !== false;
    if (shouldBlock && min > 0 && matriculados >= min) continue;
    if (shouldBlock && max > 0 && matriculados >= max) continue;

    return turma;
  }

  return null;
};

const assertAllowedPaymentMethod = (course: any, method: BillingMethod) => {
  const config = course?.financeiro_config || {};
  const methods = config?.metodosRecebimento || {};
  if (method === "PIX" && methods.pix === false) {
    throw new Error("Este curso EAD nao permite pagamento por Pix.");
  }
  if (method === "BOLETO" && methods.boleto === false) {
    throw new Error("Este curso EAD nao permite pagamento por boleto.");
  }
};

const insertAuditEvent = async (
  admin: any,
  input: {
    actor?: any;
    pessoa?: any;
    poloId?: string | null;
    entidade: string;
    entidadeId?: string | null;
    acao: string;
    descricao: string;
    detalhes?: Record<string, unknown>;
  },
) => {
  const actor = input.actor || input.pessoa || null;
  const pessoa = input.pessoa || input.actor || null;
  const { error } = await admin.from("sistema_eventos").insert({
    actor_id: actor?.id || null,
    actor_nome: actor?.nome || null,
    actor_email: actor?.email || null,
    actor_tipo: actor ? "Aluno" : "Sistema",
    pessoa_id: pessoa?.id || null,
    pessoa_nome: pessoa?.nome || null,
    pessoa_tipo: pessoa ? "Aluno" : null,
    polo_id: input.poloId || null,
    modulo: "EAD",
    entidade: input.entidade,
    entidade_id: input.entidadeId || null,
    acao: input.acao,
    descricao: input.descricao,
    origem: "Asaas EAD",
    detalhes: input.detalhes || {},
  });
  if (error) console.warn("Nao foi possivel registrar evento EAD/Asaas:", error);
};

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405, corsHeaders);

  if (isRateLimited(`asaas-ead-checkout:${getClientIp(req)}`, 30, 60000)) {
    return json({ error: "Muitas tentativas de pagamento em curto intervalo. Tente novamente em alguns segundos." }, 429, corsHeaders);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let aluno: any = null;
  let course: any = null;
  let turma: any = null;
  let matricula: any = null;
  let receivable: any = null;
  let method: BillingMethod | null = null;

  try {
    const body = await req.json();
    const courseId = String(body.courseId || "");
    const alunoId = String(body.alunoId || "");
    const turmaId = body.turmaId ? String(body.turmaId) : null;
    method = normalizeMethod(body.method || body.eadPaymentMethod || body.billingType);

    if (!UUID_RE.test(courseId)) throw new Error("Curso EAD inválido.");
    if (!UUID_RE.test(alunoId)) throw new Error("Aluno inválido para pagamento EAD.");
    if (turmaId && !UUID_RE.test(turmaId)) throw new Error("Turma EAD inválida.");

    const authorization = req.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!token) throw new Error("Entre como aluno antes de comprar o curso EAD.");

    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const authEmail = String(authData?.user?.email || "").trim().toLowerCase();
    if (authError || !authEmail) throw new Error("Sessão inválida para pagamento EAD.");

    const { data: alunoRow, error: alunoError } = await admin
      .from("parceiros")
      .select("*")
      .eq("id", alunoId)
      .maybeSingle();
    if (alunoError) throw alunoError;
    aluno = alunoRow;
    if (!aluno || String(aluno.tipo || "").toUpperCase() !== "ALUNO") {
      throw new Error("Cadastro de aluno não localizado para pagamento EAD.");
    }
    if (String(aluno.email || "").trim().toLowerCase() !== authEmail) {
      throw new Error("Você só pode gerar cobrança EAD para o seu próprio cadastro.");
    }

    const { data: courseRow, error: courseError } = await admin
      .from("cursos")
      .select("id, nome, modalidade, valor, publicar_site, status, financeiro_config")
      .eq("id", courseId)
      .maybeSingle();
    if (courseError) throw courseError;
    course = courseRow;
    if (!course || String(course.modalidade || "").toUpperCase() !== "EAD") {
      throw new Error("Esta cobrança é exclusiva para cursos EAD.");
    }
    if (course.publicar_site !== true || String(course.status || "").toLowerCase() !== "ativo") {
      throw new Error("Curso EAD indisponível para matrícula online.");
    }
    assertAllowedPaymentMethod(course, method);

    const value = Math.round((Number(course.valor || 0) + Number.EPSILON) * 100) / 100;
    if (!value || value <= 0) throw new Error("Valor do curso EAD ainda nao configurado.");

    const cpfCnpj = onlyDigits(aluno.cpf_cnpj);
    if (!cpfCnpj) throw new Error("O aluno precisa ter CPF cadastrado para pagar pelo Asaas.");

    let turmasQuery = admin
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
    const { data: turmas, error: turmasError } = await turmasQuery.order("data_inicio", { ascending: true });
    if (turmasError) throw turmasError;
    turma = getAvailableTurma(turmas || []);
    if (!turma) throw new Error("Não há turma EAD aberta para este curso no momento.");

    const { data: matriculaRow, error: matriculaError } = await admin.rpc("asaas_checkout_upsert_matricula", {
      p_aluno_id: aluno.id,
      p_turma_id: turma.id,
      p_gerar_cobranca_futura: false,
    });
    if (matriculaError) throw matriculaError;
    matricula = matriculaRow;
    if (!matricula?.id) throw new Error("Não foi possível registrar a matrícula EAD.");

    const { data: config, error: configError } = await admin
      .from("asaas_config")
      .select("environment, notifications_enabled, notification_whatsapp_enabled, notification_email_enabled, notification_sms_enabled")
      .maybeSingle();
    if (configError) throw configError;
    const environment: Environment = config?.environment === "production" ? "production" : "sandbox";
    const notificationsEnabled = config?.notifications_enabled === true
      || config?.notification_whatsapp_enabled === true
      || config?.notification_email_enabled === true
      || config?.notification_sms_enabled === true;

    const { data: apiKey, error: secretError } = await admin.rpc("asaas_get_secret", {
      p_secret_name: environment === "production" ? "asaas_production_api_key" : "asaas_sandbox_api_key",
    });
    if (secretError) throw secretError;
    if (!apiKey) throw new Error("Integração Asaas ainda não configurada.");

    const baseUrl = baseUrlFor(environment);
    const callAsaas = async (path: string, init: RequestInit = {}) => {
      const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Universo-Cursos-EAD",
          access_token: apiKey,
          ...(init.headers || {}),
        },
      });
      const payload = response.status === 204 ? null : await response.json().catch(() => null);
      if (!response.ok) {
        const message = payload?.errors?.map((item: any) => item.description).join(" ")
          || payload?.message
          || `Erro ${response.status} na API do Asaas.`;
        const asaasError = new Error(message) as Error & { status?: number };
        asaasError.status = response.status;
        throw asaasError;
      }
      return payload;
    };

    const persistCustomerId = async (customerId: string) => {
      await admin.from("parceiros")
        .update({ asaas_customer_id: customerId, updated_at: new Date().toISOString() })
        .eq("id", aluno.id);
      aluno.asaas_customer_id = customerId;
      return customerId;
    };

    const findOrCreateCustomer = async () => {
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
            groupName: "Alunos Universo EAD",
          }),
        });
      }

      await callAsaas(`/customers/${customer.id}`, {
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
      }).catch((updateError) => console.warn("Cliente Asaas EAD nao atualizado:", updateError));

      return persistCustomerId(customer.id);
    };

    const ensureCustomer = async () => {
      if (!aluno.asaas_customer_id) return findOrCreateCustomer();
      try {
        const customer = await callAsaas(`/customers/${aluno.asaas_customer_id}`);
        if (onlyDigits(customer?.cpfCnpj) !== cpfCnpj) return findOrCreateCustomer();
        return aluno.asaas_customer_id as string;
      } catch {
        return findOrCreateCustomer();
      }
    };

    const getPixQrCode = async (paymentId: string) => {
      const qrCode = await callAsaas(`/payments/${paymentId}/pixQrCode`);
      return {
        encodedImage: qrCode?.encodedImage || null,
        payload: qrCode?.payload || null,
        expirationDate: qrCode?.expirationDate || null,
      };
    };

    const buildPaymentResponse = async (payment: any, currentReceivable: any, flags: Record<string, unknown> = {}) => {
      const billingType = String(payment?.billingType || method || "").toUpperCase();
      const bankSlipUrl = payment?.bankSlipUrl || currentReceivable?.asaas_bank_slip_url || null;
      const invoiceUrl = payment?.invoiceUrl || currentReceivable?.asaas_invoice_url || bankSlipUrl || null;
      const pixQrCode = billingType === "PIX" && payment?.id ? await getPixQrCode(payment.id) : null;
      return {
        url: invoiceUrl,
        matriculaId: matricula.id,
        receivableId: currentReceivable.id,
        ...flags,
        payment: {
          id: payment?.id || currentReceivable?.asaas_payment_id || null,
          method: billingType,
          status: payment?.status || currentReceivable?.asaas_status || null,
          value: Number(payment?.value || currentReceivable?.valor || value),
          dueDate: toDateString(payment?.dueDate || currentReceivable?.data_vencimento),
          invoiceUrl,
          bankSlipUrl,
          pixQrCode,
        },
      };
    };

    await insertAuditEvent(admin, {
      actor: aluno,
      pessoa: aluno,
      poloId: turma.polo_id,
      entidade: "cursos",
      entidadeId: course.id,
      acao: "Checkout aberto",
      descricao: `Aluno abriu checkout EAD de ${method === "PIX" ? "Pix" : "boleto"} para ${course.nome}.`,
      detalhes: { cursoId: course.id, turmaId: turma.id, billingType: method },
    });

    const dataVencimento = dueDateInDays(7);
    const { data: existingReceivables, error: existingReceivableError } = await admin
      .from("contas_receber")
      .select("*")
      .eq("matricula_id", matricula.id)
      .eq("categoria", "MENSALIDADE")
      .eq("tipo_lancamento", "MATRICULA")
      .order("created_at", { ascending: false })
      .limit(1);
    if (existingReceivableError) throw existingReceivableError;
    receivable = existingReceivables?.[0] || null;

    if (String(receivable?.status || "").toUpperCase() === "PAGO") {
      return json(await buildPaymentResponse(null, receivable, {
        alreadyPaid: true,
      }), 200, corsHeaders);
    }

    if (receivable?.asaas_payment_id) {
      const remotePayment = await callAsaas(`/payments/${receivable.asaas_payment_id}`);
      const remoteStatus = String(remotePayment?.status || "").toUpperCase();
      if (isPaidAsaasStatus(remoteStatus)) {
        await admin.from("contas_receber").update({
          asaas_status: remotePayment.status || receivable.asaas_status,
          asaas_transaction_receipt_url: remotePayment.transactionReceiptUrl || receivable.asaas_transaction_receipt_url || null,
          asaas_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", receivable.id);
        return json(await buildPaymentResponse(remotePayment, receivable, {
          alreadyPaid: true,
          awaitingWebhook: true,
        }), 200, corsHeaders);
      }

      if (isCanceledAsaasStatus(remoteStatus)) {
        await admin.from("contas_receber").update({
          asaas_payment_id: null,
          asaas_payment_link_id: null,
          nosso_numero_asaas: null,
          asaas_invoice_url: null,
          asaas_bank_slip_url: null,
          asaas_installment_id: null,
          asaas_transaction_receipt_url: null,
          asaas_status: null,
          asaas_last_error: "Cobrança EAD anterior cancelada no Asaas; será gerada uma nova.",
          updated_at: new Date().toISOString(),
        }).eq("id", receivable.id);
        receivable.asaas_payment_id = null;
      } else if (String(remotePayment?.billingType || "").toUpperCase() === method) {
        await admin.from("contas_receber").update({
          asaas_invoice_url: remotePayment.invoiceUrl || receivable.asaas_invoice_url || null,
          asaas_bank_slip_url: remotePayment.bankSlipUrl || receivable.asaas_bank_slip_url || null,
          asaas_status: remotePayment.status || receivable.asaas_status || null,
          asaas_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", receivable.id);
        return json(await buildPaymentResponse(remotePayment, receivable, { alreadyPending: true }), 200, corsHeaders);
      } else {
        await fetch(`${baseUrl}/payments/${receivable.asaas_payment_id}`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Universo-Cursos-EAD",
            access_token: apiKey,
          },
        }).catch(() => null);
        await admin.from("contas_receber").update({
          asaas_payment_id: null,
          asaas_payment_link_id: null,
          nosso_numero_asaas: null,
          asaas_invoice_url: null,
          asaas_bank_slip_url: null,
          asaas_installment_id: null,
          asaas_transaction_receipt_url: null,
          asaas_status: null,
          asaas_last_error: "Cobrança EAD anterior trocada por outra forma de pagamento.",
          updated_at: new Date().toISOString(),
        }).eq("id", receivable.id);
        receivable.asaas_payment_id = null;
      }
    }

    const receivablePayload = {
      polo_id: turma.polo_id,
      descricao: buildDescription(course.nome),
      valor: value,
      data_vencimento: dataVencimento,
      status: "PENDENTE",
      cliente_id: aluno.id,
      matricula_id: matricula.id,
      turma_id: turma.id,
      forma_pagamento: method,
      categoria: "MENSALIDADE",
      tipo_lancamento: "MATRICULA",
      origem_cronograma_id: "matricula",
      origem_pagamento: "ASAAS_EAD",
      updated_at: new Date().toISOString(),
    };

    if (receivable?.id) {
      const { data: updatedReceivable, error: updateReceivableError } = await admin
        .from("contas_receber")
        .update(receivablePayload)
        .eq("id", receivable.id)
        .neq("status", "PAGO")
        .select()
        .maybeSingle();
      if (updateReceivableError) throw updateReceivableError;
      receivable = updatedReceivable || receivable;
    } else {
      const { data: insertedReceivable, error: insertReceivableError } = await admin
        .from("contas_receber")
        .insert(receivablePayload)
        .select()
        .single();
      if (insertReceivableError) throw insertReceivableError;
      receivable = insertedReceivable;
    }
    if (!receivable?.id) throw new Error("Não foi possível registrar a cobrança EAD.");

    const staleCreatingBefore = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: lockedReceivable, error: lockError } = await admin
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
    if (lockError) throw lockError;
    if (!lockedReceivable) {
      throw new Error("A cobrança EAD já está sendo preparada. Aguarde alguns instantes e tente novamente.");
    }
    receivable = lockedReceivable;

    const customerId = await ensureCustomer();
    let payment: any = null;
    try {
      payment = await callAsaas("/payments", {
        method: "POST",
        body: JSON.stringify({
          customer: customerId,
          billingType: method,
          value,
          dueDate: dataVencimento,
          description: buildDescription(course.nome),
          externalReference: receivable.id,
          postalService: false,
          daysAfterDueDateToRegistrationCancellation: 0,
        }),
      });
    } catch (paymentError) {
      await admin.from("contas_receber").update({
        asaas_status: null,
        asaas_last_error: normalizeErrorMessage(paymentError),
        updated_at: new Date().toISOString(),
      }).eq("id", receivable.id);
      await insertAuditEvent(admin, {
        actor: aluno,
        pessoa: aluno,
        poloId: turma.polo_id,
        entidade: "contas_receber",
        entidadeId: receivable.id,
        acao: "Falha de pagamento",
        descricao: `Falha ao gerar cobrança EAD de ${method === "PIX" ? "Pix" : "boleto"} para ${course.nome}.`,
        detalhes: { cursoId: course.id, turmaId: turma.id, billingType: method, motivo: normalizeErrorMessage(paymentError) },
      });
      throw paymentError;
    }

    const { data: updatedReceivable, error: updatePaymentError } = await admin
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
    if (updatePaymentError) throw updatePaymentError;
    receivable = updatedReceivable;

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
      valor: value,
      status: PENDENTE_INSCRICAO_STATUS,
      forma_pagamento: method,
      erro: null,
      updated_at: new Date().toISOString(),
    };
    const { data: existingInscricoes, error: inscricaoLookupError } = await admin
      .from("inscricoes_online")
      .select("id")
      .eq("matricula_id", matricula.id)
      .order("created_at", { ascending: false })
      .limit(1);
    if (inscricaoLookupError) throw inscricaoLookupError;
    const inscricaoQuery = existingInscricoes?.[0]?.id
      ? admin.from("inscricoes_online").update(inscricaoPayload).eq("id", existingInscricoes[0].id)
      : admin.from("inscricoes_online").insert(inscricaoPayload);
    const { error: inscricaoError } = await inscricaoQuery;
    if (inscricaoError) throw inscricaoError;

    await insertAuditEvent(admin, {
      actor: aluno,
      pessoa: aluno,
      poloId: turma.polo_id,
      entidade: "contas_receber",
      entidadeId: receivable.id,
      acao: "Cobrança criada",
      descricao: `Cobrança EAD de ${method === "PIX" ? "Pix" : "boleto"} criada no Asaas para ${course.nome}.`,
      detalhes: { cursoId: course.id, turmaId: turma.id, billingType: method, asaasPaymentId: payment.id },
    });

    if (method === "BOLETO") {
      await insertAuditEvent(admin, {
        actor: aluno,
        pessoa: aluno,
        poloId: turma.polo_id,
        entidade: "contas_receber",
        entidadeId: receivable.id,
        acao: "Boleto gerado",
        descricao: `Boleto EAD gerado para ${course.nome}.`,
        detalhes: { cursoId: course.id, turmaId: turma.id, asaasPaymentId: payment.id },
      });
    }

    return json(await buildPaymentResponse(payment, receivable), 200, corsHeaders);
  } catch (error) {
    const message = normalizeErrorMessage(error);
    console.error("Erro no checkout EAD Asaas:", error);
    if (aluno && course && method) {
      await insertAuditEvent(admin, {
        actor: aluno,
        pessoa: aluno,
        poloId: turma?.polo_id || null,
        entidade: receivable?.id ? "contas_receber" : "cursos",
        entidadeId: receivable?.id || course.id,
        acao: "Falha de pagamento",
        descricao: `Falha no fluxo EAD/Asaas de ${method === "PIX" ? "Pix" : "boleto"} para ${course.nome}.`,
        detalhes: { cursoId: course.id, turmaId: turma?.id || null, matriculaId: matricula?.id || null, billingType: method, motivo: message },
      });
    }
    return json({ error: message }, 400, corsHeaders);
  }
});
