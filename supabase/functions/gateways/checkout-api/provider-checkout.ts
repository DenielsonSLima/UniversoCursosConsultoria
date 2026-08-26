import type { CheckoutContext } from "./checkout-context.ts";
import {
  normalizeErrorMessage,
  resolveCheckoutUrl,
  resolvePublicBaseUrl,
} from "./checkout-utils.ts";
import {
  createGatewayCharge,
  type GatewayProviderCode,
  gatewayReceivableUpdate,
  persistGatewayTransaction as persistProviderGatewayTransaction,
  recoverGatewayCharge,
  repairGatewayTransactionFromReceivable,
} from "../router.ts";
import {
  assertGatewayTitleCanBeReset,
  assertNoAmbiguousRemoteCreation,
  hasAmbiguousRemoteCreation,
} from "../checkout/remote-title-guard.ts";
import {
  applyCheckoutAttemptSnapshot,
  CHECKOUT_MUTABLE_RECEIVABLE_STATUSES,
  claimExistingGatewayCheckout,
} from "../checkout/gateway-creation-fence.ts";
import { baneseFinancialTermsFromCharge } from "../api/banese-financial-terms.ts";
import { assertGatewayCreationFence } from "../../asaas/api/gateway-routing-guard.ts";
import { AUTOMATIC_ENROLLMENT_ACTIVATION_SOURCE_STATUSES } from "../webhook/domain/ead-enrollment.ts";
import {
  buildStaleGatewayFields,
  markRemotePaymentCreated,
  repairAndRevalidateProviderReuse,
  repairCheckoutInscricao,
  shouldPreserveReservedBaneseNumber,
  shouldReuseProviderReceivable,
} from "./provider-reuse.ts";

export const handleProviderGatewayCheckout = async (
  context: CheckoutContext,
) => {
  const {
    admin,
    supabaseUrl,
    json,
    state,
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
    await repairGatewayTransactionFromReceivable(admin, gatewayReceivable);
    await repairCheckoutInscricao(context, gatewayReceivable, true);
    if (!keepTechnicalDocumentationPending) {
      await admin.from("matriculas").update({ status: "ATIVO" }).eq(
        "id",
        matricula.id,
      ).in("status", [...AUTOMATIC_ENROLLMENT_ACTIVATION_SOURCE_STATUSES]);
    }
    return json({
      url: resolveCheckoutUrl(gatewayReceivable),
      alreadyPaid: true,
    });
  }

  if (shouldReuseProviderReceivable(gatewayReceivable, context, providerCode)) {
    gatewayReceivable = await repairAndRevalidateProviderReuse(
      context,
      gatewayReceivable,
      providerCode,
    );
    return json({
      url: resolveCheckoutUrl(gatewayReceivable),
      alreadyPending: true,
    });
  }

  const preserveReservedBaneseNumber = shouldPreserveReservedBaneseNumber(
    gatewayReceivable,
    context,
    providerCode,
  );
  const staleGatewayFields = buildStaleGatewayFields(
    gatewayReceivable,
    preserveReservedBaneseNumber,
  );

  const ambiguousAsaasCreation = providerCode === "asaas" &&
    hasAmbiguousRemoteCreation(gatewayReceivable);
  if (!ambiguousAsaasCreation) {
    assertGatewayTitleCanBeReset(gatewayReceivable, {
      allowBaneseRecovery: preserveReservedBaneseNumber,
    });
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

  const attemptToken = crypto.randomUUID();
  let lockedReceivable: any = null;
  let creationOwnedByThisRequest = false;

  if (gatewayReceivable?.id && !ambiguousAsaasCreation) {
    lockedReceivable = await claimExistingGatewayCheckout({
      admin,
      receivable: gatewayReceivable,
      receivablePayload,
      providerCode,
      attemptToken,
    });
    creationOwnedByThisRequest = Boolean(lockedReceivable);
  } else if (!gatewayReceivable?.id) {
    const { data: inserted, error: insertError } = await admin
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
    if (insertError) throw insertError;
    lockedReceivable = inserted;
    creationOwnedByThisRequest = true;
  }

  state.checkoutReceivableId = gatewayReceivable?.id ||
    lockedReceivable?.id || null;
  const publicBaseUrl = resolvePublicBaseUrl();
  const gatewayChargeInput = (
    targetReceivable: any,
    financialTerms: any = null,
  ) => ({
    admin,
    supabaseUrl,
    providerCode,
    credentialId: gatewayRoute.credentialId,
    environment,
    paymentMethod: gatewayPaymentMethodForCharge,
    receivable: targetReceivable,
    payer: {
      id: aluno.id,
      name: aluno.nome,
      email: aluno.email,
      document: gatewayDocument,
      cpfCnpj: gatewayDocument,
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
    failureUrl: publicBaseUrl ? `${publicBaseUrl}/aluno?gateway=failure` : null,
    pendingUrl: publicBaseUrl ? `${publicBaseUrl}/aluno?gateway=pending` : null,
    financialTerms,
  });

  let gatewayResult: any = null;
  if (!lockedReceivable) {
    const { data: currentReceivable, error: currentReceivableError } =
      await admin
        .from("contas_receber")
        .select("*")
        .eq("id", gatewayReceivable.id)
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
      shouldReuseProviderReceivable(currentReceivable, context, providerCode)
    ) {
      const reusableReceivable = await repairAndRevalidateProviderReuse(
        context,
        currentReceivable,
        providerCode,
      );
      return json({
        url: resolveCheckoutUrl(reusableReceivable),
        alreadyPending: true,
      });
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
        state.paymentCreated = true;
      } else {
        throw new Error(
          "A criacao Asaas continua ambigua e nenhuma cobranca canonica foi localizada pelo externalReference. A tentativa foi preservada para nova conciliacao, sem emitir outro titulo.",
        );
      }
    }
  }
  if (!lockedReceivable) {
    throw new Error(
      "A cobrança já está sendo preparada. Aguarde alguns instantes e tente novamente.",
    );
  }

  if (!gatewayResult) {
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
    try {
      gatewayResult = await createGatewayCharge(
        gatewayChargeInput(lockedReceivable, financialTerms),
      );
      state.paymentCreated = true;
    } catch (gatewayError) {
      const remotePaymentMayExist = Boolean(
        gatewayError && typeof gatewayError === "object" &&
          (gatewayError as Record<string, unknown>).remotePaymentCreated ===
            true,
      );
      await admin.from("contas_receber").update({
        gateway_status: remotePaymentMayExist ? "CREATING" : null,
        gateway_creation_token: remotePaymentMayExist ? attemptToken : null,
        gateway_last_error: normalizeErrorMessage(gatewayError),
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
            asaas_last_error: normalizeErrorMessage(gatewayError),
          }
          : {}),
        updated_at: new Date().toISOString(),
      })
        .eq("id", lockedReceivable.id)
        .eq("gateway_creation_token", attemptToken)
        .eq("gateway_provider", providerCode)
        .eq("gateway_environment", environment)
        .eq("gateway_payment_method", gatewayPaymentMethodForCharge)
        .eq("gateway_status", "CREATING")
        .in("status", [...CHECKOUT_MUTABLE_RECEIVABLE_STATUSES])
        .is("gateway_payment_id", null);
      throw gatewayError;
    }
  }

  const { data: postCreateSnapshot, error: postCreateSnapshotError } =
    await admin
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
    environment,
    paymentMethod: gatewayPaymentMethodForCharge,
    attemptToken: creationOwnedByThisRequest ? attemptToken : undefined,
    expectedBankSlipOurNumber: gatewayResult.bankSlipOurNumber,
  });

  let persistQuery = admin
    .from("contas_receber")
    .update({
      ...gatewayReceivableUpdate({
        providerCode,
        environment,
        paymentMethod: gatewayPaymentMethodForCharge,
        installments: charge.installmentCount || 1,
        result: gatewayResult,
      }),
      gateway_creation_token: null,
      gateway_submission_channel: "API",
      gateway_submission_status: "API_REGISTERED",
    })
    .eq("id", lockedReceivable.id)
    .eq("gateway_provider", providerCode)
    .eq("gateway_environment", environment)
    .eq("gateway_payment_method", gatewayPaymentMethodForCharge)
    .eq("gateway_status", "CREATING")
    .in("status", [...CHECKOUT_MUTABLE_RECEIVABLE_STATUSES])
    .is("gateway_payment_id", null);
  persistQuery = applyCheckoutAttemptSnapshot(
    persistQuery,
    postCreateSnapshot,
  );
  const { data: updatedReceivable, error: updateGatewayError } =
    await persistQuery.select().maybeSingle();
  if (updateGatewayError) throw updateGatewayError;
  if (!updatedReceivable) {
    throw new Error(
      "Cobranca mudou antes de persistir o titulo criado no gateway.",
    );
  }

  const savedInscricao = await repairCheckoutInscricao(
    context,
    updatedReceivable,
  );

  await persistProviderGatewayTransaction(admin, {
    receivable: updatedReceivable,
    inscricaoOnlineId: savedInscricao?.id || null,
    providerCode,
    environment,
    paymentMethod: gatewayPaymentMethodForCharge,
    amount: Number(charge.value || 0),
    installments: charge.installmentCount || 1,
    result: gatewayResult,
  });

  const checkoutUrl = resolveCheckoutUrl(updatedReceivable);
  const hasPixPayload = Boolean(
    updatedReceivable.gateway_pix_payload ||
      updatedReceivable.gateway_pix_encoded_image,
  );
  if (!checkoutUrl && !hasPixPayload) {
    throw markRemotePaymentCreated(
      new Error(
        "Nao foi possivel recuperar o link ou QR Code da cobranca criada no gateway.",
      ),
    );
  }

  return json({
    url: checkoutUrl,
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
