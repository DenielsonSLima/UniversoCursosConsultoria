import assert from "node:assert/strict";
import { BANESE_DOCUMENT_FIXTURE } from "../../banese/internal/testing/document-fixture.ts";
import {
  baneseReceivableTitleFilter,
  baneseTransactionTitleFilter,
} from "./banese-reconciliation-contract.ts";
import { reconcileBaneseReceivable } from "./banese.ts";
import {
  boletoSnapshot,
  fakeAdmin,
  NOSSO_NUMERO,
  RECEIVABLE_ID,
  receivableFixture,
} from "./banese-test-harness.ts";

Deno.test("isola transacao pelo ambiente e pelo titulo Banese", async () => {
  const target = {
    id: "tx-target",
    receivable_id: RECEIVABLE_ID,
    provider_code: "banese_card",
    environment: "sandbox",
    payment_method: "BOLETO",
    remote_payment_id: NOSSO_NUMERO,
    bank_slip_our_number: NOSSO_NUMERO,
    remote_status: "OLD",
    raw_payload: { original: true },
  };
  const productionHistory = {
    ...target,
    id: "tx-production",
    environment: "production",
  };
  const anotherTitle = {
    ...target,
    id: "tx-another-title",
    receivable_id: "99999999-9999-4999-8999-999999999999",
    remote_payment_id: "000004691",
    bank_slip_our_number: "000004691",
  };
  const admin = fakeAdmin(receivableFixture(), [
    target,
    productionHistory,
    anotherTitle,
  ]);

  await reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
    queryBoleto: () => Promise.resolve(boletoSnapshot() as any),
  });

  assert.equal(target.remote_status, "OPEN");
  assert.equal(productionHistory.remote_status, "OLD");
  assert.equal(anotherTitle.remote_status, "OLD");
});

Deno.test("CAS preserva metadado transacional gravado durante o GET", async () => {
  const transaction = {
    id: "tx-concurrent",
    receivable_id: RECEIVABLE_ID,
    provider_code: "banese_card",
    environment: "sandbox",
    payment_method: "BOLETO",
    remote_payment_id: NOSSO_NUMERO,
    bank_slip_our_number: NOSSO_NUMERO,
    remote_status: "OLD",
    raw_payload: { original: true },
  };
  const admin = fakeAdmin(receivableFixture(), [transaction]);
  admin.beforeTransactionUpdate = (current) => {
    current.raw_payload = { concurrent: true };
  };

  await assert.rejects(
    () =>
      reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
        queryBoleto: () => Promise.resolve(boletoSnapshot() as any),
      }),
    /Transacao Banese mudou durante a consulta/i,
  );

  assert.deepEqual(transaction.raw_payload, { concurrent: true });
  assert.equal(transaction.remote_status, "OLD");
});

Deno.test("CAS recarrega a propria persistencia Pix antes do commit final", async () => {
  const admin = fakeAdmin(receivableFixture({
    gateway_boleto_convenio: "15528",
    gateway_pix_payload: null,
    gateway_pix_encoded_image: null,
  }));
  const pixPayload = "00020101021226840014br.gov.bcb.pix6304ABCD";
  const pixEncodedImage = `data:image/png;base64,${"a".repeat(40)}`;

  const result = await reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
    queryBoleto: () =>
      Promise.resolve(boletoSnapshot({
        pixPayload,
        pixEncodedImage,
        raw: {
          NumeroLinhaDigitavel: BANESE_DOCUMENT_FIXTURE.digitableLine,
          NumeroCodigoBarras: BANESE_DOCUMENT_FIXTURE.barcode,
        },
      }) as any),
  });

  assert.equal(result.success, true);
  assert.equal(admin.tables.payment_gateway_transactions.length, 1);
  assert.equal(
    admin.tables.payment_gateway_transactions[0].pix_payload,
    pixPayload,
  );
  assert.equal(admin.tables.contas_receber[0].gateway_pix_payload, pixPayload);
});

Deno.test("legado PAGO sem transacao preserva status liquidado", async () => {
  const receivable = receivableFixture({
    status: "PAGO",
    gateway_status: "PAID",
    gateway_last_error: null,
    data_pagamento: "2026-08-16",
  });
  const admin = fakeAdmin(receivable);

  await reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
    queryBoleto: () => Promise.resolve(boletoSnapshot() as any),
  });

  assert.equal(receivable.status, "PAGO");
  assert.equal(receivable.gateway_status, "PAID");
  assert.equal(
    admin.tables.payment_gateway_transactions[0].remote_status,
    "PAID",
  );
});

Deno.test("repara nosso numero legado usando gateway_payment_id", async () => {
  const receivable = receivableFixture({
    gateway_boleto_nosso_numero: null,
  });
  const transaction = {
    id: "tx-legacy",
    receivable_id: RECEIVABLE_ID,
    provider_code: "banese_card",
    environment: "sandbox",
    payment_method: "BOLETO",
    remote_payment_id: NOSSO_NUMERO,
    bank_slip_our_number: null,
    remote_status: "OLD",
    raw_payload: { creation: { preserved: true } },
  };
  const admin = fakeAdmin(receivable, [transaction]);

  await reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
    queryBoleto: () => Promise.resolve(boletoSnapshot() as any),
  });

  assert.equal(receivable.gateway_boleto_nosso_numero, NOSSO_NUMERO);
  assert.equal(transaction.bank_slip_our_number, NOSSO_NUMERO);
  assert.deepEqual(transaction.raw_payload.creation, { preserved: true });
});

Deno.test("nao mascara no-op na trava do recebivel legado", async () => {
  const admin = fakeAdmin(receivableFixture({
    gateway_boleto_nosso_numero: null,
  }));
  admin.forceReceivableUpdateNoOp = true;

  await assert.rejects(
    () =>
      reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
        queryBoleto: () => Promise.resolve(boletoSnapshot() as any),
      }),
    /Cobranca mudou durante a conciliacao Banese/i,
  );
  assert.equal(
    admin.tables.contas_receber[0].gateway_boleto_nosso_numero,
    null,
  );
});

Deno.test("gera filtros de trava apenas para Nosso Numero valido", () => {
  assert.equal(
    baneseTransactionTitleFilter(NOSSO_NUMERO),
    `bank_slip_our_number.eq.${NOSSO_NUMERO},remote_payment_id.eq.${NOSSO_NUMERO}`,
  );
  assert.match(
    baneseReceivableTitleFilter(NOSSO_NUMERO),
    new RegExp(`gateway_payment_id\\.eq\\.${NOSSO_NUMERO}`),
  );
  assert.throws(() => baneseTransactionTitleFilter("123"), /Nosso Numero/i);
});

Deno.test("pagamento Banese inicial dispara parcelas futuras pelo roteador", async () => {
  const matriculaId = "22222222-2222-4222-8222-222222222222";
  const turmaId = "33333333-3333-4333-8333-333333333333";
  const alunoId = "44444444-4444-4444-8444-444444444444";
  const cursoId = "55555555-5555-4555-8555-555555555555";
  const admin = fakeAdmin(receivableFixture({
    matricula_id: matriculaId,
    turma_id: turmaId,
    cliente_id: alunoId,
    tipo_lancamento: "MATRICULA",
  }));
  admin.tables.inscricoes_online = [];
  admin.tables.matriculas = [{
    id: matriculaId,
    turma_id: turmaId,
    aluno_id: alunoId,
    status: "PENDENTE",
    gerar_cobranca_futura: true,
    sincronizar_asaas: true,
    turmas: {
      gerar_cobrancas_futuras: true,
      sincronizar_asaas_futuro: true,
      cursos: { modalidade: "TECNICO" },
    },
  }];
  admin.tables.turmas = [{ id: turmaId, curso_id: cursoId }];
  admin.tables.parceiros = [{
    id: alunoId,
    nome: "Aluno Banese",
    cpf_cnpj: "78269105520",
  }];
  const calls: Array<{ matriculaId: string; environment: string }> = [];

  const result = await reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
    queryBoleto: () =>
      Promise.resolve(boletoSnapshot({
        situationCode: 3,
        remoteStatus: "PAID",
        paid: true,
        payments: [{
          ValorPago: 20_038.33,
          DataPagamento: "2026-08-16",
        }],
      }) as any),
    syncFutureInstallments: (id, environment) => {
      calls.push({ matriculaId: id, environment });
      return Promise.resolve({ success: true });
    },
  });

  assert.deepEqual(calls, [{ matriculaId, environment: "sandbox" }]);
  assert.equal(result.futureSyncWarning, null);
});

Deno.test("falha nas parcelas futuras preserva baixa e grava warning duravel", async () => {
  const matriculaId = "22222222-2222-4222-8222-222222222222";
  const turmaId = "33333333-3333-4333-8333-333333333333";
  const alunoId = "44444444-4444-4444-8444-444444444444";
  const cursoId = "55555555-5555-4555-8555-555555555555";
  const receivable = receivableFixture({
    matricula_id: matriculaId,
    turma_id: turmaId,
    cliente_id: alunoId,
    tipo_lancamento: "MATRICULA",
  });
  const admin = fakeAdmin(receivable);
  admin.tables.inscricoes_online = [];
  admin.tables.matriculas = [{
    id: matriculaId,
    turma_id: turmaId,
    aluno_id: alunoId,
    status: "PENDENTE",
    gerar_cobranca_futura: true,
    sincronizar_asaas: true,
    turmas: {
      gerar_cobrancas_futuras: true,
      sincronizar_asaas_futuro: true,
      cursos: { modalidade: "TECNICO" },
    },
  }];
  admin.tables.turmas = [{ id: turmaId, curso_id: cursoId }];
  admin.tables.parceiros = [{
    id: alunoId,
    nome: "Aluno Banese",
    cpf_cnpj: "78269105520",
  }];

  const result = await reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
    queryBoleto: () =>
      Promise.resolve(boletoSnapshot({
        situationCode: 3,
        remoteStatus: "PAID",
        paid: true,
        payments: [{
          ValorPago: 20_038.33,
          DataPagamento: "2026-08-16",
        }],
      }) as any),
    syncFutureInstallments: () =>
      Promise.reject(new Error("rota indisponivel")),
  });

  assert.equal(receivable.status, "PAGO");
  assert.match(result.futureSyncWarning || "", /rota indisponivel/i);
  assert.match(
    String(admin.tables.contas_receber[0].gateway_last_error || ""),
    /parcelas futuras pendentes: rota indisponivel/i,
  );
});
