import assert from "node:assert/strict";
import { recoverReviewedCycleItems } from "./review-recovery.ts";
import { deterministicReceivableRequestId } from "../technical-manual-cycle-issuance/contract.ts";
import { baneseDocumentFixtureAt } from "../banese/internal/testing/document-fixture.ts";
import { buildBanesePixImageFixture, buildBanesePixPayloadFixture } from "../banese/internal/testing/pix-fixture.ts";

const receivableId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const lease = "33333333-3333-4333-8333-333333333333";
const internal = { matriculaId: receivableId, cicloNumero: 1, expectedCycleRequestId: requestId, expectedItemCount: 1 };
const authorizationRpc = "authorize_technical_manual_receivable_issuance_recovery_service";
const terms = { nominalAmount: 100, dueDate: "2027-01-20", discount: null, penalty: null, interest: null };

async function scenario(options: {
  pix?: boolean;
  rejectedAuthorization?: number;
  malformedAuthorization?: boolean;
  rejectedIntent?: boolean;
} = {}) {
  const calls: string[] = [];
  const authorizationId = await deterministicReceivableRequestId(requestId, receivableId);
  const document = baneseDocumentFixtureAt(1, terms.dueDate, terms.nominalAmount);
  const expected = { receivableId, recoveryRequestId: authorizationId, authorizationRequestId: authorizationId,
    canceledNossoNumero: document.ourNumber, leaseToken: lease };
  const snapshot = {
    paid: false, payments: [], paymentsError: null, financialTermsError: null, financialTerms: terms,
    situationCode: 2, remoteStatus: "PENDING", nossoNumero: document.ourNumber,
    pixPayload: options.pix ? buildBanesePixPayloadFixture("TESTERECOVERY", 100) : null,
    pixEncodedImage: options.pix ? buildBanesePixImageFixture(1) : null,
    raw: { NumeroLinhaDigitavel: document.digitableLine, NumeroCodigoBarras: document.barcode },
  };
  const context = { requestId, matriculaId: receivableId, ciclo: {
    numero: 1, quantidadeItens: 1, emitidosBanese: 0, pendentesEmissao: 0, emRevisao: 1,
    total: "100.00", status: "EMISSAO_EM_REVISAO", recebiveis: [{
      id: receivableId, chave: "ciclo-1-parc-1", tipo: "PARCELA", numero: 1, descricao: "Parcela sintética",
      valor: "100.00", vencimento: terms.dueDate, status: "PENDENTE", emissaoBanese: "REVISAO_MANUAL",
    }],
  } };
  const tables: Record<string, unknown> = {
    contas_receber: { id: receivableId, matricula_id: receivableId, gateway_creation_token: authorizationId,
      gateway_submission_status: "API_REVIEW", gateway_financial_terms: terms,
      gateway_boleto_nosso_numero: document.ourNumber, valor: 100, data_vencimento: terms.dueDate,
      gateway_issuer_polo_id: lease, gateway_boleto_agencia: document.beneficiary.agency },
    parceiros: { cpf_cnpj: "00000000000" }, payment_gateway_routes: { credential_id: receivableId },
    payment_gateway_credentials: { metadata: {} },
  };
  let authorizationCount = 0;
  const client = {
    from(name: string) {
      assert.ok(name in tables, `Unexpected table: ${name}`);
      const query = { select: () => query, eq: () => query,
        maybeSingle: () => Promise.resolve({ data: tables[name], error: null }) };
      return query;
    },
    rpc(name: string, args: Record<string, unknown>) {
      calls.push(name);
      let data: unknown;
      if (name === "obter_emissao_ciclo_financeiro_tecnico_manual_service") data = context;
      else if (name === "claim_technical_manual_cycle_banese_review_recovery_service") data = { ...expected, claimed: true };
      else if (name === authorizationRpc) {
        assert.deepEqual(args, { p_receivable_id: receivableId, p_request_id: authorizationId,
          p_expected_matricula_id: internal.matriculaId, p_expected_cycle_number: 1,
          p_expected_cycle_request_id: requestId, p_expected_item_count: 1 });
        authorizationCount++;
        if (authorizationCount === options.rejectedAuthorization) {
          return Promise.resolve({ data: null, error: new Error("Situação acadêmica impede reemissão") });
        }
        data = { authorized: true, required: true, internalRecovery: true,
          receivableId: options.malformedAuthorization ? lease : receivableId, cycleNumber: 1, cycleRequestId: requestId };
      } else if (name === "begin_technical_manual_cycle_banese_review_cancel_service") data = { ...expected, fenced: true, mode: "CANCEL_ALLOWED" };
      else if (name === "mark_technical_manual_cycle_banese_cancel_intent_service") {
        if (options.rejectedIntent) return Promise.resolve({ data: null, error: new Error("Transferência concorrente bloqueou intenção") });
        data = { ...expected, intent: true };
      } else if (name === "prepare_technical_manual_cycle_banese_reissue_service") data = { ...expected, ready: true, requiresNewNossoNumero: true };
      else if (name === "persist_technical_manual_cycle_banese_review_recovery_service") data = { success: true, reviewRecovered: true, status: "EMITIDO" };
      else throw new Error(`Unexpected RPC: ${name}`);
      return Promise.resolve({ data, error: null });
    },
  };
  const bank = {
    query: () => { calls.push("BANK_GET"); return Promise.resolve(snapshot); },
    cancel: async (_admin: unknown, _environment: unknown, input: { onMutationStart: () => Promise<void> }) => {
      calls.push("CANCEL_CHECK");
      await input.onMutationStart();
      calls.push("BANK_CANCEL_PUT");
      return { nossoNumero: document.ourNumber, remoteStatus: "CANCELED", situationCode: 5,
        alreadyCanceled: false, mutationAttempted: true, raw: {} };
    },
  };
  return { calls, run: () => recoverReviewedCycleItems(client as never, internal, bank as never) };
}

Deno.test("matrícula transferida permite GET, mas rejeição canônica impede iniciar substituição", async () => {
  const value = await scenario({ rejectedAuthorization: 1 });
  await assert.rejects(value.run, /Situação acadêmica/);
  assert.ok(value.calls.includes("BANK_GET"));
  assert.equal(value.calls.includes("begin_technical_manual_cycle_banese_review_cancel_service"), false);
  assert.equal(value.calls.includes("CANCEL_CHECK"), false);
  assert.equal(value.calls.includes("BANK_CANCEL_PUT"), false);
});

Deno.test("GET completo permanece conciliável após transferência sem autorizar cancelamento ou reemissão", async () => {
  const value = await scenario({ pix: true, rejectedAuthorization: 1 });
  assert.equal(await value.run(), 1);
  assert.ok(value.calls.includes("persist_technical_manual_cycle_banese_review_recovery_service"));
  assert.equal(value.calls.includes(authorizationRpc), false);
  assert.equal(value.calls.includes("CANCEL_CHECK"), false);
});

Deno.test("autorização é repetida antes do PUT e transferência concorrente impede mutação", async () => {
  for (const options of [{ rejectedAuthorization: 2 }, { rejectedIntent: true }]) {
    const value = await scenario(options);
    await assert.rejects(value.run, /acadêmica|concorrente/);
    assert.equal(value.calls.filter((name) => name === authorizationRpc).length, 2);
    assert.ok(value.calls.includes("CANCEL_CHECK"));
    assert.equal(value.calls.includes("BANK_CANCEL_PUT"), false);
    assert.equal(value.calls.includes("prepare_technical_manual_cycle_banese_reissue_service"), false);
  }
});

Deno.test("substituição autorizada mantém fences, intenção e confirmação antes do reset", async () => {
  const value = await scenario();
  assert.equal(await value.run(), 1);
  assert.equal(value.calls.filter((name) => name === authorizationRpc).length, 2);
  assert.equal(value.calls.filter((name) => name === "BANK_CANCEL_PUT").length, 1);
  assert.ok(value.calls.indexOf(authorizationRpc) < value.calls.indexOf("begin_technical_manual_cycle_banese_review_cancel_service"));
  assert.ok(value.calls.indexOf("mark_technical_manual_cycle_banese_cancel_intent_service") < value.calls.indexOf("BANK_CANCEL_PUT"));
  assert.ok(value.calls.indexOf("BANK_CANCEL_PUT") < value.calls.indexOf("prepare_technical_manual_cycle_banese_reissue_service"));
});

Deno.test("resposta de autorização fora do recebível/ciclo não alcança cancelamento", async () => {
  const value = await scenario({ malformedAuthorization: true });
  await assert.rejects(value.run, /autorização de substituição divergiu/);
  assert.equal(value.calls.includes("CANCEL_CHECK"), false);
});
