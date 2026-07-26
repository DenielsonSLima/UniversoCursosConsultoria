import assert from "node:assert/strict";
import { BANESE_DOCUMENT_FIXTURE } from "../../banese/internal/testing/document-fixture.ts";
import {
  baneseReceivableTitleFilter,
  baneseTransactionTitleFilter,
  classifyBaneseSettlementMethod,
  reconcileBaneseReceivable,
  sumBanesePaymentValues,
} from "./banese.ts";
import { persistBaneseBoletoIntent } from "../boleto/banese.ts";

type FakeRow = Record<string, any>;

class FakeAdmin {
  tables: Record<string, FakeRow[]>;
  updateAttempts: Array<{ table: string; values: FakeRow }> = [];
  forceReceivableUpdateNoOp = false;
  beforeReceivableUpdate: ((row: FakeRow) => void) | null = null;

  constructor(tables: Record<string, FakeRow[]>) {
    this.tables = tables;
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }
}

class FakeQuery {
  private action: "select" | "update" | "insert" | "upsert" = "select";
  private values: FakeRow = {};
  private filters: Array<(row: FakeRow) => boolean> = [];
  private returnsRows = false;
  private conflictColumns: string[] = [];

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

  upsert(values: FakeRow, options: { onConflict?: string } = {}) {
    this.action = "upsert";
    this.values = values;
    this.conflictColumns = String(options.onConflict || "")
      .split(",")
      .map((column) => column.trim())
      .filter(Boolean);
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== value);
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push((row) =>
      value === null && (row[column] === null || row[column] === undefined)
    );
    return this;
  }

  filter(column: string, operator: string, value: unknown) {
    if (operator !== "eq") {
      throw new Error(`Operador fake inesperado: ${operator}`);
    }
    const expected = typeof value === "string" ? JSON.parse(value) : value;
    this.filters.push((row) =>
      JSON.stringify(row[column]) === JSON.stringify(expected)
    );
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
    const rows = this.admin.tables[this.table] ??
      (this.admin.tables[this.table] = []);
    if (
      this.action === "update" && this.table === "contas_receber" &&
      this.admin.beforeReceivableUpdate
    ) {
      const mutate = this.admin.beforeReceivableUpdate;
      this.admin.beforeReceivableUpdate = null;
      if (rows[0]) mutate(rows[0]);
    }
    const matched = rows.filter((row) =>
      this.filters.every((filter) => filter(row))
    );

    if (this.action === "select") {
      return { data: matched.map((row) => ({ ...row })), error: null };
    }
    if (this.action === "insert") {
      const inserted = {
        id: this.values.id || `fake-${this.table}-${rows.length + 1}`,
        ...this.values,
      };
      rows.push(inserted);
      return {
        data: this.returnsRows ? [{ ...inserted }] : null,
        error: null,
      };
    }
    if (this.action === "upsert") {
      const current = this.conflictColumns.length > 0
        ? rows.find((row) =>
          this.conflictColumns.every((column) =>
            row[column] === this.values[column]
          )
        )
        : null;
      const target = current || {
        id: this.values.id || `fake-${this.table}-${rows.length + 1}`,
      };
      const terminalStatus = target.status;
      Object.assign(target, this.values);
      if (terminalStatus === "PAGO" && this.values.status !== "PAGO") {
        target.status = "PAGO";
      }
      if (!current) rows.push(target);
      return {
        data: this.returnsRows ? [{ ...target }] : null,
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
  origem_pagamento: "GATEWAY_ONLINE",
  valor: 20_000,
  data_vencimento: BANESE_DOCUMENT_FIXTURE.dueDate,
  gateway_financial_terms: BANESE_DOCUMENT_FIXTURE.financialTerms,
  gateway_financial_terms_confirmed_at: "2026-07-16T12:00:00Z",
  gateway_status: "PENDING",
  updated_at: "2026-07-21T12:00:00.000Z",
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
    inscricoes_online: [],
    matriculas: [],
    turmas: [],
    parceiros: [],
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

Deno.test("persiste pedido financeiro Banese sob ownership antes do POST", async () => {
  const receivable: FakeRow = receivableFixture({
    gateway_payment_id: null,
    gateway_boleto_nosso_numero: null,
    gateway_status: "CREATING",
    gateway_creation_token: "attempt-owned",
    gateway_financial_terms: null,
    gateway_financial_terms_confirmed_at: null,
    gateway_submission_channel: null,
    gateway_submission_status: null,
    metadata: { baneseBoletoConvenio: "15528" },
  });
  const admin = fakeAdmin(receivable);

  const result = await persistBaneseBoletoIntent({
    admin,
    supabaseUrl: "https://example.supabase.co",
    providerCode: "banese_card",
    environment: "sandbox",
    paymentMethod: "BOLETO",
    receivable,
    payer: { name: "Aluno Teste" },
    amount: BANESE_DOCUMENT_FIXTURE.amount,
    description: "Teste",
    dueDate: BANESE_DOCUMENT_FIXTURE.dueDate,
    financialTerms: BANESE_DOCUMENT_FIXTURE.financialTerms,
  });

  assert.deepEqual(
    admin.tables.contas_receber[0].gateway_financial_terms,
    result.financialTerms,
  );
  assert.equal(result.financialTerms.nominalAmount, 20_000);
  assert.equal(result.financialTerms.discount?.validUntil, "2026-08-15");
  assert.equal(
    admin.tables.contas_receber[0].gateway_financial_terms_confirmed_at,
    null,
  );
  assert.equal(result.receivable.gateway_creation_token, "attempt-owned");
  assert.deepEqual(result.receivable.metadata, {
    baneseBoletoConvenio: "15528",
  });
});

Deno.test("pedido financeiro Banese perde CAS se ownership mudar", async () => {
  const receivable: FakeRow = receivableFixture({
    gateway_payment_id: null,
    gateway_boleto_nosso_numero: null,
    gateway_status: "CREATING",
    gateway_creation_token: "attempt-original",
    gateway_financial_terms: null,
    gateway_financial_terms_confirmed_at: null,
    gateway_submission_channel: null,
    gateway_submission_status: null,
  });
  const admin = fakeAdmin(receivable);
  admin.beforeReceivableUpdate = (current) => {
    current.gateway_creation_token = "attempt-concurrent";
  };

  await assert.rejects(
    () =>
      persistBaneseBoletoIntent({
        admin,
        supabaseUrl: "https://example.supabase.co",
        providerCode: "banese_card",
        environment: "sandbox",
        paymentMethod: "BOLETO",
        receivable,
        payer: { name: "Aluno Teste" },
        amount: BANESE_DOCUMENT_FIXTURE.amount,
        description: "Teste",
        dueDate: BANESE_DOCUMENT_FIXTURE.dueDate,
        financialTerms: BANESE_DOCUMENT_FIXTURE.financialTerms,
      }),
    /mudou antes de persistir.*nenhum POST/i,
  );
  assert.equal(receivable.gateway_creation_token, "attempt-concurrent");
  assert.equal(receivable.gateway_financial_terms, null);
});

Deno.test("GET Banese positivo confirma submissao ambigua por CAS", async () => {
  const receivable: FakeRow = receivableFixture({
    gateway_status: "CREATING",
    gateway_creation_token: "attempt-ambiguous",
    gateway_submission_channel: null,
    gateway_submission_status: "API_AMBIGUOUS",
    gateway_financial_terms_confirmed_at: null,
  });
  const admin = fakeAdmin(receivable);

  const result = await reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
    queryBoleto: () => Promise.resolve(boletoSnapshot() as any),
  });

  assert.equal(result.success, true);
  assert.equal(receivable.gateway_creation_token, null);
  assert.equal(receivable.gateway_submission_channel, "API");
  assert.equal(receivable.gateway_submission_status, "API_REGISTERED");
  assert.equal(receivable.gateway_status, "OPEN");
  assert.match(
    String(receivable.gateway_financial_terms_confirmed_at || ""),
    /^\d{4}-\d{2}-\d{2}T/,
  );
});

Deno.test("corrida impede confirmar API_AMBIGUOUS com snapshot antigo", async () => {
  const receivable: FakeRow = receivableFixture({
    gateway_status: "CREATING",
    gateway_creation_token: "attempt-original",
    gateway_submission_channel: "API",
    gateway_submission_status: "API_AMBIGUOUS",
    gateway_financial_terms_confirmed_at: null,
  });
  const admin = fakeAdmin(receivable);
  admin.beforeReceivableUpdate = (current) => {
    current.gateway_creation_token = "attempt-concurrent";
    current.gateway_submission_status = "API_REVIEW";
  };

  await assert.rejects(
    () =>
      reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
        queryBoleto: () => Promise.resolve(boletoSnapshot() as any),
      }),
    /Cobranca mudou durante a conciliacao Banese/i,
  );
  assert.equal(receivable.gateway_creation_token, "attempt-concurrent");
  assert.equal(receivable.gateway_submission_status, "API_REVIEW");
  assert.equal(receivable.gateway_financial_terms_confirmed_at, null);
});

Deno.test("API_AMBIGUOUS sem pedido canonico falha antes do GET", async () => {
  const receivable: FakeRow = receivableFixture({
    gateway_status: "CREATING",
    gateway_creation_token: "attempt-legacy",
    gateway_submission_channel: "API",
    gateway_submission_status: "API_AMBIGUOUS",
    gateway_financial_terms: null,
    gateway_financial_terms_confirmed_at: null,
  });
  const admin = fakeAdmin(receivable);
  let queried = false;

  await assert.rejects(
    () =>
      reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
        queryBoleto: () => {
          queried = true;
          return Promise.resolve(boletoSnapshot() as any);
        },
      }),
    /pedido financeiro canonico.*antes do POST/i,
  );
  assert.equal(queried, false);
  assert.equal(receivable.gateway_submission_status, "API_AMBIGUOUS");
  assert.equal(receivable.gateway_creation_token, "attempt-legacy");
});

Deno.test("GET divergente preserva API_AMBIGUOUS e pedido canonico", async () => {
  const receivable: FakeRow = receivableFixture({
    gateway_status: "CREATING",
    gateway_creation_token: "attempt-divergent",
    gateway_submission_channel: "API",
    gateway_submission_status: "API_AMBIGUOUS",
    gateway_financial_terms_confirmed_at: null,
  });
  const admin = fakeAdmin(receivable);

  await assert.rejects(
    () =>
      reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
        queryBoleto: () =>
          Promise.resolve(boletoSnapshot({
            financialTerms: {
              ...BANESE_DOCUMENT_FIXTURE.financialTerms,
              discount: { type: "fixed", value: 10 },
            },
          }) as any),
      }),
    /termos retornados pelo Banese divergem|Desconto, multa ou juros.*divergem/i,
  );
  assert.equal(receivable.gateway_creation_token, "attempt-divergent");
  assert.equal(receivable.gateway_submission_status, "API_AMBIGUOUS");
  assert.equal(receivable.gateway_financial_terms_confirmed_at, null);
  assert.equal(admin.updateAttempts.length, 0);
});

Deno.test("pedido canonico divergente do recebivel falha antes do GET", async () => {
  const receivable: FakeRow = receivableFixture({
    gateway_status: "CREATING",
    gateway_creation_token: "attempt-invalid-intent",
    gateway_submission_channel: "API",
    gateway_submission_status: "API_AMBIGUOUS",
    gateway_financial_terms: {
      ...BANESE_DOCUMENT_FIXTURE.financialTerms,
      nominalAmount: 19_999.99,
    },
    gateway_financial_terms_confirmed_at: null,
  });
  const admin = fakeAdmin(receivable);
  let queried = false;

  await assert.rejects(
    () =>
      reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
        queryBoleto: () => {
          queried = true;
          return Promise.resolve(boletoSnapshot() as any);
        },
      }),
    /pedido financeiro canonico.*valor ou vencimento/i,
  );
  assert.equal(queried, false);
  assert.equal(receivable.gateway_submission_status, "API_AMBIGUOUS");
});

Deno.test("conciliacao Banese nao infere sandbox sem ambiente", async () => {
  const admin = fakeAdmin(receivableFixture({ gateway_environment: null }));
  await assert.rejects(
    () => reconcileBaneseReceivable(admin, RECEIVABLE_ID),
    /ambiente ausente ou invalido/i,
  );
  assert.equal(admin.updateAttempts.length, 0);
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

Deno.test("classifica BolePix somente com prova canonica em todos os pagamentos", () => {
  assert.equal(
    classifyBaneseSettlementMethod([{ CodigoMotivoLiquidacao: "61" }]),
    "PIX",
  );
  assert.equal(
    classifyBaneseSettlementMethod([{ FormaLiquidacao: " BolePix " }]),
    "PIX",
  );
  assert.equal(
    classifyBaneseSettlementMethod([{
      CodigoMotivoLiquidacao: "61",
      FormaLiquidacao: "BOLETO",
    }]),
    "NAO_IDENTIFICADO",
  );
  assert.equal(
    classifyBaneseSettlementMethod([
      { CodigoMotivoLiquidacao: "61" },
      { FormaLiquidacao: "BOLETO" },
    ]),
    "MISTO",
  );
});

Deno.test("formato atualmente documentado pela API nao inventa o canal", () => {
  assert.equal(
    classifyBaneseSettlementMethod([{
      BancoRecebedor: "BANCO DO ESTADO DE SERGIPE",
      DataPagamento: "2026-08-15T10:00:00",
      ValorPago: 20_000,
      Descricao: "Liquidado via Pix",
      QrCode: "nao-e-prova-do-canal-usado",
    }]),
    "NAO_IDENTIFICADO",
  );
  assert.equal(
    classifyBaneseSettlementMethod([{ FormaLiquidacao: "BOLETO" }]),
    "BOLETO",
  );
  assert.equal(classifyBaneseSettlementMethod([]), "NAO_IDENTIFICADO");
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
  admin.tables.parceiros = [{ id: alunoId, nome: "Aluno Banese" }];

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
  admin.tables.parceiros = [{ id: alunoId, nome: "Aluno EAD Banese" }];

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
  admin.tables.parceiros = [{ id: alunoId, nome: "Aluno Banese" }];
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
  admin.tables.parceiros = [{ id: alunoId, nome: "Aluno Banese" }];

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
