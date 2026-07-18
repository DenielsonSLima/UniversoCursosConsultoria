import { mapBillingType } from "./checkout-rules.ts";
import type { CheckoutContext } from "./checkout-context.ts";
import {
  normalizeErrorMessage,
  PENDENTE_INSCRICAO_STATUS,
  providerLabelFor,
  resolveCheckoutUrl,
  resolvePublicBaseUrl,
  tryCancelLegacyAsaasPayment,
} from "./checkout-utils.ts";
import {
  createGatewayCharge,
  type GatewayProviderCode,
  gatewayReceivableUpdate,
  persistGatewayTransaction as persistProviderGatewayTransaction,
  repairGatewayTransactionFromReceivable,
} from "../router.ts";
import {
  assertGatewayTitleCanBeReset,
  boletoIssuedAtAfterReset,
  isRemoteTitleNonPayable,
} from "../checkout/remote-title-guard.ts";
import { baneseFinancialTermsFromCharge } from "../api/banese-financial-terms.ts";

export const handleProviderGatewayCheckout = async (
  context: CheckoutContext,
) => {
  const {
    admin,
    supabaseUrl,
    json,
    state,
    course,
    aluno,
    turma,
    matricula,
    environment,
    isEadCheckout,
    keepTechnicalDocumentationPending,
    gatewayDocument,
    dataVencimento,
    charge,
    receivableFeeFields,
    gatewayPaymentMethodForCharge,
    gatewayRoute,
    technicalSchoolSnapshot,
  } = context;

  const providerCode = gatewayRoute.providerCode as GatewayProviderCode;
  const { data: existingReceivables, error: existingReceivableError } =
    await admin
      .from("contas_receber")
      .select("*")
      .eq("matricula_id", matricula.id)
      .eq("tipo_lancamento", "MATRICULA")
      .order("created_at", { ascending: false })
      .limit(1);
  if (existingReceivableError) throw existingReceivableError;
  let gatewayReceivable = existingReceivables?.[0] || null;

  if (gatewayReceivable?.status === "PAGO") {
    if (!keepTechnicalDocumentationPending) {
      await admin.from("matriculas").update({ status: "ATIVO" }).eq(
        "id",
        matricula.id,
      );
    }
    return json({
      url: resolveCheckoutUrl(gatewayReceivable),
      alreadyPaid: true,
    });
  }

  if (
    gatewayReceivable &&
    gatewayReceivable.gateway_provider === providerCode &&
    gatewayReceivable.gateway_payment_method ===
      gatewayPaymentMethodForCharge &&
    gatewayReceivable.gateway_environment === environment &&
    Number(gatewayReceivable.gateway_installments || 1) ===
      Number(charge.installmentCount || 1) &&
    Math.round(Number(gatewayReceivable.valor || 0) * 100) ===
      Math.round(Number(charge.value || 0) * 100) &&
    String(gatewayReceivable.data_vencimento || "").slice(0, 10) ===
      String(dataVencimento || "").slice(0, 10) &&
    !isRemoteTitleNonPayable(gatewayReceivable) &&
    (
      providerCode !== "mercado_pago" ||
      gatewayPaymentMethodForCharge !== "PIX" ||
      Boolean(
        gatewayReceivable.gateway_pix_payload ||
          gatewayReceivable.gateway_pix_encoded_image,
      )
    ) &&
    resolveCheckoutUrl(gatewayReceivable)
  ) {
    await repairGatewayTransactionFromReceivable(admin, gatewayReceivable);
    return json({
      url: resolveCheckoutUrl(gatewayReceivable),
      alreadyPending: true,
    });
  }

  const preserveReservedBaneseNumber = Boolean(
    gatewayReceivable?.gateway_provider === "banese_card" &&
      providerCode === "banese_card" &&
      gatewayReceivable?.gateway_environment === environment &&
      gatewayReceivable?.gateway_payment_method === "BOLETO" &&
      gatewayPaymentMethodForCharge === "BOLETO" &&
      Number(gatewayReceivable?.gateway_installments || 1) ===
        Number(charge.installmentCount || 1) &&
      Math.round(Number(gatewayReceivable?.valor || 0) * 100) ===
        Math.round(Number(charge.value || 0) * 100) &&
      String(gatewayReceivable?.data_vencimento || "").slice(0, 10) ===
        String(dataVencimento || "").slice(0, 10) &&
      !isRemoteTitleNonPayable(gatewayReceivable) &&
      gatewayReceivable?.gateway_boleto_nosso_numero,
  );
  const staleGatewayFields = gatewayReceivable?.id
    ? {
      gateway_payment_id: null,
      gateway_customer_id: null,
      gateway_payment_link_id: null,
      gateway_installment_id: null,
      gateway_invoice_url: null,
      gateway_bank_slip_url: null,
      gateway_pix_payload: null,
      gateway_pix_encoded_image: null,
      gateway_boleto_linha_digitavel: preserveReservedBaneseNumber
        ? gatewayReceivable.gateway_boleto_linha_digitavel || null
        : null,
      gateway_boleto_codigo_barras: preserveReservedBaneseNumber
        ? gatewayReceivable.gateway_boleto_codigo_barras || null
        : null,
      gateway_boleto_nosso_numero: preserveReservedBaneseNumber
        ? gatewayReceivable.gateway_boleto_nosso_numero
        : null,
      gateway_boleto_issued_at: boletoIssuedAtAfterReset(
        gatewayReceivable,
        preserveReservedBaneseNumber,
      ),
      gateway_financial_terms: preserveReservedBaneseNumber
        ? gatewayReceivable.gateway_financial_terms || null
        : null,
      gateway_financial_terms_confirmed_at: preserveReservedBaneseNumber
        ? gatewayReceivable.gateway_financial_terms_confirmed_at || null
        : null,
      gateway_transaction_receipt_url: null,
      gateway_synced_at: null,
    }
    : {};

  if (
    gatewayReceivable &&
    gatewayReceivable.gateway_provider === "asaas" &&
    (gatewayReceivable.asaas_payment_id ||
      gatewayReceivable.asaas_payment_link_id)
  ) {
    await tryCancelLegacyAsaasPayment(admin, environment, gatewayReceivable);
    const switchMessage = `Cobrança Asaas anterior substituída por ${
      providerLabelFor(providerCode)
    } conforme a rota da integração bancária.`;
    const { data: clearedReceivable, error: clearReceivableError } = await admin
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
        asaas_last_error: switchMessage,
        gateway_provider: null,
        gateway_environment: null,
        gateway_payment_method: null,
        gateway_payment_id: null,
        gateway_customer_id: null,
        gateway_payment_link_id: null,
        gateway_installment_id: null,
        gateway_invoice_url: null,
        gateway_bank_slip_url: null,
        gateway_pix_payload: null,
        gateway_pix_encoded_image: null,
        gateway_boleto_linha_digitavel: null,
        gateway_boleto_codigo_barras: null,
        gateway_boleto_nosso_numero: null,
        gateway_boleto_issued_at: null,
        gateway_financial_terms: null,
        gateway_financial_terms_confirmed_at: null,
        gateway_transaction_receipt_url: null,
        gateway_status: null,
        gateway_last_error: switchMessage,
        gateway_synced_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", gatewayReceivable.id)
      .neq("status", "PAGO")
      .select()
      .maybeSingle();
    if (clearReceivableError) throw clearReceivableError;
    gatewayReceivable = clearedReceivable || gatewayReceivable;
  }

  assertGatewayTitleCanBeReset(gatewayReceivable, {
    allowBaneseRecovery: preserveReservedBaneseNumber,
  });

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
    origem_pagamento: "GATEWAY_ONLINE",
    gateway_provider: providerCode,
    gateway_environment: environment,
    gateway_payment_method: gatewayPaymentMethodForCharge,
    gateway_installments: charge.installmentCount || 1,
    gateway_status: null,
    gateway_last_error: null,
    ...staleGatewayFields,
    updated_at: new Date().toISOString(),
    ...(isEadCheckout ? receivableFeeFields : {}),
  };

  if (gatewayReceivable?.id) {
    const { data: updated, error: updateError } = await admin
      .from("contas_receber")
      .update(receivablePayload)
      .eq("id", gatewayReceivable.id)
      .neq("status", "PAGO")
      .select()
      .maybeSingle();
    if (updateError) throw updateError;
    gatewayReceivable = updated || gatewayReceivable;
  } else {
    const { data: inserted, error: insertError } = await admin
      .from("contas_receber")
      .insert(receivablePayload)
      .select()
      .single();
    if (insertError) throw insertError;
    gatewayReceivable = inserted;
  }

  state.checkoutReceivableId = gatewayReceivable?.id || null;
  const staleCreatingBefore = new Date(Date.now() - 2 * 60 * 1000)
    .toISOString();
  const { data: lockedReceivable, error: lockError } = await admin
    .from("contas_receber")
    .update({
      gateway_provider: providerCode,
      gateway_environment: environment,
      gateway_payment_method: gatewayPaymentMethodForCharge,
      gateway_installments: charge.installmentCount || 1,
      gateway_status: "CREATING",
      gateway_last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", gatewayReceivable.id)
    .is("gateway_payment_id", null)
    .or(
      `gateway_status.is.null,gateway_status.neq.CREATING,updated_at.lt.${staleCreatingBefore}`,
    )
    .select()
    .maybeSingle();
  if (lockError) throw lockError;
  if (!lockedReceivable) {
    const { data: currentReceivable } = await admin
      .from("contas_receber")
      .select("*")
      .eq("id", gatewayReceivable.id)
      .maybeSingle();
    const currentUrl = resolveCheckoutUrl(currentReceivable);
    if (
      currentUrl &&
      currentReceivable?.gateway_provider === providerCode &&
      currentReceivable?.gateway_payment_method ===
        gatewayPaymentMethodForCharge &&
      currentReceivable?.gateway_environment === environment &&
      Number(currentReceivable?.gateway_installments || 1) ===
        Number(charge.installmentCount || 1) &&
      (
        providerCode !== "mercado_pago" ||
        gatewayPaymentMethodForCharge !== "PIX" ||
        Boolean(
          currentReceivable?.gateway_pix_payload ||
            currentReceivable?.gateway_pix_encoded_image,
        )
      )
    ) {
      await repairGatewayTransactionFromReceivable(
        admin,
        currentReceivable,
      );
      return json({ url: currentUrl, alreadyPending: true });
    }
    throw new Error(
      "A cobrança já está sendo preparada. Aguarde alguns instantes e tente novamente.",
    );
  }

  let gatewayResult: any;
  try {
    const publicBaseUrl = resolvePublicBaseUrl();
    const financialTerms = providerCode === "banese_card" &&
        gatewayPaymentMethodForCharge === "BOLETO"
      ? baneseFinancialTermsFromCharge({
        amount: charge.value,
        dueDate: dataVencimento,
        discount: charge.discount,
        interest: charge.interest,
        fine: charge.fine,
      })
      : null;
    gatewayResult = await createGatewayCharge({
      admin,
      supabaseUrl,
      providerCode,
      credentialId: gatewayRoute.credentialId,
      environment,
      paymentMethod: gatewayPaymentMethodForCharge,
      receivable: lockedReceivable,
      payer: {
        id: aluno.id,
        name: aluno.nome,
        email: aluno.email,
        document: gatewayDocument,
        phone: aluno.telefone,
        address: aluno.endereco,
        number: aluno.numero,
        complement: aluno.complemento,
        postalCode: aluno.cep,
        district: aluno.bairro,
        city: aluno.cidade,
        state: aluno.uf ?? aluno.estado,
      },
      amount: Number(charge.value || 0),
      description: charge.description,
      dueDate: dataVencimento,
      installments: charge.installmentCount || 1,
      successUrl: publicBaseUrl
        ? `${publicBaseUrl}/aluno?module=perfil&tab=documentos&technicalEnrollment=1&gateway=success`
        : null,
      failureUrl: publicBaseUrl
        ? `${publicBaseUrl}/aluno?gateway=failure`
        : null,
      pendingUrl: publicBaseUrl
        ? `${publicBaseUrl}/aluno?gateway=pending`
        : null,
      financialTerms,
    });
    state.paymentCreated = true;
  } catch (gatewayError) {
    await admin.from("contas_receber").update({
      gateway_status: null,
      gateway_last_error: normalizeErrorMessage(gatewayError),
      updated_at: new Date().toISOString(),
    }).eq("id", lockedReceivable.id);
    throw gatewayError;
  }

  const { data: updatedReceivable, error: updateGatewayError } = await admin
    .from("contas_receber")
    .update(gatewayReceivableUpdate({
      providerCode,
      environment,
      paymentMethod: gatewayPaymentMethodForCharge,
      installments: charge.installmentCount || 1,
      result: gatewayResult,
    }))
    .eq("id", lockedReceivable.id)
    .select()
    .single();
  if (updateGatewayError) throw updateGatewayError;

  const inscricaoPayload: any = {
    curso_id: course.id,
    turma_id: turma.id,
    aluno_id: aluno.id,
    matricula_id: matricula.id,
    asaas_payment_id: null,
    asaas_customer_id: null,
    asaas_payment_link_id: null,
    gateway_provider: providerCode,
    gateway_environment: environment,
    gateway_payment_id: gatewayResult.remotePaymentId ||
      gatewayResult.remotePaymentLinkId,
    gateway_customer_id: gatewayResult.remoteCustomerId,
    gateway_payment_link_id: gatewayResult.remotePaymentLinkId,
    nome: aluno.nome,
    cpf_cnpj: gatewayDocument || null,
    email: aluno.email || null,
    telefone: aluno.telefone || null,
    valor: charge.value,
    status: PENDENTE_INSCRICAO_STATUS,
    forma_pagamento: mapBillingType(gatewayPaymentMethodForCharge),
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
  const inscriptionQuery = pendingInscricoes?.[0]
    ? admin.from("inscricoes_online").update(inscricaoPayload).eq(
      "id",
      pendingInscricoes[0].id,
    )
    : admin.from("inscricoes_online").insert(inscricaoPayload);
  const { data: savedInscricao, error: inscriptionError } =
    await inscriptionQuery.select("id").maybeSingle();
  if (inscriptionError) throw inscriptionError;

  await persistProviderGatewayTransaction(admin, {
    receivable: updatedReceivable,
    inscricaoOnlineId: savedInscricao?.id || pendingInscricoes?.[0]?.id || null,
    providerCode,
    environment,
    paymentMethod: gatewayPaymentMethodForCharge,
    amount: Number(charge.value || 0),
    installments: charge.installmentCount || 1,
    result: gatewayResult,
  });

  return json({
    url: resolveCheckoutUrl(updatedReceivable),
    matriculaId: matricula.id,
    receivableId: updatedReceivable.id,
    payment: {
      id: gatewayResult.remotePaymentId || gatewayResult.remotePaymentLinkId,
      provider: providerCode,
      method: gatewayPaymentMethodForCharge,
      status: gatewayResult.remoteStatus,
      value: Number(charge.value || 0),
      invoiceUrl: updatedReceivable.gateway_invoice_url,
      bankSlipUrl: updatedReceivable.gateway_bank_slip_url,
      bankSlipDigitableLine: updatedReceivable.gateway_boleto_linha_digitavel,
      bankSlipBarcode: updatedReceivable.gateway_boleto_codigo_barras,
      bankSlipOurNumber: updatedReceivable.gateway_boleto_nosso_numero,
      pixQrCode: gatewayResult.pixPayload || gatewayResult.pixEncodedImage
        ? {
          payload: gatewayResult.pixPayload,
          encodedImage: gatewayResult.pixEncodedImage,
        }
        : null,
    },
  });
};
