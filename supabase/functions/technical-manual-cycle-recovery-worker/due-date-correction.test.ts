import assert from "node:assert/strict";
import { baneseDocumentFixtureAt } from "../banese/internal/testing/document-fixture.ts";
import { KNOWN_DUE_DATE_CORRECTION } from "./contract.ts";
import { correctKnownTechnicalTitleDueDate } from "./due-date-correction.ts";

const target = { ...KNOWN_DUE_DATE_CORRECTION };
const leaseToken = "33333333-3333-4333-8333-333333333333";
const terms = {
  nominalAmount: 279.9,
  dueDate: target.expectedDueDate,
  discount: null,
  penalty: null,
  interest: null,
};

const scenario = (options: {
  terminal?: boolean;
  cancelConfirmed?: boolean;
  cancelIntent?: boolean;
  cancelIntentStillPending?: boolean;
  paid?: boolean;
  rejectIntent?: boolean;
} = {}) => {
  const calls: string[] = [];
  const document = baneseDocumentFixtureAt(
    1,
    target.expectedDueDate,
    terms.nominalAmount,
  );
  const context = {
    requestId: target.expectedCycleRequestId,
    matriculaId: target.matriculaId,
    ciclo: {
      numero: 1,
      quantidadeItens: 12,
      emitidosBanese: 12,
      pendentesEmissao: 0,
      emRevisao: 0,
      total: "3358.80",
      status: "EMITIDO_BANESE",
      recebiveis: Array.from({ length: 12 }, (_, index) => ({
        id: index === 11
          ? target.receivableId
          : `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        chave: `ciclo-1-parc-${index + 1}`,
        tipo: "PARCELA",
        numero: index + 1,
        descricao: "Parcela sintética",
        valor: "279.90",
        vencimento: index === 11 ? target.expectedDueDate : "2026-11-15",
        status: "PENDENTE",
        emissaoBanese: "EMITIDO",
      })),
    },
  };
  const receivable = {
    id: target.receivableId,
    cliente_id: target.matriculaId,
    matricula_id: target.matriculaId,
    turma_id: target.turmaId,
    origem_cronograma_id: target.expectedItemKey,
    data_vencimento: target.expectedDueDate,
    valor: terms.nominalAmount,
    gateway_boleto_convenio: "1",
    gateway_boleto_agencia: document.beneficiary.agency,
    gateway_boleto_nosso_numero: document.ourNumber,
    gateway_boleto_linha_digitavel: document.digitableLine,
    gateway_boleto_codigo_barras: document.barcode,
    gateway_financial_terms: terms,
  };
  const tables: Record<string, unknown> = {
    contas_receber: receivable,
    parceiros: { cpf_cnpj: "00000000000" },
    payment_gateway_routes: { credential_id: target.receivableId },
    payment_gateway_credentials: { metadata: {} },
  };
  const client = {
    from(name: string) {
      calls.push(`TABLE:${name}`);
      assert.ok(name in tables, `Unexpected table: ${name}`);
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: () => Promise.resolve({ data: tables[name], error: null }),
      };
      return query;
    },
    rpc(name: string) {
      calls.push(name);
      if (name === "obter_emissao_ciclo_financeiro_tecnico_manual_service") {
        return Promise.resolve({ data: context, error: null });
      }
      if (
        name ===
          "begin_known_technical_manual_banese_due_date_correction_service"
      ) {
        return Promise.resolve({
          data: options.terminal
            ? {
              terminal: true,
              status: "RESET_COMPLETE",
              receivableId: target.receivableId,
              correctionRequestId: target.correctionRequestId,
              correctedDueDate: target.correctedDueDate,
              requiresNewNossoNumero: true,
            }
            : {
              terminal: false,
              fenced: true,
              status: options.cancelConfirmed
                ? "CANCEL_CONFIRMED"
                : options.cancelIntent
                ? "CANCEL_INTENT"
                : "FENCED",
              receivableId: target.receivableId,
              correctionRequestId: target.correctionRequestId,
              expectedDueDate: target.expectedDueDate,
              correctedDueDate: target.correctedDueDate,
              canceledNossoNumero: document.ourNumber,
              leaseToken,
            },
          error: null,
        });
      }
      if (
        name ===
          "mark_technical_due_date_cancel_intent_service"
      ) {
        return Promise.resolve(
          options.rejectIntent
            ? { data: null, error: new Error("Intent rejeitado") }
            : {
              data: {
                intent: true,
                receivableId: target.receivableId,
                correctionRequestId: target.correctionRequestId,
                leaseToken,
              },
              error: null,
            },
        );
      }
      if (
        name ===
          "prepare_technical_due_date_correction_service"
      ) {
        return Promise.resolve({
          data: {
            ready: true,
            replayed: false,
            receivableId: target.receivableId,
            correctionRequestId: target.correctionRequestId,
            correctedDueDate: target.correctedDueDate,
            requiresNewNossoNumero: true,
          },
          error: null,
        });
      }
      throw new Error(`Unexpected RPC: ${name}`);
    },
  };
  const snapshot = {
    paid: options.paid === true,
    payments: options.paid ? [{}] : [],
    paymentsError: null,
    financialTermsError: null,
    financialTerms: terms,
    situationCode: 2,
    remoteStatus: "PENDING",
    nossoNumero: document.ourNumber,
    pixPayload: "pix-presente",
    pixEncodedImage: "imagem-presente",
    raw: {
      NumeroLinhaDigitavel: document.digitableLine,
      NumeroCodigoBarras: document.barcode,
    },
  };
  const bank = {
    query: () => {
      calls.push("BANK_GET_WITH_PAYMENTS");
      return Promise.resolve(snapshot);
    },
    cancel: async (
      _admin: unknown,
      _environment: unknown,
      input: {
        stopWhenPixAvailable: boolean;
        onMutationStart: () => Promise<void>;
      },
    ) => {
      calls.push("CANCEL_PRECHECK");
      assert.equal(input.stopWhenPixAvailable, false);
      if (options.cancelConfirmed || options.cancelIntent) {
        calls.push("BANK_GET_WITH_PAYMENTS_REPLAY");
        if (options.cancelIntentStillPending) {
          await input.onMutationStart();
          throw new Error("callback deveria bloquear antes do PUT");
        }
        return {
          nossoNumero: document.ourNumber,
          remoteStatus: "CANCELED",
          situationCode: 5,
          alreadyCanceled: true,
          mutationAttempted: false,
          pixAvailable: false,
          raw: {},
        };
      }
      await input.onMutationStart();
      calls.push("BANK_CANCEL_PUT");
      return {
        nossoNumero: document.ourNumber,
        remoteStatus: "CANCELED",
        situationCode: 5,
        alreadyCanceled: false,
        mutationAttempted: true,
        pixAvailable: false,
        raw: {},
      };
    },
  };
  return {
    calls,
    run: () =>
      correctKnownTechnicalTitleDueDate(
        client as never,
        target,
        bank as never,
      ),
  };
};

Deno.test("correção one-off faz GET antes da baixa, registra intenção e só então prepara reset", async () => {
  const value = scenario();
  assert.deepEqual(await value.run(), { replayed: false, prepared: true });
  assert.ok(
    value.calls.indexOf("BANK_GET_WITH_PAYMENTS") <
      value.calls.indexOf("CANCEL_PRECHECK"),
  );
  assert.ok(
    value.calls.indexOf(
      "mark_technical_due_date_cancel_intent_service",
    ) < value.calls.indexOf("BANK_CANCEL_PUT"),
  );
  assert.ok(
    value.calls.indexOf("BANK_CANCEL_PUT") <
      value.calls.indexOf(
        "prepare_technical_due_date_correction_service",
      ),
  );
});

Deno.test("pagamento confirmado no GET interrompe antes de PUT e reset", async () => {
  const value = scenario({ paid: true });
  await assert.rejects(value.run, /saudável, aberto e sem pagamentos/);
  assert.equal(value.calls.includes("CANCEL_PRECHECK"), false);
  assert.equal(value.calls.includes("BANK_CANCEL_PUT"), false);
});

Deno.test("falha ao persistir intenção impede o PUT", async () => {
  const value = scenario({ rejectIntent: true });
  await assert.rejects(value.run, /Intent rejeitado/);
  assert.ok(value.calls.includes("CANCEL_PRECHECK"));
  assert.equal(value.calls.includes("BANK_CANCEL_PUT"), false);
});

Deno.test("replay terminal não consulta nem baixa o Nosso Número antigo", async () => {
  const value = scenario({ terminal: true });
  assert.deepEqual(await value.run(), { replayed: true, prepared: false });
  assert.equal(value.calls.includes("BANK_GET_WITH_PAYMENTS"), false);
  assert.equal(value.calls.some((call) => call.startsWith("TABLE:")), false);
});

Deno.test("crash após confirmação retoma por GET sem repetir PUT", async () => {
  const value = scenario({ cancelConfirmed: true });
  assert.deepEqual(await value.run(), { replayed: false, prepared: true });
  assert.ok(value.calls.includes("BANK_GET_WITH_PAYMENTS_REPLAY"));
  assert.equal(value.calls.includes("BANK_GET_WITH_PAYMENTS"), false);
  assert.equal(
    value.calls.includes(
      "mark_technical_due_date_cancel_intent_service",
    ),
    false,
  );
  assert.equal(value.calls.includes("BANK_CANCEL_PUT"), false);
  assert.ok(value.calls.includes(
    "prepare_technical_due_date_correction_service",
  ));
});

Deno.test("crash após PUT com CANCEL_INTENT recupera code 5 por GET", async () => {
  const value = scenario({ cancelIntent: true });
  assert.deepEqual(await value.run(), { replayed: false, prepared: true });
  assert.ok(value.calls.includes("BANK_GET_WITH_PAYMENTS_REPLAY"));
  assert.equal(value.calls.includes("BANK_GET_WITH_PAYMENTS"), false);
  assert.equal(value.calls.includes("BANK_CANCEL_PUT"), false);
  assert.equal(
    value.calls.includes(
      "mark_technical_due_date_cancel_intent_service",
    ),
    false,
  );
});

Deno.test("CANCEL_INTENT ainda pendente para em revisão sem segundo PUT", async () => {
  const value = scenario({
    cancelIntent: true,
    cancelIntentStillPending: true,
  });
  await assert.rejects(value.run, /somente GET; novo PUT foi bloqueado/);
  assert.ok(value.calls.includes("BANK_GET_WITH_PAYMENTS_REPLAY"));
  assert.equal(value.calls.includes("BANK_CANCEL_PUT"), false);
  assert.equal(
    value.calls.includes(
      "prepare_technical_due_date_correction_service",
    ),
    false,
  );
});
