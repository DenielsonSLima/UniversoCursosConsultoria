import assert from "node:assert/strict";
import { recoverReviewedCycleItems } from "./review-recovery.ts";

const enrollment = "11111111-1111-4111-8111-111111111111";
const request = "22222222-2222-4222-8222-222222222222";
const internal = { matriculaId: enrollment, cicloNumero: 1, expectedCycleRequestId: request, expectedItemCount: 13 };
const envelope = (status = "PENDENTE", reviewed = false) => ({
  requestId: request, matriculaId: enrollment,
  ciclo: {
    numero: 1, quantidadeItens: 13, quantidadeBancaria: 12, quantidadeLocal: 1,
    emitidosBanese: reviewed ? 11 : 12, pendentesEmissao: 0, emRevisao: reviewed ? 1 : 0,
    total: "1300.00", status: reviewed ? "EMISSAO_EM_REVISAO" : "EMITIDO_BANESE",
    recebiveis: Array.from({ length: 13 }, (_, n) => ({
      id: `33333333-3333-4333-8333-${String(n).padStart(12, "0")}`,
      chave: n === 0 ? "matricula" : `ciclo-1-parc-${n}`,
      tipo: n === 0 ? "MATRICULA" : "PARCELA", numero: n,
      descricao: "Teste local sem dados pessoais", valor: "100.00", vencimento: "2027-01-20",
      status: n === 0 ? status : "PENDENTE",
      destinoCobranca: n === 0 ? "LOCAL" : "BANESE",
      emissaoBanese: n === 0 ? "NAO_APLICAVEL" : reviewed && n === 1 ? "REVISAO_MANUAL" : "EMITIDO",
      localSemBoletoComprovado: n === 0, emissaoHistoricaComprovada: false,
    })),
  },
});
Deno.test("recovery real aceita total13/banco12 e nunca reclama fee local pendente ou paga", async () => {
  for (const status of ["PENDENTE", "VENCIDO", "PAGO"]) {
    const calls: string[] = [];
    const client = {
      rpc: (name: string) => {
        calls.push(name);
        assert.equal(name, "obter_emissao_ciclo_financeiro_tecnico_manual_service");
        return Promise.resolve({ data: envelope(status), error: null });
      },
      from: () => { throw new Error("Unexpected table or gateway work"); },
    };
    assert.equal(await recoverReviewedCycleItems(client as never, internal), 0);
    assert.equal(calls.length, 1);
    await assert.rejects(() => recoverReviewedCycleItems(client as never, { ...internal, expectedItemCount: 12 }), /divergiu/);
    assert.equal(calls.length, 2);
  }
});
Deno.test("recovery real seleciona só mensalidade em revisão e preserva total13 no claim antes de I/O", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "obter_emissao_ciclo_financeiro_tecnico_manual_service") return Promise.resolve({ data: envelope("PAGO", true), error: null });
      assert.equal(name, "claim_technical_manual_cycle_banese_review_recovery_service");
      assert.equal(args.p_receivable_id, envelope().ciclo.recebiveis[1].id);
      assert.equal(args.p_expected_item_count, 13);
      return Promise.resolve({ data: null, error: new Error("Canonical claim refused before network") });
    },
    from: () => { throw new Error("Claim failure must stop before reading bank identity"); },
  };
  await assert.rejects(() => recoverReviewedCycleItems(client as never, internal), /Canonical claim refused/);
  assert.equal(calls.length, 2);
});
