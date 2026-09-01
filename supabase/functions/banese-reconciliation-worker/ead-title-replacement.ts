import { cancelBaneseBoleto } from "../banese/core/adapter.ts";
import { reconcileBaneseReceivable } from "../gateways/api/banese.ts";
import { resolvePaymentGatewayRoute } from "../gateways/checkout/ead-context.ts";
import { handleGatewayCheckout } from "../gateways/checkout/providers/gateway.ts";
import { repairCheckoutInscricao } from "../gateways/checkout/providers/gateway-reuse.ts";
import {
  classifyReissueState,
  hasPartialPix,
  hasPixPair,
  hasRecoverablePendingPix,
  reconciliationIsPaid,
} from "./ead-title-replacement-state.ts";
import type {
  EadCheckoutContext,
  GatewayEnvironment,
} from "../gateways/checkout/types.ts";

type ReplacementClaim = {
  claimed: boolean;
  jobId?: string;
  leaseToken?: string;
  status?: "PROCESSING" | "RECOVERING_PIX" | "CANCEL_FENCED" | "REISSUING";
  receivableId?: string;
  environment?: GatewayEnvironment;
  convenio?: string;
  nossoNumero?: string;
};

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

const loadOne = async (admin: any, table: string, id: string) => {
  const { data, error } = await admin.from(table).select("*").eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`REPLACEMENT_${table.toUpperCase()}_NOT_FOUND`);
  return data;
};

const finishJob = async (
  admin: any,
  input: {
    jobId: string;
    leaseToken: string;
    result: string;
    replacementNossoNumero?: string | null;
    errorCode?: string | null;
  },
) => {
  const { data, error } = await admin.rpc(
    "finish_banese_ead_title_replacement",
    {
      p_job_id: input.jobId,
      p_lease_token: input.leaseToken,
      p_result: input.result,
      p_replacement_nosso_numero: input.replacementNossoNumero || null,
      p_error_code: input.errorCode || null,
    },
  );
  if (error) throw error;
  return data;
};

const replacementRpc = async (
  admin: any,
  name: string,
  args: Record<string, unknown>,
) => {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw error;
  return data;
};

const replacementErrorCode = (error: unknown) => {
  const safeMessage = String(
    error && typeof error === "object" && "message" in error
      ? (error as { message?: unknown }).message
      : "",
  ).trim().toUpperCase();
  if (/^REPLACEMENT_[A-Z0-9_]{3,68}$/.test(safeMessage)) {
    return safeMessage;
  }
  const name = String(
    error && typeof error === "object" && "name" in error
      ? (error as { name?: unknown }).name
      : "REPLACEMENT_ERROR",
  ).toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  return (name || "REPLACEMENT_ERROR").slice(0, 80);
};

const cancellationEvidenceFingerprint = async (canceled: any) => {
  const evidence = JSON.stringify({
    nossoNumero: digits(canceled.nossoNumero),
    situationCode: Number(canceled.situationCode),
    remoteStatus: String(canceled.remoteStatus || "").toUpperCase(),
    alreadyCanceled: canceled.alreadyCanceled === true,
    mutationAttempted: canceled.mutationAttempted === true,
    sanitizedSnapshot: canceled.raw || null,
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(evidence),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const loadReplacementIdentity = async (admin: any, receivable: any) => {
  const [payer, credential] = await Promise.all([
    loadOne(admin, "parceiros", String(receivable.cliente_id)),
    admin.from("payment_gateway_credentials").select("metadata")
      .eq("provider_code", "banese_card")
      .eq("environment", receivable.gateway_environment).maybeSingle(),
  ]);
  if (credential.error) throw credential.error;
  const metadata = credential.data?.metadata &&
      typeof credential.data.metadata === "object"
    ? credential.data.metadata
    : {};
  const payerDocument = digits(payer.cpf_cnpj);
  const receivableAgency = digits(receivable.gateway_boleto_agencia)
    .padStart(3, "0").slice(-3);
  const configuredAgency = digits(metadata.baneseAgencia)
    .padStart(3, "0").slice(-3);
  const configuredAccount = digits(
    metadata.baneseConta || metadata.baneseContaDisplay,
  );
  const receivableAgreement = digits(receivable.gateway_boleto_convenio);
  const configuredAgreement = digits(
    metadata.baneseBoletoConvenio || metadata.baneseConvenio,
  );
  if (![11, 14].includes(payerDocument.length)) {
    throw new Error("REPLACEMENT_PAYER_IDENTITY_INVALID");
  }
  if (
    !/^\d{3}$/.test(receivableAgency) || receivableAgency === "000" ||
    configuredAgency !== receivableAgency ||
    !/^\d{9}$/.test(configuredAccount) ||
    !receivableAgreement || configuredAgreement !== receivableAgreement
  ) {
    throw new Error("REPLACEMENT_BENEFICIARY_IDENTITY_INVALID");
  }
  return {
    payer,
    metadata,
    payerDocument,
    agency: configuredAgency,
    account: configuredAccount,
  };
};

const cancelFencedTitle = async (
  admin: any,
  claim: ReplacementClaim,
  receivable: any,
) => {
  const identity = await loadReplacementIdentity(admin, receivable);
  return await cancelBaneseBoleto(admin, claim.environment!, {
    convenio: claim.convenio,
    nossoNumero: claim.nossoNumero,
    stopWhenPixAvailable: true,
    expectedAmount: receivable.valor,
    expectedDueDate: receivable.data_vencimento,
    expectedAgency: identity.agency,
    expectedAccount: identity.account,
    expectedDocumentNumber: String(receivable.id).slice(0, 15),
    expectedCompanyTitleId: String(receivable.id).slice(0, 25),
    expectedPayerDocument: identity.payerDocument,
    expectedDigitableLine: receivable.gateway_boleto_linha_digitavel,
    expectedBarcode: receivable.gateway_boleto_codigo_barras,
    onMutationStart: () => replacementRpc(
      admin,
      "mark_banese_ead_title_cancel_mutation_intent",
      { p_job_id: claim.jobId, p_lease_token: claim.leaseToken },
    ),
  });
};

const buildOfficialCheckoutContext = async (
  admin: any,
  supabaseUrl: string,
  receivable: any,
) => {
  const [aluno, matricula, turma] = await Promise.all([
    loadOne(admin, "parceiros", String(receivable.cliente_id)),
    loadOne(admin, "matriculas", String(receivable.matricula_id)),
    loadOne(admin, "turmas", String(receivable.turma_id)),
  ]);
  const course = await loadOne(admin, "cursos", String(turma.curso_id));
  if (
    String(course.modalidade || "").toUpperCase() !== "EAD" ||
    matricula.aluno_id !== aluno.id || matricula.turma_id !== turma.id ||
    receivable.cliente_id !== aluno.id || receivable.matricula_id !== matricula.id ||
    receivable.turma_id !== turma.id
  ) {
    throw new Error("REPLACEMENT_EAD_IDENTITY_MISMATCH");
  }
  const environment = String(receivable.gateway_environment) as GatewayEnvironment;
  const routed = await resolvePaymentGatewayRoute(
    admin,
    "EAD",
    "BOLETO",
    environment,
  );
  if (
    routed.environment !== environment ||
    routed.route.providerCode !== "banese_card"
  ) {
    throw new Error("REPLACEMENT_EAD_ROUTE_MISMATCH");
  }
  const body = {
    courseId: course.id,
    alunoId: aluno.id,
    turmaId: turma.id,
    receivableId: receivable.id,
    paymentMethod: "BOLETO",
    presentation: "PIX",
  };
  const context: EadCheckoutContext = {
    req: new Request(`${supabaseUrl}/functions/v1/payment-checkout`, {
      method: "POST",
    }),
    bodyText: JSON.stringify(body),
    body,
    admin,
    supabaseUrl,
    corsHeaders: {},
    environment,
    course,
    aluno,
    turma,
    matricula,
    charge: {
      method: "BOLETO",
      installmentCount: Number(receivable.gateway_installments || 1),
      value: Number(receivable.valor),
      feeValue: 0,
      netValue: Number(receivable.valor),
      description: String(receivable.descricao),
      dueDate: String(receivable.data_vencimento).slice(0, 10),
    },
    route: routed.route,
  };
  return context;
};

const reissueThroughOfficialCheckout = async (
  admin: any,
  supabaseUrl: string,
  receivable: any,
) =>
  await handleGatewayCheckout(
    await buildOfficialCheckoutContext(admin, supabaseUrl, receivable),
  );

const finishExistingRemoteState = async (
  admin: any,
  supabaseUrl: string,
  claim: ReplacementClaim,
  receivable: any,
) => {
  const classified = classifyReissueState(claim, receivable);
  if (classified.state !== "REGISTERED_COMPLETE") return null;
  if (hasPartialPix(receivable)) {
    throw new Error("REPLACEMENT_NEW_TITLE_PARTIAL_PIX");
  }
  const inscription = await repairCheckoutInscricao(
    await buildOfficialCheckoutContext(admin, supabaseUrl, receivable),
    receivable,
    true,
  );
  if (!inscription?.id) {
    throw new Error("REPLACEMENT_INSCRIPTION_NOT_CONVERGED");
  }
  const result = String(receivable.status || "").toUpperCase() === "PAGO"
    ? "REISSUED_PAID"
    : hasPixPair(receivable) ? "COMPLETED" : "REISSUED_PIX_PENDING";
  await finishJob(admin, {
    jobId: claim.jobId!,
    leaseToken: claim.leaseToken!,
    result,
    replacementNossoNumero: classified.nossoNumero,
  });
  return { handled: true, result, nossoNumero: classified.nossoNumero };
};

export const processOneBaneseEadTitleReplacement = async (
  admin: any,
  supabaseUrl: string,
) => {
  const { data, error } = await admin.rpc(
    "claim_banese_ead_title_replacement",
  );
  if (error) {
    if (String(error.code || "") === "PGRST202") return { handled: false };
    throw error;
  }
  const claim = (data || {}) as ReplacementClaim;
  if (!claim.claimed) return { handled: false };

  try {
    let receivable = await loadOne(
      admin,
      "contas_receber",
      String(claim.receivableId),
    );
    if (claim.status === "RECOVERING_PIX") {
      const recovered = await reconcileBaneseReceivable(
        admin,
        claim.receivableId,
      );
      if (reconciliationIsPaid(recovered)) {
        await finishJob(admin, {
          jobId: claim.jobId!,
          leaseToken: claim.leaseToken!,
          result: "STOPPED_PAID",
        });
        return { handled: true, result: "STOPPED_PAID" };
      }
      if (!hasRecoverablePendingPix(recovered)) {
        throw new Error("REPLACEMENT_PIX_RECOVERY_PENDING");
      }
      await finishJob(admin, {
        jobId: claim.jobId!,
        leaseToken: claim.leaseToken!,
        result: "RECOVERED_EXISTING_PIX",
      });
      return { handled: true, result: "RECOVERED_EXISTING_PIX" };
    }
    if (claim.status === "PROCESSING") {
      const reconciliation = await reconcileBaneseReceivable(
        admin,
        claim.receivableId,
      );
      receivable = reconciliation.receivable || await loadOne(
        admin,
        "contas_receber",
        String(claim.receivableId),
      );
      if (reconciliationIsPaid(reconciliation)) {
        await finishJob(admin, {
          jobId: claim.jobId!,
          leaseToken: claim.leaseToken!,
          result: "STOPPED_PAID",
        });
        return { handled: true, result: "STOPPED_PAID" };
      }
      if (hasRecoverablePendingPix(reconciliation)) {
        await finishJob(admin, {
          jobId: claim.jobId!,
          leaseToken: claim.leaseToken!,
          result: "RECOVERED_EXISTING_PIX",
        });
        return { handled: true, result: "RECOVERED_EXISTING_PIX" };
      }

      await Promise.all([
        buildOfficialCheckoutContext(admin, supabaseUrl, receivable),
        loadReplacementIdentity(admin, receivable),
      ]);
      await replacementRpc(admin, "begin_banese_ead_title_cancel", {
        p_job_id: claim.jobId,
        p_lease_token: claim.leaseToken,
        p_expected_receivable_updated_at: receivable.updated_at,
      });
      claim.status = "CANCEL_FENCED";
    }

    if (claim.status === "CANCEL_FENCED") {
      const canceled = await cancelFencedTitle(admin, claim, receivable);
      if (canceled.pixAvailable) {
        await replacementRpc(
          admin,
          "persist_banese_ead_title_pix_before_cancel",
          {
            p_job_id: claim.jobId,
            p_lease_token: claim.leaseToken,
            p_pix_payload: canceled.pixPayload,
            p_pix_encoded_image: canceled.pixEncodedImage,
          },
        );
        claim.status = "RECOVERING_PIX";
        await finishJob(admin, {
          jobId: claim.jobId!,
          leaseToken: claim.leaseToken!,
          result: "RECOVERED_EXISTING_PIX",
        });
        return { handled: true, result: "RECOVERED_EXISTING_PIX" };
      }
      await replacementRpc(admin, "prepare_banese_ead_title_reissue", {
        p_job_id: claim.jobId,
        p_lease_token: claim.leaseToken,
        p_confirmed_remote_status: canceled.remoteStatus,
        p_confirmed_situation_code: canceled.situationCode,
        p_confirmed_at: new Date().toISOString(),
        p_cancel_fingerprint: await cancellationEvidenceFingerprint(canceled),
        p_already_canceled: canceled.alreadyCanceled,
        p_mutation_attempted: canceled.mutationAttempted,
      });
      claim.status = "REISSUING";
      receivable = await loadOne(
        admin,
        "contas_receber",
        String(claim.receivableId),
      );
    }

    const existing = await finishExistingRemoteState(
      admin,
      supabaseUrl,
      claim,
      receivable,
    );
    if (existing) return existing;
    const beforeCheckout = classifyReissueState(claim, receivable);
    if (beforeCheckout.state === "AMBIGUOUS") {
      const reconciled = await reconcileBaneseReceivable(
        admin,
        claim.receivableId,
      );
      receivable = reconciled.receivable || await loadOne(
        admin,
        "contas_receber",
        String(claim.receivableId),
      );
      const recovered = await finishExistingRemoteState(
        admin,
        supabaseUrl,
        claim,
        receivable,
      );
      if (recovered) return recovered;
      throw new Error("REPLACEMENT_AMBIGUOUS_TITLE_NOT_CONFIRMED");
    }
    if (beforeCheckout.state === "REGISTERED_INCOMPLETE") {
      throw new Error("REPLACEMENT_REGISTERED_TITLE_INCOMPLETE");
    }
    await reissueThroughOfficialCheckout(admin, supabaseUrl, receivable);
    const reissued = await loadOne(
      admin,
      "contas_receber",
      String(claim.receivableId),
    );
    const completed = await finishExistingRemoteState(
      admin,
      supabaseUrl,
      claim,
      reissued,
    );
    if (!completed) throw new Error("REPLACEMENT_POST_DID_NOT_PERSIST_TITLE");
    return completed;
  } catch (error) {
    const errorCode = replacementErrorCode(error);
    if (
      claim.status === "RECOVERING_PIX" || claim.status === "CANCEL_FENCED" ||
      claim.status === "REISSUING"
    ) {
      console.error("banese ead title replacement retry fenced", {
        jobId: claim.jobId,
        receivableId: claim.receivableId,
        stage: claim.status,
        errorCode,
      });
      return {
        handled: true,
        result: `${claim.status}_RETRY`,
        errorCode,
      };
    }
    try {
      await finishJob(admin, {
        jobId: claim.jobId!,
        leaseToken: claim.leaseToken!,
        result: "REVIEW_REQUIRED",
        errorCode,
      });
    } catch {
      // O erro original continua sendo a evidência principal; nenhuma segunda
      // emissão ou baixa é tentada quando a auditoria final também falha.
    }
    console.error("banese ead title replacement requires review", {
      jobId: claim.jobId,
      receivableId: claim.receivableId,
      errorCode,
    });
    return { handled: true, result: "REVIEW_REQUIRED", errorCode };
  }
};
