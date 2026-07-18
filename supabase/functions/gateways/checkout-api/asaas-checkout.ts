import { buildOnlinePaymentPayload, mapBillingType } from "./checkout-rules.ts";
import type { CheckoutContext } from "./checkout-context.ts";
import { createAsaasCheckoutServices } from "./asaas-services.ts";
import {
  isPaidPayment,
  normalizeErrorMessage,
  normalizeGatewayPaymentMethod,
  PENDENTE_INSCRICAO_STATUS,
  resolvePublicBaseUrl,
} from "./checkout-utils.ts";
import { paymentDate } from "../../asaas/core/status.ts";

export const handleAsaasCheckout = async (context: CheckoutContext) => {
  const {
    admin,
    json,
    state,
    course,
    aluno,
    turma,
    matricula,
    environment,
    isEadCheckout,
    keepTechnicalDocumentationPending,
    hasExplicitPaymentSelection,
    cpfCnpj,
    dataVencimento,
    charge,
    receivableFeeFields,
    gatewayPaymentMethodForCharge,
    technicalSchoolSnapshot,
  } = context;

  const { data: apiKey, error: secretError } = await admin.rpc(
    "asaas_get_secret",
    {
      p_secret_name: environment === "production"
        ? "asaas_production_api_key"
        : "asaas_sandbox_api_key",
    },
  );
  if (secretError) throw secretError;
  if (!apiKey) throw new Error("Integração Asaas ainda não configurada.");

  const baseUrl = environment === "production"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";
  const services = createAsaasCheckoutServices(context, apiKey, baseUrl);
  const {
    callAsaas,
    recoverPaymentByReceivableId,
    ensureCustomer,
    persistGatewayTransaction,
    getReusableExistingPaymentUrl,
    getExistingReceivable,
    setExistingReceivable,
  } = services;
  let existingReceivable: any;

  const { data: existingReceivables, error: existingReceivableError } =
    await admin
      .from("contas_receber")
      .select("*")
      .eq("matricula_id", matricula.id)
      .eq("tipo_lancamento", "MATRICULA")
      .order("created_at", { ascending: false })
      .limit(1);
  if (existingReceivableError) throw existingReceivableError;
  existingReceivable = existingReceivables?.[0] || null;
  setExistingReceivable(existingReceivable);

  if (existingReceivable?.status === "PAGO") {
    if (!keepTechnicalDocumentationPending) {
      await admin.from("matriculas").update({ status: "ATIVO" }).eq(
        "id",
        matricula.id,
      );
    }
    return json({
      url: existingReceivable.asaas_invoice_url ||
        existingReceivable.asaas_bank_slip_url,
      alreadyPaid: true,
    });
  }

  if (existingReceivable?.asaas_payment_id) {
    const reusableUrl = await getReusableExistingPaymentUrl(
      existingReceivable,
      hasExplicitPaymentSelection ? charge : undefined,
    );
    existingReceivable = getExistingReceivable();
    if (reusableUrl) return json({ url: reusableUrl });
  }

  if (
    existingReceivable?.asaas_payment_link_id &&
    !existingReceivable?.asaas_payment_id
  ) {
    const search = await callAsaas(
      `/payments?externalReference=${
        encodeURIComponent(existingReceivable.id)
      }&limit=20`,
    );
    const matchedPayment = (search?.data || []).find(isPaidPayment) ||
      search?.data?.[0] || null;
    if (matchedPayment?.id) {
      const paid = isPaidPayment(matchedPayment);
      const updates = {
        asaas_payment_id: matchedPayment.id,
        asaas_payment_link_id: matchedPayment.paymentLink ||
          existingReceivable.asaas_payment_link_id,
        nosso_numero_asaas: matchedPayment.id,
        asaas_invoice_url: matchedPayment.invoiceUrl ||
          existingReceivable.asaas_invoice_url || null,
        asaas_bank_slip_url: matchedPayment.bankSlipUrl || null,
        asaas_installment_id: matchedPayment.installment ||
          matchedPayment.installmentId || null,
        asaas_transaction_receipt_url: matchedPayment.transactionReceiptUrl ||
          existingReceivable.asaas_transaction_receipt_url || null,
        asaas_status: matchedPayment.status || null,
        gateway_provider: "asaas",
        gateway_environment: environment,
        gateway_payment_method: normalizeGatewayPaymentMethod(
          matchedPayment.billingType,
        ),
        gateway_payment_id: matchedPayment.id,
        gateway_customer_id: matchedPayment.customer ||
          existingReceivable.gateway_customer_id || null,
        gateway_payment_link_id: matchedPayment.paymentLink ||
          existingReceivable.asaas_payment_link_id,
        gateway_installment_id: matchedPayment.installment ||
          matchedPayment.installmentId || null,
        gateway_invoice_url: matchedPayment.invoiceUrl ||
          existingReceivable.asaas_invoice_url || null,
        gateway_bank_slip_url: matchedPayment.bankSlipUrl || null,
        gateway_transaction_receipt_url: matchedPayment.transactionReceiptUrl ||
          existingReceivable.asaas_transaction_receipt_url || null,
        gateway_status: matchedPayment.status || null,
        gateway_fee_value: isEadCheckout
          ? (receivableFeeFields as any).asaas_fee_value
          : null,
        gateway_net_value: isEadCheckout
          ? (receivableFeeFields as any).asaas_net_value
          : null,
        gateway_synced_at: new Date().toISOString(),
        gateway_last_error: null,
        ...(isEadCheckout ? receivableFeeFields : {}),
        status: paid ? "PAGO" : existingReceivable.status,
        valor_pago: paid
          ? Number(matchedPayment.value || existingReceivable.valor)
          : existingReceivable.valor_pago,
        data_pagamento: paid
          ? paymentDate(matchedPayment)
          : existingReceivable.data_pagamento,
        forma_pagamento: paid
          ? mapBillingType(matchedPayment.billingType)
          : existingReceivable.forma_pagamento,
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

      const inscriptionPayload: any = {
        curso_id: course.id,
        turma_id: turma.id,
        aluno_id: aluno.id,
        matricula_id: matricula.id,
        asaas_payment_id: matchedPayment.id,
        asaas_customer_id: matchedPayment.customer || aluno.asaas_customer_id ||
          null,
        asaas_payment_link_id: matchedPayment.paymentLink ||
          existingReceivable.asaas_payment_link_id,
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
        ...technicalSchoolSnapshot,
        updated_at: new Date().toISOString(),
      };
      const { data: pendingInscricoes, error: pendingInscricaoError } =
        await admin
          .from("inscricoes_online")
          .select("id")
          .eq("matricula_id", matricula.id)
          .order("created_at", { ascending: false })
          .limit(1);
      if (pendingInscricaoError) throw pendingInscricaoError;
      const inscriptionQuery = pendingInscricoes?.[0]
        ? admin.from("inscricoes_online").update(inscriptionPayload).eq(
          "id",
          pendingInscricoes[0].id,
        )
        : admin.from("inscricoes_online").insert(inscriptionPayload);
      const { error: inscriptionError } = await inscriptionQuery;
      if (inscriptionError) throw inscriptionError;

      if (paid) {
        if (!keepTechnicalDocumentationPending) {
          await admin.from("matriculas").update({ status: "ATIVO" }).eq(
            "id",
            matricula.id,
          );
        }
        return json({
          url: reconciledReceivable.asaas_invoice_url ||
            reconciledReceivable.asaas_bank_slip_url,
          alreadyPaid: true,
        });
      }

      if (reconciledReceivable.asaas_invoice_url) {
        return json({ url: reconciledReceivable.asaas_invoice_url });
      }
    }
  }

  const receivablePayload: any = {
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
    gateway_provider: "asaas",
    gateway_environment: environment,
    gateway_payment_method: gatewayPaymentMethodForCharge,
    gateway_status: null,
    gateway_last_error: null,
    updated_at: new Date().toISOString(),
    ...(isEadCheckout ? receivableFeeFields : {}),
  };

  const existingIsCreatingWithoutPayment = existingReceivable &&
    !existingReceivable.asaas_payment_id &&
    String(existingReceivable.asaas_status || "").toUpperCase() === "CREATING";

  let receivable = existingReceivable
    ? existingIsCreatingWithoutPayment ? existingReceivable : (await admin
      .from("contas_receber")
      .update(receivablePayload)
      .eq("id", existingReceivable.id)
      .neq("status", "PAGO")
      .select()
      .maybeSingle()).data || existingReceivable
    : null;

  if (!receivable) {
    const { data: insertedReceivable, error: insertReceivableError } =
      await admin
        .from("contas_receber")
        .insert(receivablePayload)
        .select()
        .single();

    if (insertReceivableError) {
      const { data: duplicatedReceivable, error: duplicatedReceivableError } =
        await admin
          .from("contas_receber")
          .select("*")
          .eq("matricula_id", matricula.id)
          .eq("categoria", "MENSALIDADE")
          .eq("tipo_lancamento", "MATRICULA")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
      if (duplicatedReceivableError || !duplicatedReceivable) {
        throw insertReceivableError;
      }
      receivable = duplicatedReceivable;
    } else {
      receivable = insertedReceivable;
    }
  }
  state.checkoutReceivableId = receivable?.id || null;

  if (!receivable) {
    throw new Error("Não foi possível registrar a cobrança interna.");
  }
  if (receivable.status === "PAGO") {
    if (!keepTechnicalDocumentationPending) {
      await admin.from("matriculas").update({ status: "ATIVO" }).eq(
        "id",
        matricula.id,
      );
    }
    return json({
      url: receivable.asaas_invoice_url || receivable.asaas_bank_slip_url,
      alreadyPaid: true,
    });
  }

  const customerId = await ensureCustomer();
  const publicBaseUrl = resolvePublicBaseUrl();
  const successUrl = publicBaseUrl
    ? `${publicBaseUrl}/aluno?checkout=success&gateway=asaas`
    : null;
  const staleCreatingBefore = new Date(Date.now() - 2 * 60 * 1000)
    .toISOString();
  const { data: lockedReceivable, error: lockReceivableError } = await admin
    .from("contas_receber")
    .update({
      asaas_status: "CREATING",
      asaas_last_error: null,
      gateway_provider: "asaas",
      gateway_environment: environment,
      gateway_payment_method: gatewayPaymentMethodForCharge,
      gateway_status: "CREATING",
      gateway_last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", receivable.id)
    .is("asaas_payment_id", null)
    .or(
      `asaas_status.is.null,asaas_status.neq.CREATING,updated_at.lt.${staleCreatingBefore}`,
    )
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
    if (
      String(inProgressReceivable?.asaas_status || "").toUpperCase() ===
        "CREATING"
    ) {
      const recovered = await recoverPaymentByReceivableId(receivable.id);
      if (
        recovered?.receivable?.asaas_invoice_url ||
        recovered?.payment?.invoiceUrl
      ) {
        return json({
          url: recovered.receivable.asaas_invoice_url ||
            recovered.payment.invoiceUrl,
        });
      }
    }
    throw new Error(
      "A cobrança já está sendo preparada. Aguarde alguns instantes e tente novamente.",
    );
  }
  receivable = lockedReceivable;

  let payment: any;
  try {
    const recovered = await recoverPaymentByReceivableId(receivable.id);
    if (
      recovered?.receivable?.asaas_invoice_url || recovered?.payment?.invoiceUrl
    ) {
      return json({
        url: recovered.receivable.asaas_invoice_url ||
          recovered.payment.invoiceUrl,
      });
    }

    payment = await callAsaas("/payments", {
      method: "POST",
      body: JSON.stringify(
        buildOnlinePaymentPayload(
          customerId,
          receivable.id,
          charge,
          successUrl,
        ),
      ),
    });
    state.paymentCreated = true;
  } catch (paymentError) {
    await admin
      .from("contas_receber")
      .update({
        asaas_status: null,
        asaas_last_error: normalizeErrorMessage(paymentError),
        gateway_status: null,
        gateway_last_error: normalizeErrorMessage(paymentError),
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
      asaas_installment_id: payment.installment || payment.installmentId ||
        null,
      asaas_transaction_receipt_url: payment.transactionReceiptUrl || null,
      asaas_status: payment.status || null,
      gateway_provider: "asaas",
      gateway_environment: environment,
      gateway_payment_method: gatewayPaymentMethodForCharge,
      gateway_payment_id: payment.id,
      gateway_customer_id: customerId,
      gateway_payment_link_id: null,
      gateway_installment_id: payment.installment || payment.installmentId ||
        null,
      gateway_invoice_url: payment.invoiceUrl || null,
      gateway_bank_slip_url: payment.bankSlipUrl || null,
      gateway_transaction_receipt_url: payment.transactionReceiptUrl || null,
      gateway_status: payment.status || null,
      gateway_fee_value: isEadCheckout
        ? (receivableFeeFields as any).asaas_fee_value
        : null,
      gateway_net_value: isEadCheckout
        ? (receivableFeeFields as any).asaas_net_value
        : null,
      gateway_synced_at: new Date().toISOString(),
      gateway_last_error: null,
      ...(isEadCheckout ? receivableFeeFields : {}),
      asaas_synced_at: new Date().toISOString(),
      asaas_last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", receivable.id)
    .select()
    .single();
  if (updateReceivableError) throw updateReceivableError;
  await persistGatewayTransaction(payment, updatedReceivable);

  const inscricaoPayload: any = {
    curso_id: course.id,
    turma_id: turma.id,
    aluno_id: aluno.id,
    matricula_id: matricula.id,
    asaas_payment_id: payment.id,
    asaas_customer_id: customerId,
    asaas_payment_link_id: null,
    gateway_provider: "asaas",
    gateway_environment: environment,
    gateway_payment_id: payment.id,
    gateway_customer_id: customerId,
    gateway_payment_link_id: null,
    nome: aluno.nome,
    cpf_cnpj: cpfCnpj || null,
    email: aluno.email || null,
    telefone: aluno.telefone || null,
    valor: charge.value,
    status: PENDENTE_INSCRICAO_STATUS,
    forma_pagamento: mapBillingType(payment.billingType),
    erro: null,
    ...technicalSchoolSnapshot,
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
    const { error } = await admin.from("inscricoes_online").insert(
      inscricaoPayload,
    );
    if (error) throw error;
  }

  return json({
    url: updatedReceivable.asaas_invoice_url || payment.invoiceUrl,
  });
};
