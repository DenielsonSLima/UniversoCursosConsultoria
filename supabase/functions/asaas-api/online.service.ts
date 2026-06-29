import { callAsaas, type AsaasRuntime } from "./asaas-http.ts";
import {
  ONLINE_MODALIDADES,
  buildCoursePaymentDescription,
} from "./shared.ts";

export const createAsaasOnlineService = (
  admin: any,
  mapBillingType: (billingType?: string | null) => string | null,
) => {
  const blockingEnrollmentStatuses = new Set([
    "ATIVO",
    "CONCLUIDO",
    "PENDENTE",
    "AGUARDANDO_PAGAMENTO",
    "AGUARDANDO_CONFIRMACAO",
  ]);

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
      blockingEnrollmentStatuses.has(String(matricula?.status || "").toUpperCase())
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
    const evaluated = (turmas || []).map((turma) => ({
      turma,
      reason: getTurmaUnavailabilityReason(turma, requireOnlinePermission),
    }));

    const available = evaluated.find((row) => !row.reason);
    if (available) return { turma: available.turma, reason: null };

    return {
      turma: null,
      reason: evaluated[0]?.reason || "Não há turma aberta para este curso para receber inscrições.",
    };
  };

  const reconcileOnlinePayment = async (runtime: AsaasRuntime, body: any) => {
    const courseId = String(body.courseId || "");
    const paymentId = body.paymentId ? String(body.paymentId) : "";
    const forcedAlunoId = body.alunoId ? String(body.alunoId) : "";
    if (!courseId && !paymentId) throw new Error("Informe o curso ou o pagamento Asaas para reconciliar.");

    const { data: course, error: courseError } = await admin
      .from("cursos")
      .select("*")
      .eq("id", courseId)
      .maybeSingle();
    if (courseError) throw courseError;
    if (!course && courseId) throw new Error("Curso não encontrado para reconciliação.");
    if (course && !ONLINE_MODALIDADES.includes(course.modalidade)) {
      throw new Error("A reconciliação online é permitida apenas para EAD, livres e especializações.");
    }

    const paymentsResponse = paymentId
      ? { data: [await callAsaas(runtime, `/payments/${paymentId}`)] }
      : await callAsaas(runtime, `/payments?externalReference=${encodeURIComponent(courseId)}&limit=50`);
    const paidPayments = (paymentsResponse?.data || []).filter((payment: any) =>
      ["RECEIVED", "CONFIRMED"].includes(String(payment.status || "")),
    );

    let reconciled = 0;
    for (const payment of paidPayments) {
      const customer = payment.customer ? await callAsaas(runtime, `/customers/${payment.customer}`) : null;
      const cpfCnpj = String(customer?.cpfCnpj || "").replace(/\D/g, "");

      let aluno: any = null;
      if (forcedAlunoId) {
        const { data, error } = await admin.from("parceiros").select("*").eq("id", forcedAlunoId).maybeSingle();
        if (error) throw error;
        aluno = data;
      }
      if (!aluno && cpfCnpj) {
        const { data, error } = await admin.from("parceiros").select("*").eq("cpf_cnpj", cpfCnpj).maybeSingle();
        if (error) throw error;
        aluno = data;
      }
      if (!aluno && customer?.email) {
        const { data, error } = await admin.from("parceiros").select("*").ilike("email", customer.email).maybeSingle();
        if (error) throw error;
        aluno = data;
      }
      if (!aluno) {
        const { data, error } = await admin.from("parceiros").insert({
          tipo: "Aluno",
          nome: customer?.name || "Aluno Asaas",
          cpf_cnpj: cpfCnpj || null,
          email: customer?.email || null,
          telefone: customer?.mobilePhone || customer?.phone || null,
          cep: customer?.postalCode || null,
          endereco: customer?.address || null,
          numero: customer?.addressNumber || null,
          complemento: customer?.complement || null,
          bairro: customer?.province || null,
          cidade: customer?.cityName || null,
          status: "ATIVO",
          asaas_customer_id: customer?.id || null,
        }).select().single();
        if (error) throw error;
        aluno = data;
      } else if (customer?.id && !aluno.asaas_customer_id) {
        await admin.from("parceiros").update({ asaas_customer_id: customer.id }).eq("id", aluno.id);
      }

      const targetCourse = course || (() => {
        throw new Error("Curso obrigatório para reconciliar pagamento sem link antigo.");
      })();
      const requireOnlinePermission = targetCourse.modalidade !== "EAD";
      let turmasQuery = admin.from("turmas")
        .select(`
          id,
          polo_id,
          vagas_totais,
          permitir_inscricoes_online,
          qtd_vagas_minima,
          bloquear_matriculas_apos_completar_vagas,
          data_inicio_inscricao,
          data_fim_inscricao,
          matriculas(status)
        `)
        .eq("curso_id", targetCourse.id)
        .eq("status", "EM_ANDAMENTO");
      if (requireOnlinePermission) {
        turmasQuery = turmasQuery.eq("permitir_inscricoes_online", true);
      }
      const { data: turmas, error: turmaError } = await turmasQuery.order("data_inicio", { ascending: true });
      if (turmaError) throw turmaError;
      const turmaSelection = getAvailableTurmaForEnrollment(turmas || [], requireOnlinePermission);
      const turma = turmaSelection.turma;
      if (!turma) throw new Error(`Não há turma aberta para ${targetCourse.nome}.`);

      const { data: existingMatricula, error: existingMatriculaError } = await admin.from("matriculas")
        .select("*")
        .eq("aluno_id", aluno.id)
        .eq("turma_id", turma.id)
        .maybeSingle();
      if (existingMatriculaError) throw existingMatriculaError;

      const matricula = existingMatricula
        ? (await admin.from("matriculas").update({ status: "ATIVO" }).eq("id", existingMatricula.id).select().single()).data
        : (await admin.from("matriculas").insert({
          aluno_id: aluno.id,
          turma_id: turma.id,
          status: "ATIVO",
        }).select().single()).data;
      if (!matricula) throw new Error("Não foi possível ativar a matrícula reconciliada.");

      const paidAt = String(payment.paymentDate || payment.clientPaymentDate || payment.confirmedDate || new Date().toISOString()).slice(0, 10);
      const receivablePayload = {
        polo_id: turma.polo_id,
        descricao: buildCoursePaymentDescription(targetCourse.nome),
        valor: Number(payment.value || targetCourse.valor || 0),
        data_vencimento: String(payment.dueDate || paidAt).slice(0, 10),
        data_pagamento: paidAt,
        valor_pago: Number(payment.value || targetCourse.valor || 0),
        status: "PAGO",
        cliente_id: aluno.id,
        matricula_id: matricula.id,
        turma_id: turma.id,
        forma_pagamento: mapBillingType(payment.billingType),
        categoria: "MENSALIDADE",
        tipo_lancamento: "MATRICULA",
        origem_pagamento: "ASAAS",
        asaas_payment_id: payment.id,
        nosso_numero_asaas: payment.id,
        asaas_invoice_url: payment.invoiceUrl || null,
        asaas_bank_slip_url: payment.bankSlipUrl || null,
        asaas_installment_id: payment.installment || payment.installmentId || null,
        asaas_status: payment.status || null,
        asaas_synced_at: new Date().toISOString(),
        asaas_last_error: null,
        updated_at: new Date().toISOString(),
      };
      const { data: existingReceivable, error: existingReceivableError } = await admin
        .from("contas_receber")
        .select("id")
        .eq("asaas_payment_id", payment.id)
        .maybeSingle();
      if (existingReceivableError) throw existingReceivableError;
      const receivableQuery = existingReceivable
        ? admin.from("contas_receber").update(receivablePayload).eq("id", existingReceivable.id)
        : admin.from("contas_receber").insert(receivablePayload);
      const { error: receivableError } = await receivableQuery;
      if (receivableError) throw receivableError;

      const { error: inscricaoError } = await admin.from("inscricoes_online").upsert({
        curso_id: targetCourse.id,
        turma_id: turma.id,
        aluno_id: aluno.id,
        matricula_id: matricula.id,
        asaas_payment_id: payment.id,
        asaas_customer_id: customer?.id || payment.customer || null,
        asaas_payment_link_id: payment.paymentLink || null,
        nome: customer?.name || aluno.nome,
        cpf_cnpj: cpfCnpj || aluno.cpf_cnpj || null,
        email: customer?.email || aluno.email || null,
        telefone: customer?.mobilePhone || customer?.phone || aluno.telefone || null,
        valor: Number(payment.value || targetCourse.valor || 0),
        status: "PAGO",
        pago_em: new Date().toISOString(),
        confirmado_em: new Date().toISOString(),
        forma_pagamento: payment.billingType || null,
        erro: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "asaas_payment_id" });
      if (inscricaoError) throw inscricaoError;

      reconciled += 1;
    }

    return { success: true, reconciled, found: paidPayments.length };
  };

  const createCourseLink = async (runtime: AsaasRuntime, body: any) => {
    const courseId = String(body.courseId);
    const { data: course, error } = await admin
      .from("cursos")
      .select("*")
      .eq("id", courseId)
      .single();
    if (error) throw error;
    if (!["EAD", "LIVRE", "ESPECIALIZACAO", "TECNICO"].includes(course.modalidade)) {
      throw new Error("Links automáticos estão disponíveis apenas para EAD, cursos livres e especializações.");
    }
    if (!course.valor || Number(course.valor) <= 0) throw new Error("Defina o valor do curso antes de gerar o link.");
    const financeiroConfig = course.financeiro_config || {};
    const metodos = financeiroConfig.metodosRecebimento || {};
    const metodosAtivos = [
      metodos.pix ? "PIX" : null,
      metodos.boleto ? "BOLETO" : null,
      metodos.cartao ? "CREDIT_CARD" : null,
    ].filter(Boolean);
    const billingType = metodosAtivos.length === 1 ? metodosAtivos[0] : "UNDEFINED";
    const maxParcelas = financeiroConfig.cartao?.aceitar
      ? Math.max(1, Number(financeiroConfig.cartao?.maxParcelas || financeiroConfig.parcelasPadrao || 1))
      : 1;

    const requireOnlinePermission = course.modalidade !== "EAD";
    let turmasQuery = admin.from("turmas")
      .select(`
        id,
        vagas_totais,
        permitir_inscricoes_online,
        qtd_vagas_minima,
        bloquear_matriculas_apos_completar_vagas,
        data_inicio_inscricao,
        data_fim_inscricao,
        matriculas(status)
      `)
      .eq("curso_id", courseId)
      .eq("status", "EM_ANDAMENTO");
    if (requireOnlinePermission) {
      turmasQuery = turmasQuery.eq("permitir_inscricoes_online", true);
    }
    const { data: turmas, error: turmaError } = await turmasQuery.order("data_inicio", { ascending: true });
    if (turmaError) throw turmaError;
    const turmaSelection = getAvailableTurmaForEnrollment(turmas || [], requireOnlinePermission);
    if (!turmaSelection.turma) throw new Error(turmaSelection.reason || "Abra uma turma para este curso antes de gerar o link.");
    if (!body.recreate && course.asaas_payment_link_id && course.asaas_payment_link_url) {
      return { success: true, url: course.asaas_payment_link_url };
    }

    const link = await callAsaas(runtime, "/paymentLinks", {
      method: "POST",
      body: JSON.stringify({
        name: course.nome,
        description: buildCoursePaymentDescription(course.nome),
        value: Number(course.valor),
        billingType,
        chargeType: "DETACHED",
        maxInstallmentCount: maxParcelas,
        dueDateLimitDays: 7,
        externalReference: course.id,
      }),
    });
    await admin.from("cursos").update({
      asaas_payment_link_id: link.id,
      asaas_payment_link_url: link.url,
      asaas_link_status: "ACTIVE",
      asaas_link_updated_at: new Date().toISOString(),
    }).eq("id", course.id);

    return { success: true, url: link.url };
  };

  return {
    createCourseLink,
    reconcileOnlinePayment,
  };
};
