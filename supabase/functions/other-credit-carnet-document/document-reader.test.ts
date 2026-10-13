import assert from "node:assert/strict";
import {
  OTHER_CREDIT_CARNET_SELECT,
  readOtherCreditCarnetDocument,
} from "./document-reader.ts";
import { OtherCreditDocumentError } from "./document-policy.ts";
import {
  OTHER_CREDIT_DOCUMENT_ISSUER,
  OTHER_CREDIT_DOCUMENT_METADATA,
  OTHER_CREDIT_DOCUMENT_PAYER,
  otherCreditDocumentRowAt,
  PLAN_ID,
  planForOtherCreditRows,
  POLO_ID,
} from "./document-fixture.ts";

const request = (token = "session") =>
  new Request("https://example.test/document", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
const mockAdmin = (
  options: { otherPolo?: boolean; noTab?: boolean; badAuth?: boolean } = {},
) => {
  const rows = [otherCreditDocumentRowAt(0), otherCreditDocumentRowAt(1)];
  const reads: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
  const user = {
    id: "33333333-3333-4333-8333-333333333333",
    email: "financeiro@example.test",
    perfil: "financeiro",
    status: "ATIVO",
    context: POLO_ID,
    polo_ids: [POLO_ID],
    permissoes: {
      modules: ["financeiro"],
      tabs: { financeiro: options.noTab ? ["receber"] : ["outros-creditos"] },
    },
  };
  const admin = {
    auth: {
      getUser: () =>
        Promise.resolve({
          data: {
            user: options.badAuth ? null : { id: user.id, email: user.email },
          },
          error: null,
        }),
    },
    rpc: (name: string) => {
      assert.equal(name, "portal_identidade_institucional_acesso_liberado");
      return Promise.resolve({ data: true, error: null });
    },
    from: (table: string) => {
      const read = { table, filters: [] as Array<[string, unknown]> };
      reads.push(read);
      const plan = planForOtherCreditRows(rows);
      const response = () => ({
        data: table === "usuarios_sistema"
          ? user
          : table === "outros_creditos_planos"
          ? {
            ...plan,
            polo_id: options.otherPolo
              ? "66666666-6666-4666-8666-666666666666"
              : POLO_ID,
          }
          : table === "contas_receber"
          ? rows
          : table === "parceiros"
          ? OTHER_CREDIT_DOCUMENT_PAYER
          : table === "polos"
          ? OTHER_CREDIT_DOCUMENT_ISSUER
          : table === "payment_gateway_credentials"
          ? { metadata: OTHER_CREDIT_DOCUMENT_METADATA }
          : null,
        error: null,
      });
      const builder = {
        select: (columns: string) => {
          if (table === "contas_receber") {
            assert.equal(columns, OTHER_CREDIT_CARNET_SELECT);
          }
          return builder;
        },
        eq: (column: string, value: unknown) => {
          read.filters.push([column, value]);
          return builder;
        },
        ilike: () => builder,
        order: () => builder,
        limit: (value: number) => {
          assert.ok(value === 1 || value === 63);
          return builder;
        },
        maybeSingle: () => Promise.resolve(response()),
        then: (resolve: (value: ReturnType<typeof response>) => unknown) =>
          Promise.resolve(response()).then(resolve),
      };
      return builder;
    },
  };
  return { admin, reads };
};
const rejectsStatus = (operation: Promise<unknown>, status: number) =>
  assert.rejects(
    operation,
    (error: unknown) =>
      error instanceof OtherCreditDocumentError && error.status === status,
  );

Deno.test("documento privado autoriza aba e polo antes de ler parcelas ou pagador", async () => {
  const unauthorized = mockAdmin({ noTab: true });
  await rejectsStatus(
    readOtherCreditCarnetDocument(request(), unauthorized.admin, PLAN_ID),
    403,
  );
  assert.deepEqual(unauthorized.reads.map((read) => read.table), [
    "usuarios_sistema",
  ]);
  const wrongPolo = mockAdmin({ otherPolo: true });
  await rejectsStatus(
    readOtherCreditCarnetDocument(request(), wrongPolo.admin, PLAN_ID),
    403,
  );
  assert.ok(
    wrongPolo.reads.every((read) =>
      !["contas_receber", "parceiros"].includes(read.table)
    ),
  );
  const invalidSession = mockAdmin({ badAuth: true });
  await rejectsStatus(
    readOtherCreditCarnetDocument(request(), invalidSession.admin, PLAN_ID),
    401,
  );
});

Deno.test("documento deriva todos os títulos por FK do plano e não efetua mutações", async () => {
  const { admin, reads } = mockAdmin();
  const result = await readOtherCreditCarnetDocument(request(), admin, PLAN_ID);
  assert.equal(result.inputs.length, 2);
  assert.deepEqual(
    reads.find((read) => read.table === "contas_receber")?.filters,
    [["outros_creditos_plano_id", PLAN_ID]],
  );
  assert.ok(
    reads.every((read) =>
      !["matriculas", "turmas", "transacoes_pagamento"].includes(read.table)
    ),
  );
  assert.ok(
    result.inputs.every((input) =>
      input.financialTerms?.discount?.value === 20
    ),
  );
});
