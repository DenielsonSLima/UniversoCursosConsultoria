import assert from "node:assert/strict";
import { reconcileBaneseReceivable } from "./banese.ts";
import { BANESE_POST_SETTLEMENT_PENDING_MESSAGE } from "./banese-post-settlement.ts";
import {
  boletoSnapshot,
  fakeAdmin,
  type FakeRow,
  NOSSO_NUMERO,
  RECEIVABLE_ID,
  receivableFixture,
} from "./banese-test-harness.ts";

Deno.test("aceita liquidacao com desconto ou acrescimos confirmados", async () => {
  for (
    const [paymentDate, paymentValue] of [
      ["2026-08-15", 19_980.1],
      ["2026-08-16", 20_038.33],
    ] as const
  ) {
    const admin = fakeAdmin(receivableFixture());
    await reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
      queryBoleto: () =>
        Promise.resolve(boletoSnapshot({
          situationCode: 3,
          remoteStatus: "PAID",
          paid: true,
          payments: [{
            ValorPago: paymentValue,
            DataPagamento: paymentDate,
          }],
        }) as any),
    });
    assert.equal(admin.tables.contas_receber[0].status, "PAGO");
    assert.equal(admin.tables.contas_receber[0].valor_pago, paymentValue);
    assert.equal(admin.tables.contas_receber[0].forma_pagamento, "BOLETO");
  }
});

Deno.test("liquidacao API com motivo canonico 61 contabiliza PIX", async () => {
  const matriculaId = "22222222-2222-4222-8222-222222222222";
  const turmaId = "33333333-3333-4333-8333-333333333333";
  const alunoId = "44444444-4444-4444-8444-444444444444";
  const cursoId = "55555555-5555-4555-8555-555555555555";
  const receivable: FakeRow = receivableFixture({
    matricula_id: matriculaId,
    turma_id: turmaId,
    cliente_id: alunoId,
    forma_pagamento: null,
  });
  const admin = fakeAdmin(receivable);
  admin.tables.inscricoes_online = [{
    id: "66666666-6666-4666-8666-666666666666",
    curso_id: cursoId,
    turma_id: turmaId,
    aluno_id: alunoId,
    matricula_id: matriculaId,
    receivable_id: RECEIVABLE_ID,
    gateway_provider: "banese_card",
    gateway_environment: "sandbox",
    gateway_payment_id: NOSSO_NUMERO,
    status: "AGUARDANDO_PAGAMENTO",
    forma_pagamento: null,
  }];
  admin.tables.matriculas = [{
    id: matriculaId,
    turma_id: turmaId,
    aluno_id: alunoId,
  }];
  admin.tables.turmas = [{ id: turmaId, curso_id: cursoId }];
  admin.tables.parceiros = [{
    id: alunoId,
    nome: "Aluno Banese",
    cpf_cnpj: "78269105520",
  }];

  await reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
    queryBoleto: () =>
      Promise.resolve(boletoSnapshot({
        situationCode: 3,
        remoteStatus: "PAID",
        paid: true,
        payments: [{
          ValorPago: 20_038.33,
          DataPagamento: "2026-08-16",
          CodigoMotivoLiquidacao: "61",
        }],
      }) as any),
  });

  assert.equal(receivable.forma_pagamento, "PIX");
  assert.equal(admin.tables.inscricoes_online[0].forma_pagamento, "PIX");
  assert.equal(
    admin.tables.payment_gateway_transactions[0].payment_method,
    "BOLETO",
  );
  assert.equal(
    admin.tables.payment_gateway_transactions[0].raw_payload.settlementMethod,
    "PIX",
  );
});

Deno.test("dependência nova não libera quando Banese informa BolePix", async () => {
  const receivable: FakeRow = receivableFixture({
    tipo_lancamento: "DEPENDENCIA",
    regra_financeira_dependencia_snapshot: {
      origem: "DEPENDENCIA",
      diasBaixaDevolucao: 60,
    },
  });
  const admin = fakeAdmin(receivable);

  await assert.rejects(
    () =>
      reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
        queryBoleto: () =>
          Promise.resolve(boletoSnapshot({
            situationCode: 3,
            remoteStatus: "PAID",
            paid: true,
            payments: [{
              ValorPago: 20_038.33,
              DataPagamento: "2026-08-16",
              CodigoMotivoLiquidacao: "61",
            }],
          }) as any),
      }),
    /somente por boleto Banese.*revisão/i,
  );

  assert.equal(receivable.status, "PENDENTE");
});

Deno.test("liquidacao canonica Banese libera curso EAD automaticamente", async () => {
  const matriculaId = "22222222-2222-4222-8222-222222222222";
  const turmaId = "33333333-3333-4333-8333-333333333333";
  const alunoId = "44444444-4444-4444-8444-444444444444";
  const cursoId = "55555555-5555-4555-8555-555555555555";
  const receivable: FakeRow = receivableFixture({
    matricula_id: matriculaId,
    turma_id: turmaId,
    cliente_id: alunoId,
    tipo_lancamento: "MATRICULA",
    forma_pagamento: "BOLETO",
    // Reproduz o retorno real que removeu zeros à esquerda no checkout.
    gateway_payment_id: String(Number(NOSSO_NUMERO)),
  });
  const admin = fakeAdmin(receivable);
  admin.tables.inscricoes_online = [{
    id: "66666666-6666-4666-8666-666666666666",
    curso_id: cursoId,
    turma_id: turmaId,
    aluno_id: alunoId,
    matricula_id: matriculaId,
    receivable_id: RECEIVABLE_ID,
    gateway_provider: "banese_card",
    gateway_environment: "sandbox",
    gateway_payment_id: String(Number(NOSSO_NUMERO)),
    status: "AGUARDANDO_PAGAMENTO",
    forma_pagamento: "BOLETO",
    pago_em: null,
    confirmado_em: null,
  }];
  admin.tables.matriculas = [{
    id: matriculaId,
    turma_id: turmaId,
    aluno_id: alunoId,
    status: "PENDENTE",
    turmas: {
      cursos: { id: cursoId, modalidade: "EAD" },
    },
  }];
  admin.tables.turmas = [{ id: turmaId, curso_id: cursoId }];
  admin.tables.parceiros = [{
    id: alunoId,
    nome: "Aluno EAD Banese",
    cpf_cnpj: "78269105520",
  }];

  await reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
    queryBoleto: () =>
      Promise.resolve(boletoSnapshot({
        situationCode: 3,
        remoteStatus: "PAID",
        paid: true,
        payments: [{
          ValorPago: 20_038.33,
          DataPagamento: "2026-08-16",
          FormaLiquidacao: "BOLETO",
        }],
      }) as any),
  });

  assert.equal(receivable.status, "PAGO");
  assert.equal(receivable.gateway_payment_id, NOSSO_NUMERO);
  assert.equal(receivable.data_pagamento, "2026-08-16");
  assert.equal(admin.tables.inscricoes_online[0].status, "PAGO");
  assert.equal(
    admin.tables.inscricoes_online[0].gateway_payment_id,
    NOSSO_NUMERO,
  );
  assert.equal(
    admin.tables.inscricoes_online[0].pago_em,
    "2026-08-16",
  );
  assert.equal(admin.tables.matriculas[0].status, "ATIVO");
  assert.equal(
    admin.tables.payment_gateway_transactions[0].remote_payment_id,
    NOSSO_NUMERO,
  );
});

Deno.test("rejeita liquidacao fora dos termos financeiros confirmados", async () => {
  const admin = fakeAdmin(receivableFixture());
  await assert.rejects(
    () =>
      reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
        queryBoleto: () =>
          Promise.resolve(boletoSnapshot({
            situationCode: 3,
            remoteStatus: "PAID",
            paid: true,
            payments: [{
              ValorPago: 19_000,
              DataPagamento: "2026-08-15",
            }],
          }) as any),
      }),
    /termos confirmados do titulo/i,
  );
  assert.equal(admin.tables.contas_receber[0].status, "PENDENTE");
});

Deno.test("rejeita um centavo fora da faixa financeira calculada", async () => {
  for (const paymentValue of [19_980.09, 19_980.11]) {
    const admin = fakeAdmin(receivableFixture());
    await assert.rejects(
      () =>
        reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
          queryBoleto: () =>
            Promise.resolve(boletoSnapshot({
              situationCode: 3,
              remoteStatus: "PAID",
              paid: true,
              payments: [{
                ValorPago: paymentValue,
                DataPagamento: "2026-08-15",
              }],
            }) as any),
        }),
      /termos confirmados do titulo/i,
    );
  }
});

Deno.test("replay pos-baixa conclui projecoes sem depender de novo GET", async () => {
  const matriculaId = "22222222-2222-4222-8222-222222222222";
  const turmaId = "33333333-3333-4333-8333-333333333333";
  const alunoId = "44444444-4444-4444-8444-444444444444";
  const cursoId = "55555555-5555-4555-8555-555555555555";
  const receivable: FakeRow = receivableFixture({
    status: "PAGO",
    gateway_status: "PAID",
    gateway_last_error: BANESE_POST_SETTLEMENT_PENDING_MESSAGE,
    matricula_id: matriculaId,
    turma_id: turmaId,
    cliente_id: alunoId,
    tipo_lancamento: "MATRICULA",
    forma_pagamento: "BOLETO",
    data_pagamento: "2026-08-16",
  });
  const admin = fakeAdmin(receivable, [{
    id: "77777777-7777-4777-8777-777777777777",
    receivable_id: RECEIVABLE_ID,
    provider_code: "banese_card",
    environment: "sandbox",
    payment_method: "BOLETO",
    remote_payment_id: NOSSO_NUMERO,
    bank_slip_our_number: NOSSO_NUMERO,
    remote_status: "PAID",
  }]);
  admin.tables.inscricoes_online = [{
    id: "66666666-6666-4666-8666-666666666666",
    curso_id: cursoId,
    turma_id: turmaId,
    aluno_id: alunoId,
    matricula_id: matriculaId,
    receivable_id: RECEIVABLE_ID,
    status: "AGUARDANDO_PAGAMENTO",
  }];
  admin.tables.matriculas = [{
    id: matriculaId,
    status: "PENDENTE",
    turmas: { cursos: { id: cursoId, modalidade: "EAD" } },
  }];
  admin.tables.turmas = [{ id: turmaId, curso_id: cursoId }];
  admin.tables.parceiros = [{
    id: alunoId,
    nome: "Aluno EAD Banese",
    cpf_cnpj: "78269105520",
  }];

  let queried = false;
  const result = await reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
    queryBoleto: () => {
      queried = true;
      return Promise.reject(new Error("Banese recusou consulta (401)"));
    },
  });

  assert.equal(queried, false);
  assert.equal(result.paid, true);
  assert.equal(result.remoteStatus, "PAID");
  assert.equal(receivable.gateway_last_error, null);
  assert.equal(admin.tables.matriculas[0].status, "ATIVO");
  assert.equal(admin.tables.inscricoes_online[0].status, "PAGO");
  assert.equal(admin.tables.payment_gateway_transactions.length, 1);
});
