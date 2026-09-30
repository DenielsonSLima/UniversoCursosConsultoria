import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  cancelBaneseBoleto,
  queryBaneseBoleto,
} from "../banese/core/adapter.ts";
import type { BaneseFinancialTermsInput } from "../banese/internal/financial-terms.ts";
import { assertBaneseFinancialTermsEqual } from "../banese/internal/financial-terms-response.ts";
import { documentForGateway } from "../gateways/checkout/utils.ts";
import {
  DATABASE_UUID_RE,
  parseCycleContext,
} from "../technical-manual-cycle-issuance/contract.ts";
import type { KnownDueDateCorrectionRequest } from "./contract.ts";

type Client = SupabaseClient;
type BaneseSnapshot = Awaited<ReturnType<typeof queryBaneseBoleto>>;
export type DueDateCorrectionBankOperations = {
  query: typeof queryBaneseBoleto;
  cancel: typeof cancelBaneseBoleto;
};

const bankOperations: DueDateCorrectionBankOperations = {
  query: queryBaneseBoleto,
  cancel: cancelBaneseBoleto,
};
const REMOTE_CORRECTION_TIMEOUT_MS = 45_000;

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const requiredRecord = async (
  query: PromiseLike<{ data: unknown; error: unknown }>,
  message: string,
) => {
  const { data, error } = await query;
  if (error) throw error;
  const record = asRecord(data);
  if (!Object.keys(record).length) throw new Error(message);
  return record;
};

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

const rpcScope = (input: KnownDueDateCorrectionRequest) => ({
  p_receivable_id: input.receivableId,
  p_correction_request_id: input.correctionRequestId,
  p_expected_authorization_request_id: input.expectedAuthorizationRequestId,
  p_expected_matricula_id: input.matriculaId,
  p_expected_turma_id: input.turmaId,
  p_expected_cycle_number: input.cicloNumero,
  p_expected_cycle_request_id: input.expectedCycleRequestId,
  p_expected_item_count: input.expectedItemCount,
  p_expected_item_key: input.expectedItemKey,
  p_expected_due_date: input.expectedDueDate,
  p_corrected_due_date: input.correctedDueDate,
});

const assertTargetRun = async (
  admin: Client,
  input: KnownDueDateCorrectionRequest,
) => {
  const { data, error } = await admin.rpc(
    "obter_emissao_ciclo_financeiro_tecnico_manual_service",
    {
      p_matricula_id: input.matriculaId,
      p_ciclo_numero: input.cicloNumero,
    },
  );
  if (error) throw error;
  const context = parseCycleContext(data);
  const target = context.ciclo.recebiveis.filter((item) =>
    item.id === input.receivableId && item.chave === input.expectedItemKey
  );
  if (
    context.requestId !== input.expectedCycleRequestId ||
    context.ciclo.numero !== input.cicloNumero ||
    context.ciclo.quantidadeItens !== input.expectedItemCount ||
    target.length !== 1 ||
    ![input.expectedDueDate, input.correctedDueDate].includes(
      target[0].vencimento,
    )
  ) {
    throw new Error("O alvo one-off divergiu do run histórico esperado.");
  }
};

const cancellationEvidenceFingerprint = async (canceled: {
  nossoNumero: unknown;
  situationCode: unknown;
  remoteStatus: unknown;
  alreadyCanceled: boolean;
  mutationAttempted: boolean;
  raw: unknown;
}) => {
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

const assertHealthyUnpaidTitle = (
  snapshot: BaneseSnapshot,
  expectedTerms: BaneseFinancialTermsInput,
  expectedLine: unknown,
  expectedBarcode: unknown,
) => {
  const raw = asRecord(snapshot.raw);
  if (
    snapshot.paid || snapshot.payments.length > 0 || snapshot.paymentsError ||
    snapshot.financialTermsError || !snapshot.financialTerms ||
    snapshot.situationCode !== 2 || snapshot.remoteStatus !== "PENDING" ||
    digits(raw.NumeroLinhaDigitavel ?? raw.numeroLinhaDigitavel) !==
      digits(expectedLine) ||
    digits(raw.NumeroCodigoBarras ?? raw.numeroCodigoBarras) !==
      digits(expectedBarcode)
  ) {
    throw new Error(
      "O GET Banese não confirmou o título saudável, aberto e sem pagamentos.",
    );
  }
  assertBaneseFinancialTermsEqual(expectedTerms, snapshot.financialTerms);
};

const correctWithinDeadline = async (
  admin: Client,
  input: KnownDueDateCorrectionRequest,
  signal: AbortSignal,
  bank: DueDateCorrectionBankOperations,
) => {
  await assertTargetRun(admin, input);
  const scope = rpcScope(input);
  const begun = await requiredRecord(
    admin.rpc(
      "begin_known_technical_manual_banese_due_date_correction_service",
      scope,
    ),
    "O fence one-off de correção não foi criado.",
  );
  if (
    begun.receivableId !== input.receivableId ||
    begun.correctionRequestId !== input.correctionRequestId
  ) {
    throw new Error("O fence one-off retornou outro recebível.");
  }
  if (begun.terminal === true) {
    if (
      begun.status !== "RESET_COMPLETE" ||
      begun.correctedDueDate !== input.correctedDueDate ||
      begun.requiresNewNossoNumero !== true
    ) {
      throw new Error("O replay terminal da correção divergiu do overlay.");
    }
    return { replayed: true, prepared: false };
  }
  const leaseToken = String(begun.leaseToken || "");
  if (
    begun.fenced !== true || !DATABASE_UUID_RE.test(leaseToken) ||
    begun.expectedDueDate !== input.expectedDueDate ||
    begun.correctedDueDate !== input.correctedDueDate
  ) {
    throw new Error("Lease ou datas do fence one-off divergiram.");
  }

  const receivable = await requiredRecord(
    admin.from("contas_receber").select("*").eq("id", input.receivableId)
      .maybeSingle(),
    "Recebível one-off não encontrado.",
  );
  if (
    receivable.matricula_id !== input.matriculaId ||
    receivable.turma_id !== input.turmaId ||
    receivable.origem_cronograma_id !== input.expectedItemKey ||
    String(receivable.data_vencimento || "").slice(0, 10) !==
      input.expectedDueDate
  ) {
    throw new Error("O recebível mudou após o fence one-off.");
  }
  const [payer, route] = await Promise.all([
    requiredRecord(
      admin.from("parceiros").select("cpf_cnpj").eq(
        "id",
        String(receivable.cliente_id || ""),
      ).maybeSingle(),
      "Pagador da correção não encontrado.",
    ),
    requiredRecord(
      admin.from("payment_gateway_routes").select("credential_id")
        .eq("modalidade", "TECNICO").eq("payment_method", "BOLETO")
        .eq("provider_code", "banese_card").eq("environment", "production")
        .eq("enabled", true).maybeSingle(),
      "Rota Banese da correção não encontrada.",
    ),
  ]);
  const credential = await requiredRecord(
    admin.from("payment_gateway_credentials").select("metadata").eq(
      "id",
      String(route.credential_id || ""),
    ).eq("provider_code", "banese_card").eq("environment", "production")
      .maybeSingle(),
    "Credencial Banese da correção não encontrada.",
  );
  const metadata = asRecord(credential.metadata);
  const expectedTerms = receivable
    .gateway_financial_terms as BaneseFinancialTermsInput;
  const bankIdentity = {
    convenio: receivable.gateway_boleto_convenio ||
      metadata.baneseBoletoConvenio || metadata.baneseConvenio,
    nossoNumero: receivable.gateway_boleto_nosso_numero,
    expectedAmount: receivable.valor,
    expectedDueDate: input.expectedDueDate,
    expectedAgency: receivable.gateway_boleto_agencia || metadata.baneseAgencia,
    expectedAccount: metadata.baneseConta || metadata.baneseContaDisplay,
    expectedDocumentNumber: input.receivableId.slice(0, 15),
    expectedCompanyTitleId: input.receivableId.slice(0, 25),
    expectedPayerDocument: documentForGateway(payer.cpf_cnpj),
    expectedFinancialTerms: expectedTerms,
  };
  const cancellationIsGetOnly = ["CANCEL_INTENT", "CANCEL_CONFIRMED"].includes(
    String(begun.status || ""),
  );
  if (!cancellationIsGetOnly) {
    const snapshot = await bank.query(admin as never, "production", {
      ...bankIdentity,
      recoverPix: false,
      validateTitleIdentity: true,
      signal,
    });
    assertHealthyUnpaidTitle(
      snapshot,
      expectedTerms,
      receivable.gateway_boleto_linha_digitavel,
      receivable.gateway_boleto_codigo_barras,
    );
    if (digits(snapshot.nossoNumero) !== digits(begun.canceledNossoNumero)) {
      throw new Error("O GET Banese não corresponde ao Nosso Número cercado.");
    }
  }

  const canceled = await bank.cancel(admin as never, "production", {
    ...bankIdentity,
    stopWhenPixAvailable: false,
    expectedDigitableLine: receivable.gateway_boleto_linha_digitavel,
    expectedBarcode: receivable.gateway_boleto_codigo_barras,
    signal,
    onMutationStart: async () => {
      if (cancellationIsGetOnly) {
        throw new Error(
          "Replay após intenção de baixa é somente GET; novo PUT foi bloqueado.",
        );
      }
      const intent = await requiredRecord(
        admin.rpc(
          "mark_technical_due_date_cancel_intent_service",
          { ...scope, p_lease_token: leaseToken },
        ),
        "A intenção de baixa one-off não foi registrada.",
      );
      if (
        intent.intent !== true || intent.receivableId !== input.receivableId ||
        intent.correctionRequestId !== input.correctionRequestId ||
        intent.leaseToken !== leaseToken
      ) {
        throw new Error("A intenção de baixa divergiu do fence one-off.");
      }
    },
  });
  if (canceled.pixAvailable) {
    throw new Error(
      "A correção de vencimento não aceita atalho de recuperação Pix.",
    );
  }

  const prepared = await requiredRecord(
    admin.rpc(
      "prepare_technical_due_date_correction_service",
      {
        ...scope,
        p_lease_token: leaseToken,
        p_confirmed_remote_status: canceled.remoteStatus,
        p_confirmed_situation_code: canceled.situationCode,
        p_confirmed_at: new Date().toISOString(),
        p_cancel_fingerprint: await cancellationEvidenceFingerprint(canceled),
        p_already_canceled: canceled.alreadyCanceled,
        p_mutation_attempted: canceled.mutationAttempted,
      },
    ),
    "A baixa confirmada não preparou a correção de vencimento.",
  );
  if (
    prepared.ready !== true || prepared.receivableId !== input.receivableId ||
    prepared.correctionRequestId !== input.correctionRequestId ||
    prepared.correctedDueDate !== input.correctedDueDate ||
    prepared.requiresNewNossoNumero !== true
  ) {
    throw new Error("O reset one-off divergiu da baixa Banese confirmada.");
  }
  return { replayed: prepared.replayed === true, prepared: true };
};

export const correctKnownTechnicalTitleDueDate = async (
  admin: Client,
  input: KnownDueDateCorrectionRequest,
  bank: DueDateCorrectionBankOperations = bankOperations,
) => {
  const controller = new AbortController();
  const timeout = setTimeout(
    () =>
      controller.abort(new Error("Tempo total da correção Banese excedido.")),
    REMOTE_CORRECTION_TIMEOUT_MS,
  );
  try {
    return await correctWithinDeadline(
      admin,
      input,
      controller.signal,
      bank,
    );
  } finally {
    clearTimeout(timeout);
  }
};
