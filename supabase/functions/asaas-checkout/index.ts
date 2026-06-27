import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

const buildCoursePaymentDescription = (courseName: string) =>
  `${courseName} - Inscricao Online - Universo Cursos e Consultoria`;

const dueDateInDays = (days: number) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const onlyDigits = (value?: string | null) => String(value || "").replace(/\D/g, "");

const normalizeCourseFinanceiroConfig = (config: any = {}) => {
  const metodos = config?.metodosRecebimento || {};
  const cartao = config?.cartao || {};
  const parcelasPadrao = Math.max(1, Number(config?.parcelasPadrao || 1));
  const maxParcelas = cartao?.aceitar
    ? Math.max(parcelasPadrao, Number(cartao?.maxParcelas || parcelasPadrao))
    : 1;

  return {
    metodosRecebimento: {
      pix: metodos.pix !== false,
      boleto: metodos.boleto !== false,
      cartao: metodos.cartao !== false,
    },
    cartao: {
      aceitar: cartao.aceitar !== false,
      maxParcelas,
    },
  };
};

const resolveBillingType = (metodos: { pix: boolean; boleto: boolean; cartao: boolean }) => {
  const metodosAtivos = [
    metodos.pix ? "PIX" : null,
    metodos.boleto ? "BOLETO" : null,
    metodos.cartao ? "CREDIT_CARD" : null,
  ].filter(Boolean);

  if (metodosAtivos.length === 0) {
    throw new Error("Nenhuma forma de recebimento configurada para este curso.");
  }

  return metodosAtivos.length === 1 ? metodosAtivos[0] : "UNDEFINED";
};

const isValidCpf = (value: string) => {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calcDigit = (slice: string, factor: number) => {
    const sum = slice.split("").reduce((total, digit) => total + Number(digit) * factor--, 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calcDigit(cpf.slice(0, 9), 10) === Number(cpf[9])
    && calcDigit(cpf.slice(0, 10), 11) === Number(cpf[10]);
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

const getTurmaUnavailabilityReason = (turma: any) => {
  const today = currentIsoDate();
  const alunosMatriculados = getMatriculasTotal(turma);
  const vagasTotais = Number(turma?.vagas_totais || 0);
  const vagasMinima = Number(turma?.qtd_vagas_minima || 0);
  const bloquearMatriculasAposCompletarVagas = turma?.bloquear_matriculas_apos_completar_vagas !== false;

  const inicioInscricao = toDateString(turma?.data_inicio_inscricao);
  const fimInscricao = toDateString(turma?.data_fim_inscricao);

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

const getAvailableTurmaForEnrollment = (turmas: any[]) => {
  const evaluated = (turmas || []).map((turma) => {
    return {
      turma,
      reason: getTurmaUnavailabilityReason(turma),
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

  try {
    const { courseId, alunoId } = await req.json();
    if (!courseId) throw new Error("Curso não informado.");
    if (!alunoId) throw new Error("Entre como aluno antes de comprar o curso.");

    const { data: course, error } = await admin
      .from("cursos")
      .select("id, nome, modalidade, valor, publicar_site, status, financeiro_config")
      .eq("id", courseId)
      .single();
    if (error) throw error;
    if (!course.publicar_site || course.status !== "ativo") throw new Error("Curso indisponível para matrícula.");
    if (!ONLINE_MODALIDADES.includes(course.modalidade)) throw new Error("Modalidade sem checkout online.");
    if (!course.valor || Number(course.valor) <= 0) throw new Error("Valor do curso ainda não configurado.");

    const { data: aluno, error: alunoError } = await admin
      .from("parceiros")
      .select("*")
      .eq("id", alunoId)
      .in("tipo", ["Aluno", "Professor"])
      .maybeSingle();
    if (alunoError) throw alunoError;
    if (!aluno) throw new Error("Comprador não encontrado. Faça seu cadastro antes de comprar.");

    const cpfCnpj = onlyDigits(aluno.cpf_cnpj);
    if (!cpfCnpj) throw new Error("O aluno precisa ter CPF cadastrado para comprar pelo Asaas.");
    if (cpfCnpj.length === 11 && !isValidCpf(cpfCnpj)) {
      throw new Error("CPF inválido para cobrança. Atualize o cadastro do aluno antes de comprar.");
    }

    const { data: turmas, error: turmasError } = await admin
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
      .eq("status", "EM_ANDAMENTO")
      .order("data_inicio", { ascending: true });
    if (turmasError) throw turmasError;
    const availableSelection = getAvailableTurmaForEnrollment(turmas || []);
    if (!availableSelection.turma) throw new Error(availableSelection.reason || "Não há turma aberta para este curso.");
    const turma = availableSelection.turma;

    let matricula: any = null;
    const { data: existingMatriculas, error: existingMatriculaError } = await admin
      .from("matriculas")
      .select("*")
      .eq("aluno_id", aluno.id)
      .eq("turma_id", turma.id)
      .order("data_matricula", { ascending: false })
      .limit(1);
    if (existingMatriculaError) throw existingMatriculaError;
    const existingMatricula = existingMatriculas?.[0] || null;

    if (existingMatricula) {
      matricula = existingMatricula;
      if (["CANCELADO", "DESISTENTE", "TRANCADO", "VENCIDO"].includes(String(existingMatricula.status))) {
        const { data, error } = await admin
          .from("matriculas")
          .update({ status: "PENDENTE" })
          .eq("id", existingMatricula.id)
          .select()
          .single();
        if (error) throw error;
        matricula = data;
      }
    } else {
      const { data, error } = await admin
        .from("matriculas")
        .insert({
          aluno_id: aluno.id,
          turma_id: turma.id,
          status: "PENDENTE",
        })
        .select()
        .single();
      if (error) throw error;
      matricula = data;
    }

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
        throw new Error(message);
      }
      return payload;
    };

    const ensureCustomer = async () => {
      if (aluno.asaas_customer_id) {
        await callAsaas(`/customers/${aluno.asaas_customer_id}`, {
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
        }).catch((updateError) => {
          console.warn("Não foi possível atualizar cliente Asaas já vinculado, será feita busca por CPF.", updateError);
        });
        return aluno.asaas_customer_id as string;
      }

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

      await admin.from("parceiros")
        .update({ asaas_customer_id: customer.id, updated_at: new Date().toISOString() })
        .eq("id", aluno.id);
      return customer.id as string;
    };

    const { data: existingReceivables, error: existingReceivableError } = await admin
      .from("contas_receber")
      .select("*")
      .eq("matricula_id", matricula.id)
      .eq("categoria", "MENSALIDADE")
      .eq("origem_pagamento", "ASAAS_ONLINE")
      .order("created_at", { ascending: false })
      .limit(1);
    if (existingReceivableError) throw existingReceivableError;
    const existingReceivable = existingReceivables?.[0] || null;

    if (existingReceivable?.status === "PAGO") {
      await admin.from("matriculas").update({ status: "ATIVO" }).eq("id", matricula.id);
      return json({ url: existingReceivable.asaas_invoice_url || existingReceivable.asaas_bank_slip_url, alreadyPaid: true });
    }

    if (existingReceivable?.asaas_invoice_url) {
      return json({ url: existingReceivable.asaas_invoice_url });
    }

    const description = buildCoursePaymentDescription(course.nome);
    const dataVencimento = dueDateInDays(7);
    const receivablePayload = {
      polo_id: turma.polo_id,
      descricao: description,
      valor: Number(course.valor),
      data_vencimento: dataVencimento,
      status: "PENDENTE",
      cliente_id: aluno.id,
      matricula_id: matricula.id,
      turma_id: turma.id,
      categoria: "MENSALIDADE",
      tipo_lancamento: "MATRICULA",
      origem_pagamento: "ASAAS_ONLINE",
      updated_at: new Date().toISOString(),
    };

    const receivable = existingReceivable
      ? (await admin
        .from("contas_receber")
        .update(receivablePayload)
        .eq("id", existingReceivable.id)
        .select()
        .single()).data
      : (await admin
        .from("contas_receber")
        .insert(receivablePayload)
        .select()
        .single()).data;

    if (!receivable) throw new Error("Não foi possível registrar a cobrança interna.");

    const customerId = await ensureCustomer();
    const financeiroConfig = normalizeCourseFinanceiroConfig(course.financeiro_config || {});
    const billingType = resolveBillingType(financeiroConfig.metodosRecebimento);
    const maxInstallmentCount = financeiroConfig.metodosRecebimento.cartao
      && financeiroConfig.cartao.aceitar
      ? financeiroConfig.cartao.maxParcelas
      : 1;

    const paymentLink = await callAsaas("/paymentLinks", {
      method: "POST",
      body: JSON.stringify({
        name: course.nome,
        description,
        value: Number(course.valor),
        billingType,
        chargeType: "DETACHED",
        maxInstallmentCount,
        dueDateLimitDays: 7,
        externalReference: receivable.id,
      }),
    });

    const { data: updatedReceivable, error: updateReceivableError } = await admin
      .from("contas_receber")
      .update({
        asaas_payment_id: null,
        nosso_numero_asaas: paymentLink.id,
        asaas_invoice_url: paymentLink.url || null,
        asaas_bank_slip_url: null,
        asaas_installment_id: null,
        asaas_status: "PAYMENT_LINK_CREATED",
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
      asaas_payment_id: null,
      asaas_customer_id: customerId,
      asaas_payment_link_id: paymentLink.id,
      nome: aluno.nome,
      cpf_cnpj: cpfCnpj || null,
      email: aluno.email || null,
      telefone: aluno.telefone || null,
      valor: Number(course.valor || 0),
      status: PENDENTE_INSCRICAO_STATUS,
      forma_pagamento: null,
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

    return json({ url: updatedReceivable.asaas_invoice_url || paymentLink.url });
  } catch (error) {
    const errorMessage = normalizeErrorMessage(error);
    console.error("Erro ao gerar checkout público:", error);
    return json({ error: errorMessage }, 400);
  }
});
