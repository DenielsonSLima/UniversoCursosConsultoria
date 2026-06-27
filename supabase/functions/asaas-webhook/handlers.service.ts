import {
  ONLINE_MODALIDADES,
  PENDENTE_INSCRICAO_STATUS,
  buildCoursePaymentDescription,
  mapBillingType,
  paymentDate,
} from "./shared.ts";

type CallAsaas = (path: string, init?: RequestInit) => Promise<any>;

export const createAsaasWebhookHandlers = (
  admin: any,
  callAsaas: CallAsaas,
) => {
  const upsertOnlineInscription = async (
    payload: {
      course: any;
      turma: any;
      aluno: any;
      matricula: any;
      customer?: any;
      payment: any;
      isConfirmed: boolean;
    },
  ) => {
    const cpfCnpj = String(payload.customer?.cpfCnpj || payload.aluno?.cpf_cnpj || "").replace(/\D/g, "");
    const status = payload.isConfirmed ? "PAGO" : PENDENTE_INSCRICAO_STATUS;
    const row = {
      curso_id: payload.course.id,
      turma_id: payload.turma.id,
      aluno_id: payload.aluno.id,
      matricula_id: payload.matricula.id,
      asaas_payment_id: payload.payment.id,
      asaas_customer_id: payload.customer?.id || payload.aluno?.asaas_customer_id || payload.payment.customer || null,
      asaas_payment_link_id: payload.payment.paymentLink || null,
      nome: payload.customer?.name || payload.aluno.nome,
      cpf_cnpj: cpfCnpj || null,
      email: payload.customer?.email || payload.aluno.email || null,
      telefone: payload.customer?.mobilePhone || payload.customer?.phone || payload.aluno.telefone || null,
      valor: Number(payload.payment.value || 0),
      status,
      pago_em: payload.isConfirmed ? new Date().toISOString() : null,
      confirmado_em: payload.isConfirmed ? new Date().toISOString() : null,
      forma_pagamento: payload.payment.billingType || null,
      erro: null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await admin.from("inscricoes_online").upsert(row, { onConflict: "asaas_payment_id" });
    if (error) throw error;
  };

  const activateOnlineEnrollmentForReceivable = async (receivable: any, payment: any, localStatus: string | null) => {
    if (localStatus !== "PAGO" || !receivable?.matricula_id) return;

    const { data: matricula, error: matriculaError } = await admin
      .from("matriculas")
      .select("*, turmas(*, cursos(id, nome, modalidade))")
      .eq("id", receivable.matricula_id)
      .maybeSingle();
    if (matriculaError) throw matriculaError;
    const course = matricula?.turmas?.cursos;
    if (!course || !ONLINE_MODALIDADES.includes(course.modalidade)) return;

    const { data: aluno, error: alunoError } = await admin
      .from("parceiros")
      .select("*")
      .eq("id", receivable.cliente_id || matricula.aluno_id)
      .maybeSingle();
    if (alunoError) throw alunoError;
    if (!aluno) throw new Error("Pagamento recebido, mas o aluno vinculado não foi encontrado.");

    const { error: enrollmentError } = await admin
      .from("matriculas")
      .update({ status: "ATIVO" })
      .eq("id", matricula.id);
    if (enrollmentError) throw enrollmentError;

    await upsertOnlineInscription({
      course,
      turma: matricula.turmas,
      aluno,
      matricula,
      payment,
      isConfirmed: true,
    });
  };

  const upsertReceivableFromPaymentLink = async (
    params: {
      course: any;
      turma: any;
      aluno: any;
      matricula: any;
      payment: any;
      isConfirmed: boolean;
    },
  ) => {
    const paid = params.isConfirmed;
    const receivablePayload = {
      polo_id: params.turma.polo_id,
      descricao: buildCoursePaymentDescription(params.course.nome),
      valor: Number(params.payment.value || 0),
      data_vencimento: String(params.payment.dueDate || new Date().toISOString()).slice(0, 10),
      data_pagamento: paid ? paymentDate(params.payment) : null,
      valor_pago: paid ? Number(params.payment.value || 0) : null,
      status: paid ? "PAGO" : "PENDENTE",
      cliente_id: params.aluno.id,
      matricula_id: params.matricula.id,
      turma_id: params.turma.id,
      forma_pagamento: paid ? mapBillingType(params.payment.billingType) : null,
      categoria: "MENSALIDADE",
      tipo_lancamento: "MATRICULA",
      origem_pagamento: paid ? "ASAAS" : "ASAAS_ONLINE",
      asaas_payment_id: params.payment.id,
      nosso_numero_asaas: params.payment.id,
      asaas_invoice_url: params.payment.invoiceUrl || null,
      asaas_bank_slip_url: params.payment.bankSlipUrl || null,
      asaas_installment_id: params.payment.installment || params.payment.installmentId || null,
      asaas_status: params.payment.status || null,
      asaas_synced_at: new Date().toISOString(),
      asaas_last_error: null,
      updated_at: new Date().toISOString(),
    };

    const { data: existing, error: existingError } = await admin
      .from("contas_receber")
      .select("id")
      .eq("asaas_payment_id", params.payment.id)
      .maybeSingle();
    if (existingError) throw existingError;

    const query = existing
      ? admin.from("contas_receber").update(receivablePayload).eq("id", existing.id)
      : admin.from("contas_receber").insert(receivablePayload);
    const { error } = await query;
    if (error) throw error;
  };

  const syncReceivable = async (item: any) => {
    if (item.asaas_payment_id || !item.cliente_id) return;
    const { data: partner, error } = await admin.from("parceiros").select("*").eq("id", item.cliente_id).single();
    if (error) throw error;
    let customerId = partner.asaas_customer_id;
    const cpf = String(partner.cpf_cnpj || "").replace(/\D/g, "");
    if (!customerId) {
      const found = await callAsaas(`/customers?cpfCnpj=${cpf}&limit=1`);
      let customer = found?.data?.[0];
      if (!customer) {
        customer = await callAsaas("/customers", {
          method: "POST",
          body: JSON.stringify({
            name: partner.responsavel_financeiro && partner.responsavel_nome ? partner.responsavel_nome : partner.nome,
            cpfCnpj: partner.responsavel_financeiro && partner.responsavel_cpf
              ? String(partner.responsavel_cpf).replace(/\D/g, "")
              : cpf,
            email: partner.responsavel_financeiro ? partner.responsavel_email || partner.email : partner.email,
            mobilePhone: partner.responsavel_financeiro
              ? partner.responsavel_telefone || partner.telefone
              : partner.telefone,
            externalReference: partner.id,
            notificationDisabled: true,
          }),
        });
      }
      customerId = customer.id;
      await admin.from("parceiros").update({ asaas_customer_id: customerId }).eq("id", partner.id);
    }
    const generated = await callAsaas("/payments", {
      method: "POST",
      body: JSON.stringify({
        customer: customerId,
        billingType: "UNDEFINED",
        value: Number(item.valor),
        dueDate: item.data_vencimento,
        description: item.descricao,
        externalReference: item.id,
        postalService: false,
      }),
    });
    await admin.from("contas_receber").update({
      asaas_payment_id: generated.id,
      nosso_numero_asaas: generated.id,
      asaas_invoice_url: generated.invoiceUrl || null,
      asaas_bank_slip_url: generated.bankSlipUrl || null,
      asaas_installment_id: generated.installment || generated.installmentId || null,
      asaas_status: generated.status,
      asaas_synced_at: new Date().toISOString(),
      asaas_last_error: null,
    }).eq("id", item.id);
  };

  const handleReceivablePayment = async (
    payment: any,
    eventType: string,
    localStatus: string | null,
  ) => {
    let { data: receivable } = await admin.from("contas_receber")
      .select("*")
      .eq("asaas_payment_id", payment.id || "")
      .maybeSingle();

    if (!receivable && payment.externalReference) {
      const { data: referencedReceivable, error: referencedReceivableError } = await admin
        .from("contas_receber")
        .select("*")
        .eq("id", payment.externalReference)
        .maybeSingle();
      if (referencedReceivableError) throw referencedReceivableError;
      receivable = referencedReceivable;
    }

    if (!receivable) return;

    const updates: Record<string, unknown> = {
      asaas_payment_id: payment.id || receivable.asaas_payment_id,
      nosso_numero_asaas: payment.id || receivable.nosso_numero_asaas,
      asaas_status: payment.status || eventType.replace("PAYMENT_", ""),
      asaas_invoice_url: payment.invoiceUrl || receivable.asaas_invoice_url,
      asaas_bank_slip_url: payment.bankSlipUrl || receivable.asaas_bank_slip_url,
      asaas_installment_id: payment.installment || payment.installmentId || receivable.asaas_installment_id,
      updated_at: new Date().toISOString(),
    };
    if (localStatus && localStatus !== "AGUARDANDO_CONFIRMACAO") updates.status = localStatus;
    if (localStatus === "PAGO") {
      updates.valor_pago = Number(payment.value || receivable.valor);
      updates.data_pagamento = String(payment.paymentDate || payment.confirmedDate || new Date().toISOString()).slice(0, 10);
      updates.forma_pagamento = payment.billingType === "CREDIT_CARD" ? "CARTAO" : payment.billingType;
      updates.origem_pagamento = "ASAAS";
    }
    if (eventType === "PAYMENT_OVERDUE" && localStatus === "VENCIDO") {
      updates.status = "VENCIDO";
    }
    const { error } = await admin.from("contas_receber").update(updates).eq("id", receivable.id);
    if (error) throw error;

    await activateOnlineEnrollmentForReceivable(receivable, payment, localStatus);

    if (receivable.matricula_id && localStatus === "PAGO") {
      const { data: installments, error: installmentsError } = await admin
        .from("contas_receber")
        .select("*")
        .eq("matricula_id", receivable.matricula_id)
        .in("status", ["PENDENTE", "VENCIDO"])
        .is("asaas_payment_id", null)
        .neq("tipo_lancamento", "MATRICULA")
        .order("data_vencimento");
      if (installmentsError) throw installmentsError;
      for (const installment of installments || []) await syncReceivable(installment);
    }
  };

  const handlePaymentLinkPayment = async (
    payment: any,
    eventType: string,
    localStatus: string | null,
    isPaymentConfirmed: boolean,
  ) => {
    if (!["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"].includes(eventType) || !payment.paymentLink) return;

    const isConfirmed = localStatus === "PAGO" || isPaymentConfirmed || eventType === "PAYMENT_CONFIRMED";
    const { data: course, error: courseError } = await admin.from("cursos")
      .select("id, nome, modalidade")
      .eq("asaas_payment_link_id", payment.paymentLink)
      .maybeSingle();
    if (courseError) throw courseError;
    if (!course) return;

    const customer = await callAsaas(`/customers/${payment.customer}`);
    const cpfCnpj = String(customer.cpfCnpj || "").replace(/\D/g, "");
    let aluno: any = null;
    if (cpfCnpj) {
      const { data } = await admin.from("parceiros")
        .select("*")
        .eq("cpf_cnpj", cpfCnpj)
        .maybeSingle();
      aluno = data;
    }
    if (!aluno) {
      const { data, error } = await admin.from("parceiros").insert({
        tipo: "Aluno",
        nome: customer.name,
        cpf_cnpj: cpfCnpj || null,
        email: customer.email || null,
        telefone: customer.mobilePhone || customer.phone || null,
        cep: customer.postalCode || null,
        endereco: customer.address || null,
        numero: customer.addressNumber || null,
        complemento: customer.complement || null,
        bairro: customer.province || null,
        cidade: customer.cityName || null,
        status: "ATIVO",
        asaas_customer_id: customer.id,
      }).select().single();
      if (error) throw error;
      aluno = data;
    } else if (!aluno.asaas_customer_id) {
      await admin.from("parceiros").update({ asaas_customer_id: customer.id }).eq("id", aluno.id);
    }

    const { data: turma, error: turmaError } = await admin.from("turmas")
      .select("id, polo_id")
      .eq("curso_id", course.id)
      .eq("status", "EM_ANDAMENTO")
      .limit(1)
      .maybeSingle();
    if (turmaError) throw turmaError;
    if (!turma) throw new Error("Pagamento recebido, mas não há turma aberta para matrícula.");

    const { data: existing } = await admin.from("matriculas")
      .select("*")
      .eq("aluno_id", aluno.id)
      .eq("turma_id", turma.id)
      .maybeSingle();
    let matricula: any = existing;
    if (!matricula) {
      const { data, error } = await admin.from("matriculas").insert({
        aluno_id: aluno.id,
        turma_id: turma.id,
        status: "PENDENTE",
      }).select().single();
      if (error) throw error;
      matricula = data;
    }

    if (isConfirmed) {
      const { error } = await admin.from("matriculas").update({ status: "ATIVO" }).eq("id", matricula.id);
      if (error) throw error;
    }

    await upsertReceivableFromPaymentLink({ course, turma, aluno, matricula, payment, isConfirmed });
    await upsertOnlineInscription({ course, turma, aluno, matricula, customer, payment, isConfirmed });
  };

  return {
    handlePaymentLinkPayment,
    handleReceivablePayment,
  };
};
