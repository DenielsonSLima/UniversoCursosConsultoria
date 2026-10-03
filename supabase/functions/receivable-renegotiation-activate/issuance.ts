import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { createGatewayCharge, type GatewayChargeResult } from "../gateways/router.ts";
import { queryBaneseBoleto } from "../banese/core/adapter/boleto-query.ts";
import type { BaneseCreationResponseCapture } from "../banese/core/adapter/types.ts";
import { normalizeBanesePixFromResponses } from "../banese/core/adapter/boleto-pix-response.ts";
import { validateBaneseBoletoResponse } from "../banese/core/adapter/boleto-response.ts";
import { assertBaneseBankNumbers, assertBaneseDueDateFactor } from "../banese/internal/bank-fields.ts";
import { assertBaneseFinancialTermsEqual } from "../banese/internal/financial-terms-response.ts";
import { normalizeBanesePixPayload, normalizeBanesePixQrImage } from "../banese/internal/pix-validation.ts";
import { renegotiationBillingSnapshotFromReceivable } from "../banese/internal/renegotiation-billing.ts";
import { ActivationError, type ActivationContext, type ActivationReplacement, record } from "./contract.ts";
import { canonicalJson } from "./runtime.ts";

export type IssuanceRuntime = {
  credentialId: string;
  issuerPoloId: string;
  account: string;
  payer: Record<string, unknown>;
};
export type IssuanceIntent = {
  mode: "POST_ALLOWED" | "GET_ONLY";
  receivable: Record<string, unknown>;
  creationResponse?: BaneseCreationResponseCapture | null;
};
const digits = (value: unknown) => String(value || "").replace(/\D/g, "");

export const assertReplacementScope = (context: ActivationContext,
  item: ActivationReplacement, row: Record<string, unknown>, runtime: IssuanceRuntime) => {
  if (row.id !== item.receivableId || row.cliente_id !== context.identity.alunoId ||
    row.matricula_id !== context.identity.matriculaId || row.turma_id !== context.identity.turmaId ||
    row.polo_id !== context.identity.poloId || row.gateway_creation_token !== item.attemptKey ||
    row.gateway_provider !== "banese_card" || row.gateway_environment !== "production" ||
    row.gateway_payment_method !== "BOLETO" || row.gateway_issuer_polo_id !== runtime.issuerPoloId ||
    !["PENDENTE", "VENCIDO"].includes(String(row.status)) || row.data_pagamento ||
    Number(row.valor_pago || 0) > 0 || row.manual_settlement_id) {
    throw new ActivationError("REPLACEMENT_SCOPE_MISMATCH", "A nova parcela mudou de identidade ou situação.");
  }
  const snapshot = renegotiationBillingSnapshotFromReceivable(row);
  if (!snapshot || snapshot.agreementId !== context.agreementId) {
    throw new ActivationError("REPLACEMENT_POLICY_MISSING", "Nova parcela sem política do acordo.");
  }
  assertBaneseFinancialTermsEqual(snapshot.financialTerms, item.financialTerms);
  if (Boolean(row.gateway_pix_payload) !== Boolean(row.gateway_pix_encoded_image)) {
    throw new ActivationError("PIX_SNAPSHOT_PARTIAL", "Retorno Pix parcial exige revisão.");
  }
};

export const validateReplacementResult = (result: GatewayChargeResult,
  item: ActivationReplacement, row: Record<string, unknown>, runtime: IssuanceRuntime): GatewayChargeResult => {
  const ourNumber = digits(result.bankSlipOurNumber).padStart(9, "0");
  if (!/^\d{9}$/.test(ourNumber) || digits(result.remotePaymentId).padStart(9, "0") !== ourNumber ||
    result.providerCode !== "banese_card" || result.remoteStatus !== "PENDING" ||
    result.issuerPoloId !== runtime.issuerPoloId || !result.financialTerms ||
    Boolean(result.pixPayload) !== Boolean(result.pixEncodedImage)) {
    throw new ActivationError("REPLACEMENT_RESULT_INVALID", "O banco retornou identidade, termos ou Pix inconsistentes.");
  }
  const bank = assertBaneseBankNumbers(result.bankSlipDigitableLine, result.bankSlipBarcode);
  assertBaneseDueDateFactor(bank.barcode, item.financialTerms.dueDate);
  if (bank.barcode.slice(30, 39) !== ourNumber ||
    Number(bank.barcode.slice(9, 19)) !== Math.round(Number(row.valor) * 100)) {
    throw new ActivationError("REPLACEMENT_BANK_VALUE_MISMATCH", "Código bancário diverge da parcela do acordo.");
  }
  const financialTerms = assertBaneseFinancialTermsEqual(item.financialTerms, result.financialTerms as typeof item.financialTerms);
  if (!result.pixPayload && !result.pixEncodedImage) {
    throw new ActivationError("BANESE_PIX_PENDING",
      "Boleto registrado, aguardando o QR Pix oficial. Retome a mesma operação para consultar, sem emitir outra cobrança.", true);
  }
  return {
    ...result, remotePaymentId: ourNumber, bankSlipOurNumber: ourNumber,
    remotePaymentLinkId: null, bankSlipDigitableLine: bank.digitableLine, bankSlipBarcode: bank.barcode,
    pixPayload: result.pixPayload ? normalizeBanesePixPayload(result.pixPayload, Number(row.valor)).payload : null,
    pixEncodedImage: result.pixEncodedImage ? normalizeBanesePixQrImage(result.pixEncodedImage) : null,
    financialTerms,
  };
};

export const createReplacementIssuer = (input: {
  admin: SupabaseClient;
  supabaseUrl: string;
  runtime: () => IssuanceRuntime;
  markIntent: (context: ActivationContext, item: ActivationReplacement) => Promise<IssuanceIntent>;
  recordCreation: (context: ActivationContext, item: ActivationReplacement,
    capture: BaneseCreationResponseCapture) => Promise<void>;
  bank?: { create: typeof createGatewayCharge; query: typeof queryBaneseBoleto };
}) => async (context: ActivationContext, item: ActivationReplacement): Promise<GatewayChargeResult> => {
  const runtime = input.runtime();
  const intent = await input.markIntent(context, item);
  const row = intent.receivable;
  assertReplacementScope(context, item, row, runtime);
  let result: GatewayChargeResult;
  const bank = input.bank || { create: createGatewayCharge, query: queryBaneseBoleto };
  const signal = () => AbortSignal.timeout(Math.max(1,
    Math.min(20_000, (context.deadlineAt || Date.now() + 20_000) - Date.now())));
  const mustQuery = intent.mode === "GET_ONLY" || row.gateway_submission_status === "API_AMBIGUOUS" ||
    row.gateway_submission_status === "API_REGISTERED" || Boolean(row.gateway_payment_id);
  if (mustQuery) {
    if (!/^\d{9}$/.test(String(row.gateway_boleto_nosso_numero || "")) || !row.gateway_boleto_convenio) {
      throw new ActivationError("ISSUANCE_IDENTITY_UNCONFIRMED", "Tentativa anterior sem identidade bancária confirmada. Revisão obrigatória.");
    }
    // Never call createGatewayCharge in a replay, even after a bank 404.
    const snapshot = await bank.query(input.admin as unknown as Parameters<typeof queryBaneseBoleto>[0], "production", {
      convenio: row.gateway_boleto_convenio,
      nossoNumero: row.gateway_boleto_nosso_numero,
      validateTitleIdentity: true,
      recoverPix: true,
      expectedAmount: row.valor,
      expectedDueDate: row.data_vencimento,
      expectedAgency: row.gateway_boleto_agencia,
      expectedAccount: runtime.account,
      expectedDocumentNumber: item.receivableId.slice(0, 15),
      expectedCompanyTitleId: item.receivableId.slice(0, 25),
      expectedPayerDocument: runtime.payer.cpfCnpj,
      signal: signal(),
    });
    if (snapshot.paymentsError) throw new ActivationError("REPLACEMENT_PAYMENTS_UNCONFIRMED", "Pagamentos do novo boleto ainda não confirmados.", true);
    if (snapshot.paid || snapshot.payments.length || snapshot.situationCode !== 2 ||
      snapshot.financialTermsError || !snapshot.financialTerms) {
      throw new ActivationError("REPLACEMENT_REVIEW_REQUIRED", "O novo boleto exige conciliação antes de concluir a ativação.");
    }
    const raw = record(snapshot.raw);
    if (Boolean(snapshot.pixPayload) !== Boolean(snapshot.pixEncodedImage)) {
      throw new ActivationError("PIX_RECOVERY_PARTIAL", "Consulta devolveu um par Pix incompleto. Revisão obrigatória.");
    }
    let pix = snapshot.pixPayload && snapshot.pixEncodedImage
      ? { payload: snapshot.pixPayload, image: snapshot.pixEncodedImage }
      : { payload: String(row.gateway_pix_payload || "") || null,
        image: String(row.gateway_pix_encoded_image || "") || null };
    if (intent.creationResponse) {
      const captured = intent.creationResponse;
      if (captured.request.nossoNumero !== snapshot.nossoNumero ||
        captured.request.convenio !== context.runtime.convenio ||
        captured.request.agency !== context.runtime.agency ||
        captured.request.amount !== Number(row.valor) ||
        captured.request.dueDate !== item.financialTerms.dueDate) {
        throw new ActivationError("POST_RESPONSE_IDENTITY_MISMATCH", "Evidência original de emissão não corresponde à parcela.");
      }
      const original = record(captured.response);
      // Anchor a partial POST response to the independently validated GET bank
      // identity. Preserve every identity field that POST actually returned, so
      // even a minimal NossoNumero + Pix response cannot belong to another title.
      validateBaneseBoletoResponse({
        ...original,
        NumeroLinhaDigitavel: original.NumeroLinhaDigitavel ?? original.numeroLinhaDigitavel ??
          raw.NumeroLinhaDigitavel ?? raw.numeroLinhaDigitavel,
        NumeroCodigoBarras: original.NumeroCodigoBarras ?? original.numeroCodigoBarras ??
          raw.NumeroCodigoBarras ?? raw.numeroCodigoBarras,
      }, {
          ourNumber: snapshot.nossoNumero, amount: Number(row.valor), dueDate: item.financialTerms.dueDate,
          agency: context.runtime.agency, account: context.runtime.account,
          documentNumber: item.receivableId.slice(0, 15), companyTitleId: item.receivableId.slice(0, 25),
          payerDocument: String(runtime.payer.cpfCnpj), requireRemoteTitleIdentity: false,
      });
      const preserved = await normalizeBanesePixFromResponses([
        { source: "creation", raw: captured.response }, { source: "confirmation", raw },
      ], Number(row.valor));
      if (preserved.pixPayload && preserved.pixEncodedImage) {
        pix = { payload: preserved.pixPayload, image: preserved.pixEncodedImage };
      }
    }
    result = {
      providerCode: "banese_card", remotePaymentId: snapshot.nossoNumero,
      remotePaymentLinkId: null, remoteCustomerId: null, remoteStatus: snapshot.remoteStatus,
      invoiceUrl: null, bankSlipUrl: null,
      // A subsequent empty GET cannot erase an already persisted, matching Pix pair.
      pixPayload: pix.payload,
      pixEncodedImage: pix.image,
      bankSlipDigitableLine: String(raw.NumeroLinhaDigitavel ?? raw.numeroLinhaDigitavel ?? ""),
      bankSlipBarcode: String(raw.NumeroCodigoBarras ?? raw.numeroCodigoBarras ?? ""),
      bankSlipOurNumber: snapshot.nossoNumero, issuerPoloId: runtime.issuerPoloId,
      financialTerms: snapshot.financialTerms,
      rawPayload: { recoveryMode: "BANESE_EXACT_GET_ONLY", response: raw, paymentsVerified: true, paymentCount: 0 },
    };
  } else {
    if (intent.mode !== "POST_ALLOWED" || item.state !== "PENDING" || row.gateway_status !== "CREATING" ||
      row.gateway_submission_status || row.gateway_boleto_nosso_numero || row.gateway_payment_id ||
      row.gateway_boleto_linha_digitavel || row.gateway_pix_payload || row.gateway_cnab_file_id ||
      row.gateway_submission_channel === "CNAB") {
      throw new ActivationError("NEW_POST_NOT_AUTHORIZED", "A parcela não possui autorização exclusiva para nova emissão.");
    }
    result = await bank.create({
      admin: input.admin, supabaseUrl: input.supabaseUrl, providerCode: "banese_card",
      credentialId: runtime.credentialId, environment: "production", paymentMethod: "BOLETO",
      receivable: row, payer: runtime.payer, amount: Number(row.valor),
      description: String(row.descricao || "Parcela de renegociação"),
      dueDate: String(row.data_vencimento).slice(0, 10), installments: 1,
      financialTerms: item.financialTerms, allowPendingBolePix: true,
      signal: signal(),
      onCreationResponse: (capture) => input.recordCreation(context, item, capture),
      onProviderMetadataResolved: (metadata, issuer) => {
        if (issuer.id !== context.runtime.issuerPoloId ||
          canonicalJson(metadata) !== canonicalJson(context.runtime.metadata)) {
          throw new ActivationError("GATEWAY_RUNTIME_CHANGED", "A configuração bancária mudou antes do envio. Nenhum POST foi feito.");
        }
      },
    });
  }
  return validateReplacementResult(result, item, row, runtime);
};
