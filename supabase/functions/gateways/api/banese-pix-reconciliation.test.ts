import assert from "node:assert/strict";
import { BANESE_DOCUMENT_FIXTURE } from "../../banese/internal/testing/document-fixture.ts";
import { reconcileBaneseReceivable } from "./banese.ts";

type Row = Record<string, any>;

class PixReconciliationAdmin {
  mutations: Array<{ table: string; action: string }> = [];

  constructor(public tables: Record<string, Row[]>) {}

  from(table: string) {
    return new PixReconciliationQuery(this, table);
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
  gateway_provider: "banese_card",
  gateway_environment: "production",
  gateway_payment_method: "BOLETO",
  gateway_payment_id: BANESE_DOCUMENT_FIXTURE.ourNumber,
  gateway_boleto_nosso_numero: BANESE_DOCUMENT_FIXTURE.ourNumber,
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

const adminFor = (transactionRows: Row[] = []) => {
  const title = receivable();
  return {
    title,
    admin: new PixReconciliationAdmin({
      contas_receber: [title],
      payment_gateway_credentials: [{
        provider_code: "banese_card",
        environment: "production",
        metadata: { baneseBoletoConvenio: "15528" },
      }],
      payment_gateway_transactions: transactionRows,
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

Deno.test("persiste o par Pix oficial no recebivel e na transacao", async () => {
  const { admin, title } = adminFor();

  await reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
    queryBoleto: () => Promise.resolve(officialSnapshot() as any),
  });

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

Deno.test("preenche transacao legada com os dois campos Pix vazios", async () => {
  const { admin } = adminFor([{
    id: "transaction-empty-pix",
    receivable_id: RECEIVABLE_ID,
    provider_code: "banese_card",
    environment: "production",
    payment_method: "BOLETO",
    pix_payload: null,
    pix_encoded_image: null,
  }]);

  await reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
    queryBoleto: () => Promise.resolve(officialSnapshot() as any),
  });

  assert.equal(admin.tables.payment_gateway_transactions.length, 1);
  assert.equal(
    admin.tables.payment_gateway_transactions[0].pix_payload,
    PIX_PAYLOAD,
  );
  assert.equal(
    admin.tables.payment_gateway_transactions[0].pix_encoded_image,
    PIX_IMAGE,
  );
});
