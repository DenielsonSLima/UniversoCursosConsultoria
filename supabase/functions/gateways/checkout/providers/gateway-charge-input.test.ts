import assert from "node:assert/strict";
import { buildGatewayChargeInput } from "./gateway-charge-input.ts";

const context = (providerCode: string, method: string) => ({
  admin: {},
  supabaseUrl: "https://example.supabase.co",
  environment: "production",
  route: { providerCode, credentialId: null },
  charge: {
    method,
    value: 149.9,
    description: "Curso EAD",
    dueDate: "2026-09-08",
    installmentCount: 1,
  },
  aluno: {
    id: "aluno",
    nome: "Aluno Teste",
    email: "aluno@example.com",
    cpf_cnpj: "00000000000",
  },
}) as any;

Deno.test("checkout EAD habilita Pix pendente somente no BolePix Banese", () => {
  const receivable = { id: "receivable" };
  assert.equal(
    buildGatewayChargeInput(
      context("banese_card", "BOLETO"),
      receivable,
    ).allowPendingBolePix,
    true,
  );
  assert.equal(
    buildGatewayChargeInput(
      context("mercado_pago", "CREDIT_CARD"),
      receivable,
    ).allowPendingBolePix,
    false,
  );
  assert.equal(
    buildGatewayChargeInput(
      context("banese_card", "PIX"),
      receivable,
    ).allowPendingBolePix,
    false,
  );
});
