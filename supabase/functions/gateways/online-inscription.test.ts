import assert from "node:assert/strict";
import {
  hasRepairableOnlineInscriptionIdentity,
  normalizeGatewayPaymentIdentity,
  repairOnlineInscription,
} from "./online-inscription.ts";

const createAdmin = (
  initialRows: Array<Record<string, any>> = [],
) => {
  const rows = new Map<string, Record<string, any>>(
    initialRows.map((row) => [String(row.matricula_id), { ...row }]),
  );
  const upserts: Array<Record<string, any>> = [];
  const transactionLinks: Array<Record<string, any>> = [];

  const admin = {
    from(table: string) {
      if (table === "inscricoes_online") {
        return {
          select() {
            return {
              eq(column: string, value: unknown) {
                assert.equal(column, "matricula_id");
                return {
                  maybeSingle: async () => ({
                    data: rows.get(String(value)) || null,
                    error: null,
                  }),
                };
              },
            };
          },
          upsert(payload: Record<string, any>, options: Record<string, any>) {
            assert.equal(options.onConflict, "matricula_id");
            upserts.push(payload);
            const key = String(payload.matricula_id);
            const current = rows.get(key);
            if (
              current?.receivable_id &&
              current.receivable_id !== payload.receivable_id
            ) {
              return {
                select: () => ({
                  single: async () => ({
                    data: null,
                    error: new Error("recebivel canonico divergente"),
                  }),
                }),
              };
            }
            if (
              current?.gateway_payment_link_id &&
              current.gateway_payment_link_id !==
                payload.gateway_payment_link_id
            ) {
              return {
                select: () => ({
                  single: async () => ({
                    data: null,
                    error: new Error("link canonico divergente"),
                  }),
                }),
              };
            }
            const next: Record<string, any> = {
              id: current?.id || `inscription-${rows.size + 1}`,
              ...(current || {}),
              ...payload,
            };
            // Espelha a protecao monotona criada pela migration.
            if (current?.status === "PAGO" && payload.status !== "PAGO") {
              next.status = "PAGO";
            } else if (
              current?.status === "CANCELADO" &&
              !["PAGO", "CANCELADO"].includes(payload.status)
            ) {
              next.status = "CANCELADO";
            }
            if (next.status === "PAGO") {
              next.pago_em = current?.pago_em || payload.pago_em;
              next.confirmado_em = current?.confirmado_em ||
                payload.confirmado_em;
              next.erro = null;
            }
            rows.set(key, next);
            return {
              select() {
                return {
                  single: async () => ({
                    data: { id: next.id, status: next.status },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }

      if (table === "payment_gateway_transactions") {
        return {
          update(payload: Record<string, any>) {
            const filters: Record<string, any> = {};
            const query = {
              eq(column: string, value: unknown) {
                filters[column] = value;
                return query;
              },
              select() {
                return query;
              },
              async maybeSingle() {
                transactionLinks.push({ payload, filters });
                return { data: null, error: null };
              },
              then(resolve: (value: unknown) => unknown) {
                transactionLinks.push({ payload, filters });
                return Promise.resolve({ error: null }).then(resolve);
              },
            };
            return query;
          },
        };
      }

      throw new Error(`Tabela inesperada no teste: ${table}`);
    },
  };

  return { admin, rows, upserts, transactionLinks };
};

const academic = {
  course: { id: "course-1", nome: "Curso" },
  turma: { id: "class-1", curso_id: "course-1" },
  aluno: {
    id: "student-1",
    nome: "Aluno",
    cpf_cnpj: "123.456.789-00",
    email: "aluno@example.com",
    telefone: "79999999999",
  },
  matricula: {
    id: "enrollment-1",
    turma_id: "class-1",
    aluno_id: "student-1",
  },
};

const receivable = {
  id: "receivable-1",
  matricula_id: "enrollment-1",
  turma_id: "class-1",
  cliente_id: "student-1",
  valor: 100,
  status: "PENDENTE",
  forma_pagamento: "CARTAO",
  gateway_provider: "mercado_pago",
  gateway_environment: "sandbox",
  gateway_payment_method: "CREDIT_CARD",
  gateway_payment_id: "payment-1",
  gateway_payment_link_id: "preference-1",
};

Deno.test("retry apos cobranca remota repara inscricao sem emitir outra cobranca", async () => {
  const runtime = createAdmin();

  const repaired = await repairOnlineInscription({
    admin: runtime.admin,
    receivable,
    academic,
  });

  assert.equal(repaired.id, "inscription-1");
  assert.equal(runtime.rows.size, 1);
  assert.equal(runtime.upserts.length, 1);
  assert.equal(runtime.upserts[0].receivable_id, "receivable-1");
  assert.equal(runtime.upserts[0].gateway_payment_id, "payment-1");
  assert.equal(runtime.transactionLinks.length, 1);
});

Deno.test("link existente sem inscricao cria somente a projecao local", async () => {
  const runtime = createAdmin();
  const linkedReceivable = {
    ...receivable,
    gateway_payment_id: null,
    gateway_payment_link_id: "preference-only",
  };

  await repairOnlineInscription({
    admin: runtime.admin,
    receivable: linkedReceivable,
    academic,
  });

  assert.equal(runtime.rows.size, 1);
  assert.equal(
    runtime.rows.get("enrollment-1")?.gateway_payment_id,
    "preference-only",
  );
  assert.equal(
    hasRepairableOnlineInscriptionIdentity(linkedReceivable),
    true,
  );
});

Deno.test("upserts concorrentes convergem para uma inscricao por matricula", async () => {
  const runtime = createAdmin();

  const results = await Promise.all([
    repairOnlineInscription({
      admin: runtime.admin,
      receivable,
      academic,
    }),
    repairOnlineInscription({
      admin: runtime.admin,
      receivable,
      academic,
    }),
  ]);

  assert.equal(runtime.rows.size, 1);
  assert.equal(results[0].id, results[1].id);
  assert.equal(runtime.upserts.length, 2);
});

Deno.test("retry pendente nao regride inscricao terminal paga", async () => {
  const paidAt = "2026-07-22T10:00:00.000Z";
  const runtime = createAdmin([{
    id: "inscription-paid",
    matricula_id: "enrollment-1",
    status: "PAGO",
    pago_em: paidAt,
    confirmado_em: paidAt,
  }]);

  const repaired = await repairOnlineInscription({
    admin: runtime.admin,
    receivable,
    academic,
    localStatus: "AGUARDANDO_PAGAMENTO",
  });

  assert.equal(repaired.status, "PAGO");
  assert.equal(runtime.rows.get("enrollment-1")?.status, "PAGO");
  assert.equal(runtime.rows.get("enrollment-1")?.pago_em, paidAt);
});

Deno.test("reparo falha fechado quando recebivel diverge do provedor", async () => {
  const runtime = createAdmin();

  await assert.rejects(
    () =>
      repairOnlineInscription({
        admin: runtime.admin,
        receivable,
        gatewayProvider: "asaas",
        academic,
      }),
    /diverge do provedor/,
  );
  assert.equal(runtime.rows.size, 0);
});

Deno.test("recusa segunda cobranca ligada a outro recebivel", async () => {
  const runtime = createAdmin([{
    id: "inscription-existing",
    matricula_id: "enrollment-1",
    receivable_id: "receivable-original",
    gateway_provider: "mercado_pago",
    gateway_environment: "sandbox",
    gateway_payment_id: "preference-original",
    gateway_payment_link_id: "preference-original",
    status: "AGUARDANDO_PAGAMENTO",
  }]);

  await assert.rejects(
    () =>
      repairOnlineInscription({
        admin: runtime.admin,
        receivable,
        academic,
      }),
    /recebivel canonico diferente/,
  );
  assert.equal(
    runtime.rows.get("enrollment-1")?.receivable_id,
    "receivable-original",
  );
});

Deno.test("recusa troca do link remoto na mesma matricula", async () => {
  const runtime = createAdmin([{
    id: "inscription-existing",
    matricula_id: "enrollment-1",
    receivable_id: "receivable-1",
    gateway_provider: "mercado_pago",
    gateway_environment: "sandbox",
    gateway_payment_id: "preference-original",
    gateway_payment_link_id: "preference-original",
    status: "AGUARDANDO_PAGAMENTO",
  }]);

  await assert.rejects(
    () =>
      repairOnlineInscription({
        admin: runtime.admin,
        receivable,
        academic,
      }),
    /link de pagamento canonico diferente/,
  );
  assert.equal(
    runtime.rows.get("enrollment-1")?.gateway_payment_link_id,
    "preference-original",
  );
});

Deno.test("promove id provisório do link para pagamento real sem trocar o link", async () => {
  const runtime = createAdmin([{
    id: "inscription-existing",
    matricula_id: "enrollment-1",
    receivable_id: "receivable-1",
    gateway_provider: "mercado_pago",
    gateway_environment: "sandbox",
    gateway_payment_id: "preference-1",
    gateway_payment_link_id: "preference-1",
    status: "AGUARDANDO_PAGAMENTO",
  }]);

  await repairOnlineInscription({
    admin: runtime.admin,
    receivable: { ...receivable, gateway_payment_id: "payment-real" },
    academic,
  });

  assert.equal(
    runtime.rows.get("enrollment-1")?.gateway_payment_id,
    "payment-real",
  );
  assert.equal(
    runtime.rows.get("enrollment-1")?.gateway_payment_link_id,
    "preference-1",
  );
});

Deno.test("normaliza zeros à esquerda do Nosso Número Banese sem aceitar outra cobrança", async () => {
  const canonicalOurNumber = "000000074";
  const runtime = createAdmin([{
    id: "inscription-existing",
    matricula_id: "enrollment-1",
    receivable_id: "receivable-1",
    gateway_provider: "banese_card",
    gateway_environment: "production",
    gateway_payment_id: "74",
    gateway_payment_link_id: null,
    status: "AGUARDANDO_PAGAMENTO",
  }]);
  const baneseReceivable = {
    ...receivable,
    forma_pagamento: "BOLETO",
    gateway_provider: "banese_card",
    gateway_environment: "production",
    gateway_payment_method: "BOLETO",
    gateway_payment_id: "74",
    gateway_boleto_nosso_numero: canonicalOurNumber,
    gateway_payment_link_id: null,
  };

  await repairOnlineInscription({
    admin: runtime.admin,
    receivable: baneseReceivable,
    paymentId: canonicalOurNumber,
    academic,
  });

  assert.equal(
    runtime.rows.get("enrollment-1")?.gateway_payment_id,
    canonicalOurNumber,
  );
  assert.equal(
    normalizeGatewayPaymentIdentity("banese_card", "74"),
    canonicalOurNumber,
  );
  assert.equal(
    normalizeGatewayPaymentIdentity("mercado_pago", "74"),
    "74",
  );
});

Deno.test("mantém identidade remota estrita fora do Banese", async () => {
  const runtime = createAdmin([{
    id: "inscription-existing",
    matricula_id: "enrollment-1",
    receivable_id: "receivable-1",
    gateway_provider: "mercado_pago",
    gateway_environment: "sandbox",
    gateway_payment_id: "74",
    gateway_payment_link_id: null,
    status: "AGUARDANDO_PAGAMENTO",
  }]);

  await assert.rejects(
    () =>
      repairOnlineInscription({
        admin: runtime.admin,
        receivable: {
          ...receivable,
          gateway_payment_id: "000000074",
          gateway_payment_link_id: null,
        },
        academic,
      }),
    /pagamento remoto canonico diferente/,
  );
});

Deno.test("corrida de duas cobrancas divergentes aceita somente uma identidade", async () => {
  const runtime = createAdmin();
  const first = {
    ...receivable,
    id: "receivable-a",
    gateway_payment_id: "payment-a",
  };
  const second = {
    ...receivable,
    id: "receivable-b",
    gateway_payment_id: "payment-b",
    gateway_payment_link_id: "preference-b",
  };

  const results = await Promise.allSettled([
    repairOnlineInscription({
      admin: runtime.admin,
      receivable: first,
      academic,
    }),
    repairOnlineInscription({
      admin: runtime.admin,
      receivable: second,
      academic,
    }),
  ]);

  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    results.filter((result) => result.status === "rejected").length,
    1,
  );
  assert.equal(runtime.rows.size, 1);
});

Deno.test("webhook falha se a transacao canonica obrigatoria nao existir", async () => {
  const runtime = createAdmin();

  await assert.rejects(
    () =>
      repairOnlineInscription({
        admin: runtime.admin,
        receivable,
        academic,
        requireGatewayTransaction: true,
      }),
    /transacao canonica do gateway nao foi encontrada/,
  );
  assert.equal(runtime.rows.size, 1);
});
