import assert from "node:assert/strict";
import {
  BANESE_DOCUMENT_FIXTURE,
  baneseDocumentFixtureAt,
} from "../../banese/internal/testing/document-fixture.ts";
import { reconcileBaneseReceivable } from "./banese.ts";

type Row = Record<string, any>;

class PixReconciliationAdmin {
  mutations: Array<{ table: string; action: string }> = [];
  rpcCalls: Row[] = [];

  constructor(public tables: Record<string, Row[]>) {}

  from(table: string) {
    return new PixReconciliationQuery(this, table);
  }

  async rpc(name: string, args: Row) {
    if (name !== "persist_banese_recovered_pix") {
      return { data: null, error: new Error(`RPC inesperado: ${name}`) };
    }
    this.rpcCalls.push({ ...args });
    const transactions = this.tables.payment_gateway_transactions;
    const compatible = transactions.filter((row) =>
      row.receivable_id === args.p_receivable_id &&
      row.provider_code === "banese_card" &&
      row.environment === args.p_environment &&
      row.payment_method === "BOLETO"
    );
    const digits = (value: unknown) => String(value || "").replace(/\D/g, "");
    if (
      compatible.some((row) =>
        (digits(row.bank_slip_our_number) &&
          digits(row.bank_slip_our_number) !== args.p_nosso_numero) ||
        (digits(row.remote_payment_id) &&
          digits(row.remote_payment_id) !== args.p_nosso_numero)
      )
    ) {
      return {
        data: null,
        error: new Error("Transacao Banese possui identificador divergente."),
      };
    }
    if (
      compatible.some((row) => {
        const line = digits(row.bank_slip_digitable_line);
        const barcode = digits(row.bank_slip_barcode);
        if (barcode && barcode !== args.p_remote_barcode) return true;
        if (!line || line === args.p_remote_digitable_line) return false;
        return !(
          args.p_replace_invalid_digitable_line === true &&
          barcode === args.p_remote_barcode
        );
      })
    ) {
      return {
        data: null,
        error: new Error(
          "Transacao Banese possui numeros bancarios divergentes.",
        ),
      };
    }
    if (
      compatible.some((row) =>
        (row.pix_payload && row.pix_payload !== args.p_pix_payload) ||
        (row.pix_encoded_image &&
          row.pix_encoded_image !== args.p_pix_encoded_image)
      )
    ) {
      return {
        data: null,
        error: new Error(
          "Transacao Banese possui payload Pix divergente do retorno oficial.",
        ),
      };
    }
    const title = this.tables.contas_receber.find((row) =>
      row.id === args.p_receivable_id
    );
    if (!title) return { data: null, error: new Error("Titulo ausente.") };
    if (
      Number(title.valor) !== Number(args.p_expected_amount) ||
      title.data_vencimento !== args.p_expected_due_date ||
      title.gateway_boleto_convenio !== args.p_expected_convenio
    ) {
      return {
        data: null,
        error: new Error(
          "Titulo Banese mudou durante a consulta; o Pix nao foi persistido.",
        ),
      };
    }
    const values = {
      pix_payload: args.p_pix_payload,
      pix_encoded_image: args.p_pix_encoded_image,
      bank_slip_digitable_line: args.p_remote_digitable_line,
      bank_slip_barcode: args.p_remote_barcode,
      bank_slip_our_number: args.p_nosso_numero,
      remote_payment_id: args.p_nosso_numero,
    };
    if (compatible.length) {
      compatible.forEach((row) => Object.assign(row, values));
    } else {
      transactions.push({
        id: `transaction-${transactions.length + 1}`,
        receivable_id: args.p_receivable_id,
        provider_code: "banese_card",
        environment: args.p_environment,
        payment_method: "BOLETO",
        ...values,
      });
    }
    const persistedAt = new Date().toISOString();
    Object.assign(title, {
      gateway_pix_payload: args.p_pix_payload,
      gateway_pix_encoded_image: args.p_pix_encoded_image,
      gateway_boleto_linha_digitavel: args.p_remote_digitable_line,
      gateway_boleto_codigo_barras: args.p_remote_barcode,
      gateway_synced_at: persistedAt,
      updated_at: persistedAt,
    });
    this.mutations.push({ table: "pix_snapshot", action: "rpc" });
    return { data: { persisted: true, persistedAt }, error: null };
  }
}

class PixReconciliationQuery {
  private action: "select" | "update" | "insert" = "select";
  private values: Row = {};
  private filters: Array<(row: Row) => boolean> = [];
  private returnsRows = false;

  constructor(
    private admin: PixReconciliationAdmin,
    private table: string,
  ) {}

  select(_columns = "*") {
    this.returnsRows = true;
    return this;
  }

  update(values: Row) {
    this.action = "update";
    this.values = values;
    this.admin.mutations.push({ table: this.table, action: "update" });
    return this;
  }

  insert(values: Row) {
    this.action = "insert";
    this.values = values;
    this.admin.mutations.push({ table: this.table, action: "insert" });
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push((row) =>
      value === null && (row[column] === null || row[column] === undefined)
    );
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  filter(_column: string, _operator: string, _value: unknown) {
    return this;
  }

  or(_expression: string) {
    return this;
  }

  async maybeSingle() {
    const result = await this.execute();
    if (result.error) return result;
    const rows = Array.isArray(result.data) ? result.data : [];
    return { data: rows[0] ?? null, error: null };
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
    const matched = rows.filter((row) =>
      this.filters.every((filter) => filter(row))
    );
    if (this.action === "select") {
      return { data: matched.map((row) => ({ ...row })), error: null };
    }
    if (this.action === "update") {
      for (const row of matched) Object.assign(row, this.values);
      return {
        data: this.returnsRows ? matched.map((row) => ({ ...row })) : null,
        error: null,
      };
    }
    const inserted = {
      id: `transaction-${rows.length + 1}`,
      ...this.values,
    };
    rows.push(inserted);
    return {
      data: this.returnsRows ? [{ ...inserted }] : null,
      error: null,
    };
  }
}

const RECEIVABLE_ID = BANESE_DOCUMENT_FIXTURE.receivableId;
const PIX_PAYLOAD = "pix-oficial-validado-pelo-adapter";
const PIX_IMAGE = "data:image/png;base64,aW1hZ2VtLW9maWNpYWw=";

const receivable = () => ({
  id: RECEIVABLE_ID,
  cliente_id: "44444444-4444-4444-8444-444444444444",
  gateway_provider: "banese_card",
  gateway_environment: "production",
  gateway_payment_method: "BOLETO",
  gateway_payment_id: BANESE_DOCUMENT_FIXTURE.ourNumber,
  gateway_boleto_nosso_numero: BANESE_DOCUMENT_FIXTURE.ourNumber,
  gateway_boleto_convenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
  gateway_boleto_linha_digitavel: BANESE_DOCUMENT_FIXTURE.digitableLine,
  gateway_boleto_codigo_barras: BANESE_DOCUMENT_FIXTURE.barcode,
  gateway_financial_terms: BANESE_DOCUMENT_FIXTURE.financialTerms,
  gateway_financial_terms_confirmed_at: "2026-08-27T12:00:00.000Z",
  gateway_submission_channel: "API",
  gateway_submission_status: "API_REGISTERED",
  gateway_status: "OPEN",
  gateway_pix_payload: null,
  gateway_pix_encoded_image: null,
  status: "PENDENTE",
  origem_pagamento: "GATEWAY_ONLINE",
  forma_pagamento: "BOLETO",
  valor: BANESE_DOCUMENT_FIXTURE.amount,
  data_vencimento: BANESE_DOCUMENT_FIXTURE.dueDate,
  updated_at: "2026-08-27T12:00:00.000Z",
});

const adminFor = (transactionRows?: Row[]) => {
  const title = receivable();
  const rows = (transactionRows ?? [{}]).map((row, index) => ({
    id: `transaction-canonical-${index + 1}`,
    receivable_id: RECEIVABLE_ID,
    provider_code: "banese_card",
    environment: "production",
    payment_method: "BOLETO",
    amount: BANESE_DOCUMENT_FIXTURE.amount,
    remote_payment_id: BANESE_DOCUMENT_FIXTURE.ourNumber,
    bank_slip_our_number: BANESE_DOCUMENT_FIXTURE.ourNumber,
    ...row,
  }));
  return {
    title,
    admin: new PixReconciliationAdmin({
      contas_receber: [title],
      payment_gateway_credentials: [{
        provider_code: "banese_card",
        environment: "production",
        metadata: { baneseBoletoConvenio: "15528" },
      }],
      payment_gateway_transactions: rows,
      parceiros: [{
        id: title.cliente_id,
        cpf_cnpj: "78269105520",
      }],
    }),
  };
};

const officialSnapshot = () => ({
  convenio: "15528",
  nossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
  situationCode: 2,
  remoteStatus: "OPEN",
  paid: false,
  payments: [],
  financialTerms: BANESE_DOCUMENT_FIXTURE.financialTerms,
  pixPayload: PIX_PAYLOAD,
  pixEncodedImage: PIX_IMAGE,
  raw: {
    NumeroLinhaDigitavel: BANESE_DOCUMENT_FIXTURE.digitableLine,
    NumeroCodigoBarras: BANESE_DOCUMENT_FIXTURE.barcode,
  },
});

const reconcileOfficialSnapshot = (admin: PixReconciliationAdmin) =>
  reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
    queryBoleto: () => Promise.resolve(officialSnapshot() as any),
    persistReconciliation: (_admin, input) => Promise.resolve(input.receivable),
  });

Deno.test("conflito Pix da transacao bloqueia antes de alterar o recebivel", async () => {
  const { admin, title } = adminFor([{
    id: "transaction-existing",
    receivable_id: RECEIVABLE_ID,
    provider_code: "banese_card",
    environment: "production",
    payment_method: "BOLETO",
    pix_payload: "pix-de-outro-titulo",
    pix_encoded_image: "imagem-de-outro-titulo",
  }]);

  await assert.rejects(
    () =>
      reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
        queryBoleto: () => Promise.resolve(officialSnapshot() as any),
      }),
    /payload Pix divergente/i,
  );

  assert.equal(title.gateway_pix_payload, null);
  assert.equal(title.gateway_pix_encoded_image, null);
  assert.deepEqual(admin.mutations, []);
});

Deno.test("identificador divergente da transacao bloqueia persistencia Pix", async () => {
  const { admin, title } = adminFor([{
    id: "transaction-wrong-title",
    receivable_id: RECEIVABLE_ID,
    provider_code: "banese_card",
    environment: "production",
    payment_method: "BOLETO",
    bank_slip_our_number: BANESE_DOCUMENT_FIXTURE.ourNumber,
    remote_payment_id: "999999999",
    pix_payload: null,
    pix_encoded_image: null,
  }]);

  await assert.rejects(
    () =>
      reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
        queryBoleto: () => Promise.resolve(officialSnapshot() as any),
      }),
    /identificador divergente/i,
  );

  assert.equal(title.gateway_pix_payload, null);
  assert.equal(title.gateway_pix_encoded_image, null);
});

Deno.test("linha divergente sem barcode nao usa excecao da rematricula", async () => {
  const anotherTitle = baneseDocumentFixtureAt(1);
  const { admin, title } = adminFor([{
    id: "transaction-without-barcode",
    receivable_id: RECEIVABLE_ID,
    provider_code: "banese_card",
    environment: "production",
    payment_method: "BOLETO",
    bank_slip_digitable_line: anotherTitle.digitableLine,
    bank_slip_barcode: null,
    pix_payload: null,
    pix_encoded_image: null,
  }]);
  const validLine = BANESE_DOCUMENT_FIXTURE.digitableLine;
  title.gateway_boleto_linha_digitavel = `${validLine.slice(0, 9)}${
    validLine[9] === "9" ? "8" : "9"
  }${validLine.slice(10)}`;

  await assert.rejects(
    () =>
      reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
        queryBoleto: () => Promise.resolve(officialSnapshot() as any),
      }),
    /numeros bancarios divergentes/i,
  );

  assert.equal(title.gateway_pix_payload, null);
  assert.equal(title.gateway_pix_encoded_image, null);
});

Deno.test("persiste o par Pix oficial no recebivel e na transacao", async () => {
  const { admin, title } = adminFor();

  await reconcileOfficialSnapshot(admin);

  assert.equal(title.gateway_pix_payload, PIX_PAYLOAD);
  assert.equal(title.gateway_pix_encoded_image, PIX_IMAGE);
  assert.equal(
    admin.tables.payment_gateway_transactions[0].pix_payload,
    PIX_PAYLOAD,
  );
  assert.equal(
    admin.tables.payment_gateway_transactions[0].pix_encoded_image,
    PIX_IMAGE,
  );
});

Deno.test("repara DV local invalido somente apos provar o mesmo codigo de barras", async () => {
  const { admin, title } = adminFor();
  const validLine = BANESE_DOCUMENT_FIXTURE.digitableLine;
  title.gateway_boleto_linha_digitavel = `${validLine.slice(0, 9)}${
    validLine[9] === "9" ? "8" : "9"
  }${validLine.slice(10)}`;

  await reconcileOfficialSnapshot(admin);

  assert.equal(
    admin.rpcCalls[0].p_replace_invalid_digitable_line,
    true,
  );
  assert.equal(
    title.gateway_boleto_linha_digitavel,
    BANESE_DOCUMENT_FIXTURE.digitableLine,
  );
  assert.equal(
    title.gateway_boleto_codigo_barras,
    BANESE_DOCUMENT_FIXTURE.barcode,
  );
});

Deno.test("bloqueia persistencia Pix se valor mudar durante a consulta", async () => {
  const { admin, title } = adminFor();

  await assert.rejects(
    () =>
      reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
        queryBoleto: () => {
          title.valor = Number(title.valor) + 1;
          return Promise.resolve(officialSnapshot() as any);
        },
      }),
    /mudou durante a consulta/i,
  );

  assert.equal(title.gateway_pix_payload, null);
  assert.equal(title.gateway_pix_encoded_image, null);
  assert.equal(admin.tables.payment_gateway_transactions.length, 1);
});

Deno.test("persiste Pix antes de manter divergencia financeira bloqueada", async () => {
  const { admin, title } = adminFor();
  const snapshot = {
    ...officialSnapshot(),
    financialTerms: null,
    financialTermsError: new Error(
      "Tipo de juros retornado pelo Banese e invalido.",
    ),
  };

  await assert.rejects(
    () =>
      reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
        queryBoleto: () => Promise.resolve(snapshot as any),
      }),
    /Tipo de juros.*invalido/i,
  );

  assert.equal(title.gateway_pix_payload, PIX_PAYLOAD);
  assert.equal(title.gateway_pix_encoded_image, PIX_IMAGE);
  assert.equal(
    admin.tables.payment_gateway_transactions[0].pix_payload,
    PIX_PAYLOAD,
  );
});

Deno.test("persiste Pix antes de manter consulta de pagamentos bloqueada", async () => {
  const { admin, title } = adminFor();
  const snapshot = {
    ...officialSnapshot(),
    paymentsError: new Error(
      "A consulta canônica de PagamentosEfetivados do Banese falhou (503).",
    ),
  };

  await assert.rejects(
    () =>
      reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
        queryBoleto: () => Promise.resolve(snapshot as any),
      }),
    /PagamentosEfetivados.*falhou/i,
  );

  assert.equal(title.gateway_pix_payload, PIX_PAYLOAD);
  assert.equal(title.gateway_pix_encoded_image, PIX_IMAGE);
});
