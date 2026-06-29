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

    return payload;
  };

  const mapBillingType = (billingType?: string | null) => {
    if (billingType === "CREDIT_CARD") return "CARTAO";
    if (billingType === "PIX") return "PIX";
    if (billingType === "BOLETO") return "BOLETO";
    return null;
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
    const payment = await callAsaas(runtime, `/payments/${receivable.asaas_payment_id}`);
    const paymentStatus = String(payment?.status || "");
    const updates: Record<string, unknown> = {
      asaas_status: paymentStatus || receivable.asaas_status,
      asaas_invoice_url: payment?.invoiceUrl || receivable.asaas_invoice_url,
      asaas_bank_slip_url: payment?.bankSlipUrl || receivable.asaas_bank_slip_url,
      asaas_installment_id: payment?.installment || payment?.installmentId || receivable.asaas_installment_id,
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
    const { data: receivable, error: receivableError } = await admin
      .from("contas_receber")
      .select("*")
      .eq("id", receivableId)
      .single();
    if (receivableError) throw receivableError;
    if (receivable.status === "PAGO") return receivable;

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

    if (!receivable.cliente_id) throw new Error("A cobrança não possui aluno vinculado.");

    const { data: parceiro, error: parceiroError } = await admin
      .from("parceiros")
      .select("*")
      .eq("id", receivable.cliente_id)
      .single();
    if (parceiroError) throw parceiroError;

    const customerId = await ensureCustomer(runtime, parceiro);
    try {
      const paymentPayload = await buildPaymentPayload(customerId, receivable);
      const payment = await callAsaas(runtime, "/payments", {
        method: "POST",
        body: JSON.stringify(paymentPayload),
      });

      const { data: updated, error: updateError } = await admin
        .from("contas_receber")
        .update({
          asaas_payment_id: payment.id,
          nosso_numero_asaas: payment.id,
          asaas_invoice_url: payment.invoiceUrl || null,
          asaas_bank_slip_url: payment.bankSlipUrl || null,
          asaas_installment_id: payment.installment || payment.installmentId || null,
          asaas_status: payment.status,
          asaas_synced_at: new Date().toISOString(),
          asaas_last_error: null,
        })
        .eq("id", receivable.id)
        .select()
        .single();
      if (updateError) throw updateError;
      return updated;
    } catch (error) {
      await admin.from("contas_receber")
        .update({ asaas_last_error: error instanceof Error ? error.message : String(error) })
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
