import {
  createGatewayCharge,
  gatewayOnlyPrimaryUrl,
  gatewayPrimaryUrl,
  type GatewayProviderCode,
  gatewayReceivableUpdate,
  persistGatewayTransaction,
  repairGatewayTransactionFromReceivable,
} from "../../router.ts";
import { resolveBaneseReceivableFinancialTerms } from "../../api/banese-financial-terms.ts";
import {
  assertGatewayTitleCanBeReset,
  boletoIssuedAtAfterReset,
  isRemoteTitleNonPayable,
} from "../remote-title-guard.ts";
import type { EadCheckoutContext } from "../types.ts";
import {
  documentForGateway,
  normalizeErrorMessage,
  onlyDigits,
  paymentMethodForLegacyField,
  PENDENTE_INSCRICAO_STATUS,
  providerLabelFor,
  publicBaseUrl,
} from "../utils.ts";
import {
  clearPreviousGatewayFields,
  EAD_PAYMENT_RECIPIENT,
  firstHttpUrl,
  paymentResponseFromReceivable,
  shouldReuseReceivable,
} from "./gateway-view.ts";

const markRemotePaymentCreated = (error: unknown) => {
  if (error && typeof error === "object") {
    (error as Record<string, unknown>).remotePaymentCreated = true;
    return error;
  }
  const wrapped = new Error(normalizeErrorMessage(error));
  (wrapped as unknown as Record<string, unknown>).remotePaymentCreated = true;
  return wrapped;
};

const upsertPendingInscricao = async (
  context: EadCheckoutContext,
  input: {
    providerCode: GatewayProviderCode;
    remotePaymentId: string | null;
    remoteCustomerId: string | null;
    remotePaymentLinkId: string | null;
  },
) => {
  const document = documentForGateway(context.aluno.cpf_cnpj);
  const isAsaas = input.providerCode === "asaas";
  const payload = {
    curso_id: context.course.id,
    turma_id: context.turma.id,
    aluno_id: context.aluno.id,
    matricula_id: context.matricula.id,
    asaas_payment_id: isAsaas ? input.remotePaymentId : null,
    asaas_customer_id: isAsaas ? input.remoteCustomerId : null,
    asaas_payment_link_id: isAsaas ? input.remotePaymentLinkId : null,
    gateway_provider: input.providerCode,
    gateway_environment: context.environment,
    gateway_payment_id: input.remotePaymentId,
    gateway_customer_id: input.remoteCustomerId,
    gateway_payment_link_id: input.remotePaymentLinkId,
    nome: context.aluno.nome,
    cpf_cnpj: document || onlyDigits(context.aluno.cpf_cnpj) || null,
    email: context.aluno.email || null,
    telefone: context.aluno.telefone || null,
    valor: context.charge.value,
    status: PENDENTE_INSCRICAO_STATUS,
    forma_pagamento: paymentMethodForLegacyField(context.charge.method),
    erro: null,
    updated_at: new Date().toISOString(),
  };

  const { data: existingInscricoes, error: lookupError } = await context.admin
    .from("inscricoes_online")
    .select("id")
    .eq("matricula_id", context.matricula.id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (lookupError) throw lookupError;

  const query = existingInscricoes?.[0]?.id
    ? context.admin.from("inscricoes_online").update(payload).eq(
      "id",
      existingInscricoes[0].id,
    )
    : context.admin.from("inscricoes_online").insert(payload);

  const { data, error } = await query.select("id").maybeSingle();
  if (error) throw error;
  return data?.id || existingInscricoes?.[0]?.id || null;
};

export const handleGatewayCheckout = async (context: EadCheckoutContext) => {
  const providerCode = context.route.providerCode;

  const { data: existingReceivables, error: existingError } = await context
    .admin
    .from("contas_receber")
    .select("*")
    .eq("matricula_id", context.matricula.id)
    .eq("tipo_lancamento", "MATRICULA")
    .order("created_at", { ascending: false })
    .limit(1);
  if (existingError) throw existingError;

  let receivable = existingReceivables?.[0] || null;

  if (String(receivable?.status || "").toUpperCase() === "PAGO") {
    await context.admin.from("matriculas").update({ status: "ATIVO" }).eq(
      "id",
      context.matricula.id,
    );
    const url = gatewayPrimaryUrl(receivable) || `${publicBaseUrl()}/aluno`;
    return {
      response: {
        url,
        matriculaId: context.matricula.id,
        receivableId: receivable.id,
        alreadyPaid: true,
        payment: paymentResponseFromReceivable(
          receivable,
          context,
          providerCode,
        ),
      },
      createdRemotePayment: false,
      receivableId: receivable.id,
    };
  }

  if (
    shouldReuseReceivable(receivable, context, providerCode)
  ) {
    await repairGatewayTransactionFromReceivable(context.admin, receivable);
    const url = gatewayOnlyPrimaryUrl(receivable) ||
      gatewayPrimaryUrl(receivable);
    return {
      response: {
        url,
        matriculaId: context.matricula.id,
        receivableId: receivable.id,
        alreadyPending: true,
        payment: paymentResponseFromReceivable(
          receivable,
          context,
          providerCode,
        ),
      },
      createdRemotePayment: false,
      receivableId: receivable.id,
    };
  }

  const switchMessage = `Cobranca anterior substituida por ${
    providerLabelFor(providerCode)
  } conforme rota bancaria.`;
  const resetGatewayFields = clearPreviousGatewayFields(switchMessage);
  const sameBaneseCharge = Boolean(
    receivable?.gateway_provider === "banese_card" &&
      providerCode === "banese_card" &&
      receivable?.gateway_environment === context.environment &&
      receivable?.gateway_payment_method === "BOLETO" &&
      context.charge.method === "BOLETO" &&
      Number(receivable?.gateway_installments || 1) ===
        context.charge.installmentCount &&
      Math.round(Number(receivable?.valor || 0) * 100) ===
        Math.round(Number(context.charge.value || 0) * 100) &&
      String(receivable?.data_vencimento || "").slice(0, 10) ===
        String(context.charge.dueDate || "").slice(0, 10) &&
      !isRemoteTitleNonPayable(receivable)
  );
  const preserveReservedBaneseNumber = Boolean(
    sameBaneseCharge &&
      receivable?.gateway_boleto_nosso_numero,
  );
  assertGatewayTitleCanBeReset(receivable, {
    allowBaneseRecovery: preserveReservedBaneseNumber,
  });
  if (preserveReservedBaneseNumber) {
    resetGatewayFields.gateway_boleto_linha_digitavel =
      receivable.gateway_boleto_linha_digitavel || null;
    resetGatewayFields.gateway_boleto_codigo_barras =
      receivable.gateway_boleto_codigo_barras || null;
    resetGatewayFields.gateway_boleto_nosso_numero =
      receivable.gateway_boleto_nosso_numero;
    resetGatewayFields.gateway_boleto_issued_at = boletoIssuedAtAfterReset(
      receivable,
      true,
    );
    resetGatewayFields.gateway_financial_terms =
      receivable.gateway_financial_terms || null;
    resetGatewayFields.gateway_financial_terms_confirmed_at =
      receivable.gateway_financial_terms_confirmed_at || null;
  }
  const receivablePayload = {
    polo_id: context.turma.polo_id,
    descricao: context.charge.description,
    valor: context.charge.value,
    data_vencimento: context.charge.dueDate,
    status: "PENDENTE",
    cliente_id: context.aluno.id,
    matricula_id: context.matricula.id,
    turma_id: context.turma.id,
    forma_pagamento: paymentMethodForLegacyField(context.charge.method),
    categoria: "MENSALIDADE",
    tipo_lancamento: "MATRICULA",
    origem_cronograma_id: "matricula",
    origem_pagamento: "GATEWAY_EAD",
    ...resetGatewayFields,
    gateway_provider: providerCode,
    gateway_environment: context.environment,
    gateway_payment_method: context.charge.method,
    gateway_installments: context.charge.installmentCount,
    updated_at: new Date().toISOString(),
  };

  if (receivable?.id) {
    const { data, error } = await context.admin
      .from("contas_receber")
      .update(receivablePayload)
      .eq("id", receivable.id)
      .neq("status", "PAGO")
      .select()
      .maybeSingle();
    if (error) throw error;
    receivable = data || receivable;
  } else {
    const { data, error } = await context.admin
      .from("contas_receber")
      .insert(receivablePayload)
      .select()
      .single();
    if (error) throw error;
    receivable = data;
  }

  const staleCreatingBefore = new Date(Date.now() - 2 * 60 * 1000)
    .toISOString();
  const { data: lockedReceivable, error: lockError } = await context.admin
    .from("contas_receber")
    .update({
      gateway_provider: providerCode,
      gateway_environment: context.environment,
      gateway_payment_method: context.charge.method,
      gateway_installments: context.charge.installmentCount,
      gateway_status: "CREATING",
      gateway_last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", receivable.id)
    .is("gateway_payment_id", null)
    .or(
      `gateway_status.is.null,gateway_status.neq.CREATING,updated_at.lt.${staleCreatingBefore}`,
    )
    .select()
    .maybeSingle();
  if (lockError) throw lockError;
  if (!lockedReceivable) {
    const { data: currentReceivable } = await context.admin
      .from("contas_receber")
      .select("*")
      .eq("id", receivable.id)
      .maybeSingle();
    if (shouldReuseReceivable(currentReceivable, context, providerCode)) {
      await repairGatewayTransactionFromReceivable(
        context.admin,
        currentReceivable,
      );
      const url = gatewayOnlyPrimaryUrl(currentReceivable) ||
        gatewayPrimaryUrl(currentReceivable);
      return {
        response: {
          url,
          matriculaId: context.matricula.id,
          receivableId: currentReceivable.id,
          alreadyPending: true,
          payment: paymentResponseFromReceivable(
            currentReceivable,
            context,
            providerCode,
          ),
        },
        createdRemotePayment: false,
        receivableId: currentReceivable.id,
      };
    }
    throw new Error(
      "A cobranca ja esta sendo preparada. Aguarde alguns instantes e tente novamente.",
    );
  }

  let gatewayResult: any;
  try {
    const baseUrl = publicBaseUrl();
    const financialTerms = providerCode === "banese_card" &&
        context.charge.method === "BOLETO"
      ? await resolveBaneseReceivableFinancialTerms(
        context.admin,
        lockedReceivable,
      )
      : null;
    gatewayResult = await createGatewayCharge({
      admin: context.admin,
      supabaseUrl: context.supabaseUrl,
      providerCode,
      credentialId: context.route.credentialId,
      environment: context.environment,
      paymentMethod: context.charge.method,
      receivable: lockedReceivable,
      payer: {
        id: context.aluno.id,
        name: context.aluno.nome,
        email: context.aluno.email,
        cpfCnpj: documentForGateway(context.aluno.cpf_cnpj),
        phone: context.aluno.telefone,
        address: context.aluno.endereco,
        number: context.aluno.numero,
        complement: context.aluno.complemento,
        postalCode: context.aluno.cep,
        district: context.aluno.bairro,
        city: context.aluno.cidade,
        state: context.aluno.uf ?? context.aluno.estado,
      },
      amount: context.charge.value,
      description: context.charge.description,
      dueDate: context.charge.dueDate,
      installments: context.charge.installmentCount,
      successUrl: `${baseUrl}/aluno?gateway=success`,
      failureUrl: `${baseUrl}/aluno?gateway=failure`,
      pendingUrl: `${baseUrl}/aluno?gateway=pending`,
      financialTerms,
    });
  } catch (error) {
    await context.admin.from("contas_receber").update({
      gateway_status: null,
      gateway_last_error: normalizeErrorMessage(error),
      updated_at: new Date().toISOString(),
    }).eq("id", lockedReceivable.id);
    throw error;
  }

  let updatedReceivable: any;
  const checkoutUrl = (value: any) =>
    firstHttpUrl(gatewayOnlyPrimaryUrl(value)) || firstHttpUrl(
      value?.gateway_payment_link_id,
    );

  try {
    const { data, error: updateGatewayError } = await context.admin
      .from("contas_receber")
      .update(gatewayReceivableUpdate({
        providerCode,
        environment: context.environment,
        paymentMethod: context.charge.method,
        installments: context.charge.installmentCount,
        result: gatewayResult,
      }))
      .eq("id", lockedReceivable.id)
      .select()
      .single();
    if (updateGatewayError) throw updateGatewayError;
    updatedReceivable = data;

    const inscricaoOnlineId = await upsertPendingInscricao(context, {
      providerCode,
      remotePaymentId: gatewayResult.remotePaymentId ||
        gatewayResult.remotePaymentLinkId,
      remoteCustomerId: gatewayResult.remoteCustomerId,
      remotePaymentLinkId: gatewayResult.remotePaymentLinkId,
    });

    await persistGatewayTransaction(context.admin, {
      receivable: updatedReceivable,
      inscricaoOnlineId,
      providerCode,
      environment: context.environment,
      paymentMethod: context.charge.method,
      amount: context.charge.value,
      installments: context.charge.installmentCount,
      result: gatewayResult,
    });
  } catch (error) {
    throw markRemotePaymentCreated(error);
  }

  const url = checkoutUrl(updatedReceivable);
  const pixQrCode = gatewayResult.pixPayload || gatewayResult.pixEncodedImage
    ? {
      payload: gatewayResult.pixPayload,
      encodedImage: gatewayResult.pixEncodedImage,
    }
    : null;
  if (!url && !pixQrCode) {
    throw new Error(
      "Nao foi possivel recuperar o link do checkout gerado pelo provedor configurado.",
    );
  }

  return {
    response: {
      url,
      matriculaId: context.matricula.id,
      receivableId: updatedReceivable.id,
      payment: {
        id: gatewayResult.remotePaymentId || gatewayResult.remotePaymentLinkId,
        provider: providerCode,
        method: context.charge.method,
        installments: context.charge.installmentCount,
        status: gatewayResult.remoteStatus,
        value: context.charge.value,
        courseName: context.course.nome,
        recipient: EAD_PAYMENT_RECIPIENT,
        dueDate: context.charge.dueDate,
        invoiceUrl: updatedReceivable.gateway_invoice_url,
        bankSlipUrl: updatedReceivable.gateway_bank_slip_url,
        bankSlipDigitableLine: updatedReceivable.gateway_boleto_linha_digitavel,
        bankSlipBarcode: updatedReceivable.gateway_boleto_codigo_barras,
        bankSlipOurNumber: updatedReceivable.gateway_boleto_nosso_numero,
        pixQrCode,
      },
    },
    createdRemotePayment: true,
    receivableId: updatedReceivable.id,
  };
};
