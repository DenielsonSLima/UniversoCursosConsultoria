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
  const isUnsafeCallbackHost = (hostname: string) => {
    const host = hostname.toLowerCase();
    if (host === "localhost" || host === "0.0.0.0" || host === "::1" || host.endsWith(".local")) return true;
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
    const private172 = host.match(/^172\.(\d+)\./);
    return Boolean(private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31);
  };

  const callbackSuccessUrl = () => {
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
          return `${url.origin.replace(/\/+$/, "")}/aluno?asaas=success`;
        }
      } catch {
        // Try the next configured source.
      }
    }
    return "https://universocc.com.br/aluno?asaas=success";
  };

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

    let existing: any = null;
    if (row.asaas_payment_id) {
      const { data, error } = await admin
        .from("inscricoes_online")
        .select("id")
        .eq("asaas_payment_id", row.asaas_payment_id)
        .maybeSingle();
      if (error) throw error;
      existing = data;
    }

    if (!existing?.id && row.matricula_id) {
      const { data, error } = await admin
        .from("inscricoes_online")
        .select("id")
        .eq("matricula_id", row.matricula_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      existing = data;
    }

    const query = existing?.id
      ? admin.from("inscricoes_online").update(row).eq("id", existing.id)
      : admin.from("inscricoes_online").insert(row);
    const { error } = await query;
    if (error) throw error;
  };

  const activateOnlineEnrollmentForReceivable = async (receivable: any, payment: any, localStatus: string | null) => {
    if (localStatus !== "PAGO" || !receivable?.matricula_id) return;
    if (String(receivable?.tipo_lancamento || "").toUpperCase() !== "MATRICULA") return;

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

  const cancelPendingOnlineEnrollmentForReceivable = async (receivable: any, eventType: string, localStatus: string | null) => {
    if (!["VENCIDO", "CANCELADO"].includes(String(localStatus || "").toUpperCase())) return;
    if (!receivable?.matricula_id) return;
    if (String(receivable?.tipo_lancamento || "").toUpperCase() !== "MATRICULA") return;

    const { data: matricula, error: matriculaError } = await admin
      .from("matriculas")
      .select("id, status, turmas(cursos(id, modalidade))")
      .eq("id", receivable.matricula_id)
      .maybeSingle();
    if (matriculaError) throw matriculaError;
    const course = matricula?.turmas?.cursos;
    if (!course || !ONLINE_MODALIDADES.includes(course.modalidade)) return;
    const isEadCourse = String(course.modalidade || "").toUpperCase() === "EAD";

    const { data: paidReceivable, error: paidError } = await admin
      .from("contas_receber")
      .select("id")
      .eq("matricula_id", receivable.matricula_id)
      .eq("status", "PAGO")
      .limit(1)
      .maybeSingle();
    if (paidError) throw paidError;
    if (paidReceivable?.id) return;

    const reason = eventType === "PAYMENT_DELETED"
      ? "Checkout cancelado: cobrança removida no Asaas."
      : "Checkout cancelado: cobrança vencida no Asaas.";

    const { error: enrollmentError } = await admin
      .from("matriculas")
      .update({ status: "CANCELADO" })
      .eq("id", receivable.matricula_id)
      .in("status", ["PENDENTE", "AGUARDANDO_PAGAMENTO", "AGUARDANDO_CONFIRMACAO"]);
    if (enrollmentError) throw enrollmentError;

    const { error: inscriptionError } = await admin
      .from("inscricoes_online")
      .update({
        status: "CANCELADO",
        erro: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("matricula_id", receivable.matricula_id)
      .eq("status", PENDENTE_INSCRICAO_STATUS);
    if (inscriptionError) throw inscriptionError;

    if (isEadCourse) {
      const { error: receivableError } = await admin
        .from("contas_receber")
        .update({
          status: "CANCELADO",
          asaas_last_error: reason,
          updated_at: new Date().toISOString(),
        })
        .eq("id", receivable.id)
        .neq("status", "PAGO");
      if (receivableError) throw receivableError;
    }
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
      asaas_payment_link_id: params.payment.paymentLink || null,
      nosso_numero_asaas: params.payment.id,
      asaas_invoice_url: params.payment.invoiceUrl || null,
      asaas_bank_slip_url: params.payment.bankSlipUrl || null,
      asaas_installment_id: params.payment.installment || params.payment.installmentId || null,
      asaas_transaction_receipt_url: params.payment.transactionReceiptUrl || null,
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

  const canSyncReceivableStatus = (status: unknown) =>
    ["PENDENTE", "VENCIDO"].includes(String(status || "").toUpperCase());

  const recoverReceivablePayment = async (item: any) => {
    if (!item?.id) return false;
    const response = await callAsaas(`/payments?externalReference=${encodeURIComponent(item.id)}&limit=10`)
      .catch(() => null);
    const payment = (response?.data || []).find((candidate: any) =>
      String(candidate.externalReference || "") === String(item.id)
      && !["DELETED", "REFUNDED"].includes(String(candidate.status || "").toUpperCase())
    );
    if (!payment?.id) return false;

    const { error } = await admin.from("contas_receber").update({
      asaas_payment_id: payment.id,
      nosso_numero_asaas: payment.id,
      asaas_invoice_url: payment.invoiceUrl || null,
      asaas_bank_slip_url: payment.bankSlipUrl || null,
      asaas_installment_id: payment.installment || payment.installmentId || null,
      asaas_transaction_receipt_url: payment.transactionReceiptUrl || null,
      asaas_status: payment.status || null,
      asaas_synced_at: new Date().toISOString(),
      asaas_last_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", item.id);
    if (error) throw error;
    return true;
  };

  const getReceivableSyncDecision = async (item: any) => {
    if (!item.matricula_id) return { allowed: true, reason: null as string | null };

    const { data: matricula, error } = await admin
      .from("matriculas")
      .select(`
        id,
        financeiro_herdado,
        gerar_cobranca_inicial,
        gerar_cobranca_futura,
        sincronizar_asaas,
        turmas(
          origem_financeira,
          financeiro_herdado,
          gerar_cobrancas_futuras,
          sincronizar_asaas_futuro
        )
      `)
      .eq("id", item.matricula_id)
      .maybeSingle();
    if (error) throw error;
    if (!matricula) return { allowed: true, reason: null as string | null };

    const turma = Array.isArray(matricula.turmas) ? matricula.turmas[0] : matricula.turmas;
    const origem = String(turma?.origem_financeira || "NORMAL").toUpperCase();
    const financeiroHerdado = matricula.financeiro_herdado === true
      || turma?.financeiro_herdado === true
      || origem === "LEGADO";
    const syncEnabled = matricula.sincronizar_asaas ?? turma?.sincronizar_asaas_futuro ?? true;
    if (syncEnabled === false) {
      return { allowed: false, reason: "Sincronização Asaas desativada na matrícula/turma." };
    }

    const launchType = String(item.tipo_lancamento || "").toUpperCase();
    if (launchType === "MATRICULA") {
      const gerarInicial = matricula.gerar_cobranca_inicial ?? !financeiroHerdado;
      if (gerarInicial === false) {
        return { allowed: false, reason: "Cobrança inicial bloqueada por regra de financeiro legado." };
      }
    } else {
      const gerarFutura = matricula.gerar_cobranca_futura ?? turma?.gerar_cobrancas_futuras ?? false;
      if (gerarFutura === false) {
        return { allowed: false, reason: "Cobranças futuras desativadas na matrícula/turma." };
      }
    }

    return { allowed: true, reason: null as string | null };
  };

  const syncReceivable = async (item: any) => {
    if (item.asaas_payment_id || !item.cliente_id) return;
    if (!canSyncReceivableStatus(item.status)) return;

    const syncDecision = await getReceivableSyncDecision(item);
    if (!syncDecision.allowed) {
      const { error } = await admin.from("contas_receber").update({
        origem_pagamento: item.origem_pagamento || "LOCAL",
        asaas_last_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", item.id);
      if (error) throw error;
      return;
    }

    if (String(item.asaas_status || "").toUpperCase() === "CREATING") {
      const recovered = await recoverReceivablePayment(item);
      if (recovered) return;
    }

    const staleCreatingBefore = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: lockedReceivable, error: lockError } = await admin
      .from("contas_receber")
      .update({
        asaas_status: "CREATING",
        asaas_last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id)
      .is("asaas_payment_id", null)
      .in("status", ["PENDENTE", "VENCIDO"])
      .or(`asaas_status.is.null,asaas_status.neq.CREATING,updated_at.lt.${staleCreatingBefore}`)
      .select()
      .maybeSingle();
    if (lockError) throw lockError;
    if (!lockedReceivable) {
      const { data: current, error: currentError } = await admin
        .from("contas_receber")
        .select("*")
        .eq("id", item.id)
        .maybeSingle();
      if (currentError) throw currentError;
      if (current?.asaas_payment_id) return;
      if (String(current?.asaas_status || "").toUpperCase() === "CREATING") {
        await recoverReceivablePayment(current);
      }
      return;
    }
    item = lockedReceivable;

    const recovered = await recoverReceivablePayment(item);
    if (recovered) return;

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
    let paymentCreated = false;
    try {
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
          callback: { successUrl: callbackSuccessUrl() },
        }),
      });
      paymentCreated = true;

      const { data: updated, error: updateError } = await admin.from("contas_receber").update({
        asaas_payment_id: generated.id,
        nosso_numero_asaas: generated.id,
        asaas_invoice_url: generated.invoiceUrl || null,
        asaas_bank_slip_url: generated.bankSlipUrl || null,
        asaas_installment_id: generated.installment || generated.installmentId || null,
        asaas_transaction_receipt_url: generated.transactionReceiptUrl || null,
        asaas_status: generated.status,
        asaas_synced_at: new Date().toISOString(),
        asaas_last_error: null,
        updated_at: new Date().toISOString(),
      })
        .eq("id", item.id)
        .is("asaas_payment_id", null)
        .in("status", ["PENDENTE", "VENCIDO"])
        .select("id")
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updated) {
        throw new Error("Cobrança mudou de status antes de gravar a cobrança Asaas.");
      }
    } catch (syncError) {
      await admin.from("contas_receber").update({
        asaas_status: paymentCreated ? "CREATING" : null,
        asaas_last_error: syncError instanceof Error ? syncError.message : String(syncError),
        updated_at: new Date().toISOString(),
      }).eq("id", item.id);
      throw syncError;
    }
  };

  const syncOpenInstallments = async (matriculaId: string) => {
    const { data: installments, error: installmentsError } = await admin
      .from("contas_receber")
      .select("*")
      .eq("matricula_id", matriculaId)
      .in("status", ["PENDENTE", "VENCIDO"])
      .is("asaas_payment_id", null)
      .neq("tipo_lancamento", "MATRICULA")
      .order("data_vencimento");
    if (installmentsError) throw installmentsError;
    for (const installment of installments || []) await syncReceivable(installment);
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

    if (!receivable && payment.paymentLink) {
      const { data: linkedReceivable, error: linkedReceivableError } = await admin
        .from("contas_receber")
        .select("*")
        .eq("asaas_payment_link_id", payment.paymentLink)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (linkedReceivableError) throw linkedReceivableError;
      receivable = linkedReceivable;
    }

    if (!receivable) return;

    const currentStatus = String(receivable.status || "").toUpperCase();
    const currentAsaasStatus = String(receivable.asaas_status || "").toUpperCase();
    const currentPaid = currentStatus === "PAGO" || ["RECEIVED", "CONFIRMED"].includes(currentAsaasStatus);
    const incomingRegressiveStatus = ["CANCELADO", "VENCIDO"].includes(String(localStatus || "").toUpperCase());
    if (currentPaid && incomingRegressiveStatus) {
      const { error: monotonicError } = await admin.from("contas_receber").update({
        asaas_status: payment.status || eventType.replace("PAYMENT_", ""),
        asaas_last_error: `Evento ${eventType} ignorado: cobrança já estava paga e não pode regredir automaticamente.`,
        updated_at: new Date().toISOString(),
      }).eq("id", receivable.id);
      if (monotonicError) throw monotonicError;
      return;
    }

    const currentManualSettlement = currentStatus === "PAGO" && receivable.origem_pagamento === "PRESENCIAL";
    if (currentManualSettlement && localStatus === "PAGO") {
      const { error: manualConflictError } = await admin.from("contas_receber").update({
        asaas_payment_id: payment.id || receivable.asaas_payment_id,
        asaas_payment_link_id: payment.paymentLink || receivable.asaas_payment_link_id || null,
        asaas_status: payment.status || eventType.replace("PAYMENT_", ""),
        asaas_transaction_receipt_url: payment.transactionReceiptUrl || receivable.asaas_transaction_receipt_url || null,
        asaas_last_error: `Evento ${eventType} recebido após baixa manual. Revisar possível recebimento duplicado no Asaas.`,
        updated_at: new Date().toISOString(),
      }).eq("id", receivable.id);
      if (manualConflictError) throw manualConflictError;
      return;
    }

    const updates: Record<string, unknown> = {
      asaas_payment_id: payment.id || receivable.asaas_payment_id,
      asaas_payment_link_id: payment.paymentLink || receivable.asaas_payment_link_id || null,
      nosso_numero_asaas: payment.id || receivable.nosso_numero_asaas,
      asaas_status: payment.status || eventType.replace("PAYMENT_", ""),
      asaas_invoice_url: payment.invoiceUrl || receivable.asaas_invoice_url,
      asaas_bank_slip_url: payment.bankSlipUrl || receivable.asaas_bank_slip_url,
      asaas_installment_id: payment.installment || payment.installmentId || receivable.asaas_installment_id,
      asaas_transaction_receipt_url: payment.transactionReceiptUrl || receivable.asaas_transaction_receipt_url || null,
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
    await cancelPendingOnlineEnrollmentForReceivable(receivable, eventType, localStatus);

    if (receivable.matricula_id && localStatus === "PAGO") {
      await syncOpenInstallments(receivable.matricula_id);
    }
  };

  const handlePaymentLinkPayment = async (
    payment: any,
    eventType: string,
    localStatus: string | null,
    isPaymentConfirmed: boolean,
  ) => {
    if (!["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"].includes(eventType) || !payment.paymentLink) return;

    const isConfirmed = localStatus === "PAGO" || isPaymentConfirmed;
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
    if (isConfirmed) {
      const { error: parcelasError } = await admin.rpc("gerar_parcelas_matricula", {
        p_matricula_id: matricula.id,
      });
      if (parcelasError) throw parcelasError;
      await syncOpenInstallments(matricula.id);
    }
  };

  return {
    handlePaymentLinkPayment,
    handleReceivablePayment,
  };
};
