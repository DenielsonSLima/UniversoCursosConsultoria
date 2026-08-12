import assert from "node:assert/strict";
import { calculateBaneseNossoNumero } from "../banese/core/adapter/utils.ts";
import { assertNewTitleRemittanceRequest } from "./remittance-policy.ts";
import {
  isConfirmedRemittanceClaimState,
  previewRemittance,
  toBaneseCivilDate,
} from "./remittance-service.ts";

Deno.test("data de emissão usa o dia civil de Maceió", () => {
  assert.equal(toBaneseCivilDate("2026-07-22T00:30:00Z"), "2026-07-21");
  assert.equal(toBaneseCivilDate("2026-07-22T03:30:00Z"), "2026-07-22");
  assert.equal(toBaneseCivilDate("2026-07-22"), "2026-07-22");
  assert.throws(() => toBaneseCivilDate("inválida"), /data de criação/i);
});

Deno.test("remessa de baixa ou cancelamento permanece bloqueada sem homologação", () => {
  assert.doesNotThrow(() =>
    assertNewTitleRemittanceRequest({ movementCode: "01" })
  );
  assert.doesNotThrow(() =>
    assertNewTitleRemittanceRequest({ entryType: "CNAB240_NEW_TITLE" })
  );
  assert.throws(
    () => assertNewTitleRemittanceRequest({ movementCode: "02" }),
    /somente entrada de título.*baixa\/cancelamento.*bloqueado/i,
  );
  assert.throws(
    () => assertNewTitleRemittanceRequest({ operation: "WRITE_OFF" }),
    /somente entrada de título.*homologação específica/i,
  );
});

class FakeQuery implements PromiseLike<{ data: any; error: null }> {
  constructor(
    private readonly value: any,
    private readonly selectCalls?: string[],
  ) {}
  select(columns?: string) {
    if (columns) this.selectCalls?.push(columns);
    return this;
  }
  eq() {
    return this;
  }
  in() {
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  maybeSingle() {
    const data = Array.isArray(this.value) ? this.value[0] ?? null : this.value;
    return Promise.resolve({ data, error: null });
  }
  then<TResult1 = { data: any; error: null }, TResult2 = never>(
    onfulfilled?:
      | ((
        value: { data: any; error: null },
      ) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.value, error: null }).then(
      onfulfilled,
      onrejected,
    );
  }
}

const receivableId = "11111111-1111-4111-8111-111111111111";
const payerId = "22222222-2222-4222-8222-222222222222";
const ourNumber = calculateBaneseNossoNumero("033", "00000001");

const tables = (
  transactions: any[] = [],
  receivableOverrides: Record<string, unknown> = {},
) => ({
  asaas_config: { environment: "sandbox" },
  payment_gateway_credentials: {
    metadata: {
      baneseBoletoConvenio: "15528",
      baneseEdi7Code: "123456",
      baneseBeneficiarioNome: "UNIVERSO CURSOS E CONSULTORIA LTDA",
      baneseBeneficiarioInscricao: "13.278.137/0001-54",
      baneseAgencia: "033",
      baneseConta: "03/100649-0",
      baneseCodigoEspecie: "21",
      quantidadeDiasBaixaDevolucao: 30,
    },
  },
  contas_receber: [{
    id: receivableId,
    cliente_id: payerId,
    descricao: "Matrícula teste",
    valor: 250,
    data_vencimento: "2026-08-15",
    created_at: "2026-07-21T12:00:00Z",
    status: "PENDENTE",
    tipo_lancamento: "MATRICULA",
    gateway_provider: "banese_card",
    gateway_environment: "sandbox",
    gateway_payment_method: "BOLETO",
    gateway_payment_id: null,
    gateway_payment_link_id: null,
    gateway_boleto_nosso_numero: ourNumber,
    gateway_boleto_convenio: "15528",
    gateway_boleto_agencia: "033",
    gateway_boleto_linha_digitavel: null,
    gateway_boleto_codigo_barras: null,
    gateway_boleto_issued_at: null,
    gateway_status: null,
    gateway_last_error: "Falha segura anterior ao registro remoto.",
    gateway_financial_terms: {
      nominalAmount: 250,
      dueDate: "2026-08-15",
      discount: { type: "fixed", value: 10, validUntil: "2026-08-15" },
      penalty: { type: "fixed", value: 5, startsOn: "2026-08-16" },
      interest: {
        type: "monthly-percentage",
        value: 1,
        startsOn: "2026-08-16",
      },
    },
    gateway_financial_terms_confirmed_at: "2026-07-21T12:00:00Z",
    gateway_submission_channel: null,
    gateway_submission_status: null,
    gateway_cnab_file_id: null,
    ...receivableOverrides,
  }],
  payment_gateway_transactions: transactions,
  parceiros: [{
    id: payerId,
    nome: "ALUNA TESTE",
    cpf_cnpj: "12345678901",
    endereco: "RUA UM",
    numero: "10",
    complemento: "",
    cep: "49000000",
    bairro: "CENTRO",
    cidade: "ARACAJU",
    uf: "SE",
    estado: "SE",
  }],
});

const fakeAdmin = (
  values: ReturnType<typeof tables>,
  selectCalls?: string[],
) => ({
  from(table: keyof typeof values) {
    return new FakeQuery(values[table], selectCalls);
  },
});

Deno.test("prévia deriva layout e termos somente de dados canônicos do servidor", async () => {
  const preview = await previewRemittance(fakeAdmin(tables()), {
    environment: "sandbox",
    receivableIds: [receivableId],
  });

  assert.equal(preview.environment, "sandbox");
  assert.equal(preview.convenio, "15528");
  assert.equal(preview.titleCount, 1);
  assert.equal(preview.totalAmount, 250);
  assert.match(preview.previewFingerprint, /^[0-9a-f]{64}$/);
  assert.deepEqual(preview.items[0], {
    receivableId,
    description: "Matrícula teste",
    dueDate: "2026-08-15",
    nominalAmount: 250,
    nossoNumero: ourNumber,
    installmentNumber: null,
    installmentCount: null,
    financialTerms: {
      nominalAmount: 250,
      dueDate: "2026-08-15",
      discount: { type: "fixed", value: 10, validUntil: "2026-08-15" },
      penalty: { type: "fixed", value: 5, startsOn: "2026-08-16" },
      interest: {
        type: "monthly-percentage",
        value: 1,
        startsOn: "2026-08-16",
      },
    },
    hasDiscount: true,
    hasPenalty: true,
    hasInterest: true,
  });
});

Deno.test("prévia bloqueia cobrança que já possui transação bancária", async () => {
  await assert.rejects(
    () =>
      previewRemittance(
        fakeAdmin(tables([{ id: "tx", receivable_id: receivableId }])),
        { environment: "sandbox", receivableIds: [receivableId] },
      ),
    /transação bancária.*duplicidade/i,
  );
});

Deno.test("contingência CNAB mantém os termos congelados do plano único", async () => {
  const selectCalls: string[] = [];
  const preview = await previewRemittance(
    fakeAdmin(
      tables([], {
        descricao: "Parcela 1/3 - Curso Livre",
        valor: 250,
        tipo_lancamento: "PARCELA",
        parcela_numero: 1,
        gateway_financial_terms: null,
        gateway_financial_terms_confirmed_at: null,
        regra_financeira_plano_unico_snapshot: {
          origem: "PLANO_UNICO",
          descontoPontualidade: 12.5,
          jurosAtrasoPercentual: 2.25,
          multaAtraso: 7.4,
        },
      }),
      selectCalls,
    ),
    { environment: "sandbox", receivableIds: [receivableId] },
  );

  assert.equal(
    selectCalls.some((columns) =>
      columns.includes("regra_financeira_plano_unico_snapshot")
    ),
    true,
  );
  assert.deepEqual(preview.items[0].financialTerms, {
    nominalAmount: 250,
    dueDate: "2026-08-15",
    discount: { type: "fixed", value: 12.5, validUntil: "2026-08-15" },
    penalty: { type: "fixed", value: 7.4, startsOn: "2026-08-16" },
    interest: {
      type: "monthly-percentage",
      value: 2.25,
      startsOn: "2026-08-16",
    },
  });
});

Deno.test("resposta perdida do RPC preserva claim já confirmado no banco", () => {
  const file = {
    id: "33333333-3333-4333-8333-333333333333",
    status: "GENERATED",
    title_count: 1,
    processing_summary: { claimedReceivables: 1 },
  };
  const claimed = [{
    id: receivableId,
    gateway_submission_channel: "CNAB",
    gateway_submission_status: "CNAB_GENERATED",
    gateway_cnab_file_id: file.id,
  }];
  assert.equal(
    isConfirmedRemittanceClaimState(file, claimed, [receivableId]),
    true,
  );
  assert.equal(
    isConfirmedRemittanceClaimState(
      file,
      [{ ...claimed[0], gateway_cnab_file_id: null }],
      [receivableId],
    ),
    false,
  );
});
