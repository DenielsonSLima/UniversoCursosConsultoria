import assert from "node:assert/strict";
import { BANESE_DOCUMENT_FIXTURE } from "../../banese/internal/testing/document-fixture.ts";
import {
  baneseReceivableTitleFilter,
  baneseTransactionTitleFilter,
  reconcileBaneseReceivable,
  sumBanesePaymentValues,
} from "./banese.ts";

type FakeRow = Record<string, any>;

class FakeAdmin {
  tables: Record<string, FakeRow[]>;
  updateAttempts: Array<{ table: string; values: FakeRow }> = [];
  forceReceivableUpdateNoOp = false;

  constructor(tables: Record<string, FakeRow[]>) {
    this.tables = tables;
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }
}

class FakeQuery {
  private action: "select" | "update" | "insert" = "select";
  private values: FakeRow = {};
  private filters: Array<(row: FakeRow) => boolean> = [];
  private returnsRows = false;

  constructor(private admin: FakeAdmin, private table: string) {}

  select(_columns = "*") {
    this.returnsRows = true;
    return this;
  }

  update(values: FakeRow) {
    this.action = "update";
    this.values = values;
    this.admin.updateAttempts.push({ table: this.table, values });
    return this;
  }

  insert(values: FakeRow) {
    this.action = "insert";
    this.values = values;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  or(expression: string) {
    const receivable = expression.match(
      /^gateway_boleto_nosso_numero\.eq\.(\d{9}),and\(gateway_boleto_nosso_numero\.is\.null,gateway_payment_id\.eq\.(\d{9})\)$/,
    );
    if (receivable) {
      this.filters.push((row) =>
        row.gateway_boleto_nosso_numero === receivable[1] ||
        ((row.gateway_boleto_nosso_numero === null ||
          row.gateway_boleto_nosso_numero === undefined) &&
          row.gateway_payment_id === receivable[2])
      );
      return this;
    }

    const transaction = expression.match(
      /^bank_slip_our_number\.eq\.(\d{9}),remote_payment_id\.eq\.(\d{9})$/,
    );
    if (!transaction) throw new Error(`Filtro fake inesperado: ${expression}`);
    this.filters.push((row) =>
      row.bank_slip_our_number === transaction[1] ||
      row.remote_payment_id === transaction[2]
    );
    return this;
  }

  async maybeSingle() {
    const result = await this.execute();
    if (result.error) return result;
    const rows = Array.isArray(result.data) ? result.data : [];
    if (rows.length > 1) {
      return { data: null, error: new Error("Mais de uma linha no fake") };
    }
    return { data: rows[0] ?? null, error: null };
  }

  async single() {
    const result = await this.maybeSingle();
    if (!result.data && !result.error) {
      return { data: null, error: new Error("Linha ausente no fake") };
    }
    return result;
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute() {
    const rows = this.admin.tables[this.table] ?? [];
    const matched = rows.filter((row) =>
      this.filters.every((filter) => filter(row))
    );

    if (this.action === "select") {
      return { data: matched.map((row) => ({ ...row })), error: null };
    }
    if (this.action === "insert") {
      rows.push({ ...this.values });
      return {
        data: this.returnsRows ? [{ ...this.values }] : null,
        error: null,
      };
    }
    if (
      this.table === "contas_receber" &&
      this.admin.forceReceivableUpdateNoOp
    ) {
      return { data: this.returnsRows ? [] : null, error: null };
    }

    for (const row of matched) Object.assign(row, this.values);
    return {
      data: this.returnsRows ? matched.map((row) => ({ ...row })) : null,
      error: null,
    };
  }
}

const RECEIVABLE_ID = BANESE_DOCUMENT_FIXTURE.receivableId;
const NOSSO_NUMERO = BANESE_DOCUMENT_FIXTURE.ourNumber;

const receivableFixture = (overrides: FakeRow = {}) => ({
  id: RECEIVABLE_ID,
  gateway_provider: "banese_card",
  gateway_environment: "sandbox",
  gateway_payment_method: "BOLETO",
  gateway_payment_id: NOSSO_NUMERO,
  gateway_boleto_nosso_numero: NOSSO_NUMERO,
  status: "PENDENTE",
  valor: 20_000,
  data_vencimento: BANESE_DOCUMENT_FIXTURE.dueDate,
  gateway_financial_terms: BANESE_DOCUMENT_FIXTURE.financialTerms,
  gateway_financial_terms_confirmed_at: "2026-07-16T12:00:00Z",
  ...overrides,
});

const fakeAdmin = (receivable: FakeRow, transactions: FakeRow[] = []) =>
  new FakeAdmin({
    contas_receber: [receivable],
    payment_gateway_credentials: [{
      provider_code: "banese_card",
      environment: "sandbox",
      metadata: { baneseBoletoConvenio: "15528" },
    }],
    payment_gateway_transactions: transactions,
  });

const boletoSnapshot = (overrides: FakeRow = {}) => ({
  convenio: "15528",
  nossoNumero: NOSSO_NUMERO,
  situationCode: 2,
  remoteStatus: "OPEN",
  paid: false,
  payments: [],
  financialTerms: BANESE_DOCUMENT_FIXTURE.financialTerms,
  raw: { CodigoSituacaoBoleto: 2 },
  ...overrides,
});

Deno.test("rejeita ValorPago nao finito antes de qualquer baixa", async () => {
  assert.throws(
    () => sumBanesePaymentValues([{ ValorPago: "NaN" }]),
    /ValorPago invalido.*baixa local foi preservada/i,
  );
  assert.throws(
    () => sumBanesePaymentValues([{ ValorPago: null }, { ValorPago: 20_000 }]),
    /ValorPago invalido/i,
  );
  assert.throws(
    () => sumBanesePaymentValues([{ ValorPago: " " }, { ValorPago: 20_000 }]),
    /ValorPago invalido/i,
  );
  for (const value of [0, -1]) {
    assert.throws(
      () => sumBanesePaymentValues([{ ValorPago: value }]),
      /ValorPago invalido/i,
    );
  }

  const admin = fakeAdmin(receivableFixture());
  await assert.rejects(
    () =>
      reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
        queryBoleto: () =>
          Promise.resolve(boletoSnapshot({
            situationCode: 3,
            remoteStatus: "PAID",
            paid: true,
            payments: [{ ValorPago: "invalido", DataPagamento: "2026-07-16" }],
          }) as any),
      }),
    /ValorPago invalido/i,
  );
  assert.equal(admin.updateAttempts.length, 0);
  assert.equal(admin.tables.contas_receber[0].status, "PENDENTE");
});

Deno.test("rejeita qualquer DataPagamento invalida no detalhe bancario", async () => {
  const admin = fakeAdmin(receivableFixture());
  await assert.rejects(
    () =>
      reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
        queryBoleto: () =>
          Promise.resolve(boletoSnapshot({
            situationCode: 3,
            remoteStatus: "PAID",
            paid: true,
            payments: [
              { ValorPago: 10_000, DataPagamento: "2026-02-30" },
              { ValorPago: 9_980.1, DataPagamento: "2026-08-15" },
            ],
          }) as any),
      }),
    /DataPagamento invalida/i,
  );
  assert.equal(admin.tables.contas_receber[0].status, "PENDENTE");
});

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
  }
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
