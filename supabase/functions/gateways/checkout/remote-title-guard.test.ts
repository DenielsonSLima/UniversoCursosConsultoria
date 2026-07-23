import assert from "node:assert/strict";
import {
  applyRemoteIdentitySnapshot,
  assertAsaasReceivableCancellationAllowed,
  assertGatewayTitleCanBeReset,
  assertMercadoPagoManualSettlementAllowed,
  assertNoAmbiguousRemoteCreation,
  boletoIssuedAtAfterReset,
  hasActiveRemoteTitleReference,
  hasAmbiguousRemoteCreation,
  isRemoteTitleNonPayable,
} from "./remote-title-guard.ts";

Deno.test("bloqueia substituicao de titulo remoto ativo", () => {
  const receivable = {
    gateway_provider: "banese_card",
    gateway_payment_id: "000000015",
    gateway_status: "PENDING",
  };
  assert.equal(hasActiveRemoteTitleReference(receivable), true);
  assert.throws(
    () => assertGatewayTitleCanBeReset(receivable),
    /titulo bancario ativo/i,
  );
});

Deno.test("permite recuperacao idempotente do mesmo titulo Banese", () => {
  assert.doesNotThrow(() =>
    assertGatewayTitleCanBeReset({
      gateway_boleto_nosso_numero: "000000015",
      gateway_status: "CREATING",
    }, { allowBaneseRecovery: true })
  );
});

Deno.test("remessa CNAB ativa impede reemissao do mesmo numero pela API", () => {
  assert.throws(
    () =>
      assertGatewayTitleCanBeReset({
        gateway_provider: "banese_card",
        gateway_boleto_nosso_numero: "000000015",
        gateway_submission_channel: "CNAB",
        gateway_submission_status: "CNAB_GENERATED",
      }, { allowBaneseRecovery: true }),
    /canal CNAB.*não pode ser reenviada pela API/i,
  );
});

Deno.test("titulo rejeitado pelo CNAB continua preso ao canal de origem", () => {
  assert.throws(
    () =>
      assertGatewayTitleCanBeReset({
        gateway_provider: "banese_card",
        gateway_submission_channel: "CNAB",
        gateway_submission_status: "CNAB_REJECTED",
      }, { allowBaneseRecovery: true }),
    /pertence ao canal CNAB/i,
  );
});

Deno.test("retry sequencial nao pode resetar criacao remota ambigua", () => {
  const ambiguous = {
    status: "PENDENTE",
    gateway_provider: "asaas",
    gateway_status: "CREATING",
    gateway_payment_id: null,
    gateway_payment_link_id: null,
  };
  assert.equal(hasAmbiguousRemoteCreation(ambiguous), true);
  assert.throws(
    () => assertGatewayTitleCanBeReset(ambiguous),
    /externalReference/i,
  );
});

Deno.test("API_AMBIGUOUS e ambiguo mesmo sem status CREATING", () => {
  for (const provider of ["banese_card", "mercado_pago"]) {
    const ambiguous = {
      status: "PENDENTE",
      gateway_provider: provider,
      gateway_status: null,
      gateway_submission_channel: "API",
      gateway_submission_status: "API_AMBIGUOUS",
      gateway_payment_id: null,
      gateway_payment_link_id: null,
    };

    assert.equal(hasAmbiguousRemoteCreation(ambiguous), true);
    assert.throws(
      () => assertNoAmbiguousRemoteCreation(ambiguous),
      /nenhum novo POST.*Reconcilie manual e canonicamente/i,
    );
    assert.throws(
      () => assertGatewayTitleCanBeReset(ambiguous),
      /nenhum novo POST/i,
    );
  }
});

Deno.test("API_AMBIGUOUS Asaas continua direcionado a recuperacao canonica", () => {
  const ambiguous = {
    status: "PENDENTE",
    gateway_provider: "asaas",
    gateway_status: null,
    gateway_submission_channel: "API",
    gateway_submission_status: "API_AMBIGUOUS",
    gateway_payment_id: null,
    gateway_payment_link_id: null,
  };

  assert.equal(hasAmbiguousRemoteCreation(ambiguous), true);
  assert.throws(
    () => assertNoAmbiguousRemoteCreation(ambiguous),
    /externalReference/i,
  );
});

Deno.test("permite limpar referencia confirmada como nao pagavel", () => {
  const receivable = {
    gateway_payment_id: "000000015",
    gateway_status: "CANCELED",
  };
  assert.equal(isRemoteTitleNonPayable(receivable), true);
  assert.equal(hasActiveRemoteTitleReference(receivable), false);
  assert.doesNotThrow(() => assertGatewayTitleCanBeReset(receivable));
});

Deno.test("tentativa rejeitada nao invalida preferencia Mercado Pago", () => {
  const receivable = {
    gateway_provider: "mercado_pago",
    gateway_payment_id: "pay_rejected",
    gateway_payment_link_id: "pref_still_payable",
    gateway_status: "REJECTED",
  };

  assert.equal(isRemoteTitleNonPayable(receivable), false);
  assert.equal(hasActiveRemoteTitleReference(receivable), true);
  assert.throws(
    () => assertGatewayTitleCanBeReset(receivable),
    /titulo bancario ativo/i,
  );
});

Deno.test("status pago continua bloqueado", () => {
  assert.throws(
    () =>
      assertGatewayTitleCanBeReset({
        asaas_payment_id: "pay_123",
        asaas_status: "RECEIVED",
      }),
    /titulo bancario ativo/i,
  );
});

Deno.test("data de emissao so e preservada na recuperacao do mesmo boleto", () => {
  const receivable = { gateway_boleto_issued_at: "2026-07-16T12:00:00Z" };
  assert.equal(
    boletoIssuedAtAfterReset(receivable, true),
    "2026-07-16T12:00:00Z",
  );
  assert.equal(boletoIssuedAtAfterReset(receivable, false), null);
});

Deno.test("bloqueia baixa manual enquanto a referencia Mercado Pago estiver ativa", () => {
  assert.throws(
    () =>
      assertMercadoPagoManualSettlementAllowed({
        gateway_provider: "mercado_pago",
        gateway_payment_link_id: "pref_123",
        gateway_status: "created",
      }),
    /expire a preferencia/i,
  );

  assert.throws(
    () =>
      assertMercadoPagoManualSettlementAllowed({
        gateway_provider: "mercado_pago",
        gateway_payment_link_id: "pref_123",
        gateway_status: "rejected",
      }),
    /baixa manual permanece bloqueada/i,
  );

  assert.throws(
    () =>
      assertMercadoPagoManualSettlementAllowed({
        gateway_provider: "mercado_pago",
        gateway_payment_link_id: "pref_123",
        gateway_status: null,
        asaas_status: "DELETED",
      }),
    /baixa manual permanece bloqueada/i,
  );
});

Deno.test("status terminal do pagamento nao libera a preferencia para baixa manual", () => {
  for (
    const gateway_status of ["CANCELED", "CANCELLED", "DELETED", "EXPIRED"]
  ) {
    assert.throws(
      () =>
        assertMercadoPagoManualSettlementAllowed({
          gateway_provider: "mercado_pago",
          gateway_payment_id: "pay_123",
          gateway_payment_link_id: "pref_123",
          gateway_status,
        }),
      /baixa manual permanece bloqueada/i,
    );
  }
});

Deno.test("baixa manual permite somente identidades canonicas Asaas e Banese", () => {
  assert.doesNotThrow(() =>
    assertMercadoPagoManualSettlementAllowed({
      gateway_provider: "asaas",
      gateway_payment_id: "remote_123",
      asaas_payment_id: "remote_123",
      gateway_status: "PENDING",
    })
  );
  assert.doesNotThrow(() =>
    assertMercadoPagoManualSettlementAllowed({
      gateway_provider: "banese_card",
      gateway_payment_id: "000000015",
      gateway_status: "PENDING",
    })
  );
});

Deno.test("baixa manual falha fechada para referencia sem provedor", () => {
  assert.throws(
    () =>
      assertMercadoPagoManualSettlementAllowed({
        gateway_payment_link_id: "remote_123",
      }),
    /sem provedor identificado/i,
  );
  assert.throws(
    () =>
      assertMercadoPagoManualSettlementAllowed({
        gateway_provider: "asaas",
        gateway_payment_id: "remote_123",
      }),
    /identidade remota inconsistente/i,
  );
  assert.throws(
    () =>
      assertMercadoPagoManualSettlementAllowed({
        gateway_provider: "outro_gateway",
        gateway_payment_id: "remote_123",
      }),
    /sem fluxo canonico/i,
  );
});

Deno.test("baixa manual falha fechada para identidades Asaas divergentes", () => {
  assert.throws(
    () =>
      assertMercadoPagoManualSettlementAllowed({
        gateway_provider: "asaas",
        gateway_payment_id: "pay_gateway",
        asaas_payment_id: "pay_legacy",
      }),
    /identidade remota inconsistente/i,
  );
  assert.throws(
    () =>
      assertAsaasReceivableCancellationAllowed({
        gateway_provider: "asaas",
        gateway_payment_link_id: "link_gateway",
        asaas_payment_link_id: "link_legacy",
      }),
    /identidade remota inconsistente/i,
  );
});

Deno.test("cancelador Asaas bloqueia titulo vinculado ao Mercado Pago", () => {
  for (
    const receivable of [
      {
        gateway_provider: "mercado_pago",
        gateway_payment_link_id: "pref_123",
        gateway_status: "created",
      },
      {
        gateway_provider: "mercado_pago",
        gateway_payment_id: "pay_123",
        gateway_status: "rejected",
      },
      {
        gateway_provider: "mercado_pago",
        gateway_payment_link_id: "pref_123",
        gateway_status: "expired",
      },
      {
        gateway_provider: "mercado_pago",
        gateway_status: "creating",
      },
    ]
  ) {
    assert.throws(
      () => assertAsaasReceivableCancellationAllowed(receivable),
      /referencia Mercado Pago.*nao pode ser cancelada localmente/i,
    );
  }
});

Deno.test("cancelador Asaas direciona titulo Banese ao fluxo especifico", () => {
  assert.throws(
    () =>
      assertAsaasReceivableCancellationAllowed({
        gateway_provider: "banese_card",
        gateway_payment_id: "000000015",
      }),
    /cancelador.*Banese/i,
  );
});

Deno.test("cancelador Asaas aceita titulo Asaas e recebivel puramente local", () => {
  assert.doesNotThrow(() =>
    assertAsaasReceivableCancellationAllowed({
      gateway_provider: "asaas",
      gateway_payment_id: "pay_123",
      asaas_payment_id: "pay_123",
    })
  );
  assert.doesNotThrow(() =>
    assertAsaasReceivableCancellationAllowed({ status: "PENDENTE" })
  );
});

Deno.test("cancelador Asaas falha fechado para referencia de provedor ambiguo", () => {
  assert.throws(
    () =>
      assertAsaasReceivableCancellationAllowed({
        gateway_payment_link_id: "remote_123",
      }),
    /sem provedor identificado/i,
  );
});

Deno.test("cancelador Asaas exige identidade legada coerente", () => {
  assert.throws(
    () =>
      assertAsaasReceivableCancellationAllowed({
        gateway_provider: "asaas",
        gateway_payment_id: "pay_123",
      }),
    /identidade remota inconsistente/i,
  );
});

Deno.test("cancelamento local preserva snapshot da identidade remota", () => {
  const filters: Array<["eq" | "is", string, unknown]> = [];
  const query = {
    eq(field: string, value: unknown) {
      filters.push(["eq", field, value]);
      return query;
    },
    is(field: string, value: unknown) {
      filters.push(["is", field, value]);
      return query;
    },
  };

  assert.equal(
    applyRemoteIdentitySnapshot(query, {
      gateway_provider: "asaas",
      gateway_payment_id: "pay_123",
      gateway_payment_link_id: null,
      asaas_payment_id: "pay_123",
    }),
    query,
  );
  assert.deepEqual(filters, [
    ["eq", "gateway_provider", "asaas"],
    ["is", "gateway_environment", null],
    ["is", "gateway_payment_method", null],
    ["eq", "gateway_payment_id", "pay_123"],
    ["is", "gateway_payment_link_id", null],
    ["is", "gateway_boleto_nosso_numero", null],
    ["eq", "asaas_payment_id", "pay_123"],
    ["is", "asaas_payment_link_id", null],
  ]);
});

Deno.test("bloqueia baixa e cancelamento durante criacao remota ambigua", () => {
  const ambiguous = {
    status: "PENDENTE",
    gateway_provider: "asaas",
    asaas_status: "CREATING",
    asaas_payment_id: null,
    gateway_payment_id: null,
  };

  assert.throws(
    () => assertMercadoPagoManualSettlementAllowed(ambiguous),
    /externalReference/i,
  );
  assert.throws(
    () => assertAsaasReceivableCancellationAllowed(ambiguous),
    /externalReference/i,
  );
});
