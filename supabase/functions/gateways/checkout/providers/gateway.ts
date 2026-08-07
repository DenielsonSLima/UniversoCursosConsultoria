import {
  createGatewayCharge,
  gatewayOnlyPrimaryUrl,
  gatewayPrimaryUrl,
  gatewayReceivableUpdate,
  persistGatewayTransaction,
  recoverGatewayCharge,
  repairGatewayTransactionFromReceivable,
} from "../../router.ts";
import { resolveBaneseReceivableFinancialTerms } from "../../api/banese-financial-terms.ts";
import {
  assertGatewayTitleCanBeReset,
  assertNoAmbiguousRemoteCreation,
  boletoIssuedAtAfterReset,
  hasAmbiguousRemoteCreation,
  isRemoteTitleNonPayable,
} from "../remote-title-guard.ts";
import {
  applyCheckoutAttemptSnapshot,
  CHECKOUT_MUTABLE_RECEIVABLE_STATUSES,
  claimExistingGatewayCheckout,
} from "../gateway-creation-fence.ts";
import { assertGatewayCreationFence } from "../../../asaas/api/gateway-routing-guard.ts";
import {
  hasRepairableOnlineInscriptionIdentity,
  repairOnlineInscription,
} from "../../online-inscription.ts";
import type { EadCheckoutContext } from "../types.ts";
import {
  documentForGateway,
  normalizeErrorMessage,
  paymentMethodForLegacyField,
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
import { AUTOMATIC_ENROLLMENT_ACTIVATION_SOURCE_STATUSES } from "../../webhook/domain/ead-enrollment.ts";

const markRemotePaymentCreated = (error: unknown) => {
  if (error && typeof error === "object") {
    (error as Record<string, unknown>).remotePaymentCreated = true;
    return error;
  }
  const wrapped = new Error(normalizeErrorMessage(error));
  (wrapped as unknown as Record<string, unknown>).remotePaymentCreated = true;
  return wrapped;
};

const repairCheckoutInscricao = async (
  context: EadCheckoutContext,
  receivable: any,
  requireGatewayTransaction = false,
) => {
  if (!hasRepairableOnlineInscriptionIdentity(receivable)) return null;
  return await repairOnlineInscription({
    admin: context.admin,
    receivable,
    legacyPaymentMethod: paymentMethodForLegacyField(
      receivable.gateway_payment_method || context.charge.method,
    ),
    academic: {
      course: context.course,
      turma: context.turma,
      aluno: context.aluno,
      matricula: context.matricula,
    },
    requireGatewayTransaction,
  });
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
    await repairGatewayTransactionFromReceivable(context.admin, receivable);
    await repairCheckoutInscricao(context, receivable, true);
    await context.admin.from("matriculas").update({ status: "ATIVO" }).eq(
      "id",
      context.matricula.id,
    ).in("status", [...AUTOMATIC_ENROLLMENT_ACTIVATION_SOURCE_STATUSES]);
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
    await repairCheckoutInscricao(context, receivable, true);
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
      !isRemoteTitleNonPayable(receivable),
  );
  const preserveReservedBaneseNumber = Boolean(
    sameBaneseCharge &&
      receivable?.gateway_boleto_nosso_numero,
  );
  const ambiguousAsaasCreation = providerCode === "asaas" &&
    hasAmbiguousRemoteCreation(receivable);
  if (!ambiguousAsaasCreation) {
    assertGatewayTitleCanBeReset(receivable, {
      allowBaneseRecovery: preserveReservedBaneseNumber,
    });
  }
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
    // Termos simulados de checkout não são fatos contábeis. Tarifa real só é
    // reconhecida quando confirmada e lançada separadamente como despesa.
    asaas_fee_value: null,
    asaas_net_value: null,
    gateway_fee_value: null,
    gateway_net_value: null,
    updated_at: new Date().toISOString(),
  };

  const attemptToken = crypto.randomUUID();
  let lockedReceivable: any = null;
  let creationOwnedByThisRequest = false;

  if (receivable?.id && !ambiguousAsaasCreation) {
    lockedReceivable = await claimExistingGatewayCheckout({
      admin: context.admin,
      receivable,
      receivablePayload,
      providerCode,
      attemptToken,
    });
    creationOwnedByThisRequest = Boolean(lockedReceivable);
  } else if (!receivable?.id) {
    const { data, error } = await context.admin
      .from("contas_receber")
      .insert({
        ...receivablePayload,
        gateway_status: "CREATING",
        gateway_creation_token: attemptToken,
        ...(providerCode === "asaas"
          ? {
            asaas_status: "CREATING",
            asaas_last_error: null,
          }
          : {}),
      })
      .select()
      .single();
    if (error) throw error;
    lockedReceivable = data;
    creationOwnedByThisRequest = true;
  }

  const baseUrl = publicBaseUrl();
  const gatewayChargeInput = (
    targetReceivable: any,
    financialTerms:
      | Awaited<
        ReturnType<typeof resolveBaneseReceivableFinancialTerms>
      >
      | null = null,
  ) => ({
    admin: context.admin,
    supabaseUrl: context.supabaseUrl,
    providerCode,
    credentialId: context.route.credentialId,
    environment: context.environment,
    paymentMethod: context.charge.method,
    receivable: targetReceivable,
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

  let gatewayResult: any = null;
  if (!lockedReceivable) {
    const { data: currentReceivable, error: currentReceivableError } =
      await context.admin
        .from("contas_receber")
        .select("*")
        .eq("id", receivable.id)
        .maybeSingle();
    if (currentReceivableError) throw currentReceivableError;
    const currentCreationIsAmbiguous = hasAmbiguousRemoteCreation(
      currentReceivable,
    );
    if (currentCreationIsAmbiguous && providerCode !== "asaas") {
      assertNoAmbiguousRemoteCreation(currentReceivable);
    }
    if (
      !currentCreationIsAmbiguous &&
      shouldReuseReceivable(currentReceivable, context, providerCode)
    ) {
      await repairGatewayTransactionFromReceivable(
        context.admin,
        currentReceivable,
      );
      await repairCheckoutInscricao(context, currentReceivable, true);
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
    if (
      providerCode === "asaas" &&
      currentCreationIsAmbiguous
    ) {
      gatewayResult = await recoverGatewayCharge(
        gatewayChargeInput(currentReceivable),
      );
      if (gatewayResult) {
        lockedReceivable = currentReceivable;
      } else {
        throw new Error(
          "A criacao Asaas continua ambigua e nenhuma cobranca canonica foi localizada pelo externalReference. A tentativa foi preservada para nova conciliacao, sem emitir outro titulo.",
        );
      }
    }
  }
  if (!lockedReceivable) {
    throw new Error(
      "A cobranca ja esta sendo preparada. Aguarde alguns instantes e tente novamente.",
    );
  }

  if (!gatewayResult) {
    const financialTerms = providerCode === "banese_card" &&
        context.charge.method === "BOLETO"
      ? await resolveBaneseReceivableFinancialTerms(
        context.admin,
        lockedReceivable,
      )
      : null;
    try {
      gatewayResult = await createGatewayCharge(
        gatewayChargeInput(lockedReceivable, financialTerms),
      );
    } catch (error) {
      const remotePaymentMayExist = Boolean(
        error && typeof error === "object" &&
          (error as Record<string, unknown>).remotePaymentCreated === true,
      );
      await context.admin.from("contas_receber").update({
        gateway_status: remotePaymentMayExist ? "CREATING" : null,
        gateway_creation_token: remotePaymentMayExist ? attemptToken : null,
        gateway_last_error: normalizeErrorMessage(error),
        ...(remotePaymentMayExist
          ? {
            gateway_submission_channel: "API",
            gateway_submission_status:
              lockedReceivable.gateway_submission_status === "API_REGISTERED"
                ? "API_REGISTERED"
                : "API_AMBIGUOUS",
          }
          : {}),
        ...(providerCode === "asaas"
          ? {
            asaas_status: remotePaymentMayExist ? "CREATING" : null,
            asaas_last_error: normalizeErrorMessage(error),
          }
          : {}),
        updated_at: new Date().toISOString(),
      })
        .eq("id", lockedReceivable.id)
        .eq("gateway_creation_token", attemptToken)
        .eq("gateway_provider", providerCode)
        .eq("gateway_environment", context.environment)
        .eq("gateway_payment_method", context.charge.method)
        .eq("gateway_status", "CREATING")
        .in("status", [...CHECKOUT_MUTABLE_RECEIVABLE_STATUSES])
        .is("gateway_payment_id", null);
      throw error;
    }
  }

  let updatedReceivable: any;
  const checkoutUrl = (value: any) =>
    firstHttpUrl(gatewayOnlyPrimaryUrl(value)) || firstHttpUrl(
      value?.gateway_payment_link_id,
    );

  try {
    const { data: postCreateSnapshot, error: postCreateSnapshotError } =
      await context.admin
        .from("contas_receber")
        .select("*")
        .eq("id", lockedReceivable.id)
        .maybeSingle();
    if (postCreateSnapshotError) throw postCreateSnapshotError;
    if (!postCreateSnapshot) {
      throw new Error("Cobranca nao encontrada apos a criacao no gateway.");
    }
    assertGatewayCreationFence({
      receivable: postCreateSnapshot,
      providerCode,
      environment: context.environment,
      paymentMethod: context.charge.method,
      attemptToken: creationOwnedByThisRequest ? attemptToken : undefined,
      expectedBankSlipOurNumber: gatewayResult.bankSlipOurNumber,
    });

    let persistQuery = context.admin
      .from("contas_receber")
      .update({
        ...gatewayReceivableUpdate({
          providerCode,
          environment: context.environment,
          paymentMethod: context.charge.method,
          installments: context.charge.installmentCount,
          result: gatewayResult,
        }),
        gateway_creation_token: null,
        gateway_submission_channel: "API",
        gateway_submission_status: "API_REGISTERED",
      })
      .eq("id", lockedReceivable.id)
      .eq("gateway_provider", providerCode)
      .eq("gateway_environment", context.environment)
      .eq("gateway_payment_method", context.charge.method)
      .eq("gateway_status", "CREATING")
      .in("status", [...CHECKOUT_MUTABLE_RECEIVABLE_STATUSES])
      .is("gateway_payment_id", null);
    persistQuery = applyCheckoutAttemptSnapshot(
      persistQuery,
      postCreateSnapshot,
    );
    const { data, error: updateGatewayError } = await persistQuery.select()
      .maybeSingle();
    if (updateGatewayError) throw updateGatewayError;
    if (!data) {
      throw new Error(
        "Cobranca mudou antes de persistir o titulo criado no gateway.",
      );
    }
    updatedReceivable = data;

    const inscricaoOnline = await repairCheckoutInscricao(
      context,
      updatedReceivable,
    );

    await persistGatewayTransaction(context.admin, {
      receivable: updatedReceivable,
      inscricaoOnlineId: inscricaoOnline?.id || null,
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
    throw markRemotePaymentCreated(
      new Error(
        "Nao foi possivel recuperar o link do checkout gerado pelo provedor configurado.",
      ),
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
