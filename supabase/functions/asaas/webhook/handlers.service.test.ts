import assert from "node:assert/strict";
import { createAsaasWebhookHandlers } from "./handlers.service.ts";

const snapshot = {
  id: "00000000-0000-4000-8000-000000000020",
  status: "PENDENTE",
  origem_pagamento: "ASAAS",
  updated_at: "2026-07-21T12:00:00.000Z",
  valor: 99.9,
  matricula_id: null,
  tipo_lancamento: "MENSALIDADE",
  asaas_payment_id: "pay_1",
  asaas_payment_link_id: null,
  asaas_installment_id: null,
  asaas_status: "PENDING",
  nosso_numero_asaas: "pay_1",
  gateway_provider: "asaas",
  gateway_environment: "sandbox",
  gateway_payment_method: "BOLETO",
  gateway_payment_id: "pay_1",
  gateway_payment_link_id: null,
  gateway_boleto_nosso_numero: null,
  gateway_customer_id: "cus_1",
  gateway_installment_id: null,
  gateway_status: "PENDING",
};

type Write = {
  table: string;
  values: Record<string, unknown>;
  filters: Array<["eq" | "is", string, unknown]>;
};

const payment = {
  id: "pay_1",
  externalReference: snapshot.id,
  customer: "cus_1",
  status: "RECEIVED",
  billingType: "BOLETO",
  value: 99.9,
  currency: "BRL",
  paymentDate: "2026-07-21",
};

Deno.test("webhook preserva baixa manual que vence o CAS", async () => {
  const manual = {
    ...snapshot,
    status: "PAGO",
    origem_pagamento: "PRESENCIAL",
    updated_at: "2026-07-21T12:01:00.000Z",
  };
  const reads = [{ ...snapshot }, manual];
  const updateResults = [null, manual];
  const writes: Write[] = [];
  const operationOrder: string[] = [];
  let transactionInserts = 0;
  let syncCalls = 0;
  const admin = {
    from(table: string) {
      if (table === "payment_gateway_transactions") {
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: () => ({ data: null, error: null }),
          insert(values: Record<string, unknown>) {
            transactionInserts += 1;
            operationOrder.push("transaction");
            const insertQuery = {
              select: () => insertQuery,
              maybeSingle: () => ({
                data: { id: "transaction-1", ...values },
                error: null,
              }),
            };
            return insertQuery;
          },
        };
        return query;
      }
      assert.equal(table, "contas_receber");
      let mode: "read" | "update" = "read";
      let values: Record<string, unknown> = {};
      const filters: Array<["eq" | "is", string, unknown]> = [];
      const query = {
        select: () => query,
        update(nextValues: Record<string, unknown>) {
          mode = "update";
          values = nextValues;
          return query;
        },
        eq(column: string, value: unknown) {
          filters.push(["eq", column, value]);
          return query;
        },
        is(column: string, value: unknown) {
          filters.push(["is", column, value]);
          return query;
        },
        maybeSingle: () => {
          if (mode === "read") {
            return { data: reads.shift() || null, error: null };
          }
          operationOrder.push("receivable");
          writes.push({ table, values, filters });
          const result = updateResults.shift() ?? null;
          return {
            data: result ? { ...result, ...values } : null,
            error: null,
          };
        },
      };
      return query;
    },
  };

  const handlers = createAsaasWebhookHandlers(
    admin,
    () => Promise.resolve(null),
    "sandbox",
    () => {
      syncCalls += 1;
      return Promise.resolve();
    },
  );
  await handlers.handleReceivablePayment(
    payment,
    "PAYMENT_RECEIVED",
    "PAGO",
  );

  assert.equal(syncCalls, 0);
  assert.equal(transactionInserts, 1);
  assert.deepEqual(operationOrder, [
    "transaction",
    "receivable",
    "receivable",
  ]);
  assert.equal(writes.length, 2);
  assert.equal("status" in writes[1].values, false);
  assert.equal("origem_pagamento" in writes[1].values, false);
  assert.match(
    String(writes[1].values.asaas_last_error),
    /REVISAO_ASAAS_WEBHOOK/,
  );
  assert.equal(
    writes[0].filters.some((filter) =>
      filter[0] === "eq" && filter[1] === "updated_at" &&
      filter[2] === snapshot.updated_at
    ),
    true,
  );
});

Deno.test("falha na transacao canonica interrompe a baixa antes de PAGO", async () => {
  const writes: Write[] = [];
  const operationOrder: string[] = [];
  let transactionInserts = 0;
  const admin = {
    from(table: string) {
      if (table === "payment_gateway_transactions") {
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: () => ({ data: null, error: null }),
          insert: () => {
            transactionInserts += 1;
            operationOrder.push("transaction");
            const failedInsert = {
              select: () => failedInsert,
              maybeSingle: () => ({
                data: null,
                error: { message: "falha simulada na transacao" },
              }),
            };
            return failedInsert;
          },
        };
        return query;
      }
      assert.equal(table, "contas_receber");
      let mode: "read" | "update" = "read";
      let values: Record<string, unknown> = {};
      const filters: Array<["eq" | "is", string, unknown]> = [];
      const query = {
        select: () => query,
        update(nextValues: Record<string, unknown>) {
          mode = "update";
          values = nextValues;
          return query;
        },
        eq(column: string, value: unknown) {
          filters.push(["eq", column, value]);
          return query;
        },
        is(column: string, value: unknown) {
          filters.push(["is", column, value]);
          return query;
        },
        maybeSingle: () => {
          if (mode === "read") return { data: { ...snapshot }, error: null };
          operationOrder.push("receivable-review");
          writes.push({ table, values, filters });
          return {
            data: { ...snapshot, ...values },
            error: null,
          };
        },
      };
      return query;
    },
  };

  const handlers = createAsaasWebhookHandlers(
    admin,
    () => Promise.resolve(null),
    "sandbox",
    () => Promise.resolve(),
  );

  await assert.rejects(
    () =>
      handlers.handleReceivablePayment(
        payment,
        "PAYMENT_RECEIVED",
        "PAGO",
      ),
    /falha simulada na transacao/i,
  );

  assert.equal(transactionInserts, 1);
  assert.deepEqual(operationOrder, ["transaction", "receivable-review"]);
  assert.equal(writes.length, 1);
  assert.equal("status" in writes[0].values, false);
  assert.equal("valor_pago" in writes[0].values, false);
  assert.match(
    String(writes[0].values.asaas_last_error),
    /REVISAO_ASAAS_WEBHOOK/,
  );
});

Deno.test("retry de link legado e adiado sem baixa duplicada", async () => {
  const legacyReceivable = {
    ...snapshot,
    id: "00000000-0000-4000-8000-000000000099",
    status: "PAGO",
    valor_pago: 99.9,
    origem_pagamento: "ASAAS",
    asaas_payment_id: "pay_link_1",
    asaas_payment_link_id: "link_1",
    nosso_numero_asaas: "pay_link_1",
    gateway_payment_id: "pay_link_1",
    gateway_payment_link_id: "link_1",
    gateway_customer_id: "cus_1",
    gateway_submission_channel: "API",
    gateway_submission_status: "API_REGISTERED",
  };
  let courseReads = 0;
  let writes = 0;
  const admin = {
    from(table: string) {
      if (table === "contas_receber") {
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: () => ({ data: legacyReceivable, error: null }),
          update: () => {
            writes += 1;
            throw new Error("retry legado nao pode baixar pelo fluxo canonico");
          },
        };
        return query;
      }
      if (table === "cursos") {
        courseReads += 1;
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: () => ({ data: { id: "course-1" }, error: null }),
        };
        return query;
      }
      throw new Error(`Tabela inesperada no retry legado: ${table}`);
    },
  };
  const handlers = createAsaasWebhookHandlers(
    admin,
    () => Promise.resolve(null),
    "sandbox",
    () => Promise.resolve(),
  );

  await handlers.handleReceivablePayment(
    {
      id: "pay_link_1",
      paymentLink: "link_1",
      externalReference: "course-1",
      customer: "cus_1",
      billingType: "BOLETO",
      value: 99.9,
      currency: "BRL",
    },
    "PAYMENT_RECEIVED",
    "PAGO",
  );

  assert.equal(courseReads, 1);
  assert.equal(writes, 0);
});

Deno.test("link legado de outro ambiente falha antes de qualquer escrita", async () => {
  let courseReads = 0;
  let unexpectedTables = 0;
  const admin = {
    from(table: string) {
      if (table !== "cursos") {
        unexpectedTables += 1;
        throw new Error(`escrita/leitura prematura em ${table}`);
      }
      courseReads += 1;
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: () => ({
          data: {
            id: "course-1",
            nome: "Curso EAD",
            modalidade: "EAD",
            valor: 99.9,
            asaas_payment_link_id: "link_producao",
            financeiro_config: {
              metodosRecebimento: {
                pix: false,
                boleto: true,
                cartao: false,
              },
              cartao: { aceitar: false },
            },
          },
          error: null,
        }),
      };
      return query;
    },
  };
  const handlers = createAsaasWebhookHandlers(
    admin,
    (path) => {
      assert.equal(path, "/paymentLinks/link_producao");
      return Promise.reject(new Error("link inexistente no sandbox"));
    },
    "sandbox",
    () => Promise.resolve(),
  );

  await assert.rejects(
    () =>
      handlers.handlePaymentLinkPayment(
        {
          id: "pay_prod",
          paymentLink: "link_producao",
          externalReference: "course-1",
          customer: "cus_prod",
          billingType: "BOLETO",
          value: 99.9,
          currency: "BRL",
        },
        "PAYMENT_RECEIVED",
        "PAGO",
        true,
      ),
    /nao foi comprovado no ambiente sandbox/i,
  );

  assert.equal(courseReads, 1);
  assert.equal(unexpectedTables, 0);
});

Deno.test("webhook não reativa matrícula cancelada nem sincroniza parcelas", async () => {
  const enrollmentReceivable = {
    ...snapshot,
    matricula_id: "00000000-0000-4000-8000-000000000030",
    tipo_lancamento: "MATRICULA",
    cliente_id: "00000000-0000-4000-8000-000000000040",
  };
  const writes: Write[] = [];
  let receivableRead = false;
  let receivableUpdate = 0;
  let transactionInserts = 0;
  let enrollmentUpdates = 0;
  let syncCalls = 0;
  const admin = {
    from(table: string) {
      if (table === "payment_gateway_transactions") {
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: () => ({ data: null, error: null }),
        };
        return {
          ...query,
          insert(values: Record<string, unknown>) {
            transactionInserts += 1;
            const inserted = {
              id: "00000000-0000-4000-8000-000000000090",
              ...values,
            };
            const insertQuery = {
              select: () => insertQuery,
              maybeSingle: () => ({ data: inserted, error: null }),
            };
            return insertQuery;
          },
        };
      }
      if (table === "contas_receber") {
        let mode: "read" | "update" = "read";
        let values: Record<string, unknown> = {};
        const filters: Array<["eq" | "is", string, unknown]> = [];
        const query = {
          select: () => query,
          update(nextValues: Record<string, unknown>) {
            mode = "update";
            values = nextValues;
            return query;
          },
          eq(column: string, value: unknown) {
            filters.push(["eq", column, value]);
            return query;
          },
          is(column: string, value: unknown) {
            filters.push(["is", column, value]);
            return query;
          },
          neq: () => query,
          maybeSingle: () => {
            if (mode === "read") {
              assert.equal(receivableRead, false);
              receivableRead = true;
              return { data: enrollmentReceivable, error: null };
            }
            receivableUpdate += 1;
            writes.push({ table, values, filters });
            return {
              data: {
                ...enrollmentReceivable,
                ...values,
                updated_at: String(values.updated_at),
              },
              error: null,
            };
          },
        };
        return query;
      }
      if (table === "matriculas") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => ({
                data: {
                  id: enrollmentReceivable.matricula_id,
                  status: "CANCELADO",
                  turmas: {
                    cursos: { id: "course-1", modalidade: "EAD" },
                  },
                },
                error: null,
              }),
            }),
          }),
          update: () => {
            enrollmentUpdates += 1;
            throw new Error("matrícula cancelada não pode ser atualizada");
          },
        };
      }
      throw new Error(`Tabela inesperada no teste: ${table}`);
    },
  };

  const handlers = createAsaasWebhookHandlers(
    admin,
    () => Promise.resolve(null),
    "sandbox",
    () => {
      syncCalls += 1;
      return Promise.resolve();
    },
  );
  await handlers.handleReceivablePayment(
    payment,
    "PAYMENT_RECEIVED",
    "PAGO",
  );

  assert.equal(enrollmentUpdates, 0);
  assert.equal(syncCalls, 0);
  assert.equal(receivableUpdate, 2);
  assert.equal(transactionInserts, 1);
  assert.match(
    String(writes[1].values.asaas_last_error),
    /REVISAO_ACADEMICA_ASAAS/,
  );
});

Deno.test("pagamento por link registra revisão sem reviver matrícula encerrada", async () => {
  let contasCalls = 0;
  let inscriptionCalls = 0;
  let enrollmentUpdates = 0;
  let rpcCalls = 0;
  let syncCalls = 0;
  const receivableInserts: Array<Record<string, unknown>> = [];
  const reviewWrites: Array<Record<string, unknown>> = [];
  const enrollmentId = "00000000-0000-4000-8000-000000000050";
  const admin = {
    from(table: string) {
      if (table === "cursos") {
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: () => ({
            data: {
              id: "course-1",
              nome: "Curso EAD",
              modalidade: "EAD",
              valor: 99.9,
              asaas_payment_link_id: "link_1",
              financeiro_config: {
                metodosRecebimento: {
                  pix: false,
                  boleto: true,
                  cartao: false,
                },
                cartao: { aceitar: false },
              },
            },
            error: null,
          }),
        };
        return query;
      }
      if (table === "parceiros") {
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: () => ({
            data: {
              id: "student-1",
              nome: "Aluno",
              cpf_cnpj: "52998224725",
              asaas_customer_id: "cus_1",
            },
            error: null,
          }),
        };
        return query;
      }
      if (table === "turmas") {
        const query = {
          select: () => query,
          eq: () => query,
          limit: () => ({
            data: [{ id: "class-1", polo_id: "polo-1" }],
            error: null,
          }),
        };
        return query;
      }
      if (table === "matriculas") {
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: () => ({
            data: {
              id: enrollmentId,
              aluno_id: "student-1",
              turma_id: "class-1",
              status: "DESISTENTE",
            },
            error: null,
          }),
          update: () => {
            enrollmentUpdates += 1;
            throw new Error("matrícula desistente não pode ser reativada");
          },
        };
        return query;
      }
      if (table === "contas_receber") {
        contasCalls += 1;
        if (contasCalls === 1) {
          const query = {
            select: () => query,
            eq: () => query,
            maybeSingle: () => ({ data: null, error: null }),
          };
          return query;
        }
        if (contasCalls === 2) {
          return {
            insert: (values: Record<string, unknown>) => {
              receivableInserts.push(values);
              const query = {
                select: () => query,
                maybeSingle: () => ({
                  data: { id: "receivable-1" },
                  error: null,
                }),
              };
              return query;
            },
          };
        }
        return {
          update(values: Record<string, unknown>) {
            reviewWrites.push(values);
            return { eq: () => ({ error: null }) };
          },
        };
      }
      if (table === "inscricoes_online") {
        inscriptionCalls += 1;
        if (inscriptionCalls <= 2) {
          const query = {
            select: () => query,
            eq: () => query,
            order: () => query,
            limit: () => query,
            maybeSingle: () => ({ data: null, error: null }),
          };
          return query;
        }
        if (inscriptionCalls === 3) {
          return { insert: () => ({ error: null }) };
        }
        return {
          update(values: Record<string, unknown>) {
            reviewWrites.push(values);
            let filters = 0;
            const query = {
              eq: () => {
                filters += 1;
                return query;
              },
              then(resolve: (value: unknown) => unknown) {
                assert.equal(filters, 2);
                return Promise.resolve({ error: null }).then(resolve);
              },
            };
            return query;
          },
        };
      }
      throw new Error(`Tabela inesperada no teste: ${table}`);
    },
    rpc: () => {
      rpcCalls += 1;
      return { error: null };
    },
  };

  const handlers = createAsaasWebhookHandlers(
    admin,
    (path) => {
      if (path === "/paymentLinks/link_1") {
        return Promise.resolve({
          id: "link_1",
          externalReference: "course-1",
          billingType: "UNDEFINED",
          chargeType: "DETACHED",
          value: 99.9,
          currency: "BRL",
          deleted: false,
        });
      }
      assert.equal(path, "/customers/cus_1");
      return Promise.resolve({
        id: "cus_1",
        name: "Aluno",
        cpfCnpj: "52998224725",
      });
    },
    "sandbox",
    () => {
      syncCalls += 1;
      return Promise.resolve();
    },
  );
  await handlers.handlePaymentLinkPayment(
    {
      id: "pay_link_1",
      paymentLink: "link_1",
      externalReference: "course-1",
      customer: "cus_1",
      status: "RECEIVED",
      billingType: "BOLETO",
      value: 99.9,
      currency: "BRL",
    },
    "PAYMENT_RECEIVED",
    "PAGO",
    true,
  );

  assert.equal(enrollmentUpdates, 0);
  assert.equal(rpcCalls, 0);
  assert.equal(syncCalls, 0);
  assert.equal(receivableInserts.length, 1);
  assert.equal(receivableInserts[0].valor, 99.9);
  assert.equal(receivableInserts[0].gateway_provider, "asaas");
  assert.equal(receivableInserts[0].gateway_environment, "sandbox");
  assert.equal(receivableInserts[0].gateway_payment_method, "BOLETO");
  assert.equal(receivableInserts[0].gateway_payment_id, "pay_link_1");
  assert.equal(receivableInserts[0].gateway_payment_link_id, "link_1");
  assert.equal(reviewWrites.length, 2);
  assert.match(
    String(reviewWrites[0].asaas_last_error),
    /REVISAO_ACADEMICA_ASAAS/,
  );
  assert.match(String(reviewWrites[1].erro), /matricula_status=DESISTENTE/);
});
