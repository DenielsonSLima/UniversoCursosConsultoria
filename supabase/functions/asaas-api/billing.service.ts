import { callAsaas, type AsaasRuntime } from "./asaas-http.ts";
import { isValidCpf } from "./shared.ts";

export const createAsaasBillingService = (
  admin: any,
  anyNotificationChannelEnabled: (config: any) => boolean,
) => {
  const ensureCustomer = async (
    runtime: AsaasRuntime,
    parceiro: any,
  ) => {
    const notificationsEnabled = anyNotificationChannelEnabled(runtime.config);
    if (parceiro.asaas_customer_id) {
      await callAsaas(runtime, `/customers/${parceiro.asaas_customer_id}`, {
        method: "PUT",
        body: JSON.stringify({ notificationDisabled: !notificationsEnabled }),
      }).catch((error) => {
        console.warn("Não foi possível atualizar preferência de notificações do cliente no Asaas:", error);
      });
      return parceiro.asaas_customer_id as string;
    }

    const cpfCnpj = String(
      parceiro.responsavel_financeiro && parceiro.responsavel_cpf
        ? parceiro.responsavel_cpf
        : parceiro.cpf_cnpj || "",
    ).replace(/\D/g, "");
    if (!cpfCnpj) throw new Error("O aluno precisa ter CPF cadastrado para gerar cobrança no Asaas.");
    if (!isValidCpf(cpfCnpj)) {
      throw new Error("CPF inválido para cobrança. Atualize o cadastro do aluno antes de enviar ao Asaas.");
    }

    const found = await callAsaas(runtime, `/customers?cpfCnpj=${cpfCnpj}&limit=1`);
    let customer = found?.data?.[0];
    if (!customer) {
      customer = await callAsaas(runtime, "/customers", {
        method: "POST",
        body: JSON.stringify({
          name: parceiro.nome,
          cpfCnpj,
          email: parceiro.responsavel_financeiro
            ? parceiro.responsavel_email || parceiro.email
            : parceiro.email,
          mobilePhone: parceiro.responsavel_financeiro
            ? parceiro.responsavel_telefone || parceiro.telefone
            : parceiro.telefone,
          postalCode: String(parceiro.cep || "").replace(/\D/g, "") || undefined,
          address: parceiro.endereco || undefined,
          addressNumber: parceiro.numero || undefined,
          complement: parceiro.complemento || undefined,
          province: parceiro.bairro || undefined,
          externalReference: parceiro.id,
          notificationDisabled: !notificationsEnabled,
        }),
      });
    }

    if (customer?.id) {
      await callAsaas(runtime, `/customers/${customer.id}`, {
        method: "PUT",
        body: JSON.stringify({ notificationDisabled: !notificationsEnabled }),
      }).catch((error) => {
        console.warn("Não foi possível atualizar preferência de notificações do cliente no Asaas:", error);
      });
    }

    await admin.from("parceiros")
      .update({ asaas_customer_id: customer.id, updated_at: new Date().toISOString() })
      .eq("id", parceiro.id);
    return customer.id as string;
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const formatDate = (value?: string | null) => {
    if (!value) return "";
    const [year, month, day] = String(value).slice(0, 10).split("-");
    return year && month && day ? `${day}/${month}/${year}` : String(value);
  };

  const roundMoney = (value: number) => Math.round(value * 100) / 100;

  const buildPaymentPayload = async (customerId: string, receivable: any, includeCustomer = true) => {
    const { data: turma, error: turmaError } = receivable.turma_id
      ? await admin
        .from("turmas")
        .select("id, nome, desconto_pontualidade, juros_atraso, multa_atraso, aplicar_desconto_matricula, aplicar_multa_juros_matricula, aplicar_desconto_mensalidade, aplicar_multa_juros_mensalidade, aplicar_desconto_rematricula, aplicar_multa_juros_rematricula")
        .eq("id", receivable.turma_id)
        .maybeSingle()
      : { data: null, error: null };
    if (turmaError) throw turmaError;

    const value = roundMoney(Number(receivable.valor || 0));
    const discountValue = roundMoney(Number(turma?.desconto_pontualidade || 0));
    const interestPercent = Number(turma?.juros_atraso || 0);
    const fineValue = roundMoney(Number(turma?.multa_atraso || 0));
    const launchType = String(receivable.tipo_lancamento || "").toUpperCase();
    const discountEnabled = launchType === "MATRICULA"
      ? turma?.aplicar_desconto_matricula === true
      : launchType === "REMATRICULA"
        ? turma?.aplicar_desconto_rematricula !== false
        : turma?.aplicar_desconto_mensalidade !== false;
    const penaltyEnabled = launchType === "MATRICULA"
      ? turma?.aplicar_multa_juros_matricula !== false
      : launchType === "REMATRICULA"
        ? turma?.aplicar_multa_juros_rematricula !== false
        : turma?.aplicar_multa_juros_mensalidade !== false;
    const discountApplies = discountEnabled && discountValue > 0 && discountValue < value;
    const fineApplies = penaltyEnabled && fineValue > 0;
    const interestApplies = penaltyEnabled && interestPercent > 0;

    const instructionLines = [
      String(receivable.descricao || "").trim(),
      discountApplies
        ? `Desconto de pontualidade de ${formatCurrency(discountValue)} para pagamento até ${formatDate(receivable.data_vencimento)}.`
        : null,
      fineApplies || interestApplies
        ? `Após o vencimento: ${fineApplies ? `multa de ${formatCurrency(fineValue)}` : ""}${fineApplies && interestApplies ? " e " : ""}${interestApplies ? `juros de ${interestPercent}% ao mês` : ""}.`
        : null,
    ].filter(Boolean).join("\n");

    const payload: Record<string, unknown> = {
      billingType: "UNDEFINED",
      value,
      dueDate: receivable.data_vencimento,
      description: instructionLines.slice(0, 500),
      externalReference: receivable.id,
      postalService: false,
    };

    if (includeCustomer) payload.customer = customerId;
    if (discountApplies) payload.discount = { value: discountValue, dueDateLimitDays: 0, type: "FIXED" };
    if (interestApplies) payload.interest = { value: interestPercent };
    if (fineApplies) payload.fine = { value: fineValue, type: "FIXED" };
    if (fineApplies || interestApplies) payload.daysAfterDueDateToRegistrationCancellation = 30;
    payload.callback = { successUrl: callbackSuccessUrl() };

    return payload;
  };

  const mapBillingType = (billingType?: string | null) => {
    if (billingType === "CREDIT_CARD") return "CARTAO";
    if (billingType === "PIX") return "PIX";
    if (billingType === "BOLETO") return "BOLETO";
    return null;
  };

  const mapReceivableBillingType = (formaPagamento?: string | null) => {
    const value = String(formaPagamento || "").toUpperCase();
    if (value === "CARTAO" || value === "CREDIT_CARD") return "CREDIT_CARD";
    if (value === "PIX") return "PIX";
    if (value === "BOLETO") return "BOLETO";
    return "UNDEFINED";
  };

  const dueDateLimitDays = (dueDate?: string | null) => {
    if (!dueDate) return 30;
    const today = new Date();
    const due = new Date(`${String(dueDate).slice(0, 10)}T12:00:00`);
    today.setHours(12, 0, 0, 0);
    return Math.max(1, Math.ceil((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)));
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
        if (url.protocol === "http:" || url.protocol === "https:") {
          return `${url.origin.replace(/\/+$/, "")}/aluno?asaas=success`;
        }
      } catch {
        // Try the next configured source.
      }
    }
    return "https://universocc.com.br/aluno?asaas=success";
  };

  const createDetachedPaymentLink = async (runtime: AsaasRuntime, receivable: any) => {
    if (receivable.asaas_payment_link_id && receivable.asaas_invoice_url) {
      return receivable;
    }

    const receivableStatus = String(receivable.status || "").toUpperCase();
    if (!["PENDENTE", "VENCIDO"].includes(receivableStatus)) {
      return {
        ...receivable,
        asaas_sync_skipped: true,
        asaas_skip_reason: "Cobrança não está pendente/vencida para geração de link Asaas.",
      };
    }

    const value = roundMoney(Number(receivable.valor || 0));
    if (!value || value <= 0) throw new Error("Valor inválido para gerar link Asaas.");

    const { data: lockedReceivable, error: lockError } = await admin
      .from("contas_receber")
      .update({
        asaas_status: "CREATING",
        asaas_last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", receivable.id)
      .is("asaas_payment_link_id", null)
      .in("status", ["PENDENTE", "VENCIDO"])
      .or("asaas_status.is.null,asaas_status.neq.CREATING")
      .select()
      .maybeSingle();
    if (lockError) throw lockError;
    if (!lockedReceivable) {
      const { data: currentReceivable, error: currentError } = await admin
        .from("contas_receber")
        .select("*")
        .eq("id", receivable.id)
        .single();
      if (currentError) throw currentError;
      if (currentReceivable.asaas_payment_link_id && currentReceivable.asaas_invoice_url) {
        return currentReceivable;
      }
      if (String(currentReceivable.asaas_status || "").toUpperCase() === "CREATING") {
        const recovered = await recoverDetachedPaymentLink(runtime, currentReceivable);
        if (recovered) return recovered;
      }
      throw new Error("O link de pagamento já está sendo gerado. Aguarde alguns instantes e atualize.");
    }
    receivable = lockedReceivable;

    let linkCreated = false;
    try {
      const paymentLink = await callAsaas(runtime, "/paymentLinks", {
        method: "POST",
        body: JSON.stringify({
          name: String(receivable.descricao || "Cobrança Universo Cursos").slice(0, 100),
          description: String(receivable.descricao || "Cobrança Universo Cursos").slice(0, 500),
          value,
          billingType: mapReceivableBillingType(receivable.forma_pagamento),
          chargeType: "DETACHED",
          dueDateLimitDays: dueDateLimitDays(receivable.data_vencimento),
          externalReference: receivable.id,
          callback: { successUrl: callbackSuccessUrl() },
        }),
      });
      linkCreated = true;

      const { data: updated, error } = await admin
        .from("contas_receber")
        .update({
          asaas_payment_id: null,
          asaas_payment_link_id: paymentLink.id,
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
        .in("status", ["PENDENTE", "VENCIDO"])
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!updated) {
        throw new Error("Cobrança mudou de status antes de gravar o link Asaas. Atualize a tela.");
      }
      return updated;
    } catch (error) {
      await admin.from("contas_receber")
        .update({
          asaas_status: linkCreated ? "CREATING" : null,
          asaas_last_error: error instanceof Error ? error.message : String(error),
          updated_at: new Date().toISOString(),
        })
        .eq("id", receivable.id);
      throw error;
    }
  };

  const recoverDetachedPaymentLink = async (runtime: AsaasRuntime, receivable: any) => {
    if (!receivable?.id) return null;
    const response = await callAsaas(
      runtime,
      `/paymentLinks?externalReference=${encodeURIComponent(receivable.id)}&limit=10`,
    ).catch(() => null);
    const paymentLink = (response?.data || []).find((item: any) =>
      String(item.externalReference || "") === String(receivable.id)
      && String(item.deleted || "false") !== "true"
    );
    if (!paymentLink?.id) return null;

    const { data: updated, error } = await admin
      .from("contas_receber")
      .update({
        asaas_payment_id: null,
        asaas_payment_link_id: paymentLink.id,
        nosso_numero_asaas: paymentLink.id,
        asaas_invoice_url: paymentLink.url || receivable.asaas_invoice_url || null,
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
    if (error) throw error;
    return updated;
  };

  const recoverReceivablePayment = async (runtime: AsaasRuntime, receivable: any) => {
    if (!receivable?.id) return null;
    const response = await callAsaas(
      runtime,
      `/payments?externalReference=${encodeURIComponent(receivable.id)}&limit=10`,
    ).catch(() => null);
    const payment = (response?.data || []).find((item: any) =>
      String(item.externalReference || "") === String(receivable.id)
      && !["DELETED", "REFUNDED"].includes(String(item.status || "").toUpperCase())
    );
    if (!payment?.id) return null;

    const { data: updated, error } = await admin
      .from("contas_receber")
      .update({
        asaas_payment_id: payment.id,
        nosso_numero_asaas: payment.id,
        asaas_invoice_url: payment.invoiceUrl || null,
        asaas_bank_slip_url: payment.bankSlipUrl || null,
        asaas_installment_id: payment.installment || payment.installmentId || null,
        asaas_transaction_receipt_url: payment.transactionReceiptUrl || null,
        asaas_status: payment.status,
        asaas_synced_at: new Date().toISOString(),
        asaas_last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", receivable.id)
      .select()
      .single();
    if (error) throw error;
    return refreshReceivableStatus(runtime, updated);
  };

  const getReceivableSyncDecision = async (receivable: any) => {
    if (!receivable.matricula_id) {
      return { allowed: true, reason: null as string | null };
    }

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
      .eq("id", receivable.matricula_id)
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

    const launchType = String(receivable.tipo_lancamento || "").toUpperCase();
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

  const syncFutureInstallments = async (
    runtime: AsaasRuntime,
    matriculaId: string,
  ) => {
    const { data, error } = await admin
      .from("contas_receber")
      .select("id")
      .eq("matricula_id", matriculaId)
      .in("status", ["PENDENTE", "VENCIDO"])
      .is("asaas_payment_id", null)
      .neq("tipo_lancamento", "MATRICULA")
      .order("data_vencimento");
    if (error) throw error;
    for (const item of data || []) await syncReceivable(runtime, item.id);
  };

  const refreshReceivableStatus = async (
    runtime: AsaasRuntime,
    receivable: any,
  ) => {
    if (!receivable.asaas_payment_id) return receivable;
    const currentStatus = String(receivable.status || "").toUpperCase();
    const currentAsaasStatus = String(receivable.asaas_status || "").toUpperCase();
    const currentPaid = currentStatus === "PAGO" || ["RECEIVED", "CONFIRMED"].includes(currentAsaasStatus);
    const currentManualSettlement = currentStatus === "PAGO" && receivable.origem_pagamento === "PRESENCIAL";

    let payment: any;
    try {
      payment = await callAsaas(runtime, `/payments/${receivable.asaas_payment_id}`);
    } catch (error) {
      if (currentManualSettlement) {
        const { data: preserved, error: preserveError } = await admin
          .from("contas_receber")
          .update({
            asaas_status: "DELETED",
            asaas_last_error: `Cobrança Asaas anterior não localizada; baixa manual preservada. ${error instanceof Error ? error.message : String(error)}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", receivable.id)
          .select()
          .single();
        if (preserveError) throw preserveError;
        return preserved;
      }
      throw error;
    }

    const paymentStatus = String(payment?.status || "").toUpperCase();

    if (currentPaid && ["DELETED", "OVERDUE"].includes(paymentStatus)) {
      const { data: preserved, error: preserveError } = await admin
        .from("contas_receber")
        .update({
          asaas_status: paymentStatus || receivable.asaas_status,
          asaas_last_error: `Atualização Asaas ${paymentStatus || "sem status"} preservada sem regredir cobrança já paga.`,
          asaas_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", receivable.id)
        .select()
        .single();
      if (preserveError) throw preserveError;
      return preserved;
    }

    if (currentManualSettlement && ["RECEIVED", "CONFIRMED"].includes(paymentStatus)) {
      const { data: preserved, error: preserveError } = await admin
        .from("contas_receber")
        .update({
          asaas_payment_id: payment.id || receivable.asaas_payment_id,
          asaas_payment_link_id: payment.paymentLink || receivable.asaas_payment_link_id || null,
          asaas_status: paymentStatus,
          asaas_transaction_receipt_url: payment.transactionReceiptUrl || receivable.asaas_transaction_receipt_url || null,
          asaas_synced_at: new Date().toISOString(),
          asaas_last_error: "Pagamento Asaas confirmado após baixa manual. Revisar possível recebimento duplicado.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", receivable.id)
        .select()
        .single();
      if (preserveError) throw preserveError;
      return preserved;
    }

    const updates: Record<string, unknown> = {
      asaas_status: paymentStatus || receivable.asaas_status,
      asaas_invoice_url: payment?.invoiceUrl || receivable.asaas_invoice_url,
      asaas_bank_slip_url: payment?.bankSlipUrl || receivable.asaas_bank_slip_url,
      asaas_installment_id: payment?.installment || payment?.installmentId || receivable.asaas_installment_id,
      asaas_transaction_receipt_url: payment?.transactionReceiptUrl || receivable.asaas_transaction_receipt_url || null,
      asaas_synced_at: new Date().toISOString(),
      asaas_last_error: null,
      updated_at: new Date().toISOString(),
    };

    if (["RECEIVED", "CONFIRMED"].includes(paymentStatus)) {
      updates.status = "PAGO";
      updates.valor_pago = Number(payment.value || receivable.valor);
      updates.data_pagamento = String(
        payment.paymentDate || payment.clientPaymentDate || payment.confirmedDate || new Date().toISOString(),
      ).slice(0, 10);
      updates.forma_pagamento = mapBillingType(payment.billingType);
      updates.origem_pagamento = "ASAAS";
    } else if (paymentStatus === "OVERDUE") {
      updates.status = "VENCIDO";
    } else if (paymentStatus === "DELETED") {
      updates.status = "CANCELADO";
    } else if (paymentStatus === "REFUNDED") {
      updates.status = "ESTORNADO";
    }

    const { data: updated, error } = await admin
      .from("contas_receber")
      .update(updates)
      .eq("id", receivable.id)
      .select()
      .single();
    if (error) throw error;

    if (["RECEIVED", "CONFIRMED"].includes(paymentStatus) && receivable.matricula_id) {
      await syncFutureInstallments(runtime, receivable.matricula_id);
    }

    return updated;
  };

  const syncReceivable = async (
    runtime: AsaasRuntime,
    receivableId: string,
  ) => {
    const { data: initialReceivable, error: receivableError } = await admin
      .from("contas_receber")
      .select("*")
      .eq("id", receivableId)
      .single();
    if (receivableError) throw receivableError;
    let receivable = initialReceivable;
    const receivableStatus = String(receivable.status || "").toUpperCase();
    if (receivableStatus === "PAGO") return receivable;

    if (receivable.asaas_payment_id) {
      if (receivable.cliente_id && !["RECEIVED", "CONFIRMED"].includes(receivable.asaas_status)) {
        const { data: parceiro, error: parceiroError } = await admin
          .from("parceiros")
          .select("*")
          .eq("id", receivable.cliente_id)
          .single();
        if (parceiroError) throw parceiroError;
        const customerId = await ensureCustomer(runtime, parceiro);
        const updatePayload = await buildPaymentPayload(customerId, receivable, false);
        try {
          await callAsaas(runtime, `/payments/${receivable.asaas_payment_id}`, {
            method: "PUT",
            body: JSON.stringify(updatePayload),
          });
        } catch (error) {
          console.warn("Não foi possível atualizar regras do boleto no Asaas antes da consulta:", error);
        }
      }
      return refreshReceivableStatus(runtime, receivable);
    }

    if (!["PENDENTE", "VENCIDO"].includes(receivableStatus)) {
      return {
        ...receivable,
        asaas_sync_skipped: true,
        asaas_skip_reason: "Cobrança não está pendente/vencida para sincronização Asaas.",
      };
    }

    const syncDecision = await getReceivableSyncDecision(receivable);
    if (!syncDecision.allowed) {
      await admin.from("contas_receber")
        .update({
          origem_pagamento: receivable.origem_pagamento || "LOCAL",
          asaas_last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", receivable.id);
      return { ...receivable, asaas_sync_skipped: true, asaas_skip_reason: syncDecision.reason };
    }

    if (!receivable.cliente_id) {
      if (String(receivable.categoria || "").toUpperCase() === "OUTROS_CREDITOS" || !receivable.matricula_id) {
        return createDetachedPaymentLink(runtime, receivable);
      }
      throw new Error("A cobrança não possui aluno vinculado.");
    }

    const { data: lockedReceivable, error: lockError } = await admin
      .from("contas_receber")
      .update({
        asaas_status: "CREATING",
        asaas_last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", receivable.id)
      .is("asaas_payment_id", null)
      .in("status", ["PENDENTE", "VENCIDO"])
      .or("asaas_status.is.null,asaas_status.neq.CREATING")
      .select()
      .maybeSingle();
    if (lockError) throw lockError;
    if (!lockedReceivable) {
      const { data: currentReceivable, error: currentError } = await admin
        .from("contas_receber")
        .select("*")
        .eq("id", receivable.id)
        .single();
      if (currentError) throw currentError;
      if (currentReceivable.asaas_payment_id) {
        return refreshReceivableStatus(runtime, currentReceivable);
      }
      if (String(currentReceivable.asaas_status || "").toUpperCase() === "CREATING") {
        const recovered = await recoverReceivablePayment(runtime, currentReceivable);
        if (recovered) return recovered;
      }
      throw new Error("A cobrança já está sendo sincronizada com o Asaas. Aguarde alguns instantes e atualize.");
    }
    receivable = lockedReceivable;

    const { data: parceiro, error: parceiroError } = await admin
      .from("parceiros")
      .select("*")
      .eq("id", receivable.cliente_id)
      .single();
    if (parceiroError) throw parceiroError;

    const customerId = await ensureCustomer(runtime, parceiro);
    let paymentCreated = false;
    try {
      const paymentPayload = await buildPaymentPayload(customerId, receivable);
      const payment = await callAsaas(runtime, "/payments", {
        method: "POST",
        body: JSON.stringify(paymentPayload),
      });
      paymentCreated = true;

      const { data: updated, error: updateError } = await admin
        .from("contas_receber")
        .update({
          asaas_payment_id: payment.id,
          nosso_numero_asaas: payment.id,
          asaas_invoice_url: payment.invoiceUrl || null,
          asaas_bank_slip_url: payment.bankSlipUrl || null,
          asaas_installment_id: payment.installment || payment.installmentId || null,
          asaas_transaction_receipt_url: payment.transactionReceiptUrl || null,
          asaas_status: payment.status,
          asaas_synced_at: new Date().toISOString(),
          asaas_last_error: null,
        })
        .eq("id", receivable.id)
        .is("asaas_payment_id", null)
        .in("status", ["PENDENTE", "VENCIDO"])
        .select()
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updated) {
        throw new Error("Cobrança mudou de status antes de gravar a cobrança Asaas. Atualize a tela.");
      }
      return updated;
    } catch (error) {
      await admin.from("contas_receber")
        .update({
          asaas_status: paymentCreated ? "CREATING" : null,
          asaas_last_error: error instanceof Error ? error.message : String(error),
          updated_at: new Date().toISOString(),
        })
        .eq("id", receivable.id);
      throw error;
    }
  };

  return {
    buildPaymentPayload,
    ensureCustomer,
    mapBillingType,
    refreshReceivableStatus,
    syncFutureInstallments,
    syncReceivable,
  };
};
