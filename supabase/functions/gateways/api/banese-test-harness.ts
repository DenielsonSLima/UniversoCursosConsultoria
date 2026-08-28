import { BANESE_DOCUMENT_FIXTURE } from "../../banese/internal/testing/document-fixture.ts";
import { BANESE_POST_SETTLEMENT_PENDING_MESSAGE } from "./banese-post-settlement.ts";

export type FakeRow = Record<string, any>;

const transactionCasSnapshot = (row: FakeRow) =>
  Object.fromEntries([
    "id",
    "remote_payment_id",
    "bank_slip_our_number",
    "remote_status",
    "amount",
    "pix_payload",
    "pix_encoded_image",
    "bank_slip_digitable_line",
    "bank_slip_barcode",
    "raw_payload",
    "last_error",
    "synced_at",
    "updated_at",
  ].map((key) => [key, row[key] ?? null]));

export class FakeAdmin {
  tables: Record<string, FakeRow[]>;
  updateAttempts: Array<{ table: string; values: FakeRow }> = [];
  forceReceivableUpdateNoOp = false;
  beforeReceivableUpdate: ((row: FakeRow) => void) | null = null;
  beforeTransactionUpdate: ((row: FakeRow) => void) | null = null;

  constructor(tables: Record<string, FakeRow[]>) {
    this.tables = tables;
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }

  async rpc(name: string, args: FakeRow) {
    if (name === "persist_banese_recovered_pix") {
      const receivable = this.tables.contas_receber.find((row) =>
        row.id === args.p_receivable_id
      );
      if (!receivable) {
        return { data: null, error: new Error("Cobranca nao encontrada.") };
      }
      const persistedAt = new Date().toISOString();
      const matches = this.tables.payment_gateway_transactions.filter((row) =>
        row.receivable_id === receivable.id &&
        row.provider_code === "banese_card" &&
        row.environment === args.p_environment &&
        row.payment_method === "BOLETO"
      );
      const values = {
        remote_payment_id: args.p_nosso_numero,
        bank_slip_our_number: args.p_nosso_numero,
        bank_slip_digitable_line: args.p_remote_digitable_line,
        bank_slip_barcode: args.p_remote_barcode,
        pix_payload: args.p_pix_payload,
        pix_encoded_image: args.p_pix_encoded_image,
        synced_at: persistedAt,
        updated_at: persistedAt,
      };
      if (matches.length === 0) {
        this.tables.payment_gateway_transactions.push({
          id: "fake-payment_gateway_transactions-pix",
          receivable_id: receivable.id,
          provider_code: "banese_card",
          environment: args.p_environment,
          payment_method: "BOLETO",
          amount: args.p_expected_amount,
          remote_status: receivable.gateway_status,
          last_error: null,
          raw_payload: { pixRecovery: args.p_reconciliation },
          ...values,
        });
      } else if (matches.length === 1) {
        Object.assign(matches[0], values, {
          raw_payload: {
            ...(matches[0].raw_payload || {}),
            pixRecovery: args.p_reconciliation,
          },
        });
      } else {
        return { data: null, error: new Error("Transacao Banese ambigua.") };
      }
      Object.assign(receivable, {
        gateway_boleto_linha_digitavel: args.p_remote_digitable_line,
        gateway_boleto_codigo_barras: args.p_remote_barcode,
        gateway_pix_payload: args.p_pix_payload,
        gateway_pix_encoded_image: args.p_pix_encoded_image,
        gateway_synced_at: persistedAt,
        updated_at: persistedAt,
      });
      return {
        data: { persisted: true, persistedAt },
        error: null,
      };
    }
    if (name !== "persist_banese_reconciliation_snapshot") {
      return { data: null, error: new Error(`RPC fake inesperado: ${name}`) };
    }
    const receivable = this.tables.contas_receber.find((row) =>
      row.id === args.p_receivable_id
    );
    if (!receivable) {
      return { data: null, error: new Error("Cobranca nao encontrada.") };
    }
    if (this.beforeReceivableUpdate) {
      const mutate = this.beforeReceivableUpdate;
      this.beforeReceivableUpdate = null;
      mutate(receivable);
    }
    const transactions = this.tables.payment_gateway_transactions;
    const matches = transactions.filter((row) =>
      row.receivable_id === receivable.id &&
      row.provider_code === "banese_card" &&
      row.environment === args.p_environment &&
      row.payment_method === "BOLETO"
    );
    if (this.beforeTransactionUpdate && matches[0]) {
      const mutate = this.beforeTransactionUpdate;
      this.beforeTransactionUpdate = null;
      mutate(matches[0]);
    }
    if (
      this.forceReceivableUpdateNoOp ||
      Object.entries(args.p_expected_state || {}).some(([column, value]) =>
        JSON.stringify(receivable[column] ?? null) !== JSON.stringify(value)
      ) ||
      receivable.updated_at !== args.p_expected_updated_at ||
      receivable.status !== args.p_expected_status ||
      receivable.gateway_status !== args.p_expected_gateway_status ||
      Number(receivable.valor) !== Number(args.p_expected_amount) ||
      receivable.data_vencimento !== args.p_expected_due_date
    ) {
      return {
        data: null,
        error: new Error("Cobranca mudou durante a conciliacao Banese."),
      };
    }
    if (
      matches.length > 1 ||
      JSON.stringify(matches.map(transactionCasSnapshot)) !==
        JSON.stringify(args.p_expected_transactions || [])
    ) {
      return {
        data: null,
        error: new Error("Transacao Banese mudou durante a consulta."),
      };
    }

    const persistedAt = new Date().toISOString();
    const preserveSettlement = String(receivable.status).toUpperCase() ===
      "PAGO";
    Object.assign(receivable, {
      gateway_payment_id: args.p_nosso_numero,
      gateway_boleto_nosso_numero: receivable.gateway_boleto_nosso_numero ||
        args.p_nosso_numero,
      gateway_status: preserveSettlement && !args.p_remote_paid
        ? receivable.gateway_status
        : args.p_remote_status,
      gateway_financial_terms: args.p_financial_terms,
      gateway_financial_terms_confirmed_at:
        receivable.gateway_financial_terms_confirmed_at || persistedAt,
      gateway_synced_at: persistedAt,
      gateway_last_error: args.p_post_settlement_required
        ? BANESE_POST_SETTLEMENT_PENDING_MESSAGE
        : null,
      updated_at: persistedAt,
    });
    if (args.p_confirm_api_submission) {
      Object.assign(receivable, {
        gateway_creation_token: null,
        gateway_submission_channel: "API",
        gateway_submission_status: "API_REGISTERED",
      });
    }
    if (args.p_remote_digitable_line && args.p_remote_barcode) {
      receivable.gateway_boleto_linha_digitavel = args.p_remote_digitable_line;
      receivable.gateway_boleto_codigo_barras = args.p_remote_barcode;
    }
    if (args.p_pix_payload && args.p_pix_encoded_image) {
      receivable.gateway_pix_payload = args.p_pix_payload;
      receivable.gateway_pix_encoded_image = args.p_pix_encoded_image;
    }
    if (args.p_remote_paid) {
      Object.assign(receivable, {
        gateway_settlement_channel: args.p_settlement_method,
        gateway_settlement_source: "API",
        gateway_settlement_recorded_at: persistedAt,
      });
    }
    if (args.p_should_settle) {
      Object.assign(receivable, {
        status: "PAGO",
        valor_pago: args.p_payment_total,
        data_pagamento: args.p_payment_date,
        forma_pagamento: args.p_settlement_method === "PIX" ? "PIX" : "BOLETO",
        origem_pagamento: "BANESE",
      });
    }

    const values = {
      remote_payment_id: args.p_nosso_numero,
      bank_slip_our_number: args.p_nosso_numero,
      remote_status: preserveSettlement && !args.p_remote_paid
        ? receivable.gateway_status
        : args.p_remote_status,
      pix_payload: args.p_pix_payload,
      pix_encoded_image: args.p_pix_encoded_image,
      bank_slip_digitable_line: args.p_remote_digitable_line,
      bank_slip_barcode: args.p_remote_barcode,
      raw_payload: args.p_transaction_snapshot,
      synced_at: persistedAt,
      updated_at: persistedAt,
    };
    if (matches.length) {
      matches.forEach((row) =>
        Object.assign(row, {
          ...values,
          raw_payload: {
            ...(row.raw_payload || {}),
            ...args.p_transaction_snapshot,
          },
        })
      );
    } else {
      transactions.push({
        id: `fake-payment_gateway_transactions-${transactions.length + 1}`,
        receivable_id: receivable.id,
        provider_code: "banese_card",
        environment: args.p_environment,
        payment_method: "BOLETO",
        amount: receivable.valor,
        ...values,
      });
    }
    return {
      data: { receivable: { ...receivable }, persistedAt },
      error: null,
    };
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

export const RECEIVABLE_ID = BANESE_DOCUMENT_FIXTURE.receivableId;
export const NOSSO_NUMERO = BANESE_DOCUMENT_FIXTURE.ourNumber;
export const PAYER_ID = "44444444-4444-4444-8444-444444444444";
export const PAYER_DOCUMENT = "78269105520";

export const receivableFixture = (overrides: FakeRow = {}) => ({
  id: RECEIVABLE_ID,
  cliente_id: PAYER_ID,
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
  gateway_submission_channel: "API",
  gateway_submission_status: "API_REGISTERED",
  gateway_cnab_file_id: null,
  gateway_creation_token: null,
  gateway_status: "PENDING",
  updated_at: "2026-07-21T12:00:00.000Z",
  ...overrides,
});

export const fakeAdmin = (
  receivable: FakeRow,
  transactions?: FakeRow[],
) => {
  const canonicalTransactions = transactions ?? [{
    id: "fake-payment_gateway_transactions-canonical",
    receivable_id: receivable.id,
    provider_code: "banese_card",
    environment: receivable.gateway_environment,
    payment_method: "BOLETO",
    remote_payment_id: receivable.gateway_payment_id,
    bank_slip_our_number: receivable.gateway_boleto_nosso_numero,
  }];
  return new FakeAdmin({
    contas_receber: [receivable],
    payment_gateway_credentials: [{
      provider_code: "banese_card",
      environment: "sandbox",
      metadata: { baneseBoletoConvenio: "15528" },
    }],
    payment_gateway_transactions: canonicalTransactions.map((row) => {
      if (row.amount == null) row.amount = receivable.valor;
      return row;
    }),
    inscricoes_online: [],
    matriculas: [],
    turmas: [],
    parceiros: [{ id: PAYER_ID, cpf_cnpj: PAYER_DOCUMENT }],
  });
};

export const boletoSnapshot = (overrides: FakeRow = {}) => ({
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
