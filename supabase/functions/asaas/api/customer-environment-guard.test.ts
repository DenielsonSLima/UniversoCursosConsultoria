import assert from "node:assert/strict";
import {
  asaasCustomerCandidateIds,
  asaasCustomerMatchesDocument,
} from "./customer-environment-guard.ts";

Deno.test("cliente Asaas prioriza mapping do ambiente antes do id legado", () => {
  assert.deepEqual(
    asaasCustomerCandidateIds("cus_sandbox", "cus_production"),
    ["cus_sandbox", "cus_production"],
  );
  assert.deepEqual(
    asaasCustomerCandidateIds("cus_same", "cus_same"),
    ["cus_same"],
  );
});

Deno.test("cliente Asaas legado so e aceito quando pertence ao CPF do aluno", () => {
  assert.equal(
    asaasCustomerMatchesDocument(
      { id: "cus_ok", cpfCnpj: "123.456.789-09" },
      "12345678909",
    ),
    true,
  );
  assert.equal(
    asaasCustomerMatchesDocument(
      { id: "cus_wrong", cpfCnpj: "98765432100" },
      "12345678909",
    ),
    false,
  );
  assert.equal(asaasCustomerMatchesDocument(null, "12345678909"), false);
});
